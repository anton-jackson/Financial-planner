# UI Restructure Spec — Data Entry / Analysis Split

## Problem

The current sidebar is a flat list of pages with no clear organization. Users can't tell which pages are for entering data and which are for viewing results. Specific issues:

- "Assets & Liabilities" is a catch-all page mixing investment accounts, real estate, vehicles, and HELOCs
- Investment accounts and Portfolio Holdings are two separate pages for one concept (create account on Assets, enter tickers on Holdings)
- HELOCs are the only debt type supported — no credit cards, student loans, personal loans
- "Basic Finances" is vague — it's income, savings, and expenses
- No visual grouping in the sidebar

## Proposed Structure

### Sidebar

```
── YOUR DATA ──────────────────
Profile
Income & Savings
Investment Accounts
Property
Vehicles
Debt
Windfalls

── ANALYSIS ───────────────────
Dashboard
Retirement
Planning
Scenarios
Simulation
How It Works

── (pinned bottom) ────────────
AI Advisor
```

### Page-by-Page Spec

#### Profile (unchanged)
`/profile` — Personal info, spouse, children. No changes needed.

#### Income & Savings (rename from "Basic Finances")
`/income` — Income, savings rates, expenses, tax config.
- Rename route from `/finances` to `/income`
- Rename sidebar label from "Basic Finances" to "Income & Savings"
- Content unchanged — income, RSU, savings, expenses, tax sections

#### Investment Accounts (merge Assets accounts + Holdings)
`/accounts` — One page for all investment accounts and their holdings.

**Current state:**
- Assets page: create account (type + balance)
- Holdings page: enter tickers per account
- User must visit two pages, and Holdings only works if accounts exist on Assets

**New design:**
- Single page showing all investment accounts
- Each account is a card with: name, type, total balance
- Click to expand an account → shows holdings table (tickers, shares, price, value)
- "Add Holding" button inside expanded account
- If no holdings entered, balance is manual entry (current behavior)
- If holdings are entered, balance auto-calculates from sum of holdings
- Account types: traditional_401k, roth_401k, traditional_ira, roth_ira, hsa, taxable_brokerage, 529, crypto, other
- "Add Account" button with click-to-toggle dropdown (already fixed)
- Rebalance calculator section at bottom (moved from Holdings page)

**Data model:** No backend changes needed. `assets.yaml` holds accounts with balances, `holdings.yaml` holds per-account tickers. The merge is purely frontend — one page reads from both.

**Migration:** Delete `HoldingsPage.tsx`. Move its holdings table component and rebalance section into the new `AccountsPage.tsx`. Remove `/holdings` route.

#### Property (split from Assets)
`/property` — Real estate: primary residence, rental properties, second homes.

- Each property is a card with: name, value, mortgage details, property tax, insurance, carrying costs, appreciation rate, rental toggle
- Mortgage lives with the property (not as a separate debt)
- "Add Property" button
- Show equity summary (value minus mortgage)
- This is the real estate cards currently on the Assets page, extracted into their own page

**Data model:** No changes. Properties are already `type: "real_estate"` in `assets.yaml` with mortgage info in `properties`.

#### Vehicles (unchanged)
`/vehicles` — Current vehicles and planned purchases. Already has its own section on the Assets page. Extract to standalone page.

**Data model:** No changes. `existing_vehicles` and `vehicles` already on the profile.

#### Debt (generalize from HELOCs)
`/debt` — All non-mortgage debt: HELOCs, credit cards, personal loans, student loans, medical debt.

**Current state:** Only HELOCs are supported as a model.

**New design:**
- Each debt is a card with: name, type, balance, interest rate, monthly payment, payoff target year
- Debt types: `heloc`, `personal_loc`, `credit_card`, `student_loan`, `medical`, `other`
- Interest-only toggle (currently HELOC-only, useful for LOCs too)
- "Add Debt" button with type selector
- Summary at top: total debt, weighted average rate, total monthly payments

**Backend model change:**
```python
class Debt(BaseModel):
    """Any non-mortgage debt."""
    name: str = ""
    type: str = "other"  # heloc, personal_loc, credit_card, student_loan, medical, other
    balance: float = 0
    interest_rate_pct: float = 0
    monthly_payment: float = 0
    interest_only: bool = False
    payoff_year: int | None = None
    credit_limit: float = 0  # for revolving debt (HELOC, LOC, credit card)
```

Replace `helocs: list[HELOC]` with `debts: list[Debt]` on the Profile model.

**Engine change:** The cashflow engine currently processes HELOCs. Generalize to process all debts the same way — monthly payment reduces liquid portfolio, interest accrues on balance. The math is identical; only the field names change.

**Migration:** Existing `helocs` in profile.yaml need to be converted to `debts` with `type: "heloc"`. Add a migration function that runs on profile load if `helocs` key exists but `debts` doesn't.

