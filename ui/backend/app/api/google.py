"""
Google Search Scraper - COMPLETE MDM KEYWORD SEARCH
- Searches ALL MDM keywords with exact phrase quotes
- Handles pagination correctly (up to 7 pages per keyword)
- No date picker errors (uses URL parameters)
- Extracts all results and filters by page content
"""

import re
import time
import random
from typing import List, Dict, Optional, Tuple
from urllib.parse import quote, urlparse, parse_qs

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException
from webdriver_manager.chrome import ChromeDriverManager
import pandas as pd
import json

import sys
import os
# Add the backend directory to sys.path so we can import 'app' modules when running directly
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

from app.database import SessionLocal
from app.models import GoogleResult
from app.utils.human_behavior import (
    build_stealth_options, inject_stealth_scripts, warmup_session,
    slow_scroll, human_delay, random_between_keyword_delay,
    random_between_page_delay, random_mouse_move, micro_delay, get_random_proxy
)

# Force UTF-8 for Windows console support
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')


class GoogleSearchScraper:
    """
    Google search scraper with exact phrase search and proper pagination
    """
    
    def __init__(self, headless: bool = False, date_from: str = None, date_to: str = None):
        self.headless = headless
        self.driver = None
        self.wait = None
        self.keyword_to_find = "material codification"
        self.results_all = []
        self.results_filtered = []
        self.captcha_callback = None
        
        # ALL MDM KEYWORDS (from your boss's document)
        self.mdm_keywords = [
            # Core MDM Keywords
            "material codification",
            "Data Cataloguing",
            "Master data management",
            "Data Enrichment",
            "physical verification",
            "asset valuation",
            "material cataloguing",
            "Asset Verification",
            "bill of material",
            "sap master data",
            "Material Data Governance"
        ]
        
        # Suffixes to append to each keyword
        self.suffixes = [
            "tenders"
        ]
        
        # Parse dates
        self.date_from = date_from if date_from else None
        self.date_to = date_to if date_to else None
        
        if self.date_from and self.date_to:
            print(f"[DATE] Range: {self.date_from} to {self.date_to}")
        else:
            print("[DATE] No date filter")
        
        print(f"[INFO] Total Keywords: {len(self.mdm_keywords)}")
        print(f"[INFO] Total Suffixes per Keyword: {len(self.suffixes)}")
        print(f"[INFO] Total Searches: {len(self.mdm_keywords) * len(self.suffixes)}")
        
        self._setup_driver()
    
    def _setup_driver(self):
        """Setup Chrome driver with full anti-detection stealth."""
        proxy = get_random_proxy()
        opts = build_stealth_options(headless=self.headless, proxy=proxy)

        service = Service(ChromeDriverManager().install())
        self.driver = webdriver.Chrome(service=service, options=opts)
        self.wait = WebDriverWait(self.driver, 20)

        # Inject JS stealth patches immediately
        inject_stealth_scripts(self.driver)

        print(f"[OK] Browser opened with stealth mode (proxy={'yes' if proxy else 'no'})!")

        # Warm up session: visit a neutral page first
        print("[INIT] Warming up browser session...")
        warmup_session(self.driver)
        print("[OK] Session warmed up!")
    
    def _build_search_url(self, base_phrase: str, suffix: str, page: int = 0) -> str:
        """Build Google search URL with exact phrase quotes"""
        phrase_with_quotes = f'"{base_phrase}"'
        query = f"{phrase_with_quotes} {suffix}"
        encoded_query = quote(query)
        
        url = f"https://www.google.com/search?q={encoded_query}"
        
        if self.date_from and self.date_to:
            url += f"&tbs=cdr:1,cd_min:{self.date_from},cd_max:{self.date_to}"
        
        if page > 0:
            url += f"&start={page * 10}"
        
        return url
    
    def _extract_description(self, block) -> str:
        """Extract description from result block"""
        try:
            desc_elem = block.find_element(By.CSS_SELECTOR, "div.VwiC3b, div[data-snf], div[class*='IsZvec']")
            if desc_elem:
                text = desc_elem.text
                if text and len(text) > 20:
                    return text[:500]
        except:
            pass
        return ""
    
    def _extract_keywords(self, text: str, original_query: str) -> List[str]:
        """Extract relevant keywords"""
        keywords = []
        text_lower = text.lower()
        query_lower = original_query.lower()
        
        mdm_keywords_list = [
            "material codification", "material code", "codification",
            "data cataloguing", "master data management", "data governance",
            "vendor data governance", "material master", "data enrichment",
            "data validation", "deduplication", "data cleansing",
            "data standardization", "cataloguing", "service master",
            "vendor master", "asset verification", "bill of material",
            "tender", "bid", "procurement", "rfp",
            "codification of material"
        ]
        
        for kw in mdm_keywords_list:
            if kw.lower() in text_lower:
                keywords.append(kw)
        
        if query_lower in text_lower:
            keywords.append(original_query)
        
        return list(set(keywords))[:10]
    
    @staticmethod
    def _canonical_url(link: str) -> str:
        """
        Return a normalized form of a URL for deduplication.
        Strips query-string and trailing slashes so that:
          https://example.com/page?tracking=abc123
          https://example.com/page?tracking=xyz999
        are treated as the same page.
        """
        try:
            p = urlparse(link.strip())
            return f"{p.netloc}{p.path}".rstrip('/')
        except Exception:
            return link

    def _extract_result_block(self, block, original_query: str, base_phrase: str) -> Optional[Dict]:
        """Extract a single result block"""
        try:
            title_elem = block.find_element(By.CSS_SELECTOR, "h3")
            title = title_elem.text.strip()
            if not title or len(title) < 3:
                return None

            link_elem = block.find_element(By.CSS_SELECTOR, "a[href]")
            raw_link = link_elem.get_attribute('href') or ''

            # Strategy 1: Old-style Google redirect /url?q=<real_url>
            if "/url?" in raw_link:
                parsed = urlparse(raw_link)
                params = parse_qs(parsed.query)
                link = params.get('q', [raw_link])[0]

            # Strategy 2: New encrypted /goto?url=CAES... — Google started using
            # session-unique encrypted tokens in mid-2025. The same underlying page
            # gets a DIFFERENT token every single search run, breaking exact-string
            # deduplication. We recover the real URL from the <cite> element instead.
            elif 'google.com' in raw_link and ('/goto' in raw_link or '/search' in raw_link):
                link = None
                try:
                    cite = block.find_element(By.CSS_SELECTOR, 'cite')
                    cite_text = cite.text.strip()
                    if cite_text:
                        # cite shows: "www.example.com › page › subpage"
                        # Take the first segment as the domain and reconstruct
                        parts = cite_text.split(' › ')
                        domain_part = parts[0].strip()
                        if '.' in domain_part and 'google' not in domain_part:
                            prefix = '' if domain_part.startswith('http') else 'https://'
                            path_part = '/'.join(p.strip() for p in parts[1:]) if len(parts) > 1 else ''
                            link = prefix + domain_part + ('/' + path_part if path_part else '')
                except Exception:
                    pass

                if not link:
                    return None  # Can't recover real URL — skip
            else:
                link = raw_link

            if not link or link.startswith('/search'):
                return None
            
            description = self._extract_description(block)
            keywords = self._extract_keywords(f"{title} {description}", original_query)
            
            return {
                'title': title,
                'description': description,
                'link': link,
                'keywords': keywords,
                'search_query': original_query,
                'base_phrase': base_phrase,
                'keyword_found_on_page': False,
                'page_excerpt': '',
                'is_pdf': link.lower().endswith('.pdf') or '.pdf?' in link.lower()
            }
            
        except Exception:
            return None
    
    def _extract_page_results(self, original_query: str, base_phrase: str) -> List[Dict]:
        """Extract ALL results from current page"""
        results = []
        seen_links = set()
        
        try:
            result_blocks = self.driver.find_elements(By.CSS_SELECTOR, "div.g, div[class*='tF2Cxc']")
            
            for block in result_blocks:
                try:
                    result = self._extract_result_block(block, original_query, base_phrase)
                    if result and result['link'] and result['link'] not in seen_links:
                        seen_links.add(result['link'])
                        results.append(result)
                except:
                    continue
                    
        except Exception as e:
            print(f"      Error extracting: {e}")
        
        return results
    
    def _go_to_next_page(self) -> bool:
        """
        Click the next page button - FIXED VERSION
        Handles Google's pagination correctly
        """
        try:
            # METHOD 1: Look for Next button by ID
            try:
                next_button = self.driver.find_element(By.ID, "pnnext")
                if next_button and next_button.is_displayed() and next_button.is_enabled():
                    self.driver.execute_script("arguments[0].scrollIntoView(true);", next_button)
                    time.sleep(0.5)
                    self.driver.execute_script("arguments[0].click();", next_button)
                    print(f"      ✅ Clicked Next button")
                    time.sleep(3)
                    return True
            except:
                pass
            
            # METHOD 2: Look for Next button by aria-label
            try:
                next_button = self.driver.find_element(By.CSS_SELECTOR, "a[aria-label='Next page']")
                if next_button and next_button.is_displayed():
                    self.driver.execute_script("arguments[0].scrollIntoView(true);", next_button)
                    time.sleep(0.5)
                    self.driver.execute_script("arguments[0].click();", next_button)
                    print(f"      ✅ Clicked Next button")
                    time.sleep(3)
                    return True
            except:
                pass
            
            # METHOD 3: Find next page number link
            try:
                current_url = self.driver.current_url
                current_start = 0
                match = re.search(r'start=(\d+)', current_url)
                if match:
                    current_start = int(match.group(1))
                current_page = (current_start // 10) + 1
                next_page_num = current_page + 1
                
                next_page_links = self.driver.find_elements(By.XPATH, f"//a[contains(@href, 'start={next_page_num * 10}')]")
                for link in next_page_links:
                    if link.is_displayed():
                        self.driver.execute_script("arguments[0].scrollIntoView(true);", link)
                        time.sleep(0.5)
                        self.driver.execute_script("arguments[0].click();", link)
                        print(f"      ✅ Clicked page {next_page_num}")
                        time.sleep(3)
                        return True
            except:
                pass
            
            # METHOD 4: Look for any link with "Next" text
            try:
                next_links = self.driver.find_elements(By.XPATH, "//a[contains(text(), 'Next')]")
                for link in next_links:
                    if link.is_displayed() and link.is_enabled():
                        self.driver.execute_script("arguments[0].scrollIntoView(true);", link)
                        time.sleep(0.5)
                        self.driver.execute_script("arguments[0].click();", link)
                        print(f"      ✅ Clicked Next link")
                        time.sleep(3)
                        return True
            except:
                pass
            
            print(f"      🏁 No more pages")
            return False
            
        except Exception as e:
            print(f"      ❌ Error clicking next: {e}")
            return False

    # ── CAPTCHA SIGNALS (Step 2 only) ──────────────────────────────────────
    _CAPTCHA_TITLES = (
        "just a moment", "attention required", "security check",
        "access denied", "are you a robot", "bot verification",
        "ddos protection", "please verify", "human verification",
        "unusual traffic", "sorry", "before you continue"
    )
    _CAPTCHA_SELECTORS = [
        "#captcha-form",
        "form[action*='captcha']",
        "div.cf-challenge-running",   # Cloudflare
        "div#challenge-stage",        # Cloudflare
        "iframe[src*='recaptcha']",   # reCAPTCHA
        "div.g-recaptcha",
        "div#px-captcha",             # PerimeterX
    ]

    def _is_captcha_page(self) -> bool:
        """Return True if the current page looks like a CAPTCHA / bot-block page."""
        try:
            title = self.driver.title.lower()
            if any(sig in title for sig in self._CAPTCHA_TITLES):
                return True
            for sel in self._CAPTCHA_SELECTORS:
                if self.driver.find_elements(By.CSS_SELECTOR, sel):
                    return True
        except Exception:
            pass
        return False

    def _check_page_for_keyword(self, url: str, keyword: str) -> Tuple[bool, str]:
        """
        Step 2 — Open each result URL and check whether the target keyword
        appears in the page body.

        CAPTCHA / block detection:
          • If any CAPTCHA signal is found → immediately skip (return False)
            and move on to the next link.  No user prompt, no waiting.
        """
        print(f"         🔍 Checking: {url[:80]}...")

        try:
            self.driver.get(url)
            human_delay(1.5, 3.5)        # natural load wait

            # ── Step 2: CAPTCHA / block → WAIT FOR USER ────────────────
            if self._is_captcha_page():
                print("            ⏭️  CAPTCHA / block detected — please resolve it!")
                if self.captcha_callback:
                    self.captcha_callback()
                else:
                    input("            Press Enter after solving...")

            # Extra safety: short extra wait then re-check once
            time.sleep(1.0)
            if self._is_captcha_page():
                print("            ⏭️  Still blocked after wait — treating as skipped.")
                return False, ""

            # ── Keyword scan ───────────────────────────────────────────────
            try:
                page_text = self.driver.find_element(By.TAG_NAME, "body").text
            except Exception:
                print("            ⚠️  Could not read page body — skipping.")
                return False, ""

            page_text_lower = page_text.lower()
            keyword_lower   = keyword.lower()

            if keyword_lower in page_text_lower:
                idx    = page_text_lower.find(keyword_lower)
                start  = max(0, idx - 100)
                end    = min(len(page_text), idx + len(keyword) + 100)
                excerpt = ' '.join(page_text[start:end].strip().split())
                print("            ✅ Keyword FOUND!")
                return True, excerpt[:500]
            else:
                print("            ❌ Keyword NOT found")
                return False, ""

        except Exception as e:
            print(f"            ⚠️  Error loading page: {str(e)[:100]} — skipping.")
            return False, ""
    
    def search_with_suffix(self, base_phrase: str, suffix: str, max_pages: int = 7) -> List[Dict]:
        """Search with exact phrase + suffix"""
        query_display = f'"{base_phrase}" {suffix}'
        all_results = []
        
        print(f"\n{'='*70}")
        print(f"🔍 SEARCHING: {query_display}")
        if self.date_from and self.date_to:
            print(f"📅 Date Range: {self.date_from} to {self.date_to}")
        print(f"{'='*70}")
        
        for page in range(max_pages):
            print(f"\n   📄 Page {page + 1}/{max_pages}...")
            
            search_url = self._build_search_url(base_phrase, suffix, page)
            
            try:
                self.driver.get(search_url)
                human_delay(2.5, 5.0)  # realistic load wait — not constant
                inject_stealth_scripts(self.driver)

                # Reliable Captcha Check for Google via class heuristic array
                is_captcha = self._is_captcha_page()
                
                if is_captcha:
                    print("   ⚠️ Google Captcha detected! Please solve manually...")
                    if self.captcha_callback:
                        self.captcha_callback()
                    else:
                        input("   Press Enter after solving...")
                
                try:
                    self.wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, "div#search")))
                    human_delay(1.5, 3.0)
                except Exception:
                    pass

                # Slow human-like scroll before extracting (also loads lazy elements)
                slow_scroll(self.driver, total_height=1200, step=200, delay_range=(0.3, 0.7))
                random_mouse_move(self.driver)

                page_results = self._extract_page_results(query_display, base_phrase)
                print(f"      ✅ Found {len(page_results)} results")
                all_results.extend(page_results)
                
                # Human-like delay between pages
                if page < max_pages - 1:
                    if not self._go_to_next_page():
                        print(f"      🏁 No more pages available")
                        break

                random_between_page_delay()

            except Exception as e:
                print(f"      ❌ Error: {e}")
                break
        
        print(f"\n   ✅ Total results: {len(all_results)}")
        return all_results
    
    def filter_results_by_page_content(self, results: List[Dict]) -> List[Dict]:
        """Filter results by actual page content"""
        print("\n" + "="*70)
        print("🔍 FILTERING RESULTS BY EXACT PAGE CONTENT")
        print("="*70)
        
        filtered_results = []
        total = len(results)
        
        for idx, result in enumerate(results, 1):
            target_keyword = result.get('base_phrase', self.keyword_to_find)
            print(f"\n   [{idx}/{total}] Processing: {result['title'][:60]}...")
            print(f"      🎯 Target Keyword: '{target_keyword}'")
            
            found, excerpt = self._check_page_for_keyword(result['link'], target_keyword)
            
            result['keyword_found_on_page'] = found
            result['page_excerpt'] = excerpt
            
            if found:
                filtered_results.append(result)
                print(f"            ✅ KEEPING")
                # Progressive save logic
                if hasattr(self, "on_new_results") and callable(self.on_new_results):
                    self.on_new_results([result], "filtered")
            else:
                print(f"            ❌ FILTERING OUT")
            
            time.sleep(random.uniform(1, 2))
        
        print(f"\n   📊 Final: {len(filtered_results)}/{total} kept")
        return filtered_results
    
    def run_full_search(self, max_pages: int = 7) -> Tuple[List[Dict], List[Dict]]:
        """Run full search with all keywords and all suffixes"""
        all_results = []
        seen_canonical = set()  # Track netloc+path to catch same page with different query strings
        
        print("="*70)
        print("🚀 GOOGLE SEARCH SCRAPER - ALL MDM KEYWORDS")
        print("="*70)
        print(f"📋 Keywords: {len(self.mdm_keywords)}")
        print(f"📋 Suffixes per Keyword: {len(self.suffixes)}")
        print(f"📊 Total Searches: {len(self.mdm_keywords) * len(self.suffixes)}")
        print(f"📄 Max Pages per Search: {max_pages}")
        if self.date_from and self.date_to:
            print(f"📅 Date Range: {self.date_from} to {self.date_to}")
        print("="*70)
        
        try:
            total_searches = len(self.mdm_keywords) * len(self.suffixes)
            search_count = 0
            
            for keyword in self.mdm_keywords:
                for suffix in self.suffixes:
                    search_count += 1
                    print(f"\n{'='*60}")
                    print(f"📌 Search {search_count}/{total_searches}")
                    print(f"🔑 Keyword: \"{keyword}\"")
                    print(f"🏷️ Suffix: {suffix}")
                    print(f"{'='*60}")

                    # Random mouse movement before each keyword (human-like)
                    random_mouse_move(self.driver)

                    results = self.search_with_suffix(keyword, suffix, max_pages)

                    new_count = 0
                    new_results = []
                    for result in results:
                        canon = self._canonical_url(result.get('link', ''))
                        if canon and canon not in seen_canonical:
                            seen_canonical.add(canon)
                            all_results.append(result)
                            new_results.append(result)
                            new_count += 1

                    print(f"\n   📊 New unique results: {new_count}")
                    print(f"   📈 Total unique so far: {len(all_results)}")
                    
                    # Stream all unique results to DB immediately
                    if hasattr(self, "on_new_results") and callable(self.on_new_results) and new_results:
                        self.on_new_results(new_results, "all")

                    # Human-like delay between keyword searches (8–18s Gaussian)
                    if search_count < total_searches:
                        print(f"\n⏸️  Human-like pause between keywords...")
                        random_between_keyword_delay()


        except KeyboardInterrupt:
            print("\n⚠️ Interrupted by user")
        
        self.results_all = all_results
        self.results_filtered = self.filter_results_by_page_content(all_results)
        
        return self.results_all, self.results_filtered
    
    def close(self):
        """Close the browser"""
        if self.driver:
            print("\n📊 Closing browser in 5 seconds...")
            time.sleep(5)
            self.driver.quit()
            print("Browser closed.")
    
    def export_to_excel(self, results_all: List[Dict], results_filtered: List[Dict],
                        filename_all: str = "mdm_all_results.xlsx",
                        filename_filtered: str = "mdm_filtered_results.xlsx"):
        """Export results to Excel"""
        try:
            df_all = pd.DataFrame(results_all)
            df_all.to_excel(filename_all, index=False)
            print(f"\n📁 All results: {filename_all} ({len(df_all)} rows)")
            
            if results_filtered:
                df_filtered = pd.DataFrame(results_filtered)
                df_filtered.to_excel(filename_filtered, index=False)
                print(f"📁 Filtered results: {filename_filtered} ({len(df_filtered)} rows)")
            
        except Exception as e:
            print(f"\n❌ Export error: {e}")
    
    def print_summary(self, results_all: List[Dict], results_filtered: List[Dict]):
        """Print summary"""
        print("\n" + "="*70)
        print("📊 SEARCH SUMMARY")
        print("="*70)
        print(f"Total Unique Results: {len(results_all)}")
        print(f"Results with keyword on page: {len(results_filtered)}")
        if results_all:
            print(f"Keep Rate: {(len(results_filtered)/len(results_all)*100):.1f}%")

    def save_to_database(self, results_all: List[Dict], results_filtered: List[Dict]):
        """Save results to the database"""
        print("\n" + "="*70)
        print("💾 SAVING TO DATABASE")
        print("="*70)
        
        db = SessionLocal()
        try:
            saved_all = self._save_results_type(db, results_all, "all")
            saved_filtered = self._save_results_type(db, results_filtered, "filtered")
            db.commit()
            print(f"✅ Successfully saved {saved_all} ALL results to database.")
            print(f"✅ Successfully saved {saved_filtered} FILTERED results to database.")
        except Exception as e:
            print(f"❌ Database save error: {e}")
            db.rollback()
        finally:
            db.close()

    def _save_results_type(self, db, results: List[Dict], result_type: str) -> int:
        """Save results to DB, deduplicating by canonical URL (netloc+path, no query string)."""
        existing_rows = db.query(GoogleResult.link)\
                          .filter(GoogleResult.result_type == result_type)\
                          .all()
        # Canonical set: strip query strings so google tracking params don't break dedup
        existing_canonical = {self._canonical_url(r.link) for r in existing_rows}

        count = 0
        for r in results:
            link = (r.get("link") or "").strip()
            if not link:
                continue
            canon = self._canonical_url(link)
            if canon in existing_canonical:
                continue

            existing_canonical.add(canon)
            kws = r.get("keywords", [])
            db.add(GoogleResult(
                result_type  = result_type,
                title        = (r.get("title") or "")[:800],
                description  = r.get("description") or "",
                link         = link[:1000],
                search_query = (r.get("search_query") or "")[:500],
                keywords     = json.dumps(kws),
                page_excerpt = r.get("page_excerpt") or "",
                is_pdf       = "true" if r.get("is_pdf") else "false",
            ))
            count += 1

        return count


def main():
    """Main function"""
    import time
    start_time = time.time()
    
    # Configure date range (set to None for no filter)
    date_from = None    # March 1, 2026
    date_to = None        # March 31, 2026
    
    # Set to None for no date filter
    # date_from = None
    # date_to = None
    
    scraper = GoogleSearchScraper(headless=False, date_from=date_from, date_to=date_to)
    
    try:
        results_all, results_filtered = scraper.run_full_search(max_pages=7)
        
        scraper.print_summary(results_all, results_filtered)
        
        if results_all:
            scraper.export_to_excel(results_all, results_filtered)
            scraper.save_to_database(results_all, results_filtered)
        else:
            print("\n❌ No results found.")
    
    except Exception as e:
        print(f"\n❌ Error: {e}")
    
    finally:
        scraper.close()
    
    elapsed_time = time.time() - start_time
    print(f"\n⏱️ Total Time: {elapsed_time:.2f} seconds")


if __name__ == "__main__":
    main()