import sys
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from app.database import SessionLocal
from sqlalchemy import text

def check_tables():
    db = SessionLocal()
    result = db.execute(text("SELECT schemaname, tablename FROM pg_catalog.pg_tables WHERE schemaname != 'pg_catalog' AND schemaname != 'information_schema';"))
    for row in result:
        print(f"Schema: {row.schemaname}, Table: {row.tablename}")
    db.close()

if __name__ == "__main__":
    check_tables()
