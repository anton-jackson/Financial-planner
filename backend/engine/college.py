"""College cost modeling with 529 drawdown and tuition inflation."""

from engine.inflation import real_to_nominal


def compute_college_costs(
    year: int,
    base_year: int,
    children: list[dict],
    college_assumptions: dict,
    tuition_inflation_pct: float,
    general_inflation_pct: float,
    investment_return_pct: float = 6.0,
) -> tuple[float, float, list[str]]:
    """
    Compute total college-related costs for a given year.

    Handles:
    - Private high school tuition (before college)
    - College tuition + room & board (inflation-adjusted)
    - 529 plan drawdown during college years
    - 529 growth in non-drawdown years

    Args:
        year: current projection year
        base_year: the year costs are expressed in (today)
        children: list of child dicts from profile
        college_assumptions: from scenario
        tuition_inflation_pct: annual college tuition inflation rate
        general_inflation_pct: general inflation for non-tuition costs
        investment_return_pct: 529 plan growth rate

    Returns:
        (total_cost, total_529_drawdown, events)
    """
    total_cost = 0.0
    total_529_drawdown = 0.0
    events: list[str] = []

    for child in children:
        name = child["name"]
        college_start = child["college_start_year"]
        college_end = college_start + child.get("college_years", 4)

        # Pre-college school stages (middle school, high school, etc.)
        stages = child.get("school_stages", [])
        if stages:
            for stage in stages:
                start = stage.get("start_year", 0)
                end = stage.get("end_year", 0)
                tuition = stage.get("annual_tuition", 0)
                if tuition > 0 and start <= year <= end:
                    cost = real_to_nominal(tuition, year, base_year, general_inflation_pct)
                    total_cost += cost
                    stage_name = stage.get("name", "school")
                    events.append(f"{name} {stage_name}: ${cost:,.0f}")
        else:
            # Legacy: single current_school field
            school = child.get("current_school")
            if school and school.get("annual_tuition", 0) > 0:
                if year < school.get("ends_year", college_start):
                    hs_cost = real_to_nominal(
                        school["annual_tuition"], year, base_year, general_inflation_pct
                    )
                    total_cost += hs_cost
                    events.append(f"{name} private school: ${hs_cost:,.0f}")

        # College years
        if college_start <= year < college_end:
            annual_tuition = real_to_nominal(
                college_assumptions["annual_cost_today"], year, base_year, tuition_inflation_pct
            )
            room_board = real_to_nominal(
                college_assumptions["room_and_board_today"], year, base_year, general_inflation_pct
            )
            aid = college_assumptions.get("financial_aid_annual", 0)
            scholarship = college_assumptions.get("scholarship_annual", 0)

            gross_cost = annual_tuition + room_board - aid - scholarship

            # 529 drawdown - use available balance
            balance_529 = child.get("_529_balance", child.get("plan_529_balance", 0))
            drawdown = min(balance_529, gross_cost)
            remaining_after_529 = gross_cost - drawdown

            # Parent contribution cap (in today's dollars, inflation-adjusted)
            parent_annual = child.get("parent_college_annual", 0)
            if parent_annual > 0:
                parent_cap = real_to_nominal(
                    parent_annual, year, base_year, general_inflation_pct
                )
                # Parent pays up to their cap (beyond what 529 covers)
                parent_pays = min(remaining_after_529, max(0, parent_cap - drawdown))
                kid_covers = remaining_after_529 - parent_pays
            else:
                # Legacy: parent pays everything after 529
                parent_pays = remaining_after_529
                kid_covers = 0

            total_cost += parent_pays
            total_529_drawdown += drawdown

            college_year_num = year - college_start + 1
            detail = f"${gross_cost:,.0f} (529: ${drawdown:,.0f}, parent: ${parent_pays:,.0f}"
            if kid_covers > 0:
                detail += f", kid: ${kid_covers:,.0f}"
            detail += ")"
            events.append(f"{name} college year {college_year_num}: {detail}")

    return total_cost, total_529_drawdown, events


def grow_529_balances(
    children: list[dict],
    year: int,
    investment_return_pct: float = 6.0,
) -> None:
    """
    Grow 529 balances in-place for one year. Add monthly contributions and returns.
    During college years, balance was already drawn down by compute_college_costs.
    """
    for child in children:
        balance_key = "_529_balance"
        if balance_key not in child:
            child[balance_key] = child.get("plan_529_balance", 0)

        college_start = child["college_start_year"]
        college_end = college_start + child.get("college_years", 4)

        # Only contribute pre-college
        if year < college_start:
            monthly_contrib = child.get("plan_529_monthly_contribution", 0)
            child[balance_key] += monthly_contrib * 12

        # Growth on remaining balance (even during college on remaining funds)
        child[balance_key] *= 1 + investment_return_pct / 100
