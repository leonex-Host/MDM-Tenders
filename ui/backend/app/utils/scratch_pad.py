"""
Persistent Scratch Pad - Resume capability
"""
import os
import json
from datetime import datetime
from typing import Dict, List, Any, Optional
import pandas as pd


class ScratchPad:
    """Persistent storage for crawler progress"""
    
    def __init__(self, name: str, keywords: List[str], reset: bool = True, data_dir: str = "data"):
        self.name = name
        self.keywords = keywords
        self.data_dir = data_dir
        self.file_path = os.path.join(data_dir, f"{name}_scratch.json")
        
        # Create data directory
        os.makedirs(data_dir, exist_ok=True)
        
        if reset and os.path.exists(self.file_path):
            os.remove(self.file_path)
            print(f"🔄 Reset scratch pad: {self.file_path}")
        
        self.data = self._load()
    
    def _load(self) -> Dict:
        """Load existing scratch data"""
        if os.path.exists(self.file_path):
            try:
                with open(self.file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    print(f"📂 Loaded scratch pad: {len(data.get('keywords_processed', []))}/{len(self.keywords)} keywords done")
                    return data
            except:
                pass
        
        return {
            'start_time': datetime.now().isoformat(),
            'keywords_processed': [],
            'current_keyword': None,
            'tenders_collected': [],
            'tender_ids_seen': [],
            'failed_urls': [],
            'stats': {
                'total_checked': 0,
                'total_matched': 0,
                'pages_scanned': 0,
                'duplicates_skipped': 0
            }
        }
    
    def _save(self):
        """Save scratch data"""
        try:
            with open(self.file_path, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"⚠️ Error saving scratch pad: {e}")
    
    def add_tender(self, tender: Dict) -> bool:
        """Add a tender if not duplicate"""
        tender_id = tender.get('tender_id') or tender.get('tot_ref_no') or tender.get('bdr_no')
        if not tender_id:
            return False
        
        if tender_id in self.data['tender_ids_seen']:
            self.data['stats']['duplicates_skipped'] += 1
            return False
        
        self.data['tender_ids_seen'].append(tender_id)
        self.data['tenders_collected'].append(tender)
        self.data['stats']['total_matched'] += 1
        self._save()
        return True
    
    def mark_keyword_start(self, keyword: str):
        self.data['current_keyword'] = keyword
        self._save()
    
    def mark_keyword_done(self, keyword: str):
        if keyword not in self.data['keywords_processed']:
            self.data['keywords_processed'].append(keyword)
            self._save()
    
    def increment_stats(self, **kwargs):
        for key, value in kwargs.items():
            if key in self.data['stats']:
                self.data['stats'][key] += value
        self._save()
    
    def get_unprocessed_keywords(self) -> List[str]:
        return [k for k in self.keywords if k not in self.data['keywords_processed']]
    
    def get_summary(self) -> Dict:
        return {
            'keywords_completed': len(self.data['keywords_processed']),
            'keywords_total': len(self.keywords),
            'tenders_collected': len(self.data['tenders_collected']),
            'stats': self.data['stats']
        }
    
    def export_to_dataframe(self):
        if self.data['tenders_collected']:
            return pd.DataFrame(self.data['tenders_collected'])
        return pd.DataFrame()