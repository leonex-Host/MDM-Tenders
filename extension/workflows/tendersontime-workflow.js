import { updateRuntimeState, setManualActionRequired, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab, waitForComplete } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitUntilPageAvailable(tabId, options = {}, keyword = "") {
    const timeout = options.timeout || 120000;
    const startTime = Date.now();
    console.log("[TOT][PAGE_WAIT] Waiting for search URL to render...");
    while (Date.now() - startTime < timeout) {
        let tabInfo;
        try { tabInfo = await chrome.tabs.get(tabId); } catch (e) { return { ready: false, isChallenge: false }; }

        const pageCheck = await executeContentScript(tabId, "check_page_available");

        if (pageCheck && pageCheck.cloudflareActive) {
            console.warn("[TOT][${runtime.jobId}][${runtime.tabId}] CLOUDFLARE Cloudflare detected dynamically during wait.");
            return { ready: false, isChallenge: true, reason: 'Cloudflare' };
        }

        if (tabInfo.status !== "complete") {
            await sleep(1200);
            continue;
        }

        if (!pageCheck) {
            await sleep(1500); continue;
        }

        const isExpected = options.isGoogle
            ? tabInfo.url.includes("google.com/search")
            : tabInfo.url.includes("advancesearch");

        if (isExpected && pageCheck.pageAvailable) {
            console.log("[TOT][${runtime.jobId}][${runtime.tabId}] PAGE_READY Expected advanced search environment perfectly confirmed.");
            await sleep(1500);
            return { ready: true, isChallenge: false, pageCheck };
        }

        await sleep(1500);
    }

    // Attempt fallback retrieval before hard fail
    const fallbackStatus = await executeContentScript(tabId, "check_page_available") || {};
    console.error(`[TOT][PAGE_TIMEOUT] keyword="${keyword}"\nreason="timeout"\nurl="${(await chrome.tabs.get(tabId).catch(() => ({ url: '' }))).url}"\nreadyState="${fallbackStatus.readyState}"\nformReady=${fallbackStatus.formReady}\nfilterReady=${fallbackStatus.filterReady}\nexactFilter=${fallbackStatus.exactFilter}`);
    return { ready: false, isChallenge: false, pageCheck: fallbackStatus };
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
            console.warn("[TOT][${runtime.jobId}][${runtime.tabId}] CLOUDFLARE Block intercepted organically within items block.");
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

export async function runTendersOnTimeWorkflow(runtime) {
    let kwIndex = runtime.currentKeywordIndex || 0;
    const keywords = runtime.keywords || [];
    const maxPages = runtime.max_pages || 7;
    let allMatchesCount = runtime.resultsCollected || 0;

    let tabInfo = { tabId: runtime.tabId, windowId: runtime.windowId };
    try {
        if (!runtime.tabId) {
            tabInfo = await createJobTab(runtime);
            await updateRuntimeState(runtime.jobId, { tabId: tabInfo.tabId, windowId: tabInfo.windowId });
            runtime.tabId = tabInfo.tabId;
        } else {
            // Re-verify if tab exists after resume
            try {
                await chrome.tabs.get(runtime.tabId);
            } catch (e) {
                tabInfo = await createJobTab(runtime);
                await updateRuntimeState(runtime.jobId, { tabId: tabInfo.tabId, windowId: tabInfo.windowId });
                runtime.tabId = tabInfo.tabId;
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
            let phase = runtime.phase || 'search';
            let allListings = runtime.allListings || [];
            let pageNum = runtime.currentPage || 1;

            console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] KEYWORD_START ${keyword}`);

            if (phase === 'search' || phase === 'list_collection') {
                await updateRuntimeState(runtime.jobId, { currentKeywordIndex: kwIndex, keyword, phase: 'search' });

                let navigationResult = null;
                if (runtime.pausedUrl) {
                    console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] NAVIGATION_START ${runtime.pausedUrl}`);
                    navigationResult = await navigateAndWait(runtime.tabId, runtime.pausedUrl);
                    await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                } else {
                    console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] NAVIGATION_START ${searchUrl}`);
                    navigationResult = await navigateAndWait(runtime.tabId, searchUrl);
                }

                if (!navigationResult) {
                    console.warn(`[TOT][${runtime.jobId}][${runtime.tabId}] NAVIGATION_FAILED keyword="${keyword}" failed. Skipping.`);
                    continue;
                }
                console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] NAVIGATION_COMPLETE keyword="${keyword}"`);

                const pageReady = await waitUntilPageAvailable(runtime.tabId, { isGoogle: false }, keyword);
                console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] PAGE_CHECK keyword="${keyword}" ready=${pageReady.ready}`);

                if (pageReady.isChallenge) {
                    console.warn(`[TOT][${runtime.jobId}][${runtime.tabId}] CLOUDFLARE Suspended keyword processing natively -> ${keyword}`);
                    const u = (await chrome.tabs.get(runtime.tabId)).url;
                    await setManualActionRequired(runtime.jobId, 'Cloudflare/Captcha Block', u);
                    throw new Error("CHALLENGE_PAUSED");
                }
                if (!pageReady.ready) {
                    console.error(`[TOT][${runtime.jobId}][${runtime.tabId}] ERROR Fatal wait condition failed unconditionally on keyword: ${keyword}. Skipping bounds.`);
                    continue;
                }

                console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] FILTER_ACTION_START keyword="${keyword}"`);
                let filterResult = await executeContentScript(runtime.tabId, "click_filter_button", { keyword });
                console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] FILTER_ACTION_RETURNED keyword="${keyword}" result=${JSON.stringify(filterResult || {})}`);

                if (!filterResult?.clicked) {
                    console.warn(`[TOT][${runtime.jobId}][${runtime.tabId}] FILTER_FAILED exact filter button not found`);
                    continue;
                }

                // Result readiness now verified separately!

                await updateRuntimeState(runtime.jobId, { phase: 'list_collection' });

                while (pageNum <= maxPages) {
                    console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] LISTING_WAIT_START keyword="${keyword}"`);
                    console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] PAGINATION Actively scraping page coordinate index [${pageNum}/${maxPages}]`);
                    await updateRuntimeState(runtime.jobId, { currentPage: pageNum });
                    const result = await waitUntilListingsReady(runtime.tabId);
                    console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] LISTING_WAIT_RETURNED keyword="${keyword}" status="${result.status}"`);
                    if (result.isChallenge) {
                        const u = (await chrome.tabs.get(runtime.tabId)).url;
                        await setManualActionRequired(runtime.jobId, 'Cloudflare/Captcha Block at Listings', u);
                        throw new Error("CHALLENGE_PAUSED");
                    }

                    if (result.status !== "results") break;

                    let listingData = result.listings;
                    for (const item of listingData) {
                        if (item.href && !allListings.some(existing => existing.href === item.href)) {
                            allListings.push(item);
                        }
                    }

                    await updateRuntimeState(runtime.jobId, { allListings });

                    if (pageNum >= maxPages) break;

                    const nextResult = await executeContentScript(runtime.tabId, "click_next_page");
                    if (!nextResult || !nextResult.clicked || !nextResult.changed) {
                        console.warn(`[TOT][${runtime.jobId}][${runtime.tabId}] ERROR Next click natively failed or duplicate bounds detected organically.`);
                        break;
                    }

                    const expectedPage = pageNum + 1;
                    const actualPage = nextResult.pageNumber;
                    if (actualPage && parseInt(actualPage, 10) !== expectedPage) {
                        console.warn(`[TOT][${runtime.jobId}][${runtime.tabId}] ERROR Pagination sequence mismatch. Expected ${expectedPage}, read ${actualPage}. Exiting slice bounds.`);
                        break;
                    }
                    console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] PAGE_CHANGED Successfully traversed into native iteration loop ${actualPage}.`);

                    pageNum++;
                }

                // Transition to details phase
                await updateRuntimeState(runtime.jobId, { phase: 'details', currentDetailIndex: 0, kwResults: [] });
                phase = 'details';
            }

            if (phase === 'details') {
                let currentDetailIndex = runtime.currentDetailIndex || 0;
                let kwResults = runtime.kwResults || [];

                for (; currentDetailIndex < allListings.length; currentDetailIndex++) {
                    await updateRuntimeState(runtime.jobId, { currentDetailIndex, kwResults });
                    const item = allListings[currentDetailIndex];
                    if (!item.href) continue;

                    let targetUrl = item.href;
                    if (runtime.pausedUrl) {
                        targetUrl = runtime.pausedUrl;
                        await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                    }

                    console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] DETAIL Fetching specific document signature... ${currentDetailIndex + 1}/${allListings.length}`);
                    await navigateAndWait(runtime.tabId, targetUrl);
                    await sleep(2000);

                    // check Challenge manually for detail
                    const chk = await executeContentScript(runtime.tabId, "check_page_available");
                    if (chk?.cloudflareActive) {
                        console.warn("[TOT][${runtime.jobId}][${runtime.tabId}] CLOUDFLARE Block intersected organically mapping isolated document detail layout.");
                        const u = (await chrome.tabs.get(runtime.tabId)).url;
                        await setManualActionRequired(runtime.jobId, 'Cloudflare/Captcha Block at Details', u);
                        throw new Error("CHALLENGE_PAUSED");
                    }

                    const detailData = await executeContentScript(runtime.tabId, "extract_details", { keyword });
                    if (detailData && detailData.found) {
                        kwResults.push({ ...item, ...detailData });
                    }
                }

                if (kwResults.length > 0 && !runtime.uploadedBatch) {
                    console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] UPLOAD Queuing batch transfer matrix containing ${kwResults.length} records...`);
                    await enqueueUpload(runtime.jobId, { source: "tenderontime", keyword: keyword, tenders: kwResults });
                    allMatchesCount += kwResults.length;
                    await updateRuntimeState(runtime.jobId, { uploadedBatch: true, resultsCollected: allMatchesCount });
                }
            }

            console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] KEYWORD_COMPLETE keyword="${keyword}"`);
            if (kwIndex < keywords.length - 1) {
                console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] KEYWORD_NEXT keyword="${keywords[kwIndex + 1]}"`);
            }

            // reset for next keyword
            await updateRuntimeState(runtime.jobId, {
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

        console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] JOB_COMPLETE Unambiguously terminating current operation structurally natively! Records matched: ${allMatchesCount}`);
        await finishJob(runtime.jobId, allMatchesCount, {});

    } catch (e) {
        if (e && e.message === "CHALLENGE_PAUSED") challengePaused = true;
        throw e;
    } finally {
        if (!challengePaused) {
            await closeJobTab(runtime.tabId);
            await updateRuntimeState(runtime.jobId, { tabId: null });
        }
    }
}
