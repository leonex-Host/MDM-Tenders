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
        const pnnext = document.getElementById("pnnext");
        if (pnnext) {
            pnnext.click();
            return true;
        }
        const nextAria = document.querySelector("a[aria-label='Next page']");
        if (nextAria) {
            nextAria.click();
            return true;
        }
    } catch (e) { }
    return false;
}

async function extractListings() {
    let listings = [];

    const blocks = document.querySelectorAll("div.g, div[class*='tF2Cxc']");
    blocks.forEach(block => {
        try {
            const h3 = block.querySelector("h3");
            if (!h3 || !h3.innerText.trim()) return;

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
            if (descEl) desc = descEl.innerText.trim();

            if (!listings.find(x => x.href === href)) {
                listings.push({
                    title: h3.innerText.trim(),
                    href: href,
                    description: desc
                });
            }
        } catch (e) { }
    });

    return listings;
}

async function extractDetails(keyword) {
    const rawText = document.body.innerText;
    const phrase = keyword.toLowerCase().trim();

    if (!rawText.toLowerCase().includes(phrase)) {
        return { found: false };
    }

    const idx = rawText.toLowerCase().indexOf(phrase);
    const start = Math.max(0, idx - 100);
    const end = Math.min(rawText.length, idx + phrase.length + 100);
    const excerpt = rawText.substring(start, end).replace(/\n/g, ' ');

    let title = "";
    if (document.title) title = document.title;

    return {
        found: true,
        title: title,
        description: excerpt,
        tender_id: window.location.href, // fallback id
        start_date: "",
        end_date: "",
        location: ""
    };
}
