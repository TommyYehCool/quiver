/**
 * Account self-service API client (phase 6E-1).
 */

import { apiFetch, getApiBase } from "@/lib/api";

export interface LoginSessionItem {
  id: number;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  is_current: boolean;
}

export async function fetchSessions(): Promise<LoginSessionItem[]> {
  const r = await apiFetch<{ items: LoginSessionItem[] }>("/api/me/sessions");
  return r.items;
}

export async function revokeOtherSessions(): Promise<{ revoked: number }> {
  return apiFetch<{ revoked: number }>("/api/me/sessions/revoke-others", {
    method: "POST",
  });
}

export interface DeletionRequestStatus {
  requested_at: string | null;
  completed_at: string | null;
}

export async function getDeletionRequest(): Promise<DeletionRequestStatus> {
  return apiFetch<DeletionRequestStatus>("/api/me/deletion-request");
}

export async function requestDeletion(): Promise<DeletionRequestStatus> {
  return apiFetch<DeletionRequestStatus>("/api/me/deletion-request", {
    method: "POST",
  });
}

export async function cancelDeletion(): Promise<DeletionRequestStatus> {
  return apiFetch<DeletionRequestStatus>("/api/me/deletion-request", {
    method: "DELETE",
  });
}

/**
 * 個資匯出 — 觸發瀏覽器下載 JSON 檔。
 */
export async function downloadMyData(): Promise<void> {
  // Use runtime getApiBase() instead of build-time API_BASE_URL — see kyc.ts
  // header comment for why (Dockerfile doesn't bake NEXT_PUBLIC env vars).
  const res = await fetch(`${getApiBase()}/api/me/export`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error(`export failed: ${res.status}`);
  const blob = await res.blob();
  const filename =
    res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ??
    "quiver-export.json";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------- admin ----------

export interface DeletionRequestRow {
  user_id: number;
  email: string;
  display_name: string | null;
  requested_at: string;
  balance: string;
  completed_at: string | null;
}

export async function fetchDeletionRequests(): Promise<DeletionRequestRow[]> {
  const r = await apiFetch<{ items: DeletionRequestRow[] }>(
    "/api/admin/deletion-requests",
  );
  return r.items;
}

export async function completeDeletion(userId: number): Promise<{ completed_at: string }> {
  return apiFetch<{ completed_at: string }>(
    `/api/admin/deletion-requests/${userId}/complete`,
    { method: "POST" },
  );
}
