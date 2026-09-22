import sys
import os
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from urllib.parse import urlparse
from app.database import SessionLocal
from app.models import GoogleResult, Tender

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
    "/blog/", "/blogs/", "/article/", "/articles/", "/news/", "/post/", "/posts/", "/story/", "/stories/",
    "/forum/", "/forums/", "/community/", "/discussion/", "/discussions/", "/questions/", "/answers/",
    "/docs/", "/documentation/", "/wiki/", "/knowledge-base/", "/login", "/signin", "/sign-in", "/signup",
    "/sign-up", "/register", "/search", "/results"
]

def is_unwanted(link):
    if not link: return False
    try:
        parsed = urlparse(link.lower())
        hostname = parsed.hostname or ""
        pathname = parsed.path or ""
        
        # Check domain
        if any(hostname == d or hostname.endswith("." + d) for d in UNWANTED_DOMAINS):
            return True
            
        # Check paths
        if any(p in pathname for p in UNWANTED_PATHS):
            return True
    except Exception:
        pass
    return False

def clean_database():
    db = SessionLocal()
    try:
        print("[*] Checking GoogleResult database table...")
        g_results = db.query(GoogleResult).all()
        to_delete_g = []
        for r in g_results:
            if is_unwanted(r.link):
                to_delete_g.append(r)
                
        print(f"    Found {len(to_delete_g)} unwanted records out of {len(g_results)} Google results.")
        
        g_count = 0
        for r in to_delete_g:
            db.delete(r)
            g_count += 1
            if g_count % 100 == 0:
                db.commit()
        db.commit()
        print(f"    [+] Successfully DESTROYED {g_count} Google records.\n")
        
    except Exception as e:
        print(f"Error processing GoogleResult: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clean_database()
