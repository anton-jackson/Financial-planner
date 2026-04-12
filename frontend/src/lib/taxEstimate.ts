/**
 * Client-side tax estimator for the Year-1 reconciliation panel.
 *
 * This is a deliberately simplified approximation — a sanity check for data
 * entry, NOT the authoritative calculation. The backend engine
 * (`backend/engine/tax.py`) is the source of truth and runs progressive
 * brackets, NIIT, LTCG, Additional Medicare, state brackets, and Child Tax
 * Credit during actual projections.
 *
 * Mirrors the 2026 federal brackets and standard deduction from tax.py:24-58.
 * State tax uses: (1) the user's override from profile.tax.state_income_tax_pct
 * if > 0, else (2) a small flat/effective-rate table for common states,
 * else (3) 5% as a crude default.
 */

export type FilingStatus = "mfj" | "single" | "hoh";

type Bracket = [upperBound: number, rate: number];

const FEDERAL_BRACKETS_2026: Record<FilingStatus, Bracket[]> = {
  mfj: [
    [23_850, 0.10],
    [96_950, 0.12],
    [206_700, 0.22],
    [394_600, 0.24],
    [501_050, 0.32],
    [751_600, 0.35],
    [Infinity, 0.37],
  ],
  single: [
    [11_925, 0.10],
    [48_475, 0.12],
    [103_350, 0.22],
    [197_300, 0.24],
    [250_525, 0.32],
    [626_350, 0.35],
    [Infinity, 0.37],
  ],
  hoh: [
    [17_000, 0.10],
    [64_850, 0.12],
    [103_350, 0.22],
    [197_300, 0.24],
    [250_500, 0.32],
    [626_350, 0.35],
    [Infinity, 0.37],
  ],
};

const STANDARD_DEDUCTION_2026: Record<FilingStatus, number> = {
  mfj: 32_300,
  single: 16_150,
  hoh: 24_200,
};

// FICA (2026 projected), see tax.py:116-119
const SS_WAGE_CAP = 172_800;
const SS_RATE = 0.062;
const MEDICARE_RATE = 0.0145;

// States with no income tax — mirrors tax.py:130
const NO_INCOME_TAX_STATES = new Set([
  "wa", "tx", "fl", "nv", "wy", "sd", "ak", "tn", "nh",
]);

// Flat-rate states — mirrors tax.py:135-149
const FLAT_RATE_STATES: Record<string, number> = {
  ia: 0.038, il: 0.0495, mi: 0.0425, pa: 0.0307, in: 0.0305,
  nc: 0.045, az: 0.025, co: 0.044, ut: 0.0465, ky: 0.04,
  ma: 0.05, ms: 0.05, nd: 0.0195,
};

// Rough effective rate for progressive states at middle-to-upper-middle incomes.
// Crude approximation — acceptable for a year-1 sanity check, NOT for projections.
const PROGRESSIVE_STATE_EFFECTIVE_RATES: Record<string, number> = {
  ca: 0.08, ny: 0.065, or: 0.09, hi: 0.08, mn: 0.07, nj: 0.06,
  va: 0.05, ga: 0.05, md: 0.05, ct: 0.06, wi: 0.05, sc: 0.05,
  mt: 0.06, me: 0.07, de: 0.05, ar: 0.04, nm: 0.045, oh: 0.03,
  wv: 0.05, mo: 0.045, dc: 0.08, al: 0.04, ok: 0.04, ne: 0.05,
  la: 0.04, ks: 0.05, id: 0.055, ri: 0.05, vt: 0.06,
};

function computeFederalTax(taxableIncome: number, status: FilingStatus): number {
  if (taxableIncome <= 0) return 0;
  const brackets = FEDERAL_BRACKETS_2026[status];
  let tax = 0;
  let prev = 0;
  for (const [upper, rate] of brackets) {
    if (taxableIncome <= upper) {
      tax += (taxableIncome - prev) * rate;
      return tax;
    }
    tax += (upper - prev) * rate;
    prev = upper;
  }
  return tax;
}

function computeFICA(wages: number): number {
  const ss = Math.min(wages, SS_WAGE_CAP) * SS_RATE;
  const medicare = wages * MEDICARE_RATE;
  return ss + medicare;
}

function stateRate(state: string, overridePct: number): number {
  if (overridePct > 0) return overridePct / 100;
  const s = (state || "").toLowerCase();
  if (!s) return 0.05; // unknown state — fall back to rough 5%
  if (NO_INCOME_TAX_STATES.has(s)) return 0;
  if (s in FLAT_RATE_STATES) return FLAT_RATE_STATES[s];
  if (s in PROGRESSIVE_STATE_EFFECTIVE_RATES) {
    return PROGRESSIVE_STATE_EFFECTIVE_RATES[s];
  }
  return 0.05;
}

export interface TaxEstimateInputs {
  // Gross wages subject to FICA (salary + bonus, excluding RSU for simplicity).
  wages: number;
  // Pre-tax deductions (traditional 401k, HSA) that reduce federal taxable income.
  preTaxDeductions: number;
  // Filing status.
  filingStatus: FilingStatus;
  // State of residence (2-letter code, any case).
  state: string;
  // Manual state override percent (0 = use automatic lookup).
  stateOverridePct: number;
}

export interface TaxEstimate {
  federal: number;
  state: number;
  fica: number;
  total: number;
  effectiveRatePct: number; // against gross wages
}

/**
 * Approximate year-1 tax bill. See module docstring for caveats.
 */
export function estimateYear1Taxes(inputs: TaxEstimateInputs): TaxEstimate {
  const { wages, preTaxDeductions, filingStatus, state, stateOverridePct } = inputs;
  const agi = Math.max(0, wages - preTaxDeductions);
  const taxableIncome = Math.max(0, agi - STANDARD_DEDUCTION_2026[filingStatus]);

  const federal = computeFederalTax(taxableIncome, filingStatus);
  const state_tax = agi * stateRate(state, stateOverridePct);
  const fica = computeFICA(wages);
  const total = federal + state_tax + fica;

  return {
    federal: Math.round(federal),
    state: Math.round(state_tax),
    fica: Math.round(fica),
    total: Math.round(total),
    effectiveRatePct: wages > 0 ? (total / wages) * 100 : 0,
  };
}
