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
                    // Try sorting by Closing Date
                    const sortBtn = document.querySelector(".fa-sort-amount-down, .fa-sort")?.closest("button");
                    if (sortBtn) {
                        sortBtn.click();
                        setTimeout(() => {
                            const sortOpts = [...document.querySelectorAll("a, span, li, button")];
                            const cDate = sortOpts.find(e => e.innerText && e.innerText.includes("Closing Date") && e.offsetWidth > 0);
                            if (cDate) cDate.click();
                        }, 250);
                    }

                    setTimeout(() => {
                        const btn = document.getElementById("btnFilterTender") || document.querySelector("input[value='SEARCH']");
                        sendResponse({ done: true });
                        if (btn) btn.click();
                    }, 500);
                }, 400);
            }, 200);
        } catch (e) { sendResponse({ done: false }); }
        return true;
    } else if (request.action === "extract_links") {
        const rows = [...document.querySelectorAll("div.tender_row, div.tender-item, .tender-row, div.card, .tender-card")];
        let results = [];
        rows.forEach(r => {
            const a = r.querySelector("a.tc-title, h2.tc-title a, a.m-brief, a.detail-link, h2 a, a[href*='tender'], a[href*='TenderNotice']");
            if (a && a.href) {
                const tIDElem = r.querySelector("small, span.m-tender-id, .tender-id");
                let due = "";
                const month = r.querySelector("span.month");
                const day = r.querySelector("span.day");
                const year = r.querySelector("span.year");
                const tcMeta = [...r.querySelectorAll("span.tc-meta-val")];
                if (month && day && year) {
                    due = `${month.innerText} ${day.innerText}, ${year.innerText}`;
                } else if (tcMeta.length > 0) {
                    due = tcMeta[0].innerText.trim();
                }

                let t_id = tIDElem ? tIDElem.innerText.trim() : "";
                if (t_id.includes("#")) t_id = t_id.replace("#", "").trim();

                const isClosedB = [...r.querySelectorAll(".labelReddanger, .badge")].find(x => x.innerText && x.innerText.includes("Closed"));
                if (isClosedB) {
                    return; // Skip closed tenders
                }

                const isLive = [...r.querySelectorAll(".labelGreensuccess, .badge")].find(x => x.innerText && x.innerText.match(/Live/i));
                const isUrgent = r.querySelector(".td-urgent");

                if (!isLive && !isUrgent) {
                    return; // Only take Live or Urgent tenders
                }

                results.push({
                    source: "tenderdetail",
                    href: a.href,
                    tender_id: t_id,
                    title: a.innerText.trim(),
                    description: (r.innerText || "").replace(/\n/g, ' ').substring(0, 480).trim(),
                    location: ((r.innerText || "").match(/Haryana|Pradesh|Delhi|Bengal|Maharashtra|Jharkhand|Gujarat|Rajasthan|Tamil|Karnataka|Assam|Punjab|Bihar|Odisha/i) || [""])[0],
                    value: ((r.innerText || "").match(/(?:₹|INR)?\s*[\d,]+\s*(?:Lakh|Crore|Cr|L|Thousand)/i) || [""])[0].trim(),
                    start_date: "",
                    end_date: due
                });
            }
        });
        sendResponse({ results });
        return true;
    } else if (request.action === "click_next") {
        const els = [...document.querySelectorAll("a")];
        const next = els.find(el => (el.innerText.includes("Next") || el.innerText.includes("›")) && el.offsetWidth > 0);
        if (next) {
            sendResponse({ clicked: true });
            setTimeout(() => next.click(), 50);
        } else {
            sendResponse({ clicked: false });
        }
        return true;
    } else if (request.action === "extract_details") {
        try {
            const briefDiv = document.querySelector("#overview, .tender-overview") || [...document.querySelectorAll("div")].find(d =>
                (d.className && typeof d.className === 'string' && (d.className.includes("brief") || d.className.includes("tender-brief"))) ||
                (d.innerText && d.innerText.toLowerCase() === "tender brief")
            );

            let brief = briefDiv ? (briefDiv.id === 'overview' ? briefDiv.innerText : (briefDiv.nextElementSibling ? briefDiv.nextElementSibling.innerText : briefDiv.innerText)) : "";

            const titleEl = document.querySelector(".dh-header h1, h2.workDesc strong, h1, h2, .tender-title");
            const title = titleEl ? titleEl.innerText : "";

            const txt = document.body.innerText;
            const startM = txt.match(/(?:Start|Publish|Publication)\s*Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
            const locM = txt.match(/LOCATION\s*\/\s*STATE.*?\n(.*?)\n/i) || txt.match(/Location[:\s]*([^,\n]+(?:,\s*[^,\n]+)*)/i);

            sendResponse({
                brief: brief.trim(),
                title: title.trim(),
                start_date: startM ? startM[1].trim() : "",
                location: locM ? locM[1].trim() : ""
            });
        } catch (e) { sendResponse(null); }
        return true;
    }
});
