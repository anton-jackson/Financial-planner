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
    # Support both retirement_age (new) and retirement_target_year (legacy)
    if "retirement_age" in personal:
        retirement_year = birth_year + personal["retirement_age"]
    else:
        retirement_year = personal["retirement_target_year"]

    # Spouse retirement year (independent of primary)
    spouse = profile.get("spouse")
    if spouse:
        if "retirement_age" in spouse:
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

    # Initialize mutable state
    state = _init_state(assets, profile)

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


def _init_state(assets: dict, profile: dict) -> dict:
    """Initialize mutable simulation state from assets and profile."""
    # Split liquid assets into three tax-aware pools
    traditional = 0.0  # tax-deferred: traditional 401k, traditional IRA
    roth = 0.0  # tax-free: roth 401k, roth IRA, HSA
    taxable = 0.0  # after-tax: brokerage, crypto
    taxable_cost_basis = 0.0  # track cost basis for LTCG on taxable withdrawals

    for a in assets.get("assets", []):
        atype = a["type"]
        bal = a["balance"]
        if atype in ("traditional_401k", "traditional_ira"):
            traditional += bal
        elif atype in ("roth_401k", "roth_ira", "hsa"):
            roth += bal
        elif atype in ("taxable_brokerage", "crypto"):
            taxable += bal
            taxable_cost_basis += bal  # initial balance = cost basis
        # 529 and real_estate handled separately

    liquid = traditional + roth + taxable

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

    # Deep copy children for 529 tracking
    children = []
    for c in profile.get("children", []):
        child = dict(c)
        if isinstance(child.get("current_school"), dict):
            child["current_school"] = dict(child["current_school"])
        child["_529_balance"] = child.get("plan_529_balance", 0)
        children.append(child)

    # RSU state for tracking vesting + sale (individual lots)
    rsu = profile.get("income", {}).get("rsu", {})
    unvested = []
    for t in rsu.get("unvested_tranches", []):
        unvested.append({
            "shares": t.get("shares", 0),
            "vest_year": t.get("vest_year", 2026),
            "sale_year": t.get("sale_year"),
        })

    # Already-vested shares become the first vested lot
    vested_lots = []
    if rsu.get("vested_shares", 0) > 0:
        vested_lots.append({
            "shares": rsu["vested_shares"],
            "cost_basis": rsu.get("vested_cost_basis", 0),
            "sale_year": rsu.get("vested_sale_year"),
        })

    initial_rate = rsu.get("annual_growth_rate_pct", 7)
    long_term_rate = rsu.get("long_term_growth_rate_pct")
    transition_years = rsu.get("growth_transition_years", 5)

    rsu_state = {
        "price": rsu.get("current_price", 0),  # mutated each year
        "initial_growth_pct": initial_rate,
        "long_term_growth_pct": long_term_rate if long_term_rate is not None else initial_rate,
        "transition_years": transition_years,
        "vested_lots": vested_lots,
        "unvested_tranches": unvested,
        "annual_refresh_value": rsu.get("annual_refresh_value", 0),
        "refresh_end_year": rsu.get("refresh_end_year"),
        "refresh_sale_year": rsu.get("refresh_sale_year"),
        # Sell-to-cover: company sells this % of shares at vest to cover tax withholding.
        # You receive (1 - rate) of granted shares. The withheld shares cover the tax,
        # so vest income should NOT also be taxed through the normal income tax path.
        "sell_to_cover_pct": rsu.get("sell_to_cover_pct", 0),
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

    # HELOCs
    helocs = []
    for h in profile.get("helocs", []):
        helocs.append(dict(h))

    return {
        "liquid_portfolio": liquid,
        "traditional": traditional,
        "roth": roth,
        "taxable": taxable,
        "taxable_cost_basis": taxable_cost_basis,
        "rsu": rsu_state,
        "properties": properties,
        "children": children,
        "rentals": [],  # rental conversions added during projection
        "additional_mortgages": [],  # from large purchases
        "vehicles": vehicles,
        "auto_loans": [],  # auto loans from financed vehicle purchases
        "existing_vehicles": existing_vehicles,
        "helocs": helocs,
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
            gross_income += spouse_salary

    # --- RSU processing (runs pre- and post-retirement for vesting/sales) ---
    rsu_st = state["rsu"]
    if rsu_st["price"] > 0 and (rsu_st["vested_lots"] or rsu_st["unvested_tranches"]):
        # Apply this year's growth rate (glide from initial to long-term)
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

        # 1. Process vesting events: unvested tranches that vest this year
        #    Sell-to-cover: company sells a % of shares to pay tax withholding.
        #    You receive fewer shares; the withheld amount covers the tax bill.
        sell_to_cover = rsu_st["sell_to_cover_pct"] / 100
        remaining_tranches = []
        for tranche in rsu_st["unvested_tranches"]:
            if tranche["vest_year"] == year:
                gross_shares = tranche["shares"]
                vest_value = gross_shares * projected_price
                rsu_vest_income += vest_value  # full value is ordinary income

                if sell_to_cover > 0:
                    withheld_shares = gross_shares * sell_to_cover
                    kept_shares = gross_shares - withheld_shares
                    withheld_value = withheld_shares * projected_price
                    # Withheld shares are sold immediately — proceeds cover the tax.
                    # The cash from withheld shares goes to the company (not to you),
                    # so we don't add it to liquid portfolio. But we also mark that
                    # the tax on this vest income is already paid via sell-to-cover.
                    rsu_vest_tax_covered += withheld_value
                else:
                    kept_shares = gross_shares

                kept_value = kept_shares * projected_price
                rsu_st["vested_lots"].append({
                    "shares": kept_shares,
                    "cost_basis": kept_value,  # cost basis = FMV at vest for kept shares
                    "sale_year": tranche.get("sale_year"),
                })
                if sell_to_cover > 0:
                    events.append(
                        f"RSU vest: {gross_shares:.0f} shares @ ${projected_price:,.0f} "
                        f"= ${vest_value:,.0f} — sold {withheld_shares:.0f} for tax, "
                        f"kept {kept_shares:.0f} shares"
                    )
                else:
                    events.append(
                        f"RSU vest: {gross_shares:.0f} shares @ ${projected_price:,.0f} "
                        f"= ${vest_value:,.0f} (ordinary income)"
                    )
            else:
                remaining_tranches.append(tranche)
        rsu_st["unvested_tranches"] = remaining_tranches

        # 2. Add annual refresh grant (dollar value → shares at current price)
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

        # 3. Sell any vested lots whose sale_year has arrived
        remaining_lots = []
        for lot in rsu_st["vested_lots"]:
            if lot["sale_year"] and year >= lot["sale_year"]:
                sale_proceeds = lot["shares"] * projected_price
                gains = max(0, sale_proceeds - lot["cost_basis"])
                rsu_cap_gains += gains
                state["liquid_portfolio"] += sale_proceeds
                events.append(
                    f"RSU sale: {lot['shares']:.0f} shares @ ${projected_price:,.0f} "
                    f"= ${sale_proceeds:,.0f} (gains: ${gains:,.0f})"
                )
            else:
                remaining_lots.append(lot)
        rsu_st["vested_lots"] = remaining_lots

        # Track total held RSU value (vested but unsold shares only — unvested are NOT assets)
        rsu_held_value = sum(lot["shares"] for lot in rsu_st["vested_lots"]) * projected_price

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
                # Down payment directly reduces liquid portfolio
                state["liquid_portfolio"] -= down
                large_purchase_cost += down
                events.append(
                    f"Purchase: {purchase['name']} (${purchase['purchase_price']:,.0f}, "
                    f"down ${down:,.0f})"
                )

    # --- Life events (inheritance, windfalls, etc.) ---
    # Combine profile-level windfalls (permanent) with scenario life_events
    life_event_income = 0.0
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
            state["liquid_portfolio"] += net
            life_event_income += net
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
                state["liquid_portfolio"] -= down
                events.append(
                    f"Vehicle purchase: {v.get('name', 'Car')} "
                    f"(${nominal_price:,.0f}, trade-in ${nominal_trade_in:,.0f}, "
                    f"down ${down:,.0f}, loan ${loan_amount:,.0f})"
                )
            else:
                # Cash purchase
                vehicle_cost += net_price
                state["liquid_portfolio"] -= net_price
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

    # --- HELOC payments ---
    heloc_payments = 0.0
    remaining_helocs = []
    for h in state["helocs"]:
        balance = h.get("balance", 0)
        if balance <= 0:
            continue

        rate = h.get("interest_rate_pct", 8.5) / 100
        annual_interest = balance * rate
        monthly_pmt = h.get("monthly_payment", 0)

        # Check if this is a payoff year
        payoff_year = h.get("payoff_year")
        if payoff_year and year >= payoff_year:
            # Pay off remaining balance this year
            heloc_payments += balance + annual_interest
            h["balance"] = 0
            events.append(f"HELOC paid off: {h.get('name', 'HELOC')} (${balance:,.0f})")
            continue

        if h.get("interest_only", False):
            # Interest-only: pay just the interest, balance unchanged
            heloc_payments += annual_interest
        else:
            # Amortizing: apply monthly payments
            annual_pmt = monthly_pmt * 12
            principal_paid = max(0, annual_pmt - annual_interest)
            h["balance"] = max(0, balance - principal_paid)
            heloc_payments += annual_pmt

        if h["balance"] > 0:
            remaining_helocs.append(h)
        else:
            events.append(f"HELOC paid off: {h.get('name', 'HELOC')}")
    state["helocs"] = remaining_helocs

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
        existing_vehicle_loan_payments + heloc_payments +
        living_expenses + property_carrying_costs +
        property_taxes + property_insurance
    )

    # --- Savings contributions (pre-retirement only, per person) ---
    # Route each contribution type to the correct tax-aware pool.
    savings_contributions = 0.0
    trad_contributions = 0.0  # reduces taxable income
    roth_contributions = 0.0
    hsa_contributions = 0.0   # reduces taxable income
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

        # 401k: contribution rate applies to total cash comp (salary + bonus)
        rate = person_savings.get("contribution_rate_pct", 0)
        limit = person_savings.get("irs_401k_limit", 24500)
        if rate > 0:
            total_401k = current_total_comp * rate / 100
            trad_401k = min(total_401k, limit)
            roth_401k = max(0, total_401k - limit)
        else:
            # Fall back to explicit amounts
            trad_401k = person_savings.get("annual_401k_traditional", 0)
            roth_401k = person_savings.get("annual_401k_roth", 0)

        trad_contributions += trad_401k
        roth_contributions += roth_401k

        # IRA
        trad_contributions += person_savings.get("annual_ira_traditional", 0)
        roth_contributions += person_savings.get("annual_ira_roth", 0)

        # HSA (pre-tax deduction, grows tax-free)
        hsa_contributions += person_savings.get("annual_hsa", 0)

        # Additional monthly savings → taxable brokerage
        taxable_contributions += person_savings.get("additional_monthly_savings", 0) * 12

        # Employer match → traditional (always pre-tax)
        match = current_salary * person_savings.get("employer_match_pct", 0) / 100
        trad_contributions += match

    savings_contributions = (
        trad_contributions + roth_contributions
        + hsa_contributions + taxable_contributions
    )

    # --- Investment returns (per pool) ---
    inv_return = 0.0
    for pool_name in ("traditional", "roth", "taxable"):
        pool_return = compute_portfolio_return(
            portfolio_value=state[pool_name],
            year=year,
            retirement_year=retirement_year,
            assumptions=assumptions,
        )
        state[pool_name] += pool_return
        inv_return += pool_return

    # --- Taxes (progressive federal brackets) ---
    tax_cfg = profile.get("tax", {})
    income_tax = 0.0
    cap_gains_tax = 0.0
    niit_amt = 0.0
    effective_tax_rate = 0.0
    marginal_tax_rate = 0.0

    # Withdrawal tracking (retirement only)
    portfolio_withdrawal = 0.0
    withdrawal_from_taxable = 0.0
    withdrawal_from_traditional = 0.0
    withdrawal_from_roth = 0.0

    total_income = gross_income + ss_income + rental_income

    std_ded = standard_deduction(year, gen_inflation, filing_status)

    fica = 0.0
    state_tax = 0.0

    # Count qualifying children for Child Tax Credit (under 17 at end of tax year)
    num_qualifying_children = 0
    for child in state["children"]:
        child_age = year - child.get("birth_year", year)
        if 0 < child_age < 17:
            num_qualifying_children += 1

    if not is_retired:
        # Pre-retirement: progressive brackets on earned income
        # Traditional 401k + IRA + HSA reduce taxable income
        pretax_deductions = trad_contributions + hsa_contributions

        tax_result = compute_year_taxes(
            gross_earned_income=gross_income,
            traditional_deductions=pretax_deductions,
            standard_deduction_amt=std_ded,
            ltcg_income=rsu_cap_gains,
            rental_income=rental_income,
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

        # cash_tax_owed = total tax minus what sell-to-cover already paid.
        # This is what actually comes out of your paycheck / cash flow.
        cash_tax = tax_result["cash_tax_owed"]
        total_expenses += cash_tax

        # Route contributions to correct pools
        state["traditional"] += trad_contributions
        state["roth"] += roth_contributions + hsa_contributions
        state["taxable"] += taxable_contributions
        state["taxable_cost_basis"] += taxable_contributions  # cost basis = what you put in

        # Net surplus after tax and all expenses → taxable brokerage
        net_surplus = total_income - total_expenses
        if net_surplus > 0:
            state["taxable"] += net_surplus
            state["taxable_cost_basis"] += net_surplus  # surplus is after-tax cash
        else:
            # Expenses exceed income — draw from taxable first
            deficit = -net_surplus
            draw = min(deficit, state["taxable"])
            state["taxable"] -= draw
            state["taxable_cost_basis"] = max(0, state["taxable_cost_basis"] - draw)
            deficit -= draw
            if deficit > 0:
                # Then from roth if still short
                draw = min(deficit, state["roth"])
                state["roth"] -= draw
                deficit -= draw
            if deficit > 0:
                # Then from traditional (shouldn't normally happen pre-retirement)
                draw = min(deficit, state["traditional"])
                state["traditional"] -= draw

    else:
        # ── Retirement: withdraw from pools in tax-efficient order ──
        # Order: taxable first (only gains taxed at LTCG), then traditional
        # (taxed as ordinary income), then Roth (tax-free).

        shortfall = total_expenses - ss_income - rental_income
        if shortfall < 0:
            shortfall = 0

        remaining = shortfall

        # Step 1: Withdraw from taxable account
        if remaining > 0 and state["taxable"] > 0:
            draw = min(remaining, state["taxable"])
            withdrawal_from_taxable = draw
            # Compute gains fraction for LTCG
            if state["taxable"] > 0:
                gains_frac = max(0, 1 - state["taxable_cost_basis"] / state["taxable"])
            else:
                gains_frac = 0
            taxable_gains = draw * gains_frac
            # Reduce balance and cost basis proportionally
            if state["taxable"] > 0:
                ratio = draw / state["taxable"]
                state["taxable_cost_basis"] *= (1 - ratio)
            state["taxable"] -= draw
            remaining -= draw

        # Step 2: Withdraw from traditional (gross up for tax)
        if remaining > 0 and state["traditional"] > 0:
            # Estimate tax on traditional withdrawal using marginal rate
            # Iterate to converge on the gross-up amount
            # Base taxable income before traditional withdrawal:
            base_taxable = ss_income * 0.85 + rental_income  # approximate
            _, _, marg = federal_income_tax(
                max(0, base_taxable - std_ded), year, gen_inflation
            )
            marginal = marg / 100
            if marginal >= 1:
                marginal = 0.37
            gross_needed = remaining / (1 - marginal)
            gross_needed = min(gross_needed, state["traditional"])
            withdrawal_from_traditional = gross_needed
            state["traditional"] -= gross_needed
            remaining -= (gross_needed - gross_needed * marginal)
            remaining = max(0, remaining)

        # Step 3: Withdraw from Roth (tax-free)
        if remaining > 0 and state["roth"] > 0:
            draw = min(remaining, state["roth"])
            withdrawal_from_roth = draw
            state["roth"] -= draw
            remaining -= draw

        portfolio_withdrawal = (
            withdrawal_from_taxable + withdrawal_from_traditional
            + withdrawal_from_roth
        )

        # Now compute actual taxes on all retirement income
        taxable_gains = 0.0
        if withdrawal_from_taxable > 0:
            # Approximate gains portion (already computed above)
            taxable_gains = withdrawal_from_taxable * gains_frac if withdrawal_from_taxable > 0 else 0

        tax_result = compute_year_taxes(
            gross_earned_income=0,
            traditional_deductions=0,
            standard_deduction_amt=std_ded,
            ltcg_income=taxable_gains + rsu_cap_gains,
            social_security_income=ss_income,
            rental_income=rental_income,
            traditional_withdrawal=withdrawal_from_traditional,
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
        # No FICA in retirement (no earned income)
        effective_tax_rate = tax_result["effective_rate_pct"]
        marginal_tax_rate = tax_result["marginal_rate_pct"]

        # In retirement, no sell-to-cover, so cash_tax_owed = total_tax
        total_expenses += tax_result["cash_tax_owed"]

        # If SS + rental exceeds expenses + tax, surplus goes to taxable
        net_retirement_income = ss_income + rental_income - total_expenses
        if net_retirement_income > 0 and shortfall == 0:
            state["taxable"] += net_retirement_income
            state["taxable_cost_basis"] += net_retirement_income

    # Sync liquid_portfolio from the three pools
    state["liquid_portfolio"] = (
        state["traditional"] + state["roth"] + state["taxable"]
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

    # --- HELOC debt ---
    heloc_debt = sum(h.get("balance", 0) for h in state["helocs"])

    # --- Net worth ---
    # rsu_held_value = market value of vested (unsold) RSU shares; unvested are excluded
    net_worth = (
        state["liquid_portfolio"] + re_equity + rsu_held_value
        + vehicle_equity - vehicle_loan_debt - heloc_debt
    )
    # Add 529 balances
    for child in state["children"]:
        net_worth += child.get("_529_balance", 0)

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
        "vehicle_costs": round(vehicle_cost + auto_loan_payments + existing_vehicle_loan_payments, 2),
        "heloc_payments": round(heloc_payments, 2),
        "vehicle_equity": round(vehicle_equity, 2),
        "vehicle_loan_debt": round(vehicle_loan_debt, 2),
        "heloc_debt": round(heloc_debt, 2),
        "property_carrying_costs": round(property_carrying_costs, 2),
        "property_taxes": round(property_taxes, 2),
        "property_insurance": round(property_insurance, 2),
        "income_tax": round(income_tax + cap_gains_tax + niit_amt + fica + state_tax, 2),
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
        "net_worth": round(net_worth, 2),
        "liquid_net_worth": round(state["liquid_portfolio"] + rsu_held_value, 2),
        "traditional_balance": round(state["traditional"], 2),
        "roth_balance": round(state["roth"], 2),
        "taxable_balance": round(state["taxable"], 2),
        "real_estate_equity": round(re_equity, 2),
        "events": events,
    }
