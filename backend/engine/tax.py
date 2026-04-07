"""
Progressive federal + state tax computation for financial planning.

Supports MFJ, Single, and Head of Household brackets with inflation
adjustment, long-term capital gains brackets, NIIT, Social Security
taxation, and state income taxes.
"""

from __future__ import annotations

from engine.inflation import real_to_nominal

# ─────────────────────────────────────────────────────────────────────
# Filing status constants
# ─────────────────────────────────────────────────────────────────────

FILING_STATUSES = {"mfj", "single", "hoh"}

# ─────────────────────────────────────────────────────────────────────
# 2026 Federal Income Tax Brackets (projected, TCJA extended)
# Each tuple: (upper_bound, marginal_rate)
# ─────────────────────────────────────────────────────────────────────

FEDERAL_BRACKETS_2026 = {
    "mfj": [
        (23_850, 0.10),
        (96_950, 0.12),
        (206_700, 0.22),
        (394_600, 0.24),
        (501_050, 0.32),
        (751_600, 0.35),
        (float("inf"), 0.37),
    ],
    "single": [
        (11_925, 0.10),
        (48_475, 0.12),
        (103_350, 0.22),
        (197_300, 0.24),
        (250_525, 0.32),
        (626_350, 0.35),
        (float("inf"), 0.37),
    ],
    "hoh": [
        (17_000, 0.10),
        (64_850, 0.12),
        (103_350, 0.22),
        (197_300, 0.24),
        (250_500, 0.32),
        (626_350, 0.35),
        (float("inf"), 0.37),
    ],
}

STANDARD_DEDUCTION_2026 = {
    "mfj": 32_300,
    "single": 16_150,
    "hoh": 24_200,
}

# ─────────────────────────────────────────────────────────────────────
# 2026 Long-Term Capital Gains Brackets
# ─────────────────────────────────────────────────────────────────────

LTCG_BRACKETS_2026 = {
    "mfj": [
        (96_700, 0.00),
        (600_050, 0.15),
        (float("inf"), 0.20),
    ],
    "single": [
        (48_350, 0.00),
        (533_400, 0.15),
        (float("inf"), 0.20),
    ],
    "hoh": [
        (64_750, 0.00),
        (566_700, 0.15),
        (float("inf"), 0.20),
    ],
}

# ─────────────────────────────────────────────────────────────────────
# NIIT thresholds by filing status
# ─────────────────────────────────────────────────────────────────────

NIIT_THRESHOLD = {
    "mfj": 250_000,
    "single": 200_000,
    "hoh": 200_000,
}
NIIT_RATE = 0.038

# ─────────────────────────────────────────────────────────────────────
# Additional Medicare threshold by filing status
# ─────────────────────────────────────────────────────────────────────

ADDL_MEDICARE_THRESHOLD = {
    "mfj": 250_000,
    "single": 200_000,
    "hoh": 200_000,
}

# Social Security taxation thresholds (MFJ vs single/HoH)
SS_COMBINED_INCOME_THRESHOLDS = {
    "mfj": (32_000, 44_000),
    "single": (25_000, 34_000),
    "hoh": (25_000, 34_000),
}

BASE_YEAR = 2026

# ─────────────────────────────────────────────────────────────────────
# FICA / Payroll Tax Constants (2026 projected)
# ─────────────────────────────────────────────────────────────────────

SS_WAGE_CAP_2026 = 172_800
SS_RATE = 0.062
MEDICARE_RATE = 0.0145
ADDL_MEDICARE_RATE = 0.009

# ─────────────────────────────────────────────────────────────────────
# State Income Tax Data
#
# Flat-rate states: just a single rate.
# Progressive states: list of (upper_bound, rate) tuples.
# States with no income tax: rate = 0.
# ─────────────────────────────────────────────────────────────────────

# States with no income tax
NO_INCOME_TAX_STATES = {"wa", "tx", "fl", "nv", "wy", "sd", "ak", "tn", "nh"}
# Note: TN and NH tax only interest/dividends (TN fully repealed 2021,
# NH repealing 2025). We treat them as no income tax for simplicity.

