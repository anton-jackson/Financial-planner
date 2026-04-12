import { useEffect, useState } from "react";
import { useAssets, useUpdateAssets } from "../hooks/useAssets";
import { useProfile } from "../hooks/useProfile";
import { useAutoSave } from "../hooks/useAutoSave";
import { holdingsApi } from "../api/holdings";
import { FormField, Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import type {
  Asset,
  AssetsFile,
  HoldingsFile,
  AccountHoldings,
  Holding,
  AllocationTarget,
  RebalanceAction,
  QuoteResult,
} from "../types/assets";

// ─── Constants ────────────────────────────────────────────────

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  traditional_401k: "Traditional 401k",
  roth_401k: "Roth 401k",
  tax_deferred_retirement: "Tax-Deferred Retirement",
  traditional_ira: "Traditional IRA",
  roth_ira: "Roth IRA",
  hsa: "HSA",
  taxable_brokerage: "Taxable Brokerage",
  "529": "529 Plan",
  crypto: "Crypto",
  checking: "Checking",
  savings: "Savings",
  money_market: "Money Market",
  other: "Other",
};

const ASSET_CLASS_LABELS: Record<string, string> = {
  us_equity: "US Equity",
  intl_equity: "International Equity",
  bonds: "Bonds",
  real_estate: "Real Estate",
  cash: "Cash / Money Market",
  commodities: "Commodities",
  crypto: "Crypto",
  unclassified: "Unclassified",
};

const ASSET_CLASS_COLORS: Record<string, string> = {
  us_equity: "bg-blue-500",
  intl_equity: "bg-indigo-500",
  bonds: "bg-amber-500",
  real_estate: "bg-emerald-500",
  cash: "bg-slate-400",
  commodities: "bg-orange-500",
  crypto: "bg-purple-500",
  unclassified: "bg-slate-300",
};

// Tax-treatment groups
const TAX_GROUPS: { key: string; label: string; types: string[] }[] = [
  {
    key: "tax_deferred",
    label: "Tax-Deferred Retirement",
    types: ["traditional_401k", "tax_deferred_retirement", "traditional_ira"],
  },
  {
    key: "tax_free",
    label: "Tax-Free Retirement",
    types: ["roth_401k", "roth_ira", "hsa"],
  },
  {
    key: "taxable",
    label: "Taxable",
    types: ["taxable_brokerage", "crypto"],
  },
  {
    key: "education",
    label: "Education",
    types: ["529"],
  },
  {
    key: "cash",
    label: "Cash",
    types: ["checking", "savings", "money_market"],
  },
];

const OWNER_COLORS: Record<string, string> = {
  primary: "bg-blue-100 text-blue-700",
  spouse: "bg-pink-100 text-pink-700",
  joint: "bg-purple-100 text-purple-700",
};

const fmt = (n: number) => "$" + Math.round(n).toLocaleString();

// ─── Ticker Input ─────────────────────────────────────────────

function TickerInput({
  value,
  onResolved,
}: {
  value: string;
  onResolved: (ticker: string, quote: QuoteResult) => void;
}) {
  const [input, setInput] = useState(value);
  const [looking, setLooking] = useState(false);

  const lookup = useCallback(async () => {
    const ticker = input.trim().toUpperCase();
    if (!ticker) return;
    setLooking(true);
    try {
      const quotes = await holdingsApi.quote([ticker]);
      const q = quotes[ticker];
      if (q && !q.error) {
        onResolved(ticker, q);
      }
    } finally {
      setLooking(false);
    }
  }, [input, onResolved]);

  return (
    <div className="flex gap-1">
      <Input
        value={input}
        placeholder="e.g. VTI, BTC"
        onChange={(e) => setInput(e.target.value.toUpperCase())}
        onKeyDown={(e) => e.key === "Enter" && lookup()}
        onBlur={lookup}
      />
      {looking && <span className="text-xs text-slate-400 self-center">...</span>}
    </div>
  );
}

// ─── Allocation Bar ───────────────────────────────────────────

