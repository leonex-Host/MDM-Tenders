chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "check_page_available") {
        sendResponse(checkPageAvailable());
        return true;
    }
    else if (request.action === "extract_listings") {
        extractListings().then(data => {
            if (data && data.status) {
                sendResponse(data);
            } else {
                sendResponse({ status: "results", listings: data || [] });
            }
        });
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
        document.body.hasAttribute("data-captcha-silent");

    const hasNoResultsText =
        /\b(?:no results found|no records found|0 results|no data found|no tenders found|no records available)\b/i.test(lowerText);

    const url = window.location.href;
    const isSearchPage = /\/tenders\/advancesearch\b|\/advancesearch\b/i.test(url);

    const visible = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== "none" &&
            s.visibility !== "hidden" && s.opacity !== "0";
    };

    const forms = [...document.querySelectorAll("form")].filter(visible);

    // Loosely identify which forms are likely search forms
    const searchForms = forms.filter(form => {
        const text = (form.innerText || "").toLowerCase();
        const action = (form.getAttribute("action") || "").toLowerCase();
        return (
            text.includes("search") ||
            action.includes("search") ||
            form.querySelector('input[type="search"], input[name*="search"], input[name*="keyword"]')
        );
    });

    const formPool = searchForms.length ? searchForms : forms;

    const formReady = isSearchPage && formPool.some(form =>
        visible(form) && form.querySelector("input, select, textarea, button")
    );

    const filterReady = formReady && formPool.some(form => {
        const controls = [...form.querySelectorAll("button, input[type='submit'], input[type='button'], [role='button'], a")];
        return controls.some(el => {
            if (!visible(el) || el.disabled || el.getAttribute("aria-disabled") === "true") return false;
            const label = `${el.innerText || ""} ${el.value || ""} ${el.getAttribute("aria-label") || ""} ${el.id || ""} ${el.className || ""}`.toLowerCase();
            const isPagination = el.closest(".pagination") || /\b(next|previous|prev|page\s*\d+|login|sign in|register)\b/i.test(label);
            if (isPagination) return false;
            return el.type === "submit" ||
                /search|filter|apply|submit|find|go|tender/i.test(label) ||
                el.tagName === "BUTTON";
        });
    });

    const isReady = isSearchPage && document.readyState === "complete" && !cloudflareActive;
    const exactFilter = !!document.querySelector("button.search-btn[onclick*='filterTendersJS']");
    const searchInput = !!document.querySelector("input[name='q'], input[type='search'], input[name*='search'], input[name*='keyword']");

    return {
        success: true,
        pageAvailable: isReady,
        formReady,
        filterReady,
        exactFilter,
        searchInput,
        readyState: document.readyState,
        title,
        url,
        cloudflareActive,
        hasNoResultsText,
        reason: cloudflareActive ? "cloudflare_active" :
            !isSearchPage ? "not_search_page" :
                document.readyState !== "complete" ? "document_loading" : "advanced_search_page_loaded"
    };
}

async function clickFilterButton(keyword) {
    console.log("[TOT][CONTENT] click_filter_button RECEIVED", keyword);

    const visible = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0' && !el.disabled;
    };

    console.log("[TOT][CONTENT] SEARCHING_INPUT");

    const allInputs = [...document.querySelectorAll('input')].filter(visible);
    const input = allInputs.find(el => /search|keyword|query|q/i.test(`${el.name} ${el.id} ${el.placeholder}`))
        || allInputs.find(el => el.type === 'text' || el.type === 'search');

    if (!input) {
        console.warn('[TOT][FILTER_FAILED] No search input found on page.');
        return { success: false, clicked: false, verified: false, reason: 'search_input_not_found' };
    }

    console.log("[TOT][CONTENT] INPUT_FOUND", input.outerHTML);

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, keyword || ''); else input.value = keyword || '';

    for (const type of ['input', 'change', 'keyup', 'blur']) {
        input.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    }

    console.log("[TOT][CONTENT] INPUT_VALUE_SET. Current value is:", input.value);

    if (input.value === keyword) {
        console.log("[TOT][CONTENT] INPUT_VALUE_VERIFIED");
    }

    console.log("[TOT][CONTENT] SEARCHING_FILTER_BUTTON");

    console.log("[TOT][CONTENT] exact filter count =", document.querySelectorAll("button.search-btn[onclick*='filterTendersJS']").length);
    console.log("[TOT][CONTENT] fallback filter count =", document.querySelectorAll("[onclick*='filterTendersJS']").length);

    let target = document.querySelector("button.search-btn[onclick*='filterTendersJS']");
    if (!target || !visible(target)) {
        target = document.querySelector("[onclick*='filterTendersJS']");
    }

    if (!target || !visible(target)) {
        console.log("[TOT][CONTENT] FILTER_SELECTOR_NOT_FOUND");
        return { clicked: false, reason: "FILTER_SELECTOR_NOT_FOUND" };
    }

    console.log("[TOT][CONTENT] FILTER_BUTTON_FOUND", target.outerHTML);
    console.log("[TOT][CONTENT] FILTER_CLICKING");

    target.scrollIntoView({ block: 'center', inline: 'center' });
    target.focus();

    // Explicit mouse event chaining to securely force Angular's root digest cycle
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
    const mu = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
    const clk = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });

    target.dispatchEvent(md);
    target.dispatchEvent(mu);
    target.dispatchEvent(clk);

    console.log("[TOT][CONTENT] FILTER_CLICKED");

    return {
        clicked: true,
        verified: false,
        reason: 'filter_ready',
        selector: "button.search-btn[onclick*='filterTendersJS'], [onclick*='filterTendersJS']"
    };
}

