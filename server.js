import express from 'express';
import cors from 'cors';
import dns from 'dns';
import net from 'net';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// DNS resolution diagnostics
app.get('/api/diagnose/dns', async (req, res) => {
  const { target } = req.query;
  if (!target) {
    return res.status(400).json({ error: 'Missing target parameter' });
  }

  let hostname = target;
  try {
    if (target.includes('://')) {
      hostname = new URL(target).hostname;
    } else {
      hostname = target.split('/')[0].split(':')[0];
    }
  } catch (e) {
    // Fallback to query target
  }

  try {
    const start = Date.now();
    const ipv4 = await dns.promises.resolve4(hostname).catch(() => []);
    const ipv6 = await dns.promises.resolve6(hostname).catch(() => []);
    const mx = await dns.promises.resolveMx(hostname).catch(() => []);
    const txt = await dns.promises.resolveTxt(hostname).catch(() => []);
    const resolveTimeMs = Date.now() - start;

    if (ipv4.length === 0 && ipv6.length === 0) {
      throw new Error('No IP records resolved');
    }

    res.json({
      success: true,
      hostname,
      resolveTimeMs,
      records: {
        A: ipv4,
        AAAA: ipv6,
        MX: mx.map(r => `${r.exchange} (priority ${r.priority})`),
        TXT: txt.map(r => r.join(' '))
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      hostname,
      error: err.message || 'DNS lookup failed'
    });
  }
});

// Port connectivity & TCP ping diagnostics
app.get('/api/diagnose/ping', (req, res) => {
  const { target, port = 443 } = req.query;
  if (!target) {
    return res.status(400).json({ error: 'Missing target parameter' });
  }

  let hostname = target;
  try {
    if (target.includes('://')) {
      hostname = new URL(target).hostname;
    } else {
      hostname = target.split('/')[0].split(':')[0];
    }
  } catch (e) {
    // Fallback
  }

  const portNum = parseInt(port, 10);
  const start = Date.now();

  const socket = new net.Socket();
  socket.setTimeout(5000);

  socket.on('connect', () => {
    const latency = Date.now() - start;
    socket.destroy();
    res.json({
      success: true,
      hostname,
      port: portNum,
      latencyMs: latency,
      message: `Successfully connected to ${hostname}:${portNum}`
    });
  });

  socket.on('error', (err) => {
    socket.destroy();
    res.status(500).json({
      success: false,
      hostname,
      port: portNum,
      error: err.message || 'Connection failed'
    });
  });

  socket.on('timeout', () => {
    socket.destroy();
    res.status(504).json({
      success: false,
      hostname,
      port: portNum,
      error: 'Connection timed out'
    });
  });

  socket.connect(portNum, hostname);
});

// Proxy to Netskope API v2
app.post('/api/netskope/proxy', async (req, res) => {
  const { tenantUrl, token, endpoint, method = 'GET', body = null } = req.body;

  if (!tenantUrl || !token || !endpoint) {
    return res.status(400).json({ error: 'Missing required Netskope configuration fields: tenantUrl, token, endpoint' });
  }

  // Clean tenant URL
  let cleanTenant = tenantUrl;
  if (!cleanTenant.startsWith('http://') && !cleanTenant.startsWith('https://')) {
    cleanTenant = `https://${cleanTenant}`;
  }
  cleanTenant = cleanTenant.replace(/\/+$/, '');

  let url;
  if (endpoint.startsWith('steelcase/') || endpoint.startsWith('mcp')) {
    const mcpKey = process.env.NETSKOPE_MCP_SERVER_KEY || '';
    const cleanEndpoint = endpoint
      .replace('{NETSKOPE_MCP_SERVER_KEY}', mcpKey)
      .replace('NETSKOPE_MCP_SERVER_KEY', mcpKey);
    
    if (cleanEndpoint === 'mcp') {
      url = `${cleanTenant}/steelcase/${mcpKey}/mcp`;
    } else {
      const slashedEndpoint = cleanEndpoint.startsWith('/') ? cleanEndpoint : `/${cleanEndpoint}`;
      url = `${cleanTenant}${slashedEndpoint}`;
    }
  } else {
    url = `${cleanTenant}/api/v2/${endpoint}`;
  }

  try {
    const options = {
      method,
      headers: {
        'Netskope-API-Token': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (body && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    let data;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      data = await response.json();
    } else {
      data = { text: await response.text() };
    }

    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        status: response.status,
        error: data.error || data.message || 'Error response from Netskope API',
        data
      });
    }

    res.json({
      success: true,
      status: response.status,
      data
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to proxy request to Netskope'
    });
  }
});

