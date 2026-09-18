"""
Auth schemas — Pydantic models for request / response validation
"""
import re
from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional


# ── Request bodies ────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email:     EmailStr
    username:  str
    password:  str
    full_name: Optional[str] = None

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if not re.match(r"^[a-zA-Z0-9_.-]+$", v):
            raise ValueError("Username can only contain letters, numbers, _ . -")
        return v

    @field_validator("password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain at least one digit")
        return v


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token:        str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not re.search(r"[A-Z]", v):
            raise ValueError("Password must contain an uppercase letter")
        if not re.search(r"[0-9]", v):
            raise ValueError("Password must contain a digit")
        return v


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password:     str

    @field_validator("new_password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# ── Response models ───────────────────────────────────────────────────────────

class TokenResponse(BaseModel):
    access_token:  str
    refresh_token: str
    token_type:    str = "bearer"
    expires_in:    int   # seconds


class UserOut(BaseModel):
    id:         str
    email:      str
    username:   str
    full_name:  Optional[str]
    role:       str
    is_active:  bool
    created_at: Optional[str]

    model_config = {"from_attributes": True}
