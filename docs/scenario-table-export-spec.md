# Scenario Run Detail Table — Plan & Spec

**Status:** Draft
**Branch:** `claude/enhance-scenario-table-BXTYK`
**Related code:**
- `backend/models/simulation.py` (`YearRow`, `CashFlowWaterfall`, `DeterministicResult`, `MonteCarloResult`)
- `backend/api/simulation.py` (run endpoints, result persistence)
- `frontend/src/pages/SimulationPage.tsx` (`YearlyTable`, ~line 268)
- `frontend/src/types/simulation.ts`
- `backend/agent/tools.py`, `backend/agent/executor.py` (existing agent toolbelt)

## 1. Motivation

Today a scenario run renders as a 7-column summary table (Year, Age, Income,
Expenses, Investment Returns, Net Worth, Events). The engine already computes
~40+ per-year fields plus a `CashFlowWaterfall`, but only a thin slice is
surfaced.

The goal is to make a scenario run **self-describing and portable**: a user
should be able to take the run's output, paste or upload it into any capable
LLM, and immediately be able to ask "what if we delayed retirement two years?"
or "why does net worth dip in 2041?" with zero additional context.

That means the table has to carry:
1. Enough dimensional breakdown that most natural questions can be answered
   without re-running the sim.
2. Enough metadata (scenario assumptions, run id, profile snapshot, schema
   version) that the numbers are interpretable standalone.
3. A format an LLM can parse cheaply — structured, compact, consistent units.

The primary deliverable is the **raw data contract**. Delivery surfaces
(in-app agent, copy/download/share) are secondary.

## 2. Primary: The Detailed Table

### 2.1 Shape

Output is a **single logical artifact** — a "ScenarioRunBundle" — that
consists of three sections:

```
ScenarioRunBundle
├── header          (1 object)   run + scenario + profile metadata
├── assumptions     (1 object)   all inputs that drove the run
└── yearly          (N rows)     one row per simulated year, wide format
```

All three ship together because the yearly grid is meaningless without
the assumptions, and useless for agent Q&A without the header identifiers.

### 2.2 Yearly Row — Column Specification

Columns are grouped so humans can scan and agents can pattern-match. All
monetary fields are **nominal USD** end-of-year unless a field name says
otherwise. Rates are decimal (0.22, not 22). Years are calendar years.

The column set is a strict superset of today's `YearRow` + `CashFlowWaterfall`,
reorganized and with a few derived fields added.

**A. Identity (4)**
- `year` — calendar year (int)
- `age_primary`, `age_spouse` — ages at year end
- `phase` — `accumulation | transition | retirement | legacy` (derived from
  retirement age + life expectancy boundaries)

**B. Income — gross (6)**
- `income_wages_primary`, `income_wages_spouse`
- `income_rsu_vest` — taxable RSU vest value
- `income_social_security` — gross SS before tax
- `income_rental_net` — net rental (after property carrying costs)
- `income_other` — windfalls, inheritances, misc

**C. RMDs & Mandatory Distributions (3)**
- `rmd_primary`, `rmd_spouse`
- `rmd_tax_withheld`

**D. Expenses — detail (9)**
- `expense_living`, `expense_healthcare`, `expense_mortgage`,
  `expense_property_carry` (taxes + insurance + maintenance),
  `expense_college`, `expense_vehicle`, `expense_debt_service`,
  `expense_large_purchase`, `expense_total`

**E. Taxes (9)**
- `tax_federal_income`, `tax_state`, `tax_fica`, `tax_ltcg`, `tax_niit`,
  `tax_rsu_cap_gains`, `tax_total`
- `tax_effective_rate` (total_tax / taxable_income_realized)
- `tax_marginal_rate` (federal marginal bracket hit)

**F. Savings & Contributions (5)** — currently under-exposed
- `contrib_traditional_401k`, `contrib_roth_401k_or_ira`,
  `contrib_hsa`, `contrib_taxable`, `contrib_employer_match`

**G. Withdrawals — waterfall (4)**
- `withdraw_from_taxable`, `withdraw_from_traditional`,
  `withdraw_from_roth`, `withdraw_from_hsa`

**H. Portfolio Returns (6)**
- `return_taxable`, `return_traditional_primary`, `return_traditional_spouse`,
  `return_roth`, `return_hsa`, `return_total_investment` (sum)

