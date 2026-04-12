"""Seed prebuilt read-only scenarios into the data directory on startup.

These are written on every boot so that:
  - Fresh deployments get the defaults.
  - GCS volume mounts that shadow the Docker image's data/ still get them.
  - Updated prebuilt assumptions propagate on redeploy.

User-created (non-readonly) scenarios are never overwritten.
"""

from pathlib import Path

import yaml

from config import DATA_DIR

SCENARIOS_DIR = DATA_DIR / "scenarios"

PREBUILT_SCENARIOS = {
    "base": {
        "schema_version": 1,
        "name": "Base Case",
        "description": "Moderate assumptions — historical average returns and typical inflation",
        "readonly": True,
        "assumptions": {
            "investment_returns": {
                "stocks_mean_pct": 8.0,
                "stocks_stddev_pct": 16.0,
                "bonds_mean_pct": 4.0,
                "bonds_stddev_pct": 6.0,
                "real_estate_appreciation_pct": 3.5,
            },
            "inflation": {
                "general_mean_pct": 3.0,
                "general_stddev_pct": 1.0,
                "college_tuition_pct": 5.0,
                "healthcare_pct": 6.0,
            },
            "asset_allocation": {
                "pre_retirement": {"stocks_pct": 70.0, "bonds_pct": 25.0, "cash_pct": 5.0},
                "post_retirement": {"stocks_pct": 50.0, "bonds_pct": 40.0, "cash_pct": 10.0},
                "glide_path_start_years_before": 5,
            },
            "college": {
                "annual_cost_today": 65000.0,
                "room_and_board_today": 18000.0,
                "financial_aid_annual": 0.0,
                "scholarship_annual": 0.0,
            },
            "social_security": {
                "primary_pia_at_67": 3200.0,
                "spouse_pia_at_67": 1800.0,
                "claiming_age_primary": 67,
                "claiming_age_spouse": 67,
                "cola_pct": 2.0,
            },
            "healthcare": {
                "annual_premium_today": 24000.0,
                "annual_out_of_pocket_today": 6000.0,
                "pre_medicare_gap_years": 2,
                "aca_marketplace_annual": 30000.0,
                "medicare_annual": 8000.0,
            },
            "large_purchases": [],
            "life_events": [],
            "return_profiles": {},
        },
    },
    "bull": {
        "schema_version": 1,
        "name": "Bull Case",
        "description": "Optimistic — strong market returns, lower inflation",
        "readonly": True,
        "assumptions": {
            "investment_returns": {
                "stocks_mean_pct": 11.0,
                "stocks_stddev_pct": 14.0,
                "bonds_mean_pct": 5.0,
                "bonds_stddev_pct": 5.0,
                "real_estate_appreciation_pct": 5.0,
            },
            "inflation": {
                "general_mean_pct": 2.0,
                "general_stddev_pct": 0.8,
                "college_tuition_pct": 4.0,
                "healthcare_pct": 5.0,
            },
            "asset_allocation": {
                "pre_retirement": {"stocks_pct": 80.0, "bonds_pct": 15.0, "cash_pct": 5.0},
                "post_retirement": {"stocks_pct": 60.0, "bonds_pct": 30.0, "cash_pct": 10.0},
                "glide_path_start_years_before": 5,
            },
            "college": {
                "annual_cost_today": 60000.0,
                "room_and_board_today": 16000.0,
                "financial_aid_annual": 5000.0,
                "scholarship_annual": 5000.0,
            },
            "social_security": {
                "primary_pia_at_67": 3500.0,
                "spouse_pia_at_67": 2000.0,
                "claiming_age_primary": 67,
                "claiming_age_spouse": 67,
                "cola_pct": 2.5,
            },
            "healthcare": {
                "annual_premium_today": 22000.0,
                "annual_out_of_pocket_today": 5000.0,
                "pre_medicare_gap_years": 2,
                "aca_marketplace_annual": 28000.0,
                "medicare_annual": 7500.0,
            },
            "large_purchases": [],
            "life_events": [],
            "return_profiles": {},
        },
    },
    "bear": {
        "schema_version": 1,
        "name": "Bear Case",
        "description": "Pessimistic — low returns, high inflation, higher costs",
        "readonly": True,
        "assumptions": {
            "investment_returns": {
                "stocks_mean_pct": 5.0,
                "stocks_stddev_pct": 20.0,
                "bonds_mean_pct": 2.5,
                "bonds_stddev_pct": 7.0,
                "real_estate_appreciation_pct": 1.5,
            },
            "inflation": {
                "general_mean_pct": 4.5,
                "general_stddev_pct": 1.5,
                "college_tuition_pct": 7.0,
                "healthcare_pct": 8.0,
            },
            "asset_allocation": {
                "pre_retirement": {"stocks_pct": 60.0, "bonds_pct": 30.0, "cash_pct": 10.0},
                "post_retirement": {"stocks_pct": 40.0, "bonds_pct": 45.0, "cash_pct": 15.0},
                "glide_path_start_years_before": 7,
            },
            "college": {
                "annual_cost_today": 75000.0,
                "room_and_board_today": 22000.0,
                "financial_aid_annual": 0.0,
                "scholarship_annual": 0.0,
            },
            "social_security": {
                "primary_pia_at_67": 2800.0,
                "spouse_pia_at_67": 1500.0,
                "claiming_age_primary": 70,
                "claiming_age_spouse": 67,
                "cola_pct": 1.5,
            },
            "healthcare": {
                "annual_premium_today": 28000.0,
                "annual_out_of_pocket_today": 8000.0,
                "pre_medicare_gap_years": 3,
                "aca_marketplace_annual": 36000.0,
                "medicare_annual": 10000.0,
            },
            "large_purchases": [],
            "life_events": [],
            "return_profiles": {},
        },
    },
}


def seed_prebuilt_scenarios() -> None:
    """Write prebuilt scenarios to disk. Always overwrites to pick up updates."""
    SCENARIOS_DIR.mkdir(parents=True, exist_ok=True)
    for slug, data in PREBUILT_SCENARIOS.items():
        path = SCENARIOS_DIR / f"{slug}.yaml"
        path.write_text(yaml.dump(data, default_flow_style=False, sort_keys=False))
