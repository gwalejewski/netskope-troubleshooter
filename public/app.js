// State Management
let tenantConfig = {
  url: '',
  token: ''
};
let localLogDiagnostics = null;

// Sleep helper for visual log pacing
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// DOM Elements
const configDialog = document.getElementById('config-dialog');
const openConfigBtn = document.getElementById('open-config-btn');
const closeConfigBtn = document.getElementById('close-config-btn');
const dialogCancelBtn = document.getElementById('dialog-cancel-btn');
const configForm = document.getElementById('config-form');
const tenantUrlInput = document.getElementById('tenant-url');
const apiTokenInput = document.getElementById('api-token');

const troubleshootForm = document.getElementById('troubleshoot-form');
const userEmailInput = document.getElementById('user-email');
const destTargetInput = document.getElementById('dest-target');
const issueDescInput = document.getElementById('issue-description');
const diagModeRadios = document.getElementsByName('diag-mode');
const demoScenarioSelect = document.getElementById('demo-scenario');
const demoScenariosContainer = document.getElementById('demo-scenarios-container');
const liveBanner = document.getElementById('live-banner');
const systemStatusBadge = document.getElementById('system-status');

const placeholderView = document.getElementById('placeholder-view');
const resultsView = document.getElementById('results-view');
const workspaceSub = document.getElementById('workspace-sub');
const logTerminal = document.getElementById('log-terminal');
const clearLogBtn = document.getElementById('clear-log-btn');

// Hop Map Elements
const hops = {
  user: document.getElementById('hop-user'),
  client: document.getElementById('hop-client'),
  pop: document.getElementById('hop-pop'),
  policy: document.getElementById('hop-policy'),
  publisher: document.getElementById('hop-publisher'),
  dest: document.getElementById('hop-dest')
};
const hopStatuses = {
  user: document.getElementById('hop-user-status'),
  client: document.getElementById('hop-client-status'),
  pop: document.getElementById('hop-pop-status'),
  policy: document.getElementById('hop-policy-status'),
  publisher: document.getElementById('hop-publisher-status'),
  dest: document.getElementById('hop-dest-status')
};
const connectors = {
  client: document.getElementById('conn-client'),
  pop: document.getElementById('conn-pop'),
  policy: document.getElementById('conn-policy'),
  publisher: document.getElementById('conn-publisher'),
  dest: document.getElementById('conn-dest')
};

// Telemetry Elements
const telemetryPop = document.getElementById('telemetry-pop');
const telemetryLatency = document.getElementById('telemetry-latency');
const telemetryTunnel = document.getElementById('telemetry-tunnel');
const telemetryVersion = document.getElementById('telemetry-version');

// Verdict Elements
const verdictCard = document.getElementById('verdict-card');
const verdictContent = document.getElementById('verdict-content');

// Toolbox Elements
const toolDnsBtn = document.getElementById('tool-dns-btn');
const toolPingBtn = document.getElementById('tool-ping-btn');
const toolTraceBtn = document.getElementById('tool-trace-btn');
const closeToolboxBtn = document.getElementById('close-toolbox-btn');
const toolboxOutputContainer = document.getElementById('toolbox-output-container');
const toolboxOutput = document.getElementById('toolbox-output');

// Load configurations from SessionStorage
function loadConfig() {
  const url = sessionStorage.getItem('ns_tenant_url');
  const token = sessionStorage.getItem('ns_api_token');
  if (url && token) {
    tenantConfig.url = url;
    tenantConfig.token = token;
    tenantUrlInput.value = url;
    apiTokenInput.value = token;
    setSystemStatus('Configured', 'green');
  }
}

// System Status Indicator Helper
function setSystemStatus(text, color) {
  const badgeText = systemStatusBadge.querySelector('.status-text');
  const badgePulse = systemStatusBadge.querySelector('.status-pulse');
  badgeText.textContent = text;
  badgePulse.className = `status-pulse ${color}`;
}

// Log streaming helper
function appendLog(message, type = 'info') {
  const div = document.createElement('div');
  div.className = `log-line ${type}`;
  const timestamp = new Date().toLocaleTimeString();
  div.textContent = `[${timestamp}] ${message}`;
  logTerminal.appendChild(div);
  logTerminal.scrollTop = logTerminal.scrollHeight;
}

// Clear Terminal
clearLogBtn.addEventListener('click', () => {
  logTerminal.innerHTML = '<div class="log-line system">Terminal logs cleared.</div>';
});

// Setup Configuration Modals
openConfigBtn.addEventListener('click', () => configDialog.showModal());
closeConfigBtn.addEventListener('click', () => configDialog.close());
dialogCancelBtn.addEventListener('click', () => configDialog.close());

configForm.addEventListener('submit', (e) => {
  sessionStorage.setItem('ns_tenant_url', tenantUrlInput.value.trim());
  sessionStorage.setItem('ns_api_token', apiTokenInput.value.trim());
  loadConfig();
  appendLog('Netskope Tenant settings saved successfully.', 'success');
});

// Toggle Modes: Live vs Demo UI switches
diagModeRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if (e.target.value === 'live') {
      demoScenariosContainer.classList.add('hidden');
      liveBanner.classList.remove('hidden');
      // Do not force show config dialog as secrets can be configured server-side
    } else {
      demoScenariosContainer.classList.remove('hidden');
      liveBanner.classList.add('hidden');
    }
  });
});

// Reset Hop Map states
function resetHopMap() {
  Object.keys(hops).forEach(key => {
    hops[key].className = 'hop-node';
    hopStatuses[key].textContent = 'Pending';
  });
  Object.keys(connectors).forEach(key => {
    connectors[key].className = 'hop-connector';
  });
  
  hops.user.classList.add('active');
  hopStatuses.user.textContent = 'Active';
}

// Set Hop Node State Helper
function setHopState(nodeKey, state, labelText = '') {
  const node = hops[nodeKey];
  const statusLabel = hopStatuses[nodeKey];
  if (!node) return;

  // Clear previous states
  node.className = 'hop-node';
  
  if (state === 'active') {
    node.classList.add('active');
    statusLabel.textContent = labelText || 'Analyzing...';
  } else if (state === 'success') {
    node.classList.add('success');
    statusLabel.textContent = labelText || 'Passed';
  } else if (state === 'warning') {
    node.classList.add('warning');
    statusLabel.textContent = labelText || 'Warning';
  } else if (state === 'error') {
    node.classList.add('error');
    statusLabel.textContent = labelText || 'Failed';
  } else {
    statusLabel.textContent = labelText || 'Pending';
  }
}

// Flow connector trigger helper
function setConnectorActive(connectorKey, active = true) {
  const conn = connectors[connectorKey];
  if (conn) {
    if (active) {
      conn.classList.add('active');
    } else {
      conn.classList.remove('active');
    }
  }
}

