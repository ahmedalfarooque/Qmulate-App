/**
 * Mono — Geist Mono, tabular figures, bidi-isolated.
 *
 * For the machine-readable half of the record: deed and certificate numbers, IBANs,
 * national IDs, transaction references, timestamps, percentages, and any figure that has
 * to line up in a column.
 *
 * Two localisation rules it exists to enforce
 * (11-localization-spec.md §4, DESIGN.md §4.7):
 *   1. Codes and figures stay Geist Mono (Latin/numeric) EVEN INSIDE ARABIC PROSE.
 *      Geist Mono has no Arabic glyphs, so never wrap Arabic text in this.
 *   2. They render LTR inside a `<bdi>`, so a deed number or an IBAN cannot reorder
 *      itself against the surrounding RTL text.
 */

import * as React from 'react';

import { cx } from './Surface';

export type MonoTone = 'ink' | 'mist' | 'blue' | 'success' | 'warning' | 'danger' | 'inherit';

const TONE_CLASS: Record<MonoTone, string> = {
  ink: 'text-ink',
  mist: 'text-mist',
  blue: 'text-blue-strong',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  inherit: '',
};

export interface MonoProps {
  tone?: MonoTone;
  /**
   * Bidi-isolate the value in a `<bdi dir="ltr">`. On by default — that is the whole
   * point of the component. Turn it off only when the parent is already an isolate.
   */
  isolate?: boolean;
  /** Smaller step, for dense table cells and metadata rows. */
  size?: 'body' | 'body-sm';
  /** Uppercase is safe here: this component is Latin/numeric only, never Arabic. */
  uppercase?: boolean;
  title?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Mono({
  tone = 'ink',
  isolate = true,
  size = 'body',
  uppercase = false,
  title,
  className,
  children,
}: MonoProps): React.JSX.Element {
  const classes = cx(
    // `.qm-mono` supplies the family + tabular-nums from tokens.css.
    'qm-mono',
    size === 'body-sm' ? 'text-body-sm' : 'text-body',
    TONE_CLASS[tone],
    uppercase && 'uppercase',
    className,
  );

  if (!isolate) {
    return (
      <span className={classes} title={title}>
        {children}
      </span>
    );
  }

  return (
    <bdi dir="ltr" className={classes} title={title}>
      {children}
    </bdi>
  );
}
