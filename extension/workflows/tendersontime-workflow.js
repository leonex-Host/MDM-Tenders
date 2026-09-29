import { updateRuntimeState, setManualActionRequired, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab, waitForComplete } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitUntilPageAvailable(tabId, options = {}, keyword = "") {
    const timeout = options.timeout || 120000;
    const startTime = Date.now();
    console.log("[TOT][PAGE_WAIT] Waiting for search URL to render...");
    let challengeLoops = 0;
    while (Date.now() - startTime < timeout) {
        let tabInfo;
        try { tabInfo = await chrome.tabs.get(tabId); } catch (e) { return { ready: false, isChallenge: false }; }

        const pageCheck = await executeContentScript(tabId, "check_page_available");

        const currentUrl = (tabInfo.url || "").toLowerCase();
        let isExpected = false;
        if (options.isGoogle) {
            isExpected = currentUrl.includes("google.com/search");
        } else {
            isExpected = currentUrl.includes("/tenders/advancesearch");
        }

        console.log(`[TOT][PAGE] URL_CHECK expected=${isExpected} url=${tabInfo.url}`);

        if (pageCheck && pageCheck.cloudflareActive) {
            console.warn(`[TOT][${tabId}] CLOUDFLARE tracking... (${challengeLoops}/12)`);
            challengeLoops++;
            if (challengeLoops > 12) {
                return { ready: false, isChallenge: true, reason: 'Cloudflare' };
            }
            await sleep(1500);
            continue;
        } else {
            challengeLoops = 0;
        }

        if (tabInfo.status !== "complete") {
            await sleep(1200);
            continue;
        }

        if (!pageCheck) {
            await sleep(1500); continue;
        }

        if (isExpected && pageCheck.readyState === "complete" && !pageCheck.cloudflareActive) {
            console.log(`[TOT][PAGE] PAGE_READY [${tabId}]`);
            await sleep(1000);
            return { ready: true, isChallenge: false, pageCheck };
        }

        await sleep(1500);
    }

    const fallbackStatus = await executeContentScript(tabId, "check_page_available") || {};
    return { ready: false, isChallenge: false, pageCheck: fallbackStatus };
}

