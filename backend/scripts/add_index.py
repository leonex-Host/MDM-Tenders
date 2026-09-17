import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal
from sqlalchemy import text

def add_index():
    db = SessionLocal()
    try:
        db.execute(text("CREATE INDEX IF NOT EXISTS ix_tenders_created_at ON public.tenders (created_at);"))
        db.commit()
        print("Successfully added created_at DB index.")
    except Exception as e:
        print(f"Error adding index: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    add_index()
