"""Holdings model — individual security positions within accounts."""

from __future__ import annotations

from pydantic import BaseModel


class TaxLot(BaseModel):
    """A single purchase lot for cost basis tracking."""
    shares: float
    cost_basis_per_share: float
    purchase_date: str = ""  # ISO date, optional


class Holding(BaseModel):
    """A single security position within an account."""
    ticker: str
    shares: float
    asset_class: str = ""  # us_equity, intl_equity, bonds, real_estate, cash, etc.
    tax_lots: list[TaxLot] = []  # Optional cost basis tracking

    # Populated by market data refresh, not stored
    price: float = 0
    market_value: float = 0
    name: str = ""


class AccountHoldings(BaseModel):
    """Holdings for a single account, linked by account name."""
    account_name: str
    holdings: list[Holding] = []
    total_value: float = 0
    last_refreshed: str = ""  # ISO timestamp of last price refresh


class HoldingsFile(BaseModel):
    """All holdings across all accounts."""
    schema_version: int = 1
    accounts: list[AccountHoldings] = []


class AllocationTarget(BaseModel):
    """A target allocation percentage for an asset class."""
    asset_class: str
    target_pct: float  # 0-100


class RebalanceAction(BaseModel):
    """A suggested trade to rebalance."""
    account_name: str
    ticker: str
    asset_class: str
    action: str  # "buy" or "sell"
    shares: float
    dollar_amount: float
    reason: str  # e.g., "us_equity overweight by 5.2%"
