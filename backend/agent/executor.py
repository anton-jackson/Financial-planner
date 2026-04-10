"""Executes tool calls by dispatching to existing engine functions."""

import copy

from engine.cashflow import project_cashflows
from engine.monte_carlo import run_monte_carlo
from storage.local import LocalFileStorage
from agent.sandbox import AgentSandbox


def execute_tool(
    name: str,
    tool_input: dict,
    storage: LocalFileStorage,
) -> dict:
    """Execute a named tool and return the result as a dict.

    Tools that need write access should use AgentSandbox(storage),
    which confines writes to data/agent_sandbox/.
    """

    if name == "get_profile_summary":
        return _get_profile_summary(storage)

    if name == "get_assets_summary":
        return _get_assets_summary(storage)

    if name == "list_scenarios":
        return _list_scenarios(storage)

    if name == "run_deterministic_projection":
        return _run_deterministic(storage, tool_input)

    if name == "run_monte_carlo":
        return _run_monte_carlo(storage, tool_input)

    if name == "what_if":
        return _what_if(storage, tool_input)

    if name == "compare_scenarios":
        return _compare_scenarios(storage, tool_input)

    if name == "get_yearly_detail":
        return _get_yearly_detail(storage, tool_input)

    return {"error": f"Unknown tool: {name}"}


def _load_inputs(storage: LocalFileStorage, scenario_name: str) -> tuple[dict, dict, dict]:
    profile = storage.read("profile.yaml")
    scenario = storage.read(f"scenarios/{scenario_name}.yaml")
    assets = storage.read("assets.yaml")
    return profile, scenario, assets


def _get_profile_summary(storage: LocalFileStorage) -> dict:
    profile = storage.read("profile.yaml")
    p = profile.get("personal", {})
    income = profile.get("income", {})
    savings = profile.get("savings", {})
    expenses = profile.get("expenses", {})
    tax = profile.get("tax", {})
    children = profile.get("children", [])

    primary = income.get("primary", {})
    spouse_info = profile.get("spouse")
    spouse_income = income.get("spouse")
    rsu = income.get("rsu", {})

    summary = {
        "name": p.get("name", "Unknown"),
        "birth_year": p.get("birth_year"),
        "retirement_age": p.get("retirement_age", 65),
        "life_expectancy_age": p.get("life_expectancy_age", 90),
        "state": p.get("state_of_residence", ""),
        "base_salary": primary.get("base_salary", 0),
        "annual_raise_pct": primary.get("annual_raise_pct", 3.0),
        "bonus_pct": primary.get("bonus_pct", 0),
        "rsu_current_value": rsu.get("current_value", 0),
        "annual_base_expenses": expenses.get("annual_base", 0),
        "retirement_expense_reduction_pct": expenses.get("retirement_reduction_pct", 20),
        "filing_status": tax.get("filing_status", "mfj"),
        "num_children": len(children),
        "children": [
            {
                "name": c.get("name"),
                "birth_year": c.get("birth_year"),
                "college_start_year": c.get("college_start_year"),
                "plan_529_balance": c.get("plan_529_balance", 0),
            }
            for c in children
        ],
        "savings_401k_rate_pct": savings.get("primary", {}).get("contribution_rate_pct", 0),
        "additional_monthly_savings": savings.get("primary", {}).get(
            "additional_monthly_savings", 0
        ),
    }

    if spouse_info:
        summary["spouse"] = {
            "name": spouse_info.get("name"),
            "birth_year": spouse_info.get("birth_year"),
            "retirement_age": spouse_info.get("retirement_age", 65),
        }
    if spouse_income:
        summary["spouse_salary"] = spouse_income.get("base_salary", 0)

    return summary


def _get_assets_summary(storage: LocalFileStorage) -> dict:
    data = storage.read("assets.yaml")
    assets_list = data.get("assets", [])
    total = sum(a.get("balance", 0) for a in assets_list)
    return {
        "total_balance": total,
        "accounts": [
            {
                "name": a.get("name"),
                "type": a.get("type"),
                "balance": a.get("balance", 0),
            }
            for a in assets_list
        ],
    }


