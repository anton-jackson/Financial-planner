"""Holdings API — CRUD for holdings, market data refresh, and rebalancing."""

from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dependencies import get_storage
from engine.market_data import fetch_quotes
from engine.rebalance import compute_current_allocation, compute_rebalance
from models.assets import AssetsFile
from models.holdings import (
    AccountHoldings,
    AllocationTarget,
    HoldingsFile,
    RebalanceAction,
)
from storage.local import LocalFileStorage

router = APIRouter()
HOLDINGS_PATH = "holdings.yaml"
ASSETS_PATH = "assets.yaml"


def _load_holdings(storage: LocalFileStorage) -> HoldingsFile:
    try:
        data = storage.read(HOLDINGS_PATH)
        return HoldingsFile(**data)
    except FileNotFoundError:
        return HoldingsFile()


def _save_holdings(storage: LocalFileStorage, holdings: HoldingsFile) -> None:
    storage.write(HOLDINGS_PATH, holdings.model_dump())


def _account_type_map(storage: LocalFileStorage) -> dict[str, str]:
    """Build {account_name: account_type} from assets.yaml."""
    try:
        data = storage.read(ASSETS_PATH)
        assets = AssetsFile(**data)
        return {a.name: a.type for a in assets.assets}
    except FileNotFoundError:
        return {}


@router.get("", response_model=HoldingsFile)
def get_holdings(storage: LocalFileStorage = Depends(get_storage)):
    return _load_holdings(storage)


@router.put("", response_model=HoldingsFile)
def put_holdings(holdings: HoldingsFile, storage: LocalFileStorage = Depends(get_storage)):
    _save_holdings(storage, holdings)
    return holdings


@router.post("/refresh", response_model=HoldingsFile)
def refresh_prices(storage: LocalFileStorage = Depends(get_storage)):
    """Fetch latest market prices for all holdings and update market values."""
    holdings = _load_holdings(storage)

    # Collect all unique tickers
    all_tickers = set()
    for account in holdings.accounts:
        for h in account.holdings:
            if h.ticker:
                all_tickers.add(h.ticker.upper())

    if not all_tickers:
        return holdings

    # Fetch quotes
    quotes = fetch_quotes(list(all_tickers))
    now = datetime.now(timezone.utc).isoformat()

    # Update holdings with prices
    for account in holdings.accounts:
        account_total = 0.0
        for h in account.holdings:
            ticker = h.ticker.upper()
            quote = quotes.get(ticker)
            if quote and not quote.error:
                h.price = quote.price
                h.market_value = round(h.shares * quote.price, 2)
                h.name = quote.name
                if not h.asset_class:
                    from engine.market_data import _classify_by_name
                    h.asset_class = _classify_by_name(quote.name, quote.category)
            else:
                h.market_value = round(h.shares * h.price, 2)
            account_total += h.market_value
        account.total_value = round(account_total, 2)
        account.last_refreshed = now

    _save_holdings(storage, holdings)

    # Also sync account balances to assets.yaml
    _sync_to_assets(storage, holdings)

    return holdings


def _sync_to_assets(storage: LocalFileStorage, holdings: HoldingsFile) -> None:
    """Update account balances in assets.yaml from holdings totals."""
    try:
        data = storage.read(ASSETS_PATH)
        assets = AssetsFile(**data)
    except FileNotFoundError:
        return

    holdings_totals = {a.account_name: a.total_value for a in holdings.accounts}

    changed = False
    for asset in assets.assets:
        if asset.name in holdings_totals:
            asset.balance = holdings_totals[asset.name]
            changed = True

    if changed:
        storage.write(ASSETS_PATH, assets.model_dump())


class QuoteLookupRequest(BaseModel):
    tickers: list[str]


@router.post("/quote")
def lookup_quotes(req: QuoteLookupRequest):
    """Look up current prices for one or more tickers."""
    quotes = fetch_quotes(req.tickers)
    return {
        ticker: {
            "price": q.price,
            "name": q.name,
            "asset_class": q.asset_class,
            "category": q.category,
            "exchange": q.exchange,
            "error": q.error,
        }
        for ticker, q in quotes.items()
    }


@router.get("/allocation")
def get_allocation(storage: LocalFileStorage = Depends(get_storage)):
    """Return current portfolio allocation by asset class."""
    holdings = _load_holdings(storage)
    allocation = compute_current_allocation(holdings.accounts)
    total = sum(a.total_value for a in holdings.accounts)
    return {"total_value": round(total, 2), "allocation": allocation}


class RebalanceRequest(BaseModel):
    targets: list[AllocationTarget]


@router.post("/rebalance", response_model=list[RebalanceAction])
def calculate_rebalance(
    req: RebalanceRequest,
    storage: LocalFileStorage = Depends(get_storage),
):
    """Calculate rebalance trades to align with target allocation."""
    # Validate targets sum to ~100
    total_pct = sum(t.target_pct for t in req.targets)
    if abs(total_pct - 100) > 1:
        raise HTTPException(
            status_code=400,
            detail=f"Target allocations must sum to 100%, got {total_pct}%",
        )

    holdings = _load_holdings(storage)
    type_map = _account_type_map(storage)
    actions = compute_rebalance(holdings.accounts, req.targets, type_map)
    return actions