# Flat-rate state income taxes (2025/2026 projected)
FLAT_RATE_STATES = {
    "ia": 0.038,    # Iowa: flat 3.8% starting 2025
    "il": 0.0495,   # Illinois: flat 4.95%
    "mi": 0.0425,   # Michigan: flat 4.25%
    "pa": 0.0307,   # Pennsylvania: flat 3.07%
    "in": 0.0305,   # Indiana: flat 3.05%
    "nc": 0.045,    # North Carolina: flat 4.5% (2025)
    "az": 0.025,    # Arizona: flat 2.5%
    "co": 0.044,    # Colorado: flat 4.4%
    "ut": 0.0465,   # Utah: flat 4.65%
    "ky": 0.04,     # Kentucky: flat 4.0%
    "ma": 0.05,     # Massachusetts: flat 5% (+ 4% surtax on >$1M, handled below)
    "ms": 0.05,     # Mississippi: flat 5% (starting 2026)
    "nd": 0.0195,   # North Dakota: flat 1.95%
}

# Progressive state brackets (2025/2026 projected, single filer)
# For simplicity, we store single filer brackets. MFJ is roughly 2x thresholds
# for most states. The engine applies a `mfj_multiplier` to thresholds.
STATE_PROGRESSIVE_BRACKETS = {
    "ca": {
        "single": [
            (10_412, 0.01),
            (24_684, 0.02),
            (38_959, 0.04),
            (54_081, 0.06),
            (68_350, 0.08),
            (349_137, 0.093),
            (418_961, 0.103),
            (698_271, 0.113),
            (1_000_000, 0.123),
            (float("inf"), 0.133),
        ],
        "mfj": [
            (20_824, 0.01),
            (49_368, 0.02),
            (77_918, 0.04),
            (108_162, 0.06),
            (136_700, 0.08),
            (698_274, 0.093),
            (837_922, 0.103),
            (1_396_542, 0.113),
            (1_000_000 * 2, 0.123),  # mental health surtax threshold
            (float("inf"), 0.133),
        ],
        "hoh": [
            (20_839, 0.01),
            (49_371, 0.02),
            (63_644, 0.04),
            (78_765, 0.06),
            (93_037, 0.08),
            (474_824, 0.093),
            (569_790, 0.103),
            (949_649, 0.113),
            (1_000_000, 0.123),
            (float("inf"), 0.133),
        ],
    },
    "ny": {
        "single": [
            (8_500, 0.04),
            (11_700, 0.045),
            (13_900, 0.0525),
            (80_650, 0.0585),
            (215_400, 0.0625),
            (1_077_550, 0.0685),
            (5_000_000, 0.0965),
            (25_000_000, 0.103),
            (float("inf"), 0.109),
        ],
        "mfj": [
            (17_150, 0.04),
            (23_600, 0.045),
            (27_900, 0.0525),
            (161_550, 0.0585),
            (323_200, 0.0625),
            (2_155_350, 0.0685),
            (5_000_000, 0.0965),
            (25_000_000, 0.103),
            (float("inf"), 0.109),
        ],
        "hoh": [
            (12_800, 0.04),
            (17_650, 0.045),
            (20_900, 0.0525),
            (107_650, 0.0585),
            (269_300, 0.0625),
            (1_616_450, 0.0685),
            (5_000_000, 0.0965),
            (25_000_000, 0.103),
            (float("inf"), 0.109),
        ],
    },
    "nj": {
        "single": [
            (20_000, 0.014),
            (35_000, 0.0175),
            (40_000, 0.035),
            (75_000, 0.05525),
            (500_000, 0.0637),
            (1_000_000, 0.0897),
            (float("inf"), 0.1075),
        ],
        "mfj": [
            (20_000, 0.014),
            (50_000, 0.0175),
            (70_000, 0.035),
            (80_000, 0.05525),
            (150_000, 0.0637),
            (500_000, 0.0897),
            (1_000_000, 0.1075),
            (float("inf"), 0.1075),
        ],
        "hoh": [
            (20_000, 0.014),
            (50_000, 0.0175),
            (70_000, 0.035),
            (80_000, 0.05525),
            (150_000, 0.0637),
            (500_000, 0.0897),
            (1_000_000, 0.1075),
            (float("inf"), 0.1075),
        ],
    },
    "mn": {
        "single": [
            (31_690, 0.0535),
            (104_090, 0.068),
            (193_240, 0.0785),
            (float("inf"), 0.0985),
        ],
        "mfj": [
            (46_330, 0.0535),
            (184_040, 0.068),
            (321_450, 0.0785),
            (float("inf"), 0.0985),
        ],
        "hoh": [
            (39_810, 0.0535),
            (159_130, 0.068),
            (257_340, 0.0785),
            (float("inf"), 0.0985),
        ],
    },
    "or": {
        "single": [
            (4_050, 0.0475),
            (10_200, 0.0675),
            (125_000, 0.0875),
            (float("inf"), 0.099),
        ],
        "mfj": [
            (8_100, 0.0475),
            (20_400, 0.0675),
            (250_000, 0.0875),
            (float("inf"), 0.099),
        ],
        "hoh": [
            (4_050, 0.0475),
            (10_200, 0.0675),
            (125_000, 0.0875),
            (float("inf"), 0.099),
        ],
    },
    "hi": {
        "single": [
            (2_400, 0.014),
            (4_800, 0.032),
            (9_600, 0.055),
            (14_400, 0.064),
            (19_200, 0.068),
            (24_000, 0.072),
            (36_000, 0.076),
            (48_000, 0.079),
            (150_000, 0.0825),
            (175_000, 0.09),
            (200_000, 0.10),
            (float("inf"), 0.11),
        ],
        "mfj": [
            (4_800, 0.014),
            (9_600, 0.032),
            (19_200, 0.055),
            (28_800, 0.064),
            (38_400, 0.068),
            (48_000, 0.072),
            (72_000, 0.076),
            (96_000, 0.079),
            (300_000, 0.0825),
            (350_000, 0.09),
            (400_000, 0.10),
            (float("inf"), 0.11),
        ],
        "hoh": [
            (3_600, 0.014),
            (7_200, 0.032),
            (14_400, 0.055),
            (21_600, 0.064),
            (28_800, 0.068),
            (36_000, 0.072),
            (54_000, 0.076),
            (72_000, 0.079),
            (225_000, 0.0825),
            (262_500, 0.09),
            (300_000, 0.10),
            (float("inf"), 0.11),
        ],
    },
}


