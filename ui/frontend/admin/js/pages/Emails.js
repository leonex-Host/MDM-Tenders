import { getApiBase, adminFetch } from '../utils/api.js?v=2.3';

/**
 * Email Management - Automation Pulse Overhaul
 * Focused on high-density, automated distribution tracking and theme-neutral visibility.
 */

export async function renderEmails() {
    const container = document.getElementById('admin-content');
    container.innerHTML = `
        <style>
            :root {
                --p-green: #22c55e;
                --p-red: #ef4444;
            }
            .log-scroll::-webkit-scrollbar { width: 3px; }
            .log-scroll::-webkit-scrollbar-track { background: transparent; }
            .log-scroll::-webkit-scrollbar-thumb { background: var(--border-subtle); border-radius: 10px; }
            
            .pulse-card { 
                background: var(--bg-surface-elevated); 
                border: 1px solid var(--border-subtle); 
                backdrop-filter: blur(30px); 
                border-radius: 20px; 
                padding: 24px;
                transition: 0.3s var(--ease);
                position: relative;
            }
            .pulse-card:hover { border-color: var(--border-strong); }
            
            .heartbeat { width: 8px; height: 8px; border-radius: 50%; background: var(--p-green); position: relative; }
            .heartbeat::after { content:''; position:absolute; inset:-4px; border-radius:50%; border:2px solid var(--p-green); animation: pulse-ring 1.5s infinite; }
            @keyframes pulse-ring { 0% { transform: scale(0.5); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }
            
            .countdown-num { font-family: var(--font-mono); font-size: 28px; font-weight: 900; color: var(--text-primary); letter-spacing: -1px; }
            .timeline-track { height: 4px; background: var(--bg-surface); border-radius: 2px; margin: 16px 0; overflow: hidden; border: 1px solid var(--border-subtle); }
            .timeline-fill { height: 100%; background: var(--text-primary); border-radius: 2px; width: 0%; transition: width 1s linear; }
            
            .node-row { border-bottom: 1px solid var(--border-subtle); transition: background 0.2s; }
            .node-row:hover { background: var(--bg-surface); }
            
            .log-entry { 
                display: flex; justify-content: space-between; align-items: center; 
                padding: 10px 16px; border-radius: 10px; margin-bottom: 6px; 
                background: var(--bg-surface); border: 1px solid var(--border-subtle);
            }
                .adm-input { 
                    background: var(--bg-surface); border: 1px solid var(--border-subtle); 
                    color: var(--text-primary); border-radius: 10px; padding: 0 12px; font-size: 11px; font-weight: 700;
                    transition: border-color 0.2s;
                }
                .adm-input:focus { border-color: var(--text-primary); outline: none; }
                .bb-btn-primary:active, .bb-btn-secondary:active { transform: scale(0.98); }
                .bb-btn-primary:hover { filter: brightness(1.1); box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
                .bb-btn-secondary:hover { background: var(--bg-surface); border-color: var(--border-strong); }
        </style>

        <div class="anim-in" style="max-width: 1200px; margin: 0 auto; padding: 20px 0;">
            
            <!-- HEADER -->
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
                <div>
                    <div style="display:flex; align-items:center; gap:10px; margin-bottom:4px;">
                        <div class="heartbeat"></div>
                        <span style="font-size:10px; font-weight:900; color:var(--p-green); text-transform:uppercase; letter-spacing:2px;">Systems Online</span>
                    </div>
                    <h1 style="font-size:28px; font-weight:900; color:var(--text-primary); margin:0; letter-spacing:-1px;">Automation Pulse</h1>
                </div>
                <div style="display:flex; gap:12px; align-items:center;">
                    <input type="date" id="sync-target-date" class="adm-input" style="height:40px; width:130px;">
                    <button id="adm-send-now-btn" class="bb-btn-secondary" style="height:40px; padding:0 20px; border-radius:12px; font-size:10px; font-weight:900; display:flex; align-items:center; gap:10px; letter-spacing:1px; background:transparent; border:1px solid var(--border-subtle); color:var(--text-primary); cursor:pointer;">
                        <i data-lucide="zap" style="width:14px;height:14px;"></i> SYNC ENGINE
                    </button>
                    <button id="adm-add-recipient-btn" class="bb-btn-primary" style="height:40px; padding:0 20px; border-radius:12px; font-size:10px; font-weight:900; background:var(--text-primary); color:var(--bg-page); border:none; cursor:pointer;">
                        ADD NODE
                    </button>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: repeat(12, 1fr); gap:24px;">
                
                <!-- LEFT PANEL: PULSE & CONFIG -->
                <div style="grid-column: span 4; display:flex; flex-direction:column; gap:24px;">
                    
                    <div class="pulse-card">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px;">
                            <span style="font-size:10px; font-weight:900; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:1.5px;">Distribution Pulse</span>
                            <label class="adm-toggle" style="transform: scale(0.8);">
                                <input type="checkbox" id="setting-report-enabled">
                                <span class="slider"></span>
                            </label>
                        </div>
                        
                        <div id="countdown-display" class="countdown-num">00:00:00</div>
                        <div class="timeline-track"><div id="timeline-fill" class="timeline-fill"></div></div>
                        
                        <div style="display:flex; justify-content:space-between; margin-top:4px;">
                            <span id="last-sync-val" style="font-size:8px; font-weight:800; color:var(--text-tertiary);">LAST: 09:00 AM</span>
                            <span id="next-sync-val" style="font-size:8px; font-weight:800; color:var(--text-tertiary);">TARGET: 09:00 AM</span>
                        </div>

                        <div style="margin-top:24px; padding-top:24px; border-top:1px solid var(--border-subtle); display:flex; flex-direction:column; gap:16px;">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="font-size:9px; font-weight:900; color:var(--text-tertiary); text-transform:uppercase;">Protocol Time</span>
                                <input type="time" id="setting-report-time" class="adm-input" style="height:32px; width:100px; border:none; background:transparent; font-size:14px; text-align:right;">
                            </div>
                            <div style="display:flex; flex-direction:column; gap:8px;">
                                <input type="text" id="setting-sender-name" class="adm-input" style="height:36px;" placeholder="Identity Name">
                                <input type="email" id="setting-sender-email" class="adm-input" style="height:36px;" placeholder="root@system.net">
                            </div>
                            <button id="adm-save-settings-btn" class="bb-btn-primary" style="height:40px; border-radius:12px; font-weight:900; font-size:10px; letter-spacing:1px; background:var(--text-primary); color:var(--bg-page); border:none; cursor:pointer;">SAVE PROTOCOL</button>
                        </div>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:16px;">
                        <div class="pulse-card" style="padding:16px; border-radius:16px;">
                            <span style="font-size:8px; font-weight:900; color:var(--text-tertiary); text-transform:uppercase;">Health</span>
                            <div style="font-size:16px; font-weight:900; color:var(--p-green); margin-top:8px;">NOMINAL</div>
                        </div>
                        <div class="pulse-card" style="padding:16px; border-radius:16px;">
                            <span style="font-size:8px; font-weight:900; color:var(--text-tertiary); text-transform:uppercase;">Nodes</span>
                            <div style="font-size:16px; font-weight:900; color:var(--text-primary); margin-top:8px;" id="node-count-val">0</div>
                        </div>
                    </div>

                </div>

                <!-- RIGHT PANEL: REGISTRY & LOGS -->
                <div style="grid-column: span 8; display:flex; flex-direction:column; gap:24px;">
                    
                    <div class="pulse-card" style="padding:0;">
                        <div style="padding:16px 24px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <i data-lucide="database" style="width:14px;height:14px;color:var(--text-tertiary);"></i>
                                <span style="font-size:10px; font-weight:900; color:var(--text-primary); text-transform:uppercase; letter-spacing:1px;">Registry Nodes</span>
                            </div>
                        </div>
                        <div style="overflow-x:auto;">
                            <table style="width:100%; border-collapse:collapse; font-size:12px;">
                                <thead style="background:var(--bg-surface);">
                                    <tr>
                                        <th style="text-align:left; padding:12px 24px; color:var(--text-tertiary); font-weight:900; font-size:8px; text-transform:uppercase;">Identity</th>
                                        <th style="text-align:left; padding:12px 24px; color:var(--text-tertiary); font-weight:900; font-size:8px; text-transform:uppercase;">Sector</th>
                                        <th style="text-align:center; padding:12px 24px; color:var(--text-tertiary); font-weight:900; font-size:8px; text-transform:uppercase;">Status</th>
                                        <th style="text-align:right; padding:12px 24px; color:var(--text-tertiary); font-weight:900; font-size:8px; text-transform:uppercase;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="recipient-list-body"></tbody>
                            </table>
                        </div>
                    </div>

                    <div class="pulse-card" style="padding:0;">
                        <div style="padding:16px 24px; border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <i data-lucide="activity" style="width:14px;height:14px;color:var(--text-tertiary);"></i>
                                <span style="font-size:10px; font-weight:900; color:var(--text-primary); text-transform:uppercase; letter-spacing:1px;">Network Meta-Log</span>
                            </div>
                            <button id="adm-clear-logs-btn" style="background:transparent; border:none; color:var(--text-tertiary); font-size:8px; font-weight:900; cursor:pointer;">CLEAR ARCHIVE</button>
                        </div>
                        <div id="email-log-list" class="log-scroll" style="max-height:220px; overflow-y:auto; padding:16px 24px;"></div>
                    </div>

                </div>
            </div>
        </div>

        <!-- MODAL -->
        <div id="adm-email-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); backdrop-filter:blur(10px); z-index:3000; justify-content:center; align-items:center; padding:20px;">
            <div class="pulse-card" style="width:100%; max-width:400px; padding:32px;">
                <h2 style="margin:0 0 24px 0; font-size:20px; font-weight:900; color:var(--text-primary);">Register Node</h2>
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <input type="text" id="modal-r-name" class="adm-input" style="height:44px;" placeholder="Name Identifier">
                    <input type="email" id="modal-r-email" class="adm-input" style="height:44px;" placeholder="network@address.sys">
                    <input type="text" id="modal-r-dept" class="adm-input" style="height:44px;" placeholder="Allocation Sector">
                    <div style="display:flex; gap:12px; margin-top:16px;">
                        <button onclick="document.getElementById('adm-email-modal').style.display='none'" style="flex:1; height:44px; border-radius:12px; font-weight:900; background:transparent; border:1px solid var(--border-subtle); color:var(--text-primary); cursor:pointer;">DISCARD</button>
                        <button id="modal-r-save-btn" class="bb-btn-primary" style="flex:1; height:44px; border-radius:12px; font-weight:900; background:var(--text-primary); color:var(--bg-page); border:none; cursor:pointer;">CONFIRM</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Internal State
    let syncTimer = null;

    // Attach Listeners
    document.getElementById('adm-add-recipient-btn').onclick = () => document.getElementById('adm-email-modal').style.display = 'flex';
    document.getElementById('modal-r-save-btn').onclick = saveNewRecipient;
    document.getElementById('adm-save-settings-btn').onclick = saveSettings;
    document.getElementById('adm-send-now-btn').onclick = initiateGlobalSync;
    document.getElementById('adm-clear-logs-btn').onclick = clearEmailLogs;

    // Init Logic — non-blocking for instant page render
    loadRecipients();
    loadLogs();
    loadSettings();
    startCountdown();
    if (window.lucide) window.lucide.createIcons();

    function startCountdown() {
        if (syncTimer) clearInterval(syncTimer);
        syncTimer = setInterval(updatePulse, 1000);
        updatePulse();

        // Anti-leak: auto-kill timer when user navigates away
        const obs = new MutationObserver(() => {
            if (!document.getElementById('countdown-display')) {
                clearInterval(syncTimer);
                obs.disconnect();
            }
        });
        obs.observe(document.body, { childList: true, subtree: true });
    }

    function updatePulse() {
        const timeEl = document.getElementById('setting-report-time');
        if (!timeEl) return;
        const timeInput = timeEl.value;
        if (!timeInput) return;

        const now = new Date();
        const [h, m] = timeInput.split(':').map(Number);
        let target = new Date();
        target.setHours(h, m, 0, 0);

        if (target < now) target.setDate(target.getDate() + 1);

        const diff = target - now;
        const hh = Math.floor(diff / 3600000).toString().padStart(2, '0');
        const mm = Math.floor((diff % 3600000) / 60000).toString().padStart(2, '0');
        const ss = Math.floor((diff % 60000) / 1000).toString().padStart(2, '0');

        const cd = document.getElementById('countdown-display');
        const nx = document.getElementById('next-sync-val');
        const tf = document.getElementById('timeline-fill');

        if (cd) cd.innerText = `${hh}:${mm}:${ss}`;
        if (nx) nx.innerText = `TARGET: ${target.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        if (tf) tf.style.width = `${100 - (diff / (24 * 3600 * 1000) * 100)}%`;
    }
};

