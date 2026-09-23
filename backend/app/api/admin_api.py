"""
Admin API Router
Endpoints for the Admin Portal — system monitoring, scraper control, user management.
All endpoints require admin-level JWT.
"""
import json
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, text

from app.database import get_db, SessionLocal
from app.models import User, Tender, CrawlLog, GoogleResult
from app.auth.admin_dep import require_admin
from app.utils.logger import get_logger, SYSTEM_LOGS

from app.config import settings
router = APIRouter(prefix="/api/admin", tags=["admin"])
logger = get_logger("admin_api")


# ── Dashboard ────────────────────────────────────────────────────────────────
@router.get("/dashboard")
def admin_dashboard(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """Full system overview for the admin portal."""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Table counts
    total_users     = db.query(func.count(User.id)).scalar() or 0
    total_tenders   = db.query(func.count(Tender.id)).scalar() or 0
    total_crawls    = db.query(func.count(CrawlLog.id)).scalar() or 0
    total_google    = db.query(func.count(GoogleResult.id)).scalar() or 0

    # Today's activity
    tenders_today   = db.query(func.count(Tender.id)).filter(Tender.created_at >= today_start).scalar() or 0
    google_today    = db.query(func.count(GoogleResult.id)).filter(GoogleResult.scraped_at >= today_start).scalar() or 0

    # Active scrapers
    active_scrapers = db.query(func.count(CrawlLog.id)).filter(CrawlLog.status == "running").scalar() or 0

    # Source breakdown
    sources = db.query(Tender.source, func.count(Tender.id)).group_by(Tender.source).all()
    by_source = {s: c for s, c in sources}

    # Last 5 crawl logs
    recent_logs = db.query(CrawlLog).order_by(CrawlLog.started_at.desc()).limit(5).all()
    logs_list = []
    for log in recent_logs:
        logs_list.append({
            "id": str(log.id),
            "source": log.source,
            "keyword": log.keyword,
            "status": log.status,
            "tenders_found": log.tenders_found,
            "tenders_saved": log.tenders_saved,
            "error_message": log.error_message,
            "started_at": log.started_at.isoformat() if log.started_at else None,
            "completed_at": log.completed_at.isoformat() if log.completed_at else None,
        })

    # Email stats
    from app.models import EmailRecipient, EmailLog, EmailSetting
    total_recipients = db.query(func.count(EmailRecipient.id)).scalar() or 0
    emails_today     = db.query(func.count(EmailLog.id)).filter(EmailLog.sent_at >= today_start).scalar() or 0
    email_settings   = db.query(EmailSetting).first()
    last_report      = email_settings.last_report_sent_at.isoformat() if email_settings and email_settings.last_report_sent_at else None

    return {
        "server_time": now.isoformat(),
        "counts": {
            "users": total_users,
            "tenders": total_tenders,
            "crawl_logs": total_crawls,
            "google_results": total_google,
            "email_recipients": total_recipients,
        },
        "today": {
            "tenders": tenders_today,
            "google": google_today,
            "emails_sent": emails_today,
        },
        "last_report_time": last_report,
        "active_scrapers": active_scrapers,
        "tenders_by_source": by_source,
        "recent_logs": logs_list,
    }


# ── Scraper Status ───────────────────────────────────────────────────────────
@router.get("/scrapers/status")
def scraper_status(db: Session = Depends(get_db), _admin=Depends(require_admin) if not settings.DEBUG else None):
    """Status of all scraper sources + Google scraper."""
    # ... logic stays same ...
    sources = ["gem", "tender247", "tenderdetail", "tenderontime", "biddetail"]
    statuses = {}
    for src in sources:
        last = db.query(CrawlLog).filter(CrawlLog.source == src).order_by(CrawlLog.started_at.desc()).first()
        running = db.query(CrawlLog).filter(CrawlLog.source == src, CrawlLog.status == "running").count()
        statuses[src] = {
            "is_running": running > 0,
            "last_status": last.status if last else "never",
            "last_run": last.started_at.isoformat() if last else None,
            "last_error": last.error_message if last and last.status == "failed" else None,
            "total_tenders": db.query(func.count(Tender.id)).filter(Tender.source == src).scalar() or 0,
            "last_keyword": last.keyword if last else "None",
        }

    try:
        from app.api.google_routes import _sync_status
        google_status = dict(_sync_status)
    except Exception:
        google_status = {"running": False, "message": "Google router not loaded"}

    return {"scrapers": statuses, "google": google_status}


# ── Start Scraper ────────────────────────────────────────────────────────────
@router.post("/scrapers/start")
def start_scraper(
    source: str = Query(..., description="gem|tender247|tenderdetail|tenderontime|biddetail|google"),
    headless: bool = Query(True),
    client_id: str = Query(None),
    _admin=Depends(require_admin) if not settings.DEBUG else None,
):
    """Start a scraper by source name."""
    if source == "google":
        try:
            from app.api.google_routes import sync_google
            return sync_google(headless=headless)
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
            
    import os
    source_normalized = str(source or "").strip().lower()
    EXTENSION_SOURCES = {"tenderontime", "tender247", "tenderdetail", "gem", "biddetail"}
    
    is_render = os.getenv("RENDER") is not None
    default_mode = "extension" if is_render else "playwright"
    execution_mode = os.getenv("SCRAPER_EXECUTION_MODE", default_mode).strip().lower()

    if source_normalized in EXTENSION_SOURCES and execution_mode == "extension":
        from app.api.extension_api import _pending_jobs
        
        db_s = SessionLocal()
        try:
            # Tell UI it is running
            log = CrawlLog(source=source_normalized, keyword="Extension Triggered", status="running")
            db_s.add(log)
            db_s.commit()
        finally:
            db_s.close()
            
        import uuid
        job_id = str(uuid.uuid4())[:8]
        job = {
            "job_id": job_id,
            "source": source_normalized,
            "status": "pending",
            "target_url": "", # Generic placeholder, some extensions build their own
            "keywords": settings.SEARCH_KEYWORDS,
            "max_pages": getattr(settings, "MAX_PAGES", 5),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "target_client": client_id,
        }
        
        if not job.get("job_id"):
            logger.error("[ExtensionQueue] Refusing job without job_id: %s", {"source": source_normalized, "keys": list(job.keys())})
            return {"success": False, "error": "Generated job has no job_id"}
            
        logger.info("[ExtensionQueue] queued job_id=%s source=%s", job_id, source_normalized)
        _pending_jobs.append(job)
        
        return {
            "success": True,
            "mode": "extension",
            "job_id": job_id,
            "source": source_normalized,
            "status": "queued"
        }
    else:
        import threading
        from app.services.scraper_service import run_all_scrapers

        def _bg(src, is_headless):
            db = SessionLocal()
            try:
                run_all_scrapers(db, source_filter=src, headless=is_headless)
            except Exception as exc:
                logger.error("Admin scraper error [%s]: %s", src, exc)
            finally:
                db.close()

        t = threading.Thread(target=_bg, args=(source, headless), daemon=True, name=f"admin-{source}")
        t.start()
        return {"status": "started", "source": source, "message": f"{source} scraper started"}


from typing import Any, Dict

# ── Captcha Resolution ────────────────────────────────────────────────────────
@router.post("/scrapers/captcha")
def resolve_captcha(payload: Optional[Dict[str, Any]] = None, _admin=Depends(require_admin) if not settings.DEBUG else None):
    """Signal that a captcha has been solved manually."""
    try:
        from app.api.google_routes import clear_captcha
        return clear_captcha()
    except Exception as e:
        logger.error("Captcha resolution error: %s", e)
        raise HTTPException(status_code=500, detail=str(e))


# ── Stop Scraper ─────────────────────────────────────────────────────────────
@router.post("/scrapers/stop")
def stop_scraper(
    source: str = Query(...),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin) if not settings.DEBUG else None,
):
    """Stop a running scraper."""
    if source == "google":
        try:
            from app.api.google_routes import stop_google
            return stop_google()
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))
    else:
        from app.services.sync_manager import sync_manager
        sync_manager.set_stop_flag(source)
        
        # Forcibly update any 'running' DB rows so the UI clears immediately
        # (Handles cases where the thread crashed and left a stale 'running' row)
        from app.models import CrawlLog
        if source == "all":
            stale = db.query(CrawlLog).filter(CrawlLog.status == "running")
        else:
            stale = db.query(CrawlLog).filter(CrawlLog.status == "running", CrawlLog.source == source)
            
        count = stale.update({"status": "stopped", "error_message": "Force stopped by admin"}, synchronize_session=False)
        db.commit()
        
        return {"status": "stopping", "source": source, "cleared_stale": count}


