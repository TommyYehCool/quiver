"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bindReferralCode } from "@/lib/api/referral";
import type { ReferrerInfo } from "@/lib/api/referral";

/** Strings passed across the RSC boundary must be plain serialisable values —
 * no functions. Use {placeholder} templates and client-side .replace() instead. */
interface BindSectionStrings {
  alreadyBoundTitle: string;
  alreadyBoundDesc: string;
  /** F-5b-X: Template containing "{code}" — replaced at render time with
   * the referrer's actual code (e.g. "你被 TOMMYYEH 推薦"). */
  alreadyBoundByTemplate: string;
  /** Template containing "{date}" — replaced at render time with formatted expiry. */
  windowActiveTemplate: string;
  windowExpired: string;
  windowNotStarted: string;
  bindTitle: string;
  bindDesc: string;
  inputLabel: string;
  inputPlaceholder: string;
  submit: string;
  errors: Record<string, string>;
}

export function BindSection({
  initialReferrer,
  strings,
}: {
  initialReferrer: ReferrerInfo | null;
  strings: BindSectionStrings;
}) {
  const router = useRouter();
  const [referrer, setReferrer] = React.useState(initialReferrer);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await bindReferralCode(draft.trim().toUpperCase());
      setReferrer({
        referrer_user_id: r.referrer_user_id,
        // We just submitted this code, so we know it. F-5b-X.
        referrer_code: draft.trim().toUpperCase(),
        bound_at: r.bound_at,
        binding_source: r.binding_source,
        revshare_started_at: null,
        revshare_expires_at: null,
      });
      setDraft("");
      router.refresh();
    } catch (e) {
      const errCode = (e as { code?: string }).code ?? "referral.codeInvalid";
      setError(strings.errors[errCode] ?? errCode);
    } finally {
      setBusy(false);
    }
  }

  if (referrer) {
    let windowText: string;
    if (referrer.revshare_expires_at) {
      const expires = new Date(referrer.revshare_expires_at);
      windowText = expires.getTime() < Date.now()
        ? strings.windowExpired
        : strings.windowActiveTemplate.replace("{date}", expires.toLocaleDateString());
    } else {
      windowText = strings.windowNotStarted;
    }

    // F-5b-X: prominently display WHO the referrer is so the user can
    // verify the binding matches their expectation. "你被 TOMMYYEH 推薦"
    // is much clearer than the prior generic "you have a referrer" copy.
    const boundByLine = strings.alreadyBoundByTemplate.replace(
      "{code}",
      referrer.referrer_code,
    );
    return (
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{strings.alreadyBoundTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{strings.alreadyBoundDesc}</p>
        </div>
        <div className="rounded-xl border border-emerald-300/60 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600 dark:text-emerald-400" />
            <div className="space-y-1.5">
              <p className="text-base font-semibold text-emerald-900 dark:text-emerald-100">
                {boundByLine}
              </p>
              <p className="text-sm text-emerald-800 dark:text-emerald-200">
                {windowText}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{strings.bindTitle}</h2>
        <p className="mt-1 text-sm text-slate-500">{strings.bindDesc}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="referral-code-bind">{strings.inputLabel}</Label>
        <Input
          id="referral-code-bind"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          placeholder={strings.inputPlaceholder}
          maxLength={12}
          className="font-mono uppercase tracking-widest"
        />
      </div>
      {error ? (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || draft.trim().length < 4}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {strings.submit}
      </Button>
    </form>
  );
}
