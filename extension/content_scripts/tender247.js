chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extract_links") {
        const links = [...document.querySelectorAll("a[href*='/tender-details/']")].map(a => a.href);
        sendResponse({ links: [...new Set(links)] });
        return true;
    } else if (request.action === "click_next") {
        const els = [...document.querySelectorAll("a")].filter(a => a.innerText.includes("Next") || a.innerText.includes('›'));
        const next = els.find(el => el.offsetWidth > 0 && el.offsetHeight > 0);
        if (next) { next.click(); sendResponse({ clicked: true }); }
        else sendResponse({ clicked: false });
        return true;
    } else if (request.action === "extract_details") {
        try {
            const meta = document.querySelector("meta[name='description']");
            let brief = meta ? meta.content : "";
            if (!brief || brief.length < 30 || brief.toLowerCase().includes("procure.tender247.com")) {
                const caps = [...document.querySelectorAll(".capitalize")].map(el => el.innerText);
                brief = caps.find(c => c.length > 30 && !c.toLowerCase().includes("procure.tender247.com")) || "";
            }
            if (!brief) {
                const tds = [...document.querySelectorAll("td")];
                const matchTd = tds.find(td => /Tender Description|Work Description|Tender Brief|Brief/i.test(td.innerText));
                if (matchTd && matchTd.nextElementSibling) {
                    brief = matchTd.nextElementSibling.innerText;
                }
            }

            const fullText = document.body.innerText;
            const title = document.querySelector("h1")?.innerText || brief.substring(0, 250);

            const idMatch = fullText.match(/T247\s*ID\s*[:\-]?\s*(\S+)/i);
            const startMatch = fullText.match(/(?:Opening|Publish(?:ed)?)\s*Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
            const endMatch = fullText.match(/(?:Submission|Last|Closing|Due)\s*Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})/i);
            const locMatch = fullText.match(/([^,\n]+,\s*[^,\n]+,\s*India)/i);

            sendResponse({
                brief: brief.trim(),
                title: title.trim(),
                tender_id: idMatch ? idMatch[1] : "",
                start_date: startMatch ? startMatch[1] : "",
                end_date: endMatch ? endMatch[1] : "",
                location: locMatch ? locMatch[1] : ""
            });
        } catch (e) { sendResponse(null); }
        return true;
    }
});
