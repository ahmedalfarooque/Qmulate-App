/**
 * packages/ui/tailwind-preset.ts — the single Tailwind preset for every QMULATE surface.
 *
 * Tailwind **3.4** (not v4): DESIGN.md §10 specifies a preset object with
 * `<alpha-value>` colour templates and a `boxShadow` map — v3 syntax — and NativeWind v4
 * (apps/mobile) requires `tailwindcss@^3.4`.
 * TODO(surface): confirm Tailwind 3.4 vs 4. v4 would invalidate DESIGN.md §10 verbatim
 * (CSS-first `@theme` instead of a JS preset) and force a rewrite of this file.
 *
 * Consumers:
 *   // apps/web/tailwind.config.ts
 *   import preset from '@qmulate/ui/tailwind-preset';
 *   export default { presets: [preset], content: [...] };
 *
 * The preset deliberately does NOT set `content` — each app declares its own.
 * Every value resolves to a CSS custom property from `./tokens/tokens.css`, so the
 * three themes (light-neu / dark-neu / flat report) swap without a rebuild.
 */

import type { Config } from 'tailwindcss';

import { layout, motion, radii, zIndex } from './tokens/tokens';

type Preset = Partial<Config>;

/** `rgb(var(--color-x) / <alpha-value>)` so `bg-panel/60` works. */
const c = (name: string): string => `rgb(var(--color-${name}) / <alpha-value>)`;

/**
 * Annotated rather than `satisfies`: the annotation gives the nested literals their
 * contextual types, so `darkMode` narrows to the `['class', string]` tuple and the
 * `fontSize` entries narrow to `[size, { lineHeight, letterSpacing, fontWeight }]`
 * instead of widening to `string[]`.
 */
const preset: Preset = {
  // Dark-neu is opt-in via the data attribute. It is NEVER driven by
  // `prefers-color-scheme` — light-neu is the product default in every environment.
  darkMode: ['class', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        panel: c('panel'),
        'panel-tint': c('panel-tint'),
        well: c('well'),
        hi: c('hi'),
        sh: c('sh'),
        line: c('line'),
        edge: c('edge'),
        ink: c('ink'),
        mist: c('mist'),
        'mist-2': c('mist-2'),
        blue: c('blue'),
        'blue-strong': c('blue-strong'),
        'blue-tint': c('blue-tint'),
        success: c('success'),
        'success-tint': c('success-tint'),
        'on-success': c('on-success'),
        warning: c('warning'),
        'warning-tint': c('warning-tint'),
        'on-warning': c('on-warning'),
        danger: c('danger'),
        'danger-tint': c('danger-tint'),
        'on-danger': c('on-danger'),
        info: c('info'),
        'info-tint': c('info-tint'),
        'on-info': c('on-info'),
      },

      /**
       * The ONLY box-shadows in the system. `<Surface>` and `<Well>` are the only
       * components permitted to apply them; everything else composes from those two.
       * In the flat report/print theme these tokens resolve to `none` automatically.
       */
      boxShadow: {
        'raised-sm': 'var(--nu-raised-sm)',
        'raised-md': 'var(--nu-raised-md)',
        inset: 'var(--nu-inset)',
        flat: 'var(--nu-flat)',
        focus: 'var(--focus-ring)',
      },

      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
        ar: 'var(--font-ar)',
      },

      // Tuple form: [size, { lineHeight, letterSpacing, fontWeight }].
      fontSize: {
        display: [
          'var(--fs-display)',
          {
            lineHeight: 'var(--lh-display)',
            letterSpacing: 'var(--tr-display)',
            fontWeight: 'var(--fw-display)',
          },
        ],
        h1: [
          'var(--fs-h1)',
          {
            lineHeight: 'var(--lh-h1)',
            letterSpacing: 'var(--tr-h1)',
            fontWeight: 'var(--fw-h1)',
          },
        ],
        h2: [
          'var(--fs-h2)',
          {
            lineHeight: 'var(--lh-h2)',
            letterSpacing: 'var(--tr-h2)',
            fontWeight: 'var(--fw-h2)',
          },
        ],
        h3: [
          'var(--fs-h3)',
          {
            lineHeight: 'var(--lh-h3)',
            letterSpacing: 'var(--tr-h3)',
            fontWeight: 'var(--fw-h3)',
          },
        ],
        body: [
          'var(--fs-body)',
          {
            lineHeight: 'var(--lh-body)',
            letterSpacing: 'var(--tr-body)',
            fontWeight: 'var(--fw-body)',
          },
        ],
        'body-sm': [
          'var(--fs-body-sm)',
          {
            lineHeight: 'var(--lh-body-sm)',
            letterSpacing: 'var(--tr-body-sm)',
            fontWeight: 'var(--fw-body-sm)',
          },
        ],
        // Latin only — Arabic labels drop the transform and the tracking (.qm-label--ar).
        label: [
          'var(--fs-label)',
          {
            lineHeight: 'var(--lh-label)',
            letterSpacing: 'var(--tr-label)',
            fontWeight: 'var(--fw-label)',
          },
        ],
      },

      /**
       * Semantic radius names rather than overriding Tailwind's `rounded-sm|md|lg`,
       * so `rounded-card` always means "product card, 20px" wherever it appears.
       */
      borderRadius: {
        control: radii.sm, // 12px — buttons, inputs
        media: radii.md, // 16px — images
        card: radii.lg, // 20px — product cards, tiles
        hero: radii.xl, // 24px — marketing cards
        pill: radii.full,
      },

      /**
       * Tailwind's default 0.25rem scale already matches the 4px base at every step
       * except 88px and 120px, so only the gaps and the semantic values are added —
       * overriding the whole scale would break the default utilities.
       */
      spacing: {
        22: '88px',
        30: '120px',
        tap: layout.tapMin,
        section: layout.sectionPad,
      },

      minHeight: { tap: layout.tapMin },
      minWidth: { tap: layout.tapMin },

      maxWidth: {
        product: layout.containerProduct,
        marketing: layout.containerMarketing,
        measure: layout.measure,
      },

      zIndex: {
        sticky: String(zIndex.sticky),
        dropdown: String(zIndex.dropdown),
        overlay: String(zIndex.overlay),
        modal: String(zIndex.modal),
        toast: String(zIndex.toast),
        tooltip: String(zIndex.tooltip),
      },

      transitionTimingFunction: {
        DEFAULT: motion.ease,
        ease: motion.ease,
      },

      transitionDuration: {
        DEFAULT: motion.durBase,
        fast: motion.durFast,
        base: motion.durBase,
        slow: motion.durSlow,
      },

      backdropBlur: {
        glass: '18px', // never exceed 20px (DESIGN.md §9)
      },
    },
  },
};

export default preset;
