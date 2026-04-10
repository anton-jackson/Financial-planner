"""One-shot onboarding endpoint.

Saves profile + assets + bootstraps example scenarios in a single call
so the user can go from zero to a running simulation in one wizard.
"""

import shutil
from pathlib import Path

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from config import DATA_DIR
from dependencies import get_storage
from models.profile import Profile
from models.assets import AssetsFile
from storage.local import LocalFileStorage

router = APIRouter()


class OnboardingPayload(BaseModel):
    profile: Profile
    assets: AssetsFile


class OnboardingStatus(BaseModel):
    needs_onboarding: bool


@router.get("/status", response_model=OnboardingStatus)
def get_onboarding_status(storage: LocalFileStorage = Depends(get_storage)):
    """Check if the user needs onboarding (no profile.yaml exists)."""
    return OnboardingStatus(needs_onboarding=not storage.exists("profile.yaml"))


@router.post("/complete")
def complete_onboarding(
    payload: OnboardingPayload,
    storage: LocalFileStorage = Depends(get_storage),
):
    """Save profile + assets + bootstrap scenarios in one shot."""
    # Save profile
    storage.write("profile.yaml", payload.profile.model_dump())

    # Save assets
    storage.write("assets.yaml", payload.assets.model_dump())

    # Bootstrap example scenarios if none exist
    scenarios_dir = storage.base_dir / "scenarios"
    if not scenarios_dir.exists() or not list(scenarios_dir.glob("*.yaml")):
        example_dir = Path(__file__).parent.parent / "data" / "scenarios"
        if example_dir.exists():
            scenarios_dir.mkdir(parents=True, exist_ok=True)
            for src in example_dir.glob("*.yaml"):
                dst = scenarios_dir / src.name
                if not dst.exists():
                    shutil.copy2(src, dst)

    return {"status": "ok", "message": "Onboarding complete"}
