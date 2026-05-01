/**
 * Quiver brand mark — squircle bg + 外框白 Q outline + 右下實心三角形
 *
 * 設計演化:
 * v1: 通用紫色 blob ❌(無 character)
 * v2: 圓圈 + 對角箭頭 ❌(像男性符號 ♂)
 * v3: 3 個堆疊 chevron ✓(避開 ♂ 但跟「箭袋」連結弱)
 * v4: Q 圓環 + 右下小三角 ✓(有 Q 識別)
 * v5: Q outline(方圓形)+ 右下角填充三角形 ← 現在版本
 *
 * v5 概念:
 * - 用 outline 方圓形(像 hexagonal Q)取代圓環,角度感強
 * - 右下角實心三角形像「Q 的尾巴」/「箭頭從箭袋射出」
 * - Triangle 跟 outline 共邊,視覺上「補滿」一個角
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
      {/* 白色方圓形 outline(內 Q),比 bg squircle 小一圈 */}
      <path
        d="M 24 8 C 14 8 8 14 8 24 C 8 34 14 40 24 40 C 34 40 40 34 40 24 C 40 14 34 8 24 8 Z"
        stroke="white"
        strokeWidth="3.8"
        fill="none"
      />
      {/* 右下角實心三角形(Q 的尾巴/箭頭),跟 outline 在 corner 共邊 */}
      <path d="M 28 36 L 40 36 L 40 24 Z" fill="white" />
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
      {/* Sora 字體更幾何 / display 感,呼應 mark 的角度感 */}
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
