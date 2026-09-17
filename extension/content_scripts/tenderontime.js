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
    else if (request.action === "click_filter_button") {
        clickFilterButton(request.keyword).then(sendResponse);
        return true;
    }
});

async function clickFilterButton(keyword) {
    console.log("[FILTER SEARCH] Looking for Filter button");
    const timeoutMs = 30000;
    const startedAt = Date.now();

    const getSignature = () => {
        const items = document.querySelectorAll(
            "div.listingbox.ng-scope, div.listingbox, div.tender-item"
        );
        if (!items || items.length === 0) return "0|";
        return `${items.length}|${[...items].slice(0, 5).map(e => e.innerText.length).join(",")}`;
    };

    const beforeSignature = getSignature();

    while (Date.now() - startedAt < timeoutMs) {
        const candidates = Array.from(
            document.querySelectorAll(
                "button, input[type='button'], input[type='submit']"
            )
        );

        let bestButton = null;

        candidates.forEach(el => {
            const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().toLowerCase();
            const onclick = (el.getAttribute("onclick") || "").toLowerCase();
            const angularClick = (el.getAttribute("ng-click") || "").toLowerCase();
            const classes = (el.className || "").toLowerCase();
            const type = (el.getAttribute("type") || "").toLowerCase();
            const title = (el.getAttribute("title") || "").toLowerCase();

            const rect = el.getBoundingClientRect();
            const style = window.getComputedStyle(el);

            const visible =
                rect.width > 0 &&
                rect.height > 0 &&
                style.display !== "none" &&
                style.visibility !== "hidden";

            const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";

            console.log("[FILTER CANDIDATE]", {
                tag: el.tagName,
                id: el.id,
                className: el.className,
                text: el.innerText || el.value,
                name: el.getAttribute("name"),
                type: el.getAttribute("type"),
                onclick: el.getAttribute("onclick"),
                ngClick: el.getAttribute("ng-click"),
                disabled,
                visible,
                outerHTML: el.outerHTML.substring(0, 150)
            });
        });

        // Strategy 1: Exact selector if it's there and visible
        let exactBtn = document.querySelector("button.search-btn[onclick*='filterTendersJS']");

        if (exactBtn && exactBtn.offsetWidth > 0 && exactBtn.offsetHeight > 0 && !exactBtn.disabled) {
            bestButton = exactBtn;
        } else {
            // Strategy 2: Rely heavily on specific search/filter invocation logic
            bestButton = candidates.find(el => {
                const onclick = (el.getAttribute("onclick") || "").toLowerCase();
                const text = (el.innerText || el.value || "").trim().toLowerCase();
                const visible = el.offsetWidth > 0 && el.offsetHeight > 0;
                const disabled = el.disabled;
                const type = (el.getAttribute("type") || "").toLowerCase();
                const searchBtnClass = (el.className || "").toLowerCase().includes("search-btn");

                if (!visible || disabled) return false;

                // Only trust highly suggestive execution hooks OR exact search classes combined with search text
                if (onclick.includes("filter") || onclick.includes("search")) return true;
                if ((text === "search" || text === "filter" || text === "go") && (searchBtnClass || type === "submit")) return true;

                return false;
            });
        }

        if (bestButton) {
            const button = bestButton;
            button.scrollIntoView({
                behavior: "instant",
                block: "center"
            });

            console.log("[FILTER TARGET]", {
                tag: button.tagName,
                className: button.className,
                text: button.innerText || button.value,
                onclick: button.getAttribute("onclick"),
                ngClick: button.getAttribute("ng-click")
            });

            if (keyword) {
                const inputs = document.querySelectorAll("input[type='text'], input[type='search'], input[name='search'], input[name='q']");
                for (const input of inputs) {
                    const lowerName = (input.name || "").toLowerCase();
                    const lowerId = (input.id || "").toLowerCase();
                    const lowerHolder = (input.placeholder || "").toLowerCase();
                    if (lowerName === 'q' || lowerHolder.includes("keyword") || lowerHolder.includes("search") || lowerName.includes("search") || lowerId.includes("search")) {
                        console.log("[FILTER INPUT] Injecting keyword into:", input.name || input.id || input.placeholder);
                        input.value = keyword;
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }

            console.log("[FILTER CLICK] Clicking Filter button");
            button.click();

            console.log("[FILTER VERIFY] Waiting for visual changes to search results...");
            let stableCount = 0;
            let lastSignature = null;
            let hasChanged = false;

            // Poll until items disappear and reappear, or signature firmly changes
            for (let attempt = 0; attempt < 30; attempt++) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                const currentSignature = getSignature();

                if (currentSignature !== beforeSignature || hasChanged) {
                    hasChanged = true;
                    if (currentSignature === lastSignature) {
                        stableCount++;
                    } else {
                        lastSignature = currentSignature;
                        stableCount = 1;
                    }

                    if (stableCount >= 2 && currentSignature !== "0|") {
                        console.log("[FILTER RESULT] Verified changes in listings successfully.");
                        return {
                            clicked: true,
                            tag: button.tagName,
                            id: button.id,
                            className: button.className,
                            text: button.innerText || button.value,
                            verified: true
                        };
                    }
                }
            }

            console.warn("[FILTER TIMEOUT] Clicked, but items did not register a signature change within 30s.");
            return {
                clicked: true,
                tag: button.tagName,
                id: button.id,
                className: button.className,
                text: button.innerText || button.value,
                verified: false
            };
        }

        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.error("[FILTER ERROR] Filter button was not found or clickable");
    return {
        clicked: false,
        reason: "filter_button_not_found_or_not_clickable"
    };
}

async function extractListings() {
    if (document.title.includes("Just a moment") ||
        (document.body && document.body.innerHTML && document.body.innerHTML.includes("cf-turnstile")) ||
        (document.body && document.body.innerText && document.body.innerText.includes("Cloudflare"))) {
        return { status: "cloudflare" };
    }

    let listings = [];

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

function getCurrentPageNumber() {
    // Specifically target pagination bounds
    const active = document.querySelector(
        ".pagination li.active a, .pagination li.active span, ul.pagination li.active, .pagination .active"
    );

    return active ? active.innerText.trim() : null;
}

function getListingSignature() {
    const items = document.querySelectorAll(
        "div.listingbox.ng-scope, div.listingbox, div.tender-item"
    );

    const urls = [...items]
        .map(item => {
            const link = item.querySelector(
                "a.truncatetext.ng-binding, a.truncatetext, a.listing-prod-view.mobbtn"
            );

            return link
                ? link.href || link.getAttribute("href") || ""
                : "";
        })
        .filter(Boolean)
        .slice(0, 10);

    return `${items.length}|${urls.join("|")}`;
}

async function clickNextPage() {
    const candidates = document.querySelectorAll(
        "ul.pagination li a, .pagination a, a[rel='next'], a.next, li.nextclass a, li.next a, button.next"
    );

    let btn = null;

    for (const el of candidates) {
        const text = (el.innerText || "").toLowerCase().trim();
        const parentLi = el.closest("li");

        if (
            el.disabled ||
            el.classList.contains("disabled") ||
            el.getAttribute("aria-disabled") === "true" ||
            (parentLi && (parentLi.classList.contains("disabled") || parentLi.classList.contains("inactive"))) ||
            (parentLi && parentLi.classList.contains("active"))
        ) {
            continue;
        }

        const isNextBtn = text.includes("next") ||
            text.includes("»") ||
            text.includes(">") ||
            el.className.includes("next") ||
            (parentLi && parentLi.className.includes("next"));

        const isVisible = !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

        if (isNextBtn && isVisible) {
            btn = el;
            break;
        }
    }

    if (!btn) {
        return {
            clicked: false,
            changed: false,
            reason: "next_button_not_found"
        };
    }

    const beforeSignature = getListingSignature();

    console.log("[NEXT CLICK TARGET]", {
        text: btn.innerText?.trim(),
        href: btn.href || null,
        className: btn.className,
        visible: !!(btn.offsetWidth || btn.offsetHeight || btn.getClientRects().length),
        outerHTML: btn.outerHTML.slice(0, 1000)
    });

    console.log("[BEFORE NEXT]", {
        signature: beforeSignature,
        activePage: getCurrentPageNumber(),
        url: location.href
    });

    btn.scrollIntoView({
        behavior: "instant",
        block: "center"
    });

    btn.click();

    let lastSignature = null;
    let stableCount = 0;

    for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const items = document.querySelectorAll(
            "div.listingbox.ng-scope, div.listingbox, div.tender-item"
        );

        if (!items || items.length === 0) {
            continue;
        }

        const currentSignature = getListingSignature();

        if (
            currentSignature &&
            currentSignature !== beforeSignature
        ) {
            if (currentSignature === lastSignature) {
                stableCount++;
            } else {
                lastSignature = currentSignature;
                stableCount = 1;
            }

            if (stableCount >= 2) {
                console.log("[AFTER NEXT]", {
                    signature: currentSignature,
                    activePage: getCurrentPageNumber(),
                    url: location.href
                });

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
