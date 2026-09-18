-- ============================================================
-- MDM Tender Platform — Canonical Database Schema
-- PostgreSQL 15+
-- ============================================================

-- ── Users ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           VARCHAR(255) NOT NULL UNIQUE,
    username        VARCHAR(100) NOT NULL UNIQUE,
    hashed_password VARCHAR(255) NOT NULL,
    full_name       VARCHAR(200),
    role            VARCHAR(30)  DEFAULT 'user',       -- 'user' | 'admin'
    is_active       BOOLEAN      DEFAULT TRUE,
    is_verified     BOOLEAN      DEFAULT FALSE,
    created_at      TIMESTAMPTZ  DEFAULT NOW(),
    last_login      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_users_email    ON users (email);
CREATE INDEX IF NOT EXISTS ix_users_username ON users (username);


-- ── Tenders ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tenders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tender_id   VARCHAR(200),
    source      VARCHAR(50)  NOT NULL,   -- gem | tender247 | tenderdetail | tenderontime | biddetail
    title       VARCHAR(600),
    description TEXT,
    location    VARCHAR(300),
    start_date  VARCHAR(100),
    end_date    VARCHAR(100),
    link        VARCHAR(800),
    keyword     VARCHAR(300),
    created_at  TIMESTAMPTZ  DEFAULT NOW(),

    CONSTRAINT uq_tender_source UNIQUE (tender_id, source)
);

CREATE INDEX IF NOT EXISTS ix_tenders_source         ON tenders (source);
CREATE INDEX IF NOT EXISTS ix_tenders_source_created  ON tenders (source, created_at);


-- ── Crawl Logs ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crawl_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source          VARCHAR(50),
    keyword         VARCHAR(300),
    status          VARCHAR(30) DEFAULT 'running',    -- running | completed | failed
    tenders_found   VARCHAR(20) DEFAULT '0',
    tenders_saved   VARCHAR(20) DEFAULT '0',
    pages_scanned   VARCHAR(20) DEFAULT '0',
    error_message   TEXT,
    started_at      TIMESTAMPTZ DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ix_crawl_logs_source ON crawl_logs (source);


-- ── Google Results ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS google_results (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    result_type     VARCHAR(20) NOT NULL,              -- 'all' | 'filtered'
    title           VARCHAR(800),
    description     TEXT,
    link            VARCHAR(1000),
    search_query    VARCHAR(500),
    keywords        TEXT,                              -- JSON array as text
    page_excerpt    TEXT,
    is_pdf          VARCHAR(5)  DEFAULT 'false',
    scraped_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_google_results_type        ON google_results (result_type);
CREATE INDEX IF NOT EXISTS ix_google_results_scraped     ON google_results (scraped_at);
CREATE INDEX IF NOT EXISTS ix_google_results_type_scraped ON google_results (result_type, scraped_at);