#### Windfalls (unchanged)
`/windfalls` — One-time and recurring cash events. No changes needed.

#### Dashboard (unchanged)
`/` — Baseline snapshot with net worth trajectory and Monte Carlo bands.

#### Retirement (unchanged)
`/retirement` — Asset pool breakdown by tax character.

#### Planning (unchanged)
`/planning` — 2D parameter sweep matrix.

#### Scenarios (unchanged)
`/scenarios` — Market assumptions, large purchases, life events.

#### Simulation (unchanged)
`/simulation` — Multi-scenario comparison charts.

#### How It Works (unchanged)
`/how-it-works` — Calculation explanations.

---

## Sidebar Implementation

### Section headers
Add non-clickable section labels in the sidebar:

```tsx
const DATA_LINKS = [
  { to: "/profile", label: "Profile", icon: User },
  { to: "/income", label: "Income & Savings", icon: DollarSign },
  { to: "/accounts", label: "Investment Accounts", icon: Wallet },
  { to: "/property", label: "Property", icon: Home },
  { to: "/vehicles", label: "Vehicles", icon: Car },
  { to: "/debt", label: "Debt", icon: CreditCard },
  { to: "/windfalls", label: "Windfalls", icon: Gift },
];

const ANALYSIS_LINKS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/retirement", label: "Retirement", icon: PiggyBank },
  { to: "/planning", label: "Planning", icon: Target },
  { to: "/scenarios", label: "Scenarios", icon: Layers },
  { to: "/simulation", label: "Run Simulation", icon: Play },
  { to: "/how-it-works", label: "How It Works", icon: HelpCircle },
];
```

Render with section headers:
```tsx
<p className="text-xs text-slate-500 px-3 pt-4 pb-1">YOUR DATA</p>
{DATA_LINKS.map(...)}
<p className="text-xs text-slate-500 px-3 pt-4 pb-1">ANALYSIS</p>
{ANALYSIS_LINKS.map(...)}
```

---

## Files to Create / Modify / Delete

### Create
- `frontend/src/pages/AccountsPage.tsx` — merged investment accounts + holdings
- `frontend/src/pages/PropertyPage.tsx` — real estate extracted from Assets
- `frontend/src/pages/VehiclesPage.tsx` — vehicles extracted from Assets (or keep inline)
- `frontend/src/pages/DebtPage.tsx` — generalized from HELOCs

### Modify
- `frontend/src/components/layout/Sidebar.tsx` — section headers, new routes
- `frontend/src/App.tsx` — new routes, remove old ones
- `frontend/src/pages/BasicFinancesPage.tsx` — rename to IncomePage or keep file, change route
- `backend/models/profile.py` — add `Debt` model, replace `helocs`
- `backend/engine/cashflow.py` — generalize HELOC processing to debt
- `frontend/src/types/profile.ts` — add `Debt` type, replace `HELOC`
- `frontend/src/pages/OnboardingWizard.tsx` — update to use new debt model

### Delete
- `frontend/src/pages/HoldingsPage.tsx` — merged into AccountsPage
- `frontend/src/pages/AssetsPage.tsx` — split into AccountsPage + PropertyPage

---

## Migration / Backward Compatibility

### Profile data
Old profiles have `helocs: [...]`. New profiles will have `debts: [...]`.

Add a migration in the profile loading path:
```python
def _migrate_profile(data: dict) -> dict:
    if "helocs" in data and "debts" not in data:
        data["debts"] = [
            {**h, "type": "heloc"} for h in data["helocs"]
        ]
        del data["helocs"]
    return data
```

Run this in the profile GET endpoint before returning data.

### Assets data
No changes to assets.yaml schema. The split is purely frontend routing.

### Holdings data
No changes to holdings.yaml. AccountsPage reads from both assets.yaml and holdings.yaml.

---

## Onboarding Wizard Updates

The wizard currently has 5 steps. The restructure doesn't change the steps — the wizard is about quick data entry, not page organization. But the "What You Have" step should be aware of the new debt types:

Step 4 could add an optional "Any debt?" subsection:
- Credit card balance
- Student loan balance
- Other debt

These create `Debt` entries in the profile alongside the investment account balances.

---

## Order of Implementation

1. **Backend first** — Debt model, profile migration, engine generalization
2. **Sidebar** — Section headers, new route structure
3. **AccountsPage** — Merge accounts + holdings
4. **PropertyPage** — Extract from Assets
5. **DebtPage** — New page with generalized debt model
6. **VehiclesPage** — Extract from Assets (or keep as section in a combined page)
7. **Cleanup** — Delete old pages, update onboarding wizard
8. **Test** — Run through complete flow with real data

Each step is independently deployable. The sidebar can show both old and new routes during transition.
