chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "setup_search") {
        try {
            const sbInput = document.getElementById("searchBid");
            if (sbInput) sbInput.value = request.keyword;

            const btn = document.getElementById("searchBidRA");
            if (btn) btn.click();

            setTimeout(() => {
                const sortBtn = document.getElementById("currentSort");
                if (sortBtn) {
                    if (sortBtn.innerText.includes("Bid Start Date: Latest First")) {
                        sendResponse({ done: true });
                        return;
                    }
                    sortBtn.click();
                    setTimeout(() => {
                        const opt = document.getElementById("Bid-Start-Date-Latest") ||
                            [...document.querySelectorAll("a")].find(x => x.innerText.includes("Bid Start Date: Latest First"));
                        if (opt) opt.click();
                        sendResponse({ done: true });
                    }, 1000);
                } else sendResponse({ done: true });
            }, 1000);
        } catch (e) { sendResponse({ done: false }); }
        return true;
    } else if (request.action === "extract_cards") {
        const keyword = request.keyword.toLowerCase();
        const cards = document.querySelectorAll("div.card");
        let results = [];

        cards.forEach(c => {
            const bidEl = c.querySelector("a.bid_no_hover");
            const bid_no = bidEl ? bidEl.innerText.trim() : "";

            const popover = c.querySelector("a[data-toggle='popover']");
            const items_text = popover ? (popover.getAttribute("data-content") || popover.innerText) : "";

            if (items_text.toLowerCase().includes(keyword)) {
                let start_date = "", end_date = "";
                const sspan = c.querySelector("span.start_date");
                if (sspan) start_date = sspan.innerText.trim();
                const espan = c.querySelector("span.end_date");
                if (espan) end_date = espan.innerText.trim();

                let dept = "";
                const ddiv = c.querySelector("div.col-md-4");
                if (ddiv) dept = ddiv.innerText.trim();

                results.push({
                    source: "gem",
                    tender_id: bid_no,
                    title: items_text.substring(0, 500),
                    description: items_text,
                    location: dept,
                    start_date, end_date,
                    link: `https://bidplus.gem.gov.in/bidlists?bid_no=${bid_no}`,
                    keyword: request.keyword
                });
            }
        });

        sendResponse({ results });
        return true;
    } else if (request.action === "click_next") {
        const els = [...document.querySelectorAll("a, button, li")];
        const next = els.find(el => {
            const hasNextText = (el.innerText || "").includes("Next") || el.getAttribute("rel") === "next" || (el.innerText || "").includes("»");
            if (!hasNextText) return false;
            if (el.offsetWidth === 0 || el.offsetHeight === 0) return false;
            if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
            if (el.classList && el.classList.contains("disabled")) return false;
            if (el.parentElement && el.parentElement.classList && el.parentElement.classList.contains("disabled")) return false;
            // If it's an <li> tag itself containing a disabled state, catching it securely
            return true;
        });

        if (next) {
            // In case the detected element is an li wrapper, click its inner anchor gracefully
            const clickableNode = next.querySelector("a, button") || next;
            clickableNode.click();
            sendResponse({ clicked: true });
        } else {
            sendResponse({ clicked: false });
        }
        return true;
    }
});
