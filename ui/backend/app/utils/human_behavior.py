"""
HumanBehavior — Stripped version (Max Speed)
=====================================================
All stealth, proxies, and human delays have been removed
per user request to return bots to maximum automated speed.
Functions exist as empty stubs so scraper imports don't break.
"""
import time
from typing import Optional, List
from selenium.webdriver.chrome.options import Options

# ── Proxy List ─────────────────────────────────────────────────────────────────
PROXY_LIST: List[str] = []

def get_random_user_agent() -> str:
    return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"

def get_random_viewport() -> tuple:
    return (1920, 1080)

def get_random_proxy() -> Optional[str]:
    # Proxy rotation removed per request
    return None

def build_stealth_options(
    headless: bool = False,
    proxy: Optional[str] = None,
    user_agent: Optional[str] = None,
) -> Options:
    """Build standard extremely fast automated Chrome options, stripping stealth overhead blockages."""
    opts = Options()
    
    if headless:
        opts.add_argument("--headless=new")

    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--ignore-certificate-errors")
    opts.add_argument("--window-size=1920,1080")

    # Apply modern User-Agent
    ua = user_agent or get_random_user_agent()
    opts.add_argument(f"user-agent={ua}")
    
    return opts

def inject_stealth_scripts(driver) -> None:
    # Removed JS fingerprint injections
    pass

def human_delay(min_sec: float = 1.5, max_sec: float = 4.0) -> None:
    # Delay removed
    pass

def micro_delay(min_ms: int = 100, max_ms: int = 500) -> None:
    # Delay removed
    pass

def slow_scroll(driver, total_height: Optional[int] = None, step: int = 250, delay_range=(0.3, 0.8)) -> None:
    # Instant scroll instead of slow human emulation
    try:
        driver.execute_script("window.scrollTo(0, document.body.scrollHeight);")
    except Exception:
        pass

def scroll_to_element(driver, element) -> None:
    try:
        driver.execute_script(
            "arguments[0].scrollIntoView({behavior: 'auto', block: 'center'});",
            element
        )
    except Exception:
        pass

def random_mouse_move(driver) -> None:
    # Removed mouse movement overhead
    pass

def human_type(element, text: str, min_delay: float = 0.05, max_delay: float = 0.18) -> None:
    # Type everything instantly, bypass random key delays
    element.send_keys(text)

def warmup_session(driver) -> None:
    # Skip jumping to google/bing to build history
    pass

def random_between_keyword_delay() -> None:
    # Skip keyword gaps
    pass

def random_between_page_delay() -> None:
    # Skip pagination gaps
    pass
