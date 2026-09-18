"""
Scraper Service — orchestrates all scrapers, normalizes, deduplicates and stores to DB.
Redis caching is OPTIONAL — works without Redis running.
"""
import json
from datetime import datetime, timezone
from typing import List, Dict, Optional

from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import settings
from app.models import Tender, CrawlLog
from app.scrapers import ALL_SCRAPERS
from app.utils.logger import get_logger
from app.services.sync_manager import sync_manager

logger = get_logger("scraper_service")

# ── Optional Redis ──────────────────────────────────────────────────────────
_redis = None
_redis_available = False

try:
    import redis as _redis_lib
    _r = _redis_lib.from_url(settings.REDIS_URL, decode_responses=True, socket_connect_timeout=2)
    _r.ping()
    _redis = _r
    _redis_available = True
    logger.info("Redis connected")
except Exception:
    logger.info("Redis not available — running without cache")

CACHE_TTL = 300  # 5 min


def _cache_key(source: str) -> str:
    return f"tenders:{source}"


def _save_to_redis(key: str, data: List[Dict]) -> None:
    if not _redis_available:
        return
    try:
        _redis.setex(key, CACHE_TTL, json.dumps(data, default=str))
    except Exception:
        pass


def _read_from_redis(key: str) -> Optional[List[Dict]]:
    if not _redis_available:
        return None
    try:
        raw = _redis.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def invalidate_cache(source: Optional[str] = None) -> None:
    if not _redis_available:
        return
    try:
        # If source is "gem", we must clear "tenders:gem:*" AND "tenders:all:*"
        # because the All Tenders page depends on every source.
        patterns = [f"tenders:{source}*", "tenders:all*"] if source else ["tenders:*"]
        for pattern in patterns:
            for key in _redis.scan_iter(pattern):
                _redis.delete(key)
    except Exception as exc:
        logger.debug("Redis clear error: %s", exc)


# ── DB helpers ────────────────────────────────────────────────────────────────
def _upsert_tender(db: Session, data: Dict) -> bool:
    """Insert tender; skip if (tender_id, source) already exists."""
    try:
        stmt = (
            pg_insert(Tender)
            .values(**data)
            .on_conflict_do_nothing(constraint="uq_tender_source")
        )
        db.execute(stmt)
        db.commit()
        return True
    except Exception as exc:
        db.rollback()
        logger.debug("Upsert skipped/error: %s", exc)
        return False


# ── Main orchestrator ─────────────────────────────────────────────────────────
def run_all_scrapers(db: Session, source_filter: Optional[str] = None, headless: Optional[bool] = None) -> Dict:
    """
    Run all (or one) scraper(s) over all configured keywords.
    Returns a summary dict.
    """
    # Clean up any stale 'running' CrawlLog rows from previous crashed runs
    stale = db.query(CrawlLog).filter(CrawlLog.status == "running")
    if source_filter:
        stale = stale.filter(CrawlLog.source == source_filter)
    stale_count = stale.update({"status": "failed", "error_message": "Cleaned up stale run", "completed_at": datetime.now(timezone.utc)})
    if stale_count:
        db.commit()
        logger.info("Cleaned up %d stale 'running' CrawlLog rows", stale_count)

    keywords = settings.SEARCH_KEYWORDS
    total_saved = 0
    summary = {}

    scrapers_to_run = [
        cls for cls in ALL_SCRAPERS
        if source_filter is None or cls.SOURCE == source_filter
    ]

    for scraper_cls in scrapers_to_run:
        scraper = scraper_cls(headless=headless)
        log = CrawlLog(source=scraper.SOURCE, status="running")
        db.add(log)
        db.commit()

        try:
            raw_results = scraper.run_all_keywords(keywords)
            saved = 0
            for item in raw_results:
                if _upsert_tender(db, item):
                    saved += 1
            total_saved += saved

            # Check if the scraper was stopped mid-run
            was_stopped = sync_manager.should_stop(scraper.SOURCE)
            log.status = "stopped" if was_stopped else "completed"
            log.tenders_found = str(len(raw_results))
            log.tenders_saved = str(saved)
            log.completed_at  = datetime.now(timezone.utc)
            db.commit()

            invalidate_cache(scraper.SOURCE)
            summary[scraper.SOURCE] = {"found": len(raw_results), "saved": saved}
            logger.info("[%s] %s — found=%d saved=%d", scraper.SOURCE, log.status, len(raw_results), saved)

        except Exception as exc:
            log.status = "failed"
            log.error_message = str(exc) or repr(exc)  # repr catches exceptions with empty str()
            log.completed_at  = datetime.now(timezone.utc)
            db.commit()
            logger.error("[%s] failed: %s", scraper.SOURCE, repr(exc))
            summary[scraper.SOURCE] = {"error": log.error_message}


    # Email reports are now only sent via manual Sync Engine trigger
    # (auto-send after scrape has been disabled)

    return {"total_saved": total_saved, "by_source": summary}


# ── Cached tender list ─────────────────────────────────────────────────────────
def get_tenders_from_db(
    db: Session,
    source: Optional[str] = None,
    limit: int = 100,
    offset: int = 0,
) -> List[Dict]:
    """Reads from DB using fast SQL pagination, cached using paginated Redis keys."""
    cache_key_src = source or "all"
    paged_key = f"tenders:{cache_key_src}:{limit}:{offset}"
    
    cached = _read_from_redis(paged_key)
    if cached is not None:
        return cached

    query = db.query(Tender)
    if source:
        query = query.filter(Tender.source == source)
        
    rows = query.order_by(Tender.created_at.desc()).offset(offset).limit(limit).all()
    result = [r.to_dict() for r in rows]
    
    _save_to_redis(paged_key, result)
    return result