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
def get_pending_jobs(client_id: str = Query(None), _key=Depends(_validate_extension_key)):
    """Extension calls this periodically to check for new scrape jobs."""
    pending = []
    for j in _pending_jobs:
        if j["status"] == "pending":
            tgt = j.get("target_client")
            # Only adopt if NO target client exist or if it explicitly matches my machine
            if tgt and tgt != client_id:
                continue
            pending.append(j)
    return {"jobs": pending, "count": len(pending)}


# ── POST /jobs/{job_id}/start — Extension begins working on a job ────────────
@router.post("/jobs/{job_id}/start")
def start_extension_job(job_id: str, _key=Depends(_validate_extension_key)):
    """Extension signals that it has picked up and started a job."""
    for job in _pending_jobs:
        if job["job_id"] == job_id:
            if job["status"] != "pending":
                raise HTTPException(status_code=409, detail="Job intrinsically clamped by another execution thread")
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
    db: Session = Depends(get_db)
):
    """Extension signals job completion with summary stats."""
    
    # ── HOTFIX: Special pass-through tracking for Google Jobs ──
    for job in _pending_jobs:
        if job["job_id"] == job_id:
            final_status = payload.get("status", "completed")
            job["status"] = final_status
            job["summary"] = payload.get("summary", {})
            job["completed_at"] = datetime.now(timezone.utc).isoformat()
            
            src = job.get("source")
            if src == "google":
                try:
                    from app.api.google_routes import stop_google
                    stop_google()
                except Exception:
                    pass
            
            if src:
                logs = db.query(CrawlLog).filter(CrawlLog.source == src, CrawlLog.status == "running").all()
                for log in logs:
                    log.status = final_status
                    if final_status == "failed" and payload.get("error"):
                        log.error_message = payload.get("error")
                    log.completed_at = datetime.now(timezone.utc)
                db.commit()

            _completed_jobs.append(job)
            _pending_jobs.remove(job)
            logger.info(f"Extension job terminated organically: {job_id}")
            return {"status": final_status, "job_id": job_id}
    raise HTTPException(status_code=404, detail="Job not found")


# ── GET /export/tenders/excel — Export Today's Normal Tenders ─────────────────
@router.get("/export/tenders/excel")
def export_tenders_excel(executor: str = "Automated Admin", db: Session = Depends(get_db), _key=Depends(_validate_extension_key)):
    import pandas as pd
    from io import BytesIO
    from openpyxl.styles import Font, Border, Side, Alignment, PatternFill
    from datetime import datetime, timezone

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    tenders = db.query(Tender).filter(Tender.created_at >= today_start).order_by(Tender.created_at.desc()).all()

    data = []
    for t in tenders:
        data.append({
            "Tender ID": t.tender_id or "",
            "Keyword": t.keyword or "",
            "Source": t.source.upper() if t.source else "",
            "Title": t.title or "",
            "Location": t.location or "",
            "Value": t.tender_value or "",
            "Publish Date": t.publish_date or "",
            "End Date": t.end_date or "",
            "Link": t.link or ""
        })

    df = pd.DataFrame(data)
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Tenders', index=False, startrow=4)
        worksheet = writer.sheets['Tenders']
        
        worksheet["A1"] = "MDM TENDER REPORT - STANDARD SOURCES"
        worksheet["A1"].font = Font(b=True, size=14, color="ffffff")
        worksheet["A1"].fill = PatternFill("solid", fgColor="1F4E78")
        worksheet["A2"] = f"Generated On: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"
        worksheet["A3"] = f"Executor/Account ID: {executor}"
        worksheet["A2"].font = Font(i=True)
        worksheet["A3"].font = Font(i=True)
        
        thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
        header_fill = PatternFill("solid", fgColor="DCE6F1")
        
        for col_idx, col_name in enumerate(df.columns, 1):
            cell = worksheet.cell(row=5, column=col_idx)
            cell.font = Font(b=True)
            cell.fill = header_fill
            cell.border = thin_border
            worksheet.column_dimensions[cell.column_letter].width = 25
            
        for row in worksheet.iter_rows(min_row=6, max_row=len(df) + 5, min_col=1, max_col=len(df.columns)):
            for cell in row:
                cell.border = thin_border
                cell.alignment = Alignment(vertical="top", wrap_text=True)

    output.seek(0)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=Tender_Report_{datetime.now().strftime('%Y%m%d')}.xlsx"}
    )


