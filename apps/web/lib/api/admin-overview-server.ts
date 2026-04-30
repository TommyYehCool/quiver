/**
 * Server-side admin overview fetcher (RSC)。
 */

const SERVER_API_BASE_URL = process.env.SERVER_API_BASE_URL ?? "http://api:8000";

export interface AdminOverview {
  total_users: number;
  active_users: number;
  pending_kyc_count: number;
  pending_deletion_count: number;
  pending_withdrawal_count: number;
  pending_withdrawal_amount: string;
  hot_usdt_balance: string;
  hot_trx_balance: string;
  fee_payer_trx_balance: string;
  user_balances_total: string;
  in_flight_withdrawal_amount: string;
  platform_profit: string;
  fee_payer_low: boolean;
  platform_insolvent: boolean;
}

export async function fetchAdminOverviewServer(
  cookieHeader: string,
): Promise<AdminOverview | null> {
  const res = await fetch(`${SERVER_API_BASE_URL}/api/admin/overview`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const wrapped = (await res.json()) as { success: boolean; data?: AdminOverview };
  return wrapped.success && wrapped.data ? wrapped.data : null;
}
