"""Unit tests for engine modules."""

import math
import pytest

from engine.inflation import inflate, real_to_nominal, deflate
from engine.investment import weighted_return, glide_path_allocation, compute_portfolio_return
from engine.mortgage import monthly_payment, amortize_year, new_mortgage_from_purchase, rental_property_annual_pl
from engine.social_security import benefit_at_claiming_age, compute_social_security
from engine.healthcare import compute_healthcare_costs
from engine.college import compute_college_costs
from engine.rmd import compute_rmd, life_expectancy_factor, RMD_START_AGE


class TestInflation:
    def test_inflate_zero_years(self):
        assert inflate(100, 3.0, 0) == 100

    def test_inflate_one_year(self):
        assert inflate(100, 3.0, 1) == pytest.approx(103.0)

    def test_inflate_ten_years(self):
        assert inflate(100, 3.0, 10) == pytest.approx(100 * 1.03**10)

    def test_real_to_nominal(self):
        assert real_to_nominal(100, 2030, 2026, 3.0) == pytest.approx(100 * 1.03**4)

    def test_deflate(self):
        future = inflate(100, 3.0, 5)
        assert deflate(future, 3.0, 5) == pytest.approx(100)

    def test_deflate_zero_years(self):
        assert deflate(100, 3.0, 0) == 100


class TestInvestment:
    def test_weighted_return_all_stocks(self):
        assert weighted_return(100, 0, 0, 8.0, 4.0) == pytest.approx(8.0)

    def test_weighted_return_mixed(self):
        # 70% stocks @ 8% + 25% bonds @ 4% + 5% cash @ 0%
        expected = 0.70 * 8.0 + 0.25 * 4.0 + 0.05 * 0.0
        assert weighted_return(70, 25, 5, 8.0, 4.0) == pytest.approx(expected)

    def test_glide_path_before_glide(self):
        s, b, c = glide_path_allocation(
            year=2030, retirement_year=2044,
            glide_start_years_before=5,
            pre_stocks=70, pre_bonds=25, pre_cash=5,
            post_stocks=50, post_bonds=40, post_cash=10,
        )
        assert s == 70
        assert b == 25
        assert c == 5

    def test_glide_path_at_retirement(self):
        s, b, c = glide_path_allocation(
            year=2044, retirement_year=2044,
            glide_start_years_before=5,
            pre_stocks=70, pre_bonds=25, pre_cash=5,
            post_stocks=50, post_bonds=40, post_cash=10,
        )
        assert s == 50
        assert b == 40
        assert c == 10

    def test_glide_path_midway(self):
        # 2041 is 2 years into the 5-year glide (starts at 2039)
        s, b, c = glide_path_allocation(
            year=2041, retirement_year=2044,
            glide_start_years_before=5,
            pre_stocks=70, pre_bonds=25, pre_cash=5,
            post_stocks=50, post_bonds=40, post_cash=10,
        )
        # progress = (2041-2039)/5 = 0.4
        assert s == pytest.approx(70 + (50 - 70) * 0.4)
        assert b == pytest.approx(25 + (40 - 25) * 0.4)

    def test_compute_portfolio_return(self):
        assumptions = {
            "asset_allocation": {
                "pre_retirement": {"stocks_pct": 70, "bonds_pct": 25, "cash_pct": 5},
                "post_retirement": {"stocks_pct": 50, "bonds_pct": 40, "cash_pct": 10},
                "glide_path_start_years_before": 5,
            },
            "investment_returns": {
                "stocks_mean_pct": 8.0,
                "bonds_mean_pct": 4.0,
            },
        }
        ret = compute_portfolio_return(1_000_000, 2030, 2044, assumptions)
        expected_rate = 0.70 * 8.0 + 0.25 * 4.0 + 0.05 * 0.0
        assert ret == pytest.approx(1_000_000 * expected_rate / 100)


class TestMortgage:
    def test_monthly_payment_known_value(self):
        # $300,000 at 6% for 30 years = ~$1798.65
        pmt = monthly_payment(300_000, 6.0, 360)
        assert pmt == pytest.approx(1798.65, abs=0.5)

    def test_monthly_payment_zero_rate(self):
        pmt = monthly_payment(120_000, 0, 120)
        assert pmt == pytest.approx(1000)

    def test_amortize_year_reduces_balance(self):
        pmt = monthly_payment(300_000, 6.0, 360)
        new_bal, princ, interest = amortize_year(300_000, 6.0, pmt)
        assert new_bal < 300_000
        assert princ > 0
        assert interest > 0
        assert princ + interest == pytest.approx(pmt * 12, abs=1)

    def test_new_mortgage_from_purchase(self):
        loan, pmt = new_mortgage_from_purchase(400_000, 20, 6.0, 30)
        assert loan == pytest.approx(320_000)
        assert pmt == pytest.approx(monthly_payment(320_000, 6.0, 360))

    def test_rental_pl(self):
        gross, net = rental_property_annual_pl(
            monthly_rent=3000,
            vacancy_rate_pct=8,
            property_value=500_000,
            annual_maintenance_pct=1.0,
            property_management_pct=10,
            annual_mortgage_pmt=24_000,
        )
        assert gross == pytest.approx(3000 * 12 * 0.92)
        # net = effective_rent - maintenance - management - mortgage - insurance
        effective = 3000 * 12 * 0.92
        maintenance = 500_000 * 0.01
        management = effective * 0.10
        expected_net = effective - maintenance - management - 24_000 - 2400
        assert net == pytest.approx(expected_net)


