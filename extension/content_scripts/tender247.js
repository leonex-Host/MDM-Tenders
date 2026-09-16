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

async function clickNextPage(currentPage = 1) {
    try {
        const nextLinks = document.querySelectorAll("a.NextPage, a[title='Next'], .pagination a, button.next");
        const nextString = (currentPage + 1).toString();
        for (const link of nextLinks) {
            const isVisible = !!(link.offsetWidth || link.offsetHeight || link.getClientRects().length);
            if (isVisible) {
                const txt = link.innerText.trim();
                if (txt.includes("Next") || txt.includes(">>") || link.className.includes("NextPage") || txt === nextString) {
                    link.click();

                    const links = document.querySelectorAll("a[href*='/tender-details/']");
                    links.forEach(l => l.remove());

                    return true;
                }
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

async function extractDetails(keyword, htmlString = null, finalUrl = null) {
    let root = document;
    let b = document.body;

    if (htmlString) {
        const parser = new DOMParser();
        root = parser.parseFromString(htmlString, 'text/html');
        // Delete all script and style tags to make textContent safe
        root.querySelectorAll("script, style, noscript, svg").forEach(el => el.remove());
        b = root.body;
    }

    const rawText = b.innerText || b.textContent;
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
        const caps = root.querySelectorAll(".capitalize");
        for (const el of caps) {
            const txt = el.innerText || el.textContent;
            if (txt && txt.length > 30) { brief = txt.trim(); break; }
        }
    }

    // Fallback tables
    if (!brief) {
        const tds = root.querySelectorAll("td, div");
        for (const td of tds) {
            const txt = td.innerText || td.textContent || "";
            if (txt.includes("Tender Brief") || txt.includes("Tender Description") || txt.includes("Work Description")) {
                let nextEl = td.nextElementSibling;
                if (nextEl) {
                    brief = (nextEl.innerText || nextEl.textContent || "").trim();
                    break;
                }
            }
        }
    }

    if (!brief) {
        const caps = root.querySelector(".workDesc");
        if (caps) brief = caps.innerText || caps.textContent || "";
    }

    let found = false;
    if (brief.toLowerCase().includes(phrase)) {
        found = true;
    } else {
        return { found: false };
    }

    let title = "";
    const h1 = root.querySelector("h1");
    if (h1) title = h1.innerText || h1.textContent;
    if (title) title = title.trim();

    // Ex: T247 ID : 12345
    let tender_id = "";
    const idMatch = rawText.match(/T247\s*ID\s*[:\-]?\s*(\S+)/i);
    if (idMatch) tender_id = idMatch[1];
    else tender_id = finalUrl || window.location.href.split('/').pop().split('?')[0];

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
