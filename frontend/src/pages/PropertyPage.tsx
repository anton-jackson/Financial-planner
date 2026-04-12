import { useEffect, useState } from "react";
import { useAssets, useUpdateAssets } from "../hooks/useAssets";
import { useAutoSave } from "../hooks/useAutoSave";
import { FormField, Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import type { Asset, AssetsFile } from "../types/assets";

export function PropertyPage() {
  const { data: assetsData, isLoading, error } = useAssets();
  const updateAssets = useUpdateAssets();

  const [localAssets, setLocalAssets] = useState<AssetsFile | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (assetsData) setLocalAssets(assetsData);
  }, [assetsData]);

  const save = () => {
    if (dirty && localAssets) {
      updateAssets.mutate(localAssets, { onSuccess: () => setDirty(false) });
    }
  };
  const { status: saveStatus } = useAutoSave(save, dirty, updateAssets.isPending);

  if (isLoading) return <div className="text-slate-400">Loading...</div>;
  if (error) return <div className="text-red-500">Error loading data</div>;
  if (!localAssets) return null;

  // Build list of real_estate entries with their actual index in the full array
  const properties = localAssets.assets
    .map((asset, index) => ({ asset, index }))
    .filter(({ asset }) => asset.type === "real_estate");

  // Equity summary
  const totalPropertyValue = properties.reduce((sum, { asset }) => sum + asset.balance, 0);
  const totalMortgage = properties.reduce(
    (sum, { asset }) => sum + ((asset.properties.mortgage_balance as number) ?? 0),
    0
  );
  const totalEquity = totalPropertyValue - totalMortgage;

  const onAssetChange = (index: number, field: string, value: string | number) => {
    setLocalAssets((prev) => {
      if (!prev) return prev;
      const assets = [...prev.assets];
      assets[index] = { ...assets[index], [field]: value };
      return { ...prev, assets };
    });
    setDirty(true);
  };

  const onPropertyChange = (index: number, prop: string, value: string | number | boolean) => {
    setLocalAssets((prev) => {
      if (!prev) return prev;
      const assets = [...prev.assets];
      assets[index] = {
        ...assets[index],
        properties: { ...assets[index].properties, [prop]: value },
      };
      return { ...prev, assets };
    });
    setDirty(true);
  };

  const addProperty = () => {
    const newProp: Asset = {
      name: "New Property",
      type: "real_estate",
      balance: 0,
      return_profile: "real_estate",
      owner: "joint",
      properties: {
        mortgage_balance: 0,
        mortgage_rate_pct: 0,
        monthly_payment: 0,
        mortgage_end_date: "",
        annual_property_tax: 0,
        annual_insurance: 0,
        annual_carrying_cost: 0,
        appreciation_rate_pct: 3,
        is_rental: false,
      },
    };
    setLocalAssets((prev) => {
      if (!prev) return prev;
      return { ...prev, assets: [...prev.assets, newProp] };
    });
    setDirty(true);
  };

  const removeProperty = (index: number) => {
    setLocalAssets((prev) => {
      if (!prev) return prev;
      return { ...prev, assets: prev.assets.filter((_, i) => i !== index) };
    });
    setDirty(true);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Properties</h2>
          <p className="text-slate-500 text-sm mt-1">
            Value: ${totalPropertyValue.toLocaleString()} · Mortgages: $
            {totalMortgage.toLocaleString()} · Equity: ${totalEquity.toLocaleString()}
          </p>
        </div>
        {saveStatus && <span className="text-xs text-slate-400">{saveStatus}</span>}
      </div>

      <SectionHelp
        summary="Real estate properties you own. Equity = property value minus mortgage balance. Properties appreciate separately from your portfolio."
        details={[
          "Each property appreciates at its own rate (default 3%). Set to 0 to use the scenario default.",
          "Mortgage is amortized monthly using the rate and P&I payment you enter.",
          "Carrying costs (tax, insurance, maintenance) are deducted from cash flow.",
          "Rental properties generate monthly income that offsets carrying costs.",
        ]}
      />

      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold">Properties</h3>
        <button onClick={addProperty} className="text-sm text-blue-600 hover:text-blue-800">
          + Add Property
        </button>
      </div>

      <div className="flex flex-col gap-4">
        {properties.map(({ asset, index }) => {
          const props = asset.properties;
          const equity = asset.balance - ((props.mortgage_balance as number) ?? 0);

          return (
            <div key={index} className="bg-slate-50 rounded-lg border border-slate-200 p-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-medium text-slate-600">{asset.name}</h4>
                <button
                  onClick={() => removeProperty(index)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Name">
                  <Input
                    value={asset.name}
                    onChange={(e) => onAssetChange(index, "name", e.target.value)}
                  />
                </FormField>
                <FormField label="Property Value">
                  <Input
                    type="number"
                    value={asset.balance}
                    onChange={(e) =>
                      onAssetChange(index, "balance", parseFloat(e.target.value) || 0)
                    }
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-slate-200">
                <FormField label="Mortgage Balance">
                  <Input
                    type="number"
                    value={(props.mortgage_balance as number) ?? 0}
                    onChange={(e) =>
                      onPropertyChange(index, "mortgage_balance", parseFloat(e.target.value) || 0)
                    }
                  />
                </FormField>
                <FormField label="Mortgage Rate %">
                  <Input
                    type="number"
                    step="0.01"
                    value={(props.mortgage_rate_pct as number) ?? 0}
                    onChange={(e) =>
                      onPropertyChange(
                        index,
                        "mortgage_rate_pct",
                        parseFloat(e.target.value) || 0
                      )
                    }
                  />
                </FormField>
                <FormField label="Monthly P&I">
                  <Input
                    type="number"
                    value={(props.monthly_payment as number) ?? 0}
                    onChange={(e) =>
                      onPropertyChange(index, "monthly_payment", parseFloat(e.target.value) || 0)
                    }
                  />
                </FormField>
                <FormField label="Mortgage End Date">
                  <Input
                    type="month"
                    value={(props.mortgage_end_date as string) ?? ""}
                    onChange={(e) =>
                      onPropertyChange(index, "mortgage_end_date", e.target.value)
                    }
                  />
                </FormField>
                <FormField label="Equity" hint="Value minus mortgage">
                  <div className="px-3 py-2 bg-white border border-slate-200 rounded-md text-sm font-medium">
                    ${Math.round(equity).toLocaleString()}
                  </div>
                </FormField>
                <FormField label="Annual Property Tax">
                  <Input
                    type="number"
                    value={(props.annual_property_tax as number) ?? 0}
                    onChange={(e) =>
                      onPropertyChange(
                        index,
                        "annual_property_tax",
                        parseFloat(e.target.value) || 0
                      )
                    }
                  />
                </FormField>
                <FormField label="Annual Insurance">
                  <Input
                    type="number"
                    value={(props.annual_insurance as number) ?? 0}
                    onChange={(e) =>
                      onPropertyChange(index, "annual_insurance", parseFloat(e.target.value) || 0)
                    }
                  />
                </FormField>
                <FormField label="Annual Carrying Cost" hint="Property-driven costs only (maintenance, HOA, landscaping). Exclude utilities — those belong in household expenses.">
                  <Input
                    type="number"
                    value={(props.annual_carrying_cost as number) ?? 0}
                    onChange={(e) =>
                      onPropertyChange(
                        index,
                        "annual_carrying_cost",
                        parseFloat(e.target.value) || 0
                      )
                    }
                  />
                </FormField>
                <FormField label="Appreciation %" hint="0 = use scenario default">
                  <Input
                    type="number"
                    step="0.1"
                    value={(props.appreciation_rate_pct as number) ?? 0}
                    onChange={(e) =>
                      onPropertyChange(
                        index,
                        "appreciation_rate_pct",
                        parseFloat(e.target.value) || 0
                      )
                    }
                  />
                </FormField>
                <FormField label="Rental Property">
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm"
                    value={props.is_rental ? "yes" : "no"}
                    onChange={(e) =>
                      onPropertyChange(index, "is_rental", e.target.value === "yes")
                    }
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </FormField>
                {Boolean(props.is_rental) && (
                  <FormField label="Monthly Rent">
                    <Input
                      type="number"
                      value={(props.monthly_rent as number) ?? 0}
                      onChange={(e) =>
                        onPropertyChange(index, "monthly_rent", parseFloat(e.target.value) || 0)
                      }
                    />
                  </FormField>
                )}
              </div>
            </div>
          );
        })}
        {properties.length === 0 && (
          <div className="text-sm text-slate-400 text-center py-4">
            No properties -- add one above
          </div>
        )}
      </div>
    </div>
  );
}
