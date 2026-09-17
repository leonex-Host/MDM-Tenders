let intervalId = null;
let currentJob = null;
let tabId = null;

async function initPolling() {
    if (intervalId) return;
    const conf = await chrome.storage.local.get(['apiUrl', 'apiKey']);
    if (conf.apiUrl && conf.apiKey) {
        console.log("[MDM Agent] Auto-started polling for jobs...");
        intervalId = setInterval(pollForJobs, 3000);
        pollForJobs();
    }
}

initPolling();

chrome.alarms.create("keepAlive", { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "keepAlive") {
        initPolling();
    }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_polling") {
        initPolling();
    }
});

async function pollForJobs() {
    if (currentJob) return;

    const conf = await chrome.storage.local.get(['apiUrl', 'apiKey']);
    if (!conf.apiUrl || !conf.apiKey) return;

    try {
        const res = await fetch(`${conf.apiUrl}/api/extension/jobs`, {
            headers: { 'X-Extension-Key': conf.apiKey }
        });
        if (!res.ok) return;

        const data = await res.json();
        if (data.jobs && data.jobs.length > 0) {
            const job = data.jobs[0];
            await startJob(job, conf);
        }
    } catch (e) {
        console.log("[MDM Agent] Poll error:", e);
    }
}

async function startJob(job, conf) {
    console.log("[MDM Agent] Picking up job:", job.job_id);
    currentJob = job;

    try {
        await fetch(`${conf.apiUrl}/api/extension/jobs/${job.job_id}/start`, {
            method: 'POST',
            headers: { 'X-Extension-Key': conf.apiKey }
        });
    } catch (e) { console.error(e); currentJob = null; return; }

    // Google uses a dedicated deterministic two-phase workflow.
    if (job.source === "google") {
        await runGoogleTwoPhaseJob(job, conf);
        return;
    }

    const maxPages = job.max_pages || 7;
    let allTenders = [];

    const windowObj = await chrome.windows.create({ url: "about:blank", state: "normal" });
    tabId = windowObj.tabs[0].id;

    const isGoogle = job.source === "google";

    for (const keyword of job.keywords) {
        console.log(`[MDM Agent] Processing keyword: ${keyword} [Source: ${job.source || "tenderontime"}]`);

        const escaped = encodeURIComponent(keyword.trim());

        const searchUrl = isGoogle
            ? `https://www.google.com/search?q=${escaped}`
            : `https://www.tendersontime.com/tenders/advanceSearch?q=${escaped}`;

        console.log(`[NAVIGATE] ${searchUrl}`);
        if (!isGoogle) console.log("[NAVIGATION WAIT] Waiting for expected URL...");

        await chrome.tabs.update(tabId, { url: searchUrl });

        const pageReady = await waitUntilPageAvailable(tabId, { timeout: 120000, isGoogle });
        if (!pageReady) {
            console.log(`[KEYWORD STOPPED] Keyword ${keyword} page/content-script unavailable (or form not ready).`);
            console.log("[KEYWORD TRANSITION] Waiting before next keyword...");
            await sleep(2000);
            continue;
        }

        if (!isGoogle) console.log("[NAVIGATION READY] Expected advanced-search URL confirmed");

        // Google renders listings automatically on navigation, TenderOnTime requires a manual filter click
        if (!isGoogle) {
            console.log("[FILTER SEARCH] Requesting filter click with keyword:", keyword);
            let filterResult = null;
            for (let filterAttempt = 1; filterAttempt <= 3; filterAttempt++) {
                filterResult = await executeContentScript(tabId, "click_filter_button", { keyword });
                console.log(`[FILTER ATTEMPT ${filterAttempt}]`, filterResult);
                if (filterResult?.clicked && filterResult?.verified) break;
                await sleep(1500);
            }
            if (!filterResult?.clicked) {
                console.log(`[KEYWORD STOPPED] Filter button failed after retries for ${keyword}`, filterResult);
                continue;
            }
        }

        console.log("[LISTINGS WAIT] Waiting for search results...");
        const result = await waitUntilListingsReady(tabId, keyword, { timeout: 120000 });

        if (result.status === "results") {
            console.log(`[LISTINGS READY] ${result.listings.length} listings found for keyword: ${keyword}`);
        } else if (result.status === "no_results") {
            console.log(`[KEYWORD COMPLETE] ${keyword} returned confirmed no results`);
            console.log("[KEYWORD NEXT] Moving to next keyword");
            console.log("[KEYWORD TRANSITION] Waiting before next keyword...");
            await sleep(2000);
            continue;
        } else if (result.status === "timeout") {
            console.warn(`[KEYWORD TIMEOUT] ${keyword} result state was not confirmed`);
            console.log("[KEYWORD TRANSITION] Waiting before next keyword...");
            await sleep(2000);
            continue;
        } else if (result.status === "error") {
            console.error(`[KEYWORD ERROR] ${keyword}: ${result.reason || "unknown error"}`);
            console.log("[KEYWORD TRANSITION] Waiting before next keyword...");
            await sleep(2000);
            continue;
        } else {
            console.warn(`[KEYWORD ERROR] ${keyword}: undefined status from waitUntilListingsReady`);
            console.log("[KEYWORD TRANSITION] Waiting before next keyword...");
            await sleep(2000);
            continue;
        }

        let allListings = [];
        let kwResults = [];
        let pageNum = 1;
        let visitedPageSignatures = new Set();
        let listingData = result.listings;

        while (pageNum <= maxPages) {
            console.log(`[PAGE START] Collecting page ${pageNum}/${maxPages}`);

            if (pageNum > 1) {
                const pageResult = await waitUntilListingsReady(tabId, keyword, { timeout: 120000 });
                if (pageResult.status !== "results") {
                    console.log(`[MDM Agent] Pagination stopped on page ${pageNum}: status=${pageResult.status}`);
                    break;
                }
                listingData = pageResult.listings;
            }

            console.log(`[PAGE DATA] Page ${pageNum} contains ${listingData.length} listings`);

            const currentSignature = [
                listingData.length,
                ...listingData.slice(0, 10).map(item => item.href || item.title || "")
            ].join("|");

            if (visitedPageSignatures.has(currentSignature)) {
                console.log(`[MDM Agent] Duplicate page detected. Stopping keyword: ${keyword}`);
                break;
            }

            visitedPageSignatures.add(currentSignature);

            for (const item of listingData) {
                if (item.href && !allListings.some(existing => existing.href === item.href)) {
                    allListings.push(item);
                }
            }

            if (pageNum >= maxPages) {
                console.log(`[MDM Agent] Reached max pages: ${maxPages}`);
                break;
            }

            console.log("[PAGINATION] Requesting next page");
            const nextResult = await executeContentScript(tabId, "click_next_page");
            console.log("[PAGINATION] Next click result:", nextResult);

            if (!nextResult || !nextResult.clicked || !nextResult.changed) {
                console.log(`[MDM Agent] Pagination stopped:`, nextResult ? nextResult.reason : "no_response");
                if (nextResult && nextResult.reason === "new_page_did_not_stabilize") {
                    console.log(`[MDM Agent] Diagnostics: beforeSig=${nextResult.beforeSignature}, activePage=${nextResult.pageNumber}`);
                }
                break;
            }

            const expectedPage = pageNum + 1;
            const actualPage = nextResult.pageNumber;

            console.log("[PAGE VERIFICATION]", {
                expectedPage,
                actualPage,
                changed: nextResult.changed
            });

            if (actualPage && parseInt(actualPage, 10) !== expectedPage) {
                console.log(`[MDM Agent] Expected page ${expectedPage} but found page ${actualPage}. Halting transition.`);
                break;
            }

            pageNum++;
            console.log(`[PAGE SUCCESS] Successfully moved to page ${pageNum}`);
        }

        console.log(`[MDM Agent] Collected ${allListings.length} unique listings across ${pageNum} page(s)`);

        for (let i = 0; i < allListings.length; i++) {
            const item = allListings[i];
            console.log(`[MDM Agent] Processing detail ${i + 1}/${allListings.length}`);

            if (!item.href) continue;

            await chrome.tabs.update(tabId, { url: item.href });
            await sleep(2000);

            const detailData = await executeContentScript(tabId, "extract_details", { keyword });

            if (detailData && detailData.found) {
                const finalItem = { ...item, ...detailData };
                kwResults.push(finalItem);
                console.log(`✅ MATCH: ${finalItem.title}`);
            }
        }

        console.log(`[KEYWORD COMPLETE] Finished keyword ${keyword}. Matches found: ${kwResults.length}`);

        if (kwResults.length > 0) {
            await fetch(`${conf.apiUrl}/api/extension/upload`, {
                method: 'POST',
                headers: {
                    'X-Extension-Key': conf.apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ source: job.source || "tenderontime", keyword: keyword, tenders: kwResults })
            });
            allTenders.push(...kwResults);
        }

        console.log("[KEYWORD TRANSITION] Waiting before next keyword...");
        await sleep(2000);
    }

    await chrome.windows.remove(windowObj.id).catch(() => { });

    try {
        await fetch(`${conf.apiUrl}/api/extension/jobs/${job.job_id}/complete`, {
            method: 'POST',
            headers: {
                'X-Extension-Key': conf.apiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                status: "completed",
                summary: { total_matches: allTenders.length }
            })
        });
    } catch (e) { console.error(e); }

    console.log("[MDM Agent] Job Complete!");
    currentJob = null;
    tabId = null;
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

