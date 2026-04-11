import {
  useScenarioList,
  useScenario,
  useUpdateScenario,
  useDeleteScenario,
  useCloneScenario,
  useCreateScenario,
} from "../hooks/useScenarios";
import { useEffect, useState } from "react";
import { FormField, Input } from "../components/shared/FormField";
import { simulationApi } from "../api/simulation";
import type { Scenario, LargePurchase, LifeEvent } from "../types/scenario";
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
  ResponsiveContainer,
} from "recharts";
import { SectionHelp } from "../components/shared/SectionHelp";

const fmt = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
};
const fmtFull = (n: number) => `$${Math.round(n).toLocaleString()}`;

/* ─── Sub-editors (unchanged) ─── */

function InvestmentReturnsEditor({
  returns,
  onChange,
}: {
  returns: Scenario["assumptions"]["investment_returns"];
  onChange: (field: string, value: number) => void;
}) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
      <h4 className="text-sm font-medium text-slate-600 mb-3">Investment Returns</h4>
      <SectionHelp
        summary="Expected annual returns for each asset class. The mean is used in deterministic runs; mean + standard deviation drive the Monte Carlo distribution."
        details={[
          "Your liquid portfolio return each year = stocks% × stock_return + bonds% × bond_return + cash% × 0%.",
          "In deterministic mode, the mean return is used every year. In Monte Carlo, returns are sampled from a normal distribution (mean, stddev) each trial.",
          "RE appreciation is applied separately to each property. Properties with their own rate override this default.",
          "Historical US averages: stocks ~10% nominal (8% real), bonds ~4-5%, RE ~3-4%. These are pre-inflation.",
        ]}
      />
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Stocks Mean %" help="Average annual stock return. Applied to the stock portion of your portfolio.">
          <Input type="number" step="0.1" value={returns.stocks_mean_pct} onChange={(e) => onChange("stocks_mean_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Stocks StdDev %" help="Annual volatility of stock returns. Only affects Monte Carlo — wider = more spread between good and bad outcomes.">
          <Input type="number" step="0.1" value={returns.stocks_stddev_pct} onChange={(e) => onChange("stocks_stddev_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="RE Appreciation %" help="Default annual property value growth. Individual properties can override this.">
          <Input type="number" step="0.1" value={returns.real_estate_appreciation_pct} onChange={(e) => onChange("real_estate_appreciation_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Bonds Mean %" help="Average annual bond return. Applied to the bond portion of your portfolio.">
          <Input type="number" step="0.1" value={returns.bonds_mean_pct} onChange={(e) => onChange("bonds_mean_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Bonds StdDev %" help="Annual volatility of bond returns. Only affects Monte Carlo.">
          <Input type="number" step="0.1" value={returns.bonds_stddev_pct} onChange={(e) => onChange("bonds_stddev_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
      </div>
    </div>
  );
}

function InflationEditor({
  inflation,
  onChange,
}: {
  inflation: Scenario["assumptions"]["inflation"];
  onChange: (field: string, value: number) => void;
}) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
      <h4 className="text-sm font-medium text-slate-600 mb-3">Inflation</h4>
      <SectionHelp
        summary="Inflation rates compound annually on expenses, property costs, and rent. Different categories inflate at different rates — healthcare and college typically outpace general inflation."
        details={[
          "General inflation applies to: living expenses, property tax, insurance, carrying costs, and rental income.",
          "College tuition inflation applies separately to tuition + room & board. Historically ~5-6%/yr.",
          "Healthcare inflation applies to premiums, out-of-pocket, ACA, and Medicare costs. Historically ~6%/yr.",
          "In Monte Carlo, general inflation is sampled from N(mean, stddev) each trial. College and healthcare use fixed rates.",
        ]}
      />
      <div className="grid grid-cols-2 gap-3">
        <FormField label="General Mean %" help="Annual inflation for living expenses, property costs, and rent. US long-run average is ~3%.">
          <Input type="number" step="0.1" value={inflation.general_mean_pct} onChange={(e) => onChange("general_mean_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="General StdDev %" help="Inflation volatility for Monte Carlo. A wider spread tests scenarios with high or low inflation periods.">
          <Input type="number" step="0.1" value={inflation.general_stddev_pct} onChange={(e) => onChange("general_stddev_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="College Tuition %" help="Annual tuition inflation rate. Applied to college costs in the year they occur. Typically 5-6%.">
          <Input type="number" step="0.1" value={inflation.college_tuition_pct} onChange={(e) => onChange("college_tuition_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Healthcare %" help="Annual healthcare cost inflation. Applied to premiums, ACA, and Medicare. Typically 6%.">
          <Input type="number" step="0.1" value={inflation.healthcare_pct} onChange={(e) => onChange("healthcare_pct", parseFloat(e.target.value) || 0)} />
        </FormField>
      </div>
    </div>
  );
}

function LargePurchaseCard({
  purchase,
  index,
  onChange,
  onRemove,
}: {
  purchase: LargePurchase;
  index: number;
  onChange: (index: number, field: string, value: string | number | boolean) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-medium text-slate-600">{purchase.name || `Purchase ${index + 1}`}</h4>
        <button onClick={() => onRemove(index)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FormField label="Name">
          <Input value={purchase.name} onChange={(e) => onChange(index, "name", e.target.value)} />
        </FormField>
        <FormField label="Year">
          <Input type="number" value={purchase.year} onChange={(e) => onChange(index, "year", parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="Type">
          <select
            className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
            value={purchase.is_rental_conversion ? "rental" : "purchase"}
            onChange={(e) => onChange(index, "is_rental_conversion", e.target.value === "rental")}
          >
            <option value="purchase">New Purchase</option>
            <option value="rental">Rental Conversion</option>
          </select>
        </FormField>
      </div>
      {!purchase.is_rental_conversion ? (
        <div className="grid grid-cols-3 gap-3 mt-3">
          <FormField label="Purchase Price">
            <Input type="number" value={purchase.purchase_price} onChange={(e) => onChange(index, "purchase_price", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Down Payment %" help="Percentage paid in cash. 100% = cash purchase (no mortgage). The down payment comes directly from your liquid portfolio.">
            <Input type="number" step="1" value={purchase.down_payment_pct} onChange={(e) => onChange(index, "down_payment_pct", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Mortgage Rate %">
            <Input type="number" step="0.1" value={purchase.mortgage_rate_pct} onChange={(e) => onChange(index, "mortgage_rate_pct", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Term (years)">
            <Input type="number" value={purchase.mortgage_term_years} onChange={(e) => onChange(index, "mortgage_term_years", parseInt(e.target.value) || 0)} />
          </FormField>
          <FormField label="Annual Property Tax">
            <Input type="number" value={purchase.annual_property_tax} onChange={(e) => onChange(index, "annual_property_tax", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Annual Carrying Cost" hint="Insurance, maint, HOA, utilities (excl tax)">
            <Input type="number" value={purchase.annual_carrying_cost} onChange={(e) => onChange(index, "annual_carrying_cost", parseFloat(e.target.value) || 0)} />
          </FormField>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 mt-3">
          <FormField label="Conversion Cost">
            <Input type="number" value={purchase.conversion_cost} onChange={(e) => onChange(index, "conversion_cost", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Monthly Rent">
            <Input type="number" value={purchase.monthly_rental_income} onChange={(e) => onChange(index, "monthly_rental_income", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Vacancy %" help="Expected percentage of time the unit is unoccupied. 8% ≈ 1 month/year vacant. Reduces gross rental income.">
            <Input type="number" step="1" value={purchase.vacancy_rate_pct} onChange={(e) => onChange(index, "vacancy_rate_pct", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Maintenance %" help="Annual maintenance as % of property value. 1% is a common rule of thumb. Grows as the property appreciates.">
            <Input type="number" step="0.1" value={purchase.annual_maintenance_pct} onChange={(e) => onChange(index, "annual_maintenance_pct", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Mgmt %" help="Property management fee as % of collected rent. 10% is typical for professional management.">
            <Input type="number" step="1" value={purchase.property_management_pct} onChange={(e) => onChange(index, "property_management_pct", parseFloat(e.target.value) || 0)} />
          </FormField>
        </div>
      )}
    </div>
  );
}

function AllocationEditor({
  allocation,
  onChange,
}: {
  allocation: Scenario["assumptions"]["asset_allocation"];
  onChange: (section: string, field: string, value: number) => void;
}) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
      <h4 className="text-sm font-medium text-slate-600 mb-3">Asset Allocation</h4>
      <SectionHelp
        summary="Controls how your liquid portfolio is invested. The allocation glides linearly from the pre-retirement mix to the post-retirement mix over N years before retirement."
        details={[
          "Pre-retirement: your current allocation (e.g. 70/25/5 stocks/bonds/cash). Used while you're working.",
          "Post-retirement: more conservative allocation (e.g. 50/40/10). Gradually transitions to this mix.",
          "Glide path: starts N years before retirement and linearly shifts each component. At retirement year, you're fully at the post-retirement allocation.",
          "Portfolio return each year = stocks% × stock_mean + bonds% × bond_mean. Cash earns 0%.",
          "Stocks/bonds/cash should sum to 100%. The engine uses these percentages as-is.",
        ]}
      />
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-slate-500 mb-2">Pre-Retirement</div>
          <div className="grid grid-cols-3 gap-2">
            <FormField label="Stocks %">
              <Input type="number" value={allocation.pre_retirement.stocks_pct} onChange={(e) => onChange("pre_retirement", "stocks_pct", parseFloat(e.target.value) || 0)} />
            </FormField>
            <FormField label="Bonds %">
              <Input type="number" value={allocation.pre_retirement.bonds_pct} onChange={(e) => onChange("pre_retirement", "bonds_pct", parseFloat(e.target.value) || 0)} />
            </FormField>
            <FormField label="Cash %">
              <Input type="number" value={allocation.pre_retirement.cash_pct} onChange={(e) => onChange("pre_retirement", "cash_pct", parseFloat(e.target.value) || 0)} />
            </FormField>
          </div>
        </div>
        <div>
          <div className="text-xs text-slate-500 mb-2">Post-Retirement</div>
          <div className="grid grid-cols-3 gap-2">
            <FormField label="Stocks %">
              <Input type="number" value={allocation.post_retirement.stocks_pct} onChange={(e) => onChange("post_retirement", "stocks_pct", parseFloat(e.target.value) || 0)} />
            </FormField>
            <FormField label="Bonds %">
              <Input type="number" value={allocation.post_retirement.bonds_pct} onChange={(e) => onChange("post_retirement", "bonds_pct", parseFloat(e.target.value) || 0)} />
            </FormField>
            <FormField label="Cash %">
              <Input type="number" value={allocation.post_retirement.cash_pct} onChange={(e) => onChange("post_retirement", "cash_pct", parseFloat(e.target.value) || 0)} />
            </FormField>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <FormField label="Glide Path Starts (years before retirement)" help="How many years before retirement to begin shifting from pre- to post-retirement allocation. 5 means a gradual 5-year transition.">
          <Input type="number" value={allocation.glide_path_start_years_before} onChange={(e) => onChange("top", "glide_path_start_years_before", parseInt(e.target.value) || 0)} />
        </FormField>
      </div>
    </div>
  );
}

/* ─── Simulation results ─── */

function SimResults({
  det,
  mc,
}: {
  det: DeterministicResult | null;
  mc: MonteCarloResult | null;
}) {
  if (!det && !mc) return null;

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
    <div className="flex flex-col gap-4 mt-6">
      {mc && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Success Rate</div>
            <div className={`text-2xl font-bold mt-1 ${mc.success_rate >= 80 ? "text-green-700" : mc.success_rate >= 50 ? "text-amber-600" : "text-red-600"}`}>
              {mc.success_rate}%
            </div>
            <div className="text-xs text-slate-400 mt-1">{mc.num_trials.toLocaleString()} trials</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Median Terminal NW</div>
            <div className="text-2xl font-bold mt-1">{fmt(mc.median_terminal_net_worth)}</div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-sm text-slate-500">Runway (median)</div>
            <div className="text-2xl font-bold mt-1">{mc.years_of_runway.p50[0].toFixed(0)} yrs</div>
            <div className="text-xs text-slate-400 mt-1">p10: {mc.years_of_runway.p10[0].toFixed(0)} / p90: {mc.years_of_runway.p90[0].toFixed(0)}</div>
          </div>
        </div>
      )}

      {netWorthData.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Deterministic Net Worth</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={netWorthData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={fmt} />
              <Tooltip formatter={(v: number | undefined) => fmtFull(v ?? 0)} />
              <Line type="monotone" dataKey="net_worth" name="Total" stroke="#2563eb" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="liquid" name="Liquid" stroke="#16a34a" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
              <Line type="monotone" dataKey="illiquid" name="Illiquid" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 4" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {mcData.length > 0 && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <h3 className="text-lg font-semibold mb-4">Monte Carlo Fan</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={mcData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="year" />
              <YAxis tickFormatter={fmt} />
              <Tooltip formatter={(v: number | undefined, name: string | undefined) => {
                const labels: Record<string, string> = { p10: "10th", p25: "25th", p50: "Median", p75: "75th", p90: "90th" };
                return [fmtFull(v ?? 0), labels[name ?? ""] ?? name];
              }} />
              <Area type="monotone" dataKey="p90" stroke="#93c5fd" fill="#dbeafe" strokeWidth={1} dot={false} />
              <Area type="monotone" dataKey="p75" stroke="#60a5fa" fill="#bfdbfe" strokeWidth={1} dot={false} />
              <Area type="monotone" dataKey="p50" stroke="#2563eb" fill="#93c5fd" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="p25" stroke="#60a5fa" fill="#bfdbfe" strokeWidth={1} dot={false} />
              <Area type="monotone" dataKey="p10" stroke="#93c5fd" fill="#dbeafe" strokeWidth={1} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

/* ─── Main page ─── */

const DEFAULT_SCENARIO: Scenario = {
  schema_version: 1,
  name: "",
  description: "",
  assumptions: {
    investment_returns: {
      stocks_mean_pct: 8,
      stocks_stddev_pct: 16,
      bonds_mean_pct: 4,
      bonds_stddev_pct: 6,
      real_estate_appreciation_pct: 3.5,
    },
    inflation: {
      general_mean_pct: 3,
      general_stddev_pct: 1,
      college_tuition_pct: 5,
      healthcare_pct: 6,
    },
    asset_allocation: {
      pre_retirement: { stocks_pct: 70, bonds_pct: 25, cash_pct: 5 },
      post_retirement: { stocks_pct: 50, bonds_pct: 40, cash_pct: 10 },
      glide_path_start_years_before: 5,
    },
    college: {
      annual_cost_today: 65000,
      room_and_board_today: 18000,
      financial_aid_annual: 0,
      scholarship_annual: 0,
    },
    social_security: {
      primary_pia_at_67: 3200,
      spouse_pia_at_67: 1800,
      claiming_age_primary: 67,
      claiming_age_spouse: 67,
      cola_pct: 2,
    },
    healthcare: {
      annual_premium_today: 24000,
      annual_out_of_pocket_today: 6000,
      pre_medicare_gap_years: 2,
      aca_marketplace_annual: 30000,
      medicare_annual: 8000,
    },
    large_purchases: [],
    life_events: [],
    return_profiles: {},
  },
};

export function ScenariosPage() {
  const { data: names, isLoading } = useScenarioList();
  const [selectedName, setSelectedName] = useState("");
  const { data: scenario } = useScenario(selectedName);
  const updateScenario = useUpdateScenario();
  const deleteScenario = useDeleteScenario();
  const cloneScenario = useCloneScenario();
  const createScenario = useCreateScenario();
  const [local, setLocal] = useState<Scenario | null>(null);
  const [dirty, setDirty] = useState(false);

  // Simulation state
  const [det, setDet] = useState<DeterministicResult | null>(null);
  const [mc, setMc] = useState<MonteCarloResult | null>(null);
  const [simLoading, setSimLoading] = useState(false);

  // Create new scenario dialog
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");

  // Clone dialog
  const [showClone, setShowClone] = useState(false);
  const [cloneName, setCloneName] = useState("");

  useEffect(() => {
    if (scenario) {
      setLocal(scenario);
      setDirty(false);
      setDet(null);
      setMc(null);
    }
  }, [scenario]);

  if (isLoading) return <div className="text-slate-400">Loading...</div>;

  const save = () => {
    if (!local || !selectedName) return;
    updateScenario.mutate({ name: selectedName, data: local }, { onSuccess: () => setDirty(false) });
  };

  const handleDelete = () => {
    if (!selectedName) return;
    if (!confirm(`Delete scenario "${selectedName}"?`)) return;
    deleteScenario.mutate(selectedName, {
      onSuccess: () => {
        setSelectedName("");
        setLocal(null);
        setDet(null);
        setMc(null);
      },
    });
  };

  const handleClone = () => {
    if (!selectedName || !cloneName.trim()) return;
    const slug = cloneName.trim().toLowerCase().replace(/\s+/g, "-");
    cloneScenario.mutate(
      { name: selectedName, newName: slug },
      {
        onSuccess: () => {
          setShowClone(false);
          setCloneName("");
          setSelectedName(slug);
        },
      }
    );
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const slug = newName.trim().toLowerCase().replace(/\s+/g, "-");
    const data: Scenario = { ...DEFAULT_SCENARIO, name: newName.trim() };
    createScenario.mutate(
      { name: slug, data },
      {
        onSuccess: () => {
          setShowCreate(false);
          setNewName("");
          setSelectedName(slug);
        },
      }
    );
  };

  const runSimulation = async () => {
    if (!selectedName) return;
    setSimLoading(true);
    setDet(null);
    setMc(null);
    try {
      const [detResult, mcResult] = await Promise.all([
        simulationApi.deterministic({ scenario_name: selectedName }),
        simulationApi.monteCarlo({ scenario_name: selectedName, num_trials: 2000 }),
      ]);
      setDet(detResult);
      setMc(mcResult);
    } catch {
      // TODO: show error
    } finally {
      setSimLoading(false);
    }
  };

  const updateReturns = (field: string, value: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, assumptions: { ...prev.assumptions, investment_returns: { ...prev.assumptions.investment_returns, [field]: value } } };
    });
    setDirty(true);
  };

  const updateInflation = (field: string, value: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, assumptions: { ...prev.assumptions, inflation: { ...prev.assumptions.inflation, [field]: value } } };
    });
    setDirty(true);
  };

  const updateAllocation = (section: string, field: string, value: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const alloc = { ...prev.assumptions.asset_allocation };
      if (section === "top") {
        (alloc as Record<string, unknown>)[field] = value;
      } else {
        (alloc as unknown as Record<string, Record<string, number>>)[section] = {
          ...(alloc as unknown as Record<string, Record<string, number>>)[section],
          [field]: value,
        };
      }
      return { ...prev, assumptions: { ...prev.assumptions, asset_allocation: alloc } };
    });
    setDirty(true);
  };

  const updatePurchase = (index: number, field: string, value: string | number | boolean) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const purchases = [...prev.assumptions.large_purchases];
      purchases[index] = { ...purchases[index], [field]: value };
      return { ...prev, assumptions: { ...prev.assumptions, large_purchases: purchases } };
    });
    setDirty(true);
  };

  const removePurchase = (index: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const purchases = prev.assumptions.large_purchases.filter((_, i) => i !== index);
      return { ...prev, assumptions: { ...prev.assumptions, large_purchases: purchases } };
    });
    setDirty(true);
  };

  const addPurchase = () => {
    setLocal((prev) => {
      if (!prev) return prev;
      const newPurchase: LargePurchase = {
        name: "",
        year: new Date().getFullYear() + 2,
        purchase_price: 0,
        down_payment_pct: 25,
        mortgage_rate_pct: 6.5,
        mortgage_term_years: 30,
        annual_carrying_cost: 0,
        annual_property_tax: 0,
        is_rental_conversion: false,
        conversion_cost: 0,
        monthly_rental_income: 0,
        vacancy_rate_pct: 8,
        annual_maintenance_pct: 1.0,
        property_management_pct: 10,
        current_mortgage_balance: 0,
        current_mortgage_payment: 0,
      };
      return { ...prev, assumptions: { ...prev.assumptions, large_purchases: [...prev.assumptions.large_purchases, newPurchase] } };
    });
    setDirty(true);
  };

  const addLifeEvent = () => {
    setLocal((prev) => {
      if (!prev) return prev;
      const newEvent: LifeEvent = { name: "", year: new Date().getFullYear() + 5, amount: 0, taxable: false, tax_rate_override: null };
      const existing = prev.assumptions.life_events ?? [];
      return { ...prev, assumptions: { ...prev.assumptions, life_events: [...existing, newEvent] } };
    });
    setDirty(true);
  };

  const updateLifeEvent = (index: number, field: string, value: string | number | boolean) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const events = [...(prev.assumptions.life_events ?? [])];
      events[index] = { ...events[index], [field]: value };
      return { ...prev, assumptions: { ...prev.assumptions, life_events: events } };
    });
    setDirty(true);
  };

  const removeLifeEvent = (index: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const events = (prev.assumptions.life_events ?? []).filter((_, i) => i !== index);
      return { ...prev, assumptions: { ...prev.assumptions, life_events: events } };
    });
    setDirty(true);
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Scenarios</h2>
        <div className="flex gap-2">
          {local && (
            <>
              <button
                onClick={runSimulation}
                disabled={simLoading || dirty}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  simLoading || dirty
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {simLoading ? "Running..." : dirty ? "Save first" : "Run Simulation"}
              </button>
              <button
                onClick={save}
                disabled={!dirty || updateScenario.isPending}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  dirty ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                {updateScenario.isPending ? "Saving..." : "Save"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Scenario selector + actions */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {names?.map((item) => (
          <button
            key={item.slug}
            onClick={() => setSelectedName(item.slug)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              selectedName === item.slug
                ? "bg-blue-600 text-white"
                : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            {item.name}
          </button>
        ))}
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 rounded-md text-sm font-medium bg-white border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50"
        >
          + New
        </button>
        {selectedName && (
          <>
            <button
              onClick={() => { setCloneName(`${selectedName}-copy`); setShowClone(true); }}
              className="px-3 py-2 rounded-md text-xs font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            >
              Clone
            </button>
            <button
              onClick={handleDelete}
              className="px-3 py-2 rounded-md text-xs font-medium text-red-500 hover:text-red-700 hover:bg-red-50"
            >
              Delete
            </button>
          </>
        )}
      </div>

      {/* Create dialog */}
      {showCreate && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6 flex items-end gap-3">
          <FormField label="New Scenario Name">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Early Retirement" />
          </FormField>
          <button onClick={handleCreate} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
            Create
          </button>
          <button onClick={() => { setShowCreate(false); setNewName(""); }} className="px-4 py-2 text-slate-500 text-sm">
            Cancel
          </button>
        </div>
      )}

      {/* Clone dialog */}
      {showClone && (
        <div className="bg-white rounded-lg border border-slate-200 p-4 mb-6 flex items-end gap-3">
          <FormField label={`Clone "${selectedName}" as`}>
            <Input value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
          </FormField>
          <button onClick={handleClone} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700">
            Clone
          </button>
          <button onClick={() => { setShowClone(false); setCloneName(""); }} className="px-4 py-2 text-slate-500 text-sm">
            Cancel
          </button>
        </div>
      )}

      {/* Scenario editor */}
      {local && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <FormField label="Scenario Name">
                <Input
                  value={local.name}
                  onChange={(e) => { setLocal({ ...local, name: e.target.value }); setDirty(true); }}
                />
              </FormField>
              <FormField label="Description">
                <Input
                  value={local.description}
                  onChange={(e) => { setLocal({ ...local, description: e.target.value }); setDirty(true); }}
                />
              </FormField>
            </div>
          </div>

          <InvestmentReturnsEditor returns={local.assumptions.investment_returns} onChange={updateReturns} />
          <InflationEditor inflation={local.assumptions.inflation} onChange={updateInflation} />
          <AllocationEditor allocation={local.assumptions.asset_allocation} onChange={updateAllocation} />

          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Large Purchases & Events</h3>
              <button
                onClick={addPurchase}
                className="px-3 py-1.5 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
              >
                + Add
              </button>
            </div>
            <SectionHelp
              summary="Major real estate purchases or rental conversions. Down payments come directly from your liquid portfolio. New properties appreciate and add to illiquid net worth."
              details={[
                "New Purchase: down payment is deducted from liquid portfolio in the purchase year. A mortgage is created for the remainder.",
                "The mortgage payment (P&I) is computed using standard amortization and deducted annually. Property tax and carrying costs are inflated each year.",
                "Properties appreciate at the scenario's RE appreciation rate and their equity counts as illiquid net worth.",
                "Rental Conversion: converts your primary residence to a rental property. Rental income = monthly rent × 12 × (1 - vacancy%). Rent grows with inflation.",
                "Rental expenses: maintenance (% of property value), property management (% of rent), and existing mortgage payment are deducted from rental income.",
                "100% down payment = cash purchase. No mortgage is created, but the full price is deducted from liquid assets.",
              ]}
            />
            <div className="flex flex-col gap-4">
              {local.assumptions.large_purchases.map((p, i) => (
                <LargePurchaseCard key={i} purchase={p} index={i} onChange={updatePurchase} onRemove={removePurchase} />
              ))}
              {local.assumptions.large_purchases.length === 0 && (
                <div className="text-sm text-slate-400 text-center py-4">No large purchases configured</div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Life Events</h3>
              <button
                onClick={addLifeEvent}
                className="px-3 py-1.5 bg-green-600 text-white rounded-md text-sm font-medium hover:bg-green-700"
              >
                + Add
              </button>
            </div>
            <SectionHelp
              summary="One-time cash events (inheritance, windfall, large gift, etc.). Positive amounts add to your liquid portfolio; negative amounts subtract from it."
              details={[
                "Events fire in the specified year. The amount is added to (or subtracted from) the liquid portfolio.",
                "If taxable, the amount is reduced by the pre-retirement tax rate (or retirement rate if already retired).",
                "Use negative amounts for large one-time expenses (wedding, major medical, etc.).",
                "Life events only exist within scenarios — the baseline dashboard excludes them.",
              ]}
            />
            <div className="flex flex-col gap-3">
              {(local.assumptions.life_events ?? []).map((evt, i) => (
                <div key={i} className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-medium text-slate-600">{evt.name || `Event ${i + 1}`}</h4>
                    <button onClick={() => removeLifeEvent(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <FormField label="Name">
                      <Input value={evt.name} onChange={(e) => updateLifeEvent(i, "name", e.target.value)} />
                    </FormField>
                    <FormField label="Year">
                      <Input type="number" value={evt.year} onChange={(e) => updateLifeEvent(i, "year", parseInt(e.target.value) || 0)} />
                    </FormField>
                    <FormField label="Amount" hint="Positive = inflow">
                      <Input type="number" value={evt.amount} onChange={(e) => updateLifeEvent(i, "amount", parseFloat(e.target.value) || 0)} />
                    </FormField>
                    <FormField label="Taxable?">
                      <select
                        className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
                        value={evt.taxable ? "yes" : "no"}
                        onChange={(e) => updateLifeEvent(i, "taxable", e.target.value === "yes")}
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                    </FormField>
                  </div>
                </div>
              ))}
              {(local.assumptions.life_events ?? []).length === 0 && (
                <div className="text-sm text-slate-400 text-center py-4">No life events configured</div>
              )}
            </div>
          </div>

          {/* Simulation results */}
          <SimResults det={det} mc={mc} />
        </div>
      )}

      {!selectedName && !showCreate && (
        <div className="text-center text-slate-400 py-12">
          Select a scenario or create a new one to get started.
        </div>
      )}
    </div>
  );
}
