import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  User,
  PiggyBank,
  Layers,
  Play,
  Wallet,
  HelpCircle,
  Target,
  DollarSign,
  MessageCircle,
  Gift,
  Home,
  Car,
  CreditCard,
  GraduationCap,
} from "lucide-react";
import { useAgent } from "../agent/AgentContext";

const OVERVIEW_LINKS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
];

const DATA_LINKS = [
  { to: "/profile", label: "Profile", icon: User },
  { to: "/income", label: "Income & Savings", icon: DollarSign },
  { to: "/accounts", label: "Investment Accounts", icon: Wallet },
  { to: "/property", label: "Property", icon: Home },
  { to: "/vehicles", label: "Vehicles", icon: Car },
  { to: "/debt", label: "Debt", icon: CreditCard },
  { to: "/windfalls", label: "Windfalls", icon: Gift },
  { to: "/college", label: "Education Planning", icon: GraduationCap },
];

const ANALYSIS_LINKS = [
  { to: "/retirement", label: "Retirement", icon: PiggyBank },
  { to: "/planning", label: "Planning", icon: Target },
  { to: "/scenarios", label: "Scenario Editor", icon: Layers },
  { to: "/simulation", label: "Run Scenario Simulations", icon: Play },
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
        {OVERVIEW_LINKS.map(({ to, label, icon: Icon }) => (
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
        <p className="text-xs text-slate-500 px-3 pt-4 pb-1">YOUR DATA</p>
        {DATA_LINKS.map(({ to, label, icon: Icon }) => (
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
        <p className="text-xs text-slate-500 px-3 pt-4 pb-1">ANALYSIS</p>
        {ANALYSIS_LINKS.map(({ to, label, icon: Icon }) => (
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
