/**
 * Quiver brand mark — squircle bg + 八邊形 Q outline + 右下實心三角形
 *
 * v6 設計改變:
 * - Q 形狀從圓 / 方圓形改成 octagonal(8 邊形)— 角度感最強
 * - 右下三角形貼著 outline 內側,像 Q 的尾巴 / 從箭袋射出的箭頭
 * - 比 v5 的方圓形更 distinctive,跟 fuly.ai 的 hexagon 撞臉風險也控制住
 *   (它是 6 邊,我們是 8 邊,且我們有 Q 尾巴特徵)
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

function MarkInner() {
  return (
    <>
      {/* 白色 octagonal outline (8 邊形,top/right/bottom/left 4 個短邊 + 4 個 45° 切角) */}
      <path
        d="M 16 6 L 32 6 L 42 16 L 42 32 L 32 42 L 16 42 L 6 32 L 6 16 Z"
        stroke="white"
        strokeWidth="3.5"
        fill="none"
        strokeLinejoin="round"
      />
      {/* 右下實心三角形(Q 尾巴/箭頭),right-angle 貼右下角內側 */}
      <path d="M 28 36 L 38 36 L 38 26 Z" fill="white" />
    </>
  );
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
