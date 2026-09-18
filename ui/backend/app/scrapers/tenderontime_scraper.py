"""
TenderOnTime Scraper — Playwright Version
- Navigates to advanceSearch URL with keyword
- Uses PlaywrightBaseScraper and ScraperManager
- Scans up to 5 pages of tender listings
- Visits each tender detail page
- Checks Summary for keyword match
- Saves matching tenders
"""

import time
import re
from typing import List, Dict, Optional, Tuple, Any

from app.scrapers.playwright_base import PlaywrightBaseScraper

class TenderOnTimeScraper(PlaywrightBaseScraper):
    SOURCE = "tenderontime"

    def scrape(self, keyword: str) -> List[Dict]:
        """
        Main scraping method:
        1. Build search URL with keyword
        2. Scan up to 5 pages of listings
        3. Visit each tender detail page
        4. If keyword found in Summary → save tender
        """
        results = []

        try:
            # Step 1: Build search URL and navigate
            formatted = self._format_keyword(keyword)
            search_url = f"https://www.tendersontime.com/tenders/advanceSearch?q={formatted}"
            self.logger.info(f"[TenderOnTime] Loading: {search_url}")
            
            success = self.manager.safe_goto(search_url, min_delay=2.0)
            if not success:
                self.logger.error(f"[TenderOnTime] Failed to load initial search URL for {keyword}")
                return results

            # Step 1.5: Click the Filter button to load results
            try:
                # Target the exact button the user specified
                filter_btn = self.page.locator("button.search-btn[onclick*='filterTendersJS']")
                if filter_btn.count() > 0 and filter_btn.first.is_visible():
                    self.logger.info("[TenderOnTime] Clicking Filter button...")
                    filter_btn.first.click()
                else:
                    self.logger.warning("[TenderOnTime] Filter button not found or not visible.")
            except Exception as e:
                self.logger.warning(f"[TenderOnTime] Could not click Filter button: {e}")

            # Step 2: Wait for page to load results
            self.page.wait_for_timeout(3000)

            # Step 3: Get total result count
            result_count = self._get_result_count()
            self.logger.info(f"[TenderOnTime] Found {result_count} total results for '{keyword}'")

            if result_count == 0:
                self.logger.info("No results found, skipping.")
                return results

            # Step 4: Process up to 5 pages
            # Phase 1: Collect metadata from all pages
            page_num = 1
            max_pages = 5
            seen_urls = set()
            listings = []

            while page_num <= max_pages:
                self.logger.info(f"[TenderOnTime] Phase 1: Collecting page {page_num}/{max_pages}")
                self.page.wait_for_timeout(2000)

                items = self._find_tender_items()
                if not items and page_num == 1:
                    self.logger.warning(f"No tenders found for '{keyword}'")
                    break
                if not items:
                    self.logger.info(f"No more tenders on page {page_num}")
                    break

                self.logger.info(f"Found {len(items)} tenders on page {page_num}")
                for item in items:
                    try:
                        data = self._extract_listing_metadata(item, seen_urls)
                        if data:
                            listings.append(data)
                    except Exception as e:
                        self.logger.debug(f"Error extracting row: {e}")

                if not self._next_page():
                    self.logger.info("No more pages available")
                    break
                
                page_num += 1
                self.page.wait_for_timeout(2000)

            self.logger.info(f"[TenderOnTime] Phase 1 Complete. Found {len(listings)} links. Starting Phase 2.")

            # Phase 2: Visit each collected link
            for idx, data in enumerate(listings, 1):
                self.logger.info(f"  [TenderOnTime] Checking detail {idx}/{len(listings)}: {data['tot_ref'] or data['title'][:30]}")
                try:
                    tender = self._visit_and_check_summary(data, keyword)
                    if tender:
                        results.append(tender)
                        self.logger.info(f"    ✅ Saved: {tender.get('tender_id')}")
                except Exception as e:
                    self.logger.debug(f"    Detail error: {e}")

        except Exception as e:
            self.logger.error(f"Scrape error: {e}")

        self.logger.info(f"Total tenders found for '{keyword}': {len(results)}")
        return results

    def _format_keyword(self, keyword: str) -> str:
        return keyword.strip().replace(" ", "%20")

    def _get_result_count(self) -> int:
        try:
            result_elem = self.page.locator("#resultcount")
            if result_elem.count() > 0:
                text = result_elem.first.inner_text()
                match = re.search(r'\[(\d+)\]', text)
                if match:
                    return int(match.group(1))
        except Exception:
            pass
        return 0

    def _find_tender_items(self) -> List[Any]:
        selectors = [
            "div.listingbox.ng-scope",
            "div.listingbox",
            "div.tender-item"
        ]
        for sel in selectors:
            loc = self.page.locator(sel)
            if loc.count() > 0:
                return loc.all()
        return []

    def _extract_listing_metadata(self, item: Any, seen_urls: set) -> Optional[Dict]:
        try:
            title, href = self._extract_title_and_link(item)
            if not href or href in seen_urls:
                return None
            seen_urls.add(href)

            deadline = self._extract_deadline(item)
            tot_ref = self._extract_tot_ref(item)
            country = self._extract_country(item)

            return {
                "title": title,
                "href": href,
                "deadline": deadline,
                "tot_ref": tot_ref,
                "country": country
            }
        except Exception:
            return None

    def _visit_and_check_summary(self, data: Dict, keyword: str) -> Optional[Dict]:
        try:
            success = self.manager.safe_goto(data["href"], min_delay=1.0, max_delay=3.0)
            if not success:
                return None

            found, excerpt = self._check_summary(keyword)

            if not found:
                return None

            posting_date = self._get_posting_date()

            tender_data = self.normalize(
                source="tenderontime",
                tender_id=data["tot_ref"] or data["href"].strip("/").split("/")[-1],
                title=data["title"] or excerpt[:250],
                description=excerpt,
                location=data["country"],
                start_date=posting_date,
                end_date=data["deadline"],
                link=data["href"],
                keyword=keyword,
            )

            return tender_data

        except Exception as e:
            self.logger.debug(f"Process error checking details: {e}")
            return None

    def _extract_title_and_link(self, item: Any) -> Tuple[str, Optional[str]]:
        try:
            link_el = item.locator("a.truncatetext.ng-binding")
            if link_el.count() > 0:
                return link_el.first.inner_text().strip(), link_el.first.get_attribute("href")
        except:
            pass

        try:
            link_el = item.locator("a.listing-prod-view.mobbtn")
            if link_el.count() > 0:
                href = link_el.first.get_attribute("href")
                title_el = item.locator("a.truncatetext")
                title = title_el.first.inner_text().strip() if title_el.count() > 0 else ""
                return title, href
        except:
            pass
        return "", None

    def _extract_deadline(self, item: Any) -> str:
        try:
            deadline_el = item.locator("div.deadline strong.ng-binding")
            if deadline_el.count() > 0:
                return deadline_el.first.inner_text().strip()
                
            deadline_el2 = item.locator("xpath=.//p[contains(text(), 'Deadline')]/strong")
            if deadline_el2.count() > 0:
                return deadline_el2.first.inner_text().strip()
        except:
            pass
        return ""

    def _extract_tot_ref(self, item: Any) -> str:
        try:
            text = item.inner_text()
            match = re.search(r'TOT Ref\. No\.?:?\s*(\d+)', text)
            if match:
                return match.group(1)
        except:
            pass

        try:
            ref_el = item.locator("xpath=.//p[contains(text(), 'TOT Ref. No.')]/strong")
            if ref_el.count() > 0:
                return ref_el.first.inner_text().strip()
        except:
            pass
        return ""

    def _extract_country(self, item: Any) -> str:
        try:
            flag_span = item.locator("span.flag-icon")
            if flag_span.count() > 0:
                parent = flag_span.first.locator("xpath=..")
                strong = parent.locator("strong")
                if strong.count() > 0:
                    return strong.first.inner_text().strip()
        except:
            pass

        try:
            text = item.inner_text()
            countries = ['India', 'South Korea', 'USA', 'Spain', 'United Kingdom', 'Belgium', 'Czech Republic']
            for country in countries:
                if country in text:
                    return country
        except:
            pass
        return ""

    def _check_summary(self, keyword: str) -> Tuple[bool, str]:
        phrase = keyword.lower()
        try:
            summaries = self.page.locator("strong.strval").all()
            for s in summaries:
                try:
                    parent = s.locator("xpath=..")
                    if parent.count() > 0 and "Summary:" in parent.first.inner_text():
                        txt = s.inner_text().lower()
                        if phrase in txt:
                            idx = txt.find(phrase)
                            start = max(0, idx - 60)
                            end = min(len(txt), idx + len(phrase) + 60)
                            return True, s.inner_text()[start:end]
                except:
                    pass

            # Fallback
            for s in summaries:
                try:
                    txt = s.inner_text().lower()
                    if phrase in txt and len(txt) > 20:
                        idx = txt.find(phrase)
                        start = max(0, idx - 60)
                        end = min(len(txt), idx + len(phrase) + 60)
                        return True, s.inner_text()[start:end]
                except:
                    pass
        except Exception:
            pass
        return False, ""

    def _get_posting_date(self) -> str:
        try:
            dates = self.page.locator("strong.strval").all()
            for d in dates:
                try:
                    parent = d.locator("xpath=..")
                    if parent.count() > 0 and "Posting Date:" in parent.first.inner_text():
                        return d.inner_text().strip()
                except:
                    pass
        except:
            pass
        return ""

    def _next_page(self) -> bool:
        try:
            next_btn = self.page.locator("li.nextclass a")
            if next_btn.count() > 0 and next_btn.first.is_visible():
                next_btn.first.evaluate("el => el.click()")
                self.page.wait_for_timeout(3000)
                return True
                
            next_btns = self.page.locator("xpath=//a[contains(text(), 'Next')]").all()
            for btn in next_btns:
                if btn.is_visible():
                    btn.evaluate("el => el.click()")
                    self.page.wait_for_timeout(3000)
                    return True
        except:
            pass
        return False