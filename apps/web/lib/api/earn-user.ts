/**
 * User-facing Earn API client (F-Phase 3 / Path A self-service).
 *
 * Mirrors apps/api/app/api/earn.py. For admin earn management see earn.ts.
 */

import { apiFetch } from "@/lib/api";

// ──── types ────

export type KycStatusValue = "PENDING" | "APPROVED" | "REJECTED" | "NONE";

export type EarnPositionStatus =
  | "pending_outbound"
  | "onchain_in_flight"
  | "funding_idle"
  | "lent"
  | "closing"
  | "closed_external"
  | "failed";

export interface EarnPositionUserOut {
  id: number;
  status: EarnPositionStatus;
  amount: string;
  onchain_tx_hash: string | null;
  onchain_broadcast_at: string | null;
  bitfinex_credited_at: string | null;
  bitfinex_offer_id: number | null;
  bitfinex_offer_submitted_at: string | null;
  closed_at: string | null;
  last_error: string | null;
}

export interface EarnSnapshotUserOut {
  snapshot_date: string;
  bitfinex_funding_usdt: string | null;
  bitfinex_lent_usdt: string | null;
  bitfinex_daily_earned: string | null;
}

export interface ActiveCreditOut {
  id: number;
  amount: string;
  rate_daily: string;
  apr_pct: string;
  period_days: number;
  opened_at_ms: number;
  expires_at_ms: number;
  expected_interest_at_expiry: string;
}

export type EarnTier = "none" | "internal" | "friend" | "public" | "commercial";

export type EarnStrategyPreset = "conservative" | "balanced" | "aggressive";

export interface EarnMeOut {
  kyc_status: KycStatusValue;
  can_connect: boolean;
  has_earn_account: boolean;
  auto_lend_enabled: boolean;
  /** F-5a-3.5: risk dial. null only when has_earn_account is false. */
  strategy_preset: EarnStrategyPreset | null;
  /** F-5b-2: true iff Quiver auto-paused auto-lend due to ≥4 unpaid weeks. */
  dunning_pause_active: boolean;
  /** F-5a-4.1: telegram bot binding state. */
  telegram_bound: boolean;
  /** F-5a-4.1: bot username (sans @). null = bot not configured server-side. */
  telegram_bot_username: string | null;
  bitfinex_connected: boolean;
  bitfinex_funding_address: string | null;
  earn_tier: EarnTier | null;
  perf_fee_bps: number | null;
  is_premium: boolean;
  funding_idle_usdt: string | null;
  lent_usdt: string | null;
  daily_earned_usdt: string | null;
  total_at_bitfinex: string | null;
  active_positions: EarnPositionUserOut[];
  active_credits: ActiveCreditOut[];
  recent_snapshots: EarnSnapshotUserOut[];
}

export interface EarnConnectPreviewOut {
  already_connected: boolean;
  tier: EarnTier;
  perf_fee_bps: number;
  perf_fee_pct: string; // Decimal serialised as string
  friend_slots_total: number;
  friend_slots_remaining: number;
}

export interface EarnSettingsOut {
  auto_lend_enabled: boolean;
  strategy_preset: EarnStrategyPreset;
}

export interface EarnConnectOut {
  earn_account_id: number;
  bitfinex_funding_address: string;
  auto_lend_enabled: boolean;
  bitfinex_funding_balance: string;
  earn_tier: EarnTier;
  perf_fee_bps: number;
  referral_bind_status: string | null;
}

// ──── client (browser) ────

export async function fetchEarnMe(): Promise<EarnMeOut> {
  return apiFetch<EarnMeOut>("/api/earn/me");
}

export async function fetchEarnConnectPreview(): Promise<EarnConnectPreviewOut> {
  return apiFetch<EarnConnectPreviewOut>("/api/earn/connect-preview");
}

// ──── F-5b-1 performance / public-stats ────

export interface DailyEarning {
  date: string;
  usdt: string;
}

export interface EarnPerformanceOut {
  current_frr_apr_pct: string | null;
  weighted_avg_apr_pct: string | null;
  apr_vs_frr_delta_pct: string | null;
  total_interest_30d_usdt: string | null;
  days_with_data: number;
  daily_earnings: DailyEarning[];
  spike_credits_count: number;
  spike_credits_total_usdt: string;
  best_active_apr_pct: string | null;
  active_credits_count: number;
  ladder_total_usdt: string | null;
}

export interface EarnPublicStatsOut {
  active_bots_count: number;
  total_lent_usdt: string;
  avg_apr_30d_pct: string | null;
}

export async function fetchEarnPerformance(): Promise<EarnPerformanceOut> {
  return apiFetch<EarnPerformanceOut>("/api/earn/performance");
}

export async function fetchEarnPublicStats(): Promise<EarnPublicStatsOut> {
  return apiFetch<EarnPublicStatsOut>("/api/earn/public-stats");
}

// ──── F-5b-2 fees ────

export type FeeAccrualStatus = "ACCRUED" | "PAID" | "WAIVED";

export type FeePaidMethod =
  | "platform_deduction"
  | "tron_usdt"
  | "manual_offline";

export interface FeeAccrualRow {
  id: number;
  period_start: string;
  period_end: string;
  earnings_amount: string;
  fee_bps_applied: number;
  fee_amount: string;
  status: FeeAccrualStatus;
  paid_at: string | null;
  paid_method: FeePaidMethod | null;
}

export type DunningLevel = "ok" | "warning" | "paused";

export interface EarnFeeSummaryOut {
  perf_fee_bps: number;
  is_premium: boolean;
  pending_accrued_usdt: string;
  pending_count: number;
  quiver_wallet_balance_usdt: string;
  has_buffer_warning: boolean;
  /** F-5b-2: derived dunning level for UI. */
  dunning_level: DunningLevel;
  dunning_pause_active: boolean;
  paid_30d_usdt: string;
  paid_lifetime_usdt: string;
  last_paid_at: string | null;
  next_settle_at: string;
  recent_accruals: FeeAccrualRow[];
}

export async function fetchEarnFees(): Promise<EarnFeeSummaryOut> {
  return apiFetch<EarnFeeSummaryOut>("/api/earn/fees");
}

export async function updateEarnSettings(
  payload: {
    auto_lend_enabled?: boolean;
    strategy_preset?: EarnStrategyPreset;
  },
): Promise<EarnSettingsOut> {
  return apiFetch<EarnSettingsOut>("/api/earn/settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export async function connectBitfinex(
  payload: {
    bitfinex_api_key: string;
    bitfinex_api_secret: string;
    bitfinex_funding_address: string;
    referral_code?: string;
  },
): Promise<EarnConnectOut> {
  return apiFetch<EarnConnectOut>("/api/earn/connect", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
