/**
 * Tender247 Content Script — Exact parity with tender247_scraper.py
 * 
 * Python flow:
 * 1. Navigate to https://www.tender247.com/keyword/{kw}+tenders
 * 2. Phase 1: Collect all a[href*='/tender-details/'] links across pages
 *    - Pagination via visible "Next" or "›" links
 * 3. Phase 2: Visit each detail link (handled by background.js fetch)
 *    - Check meta description, .capitalize, table Tender Brief/Work Description/.workDesc
 *    - Strict keyword match in brief only
 *    - Extract h1 title, T247 ID, dates regex, location regex
 */

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

// ─── Phase 1: Collect links (matches _get_all_links) ───
async function extractListings() {
    if (document.title.includes("Just a moment") || (document.body && document.body.innerText.includes("Cloudflare"))) {
        return { status: "cloudflare" };
    }

    let listings = [];

    // matches: els = self.driver.find_elements(By.XPATH, "//a[contains(@href,'/tender-details/')]")
    const links = document.querySelectorAll("a[href*='/tender-details/']");
    links.forEach(link => {
        try {
            const href = link.href;
            if (href && !listings.find(x => x.href === href)) {
                listings.push({ href });
            }
        } catch (e) { }
    });

    return listings;
}

// ─── Pagination (matches _get_all_links pagination loop) ───
async function clickNextPage(currentPage = 1) {
    try {
        const nextString = (currentPage + 1).toString();

        // matches: for sel in ["//a[contains(text(),'Next')]", "//a[contains(text(),'›')]"]:
        //          btns = self.driver.find_elements(By.XPATH, sel)
        //          for btn in btns: if btn.is_displayed(): self.js_click(btn)
        const candidates = document.querySelectorAll("a, button");
        for (const el of candidates) {
            if (!isVisible(el)) continue;
            const txt = (el.innerText || "").trim();
            if (txt.includes("Next") || txt.includes("›") || txt.includes(">>") || txt === nextString) {
                el.click();

                // Clear DOM to force orchestrator wait
                const detailLinks = document.querySelectorAll("a[href*='/tender-details/']");
                detailLinks.forEach(l => l.remove());

                return true;
            }
        }
    } catch (e) { }
    return false;
}

// ─── Phase 2: Extract detail page (matches _check_tender) ───
async function extractDetails(keyword, htmlString = null, finalUrl = null) {
    let root = document;
    let b = document.body;

    if (htmlString) {
        const parser = new DOMParser();
        root = parser.parseFromString(htmlString, 'text/html');
        root.querySelectorAll("script, style, noscript, svg").forEach(el => el.remove());
        b = root.body;
    }

    const rawText = (b.innerText || b.textContent || "");
    const phrase = keyword.toLowerCase().trim();

    // ── Extract brief (matches Python's 3-step brief extraction) ──
    let brief = "";

    // Step 1: meta description (matches: meta = self.driver.find_element(By.XPATH, "//meta[@name='description']"))
    const meta = root.querySelector("meta[name='description']");
    if (meta) {
        const content = meta.getAttribute("content") || "";
        if (content.length > 30 && !content.toLowerCase().includes("procure.tender247.com")) {
            brief = content.replace("Tender for", "").trim().substring(0, 500);
        }
    }

    // Step 2: .capitalize class (matches: els = self.driver.find_elements(By.CSS_SELECTOR, ".capitalize"))
    if (!brief) {
        const caps = root.querySelectorAll(".capitalize");
        for (const el of caps) {
            const txt = (el.innerText || el.textContent || "").trim();
            if (txt.length > 30 && !txt.toLowerCase().includes("procure.tender247.com")) {
                brief = txt.substring(0, 500);
                break;
            }
        }
    }

    // Step 3: Table fallbacks (matches Python's fallback_xpaths)
    if (!brief) {
        const labels = ["Tender Description", "Work Description", "Tender Brief", "Brief"];
        const tds = root.querySelectorAll("td, div");
        for (const td of tds) {
            const txt = (td.innerText || td.textContent || "").trim();
            for (const label of labels) {
                if (txt.includes(label)) {
                    const next = td.nextElementSibling;
                    if (next) {
                        const nextTxt = (next.innerText || next.textContent || "").trim();
                        if (nextTxt.length > 30 && !nextTxt.toLowerCase().includes("procure.tender247.com")) {
                            brief = nextTxt.substring(0, 500);
                            break;
                        }
                    }
                }
            }
            if (brief) break;
        }
    }

    // Step 3b: .workDesc fallback
    if (!brief) {
        const workDesc = root.querySelector(".workDesc");
        if (workDesc) {
            brief = (workDesc.innerText || workDesc.textContent || "").trim();
        }
    }

    // ── Strict keyword match in brief only (matches Python's strict check) ──
    if (!brief) return { found: false };
    if (!brief.toLowerCase().includes(phrase)) return { found: false };

    // ── Extract fields ──
    let title = "";
    const h1 = root.querySelector("h1");
    if (h1) title = (h1.innerText || h1.textContent || "").trim();

    // T247 ID (matches: tender_id = self._extract(full_text, r"T247\s*ID\s*[:\-]?\s*(\S+)"))
    let tender_id = "";
    const idMatch = rawText.match(/T247\s*ID\s*[:\-]?\s*(\S+)/i);
    if (idMatch) tender_id = idMatch[1];
    else if (finalUrl) tender_id = finalUrl.split('/').pop().split('?')[0];

    // Dates (exact same regex as Python)
    let start_date = "";
    const stMatch = rawText.match(/(?:Opening|Publish(?:ed)?)\s*Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
    if (stMatch) start_date = stMatch[1];

    let end_date = "";
    const endMatch = rawText.match(/(?:Submission|Last|Closing|Due)\s*Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
    if (endMatch) end_date = endMatch[1];

    // Location
    let location = "";
    const locMatch = rawText.match(/([^,\n]+,\s*[^,\n]+,\s*India)/i);
    if (locMatch) location = locMatch[1];

    return {
        found: true,
        title: title || brief.substring(0, 250),
        description: brief || title,
        tender_id: tender_id,
        start_date: start_date,
        end_date: end_date,
        location: location,
        link: finalUrl || ""
    };
}

// ─── Helpers ───
function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}
