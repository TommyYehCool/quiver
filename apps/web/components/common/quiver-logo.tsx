/**
 * Quiver brand mark — squircle + 3 個堆疊向上的 chevron
 *
 * 概念:Quiver = 箭袋。3 個 chevron 堆疊代表「收齊在箭袋裡的 arrows」,
 * 整體向上指 = 成長 / 收進來。避開了 ◯+↗ 那個男性符號的視覺陷阱。
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

/**
 * 純 mark — squircle + 3 個堆疊 chevron。
 * 三個 chevron 由下到上漸縮,模擬「箭羽收進箭袋、頂端是箭尖出鞘」。
 */
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
      {/* Squircle 容器 */}
      <path
        d="M 24 1.5 C 8 1.5 1.5 8 1.5 24 C 1.5 40 8 46.5 24 46.5 C 40 46.5 46.5 40 46.5 24 C 46.5 8 40 1.5 24 1.5 Z"
        fill="url(#quiver-mark-grad)"
      />
      {/* 3 個堆疊 chevron(由下到上,寬度漸縮)*/}
      <g
        stroke="white"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* 底部 chevron(最寬)*/}
        <path d="M 13 33 L 24 24 L 35 33" />
        {/* 中部 chevron */}
        <path d="M 14 25 L 24 16 L 34 25" />
        {/* 頂部 chevron(略小,像箭尖)*/}
        <path d="M 17 17 L 24 11 L 31 17" />
      </g>
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
        <g
          stroke="white"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          <path d="M 13 33 L 24 24 L 35 33" />
          <path d="M 14 25 L 24 16 L 34 25" />
          <path d="M 17 17 L 24 11 L 31 17" />
        </g>
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
