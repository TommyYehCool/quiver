import { apiFetch } from "@/lib/api";

export type WithdrawalStatus =
  | "PENDING_REVIEW"
  | "APPROVED"
  | "PROCESSING"
  | "BROADCASTING"
  | "COMPLETED"
  | "REJECTED"
  | "FAILED";

export interface Withdrawal {
  id: number;
  amount: string;
  fee: string;
  currency: string;
  to_address: string;
  status: WithdrawalStatus;
  tx_hash: string | null;
  reject_reason: string | null;
  reviewed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WithdrawalQuote {
  amount: string;
  fee: string;
  total: string;
  currency: string;
  needs_admin_review: boolean;
}

export async function quoteWithdrawal(amount: string): Promise<WithdrawalQuote> {
  return apiFetch<WithdrawalQuote>("/api/withdrawals/quote", {
    method: "POST",
    body: JSON.stringify({ amount }),
  });
}

export type ReviewReason = "LARGE_AMOUNT" | "VELOCITY_COUNT" | "VELOCITY_AMOUNT";

export interface WithdrawalSubmitResult {
  withdrawal_id: number;
  status: WithdrawalStatus;
  fee: string;
  needs_admin_review: boolean;
  review_reason: ReviewReason | null;
}

export async function submitWithdrawal(input: {
  to_address: string;
  amount: string;
  totp_code?: string | null;
}): Promise<WithdrawalSubmitResult> {
  return apiFetch<WithdrawalSubmitResult>("/api/withdrawals", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchMyWithdrawals(): Promise<Withdrawal[]> {
  return apiFetch<Withdrawal[]>("/api/withdrawals/me");
}

// ---- admin ----

export interface AdminWithdrawal {
  id: number;
  user_id: number;
  user_email: string;
  user_display_name: string | null;
  amount: string;
  fee: string;
  currency: string;
  to_address: string;
  status: WithdrawalStatus;
  tx_hash: string | null;
  reject_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface WithdrawalListResp {
  items: AdminWithdrawal[];
  total: number;
  page: number;
  page_size: number;
}

export async function listAdminWithdrawals(opts: {
  status?: WithdrawalStatus;
  page?: number;
  pageSize?: number;
} = {}): Promise<WithdrawalListResp> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.page) params.set("page", String(opts.page));
  if (opts.pageSize) params.set("page_size", String(opts.pageSize));
  const qs = params.toString();
  return apiFetch<WithdrawalListResp>(`/api/admin/withdrawals${qs ? `?${qs}` : ""}`);
}

export async function adminApproveWithdrawal(id: number): Promise<AdminWithdrawal> {
  return apiFetch<AdminWithdrawal>(`/api/admin/withdrawals/${id}/approve`, { method: "POST" });
}

export async function adminRejectWithdrawal(id: number, reason: string): Promise<AdminWithdrawal> {
  return apiFetch<AdminWithdrawal>(`/api/admin/withdrawals/${id}/reject`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export async function adminForceFailWithdrawal(
  id: number,
  reason: string,
): Promise<AdminWithdrawal> {
  return apiFetch<AdminWithdrawal>(`/api/admin/withdrawals/${id}/force-fail`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export interface FeePayerInfo {
  address: string;
  trx_balance: string;
  network: string;
  low_balance_warning: boolean;
}

export async function fetchFeePayer(): Promise<FeePayerInfo> {
  return apiFetch<FeePayerInfo>("/api/admin/platform/fee-payer");
}

export interface HotWalletInfo {
  address: string;
  usdt_balance: string;
  trx_balance: string;
  network: string;
  user_balances_total?: string | null;
  platform_profit?: string | null;
}

export async function fetchHotWallet(): Promise<HotWalletInfo> {
  return apiFetch<HotWalletInfo>("/api/admin/platform/hot-wallet");
}

// phase 6E-2.5 + 6E-4: 平台 outbound quota
export interface OutboundQuota {
  hot_usdt_balance: string;
  user_balances_total: string;
  in_flight_withdrawal_amount: string;
  platform_profit: string;
  fee_withdrawal_max: string;
  cold_rebalance_max: string;
  cold_address: string | null;
  cold_usdt_balance: string | null;
  total_holdings: string;
}

// phase 6E-4: 冷錢包
export interface ColdWalletInfo {
  address: string | null;
  usdt_balance: string | null;
  hot_max_usdt: string;
  hot_target_usdt: string;
  over_max: boolean;
  over_max_amount: string;
  cold_rebalance_max: string;
}

export interface ColdRebalanceResult {
  tx_hash: string;
  amount: string;
  to_address: string;
}

export async function fetchColdWallet(): Promise<ColdWalletInfo> {
  return apiFetch<ColdWalletInfo>("/api/admin/platform/cold-wallet");
}

export async function coldRebalance(input: {
  amount: string;
  totp_code?: string | null;
}): Promise<ColdRebalanceResult> {
  return apiFetch<ColdRebalanceResult>("/api/admin/platform/cold-rebalance", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface FeeWithdrawResult {
  tx_hash: string;
  amount: string;
  to_address: string;
}

export async function fetchOutboundQuota(): Promise<OutboundQuota> {
  return apiFetch<OutboundQuota>("/api/admin/platform/fee-withdraw/quota");
}

export async function feeWithdraw(input: {
  to_address: string;
  amount: string;
  totp_code?: string | null;
}): Promise<FeeWithdrawResult> {
  return apiFetch<FeeWithdrawResult>("/api/admin/platform/fee-withdraw", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface BulkSweepResult {
  dispatched: number;
  user_ids: number[];
}

export async function bulkSweep(): Promise<BulkSweepResult> {
  return apiFetch<BulkSweepResult>("/api/admin/dev/bulk-sweep", { method: "POST" });
}
