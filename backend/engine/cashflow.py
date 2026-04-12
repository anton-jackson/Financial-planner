"""
Year-by-year cashflow orchestrator.

Composes all sub-models into a complete financial projection from
current year through end of horizon (extending past retirement).
"""

from __future__ import annotations

from engine.inflation import real_to_nominal
from engine.investment import compute_portfolio_return
from engine.mortgage import (
    amortize_year,
    annual_mortgage_payment,
    new_mortgage_from_purchase,
    rental_property_annual_pl,
)
from engine.college import compute_college_costs, grow_529_balances
from engine.social_security import compute_social_security
from engine.healthcare import compute_healthcare_costs
from engine.rmd import compute_rmd
from engine.tax import compute_year_taxes, standard_deduction, federal_income_tax


def project_cashflows(
    profile: dict,
    scenario: dict,
    assets: dict,
    start_year: int | None = None,
    end_year: int | None = None,
) -> list[dict]:
    """
    Run a deterministic year-by-year financial projection.

    Args:
        profile: profile data (personal, spouse, children, income, savings)
        scenario: scenario data with assumptions
        assets: assets data with account balances

    Returns:
        List of YearRow dicts, one per year
    """
    assumptions = scenario["assumptions"]
    personal = profile["personal"]
    income_cfg = profile["income"]
    savings_cfg = profile["savings"]

    base_year = start_year or 2026
    birth_year = personal["birth_year"]
    # Support both retirement_age (new) and retirement_target_year (legacy).
    # Scenario-level overrides take precedence when set.
    ret_override = assumptions.get("retirement_age_primary")
    if ret_override is not None:
        retirement_year = birth_year + ret_override
    elif "retirement_age" in personal:
        retirement_year = birth_year + personal["retirement_age"]
    else:
        retirement_year = personal["retirement_target_year"]

    # Spouse retirement year (independent of primary)
    spouse = profile.get("spouse")
    if spouse:
        spouse_ret_override = assumptions.get("retirement_age_spouse")
        if spouse_ret_override is not None:
            spouse_retirement_year = spouse["birth_year"] + spouse_ret_override
        elif "retirement_age" in spouse:
            spouse_retirement_year = spouse["birth_year"] + spouse["retirement_age"]
        else:
            spouse_retirement_year = spouse.get("retirement_target_year", retirement_year)
    else:
        spouse_retirement_year = retirement_year

    if not end_year:
        life_expectancy = personal.get("life_expectancy_age", 90)
        end_year = birth_year + life_expectancy

    if not start_year:
        start_year = base_year

    # Initialize mutable state (pass assumptions for scenario-level overrides)
    state = _init_state(assets, profile, assumptions)

    results = []
    for year in range(start_year, end_year + 1):
        row = _project_year(
            year=year,
            base_year=base_year,
            birth_year=birth_year,
            retirement_year=retirement_year,
            spouse_retirement_year=spouse_retirement_year,
            personal=personal,
            income_cfg=income_cfg,
            savings_cfg=savings_cfg,
            assumptions=assumptions,
            state=state,
            profile=profile,
            end_year=end_year,
        )
        results.append(row)

    return results


def _init_state(assets: dict, profile: dict, assumptions: dict | None = None) -> dict:
    """Initialize mutable simulation state from assets and profile.

    Pool architecture (see docs/engine-rework-spec.md):
      - traditional_primary / traditional_spouse: pre-tax, split by owner
        so RMDs can be computed per-person.
      - roth: tax-free, aggregate (no RMDs, no owner split needed).
      - taxable: after-tax brokerage / crypto, aggregate.
      - hsa: triple-tax-advantaged, drawn for healthcare.
    """
    traditional_primary = 0.0
    traditional_spouse = 0.0
    roth = 0.0
    taxable = 0.0
    taxable_cost_basis = 0.0  # track cost basis for LTCG on taxable withdrawals
    hsa = 0.0

    # Account types that are inherently pre-tax / tax-deferred and follow RMD rules.
    TRAD_TYPES = {"traditional_401k", "traditional_ira", "tax_deferred_retirement"}
    ROTH_TYPES = {"roth_401k", "roth_ira"}

    for a in assets.get("assets", []):
        atype = a["type"]
        bal = a.get("balance", 0) or 0
        owner = (a.get("owner") or "primary").lower()
        if atype in TRAD_TYPES:
            # IRS treats retirement accounts as per-person; "joint" is not legal
            # for these, but treat it as primary to be safe.
            if owner == "spouse":
                traditional_spouse += bal
            else:
                traditional_primary += bal
        elif atype in ROTH_TYPES:
            roth += bal
        elif atype == "hsa":
            hsa += bal
        elif atype in ("taxable_brokerage", "crypto"):
            taxable += bal
            taxable_cost_basis += bal  # initial balance = cost basis
        # 529 and real_estate handled separately

    liquid = traditional_primary + traditional_spouse + roth + taxable + hsa

    # Real estate
    properties = []
    for a in assets.get("assets", []):
        if a["type"] == "real_estate":
            props = a.get("properties", {})
            properties.append({
                "name": a["name"],
                "value": a["balance"],
                "mortgage_balance": props.get("mortgage_balance", 0),
                "mortgage_rate_pct": props.get("mortgage_rate_pct", 0),
                "monthly_payment": props.get("monthly_payment", 0),
                "is_rental": props.get("is_rental", False),
                "monthly_rent": props.get("monthly_rent", 0),
                "vacancy_rate_pct": props.get("vacancy_rate_pct", 8),
                "annual_maintenance_pct": props.get("annual_maintenance_pct", 1.0),
                "property_management_pct": props.get("property_management_pct", 10),
                "annual_carrying_cost": props.get("annual_carrying_cost", 0),
                "annual_property_tax": props.get("annual_property_tax", 0),
                "annual_insurance": props.get("annual_insurance", 0),
                "appreciation_rate_pct": props.get("appreciation_rate_pct"),  # None = use scenario default
            })

    # Apply scenario-level property overrides (appreciation, tax, etc.)
    if assumptions:
        for override in assumptions.get("property_overrides", []):
            for prop in properties:
                if prop["name"] == override["name"]:
                    for field in ("appreciation_rate_pct", "annual_property_tax",
                                  "annual_carrying_cost", "annual_insurance"):
                        val = override.get(field)
                        if val is not None:
                            prop[field] = val

    # Deep copy children for 529 tracking
    children = []
    for c in profile.get("children", []):
        child = dict(c)
        if isinstance(child.get("current_school"), dict):
            child["current_school"] = dict(child["current_school"])
        child["_529_balance"] = child.get("plan_529_balance", 0)
        children.append(child)

    # Apply scenario-level college parent payment overrides
    if assumptions:
        for override in assumptions.get("college_parent_overrides", []):
            for child in children:
                if child["name"] == override["child_name"]:
                    child["parent_college_annual"] = override["parent_college_annual"]

    # ── RSU state (simplified: aggregate held shares + one cost basis) ──
    # See docs/engine-rework-spec.md RSU section:
    #   On vest, `sell_to_cover_pct` of shares disappear (sold to cover tax
    #   withholding — those proceeds go to the IRS, not to the holder). The
    #   full gross vest value is ordinary income (taxed by the normal tax
    #   engine). The remaining shares accumulate at vest-day price.
    rsu = profile.get("income", {}).get("rsu", {})
    unvested = []
    for t in rsu.get("unvested_tranches", []):
        unvested.append({
            "shares": t.get("shares", 0),
            "vest_year": t.get("vest_year", 2026),
            "sale_year": t.get("sale_year"),
        })

    initial_rate = rsu.get("annual_growth_rate_pct", 7)
    long_term_rate = rsu.get("long_term_growth_rate_pct")
    transition_years = rsu.get("growth_transition_years", 5)

    rsu_state = {
        "price": rsu.get("current_price", 0) or rsu.get("vested_price", 0),
        "initial_growth_pct": initial_rate,
        "long_term_growth_pct": long_term_rate if long_term_rate is not None else initial_rate,
        "transition_years": transition_years,
        # Aggregate held position: all vested-but-unsold shares share one cost basis.
        "held_shares": rsu.get("vested_shares", 0) or 0,
        "held_cost_basis": rsu.get("vested_cost_basis", 0) or 0,
        # Optional: if seed shares have a scheduled sale year, track it.
        "held_sale_year": rsu.get("vested_sale_year"),
        "unvested_tranches": unvested,
        "annual_refresh_value": rsu.get("annual_refresh_value", 0),
        "refresh_end_year": rsu.get("refresh_end_year"),
        "refresh_sale_year": rsu.get("refresh_sale_year"),
        # % of gross vest withheld for tax (sell-to-cover). Default 37% (top
        # federal + medicare). Adjustable per user.
        "sell_to_cover_pct": rsu.get("sell_to_cover_pct", 37),
    }

    # Vehicle purchases (planned)
    vehicles = []
    for v in profile.get("vehicles", []):
        vehicles.append(dict(v))

    # Existing vehicles (depreciating assets, possibly with loans)
    existing_vehicles = []
    for v in profile.get("existing_vehicles", []):
        ev = dict(v)
        # Create auto loan if there's a balance
        if ev.get("loan_balance", 0) > 0 and ev.get("monthly_payment", 0) > 0:
            ev["_has_loan"] = True
        else:
            ev["_has_loan"] = False
        existing_vehicles.append(ev)

    # Debts (HELOCs, credit cards, student loans, etc.)
    debts = []
    for d in profile.get("debts", []):
        debts.append(dict(d))

    return {
        "liquid_portfolio": liquid,
        # Tracked balances (see docs/engine-rework-spec.md)
        "traditional_primary": traditional_primary,
        "traditional_spouse": traditional_spouse,
        "roth": roth,
        "taxable": taxable,
        "taxable_cost_basis": taxable_cost_basis,
        "hsa": hsa,
        # Snapshots of prior-year ending balances for RMD computation.
        # Initialized from opening balances so RMDs in the first year work.
        "prior_traditional_primary": traditional_primary,
        "prior_traditional_spouse": traditional_spouse,
        "rsu": rsu_state,
        "properties": properties,
        "children": children,
        "rentals": [],  # rental conversions added during projection
        "additional_mortgages": [],  # from large purchases
        "vehicles": vehicles,
        "auto_loans": [],  # auto loans from financed vehicle purchases
        "existing_vehicles": existing_vehicles,
        "debts": debts,
    }


