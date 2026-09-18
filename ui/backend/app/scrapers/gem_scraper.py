"""
GEM (Government e-Marketplace) Scraper
Searches keywords in Items field, returns normalized dicts.
Includes automatic sorting to show "Bid Start Date: Latest First"
"""

import time
import re
from typing import List, Dict

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException

from app.scrapers.base import BaseScraper
from app.config import settings

ALL_BIDS_URL = "https://bidplus.gem.gov.in/all-bids"


class GEMScraper(BaseScraper):
    SOURCE = "gem"

    def scrape(self, keyword: str) -> List[Dict]:
        results: List[Dict] = []
        try:
            self.driver.get(ALL_BIDS_URL)
            time.sleep(4)
            
            # Search for keyword
            self._search_keyword(keyword)
            
            # Apply sorting to show latest bids first
            self._apply_sorting()
            
            page = 1
            while page <= settings.MAX_PAGES:
                self.check_stop()
                self.logger.info("[GEM] Page %d for '%s'", page, keyword)
                cards = self.find_all(By.CSS_SELECTOR, "div.card")
                for card in cards:
                    self.check_stop()
                    item = self._extract_card(card, keyword)
                    if item:
                        results.append(item)

                if not self._next_page():
                    break
                page += 1

        except Exception as exc:
            self.logger.error("[GEM] scrape error: %s", exc)
        return results

    def _search_keyword(self, keyword: str) -> None:
        """Search for keyword in the search box"""
        try:
            wait = WebDriverWait(self.driver, 10)
            box = wait.until(EC.presence_of_element_located((By.ID, "searchBid")))
            box.clear()
            box.send_keys(keyword)
            time.sleep(0.5)
            
            # Click search button
            search_btn = self.driver.find_element(By.ID, "searchBidRA")
            self.js_click(search_btn)
            time.sleep(4)
        except Exception as exc:
            self.logger.warning("[GEM] Search input failed: %s", exc)

    def _apply_sorting(self) -> None:
        """
        Apply sorting to show "Bid Start Date: Latest First"
        Based on actual HTML structure:
        <button id="currentSort">Bid End Date: Oldest First</button>
        <ul class="dropdown-menu">
            <li><a id="Bid-Start-Date-Latest" onclick="sort(`Bid-Start-Date-Latest`)">Bid Start Date: Latest First</a></li>
            ...
        </ul>
        """
        try:
            # Wait for the sort button to be present
            wait = WebDriverWait(self.driver, 10)
            sort_button = wait.until(
                EC.element_to_be_clickable((By.ID, "currentSort"))
            )
            
            # Get current sort text
            current_sort = sort_button.text.strip()
            self.logger.info(f"[GEM] Current sort: {current_sort}")
            
            # If already sorted by "Bid Start Date: Latest First", skip
            if "Bid Start Date: Latest First" in current_sort:
                self.logger.info("[GEM] Already sorted by Bid Start Date: Latest First")
                return
            
            # Click to open dropdown
            self.js_click(sort_button)
            time.sleep(1)
            
            # Find and click the "Bid Start Date: Latest First" option
            # Using the exact ID from HTML: "Bid-Start-Date-Latest"
            try:
                latest_option = self.driver.find_element(By.ID, "Bid-Start-Date-Latest")
                if latest_option.is_displayed():
                    self.js_click(latest_option)
                    self.logger.info("[GEM] Applied sort: Bid Start Date: Latest First (by ID)")
                    time.sleep(3)
                    return
            except NoSuchElementException:
                pass
            
            # Fallback: try by XPath with text
            try:
                option = self.driver.find_element(By.XPATH, 
                    "//a[contains(text(), 'Bid Start Date: Latest First')]")
                if option.is_displayed():
                    self.js_click(option)
                    self.logger.info("[GEM] Applied sort: Bid Start Date: Latest First (by text)")
                    time.sleep(3)
                    return
            except Exception:
                pass
            
            # Fallback: try by onclick attribute
            try:
                option = self.driver.find_element(By.XPATH, 
                    "//a[@onclick=\"sort(`Bid-Start-Date-Latest`)\"]")
                if option.is_displayed():
                    self.js_click(option)
                    self.logger.info("[GEM] Applied sort: Bid Start Date: Latest First (by onclick)")
                    time.sleep(3)
                    return
            except Exception:
                pass
            
            self.logger.warning("[GEM] Could not find sort option for Bid Start Date: Latest First")
            
        except Exception as exc:
            self.logger.warning(f"[GEM] Sorting failed: {exc}")

    def _extract_card(self, card, keyword: str) -> Dict | None:
        """Extract bid data from a single card"""
        try:
            bid_no = self.text_of(card.find_element(By.CSS_SELECTOR, "a.bid_no_hover"))
            if not bid_no:
                return None

            # Items full text hidden in data-content
            items_text = ""
            try:
                link = card.find_element(By.CSS_SELECTOR, "a[data-toggle='popover']")
                items_text = self.attr_of(link, "data-content") or self.text_of(link)
            except Exception:
                pass

            # Check if keyword matches
            if not items_text or keyword.lower() not in items_text.lower():
                return None

            # Extract dates
            start_date = ""
            end_date = ""
            try:
                spans = card.find_elements(By.CSS_SELECTOR, "span.start_date")
                if spans:
                    start_date = self.text_of(spans[0])
                spans = card.find_elements(By.CSS_SELECTOR, "span.end_date")
                if spans:
                    end_date = self.text_of(spans[0])
            except Exception:
                pass

            # Extract department
            dept = ""
            try:
                dept_divs = card.find_elements(By.CSS_SELECTOR, "div.col-md-4")
                if dept_divs:
                    dept = self.text_of(dept_divs[0])
            except Exception:
                pass

            # Extract quantity
            quantity = ""
            try:
                qty_row = card.find_element(By.XPATH, ".//div[@class='row'][strong[contains(text(), 'Quantity:')]]")
                qty_text = qty_row.text
                qty_match = re.search(r'Quantity:\s*([\d,]+)', qty_text)
                if qty_match:
                    quantity = qty_match.group(1)
            except Exception:
                pass

            return self.normalize(
                source="gem",
                tender_id=bid_no,
                title=items_text[:500],
                description=items_text,
                location=dept,
                start_date=start_date,
                end_date=end_date,
                link=f"https://bidplus.gem.gov.in/bidlists?bid_no={bid_no}",
                keyword=keyword,
            )
        except Exception as exc:
            self.logger.debug(f"[GEM] Card extraction failed: {exc}")
            return None

    def _next_page(self) -> bool:
        """Go to next page if available"""
        try:
            # Try different selectors for Next button
            next_selectors = [
                "//a[contains(text(), 'Next')]",
                "//a[@rel='next']",
                "//li[@class='next']/a",
                "//button[contains(text(), 'Next')]"
            ]
            
            for selector in next_selectors:
                btns = self.driver.find_elements(By.XPATH, selector)
                for btn in btns:
                    if btn.is_displayed() and btn.is_enabled():
                        self.js_click(btn)
                        time.sleep(3)
                        return True
            
            # Try URL pattern approach (fallback)
            current_url = self.driver.current_url
            if "#page-" in current_url:
                page_match = re.search(r'#page-(\d+)', current_url)
                if page_match:
                    current_page = int(page_match.group(1))
                    next_page = current_page + 1
                    next_url = re.sub(r'#page-\d+', f'#page-{next_page}', current_url)
                    self.driver.get(next_url)
                    time.sleep(3)
                    return True
                    
        except Exception as exc:
            self.logger.debug(f"[GEM] Next page failed: {exc}")
        return False