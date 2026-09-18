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
        const rows = [...document.querySelectorAll("div.tender_row, div.tender-item, .tender-row")];
        let results = [];
        rows.forEach(r => {
            const a = r.querySelector("a.m-brief, a.detail-link, h2 a, a[href*='tender']");
            if (a && a.href) {
                const tIDElem = r.querySelector("span.m-tender-id, .tender-id");
                let due = "";
                const month = r.querySelector("span.month"), day = r.querySelector("span.day"), year = r.querySelector("span.year");
                if (month && day && year) due = `${month.innerText} ${day.innerText}, ${year.innerText}`;
                results.push({
                    href: a.href,
                    tender_id: tIDElem ? tIDElem.innerText.trim() : "",
                    due_date: due
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
            const briefDiv = [...document.querySelectorAll("div")].find(d =>
                (d.className && typeof d.className === 'string' && (d.className.includes("brief") || d.className.includes("tender-brief"))) ||
                (d.innerText && d.innerText.toLowerCase() === "tender brief")
            );

            let brief = briefDiv ? (briefDiv.nextElementSibling ? briefDiv.nextElementSibling.innerText : briefDiv.innerText) : "";

            const titleEl = document.querySelector("h2.workDesc strong, h1, h2, .tender-title");
            const title = titleEl ? titleEl.innerText : "";

            const txt = document.body.innerText;
            const startM = txt.match(/(?:Start|Publish|Publication)\s*Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
            const locM = txt.match(/Location[:\s]*([^,\n]+(?:,\s*[^,\n]+)*)/i);

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
