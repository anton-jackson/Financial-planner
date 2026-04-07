"""Social Security benefit estimation based on claiming age."""

# Benefit adjustment factors relative to Full Retirement Age (67)
# Source: SSA actuarial adjustments
_CLAIMING_FACTORS = {
    62: 0.700,
    63: 0.750,
    64: 0.800,
    65: 0.867,
    66: 0.933,
    67: 1.000,  # Full Retirement Age
    68: 1.080,
    69: 1.160,
    70: 1.240,
}


def benefit_at_claiming_age(pia_at_67: float, claiming_age: int) -> float:
    """
    Monthly benefit amount based on PIA at FRA and chosen claiming age.

    Args:
        pia_at_67: Primary Insurance Amount at full retirement age (monthly)
        claiming_age: age at which benefits are claimed (62-70)

    Returns:
        Monthly benefit amount
    """
    factor = _CLAIMING_FACTORS.get(claiming_age)
    if factor is None:
        # Interpolate for non-integer ages or clamp
        if claiming_age < 62:
            factor = _CLAIMING_FACTORS[62]
        elif claiming_age > 70:
            factor = _CLAIMING_FACTORS[70]
        else:
            # Linear interpolation between surrounding ages
            lower = max(a for a in _CLAIMING_FACTORS if a <= claiming_age)
            upper = min(a for a in _CLAIMING_FACTORS if a >= claiming_age)
            if lower == upper:
                factor = _CLAIMING_FACTORS[lower]
            else:
                t = (claiming_age - lower) / (upper - lower)
                factor = _CLAIMING_FACTORS[lower] + t * (
                    _CLAIMING_FACTORS[upper] - _CLAIMING_FACTORS[lower]
                )
    return pia_at_67 * factor


def compute_social_security(
    year: int,
    birth_year: int,
    pia_at_67: float,
    claiming_age: int,
    cola_pct: float,
    base_year: int,
) -> float:
    """
    Compute annual Social Security income for a given year.

    Returns $0 if the person hasn't reached claiming age yet.
    After claiming, applies COLA adjustments from the year benefits start.

    Args:
        year: projection year
        birth_year: person's birth year
        pia_at_67: monthly PIA at full retirement age
        claiming_age: age at which benefits start
        cola_pct: annual cost-of-living adjustment
        base_year: first year of simulation (for COLA compounding)

    Returns:
        Annual SS income
    """
    age = year - birth_year
    claiming_year = birth_year + claiming_age

    if year < claiming_year:
        return 0.0

    monthly = benefit_at_claiming_age(pia_at_67, claiming_age)

    # Apply COLA from claiming year forward
    years_of_cola = year - claiming_year
    if years_of_cola > 0:
        monthly *= (1 + cola_pct / 100) ** years_of_cola

    return monthly * 12
