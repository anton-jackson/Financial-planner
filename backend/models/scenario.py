from pydantic import BaseModel


class ReturnProfile(BaseModel):
    mean_pct: float
    stddev_pct: float


class InvestmentReturns(BaseModel):
    stocks_mean_pct: float = 8.0
    stocks_stddev_pct: float = 16.0
    bonds_mean_pct: float = 4.0
    bonds_stddev_pct: float = 6.0
    real_estate_appreciation_pct: float = 3.5


class Inflation(BaseModel):
    general_mean_pct: float = 3.0
    general_stddev_pct: float = 1.0
    college_tuition_pct: float = 5.0
    healthcare_pct: float = 6.0


class AssetAllocation(BaseModel):
    stocks_pct: float = 70
    bonds_pct: float = 25
    cash_pct: float = 5


class AllocationStrategy(BaseModel):
    pre_retirement: AssetAllocation = AssetAllocation()
    post_retirement: AssetAllocation = AssetAllocation(stocks_pct=50, bonds_pct=40, cash_pct=10)
    glide_path_start_years_before: int = 5


class CollegeAssumptions(BaseModel):
    annual_cost_today: float = 65000
    room_and_board_today: float = 18000
    financial_aid_annual: float = 0
    scholarship_annual: float = 0


class SocialSecurityAssumptions(BaseModel):
    primary_pia_at_67: float = 3200
    spouse_pia_at_67: float = 1800
    claiming_age_primary: int = 67
    claiming_age_spouse: int = 67
    cola_pct: float = 2.0


class HealthcareAssumptions(BaseModel):
    annual_premium_today: float = 24000
    annual_out_of_pocket_today: float = 6000
    pre_medicare_gap_years: int = 2
    aca_marketplace_annual: float = 30000
    medicare_annual: float = 8000


class LargePurchase(BaseModel):
    name: str
    year: int
    purchase_price: float = 0
    down_payment_pct: float = 25
    mortgage_rate_pct: float = 6.5
    mortgage_term_years: int = 30
    # Annual carrying costs (property tax, insurance, maintenance, HOA, utilities)
    annual_carrying_cost: float = 0
    annual_property_tax: float = 0
    # Rental conversion fields
    is_rental_conversion: bool = False
    conversion_cost: float = 0
    monthly_rental_income: float = 0
    vacancy_rate_pct: float = 8
    annual_maintenance_pct: float = 1.0
    property_management_pct: float = 10
    current_mortgage_balance: float = 0
    current_mortgage_payment: float = 0


class LifeEvent(BaseModel):
    """One-time cash event (inheritance, windfall, major expense, etc.)."""
    name: str
    year: int
    amount: float = 0  # positive = inflow to portfolio, negative = outflow
    taxable: bool = False  # if True, apply income tax rate
    tax_rate_override: float | None = None  # custom rate (e.g. estate tax), None = use profile rate


class Assumptions(BaseModel):
    investment_returns: InvestmentReturns = InvestmentReturns()
    inflation: Inflation = Inflation()
    asset_allocation: AllocationStrategy = AllocationStrategy()
    college: CollegeAssumptions = CollegeAssumptions()
    social_security: SocialSecurityAssumptions = SocialSecurityAssumptions()
    healthcare: HealthcareAssumptions = HealthcareAssumptions()
    large_purchases: list[LargePurchase] = []
    life_events: list[LifeEvent] = []
    return_profiles: dict[str, ReturnProfile] = {}


class Scenario(BaseModel):
    schema_version: int = 1
    name: str
    description: str = ""
    assumptions: Assumptions = Assumptions()
