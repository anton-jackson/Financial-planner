/**
 * Year-1 reconciliation panel.
 *
 * Live, client-side sanity check tying top-down income against the bottoms-up
 * expenses the user has entered elsewhere in the profile. Flags when the
 * combined inputs imply a negative discretionary position in the first
 * projection year — before the engine silently draws down savings.
 *
 * This is a simplified estimate. Engine numbers are authoritative; this panel
 * exists to catch data-entry problems (double-counting, missing income) at
 * input time.
 */

import type { Profile } from "../../types/profile";
import type { AssetsFile } from "../../types/assets";
import { estimateYear1Taxes, type FilingStatus } from "../../lib/taxEstimate";

// Fallback healthcare defaults when no override is set. Matches backend
// HealthcareAssumptions defaults in backend/models/scenario.py:52-53.
const FALLBACK_PREMIUM = 24_000;
const FALLBACK_OOP = 6_000;

function fmtUSD(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString()}`;
}

interface Props {
  profile: Profile;
  assets: AssetsFile | undefined;
}

export function ReconciliationPanel({ profile, assets }: Props) {
  const currentYear = new Date().getFullYear();

  // ─── Income (year 1, today's dollars) ─────────────────────────────
  const primarySalary = profile.income.primary.base_salary;
  const primaryBonus = primarySalary * (profile.income.primary.bonus_pct / 100);
  const spouseSalary = profile.income.spouse?.base_salary ?? 0;
  const spouseBonus = spouseSalary * ((profile.income.spouse?.bonus_pct ?? 0) / 100);
  const wages = primarySalary + primaryBonus + spouseSalary + spouseBonus;

  // Year-1 RSU vest (shares vesting this year × current price). Sell-to-cover
  // is tracked separately as informational share-count context — it's a
  // withholding mechanism at vest, NOT a separate tax. The tax on RSU flows
  // through the ordinary-income tax calculation below.
  const { rsuVestThisYear, rsuSellToCover, rsuVestShares, rsuCoverShares } = (() => {
    let vest = 0;
    let cover = 0;
    let vestShares = 0;
    let coverShares = 0;
    for (const rsu of [profile.income.rsu, profile.income.spouse_rsu]) {
      if (!rsu) continue;
      for (const t of rsu.unvested_tranches || []) {
        if (t.vest_year === currentYear) {
          const value = t.shares * rsu.current_price;
          const withheldShares = t.shares * (rsu.sell_to_cover_pct / 100);
          vest += value;
          cover += value * (rsu.sell_to_cover_pct / 100);
          vestShares += t.shares;
          coverShares += withheldShares;
        }
      }
    }
    return {
      rsuVestThisYear: vest,
      rsuSellToCover: cover,
      rsuVestShares: vestShares,
      rsuCoverShares: coverShares,
    };
  })();
  const hasRsuVest = rsuVestThisYear > 0;

  // ─── Retirement + HSA savings (year 1) ────────────────────────────
  // Budget reconciliation tracks outflows from the user's paycheck only.
  // Employer 401k match and employer contributions go straight to the 401k
  // as additional compensation — they never hit take-home pay — so they are
  // intentionally excluded here.
  const savingsFor = (p: typeof profile.savings.primary, salary: number, bonusPct: number) => {
    const compBasis = p.bonus_401k_eligible ? salary * (1 + bonusPct / 100) : salary;
    const employee401k = compBasis * (p.contribution_rate_pct / 100);
    return {
      retirement:
        employee401k +
        p.annual_ira_traditional + p.annual_ira_roth +
        p.additional_monthly_savings * 12,
      hsa: p.annual_hsa,
    };
  };
  const primarySaving = savingsFor(
    profile.savings.primary,
    primarySalary,
    profile.income.primary.bonus_pct,
  );
  const spouseSaving = profile.spouse
    ? savingsFor(
        profile.savings.spouse,
        spouseSalary,
        profile.income.spouse?.bonus_pct ?? 0,
      )
    : { retirement: 0, hsa: 0 };
  const monthly529 = (profile.savings.monthly_529_per_child ?? 0) * 12 * (profile.children?.length ?? 0);
  const retirementSavings = primarySaving.retirement + spouseSaving.retirement + monthly529;
  const hsaSavings = primarySaving.hsa + spouseSaving.hsa;

  // Pre-tax portion reduces federal taxable income.
  const preTax401kPrimary =
    profile.savings.primary.annual_401k_traditional + profile.savings.primary.annual_hsa;
  const preTax401kSpouse = profile.spouse
    ? profile.savings.spouse.annual_401k_traditional + profile.savings.spouse.annual_hsa
    : 0;
  const preTaxDeductions = preTax401kPrimary + preTax401kSpouse;

  // ─── Taxes (approximate) ──────────────────────────────────────────
  // RSU vest is ordinary income, so it belongs in the tax calculation. Compute
  // taxes both with and without RSU so we can attribute the marginal RSU tax
  // back to the RSU row (stacking the RSU on top of wages).
  const taxInputs = {
    wages,
    preTaxDeductions,
    filingStatus: (profile.tax.filing_status as FilingStatus) || "mfj",
    state: profile.personal.state_of_residence || "",
    stateOverridePct: profile.tax.state_income_tax_pct || 0,
  };
  const taxOnWages = estimateYear1Taxes(taxInputs);
  const taxOnTotal = estimateYear1Taxes({ ...taxInputs, rsuVestIncome: rsuVestThisYear });
  const taxOnRsu = Math.max(0, taxOnTotal.total - taxOnWages.total);

  // ─── Healthcare (pre-retirement, from override or fallback) ───────
  const hcOverride = profile.healthcare_override;
  const hcPremium = hcOverride?.annual_premium ?? FALLBACK_PREMIUM;
  const hcOOP = hcOverride?.annual_out_of_pocket ?? FALLBACK_OOP;
  const healthcare = hcPremium + hcOOP;
  const healthcareFromOverride =
    hcOverride?.annual_premium != null || hcOverride?.annual_out_of_pocket != null;

  // ─── Modeled outflows from other profile/assets inputs ────────────
  // Real estate: mortgage P&I + property tax + insurance + other carrying costs.
  const realEstate = (assets?.assets ?? []).filter((a) => a.type === "real_estate");
  const mortgageAndProperty = realEstate.reduce((sum, a) => {
    const p = a.properties ?? {};
    const monthly = Number(p.monthly_payment ?? 0) * 12;
    const tax = Number(p.annual_property_tax ?? 0);
    const ins = Number(p.annual_insurance ?? 0);
    const carry = Number(p.annual_carrying_cost ?? 0);
    return sum + monthly + tax + ins + carry;
  }, 0);

  // Debt service (annual).
  const debtService = (profile.debts ?? []).reduce(
    (sum, d) => sum + (d.monthly_payment ?? 0) * 12,
    0,
  );

  // Existing vehicle loans (annual).
  const autoService = (profile.existing_vehicles ?? []).reduce(
    (sum, v) => sum + (v.monthly_payment ?? 0) * 12,
    0,
  );

  // Year-1 tuition (net of parent cap when present; else just tuition).
  // Simplified: if a child has current_school with ends_year in the future, include annual_tuition.
  const collegeAndTuition = (profile.children ?? []).reduce((sum, c) => {
    const cs = c.current_school;
    if (cs && cs.annual_tuition > 0 && (cs.ends_year === 0 || cs.ends_year >= currentYear)) {
      return sum + cs.annual_tuition;
    }
    return sum;
  }, 0);

  // ─── Base living ──────────────────────────────────────────────────
  const childrenAtHome = profile.children?.length ?? 0;
  const baseLiving =
    profile.expenses.annual_base +
    profile.expenses.per_child_annual * childrenAtHome;

  // ─── Subtotals ────────────────────────────────────────────────────
  // Working-income subtotal: wages minus all wage-side outflows, including
  // only the tax attributable to wages. RSU and its marginal tax appear
  // below so the user sees the shape of each bucket independently.
  const workingSurplus =
    wages -
    taxOnWages.total -
    healthcare -
    retirementSavings -
    hsaSavings -
    mortgageAndProperty -
    debtService -
    autoService -
    collegeAndTuition -
    baseLiving;

  // Net RSU: gross vest minus the marginal ordinary-income tax on the vest.
  // Sell-to-cover is a withholding mechanism at vest — it prepays part of
  // this tax — so it is not subtracted here (doing so would double-count).
  const rsuNet = rsuVestThisYear - taxOnRsu;
  const totalWithRsu = workingSurplus + rsuNet;
  const isNegative = (hasRsuVest ? totalWithRsu : workingSurplus) < 0;

  // ─── Rendering ────────────────────────────────────────────────────
  type Row = { label: string; value: number; hint?: string; sign: "+" | "-" };
  const wageRows: Row[] = [
    { label: "Gross income (salary + bonus)", value: wages, sign: "+" },
    {
      label: "Estimated taxes on wages (federal + state + FICA)",
      value: taxOnWages.total,
      sign: "-",
      hint: wages > 0
        ? `~${((taxOnWages.federal / wages) * 100).toFixed(1)}% fed · ${((taxOnWages.state / wages) * 100).toFixed(1)}% state · ${((taxOnWages.fica / wages) * 100).toFixed(1)}% FICA`
        : "approximate — engine computes precisely",
    },
    { label: healthcareFromOverride ? "Healthcare (your override)" : "Healthcare (scenario default)", value: healthcare, sign: "-" },
    { label: "Retirement contributions (401k + IRA + 529 + brokerage)", value: retirementSavings, sign: "-" },
    { label: "HSA contributions", value: hsaSavings, sign: "-" },
    { label: "Mortgage & property costs", value: mortgageAndProperty, sign: "-" },
    { label: "Debt service", value: debtService, sign: "-" },
    { label: "Auto loans", value: autoService, sign: "-" },
    { label: "Current tuition", value: collegeAndTuition, sign: "-" },
    { label: "Other annual living expenses", value: baseLiving, sign: "-" },
  ];
  const rsuRows: Row[] = [
    { label: "RSU vest (gross value)", value: rsuVestThisYear, sign: "+" },
    {
      label: "Estimated tax on RSU (marginal, ordinary income)",
      value: taxOnRsu,
      sign: "-",
      hint: rsuVestThisYear > 0
        ? `~${((taxOnRsu / rsuVestThisYear) * 100).toFixed(1)}% of gross vest`
        : undefined,
    },
  ];

  const renderRow = (r: Row) => (
    <div
      key={r.label}
      className="flex items-center justify-between text-sm border-b border-slate-100 pb-1.5"
    >
      <span className="text-slate-600">
        {r.label}
        {r.hint && (
          <span className="text-xs text-slate-400 ml-2">({r.hint})</span>
        )}
      </span>
      <span
        className={`font-mono ${r.sign === "+" ? "text-emerald-700" : "text-slate-700"}`}
      >
        {r.sign === "-" ? "−" : "+"} {fmtUSD(r.value)}
      </span>
    </div>
  );

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div>
        <h3 className="text-lg font-semibold">Current annual budget</h3>
        <p className="text-xs text-slate-500 mt-1">
          Live reconciliation of income vs. everything entered elsewhere. Flags
          double-counting or an underfunded plan before simulation.
        </p>
      </div>

      <div className="mt-4">
        <div className="flex flex-col gap-1.5">
          {wageRows.map(renderRow)}
          <div
            className={`flex items-center justify-between text-sm font-semibold pt-2 ${
              hasRsuVest
                ? "text-slate-700"
                : isNegative
                  ? "text-red-700"
                  : "text-emerald-700"
            }`}
          >
            <span>= Working income surplus / (deficit)</span>
            <span className="font-mono">{fmtUSD(workingSurplus)}</span>
          </div>

          {hasRsuVest && (
            <>
              <div className="h-2" />
              {rsuRows.map(renderRow)}
              <div
                className={`flex items-center justify-between text-sm font-semibold pt-2 ${
                  isNegative ? "text-red-700" : "text-emerald-700"
                }`}
              >
                <span>= Total surplus / (deficit) after RSU</span>
                <span className="font-mono">{fmtUSD(totalWithRsu)}</span>
              </div>
            </>
          )}
        </div>

        {isNegative && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
            <strong>
              Annual deficit of{" "}
              {fmtUSD(Math.abs(hasRsuVest ? totalWithRsu : workingSurplus))}.
            </strong>{" "}
            Either income is understated, expenses are overstated, or something is
            double-counted (e.g., mortgage or debt payments included in "other
            annual living expenses"). The engine will still run but will silently
            draw down savings to cover the gap.
          </div>
        )}

        {hasRsuVest && (
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-md p-3 text-xs text-slate-600">
            <div className="font-medium text-slate-700 mb-1">Sell-to-cover (share tracking)</div>
            At vest, {rsuCoverShares.toFixed(0)} of {rsuVestShares.toFixed(0)} shares
            (~{fmtUSD(rsuSellToCover)}) are auto-sold to prepay withholding.
            That withholding is applied against the RSU tax above — not an
            additional tax — so the remaining {(rsuVestShares - rsuCoverShares).toFixed(0)}{" "}
            shares represent the at-risk position you actually retain.
          </div>
        )}

        {taxOnTotal.effectiveRatePct > 0 && (
          <p className="text-xs text-slate-400 mt-3">
            Tax estimate uses 2026 federal brackets and stacks RSU on top of
            wages at the marginal rate; combined effective rate on total
            ordinary income is ~{Math.round(taxOnTotal.effectiveRatePct)}%.
            Engine computation is authoritative.
          </p>
        )}
      </div>
    </div>
  );
}
