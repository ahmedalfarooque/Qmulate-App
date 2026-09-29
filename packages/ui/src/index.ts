/**
 * @qmulate/ui — design tokens and the shared component library.
 *
 * Consumers must also load the stylesheet, once, at the app root:
 *
 *     import '@qmulate/ui/tokens.css';
 *
 * and extend the Tailwind preset:
 *
 *     import preset from '@qmulate/ui/tailwind-preset';
 *
 * ── The rules this package exists to enforce ──────────────────────────────────────────
 *  1. `<Surface>` (and `<Well>`, its inset preset) are the ONLY components that emit a
 *     `box-shadow`. Everything else composes from them, so the flat report/print theme
 *     flattens the whole product without a single component change.
 *  2. Neumorphism carries the feeling, never the information. Every interactive control
 *     also carries a >=3:1 non-shadow cue (`--color-edge` border, fill, or accent) plus the
 *     correct ARIA state. Colour is never the only signal — where a component can be
 *     tinted (`delta`, `status`), the accompanying text label is a REQUIRED prop.
 *  3. No raw hex and no hand-rolled shadow outside `tokens/tokens.css` and `tokens/tokens.ts`.
 *  4. Logical CSS only — `left/right/pl/pr/ml/mr` are banned; use `ps-/pe-/ms-/me-/start-/end-`.
 *     The neumorphic light source flips with `dir` via `:root[dir="rtl"]`.
 *  5. No hard-coded UI copy. Every visible string is a prop, supplied by the caller from
 *     `@qmulate/i18n`.
 *  6. Money is `string | DecimalLike`; passing a JS `number` to `<CurrencyValue>` is a
 *     compile error (NFR-08). A frozen Hijri snapshot passed to `<DateValue>` is rendered
 *     verbatim and never recomputed (NFR-02).
 */

/* ── Depth primitives — the only source of box-shadow ── */
export {
  cx,
  Surface,
  type SurfaceProps,
  type SurfaceRadius,
  type SurfaceVariant,
} from './components/Surface';
export { Well, type WellProps } from './components/Well';

/* ── Typography ── */
export {
  Heading,
  Text,
  type TextAlign,
  type TextProps,
  type TextTone,
  type TextVariant,
} from './components/Text';
export { Mono, type MonoProps, type MonoTone } from './components/Mono';
export { Eyebrow, type EyebrowProps } from './components/Eyebrow';
export { Label, type LabelProps } from './components/Label';
export { VisuallyHidden, type VisuallyHiddenProps } from './components/VisuallyHidden';

/* ── Value primitives (localisation-critical) ── */
export {
  CurrencyValue,
  type CurrencyDelta,
  type CurrencyValueProps,
} from './components/CurrencyValue';
export { DateValue, type DateValueLabels, type DateValueProps } from './components/DateValue';

/* ── Controls & containers ── */
export { Button, type ButtonProps, type ButtonSize, type ButtonVariant } from './components/Button';
export { Card, type CardProps } from './components/Card';
export {
  StatTile,
  type StatDelta,
  type StatStatus,
  type StatTileProps,
  type StatTone,
} from './components/StatTile';

/* ── Typeface metadata (no side effects; see fonts/README.md for the open decision) ── */
export {
  BANNED_FAMILIES,
  BRAND_FONT_FILES,
  buildFontFaceCss,
  FONT_STACKS,
  FONTSOURCE_PACKAGES,
  MISSING_FONT_WEIGHTS,
  type BrandFontFile,
  type FontFaceOptions,
} from './fonts';
