import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        page.on("console", lambda msg: print(f"Browser Log: {msg.text}"))
        
        print("Navigating...")
        await page.goto("https://www.tendersontime.com/tenders/advanceSearch?q=Data%20Cataloguing")
        await page.wait_for_timeout(3000)
        
        print("DOM BEFORE CLICK:", (await page.evaluate("document.body.innerText"))[:500])

        print("Executing Filter script...")
        await page.evaluate("""
            () => {
                const sel = "button.search-btn[onclick*='filterTendersJS']";
                const btn = document.querySelector(sel);
                if (btn) btn.click();
            }
        """)
        
        print("Waiting 5 seconds for AJAX...")
        await page.wait_for_timeout(5000)
        
        # Take post-click screenshot
        await page.screenshot(path="C:/Users/LEONEX/.gemini/antigravity/brain/33511435-4a17-4326-bdeb-514c18107298/post_click2.png")

        # Extract whatever is in the main container
        html = await page.evaluate("document.body.innerText")
        print("Body sample:", html[:500])

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
