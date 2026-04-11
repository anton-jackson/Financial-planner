# Financial Planner

A long-term financial planning tool that projects your household's net worth from now through end of life. This is not a budgeting app or an investment platform — it answers the question: **"Given my income, savings, debts, and life plans, what does my financial future look like?"**

It models the full picture: progressive federal and state taxes, RSU vesting, college costs with 529 drawdowns, mortgage amortization, vehicle depreciation, Social Security, healthcare cost phases, and Monte Carlo simulation across thousands of market scenarios.

## What It Does

### Year-by-Year Cashflow Projection

The engine walks forward one year at a time from today through your life expectancy, computing:

- **Income** — salary with annual raises, bonuses, spouse income, RSU vesting and sales with cost basis tracking, rental income, Social Security benefits
- **Savings** — 401k (traditional + Roth + employer match), IRA, HSA, taxable brokerage, 529 contributions — all respecting IRS limits
- **Expenses** — base living expenses (inflation-adjusted), per-child costs that drop when they leave, mortgage payments, vehicle loans, HELOCs, healthcare, college tuition
- **Taxes** — progressive federal brackets (10%-37%) for MFJ/Single/HoH, long-term capital gains, FICA, Medicare surtax, NIIT, state income tax (all 50 states), Child Tax Credit with phaseouts
- **Portfolio** — investment returns with glide-path allocation shifting from stocks-heavy to bonds-heavy approaching retirement, withdrawals ordered by tax efficiency (taxable → traditional → Roth)

Income stops at retirement. Expenses drop by a configurable percentage. Social Security kicks in at your claiming age. The engine keeps running until end of life, tracking whether your money outlasts you.

### Monte Carlo Simulation

A single projection assumes markets return their average every year — which never happens. The Monte Carlo engine runs 2,000-5,000 trials, each sampling:

- Stock and bond returns (normal distribution around historical means)
- Inflation variability
- Bonus fluctuation
- RSU price volatility (lognormal for upside skew)

Output: percentile bands (p10 through p90) for net worth, liquid net worth, and annual spending capacity. A success rate tells you what percentage of simulated futures avoid running out of money.

### Scenario Comparison

Create multiple scenarios — base case, bear market, bull market, "buy a second home in 2035" — and compare them side by side. Each scenario has its own market assumptions, large purchases, life events, and allocation strategy.

### Planning Matrix

A 2D parameter sweep that answers questions like: "If I retire between ages 58-65 and spend between $120K-$180K/year, what's my success rate for each combination?" Each cell runs a full Monte Carlo simulation.

### What-If Overrides

Adjust retirement age, expenses, savings rate, or spouse income on the fly without modifying your saved profile. Useful for quick exploration and for future AI advisor integration.

## Pages

| Page | Purpose |
|------|---------|
| **Dashboard** | Baseline snapshot — current net worth, projected trajectory, Monte Carlo bands, key retirement metrics |
| **Profile** | Personal info — you, spouse, children, state of residence |
| **Basic Finances** | Income, savings, expenses, tax configuration |
| **Assets & Liabilities** | Retirement accounts, brokerage, real estate, vehicles (with loans and depreciation), HELOCs |
| **College Planning** | Per-child education config — 529 plans, tuition, parent contribution caps |
| **Scenarios** | Market assumptions, large purchases, life events, asset allocation strategy |
| **Simulation** | Multi-scenario comparison with interactive charts |
| **Planning** | 2D parameter sweep matrix |
| **Retirement** | Asset pool breakdown by tax character (traditional/Roth/taxable), liquidity, estate planning view |
| **AI Advisor** | Chat with an AI agent that can read your profile, run simulations, and answer what-if questions |
| **How It Works** | Detailed explanation of every calculation |

## Data Format

All user data is stored as **YAML flat files** — no database.

```
backend/data/
  profile.yaml          # Your financial profile
  assets.yaml           # Account balances and properties
  scenarios/
    base.yaml           # Base case assumptions
    bear.yaml           # Pessimistic scenario
    bull.yaml           # Optimistic scenario
  results/
    sim_*.json           # Cached simulation results
```

### Why Flat Files

1. **Human-readable** — open `profile.yaml` in any text editor to see or change your data
2. **Agent-friendly** — an LLM agent can read, understand, and modify YAML directly. No ORM, no query language, no database driver. This is a deliberate architectural choice: the data format is the API for AI integration.
3. **Portable** — copy a directory to move your entire financial plan. No database migrations, no export tools.
4. **Diffable** — track changes in git. See exactly what changed between planning sessions.
5. **Simple** — no database server to install, configure, or maintain

