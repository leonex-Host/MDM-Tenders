chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extract_listings") {
        extractListings().then(sendResponse);
        return true;
    }
    else if (request.action === "extract_details") {
        extractDetails(request.keyword).then(sendResponse);
        return true;
    }
});

async function extractListings() {
    let listings = [];

    // BidDetail listings extraction
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
