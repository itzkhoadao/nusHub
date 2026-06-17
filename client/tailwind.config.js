/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "#f8f9fa",
          dim: "#d9dadb",
          bright: "#f8f9fa",
          lowest: "#ffffff",
          low: "#f3f4f5",
          container: "#edeeef",
          high: "#e7e8e9",
          highest: "#e1e3e4",
          variant: "#e1e3e4",
        },
        primary: {
          DEFAULT: "#002754",
          container: "#003d7c",
          fixed: "#d6e3ff",
          "fixed-dim": "#a9c7ff",
        },
        secondary: {
          DEFAULT: "#944a00",
          container: "#fd8614",
          fixed: "#ffdcc5",
          "fixed-dim": "#ffb783",
        },
        tertiary: {
          DEFAULT: "#1c2935",
          container: "#313f4c",
          fixed: "#d6e4f4",
          "fixed-dim": "#bac8d8",
        },
        outline: {
          DEFAULT: "#737781",
          variant: "#c3c6d2",
        },
        app: {
          text: "#191c1d",
          muted: "#434750",
          inverse: "#f0f1f2",
          danger: "#ba1a1a",
        },
      },
      boxShadow: {
        soft: "0 4px 12px rgba(0, 0, 0, 0.05)",
        raised: "0 12px 32px rgba(0, 0, 0, 0.1)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
      },
      maxWidth: {
        app: "1280px",
      },
      spacing: {
        "stack-sm": "0.5rem",
        "stack-md": "1rem",
        "stack-lg": "1.5rem",
      },
    },
  },
  plugins: [],
};
