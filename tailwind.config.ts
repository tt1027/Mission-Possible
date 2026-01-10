import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-fira-code)", "monospace"],
      },
      colors: {
        cream: {
          50: "#fafaf7",
          100: "#f5f5f0",
          200: "#eeeee8",
          300: "#e5e5df",
          400: "#d4d4ce",
          500: "#b8b8b2",
        },
        ink: {
          900: "#1a1a1a",
          800: "#2d2d2d",
          700: "#404040",
          600: "#525252",
          500: "#6b6b6b",
          400: "#8a8a8a",
          300: "#a3a3a3",
        },
      },
      animation: {
        "fade-in": "fadeIn 0.15s ease-out",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
