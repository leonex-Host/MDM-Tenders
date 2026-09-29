chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "check_page_available") {
        Promise.resolve(checkPageAvailable()).then(sendResponse);
        return true;
    }
    else if (request.action === "extract_listings") {
        Promise.resolve(extractListings()).then(data => {
            sendResponse(data);
        }).catch(e => { console.error("Extract Crash:", e); sendResponse([]); });
        return true;
    }
    else if (request.action === "extract_details") {
        Promise.resolve(extractDetails(request.keyword)).then(sendResponse);
        return true;
    }
    else if (request.action === "click_next_page") {
        Promise.resolve(clickNextPage()).then(sendResponse);
        return true;
    }
    else if (request.action === "click_filter_button") {
        Promise.resolve(clickFilterButton(request.keyword)).then(sendResponse);
        return true;
    }
});

function checkPageAvailable() {
    const title = document.title || "";
    const text = document.body?.innerText || "";
    const lowerText = text.toLowerCase();

    const cloudflareActive =
        /just a moment|checking your browser|verify you are human/i.test(title + " " + text) ||
        document.body.hasAttribute("data-captcha-silent");

    const hasNoResultsText =
        /\b(?:no results found|no records found|0 results|no data found|no tenders found|no records available)\b/i.test(lowerText);

    const url = window.location.href;
    const isSearchPage = /\/tenders\/advancesearch\b|\/advancesearch\b/i.test(url);

    const isReady = document.readyState === "complete" && !cloudflareActive;

    return {
        success: true,
        pageAvailable: isReady,
        readyState: document.readyState,
        title,
        url,
        cloudflareActive,
        hasNoResultsText
    };
}

async function clickFilterButton(keyword) {
    const visible = el => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const st = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden' && st.opacity !== '0' && !el.disabled;
    };

    const allInputs = [...document.querySelectorAll('input')].filter(visible);
    const input = allInputs.find(el => /search|keyword|query|q/i.test(`${el.name} ${el.id} ${el.placeholder}`))
        || allInputs.find(el => el.type === 'text' || el.type === 'search');

    if (!input) return { clicked: false, reason: 'search_input_not_found' };

    console.log("[TOT][FILTER] INPUT_FOUND");

    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (setter) setter.call(input, keyword || ''); else input.value = keyword || '';

    for (const type of ['input', 'change', 'keyup', 'blur']) {
        input.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    }

    if (input.value === keyword) {
        console.log("[TOT][FILTER] INPUT_VALUE_VERIFIED");
    }

    let target = document.querySelector("button.search-btn[onclick*='filterTendersJS']");
    if (!target || !visible(target)) {
        target = document.querySelector("[onclick*='filterTendersJS']");
    }

    if (!target || !visible(target)) {
        return { clicked: false, reason: "FILTER_SELECTOR_NOT_FOUND" };
    }

    console.log("[TOT][FILTER] BUTTON_FOUND");

    target.scrollIntoView({ block: 'center', inline: 'center' });
    target.focus();

    const md = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
    const mu = new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window });
    const clk = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });

    const beforeSignature = getListingSignature();

    target.dispatchEvent(md);
    target.dispatchEvent(mu);
    target.dispatchEvent(clk);
    console.log("[TOT][FILTER] CLICK_ONCE");
    console.log("[TOT][FILTER] WAITING_FOR_RESULTS");

    let elapsed = 0;
    let stableChecks = 0;
    let lastSignature = null;
    let signatureChanged = false;

    while (elapsed < 15000) {
        await new Promise(resolve => setTimeout(resolve, 500));
        elapsed += 500;

        let afterSignature = getListingSignature();
        if (afterSignature !== beforeSignature) {
            if (!signatureChanged) {
                console.log("[TOT][FILTER] RESULTS_CHANGED");
                signatureChanged = true;
            }
            if (afterSignature === lastSignature) {
                stableChecks++;
                if (stableChecks >= 2) {
                    console.log("[TOT][FILTER] RESULTS_STABLE");
                    return { clicked: true, changed: true, listingsReady: true };
                }
            } else {
                stableChecks = 0;
            }
            lastSignature = afterSignature;
        }
    }

    return {
        clicked: true,
        changed: signatureChanged,
        listingsReady: signatureChanged
    };
}

