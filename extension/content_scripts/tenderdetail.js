/**
 * TenderDetail Content Script — Exact parity with tenderdetail_scraper.py
 * 
 * Python flow:
 * 1. Navigate to https://www.tenderdetail.com/Indian-tender/%22{keyword}%22-tenders
 * 2. Click #drpDD dropdown → select "Next 15 Days" → click #btnFilterTender SEARCH
 * 3. Find rows: div.tender_row, div.tender-item, .tender-row
 * 4. For each row: extract link from a.m-brief, a.detail-link, h2 a
 * 5. Visit detail page (via background fetch), check .brief/.tender-brief for keyword
 * 6. Pagination: visible "Next"/"›"/a.next/li.next a/a[rel='next']
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

// ─── Extract listing rows (with filter application on first call) ───
async function extractListings() {
    // Step 1: Apply date filter if not done yet
    // matches: _set_date_filter_next_15_days() + _click_search_button()
    const hasFiltered = sessionStorage.getItem("td_filtered");
    if (!hasFiltered) {
        // Click #drpDD date dropdown
        const drpDD = document.getElementById("drpDD");
        if (drpDD) {
            drpDD.click();
            await sleep(1000);

            // Find and click "Next 15 Days"
            // matches Python's XPath list: //a[contains(text(), 'Next 15 Days')], //li, //span, etc.
            const allElements = document.querySelectorAll("a, li, span, div");
            for (const opt of allElements) {
                const txt = (opt.innerText || "").trim();
                if ((txt.includes("Next 15 Days") || txt === "15 Days") && isVisible(opt)) {
                    opt.click();
                    await sleep(1000);
                    break;
                }
            }
        }

        // Click SEARCH button
        // matches: search_btn = self.driver.find_element(By.ID, "btnFilterTender")
        const searchBtn = document.getElementById("btnFilterTender") || document.querySelector("input[value='SEARCH']");
        if (searchBtn) {
            sessionStorage.setItem("td_filtered", "1");
            searchBtn.click();
            return null; // Force background to poll again after filter applied
        }
    }

    let listings = [];

    // matches: selectors = ["div.tender_row", "div.tender-item", "div.search-result div.list div.tender_row", ".tender-row"]
    const rows = document.querySelectorAll("div.tender_row, div.tender-item, .tender-row, div[class*='tender_row']");

    for (const row of rows) {
        try {
            let href = "";

            // matches: selectors = ["a.m-brief", "a.detail-link", "h2 a", "a[href*='tender']"]
            const linkSelectors = ["a.m-brief", "a.detail-link", "h2 a", "a[href*='tender']"];
            for (const sel of linkSelectors) {
                const linkEl = row.querySelector(sel);
                if (linkEl) {
                    href = linkEl.href || linkEl.getAttribute("href") || "";
                    if (href && !href.startsWith("http")) {
                        href = "https://www.tenderdetail.com" + href;
                    }
                    break;
                }
            }

            // Extract tender ID from row (matches _extract_tender_id_from_row)
            let tender_id = "";
            const idSelectors = ["span.m-tender-id", ".tender-id", "[class*='tender-id']"];
            for (const sel of idSelectors) {
                const idEl = row.querySelector(sel);
                if (idEl) { tender_id = (idEl.innerText || "").trim(); break; }
            }

            // Extract due date from row (matches _extract_due_date_from_row)
            let due_date = "";
            const month = getChildText(row, "span.month");
            const day = getChildText(row, "span.day");
            const year = getChildText(row, "span.year");
            if (month && day && year) due_date = `${month} ${day}, ${year}`;

            if (href && !listings.find(x => x.href === href)) {
                listings.push({ href, tender_id, due_date });
            }
        } catch (e) { }
    }

    return listings;
}

// ─── Pagination (matches _next_page) ───
async function clickNextPage(currentPage = 1) {
    try {
        const nextString = (currentPage + 1).toString();

        // matches: next_selectors = ["//a[contains(text(), 'Next')]", "//a[contains(text(), '›')]",
        //          "//a[contains(@class, 'next')]", "//li[@class='next']/a", "//a[@rel='next']"]
        const candidates = document.querySelectorAll("a[rel='next'], li.next a, a.next, a, button");
        for (const el of candidates) {
            if (!isVisible(el)) continue;
            const txt = (el.innerText || "").trim();
            const rel = el.getAttribute("rel") || "";
            if (txt.includes("Next") || txt.includes("›") || txt.includes(">>") || rel === "next" || txt === nextString) {
                el.click();

                // Clear DOM to force orchestrator wait
                const rows = document.querySelectorAll("div.tender_row, div.tender-item, .tender-row");
                rows.forEach(r => r.remove());

                return true;
            }
        }
    } catch (e) { }
    return false;
}

// ─── Extract detail page (matches _check_tender_brief + _extract_title + _extract_start_date) ───
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

    // ── Check Tender Brief (matches _check_tender_brief) ──
    let brief = "";
    let found = false;

    // matches: brief_selectors = ["//div[contains(@class,'brief')]", "//div[contains(@class,'tender-brief')]",
    //          "//label[contains(text(),'Tender Brief')]/following-sibling::div", ...]
    const briefEls = root.querySelectorAll(".brief, .tender-brief, div[class*='brief']");
    for (const el of briefEls) {
        const txt = (el.innerText || el.textContent || "").trim();
        if (txt.length > 20 && txt.toLowerCase().includes(phrase)) {
            found = true;
            const idx = txt.toLowerCase().indexOf(phrase);
            brief = txt.substring(Math.max(0, idx - 60), Math.min(txt.length, idx + phrase.length + 60));
            break;
        }
    }

    // Fallback: look in table rows for "Tender Brief" label
    if (!found) {
        const tds = root.querySelectorAll("td, div, label");
        for (const td of tds) {
            const txt = (td.innerText || td.textContent || "").trim();
            if (txt === "Tender Brief" || txt.includes("Tender Brief")) {
                const next = td.nextElementSibling;
                if (next) {
                    const nextTxt = (next.innerText || next.textContent || "").trim();
                    if (nextTxt.length > 20 && nextTxt.toLowerCase().includes(phrase)) {
                        found = true;
                        const idx = nextTxt.toLowerCase().indexOf(phrase);
                        brief = nextTxt.substring(Math.max(0, idx - 60), Math.min(nextTxt.length, idx + phrase.length + 60));
                        break;
                    }
                }
            }
        }
    }

    if (!found) return { found: false };

    // ── Extract fields ──
    // matches: selectors = ["h2.workDesc strong", "h1", "h2", ".tender-title"]
    let title = "";
    const titleSelectors = ["h2.workDesc strong", "h1", "h2", ".tender-title"];
    for (const sel of titleSelectors) {
        const el = root.querySelector(sel);
        if (el) { title = (el.innerText || el.textContent || "").trim(); break; }
    }

    let tender_id = "";
    if (finalUrl) tender_id = finalUrl.split('/').pop().split('?')[0];

    // matches: _extract_start_date regex
    let start_date = "";
    const stMatch = rawText.match(/(?:Start|Publish|Publication)\s*Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
    if (stMatch) start_date = stMatch[1];

    // matches: _extract_location regex
    let location = "";
    const locMatch = rawText.match(/Location[:\s]*([^,\n]+(?:,\s*[^,\n]+)*)/i);
    if (locMatch) location = locMatch[1].trim();

    return {
        found: true,
        title: title || brief.substring(0, 250),
        description: brief || title,
        tender_id: tender_id,
        start_date: start_date,
        end_date: "",
        location: location
    };
}

// ─── Helpers ───
function getChildText(parent, selector) {
    try {
        const el = parent.querySelector(selector);
        return el ? (el.innerText || "").trim() : "";
    } catch (e) { return ""; }
}

function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
