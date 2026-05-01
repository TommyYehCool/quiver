/**
 * Server-side earn fetchers — RSC 用,直接打 docker compose 內部 api service。
 */

import type {
  EarnAccountDetailOut,
  EarnAccountListOut,
  FriendApySummary,
} from "@/lib/api/earn";

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

export async function listEarnAccountsServer(
  cookieHeader: string,
  opts: { includeArchived?: boolean } = {},
): Promise<EarnAccountListOut | null> {
  const qs = opts.includeArchived ? "?include_archived=true" : "";
  return get<EarnAccountListOut>(`/api/admin/earn/accounts${qs}`, cookieHeader);
}

export async function getEarnAccountDetailServer(
  id: number,
  cookieHeader: string,
): Promise<EarnAccountDetailOut | null> {
  return get<EarnAccountDetailOut>(
    `/api/admin/earn/accounts/${id}`,
    cookieHeader,
  );
}

export async function fetchEarnRankingServer(
  cookieHeader: string,
): Promise<FriendApySummary[] | null> {
  return get<FriendApySummary[]>("/api/admin/earn/ranking", cookieHeader);
}
