let intervalId = null;
let activeJobs = new Set();

// Ensure the engine starts immediately when Chrome loads or extension refreshes
chrome.runtime.onStartup.addListener(startBackgroundEngine);
chrome.runtime.onInstalled.addListener(startBackgroundEngine);
startBackgroundEngine(); // Fallback direct execution

function startBackgroundEngine() {
    if (!intervalId) {
        console.log("[MDM Agent] Auto-started polling for jobs...");
        intervalId = setInterval(pollForJobs, 3000);
        pollForJobs();
    }
}

// Keep listener just in case UI wants to force ping
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_polling") {
        startBackgroundEngine();
    }
});

async function pollForJobs() {
    // parallel poll active

    const conf = await chrome.storage.local.get(['apiUrl', 'apiKey']);
    if (!conf.apiUrl || !conf.apiKey) return;

    try {
        const res = await fetch(`${conf.apiUrl}/api/extension/jobs`, {
            headers: { 'X-Extension-Key': conf.apiKey }
        });
        if (!res.ok) return;

        const data = await res.json();
        if (data.jobs && data.jobs.length > 0) {
            for (const job of data.jobs) {
                if (!activeJobs.has(job.job_id)) {
                    activeJobs.add(job.job_id);
                    startJob(job, conf).catch(console.error); // start async and parallel
                }
            }
        }
    } catch (e) {
        console.log("[MDM Agent] Poll error:", e);
    }
}

async function startJob(job, conf) {
    console.log("[MDM Agent] Picking up job:", job.job_id);

    try {
        await fetch(`${conf.apiUrl}/api/extension/jobs/${job.job_id}/start`, {
            method: 'POST',
            headers: { 'X-Extension-Key': conf.apiKey }
        });
    } catch (e) { console.error(e); activeJobs.delete(job.job_id); return; }

    const maxPages = job.max_pages || 5;
    let allTenders = [];

    // Create ONE visible window/tab to reuse for this specific job thread
    const windowObj = await chrome.windows.create({ url: "about:blank", state: "normal" });
    const tabId = windowObj.tabs[0].id;

    for (const keyword of job.keywords) {
        console.log(`[MDM Agent] Processing keyword: ${keyword} on ${job.source}`);
        const escaped = encodeURIComponent(keyword.trim());
        let plusFormatted = keyword.toLowerCase().trim().replace(/[^a-zA-Z0-9]/g, " ").replace(/\s+/g, "+");

        let targetScript = "";
        let searchUrl = "";

        switch (job.source) {
            case 'tenderontime':
                searchUrl = `https://www.tendersontime.com/tenders/advanceSearch?q=${escaped}`;
                targetScript = 'tenderontime';
                break;
            case 'tenderdetail':
                searchUrl = `https://www.tenderdetail.com/Indian-tender/%22${escaped}%22-tenders`;
                targetScript = 'tenderdetail';
                break;
            case 'biddetail':
                searchUrl = `https://www.biddetail.com/global-tenders/%22${escaped}%22-tenders`;
                targetScript = 'biddetail';
                break;
            case 'gem':
                // GEM doesn't easily paginate via URL, usually requires DOM interaction
                searchUrl = `https://bidplus.gem.gov.in/all-bids`;
                targetScript = 'gem';
                break;
            case 'tender247':
                // Tender247 basic search
                searchUrl = `https://www.tender247.com/keyword/${plusFormatted}+tenders`;
                targetScript = 'tender247';
                break;
            case 'google':
                // Google requires exact phrase quotes over the base keyword!
                searchUrl = `https://www.google.com/search?q=%22${escaped}%22+tenders`;
                targetScript = 'google';
                break;
            default:
                console.error(`[MDM Agent] Unknown source: ${job.source}`);
                continue;
        }

        await chrome.tabs.update(tabId, { url: searchUrl });

        let kwResults = [];
        let seenLinks = new Set();
        let pageNum = 1;

        while (pageNum <= maxPages) {
            let listingData = null;

            // Poll very fast (500ms) for Cloudflare or page load
            for (let attempt = 0; attempt < 50; attempt++) {
                await sleep(500);
                listingData = await executeContentScript(tabId, "extract_listings", { keyword: keyword });

                if (listingData && listingData.status === "cloudflare") {
                    console.log(`[MDM Agent] Waiting on Cloudflare (Attempt ${attempt + 1}/50)...`);
                    listingData = null;
                    continue; // Sleep again!
                }
                if (listingData !== null) {
                    break; // Successfully got an array (either empty or populated)
                }
            }

            if (!listingData || listingData.length === 0) {
                console.log(`[MDM Agent] No listings on page ${pageNum} for ${keyword}`);
                break;
            }

            console.log(`[MDM Agent] Found ${listingData.length} listings on page ${pageNum}`);

            let newItems = 0;

            for (const item of listingData) {
                if (item.href && !seenLinks.has(item.href)) {
                    seenLinks.add(item.href);
                    newItems++;

                    if (item.skip_details) {
                        kwResults.push(item);
                        console.log(`✅ MATCH (Skip Details): ${item.title}`);
                        continue;
                    }

                    // Open detail page in a temporary background tab to preserve Search DOM state!
                    const detailTab = await chrome.tabs.create({ url: item.href, windowId: windowObj.id, active: false });
                    await sleep(1500);

                    let detailData = await executeContentScript(detailTab.id, "extract_details", { keyword: keyword });
                    if (detailData && detailData.found) {
                        let finalItem = { ...item, ...detailData };
                        kwResults.push(finalItem);
                        console.log(`✅ MATCH: ${finalItem.title}`);
                    }
                    await chrome.tabs.remove(detailTab.id).catch(() => { });
                }
            }

            if (newItems === 0 && listingData.length > 0) {
                console.log(`[MDM Agent] Pagination loop or slow AJAX DOM detected. Skipping break to emulate python scraper tolerance.`);
            }

            if (pageNum < maxPages) {
                let clicked = await executeContentScript(tabId, "click_next_page", { currentPage: pageNum });
                if (!clicked) {
                    console.log(`[MDM Agent] No more Next pages found for ${keyword} on page ${pageNum}`);
                    break;
                }
                console.log(`[MDM Agent] Clicked Next page for ${keyword}. Waiting 5 seconds for DOM sweeps...`);
                await sleep(5000);
            }

            pageNum++;
        }

        console.log(`[MDM Agent] Finished keyword ${keyword}. Matches found: ${kwResults.length}`);

        if (kwResults.length > 0) {
            await fetch(`${conf.apiUrl}/api/extension/upload`, {
                method: 'POST',
                headers: {
                    'X-Extension-Key': conf.apiKey,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ source: job.source, keyword: keyword, tenders: kwResults })
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

    console.log(`[MDM Agent] Job Complete: ${job.job_id}`);
    activeJobs.delete(job.job_id);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
