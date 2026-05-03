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

export interface EarnMeOut {
  kyc_status: KycStatusValue;
  can_connect: boolean;
  has_earn_account: boolean;
  auto_lend_enabled: boolean;
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

export async function updateEarnSettings(
  payload: { auto_lend_enabled?: boolean },
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
