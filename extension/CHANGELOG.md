# CHANGELOG

## 1.1.0
- Refactored `background.js` into Modular ES Modules (`api`, `core`, `workflows`).
- Job State is now fully isolated and persisted in `chrome.storage.local`.
- Introduced Tab Manager for safe sequential tabs opening.
- Developed robust Captcha and Cloudflare detection.
- Allowed pausing and manual resumption of jobs without state loss.
- Converted Extension into an orchestrated browser-worker maintaining exact endpoint expectations.
