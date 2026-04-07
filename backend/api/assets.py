from fastapi import APIRouter, Depends, HTTPException

from dependencies import get_storage
from models.assets import AssetsFile
from storage.local import LocalFileStorage

router = APIRouter()
ASSETS_PATH = "assets.yaml"


@router.get("", response_model=AssetsFile)
def get_assets(storage: LocalFileStorage = Depends(get_storage)):
    try:
        data = storage.read(ASSETS_PATH)
        return AssetsFile(**data)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Assets file not found")


@router.put("", response_model=AssetsFile)
def put_assets(assets: AssetsFile, storage: LocalFileStorage = Depends(get_storage)):
    storage.write(ASSETS_PATH, assets.model_dump())
    return assets


@router.patch("", response_model=AssetsFile)
def patch_assets(updates: dict, storage: LocalFileStorage = Depends(get_storage)):
    try:
        data = storage.read(ASSETS_PATH)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Assets file not found")

    if "assets" in updates:
        data["assets"] = updates["assets"]
    assets = AssetsFile(**data)
    storage.write(ASSETS_PATH, assets.model_dump())
    return assets
