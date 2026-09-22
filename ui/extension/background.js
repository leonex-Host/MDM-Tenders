// ═══════════════════════════════════════════════════════════════
// MDM Extension — Concurrent Multi-Tab Background Worker
// Each scraper job opens its OWN visible Chrome window/tab.
// Multiple jobs run simultaneously (up to 6).
// ═══════════════════════════════════════════════════════════════

const activeJobs = new Map();   // jobId → { job, conf, tabId, windowId, status }
const MAX_CONCURRENT = 6;

async function initPolling() {
    const conf = await chrome.storage.local.get(['apiUrl', 'apiKey']);
    if (conf.apiUrl && conf.apiKey) {
        console.log("[MDM Agent] Polling active...");
        pollForJobs();
    }
}

initPolling();

chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepAlive") pollForJobs();
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_polling") {
        initPolling();
        sendResponse({ started: true });
    } else if (request.action === "get_status") {
        const jobs = [];
        for (const [id, rt] of activeJobs.entries()) {
            jobs.push({ job_id: id, source: rt.job.source, status: rt.status });
        }
        sendResponse({ jobs, count: jobs.length });
        return false;
    } else if (request.action === "abort_manual") {
        (async () => {
            const conf = await chrome.storage.local.get(['apiUrl', 'apiKey']);
            for (const [jid, rt] of activeJobs.entries()) {
                // Notify backend so Admin UI updates
                if (conf.apiUrl && conf.apiKey) {
                    await fetch(`${conf.apiUrl}/api/extension/jobs/${jid}/complete`, {
                        method: 'POST',
                        headers: { 'X-Extension-Key': conf.apiKey, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ status: "failed", error: "Aborted manually by operator" })
                    }).catch(() => { });
                }
                if (rt.windowId) await chrome.windows.remove(rt.windowId).catch(() => { });
                activeJobs.delete(jid);
            }
            chrome.runtime.reload();
        })();
        sendResponse({ aborted: true });
    } else if (request.action === "keep_alive") {
        sendResponse({ ok: true });
        return false;
    } else if (request.action === "trigger_poll") {
        pollForJobs();
        sendResponse({ ok: true });
        return false;
    }
});

// ── Polling ─────────────────────────────────────────────────────
let pollingInProgress = false;

async function pollForJobs() {
    if (pollingInProgress) return;
    if (activeJobs.size >= MAX_CONCURRENT) return;
    pollingInProgress = true;

    const conf = await chrome.storage.local.get(['apiUrl', 'apiKey']);
    if (!conf.apiUrl || !conf.apiKey) { pollingInProgress = false; return; }

    try {
        const res = await fetch(`${conf.apiUrl}/api/extension/jobs`, {
            headers: { 'X-Extension-Key': conf.apiKey }
        });
        if (!res.ok) { pollingInProgress = false; return; }

        const data = await res.json();
        const pending = (data.jobs || []).filter(j => !activeJobs.has(j.job_id));
        const slotsAvailable = MAX_CONCURRENT - activeJobs.size;

        for (let i = 0; i < Math.min(pending.length, slotsAvailable); i++) {
            const job = pending[i];
            // Mark claimed immediately to prevent double-pickup
            activeJobs.set(job.job_id, { job, conf, tabId: null, windowId: null, status: 'starting' });
            // Fire and forget — each job runs independently
            runJobInWindow(job, conf).catch(e => {
                console.error(`[JOB][${job.job_id}] Fatal:`, e);
            });
        }
    } catch (e) {
        console.log("[MDM Agent] Poll error:", e);
    }
    pollingInProgress = false;

    // Schedule next poll
    setTimeout(pollForJobs, 5000);
}

