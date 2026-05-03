/**
 * User-facing Referral API client (F-4b).
 *
 * Mirrors apps/api/app/api/referral.py.
 */

import { apiFetch } from "@/lib/api";

// ──── types ────

export interface ReferrerInfo {
  referrer_user_id: number;
  bound_at: string;
  binding_source: string;
  revshare_started_at: string | null;
  revshare_expires_at: string | null;
}

export interface ReferralMeOut {
  code: string | null;
  share_url_template: string;
  referrer: ReferrerInfo | null;
  direct_referees_count: number;
  total_earned_usdt: string; // Decimal as string
  l1_pct: string;
  l2_pct: string;
  window_days: number;
}

export interface PayoutOut {
  id: number;
  referee_user_id: number;
  level: number;
  amount: string;
  paid_at: string;
}

export interface PayoutsOut {
  items: PayoutOut[];
  total_earned: string;
}

// ──── client ────

export async function fetchReferralMe(): Promise<ReferralMeOut> {
  return apiFetch<ReferralMeOut>("/api/referral/me");
}

export async function setReferralCode(code: string): Promise<{ code: string }> {
  return apiFetch<{ code: string }>("/api/referral/code", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function bindReferralCode(
  code: string,
): Promise<{
  referrer_user_id: number;
  bound_at: string;
  binding_source: string;
}> {
  return apiFetch("/api/referral/bind", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function fetchReferralPayouts(): Promise<PayoutsOut> {
  return apiFetch<PayoutsOut>("/api/referral/payouts");
}
