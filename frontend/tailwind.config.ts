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
        field: {
          bg: "#0a0a0b",
          surface: "#141416",
          border: "#2a2a2e",
          accent: "#22d3ee",
          accentMuted: "#0891b2",
          danger: "#f43f5e",
          ok: "#34d399",
        },
      },
      minHeight: {
        touch: "48px",
      },
    },
  },
  plugins: [],
};

export default config;
