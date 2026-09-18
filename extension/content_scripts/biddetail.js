chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "setup_search") {
        try {
            const drpDD = document.getElementById("drpDD");
            if (drpDD) drpDD.click();
            setTimeout(() => {
                const els = [...document.querySelectorAll("a, li, span, div")];
                const next15 = els.find(e => e.innerText && e.innerText.includes("Next 15 Days") && e.offsetWidth > 0);
                if (next15) next15.click();
                setTimeout(() => {
                    const btn = document.getElementById("btnFilterTender") || document.querySelector("input[value='SEARCH']");
                    sendResponse({ done: true });
                    if (btn) {
                        setTimeout(() => btn.click(), 50);
                    }
                }, 1000);
            }, 500);
        } catch (e) { sendResponse({ done: false }); }
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
            sendResponse({ clicked: true });
            setTimeout(() => next.click(), 50);
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
