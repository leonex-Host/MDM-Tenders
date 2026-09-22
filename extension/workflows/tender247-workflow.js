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
            let allListings = runtime.allListings || [];
            let pageNum = runtime.currentPage || 1;

            if (phase === 'search') {
                await updateRuntimeState(runtime.jobId, { currentKeywordIndex: kwIndex, keyword, phase: 'search' });
                await navigateAndWait(runtime.tabId, runtime.pausedUrl || searchUrl);
                await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                await sleep(5000); // Allow JS loads

                while (pageNum <= maxPages) {
                    await updateRuntimeState(runtime.jobId, { currentPage: pageNum });
                    const dat = await executeContentScript(runtime.tabId, "extract_links");
                    if (dat && dat.links && dat.links.length > 0) {
                        for (const link of dat.links) if (!allListings.includes(link)) allListings.push(link);
                    } else break; // No more

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
                    const href = allListings[currentDetailIndex];

                    await navigateAndWait(runtime.tabId, runtime.pausedUrl || href);
                    await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                    await sleep(800);

                    const details = await executeContentScript(runtime.tabId, "extract_details");
                    if (details && details.brief) {
                        if (details.brief.toLowerCase().includes(phrase)) {
                            // clean link
                            const link = href.split("?")[0];
                            const tID = details.tender_id || link.split("/").pop();
                            const newMatch = {
                                source: "tender247",
                                tender_id: tID,
                                title: details.title,
                                description: details.brief,
                                location: details.location,
                                start_date: details.start_date,
                                end_date: details.end_date,
                                link,
                                keyword
                            };
                            kwResults.push(newMatch);
                            await enqueueUpload(runtime.jobId, { source: "tender247", keyword, tenders: [newMatch] });
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
