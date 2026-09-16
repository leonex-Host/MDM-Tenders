"""
FastAPI Application — main entry point
"""
from contextlib import asynccontextmanager
# SMTP Resend Diagnostic Build: 2026-06-12T18:15
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import create_tables, SessionLocal
from app.models import User
from app.auth.security import hash_password
from app.utils.logger import get_logger, setup_global_memory_logger

logger = get_logger("main")
setup_global_memory_logger()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup: create DB tables and default user."""
    logger.info("Starting %s v%s", settings.APP_NAME, settings.APP_VERSION)
    import time
    
    max_retries = 5
    for attempt in range(1, max_retries + 1):
        try:
            # 1. Create tables
            create_tables()
            logger.info("Database tables ready")
            
            # 2. Create default user if none exists
            db = SessionLocal()
            try:
                # 2. Check and enforce Role-Based Default Users
                def ensure_user(email, username, password, role_name):
                    user = db.query(User).filter(User.email == email).first()
                    if not user:
                        logger.info(f"Creating default {role_name} user ({email})...")
                        user = User(
                            email=email,
                            username=username,
                            hashed_password=hash_password(password),
                            full_name=f"System {role_name.capitalize()}",
                            role=role_name,
                            is_active=True
                        )
                        db.add(user)
                    else:
                        logger.info(f"Existing {role_name} found ({email}) - enforcing specific role attributes...")
                        user.hashed_password = hash_password(password)
                        user.role = role_name
                        user.is_active = True
                
                # Enforce Admin Account
                ensure_user("admin@leonex.net", "admin", "Admin@123", "admin")
                # Enforce Standard User Account
                ensure_user("Leonexdotcom@gmail.com", "leonex_user", "Leonex@123", "user")
                
                db.commit()
                logger.info("Role-based accounts successfully checked and enforced.")
            finally:
                db.close()
            break # Success, exit retry loop
            
        except Exception as e:
            logger.warning("DB connection failed on attempt %d: %s", attempt, e)
            if attempt < max_retries:
                time.sleep(3)
            else:
                logger.error("Failed to connect to the database after %d retries.", max_retries)
                # optionally raise e here, but skipping to avoid crash loops if DB is entirely down
        
    yield
    logger.info("Shutting down")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    debug=settings.DEBUG,
    lifespan=lifespan,
)

request_logger = get_logger("nounmod.request")

import time
import uuid
from fastapi import Request

@app.middleware("http")
async def log_requests(request: Request, call_next):
    req_id = str(uuid.uuid4().hex)[:6]
    start_time = time.time()
    
    # Extract client IP
    client_ip = request.client.host if request.client else "unknown"
    
    # Forward the request to the route handler
    response = await call_next(request)
    
    # Calculate response time
    process_time_ms = int((time.time() - start_time) * 1000)
    
    # Build strict specific log format
    log_msg = f"{time.strftime('%Y-%m-%d %H:%M:%S')} | {request.method} | {request.url.path} | {response.status_code} | {process_time_ms}ms | {client_ip} | req:{req_id}"
    request_logger.info(log_msg)
    
    return response

# CORS — allow the frontend origin
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
# Auth (public — login, register, etc.)
from app.auth.routes import router as auth_router
app.include_router(auth_router)
logger.info("Auth router loaded")

# Tender routes
from app.api.routes import router as tender_router
app.include_router(tender_router)                  # /api/tenders, /api/search, etc.

# Extension API (Chrome Extension communication)
from app.api.extension_api import router as extension_router
app.include_router(extension_router)               # /api/extension/*
logger.info("Extension API router loaded")

# Google Search router
try:
    from app.api.google_routes import router as google_router
    app.include_router(google_router)             # /api/google/*
    logger.info("Google router loaded")
except Exception as exc:
    logger.warning("Google router failed to load: %s", exc)

# AI Chat router (graceful — won't crash if Ollama is down)
try:
    from app.ai.routes.chat_routes import router as chat_router
    app.include_router(chat_router)               # /api/ai/chat, /api/ai/health
    logger.info("AI Chat router loaded")
except Exception as exc:
    logger.warning("AI Chat router failed to load: %s", exc)

# Admin Portal router
try:
    from app.api.admin_api import router as admin_router
    app.include_router(admin_router)              # /api/admin/*
    logger.info("Admin router loaded")
except Exception as exc:
    logger.warning("Admin router failed to load: %s", exc)

# Email Management router
try:
    from app.api.email_api import router as email_router
    app.include_router(email_router)              # /api/admin/emails/*
    logger.info("Email router loaded")
    
    # Email scheduler disabled — emails are sent only via manual Sync Engine trigger
    # from app.services.email_service import EmailScheduler
    # EmailScheduler.start()
except Exception as exc:
    logger.warning("Email router/scheduler failed to load: %s", exc)


@app.get("/")
def root():
    return {"name": settings.APP_NAME, "version": settings.APP_VERSION, "status": "running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    # Don't intercept HTTPException — let FastAPI handle them with the correct status code
    from fastapi import HTTPException
    if isinstance(exc, HTTPException):
        raise exc
    logger.error("Unhandled error: %s", exc)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})