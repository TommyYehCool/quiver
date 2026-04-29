/**
 * KYC API client（含 user + admin endpoints）。
 */

import { apiFetch } from "@/lib/api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type KycStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface KycSubmission {
  id: number;
  legal_name: string | null;
  id_number: string | null;
  birth_date: string | null;
  country: string | null;
  status: KycStatus;
  reject_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KycSubmitInput {
  legal_name: string;
  id_number: string;
  birth_date: string; // yyyy-mm-dd
  country: string;    // ISO-3166 alpha-2
  id_front: File;
  id_back: File;
  selfie: File;
}

export async function fetchMyKyc(): Promise<KycSubmission | null> {
  return apiFetch<KycSubmission | null>("/api/kyc/me");
}

export async function submitKyc(input: KycSubmitInput): Promise<KycSubmission> {
  const fd = new FormData();
  fd.append("legal_name", input.legal_name);
  fd.append("id_number", input.id_number);
  fd.append("birth_date", input.birth_date);
  fd.append("country", input.country);
  fd.append("id_front", input.id_front);
  fd.append("id_back", input.id_back);
  fd.append("selfie", input.selfie);

  // multipart 不能用 apiFetch（它強制 Content-Type: application/json）
  const res = await fetch(`${API_BASE_URL}/api/kyc/submissions`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = body?.detail ?? { code: "server.internalError" };
    throw Object.assign(new Error(detail.code), {
      code: detail.code,
      params: detail.params ?? {},
      status: res.status,
    });
  }

  if (body?.success === false) {
    throw Object.assign(new Error(body.error?.code), {
      code: body.error?.code ?? "server.internalError",
      params: body.error?.params ?? {},
      status: res.status,
    });
  }

  return body.data as KycSubmission;
}

export function kycFileUrl(submissionId: number, which: "id_front" | "id_back" | "selfie"): string {
  return `${API_BASE_URL}/api/kyc/submissions/${submissionId}/files/${which}`;
}

// ---------- admin ----------

export interface KycAdminListItem {
  id: number;
  user_id: number;
  user_email: string;
  user_display_name: string | null;
  legal_name: string | null;
  country: string | null;
  status: KycStatus;
  created_at: string;
  updated_at: string;
}

export interface KycAdminDetail {
  id: number;
  user_id: number;
  user_email: string;
  user_display_name: string | null;
  legal_name: string | null;
  id_number: string | null;
  birth_date: string | null;
  country: string | null;
  has_id_front: boolean;
  has_id_back: boolean;
  has_selfie: boolean;
  has_proof_of_address: boolean;
  status: KycStatus;
  reject_reason: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KycListResponse {
  items: KycAdminListItem[];
  total: number;
  page: number;
  page_size: number;
}

export async function listKycSubmissions(opts: {
  status?: KycStatus;
  page?: number;
  pageSize?: number;
} = {}): Promise<KycListResponse> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.pageSize) params.set("page_size", String(opts.pageSize));
  const qs = params.toString();
  return apiFetch<KycListResponse>(`/api/admin/kyc${qs ? `?${qs}` : ""}`);
}

export async function getKycSubmission(id: number): Promise<KycAdminDetail> {
  return apiFetch<KycAdminDetail>(`/api/admin/kyc/${id}`);
}

export async function approveKyc(id: number): Promise<KycAdminDetail> {
  return apiFetch<KycAdminDetail>(`/api/admin/kyc/${id}/approve`, { method: "POST" });
}

export async function rejectKyc(id: number, reason: string): Promise<KycAdminDetail> {
  return apiFetch<KycAdminDetail>(`/api/admin/kyc/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
