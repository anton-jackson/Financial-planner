"""Mortgage amortization and rental property P&L."""

import math


def monthly_payment(principal: float, annual_rate_pct: float, term_months: int) -> float:
    """Standard mortgage monthly payment calculation."""
    if annual_rate_pct == 0:
        return principal / term_months if term_months > 0 else 0
    r = annual_rate_pct / 100 / 12
    return principal * (r * (1 + r) ** term_months) / ((1 + r) ** term_months - 1)


def amortize_year(
    balance: float, annual_rate_pct: float, monthly_pmt: float
) -> tuple[float, float, float]:
    """
    Amortize one year of mortgage payments.

    Returns: (new_balance, total_principal_paid, total_interest_paid)
    """
    r = annual_rate_pct / 100 / 12
    total_principal = 0.0
    total_interest = 0.0

    for _ in range(12):
        if balance <= 0:
            break
        interest = balance * r
        principal = min(monthly_pmt - interest, balance)
        if principal < 0:
            principal = 0
        balance -= principal
        total_principal += principal
        total_interest += interest

    return max(balance, 0), total_principal, total_interest


def annual_mortgage_payment(monthly_pmt: float) -> float:
    """Total annual mortgage payment."""
    return monthly_pmt * 12


def rental_property_annual_pl(
    monthly_rent: float,
    vacancy_rate_pct: float,
    property_value: float,
    annual_maintenance_pct: float,
    property_management_pct: float,
    annual_mortgage_pmt: float,
    annual_insurance: float = 2400,
) -> tuple[float, float]:
    """
    Compute annual rental property P&L.

    Returns: (gross_rental_income, net_rental_income)
    """
    gross_annual_rent = monthly_rent * 12
    effective_rent = gross_annual_rent * (1 - vacancy_rate_pct / 100)
    maintenance = property_value * annual_maintenance_pct / 100
    management = effective_rent * property_management_pct / 100

    net = effective_rent - maintenance - management - annual_mortgage_pmt - annual_insurance
    return effective_rent, net


def new_mortgage_from_purchase(
    purchase_price: float, down_payment_pct: float, rate_pct: float, term_years: int
) -> tuple[float, float]:
    """
    Create a new mortgage from a purchase.

    Returns: (loan_amount, monthly_payment)
    """
    loan = purchase_price * (1 - down_payment_pct / 100)
    pmt = monthly_payment(loan, rate_pct, term_years * 12)
    return loan, pmt
