import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        print("Navigating...")
        await page.goto("https://www.tendersontime.com/tenders/advanceSearch?q=Data%20Cataloguing")
        await page.wait_for_timeout(3000)

        html = await page.evaluate("document.body.innerHTML")
        print("Loading spinner exists (BEFORE)?", 'loading' in html.lower() or 'spinner' in html.lower())

        print("Executing Filter script...")
        await page.evaluate("""
            () => {
                const sel = "button.search-btn[onclick*='filterTendersJS']";
                const btn = document.querySelector(sel);
                if (btn) btn.click();
            }
        """)
        
        for i in range(10):
            await page.wait_for_timeout(1000)
            html = await page.evaluate("document.body.innerHTML")
            empty_text = "no records found" in html.lower() or "no results" in html.lower() or "0 results" in html.lower()
            shadows = await page.evaluate("document.querySelectorAll('.box-shadow').length")
            print(f"[Sec {i}] Shadows: {shadows}, Has Empty Text: {empty_text}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
