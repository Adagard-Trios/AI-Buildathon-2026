// Contracts mirrored from the services (Platform service/contracts.py, Component 1
// service/contracts.py, Component 2 shield + gateway, Component 3 verify, Component 4 chat).
// Field names are the wire names, unchanged.

export interface User {
  id: number;
  email: string;
  display_name: string;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: User;
}

export interface Holding {
  symbol: string;
  quantity: number;
  current_price: number;
  avg_daily_volume: number;
  cost_basis?: number | null;
}

export interface PortfolioSummary {
  id: number;
  name: string;
  base_currency: string;
  holding_count: number;
  total_value: number;
  updated_at: string;
}

export interface Portfolio {
  id: number;
  name: string;
  base_currency: string;
  holdings: Holding[];
  created_at: string;
  updated_at: string;
}

// --- Component 1 -------------------------------------------------------------------------
export interface AssetSale {
  symbol: string;
  sell_fraction: number;
  quantity: number;
  expected_price: number;
  expected_slippage_pct: number;
  execution_day: number;
}

export interface BaselineRow {
  method: string;
  feasible: boolean;
  raised_amount: number;
  expected_realized_loss: number;
  expected_slippage_pct: number;
  days_required: number;
}

export interface ForecastBlock {
  horizon: number;
  method: string;
  p10: number;
  p50: number;
  p90: number;
  model_version?: string | null;
  reason?: string | null;
}

export interface WithdrawalResponse {
  assets_to_sell: AssetSale[];
  raised_amount: number;
  target_amount: number;
  shortfall: number;
  expected_slippage_pct: number;
  expected_realized_loss: number;
  days_required: number;
  feasible: boolean;
  model_version: string;
  generated_at: string;
  /** Id the plan is anchored under in Component 3, for later verification. */
  decision_id?: string | null;
  market_context?: Record<string, { forecast?: ForecastBlock; status?: string }>;
  baseline_comparison?: BaselineRow[];
  currency?: { base: string } | null;
}

export interface DraftHolding {
  symbol: string;
  quantity: number;
  avg_cost: number | null;
  currency: string | null;
}

export interface ImportResult {
  draft_holdings: DraftHolding[];
  rejected: { index: number; reason: string }[];
}

export interface Instrument {
  symbol: string;
  name: string;
  exchange: string;
  asset_class: string;
  currency: string;
  last_price?: number | null;
}

export interface QuoteResponse {
  instrument: Instrument;
  price: number;
  as_of: string;
  currency: string;
  base_currency: string;
  fx_rate_to_base: number;
  /** Average daily traded value, same meaning as Holding.avg_daily_volume. */
  avg_daily_volume: number;
}

// --- Component 2 -------------------------------------------------------------------------
export type ShieldLevel = "LOW_RISK" | "CAUTION" | "HIGH_RISK";

export interface ShieldVerdict {
  id: string;
  level: ShieldLevel;
  verified: boolean;
  fired_rules: string[];
  reasons: string[];
  policy_version: string;
  flag_source: string;
  links: string[];
}

export interface TransactionInput {
  transaction_id?: string;
  user_id: string;
  amount: number;
  location: string;
  device_id: string;
  device_change: boolean;
  typing_speed: number;
  navigation_pattern: string;
  transaction_frequency: number;
  beneficiary_change: boolean;
  beneficiary_id?: string;
  previous_transaction_amount: number;
  account_age: number;
}

export interface ScoreResponse {
  transaction_id: string;
  user_id: string;
  risk_score: number;
  decision: "ALLOW" | "STEP-UP" | "BLOCK";
  reason: string;
  /** All human-readable reasons, and the deterministic gateway rules that fired. */
  reasons?: string[];
  rules_fired?: string[];
}

export interface StepUpChallenge {
  challenge_id: string;
  expires_in: number;
  /** Present only when the server runs in DEMO_MODE (no SMS delivery in the prototype). */
  demo_code?: string;
}

export interface StepUpResult {
  verified: boolean;
  reason?: string;
  attempts_left?: number;
}

// --- Component 3 -------------------------------------------------------------------------
export interface VerifyResult {
  verified: boolean;
  status: string;
  message: string;
}

// --- Component 4 -------------------------------------------------------------------------
export interface AssistantReply {
  answer: string;
  agent_execution?: { tools_used?: string[]; number_of_tools?: number; status?: string };
  evidence?: { tool: string; result: string }[];
  responsible_ai?: { grounding?: { grounded: boolean } } & Record<string, unknown>;
  pending_actions?: PendingAction[];
}

export interface PendingAction {
  Id: string;
  Kind: string;
  Status: string;
  Reversible: boolean;
  Summary: string;
  To?: string | null;
}

export interface Guardian {
  Id: string;
  Name: string;
  Contact: string;
}
