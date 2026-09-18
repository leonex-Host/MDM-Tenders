"""
Auth Dependencies — FastAPI Depends() helpers for protecting routes
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.auth.security import decode_token

# HTTP Bearer scheme — reads "Authorization: Bearer <token>" header
bearer_scheme = HTTPBearer(auto_error=False)


def _get_token_payload(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> dict:
    """Extract and verify JWT from Authorization header."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated — provide a Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_token(credentials.credentials)
        if payload.get("type") != "access":
            raise ValueError("Not an access token")
        return payload
    except (JWTError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def get_current_user(
    payload: dict = Depends(_get_token_payload),
    db: Session = Depends(get_db),
) -> User:
    """Return the authenticated User, or 401."""
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is disabled")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Extra check: allow only admin role."""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user
