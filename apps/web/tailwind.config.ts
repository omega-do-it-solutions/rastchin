import type { Config } from "tailwindcss";

/**
 * Colors are driven by CSS custom properties (RGB triplets) defined in app/globals.css.
 * Theme switching (dark default / light) swaps those variables, so every Tailwind color
 * utility automatically follows the active theme. `<alpha-value>` keeps opacity modifiers working.
 */
const withVar = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./content/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: withVar("--bg"),
        surface: withVar("--surface"),
        "surface-2": withVar("--surface-2"),
        hairline: withVar("--hairline"),
        text: withVar("--text"),
        muted: withVar("--muted"),
        crimson: {
          DEFAULT: withVar("--crimson"),
          pressed: withVar("--crimson-pressed"),
          content: withVar("--crimson-content"),
          "pressed-content": withVar("--crimson-pressed-content"),
        },
        gold: withVar("--gold"),
        teal: withVar("--teal"),
        blue: withVar("--blue"),
        green: withVar("--green"),
        red: withVar("--red"),
        warn: withVar("--warn"),
      },
      fontFamily: {
        // Active body/display fonts flip per locale (set on the [lang] wrapper).
        sans: ["var(--font-body-active)", "var(--font-vazir)", "system-ui", "sans-serif"],
        display: ["var(--font-display-active)", "var(--font-vazir)", "system-ui", "sans-serif"],
        vazir: ["var(--font-vazir)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        DEFAULT: "8px",
        lg: "12px",
        xl: "20px",
      },
      maxWidth: {
        content: "1200px",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
