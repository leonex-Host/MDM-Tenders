/**
 * TenderOnTime Content Script — Exact parity with tenderontime_scraper.py
 * 
 * Python flow:
 * 1. Navigate to https://www.tendersontime.com/tenders/advanceSearch?q={keyword}
 * 2. Click button.search-btn[onclick*='filterTendersJS'] to trigger filter
 * 3. Phase 1: Collect metadata from div.listingbox items across pages
 *    - Extract: a.truncatetext title/link, div.deadline strong deadline, TOT Ref regex, country from flag-icon
 *    - Pagination via li.nextclass a (preferred) or visible "Next" text links
 * 4. Phase 2: Visit each link (handled by background.js fetch)
 *    - Check strong.strval in "Summary:" parent for keyword match
 *    - Extract posting date from "Posting Date:" parent
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extract_listings") {
        extractListings(request.keyword).then(sendResponse);
        return true;
    }
    else if (request.action === "extract_details") {
        extractDetails(request.keyword, request.htmlString, request.finalUrl).then(sendResponse);
        return true;
    }
    else if (request.action === "click_next_page") {
        clickNextPage(request.currentPage).then(sendResponse);
        return true;
    }
});

// ─── Phase 1: Click filter + Collect listing metadata ───
async function extractListings(keyword) {
    if (document.title.includes("Just a moment") ||
        (document.body && document.body.innerHTML && document.body.innerHTML.includes("cf-turnstile")) ||
        (document.body && document.body.innerText && document.body.innerText.includes("Cloudflare"))) {
        return { status: "cloudflare" };
    }

    // Step 1: Click filter button if not already done
    // matches: filter_btn = self.page.locator("button.search-btn[onclick*='filterTendersJS']")
    const hasFiltered = sessionStorage.getItem("tot_filtered");
    if (!hasFiltered) {
        const filterBtn = document.querySelector("button.search-btn[onclick*='filterTendersJS']");
        if (filterBtn && isVisible(filterBtn)) {
            sessionStorage.setItem("tot_filtered", "1");
            filterBtn.click();
            await sleep(3000);
            return null; // Force background to poll again after filter applied
        }
    }

    let listings = [];

    // matches: items = self._find_tender_items()  → div.listingbox, div.tender-item
    const items = document.querySelectorAll("div.listingbox, div.tender-item");

    for (const item of items) {
        try {
            let title = "", href = "", deadline = "", tot_ref = "", country = "";

            // matches: link_el = item.locator("a.truncatetext.ng-binding") or a.truncatetext
            const linkEl = item.querySelector("a.truncatetext");
            if (linkEl) {
                title = (linkEl.innerText || "").trim();
                href = linkEl.href || linkEl.getAttribute("href") || "";
                if (href && !href.startsWith("http")) {
                    href = new URL(href, window.location.origin).href;
                }
            }

            // Fallback: a.listing-prod-view.mobbtn for href
            if (!href) {
                const altLink = item.querySelector("a.listing-prod-view.mobbtn");
                if (altLink) href = altLink.href || altLink.getAttribute("href") || "";
            }

            // matches: deadline_el = item.locator("div.deadline strong.ng-binding") or "div.deadline strong"
            const deadlineEl = item.querySelector("div.deadline strong");
            if (deadlineEl) deadline = (deadlineEl.innerText || "").trim();

            // matches: TOT Ref regex
            const itemText = item.innerText || "";
            const refMatch = itemText.match(/TOT Ref\. No\.?:?\s*(\d+)/);
            if (refMatch) tot_ref = refMatch[1];

            // matches: country from span.flag-icon parent strong
            const flag = item.querySelector("span.flag-icon");
            if (flag && flag.parentElement) {
                const strong = flag.parentElement.querySelector("strong");
                if (strong) country = (strong.innerText || "").trim();
            }

            if (href && !listings.find(x => x.href === href)) {
                listings.push({ title, href, deadline, tot_ref, country });
            }
        } catch (e) { }
    }

    return listings;
}

// ─── Pagination (matches _next_page) ───
async function clickNextPage(currentPage = 1) {
    try {
        const nextString = (currentPage + 1).toString();

        // matches: next_btn = self.page.locator("li.nextclass a") — PREFERRED
        const nextClassLink = document.querySelector("li.nextclass a");
        if (nextClassLink && isVisible(nextClassLink)) {
            nextClassLink.click();

            // Clear DOM to force orchestrator wait
            const items = document.querySelectorAll("div.listingbox, div.tender-item");
            items.forEach(c => c.remove());

            return true;
        }

        // Fallback: visible "Next" text links (matches Python fallback)
        const allLinks = document.querySelectorAll("a, button");
        for (const el of allLinks) {
            if (!isVisible(el)) continue;
            const txt = (el.innerText || "").trim();
            if (txt.includes("Next") || txt.includes(">>") || txt === nextString) {
                el.click();

                const items = document.querySelectorAll("div.listingbox, div.tender-item");
                items.forEach(c => c.remove());

                return true;
            }
        }
    } catch (e) { }
    return false;
}

// ─── Phase 2: Check detail page (matches _visit_and_check_summary + _check_summary) ───
async function extractDetails(keyword, htmlString = null, finalUrl = null) {
    let root = document;
    let b = document.body;

    if (htmlString) {
        const parser = new DOMParser();
        root = parser.parseFromString(htmlString, 'text/html');
        root.querySelectorAll("script, style, noscript, svg").forEach(el => el.remove());
        b = root.body;
    }

    const rawText = (b.innerText || b.textContent || "");
    const phrase = keyword.toLowerCase().trim();

    let found = false;
    let descriptionSnippet = "";
    let postingDate = "";

    // matches: summaries = self.page.locator("strong.strval").all()
    const strvals = root.querySelectorAll("strong.strval");

    // Check for keyword in Summary section
    // matches: if parent.count() > 0 and "Summary:" in parent.first.inner_text():
    for (const s of strvals) {
        try {
            const par = s.parentElement;
            if (par && (par.innerText || par.textContent || "").includes("Summary:")) {
                const txt = (s.innerText || s.textContent || "").toLowerCase();
                if (txt.includes(phrase)) {
                    found = true;
                    const idx = txt.indexOf(phrase);
                    const fullTxt = s.innerText || s.textContent || "";
                    descriptionSnippet = fullTxt.substring(Math.max(0, idx - 60), idx + phrase.length + 60);
                    break;
                }
            }
        } catch (e) { }
    }

    // Fallback: check any strval (matches Python fallback loop)
    if (!found) {
        for (const s of strvals) {
            try {
                const txt = (s.innerText || s.textContent || "").toLowerCase();
                if (txt.includes(phrase) && txt.length > 20) {
                    found = true;
                    const idx = txt.indexOf(phrase);
                    const fullTxt = s.innerText || s.textContent || "";
                    descriptionSnippet = fullTxt.substring(Math.max(0, idx - 60), idx + phrase.length + 60);
                    break;
                }
            } catch (e) { }
        }
    }

    // Check posting date (matches _get_posting_date)
    for (const s of strvals) {
        try {
            const par = s.parentElement;
            if (par && (par.innerText || par.textContent || "").includes("Posting Date:")) {
                postingDate = (s.innerText || s.textContent || "").trim();
                break;
            }
        } catch (e) { }
    }

    return {
        found,
        description: descriptionSnippet,
        posting_date: postingDate
    };
}

// ─── Helpers ───
function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