function googleSearchUrl(keyword, page) {
    const query = `"${keyword.trim()}" tenders`;
    return `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${page * 10}&num=10`;
}

async function runGoogleTwoPhaseJob(job, conf) {
    const allMap = new Map();
    const filtered = [];
    const win = await chrome.windows.create({ url: "about:blank", state: "normal" });
    const tid = win.tabs[0].id;
    tabId = tid;

    try {
        // PHASE 1: navigate explicitly to every keyword/page URL and collect only search results.
        for (const keyword of (job.keywords || [])) {
            for (let page = 0; page < 7; page++) {
                const url = googleSearchUrl(keyword, page);
                console.log(`[GOOGLE][ALL] Navigating keyword="${keyword}" page=${page + 1}/7`, url);
                await chrome.tabs.update(tid, { url });
                const loaded = await waitForTabComplete(tid);
                if (!loaded) {
                    console.warn(`[GOOGLE][ALL] Page did not load; skipping page ${page + 1}`);
                    continue;
                }
                const data = await executeContentScript(tid, "extract_listings");
                const listings = Array.isArray(data) ? data : (data?.listings || []);
                console.log(`[GOOGLE][ALL] Extracted ${listings.length} results from page ${page + 1}`);
                for (const item of listings) {
                    if (!item.href) continue;
                    const key = canonicalUrl(item.href);
                    if (!key || allMap.has(key)) continue;
                    allMap.set(key, {
                        ...item,
                        href: item.href,
                        keyword,
                        search_keyword: keyword,
                        google_page: page + 1,
                        result_type: "all"
                    });
                }
            }
        }

        const allResults = [...allMap.values()];
        console.log(`[GOOGLE][ALL COMPLETE] ${allResults.length} unique results collected.`);
        await uploadGoogleResults(conf, job, allResults, "all");

        // PHASE 2: only now visit each unique result and check its real page content.
        for (let i = 0; i < allResults.length; i++) {
            const item = allResults[i];
            console.log(`[GOOGLE][FILTERED] Checking ${i + 1}/${allResults.length}: ${item.href}`);
            await chrome.tabs.update(tid, { url: item.href });
            const loaded = await waitForTabComplete(tid, 120000);
            if (!loaded) continue;
            const detail = await executeContentScript(tid, "extract_details", { keyword: item.keyword });
            if (detail?.found) {
                filtered.push({ ...item, ...detail, result_type: "filtered" });
            }
        }

        console.log(`[GOOGLE][FILTERED COMPLETE] ${filtered.length} matching results.`);
        await uploadGoogleResults(conf, job, filtered, "filtered");
        await fetch(`${conf.apiUrl}/api/extension/jobs/${job.job_id}/complete`, {
            method: "POST",
            headers: { "X-Extension-Key": conf.apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "completed", summary: { total_all: allResults.length, total_filtered: filtered.length, total_matches: filtered.length } })
        });
    } catch (e) {
        console.error("[GOOGLE] Two-phase job failed", e);
        await fetch(`${conf.apiUrl}/api/extension/jobs/${job.job_id}/complete`, {
            method: "POST",
            headers: { "X-Extension-Key": conf.apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({ status: "failed", error: String(e) })
        }).catch(() => {});
    } finally {
        await chrome.windows.remove(win.id).catch(() => {});
        currentJob = null;
        tabId = null;
    }
}

