/**
 * Server-side fetcher for user-facing Earn — RSC 用,直接打 docker compose 內部 api。
 */

import type { EarnConnectPreviewOut, EarnMeOut } from "@/lib/api/earn-user";

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
