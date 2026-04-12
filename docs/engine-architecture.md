## Overview

The simulation engine projects a household's finances year by year from the current year through end of life. Each year is a pure function of state plus config: the prior year's ending balances combined with income, expenses, returns, and tax rules produce the next year's state and a `YearRow` output.

The engine is deterministic by default (`project_cashflows`) and wrapped by a Monte Carlo layer (`run_monte_carlo`) that samples market returns and inflation per trial.

**Design principles:**
- **No mutation across function calls.** State is threaded through `_project_year` and returned; the caller keeps the reference.
- **Per-module responsibility.** Tax, mortgage, social security, healthcare, college, RSU, RMD each live in a focused module. `cashflow.py` is the orchestrator.
- **Pool-based accounting.** All liquid assets collapse into five tax-aware pools (see below) — no per-account tracking beyond what the IRS requires.
- **Outputs are inspectable.** Every year's `YearRow` carries a `cash_flow` waterfall that reconciles inflows, outflows, tax, and portfolio moves.

---

## Module Map

```
backend/engine/
  cashflow.py         Orchestrator. _init_state + _project_year + project_cashflows.
  rmd.py              IRS Uniform Lifetime Table + compute_rmd (SECURE 2.0, age 73+).
  tax.py              Federal brackets (MFJ/single/hoh), LTCG, NIIT, FICA, state
                      tax (flat + progressive), CTC, SS taxability, standard deduction.
  investment.py       Portfolio return with glide-path allocation (stocks/bonds/cash).
  mortgage.py         Monthly payment, annual amortization, rental P&L.
  social_security.py  Benefit at claiming age, COLA.
  healthcare.py       Three-phase cost (employer → ACA → Medicare).
  college.py          Per-child tuition + 529 drawdown and growth.
  inflation.py        real_to_nominal / inflate / deflate helpers.
  monte_carlo.py      Wraps project_cashflows with sampled returns and inflation.
  rebalance.py        Portfolio rebalancing utilities.
  market_data.py      Reference returns/vol loaded from external tables.
```

---

## Pool Model

The engine tracks five liquid pools. The split exists only where tax rules require it — notably RMDs force per-owner traditional sub-pools because the IRS treats spouses as separate taxpayers.

| Pool                  | What's in it                                         | Tax on withdrawal     | RMDs? |
|-----------------------|------------------------------------------------------|-----------------------|-------|
| `traditional_primary` | Primary's 401(k), IRA, tax-deferred retirement       | Ordinary income       | Yes (age 73+) |
| `traditional_spouse`  | Spouse's equivalent accounts                         | Ordinary income       | Yes (age 73+) |
| `roth`                | Roth IRA + Roth 401(k), both spouses                 | None                  | No    |
| `taxable`             | Brokerage, crypto — tracks aggregate cost basis      | LTCG on gains portion | No    |
| `hsa`                 | HSA balance                                          | None if medical       | No    |

Initial balances route from `assets.yaml` by the `owner` field on each asset. Roth and taxable aggregate across owners since nothing in the tax code cares which spouse's Roth it is.

The `taxable` pool separately tracks `taxable_cost_basis`; on withdrawal, `gains_fraction = 1 - cost_basis/balance` determines the LTCG portion.

For RMD computation, the engine also snapshots `prior_traditional_primary` / `prior_traditional_spouse` — the previous year's ending balance, per IRS rules.

---

## Yearly Projection Flow

`_project_year` runs this sequence, in order, every year:

```
1.  Income
    ├─ Primary + spouse salary/bonus (inflated; zero after each person's retirement)
    ├─ RSU: price step, process vests (37% sell-to-cover, 100% ordinary income,
    │       63% added to aggregate held position), add refresh grant, process sale
    └─ Social Security (if past claiming age) + rental income

2.  Fixed outflows
    ├─ College costs (tuition + room/board minus 529, aid, scholarship)
    ├─ 529 balance growth
    ├─ Mortgage amortization (primary + rental + additional from purchases)
    ├─ Property costs (tax, insurance, carrying for non-rentals)
    ├─ Healthcare (three phases by age/retirement status)
    ├─ Large purchases (down payment → taxable, new mortgage added)
    ├─ Windfalls / life events (net after tax → taxable)
    ├─ Vehicle purchases + auto loans + existing vehicle depreciation
    ├─ Debt payments (HELOCs, cards, student loans)
    └─ Living expenses (inflated, per-child adjustment, retirement reduction)

3.  Savings contributions (pre-retirement only, per-person)
    └─ Routed: traditional_{primary,spouse}, roth, hsa, taxable

4.  Investment returns (per pool, with glide-path allocation)

5.  RMDs
    ├─ rmd_primary = prior_traditional_primary / factor(age_primary)   if age ≥ 73
    └─ rmd_spouse  = prior_traditional_spouse  / factor(age_spouse)    if age ≥ 73
    → Withdrawn from the respective sub-pool; counted as ordinary income.

6.  Tax + withdrawal sequencing  (diverges on retirement status — see below)

7.  Snapshot ending traditional sub-pool balances as next year's priors.

8.  Real estate appreciation, vehicle/debt equity rollup, net worth.

9.  Emit YearRow (including the cash_flow waterfall).
```

