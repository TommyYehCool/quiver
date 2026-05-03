/**
 * User-facing Subscription API client (F-4c).
 *
 * Mirrors apps/api/app/api/subscription.py.
 */

import { apiFetch } from "@/lib/api";

// ──── types ────

export type SubscriptionStatus =
  | "ACTIVE"
  | "PAST_DUE"
  | "EXPIRED"
  | "CANCELLED";

export interface SubscriptionStateOut {
  status: SubscriptionStatus;
  plan_code: string;
  monthly_usdt: string; // Decimal as string
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  is_currently_active: boolean;
  past_due_since: string | null;
}

export interface SubscriptionMeOut {
  subscription: SubscriptionStateOut | null;
  plan_price_usdt: string;
  plan_period_days: number;
  grace_days: number;
}

export interface PaymentOut {
  id: number;
  amount_usdt: string;
  status: "PAID" | "FAILED";
  failure_reason: string | null;
  period_covered_start: string;
  period_covered_end: string;
  billed_at: string;
}

export interface PaymentsOut {
  items: PaymentOut[];
}

// ──── client ────

export async function fetchSubscriptionMe(): Promise<SubscriptionMeOut> {
  return apiFetch<SubscriptionMeOut>("/api/subscription/me");
}

export async function subscribePremium(): Promise<{
  subscription: SubscriptionStateOut;
}> {
  return apiFetch("/api/subscription/subscribe", { method: "POST" });
}

export async function cancelSubscription(): Promise<{
  subscription: SubscriptionStateOut;
}> {
  return apiFetch("/api/subscription/cancel", { method: "POST" });
}

export async function uncancelSubscription(): Promise<{
  subscription: SubscriptionStateOut;
}> {
  return apiFetch("/api/subscription/uncancel", { method: "POST" });
}

export async function fetchSubscriptionPayments(): Promise<PaymentsOut> {
  return apiFetch<PaymentsOut>("/api/subscription/payments");
}