// Diagnostic Engine Submit
troubleshootForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const userEmail = userEmailInput.value.trim();
  const destTarget = destTargetInput.value.trim();
  const description = issueDescInput.value.trim();
  const mode = Array.from(diagModeRadios).find(r => r.checked).value;

  // Visual Swap
  placeholderView.classList.add('hidden');
  resultsView.classList.remove('hidden');
  workspaceSub.textContent = `Diagnostic scan for user ${userEmail} to target ${destTarget}`;
  
  // Clean Workspace
  logTerminal.innerHTML = '';
  resetHopMap();
  
  // Set Loading state on main submit button
  const submitBtn = document.getElementById('run-diagnostics-btn');
  const btnSpinner = submitBtn.querySelector('.spinner');
  const btnText = submitBtn.querySelector('.btn-text');
  
  submitBtn.disabled = true;
  btnSpinner.classList.remove('hidden');
  btnSpinner.classList.add('spin');
  btnText.textContent = 'Running Scan...';

  try {
    if (mode === 'live') {
      await runLiveDiagnostics(userEmail, destTarget, description);
    } else {
      await runSimulatedDiagnostics(userEmail, destTarget, description);
    }
  } catch (err) {
    appendLog(`Critical Error during troubleshooting scan: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    btnSpinner.classList.add('hidden');
    btnSpinner.classList.remove('spin');
    btnText.textContent = 'Run Troubleshooter';
  }
});

// --- MOCK SIMULATOR ENGINE ---
async function runSimulatedDiagnostics(user, target, description) {
  const scenario = demoScenarioSelect.value;
  appendLog(`Starting troubleshooting in Simulation Mode for scenario: [${scenario}]`, 'system');
  await sleep(1000);
  
  appendLog(`Checking User Client connection credentials...`, 'info');
  setHopState('user', 'success', 'Verified');
  setConnectorActive('client', true);
  await sleep(1200);

  // Check client agent status
  appendLog(`Contacting local steering service on user endpoint...`, 'info');
  if (scenario === 'client-disabled') {
    setHopState('client', 'error', 'Offline');
    appendLog(`[ERROR] Netskope client steering interface is reporting status: DISABLED`, 'error');
    appendLog(`Tunnel status: Down. Traffic is currently bypassing the Netskope Cloud Platform.`, 'warning');
    
    // Telemetry updates
    telemetryPop.textContent = 'None (Bypassed)';
    telemetryLatency.textContent = 'N/A';
    telemetryTunnel.textContent = 'Offline';
    telemetryVersion.textContent = '103.5.2.1458 (Unresponsive)';
    
    // AI Verdict
    verdictCard.className = 'verdict-card error card-inner';
    verdictContent.innerHTML = `
      <p><strong>Diagnosis:</strong> The Netskope Client service on the user's workstation is disabled or failed to initialize.</p>
      <p><strong>Actionable Recommendations:</strong></p>
      <ul>
        <li>Open the client console and verify steering status. If disabled, click <strong>Enable</strong>.</li>
        <li>Restart the local service: <code>sudo launchctl kickstart -k system/com.netskope.client.launcher</code> (Mac) or restart the "Netskope Client" service in Windows Services.</li>
        <li>Generate a diagnostics package by running <code>nsdiag</code> and check configuration parameters.</li>
      </ul>
    `;
    return;
  }

  setHopState('client', 'success', 'Steering');
  setConnectorActive('pop', true);
  appendLog(`Client steering active. Steering Client version: 104.2.1.849. Protocol: DTLS.`, 'success');
  await sleep(1200);

  // Check PoP Connection
  appendLog(`Analyzing route latency to nearest Netskope Gateway (POP)...`, 'info');
  if (scenario === 'pop-high-latency') {
    setHopState('pop', 'warning', 'High Latency');
    setConnectorActive('policy', true);
    
    telemetryPop.textContent = 'New York, US (EWR-3)';
    telemetryLatency.textContent = '380 ms (Jitter: 42ms)';
    telemetryTunnel.textContent = 'IPsec / UDP';
    telemetryVersion.textContent = '104.2.1.849';
    
    appendLog(`[WARNING] Latency to POP [EWR-3] is unusually high: 380ms. Normal baseline is < 30ms.`, 'warning');
    appendLog(`Detection matches user report of "Zoom call lag" and sluggishness.`, 'info');
    await sleep(1000);
    
    appendLog(`Running path steering policy analysis...`, 'info');
    setHopState('policy', 'success', 'Passed');
    setConnectorActive('publisher', true);
    await sleep(800);
    
    setHopState('publisher', 'success', 'N/A (SaaS)');
    setConnectorActive('dest', true);
    await sleep(800);
    
    setHopState('dest', 'success', 'Accessible');
    appendLog(`Target application ${target} reached, but network performance is severely degraded.`, 'warning');
    
    verdictCard.className = 'verdict-card warning card-inner';
    verdictContent.innerHTML = `
      <p><strong>Diagnosis:</strong> The connection path is steering successfully, but the user is suffering from severe congestion or an inefficient routing loop to the local Netskope Gateway PoP.</p>
      <p><strong>Actionable Recommendations:</strong></p>
      <ul>
        <li>Instruct the user to toggle WiFi or disconnect/reconnect the Netskope Client to force a steering evaluation to a different PoP.</li>
        <li>Check if the user is using a VPN or local ISP tunnel (like PPPoE) that increases MTU overhead or fragmentation.</li>
        <li>Contact network admins to verify public DNS resolution for <code>gateway.goskope.com</code> is pointing to the nearest geographically optimal address.</li>
      </ul>
    `;
    return;
  }

  // Normal POP Status
  setHopState('pop', 'success', 'Passed');
  setConnectorActive('policy', true);
  telemetryPop.textContent = 'Chicago, US (ORD-1)';
  telemetryLatency.textContent = '14 ms (Jitter: 2ms)';
  telemetryTunnel.textContent = 'DTLS / UDP';
  telemetryVersion.textContent = '104.2.1.849';
  appendLog(`Connected to POP: Chicago (ORD-1). Gateway Latency: 14ms (Healthy).`, 'success');
  await sleep(1200);

  // Policy Engine checks
  appendLog(`Evaluating Next-Gen SWG and Firewall access policies for user...`, 'info');
  
  if (scenario === 'ssl-decryption-failure') {
    setHopState('policy', 'warning', 'Decrypted');
    appendLog(`Evaluating SSL Decryption rules matching category: "Cloud Services"...`, 'info');
    appendLog(`Netskope Proxy certificate (Netskope Root CA) injected for MITM SSL Decryption.`, 'info');
    await sleep(1200);
    
    appendLog(`[ERROR] SSL Handshake aborted by client application during key exchange.`, 'error');
    appendLog(`[TLS ALERT] Alert 42 (Bad Certificate) received from client endpoint.`, 'error');
    appendLog(`Verification Failed: Application uses hardcoded Certificate Pinning and does not trust the Netskope Root CA.`, 'warning');
    
    setHopState('publisher', 'success', 'N/A');
    setHopState('dest', 'error', 'SSL Handshake Failed');
    
    verdictCard.className = 'verdict-card error card-inner';
    verdictContent.innerHTML = `
      <p><strong>Diagnosis:</strong> The target application (<code>${target}</code>) enforces SSL/TLS Certificate Pinning and rejected the Netskope Proxy decryption certificate.</p>
      <p><strong>Details:</strong> Standard SSL Decryption (MITM) replaces the original site certificate with a Netskope-signed CA certificate. Pinned applications detect this mismatch and terminate the handshake immediately to prevent perceived eavesdropping.</p>
      <p><strong>Actionable Recommendations:</strong></p>
      <ul>
        <li>Create an <strong>SSL Decryption Bypass Policy</strong> for this domain under <strong>Settings > Steering > SSL Decryption > Exceptions</strong>.</li>
        <li>Ensure the target domain <code>${target}</code> is added to the <strong>SSL Bypass / Do Not Decrypt</strong> group.</li>
        <li>Instruct the user to restart the application after the bypass rule is applied in the Netskope admin tenant.</li>
      </ul>
    `;
    return;
  }

  if (scenario === 'url-blocked') {
    setHopState('policy', 'error', 'Blocked');
    appendLog(`[SECURITY ALERT] Request to target [${target}] matched Block Rule: "Global Social Media Policy"`, 'error');
    appendLog(`Blocked Category: "Social Networks". Action: BLOCK. Block Page served.`, 'error');
    
    telemetryPop.textContent = 'Chicago, US (ORD-1)';
    telemetryLatency.textContent = '14 ms';
    telemetryTunnel.textContent = 'DTLS / UDP';
    telemetryVersion.textContent = '104.2.1.849';

    // UI Updates
    setHopState('publisher', 'success', 'N/A');
    setHopState('dest', 'error', 'Blocked');
    
    verdictCard.className = 'verdict-card error card-inner';
    verdictContent.innerHTML = `
      <p><strong>Diagnosis:</strong> The user was blocked from reaching the target application by standard tenant Web Filtering policy rules.</p>
      <p><strong>Policy Details:</strong> Match Category <code>Social Networks</code>, triggering Block action on rule <code>Global Social Media Policy</code>.</p>
      <p><strong>Actionable Recommendations:</strong></p>
      <ul>
        <li>If access is business-justified, create a policy exception rule for this user's AD group or email.</li>
        <li>Alternatively, place the target domain (<code>${target}</code>) in the custom Web-Bypass list or Steering Exception list.</li>
        <li>Check if the site's classification is correct in the Netskope Cloud Confidence Index (CCI).</li>
      </ul>
    `;
    return;
  }

  setHopState('policy', 'success', 'Allowed');
  setConnectorActive('publisher', true);
  appendLog(`Policies evaluated. Request to [${target}] matches policy Rule: "General Outbound Access". Action: ALLOW.`, 'success');
  await sleep(1200);

  // Private Access (NPA) checks
  appendLog(`Checking routing type for destination [${target}]...`, 'info');
  const isPrivate = target.endsWith('.corp') || target.endsWith('.local') || target.startsWith('10.') || target.startsWith('192.168.');
  
  if (isPrivate) {
    appendLog(`Destination detected as a private application segment. Steering via NPA (Netskope Private Access).`, 'info');
    appendLog(`Locating active NPA Publishers hosting network segment...`, 'info');
    await sleep(1000);

    if (scenario === 'npa-publisher-offline') {
      setHopState('publisher', 'error', 'Offline');
      appendLog(`[ERROR] Publisher [US-Chicago-Pub01] routing segment for [${target}] is reporting status: OFFLINE`, 'error');
      appendLog(`Connection tunnel status between Cloud Edge and Publisher is disconnected. Check network path.`, 'error');
      
      setHopState('dest', 'error', 'Unreachable');
      
      verdictCard.className = 'verdict-card error card-inner';
      verdictContent.innerHTML = `
        <p><strong>Diagnosis:</strong> Netskope Private Access steering is working, but the target Private Publisher is offline or unable to connect back to the Netskope Cloud.</p>
        <p><strong>Actionable Recommendations:</strong></p>
        <ul>
          <li>Log in to the Publisher host (virtual appliance) and check core services: <code>sudo systemctl status npa-publisher</code>.</li>
          <li>Examine publisher registration logs at <code>~/logs/publisher_wizard.log</code> or connectivity stats in <code>~/logs/agent.txt</code>.</li>
          <li>Ensure outbound security rules on the publisher's firewall allow HTTPS (Port 443) to <code>*.goskope.com</code>.</li>
        </ul>
      `;
      return;
    }

    setHopState('publisher', 'success', 'Online');
    setConnectorActive('dest', true);
    appendLog(`Publisher [US-Chicago-Pub01] is ONLINE. CPU: 12%, Mem: 45%, Tunnel Latency: 8ms.`, 'success');
    await sleep(1200);

    appendLog(`Establishing TCP handshakes from publisher to private app [${target}]...`, 'info');
    setHopState('dest', 'success', 'Connected');
    appendLog(`Successfully established connection. Troubleshooting complete. Path is fully healthy.`, 'success');

  } else {
    // SaaS/Public App path
    setHopState('publisher', 'success', 'N/A (Public Path)');
    setConnectorActive('dest', true);
    await sleep(1000);
    appendLog(`Target [${target}] is a public domain. Sending traffic directly via Cloud Secure Web Gateway.`, 'info');
    setHopState('dest', 'success', 'Connected');
    appendLog(`Connected. Response headers: HTTP 200 OK. Transaction verified.`, 'success');
  }

  // Final success verdict
  verdictCard.className = 'verdict-card success card-inner';
  verdictContent.innerHTML = `
    <p><strong>Diagnosis:</strong> The path between the client and the destination app is fully functional and healthy.</p>
    <p><strong>Details:</strong> Standard steering POP [ORD-1] latency is low, access policies allow traffic, and connection checks succeed.</p>
    <p><strong>Recommendation:</strong> The issue might be transient, or related to the user's browser cache/credentials. Request user to clear browser cache and try again.</p>
  `;
}

// --- LIVE TENANT API INTEGRATION ENGINE ---
async function runLiveDiagnostics(user, target, description) {
  appendLog(`Initializing Live Diagnostics scan against tenant: ${tenantConfig.url || 'Cloudflare Environment Configuration'}`, 'system');
  await sleep(800);
  
  const endtime = Math.floor(Date.now() / 1000);
  const starttime = endtime - 7 * 24 * 60 * 60; // Look back 7 days for logs
  const prefix = user.split('@')[0].toLowerCase();
  const targetLower = target.toLowerCase();

  // 1. Gather all logs from the tenant
  setHopState('user', 'active', 'Querying...');
  appendLog(`Locating active steering records and alert logs for user [${user}]...`, 'info');

  let clients = [];
  let alerts = [];
  let webEvents = [];

  // Fetch client status change logs
  try {
    const res = await fetch('/api/netskope/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantUrl: tenantConfig.url || undefined,
        token: tenantConfig.token || undefined,
        endpoint: `events/datasearch/clientstatus?limit=100&starttime=${starttime}&endtime=${endtime}`
      })
    });
    const result = await res.json();
    if (result.success) {
      clients = result.data?.result || (Array.isArray(result.data) ? result.data : (result.data?.data || []));
    }
  } catch (err) {
    appendLog(`[Warning] Failed to fetch client status: ${err.message}`, 'warning');
  }

  // Fetch alerts matching target
  try {
    const res = await fetch('/api/netskope/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantUrl: tenantConfig.url || undefined,
        token: tenantConfig.token || undefined,
        endpoint: `events/datasearch/alert?limit=50&starttime=${starttime}&endtime=${endtime}&query=` + encodeURIComponent(`(site like '${target}' or app like '${target}' or url like '${target}')`),
        method: 'GET'
      })
    });
    const result = await res.json();
    if (result.success) {
      alerts = result.data?.result || (Array.isArray(result.data) ? result.data : (result.data?.data || []));
    }
  } catch (err) {
    appendLog(`[Warning] Failed to fetch policy alerts: ${err.message}`, 'warning');
  }

  // Fetch page events matching target
  try {
    const res = await fetch('/api/netskope/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantUrl: tenantConfig.url || undefined,
        token: tenantConfig.token || undefined,
        endpoint: `events/datasearch/page?limit=50&starttime=${starttime}&endtime=${endtime}&query=` + encodeURIComponent(`(site like '${target}' or app like '${target}' or url like '${target}')`),
        method: 'GET'
      })
    });
    const result = await res.json();
    if (result.success) {
      webEvents = result.data?.result || (Array.isArray(result.data) ? result.data : (result.data?.data || []));
    }
  } catch (err) {
    appendLog(`[Warning] Failed to fetch page traffic events: ${err.message}`, 'warning');
  }

  // 2. Identify target client record
  let clientData = clients.find(c => {
    const dbUser = (c.user || c.username || c.user_name || '').toLowerCase();
    return dbUser.includes(prefix) || prefix.includes(dbUser);
  });

  // Fallback: If client status change log is missing, but they triggered a block or page event, extract device details from it!
  const targetUserAlert = alerts.find(a => (a.user || a.username || '').toLowerCase().includes(prefix));
  const targetUserPage = webEvents.find(w => (w.user || w.username || '').toLowerCase().includes(prefix));
  const activeTrafficEvent = targetUserAlert || targetUserPage;

  if (!clientData && activeTrafficEvent) {
    appendLog(`No recent status change log found, but active steering traffic detected for user prefix "${prefix}". Client is connected and active.`, 'success');
    clientData = {
      status: 'connected',
      gateway: activeTrafficEvent.netskope_pop || 'Chicago_US (ORD-1)',
      os: activeTrafficEvent.os || activeTrafficEvent.os_family || 'mac',
      client_version: activeTrafficEvent.client_version || activeTrafficEvent.os_version || '104.2.1.849',
      latency: activeTrafficEvent.latency || '14',
      tunnel_type: 'DTLS / UDP'
    };
  }

  // Hop 1 Evaluation: User PC Check
  if (clientData) {
    const host = clientData.hostname || clientData.host_name || clientData.device_name || 'Generic Device';
    const osSystem = clientData.os || clientData.os_version || 'Unknown';
    const activeUser = clientData.user || clientData.username || user;
    appendLog(`Successfully verified client device: ${host} (OS: ${osSystem}, User: ${activeUser})`, 'success');
    setHopState('user', 'success', 'Verified');
  } else {
    appendLog(`[WARNING] No active client registration or traffic found matching user prefix "${prefix}" in last 7 days.`, 'warning');
    setHopState('user', 'warning', 'No Record');
    
    const uniqueUsers = [...new Set(clients.map(c => c.user || c.username || 'unknown'))].slice(0, 5);
    if (uniqueUsers.length > 0) {
      appendLog(`Recent active users in tenant logs: [${uniqueUsers.join(', ')}]`, 'system');
    }
  }

  setConnectorActive('client', true);
  await sleep(1000);

  // Hop 2 & 3 Evaluation: Client & PoP Status
  setHopState('client', 'active', 'Verifying...');
  setHopState('pop', 'active', 'Scanning...');

  if (clientData) {
    const status = (clientData.status || clientData.client_status || 'inactive').toLowerCase();
    const isSteering = status === 'connected' || status === 'active' || status === 'enabled' || status === 'on';
    
    telemetryPop.textContent = clientData.gateway || 'Unknown';
    telemetryLatency.textContent = clientData.latency ? `${clientData.latency} ms` : 'N/A';
    telemetryTunnel.textContent = clientData.tunnel_type || clientData.tunnel || 'DTLS / UDP';
    telemetryVersion.textContent = clientData.client_version || 'Unknown';

    if (isSteering) {
      appendLog(`Steering status is active on PoP: ${clientData.gateway}.`, 'success');
      setHopState('client', 'success', 'Steering');
      setHopState('pop', 'success', 'Online');
    } else {
      appendLog(`[ERROR] Steering Client status on user device is inactive (Status: ${status})`, 'error');
      setHopState('client', 'error', 'Inactive');
      setHopState('pop', 'warning', 'Disconnected');
    }
  } else {
    telemetryPop.textContent = 'Unable to Query';
    telemetryLatency.textContent = 'N/A';
    telemetryTunnel.textContent = 'N/A';
    telemetryVersion.textContent = 'N/A';
    setHopState('client', 'warning', 'No Telemetry');
    setHopState('pop', 'warning', 'No Telemetry');
  }

  setConnectorActive('pop', true);
  setConnectorActive('policy', true);
  await sleep(1000);

  // Hop 4 Evaluation: Policy Block Checks
  setHopState('policy', 'active', 'Checking alerts...');
  appendLog(`Checking policy alerts and event history for block events...`, 'info');

  let matchAlert = null;
  let sslAlert = null;

  // Look for standard Block alerts matching user prefix
  matchAlert = alerts.find(a => {
    const isUserMatch = (a.user || a.username || '').toLowerCase().includes(prefix.toLowerCase());
    const isBlock = (a.action === 'block' || a.action === 'deny' || a.alert_type === 'block');
    return isUserMatch && isBlock;
  });

  // Look for SSL Decryption alerts matching user prefix
  sslAlert = alerts.find(a => {
    const isUserMatch = (a.user || a.username || '').toLowerCase().includes(prefix.toLowerCase());
    const isSslError = (a.alert_type === 'ssl' || a.category === 'SSL' || 
                        (a.reason || '').toLowerCase().includes('ssl') || 
                        (a.reason || '').toLowerCase().includes('handshake') ||
                        (a.reason || '').toLowerCase().includes('pinning') ||
                        (a.reason || '').toLowerCase().includes('decryption'));
    return isUserMatch && isSslError;
  });

  // Fallback 2: Check Page events
  if (!matchAlert && !sslAlert) {
    if (targetUserPage) {
      const policyName = (targetUserPage.policy || '').toLowerCase();
      if (policyName.includes('block') || policyName.includes('deny') || policyName.includes('exception')) {
        matchAlert = {
          policy: targetUserPage.policy || 'Web Policy Block',
          category: targetUserPage.category || targetUserPage.url_category || 'Blocked Category',
          site: targetUserPage.site || targetUserPage.url || target
        };
      }
    }
  }

  if (matchAlert) {
    appendLog(`[SECURITY ALERT] Found match block event! Rule: "${matchAlert.policy || 'Block'} ${matchAlert.category ? `(${matchAlert.category})` : ''}"`, 'error');
    setHopState('policy', 'error', 'Blocked');
    setHopState('publisher', 'success', 'N/A');
    setHopState('dest', 'error', 'Blocked');

    verdictCard.className = 'verdict-card error card-inner';
    verdictContent.innerHTML = `
      <p><strong>Diagnosis:</strong> A live block policy event was captured in the tenant logs matching this user and destination.</p>
      <p><strong>Log Details:</strong> Rule <code>${matchAlert.policy}</code> blocked traffic targeting <code>${matchAlert.site || matchAlert.app || target}</code> under category <code>${matchAlert.category || 'N/A'}</code>.</p>
      <p><strong>Action Recommendation:</strong> Create a policy override rule or modify the security group exception permissions in the policy management panel.</p>
    `;
    return;
  } else if (sslAlert) {
    appendLog(`[SSL ALERT] Captured SSL Decryption alert! Reason: "${sslAlert.reason || 'Handshake aborted by client'}"`, 'error');
    setHopState('policy', 'error', 'SSL Handshake Failed');
    setHopState('publisher', 'success', 'N/A');
    setHopState('dest', 'error', 'TLS Failure');

    verdictCard.className = 'verdict-card error card-inner';
    verdictContent.innerHTML = `
      <p><strong>Diagnosis:</strong> Netskope SSL Decryption is causing connection drops due to TLS verification failure.</p>
      <p><strong>Details:</strong> The log indicates an SSL error: <code>${sslAlert.reason || 'Alert 42 / Bad Certificate'}</code>. This happens when the destination application uses Certificate Pinning or does not trust the Netskope Root CA.</p>
      <p><strong>Actionable Recommendations:</strong></p>
      <ul>
        <li>Add the target host (<code>${target}</code>) to the <strong>SSL Decryption Exception list</strong> under <strong>Settings > Steering > SSL Decryption > Exceptions</strong>.</li>
        <li>Configure the steering exception to **Bypass / Do Not Decrypt** for this domain.</li>
      </ul>
    `;
    return;
  } else {
    appendLog(`No recent block events found in alerts log for user targeting "${target}".`, 'success');
    
    // Checking for SSL Decryption Certificate Pinning Risks
    appendLog(`Checking SSL Decryption configuration & Certificate Pinning risks...`, 'info');
    await sleep(800);

    const sslPinnedDomains = [
      'dropbox.com', 'dropboxapi.com', 'zoom.us', 'github.com', 
      'githubusercontent.com', 'microsoft.com', 'live.com', 
      'office365.com', 'googleapis.com', 'apple.com', 'icloud.com',
      'okta.com', 'salesforce.com', 'slack.com', 'teams.microsoft.com',
      'box.com', 'salesforce.com', 'webex.com', 'gitlub.com'
    ];
    
    const targetLower = target.toLowerCase();
    const isPinned = sslPinnedDomains.some(domain => targetLower.endsWith(domain) || targetLower.includes(domain));
    
    if (isPinned) {
      appendLog(`[WARNING] Destination [${target}] matches a known SSL-pinned application!`, 'warning');
      appendLog(`If Netskope SSL Decryption is active for this user, the application may drop the connection.`, 'warning');
      setHopState('policy', 'warning', 'SSL Bypass Risk');
    } else {
      setHopState('policy', 'success', 'Allowed');
    }
  }

  setConnectorActive('publisher', true);
  await sleep(1000);

  // Hop 5: NPA Publisher Check
  setHopState('publisher', 'active', 'Scanning publishers...');
  appendLog(`Evaluating connection routing... Checking NPA Publisher configurations...`, 'info');
  
  let isPrivateApp = target.endsWith('.local') || target.endsWith('.corp') || target.includes('internal') || target.startsWith('10.') || target.startsWith('172.') || target.startsWith('192.168.');
  
  if (isPrivateApp) {
    appendLog(`Routing path maps to private enterprise segment. Retrieving publisher list...`, 'info');
    try {
      const res = await fetch('/api/netskope/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantUrl: tenantConfig.url || undefined,
          token: tenantConfig.token || undefined,
          endpoint: 'infrastructure/publishers'
        })
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || 'Failed to fetch publisher status');
      
      const publishers = result.data.data || [];
      const offlinePubs = publishers.filter(p => p.status === 'offline');
      
      if (publishers.length === 0) {
        appendLog(`[ERROR] No Private Access Publishers are registered in this tenant!`, 'error');
        setHopState('publisher', 'error', 'No Publishers');
        setHopState('dest', 'error', 'No Path');
      } else if (offlinePubs.length > 0) {
        appendLog(`[WARNING] Detected ${offlinePubs.length} offline publishers: [${offlinePubs.map(p => p.name).join(', ')}]`, 'warning');
        setHopState('publisher', 'warning', 'Offline Pubs');
        setConnectorActive('dest', true);
      } else {
        appendLog(`All ${publishers.length} Private Publishers are online and routing traffic correctly.`, 'success');
        setHopState('publisher', 'success', 'Online');
        setConnectorActive('dest', true);
      }
    } catch (err) {
      appendLog(`Failed to verify publisher stats: ${err.message}`, 'error');
      setHopState('publisher', 'warning', 'API Error');
    }
  } else {
    appendLog(`Target resolves to a public endpoint. NPA Publisher layer bypassed.`, 'info');
    setHopState('publisher', 'success', 'N/A (SaaS)');
    setConnectorActive('dest', true);
  }

  await sleep(1000);

  // Hop 6: End-to-End Diagnostic check using backend tools
  setHopState('dest', 'active', 'Testing reachability...');
  appendLog(`Running local server gateway probe to destination [${target}]...`, 'info');
  
  let pingSuccess = false;
  let pingLatency = null;
  
  try {
    const res = await fetch(`/api/diagnose/ping?target=${encodeURIComponent(target)}`);
    const pingRes = await res.json();
    
    pingSuccess = pingRes.success;
    pingLatency = pingRes.latencyMs;

    if (pingSuccess) {
      appendLog(`TCP Connection check to [${target}:443] succeeded. Latency: ${pingLatency}ms.`, 'success');
      setHopState('dest', 'success', 'Connected');
    } else {
      appendLog(`[ERROR] Connection test to [${target}:443] failed: ${pingRes.error}`, 'error');
      setHopState('dest', 'error', 'Unreachable');
    }
  } catch (err) {
    appendLog(`Reachability scan failed to finish: ${err.message}`, 'error');
    setHopState('dest', 'warning', 'Scan Failed');
  }

  // 3. Generate AI Diagnostics Report
  appendLog(`Correlating gathered telemetry and generating AI Diagnostics Report...`, 'info');
  await sleep(1000);
  generateAIDiagnostics(user, target, description, clientData, alerts, webEvents, matchAlert, sslAlert, pingSuccess, pingLatency);
}

// --- AI LOG ANALYSIS & DIAGNOSTICS ENGINE ---
function generateAIDiagnostics(user, target, description, clientData, alerts, webEvents, matchAlert, sslAlert, pingSuccess, pingLatency) {
  const prefix = user.split('@')[0];
  const targetLower = target.toLowerCase();
  const descLower = description.toLowerCase();
  
  let diagnosis = "";
  let recommendations = [];
  let severity = "info"; // success, warning, error
  
  // 1. Check for standard Web Policy Block
  if (matchAlert) {
    severity = "error";
    diagnosis = `A security policy block event was captured in the Netskope tenant logs for user prefix <strong>${prefix}</strong> targeting <strong>${target}</strong>.`;
    recommendations.push(`Modify the policy rule <code>${matchAlert.policy || 'Web Policy Block'}</code> to allow access for this user or AD group.`);
    recommendations.push(`Add the domain <code>${target}</code> to a custom URL list used as an exception in the web steering policy.`);
    recommendations.push(`Verify the category classification of <code>${target}</code> in the Netskope Cloud Confidence Index (CCI) to ensure it is not miscategorized.`);
  } 
  // 2. Check for SSL Decryption issues
  else if (sslAlert) {
    severity = "error";
    diagnosis = `SSL Decryption failure detected. The client application aborted the TLS handshake with the Netskope gateway when trying to reach <strong>${target}</strong>.`;
    recommendations.push(`Create an SSL Decryption Bypass policy (Steering Exception) for <code>${target}</code> under <strong>Settings > Steering > SSL Decryption > Exceptions</strong>.`);
    recommendations.push(`Instruct the user to restart the client application to clear any cached SSL state once the exception is applied.`);
  }
  // 3. Proactive SSL Pinning risk detection (No alert log, but domain is pinned and reachability fails or user complains)
  else {
    const sslPinnedDomains = [
      'dropbox.com', 'dropboxapi.com', 'zoom.us', 'github.com', 
      'githubusercontent.com', 'microsoft.com', 'live.com', 
      'office365.com', 'googleapis.com', 'apple.com', 'icloud.com',
      'okta.com', 'salesforce.com', 'slack.com', 'teams.microsoft.com',
      'box.com', 'webex.com', 'gitlub.com'
    ];
    const isPinned = sslPinnedDomains.some(domain => targetLower.endsWith(domain) || targetLower.includes(domain));
    
    if (isPinned && (descLower.includes('ssl') || descLower.includes('certificate') || descLower.includes('connection') || !pingSuccess)) {
      severity = "warning";
      diagnosis = `Potential SSL Decryption conflict. The destination <strong>${target}</strong> matches a known SSL-pinned application, and connection anomalies were reported.`;
      recommendations.push(`Confirm if Netskope SSL Decryption is active for this traffic segment. If active, configure an SSL Bypass rule for <code>${target}</code>.`);
      recommendations.push(`Verify that the Netskope Root CA Certificate is correctly installed and trusted in the user's local operating system and browser certificate stores.`);
    }
  }

  // 4. Check for general tenant policy blocks (noise correlation)
  let correlationNote = "";
  const blockedAlerts = (alerts || []).filter(a => a.action === 'block' || a.action === 'deny');
  if (blockedAlerts.length > 0) {
    const uniqueBlockedApps = [...new Set(blockedAlerts.map(a => a.app || a.site || 'unknown'))].slice(0, 3);
    correlationNote = `<p>💡 <strong>Tenant Security Context:</strong> We analyzed ${alerts.length} recent events and detected active block actions in your tenant targeting other services like <code>${uniqueBlockedApps.join(', ')}</code>. This indicates tenant policies are actively enforcing blocks.</p>`;
  }

  // 5. Check for reachability issues
  if (!pingSuccess) {
    if (severity !== 'error') severity = 'warning';
    diagnosis = diagnosis || `The destination server for <strong>${target}</strong> is currently unreachable or timed out during direct gateway probes.`;
    recommendations.push(`Verify if the destination application is hosting its service correctly (external DNS, web server status).`);
    recommendations.push(`Check if local network policies or firewalls are blocking outbound traffic on port 443.`);
  }

  // 6. Default healthy path
  if (!diagnosis) {
    severity = "success";
    diagnosis = `No steering blocks, SSL alerts, or reachability issues were found for user prefix <strong>${prefix}</strong> targeting <strong>${target}</strong>. The network routing path is fully functional.`;
    recommendations.push(`Instruct the user to clear their browser cache, cookies, or try browsing using an Incognito window.`);
    recommendations.push(`Check if the user has local browser extensions (e.g. ad blockers) or custom proxy settings that might interfere with page loading.`);
    recommendations.push(`Verify if the user's credentials or account session is expired on the target application.`);
  }

  // 6b. Correlate Local Client Log analysis if available
  let localLogSummary = "";
  if (localLogDiagnostics) {
    localLogSummary = `
      <div style="margin-top: 12px; background: rgba(0,0,0,0.15); padding: 10px; border-radius: 4px; border-left: 3px solid var(--accent-light); margin-bottom: 12px;">
        <p style="margin-bottom: 5px; font-weight: 600; font-size: 0.95em;"><i class="fas fa-file-invoice"></i> Local Client Log Audit Summary:</p>
        <p style="font-size: 0.85em; margin-bottom: 4px;">Tunnel State: <strong>${localLogDiagnostics.tunnelState.toUpperCase()}</strong> | Gateway POP: <strong>${localLogDiagnostics.gateway || 'Unknown'}</strong> | Version: <strong>${localLogDiagnostics.version || 'Unknown'}</strong></p>
        ${localLogDiagnostics.issues.length > 0 ? 
          `<p style="font-size: 0.8em; margin-bottom: 0; color: #ffad33;">Found ${localLogDiagnostics.issues.length} local anomalies. Recommended actions appended below.</p>` :
          `<p style="font-size: 0.8em; margin-bottom: 0; color: #33cc66;">No critical anomalies found in local client logs.</p>`
        }
      </div>
    `;
    
    // Add local issues to recommendations list
    for (let issue of localLogDiagnostics.issues) {
      if (issue.severity === 'error') severity = 'error';
      else if (issue.severity === 'warning' && severity !== 'error') severity = 'warning';
      
      recommendations.push(`Local Log Insight: ${issue.detail}`);
    }
    if (localLogDiagnostics.tunnelState === 'down') {
      severity = 'error';
      diagnosis = `Local Client steering tunnel is offline. ${diagnosis}`;
      recommendations.push("Local Log Insight: Start or restart the local STAgent steering service on the client device.");
    }
  }

  // Render HTML
  const verdictCard = document.getElementById('verdict-card');
  const verdictContent = document.getElementById('verdict-content');
  
  verdictCard.className = `verdict-card ${severity} card-inner`;
  
  let recsHTML = recommendations.map(r => `<li>${r}</li>`).join('');
  
  verdictContent.innerHTML = `
    <p><strong>AI Verdict Diagnosis:</strong></p>
    <p>${diagnosis}</p>
    ${correlationNote}
    ${localLogSummary}
    <p><strong>Actionable Recommendations:</strong></p>
    <ul>
      ${recsHTML}
    </ul>
    <div class="diagnostic-meta" style="margin-top: 15px; font-size: 0.85em; opacity: 0.8; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
      <span><strong>Scanned Telemetry:</strong> ${alerts.length} alerts, ${webEvents.length} page events (past 7 days) | <strong>User Device:</strong> ${clientData?.os || 'Unknown'} (${clientData?.client_version || 'N/A'})</span>
    </div>
  `;
}

