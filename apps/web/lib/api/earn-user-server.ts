/**
 * Server-side fetcher for user-facing Earn — RSC 用,直接打 docker compose 內部 api。
 */

import type {
  EarnConnectPreviewOut,
  EarnFeeSummaryOut,
  EarnMeOut,
  EarnPerformanceOut,
  EarnPublicStatsOut,
} from "@/lib/api/earn-user";

const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL ?? "http://api:8000";

async function get<T>(
  path: string,
  cookieHeader: string,
  opts: { revalidateSec?: number } = {},
): Promise<T | null> {
  const fetchInit: RequestInit & { next?: { revalidate?: number } } = {
    headers: { Cookie: cookieHeader },
  };
  if (opts.revalidateSec !== undefined) {
    fetchInit.next = { revalidate: opts.revalidateSec };
  } else {
    fetchInit.cache = "no-store";
  }
  const res = await fetch(`${SERVER_API_BASE_URL}${path}`, fetchInit);
  if (!res.ok) return null;
  const w = (await res.json()) as { success: boolean; data?: T };
  return w.success && w.data !== undefined ? w.data : null;
}

export async function fetchEarnMeServer(
  cookieHeader: string,
): Promise<EarnMeOut | null> {
  return get<EarnMeOut>("/api/earn/me", cookieHeader);
}

export async function fetchEarnConnectPreviewServer(
  cookieHeader: string,
): Promise<EarnConnectPreviewOut | null> {
  return get<EarnConnectPreviewOut>("/api/earn/connect-preview", cookieHeader);
}

export async function fetchEarnPerformanceServer(
  cookieHeader: string,
): Promise<EarnPerformanceOut | null> {
  return get<EarnPerformanceOut>("/api/earn/performance", cookieHeader);
}

export async function fetchEarnFeesServer(
  cookieHeader: string,
): Promise<EarnFeeSummaryOut | null> {
  return get<EarnFeeSummaryOut>("/api/earn/fees", cookieHeader);
}

/**
 * Public stats — no cookie required (the API endpoint is unauth).
 * Cached at the Next.js level too (60s) so SSR doesn't refetch on every
 * request; matches the API's own cache TTL.
 */
export async function fetchEarnPublicStatsServer(): Promise<EarnPublicStatsOut | null> {
  return get<EarnPublicStatsOut>("/api/earn/public-stats", "", {
    revalidateSec: 60,
  });
}