// Web search crawler & knowledge engine
app.post('/api/diagnose/search', async (req, res) => {
  const { target, description } = req.body;
  if (!target) {
    return res.status(400).json({ error: 'Missing target' });
  }

  const query = `${target} ${description} ports firewall bypass netskope`.trim();
  let snippets = [];
  let source = "live_search";

  try {
    const response = await fetch('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    if (response.ok) {
      const html = await response.text();
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let match;
      while ((match = snippetRegex.exec(html)) !== null && snippets.length < 5) {
        let text = match[1]
          .replace(/<[^>]*>/g, '')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .trim();
        if (text) snippets.push(text);
      }
    }
  } catch (err) {
    console.error('Web search failed:', err.message);
  }

  // Curated knowledge base fallback
  const targetLower = target.toLowerCase();
  const descLower = (description || '').toLowerCase();

  const curatedDb = {
    wechat: [
      "WeChat file transfers and messages are routed to Tencent server endpoints: <code>file.wechat.com</code>, <code>szfile.wechat.com</code>, <code>szshort.wechat.com</code>, and <code>extshort.wechat.com</code>.",
      "WeChat desktop and mobile clients enforce strict Certificate Pinning. If Netskope SSL Decryption is active on these domains, file transfers and connections will fail with handshake timeouts.",
      "Required ports for WeChat operation: outbound TCP 80, 443, 8080 and UDP ports 8000-9000 (voice/video calls)."
    ],
    github: [
      "GitHub Desktop and CLI clients use native Git ssh/https protocols and do not trust corporate SSL interception certificates by default.",
      "Add <code>github.com</code> and <code>githubusercontent.com</code> to SSL Decryption Exceptions in Netskope to allow Git push/pull operations.",
      "Ensure outbound SSH traffic on TCP port 22 is steered correctly if SSH authentication is utilized."
    ],
    zoom: [
      "Zoom native apps utilize certificate pinning and UDP tunnels for latency optimization.",
      "Netskope rules should bypass SSL Decryption for <code>*.zoom.us</code>, <code>*.zoom.com</code>, and Zoom CDN gateways.",
      "Ensure firewall rules allow outbound UDP on ports 8801-8810 for real-time voice and video streams."
    ]
  };

  let matchedCurated = [];
  let requiredDomains = [];
  for (let key in curatedDb) {
    if (targetLower.includes(key) || descLower.includes(key)) {
      matchedCurated = curatedDb[key];
      if (key === 'wechat') {
        requiredDomains = ["wechat.com", "weixiang.com", "qq.com", "file.wechat.com", "szfile.wechat.com"];
      } else if (key === 'github') {
        requiredDomains = ["github.com", "githubusercontent.com"];
      } else if (key === 'zoom') {
        requiredDomains = ["zoom.us", "zoom.com"];
      }
      break;
    }
  }

  if (requiredDomains.length === 0) {
    requiredDomains = [targetLower];
  }

  if (snippets.length === 0) {
    snippets = matchedCurated.length > 0 ? matchedCurated : [
      `Search for "${target}" recommends verifying that the hostname is allowed in your web steering policies.`,
      "Ensure all required TCP and UDP destination ports are open on egress firewall gateways.",
      "Audit SSL Decryption settings to check if the target app requires certificate bypass exceptions."
    ];
    source = "curated_database";
  }

  res.json({
    success: true,
    query,
    source,
    snippets,
    curated: matchedCurated,
    requiredDomains
  });
});

app.listen(PORT, () => {
  console.log(`Netskope Troubleshooter backend listening on port ${PORT}`);
});