def _list_scenarios(storage: LocalFileStorage) -> dict:
    paths = storage.list("scenarios")
    scenarios = []
    for p in paths:
        try:
            data = storage.read(p)
            scenarios.append({
                "name": data.get("name", p),
                "description": data.get("description", ""),
            })
        except Exception:
            continue
    return {"scenarios": scenarios}


def _run_deterministic(storage: LocalFileStorage, tool_input: dict) -> dict:
    scenario_name = tool_input.get("scenario_name", "base")
    profile, scenario, assets = _load_inputs(storage, scenario_name)
    yearly = project_cashflows(profile=profile, scenario=scenario, assets=assets)

    # Return a condensed summary (full yearly data is too large for LLM context)
    summary_years = _condense_yearly(yearly, profile)
    return {
        "scenario": scenario_name,
        "start_year": yearly[0]["year"],
        "end_year": yearly[-1]["year"],
        "total_years": len(yearly),
        "key_years": summary_years,
    }


def _run_monte_carlo(storage: LocalFileStorage, tool_input: dict) -> dict:
    scenario_name = tool_input.get("scenario_name", "base")
    num_trials = min(tool_input.get("num_trials", 1000), 5000)
    profile, scenario, assets = _load_inputs(storage, scenario_name)

    result = run_monte_carlo(
        profile=profile, scenario=scenario, assets=assets, num_trials=num_trials,
    )
    # Return the key metrics (percentile bands at key years, not all years)
    return _condense_mc(result, profile)


def _what_if(storage: LocalFileStorage, tool_input: dict) -> dict:
    profile, scenario, assets = _load_inputs(storage, "base")

    # Strip scenario events for baseline what-if
    if "assumptions" in scenario:
        scenario["assumptions"]["large_purchases"] = []
        scenario["assumptions"]["life_events"] = []

    # Apply overrides
    modified = copy.deepcopy(profile)
    if "retirement_age" in tool_input:
        modified["personal"]["retirement_age"] = tool_input["retirement_age"]
        modified["personal"]["retirement_target_year"] = (
            modified["personal"]["birth_year"] + tool_input["retirement_age"]
        )
    if "spouse_retirement_age" in tool_input and modified.get("spouse"):
        modified["spouse"]["retirement_age"] = tool_input["spouse_retirement_age"]
        modified["spouse"]["retirement_target_year"] = (
            modified["spouse"]["birth_year"] + tool_input["spouse_retirement_age"]
        )
    if "annual_base_expenses" in tool_input:
        modified.setdefault("expenses", {})["annual_base"] = tool_input["annual_base_expenses"]
    if "contribution_rate_pct" in tool_input:
        modified.setdefault("savings", {}).setdefault("primary", {})[
            "contribution_rate_pct"
        ] = tool_input["contribution_rate_pct"]
    if "additional_monthly_savings" in tool_input:
        modified.setdefault("savings", {}).setdefault("primary", {})[
            "additional_monthly_savings"
        ] = tool_input["additional_monthly_savings"]
    if "spouse_base_salary" in tool_input and modified.get("income", {}).get("spouse"):
        modified["income"]["spouse"]["base_salary"] = tool_input["spouse_base_salary"]

    num_trials = min(tool_input.get("num_trials", 1000), 5000)

    # Run both current and modified to show the delta
    original_mc = run_monte_carlo(
        profile=profile, scenario=copy.deepcopy(scenario), assets=copy.deepcopy(assets),
        num_trials=num_trials,
    )
    modified_mc = run_monte_carlo(
        profile=modified, scenario=copy.deepcopy(scenario), assets=copy.deepcopy(assets),
        num_trials=num_trials,
    )

    overrides_applied = {
        k: v for k, v in tool_input.items()
        if k != "num_trials" and v is not None
    }

    return {
        "overrides_applied": overrides_applied,
        "current": _condense_mc(original_mc, profile),
        "modified": _condense_mc(modified_mc, modified),
        "delta": {
            "success_rate": round(modified_mc["success_rate"] - original_mc["success_rate"], 1),
            "median_terminal_net_worth": round(
                modified_mc["median_terminal_net_worth"]
                - original_mc["median_terminal_net_worth"],
                2,
            ),
        },
    }


