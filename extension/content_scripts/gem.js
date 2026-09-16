/**
 * GEM Content Script — Exact parity with gem_scraper.py
 * 
 * Python flow:
 * 1. Navigate to https://bidplus.gem.gov.in/all-bids
 * 2. Type keyword in #searchBid, click #searchBidRA
 * 3. Sort by "Bid Start Date: Latest First" via #currentSort → #Bid-Start-Date-Latest
 * 4. Extract div.card elements (NO detail page visits)
 * 5. Paginate via visible Next/rel=next links
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "search_and_setup") {
        searchAndSetup(request.keyword).then(sendResponse);
        return true;
    }
    else if (request.action === "extract_listings") {
        extractListings(request.keyword).then(sendResponse);
        return true;
    }
    else if (request.action === "click_next_page") {
        clickNextPage(request.currentPage).then(sendResponse);
        return true;
    }
});

// ─── Step 1: Type keyword + Apply sorting (matches _search_keyword + _apply_sorting) ───
async function searchAndSetup(keyword) {
    try {
        // Wait for search box to appear
        for (let i = 0; i < 20; i++) {
            const box = document.getElementById("searchBid");
            if (box) break;
            await sleep(500);
        }

        // Type keyword into #searchBid (matches: box = wait.until(EC.presence_of_element_located((By.ID, "searchBid"))))
        const searchBox = document.getElementById("searchBid");
        if (!searchBox) return { success: false, reason: "searchBid not found" };

        searchBox.value = "";
        searchBox.focus();
        searchBox.value = keyword;
        // Dispatch input event so any JS listeners fire
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));

        await sleep(500);

        // Click search button (matches: search_btn = self.driver.find_element(By.ID, "searchBidRA"))
        const searchBtn = document.getElementById("searchBidRA");
        if (searchBtn) {
            searchBtn.click();
        }

        await sleep(4000);

        // Apply sorting (matches: _apply_sorting)
        const sortButton = document.getElementById("currentSort");
        if (sortButton) {
            const currentSort = sortButton.innerText.trim();
            if (!currentSort.includes("Bid Start Date: Latest First")) {
                sortButton.click();
                await sleep(1000);

                // Try by exact ID first (matches: latest_option = self.driver.find_element(By.ID, "Bid-Start-Date-Latest"))
                const latestOption = document.getElementById("Bid-Start-Date-Latest");
                if (latestOption && isVisible(latestOption)) {
                    latestOption.click();
                    await sleep(3000);
                } else {
                    // Fallback: find by text content
                    const allLinks = document.querySelectorAll("a, li, span");
                    for (const link of allLinks) {
                        if (link.innerText.includes("Bid Start Date: Latest First") && isVisible(link)) {
                            link.click();
                            await sleep(3000);
                            break;
                        }
                    }
                }
            }
        }

        return { success: true };
    } catch (e) {
        return { success: false, reason: e.message };
    }
}

// ─── Step 2: Extract cards (matches _extract_card) ───
async function extractListings(keyword) {
    if (document.title.includes("Just a moment") || (document.body && document.body.innerText.includes("Cloudflare"))) {
        return { status: "cloudflare" };
    }

    const phrase = (keyword || "").toLowerCase().trim();
    let listings = [];

    // matches: cards = self.find_all(By.CSS_SELECTOR, "div.card")
    const cards = document.querySelectorAll("div.card");

    for (const card of cards) {
        try {
            // matches: bid_no = self.text_of(card.find_element(By.CSS_SELECTOR, "a.bid_no_hover"))
            const bidNoEl = card.querySelector("a.bid_no_hover");
            if (!bidNoEl) continue;
            const bid_no = bidNoEl.innerText.trim();
            if (!bid_no) continue;

            // matches: link = card.find_element(By.CSS_SELECTOR, "a[data-toggle='popover']")
            //          items_text = self.attr_of(link, "data-content") or self.text_of(link)
            let items_text = "";
            const popoverLink = card.querySelector("a[data-toggle='popover']");
            if (popoverLink) {
                items_text = popoverLink.getAttribute("data-content") || popoverLink.innerText || "";
            }

            // matches: if not items_text or keyword.lower() not in items_text.lower(): return None
            if (!items_text || (phrase && !items_text.toLowerCase().includes(phrase))) {
                continue;
            }

            // matches: spans = card.find_elements(By.CSS_SELECTOR, "span.start_date")
            let start_date = "";
            const startSpans = card.querySelectorAll("span.start_date");
            if (startSpans.length > 0) start_date = startSpans[0].innerText.trim();

            let end_date = "";
            const endSpans = card.querySelectorAll("span.end_date");
            if (endSpans.length > 0) end_date = endSpans[0].innerText.trim();

            // matches: dept_divs = card.find_elements(By.CSS_SELECTOR, "div.col-md-4")
            let dept = "";
            const deptDivs = card.querySelectorAll("div.col-md-4");
            if (deptDivs.length > 0) dept = deptDivs[0].innerText.trim();

            // matches: quantity via regex
            let quantity = "";
            const cardText = card.innerText || "";
            const qtyMatch = cardText.match(/Quantity:\s*([\d,]+)/);
            if (qtyMatch) quantity = qtyMatch[1];

            listings.push({
                skip_details: true, // GEM NEVER visits detail pages
                title: items_text.substring(0, 500),
                description: items_text,
                tender_id: bid_no,
                location: dept,
                start_date: start_date,
                end_date: end_date,
                link: `https://bidplus.gem.gov.in/bidlists?bid_no=${bid_no}`,
                keyword: keyword,
                source: "gem"
            });
        } catch (e) { }
    }

    return listings;
}

// ─── Step 3: Pagination (matches _next_page) ───
async function clickNextPage(currentPage = 1) {
    try {
        const nextString = (currentPage + 1).toString();

        // matches: next_selectors = ["//a[contains(text(), 'Next')]", "//a[@rel='next']", "//li[@class='next']/a", "//button[contains(text(), 'Next')]"]
        const candidates = document.querySelectorAll("a[rel='next'], li.next a, a.page-link, button, a");
        for (const el of candidates) {
            if (!isVisible(el)) continue;
            const txt = (el.innerText || "").trim();
            const rel = el.getAttribute("rel") || "";

            if (txt.includes("Next") || rel === "next" || txt === "»" || txt === nextString) {
                el.click();

                // Clear DOM cards to force orchestrator to wait for AJAX reload
                const cards = document.querySelectorAll("div.card");
                cards.forEach(c => c.remove());

                return true;
            }
        }

        // Fallback: URL pattern approach (matches Python's URL #page- fallback)
        const currentUrl = window.location.href;
        if (currentUrl.includes("#page-")) {
            const pageMatch = currentUrl.match(/#page-(\d+)/);
            if (pageMatch) {
                const nextPage = parseInt(pageMatch[1]) + 1;
                window.location.href = currentUrl.replace(/#page-\d+/, `#page-${nextPage}`);
                await sleep(1000);

                const cards = document.querySelectorAll("div.card");
                cards.forEach(c => c.remove());

                return true;
            }
        }
    } catch (e) { }
    return false;
}

// ─── Helpers ───
function isVisible(el) {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}
