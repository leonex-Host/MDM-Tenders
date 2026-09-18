"""
Pydantic models for AI chat
"""
from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """Single chat message"""
    role: str = Field(..., description="user or assistant")
    content: str = Field(..., description="message content")
    timestamp: datetime = Field(default_factory=datetime.now)


class ChatRequest(BaseModel):
    """Request to AI chat endpoint"""
    message: str = Field(..., description="User's message")
    session_id: Optional[str] = Field(None, description="Session ID for conversation history")
    max_results: int = Field(10, ge=1, le=50, description="Max results to return")


class ChatResponse(BaseModel):
    """Response from AI chat"""
    message: str = Field(..., description="AI's response")
    session_id: str = Field(..., description="Session ID")
    intent: str = Field(..., description="Detected intent")
    data: Optional[List[Dict[str, Any]]] = Field(None, description="Tender data if applicable")
    sources: Optional[List[str]] = Field(None, description="Source URLs")
    timestamp: datetime = Field(default_factory=datetime.now)


class Intent(BaseModel):
    """Detected user intent"""
    type: str  # search, stats, help, etc.
    entities: Dict[str, Any] = {}
    confidence: float = 0.0
