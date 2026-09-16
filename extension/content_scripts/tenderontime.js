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
        const nextLinks = document.querySelectorAll("a, li a, .pagination a, button.next");
        const nextString = (currentPage + 1).toString();
        for (const link of nextLinks) {
            const isVisible = !!(link.offsetWidth || link.offsetHeight || link.getClientRects().length);
            if (isVisible) {
                const txt = link.innerText.trim();
                if (txt.includes("Next") || txt.includes(">>") || txt === nextString) {
                    link.click();

                    // Clear the DOM to align with AJAX block loops
                    const items = document.querySelectorAll("div.listingbox, div.tender-item");
                    items.forEach(c => c.remove());

                    return true;
                }
            }
        }
    } catch (e) { }
    return false;
}

async function extractListings() {
    if (document.title.includes("Just a moment") ||
        (document.body && document.body.innerHTML && document.body.innerHTML.includes("cf-turnstile")) ||
        (document.body && document.body.innerText && document.body.innerText.includes("Cloudflare"))) {
        return { status: "cloudflare" };
    }

    let listings = [];

    // Attempt clicking the filter button if we are on the initial search page redirect
    const hasFiltered = sessionStorage.getItem("tot_filtered");
    if (!hasFiltered) {
        const filterBtn = document.querySelector("button.search-btn[onclick*='filterTendersJS']");
        if (filterBtn && filterBtn.offsetParent !== null) { // is visible
            sessionStorage.setItem("tot_filtered", keyword);
            filterBtn.click();
            await new Promise(r => setTimeout(r, 2000)); // wait for ajax reload
            return null; // Force background to poll again
        }
    }

    const items = document.querySelectorAll("div.listingbox, div.tender-item");

    items.forEach(item => {
        try {
            let title = "", href = "", deadline = "", tot_ref = "", country = "";

            const linkEl = item.querySelector("a.truncatetext");
            if (linkEl) {
                title = linkEl.innerText.trim();
                href = Object.assign(document.createElement('a'), { href: linkEl.getAttribute('href') }).href;
            }

            const deadlineEl = item.querySelector("div.deadline strong");
            if (deadlineEl) deadline = deadlineEl.innerText.trim();

            const textMatch = item.innerText.match(/TOT Ref\. No\.?:?\s*(\d+)/);
            if (textMatch) tot_ref = textMatch[1];

            const flag = item.querySelector("span.flag-icon");
            if (flag && flag.parentElement) {
                const b = flag.parentElement.querySelector("strong");
                if (b) country = b.innerText.trim();
            }

            if (href && !listings.find(x => x.href === href)) {
                listings.push({ title, href, deadline, tot_ref, country });
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
        root.querySelectorAll("script, style, noscript, svg").forEach(el => el.remove());
        b = root.body;
    }

    const rawText = b.innerText || b.textContent || "";
    const phrase = keyword.toLowerCase().trim();

    let found = false;
    let descriptionSnippet = "";
    let postingDate = "";

    const strvals = root.querySelectorAll("strong.strval");

    // Check for keyword in summary
    for (const s of strvals) {
        const par = s.parentElement;
        if (par && (par.innerText || par.textContent || "").includes("Summary:")) {
            const txt = (s.innerText || s.textContent || "").toLowerCase();
            if (txt.includes(phrase)) {
                found = true;
                const idx = txt.indexOf(phrase);
                const sTxt = s.innerText || s.textContent || "";
                descriptionSnippet = sTxt.substring(Math.max(0, idx - 60), idx + phrase.length + 60);
            }
        }
    }

    // Check posting date
    for (const s of strvals) {
        const par = s.parentElement;
        if (par && (par.innerText || par.textContent || "").includes("Posting Date:")) {
            postingDate = (s.innerText || s.textContent || "").trim();
        }
    }

    // Fallback search in entire innerText if Summary wasn't clearly isolated
    if (!found && rawText.toLowerCase().includes(phrase)) {
        found = true;
        const txt = rawText.toLowerCase();
        const idx = txt.indexOf(phrase);
        descriptionSnippet = rawText.substring(Math.max(0, idx - 60), idx + phrase.length + 60).replace(/\n/g, ' ');
    }

    return {
        found,
        description: descriptionSnippet,
        posting_date: postingDate
    };
}
