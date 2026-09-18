chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "extract_listings") {
        sendResponse(extractListings());
        return true;
    }
    if (request.action === "extract_details") {
        sendResponse(extractDetails(request.keyword || ""));
        return true;
    }
});

function extractListings() {
    const blocked = /unusual traffic|verify you are human|captcha|just a moment/i.test(
        `${document.title} ${document.body?.innerText || ""}`
    );
    if (blocked) return { status: "cloudflare" };

    const nodes = [...document.querySelectorAll("div.MjjYud, div.tF2Cxc, div.g, div.xpd")];
    const out = [];
    const seen = new Set();
    for (const node of nodes) {
        const h3 = node.querySelector("h3");
        const a = h3?.closest("a") || node.querySelector("a[href]");
        if (!h3 || !a) continue;
        let href = a.href;
        try { const u = new URL(href); if (u.hostname.includes("google.")) continue; } catch (_) { continue; }
        if (!/^https?:\/\//i.test(href) || seen.has(href)) continue;
        seen.add(href);
        const snippet = node.querySelector(".VwiC3b, .yXK7lf, .IsZvec, [data-sncf]")?.innerText || "";
        out.push({ title: h3.innerText.trim(), href, summary: snippet.trim() });
    }
    return out;
}

function extractDetails(keyword) {
    const text = document.body?.innerText || "";
    return { found: keyword ? text.toLowerCase().includes(keyword.toLowerCase()) : false, full_text_sample: text.slice(0, 1000) };
}
