"""
BaseScraper — all scrapers inherit from this.
Provides: driver setup/teardown, safe_get with retry, logging, normalized output.
"""
import os
import time
import random
import logging
import threading
from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Any

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, WebDriverException
from webdriver_manager.chrome import ChromeDriverManager

from app.config import settings
from app.utils.logger import get_logger
from app.services.sync_manager import sync_manager, ScrapeStoppedException
from app.utils.human_behavior import (
    build_stealth_options, inject_stealth_scripts, warmup_session,
    slow_scroll, human_delay, random_between_keyword_delay,
    random_mouse_move, get_random_proxy
)

# Module-level lock: only ONE thread installs/reads chromedriver at a time.
# This prevents the 'Text file busy' race condition on Render when Sync All
# launches all scrapers simultaneously.
_DRIVER_INSTALL_LOCK = threading.Lock()
_DRIVER_PATH_CACHE: Optional[str] = None


class BaseScraper(ABC):
    """
    Abstract base — every scraper must implement `scrape(keyword) -> List[Dict]`.
    Output dicts must contain these keys (all optional except source):
        tender_id, source, title, description, location,
        start_date, end_date, link, keyword
    """

    SOURCE: str = "base"   # override in subclass

    def __init__(self, headless: Optional[bool] = None):
        self.logger = get_logger(f"scraper.{self.SOURCE}")
        self.driver: Optional[webdriver.Chrome] = None
        self.wait:   Optional[WebDriverWait]    = None
        self._override_headless = headless

    # ── Driver lifecycle ──────────────────────────────────────────────────
    def setup_driver(self) -> None:
        proxy = get_random_proxy()
        if proxy:
            self.logger.info("[%s] Using proxy: %s", self.SOURCE, proxy.split('@')[-1])
        else:
            self.logger.info("[%s] No proxy configured, using direct connection", self.SOURCE)

        # Auto-detect environment:
        # - On Linux (Render/Docker) → force headless (no display available)
        # - On Windows (local dev)   → respect UI override OR HEADLESS_MODE setting
        is_linux = os.name != "nt"  # True on Render/Docker, False on Windows
        
        if is_linux:
            use_headless = True
        elif self._override_headless is not None:
            use_headless = self._override_headless
        else:
            use_headless = settings.HEADLESS_MODE

        opts = build_stealth_options(proxy=proxy, headless=use_headless)
        self.logger.info("[%s] Running %s (Linux=%s)", self.SOURCE,
                         "HEADLESS" if use_headless else "VISIBLE BROWSER", is_linux)

        # On Linux/Docker, set Chrome binary path
        binary_path = "/usr/bin/google-chrome"
        if os.path.exists(binary_path):
            opts.binary_location = binary_path

        driver_path = self._get_driver_path()
        service = Service(driver_path)
        self.driver = webdriver.Chrome(service=service, options=opts)

        self.wait   = WebDriverWait(self.driver, settings.SCRAPE_TIMEOUT)

        # Inject JS stealth patches immediately after driver starts
        inject_stealth_scripts(self.driver)

        self.logger.info("Driver started (headless=%s, proxy=%s)",
                         use_headless, bool(proxy))

    @staticmethod
    def _get_driver_path() -> str:
        """Install / return chromedriver path. Thread-safe: only one thread downloads at a time."""
        global _DRIVER_PATH_CACHE
        if _DRIVER_PATH_CACHE:
            return _DRIVER_PATH_CACHE
        with _DRIVER_INSTALL_LOCK:
            # Double-check after acquiring lock (another thread may have set it)
            if _DRIVER_PATH_CACHE:
                return _DRIVER_PATH_CACHE
            logger = logging.getLogger("scraper.base")
            logger.info("Installing/locating chromedriver (thread-safe)...")
            _DRIVER_PATH_CACHE = ChromeDriverManager().install()
            logger.info("Chromedriver path cached: %s", _DRIVER_PATH_CACHE)
            return _DRIVER_PATH_CACHE

    def close_driver(self) -> None:
        if self.driver:
            try:
                self.driver.quit()
            except Exception:
                pass
            self.driver = None
            self.logger.info("Driver closed")

    def check_stop(self) -> None:
        """Check if the global stop flag is set for this source. Raises exception if true."""
        if sync_manager.should_stop(self.SOURCE):
            self.logger.warning(f"[{self.SOURCE}] Sync stopped by user.")
            raise ScrapeStoppedException("Sync aborted by user")

    # ── Safe navigation with retry ─────────────────────────────────────────
    def safe_get(self, url: str, retries: int = 3, delay: float = 2.0) -> bool:
        for attempt in range(1, retries + 1):
            self.check_stop()
            try:
                self.driver.get(url)
                # Randomise the post-nav delay to look human
                actual_delay = delay + random.uniform(0.5, 2.5)
                time.sleep(actual_delay)
                # Inject stealth again (some SPAs reset navigator)
                inject_stealth_scripts(self.driver)
                return True
            except WebDriverException as exc:
                self.logger.warning("safe_get attempt %d/%d failed: %s", attempt, retries, exc)
                if attempt < retries:
                    time.sleep(delay * attempt)
        return False

    # ── Selenium helpers ───────────────────────────────────────────────────
    def find(self, by: str, selector: str, timeout: int = 10) -> Optional[Any]:
        self.check_stop()
        try:
            return WebDriverWait(self.driver, timeout).until(
                EC.presence_of_element_located((by, selector))
            )
        except TimeoutException:
            return None

    def find_all(self, by: str, selector: str, timeout: int = 10) -> List[Any]:
        self.check_stop()
        try:
            return WebDriverWait(self.driver, timeout).until(
                EC.presence_of_all_elements_located((by, selector))
            )
        except TimeoutException:
            return []

    def text_of(self, el: Any) -> str:
        try:
            return (el.text or "").strip()
        except Exception:
            return ""

    def attr_of(self, el: Any, attr: str) -> str:
        try:
            return (el.get_attribute(attr) or "").strip()
        except Exception:
            return ""

    def js_click(self, el: Any) -> bool:
        try:
            self.driver.execute_script("arguments[0].click();", el)
            return True
        except Exception:
            return False

    def page_text(self) -> str:
        try:
            return self.driver.find_element(By.TAG_NAME, "body").text
        except Exception:
            return ""

    # ── Normalizer helper ───────────────────────────────────────────────────
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

    # ── Abstract method ─────────────────────────────────────────────────────
    @abstractmethod
    def scrape(self, keyword: str) -> List[Dict]:
        """Run search for one keyword.  Return list of normalize() dicts."""
        ...

    # ── Run-all helper ──────────────────────────────────────────────────────
    def run_all_keywords(self, keywords: List[str]) -> List[Dict]:
        results: List[Dict] = []
        sync_manager.clear_stop_flag(self.SOURCE)
        self.setup_driver()
        try:
            # Warm up the session to look like a real browser user
            self.logger.info("[%s] Warming up browser session...", self.SOURCE)
            warmup_session(self.driver)

            for idx, kw in enumerate(keywords):
                self.check_stop()
                self.logger.info("[%s] Scraping keyword %d/%d: %s", self.SOURCE, idx + 1, len(keywords), kw)
                try:
                    # Random mouse movement before each keyword search
                    random_mouse_move(self.driver)

                    batch = self.scrape(kw)
                    self.logger.info("[%s] Got %d results for '%s'", self.SOURCE, len(batch), kw)
                    results.extend(batch)

                    # Human-like delay between keywords (not zero, not constant)
                    if idx < len(keywords) - 1:
                        self.logger.info("[%s] Waiting between keywords...", self.SOURCE)
                        random_between_keyword_delay()

                except ScrapeStoppedException as exc:
                    self.logger.warning("[%s] Scraping fully halted (%s)", self.SOURCE, exc)
                    break
                except Exception as exc:
                    self.logger.error("[%s] Error scraping '%s': %s", self.SOURCE, kw, exc)
        except ScrapeStoppedException as exc:
            self.logger.warning("[%s] Outermost scrape loop halted (%s)", self.SOURCE, exc)
        finally:
            self.close_driver()
        return results