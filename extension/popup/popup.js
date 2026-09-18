document.addEventListener('DOMContentLoaded', () => {
    const apiUrlInput = document.getElementById('api_url');
    const apiKeyInput = document.getElementById('api_key');
    const saveBtn = document.getElementById('save_btn');
    const resumeBtn = document.getElementById('resume_btn');
    const logs = document.getElementById('logs');
    const dot = document.getElementById('dot');

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
            log('Settings saved.');
            checkConnection();
        });
    });

    resumeBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: "resume_manual" }, (res) => {
            if (res?.resumed) {
                log("Resumed workflow.");
                resumeBtn.style.display = 'none';
                pollStatus();
            }
        });
    });

    async function checkConnection() {
        chrome.storage.local.get(['apiUrl', 'apiKey'], async (c) => {
            if (!c.apiUrl || !c.apiKey) {
                log('Please enter API URL and Key.');
                return;
            }
            log('Connecting to cloud API...');
            try {
                const res = await fetch(`${c.apiUrl}/api/extension/config`, {
                    headers: { 'X-Extension-Key': c.apiKey }
                });
                if (res.ok) {
                    dot.classList.add('status-connected');
                    log(`Connected!`);
                    chrome.runtime.sendMessage({ action: "start_polling" });
                    pollStatus();
                } else {
                    dot.classList.remove('status-connected');
                    log(`Error: Cloud refused connection (HTTP ${res.status})`);
                }
            } catch (err) {
                dot.classList.remove('status-connected');
                log('Error: Cannot reach API. Server offline?');
            }
        });
    }

    function pollStatus() {
        chrome.storage.local.get(['extensionState', 'activeJob'], (res) => {
            const extState = res.extensionState || { blocked: false };
            if (extState.blocked) {
                log(`PAUSED: ${extState.blockReason || 'Authentication or Manual Action Required'}. Please resolve and click Resume.`);
                resumeBtn.style.display = 'block';
                return;
            }

            if (res && res.activeJob) {
                const j = res.activeJob;
                resumeBtn.style.display = 'none';
                log(`Job ${j.job_id} | ${j.source} | Phase: ${j.phase || 'N/A'}\nKeyword: ${j.keyword || '...'}`);
            } else {
                resumeBtn.style.display = 'none';
                log(`Connected and Waiting for jobs...`);
            }
        });
    }

    // Auto-update UI every 2 seconds
    setInterval(() => {
        if (dot.classList.contains('status-connected')) {
            pollStatus();
        }
    }, 2000);
});
