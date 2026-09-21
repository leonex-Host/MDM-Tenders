import { updateJobState, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runGemWorkflow(job) {
    let kwIndex = job.currentKeywordIndex || 0;
    const keywords = job.keywords || [];
    const maxPages = 10;
    let allMatchesCount = job.resultsCollected || 0;
    let tabInfo = { tabId: job.tabId, windowId: job.windowId };

    if (!job.tabId || !job.windowId) {
        tabInfo = await createJobTab(job);
        await updateJobState({ tabId: tabInfo.tabId, windowId: tabInfo.windowId });
    }

    try {
        for (; kwIndex < keywords.length; kwIndex++) {
            const keyword = keywords[kwIndex];
            const searchUrl = `https://bidplus.gem.gov.in/all-bids`;

            let phase = job.phase || 'search';
            let pageNum = job.currentPage || 1;

            if (phase === 'search') {
                await updateJobState({ currentKeywordIndex: kwIndex, keyword, phase: 'search' });

                if (pageNum === 1 && !job.pausedUrl) {
                    await navigateAndWait(tabInfo.tabId, searchUrl);
                    await sleep(3000);
                    await executeContentScript(tabInfo.tabId, "setup_search", { keyword });
                    await sleep(4000);
                } else if (job.pausedUrl) {
                    await navigateAndWait(tabInfo.tabId, job.pausedUrl);
                    await updateJobState({ pausedUrl: null });
                }

                while (pageNum <= maxPages) {
                    await updateJobState({ currentPage: pageNum });

                    const dat = await executeContentScript(tabInfo.tabId, "extract_cards", { keyword });

                    if (dat && dat.results && dat.results.length > 0 && !job.uploadedBatch) {
                        await enqueueUpload({ source: "gem", keyword, tenders: dat.results });
                        allMatchesCount += dat.results.length;
                        await updateJobState({ resultsCollected: allMatchesCount, uploadedBatch: true });
                    }

                    if (pageNum >= maxPages) break;

                    const nr = await executeContentScript(tabInfo.tabId, "click_next");
                    if (!nr || !nr.clicked) break;

                    await sleep(4000);
                    pageNum++;
                    await updateJobState({ uploadedBatch: false });
                }

                await updateJobState({ currentPage: 1, uploadedBatch: false });
            }
        }
        await finishJob(allMatchesCount);
    } finally {
        await closeJobTab(tabInfo.tabId);
        await updateJobState({ tabId: null, windowId: null });
    }
}
