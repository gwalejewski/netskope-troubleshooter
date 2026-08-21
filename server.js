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

  const url = `${cleanTenant}/api/v2/${endpoint}`;

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

app.listen(PORT, () => {
  console.log(`Netskope Troubleshooter backend listening on port ${PORT}`);
});
