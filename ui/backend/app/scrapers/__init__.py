"""
Scrapers package — clean exports
"""
from app.scrapers.gem_scraper        import GEMScraper
from app.scrapers.tender247_scraper  import Tender247Scraper
from app.scrapers.tenderdetail_scraper import TenderDetailScraper
from app.scrapers.tenderontime_scraper import TenderOnTimeScraper
from app.scrapers.biddetail_scraper  import BidDetailScraper

ALL_SCRAPERS = [
    GEMScraper,
    Tender247Scraper,
    TenderDetailScraper,
    TenderOnTimeScraper,
    BidDetailScraper,
]

__all__ = [
    "GEMScraper",
    "Tender247Scraper",
    "TenderDetailScraper",
    "TenderOnTimeScraper",
    "BidDetailScraper",
    "ALL_SCRAPERS",
]