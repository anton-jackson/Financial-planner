import { useEffect, useState } from "react";
import { useProfile, useUpdateProfile } from "../hooks/useProfile";
import { useAssets } from "../hooks/useAssets";
import { useAutoSave } from "../hooks/useAutoSave";
import { FormField, Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import { ReconciliationPanel } from "../components/shared/ReconciliationPanel";
import type { AssetsFile } from "../types/assets";
import type { Profile, PersonSavings, Expenses, HealthcareOverride, TaxConfig, VestingTranche, RSUHolding } from "../types/profile";

// ─── RSU Sub-section ──────────────────────────────────────────────

function RSUSection({
  rsu,
  rsuKey,
  onChange,
  onAddTranche,
  onUpdateTranche,
  onRemoveTranche,
}: {
  rsu: RSUHolding;
  rsuKey: string;
  onChange: (section: string, field: string, value: number) => void;
  onAddTranche: () => void;
  onUpdateTranche: (index: number, field: string, value: number) => void;
  onRemoveTranche: (index: number) => void;
}) {
  return (
    <>
      <SectionHelp
        summary="RSU stock price grows from an initial rate and glides to a long-term rate. At vest, a % of shares is sold to cover tax (sell-to-cover)."
        details={[
          "Stock price compounds year-over-year, transitioning from initial to long-term rate over N years.",
          "At vest: sell-to-cover withholds shares for tax. You receive the remaining shares.",
          "Unvested tranches are NOT counted as assets until they vest.",
          "Each vested lot tracks cost basis. Gains above basis are taxed at LTCG rate when sold.",
        ]}
      />
      <div className="grid grid-cols-2 gap-4 mb-4">
        <FormField label="Current Price / Share">
          <Input type="number" step="0.01" value={rsu.current_price} onChange={(e) => onChange(rsuKey, "current_price", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Initial Growth Rate %" hint="Near-term">
          <Input type="number" step="0.1" value={rsu.annual_growth_rate_pct} onChange={(e) => onChange(rsuKey, "annual_growth_rate_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Long-Term Growth Rate %" hint="After transition">
          <Input type="number" step="0.1" value={rsu.long_term_growth_rate_pct ?? ""} onChange={(e) => onChange(rsuKey, "long_term_growth_rate_pct", e.target.value ? parseFloat(e.target.value) : 0)} />
        </FormField>
        <FormField label="Transition Years">
          <Input type="number" value={rsu.growth_transition_years} onChange={(e) => onChange(rsuKey, "growth_transition_years", parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="Sell-to-Cover %" hint="Shares sold at vest for tax">
          <Input type="number" step="0.1" value={rsu.sell_to_cover_pct} onChange={(e) => onChange(rsuKey, "sell_to_cover_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
      </div>

      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-4">
        <h5 className="text-xs font-medium text-slate-500 mb-3">Vested Shares (in brokerage)</h5>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Shares">
            <Input type="number" value={rsu.vested_shares} onChange={(e) => onChange(rsuKey, "vested_shares", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Avg Vest Price">
            <Input type="number" step="0.01" value={rsu.vested_price} onChange={(e) => onChange(rsuKey, "vested_price", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Cost Basis" hint="Shares x vest price">
            <div className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium">
              ${Math.round(rsu.vested_shares * rsu.vested_price).toLocaleString()}
            </div>
          </FormField>
          <FormField label="Sale Year">
            <Input type="number" value={rsu.vested_sale_year ?? ""} onChange={(e) => onChange(rsuKey, "vested_sale_year", e.target.value ? parseInt(e.target.value) : 0)} />
          </FormField>
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-xs font-medium text-slate-500">Unvested Tranches</h5>
          <button onClick={onAddTranche} className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">+ Add Tranche</button>
        </div>
        {rsu.unvested_tranches.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-2">No unvested tranches</div>
        ) : (
          <div className="flex flex-col gap-2">
            {rsu.unvested_tranches.map((t, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 items-end">
                <FormField label={i === 0 ? "Shares" : ""}>
                  <Input type="number" value={t.shares} onChange={(e) => onUpdateTranche(i, "shares", parseFloat(e.target.value) || 0)} />
                </FormField>
                <FormField label={i === 0 ? "Vest Year" : ""}>
                  <Input type="number" value={t.vest_year} onChange={(e) => onUpdateTranche(i, "vest_year", parseInt(e.target.value) || 0)} />
                </FormField>
                <FormField label={i === 0 ? "Sale Year" : ""}>
                  <Input type="number" value={t.sale_year ?? ""} onChange={(e) => onUpdateTranche(i, "sale_year", e.target.value ? parseInt(e.target.value) : 0)} />
                </FormField>
                <button onClick={() => onRemoveTranche(i)} className="text-xs text-red-500 hover:text-red-700 pb-2">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="Annual Refresh Grant $">
          <Input type="number" value={rsu.annual_refresh_value} onChange={(e) => onChange(rsuKey, "annual_refresh_value", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Last Grant Year">
          <Input type="number" value={rsu.refresh_end_year ?? ""} onChange={(e) => onChange(rsuKey, "refresh_end_year", e.target.value ? parseInt(e.target.value) : 0)} />
        </FormField>
        <FormField label="Refresh Sale Year">
          <Input type="number" value={rsu.refresh_sale_year ?? ""} onChange={(e) => onChange(rsuKey, "refresh_sale_year", e.target.value ? parseInt(e.target.value) : 0)} />
        </FormField>
      </div>
    </>
  );
}

// ─── Person Income Sub-section ────────────────────────────────────

function PersonIncomeSection({
  title,
  incomeSection,
  incomeKey,
  rsu,
  rsuKey,
  hasRsu,
  onToggleRsu,
  onChange,
  onAddTranche,
  onUpdateTranche,
  onRemoveTranche,
}: {
  title: string;
  incomeSection: { base_salary: number; annual_raise_pct: number; bonus_pct: number; bonus_variability_pct?: number };
  incomeKey: string;
  rsu: RSUHolding | null;
  rsuKey: string;
  hasRsu: boolean;
  onToggleRsu: () => void;
  onChange: (section: string, field: string, value: number) => void;
  onAddTranche: () => void;
  onUpdateTranche: (index: number, field: string, value: number) => void;
  onRemoveTranche: (index: number) => void;
}) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-4">
      <h4 className="text-sm font-medium text-slate-600 mb-3">{title}</h4>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <FormField label="Base Salary">
          <Input type="number" value={incomeSection.base_salary} onChange={(e) => onChange(incomeKey, "base_salary", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Annual Raise %">
          <Input type="number" step="0.1" value={incomeSection.annual_raise_pct} onChange={(e) => onChange(incomeKey, "annual_raise_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Bonus %">
          <Input type="number" step="0.1" value={incomeSection.bonus_pct} onChange={(e) => onChange(incomeKey, "bonus_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
      </div>

      {/* RSU toggle */}
      <div className="border-t border-slate-200 pt-3">
        <label className="flex items-center gap-2 text-sm text-slate-600 mb-3">
          <input
            type="checkbox"
            checked={hasRsu}
            onChange={onToggleRsu}
            className="rounded border-slate-300"
          />
          RSU / Equity Compensation
        </label>
        {hasRsu && rsu && (
          <RSUSection
            rsu={rsu}
            rsuKey={rsuKey}
            onChange={onChange}
            onAddTranche={onAddTranche}
            onUpdateTranche={onUpdateTranche}
            onRemoveTranche={onRemoveTranche}
          />
        )}
      </div>
    </div>
  );
}

// ─── Income Section ───────────────────────────────────────────────

function IncomeSection({
  income,
  primaryName,
  spouseName,
  hasSpouse,
  onChange,
  onToggleRsu,
  onAddTranche,
  onUpdateTranche,
  onRemoveTranche,
}: {
  income: Profile["income"];
  primaryName: string;
  spouseName: string;
  hasSpouse: boolean;
  onChange: (section: string, field: string, value: number) => void;
  onToggleRsu: (who: "primary" | "spouse") => void;
  onAddTranche: (rsuKey: string) => void;
  onUpdateTranche: (rsuKey: string, index: number, field: string, value: number) => void;
  onRemoveTranche: (rsuKey: string, index: number) => void;
}) {
  const hasPrimaryRsu = income.rsu.current_price > 0 || income.rsu.vested_shares > 0 || income.rsu.unvested_tranches.length > 0 || income.rsu.annual_refresh_value > 0;
  const hasSpouseRsu = income.spouse_rsu != null;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-4">Income</h3>
      <SectionHelp
        summary="Income grows with annual raises until retirement, then stops. Bonus is a percentage of base salary."
        details={[
          "Salary each year = base_salary x (1 + raise%)^years. Bonus = salary x bonus%.",
          "Total comp (salary + bonus) is the basis for 401k contribution rate calculations.",
          "All income stops at retirement age. Social Security and rental income take over.",
        ]}
      />

      <PersonIncomeSection
        title={primaryName}
        incomeSection={income.primary}
        incomeKey="primary"
        rsu={income.rsu}
        rsuKey="rsu"
        hasRsu={hasPrimaryRsu}
        onToggleRsu={() => onToggleRsu("primary")}
        onChange={onChange}
        onAddTranche={() => onAddTranche("rsu")}
        onUpdateTranche={(i, f, v) => onUpdateTranche("rsu", i, f, v)}
        onRemoveTranche={(i) => onRemoveTranche("rsu", i)}
      />

      {hasSpouse && income.spouse && (
        <PersonIncomeSection
          title={spouseName}
          incomeSection={income.spouse}
          incomeKey="spouse"
          rsu={income.spouse_rsu}
          rsuKey="spouse_rsu"
          hasRsu={hasSpouseRsu}
          onToggleRsu={() => onToggleRsu("spouse")}
          onChange={onChange}
          onAddTranche={() => onAddTranche("spouse_rsu")}
          onUpdateTranche={(i, f, v) => onUpdateTranche("spouse_rsu", i, f, v)}
          onRemoveTranche={(i) => onRemoveTranche("spouse_rsu", i)}
        />
      )}
    </div>
  );
}

// ─── Savings Section ──────────────────────────────────────────────

function PersonSavingsSection({
  title,
  savings,
  salary,
  bonusPct,
  onChange,
}: {
  title: string;
  savings: PersonSavings;
  salary: number;
  bonusPct: number;
  onChange: (field: string, value: number | boolean) => void;
}) {
  const rate = savings.contribution_rate_pct;
  const limit = savings.irs_401k_limit;
  const compBasis = savings.bonus_401k_eligible ? salary * (1 + bonusPct / 100) : salary;
  const total401k = compBasis * rate / 100;
  const computedTrad = Math.min(total401k, limit);
  const computedRoth = Math.max(0, total401k - limit);

  const onRateChange = (newRate: number) => {
    const newTotal = compBasis * newRate / 100;
    onChange("contribution_rate_pct", newRate);
    onChange("annual_401k_traditional", Math.round(Math.min(newTotal, limit)));
    onChange("annual_401k_roth", Math.round(Math.max(0, newTotal - limit)));
  };

  const onLimitChange = (newLimit: number) => {
    onChange("irs_401k_limit", newLimit);
    onChange("annual_401k_traditional", Math.round(Math.min(total401k, newLimit)));
    onChange("annual_401k_roth", Math.round(Math.max(0, total401k - newLimit)));
  };

  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
      <h4 className="text-sm font-medium text-slate-600 mb-3">{title}</h4>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="401k Contribution Rate %" hint={`${rate}% of $${salary.toLocaleString()} = $${Math.round(total401k).toLocaleString()}`}>
          <Input type="number" step="0.5" value={rate} onChange={(e) => onRateChange(parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="IRS Traditional 401k Limit">
          <Input type="number" value={limit} onChange={(e) => onLimitChange(parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Traditional 401k" hint="Auto-computed">
          <div className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium">${Math.round(computedTrad).toLocaleString()}</div>
        </FormField>
        <FormField label="Backdoor Roth 401k" hint="Overflow above limit">
          <div className={`px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium ${computedRoth > 0 ? "text-blue-700" : "text-slate-400"}`}>${Math.round(computedRoth).toLocaleString()}</div>
        </FormField>
        <FormField label="Employer Match %" hint="Matched on employee contribution">
          <Input type="number" step="0.1" value={savings.employer_match_pct} onChange={(e) => onChange("employer_match_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Employer Contribution %" hint="Flat contribution regardless of employee">
          <Input type="number" step="0.1" value={savings.employer_contribution_pct} onChange={(e) => onChange("employer_contribution_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <div className="col-span-2">
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={savings.bonus_401k_eligible}
              onChange={(e) => onChange("bonus_401k_eligible", e.target.checked)}
              className="rounded border-slate-300"
            />
            Bonus is 401k-eligible (include bonus in contribution basis)
          </label>
        </div>
        <FormField label="Traditional IRA (annual)">
          <Input type="number" value={savings.annual_ira_traditional} onChange={(e) => onChange("annual_ira_traditional", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Roth IRA (annual)">
          <Input type="number" value={savings.annual_ira_roth} onChange={(e) => onChange("annual_ira_roth", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="HSA (annual)">
          <Input type="number" value={savings.annual_hsa} onChange={(e) => onChange("annual_hsa", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Additional Monthly Savings" help="Extra cash beyond retirement accounts. Goes to taxable brokerage.">
          <Input type="number" value={savings.additional_monthly_savings} onChange={(e) => onChange("additional_monthly_savings", parseFloat(e.target.value) || 0)} />
        </FormField>
      </div>
    </div>
  );
}

function SavingsSection({
  savings,
  income,
  hasSpouse,
  primaryName,
  spouseName,
  onChange,
}: {
  savings: Profile["savings"];
  income: Profile["income"];
  hasSpouse: boolean;
  primaryName: string;
  spouseName: string;
  onChange: (person: "primary" | "spouse" | "top", field: string, value: number | boolean) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-4">Savings</h3>
      <SectionHelp
        summary="Pre-retirement savings contributions. 401k is split: up to IRS limit goes Traditional, overflow goes Roth (mega backdoor). All stop at retirement."
        details={[
          "401k rate is applied to total comp (salary + bonus).",
          "Traditional = min(comp x rate, IRS limit). Overflow becomes Roth 401k.",
          "Employer match is applied to base salary only.",
          "Additional monthly savings flow to the taxable brokerage portfolio.",
        ]}
      />
      <div className="flex flex-col gap-4">
        <PersonSavingsSection title={primaryName} savings={savings.primary} salary={income.primary.base_salary} bonusPct={income.primary.bonus_pct} onChange={(field, value) => onChange("primary", field, value)} />
        {hasSpouse && (
          <PersonSavingsSection title={spouseName} savings={savings.spouse} salary={income.spouse?.base_salary ?? 0} bonusPct={income.spouse?.bonus_pct ?? 0} onChange={(field, value) => onChange("spouse", field, value)} />
        )}
      </div>
    </div>
  );
}

// ─── Expenses Section ─────────────────────────────────────────────

function ModeledSeparatelySummary({ profile, assets }: { profile: Profile; assets: AssetsFile | undefined }) {
  const realEstate = (assets?.assets ?? []).filter((a) => a.type === "real_estate");
  const mortgageMonthly = realEstate.reduce((s, a) => s + Number(a.properties?.monthly_payment ?? 0), 0);
  const propertyCarryAnnual = realEstate.reduce(
    (s, a) =>
      s +
      Number(a.properties?.annual_property_tax ?? 0) +
      Number(a.properties?.annual_insurance ?? 0) +
      Number(a.properties?.annual_carrying_cost ?? 0),
    0,
  );
  const debtMonthly = (profile.debts ?? []).reduce((s, d) => s + (d.monthly_payment ?? 0), 0);
  const autoMonthly = (profile.existing_vehicles ?? []).reduce((s, v) => s + (v.monthly_payment ?? 0), 0);
  const hc = profile.healthcare_override;
  const healthcareAnnual = (hc?.annual_premium ?? 24_000) + (hc?.annual_out_of_pocket ?? 6_000);

  const items: Array<{ label: string; value: string }> = [
    { label: "Mortgage (P&I)", value: `$${Math.round(mortgageMonthly).toLocaleString()}/mo` },
    { label: "Property tax + insurance + carrying", value: `$${Math.round(propertyCarryAnnual / 12).toLocaleString()}/mo` },
    { label: "Debt service", value: `$${Math.round(debtMonthly).toLocaleString()}/mo` },
    { label: "Auto loans", value: `$${Math.round(autoMonthly).toLocaleString()}/mo` },
    { label: "Healthcare (today)", value: `$${Math.round(healthcareAnnual / 12).toLocaleString()}/mo` },
  ];

  return (
    <div className="mt-4 bg-slate-50 border border-slate-200 rounded-md p-3">
      <div className="text-xs font-medium text-slate-600 mb-2">
        Modeled separately — do NOT include these in the field above
      </div>
      <div className="grid grid-cols-2 gap-y-1 gap-x-4 text-xs text-slate-600">
        {items.map((i) => (
          <div key={i.label} className="flex justify-between">
            <span>{i.label}</span>
            <span className="font-mono">{i.value}</span>
          </div>
        ))}
      </div>
      <div className="text-[11px] text-slate-400 mt-2">
        Tuition and retirement contributions are also tracked elsewhere. Income and payroll taxes are computed by the engine.
      </div>
    </div>
  );
}

function ExpensesSection({
  expenses,
  profile,
  assets,
  onChange,
}: {
  expenses: Expenses;
  profile: Profile;
  assets: AssetsFile | undefined;
  onChange: (field: string, value: number | boolean) => void;
}) {
  const [monthly, setMonthly] = useState(true);
  const factor = monthly ? 12 : 1;
  const displayBase = monthly ? expenses.annual_base / 12 : expenses.annual_base;
  const displayChild = monthly ? expenses.per_child_annual / 12 : expenses.per_child_annual;
  const period = monthly ? "Monthly" : "Annual";

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold">Other Living Expenses</h3>
        <button onClick={() => setMonthly(!monthly)} className="text-xs text-blue-600 hover:text-blue-800">
          Show {monthly ? "Annual" : "Monthly"}
        </button>
      </div>
      <SectionHelp
        summary="A residual bucket — everything NOT already modeled elsewhere. Per-child cost is ADDED ON TOP of this number, not included in it."
        details={[
          "Do NOT include: mortgage & property taxes/insurance, tuition & 529 contributions, healthcare premiums & out-of-pocket, debt payments, auto loans & auto purchases, retirement & HSA contributions, or income/payroll taxes. Those are captured in their own sections and computed by the engine.",
          "Per-child cost: an additional amount per child, added to this number. With 2 kids at $15K each, total = base + $30K. Drops off when each child finishes college.",
          "At retirement, total living expenses are reduced by the retirement reduction % — a one-time step-down.",
          "In retirement, expenses exceeding Social Security + other income are covered by portfolio withdrawals.",
        ]}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField label={`Other ${period} Living Expenses`} hint={monthly ? `= $${Math.round(expenses.annual_base).toLocaleString()}/yr` : ""}>
          <Input type="number" value={Math.round(displayBase)} onChange={(e) => onChange("annual_base", (parseFloat(e.target.value) || 0) * factor)} />
        </FormField>
        <FormField label="Retirement Reduction %" hint="Step-down at retirement">
          <Input type="number" step="1" value={expenses.retirement_reduction_pct} onChange={(e) => onChange("retirement_reduction_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label={`Per-Child ${period} Cost`} hint={monthly ? `= $${Math.round(expenses.per_child_annual).toLocaleString()}/yr · added to base` : "Added on top of other living expenses"}>
          <Input type="number" value={Math.round(displayChild)} onChange={(e) => onChange("per_child_annual", (parseFloat(e.target.value) || 0) * factor)} />
        </FormField>
        <FormField label="Kids Leave After College">
          <select
            className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
            value={expenses.children_leave_after_college ? "yes" : "no"}
            onChange={(e) => onChange("children_leave_after_college", e.target.value === "yes")}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </FormField>
      </div>
      <ModeledSeparatelySummary profile={profile} assets={assets} />
    </div>
  );
}

// ─── Healthcare Override Section ──────────────────────────────────

function HealthcareOverrideSection({
  override,
  onChange,
}: {
  override: HealthcareOverride | null | undefined;
  onChange: (field: keyof HealthcareOverride, value: number | null) => void;
}) {
  const premium = override?.annual_premium ?? null;
  const oop = override?.annual_out_of_pocket ?? null;

  const parse = (raw: string): number | null => {
    const trimmed = raw.trim();
    if (trimmed === "") return null;
    const n = parseFloat(trimmed);
    return Number.isFinite(n) ? n : null;
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-2">Healthcare (current cost)</h3>
      <SectionHelp
        summary="Optional: enter what you pay today. If blank, the engine uses scenario estimates ($24k premium / $6k out-of-pocket by default)."
        details={[
          "Applies to pre-retirement years only. ACA marketplace cost during the pre-Medicare gap and Medicare costs after 65 continue to come from the scenario.",
          "All values are in today's dollars; the engine inflates them year-by-year using the scenario's healthcare inflation rate.",
          "Leave either field blank to fall back to the scenario default for just that component.",
        ]}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Annual Premium" hint="Your share of premium, today's dollars">
          <Input
            type="number"
            value={premium ?? ""}
            placeholder="Scenario default"
            onChange={(e) => onChange("annual_premium", parse(e.target.value))}
          />
        </FormField>
        <FormField label="Annual Out-of-Pocket" hint="Deductibles, copays, Rx — today's dollars">
          <Input
            type="number"
            value={oop ?? ""}
            placeholder="Scenario default"
            onChange={(e) => onChange("annual_out_of_pocket", parse(e.target.value))}
          />
        </FormField>
      </div>
    </div>
  );
}

// ─── Tax Section ──────────────────────────────────────────────────

function TaxSection({
  tax,
  onChange,
}: {
  tax: TaxConfig;
  onChange: (field: string, value: number | string) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-2">Taxes</h3>
      <SectionHelp
        summary="Progressive federal brackets + state income tax computed automatically. Filing status selects the correct bracket tables."
        details={[
          "Filing status determines federal bracket thresholds, standard deduction, LTCG brackets, NIIT threshold, and Additional Medicare threshold.",
          "State income tax is computed automatically for most states. Set the override below to use a flat rate instead.",
          "No-income-tax states (WA, TX, FL, NV, WY, SD, AK, TN, NH) are detected from your state of residence.",
          "State tax override: if > 0, this flat % is used instead of the automatic state bracket lookup. Set to 0 for automatic.",
        ]}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Filing Status">
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={tax.filing_status || "mfj"}
            onChange={(e) => onChange("filing_status", e.target.value)}
          >
            <option value="mfj">Married Filing Jointly</option>
            <option value="single">Single</option>
            <option value="hoh">Head of Household</option>
          </select>
        </FormField>
        <FormField label="State Income Tax Override %" hint="0 = auto from state of residence">
          <Input type="number" step="0.1" value={tax.state_income_tax_pct} onChange={(e) => onChange("state_income_tax_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export function BasicFinancesPage() {
  const { data: profile, isLoading, error } = useProfile();
  const { data: assets } = useAssets();
  const updateProfile = useUpdateProfile();
  const [local, setLocal] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profile && !dirty) setLocal(profile);
  }, [profile]);

  const save = () => {
    if (local) updateProfile.mutate(local, { onSuccess: () => setDirty(false) });
  };
  const { status: saveStatus } = useAutoSave(save, dirty, updateProfile.isPending);

  if (isLoading) return <div className="text-slate-400">Loading...</div>;
  if (error) return <div className="text-red-500">Error loading profile</div>;
  if (!local) return null;

  const updateIncome = (section: string, field: string, value: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const sectionData = prev.income[section as keyof typeof prev.income];
      if (!sectionData || typeof sectionData !== "object") return prev;
      return { ...prev, income: { ...prev.income, [section]: { ...sectionData, [field]: value } } };
    });
    setDirty(true);
  };

  const updateSavings = (person: "primary" | "spouse" | "top", field: string, value: number | boolean) => {
    setLocal((prev) => {
      if (!prev) return prev;
      if (person === "top") return { ...prev, savings: { ...prev.savings, [field]: value } };
      return { ...prev, savings: { ...prev.savings, [person]: { ...prev.savings[person], [field]: value } } };
    });
    setDirty(true);
  };

  const updateExpenses = (field: string, value: number | boolean) => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, expenses: { ...prev.expenses, [field]: value } };
    });
    setDirty(true);
  };

  const updateTax = (field: string, value: number | string) => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, tax: { ...prev.tax, [field]: value } };
    });
    setDirty(true);
  };

  const updateHealthcareOverride = (field: keyof HealthcareOverride, value: number | null) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const current = prev.healthcare_override ?? { annual_premium: null, annual_out_of_pocket: null };
      const next: HealthcareOverride = { ...current, [field]: value };
      // Collapse to null when both fields are unset, to keep persisted shape tidy.
      const allNull = next.annual_premium == null && next.annual_out_of_pocket == null;
      return { ...prev, healthcare_override: allNull ? null : next };
    });
    setDirty(true);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Income & Savings</h2>
        {saveStatus && <span className="text-xs text-slate-400">{saveStatus}</span>}
      </div>

      <div className="flex flex-col gap-6">
        <IncomeSection
          income={local.income}
          primaryName={local.personal.name || "Primary"}
          spouseName={local.spouse?.name || "Spouse"}
          hasSpouse={!!local.spouse}
          onChange={updateIncome}
          onToggleRsu={(who) => {
            setLocal((prev) => {
              if (!prev) return prev;
              if (who === "primary") {
                // Toggle: if RSU has any data, zero it out; otherwise set defaults
                const hasData = prev.income.rsu.current_price > 0 || prev.income.rsu.vested_shares > 0 || prev.income.rsu.unvested_tranches.length > 0;
                if (hasData) {
                  return { ...prev, income: { ...prev.income, rsu: { ...prev.income.rsu, current_price: 0, vested_shares: 0, unvested_tranches: [], annual_refresh_value: 0 } } };
                }
                return { ...prev, income: { ...prev.income, rsu: { ...prev.income.rsu, current_price: 1 } } };
              } else {
                // Toggle spouse RSU on/off
                if (prev.income.spouse_rsu) {
                  return { ...prev, income: { ...prev.income, spouse_rsu: null } };
                }
                const defaultRsu: RSUHolding = {
                  current_price: 1, annual_growth_rate_pct: 10, long_term_growth_rate_pct: null,
                  growth_transition_years: 3, volatility_pct: 25, vested_shares: 0, vested_price: 0,
                  vested_cost_basis: 0, vested_sale_year: null, unvested_tranches: [],
                  sell_to_cover_pct: 40, annual_refresh_value: 0, refresh_end_year: null,
                  refresh_sale_year: null, total_unvested_shares: 0, current_value: 0,
                };
                return { ...prev, income: { ...prev.income, spouse_rsu: defaultRsu } };
              }
            });
            setDirty(true);
          }}
          onAddTranche={(rsuKey) => {
            setLocal((prev) => {
              if (!prev) return prev;
              const newTranche: VestingTranche = { shares: 0, vest_year: new Date().getFullYear() + 1, sale_year: null };
              const rsu = prev.income[rsuKey as keyof typeof prev.income] as RSUHolding | null;
              if (!rsu) return prev;
              return { ...prev, income: { ...prev.income, [rsuKey]: { ...rsu, unvested_tranches: [...(rsu.unvested_tranches || []), newTranche] } } };
            });
            setDirty(true);
          }}
          onUpdateTranche={(rsuKey, index, field, value) => {
            setLocal((prev) => {
              if (!prev) return prev;
              const rsu = prev.income[rsuKey as keyof typeof prev.income] as RSUHolding | null;
              if (!rsu) return prev;
              const tranches = [...(rsu.unvested_tranches || [])];
              tranches[index] = { ...tranches[index], [field]: value };
              return { ...prev, income: { ...prev.income, [rsuKey]: { ...rsu, unvested_tranches: tranches } } };
            });
            setDirty(true);
          }}
          onRemoveTranche={(rsuKey, index) => {
            setLocal((prev) => {
              if (!prev) return prev;
              const rsu = prev.income[rsuKey as keyof typeof prev.income] as RSUHolding | null;
              if (!rsu) return prev;
              const tranches = (rsu.unvested_tranches || []).filter((_, i) => i !== index);
              return { ...prev, income: { ...prev.income, [rsuKey]: { ...rsu, unvested_tranches: tranches } } };
            });
            setDirty(true);
          }}
        />
        <SavingsSection savings={local.savings} income={local.income} hasSpouse={!!local.spouse} primaryName={local.personal.name || "Primary"} spouseName={local.spouse?.name || "Spouse"} onChange={updateSavings} />
        <HealthcareOverrideSection override={local.healthcare_override} onChange={updateHealthcareOverride} />
        <ExpensesSection expenses={local.expenses} profile={local} assets={assets} onChange={updateExpenses} />
        <TaxSection tax={local.tax} onChange={updateTax} />
        <ReconciliationPanel profile={local} assets={assets} />
      </div>

      {updateProfile.isError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          Error saving: {updateProfile.error.message}
        </div>
      )}
    </div>
  );
}
