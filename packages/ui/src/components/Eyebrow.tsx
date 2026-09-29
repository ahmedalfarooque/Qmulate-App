/**
 * Eyebrow — the small kicker above a heading, KPI or section.
 *
 * THE ARABIC LABEL PROBLEM (DESIGN.md §3, 11-localization-spec.md §4).
 * The brand's signature label is mono / UPPERCASE / +0.13em tracked. That treatment is
 * impossible in Arabic: Geist Mono has no Arabic glyphs, and uppercasing or letter-spacing
 * Arabic breaks the cursive joins. So the convention is LANGUAGE-SWITCHED, not translated:
 *
 *   · Latin  → Geist Mono, uppercase, letter-spacing .13em, --color-mist
 *   · Arabic → IBM Plex Sans Arabic **600**, no transform, no tracking
 *   · optional small blue tick preserves the "eyebrow" read in Arabic, where the
 *     tracking that normally signals "this is a label" is unavailable
 *
 * Both treatments live in `@qmulate/ui/tokens.css`. By default they are selected by the
 * inherited `:lang(ar)` cascade, so nothing needs to be passed. Supply `locale` where the
 * cascade is not reliable — a PDF/report renderer, an email, or an SSR fragment mounted
 * outside `<html lang>`; it resolves through `labelClass()` in `@qmulate/i18n`, the single
 * definition of this rule.
 */

import { eyebrowClass, type Locale } from '@qmulate/i18n';
import * as React from 'react';

import { cx } from './Surface';

export interface EyebrowProps {
  /** Only needed where the `:lang` cascade cannot be trusted. */
  locale?: Locale;
  /** Renders a small blue tick before the text — the Arabic eyebrow read. */
  tick?: boolean;
  tone?: 'mist' | 'blue' | 'ink';
  as?: 'span' | 'p' | 'div' | 'dt';
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

const TONE_CLASS = {
  mist: '', // .qm-eyebrow already sets --color-mist
  blue: 'text-blue-strong',
  ink: 'text-ink',
} as const;

export function Eyebrow({
  locale,
  tick = false,
  tone = 'mist',
  as = 'span',
  id,
  className,
  children,
}: EyebrowProps): React.JSX.Element {
  const Component = as as React.ElementType;

  return (
    <Component
      id={id}
      className={cx(
        locale ? eyebrowClass(locale) : 'qm-eyebrow',
        TONE_CLASS[tone],
        tick && 'inline-flex items-center gap-2',
        className,
      )}
    >
      {tick ? (
        // Decorative: the text beside it carries the meaning, so it is hidden from AT.
        <span aria-hidden="true" className="inline-block size-1.5 rounded-pill bg-blue" />
      ) : null}
      {children}
    </Component>
  );
}
