# Engine Rework Spec: RMDs, Auditable Output, RSU Simplification

## Problem

The cashflow engine uses three aggregate pools (traditional, roth, taxable). Key gaps:

1. **No RMDs** — traditional balances grow tax-free forever in retirement, overstating net worth
2. **HSA co-mingled with Roth** — loses triple-tax-advantaged status tracking
3. **No audit trail** — can't trace how each year's cash flow is funded
4. **RSU sell-to-cover is overcomplicated** — tracks individual lots when all that matters is 37% disappears and total vest is ordinary income
5. **Withdrawal order ignores RMDs** — always taxable → traditional → roth

## Design Decisions

### Pool architecture with owner sub-pools where required
Pools with per-owner sub-pools where the IRS requires it:

- **traditional_primary** / **traditional_spouse** — pre-tax accounts, separate for RMD computation
- **roth** — aggregate (no RMDs, no owner split needed)
- **taxable** — aggregate (no RMDs)
- **hsa** — separate pool (triple-tax-advantaged, drawn for healthcare)

This gives us 5 tracked balances: `traditional_primary`, `traditional_spouse`, `roth`, `taxable`, `hsa`.

### Windfalls land in taxable brokerage
Simplest correct behavior — windfall proceeds compound at portfolio return rate. Future enhancement: let user choose destination per windfall (invest, pay debt, cash, one-time expense).

## RSU Simplification

### Current (overcomplicated)
Tracks individual vesting lots, sell-to-cover shares, per-lot cost basis, sale year per lot.

### Proposed
At vest each year:
1. **37% of shares sold for tax withholding** (sell-to-cover) — these shares disappear
2. **Total vest value (100% of shares x price) is ordinary income** — taxed via the normal tax engine
3. **Remaining 63% of shares added to held RSU** with cost basis = vest-day price
4. **Held RSU** appreciates at the RSU growth rate until sold
5. **On sale**: proceeds go to taxable pool, gains above cost basis are LTCG

Config fields needed:
- `sell_to_cover_pct`: 37 (default, user-adjustable for different withholding rates)
- `current_price`, `annual_growth_rate_pct`, `vested_shares`, `vested_price`
- `unvested_tranches[]`: shares + vest_year
- `annual_refresh_value`, `refresh_end_year`

No per-lot tracking. Aggregate cost basis on held shares is sufficient.

## Required Minimum Distributions (RMDs)

### Rules (SECURE 2.0 Act)
- **Age 73**: RMDs begin for traditional IRA, traditional 401k, tax_deferred_retirement
- **Roth IRA/401k**: No RMDs during owner's lifetime (assume Roth 401k rolled to Roth IRA)
- **HSA**: No RMDs

### RMD Calculation
```
RMD = prior_year_ending_balance / IRS_life_expectancy_factor(age)
```

IRS Uniform Lifetime Table (key values):
| Age | Factor | Age | Factor |
|-----|--------|-----|--------|
| 73  | 26.5   | 82  | 18.5   |
| 74  | 25.5   | 85  | 16.0   |
| 75  | 24.6   | 90  | 12.2   |
| 76  | 23.7   | 95  | 8.9    |
| 77  | 22.9   | 100 | 6.4    |
| 78  | 22.0   | 105 | 4.6    |
| 79  | 21.1   | 110 | 3.1    |
| 80  | 20.2   | 115 | 2.1    |

### Engine logic
Each year, for each owner where age >= 73:
1. Compute RMD from traditional pool (prior year balance / factor)
2. Withdraw RMD (mandatory — reduces traditional balance)
3. RMD is ordinary taxable income
4. If RMD covers expense shortfall → great, reduces other withdrawals needed
5. If RMD exceeds shortfall → excess goes to taxable pool (reinvested after tax)

### Spouse RMDs
Both primary and spouse have independent RMDs based on their own account balances — the IRS treats them as separate taxpayers. The traditional pool must be split into sub-pools by owner:

- `traditional_primary` — primary's 401k + IRA + tax_deferred_retirement balances
- `traditional_spouse` — spouse's equivalent accounts

