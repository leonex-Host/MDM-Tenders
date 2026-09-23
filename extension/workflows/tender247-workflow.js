import { updateRuntimeState, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runTender247Workflow(runtime) {
    let kwIndex = runtime.currentKeywordIndex || 0;
    const keywords = runtime.keywords || [];
    const maxPages = runtime.max_pages || 7;
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
            const cleanKw = keyword.replace(/[&/()"']/g, " ").replace(/\s+/g, " ").trim().replace(/ /g, "+");
            const searchUrl = `https://www.tender247.com/keyword/${cleanKw}+tenders`;

            let phase = runtime.phase || 'search';
            let pageNum = runtime.currentPage || 1;
            let currentKeywordMatchCount = runtime.currentKeywordMatchCount || 0;

            await updateRuntimeState(runtime.jobId, { currentKeywordIndex: kwIndex, keyword, phase: 'search' });

            if (pageNum === 1 && !runtime.pausedUrl) {
                await navigateAndWait(runtime.tabId, searchUrl);
                await sleep(4000);
            } else if (runtime.pausedUrl) {
                await navigateAndWait(runtime.tabId, runtime.pausedUrl);
                await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                await sleep(2000);
            }

            const phrase = keyword.toLowerCase().trim();

            while (pageNum <= maxPages) {
                await updateRuntimeState(runtime.jobId, { currentPage: pageNum });

                const dat = await executeContentScript(runtime.tabId, "extract_grid");
                if (dat && dat.results && dat.results.length > 0) {
                    for (const item of dat.results) {
                        const combinedCheck = (item.title + " " + item.brief).toLowerCase();
                        if (combinedCheck.includes(phrase)) {
                            const newMatch = {
                                source: "tender247",
                                tender_id: item.tender_id || item.href.split("/").pop(),
                                title: item.title,
                                description: item.brief,
                                location: item.location,
                                end_date: item.end_date,
                                link: item.href,
                                keyword
                            };
                            await enqueueUpload(runtime.jobId, { source: "tender247", keyword, tenders: [newMatch] });
                            allMatchesCount++;
                            currentKeywordMatchCount++;
                            await updateRuntimeState(runtime.jobId, { resultsCollected: allMatchesCount, currentKeywordMatchCount });
                        }
                    }
                } else break; // No more

                if (pageNum >= maxPages) break;

                const nr = await executeContentScript(runtime.tabId, "click_next");
                if (!nr || !nr.clicked) break;

                await sleep(2500);
                pageNum++;
            }

            await updateRuntimeState(runtime.jobId, { currentPage: 1, currentKeywordMatchCount: 0 });
        }
        await finishJob(runtime.jobId, allMatchesCount);
    } finally {
        await closeJobTab(runtime.tabId);
        await updateRuntimeState(runtime.jobId, { tabId: null, windowId: null });
    }
}
