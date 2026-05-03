"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  cancelSubscription,
  subscribePremium,
  uncancelSubscription,
} from "@/lib/api/subscription";

interface ActionStrings {
  subscribeCta: (price: string) => string;
  cancelCta: string;
  uncancelCta: string;
  errors: Record<string, string>;
}

/** Subscribe button — used when user has no subscription or it's EXPIRED/CANCELLED. */
export function SubscribeButton({
  price,
  strings,
}: {
  price: string;
  strings: ActionStrings;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await subscribePremium();
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "subscription.unknown";
      setError(strings.errors[code] ?? code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={busy} size="lg">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {strings.subscribeCta(price)}
      </Button>
      {error ? (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Cancel button — used when sub is currently active and not yet cancelled. */
export function CancelButton({ strings }: { strings: ActionStrings }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await cancelSubscription();
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "subscription.unknown";
      setError(strings.errors[code] ?? code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={busy} variant="outline">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {strings.cancelCta}
      </Button>
      {error ? (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Uncancel button — undoes a pending cancellation while still in current period. */
export function UncancelButton({ strings }: { strings: ActionStrings }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await uncancelSubscription();
      router.refresh();
    } catch (e) {
      const code = (e as { code?: string }).code ?? "subscription.unknown";
      setError(strings.errors[code] ?? code);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={handleClick} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {strings.uncancelCta}
      </Button>
      {error ? (
        <p className="rounded-lg bg-red-100 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
