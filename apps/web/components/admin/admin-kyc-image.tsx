"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { kycFileUrl } from "@/lib/api/kyc";

/**
 * 透過 fetch + blob 載入受 auth 保護的 KYC 圖片。
 * 直接 `<img src>` 跨 origin 不一定會帶 cookie,fetch + credentials: include 比較穩。
 */
export function AdminKycImage({
  submissionId,
  which,
  label,
}: {
  submissionId: number;
  which: "id_front" | "id_back" | "selfie";
  label: string;
}) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(kycFileUrl(submissionId, which), {
          credentials: "include",
        });
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoked = url;
        setSrc(url);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [submissionId, which]);

  return (
    <div>
      <p className="mb-1 text-xs text-slate-500">{label}</p>
      <div className="aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-800">
        {error ? (
          <div className="flex h-full items-center justify-center text-xs text-red-500">
            載入失敗
          </div>
        ) : src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <a href={src} target="_blank" rel="noreferrer">
            <img
              src={src}
              alt={label}
              className="h-full w-full object-cover transition-transform hover:scale-105"
            />
          </a>
        ) : (
          <div className="flex h-full items-center justify-center text-slate-400">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
}
