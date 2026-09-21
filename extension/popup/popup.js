document.addEventListener('DOMContentLoaded', () => {
    const apiUrlInput = document.getElementById('api_url');
    const apiKeyInput = document.getElementById('api_key');
    const saveBtn = document.getElementById('save_btn');
    const resumeBtn = document.getElementById('resume_btn');
    const abortBtn = document.getElementById('abort_btn');
    const logs = document.getElementById('logs');
    const dot = document.querySelector('.status-dot');

    // UI Panels
    const metricsPanel = document.getElementById('metrics_panel');
    const configPanel = document.getElementById('config_panel');

    // Metrics fields
    const mSource = document.getElementById('m_source');
    const mExtracted = document.getElementById('m_extracted');
    const mPhaseKwd = document.getElementById('m_phase_kwd');

    function log(msg) { logs.innerText = msg; }

    chrome.storage.local.get(['apiUrl', 'apiKey'], (res) => {
        if (res.apiUrl) apiUrlInput.value = res.apiUrl;
        if (res.apiKey) apiKeyInput.value = res.apiKey;
        checkConnection();
    });

    saveBtn.addEventListener('click', () => {
        const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "");
        const apiKey = apiKeyInput.value.trim();
        saveBtn.innerText = "Linking...";
        chrome.storage.local.set({ apiUrl, apiKey }, () => {
            log('Secure credentials saved.');
            checkConnection();
            setTimeout(() => { saveBtn.innerText = "Save & Link"; }, 1000);
        });
    });

    resumeBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "resume_manual" }, (res) => {
            if (res?.resumed) {
                log("Resuming blocked security challenge...");
                resumeBtn.style.display = 'none';
                pollStatus();
            }
        });
    });

    if (abortBtn) {
        abortBtn.addEventListener('click', () => {
            if (confirm("EMERGENCY ABORT: Are you sure you want to instantly terminate the running scrape job strictly on this laptop?")) {
                abortBtn.innerText = "Aborting Local Loop...";
                abortBtn.disabled = true;
                chrome.runtime.sendMessage({ action: "abort_manual" }, (res) => {
                    log("Job Aborted cleanly. Render backend notified.");
                    setTimeout(() => window.close(), 1200);
                });
            }
        });
    }

    async function checkConnection() {
        chrome.storage.local.get(['apiUrl', 'apiKey'], async (c) => {
            if (!c.apiUrl || !c.apiKey) {
                log('Standby: Awaiting credentials.');
                return;
            }
            log('Handshaking with backend...');
            try {
                const res = await fetch(`${c.apiUrl}/api/extension/config`, {
                    headers: { 'X-Extension-Key': c.apiKey }
                });
                if (res.ok) {
                    dot.parentElement.classList.add('status-connected');
                    log(`Telemetry link established securely.`);
                    chrome.runtime.sendMessage({ action: "start_polling" });
                    pollStatus();
                } else {
                    dot.parentElement.classList.remove('status-connected');
                    log(`Auth Failed: Edge server rejected (HTTP ${res.status})`);
                }
            } catch (err) {
                dot.parentElement.classList.remove('status-connected');
                log('Fatal: Cannot reach Server.');
            }
        });
    }

    function pollStatus() {
        chrome.storage.local.get(['extensionState', 'activeJob'], (res) => {
            const extState = res.extensionState || { blocked: false };

            if (res && res.activeJob) {
                const j = res.activeJob;

                metricsPanel.style.display = 'block';
                configPanel.style.display = 'none';

                mSource.innerText = String(j.source).toUpperCase();

                const currentCount = j.phase === 'details'
                    ? (j.kwResults || []).length
                    : (j.allResultsPhase1 || []).length;
                mExtracted.innerText = currentCount.toLocaleString();

                const kw = j.keyword || '...';
                mPhaseKwd.innerText = kw;

                if (extState.blocked) {
                    log(`HALTED: ${extState.blockReason || 'Manual Action Required'}.`);
                    resumeBtn.style.display = 'flex';
                    abortBtn.style.display = 'flex';
                    metricsPanel.style.borderColor = "var(--warning)";
                } else {
                    resumeBtn.style.display = 'none';
                    abortBtn.style.display = 'flex';
                    metricsPanel.style.borderColor = "var(--success)";
                    log(`Engine Live: Synchronizing payload [${j.job_id}]`);
                }
            } else {
                metricsPanel.style.display = 'none';
                configPanel.style.display = 'block';
                resumeBtn.style.display = 'none';
                abortBtn.style.display = 'none';

                if (dot.parentElement.classList.contains('status-connected')) {
                    log(`Polling queue every 5s...`);
                }
            }
        });
    }

    setInterval(() => {
        if (dot.parentElement.classList.contains('status-connected')) {
            pollStatus();
        }
    }, 1500);
});