def _compare_scenarios(storage: LocalFileStorage, tool_input: dict) -> dict:
    scenario_names = tool_input.get("scenarios", ["base"])
    results = []
    for name in scenario_names:
        try:
            profile, scenario, assets = _load_inputs(storage, name)
            yearly = project_cashflows(profile=profile, scenario=scenario, assets=assets)
            results.append({
                "scenario": name,
                "terminal_net_worth": yearly[-1]["net_worth"],
                "terminal_liquid_net_worth": yearly[-1]["liquid_net_worth"],
                "key_years": _condense_yearly(yearly, profile),
            })
        except FileNotFoundError:
            results.append({"scenario": name, "error": f"Scenario '{name}' not found"})
    return {"comparisons": results}


def _get_yearly_detail(storage: LocalFileStorage, tool_input: dict) -> dict:
    scenario_name = tool_input.get("scenario_name", "base")
    target_year = tool_input["year"]
    profile, scenario, assets = _load_inputs(storage, scenario_name)
    yearly = project_cashflows(profile=profile, scenario=scenario, assets=assets)

    for row in yearly:
        if row["year"] == target_year:
            return row
    return {"error": f"Year {target_year} is outside the projection range"}


def _condense_yearly(yearly: list[dict], profile: dict) -> list[dict]:
    """Pick key milestone years to keep context compact."""
    if not yearly:
        return []

    birth_year = profile.get("personal", {}).get("birth_year", 1990)
    ret_age = profile.get("personal", {}).get("retirement_age", 65)
    ret_year = birth_year + ret_age

    # Always include: first, last, retirement year, every 5 years, and notable events
    key_years = {yearly[0]["year"], yearly[-1]["year"]}
    if any(r["year"] == ret_year for r in yearly):
        key_years.add(ret_year)
        key_years.add(ret_year + 5)
        key_years.add(ret_year + 10)

    # Every 5 years
    for r in yearly:
        if r["year"] % 5 == 0:
            key_years.add(r["year"])
        if r.get("events"):
            key_years.add(r["year"])

    fields = [
        "year", "age_primary", "gross_income", "total_expenses",
        "income_tax", "effective_tax_rate_pct", "savings_contributions",
        "investment_returns", "net_worth", "liquid_net_worth",
        "traditional_balance", "roth_balance", "taxable_balance",
        "real_estate_equity", "events",
    ]

    return [
        {k: r.get(k) for k in fields}
        for r in yearly
        if r["year"] in key_years
    ]


def _condense_mc(mc_result: dict, profile: dict) -> dict:
    """Condense Monte Carlo results to key metrics."""
    birth_year = profile.get("personal", {}).get("birth_year", 1990)
    ret_age = profile.get("personal", {}).get("retirement_age", 65)
    ret_year = birth_year + ret_age
    start = mc_result["start_year"]
    years = mc_result["years"]

    ret_idx = ret_year - start if ret_year >= start else 0
    ret_idx = max(0, min(ret_idx, len(years) - 1))

    def at_idx(bands: dict, idx: int) -> dict:
        return {k: v[idx] if idx < len(v) else None for k, v in bands.items()}

    return {
        "success_rate": mc_result["success_rate"],
        "probability_of_ruin": mc_result["probability_of_ruin"],
        "median_terminal_net_worth": mc_result["median_terminal_net_worth"],
        "net_worth_at_retirement": at_idx(mc_result["net_worth"], ret_idx),
        "liquid_at_retirement": at_idx(mc_result["liquid_net_worth"], ret_idx),
        "net_worth_at_end": at_idx(mc_result["net_worth"], -1),
        "spending_capacity_at_retirement": at_idx(
            mc_result["annual_spending_capacity"], ret_idx
        ),
        "years_of_runway": mc_result["years_of_runway"],
        "retirement_year": ret_year,
        "num_trials": mc_result["num_trials"],
    }
