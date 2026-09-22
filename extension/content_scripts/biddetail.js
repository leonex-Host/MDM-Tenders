chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "setup_search") {
        (async () => {
            try {
                // Step 1: Open the daterangepicker dropdown
                const drpDD = document.getElementById("drpDD");
                if (drpDD) drpDD.click();
                await new Promise(r => setTimeout(r, 800));

                // Step 2: Find "This Month" in the daterangepicker preset ranges
                let thisMonthClicked = false;
                const rangeItems = [...document.querySelectorAll(".ranges li, .daterangepicker li, .ranges ul li")];
                for (const li of rangeItems) {
                    const text = (li.innerText || "").trim().toLowerCase();
                    if (text === "this month" || text.includes("this month")) {
                        li.click();
                        thisMonthClicked = true;
                        console.log("[BidDetail] Clicked 'This Month' in daterangepicker");
                        break;
                    }
                }

                // Fallback: try button/anchor elements with "This Month" text
                if (!thisMonthClicked) {
                    const allEls = [...document.querySelectorAll("a, button, span, li, div")];
                    const match = allEls.find(e => {
                        const t = (e.innerText || "").trim();
                        return t === "This Month" && e.offsetWidth > 0 && e.offsetHeight > 0;
                    });
                    if (match) {
                        match.click();
                        thisMonthClicked = true;
                        console.log("[BidDetail] Clicked 'This Month' via fallback selector");
                    }
                }

                await new Promise(r => setTimeout(r, 500));

                // Step 3: Click the Apply button if daterangepicker has one
                const applyBtn = document.querySelector(".daterangepicker .applyBtn, .daterangepicker button.applyBtn, .daterangepicker .btn-success");
                if (applyBtn && applyBtn.offsetWidth > 0) {
                    applyBtn.click();
                    console.log("[BidDetail] Clicked Apply button in daterangepicker");
                    await new Promise(r => setTimeout(r, 500));
                }

                // Step 4: Click the SEARCH button
                const searchBtn = document.getElementById("btnFilterTender") || document.querySelector("input[value='SEARCH']");
                if (searchBtn) {
                    searchBtn.click();
                    console.log("[BidDetail] Clicked SEARCH button");
                }

                sendResponse({ done: true, thisMonthClicked, searchClicked: !!searchBtn });
            } catch (e) {
                console.error("[BidDetail] setup_search error:", e);
                sendResponse({ done: false, error: String(e) });
            }
        })();
        return true;
    } else if (request.action === "extract_links") {
        const rows = document.querySelectorAll("div.tender_row");
        let results = [];
        rows.forEach(r => {
            const a = r.querySelector("h2 a") || r.querySelector("a");
            if (a && a.href) {
                const org = a.innerText.trim();
                const descEl = r.querySelector("a.m-notice-text p.workDesc");
                const desc = descEl ? descEl.innerText.trim() : "";

                let bdr_no = "", deadline = "", location = "";
                const items = r.querySelectorAll("div.desc ul li");
                items.forEach(i => {
                    if (i.innerHTML.includes("fa-clock-o")) deadline = i.innerText.trim();
                    else if (i.innerHTML.includes("fa-map-marker")) location = i.innerText.trim();
                    else if (i.innerHTML.includes("fa-hashtag")) bdr_no = i.innerText.trim();
                });

                results.push({
                    href: a.href.startsWith("http") ? a.href : "https://www.biddetail.com" + a.href,
                    organization: org,
                    description: desc,
                    bdr_no, deadline, location
                });
            }
        });
        sendResponse({ results });
        return true;
    } else if (request.action === "click_next") {
        const els = [...document.querySelectorAll("a.pagination-next, a.next, a")];
        const next = els.find(el => el.innerText.includes("Next") && el.offsetWidth > 0 && el.offsetHeight > 0 && !el.disabled);
        if (next) {
            if (!next.id) next.id = "mdm-next-" + Date.now();
            sendResponse({ clicked: true, clickId: next.id });
        } else {
            sendResponse({ clicked: false });
        }
        return true;
    } else if (request.action === "extract_details") {
        try {
            let brief = "";
            const tds = [...document.querySelectorAll("td")];
            const briefTd = tds.find(t => t.innerText && t.innerText.includes("Tender Brief"));
            if (briefTd) {
                const row = briefTd.closest("tr");
                if (row) {
                    const allTdsInRow = row.querySelectorAll("td");
                    if (allTdsInRow.length >= 2) brief = allTdsInRow[1].innerText.trim();
                    else brief = briefTd.nextElementSibling ? briefTd.nextElementSibling.innerText.trim() : "";
                }
            }

            let meta = {};
            document.querySelectorAll("table.table-bordered tr").forEach(tr => {
                const rtds = tr.querySelectorAll("td");
                if (rtds.length >= 2) {
                    let k = rtds[0].innerText.replace(':', '').trim();
                    let v = rtds[1].innerText.trim();
                    if (k && v) meta[k] = v;
                }
            });

            sendResponse({ brief, meta });
        } catch (e) { sendResponse(null); }
        return true;
    }
});
