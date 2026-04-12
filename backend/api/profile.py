from fastapi import APIRouter, Depends, HTTPException

from dependencies import get_storage
from models.profile import Profile
from storage.local import LocalFileStorage

router = APIRouter()
PROFILE_PATH = "profile.yaml"


def _migrate_profile(data: dict) -> dict:
    """Convert legacy helocs list to generalized debts list."""
    if "helocs" in data and "debts" not in data:
        data["debts"] = [
            {**h, "type": "heloc"} for h in data["helocs"]
        ]
        del data["helocs"]
    return data


@router.get("", response_model=Profile)
def get_profile(storage: LocalFileStorage = Depends(get_storage)):
    try:
        data = storage.read(PROFILE_PATH)
        data = _migrate_profile(data)
        return Profile(**data)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Profile not found")


@router.put("", response_model=Profile)
def put_profile(profile: Profile, storage: LocalFileStorage = Depends(get_storage)):
    storage.write(PROFILE_PATH, profile.model_dump())
    return profile


@router.patch("", response_model=Profile)
def patch_profile(updates: dict, storage: LocalFileStorage = Depends(get_storage)):
    try:
        data = storage.read(PROFILE_PATH)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Profile not found")

    _deep_merge(data, updates)
    data = _migrate_profile(data)
    profile = Profile(**data)
    storage.write(PROFILE_PATH, profile.model_dump())
    return profile


def _deep_merge(base: dict, updates: dict) -> None:
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
