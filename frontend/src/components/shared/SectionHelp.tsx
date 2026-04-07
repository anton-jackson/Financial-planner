/**
 * Collapsible help panel for form sections.
 * Shows a brief summary with an expand toggle for full engine details.
 */
import { useState } from "react";

interface SectionHelpProps {
  summary: string;
  details: string[];
}

export function SectionHelp({ summary, details }: SectionHelpProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-blue-50 border border-blue-100 rounded-lg px-4 py-3 mb-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-blue-700 leading-relaxed">{summary}</p>
        {details.length > 0 && (
          <button
            onClick={() => setOpen(!open)}
            className="text-[10px] font-medium text-blue-500 hover:text-blue-700 whitespace-nowrap mt-0.5"
          >
            {open ? "Less" : "How it works"}
          </button>
        )}
      </div>
      {open && (
        <ul className="mt-2 flex flex-col gap-1.5 border-t border-blue-100 pt-2">
          {details.map((d, i) => (
            <li key={i} className="text-[11px] text-blue-600 leading-relaxed flex gap-1.5">
              <span className="text-blue-400 mt-px">•</span>
              <span>{d}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
