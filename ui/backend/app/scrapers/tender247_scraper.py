"""
Tender247 Scraper — class-based, returns normalized dicts.
"""
import time
import re
from typing import List, Dict, Tuple

from selenium.webdriver.common.by import By
from selenium.common.exceptions import UnexpectedAlertPresentException
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

from app.scrapers.base import BaseScraper
from app.config import settings

BASE_URL = "https://www.tender247.com"


class Tender247Scraper(BaseScraper):
    SOURCE = "tender247"

    def scrape(self, keyword: str) -> List[Dict]:
        results: List[Dict] = []
        try:
            links = self._get_all_links(keyword)
            self.logger.info("[Tender247] Found %d links for '%s'", len(links), keyword)
            for url in links:
                self.check_stop()
                item = self._check_tender(url, keyword)
                if item:
                    results.append(item)
        except Exception as exc:
            self.logger.error("[Tender247] scrape error: %s", exc)
        return results

    def _format_keyword(self, keyword: str) -> str:
        """
        Build a URL-safe keyword string for Tender247.
        Tender247 DOES NOT accept special chars like double-quotes (%22).
        Just strip special chars and join words with '+' — clean and accepted.
        """
        kw = re.sub(r"[&/()\"']", " ", keyword.strip())
        kw = re.sub(r"\s+", " ", kw).strip()
        # Join words with '+' (Tender247's accepted format)
        return kw.replace(" ", "+")

    def _handle_alert(self, max_retries: int = 5, wait_after: float = 2.0) -> bool:
        """
        Dismiss any JS alert that may have appeared, retrying up to max_retries times.
        Waits after dismissal to let the page settle.
        Returns True if an alert was found and dismissed.
        """
        for attempt in range(max_retries):
            try:
                alert = self.driver.switch_to.alert
                alert_text = alert.text
                self.logger.info("[Tender247] Alert dismissed: '%s'", alert_text[:80])
                alert.accept()
                time.sleep(wait_after)  # Wait for page to settle after alert
                return True
            except Exception:
                if attempt < max_retries - 1:
                    time.sleep(0.5)
        return False

    def _get_all_links(self, keyword: str) -> List[str]:
        formatted = self._format_keyword(keyword)
        url = f"{BASE_URL}/keyword/{formatted}+tenders"
        self.logger.info("[Tender247] Search URL: %s", url)

        # First load
        self.safe_get(url, delay=5)
        # Clear any alert that appeared immediately
        self._handle_alert(max_retries=5, wait_after=2.5)

        # Refresh once to get past any redirect/session popups
        try:
            self.driver.refresh()
        except Exception:
            pass
        time.sleep(5)
        # Clear any alert after refresh
        self._handle_alert(max_retries=5, wait_after=2.5)

        links: List[str] = []
        page = 1
        while page <= settings.MAX_PAGES:
            self.check_stop()

            # Dismiss any lingering alert before each page scrape
            self._handle_alert(max_retries=3, wait_after=1.5)

            try:
                # Wait for tender links to appear — up to 12 seconds
                WebDriverWait(self.driver, 12).until(
                    EC.presence_of_element_located((By.XPATH, "//a[contains(@href,'/tender-details/')]"))
                )
            except Exception:
                self.logger.info("[Tender247] No results loaded for '%s' on page %d", keyword, page)
                break

            els = self.driver.find_elements(By.XPATH, "//a[contains(@href,'/tender-details/')]")
            for el in els:
                href = self.attr_of(el, "href")
                if href and href not in links:
                    links.append(href)

            # Next page
            next_found = False
            for sel in ["//a[contains(text(),'Next')]", "//a[contains(text(),'›')]"]:
                btns = self.driver.find_elements(By.XPATH, sel)
                for btn in btns:
                    if btn.is_displayed():
                        self.js_click(btn)
                        time.sleep(2)
                        # Dismiss any alert that fires after click
                        self._handle_alert(max_retries=5, wait_after=2.0)
                        try:
                            WebDriverWait(self.driver, 12).until(
                                EC.presence_of_element_located(
                                    (By.XPATH, "//a[contains(@href,'/tender-details/')]")
                                )
                            )
                        except Exception:
                            pass
                        time.sleep(2)  # extra settle
                        next_found = True
                        break
                if next_found:
                    break
            if not next_found:
                break
            page += 1

        self.logger.info("[Tender247] Collected %d links for keyword '%s'", len(links), keyword)
        return list(set(links))


    def _check_tender(self, url: str, keyword: str) -> Dict | None:
        try:
            self.safe_get(url, delay=2)
            self._handle_alert()

            # ── Wait for page to fully load before extracting anything ──
            try:
                WebDriverWait(self.driver, 15).until(
                    EC.presence_of_element_located((By.TAG_NAME, "body"))
                )
                # Also wait for at least one meaningful content block to appear
                WebDriverWait(self.driver, 10).until(
                    lambda d: len(d.find_element(By.TAG_NAME, "body").text.strip()) > 100
                )
            except Exception:
                self.logger.warning("[Tender247] Page did not fully load for %s, skipping", url)
                return None

            phrase = keyword.lower().strip()

            brief = ""
            
            # 1. Try meta description first (highly reliable on Tender247)
            try:
                meta = self.driver.find_element(By.XPATH, "//meta[@name='description']")
                content = meta.get_attribute("content")
                if content and len(content) > 30 and "procure.tender247.com" not in content.lower():
                    brief = content.replace("Tender for", "").strip()[:500]
            except Exception:
                pass

            # 2. Extract Tender Brief from .capitalize class
            if not brief:
                try:
                    els = self.driver.find_elements(By.CSS_SELECTOR, ".capitalize")
                    for el in els:
                        txt = self.text_of(el)
                        if len(txt) > 30 and "procure.tender247.com" not in txt.lower():
                            brief = txt[:500]
                            break
                except Exception:
                    pass

            # 3. Fallback table selectors
            if not brief:
                fallback_xpaths = [
                    "//td[contains(normalize-space(.),'Tender Description')]/following-sibling::td",
                    "//td[contains(normalize-space(.),'Work Description')]/following-sibling::td",
                    "//td[contains(normalize-space(.),'Tender Brief')]/following-sibling::td",
                    "//td[contains(normalize-space(.),'Brief')]/following-sibling::td",
                    "//div[contains(text(),'Brief')]/following-sibling::div",
                    "//div[contains(@class,'workDesc')]",
                ]
                for sel in fallback_xpaths:
                    try:
                        els = self.driver.find_elements(By.XPATH, sel)
                        for el in els:
                            txt = self.text_of(el).strip()
                            if len(txt) > 30 and "procure.tender247.com" not in txt.lower():
                                brief = txt[:500]
                                break
                    except Exception:
                        pass
                    if brief:
                        break

            # ── STRICT Keyword match: must appear in the brief/description only ──
            # We do NOT check full page text — that causes false positives
            # (e.g., sidebar links, footer text, keyword in URL, etc.)
            if not brief:
                self.logger.debug(
                    "[Tender247] No brief/description extracted for %s, skipping (keyword='%s')",
                    url, keyword
                )
                return None

            if phrase not in brief.lower():
                self.logger.debug(
                    "[Tender247] Keyword '%s' NOT found in brief for %s — skipping",
                    keyword, url
                )
                return None

            title = ""
            try:
                title = self.text_of(self.driver.find_element(By.TAG_NAME, "h1"))
            except Exception:
                pass

            if not brief and not title:
                self.logger.warning("[Tender247] Blank tender shell detected (no title/brief), skipping %s", url)
                return None

            full_text = self.page_text()

            tender_id = self._extract(full_text, r"T247\s*ID\s*[:\-]?\s*(\S+)")
            start_date = self._extract(full_text, r"(?:Opening|Publish(?:ed)?)\s*Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})")
            end_date   = self._extract(full_text, r"(?:Submission|Last|Closing|Due)\s*Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})")
            location   = self._extract(full_text, r"([^,\n]+,\s*[^,\n]+,\s*India)")

            # Clean URL tender ID from query parameters
            raw_url_id = url.strip("/").split("/")[-1]
            clean_url_id = raw_url_id.split("?")[0]

            return self.normalize(
                source="tender247",
                tender_id=tender_id or clean_url_id,
                title=title or brief[:250],
                description=brief or title,
                location=location,
                start_date=start_date,
                end_date=end_date,
                link=url.split("?")[0], # Clean link as well
                keyword=keyword,
            )
        except Exception as exc:
            self.logger.warning("[Tender247] page error %s: %s", url, exc)
            return None

    def _extract(self, text: str, pattern: str) -> str:
        m = re.search(pattern, text, re.IGNORECASE)
        return m.group(1).strip() if m else ""