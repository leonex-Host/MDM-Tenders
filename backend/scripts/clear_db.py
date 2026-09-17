import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal, engine, Base
from app.models import Tender, CrawlLog

def clear_data():
    db = SessionLocal()
    try:
        t_count = db.query(Tender).delete()
        c_count = db.query(CrawlLog).delete()
        db.commit()
        print(f"Cleared {t_count} tenders and {c_count} crawl logs.")
    except Exception as e:
        print(f"Error clearing database: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    confirm = input("This will delete all tenders and logs. Type YES to continue: ")
    if confirm.strip() == "YES":
        clear_data()
    else:
        print("Aborted.")
