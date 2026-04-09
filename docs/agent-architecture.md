# AI Agent Architecture

## Overview

The AI advisor is a conversational agent that can read the user's financial data, run simulations, and answer questions. It uses a tool-use loop pattern with no framework dependencies — just the Anthropic SDK and the existing simulation engine.

**Design principles:**
- Read-only access to user data (profile, assets, scenarios)
- Writes confined to `data/agent_sandbox/` via `AgentSandbox`
- No duplicate logic — all analysis dispatches to existing engine functions
- Conversation history managed client-side, round-tripped per request
- Gracefully disabled when `ANTHROPIC_API_KEY` is not set

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│  Frontend                                               │
│                                                         │
│  AgentProvider (context)                                │
│    ├── isOpen / toggle / close    (panel visibility)    │
│    ├── messages[]                 (display bubbles)     │
│    └── history[]                  (API conversation)    │
│                                                         │
│  AgentPanel (slide-out drawer)                          │
│    └── POST /api/v1/agent/chat { message, history }     │
│                                                         │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Backend: api/agent.py                                  │
│                                                         │
│  POST /api/v1/agent/chat                                │
│    ├── Validates ANTHROPIC_API_KEY is set                │
│    ├── Loads storage via get_storage()                   │
│    └── Calls agent/loop.py → run_agent_loop()           │
│                                                         │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Backend: agent/loop.py — The Core Loop                 │
│                                                         │
│  while rounds < MAX_TOOL_ROUNDS (10):                   │
│    1. Send messages + TOOLS to Claude API                │
│    2. If response has tool_use blocks:                   │
│       → Execute each via executor.py                    │
│       → Append results to messages                      │
│       → Continue loop                                   │
│    3. If response is text only:                          │
│       → Return (text, updated_messages)                 │
│                                                         │
│  System prompt defines personality and guardrails       │
│  Model: claude-sonnet-4-5-20250514                      │
│  Max tokens: 4096                                       │
│                                                         │
└───────────────────────┬─────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Backend: agent/executor.py — Tool Dispatch             │
│                                                         │
│  execute_tool(name, input, storage) → dict              │
│                                                         │
│  Routes tool calls to existing engine functions:        │
│    get_profile_summary    → storage.read("profile.yaml")│
│    get_assets_summary     → storage.read("assets.yaml") │
│    list_scenarios         → storage.list("scenarios")   │
│    run_deterministic      → engine/cashflow.py          │
│    run_monte_carlo        → engine/monte_carlo.py       │
│    what_if                → modified profile + MC       │
│    compare_scenarios      → multiple cashflow runs      │
│    get_yearly_detail      → single year from cashflow   │
│                                                         │
│  All results are condensed before returning to the LLM  │
│  (key milestone years, not full yearly arrays)          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## File Layout

```
backend/agent/
  __init__.py
  tools.py          # Tool definitions (Anthropic tool_use schema format)
  executor.py       # Dispatches tool names → engine functions
  loop.py           # Core agent loop (LLM ↔ tool execution)
  sandbox.py        # Scoped write access (read anywhere, write to sandbox only)

backend/api/
  agent.py          # POST /api/v1/agent/chat endpoint

frontend/src/components/agent/
  AgentContext.tsx   # React context: panel state + chat history persistence
  AgentPanel.tsx     # Slide-out drawer UI

frontend/src/api/
  agent.ts           # Typed API client for the chat endpoint
```

---

## Tool Definitions (agent/tools.py)

Tools are defined as dicts matching the Anthropic tool_use schema:

```python
{
    "name": "tool_name",
    "description": "What the tool does (the LLM reads this to decide when to call it)",
    "input_schema": {
        "type": "object",
        "properties": { ... },
        "required": [ ... ],
    },
}
```

The `TOOLS` list is passed to `client.messages.create(tools=TOOLS)`. The LLM decides which tools to call based on the descriptions and the user's question.

### Current tools

