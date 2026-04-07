import { useState, useCallback } from "react";
import { useProfile } from "../hooks/useProfile";
import { simulationApi, type SweepRequest, type SweepResult, type SweepCell } from "../api/simulation";

/* ─── Variable definitions ─── */

interface SweepVariable {
  key: string;
  label: string;
  defaultRange: (profile: any) => number[];
  format: (v: number) => string;
}

const SWEEP_VARIABLES: SweepVariable[] = [
  {
    key: "retirement_age",
    label: "Retirement Age",
    defaultRange: (p) => {
      const current = p?.personal?.retirement_age ?? 63;
      const ages = [];
      for (let a = Math.max(55, current - 4); a <= Math.min(70, current + 4); a++) ages.push(a);
      return ages;
    },
    format: (v) => String(v),
  },
  {
    key: "annual_base_expenses",
    label: "Annual Expenses",
    defaultRange: (p) => {
      const current = p?.expenses?.annual_base ?? 168000;
      const step = 20000;
      const values = [];
      for (let v = Math.max(80000, current - step * 3); v <= current + step * 3; v += step) values.push(v);
      return values;
    },
    format: (v) => `$${(v / 1000).toFixed(0)}k`,
  },
  {
    key: "contribution_rate_pct",
    label: "401k Rate %",
    defaultRange: () => [0, 5, 10, 15, 20, 25, 30],
    format: (v) => `${v}%`,
  },
  {
    key: "additional_monthly_savings",
    label: "Monthly Savings",
    defaultRange: () => [0, 500, 1000, 2000, 3000, 5000],
    format: (v) => `$${v.toLocaleString()}`,
  },
  {
    key: "spouse_base_salary",
    label: "Spouse Income",
    defaultRange: (p) => {
      const current = p?.income?.spouse?.base_salary ?? 45000;
      return [0, 25000, 45000, 65000, 85000, 100000].filter(v => v <= current + 60000);
    },
    format: (v) => `$${(v / 1000).toFixed(0)}k`,
  },
];

/* ─── Metric display config ─── */

type MetricKey = "mc_success_rate" | "nw_at_retirement" | "liquid_at_retirement" | "median_terminal_nw" | "annual_withdrawal_budget";

interface MetricDef {
  key: MetricKey;
  label: string;
  format: (v: number) => string;
  colorFn: (v: number) => string;
}

const METRICS: MetricDef[] = [
  {
    key: "mc_success_rate",
    label: "MC Success Rate",
    format: (v) => `${v.toFixed(0)}%`,
    colorFn: (v) =>
      v >= 85 ? "bg-green-100 text-green-800" :
      v >= 70 ? "bg-green-50 text-green-700" :
      v >= 50 ? "bg-amber-50 text-amber-700" :
      v >= 30 ? "bg-orange-50 text-orange-700" :
      "bg-red-50 text-red-700",
  },
  {
    key: "nw_at_retirement",
    label: "NW at Retirement",
    format: (v) => `$${(v / 1_000_000).toFixed(1)}M`,
    colorFn: () => "bg-white text-slate-700",
  },
  {
    key: "liquid_at_retirement",
    label: "Liquid at Retirement",
    format: (v) => `$${(v / 1_000_000).toFixed(1)}M`,
    colorFn: () => "bg-white text-slate-700",
  },
  {
    key: "median_terminal_nw",
    label: "Median Terminal NW",
    format: (v) => `$${(v / 1_000_000).toFixed(1)}M`,
    colorFn: (v) => v > 0 ? "bg-white text-slate-700" : "bg-red-50 text-red-700",
  },
  {
    key: "annual_withdrawal_budget",
    label: "Annual Budget (p25)",
    format: (v) => `$${(v / 1000).toFixed(0)}k`,
    colorFn: () => "bg-white text-slate-700",
  },
];

/* ─── Matrix component ─── */

