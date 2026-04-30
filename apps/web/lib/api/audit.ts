/**
 * Admin audit log API client (phase 6E-3).
 */

import { apiFetch } from "@/lib/api";

export interface AuditLogItem {
  id: number;
  actor_id: number | null;
  actor_email: string | null;
  actor_kind: string;
  action: string;
  target_kind: string | null;
  target_id: number | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface AuditListResp {
  items: AuditLogItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuditFilter {
  actor_id?: number;
  action?: string;
  target_kind?: string;
  target_id?: number;
  page?: number;
  page_size?: number;
}

export async function fetchAuditLogs(filter: AuditFilter = {}): Promise<AuditListResp> {
  const params = new URLSearchParams();
  if (filter.actor_id !== undefined) params.set("actor_id", String(filter.actor_id));
  if (filter.action) params.set("action", filter.action);
  if (filter.target_kind) params.set("target_kind", filter.target_kind);
  if (filter.target_id !== undefined) params.set("target_id", String(filter.target_id));
  if (filter.page) params.set("page", String(filter.page));
  if (filter.page_size) params.set("page_size", String(filter.page_size));
  const qs = params.toString();
  return apiFetch<AuditListResp>(`/api/admin/audit${qs ? `?${qs}` : ""}`);
}
