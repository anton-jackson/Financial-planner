import { useState } from "react";
import { useScenarioList } from "../hooks/useScenarios";
import { simulationApi } from "../api/simulation";
import type { DeterministicResult, MonteCarloResult } from "../types/simulation";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
  Area,
  AreaChart,
} from "recharts";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};
const fmtFull = (n: number) => `$${n.toLocaleString()}`;

function NetWorthChart({ results }: { results: DeterministicResult[] }) {
  const years = results[0]?.yearly.map((r) => r.year) ?? [];
  const data = years.map((year) => {
    const point: Record<string, number> = { year };
    for (const result of results) {
      const row = result.yearly.find((r) => r.year === year);
      if (row) {
        point[`${result.scenario_name}_net`] = row.net_worth;
        point[`${result.scenario_name}_liquid`] = row.liquid_net_worth;
        point[`${result.scenario_name}_illiquid`] = row.net_worth - row.liquid_net_worth;
      }
    }
    return point;
  });

  const colors = ["#2563eb", "#16a34a", "#dc2626", "#9333ea"];

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-4">Net Worth Over Time</h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis tickFormatter={fmt} />
          <Tooltip formatter={(v: number | undefined) => fmtFull(Math.round(v ?? 0))} />
          <Legend />
          {results.map((r, i) => [
            <Line
              key={`${r.scenario_name}_net`}
              type="monotone"
              dataKey={`${r.scenario_name}_net`}
              name={`${r.scenario_name} (total)`}
              stroke={colors[i % colors.length]}
              strokeWidth={2}
              dot={false}
            />,
            <Line
              key={`${r.scenario_name}_liquid`}
              type="monotone"
              dataKey={`${r.scenario_name}_liquid`}
              name={`${r.scenario_name} (liquid)`}
              stroke="#16a34a"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 4"
            />,
            <Line
              key={`${r.scenario_name}_illiquid`}
              type="monotone"
              dataKey={`${r.scenario_name}_illiquid`}
              name={`${r.scenario_name} (illiquid)`}
              stroke="#f59e0b"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 4"
            />,
          ])}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function MonteCarloFanChart({ result }: { result: MonteCarloResult }) {
  const data = result.years.map((year, i) => ({
    year,
    p10: result.net_worth.p10[i],
    p25: result.net_worth.p25[i],
    p50: result.net_worth.p50[i],
    p75: result.net_worth.p75[i],
    p90: result.net_worth.p90[i],
    // For stacked areas, recharts needs the band widths
    band_10_25: result.net_worth.p25[i] - result.net_worth.p10[i],
    band_25_50: result.net_worth.p50[i] - result.net_worth.p25[i],
    band_50_75: result.net_worth.p75[i] - result.net_worth.p50[i],
    band_75_90: result.net_worth.p90[i] - result.net_worth.p75[i],
  }));

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">
          Monte Carlo - Net Worth ({result.num_trials.toLocaleString()} trials)
        </h3>
        <div className="flex gap-4 text-sm">
          <span className="text-green-700 font-medium">
            Success: {result.success_rate}%
          </span>
          <span className="text-slate-500">
            Median terminal: {fmt(result.median_terminal_net_worth)}
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <AreaChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis tickFormatter={fmt} />
          <Tooltip
            formatter={(v: number | undefined, name: string | undefined) => {
              const labels: Record<string, string> = {
                p10: "10th pctl",
                p25: "25th pctl",
                p50: "Median",
                p75: "75th pctl",
                p90: "90th pctl",
              };
              return [fmtFull(Math.round(v ?? 0)), labels[name ?? ""] ?? name];
            }}
          />
          <Legend />
          <Area
            type="monotone"
            dataKey="p90"
            name="p90"
            stroke="#93c5fd"
            fill="#dbeafe"
            strokeWidth={1}
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="p75"
            name="p75"
            stroke="#60a5fa"
            fill="#bfdbfe"
            strokeWidth={1}
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="p50"
            name="p50"
            stroke="#2563eb"
            fill="#93c5fd"
            strokeWidth={2}
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="p25"
            name="p25"
            stroke="#60a5fa"
            fill="#bfdbfe"
            strokeWidth={1}
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="p10"
            name="p10"
            stroke="#93c5fd"
            fill="#dbeafe"
            strokeWidth={1}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-6 mt-3 text-xs text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-[#dbeafe] border border-[#93c5fd]" /> p10–p90
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-[#bfdbfe] border border-[#60a5fa]" /> p25–p75
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-[#93c5fd] border border-[#2563eb]" /> Median
        </span>
      </div>
    </div>
  );
}

function MonteCarloSummary({ result }: { result: MonteCarloResult }) {
  const runway = result.years_of_runway;
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-4">Monte Carlo Summary</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="text-sm text-slate-500">Success Rate</div>
          <div className={`text-2xl font-bold ${result.success_rate >= 80 ? "text-green-700" : result.success_rate >= 50 ? "text-amber-600" : "text-red-600"}`}>
            {result.success_rate}%
          </div>
          <div className="text-xs text-slate-400">money lasts full horizon</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="text-sm text-slate-500">Median Terminal Net Worth</div>
          <div className="text-2xl font-bold text-slate-800">
            {fmt(result.median_terminal_net_worth)}
          </div>
          <div className="text-xs text-slate-400">at end of projection</div>
        </div>
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="text-sm text-slate-500">Runway (median)</div>
          <div className="text-2xl font-bold text-slate-800">
            {runway.p50[0].toFixed(0)} yrs
          </div>
          <div className="text-xs text-slate-400">
            p10: {runway.p10[0].toFixed(0)} / p90: {runway.p90[0].toFixed(0)} yrs
          </div>
        </div>
        <div className="bg-slate-50 rounded-lg p-4">
          <div className="text-sm text-slate-500">Trials</div>
          <div className="text-2xl font-bold text-slate-800">
            {result.num_trials.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400">
            {result.scenario_name} scenario
          </div>
        </div>
      </div>
    </div>
  );
}

function CashFlowChart({ result }: { result: DeterministicResult }) {
  const data = result.yearly.map((r) => ({
    year: r.year,
    income: r.gross_income + r.social_security_income + r.rental_income,
    expenses: -r.total_expenses,
    net: r.gross_income + r.social_security_income + r.rental_income - r.total_expenses,
  }));

  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-4">
        Cash Flow - {result.scenario_name}
      </h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="year" />
          <YAxis tickFormatter={fmt} />
          <Tooltip formatter={(v: number | undefined) => fmtFull(Math.round(v ?? 0))} />
          <Legend />
          <Bar dataKey="income" name="Income" fill="#16a34a" />
          <Bar dataKey="expenses" name="Expenses" fill="#dc2626" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function YearlyTable({ result }: { result: DeterministicResult }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6 overflow-x-auto">
      <h3 className="text-lg font-semibold mb-4">Year-by-Year Detail</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="py-2 px-2">Year</th>
            <th className="py-2 px-2">Age</th>
            <th className="py-2 px-2 text-right">Income</th>
            <th className="py-2 px-2 text-right">Expenses</th>
            <th className="py-2 px-2 text-right">Inv Returns</th>
            <th className="py-2 px-2 text-right">Net Worth</th>
            <th className="py-2 px-2">Events</th>
          </tr>
        </thead>
        <tbody>
          {result.yearly.map((row) => (
            <tr key={row.year} className="border-b border-slate-100 hover:bg-slate-50">
              <td className="py-1.5 px-2 font-medium">{row.year}</td>
              <td className="py-1.5 px-2">{row.age_primary}</td>
              <td className="py-1.5 px-2 text-right">
                {fmtFull(Math.round(row.gross_income + row.social_security_income + row.rental_income))}
              </td>
              <td className="py-1.5 px-2 text-right">{fmtFull(Math.round(row.total_expenses))}</td>
              <td className="py-1.5 px-2 text-right">{fmtFull(Math.round(row.investment_returns))}</td>
              <td className="py-1.5 px-2 text-right font-medium">{fmtFull(Math.round(row.net_worth))}</td>
              <td className="py-1.5 px-2 text-xs text-slate-500">
                {row.events.slice(0, 2).join("; ")}
                {row.events.length > 2 && ` +${row.events.length - 2} more`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SimulationPage() {
  const { data: scenarioNames } = useScenarioList();
  const [selected, setSelected] = useState<string[]>(["base"]);
  const [results, setResults] = useState<DeterministicResult[]>([]);
  const [mcResult, setMcResult] = useState<MonteCarloResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [mcLoading, setMcLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleScenario = (name: string) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  };

  const runDeterministic = async () => {
    setLoading(true);
    setError(null);
    try {
      if (selected.length === 1) {
        const result = await simulationApi.deterministic({
          scenario_name: selected[0],
        });
        setResults([result]);
      } else {
        const results = await simulationApi.compare({
          scenarios: selected,
          mode: "deterministic",
        });
        setResults(results);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setLoading(false);
    }
  };

  const runMonteCarlo = async () => {
    if (selected.length === 0) return;
    setMcLoading(true);
    setError(null);
    try {
      const result = await simulationApi.monteCarlo({
        scenario_name: selected[0],
        num_trials: 5000,
      });
      setMcResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Monte Carlo failed");
    } finally {
      setMcLoading(false);
    }
  };

  return (
    <div className="max-w-6xl">
      <h2 className="text-2xl font-bold mb-6">Run Simulation</h2>

      <div className="bg-white rounded-lg border border-slate-200 p-6 mb-6">
        <h3 className="text-sm font-medium text-slate-500 mb-3">
          Select scenarios to run
        </h3>
        <div className="flex gap-3 mb-4">
          {scenarioNames?.map((item) => (
            <button
              key={item.slug}
              onClick={() => toggleScenario(item.slug)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                selected.includes(item.slug)
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {item.name}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={runDeterministic}
            disabled={loading || selected.length === 0}
            className="px-6 py-2 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {loading ? "Running..." : "Run Deterministic"}
          </button>
          <button
            onClick={runMonteCarlo}
            disabled={mcLoading || selected.length === 0}
            className="px-6 py-2 bg-purple-600 text-white rounded-md text-sm font-medium hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            {mcLoading ? "Running 5k trials..." : "Run Monte Carlo"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6 text-red-700 text-sm">
          {error}
        </div>
      )}

      {mcResult && (
        <div className="flex flex-col gap-6 mb-6">
          <MonteCarloSummary result={mcResult} />
          <MonteCarloFanChart result={mcResult} />
        </div>
      )}

      {results.length > 0 && (
        <div className="flex flex-col gap-6">
          <NetWorthChart results={results} />
          <CashFlowChart result={results[0]} />
          <YearlyTable result={results[0]} />
        </div>
      )}
    </div>
  );
}
