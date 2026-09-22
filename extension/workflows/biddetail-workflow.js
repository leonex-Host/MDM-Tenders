import { updateRuntimeState, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runBidDetailWorkflow(runtime) {
    let kwIndex = runtime.currentKeywordIndex || 0;
    const keywords = runtime.keywords || [];
    const maxPages = 10;
    let allMatchesCount = runtime.resultsCollected || 0;
    let tabInfo = { tabId: runtime.tabId, windowId: runtime.windowId };

    console.log(`[BidDetailTrace] source detected: ${runtime.source || 'undefined'}`);
    console.log(`[BidDetailTrace] job ID: ${runtime.job_id || 'undefined'}`);
    console.log(`[BidDetailTrace] job status: ${runtime.status || 'undefined'}`);


    if (!runtime.tabId || !runtime.windowId) {
        tabInfo = await createJobTab(runtime);
        await updateRuntimeState(runtime.jobId, { tabId: tabInfo.tabId, windowId: tabInfo.windowId });
        runtime.tabId = tabInfo.tabId;
        runtime.windowId = tabInfo.windowId;
    }

    try {
        for (; kwIndex < keywords.length; kwIndex++) {
            const keyword = keywords[kwIndex];
            const fmtKw = encodeURIComponent(`"${keyword}"`);
            const searchUrl = `https://www.biddetail.com/global-tenders/${fmtKw}-tenders`;

            let phase = runtime.phase || 'search';
            let allListings = runtime.allListings || [];
            let pageNum = runtime.currentPage || 1;

            if (phase === 'search') {
                await updateRuntimeState(runtime.jobId, { currentKeywordIndex: kwIndex, keyword, phase: 'search' });

                if (pageNum === 1 && !runtime.pausedUrl) {
                    await navigateAndWait(runtime.tabId, searchUrl);
                    await sleep(3000);
                    const sr = await executeContentScript(runtime.tabId, "setup_search");
                    console.log(`[BidDetail][${runtime.jobId}] setup_search result:`, sr);
                    await sleep(4000);
                } else if (runtime.pausedUrl) {
                    await navigateAndWait(runtime.tabId, runtime.pausedUrl);
                    await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                }

                while (pageNum <= maxPages) {
                    await updateRuntimeState(runtime.jobId, { currentPage: pageNum });
                    const dat = await executeContentScript(runtime.tabId, "extract_links");
                    if (dat && dat.results && dat.results.length > 0) {
                        for (const item of dat.results) {
                            if (!allListings.find(x => x.href === item.href)) allListings.push(item);
                        }
                    } else break;

                    await updateRuntimeState(runtime.jobId, { allListings });

                    if (pageNum >= maxPages) break;

                    const nr = await executeContentScript(runtime.tabId, "click_next");
                    if (!nr || !nr.clicked) break;

                    if (nr.clickId) {
                        await chrome.scripting.executeScript({
                            target: { tabId: runtime.tabId },
                            world: "MAIN",
                            func: (id) => { const el = document.getElementById(id); if (el) el.click(); },
                            args: [nr.clickId]
                        }).catch(() => { });
                    }

                    await sleep(2500);
                    pageNum++;
                }
                await updateRuntimeState(runtime.jobId, { phase: 'details', currentDetailIndex: 0, kwResults: [] });
                phase = 'details';
            }

            if (phase === 'details') {
                let currentDetailIndex = runtime.currentDetailIndex || 0;
                let kwResults = runtime.kwResults || [];
                const phrase = keyword.toLowerCase().trim();

                for (; currentDetailIndex < allListings.length; currentDetailIndex++) {
                    await updateRuntimeState(runtime.jobId, { currentDetailIndex, kwResults });
                    const item = allListings[currentDetailIndex];

                    await navigateAndWait(runtime.tabId, runtime.pausedUrl || item.href);
                    await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                    await sleep(800);

                    const details = await executeContentScript(runtime.tabId, "extract_details");
                    if (details) {
                        const brief = details.brief || item.description || "";
                        const combinedCheck = (brief + " " + JSON.stringify(details.meta)).toLowerCase();
                        console.log(`[BidDetailTrace] extracted detail URL: ${item.href}`);

                        if (combinedCheck.includes(phrase)) {
                            const newMatch = {
                                source: "biddetail",
                                tender_id: item.bdr_no || (item.href.split("/").pop()),
                                title: (item.description || item.organization).substring(0, 547),
                                description: brief,
                                location: item.location,
                                start_date: details.meta && (details.meta["Opening Date"] || details.meta["Start Date"] || ""),
                                end_date: item.deadline,
                                link: item.href,
                                keyword
                            };
                            kwResults.push(newMatch);
                            await enqueueUpload(runtime.jobId, { source: "biddetail", keyword, tenders: [newMatch] });
                            allMatchesCount++;
                            await updateRuntimeState(runtime.jobId, { resultsCollected: allMatchesCount });
                        }
                    }
                }
            }

            await updateRuntimeState(runtime.jobId, { phase: 'search', currentPage: 1, allListings: [], kwResults: [], currentDetailIndex: 0, resultsCollected: allMatchesCount, uploadedBatch: false });
        }
        await finishJob(runtime.jobId, allMatchesCount);
    } finally {
        await closeJobTab(runtime.tabId);
        await updateRuntimeState(runtime.jobId, { tabId: null, windowId: null });
    }
}