function SweepMatrix({
  result,
  metric,
  rowVar,
  colVar,
}: {
  result: SweepResult;
  metric: MetricDef;
  rowVar: SweepVariable;
  colVar: SweepVariable;
}) {
  const getCell = (row: number, col: number): SweepCell | undefined =>
    result.cells.find((c) => c.row_value === row && c.col_value === col);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="p-2 text-left text-xs font-medium text-slate-500 border-b border-r border-slate-200 bg-slate-50 sticky left-0 z-10">
              {rowVar.label} \ {colVar.label}
            </th>
            {result.col_values.map((cv) => (
              <th
                key={cv}
                className="p-2 text-center text-xs font-medium text-slate-500 border-b border-slate-200 bg-slate-50 min-w-[90px]"
              >
                {colVar.format(cv)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.row_values.map((rv) => (
            <tr key={rv}>
              <td className="p-2 text-xs font-semibold text-slate-600 border-r border-b border-slate-200 bg-slate-50 sticky left-0 z-10">
                {rowVar.format(rv)}
              </td>
              {result.col_values.map((cv) => {
                const cell = getCell(rv, cv);
                if (!cell) return <td key={cv} className="p-2 border-b border-slate-100" />;
                const value = cell[metric.key];
                return (
                  <td
                    key={cv}
                    className={`p-2 text-center text-xs font-semibold tabular-nums border-b border-slate-100 transition-colors ${metric.colorFn(value)}`}
                    title={`${rowVar.label}: ${rowVar.format(rv)}, ${colVar.label}: ${colVar.format(cv)}\n${metric.label}: ${metric.format(value)}\nNW: $${Math.round(cell.nw_at_retirement).toLocaleString()}\nMC: ${cell.mc_success_rate}%`}
                  >
                    {metric.format(value)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Main page ─── */

export function PlanningPage() {
  const { data: profile } = useProfile();

  const [rowVarKey, setRowVarKey] = useState("retirement_age");
  const [colVarKey, setColVarKey] = useState("annual_base_expenses");
  const [metricKey, setMetricKey] = useState<MetricKey>("mc_success_rate");
  const [result, setResult] = useState<SweepResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const rowVar = SWEEP_VARIABLES.find((v) => v.key === rowVarKey)!;
  const colVar = SWEEP_VARIABLES.find((v) => v.key === colVarKey)!;
  const metric = METRICS.find((m) => m.key === metricKey)!;

  const runSweep = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setElapsed(null);
    const t0 = Date.now();

    const rowValues = rowVar.defaultRange(profile);
    const colValues = colVar.defaultRange(profile);

    const req: SweepRequest = {
      row_variable: rowVarKey,
      row_values: rowValues,
      col_variable: colVarKey,
      col_values: colValues,
      num_mc_trials: 500,
    };

    try {
      const res = await simulationApi.sweep(req);
      setResult(res);
      setElapsed(Math.round((Date.now() - t0) / 1000));
    } catch (err) {
      console.error("Sweep failed:", err);
    } finally {
      setLoading(false);
    }
  }, [profile, rowVarKey, colVarKey, rowVar, colVar]);

  // Find the "current plan" cell
  const currentCell = result?.cells.find((c) => {
    const currentRow = rowVarKey === "retirement_age" ? profile?.personal?.retirement_age :
      rowVarKey === "annual_base_expenses" ? profile?.expenses?.annual_base :
      rowVarKey === "contribution_rate_pct" ? profile?.savings?.primary?.contribution_rate_pct :
      rowVarKey === "additional_monthly_savings" ? profile?.savings?.primary?.additional_monthly_savings :
      rowVarKey === "spouse_base_salary" ? profile?.income?.spouse?.base_salary : 0;
    const currentCol = colVarKey === "retirement_age" ? profile?.personal?.retirement_age :
      colVarKey === "annual_base_expenses" ? profile?.expenses?.annual_base :
      colVarKey === "contribution_rate_pct" ? profile?.savings?.primary?.contribution_rate_pct :
      colVarKey === "additional_monthly_savings" ? profile?.savings?.primary?.additional_monthly_savings :
      colVarKey === "spouse_base_salary" ? profile?.income?.spouse?.base_salary : 0;
    return c.row_value === currentRow && c.col_value === currentCol;
  });

  return (
    <div className="max-w-7xl">
      <h2 className="text-2xl font-bold">Planning</h2>
      <p className="text-sm text-slate-500 mb-6">
        Explore tradeoffs across two variables. Each cell runs a Monte Carlo simulation to show outcomes.
      </p>

      {/* Controls */}
      <div className="bg-white rounded-lg border border-slate-200 p-5 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Rows (sweep)</label>
            <select
              value={rowVarKey}
              onChange={(e) => { setRowVarKey(e.target.value); setResult(null); }}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            >
              {SWEEP_VARIABLES.map((v) => (
                <option key={v.key} value={v.key} disabled={v.key === colVarKey}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Columns (sweep)</label>
            <select
              value={colVarKey}
              onChange={(e) => { setColVarKey(e.target.value); setResult(null); }}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            >
              {SWEEP_VARIABLES.map((v) => (
                <option key={v.key} value={v.key} disabled={v.key === rowVarKey}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Show metric</label>
            <select
              value={metricKey}
              onChange={(e) => setMetricKey(e.target.value as MetricKey)}
              className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
            >
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={runSweep}
            disabled={loading || !profile}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Running sweep..." : "Run Sweep"}
          </button>
        </div>

        {elapsed !== null && (
          <div className="mt-3 text-xs text-slate-400">
            Completed {result?.cells.length} scenarios in {elapsed}s ({result?.cells.length ? Math.round(elapsed / result.cells.length * 1000) : 0}ms each)
          </div>
        )}
      </div>

      {/* Current plan summary */}
      {currentCell && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="text-xs font-medium text-blue-600 mb-2">Your Current Plan</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {METRICS.map((m) => (
              <div key={m.key}>
                <div className="text-[10px] text-blue-500">{m.label}</div>
                <div className="text-sm font-bold text-blue-800">{m.format(currentCell[m.key])}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <div className="text-sm text-slate-500 animate-pulse">
            Running Monte Carlo across {rowVar.defaultRange(profile).length * colVar.defaultRange(profile).length} scenarios...
          </div>
          <div className="text-xs text-slate-400 mt-2">This may take a minute</div>
        </div>
      )}

      {/* Matrix */}
      {result && !loading && (
        <div className="bg-white rounded-lg border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">
              {metric.label}
              <span className="text-sm font-normal text-slate-400 ml-2">
                {rowVar.label} vs {colVar.label}
              </span>
            </h3>
            <div className="flex items-center gap-3 text-[10px] text-slate-400">
              {metric.key === "mc_success_rate" && (
                <>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100" /> &ge;85%</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-50" /> 70-84%</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-50" /> 50-69%</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-orange-50" /> 30-49%</span>
                  <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-50" /> &lt;30%</span>
                </>
              )}
            </div>
          </div>
          <SweepMatrix result={result} metric={metric} rowVar={rowVar} colVar={colVar} />
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center">
          <div className="text-sm text-slate-400">
            Choose your two variables and click "Run Sweep" to see the tradeoff matrix.
          </div>
          <div className="text-xs text-slate-300 mt-2">
            Each cell runs a full Monte Carlo simulation to compute success rates and outcomes.
          </div>
        </div>
      )}
    </div>
  );
}
