import { useEffect, useState } from "react";
import { useProfile, useUpdateProfile } from "../hooks/useProfile";
import { useAutoSave } from "../hooks/useAutoSave";
import { FormField, Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import type { Profile, Child } from "../types/profile";

function PersonSection({
  title,
  person,
  onChange,
}: {
  title: string;
  person: { name: string; birth_year: number; retirement_age: number; life_expectancy_age: number; state_of_residence: string };
  onChange: (field: string, value: string | number) => void;
}) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-6">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>
      <SectionHelp
        summary="Defines the projection timeline. Retirement age triggers the switch from earning to spending mode. Life expectancy sets the end of the projection."
        details={[
          "Birth year + retirement age = the year income stops and portfolio withdrawals begin.",
          "Birth year + life expectancy = the last year simulated.",
          "Spouse retirement can differ — each person's income stops independently.",
          "State of residence determines state income tax computation.",
        ]}
      />
      <div className="grid grid-cols-2 gap-4">
        <FormField label="Name">
          <Input value={person.name} onChange={(e) => onChange("name", e.target.value)} />
        </FormField>
        <FormField label="Birth Year">
          <Input type="number" value={person.birth_year} onChange={(e) => onChange("birth_year", parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="Retirement Age">
          <Input type="number" value={person.retirement_age} onChange={(e) => onChange("retirement_age", parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="Life Expectancy Age">
          <Input type="number" value={person.life_expectancy_age} onChange={(e) => onChange("life_expectancy_age", parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="State of Residence">
          <Input value={person.state_of_residence} onChange={(e) => onChange("state_of_residence", e.target.value)} />
        </FormField>
      </div>
    </div>
  );
}

function ChildCard({
  child,
  index,
  onChange,
  onRemove,
}: {
  child: Child;
  index: number;
  onChange: (index: number, field: string, value: string | number) => void;
  onRemove: (index: number) => void;
}) {
  const age = new Date().getFullYear() - child.birth_year;
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-medium text-slate-600">
          {child.name || `Child ${index + 1}`} {child.name && <span className="text-slate-400">(age {age})</span>}
        </h4>
        <button onClick={() => onRemove(index)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Name">
          <Input value={child.name} onChange={(e) => onChange(index, "name", e.target.value)} />
        </FormField>
        <FormField label="Birth Year">
          <Input type="number" value={child.birth_year} onChange={(e) => onChange(index, "birth_year", parseInt(e.target.value) || 0)} />
        </FormField>
      </div>
    </div>
  );
}

export function ProfilePage() {
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

  const updatePerson = (key: "personal" | "spouse") => (field: string, value: string | number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const person = key === "spouse" ? prev.spouse : prev.personal;
      if (!person) return prev;
      return { ...prev, [key]: { ...person, [field]: value } };
    });
    setDirty(true);
  };

  const updateChild = (index: number, field: string, value: string | number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const children = [...prev.children];
      children[index] = { ...children[index], [field]: value };
      return { ...prev, children };
    });
    setDirty(true);
  };

  const addChild = () => {
    setLocal((prev) => {
      if (!prev) return prev;
      const newChild: Child = {
        name: "",
        birth_year: new Date().getFullYear() - 10,
        college_start_year: new Date().getFullYear() + 8,
        college_years: 4,
        current_school: null,
        plan_529_balance: 0,
        plan_529_monthly_contribution: 0,
        parent_college_annual: 0,
      };
      return { ...prev, children: [...prev.children, newChild] };
    });
    setDirty(true);
  };

  const removeChild = (index: number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      return { ...prev, children: prev.children.filter((_, i) => i !== index) };
    });
    setDirty(true);
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Profile</h2>
        {saveStatus && <span className="text-xs text-slate-400">{saveStatus}</span>}
      </div>

      <div className="flex flex-col gap-6">
        <PersonSection title="Personal Info" person={local.personal} onChange={updatePerson("personal")} />
        {local.spouse && (
          <PersonSection title="Spouse" person={local.spouse} onChange={updatePerson("spouse")} />
        )}

        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Children</h3>
            <button onClick={addChild} className="text-sm text-blue-600 hover:text-blue-800">+ Add Child</button>
          </div>
          <SectionHelp
            summary="Basic child info. Education details (college, 529, tuition) are configured on the College Planning page."
            details={[
              "Children affect per-child living expenses, Child Tax Credit eligibility (under 17), and college cost projections.",
              "College planning, 529 balances, and parent contribution caps are managed on the College Planning page.",
            ]}
          />
          <div className="flex flex-col gap-4">
            {local.children.map((child, i) => (
              <ChildCard key={i} child={child} index={i} onChange={updateChild} onRemove={removeChild} />
            ))}
            {local.children.length === 0 && (
              <div className="text-sm text-slate-400 text-center py-4">No children</div>
            )}
          </div>
        </div>
      </div>

      {updateProfile.isError && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
          Error saving: {updateProfile.error.message}
        </div>
      )}
    </div>
  );
}
