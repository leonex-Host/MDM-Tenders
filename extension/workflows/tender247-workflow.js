import { updateJobState, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runTender247Workflow(job) {
    let kwIndex = job.currentKeywordIndex || 0;
    const keywords = job.keywords || [];
    const maxPages = job.max_pages || 7;
    let allMatchesCount = job.resultsCollected || 0;
    let tabInfo = { tabId: job.tabId, windowId: job.windowId };

    if (!job.tabId || !job.windowId) {
        tabInfo = await createJobTab(job);
        await updateJobState({ tabId: tabInfo.tabId, windowId: tabInfo.windowId });
    }

    try {
        for (; kwIndex < keywords.length; kwIndex++) {
            const keyword = keywords[kwIndex];
            const cleanKw = keyword.replace(/[&/()"']/g, " ").replace(/\s+/g, " ").trim().replace(/ /g, "+");
            const searchUrl = `https://www.tender247.com/keyword/${cleanKw}+tenders`;

            let phase = job.phase || 'search';
            let allListings = job.allListings || [];
            let pageNum = job.currentPage || 1;

            if (phase === 'search') {
                await updateJobState({ currentKeywordIndex: kwIndex, keyword, phase: 'search' });
                await navigateAndWait(tabInfo.tabId, job.pausedUrl || searchUrl);
                await updateJobState({ pausedUrl: null });
                await sleep(5000); // Allow JS loads

                while (pageNum <= maxPages) {
                    await updateJobState({ currentPage: pageNum });
                    const dat = await executeContentScript(tabInfo.tabId, "extract_links");
                    if (dat && dat.links && dat.links.length > 0) {
                        for (const link of dat.links) if (!allListings.includes(link)) allListings.push(link);
                    } else break; // No more

                    await updateJobState({ allListings });

                    if (pageNum >= maxPages) break;

                    const nr = await executeContentScript(tabInfo.tabId, "click_next");
                    if (!nr || !nr.clicked) break;

                    await sleep(4000);
                    pageNum++;
                }
                await updateJobState({ phase: 'details', currentDetailIndex: 0, kwResults: [] });
                phase = 'details';
            }

            if (phase === 'details') {
                let currentDetailIndex = job.currentDetailIndex || 0;
                let kwResults = job.kwResults || [];
                const phrase = keyword.toLowerCase().trim();

                for (; currentDetailIndex < allListings.length; currentDetailIndex++) {
                    await updateJobState({ currentDetailIndex, kwResults });
                    const href = allListings[currentDetailIndex];

                    await navigateAndWait(tabInfo.tabId, job.pausedUrl || href);
                    await updateJobState({ pausedUrl: null });
                    await sleep(2000);

                    const details = await executeContentScript(tabInfo.tabId, "extract_details");
                    if (details && details.brief) {
                        if (details.brief.toLowerCase().includes(phrase)) {
                            // clean link
                            const link = href.split("?")[0];
                            const tID = details.tender_id || link.split("/").pop();
                            kwResults.push({
                                source: "tender247",
                                tender_id: tID,
                                title: details.title,
                                description: details.brief,
                                location: details.location,
                                start_date: details.start_date,
                                end_date: details.end_date,
                                link,
                                keyword
                            });
                        }
                    }
                }

                if (kwResults.length > 0 && !job.uploadedBatch) {
                    await enqueueUpload({ source: "tender247", keyword, tenders: kwResults });
                    allMatchesCount += kwResults.length;
                    await updateJobState({ uploadedBatch: true, resultsCollected: allMatchesCount });
                }
            }

            await updateJobState({ phase: 'search', currentPage: 1, allListings: [], kwResults: [], currentDetailIndex: 0, resultsCollected: allMatchesCount, uploadedBatch: false });
        }
        await finishJob(allMatchesCount);
    } finally {
        await closeJobTab(tabInfo.windowId);
        await updateJobState({ tabId: null, windowId: null });
    }
}
