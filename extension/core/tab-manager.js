import { CONFIG } from '../config.js';
import { validateExtensionJob } from './job-manager.js';

export async function createJobTab(job) {
    if (job) {
        const validation = validateExtensionJob(job);
        if (!validation.valid) {
            console.error("[TabManager] Refusing to create tab:", validation.reason);
            throw new Error(`Cannot create tab: ${validation.reason}`);
        }

        const validJob = validation.job;
        if (validJob.target_url) {
            const parsedUrl = new URL(validJob.target_url);
            if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                throw new Error("Refusing to open non-web URL");
            }
            console.log("[BidDetailTrace] opening target URL:", {
                origin: parsedUrl.origin,
                pathname: parsedUrl.pathname,
                source: validJob.source,
                job_id: validJob.job_id
            });
        }
    }

    try {
        console.log("[BidDetailTrace] opening tab URL: about:blank");
        const win = await chrome.windows.create({ url: "about:blank", state: "normal" });
        const tid = win.tabs[0].id;
        console.log("[BidDetailTrace] chrome.tabs.create result: window created");
        console.log("[BidDetailTrace] tab created ID:", tid);
        return { windowId: win.id, tabId: tid };
    } catch (e) {
        console.error("[BidDetailTrace] chrome.tabs.create result/error:", e);
        throw e;
    }
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
    console.log(`[BidDetailTrace] content script injection: sending message "${action}" to tab ${tabId}`);
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { action, ...payload }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(`[BidDetailTrace] content script injection error for "${action}":`, chrome.runtime.lastError.message);
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}