// ── Job Execution (each in its own visible window) ──────────────
async function runJobInWindow(job, conf) {
    const jid = job.job_id;
    console.log(`[JOB][${jid}] Starting ${job.source} job in visible window...`);

    try {
        // Signal backend
        await fetch(`${conf.apiUrl}/api/extension/jobs/${jid}/start`, {
            method: 'POST', headers: { 'X-Extension-Key': conf.apiKey }
        });
    } catch (e) {
        console.error(`[JOB][${jid}] Start signal failed:`, e);
        activeJobs.delete(jid);
        return;
    }

    // Open a visible Chrome window
    const win = await chrome.windows.create({ url: "about:blank", state: "normal" });
    const tid = win.tabs[0].id;
    activeJobs.set(jid, { job, conf, tabId: tid, windowId: win.id, status: 'running' });

    try {
        let selfCompleted = false;
        if (job.source === "google") {
            selfCompleted = await runGoogleTwoPhaseJob(job, conf, tid, win.id);
        } else {
            await runTenderJob(job, conf, tid, win.id);
        }

        // Google sends its own /complete, so skip double-complete
        if (!selfCompleted) {
            await fetch(`${conf.apiUrl}/api/extension/jobs/${jid}/complete`, {
                method: 'POST',
                headers: { 'X-Extension-Key': conf.apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: "completed", summary: { source: job.source } })
            });
        }
        console.log(`[JOB][${jid}] ✅ COMPLETED`);
    } catch (e) {
        console.error(`[JOB][${jid}] ❌ FAILED:`, e);
        await fetch(`${conf.apiUrl}/api/extension/jobs/${jid}/complete`, {
            method: 'POST',
            headers: { 'X-Extension-Key': conf.apiKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: "failed", error: String(e) })
        }).catch(() => { });
    } finally {
        await chrome.windows.remove(win.id).catch(() => { });
        activeJobs.delete(jid);
    }
}

// ── TenderOnTime / Generic Tender Job ───────────────────────────
async function runTenderJob(job, conf, tid, windowId) {
    const jid = job.job_id;
    const maxPages = job.max_pages || 7;
    let allTenders = [];

    for (const keyword of job.keywords) {
        console.log(`[JOB][${jid}] Keyword: "${keyword}" [${job.source}]`);
        const escaped = encodeURIComponent(keyword.trim());
        const searchUrl = `https://www.tendersontime.com/tenders/advanceSearch?q=${escaped}`;

        await chrome.tabs.update(tid, { url: searchUrl });
        const pageReady = await waitUntilPageAvailable(tid, { timeout: 120000, isGoogle: false });
        if (!pageReady) {
            console.warn(`[JOB][${jid}] Page not ready for "${keyword}". Skipping.`);
            await sleep(2000);
            continue;
        }

        // ── MAIN-WORLD Filter Click (bypasses CSP) ──
        console.log(`[JOB][${jid}] Requesting filter click...`);
        let filterResult = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            filterResult = await executeContentScript(tid, "click_filter_button", { keyword });
            console.log(`[JOB][${jid}] Filter attempt ${attempt}:`, filterResult);

            // If the content script found the button but couldn't trigger the AJAX natively,
            // fire the MAIN-world bypass through chrome.scripting
            if (filterResult?.clicked) {
                await chrome.scripting.executeScript({
                    target: { tabId: tid },
                    world: "MAIN",
                    func: () => {
                        try {
                            if (typeof filterTendersJS === 'function') {
                                filterTendersJS(1, 'filterbtn');
                            }
                        } catch (e) { }
                    }
                }).catch(e => console.warn(`[JOB][${jid}] MAIN-world bypass error:`, e));
                await sleep(1500);
                break;
            }
            await sleep(1500);
        }
        if (!filterResult?.clicked) {
            console.warn(`[JOB][${jid}] Filter failed for "${keyword}". Skipping.`);
            continue;
        }

        // ── Collect Listings ──
        const result = await waitUntilListingsReady(tid, keyword, { timeout: 120000 });
        if (result.status === "no_results") {
            console.log(`[JOB][${jid}] No results for "${keyword}".`);
            await sleep(2000);
            continue;
        }
        if (result.status !== "results") {
            console.warn(`[JOB][${jid}] Listings not ready: ${result.status}`);
            await sleep(2000);
            continue;
        }

        let allListings = [];
        let kwResults = [];
        let pageNum = 1;
        let visitedPageSignatures = new Set();
        let listingData = result.listings;

        while (pageNum <= maxPages) {
            if (pageNum > 1) {
                const pageResult = await waitUntilListingsReady(tid, keyword, { timeout: 120000 });
                if (pageResult.status !== "results") break;
                listingData = pageResult.listings;
            }

            const currentSignature = [
                listingData.length,
                ...listingData.slice(0, 10).map(item => item.href || item.title || "")
            ].join("|");

            if (visitedPageSignatures.has(currentSignature)) break;
            visitedPageSignatures.add(currentSignature);

            for (const item of listingData) {
                if (item.href && !allListings.some(x => x.href === item.href)) {
                    allListings.push(item);
                }
            }

            if (pageNum >= maxPages) break;

            const nextResult = await executeContentScript(tid, "click_next_page");
            if (!nextResult?.clicked || !nextResult?.changed) break;
            pageNum++;
        }

        console.log(`[JOB][${jid}] Collected ${allListings.length} listings across ${pageNum} pages for "${keyword}".`);

        // ── Detail Phase ──
        for (let i = 0; i < allListings.length; i++) {
            const item = allListings[i];
            if (!item.href) continue;
            await chrome.tabs.update(tid, { url: item.href });
            await sleep(2000);
            const detailData = await executeContentScript(tid, "extract_details", { keyword });
            if (detailData?.found) {
                kwResults.push({ ...item, ...detailData });
            }
        }

        if (kwResults.length > 0) {
            await fetch(`${conf.apiUrl}/api/extension/upload`, {
                method: 'POST',
                headers: { 'X-Extension-Key': conf.apiKey, 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: job.source || "tenderontime", keyword, tenders: kwResults })
            });
            allTenders.push(...kwResults);
        }
        await sleep(2000);
    }
}