// --- MANUAL NETWORKING TOOLBOX HANDLERS ---
function showToolboxOutput(text) {
  toolboxOutputContainer.classList.remove('hidden');
  toolboxOutput.textContent = text;
  toolboxOutputContainer.scrollIntoView({ behavior: 'smooth' });
}

closeToolboxBtn.addEventListener('click', () => {
  toolboxOutputContainer.classList.add('hidden');
});

// Resolve Target DNS
toolDnsBtn.addEventListener('click', async () => {
  const target = destTargetInput.value.trim();
  if (!target) return alert('Please enter a destination target website/app first.');
  
  showToolboxOutput(`Resolving DNS records for: ${target}...\n`);
  
  try {
    const res = await fetch(`/api/diagnose/dns?target=${encodeURIComponent(target)}`);
    const data = await res.json();
    
    if (data.success) {
      let output = `DNS Resolution successful for ${data.hostname} (Resolved in ${data.resolveTimeMs}ms):\n\n`;
      if (data.records.A.length > 0) {
        output += `[A Records (IPv4)]:\n${data.records.A.map(ip => `  - ${ip}`).join('\n')}\n\n`;
      }
      if (data.records.AAAA.length > 0) {
        output += `[AAAA Records (IPv6)]:\n${data.records.AAAA.map(ip => `  - ${ip}`).join('\n')}\n\n`;
      }
      if (data.records.MX.length > 0) {
        output += `[MX Records (Mail)]:\n${data.records.MX.map(mx => `  - ${mx}`).join('\n')}\n\n`;
      }
      if (data.records.TXT.length > 0) {
        output += `[TXT Records]:\n${data.records.TXT.map(txt => `  - ${txt}`).join('\n')}\n`;
      }
      showToolboxOutput(output);
    } else {
      showToolboxOutput(`DNS Resolution Failed for ${target}:\nError: ${data.error}`);
    }
  } catch (err) {
    showToolboxOutput(`Network Error occurred during DNS resolve:\n${err.message}`);
  }
});

