# Feature Backlog

## Completed

- **AI Advisor Agent** — Conversational agent with tool-use loop, collapsible side panel, sandbox for write output. See `docs/agent-architecture.md`.
- **Portfolio Holdings & Rebalance Calculator** — Per-account holdings entry, live market data via yfinance, cross-account rebalance calculator with tax-aware trade suggestions.
- **Windfalls & Inheritances** — Permanent profile-level cash events (one-time and recurring) included in every simulation. Separate from scenario life events.

---

## Planned — Cloud Deployment
- **Cloud Run deploy (P3)** — one instance per user, deploy script, GCS-FUSE storage. Last step before sharing with friends. See `docs/deployment-spec.md`.

---

## Feature Ideas

### First-Time Use / Onboarding
Guided setup flow for new users who have no profile or assets configured. Currently the app drops you on an empty dashboard with no guidance — you have to know to go to Profile, then Finances, then Assets, etc.

**Core flow:**
1. Welcome screen — explain what the app does, what data is needed
2. Profile basics — name, birth year, retirement age, state, spouse (if applicable)
3. Income — salary, raises, bonus, spouse income
4. Savings — 401k rate, IRA, HSA, additional savings
5. Expenses — annual base spending, per-child costs
6. Assets — walk through adding accounts (401k, IRA, brokerage, real estate)
7. First simulation — auto-run baseline and show the dashboard with results

**Considerations:**
- Detect first-time use by checking if `profile.yaml` exists (backend already returns 404)
- Stepper/wizard UI with progress indicator — not a single giant form
- Allow skipping sections (fill in later)
- Pre-populate sensible defaults (retirement age 65, 3% raises, base scenario assumptions)
- At the end, save profile + assets + copy example scenarios, then redirect to dashboard
- Could also offer "import from template" (single earner, dual income, tech comp, etc.)
- Should the AI advisor offer to help with onboarding? Could be a natural first conversation

### Periodic Status Snapshots
Auto-save a point-in-time snapshot of profile + assets + net worth at regular intervals. Creates a historical record you can look back on.

Considerations:
- How often? Monthly? On each simulation run?
- Storage format — timestamped YAML/JSON in a `snapshots/` directory?
- Diff view — show what changed between snapshots?
- May be more useful once the tool is in daily use vs. setup phase

### Side-by-Side Scenario Comparison
Visual overlay of multiple scenario trajectories on one chart. Already partially supported via `/simulate/compare` endpoint — needs dedicated UI.

### Cost Basis Tracking
Per-lot cost basis entry for tax-aware rebalancing. Useful for the AI advisor (tax loss harvesting suggestions, optimal lot selection for sales).

### Phase-Based Expense/Savings Overrides
Model life phases with different spending/saving profiles (e.g., kids at home, empty nest, early retirement, late retirement). Currently modeled as a single retirement reduction percentage.

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
