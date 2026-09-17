import { adminFetch, getApiBase } from '../utils/api.js?v=2.2';

export async function renderEmails() {
    const container = document.getElementById('admin-content');
    if (!container) return;

    container.innerHTML = `
        <div class="anim-in">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
                <div>
                    <h1 style="font-size:28px; font-weight:900; color:var(--text-primary); margin:0; letter-spacing:-0.5px;">Email Management</h1>
                    <p style="font-size:13px; color:var(--text-tertiary); margin:4px 0 0 0;">Configure automated reporting and recipient distribution.</p>
                </div>
                <div style="display:flex; gap:12px;">
                    <button id="adm-send-now-btn" class="bb-btn-secondary" style="height:42px; padding:0 20px; border-radius:12px; font-size:11px; font-weight:800; display:flex; align-items:center; gap:10px; letter-spacing:0.5px;">
                        <i data-lucide="send" style="width:16px;height:16px;"></i>
                        TRIGGER FULL REPORT
                    </button>
                    <button id="adm-add-recipient-btn" class="bb-btn-primary" style="height:42px; padding:0 20px; border-radius:12px; font-size:11px; font-weight:800; display:flex; align-items:center; gap:10px; letter-spacing:0.5px;">
                        <i data-lucide="plus" style="width:16px;height:16px;"></i>
                        NEW RECIPIENT
                    </button>
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 380px; gap:32px;">
                <!-- Left: Recipients & History -->
                <div style="display:flex; flex-direction:column; gap:32px;">
                    
                    <!-- Recipients Section -->
                    <div class="bb-card" style="padding:0; overflow:hidden; border:1px solid var(--border-glass);">
                        <div style="padding:18px 24px; border-bottom:1px solid var(--border-glass); background:rgba(255,255,255,0.02); display:flex; justify-content:space-between; align-items:center;">
                            <span style="font-weight:800; font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--text-secondary);">Recipients Directory</span>
                            <span id="recipient-count-badge" class="badge" style="background:rgba(255,255,255,0.05); color:var(--text-tertiary);">0 Total</span>
                        </div>
                        <div style="overflow-x:auto;">
                            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                                <thead>
                                    <tr style="border-bottom:1px solid var(--border-glass);">
                                        <th style="text-align:left; padding:16px 24px; color:var(--text-tertiary); font-weight:700; font-size:11px; text-transform:uppercase;">Recipient</th>
                                        <th style="text-align:left; padding:16px 24px; color:var(--text-tertiary); font-weight:700; font-size:11px; text-transform:uppercase;">Department</th>
                                        <th style="text-align:center; padding:16px 24px; color:var(--text-tertiary); font-weight:700; font-size:11px; text-transform:uppercase;">Status</th>
                                        <th style="text-align:right; padding:16px 24px; color:var(--text-tertiary); font-weight:700; font-size:11px; text-transform:uppercase;">Actions</th>
                                    </tr>
                                </thead>
                                <tbody id="recipient-list-body">
                                    <tr><td colspan="4" style="padding:60px; text-align:center; color:var(--text-tertiary); font-family:var(--font-mono); font-size:12px;">Syncing data directory...</td></tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <!-- History Section -->
                    <div class="bb-card" style="padding:0; border:1px solid var(--border-glass);">
                        <div style="padding:18px 24px; border-bottom:1px solid var(--border-glass); background:rgba(255,255,255,0.02);">
                            <span style="font-weight:800; font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--text-secondary);">Transmission Logs</span>
                        </div>
                        <div style="max-height:440px; overflow-y:auto; padding:12px;" id="email-log-list">
                            <!-- Logs here -->
                        </div>
                    </div>

                </div>

                <!-- Right: Settings -->
                <div style="display:flex; flex-direction:column; gap:32px;">
                    
                    <div class="bb-card" style="border:1px solid var(--border-glass); padding:24px;">
                        <h3 style="margin:0 0 24px 0; font-size:13px; font-weight:800; color:var(--text-primary); text-transform:uppercase; letter-spacing:1.5px; display:flex; align-items:center; gap:10px;">
                            <i data-lucide="settings-2" style="width:16px;height:16px; color:var(--neon-cyan);"></i>
                            Automated Engine
                        </h3>
                        
                        <div style="display:flex; flex-direction:column; gap:24px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.03); padding:16px; border-radius:14px; border:1px solid var(--border-glass);">
                                <div>
                                    <div style="font-weight:700; font-size:13px; color:var(--text-primary);">Broadcast Status</div>
                                    <div style="font-size:11px; color:var(--text-tertiary);">Send reports after scrape</div>
                                </div>
                                <label class="adm-toggle">
                                    <input type="checkbox" id="setting-report-enabled">
                                    <span class="slider" style="background-color: var(--accent-blue);"></span>
                                </label>
                            </div>

                            <div class="bb-input-group">
                                <label style="font-size:11px; font-weight:800; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:8px; display:block;">Report Schedule (Daily)</label>
                                <input type="time" id="setting-report-time" class="adm-input" style="height:44px; border-radius:12px; padding:0 16px; font-weight:600;">
                            </div>

                            <div class="bb-input-group">
                                <label style="font-size:11px; font-weight:800; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:8px; display:block;">Sender Identity</label>
                                <input type="text" id="setting-sender-name" class="adm-input" style="height:44px; border-radius:12px; padding:0 16px; margin-bottom:12px;" placeholder="Sender Display Name">
                                <input type="email" id="setting-sender-email" class="adm-input" style="height:44px; border-radius:12px; padding:0 16px;" placeholder="sender@domain.com">
                            </div>

                            <button id="adm-save-settings-btn" class="bb-btn-primary" style="width:100%; height:46px; border-radius:14px; font-weight:800; font-size:12px; letter-spacing:1px; margin-top:8px;">
                                COMMIT CHANGES
                            </button>
                        </div>
                    </div>

                    <div style="background:rgba(34,197,94,0.02); border:1px solid rgba(34,197,94,0.1); border-radius:20px; padding:24px; position:relative; overflow:hidden;">
                        <div style="position:absolute; top:-20px; right:-20px; font-size:100px; color:rgba(34,197,94,0.03); transform:rotate(15deg);"><i data-lucide="shield-check"></i></div>
                        <h3 style="margin:0 0 8px 0; font-size:13px; font-weight:800; color:#22c55e; text-transform:uppercase; letter-spacing:1.5px;">Diagnostic Send</h3>
                        <p style="font-size:12px; color:var(--text-tertiary); line-height:1.6; margin-bottom:20px;">Verify the outbound transmission pipeline immediately.</p>
                        
                        <div style="display:flex; gap:10px;">
                            <input type="email" id="test-email-addr" class="adm-input" style="flex:1; height:40px; border-radius:10px; border-color:rgba(34,197,94,0.1) !important; font-size:12px;" placeholder="recipient@test.com">
                            <button id="adm-test-email-btn" class="bb-btn-secondary" style="height:40px; padding:0 16px; border-radius:10px; color:#22c55e; border-color:rgba(34,197,94,0.2);">
                                <i data-lucide="play" style="width:14px;height:14px;"></i>
                            </button>
                        </div>
                    </div>

                </div>
            </div>
        </div>

        <!-- NEW RECIPIENT MODAL -->
        <div id="adm-email-modal" class="bb-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.85); backdrop-filter:blur(8px); z-index:2000; justify-content:center; align-items:center; padding:20px;">
            <div class="bb-card anim-in" style="width:100%; max-width:440px; border:1px solid var(--border-glass); padding:32px;">
                <h2 style="margin:0 0 8px 0; font-size:20px; font-weight:900; color:var(--text-primary);">Add Recipient</h2>
                <p style="font-size:13px; color:var(--text-tertiary); margin-bottom:24px;">New entry for automated report distribution list.</p>
                
                <div style="display:flex; flex-direction:column; gap:16px;">
                    <div class="bb-input-group">
                        <label style="font-size:11px; font-weight:800; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:6px; display:block;">Full Identity</label>
                        <input type="text" id="modal-r-name" class="adm-input" style="height:44px; border-radius:12px;" placeholder="Harish K.">
                    </div>
                    <div class="bb-input-group">
                        <label style="font-size:11px; font-weight:800; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:6px; display:block;">Electronic Mail</label>
                        <input type="email" id="modal-r-email" class="adm-input" style="height:44px; border-radius:12px;" placeholder="boss@leo.com">
                    </div>
                    <div class="bb-input-group">
                        <label style="font-size:11px; font-weight:800; color:var(--text-tertiary); text-transform:uppercase; margin-bottom:6px; display:block;">Organization Unit</label>
                        <input type="text" id="modal-r-dept" class="adm-input" style="height:44px; border-radius:12px;" placeholder="Management">
                    </div>

                    <div style="display:flex; gap:12px; margin-top:12px;">
                        <button onclick="document.getElementById('adm-email-modal').style.display='none'" class="bb-btn-secondary" style="flex:1; height:44px; border-radius:12px; font-weight:700;">CANCEL</button>
                        <button id="modal-r-save-btn" class="bb-btn-primary" style="flex:1; height:44px; border-radius:12px; font-weight:800;">SAVE ENTRY</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // Attach listeners
    document.getElementById('adm-add-recipient-btn').addEventListener('click', () => {
        document.getElementById('adm-email-modal').style.display = 'flex';
    });
    document.getElementById('modal-r-save-btn').addEventListener('click', saveNewRecipient);
    document.getElementById('adm-save-settings-btn').addEventListener('click', saveSettings);
    document.getElementById('adm-send-now-btn').addEventListener('click', triggerManualReport);
    document.getElementById('adm-test-email-btn').addEventListener('click', sendDiagnosticEmail);

    // Dynamic Logic
    await Promise.all([
        loadRecipients(),
        loadLogs(),
        loadSettings()
    ]);
}

async function loadRecipients() {
    const list = document.getElementById('recipient-list-body');
    const badge = document.getElementById('recipient-count-badge');
    const baseUrl = getApiBase();
    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/recipients`);
        const data = await res.json();

        if (!Array.isArray(data) || data.length === 0) {
            list.innerHTML = '<tr><td colspan="4" style="padding:60px; text-align:center; color:var(--text-tertiary); font-family:var(--font-mono); font-size:12px;">DIRECTORY EMPTY: No recipients active.</td></tr>';
            badge.innerText = '0 Total';
            return;
        }

        badge.innerText = `${data.length} Total`;
        list.innerHTML = data.map(r => `
            <tr style="border-bottom: 1px solid var(--border-glass); transition: background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.01)'" onmouseout="this.style.background='transparent'">
                <td style="padding:16px 24px;">
                    <div style="font-weight:700; color:var(--text-primary); font-size:14px;">${r.name}</div>
                    <div style="font-size:12px; color:var(--text-tertiary);">${r.email}</div>
                </td>
                <td style="padding:16px 24px; color:var(--text-secondary); font-family:var(--font-mono); font-size:11px;">${(r.department || 'GLOBAL').toUpperCase()}</td>
                <td style="padding:16px 24px; text-align:center;">
                    <label class="adm-toggle">
                        <input type="checkbox" ${r.is_active ? 'checked' : ''} onchange="window._toggleRecipient('${r.id}', this.checked)">
                        <span class="slider" style="background-color: var(--accent-blue);"></span>
                    </label>
                </td>
                <td style="padding:16px 24px; text-align:right;">
                    <div style="display:flex; justify-content:flex-end; gap:8px;">
                        <button class="bb-btn-icon" onclick="window._sendQuickTest('${r.email}')" title="Quick Test" style="color:var(--text-tertiary);"><i data-lucide="send" style="width:14px;height:14px;"></i></button>
                        <button class="bb-btn-icon" onclick="window._deleteRecipient('${r.id}')" title="Remove" style="color:#ef4444; opacity:0.6;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
        if (window.lucide) window.lucide.createIcons();
    } catch (e) {
        console.error(e);
        list.innerHTML = `<tr><td colspan="4" style="padding:60px; text-align:center; color:#ef4444; font-size:12px;">IO_ERROR: Failed to retrieve recipients.</td></tr>`;
    }
}

async function loadLogs() {
    const logList = document.getElementById('email-log-list');
    const baseUrl = getApiBase();
    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/logs`);
        const data = await res.json();

        if (!Array.isArray(data) || data.length === 0) {
            logList.innerHTML = '<div style="padding:40px; text-align:center; color:var(--text-tertiary); font-size:11px; text-transform:uppercase; letter-spacing:1px;">No transmission logs found.</div>';
            return;
        }

        logList.innerHTML = data.map(log => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px 16px; border-radius:12px; margin-bottom:8px; background:rgba(255,255,255,0.02); border:1px solid var(--border-glass);">
                <div style="display:flex; align-items:center; gap:16px;">
                    <div style="width:36px; height:36px; border-radius:10px; background:${log.status === 'sent' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'}; display:flex; justify-content:center; align-items:center;">
                        <i data-lucide="${log.status === 'sent' ? 'check' : 'alert-triangle'}" style="width:16px; height:16px; color:${log.status === 'sent' ? '#22c55e' : '#ef4444'};"></i>
                    </div>
                    <div>
                        <div style="font-size:13px; font-weight:700; color:var(--text-primary);">${log.recipient}</div>
                        <div style="font-size:11px; color:var(--text-tertiary);">${new Date(log.sent_at).toLocaleString()}</div>
                    </div>
                </div>
                <div style="font-size:10px; font-weight:900; color:${log.status === 'sent' ? '#22c55e' : '#ef4444'}; text-transform:uppercase; letter-spacing:1px; background:${log.status === 'sent' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; padding:4px 8px; border-radius:6px;">${log.status}</div>
            </div>
        `).join('');
        if (window.lucide) window.lucide.createIcons();
    } catch (e) { console.error(e); }
}

async function loadSettings() {
    const baseUrl = getApiBase();
    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/settings`);
        const s = await res.json();

        document.getElementById('setting-report-enabled').checked = !!s.daily_report_enabled;
        document.getElementById('setting-report-time').value = s.report_time || '09:00';
        document.getElementById('setting-sender-name').value = s.sender_name || 'Tender Intelligence';
        document.getElementById('setting-sender-email').value = s.sender_email || 'reports@leonex.net';
    } catch (e) {
        console.error('Settings load fail:', e);
    }
}

