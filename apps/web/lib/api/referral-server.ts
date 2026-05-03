/**
 * Server-side fetcher for Referral — RSC 用,直接打 docker compose 內部 api。
 */

import type { PayoutsOut, ReferralMeOut } from "@/lib/api/referral";

const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL ?? "http://api:8000";

async function get<T>(path: string, cookieHeader: string): Promise<T | null> {
  const res = await fetch(`${SERVER_API_BASE_URL}${path}`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const w = (await res.json()) as { success: boolean; data?: T };
  return w.success && w.data !== undefined ? w.data : null;
}

export async function fetchReferralMeServer(
  cookieHeader: string,
): Promise<ReferralMeOut | null> {
  return get<ReferralMeOut>("/api/referral/me", cookieHeader);
}

export async function fetchReferralPayoutsServer(
  cookieHeader: string,
): Promise<PayoutsOut | null> {
  return get<PayoutsOut>("/api/referral/payouts", cookieHeader);
}
