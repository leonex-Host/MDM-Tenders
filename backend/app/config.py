"""
Configuration — pydantic-settings based, reads from .env
"""
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # App
    APP_NAME: str = "Tender Intelligence Platform"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = "change-me-in-production"

    # Database
    # Render server → set DATABASE_URL env var to internal URL in Render dashboard
    # Local dev     → .env uses external URL (oregon-postgres.render.com)
    DATABASE_URL: str = ""

    # Redis
    REDIS_URL: str = "redis://127.0.0.1:6379/0"

    # Scraping
    HEADLESS_MODE: bool = False
    MAX_PAGES: int = 10
    MAX_CONCURRENT_TABS: int = 3
    SCRAPE_TIMEOUT: int = 30
    RESET_SCRATCH_PAD: bool = True

    # Directories
    DATA_DIR: str = "data"
    LOGS_DIR: str = "logs"

    # CORS
    CORS_ORIGINS: str = "https://harishhckr.github.io,http://127.0.0.1:8080,http://127.0.0.1:5500,http://localhost:5500,http://localhost:8080,null,*"

    @property
    def cors_origins_list(self) -> List[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",")]

    # ── JWT Auth ──────────────────────────────────────────────────────────────
    JWT_SECRET: str = "change-this-jwt-secret-in-render-env"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 1440   # 24 h
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # ── Chrome Extension ─────────────────────────────────────────────────
    EXTENSION_API_KEY: str = ""

    # All MDM/Tender keywords
    SEARCH_KEYWORDS: List[str] = [
        "Data Cataloguing",
        "codification",
        "master data",
        "Material Codification",
        "Master data management",
        "Material master data cleansing",
        "Implementation of Material Data Governance",
        "Material Data Governance",
        "Data governance solution",
        "Vendor Data Governance software",
        "Material master catalogue",
        "SOFTWARE TOOL FOR MASTER DATA MANAGEMENT",
        "Data Enrichment",
        "codification of material",         
        "Supply and implementation of Vendor data",
        "data catalogue",
        "Data Validation ",
        "data management and governance",
        "Deduplication, Cleansing and Standardization",
        "Data Cleansing",
        "Enrichment services",
        "Data Standardization",
        "Cataloguing and standardizing",
        "Cataloguing and classification",
        "Service master",
        "Vendor master",
        "Asset Master",
        "Asset Verification",
        "bill of material",
        "Material master",
        "data codification",
        "physical verification",
        "asset valuation",
        "material catalogue",
        "material verification"
    ]

    # ── Nodemailer Microservice ──────────────────────────────────────────────
    # URL of the Node.js Express + Nodemailer email service.
    # Local: http://localhost:3001
    # Render: set to your deployed email-service URL
    MAILER_URL: str = "http://localhost:3001"

    # Email — Resend HTTP API (works on Render / all cloud platforms)
    # Get your key at https://resend.com — free tier: 3000 emails/month
    RESEND_API_KEY: str = ""

    # Legacy SMTP fields (kept for reference — NOT used on Render)
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 465
    SMTP_USER: str = "mail.leonex@gmail.com"
    SMTP_PASS: str = ""
    SMTP_TLS: bool = True

    EMAIL_FROM: str = "mail.leonex@gmail.com"
    EMAIL_REPLY_TO: str = "mail.leonex@gmail.com"


settings = Settings()