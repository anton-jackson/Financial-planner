import { useEffect, useState } from "react";
import { useAssets, useUpdateAssets } from "../hooks/useAssets";
import { useProfile, useUpdateProfile } from "../hooks/useProfile";
import { FormField, Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import type { Asset, AssetsFile } from "../types/assets";
import type { Profile, ExistingVehicle, VehiclePurchase, HELOC } from "../types/profile";

// ─── Account Assets ───────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  traditional_401k: "Traditional 401k",
  roth_401k: "Roth 401k",
  traditional_ira: "Traditional IRA",
  roth_ira: "Roth IRA",
  hsa: "HSA",
  taxable_brokerage: "Taxable Brokerage",
  "529": "529 Plan",
  real_estate: "Real Estate",
  crypto: "Crypto",
  other: "Other",
};

function AssetCard({
  asset,
  index,
  onChange,
  onPropertyChange,
  onRemove,
}: {
  asset: Asset;
  index: number;
  onChange: (index: number, field: string, value: string | number) => void;
  onPropertyChange: (index: number, prop: string, value: string | number | boolean) => void;
  onRemove: (index: number) => void;
}) {
  const isRealEstate = asset.type === "real_estate";
  const props = asset.properties;
  const equity = isRealEstate ? asset.balance - ((props.mortgage_balance as number) ?? 0) : 0;

  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-medium text-slate-600">{asset.name}</h4>
        <div className="flex items-center gap-2">
          <select
            className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full border-none"
            value={asset.type}
            onChange={(e) => onChange(index, "type", e.target.value)}
          >
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button onClick={() => onRemove(index)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Name">
          <Input value={asset.name} onChange={(e) => onChange(index, "name", e.target.value)} />
        </FormField>
        <FormField label={isRealEstate ? "Property Value" : "Balance"}>
          <Input type="number" value={asset.balance} onChange={(e) => onChange(index, "balance", parseFloat(e.target.value) || 0)} />
        </FormField>
      </div>
      {isRealEstate && (
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
          <FormField label="Mortgage Balance">
            <Input type="number" value={(props.mortgage_balance as number) ?? 0} onChange={(e) => onPropertyChange(index, "mortgage_balance", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Mortgage Rate %">
            <Input type="number" step="0.01" value={(props.mortgage_rate_pct as number) ?? 0} onChange={(e) => onPropertyChange(index, "mortgage_rate_pct", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Monthly P&I">
            <Input type="number" value={(props.monthly_payment as number) ?? 0} onChange={(e) => onPropertyChange(index, "monthly_payment", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Mortgage End Date">
            <Input type="month" value={(props.mortgage_end_date as string) ?? ""} onChange={(e) => onPropertyChange(index, "mortgage_end_date", e.target.value)} />
          </FormField>
          <FormField label="Equity" hint="Value minus mortgage">
            <div className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium">${Math.round(equity).toLocaleString()}</div>
          </FormField>
          <FormField label="Annual Property Tax">
            <Input type="number" value={(props.annual_property_tax as number) ?? 0} onChange={(e) => onPropertyChange(index, "annual_property_tax", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Annual Insurance">
            <Input type="number" value={(props.annual_insurance as number) ?? 0} onChange={(e) => onPropertyChange(index, "annual_insurance", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Annual Carrying Cost" hint="Maint, HOA, utilities">
            <Input type="number" value={(props.annual_carrying_cost as number) ?? 0} onChange={(e) => onPropertyChange(index, "annual_carrying_cost", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Appreciation %" hint="0 = use scenario default">
            <Input type="number" step="0.1" value={(props.appreciation_rate_pct as number) ?? 0} onChange={(e) => onPropertyChange(index, "appreciation_rate_pct", parseFloat(e.target.value) || 0)} />
          </FormField>
          <FormField label="Rental Property">
            <select className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" value={props.is_rental ? "yes" : "no"} onChange={(e) => onPropertyChange(index, "is_rental", e.target.value === "yes")}>
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </FormField>
          {props.is_rental && (
            <FormField label="Monthly Rent">
              <Input type="number" value={(props.monthly_rent as number) ?? 0} onChange={(e) => onPropertyChange(index, "monthly_rent", parseFloat(e.target.value) || 0)} />
            </FormField>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────

export function AssetsPage() {
  const { data: assetsData, isLoading: assetsLoading, error: assetsError } = useAssets();
  const updateAssets = useUpdateAssets();
  const { data: profileData, isLoading: profileLoading, error: profileError } = useProfile();
  const updateProfile = useUpdateProfile();

  const [localAssets, setLocalAssets] = useState<AssetsFile | null>(null);
  const [localProfile, setLocalProfile] = useState<Profile | null>(null);
  const [assetsDirty, setAssetsDirty] = useState(false);
  const [profileDirty, setProfileDirty] = useState(false);

  useEffect(() => { if (assetsData) setLocalAssets(assetsData); }, [assetsData]);
  useEffect(() => { if (profileData) setLocalProfile(profileData); }, [profileData]);

  const isLoading = assetsLoading || profileLoading;
  const error = assetsError || profileError;

  if (isLoading) return <div className="text-slate-400">Loading...</div>;
  if (error) return <div className="text-red-500">Error loading data</div>;
  if (!localAssets || !localProfile) return null;

  const dirty = assetsDirty || profileDirty;
  const saving = updateAssets.isPending || updateProfile.isPending;

  const save = () => {
    if (assetsDirty) updateAssets.mutate(localAssets, { onSuccess: () => setAssetsDirty(false) });
    if (profileDirty) updateProfile.mutate(localProfile, { onSuccess: () => setProfileDirty(false) });
  };

  const totalBalance = localAssets.assets.reduce((sum, a) => sum + a.balance, 0);
  const totalVehicleValue = (localProfile.existing_vehicles ?? []).reduce((sum, v) => sum + v.current_value, 0);
  const totalVehicleLoans = (localProfile.existing_vehicles ?? []).reduce((sum, v) => sum + v.loan_balance, 0);
  const totalHELOC = (localProfile.helocs ?? []).reduce((sum, h) => sum + h.balance, 0);

  const onAssetChange = (index: number, field: string, value: string | number) => {
    setLocalAssets((prev) => {
      if (!prev) return prev;
      const assets = [...prev.assets];
      assets[index] = { ...assets[index], [field]: value };
      return { ...prev, assets };
    });
    setAssetsDirty(true);
  };

  const onPropertyChange = (index: number, prop: string, value: string | number | boolean) => {
    setLocalAssets((prev) => {
      if (!prev) return prev;
      const assets = [...prev.assets];
      assets[index] = { ...assets[index], properties: { ...assets[index].properties, [prop]: value } };
      return { ...prev, assets };
    });
    setAssetsDirty(true);
  };

  const addAsset = (type: string) => {
    const defaultNames: Record<string, string> = {
      traditional_401k: "Traditional 401k",
      roth_401k: "Roth 401k",
      traditional_ira: "Traditional IRA",
      roth_ira: "Roth IRA",
      hsa: "HSA",
      taxable_brokerage: "Taxable Brokerage",
      "529": "529 Plan",
      real_estate: "Real Estate",
      crypto: "Crypto",
      other: "Other",
    };
    const newAsset: Asset = {
      name: defaultNames[type] ?? type,
      type,
      balance: 0,
      return_profile: type === "real_estate" ? "real_estate" : "stocks_bonds",
      properties: type === "real_estate" ? {
        mortgage_balance: 0, mortgage_rate_pct: 0, monthly_payment: 0,
        mortgage_end_date: "", annual_property_tax: 0, annual_insurance: 0,
        annual_carrying_cost: 0, appreciation_rate_pct: 3, is_rental: false,
      } : {},
    };
    setLocalAssets((prev) => {
      if (!prev) return prev;
      return { ...prev, assets: [...prev.assets, newAsset] };
    });
    setAssetsDirty(true);
  };

  const removeAsset = (index: number) => {
    setLocalAssets((prev) => {
      if (!prev) return prev;
      return { ...prev, assets: prev.assets.filter((_, i) => i !== index) };
    });
    setAssetsDirty(true);
  };

  // Vehicle helpers
  const addExistingVehicle = () => {
    setLocalProfile((prev) => {
      if (!prev) return prev;
      const nv: ExistingVehicle = { name: "", current_value: 0, depreciation_pct: 15, loan_balance: 0, loan_rate_pct: 6.0, monthly_payment: 0, loan_remaining_months: 0 };
      return { ...prev, existing_vehicles: [...(prev.existing_vehicles ?? []), nv] };
    });
    setProfileDirty(true);
  };

  const updateExistingVehicle = (index: number, field: string, value: string | number) => {
    setLocalProfile((prev) => {
      if (!prev) return prev;
      const vehicles = [...(prev.existing_vehicles ?? [])];
      vehicles[index] = { ...vehicles[index], [field]: value };
      return { ...prev, existing_vehicles: vehicles };
    });
    setProfileDirty(true);
  };

  const removeExistingVehicle = (index: number) => {
    setLocalProfile((prev) => {
      if (!prev) return prev;
      return { ...prev, existing_vehicles: (prev.existing_vehicles ?? []).filter((_, i) => i !== index) };
    });
    setProfileDirty(true);
  };

  const addPlannedVehicle = () => {
    setLocalProfile((prev) => {
      if (!prev) return prev;
      const nv: VehiclePurchase = { name: "", year: new Date().getFullYear() + 2, purchase_price: 0, financed: false, down_payment_pct: 20, loan_rate_pct: 6.0, loan_term_years: 5, trade_in_value: 0 };
      return { ...prev, vehicles: [...(prev.vehicles ?? []), nv] };
    });
    setProfileDirty(true);
  };

  const updatePlannedVehicle = (index: number, field: string, value: string | number | boolean) => {
    setLocalProfile((prev) => {
      if (!prev) return prev;
      const vehicles = [...(prev.vehicles ?? [])];
      vehicles[index] = { ...vehicles[index], [field]: value };
      return { ...prev, vehicles };
    });
    setProfileDirty(true);
  };

  const removePlannedVehicle = (index: number) => {
    setLocalProfile((prev) => {
      if (!prev) return prev;
      return { ...prev, vehicles: (prev.vehicles ?? []).filter((_, i) => i !== index) };
    });
    setProfileDirty(true);
  };

  // HELOC helpers
  const addHELOC = () => {
    setLocalProfile((prev) => {
      if (!prev) return prev;
      const nh: HELOC = { name: "", balance: 0, credit_limit: 0, interest_rate_pct: 8.5, monthly_payment: 0, interest_only: false, payoff_year: null };
      return { ...prev, helocs: [...(prev.helocs ?? []), nh] };
    });
    setProfileDirty(true);
  };

  const updateHELOC = (index: number, field: string, value: string | number | boolean | null) => {
    setLocalProfile((prev) => {
      if (!prev) return prev;
      const helocs = [...(prev.helocs ?? [])];
      helocs[index] = { ...helocs[index], [field]: value };
      return { ...prev, helocs };
    });
    setProfileDirty(true);
  };

  const removeHELOC = (index: number) => {
    setLocalProfile((prev) => {
      if (!prev) return prev;
      return { ...prev, helocs: (prev.helocs ?? []).filter((_, i) => i !== index) };
    });
    setProfileDirty(true);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Assets & Liabilities</h2>
          <p className="text-slate-500 text-sm mt-1">
            Accounts: ${totalBalance.toLocaleString()}
            {totalVehicleValue > 0 && <> · Vehicles: ${totalVehicleValue.toLocaleString()}</>}
            {(totalVehicleLoans + totalHELOC) > 0 && <> · Debt: ${(totalVehicleLoans + totalHELOC).toLocaleString()}</>}
          </p>
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${dirty ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Accounts */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Accounts</h3>
          <div className="relative group">
            <button className="text-sm text-blue-600 hover:text-blue-800">+ Add Account</button>
            <div className="hidden group-hover:block absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-10 w-48">
              {Object.entries(TYPE_LABELS).map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => addAsset(type)}
                  className="block w-full text-left px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <SectionHelp
          summary="Investment accounts and property. Add as many accounts as you have — multiple 401k's, IRAs, brokerage accounts, etc."
          details={[
            "Liquid portfolio = sum of all non-real-estate balances. Returns based on the scenario's stock/bond/cash allocation.",
            "Real estate appreciates separately. Mortgage is amortized monthly. Equity = value - mortgage.",
            "Crypto accounts can hold individual coins — enter holdings on the Portfolio Holdings page.",
          ]}
        />
        <div className="flex flex-col gap-4">
          {localAssets.assets.map((asset, i) => (
            <AssetCard key={i} asset={asset} index={i} onChange={onAssetChange} onPropertyChange={onPropertyChange} onRemove={removeAsset} />
          ))}
          {localAssets.assets.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-4">No accounts — add one above</div>
          )}
        </div>
      </div>

      {/* Current Vehicles */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Current Vehicles</h3>
          <button onClick={addExistingVehicle} className="text-sm text-blue-600 hover:text-blue-800">+ Add Vehicle</button>
        </div>
        <SectionHelp
          summary="Vehicles you currently own. Value depreciates annually. Loan payments are deducted from cash flow."
          details={[
            "Depreciation: value drops by the rate each year (15% typical).",
            "Vehicle equity (value minus loan) is included in net worth.",
            "Set loan balance and payment to 0 if owned outright.",
          ]}
        />
        <div className="flex flex-col gap-4">
          {(localProfile.existing_vehicles ?? []).map((v, i) => (
            <div key={i} className="bg-slate-50 rounded-lg border border-slate-200 p-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-medium text-slate-600">{v.name || `Vehicle ${i + 1}`}</h4>
                <button onClick={() => removeExistingVehicle(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Name">
                  <Input value={v.name} onChange={(e) => updateExistingVehicle(i, "name", e.target.value)} />
                </FormField>
                <FormField label="Current Value">
                  <Input type="number" value={v.current_value} onChange={(e) => updateExistingVehicle(i, "current_value", parseFloat(e.target.value) || 0)} />
                </FormField>
                <FormField label="Depreciation %/yr">
                  <Input type="number" step="1" value={v.depreciation_pct} onChange={(e) => updateExistingVehicle(i, "depreciation_pct", parseFloat(e.target.value) || 0)} />
                </FormField>
                <FormField label="Loan Balance" help="0 if owned outright">
                  <Input type="number" value={v.loan_balance} onChange={(e) => updateExistingVehicle(i, "loan_balance", parseFloat(e.target.value) || 0)} />
                </FormField>
                {v.loan_balance > 0 && (
                  <>
                    <FormField label="Loan Rate %">
                      <Input type="number" step="0.1" value={v.loan_rate_pct} onChange={(e) => updateExistingVehicle(i, "loan_rate_pct", parseFloat(e.target.value) || 0)} />
                    </FormField>
                    <FormField label="Monthly Payment">
                      <Input type="number" value={v.monthly_payment} onChange={(e) => updateExistingVehicle(i, "monthly_payment", parseFloat(e.target.value) || 0)} />
                    </FormField>
                    <FormField label="Months Remaining">
                      <Input type="number" value={v.loan_remaining_months} onChange={(e) => updateExistingVehicle(i, "loan_remaining_months", parseInt(e.target.value) || 0)} />
                    </FormField>
                  </>
                )}
              </div>
            </div>
          ))}
          {(localProfile.existing_vehicles ?? []).length === 0 && (
            <div className="text-sm text-slate-400 text-center py-4">No current vehicles</div>
          )}
        </div>
      </div>

      {/* Planned Vehicle Purchases */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Planned Vehicle Purchases</h3>
          <button onClick={addPlannedVehicle} className="text-sm text-blue-600 hover:text-blue-800">+ Add Purchase</button>
        </div>
        <SectionHelp
          summary="Future car purchases. Cost is deducted from portfolio in the purchase year. Financed purchases create an auto loan."
          details={[
            "Cash: full price minus trade-in deducted from liquid portfolio.",
            "Financed: down payment from portfolio, remainder becomes an auto loan.",
            "Prices are in today's dollars, inflated to the purchase year.",
          ]}
        />
        <div className="flex flex-col gap-4">
          {(localProfile.vehicles ?? []).map((v, i) => (
            <div key={i} className="bg-slate-50 rounded-lg border border-slate-200 p-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-medium text-slate-600">{v.name || `Purchase ${i + 1}`}</h4>
                <button onClick={() => removePlannedVehicle(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Name">
                  <Input value={v.name} onChange={(e) => updatePlannedVehicle(i, "name", e.target.value)} />
                </FormField>
                <FormField label="Year">
                  <Input type="number" value={v.year} onChange={(e) => updatePlannedVehicle(i, "year", parseInt(e.target.value) || 0)} />
                </FormField>
                <FormField label="Purchase Price">
                  <Input type="number" value={v.purchase_price} onChange={(e) => updatePlannedVehicle(i, "purchase_price", parseFloat(e.target.value) || 0)} />
                </FormField>
                <FormField label="Trade-In Value">
                  <Input type="number" value={v.trade_in_value} onChange={(e) => updatePlannedVehicle(i, "trade_in_value", parseFloat(e.target.value) || 0)} />
                </FormField>
                <FormField label="Payment">
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" value={v.financed ? "financed" : "cash"} onChange={(e) => updatePlannedVehicle(i, "financed", e.target.value === "financed")}>
                    <option value="cash">Cash</option>
                    <option value="financed">Financed</option>
                  </select>
                </FormField>
                {v.financed && (
                  <>
                    <FormField label="Down Payment %">
                      <Input type="number" step="1" value={v.down_payment_pct} onChange={(e) => updatePlannedVehicle(i, "down_payment_pct", parseFloat(e.target.value) || 0)} />
                    </FormField>
                    <FormField label="Loan Rate %">
                      <Input type="number" step="0.1" value={v.loan_rate_pct} onChange={(e) => updatePlannedVehicle(i, "loan_rate_pct", parseFloat(e.target.value) || 0)} />
                    </FormField>
                    <FormField label="Loan Term (years)">
                      <Input type="number" value={v.loan_term_years} onChange={(e) => updatePlannedVehicle(i, "loan_term_years", parseInt(e.target.value) || 0)} />
                    </FormField>
                  </>
                )}
              </div>
            </div>
          ))}
          {(localProfile.vehicles ?? []).length === 0 && (
            <div className="text-sm text-slate-400 text-center py-4">No planned purchases</div>
          )}
        </div>
      </div>

      {/* HELOCs */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">HELOCs</h3>
          <button onClick={addHELOC} className="text-sm text-blue-600 hover:text-blue-800">+ Add HELOC</button>
        </div>
        <SectionHelp
          summary="Home equity lines of credit. Payments are deducted from cash flow. Outstanding balance is subtracted from net worth."
          details={[
            "Interest-only: pay just the interest each year, balance stays flat until payoff year.",
            "Amortizing: monthly payment covers interest + principal.",
            "Payoff year: remaining balance paid in full that year.",
          ]}
        />
        <div className="flex flex-col gap-4">
          {(localProfile.helocs ?? []).map((h, i) => (
            <div key={i} className="bg-slate-50 rounded-lg border border-slate-200 p-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-medium text-slate-600">{h.name || `HELOC ${i + 1}`}</h4>
                <button onClick={() => removeHELOC(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Name">
                  <Input value={h.name} onChange={(e) => updateHELOC(i, "name", e.target.value)} />
                </FormField>
                <FormField label="Current Balance">
                  <Input type="number" value={h.balance} onChange={(e) => updateHELOC(i, "balance", parseFloat(e.target.value) || 0)} />
                </FormField>
                <FormField label="Credit Limit">
                  <Input type="number" value={h.credit_limit} onChange={(e) => updateHELOC(i, "credit_limit", parseFloat(e.target.value) || 0)} />
                </FormField>
                <FormField label="Interest Rate %">
                  <Input type="number" step="0.1" value={h.interest_rate_pct} onChange={(e) => updateHELOC(i, "interest_rate_pct", parseFloat(e.target.value) || 0)} />
                </FormField>
                <FormField label="Monthly Payment">
                  <Input type="number" value={h.monthly_payment} onChange={(e) => updateHELOC(i, "monthly_payment", parseFloat(e.target.value) || 0)} />
                </FormField>
                <FormField label="Payment Type">
                  <select className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm" value={h.interest_only ? "interest_only" : "amortizing"} onChange={(e) => updateHELOC(i, "interest_only", e.target.value === "interest_only")}>
                    <option value="amortizing">Amortizing</option>
                    <option value="interest_only">Interest Only</option>
                  </select>
                </FormField>
                <FormField label="Payoff Year" help="Leave empty to pay minimum.">
                  <Input type="number" value={h.payoff_year ?? ""} onChange={(e) => updateHELOC(i, "payoff_year", e.target.value ? parseInt(e.target.value) : null)} />
                </FormField>
              </div>
            </div>
          ))}
          {(localProfile.helocs ?? []).length === 0 && (
            <div className="text-sm text-slate-400 text-center py-4">No HELOCs</div>
          )}
        </div>
      </div>
    </div>
  );
}