async function loadRecipients() {
    const list = document.getElementById('recipient-list-body');
    const nodeVal = document.getElementById('node-count-val');
    const baseUrl = getApiBase();
    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/recipients`);
        const data = await res.json();
        nodeVal.innerText = data.length || 0;
        list.innerHTML = data.map(r => `
            <tr class="node-row">
                <td style="padding:12px 24px;">
                    <div style="font-weight:900; color:var(--text-primary);">${r.name}</div>
                    <div style="font-size:9px; color:var(--text-tertiary);">${r.email}</div>
                </td>
                <td style="padding:12px 24px;">
                    <span style="font-size:8px; font-weight:900; color:var(--text-secondary); background:var(--bg-surface); padding:2px 6px; border-radius:4px; border:1px solid var(--border-subtle);">${(r.department || 'ROOT').toUpperCase()}</span>
                </td>
                <td style="padding:12px 24px; text-align:center;">
                    <label class="adm-toggle" style="transform: scale(0.7);">
                        <input type="checkbox" ${r.is_active ? 'checked' : ''} onchange="window._toggleRecipient('${r.id}', this.checked)">
                        <span class="slider"></span>
                    </label>
                </td>
                <td style="padding:12px 24px; text-align:right;">
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                        <button onclick="window._sendQuickTest('${r.email}')" style="background:transparent; border:none; color:var(--text-tertiary); cursor:pointer;"><i data-lucide="send" style="width:12px;height:12px;"></i></button>
                        <button onclick="window._deleteRecipient('${r.id}')" style="background:transparent; border:none; color:var(--p-red); opacity:0.4; cursor:pointer;"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
        if (window.lucide) window.lucide.createIcons();
    } catch (e) { console.error(e); }
}

