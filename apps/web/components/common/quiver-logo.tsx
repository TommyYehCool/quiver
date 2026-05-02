/**
 * Quiver brand mark v9 — based on Tommy's upload design.
 *
 * 經過 SVGO + 色彩合併 + path merge 優化:
 * 原 1.8 MB → 484 KB raw / 142 KB gzip(縮 92%)
 * 用 <img src> 引用而非 inline,讓瀏覽器 cache 好。
 *
 * lockup 變體用 <img> + Sora 字體 wordmark 並排。
 */

type Variant = "mark" | "lockup";
type Theme = "auto" | "light" | "dark";

interface QuiverLogoProps {
  variant?: Variant;
  size?: number;
  theme?: Theme;
  className?: string;
}

export function QuiverLogo({
  variant = "mark",
  size = 32,
  theme = "auto",
  className,
}: QuiverLogoProps) {
  if (variant === "mark") {
    return (
      <img
        src="/logo/mark.svg"
        alt="Quiver"
        width={size}
        height={size}
        className={className}
      />
    );
  }
  return <Lockup size={size} theme={theme} className={className} />;
}

function Lockup({
  size,
  theme,
  className,
}: {
  size: number;
  theme: Theme;
  className?: string;
}) {
  // 根據 theme 決定 wordmark 顏色
  const textColor =
    theme === "auto"
      ? "currentColor"
      : theme === "light"
      ? "#0F172A"
      : "#FFFFFF";

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.25,
      }}
    >
      <img
        src="/logo/mark.svg"
        alt="Quiver"
        width={size}
        height={size}
      />
      <span
        style={{
          fontFamily: "var(--font-sora), 'Sora', system-ui, sans-serif",
          fontSize: size * 0.55,
          fontWeight: 700,
          letterSpacing: "-0.025em",
          color: textColor,
        }}
      >
        Quiver
      </span>
    </span>
  );
}
