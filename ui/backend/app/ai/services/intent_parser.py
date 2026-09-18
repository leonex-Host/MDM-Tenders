"""
Intent Parser - Understand what the user wants
"""
import re
from typing import Dict, Any, List, Tuple
from datetime import datetime, timedelta


class IntentParser:
    """
    Parse natural language queries to identify intent and extract entities
    """
    
    # Intent patterns
    PATTERNS = {
        'search': [
            r'find.*tender',
            r'search.*tender',
            r'look.*tender',
            r'get.*tender',
            r'show.*tender',
            r'list.*tender',
            r'what.*tender',
            r'any.*tender',
            r'tender.*for',
            r'(\bmdm\b|\bdata governance\b|\bmaximo\b)',
        ],
        'stats': [
            r'statistics?',
            r'count',
            r'how many',
            r'total.*tender',
            r'summary',
            r'overview',
            r'dashboard',
        ],
        'expiring': [
            r'expiring',
            r'ending soon',
            r'deadline',
            r'closing',
            r'urgent',
            r'last.*date',
            r'due.*soon',
        ],
        'high_value': [
            r'high value',
            r'big.*tender',
            r'large.*contract',
            r'expensive',
            r'costly',
            r'crore',
            r'lakh',
        ],
        'recent': [
            r'recent',
            r'latest',
            r'new',
            r'today',
            r'yesterday',
            r'last.*days?',
        ],
        'help': [
            r'help',
            r'how to',
            r'what can',
            r'commands?',
            r'usage',
        ],
    }
    
    # Entity extraction patterns
    ENTITY_PATTERNS = {
        'source': [
            r'from\s+(\w+)',
            r'in\s+(\w+)\s+portal',
            r'source[:\s]*(\w+)',
        ],
        'location': [
            r'in\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
            r'at\s+([A-Z][a-z]+)',
            r'location[:\s]*([A-Za-z\s]+)',
        ],
        'days': [
            r'(\d+)\s*days?',
            r'last\s*(\d+)\s*d',
            r'past\s*(\d+)\s*days?',
        ],
        'value': [
            r'above\s*([\d.]+)\s*(lakh|crore|cr|L)',
            r'more than\s*([\d.]+)',
            r'greater than\s*([\d.]+)',
            r'value[:\s]*([\d.]+)',
        ],
        'keyword': [
            r'about\s+([a-zA-Z\s]+)',
            r'for\s+([a-zA-Z\s]+)',
            r'keyword[:\s]*([a-zA-Z\s]+)',
        ],
    }
    
    def __init__(self):
        self._compile_patterns()
    
    def _compile_patterns(self):
        """Compile regex patterns"""
        self.compiled_patterns = {}
        for intent, patterns in self.PATTERNS.items():
            self.compiled_patterns[intent] = [
                re.compile(p, re.IGNORECASE) for p in patterns
            ]
        
        self.compiled_entity_patterns = {}
        for entity, patterns in self.ENTITY_PATTERNS.items():
            self.compiled_entity_patterns[entity] = [
                re.compile(p, re.IGNORECASE) for p in patterns
            ]
    
    def parse(self, message: str) -> Dict[str, Any]:
        """
        Parse user message to detect intent and extract entities
        
        Returns:
            {
                'intent': 'search|stats|expiring|...',
                'entities': {...},
                'confidence': 0.0-1.0
            }
        """
        message_lower = message.lower()
        
        # Detect intent
        intent_scores = {}
        for intent, patterns in self.compiled_patterns.items():
            score = 0
            for pattern in patterns:
                if pattern.search(message_lower):
                    score += 0.3
            intent_scores[intent] = min(score, 1.0)
        
        # Get highest scoring intent
        if intent_scores:
            best_intent = max(intent_scores, key=intent_scores.get)
            confidence = intent_scores[best_intent]
            
            # Default to search if confidence is low
            if confidence < 0.3:
                best_intent = 'search'
                confidence = 0.5
        else:
            best_intent = 'search'
            confidence = 0.5
        
        # Extract entities
        entities = self._extract_entities(message)
        
        return {
            'intent': best_intent,
            'entities': entities,
            'confidence': confidence
        }
    
    def _extract_entities(self, message: str) -> Dict[str, Any]:
        """Extract entities from message"""
        entities = {}
        
        for entity, patterns in self.compiled_entity_patterns.items():
            for pattern in patterns:
                match = pattern.search(message)
                if match:
                    value = match.group(1)
                    
                    # Clean up the value
                    if entity == 'days':
                        try:
                            entities['days'] = int(value)
                        except:
                            pass
                    elif entity == 'value':
                        try:
                            value_num = float(re.sub(r'[^\d.]', '', value))
                            entities['value_min'] = value_num
                            # Check for crore/lakh
                            if 'crore' in message.lower() or 'cr' in message.lower():
                                entities['value_min'] = value_num * 10000000
                            elif 'lakh' in message.lower() or 'l' in message.lower():
                                entities['value_min'] = value_num * 100000
                            else:
                                entities['value_min'] = value_num
                        except:
                            pass
                    elif entity == 'keyword':
                        entities['keyword'] = value.strip()
                    elif entity == 'source':
                        entities['source'] = value.lower()
                    elif entity == 'location':
                        entities['location'] = value.strip()
                    break
        
        return entities


# Singleton instance
_intent_parser = None

def get_intent_parser() -> IntentParser:
    global _intent_parser
    if _intent_parser is None:
        _intent_parser = IntentParser()
    return _intent_parser
