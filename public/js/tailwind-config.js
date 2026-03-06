// js/tailwind-config.js
// Your provided config (kept as-is; used by dashboards + nav)
const cfg = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        primary: "#3365fa",
        "background-light": "#f5f6f8",
        "background-dark": "#0f1423",
        warning: "#F59E0B",
        success: "#22C55E",
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "0.5rem",
        lg: "1rem",
        xl: "1.5rem",
        full: "9999px",
      },
    },
  },
};

window.tailwind = window.tailwind || {};
window.tailwind.config = cfg;
try {
  tailwind.config = cfg;
} catch {}
