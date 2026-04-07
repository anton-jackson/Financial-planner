"""Inflation adjustment utilities."""


def inflate(amount: float, rate_pct: float, years: int) -> float:
    """Grow an amount by a fixed annual inflation rate over N years."""
    return amount * (1 + rate_pct / 100) ** years


def real_to_nominal(amount_today: float, year: int, base_year: int, rate_pct: float) -> float:
    """Convert a present-value amount to its nominal value in a future year."""
    return inflate(amount_today, rate_pct, year - base_year)


def deflate(future_amount: float, rate_pct: float, years: int) -> float:
    """Convert a future nominal amount back to today's dollars."""
    if years <= 0:
        return future_amount
    return future_amount / (1 + rate_pct / 100) ** years
