"""
EmailService — Native smtplib Transport
=========================================
Simple, native email sending using Python's built-in smtplib.
No third-party SDKs, no external microservices.
"""
import logging
import threading
import time
import smtplib
from email.message import EmailMessage
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from sqlalchemy.orm import Session
from app.config import settings
from app.database import SessionLocal
from app.models import Tender, EmailRecipient, EmailLog, EmailSetting, GoogleResult

logger = logging.getLogger("email_service")


class EmailService:
    @staticmethod
    def send_email(
        to: str,
        subject: str,
        html_content: str,
        from_name: Optional[str] = None,
    ) -> Tuple[bool, Optional[str]]:
        """
        Sends an email via Python's built-in smtplib using Gmail.
        """
        display_name = from_name or "Tender Intelligence"
        from_formatted = f"{display_name} <{settings.SMTP_USER}>"
        
        try:
            msg = EmailMessage()
            msg["Subject"] = subject
            msg["From"] = from_formatted
            msg["To"] = to
            msg.set_content("Please enable HTML to view this email.")
            msg.add_alternative(html_content, subtype="html")

            logger.info("Sending simple email to %s via SMTP (Port: %s)", to, settings.SMTP_PORT)
            
            if int(settings.SMTP_PORT) == 465:
                # Implicit SSL
                with smtplib.SMTP_SSL(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                    server.login(settings.SMTP_USER, settings.SMTP_PASS)
                    server.send_message(msg)
            else:
                # Explicit TLS (STARTTLS) - standard for port 587
                with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
                    server.ehlo()
                    server.starttls()
                    server.ehlo()
                    server.login(settings.SMTP_USER, settings.SMTP_PASS)
                    server.send_message(msg)
                
            logger.info("Email sent successfully to %s", to)
            return True, None
            
        except Exception as e:
            err = f"SMTP Send Error: {str(e)}"
            logger.exception(err)
            return False, err[:500]

    @staticmethod
    def log_email(
        db: Session,
        recipient: str,
        subject: str,
        status: str,
        error_message: Optional[str] = None,
    ):
        """Logs an email attempt in the database."""
        log = EmailLog(
            recipient=recipient,
            subject=subject,
            status=status,
            error_message=error_message,
        )
        db.add(log)
        db.commit()

    @staticmethod
    def generate_tender_report_html(tenders: List[Tender]) -> str:
        """Generates the HTML email report body."""
        date_str = datetime.now().strftime("%d %b %Y")
        rows_html = ""
        for t in tenders:
            rows_html += f"""
            <div style="margin-bottom:25px;">
                <p style="margin:0 0 5px 0;"><strong>Tender ID:</strong> {t.tender_id or 'N/A'}</p>
                <p style="margin:0 0 5px 0;font-size:14px;"><strong>Description:</strong> {t.description or t.title or 'No description'}</p>
                <p style="margin:0 0 5px 0;font-size:12px;color:#555;">
                    <strong>Keyword:</strong> {t.keyword or 'N/A'} | <strong>Source:</strong> {(t.source or '').upper()}
                </p>
                <p style="margin:0 0 5px 0;font-size:12px;color:#555;">
                    <strong>Start:</strong> {t.start_date or 'N/A'} | <strong>End:</strong> {t.end_date or 'N/A'}
                </p>
                <p style="margin:0 0 15px 0;font-size:12px;">
                    <strong>Link:</strong>
                    <a href="{t.link or '#'}" style="color:#000;text-decoration:underline;">{t.link or '#'}</a>
                </p>
                <hr style="border:0;border-top:1px solid #eee;margin:0;">
            </div>
            """
        if not rows_html:
            rows_html = "<p style='text-align:center;color:#888;padding:40px;'>No new tenders found for this period.</p>"

        return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#000;margin:0;padding:40px;background:#fff;">
    <div style="max-width:600px;margin:0 auto;">
        <div style="border-left:4px solid #000;padding-left:20px;margin-bottom:40px;">
            <p style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#888;margin:0;">Automated Distribution</p>
            <h2 style="font-size:28px;font-weight:900;margin:5px 0 0 0;letter-spacing:-0.5px;">Tender Report</h2>
        </div>
        <p>Hello Team,</p>
        <p>Please find the consolidated tender collection for <strong>{date_str}</strong> below.</p>
        <div style="margin-top:20px;padding:10px 15px;background:#f8f9fa;border-left:3px solid #1a73e8;display:inline-block;border-radius:0 6px 6px 0;">
            <strong style="color:#555;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Total Tenders:</strong> 
            <span style="font-size:18px;font-weight:900;color:#000;margin-left:8px;">{len(tenders)}</span>
        </div>
        <div style="margin-top:40px;">{rows_html}</div>
        <p style="font-size:11px;color:#aaa;margin-top:60px;text-align:center;">
            Authorized by Leonex Tender Platform.
        </p>
    </div>
</body></html>"""

    @staticmethod
    def generate_google_report_html(results: List[GoogleResult]) -> str:
        """Generates the HTML Google Search email report body."""
        date_str = datetime.now().strftime("%d %b %Y")
        rows_html = ""
        for r in results:
            rows_html += f"""
            <div style="margin-bottom:25px;">
                <p style="margin:0 0 5px 0;"><strong>Title:</strong> {r.title}</p>
                <p style="margin:0 0 5px 0;font-size:14px;"><strong>Description:</strong> {r.description}</p>
                <p style="margin:0 0 5px 0;font-size:12px;color:#555;">
                    <strong>Keyword:</strong> {r.search_query or 'N/A'}
                </p>
                <p style="margin:0 0 15px 0;font-size:12px;">
                    <strong>Link:</strong>
                    <a href="{r.link or '#'}" style="color:#000;text-decoration:underline;">{r.link or '#'}</a>
                </p>
                <hr style="border:0;border-top:1px solid #eee;margin:0;">
            </div>
            """
        if not rows_html:
            rows_html = "<p style='text-align:center;color:#888;padding:40px;'>No new google links found for this period.</p>"

        return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.6;color:#000;margin:0;padding:40px;background:#fff;">
    <div style="max-width:600px;margin:0 auto;">
        <div style="border-left:4px solid #000;padding-left:20px;margin-bottom:40px;">
            <p style="font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#888;margin:0;">Automated Distribution</p>
            <h2 style="font-size:28px;font-weight:900;margin:5px 0 0 0;letter-spacing:-0.5px;">Google Tender Report</h2>
        </div>
        <p>Hello Team,</p>
        <p>Please find the consolidated Google tender collection for <strong>{date_str}</strong> below.</p>
        <div style="margin-top:20px;padding:10px 15px;background:#f8f9fa;border-left:3px solid #1a73e8;display:inline-block;border-radius:0 6px 6px 0;">
            <strong style="color:#555;font-size:14px;text-transform:uppercase;letter-spacing:1px;">Total New Link Added in Google:</strong> 
            <span style="font-size:18px;font-weight:900;color:#000;margin-left:8px;">{len(results)}</span>
        </div>
        <div style="margin-top:40px;">{rows_html}</div>
        <p style="font-size:11px;color:#aaa;margin-top:60px;text-align:center;">
            Authorized by Leonex Tender Platform.
        </p>
    </div>
</body></html>"""

    @classmethod
    def send_daily_report(
        cls,
        db: Session,
        manual_recipient: Optional[str] = None,
        target_date: Optional[str] = None,
    ):
        """Fetches tenders and sends report to all active recipients."""
        settings_row = db.query(EmailSetting).first()
        if not settings_row:
            settings_row = EmailSetting()
            db.add(settings_row)
            db.commit()
            db.refresh(settings_row)

        if not manual_recipient and not target_date and not settings_row.daily_report_enabled:
            return

        # Determine date range
        if target_date:
            try:
                dt = datetime.strptime(target_date, "%Y-%m-%d")
                start_time = dt.replace(hour=0, minute=0, second=0, microsecond=0)
                end_time = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
            except ValueError:
                start_time = datetime.now() - timedelta(hours=48)
                end_time = datetime.now()
        else:
            lookback_hours = 48 if (manual_recipient or not settings_row.last_report_sent_at) else 24
            start_time = datetime.now() - timedelta(hours=lookback_hours)
            end_time = datetime.now()

        tenders = (
            db.query(Tender)
            .filter(Tender.created_at >= start_time, Tender.created_at <= end_time)
            .order_by(Tender.created_at.desc())
            .all()
        )

        html_content = cls.generate_tender_report_html(tenders)
        subject = f"Tender Report \u2013 {datetime.now().strftime('%d %b %Y')}"

        if manual_recipient:
            recipients = [EmailRecipient(email=manual_recipient, name="Subscriber", is_active=True)]
        else:
            recipients = db.query(EmailRecipient).filter(EmailRecipient.is_active == True).all()

        for r in recipients:
            success, err = cls.send_email(
                r.email, subject, html_content, from_name=settings_row.sender_name
            )
            cls.log_email(db, r.email, subject, "sent" if success else "failed", err)

        if not manual_recipient:
            settings_row.last_report_sent_at = datetime.now()
            db.commit()
            
        # Fire the second email report for Google Scraper Results
        cls.send_google_report(db, manual_recipient, target_date)

    @classmethod
    def send_google_report(
        cls,
        db: Session,
        manual_recipient: Optional[str] = None,
        target_date: Optional[str] = None,
    ):
        """Fetches newly added google links and sends a separate report."""
        settings_row = db.query(EmailSetting).first()
        if not settings_row:
            return

        if target_date:
            try:
                dt = datetime.strptime(target_date, "%Y-%m-%d")
                start_time = dt.replace(hour=0, minute=0, second=0, microsecond=0)
                end_time = dt.replace(hour=23, minute=59, second=59, microsecond=999999)
            except ValueError:
                start_time = datetime.now() - timedelta(hours=48)
                end_time = datetime.now()
        else:
            lookback_hours = 48 if (manual_recipient or not settings_row.last_report_sent_at) else 24
            start_time = datetime.now() - timedelta(hours=lookback_hours)
            end_time = datetime.now()

        results = (
            db.query(GoogleResult)
            .filter(GoogleResult.result_type == "all", GoogleResult.scraped_at >= start_time, GoogleResult.scraped_at <= end_time)
            .order_by(GoogleResult.scraped_at.desc())
            .all()
        )
        
        if not results:
            return  # Do not send empty google reports

        html_content = cls.generate_google_report_html(results)
        subject = f"Google Tender Report \u2013 {datetime.now().strftime('%d %b %Y')}"

        if manual_recipient:
            recipients = [EmailRecipient(email=manual_recipient, name="Subscriber", is_active=True)]
        else:
            recipients = db.query(EmailRecipient).filter(EmailRecipient.is_active == True).all()

        for r in recipients:
            success, err = cls.send_email(
                r.email, subject, html_content, from_name=settings_row.sender_name
            )
            cls.log_email(db, r.email, subject, "sent" if success else "failed", err)

    @classmethod
    def send_scraper_failure_alert(cls, db: Session, source: str, error: str):
        """Sends an alert to admins when a scraper fails completely (e.g. Cloudflare blockage)."""
        settings_row = db.query(EmailSetting).first()
        if not settings_row:
            return
            
        subject = f"Tender Scraper Alert: {source.upper()} Failed"
        html_content = f"""
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;">
            <h2 style="color:#d32f2f;">Scraper Failure Alert</h2>
            <p>The scraper for <strong>{source}</strong> encountered a fatal error and was skipped.</p>
            <p><strong>Error Details:</strong></p>
            <pre style="background:#f4f4f4;padding:15px;border-radius:4px;overflow-x:auto;">{error}</pre>
            <p style="font-size:12px;color:#888;">This is an automated system notification.</p>
        </div>
        """
        
        recipients = db.query(EmailRecipient).filter(EmailRecipient.is_active == True).all()
        for r in recipients:
            success, err = cls.send_email(r.email, subject, html_content, from_name=settings_row.sender_name)
            cls.log_email(db, r.email, subject, "sent" if success else "failed", err)

class EmailScheduler:
    @staticmethod
    def start():
        def run():
            while True:
                try:
                    db = SessionLocal()
                    try:
                        settings_row = db.query(EmailSetting).first()
                        if settings_row and settings_row.daily_report_enabled:
                            try:
                                hour, minute = map(int, settings_row.report_time.split(":"))
                                now = datetime.now()
                                target_time = now.replace(
                                    hour=hour, minute=minute, second=0, microsecond=0
                                )
                                last_sent = settings_row.last_report_sent_at
                                sent_today = last_sent and last_sent.date() == now.date()
                                if not sent_today and now >= target_time:
                                    EmailService.send_daily_report(db)
                            except Exception:
                                pass
                    finally:
                        db.close()
                except Exception:
                    pass
                time.sleep(60)

        t = threading.Thread(target=run, daemon=True, name="email-scheduler")
        t.start()
