from pydantic import BaseModel


class CashFlowWaterfall(BaseModel):
    """Auditable per-year cash flow breakdown (see docs/engine-rework-spec.md)."""
    # Inflows
    earned_income: float = 0
    rsu_vest_income: float = 0
    social_security: float = 0
    rental_income: float = 0
    rmd_gross: float = 0
    rmd_tax: float = 0
    rmd_net: float = 0
    rmd_primary: float = 0
    rmd_spouse: float = 0
    windfall_gross: float = 0
    windfall_net: float = 0
    # Outflows
    living_expenses: float = 0
    healthcare: float = 0
    mortgage: float = 0
    college: float = 0
    vehicle: float = 0
    debt_payments: float = 0
    property_costs: float = 0
    large_purchase: float = 0
    total_expenses: float = 0
    # Tax
    federal_income_tax: float = 0
    state_tax: float = 0
    fica: float = 0
    ltcg_tax: float = 0
    niit: float = 0
    total_tax: float = 0
    # Portfolio withdrawals
    from_taxable: float = 0
    from_traditional: float = 0
    from_roth: float = 0
    from_hsa_medical: float = 0
    # Returns per pool
    returns_traditional_primary: float = 0
    returns_traditional_spouse: float = 0
    returns_roth: float = 0
    returns_taxable: float = 0
    returns_hsa: float = 0
    # End-of-year balances
    balance_traditional_primary: float = 0
    balance_traditional_spouse: float = 0
    balance_roth: float = 0
    balance_taxable: float = 0
    balance_hsa: float = 0


class YearRow(BaseModel):
    year: int
    age_primary: int
    gross_income: float
    rsu_held_value: float = 0  # market value of vested (unsold) RSU shares
    rsu_vest_income: float = 0
    rsu_cap_gains_tax: float = 0
    social_security_income: float = 0
    rental_income: float = 0
    total_expenses: float
    college_costs: float = 0
    mortgage_payments: float = 0
    healthcare_costs: float = 0
    large_purchase_costs: float = 0
    vehicle_costs: float = 0
    debt_payments: float = 0
    vehicle_equity: float = 0
    vehicle_loan_debt: float = 0
    debt_balance: float = 0
    property_carrying_costs: float = 0
    property_taxes: float = 0
    property_insurance: float = 0
    income_tax: float = 0
    federal_income_tax: float = 0
    ltcg_tax: float = 0
    niit: float = 0
    fica: float = 0
    state_tax: float = 0
    effective_tax_rate_pct: float = 0
    marginal_tax_rate_pct: float = 0
    living_expenses: float = 0
    savings_contributions: float = 0
    investment_returns: float = 0
    portfolio_withdrawals: float = 0
    withdrawal_from_taxable: float = 0
    withdrawal_from_traditional: float = 0
    withdrawal_from_roth: float = 0
    withdrawal_from_hsa: float = 0
    rmd_primary: float = 0
    rmd_spouse: float = 0
    net_worth: float
    liquid_net_worth: float
    # Aggregate balance across both owner sub-pools (back-compat)
    traditional_balance: float = 0
    traditional_primary_balance: float = 0
    traditional_spouse_balance: float = 0
    roth_balance: float = 0
    taxable_balance: float = 0
    hsa_balance: float = 0
    real_estate_equity: float = 0
    events: list[str] = []
    cash_flow: CashFlowWaterfall | None = None


class DeterministicResult(BaseModel):
    schema_version: int = 1
    run_id: str
    timestamp: str
    scenario_name: str
    type: str = "deterministic"
    start_year: int
    end_year: int
    yearly: list[YearRow]


class PercentileBands(BaseModel):
    p10: list[float]
    p25: list[float]
    p50: list[float]
    p75: list[float]
    p90: list[float]


class MonteCarloResult(BaseModel):
    schema_version: int = 1
    run_id: str
    timestamp: str
    scenario_name: str
    type: str = "monte_carlo"
    num_trials: int
    start_year: int
    end_year: int
    years: list[int]
    net_worth: PercentileBands
    liquid_net_worth: PercentileBands
    annual_spending_capacity: PercentileBands
    success_rate: float
    probability_of_ruin: float
    years_of_runway: PercentileBands
    median_terminal_net_worth: float


class SimulationRequest(BaseModel):
    scenario_name: str
    start_year: int | None = None
    end_year: int | None = None
    num_trials: int = 5000
    overrides: dict[str, float] = {}  # v2 hook: dot-path overrides


class CompareRequest(BaseModel):
    scenarios: list[str]
    mode: str = "deterministic"
