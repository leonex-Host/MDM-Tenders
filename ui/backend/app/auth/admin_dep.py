"""
Admin-only dependency — requires JWT user with role='admin'.
"""
from fastapi import Depends, HTTPException, status
from app.auth.dependencies import get_current_user
from app.models import User


async def require_admin(user: User = Depends(get_current_user)) -> User:
    """Raise 403 if the authenticated user is not an admin."""
    if user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return user