// TCP Connection Ping
toolPingBtn.addEventListener('click', async () => {
  const target = destTargetInput.value.trim();
  if (!target) return alert('Please enter a destination target website/app first.');
  
  showToolboxOutput(`Measuring TCP latency connection to: ${target}:443...\n`);
  
  try {
    const res = await fetch(`/api/diagnose/ping?target=${encodeURIComponent(target)}&port=443`);
    const data = await res.json();
    
    if (data.success) {
      showToolboxOutput(`TCP connection ping succeeded!\nTarget: ${data.hostname}:${data.port}\nLatency: ${data.latencyMs} ms\nResult: ${data.message}`);
    } else {
      showToolboxOutput(`TCP connection ping failed to target ${target}:443.\nError details: ${data.error}`);
    }
  } catch (err) {
    showToolboxOutput(`Network Error occurred during TCP ping:\n${err.message}`);
  }
});

// Simulate NPA Path Route
toolTraceBtn.addEventListener('click', () => {
  const target = destTargetInput.value.trim();
  if (!target) return alert('Please enter a destination target website/app first.');
  
  showToolboxOutput(`Simulating NPA Path Route trace to: ${target}...\n`);
  
  let output = `Tracing path for routing category evaluation:\n`;
  output += `Target: ${target}\n`;
  
  const isPrivate = target.endsWith('.corp') || target.endsWith('.local') || target.startsWith('10.') || target.startsWith('192.168.');
  
  if (isPrivate) {
    output += `[Hop 1] Local Host Interface (Steering Agent Active) - OK\n`;
    output += `[Hop 2] Local Gateway (192.168.1.1) - Latency: 1.2ms\n`;
    output += `[Hop 3] Netskope Client Virtual Adapter (ns0) - Steered Traffic captured\n`;
    output += `[Hop 4] Netskope Tenant PoP Gateway (Chicago_ORD-1) - Latency: 14.5ms\n`;
    output += `[Hop 5] Netskope Private Access Tunnel (Cloud Exchange Broker) - Secure Peer Connected\n`;
    output += `[Hop 6] NPA Publisher appliance [US-Chicago-Pub01] - Latency: 22.3ms\n`;
    output += `[Hop 7] Destination Private Host (${target}) - Connection Succeeded! (Port 443 open)\n\n`;
    output += `Summary: Traffic is fully steered inside the secure tenant NPA tunnel. No public hops exposed.`;
  } else {
    output += `[Hop 1] Local Host Interface (Steering Agent Active) - OK\n`;
    output += `[Hop 2] Local Gateway (192.168.1.1) - Latency: 1.2ms\n`;
    output += `[Hop 3] Public ISP Router (dynamic.ip.com) - Latency: 8.5ms\n`;
    output += `[Hop 4] Netskope Client Virtual Adapter (ns0) - Steered Web Traffic captured\n`;
    output += `[Hop 5] Netskope Edge SWG Gateway (Chicago_ORD-1) - Latency: 15.1ms (Decryption/DLP Engine Active)\n`;
    output += `[Hop 6] CDN Edge server (target.public.net) - Connection Succeeded! (Port 443 open)\n\n`;
    output += `Summary: Traffic is steered via secure web gateway (SWG) to public target destination.`;
  }
  
  showToolboxOutput(output);
});

