import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { AgentPanel } from "../agent/AgentPanel";

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
      <AgentPanel />
    </div>
  );
}
