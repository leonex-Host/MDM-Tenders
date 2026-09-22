import sys
import os
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.database import SessionLocal
from app.models import GoogleResult

def diagnose():
    db = SessionLocal()
    try:
        unwanted = db.query(GoogleResult).filter(GoogleResult.result_type == "unwanted").all()
        print(f"Total unwanted items identified: {len(unwanted)}")
        
        # Print a sample of 20 to diagnose what's going wrong
        for r in unwanted[:20]:
            print(f"Link: {r.link}")
    finally:
        db.close()

if __name__ == "__main__":
    diagnose()