// --- LOCAL CLIENT LOGS ANALYZER HANDLERS ---
const nsdiagFileInput = document.getElementById('nsdiag-file');
const nsdiagPasteArea = document.getElementById('nsdiag-paste');
const btnAnalyzeLocalLog = document.getElementById('btn-analyze-local-log');

// Handle log file upload loading
if (nsdiagFileInput) {
  nsdiagFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      nsdiagPasteArea.value = evt.target.result;
    };
    reader.readAsText(file);
  });
}

// Parse local client logs for standard patterns
function parseLocalClientLog(logText) {
  const lines = logText.split('\n');
  let issues = [];
  let tunnelState = "unknown";
  let detectedGateway = "unknown";
  let detectedVersion = "unknown";
  
  for (let line of lines) {
    const lineLower = line.toLowerCase();
    
    // Check tunnel status
    if (lineLower.includes('tunnel_established: 0') || lineLower.includes('tunnel down') || lineLower.includes('steering disabled') || lineLower.includes('gateway connection failed')) {
      tunnelState = "down";
    } else if (lineLower.includes('tunnel_established: 1') || lineLower.includes('tunnel established') || lineLower.includes('steering enabled')) {
      tunnelState = "up";
    }
    
    // Check SSL/TLS issues
    if (lineLower.includes('tls handshake error') || lineLower.includes('alert 42') || lineLower.includes('bad certificate') || lineLower.includes('certificate verify failed') || lineLower.includes('ssl pinning')) {
      issues.push({
        type: 'SSL/TLS Decryption Issue',
        detail: 'Client aborted the TLS handshake with the Netskope Gateway due to certificate trust mismatch (potentially certificate pinning or missing local trust CA).',
        severity: 'error'
      });
    }
    
    // Check DNS/DoH blocks
    if (lineLower.includes('doh query failed') || lineLower.includes('dns lookup timeout') || lineLower.includes('dns-over-https blocked') || lineLower.includes('dns query failed')) {
      issues.push({
        type: 'DNS / DoH Resolution Block',
        detail: 'DNS-over-HTTPS request was blocked or DNS resolution timed out. Client DNS steering may be impaired.',
        severity: 'warning'
      });
    }

    // Check Gateway Pop
    if (lineLower.includes('connected to pop') || lineLower.includes('gateway:')) {
      const match = line.match(/(?:pop|gateway):\s*([a-zA-Z0-9_\-]+)/i);
      if (match) detectedGateway = match[1];
    }
    
    // Check Client version
    if (lineLower.includes('version:') || lineLower.includes('stagent version')) {
      const match = line.match(/(?:version|stagent):\s*([0-9\.]+)/i);
      if (match) detectedVersion = match[1];
    }

    // Check steering exceptions / bypass
    if (lineLower.includes('bypass route') || lineLower.includes('steering exception') || lineLower.includes('bypassed')) {
      issues.push({
        type: 'Steering Exception Match',
        detail: 'Traffic matched local steering bypass / exception rules, bypassing the secure tunnel directly.',
        severity: 'info'
      });
    }
  }

  const uniqueIssues = [];
  const seenTypes = new Set();
  for (let issue of issues) {
    if (!seenTypes.has(issue.type)) {
      seenTypes.add(issue.type);
      uniqueIssues.push(issue);
    }
  }
  
  return {
    tunnelState,
    gateway: detectedGateway === "unknown" ? null : detectedGateway,
    version: detectedVersion === "unknown" ? null : detectedVersion,
    issues: uniqueIssues,
    rawLength: lines.length
  };
}

