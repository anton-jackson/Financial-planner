import { useState } from "react";
import { FormField, Input } from "../components/shared/FormField";
import { onboardingApi } from "../api/onboarding";

// ─── State shape ────────────────────────────────────────────────────

interface WizardState {
  // Step 1: You
  name: string;
  birth_year: number;
  retirement_age: number;
  state_of_residence: string;
  has_spouse: boolean;
  spouse_name: string;
  spouse_birth_year: number;
  spouse_retirement_age: number;
  filing_status: string;
  num_children: number;
  children: { name: string; birth_year: number }[];

  // Step 2: Money In
  base_salary: number;
  annual_raise_pct: number;
  bonus_pct: number;
  spouse_salary: number;
  spouse_raise_pct: number;
  contribution_rate_pct: number;
  employer_match_pct: number;
  annual_ira_roth: number;
  annual_hsa: number;
  additional_monthly_savings: number;
  spouse_contribution_rate_pct: number;
  spouse_employer_match_pct: number;
  spouse_ira_roth: number;

  // Step 3: Money Out
  annual_expenses: number;
  retirement_reduction_pct: number;
  owns_home: boolean;
  home_value: number;
  mortgage_balance: number;
  mortgage_rate_pct: number;
  monthly_payment: number;
  annual_property_tax: number;

  // Step 4: What You Have
  balance_401k: number;
  balance_roth_ira: number;
  balance_trad_ira: number;
  balance_hsa: number;
  balance_brokerage: number;
  balance_529: number;
  balance_other: number;
  spouse_balance_401k: number;
  spouse_balance_roth_ira: number;
  spouse_balance_trad_ira: number;
}

const INITIAL: WizardState = {
  name: "",
  birth_year: 1985,
  retirement_age: 65,
  state_of_residence: "",
  has_spouse: false,
  spouse_name: "",
  spouse_birth_year: 1985,
  spouse_retirement_age: 65,
  filing_status: "single",
  num_children: 0,
  children: [],

  base_salary: 0,
  annual_raise_pct: 3.0,
  bonus_pct: 0,
  spouse_salary: 0,
  spouse_raise_pct: 2.5,
  contribution_rate_pct: 10,
  employer_match_pct: 4,
  annual_ira_roth: 0,
  annual_hsa: 0,
  additional_monthly_savings: 0,
  spouse_contribution_rate_pct: 10,
  spouse_employer_match_pct: 3,
  spouse_ira_roth: 0,

  annual_expenses: 80000,
  retirement_reduction_pct: 20,
  owns_home: false,
  home_value: 0,
  mortgage_balance: 0,
  mortgage_rate_pct: 6.5,
  monthly_payment: 0,
  annual_property_tax: 0,

  balance_401k: 0,
  balance_roth_ira: 0,
  balance_trad_ira: 0,
  balance_hsa: 0,
  balance_brokerage: 0,
  balance_529: 0,
  balance_other: 0,
  spouse_balance_401k: 0,
  spouse_balance_roth_ira: 0,
  spouse_balance_trad_ira: 0,
};

const STEPS = ["You", "Money In", "Money Out", "What You Have", "Review"];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN",
  "IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV",
  "NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN",
  "TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

// ─── Main Wizard ────────────────────────────────────────────────────

