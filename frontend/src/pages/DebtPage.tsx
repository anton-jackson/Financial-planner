import { useEffect, useState } from "react";
import { useProfile, useUpdateProfile } from "../hooks/useProfile";
import { useAutoSave } from "../hooks/useAutoSave";
import { FormField, Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import type { Profile, Debt } from "../types/profile";

const DEBT_TYPE_LABELS: Record<string, string> = {
  heloc: "HELOC",
  personal_loc: "Personal Line of Credit",
  credit_card: "Credit Card",
  student_loan: "Student Loan",
  medical: "Medical Debt",
  other: "Other",
};

const REVOLVING_TYPES = ["heloc", "personal_loc", "credit_card"];

const EMPTY_DEBT: Debt = {
  name: "",
  type: "other",
  balance: 0,
  interest_rate_pct: 0,
  monthly_payment: 0,
  interest_only: false,
  payoff_year: null,
  credit_limit: 0,
};

export function DebtPage() {
  const { data: profile, isLoading, error } = useProfile();
  const updateProfile = useUpdateProfile();
  const [local, setLocal] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

  useEffect(() => {
    if (profile) setLocal(profile);
  }, [profile]);

  const save = () => {
    if (local) updateProfile.mutate(local, { onSuccess: () => setDirty(false) });
  };
  const { status: saveStatus } = useAutoSave(save, dirty, updateProfile.isPending);

  if (isLoading) return <div className="text-slate-400">Loading...</div>;
  if (error) return <div className="text-red-500">Error loading profile</div>;
  if (!local) return null;

  const debts = local.debts ?? [];

  const totalBalance = debts.reduce((sum, d) => sum + d.balance, 0);
  const totalMonthlyPayments = debts.reduce((sum, d) => sum + d.monthly_payment, 0);
  const weightedAvgRate =
    totalBalance > 0
      ? debts.reduce((sum, d) => sum + d.interest_rate_pct * d.balance, 0) / totalBalance
      : 0;

  const addDebt = (type: string) => {
    setLocal((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        debts: [...(prev.debts ?? []), { ...EMPTY_DEBT, type }],
      };
    });
    setDirty(true);
    setTypeDropdownOpen(false);
  };

  const updateDebt = (index: number, field: string, value: string | number | boolean | null) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const updated = [...(prev.debts ?? [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, debts: updated };
    });
    setDirty(true);
  };

  const removeDebt = (index: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, debts: (prev.debts ?? []).filter((_, i) => i !== index) };
    });
    setDirty(true);
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Debt Management</h2>
          <p className="text-sm text-slate-500 mt-1">
            HELOCs, credit cards, personal loans, student loans, and other non-mortgage debt.
          </p>
        </div>
        {saveStatus && <span className="text-xs text-slate-400">{saveStatus}</span>}
      </div>

      {/* Summary Bar */}
      {debts.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Total Debt Balance</div>
            <div className="text-xl font-semibold text-red-600">
              ${totalBalance.toLocaleString()}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Weighted Avg Interest Rate</div>
            <div className="text-xl font-semibold text-slate-800">
              {weightedAvgRate.toFixed(2)}%
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Total Monthly Payments</div>
            <div className="text-xl font-semibold text-red-600">
              ${totalMonthlyPayments.toLocaleString()}/mo
            </div>
          </div>
        </div>
      )}

      {/* Debt list */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Debts</h3>
          <div className="relative">
            <button
              onClick={() => setTypeDropdownOpen(!typeDropdownOpen)}
              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition-colors"
            >
              + Add Debt
            </button>
            {typeDropdownOpen && (
              <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-50">
                {Object.entries(DEBT_TYPE_LABELS).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => addDebt(key)}
                    className="block w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 first:rounded-t-lg last:rounded-b-lg"
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <SectionHelp
          summary="Track all non-mortgage debts. The simulator uses balances, rates, and payments to project payoff timelines and interest costs."
          details={[
            "Interest-only debts never reduce their principal balance in the simulation.",
            "Revolving debt types (HELOC, Line of Credit, Credit Card) show a credit limit field for utilization tracking.",
            "Payoff year, if set, tells the simulator when the debt will be fully paid off.",
            "Monthly payments are deducted from your cash flow each month in the simulation.",
          ]}
        />

        <div className="flex flex-col gap-4 mt-4">
          {debts.map((d, i) => (
            <div key={i} className="bg-slate-50 rounded-lg border border-slate-200 p-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-medium text-slate-600">
                  {d.name || `Debt ${i + 1}`}
                  <span className="ml-2 text-xs bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full">
                    {DEBT_TYPE_LABELS[d.type] ?? d.type}
                  </span>
                  {d.interest_only && (
                    <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                      interest-only
                    </span>
                  )}
                </h4>
                <button
                  onClick={() => removeDebt(i)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <FormField label="Name">
                  <Input
                    value={d.name}
                    onChange={(e) => updateDebt(i, "name", e.target.value)}
                    placeholder="e.g. Chase Sapphire, Sallie Mae"
                  />
                </FormField>
                <FormField label="Type">
                  <select
                    value={d.type}
                    onChange={(e) => updateDebt(i, "type", e.target.value)}
                    className="border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {Object.entries(DEBT_TYPE_LABELS).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-3">
                <FormField label="Balance">
                  <Input
                    type="number"
                    value={d.balance}
                    onChange={(e) => updateDebt(i, "balance", parseFloat(e.target.value) || 0)}
                  />
                </FormField>
                <FormField label="Interest Rate %">
                  <Input
                    type="number"
                    step="0.1"
                    value={d.interest_rate_pct}
                    onChange={(e) => updateDebt(i, "interest_rate_pct", parseFloat(e.target.value) || 0)}
                  />
                </FormField>
                <FormField label="Monthly Payment">
                  <Input
                    type="number"
                    value={d.monthly_payment}
                    onChange={(e) => updateDebt(i, "monthly_payment", parseFloat(e.target.value) || 0)}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <FormField label="Payoff Year" hint="Leave empty if unknown">
                  <Input
                    type="number"
                    value={d.payoff_year ?? ""}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      updateDebt(i, "payoff_year", val);
                    }}
                    placeholder="e.g. 2030"
                  />
                </FormField>
                {REVOLVING_TYPES.includes(d.type) && (
                  <FormField label="Credit Limit">
                    <Input
                      type="number"
                      value={d.credit_limit}
                      onChange={(e) => updateDebt(i, "credit_limit", parseFloat(e.target.value) || 0)}
                    />
                  </FormField>
                )}
              </div>

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={d.interest_only}
                    onChange={(e) => updateDebt(i, "interest_only", e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Interest-only payments
                </label>
              </div>
            </div>
          ))}

          {debts.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-8">
              No debts configured. Click "+ Add Debt" to add one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
