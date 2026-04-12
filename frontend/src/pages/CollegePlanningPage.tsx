import { useEffect, useState } from "react";
import { useProfile, useUpdateProfile } from "../hooks/useProfile";
import { useAutoSave } from "../hooks/useAutoSave";
import { FormField, Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import type { Profile, Child, SchoolStage } from "../types/profile";

const EMPTY_STAGE: SchoolStage = {
  name: "",
  annual_tuition: 0,
  start_year: new Date().getFullYear(),
  end_year: new Date().getFullYear() + 4,
};

function CollegeChildCard({
  child,
  index,
  onChange,
  onAddStage,
  onUpdateStage,
  onRemoveStage,
}: {
  child: Child;
  index: number;
  onChange: (index: number, field: string, value: string | number) => void;
  onAddStage: (childIndex: number) => void;
  onUpdateStage: (childIndex: number, stageIndex: number, field: string, value: string | number) => void;
  onRemoveStage: (childIndex: number, stageIndex: number) => void;
}) {
  const age = new Date().getFullYear() - child.birth_year;
  const collegeEnd = child.college_start_year + child.college_years;
  const stages = child.school_stages ?? [];

  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-medium text-slate-600">
          {child.name} <span className="text-slate-400">(age {age})</span>
        </h4>
        <span className="text-xs text-slate-400">
          College: {child.college_start_year} - {collegeEnd}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <FormField label="College Start Year">
          <Input type="number" value={child.college_start_year} onChange={(e) => onChange(index, "college_start_year", parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="College Years">
          <Input type="number" value={child.college_years} onChange={(e) => onChange(index, "college_years", parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="529 Balance">
          <Input type="number" value={child.plan_529_balance} onChange={(e) => onChange(index, "plan_529_balance", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Monthly 529 Contribution">
          <Input type="number" value={child.plan_529_monthly_contribution} onChange={(e) => onChange(index, "plan_529_monthly_contribution", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Parent College $/yr" hint="Cap on annual parent contribution (today's $). 529 draws first.">
          <Input type="number" value={child.parent_college_annual ?? 0} onChange={(e) => onChange(index, "parent_college_annual", parseFloat(e.target.value) || 0)} />
        </FormField>
      </div>

      {/* School Stages */}
      <div className="border-t border-slate-200 pt-3">
        <div className="flex justify-between items-center mb-2">
          <h5 className="text-sm font-medium text-slate-600">Pre-College Education</h5>
          <button
            onClick={() => onAddStage(index)}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            + Add School Stage
          </button>
        </div>
        {stages.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-2 border border-dashed border-slate-200 rounded-md">
            No pre-college tuition — add a stage for private/prep school
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {stages.map((stage, si) => (
              <div key={si} className="bg-white rounded border border-slate-200 p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-medium text-slate-500">{stage.name || `Stage ${si + 1}`}</span>
                  <button onClick={() => onRemoveStage(index, si)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  <FormField label="Name">
                    <Input value={stage.name} placeholder="e.g. Middle School" onChange={(e) => onUpdateStage(index, si, "name", e.target.value)} />
                  </FormField>
                  <FormField label="Annual Tuition">
                    <Input type="number" value={stage.annual_tuition} onChange={(e) => onUpdateStage(index, si, "annual_tuition", parseFloat(e.target.value) || 0)} />
                  </FormField>
                  <FormField label="First Year">
                    <Input type="number" value={stage.start_year} onChange={(e) => onUpdateStage(index, si, "start_year", parseInt(e.target.value) || 0)} />
                  </FormField>
                  <FormField label="Through Year">
                    <Input type="number" value={stage.end_year} onChange={(e) => onUpdateStage(index, si, "end_year", parseInt(e.target.value) || 0)} />
                  </FormField>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function CollegePlanningPage() {
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

  const updateChild = (index: number, field: string, value: string | number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const children = [...prev.children];
      children[index] = { ...children[index], [field]: value };
      return { ...prev, children };
    });
    setDirty(true);
  };

  const addStage = (childIndex: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const children = [...prev.children];
      const stages = [...(children[childIndex].school_stages ?? []), { ...EMPTY_STAGE }];
      children[childIndex] = { ...children[childIndex], school_stages: stages };
      return { ...prev, children };
    });
    setDirty(true);
  };

  const updateStage = (childIndex: number, stageIndex: number, field: string, value: string | number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const children = [...prev.children];
      const stages = [...(children[childIndex].school_stages ?? [])];
      stages[stageIndex] = { ...stages[stageIndex], [field]: value };
      children[childIndex] = { ...children[childIndex], school_stages: stages };
      return { ...prev, children };
    });
    setDirty(true);
  };

  const removeStage = (childIndex: number, stageIndex: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const children = [...prev.children];
      const stages = (children[childIndex].school_stages ?? []).filter((_, i) => i !== stageIndex);
      children[childIndex] = { ...children[childIndex], school_stages: stages };
      return { ...prev, children };
    });
    setDirty(true);
  };

  if (local.children.length === 0) {
    return (
      <div className="max-w-4xl">
        <h2 className="text-2xl font-bold mb-6">Education Planning</h2>
        <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-slate-400">
          No children in profile. Add children on the Profile page first.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Education Planning</h2>
        {saveStatus && <span className="text-xs text-slate-400">{saveStatus}</span>}
      </div>

      <SectionHelp
        summary="Per-child education costs from pre-college through college. 529 plans draw down first, then parent pays up to the annual cap."
        details={[
          "Pre-college stages: add school stages (middle school, high school, etc.) with tuition and year ranges. Tuition inflates at general inflation.",
          "College costs = (annual_cost + room_and_board) inflated at college tuition rate (5%/yr default) minus aid and scholarships.",
          "529 balances grow at 6%/yr with monthly contributions until college starts, then draw down to offset college costs.",
          "Parent College $/yr: cap on what parents pay (today's dollars). 529 draws first, then parent pays up to cap. Kid covers the rest.",
        ]}
      />

      <div className="flex flex-col gap-4 mt-4">
        {local.children.map((child, i) => (
          <CollegeChildCard
            key={i}
            child={child}
            index={i}
            onChange={updateChild}
            onAddStage={addStage}
            onUpdateStage={updateStage}
            onRemoveStage={removeStage}
          />
        ))}
      </div>

      {updateProfile.isError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          Error saving: {updateProfile.error.message}
        </div>
      )}
    </div>
  );
}
