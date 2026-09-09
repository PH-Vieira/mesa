import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        felt: {
          DEFAULT: "#0b2e24",
          deep: "#061912",
          mid: "#134233",
          rim: "#1d5c46",
        },
        gold: {
          DEFAULT: "#e0b34a",
          dim: "#a67c2d",
          soft: "#f3e6c4",
        },
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        display: ["Fraunces", "Georgia", "serif"],
      },
      boxShadow: {
        chip: "0 8px 0 #7a1f1f, 0 12px 24px rgba(0,0,0,.35)",
        inset: "inset 0 1px 0 rgba(255,255,255,.08)",
      },
    },
  },
  plugins: [],
} satisfies Config;
