# Feature Backlog

## Planned — Cloud Deployment
- **Cloud Run deploy (P3)** — one instance per user, deploy script, GCS-FUSE storage. Last step before sharing with friends. See `docs/deployment-spec.md`.

## Feature Ideas

### Granular Portfolio Entry + Rebalance Calculator
Enter individual holdings (stocks, bonds, funds, ETFs) within each account. System fetches live market prices and auto-calculates current values. Replaces the current single-balance-per-account model with a holdings-level view. Key goal: **reduce data entry**.

**Market data:** Use free API (Yahoo Finance via `yfinance`, or Alpha Vantage) to fetch current prices by ticker. User enters ticker + shares, system does the rest.

**Rebalance calculator:** User sets target allocation (e.g., 70% US equity, 20% intl, 10% bonds). App shows current vs. target, calculates the trades needed to rebalance — per account, tax-aware (prefer rebalancing in tax-advantaged accounts to avoid triggering gains).

**Cost basis tracking:** Optional — user can enter per-lot cost basis for tax-aware rebalancing. Also useful for the AI sidecar (tax loss harvesting suggestions, optimal lot selection).

**Rebalancing scope:** Cross-account — treat the entire portfolio as one allocation. User enters target percentages, software calculates trades needed. Prefer trades in tax-advantaged accounts to avoid triggering gains in taxable.

Considerations:
- Asset classification — map tickers to asset classes (equity/bond/intl/etc.), possibly via fund category data
- Frequency — on-demand rebalance suggestions, not auto-trading
- Target allocation establishment is a good candidate for the AI sidecar (see below)

### Periodic Status Snapshots
Auto-save a point-in-time snapshot of profile + assets + net worth at regular intervals. Creates a historical record you can look back on.

Considerations:
- How often? Monthly? On each simulation run?
- Storage format — timestamped YAML/JSON in a `snapshots/` directory?
- Diff view — show what changed between snapshots?
- May be more useful once the tool is in daily use vs. setup phase

### Side-by-Side Scenario Comparison (from prior session)
Visual overlay of multiple scenario trajectories on one chart. Already partially supported via `/simulate/compare` endpoint — needs dedicated UI.

### AI Advisor Sidecar (from prior session)
LLM agent that reads the flat files, runs simulations via the API, and provides natural language planning advice. Deferred — flat-file architecture was chosen specifically to enable this.

---

## Features Best Served by AI Agent Sidecar

These features are better handled by a local AI agent (Claude Code or similar) reading the flat files and calling the API, rather than being built into the app UI. The agent can reason about the user's full financial picture, ask clarifying questions, and explain its recommendations.

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

These features work because the agent has full read/write access to the YAML files and can run simulations via the API to test its recommendations before presenting them.

| **Local↔Cloud sync** | Agent can pull latest from cloud, do deep analysis locally, push changes back — best of both worlds |

---

## Local ↔ Cloud Run Sync

Enable bidirectional sync between a local copy of the flat files and the Cloud Run instance. This unlocks a powerful workflow: use the cloud app day-to-day from any device, but pull data locally when you want to run the AI agent sidecar.

**Workflow:**
1. `finplan pull` — download YAML files from your Cloud Run instance to local `backend/data/`
2. Run Claude Code locally against the data — agent reads files, runs simulations, suggests changes
3. `finplan push` — upload modified files back to Cloud Run

**Implementation options:**
- **CLI tool** — simple Python script using the existing API (`GET /profile`, `PUT /profile`, etc.)
- **Makefile targets** — `make pull INSTANCE=alice`, `make push INSTANCE=alice`
- **rsync/GCS** — if using GCS-FUSE, sync directly to the bucket via `gsutil rsync`

**Conflict handling:** Last-write-wins is fine for single-user instances. Could add a schema_version or timestamp check to warn if cloud data changed since last pull.

**Why this matters:** The AI sidecar needs local file access to be most useful. Sync bridges the gap between cloud convenience and local agent power.

### Phase-Based Expense/Savings Overrides (discussed conceptually)
Model life phases with different spending/saving profiles (e.g., kids at home, empty nest, early retirement, late retirement). Currently modeled as a single retirement reduction percentage.
