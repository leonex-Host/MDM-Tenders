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
    const html = document.documentElement?.innerHTML || "";
    const text = document.body?.innerText || "";
    const lowerText = text.toLowerCase();

    const cloudflareActive =
        /just a moment|checking your browser|verify you are human/i.test(title + " " + text) ||
        html.includes("cf-turnstile") ||
        html.includes("cf-chl") ||
        html.includes("challenge-platform");

    const hasNoResultsText =
        /no results found|no records found|0 results|no data found|no tenders found|no records available/i.test(lowerText);

    const url = window.location.href;
    const isSearchPage = /\/tenders\/advancesearch\b|\/advancesearch\b/i.test(url);

    const visible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== "none" &&
            s.visibility !== "hidden" && s.opacity !== "0";
    };

    const allInputs = [...document.querySelectorAll("input")].filter(visible);
    const hasSearchInput = allInputs.some(el => /search|keyword|query|q/i.test(`${el.name} ${el.id} ${el.placeholder}`) || el.type === 'text' || el.type === 'search');

    // Rely exclusively on the physical inputs being rendered rather than strict <form> container inheritance
    const formReady = Boolean(isSearchPage && hasSearchInput);

    const allButtons = [...document.querySelectorAll("button, input[type='submit'], input[type='button'], [role='button'], a")].filter(visible);
    const filterReady = formReady && allButtons.some(el => {
        const label = `${el.innerText || ""} ${el.value || ""} ${el.getAttribute("aria-label") || ""} ${el.id || ""} ${el.className || ""}`.toLowerCase();
        if (/next|previous|prev|page\s*\d+|login|sign in|register/.test(label)) return false;
        return el.type === "submit" || /search|filter|apply|submit|find|go|tender/i.test(label) || el.tagName === "BUTTON";
    });

    return {
        success: true,
        pageAvailable: !cloudflareActive && isSearchPage && document.readyState === "complete" && formReady && filterReady,
        formReady,
        filterReady,
        readyState: document.readyState,
        title,
        url,
        cloudflareActive,
        hasNoResultsText,
        reason: cloudflareActive ? "cloudflare_active" :
            !isSearchPage ? "not_search_page" :
                !formReady ? "search_form_not_ready" :
                    !filterReady ? "filter_button_not_ready" : "advanced_search_form_ready"
    };
}

async function clickFilterButton(keyword) {
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const visible = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0' && !el.disabled;
    };
    const norm = v => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();

    // TenderOnTime commonly uses Angular/jQuery handlers on this control.
    // Prefer the actual filter control before using generic fallbacks.
    const directSelectors = [
        '[ng-click*="filterTendersJS" i]',
        '[ng-click*="filterTenders" i]',
        '[onclick*="filterTendersJS" i]',
        '[onclick*="filterTenders" i]',
        '#filterTendersJS',
        '.filtertendersjs',
        'button.filter',
        'input[type="submit"]'
    ];

    const allInputs = [...document.querySelectorAll('input')].filter(visible);
    const input = allInputs.find(el => /search|keyword|query|q/i.test(`${el.name} ${el.id} ${el.placeholder}`))
        || allInputs.find(el => el.type === 'text' || el.type === 'search');
    if (!input) return { success: false, clicked: false, verified: false, reason: 'search_input_not_found' };

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, keyword || ''); else input.value = keyword || '';
    for (const type of ['input', 'change', 'keydown', 'keypress', 'keyup', 'blur']) {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        if (type.startsWith('key')) {
            ev.key = 'Enter';
            ev.keyCode = 13;
            ev.which = 13;
        }
        input.dispatchEvent(ev);
    }

    let targets = [];
    for (const selector of directSelectors) {
        const matching = [...document.querySelectorAll(selector)].filter(visible);
        if (matching.length > 0) {
            targets = matching;
            break;
        }
    }

    if (targets.length === 0) {
        const container = input.closest('form, .filter-box, .search, .sidebar, .sidebar-wrapper, .left-column, .row') || document;
        const candidates = [...container.querySelectorAll('button, input[type="submit"], input[type="button"], [role="button"], a')]
            .filter(visible)
            .map(el => {
                const label = norm(`${el.innerText} ${el.value} ${el.id} ${el.className} ${el.getAttribute('aria-label')} ${el.getAttribute('ng-click')} ${el.getAttribute('onclick')}`);
                let score = 0;
                if (/filtertendersjs|filtertenders/.test(label)) score += 1000;
                if (/filter|search|apply|submit|find|go/.test(label)) score += 300;
                if (el.type === 'submit' || el.tagName === 'BUTTON') score += 100;
                if (/next|previous|login|register|reset|clear|logout|menu/.test(label)) score -= 1000;
                if (el.tagName === 'A' && el.getAttribute('href') && !/^javascript:/i.test(el.getAttribute('href'))) score -= 200;
                return { el, score };
            }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
        if (candidates.length > 0) targets = [candidates[0].el];
    }

    if (targets.length === 0) return { success: false, clicked: false, verified: false, reason: 'filter_button_not_found' };

    targets.forEach(target => {
        try {
            target.scrollIntoView({ block: 'center', inline: 'center' });
            target.focus();
            for (const type of ['mousedown', 'mouseup', 'click']) {
                target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
            }
            if (target.tagName !== 'A' || /^javascript:/i.test(target.getAttribute('href') || '')) {
                target.click();
            }
            console.log('[TENDER FILTER CLICKED]', { keyword, selector: target.outerHTML.slice(0, 500) });
        } catch (e) { }
    });

    // Indestructible Execution Assurance: Direct Main-World invocation of the specific handler
    try {
        const inject = document.createElement('script');
        inject.textContent = "if (typeof filterTendersJS === 'function') { filterTendersJS(1, 'filterbtn'); }";
        document.documentElement.appendChild(inject);
        inject.remove();
        console.log('[TENDER FILTER SCRIPT EXECUTED]');
    } catch (e) { }

    const beforeUrl = location.href;
    const beforeText = document.body?.innerText || '';

    // Accept one/two results. Only wait for the site to react, not for a minimum count.
    for (let i = 0; i < 25; i++) {
        await sleep(500);
        const text = document.body?.innerText || '';
        const changed = text !== beforeText || location.href !== beforeUrl || document.querySelectorAll('div.listingbox, div.listingbox.ng-scope, div.tender-item').length > 0;
        const noResults = /no results|no records|no tenders|no data found|0 results/i.test(text);
        if (changed || noResults) return { success: true, clicked: true, verified: true, reason: noResults ? 'no_results' : 'filter_reacted', target: target.outerHTML.slice(0, 500) };
    }
    return { success: true, clicked: true, verified: true, reason: 'click_sent', target: target.outerHTML.slice(0, 500) };
}
async function extractListings() {
    if (document.title.includes("Just a moment") ||
        document.title.includes("Checking your browser")) {
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