async function saveSettings() {
    const btn = document.getElementById('adm-save-settings-btn');
    const baseUrl = getApiBase();
    btn.disabled = true;
    btn.innerHTML = 'SYNCING...';

    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/settings`, {
            method: 'PUT',
            body: {
                daily_report_enabled: document.getElementById('setting-report-enabled').checked,
                report_time: document.getElementById('setting-report-time').value,
                sender_name: document.getElementById('setting-sender-name').value,
                sender_email: document.getElementById('setting-sender-email').value
            }
        });
        if (!res.ok) throw new Error("Backend rejection");
        showToast("System configuration updated.");
    } catch (e) {
        showToast("Configuration sync failed.", "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'COMMIT CHANGES';
    }
}

async function saveNewRecipient() {
    const btn = document.getElementById('modal-r-save-btn');
    const name = document.getElementById('modal-r-name').value;
    const email = document.getElementById('modal-r-email').value;
    const dept = document.getElementById('modal-r-dept').value;
    const baseUrl = getApiBase();

    if (!name || !email) return showToast("Name and email required", "error");

    btn.disabled = true;
    btn.innerHTML = 'SAVING...';

    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/recipients`, {
            method: 'POST',
            body: { name, email, department: dept }
        });
        if (res.ok) {
            document.getElementById('adm-email-modal').style.display = 'none';
            document.getElementById('modal-r-name').value = '';
            document.getElementById('modal-r-email').value = '';
            document.getElementById('modal-r-dept').value = '';
            loadRecipients();
            showToast("Recipient registered.");
        } else {
            const err = await res.json();
            throw new Error(err.detail || "Registration failed");
        }
    } catch (e) {
        showToast(e.message, "error");
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'SAVE ENTRY';
    }
}

