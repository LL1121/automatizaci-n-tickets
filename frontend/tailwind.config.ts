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
          DEFAULT: "#0066CC",
          dark: "#004C99",
          light: "#E6F0FA",
        },
        field: {
          bg: "#FFFFFF",
          surface: "#F8F9FA",
          border: "#DEE2E6",
          accent: "#0066CC",
          accentMuted: "#004C99",
          danger: "#DC2626",
          ok: "#059669",
          text: "#333333",
          muted: "#495057",
        },
        status: {
          pendingBg: "#FEF3C7",
          pendingText: "#92400E",
          verifiedBg: "#D1FAE5",
          verifiedText: "#065F46",
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
