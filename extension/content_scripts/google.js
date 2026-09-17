chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "check_page_available") {
        sendResponse(checkPageAvailable());
        return true;
    }
    else if (request.action === "extract_listings") {
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

function checkPageAvailable() {
    const title = document.title || "";
    const html = (document.body && document.body.innerHTML) ? document.body.innerHTML : "";
    const text = (document.body && document.body.innerText) ? document.body.innerText : "";

    const cloudflareActive = title.includes("Just a moment") ||
        text.includes("Verify you are human") ||
        html.includes("g-recaptcha") ||
        text.includes("Our systems have detected unusual traffic");

    const hasNoResultsText = text.includes("did not match any documents") || text.includes("No results found");

    return {
        success: true,
        pageAvailable: true,
        readyState: document.readyState,
        title,
        url: window.location.href,
        cloudflareActive,
        hasNoResultsText
    };
}

async function extractListings() {
    if (document.title.includes("Just a moment") ||
        (document.body && document.body.innerText && document.body.innerText.includes("Our systems have detected unusual traffic"))) {
        return { status: "cloudflare" };
    }

    let listings = [];
    const items = document.querySelectorAll("div.g, div.xpd");

    items.forEach(item => {
        try {
            const linkEl = item.querySelector("a");
            const titleEl = item.querySelector("h3");
            const snippetEl = item.querySelector("div[style*='-webkit-line-clamp'], .VwiC3b, .st");

            if (linkEl && titleEl) {
                const title = titleEl.innerText.trim();
                const href = linkEl.href;
                const snippet = snippetEl ? snippetEl.innerText.trim() : "";

                if (href && !href.includes("google.com/search") && !listings.find(x => x.href === href)) {
                    listings.push({ title, href, summary: snippet });
                }
            }
        } catch (e) { }
    });

    return listings;
}

function getListingSignature() {
    const items = document.querySelectorAll("div.g h3");
    const titles = [...items].map(h => h.innerText.trim()).slice(0, 5);
    return `${items.length}|${titles.join("|")}`;
}

function getCurrentPageNumber() {
    const active = document.querySelector("td.YyVfkd, span.YyVfkd");
    return active ? active.innerText.trim() : null;
}

async function clickNextPage() {
    const btn = document.querySelector("a#pnnext");

    if (!btn) {
        return { clicked: false, changed: false, reason: "next_button_not_found" };
    }

    const beforeSignature = getListingSignature();

    btn.scrollIntoView({ behavior: "instant", block: "center" });
    btn.click();

    let lastSignature = null;
    let stableCount = 0;

    for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));
        const items = document.querySelectorAll("div.g h3");
        if (!items || items.length === 0) continue;

        const currentSignature = getListingSignature();

        if (currentSignature && currentSignature !== beforeSignature) {
            if (currentSignature === lastSignature) {
                stableCount++;
            } else {
                lastSignature = currentSignature;
                stableCount = 1;
            }

            if (stableCount >= 2) {
                return {
                    clicked: true,
                    changed: true,
                    beforeSignature,
                    afterSignature: currentSignature,
                    pageNumber: getCurrentPageNumber()
                };
            }
        }
    }

    return {
        clicked: true,
        changed: false,
        reason: "new_page_did_not_stabilize",
        beforeSignature,
        pageNumber: getCurrentPageNumber()
    };
}

async function extractDetails(keyword) {
    const rawText = document.body.innerText;
    const phrase = keyword.toLowerCase();

    let found = rawText.toLowerCase().includes(phrase);

    return {
        found,
        full_text_sample: rawText.substring(0, 500)
    };
}
