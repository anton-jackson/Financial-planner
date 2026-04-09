import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  User,
  GraduationCap,
  PiggyBank,
  Layers,
  Play,
  Wallet,
  HelpCircle,
  Target,
  DollarSign,
  MessageCircle,
} from "lucide-react";
import { useAgent } from "../agent/AgentContext";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/profile", label: "Profile", icon: User },
  { to: "/finances", label: "Basic Finances", icon: DollarSign },
  { to: "/assets", label: "Assets & Liabilities", icon: Wallet },
  { to: "/college", label: "College Planning", icon: GraduationCap },
  { to: "/planning", label: "Planning", icon: Target },
  { to: "/retirement", label: "Retirement", icon: PiggyBank },
  { to: "/scenarios", label: "Scenarios", icon: Layers },
  { to: "/simulation", label: "Run Simulation", icon: Play },
  { to: "/how-it-works", label: "How It Works", icon: HelpCircle },
];

export function Sidebar() {
  const { toggle, isOpen } = useAgent();

  return (
    <aside className="w-64 min-h-screen bg-slate-800 text-slate-200 flex flex-col">
      <div className="p-4 border-b border-slate-700">
        <h1 className="text-lg font-semibold text-white">Finance Planner</h1>
      </div>
      <nav className="flex-1 p-2">
        {links.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                isActive
                  ? "bg-slate-700 text-white"
                  : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="p-2 border-t border-slate-700">
        <button
          onClick={toggle}
          className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm
                      transition-colors w-full ${
                        isOpen
                          ? "bg-blue-600 text-white"
                          : "text-slate-300 hover:bg-slate-700/50 hover:text-white"
                      }`}
        >
          <MessageCircle size={18} />
          AI Advisor
        </button>
      </div>
    </aside>
  );
}
