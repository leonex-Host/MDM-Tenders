"""
Conversation memory store - keeps chat history
"""
from typing import Dict, List, Optional
from datetime import datetime, timedelta
import uuid
from collections import defaultdict

from app.ai.models.chat_models import ChatMessage


class ConversationStore:
    """
    In-memory conversation store with TTL
    """
    
    def __init__(self, ttl_minutes: int = 60):
        self._sessions: Dict[str, List[ChatMessage]] = {}
        self._last_activity: Dict[str, datetime] = {}
        self.ttl_minutes = ttl_minutes
    
    def create_session(self) -> str:
        """Create a new conversation session"""
        session_id = str(uuid.uuid4())[:8]
        self._sessions[session_id] = []
        self._last_activity[session_id] = datetime.now()
        return session_id
    
    def add_message(self, session_id: str, role: str, content: str) -> None:
        """Add a message to conversation history"""
        if session_id not in self._sessions:
            self._sessions[session_id] = []
        
        message = ChatMessage(role=role, content=content)
        self._sessions[session_id].append(message)
        self._last_activity[session_id] = datetime.now()
        
        # Keep only last 20 messages per session
        if len(self._sessions[session_id]) > 20:
            self._sessions[session_id] = self._sessions[session_id][-20:]
    
    def get_history(self, session_id: str, limit: int = 10) -> List[ChatMessage]:
        """Get recent conversation history"""
        if session_id not in self._sessions:
            return []
        
        # Clean expired sessions
        self._clean_expired()
        
        return self._sessions[session_id][-limit:]
    
    def format_history_for_prompt(self, session_id: str) -> str:
        """Format conversation history for LLM prompt"""
        history = self.get_history(session_id, limit=10)
        if not history:
            return ""
        
        formatted = []
        for msg in history:
            role = "User" if msg.role == "user" else "Assistant"
            formatted.append(f"{role}: {msg.content}")
        
        return "\n".join(formatted)
    
    def _clean_expired(self):
        """Remove expired sessions"""
        now = datetime.now()
        expired = [
            sid for sid, last_active in self._last_activity.items()
            if (now - last_active).total_seconds() > self.ttl_minutes * 60
        ]
        for sid in expired:
            self._sessions.pop(sid, None)
            self._last_activity.pop(sid, None)


# Singleton instance
_conversation_store = None

def get_conversation_store() -> ConversationStore:
    global _conversation_store
    if _conversation_store is None:
        _conversation_store = ConversationStore()
    return _conversation_store
