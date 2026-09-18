"""
Response Builder - Format AI responses
"""
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

from app.ai.llm.prompt_templates import PromptTemplates


class ResponseBuilder:
    """
    Build formatted responses based on intent and data
    """
    
    def __init__(self):
        self.templates = PromptTemplates()
    
    def build(self, intent: str, data: Any, entities: Dict = None, error: str = None) -> str:
        """
        Build response based on intent
        """
        if error:
            return f"❌ {error}"
        
        if intent == 'search':
            return self.templates.search_response(data, entities.get('keyword', 'your query') if entities else '')
        
        elif intent == 'stats':
            return self.templates.stats_response(data)
        
        elif intent == 'expiring':
            days = entities.get('days', 7) if entities else 7
            return self.templates.expiring_response(data, days)
        
        elif intent == 'high_value':
            return self.templates.high_value_response(data)
        
        elif intent == 'recent':
            days = entities.get('days', 1) if entities else 1
            return self.templates.search_response(data, f"recent {days} days")
        
        elif intent == 'help':
            return self.templates.help_response()
        
        else:
            return self.templates.search_response(data, "your query")


# Singleton instance
_response_builder = None

def get_response_builder() -> ResponseBuilder:
    global _response_builder
    if _response_builder is None:
        _response_builder = ResponseBuilder()
    return _response_builder