function AllocationBar({ allocation }: { allocation: Record<string, number> }) {
  const entries = Object.entries(allocation).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-slate-600 mb-2">Current Allocation</h3>
      <div className="flex h-6 rounded-md overflow-hidden mb-2">
        {entries.map(([cls, pct]) => (
          <div
            key={cls}
            className={`${ASSET_CLASS_COLORS[cls] || "bg-slate-300"} transition-all`}
            style={{ width: `${pct}%` }}
            title={`${ASSET_CLASS_LABELS[cls] || cls}: ${pct.toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        {entries.map(([cls, pct]) => (
          <span key={cls} className="flex items-center gap-1">
            <span className={`w-2 h-2 rounded-full ${ASSET_CLASS_COLORS[cls] || "bg-slate-300"}`} />
            {ASSET_CLASS_LABELS[cls] || cls}: {pct.toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Rebalance Section ────────────────────────────────────────

function RebalanceSection({ allocation }: { allocation: Record<string, number> }) {
  const allClasses = new Set([...Object.keys(allocation), "us_equity", "intl_equity", "bonds"]);

  const [targets, setTargets] = useState<AllocationTarget[]>(
    Array.from(allClasses).map((cls) => ({
      asset_class: cls,
      target_pct: allocation[cls] ?? 0,
    }))
  );
  const [actions, setActions] = useState<RebalanceAction[] | null>(null);
  const [loading, setLoading] = useState(false);

  const totalPct = targets.reduce((s, t) => s + t.target_pct, 0);

  const updateTarget = (index: number, pct: number) => {
    setTargets((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], target_pct: pct };
      return next;
    });
    setActions(null);
  };

  const addTarget = () => {
    setTargets((prev) => [...prev, { asset_class: "us_equity", target_pct: 0 }]);
  };

  const removeTarget = (index: number) => {
    setTargets((prev) => prev.filter((_, i) => i !== index));
    setActions(null);
  };

  const calculate = async () => {
    setLoading(true);
    try {
      const result = await holdingsApi.rebalance(targets.filter((t) => t.target_pct > 0));
      setActions(result);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-8">
      <h3 className="text-lg font-semibold mb-3">Rebalance Calculator</h3>
      <SectionHelp
        summary="Set target allocation percentages and calculate the trades needed to rebalance. Prefers trading in tax-advantaged accounts."
        details={[
          "Targets must sum to 100%.",
          "Sells are allocated to tax-advantaged accounts first (401k, IRA) to avoid triggering capital gains.",
          "Buy suggestions show dollar amounts — you choose the specific security.",
        ]}
      />
      <div className="flex flex-col gap-2 mb-3">
        {targets.map((t, i) => (
          <div key={i} className="flex items-center gap-2">
            <select
              className="px-2 py-1.5 border border-slate-200 rounded text-sm w-48"
              value={t.asset_class}
              onChange={(e) => {
                const next = [...targets];
                next[i] = { ...next[i], asset_class: e.target.value };
                setTargets(next);
                setActions(null);
              }}
            >
              {Object.entries(ASSET_CLASS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <Input
              type="number"
              step="1"
              className="w-20 text-right"
              value={t.target_pct || ""}
              onChange={(e) => updateTarget(i, parseFloat(e.target.value) || 0)}
            />
            <span className="text-sm text-slate-500">%</span>
            <button onClick={() => removeTarget(i)} className="text-red-400 hover:text-red-600 text-xs">
              &times;
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={addTarget} className="text-sm text-blue-600 hover:text-blue-800">
          + Add Class
        </button>
        <span className={`text-sm ${Math.abs(totalPct - 100) > 1 ? "text-red-500 font-medium" : "text-slate-500"}`}>
          Total: {totalPct.toFixed(0)}%
        </span>
        <button
          onClick={calculate}
          disabled={Math.abs(totalPct - 100) > 1 || loading}
          className={`ml-auto px-4 py-2 rounded-md text-sm font-medium ${
            Math.abs(totalPct - 100) > 1
              ? "bg-slate-100 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
        >
          {loading ? "Calculating..." : "Calculate Rebalance"}
        </button>
      </div>
      {actions !== null && (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
          {actions.length === 0 ? (
            <div className="text-sm text-green-600 text-center py-2">
              Portfolio is already balanced — no trades needed.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                  <th className="pb-2">Action</th>
                  <th className="pb-2">Account</th>
                  <th className="pb-2">Ticker</th>
                  <th className="pb-2">Class</th>
                  <th className="pb-2 text-right">Amount</th>
                  <th className="pb-2">Reason</th>
                </tr>
              </thead>
              <tbody>
                {actions.map((a, i) => (
                  <tr key={i} className="border-b border-slate-100">
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${
                          a.action === "sell" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                        }`}
                      >
                        {a.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 text-slate-600">{a.account_name}</td>
                    <td className="py-2 font-mono">{a.ticker}</td>
                    <td className="py-2 text-slate-500">{ASSET_CLASS_LABELS[a.asset_class] || a.asset_class}</td>
                    <td className="py-2 text-right font-medium">
                      {fmt(a.dollar_amount)}
                      {a.shares > 0 && (
                        <span className="text-xs text-slate-400 ml-1">({a.shares.toFixed(2)} sh)</span>
                      )}
                    </td>
                    <td className="py-2 text-xs text-slate-500">{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────

export function AccountsPage() {
  const { data: assetsData, isLoading: assetsLoading, error: assetsError } = useAssets();
  const { data: profile } = useProfile();
  const updateAssets = useUpdateAssets();

  const [localAssets, setLocalAssets] = useState<AssetsFile | null>(null);
  const [holdings, setHoldings] = useState<HoldingsFile | null>(null);
  const [allocation, setAllocation] = useState<Record<string, number>>({});
  const [assetsDirty, setAssetsDirty] = useState(false);
  const [holdingsDirty, setHoldingsDirty] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [expandedAccount, setExpandedAccount] = useState<string | null>(null);
  const [holdingsLoading, setHoldingsLoading] = useState(true);
  const [holdingsSaving, setHoldingsSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Owner labels from profile
  const primaryName = profile?.personal?.name || "Primary";
  const spouseName = profile?.spouse?.name || "Spouse";
  const ownerLabels: Record<string, string> = {
    primary: primaryName,
    spouse: spouseName,
    joint: "Joint",
  };

  useEffect(() => {
    if (assetsData) setLocalAssets(assetsData);
  }, [assetsData]);

  // Load holdings
  useEffect(() => {
    holdingsApi.get().then(
      (h) => {
        setHoldings(h);
        computeAllocation(h);
        setHoldingsLoading(false);
      },
      () => setHoldingsLoading(false)
    );
  }, []);

  const computeAllocation = (h: HoldingsFile) => {
    const alloc: Record<string, number> = {};
    let total = 0;
    for (const acct of h.accounts) {
      for (const hold of acct.holdings) {
        const mv = hold.market_value || hold.shares * hold.price;
        const cls = hold.asset_class || "unclassified";
        alloc[cls] = (alloc[cls] || 0) + mv;
        total += mv;
      }
    }
    if (total > 0) {
      for (const cls of Object.keys(alloc)) {
        alloc[cls] = Math.round((alloc[cls] / total) * 10000) / 100;
      }
    }
    setAllocation(alloc);
  };

  const dirty = assetsDirty || holdingsDirty;
  const saving = updateAssets.isPending || holdingsSaving;

  const save = async () => {
    if (assetsDirty && localAssets) {
      updateAssets.mutate(localAssets, { onSuccess: () => setAssetsDirty(false) });
    }
    if (holdingsDirty && holdings) {
      setHoldingsSaving(true);
      try {
        await holdingsApi.put(holdings);
        setHoldingsDirty(false);
      } catch (err) {
        console.error(err);
      } finally {
        setHoldingsSaving(false);
      }
    }
  };
  const { status: saveStatus } = useAutoSave(save, dirty, saving);

  const isLoading = assetsLoading || holdingsLoading;

  if (isLoading) return <div className="text-slate-400">Loading...</div>;
  if (assetsError) return <div className="text-red-500">Error loading data</div>;
  if (!localAssets) return null;

  // Filter to investment accounts only (exclude real_estate)
  const investmentAccounts = localAssets.assets
    .map((asset, index) => ({ asset, index }))
    .filter(({ asset }) => asset.type !== "real_estate");

  // Holdings helpers
  const getAccountHoldings = (accountName: string): AccountHoldings | undefined => {
    return holdings?.accounts.find((a) => a.account_name === accountName);
  };

  const getAccountBalance = (asset: Asset): number => {
    const ah = getAccountHoldings(asset.name);
    if (ah && ah.holdings.length > 0) {
      return ah.holdings.reduce((s, h) => s + (h.market_value || h.shares * h.price), 0);
    }
    return asset.balance;
  };

  const totalBalance = investmentAccounts.reduce((sum, { asset }) => sum + getAccountBalance(asset), 0);

  const onAssetChange = (actualIndex: number, field: string, value: string | number | boolean) => {
    setLocalAssets((prev) => {
      if (!prev) return prev;
      const assets = [...prev.assets];
      assets[actualIndex] = { ...assets[actualIndex], [field]: value };
      return { ...prev, assets };
    });
    setAssetsDirty(true);
  };

  const addAccount = (type: string) => {
    const newAsset: Asset = {
      name: ACCOUNT_TYPE_LABELS[type] ?? type,
      type,
      balance: 0,
      return_profile: type === "checking" || type === "savings" || type === "money_market" ? "cash" : "stocks_bonds",
      owner: "primary",
      properties: {},
    };
    setLocalAssets((prev) => {
      if (!prev) return prev;
      return { ...prev, assets: [...prev.assets, newAsset] };
    });
    setAssetsDirty(true);
    setAddMenuOpen(false);
  };

  const removeAccount = (actualIndex: number) => {
    const removedName = localAssets.assets[actualIndex]?.name;
    setLocalAssets((prev) => {
      if (!prev) return prev;
      return { ...prev, assets: prev.assets.filter((_, i) => i !== actualIndex) };
    });
    setAssetsDirty(true);
    if (removedName && holdings) {
      setHoldings((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          accounts: prev.accounts.filter((a) => a.account_name !== removedName),
        };
      });
      setHoldingsDirty(true);
    }
  };

  const ensureAccountHoldings = (accountName: string) => {
    setHoldings((prev) => {
      if (!prev) {
        return {
          schema_version: 1,
          accounts: [{ account_name: accountName, holdings: [], total_value: 0, last_refreshed: "" }],
        };
      }
      if (prev.accounts.some((a) => a.account_name === accountName)) return prev;
      return {
        ...prev,
        accounts: [
          ...prev.accounts,
          { account_name: accountName, holdings: [], total_value: 0, last_refreshed: "" },
        ],
      };
    });
  };

  const addHolding = (accountName: string) => {
    ensureAccountHoldings(accountName);
    setHoldings((prev) => {
      if (!prev) return prev;
      const accounts = prev.accounts.map((a) => {
        if (a.account_name !== accountName) return a;
        return {
          ...a,
          holdings: [
            ...a.holdings,
            { ticker: "", shares: 0, asset_class: "", tax_lots: [], price: 0, market_value: 0, name: "" },
          ],
        };
      });
      return { ...prev, accounts };
    });
    setHoldingsDirty(true);
  };

  const removeHolding = (accountName: string, holdingIndex: number) => {
    setHoldings((prev) => {
      if (!prev) return prev;
      const accounts = prev.accounts.map((a) => {
        if (a.account_name !== accountName) return a;
        return { ...a, holdings: a.holdings.filter((_, i) => i !== holdingIndex) };
      });
      return { ...prev, accounts };
    });
    setHoldingsDirty(true);
  };

  const updateHolding = (accountName: string, holdingIndex: number, field: keyof Holding, value: unknown) => {
    setHoldings((prev) => {
      if (!prev) return prev;
      const accounts = prev.accounts.map((a) => {
        if (a.account_name !== accountName) return a;
        const newHoldings = [...a.holdings];
        newHoldings[holdingIndex] = { ...newHoldings[holdingIndex], [field]: value };
        if (field === "shares" || field === "price") {
          const h = newHoldings[holdingIndex];
          newHoldings[holdingIndex].market_value = Math.round(h.shares * h.price * 100) / 100;
        }
        return { ...a, holdings: newHoldings };
      });
      const updated = { ...prev, accounts };
      setTimeout(() => computeAllocation(updated), 0);
      return updated;
    });
    setHoldingsDirty(true);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const updated = await holdingsApi.refresh();
      setHoldings(updated);
      setHoldingsDirty(false);
      computeAllocation(updated);
      setLocalAssets((prev) => {
        if (!prev) return prev;
        const assets = prev.assets.map((a) => {
          const ah = updated.accounts.find((acc) => acc.account_name === a.name);
          if (ah && ah.holdings.length > 0) {
            const total = ah.holdings.reduce((s, h) => s + (h.market_value || h.shares * h.price), 0);
            return { ...a, balance: total };
          }
          return a;
        });
        return { ...prev, assets };
      });
      setAssetsDirty(true);
    } finally {
      setRefreshing(false);
    }
  };

  // Group accounts by tax treatment
  const groupedAccounts = TAX_GROUPS.map((group) => {
    const accounts = investmentAccounts.filter(({ asset }) => group.types.includes(asset.type));
    const groupTotal = accounts.reduce((sum, { asset }) => sum + getAccountBalance(asset), 0);
    return { ...group, accounts, groupTotal };
  });

  // "Other" bucket for anything not in a defined group
  const assignedTypes = new Set(TAX_GROUPS.flatMap((g) => g.types));
  const otherAccounts = investmentAccounts.filter(({ asset }) => !assignedTypes.has(asset.type));
  const otherTotal = otherAccounts.reduce((sum, { asset }) => sum + getAccountBalance(asset), 0);

  // Render a single account card
  const renderAccountCard = (asset: Asset, actualIndex: number) => {
    const acctHoldings = getAccountHoldings(asset.name);
    const isExpanded = expandedAccount === asset.name;
    const holdingsTotal = acctHoldings
      ? acctHoldings.holdings.reduce((s, h) => s + (h.market_value || h.shares * h.price), 0)
      : 0;

    return (
      <div key={actualIndex} className="bg-slate-50 rounded-lg border border-slate-200">
        {/* Account header */}
        <div
          className="p-4 cursor-pointer"
          onClick={() => setExpandedAccount(isExpanded ? null : asset.name)}
        >
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <span className="text-sm text-slate-400">{isExpanded ? "▼" : "▶"}</span>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-slate-700">
                    {ACCOUNT_TYPE_LABELS[asset.type] || asset.type}
                  </h4>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${OWNER_COLORS[asset.owner] || OWNER_COLORS.primary}`}>
                    {ownerLabels[asset.owner] || asset.owner}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium">{fmt(holdingsTotal > 0 ? holdingsTotal : asset.balance)}</div>
                {holdingsTotal > 0 && (
                  <div className="text-xs text-slate-400">
                    {acctHoldings!.holdings.length} holding{acctHoldings!.holdings.length !== 1 ? "s" : ""}
                  </div>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); removeAccount(actualIndex); }}
                className="text-xs text-red-500 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>

        {/* Expanded: account details + holdings */}
        {isExpanded && (
          <div className="px-4 pb-4 border-t border-slate-200">
            <div className="grid grid-cols-4 gap-3 mt-3 mb-4">
              <FormField label="Name">
                <Input
                  value={asset.name}
                  onChange={(e) => onAssetChange(actualIndex, "name", e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                />
              </FormField>
              <FormField label="Type">
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
                  value={asset.type}
                  onChange={(e) => onAssetChange(actualIndex, "type", e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {Object.entries(ACCOUNT_TYPE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Owner">
                <select
                  className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
                  value={asset.owner || "primary"}
                  onChange={(e) => onAssetChange(actualIndex, "owner", e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                >
                  {Object.entries(ownerLabels).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Balance" hint={holdingsTotal > 0 ? "Auto-calculated from holdings" : "Manual entry"}>
                <Input
                  type="number"
                  value={holdingsTotal > 0 ? holdingsTotal : asset.balance}
                  disabled={holdingsTotal > 0}
                  onChange={(e) => onAssetChange(actualIndex, "balance", parseFloat(e.target.value) || 0)}
                  onClick={(e) => e.stopPropagation()}
                />
              </FormField>
            </div>

            {/* Holdings table */}
            <div className="flex justify-between items-center mb-2">
              <h5 className="text-sm font-medium text-slate-600">Holdings</h5>
              <button
                onClick={(e) => { e.stopPropagation(); addHolding(asset.name); }}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                + Add Holding
              </button>
            </div>

            {(!acctHoldings || acctHoldings.holdings.length === 0) ? (
              <div className="text-sm text-slate-400 text-center py-3 border border-dashed border-slate-200 rounded-md">
                No holdings — add a ticker to track positions
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="pb-2 w-24">Ticker</th>
                    <th className="pb-2">Name</th>
                    <th className="pb-2 w-24 text-right">Shares</th>
                    <th className="pb-2 w-24 text-right">Price</th>
                    <th className="pb-2 w-28 text-right">Value</th>
                    <th className="pb-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {acctHoldings.holdings.map((h, hi) => (
                    <tr key={hi} className="border-b border-slate-100">
                      <td className="py-2">
                        <TickerInput
                          value={h.ticker}
                          onResolved={(ticker, q) => {
                            updateHolding(asset.name, hi, "ticker", ticker);
                            updateHolding(asset.name, hi, "price", q.price);
                            updateHolding(asset.name, hi, "name", q.name);
                            updateHolding(asset.name, hi, "market_value", h.shares * q.price);
                            if (!h.asset_class && q.asset_class) {
                              updateHolding(asset.name, hi, "asset_class", q.asset_class);
                            }
                          }}
                        />
                      </td>
                      <td className="py-2 text-slate-600">{h.name || "—"}</td>
                      <td className="py-2 text-right">
                        <Input
                          type="number"
                          step="0.001"
                          className="w-24 text-right"
                          value={h.shares || ""}
                          onChange={(e) =>
                            updateHolding(asset.name, hi, "shares", parseFloat(e.target.value) || 0)
                          }
                        />
                      </td>
                      <td className="py-2 text-right text-slate-600">
                        {h.price > 0 ? `$${h.price.toFixed(2)}` : "—"}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {h.market_value > 0 ? fmt(h.market_value) : "—"}
                      </td>
                      <td className="py-2 text-center">
                        <button
                          onClick={() => removeHolding(asset.name, hi)}
                          className="text-red-400 hover:text-red-600 text-xs"
                        >
                          &times;
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Investment Accounts</h2>
          <p className="text-slate-500 text-sm mt-1">
            Total: {fmt(totalBalance)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus && <span className="text-xs text-slate-400">{saveStatus}</span>}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="px-4 py-2 rounded-md text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            {refreshing ? "Refreshing..." : "Refresh Prices"}
          </button>
        </div>
      </div>

      <SectionHelp
        summary="All your investment accounts in one place. Click an account to expand and manage individual holdings."
        details={[
          "Accounts are grouped by tax treatment. Each account shows who owns it.",
          "Enter holdings to track individual positions and use the rebalance calculator.",
          "If holdings are entered, you can refresh prices to auto-update market values.",
        ]}
      />

      {/* Add Account */}
      <div className="flex justify-end mb-4">
        <div className="relative">
          <button
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            + Add Account
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10 w-48">
              {Object.entries(ACCOUNT_TYPE_LABELS).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => addAccount(type)}
                  className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Grouped account sections */}
      {groupedAccounts.map((group) => {
        if (group.accounts.length === 0) return null;
        return (
          <div key={group.key} className="mb-6">
            <div className="flex justify-between items-baseline mb-3">
              <h3 className="text-base font-semibold text-slate-700">{group.label}</h3>
              <span className="text-sm text-slate-500">{fmt(group.groupTotal)}</span>
            </div>
            <div className="flex flex-col gap-3">
              {group.accounts.map(({ asset, index }) => renderAccountCard(asset, index))}
            </div>
          </div>
        );
      })}

      {/* Other / uncategorized accounts */}
      {otherAccounts.length > 0 && (
        <div className="mb-6">
          <div className="flex justify-between items-baseline mb-3">
            <h3 className="text-base font-semibold text-slate-700">Other</h3>
            <span className="text-sm text-slate-500">{fmt(otherTotal)}</span>
          </div>
          <div className="flex flex-col gap-3">
            {otherAccounts.map(({ asset, index }) => renderAccountCard(asset, index))}
          </div>
        </div>
      )}

      {investmentAccounts.length === 0 && (
        <div className="text-sm text-slate-400 text-center py-4">No accounts — add one above</div>
      )}

      {/* Allocation bar */}
      {Object.keys(allocation).length > 0 && <AllocationBar allocation={allocation} />}

      {/* Rebalance calculator */}
      {Object.keys(allocation).length > 0 && <RebalanceSection allocation={allocation} />}
    </div>
  );
}
