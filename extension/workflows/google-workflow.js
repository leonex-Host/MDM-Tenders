import { updateRuntimeState, setManualActionRequired, finishJob, enqueueUpload } from '../core/job-manager.js';
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

export async function runGoogleWorkflow(runtime) {
    const keywords = runtime.keywords || [];
    let allMap = new Map((runtime.allResultsPhase1 || []).map(r => [canonicalUrl(r.href), r]));
    let filtered = runtime.kwResults || [];

    let tabInfo = { tabId: runtime.tabId, windowId: runtime.windowId };
    if (!runtime.tabId || !runtime.windowId) {
        tabInfo = await createJobTab(runtime);
        await updateRuntimeState(runtime.jobId, { tabId: tabInfo.tabId, windowId: tabInfo.windowId });
        runtime.tabId = tabInfo.tabId;
        runtime.windowId = tabInfo.windowId;
    }

    try {
        let phase = runtime.phase || 'search';
        let challengePaused = false;

        try {
            // Phase 1: Search URLs
            if (phase === 'search') {
                let kwIndex = runtime.currentKeywordIndex || 0;
                let page = runtime.currentPage || 0;

                for (; kwIndex < keywords.length; kwIndex++) {
                    const keyword = keywords[kwIndex];
                    await updateRuntimeState(runtime.jobId, { currentKeywordIndex: kwIndex, keyword });

                    for (; page < 7; page++) {
                        await updateRuntimeState(runtime.jobId, { currentPage: page });

                        let didNavigate = false;
                        if (runtime.pausedUrl) {
                            const tabData = await chrome.tabs.get(runtime.tabId).catch(() => ({}));
                            if (tabData.url && !tabData.url.includes("/sorry/")) {
                                console.log(`[Google][${runtime.jobId}] Solved manually via natural redirect.`);
                            } else {
                                await navigateAndWait(runtime.tabId, runtime.pausedUrl);
                                didNavigate = true;
                            }
                            await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                        } else {
                            await navigateAndWait(runtime.tabId, googleSearchUrl(keyword, page));
                            didNavigate = true;
                        }

                        if (!didNavigate) await new Promise(r => setTimeout(r, 2000));

                        if (await checkChallenge(runtime.tabId)) {
                            const u = (await chrome.tabs.get(runtime.tabId)).url;
                            await setManualActionRequired(runtime.jobId, "Google Captcha Detected", u);
                            throw new Error("CHALLENGE_PAUSED");
                        }

                        const tabData = await chrome.tabs.get(runtime.tabId);
                        if (tabData.url && tabData.url.toLowerCase().includes("/sorry/")) {
                            await setManualActionRequired(runtime.jobId, "Google Captcha Detected", tabData.url);
                            throw new Error("CHALLENGE_PAUSED");
                        }

                        const data = await executeContentScript(runtime.tabId, "extract_listings");
                        const listings = Array.isArray(data) ? data : (data?.listings || []);

                        for (const item of listings) {
                            if (!item.href) continue;
                            const key = canonicalUrl(item.href);
                            if (!allMap.has(key)) {
                                allMap.set(key, { ...item, keyword, search_keyword: keyword, google_page: page + 1, result_type: "all" });
                            }
                        }
                        await updateRuntimeState(runtime.jobId, { allResultsPhase1: [...allMap.values()] });
                    }
                    page = 0; // reset page array for next keyword
                }

                const allResults = [...allMap.values()];
                if (allResults.length > 0 && !runtime.phase1Uploaded) {
                    await enqueueUpload(runtime.jobId, { source: "google", keyword: "ALL", result_type: "all", results: allResults, tenders: allResults });
                    await updateRuntimeState(runtime.jobId, { phase1Uploaded: true });
                }

                await updateRuntimeState(runtime.jobId, { phase: 'details', currentDetailIndex: 0, kwResults: [] });
                phase = 'details';
            }

            // Phase 2: Details URLs
            if (phase === 'details') {
                const allResults = [...allMap.values()];
                let currentDetailIndex = runtime.currentDetailIndex || 0;

                for (; currentDetailIndex < allResults.length; currentDetailIndex++) {
                    await updateRuntimeState(runtime.jobId, { currentDetailIndex, kwResults: filtered });
                    const item = allResults[currentDetailIndex];

                    let targetUrl = item.href;
                    let skipNav = false;
                    if (runtime.pausedUrl) {
                        const tabData = await chrome.tabs.get(runtime.tabId).catch(() => ({}));
                        if (tabData.url && !tabData.url.includes("/sorry/")) skipNav = true;
                        else targetUrl = runtime.pausedUrl;
                        await updateRuntimeState(runtime.jobId, { pausedUrl: null });
                    }

                    if (!skipNav) await navigateAndWait(runtime.tabId, targetUrl, 120000);

                    const detail = await executeContentScript(runtime.tabId, "extract_details", { keyword: item.keyword });
                    if (detail?.found) {
                        filtered.push({ ...item, ...detail, result_type: "filtered" });
                    }
                }

                if (filtered.length > 0 && !runtime.phase2Uploaded) {
                    await enqueueUpload(runtime.jobId, { source: "google", keyword: "ALL", result_type: "filtered", results: filtered, tenders: filtered });
                    await updateRuntimeState(runtime.jobId, { phase2Uploaded: true });
                }
                await finishJob(runtime.jobId, filtered.length, { total_all: allResults.length, total_filtered: filtered.length });
            }

        } catch (e) {
            if (e && e.message === "CHALLENGE_PAUSED") challengePaused = true;
            throw e;
        } finally {
            if (!challengePaused) {
                await closeJobTab(runtime.tabId);
                await updateRuntimeState(runtime.jobId, { tabId: null, windowId: null });
            }
        }
    } catch (outer) {
        throw outer;
    }
}