async function extractListings() {
    console.log("[TOT][LISTINGS] EXTRACT_START");
    if (document.title.includes("Just a moment") ||
        document.title.includes("Checking your browser") ||
        document.body.hasAttribute("data-captcha-silent")) {
        return { status: "cloudflare" };
    }

    let listings = [];

    const rawItems = document.querySelectorAll("div.box-shadow, div.listingbox.ng-scope, div.listingbox, div.tender-item, table#searchedtenders tr, tr.tender-row, tr[class*='tender'], .card");
    console.log(`[TOT][LISTINGS] rawItems count=${rawItems.length} title="${document.title}" url="${location.href.slice(0, 80)}"`);
    if (rawItems.length > 0) {
        const sample = rawItems[0];
        console.log(`[TOT][LISTINGS] sample[0] tag=${sample.tagName} class="${sample.className}" text="${(sample.innerText || "").slice(0, 80)}"`);
    }
    const items = [...rawItems].filter(el => {
        const t = (el.innerText || "").toLowerCase();
        const hasText = t.length > 20 && !t.includes("type of tender") && !t.includes("th data") && (t.includes("tender") || t.includes("tot ref") || t.includes("deadline"));
        if (hasText) return true;
        // Fallback: check raw innerHTML for any tender link
        const linkHTML = el.innerHTML || el.outerHTML || "";
        return /tenders?(?:-details)?\//i.test(linkHTML);
    });
    console.log(`[TOT][LISTINGS] filtered items=${items.length}`);

    items.forEach(item => {
        try {
            let title = "", href = "", deadline = "", tot_ref = "", country = "";

            const linkCandidates = [...item.querySelectorAll("a")];
            const validLinks = linkCandidates.filter(a => {
                const u = a.getAttribute("href") || a.getAttribute("ng-href") || "";
                return u.length > 5 && u !== "#" && u.toLowerCase() !== "javascript:void(0);";
            });

            const linkEl = validLinks.find(a => /tender/i.test(a.href || a.getAttribute("ng-href") || "")) || validLinks[0];

            if (linkEl) {
                title = linkEl.innerText.trim();
            }

            const itemHtml = item.outerHTML;
            const match = itemHtml.match(/(?:href|onclick|data-href|ng-href)=["']?([^"'>\s]*tenders?(?:-details)?\/[^"'>\s]+)["']?/i);

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

            if (!country) {
                const cMatch = item.innerText.match(/(India|USA|United Kingdom|Spain|Belgium|Korea|France)/i);
                if (cMatch) country = cMatch[1];
            }

            if (!title) {
                title = item.innerText.split('\n')[0].trim();
            }

            if (href && !listings.find(x => x.href === href)) {
                listings.push({ title, href, deadline, tot_ref, country });
            }
        } catch (e) { }
    });

    console.log("[TOT][LISTINGS] EXTRACTED count=" + listings.length);
    return listings;
}

async function extractDetails(keyword) {
    let found = false;
    let descriptionSnippet = "";
    let postingDate = "";

    // -- STRICT KEYWORD CHECK --
    // Targets the actual TenderOnTime DOM structure provided by user
    // e.g. <p>Summary: <strong class="strval">Actual Title Data</strong></p>
    if (keyword) {
        const kw = keyword.trim().toLowerCase();
        // Allow hyphen-space variants: "data standardization" matches "data-standardization"
        const kwPattern = kw.replace(/\s+/g, "[\\s\\-_]+");
        const kwRegex = new RegExp(kwPattern, "i");

        // 1. Check title tag
        const pageTitle = (document.title || "").toLowerCase();

        // 2. Extract actual tender summary/title from DOM
        let strvalText = "";
        const pTags = document.querySelectorAll("p");
        for (const p of pTags) {
            if (p.textContent.toLowerCase().includes("summary:")) {
                const strong = p.querySelector("strong.strval");
                if (strong) {
                    strvalText += " " + (strong.innerText || strong.textContent || "").trim();
                } else {
                    strvalText += " " + (p.innerText || p.textContent || "").replace(/summary:/i, "").trim();
                }
            }
        }

        if (kwRegex.test(pageTitle) || kwRegex.test(strvalText.toLowerCase())) {
            found = true;
        }
    } else {
        found = true; // No keyword = accept all
    }

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
    const rawItems = document.querySelectorAll(
        "div.box-shadow, div.listingbox.ng-scope, div.listingbox, div.tender-item, table#searchedtenders tr, tr.tender-row, tr[class*='tender'], .card"
    );
    const items = [...rawItems].filter(el => {
        const t = (el.innerText || "").toLowerCase();
        return t.length > 20 && !t.includes("type of tender") && !t.includes("th data") && (t.includes("tender") || t.includes("tot ref") || t.includes("deadline"));
    });

    const urls = [...items]
        .map(item => {
            const match = item.outerHTML.match(/(?:href|onclick|data-href|ng-href)=["']?([^"'>\s]*tenders?(?:-details)?\/[^"'>\s]+)["']?/i);
            if (match) return match[1];

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

    let signatureChanged = false;
    let afterSignature = null;
    let newPageNum = null;
    let elapsed = 0;

    // Dynamically poll for listing DOM restructuring
    while (elapsed < 12000) {
        await new Promise(resolve => setTimeout(resolve, 500));
        elapsed += 500;

        afterSignature = getListingSignature();
        if (afterSignature !== beforeSignature) {
            signatureChanged = true;
            newPageNum = getCurrentPageNumber();
            break;
        }
    }

    return {
        clicked: true,
        changed: signatureChanged,
        beforeSignature,
        afterSignature,
        pageNumber: newPageNum,
        reason: signatureChanged ? 'page_interaction_complete' : 'pagination_timeout'
    };
}
