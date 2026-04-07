import { useEffect, useState } from "react";
import { useProfile } from "../hooks/useProfile";
import { simulationApi } from "../api/simulation";
import type { DeterministicResult, YearRow } from "../types/simulation";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  BarChart,
  Bar,
  Cell,
} from "recharts";

const fmt = (v: number) => `$${Math.round(v).toLocaleString()}`;
const fmtK = (v: number) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}M` : `$${Math.round(v / 1000)}K`;
const fmtPct = (v: number) => `${v.toFixed(1)}%`;

// ─── Asset breakdown at a point in time ───────────────────────────

interface AssetBreakdown {
  label: string;
  value: number;
  color: string;
  taxCharacter: string;
}

function getBreakdown(row: YearRow): AssetBreakdown[] {
  return [
    { label: "Traditional (401k/IRA)", value: row.traditional_balance, color: "#3b82f6", taxCharacter: "Tax-Deferred" },
    { label: "Roth (401k/IRA/HSA)", value: row.roth_balance, color: "#10b981", taxCharacter: "Tax-Free" },
    { label: "Taxable Brokerage", value: row.taxable_balance, color: "#f59e0b", taxCharacter: "Taxable (LTCG on gains)" },
    { label: "Vested RSU Shares", value: row.rsu_held_value, color: "#8b5cf6", taxCharacter: "Taxable (LTCG on sale)" },
    { label: "Real Estate Equity", value: row.real_estate_equity, color: "#ef4444", taxCharacter: "Illiquid / Step-up basis" },
    { label: "Vehicle Equity", value: row.vehicle_equity, color: "#6b7280", taxCharacter: "Depreciating / Non-liquid" },
  ].filter(a => a.value > 0);
}

function SnapshotCard({ title, row }: { title: string; row: YearRow }) {
  const breakdown = getBreakdown(row);
  const total = breakdown.reduce((s, b) => s + b.value, 0);
  const debt = row.vehicle_loan_debt + row.heloc_debt;

  // Group by tax character
  const taxDeferred = row.traditional_balance;
  const taxFree = row.roth_balance;
  const taxable = row.taxable_balance + row.rsu_held_value;
  const illiquid = row.real_estate_equity + row.vehicle_equity;
  const liquid = row.liquid_net_worth;

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-1">{title}</h3>
      <p className="text-sm text-slate-500 mb-4">
        Year {row.year} · Age {row.age_primary} · Net Worth {fmt(row.net_worth)}
      </p>

      {/* Asset bars */}
      <div className="space-y-2 mb-6">
        {breakdown.map((b) => (
          <div key={b.label} className="flex items-center gap-3">
            <div className="w-44 text-sm text-slate-600 truncate">{b.label}</div>
            <div className="flex-1 bg-slate-100 rounded-full h-5 relative overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(1, (b.value / total) * 100)}%`, backgroundColor: b.color }}
              />
            </div>
            <div className="w-24 text-sm text-right font-medium">{fmtK(b.value)}</div>
            <div className="w-28 text-xs text-slate-400">{b.taxCharacter}</div>
          </div>
        ))}
        {debt > 0 && (
          <div className="flex items-center gap-3">
            <div className="w-44 text-sm text-red-600 truncate">Outstanding Debt</div>
            <div className="flex-1" />
            <div className="w-24 text-sm text-right font-medium text-red-600">-{fmtK(debt)}</div>
            <div className="w-28 text-xs text-slate-400">Liability</div>
          </div>
        )}
      </div>

      {/* Summary boxes */}
      <div className="grid grid-cols-4 gap-3">
        <SummaryBox label="Liquid" value={liquid} color="#3b82f6" />
        <SummaryBox label="Illiquid" value={illiquid} color="#ef4444" />
        <SummaryBox label="Tax-Deferred" value={taxDeferred} sub="Taxed as ordinary income on withdrawal" color="#f59e0b" />
        <SummaryBox label="Tax-Free" value={taxFree} sub="Roth — no tax on withdrawal" color="#10b981" />
      </div>

      {/* Estate planning note */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <SummaryBox
          label="Taxable + Step-Up Eligible"
          value={taxable + illiquid}
          sub="Taxable brokerage, RSUs, and real estate get stepped-up basis at death"
          color="#8b5cf6"
        />
        <SummaryBox
          label="Tax-Deferred (no step-up)"
          value={taxDeferred}
          sub="Traditional accounts are taxed as ordinary income to heirs"
          color="#ef4444"
        />
      </div>
    </div>
  );
}

