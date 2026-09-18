"""
Chat Service - Main AI brain
"""
import logging
from typing import Dict, Any, Optional
from sqlalchemy.orm import Session

from app.ai.services.intent_parser import get_intent_parser
from app.ai.services.tender_agent import TenderAgent
from app.ai.services.response_builder import get_response_builder
from app.ai.memory.conversation_store import get_conversation_store
from app.ai.llm.ollama_client import get_ollama_client
from app.ai.models.chat_models import ChatResponse
from app.database import get_db

logger = logging.getLogger(__name__)


class ChatService:
    """
    Main AI chat service orchestrator
    """
    
    def __init__(self):
        self.intent_parser = get_intent_parser()
        self.response_builder = get_response_builder()
        self.conversation_store = get_conversation_store()
        self.ollama_client = get_ollama_client()
    
    async def process_message(self, message: str, session_id: str = None, db: Session = None) -> ChatResponse:
        """
        Process user message and return AI response
        """
        # Create session if not exists
        if not session_id:
            session_id = self.conversation_store.create_session()
        
        # Add user message to history
        self.conversation_store.add_message(session_id, "user", message)
        
        # Get conversation history
        history = self.conversation_store.format_history_for_prompt(session_id)
        
        # Parse intent
        parsed = self.intent_parser.parse(message)
        intent = parsed['intent']
        entities = parsed['entities']
        confidence = parsed['confidence']
        
        logger.info(f"Intent: {intent}, Entities: {entities}, Confidence: {confidence}")
        
        # Initialize database session if not provided
        if not db:
            from app.database import SessionLocal
            db = SessionLocal()
            should_close = True
        else:
            should_close = False
        
        try:
            tender_agent = TenderAgent(db)
            
            # Execute based on intent
            data = None
            error = None
            
            try:
                if intent == 'search':
                    data = tender_agent.search_tenders(entities, limit=10)
                
                elif intent == 'stats':
                    data = tender_agent.get_statistics()
                
                elif intent == 'expiring':
                    days = entities.get('days', 7)
                    data = tender_agent.get_expiring_tenders(days, limit=10)
                
                elif intent == 'high_value':
                    min_value = entities.get('value_min', 10000000)  # 1 Crore default
                    data = tender_agent.get_high_value_tenders(min_value, limit=10)
                
                elif intent == 'recent':
                    days = entities.get('days', 1)
                    data = tender_agent.get_recent_tenders(days, limit=10)
                
                elif intent == 'help':
                    data = None
                
                else:
                    # Fallback to search
                    data = tender_agent.search_tenders(entities, limit=10)
            
            except Exception as e:
                error = str(e)
                logger.error(f"Error in tender agent: {e}")
            
            # Build response
            if error:
                response_text = f"❌ I encountered an error: {error}"
            else:
                response_text = self.response_builder.build(intent, data, entities, error)
            
            # Try to enhance with LLM (if available)
            if self.ollama_client.is_available and data:
                try:
                    enhanced = await self.ollama_client.enhance_response(
                        user_message=message,
                        intent=intent,
                        data=data,
                        history=history
                    )
                    if enhanced:
                        response_text = enhanced
                except Exception as e:
                    logger.warning(f"LLM enhancement failed: {e}")
            
            # Add assistant response to history
            self.conversation_store.add_message(session_id, "assistant", response_text)
            
            # Prepare response
            chat_response = ChatResponse(
                message=response_text,
                session_id=session_id,
                intent=intent,
                data=data if isinstance(data, list) and len(data) > 0 else None,
                sources=[t.get('document_link') for t in data[:3]] if isinstance(data, list) and data else None
            )
            
            return chat_response
            
        finally:
            if should_close and db:
                db.close()


# Singleton instance
_chat_service = None

def get_chat_service() -> ChatService:
    global _chat_service
    if _chat_service is None:
        _chat_service = ChatService()
    return _chat_service