"""
db_migrate.py — Render → Neon Data Migration
=============================================
Copies ALL rows from the old Render PostgreSQL DB into the new Neon DB.
Uses direct SQL queries (no pg_dump needed) so it works without CLI tools.

Usage:
    pip install psycopg2-binary
    python database/scripts/db_migrate.py
"""
import sys
import os
import json

import psycopg2

# ── Connection strings ─────────────────────────────────────────────────────────
SOURCE_URL = "postgresql://mdm_scrap_user:osR0pNkPT6kuiUp7peLcLFPqNnDcEf8W@dpg-d8f73599rddc73ccibb0-a.oregon-postgres.render.com/mdm_scrap?sslmode=require"
TARGET_URL = os.environ.get(
    "NEON_DATABASE_URL",
    "postgresql://neondb_owner:npg_5QNzOrSEDth4@ep-icy-surf-at11s5xr-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"
)

# ─── Tables and their columns (matches schema.sql) ────────────────────────────
TABLES = {
    "users": [
        "id", "email", "username", "hashed_password", "full_name",
        "role", "is_active", "is_verified", "created_at", "last_login"
    ],
    "tenders": [
        "id", "tender_id", "source", "title", "description",
        "location", "start_date", "end_date", "link", "keyword", "created_at"
    ],
    "crawl_logs": [
        "id", "source", "keyword", "status", "tenders_found",
        "tenders_saved", "pages_scanned", "error_message", "started_at", "completed_at"
    ],
    "google_results": [
        "id", "result_type", "title", "description", "link",
        "search_query", "keywords", "page_excerpt", "is_pdf", "scraped_at"
    ],
}

def migrate_table(src_cur, tgt_cur, table, columns):
    col_list = ", ".join(columns)
    placeholders = ", ".join(["%s"] * len(columns))
    
    src_cur.execute(f"SELECT {col_list} FROM {table};")
    rows = src_cur.fetchall()
    print(f"  [{table}] {len(rows)} rows fetched from source")
    
    if not rows:
        return 0

    insert_sql = (
        f"INSERT INTO {table} ({col_list}) VALUES ({placeholders}) "
        f"ON CONFLICT DO NOTHING;"
    )
    
    tgt_cur.executemany(insert_sql, rows)
    print(f"  [{table}] {tgt_cur.rowcount} rows inserted into Neon")
    return len(rows)

def main():
    if not TARGET_URL:
        print("ERROR: Set environment variable NEON_DATABASE_URL before running!")
        print("  Example: set NEON_DATABASE_URL=postgresql://user:pass@host/db?sslmode=require")
        sys.exit(1)

    print("=" * 60)
    print("  Render → Neon Data Migration")
    print("=" * 60)
    print(f"  Source: Render ({SOURCE_URL[:40]}...)")
    print(f"  Target: Neon   ({TARGET_URL[:40]}...)")
    print()

    src_conn = psycopg2.connect(SOURCE_URL)
    tgt_conn = psycopg2.connect(TARGET_URL)
    
    src_cur = src_conn.cursor()
    tgt_cur = tgt_conn.cursor()

    try:
        for table, columns in TABLES.items():
            print(f"\n--- Migrating: {table} ---")
            migrate_table(src_cur, tgt_cur, table, columns)
        
        tgt_conn.commit()
        print("\n\n✅  Migration complete! All data committed to Neon.")
    except Exception as e:
        tgt_conn.rollback()
        print(f"\n❌  Error during migration: {e}")
        raise
    finally:
        src_cur.close()
        tgt_cur.close()
        src_conn.close()
        tgt_conn.close()


if __name__ == "__main__":
    main()
