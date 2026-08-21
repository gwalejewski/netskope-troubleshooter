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