def _project_year(
    year: int,
    base_year: int,
    birth_year: int,
    retirement_year: int,
    spouse_retirement_year: int,
    personal: dict,
    income_cfg: dict,
    savings_cfg: dict,
    assumptions: dict,
    state: dict,
    profile: dict,
    end_year: int = 2090,
) -> dict:
    """Project a single year's cashflow."""
    age = year - birth_year
    is_retired = year >= retirement_year
    events: list[str] = []
    inflation = assumptions["inflation"]
    gen_inflation = inflation["general_mean_pct"]

    # Tax configuration
    tax_cfg = profile.get("tax", {})
    filing_status = tax_cfg.get("filing_status", "mfj")
    state_of_residence = personal.get("state_of_residence", "")
    # If user set a manual state_income_tax_pct > 0, use it as override
    state_tax_override = tax_cfg.get("state_income_tax_pct", 0) or None
    if state_tax_override == 0:
        state_tax_override = None

    # --- Income ---
    gross_income = 0.0
    rsu_held_value = 0.0

    rsu_vest_income = 0.0  # ordinary income from vesting this year
    rsu_vest_tax_covered = 0.0  # portion of vest tax already paid via sell-to-cover
    rsu_cap_gains = 0.0  # capital gains from selling vested shares
    years_from_start = year - base_year

    if not is_retired:
        salary = income_cfg["primary"]["base_salary"] * (
            1 + income_cfg["primary"]["annual_raise_pct"] / 100
        ) ** years_from_start
        bonus = salary * income_cfg["primary"]["bonus_pct"] / 100
        gross_income += salary + bonus
    else:
        events.append("Retired")

    # Spouse income (independent retirement year)
    spouse_retired = year >= spouse_retirement_year
    if not spouse_retired:
        spouse_inc = income_cfg.get("spouse")
        if spouse_inc and spouse_inc.get("base_salary", 0) > 0:
            spouse_salary = spouse_inc["base_salary"] * (
                1 + spouse_inc.get("annual_raise_pct", 2.5) / 100
            ) ** years_from_start
            spouse_bonus_pct = spouse_inc.get("bonus_pct", 0)
            spouse_bonus = spouse_salary * spouse_bonus_pct / 100
            gross_income += spouse_salary + spouse_bonus

    # --- RSU processing (simplified per spec — runs pre- and post-retirement) ---
    #
    # Per-year logic:
    #   1. Update price by this year's growth rate (glide from initial to long-term).
    #   2. Process vesting tranches that vest this year:
    #      - sell_to_cover_pct of shares disappear (sold for tax withholding).
    #      - 100% of gross vest value is ordinary income.
    #      - Remaining (1 - sell_to_cover) shares added to aggregate held position
    #        with cost basis = kept_shares × vest-day price.
    #   3. Add annual refresh grant (as new unvested tranche vesting next year).
    #   4. Sell held position if held_sale_year has arrived — proceeds → taxable,
    #      gains above aggregate cost basis are LTCG.
    rsu_st = state["rsu"]
    if rsu_st["price"] > 0 and (rsu_st["held_shares"] > 0 or rsu_st["unvested_tranches"]):
        # 1. Apply this year's growth rate (glide from initial to long-term).
        if years_from_start > 0:
            t = min(years_from_start, rsu_st["transition_years"])
            trans = rsu_st["transition_years"]
            if trans > 0:
                rate_pct = rsu_st["initial_growth_pct"] + (
                    rsu_st["long_term_growth_pct"] - rsu_st["initial_growth_pct"]
                ) * t / trans
            else:
                rate_pct = rsu_st["long_term_growth_pct"]
            rsu_st["price"] *= (1 + rate_pct / 100)
        projected_price = rsu_st["price"]

        sell_to_cover = rsu_st["sell_to_cover_pct"] / 100

        # 2. Process vesting events.
        remaining_tranches = []
        for tranche in rsu_st["unvested_tranches"]:
            if tranche["vest_year"] == year:
                gross_shares = tranche["shares"]
                vest_value = gross_shares * projected_price
                rsu_vest_income += vest_value  # full value is ordinary income

                withheld_shares = gross_shares * sell_to_cover
                kept_shares = gross_shares - withheld_shares
                kept_value = kept_shares * projected_price

                # Aggregate into held position (cost basis = FMV @ vest for kept shares).
                rsu_st["held_shares"] += kept_shares
                rsu_st["held_cost_basis"] += kept_value
                # If this tranche has a scheduled sale year, propagate it to the
                # aggregate held position (last-writer-wins; most configs use one
                # global sale year for all tranches).
                if tranche.get("sale_year") and not rsu_st.get("held_sale_year"):
                    rsu_st["held_sale_year"] = tranche["sale_year"]

                if sell_to_cover > 0:
                    events.append(
                        f"RSU vest: {gross_shares:.0f} shares @ ${projected_price:,.0f} "
                        f"= ${vest_value:,.0f} — {withheld_shares:.0f} sold for tax, "
                        f"{kept_shares:.0f} kept"
                    )
                else:
                    events.append(
                        f"RSU vest: {gross_shares:.0f} shares @ ${projected_price:,.0f} "
                        f"= ${vest_value:,.0f} (ordinary income)"
                    )
            else:
                remaining_tranches.append(tranche)
        rsu_st["unvested_tranches"] = remaining_tranches

        # 3. Add annual refresh grant (dollar value → shares at current price).
        refresh_end = rsu_st.get("refresh_end_year")
        refresh_active = not is_retired and (refresh_end is None or year <= refresh_end)
        if refresh_active and rsu_st["annual_refresh_value"] > 0 and projected_price > 0:
            refresh_shares = rsu_st["annual_refresh_value"] / projected_price
            rsu_st["unvested_tranches"].append({
                "shares": refresh_shares,
                "vest_year": year + 1,
                "sale_year": rsu_st.get("refresh_sale_year"),
            })
            events.append(
                f"RSU grant: ${rsu_st['annual_refresh_value']:,.0f} = "
                f"{refresh_shares:.1f} shares @ ${projected_price:,.0f}"
            )

        # Vest income is taxed as ordinary income
        gross_income += rsu_vest_income

        # 4. Sell aggregate held position if sale year has arrived.
        sale_year = rsu_st.get("held_sale_year")
        if sale_year and year >= sale_year and rsu_st["held_shares"] > 0:
            sale_shares = rsu_st["held_shares"]
            sale_proceeds = sale_shares * projected_price
            cost_basis = rsu_st["held_cost_basis"]
            gains = max(0, sale_proceeds - cost_basis)
            rsu_cap_gains += gains
            state["taxable"] += sale_proceeds
            state["taxable_cost_basis"] += sale_proceeds
            events.append(
                f"RSU sale: {sale_shares:.0f} shares @ ${projected_price:,.0f} "
                f"= ${sale_proceeds:,.0f} (gains: ${gains:,.0f})"
            )
            rsu_st["held_shares"] = 0
            rsu_st["held_cost_basis"] = 0
            rsu_st["held_sale_year"] = None

        # Market value of vested (unsold) held shares — unvested are NOT assets.
        rsu_held_value = rsu_st["held_shares"] * projected_price

    # --- Social Security ---
    ss_income = 0.0
    ss_cfg = assumptions["social_security"]
    ss_primary = compute_social_security(
        year=year,
        birth_year=birth_year,
        pia_at_67=ss_cfg["primary_pia_at_67"],
        claiming_age=ss_cfg["claiming_age_primary"],
        cola_pct=ss_cfg["cola_pct"],
        base_year=base_year,
    )
    ss_income += ss_primary

    # Spouse SS
    spouse = profile.get("spouse")
    if spouse:
        ss_spouse = compute_social_security(
            year=year,
            birth_year=spouse["birth_year"],
            pia_at_67=ss_cfg["spouse_pia_at_67"],
            claiming_age=ss_cfg["claiming_age_spouse"],
            cola_pct=ss_cfg["cola_pct"],
            base_year=base_year,
        )
        ss_income += ss_spouse

    if ss_income > 0:
        events.append(f"Social Security: ${ss_income:,.0f}")

    # --- College costs ---
    college_cost, drawdown_529, college_events = compute_college_costs(
        year=year,
        base_year=base_year,
        children=state["children"],
        college_assumptions=assumptions["college"],
        tuition_inflation_pct=inflation["college_tuition_pct"],
        general_inflation_pct=gen_inflation,
    )
    events.extend(college_events)

    # Deduct 529 drawdowns from children's balances
    for child in state["children"]:
        cs = child["college_start_year"]
        ce = cs + child.get("college_years", 4)
        if cs <= year < ce:
            gross = real_to_nominal(
                assumptions["college"]["annual_cost_today"] +
                assumptions["college"]["room_and_board_today"],
                year, base_year, inflation["college_tuition_pct"]
            ) - assumptions["college"].get("financial_aid_annual", 0) - assumptions["college"].get("scholarship_annual", 0)
            actual_drawdown = min(child["_529_balance"], gross)
            child["_529_balance"] = max(0, child["_529_balance"] - actual_drawdown)

    # Grow 529 balances
    grow_529_balances(state["children"], year)

    # --- Mortgage payments ---
    mortgage_payments = 0.0
    for prop in state["properties"]:
        if prop["mortgage_balance"] > 0:
            new_bal, princ, interest = amortize_year(
                prop["mortgage_balance"],
                prop["mortgage_rate_pct"],
                prop["monthly_payment"],
            )
            prop["mortgage_balance"] = new_bal
            mortgage_payments += annual_mortgage_payment(prop["monthly_payment"])

    for mort in state["additional_mortgages"]:
        if mort["balance"] > 0:
            new_bal, princ, interest = amortize_year(
                mort["balance"], mort["rate_pct"], mort["monthly_payment"]
            )
            mort["balance"] = new_bal
            mortgage_payments += annual_mortgage_payment(mort["monthly_payment"])

    # --- Property costs (tax, insurance, carrying for all non-rental properties) ---
    property_carrying_costs = 0.0
    property_taxes = 0.0
    property_insurance = 0.0
    for prop in state["properties"]:
        # Property tax applies to all properties (incl after mortgage payoff)
        base_tax = prop.get("annual_property_tax", 0)
        if base_tax > 0:
            property_taxes += real_to_nominal(base_tax, year, base_year, gen_inflation)
        # Insurance applies to all owned properties
        base_ins = prop.get("annual_insurance", 0)
        if base_ins > 0:
            property_insurance += real_to_nominal(base_ins, year, base_year, gen_inflation)
        # Carrying costs only for non-rental (maintenance, HOA, utilities)
        if not prop.get("is_rental", False):
            base_cost = prop.get("annual_carrying_cost", 0)
            if base_cost > 0:
                property_carrying_costs += real_to_nominal(
                    base_cost, year, base_year, gen_inflation
                )

    # --- Rental income ---
    rental_income = 0.0
    for rental in state["rentals"]:
        prop_value = rental["value"]
        _, net_rental = rental_property_annual_pl(
            monthly_rent=rental["monthly_rent"],
            vacancy_rate_pct=rental["vacancy_rate_pct"],
            property_value=prop_value,
            annual_maintenance_pct=rental["annual_maintenance_pct"],
            property_management_pct=rental["property_management_pct"],
            annual_mortgage_pmt=annual_mortgage_payment(rental.get("mortgage_payment", 0)),
        )
        rental_income += max(0, net_rental)  # Only count positive cash flow
        # Appreciate property
        rental["value"] *= 1 + assumptions["investment_returns"]["real_estate_appreciation_pct"] / 100
        rental["monthly_rent"] *= 1 + gen_inflation / 100  # Rent grows with inflation

    # --- Healthcare ---
    healthcare_cost, hc_events = compute_healthcare_costs(
        year=year,
        base_year=base_year,
        age_primary=age,
        retirement_year=retirement_year,
        healthcare=assumptions["healthcare"],
        healthcare_inflation_pct=inflation["healthcare_pct"],
    )
    events.extend(hc_events)

    # --- Large purchases ---
    large_purchase_cost = 0.0
    for purchase in assumptions.get("large_purchases", []):
        if purchase["year"] == year:
            if purchase.get("is_rental_conversion", False):
                # Convert existing property to rental
                state["rentals"].append({
                    "name": purchase["name"],
                    "value": 0,  # Will be set from existing property
                    "monthly_rent": purchase["monthly_rental_income"],
                    "vacancy_rate_pct": purchase["vacancy_rate_pct"],
                    "annual_maintenance_pct": purchase["annual_maintenance_pct"],
                    "property_management_pct": purchase["property_management_pct"],
                    "mortgage_payment": purchase.get("current_mortgage_payment", 0),
                })
                # Find the property value from existing properties
                for prop in state["properties"]:
                    if not prop["is_rental"]:
                        state["rentals"][-1]["value"] = prop["value"]
                        prop["is_rental"] = True
                        break
                large_purchase_cost += purchase.get("conversion_cost", 0)
                events.append(f"Rental conversion: {purchase['name']}")
            else:
                # New property purchase — down payment comes from liquid portfolio
                down = purchase["purchase_price"] * purchase["down_payment_pct"] / 100
                loan, pmt = new_mortgage_from_purchase(
                    purchase["purchase_price"],
                    purchase["down_payment_pct"],
                    purchase["mortgage_rate_pct"],
                    purchase["mortgage_term_years"],
                )
                state["additional_mortgages"].append({
                    "name": purchase["name"],
                    "balance": loan,
                    "rate_pct": purchase["mortgage_rate_pct"],
                    "monthly_payment": pmt,
                })
                state["properties"].append({
                    "name": purchase["name"],
                    "value": purchase["purchase_price"],
                    "mortgage_balance": loan,
                    "mortgage_rate_pct": purchase["mortgage_rate_pct"],
                    "monthly_payment": pmt,
                    "is_rental": False,
                    "annual_carrying_cost": purchase.get("annual_carrying_cost", 0),
                    "annual_property_tax": purchase.get("annual_property_tax", 0),
                    "annual_insurance": purchase.get("annual_insurance", 0),
                    "appreciation_rate_pct": purchase.get("appreciation_rate_pct"),
                })
                # Down payment directly reduces taxable portfolio
                state["taxable"] -= down
                large_purchase_cost += down
                events.append(
                    f"Purchase: {purchase['name']} (${purchase['purchase_price']:,.0f}, "
                    f"down ${down:,.0f})"
                )

    # --- Life events (inheritance, windfalls, etc.) ---
    # Combine profile-level windfalls (permanent) with scenario life_events.
    # Per spec: windfalls land in taxable brokerage (future work: let user choose).
    life_event_income = 0.0
    windfall_gross = 0.0
    windfall_net = 0.0
    all_life_events = list(assumptions.get("life_events", []))
    for w in profile.get("windfalls", []):
        if w.get("recurring", False):
            w_end = w.get("end_year") or end_year
            if w["year"] <= year <= w_end:
                all_life_events.append(w)
        else:
            if w["year"] == year:
                all_life_events.append(w)
    for evt in all_life_events:
        if evt["year"] == year or (evt.get("recurring") and evt["year"] <= year):
            amount = evt["amount"]
            tax = 0.0
            if evt.get("taxable", False) and amount > 0:
                rate = evt.get("tax_rate_override")
                if rate is None:
                    rate = tax_cfg.get("pre_retirement_effective_pct", 32) if not is_retired else tax_cfg.get("retirement_effective_pct", 25)
                tax = amount * rate / 100
            net = amount - tax
            state["taxable"] += net
            state["taxable_cost_basis"] += net
            life_event_income += net
            windfall_gross += amount
            windfall_net += net
            events.append(f"{evt['name']}: ${amount:,.0f}" + (f" (tax: ${tax:,.0f})" if tax > 0 else ""))

    # --- Vehicle purchases & auto loan payments ---
    vehicle_cost = 0.0
    auto_loan_payments = 0.0

    for v in state["vehicles"]:
        if v["year"] == year:
            # Inflate purchase price and trade-in to nominal
            nominal_price = real_to_nominal(
                v["purchase_price"], year, base_year, gen_inflation
            )
            nominal_trade_in = real_to_nominal(
                v.get("trade_in_value", 0), year, base_year, gen_inflation
            )
            net_price = nominal_price - nominal_trade_in

            if v.get("financed", False) and v.get("down_payment_pct", 100) < 100:
                # Financed: down payment from liquid, create auto loan for remainder
                down = net_price * v["down_payment_pct"] / 100
                loan_amount = net_price - down
                rate = v.get("loan_rate_pct", 6.0)
                term_months = v.get("loan_term_years", 5) * 12

                # Standard amortization for monthly payment
                if rate > 0 and term_months > 0:
                    monthly_rate = rate / 100 / 12
                    monthly_pmt = loan_amount * (
                        monthly_rate * (1 + monthly_rate) ** term_months
                    ) / ((1 + monthly_rate) ** term_months - 1)
                else:
                    monthly_pmt = loan_amount / max(term_months, 1)

                state["auto_loans"].append({
                    "name": v.get("name", "Auto Loan"),
                    "balance": loan_amount,
                    "rate_pct": rate,
                    "monthly_payment": monthly_pmt,
                    "remaining_months": term_months,
                })
                vehicle_cost += down
                state["taxable"] -= down
                events.append(
                    f"Vehicle purchase: {v.get('name', 'Car')} "
                    f"(${nominal_price:,.0f}, trade-in ${nominal_trade_in:,.0f}, "
                    f"down ${down:,.0f}, loan ${loan_amount:,.0f})"
                )
            else:
                # Cash purchase
                vehicle_cost += net_price
                state["taxable"] -= net_price
                events.append(
                    f"Vehicle purchase: {v.get('name', 'Car')} "
                    f"(${nominal_price:,.0f}, trade-in ${nominal_trade_in:,.0f}, "
                    f"net ${net_price:,.0f} cash)"
                )

    # Process auto loan payments
    remaining_loans = []
    for loan in state["auto_loans"]:
        if loan["balance"] <= 0 or loan["remaining_months"] <= 0:
            continue
        # Pay 12 months (or remaining months if fewer)
        months_this_year = min(12, loan["remaining_months"])
        annual_pmt = loan["monthly_payment"] * months_this_year
        # Amortize: simplified annual interest + principal
        annual_interest = loan["balance"] * loan["rate_pct"] / 100
        principal_paid = max(0, annual_pmt - annual_interest)
        loan["balance"] = max(0, loan["balance"] - principal_paid)
        loan["remaining_months"] -= months_this_year
        auto_loan_payments += annual_pmt
        if loan["balance"] > 0 and loan["remaining_months"] > 0:
            remaining_loans.append(loan)
    state["auto_loans"] = remaining_loans

    # --- Existing vehicle depreciation & loans ---
    existing_vehicle_loan_payments = 0.0
    for ev in state["existing_vehicles"]:
        # Depreciate the vehicle
        dep_rate = ev.get("depreciation_pct", 15) / 100
        ev["current_value"] = ev.get("current_value", 0) * (1 - dep_rate)

        # Process loan payments if active
        if ev.get("_has_loan") and ev.get("loan_balance", 0) > 0:
            if ev.get("loan_remaining_months", 0) <= 0:
                # Term expired — pay off any residual balance
                existing_vehicle_loan_payments += ev["loan_balance"]
                ev["loan_balance"] = 0
                ev["_has_loan"] = False
                events.append(f"Vehicle loan paid off: {ev.get('name', 'Vehicle')}")
            else:
                months_this_year = min(12, ev["loan_remaining_months"])
                annual_pmt = ev["monthly_payment"] * months_this_year
                annual_interest = ev["loan_balance"] * ev.get("loan_rate_pct", 6.0) / 100
                principal_paid = max(0, annual_pmt - annual_interest)
                ev["loan_balance"] = max(0, ev["loan_balance"] - principal_paid)
                ev["loan_remaining_months"] -= months_this_year
                existing_vehicle_loan_payments += annual_pmt
                if ev["loan_balance"] <= 0 or ev["loan_remaining_months"] <= 0:
                    # Final payment — clear any residual next year
                    pass

    # --- Debt payments (HELOCs, credit cards, student loans, etc.) ---
    debt_payments = 0.0
    remaining_debts = []
    for d in state["debts"]:
        balance = d.get("balance", 0)
        if balance <= 0:
            continue

        rate = d.get("interest_rate_pct", 0) / 100
        annual_interest = balance * rate
        monthly_pmt = d.get("monthly_payment", 0)
        label = d.get("name") or d.get("type", "Debt")

        # Check if this is a payoff year
        payoff_year = d.get("payoff_year")
        if payoff_year and year >= payoff_year:
            # Pay off remaining balance this year
            debt_payments += balance + annual_interest
            d["balance"] = 0
            events.append(f"Debt paid off: {label} (${balance:,.0f})")
            continue

        if d.get("interest_only", False):
            # Interest-only: pay just the interest, balance unchanged
            debt_payments += annual_interest
        else:
            # Amortizing: apply monthly payments
            annual_pmt = monthly_pmt * 12
            principal_paid = max(0, annual_pmt - annual_interest)
            d["balance"] = max(0, balance - principal_paid)
            debt_payments += annual_pmt

        if d["balance"] > 0:
            remaining_debts.append(d)
        else:
            events.append(f"Debt paid off: {label}")
    state["debts"] = remaining_debts

    # --- Living expenses (excludes mortgage, tuition, healthcare — modeled above) ---
    expenses_cfg = profile.get("expenses", {})
    base_living = expenses_cfg.get("annual_base", 80000)
    retirement_reduction = expenses_cfg.get("retirement_reduction_pct", 20) / 100
    per_child_annual = expenses_cfg.get("per_child_annual", 15000)
    children_leave_after_college = expenses_cfg.get("children_leave_after_college", True)

    living_expenses = real_to_nominal(base_living, year, base_year, gen_inflation)

    # Add per-child cost, drop when they leave (after college end)
    for child in state["children"]:
        college_end = child["college_start_year"] + child.get("college_years", 4)
        if children_leave_after_college and year >= college_end:
            continue  # child has left the house
        living_expenses += real_to_nominal(per_child_annual, year, base_year, gen_inflation)

    if is_retired:
        living_expenses *= (1 - retirement_reduction)

    # --- Total expenses ---
    total_expenses = (
        college_cost + mortgage_payments + healthcare_cost +
        large_purchase_cost + vehicle_cost + auto_loan_payments +
        existing_vehicle_loan_payments + debt_payments +
        living_expenses + property_carrying_costs +
        property_taxes + property_insurance
    )

    # --- Savings contributions (pre-retirement only, per person) ---
    # Route each contribution type to the correct tax-aware pool. Traditional
    # contributions are split by owner into traditional_primary /
    # traditional_spouse sub-pools so RMDs can be computed per-person.
    savings_contributions = 0.0
    trad_contributions_primary = 0.0  # reduces taxable income
    trad_contributions_spouse = 0.0   # reduces taxable income
    roth_contributions = 0.0
    hsa_contributions = 0.0           # reduces taxable income
    taxable_contributions = 0.0

    for person_key, person_savings in [("primary", savings_cfg.get("primary", {})),
                                        ("spouse", savings_cfg.get("spouse", {}))]:
        if not person_savings or not isinstance(person_savings, dict):
            continue

        # Each person's savings stop at their own retirement year
        person_retired = is_retired if person_key == "primary" else spouse_retired
        if person_retired:
            continue

        # Determine total cash comp for this person (salary + bonus)
        if person_key == "primary":
            base_salary = income_cfg["primary"]["base_salary"]
            raise_pct = income_cfg["primary"]["annual_raise_pct"]
            bonus_pct = income_cfg["primary"].get("bonus_pct", 0)
        else:
            spouse_inc = income_cfg.get("spouse", {})
            base_salary = spouse_inc.get("base_salary", 0) if spouse_inc else 0
            raise_pct = spouse_inc.get("annual_raise_pct", 0) if spouse_inc else 0
            bonus_pct = spouse_inc.get("bonus_pct", 0) if spouse_inc else 0
        if base_salary <= 0:
            continue

        current_salary = base_salary * (1 + raise_pct / 100) ** (year - base_year)
        current_total_comp = current_salary * (1 + bonus_pct / 100)

        # 401k: contribution rate applies to salary (or salary + bonus if eligible)
        rate = person_savings.get("contribution_rate_pct", 0)
        limit = person_savings.get("irs_401k_limit", 24500)
        bonus_eligible = person_savings.get("bonus_401k_eligible", False)
        comp_basis = current_total_comp if bonus_eligible else current_salary
        if rate > 0:
            total_401k = comp_basis * rate / 100
            trad_401k = min(total_401k, limit)
            roth_401k = max(0, total_401k - limit)
        else:
            # Fall back to explicit amounts
            trad_401k = person_savings.get("annual_401k_traditional", 0)
            roth_401k = person_savings.get("annual_401k_roth", 0)

        # Per-owner traditional routing; Roth aggregates (no RMD, no owner split).
        person_trad = trad_401k
        person_trad += person_savings.get("annual_ira_traditional", 0)
        # Employer match → traditional (always pre-tax, stays with the employee-owner)
        match = current_salary * person_savings.get("employer_match_pct", 0) / 100
        employer_flat = current_salary * person_savings.get("employer_contribution_pct", 0) / 100
        person_trad += match + employer_flat

        if person_key == "primary":
            trad_contributions_primary += person_trad
        else:
            trad_contributions_spouse += person_trad

        roth_contributions += roth_401k
        roth_contributions += person_savings.get("annual_ira_roth", 0)

        # HSA (pre-tax deduction, grows tax-free) — aggregate pool, per-person tax deduction
        hsa_contributions += person_savings.get("annual_hsa", 0)

        # Additional monthly savings → taxable brokerage
        taxable_contributions += person_savings.get("additional_monthly_savings", 0) * 12

    trad_contributions = trad_contributions_primary + trad_contributions_spouse
    savings_contributions = (
        trad_contributions + roth_contributions
        + hsa_contributions + taxable_contributions
    )

    # --- Investment returns (per pool) ---
    #
    # Returns are computed *before* RMDs/withdrawals for the year — this
    # matches how RMDs are calculated in practice: RMDs use the prior year's
    # ending balance, and portfolio growth this year inflates the pool.
    inv_return = 0.0
    returns_by_pool: dict[str, float] = {}
    for pool_name in (
        "traditional_primary",
        "traditional_spouse",
        "roth",
        "taxable",
        "hsa",
    ):
        pool_return = compute_portfolio_return(
            portfolio_value=state[pool_name],
            year=year,
            retirement_year=retirement_year,
            assumptions=assumptions,
        )
        state[pool_name] += pool_return
        returns_by_pool[pool_name] = pool_return
        inv_return += pool_return

    # --- RMDs (mandatory, per owner where age >= RMD_START_AGE) ---
    # Computed against prior-year ending balance per IRS rules. Withdrawn
    # immediately from the respective traditional sub-pool; the gross amount
    # is ordinary taxable income. If RMD cash exceeds expense shortfall,
    # the excess (after tax) goes to the taxable pool.
    spouse_age = (year - spouse["birth_year"]) if spouse else None
    rmd_primary_gross = compute_rmd(state["prior_traditional_primary"], age)
    rmd_primary_gross = min(rmd_primary_gross, state["traditional_primary"])
    state["traditional_primary"] -= rmd_primary_gross

    rmd_spouse_gross = 0.0
    if spouse_age is not None:
        rmd_spouse_gross = compute_rmd(state["prior_traditional_spouse"], spouse_age)
        rmd_spouse_gross = min(rmd_spouse_gross, state["traditional_spouse"])
        state["traditional_spouse"] -= rmd_spouse_gross
    rmd_total = rmd_primary_gross + rmd_spouse_gross
    if rmd_total > 0:
        msg = f"RMD: primary ${rmd_primary_gross:,.0f}"
        if rmd_spouse_gross > 0:
            msg += f", spouse ${rmd_spouse_gross:,.0f}"
        events.append(msg)

    # --- Taxes (progressive federal brackets) + withdrawal sequencing ---
    tax_cfg = profile.get("tax", {})
    income_tax = 0.0
    cap_gains_tax = 0.0
    niit_amt = 0.0
    effective_tax_rate = 0.0
    marginal_tax_rate = 0.0

    # Withdrawal tracking
    portfolio_withdrawal = 0.0
    withdrawal_from_taxable = 0.0
    withdrawal_from_traditional = 0.0  # voluntary, above RMD
    withdrawal_from_roth = 0.0
    withdrawal_from_hsa = 0.0
    taxable_gains = 0.0  # LTCG portion of taxable withdrawal

    std_ded = standard_deduction(year, gen_inflation, filing_status)

    fica = 0.0
    state_tax = 0.0

    # Count qualifying children for Child Tax Credit (under 17 at end of tax year)
    num_qualifying_children = 0
    for child in state["children"]:
        child_age = year - child.get("birth_year", year)
        if 0 < child_age < 17:
            num_qualifying_children += 1

    # HSA draw for healthcare costs (tax-free). We apply it in both pre- and
    # post-retirement years — HSA reimbursements are tax-free at any age.
    if healthcare_cost > 0 and state["hsa"] > 0:
        withdrawal_from_hsa = min(healthcare_cost, state["hsa"])
        state["hsa"] -= withdrawal_from_hsa

    if not is_retired:
        # ── Pre-retirement: contribute, then tax, then absorb surplus/deficit ──
        pretax_deductions = trad_contributions + hsa_contributions

        tax_result = compute_year_taxes(
            gross_earned_income=gross_income,
            traditional_deductions=pretax_deductions,
            standard_deduction_amt=std_ded,
            ltcg_income=rsu_cap_gains,
            rental_income=rental_income,
            traditional_withdrawal=rmd_total,  # RMD is ordinary income
            rsu_vest_tax_covered=rsu_vest_tax_covered,
            year=year,
            inflation_pct=gen_inflation,
            filing_status=filing_status,
            state_of_residence=state_of_residence,
            state_tax_override_pct=state_tax_override,
            num_qualifying_children=num_qualifying_children,
        )

        income_tax = tax_result["federal_income_tax"]
        cap_gains_tax = tax_result["ltcg_tax"]
        niit_amt = tax_result["niit"]
        fica = tax_result["fica"]
        state_tax = tax_result["state_tax"]
        effective_tax_rate = tax_result["effective_rate_pct"]
        marginal_tax_rate = tax_result["marginal_rate_pct"]

        cash_tax = tax_result["cash_tax_owed"]
        total_expenses += cash_tax

        # Route contributions to per-owner sub-pools.
        state["traditional_primary"] += trad_contributions_primary
        state["traditional_spouse"] += trad_contributions_spouse
        state["roth"] += roth_contributions
        state["hsa"] += hsa_contributions
        state["taxable"] += taxable_contributions
        state["taxable_cost_basis"] += taxable_contributions

        # Total cash available this year: earned income + SS + rental + RMD
        # gross (already withdrawn from trad pools) + HSA medical draw.
        total_cash_in = (
            gross_income + ss_income + rental_income
            + rmd_total + withdrawal_from_hsa
        )
        net_surplus = total_cash_in - total_expenses
        if net_surplus > 0:
            state["taxable"] += net_surplus
            state["taxable_cost_basis"] += net_surplus
        else:
            deficit = -net_surplus
            # Deficit funded taxable → roth → traditional (pre-retirement this is rare).
            draw = min(deficit, state["taxable"])
            withdrawal_from_taxable += draw
            if state["taxable"] > 0:
                ratio = draw / state["taxable"]
                state["taxable_cost_basis"] *= (1 - ratio)
            state["taxable"] -= draw
            deficit -= draw
            if deficit > 0 and state["roth"] > 0:
                draw = min(deficit, state["roth"])
                withdrawal_from_roth += draw
                state["roth"] -= draw
                deficit -= draw
            if deficit > 0:
                # Voluntary traditional draw (split proportionally across sub-pools).
                trad_total = state["traditional_primary"] + state["traditional_spouse"]
                draw = min(deficit, trad_total)
                if trad_total > 0:
                    f_p = state["traditional_primary"] / trad_total
                    state["traditional_primary"] -= draw * f_p
                    state["traditional_spouse"] -= draw * (1 - f_p)
                    withdrawal_from_traditional += draw

    else:
        # ── Retirement: RMDs first, then shortfall-driven withdrawals ──
        # Order (spec): taxable → traditional (voluntary, above RMD) → roth.
        shortfall = total_expenses - ss_income - rental_income - rmd_total - withdrawal_from_hsa
        if shortfall < 0:
            shortfall = 0
        remaining = shortfall

        # Step 1: Withdraw from taxable (LTCG on gains portion)
        if remaining > 0 and state["taxable"] > 0:
            draw = min(remaining, state["taxable"])
            withdrawal_from_taxable = draw
            gains_frac = 0.0
            if state["taxable"] > 0:
                gains_frac = max(0, 1 - state["taxable_cost_basis"] / state["taxable"])
            taxable_gains = draw * gains_frac
            if state["taxable"] > 0:
                ratio = draw / state["taxable"]
                state["taxable_cost_basis"] *= (1 - ratio)
            state["taxable"] -= draw
            remaining -= draw

        # Step 2: Voluntary withdraw from traditional (above RMD). Gross up
        # for tax using current marginal rate (RMD already in the stack).
        trad_total = state["traditional_primary"] + state["traditional_spouse"]
        if remaining > 0 and trad_total > 0:
            base_ord = ss_income * 0.85 + rental_income + rmd_total
            _, _, marg = federal_income_tax(
                max(0, base_ord - std_ded), year, gen_inflation, filing_status
            )
            marginal = marg / 100
            if marginal >= 1:
                marginal = 0.37
            gross_needed = remaining / max(1 - marginal, 0.01)
            gross_needed = min(gross_needed, trad_total)
            # Proportional split across sub-pools (preserves owner balances).
            f_p = state["traditional_primary"] / trad_total
            state["traditional_primary"] -= gross_needed * f_p
            state["traditional_spouse"] -= gross_needed * (1 - f_p)
            withdrawal_from_traditional = gross_needed
            remaining -= gross_needed * (1 - marginal)
            remaining = max(0, remaining)

        # Step 3: Roth (tax-free, last resort)
        if remaining > 0 and state["roth"] > 0:
            draw = min(remaining, state["roth"])
            withdrawal_from_roth = draw
            state["roth"] -= draw
            remaining -= draw

        portfolio_withdrawal = (
            withdrawal_from_taxable + withdrawal_from_traditional
            + withdrawal_from_roth
        )

        # Compute actual taxes on all retirement income (RMD + voluntary trad +
        # LTCG from taxable draw + any RSU cap gains + SS + rental).
        tax_result = compute_year_taxes(
            gross_earned_income=0,
            traditional_deductions=0,
            standard_deduction_amt=std_ded,
            ltcg_income=taxable_gains + rsu_cap_gains,
            social_security_income=ss_income,
            rental_income=rental_income,
            traditional_withdrawal=rmd_total + withdrawal_from_traditional,
            year=year,
            inflation_pct=gen_inflation,
            filing_status=filing_status,
            state_of_residence=state_of_residence,
            state_tax_override_pct=state_tax_override,
            num_qualifying_children=num_qualifying_children,
        )

        income_tax = tax_result["federal_income_tax"]
        cap_gains_tax = tax_result["ltcg_tax"]
        niit_amt = tax_result["niit"]
        state_tax = tax_result["state_tax"]
        effective_tax_rate = tax_result["effective_rate_pct"]
        marginal_tax_rate = tax_result["marginal_rate_pct"]

        # No FICA in retirement (no earned income)
        total_expenses += tax_result["cash_tax_owed"]

        # Excess cash (income + RMD + HSA > expenses + tax) → taxable brokerage.
        total_cash_in = (
            ss_income + rental_income + rmd_total + withdrawal_from_hsa
        )
        net_retirement_income = total_cash_in - total_expenses
        if net_retirement_income > 0 and shortfall == 0:
            state["taxable"] += net_retirement_income
            state["taxable_cost_basis"] += net_retirement_income

    # Snapshot ending traditional balances for next year's RMD computation.
    state["prior_traditional_primary"] = state["traditional_primary"]
    state["prior_traditional_spouse"] = state["traditional_spouse"]

    # Sync liquid_portfolio from all five pools
    state["liquid_portfolio"] = (
        state["traditional_primary"] + state["traditional_spouse"]
        + state["roth"] + state["taxable"] + state["hsa"]
    )
    state["liquid_portfolio"] = max(0, state["liquid_portfolio"])

    # --- Real estate appreciation ---
    default_re_rate = assumptions["investment_returns"]["real_estate_appreciation_pct"]
    re_equity = 0.0
    for prop in state["properties"]:
        rate = prop.get("appreciation_rate_pct")
        if not rate:  # None or 0 → use scenario default
            rate = default_re_rate
        prop["value"] *= 1 + rate / 100
        equity = prop["value"] - prop.get("mortgage_balance", 0)
        re_equity += max(0, equity)

    # --- Vehicle equity (depreciating asset minus loan) ---
    vehicle_equity = 0.0
    vehicle_loan_debt = 0.0
    for ev in state["existing_vehicles"]:
        vehicle_equity += ev.get("current_value", 0)
        vehicle_loan_debt += ev.get("loan_balance", 0)
    # Also count outstanding auto loans from planned purchases
    for loan in state["auto_loans"]:
        vehicle_loan_debt += loan.get("balance", 0)

    # --- Outstanding debt ---
    debt_balance = sum(d.get("balance", 0) for d in state["debts"])

    # --- Net worth ---
    # rsu_held_value = market value of vested (unsold) RSU shares; unvested are excluded
    net_worth = (
        state["liquid_portfolio"] + re_equity + rsu_held_value
        + vehicle_equity - vehicle_loan_debt - debt_balance
    )
    # Add 529 balances
    for child in state["children"]:
        net_worth += child.get("_529_balance", 0)

    # Aggregate traditional balance (sum of owner sub-pools) for back-compat.
    traditional_total = state["traditional_primary"] + state["traditional_spouse"]
    total_tax = income_tax + cap_gains_tax + niit_amt + fica + state_tax

    # Gross/net on RMDs for the waterfall. Net = gross minus the proportional
    # share of ordinary tax attributable to RMD (approximation using effective
    # ordinary federal rate).
    rmd_tax = 0.0
    if rmd_total > 0 and (income_tax + state_tax) > 0:
        # Approximate: RMD's share of ordinary-income tax, assuming RMD is
        # taxed at the effective ordinary rate. Simpler than re-running the
        # full tax stack.
        rmd_tax = min(income_tax + state_tax, rmd_total * effective_tax_rate / 100)
    rmd_net = max(0, rmd_total - rmd_tax)

    # Per-expense bucket totals for the waterfall
    vehicle_bucket = vehicle_cost + auto_loan_payments + existing_vehicle_loan_payments
    property_bucket = property_carrying_costs + property_taxes + property_insurance

    cash_flow = {
        # Inflows
        "earned_income": round(gross_income - rsu_vest_income, 2),
        "rsu_vest_income": round(rsu_vest_income, 2),
        "social_security": round(ss_income, 2),
        "rental_income": round(rental_income, 2),
        "rmd_gross": round(rmd_total, 2),
        "rmd_tax": round(rmd_tax, 2),
        "rmd_net": round(rmd_net, 2),
        "rmd_primary": round(rmd_primary_gross, 2),
        "rmd_spouse": round(rmd_spouse_gross, 2),
        "windfall_gross": round(windfall_gross, 2),
        "windfall_net": round(windfall_net, 2),

        # Outflows
        "living_expenses": round(living_expenses, 2),
        "healthcare": round(healthcare_cost, 2),
        "mortgage": round(mortgage_payments, 2),
        "college": round(college_cost, 2),
        "vehicle": round(vehicle_bucket, 2),
        "debt_payments": round(debt_payments, 2),
        "property_costs": round(property_bucket, 2),
        "large_purchase": round(large_purchase_cost, 2),
        "total_expenses": round(total_expenses, 2),

        # Tax
        "federal_income_tax": round(income_tax, 2),
        "state_tax": round(state_tax, 2),
        "fica": round(fica, 2),
        "ltcg_tax": round(cap_gains_tax, 2),
        "niit": round(niit_amt, 2),
        "total_tax": round(total_tax, 2),

        # Portfolio withdrawals to cover shortfall
        "from_taxable": round(withdrawal_from_taxable, 2),
        "from_traditional": round(withdrawal_from_traditional, 2),
        "from_roth": round(withdrawal_from_roth, 2),
        "from_hsa_medical": round(withdrawal_from_hsa, 2),

        # Investment returns (per pool)
        "returns_traditional_primary": round(returns_by_pool.get("traditional_primary", 0), 2),
        "returns_traditional_spouse": round(returns_by_pool.get("traditional_spouse", 0), 2),
        "returns_roth": round(returns_by_pool.get("roth", 0), 2),
        "returns_taxable": round(returns_by_pool.get("taxable", 0), 2),
        "returns_hsa": round(returns_by_pool.get("hsa", 0), 2),

        # End-of-year balances
        "balance_traditional_primary": round(state["traditional_primary"], 2),
        "balance_traditional_spouse": round(state["traditional_spouse"], 2),
        "balance_roth": round(state["roth"], 2),
        "balance_taxable": round(state["taxable"], 2),
        "balance_hsa": round(state["hsa"], 2),
    }

    return {
        "year": year,
        "age_primary": age,
        "gross_income": round(gross_income, 2),
        "rsu_held_value": round(rsu_held_value, 2),
        "rsu_vest_income": round(rsu_vest_income, 2),
        "rsu_cap_gains_tax": round(cap_gains_tax, 2),
        "social_security_income": round(ss_income, 2),
        "rental_income": round(rental_income, 2),
        "total_expenses": round(total_expenses, 2),
        "college_costs": round(college_cost, 2),
        "mortgage_payments": round(mortgage_payments, 2),
        "healthcare_costs": round(healthcare_cost, 2),
        "large_purchase_costs": round(large_purchase_cost, 2),
        "vehicle_costs": round(vehicle_bucket, 2),
        "debt_payments": round(debt_payments, 2),
        "vehicle_equity": round(vehicle_equity, 2),
        "vehicle_loan_debt": round(vehicle_loan_debt, 2),
        "debt_balance": round(debt_balance, 2),
        "property_carrying_costs": round(property_carrying_costs, 2),
        "property_taxes": round(property_taxes, 2),
        "property_insurance": round(property_insurance, 2),
        "income_tax": round(total_tax, 2),
        "federal_income_tax": round(income_tax, 2),
        "ltcg_tax": round(cap_gains_tax, 2),
        "niit": round(niit_amt, 2),
        "fica": round(fica, 2),
        "state_tax": round(state_tax, 2),
        "effective_tax_rate_pct": round(effective_tax_rate, 2),
        "marginal_tax_rate_pct": round(marginal_tax_rate, 2),
        "living_expenses": round(living_expenses, 2),
        "savings_contributions": round(savings_contributions, 2),
        "investment_returns": round(inv_return, 2),
        "portfolio_withdrawals": round(portfolio_withdrawal, 2),
        "withdrawal_from_taxable": round(withdrawal_from_taxable, 2),
        "withdrawal_from_traditional": round(withdrawal_from_traditional, 2),
        "withdrawal_from_roth": round(withdrawal_from_roth, 2),
        # New: RMD + HSA tracking at the top level (and repeated inside cash_flow)
        "rmd_primary": round(rmd_primary_gross, 2),
        "rmd_spouse": round(rmd_spouse_gross, 2),
        "withdrawal_from_hsa": round(withdrawal_from_hsa, 2),
        "net_worth": round(net_worth, 2),
        "liquid_net_worth": round(state["liquid_portfolio"] + rsu_held_value, 2),
        # Balances: traditional_balance aggregates both owner sub-pools for
        # back-compat; new traditional_primary_balance / traditional_spouse_balance
        # and hsa_balance are exposed for callers that want the split.
        "traditional_balance": round(traditional_total, 2),
        "traditional_primary_balance": round(state["traditional_primary"], 2),
        "traditional_spouse_balance": round(state["traditional_spouse"], 2),
        "roth_balance": round(state["roth"], 2),
        "taxable_balance": round(state["taxable"], 2),
        "hsa_balance": round(state["hsa"], 2),
        "real_estate_equity": round(re_equity, 2),
        "events": events,
        "cash_flow": cash_flow,
    }
