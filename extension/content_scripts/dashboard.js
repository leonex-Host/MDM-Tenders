/**
 * MDM Extension — Dashboard Helper
 * Runs automatically on the Admin Dashboard page (Render or Localhost).
 * Prevents the MV3 Service Worker from sleeping and provides instant wake-on-click functionality.
 */

console.log("[MDM Agent] Dashboard connection active. Extension is awake and listening.");

chrome.storage.local.get(['clientId'], (data) => {
    let clientId = data.clientId;
    if (!clientId) {
        clientId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
        chrome.storage.local.set({ clientId });
    }
    const div = document.createElement('div');
    div.id = 'extension_client_id';
    div.dataset.clientId = clientId;
    div.style.display = 'none';
    document.body.appendChild(div);
    console.log("[MDM Agent] Core Hardware UUID bridged to dashboard safely:", clientId);
});

// Ping the background worker every 10 seconds to strictly prevent MV3 sleep
setInterval(() => {
    try {
        chrome.runtime.sendMessage({ action: "keep_alive" }, () => {
            // Suppress errors if extension is suddenly reloaded
            if (chrome.runtime.lastError) { }
        });
    } catch (e) { }
}, 10000);

// Whenever the user clicks anything, assume it might be a Start button,
// wait a tiny bit for the dashboard backend API to enqueue the job, and force an immediate pull.
document.addEventListener('click', (e) => {
    // Only trigger if a button or something inside a button was clicked
    if (e.target.closest('button') || e.target.closest('a')) {
        setTimeout(() => {
            try {
                chrome.runtime.sendMessage({ action: "trigger_poll" }, () => {
                    if (chrome.runtime.lastError) { }
                });
            } catch (ex) { }
        }, 300); // 300ms latency to allow the POST /start request to hit Render
    }
});
