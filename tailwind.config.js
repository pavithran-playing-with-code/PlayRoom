/** @type {import('tailwindcss').Config} */
// PlayRoom design system — "Playdate".
// Every colour maps to a CSS variable declared in src/index.css, so the palette
// has ONE source of truth: change a token there and both Tailwind classes and
// inline var() usages follow.
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        // ── Playdate palette ──
        paper:    "var(--paper)",
        paper2:   "var(--paper2)",
        card:     "var(--card)",
        ink:      "var(--ink)",
        "ink-soft": "var(--ink-soft)",
        shade:    "var(--shade)",
        sun:      "var(--sun)",
        coral:    "var(--coral)",
        mint:     "var(--mint)",
        grape:    "var(--grape)",
        sky:      "var(--sky)",
        lime:     "var(--lime)",
        bubble:   "var(--bubble)",
      },
      borderColor: {
        DEFAULT: "var(--ink)",
      },
      borderWidth: {
        3: "3px",
        4: "4px",
      },
      borderRadius: {
        DEFAULT: "var(--r)",
        xl: "var(--r)",
        "2xl": "var(--r-lg)",
        "3xl": "var(--r-xl)",
      },
      fontFamily: {
        sans:    ["Nunito", "system-ui", "sans-serif"],
        display: ["Fredoka", "Nunito", "system-ui", "sans-serif"],
      },
      boxShadow: {
        // hard offset shadows only — no blur anywhere in this theme
        pop:  "0 5px 0 var(--ink)",
        lift: "0 7px 0 var(--ink)",
        tile: "0 12px 0 var(--ink)",
        flat: "0 0 0 var(--ink)",
      },
      keyframes: {
        bob: { "0%,100%": { transform: "translateY(0) rotate(-6deg)" }, "50%": { transform: "translateY(-16px) rotate(6deg)" } },
        sway: { "0%,100%": { transform: "rotate(-3deg)" }, "50%": { transform: "rotate(3deg)" } },
        "fade-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "translateY(0)" } },
        "pop-in": { from: { opacity: "0", transform: "scale(0.95)" }, to: { opacity: "1", transform: "scale(1)" } },
        drop: { from: { opacity: "0", transform: "translateY(-8px) scale(0.97)" }, to: { opacity: "1", transform: "translateY(0) scale(1)" } },
        hop: { from: { opacity: "0", transform: "translate(-50%,14px) scale(0.9)" }, to: { opacity: "1", transform: "translate(-50%,0) scale(1)" } },
      },
      animation: {
        bob: "bob 4.5s ease-in-out infinite",
        sway: "sway 3.4s ease-in-out infinite",
        "fade-in": "fade-in 0.25s ease-out",
        "pop-in": "pop-in 0.16s cubic-bezier(.34,1.7,.64,1)",
        drop: "drop 0.16s cubic-bezier(.34,1.7,.64,1)",
        hop: "hop 0.22s cubic-bezier(.34,1.7,.64,1)",
      },
    },
  },
  plugins: [],
};