async function loadLogs() {
    const logList = document.getElementById('email-log-list');
    const baseUrl = getApiBase();
    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/logs`);
        const data = await res.json();
        if (!data.length) {
            logList.innerHTML = '<div style="text-align:center; padding:40px; color:var(--text-tertiary); font-size:9px; font-weight:900; opacity:0.3;">STREAM NULL</div>';
            return;
        }
        logList.innerHTML = data.map(log => `
            <div class="log-entry">
                <div style="display:flex; align-items:center; gap:12px;">
                    <i data-lucide="${log.status === 'sent' ? 'check-circle' : 'alert-circle'}" style="width:12px; height:12px; color:${log.status === 'sent' ? 'var(--p-green)' : 'var(--p-red)'};"></i>
                    <div>
                        <div style="font-size:11px; font-weight:900; color:var(--text-primary);">${log.recipient}</div>
                        <div style="font-size:8px; color:var(--text-tertiary);">${new Date(log.sent_at).toLocaleString()}</div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:8px; font-weight:900; color:${log.status === 'sent' ? 'var(--text-secondary)' : 'var(--p-red)'}; text-transform:uppercase;">${log.status}</div>
                    ${log.error_message ? `<div style="font-size:7px; color:var(--p-red); opacity:0.7;">${log.error_message.substring(0, 20)}...</div>` : ''}
                </div>
            </div>
        `).join('');
        if (window.lucide) window.lucide.createIcons();
    } catch (e) { console.error(e); }
}

async function loadSettings() {
    const baseUrl = getApiBase();
    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/settings`);
        const data = await res.json();
        document.getElementById('setting-report-enabled').checked = data.daily_report_enabled;
        document.getElementById('setting-report-time').value = data.report_time;
        document.getElementById('setting-sender-name').value = data.sender_name || '';
        document.getElementById('setting-sender-email').value = data.sender_email || '';
        if (data.last_report_sent_at) {
            const date = new Date(data.last_report_sent_at);
            document.getElementById('last-sync-val').innerText = `LAST: ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
    } catch (e) { }
}

async function saveSettings() {
    const btn = document.getElementById('adm-save-settings-btn');
    const baseUrl = getApiBase();
    btn.disabled = true; btn.innerText = "SAVING...";
    try {
        await adminFetch(`${baseUrl}/admin/emails/settings`, {
            method: 'PUT',
            body: {
                daily_report_enabled: document.getElementById('setting-report-enabled').checked,
                report_time: document.getElementById('setting-report-time').value,
                sender_name: document.getElementById('setting-sender-name').value,
                sender_email: document.getElementById('setting-sender-email').value
            }
        });
        showToast("Configuration Locked.");
        loadSettings();
    } catch (e) { showToast("Sync Failed.", "error"); }
    finally { btn.disabled = false; btn.innerText = "SAVE PROTOCOL"; }
}

async function initiateGlobalSync() {
    const btn = document.getElementById('adm-send-now-btn');
    const targetDate = document.getElementById('sync-target-date').value;
    btn.disabled = true;
    const baseUrl = getApiBase();
    try {
        const url = new URL(`${baseUrl}/admin/emails/trigger`);
        if (targetDate) url.searchParams.append('date', targetDate);
        const res = await adminFetch(url.toString(), { method: 'POST' });
        if (res.ok) {
            showToast(`Sync requested ${targetDate || ''}`);
            setTimeout(loadLogs, 3000);
        }
    } catch (e) { showToast("Sync failed", "error"); }
    finally { btn.disabled = false; }
}

async function saveNewRecipient() {
    const name = document.getElementById('modal-r-name').value;
    const email = document.getElementById('modal-r-email').value;
    const dept = document.getElementById('modal-r-dept').value;
    const baseUrl = getApiBase();
    if (!name || !email) return showToast("Fields required", "error");
    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/recipients`, {
            method: 'POST', body: { name, email, department: dept }
        });
        if (res.ok) {
            document.getElementById('adm-email-modal').style.display = 'none';
            loadRecipients();
            showToast("Node Registered.");
        }
    } catch (e) { showToast("Error", "error"); }
}

