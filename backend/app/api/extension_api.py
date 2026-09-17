"""
Extension API — Routes for Chrome Extension communication.
The extension polls for pending jobs, scrapes data in the user's browser,
and uploads results back here.
"""
import uuid
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.database import get_db, SessionLocal
from app.models import Tender, CrawlLog
from app.config import settings
from app.utils.logger import get_logger

router = APIRouter(prefix="/api/extension", tags=["extension"])
logger = get_logger("extension_api")

# ── In-memory job queue (lightweight, no Redis needed) ───────────────────────
# Each job: { "job_id": str, "source": str, "status": str, "keywords": [], "created_at": str, ... }
_pending_jobs: List[Dict[str, Any]] = []
_completed_jobs: List[Dict[str, Any]] = []


def _validate_extension_key(x_extension_key: str = Header(None)):
    """Validate the extension API key from the request header."""
    expected = settings.EXTENSION_API_KEY
    if not expected:
        raise HTTPException(status_code=500, detail="EXTENSION_API_KEY not configured on server")
    if x_extension_key != expected:
        raise HTTPException(status_code=403, detail="Invalid extension API key")


# ── GET /config — Extension fetches search keywords ──────────────────────────
@router.get("/config")
def get_extension_config(_key=Depends(_validate_extension_key)):
    """Returns the list of search keywords and scraper sources for the extension."""
    return {
        "keywords": settings.SEARCH_KEYWORDS,
        "sources": ["tenderontime", "google"],
        "max_pages": settings.MAX_PAGES,
        "api_version": "1.0",
    }


