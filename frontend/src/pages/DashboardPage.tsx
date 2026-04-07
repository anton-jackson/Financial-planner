import { useEffect, useState, useRef, useCallback } from "react";
import { useProfile, useUpdateProfile } from "../hooks/useProfile";
import { useAssets } from "../hooks/useAssets";
import { simulationApi, type BaselineOverrides } from "../api/simulation";
import type { DeterministicResult, MonteCarloResult } from "../types/simulation";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};
const fmtFull = (n: number) => `$${Math.round(n).toLocaleString()}`;

function StatCard({
  label,
  value,
  sub,
  color = "text-slate-800",
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-5">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
    </div>
  );
}

/* ─── Slider component ─── */

function WhatIfSlider({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const isModified = value !== defaultValue;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-slate-600">{label}</label>
        <span className={`text-xs font-semibold tabular-nums ${isModified ? "text-blue-600" : "text-slate-500"}`}>
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>{format(min)}</span>
        <span>{format(max)}</span>
      </div>
    </div>
  );
}

/* ─── Main page ─── */

export function DashboardPage() {
  const { data: profile } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: assetsFile } = useAssets();
  const [det, setDet] = useState<DeterministicResult | null>(null);
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [mcLoading, setMcLoading] = useState(false);
  const [mcStale, setMcStale] = useState(false);

  // What-if slider state
  const [sliders, setSliders] = useState<{
    retirement_age: number;
    spouse_retirement_age: number;
    annual_base_expenses: number;
    contribution_rate_pct: number;
    additional_monthly_savings: number;
    spouse_base_salary: number;
  } | null>(null);

  // Store profile defaults for comparison
  const [defaults, setDefaults] = useState<typeof sliders>(null);

  // Initialize sliders from profile
  useEffect(() => {
    if (profile && !sliders) {
      const d = {
        retirement_age: profile.personal.retirement_age,
        spouse_retirement_age: profile.spouse?.retirement_age ?? 65,
        annual_base_expenses: profile.expenses.annual_base,
        contribution_rate_pct: profile.savings.primary.contribution_rate_pct,
        additional_monthly_savings: profile.savings.primary.additional_monthly_savings,
        spouse_base_salary: profile.income.spouse?.base_salary ?? 0,
      };
      setSliders(d);
      setDefaults(d);
    }
  }, [profile, sliders]);

  const totalBalance = assetsFile?.assets.reduce((sum, a) => sum + a.balance, 0) ?? 0;
  const currentYear = new Date().getFullYear();

  // Build overrides only for values that differ from profile defaults
  const buildOverrides = useCallback((): BaselineOverrides | undefined => {
    if (!sliders || !defaults) return undefined;
    const o: BaselineOverrides = {};
    let hasOverride = false;
    if (sliders.retirement_age !== defaults.retirement_age) { o.retirement_age = sliders.retirement_age; hasOverride = true; }
    if (sliders.spouse_retirement_age !== defaults.spouse_retirement_age) { o.spouse_retirement_age = sliders.spouse_retirement_age; hasOverride = true; }
    if (sliders.annual_base_expenses !== defaults.annual_base_expenses) { o.annual_base_expenses = sliders.annual_base_expenses; hasOverride = true; }
    if (sliders.contribution_rate_pct !== defaults.contribution_rate_pct) { o.contribution_rate_pct = sliders.contribution_rate_pct; hasOverride = true; }
    if (sliders.additional_monthly_savings !== defaults.additional_monthly_savings) { o.additional_monthly_savings = sliders.additional_monthly_savings; hasOverride = true; }
    if (sliders.spouse_base_salary !== defaults.spouse_base_salary) { o.spouse_base_salary = sliders.spouse_base_salary; hasOverride = true; }
    return hasOverride ? o : undefined;
  }, [sliders, defaults]);

  const hasChanges = sliders && defaults && (
    sliders.retirement_age !== defaults.retirement_age ||
    sliders.spouse_retirement_age !== defaults.spouse_retirement_age ||
    sliders.annual_base_expenses !== defaults.annual_base_expenses ||
    sliders.contribution_rate_pct !== defaults.contribution_rate_pct ||
    sliders.additional_monthly_savings !== defaults.additional_monthly_savings ||
    sliders.spouse_base_salary !== defaults.spouse_base_salary
  );

  // Debounced deterministic run on slider change
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runDeterministic = useCallback(async (overrides?: BaselineOverrides) => {
    setLoading(true);
    try {
      const result = await simulationApi.baseline(overrides);
      setDet(result);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load: run both deterministic and MC
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setMcLoading(true);
      try {
        const [detResult, mcResult] = await Promise.all([
          simulationApi.baseline(),
          simulationApi.baselineMonteCarlo(2000),
        ]);
        if (!cancelled) {
          setDet(detResult);
          setMc(mcResult);
        }
      } catch {
        // silent
      } finally {
        if (!cancelled) {
          setLoading(false);
          setMcLoading(false);
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  // Re-run deterministic (debounced) when sliders change
  const onSliderChange = useCallback((field: string, value: number) => {
    setSliders((prev) => prev ? { ...prev, [field]: value } : prev);
    setMcStale(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      // Build overrides from the updated slider values
      setSliders((current) => {
        if (!current || !defaults) return current;
        const o: BaselineOverrides = {};
        let hasOverride = false;
        if (current.retirement_age !== defaults.retirement_age) { o.retirement_age = current.retirement_age; hasOverride = true; }
        if (current.spouse_retirement_age !== defaults.spouse_retirement_age) { o.spouse_retirement_age = current.spouse_retirement_age; hasOverride = true; }
        if (current.annual_base_expenses !== defaults.annual_base_expenses) { o.annual_base_expenses = current.annual_base_expenses; hasOverride = true; }
        if (current.contribution_rate_pct !== defaults.contribution_rate_pct) { o.contribution_rate_pct = current.contribution_rate_pct; hasOverride = true; }
        if (current.additional_monthly_savings !== defaults.additional_monthly_savings) { o.additional_monthly_savings = current.additional_monthly_savings; hasOverride = true; }
        if (current.spouse_base_salary !== defaults.spouse_base_salary) { o.spouse_base_salary = current.spouse_base_salary; hasOverride = true; }
        runDeterministic(hasOverride ? o : undefined);
        return current;
      });
    }, 400);
  }, [defaults, runDeterministic]);

  const runMC = async () => {
    setMcLoading(true);
    try {
      const result = await simulationApi.baselineMonteCarlo(2000, buildOverrides());
      setMc(result);
      setMcStale(false);
    } catch {
      // silent
    } finally {
      setMcLoading(false);
    }
  };

  const resetSliders = () => {
    if (defaults) {
      setSliders({ ...defaults });
      // Re-run with no overrides
      runDeterministic(undefined);
      setMcStale(true);
    }
  };

  const applyToProfile = () => {
    if (!profile || !sliders) return;
    const updated = {
      ...profile,
      personal: { ...profile.personal, retirement_age: sliders.retirement_age },
      spouse: profile.spouse ? { ...profile.spouse, retirement_age: sliders.spouse_retirement_age } : null,
      expenses: { ...profile.expenses, annual_base: sliders.annual_base_expenses },
      savings: {
        ...profile.savings,
        primary: {
          ...profile.savings.primary,
          contribution_rate_pct: sliders.contribution_rate_pct,
          additional_monthly_savings: sliders.additional_monthly_savings,
        },
      },
      income: {
        ...profile.income,
        spouse: profile.income.spouse
          ? { ...profile.income.spouse, base_salary: sliders.spouse_base_salary }
          : null,
      },
    };
    updateProfile.mutate(updated, {
      onSuccess: () => {
        // Update defaults to match new profile
        setDefaults({ ...sliders });
        setMcStale(true);
      },
    });
  };

  // Compute dynamic values for stat cards
  const retirementYear = sliders
    ? (profile?.personal.birth_year ?? 1979) + sliders.retirement_age
    : profile?.personal.retirement_target_year ?? 0;
  const spouseRetirementYear = sliders && profile?.spouse
    ? profile.spouse.birth_year + sliders.spouse_retirement_age
    : profile?.spouse?.retirement_target_year ?? 0;
  const yearsToRetirement = retirementYear - currentYear;
  const retirementRow = det?.yearly.find((r) => r.year === retirementYear);
  const terminalRow = det?.yearly[det.yearly.length - 1];

  // Milestone years for reference lines
  const milestones: { year: number; label: string; color: string }[] = [];
  milestones.push({ year: retirementYear, label: "Retire", color: "#dc2626" });
  if (profile?.spouse && spouseRetirementYear && spouseRetirementYear !== retirementYear) {
    milestones.push({ year: spouseRetirementYear, label: "Spouse retires", color: "#f97316" });
  }
  if (profile?.children) {
    for (const child of profile.children) {
      milestones.push({
        year: child.college_start_year,
        label: `${child.name} college`,
        color: "#8b5cf6",
      });
      milestones.push({
        year: child.college_start_year + child.college_years,
        label: `${child.name} graduates`,
        color: "#06b6d4",
      });
    }
  }

  // Chart data
  const netWorthData = det?.yearly.map((r) => ({
    year: r.year,
    net_worth: r.net_worth,
    liquid: r.liquid_net_worth,
    illiquid: r.net_worth - r.liquid_net_worth,
  })) ?? [];

  const mcData = mc?.years.map((year, i) => ({
    year,
    p10: mc.net_worth.p10[i],
    p25: mc.net_worth.p25[i],
    p50: mc.net_worth.p50[i],
    p75: mc.net_worth.p75[i],
    p90: mc.net_worth.p90[i],
  })) ?? [];

  return (
    <div className="max-w-7xl">
      <h2 className="text-2xl font-bold">Dashboard</h2>
      <p className="text-sm text-slate-500 mb-6">
        Baseline projection — adjust sliders to explore what-if scenarios instantly
      </p>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Total Assets" value={`$${totalBalance.toLocaleString()}`} />
        <StatCard
          label="Years to Retirement"
          value={String(yearsToRetirement)}
          sub={`Target: ${retirementYear}`}
          color={hasChanges ? "text-blue-600" : "text-slate-800"}
        />
        <StatCard
          label="Net Worth at Retirement"
          value={retirementRow ? fmt(retirementRow.net_worth) : "--"}
          sub={retirementRow ? `Liquid: ${fmt(retirementRow.liquid_net_worth)}` : undefined}
          color={hasChanges ? "text-blue-600" : "text-slate-800"}
        />
        <StatCard
          label="MC Success Rate"
          value={mc ? `${mc.success_rate}%` : "--"}
          color={mc ? (mc.success_rate >= 80 ? "text-green-700" : mc.success_rate >= 50 ? "text-amber-600" : "text-red-600") : "text-slate-400"}
          sub={mcStale ? "Stale — re-run MC" : mc ? `${mc.num_trials.toLocaleString()} trials` : "Loading..."}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Terminal Net Worth"
          value={terminalRow ? fmt(terminalRow.net_worth) : "--"}
          sub={terminalRow ? `Year ${terminalRow.year}, age ${terminalRow.age_primary}` : undefined}
        />
        <StatCard
          label="MC Median Terminal"
          value={mc ? fmt(mc.median_terminal_net_worth) : "--"}
        />
        <StatCard
          label="Runway (median)"
          value={mc ? `${mc.years_of_runway.p50[0].toFixed(0)} yrs` : "--"}
          sub={mc ? `p10: ${mc.years_of_runway.p10[0].toFixed(0)} / p90: ${mc.years_of_runway.p90[0].toFixed(0)}` : undefined}
        />
        <StatCard
          label="Children"
          value={String(profile?.children.length ?? 0)}
          sub={profile?.children.map((c) => `${c.name} (${c.college_start_year})`).join(", ")}
        />
      </div>

      {/* Main content: chart + slider panel */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6" style={{ minHeight: 420 }}>
        {/* Deterministic chart */}
        <div className="lg:col-span-3 bg-white rounded-lg border border-slate-200 p-6" style={{ minHeight: 400 }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Deterministic Net Worth</h3>
            {loading && <span className="text-xs text-slate-400 animate-pulse">Updating...</span>}
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={netWorthData} margin={{ top: 20, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={fmt} />
              <Tooltip formatter={(v: number) => fmtFull(v)} />
              <Legend />
              {milestones.map((m, i) => (
                <ReferenceLine
                  key={m.label}
                  x={m.year}
                  stroke={m.color}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  label={{
                    value: m.label,
                    position: "insideTopRight",
                    fill: m.color,
                    fontSize: 10,
                    dy: i % 2 === 0 ? 0 : 12,
                  }}
                />
              ))}
              <Line type="monotone" dataKey="net_worth" name="Total" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="liquid" name="Liquid" stroke="#16a34a" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="illiquid" name="Illiquid" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* What-If slider panel */}
        {sliders && defaults && (
          <div className="lg:col-span-1 bg-white rounded-lg border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-1">What If?</h3>
            <p className="text-[10px] text-slate-400 mb-4">Drag to explore — chart updates live</p>

            <div className="flex flex-col gap-5">
              <WhatIfSlider
                label="Retirement Age"
                value={sliders.retirement_age}
                defaultValue={defaults.retirement_age}
                min={55}
                max={70}
                step={1}
                format={(v) => String(v)}
                onChange={(v) => onSliderChange("retirement_age", v)}
              />

              {profile?.spouse && (
                <WhatIfSlider
                  label="Spouse Retirement Age"
                  value={sliders.spouse_retirement_age}
                  defaultValue={defaults.spouse_retirement_age}
                  min={55}
                  max={70}
                  step={1}
                  format={(v) => String(v)}
                  onChange={(v) => onSliderChange("spouse_retirement_age", v)}
                />
              )}

              <WhatIfSlider
                label="Base Expenses"
                value={sliders.annual_base_expenses}
                defaultValue={defaults.annual_base_expenses}
                min={80000}
                max={300000}
                step={5000}
                format={(v) => `$${(v / 1000).toFixed(0)}k`}
                onChange={(v) => onSliderChange("annual_base_expenses", v)}
              />

              <WhatIfSlider
                label="401k Contribution %"
                value={sliders.contribution_rate_pct}
                defaultValue={defaults.contribution_rate_pct}
                min={0}
                max={30}
                step={0.5}
                format={(v) => `${v}%`}
                onChange={(v) => onSliderChange("contribution_rate_pct", v)}
              />

              <WhatIfSlider
                label="Additional Monthly Savings"
                value={sliders.additional_monthly_savings}
                defaultValue={defaults.additional_monthly_savings}
                min={0}
                max={10000}
                step={250}
                format={(v) => `$${(v).toLocaleString()}`}
                onChange={(v) => onSliderChange("additional_monthly_savings", v)}
              />

              {profile?.spouse && (
                <WhatIfSlider
                  label="Spouse Income"
                  value={sliders.spouse_base_salary}
                  defaultValue={defaults.spouse_base_salary}
                  min={0}
                  max={150000}
                  step={5000}
                  format={(v) => `$${(v / 1000).toFixed(0)}k`}
                  onChange={(v) => onSliderChange("spouse_base_salary", v)}
                />
              )}
            </div>

            {/* Actions — always rendered to prevent layout jump */}
            <div className="flex flex-col gap-2 mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={applyToProfile}
                disabled={updateProfile.isPending || !hasChanges}
                className={`w-full px-3 py-2 rounded-md text-xs font-medium transition-opacity ${
                  hasChanges
                    ? "bg-blue-600 text-white hover:bg-blue-700"
                    : "bg-slate-100 text-slate-400 cursor-default"
                } disabled:opacity-50`}
              >
                {updateProfile.isPending ? "Saving..." : "Apply to Profile"}
              </button>
              <button
                onClick={resetSliders}
                disabled={!hasChanges}
                className={`w-full px-3 py-2 rounded-md text-xs font-medium transition-opacity ${
                  hasChanges
                    ? "bg-white border border-slate-300 text-slate-600 hover:bg-slate-50"
                    : "bg-slate-100 text-slate-400 border border-transparent cursor-default"
                }`}
              >
                Reset
              </button>
              <button
                onClick={runMC}
                disabled={mcLoading}
                className={`w-full px-3 py-2 rounded-md text-xs font-medium ${
                  mcStale
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "bg-white border border-slate-300 text-slate-500 hover:bg-slate-50"
                } disabled:opacity-50`}
              >
                {mcLoading ? "Running MC..." : mcStale ? "Re-run Monte Carlo" : "Re-run Monte Carlo"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MC Fan Chart */}
      <div className="bg-white rounded-lg border border-slate-200 p-6" style={{ minHeight: 380 }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Monte Carlo Fan (Baseline)</h3>
          {mcStale && <span className="text-xs text-amber-500 font-medium">Stale — sliders changed</span>}
          {mcLoading && <span className="text-xs text-slate-400 animate-pulse">Running...</span>}
        </div>
        {mcData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={mcData} margin={{ top: 20, right: 10, bottom: 5, left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={fmt} />
              <Tooltip formatter={(v: number, name: string) => {
                const labels: Record<string, string> = { p10: "10th", p25: "25th", p50: "Median", p75: "75th", p90: "90th" };
                return [fmtFull(v), labels[name] ?? name];
              }} />
              {milestones.map((m, i) => (
                <ReferenceLine
                  key={`mc-${m.label}`}
                  x={m.year}
                  stroke={m.color}
                  strokeDasharray="3 3"
                  strokeWidth={1}
                  label={{
                    value: m.label,
                    position: "insideTopRight",
                    fill: m.color,
                    fontSize: 10,
                    dy: i % 2 === 0 ? 0 : 12,
                  }}
                />
              ))}
              <Area type="monotone" dataKey="p90" stroke="#93c5fd" fill="#dbeafe" strokeWidth={1} dot={false} />
              <Area type="monotone" dataKey="p75" stroke="#60a5fa" fill="#bfdbfe" strokeWidth={1} dot={false} />
              <Area type="monotone" dataKey="p50" stroke="#2563eb" fill="#93c5fd" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="p25" stroke="#60a5fa" fill="#bfdbfe" strokeWidth={1} dot={false} />
              <Area type="monotone" dataKey="p10" stroke="#93c5fd" fill="#dbeafe" strokeWidth={1} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-sm text-slate-400">
            {mcLoading ? "Running Monte Carlo..." : "No MC data yet"}
          </div>
        )}
      </div>
    </div>
  );
}
