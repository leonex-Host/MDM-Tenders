chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "check_page_available") {
        sendResponse(checkPageAvailable());
        return true;
    }
    if (request.action === "extract_listings") {
        sendResponse(extractListings());
        return true;
    }
    if (request.action === "extract_details") {
        sendResponse(extractDetails(request.keywords || [request.keyword]));
        return true;
    }
});

function pageText() {
    return (document.body?.innerText || "").replace(/\s+/g, " ").trim();
}

function checkPageAvailable() {
    const title = document.title || "";
    const text = pageText();
    const html = document.documentElement?.innerHTML || "";
    const blocked = /unusual traffic|verify you are human|captcha|our systems have detected/i.test(text + " " + title) ||
        /g-recaptcha|recaptcha/i.test(html);
    return {
        success: true,
        pageAvailable: document.readyState === "complete",
        readyState: document.readyState,
        title,
        url: location.href,
        cloudflareActive: blocked,
        hasNoResultsText: /did not match any documents|no results found/i.test(text)
    };
}

function canonicalize(url) {
    try {
        const u = new URL(url);
        if (!/^https?:$/.test(u.protocol)) return null;
        u.hash = "";
        ["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid"].forEach(k => u.searchParams.delete(k));
        return u.href;
    } catch { return null; }
}

function extractListings() {
    const check = checkPageAvailable();
    if (check.cloudflareActive) return { status: "cloudflare" };
    const selectors = [
        "div.MjjYud", "div.tF2Cxc", "div.g", "div.xpd",
        "div[data-snhf]", "div[data-ved]"
    ];
    const nodes = [...new Set(selectors.flatMap(s => [...document.querySelectorAll(s)]))];
    const listings = [];
    const seen = new Set();

    for (const node of nodes) {
        const h3 = node.querySelector("h3");
        if (!h3) continue;
        const a = h3.closest("a") || node.querySelector("a[href]");
        if (!a) continue;
        const href = canonicalize(a.href);
        if (!href || /(^|\.)google\.[^/]+$/i.test(new URL(href).hostname)) continue;
        const title = h3.innerText.trim();
        if (!title || seen.has(href)) continue;
        seen.add(href);
        const snippet = node.querySelector(".VwiC3b, .IsZvec, .yXK7lf, [data-sncf], div[style*='line-clamp']")?.innerText?.trim() || "";
        listings.push({ title, href, summary: snippet });
    }
    return listings;
}

function extractDetails(keywords = []) {
    const text = pageText();
    const lower = text.toLowerCase();
    const usable = [...new Set((keywords || []).filter(Boolean).map(x => String(x).trim()).filter(Boolean))];
    const matched = usable.filter(k => lower.includes(k.toLowerCase()));
    return {
        found: matched.length > 0,
        matched_keywords: matched,
        keyword_found_on_page: matched.length > 0,
        page_excerpt: text.substring(0, 1000),
        full_text_sample: text.substring(0, 1000),
        checked_url: location.href
    };
}
