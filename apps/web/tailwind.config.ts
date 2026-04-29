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
      },
      colors: {
        brand: {
          DEFAULT: "#4F46E5",
          violet: "#7C3AED",
        },
        mint: "#10B981",
        amber: "#F59E0B",
        cream: {
          DEFAULT: "#F2ECF8",
          edge: "#DDD3EC",
        },
        paper: "#FAF7FE",
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
