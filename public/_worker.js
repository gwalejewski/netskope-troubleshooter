import { connect } from 'cloudflare:sockets';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // API Handlers
    if (path === "/api/diagnose/dns") {
      return handleApiDiagnoseDns(request, env);
    } else if (path === "/api/diagnose/ping") {
      return handleApiDiagnosePing(request, env);
    } else if (path === "/api/netskope/proxy" && request.method === "POST") {
      return handleApiNetskopeProxy(request, env);
    } else if (path === "/api/diagnose/search" && request.method === "POST") {
      return handleApiDiagnoseSearch(request, env);
    } else if (path === "/api/diagnose/env") {
      return new Response(JSON.stringify({
        has_tenant_url: !!env.NETSKOPE_TENANT_URL,
        has_api_token: !!env.NETSKOPE_API_TOKEN,
        has_mcp_key: !!env.NETSKOPE_MCP_SERVER_KEY,
        env_keys: Object.keys(env)
      }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    // Default Static Asset Handler (serves index.html, style.css, app.js)
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }
    return fetch(request);
  }
};

async function handleApiDiagnoseDns(request, env) {
  const url = new URL(request.url);
  const target = url.searchParams.get("target");
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing target parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  let hostname = target;
  try {
    if (target.includes("://")) {
      hostname = new URL(target).hostname;
    } else {
      hostname = target.split("/")[0].split(":")[0];
    }
  } catch (e) {}

  const resolveDns = async (name, type) => {
    try {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${name}&type=${type}`, {
        headers: { "Accept": "application/dns-json" }
      });
      const data = await res.json();
      return (data.Answer || []).map(record => record.data);
    } catch (err) {
      return [];
    }
  };

  try {
    const start = Date.now();
    const [ipv4, ipv6, mx, txt] = await Promise.all([
      resolveDns(hostname, 'A'),
      resolveDns(hostname, 'AAAA'),
      resolveDns(hostname, 'MX'),
      resolveDns(hostname, 'TXT')
    ]);
    const resolveTimeMs = Date.now() - start;

    return new Response(JSON.stringify({
      success: true,
      hostname,
      resolveTimeMs,
      records: {
        A: ipv4,
        AAAA: ipv6,
        MX: mx,
        TXT: txt
      }
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      hostname,
      error: err.message || "DNS lookup failed"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

async function handleApiDiagnosePing(request, env) {
  const url = new URL(request.url);
  const target = url.searchParams.get("target");
  const port = parseInt(url.searchParams.get("port") || "443", 10);
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing target parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  let hostname = target;
  try {
    if (target.includes("://")) {
      hostname = new URL(target).hostname;
    } else {
      hostname = target.split("/")[0].split(":")[0];
    }
  } catch (e) {}

  const start = Date.now();
  try {
    const socket = connect({ hostname, port });
    await socket.opened;
    const latency = Date.now() - start;
    await socket.close();

    return new Response(JSON.stringify({
      success: true,
      hostname,
      port,
      latencyMs: latency,
      message: `Successfully connected to ${hostname}:${port}`
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    try {
      const fetchStart = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const protocol = port === 80 ? 'http' : 'https';
      
      const res = await fetch(`${protocol}://${hostname}`, { 
        method: "HEAD", 
        signal: controller.signal 
      });
      clearTimeout(timeoutId);
      const latency = Date.now() - fetchStart;
      
      return new Response(JSON.stringify({
        success: true,
        hostname,
        port,
        latencyMs: latency,
        message: `HTTP HEAD check succeeded (HTTP ${res.status})`
      }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (fetchErr) {
      return new Response(JSON.stringify({
        success: false,
        hostname,
        port,
        error: err.message || fetchErr.message || "Connection failed"
      }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }
}

async function handleApiNetskopeProxy(request, env) {
  try {
    const reqData = await request.json();
    const tenantUrl = reqData.tenantUrl || env.NETSKOPE_TENANT_URL;
    const token = reqData.token || env.NETSKOPE_API_TOKEN;
    const endpoint = reqData.endpoint;
    const method = reqData.method || "GET";
    const body = reqData.body || null;

    if (!tenantUrl || !token || !endpoint) {
      return new Response(JSON.stringify({ 
        error: "Missing tenant configurations. Configure details in dashboard settings or Cloudflare environment variables." 
      }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    let cleanTenant = tenantUrl;
    if (!cleanTenant.startsWith("http://") && !cleanTenant.startsWith("https://")) {
      cleanTenant = `https://${cleanTenant}`;
    }
    cleanTenant = cleanTenant.replace(/\/+$/, "");

    let url;
    if (endpoint.startsWith("steelcase/") || endpoint.startsWith("mcp")) {
      const mcpKey = env.NETSKOPE_MCP_SERVER_KEY || "";
      const cleanEndpoint = endpoint
        .replace("{NETSKOPE_MCP_SERVER_KEY}", mcpKey)
        .replace("NETSKOPE_MCP_SERVER_KEY", mcpKey);
      
      if (cleanEndpoint === "mcp") {
        url = `${cleanTenant}/steelcase/${mcpKey}/mcp`;
      } else {
        const slashedEndpoint = cleanEndpoint.startsWith("/") ? cleanEndpoint : `/${cleanEndpoint}`;
        url = `${cleanTenant}${slashedEndpoint}`;
      }
    } else {
      url = `${cleanTenant}/api/v2/${endpoint}`;
    }

    const options = {
      method,
      headers: {
        "Netskope-API-Token": token,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    };

    if (body && ["POST", "PUT", "PATCH"].includes(method.toUpperCase())) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    
    let data;
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      data = await response.json();
    } else {
      data = { text: await response.text() };
    }

    if (!response.ok) {
      return new Response(JSON.stringify({
        success: false,
        status: response.status,
        error: data.error || data.message || "Error response from Netskope API",
        data
      }), {
        status: response.status,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      status: response.status,
      data
    }), {
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: err.message || "Failed to proxy request to Netskope"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

async function handleApiDiagnoseSearch(request, env) {
  try {
    const reqData = await request.json();
    const target = reqData.target;
    const description = reqData.description || "";
    if (!target) {
      return new Response(JSON.stringify({ error: "Missing target" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
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
    const descLower = description.toLowerCase();

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

    return new Response(JSON.stringify({
      success: true,
      query,
      source,
      snippets,
      curated: matchedCurated,
      requiredDomains
    }), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
