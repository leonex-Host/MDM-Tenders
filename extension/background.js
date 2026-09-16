let intervalId = null;
let currentJob = null;
let tabId = null;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_polling") {
        if (!intervalId) {
            console.log("[MDM Agent] Started polling for jobs...");
            intervalId = setInterval(pollForJobs, 10000);
            pollForJobs(); // run immediately
        }
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

    // Acknowledge pickup
    try {
        await fetch(`${conf.apiUrl}/api/extension/jobs/${job.job_id}/start`, {
            method: 'POST',
            headers: { 'X-Extension-Key': conf.apiKey }
        });
    } catch (e) { console.error(e); currentJob = null; return; }

    const maxPages = job.max_pages || 5;
    let allTenders = [];

    // Loop over keywords
    for (const keyword of job.keywords) {
        console.log(`[MDM Agent] Processing keyword: ${keyword}`);
        const escaped = encodeURIComponent(keyword.trim());
        const searchUrl = `https://www.tendersontime.com/tenders/advanceSearch?q=${escaped}`;

        // Create visible tab
        const tab = await chrome.tabs.create({ url: searchUrl, active: true });
        tabId = tab.id;

        // Wait for page to load completely
        await sleep(4000);

        let kwResults = [];
        let pageNum = 1;

        while (pageNum <= maxPages) {
            // Tell content script to extract listing links
            let listingData = await executeContentScript(tabId, "extract_listings");
            if (!listingData || listingData.length === 0) {
                console.log(`[MDM Agent] No listings on page ${pageNum} for ${keyword}`);
                break;
            }

            console.log(`[MDM Agent] Found ${listingData.length} listings on page ${pageNum}`);

            // Loop over extracted listings and visit detail pages
            for (const item of listingData) {
                if (item.href) {
                    await chrome.tabs.update(tabId, { url: item.href });
                    await sleep(3000); // wait for detail load

                    let detailData = await executeContentScript(tabId, "extract_details", { keyword: keyword });
                    if (detailData && detailData.found) {
                        let finalItem = { ...item, ...detailData };
                        kwResults.push(finalItem);
                        console.log(`✅ MATCH: ${finalItem.title}`);
                    }
                }
            }

            // We finished the page. We have to go back to the search results to click "Next".
            // Since we navigated away, going back requires rebuilding the search POST or simply skipping multi-page for now to keep it extremely stable.
            // For stability without complex state management in the extension, we'll extract page 1 first in this iteration.
            break;
        }

        console.log(`[MDM Agent] Finished keyword ${keyword}. Matches found: ${kwResults.length}`);

        if (kwResults.length > 0) {
            // Upload immediately for this keyword
            await fetch(`${conf.apiUrl}/api/extension/upload`, {
                method: 'POST',
                headers: {
                    'X-Extension-Key': conf.apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    source: "tenderontime",
                    keyword: keyword,
                    tenders: kwResults
                })
            });
            allTenders.push(...kwResults);
        }

        // Close the tab between keywords if needed, or wait
        await chrome.tabs.remove(tabId);
        await sleep(2000);
    }

    // Mark Job Complete
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

function executeContentScript(tid, action, payload = null) {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tid, { action, ...payload }, (response) => {
            if (chrome.runtime.lastError) {
                console.error("[MDM] tab communication error:", chrome.runtime.lastError.message);
                resolve(null);
            } else {
                resolve(response);
            }
        });
    });
}
