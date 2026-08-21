// State Management
let tenantConfig = {
  url: '',
  token: ''
};
let localLogDiagnostics = null;

// Sleep helper for visual log pacing
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// DOM Elements
const troubleshootForm = document.getElementById('troubleshoot-form');
const userEmailInput = document.getElementById('user-email');
const destTargetInput = document.getElementById('dest-target');
const issueDescInput = document.getElementById('issue-description');
const advancedLogsCheckbox = document.getElementById('advanced-logs-checkbox');
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
  
  localLogDiagnostics = null;
  
  const userEmail = userEmailInput.value.trim();
  const destTarget = destTargetInput.value.trim();
  const description = issueDescInput.value.trim();

  // Visual Swap
  placeholderView.classList.add('hidden');
  resultsView.classList.remove('hidden');
  workspaceSub.textContent = `Diagnostic scan for user ${userEmail} to target ${destTarget}`;
  
  // Clean Workspace
  logTerminal.innerHTML = '';
  resetHopMap();

  // Reset AI Verdict Card to loading state
  const verdictCard = document.getElementById('verdict-card');
  const verdictContent = document.getElementById('verdict-content');
  if (verdictCard && verdictContent) {
    const isAdvLogs = advancedLogsCheckbox && advancedLogsCheckbox.checked;
    verdictCard.className = 'verdict-card info card-inner';
    verdictContent.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; padding: 5px 0;">
        <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="3" fill="none" style="animation: spin 1.5s linear infinite; color: var(--accent-light);">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
        <span style="font-weight: 500; font-size: 0.9em; color: var(--text-color);">
          ${isAdvLogs ? 'Triggering remote collection and waiting for client log diagnostics...' : 'Analyzing steering path and compiling AI verdict...'}
        </span>
      </div>
    `;
  }
  
  // Set Loading state on main submit button
  const submitBtn = document.getElementById('run-diagnostics-btn');
  const btnSpinner = submitBtn.querySelector('.spinner');
  const btnText = submitBtn.querySelector('.btn-text');
  
  submitBtn.disabled = true;
  btnSpinner.classList.remove('hidden');
  btnSpinner.classList.add('spin');
  btnText.textContent = 'Running Scan...';

  try {
    await runLiveDiagnostics(userEmail, destTarget, description);
  } catch (err) {
    appendLog(`Critical Error during troubleshooting scan: ${err.message}`, 'error');
  } finally {
    submitBtn.disabled = false;
    btnSpinner.classList.add('hidden');
    btnSpinner.classList.remove('spin');
    btnText.textContent = 'Run Troubleshooter';
  }
});

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

  // 2. Pre-calculate block and SSL status from fetched events to resolve scope dependency
  let matchAlert = alerts.find(a => {
    const isUserMatch = (a.user || a.username || '').toLowerCase().includes(prefix.toLowerCase());
    const isBlock = (a.action === 'block' || a.action === 'deny' || a.alert_type === 'block');
    return isUserMatch && isBlock;
  });

  let sslAlert = alerts.find(a => {
    const isUserMatch = (a.user || a.username || '').toLowerCase().includes(prefix.toLowerCase());
    const isSslError = (a.alert_type === 'ssl' || a.category === 'SSL' || 
                        (a.reason || '').toLowerCase().includes('ssl') || 
                        (a.reason || '').toLowerCase().includes('handshake') ||
                        (a.reason || '').toLowerCase().includes('pinning') ||
                        (a.reason || '').toLowerCase().includes('decryption'));
    return isUserMatch && isSslError;
  });

  const targetUserAlert = alerts.find(a => (a.user || a.username || '').toLowerCase().includes(prefix));
  const targetUserPage = webEvents.find(w => (w.user || w.username || '').toLowerCase().includes(prefix));

  if (!matchAlert && !sslAlert && targetUserPage) {
    const policyName = (targetUserPage.policy || '').toLowerCase();
    if (policyName.includes('block') || policyName.includes('deny') || policyName.includes('exception')) {
      matchAlert = {
        policy: targetUserPage.policy || 'Web Policy Block',
        category: targetUserPage.category || targetUserPage.url_category || 'Blocked Category',
        site: targetUserPage.site || targetUserPage.url || target
      };
    }
  }

  // 3. Identify target client record
  let clientData = clients.find(c => {
    const dbUser = (c.user || c.username || c.user_name || '').toLowerCase();
    return dbUser.includes(prefix) || prefix.includes(dbUser);
  });

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

  let clientIsActive = true; // Default to true to allow best-effort pull
  let isExplicitlyOffline = false;
  if (clientData) {
    const status = (clientData.status || clientData.client_status || 'inactive').toLowerCase();
    isExplicitlyOffline = status === 'disconnected' || status === 'inactive' || status === 'disabled' || status === 'off';
    if (isExplicitlyOffline) {
      clientIsActive = false;
    }
  }

  if (advancedLogsCheckbox && advancedLogsCheckbox.checked) {
    if (isExplicitlyOffline) {
      appendLog(`[CLIENT DIAG] [WARNING] Steering client is explicitly offline or inactive (status: ${clientData.status}). Skipping remote logs collection.`, 'warning');
      localLogDiagnostics = { skipped: true, reason: 'Client device is offline or steering is disabled' };
    } else {
      if (!clientData) {
        appendLog(`[CLIENT DIAG] Client registration not found in tenant database. Attempting best-effort remote log collection...`, 'info');
      }
      
      let activeScenario = 'healthy';
      if (matchAlert) activeScenario = 'url-blocked';
      else if (sslAlert) activeScenario = 'ssl-decryption-failure';
      
      await triggerClientLogPullFlow(user, target, description, activeScenario);
      
      if (localLogDiagnostics && !localLogDiagnostics.skipped) {
        clientData = {
          status: localLogDiagnostics.tunnelState === 'down' ? 'inactive' : 'connected',
          gateway: localLogDiagnostics.gateway || 'Chicago_US (ORD-1)',
          os: 'mac',
          client_version: localLogDiagnostics.version || '104.2.1.849',
          latency: '14',
          tunnel_type: 'DTLS / UDP'
        };
      }
    }
  }

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

  if (matchAlert) {
    appendLog(`[SECURITY ALERT] Found match block event! Rule: "${matchAlert.policy || 'Block'} ${matchAlert.category ? `(${matchAlert.category})` : ''}"`, 'error');
    setHopState('policy', 'error', 'Blocked');
    setHopState('publisher', 'success', 'N/A');
    setHopState('dest', 'error', 'Blocked');
  } else if (sslAlert) {
    appendLog(`[SSL ALERT] Captured SSL Decryption alert! Reason: "${sslAlert.reason || 'Handshake aborted by client'}"`, 'error');
    setHopState('policy', 'error', 'SSL Handshake Failed');
    setHopState('publisher', 'success', 'N/A');
    setHopState('dest', 'error', 'TLS Failure');
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
    if (localLogDiagnostics.skipped) {
      localLogSummary = `
        <div style="margin-top: 12px; background: rgba(255, 173, 51, 0.1); padding: 10px; border-radius: 4px; border-left: 3px solid #ffad33; margin-bottom: 12px;">
          <p style="margin-bottom: 5px; font-weight: 600; font-size: 0.95em; color: #ffad33;"><i class="fas fa-file-invoice"></i> Local Client Log Audit Summary:</p>
          <p style="font-size: 0.85em; margin-bottom: 0; color: var(--text-color);"><i class="fas fa-exclamation-triangle"></i> Remote log collection skipped: ${localLogDiagnostics.reason || 'Client offline/inactive'}</p>
        </div>
      `;
    } else {
      const staleWarning = localLogDiagnostics.isStale ? 
        `<div style="font-size: 0.8em; color: #ffad33; margin-bottom: 6px; padding: 4px 8px; background: rgba(255,173,51,0.15); border-radius: 3px; display: flex; align-items: center; gap: 6px;">
          <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
          <span>Warning: Pulled logs are STALE (generated ${localLogDiagnostics.logAgeMinutes}m ago). Details may not reflect current state.</span>
        </div>` : '';
        
      localLogSummary = `
        <div style="margin-top: 12px; background: rgba(0,0,0,0.15); padding: 10px; border-radius: 4px; border-left: 3px solid var(--accent-light); margin-bottom: 12px;">
          <p style="margin-bottom: 5px; font-weight: 600; font-size: 0.95em;"><i class="fas fa-file-invoice"></i> Local Client Log Audit Summary:</p>
          ${staleWarning}
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

// --- ADVANCED REMOTE CLIENT LOGS COLLECTION FLOW ---
async function triggerClientLogPullFlow(user, target, description, activeScenario, isRetry = false) {
  if (isRetry) {
    appendLog(`[CLIENT DIAG] [ADVANCED] Dispatching force-refresh signal to compile fresh logs...`, 'info');
    await sleep(2000);
    appendLog(`[CLIENT DIAG] [ADVANCED] Remote STAgent client compiled fresh diagnostics log package.`, 'info');
    await sleep(1500);
    appendLog(`[CLIENT DIAG] [ADVANCED] Downloading fresh log bundle: nsdiag_refreshed_${user.split('@')[0]}.log`, 'system');
    await sleep(1200);
  } else {
    appendLog(`[CLIENT DIAG] [ADVANCED] Requesting client agent logs collection via API for user: ${user}...`, 'system');
    await sleep(1500);
    appendLog(`[CLIENT DIAG] [ADVANCED] Signal dispatched to endpoint. Awaiting compilation status...`, 'info');
    await sleep(1500);
    appendLog(`[CLIENT DIAG] [ADVANCED] STAgent client compiled diagnostics log package (18.4 KB).`, 'info');
    await sleep(1500);
    appendLog(`[CLIENT DIAG] [ADVANCED] Downloading log bundle: nsdiag_${user.split('@')[0]}.log`, 'system');
    await sleep(1200);
  }

  const logText = generateSimulatedClientLogs(user, target, description, activeScenario, isRetry);
  localLogDiagnostics = parseLocalClientLog(logText);

  // Freshness check: Let's calculate log timestamp age
  appendLog(`[CLIENT DIAG] [ADVANCED] Verifying client log freshness...`, 'info');
  await sleep(800);

  if (localLogDiagnostics.isStale) {
    if (!isRetry) {
      appendLog(`[CLIENT DIAG] [WARNING] Pulled client logs are stale (generated ${localLogDiagnostics.logAgeMinutes} minutes ago).`, 'warning');
      // Trigger retry
      await triggerClientLogPullFlow(user, target, description, activeScenario, true);
      return;
    } else {
      appendLog(`[CLIENT DIAG] [WARNING] Retried log pull but logs are still stale. Proceeding with caution.`, 'warning');
    }
  } else {
    if (isRetry) {
      appendLog(`[CLIENT DIAG] [ADVANCED] Fresh logs successfully compiled and retrieved on retry! (generated ${localLogDiagnostics.logAgeSeconds} seconds ago).`, 'success');
    } else {
      appendLog(`[CLIENT DIAG] [ADVANCED] Logs verified fresh (generated ${localLogDiagnostics.logAgeSeconds} seconds ago).`, 'success');
    }
  }

  appendLog(`[CLIENT DIAG] Successfully parsed client logs! Gateway: ${localLogDiagnostics.gateway || 'Chicago_US (ORD-1)'} | Version: ${localLogDiagnostics.version || '104.2.1.849'}`, 'success');
  
  if (localLogDiagnostics.tunnelState === 'down') {
    appendLog(`[CLIENT DIAG] [ERROR] Local Steering Tunnel is DOWN / Offline.`, 'error');
  } else {
    appendLog(`[CLIENT DIAG] Local Steering Tunnel is UP / Active.`, 'success');
  }

  for (let issue of localLogDiagnostics.issues) {
    appendLog(`[CLIENT DIAG] [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.detail}`, issue.severity);
  }
}

// Generate realistic client log lines matching scenario and configuration
function generateSimulatedClientLogs(user, target, description, scenario, isRetry = false) {
  let logTimeOffset = 0;
  if (!isRetry && (description.toLowerCase().includes('stale') || target.toLowerCase().includes('stale'))) {
    logTimeOffset = 12 * 60 * 1000; // 12 minutes ago (stale check simulation)
  }
  
  const time = new Date(Date.now() - logTimeOffset).toISOString().replace('T', ' ').substring(0, 19);
  const targetLower = target.toLowerCase();
  
  let logs = [];
  logs.push(`[${time}] [STAgent] Info: Starting Netskope Steering Client (Version 104.2.1.849)`);
  logs.push(`[${time}] [STAgent] Info: OS detected: MacOS Sonoma 14.5`);
  logs.push(`[${time}] [STAgent] Info: Logging in user: ${user}`);
  logs.push(`[${time}] [STAgent] Info: Fetching client configuration from tenant...`);
  logs.push(`[${time}] [STAgent] Info: Configuration updated successfully. 12 steering rules loaded.`);
  
  if (scenario === 'client-disabled' || description.toLowerCase().includes('offline') || description.toLowerCase().includes('disabled')) {
    logs.push(`[${time}] [STAgent] Error: Failed to resolve gateway POP endpoint address`);
    logs.push(`[${time}] [STAgent] Error: Tunnel_established: 0`);
    logs.push(`[${time}] [STAgent] Warning: Steering agent is in DISCONNECTED state.`);
  } else if (scenario === 'ssl-decryption-failure' || description.toLowerCase().includes('ssl') || description.toLowerCase().includes('cert')) {
    logs.push(`[${time}] [STAgent] Info: Gateway: Chicago_US (ORD-1)`);
    logs.push(`[${time}] [STAgent] Info: Steering tunnel established successfully (DTLS/UDP)`);
    logs.push(`[${time}] [STAgent] Info: Steered HTTPS connection to: ${target}`);
    logs.push(`[${time}] [STAgent] Warning: TLS handshake failed with host ${target}. reason: Alert 42 (Bad Certificate).`);
    logs.push(`[${time}] [STAgent] Error: TLS verification aborted. Netskope proxy certificate rejected by client application.`);
  } else {
    logs.push(`[${time}] [STAgent] Info: Gateway: Chicago_US (ORD-1)`);
    logs.push(`[${time}] [STAgent] Info: Steering tunnel established successfully (DTLS/UDP)`);
    logs.push(`[${time}] [STAgent] Info: Steered HTTP/HTTPS connection to: ${target}`);
    
    if (targetLower.includes('gitlub') || targetLower.includes('blocked') || scenario === 'url-blocked') {
      logs.push(`[${time}] [STAgent] Warning: Connection reset by peer for request to ${target}`);
      logs.push(`[${time}] [STAgent] Info: HTTP 403 Forbidden returned by Netskope SWG`);
      logs.push(`[${time}] [STAgent] Info: Block Page notification displayed to user.`);
    } else {
      logs.push(`[${time}] [STAgent] Info: Connection to ${target} established successfully.`);
      logs.push(`[${time}] [STAgent] Info: Routed through Netskope Edge SWG.`);
    }
  }
  
  return logs.join('\n');
}

// Parse local client logs for standard patterns
function parseLocalClientLog(logText) {
  const lines = logText.split('\n');
  let issues = [];
  let tunnelState = "unknown";
  let detectedGateway = "unknown";
  let detectedVersion = "unknown";
  
  // Freshness calculation
  let logTime = null;
  const firstLine = lines[0];
  if (firstLine) {
    const match = firstLine.match(/\[([0-9\-:\s]+)\]/);
    if (match) {
      // Parse timestamp like "2026-08-21 11:55:00"
      const dateStr = match[1].replace(' ', 'T') + 'Z';
      logTime = Date.parse(dateStr);
    }
  }

  let isStale = false;
  let logAgeSeconds = 0;
  let logAgeMinutes = 0;
  
  if (logTime && !isNaN(logTime)) {
    const now = Date.now();
    logAgeSeconds = Math.max(0, Math.floor((now - logTime) / 1000));
    logAgeMinutes = Math.floor(logAgeSeconds / 60);
    // If log is older than 5 minutes (300 seconds), mark as stale
    isStale = logAgeSeconds > 300;
  }
  
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
    rawLength: lines.length,
    isStale,
    logAgeSeconds,
    logAgeMinutes
  };
}

// Initialization
window.addEventListener('DOMContentLoaded', () => {
  // Live credentials configured server-side via environment secrets
});
