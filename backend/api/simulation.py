import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dependencies import get_storage
from engine.cashflow import project_cashflows
from engine.monte_carlo import run_monte_carlo
from models.simulation import (
    SimulationRequest, CompareRequest,
    DeterministicResult, MonteCarloResult,
)
from storage.local import LocalFileStorage

router = APIRouter()


def _load_inputs(storage: LocalFileStorage, scenario_name: str) -> tuple[dict, dict, dict]:
    """Load profile, scenario, and assets from storage."""
    try:
        profile = storage.read("profile.yaml")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Profile not found")

    scenario_path = f"scenarios/{scenario_name}.yaml"
    if not storage.exists(scenario_path):
        raise HTTPException(status_code=404, detail=f"Scenario '{scenario_name}' not found")
    scenario = storage.read(scenario_path)

    try:
        assets = storage.read("assets.yaml")
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Assets not found")

    return profile, scenario, assets


class BaselineOverrides(BaseModel):
    """Temporary what-if overrides for baseline simulation (not persisted)."""
    retirement_age: int | None = None
    spouse_retirement_age: int | None = None
    annual_base_expenses: float | None = None
    contribution_rate_pct: float | None = None
    additional_monthly_savings: float | None = None
    spouse_base_salary: float | None = None


def _apply_overrides(profile: dict, overrides: BaselineOverrides) -> dict:
    """Apply what-if overrides to a copy of the profile dict."""
    import copy
    p = copy.deepcopy(profile)
    if overrides.retirement_age is not None:
        p["personal"]["retirement_age"] = overrides.retirement_age
        p["personal"]["retirement_target_year"] = p["personal"]["birth_year"] + overrides.retirement_age
    if overrides.spouse_retirement_age is not None and p.get("spouse"):
        p["spouse"]["retirement_age"] = overrides.spouse_retirement_age
        p["spouse"]["retirement_target_year"] = p["spouse"]["birth_year"] + overrides.spouse_retirement_age
    if overrides.annual_base_expenses is not None:
        p.setdefault("expenses", {})["annual_base"] = overrides.annual_base_expenses
    if overrides.contribution_rate_pct is not None:
        p.setdefault("savings", {}).setdefault("primary", {})["contribution_rate_pct"] = overrides.contribution_rate_pct
    if overrides.additional_monthly_savings is not None:
        p.setdefault("savings", {}).setdefault("primary", {})["additional_monthly_savings"] = overrides.additional_monthly_savings
    if overrides.spouse_base_salary is not None and p.get("income", {}).get("spouse"):
        p["income"]["spouse"]["base_salary"] = overrides.spouse_base_salary
    return p


@router.post("/baseline", response_model=DeterministicResult)
def run_baseline(
    overrides: BaselineOverrides | None = None,
    storage: LocalFileStorage = Depends(get_storage),
):
    """Run a baseline simulation using current profile + assets + base scenario
    assumptions, but with NO large purchases or scenario events.
    Accepts optional what-if overrides that are NOT persisted."""
    profile, scenario, assets = _load_inputs(storage, "base")

    if overrides:
        profile = _apply_overrides(profile, overrides)

    # Strip scenario events — baseline is current situation only
    if "assumptions" in scenario:
        scenario["assumptions"]["large_purchases"] = []
        scenario["assumptions"]["life_events"] = []

    yearly = project_cashflows(
        profile=profile,
        scenario=scenario,
        assets=assets,
    )

    run_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now(timezone.utc).isoformat()

    return DeterministicResult(
        run_id=run_id,
        timestamp=timestamp,
        scenario_name="baseline",
        start_year=yearly[0]["year"],
        end_year=yearly[-1]["year"],
        yearly=yearly,
    )


@router.post("/baseline/monte-carlo", response_model=MonteCarloResult)
def run_baseline_monte_carlo(
    num_trials: int = 2000,
    overrides: BaselineOverrides | None = None,
    storage: LocalFileStorage = Depends(get_storage),
):
    """Monte Carlo on baseline (no scenario events). Accepts optional what-if overrides."""
    profile, scenario, assets = _load_inputs(storage, "base")

    if overrides:
        profile = _apply_overrides(profile, overrides)

    if "assumptions" in scenario:
        scenario["assumptions"]["large_purchases"] = []
        scenario["assumptions"]["life_events"] = []

    mc_result = run_monte_carlo(
        profile=profile,
        scenario=scenario,
        assets=assets,
        num_trials=num_trials,
    )

    run_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now(timezone.utc).isoformat()

    return MonteCarloResult(
        run_id=run_id,
        timestamp=timestamp,
        scenario_name="baseline",
        num_trials=mc_result["num_trials"],
        start_year=mc_result["start_year"],
        end_year=mc_result["end_year"],
        years=mc_result["years"],
        net_worth=mc_result["net_worth"],
        liquid_net_worth=mc_result["liquid_net_worth"],
        annual_spending_capacity=mc_result["annual_spending_capacity"],
        success_rate=mc_result["success_rate"],
        probability_of_ruin=mc_result["probability_of_ruin"],
        years_of_runway=mc_result["years_of_runway"],
        median_terminal_net_worth=mc_result["median_terminal_net_worth"],
    )


@router.post("/deterministic", response_model=DeterministicResult)
def run_deterministic(
    request: SimulationRequest,
    storage: LocalFileStorage = Depends(get_storage),
):
    profile, scenario, assets = _load_inputs(storage, request.scenario_name)

    yearly = project_cashflows(
        profile=profile,
        scenario=scenario,
        assets=assets,
        start_year=request.start_year,
        end_year=request.end_year,
    )

    run_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now(timezone.utc).isoformat()

    result = DeterministicResult(
        run_id=run_id,
        timestamp=timestamp,
        scenario_name=request.scenario_name,
        start_year=yearly[0]["year"],
        end_year=yearly[-1]["year"],
        yearly=yearly,
    )

    # Persist result
    result_path = f"results/sim_{run_id}_{request.scenario_name}.json"
    storage.write(result_path, result.model_dump())

    return result


