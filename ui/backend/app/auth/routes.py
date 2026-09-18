"""
Auth Routes — /api/auth/*
  POST /api/auth/register
  POST /api/auth/login
  POST /api/auth/refresh
  POST /api/auth/forgot-password
  POST /api/auth/reset-password
  POST /api/auth/change-password  (protected)
  GET  /api/auth/me               (protected)
  POST /api/auth/logout           (client-side — just a confirmation)
"""
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from sqlalchemy.orm import Session
from jose import JWTError

from app.database import get_db
from app.models import User
from app.auth.security import (
    hash_password, verify_password,
    create_access_token, create_refresh_token, decode_token,
)
from app.auth.schemas import (
    RegisterRequest, LoginRequest,
    ForgotPasswordRequest, ResetPasswordRequest,
    ChangePasswordRequest, TokenResponse, UserOut,
)
from app.auth.dependencies import get_current_user
from app.config import settings
from app.utils.logger import get_logger

logger = get_logger("auth")
router = APIRouter(prefix="/api/auth", tags=["Auth"])


# ─────────────────────────────────────────────────────────────────────────────
# REGISTER
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    """Create a new user account."""
    # Check email uniqueness
    if db.query(User).filter(User.email == body.email.lower()).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    # Check username uniqueness
    if db.query(User).filter(User.username == body.username.lower()).first():
        raise HTTPException(status_code=409, detail="Username already taken")

    user = User(
        email           = body.email.lower().strip(),
        username        = body.username.lower().strip(),
        hashed_password = hash_password(body.password),
        full_name       = body.full_name,
        is_active       = True,
        is_verified     = False,    # email verification can be added later
        role            = "user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    logger.info("New user registered: %s", user.email)
    return user.to_dict()


# ─────────────────────────────────────────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    """Authenticate and return access + refresh tokens."""
    try:
        user = db.query(User).filter(User.email == body.email.lower()).first()

        # Always run verify_password even if user not found → prevent timing attacks
        dummy_hash = "$2b$12$KIXMlLaQoHLkzOcIhCXtDu6G9cFz2m1xJ0IcR9d8iC3pMLkxFNAGe"
        if not user:
            verify_password(body.password, dummy_hash)
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not verify_password(body.password, user.hashed_password):
            raise HTTPException(status_code=401, detail="Invalid email or password")

        if not user.is_active:
            raise HTTPException(status_code=403, detail="Account is disabled. Contact support.")

        # Update last login timestamp
        user.last_login = datetime.now(timezone.utc)
        db.commit()

        access  = create_access_token(str(user.id), extra={"role": user.role, "email": user.email})
        refresh = create_refresh_token(str(user.id))

        logger.info("User logged in: %s", user.email)
        return TokenResponse(
            access_token  = access,
            refresh_token = refresh,
            expires_in    = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("LOGIN CRASH: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Login error: {str(e)}")



# ─────────────────────────────────────────────────────────────────────────────
# REFRESH TOKEN
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/refresh", response_model=TokenResponse)
def refresh_token(body: dict, db: Session = Depends(get_db)):
    """Exchange a valid refresh token for a new access token."""
    token = body.get("refresh_token", "")
    try:
        payload = decode_token(token)
        if payload.get("type") != "refresh":
            raise ValueError("Not a refresh token")
    except (JWTError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired refresh token")

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")

    access  = create_access_token(str(user.id), extra={"role": user.role, "email": user.email})
    refresh = create_refresh_token(str(user.id))
    return TokenResponse(
        access_token  = access,
        refresh_token = refresh,
        expires_in    = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ─────────────────────────────────────────────────────────────────────────────
# FORGOT PASSWORD — sends reset token (logged, no email service yet)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    Generate a short-lived password-reset token.
    In production: send via email. Here: returned in response (for UI demo).
    """
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if not user:
        # Security: always return 200 — don't reveal if email exists
        return {"message": "If that email is registered, a reset link has been sent."}

    # Use JWT with type="reset" and 15-minute expiry
    from jose import jwt as _jwt
    reset_token = _jwt.encode(
        {
            "sub":  str(user.id),
            "type": "reset",
            "exp":  datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        settings.JWT_SECRET,
        algorithm=settings.JWT_ALGORITHM,
    )
    logger.info("Password reset requested for: %s | token: %s", user.email, reset_token)
    # TODO: send via email (e.g. SendGrid / Resend)
    return {
        "message": "Reset token generated.",
        "reset_token": reset_token,   # Remove this line once email service is set up
    }


# ─────────────────────────────────────────────────────────────────────────────
# RESET PASSWORD
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    """Use the reset token to set a new password."""
    try:
        payload = decode_token(body.token)
        if payload.get("type") != "reset":
            raise ValueError("Not a reset token")
    except (JWTError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(body.new_password)
    db.commit()
    logger.info("Password reset successful for: %s", user.email)
    return {"message": "Password updated successfully. Please log in."}


# ─────────────────────────────────────────────────────────────────────────────
# CHANGE PASSWORD (authenticated)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/change-password")
def change_password(
    body:         ChangePasswordRequest,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Authenticated route — change own password by providing current + new."""
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    current_user.hashed_password = hash_password(body.new_password)
    db.commit()
    logger.info("Password changed for: %s", current_user.email)
    return {"message": "Password changed successfully"}


# ─────────────────────────────────────────────────────────────────────────────
# ME — current user info
# ─────────────────────────────────────────────────────────────────────────────
@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile."""
    return current_user.to_dict()


# ─────────────────────────────────────────────────────────────────────────────
# LOGOUT (client-side — just confirms)
# ─────────────────────────────────────────────────────────────────────────────
@router.post("/logout")
def logout(current_user: User = Depends(get_current_user)):
    """Client must delete its stored tokens. Server just confirms."""
    logger.info("User logged out: %s", current_user.email)
    return {"message": "Logged out successfully. Delete your tokens on the client."}
