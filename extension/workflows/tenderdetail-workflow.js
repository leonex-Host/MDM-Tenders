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
                    await sleep(3000);
                    await executeContentScript(runtime.tabId, "setup_search");
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
                    if (details && details.brief) {
                        const briefText = details.brief.toLowerCase();
                        if (briefText.includes(phrase)) {
                            kwResults.push({
                                source: "tenderdetail",
                                tender_id: item.tender_id || (item.href.split("/").pop()),
                                title: details.title || details.brief.substring(0, 250),
                                description: details.brief,
                                location: details.location,
                                start_date: details.start_date,
                                end_date: item.due_date,
                                link: item.href,
                                keyword
                            });
                        }
                    }
                }

                if (kwResults.length > 0 && !runtime.uploadedBatch) {
                    await enqueueUpload(runtime.jobId, { source: "tenderdetail", keyword, tenders: kwResults });
                    allMatchesCount += kwResults.length;
                    await updateRuntimeState(runtime.jobId, { uploadedBatch: true, resultsCollected: allMatchesCount });
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
