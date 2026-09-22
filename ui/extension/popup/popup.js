document.addEventListener('DOMContentLoaded', () => {
    const apiUrlInput = document.getElementById('api_url');
    const apiKeyInput = document.getElementById('api_key');
    const saveBtn = document.getElementById('save_btn');
    const logs = document.getElementById('logs');
    const dot = document.getElementById('dot');
    const configPanel = document.getElementById('config_panel');
    const jobsPanel = document.getElementById('jobs_panel');
    const jobsList = document.getElementById('jobs_list');
    const jobCount = document.getElementById('job_count');
    const abortBtn = document.getElementById('abort_btn');

    let connected = false;

    function log(msg) { logs.innerText = msg; }

    // Load config
    chrome.storage.local.get(['apiUrl', 'apiKey'], (res) => {
        if (res.apiUrl) apiUrlInput.value = res.apiUrl;
        if (res.apiKey) apiKeyInput.value = res.apiKey;
        checkConnection();
    });

    saveBtn.addEventListener('click', () => {
        const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "");
        const apiKey = apiKeyInput.value.trim();
        chrome.storage.local.set({ apiUrl, apiKey }, () => {
            log('Saved!');
            checkConnection();
        });
    });

    if (abortBtn) {
        abortBtn.addEventListener('click', () => {
            if (confirm("ABORT ALL running jobs?")) {
                chrome.runtime.sendMessage({ action: "abort_manual" });
                log("All jobs aborted.");
            }
        });
    }

    async function checkConnection() {
        chrome.storage.local.get(['apiUrl', 'apiKey'], async (c) => {
            if (!c.apiUrl || !c.apiKey) return;
            log('Connecting...');
            try {
                const res = await fetch(`${c.apiUrl}/api/extension/config`, {
                    headers: { 'X-Extension-Key': c.apiKey }
                });
                if (res.ok) {
                    connected = true;
                    dot.classList.add('on');
                    configPanel.classList.remove('show');
                    jobsPanel.classList.add('show');
                    log(`Connected! Polling for jobs...`);
                    chrome.runtime.sendMessage({ action: "start_polling" });
                    pollStatus();
                } else {
                    dot.classList.remove('on');
                    log(`Auth failed (HTTP ${res.status})`);
                }
            } catch (err) {
                dot.classList.remove('on');
                log('Cannot reach API.');
            }
        });
    }

    function pollStatus() {
        chrome.runtime.sendMessage({ action: "get_status" }, (res) => {
            if (!res) return;
            const jobs = res.jobs || [];
            jobCount.innerText = `${jobs.length} JOB${jobs.length !== 1 ? 'S' : ''}`;

            if (jobs.length === 0) {
                jobsList.innerHTML = '<div class="empty-state">Polling for jobs...</div>';
                abortBtn.style.display = 'none';
            } else {
                abortBtn.style.display = 'inline-block';
                jobsList.innerHTML = jobs.map(j => `
                    <div class="job-card">
                        <div class="job-header">
                            <div>
                                <span class="job-source">${j.source}</span>
                                <span class="job-id">ID: ${j.job_id}</span>
                            </div>
                            <span class="job-status ${j.status || 'starting'}">${(j.status || 'STARTING').toUpperCase()}</span>
                        </div>
                        <div class="job-metrics" style="background: rgba(0, 0, 0, 0.4); border-radius: 8px; padding: 10px; margin-bottom: 12px; font-size:11px;">
                            <div class="metric-row" style="display:flex; justify-content:space-between; margin-bottom: 6px;">
                                <span class="metric-label" style="color:var(--text-muted); font-size:9px;">PHASE ACTIVITY</span>
                                <span class="metric-val" style="color:#fff; font-weight:700;">${(j.phase || 'BOOTING').toUpperCase()}</span>
                            </div>
                            <div class="metric-row" style="display:flex; justify-content:space-between; margin-bottom: 6px;">
                                <span class="metric-label" style="color:var(--text-muted); font-size:9px;">CURRENT KEYWORD</span>
                                <span class="metric-val hlt" style="color:var(--accent); font-weight:700;">${j.keyword || 'Wait...'} <span style="font-size:9px; color:#6b7280; font-weight:900;">(${j.current_keyword_index || 0}/${j.total_keywords || 0})</span></span>
                            </div>
                            <div class="metric-row" style="display:flex; justify-content:space-between; margin-bottom: 6px;">
                                <span class="metric-label" style="color:var(--text-muted); font-size:9px;">FOUNDED</span>
                                <span class="metric-val" style="color:#fff; font-weight:700;">${j.results || 0}</span>
                            </div>
                            <div class="metric-row" style="display:flex; justify-content:space-between; margin-bottom: 6px;">
                                <span class="metric-label" style="color:var(--text-muted); font-size:9px;">REMOVED</span>
                                <span class="metric-val" style="color:var(--warning); font-weight:700;">${j.duplicates || 0}</span>
                            </div>
                            <div class="metric-row" style="display:flex; justify-content:space-between; margin-top: 2px;">
                                <span class="metric-label" style="color:var(--text-muted); font-size:9px;">SAVED DATABASE</span>
                                <span class="metric-val" style="color:var(--success); font-weight:700; font-size:12px;">${j.inserted || 0} ITEMS</span>
                            </div>
                        </div>
                        <div class="job-actions" style="display: flex; gap: 8px; justify-content: flex-end;">
                            ${(j.inserted > 0 || j.results > 0) ? `<a href="${j.source === 'google' ? 'https://mdm-tenders.vercel.app/#/google' : 'https://mdm-tenders.vercel.app/#/mdm-tenders'}" target="_blank" class="btn btn-sm" style="background:#2563eb; color:#fff; text-decoration:none; padding: 6px 12px; border-radius: 6px; font-weight:700; font-size:10px; display:inline-block; text-align:center;">VISIT DB</a>` : ''}
                        </div>
                    </div>
                `).join('');
            }

            log(`Active: ${jobs.length} job(s) running.`);
        });
    }

    // Auto-refresh every 2s
    setInterval(() => {
        if (connected) pollStatus();
    }, 2000);
});