# ── GET /export/google/excel — Export Today's Google Tenders ──────────────────
@router.get("/export/google/excel")
def export_google_excel(executor: str = "Automated Admin", db: Session = Depends(get_db), _key=Depends(_validate_extension_key)):
    import pandas as pd
    from io import BytesIO
    from openpyxl.styles import Font, Border, Side, Alignment, PatternFill
    from app.models import GoogleResult
    from datetime import datetime, timezone

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    results = db.query(GoogleResult).filter(
        GoogleResult.created_at >= today_start,
        GoogleResult.result_type == "filtered"
    ).order_by(GoogleResult.created_at.desc()).all()

    data = []
    for r in results:
        data.append({
            "Keyword": r.search_query or "",
            "Title": r.title or "",
            "Description Snippet": (r.description or "")[:1500],
            "Is PDF": r.is_pdf or "false",
            "Link": r.link or ""
        })

    df = pd.DataFrame(data)
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, sheet_name='Google Tenders', index=False, startrow=4)
        worksheet = writer.sheets['Google Tenders']
        
        worksheet["A1"] = "MDM TENDER REPORT - GOOGLE RESEARCH PIPELINE"
        worksheet["A1"].font = Font(b=True, size=14, color="ffffff")
        worksheet["A1"].fill = PatternFill("solid", fgColor="C00000")
        worksheet["A2"] = f"Generated On: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}"
        worksheet["A3"] = f"Executor/Account ID: {executor}"
        worksheet["A2"].font = Font(i=True)
        worksheet["A3"].font = Font(i=True)
        
        thin_border = Border(left=Side(style='thin'), right=Side(style='thin'), top=Side(style='thin'), bottom=Side(style='thin'))
        header_fill = PatternFill("solid", fgColor="F2DCDB")
        
        for col_idx, col_name in enumerate(df.columns, 1):
            cell = worksheet.cell(row=5, column=col_idx)
            cell.font = Font(b=True)
            cell.fill = header_fill
            cell.border = thin_border
            worksheet.column_dimensions[cell.column_letter].width = 30
            if col_name == "Description Snippet":
                worksheet.column_dimensions[cell.column_letter].width = 60
                
        for row in worksheet.iter_rows(min_row=6, max_row=len(df) + 5, min_col=1, max_col=len(df.columns)):
            for cell in row:
                cell.border = thin_border
                cell.alignment = Alignment(vertical="top", wrap_text=True)

    output.seek(0)
    from fastapi.responses import StreamingResponse
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=Google_Tenders_{datetime.now().strftime('%Y%m%d')}.xlsx"}
    )


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
        return {"message": "No tenders to upload", "saved": 0, "skipped": 0, "saved_identifiers": []}

    saved = 0
    skipped = 0
    saved_identifiers = []

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
                link = (t.get("href") or "")[:1000]
                
                # Simultaneous Live Duplicate Check for Google Results
                if link:
                    existing = db.query(GoogleResult).filter(GoogleResult.link == link).first()
                    if existing:
                        new_type = t.get("result_type", "all")
                        if existing.result_type == "all" and new_type == "filtered":
                            # Upgrade Phase 1 (Search) to Phase 2 (Filtered with content)
                            existing.result_type = "filtered"
                            if t.get("summary"):
                                existing.description = str(t.get("summary"))[:5000]
                            existing.is_pdf = "true" if (t.get("href") and ".pdf" in str(t.get("href")).lower()) else "false"
                            db.flush()
                            # It's an upgrade, so it's not a new insert but not a duplicate block realistically.
                        else:
                            # If it was previously saved but never run through Phase 2, include it in Phase 2 targets!
                            if existing.result_type == "all" and new_type == "all":
                                saved_identifiers.append(link)
                            skipped += 1
                        continue

                db.add(GoogleResult(
                    result_type=t.get("result_type", "all")[:20],
                    title=(t.get("title") or "")[:800],
                    description=(t.get("summary") or "")[:5000],
                    link=link,
                    search_query=(t.get("search_keyword") or t.get("keyword") or keyword)[:500],
                    keywords=json.dumps([t.get("search_keyword") or t.get("keyword") or keyword]),
                    page_excerpt="",
                    is_pdf="true" if (t.get("href") and ".pdf" in str(t.get("href")).lower()) else "false"
                ))
                db.flush() # Secure assignment sequentially
                saved += 1
                saved_identifiers.append(link)
            else:
                tender_id = (t.get("tender_id") or t.get("tot_ref") or "")[:200]
                if not tender_id:
                    skipped += 1
                    continue
                
                # Simultaneous Live Duplicate Check for Normal Tenders
                existing = db.query(Tender).filter(Tender.source == source, Tender.tender_id == tender_id).first()
                if existing:
                    skipped += 1
                    continue

                tender_data = {
                    "source": source,
                    "tender_id": tender_id,
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

                new_tender = Tender(**tender_data)
                db.add(new_tender)
                db.flush()
                saved += 1
                saved_identifiers.append(tender_id)

        except Exception as exc:
            db.rollback()
            skipped += 1
            logger.error(f"Injection syntax fault on item: {exc}")

    # Commit all validated insertions to database
    db.commit()

    logger.info(f"[Live Pipeline Sync] Source: {source} | Keyword: '{keyword}' | Total Payload: {len(tenders)} | Inserted: {saved} | Duplicates Blocked: {skipped}")
    if saved > 0:
        db.commit()

    # Update crawl log
    log.status = "completed"
    log.tenders_saved = str(saved)
    log.completed_at = datetime.now(timezone.utc)
    db.commit()

    logger.info(f"Extension upload: {source}/{keyword} — {saved} saved, {skipped} skipped out of {len(tenders)}")
    return {"message": "Upload complete", "saved": saved, "skipped": skipped, "inserted": saved, "duplicates_blocked": skipped, "total": len(tenders), "saved_identifiers": saved_identifiers}
