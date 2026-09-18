import logging
import random
import time
from abc import ABC, abstractmethod
from typing import List, Dict, Optional

from app.scrapers.manager import ScraperManager
from app.utils.logger import get_logger
from app.services.sync_manager import sync_manager, ScrapeStoppedException
from app.utils.human_behavior import random_between_keyword_delay

class PlaywrightBaseScraper(ABC):
    """
    Playwright-based equivalent of BaseScraper.
    All Playwright scrapers inherit from this.
    """
    SOURCE = "playwright_base"

    def __init__(self, headless: Optional[bool] = None):
        self.logger = get_logger(f"scraper.{self.SOURCE}")
        self.manager = ScraperManager(headless=headless)
        self.page = None

    def setup_driver(self) -> None:
        """Starts Playwright manager and gets a page."""
        self.page = self.manager.start()
        self.logger.info(f"[{self.SOURCE}] Playwright browser started.")

    def close_driver(self) -> None:
        """Stops Playwright manager."""
        self.manager.stop()
        self.logger.info(f"[{self.SOURCE}] Playwright browser closed.")

    def check_stop(self) -> None:
        """Check if the global stop flag is set for this source. Raises exception if true."""
        if sync_manager.should_stop(self.SOURCE):
            self.logger.warning(f"[{self.SOURCE}] Sync stopped by user.")
            raise ScrapeStoppedException("Sync aborted by user")

    @staticmethod
    def normalize(
        *,
        source: str,
        tender_id: str = "",
        title: str = "",
        description: str = "",
        location: str = "",
        start_date: str = "",
        end_date: str = "",
        link: str = "",
        keyword: str = "",
    ) -> Dict:
        """Return a clean, unified dict ready for DB insert."""
        return {
            "source":      source,
            "tender_id":   tender_id.strip() or None,
            "title":       title.strip()[:580] or None,
            "description": description.strip() or None,
            "location":    location.strip()[:280] or None,
            "start_date":  start_date.strip() or None,
            "end_date":    end_date.strip() or None,
            "link":        link.strip()[:780] or None,
            "keyword":     keyword.strip()[:280] or None,
        }

    @abstractmethod
    def scrape(self, keyword: str) -> List[Dict]:
        """Run search for one keyword. Return list of normalize() dicts."""
        pass

    def run_all_keywords(self, keywords: List[str]) -> List[Dict]:
        results: List[Dict] = []
        keyword_errors: List[str] = []
        sync_manager.clear_stop_flag(self.SOURCE)

        self.setup_driver()
        try:
            for idx, kw in enumerate(keywords):
                self.check_stop()
                self.logger.info(f"[{self.SOURCE}] Scraping keyword {idx + 1}/{len(keywords)}: {kw}")

                try:
                    batch = self.scrape(kw)
                    self.logger.info(f"[{self.SOURCE}] Got {len(batch)} results for '{kw}'")
                    results.extend(batch)
                    keyword_errors = []  # reset on any success

                    if idx < len(keywords) - 1:
                        self.logger.info(f"[{self.SOURCE}] Waiting between keywords...")
                        random_between_keyword_delay()

                except ScrapeStoppedException as exc:
                    self.logger.warning(f"[{self.SOURCE}] Scraping fully halted ({exc})")
                    break
                except Exception as exc:
                    err_msg = str(exc) or repr(exc)
                    self.logger.error(f"[{self.SOURCE}] Error scraping '{kw}': {err_msg}")
                    keyword_errors.append(err_msg)

                    # Cloudflare / CAPTCHA blocks every page — no point trying rest of keywords
                    lower = err_msg.lower()
                    if any(kw in lower for kw in ("cloudflare", "captcha", "challenge", "could not bypass")):
                        self.logger.error(f"[{self.SOURCE}] Critical block detected — aborting all keywords.")
                        raise Exception(err_msg)

        except ScrapeStoppedException as exc:
            self.logger.warning(f"[{self.SOURCE}] Outermost scrape loop halted ({exc})")
        finally:
            self.close_driver()

        # Surface the error if every keyword failed and nothing was saved
        if not results and keyword_errors:
            raise Exception(keyword_errors[-1])

        return results
