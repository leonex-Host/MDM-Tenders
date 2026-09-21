import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        await page.goto("https://www.tendersontime.com/tenders/advanceSearch?q=Data%20Cataloguing")
        await page.wait_for_timeout(3000)

        html = await page.evaluate("document.body.innerHTML")
        
        # find loading element
        script = """
        () => {
            const loaders = Array.from(document.querySelectorAll('*')).filter(el => {
                if(el.id && el.id.toLowerCase().includes('load')) return true;
                if(el.className && typeof el.className === 'string' && el.className.toLowerCase().includes('load')) return true;
                if(el.style && el.style.display !== 'none' && el.innerHTML.toLowerCase().includes('loading...')) return true;
                return false;
            });
            return loaders.map(l => ({ id: l.id, className: l.className, display: getComputedStyle(l).display }));
        }
        """
        loaders_before = await page.evaluate(script)
        print("Loaders BEFORE:", loaders_before)

        await page.evaluate("""
            () => {
                const sel = "button.search-btn[onclick*='filterTendersJS']";
                const btn = document.querySelector(sel);
                if (btn) btn.click();
            }
        """)
        
        for i in range(5):
            await page.wait_for_timeout(500)
            loaders_during = await page.evaluate(script)
            print(f"Loaders {i*500}ms:", loaders_during)

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
