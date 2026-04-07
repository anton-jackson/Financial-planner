import { BrowserRouter, Routes, Route } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { ProfilePage } from "./pages/ProfilePage";
import { BasicFinancesPage } from "./pages/BasicFinancesPage";
import { AssetsPage } from "./pages/AssetsPage";
import { CollegePlanningPage } from "./pages/CollegePlanningPage";
import { ScenariosPage } from "./pages/ScenariosPage";
import { PlaceholderPage } from "./pages/PlaceholderPage";
import { RetirementPage } from "./pages/RetirementPage";
import { SimulationPage } from "./pages/SimulationPage";
import { HowItWorksPage } from "./pages/HowItWorksPage";
import { PlanningPage } from "./pages/PlanningPage";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/finances" element={<BasicFinancesPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/college" element={<CollegePlanningPage />} />
            <Route path="/retirement" element={<RetirementPage />} />
            <Route path="/planning" element={<PlanningPage />} />
            <Route path="/scenarios" element={<ScenariosPage />} />
            <Route path="/simulation" element={<SimulationPage />} />
            <Route path="/how-it-works" element={<HowItWorksPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
