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

async function extractListings() {
    if (document.title.includes("Just a moment") ||
        (document.body && document.body.innerHTML && document.body.innerHTML.includes("cf-turnstile")) ||
        (document.body && document.body.innerText && document.body.innerText.includes("Cloudflare"))) {
        return { status: "cloudflare" };
    }

    let listings = [];

    // Attempt clicking the filter button if we are on the initial search page redirect
    const filterBtn = document.querySelector("button.search-btn[onclick*='filterTendersJS']");
    if (filterBtn) {
        filterBtn.click();
        await new Promise(r => setTimeout(r, 2000)); // wait for ajax reload
    }

    const items = document.querySelectorAll("div.listingbox.ng-scope, div.listingbox, div.tender-item");

    items.forEach(item => {
        try {
            let title = "", href = "", deadline = "", tot_ref = "", country = "";

            const linkEl = item.querySelector("a.truncatetext.ng-binding, a.truncatetext, a.listing-prod-view.mobbtn");
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

async function extractDetails(keyword) {
    const rawText = document.body.innerText;
    const phrase = keyword.toLowerCase();

    let found = false;
    let descriptionSnippet = "";
    let postingDate = "";

    const strvals = document.querySelectorAll("strong.strval");

    // Check for keyword in summary
    for (const s of strvals) {
        const par = s.parentElement;
        if (par && par.innerText.includes("Summary:")) {
            const txt = s.innerText.toLowerCase();
            if (txt.includes(phrase)) {
                found = true;
                const idx = txt.indexOf(phrase);
                descriptionSnippet = s.innerText.substring(Math.max(0, idx - 60), idx + phrase.length + 60);
            }
        }
    }

    // Check posting date
    for (const s of strvals) {
        const par = s.parentElement;
        if (par && par.innerText.includes("Posting Date:")) {
            postingDate = s.innerText.trim();
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

function getListingSignature() {
    const items = document.querySelectorAll("div.listingbox.ng-scope, div.listingbox, div.tender-item");

    return [...items]
        .slice(0, 5)
        .map(item => {
            const link = item.querySelector("a.truncatetext.ng-binding, a.truncatetext, a.listing-prod-view.mobbtn");
            return link ? (link.href || link.getAttribute("href") || "") : item.innerText.slice(0, 100);
        })
        .join("|");
}

async function clickNextPage() {
    // 1. Look for next button
    const btn = document.querySelector("li.nextclass a, li.next a, a[rel='next'], a.next, button.next");
    if (!btn) {
        return { clicked: false, reason: "next_button_not_found" };
    }

    // 2. Check disabled
    if (btn.disabled || btn.classList.contains("disabled") || btn.closest("li.disabled, li.inactive")) {
        return { clicked: false, reason: "next_button_disabled" };
    }

    // 3. Scroll into view
    btn.scrollIntoView({ behavior: "smooth", block: "center" });

    // 4. Get signature before click
    const beforeSig = getListingSignature();

    // 5. Click
    btn.click();

    // 6. Wait for signature change
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));

        if (document.title.includes("Just a moment") ||
            (document.body && document.body.innerHTML && document.body.innerHTML.includes("cf-turnstile")) ||
            (document.body && document.body.innerText && document.body.innerText.includes("Cloudflare"))) {
            return { clicked: true, changed: true }; // Hit cloudflare loading
        }

        const afterSig = getListingSignature();
        if (afterSig !== beforeSig) {
            return { clicked: true, changed: true };
        }
    }

    return { clicked: true, changed: false, reason: "timeout_waiting_for_change" };
}
