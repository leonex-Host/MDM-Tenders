"""
API Routes — /tenders  /search  /export  /sources  /stats
"""
import io
import uuid
from typing import Optional

import pandas as pd
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db, SessionLocal
from app.models import Tender, CrawlLog
from app.schemas import TenderListResponse, TenderResponse, StatsResponse, ScrapeRequest
from app.services.scraper_service import (
    run_all_scrapers,
    get_tenders_from_db,
    invalidate_cache,
)
from app.services.sync_manager import sync_manager
from app.auth.dependencies import get_current_user
from app.utils.logger import get_logger

router = APIRouter(prefix="/api", tags=["tenders"])
logger = get_logger("api.routes")


# ── Background scrape helper ────────────────────────────────────────────────
def _background_scrape(source: Optional[str], db: Session) -> None:
    try:
        run_all_scrapers(db, source_filter=source)
    except Exception as exc:
        logger.error("Background scrape error: %s", exc)
    finally:
        db.close()


# ── GET /tenders ─────────────────────────────────────────────────────────────
@router.get("/tenders", response_model=TenderListResponse)
def list_tenders(
    source: Optional[str] = Query(None, description="gem | tender247 | tenderdetail | tenderontime | biddetail"),
    limit:  int = Query(100, ge=1, le=10000),
    offset: int = Query(0,   ge=0),
    db: Session = Depends(get_db),
):
    """Paginated tender list from DB (Redis-cached)."""
    # Total count
    q = db.query(Tender)
    if source:
        q = q.filter(Tender.source == source)
    total = q.count()

    rows = get_tenders_from_db(db, source=source, limit=limit, offset=offset)
    return TenderListResponse(
        total=total,
        page=(offset // limit) + 1,
        limit=limit,
        results=rows,
    )


# ── GET /tenders/{tender_uuid} ─────────────────────────────────────────────────────────
@router.get("/tenders/{tender_uuid}", response_model=TenderResponse)
def get_tender(tender_uuid: uuid.UUID, db: Session = Depends(get_db)):
    row = db.query(Tender).filter(Tender.id == tender_uuid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Tender not found")
    return row


# ── DELETE /tenders/{tender_uuid} ─────────────────────────────────────────────────────
@router.delete("/tenders/{tender_uuid}")
def delete_tender(tender_uuid: uuid.UUID, db: Session = Depends(get_db)):
    row = db.query(Tender).filter(Tender.id == tender_uuid).first()
    if not row:
        raise HTTPException(status_code=404, detail="Tender not found")
    db.delete(row)
    db.commit()
    invalidate_cache()
    return {"message": "Tender deleted successfully", "id": str(tender_uuid)}



# ── GET /search ───────────────────────────────────────────────────────────────
@router.get("/search")
def search_and_scrape(
    background_tasks: BackgroundTasks,
    keyword: Optional[str] = Query(None, description="Keyword to scrape (blank = all configured)"),
    source:  Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _user = Depends(get_current_user),   # ← JWT required
):
    """
    Triggers a background scrape then returns existing DB results.
    Scraping happens asynchronously — results appear on next /tenders call.
    Requires: Authorization: Bearer <access_token>
    """
    scrape_db = SessionLocal()
    background_tasks.add_task(_background_scrape, source, scrape_db)

    rows = get_tenders_from_db(db, source=source, limit=500)
    return {
        "message": "Scraping started in background",
        "existing_results": len(rows),
        "results": rows,
    }


# ── POST /stop-sync ───────────────────────────────────────────────────────────
@router.post("/stop-sync")
def stop_sync(
    source: Optional[str] = Query(None),
    _user = Depends(get_current_user),   # ← JWT required
):
    """Halts an ongoing scraping process. Requires auth."""
    target = source or "all"
    sync_manager.set_stop_flag(target)
    logger.info(f"Stop sync requested for source: {target}")
    return {"message": f"Stop flag set for '{target}' scrapers"}


# ── GET /sync-status ──────────────────────────────────────────────────────────
@router.get("/sync-status")
def get_sync_status(source: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Check if scrapers are currently running."""
    from datetime import datetime, timezone, timedelta

    # Auto-expire stale 'running' rows older than 10 minutes (crashed/restarted)
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=10)
    stale_q = db.query(CrawlLog).filter(
        CrawlLog.status == "running",
        CrawlLog.started_at < cutoff
    )
    stale_count = stale_q.update({
        "status": "failed",
        "error_message": "Auto-expired stale run",
        "completed_at": datetime.now(timezone.utc)
    })
    if stale_count:
        db.commit()

    # Check DB for actual running rows
    q = db.query(CrawlLog).filter(CrawlLog.status == "running")
    if source and source != "all":
        q = q.filter(CrawlLog.source == source)
    count = q.count()
    return {"is_running": count > 0, "active_count": count}


# ── GET /sources ──────────────────────────────────────────────────────────────
@router.get("/sources")
def list_sources(db: Session = Depends(get_db)):
    sources = db.query(Tender.source).distinct().all()
    return {"sources": [s[0] for s in sources]}


# ── GET /stats ────────────────────────────────────────────────────────────────
@router.get("/stats", response_model=StatsResponse)
def get_stats(db: Session = Depends(get_db)):
    total = db.query(Tender).count()
    sources = db.query(Tender.source).distinct().all()
    by_source = {
        s[0]: db.query(Tender).filter(Tender.source == s[0]).count()
        for s in sources
    }
    last_log = db.query(CrawlLog).order_by(CrawlLog.started_at.desc()).first()
    last_scraped = last_log.started_at.isoformat() if last_log else None
    return StatsResponse(total_tenders=total, tenders_by_source=by_source, last_scraped=last_scraped)


# ── GET /export ───────────────────────────────────────────────────────────────
@router.get("/export")
def export_excel(
    source: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Download all tenders (or one source) as Excel."""
    q = db.query(Tender)
    if source:
        q = q.filter(Tender.source == source)
    rows = q.order_by(Tender.created_at.desc()).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No tenders found")

    data = [r.to_dict() for r in rows]
    df = pd.DataFrame(data)
    # Friendly column order
    cols = ["tender_id", "source", "title", "description", "location",
            "start_date", "end_date", "link", "keyword", "created_at"]
    df = df[[c for c in cols if c in df.columns]]

    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Tenders")
    buf.seek(0)

    filename = f"tenders_{source or 'all'}.xlsx"
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── POST /reset-db ────────────────────────────────────────────────────────────
@router.post("/reset-db")
def reset_database(db: Session = Depends(get_db)):
    """Drop all tenders and logs — DESTRUCTIVE."""
    db.query(CrawlLog).delete()
    db.query(Tender).delete()
    db.commit()
    invalidate_cache()
    return {"message": "Database cleared"}


# ── GET /bookmarks ────────────────────────────────────────────────────────────
@router.get("/bookmarks")
def get_bookmarks(db: Session = Depends(get_db), user = Depends(get_current_user)):
    from app.models import Bookmark
    import json
    bms = db.query(Bookmark).filter(Bookmark.user_id == user.id).order_by(Bookmark.created_at.desc()).all()
    results = []
    for b in bms:
        try:
            results.append(json.loads(b.data_json))
        except:
            pass
    return results


# ── POST /bookmarks ───────────────────────────────────────────────────────────
@router.post("/bookmarks")
def toggle_bookmark(payload: dict, db: Session = Depends(get_db), user = Depends(get_current_user)):
    from app.models import Bookmark
    import json
    identifier = payload.get("tender_id") or payload.get("link")
    if not identifier:
        raise HTTPException(status_code=400, detail="Missing identifier")
    
    existing = db.query(Bookmark).filter(Bookmark.user_id == user.id, Bookmark.identifier == str(identifier)).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"bookmarked": False}
    else:
        new_bm = Bookmark(
            user_id=user.id,
            item_type=payload.get("_bookType", "tender"),
            identifier=str(identifier),
            data_json=json.dumps(payload)
        )
        db.add(new_bm)
        db.commit()
        return {"bookmarked": True}