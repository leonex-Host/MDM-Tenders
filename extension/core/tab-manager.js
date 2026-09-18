import { CONFIG } from '../config.js';

export async function createJobTab() {
    const win = await chrome.windows.create({ url: "about:blank", state: "normal" });
    return { windowId: win.id, tabId: win.tabs[0].id };
}

export async function closeJobTab(windowId) {
    if (windowId) {
        await chrome.windows.remove(windowId).catch(() => { });
    }
}

export async function navigateAndWait(tabId, url, timeout = CONFIG.TAB_TIMEOUT_MS) {
    await chrome.tabs.update(tabId, { url });
    return await waitForComplete(tabId, timeout);
}

export async function waitForComplete(tabId, timeout = CONFIG.TAB_TIMEOUT_MS) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        try {
            const tab = await chrome.tabs.get(tabId);
            if (tab.status === "complete" && tab.url && !tab.url.startsWith("about:")) {
                await new Promise(r => setTimeout(r, 1800)); // stabilization
                return tab;
            }
        } catch (e) { return null; } // Tab closed or unavailable
        await new Promise(r => setTimeout(r, 800));
    }
    return null;
}

export function executeContentScript(tabId, action, payload = null) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action, ...payload }, (response) => {
            if (chrome.runtime.lastError) {
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}
