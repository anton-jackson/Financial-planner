"""Healthcare cost trajectory modeling."""

from engine.inflation import real_to_nominal


def compute_healthcare_costs(
    year: int,
    base_year: int,
    age_primary: int,
    retirement_year: int,
    healthcare: dict,
    healthcare_inflation_pct: float,
) -> tuple[float, list[str]]:
    """
    Compute annual healthcare costs based on life phase.

    Phases:
    1. Pre-retirement: employer-sponsored plan (premium + out-of-pocket)
    2. Early retirement pre-Medicare (retirement to age 65): ACA marketplace
    3. Post-65: Medicare + supplemental

    Args:
        year: projection year
        base_year: year costs are expressed in
        age_primary: primary earner's age in this year
        retirement_year: target retirement year
        healthcare: healthcare assumptions from scenario
        healthcare_inflation_pct: annual healthcare inflation rate

    Returns:
        (annual_cost, events)
    """
    events: list[str] = []

    if year < retirement_year:
        # Employer-sponsored: premium + out-of-pocket
        premium = real_to_nominal(
            healthcare["annual_premium_today"], year, base_year, healthcare_inflation_pct
        )
        oop = real_to_nominal(
            healthcare["annual_out_of_pocket_today"], year, base_year, healthcare_inflation_pct
        )
        cost = premium + oop
        events.append(f"Employer healthcare: ${cost:,.0f}")

    elif age_primary < 65:
        # ACA marketplace during pre-Medicare gap
        cost = real_to_nominal(
            healthcare["aca_marketplace_annual"], year, base_year, healthcare_inflation_pct
        )
        events.append(f"ACA marketplace: ${cost:,.0f}")

    else:
        # Medicare + supplemental
        cost = real_to_nominal(
            healthcare.get("medicare_annual", 8000), year, base_year, healthcare_inflation_pct
        )
        events.append(f"Medicare + supplemental: ${cost:,.0f}")

    return cost, events
