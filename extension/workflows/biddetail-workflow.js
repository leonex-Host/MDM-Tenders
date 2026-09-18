import { updateJobState, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab } from '../core/tab-manager.js';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

export async function runBidDetailWorkflow(job) {
    let kwIndex = job.currentKeywordIndex || 0;
    const keywords = job.keywords || [];
    const maxPages = 10;
    let allMatchesCount = job.resultsCollected || 0;
    let tabInfo = { tabId: job.tabId, windowId: job.windowId };

    console.log(`[BidDetailTrace] source detected: ${job.source || 'undefined'}`);
    console.log(`[BidDetailTrace] job ID: ${job.job_id || 'undefined'}`);
    console.log(`[BidDetailTrace] job status: ${job.status || 'undefined'}`);
    console.log(`[BidDetailTrace] selected job:`, job);

    if (!job.tabId || !job.windowId) {
        tabInfo = await createJobTab(job);
        await updateJobState({ tabId: tabInfo.tabId, windowId: tabInfo.windowId });
    }

    try {
        for (; kwIndex < keywords.length; kwIndex++) {
            const keyword = keywords[kwIndex];
            const fmtKw = encodeURIComponent(`"${keyword}"`);
            const searchUrl = `https://www.biddetail.com/global-tenders/${fmtKw}-tenders`;

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
                    if (details) {
                        const brief = details.brief || item.description || "";
                        const combinedCheck = (brief + " " + JSON.stringify(details.meta)).toLowerCase();
                        console.log(`[BidDetailTrace] extracted detail URL: ${item.href}`);

                        if (combinedCheck.includes(phrase)) {
                            kwResults.push({
                                source: "biddetail",
                                tender_id: item.bdr_no || (item.href.split("/").pop()),
                                title: (item.description || item.organization).substring(0, 547),
                                description: brief,
                                location: item.location,
                                start_date: details.meta && (details.meta["Opening Date"] || details.meta["Start Date"] || ""),
                                end_date: item.deadline,
                                link: item.href,
                                keyword
                            });
                        }
                    }
                }

                if (kwResults.length > 0 && !job.uploadedBatch) {
                    await enqueueUpload({ source: "biddetail", keyword, tenders: kwResults });
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
