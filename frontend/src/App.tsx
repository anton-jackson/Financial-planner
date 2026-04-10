import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { GoogleOAuthProvider } from "@react-oauth/google";
import { useEffect } from "react";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { ProfilePage } from "./pages/ProfilePage";
import { BasicFinancesPage } from "./pages/BasicFinancesPage";
import { AssetsPage } from "./pages/AssetsPage";
import { CollegePlanningPage } from "./pages/CollegePlanningPage";
import { ScenariosPage } from "./pages/ScenariosPage";
import { RetirementPage } from "./pages/RetirementPage";
import { SimulationPage } from "./pages/SimulationPage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { PlanningPage } from "./pages/PlanningPage";
import { AgentProvider } from "./components/agent/AgentContext";
import { HoldingsPage } from "./pages/HoldingsPage";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { LoginPage } from "./auth/LoginPage";
import { setTokenGetter } from "./api/client";

const GOOGLE_CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  "508691346171-q26ptoml8n708dn2eh7p6g3i0rm4jr6k.apps.googleusercontent.com";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

/** Wires the auth token into the API client */
function TokenBridge() {
  const { token } = useAuth();
  useEffect(() => {
    setTokenGetter(() => token);
  }, [token]);
  return null;
}

/** Gates the app behind login when auth is required */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { authRequired, token, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-slate-400 text-lg">Loading...</div>
      </div>
    );
  }

  // Auth not required — show app directly
  if (!authRequired) {
    return <>{children}</>;
  }

  // Auth required but no token — show login
  if (!token) {
    return <LoginPage />;
  }

  return <>{children}</>;
}

export default function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <TokenBridge />
          <AuthGate>
            <AgentProvider>
              <BrowserRouter>
                <Routes>
                  <Route element={<AppShell />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/profile" element={<ProfilePage />} />
                    <Route path="/finances" element={<BasicFinancesPage />} />
                    <Route path="/assets" element={<AssetsPage />} />
                    <Route path="/holdings" element={<HoldingsPage />} />
                    <Route path="/college" element={<CollegePlanningPage />} />
                    <Route path="/retirement" element={<RetirementPage />} />
                    <Route path="/planning" element={<PlanningPage />} />
                    <Route path="/scenarios" element={<ScenariosPage />} />
                    <Route path="/simulation" element={<SimulationPage />} />
                    <Route path="/how-it-works" element={<HowItWorksPage />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </AgentProvider>
          </AuthGate>
        </AuthProvider>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}
