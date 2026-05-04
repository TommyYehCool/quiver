import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1280px" },
    },
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        // Sora — 給品牌 wordmark / 重要 display heading 用
        display: ["var(--font-sora)", "var(--font-inter)", "system-ui", "sans-serif"],
      },
      // Bump base text sizes — Tailwind defaults (12/14/16) felt small vs
      // competitor sites (FULY.AI etc.). +1px on xs/sm; base/lg unchanged.
      // Also bumps `text-[10px]` / `text-[11px]` migrated to `text-xs` to 13px.
      // Side benefit: 1px is small enough not to disrupt tight chip layouts.
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.125rem" }],   // 13px / 18px (was 12/16)
        sm: ["0.9375rem", { lineHeight: "1.375rem" }],   // 15px / 22px (was 14/20)
        // base+ unchanged: 16/24, 18/28, 20/28, 24/32, 30/36
      },
      colors: {
        brand: {
          DEFAULT: "#4F46E5",
          violet: "#7C3AED",
        },
        mint: "#10B981",
        amber: "#F59E0B",
        // 全站背景暖色化:把偏冷淡紫換成奶油色,讓卡片之間的留白也有溫度,
        // 跟 macaron 卡片更協調(原本 #F2ECF8 偏紫所以整頁感覺白白冷冷)
        cream: {
          DEFAULT: "#F7F1EA",
          edge: "#E8DECE",
        },
        paper: "#FCF8F1",
        macaron: {
          rose: "#FBE4E8",
          mint: "#E5F1E5",
          lavender: "#EBE4F1",
          peach: "#FBEFDC",
          lemon: "#FAF1D6",
          sky: "#E5EAF3",
        },
        bubble: {
          peach: "#F5DEC0",
          mint: "#C8E0CC",
          lavender: "#DBCEE7",
          sky: "#CFD9E8",
          rose: "#F2C9D1",
        },
        slate: {
          ink: "#0F172A",
        },
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(45deg, #4F46E5 0%, #7C3AED 100%)",
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      fontVariantNumeric: {
        tabular: "tabular-nums",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