async function triggerManualReport() {
    if (!confirm("Initiate full system tender report distribution?")) return;
    const btn = document.getElementById('adm-send-now-btn');
    const baseUrl = getApiBase();
    btn.disabled = true;

    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/send-now`, { method: 'POST' });
        if (res.ok) {
            showToast("Report distribution initiated.");
            loadLogs();
        } else throw new Error();
    } catch (e) {
        showToast("Auto-generation failed.", "error");
    } finally {
        btn.disabled = false;
    }
}

async function sendDiagnosticEmail() {
    const email = document.getElementById('test-email-addr').value;
    if (!email) return;
    const btn = document.getElementById('adm-test-email-btn');
    const baseUrl = getApiBase();
    btn.disabled = true;

    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/send-test`, {
            method: 'POST',
            body: { email }
        });
        const data = await res.json();
        if (data.status === 'success') showToast("Diagnostic ping successful!");
        else showToast("Diagnostic failed: " + data.message, "error");
        loadLogs();
    } catch (e) {
        showToast(e.message, "error");
    } finally {
        btn.disabled = false;
    }
}

window._sendQuickTest = async (email) => {
    const baseUrl = getApiBase();
    try {
        const res = await adminFetch(`${baseUrl}/admin/emails/send-test`, {
            method: 'POST',
            body: { email }
        });
        if (res.ok) showToast(`Test sent to ${email}`);
    } catch (e) { showToast("Test failed", "error"); }
};

