interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  hint?: string;
  help?: string;
}

export function FormField({ label, children, hint, help }: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label className="text-sm font-medium text-slate-700">{label}</label>
        {help && <HelpTip text={help} />}
      </div>
      {children}
      {hint && <span className="text-xs text-slate-400">{hint}</span>}
    </div>
  );
}

function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-slate-200 text-slate-500 text-[9px] font-bold cursor-help leading-none">?</span>
      <span className="invisible group-hover:visible absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-56 px-3 py-2 bg-slate-800 text-white text-xs rounded-lg shadow-lg z-50 leading-relaxed whitespace-normal">
        {text}
        <span className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-slate-800" />
      </span>
    </span>
  );
}

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export function Input(props: InputProps) {
  return (
    <input
      {...props}
      className={`border border-slate-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${props.className ?? ""}`}
    />
  );
}
