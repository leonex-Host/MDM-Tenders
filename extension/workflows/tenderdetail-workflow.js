import { updateJobState, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runTenderDetailWorkflow(job) {
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
            const cleanKw = keyword.replace(/[&/()]/g, " ").replace(/\s+/g, " ").trim();
            const fmtKw = encodeURIComponent(`"${cleanKw}"`);
            const searchUrl = `https://www.tenderdetail.com/Indian-tender/${fmtKw}-tenders`;

            let phase = job.phase || 'search';
            let allListings = job.allListings || [];
            let pageNum = job.currentPage || 1;

            if (phase === 'search') {
                await updateJobState({ currentKeywordIndex: kwIndex, keyword, phase: 'search' });

                if (pageNum === 1 && !job.pausedUrl) {
                    await navigateAndWait(tabInfo.tabId, searchUrl);
                    await sleep(3000);
                    await executeContentScript(tabInfo.tabId, "setup_search");
                    await sleep(4000);
                } else if (job.pausedUrl) {
                    await navigateAndWait(tabInfo.tabId, job.pausedUrl);
                    await updateJobState({ pausedUrl: null });
                }

                while (pageNum <= maxPages) {
                    await updateJobState({ currentPage: pageNum });
                    const dat = await executeContentScript(tabInfo.tabId, "extract_links");
                    if (dat && dat.results && dat.results.length > 0) {
                        for (const item of dat.results) {
                            if (!allListings.find(x => x.href === item.href)) allListings.push(item);
                        }
                    } else break;

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
                    const item = allListings[currentDetailIndex];

                    await navigateAndWait(tabInfo.tabId, job.pausedUrl || item.href);
                    await updateJobState({ pausedUrl: null });
                    await sleep(2000);

                    const details = await executeContentScript(tabInfo.tabId, "extract_details");
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

                if (kwResults.length > 0 && !job.uploadedBatch) {
                    await enqueueUpload({ source: "tenderdetail", keyword, tenders: kwResults });
                    allMatchesCount += kwResults.length;
                    await updateJobState({ uploadedBatch: true, resultsCollected: allMatchesCount });
                }
            }

            await updateJobState({ phase: 'search', currentPage: 1, allListings: [], kwResults: [], currentDetailIndex: 0, resultsCollected: allMatchesCount, uploadedBatch: false });
        }
        await finishJob(allMatchesCount);
    } finally {
        await closeJobTab(tabInfo.tabId);
        await updateJobState({ tabId: null, windowId: null });
    }
}
