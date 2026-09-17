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
        await chrome.tabs.update(tabId, { url: searchUrl });

        const pageReady = await waitUntilPageAvailable(tabId, { timeout: 120000 });
        if (!pageReady) {
            console.log(`[KEYWORD STOPPED] Keyword ${keyword} page/content-script unavailable.`);
            continue;
        }

        // Google renders listings automatically on navigation, TenderOnTime requires a manual filter click
        if (!isGoogle) {
            console.log("[FILTER SEARCH] Requesting filter click with keyword:", keyword);
            const filterResult = await executeContentScript(tabId, "click_filter_button", { keyword });

            if (!filterResult || !filterResult.clicked) {
                console.log(`[KEYWORD STOPPED] Keyword ${keyword} filter button was not clicked.`, filterResult);
                continue;
            }

            if (filterResult.verified === false) {
                console.log(`[KEYWORD WARNING] Filter might not have triggered properly:`, filterResult.reason);
            }
        }

        console.log("[LISTINGS WAIT] Waiting for exact listings...");
        let readyData = await waitUntilListingsReady(tabId, { timeout: 120000 });

        if (!readyData || readyData.length === 0) {
            console.log(`[KEYWORD STOPPED] Keyword ${keyword} no listings appeared after filter.`);
            continue;
        }

        console.log("[LISTINGS READY] Keyword page loaded successfully");

        let allListings = [];
        let kwResults = [];
        let pageNum = 1;
        let visitedPageSignatures = new Set();
        let listingData = readyData;

        while (pageNum <= maxPages) {
            console.log(`[PAGE START] Collecting page ${pageNum}/${maxPages}`);

            if (pageNum > 1) {
                listingData = await waitUntilListingsReady(tabId, { timeout: 120000 });
                if (!listingData || listingData.length === 0) {
                    console.log(`[MDM Agent] Timeout or empty on pagination load for page ${pageNum}`);
                    break;
                }
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

        await sleep(1500);
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
        let pageCheck = await executeContentScript(tabId, "check_page_available");

        if (!pageCheck) {
            logState("[PAGE WAIT] Waiting for content script to respond...");
            await sleep(1000);
            continue;
        }

        if (pageCheck.cloudflareActive) {
            logState("[CLOUDFLARE] Cloudflare active. Waiting...");
            await sleep(2000);
            continue;
        }

        logState("[PAGE READY] Page is available (Cloudflare passed).");
        return true;
    }

    console.log("[TIMEOUT] Timed out waiting for page to become available.");
    return false;
}

async function waitUntilListingsReady(tabId, options = {}) {
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
                        logState("[READY] Verified empty 'no results' state.");
                        return [];
                    }
                }

                logState("[LISTINGS WAIT] Waiting for listing elements...");
                await sleep(1000);
                continue;
            } else {
                logState(`[LISTINGS READY] Listings available (${listingData.length}).`);
                return listingData;
            }
        }
        await sleep(1000);
    }

    console.log("[TIMEOUT] Timed out waiting for listings.");
    return null;
}

function executeContentScript(tid, action, payload = null) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tid, { action, ...payload }, (response) => {
            if (chrome.runtime.lastError) {
                const message = chrome.runtime.lastError.message;
                // Ignore disconnect errors as they just mean the page is reloading/navigating
                if (!message.includes("Receiving end does not exist") && !message.includes("Could not establish connection")) {
                    console.log(`[CONTENT SCRIPT ERROR] action=${action} e=${message}`);
                }
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}