The storage layer is abstracted behind a protocol interface (`StorageBackend`), so swapping to cloud storage (GCS, S3) requires implementing five methods without touching any application code.

### Profile Schema (profile.yaml)

```yaml
schema_version: 1
personal:
  name: Jane
  birth_year: 1985
  retirement_age: 62
  life_expectancy_age: 95
  state_of_residence: wa          # Used for state income tax lookup

spouse:
  name: John
  birth_year: 1984
  retirement_age: 65

children:
  - name: Child A
    birth_year: 2015
    college_start_year: 2033
    college_years: 4
    current_school:
      type: public
      annual_tuition: 0
      ends_year: 2033
    plan_529_balance: 50000
    plan_529_monthly_contribution: 500
    parent_college_annual: 25000   # Cap parent pays per year (0 = unlimited)

income:
  primary:
    base_salary: 150000
    annual_raise_pct: 3.0
    bonus_pct: 10.0
  rsu:                              # Optional — for tech compensation
    current_price: 190
    unvested_tranches:
      - { shares: 500, vest_year: 2026, sale_year: 2030 }
    sell_to_cover_pct: 37
    annual_refresh_value: 100000
  spouse:
    base_salary: 75000

savings:
  primary:
    annual_401k_traditional: 12000
    annual_401k_roth: 0
    employer_match_pct: 4.0
    annual_ira_roth: 7000
    annual_hsa: 8300
    additional_monthly_savings: 500

expenses:
  annual_base: 100000              # Excludes mortgage, tuition, healthcare
  retirement_reduction_pct: 20     # Expenses drop 20% in retirement
  per_child_annual: 10000          # Added on top of base per child at home

tax:
  filing_status: mfj               # mfj, single, or hoh
  state_income_tax_pct: 0          # 0 = auto-lookup by state; >0 = override

existing_vehicles: []
helocs: []
```

### Assets Schema (assets.yaml)

```yaml
schema_version: 1
assets:
  - name: Traditional 401k
    type: traditional_401k          # Known types get tax-aware treatment
    balance: 100000
    return_profile: stocks_bonds

  - name: Primary Residence
    type: real_estate
    balance: 400000                 # Current market value
    return_profile: real_estate
    properties:
      purchase_price: 350000
      mortgage_balance: 280000
      mortgage_rate_pct: 6.5
      monthly_payment: 2200
      is_rental: false
      annual_property_tax: 5000
      appreciation_rate_pct: 3
```

**Asset types:** `traditional_401k`, `roth_401k`, `traditional_ira`, `roth_ira`, `hsa`, `taxable_brokerage`, `529`, `crypto`, `real_estate`, `other`

### Scenario Schema (scenarios/base.yaml)

```yaml
schema_version: 1
name: Base Case
description: Moderate assumptions

assumptions:
  investment_returns:
    stocks_mean_pct: 8.0
    stocks_stddev_pct: 16.0
    bonds_mean_pct: 4.0
    bonds_stddev_pct: 6.0
    real_estate_appreciation_pct: 3.5

  inflation:
    general_mean_pct: 3.0
    college_tuition_pct: 5.0
    healthcare_pct: 6.0

  asset_allocation:
    pre_retirement: { stocks_pct: 70, bonds_pct: 25, cash_pct: 5 }
    post_retirement: { stocks_pct: 50, bonds_pct: 40, cash_pct: 10 }
    glide_path_start_years_before: 5

  social_security:
    primary_pia_at_67: 3200        # Monthly benefit at full retirement age
    claiming_age_primary: 67
    cola_pct: 2.5

  large_purchases:
    - name: Vacation home
      year: 2035
      purchase_price: 500000
      down_payment_pct: 20
      mortgage_rate_pct: 6.5
      mortgage_term_years: 30

  life_events:
    - name: Inheritance
      year: 2032
      amount: 100000
      taxable: false
```

## Running Locally

**Prerequisites:** Python 3.11+, Node 18+

```bash
# Clone and set up
git clone https://github.com/anton-jackson/Financial-planner.git
cd Financial-planner

# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e backend/

# Frontend
cd frontend && npm install && cd ..

# Run both servers
make dev
```

Backend runs on http://localhost:8000 (API docs at `/docs`), frontend on http://localhost:5173. On first visit, the onboarding wizard walks you through setting up your profile.

## Running with Docker

```bash
# Copy scenario files into the Docker volume directory
mkdir -p data/scenarios
cp backend/data/scenarios/*.yaml data/scenarios/

# Build and run
docker compose up --build
```

App runs on http://localhost. Data persists in the `./data` directory. The onboarding wizard creates your profile on first visit.

## API

