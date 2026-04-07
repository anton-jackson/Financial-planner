"""
Monte Carlo simulation engine.

Wraps the deterministic cashflow projector with randomized inputs
per trial. Pre-generates all random draws as numpy arrays for speed.
"""

import copy

import numpy as np

from engine.cashflow import project_cashflows


def run_monte_carlo(
    profile: dict,
    scenario: dict,
    assets: dict,
    num_trials: int = 5000,
    start_year: int | None = None,
    end_year: int | None = None,
    seed: int | None = None,
) -> dict:
    """
    Run Monte Carlo simulation by sampling investment returns and inflation.

    Returns dict with percentile bands, success rate, and longevity metrics.
    """
    assumptions = scenario["assumptions"]
    personal = profile["personal"]
    birth_year = personal["birth_year"]

    if "retirement_age" in personal:
        retirement_year = birth_year + personal["retirement_age"]
    else:
        retirement_year = personal["retirement_target_year"]

    base_year = start_year or 2026
    if not end_year:
        life_expectancy = personal.get("life_expectancy_age", 90)
        end_year = birth_year + life_expectancy
    if not start_year:
        start_year = base_year

    num_years = end_year - start_year + 1
    years = list(range(start_year, end_year + 1))

    # Pre-generate random draws
    rng = np.random.default_rng(seed)

    returns = assumptions["investment_returns"]
    inflation = assumptions["inflation"]

    # Shape: (num_trials, num_years)
    stock_draws = rng.normal(
        returns["stocks_mean_pct"], returns["stocks_stddev_pct"],
        (num_trials, num_years),
    )
    bond_draws = rng.normal(
        returns["bonds_mean_pct"], returns["bonds_stddev_pct"],
        (num_trials, num_years),
    )
    inflation_draws = rng.normal(
        inflation["general_mean_pct"], inflation["general_stddev_pct"],
        (num_trials, num_years),
    )

    # Bonus variability (scale factor around 1.0)
    bonus_var = profile["income"]["primary"].get("bonus_variability_pct", 5) / 100
    bonus_draws = rng.normal(1.0, bonus_var, (num_trials, num_years))

    # RSU volatility (lognormal multiplier)
    rsu_vol = profile["income"].get("rsu", {}).get("volatility_pct", 25) / 100
    rsu_draws = rng.lognormal(
        -0.5 * rsu_vol**2, rsu_vol, (num_trials, num_years)
    )

    # Collect results: net_worth and liquid_net_worth per trial per year
    all_net_worth = np.zeros((num_trials, num_years))
    all_liquid = np.zeros((num_trials, num_years))
    ruin_years = np.full(num_trials, num_years + 99)  # sentinel = never ruined

    for trial in range(num_trials):
        # Build trial-specific scenario with sampled values per year
        trial_scenario = _build_trial_scenario(
            scenario, trial, num_years,
            stock_draws, bond_draws, inflation_draws,
        )
        trial_profile = _build_trial_profile(
            profile, trial, num_years, bonus_draws, rsu_draws,
        )

        yearly = project_cashflows(
            profile=trial_profile,
            scenario=trial_scenario,
            assets=copy.deepcopy(assets),
            start_year=start_year,
            end_year=end_year,
        )

        for y_idx, row in enumerate(yearly):
            all_net_worth[trial, y_idx] = row["net_worth"]
            all_liquid[trial, y_idx] = row["liquid_net_worth"]

            # Track ruin: first year liquid portfolio hits 0 post-retirement
            if (row["year"] >= retirement_year
                    and row["liquid_net_worth"] <= 0
                    and ruin_years[trial] > num_years):
                ruin_years[trial] = y_idx

    # Compute percentile bands
    pcts = [10, 25, 50, 75, 90]

    net_worth_bands = {
        f"p{p}": np.percentile(all_net_worth, p, axis=0).round(2).tolist()
        for p in pcts
    }
    liquid_bands = {
        f"p{p}": np.percentile(all_liquid, p, axis=0).round(2).tolist()
        for p in pcts
    }

    # Success rate: % of trials where liquid > 0 at end of horizon
    success_rate = round(float(np.mean(all_liquid[:, -1] > 0)) * 100, 1)
    probability_of_ruin = round(100.0 - success_rate, 1)

    # Years of runway: how many post-retirement years money lasts
    retirement_idx = max(0, retirement_year - start_year)
    post_retirement_years = num_years - retirement_idx

    # For each trial, count years post-retirement with liquid > 0
    runway_per_trial = np.zeros(num_trials)
    for trial in range(num_trials):
        for y_idx in range(retirement_idx, num_years):
            if all_liquid[trial, y_idx] > 0:
                runway_per_trial[trial] += 1
            else:
                break

    runway_bands = {
        f"p{p}": [float(np.percentile(runway_per_trial, p))]
        for p in pcts
    }

    # Spending capacity: in retirement, how much can be withdrawn sustainably
    # Approximate as 4% of liquid portfolio (standard rule of thumb)
    spending_capacity = all_liquid * 0.04
    spending_bands = {
        f"p{p}": np.percentile(spending_capacity, p, axis=0).round(2).tolist()
        for p in pcts
    }

    median_terminal = round(float(np.median(all_net_worth[:, -1])), 2)

    return {
        "num_trials": num_trials,
        "start_year": start_year,
        "end_year": end_year,
        "years": years,
        "net_worth": net_worth_bands,
        "liquid_net_worth": liquid_bands,
        "annual_spending_capacity": spending_bands,
        "success_rate": success_rate,
        "probability_of_ruin": probability_of_ruin,
        "years_of_runway": runway_bands,
        "median_terminal_net_worth": median_terminal,
    }


