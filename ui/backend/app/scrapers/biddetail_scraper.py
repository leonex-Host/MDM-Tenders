"""
BidDetail.com Scraper — infinite scroll via Next button, checks Tender Brief.
"""
import time
from datetime import datetime, timedelta
import re
from typing import List, Dict

from selenium.webdriver.common.by import By

from app.scrapers.base import BaseScraper
from app.config import settings

BASE_URL  = "https://www.biddetail.com"
SEARCH_TPL = "https://www.biddetail.com/global-tenders/%22{}%22-tenders"
MAX_NEXT   = 10


class BidDetailScraper(BaseScraper):
    SOURCE = "biddetail"

    def scrape(self, keyword: str) -> List[Dict]:
        results: List[Dict] = []
        try:
            formatted = keyword.strip().lower().replace(" ", "%20")
            url = SEARCH_TPL.format(formatted)
            self.safe_get(url, delay=4)

            # Apply date filters
            self.logger.info("[BidDetail] Applying 'Next 15 Days' filter...")
            self._set_date_filter_next_15_days()
            self._click_search_button()
            time.sleep(5)

            # --- Page-by-Page Collection ---
            phase1_items = []
            seen_hrefs = set()
            page_count = 1
            
            while page_count <= MAX_NEXT:
                self.check_stop()
                self.logger.info(f"[BidDetail] Extracting rows from page {page_count}...")
                
                # Extract rows from current page
                rows = self.driver.find_elements(By.CSS_SELECTOR, "div.tender_row")
                new_items_found = 0

                for row in rows:
                    item = self._extract_listing_row(row, keyword)
                    if item and item["href"] not in seen_hrefs:
                        seen_hrefs.add(item["href"])
                        phase1_items.append(item)
                        new_items_found += 1
                
                # If we parsed a whole page but found zero new unique items, we are stuck in a loop
                if new_items_found == 0 and len(rows) > 0:
                    self.logger.info("[BidDetail] Detected pagination loop (no new items found). Breaking.")
                    break

                # Check for "Next" button and click
                if not self._click_next():
                    self.logger.info("[BidDetail] No more pages.")
                    break
                    
                page_count += 1
                time.sleep(3) # Wait for results to refresh

            self.logger.info("[BidDetail] Total items collected across all pages: %d", len(phase1_items))

            # Phase 2: Visit each collected item's detail page
            for item in phase1_items:
                self.check_stop()
                final_item = self._visit_detail_page(item, keyword)
                if final_item:
                    results.append(final_item)

        except Exception as exc:
            self.logger.error("[BidDetail] scrape error: %s", exc)
        return results

    def _click_next(self) -> bool:
        for sel in [
            "//a[contains(text(),'Next')]",
            "a.pagination-next",
            "a.next",
        ]:
            try:
                by = By.XPATH if sel.startswith("//") else By.CSS_SELECTOR
                els = self.driver.find_elements(by, sel)
                for el in els:
                    if el.is_displayed() and el.is_enabled():
                        self.js_click(el)
                        time.sleep(2)
                        return True
            except Exception:
                pass
        return False

    def _extract_listing_row(self, row, keyword: str) -> Dict | None:
        try:
            title_el = row.find_element(By.CSS_SELECTOR, "h2 a")
            organization = self.text_of(title_el) # "GAKENKE DISTRICT, Africa"
            href  = self.attr_of(title_el, "href")
            if href and not href.startswith("http"):
                href = BASE_URL + href

            bdr_no = ""
            deadline = ""
            location = ""
            try:
                items = row.find_elements(By.CSS_SELECTOR, "div.desc ul li")
                for item in items:
                    html = item.get_attribute("innerHTML") or ""
                    txt  = self.text_of(item)
                    if "fa-clock-o" in html:
                        deadline = txt
                    elif "fa-map-marker" in html:
                        location = txt
                    elif "fa-hashtag" in html:
                        bdr_no = txt
            except Exception:
                pass

            desc_el = row.find_element(By.CSS_SELECTOR, "a.m-notice-text p.workDesc")
            description = self.text_of(desc_el)

            if not href:
                return None

            # User wants the actual tender description as title, not organization title
            final_title = description if description else organization
            if len(final_title) > 550:
                final_title = final_title[:547] + "..."

            return {
                "bdr_no": bdr_no or href.strip("/").split("/")[-1],
                "title": final_title,
                "description": f"{organization} | {description}" if organization else description,
                "location": location,
                "deadline": deadline,
                "href": href
            }
        except Exception as exc:
            self.logger.debug("[BidDetail] listing row error: %s", exc)
            return None

    def _visit_detail_page(self, item: Dict, keyword: str) -> Dict | None:
        try:
            self.safe_get(item["href"], delay=2)
            phrase = keyword.lower().strip()

            # ── Extract Tender Brief (from table structure) ──────────────────
            brief = ""
            try:
                # Target the exact tr containing 'Tender Brief' and get its 2nd td
                # More robust XPath handling nested tags and siblings
                els = self.driver.find_elements(
                    By.XPATH, 
                    "//tr[td[contains(., 'Tender Brief')]]/td[2] | "
                    "//tr[td/b[contains(., 'Tender Brief')]]/td[2] | "
                    "//td[contains(., 'Tender Brief')]/following-sibling::td"
                )
                for el in els:
                    txt = self.text_of(el).strip()
                    if txt and len(txt) > 5:
                        brief = txt
                        break
            except Exception as e:
                self.logger.debug(f"[BidDetail] Tender Brief extraction failed: {e}")

            # ── Extract All Table Metadata ──────────────────
            meta_data = {}
            try:
                table_rows = self.driver.find_elements(By.CSS_SELECTOR, "table.table-bordered tr")
                for row in table_rows:
                    tds = row.find_elements(By.TAG_NAME, "td")
                    if len(tds) >= 2:
                        k = self.text_of(tds[0]).strip().rstrip(':').strip()
                        v = self.text_of(tds[1]).strip()
                        if k and v and len(k) < 50:
                            meta_data[k] = v
            except Exception as e:
                self.logger.debug(f"[BidDetail] Meta table extraction failed: {e}")

            # ── Keyword match ──────────────────
            combined_text = (brief + " " + " ".join(meta_data.values())).lower()
            if phrase not in combined_text:
                self.logger.debug("[BidDetail] Keyword '%s' not found, skipping %s", keyword, item["href"])
                return None

            return self.normalize(
                source="biddetail",
                tender_id=item["bdr_no"],
                title=item["title"],
                description=brief or item["description"],
                location=item["location"],
                start_date=meta_data.get("Opening Date") or meta_data.get("Start Date") or "",
                end_date=item["deadline"],
                link=item["href"],
                keyword=keyword,
            )
        except Exception as exc:
            self.logger.debug("[BidDetail] detail page error: %s", exc)
            return None

    def _check_brief(self, keyword: str):
        phrase = keyword.lower().strip()
        for sel in ["//tr[td[contains(text(),'Tender Brief')]]", "//td[contains(text(),'Tender Brief')]/../td[2]"]:
            els = self.driver.find_elements(By.XPATH, sel)
            for el in els:
                txt = self.text_of(el)
                if phrase in txt.lower() and len(txt) > 10:
                    idx = txt.lower().find(phrase)
                    excerpt = txt[max(0, idx - 60): idx + len(phrase) + 60]
                    return True, excerpt
        return False, ""

    def _extract_re(self, text: str, pattern: str) -> str:
        m = re.search(pattern, text, re.IGNORECASE)
        return m.group(1).strip() if m else ""

    def _set_date_filter_next_15_days(self) -> bool:
        """
        Click the date filter dropdown and select "Next 15 Days"
        Based on HTML structure with id="drpDD"
        """
        try:
            # Step 1: Find and click the date dropdown
            date_dropdown = self.driver.find_element(By.ID, "drpDD")
            self.js_click(date_dropdown)
            self.logger.info("[BidDetail] Date dropdown clicked")
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
                            self.logger.info("[BidDetail] Selected 'Next 15 Days'")
                            time.sleep(1)
                            
                            # Verify the date display changed
                            try:
                                date_span = self.driver.find_element(By.CSS_SELECTOR, "#drpDD span")
                                new_text = date_span.text
                                self.logger.info(f"[BidDetail] Date filter now shows: {new_text}")
                            except:
                                pass
                            
                            return True
                except Exception as e:
                    self.logger.debug(f"Option search failed: {e}")
                    continue
            
            # Fallback: Calculate and set dates manually
            self.logger.info("[BidDetail] Trying manual date calculation")
            return self._set_manual_date_range()
            
        except Exception as exc:
            self.logger.error(f"[BidDetail] Error setting date filter: {exc}")
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
                
                self.logger.info(f"[BidDetail] Manually set date range: {date_from} to {date_to}")
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
            self.logger.info("[BidDetail] Search button clicked (by ID)")
            return True
        except Exception as e:
            self.logger.debug(f"Button by ID not found: {e}")
        
        # Method 2: By value
        try:
            search_btns = self.driver.find_elements(By.CSS_SELECTOR, "input[value='SEARCH']")
            for btn in search_btns:
                if btn.is_displayed():
                    self.js_click(btn)
                    self.logger.info("[BidDetail] Search button clicked (by value)")
                    return True
        except Exception as e:
            self.logger.debug(f"Button by value not found: {e}")
        
        # Method 3: By XPath with text
        try:
            search_btns = self.driver.find_elements(By.XPATH, "//input[@value='SEARCH']")
            for btn in search_btns:
                if btn.is_displayed():
                    self.js_click(btn)
                    self.logger.info("[BidDetail] Search button clicked (by XPath)")
                    return True
        except Exception as e:
            self.logger.debug(f"Button by XPath not found: {e}")
        
        self.logger.error("[BidDetail] Could not find SEARCH button")
        return False