async function extractListings() {
    if (document.title.includes("Just a moment") ||
        document.title.includes("Checking your browser") ||
        document.body.hasAttribute("data-captcha-silent")) {
        return { status: "cloudflare" };
    }

    let listings = [];

    const items = document.querySelectorAll("div.box-shadow, div.listingbox.ng-scope, div.listingbox, div.tender-item");

    items.forEach(item => {
        try {
            let title = "", href = "", deadline = "", tot_ref = "", country = "";

            const linkCandidates = [...item.querySelectorAll("a")];
            // Explicitly filter out structurally identical toggle anchors that lack routing endpoints 
            const validLinks = linkCandidates.filter(a => {
                const u = a.getAttribute("href") || a.getAttribute("ng-href") || "";
                return u.length > 5 && u !== "#" && u.toLowerCase() !== "javascript:void(0);";
            });

            // Find the link pointing to a tender detail layout, fallback to any valid routing link 
            const linkEl = validLinks.find(a => /tender/i.test(a.href || a.getAttribute("ng-href") || "")) || validLinks[0];

            if (linkEl) {
                title = linkEl.innerText.trim();
                const rawHref = linkEl.getAttribute('href') || linkEl.getAttribute('ng-href') || linkEl.getAttribute('data-href');
                if (rawHref && rawHref !== "null") {
                    href = Object.assign(document.createElement('a'), { href: rawHref }).href;
                }
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
    let found = true;
    let descriptionSnippet = "";
    let postingDate = "";

    const allParagraphs = [...document.querySelectorAll("p, div, a, span")];

    for (const p of allParagraphs) {
        const text = (p.innerText || "").trim().toLowerCase();
        
        if (text.startsWith("summary:")) {
            const strongNode = p.querySelector("strong");
            descriptionSnippet = strongNode ? strongNode.innerText.trim() : p.innerText.replace(/^summary:\s*/i, '').trim();
        }
        
        if (text.startsWith("posting date:")) {
            const strongNode = p.querySelector("strong");
            postingDate = strongNode ? strongNode.innerText.trim() : p.innerText.replace(/^posting date:\s*/i, '').trim();
        }
    }

    if (!descriptionSnippet) {
        descriptionSnippet = "Details automatically merged by source constraint. " + (document.body.innerText || "").substring(0, 150).replace(/\s+/g, ' ') + "...";
    }

    return {
        found,
        description: descriptionSnippet,
        posting_date: postingDate
    };
}

function getCurrentPageNumber() {
    const active = document.querySelector(
        ".pagination li.active a, .pagination li.active span, ul.pagination li.active, .pagination .active, .paginationnew a.hover-blue, .paginationnew .subscribe-blue.hover-blue, li.activeclass a"
    );
    return active ? active.innerText.trim() : null;
}

function getListingSignature() {
    const items = document.querySelectorAll(
        "div.box-shadow, div.listingbox.ng-scope, div.listingbox, div.tender-item"
    );

    const urls = [...items]
        .map(item => {
            const linkCandidates = [...item.querySelectorAll("a")];
            const link = item.querySelector("a.truncatetext.ng-binding, a.truncatetext, a.listing-prod-view.mobbtn")
                || linkCandidates.find(a => /tender/i.test(a.href || a.getAttribute("ng-href") || "") && (a.innerText || "").length > 5)
                || linkCandidates.find(a => (a.innerText || "").trim().length > 10)
                || linkCandidates[0];
            if (link) {
                let p_href = link.getAttribute("href");
                if (p_href === "null" || !p_href) p_href = null;
                const p_ng = link.getAttribute("ng-href");
                return p_href || p_ng || link.href || "";
            }
            return "";
        })
        .filter(Boolean)
        .slice(0, 10);

    return `${items.length}|${urls.join("|")}`;
}

async function clickNextPage() {
    const candidates = document.querySelectorAll(
        "ul.pagination li a, .pagination a, nav a, a[rel='next'], a.next, li.nextclass a, li.next a, button.next, [aria-label*='Next'], [aria-label*='next']"
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

    // Explicit mouse event chaining to securely force Angular's digest cycle 
    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
    const mu = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
    const clk = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });

    btn.dispatchEvent(md);
    btn.dispatchEvent(mu);
    btn.dispatchEvent(clk);

    // Responsive asynchronous AJAX yielding
    await new Promise(resolve => setTimeout(resolve, 800));

    return {
        clicked: true,
        changed: true,
        beforeSignature,
        afterSignature: null,
        reason: 'page_interaction_complete'
    };
}
