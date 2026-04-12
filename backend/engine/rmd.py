"""
Required Minimum Distribution (RMD) logic per SECURE 2.0 Act.

RMDs begin at age 73 for traditional IRA / 401(k) / tax-deferred accounts.
Roth IRA/401(k) and HSA have no RMDs during the owner's lifetime
(we assume Roth 401(k) is rolled to Roth IRA at retirement).

The annual RMD is the prior year's ending balance divided by the IRS
Uniform Lifetime Table factor for the owner's age in the distribution year.
"""

from __future__ import annotations

# IRS Uniform Lifetime Table (2022 rev., used for RMDs starting 2022+).
# Each row: age → life-expectancy factor.
# Ages below RMD_START_AGE are not present; callers should check eligibility first.
IRS_UNIFORM_LIFETIME_TABLE: dict[int, float] = {
    72: 27.4,
    73: 26.5,
    74: 25.5,
    75: 24.6,
    76: 23.7,
    77: 22.9,
    78: 22.0,
    79: 21.1,
    80: 20.2,
    81: 19.4,
    82: 18.5,
    83: 17.7,
    84: 16.8,
    85: 16.0,
    86: 15.2,
    87: 14.4,
    88: 13.7,
    89: 12.9,
    90: 12.2,
    91: 11.5,
    92: 10.8,
    93: 10.1,
    94: 9.5,
    95: 8.9,
    96: 8.4,
    97: 7.8,
    98: 7.3,
    99: 6.8,
    100: 6.4,
    101: 6.0,
    102: 5.6,
    103: 5.2,
    104: 4.9,
    105: 4.6,
    106: 4.3,
    107: 4.1,
    108: 3.9,
    109: 3.7,
    110: 3.5,
    111: 3.4,
    112: 3.3,
    113: 3.1,
    114: 3.0,
    115: 2.9,
    116: 2.8,
    117: 2.7,
    118: 2.5,
    119: 2.3,
    120: 2.0,
}

# SECURE 2.0: RMDs begin at age 73 for those reaching 72 after 2022.
RMD_START_AGE = 73


def life_expectancy_factor(age: int) -> float:
    """Look up the IRS Uniform Lifetime Table factor for a given age.

    For ages above the tabulated max, the oldest published factor is reused.
    Raises ValueError if age is below the youngest tabulated age.
    """
    if age in IRS_UNIFORM_LIFETIME_TABLE:
        return IRS_UNIFORM_LIFETIME_TABLE[age]
    max_age = max(IRS_UNIFORM_LIFETIME_TABLE)
    if age > max_age:
        return IRS_UNIFORM_LIFETIME_TABLE[max_age]
    raise ValueError(f"No RMD factor tabulated for age {age}")


def compute_rmd(prior_year_balance: float, age: int) -> float:
    """Compute the RMD for one owner given prior-year ending balance and age.

    Returns 0 if age < RMD_START_AGE or balance <= 0.
    """
    if age < RMD_START_AGE or prior_year_balance <= 0:
        return 0.0
    factor = life_expectancy_factor(age)
    if factor <= 0:
        return 0.0
    return prior_year_balance / factor
