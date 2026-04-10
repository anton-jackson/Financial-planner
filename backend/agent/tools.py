"""Tool definitions exposed to the LLM agent.

Each tool maps to an existing engine function or storage operation.
The schemas follow the Anthropic tool_use format.
"""

TOOLS = [
    {
        "name": "get_profile_summary",
        "description": (
            "Get a summary of the user's financial profile including income, "
            "savings rates, expenses, children, retirement age, and tax config. "
            "Call this first to understand the user's situation."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "get_assets_summary",
        "description": (
            "Get the user's current asset balances: 401k, IRA, Roth, HSA, "
            "taxable brokerage, 529, real estate, crypto, etc."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "list_scenarios",
        "description": "List all available financial scenarios (e.g. base, bear, bull).",
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "run_deterministic_projection",
        "description": (
            "Run a single deterministic year-by-year cashflow projection. "
            "Returns yearly income, expenses, taxes, savings, net worth, etc. "
            "Use this for detailed year-by-year analysis."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "scenario_name": {
                    "type": "string",
                    "description": "Scenario to use (e.g. 'base', 'bear', 'bull'). Defaults to 'base'.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "run_monte_carlo",
        "description": (
            "Run a Monte Carlo simulation (many randomized trials) to get "
            "probability-weighted outcomes: success rate (probability of not "
            "running out of money), percentile bands for net worth over time, "
            "spending capacity, and years of runway. Use this for risk analysis."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "scenario_name": {
                    "type": "string",
                    "description": "Scenario to use. Defaults to 'base'.",
                },
                "num_trials": {
                    "type": "integer",
                    "description": "Number of simulation trials. Default 1000 (faster for chat). Max 5000.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "what_if",
        "description": (
            "Run a what-if analysis by temporarily changing a profile parameter "
            "and running a Monte Carlo simulation. Does NOT save changes. "
            "Useful for questions like 'what if I retire at 60?' or "
            "'what if I save $2000 more per month?'"
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "retirement_age": {
                    "type": "integer",
                    "description": "Override retirement age for primary earner.",
                },
                "spouse_retirement_age": {
                    "type": "integer",
                    "description": "Override retirement age for spouse.",
                },
                "annual_base_expenses": {
                    "type": "number",
                    "description": "Override annual base living expenses (today's dollars).",
                },
                "contribution_rate_pct": {
                    "type": "number",
                    "description": "Override 401k contribution rate (% of salary).",
                },
                "additional_monthly_savings": {
                    "type": "number",
                    "description": "Override additional monthly savings amount.",
                },
                "spouse_base_salary": {
                    "type": "number",
                    "description": "Override spouse's base salary.",
                },
                "num_trials": {
                    "type": "integer",
                    "description": "Number of MC trials. Default 1000.",
                },
            },
            "required": [],
        },
    },
    {
        "name": "compare_scenarios",
        "description": (
            "Compare multiple scenarios side-by-side. Returns deterministic "
            "projections for each scenario so you can contrast outcomes."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "scenarios": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "List of scenario names to compare (e.g. ['base', 'bear', 'bull']).",
                },
            },
            "required": ["scenarios"],
        },
    },
    {
        "name": "get_yearly_detail",
        "description": (
            "Get detailed financial data for a specific year from a deterministic "
            "projection. Includes income breakdown, tax breakdown, savings, "
            "withdrawals, and all balance details."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "year": {
                    "type": "integer",
                    "description": "The year to get details for.",
                },
                "scenario_name": {
                    "type": "string",
                    "description": "Scenario to use. Defaults to 'base'.",
                },
            },
            "required": ["year"],
        },
    },
]
