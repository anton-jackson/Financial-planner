import type { DeterministicResult, MonteCarloResult, SimulationRequest, CompareRequest } from "../types/simulation";
import { api } from "./client";

export interface BaselineOverrides {
  retirement_age?: number;
  spouse_retirement_age?: number;
  annual_base_expenses?: number;
  contribution_rate_pct?: number;
  additional_monthly_savings?: number;
  spouse_base_salary?: number;
}

export interface SweepRequest {
  row_variable: string;
  row_values: number[];
  col_variable: string;
  col_values: number[];
  num_mc_trials?: number;
  fixed_overrides?: BaselineOverrides;
}

export interface SweepCell {
  row_value: number;
  col_value: number;
  nw_at_retirement: number;
  liquid_at_retirement: number;
  mc_success_rate: number;
  median_terminal_nw: number;
  annual_withdrawal_budget: number;
}

export interface SweepResult {
  row_variable: string;
  row_values: number[];
  col_variable: string;
  col_values: number[];
  cells: SweepCell[];
}

export const simulationApi = {
  baseline: (overrides?: BaselineOverrides) =>
    api.post<DeterministicResult>("/simulate/baseline", overrides ?? {}),
  baselineMonteCarlo: (numTrials = 2000, overrides?: BaselineOverrides) =>
    api.post<MonteCarloResult>(`/simulate/baseline/monte-carlo?num_trials=${numTrials}`, overrides ?? {}),
  deterministic: (req: SimulationRequest) =>
    api.post<DeterministicResult>("/simulate/deterministic", req),
  monteCarlo: (req: SimulationRequest) =>
    api.post<MonteCarloResult>("/simulate/monte-carlo", req),
  compare: (req: CompareRequest) =>
    api.post<DeterministicResult[]>("/simulate/compare", req),
  sweep: (req: SweepRequest) =>
    api.post<SweepResult>("/simulate/sweep", req),
};
