/**
 * Earn admin API client — Friends Tooling F-Phase 1。
 */

import { apiFetch } from "@/lib/api";

export type EarnTier = "none" | "internal" | "friend" | "commercial";
export type CustodyMode = "self" | "platform";
export type BitfinexPermissions = "read" | "read+funding-write";

// ──── outputs ────

export interface FriendUserOption {
  id: number;
  email: string;
  display_name: string | null;
  earn_tier: EarnTier;
}

export interface EarnAccountOut {
  id: number;
  user_id: number;
  user_email: string;
  user_display_name: string | null;
  earn_tier: EarnTier;

  custody_mode: CustodyMode;
  perf_fee_bps: number;
  can_quiver_operate: boolean;

  onboarded_by: number | null;
  onboarded_by_email: string | null;
  risk_acknowledged_at: string | null;
  notes: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;

  has_active_bitfinex: boolean;
  bitfinex_permissions: BitfinexPermissions | null;
  evm_addresses_count: number;
}

export interface EarnAccountListOut {
  items: EarnAccountOut[];
  total: number;
}

export interface BitfinexConnectionOut {
  id: number;
  is_platform_key: boolean;
  permissions: BitfinexPermissions;
  has_key: boolean;
  created_at: string;
  revoked_at: string | null;
}

export interface EvmAddressOut {
  id: number;
  chain: string;
  address: string;
  is_platform_address: boolean;
  label: string | null;
  created_at: string;
}

export interface PositionSnapshotOut {
  snapshot_date: string;
  bitfinex_funding_usdt: string | null;
  bitfinex_lent_usdt: string | null;
  bitfinex_daily_earned: string | null;
  aave_polygon_usdt: string | null;
  aave_daily_apr: string | null;
  total_usdt: string | null;
}

export interface EarnPipelinePositionOut {
  id: number;
  status: string;
  amount: string;
  currency: string;
  onchain_tx_hash: string | null;
  onchain_broadcast_at: string | null;
  bitfinex_credited_at: string | null;
  bitfinex_offer_id: number | null;
  bitfinex_offer_submitted_at: string | null;
  closed_at: string | null;
  closed_reason: string | null;
  last_error: string | null;
  retry_count: number;
  created_at: string;
}

export interface EarnAccountDetailOut extends EarnAccountOut {
  bitfinex_connections: BitfinexConnectionOut[];
  evm_addresses: EvmAddressOut[];
  recent_snapshots: PositionSnapshotOut[];
  // F-Phase 3 Path A
  auto_lend_enabled: boolean;
  bitfinex_funding_address: string | null;
  pipeline_positions: EarnPipelinePositionOut[];
}

export interface SyncResultOut {
  earn_account_id: number;
  success: boolean;
  bitfinex_funding_usdt: string | null;
  bitfinex_lent_usdt: string | null;
  aave_polygon_usdt: string | null;
  total_usdt: string | null;
  error: string | null;
}

export interface FriendApySummary {
  earn_account_id: number;
  user_email: string;
  user_display_name: string | null;
  total_usdt: string | null;
  avg_30d_apy_pct: string | null;
  bitfinex_share_pct: string | null;
  aave_share_pct: string | null;
}

// ──── inputs ────

export interface CreateEarnAccountIn {
  user_id: number;
  earn_tier: "friend" | "internal";
  custody_mode: CustodyMode;
  perf_fee_bps: number;
  can_quiver_operate: boolean;
  bitfinex_api_key: string;
  bitfinex_api_secret: string;
  bitfinex_permissions: BitfinexPermissions;
  evm_polygon_address?: string | null;
  evm_label?: string | null;
  notes?: string | null;
}

export interface UpdateEarnAccountIn {
  perf_fee_bps?: number;
  can_quiver_operate?: boolean;
  notes?: string;
  archived?: boolean;
}

// ──── client functions ────

export async function fetchEligibleUsers(): Promise<FriendUserOption[]> {
  return apiFetch<FriendUserOption[]>("/api/admin/earn/users");
}

export async function fetchEarnAccounts(opts: {
  includeArchived?: boolean;
} = {}): Promise<EarnAccountListOut> {
  const params = new URLSearchParams();
  if (opts.includeArchived) params.set("include_archived", "true");
  const qs = params.toString();
  return apiFetch<EarnAccountListOut>(
    `/api/admin/earn/accounts${qs ? `?${qs}` : ""}`,
  );
}

export async function fetchEarnAccountDetail(
  id: number,
): Promise<EarnAccountDetailOut> {
  return apiFetch<EarnAccountDetailOut>(`/api/admin/earn/accounts/${id}`);
}

export async function createEarnAccount(
  input: CreateEarnAccountIn,
): Promise<EarnAccountOut> {
  return apiFetch<EarnAccountOut>("/api/admin/earn/accounts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateEarnAccount(
  id: number,
  input: UpdateEarnAccountIn,
): Promise<EarnAccountOut> {
  return apiFetch<EarnAccountOut>(`/api/admin/earn/accounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function revokeBitfinexConnection(
  accountId: number,
  connectionId: number,
): Promise<void> {
  await apiFetch(
    `/api/admin/earn/accounts/${accountId}/connections/${connectionId}/revoke`,
    { method: "POST" },
  );
}

export async function syncEarnAccount(id: number): Promise<SyncResultOut> {
  return apiFetch<SyncResultOut>(`/api/admin/earn/accounts/${id}/sync`, {
    method: "POST",
  });
}

export async function syncAllEarnAccounts(): Promise<SyncResultOut[]> {
  return apiFetch<SyncResultOut[]>("/api/admin/earn/sync-all", {
    method: "POST",
  });
}

export async function fetchEarnRanking(): Promise<FriendApySummary[]> {
  return apiFetch<FriendApySummary[]>("/api/admin/earn/ranking");
}
