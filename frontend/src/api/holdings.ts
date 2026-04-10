import type {
  HoldingsFile,
  AllocationTarget,
  RebalanceAction,
  QuoteResult,
} from "../types/assets";
import { api } from "./client";

export const holdingsApi = {
  get: () => api.get<HoldingsFile>("/holdings"),
  put: (data: HoldingsFile) => api.put<HoldingsFile>("/holdings", data),
  refresh: () => api.post<HoldingsFile>("/holdings/refresh", {}),
  quote: (tickers: string[]) =>
    api.post<Record<string, QuoteResult>>("/holdings/quote", { tickers }),
  allocation: () =>
    api.get<{ total_value: number; allocation: Record<string, number> }>(
      "/holdings/allocation"
    ),
  rebalance: (targets: AllocationTarget[]) =>
    api.post<RebalanceAction[]>("/holdings/rebalance", { targets }),
};
