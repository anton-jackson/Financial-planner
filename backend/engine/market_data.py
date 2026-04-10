"""Market data service — fetches quotes from Yahoo Finance using stdlib only.

Provides current prices, basic security info, and asset classification
for stocks, ETFs, and mutual funds. Prices are end-of-day (not real-time).
"""

from __future__ import annotations

import json
import time
import urllib.request
import urllib.error
from dataclasses import dataclass, asdict

# Simple in-memory cache: {ticker: (QuoteResult, timestamp)}
_quote_cache: dict[str, tuple[dict, float]] = {}
CACHE_TTL = 3600  # 1 hour — prices don't need to be real-time


@dataclass
class QuoteResult:
    ticker: str
    price: float
    name: str
    currency: str
    asset_class: str  # equity, bond, etf, mutual_fund, crypto, unknown
    category: str  # e.g., "Large Blend", "Intermediate-Term Bond", ""
    exchange: str
    error: str | None = None


# Map Yahoo Finance quoteType to our asset classes
_QUOTE_TYPE_MAP = {
    "EQUITY": "equity",
    "ETF": "etf",
    "MUTUALFUND": "mutual_fund",
    "CRYPTOCURRENCY": "crypto",
    "INDEX": "index",
}


def _classify_by_name(name: str, category: str) -> str:
    """Rough asset class classification from fund name/category."""
    lower = (name + " " + category).lower()
    if any(w in lower for w in ("bond", "fixed income", "treasury", "aggregate", "income")):
        return "bonds"
    if any(w in lower for w in ("international", "emerging", "foreign", "world", "global ex-us")):
        return "intl_equity"
    if any(w in lower for w in ("real estate", "reit")):
        return "real_estate"
    if any(w in lower for w in ("commodity", "gold", "silver")):
        return "commodities"
    if any(w in lower for w in ("money market", "cash", "short-term")):
        return "cash"
    return "us_equity"


def fetch_quote(ticker: str) -> QuoteResult:
    """Fetch a single ticker quote from Yahoo Finance.

    Returns cached result if less than CACHE_TTL seconds old.
    """
    ticker = ticker.upper().strip()

    # Common crypto symbols — auto-append -USD if needed
    # Users can type "BTC" and we'll look up "BTC-USD"
    CRYPTO_SYMBOLS = {
        "BTC", "ETH", "SOL", "DOGE", "ADA", "XRP", "DOT", "AVAX", "MATIC",
        "LINK", "UNI", "ATOM", "LTC", "NEAR", "ARB", "OP", "APT", "SUI",
        "SHIB", "PEPE", "FIL", "AAVE", "MKR", "CRV", "ALGO",
    }
    if ticker in CRYPTO_SYMBOLS:
        ticker = f"{ticker}-USD"

    # Check cache
    now = time.time()
    if ticker in _quote_cache:
        cached, ts = _quote_cache[ticker]
        if now - ts < CACHE_TTL:
            return QuoteResult(**cached)

    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}"
        f"?interval=1d&range=1d"
    )

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "FinancePlanner/1.0"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read())
    except (urllib.error.URLError, urllib.error.HTTPError, json.JSONDecodeError) as exc:
        return QuoteResult(
            ticker=ticker, price=0, name="", currency="",
            asset_class="unknown", category="", exchange="",
            error=f"Failed to fetch {ticker}: {exc}",
        )

    chart = data.get("chart", {})
    results = chart.get("result")
    if not results:
        err = chart.get("error", {}).get("description", "Unknown error")
        return QuoteResult(
            ticker=ticker, price=0, name="", currency="",
            asset_class="unknown", category="", exchange="",
            error=f"No data for {ticker}: {err}",
        )

    result = results[0]
    meta = result.get("meta", {})

    price = meta.get("regularMarketPrice", 0)
    currency = meta.get("currency", "USD")
    exchange = meta.get("exchangeName", "")
    quote_type = meta.get("instrumentType", "") or meta.get("quoteType", "")
    name = meta.get("shortName", "") or meta.get("longName", ticker)

    asset_class = _QUOTE_TYPE_MAP.get(quote_type, "unknown")
    category = ""  # chart endpoint doesn't return category; we classify by name

    quote = QuoteResult(
        ticker=ticker,
        price=round(price, 2),
        name=name,
        currency=currency,
        asset_class=asset_class,
        category=category,
        exchange=exchange,
    )

    _quote_cache[ticker] = (asdict(quote), now)
    return quote


def fetch_quotes(tickers: list[str]) -> dict[str, QuoteResult]:
    """Fetch quotes for multiple tickers. Returns {ticker: QuoteResult}."""
    results = {}
    for ticker in tickers:
        results[ticker.upper().strip()] = fetch_quote(ticker)
    return results
