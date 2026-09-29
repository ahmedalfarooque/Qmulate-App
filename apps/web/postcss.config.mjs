/**
 * Tailwind 3.4 (not v4) — see the note at the top of `@qmulate/ui/tailwind-preset`:
 * DESIGN.md §10 specifies a v3-syntax preset, and NativeWind v4 (apps/mobile) pins
 * `tailwindcss@^3.4`. v4's `@tailwindcss/postcss` plugin is therefore NOT used here.
 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
