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
        const nextLinks = document.querySelectorAll("a.pagination-next, a.next, a, button.next");
        const nextString = (currentPage + 1).toString();
        for (const link of nextLinks) {
            const isVisible = !!(link.offsetWidth || link.offsetHeight || link.getClientRects().length);
            if (isVisible) {
                const txt = link.innerText.trim();
                if (txt.includes("Next") || txt.includes(">>") || txt === nextString) {
                    link.click();

                    const rows = document.querySelectorAll("div.tender_row, .search-result .tender-item");
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

    // BidDetail listings extraction
    const hasFiltered = sessionStorage.getItem("bd_filtered");
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
                sessionStorage.setItem("bd_filtered", "true");
                searchBtn.click();
                return null; // Force reload
            }
        }
    }

    const rows = document.querySelectorAll("div.tender_row, .search-result .tender-item");

    rows.forEach(row => {
        try {
            let href = "";
            const linkEl = row.querySelector("h2 a, a.m-brief, a.detail-link, a[href*='tender']");
            if (linkEl) href = linkEl.href;

            if (href && !href.startsWith("http")) href = "https://www.biddetail.com" + href;

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

    const briefNodes = document.querySelectorAll("tr td");
    for (let i = 0; i < briefNodes.length; i++) {
        const txt = briefNodes[i].innerText;
        if (txt.includes("Tender Brief")) {
            const next = briefNodes[i].nextElementSibling || (briefNodes[i + 1]);
            if (next && next.innerText.length > 5) {
                brief = next.innerText.trim();
                break;
            }
        }
    }

    let meta_data = {};
    const trs = document.querySelectorAll("table.table-bordered tr");
    trs.forEach(tr => {
        const tds = tr.querySelectorAll("td");
        if (tds.length >= 2) {
            const tempK = tds[0].innerText.replace(":", "").trim();
            const tempV = tds[1].innerText.trim();
            if (tempK && tempV && tempK.length < 50) {
                meta_data[tempK] = tempV;
            }
        }
    });

    const combinedText = (brief + " " + Object.values(meta_data).join(" ")).toLowerCase();

    if (!combinedText.includes(phrase)) {
        return { found: false };
    }

    let title = "";
    const h2 = document.querySelector("h2");
    if (h2) title = h2.innerText.trim();

    let tender_id = window.location.href.split('/').pop().split('?')[0];

    const start_date = meta_data["Opening Date"] || meta_data["Start Date"] || "";
    const end_date = meta_data["Submission Date"] || meta_data["Closing Date"] || "";
    const location = meta_data["Location"] || "";

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
