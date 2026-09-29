chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    try {
        if (request.action === "check_page_available") {
            Promise.resolve(checkPageAvailable()).then(sendResponse).catch(e => { console.error("[TOT] FATAL ERROR parsing page availability:", e); sendResponse(null); });
            return true;
        } else if (request.action === "extract_listings") {
            extractListings().then(sendResponse).catch(e => { console.error("[TOT] FATAL ERROR inside extract_listings:", e); sendResponse(null); });
            return true;
        } else if (request.action === "extract_details") {
            extractDetails(request.keyword).then(sendResponse).catch(e => { console.error("[TOT] FATAL ERROR inside extract_details:", e); sendResponse(null); });
            return true;
        } else if (request.action === "click_next_page") {
            Promise.resolve(clickNextPage()).then(sendResponse).catch(e => { console.error("[TOT] FATAL ERROR inside pagination selection:", e); sendResponse(null); });
            return true;
        } else if (request.action === "click_filter_button") {
            Promise.resolve(clickFilterButton(request.options.keyword)).then(sendResponse).catch(e => { console.error("[TOT] FATAL ERROR in filter loop:", e); sendResponse(null); });
            return true;
        }
    } catch (e) {
        sendResponse(null);
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
        html.includes("challenge-platform") ||
        document.body.hasAttribute("data-captcha-silent");

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

    const allInputs = [...document.querySelectorAll('input')].filter(el => {
        if (!visible(el)) return false;
        const type = (el.type || "").toLowerCase();
        // Specifically block structural/boolean inputs from being mistaken for text search fields
        if (['checkbox', 'radio', 'hidden', 'submit', 'button', 'file', 'image', 'color'].includes(type)) return false;
        return true;
    });

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
        const tgt = [...document.querySelectorAll("button[type='submit'], input[type='submit'], button.search-btn")].find(btn => {
            const txt = (btn.innerText || btn.value || "").toLowerCase();
            return txt.includes('search') || txt.includes('filter');
        });
        target = tgt;
    }

    if (!target || !visible(target)) {
        console.log("[TOT][CONTENT] FILTER_SELECTOR_NOT_FOUND");
        return { clicked: false, reason: "FILTER_SELECTOR_NOT_FOUND" };
    }

    console.log("[TOT][CONTENT] FILTER_BUTTON_FOUND", target.outerHTML);
    console.log("[TOT][CONTENT] FILTER_CLICKING");

    target.scrollIntoView({ block: 'center', inline: 'center' });
    target.focus();
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    target.click();

    console.log("[TOT][CONTENT] FILTER_CLICKED");

    // Force Angular scope to digest the submit immediately
    await new Promise(r => setTimeout(r, 600));

    return {
        clicked: true,
        verified: true,
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

    const rawItems = document.querySelectorAll("div.box-shadow, div.listingbox.ng-scope, div.listingbox, div.tender-item, table#searchedtenders tr, tr.tender-row, tr[class*='tender'], .card");
    const items = [...rawItems].filter(el => {
        const linkHTML = el.innerHTML || el.outerHTML || "";
        return /tenders?(?:-details)?\//i.test(linkHTML);
    });

    console.log(`[TOT][CONTENT] extract_listings raw=${rawItems.length} passed=${items.length}`);

    items.forEach(item => {
        try {
            let title = "", href = "", deadline = "", tot_ref = "", country = "";

            let linkEl = item.querySelector("a.truncatetext.ng-binding, a.truncatetext, a.listing-prod-view.mobbtn") || item.querySelector("a[href*='tender']");
            if (linkEl) {
                title = linkEl.innerText.trim();
            }

            const match = item.outerHTML.match(/(?:href|onclick|data-href|ng-href)=["']?([^"'>\s]*tenders?(?:-details)?\/[^"'>\s]+)["']?/i);
            if (match) {
                href = Object.assign(document.createElement('a'), { href: match[1] }).href;
            } else if (linkEl) {
                const rawHref = linkEl.getAttribute('href') || linkEl.getAttribute('ng-href') || linkEl.getAttribute('data-href');
                if (rawHref && rawHref !== "null") {
                    href = Object.assign(document.createElement('a'), { href: rawHref }).href;
                }
            }

            const deadlineEl = item.querySelector("div.deadline strong, td.deadline, .deadline-date");
            if (deadlineEl) deadline = deadlineEl.innerText.trim();

            const textMatch = item.innerText.match(/TOT Ref\.\s*No\.\?:?\s*(\d+)/i);
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

    // Legacy Support
    const strvals = document.querySelectorAll("strong.strval");
    for (const s of strvals) {
        const par = s.parentElement;
        if (par && par.innerText.includes("Summary:")) {
            const txt = s.innerText.toLowerCase();
            if (txt.includes(phrase)) {
                found = true;
                const idx = txt.indexOf(phrase);
                descriptionSnippet = s.innerText.substring(Math.max(0, idx - 60), idx + phrase.length + 60);
                break;
            }
        }
    }

    if (!found) {
        for (const s of strvals) {
            const txt = s.innerText.toLowerCase();
            if (txt.includes(phrase) && txt.length > 20) {
                found = true;
                const idx = txt.indexOf(phrase);
                descriptionSnippet = s.innerText.substring(Math.max(0, idx - 60), idx + phrase.length + 60);
                break;
            }
        }
    }

    for (const s of strvals) {
        const par = s.parentElement;
        if (par && par.innerText.includes("Posting Date:")) {
            postingDate = s.innerText.trim();
        }
    }

    // New DOM Support Formats
    if (!found) {
        const paragraphs = document.querySelectorAll("p, div");
        for (const p of paragraphs) {
            const text = (p.innerText || "").trim().toLowerCase();
            if (text.startsWith("summary:")) {
                const innerTxt = p.innerText.toLowerCase();
                if (innerTxt.includes(phrase)) {
                    found = true;
                    const strongNode = p.querySelector("strong");
                    descriptionSnippet = strongNode ? strongNode.innerText.trim() : p.innerText.replace(/^summary:\s*/i, '').trim();
                    break;
                }
            }
        }

        // Final fallback text-scan
        if (!found && rawText.toLowerCase().includes(phrase)) {
            found = true;
            const idx = rawText.toLowerCase().indexOf(phrase);
            descriptionSnippet = rawText.substring(Math.max(0, idx - 60), idx + phrase.length + 60);
        }
    }

    if (!postingDate) {
        const paragraphs = document.querySelectorAll("p, div, td");
        for (const p of paragraphs) {
            const text = (p.innerText || "").trim().toLowerCase();
            if (text.startsWith("posting date:")) {
                const strongNode = p.querySelector("strong");
                postingDate = strongNode ? strongNode.innerText.trim() : p.innerText.replace(/^posting date:\s*/i, '').trim();
            }
        }
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
    const rawItems = document.querySelectorAll("div.box-shadow, div.listingbox.ng-scope, div.listingbox, div.tender-item, table#searchedtenders tr, tr.tender-row, tr[class*='tender'], .card");
    const items = [...rawItems].filter(el => {
        const t = (el.innerText || "").toLowerCase();
        return t.length > 20 && !t.includes("type of tender") && !t.includes("th data") && (t.includes("tender") || t.includes("tot ref") || t.includes("deadline"));
    });

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
        "ul.pagination li a, .pagination a, .paginationnew a, nav a, a[rel='next'], a.next, li.nextclass a, li.next a, button.next, [aria-label*='Next'], [aria-label*='next']"
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
        visible: !!(btn.offsetWidth || btn.offsetHeight || btn.getClientRects().length)
    });

    console.log("[BEFORE NEXT]", {
        signature: beforeSignature,
        activePage: getCurrentPageNumber(),
        url: location.href
    });

    btn.scrollIntoView({ behavior: "instant", block: "center" });

    // Robust Angular Click Hydration
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    btn.click();

    // Explicit buffer to allow pagination AJAX to start clearing old DOM
    await new Promise(resolve => setTimeout(resolve, 2500));

    let lastSignature = null;
    let stableCount = 0;

    for (let attempt = 0; attempt < 40; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 500));

        const rawItems = document.querySelectorAll("div.box-shadow, div.listingbox.ng-scope, div.listingbox, div.tender-item, table#searchedtenders tr, tr.tender-row, tr[class*='tender'], .card");
        const items = [...rawItems].filter(el => {
            const t = (el.innerText || "").toLowerCase();
            return t.length > 20 && !t.includes("type of tender") && !t.includes("th data") && (t.includes("tender") || t.includes("tot ref") || t.includes("deadline"));
        });

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
                    pageNumber: getCurrentPageNumber() || 999
                };
            }
        }
    }

    return {
        clicked: true,
        changed: false,
        reason: "new_page_did_not_stabilize",
        beforeSignature,
        pageNumber: getCurrentPageNumber() || 999
    };
}
