"""Portfolio return model with asset allocation and glide path."""


def weighted_return(
    stocks_pct: float,
    bonds_pct: float,
    cash_pct: float,
    stocks_return: float,
    bonds_return: float,
    cash_return: float = 0.0,
) -> float:
    """Compute weighted portfolio return given allocation and per-class returns (as pct)."""
    return (
        stocks_pct / 100 * stocks_return
        + bonds_pct / 100 * bonds_return
        + cash_pct / 100 * cash_return
    )


def glide_path_allocation(
    year: int,
    retirement_year: int,
    glide_start_years_before: int,
    pre_stocks: float,
    pre_bonds: float,
    pre_cash: float,
    post_stocks: float,
    post_bonds: float,
    post_cash: float,
) -> tuple[float, float, float]:
    """
    Linearly interpolate allocation from pre-retirement to post-retirement
    over the glide path period.

    Returns (stocks_pct, bonds_pct, cash_pct).
    """
    glide_start = retirement_year - glide_start_years_before

    if year <= glide_start:
        return pre_stocks, pre_bonds, pre_cash
    if year >= retirement_year:
        return post_stocks, post_bonds, post_cash

    # Linear interpolation
    progress = (year - glide_start) / glide_start_years_before
    stocks = pre_stocks + (post_stocks - pre_stocks) * progress
    bonds = pre_bonds + (post_bonds - pre_bonds) * progress
    cash = pre_cash + (post_cash - pre_cash) * progress
    return stocks, bonds, cash


def compute_portfolio_return(
    portfolio_value: float,
    year: int,
    retirement_year: int,
    assumptions: "dict",
) -> float:
    """
    Compute investment return for a given year using allocation and return assumptions.

    Args:
        portfolio_value: current portfolio value
        year: projection year
        retirement_year: target retirement year
        assumptions: scenario assumptions dict-like

    Returns:
        dollar amount of investment return
    """
    alloc = assumptions["asset_allocation"]
    returns = assumptions["investment_returns"]

    stocks_pct, bonds_pct, cash_pct = glide_path_allocation(
        year=year,
        retirement_year=retirement_year,
        glide_start_years_before=alloc["glide_path_start_years_before"],
        pre_stocks=alloc["pre_retirement"]["stocks_pct"],
        pre_bonds=alloc["pre_retirement"]["bonds_pct"],
        pre_cash=alloc["pre_retirement"]["cash_pct"],
        post_stocks=alloc["post_retirement"]["stocks_pct"],
        post_bonds=alloc["post_retirement"]["bonds_pct"],
        post_cash=alloc["post_retirement"]["cash_pct"],
    )

    rate = weighted_return(
        stocks_pct=stocks_pct,
        bonds_pct=bonds_pct,
        cash_pct=cash_pct,
        stocks_return=returns["stocks_mean_pct"],
        bonds_return=returns["bonds_mean_pct"],
        cash_return=0.0,
    )

    return portfolio_value * rate / 100
