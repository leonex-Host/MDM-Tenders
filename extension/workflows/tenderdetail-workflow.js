import { updateRuntimeState, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runTenderDetailWorkflow(runtime) {
    let kwIndex = runtime.currentKeywordIndex || 0;
    const keywords = runtime.keywords || [];
    const maxPages = 10;
    let allMatchesCount = runtime.resultsCollected || 0;
    let tabInfo = { tabId: runtime.tabId, windowId: runtime.windowId };

    if (!runtime.tabId || !runtime.windowId) {
        tabInfo = await createJobTab(runtime);
        await updateRuntimeState(runtime.jobId, { tabId: tabInfo.tabId, windowId: tabInfo.windowId });
        runtime.tabId = tabInfo.tabId;
        runtime.windowId = tabInfo.windowId;
    }

    try {
        for (; kwIndex < keywords.length; kwIndex++) {
            const keyword = keywords[kwIndex];
            const cleanKw = keyword.replace(/[&/()]/g, " ").replace(/\s+/g, " ").trim();
            const fmtKw = encodeURIComponent(`"${cleanKw}"`);
            const searchUrl = `https://www.tenderdetail.com/Indian-tender/${fmtKw}-tenders`;

            let phase = runtime.phase || 'search';
            let allListings = runtime.allListings || [];
            let pageNum = runtime.currentPage || 1;

            if (phase === 'search') {
                await updateRuntimeState(runtime.jobId, { currentKeywordIndex: kwIndex, keyword, phase: 'search' });

                if (pageNum === 1 && !runtime.pausedUrl) {
                    await navigateAndWait(runtime.tabId, searchUrl);
                    await sleep(1200);
                    await executeContentScript(runtime.tabId, "setup_search");
                    await sleep(1500);
                } else if (runtime.pausedUrl) {
                    await navigateAndWait(runtime.tabId, runtime.pausedUrl);
                    await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                }

                while (pageNum <= maxPages) {
                    await updateRuntimeState(runtime.jobId, { currentPage: pageNum });
                    const dat = await executeContentScript(runtime.tabId, "extract_links");
                    if (dat && dat.results && dat.results.length > 0) {
                        const phrase = keyword.toLowerCase().trim();
                        const newMatches = [];
                        for (const item of dat.results) {
                            if (!allListings.find(x => x.href === item.href)) {
                                allListings.push(item);
                                const briefText = String(item.title + " " + item.description).toLowerCase();
                                if (briefText.includes(phrase)) {
                                    item.keyword = keyword;
                                    newMatches.push(item);
                                    allMatchesCount++;
                                }
                            }
                        }
                        if (newMatches.length > 0) {
                            await enqueueUpload(runtime.jobId, { source: "tenderdetail", keyword, tenders: newMatches });
                        }
                    } else break;

                    await updateRuntimeState(runtime.jobId, { allListings, resultsCollected: allMatchesCount });

                    if (pageNum >= maxPages) break;

                    const nr = await executeContentScript(runtime.tabId, "click_next");
                    if (!nr || !nr.clicked) break;

                    await sleep(1000);
                    pageNum++;
                }

                await updateRuntimeState(runtime.jobId, { currentPage: 1, allListings: [], resultsCollected: allMatchesCount, pausedUrl: null });
            }
        }
        await finishJob(runtime.jobId, allMatchesCount);
    } catch (e) {
        console.error("TenderDetail Error:", e);
        throw e;
    } finally {
        await closeJobTab(tabInfo.tabId);
        await updateRuntimeState(runtime.jobId, { tabId: null, windowId: null });
    }
}
