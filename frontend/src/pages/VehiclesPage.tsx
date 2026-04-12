import { useEffect, useState } from "react";
import { useProfile, useUpdateProfile } from "../hooks/useProfile";
import { useAutoSave } from "../hooks/useAutoSave";
import { FormField, Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import type { Profile, ExistingVehicle, VehiclePurchase } from "../types/profile";

const EMPTY_EXISTING_VEHICLE: ExistingVehicle = {
  name: "",
  current_value: 0,
  depreciation_pct: 15,
  loan_balance: 0,
  loan_rate_pct: 6.0,
  monthly_payment: 0,
  loan_remaining_months: 0,
};

const EMPTY_VEHICLE_PURCHASE: VehiclePurchase = {
  name: "",
  year: new Date().getFullYear() + 2,
  purchase_price: 0,
  financed: false,
  down_payment_pct: 20,
  loan_rate_pct: 6.0,
  loan_term_years: 5,
  trade_in_value: 0,
};

export function VehiclesPage() {
  const { data: profile, isLoading, error } = useProfile();
  const updateProfile = useUpdateProfile();
  const [local, setLocal] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);

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

  const existingVehicles = local.existing_vehicles ?? [];
  const plannedVehicles = local.vehicles ?? [];

  const totalVehicleValue = existingVehicles.reduce((sum, v) => sum + v.current_value, 0);
  const totalVehicleLoans = existingVehicles.reduce((sum, v) => sum + v.loan_balance, 0);

  // ─── Existing Vehicle helpers ────────────────────────────────────

  const addExistingVehicle = () => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, existing_vehicles: [...(prev.existing_vehicles ?? []), { ...EMPTY_EXISTING_VEHICLE }] };
    });
    setDirty(true);
  };

  const updateExistingVehicle = (index: number, field: string, value: string | number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const vehicles = [...(prev.existing_vehicles ?? [])];
      vehicles[index] = { ...vehicles[index], [field]: value };
      return { ...prev, existing_vehicles: vehicles };
    });
    setDirty(true);
  };

  const removeExistingVehicle = (index: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, existing_vehicles: (prev.existing_vehicles ?? []).filter((_, i) => i !== index) };
    });
    setDirty(true);
  };

  // ─── Planned Vehicle helpers ─────────────────────────────────────

  const addPlannedVehicle = () => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, vehicles: [...(prev.vehicles ?? []), { ...EMPTY_VEHICLE_PURCHASE }] };
    });
    setDirty(true);
  };

  const updatePlannedVehicle = (index: number, field: string, value: string | number | boolean) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const vehicles = [...(prev.vehicles ?? [])];
      vehicles[index] = { ...vehicles[index], [field]: value };
      return { ...prev, vehicles };
    });
    setDirty(true);
  };

  const removePlannedVehicle = (index: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, vehicles: (prev.vehicles ?? []).filter((_, i) => i !== index) };
    });
    setDirty(true);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Vehicles</h2>
          <p className="text-slate-500 text-sm mt-1">
            Total Value: ${totalVehicleValue.toLocaleString()}
            {totalVehicleLoans > 0 && <> · Total Loans: ${totalVehicleLoans.toLocaleString()}</>}
          </p>
        </div>
        {saveStatus && <span className="text-xs text-slate-400">{saveStatus}</span>}
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
          {existingVehicles.map((v, i) => (
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
              </div>
              <div className="mt-3 border-t border-slate-200 pt-3">
                <label className="flex items-center gap-2 text-sm text-slate-600 mb-3">
                  <input
                    type="checkbox"
                    checked={v.loan_balance > 0 || v.monthly_payment > 0}
                    onChange={(e) => {
                      if (!e.target.checked) {
                        updateExistingVehicle(i, "loan_balance", 0);
                        updateExistingVehicle(i, "monthly_payment", 0);
                        updateExistingVehicle(i, "loan_remaining_months", 0);
                      } else {
                        // Set a placeholder so fields appear
                        updateExistingVehicle(i, "loan_remaining_months", 60);
                      }
                    }}
                    className="rounded border-slate-300"
                  />
                  Has loan
                </label>
                {(v.loan_balance > 0 || v.monthly_payment > 0 || v.loan_remaining_months > 0) && (
                  <div className="grid grid-cols-4 gap-3">
                    <FormField label="Loan Balance">
                      <Input type="number" value={v.loan_balance} onChange={(e) => updateExistingVehicle(i, "loan_balance", parseFloat(e.target.value) || 0)} />
                    </FormField>
                    <FormField label="Loan Rate %">
                      <Input type="number" step="0.1" value={v.loan_rate_pct} onChange={(e) => updateExistingVehicle(i, "loan_rate_pct", parseFloat(e.target.value) || 0)} />
                    </FormField>
                    <FormField label="Monthly Payment">
                      <Input type="number" value={v.monthly_payment} onChange={(e) => updateExistingVehicle(i, "monthly_payment", parseFloat(e.target.value) || 0)} />
                    </FormField>
                    <FormField label="Months Remaining">
                      <Input type="number" value={v.loan_remaining_months} onChange={(e) => updateExistingVehicle(i, "loan_remaining_months", parseInt(e.target.value) || 0)} />
                    </FormField>
                  </div>
                )}
              </div>
            </div>
          ))}
          {existingVehicles.length === 0 && (
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
          {plannedVehicles.map((v, i) => (
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
          {plannedVehicles.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-4">No planned purchases</div>
          )}
        </div>
      </div>
    </div>
  );
}
