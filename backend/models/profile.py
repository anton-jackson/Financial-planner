from pydantic import BaseModel, computed_field


class PersonInfo(BaseModel):
    name: str
    birth_year: int
    retirement_age: int = 65
    life_expectancy_age: int = 90
    state_of_residence: str = ""

    @computed_field
    @property
    def retirement_target_year(self) -> int:
        return self.birth_year + self.retirement_age


class CurrentSchool(BaseModel):
    type: str = ""
    annual_tuition: float = 0
    ends_year: int = 0


class Child(BaseModel):
    name: str
    birth_year: int
    college_start_year: int
    college_years: int = 4
    current_school: CurrentSchool | None = None
    plan_529_balance: float = 0
    plan_529_monthly_contribution: float = 0
    # Parent's annual college contribution in today's dollars.
    # 0 = parent pays full cost after 529 (legacy behavior).
    # Any positive value = parent pays up to this amount; kid covers the rest.
    parent_college_annual: float = 0


class VestingTranche(BaseModel):
    """A single tranche of unvested RSUs."""
    shares: float = 0
    vest_year: int = 2026
    sale_year: int | None = None  # when to sell after vesting (None = hold)


class RSUHolding(BaseModel):
    """RSU model with vesting schedule, cost basis, and tax treatment.

    Each tranche has its own vest_year and sale_year so different lots can be
    sold at different times. Already-vested shares have their own sale_year.
    """
    current_price: float = 0
    annual_growth_rate_pct: float = 7.0  # initial / short-term rate
    long_term_growth_rate_pct: float | None = None  # rate to glide to (None = flat rate)
    growth_transition_years: int = 5  # years to glide from initial to long-term
    volatility_pct: float = 25.0

    # Already-vested shares (in brokerage)
    vested_shares: float = 0
    vested_price: float = 0  # avg price per share at vest (cost basis = shares x price)
    vested_sale_year: int | None = None  # when to sell the already-vested block

    @computed_field
    @property
    def vested_cost_basis(self) -> float:
        return self.vested_shares * self.vested_price

    # Unvested tranches with scheduled vest and sale dates
    unvested_tranches: list[VestingTranche] = []

    # Sell-to-cover: % of shares sold at vest to cover tax withholding
    # Typical: ~37% (22% federal supplemental + 6.2% SS + 1.45% Medicare + state)
    # Set to 0 to handle RSU tax through the normal income-tax path instead
    sell_to_cover_pct: float = 0

    # Annual refresh grant (dollar value granted each year, converted to shares at current price)
    annual_refresh_value: float = 0  # e.g. $50000/yr grant
    refresh_end_year: int | None = None  # last year a refresh grant is issued (e.g. job change)
    refresh_sale_year: int | None = None  # default sale year for refresh grants

    @computed_field
    @property
    def total_unvested_shares(self) -> float:
        return sum(t.shares for t in self.unvested_tranches)

    @computed_field
    @property
    def current_value(self) -> float:
        return (self.vested_shares + self.total_unvested_shares) * self.current_price


class PrimaryIncome(BaseModel):
    base_salary: float = 0
    annual_raise_pct: float = 3.0
    bonus_pct: float = 0
    bonus_variability_pct: float = 5.0


class SpouseIncome(BaseModel):
    base_salary: float = 0
    annual_raise_pct: float = 2.5


class Income(BaseModel):
    primary: PrimaryIncome = PrimaryIncome()
    rsu: RSUHolding = RSUHolding()
    spouse: SpouseIncome | None = None


class PersonSavings(BaseModel):
    """Savings for one person (primary or spouse)."""
    # 401k: enter as contribution_rate_pct of salary, auto-split at IRS limit
    contribution_rate_pct: float = 0  # e.g. 15% of salary
    bonus_401k_eligible: bool = False  # if True, 401k contributions include bonus in comp basis
    irs_401k_limit: float = 24500  # 2026 traditional 401k limit
    # Computed by frontend/engine: traditional = min(salary * rate, limit), roth = remainder
    annual_401k_traditional: float = 0
    annual_401k_roth: float = 0
    employer_match_pct: float = 0
    # Flat employer contribution (% of salary, contributed regardless of employee contribution)
    employer_contribution_pct: float = 0  # e.g. 15% auto-contribution
    annual_ira_traditional: float = 0
    annual_ira_roth: float = 0
    annual_hsa: float = 0
    additional_monthly_savings: float = 0


