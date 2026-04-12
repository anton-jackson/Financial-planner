import { Component, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { AgentPanel } from "../agent/AgentPanel";

class PageErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="p-8">
          <h2 className="text-lg font-semibold text-red-600 mb-2">Something went wrong</h2>
          <pre className="text-sm text-red-500 bg-red-50 p-4 rounded overflow-auto whitespace-pre-wrap">
            {this.state.error.message}
            {"\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-4 px-4 py-2 bg-slate-600 text-white rounded text-sm hover:bg-slate-700"
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 p-8 overflow-auto">
        <PageErrorBoundary>
          <Outlet />
        </PageErrorBoundary>
      </main>
      <AgentPanel />
    </div>
  );
}