class TestSocialSecurity:
    def test_benefit_at_67_is_pia(self):
        assert benefit_at_claiming_age(3200, 67) == pytest.approx(3200)

    def test_benefit_at_62_is_reduced(self):
        assert benefit_at_claiming_age(3200, 62) == pytest.approx(3200 * 0.70)

    def test_benefit_at_70_is_increased(self):
        assert benefit_at_claiming_age(3200, 70) == pytest.approx(3200 * 1.24)

    def test_no_income_before_claiming(self):
        result = compute_social_security(
            year=2040, birth_year=1982, pia_at_67=3200,
            claiming_age=67, cola_pct=2.0, base_year=2026,
        )
        # Age 58 in 2040, claiming at 67
        assert result == 0.0

    def test_income_at_claiming_year(self):
        result = compute_social_security(
            year=2049, birth_year=1982, pia_at_67=3200,
            claiming_age=67, cola_pct=2.0, base_year=2026,
        )
        # Age 67 in 2049, first year of benefits
        assert result == pytest.approx(3200 * 12)

    def test_cola_applied(self):
        result = compute_social_security(
            year=2051, birth_year=1982, pia_at_67=3200,
            claiming_age=67, cola_pct=2.0, base_year=2026,
        )
        # 2 years of COLA from 2049
        expected_monthly = 3200 * 1.02**2
        assert result == pytest.approx(expected_monthly * 12)


class TestHealthcare:
    def test_employer_plan_pre_retirement(self):
        cost, events = compute_healthcare_costs(
            year=2030, base_year=2026, age_primary=48,
            retirement_year=2044,
            healthcare={"annual_premium_today": 24000, "annual_out_of_pocket_today": 6000,
                       "aca_marketplace_annual": 30000, "medicare_annual": 8000},
            healthcare_inflation_pct=6.0,
        )
        expected = (24000 + 6000) * 1.06**4
        assert cost == pytest.approx(expected)

    def test_aca_marketplace_during_gap(self):
        cost, events = compute_healthcare_costs(
            year=2044, base_year=2026, age_primary=62,
            retirement_year=2044,
            healthcare={"annual_premium_today": 24000, "annual_out_of_pocket_today": 6000,
                       "aca_marketplace_annual": 30000, "medicare_annual": 8000},
            healthcare_inflation_pct=6.0,
        )
        expected = 30000 * 1.06**18
        assert cost == pytest.approx(expected)

    def test_medicare_after_65(self):
        cost, events = compute_healthcare_costs(
            year=2047, base_year=2026, age_primary=65,
            retirement_year=2044,
            healthcare={"annual_premium_today": 24000, "annual_out_of_pocket_today": 6000,
                       "aca_marketplace_annual": 30000, "medicare_annual": 8000},
            healthcare_inflation_pct=6.0,
        )
        expected = 8000 * 1.06**21
        assert cost == pytest.approx(expected)


class TestCollege:
    def test_no_cost_before_college(self):
        children = [{"name": "Kid", "birth_year": 2011, "college_start_year": 2029,
                     "college_years": 4, "plan_529_balance": 80000,
                     "_529_balance": 80000}]
        cost, drawdown, events = compute_college_costs(
            year=2027, base_year=2026, children=children,
            college_assumptions={"annual_cost_today": 65000, "room_and_board_today": 18000},
            tuition_inflation_pct=5.0, general_inflation_pct=3.0,
        )
        assert cost == 0
        assert drawdown == 0

    def test_private_school_cost(self):
        children = [{"name": "Kid", "birth_year": 2011, "college_start_year": 2029,
                     "college_years": 4, "plan_529_balance": 80000,
                     "_529_balance": 80000,
                     "current_school": {"type": "private_high_school",
                                       "annual_tuition": 42000, "ends_year": 2029}}]
        cost, drawdown, events = compute_college_costs(
            year=2027, base_year=2026, children=children,
            college_assumptions={"annual_cost_today": 65000, "room_and_board_today": 18000},
            tuition_inflation_pct=5.0, general_inflation_pct=3.0,
        )
        # One year of HS at 3% inflation
        expected = 42000 * 1.03**1
        assert cost == pytest.approx(expected)

    def test_college_year_with_529(self):
        children = [{"name": "Kid", "birth_year": 2011, "college_start_year": 2029,
                     "college_years": 4, "plan_529_balance": 200000,
                     "_529_balance": 200000}]
        cost, drawdown, events = compute_college_costs(
            year=2029, base_year=2026, children=children,
            college_assumptions={"annual_cost_today": 65000, "room_and_board_today": 18000,
                                "financial_aid_annual": 0, "scholarship_annual": 0},
            tuition_inflation_pct=5.0, general_inflation_pct=3.0,
        )
        # 529 should cover all costs since balance is large
        assert cost == 0  # net cost after 529
        assert drawdown > 0


class TestRMD:
    def test_no_rmd_before_73(self):
        assert compute_rmd(1_000_000, 72) == 0.0
        assert compute_rmd(1_000_000, 60) == 0.0

    def test_rmd_at_73(self):
        # Age 73 factor = 26.5 per IRS Uniform Lifetime Table
        assert compute_rmd(1_000_000, 73) == pytest.approx(1_000_000 / 26.5)

    def test_rmd_at_85(self):
        # Age 85 factor = 16.0
        assert compute_rmd(800_000, 85) == pytest.approx(800_000 / 16.0)

    def test_rmd_zero_balance(self):
        assert compute_rmd(0, 80) == 0.0

    def test_rmd_caps_at_oldest_table_age(self):
        # Above tabulated max, uses the oldest published factor (age 120 = 2.0)
        assert compute_rmd(100_000, 130) == pytest.approx(100_000 / 2.0)

    def test_start_age_constant(self):
        assert RMD_START_AGE == 73

    def test_factor_monotonically_decreases(self):
        # Life-expectancy factors strictly decrease with age
        prev = life_expectancy_factor(73)
        for age in range(74, 120):
            f = life_expectancy_factor(age)
            assert f <= prev
            prev = f
