import { updateRuntimeState, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runGemWorkflow(runtime) {
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
            const searchUrl = `https://bidplus.gem.gov.in/all-bids`;

            let phase = runtime.phase || 'search';
            let pageNum = runtime.currentPage || 1;

            if (phase === 'search') {
                if (!await updateRuntimeState(runtime.jobId, { currentKeywordIndex: kwIndex, keyword, phase: 'search' })) return;

                if (pageNum === 1 && !runtime.pausedUrl) {
                    await navigateAndWait(runtime.tabId, searchUrl);
                    await sleep(3000);
                    await executeContentScript(runtime.tabId, "setup_search", { keyword });
                    await sleep(4000);
                } else if (runtime.pausedUrl) {
                    await navigateAndWait(runtime.tabId, runtime.pausedUrl);
                    await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                }

                while (pageNum <= maxPages) {
                    if (!await updateRuntimeState(runtime.jobId, { currentPage: pageNum })) return;

                    let previousFirstId = null;
                    const dat = await executeContentScript(runtime.tabId, "extract_cards", { keyword });

                    if (dat && dat.results && dat.results.length > 0) {
                        previousFirstId = dat.results[0].tender_id;
                        if (!runtime.uploadedBatch) {
                            await enqueueUpload(runtime.jobId, { source: "gem", keyword, tenders: dat.results });
                            allMatchesCount += dat.results.length;
                            await updateRuntimeState(runtime.jobId, { resultsCollected: allMatchesCount, uploadedBatch: true });
                        }
                    }

                    if (pageNum >= maxPages) break;

                    const nr = await executeContentScript(runtime.tabId, "click_next");
                    if (!nr || !nr.clicked) break;

                    await sleep(4000);
                    pageNum++;
                    if (!await updateRuntimeState(runtime.jobId, { uploadedBatch: false })) return;
                }

                if (!await updateRuntimeState(runtime.jobId, { currentPage: 1, uploadedBatch: false })) return;
            }
        }
        await finishJob(runtime.jobId, allMatchesCount);
    } finally {
        await closeJobTab(runtime.tabId);
        await updateRuntimeState(runtime.jobId, { tabId: null, windowId: null });
    }
}