function SummaryBox({ label, value, sub, color }: { label: string; value: number; sub?: string; color: string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className="text-lg font-semibold">{fmtK(value)}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

// ─── Stacked area chart of pool balances ──────────────────────────

function PoolChart({ rows }: { rows: YearRow[] }) {
  const data = rows.map((r) => ({
    year: r.year,
    age: r.age_primary,
    traditional: r.traditional_balance,
    roth: r.roth_balance,
    taxable: r.taxable_balance,
    rsu: r.rsu_held_value,
    real_estate: r.real_estate_equity,
  }));

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-4">Asset Pools Over Time</h3>
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={data} margin={{ left: 20, right: 20, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number, name: string) => [fmt(value), name]}
            labelFormatter={(label) => {
              const row = data.find(d => d.year === label);
              return row ? `Year ${label} (age ${row.age})` : `Year ${label}`;
            }}
          />
          <Legend />
          <Area type="monotone" dataKey="traditional" name="Traditional" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.7} />
          <Area type="monotone" dataKey="roth" name="Roth" stackId="1" stroke="#10b981" fill="#10b981" fillOpacity={0.7} />
          <Area type="monotone" dataKey="taxable" name="Taxable" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.7} />
          <Area type="monotone" dataKey="rsu" name="RSU Shares" stackId="1" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.7} />
          <Area type="monotone" dataKey="real_estate" name="Real Estate" stackId="1" stroke="#ef4444" fill="#ef4444" fillOpacity={0.7} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Withdrawal breakdown chart ───────────────────────────────────

function WithdrawalChart({ rows }: { rows: YearRow[] }) {
  const retirementRows = rows.filter(r => r.portfolio_withdrawals > 0);
  if (retirementRows.length === 0) return null;

  const data = retirementRows.map((r) => ({
    year: r.year,
    age: r.age_primary,
    taxable: r.withdrawal_from_taxable,
    traditional: r.withdrawal_from_traditional,
    roth: r.withdrawal_from_roth,
  }));

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-2">Retirement Withdrawal Ordering</h3>
      <p className="text-sm text-slate-500 mb-4">
        Taxable first (LTCG on gains only), then Traditional (ordinary income), then Roth (tax-free)
      </p>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ left: 20, right: 20, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={fmtK} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value: number, name: string) => [fmt(value), name]}
            labelFormatter={(label) => {
              const row = data.find(d => d.year === label);
              return row ? `Year ${label} (age ${row.age})` : `Year ${label}`;
            }}
          />
          <Legend />
          <Bar dataKey="taxable" name="From Taxable" stackId="1" fill="#f59e0b" />
          <Bar dataKey="traditional" name="From Traditional" stackId="1" fill="#3b82f6" />
          <Bar dataKey="roth" name="From Roth" stackId="1" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Tax rate through retirement ──────────────────────────────────

