import { useEffect, useState } from "react";
import { useProfile, useUpdateProfile } from "../hooks/useProfile";
import { FormField, Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import type { Profile, PersonSavings, Expenses, TaxConfig, VestingTranche } from "../types/profile";

// ─── Income Section ───────────────────────────────────────────────

function IncomeSection({
  income,
  onChange,
  onAddTranche,
  onUpdateTranche,
  onRemoveTranche,
}: {
  income: Profile["income"];
  onChange: (section: string, field: string, value: number) => void;
  onAddTranche: () => void;
  onUpdateTranche: (index: number, field: string, value: number) => void;
  onRemoveTranche: (index: number) => void;
}) {
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
      <h4 className="text-sm font-medium text-slate-500 mb-3">Primary Income</h4>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <FormField label="Base Salary">
          <Input type="number" value={income.primary.base_salary} onChange={(e) => onChange("primary", "base_salary", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Annual Raise %">
          <Input type="number" step="0.1" value={income.primary.annual_raise_pct} onChange={(e) => onChange("primary", "annual_raise_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Bonus %">
          <Input type="number" step="0.1" value={income.primary.bonus_pct} onChange={(e) => onChange("primary", "bonus_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
      </div>

      <h4 className="text-sm font-medium text-slate-500 mb-3">RSU Holdings</h4>
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
          <Input type="number" step="0.01" value={income.rsu.current_price} onChange={(e) => onChange("rsu", "current_price", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Initial Growth Rate %" hint="Near-term">
          <Input type="number" step="0.1" value={income.rsu.annual_growth_rate_pct} onChange={(e) => onChange("rsu", "annual_growth_rate_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Long-Term Growth Rate %" hint="After transition">
          <Input type="number" step="0.1" value={income.rsu.long_term_growth_rate_pct ?? ""} onChange={(e) => onChange("rsu", "long_term_growth_rate_pct", e.target.value ? parseFloat(e.target.value) : 0)} />
        </FormField>
        <FormField label="Transition Years">
          <Input type="number" value={income.rsu.growth_transition_years} onChange={(e) => onChange("rsu", "growth_transition_years", parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="Sell-to-Cover %" hint="Shares sold at vest for tax">
          <Input type="number" step="0.1" value={income.rsu.sell_to_cover_pct} onChange={(e) => onChange("rsu", "sell_to_cover_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
      </div>

      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-4">
        <h5 className="text-xs font-medium text-slate-500 mb-3">Vested Shares (in brokerage)</h5>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Shares">
            <Input type="number" value={income.rsu.vested_shares} onChange={(e) => onChange("rsu", "vested_shares", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Avg Vest Price">
            <Input type="number" step="0.01" value={income.rsu.vested_price} onChange={(e) => onChange("rsu", "vested_price", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Cost Basis" hint="Shares x vest price">
            <div className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium">
              ${Math.round(income.rsu.vested_shares * income.rsu.vested_price).toLocaleString()}
            </div>
          </FormField>
          <FormField label="Sale Year">
            <Input type="number" value={income.rsu.vested_sale_year ?? ""} onChange={(e) => onChange("rsu", "vested_sale_year", e.target.value ? parseInt(e.target.value) : 0)} />
          </FormField>
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h5 className="text-xs font-medium text-slate-500">Unvested Tranches</h5>
          <button onClick={onAddTranche} className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700">+ Add Tranche</button>
        </div>
        {income.rsu.unvested_tranches.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-2">No unvested tranches</div>
        ) : (
          <div className="flex flex-col gap-2">
            {income.rsu.unvested_tranches.map((t, i) => (
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

      <div className="grid grid-cols-2 gap-4 mb-6">
        <FormField label="Annual Refresh Grant $">
          <Input type="number" value={income.rsu.annual_refresh_value} onChange={(e) => onChange("rsu", "annual_refresh_value", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Last Grant Year">
          <Input type="number" value={income.rsu.refresh_end_year ?? ""} onChange={(e) => onChange("rsu", "refresh_end_year", e.target.value ? parseInt(e.target.value) : 0)} />
        </FormField>
        <FormField label="Refresh Sale Year">
          <Input type="number" value={income.rsu.refresh_sale_year ?? ""} onChange={(e) => onChange("rsu", "refresh_sale_year", e.target.value ? parseInt(e.target.value) : 0)} />
        </FormField>
      </div>

      {income.spouse && (
        <>
          <h4 className="text-sm font-medium text-slate-500 mb-3">Spouse Income</h4>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Base Salary">
              <Input type="number" value={income.spouse.base_salary} onChange={(e) => onChange("spouse", "base_salary", parseFloat(e.target.value) || 0)} />
            </FormField>
            <FormField label="Annual Raise %">
              <Input type="number" step="0.1" value={income.spouse.annual_raise_pct} onChange={(e) => onChange("spouse", "annual_raise_pct", parseFloat(e.target.value) || 0)} />
            </FormField>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Savings Section ──────────────────────────────────────────────

function PersonSavingsSection({
  title,
  savings,
  salary,
  onChange,
}: {
  title: string;
  savings: PersonSavings;
  salary: number;
  onChange: (field: string, value: number) => void;
}) {
  const rate = savings.contribution_rate_pct;
  const limit = savings.irs_401k_limit;
  const total401k = salary * rate / 100;
  const computedTrad = Math.min(total401k, limit);
  const computedRoth = Math.max(0, total401k - limit);

  const onRateChange = (newRate: number) => {
    const newTotal = salary * newRate / 100;
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
        <FormField label="Employer Match %">
          <Input type="number" step="0.1" value={savings.employer_match_pct} onChange={(e) => onChange("employer_match_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
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
  onChange,
}: {
  savings: Profile["savings"];
  income: Profile["income"];
  hasSpouse: boolean;
  onChange: (person: "primary" | "spouse" | "top", field: string, value: number) => void;
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
        <PersonSavingsSection title="Primary" savings={savings.primary} salary={income.primary.base_salary} onChange={(field, value) => onChange("primary", field, value)} />
        {hasSpouse && (
          <PersonSavingsSection title="Spouse" savings={savings.spouse} salary={income.spouse?.base_salary ?? 0} onChange={(field, value) => onChange("spouse", field, value)} />
        )}
      </div>
    </div>
  );
}

// ─── Expenses Section ─────────────────────────────────────────────

function ExpensesSection({
  expenses,
  onChange,
}: {
  expenses: Expenses;
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
        <h3 className="text-lg font-semibold">Expenses</h3>
        <button onClick={() => setMonthly(!monthly)} className="text-xs text-blue-600 hover:text-blue-800">
          Show {monthly ? "Annual" : "Monthly"}
        </button>
      </div>
      <SectionHelp
        summary="Base living expenses plus per-child costs. Per-child cost is ADDED ON TOP of base expenses — it's not included in the base number."
        details={[
          "Base expenses: your household spending (food, utilities, transport, insurance, travel, subscriptions). Excludes mortgage, tuition, and healthcare — those are modeled separately.",
          "Per-child cost: an additional amount per child, added to base expenses. With 2 kids at $15K each, total = base + $30K. Drops off when each child finishes college.",
          "At retirement, total living expenses are reduced by the retirement reduction % — a one-time step-down.",
          "In retirement, expenses exceeding Social Security + other income are covered by portfolio withdrawals.",
        ]}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField label={`Base ${period} Expenses`} hint={monthly ? `= $${Math.round(expenses.annual_base).toLocaleString()}/yr` : ""}>
          <Input type="number" value={Math.round(displayBase)} onChange={(e) => onChange("annual_base", (parseFloat(e.target.value) || 0) * factor)} />
        </FormField>
        <FormField label="Retirement Reduction %" hint="Step-down at retirement">
          <Input type="number" step="1" value={expenses.retirement_reduction_pct} onChange={(e) => onChange("retirement_reduction_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label={`Per-Child ${period} Cost`} hint={monthly ? `= $${Math.round(expenses.per_child_annual).toLocaleString()}/yr · added to base` : "Added on top of base expenses"}>
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
  const updateProfile = useUpdateProfile();
  const [local, setLocal] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profile) setLocal(profile);
  }, [profile]);

  if (isLoading) return <div className="text-slate-400">Loading...</div>;
  if (error) return <div className="text-red-500">Error loading profile</div>;
  if (!local) return null;

  const save = () => {
    updateProfile.mutate(local, { onSuccess: () => setDirty(false) });
  };

  const updateIncome = (section: string, field: string, value: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const sectionData = prev.income[section as keyof typeof prev.income];
      if (!sectionData || typeof sectionData !== "object") return prev;
      return { ...prev, income: { ...prev.income, [section]: { ...sectionData, [field]: value } } };
    });
    setDirty(true);
  };

  const updateSavings = (person: "primary" | "spouse" | "top", field: string, value: number) => {
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

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Basic Finances</h2>
        <button
          onClick={save}
          disabled={!dirty || updateProfile.isPending}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${dirty ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}
        >
          {updateProfile.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <div className="flex flex-col gap-6">
        <IncomeSection
          income={local.income}
          onChange={updateIncome}
          onAddTranche={() => {
            setLocal((prev) => {
              if (!prev) return prev;
              const newTranche: VestingTranche = { shares: 0, vest_year: new Date().getFullYear() + 1, sale_year: null };
              return { ...prev, income: { ...prev.income, rsu: { ...prev.income.rsu, unvested_tranches: [...(prev.income.rsu.unvested_tranches || []), newTranche] } } };
            });
            setDirty(true);
          }}
          onUpdateTranche={(index, field, value) => {
            setLocal((prev) => {
              if (!prev) return prev;
              const tranches = [...(prev.income.rsu.unvested_tranches || [])];
              tranches[index] = { ...tranches[index], [field]: value };
              return { ...prev, income: { ...prev.income, rsu: { ...prev.income.rsu, unvested_tranches: tranches } } };
            });
            setDirty(true);
          }}
          onRemoveTranche={(index) => {
            setLocal((prev) => {
              if (!prev) return prev;
              const tranches = (prev.income.rsu.unvested_tranches || []).filter((_, i) => i !== index);
              return { ...prev, income: { ...prev.income, rsu: { ...prev.income.rsu, unvested_tranches: tranches } } };
            });
            setDirty(true);
          }}
        />
        <SavingsSection savings={local.savings} income={local.income} hasSpouse={!!local.spouse} onChange={updateSavings} />
        <ExpensesSection expenses={local.expenses} onChange={updateExpenses} />
        <TaxSection tax={local.tax} onChange={updateTax} />
      </div>

      {updateProfile.isError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          Error saving: {updateProfile.error.message}
        </div>
      )}
    </div>
  );
}
