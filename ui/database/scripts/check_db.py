"""
Database Health Check Script
Run: python database/scripts/check_db.py
"""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'backend'))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '..', 'backend', '.env'))

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set in .env")
    sys.exit(1)

engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    print("=" * 60)
    print("  MDM Tender Platform — Database Health Check")
    print("=" * 60)

    tables = ["users", "tenders", "crawl_logs", "google_results"]
    for t in tables:
        try:
            row = conn.execute(text(f"SELECT COUNT(*) FROM {t}")).scalar()
            print(f"  {t:25s}  {row:>8,} rows")
        except Exception as e:
            print(f"  {t:25s}  ERROR: {e}")

    print("-" * 60)
    print("  Connection OK ✓")
