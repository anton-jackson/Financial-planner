# Money Logic: Expenses, Income, and the Year-1 Reconciliation

This doc captures the data-entry rules around expenses and income, and
describes the live Year-1 reconciliation check that surfaces data-entry
errors before they silently drain the projected portfolio.

## The residual bucket: `Expenses.annual_base`

`Expenses.annual_base` (backend `backend/models/profile.py`, frontend
`Expenses` type) is a **residual bucket**: everything not modeled elsewhere.
It is in today's dollars.

### Do NOT include

Each of the following is modeled separately and double-counting here will
inflate projected expenses:

| Category | Where it lives |
| --- | --- |
| Mortgage P&I, property tax, insurance, carrying costs | `assets[].properties` on real estate assets |
| Tuition & 529 contributions | `profile.children[].current_school`, `school_stages`, `plan_529_*`; scenario `college` |
| Healthcare premiums & out-of-pocket | `profile.healthcare_override` (optional) + scenario `healthcare` |
| Debt payments | `profile.debts[].monthly_payment` |
| Existing vehicle loans | `profile.existing_vehicles[].monthly_payment` |
| Future vehicle purchases | `profile.vehicles[]` |
| Retirement, HSA, IRA contributions | `profile.savings.*` |
| Income and payroll taxes | Computed by `backend/engine/tax.py` |

### Do include

Food, utilities, non-auto transport, non-health insurance, travel,
subscriptions & entertainment, personal care, household goods, and anything
else that doesn't fit a category above.

### Per-child cost

`Expenses.per_child_annual` is **added on top** of `annual_base`, not
included in it. It drops off when each child finishes college if
`children_leave_after_college` is true.

## Healthcare override

`Profile.healthcare_override` (optional) lets the user enter their current
premium and out-of-pocket costs. Semantics:

- **Pre-retirement**: override values substitute for scenario
  `annual_premium_today` / `annual_out_of_pocket_today`.
- **Pre-Medicare gap (retirement to age 65)**: scenario `aca_marketplace_annual`.
- **Medicare (age 65+)**: scenario `medicare_annual`.
- **Unset fields** fall back to the scenario default component-by-component.

The merge happens in `backend/engine/cashflow.py` at the healthcare call
site; `backend/engine/healthcare.py` itself is unchanged and simply receives
the merged dict.

## Year-1 reconciliation panel

`frontend/src/components/shared/ReconciliationPanel.tsx` renders a live
waterfall on `BasicFinancesPage`:

```
+ Gross income (salary + bonus + year-1 RSU vest)
− Estimated taxes (federal + state + FICA — approximate)
− Healthcare (override or scenario default)
− Retirement & HSA contributions
− Mortgage & property costs
− Debt service
− Auto loans
− Current tuition
− Other annual living expenses
= Discretionary surplus / (deficit)
```

The panel is collapsed by default behind a "Show" affordance. When the
discretionary line is negative, the panel shows a red warning explaining
that the plan is structurally underfunded before any simulation runs.

### Approximations

The panel uses a simplified tax estimator in
`frontend/src/lib/taxEstimate.ts`:

- 2026 federal brackets and standard deduction, mirrored from
  `backend/engine/tax.py:24-58`.
- FICA = Social Security (capped) + Medicare.
- State tax: the user's `state_income_tax_pct` override when > 0, else a
  flat/effective-rate lookup covering common states, else 5%.

This is a **sanity check**, not a projection. The backend engine is the
source of truth for all real numbers.

## Non-goals (deferred)

- **Category-level expense breakdown** (`ExpenseDetails` with food,
  utilities, etc.). Purely additive — an optional Pydantic field with a
  `None` default can be dropped into `Expenses` when a real use case exists
  (e.g., scenario-based category step changes). No migration required
  because storage is YAML.
- **Engine-side ruin/depletion detection**. The engine currently floors
  `liquid_portfolio` at 0 (`cashflow.py`) and continues. A future pass
  should return a first-year-of-depletion flag on `YearRow` or on the
  top-level `DeterministicResult`.
- **Scenario-level expense step changes** (e.g., "cut $200/mo in
  subscriptions starting 2030"). Blocked on the category hook above.
