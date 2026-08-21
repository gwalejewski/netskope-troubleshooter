// State Management
let tenantConfig = {
  url: '',
  token: ''
};

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
      if (!tenantConfig.url || !tenantConfig.token) {
        configDialog.showModal();
      }
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
  if (!tenantConfig.url || !tenantConfig.token) {
    appendLog('Error: Netskope Tenant settings have not been configured.', 'error');
    throw new Error('Missing Tenant URL or Token. Click "Configure Tenant" to set credentials.');
  }

  appendLog(`Initializing Live Diagnostics scan against tenant: ${tenantConfig.url}`, 'system');
  await sleep(800);

  // Hop 1: User PC Check
  appendLog(`Locating active steering records for user [${user}]...`, 'info');
  setHopState('user', 'active', 'Querying...');
  
  let clientData;
  try {
    const res = await fetch('/api/netskope/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantUrl: tenantConfig.url,
        token: tenantConfig.token,
        endpoint: 'steering/clients'
      })
    });
    
    const result = await res.json();
    if (!result.success) throw new Error(result.error || 'Failed to fetch client list');
    
    // Scan for user
    const clients = result.data.data || [];
    clientData = clients.find(c => 
      (c.user && c.user.toLowerCase() === user.toLowerCase()) || 
      (c.username && c.username.toLowerCase() === user.toLowerCase()) ||
      (c.email && c.email.toLowerCase() === user.toLowerCase())
    );

    if (!clientData) {
      appendLog(`[WARNING] No active client registration found matching user query "${user}".`, 'warning');
      setHopState('user', 'warning', 'No Record');
      // Look for similar
      const similar = clients.slice(0, 3).map(c => c.user || c.username).join(', ');
      if (similar) appendLog(`Found other active users: [${similar}]`, 'info');
    } else {
      appendLog(`Successfully located client device: ${clientData.device_name || 'Generic Device'} (OS: ${clientData.os || 'Unknown'})`, 'success');
      setHopState('user', 'success', 'Verified');
    }
  } catch (err) {
    appendLog(`Failed to query Netskope steering clients: ${err.message}`, 'error');
    setHopState('user', 'error', 'API Error');
    throw err;
  }

  setConnectorActive('client', true);
  await sleep(1000);

  // Hop 2 & 3: Client and PoP status
  setHopState('client', 'active', 'Verifying...');
  setHopState('pop', 'active', 'Scanning...');
  
  if (clientData) {
    const status = clientData.status || 'inactive';
    const isSteering = status === 'connected' || status === 'active';
    
    telemetryPop.textContent = clientData.gateway || 'Unknown';
    telemetryLatency.textContent = clientData.latency ? `${clientData.latency} ms` : 'N/A';
    telemetryTunnel.textContent = clientData.tunnel_type || 'Unknown';
    telemetryVersion.textContent = clientData.version || 'Unknown';

    if (isSteering) {
      appendLog(`Steering status is active on PoP: ${clientData.gateway}. Connection latency: ${clientData.latency || 'N/A'}ms.`, 'success');
      setHopState('client', 'success', 'Steering');
      setHopState('pop', 'success', 'Online');
    } else {
      appendLog(`[ERROR] Steering Client status on user device is inactive (Status: ${status})`, 'error');
      setHopState('client', 'error', 'Inactive');
      setHopState('pop', 'warning', 'Disconnected');
    }
  } else {
    // Fill in default placeholders for telemetry if no matching user found
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

  // Hop 4: Policy Block Checks (Checking Netskope Security Events/Alerts)
  setHopState('policy', 'active', 'Checking alerts...');
  appendLog(`Searching alerts database for block records matching user [${user}] and destination [${target}]...`, 'info');
  
  let matchAlert = null;
  try {
    const res = await fetch('/api/netskope/proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantUrl: tenantConfig.url,
        token: tenantConfig.token,
        endpoint: 'events/dataexport/alerts',
        method: 'GET'
      })
    });
    const result = await res.json();
    if (result.success && result.data && result.data.data) {
      const alerts = result.data.data || [];
      // Look for block alerts match user and target
      matchAlert = alerts.find(a => 
        (a.user && a.user.toLowerCase() === user.toLowerCase()) && 
        (a.app || a.site || '').toLowerCase().includes(target.toLowerCase()) &&
        (a.action === 'block' || a.action === 'deny')
      );
    }
  } catch (err) {
    appendLog(`[Warning] Could not scan live policy alerts database: ${err.message}`, 'warning');
  }

  if (matchAlert) {
    appendLog(`[SECURITY ALERT] Found match block event! Rule: "${matchAlert.policy || 'Block'}", Category: "${matchAlert.category || 'N/A'}"`, 'error');
    setHopState('policy', 'error', 'Blocked');
    setHopState('publisher', 'success', 'N/A');
    setHopState('dest', 'error', 'Blocked');

    verdictCard.className = 'verdict-card error card-inner';
    verdictContent.innerHTML = `
      <p><strong>Diagnosis:</strong> A live block policy event was captured in the tenant logs matching this user and destination.</p>
      <p><strong>Log Details:</strong> Rule <code>${matchAlert.policy}</code> blocked traffic targeting <code>${matchAlert.site || matchAlert.app}</code> under category <code>${matchAlert.category}</code>.</p>
      <p><strong>Action Recommendation:</strong> Create a policy override rule or modify the security group exception permissions in the policy management panel.</p>
    `;
    return;
  } else {
    appendLog(`No recent block events found in alerts log for user targeting "${target}".`, 'success');
    setHopState('policy', 'success', 'Allowed');
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
          tenantUrl: tenantConfig.url,
          token: tenantConfig.token,
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
  
  try {
    const res = await fetch(`/api/diagnose/ping?target=${encodeURIComponent(target)}`);
    const pingRes = await res.json();
    
    if (pingRes.success) {
      appendLog(`TCP Connection check to [${target}:443] succeeded. Latency: ${pingRes.latencyMs}ms.`, 'success');
      setHopState('dest', 'success', 'Connected');
      
      verdictCard.className = 'verdict-card success card-inner';
      verdictContent.innerHTML = `
        <p><strong>Diagnosis:</strong> The live path analysis was successful. Connection tunnel is active and destination is reachable.</p>
        <p><strong>Recommendation:</strong> If the user is still unable to browse, check local device parameters (e.g. browser proxies, caching, browser Extensions, or DNS over HTTPS configuration).</p>
      `;
    } else {
      appendLog(`[ERROR] Connection test to [${target}:443] failed: ${pingRes.error}`, 'error');
      setHopState('dest', 'error', 'Unreachable');
      
      verdictCard.className = 'verdict-card error card-inner';
      verdictContent.innerHTML = `
        <p><strong>Diagnosis:</strong> The user steering and policy path is healthy, but the destination server itself is down or actively refusing connections.</p>
        <p><strong>Recommendation:</strong> Check target web application hosting environment or locally whitelist port 443 in application firewalls.</p>
      `;
    }
  } catch (err) {
    appendLog(`Reachability scan failed to finish: ${err.message}`, 'error');
    setHopState('dest', 'warning', 'Scan Failed');
  }
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

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  loadConfig();
});