### Pre-retirement

1. HSA is drawn (tax-free) up to `healthcare_cost`.
2. `compute_year_taxes(...)` runs with:
   - `gross_earned_income = salary + bonus + rsu_vest_income`
   - `traditional_deductions = trad_contribs + hsa_contribs`
   - `traditional_withdrawal = rmd_total` (RMDs add ordinary income)
   - `ltcg_income = rsu_cap_gains`
   - `rsu_vest_tax_covered` credits the sell-to-cover withholding.
3. `cash_tax_owed` is added to `total_expenses`.
4. Contributions routed to pools. Taxable contribs also update `taxable_cost_basis`.
5. Net surplus `(earned + SS + rental + RMD + HSA medical) - total_expenses`:
   - Positive → into `taxable` (with cost basis).
   - Negative → deficit funded `taxable` → `roth` → traditional (proportionally split).

### Retirement

1. HSA drawn for healthcare (tax-free).
2. `shortfall = total_expenses - ss - rental - rmd_total - hsa_draw` (pre-tax).
3. Shortfall funded in order:
   - **Taxable** — LTCG on `gains_fraction × draw`; cost basis reduced proportionally.
   - **Voluntary traditional** — grossed up for tax using current marginal rate; split proportionally across `traditional_primary` / `traditional_spouse`.
   - **Roth** — tax-free, last resort.
4. `compute_year_taxes(...)` runs with `traditional_withdrawal = rmd_total + voluntary_trad`, `ltcg_income = taxable_gains + rsu_cap_gains`, plus SS + rental.
5. `cash_tax_owed` added to `total_expenses`. No FICA (no earned income).
6. If income + RMD exceeded expenses (no shortfall), the excess lands in `taxable`.

---

## RSU Model (Simplified)

One aggregate held position — `held_shares`, `held_cost_basis`, optional `held_sale_year` — instead of per-lot tracking.

**On vest:**
1. Price updates via glide from `initial_growth_pct` to `long_term_growth_pct` over `transition_years`.
2. Full gross vest value (`shares × price`) is ordinary income.
3. `sell_to_cover_pct` (default 37%) of shares disappear — withheld for tax.
4. Remaining `(1 - sell_to_cover_pct)` shares join the held position; their FMV at vest is added to the aggregate cost basis.

**On sale:** when `year ≥ held_sale_year`, the entire held position sells at current price. Proceeds land in `taxable`; gains above aggregate cost basis are LTCG in `rsu_cap_gains`.

**Refresh grants:** while working and within `refresh_end_year`, a new unvested tranche of `refresh_value / current_price` shares is appended, vesting the following year.

Trade-off (explicit in the spec): first tranche-specified `sale_year` wins for the aggregate. Per-lot staggered sales aren't modeled.

---

## RMD Module

`backend/engine/rmd.py` implements the IRS Uniform Lifetime Table (SECURE 2.0, start age 73) and a single function:

```python
def compute_rmd(prior_year_balance: float, age: int) -> float:
    """Returns 0 when age < 73 or balance ≤ 0; else balance / factor(age).
    Beyond the tabulated max age, reuses the oldest published factor."""
```

Selected factors: 73 → 26.5, 80 → 20.2, 85 → 16.0, 90 → 12.2, 100 → 6.4.