def _build_trial_scenario(
    base_scenario: dict,
    trial: int,
    num_years: int,
    stock_draws: np.ndarray,
    bond_draws: np.ndarray,
    inflation_draws: np.ndarray,
) -> dict:
    """
    Build a scenario for one trial.

    We inject the trial's sampled mean returns/inflation so the deterministic
    engine uses them. Since the engine runs year-by-year and uses a single
    mean value, we override per-year by using a wrapper approach:
    we set the mean to the trial's average draw (simple approach that
    preserves the engine's structure while introducing variance across trials).

    A more precise approach would modify the engine to accept per-year arrays,
    but trial-level sampling already captures the key variance for planning.
    """
    scenario = copy.deepcopy(base_scenario)
    assumptions = scenario["assumptions"]

    # Use trial-average returns (each trial gets a different "realized" market)
    assumptions["investment_returns"]["stocks_mean_pct"] = float(
        np.mean(stock_draws[trial])
    )
    assumptions["investment_returns"]["bonds_mean_pct"] = float(
        np.mean(bond_draws[trial])
    )
    assumptions["inflation"]["general_mean_pct"] = float(
        np.mean(inflation_draws[trial])
    )

    return scenario


def _build_trial_profile(
    base_profile: dict,
    trial: int,
    num_years: int,
    bonus_draws: np.ndarray,
    rsu_draws: np.ndarray,
) -> dict:
    """
    Build a profile for one trial with sampled bonus and RSU multipliers.

    Scale bonus_pct by the trial's average bonus draw.
    Scale RSU growth by the trial's average RSU draw.
    """
    profile = copy.deepcopy(base_profile)

    avg_bonus_scale = float(np.mean(bonus_draws[trial]))
    profile["income"]["primary"]["bonus_pct"] *= avg_bonus_scale

    rsu = profile["income"].get("rsu", {})
    if rsu.get("shares", 0) > 0:
        avg_rsu_scale = float(np.mean(rsu_draws[trial]))
        rsu["annual_growth_rate_pct"] *= avg_rsu_scale

    return profile