class Savings(BaseModel):
    primary: PersonSavings = PersonSavings()
    spouse: PersonSavings = PersonSavings()
    monthly_529_per_child: float = 0


class Expenses(BaseModel):
    """Annual household living expenses in today's dollars.

    Excludes mortgage, tuition, and healthcare — those are modeled separately.
    This covers: food, utilities, transport, insurance, travel, subscriptions, etc.
    """
    annual_base: float = 80000  # household spending today (excl mortgage/tuition/healthcare)
    retirement_reduction_pct: float = 20  # % reduction in retirement
    per_child_annual: float = 15000  # per-child cost that drops when they leave
    children_leave_after_college: bool = True  # drop per-child cost after college end


class TaxConfig(BaseModel):
    """Tax configuration for financial planning.

    The engine uses progressive federal brackets + state income tax by default.
    The flat effective rate fields below are legacy/override — kept for backward
    compatibility but ignored when the progressive engine is active.
    """
    # Filing status: "mfj" (married filing jointly), "single", "hoh" (head of household)
    filing_status: str = "mfj"
    # Legacy flat rates (kept for reference / manual override scenarios)
    pre_retirement_effective_pct: float = 32
    retirement_effective_pct: float = 25
    long_term_cap_gains_pct: float = 20
    ss_taxable_pct: float = 85
    # State income tax: if > 0, used as a flat override instead of state bracket lookup
    # Set to 0 to use automatic state tax computation based on state_of_residence
    state_income_tax_pct: float = 0


class ExistingVehicle(BaseModel):
    """A vehicle you currently own."""
    name: str = ""  # "2022 Tesla Model Y"
    current_value: float = 0  # today's estimated value
    depreciation_pct: float = 15  # annual depreciation rate (15% is typical)
    # Existing loan on this vehicle (0 = owned outright)
    loan_balance: float = 0
    loan_rate_pct: float = 6.0
    monthly_payment: float = 0
    loan_remaining_months: int = 0


class VehiclePurchase(BaseModel):
    """A planned future vehicle purchase."""
    name: str = ""  # "Primary Car", "Spouse SUV"
    year: int = 2028  # when to buy
    purchase_price: float = 0  # in today's dollars
    financed: bool = False  # True = auto loan, False = cash
    down_payment_pct: float = 20  # if financed: % down
    loan_rate_pct: float = 6.0  # APR on auto loan
    loan_term_years: int = 5  # loan duration
    trade_in_value: float = 0  # expected trade-in credit (today's dollars)


class Windfall(BaseModel):
    """A known future cash event: inheritance, gift, legal settlement, stock option exercise, etc.

    Unlike scenario life_events, windfalls live on the profile and are included
    in every simulation (baseline + all scenarios).
    """
    name: str = ""
    year: int = 2030
    amount: float = 0  # positive = inflow, negative = outflow
    taxable: bool = False
    tax_rate_override: float | None = None  # None = use profile's effective rate
    recurring: bool = False  # if True, repeats every year from `year` through `end_year`
    end_year: int | None = None  # last year of recurrence (None = until end of horizon)
    notes: str = ""  # freeform context ("Mom's estate", "stock option exercise", etc.)


class HELOC(BaseModel):
    """Home equity line of credit."""
    name: str = ""
    balance: float = 0  # current outstanding balance
    credit_limit: float = 0  # total available (informational)
    interest_rate_pct: float = 8.5  # variable rate
    monthly_payment: float = 0  # current monthly payment
    interest_only: bool = False  # True = interest-only payments
    payoff_year: int | None = None  # target year to pay off (None = pay minimum)


class Profile(BaseModel):
    schema_version: int = 1
    personal: PersonInfo
    spouse: PersonInfo | None = None
    children: list[Child] = []
    income: Income = Income()
    savings: Savings = Savings()
    expenses: Expenses = Expenses()
    tax: TaxConfig = TaxConfig()
    windfalls: list[Windfall] = []
    existing_vehicles: list[ExistingVehicle] = []
    vehicles: list[VehiclePurchase] = []  # planned future purchases
    helocs: list[HELOC] = []
