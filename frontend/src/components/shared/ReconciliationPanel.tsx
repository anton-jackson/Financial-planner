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

import { useState } from "react";
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
  const [expanded, setExpanded] = useState(false);
  const currentYear = new Date().getFullYear();

  // ─── Income (year 1, today's dollars) ─────────────────────────────
  const primarySalary = profile.income.primary.base_salary;
  const primaryBonus = primarySalary * (profile.income.primary.bonus_pct / 100);
  const spouseSalary = profile.income.spouse?.base_salary ?? 0;
  const spouseBonus = spouseSalary * ((profile.income.spouse?.bonus_pct ?? 0) / 100);
  const wages = primarySalary + primaryBonus + spouseSalary + spouseBonus;

  // Year-1 RSU vest income (shares vesting this year × current price).
  const rsuVestThisYear = (() => {
    let total = 0;
    for (const rsu of [profile.income.rsu, profile.income.spouse_rsu]) {
      if (!rsu) continue;
      for (const t of rsu.unvested_tranches || []) {
        if (t.vest_year === currentYear) total += t.shares * rsu.current_price;
      }
    }
    return total;
  })();

  const income = wages + rsuVestThisYear;

  // ─── Retirement savings (year 1) ──────────────────────────────────
  const savingsFor = (p: typeof profile.savings.primary, salary: number, bonusPct: number) => {
    const compBasis = p.bonus_401k_eligible ? salary * (1 + bonusPct / 100) : salary;
    const k401 = compBasis * (p.contribution_rate_pct / 100);
    const match = salary * (p.employer_match_pct / 100);
    const employerContrib = salary * (p.employer_contribution_pct / 100);
    return (
      k401 + match + employerContrib +
      p.annual_ira_traditional + p.annual_ira_roth + p.annual_hsa +
      p.additional_monthly_savings * 12
    );
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
    : 0;
  const monthly529 = (profile.savings.monthly_529_per_child ?? 0) * 12 * (profile.children?.length ?? 0);
  const retirementSavings = primarySaving + spouseSaving + monthly529;

  // Pre-tax portion reduces federal taxable income.
  const preTax401kPrimary =
    profile.savings.primary.annual_401k_traditional + profile.savings.primary.annual_hsa;
  const preTax401kSpouse = profile.spouse
    ? profile.savings.spouse.annual_401k_traditional + profile.savings.spouse.annual_hsa
    : 0;
  const preTaxDeductions = preTax401kPrimary + preTax401kSpouse;

  // ─── Taxes (approximate) ──────────────────────────────────────────
  const taxEst = estimateYear1Taxes({
    wages,
    preTaxDeductions,
    filingStatus: (profile.tax.filing_status as FilingStatus) || "mfj",
    state: profile.personal.state_of_residence || "",
    stateOverridePct: profile.tax.state_income_tax_pct || 0,
  });

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

  // ─── Discretionary ────────────────────────────────────────────────
  const discretionary =
    income -
    taxEst.total -
    healthcare -
    retirementSavings -
    mortgageAndProperty -
    debtService -
    autoService -
    collegeAndTuition -
    baseLiving;

  const isNegative = discretionary < 0;

  // ─── Rendering ────────────────────────────────────────────────────
  const rows: Array<{ label: string; value: number; hint?: string; sign?: "+" | "-" }> = [
    { label: "Gross income (salary + bonus + RSU vest)", value: income, sign: "+" },
    { label: "Estimated taxes (federal + state + FICA)", value: taxEst.total, sign: "-", hint: "approximate — engine computes precisely" },
    { label: healthcareFromOverride ? "Healthcare (your override)" : "Healthcare (scenario default)", value: healthcare, sign: "-" },
    { label: "Retirement & HSA contributions", value: retirementSavings, sign: "-" },
    { label: "Mortgage & property costs", value: mortgageAndProperty, sign: "-" },
    { label: "Debt service", value: debtService, sign: "-" },
    { label: "Auto loans", value: autoService, sign: "-" },
    { label: "Current tuition", value: collegeAndTuition, sign: "-" },
    { label: "Other annual living expenses", value: baseLiving, sign: "-" },
  ];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Year-1 check</h3>
          <p className="text-xs text-slate-500 mt-1">
            Live reconciliation of income vs. everything entered elsewhere. Flags
            double-counting or an underfunded plan before simulation.
          </p>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-blue-600 hover:text-blue-800"
        >
          {expanded ? "Hide" : "Show"}
        </button>
      </div>

      {expanded && (
        <div className="mt-4">
          <div className="flex flex-col gap-1.5">
            {rows.map((r) => (
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
            ))}
            <div
              className={`flex items-center justify-between text-sm font-semibold pt-2 ${
                isNegative ? "text-red-700" : "text-emerald-700"
              }`}
            >
              <span>= Discretionary surplus / (deficit)</span>
              <span className="font-mono">{fmtUSD(discretionary)}</span>
            </div>
          </div>

          {isNegative && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
              <strong>Year-1 deficit of {fmtUSD(Math.abs(discretionary))}.</strong>{" "}
              Either income is understated, expenses are overstated, or something is
              double-counted (e.g., mortgage or debt payments included in "other
              annual living expenses"). The engine will still run but will silently
              draw down savings to cover the gap.
            </div>
          )}

          {taxEst.effectiveRatePct > 0 && (
            <p className="text-xs text-slate-400 mt-3">
              Tax estimate uses 2026 federal brackets, a {Math.round(taxEst.effectiveRatePct)}%
              combined effective rate, and — for progressive states — a rough
              effective-rate approximation. Engine computation is authoritative.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
