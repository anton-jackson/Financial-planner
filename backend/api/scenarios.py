from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dependencies import get_storage
from models.scenario import Scenario
from storage.local import LocalFileStorage

router = APIRouter()
SCENARIOS_DIR = "scenarios"


def _scenario_path(name: str) -> str:
    return f"{SCENARIOS_DIR}/{name}.yaml"


class ScenarioListItem(BaseModel):
    slug: str
    name: str


@router.get("", response_model=list[ScenarioListItem])
def list_scenarios(storage: LocalFileStorage = Depends(get_storage)):
    files = storage.list(SCENARIOS_DIR)
    items = []
    for f in files:
        slug = f.split("/")[-1].replace(".yaml", "")
        try:
            data = storage.read(f)
            name = data.get("name", slug)
        except Exception:
            name = slug
        items.append(ScenarioListItem(slug=slug, name=name))
    return items


@router.get("/{name}", response_model=Scenario)
def get_scenario(name: str, storage: LocalFileStorage = Depends(get_storage)):
    path = _scenario_path(name)
    if not storage.exists(path):
        raise HTTPException(status_code=404, detail=f"Scenario '{name}' not found")
    data = storage.read(path)
    return Scenario(**data)


@router.put("/{name}", response_model=Scenario)
def put_scenario(name: str, scenario: Scenario, storage: LocalFileStorage = Depends(get_storage)):
    scenario.name = scenario.name or name
    storage.write(_scenario_path(name), scenario.model_dump())
    return scenario


@router.delete("/{name}")
def delete_scenario(name: str, storage: LocalFileStorage = Depends(get_storage)):
    path = _scenario_path(name)
    if not storage.exists(path):
        raise HTTPException(status_code=404, detail=f"Scenario '{name}' not found")
    storage.delete(path)
    return {"deleted": name}


@router.post("/{name}/clone", response_model=Scenario)
def clone_scenario(
    name: str, new_name: str, storage: LocalFileStorage = Depends(get_storage)
):
    path = _scenario_path(name)
    if not storage.exists(path):
        raise HTTPException(status_code=404, detail=f"Scenario '{name}' not found")
    data = storage.read(path)
    data["name"] = new_name
    storage.write(_scenario_path(new_name), data)
    return Scenario(**data)
