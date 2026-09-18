"""
TenderDetail Scraper — Complete Working Version
- Navigates to main page
- Uses filter sidebar with keyword and date filter
- Sets date to "Next 15 Days"
- Clicks SEARCH button
- Processes all tenders with pagination
"""

import time
import re
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta

from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from selenium.webdriver.common.keys import Keys

from app.scrapers.base import BaseScraper
from app.config import settings

# Main page URL
BASE_URL = "https://www.tenderdetail.com/Indian-tender"
SEARCH_TPL = "https://www.tenderdetail.com/Indian-tender/%22{}%22-tenders"


class TenderDetailScraper(BaseScraper):
    SOURCE = "tenderdetail"

    def scrape(self, keyword: str) -> List[Dict]:
        """
        Main scraping method
        Steps:
        1. Go to homepage (bypasses 404s)
        2. Search using top bar
        3. Apply 'Next 15 Days' filter on results page
        4. Process pages
        """
        results: List[Dict] = []
        
        try:
            # Step 1: Format keyword and navigate explicitly to SEARCH_TPL
            kw_clean = re.sub(r"[&/()]", " ", keyword.strip())
            kw_clean = re.sub(r"\s+", " ", kw_clean).strip()
            kw_url = kw_clean.replace(" ", "%20")
            url = SEARCH_TPL.format(kw_url)
            
            self.safe_get(url, delay=5)
            self.logger.info(f"[TenderDetail] Loaded explicit URL: {url}")
            time.sleep(3)
            
            # Step 2: Now on results page, apply the 'Next 15 Days' sidebar filter
            self.logger.info("[TenderDetail] Applying date filters on results sidebar...")
            
            self._set_date_filter_next_15_days()
            self._click_search_button()
            time.sleep(5)
            
            # Wait for results to load
            rows = self._find_tender_rows()
            if not rows:
                self.logger.warning("[TenderDetail] No tenders found after search & filter")
                return results
                
            # Step 4: Process results pages
            page = 1
            seen_urls = set()
            
            while page <= settings.MAX_PAGES:
                self.check_stop()
                self.logger.info(f"[TenderDetail] Processing page {page} for '{keyword}'")
                
                rows = self._find_tender_rows()
                if not rows:
                    self.logger.info(f"[TenderDetail] No more tenders on page {page}")
                    break
                
                self.logger.info(f"[TenderDetail] Found {len(rows)} tenders on page {page}")
                
                # Process each tender
                for idx, row in enumerate(rows, 1):
                    self.check_stop()
                    try:
                        tender = self._process_tender_row(row, keyword, seen_urls)
                        if tender:
                            results.append(tender)
                            self.logger.info(f"[TenderDetail] ✅ Saved tender: {tender.get('tender_id')}")
                    except Exception as exc:
                        self.logger.debug(f"[TenderDetail] Row error: {exc}")
                        continue
                
                # Go to next page
                if not self._next_page():
                    self.logger.info("[TenderDetail] No more pages")
                    break
                page += 1
                time.sleep(3)
                
        except Exception as exc:
            self.logger.error(f"[TenderDetail] Scrape error: {exc}")
        
        self.logger.info(f"[TenderDetail] Total tenders found: {len(results)}")
        return results

    def _enter_keyword(self, keyword: str) -> None:
        """Enter keyword in the filter search box"""
        # Method 1: Visible keyword input (txtKeywordwithin)
        try:
            keyword_input = self.driver.find_element(By.ID, "txtKeywordwithin")
            keyword_input.clear()
            keyword_input.send_keys(keyword)
            self.logger.info(f"[TenderDetail] Keyword entered via txtKeywordwithin")
            return
        except Exception as e:
            self.logger.debug(f"txtKeywordwithin not found: {e}")
        
        # Method 2: By name attribute
        try:
            keyword_input = self.driver.find_element(By.NAME, "wk")
            keyword_input.clear()
            keyword_input.send_keys(keyword)
            self.logger.info(f"[TenderDetail] Keyword entered via name='wk'")
            return
        except Exception as e:
            self.logger.debug(f"name='wk' not found: {e}")
        
        # Method 3: Hidden input
        try:
            hidden_input = self.driver.find_element(By.ID, "hdnkeyword")
            self.driver.execute_script("arguments[0].value = arguments[1];", hidden_input, keyword)
            self.logger.info(f"[TenderDetail] Keyword set via hdnkeyword")
            return
        except Exception as e:
            self.logger.debug(f"hdnkeyword not found: {e}")
        
        self.logger.warning("[TenderDetail] Could not find keyword input field")

    def _set_date_filter_next_15_days(self) -> bool:
        """
        Click the date filter dropdown and select "Next 15 Days"
        Based on HTML structure with id="drpDD"
        """
        try:
            # Step 1: Find and click the date dropdown
            date_dropdown = self.driver.find_element(By.ID, "drpDD")
            self.js_click(date_dropdown)
            self.logger.info("[TenderDetail] Date dropdown clicked")
            time.sleep(1)
            
            # Step 2: Find and click "Next 15 Days" option
            next_15_options = [
                "//a[contains(text(), 'Next 15 Days')]",
                "//li[contains(text(), 'Next 15 Days')]",
                "//span[contains(text(), 'Next 15 Days')]",
                "//a[contains(text(), '15 Days')]",
                "//li[contains(text(), '15 Days')]",
                "//div[contains(text(), 'Next 15 Days')]",
                "//*[contains(text(), 'Next 15 Days')]"
            ]
            
            for option_xpath in next_15_options:
                try:
                    elements = self.driver.find_elements(By.XPATH, option_xpath)
                    for elem in elements:
                        if elem.is_displayed():
                            self.js_click(elem)
                            self.logger.info("[TenderDetail] Selected 'Next 15 Days'")
                            time.sleep(1)
                            
                            # Verify the date display changed
                            try:
                                date_span = self.driver.find_element(By.CSS_SELECTOR, "#drpDD span")
                                new_text = date_span.text
                                self.logger.info(f"[TenderDetail] Date filter now shows: {new_text}")
                            except:
                                pass
                            
                            return True
                except Exception as e:
                    self.logger.debug(f"Option search failed: {e}")
                    continue
            
            # Fallback: Calculate and set dates manually
            self.logger.info("[TenderDetail] Trying manual date calculation")
            return self._set_manual_date_range()
            
        except Exception as exc:
            self.logger.error(f"[TenderDetail] Error setting date filter: {exc}")
            return False

    def _set_manual_date_range(self) -> bool:
        """
        Fallback method: Manually calculate and set date range
        """
        try:
            today = datetime.now()
            end_date = today + timedelta(days=15)
            
            date_from = today.strftime("%d/%m/%Y")
            date_to = end_date.strftime("%d/%m/%Y")
            
            # Set hidden inputs
            try:
                date_from_input = self.driver.find_element(By.ID, "hdnDdf")
                date_to_input = self.driver.find_element(By.ID, "hdnDdt")
                
                self.driver.execute_script("arguments[0].value = arguments[1];", date_from_input, date_from)
                self.driver.execute_script("arguments[0].value = arguments[1];", date_to_input, date_to)
                
                # Update display
                date_display = self.driver.find_element(By.CSS_SELECTOR, "#drpDD span")
                self.driver.execute_script(f"arguments[0].innerHTML = '{date_from} - {date_to}';", date_display)
                
                self.logger.info(f"[TenderDetail] Manually set date range: {date_from} to {date_to}")
                return True
            except Exception as e:
                self.logger.warning(f"Manual date setting failed: {e}")
                return False
                
        except Exception as exc:
            self.logger.error(f"Manual date range error: {exc}")
            return False

    def _click_search_button(self) -> bool:
        """Click the SEARCH button"""
        # Method 1: By ID
        try:
            search_btn = self.driver.find_element(By.ID, "btnFilterTender")
            self.js_click(search_btn)
            self.logger.info("[TenderDetail] Search button clicked (by ID)")
            return True
        except Exception as e:
            self.logger.debug(f"Button by ID not found: {e}")
        
        # Method 2: By value
        try:
            search_btns = self.driver.find_elements(By.CSS_SELECTOR, "input[value='SEARCH']")
            for btn in search_btns:
                if btn.is_displayed():
                    self.js_click(btn)
                    self.logger.info("[TenderDetail] Search button clicked (by value)")
                    return True
        except Exception as e:
            self.logger.debug(f"Button by value not found: {e}")
        
        # Method 3: By XPath with text
        try:
            search_btns = self.driver.find_elements(By.XPATH, "//input[@value='SEARCH']")
            for btn in search_btns:
                if btn.is_displayed():
                    self.js_click(btn)
                    self.logger.info("[TenderDetail] Search button clicked (by XPath)")
                    return True
        except Exception as e:
            self.logger.debug(f"Button by XPath not found: {e}")
        
        self.logger.error("[TenderDetail] Could not find SEARCH button")
        return False

    def _find_tender_rows(self) -> List:
        """Find tender rows with multiple selector attempts"""
        selectors = [
            "div.tender_row",
            "div.tender-item",
            "div.search-result div.list div.tender_row",
            ".tender-row",
            "div[class*='tender_row']"
        ]
        
        for selector in selectors:
            rows = self.driver.find_elements(By.CSS_SELECTOR, selector)
            if rows:
                self.logger.debug(f"[TenderDetail] Found {len(rows)} rows with selector: {selector}")
                return rows
        return []

    def _process_tender_row(self, row, keyword: str, seen_urls: set) -> Optional[Dict]:
        """Process a single tender row"""
        try:
            # Extract link
            href = self._extract_link_from_row(row)
            if not href or href in seen_urls:
                return None
            seen_urls.add(href)
            
            # Extract listing metadata
            tender_id = self._extract_tender_id_from_row(row)
            due_date = self._extract_due_date_from_row(row)
            
            self.logger.info(f"[TenderDetail] Checking tender: {tender_id or href.split('/')[-1]}")
            
            # Visit detail page
            self.safe_get(href, delay=2)
            
            # Check if keyword appears in Tender Brief
            found, excerpt = self._check_tender_brief(keyword)
            
            if not found:
                self.logger.debug(f"[TenderDetail] Keyword not found, skipping")
                self.driver.back()
                time.sleep(1)
                return None
            
            self.logger.info(f"[TenderDetail] ✅ Keyword found in Tender Brief")
            
            # Extract details
            title = self._extract_title()
            start_date = self._extract_start_date()
            location = self._extract_location()
            value = self._extract_tender_value()
            
            tender_data = self.normalize(
                source="tenderdetail",
                tender_id=tender_id or (href.strip("/").split("/")[-1] if href else ""),
                title=title or excerpt[:250],
                description=excerpt,
                location=location,
                start_date=start_date,
                end_date=due_date,
                link=href,
                keyword=keyword,
            )
            
            self.driver.back()
            time.sleep(2)
            
            return tender_data
            
        except Exception as exc:
            self.logger.debug(f"[TenderDetail] Process error: {exc}")
            return None

    def _extract_link_from_row(self, row) -> Optional[str]:
        """Extract detail page link from row"""
        selectors = ["a.m-brief", "a.detail-link", "h2 a", "a[href*='tender']"]
        
        for selector in selectors:
            try:
                link_el = row.find_element(By.CSS_SELECTOR, selector)
                href = self.attr_of(link_el, "href")
                if href:
                    return href
            except:
                continue
        return None

    def _extract_tender_id_from_row(self, row) -> str:
        """Extract tender ID from row"""
        try:
            selectors = ["span.m-tender-id", ".tender-id", "[class*='tender-id']"]
            for selector in selectors:
                try:
                    elem = row.find_element(By.CSS_SELECTOR, selector)
                    return self.text_of(elem)
                except:
                    continue
        except:
            pass
        return ""

    def _extract_due_date_from_row(self, row) -> str:
        """Extract due date from row"""
        try:
            month = self._get_child_text(row, "span.month")
            day = self._get_child_text(row, "span.day")
            year = self._get_child_text(row, "span.year")
            
            if month and day and year:
                return f"{month} {day}, {year}"
        except:
            pass
        return ""

    def _get_child_text(self, parent, selector: str) -> str:
        """Get text from child element"""
        try:
            elem = parent.find_element(By.CSS_SELECTOR, selector)
            return self.text_of(elem)
        except:
            return ""

    def _check_tender_brief(self, keyword: str) -> Tuple[bool, str]:
        """Check if keyword appears in Tender Brief section"""
        phrase = keyword.lower()
        
        # Look for brief section
        brief_selectors = [
            "//div[contains(@class,'brief')]",
            "//div[contains(@class,'tender-brief')]",
            "//label[contains(text(),'Tender Brief')]/following-sibling::div",
            "//div[contains(text(),'Tender Brief')]/following-sibling::div",
            "//div[contains(@class,'col-md-12') and contains(@class,'brief')]"
        ]
        
        for selector in brief_selectors:
            els = self.driver.find_elements(By.XPATH, selector)
            for el in els:
                txt = self.text_of(el)
                if phrase in txt.lower() and len(txt) > 20:
                    idx = txt.lower().find(phrase)
                    start = max(0, idx - 60)
                    end = min(len(txt), idx + len(phrase) + 60)
                    excerpt = txt[start:end]
                    return True, excerpt
        
        return False, ""

    def _extract_title(self) -> str:
        """Extract title from detail page"""
        try:
            selectors = ["h2.workDesc strong", "h1", "h2", ".tender-title"]
            for selector in selectors:
                try:
                    elem = self.driver.find_element(By.CSS_SELECTOR, selector)
                    return self.text_of(elem)
                except:
                    continue
        except:
            pass
        return ""

    def _extract_start_date(self) -> str:
        """Extract start date from detail page"""
        return self._extract_re(
            self.page_text(),
            r"(?:Start|Publish|Publication) Date[:\s]*(\d{1,2}\s+[A-Za-z]+\s+\d{4})"
        )

    def _extract_location(self) -> str:
        """Extract location from detail page"""
        try:
            loc_match = re.search(r'Location[:\s]*([^,\n]+(?:,\s*[^,\n]+)*)', self.page_text(), re.I)
            if loc_match:
                return loc_match.group(1).strip()
        except:
            pass
        return ""

    def _extract_tender_value(self) -> str:
        """Extract tender value from detail page"""
        try:
            value_match = re.search(r'Tender Value[:\s]*([\d,.]+)\s*(Lakh|Crore)?', self.page_text(), re.I)
            if value_match:
                return value_match.group(0).strip()
        except:
            pass
        return ""

    def _next_page(self) -> bool:
        """Navigate to next page"""
        next_selectors = [
            "//a[contains(text(), 'Next')]",
            "//a[contains(text(), '›')]",
            "//a[contains(@class, 'next')]",
            "//li[@class='next']/a",
            "//a[@rel='next']"
        ]
        
        for selector in next_selectors:
            els = self.driver.find_elements(By.XPATH, selector)
            for el in els:
                if el.is_displayed() and el.is_enabled():
                    self.js_click(el)
                    time.sleep(3)
                    return True
        
        return False

    def _extract_re(self, text: str, pattern: str) -> str:
        """Extract regex pattern from text"""
        m = re.search(pattern, text, re.IGNORECASE)
        return m.group(1).strip() if m else ""