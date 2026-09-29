/**
 * packages/ui/tokens/tokens.ts
 *
 * TypeScript mirror of `./tokens.css`, for consumers that cannot read CSS custom
 * properties: NativeWind / React Native (apps/mobile), chart libraries that need
 * literal colours, PDF renderers, and the Tailwind preset.
 *
 * THIS FILE AND ./tokens.css ARE THE ONLY PLACES A RAW HEX MAY APPEAR.
 * If a value changes here it MUST change in tokens.css in the same commit — the CSS
 * file is the runtime source of truth for the web; this is the build-time mirror.
 */

/** A colour expressed as space-separated RGB channels, e.g. `"231 233 238"`. */
export type RgbChannels = string;

/** Reference a colour token as a CSS `rgb()` value with an optional alpha. */
export function colorVar(name: ColorTokenName, alpha?: number): string {
  return alpha === undefined ? `rgb(var(--color-${name}))` : `rgb(var(--color-${name}) / ${alpha})`;
}

/** Reference a colour token as a Tailwind-compatible alpha-value template. */
export function tailwindColor(name: ColorTokenName): string {
  return `rgb(var(--color-${name}) / <alpha-value>)`;
}

/* ── Light-neu (default) ─────────────────────────────────────────────────── */
export const lightColors = {
  bg: '231 233 238', // #E7E9EE
  panel: '231 233 238', // #E7E9EE
  well: '224 227 233', // #E0E3E9
  'panel-tint': '236 238 242', // #ECEEF2
  hi: '255 255 255', // #FFFFFF
  sh: '196 200 210', // #C4C8D2
  line: '210 214 222', // #D2D6DE
  edge: '110 116 128', // #6E7480
  ink: '20 22 27', // #14161B
  mist: '84 91 103', // #545B67
  'mist-2': '126 133 147', // #7E8593
  blue: '58 84 214', // #3A54D6
  'blue-strong': '44 58 134', // #2C3A86
  'blue-tint': '228 232 251', // #E4E8FB
  success: '30 158 99', // #1E9E63
  'success-tint': '220 239 228', // #DCEFE4
  'on-success': '255 255 255', // #FFFFFF
  warning: '183 122 18', // #B77A12
  'warning-tint': '243 231 206', // #F3E7CE
  'on-warning': '27 18 6', // #1B1206
  danger: '198 54 59', // #C6363B
  'danger-tint': '245 218 219', // #F5DADB
  'on-danger': '255 255 255', // #FFFFFF
  info: '58 84 214', // #3A54D6 — info IS the brand blue, never a second blue
  'info-tint': '228 232 251', // #E4E8FB
  'on-info': '255 255 255', // #FFFFFF
} as const satisfies Record<string, RgbChannels>;

export type ColorTokenName = keyof typeof lightColors;

/* ── Dark-neu (optional; NEVER auto-applied from prefers-color-scheme) ───── */
/** Values marked DERIVED are not specified in DESIGN.md §2.3 and need designer sign-off. */
export const darkColors = {
  ...lightColors,
  bg: '24 26 32', // #181A20
  panel: '24 26 32', // #181A20
  well: '19 21 25', // #131519
  'panel-tint': '30 33 42', // #1E212A  DERIVED
  hi: '34 37 45', // #22252D
  sh: '12 13 17', // #0C0D11
  line: '38 41 50', // #262932
  edge: '60 65 77', // #3C414D
  ink: '236 238 242', // #ECEEF2
  mist: '154 160 172', // #9AA0AC
  'mist-2': '106 112 128', // #6A7080  DERIVED
  blue: '91 124 250', // #5B7CFA
  'blue-strong': '138 164 255', // #8AA4FF
  'blue-tint': '26 36 64', // #1A2440
  info: '91 124 250', // #5B7CFA
  'success-tint': '18 46 34', // DERIVED
  'warning-tint': '48 35 12', // DERIVED
  'danger-tint': '54 20 22', // DERIVED
  'info-tint': '26 36 64', // DERIVED
  'on-warning': '236 238 242', // DERIVED
} as const satisfies Record<ColorTokenName, RgbChannels>;

/* ── Flat report / print ─────────────────────────────────────────────────── */
export const reportColors = {
  ...lightColors,
  bg: '255 255 255', // #FFFFFF
  panel: '255 255 255', // #FFFFFF
  well: '245 246 248', // #F5F6F8
  'panel-tint': '245 246 248', // #F5F6F8  DERIVED
  line: '210 214 222', // #D2D6DE
  edge: '154 160 172', // #9AA0AC
  blue: '44 58 134', // #2C3A86 — max contrast for print
  'blue-strong': '44 58 134',
  info: '44 58 134',
} as const satisfies Record<ColorTokenName, RgbChannels>;

