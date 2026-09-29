/**
 * Text — the typographic primitive for prose and headings.
 *
 * Sizes, line-heights, tracking and weights all come from the `fontSize` tuples in the
 * Tailwind preset, which read the `--fs-*` / `--lh-*` / `--tr-*` / `--fw-*` tokens. A
 * component never sets a literal size or weight.
 *
 * Rules encoded here (DESIGN.md §3): body is never set in mono; body never drops below
 * weight 400; Display is never used below 40px (the `--fs-display` clamp floor is 2.5rem);
 * prose is capped at `--measure` (65ch).
 *
 * The Arabic face is selected by the `lang` cascade (`[lang="ar"]` in tokens.css), so a
 * mixed record renders each script in its own face without a prop. Pass `lang` explicitly
 * only for an island whose script differs from its container.
 */

import * as React from 'react';

import { cx } from './Surface';

export type TextVariant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'body-sm';

export type TextTone =
  'ink' | 'mist' | 'mist-2' | 'blue' | 'success' | 'warning' | 'danger' | 'inherit';

export type TextAlign = 'start' | 'center' | 'end';

const VARIANT_CLASS: Record<TextVariant, string> = {
  display: 'text-display font-sans',
  h1: 'text-h1 font-sans',
  h2: 'text-h2 font-sans',
  h3: 'text-h3 font-sans',
  body: 'text-body font-sans',
  'body-sm': 'text-body-sm font-sans',
};

const DEFAULT_ELEMENT: Record<TextVariant, React.ElementType> = {
  display: 'p',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  body: 'p',
  'body-sm': 'p',
};

const TONE_CLASS: Record<TextTone, string> = {
  ink: 'text-ink',
  mist: 'text-mist',
  // Decorative / disabled only — never for content a user must read.
  'mist-2': 'text-mist-2',
  blue: 'text-blue-strong',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  inherit: '',
};

/** Logical alignment only — `text-left`/`text-right` are banned. */
const ALIGN_CLASS: Record<TextAlign, string> = {
  start: 'text-start',
  center: 'text-center',
  end: 'text-end',
};

export interface TextProps {
  variant?: TextVariant;
  tone?: TextTone;
  align?: TextAlign;
  /** Override the semantic element without changing the visual role. */
  as?: React.ElementType;
  /** Cap the line length at `--measure` (65ch). On by default for body copy. */
  measured?: boolean;
  /** Set only for a script island that differs from its container. */
  lang?: string;
  /** `auto` for user-supplied values of unknown script. */
  dir?: 'ltr' | 'rtl' | 'auto';
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Text({
  variant = 'body',
  tone = 'ink',
  align,
  as,
  measured,
  lang,
  dir,
  id,
  className,
  children,
}: TextProps): React.JSX.Element {
  const Component = (as ?? DEFAULT_ELEMENT[variant]) as React.ElementType;
  const isProse = variant === 'body' || variant === 'body-sm';
  const capMeasure = measured ?? isProse;

  return (
    <Component
      id={id}
      lang={lang}
      dir={dir}
      className={cx(
        VARIANT_CLASS[variant],
        TONE_CLASS[tone],
        align && ALIGN_CLASS[align],
        capMeasure && 'max-w-measure',
        className,
      )}
    >
      {children}
    </Component>
  );
}

/** Convenience alias — `<Heading level={2}>` reads better than `<Text variant="h2">`. */
export function Heading({
  level = 2,
  ...rest
}: Omit<TextProps, 'variant'> & { level?: 1 | 2 | 3 }): React.JSX.Element {
  const variant = (['h1', 'h2', 'h3'] as const)[level - 1] ?? 'h2';
  return <Text variant={variant} {...rest} />;
}