function TaxRateChart({ rows }: { rows: YearRow[] }) {
  const data = rows.map((r) => ({
    year: r.year,
    age: r.age_primary,
    effective: r.effective_tax_rate_pct,
    marginal: r.marginal_tax_rate_pct,
  }));

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-4">Effective & Marginal Tax Rate</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data} margin={{ left: 20, right: 20, top: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="year" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 12 }} domain={[0, 'auto']} />
          <Tooltip
            formatter={(value: number, name: string) => [fmtPct(value), name]}
            labelFormatter={(label) => {
              const row = data.find(d => d.year === label);
              return row ? `Year ${label} (age ${row.age})` : `Year ${label}`;
            }}
          />
          <Legend />
          <Area type="monotone" dataKey="effective" name="Effective Rate" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
          <Area type="monotone" dataKey="marginal" name="Marginal Rate" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Retirement year table ────────────────────────────────────────

function RetirementTable({ rows, retirementYear }: { rows: YearRow[]; retirementYear: number }) {
  // Show 5 years before retirement through end
  const tableRows = rows.filter(r => r.year >= retirementYear - 5);

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 overflow-x-auto">
      <h3 className="text-lg font-semibold mb-4">Year-by-Year Detail</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="py-2 pr-3">Year</th>
            <th className="py-2 pr-3">Age</th>
            <th className="py-2 pr-3 text-right">Traditional</th>
            <th className="py-2 pr-3 text-right">Roth</th>
            <th className="py-2 pr-3 text-right">Taxable</th>
            <th className="py-2 pr-3 text-right">RE Equity</th>
            <th className="py-2 pr-3 text-right">Net Worth</th>
            <th className="py-2 pr-3 text-right">Withdrawals</th>
            <th className="py-2 pr-3 text-right">Eff Tax %</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((r) => (
            <tr
              key={r.year}
              className={`border-b border-slate-100 ${r.year === retirementYear ? "bg-blue-50 font-medium" : ""}`}
            >
              <td className="py-1.5 pr-3">{r.year}</td>
              <td className="py-1.5 pr-3">{r.age_primary}</td>
              <td className="py-1.5 pr-3 text-right">{fmtK(r.traditional_balance)}</td>
              <td className="py-1.5 pr-3 text-right">{fmtK(r.roth_balance)}</td>
              <td className="py-1.5 pr-3 text-right">{fmtK(r.taxable_balance)}</td>
              <td className="py-1.5 pr-3 text-right">{fmtK(r.real_estate_equity)}</td>
              <td className="py-1.5 pr-3 text-right font-medium">{fmtK(r.net_worth)}</td>
              <td className="py-1.5 pr-3 text-right">{r.portfolio_withdrawals > 0 ? fmtK(r.portfolio_withdrawals) : "—"}</td>
              <td className="py-1.5 pr-3 text-right">{fmtPct(r.effective_tax_rate_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export function RetirementPage() {
  const { data: profile } = useProfile();
  const [result, setResult] = useState<DeterministicResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    simulationApi.baseline().then((res) => {
      if (!cancelled) {
        setResult(res);
        setLoading(false);
      }
    }).catch(() => setLoading(false));
    return () => { cancelled = true; };
  }, []);

  if (loading || !result || !profile) {
    return (
      <div className="max-w-5xl">
        <h2 className="text-2xl font-bold mb-6">Retirement</h2>
        <div className="text-slate-400">Loading simulation...</div>
      </div>
    );
  }

  const retirementYear = profile.personal.birth_year + profile.personal.retirement_age;
  const rows = result.yearly;
  const retirementRow = rows.find(r => r.year === retirementYear);
  const endRow = rows[rows.length - 1];
  const midRetirement = rows.find(r => r.year === retirementYear + 10);

  return (
    <div className="max-w-5xl">
      <h2 className="text-2xl font-bold mb-6">Retirement</h2>

      <div className="flex flex-col gap-6">
        {/* Snapshots */}
        {retirementRow && (
          <SnapshotCard title="At Retirement" row={retirementRow} />
        )}

        {midRetirement && (
          <SnapshotCard title="10 Years Into Retirement" row={midRetirement} />
        )}

        {endRow && endRow.year !== retirementRow?.year && (
          <SnapshotCard title="End of Plan" row={endRow} />
        )}

        {/* Charts */}
        <PoolChart rows={rows} />
        <WithdrawalChart rows={rows} />
        <TaxRateChart rows={rows} />

        {/* Table */}
        <RetirementTable rows={rows} retirementYear={retirementYear} />
      </div>
    </div>
  );
}
