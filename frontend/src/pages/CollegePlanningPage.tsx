import { useEffect, useState } from "react";
import { useProfile, useUpdateProfile } from "../hooks/useProfile";
import { FormField, Input } from "../components/shared/FormField";
import { SectionHelp } from "../components/shared/SectionHelp";
import type { Profile, Child } from "../types/profile";

function CollegeChildCard({
  child,
  index,
  onChange,
}: {
  child: Child;
  index: number;
  onChange: (index: number, field: string, value: string | number) => void;
}) {
  const age = new Date().getFullYear() - child.birth_year;
  const collegeEnd = child.college_start_year + child.college_years;

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
      <div className="grid grid-cols-2 gap-3">
        <FormField label="College Start Year">
          <Input type="number" value={child.college_start_year} onChange={(e) => onChange(index, "college_start_year", parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="College Years">
          <Input type="number" value={child.college_years} onChange={(e) => onChange(index, "college_years", parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="Current School Tuition" help="Annual private school tuition (if applicable). Runs until the school's end year, inflated at general inflation.">
          <Input type="number" value={child.current_school?.annual_tuition ?? 0} onChange={(e) => onChange(index, "current_school_tuition", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="School Ends Year" help="Year current private school tuition stops (e.g. high school graduation).">
          <Input type="number" value={child.current_school?.ends_year ?? 0} onChange={(e) => onChange(index, "current_school_ends_year", parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="529 Balance" help="Current 529 plan balance. Grows at 6%/yr with contributions, then drawn down during college.">
          <Input type="number" value={child.plan_529_balance} onChange={(e) => onChange(index, "plan_529_balance", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Monthly 529 Contribution" help="Monthly contribution to this child's 529 plan. Stops when college starts.">
          <Input type="number" value={child.plan_529_monthly_contribution} onChange={(e) => onChange(index, "plan_529_monthly_contribution", parseFloat(e.target.value) || 0)} />
        </FormField>
        <FormField label="Parent College $/yr" help="Annual amount parents will contribute to college (today's dollars). 529 draws down first, then parent pays up to this cap. 0 = pay full cost after 529. Kid covers the rest.">
          <Input type="number" value={child.parent_college_annual ?? 0} onChange={(e) => onChange(index, "parent_college_annual", parseFloat(e.target.value) || 0)} />
        </FormField>
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

  if (isLoading) return <div className="text-slate-400">Loading...</div>;
  if (error) return <div className="text-red-500">Error loading profile</div>;
  if (!local) return null;

  const save = () => {
    updateProfile.mutate(local, { onSuccess: () => setDirty(false) });
  };

  const updateChild = (index: number, field: string, value: string | number) => {
    setLocal((prev) => {
      if (!prev) return prev;
      const children = [...prev.children];
      if (field === "current_school_tuition") {
        children[index] = {
          ...children[index],
          current_school: {
            type: children[index].current_school?.type ?? "",
            annual_tuition: value as number,
            ends_year: children[index].current_school?.ends_year ?? 0,
          },
        };
      } else if (field === "current_school_ends_year") {
        children[index] = {
          ...children[index],
          current_school: {
            type: children[index].current_school?.type ?? "",
            annual_tuition: children[index].current_school?.annual_tuition ?? 0,
            ends_year: value as number,
          },
        };
      } else {
        children[index] = { ...children[index], [field]: value };
      }
      return { ...prev, children };
    });
    setDirty(true);
  };

  if (local.children.length === 0) {
    return (
      <div className="max-w-4xl">
        <h2 className="text-2xl font-bold mb-6">College Planning</h2>
        <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-slate-400">
          No children in profile. Add children on the Profile page first.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">College Planning</h2>
        <button
          onClick={save}
          disabled={!dirty || updateProfile.isPending}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${dirty ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}
        >
          {updateProfile.isPending ? "Saving..." : "Save Changes"}
        </button>
      </div>

      <SectionHelp
        summary="Per-child education costs. 529 plans draw down first, then parent pays up to the annual cap. The remainder is the kid's responsibility (loans, work, scholarships)."
        details={[
          "College costs = (annual_cost_today + room_and_board_today) inflated at college tuition rate (5%/yr default) minus financial aid and scholarships.",
          "529 balances grow at 6%/yr with monthly contributions until college starts, then are drawn down to offset college costs.",
          "Parent College $/yr: cap on what parents pay (today's dollars, inflation-adjusted). 529 draws down first, then parent pays up to the cap. Set to 0 to pay full cost after 529.",
          "Private school tuition runs until the school's end year, inflated at general inflation. This cost is separate from college costs.",
          "Per-child living expenses (from Income & Savings) are added on top of base expenses and drop off after college ends.",
        ]}
      />

      <div className="flex flex-col gap-4 mt-4">
        {local.children.map((child, i) => (
          <CollegeChildCard key={i} child={child} index={i} onChange={updateChild} />
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
