"""
Tender Agent - Query database for tenders based on intent
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, or_, cast, String

from app.models import Tender, CrawlLog
from app.config import settings


class TenderAgent:
    """
    Execute database queries based on parsed user intent.
    All queries work with the actual Tender model fields:
      tender_id, source, title, description, location,
      start_date, end_date, link, keyword, created_at
    """

    def __init__(self, db: Session):
        self.db = db

    def search_tenders(self, entities: Dict[str, Any], limit: int = 10) -> List[Dict]:
        """Search tenders based on extracted entities."""
        query = self.db.query(Tender)

        # Keyword search across title + description + keyword columns
        kw = entities.get('keyword', '').strip()
        if kw:
            like = f"%{kw}%"
            query = query.filter(
                or_(
                    Tender.title.ilike(like),
                    Tender.description.ilike(like),
                    Tender.keyword.ilike(like),
                )
            )

        # Source filter
        src = entities.get('source', '').strip()
        if src:
            query = query.filter(Tender.source == src)

        # Location filter
        loc = entities.get('location', '').strip()
        if loc:
            query = query.filter(Tender.location.ilike(f"%{loc}%"))

        # Recency filter
        days = entities.get('days')
        if days:
            cutoff = datetime.now() - timedelta(days=int(days))
            query = query.filter(Tender.created_at >= cutoff)

        tenders = query.order_by(desc(Tender.created_at)).limit(limit).all()
        return [t.to_dict() for t in tenders]

    def get_expiring_tenders(self, days: int = 7, limit: int = 10) -> List[Dict]:
        """Get tenders whose end_date is within `days` from now.
        end_date is stored as a string, so we do our best to parse."""
        # Since end_date is VARCHAR, pull all and filter in Python
        rows = self.db.query(Tender).filter(
            Tender.end_date.isnot(None)
        ).order_by(desc(Tender.created_at)).limit(200).all()

        now = datetime.now()
        cutoff = now + timedelta(days=days)
        results = []
        for t in rows:
            try:
                from dateutil.parser import parse as date_parse
                ed = date_parse(t.end_date, fuzzy=True)
                if now <= ed <= cutoff:
                    results.append(t.to_dict())
            except Exception:
                pass
            if len(results) >= limit:
                break
        return results

    def get_recent_tenders(self, days: int = 1, limit: int = 10) -> List[Dict]:
        """Get tenders created in the last N days."""
        cutoff = datetime.now() - timedelta(days=days)
        tenders = self.db.query(Tender).filter(
            Tender.created_at >= cutoff
        ).order_by(desc(Tender.created_at)).limit(limit).all()
        return [t.to_dict() for t in tenders]

    def get_statistics(self) -> Dict[str, Any]:
        """Get summary statistics about tenders."""
        total = self.db.query(Tender).count()

        # By source
        sources = self.db.query(
            Tender.source, func.count(Tender.id)
        ).group_by(Tender.source).all()

        # By keyword
        keywords = self.db.query(
            Tender.keyword, func.count(Tender.id)
        ).filter(Tender.keyword.isnot(None)).group_by(Tender.keyword).order_by(
            desc(func.count(Tender.id))
        ).limit(10).all()

        # Latest crawl
        last_log = self.db.query(CrawlLog).order_by(CrawlLog.started_at.desc()).first()

        return {
            'total_tenders': total,
            'by_source': {s[0]: s[1] for s in sources},
            'top_keywords': {k[0]: k[1] for k in keywords},
            'last_scraped': last_log.started_at.isoformat() if last_log else None,
        }

    def get_all_tenders(self, limit: int = 10) -> List[Dict]:
        """Fallback: return the most recent tenders."""
        tenders = self.db.query(Tender).order_by(
            desc(Tender.created_at)
        ).limit(limit).all()
        return [t.to_dict() for t in tenders]