# ── POST /jobs — Admin dashboard creates a scrape job ────────────────────────
@router.post("/jobs")
def create_extension_job(
    payload: Dict[str, Any],
    _key=Depends(_validate_extension_key),
):
    """
    Creates a pending scrape job for the extension to pick up.
    Called by the admin dashboard when user clicks 'Start Scraping'.
    """
    source = payload.get("source", "tenderontime")
    keywords = payload.get("keywords", settings.SEARCH_KEYWORDS)

    job = {
        "job_id": str(uuid.uuid4())[:8],
        "source": source,
        "status": "pending",
        "keywords": keywords,
        "max_pages": payload.get("max_pages", settings.MAX_PAGES),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    _pending_jobs.append(job)
    logger.info(f"Extension job created: {job['job_id']} for {source} with {len(keywords)} keywords")
    return {"job_id": job["job_id"], "status": "pending", "message": "Job queued for extension pickup"}


# ── GET /jobs — Extension polls for pending jobs ─────────────────────────────
@router.get("/jobs")
def get_pending_jobs(_key=Depends(_validate_extension_key)):
    """Extension calls this periodically to check for new scrape jobs."""
    pending = [j for j in _pending_jobs if j["status"] == "pending"]
    return {"jobs": pending, "count": len(pending)}


# ── POST /jobs/{job_id}/start — Extension begins working on a job ────────────
@router.post("/jobs/{job_id}/start")
def start_extension_job(job_id: str, _key=Depends(_validate_extension_key)):
    """Extension signals that it has picked up and started a job."""
    for job in _pending_jobs:
        if job["job_id"] == job_id:
            job["status"] = "running"
            logger.info(f"Extension job started: {job_id}")
            return {"status": "running", "job_id": job_id}
    raise HTTPException(status_code=404, detail="Job not found")


# ── POST /jobs/{job_id}/progress — Extension reports progress ────────────────
@router.post("/jobs/{job_id}/progress")
def update_job_progress(
    job_id: str,
    payload: Dict[str, Any],
    _key=Depends(_validate_extension_key),
):
    """Extension sends progress updates (current page, records found, etc.)."""
    for job in _pending_jobs:
        if job["job_id"] == job_id:
            job["progress"] = payload
            return {"status": "ok"}
    raise HTTPException(status_code=404, detail="Job not found")


# ── POST /jobs/{job_id}/complete — Extension marks job done ──────────────────
@router.post("/jobs/{job_id}/complete")
def complete_extension_job(
    job_id: str,
    payload: Dict[str, Any],
    _key=Depends(_validate_extension_key),
):
    """Extension signals job completion with summary stats."""
    for job in _pending_jobs:
        if job["job_id"] == job_id:
            job["status"] = payload.get("status", "completed")
            job["summary"] = payload.get("summary", {})
            job["completed_at"] = datetime.now(timezone.utc).isoformat()
            _completed_jobs.append(job)
            _pending_jobs.remove(job)
            logger.info(f"Extension job completed: {job_id} — {job.get('summary', {})}")
            return {"status": "completed", "job_id": job_id}
    raise HTTPException(status_code=404, detail="Job not found")


# ── GET /status — Dashboard checks if extension is alive ─────────────────────
@router.get("/status")
def get_extension_status(_key=Depends(_validate_extension_key)):
    """Returns current job queue status."""
    pending = [j for j in _pending_jobs if j["status"] == "pending"]
    running = [j for j in _pending_jobs if j["status"] == "running"]
    return {
        "pending_jobs": len(pending),
        "running_jobs": len(running),
        "completed_jobs": len(_completed_jobs),
        "recent_completed": _completed_jobs[-5:] if _completed_jobs else [],
    }


# ── POST /upload — Extension uploads scraped tender data ─────────────────────
@router.post("/upload")
def upload_tenders(
    payload: Dict[str, Any],
    _key=Depends(_validate_extension_key),
    db: Session = Depends(get_db),
):
    """
    Receives an array of tender objects from the extension and upserts them.
    Expected payload: { "source": "tenderontime", "keyword": "...", "tenders": [...] }
    """
    source = payload.get("source", "tenderontime")
    keyword = payload.get("keyword", "")
    tenders = payload.get("tenders", [])

    if not tenders:
        return {"message": "No tenders to upload", "saved": 0, "skipped": 0}

    saved = 0
    skipped = 0

    # Create a CrawlLog entry
    log = CrawlLog(
        source=source,
        keyword=keyword,
        status="running",
        tenders_found=str(len(tenders)),
    )
    db.add(log)
    db.commit()

    for t in tenders:
        try:
            if source == "google":
                from app.models import GoogleResult
                db.add(GoogleResult(
                    result_type="all",
                    title=(t.get("title") or "")[:800],
                    description=(t.get("summary") or "")[:5000],
                    link=(t.get("href") or "")[:1000],
                    search_query=keyword[:500],
                    keywords=json.dumps([keyword]),
                    page_excerpt="",
                    is_pdf="true" if (t.get("href") and ".pdf" in str(t.get("href")).lower()) else "false"
                ))
                saved += 1
            else:
                tender_data = {
                    "source": source,
                    "tender_id": (t.get("tender_id") or t.get("tot_ref") or "")[:200],
                    "title": (t.get("title") or "")[:580],
                    "description": (t.get("description") or t.get("summary") or "")[:5000] if t.get("description") or t.get("summary") else None,
                    "location": (t.get("location") or t.get("country") or "")[:280],
                    "start_date": (t.get("start_date") or t.get("posting_date") or "")[:100],
                    "end_date": (t.get("end_date") or t.get("deadline") or "")[:100],
                    "link": (t.get("link") or t.get("href") or "")[:780],
                    "keyword": keyword[:280] if keyword else None,
                }

                tender_data = {k: (v if v else None) for k, v in tender_data.items()}
                tender_data["source"] = source

                stmt = (
                    pg_insert(Tender)
                    .values(**tender_data)
                    .on_conflict_do_nothing(constraint="uq_tender_source")
                )
                result = db.execute(stmt)

                if result.rowcount > 0:
                    saved += 1
                else:
                    skipped += 1

        except Exception as exc:
            db.rollback()
            skipped += 1
            logger.debug(f"Upload upsert error: {exc}")

    if saved > 0:
        db.commit()

    # Update crawl log
    log.status = "completed"
    log.tenders_saved = str(saved)
    log.completed_at = datetime.now(timezone.utc)
    db.commit()

    logger.info(f"Extension upload: {source}/{keyword} — {saved} saved, {skipped} skipped out of {len(tenders)}")
    return {"message": "Upload complete", "saved": saved, "skipped": skipped, "total": len(tenders)}
