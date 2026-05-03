"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setReferralCode } from "@/lib/api/referral";

interface CodeSectionStrings {
  haveCodeTitle: string;
  haveCodeDesc: string;
  shareLinkLabel: string;
  copy: string;
  copied: string;
  setTitle: string;
  setDesc: string;
  inputLabel: string;
  inputPlaceholder: string;
  rules: string;
  submit: string;
  errors: Record<string, string>;
}

export function CodeSection({
  initialCode,
  shareUrlTemplate,
  strings,
}: {
  initialCode: string | null;
  shareUrlTemplate: string;
  strings: CodeSectionStrings;
}) {
  const router = useRouter();
  const [code, setCode] = React.useState(initialCode);
  const [draft, setDraft] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await setReferralCode(draft.trim().toUpperCase());
      setCode(r.code);
      setDraft("");
      router.refresh();
    } catch (e) {
      const errCode = (e as { code?: string }).code ?? "referral.codeInvalid";
      setError(strings.errors[errCode] ?? errCode);
    } finally {
      setBusy(false);
    }
  }

  if (code) {
    const shareUrl = shareUrlTemplate.replace("{code}", code);
    return (
      <div className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold">{strings.haveCodeTitle}</h2>
          <p className="mt-1 text-sm text-slate-500">{strings.haveCodeDesc}</p>
        </div>
        <div className="rounded-xl border border-cream-edge bg-paper p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="text-xs uppercase tracking-wider text-slate-500">{strings.haveCodeTitle}</div>
          <div className="mt-1 font-mono text-2xl font-semibold tracking-widest">
            {code}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{strings.shareLinkLabel}</Label>
          <div className="flex items-center gap-2">
            <Input value={shareUrl} readOnly className="font-mono text-xs" />
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(shareUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* ignore */
                }
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? strings.copied : strings.copy}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{strings.setTitle}</h2>
        <p className="mt-1 text-sm text-slate-500">{strings.setDesc}</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="referral-code-set">{strings.inputLabel}</Label>
        <Input
          id="referral-code-set"
          value={draft}
          onChange={(e) => setDraft(e.target.value.toUpperCase())}
          placeholder={strings.inputPlaceholder}
          maxLength={12}
          className="font-mono uppercase tracking-widest"
        />
        <p className="text-xs text-slate-500">{strings.rules}</p>
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
