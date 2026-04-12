from typing import Any

from pydantic import BaseModel


class Asset(BaseModel):
    name: str
    type: str  # free-form string, known types get special engine logic
    balance: float = 0
    return_profile: str = "stocks_bonds"
    owner: str = "primary"  # "primary", "spouse", or "joint"
    properties: dict[str, Any] = {}


class AssetsFile(BaseModel):
    schema_version: int = 1
    assets: list[Asset] = []
