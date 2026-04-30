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

export interface WithdrawalSubmitResult {
  withdrawal_id: number;
  status: WithdrawalStatus;
  fee: string;
  needs_admin_review: boolean;
}

export async function submitWithdrawal(input: {
  to_address: string;
  amount: string;
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
