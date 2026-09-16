/**
 * Google Content Script — Extension search result extraction
 * 
 * Flow:
 * 1. Navigate to https://www.google.com/search?q=%22{keyword}%22+tenders
 * 2. Extract div.g search result blocks with h3 title, href, VwiC3b snippet
 * 3. Paginate via #pnnext or aria-label="Next page"
 * 4. Visit each link (via background.js fetch) and check keyword in page text
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extract_listings") {
        extractListings().then(sendResponse);
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

// ─── Extract Google search results ───
async function extractListings() {
    let listings = [];

    const blocks = document.querySelectorAll("div.g, div[class*='tF2Cxc']");
    blocks.forEach(block => {
        try {
            const h3 = block.querySelector("h3");
            if (!h3 || !(h3.innerText || "").trim()) return;

            const linkEl = block.querySelector("a[href]");
            if (!linkEl) return;

            let href = linkEl.href;
            if (href.includes("/url?")) {
                const params = new URLSearchParams(href.split("?")[1]);
                href = params.get("q") || href;
            }
            if (!href || href.includes("/search")) return;

            let desc = "";
            const descEl = block.querySelector("div.VwiC3b, div[data-snf], div[class*='IsZvec']");
            if (descEl) desc = (descEl.innerText || "").trim();

            if (!listings.find(x => x.href === href)) {
                listings.push({
                    title: (h3.innerText || "").trim(),
                    href: href,
                    description: desc
                });
            }
        } catch (e) { }
    });

    return listings;
}

// ─── Pagination: Google uses explicit &start= parameter manipulation ───
async function clickNextPage(currentPage = 1) {
    try {
        const url = new URL(window.location.href);
        // Calculate the next start parameter (10 results per page)
        const nextStart = currentPage * 10;

        url.searchParams.set('start', nextStart);
        window.location.href = url.toString();

        return true;
    } catch (e) { console.error("Google Pagination failed", e); }
    return false;
}

// ─── Detail page extraction (via DOMParser from background fetch) ───
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

    if (!rawText.toLowerCase().includes(phrase)) {
        return { found: false };
    }

    const idx = rawText.toLowerCase().indexOf(phrase);
    const start = Math.max(0, idx - 100);
    const end = Math.min(rawText.length, idx + phrase.length + 100);
    const excerpt = rawText.substring(start, end).replace(/\n/g, ' ');

    let title = root.title || "";

    return {
        found: true,
        title: title,
        description: excerpt,
        tender_id: finalUrl || window.location.href,
        start_date: "",
        end_date: "",
        location: ""
    };
}
