export interface ReturnProfile {
  mean_pct: number;
  stddev_pct: number;
}

export interface InvestmentReturns {
  stocks_mean_pct: number;
  stocks_stddev_pct: number;
  bonds_mean_pct: number;
  bonds_stddev_pct: number;
  real_estate_appreciation_pct: number;
}

export interface Inflation {
  general_mean_pct: number;
  general_stddev_pct: number;
  college_tuition_pct: number;
  healthcare_pct: number;
}

export interface AssetAllocation {
  stocks_pct: number;
  bonds_pct: number;
  cash_pct: number;
}

export interface AllocationStrategy {
  pre_retirement: AssetAllocation;
  post_retirement: AssetAllocation;
  glide_path_start_years_before: number;
}

export interface CollegeAssumptions {
  annual_cost_today: number;
  room_and_board_today: number;
  financial_aid_annual: number;
  scholarship_annual: number;
}

export interface SocialSecurityAssumptions {
  primary_pia_at_67: number;
  spouse_pia_at_67: number;
  claiming_age_primary: number;
  claiming_age_spouse: number;
  cola_pct: number;
}

export interface HealthcareAssumptions {
  annual_premium_today: number;
  annual_out_of_pocket_today: number;
  pre_medicare_gap_years: number;
  aca_marketplace_annual: number;
  medicare_annual: number;
}

export interface LargePurchase {
  name: string;
  year: number;
  purchase_price: number;
  down_payment_pct: number;
  mortgage_rate_pct: number;
  mortgage_term_years: number;
  annual_carrying_cost: number;
  annual_property_tax: number;
  is_rental_conversion: boolean;
  conversion_cost: number;
  monthly_rental_income: number;
  vacancy_rate_pct: number;
  annual_maintenance_pct: number;
  property_management_pct: number;
  current_mortgage_balance: number;
  current_mortgage_payment: number;
}

export interface LifeEvent {
  name: string;
  year: number;
  amount: number;
  taxable: boolean;
  tax_rate_override: number | null;
}

export interface Assumptions {
  investment_returns: InvestmentReturns;
  inflation: Inflation;
  asset_allocation: AllocationStrategy;
  college: CollegeAssumptions;
  social_security: SocialSecurityAssumptions;
  healthcare: HealthcareAssumptions;
  large_purchases: LargePurchase[];
  life_events: LifeEvent[];
  return_profiles: Record<string, ReturnProfile>;
}

export interface Scenario {
  schema_version: number;
  name: string;
  description: string;
  assumptions: Assumptions;
}

export interface ScenarioListItem {
  slug: string;
  name: string;
}
