# MDM Agent Extension

Converts the MDM scraping system into a robust browser-execution worker. 
Follows strict backend API expectations while resolving service-worker restart instability.

## Installation
1. Go to `chrome://extensions/`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the `extension` directory.

## Configuration
1. Click the MDM Extension icon in the toolbar.
2. Enter the Render API URL (e.g., `https://mdm-tenders-...onrender.com`).
3. Enter the API Key.
4. Click "Save & Connect".

## Manual Challenge (CAPTCHA/Cloudflare)
The extension detects challenges automatically. 
When a block happens:
1. The extension naturally pauses and saves its state.
2. A message appears in the popup ("PAUSED").
3. Manually solve the CAPTCHA (or Cloudflare check) on the active tab.
4. Click the yellow **Resume Paused Job** button in the extension popup.

## Source Status

| Source | Workflow exists | List extraction | Detail extraction | Pagination | Challenge handling | Live tested |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Google | Yes | Yes | Yes | Yes | Yes | NOT TESTED |
| TenderOnTime | Yes | Yes | Yes | Yes | Yes | NOT TESTED |
| Tender247 | Yes | Yes | Yes | Yes | Yes | NOT TESTED |
| BidDetail | Yes | Yes | Yes | Yes | Yes | NOT TESTED |
| TenderDetail | Yes | Yes | Yes | Yes | Yes | NOT TESTED |
| GEM | Yes | Yes | N/A (Inline) | Yes | Yes | NOT TESTED |

## Testing Disclaimer
- **Syntax and logic structure** for API persistence, ES hooks, and Manifest compliance has been mapped exactly. 
- **Live GUI / DOM Scraping** runs could **NOT BE TESTED** end-to-end dynamically by the AI agent because the agent lacks an autonomous local Chrome debugging session for extensions. Tests labeled "NOT TESTED" require manual user loading.
