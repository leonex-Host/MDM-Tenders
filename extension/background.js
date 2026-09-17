let intervalId = null;
let currentJob = null;
let tabId = null;

// Initialize fast polling
async function initPolling() {
    if (intervalId) return;
    const conf = await chrome.storage.local.get(['apiUrl', 'apiKey']);
    if (conf.apiUrl && conf.apiKey) {
        console.log("[MDM Agent] Auto-started polling for jobs...");
        intervalId = setInterval(pollForJobs, 3000); // 3 second polling
        pollForJobs(); // run immediately
    }
}

// Start on script load
initPolling();

// Keep-alive for MV3 service worker sleep limits
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
    if (currentJob) return; // busy

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

    // Create ONE visible window/tab to reuse for this entire job
    const windowObj = await chrome.windows.create({ url: "about:blank", state: "normal" });
    tabId = windowObj.tabs[0].id;

    for (const keyword of job.keywords) {
        console.log(`[MDM Agent] Processing keyword: ${keyword}`);

        const escaped = encodeURIComponent(keyword.trim());
        const searchUrl = `https://www.tendersontime.com/tenders/advanceSearch?q=${escaped}`;

        console.log(`[NAVIGATE] ${searchUrl}`);
        await chrome.tabs.update(tabId, { url: searchUrl });

        // Wait for page
        let readyData = await waitUntilListingsReady(tabId, { timeout: 120000 });
        if (!readyData || readyData.length === 0) {
            console.log(`[KEYWORD STOPPED] Keyword ${keyword} failed to load initially.`);
            continue; // Stop this keyword safely
        }

        // Click filter only once, if required
        console.log("[FILTER] Clicking filter button");
        const filterResult = await executeContentScript(tabId, "click_filter_button");

        if (filterResult && filterResult.clicked) {
            console.log("[MDM Agent] Filter clicked, waiting for exact listings...");
            // Re-wait since page might reload/refresh
            readyData = await waitUntilListingsReady(tabId, { timeout: 120000 });
            if (!readyData || readyData.length === 0) {
                console.log(`[KEYWORD STOPPED] Keyword ${keyword} failed to load post-filter.`);
                continue;
            }
        }
        console.log("[READY] Keyword page loaded successfully");

        let allListings = [];
        let kwResults = [];
        let pageNum = 1;
        let visitedPageSignatures = new Set();
        let listingData = readyData; // Start with phase 1 listings

        while (pageNum <= maxPages) {
            console.log(`[PAGE START] Collecting page ${pageNum}/${maxPages}`);

            if (pageNum > 1) {
                // Wait to verify Cloudflare/lists didn't vanish after pagination
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

            console.log("[BEFORE NEXT] Requesting click_next_page");
            const nextResult = await executeContentScript(tabId, "click_next_page");
            console.log("[NEXT CLICK] Result:", nextResult);

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

            // If actual page exists in DOM output, strictly verify it equals expected page
            if (actualPage && parseInt(actualPage, 10) !== expectedPage) {
                console.log(`[MDM Agent] Expected page ${expectedPage} but found page ${actualPage}. Halting transition.`);
                break;
            }

            pageNum++;
            console.log(`[PAGE SUCCESS] Successfully moved to page ${pageNum}`);
        }

        console.log(`[MDM Agent] Collected ${allListings.length} unique listings across ${pageNum} page(s)`);

        // PHASE 2: Process detail pages only after pagination is complete
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
                body: JSON.stringify({ source: "tenderontime", keyword: keyword, tenders: kwResults })
            });
            allTenders.push(...kwResults);
        }

        await sleep(1500); // Short breather before next keyword
    }

    // Close the reusable tab/window
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

    while (Date.now() - startTime < timeout) {
        let listingData = await executeContentScript(tabId, "extract_listings");

        if (!listingData) {
            await sleep(1000);
            continue;
        }

        if (listingData.status === "cloudflare") {
            logState("[WAIT][CLOUDFLARE] Cloudflare active. Waiting...");
            await sleep(2000);
            continue;
        }

        if (Array.isArray(listingData)) {
            if (listingData.length === 0) {
                logState("[WAIT][LISTINGS] Waiting for listing elements...");
                await sleep(1000);
                continue;
            } else {
                logState(`[READY] Listings available (${listingData.length}).`);
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
                // Expected during early page initialization; silence to prevent Extension Error badge
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}