**I. Balances — end of year (10)**
- `bal_taxable`, `bal_traditional_primary`, `bal_traditional_spouse`,
  `bal_traditional_total`, `bal_roth`, `bal_hsa`, `bal_529`,
  `bal_real_estate_equity`, `bal_vehicle_equity`, `bal_cash` (if tracked)

**J. Debts — end of year (3)**
- `debt_mortgage`, `debt_vehicle_loan`, `debt_other`

**K. Aggregates & Derived (8)** — pre-computed so the agent doesn't have to
- `net_worth_total`, `net_worth_liquid`, `net_worth_investable`
- `cash_flow_net` (inflows − outflows − taxes − contributions +
  withdrawals; should ≈ 0 in solvent years)
- `savings_rate` (contribs / gross_income)
- `withdrawal_rate` (portfolio_withdrawals / prior-year investable NW)
- `asset_allocation_stocks_pct`, `asset_allocation_bonds_pct` (applied that
  year per glide path)

**L. Narrative (1)**
- `events` — `string[]` of notable triggers ("Primary retires", "College
  starts — child 1", "Mortgage paid off", "Large purchase: kitchen reno
  $80k", "SS claim — primary"). This is the column the LLM quotes back.

**Total: ~68 columns.** Big, but each value is cheap and the wide layout is
exactly what an LLM wants — no pivot math required to answer "show me tax
drag in retirement".

### 2.3 Monte Carlo: Additional Rows, Same Shape

For MC runs, we keep the single-row-per-year shape but **stack percentiles**:

```
year | percentile | age_primary | income_wages_primary | ... | net_worth_total
2041 | p10        | 62          | 0                    | ... | 1_240_000
2041 | p50        | 62          | 0                    | ... | 2_115_000
2041 | p90        | 62          | 0                    | ... | 3_480_000
```

Plus a separate top-level `mc_summary` object: `success_rate`,
`probability_of_ruin`, `median_terminal_net_worth`, `num_trials`,
`years_of_runway_p50`.

This keeps one schema for both deterministic and MC (deterministic just has
`percentile = "mean"`), which simplifies both the frontend renderer and
downstream agent parsing.

### 2.4 Header & Assumptions Metadata

**`header`** (once per bundle):
```json
{
  "schema_version": 2,
  "run_id": "...",
  "run_type": "deterministic | monte_carlo",
  "timestamp": "2026-04-12T14:22:00Z",
  "scenario_name": "Retire @ 62",
  "start_year": 2026,
  "end_year": 2065,
  "profile_snapshot": {
    "primary_age": 47, "spouse_age": 45,
    "state": "CA", "filing_status": "mfj",
    "retirement_age_primary": 62, "retirement_age_spouse": 60,
    "life_expectancy": 92
  },
  "engine_version": "x.y.z",
  "column_dictionary_url": "/docs/scenario-table-columns.md"
}
```

**`assumptions`** — a flattened echo of the `Assumptions` object
(`backend/models/scenario.py:104`): returns (mean/stddev), inflation tracks,
allocation glide path, SS assumptions, healthcare inflation, large purchases,
life events, tax overrides. This is what an agent inspects when asked "why
is 2041 so bad — is it a large purchase?"

### 2.5 Units, Rounding, and Encoding Rules

- Money → integer USD, rounded to nearest dollar. Negative = outflow in
  waterfall fields only; balances are always ≥ 0.
- Rates → decimal to 4 dp (0.0425).
- Missing / NA → `null`, never `0` (0 means "actually zero").
- Column names are the contract. Renames are breaking changes and bump
  `schema_version`.
- A machine-readable **column dictionary** (name → type, unit, description,
  formula if derived) ships at `/api/v1/scenarios/columns` and as a static
  markdown doc. This is what the agent reads once as context.

### 2.6 Serialization Formats

All derived from the same in-memory bundle:

| Format | Use case | Notes |
|--------|----------|-------|
| JSON   | API, agent tools, round-trip | Canonical; object-of-arrays for yearly grid for smaller payload |
| CSV    | Spreadsheets, quick downloads | One file per section (`yearly.csv`, `assumptions.csv`, `header.csv`) bundled in a zip, or flat `yearly.csv` with scenario cols prepended |
| Markdown | Paste-into-chat path | Header + assumptions as a summary block, yearly as a pipe table; truncated at a sane width, full detail in an attached JSON |

### 2.7 Backend Changes

1. Extend `YearRow` in `backend/models/simulation.py` to include the
   contribution fields, allocation fields, and derived aggregates listed
   above. Most already exist on `CashFlowWaterfall` — expose them as
   first-class fields so both deterministic and MC runs populate them
   uniformly.
2. New `ScenarioRunBundle` model that wraps `DeterministicResult` /
   `MonteCarloResult` with the header + assumptions echo.
3. New endpoint `GET /api/v1/simulate/runs/{run_id}/bundle?format={json|csv|md}`
   that reads the persisted result file, hydrates into a bundle, serializes.
4. Column dictionary endpoint + static doc generated from a single source
   of truth (e.g. annotate Pydantic fields with `Field(description=...,
   json_schema_extra={"unit": "usd", "group": "taxes"})` and generate from
   the schema). This prevents docs/code drift.
5. MC: compute percentiles for **every numeric yearly column**, not just
   the handful surfaced today (`net_worth`, `liquid_net_worth`,
   `annual_spending_capacity`, `years_of_runway`). Cost is modest since
   trials are already in memory at aggregation time.

### 2.8 Frontend Changes

1. Replace the current 7-column `YearlyTable` with a **grouped, column-
   toggleable** table: column groups B–L collapsed by default, user can
   expand a group or pick presets ("Tax detail", "Portfolio detail",
   "Cash flow audit").
2. Virtualize rows (40+ years × 60+ columns × possibly 5 percentiles).
3. Sticky first-column (year) and sticky header row.
4. Per-row expand-on-click shows the `CashFlowWaterfall` + `events` for
   that year as a readable panel.

### 2.9 Open Questions

- Should `events` be structured (`[{code, label, amount}]`) instead of
  free strings? Structured is better for the agent; worth the migration.
- Do we want a per-row confidence column for MC (e.g. "width of p10–p90
  band as % of p50")? Useful for "which years are most uncertain".
- Real-estate equity is today a single number — do we want per-property
  breakdown? Probably yes if a user has >1 property.

## 3. Secondary: Getting the Bundle to an Agent

Once the bundle is well-defined, delivery is mostly plumbing. Priority
order, lowest effort first:

### 3.1 In-app: existing `AgentPanel`

- Add a new agent tool `get_scenario_bundle(run_id, format="compact_json")`
  to `backend/agent/tools.py`. Returns the full bundle, optionally with
  columns subsetted by group (`include_groups=["taxes","balances"]`) to
  keep token counts reasonable.
- Add an "Ask the agent about this run" button to the scenario results
  page. Clicking pins the run_id into the agent's context (a system
  message like "User is viewing run X; use `get_scenario_bundle` when
  asked about numbers").
- Provide a **digest mode**: decade-summaries + full detail only for
  years the user highlights. Keeps context small for long horizons.

### 3.2 Download / Export

- "Download" menu on the results page with three items:
  - **JSON (full bundle)** — canonical, for programmatic use.
  - **CSV (yearly + assumptions)** — zip of two files for spreadsheets.
  - **Markdown brief** — one file, pasteable into any chat UI.
- All three reuse the same `/runs/{run_id}/bundle` endpoint with the
  `format` query param. No client-side formatting logic.
- Filenames: `scenario_{slug}_{run_id_short}_{YYYYMMDD}.{ext}`.

### 3.3 Share to external agent

- **Copy to clipboard** (Markdown brief) — one click, works everywhere.
- **Shareable link**: `/share/run/{share_token}` — signed, expiring,
  read-only, serves the bundle. Lets a user drop a URL into Claude/ChatGPT
  and have it `fetch`.
- Optional: a "Prepare agent prompt" button that emits a templated
  prompt (role framing + column dictionary + the bundle) tuned for a
  cold LLM.

### 3.4 Non-goals for v1

- No direct "send to Claude API" integration beyond what `AgentPanel`
  already does.
- No live sync (bundle is a point-in-time snapshot tied to `run_id`).
- No PDF export (markdown + print works; PDF is polish).

## 4. Rollout

1. **Schema first.** Land the expanded `YearRow` + `ScenarioRunBundle`
   models + column dictionary. Bump `schema_version` to 2. Old result
   files on disk remain readable via a compatibility shim that returns
   them as v1 and marks missing columns `null`.
2. **Endpoint.** `GET /runs/{run_id}/bundle` with format negotiation.
3. **Frontend table.** Grouped, toggleable, virtualized.
4. **Agent tool.** `get_scenario_bundle` + "Ask about this run" button.
5. **Exports.** Download menu (JSON / CSV / MD).
6. **Share link.** Signed token route.

Each step is independently shippable and each one improves the product
on its own, so we can stop at any rung if priorities shift.