// ── Google Two-Phase Job ────────────────────────────────────────
async function runGoogleTwoPhaseJob(job, conf, tid, windowId) {
    const jid = job.job_id;
    const allMap = new Map();
    const filtered = [];

    // PHASE 1
    for (const keyword of (job.keywords || [])) {
        for (let page = 0; page < 7; page++) {
            const url = googleSearchUrl(keyword, page);
            console.log(`[JOB][${jid}][GOOGLE][ALL] keyword="${keyword}" page=${page + 1}/7`);
            await chrome.tabs.update(tid, { url });
            const loaded = await waitForTabComplete(tid);
            if (!loaded) continue;
            const data = await executeContentScript(tid, "extract_listings");
            const listings = Array.isArray(data) ? data : (data?.listings || []);
            for (const item of listings) {
                if (!item.href) continue;
                const key = canonicalUrl(item.href);
                if (!key || allMap.has(key)) continue;
                allMap.set(key, { ...item, href: item.href, keyword, search_keyword: keyword, google_page: page + 1, result_type: "all" });
            }
        }
    }

    const allResults = [...allMap.values()];
    console.log(`[JOB][${jid}][GOOGLE] Phase 1 complete: ${allResults.length} unique results.`);
    await uploadGoogleResults(conf, job, allResults, "all");

    // PHASE 2
    for (let i = 0; i < allResults.length; i++) {
        const item = allResults[i];
        console.log(`[JOB][${jid}][GOOGLE][FILTERED] ${i + 1}/${allResults.length}: ${item.href}`);
        await chrome.tabs.update(tid, { url: item.href });
        const loaded = await waitForTabComplete(tid, 120000);
        if (!loaded) continue;
        const detail = await executeContentScript(tid, "extract_details", { keyword: item.keyword });
        if (detail?.found) {
            filtered.push({ ...item, ...detail, result_type: "filtered" });
        }
    }

    console.log(`[JOB][${jid}][GOOGLE] Phase 2 complete: ${filtered.length} verified results.`);
    await uploadGoogleResults(conf, job, filtered, "filtered");

    // Override the generic complete with Google-specific summary
    await fetch(`${conf.apiUrl}/api/extension/jobs/${jid}/complete`, {
        method: "POST",
        headers: { "X-Extension-Key": conf.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed", summary: { total_all: allResults.length, total_filtered: filtered.length, total_matches: filtered.length } })
    });
    // Signal to caller NOT to send a second complete
    return true;
}

// ── Utilities ───────────────────────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function canonicalUrl(value) {
    try {
        const u = new URL(value);
        u.hash = "";
        return u.toString().replace(/\/$/, "");
    } catch (_) { return String(value || "").trim(); }
}