export const themes = {
  light: lightColors,
  dark: darkColors,
  report: reportColors,
} as const;

export type ThemeName = keyof typeof themes;

/* ── Depth ───────────────────────────────────────────────────────────────── */
export const shadows = {
  'raised-sm': 'var(--nu-raised-sm)',
  'raised-md': 'var(--nu-raised-md)',
  inset: 'var(--nu-inset)',
  flat: 'var(--nu-flat)',
  focus: 'var(--focus-ring)',
} as const;

export type ShadowTokenName = keyof typeof shadows;

export const glass = {
  fill: 'var(--glass-fill)',
  border: 'var(--glass-border)',
  blur: 'var(--glass-blur)',
  fallback: 'var(--glass-fallback)',
} as const;

/* ── Radius · spacing · z · motion · type ────────────────────────────────── */
export const radii = {
  sm: '12px', // buttons, inputs
  md: '16px', // images
  lg: '20px', // product cards, tiles
  xl: '24px', // marketing cards
  full: '9999px', // pills, switches, avatars
} as const;

/** 4px base scale (DESIGN.md §7). */
export const spacing = [4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 72, 88, 96, 120] as const;

export const layout = {
  sectionPad: 'clamp(24px, 7vw, 96px)',
  containerProduct: '1240px',
  containerMarketing: '1400px',
  /** Minimum interactive hit target (WCAG 2.5.8 / DESIGN.md §11). */
  tapMin: '44px',
  measure: '65ch',
} as const;

export const zIndex = {
  sticky: 60,
  dropdown: 1000,
  overlay: 1100,
  modal: 1200,
  toast: 1300,
  tooltip: 1400,
} as const;

export const motion = {
  /** The ONE easing. */
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  durFast: '120ms', // the press
  durBase: '180ms',
  durSlow: '240ms',
} as const;

export const fontFamilies = {
  sans: "'Outfit Variable', Outfit, system-ui, sans-serif",
  mono: "'Geist Mono Variable', 'Geist Mono', ui-monospace, SFMono-Regular, monospace",
  ar: "'IBM Plex Sans Arabic', var(--font-sans)",
} as const;

/**
 * Fluid type scale. Each entry is `[size, { lineHeight, letterSpacing, fontWeight }]`
 * so it can be dropped straight into Tailwind's `fontSize` map.
 *
 * The `label` role is Latin-only: Arabic labels drop the uppercase transform and the
 * tracking (see `.qm-label--ar` in tokens.css and `labelClass()` in @qmulate/i18n).
 */
export const typeScale = {
  display: [
    'var(--fs-display)',
    { lineHeight: 'var(--lh-display)', letterSpacing: 'var(--tr-display)', fontWeight: '300' },
  ],
  h1: [
    'var(--fs-h1)',
    { lineHeight: 'var(--lh-h1)', letterSpacing: 'var(--tr-h1)', fontWeight: '600' },
  ],
  h2: [
    'var(--fs-h2)',
    { lineHeight: 'var(--lh-h2)', letterSpacing: 'var(--tr-h2)', fontWeight: '600' },
  ],
  h3: [
    'var(--fs-h3)',
    { lineHeight: 'var(--lh-h3)', letterSpacing: 'var(--tr-h3)', fontWeight: '500' },
  ],
  body: ['var(--fs-body)', { lineHeight: 'var(--lh-body)', letterSpacing: '0', fontWeight: '400' }],
  'body-sm': [
    'var(--fs-body-sm)',
    { lineHeight: 'var(--lh-body-sm)', letterSpacing: '0', fontWeight: '400' },
  ],
  label: [
    'var(--fs-label)',
    { lineHeight: 'var(--lh-label)', letterSpacing: 'var(--tr-label)', fontWeight: '500' },
  ],
} as const;

/**
 * Serialise a theme's colour tokens as a CSS declaration block. Used by
 * `<ThemeScope>`-style wrappers and by PDF/report renderers that must inline the
 * palette rather than link the stylesheet.
 */
export function themeCssVars(theme: ThemeName): Record<string, string> {
  return Object.fromEntries(
    Object.entries(themes[theme]).map(([name, channels]) => [`--color-${name}`, channels]),
  );
}

export const tokens = {
  themes,
  shadows,
  glass,
  radii,
  spacing,
  layout,
  zIndex,
  motion,
  fontFamilies,
  typeScale,
} as const;

export default tokens;
