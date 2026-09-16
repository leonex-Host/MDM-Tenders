chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extract_listings") {
        extractListings(request.keyword).then(sendResponse);
        return true;
    }
    else if (request.action === "extract_details") {
        extractDetails(request.keyword).then(sendResponse);
        return true;
    }
});

async function extractListings(keyword) {
    if (!keyword) return null;

    // 1. Ensure we have searched
    const state = sessionStorage.getItem("gem_searched");
    if (state !== keyword) {
        const input = document.getElementById("searchBid");
        const btn = document.getElementById("searchBidRA");

        if (input && btn) {
            input.value = keyword;
            btn.click();
            sessionStorage.setItem("gem_searched", keyword);
            // Must return null to tell background script "keep polling, I just clicked Search"
            return null;
        }
        return null; // Interface not loaded yet
    }

    // 2. Ensure Sorting is applied
    const sortBtn = document.getElementById("currentSort");
    if (sortBtn && !sortBtn.innerText.includes("Bid Start Date: Latest First")) {
        const _sorted = sessionStorage.getItem("gem_sorted");
        if (_sorted !== keyword) {
            sortBtn.click();
            setTimeout(() => {
                const latestSort = document.getElementById("Bid-Start-Date-Latest");
                if (latestSort) latestSort.click();
                sessionStorage.setItem("gem_sorted", keyword);
            }, 500);
            return null; // Give DOM time to reload list
        }
    }

    let listings = [];

    // GEM Extract Listings
    const cards = document.querySelectorAll("div.card");
    if (cards.length === 0) return null; // keep waiting for cards to load

    cards.forEach(card => {
        try {
            const link = card.querySelector("a.bid_no_hover");
            if (link) {
                const bidNo = link.innerText.trim();
                const titleLink = card.querySelector("a[data-toggle='popover']");
                const itemsText = titleLink ? (titleLink.getAttribute("data-content") || titleLink.innerText.trim()) : "";

                // Purely evaluate locally here in the listing stage (skip detail extraction if possible!) is more efficient, but we will pass it back for background script.
                // Actually, background script expects `href`. The bidNo dictates the href.
                if (itemsText.toLowerCase().includes(keyword.toLowerCase())) {
                    const href = `https://bidplus.gem.gov.in/bidlists?bid_no=${bidNo}`;
                    if (!listings.find(x => x.href === href)) {
                        listings.push({ href });
                    }
                }
            }
        } catch (e) { }
    });

    return listings;
}

async function extractDetails(keyword) {
    // GEM actually contains EVERYTHING on the listing card via popovers usually!
    // But since background.js navigates to the detail URL, we just scrape the detail page.

    const phrase = keyword.toLowerCase().trim();
    const rawText = document.body.innerText;

    const bidNoMatch = window.location.href.match(/bid_no=([^&]+)/);
    const tender_id = bidNoMatch ? bidNoMatch[1] : "";

    let description = document.body.innerText.substring(0, 500);

    // Check keyword
    if (!rawText.toLowerCase().includes(phrase)) {
        return { found: false };
    }

    let title = "";
    const p1 = document.querySelector(".p-1 h4, h1");
    if (p1) title = p1.innerText.trim();

    // Date extraction
    let start_date = "";
    const stMatch = rawText.match(/Start\s*Date[:\s]*([\d\-]+ \d+:\d+ [APM]+)/i);
    if (stMatch) start_date = stMatch[1];

    let end_date = "";
    const endMatch = rawText.match(/End\s*Date[:\s]*([\d\-]+ \d+:\d+ [APM]+)/i);
    if (endMatch) end_date = endMatch[1];

    let location = "";

    return {
        found: true,
        title: title || description.substring(0, 250),
        description: description,
        tender_id: tender_id,
        start_date: start_date,
        end_date: end_date,
        location: location
    };
}
