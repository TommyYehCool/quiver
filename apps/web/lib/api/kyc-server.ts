/**
 * Server-side KYC fetchers — RSC 內用,直接打 docker compose 內部 service name。
 */

import type { KycAdminDetail, KycListResponse, KycStatus } from "@/lib/api/kyc";

const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL ?? "http://api:8000";

async function get<T>(path: string, cookieHeader: string): Promise<T | null> {
  const res = await fetch(`${SERVER_API_BASE_URL}${path}`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const wrapped = (await res.json()) as { success: boolean; data?: T };
  return wrapped.success && wrapped.data !== undefined ? wrapped.data : null;
}

export async function listKycSubmissionsServer(
  cookieHeader: string,
  opts: { status?: KycStatus; page?: number; pageSize?: number } = {},
): Promise<KycListResponse | null> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.pageSize) params.set("page_size", String(opts.pageSize));
  const qs = params.toString();
  return get<KycListResponse>(`/api/admin/kyc${qs ? `?${qs}` : ""}`, cookieHeader);
}

export async function getKycSubmissionServer(
  id: number,
  cookieHeader: string,
): Promise<KycAdminDetail | null> {
  return get<KycAdminDetail>(`/api/admin/kyc/${id}`, cookieHeader);
}