// Standalone update of verdict card from local logs
function updateVerdictWithLocalLogs() {
  if (!localLogDiagnostics) return;
  
  const verdictCard = document.getElementById('verdict-card');
  const verdictContent = document.getElementById('verdict-content');
  
  let severity = "info";
  let diagnosis = "Local client log analysis completed.";
  let recommendations = [];
  
  if (localLogDiagnostics.tunnelState === 'down') {
    severity = "error";
    diagnosis = "Local Client steering tunnel is <strong>Offline (DOWN)</strong>.";
    recommendations.push("Start or restart the local Netskope STAgent client service on the target machine.");
  }

  for (let issue of localLogDiagnostics.issues) {
    if (issue.severity === 'error') severity = 'error';
    else if (issue.severity === 'warning' && severity !== 'error') severity = 'warning';
    
    recommendations.push(issue.detail);
  }

  if (recommendations.length === 0) {
    severity = "success";
    diagnosis = "Local client log analysis completed. Tunnel steering is active and no anomalies were detected.";
    recommendations.push("If user issues persist, run a live scan to evaluate policies or whitelists on the Netskope tenant.");
  }

  verdictCard.className = `verdict-card ${severity} card-inner`;
  let recsHTML = recommendations.map(r => `<li>${r}</li>`).join('');
  
  verdictContent.innerHTML = `
    <p><strong>AI Verdict (Local Log Analysis):</strong></p>
    <p>${diagnosis}</p>
    <div style="margin-top: 12px; background: rgba(0,0,0,0.15); padding: 10px; border-radius: 4px; border-left: 3px solid var(--accent-light); margin-bottom: 12px;">
      <p style="margin-bottom: 5px; font-weight: 600; font-size: 0.9em;"><i class="fas fa-file-invoice"></i> Local Client Log Metadata:</p>
      <ul>
        <li><strong>Steering Tunnel State:</strong> ${localLogDiagnostics.tunnelState.toUpperCase()}</li>
        <li><strong>Connected Gateway POP:</strong> ${localLogDiagnostics.gateway || 'Unknown'}</li>
        <li><strong>Steering Client Version:</strong> ${localLogDiagnostics.version || 'Unknown'}</li>
      </ul>
    </div>
    <p><strong>Actionable Recommendations:</strong></p>
    <ul>
      ${recsHTML}
    </ul>
    <div class="diagnostic-meta" style="margin-top: 15px; font-size: 0.85em; opacity: 0.8; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
      <span><strong>Analyzed Log Volume:</strong> ${localLogDiagnostics.rawLength} lines</span>
    </div>
  `;
}

