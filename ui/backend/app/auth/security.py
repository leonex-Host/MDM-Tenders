"""
Auth — Password hashing (bcrypt) + JWT (HS256)
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
# removed passlib

from app.config import settings

import bcrypt

def hash_password(plain: str) -> str:
    """Return bcrypt hash of the plain-text password."""
    # bcrypt requires bytes, and returns bytes. We store it as a string.
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(plain.encode('utf-8'), salt)
    return hashed.decode('utf-8')

def verify_password(plain: str, hashed: str) -> bool:
    """Return True if plain matches the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


# ── JWT helpers ───────────────────────────────────────────────────────────────
def _make_token(data: dict, expires_delta: timedelta) -> str:
    payload = data.copy()
    payload["exp"] = datetime.now(timezone.utc) + expires_delta
    payload["iat"] = datetime.now(timezone.utc)
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(subject: str, extra: Optional[dict] = None) -> str:
    """Create a signed JWT access token (expires in ACCESS_TOKEN_EXPIRE_MINUTES)."""
    data = {"sub": subject, "type": "access"}
    if extra:
        data.update(extra)
    return _make_token(data, timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))


def create_refresh_token(subject: str) -> str:
    """Create a long-lived refresh token."""
    return _make_token(
        {"sub": subject, "type": "refresh"},
        timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    )


def decode_token(token: str) -> dict:
    """Decode and verify JWT. Raises JWTError on failure."""
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
