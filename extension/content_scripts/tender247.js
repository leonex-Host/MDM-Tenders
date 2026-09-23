chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extract_grid") {
        try {
            const links = [...document.querySelectorAll("a[href*='/tender-details/']")].filter(a => !a.innerText.trim().toUpperCase().includes("BID NOW"));
            const results = links.map(a => {
                let card = a;
                for (let i = 0; i < 5; i++) {
                    if (card.parentElement && card.parentElement.innerText.includes("T247 ID")) card = card.parentElement;
                }
                const fullText = card.innerText || "";

                let title = a.innerText.trim();
                const idMatch = fullText.match(/T247\s*ID[\s-:]*(\d+)/i) || a.href.match(/(\d{8,11})/);
                const endMatch = fullText.match(/(\d{1,2}-\d{1,2}-\d{4})\s*\d+\s+Day/i) || fullText.match(/EMD.*?(\d{1,2}-\d{1,2}-\d{4})/i);
                const locMatch = fullText.match(/([^,\n]+,\s*[^,\n]+,\s*India)/i);

                let brief = "";
                const boqIdx = fullText.indexOf("Matching BOQ Items");
                if (boqIdx !== -1) {
                    brief = fullText.substring(boqIdx + 18).trim();
                } else {
                    brief = fullText.substring(0, 800);
                }

                return {
                    href: a.href.split("?")[0].split("#")[0],
                    title: title,
                    tender_id: idMatch ? idMatch[1] : a.href.split("/").pop(),
                    end_date: endMatch ? endMatch[1] : "",
                    location: locMatch ? locMatch[1] : "",
                    brief: brief
                };
            });
            sendResponse({ results });
        } catch (e) {
            sendResponse({ results: [] });
        }
        return true;
    } else if (request.action === "extract_links") {
    } else if (request.action === "click_next") {
        const els = [...document.querySelectorAll("a")].filter(a => a.innerText.includes("Next") || a.innerText.includes('›'));
        const next = els.find(el => el.offsetWidth > 0 && el.offsetHeight > 0);
        if (next) {
            sendResponse({ clicked: true });
            setTimeout(() => next.click(), 50);
        } else {
            sendResponse({ clicked: false });
        }
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
