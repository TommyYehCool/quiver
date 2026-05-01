/**
 * Quiver brand mark — squircle 容器 + Q 圓環 + 突破箭頭
 *
 * 概念:Quiver = 箭袋。圓環是容器,箭頭是「動」(收 / 發 / 成長)。
 * 跟原本 squircle gradient blob 相比,加上有故事的 mark,辨識度更高且 favicon 可用。
 */

type Variant = "mark" | "lockup";
type Theme = "auto" | "light" | "dark";

interface QuiverLogoProps {
  /**
   * "mark" 只 logo icon(預設,headers 通常配 wordmark text);
   * "lockup" 含 wordmark "Quiver" 一起。
   */
  variant?: Variant;
  /** 高度(px)。寬度自動推。 */
  size?: number;
  /** 預設 auto 跟著 dark mode tailwind class 切。 */
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
  // lockup: mark + wordmark
  return <Lockup size={size} theme={theme} className={className} />;
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
      <circle
        cx="21"
        cy="21"
        r="9"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M 27 27 L 37 37"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M 32 37 L 37 37 L 37 32"
        stroke="white"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
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
  // 寬度比例:200/48 = 4.17(svg viewBox 已固定),依 size 推 width
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
        <circle
          cx="21"
          cy="21"
          r="9"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M 27 27 L 37 37"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M 32 37 L 37 37 L 37 32"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>
      <text
        x="60"
        y="33"
        fontFamily="Inter, system-ui, sans-serif"
        fontSize="26"
        fontWeight="600"
        letterSpacing="-0.5"
        className={textColorClass}
      >
        Quiver
      </text>
    </svg>
  );
}
