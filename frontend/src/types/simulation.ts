export interface YearRow {
  year: number;
  age_primary: number;
  gross_income: number;
  rsu_held_value: number;
  rsu_vest_income: number;
  rsu_cap_gains_tax: number;
  social_security_income: number;
  rental_income: number;
  total_expenses: number;
  college_costs: number;
  mortgage_payments: number;
  healthcare_costs: number;
  large_purchase_costs: number;
  vehicle_costs: number;
  debt_payments: number;
  vehicle_equity: number;
  vehicle_loan_debt: number;
  debt_balance: number;
  property_carrying_costs: number;
  property_taxes: number;
  property_insurance: number;
  income_tax: number;
  federal_income_tax: number;
  ltcg_tax: number;
  niit: number;
  fica: number;
  state_tax: number;
  effective_tax_rate_pct: number;
  marginal_tax_rate_pct: number;
  living_expenses: number;
  savings_contributions: number;
  investment_returns: number;
  portfolio_withdrawals: number;
  withdrawal_from_taxable: number;
  withdrawal_from_traditional: number;
  withdrawal_from_roth: number;
  net_worth: number;
  liquid_net_worth: number;
  traditional_balance: number;
  roth_balance: number;
  taxable_balance: number;
  real_estate_equity: number;
  events: string[];
}

export interface DeterministicResult {
  schema_version: number;
  run_id: string;
  timestamp: string;
  scenario_name: string;
  type: string;
  start_year: number;
  end_year: number;
  yearly: YearRow[];
}

export interface SimulationRequest {
  scenario_name: string;
  start_year?: number;
  end_year?: number;
  num_trials?: number;
}

export interface CompareRequest {
  scenarios: string[];
  mode: string;
}

export interface PercentileBands {
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
}

export interface MonteCarloResult {
  schema_version: number;
  run_id: string;
  timestamp: string;
  scenario_name: string;
  type: string;
  num_trials: number;
  start_year: number;
  end_year: number;
  years: number[];
  net_worth: PercentileBands;
  liquid_net_worth: PercentileBands;
  annual_spending_capacity: PercentileBands;
  success_rate: number;
  probability_of_ruin: number;
  years_of_runway: PercentileBands;
  median_terminal_net_worth: number;
}
