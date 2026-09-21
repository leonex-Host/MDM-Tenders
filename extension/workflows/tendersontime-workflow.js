import { updateJobState, setManualActionRequired, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab, waitForComplete } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitUntilPageAvailable(tabId, options = {}) {
    const timeout = options.timeout || 120000;
    console.log("[TOT][PAGE_WAIT] Waiting for search URL to render...");
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
            console.warn("[TOT][CLOUDFLARE] Cloudflare detected dynamically during wait.");
            return { ready: false, isChallenge: true, reason: 'Cloudflare' };
        }

        const isExpected = options.isGoogle
            ? tabInfo.url.includes("google.com/search")
            : tabInfo.url.includes("advancesearch");

        if (isExpected && pageCheck.readyState === "complete" && (options.isGoogle || pageCheck.formReady)) {
            console.log("[TOT][PAGE_READY] Expected advanced search environment perfectly confirmed.");
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

    console.log(`[TOT][LISTINGS_WAIT] Waiting up to ${timeout}ms for search listings to populate...`);
    while (Date.now() - startTime < timeout) {
        let listingData = await executeContentScript(tabId, "extract_listings");
        if (!listingData) {
            await sleep(1000); continue;
        }
        if (listingData.status === "cloudflare") {
            console.warn("[TOT][CLOUDFLARE] Block intercepted organically within items block.");
            return { isChallenge: true, reason: 'Cloudflare' };
        }
        if (Array.isArray(listingData)) {
            if (listingData.length === 0) {
                let pageCheck = await executeContentScript(tabId, "check_page_available");
                if (pageCheck && pageCheck.hasNoResultsText) {
                    noResultsCount++;
                    if (noResultsCount >= 3) {
                        console.log("[TOT][NO_RESULTS] Confirmed zero-results display condition organically.");
                        return { status: "no_results" };
                    }
                } else {
                    noResultsCount = 0;
                }
                await sleep(1000);
                continue;
            } else {
                console.log(`[TOT][LISTINGS_READY] Dynamically detected ${listingData.length} valid results on active view.`);
                return { status: "results", listings: listingData };
            }
        }
        await sleep(1000);
    }
    console.warn("[TOT][LISTINGS_TIMEOUT] Listings failed to render within allotted tracking window.");
    return { status: "timeout" };
}

