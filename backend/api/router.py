from fastapi import APIRouter

from api.profile import router as profile_router
from api.scenarios import router as scenarios_router
from api.assets import router as assets_router
from api.simulation import router as simulation_router

router = APIRouter()
router.include_router(profile_router, prefix="/profile", tags=["profile"])
router.include_router(scenarios_router, prefix="/scenarios", tags=["scenarios"])
router.include_router(assets_router, prefix="/assets", tags=["assets"])
router.include_router(simulation_router, prefix="/simulate", tags=["simulation"])
