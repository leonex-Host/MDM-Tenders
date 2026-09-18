"""
Pydantic Schemas — v2 compatible
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict
import uuid


class TenderBase(BaseModel):
    tender_id:   Optional[str] = None
    source:      str
    title:       Optional[str] = None
    description: Optional[str] = None
    location:    Optional[str] = None
    start_date:  Optional[str] = None
    end_date:    Optional[str] = None
    link:        Optional[str] = None
    keyword:     Optional[str] = None


class TenderCreate(TenderBase):
    pass


class TenderResponse(TenderBase):
    model_config = ConfigDict(from_attributes=True)
    id:         uuid.UUID
    created_at: Optional[datetime] = None


class TenderListResponse(BaseModel):
    total:   int
    page:    int
    limit:   int
    results: List[TenderResponse]


class StatsResponse(BaseModel):
    total_tenders:    int
    tenders_by_source: dict
    last_scraped:    Optional[str] = None


class ScrapeRequest(BaseModel):
    source:  Optional[str] = None   # None = all sources
    keyword: Optional[str] = None   # None = all configured keywords