window._toggleRecipient = async (id, isActive) => {
    const baseUrl = getApiBase();
    try {
        await adminFetch(`${baseUrl}/admin/emails/recipients/${id}`, {
            method: 'PUT',
            body: { is_active: isActive }
        });
        showToast(`Recipient status updated.`);
    } catch (e) {
        showToast("Sync failed", "error");
        loadRecipients();
    }
};

window._deleteRecipient = async (id) => {
    if (!confirm("Permanently purge this recipient from the directory?")) return;
    const baseUrl = getApiBase();
    try {
        await adminFetch(`${baseUrl}/admin/emails/recipients/${id}`, { method: 'DELETE' });
        loadRecipients();
        showToast("Purge successful.");
    } catch (e) { showToast("Purge failed", "error"); }
};

function showToast(msg, type = "success") {
    const toast = document.createElement('div');
    toast.style = `position:fixed; bottom:24px; right:24px; padding:12px 24px; border-radius:12px; background:${type === 'error' ? '#ef4444' : '#22c55e'}; color:white; font-size:13px; font-weight:700; z-index:9999; box-shadow:0 10px 30px rgba(0,0,0,0.3); transform:translateY(100px); transition:transform 0.4s cubic-bezier(0.18, 0.89, 0.32, 1.28);`;
    toast.innerText = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.style.transform = 'translateY(0)', 10);
    setTimeout(() => {
        toast.style.transform = 'translateY(100px)';
        setTimeout(() => toast.remove(), 400);
    }, 3000);
}
