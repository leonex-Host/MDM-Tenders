import uuid
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import EmailRecipient, EmailLog, EmailSetting
from app.auth.admin_dep import require_admin
from app.services.email_service import EmailService
from app.config import settings

router = APIRouter(prefix="/api/admin/emails", tags=["admin-emails"])

# ── Recipients ───────────────────────────────────────────────────────────────

@router.get("/recipients", response_model=List[dict])
def get_recipients(db: Session = Depends(get_db), _admin=Depends(require_admin) if not settings.DEBUG else None):
    recipients = db.query(EmailRecipient).order_by(EmailRecipient.created_at.desc()).all()
    return [r.to_dict() for r in recipients]

@router.post("/recipients")
def add_recipient(data: Dict[str, Any], db: Session = Depends(get_db), _admin=Depends(require_admin) if not settings.DEBUG else None):
    email = data.get("email")
    if not email:
        raise HTTPException(400, "Email is required")
    
    existing = db.query(EmailRecipient).filter(EmailRecipient.email == email).first()
    if existing:
        raise HTTPException(400, "Recipient with this email already exists")

    new_r = EmailRecipient(
        name=data.get("name", "Unknown"),
        email=email,
        department=data.get("department"),
        is_active=data.get("is_active", True)
    )
    db.add(new_r)
    db.commit()
    db.refresh(new_r)
    return new_r.to_dict()

@router.put("/recipients/{rid}")
def update_recipient(rid: uuid.UUID, data: Dict[str, Any], db: Session = Depends(get_db), _admin=Depends(require_admin) if not settings.DEBUG else None):
    r = db.query(EmailRecipient).filter(EmailRecipient.id == rid).first()
    if not r:
        raise HTTPException(404, "Recipient not found")
    
    if "name" in data: r.name = data["name"]
    if "email" in data: r.email = data["email"]
    if "department" in data: r.department = data["department"]
    if "is_active" in data: r.is_active = data["is_active"]
    
    db.commit()
    return r.to_dict()

@router.delete("/recipients/{rid}")
def delete_recipient(rid: uuid.UUID, db: Session = Depends(get_db), _admin=Depends(require_admin) if not settings.DEBUG else None):
    r = db.query(EmailRecipient).filter(EmailRecipient.id == rid).first()
    if not r:
        raise HTTPException(404, "Recipient not found")
    db.delete(r)
    db.commit()
    return {"status": "deleted"}

# ── Settings ─────────────────────────────────────────────────────────────────

@router.get("/settings")
def get_email_settings(db: Session = Depends(get_db), _admin=Depends(require_admin) if not settings.DEBUG else None):
    s = db.query(EmailSetting).first()
    if not s:
        s = EmailSetting()
        db.add(s)
        db.commit()
        db.refresh(s)
    return s.to_dict()

@router.put("/settings")
def update_email_settings(data: Dict[str, Any], db: Session = Depends(get_db), _admin=Depends(require_admin) if not settings.DEBUG else None):
    s = db.query(EmailSetting).first()
    if not s:
        s = EmailSetting()
        db.add(s)
    
    if "sender_name" in data: s.sender_name = data["sender_name"]
    if "sender_email" in data: s.sender_email = data["sender_email"]
    if "daily_report_enabled" in data: s.daily_report_enabled = data["daily_report_enabled"]
    if "report_time" in data: s.report_time = data["report_time"]
    
    db.commit()
    return s.to_dict()

# ── Logs ─────────────────────────────────────────────────────────────────────

@router.get("/logs", response_model=List[dict])
def get_email_logs(limit: int = 100, db: Session = Depends(get_db), _admin=Depends(require_admin) if not settings.DEBUG else None):
    logs = db.query(EmailLog).order_by(EmailLog.sent_at.desc()).limit(limit).all()
    return [l.to_dict() for l in logs]

@router.post("/trigger")
def trigger_sync(background_tasks: BackgroundTasks, date: Optional[str] = None, _admin=Depends(require_admin) if not settings.DEBUG else None):
    """Manually triggers a daily report sync using a fresh background session."""
    from app.database import SessionLocal
    
    def run_sync():
        db = SessionLocal()
        try:
            EmailService.send_daily_report(db, target_date=date)
        finally:
            db.close()

    background_tasks.add_task(run_sync)
    return {"message": f"Manual sync initiated{' for ' + date if date else ''}"}

@router.delete("/logs")
def clear_email_logs(db: Session = Depends(get_db), _admin=Depends(require_admin) if not settings.DEBUG else None):
    db.query(EmailLog).delete()
    db.commit()
    return {"status": "success", "message": "All logs cleared"}

# ── Actions ──────────────────────────────────────────────────────────────────

@router.post("/send-test")
def send_test_email(data: Dict[str, Any], db: Session = Depends(get_db), _admin=Depends(require_admin) if not settings.DEBUG else None):
    email = data.get("email")
    if not email:
        raise HTTPException(400, "Target email is required")
    
    subject = "Test Email from Tender Platform"
    html = f"<div style='font-family:sans-serif; padding:20px;'><h1 style='color:#1a73e8;'>System Test</h1><p>This is a test email triggered from the Admin Portal Email Management system.</p><p>Sent at: {uuid.uuid4()}</p></div>"
    
    success, err_msg = EmailService.send_email(email, subject, html)
    EmailService.log_email(db, email, subject, "sent" if success else "failed", None if success else err_msg)
    
    if not success:
        return {"status": "failed", "message": err_msg or "Failed to send email"}
    
    return {"status": "success", "message": "Email sent successfully"}

@router.post("/send-now")
def trigger_manual_report(db: Session = Depends(get_db), _admin=Depends(require_admin) if not settings.DEBUG else None):
    # Sends to all active recipients
    try:
        EmailService.send_daily_report(db)
        return {"status": "success", "message": "Manual report triggered for all active recipients"}
    except Exception as e:
        raise HTTPException(500, str(e))
