/**
 * Server-side admin funnel fetcher (RSC) — F-5b-4.
 */

const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL ?? "http://api:8000";

export interface FunnelStage {
  event_name: string;
  label: string;
  user_count: number;
  drop_off_pct: number | null;
}

export interface FunnelOverview {
  stages: FunnelStage[];
  total_users: number;
  last_signup_at: string | null;
}

export interface FunnelUser {
  user_id: number;
  email: string;
  signup_at: string;
  last_event_name: string | null;
  last_event_at: string | null;
  stalled_minutes: number | null;
  earn_tier: string;
  has_earn_account: boolean;
  bitfinex_connected: boolean;
  telegram_bound: boolean;
  kyc_status: string | null;
}

async function get<T>(path: string, cookieHeader: string): Promise<T | null> {
  const res = await fetch(`${SERVER_API_BASE_URL}${path}`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const w = (await res.json()) as { success: boolean; data?: T };
  return w.success && w.data !== undefined ? w.data : null;
}

export async function fetchAdminFunnelOverview(
  cookieHeader: string,
): Promise<FunnelOverview | null> {
  return get<FunnelOverview>("/api/admin/funnel/overview", cookieHeader);
}

export async function fetchAdminFunnelUsers(
  cookieHeader: string,
): Promise<FunnelUser[] | null> {
  return get<FunnelUser[]>("/api/admin/funnel/users", cookieHeader);
}
