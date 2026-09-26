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
        brand: "#0F172A",
        surface: {
          DEFAULT: "#FFFFFF",
          subtle: "#F8FAFC",
        },
        border: {
          DEFAULT: "#E2E8F0",
          subtle: "#F1F5F9",
        },
        text: {
          primary: "#0F172A",
          muted: "#64748B",
        },
        status: {
          success: "#15803D",
          error: "#B91C1C",
          warning: "#B45309",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        DEFAULT: "0.375rem",
        md: "0.375rem",
      },
    },
  },
  plugins: [],
};

export default config;
