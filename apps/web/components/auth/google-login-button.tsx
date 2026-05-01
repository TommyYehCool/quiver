"use client";

import { Button } from "@/components/ui/button";

const BUILD_TIME_API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

/**
 * Google 登入按鈕,根據 window.location 動態決定 URL:
 *
 * - localhost dev:用 build-time env (http://localhost:8000) 直連 api
 * - ngrok / production:用相對路徑(same-origin),nginx proxy /api 到 api 容器
 *
 * 這樣 OAuth redirect_uri 才會跟 browser 的 host 一致,
 * Google callback 才能正確回到 ngrok URL。
 */
export function GoogleLoginButton({
  locale,
  label,
}: {
  locale: string;
  label: string;
}) {
  function handleClick(e: React.MouseEvent<HTMLAnchorElement>) {
    e.preventDefault();
    if (typeof window === "undefined") return;
    const host = window.location.host;
    const isLocalhost =
      host.startsWith("localhost") || host.startsWith("127.");
    const url = isLocalhost
      ? `${BUILD_TIME_API_BASE}/api/auth/google/login?locale=${locale}`
      : `/api/auth/google/login?locale=${locale}`;
    window.location.href = url;
  }

  // SSR 階段給一個 placeholder href(實際 click 時會被 handleClick 覆蓋)
  const ssrHref = `${BUILD_TIME_API_BASE}/api/auth/google/login?locale=${locale}`;

  return (
    <Button asChild size="lg" className="w-full" variant="outline">
      <a href={ssrHref} onClick={handleClick}>
        <GoogleIcon />
        {label}
      </a>
    </Button>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.07-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.9z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2a7.1 7.1 0 0 1-6.7-4.9H1.3v3a12 12 0 0 0 10.7 6.6z"
      />
      <path
        fill="#FBBC05"
        d="M5.3 14.4a7.2 7.2 0 0 1 0-4.6V6.7H1.3a12 12 0 0 0 0 10.7l4-3z"
      />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.7l4 3a7.1 7.1 0 0 1 6.7-5z"
      />
    </svg>
  );
}