# ── Crawl Logs ───────────────────────────────────────────────────────────────
@router.get("/logs")
def get_logs(
    source: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Recent crawl logs with optional source filter."""
    q = db.query(CrawlLog).order_by(CrawlLog.started_at.desc())
    if source:
        q = q.filter(CrawlLog.source == source)
    rows = q.limit(limit).all()
    return {
        "total": len(rows),
        "logs": [
            {
                "id": str(r.id),
                "source": r.source,
                "keyword": r.keyword,
                "status": r.status,
                "tenders_found": r.tenders_found,
                "tenders_saved": r.tenders_saved,
                "pages_scanned": r.pages_scanned,
                "error_message": r.error_message,
                "started_at": r.started_at.isoformat() if r.started_at else None,
                "completed_at": r.completed_at.isoformat() if r.completed_at else None,
            }
            for r in rows
        ],
    }


# ── Users ────────────────────────────────────────────────────────────────────
@router.get("/users")
def list_users(db: Session = Depends(get_db), _admin=Depends(require_admin)):
    """List all registered users."""
    users = db.query(User).order_by(User.created_at.desc()).all()
    return {"users": [u.to_dict() for u in users]}


@router.post("/users/{user_id}/role")
def update_user_role(
    user_id: str,
    role: str = Query(..., description="user|admin"),
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    """Change a user's role."""
    if role not in ("user", "admin"):
        raise HTTPException(status_code=400, detail="Role must be 'user' or 'admin'")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = role
    db.commit()
    return {"message": f"User role updated to '{role}'", "user": user.to_dict()}

@router.get("/system-logs")
def get_system_logs(_admin=Depends(require_admin)):
    """Returns raw stdout/SQLAlchemy logs for the hacker terminal"""
    return {"logs": list(SYSTEM_LOGS)}
