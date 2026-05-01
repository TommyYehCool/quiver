/**
 * Quiver brand mark — squircle + Q 圓環 + 右下角向上箭頭三角形
 *
 * 概念融合:
 * - Q 圓環 = 字母 Q 識別 + 「容器」隱喻
 * - 右下角向上指的小三角 = 蓄勢待發的箭(從箭袋射出的瞬間)
 *
 * 為什麼這樣不像 ♂(男性符號)、不像 🔍(搜尋):
 * - 男性符號:circle + 45° 對角線(向 1 點鐘),這裡是「實心三角形向上」
 * - 搜尋:circle + 直線斜出,這裡是「分離的三角形」不是斜線
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
      {/* Q 圓環(粗 stroke,類似品牌字母 Q 的視覺 weight)*/}
      <circle
        cx="21"
        cy="21"
        r="11"
        stroke="white"
        strokeWidth="4.5"
        fill="none"
      />
      {/* 向上三角形,位在 Q 圓環的右下,像從箭袋射出的箭頭 */}
      <path d="M 30 38 L 38 38 L 34 30 Z" fill="white" />
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
