"use client";

/**
 * RefCookieCapture — F-5b-X.
 *
 * Lives on marketing/landing pages. When the URL has `?ref=XXX`, persists
 * the code to a cookie (`pending_ref`, 7-day TTL, path=/) so it survives
 * the Google OAuth round-trip (which strips URL query params). After
 * successful login, RefBindOnLogin (mounted on the (app) layout) reads
 * this cookie and creates the binding via /api/referral/bind.
 *
 * The cookie is intentionally NOT httpOnly so the frontend can clear it
 * after a successful bind. It carries no secret material — just a public
 * referral code that's been distributed via shareable URLs anyway.
 *
 * After capture, the `ref` param is stripped from the URL via
 * router.replace so it doesn't persist on links the user shares from
 * their address bar (which would mis-attribute their friends to whoever
 * the URL originally encoded).
 */

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

const COOKIE_NAME = "pending_ref";
const COOKIE_TTL_DAYS = 7;

export function RefCookieCapture() {
  const router = useRouter();
  const searchParams = useSearchParams();

  React.useEffect(() => {
    const raw = searchParams.get("ref");
    if (!raw) return;
    // Normalize + validate format (4-12 [A-Z0-9]) before storing —
    // mirrors the backend regex, prevents cookie pollution from random
    // ?ref values like ?ref=foo or ?ref=<script>.
    const code = raw.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,12}$/.test(code)) return;
    // Store the code with a 7-day window. Path=/ so it's readable across
    // marketing → login → dashboard navigation.
    document.cookie = `${COOKIE_NAME}=${code}; path=/; max-age=${COOKIE_TTL_DAYS * 86400}; SameSite=Lax`;
    // Strip ?ref from URL (won't trigger a navigation per Next.js docs)
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ref");
    const next =
      window.location.pathname + (params.toString() ? `?${params}` : "");
    router.replace(next);
  }, [router, searchParams]);

  return null;
}

/** Read the pending_ref cookie value (client-side only). */
export function readPendingRefCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Clear the pending_ref cookie. */
export function clearPendingRefCookie(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
}