def _normalize_filing_status(filing_status: str) -> str:
    """Normalize and validate filing status string."""
    fs = filing_status.lower().strip()
    if fs in FILING_STATUSES:
        return fs
    # Common aliases
    aliases = {
        "married": "mfj",
        "married_filing_jointly": "mfj",
        "head_of_household": "hoh",
    }
    if fs in aliases:
        return aliases[fs]
    raise ValueError(f"Unknown filing status: {filing_status!r}. Use: mfj, single, hoh")


def _inflate_brackets(
    brackets: list[tuple[float, float]],
    year: int,
    inflation_pct: float,
) -> list[tuple[float, float]]:
    """Inflate bracket thresholds from 2026 base year."""
    if year <= BASE_YEAR:
        return brackets
    result = []
    for upper, rate in brackets:
        if upper == float("inf"):
            result.append((upper, rate))
        else:
            result.append((real_to_nominal(upper, year, BASE_YEAR, inflation_pct), rate))
    return result


def _compute_progressive_tax(
    taxable_income: float,
    brackets: list[tuple[float, float]],
) -> tuple[float, float]:
    """
    Apply progressive brackets to taxable income.

    Returns:
        (total_tax, marginal_rate)
    """
    if taxable_income <= 0:
        return 0.0, brackets[0][1] if brackets else 0.10

    tax = 0.0
    prev_upper = 0.0
    marginal_rate = brackets[0][1] if brackets else 0.10

    for upper, rate in brackets:
        if taxable_income <= prev_upper:
            break
        bracket_income = min(taxable_income, upper) - prev_upper
        if bracket_income > 0:
            tax += bracket_income * rate
            marginal_rate = rate
        prev_upper = upper

    return tax, marginal_rate


