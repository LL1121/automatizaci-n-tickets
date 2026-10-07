import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#004F8C",
          dark: "#003E70",
          light: "#EAF4FB",
          cyan: "#0099D8",
          cyanDark: "#0082B8",
        },
        field: {
          bg: "#FFFFFF",
          surface: "#F4F7F9",
          border: "#E2E8F0",
          accent: "#004F8C",
          accentMuted: "#003E70",
          danger: "#DC2626",
          ok: "#059669",
          text: "#1E293B",
          muted: "#64748B",
        },
        status: {
          pendingBg: "#FEF3C7",
          pendingText: "#92400E",
          verifiedBg: "#DCFCE7",
          verifiedText: "#15803D",
          lateBg: "#FEE2E2",
          lateText: "#B91C1C",
        },
      },
      boxShadow: {
        card: "0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.06)",
      },
      minHeight: {
        touch: "48px",
      },
    },
  },
  plugins: [],
};

export default config;
