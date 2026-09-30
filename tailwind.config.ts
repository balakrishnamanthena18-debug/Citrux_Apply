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
          DEFAULT: "#12A150",
          hover: "#0E8541",
          dark: "#0B3B2C",
          lime: "#C6F432",
          tint: "rgba(18, 161, 80, 0.08)",
          subtle: "rgba(18, 161, 80, 0.04)",
        },
        surface: {
          DEFAULT: "#FFFFFF",
          canvas: "#F7F9F8",
          subtle: "#F2F5F3",
          card: "#FFFFFF",
        },
        border: {
          DEFAULT: "#E5EAE7",
          soft: "#EDF1EF",
          subtle: "#F0F4F2",
          focus: "#12A150",
        },
        text: {
          primary: "#0F1720",
          secondary: "#64748B",
          muted: "#94A3B8",
        },
        status: {
          success: "#12A150",
          warning: "#D97706",
          error: "#DC2626",
          info: "#2563EB",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-plus-jakarta)",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Plus Jakarta Sans"',
          '"Inter"',
          '"Segoe UI"',
          "Roboto",
          "sans-serif",
        ],
      },
      borderRadius: {
        'card-lg': '20px',
        'card': '16px',
        'input': '11px',
        'btn': '11px',
      },
      boxShadow: {
        'fintech-card': '0 4px 18px rgba(15, 23, 32, 0.04)',
        'fintech-hover': '0 6px 22px rgba(15, 23, 32, 0.07)',
        'fintech-command': '0 8px 30px rgba(11, 59, 44, 0.12)',
      },
    },
  },
  plugins: [],
};

export default config;
