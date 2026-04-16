export interface PersonInfo {
  name: string;
  birth_year: number;
  retirement_age: number;
  life_expectancy_age: number;
  retirement_target_year: number; // computed by backend
  state_of_residence: string;
}

export interface CurrentSchool {
  type: string;
  annual_tuition: number;
  ends_year: number;
}

export interface SchoolStage {
  name: string;
  annual_tuition: number;
  start_year: number;
  end_year: number;
}

export interface Child {
  name: string;
  birth_year: number;
  college_start_year: number;
  college_years: number;
  current_school: CurrentSchool | null;
  school_stages: SchoolStage[];
  plan_529_balance: number;
  plan_529_monthly_contribution: number;
  parent_college_annual: number;
}

export interface VestingTranche {
  shares: number;
  vest_year: number;
  sale_year: number | null;
}

export interface RSUHolding {
  current_price: number;
  annual_growth_rate_pct: number;
  long_term_growth_rate_pct: number | null;
  growth_transition_years: number;
  volatility_pct: number;
  vested_shares: number;
  vested_price: number;
  vested_cost_basis: number; // computed: shares x price
  vested_sale_year: number | null;
  unvested_tranches: VestingTranche[];
  sell_to_cover_pct: number;
  annual_refresh_value: number;
  refresh_end_year: number | null;
  refresh_sale_year: number | null;
  total_unvested_shares: number; // computed by backend
  current_value: number; // computed by backend
}

export interface PrimaryIncome {
  base_salary: number;
  annual_raise_pct: number;
  bonus_pct: number;
  bonus_variability_pct: number;
}

export interface SpouseIncome {
  base_salary: number;
  annual_raise_pct: number;
  bonus_pct: number;
  bonus_variability_pct: number;
}

export interface Income {
  primary: PrimaryIncome;
  rsu: RSUHolding;
  spouse: SpouseIncome | null;
  spouse_rsu: RSUHolding | null;
}

export interface PersonSavings {
  contribution_rate_pct: number;
  bonus_401k_eligible: boolean;
  irs_401k_limit: number;
  annual_401k_traditional: number;
  annual_401k_roth: number;
  employer_match_pct: number;
  employer_contribution_pct: number;
  annual_ira_traditional: number;
  annual_ira_roth: number;
  annual_hsa: number;
  additional_monthly_savings: number;
}

export interface Savings {
  primary: PersonSavings;
  spouse: PersonSavings;
  monthly_529_per_child: number;
}

export interface Expenses {
  annual_base: number;
  retirement_reduction_pct: number;
  per_child_annual: number;
  children_leave_after_college: boolean;
}

/**
 * Optional user-entered current healthcare costs. When present, these override
 * the scenario's pre-retirement healthcare assumptions. ACA and Medicare
 * remain scenario-driven regardless.
 */
export interface HealthcareOverride {
  annual_premium: number | null;
  annual_out_of_pocket: number | null;
}

export interface TaxConfig {
  filing_status: string;
  pre_retirement_effective_pct: number;
  retirement_effective_pct: number;
  long_term_cap_gains_pct: number;
  ss_taxable_pct: number;
  state_income_tax_pct: number;
}

export interface ExistingVehicle {
  name: string;
  current_value: number;
  depreciation_pct: number;
  loan_balance: number;
  loan_rate_pct: number;
  monthly_payment: number;
  loan_remaining_months: number;
}

export interface VehiclePurchase {
  name: string;
  year: number;
  purchase_price: number;
  financed: boolean;
  down_payment_pct: number;
  loan_rate_pct: number;
  loan_term_years: number;
  trade_in_value: number;
}

export interface Windfall {
  name: string;
  year: number;
  amount: number;
  taxable: boolean;
  tax_rate_override: number | null;
  recurring: boolean;
  end_year: number | null;
  notes: string;
}

export interface Debt {
  name: string;
  type: string; // heloc, personal_loc, credit_card, student_loan, medical, other
  balance: number;
  interest_rate_pct: number;
  monthly_payment: number;
  interest_only: boolean;
  payoff_year: number | null;
  credit_limit: number;
}

export interface Profile {
  schema_version: number;
  personal: PersonInfo;
  spouse: PersonInfo | null;
  children: Child[];
  income: Income;
  savings: Savings;
  tax: TaxConfig;
  expenses: Expenses;
  healthcare_override?: HealthcareOverride | null;
  windfalls: Windfall[];
  existing_vehicles: ExistingVehicle[];
  vehicles: VehiclePurchase[];
  debts: Debt[];
}
