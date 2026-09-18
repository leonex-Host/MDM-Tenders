document.addEventListener('DOMContentLoaded', () => {
    const apiUrlInput = document.getElementById('api_url');
    const apiKeyInput = document.getElementById('api_key');
    const saveBtn = document.getElementById('save_btn');
    const resumeBtn = document.getElementById('resume_btn');
    const abortBtn = document.getElementById('abort_btn');
    const logs = document.getElementById('logs');
    const statusIndicator = document.getElementById('status_indicator');
    const statusText = document.getElementById('status_text');

    // UI Panels
    const metricsPanel = document.getElementById('metrics_panel');
    const configPanel = document.getElementById('config_panel');

    // Metrics fields
    const mSource = document.getElementById('m_source');
    const mExtracted = document.getElementById('m_extracted');
    const mPhaseKwd = document.getElementById('m_phase_kwd');
    const logTime = document.getElementById('log_time');

    function log(msg) {
        logs.innerText = msg;
        const now = new Date();
        logTime.innerText = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    }

    chrome.storage.local.get(['apiUrl', 'apiKey'], (res) => {
        if (res.apiUrl) apiUrlInput.value = res.apiUrl;
        if (res.apiKey) apiKeyInput.value = res.apiKey;
        checkConnection();
    });

    saveBtn.addEventListener('click', () => {
        const apiUrl = apiUrlInput.value.trim().replace(/\/$/, "");
        const apiKey = apiKeyInput.value.trim();
        saveBtn.innerHTML = "Linking...";
        chrome.storage.local.set({ apiUrl, apiKey }, () => {
            log('Secure credentials saved.');
            checkConnection();
            setTimeout(() => {
                saveBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg> Authenticate & Link`;
            }, 1000);
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
                abortBtn.innerHTML = "Aborting Local Loop...";
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
                log('Standby: Awaiting Render Hub credentials.');
                return;
            }
            log('Handshaking with MDM Render Server...');
            try {
                const res = await fetch(`${c.apiUrl}/api/extension/config`, {
                    headers: { 'X-Extension-Key': c.apiKey }
                });
                if (res.ok) {
                    statusIndicator.classList.add('status-connected');
                    statusText.innerText = 'Synchronized';
                    log(`Telemetry link established securely.`);
                    chrome.runtime.sendMessage({ action: "start_polling" });
                    pollStatus();
                } else {
                    statusIndicator.classList.remove('status-connected');
                    statusText.innerText = 'Denied';
                    log(`Auth Failed: Edge server rejected key (HTTP ${res.status})`);
                }
            } catch (err) {
                statusIndicator.classList.remove('status-connected');
                statusText.innerText = 'Offline';
                log('Fatal: Cannot reach Render Hub. Check network.');
            }
        });
    }

    function pollStatus() {
        chrome.storage.local.get(['extensionState', 'activeJob'], (res) => {
            const extState = res.extensionState || { blocked: false };

            if (res && res.activeJob) {
                const j = res.activeJob;
                // Job is actively bound to this laptop
                metricsPanel.style.display = 'block';
                configPanel.style.display = 'none';

                mSource.innerText = String(j.source).toUpperCase();
                mExtracted.innerText = (j.resultsCollected || 0).toLocaleString();

                const ph = String(j.phase || 'N/A').toUpperCase();
                const kw = j.keyword || '...';
                mPhaseKwd.innerText = `${ph} / [${kw}]`;

                if (extState.blocked) {
                    log(`HALTED: ${extState.blockReason || 'Manual Action Required'}. Solve challenge then click Resume.`);
                    metricsPanel.style.borderColor = 'rgba(245, 158, 11, 0.4)'; // Warning color
                    resumeBtn.style.display = 'flex';
                    abortBtn.style.display = 'flex';
                } else {
                    resumeBtn.style.display = 'none';
                    abortBtn.style.display = 'flex';
                    metricsPanel.style.borderColor = 'rgba(16, 185, 129, 0.3)'; // Success color
                    log(`Engine Live: Synchronizing batch payload [${j.job_id}]`);
                }
            } else {
                // No active job
                metricsPanel.style.display = 'none';
                configPanel.style.display = 'block';
                resumeBtn.style.display = 'none';
                abortBtn.style.display = 'none';

                if (statusIndicator.classList.contains('status-connected')) {
                    log(`Polling queue every 5s...`);
                }
            }
        });
    }

    // Auto-update UI every 1.5 seconds for live feel
    setInterval(() => {
        if (statusIndicator.classList.contains('status-connected')) {
            pollStatus();
        }
    }, 1500);
});
