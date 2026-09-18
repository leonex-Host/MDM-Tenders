# Database — MDM Tender Platform

## Connection

| Environment | URL |
|-------------|-----|
| **Production (Render)** | Set `DATABASE_URL` in Render dashboard |
| **Local Dev** | Uses external Render URL from `.env` |
| **Redis** | `REDIS_URL` in `.env` (default: `redis://127.0.0.1:6379/0`) |

## Tables

| Table | Purpose |
|-------|---------|
| `users` | App users with bcrypt passwords and roles |
| `tenders` | Scraped tender listings from all sources |
| `crawl_logs` | Scraper run history and status tracking |
| `google_results` | Google search scraper output |

## Schema

See `schema.sql` for the canonical CREATE TABLE statements.

## Quick Commands

```bash
# Connect to production DB (from local)
psql $DATABASE_URL

# Check table sizes
python database/scripts/check_db.py

# Export schema
pg_dump --schema-only $DATABASE_URL > database/schema.sql
```