function googleSearchUrl(keyword, page) {
    let query = String(keyword || "").trim();
    if (!query) {
        query = "tenders";
    } else if (/^"[^"].*"\s+tenders$/i.test(query)) {
        query = query;
    } else if (/^".*"$/s.test(query)) {
        query = `${query} tenders`;
    } else {
        query = `"${query}" tenders`;
    }
    return `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${page * 10}&num=10`;
}

async function uploadGoogleResults(conf, job, results, resultType) {
    if (!results.length) return;
    await fetch(`${conf.apiUrl}/api/extension/upload`, {
        method: "POST",
        headers: { "X-Extension-Key": conf.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ source: "google", keyword: "ALL", result_type: resultType, results, tenders: results })
    });
    console.log(`[GOOGLE][SAVE ${resultType.toUpperCase()}] Sent ${results.length} results.`);
}

async function waitForTabComplete(tid, timeout = 120000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        try {
            const tab = await chrome.tabs.get(tid);
            if (tab.status === "complete" && tab.url && !tab.url.startsWith("about:")) {
                await sleep(1800);
                return tab;
            }
        } catch (e) { return null; }
        await sleep(800);
    }
    return null;
}

async function waitUntilPageAvailable(tabId, options = {}) {
    const timeout = options.timeout || 120000;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        let tabInfo;
        try { tabInfo = await chrome.tabs.get(tabId); } catch (e) { return false; }

        if (!tabInfo.url || !tabInfo.url.toLowerCase().includes("/tenders/advancesearch")) {
            await sleep(1200);
            continue;
        }
        if (tabInfo.status !== "complete") {
            await sleep(1200);
            continue;
        }

        const pageCheck = await executeContentScript(tabId, "check_page_available");
        if (!pageCheck) { await sleep(1500); continue; }
        if (pageCheck.cloudflareActive) { await sleep(2500); continue; }

        const currentUrl = (pageCheck.url || "").toLowerCase();
        const isExpectedSearchPage = options.isGoogle
            ? currentUrl.includes("google.com/search")
            : (currentUrl.includes("/tenders/advancesearch") || currentUrl.includes("advancesearch"));

        if (isExpectedSearchPage && pageCheck.readyState === "complete" && !pageCheck.cloudflareActive) {
            await sleep(1500);
            return true;
        }
        await sleep(1500);
    }
    return false;
}

async function waitUntilListingsReady(tabId, keyword, options = {}) {
    const timeout = options.timeout || 120000;
    const startTime = Date.now();
    let noResultsCount = 0;

    while (Date.now() - startTime < timeout) {
        let listingData = await executeContentScript(tabId, "extract_listings");
        if (!listingData) { await sleep(1000); continue; }
        if (listingData.status === "cloudflare") { await sleep(2000); continue; }

        if (Array.isArray(listingData)) {
            if (listingData.length === 0) {
                let pageCheck = await executeContentScript(tabId, "check_page_available");
                if (pageCheck?.hasNoResultsText) {
                    noResultsCount++;
                    if (noResultsCount >= 3) return { ready: true, status: "no_results", noResults: true, listings: [] };
                } else {
                    noResultsCount = 0;
                }
                await sleep(1000);
                continue;
            } else {
                return { ready: true, status: "results", noResults: false, listings: listingData };
            }
        }
        await sleep(1000);
    }
    return { ready: false, status: "timeout", noResults: false, listings: [], reason: "result_state_not_confirmed" };
}

function executeContentScript(tid, action, payload = null) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tid, { action, ...payload }, (response) => {
            if (chrome.runtime.lastError) {
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}

// ── Handle tab closures ─────────────────────────────────────────
chrome.tabs.onRemoved.addListener(async (closedTabId) => {
    for (const [jid, rt] of activeJobs.entries()) {
        if (rt.tabId === closedTabId) {
            console.warn(`[JOB][${jid}] Tab closed externally. Aborting job.`);
            activeJobs.delete(jid);
        }
    }
});