def federal_income_tax(
    taxable_income: float,
    year: int = 2026,
    inflation_pct: float = 2.5,
    filing_status: str = "mfj",
) -> tuple[float, float, float]:
    """
    Compute federal income tax using progressive brackets.

    Args:
        taxable_income: AGI minus deductions
        year: tax year for bracket inflation adjustment
        inflation_pct: general inflation rate for bracket adjustment
        filing_status: "mfj", "single", or "hoh"

    Returns:
        (total_tax, effective_rate_pct, marginal_rate_pct)
    """
    fs = _normalize_filing_status(filing_status)
    brackets = _inflate_brackets(FEDERAL_BRACKETS_2026[fs], year, inflation_pct)

    if taxable_income <= 0:
        return 0.0, 0.0, 10.0

    tax, marginal_rate = _compute_progressive_tax(taxable_income, brackets)
    effective = (tax / taxable_income * 100) if taxable_income > 0 else 0.0
    return tax, effective, marginal_rate * 100


def long_term_cap_gains_tax(
    ltcg_income: float,
    ordinary_taxable_income: float,
    year: int = 2026,
    inflation_pct: float = 2.5,
    filing_status: str = "mfj",
) -> float:
    """
    Compute federal LTCG tax. LTCG stacks on top of ordinary income
    to determine which LTCG bracket applies.

    Returns: dollar amount of tax on LTCG income
    """
    if ltcg_income <= 0:
        return 0.0

    fs = _normalize_filing_status(filing_status)
    brackets = _inflate_brackets(LTCG_BRACKETS_2026[fs], year, inflation_pct)
    tax = 0.0
    filled = max(0, ordinary_taxable_income)
    remaining = ltcg_income

    for upper, rate in brackets:
        if remaining <= 0:
            break
        space = max(0, upper - filled)
        if space <= 0:
            continue
        amount = min(remaining, space)
        tax += amount * rate
        filled += amount
        remaining -= amount

    return tax


def fica_tax(
    earned_income: float,
    year: int = 2026,
    inflation_pct: float = 2.5,
    filing_status: str = "mfj",
) -> tuple[float, float, float]:
    """
    Compute employee-side FICA taxes on earned income.

    Returns:
        (ss_tax, medicare_tax, additional_medicare_tax)
    """
    fs = _normalize_filing_status(filing_status)
    ss_cap = real_to_nominal(SS_WAGE_CAP_2026, year, BASE_YEAR, inflation_pct)

    ss_tax = min(earned_income, ss_cap) * SS_RATE
    medicare = earned_income * MEDICARE_RATE
    threshold = ADDL_MEDICARE_THRESHOLD[fs]
    addl_medicare = max(0, earned_income - threshold) * ADDL_MEDICARE_RATE

    return ss_tax, medicare, addl_medicare


def niit_tax(
    magi: float,
    net_investment_income: float,
    filing_status: str = "mfj",
) -> float:
    """
    Net Investment Income Tax: 3.8% on the lesser of NII or
    MAGI exceeding the threshold.
    """
    fs = _normalize_filing_status(filing_status)
    threshold = NIIT_THRESHOLD[fs]
    if magi <= threshold or net_investment_income <= 0:
        return 0.0
    excess = magi - threshold
    return min(excess, net_investment_income) * NIIT_RATE


def social_security_taxable_pct(
    combined_income: float,
    filing_status: str = "mfj",
) -> float:
    """
    Determine what % of SS benefits are taxable based on
    'combined income' (AGI + nontaxable interest + 50% of SS).

    Returns: 0.0, 0.50, or 0.85
    """
    fs = _normalize_filing_status(filing_status)
    thresh1, thresh2 = SS_COMBINED_INCOME_THRESHOLDS[fs]
    if combined_income <= thresh1:
        return 0.0
    if combined_income <= thresh2:
        return 0.50
    return 0.85


def standard_deduction(
    year: int = 2026,
    inflation_pct: float = 2.5,
    filing_status: str = "mfj",
) -> float:
    """Standard deduction, inflation-adjusted."""
    fs = _normalize_filing_status(filing_status)
    return real_to_nominal(STANDARD_DEDUCTION_2026[fs], year, BASE_YEAR, inflation_pct)


def compute_pretax_deductions(
    traditional_401k: float,
    traditional_ira: float,
    hsa: float,
    std_deduction: float,
) -> float:
    """Sum of all items that reduce taxable income."""
    return traditional_401k + traditional_ira + hsa + std_deduction


# ─────────────────────────────────────────────────────────────────────
# State Income Tax
# ─────────────────────────────────────────────────────────────────────

