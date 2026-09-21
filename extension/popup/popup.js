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
                                <span class="metric-val hlt" title="${j.keyword ? j.keyword.replace(/"/g, '&quot;') : 'Wait...'}">${j.keyword || 'Wait...'}</span>
                            </div>
                            <div class="metric-row">
                                <span class="metric-label">RESULTS ISOLATED</span>
                                <span class="metric-val">${j.results || 0} ITEMS</span>
                            </div>
                        </div>
                        <div class="job-actions">
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
