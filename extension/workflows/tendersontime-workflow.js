import { updateJobState, setManualActionRequired, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab, waitForComplete } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitUntilPageAvailable(tabId, options = {}) {
    const timeout = options.timeout || 120000;
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        let tabInfo;
        try { tabInfo = await chrome.tabs.get(tabId); } catch (e) { return { ready: false, isChallenge: false }; }

        if (tabInfo.status !== "complete") {
            await sleep(1200);
            continue;
        }

        const pageCheck = await executeContentScript(tabId, "check_page_available");
        if (!pageCheck) {
            await sleep(1500); continue;
        }

        if (pageCheck.cloudflareActive) {
            return { ready: false, isChallenge: true, reason: 'Cloudflare' };
        }

        const isExpected = options.isGoogle
            ? tabInfo.url.includes("google.com/search")
            : tabInfo.url.includes("advancesearch");

        if (isExpected && pageCheck.readyState === "complete" && (options.isGoogle || pageCheck.formReady)) {
            await sleep(1500);
            return { ready: true, isChallenge: false };
        }

        await sleep(1500);
    }
    return { ready: false, isChallenge: false };
}

async function waitUntilListingsReady(tabId) {
    const timeout = 120000;
    const startTime = Date.now();
    let noResultsCount = 0;

    while (Date.now() - startTime < timeout) {
        let listingData = await executeContentScript(tabId, "extract_listings");
        if (!listingData) {
            await sleep(1000); continue;
        }
        if (listingData.status === "cloudflare") {
            return { isChallenge: true, reason: 'Cloudflare' };
        }
        if (Array.isArray(listingData)) {
            if (listingData.length === 0) {
                let pageCheck = await executeContentScript(tabId, "check_page_available");
                if (pageCheck && pageCheck.hasNoResultsText) {
                    noResultsCount++;
                    if (noResultsCount >= 3) return { status: "no_results" };
                } else {
                    noResultsCount = 0;
                }
                await sleep(1000);
                continue;
            } else {
                return { status: "results", listings: listingData };
            }
        }
        await sleep(1000);
    }
    return { status: "timeout" };
}

export async function runTendersOnTimeWorkflow(job) {
    let kwIndex = job.currentKeywordIndex || 0;
    const keywords = job.keywords || [];
    const maxPages = job.max_pages || 7;
    let allMatchesCount = job.resultsCollected || 0;

    let tabInfo = { tabId: job.tabId, windowId: job.windowId };
    if (!job.tabId || !job.windowId) {
        tabInfo = await createJobTab();
        await updateJobState({ tabId: tabInfo.tabId, windowId: tabInfo.windowId });
    }

    try {
        for (; kwIndex < keywords.length; kwIndex++) {
            const keyword = keywords[kwIndex];
            const escaped = encodeURIComponent(keyword.trim());
            const searchUrl = `https://www.tendersontime.com/tenders/advanceSearch?q=${escaped}`;

            // Allow resuming from a specific phase
            let phase = job.phase || 'search';
            let allListings = job.allListings || [];
            let pageNum = job.currentPage || 1;

            if (phase === 'search' || phase === 'list_collection') {
                await updateJobState({ currentKeywordIndex: kwIndex, keyword, phase: 'search' });

                if (job.pausedUrl) {
                    await navigateAndWait(tabInfo.tabId, job.pausedUrl);
                    await updateJobState({ pausedUrl: null });
                } else {
                    await navigateAndWait(tabInfo.tabId, searchUrl);
                }

                const pageReady = await waitUntilPageAvailable(tabInfo.tabId, { isGoogle: false });
                if (pageReady.isChallenge) {
                    const u = (await chrome.tabs.get(tabInfo.tabId)).url;
                    await setManualActionRequired('Cloudflare/Captcha Block', u);
                    throw new Error("CHALLENGE_PAUSED");
                }
                if (!pageReady.ready) {
                    continue;
                }

                let filterResult = null;
                for (let i = 0; i < 3; i++) {
                    filterResult = await executeContentScript(tabInfo.tabId, "click_filter_button", { keyword });
                    if (filterResult?.clicked && filterResult?.verified) break;
                    await sleep(1500);
                }
                if (!filterResult?.clicked) continue;

                await updateJobState({ phase: 'list_collection' });

                while (pageNum <= maxPages) {
                    await updateJobState({ currentPage: pageNum });
                    const result = await waitUntilListingsReady(tabInfo.tabId);
                    if (result.isChallenge) {
                        const u = (await chrome.tabs.get(tabInfo.tabId)).url;
                        await setManualActionRequired('Cloudflare/Captcha Block at Listings', u);
                        throw new Error("CHALLENGE_PAUSED");
                    }

                    if (result.status !== "results") break;

                    let listingData = result.listings;
                    for (const item of listingData) {
                        if (item.href && !allListings.some(existing => existing.href === item.href)) {
                            allListings.push(item);
                        }
                    }

                    await updateJobState({ allListings });

                    if (pageNum >= maxPages) break;

                    const nextResult = await executeContentScript(tabInfo.tabId, "click_next_page");
                    if (!nextResult || !nextResult.clicked || !nextResult.changed) break;

                    const expectedPage = pageNum + 1;
                    const actualPage = nextResult.pageNumber;
                    if (actualPage && parseInt(actualPage, 10) !== expectedPage) break;

                    pageNum++;
                }

                // Transition to details phase
                await updateJobState({ phase: 'details', currentDetailIndex: 0, kwResults: [] });
                phase = 'details';
            }

            if (phase === 'details') {
                let currentDetailIndex = job.currentDetailIndex || 0;
                let kwResults = job.kwResults || [];

                for (; currentDetailIndex < allListings.length; currentDetailIndex++) {
                    await updateJobState({ currentDetailIndex, kwResults });
                    const item = allListings[currentDetailIndex];
                    if (!item.href) continue;

                    let targetUrl = item.href;
                    if (job.pausedUrl) { targetUrl = job.pausedUrl; await updateJobState({ pausedUrl: null }); }

                    await navigateAndWait(tabInfo.tabId, targetUrl);
                    await sleep(2000);

                    // check Challenge manually for detail
                    const chk = await executeContentScript(tabInfo.tabId, "check_page_available");
                    if (chk?.cloudflareActive) {
                        const u = (await chrome.tabs.get(tabInfo.tabId)).url;
                        await setManualActionRequired('Cloudflare/Captcha Block at Details', u);
                        throw new Error("CHALLENGE_PAUSED");
                    }

                    const detailData = await executeContentScript(tabInfo.tabId, "extract_details", { keyword });
                    if (detailData && detailData.found) {
                        kwResults.push({ ...item, ...detailData });
                    }
                }

                if (kwResults.length > 0 && !job.uploadedBatch) {
                    await enqueueUpload({ source: "tenderontime", keyword: keyword, tenders: kwResults });
                    allMatchesCount += kwResults.length;
                    await updateJobState({ uploadedBatch: true, resultsCollected: allMatchesCount });
                }
            }

            // reset for next keyword
            await updateJobState({
                phase: 'search',
                currentPage: 1,
                allListings: [],
                kwResults: [],
                currentDetailIndex: 0,
                resultsCollected: allMatchesCount,
                uploadedBatch: false
            });
            await sleep(2000);
        }

        await finishJob(allMatchesCount, {});

    } finally {
        await closeJobTab(tabInfo.windowId);
        await updateJobState({ tabId: null, windowId: null });
    }
}
