import { CONFIG } from '../config.js';
import { validateExtensionJob } from './job-manager.js';

export async function createJobTab(runtime) {
    const id = runtime?.jobId || 'UNKNOWN';
    try {
        console.log(`[TabManager][${id}] Creating logical isolated tab: about:blank`);
        const tab = await chrome.tabs.create({ url: "about:blank", active: true });
        console.log(`[TabManager][${id}] Successfully allocated Tab ID:`, tab.id);
        return { windowId: tab.windowId, tabId: tab.id };
    } catch (e) {
        console.error(`[TabManager][${id}] FATAL chrome.tabs.create error:`, e);
        throw e;
    }
}

export async function closeJobTab(tabId) {
    if (tabId) {
        await chrome.tabs.remove(tabId).catch(() => { });
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
    console.log(`[BidDetailTrace] content script injection: sending message "${action}" to tab ${tabId}`);
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action, ...payload }, (response) => {
            if (chrome.runtime.lastError) {
                console.warn(`[BidDetailTrace] content script injection warning for "${action}":`, chrome.runtime.lastError.message);
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}
