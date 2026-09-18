"""Quick script to check DB schema and users."""
from sqlalchemy import text
from app.database import engine

with engine.connect() as conn:
    res = conn.execute(text("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position"))
    print("=== USERS TABLE COLUMNS ===")
    for r in res:
        print(f"  {r[0]}: {r[1]}")

    print()
    res2 = conn.execute(text("SELECT id, email, username, role FROM users"))
    rows = res2.fetchall()
    print(f"=== USERS ({len(rows)}) ===")
    for r in rows:
        print(f"  id={r[0]} email={r[1]} user={r[2]} role={r[3]}")