The backend is FastAPI — interactive docs are auto-generated at `http://localhost:8000/docs`.

Key endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/profile` | GET/PUT/PATCH | Read or update financial profile |
| `/api/v1/assets` | GET/PUT/PATCH | Read or update account balances |
| `/api/v1/scenarios` | GET | List all scenarios |
| `/api/v1/scenarios/{name}` | GET/PUT/DELETE | CRUD on a scenario |
| `/api/v1/simulate/baseline` | POST | Deterministic projection with current profile |
| `/api/v1/simulate/baseline/monte-carlo` | POST | Monte Carlo on baseline |
| `/api/v1/simulate/deterministic` | POST | Run a named scenario |
| `/api/v1/simulate/monte-carlo` | POST | Monte Carlo on a named scenario |
| `/api/v1/simulate/sweep` | POST | 2D parameter sweep matrix |
| `/api/v1/simulate/compare` | POST | Side-by-side scenario comparison |
| `/api/v1/agent/chat` | POST | Chat with the AI financial advisor agent |

All simulation endpoints accept optional overrides (retirement age, expenses, savings rate) for what-if analysis without modifying saved data.

## Architecture

```
frontend/          React + TypeScript + Vite + Tailwind
  src/pages/       One page per tab (Profile, Finances, Assets, etc.)
  src/api/         Typed API client (fetch wrappers)
  src/types/       TypeScript interfaces matching backend models

backend/           Python + FastAPI
  api/             REST endpoints
  engine/          Simulation engine (cashflow, tax, college, investment,
                   mortgage, social_security, healthcare, monte_carlo)
  models/          Pydantic models (profile, assets, scenario, simulation)
  storage/         Storage abstraction (local filesystem, extensible to cloud)
  data/            YAML flat files (user data + scenarios + cached results)
```

## AI Financial Advisor

An optional conversational agent that can read your financial data, run simulations, and answer natural-language questions about your plan. It uses your existing profile, assets, and simulation engine — no separate data needed.

### Setup

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/)
2. Set the environment variable:

```bash
# Local development
export ANTHROPIC_API_KEY=sk-ant-...

# Docker
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
docker compose up --build
```

3. Navigate to **AI Advisor** in the sidebar

### What it can do

- **Read your profile and assets** — understands your income, savings, expenses, account balances
- **Run simulations** — deterministic projections and Monte Carlo analysis on demand
- **What-if analysis** — "What if I retire at 60?" runs both current and modified scenarios, shows the delta
- **Compare scenarios** — side-by-side base vs bear vs bull analysis
- **Year-by-year detail** — drill into any specific year's breakdown

### What it can't do (by design)

- **Edit your data** — the agent is read-only. All changes go through the app's forms
- **Save results** — analysis is ephemeral; run a full simulation from the Simulation page to persist results
- **Access external data** — no internet lookups; it works entirely with your local data and engine

### Architecture

The agent is a simple tool-use loop (~200 lines total) with no framework dependencies:

```
backend/agent/
  tools.py       # 8 tool definitions (profile, assets, simulation, what-if, etc.)
  executor.py    # Dispatches tool calls to existing engine functions
  loop.py        # Core loop: send to LLM → execute tools → repeat until text response
```

The only new dependency is the `anthropic` Python SDK. The agent calls your existing `engine/cashflow.py` and `engine/monte_carlo.py` — no duplicate logic.

## Tax Engine

The tax engine models:

- **Federal income tax** — 2026 progressive brackets for MFJ, Single, and Head of Household, with annual inflation adjustment
- **Long-term capital gains** — 0%/15%/20% brackets stacked on ordinary income
- **FICA** — Social Security (6.2% up to wage base) + Medicare (1.45%) + Additional Medicare (0.9% above threshold)
- **Net Investment Income Tax** — 3.8% on investment income above MAGI threshold
- **State income tax** — no-tax states (WA, TX, FL, etc.), flat-rate states (IA, IL, PA, etc.), progressive states (CA, NY, NJ, MN, OR, HI) with full bracket tables
- **Child Tax Credit** — $2,000/child under 17, phaseout above $400K MFJ / $200K single
- **Standard deduction** — per filing status, inflation-adjusted

Not modeled (intentionally simplified): AMT, itemized deduction phaseouts, Roth conversion ladders, required minimum distributions.

## Tech Stack

- **Backend:** Python 3.13, FastAPI, Pydantic, NumPy, SciPy, Pandas
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Recharts, React Query, React Hook Form
- **Storage:** YAML + JSON flat files (no database)
- **Deployment:** Docker Compose (local), Cloud Run (cloud — see `docs/deployment-spec.md`)
