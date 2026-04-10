export interface Asset {
  name: string;
  type: string;
  balance: number;
  return_profile: string;
  properties: Record<string, unknown>;
}

export interface AssetsFile {
  schema_version: number;
  assets: Asset[];
}

// ─── Holdings ──────────────────────────────────────────────────

export interface TaxLot {
  shares: number;
  cost_basis_per_share: number;
  purchase_date: string;
}

export interface Holding {
  ticker: string;
  shares: number;
  asset_class: string;
  tax_lots: TaxLot[];
  price: number;
  market_value: number;
  name: string;
}

export interface AccountHoldings {
  account_name: string;
  holdings: Holding[];
  total_value: number;
  last_refreshed: string;
}

export interface HoldingsFile {
  schema_version: number;
  accounts: AccountHoldings[];
}

export interface AllocationTarget {
  asset_class: string;
  target_pct: number;
}

export interface RebalanceAction {
  account_name: string;
  ticker: string;
  asset_class: string;
  action: string;
  shares: number;
  dollar_amount: number;
  reason: string;
}

export interface QuoteResult {
  price: number;
  name: string;
  asset_class: string;
  category: string;
  exchange: string;
  error: string | null;
}
