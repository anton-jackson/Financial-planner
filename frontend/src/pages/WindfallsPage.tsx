import { useEffect, useState } from "react";
import { useProfile, useUpdateProfile } from "../hooks/useProfile";
import { useAutoSave } from "../hooks/useAutoSave";
import { FormField, Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import type { Profile, Windfall } from "../types/profile";

const EMPTY_WINDFALL: Windfall = {
  name: "",
  year: new Date().getFullYear() + 5,
  amount: 0,
  taxable: false,
  tax_rate_override: null,
  recurring: false,
  end_year: null,
  notes: "",
};

export function WindfallsPage() {
  const { data: profile, isLoading, error } = useProfile();
  const updateProfile = useUpdateProfile();
  const [local, setLocal] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profile && !dirty) setLocal(profile);
  }, [profile]);

  const save = () => {
    if (local) updateProfile.mutate(local, { onSuccess: () => setDirty(false) });
  };
  const { status: saveStatus } = useAutoSave(save, dirty, updateProfile.isPending);

  if (isLoading) return <div className="text-slate-400">Loading...</div>;
  if (error) return <div className="text-red-500">Error loading profile</div>;
  if (!local) return null;

  const windfalls = local.windfalls ?? [];

  const addWindfall = () => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, windfalls: [...(prev.windfalls ?? []), { ...EMPTY_WINDFALL }] };
    });
    setDirty(true);
  };

  const updateWindfall = (index: number, field: string, value: string | number | boolean | null) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const updated = [...(prev.windfalls ?? [])];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, windfalls: updated };
    });
    setDirty(true);
  };

  const removeWindfall = (index: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, windfalls: (prev.windfalls ?? []).filter((_, i) => i !== index) };
    });
    setDirty(true);
  };

  const totalOneTime = windfalls
    .filter((w) => !w.recurring)
    .reduce((sum, w) => sum + w.amount, 0);
  const totalRecurring = windfalls
    .filter((w) => w.recurring)
    .reduce((sum, w) => sum + w.amount, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Windfalls & Inheritances</h2>
          <p className="text-sm text-slate-500 mt-1">
            Known future cash events that apply to every simulation.
          </p>
        </div>
        {saveStatus && <span className="text-xs text-slate-400">{saveStatus}</span>}
      </div>

      {/* Summary */}
      {windfalls.length > 0 && (
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500">One-Time Total</div>
            <div className={`text-xl font-semibold ${totalOneTime >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              ${Math.abs(totalOneTime).toLocaleString()}
              {totalOneTime < 0 && <span className="text-sm font-normal"> outflow</span>}
            </div>
          </div>
          <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="text-xs text-slate-500">Recurring Annual</div>
            <div className={`text-xl font-semibold ${totalRecurring >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              ${Math.abs(totalRecurring).toLocaleString()}/yr
              {totalRecurring < 0 && <span className="text-sm font-normal"> outflow</span>}
            </div>
          </div>
        </div>
      )}

      {/* Windfall list */}
      <div className="bg-white rounded-lg border border-slate-200 p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Events</h3>
          <button
            onClick={addWindfall}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 transition-colors"
          >
            + Add
          </button>
        </div>
        <SectionHelp
          summary="Permanent cash events included in every simulation — baseline and all scenarios. Use scenario life events for scenario-specific events."
          details={[
            "Positive amounts add to your liquid portfolio; negative amounts subtract from it.",
            "Taxable events are reduced by your effective tax rate (or a custom rate override).",
            "Recurring events repeat annually from the start year through the end year.",
            "Unlike scenario life events, these are always active regardless of which scenario you run.",
          ]}
        />

        <div className="flex flex-col gap-4 mt-4">
          {windfalls.map((w, i) => (
            <div key={i} className="bg-slate-50 rounded-lg border border-slate-200 p-4">
              <div className="flex justify-between items-center mb-3">
                <h4 className="text-sm font-medium text-slate-600">
                  {w.name || `Event ${i + 1}`}
                  {w.recurring && (
                    <span className="ml-2 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">
                      recurring
                    </span>
                  )}
                </h4>
                <button
                  onClick={() => removeWindfall(i)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <FormField label="Name">
                  <Input
                    value={w.name}
                    onChange={(e) => updateWindfall(i, "name", e.target.value)}
                    placeholder="Mom's estate, stock options, etc."
                  />
                </FormField>
                <FormField label="Amount" hint={w.amount >= 0 ? "Inflow" : "Outflow"}>
                  <Input
                    type="number"
                    value={w.amount}
                    onChange={(e) => updateWindfall(i, "amount", parseFloat(e.target.value) || 0)}
                  />
                </FormField>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <FormField label={w.recurring ? "Start Year" : "Year"}>
                  <Input
                    type="number"
                    value={w.year}
                    onChange={(e) => updateWindfall(i, "year", parseInt(e.target.value) || 2030)}
                  />
                </FormField>
                {w.recurring && (
                  <FormField label="End Year" hint="Leave empty for indefinite">
                    <Input
                      type="number"
                      value={w.end_year ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value) : null;
                        updateWindfall(i, "end_year", val);
                      }}
                      placeholder="End of horizon"
                    />
                  </FormField>
                )}
              </div>

              <div className="flex flex-wrap gap-4 mb-3">
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={w.recurring}
                    onChange={(e) => updateWindfall(i, "recurring", e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Recurring annually
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={w.taxable}
                    onChange={(e) => updateWindfall(i, "taxable", e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Taxable
                </label>
                {w.taxable && (
                  <FormField label="Tax Rate Override %" hint="Leave empty for auto">
                    <Input
                      type="number"
                      step="0.1"
                      value={w.tax_rate_override ?? ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseFloat(e.target.value) : null;
                        updateWindfall(i, "tax_rate_override", val);
                      }}
                      placeholder="Auto"
                      className="w-24"
                    />
                  </FormField>
                )}
              </div>

              <FormField label="Notes" hint="Optional context for your reference">
                <Input
                  value={w.notes}
                  onChange={(e) => updateWindfall(i, "notes", e.target.value)}
                  placeholder="Details, conditions, etc."
                />
              </FormField>
            </div>
          ))}

          {windfalls.length === 0 && (
            <div className="text-sm text-slate-400 text-center py-8">
              No windfalls or inheritances configured. Click "+ Add" to add one.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
