/**
 * Client-side fetchers for /api/telegram/* (F-5a-4.1).
 */

import { apiFetch } from "@/lib/api";

export interface TelegramBindCodeOut {
  bind_code: string;
  deep_link: string;
  expires_at: string;
  bot_username: string;
}

export interface TelegramStatusOut {
  bot_configured: boolean;
  bot_username: string | null;
  bound: boolean;
  chat_id: number | null;
  username: string | null;
  bound_at: string | null;
}

export async function generateTelegramBindCode(): Promise<TelegramBindCodeOut> {
  return apiFetch<TelegramBindCodeOut>("/api/telegram/generate-bind-code", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function disconnectTelegram(): Promise<TelegramStatusOut> {
  return apiFetch<TelegramStatusOut>("/api/telegram/disconnect", {
    method: "DELETE",
  });
}

export async function fetchTelegramStatus(): Promise<TelegramStatusOut> {
  return apiFetch<TelegramStatusOut>("/api/telegram/status");
}
