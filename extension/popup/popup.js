document.addEventListener('DOMContentLoaded', () => {
    const apiUrlInput = document.getElementById('api_url');
    const apiKeyInput = document.getElementById('api_key');
    const saveBtn = document.getElementById('save_btn');
    const logs = document.getElementById('logs');

    const configPanel = document.getElementById('config_panel');
    const jobsPanel = document.getElementById('jobs_panel');
    const jobsList = document.getElementById('jobs_list');
    const jobCount = document.getElementById('job_count');

    const abortAllBtn = document.getElementById('abort_all_btn');

    const btnHistory = document.getElementById('btn-history');
    const closeHistory = document.getElementById('close-history');
    const historyPanel = document.getElementById('history_panel');
    const historyDot = document.getElementById('history-dot');

    if (btnHistory && closeHistory && historyPanel) {
        btnHistory.addEventListener('click', () => {
            const isShowing = historyPanel.style.display === 'block';
            historyPanel.style.display = isShowing ? 'none' : 'block';
            const jobsPanel = document.getElementById('jobs_panel');
            if (jobsPanel) jobsPanel.style.display = isShowing ? 'block' : 'none';
        });
        closeHistory.addEventListener('click', () => {
            historyPanel.style.display = 'none';
            const jobsPanel = document.getElementById('jobs_panel');
            if (jobsPanel) jobsPanel.style.display = 'block';
        });
    }

    const btnDownload = document.getElementById('btn-download');
    if (btnDownload) {
        btnDownload.addEventListener('click', () => {
            chrome.storage.local.get(['apiUrl', 'apiKey'], (c) => {
                if (!c.apiUrl) return;
                const baseUrl = c.apiUrl.replace(/\/$/, "");
                const executor = "Chrome Extension Root";

                const dl1 = document.createElement('a');
                dl1.href = `${baseUrl}/api/admin/export/tenders/excel?executor=${encodeURIComponent(executor)}`;
                dl1.target = '_blank';
                dl1.click();

                setTimeout(() => {
                    const dl2 = document.createElement('a');
                    dl2.href = `${baseUrl}/api/admin/export/google/excel?executor=${encodeURIComponent(executor)}`;
                    dl2.target = '_blank';
                    dl2.click();
                }, 500);
            });
        });
    }

    let connected = false;

    function log(msg) { logs.innerText = msg; }

    chrome.storage.local.get(['apiUrl', 'apiKey'], (res) => {
        if (res.apiUrl) apiUrlInput.value = res.apiUrl;
        if (res.apiKey) apiKeyInput.value = res.apiKey;
        checkConnection();
    });

    saveBtn.addEventListener('click', () => {
        const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "");
        const apiKey = apiKeyInput.value.trim();
        chrome.storage.local.set({ apiUrl, apiKey }, () => {
            log('Saved configured API route!');
            checkConnection();
        });
    });

    if (abortAllBtn) {
        abortAllBtn.addEventListener('click', () => {
            if (confirm("EMERGENCY ABORT ALL running engine systems?")) {
                chrome.runtime.sendMessage({ action: "abort_manual" });
                log("Systems aborted natively.");
            }
        });
    }

    async function checkConnection() {
        chrome.storage.local.get(['apiUrl', 'apiKey'], async (c) => {
            if (!c.apiUrl || !c.apiKey) return;
            log('Connecting orchestrator...');
            try {
                const res = await fetch(`${c.apiUrl}/api/extension/config`, {
                    headers: { 'X-Extension-Key': c.apiKey }
                });
                if (res.ok) {
                    connected = true;
                    configPanel.classList.remove('show');
                    jobsPanel.classList.add('show');
                    log(`Linked securely. Polling internal metrics...`);
                    chrome.runtime.sendMessage({ action: "start_polling" });
                    pollStatus();
                } else {
                    log(`Auth failed remotely (HTTP ${res.status})`);
                }
            } catch (err) {
                log('API infrastructure not accessible.');
            }
        });
    }

    function pollStatus() {
        chrome.runtime.sendMessage({ action: "get_status" }, (res) => {
            if (!res) return;
            const jobs = res.jobs || [];
            jobCount.innerText = `${jobs.length} JOB${jobs.length !== 1 ? 'S' : ''}`;

            if (jobs.length === 0) {
                jobsList.innerHTML = '<div class="empty-state">No active sequences running currently.</div>';
                abortAllBtn.style.display = 'none';
            } else {
                abortAllBtn.style.display = 'block';

                jobsList.innerHTML = jobs.map(j => `
                    <div class="job-card">
                        <div class="job-header">
                            <div>
                                <span class="job-source">${j.source}</span>
                                <span class="job-id">ID: ${j.job_id}</span>
                            </div>
                            <span class="job-status ${j.status || 'starting'}">${j.status || 'STARTING'}</span>
                        </div>
                        <div class="job-metrics">
                            <div class="metric-row">
                                <span class="metric-label">PHASE ACTIVITY</span>
                                <span class="metric-val">${(j.phase || 'BOOTING').toUpperCase()}</span>
                            </div>
                            <div class="metric-row">
                                <span class="metric-label">CURRENT KEYWORD</span>
                                <span class="metric-val hlt" title="${j.keyword ? j.keyword.replace(/"/g, '&quot;') : 'Wait...'}"><span style="font-size:9px; color:#fff; font-weight:900; margin-right:4px;">(${j.current_keyword_index || 0}/${j.total_keywords || 0})</span>${j.keyword || 'Wait...'}</span>
                            </div>
                            <div class="metric-row">
                                <span class="metric-label">FOUNDED</span>
                                <span class="metric-val" style="color:#fff;">${j.results || 0}</span>
                            </div>
                            <div class="metric-row">
                                <span class="metric-label">DUPLICATE</span>
                                <span class="metric-val" style="color:var(--warning);">${j.duplicates || 0}</span>
                            </div>
                            ${j.source === 'google' ? `
                            <div class="metric-row">
                                <span class="metric-label">UNWANTED LINK</span>
                                <span class="metric-val" style="color:#ef4444;">${j.unwantedLinks || 0}</span>
                            </div>
                            ` : ''}
                            <div class="metric-row" style="margin-top:2px;">
                                <span class="metric-label">SAVED DATABASE</span>
                                <span class="metric-val" style="color:var(--success); font-size:12px;">${j.inserted || 0} ITEMS</span>
                            </div>
                        </div>
                        <div class="job-actions">
                            ${(j.inserted > 0 || j.results > 0) ? `<a href="${j.source === 'google' ? 'https://mdm-tenders.vercel.app/#/google' : 'https://mdm-tenders.vercel.app/#/mdm-tenders'}" target="_blank" class="btn btn-sm" style="background:#2563eb; color:#fff; text-decoration:none; padding-top:6px; display:inline-block; text-align:center;">VISIT DB</a>` : ''}
                            ${j.status === 'paused' ?
                        `<button class="btn btn-success btn-sm resume-job-btn" data-id="${j.job_id}">RESUME ENGINE</button>`
                        : ''}
                            <button class="btn btn-danger btn-sm abort-job-btn" data-id="${j.job_id}">ABORT</button>
                        </div>
                    </div>
                `).join('');

                // Attack live listeners
                document.querySelectorAll('.resume-job-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const jid = e.target.getAttribute('data-id');
                        log("Sending resume vector...");
                        chrome.runtime.sendMessage({ action: "resume_manual" }, () => pollStatus());
                    });
                });

                document.querySelectorAll('.abort-job-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const jid = e.target.getAttribute('data-id');
                        if (confirm(`Abort specific target sequence [${jid}]?`)) {
                            log(`Terminating ${jid}...`);
                            chrome.runtime.sendMessage({ action: "abort_job", jobId: jid }, () => pollStatus());
                        }
                    });
                });
            }
        });

        const historyList = document.getElementById('history_list');
        if (historyList) {
            chrome.storage.local.get(['jobHistory'], (data) => {
                const hist = data.jobHistory || [];
                if (historyDot) historyDot.style.display = hist.length > 0 ? 'block' : 'none';

                if (hist.length > 0) {
                    historyList.innerHTML = hist.map(h => `
                        <div class="job-card">
                            <div class="job-header">
                                <div>
                                    <span class="job-source">${h.source || 'UNKNOWN'}</span>
                                    <span class="job-id">${new Date(h.endedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                                </div>
                                <span class="job-status ${h.status}">${h.status}</span>
                            </div>
                            <div class="job-metrics">
                                <div class="metric-row">
                                    <span class="metric-label">FOUNDED</span>
                                    <span class="metric-val" style="color:#fff;">${h.found || 0}</span>
                                </div>
                                <div class="metric-row">
                                    <span class="metric-label">SAVED TENDERS</span>
                                    <span class="metric-val" style="color:var(--success);">${h.inserted || 0}</span>
                                </div>
                                <div class="metric-row">
                                    <span class="metric-label">DUPLICATES</span>
                                    <span class="metric-val" style="color:var(--warning);">${h.duplicates || 0}</span>
                                </div>
                            </div>
                        </div>
                    `).join('');
                } else {
                    historyList.innerHTML = '<div class="empty-state">No history recorded yet.</div>';
                }
            });
        }

        chrome.storage.local.get(['extensionState'], (data) => {
            if (data.extensionState && data.extensionState.blocked) {
                log(`STRUCTURAL BLOCK: ${data.extensionState.blockReason || 'Manual Check Needed'}`);
            }
        });
    }

    setInterval(() => {
        if (connected) pollStatus();
    }, 2000);
});
