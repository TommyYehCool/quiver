/**
 * User-facing Referral API client (F-4b).
 *
 * Mirrors apps/api/app/api/referral.py.
 */

import { apiFetch } from "@/lib/api";

// ──── types ────

export interface ReferrerInfo {
  referrer_user_id: number;
  /** F-5b-X: referrer's own code (e.g. "TOMMYYEH") so UI can show
   * "你被 TOMMYYEH 推薦" instead of generic "you have a referrer". */
  referrer_code: string;
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

/** F-5b-X — per-invitee progress row for the inviter's overview list. */
export interface InviteeOut {
  invitee_user_id: number;
  /** Backend masks the email for privacy ("ro****@gmail.com"). */
  masked_email: string;
  earn_tier: string | null;
  invited_at: string;
  /** Raw funnel event code; UI translates to a stage label. */
  last_event_name: string | null;
  revshare_started_at: string | null;
  revshare_expires_at: string | null;
  commission_l1_usdt: string;
  /** True only on standard "public" tier (Friend / Premium = no perf fee). */
  is_revshare_eligible: boolean;
}

export interface InviteesOut {
  invitees: InviteeOut[];
  total_commission_l1_usdt: string;
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

export async function fetchReferralInvitees(): Promise<InviteesOut> {
  return apiFetch<InviteesOut>("/api/referral/invitees");
}
