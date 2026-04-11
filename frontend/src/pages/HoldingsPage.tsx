import { useEffect, useState, useCallback } from "react";
import { holdingsApi } from "../api/holdings";
import { assetsApi } from "../api/assets";
import { Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import type {
  HoldingsFile,
  AccountHoldings,
  Holding,
  AllocationTarget,
  RebalanceAction,
  QuoteResult,
  Asset,
} from "../types/assets";

// Asset types that can hold securities
const INVESTMENT_ACCOUNT_TYPES = new Set([
  "traditional_401k",
  "roth_401k",
  "traditional_ira",
  "roth_ira",
  "hsa",
  "taxable_brokerage",
  "529",
  "crypto",
  "other",
]);

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

const fmt = (n: number) =>
  "$" + Math.round(n).toLocaleString();

// ─── Ticker Lookup ───────────────────────────────────────────

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
      {looking && (
        <span className="text-xs text-slate-400 self-center">...</span>
      )}
    </div>
  );
}

// ─── Holdings Table ──────────────────────────────────────────

function HoldingsTable({
  account,
  accountIndex,
  onUpdate,
  onRemoveHolding,
  onAddHolding,
}: {
  account: AccountHoldings;
  accountIndex: number;
  onUpdate: (ai: number, hi: number, field: keyof Holding, value: unknown) => void;
  onRemoveHolding: (ai: number, hi: number) => void;
  onAddHolding: (ai: number) => void;
}) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4 mb-4">
      <div className="flex justify-between items-center mb-3">
        <div>
          <h4 className="text-sm font-medium text-slate-700">
            {account.account_name}
          </h4>
          {account.total_value > 0 && (
            <span className="text-xs text-slate-500">
              {fmt(account.total_value)}
              {account.last_refreshed && (
                <>
                  {" "}&middot; Updated{" "}
                  {new Date(account.last_refreshed).toLocaleTimeString()}
                </>
              )}
            </span>
          )}
        </div>
        <button
          onClick={() => onAddHolding(accountIndex)}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          + Add Holding
        </button>
      </div>

      {account.holdings.length === 0 ? (
        <div className="text-sm text-slate-400 text-center py-3">
          No holdings — add a ticker to get started
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
              <th className="pb-2 w-28">Class</th>
              <th className="pb-2 w-8"></th>
            </tr>
          </thead>
          <tbody>
            {account.holdings.map((h, hi) => (
              <tr key={hi} className="border-b border-slate-100">
                <td className="py-2">
                  <TickerInput
                    value={h.ticker}
                    onResolved={(ticker, q) => {
                      onUpdate(accountIndex, hi, "ticker", ticker);
                      onUpdate(accountIndex, hi, "price", q.price);
                      onUpdate(accountIndex, hi, "name", q.name);
                      onUpdate(
                        accountIndex,
                        hi,
                        "market_value",
                        h.shares * q.price
                      );
                      if (!h.asset_class && q.asset_class) {
                        onUpdate(accountIndex, hi, "asset_class", q.asset_class);
                      }
                    }}
                  />
                </td>
                <td className="py-2 text-slate-600 truncate max-w-[200px]">
                  {h.name || "—"}
                </td>
                <td className="py-2 text-right">
                  <Input
                    type="number"
                    step="0.001"
                    className="w-24 text-right"
                    value={h.shares || ""}
                    onChange={(e) =>
                      onUpdate(
                        accountIndex,
                        hi,
                        "shares",
                        parseFloat(e.target.value) || 0
                      )
                    }
                  />
                </td>
                <td className="py-2 text-right text-slate-600">
                  {h.price > 0 ? `$${h.price.toFixed(2)}` : "—"}
                </td>
                <td className="py-2 text-right font-medium">
                  {h.market_value > 0 ? fmt(h.market_value) : "—"}
                </td>
                <td className="py-2">
                  <select
                    className="w-full px-1 py-1 border border-slate-200 rounded text-xs"
                    value={h.asset_class || ""}
                    onChange={(e) =>
                      onUpdate(accountIndex, hi, "asset_class", e.target.value)
                    }
                  >
                    <option value="">—</option>
                    {Object.entries(ASSET_CLASS_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-center">
                  <button
                    onClick={() => onRemoveHolding(accountIndex, hi)}
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
  );
}

// ─── Allocation Bar ──────────────────────────────────────────

function AllocationBar({
  allocation,
}: {
  allocation: Record<string, number>;
}) {
  const entries = Object.entries(allocation).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-sm font-medium text-slate-600 mb-2">
        Current Allocation
      </h3>
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
            <span
              className={`w-2 h-2 rounded-full ${ASSET_CLASS_COLORS[cls] || "bg-slate-300"}`}
            />
            {ASSET_CLASS_LABELS[cls] || cls}: {pct.toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Rebalance Section ───────────────────────────────────────

function RebalanceSection({
  allocation,
}: {
  allocation: Record<string, number>;
}) {
  const allClasses = new Set([
    ...Object.keys(allocation),
    "us_equity",
    "intl_equity",
    "bonds",
  ]);

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
      const result = await holdingsApi.rebalance(
        targets.filter((t) => t.target_pct > 0)
      );
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
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <Input
              type="number"
              step="1"
              className="w-20 text-right"
              value={t.target_pct || ""}
              onChange={(e) =>
                updateTarget(i, parseFloat(e.target.value) || 0)
              }
            />
            <span className="text-sm text-slate-500">%</span>
            <button
              onClick={() => removeTarget(i)}
              className="text-red-400 hover:text-red-600 text-xs"
            >
              &times;
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={addTarget}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          + Add Class
        </button>
        <span
          className={`text-sm ${Math.abs(totalPct - 100) > 1 ? "text-red-500 font-medium" : "text-slate-500"}`}
        >
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
                          a.action === "sell"
                            ? "bg-red-100 text-red-700"
                            : "bg-green-100 text-green-700"
                        }`}
                      >
                        {a.action.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 text-slate-600">{a.account_name}</td>
                    <td className="py-2 font-mono">{a.ticker}</td>
                    <td className="py-2 text-slate-500">
                      {ASSET_CLASS_LABELS[a.asset_class] || a.asset_class}
                    </td>
                    <td className="py-2 text-right font-medium">
                      {fmt(a.dollar_amount)}
                      {a.shares > 0 && (
                        <span className="text-xs text-slate-400 ml-1">
                          ({a.shares.toFixed(2)} sh)
                        </span>
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

// ─── Main Page ───────────────────────────────────────────────

export function HoldingsPage() {
  const [holdings, setHoldings] = useState<HoldingsFile | null>(null);
  const [allocation, setAllocation] = useState<Record<string, number>>({});
  const [accounts, setAccounts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load holdings + account list
  useEffect(() => {
    Promise.all([holdingsApi.get(), assetsApi.get()]).then(
      ([h, a]) => {
        setHoldings(h);
        setAccounts(
          a.assets
            .filter((asset: Asset) => INVESTMENT_ACCOUNT_TYPES.has(asset.type))
            .map((asset: Asset) => asset.name)
        );
        // Compute allocation from loaded data
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
        setLoading(false);
      },
      () => setLoading(false)
    );
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const updated = await holdingsApi.refresh();
      setHoldings(updated);
      setDirty(false);
      // Recompute allocation
      const alloc: Record<string, number> = {};
      let total = 0;
      for (const acct of updated.accounts) {
        for (const hold of acct.holdings) {
          const cls = hold.asset_class || "unclassified";
          alloc[cls] = (alloc[cls] || 0) + hold.market_value;
          total += hold.market_value;
        }
      }
      if (total > 0) {
        for (const cls of Object.keys(alloc)) {
          alloc[cls] = Math.round((alloc[cls] / total) * 10000) / 100;
        }
      }
      setAllocation(alloc);
    } finally {
      setRefreshing(false);
    }
  };

  const save = async () => {
    if (!holdings) return;
    setSaving(true);
    try {
      await holdingsApi.put(holdings);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const addAccountHoldings = (accountName: string) => {
    setHoldings((prev) => {
      if (!prev) return prev;
      if (prev.accounts.some((a) => a.account_name === accountName)) return prev;
      return {
        ...prev,
        accounts: [
          ...prev.accounts,
          { account_name: accountName, holdings: [], total_value: 0, last_refreshed: "" },
        ],
      };
    });
    setDirty(true);
  };

  const addHolding = (accountIndex: number) => {
    setHoldings((prev) => {
      if (!prev) return prev;
      const accounts = [...prev.accounts];
      accounts[accountIndex] = {
        ...accounts[accountIndex],
        holdings: [
          ...accounts[accountIndex].holdings,
          { ticker: "", shares: 0, asset_class: "", tax_lots: [], price: 0, market_value: 0, name: "" },
        ],
      };
      return { ...prev, accounts };
    });
    setDirty(true);
  };

  const removeHolding = (accountIndex: number, holdingIndex: number) => {
    setHoldings((prev) => {
      if (!prev) return prev;
      const accounts = [...prev.accounts];
      accounts[accountIndex] = {
        ...accounts[accountIndex],
        holdings: accounts[accountIndex].holdings.filter((_, i) => i !== holdingIndex),
      };
      return { ...prev, accounts };
    });
    setDirty(true);
  };

  const updateHolding = (
    accountIndex: number,
    holdingIndex: number,
    field: keyof Holding,
    value: unknown
  ) => {
    setHoldings((prev) => {
      if (!prev) return prev;
      const accounts = [...prev.accounts];
      const holdings = [...accounts[accountIndex].holdings];
      holdings[holdingIndex] = { ...holdings[holdingIndex], [field]: value };
      // Recompute market value when shares or price change
      if (field === "shares" || field === "price") {
        const h = holdings[holdingIndex];
        holdings[holdingIndex].market_value = Math.round(h.shares * h.price * 100) / 100;
      }
      accounts[accountIndex] = { ...accounts[accountIndex], holdings };
      return { ...prev, accounts };
    });
    setDirty(true);
  };

  if (loading) return <div className="text-slate-400">Loading...</div>;
  if (!holdings) return <div className="text-red-500">Failed to load holdings</div>;

  // Accounts from assets.yaml that don't have holdings yet
  const unmappedAccounts = accounts.filter(
    (name) => !holdings.accounts.some((a) => a.account_name === name)
  );

  const totalValue = holdings.accounts.reduce((s, a) => s + a.total_value, 0);

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Portfolio Holdings</h2>
          {totalValue > 0 && (
            <p className="text-slate-500 text-sm mt-1">
              Total: {fmt(totalValue)}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={refresh}
            disabled={refreshing}
            className="px-4 py-2 rounded-md text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            {refreshing ? "Refreshing..." : "Refresh Prices"}
          </button>
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              dirty
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }`}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <SectionHelp
        summary="Enter your holdings by account. Type a ticker and press Enter to look up the price. Hit Refresh Prices to update all at once."
        details={[
          "Prices are fetched from Yahoo Finance (delayed, end-of-day).",
          "Asset class is auto-detected from the security name but can be overridden.",
          "Refreshing prices also updates account balances on the Assets page.",
        ]}
      />

      <AllocationBar allocation={allocation} />

      {/* Holdings per account */}
      {holdings.accounts.map((account, ai) => (
        <HoldingsTable
          key={account.account_name}
          account={account}
          accountIndex={ai}
          onUpdate={updateHolding}
          onRemoveHolding={removeHolding}
          onAddHolding={addHolding}
        />
      ))}

      {/* Add accounts that don't have holdings yet */}
      {unmappedAccounts.length > 0 && (
        <div className="mb-8">
          <h4 className="text-sm font-medium text-slate-500 mb-2">
            Add holdings for:
          </h4>
          <div className="flex flex-wrap gap-2">
            {unmappedAccounts.map((name) => (
              <button
                key={name}
                onClick={() => addAccountHoldings(name)}
                className="px-3 py-1.5 rounded-md text-sm bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                + {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Rebalance calculator */}
      {Object.keys(allocation).length > 0 && (
        <RebalanceSection allocation={allocation} />
      )}
    </div>
  );
}