Each sub-pool gets its own RMD calculation based on that person's age and balance. Contributions route to the correct sub-pool via the `owner` field on each asset. Roth and taxable don't need this split (no RMDs). HSA is inherently per-person.

## Withdrawal Order in Retirement (revised)

Each year after retirement:

1. **Income sources**: Social Security + rental income
2. **RMDs** (mandatory): Computed and withdrawn from traditional. Taxed as ordinary income.
3. **Shortfall** = total_expenses + taxes - income - RMD_after_tax
4. **If shortfall > 0**, fund from:
   a. **Taxable** — gains portion taxed as LTCG
   b. **Traditional** (voluntary, above RMD) — taxed as ordinary
   c. **Roth** — tax-free, last resort
5. **HSA** drawn specifically for healthcare expenses (tax-free)
6. **If RMDs + income > expenses**: excess after tax → taxable pool

## Auditable Cash Flow Waterfall (new output)

Each yearly row adds a `cash_flow` object:

```python
"cash_flow": {
    # Inflows
    "earned_income": 0,
    "social_security": 21600,
    "rental_income": 0,
    "rmd_gross": 45000,
    "rmd_tax": 10800,
    "rmd_net": 34200,
    "windfall_gross": 0,
    "windfall_net": 0,
    "rsu_vest_income": 0,
    
    # Outflows
    "living_expenses": 340000,
    "healthcare": 72000,
    "mortgage": 36000,
    "college": 0,
    "vehicle": 0,
    "debt_payments": 0,
    "property_costs": 12000,
    "total_expenses": 460000,
    
    # Tax
    "federal_income_tax": 12000,
    "state_tax": 0,
    "fica": 0,
    "ltcg_tax": 5000,
    "niit": 0,
    "total_tax": 17000,
    
    # Portfolio withdrawals to cover shortfall
    "shortfall": 422800,
    "from_taxable": 300000,
    "from_traditional": 122800,
    "from_roth": 0,
    "from_hsa_medical": 72000,
    
    # Investment returns (per pool)
    "returns_traditional_primary": 100000,
    "returns_traditional_spouse": 50000,
    "returns_roth": 120000,
    "returns_taxable": 80000,
    "returns_hsa": 5000,
    
    # RMDs (per owner)
    "rmd_primary": 45000,
    "rmd_spouse": 0,
    
    # End-of-year balances
    "balance_traditional_primary": 1800000,
    "balance_traditional_spouse": 700000,
    "balance_roth": 1800000,
    "balance_taxable": 900000,
    "balance_hsa": 50000,
}
```

## Implementation Plan

### Phase 1: Split pools + HSA + RMD table
- Split `state["traditional"]` into `state["traditional_primary"]` and `state["traditional_spouse"]`
- Add `state["hsa"]` as separate pool (currently lumped in roth)
- Route contributions and asset balances by owner using `assets.yaml` owner field
- Add IRS Uniform Lifetime Table as a dict in new `backend/engine/rmd.py`
- Compute RMDs per year for primary and spouse independently

### Phase 2: Rework withdrawal sequencing
- RMDs computed first (mandatory)
- RMD after-tax proceeds applied to expense shortfall
- Remaining shortfall funded: taxable → traditional → roth
- HSA drawn for healthcare costs specifically
- Excess RMDs reinvested to taxable

### Phase 3: RSU simplification
- Replace lot-tracking with simple: 37% sell-to-cover, 100% taxed as income, 63% held
- Aggregate cost basis on held shares
- Sale triggers LTCG on gains

### Phase 4: Auditable output
- Add `cash_flow` waterfall to yearly output
- Preserve all existing aggregate fields for backward compat

## Files to modify
- `backend/engine/cashflow.py` — major rework: HSA pool, RMDs, withdrawal order, waterfall output
- `backend/engine/rmd.py` — new file: IRS table + RMD computation
- `backend/models/simulation.py` — add cash_flow output type
- `frontend/src/types/simulation.ts` — mirror new types (later, for audit UI)

## NOT in scope (v2)
- Roth conversion ladder
- Tax-loss harvesting
- Per-lot cost basis in taxable
- Per-account tracking (instead of pools)
- Windfall destination choices
- HSA medical vs non-medical split (treat all HSA draws as medical/tax-free for now)
