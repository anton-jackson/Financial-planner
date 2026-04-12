# Feature Backlog

Sections:
- [Feature Ideas](#feature-ideas) — active backlog
- [Features Best Served by AI Agent](#features-best-served-by-ai-agent) — intentionally not built as static UI
- [Local ↔ Cloud Run Sync](#local--cloud-run-sync) — infrastructure idea
- [Completed](#completed) — shipped features

---

## Feature Ideas

Ordered roughly by concreteness of spec / readiness to pick up.

### Plaid Integration — Account Linking

Connect to Vanguard, Fidelity, Schwab, and other institutions to auto-sync account balances and holdings. Eliminates manual data entry for investment accounts.

**Plaid endpoints to use:**
- `/investments/holdings/get` — current positions (ticker, shares, cost basis, market value)
- `/accounts/balance/get` — account balances by type (401k, IRA, brokerage, HSA)
- `/investments/transactions/get` — buy/sell history (for cost basis tracking)

**Implementation:**

Backend:
- `pip install plaid-python`
- New `backend/integrations/plaid_client.py` — wraps Plaid SDK
- `POST /api/v1/plaid/create-link-token` — generates a Link token for the frontend widget
- `POST /api/v1/plaid/exchange-token` — exchanges public token for access token after Link flow
- `POST /api/v1/plaid/sync` — pulls latest holdings and balances, updates `assets.yaml` and holdings
- Store Plaid access tokens in `data/plaid_tokens.json` (gitignored, encrypted at rest in production)

Frontend:
- `react-plaid-link` package — renders Plaid's Link widget (handles bank login securely)
- "Link Account" button on Assets page and Holdings page (only visible when `PLAID_CLIENT_ID` is configured)
- After linking, auto-populate account balances and holdings from Plaid data

**Config:**
```bash
# In deploy config or .env — leave empty to disable
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=development    # sandbox | development | production
```

**Tiers:**
| Tier | Institutions | Cost |
|------|-------------|------|
| Sandbox | Fake test data | Free |
| Development | Real banks, 100 connections | Free |
| Production | Unlimited | Per-connection/month |

Development tier (100 connections, free) is sufficient for personal use and friends.

**Data flow:**
```
User clicks "Link Account"
  → Plaid Link widget opens (bank login in secure iframe)
  → User authenticates with their bank
  → Plaid returns a public token
  → Backend exchanges for access token (stored locally)
  → Backend calls /investments/holdings/get
  → Maps Plaid accounts → assets.yaml entries
  → Maps Plaid holdings → holdings per account
  → Frontend refreshes to show synced data
```

**Sync strategy:**
- On-demand: user clicks "Sync" button to pull latest
- Optional: periodic background sync via cron or Cloud Scheduler
- Plaid data supplements but doesn't overwrite manual entries (user can have both linked and manual accounts)

**Considerations:**
- Plaid access tokens are sensitive — gitignore, encrypt in production
- Some institutions (Vanguard historically) have spotty Plaid connectivity
- Gracefully degrade: if Plaid isn't configured, everything works as-is with manual entry
- The AI agent could use Plaid-synced data for more accurate analysis

### CSV / Brokerage Statement Import

Upload a CSV export from any brokerage to populate holdings. Lower friction than manual entry, works without any API keys.

**Implementation:**
- Upload endpoint: `POST /api/v1/holdings/import/csv`
- Column mapping: auto-detect common formats (Schwab, Fidelity, Vanguard CSV exports)
- Preview step: show parsed data before saving, let user confirm/edit mappings
- Frontend: upload button on Holdings page

**Brokerage CSV formats to support:**
- Schwab: Symbol, Description, Quantity, Price, Market Value, Cost Basis
- Fidelity: Symbol, Description, Quantity, Last Price, Current Value
- Vanguard: Fund Name, Symbol, Shares, Share Price, Total Value
- Generic: auto-detect by header matching

### Surface Engine Assumptions in UI
Every value the engine assumes should be visible to the user on the relevant page, even if not editable today. Users shouldn't be surprised by costs they didn't enter (e.g., "Employer healthcare: $50,684" appearing in simulation events).

Two layers:
- **Inline on relevant pages**: Show assumed values where they apply (healthcare costs on healthcare section, tax brackets on tax summary, RMD rules on retirement page). Non-editable values shown as read-only with a note like "Based on 2026 IRS rules."
- **How It Works page**: Already exists as a comprehensive reference, but not a substitute for inline visibility.

Key assumed values to surface:
- Scenario defaults (editable): healthcare premiums/OOP, ACA, Medicare, college costs, SS PIAs, inflation rates, returns, allocations
- Engine constants (not editable): federal tax brackets, standard deductions, LTCG brackets, NIIT (3.8%), additional Medicare (0.9%), FICA (6.2%/1.45%), CTC ($2k/child), state tax rates, RMD start age (73), IRS Uniform Lifetime Table, SS claiming factors, rental insurance default ($2,400)

### Side-by-Side Scenario Comparison
Visual overlay of multiple scenario trajectories on one chart. Already partially supported via `/simulate/compare` endpoint — needs dedicated UI. Multi-select on the simulation page exists but the comparison display doesn't work well.

### Cost Basis Tracking
Per-lot cost basis entry for tax-aware rebalancing. Useful for the AI advisor (tax loss harvesting suggestions, optimal lot selection for sales).

### Periodic Status Snapshots
Auto-save a point-in-time snapshot of profile + assets + net worth at regular intervals. Creates a historical record you can look back on.

Considerations:
- How often? Monthly? On each simulation run?
- Storage format — timestamped YAML/JSON in a `snapshots/` directory?
- Diff view — show what changed between snapshots?
- May be more useful once the tool is in daily use vs. setup phase

### Phase-Based Expense/Savings Overrides
Model life phases with different spending/saving profiles (e.g., kids at home, empty nest, early retirement, late retirement). Currently modeled as a single retirement reduction percentage.

### Update Onboarding Wizard
Onboarding wizard needs updating. Scope TBD.

---

## Features Best Served by AI Agent

These features are better handled by the AI advisor agent reading user data and calling the simulation engine, rather than being built as static UI. The agent can reason about the user's full financial picture, ask clarifying questions, and explain its recommendations.

| Feature | Why agent is better |
|---------|-------------------|
| **Target allocation recommendation** | Depends on age, risk tolerance, goals, account types — conversational, not a form |
| **Tax loss harvesting suggestions** | Requires reasoning about cost basis lots, wash sale rules, income projections — too nuanced for a static UI |
| **Rebalance strategy** | Agent can explain trade-offs (tax cost vs. drift tolerance) and suggest timing |
| **Scenario creation** | "What if I buy a rental property?" is easier as a conversation than filling out a form |
| **Expense optimization** | Agent can spot patterns, suggest cuts, model impact on retirement date |
| **Social Security claiming strategy** | Complex trade-offs between spouses, break-even analysis, longevity assumptions |
| **Roth conversion ladder planning** | Multi-year optimization across tax brackets — agent can model and explain |
| **Estate planning guidance** | Trust structures, beneficiary designations, step-up basis — needs explanation, not just numbers |
| **Annual financial review** | Compare snapshots over time, flag drift, suggest adjustments |
| **Return on capital analysis** | "Sell house vs. rent it out" — agent can model both scenarios, identify breakeven appreciation rates |
| **Stock sale tax optimization** | Agent can analyze lots, model tax impact across years, suggest optimal sale timing |

These features work because the agent has read access to all user data and can run simulations via the engine to test its recommendations before presenting them. Output is written to `data/agent_sandbox/` for downstream UI to consume.

---

## Local <> Cloud Run Sync

Enable bidirectional sync between a local copy of the flat files and the Cloud Run instance. This unlocks a powerful workflow: use the cloud app day-to-day from any device, but pull data locally when you want to run the AI agent.

**Workflow:**
1. `finplan pull` — download YAML files from your Cloud Run instance to local `backend/data/`
2. Run Claude Code locally against the data — agent reads files, runs simulations, suggests changes
3. `finplan push` — upload modified files back to Cloud Run

**Implementation options:**
- **CLI tool** — simple Python script using the existing API (`GET /profile`, `PUT /profile`, etc.)
- **Makefile targets** — `make pull INSTANCE=alice`, `make push INSTANCE=alice`
- **rsync/GCS** — if using GCS-FUSE, sync directly to the bucket via `gsutil rsync`

**Conflict handling:** Last-write-wins is fine for single-user instances. Could add a schema_version or timestamp check to warn if cloud data changed since last pull.

**Why this matters:** The AI agent needs local file access to be most useful. Sync bridges the gap between cloud convenience and local agent power.

---

## Completed

- **AI Advisor Agent** — Conversational agent with tool-use loop, collapsible side panel, sandbox for write output. See `docs/agent-architecture.md`.
- **Portfolio Holdings & Rebalance Calculator** — Per-account holdings entry, live market data via yfinance, cross-account rebalance calculator with tax-aware trade suggestions.
- **Windfalls & Inheritances** — Permanent profile-level cash events (one-time and recurring) included in every simulation. Separate from scenario life events.
- **Onboarding Wizard** — 5-step first-time setup flow with spouse support, account balances, and auto-scenario bootstrapping.
- **Cloud Run Deployment** — Deploy scripts (local + remote), combined Dockerfile, GCS-FUSE persistence, Route 53 DNS automation. See `deploy/README.md`.