@router.post("/monte-carlo", response_model=MonteCarloResult)
def run_monte_carlo_endpoint(
    request: SimulationRequest,
    storage: LocalFileStorage = Depends(get_storage),
):
    profile, scenario, assets = _load_inputs(storage, request.scenario_name)

    mc_result = run_monte_carlo(
        profile=profile,
        scenario=scenario,
        assets=assets,
        num_trials=request.num_trials,
        start_year=request.start_year,
        end_year=request.end_year,
    )

    run_id = str(uuid.uuid4())[:8]
    timestamp = datetime.now(timezone.utc).isoformat()

    result = MonteCarloResult(
        run_id=run_id,
        timestamp=timestamp,
        scenario_name=request.scenario_name,
        num_trials=mc_result["num_trials"],
        start_year=mc_result["start_year"],
        end_year=mc_result["end_year"],
        years=mc_result["years"],
        net_worth=mc_result["net_worth"],
        liquid_net_worth=mc_result["liquid_net_worth"],
        annual_spending_capacity=mc_result["annual_spending_capacity"],
        success_rate=mc_result["success_rate"],
        probability_of_ruin=mc_result["probability_of_ruin"],
        years_of_runway=mc_result["years_of_runway"],
        median_terminal_net_worth=mc_result["median_terminal_net_worth"],
    )

    # Persist result
    result_path = f"results/mc_{run_id}_{request.scenario_name}.json"
    storage.write(result_path, result.model_dump())

    return result


class SweepRequest(BaseModel):
    """2D parameter sweep for the planning matrix."""
    row_variable: str  # e.g. "retirement_age"
    row_values: list[float]  # e.g. [58, 59, 60, 61, 62, 63, 64, 65]
    col_variable: str  # e.g. "annual_base_expenses"
    col_values: list[float]  # e.g. [120000, 140000, 160000, 180000]
    num_mc_trials: int = 500  # lighter MC for sweep speed
    # Fixed overrides applied to all cells
    fixed_overrides: BaselineOverrides | None = None


class SweepCell(BaseModel):
    row_value: float
    col_value: float
    nw_at_retirement: float
    liquid_at_retirement: float
    mc_success_rate: float
    median_terminal_nw: float
    annual_withdrawal_budget: float  # p25 spending capacity at retirement


class SweepResult(BaseModel):
    row_variable: str
    row_values: list[float]
    col_variable: str
    col_values: list[float]
    cells: list[SweepCell]


@router.post("/sweep", response_model=SweepResult)
def run_sweep(
    request: SweepRequest,
    storage: LocalFileStorage = Depends(get_storage),
):
    """Run a 2D parameter sweep for the planning matrix."""
    import copy

    profile, scenario, assets = _load_inputs(storage, "base")
    if "assumptions" in scenario:
        scenario["assumptions"]["large_purchases"] = []
        scenario["assumptions"]["life_events"] = []

    cells = []
    for row_val in request.row_values:
        for col_val in request.col_values:
            # Build overrides for this cell
            overrides = request.fixed_overrides or BaselineOverrides()
            overrides_dict = overrides.model_dump(exclude_none=True)
            overrides_dict[request.row_variable] = row_val
            overrides_dict[request.col_variable] = col_val
            cell_overrides = BaselineOverrides(**overrides_dict)

            p = _apply_overrides(profile, cell_overrides)

            # Deterministic run for NW at retirement
            yearly = project_cashflows(p, copy.deepcopy(scenario), assets)
            ret_age = p["personal"]["retirement_age"]
            ret_year = p["personal"]["birth_year"] + ret_age
            ret_row = next((r for r in yearly if r["year"] == ret_year), yearly[-1])

            # Quick MC
            mc = run_monte_carlo(
                p, copy.deepcopy(scenario), assets,
                num_trials=request.num_mc_trials,
            )

            # Find spending capacity at retirement year index
            ret_idx = ret_year - mc["start_year"]
            ret_idx = max(0, min(ret_idx, len(mc["years"]) - 1))
            withdrawal_budget = mc["annual_spending_capacity"]["p25"][ret_idx]

            cells.append(SweepCell(
                row_value=row_val,
                col_value=col_val,
                nw_at_retirement=ret_row["net_worth"],
                liquid_at_retirement=ret_row["liquid_net_worth"],
                mc_success_rate=mc["success_rate"],
                median_terminal_nw=mc["median_terminal_net_worth"],
                annual_withdrawal_budget=withdrawal_budget,
            ))

    return SweepResult(
        row_variable=request.row_variable,
        row_values=request.row_values,
        col_variable=request.col_variable,
        col_values=request.col_values,
        cells=cells,
    )


@router.post("/compare")
def run_compare(
    request: CompareRequest,
    storage: LocalFileStorage = Depends(get_storage),
):
    results = []
    for name in request.scenarios:
        profile, scenario, assets = _load_inputs(storage, name)
        yearly = project_cashflows(
            profile=profile,
            scenario=scenario,
            assets=assets,
        )
        run_id = str(uuid.uuid4())[:8]
        results.append(DeterministicResult(
            run_id=run_id,
            timestamp=datetime.now(timezone.utc).isoformat(),
            scenario_name=name,
            start_year=yearly[0]["year"],
            end_year=yearly[-1]["year"],
            yearly=yearly,
        ))
    return results
