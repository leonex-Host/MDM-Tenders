"""
migrate_to_neon.py  — Run this ONCE on the Render backend server
================================================================
This connects to both databases from THE SAME Render server process,
so the Render DB firewall won't block the source connection.

On Render Shell / console:
  cd /app
  pip install psycopg2-binary
  python migrate_to_neon.py

Or commit it and call the /admin/migrate-neon endpoint once, then delete it.
"""

import os
import psycopg2

RENDER_URL = os.environ.get(
    "DATABASE_URL",  # Our current .env variable points to Render already
    "postgresql://mdm_scrap_user:osR0pNkPT6kuiUp7peLcLFPqNnDcEf8W@dpg-d8f73599rddc73ccibb0-a.oregon-postgres.render.com/mdm_scrap?sslmode=require"
)

NEON_URL = (
    "postgresql://neondb_owner:npg_5QNzOrSEDth4"
    "@ep-icy-surf-at11s5xr-pooler.c-9.us-east-1.aws.neon.tech"
    "/neondb?sslmode=require&channel_binding=require"
)

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


def migrate():
    print("=" * 60)
    print("  Live Render → Neon Migration (Server-Side)")
    print("=" * 60)

    src = psycopg2.connect(RENDER_URL)
    tgt = psycopg2.connect(NEON_URL)
    src_c = src.cursor()
    tgt_c = tgt.cursor()

    grand_total = 0
    try:
        for table, cols in TABLES.items():
            col_list = ", ".join(cols)
            placeholders = ", ".join(["%s"] * len(cols))

            src_c.execute(f"SELECT {col_list} FROM {table};")
            rows = src_c.fetchall()
            print(f"\n  [{table}]  {len(rows):,} rows from Render...")

            if rows:
                insert_sql = (
                    f"INSERT INTO {table} ({col_list}) "
                    f"VALUES ({placeholders}) ON CONFLICT DO NOTHING;"
                )
                tgt_c.executemany(insert_sql, rows)
                inserted = tgt_c.rowcount
                print(f"  [{table}]  {inserted:,} rows inserted into Neon ({len(rows) - inserted} skipped/existing)")
                grand_total += inserted

        tgt.commit()
        print(f"\n\n✅  DONE — {grand_total:,} total rows migrated to Neon.")

    except Exception as e:
        tgt.rollback()
        print(f"\n❌  Error: {e}")
        raise
    finally:
        src_c.close(); tgt_c.close()
        src.close(); tgt.close()


if __name__ == "__main__":
    migrate()
