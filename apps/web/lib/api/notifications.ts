import { apiFetch } from "@/lib/api";

export type NotificationType =
  | "DEPOSIT_POSTED"
  | "TRANSFER_RECEIVED"
  | "KYC_APPROVED"
  | "KYC_REJECTED"
  | "WITHDRAWAL_COMPLETED"
  | "WITHDRAWAL_FAILED"
  | "WITHDRAWAL_REJECTED";

export interface NotificationItem {
  id: number;
  type: NotificationType;
  params: Record<string, unknown> | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListResp {
  items: NotificationItem[];
  total: number;
  unread: number;
}

export async function fetchNotifications(
  limit = 20,
  offset = 0,
): Promise<NotificationListResp> {
  return apiFetch<NotificationListResp>(
    `/api/notifications?limit=${limit}&offset=${offset}`,
  );
}

export async function fetchUnreadCount(): Promise<number> {
  const r = await apiFetch<{ unread: number }>("/api/notifications/unread-count");
  return r.unread;
}

export async function markRead(id: number): Promise<number> {
  const r = await apiFetch<{ unread: number }>(`/api/notifications/${id}/read`, {
    method: "POST",
  });
  return r.unread;
}

export async function markAllRead(): Promise<void> {
  await apiFetch<{ unread: number }>("/api/notifications/read-all", {
    method: "POST",
  });
}
