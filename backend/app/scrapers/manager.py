import os
import time
from typing import Optional, Any

from app.config import settings
from app.utils.logger import get_logger

class ScraperManager:
    """
    Manages Playwright browser instance, persistent context, and provides pages for scrapers.
    Implements retry and challenge detection mechanisms.
    """
    def __init__(self, headless: Optional[bool] = None, profile_dir: Optional[str] = None):
        self.logger = get_logger("scraper.playwright_manager")
        self.headless = headless if headless is not None else settings.HEADLESS_MODE
        self.profile_dir = profile_dir or os.path.join(os.getcwd(), "data", "browser_profile")
        
        self.playwright: Optional[Any] = None
        self.context: Optional[Any] = None
        self.page: Optional[Any] = None
        self._launched_headless: Optional[bool] = None  # track how the context was launched
        
        os.makedirs(self.profile_dir, exist_ok=True)

    def start(self) -> Any:
        """Initialize Playwright and return a new or existing Page."""
        import asyncio
        import sys
        
        # On Windows, Playwright requires ProactorEventLoop to launch subprocesses.
        # Background threads (like those spawned by our API) might default to SelectorEventLoop,
        # which causes a `NotImplementedError` when trying to launch the browser.
        if sys.platform == "win32":
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

        try:
            asyncio.get_running_loop()
        except RuntimeError:
            try:
                asyncio.get_event_loop()
            except RuntimeError:
                asyncio.set_event_loop(asyncio.new_event_loop())

        from playwright.sync_api import sync_playwright

        # If headless mode changed (e.g. user switched to visible), restart the browser
        if self.playwright is not None and self._launched_headless != self.headless:
            self.logger.info(f"Headless mode changed ({self._launched_headless} → {self.headless}). Restarting browser...")
            self.stop()

        if self.playwright is None:
            is_windows = os.name == 'nt'
            use_real_browser = is_windows and not self.headless

            self.playwright = sync_playwright().start()

            # Build arg lists
            stealth_args = ["--disable-blink-features=AutomationControlled"]
            headless_args = stealth_args + [
                "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"
            ]
            fallback_ua = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

            # Try order: real browser channels first on Windows visible, else bundled Chromium
            candidates = []
            if use_real_browser:
                candidates = [
                    {"channel": "msedge", "args": stealth_args,  "user_agent": None},
                    {"channel": "chrome", "args": stealth_args,  "user_agent": None},
                    {"channel": None,     "args": headless_args, "user_agent": fallback_ua},
                ]
            else:
                candidates = [
                    {"channel": None, "args": headless_args, "user_agent": fallback_ua},
                ]

            profile_dirs = [self.profile_dir]

            self.context = None
            for cand in candidates:
                for pdir in profile_dirs:
                    try:
                        label = cand["channel"] or "Chromium"
                        self.logger.info(f"Trying {label} with profile: {pdir}")
                        kw = dict(
                            user_data_dir=pdir,
                            headless=self.headless,
                            args=cand["args"],
                            viewport={"width": 1280, "height": 900},
                        )
                        if cand["channel"]:
                            kw["channel"] = cand["channel"]
                        if cand["user_agent"]:
                            kw["user_agent"] = cand["user_agent"]
                        self.context = self.playwright.chromium.launch_persistent_context(**kw)
                        self.logger.info(f"Browser launched: {label}")
                        break
                    except Exception as e:
                        self.logger.warning(f"  {label} @ {pdir} failed: {repr(e)}")
                        import tempfile
                        tmp = tempfile.mkdtemp(prefix="pw_profile_")
                        profile_dirs = [tmp]  # next attempt uses temp dir
                if self.context:
                    break

            if not self.context:
                raise RuntimeError("All browser launch attempts failed. Check logs above.")



        if not self.context.pages:
            self.page = self.context.new_page()
        else:
            self.page = self.context.pages[0]

        return self.page

    def stop(self):
        """Graceful shutdown of browser and Playwright."""
        self.logger.info("Stopping Playwright browser...")
        try:
            if self.context:
                self.context.close()
                self.context = None
            if self.playwright:
                self.playwright.stop()
                self.playwright = None
            self._launched_headless = None
        except Exception as e:
            self.logger.error(f"Error during Playwright shutdown: {e}")

    def safe_goto(self, url: str, retries: int = 2, min_delay: float = 2.0, max_delay: float = 5.0) -> bool:
        """
        Navigate to a URL safely, dealing with Cloudflare or CAPTCHA challenges.
        Implements exponential backoff. Raises on persistent challenge.
        """
        assert self.page is not None, "Browser not started"
        
        for attempt in range(1, retries + 1):
            try:
                self.logger.info(f"Navigate attempt {attempt}/{retries}: {url}")
                self.page.goto(url, wait_until="domcontentloaded", timeout=30000)
                
                # Check for challenge pages
                if self._is_challenge_page():
                    self.logger.warning(f"Challenge detected on {url} (attempt {attempt})")
                    resolved = self._handle_challenge()
                    if not resolved:
                        if attempt >= retries:
                            raise Exception(
                                f"Cloudflare/CAPTCHA challenge on {url} — could not bypass after {retries} attempts. "
                                "Please open the site manually in a browser to solve the challenge."
                            )
                        # Still have retries left — backoff and try again
                        sleep_time = min(min_delay * (2 ** (attempt - 1)), max_delay)
                        self.logger.info(f"Retrying in {sleep_time:.1f}s...")
                        time.sleep(sleep_time)
                        continue
                
                return True
                
            except Exception as e:
                self.logger.warning(f"Attempt {attempt} failed: {e}")
                if attempt < retries:
                    sleep_time = min(min_delay * (2 ** (attempt - 1)), max_delay)
                    self.logger.info(f"Retrying in {sleep_time:.1f}s...")
                    time.sleep(sleep_time)
                else:
                    self.logger.error(f"Failed to load {url} after {retries} attempts: {e}")
                    raise
                    
        return False


    def _is_challenge_page(self) -> bool:
        """Detect Cloudflare, CAPTCHA, or Access Denied pages without false positives from CDNs."""
        try:
            title = self.page.title().lower()
            
            # 1. Strict title match (Cloudflare specific)
            strict_titles = ["just a moment...", "attention required! | cloudflare", "attention required!"]
            if any(st == title for st in strict_titles):
                return True
                
            # 2. Check visible body text (not raw HTML, to avoid CDN scripts)
            body_text = self.page.inner_text("body").lower() if self.page.locator("body").count() > 0 else ""
            
            visible_indicators = [
                "verifying you are human",
                "checking if the site connection is secure",
                "cloudflare-nginx",
                "prove you are human",
                "enable javascript and cookies to continue"
            ]
            
            if any(ind in body_text for ind in visible_indicators):
                return True
                
            return False
        except Exception as e:
            self.logger.warning(f"Error checking challenge page: {e}")
            return False

    def _handle_challenge(self) -> bool:
        """
        Wait for Cloudflare to resolve.
        - Visible mode (headless=False): wait up to 5 minutes for manual user interaction
        - Headless mode: wait 15 seconds for auto-resolve only
        Returns True if resolved, False if still blocked.
        """
        if not self.headless:
            # User can see the browser — give them time to solve CAPTCHA manually
            wait_seconds = 300  # 5 minutes
            self.logger.info(
                f"[VISIBLE MODE] Cloudflare challenge detected. "
                f"Please solve it in the open browser window. Waiting up to {wait_seconds}s..."
            )
        else:
            wait_seconds = 15
            self.logger.info("Waiting for challenge to automatically resolve...")

        try:
            for _ in range(wait_seconds):
                if not self._is_challenge_page():
                    self.logger.info("Challenge resolved successfully.")
                    return True
                time.sleep(1)
        except Exception as e:
            self.logger.error(f"Error while waiting for challenge: {e}")

        if not self.headless:
            self.logger.warning("Challenge was not solved within 5 minutes. Browser will close.")
        else:
            self.logger.warning("Challenge did not resolve automatically within time limit.")
        return False

