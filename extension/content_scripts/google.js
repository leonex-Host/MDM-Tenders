(() => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const bodyText = () => document.body?.innerText || "";
  const blocked = () => {
    const t = `${document.title}\n${bodyText()}`.toLowerCase();
    return /unusual traffic|our systems have detected|captcha|not a robot|sorry\.google\.com|verify you are human/.test(t);
  };
  const isGoogleInternal = href => {
    try {
      const u = new URL(href, location.href);
      return u.hostname.endsWith('google.com') || u.hostname.endsWith('google.co.in') || u.protocol === 'javascript:';
    } catch { return true; }
  };
  const resultNodes = () => [...document.querySelectorAll('div.MjjYud, div.g, div.Gx5Zad, div.xpd')];
  const getResults = () => {
    const out = [], seen = new Set();
    for (const node of resultNodes()) {
      const h3 = node.querySelector('h3');
      const a = h3?.closest('a') || node.querySelector('a[href]');
      if (!h3 || !a) continue;
      const href = a.href;
      if (!href || isGoogleInternal(href) || seen.has(href)) continue;
      seen.add(href);
      const snippet = node.querySelector('.VwiC3b, .yXK7lf, .IsZvec, .st, [data-sncf], div[style*="line-clamp"]');
      out.push({ title: h3.innerText.trim(), href, summary: snippet?.innerText?.trim() || node.innerText.replace(h3.innerText, '').trim().slice(0, 1000) });
    }
    return out;
  };
  const signature = () => getResults().slice(0, 10).map(x => x.href).join('|');
  function checkPageAvailable() {
    const t = bodyText().toLowerCase();
    return { success:true, pageAvailable:!blocked(), readyState:document.readyState, title:document.title, url:location.href, cloudflareActive:blocked(), hasNoResultsText:/did not match any documents|no results found/.test(t), resultCount:getResults().length };
  }
  async function clickNextPage() {
    const btn = document.querySelector('a#pnnext, a[aria-label="Next page"], a[aria-label="Next"]');
    if (!btn) return {clicked:false, changed:false, reason:'next_button_not_found'};
    const before = signature(); btn.scrollIntoView({block:'center'}); btn.click();
    for (let i=0;i<40;i++) { await sleep(500); if (blocked()) return {clicked:true,changed:false,reason:'blocked'}; const after=signature(); if(after && after!==before) return {clicked:true,changed:true,beforeSignature:before,afterSignature:after}; }
    return {clicked:true,changed:false,reason:'new_page_did_not_stabilize',beforeSignature:before};
  }
  async function extractDetails(keyword) { const text=bodyText(); return {found: text.toLowerCase().includes(String(keyword||'').toLowerCase()), full_text:text, full_text_sample:text.slice(0,2000)}; }
  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if(req.action==='check_page_available') sendResponse(checkPageAvailable());
    else if(req.action==='extract_listings') sendResponse(blocked()?{status:'cloudflare'}:getResults());
    else if(req.action==='click_next_page') { clickNextPage().then(sendResponse); return true; }
    else if(req.action==='extract_details') { extractDetails(req.keyword).then(sendResponse); return true; }
  });
})();