| Tool | Reads | Writes | Engine Function |
|------|-------|--------|-----------------|
| `get_profile_summary` | profile.yaml | - | - |
| `get_assets_summary` | assets.yaml | - | - |
| `list_scenarios` | scenarios/*.yaml | - | - |
| `run_deterministic_projection` | all | - | `project_cashflows()` |
| `run_monte_carlo` | all | - | `run_monte_carlo()` |
| `what_if` | all | - | 2x `run_monte_carlo()` (before/after) |
| `compare_scenarios` | all | - | N x `project_cashflows()` |
| `get_yearly_detail` | all | - | `project_cashflows()` + filter |

---

## Agent Sandbox (agent/sandbox.py)

The sandbox provides scoped write access. The agent can read all user data but can only write to `data/agent_sandbox/`.

```python
from agent.sandbox import AgentSandbox

sandbox = AgentSandbox(storage)

# Read from anywhere (delegates to underlying storage)
profile = sandbox.read("profile.yaml")
assets = sandbox.read("assets.yaml")

# Write ONLY to agent_sandbox/
sandbox.write("rebalance_2026-04-09.json", { ... })
# → writes to data/agent_sandbox/rebalance_2026-04-09.json

# Path traversal is blocked
sandbox.write("../../profile.yaml", { ... })  # raises ValueError

# List and read sandbox contents
files = sandbox.list_sandbox()
plan = sandbox.read_sandbox("rebalance_2026-04-09.json")
```

**Directory structure at runtime:**

```
data/
  profile.yaml              # User data (read-only to agent)
  assets.yaml               # User data (read-only to agent)
  scenarios/                 # User data (read-only to agent)
  results/                   # Simulation results (not agent-managed)
  agent_sandbox/             # Agent output (gitignored)
    rebalance_2026-04-09.json
    allocation_plan.json
    tax_lot_analysis.json
    ...
```

---

## Adding a New Tool

To add a new tool (e.g., portfolio allocation analysis):

### 1. Define the tool schema in `agent/tools.py`

```python
# Append to the TOOLS list:
{
    "name": "analyze_portfolio_allocation",
    "description": "Analyze current portfolio allocation across accounts and recommend rebalancing.",
    "input_schema": {
        "type": "object",
        "properties": {
            "target_stocks_pct": {
                "type": "number",
                "description": "Target stock allocation percentage.",
            },
        },
        "required": [],
    },
}
```

### 2. Add the handler in `agent/executor.py`

```python
def execute_tool(name, tool_input, storage):
    # ... existing tools ...

    if name == "analyze_portfolio_allocation":
        return _analyze_allocation(storage, tool_input)

def _analyze_allocation(storage, tool_input):
    sandbox = AgentSandbox(storage)
    assets = sandbox.read("assets.yaml")
    # ... analysis logic ...

    result = { "accounts": [...], "recommendations": [...] }

    # Write to sandbox for the rebalance UI to pick up
    sandbox.write("allocation_plan.json", result)

    return result  # Also returned to LLM for conversational response
```

### 3. That's it

No changes needed to `loop.py`, `api/agent.py`, or the frontend. The LLM automatically sees the new tool and will call it when relevant.

---

## Conversation Flow

### Client-side state

The frontend maintains two parallel representations:

- **`messages`** — Clean `{role, content}` array for rendering chat bubbles. Only contains displayable text.
- **`history`** — Raw Anthropic API message array including `tool_use` and `tool_result` blocks. Opaque to the frontend — stored and round-tripped to the backend each request.

### Request lifecycle

```
1. User types message
2. Frontend appends to messages[] (optimistic UI)
3. POST /api/v1/agent/chat { message: "...", history: [...] }
4. Backend appends user message to history
5. Loop:
   a. Send history + tools to Claude API
   b. Claude returns tool_use → execute → append result → goto (a)
   c. Claude returns text → break
6. Return { response: "text", history: [updated full history] }
7. Frontend appends assistant message to messages[]
8. Frontend stores updated history for next request
```

### State persistence

- **Within a session:** `AgentContext` lives above the router, so navigating between pages preserves the conversation.
- **Across sessions:** State is lost on page refresh. No server-side session storage. This is intentional — the profile IS the long-term memory.

---

## Guardrails

### System prompt (agent/loop.py)

The system prompt instructs the LLM to:
- Use concrete numbers from tools, not make up figures
- Reference percentile bands when discussing projections
- Explain it cannot edit data — changes must go through the app's forms
- Focus on insight, not raw data dumps

### Context condensation (agent/executor.py)

Simulation results are condensed before returning to the LLM:
- Yearly projections → key milestone years only (retirement, every 5 years, event years)
- Monte Carlo → summary metrics at retirement and end of horizon, not all years
- This keeps token usage manageable for multi-turn conversations

### Safety

- `MAX_TOOL_ROUNDS = 10` prevents infinite loops
- `AgentSandbox` prevents writes outside the sandbox directory
- Path traversal protection in `sandbox._safe_path()`
- API key not set → 503 with clear error message, agent gracefully disabled

---

## Configuration

| Environment Variable | Required | Default | Purpose |
|---------------------|----------|---------|---------|
| `ANTHROPIC_API_KEY` | No | `""` | Enables the AI advisor. Without it, the endpoint returns 503. |

Set via environment, `.env` file (for docker-compose), or cloud secret manager.

---

## Future Considerations

### Streaming
The current endpoint is synchronous — the full agent loop completes before responding. For better UX with slow tool calls (Monte Carlo takes seconds), consider switching to SSE streaming.

### Portfolio tools
When the portfolio tracker is ready, add tools that:
- Read portfolio holdings and transaction history
- Analyze allocation drift vs targets
- Write rebalance recommendations to `agent_sandbox/`
- Analyze tax lots for optimal sale sequencing

### Richer what-if
The current `what_if` tool supports a fixed set of overrides. For complex scenarios (sell house + buy new vs rent + mortgage), add scenario-level what-if tools that can manipulate `large_purchases`, `life_events`, and rental conversion fields.