async function waitUntilListingsReady(tabId) {
    const timeout = 35000;
    const startTime = Date.now();
    let noResultsCount = 0;

    console.log(`[TOT][LISTINGS_WAIT] Waiting up to ${timeout}ms for search listings to populate...`);

    while (Date.now() - startTime < timeout) {
        // ALWAYS check for organic "No Results" message first
        // TendersOnTime injects 10-page default fallback tenders if a query yields 0 results!
        const pageCheck = await executeContentScript(tabId, "check_page_available");
        if (pageCheck && pageCheck.hasNoResultsText) {
            noResultsCount++;
            if (noResultsCount >= 3) {
                console.log("[TOT][NO_RESULTS] Confirmed zero-results display condition organically.");
                return { status: "no_results" };
            }
        } else {
            noResultsCount = 0;
        }

        // Use executeScript directly — sendMessage fails after Angular route transitions invalidate content script context
        let listingData = null;
        try {
            const results = await chrome.scripting.executeScript({
                target: { tabId },
                world: "MAIN",
                func: () => {
                    const rawItems = document.querySelectorAll("div.box-shadow, div.listingbox.ng-scope, div.listingbox, div.tender-item, .card");
                    const items = [...rawItems].filter(el => {
                        const t = (el.textContent || "").toLowerCase();
                        return t.length > 20 && (t.includes("tender") || t.includes("tot ref") || t.includes("deadline"));
                    });
                    return items.map(item => {
                        let title = "", href = "", deadline = "", tot_ref = "", country = "";
                        // STRICT: only pick anchor whose href points to an actual tender detail page
                        const linkEl = [...item.querySelectorAll("a")].find(a => {
                            const h = a.getAttribute("href") || a.getAttribute("ng-href") || a.href || "";
                            return h && /tender.*detail|tenders-detail|tenders\/detail/i.test(h);
                        });
                        if (linkEl) {
                            title = (linkEl.textContent || "").trim();
                            const rawHref = linkEl.getAttribute("href") || linkEl.getAttribute("ng-href") || linkEl.href || "";
                            if (rawHref && rawHref !== "null") {
                                try { href = new URL(rawHref, location.origin).href; } catch (e) { href = rawHref; }
                            }
                        }
                        const deadlineEl = item.querySelector(".deadline strong, .deadline-date, td.deadline");
                        if (deadlineEl) deadline = (deadlineEl.textContent || "").trim();
                        const refMatch = (item.textContent || "").match(/TOT\s*Ref\.?\s*No\.?\s*:?\s*(\d+)/i);
                        if (refMatch) tot_ref = refMatch[1];
                        const flagEl = item.querySelector("span.flag-icon");
                        if (flagEl && flagEl.parentElement) {
                            const b = flagEl.parentElement.querySelector("strong");
                            if (b) country = (b.textContent || "").trim();
                        }
                        if (!title) title = (item.textContent || "").split("\n")[0].trim().slice(0, 120);
                        return { title, href, deadline, tot_ref, country };
                    }).filter(x => x.href);
                }
            });
            listingData = results?.[0]?.result ?? null;
            console.log(`[TOT][SCRIPTING] extracted listingData length=${Array.isArray(listingData) ? listingData.length : 'null'}`);
        } catch (e) {
            console.warn("[TOT][SCRIPTING] executeScript failed:", e.message);
            listingData = null;
        }

        if (!listingData) {
            await sleep(500); continue;
        }

        if (Array.isArray(listingData)) {
            if (listingData.length > 0 && noResultsCount === 0) {
                console.log(`[TOT][LISTINGS_READY] Dynamically detected ${listingData.length} valid results.`);
                return { status: "results", listings: listingData };
            }
        }
        await sleep(200);
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
                console.log("[TOT][DEBUG] BEFORE_NAVIGATION");
                if (runtime.pausedUrl) {
                    console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] NAVIGATION_START ${runtime.pausedUrl}`);
                    navigationResult = await navigateAndWait(runtime.tabId, runtime.pausedUrl);
                    await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                } else {
                    console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] NAVIGATION_START ${searchUrl}`);
                    navigationResult = await navigateAndWait(runtime.tabId, searchUrl);
                }
                console.log("[TOT][DEBUG] AFTER_NAVIGATION");

                if (!navigationResult) {
                    console.warn(`[TOT][${runtime.jobId}][${runtime.tabId}] NAVIGATION_FAILED keyword="${keyword}" failed. Skipping.`);
                    continue;
                }
                console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] NAVIGATION_COMPLETE keyword="${keyword}"`);

                // Inject Silent Captcha XHR Interceptor
                await chrome.scripting.executeScript({
                    target: { tabId: runtime.tabId },
                    world: "MAIN",
                    func: () => {
                        try {
                            if (!window._xhrIntercepted) {
                                window._xhrIntercepted = true;
                                const originalOpen = XMLHttpRequest.prototype.open;
                                XMLHttpRequest.prototype.open = function () {
                                    this.addEventListener('load', function () {
                                        if (this.responseText &&
                                            (this.responseText.includes('cf-turnstile') ||
                                                this.responseText.includes('just a moment') ||
                                                this.responseText.includes('verify you are human'))) {
                                            document.body.setAttribute('data-captcha-silent', 'true');
                                        }
                                    });
                                    originalOpen.apply(this, arguments);
                                };
                            }
                        } catch (e) { }
                    }
                }).catch(e => console.warn("[TOT] Interceptor inject skip:", e));

                // Ensure minimal AngularJS structural hydration before dispatching synthetic native events
                await new Promise(r => setTimeout(r, 250));

                console.log("[TOT][DEBUG] BEFORE_PAGE_CHECK");
                const pageReady = await waitUntilPageAvailable(runtime.tabId, { isGoogle: false }, keyword);
                console.log("[TOT][DEBUG] AFTER_PAGE_CHECK");
                console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] PAGE_CHECK keyword="${keyword}" ready=${pageReady.ready}`);

                if (pageReady.isChallenge) {
                    console.warn(`[TOT][${runtime.jobId}][${runtime.tabId}] CLOUDFLARE Suspended keyword processing natively -> ${keyword}`);
                    const u = (await chrome.tabs.get(runtime.tabId)).url;
                    await setManualActionRequired(runtime.jobId, 'Cloudflare/Captcha Block', u);
                    // Force a full reload so the Captcha natively surfaces for the user to solve visually
                    await chrome.tabs.reload(runtime.tabId);
                    throw new Error("CHALLENGE_PAUSED");
                }
                if (!pageReady.ready) {
                    console.error(`[TOT][${runtime.jobId}][${runtime.tabId}] ERROR Fatal wait condition failed unconditionally on keyword: ${keyword}. Skipping bounds.`);
                    continue;
                }

                console.log("[TOT][DEBUG] BEFORE_FILTER_CLICK");
                console.log(`[TOT][FILTER] sending click_filter_button`);
                let filterResult = await executeContentScript(runtime.tabId, "click_filter_button", { keyword });
                console.log(`[TOT][${runtime.jobId}][${runtime.tabId}] FILTER_RESULT`, filterResult);
                console.log(`[TOT][DEBUG] AFTER_FILTER_CLICK`);

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
                        await chrome.tabs.reload(runtime.tabId);
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
                    await navigateAndWait(runtime.tabId, targetUrl, 120000, true);

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
                        // STRICT ORCHESTRATOR OVERRIDE:
                        // If the content script was stale/cached and falsely passed found=true,
                        // this double-check prevents it from reaching the database!
                        const kwPattern = keyword.trim().toLowerCase().replace(/\s+/g, "[\\s\\-_]+");
                        const kwRegex = new RegExp(kwPattern, "i");

                        const extractedTitle = detailData.extractedTitle || "";
                        const itemTitle = (item.title || "");

                        let safePass = false;
                        if (kwRegex.test(extractedTitle.toLowerCase()) || kwRegex.test(itemTitle.toLowerCase())) {
                            safePass = true;
                        }

                        if (!safePass) {
                            console.warn(`[TOT][${runtime.jobId}] ORCHESTRATOR BLOCKED STALE MATCH: ${itemTitle} did NOT contain ${keyword}. Skipping.`);
                            continue; // DO NOT SAVE!
                        }

                        const newMatch = { ...item, ...detailData };
                        kwResults.push(newMatch);
                        await enqueueUpload(runtime.jobId, { source: "tenderontime", keyword: keyword, tenders: [newMatch] });
                        allMatchesCount++;
                        await updateRuntimeState(runtime.jobId, { resultsCollected: allMatchesCount });
                    }
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