window._toggleRecipient = async (id, isActive) => {
    const baseUrl = getApiBase();
    try {
        await adminFetch(`${baseUrl}/admin/emails/recipients/${id}`, {
            method: 'PUT', body: { is_active: isActive }
        });
    } catch (e) { loadRecipients(); }
};

window._deleteRecipient = async (id) => {
    if (!confirm("Terminate node?")) return;
    const baseUrl = getApiBase();
    try {
        await adminFetch(`${baseUrl}/admin/emails/recipients/${id}`, { method: 'DELETE' });
        loadRecipients();
    } catch (e) { }
};

window._sendQuickTest = async (email) => {
    const baseUrl = getApiBase();
    try {
        await adminFetch(`${baseUrl}/admin/emails/send-test`, {
            method: 'POST', body: { email }
        });
        showToast("Signal sent.");
    } catch (e) { }
};

async function clearEmailLogs() {
    if (!confirm("Purge all transmission logs?")) return;
    const baseUrl = getApiBase();
    try {
        await adminFetch(`${baseUrl}/admin/emails/logs`, { method: 'DELETE' });
        loadLogs();
        showToast("Archive purged.");
    } catch (e) { showToast("Purge failed", "error"); }
}

function showToast(msg, type = "success") {
    const toast = document.createElement('div');
    toast.style = `position:fixed; bottom:32px; right:32px; padding:12px 24px; border-radius:12px; background:${type === 'error' ? '#ef4444' : 'var(--text-primary)'}; color:${type === 'error' ? 'white' : 'var(--bg-page)'}; font-size:13px; font-weight:800; z-index:9999; border:1px solid rgba(255,255,255,0.1); backdrop-filter:blur(10px);`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}
