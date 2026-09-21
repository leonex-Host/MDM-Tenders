import { updateJobState, setManualActionRequired, finishJob, enqueueUpload } from '../core/job-manager.js';
import { createJobTab, navigateAndWait, executeContentScript, closeJobTab, waitForComplete } from '../core/tab-manager.js';

function googleSearchUrl(keyword, page) {
    let query = String(keyword || "").trim();
    if (!query) query = "tenders";
    else if (/^"[^"].*"\s+tenders$/i.test(query)) query = query;
    else if (/^".*"$/s.test(query)) query = `${query} tenders`;
    else query = `"${query}" tenders`;
    return `https://www.google.com/search?q=${encodeURIComponent(query)}&start=${page * 10}&num=10`;
}

function canonicalUrl(value) {
    try { const u = new URL(value); u.hash = ""; return u.toString().replace(/\/$/, ""); }
    catch (_) { return String(value || "").trim(); }
}

async function checkChallenge(tabId) {
    const list = await executeContentScript(tabId, "extract_listings");
    if (list?.status === "cloudflare") return true;
    return false;
}

export async function runGoogleWorkflow(job) {
    const keywords = job.keywords || [];
    let allMap = new Map((job.allResultsPhase1 || []).map(r => [canonicalUrl(r.href), r]));
    let filtered = job.kwResults || [];

    let tabInfo = { tabId: job.tabId, windowId: job.windowId };
    if (!job.tabId || !job.windowId) {
        tabInfo = await createJobTab(job);
        await updateJobState({ tabId: tabInfo.tabId, windowId: tabInfo.windowId });
    }

    try {
        let phase = job.phase || 'search';
        let challengePaused = false;

        try {
            // Phase 1: Search URLs
            if (phase === 'search') {
                let kwIndex = job.currentKeywordIndex || 0;
                let page = job.currentPage || 0;

                for (; kwIndex < keywords.length; kwIndex++) {
                    const keyword = keywords[kwIndex];
                    await updateJobState({ currentKeywordIndex: kwIndex, keyword });

                    for (; page < 7; page++) {
                        await updateJobState({ currentPage: page });

                        let url = job.pausedUrl || googleSearchUrl(keyword, page);
                        await navigateAndWait(tabInfo.tabId, url);
                        await updateJobState({ pausedUrl: null });

                        if (await checkChallenge(tabInfo.tabId)) {
                            const u = (await chrome.tabs.get(tabInfo.tabId)).url;
                            await setManualActionRequired("Google Captcha Detected", u);
                            throw new Error("CHALLENGE_PAUSED");
                        }

                        const tabData = await chrome.tabs.get(tabInfo.tabId);
                        if (tabData.url && tabData.url.toLowerCase().includes("/sorry/")) {
                            await setManualActionRequired("Google Captcha Detected", tabData.url);
                            throw new Error("CHALLENGE_PAUSED");
                        }

                        const data = await executeContentScript(tabInfo.tabId, "extract_listings");
                        const listings = Array.isArray(data) ? data : (data?.listings || []);

                        for (const item of listings) {
                            if (!item.href) continue;
                            const key = canonicalUrl(item.href);
                            if (!allMap.has(key)) {
                                allMap.set(key, { ...item, keyword, search_keyword: keyword, google_page: page + 1, result_type: "all" });
                            }
                        }
                        await updateJobState({ allResultsPhase1: [...allMap.values()] });
                    }
                    page = 0; // reset page array for next keyword
                }

                const allResults = [...allMap.values()];
                if (allResults.length > 0 && !job.phase1Uploaded) {
                    await enqueueUpload({ source: "google", keyword: "ALL", result_type: "all", results: allResults, tenders: allResults });
                    await updateJobState({ phase1Uploaded: true });
                }

                await updateJobState({ phase: 'details', currentDetailIndex: 0, kwResults: [] });
                phase = 'details';
            }

            // Phase 2: Details URLs
            if (phase === 'details') {
                const allResults = [...allMap.values()];
                let currentDetailIndex = job.currentDetailIndex || 0;

                for (; currentDetailIndex < allResults.length; currentDetailIndex++) {
                    await updateJobState({ currentDetailIndex, kwResults: filtered });
                    const item = allResults[currentDetailIndex];

                    let targetUrl = item.href;
                    if (job.pausedUrl) { targetUrl = job.pausedUrl; await updateJobState({ pausedUrl: null }); }

                    await navigateAndWait(tabInfo.tabId, targetUrl, 120000);

                    const detail = await executeContentScript(tabInfo.tabId, "extract_details", { keyword: item.keyword });
                    if (detail?.found) {
                        filtered.push({ ...item, ...detail, result_type: "filtered" });
                    }
                }

                if (filtered.length > 0 && !job.phase2Uploaded) {
                    await enqueueUpload({ source: "google", keyword: "ALL", result_type: "filtered", results: filtered, tenders: filtered });
                    await updateJobState({ phase2Uploaded: true });
                }
                await finishJob(filtered.length, { total_all: allResults.length, total_filtered: filtered.length });
            }

        } catch (e) {
            if (e && e.message === "CHALLENGE_PAUSED") challengePaused = true;
            throw e;
        } finally {
            if (!challengePaused) {
                await closeJobTab(tabInfo.tabId);
                await updateJobState({ tabId: null, windowId: null });
            }
        }
    } catch (outer) {
        throw outer;
    }
}
