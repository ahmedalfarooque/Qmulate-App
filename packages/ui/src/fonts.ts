/**
 * packages/ui/src/fonts.ts — the typeface contract, as data.
 *
 * This module deliberately IMPORTS NOTHING: `apps/web` (the CSS consumer) imports the
 * `@fontsource` files; this package owns the family NAMES the tokens reference and the record
 * of what the brand delivered. It also keeps a `@font-face` generator for the four delivered
 * TTFs, for surfaces that cannot use the web app's CSS (the Expo web build, PDF and email).
 *
 * ⊕ DECIDED (S11, 2026-09-02): Option A — `@fontsource`. The Arabic face had been wired that way
 * since Sprint 1 (`@fontsource/ibm-plex-sans-arabic`, static weights); the Latin gap closed in
 * S11 with `@fontsource-variable/outfit` and `@fontsource-variable/geist-mono`. Every weight
 * DESIGN.md names now has a real face; `MISSING_FONT_WEIGHTS` below is the record of what the
 * BRAND delivered, kept as history, not a live gap. What no test can judge is the rendered
 * glyph — that is the owner's eye on the first screen.
 */

/* ── Family stacks — must stay in step with `--font-sans` / `--font-mono` / `--font-ar`
 *    in tokens/tokens.css. ─────────────────────────────────────────────────────────── */
export const FONT_STACKS = {
  /** Display + body. Q5 is closed: Outfit, not Madani (no Madani file was ever delivered). */
  sans: "'Outfit Variable', Outfit, system-ui, sans-serif",
  /** Labels, IDs, deed numbers, IBANs, SAR figures, LCD readouts. No Arabic glyphs. */
  mono: "'Geist Mono Variable', 'Geist Mono', ui-monospace, SFMono-Regular, monospace",
  /** Applied by the `[lang="ar"]` cascade, scoped per element. */
  arabic: "'IBM Plex Sans Arabic', 'Outfit Variable', Outfit, system-ui, sans-serif",
} as const;

/** Inter is banned outright (DESIGN.md §9), as are generic serifs. */
export const BANNED_FAMILIES = ['Inter'] as const;

export interface BrandFontFile {
  file: string;
  family: string;
  weight: number;
  style: 'normal' | 'italic';
  /** Which CSS variable this face serves. */
  token: 'sans' | 'mono';
}

/**
 * The ONLY font files delivered by the brand and copied into `packages/ui/fonts/`.
 * Four TTFs, two weights per family.
 */
export const BRAND_FONT_FILES: readonly BrandFontFile[] = [
  { file: 'Outfit-Regular.ttf', family: 'Outfit', weight: 400, style: 'normal', token: 'sans' },
  { file: 'Outfit-Bold.ttf', family: 'Outfit', weight: 700, style: 'normal', token: 'sans' },
  {
    file: 'GeistMono-Regular.ttf',
    family: 'Geist Mono',
    weight: 400,
    style: 'normal',
    token: 'mono',
  },
  { file: 'GeistMono-Bold.ttf', family: 'Geist Mono', weight: 700, style: 'normal', token: 'mono' },
] as const;

/**
 * Weights the design system uses that the BRAND never delivered as a file. Rendering any of
 * these from the four brand TTFs alone produces a synthetic (faux) weight or snaps to 400/700.
 * ⊕ FILLED 2026-09-02 (S11, Option A): every row below is now served by `@fontsource` — the
 * Latin rows by the variable faces, the Arabic rows by the static package (since Sprint 1).
 * Kept as the record of the delivery gap, not deleted: it is why the dependency exists.
 */
export const MISSING_FONT_WEIGHTS = [
  { family: 'Outfit', weight: 300, usedBy: 'Display' },
  { family: 'Outfit', weight: 500, usedBy: 'H3' },
  { family: 'Outfit', weight: 600, usedBy: 'H1, H2, primary button labels' },
  { family: 'Geist Mono', weight: 500, usedBy: 'Labels and eyebrows (--fw-label)' },
  { family: 'IBM Plex Sans Arabic', weight: 400, usedBy: 'All Arabic body copy' },
  { family: 'IBM Plex Sans Arabic', weight: 500, usedBy: 'Arabic UI text' },
  { family: 'IBM Plex Sans Arabic', weight: 600, usedBy: 'ALL Arabic labels and eyebrows' },
  { family: 'IBM Plex Sans Arabic', weight: 700, usedBy: 'Arabic headings' },
] as const;

/**
 * Recommended npm packages if the @fontsource strategy is chosen.
 *
 * IBM Plex Sans Arabic has NO upstream variable release — do not look for
 * `@fontsource-variable/ibm-plex-sans-arabic`; use the static package and import the
 * `arabic` subset at 400/500/600/700.
 */
export const FONTSOURCE_PACKAGES = [
  { pkg: '@fontsource-variable/outfit', covers: 'Outfit 100–900 (fills 300/500/600)' },
  { pkg: '@fontsource-variable/geist-mono', covers: 'Geist Mono variable (fills 500)' },
  {
    pkg: '@fontsource/ibm-plex-sans-arabic',
    covers: 'IBM Plex Sans Arabic 100–700 static — no variable release exists',
  },
] as const;

export interface FontFaceOptions {
  /** Public URL the four TTFs are served from, e.g. `/fonts`. No trailing slash. */
  baseUrl: string;
  /** `swap` avoids invisible text; `optional` is stricter on CLS. */
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
}

/**
 * Emit `@font-face` rules for the four delivered TTFs — for surfaces that cannot use
 * `next/font` (the Expo app's web build, a PDF renderer, an email template).
 *
 * `next/font/local` cannot read this package: its `src` must be a path relative to the
 * importing file, not a package specifier, so `apps/web` needs its own copy of the files.
 * That constraint is the main argument for the @fontsource route.
 */
export function buildFontFaceCss({ baseUrl, display = 'swap' }: FontFaceOptions): string {
  return BRAND_FONT_FILES.map(
    ({ file, family, weight, style }) => `@font-face {
  font-family: '${family}';
  src: url('${baseUrl}/${file}') format('truetype');
  font-weight: ${weight};
  font-style: ${style};
  font-display: ${display};
}`,
  ).join('\n\n');
}
