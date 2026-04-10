"""Rebalance calculator — computes trades to align portfolio with target allocation.

Operates across all accounts as one portfolio. Prefers rebalancing in
tax-advantaged accounts (traditional/roth) to avoid triggering capital
gains in taxable accounts.
"""

from __future__ import annotations

from models.holdings import (
    AccountHoldings,
    AllocationTarget,
    Holding,
    RebalanceAction,
)

# Account types ordered by rebalancing preference
# (prefer trading in tax-advantaged accounts first)
_TAX_PRIORITY = {
    "traditional_401k": 0,
    "roth_401k": 0,
    "traditional_ira": 1,
    "roth_ira": 1,
    "hsa": 1,
    "taxable_brokerage": 2,
    "crypto": 3,
}


def _account_tax_priority(account_name: str, account_type_map: dict[str, str]) -> int:
    """Return tax priority for an account (lower = prefer to trade here)."""
    acct_type = account_type_map.get(account_name, "")
    return _TAX_PRIORITY.get(acct_type, 2)


def compute_current_allocation(
    accounts: list[AccountHoldings],
) -> dict[str, float]:
    """Compute current allocation percentages by asset class across all accounts.

    Returns {asset_class: percentage} where percentages sum to 100.
    """
    class_totals: dict[str, float] = {}
    portfolio_total = 0.0

    for account in accounts:
        for holding in account.holdings:
            mv = holding.market_value or (holding.shares * holding.price)
            asset_class = holding.asset_class or "unclassified"
            class_totals[asset_class] = class_totals.get(asset_class, 0) + mv
            portfolio_total += mv

    if portfolio_total == 0:
        return {}

    return {
        cls: round(val / portfolio_total * 100, 2)
        for cls, val in sorted(class_totals.items())
    }


def compute_rebalance(
    accounts: list[AccountHoldings],
    targets: list[AllocationTarget],
    account_type_map: dict[str, str] | None = None,
) -> list[RebalanceAction]:
    """Compute rebalance trades to align with target allocation.

    Args:
        accounts: Current holdings per account with market values populated.
        targets: Target allocation percentages (must sum to 100).
        account_type_map: {account_name: asset_type} for tax-aware ordering.

    Returns:
        List of RebalanceAction objects (buy/sell suggestions).
    """
    if account_type_map is None:
        account_type_map = {}

    # Total portfolio value
    portfolio_total = 0.0
    for account in accounts:
        for holding in account.holdings:
            portfolio_total += holding.market_value or (holding.shares * holding.price)

    if portfolio_total == 0:
        return []

    # Target amounts by asset class
    target_map = {t.asset_class: t.target_pct for t in targets}
    target_amounts = {cls: portfolio_total * pct / 100 for cls, pct in target_map.items()}

    # Current amounts by asset class
    current_amounts: dict[str, float] = {}
    for account in accounts:
        for holding in account.holdings:
            mv = holding.market_value or (holding.shares * holding.price)
            cls = holding.asset_class or "unclassified"
            current_amounts[cls] = current_amounts.get(cls, 0) + mv

    # Compute deltas: positive = need to buy, negative = need to sell
    all_classes = set(list(target_amounts.keys()) + list(current_amounts.keys()))
    deltas: dict[str, float] = {}
    for cls in all_classes:
        target = target_amounts.get(cls, 0)
        current = current_amounts.get(cls, 0)
        delta = target - current
        if abs(delta) > 1:  # Skip tiny differences (< $1)
            deltas[cls] = delta

    if not deltas:
        return []

    # Build an index of holdings by asset class, sorted by tax priority
    # (prefer selling/buying in tax-advantaged accounts)
    holdings_by_class: dict[str, list[tuple[str, Holding, int]]] = {}
    for account in accounts:
        priority = _account_tax_priority(account.account_name, account_type_map)
        for holding in account.holdings:
            cls = holding.asset_class or "unclassified"
            if cls not in holdings_by_class:
                holdings_by_class[cls] = []
            holdings_by_class[cls].append((account.account_name, holding, priority))

    # Sort each class by priority (tax-advantaged first)
    for cls in holdings_by_class:
        holdings_by_class[cls].sort(key=lambda x: x[2])

    actions: list[RebalanceAction] = []

    for cls, delta in sorted(deltas.items(), key=lambda x: x[1]):
        current = current_amounts.get(cls, 0)
        target = target_amounts.get(cls, 0)
        pct_diff = (current / portfolio_total * 100) - target_map.get(cls, 0) if portfolio_total > 0 else 0

        if delta < 0:
            # Need to sell this class
            remaining = abs(delta)
            class_holdings = holdings_by_class.get(cls, [])
            for acct_name, holding, _priority in class_holdings:
                if remaining <= 0:
                    break
                mv = holding.market_value or (holding.shares * holding.price)
                sell_amount = min(remaining, mv)
                if sell_amount < 1:
                    continue
                sell_shares = sell_amount / holding.price if holding.price > 0 else 0
                actions.append(RebalanceAction(
                    account_name=acct_name,
                    ticker=holding.ticker,
                    asset_class=cls,
                    action="sell",
                    shares=round(sell_shares, 4),
                    dollar_amount=round(sell_amount, 2),
                    reason=f"{cls} overweight by {abs(pct_diff):.1f}%",
                ))
                remaining -= sell_amount

        elif delta > 0:
            # Need to buy this class — suggest buying in most tax-advantaged account
            # that already holds this class, or the most tax-advantaged account overall
            class_holdings = holdings_by_class.get(cls, [])
            if class_holdings:
                acct_name = class_holdings[0][0]
                ticker = class_holdings[0][1].ticker
            else:
                # No existing holding in this class — suggest the most tax-advantaged account
                acct_name = min(
                    [a.account_name for a in accounts],
                    key=lambda n: _account_tax_priority(n, account_type_map),
                    default="",
                )
                ticker = f"[{cls}]"  # Placeholder — user picks the specific security

            actions.append(RebalanceAction(
                account_name=acct_name,
                ticker=ticker,
                asset_class=cls,
                action="buy",
                shares=0,  # Dollar amount is more meaningful for buys
                dollar_amount=round(delta, 2),
                reason=f"{cls} underweight by {abs(pct_diff):.1f}%",
            ))

    return actions
