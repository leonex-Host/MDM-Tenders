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
    else if (request.action === "click_filter_button") {
        clickFilterButton(request.keyword).then(sendResponse);
        return true;
    }
});

function checkPageAvailable() {
    const title = document.title || "";
    const html = (document.body && document.body.innerHTML) ? document.body.innerHTML : "";
    const text = (document.body && document.body.innerText) ? document.body.innerText : "";

    const cloudflareActive = title.includes("Just a moment") ||
        html.includes("cf-turnstile") ||
        text.includes("Cloudflare") ||
        text.includes("Checking your browser") ||
        text.includes("Verify you are human") ||
        html.includes("cf-chl") ||
        html.includes("challenge-platform");

    const hasNoResultsText = text.toLowerCase().includes("no results found") ||
        text.toLowerCase().includes("no records found") ||
        text.toLowerCase().includes("0 results") ||
        text.toLowerCase().includes("no data found") ||
        text.toLowerCase().includes("no tenders found") ||
        text.toLowerCase().includes("no records available");

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

async function clickFilterButton(keyword) {
    console.log("[FILTER SEARCH] Looking for Filter button");

    const getSignature = () => {
        const items = document.querySelectorAll(
            "div.listingbox.ng-scope, div.listingbox, div.tender-item"
        );
        if (!items || items.length === 0) return "0|";
        return `${items.length}|${[...items].slice(0, 5).map(e => e.innerText.length).join(",")}`;
    };

    const beforeUrl = window.location.href;
    const beforeSignature = getSignature();
    const beforeListingCount = beforeSignature.split('|')[0];

    const candidates = Array.from(document.querySelectorAll("button, input, a, [role='button'], [onclick], [ng-click]"));
    let candidateList = [];

    candidates.forEach(el => {
        const text = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().toLowerCase();
        const onclick = (el.getAttribute("onclick") || "").toLowerCase();
        const angularClick = (el.getAttribute("ng-click") || "").toLowerCase();
        const classes = (el.className || "").toLowerCase();
        const type = (el.getAttribute("type") || "").toLowerCase();
        const id = (el.id || "").toLowerCase();
        const name = (el.getAttribute("name") || "").toLowerCase();

        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        const visible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";

        if (!visible || disabled) return;

        let score = 0;

        if (onclick.includes("filtertendersjs")) score += 100;
        else if (onclick.includes("filter") || onclick.includes("search")) score += 50;

        if (angularClick.includes("filtertendersjs")) score += 95;
        else if (angularClick.includes("filter") || angularClick.includes("search")) score += 45;

        // "Search", "Filter", "Go", "Apply" EXACT match
        if (["search", "filter", "go", "apply", "submit"].includes(text)) score += 30;

        if (classes.includes("search-btn")) score += 25;
        if (classes.includes("filter") || classes.includes("search")) score += 10;
        if (id.includes("filter") || id.includes("search") || name.includes("search")) score += 10;

        if (type === "submit" && el.closest("form")) score += 20;

        // Penalities
        if (classes.includes("pagination") || el.closest(".pagination")) score -= 100;
        if (el.tagName === "A" && el.href && !el.href.includes("javascript")) score -= 50; // Navigation links
        if (text.includes("next") || text.includes("previous") || text.includes("page")) score -= 100;
        if (id.includes("login") || classes.includes("login") || id.includes("header") || classes.includes("header")) score -= 100;

        if (score > 0) {
            candidateList.push({ el, score, tag: el.tagName, id: el.id, className: el.className, text, name, type, onclick, ngClick: angularClick, visible, disabled, outerHTML: el.outerHTML.substring(0, 150) });
        }
    });

    candidateList.sort((a, b) => b.score - a.score);

    console.log("[FILTER CANDIDATES] Scored list of candidates:");
    candidateList.forEach(c => {
        console.log(`[FILTER CANDIDATES] Score: ${c.score}`, { tag: c.tag, className: c.className, onclick: c.onclick });
    });

    if (candidateList.length === 0) {
        console.error("[FILTER ERROR] Filter button was not found or clickable");
        return { success: false, clicked: false, verified: false, reason: "filter_button_not_found" };
    }

    const bestFilterInfo = candidateList[0];
    const button = bestFilterInfo.el;

    console.log("[FILTER TARGET] Selected Filter Button:", {
        score: bestFilterInfo.score,
        tag: bestFilterInfo.tag,
        className: bestFilterInfo.className,
        text: bestFilterInfo.text,
        onclick: bestFilterInfo.onclick
    });

    if (keyword) {
        const inputs = Array.from(document.querySelectorAll("input[type='text'], input[type='search'], input[name='search'], input[name='q']"));
        let bestInput = null;

        for (const input of inputs) {
            const rect = input.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                const lowerName = (input.name || "").toLowerCase();
                const lowerId = (input.id || "").toLowerCase();
                const lowerHolder = (input.placeholder || "").toLowerCase();
                if (lowerName === 'q' || lowerHolder.includes("keyword") || lowerHolder.includes("search") || lowerName.includes("search") || lowerId.includes("search")) {
                    bestInput = input;
                    break;
                }
            }
        }

        if (bestInput) {
            console.log("[FILTER INPUT] Injecting keyword into:", bestInput.name || bestInput.id || bestInput.placeholder);

            // Native setter for React/Angular bindings
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
            if (nativeInputValueSetter) {
                nativeInputValueSetter.call(bestInput, keyword);
            } else {
                bestInput.value = keyword;
            }

            bestInput.dispatchEvent(new Event('input', { bubbles: true }));
            bestInput.dispatchEvent(new Event('change', { bubbles: true }));
            bestInput.dispatchEvent(new Event('blur', { bubbles: true }));

            if (bestInput.value !== keyword) {
                console.warn("[FILTER INPUT] WARNING: Input value did not stick.");
            }
        } else {
            console.error("[FILTER ERROR] WARNING: No valid keyword search input found on page.");
            return { success: false, clicked: false, verified: false, reason: "search_input_not_found" };
        }
    }

    button.scrollIntoView({ behavior: "instant", block: "center" });

    console.log(`[FILTER CLICK] Filter clicked for keyword: ${keyword || 'none'}`);
    button.focus();
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    button.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    button.click();

    console.log("[FILTER VERIFY] Waiting for visual changes to search results...");

    // Explicit buffer before validating to prevent instant-reads of stale DOM
    await new Promise(resolve => setTimeout(resolve, 2500));

    let stableCount = 0;
    let lastSignature = null;
    let hasChanged = false;
    let verified = false;
    let reason = "no_visual_change";

    for (let attempt = 0; attempt < 30; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const currentSignature = getSignature();
        const currentUrl = window.location.href;

        let pageCheck = checkPageAvailable();
        if (pageCheck.cloudflareActive) {
            console.log("[FILTER VERIFY] Cloudflare activation detected post-click, trusting click action.");
            verified = true;
            reason = "cloudflare_triggered";
            break;
        }

        if (currentSignature !== beforeSignature) {
            hasChanged = true;
            if (currentSignature === lastSignature) {
                stableCount++;
            } else {
                lastSignature = currentSignature;
                stableCount = 1;
            }

            if (stableCount >= 2 && currentSignature !== "0|") {
                console.log("[FILTER RESULT] Verified changes in listings successfully.");
                verified = true;
                reason = "signature_changed";
                break;
            }
        }

        if (pageCheck.hasNoResultsText) {
            console.log("[FILTER RESULT] Verified 'no results' state successfully.");
            verified = true;
            reason = "no_results_text_appeared";
            break;
        }
    }

    const afterSignature = getSignature();
    const afterListingCount = afterSignature.split('|')[0];

    return {
        success: true,
        clicked: true,
        verified,
        reason,
        target: {
            tag: bestFilterInfo.tag,
            id: bestFilterInfo.id,
            className: bestFilterInfo.className,
            text: bestFilterInfo.text,
            onclick: bestFilterInfo.onclick
        },
        keyword,
        before: {
            url: beforeUrl,
            listingCount: beforeListingCount,
            signature: beforeSignature
        },
        after: {
            url: window.location.href,
            listingCount: afterListingCount,
            signature: afterSignature
        }
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

    for (const s of strvals) {
        const par = s.parentElement;
        if (par && par.innerText.includes("Posting Date:")) {
            postingDate = s.innerText.trim();
        }
    }

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
            return link ? link.href || link.getAttribute("href") || "" : "";
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
        return { clicked: false, changed: false, reason: "next_button_not_found" };
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

    btn.scrollIntoView({ behavior: "instant", block: "center" });
    btn.click();

    // Explicit buffer to allow pagination AJAX to start clearing old DOM
    await new Promise(resolve => setTimeout(resolve, 2500));

    let lastSignature = null;
    let stableCount = 0;

    for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const items = document.querySelectorAll("div.listingbox.ng-scope, div.listingbox, div.tender-item");

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
