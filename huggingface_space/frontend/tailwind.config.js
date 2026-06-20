/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        cp: {
          bg: "#F4F7FB",
          navy: "#0B2545",
          blue: "#1565C0",
          border: "#DCE3ED",
          muted: "#5C6B7A",
          card: "#FFFFFF",
          monitor: "#2E7D32",
          alert: "#F9A825",
          deploy: "#EF6C00",
          maxdeploy: "#C62828",
        },
      },
      fontFamily: {
        sans: ["Inter", "IBM Plex Sans", "Segoe UI", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
