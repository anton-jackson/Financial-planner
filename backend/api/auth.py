"""Auth API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from auth.middleware import AuthUser, require_auth
from config import AUTH_ENABLED

router = APIRouter()


@router.get("/me")
async def get_current_user(user: AuthUser | None = Depends(require_auth)):
    """Return the authenticated user's info, or auth_enabled=false status."""
    if not AUTH_ENABLED:
        return {"auth_enabled": False, "email": None}
    return {"auth_enabled": True, "email": user.email, "user_id": user.user_id}


@router.get("/config")
async def get_auth_config():
    """Public endpoint — tells the frontend whether auth is required."""
    return {"auth_enabled": AUTH_ENABLED}
