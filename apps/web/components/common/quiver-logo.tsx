/**
 * Quiver brand mark v7 — 真正 Q 字母感 + 乾淨幾何
 *
 * 設計演化:
 * v6: 八邊形 outline + 三角形 → 看起來像「容器 + 三角」非 Q
 * v7: 六邊形 Q with 內圈空洞 + 尾巴 → 真正 Q 字母感
 *
 * 結構:
 * - 外六角形(pointy-top,r=18,中心 24,24)
 * - 內六角形空洞(r=8,Q 的 counter)
 * - 右下三角形尾巴(extending outward at 45°)
 *
 * 用 evenodd fill rule 一個 path 同時做外形 + 內洞,SVG 簡潔。
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
    return <Mark size={size} className={className} />;
  }
  return <Lockup size={size} theme={theme} className={className} />;
}

/** Q glyph 路徑(外形 + 內洞 + 尾巴,單一 path 用 evenodd fill)*/
const Q_PATH =
  // 外形(含尾巴):從頂點順時針
  "M 24 6 L 39 15 L 39 33 L 43 39 L 32 39 L 24 42 L 9 33 L 9 15 Z " +
  // 內洞:同方向 hexagon,evenodd 自動鏤空
  "M 24 16 L 31 20 L 31 28 L 24 32 L 17 28 L 17 20 Z";

function MarkInner() {
  return <path d={Q_PATH} fill="white" fillRule="evenodd" />;
}

function Mark({ size, className }: { size: number; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      width={size}
      height={size}
      fill="none"
      className={className}
      aria-label="Quiver"
      role="img"
    >
      <defs>
        <linearGradient
          id="quiver-mark-grad"
          x1="0"
          y1="0"
          x2="48"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <path
        d="M 24 1.5 C 8 1.5 1.5 8 1.5 24 C 1.5 40 8 46.5 24 46.5 C 40 46.5 46.5 40 46.5 24 C 46.5 8 40 1.5 24 1.5 Z"
        fill="url(#quiver-mark-grad)"
      />
      <MarkInner />
    </svg>
  );
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
  const width = (size * 200) / 48;
  const textColorClass =
    theme === "auto"
      ? "fill-slate-900 dark:fill-white"
      : theme === "light"
      ? "fill-slate-900"
      : "fill-white";

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 200 48"
      width={width}
      height={size}
      fill="none"
      className={className}
      aria-label="Quiver"
      role="img"
    >
      <defs>
        <linearGradient
          id="quiver-lockup-grad"
          x1="0"
          y1="0"
          x2="48"
          y2="48"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="100%" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <g>
        <path
          d="M 24 1.5 C 8 1.5 1.5 8 1.5 24 C 1.5 40 8 46.5 24 46.5 C 40 46.5 46.5 40 46.5 24 C 46.5 8 40 1.5 24 1.5 Z"
          fill="url(#quiver-lockup-grad)"
        />
        <MarkInner />
      </g>
      <text
        x="60"
        y="33"
        fontFamily="var(--font-sora), 'Sora', system-ui, sans-serif"
        fontSize="26"
        fontWeight="700"
        letterSpacing="-0.5"
        className={textColorClass}
      >
        Quiver
      </text>
    </svg>
  );
}
