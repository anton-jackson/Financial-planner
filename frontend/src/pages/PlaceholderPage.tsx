export function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="max-w-4xl">
      <h2 className="text-2xl font-bold mb-6">{title}</h2>
      <div className="bg-white rounded-lg border border-slate-200 p-8 text-center text-slate-400">
        Coming in Phase 4 - Dashboard & Charts
      </div>
    </div>
  );
}
