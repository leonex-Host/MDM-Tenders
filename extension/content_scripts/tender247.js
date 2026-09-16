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
        clickNextPage().then(sendResponse);
        return true;
    }
});

async function clickNextPage() {
    try {
        const nextLinks = document.querySelectorAll("a.NextPage, a[title='Next'], .pagination a");
        for (const link of nextLinks) {
            if (link.innerText.includes("Next") || link.innerText.includes(">>") || link.className.includes("NextPage")) {
                link.click();
                return true;
            }
        }
    } catch (e) { }
    return false;
}

async function extractListings() {
    if (document.title.includes("Just a moment") || document.body.innerText.includes("Cloudflare")) {
        return { status: "cloudflare" };
    }

    let listings = [];

    // Tender247 listings are identified by tender-details hrefs
    const links = document.querySelectorAll("a[href*='/tender-details/']");
    links.forEach(link => {
        try {
            const href = link.href;
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

    // STRICT Keyword match in the brief
    let brief = "";

    // Try meta
    const meta = document.querySelector("meta[name='description']");
    if (meta && meta.content.length > 30) {
        brief = meta.content.replace("Tender for", "").trim();
    }

    // Try .capitalize
    if (!brief) {
        const caps = document.querySelectorAll(".capitalize");
        for (const el of caps) {
            if (el.innerText.length > 30) { brief = el.innerText.trim(); break; }
        }
    }

    // Fallback tables
    if (!brief) {
        const tds = document.querySelectorAll("td, div");
        for (const td of tds) {
            if (td.innerText.includes("Tender Brief") || td.innerText.includes("Tender Description") || td.innerText.includes("Work Description")) {
                let nextEl = td.nextElementSibling;
                if (nextEl) {
                    brief = nextEl.innerText.trim();
                    break;
                }
            }
        }
    }

    if (!brief) {
        const caps = document.querySelector(".workDesc");
        if (caps) brief = caps.innerText;
    }

    let found = false;
    if (brief.toLowerCase().includes(phrase)) {
        found = true;
    } else {
        return { found: false };
    }

    let title = "";
    const h1 = document.querySelector("h1");
    if (h1) title = h1.innerText.trim();

    // Ex: T247 ID : 12345
    let tender_id = "";
    const idMatch = rawText.match(/T247\s*ID\s*[:\-]?\s*(\S+)/i);
    if (idMatch) tender_id = idMatch[1];
    else tender_id = window.location.href.split('/').pop().split('?')[0];

    // Dates
    let start_date = "";
    const stMatch = rawText.match(/(?:Opening|Publish(?:ed)?)\s*Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
    if (stMatch) start_date = stMatch[1];

    let end_date = "";
    const endMatch = rawText.match(/(?:Submission|Last|Closing|Due)\s*Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
    if (endMatch) end_date = endMatch[1];

    let location = "";
    const locMatch = rawText.match(/([^,\n]+,\s*[^,\n]+,\s*India)/i);
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