function canonicalUrl(value) {
    try {
        const u = new URL(value);
        u.hash = "";
        return u.toString().replace(/\/$/, "");
    } catch (_) { return String(value || "").trim(); }
}

async function uploadGoogleResults(conf, job, results, resultType) {
    if (!results.length) return;
    await fetch(`${conf.apiUrl}/api/extension/upload`, {
        method: "POST",
        headers: { "X-Extension-Key": conf.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({ source: "google", keyword: "ALL", result_type: resultType, results, tenders: results })
    });
    console.log(`[GOOGLE][SAVE ${resultType.toUpperCase()}] Sent ${results.length} results to backend.`);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitUntilPageAvailable(tabId, options = {}) {
    const timeout = options.timeout || 120000;
    const startTime = Date.now();
    let lastLog = "";

    function logState(state) {
        if (state !== lastLog) {
            console.log(state);
            lastLog = state;
        }
    }

    while (Date.now() - startTime < timeout) {
        let tabInfo;
        try { tabInfo = await chrome.tabs.get(tabId); } catch (e) {
            console.error("[PAGE ERROR] Tab unavailable", e);
            return false;
        }
        if (!tabInfo.url || !tabInfo.url.toLowerCase().includes("/tenders/advancesearch")) {
            logState(`[PAGE WAIT] Waiting for expected URL... (current: ${tabInfo.url || "unknown"})`);
            await sleep(1200);
            continue;
        }
        if (tabInfo.status !== "complete") {
            logState(`[PAGE WAIT] Tab still loading: ${tabInfo.status}`);
            await sleep(1200);
            continue;
        }
        const pageCheck = await executeContentScript(tabId, "check_page_available");

        if (!pageCheck) {
            logState("[PAGE WAIT] Content script not ready...");
            await sleep(1500);
            continue;
        }

        if (pageCheck.cloudflareActive) {
            logState("[CLOUDFLARE] Cloudflare active. Waiting...");
            await sleep(2500);
            continue;
        }

        const currentUrl = (pageCheck.url || "").toLowerCase();
        const isExpectedSearchPage = options.isGoogle
            ? currentUrl.includes("google.com/search")
            : (currentUrl.includes("/tenders/advancesearch") || currentUrl.includes("advancesearch"));

        if (
            isExpectedSearchPage &&
            pageCheck.readyState === "complete" &&
            (options.isGoogle || pageCheck.formReady === true)
        ) {
            logState(options.isGoogle ? "[PAGE READY] Google search page is ready." : "[PAGE READY] TenderOnTime advanced-search page is ready.");

            // Small stabilization delay so the DOM and event handlers settle.
            await sleep(1500);

            return true;
        }

        if (isExpectedSearchPage) {
            logState(`[PAGE WAIT] Search form is not ready yet. Waiting...`);
        } else {
            logState(`[PAGE WAIT] Waiting for expected URL... (current: ${currentUrl})`);
        }

        await sleep(1500);
    }

    console.log("[TIMEOUT] Timed out waiting for page to become available.");
    return false;
}

async function waitUntilListingsReady(tabId, keyword, options = {}) {
    const timeout = options.timeout || 120000;
    const startTime = Date.now();
    let lastLog = "";

    function logState(state) {
        if (state !== lastLog) {
            console.log(state);
            lastLog = state;
        }
    }

    let noResultsCount = 0;

    while (Date.now() - startTime < timeout) {
        let listingData = await executeContentScript(tabId, "extract_listings");

        if (!listingData) {
            logState("[LISTINGS WAIT] Results are still loading. Waiting...");
            await sleep(1000);
            continue;
        }

        if (listingData.status === "cloudflare") {
            logState("[CLOUDFLARE] Cloudflare active. Waiting...");
            await sleep(2000);
            continue;
        }

        if (Array.isArray(listingData)) {
            if (listingData.length === 0) {

                // We must also verify if the page legitimately says "No results" 
                let pageCheck = await executeContentScript(tabId, "check_page_available");
                if (pageCheck && pageCheck.hasNoResultsText) {
                    noResultsCount++;
                    if (noResultsCount >= 3) {
                        console.log(`[LISTINGS RESULT] Confirmed no-results state for keyword: ${keyword || 'unknown'}`);
                        return { ready: true, status: "no_results", noResults: true, listings: [] };
                    }
                } else {
                    noResultsCount = 0; // Reset if text disappears
                }

                logState("[LISTINGS CHECK] No final no-results message yet. Continuing to wait...");
                await sleep(1000);
                logState("[LISTINGS RETRY] Checking result state again...");
                continue;
            } else {
                console.log(`[LISTINGS CHECK] Current listing count: ${listingData.length}`);
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
                const message = chrome.runtime.lastError.message;
                const isNavigating = message.includes("Receiving end does not exist") || message.includes("Could not establish connection");

                if (isNavigating) {
                    console.log(`[CONTENT SCRIPT ERROR] action=${action} tabId=${tid} status=navigating_or_unavailable e=${message}`);
                } else {
                    console.log(`[CONTENT SCRIPT ERROR] action=${action} tabId=${tid} status=error payload=${JSON.stringify(payload)} e=${message}`);
                }
                resolve(null);
            } else if (response === undefined) {
                console.log(`[CONTENT SCRIPT ERROR] action=${action} tabId=${tid} status=no_response`);
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}