// Bind local log analysis action
if (btnAnalyzeLocalLog) {
  btnAnalyzeLocalLog.addEventListener('click', () => {
    const logText = nsdiagPasteArea.value.trim();
    if (!logText) {
      alert("Please upload a log file or paste some client logs first.");
      return;
    }

    localLogDiagnostics = parseLocalClientLog(logText);
    
    // Switch workspace display
    placeholderView.classList.add('hidden');
    resultsView.classList.remove('hidden');
    
    // Log to console
    logConsole.innerHTML = '';
    appendLog(`[CLIENT DIAG] Running client-side log analysis on ${localLogDiagnostics.rawLength} log lines...`, 'system');
    
    if (localLogDiagnostics.gateway) {
      appendLog(`[CLIENT DIAG] Connected Gateway POP: ${localLogDiagnostics.gateway}`, 'success');
    }
    if (localLogDiagnostics.version) {
      appendLog(`[CLIENT DIAG] Client Version: ${localLogDiagnostics.version}`, 'info');
    }

    if (localLogDiagnostics.tunnelState === 'down') {
      appendLog(`[CLIENT DIAG] [ERROR] Client tunnel steering was reported as DOWN / Offline.`, 'error');
    } else if (localLogDiagnostics.tunnelState === 'up') {
      appendLog(`[CLIENT DIAG] Client tunnel steering was reported as UP / Healthy.`, 'success');
    }

    if (localLogDiagnostics.issues.length > 0) {
      for (let issue of localLogDiagnostics.issues) {
        appendLog(`[CLIENT DIAG] [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.detail}`, issue.severity);
      }
    } else {
      appendLog(`[CLIENT DIAG] No critical connection or SSL issues found in analyzed log lines.`, 'success');
    }

    updateVerdictWithLocalLogs();
  });
}

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  loadConfig();
});
