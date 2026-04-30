/**
 * Server-side withdrawal fetchers — RSC 用,直接打 docker compose 內部 service。
 */

import type {
  AdminWithdrawal,
  ColdWalletInfo,
  FeePayerInfo,
  HotWalletInfo,
  WithdrawalListResp,
  WithdrawalStatus,
} from "@/lib/api/withdrawal";

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

export async function listAdminWithdrawalsServer(
  cookieHeader: string,
  opts: { status?: WithdrawalStatus; page?: number; pageSize?: number } = {},
): Promise<WithdrawalListResp | null> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.pageSize) params.set("page_size", String(opts.pageSize));
  const qs = params.toString();
  return get<WithdrawalListResp>(`/api/admin/withdrawals${qs ? `?${qs}` : ""}`, cookieHeader);
}

export async function getAdminWithdrawalServer(
  id: number,
  cookieHeader: string,
): Promise<AdminWithdrawal | null> {
  return get<AdminWithdrawal>(`/api/admin/withdrawals/${id}`, cookieHeader);
}

export async function fetchFeePayerServer(cookieHeader: string): Promise<FeePayerInfo | null> {
  return get<FeePayerInfo>("/api/admin/platform/fee-payer", cookieHeader);
}

export async function fetchHotWalletServer(cookieHeader: string): Promise<HotWalletInfo | null> {
  return get<HotWalletInfo>("/api/admin/platform/hot-wallet", cookieHeader);
}

export async function fetchColdWalletServer(cookieHeader: string): Promise<ColdWalletInfo | null> {
  return get<ColdWalletInfo>("/api/admin/platform/cold-wallet", cookieHeader);
}
