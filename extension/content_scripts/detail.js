chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract_details') {
    const text = document.body?.innerText || '';
    const keyword = String(request.keyword || '').trim().toLowerCase();
    sendResponse({ found: !keyword || text.toLowerCase().includes(keyword), full_text: text, full_text_sample: text.slice(0, 2000), url: location.href });
  }
});
