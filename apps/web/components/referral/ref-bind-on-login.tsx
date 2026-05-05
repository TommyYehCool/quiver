"use client";

/**
 * RefBindOnLogin — F-5b-X.
 *
 * Lives on the (app) layout (rendered for every authenticated page).
 * Reads the `pending_ref` cookie (set by RefCookieCapture on the marketing
 * landing page) and tries to bind the user via /api/referral/bind.
 *
 * Idempotent + safe to mount everywhere:
 *   - No cookie → no-op
 *   - User already bound → API returns "alreadyBound" error → still clear
 *     the cookie (no point retrying) but don't surface the error
 *   - Self-referral → backend rejects, we clear the cookie silently
 *   - Code not found → clear cookie silently (typo)
 *   - Network error → keep the cookie so the next page load can retry
 *
 * Successful bind triggers a router.refresh() so the referral page +
 * dashboard pick up the new state without a hard reload.
 */

import * as React from "react";
import { useRouter } from "next/navigation";

import { bindReferralCode } from "@/lib/api/referral";
import {
  clearPendingRefCookie,
  readPendingRefCookie,
} from "@/components/referral/ref-cookie-capture";

export function RefBindOnLogin() {
  const router = useRouter();

  React.useEffect(() => {
    const code = readPendingRefCookie();
    if (!code) return;
    let cancelled = false;
    void (async () => {
      try {
        await bindReferralCode(code);
        if (cancelled) return;
        clearPendingRefCookie();
        // Refresh so /referral page + dashboard reflect the new binding.
        router.refresh();
      } catch (e) {
        if (cancelled) return;
        const errCode = (e as { code?: string }).code ?? "";
        // Permanent failures: clear cookie so we don't keep retrying
        // every page load. Transient (network) failures: keep cookie.
        const PERMANENT = new Set([
          "referral.alreadyBound",
          "referral.codeNotFound",
          "referral.codeInvalid",
          "referral.selfReferral",
          "referral.cycleDetected",
        ]);
        if (PERMANENT.has(errCode)) {
          clearPendingRefCookie();
        }
        // Otherwise leave cookie in place — next page load tries again.
      }
    })();
    return () => {
      cancelled = true;
    };
    // Empty dep array = run once per layout mount (not per route change)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
