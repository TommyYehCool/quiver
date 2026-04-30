/**
 * API client — 直接打後端，cookie 自動帶上。
 * 後端 API base 走 server-side env，前端瀏覽器走 NEXT_PUBLIC_*。
 */

export interface ApiError {
  code: string;
  params?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiCallError extends Error {
  constructor(
    public readonly code: string,
    public readonly params: Record<string, unknown> = {},
    public readonly status: number,
  ) {
    super(`API error: ${code}`);
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    const detail =
      (body as { detail?: ApiError })?.detail ?? { code: "server.internalError" };
    throw new ApiCallError(
      detail.code,
      detail.params ?? {},
      res.status,
    );
  }

  const wrapped = body as ApiResponse<T>;
  if (wrapped && typeof wrapped === "object" && "success" in wrapped) {
    if (!wrapped.success) {
      throw new ApiCallError(
        wrapped.error?.code ?? "server.internalError",
        wrapped.error?.params ?? {},
        res.status,
      );
    }
    return wrapped.data as T;
  }
  return body as T;
}

export interface User {
  id: number;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  roles: string[];
  status: string;
  locale: string;
  created_at: string;
}

export async function fetchMe(): Promise<User | null> {
  try {
    return await apiFetch<User>("/api/auth/me");
  } catch (e) {
    if (e instanceof ApiCallError && e.status === 401) return null;
    throw e;
  }
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE_URL}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export function googleLoginUrl(locale: string): string {
  const params = new URLSearchParams({ locale });
  return `${API_BASE_URL}/api/auth/google/login?${params.toString()}`;
}
