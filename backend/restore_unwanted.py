import sys
import os
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from urllib.parse import urlparse
from app.database import SessionLocal
from app.models import GoogleResult

UNWANTED_DOMAINS = [
    "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com", "youtube.com", "youtu.be",
    "reddit.com", "quora.com", "pinterest.com", "threads.net", "tiktok.com", "t.me", "telegram.me",
    "indeed.com", "glassdoor.com", "naukri.com", "foundit.in", "monster.com", "ziprecruiter.com",
    "simplyhired.com", "careerbuilder.com", "shine.com", "internshala.com", "wellfound.com", "lever.co",
    "greenhouse.io", "workday.com", "github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com",
    "stackexchange.com", "superuser.com", "askubuntu.com", "npmjs.com", "pypi.org", "readthedocs.io",
    "readthedocs.org", "developer.mozilla.org", "developers.google.com", "docs.google.com", "docs.microsoft.com",
    "learn.microsoft.com", "docs.aws.amazon.com", "docs.oracle.com", "medium.com", "substack.com",
    "wordpress.com", "blogspot.com", "blogger.com", "tumblr.com", "reuters.com", "bbc.com", "cnn.com",
    "forbes.com", "ndtv.com", "indiatoday.in", "thehindu.com", "hindustantimes.com", "timesofindia.indiatimes.com",
    "economictimes.indiatimes.com", "moneycontrol.com", "business-standard.com", "researchgate.net",
    "academia.edu", "sciencedirect.com", "springer.com", "springerlink.com", "ieee.org", "acm.org",
    "jstor.org", "semanticscholar.org", "arxiv.org", "amazon.com", "amazon.in", "flipkart.com", "ebay.com",
    "walmart.com", "aliexpress.com", "etsy.com", "justdial.com", "tradeindia.com", "indiamart.com",
    "dropbox.com", "drive.google.com", "onedrive.live.com", "box.com", "scribd.com", "slideshare.net",
    "issuu.com", "google.com", "google.co.in", "bing.com", "yahoo.com", "duckduckgo.com"
]

UNWANTED_PATHS = [
    "/jobs/", "/job/", "/careers/", "/career/", "/vacancy/", "/vacancies/", "/employment/", "/recruitment/",
    "/blog/", "/blogs/", "/docs/", "/documentation/", "/wiki/", "/knowledge-base/", 
    "/login", "/signin", "/sign-in", "/signup", "/sign-up", "/register"
]

def is_unwanted(link):
    if not link: return False
    try:
        parsed = urlparse(link.lower())
        hostname = parsed.hostname or ""
        pathname = parsed.path or ""
        
        if any(hostname == d or hostname.endswith("." + d) for d in UNWANTED_DOMAINS):
            return True
            
        if any(p in pathname for p in UNWANTED_PATHS):
            return True
    except Exception:
        pass
    return False

def restore_unwanted():
    db = SessionLocal()
    try:
        unwanted = db.query(GoogleResult).filter(GoogleResult.result_type == "unwanted").all()
        print(f"Total bucketed unwanted items: {len(unwanted)}")
        
        restored = 0
        destroyed = 0
        for r in unwanted:
            if not is_unwanted(r.link):
                r.result_type = "all"
                restored += 1
            else:
                destroyed += 1
                
        db.commit()
        print(f"[+] Successfully rescued and restored {restored} fully valid tenders back to 'All Results'!")
        print(f"[-] Successfully retained {destroyed} truly invalid items in the Unwanted bucket.")
    finally:
        db.close()

if __name__ == "__main__":
    restore_unwanted()
