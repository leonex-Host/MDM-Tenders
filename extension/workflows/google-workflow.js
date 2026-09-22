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

const UNWANTED_DOMAINS = [
    "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "youtu.be",
    "reddit.com", "quora.com", "pinterest.com", "threads.net", "tiktok.com", "t.me", "telegram.me",
    "indeed.com", "glassdoor.com", "naukri.com", "foundit.in", "monster.com", "ziprecruiter.com",
    "simplyhired.com", "careerbuilder.com", "shine.com", "internshala.com", "wellfound.com", "lever.co",
    "greenhouse.io", "workday.com", "github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com",
    "stackexchange.com", "superuser.com", "askubuntu.com", "npmjs.com", "pypi.org", "readthedocs.io",
    "readthedocs.org", "developer.mozilla.org", "developers.google.com", "docs.google.com", "docs.microsoft.com",
    "learn.microsoft.com", "docs.aws.amazon.com", "docs.oracle.com", "medium.com", "substack.com",
    "wordpress.com", "blogspot.com", "blogger.com", "tumblr.com", "reuters.com", "bbc.com", "cnn.com",
    "forbes.com", "ndtv.com", "indiatoday.in", "thehindu.com", "hindustantimes.com", "timesofindia.indiatimes.com",
    "economictimes.indiatimes.com", "moneycontrol.com", "business-standard.com", "researchgate.net",
    "academia.edu", "sciencedirect.com", "springer.com", "springerlink.com", "ieee.org", "acm.org",
    "jstor.org", "semanticscholar.org", "arxiv.org", "amazon.com", "amazon.in", "flipkart.com", "ebay.com",
    "walmart.com", "aliexpress.com", "etsy.com", "justdial.com", "tradeindia.com", "indiamart.com",
    "dropbox.com", "drive.google.com", "onedrive.live.com", "box.com", "scribd.com", "slideshare.net",
    "issuu.com", "google.com", "google.co.in", "bing.com", "yahoo.com", "duckduckgo.com"
];

const UNWANTED_PATHS = [
    "/jobs/", "/job/", "/careers/", "/career/", "/vacancy/", "/vacancies/", "/employment/", "/recruitment/",
    "/blog/", "/blogs/", "/article/", "/articles/", "/news/", "/post/", "/posts/", "/story/", "/stories/",
    "/forum/", "/forums/", "/community/", "/discussion/", "/discussions/", "/questions/", "/answers/",
    "/docs/", "/documentation/", "/wiki/", "/knowledge-base/", "/login", "/signin", "/sign-in", "/signup",
    "/sign-up", "/register", "/search", "/results"
];

function isUnwantedLink(url) {
    try {
        const u = new URL(url);
        const hostname = u.hostname.toLowerCase();
        const pathname = u.pathname.toLowerCase();

        // Check domains (ending with, to handle subdomains like www.linkedin.com)
        if (UNWANTED_DOMAINS.some(domain => hostname === domain || hostname.endsWith("." + domain))) {
            return true;
        }

        // Check paths (exact matches or contains)
        if (UNWANTED_PATHS.some(pth => pathname.includes(pth))) {
            return true;
        }
    } catch (_) { }
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
                        const newFound = [];
                        let localUnwanted = 0;

                        for (const item of listings) {
                            if (!item.href) continue;
                            const key = canonicalUrl(item.href);

                            if (isUnwantedLink(item.href)) {
                                localUnwanted++;
                                if (!allMap.has(key)) {
                                    const payload = { ...item, keyword, search_keyword: keyword, google_page: page + 1, result_type: "unwanted" };
                                    allMap.set(key, payload);
                                    newFound.push(payload);
                                }
                                continue;
                            }

                            if (!allMap.has(key)) {
                                const payload = { ...item, keyword, search_keyword: keyword, google_page: page + 1, result_type: "all" };
                                allMap.set(key, payload);
                                newFound.push(payload);
                            }
                        }

                        const updatedUnwanted = (runtime.unwantedLinks || 0) + localUnwanted;
                        runtime.unwantedLinks = updatedUnwanted; // Sync active memory immediately
                        await updateRuntimeState(runtime.jobId, { allResultsPhase1: [...allMap.values()], resultsCollected: allMap.size, unwantedLinks: updatedUnwanted });

                        if (newFound.length > 0) {
                            await enqueueUpload(runtime.jobId, { source: "google", keyword, result_type: "all", results: newFound, tenders: newFound });
                        }
                    }
                    page = 0; // reset page array for next keyword
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

                    if (item.result_type === "unwanted") continue;

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
                        const payload = { ...item, ...detail, result_type: "filtered" };
                        filtered.push(payload);
                        await enqueueUpload(runtime.jobId, { source: "google", keyword: item.keyword, result_type: "filtered", results: [payload], tenders: [payload] });
                    }
                }

                const finalCount = filtered.length;
                await finishJob(runtime.jobId, finalCount, { total_all: allResults.length, total_filtered: finalCount });
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