def state_income_tax(
    taxable_income: float,
    state: str,
    filing_status: str = "mfj",
    year: int = 2026,
    inflation_pct: float = 2.5,
) -> float:
    """
    Compute state income tax.

    Supports:
    - No-income-tax states (WA, TX, FL, etc.)
    - Flat-rate states (IA, IL, PA, etc.)
    - Progressive-bracket states (CA, NY, NJ, MN, OR, HI)
    - Fallback: uses profile's state_income_tax_pct if state not in our database

    Args:
        taxable_income: state taxable income (simplified: same as federal)
        state: two-letter state abbreviation (lowercase)
        filing_status: "mfj", "single", or "hoh"
        year: for inflation adjustment of brackets
        inflation_pct: for bracket inflation

    Returns:
        Dollar amount of state income tax
    """
    if taxable_income <= 0:
        return 0.0

    st = state.lower().strip()

    # No income tax states
    if st in NO_INCOME_TAX_STATES:
        return 0.0

    # Flat rate states
    if st in FLAT_RATE_STATES:
        rate = FLAT_RATE_STATES[st]
        tax = taxable_income * rate

        # Massachusetts surtax: additional 4% on income over $1M
        if st == "ma" and taxable_income > 1_000_000:
            tax += (taxable_income - 1_000_000) * 0.04

        return tax

    # Progressive bracket states
    if st in STATE_PROGRESSIVE_BRACKETS:
        fs = _normalize_filing_status(filing_status)
        state_data = STATE_PROGRESSIVE_BRACKETS[st]
        brackets = state_data.get(fs, state_data.get("single", []))
        brackets = _inflate_brackets(brackets, year, inflation_pct)
        tax, _ = _compute_progressive_tax(taxable_income, brackets)
        return tax

    # Unknown state — return 0 (caller can add flat override via TaxConfig)
    return 0.0


# ─────────────────────────────────────────────────────────────────────
# Child Tax Credit
# ─────────────────────────────────────────────────────────────────────

CTC_AMOUNT = 2_000  # per qualifying child
CTC_PHASEOUT_THRESHOLD = {
    "mfj": 400_000,
    "single": 200_000,
    "hoh": 200_000,
}
CTC_PHASEOUT_RATE = 50  # $50 reduction per $1,000 over threshold


def child_tax_credit(
    num_qualifying_children: int,
    magi: float,
    filing_status: str = "mfj",
) -> float:
    """
    Child Tax Credit: $2,000 per qualifying child (under 17).
    Phases out by $50 per $1,000 of MAGI over threshold.

    Returns: dollar amount of credit (reduces tax owed, not taxable income)
    """
    if num_qualifying_children <= 0:
        return 0.0

    fs = _normalize_filing_status(filing_status)
    full_credit = CTC_AMOUNT * num_qualifying_children
    threshold = CTC_PHASEOUT_THRESHOLD[fs]

    if magi <= threshold:
        return full_credit

    # Phase out: $50 per $1,000 over threshold (round up to next $1,000)
    excess = magi - threshold
    reduction = (int(excess / 1_000) + (1 if excess % 1_000 > 0 else 0)) * CTC_PHASEOUT_RATE
    return max(0, full_credit - reduction)


