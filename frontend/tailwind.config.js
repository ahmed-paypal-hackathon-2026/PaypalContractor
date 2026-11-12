/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "ui-sans-serif", "system-ui", "sans-serif"],
        cond: ["'Plus Jakarta Sans'", "ui-sans-serif", "sans-serif"],
      },
      colors: {
        // A banking app: navy ink on a soft grey page, one royal blue for money and actions,
        // red only for money owed. The token names stay the same so every page follows.
        ink: { DEFAULT: "#0F1733", soft: "#3D4562", muted: "#7A8099" },
        paper: { DEFAULT: "#F4F5F9", card: "#FFFFFF", line: "#E3E6EF", rule: "#EEF0F6" },
        brand: { DEFAULT: "#2F55EB", dark: "#2245CF", soft: "#EDF1FE", mid: "#5C7BF0", pale: "#C9D4FB" },
        good: { DEFAULT: "#1E7A4A", soft: "#E3F5EB" },
        warn: { DEFAULT: "#8A5A00", soft: "#FDF3DC" },
        bad: { DEFAULT: "#D63A3A", soft: "#FDECEC" },
        hl: { DEFAULT: "#C9D4FB", soft: "#EDF1FE" },
      },
      borderRadius: { DEFAULT: "10px", md: "12px", lg: "16px", xl: "20px", "2xl": "24px", "3xl": "28px" },
      boxShadow: {
        card: "0 1px 2px rgba(15,23,51,.04)",
        pop: "0 20px 48px rgba(15,23,51,.16)",
        float: "0 12px 32px rgba(15,23,51,.12)",
        blue: "0 16px 32px rgba(47,85,235,.28)",
      },
    },
  },
  plugins: [],
};