Primary and spouse RMDs are computed independently from their own `prior_traditional_*` snapshot. Each is capped at the current sub-pool balance (can't withdraw more than is there) before being deducted.

---

## Tax Engine Integration

`engine/tax.py` is stateless — every call passes in the year's inputs and receives a dict of tax components. `cashflow.py` calls it once per year, packaging RMDs and voluntary traditional withdrawals into `traditional_withdrawal`.

Modeled:
- **Federal income tax** — 2026 progressive brackets (MFJ / single / hoh), inflation-adjusted each year.
- **LTCG** — 0/15/20% brackets stacked on ordinary income.
- **NIIT** — 3.8% on investment income above MAGI threshold.
- **FICA** — SS (6.2% to wage cap) + Medicare (1.45%) + additional Medicare (0.9%).
- **State income tax** — no-tax, flat-rate, and progressive states (CA, NY, NJ, MN, OR, HI). Manual override via `tax.state_income_tax_pct`.
- **Social Security taxability** — 0%/50%/85% based on combined-income thresholds.
- **Standard deduction** — inflation-adjusted per filing status.
- **Child Tax Credit** — $2,000 per qualifying child under 17, phaseout above threshold.
- **RSU sell-to-cover credit** — `cash_tax_owed = total_tax - rsu_vest_tax_covered`.

Not modeled: AMT, itemized deductions beyond standard, Roth conversion ladders, tax-loss harvesting.

---

## `cash_flow` Waterfall

Each `YearRow` carries a `cash_flow` object that reconciles the year:

```python
cash_flow: {
    # Inflows
    earned_income, rsu_vest_income, social_security, rental_income,
    rmd_gross, rmd_tax, rmd_net, rmd_primary, rmd_spouse,
    windfall_gross, windfall_net,

    # Outflows
    living_expenses, healthcare, mortgage, college, vehicle,
    debt_payments, property_costs, large_purchase, total_expenses,

    # Tax
    federal_income_tax, state_tax, fica, ltcg_tax, niit, total_tax,

    # Portfolio withdrawals
    from_taxable, from_traditional, from_roth, from_hsa_medical,

    # Returns per pool
    returns_traditional_primary, returns_traditional_spouse,
    returns_roth, returns_taxable, returns_hsa,

    # End-of-year balances
    balance_traditional_primary, balance_traditional_spouse,
    balance_roth, balance_taxable, balance_hsa,
}
```

Existing aggregate fields on `YearRow` (`traditional_balance`, `roth_balance`, `taxable_balance`, etc.) are preserved for back-compat; new splits (`traditional_primary_balance`, `traditional_spouse_balance`, `hsa_balance`) sit alongside them.

---

## Monte Carlo Layer

`engine/monte_carlo.py`:
1. Pre-generates `(num_trials, num_years)` arrays of stock/bond returns and inflation via `numpy.random.default_rng`.
2. For each trial, deep-copies the scenario, replaces the mean-return assumptions for that year with sampled values, and calls `project_cashflows`.
3. Collects net worth, liquid net worth, and annual spending capacity per trial, computes percentile bands (p10/p25/p50/p75/p90), success rate, probability of ruin, and years-of-runway.

Everything downstream runs through the same deterministic engine — no duplicate tax/withdrawal logic.

---

## Invariants

- `state["liquid_portfolio"] == traditional_primary + traditional_spouse + roth + taxable + hsa` (re-synced at the end of every year).
- Ending `traditional_primary` and `traditional_spouse` become next year's `prior_traditional_*`.
- `taxable_cost_basis ≤ taxable` at all times (clamped on proportional drawdowns).
- Contributions only happen pre-retirement for the corresponding person (primary and spouse retire independently).
- Each owner's RMD is capped at their sub-pool balance.

---

## Adding a New Module

1. Create `backend/engine/<name>.py` with pure functions — no globals, take data in, return data out.
2. Import and call from `cashflow._project_year` in the right phase of the flow above.
3. Add any new state keys to `_init_state`'s return dict.
4. Extend `YearRow` in `backend/models/simulation.py` with any new emitted fields (use defaults to keep back-compat).
5. Mirror new types in `frontend/src/types/simulation.ts` if the UI needs them.
6. Add unit tests in `backend/tests/test_engine.py`.

---

## See Also

- `docs/engine-rework-spec.md` — design doc for the RMD / owner sub-pool / waterfall rework that produced the current architecture.
- `docs/agent-architecture.md` — how the AI agent calls into this engine via read-only tool invocations.
- `docs/feature-backlog.md` — planned extensions (Roth conversion ladders, per-lot basis, tax-loss harvesting).
