document.addEventListener('DOMContentLoaded', () => {
    const apiUrlInput = document.getElementById('api_url');
    const apiKeyInput = document.getElementById('api_key');
    const saveBtn = document.getElementById('save_btn');
    const logs = document.getElementById('logs');
    const dot = document.getElementById('dot');

    function log(msg) {
        logs.innerText = msg;
    }

    // Load existing config
    chrome.storage.local.get(['apiUrl', 'apiKey'], (res) => {
        if (res.apiUrl) apiUrlInput.value = res.apiUrl;
        if (res.apiKey) apiKeyInput.value = res.apiKey;
        checkConnection();
    });

    saveBtn.addEventListener('click', () => {
        const apiUrl = apiUrlInput.value.trim().replace(/\/$/, ""); // remove trailing slash
        const apiKey = apiKeyInput.value.trim();
        chrome.storage.local.set({ apiUrl, apiKey }, () => {
            log('Settings saved.');
            checkConnection();
        });
    });

    async function checkConnection() {
        chrome.storage.local.get(['apiUrl', 'apiKey'], async (c) => {
            if (!c.apiUrl || !c.apiKey) return;
            log('Connecting to cloud API...');
            try {
                const res = await fetch(`${c.apiUrl}/api/extension/config`, {
                    headers: { 'X-Extension-Key': c.apiKey }
                });
                if (res.ok) {
                    const data = await res.json();
                    dot.classList.add('status-connected');
                    log(`Connected! Registered ${data.keywords?.length || 0} keywords.`);

                    // Signal background worker to start polling
                    chrome.runtime.sendMessage({ action: "start_polling" });
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
});
