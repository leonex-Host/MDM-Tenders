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
    const resumeBtn = document.getElementById('resume_btn');

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

    if (resumeBtn) {
        resumeBtn.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: "resume_manual" }, (res) => {
                if (res?.resumed) {
                    log("Resuming from Captcha...");
                    resumeBtn.style.display = 'none';
                    pollStatus();
                }
            });
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
                            <span class="job-source">${(j.source || 'unknown').toUpperCase()}</span>
                            <span class="job-status ${j.status || 'running'}">${(j.status || 'running').toUpperCase()}</span>
                        </div>
                        <div class="job-id">ID: ${j.job_id || '?'}</div>
                    </div>
                `).join('');
            }

            log(`Active: ${jobs.length} job(s) running.`);
        });

        // Check if globally blocked by Captcha
        chrome.storage.local.get(['extensionState'], (data) => {
            if (data.extensionState && data.extensionState.blocked) {
                if (resumeBtn) resumeBtn.style.display = 'inline-block';
                log(`PAUSED: ${data.extensionState.blockReason || 'Captcha'}`);
            } else {
                if (resumeBtn) resumeBtn.style.display = 'none';
            }
        });
    }

    // Auto-refresh every 2s
    setInterval(() => {
        if (connected) pollStatus();
    }, 2000);
});