export function OnboardingWizard({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardState>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof WizardState>(field: K, value: WizardState[K]) => {
    setData((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-sync children array length
      if (field === "num_children") {
        const n = value as number;
        const existing = prev.children;
        if (n > existing.length) {
          next.children = [
            ...existing,
            ...Array.from({ length: n - existing.length }, (_, i) => ({
              name: `Child ${existing.length + i + 1}`,
              birth_year: new Date().getFullYear() - 5,
            })),
          ];
        } else {
          next.children = existing.slice(0, n);
        }
      }
      // Auto-set filing status
      if (field === "has_spouse") {
        next.filing_status = value ? "mfj" : "single";
      }
      // Auto-toggle spouse when filing status is MFJ
      if (field === "filing_status") {
        next.has_spouse = value === "mfj";
      }
      return next;
    });
  };

  const setChild = (index: number, field: string, value: string | number) => {
    setData((prev) => {
      const children = [...prev.children];
      children[index] = { ...children[index], [field]: value };
      return { ...prev, children };
    });
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const handleComplete = async () => {
    setSaving(true);
    setError(null);
    try {
      const profile = buildProfile(data);
      const assets = buildAssets(data);
      await onboardingApi.complete({ profile, assets });
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Progress bar */}
      <div className="bg-white border-b border-slate-200 px-8 py-4">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-lg font-semibold text-slate-800">Set Up Your Financial Plan</h1>
            <span className="text-sm text-slate-400">Step {step + 1} of {STEPS.length}</span>
          </div>
          <div className="flex gap-1">
            {STEPS.map((label, i) => (
              <button
                key={label}
                onClick={() => i < step && setStep(i)}
                className={`flex-1 h-2 rounded-full transition-colors ${
                  i <= step ? "bg-blue-600" : "bg-slate-200"
                } ${i < step ? "cursor-pointer" : "cursor-default"}`}
                title={label}
              />
            ))}
          </div>
          <div className="flex justify-between mt-1">
            {STEPS.map((label, i) => (
              <span
                key={label}
                className={`text-xs ${i === step ? "text-blue-600 font-medium" : "text-slate-400"}`}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 px-8 py-8">
        <div className="max-w-3xl mx-auto">
          {step === 0 && <StepYou data={data} set={set} setChild={setChild} />}
          {step === 1 && <StepMoneyIn data={data} set={set} />}
          {step === 2 && <StepMoneyOut data={data} set={set} />}
          {step === 3 && <StepWhatYouHave data={data} set={set} />}
          {step === 4 && <StepReview data={data} />}

          {error && (
            <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="bg-white border-t border-slate-200 px-8 py-4">
        <div className="max-w-3xl mx-auto flex justify-between">
          <button
            onClick={back}
            disabled={step === 0}
            className="px-6 py-2.5 text-sm font-medium text-slate-600 bg-slate-100
                       rounded-lg hover:bg-slate-200 disabled:opacity-40
                       disabled:cursor-not-allowed transition-colors"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={next}
              className="px-6 py-2.5 text-sm font-medium text-white bg-blue-600
                         rounded-lg hover:bg-blue-700 transition-colors"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={handleComplete}
              disabled={saving}
              className="px-8 py-2.5 text-sm font-medium text-white bg-emerald-600
                         rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving..." : "Launch My Plan"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Step 1: You ────────────────────────────────────────────────────

function StepYou({
  data,
  set,
  setChild,
}: {
  data: WizardState;
  set: <K extends keyof WizardState>(f: K, v: WizardState[K]) => void;
  setChild: (i: number, f: string, v: string | number) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">About You</h2>
        <p className="text-sm text-slate-500 mt-1">
          The basics we need to project your financial future.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Your Name">
            <Input value={data.name} onChange={(e) => set("name", e.target.value)} placeholder="Jane" />
          </FormField>
          <FormField label="Birth Year">
            <Input type="number" value={data.birth_year} onChange={(e) => set("birth_year", int(e))} />
          </FormField>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Target Retirement Age">
            <Input type="number" value={data.retirement_age} onChange={(e) => set("retirement_age", int(e))} />
          </FormField>
          <FormField label="State" hint="For tax calculations">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={data.state_of_residence}
              onChange={(e) => set("state_of_residence", e.target.value)}
            >
              <option value="">Select state...</option>
              {US_STATES.map((s) => (
                <option key={s} value={s.toLowerCase()}>{s}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Filing Status">
            <select
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={data.filing_status}
              onChange={(e) => set("filing_status", e.target.value)}
            >
              <option value="single">Single</option>
              <option value="mfj">Married Filing Jointly</option>
              <option value="hoh">Head of Household</option>
            </select>
          </FormField>
        </div>
      </div>

      {/* Spouse */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <label className="flex items-center gap-3 mb-4">
          <input
            type="checkbox"
            checked={data.has_spouse}
            onChange={(e) => set("has_spouse", e.target.checked)}
            className="rounded border-slate-300 w-4 h-4"
          />
          <span className="text-sm font-medium text-slate-700">I have a spouse / partner</span>
        </label>
        {data.has_spouse && (
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Spouse Name">
              <Input value={data.spouse_name} onChange={(e) => set("spouse_name", e.target.value)} />
            </FormField>
            <FormField label="Birth Year">
              <Input type="number" value={data.spouse_birth_year} onChange={(e) => set("spouse_birth_year", int(e))} />
            </FormField>
            <FormField label="Retirement Age">
              <Input type="number" value={data.spouse_retirement_age} onChange={(e) => set("spouse_retirement_age", int(e))} />
            </FormField>
          </div>
        )}
      </div>

      {/* Children */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <FormField label="Number of Children" hint="For college planning and per-child expenses">
          <Input
            type="number"
            min="0"
            max="10"
            value={data.num_children}
            onChange={(e) => set("num_children", Math.max(0, int(e)))}
            className="w-24"
          />
        </FormField>
        {data.children.length > 0 && (
          <div className="mt-4 space-y-3">
            {data.children.map((child, i) => (
              <div key={i} className="grid grid-cols-2 gap-4 bg-slate-50 rounded-lg p-3">
                <FormField label={`Child ${i + 1} Name`}>
                  <Input value={child.name} onChange={(e) => setChild(i, "name", e.target.value)} />
                </FormField>
                <FormField label="Birth Year">
                  <Input type="number" value={child.birth_year} onChange={(e) => setChild(i, "birth_year", int(e))} />
                </FormField>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 2: Money In ───────────────────────────────────────────────

function StepMoneyIn({
  data,
  set,
}: {
  data: WizardState;
  set: <K extends keyof WizardState>(f: K, v: WizardState[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Income & Savings</h2>
        <p className="text-sm text-slate-500 mt-1">
          What you earn and how much you're putting away.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Your Income</h3>
        <div className="grid grid-cols-3 gap-4">
          <FormField label="Base Salary">
            <Input type="number" value={data.base_salary} onChange={(e) => set("base_salary", num(e))} />
          </FormField>
          <FormField label="Annual Raise %" hint="Expected yearly increase">
            <Input type="number" step="0.1" value={data.annual_raise_pct} onChange={(e) => set("annual_raise_pct", num(e))} />
          </FormField>
          <FormField label="Bonus %" hint="% of salary">
            <Input type="number" step="1" value={data.bonus_pct} onChange={(e) => set("bonus_pct", num(e))} />
          </FormField>
        </div>

        {data.has_spouse && (
          <>
            <h3 className="text-sm font-semibold text-slate-600 mb-3 mt-6">Spouse Income</h3>
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Spouse Base Salary">
                <Input type="number" value={data.spouse_salary} onChange={(e) => set("spouse_salary", num(e))} />
              </FormField>
              <FormField label="Annual Raise %">
                <Input type="number" step="0.1" value={data.spouse_raise_pct} onChange={(e) => set("spouse_raise_pct", num(e))} />
              </FormField>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Your Retirement Savings</h3>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="401k Contribution %" hint="% of salary you contribute">
            <Input type="number" step="1" value={data.contribution_rate_pct} onChange={(e) => set("contribution_rate_pct", num(e))} />
          </FormField>
          <FormField label="Employer Match %" hint="% of salary your employer matches">
            <Input type="number" step="0.5" value={data.employer_match_pct} onChange={(e) => set("employer_match_pct", num(e))} />
          </FormField>
          <FormField label="Annual Roth IRA" hint="$7,000 max for 2026">
            <Input type="number" value={data.annual_ira_roth} onChange={(e) => set("annual_ira_roth", num(e))} />
          </FormField>
          <FormField label="Annual HSA" hint="$4,300 individual / $8,550 family">
            <Input type="number" value={data.annual_hsa} onChange={(e) => set("annual_hsa", num(e))} />
          </FormField>
        </div>

        {data.has_spouse && (
          <>
            <h3 className="text-sm font-semibold text-slate-600 mb-3 mt-6">Spouse Retirement Savings</h3>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="401k Contribution %" hint="% of spouse salary">
                <Input type="number" step="1" value={data.spouse_contribution_rate_pct} onChange={(e) => set("spouse_contribution_rate_pct", num(e))} />
              </FormField>
              <FormField label="Employer Match %">
                <Input type="number" step="0.5" value={data.spouse_employer_match_pct} onChange={(e) => set("spouse_employer_match_pct", num(e))} />
              </FormField>
              <FormField label="Annual Roth IRA">
                <Input type="number" value={data.spouse_ira_roth} onChange={(e) => set("spouse_ira_roth", num(e))} />
              </FormField>
            </div>
          </>
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Additional Savings</h3>
        <FormField label="Extra Monthly Savings" hint="Beyond retirement accounts, into taxable brokerage">
          <Input type="number" value={data.additional_monthly_savings} onChange={(e) => set("additional_monthly_savings", num(e))} />
        </FormField>
      </div>
    </div>
  );
}

// ─── Step 3: Money Out ──────────────────────────────────────────────

function StepMoneyOut({
  data,
  set,
}: {
  data: WizardState;
  set: <K extends keyof WizardState>(f: K, v: WizardState[K]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Spending & Housing</h2>
        <p className="text-sm text-slate-500 mt-1">
          What you spend annually and your housing situation.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Other Annual Living Expenses</h3>
        <p className="text-xs text-slate-400 mb-4">
          A residual bucket — everything NOT modeled elsewhere. Do <strong>not</strong> include:
          mortgage &amp; property taxes/insurance, tuition &amp; 529 contributions, healthcare premiums
          &amp; out-of-pocket, debt payments, auto loans &amp; auto purchases, retirement &amp; HSA
          contributions, or income/payroll taxes. Those are captured in their own sections and
          computed by the engine.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Other Annual Living Expenses" hint="In today's dollars">
            <Input type="number" value={data.annual_expenses} onChange={(e) => set("annual_expenses", num(e))} />
          </FormField>
          <FormField label="Retirement Spending Reduction %" hint="How much less you'll spend in retirement">
            <Input type="number" step="5" value={data.retirement_reduction_pct} onChange={(e) => set("retirement_reduction_pct", num(e))} />
          </FormField>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <label className="flex items-center gap-3 mb-4">
          <input
            type="checkbox"
            checked={data.owns_home}
            onChange={(e) => set("owns_home", e.target.checked)}
            className="rounded border-slate-300 w-4 h-4"
          />
          <span className="text-sm font-medium text-slate-700">I own my home</span>
        </label>
        {data.owns_home && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Home Value" hint="Current market value">
                <Input type="number" value={data.home_value} onChange={(e) => set("home_value", num(e))} />
              </FormField>
              <FormField label="Mortgage Balance" hint="Remaining balance">
                <Input type="number" value={data.mortgage_balance} onChange={(e) => set("mortgage_balance", num(e))} />
              </FormField>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Mortgage Rate %">
                <Input type="number" step="0.125" value={data.mortgage_rate_pct} onChange={(e) => set("mortgage_rate_pct", num(e))} />
              </FormField>
              <FormField label="Monthly Payment">
                <Input type="number" value={data.monthly_payment} onChange={(e) => set("monthly_payment", num(e))} />
              </FormField>
              <FormField label="Annual Property Tax">
                <Input type="number" value={data.annual_property_tax} onChange={(e) => set("annual_property_tax", num(e))} />
              </FormField>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Step 4: What You Have ──────────────────────────────────────────

function StepWhatYouHave({
  data,
  set,
}: {
  data: WizardState;
  set: <K extends keyof WizardState>(f: K, v: WizardState[K]) => void;
}) {
  const accounts: { key: keyof WizardState; label: string; hint: string }[] = [
    { key: "balance_401k", label: "401k / 403b", hint: "Traditional pre-tax" },
    { key: "balance_roth_ira", label: "Roth IRA", hint: "Tax-free growth" },
    { key: "balance_trad_ira", label: "Traditional IRA", hint: "Pre-tax" },
    { key: "balance_hsa", label: "HSA", hint: "Health savings" },
    { key: "balance_brokerage", label: "Taxable Brokerage", hint: "After-tax investments" },
    { key: "balance_529", label: "529 Plan", hint: "Education savings" },
    { key: "balance_other", label: "Other (crypto, etc.)", hint: "Any other investments" },
  ];

  const spouseAccounts: { key: keyof WizardState; label: string; hint: string }[] = [
    { key: "spouse_balance_401k", label: "Spouse 401k / 403b", hint: "Traditional pre-tax" },
    { key: "spouse_balance_roth_ira", label: "Spouse Roth IRA", hint: "Tax-free growth" },
    { key: "spouse_balance_trad_ira", label: "Spouse Traditional IRA", hint: "Pre-tax" },
  ];

  const allAccounts = data.has_spouse ? [...accounts, ...spouseAccounts] : accounts;
  const total = allAccounts.reduce((sum, a) => sum + ((data[a.key] as number) || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Current Account Balances</h2>
        <p className="text-sm text-slate-500 mt-1">
          Enter approximate current balances. You can refine these later or add
          individual holdings on the Portfolio page.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">Your Accounts</h3>
        <div className="space-y-3">
          {accounts.map(({ key, label, hint }) => (
            <div key={key} className="flex items-center gap-4">
              <div className="w-48">
                <div className="text-sm font-medium text-slate-700">{label}</div>
                <div className="text-xs text-slate-400">{hint}</div>
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  value={data[key] as number}
                  onChange={(e) => set(key, num(e))}
                  placeholder="0"
                />
              </div>
            </div>
          ))}
        </div>

        {data.has_spouse && (
          <>
            <h3 className="text-sm font-semibold text-slate-600 mb-3 mt-6">Spouse Accounts</h3>
            <div className="space-y-3">
              {spouseAccounts.map(({ key, label, hint }) => (
                <div key={key} className="flex items-center gap-4">
                  <div className="w-48">
                    <div className="text-sm font-medium text-slate-700">{label}</div>
                    <div className="text-xs text-slate-400">{hint}</div>
                  </div>
                  <div className="flex-1">
                    <Input
                      type="number"
                      value={data[key] as number}
                      onChange={(e) => set(key, num(e))}
                      placeholder="0"
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center">
          <span className="text-sm font-medium text-slate-600">Total Portfolio</span>
          <span className="text-lg font-semibold text-slate-800">
            ${total.toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Step 5: Review ─────────────────────────────────────────────────

function StepReview({ data }: { data: WizardState }) {
  const totalAccounts =
    data.balance_401k + data.balance_roth_ira + data.balance_trad_ira +
    data.balance_hsa + data.balance_brokerage + data.balance_529 + data.balance_other;

  const homeEquity = data.owns_home ? data.home_value - data.mortgage_balance : 0;
  const totalIncome = data.base_salary + (data.has_spouse ? data.spouse_salary : 0);
  const primary401k = data.base_salary * (data.contribution_rate_pct / 100);
  const spouse401k = data.has_spouse ? data.spouse_salary * (data.spouse_contribution_rate_pct / 100) : 0;
  const spouseIra = data.has_spouse ? data.spouse_ira_roth : 0;
  const annualSavings = primary401k + spouse401k + data.annual_ira_roth + spouseIra + data.annual_hsa + data.additional_monthly_savings * 12;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800">Review Your Plan</h2>
        <p className="text-sm text-slate-500 mt-1">
          Everything looks good? Hit "Launch My Plan" to run your first simulation.
          You can always adjust details later.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SummaryCard label="Total Household Income" value={`$${totalIncome.toLocaleString()}/yr`} />
        <SummaryCard label="Annual Savings" value={`$${Math.round(annualSavings).toLocaleString()}/yr`} />
        <SummaryCard label="Investment Accounts" value={`$${totalAccounts.toLocaleString()}`} />
        <SummaryCard label="Home Equity" value={data.owns_home ? `$${homeEquity.toLocaleString()}` : "Renting"} />
        <SummaryCard
          label="Retirement Target"
          value={`Age ${data.retirement_age} (${data.birth_year + data.retirement_age})`}
        />
        <SummaryCard label="Annual Spending" value={`$${data.annual_expenses.toLocaleString()}/yr`} />
        {data.has_spouse && (
          <SummaryCard
            label="Spouse Retirement"
            value={`Age ${data.spouse_retirement_age} (${data.spouse_birth_year + data.spouse_retirement_age})`}
          />
        )}
        {data.num_children > 0 && (
          <SummaryCard label="Children" value={`${data.num_children}`} />
        )}
      </div>

      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <h3 className="text-sm font-semibold text-slate-600 mb-3">What happens next</h3>
        <ul className="text-sm text-slate-500 space-y-2">
          <li>Your profile and account balances will be saved</li>
          <li>Base, bear, and bull market scenarios will be created</li>
          <li>The dashboard will run your first simulation automatically</li>
          <li>You can refine any details from the sidebar pages at any time</li>
        </ul>
      </div>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-lg font-semibold text-slate-800 mt-0.5">{value}</div>
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────

function int(e: React.ChangeEvent<HTMLInputElement>): number {
  return parseInt(e.target.value) || 0;
}

function num(e: React.ChangeEvent<HTMLInputElement>): number {
  return parseFloat(e.target.value) || 0;
}

function buildProfile(d: WizardState) {
  const profile: Record<string, unknown> = {
    schema_version: 1,
    personal: {
      name: d.name || "Me",
      birth_year: d.birth_year,
      retirement_age: d.retirement_age,
      life_expectancy_age: 90,
      state_of_residence: d.state_of_residence,
    },
    spouse: d.has_spouse
      ? {
          name: d.spouse_name || "Spouse",
          birth_year: d.spouse_birth_year,
          retirement_age: d.spouse_retirement_age,
          life_expectancy_age: 90,
          state_of_residence: d.state_of_residence,
        }
      : null,
    children: d.children.map((c) => ({
      name: c.name,
      birth_year: c.birth_year,
      college_start_year: c.birth_year + 18,
      college_years: 4,
      current_school: null,
      school_stages: [],
      plan_529_balance: 0,
      plan_529_monthly_contribution: 0,
      parent_college_annual: 0,
    })),
    income: {
      primary: {
        base_salary: d.base_salary,
        annual_raise_pct: d.annual_raise_pct,
        bonus_pct: d.bonus_pct,
        bonus_variability_pct: 5.0,
      },
      rsu: {
        current_price: 0,
        annual_growth_rate_pct: 0,
        long_term_growth_rate_pct: null,
        growth_transition_years: 5,
        volatility_pct: 25,
        vested_shares: 0,
        vested_price: 0,
        vested_sale_year: null,
        unvested_tranches: [],
        sell_to_cover_pct: 0,
        annual_refresh_value: 0,
        refresh_end_year: null,
        refresh_sale_year: null,
      },
      spouse: d.has_spouse
        ? { base_salary: d.spouse_salary, annual_raise_pct: d.spouse_raise_pct, bonus_pct: 0, bonus_variability_pct: 5 }
        : null,
      spouse_rsu: null,
    },
    savings: {
      primary: {
        contribution_rate_pct: d.contribution_rate_pct,
        bonus_401k_eligible: false,
        irs_401k_limit: 24500,
        annual_401k_traditional: 0,
        annual_401k_roth: 0,
        employer_match_pct: d.employer_match_pct,
        employer_contribution_pct: 0,
        annual_ira_traditional: 0,
        annual_ira_roth: d.annual_ira_roth,
        annual_hsa: d.annual_hsa,
        additional_monthly_savings: d.additional_monthly_savings,
      },
      spouse: d.has_spouse
        ? {
            contribution_rate_pct: d.spouse_contribution_rate_pct,
            bonus_401k_eligible: false,
            irs_401k_limit: 24500,
            annual_401k_traditional: 0,
            annual_401k_roth: 0,
            employer_match_pct: d.spouse_employer_match_pct,
            employer_contribution_pct: 0,
            annual_ira_traditional: 0,
            annual_ira_roth: d.spouse_ira_roth,
            annual_hsa: 0,
            additional_monthly_savings: 0,
          }
        : {
            contribution_rate_pct: 0,
            bonus_401k_eligible: false,
            irs_401k_limit: 24500,
            annual_401k_traditional: 0,
            annual_401k_roth: 0,
            employer_match_pct: 0,
            employer_contribution_pct: 0,
            annual_ira_traditional: 0,
            annual_ira_roth: 0,
            annual_hsa: 0,
            additional_monthly_savings: 0,
          },
      monthly_529_per_child: 0,
    },
    expenses: {
      annual_base: d.annual_expenses,
      retirement_reduction_pct: d.retirement_reduction_pct,
      per_child_annual: d.num_children > 0 ? 15000 : 0,
      children_leave_after_college: true,
    },
    tax: {
      filing_status: d.filing_status,
      pre_retirement_effective_pct: 32,
      retirement_effective_pct: 25,
      long_term_cap_gains_pct: 20,
      ss_taxable_pct: 85,
      state_income_tax_pct: 0,
    },
    windfalls: [],
    existing_vehicles: [],
    vehicles: [],
    debts: [],
  };
  return profile;
}

function buildAssets(d: WizardState) {
  const assets: { name: string; type: string; balance: number; return_profile: string; properties: Record<string, unknown> }[] = [];

  if (d.balance_401k > 0) {
    assets.push({ name: "Traditional 401k", type: "traditional_401k", balance: d.balance_401k, return_profile: "stocks_bonds", properties: {} });
  }
  if (d.balance_roth_ira > 0) {
    assets.push({ name: "Roth IRA", type: "roth_ira", balance: d.balance_roth_ira, return_profile: "stocks_bonds", properties: {} });
  }
  if (d.balance_trad_ira > 0) {
    assets.push({ name: "Traditional IRA", type: "traditional_ira", balance: d.balance_trad_ira, return_profile: "stocks_bonds", properties: {} });
  }
  if (d.balance_hsa > 0) {
    assets.push({ name: "HSA", type: "hsa", balance: d.balance_hsa, return_profile: "stocks_bonds", properties: {} });
  }
  if (d.balance_brokerage > 0) {
    assets.push({ name: "Taxable Brokerage", type: "taxable_brokerage", balance: d.balance_brokerage, return_profile: "stocks_bonds", properties: {} });
  }
  if (d.balance_529 > 0) {
    assets.push({ name: "529 Plan", type: "529", balance: d.balance_529, return_profile: "stocks_bonds", properties: {} });
  }
  if (d.balance_other > 0) {
    assets.push({ name: "Other Investments", type: "other", balance: d.balance_other, return_profile: "stocks_bonds", properties: {} });
  }
  if (d.has_spouse) {
    if (d.spouse_balance_401k > 0) {
      assets.push({ name: "Spouse 401k", type: "traditional_401k", balance: d.spouse_balance_401k, return_profile: "stocks_bonds", properties: {} });
    }
    if (d.spouse_balance_roth_ira > 0) {
      assets.push({ name: "Spouse Roth IRA", type: "roth_ira", balance: d.spouse_balance_roth_ira, return_profile: "stocks_bonds", properties: {} });
    }
    if (d.spouse_balance_trad_ira > 0) {
      assets.push({ name: "Spouse Traditional IRA", type: "traditional_ira", balance: d.spouse_balance_trad_ira, return_profile: "stocks_bonds", properties: {} });
    }
  }
  if (d.owns_home && d.home_value > 0) {
    assets.push({
      name: "Primary Residence",
      type: "real_estate",
      balance: d.home_value,
      return_profile: "real_estate",
      properties: {
        purchase_price: d.home_value,
        mortgage_balance: d.mortgage_balance,
        mortgage_rate_pct: d.mortgage_rate_pct,
        monthly_payment: d.monthly_payment,
        is_rental: false,
        annual_property_tax: d.annual_property_tax,
        annual_insurance: 0,
        appreciation_rate_pct: 3,
        annual_carrying_cost: 0,
      },
    });
  }

  return { schema_version: 1, assets };
}
