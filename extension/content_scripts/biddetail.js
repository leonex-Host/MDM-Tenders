/**
 * BidDetail Content Script — Exact parity with biddetail_scraper.py
 * 
 * Python flow:
 * 1. Navigate to https://www.biddetail.com/global-tenders/%22{keyword}%22-tenders
 * 2. Click #drpDD dropdown → "Next 15 Days" → #btnFilterTender or input[value='SEARCH']
 * 3. Phase 1: Collect rows from div.tender_row across pages
 *    - Extract h2 a href + p.workDesc description + icon metadata (deadline, location, bdr_no)
 *    - Pagination via visible "Next" / a.pagination-next / a.next
 * 4. Phase 2: Visit each link (via background.js fetch)
 *    - Check Tender Brief from table rows
 *    - Extract table.table-bordered metadata
 *    - Keyword match in combined brief + metadata text
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

// ─── Phase 1: Apply filter + Extract listing rows ───
async function extractListings() {
    // Step 1: Apply date filter if not done yet (matches _set_date_filter_next_15_days)
    const hasFiltered = sessionStorage.getItem("bd_filtered");
    if (!hasFiltered) {
        const drpDD = document.getElementById("drpDD");
        if (drpDD) {
            drpDD.click();
            await sleep(1000);

            // Find "Next 15 Days" option
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

        // Click SEARCH button (matches _click_search_button)
        const searchBtn = document.getElementById("btnFilterTender") || document.querySelector("input[value='SEARCH']");
        if (searchBtn) {
            sessionStorage.setItem("bd_filtered", "1");
            searchBtn.click();
            return null; // Force background to poll again
        }
    }

    let listings = [];

    // matches: rows = self.driver.find_elements(By.CSS_SELECTOR, "div.tender_row")
    const rows = document.querySelectorAll("div.tender_row");

    for (const row of rows) {
        try {
            // matches: title_el = row.find_element(By.CSS_SELECTOR, "h2 a")
            const titleEl = row.querySelector("h2 a");
            let organization = "", href = "";
            if (titleEl) {
                organization = (titleEl.innerText || "").trim();
                href = titleEl.href || titleEl.getAttribute("href") || "";
                if (href && !href.startsWith("http")) {
                    href = "https://www.biddetail.com" + href;
                }
            }

            // matches: bdr_no, deadline, location from div.desc ul li with icon classes
            let bdr_no = "", deadline = "", location = "";
            const liItems = row.querySelectorAll("div.desc ul li");
            for (const li of liItems) {
                const html = li.innerHTML || "";
                const txt = (li.innerText || "").trim();
                if (html.includes("fa-clock-o")) deadline = txt;
                else if (html.includes("fa-map-marker")) location = txt;
                else if (html.includes("fa-hashtag")) bdr_no = txt;
            }

            // matches: desc_el = row.find_element(By.CSS_SELECTOR, "a.m-notice-text p.workDesc")
            let description = "";
            const descEl = row.querySelector("a.m-notice-text p.workDesc");
            if (descEl) description = (descEl.innerText || "").trim();

            if (!href) continue;

            // matches: final_title = description if description else organization
            let final_title = description || organization;
            if (final_title.length > 550) final_title = final_title.substring(0, 547) + "...";

            if (!listings.find(x => x.href === href)) {
                listings.push({
                    href,
                    bdr_no: bdr_no || href.split('/').pop(),
                    title: final_title,
                    description: organization ? `${organization} | ${description}` : description,
                    location,
                    deadline
                });
            }
        } catch (e) { }
    }

    return listings;
}

// ─── Pagination (matches _click_next) ───
async function clickNextPage(currentPage = 1) {
    try {
        const nextString = (currentPage + 1).toString();

        // matches: for sel in ["//a[contains(text(),'Next')]", "a.pagination-next", "a.next"]:
        //          els = self.driver.find_elements(by, sel)
        //          for el in els: if el.is_displayed() and el.is_enabled(): self.js_click(el)
        const candidates = document.querySelectorAll("a.pagination-next, a.next, a, button");
        for (const el of candidates) {
            if (!isVisible(el)) continue;
            const txt = (el.innerText || "").trim();
            if (txt.includes("Next") || txt.includes(">>") || txt === nextString) {
                el.click();

                // Clear DOM to force orchestrator wait
                const rows = document.querySelectorAll("div.tender_row");
                rows.forEach(r => r.remove());

                return true;
            }
        }
    } catch (e) { }
    return false;
}

// ─── Phase 2: Extract detail page (matches _visit_detail_page) ───
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

    // ── Extract Tender Brief (matches Python's XPath for Tender Brief table rows) ──
    let brief = "";
    const tds = root.querySelectorAll("td");
    for (let i = 0; i < tds.length; i++) {
        const txt = (tds[i].innerText || tds[i].textContent || "").trim();
        if (txt.includes("Tender Brief")) {
            // Get the next td sibling
            const next = tds[i].nextElementSibling || tds[i + 1];
            if (next) {
                const nextTxt = (next.innerText || next.textContent || "").trim();
                if (nextTxt.length > 5) {
                    brief = nextTxt;
                    break;
                }
            }
        }
    }

    // ── Extract all table metadata (matches Python's meta_data extraction) ──
    let meta_data = {};
    const tableRows = root.querySelectorAll("table.table-bordered tr");
    for (const tr of tableRows) {
        const cells = tr.querySelectorAll("td");
        if (cells.length >= 2) {
            const k = (cells[0].innerText || cells[0].textContent || "").replace(":", "").trim();
            const v = (cells[1].innerText || cells[1].textContent || "").trim();
            if (k && v && k.length < 50) {
                meta_data[k] = v;
            }
        }
    }

    // ── Keyword match in combined text (matches Python's combined_text check) ──
    const combinedText = (brief + " " + Object.values(meta_data).join(" ")).toLowerCase();
    if (!combinedText.includes(phrase)) {
        return { found: false };
    }

    // ── Extract fields ──
    let title = "";
    const h2 = root.querySelector("h2");
    if (h2) title = (h2.innerText || h2.textContent || "").trim();

    let tender_id = "";
    if (finalUrl) tender_id = finalUrl.split('/').pop().split('?')[0];

    const start_date = meta_data["Opening Date"] || meta_data["Start Date"] || "";
    const end_date = meta_data["Submission Date"] || meta_data["Closing Date"] || "";
    const location = meta_data["Location"] || "";

    return {
        found: true,
        title: title || brief.substring(0, 250),
        description: brief || title,
        tender_id: tender_id,
        start_date: start_date,
        end_date: end_date,
        location: location
    };
}

// ─── Helpers ───
function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