export async function runTendersOnTimeWorkflow(job) {
    let kwIndex = job.currentKeywordIndex || 0;
    const keywords = job.keywords || [];
    const maxPages = job.max_pages || 7;
    let allMatchesCount = job.resultsCollected || 0;

    let tabInfo = { tabId: job.tabId, windowId: job.windowId };
    try {
        if (!job.tabId || !job.windowId) {
            tabInfo = await createJobTab(job);
            await updateJobState({ tabId: tabInfo.tabId, windowId: tabInfo.windowId });
        } else {
            // Re-verify if tab exists after resume
            try {
                await chrome.tabs.get(tabInfo.tabId);
            } catch (e) {
                tabInfo = await createJobTab(job);
                await updateJobState({ tabId: tabInfo.tabId, windowId: tabInfo.windowId });
            }
        }
    } catch (e) { throw e; }

    let challengePaused = false;
    try {
        for (; kwIndex < keywords.length; kwIndex++) {
            const keyword = keywords[kwIndex];
            const escaped = encodeURIComponent(keyword.trim());
            const searchUrl = `https://www.tendersontime.com/tenders/advanceSearch?q=${escaped}`;

            // Allow resuming from a specific phase
            let phase = job.phase || 'search';
            let allListings = job.allListings || [];
            let pageNum = job.currentPage || 1;

            console.log(`[TOT][KEYWORD_START] ${keyword}`);

            if (phase === 'search' || phase === 'list_collection') {
                await updateJobState({ currentKeywordIndex: kwIndex, keyword, phase: 'search' });

                if (job.pausedUrl) {
                    console.log(`[TOT][NAVIGATION] ${job.pausedUrl}`);
                    await navigateAndWait(tabInfo.tabId, job.pausedUrl);
                    await updateJobState({ pausedUrl: null });
                } else {
                    console.log(`[TOT][NAVIGATION] ${searchUrl}`);
                    await navigateAndWait(tabInfo.tabId, searchUrl);
                }

                const pageReady = await waitUntilPageAvailable(tabInfo.tabId, { isGoogle: false });
                if (pageReady.isChallenge) {
                    console.warn(`[TOT][CLOUDFLARE] Suspended keyword processing natively -> ${keyword}`);
                    const u = (await chrome.tabs.get(tabInfo.tabId)).url;
                    await setManualActionRequired('Cloudflare/Captcha Block', u);
                    throw new Error("CHALLENGE_PAUSED");
                }
                if (!pageReady.ready) {
                    console.error(`[TOT][ERROR] Fatal wait condition failed unconditionally on keyword: ${keyword}. Skipping bounds.`);
                    continue;
                }

                console.log(`[TOT][FILTER_SEARCH] Activating filter targets on keyword: ${keyword}`);
                let filterResult = await executeContentScript(tabInfo.tabId, "click_filter_button", { keyword });
                if (!filterResult?.clicked) {
                    console.warn(`[TOT][FILTER_FAILED] exact filter button not found`);
                    continue;
                }

                // Result readiness now verified separately!

                await updateJobState({ phase: 'list_collection' });

                while (pageNum <= maxPages) {
                    console.log(`[TOT][PAGINATION] Actively scraping page coordinate index [${pageNum}/${maxPages}]`);
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
                    if (!nextResult || !nextResult.clicked || !nextResult.changed) {
                        console.warn(`[TOT][ERROR] Next click natively failed or duplicate bounds detected organically.`);
                        break;
                    }

                    const expectedPage = pageNum + 1;
                    const actualPage = nextResult.pageNumber;
                    if (actualPage && parseInt(actualPage, 10) !== expectedPage) {
                        console.warn(`[TOT][ERROR] Pagination sequence mismatch. Expected ${expectedPage}, read ${actualPage}. Exiting slice bounds.`);
                        break;
                    }
                    console.log(`[TOT][PAGE_CHANGED] Successfully traversed into native iteration loop ${actualPage}.`);

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
                    if (job.pausedUrl) {
                        targetUrl = job.pausedUrl;
                        await updateJobState({ pausedUrl: null });
                    }

                    console.log(`[TOT][DETAIL] Fetching specific document signature... ${currentDetailIndex + 1}/${allListings.length}`);
                    await navigateAndWait(tabInfo.tabId, targetUrl);
                    await sleep(2000);

                    // check Challenge manually for detail
                    const chk = await executeContentScript(tabInfo.tabId, "check_page_available");
                    if (chk?.cloudflareActive) {
                        console.warn("[TOT][CLOUDFLARE] Block intersected organically mapping isolated document detail layout.");
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
                    console.log(`[TOT][UPLOAD] Queuing batch transfer matrix containing ${kwResults.length} records...`);
                    await enqueueUpload({ source: "tenderontime", keyword: keyword, tenders: kwResults });
                    allMatchesCount += kwResults.length;
                    await updateJobState({ uploadedBatch: true, resultsCollected: allMatchesCount });
                }
            }

            console.log(`[TOT][KEYWORD_COMPLETE] ${keyword}`);
            if (kwIndex < keywords.length - 1) {
                console.log(`[TOT][KEYWORD_NEXT] ${keywords[kwIndex + 1]}`);
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

        console.log(`[TOT][JOB_COMPLETE] Unambiguously terminating current operation structurally natively! Records matched: ${allMatchesCount}`);
        await finishJob(allMatchesCount, {});

    } catch (e) {
        if (e && e.message === "CHALLENGE_PAUSED") challengePaused = true;
        throw e;
    } finally {
        if (!challengePaused) {
            await closeJobTab(tabInfo.windowId);
            await updateJobState({ tabId: null, windowId: null });
        }
    }
}
