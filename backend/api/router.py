from fastapi import APIRouter, Depends

from api.auth import router as auth_router
from api.profile import router as profile_router
from api.scenarios import router as scenarios_router
from api.assets import router as assets_router
from api.holdings import router as holdings_router
from api.simulation import router as simulation_router
from api.agent import router as agent_router
from api.onboarding import router as onboarding_router
from auth.middleware import require_auth

router = APIRouter()

# Auth routes — /auth/config is public, /auth/me requires token
router.include_router(auth_router, prefix="/auth", tags=["auth"])

# All data routes require auth when AUTH_ENABLED=true
router.include_router(
    profile_router,
    prefix="/profile",
    tags=["profile"],
    dependencies=[Depends(require_auth)],
)
router.include_router(
    scenarios_router,
    prefix="/scenarios",
    tags=["scenarios"],
    dependencies=[Depends(require_auth)],
)
router.include_router(
    assets_router,
    prefix="/assets",
    tags=["assets"],
    dependencies=[Depends(require_auth)],
)
router.include_router(
    holdings_router,
    prefix="/holdings",
    tags=["holdings"],
    dependencies=[Depends(require_auth)],
)
router.include_router(
    simulation_router,
    prefix="/simulate",
    tags=["simulation"],
    dependencies=[Depends(require_auth)],
)
router.include_router(
    agent_router,
    prefix="/agent",
    tags=["agent"],
    dependencies=[Depends(require_auth)],
)
router.include_router(
    onboarding_router,
    prefix="/onboarding",
    tags=["onboarding"],
    dependencies=[Depends(require_auth)],
)
