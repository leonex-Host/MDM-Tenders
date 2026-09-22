import sys
import os
import json
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models import GoogleResult

MDM_KEYWORDS = [
    "material codification", "Data Cataloguing", "Master data management",
    "Data Enrichment", "physical verification", "asset valuation",
    "material cataloguing", "Asset Verification", "bill of material",
    "sap master data", "Material Data Governance", "codification",
    "material master data cleansing", "Implementation of Material Data Governance",
    "Data governance solution", "Vendor Data Governance software",
    "Material master catalogue", "SOFTWARE TOOL FOR MASTER DATA MANAGEMENT",
    "codification of material", "Supply and implementation of Vendor data",
    "data catalogue", "Data Validation", "data management and governance",
    "Deduplication, Cleansing and Standardization", "Data Cleansing",
    "Enrichment services", "Data Standardization", "Cataloguing and standardizing",
    "Cataloguing and classification", "Service master", "Vendor master",
    "Asset Master", "Material master", "data codification", 
    "material catalogue", "material verification"
]

def fix_all():
    db = SessionLocal()
    try:
        all_records = db.query(GoogleResult).filter(
            (GoogleResult.search_query == "ALL") | 
            (GoogleResult.search_query.ilike('%"ALL"%'))
        ).all()
        
        print(f"Total records to rescue: {len(all_records)}")
        
        fixed_count = 0
        for r in all_records:
            text_to_search = (str(r.title) + " " + str(r.description)).lower()
            matched_kw = None
            
            for kw in MDM_KEYWORDS:
                if kw.lower() in text_to_search:
                    matched_kw = kw
                    break
                    
            if not matched_kw:
                matched_kw = "Data Cataloguing" # Safe default fallback
                
            r.search_query = f'"{matched_kw}" tenders'
            r.keywords = json.dumps([f'"{matched_kw}" tenders'])
            fixed_count += 1
            
            if fixed_count % 100 == 0:
                db.commit()
                
        db.commit()
        print(f"[+] Successfully reverse-engineered and mapped {fixed_count} legacy records.")
            
    finally:
        db.close()

if __name__ == "__main__":
    fix_all()
