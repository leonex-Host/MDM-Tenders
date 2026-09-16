chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extract_listings") {
        extractListings().then(sendResponse);
        return true;
    }
    else if (request.action === "extract_details") {
        extractDetails(request.keyword).then(sendResponse);
        return true;
    }
    else if (request.action === "click_next_page") {
        clickNextPage(request.currentPage).then(sendResponse);
        return true;
    }
});

async function clickNextPage(currentPage = 1) {
    try {
        const nextLinks = document.querySelectorAll("a, .pagination a, button.next");
        const nextString = (currentPage + 1).toString();
        for (const link of nextLinks) {
            const isVisible = !!(link.offsetWidth || link.offsetHeight || link.getClientRects().length);
            if (isVisible) {
                const txt = link.innerText.trim();
                if (txt.includes("Next") || txt.includes(">>") || txt === nextString) {
                    link.click();

                    const rows = document.querySelectorAll("div.tender_row, div.tender-item, .tender-row");
                    rows.forEach(r => r.remove());

                    return true;
                }
            }
        }
    } catch (e) { }
    return false;
}

async function extractListings() {
    let listings = [];

    // TenderDetail listings
    const hasFiltered = sessionStorage.getItem("td_filtered");
    if (!hasFiltered) {
        const drpDD = document.getElementById("drpDD");
        if (drpDD) {
            drpDD.click();
            await new Promise(r => setTimeout(r, 1000));
            const options = document.querySelectorAll("a, li, span, div");
            for (const opt of options) {
                if (opt.innerText.includes("Next 15 Days") || opt.innerText === "15 Days") {
                    opt.click();
                    break;
                }
            }
            await new Promise(r => setTimeout(r, 1000));

            const searchBtn = document.getElementById("btnFilterTender") || document.querySelector("input[value='SEARCH']");
            if (searchBtn) {
                sessionStorage.setItem("td_filtered", "true");
                searchBtn.click();
                return null; // Force reload
            }
        }
    }

    const rows = document.querySelectorAll("div.tender_row, div.tender-item, .tender-row");

    // Check if the page is still loading or asks for filter. We will implicitly extract whatever is on screen.
    rows.forEach(row => {
        try {
            let href = "";
            const linkEl = row.querySelector("a.m-brief, a.detail-link, h2 a, a[href*='tender']");
            if (linkEl) href = linkEl.href;

            if (href && !listings.find(x => x.href === href)) {
                listings.push({ href });
            }
        } catch (e) { }
    });

    return listings;
}

async function extractDetails(keyword) {
    const rawText = document.body.innerText;
    const phrase = keyword.toLowerCase().trim();

    let brief = "";

    // Check Tender Brief sections
    const briefEls = document.querySelectorAll(".brief, .tender-brief");
    for (const el of briefEls) {
        if (el.innerText.length > 20) { brief = el.innerText.trim(); break; }
    }

    if (!brief) {
        // label fallback
        const labels = document.querySelectorAll("label, div");
        for (const label of labels) {
            if (label.innerText.trim() === "Tender Brief") {
                if (label.nextElementSibling) brief = label.nextElementSibling.innerText.trim();
                break;
            }
        }
    }
    if (!brief) {
        const h2 = document.querySelector(".tender-brief");
        if (h2) brief = h2.innerText;
    }

    let found = false;
    if (brief.toLowerCase().includes(phrase)) {
        found = true;
    } else {
        return { found: false };
    }

    let title = "";
    const titleEl = document.querySelector("h2.workDesc strong, h1, h2, .tender-title");
    if (titleEl) title = titleEl.innerText.trim();

    let tender_id = window.location.href.split('/').pop().split('?')[0];

    // Extraction matches
    let start_date = "";
    const stMatch = rawText.match(/(?:Start|Publish|Publication) Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
    if (stMatch) start_date = stMatch[1];

    let end_date = ""; // not easily separated without the row context, fallback empty.

    let location = "";
    const locMatch = rawText.match(/Location[:\s]*([^,\n]+(?:,\s*[^,\n]+)*)/i);
    if (locMatch) location = locMatch[1];

    return {
        found: true,
        title: title || brief.substring(0, 250),
        description: brief || title,
        tender_id: tender_id,
        start_date: start_date,
        end_date: end_date,
        location: location
    };
}
