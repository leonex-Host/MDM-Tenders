import asyncio
from app.scrapers.tenderontime_scraper import TenderOnTimeScraper
from app.scrapers.scraper_manager import ScraperManager

async def test():
    manager = ScraperManager()
    try:
        manager.start()
        scraper = TenderOnTimeScraper(manager)
        print("Testing TenderOnTime Scraper for 'Data Cataloguing'...")
        results = scraper.scrape("Data Cataloguing")
        print(f"Results Array Length: {len(results)}")
        if results:
            print("First item:", results[0])
    finally:
        manager.stop()

if __name__ == "__main__":
    asyncio.run(test())