def compute_year_taxes(
    gross_earned_income: float,
    traditional_deductions: float,
    standard_deduction_amt: float,
    ltcg_income: float = 0,
    social_security_income: float = 0,
    rental_income: float = 0,
    traditional_withdrawal: float = 0,
    rsu_vest_tax_covered: float = 0,
    year: int = 2026,
    inflation_pct: float = 2.5,
    filing_status: str = "mfj",
    state_of_residence: str = "",
    state_tax_override_pct: float | None = None,
    num_qualifying_children: int = 0,
) -> dict:
    """
    Compute all federal + state taxes for a year.

    Args:
        gross_earned_income: salary + bonus + RSU vest income
        traditional_deductions: 401k traditional + IRA traditional + HSA
        standard_deduction_amt: standard deduction for the year
        ltcg_income: long-term capital gains (RSU sales, taxable withdrawals)
        social_security_income: total SS benefits received
        rental_income: net rental income
        traditional_withdrawal: withdrawals from traditional accounts
        rsu_vest_tax_covered: tax already paid via RSU sell-to-cover
        year: tax year
        inflation_pct: for bracket inflation
        filing_status: "mfj", "single", or "hoh"
        state_of_residence: two-letter state code (e.g., "wa", "ia", "ca")
        state_tax_override_pct: if set, use this flat % instead of state lookup
            (for states not in our database, or user wants manual control)
        num_qualifying_children: children under 17 for Child Tax Credit

    Returns:
        Dict with: federal_income_tax, ltcg_tax, niit, fica, state_tax,
        child_tax_credit, total_tax, cash_tax_owed, rsu_vest_tax_covered,
        effective_rate_pct, marginal_rate_pct
    """
    fs = _normalize_filing_status(filing_status)

    # Determine SS taxable portion
    other_income = (
        gross_earned_income - traditional_deductions
        + rental_income + traditional_withdrawal
    )
    combined = other_income + social_security_income * 0.5
    ss_taxable_frac = social_security_taxable_pct(combined, fs)
    ss_taxable = social_security_income * ss_taxable_frac

    # Ordinary taxable income
    ordinary_taxable = (
        gross_earned_income
        - traditional_deductions
        - standard_deduction_amt
        + rental_income
        + traditional_withdrawal
        + ss_taxable
    )
    ordinary_taxable = max(0, ordinary_taxable)

    # Federal income tax (progressive brackets)
    fed_tax, eff_rate, marginal_rate = federal_income_tax(
        ordinary_taxable, year, inflation_pct, fs
    )

    # LTCG tax
    ltcg = long_term_cap_gains_tax(ltcg_income, ordinary_taxable, year, inflation_pct, fs)

    # NIIT on investment income
    magi = ordinary_taxable + ltcg_income
    nii = ltcg_income + rental_income
    niit_amt = niit_tax(magi, nii, fs)

    # FICA: only on earned income
    ss_tax, medicare, addl_medicare = fica_tax(
        gross_earned_income, year, inflation_pct, fs
    )
    total_fica = ss_tax + medicare + addl_medicare

    # State income tax
    state_tax_amt = 0.0
    if state_tax_override_pct is not None and state_tax_override_pct > 0:
        # Manual override: apply flat rate to all taxable income
        state_taxable = ordinary_taxable + ltcg_income
        state_tax_amt = state_taxable * (state_tax_override_pct / 100)
    elif state_of_residence:
        # State taxable income: most states start from federal AGI
        # Simplified: ordinary_taxable + ltcg (states generally tax LTCG as ordinary)
        state_taxable = ordinary_taxable + ltcg_income
        state_tax_amt = state_income_tax(
            state_taxable, state_of_residence, fs, year, inflation_pct
        )

    # Child Tax Credit (reduces federal tax, not below zero)
    ctc = child_tax_credit(num_qualifying_children, magi, fs)
    fed_tax_after_ctc = max(0, fed_tax - ctc)
    ctc_applied = fed_tax - fed_tax_after_ctc  # actual credit used (may be less than full CTC)

    # Total tax before sell-to-cover credit
    total_before_credit = fed_tax_after_ctc + ltcg + niit_amt + total_fica + state_tax_amt

    # Sell-to-cover credit
    cash_tax_owed = max(0, total_before_credit - rsu_vest_tax_covered)

    total_income = (
        gross_earned_income + social_security_income
        + rental_income + traditional_withdrawal + ltcg_income
    )
    overall_effective = (total_before_credit / total_income * 100) if total_income > 0 else 0.0

    return {
        "federal_income_tax": round(fed_tax_after_ctc, 2),
        "ltcg_tax": round(ltcg, 2),
        "niit": round(niit_amt, 2),
        "fica": round(total_fica, 2),
        "state_tax": round(state_tax_amt, 2),
        "child_tax_credit": round(ctc_applied, 2),
        "ss_taxable_amount": round(ss_taxable, 2),
        "total_tax": round(total_before_credit, 2),
        "cash_tax_owed": round(cash_tax_owed, 2),
        "rsu_vest_tax_covered": round(rsu_vest_tax_covered, 2),
        "effective_rate_pct": round(overall_effective, 2),
        "marginal_rate_pct": round(marginal_rate, 2),
    }
