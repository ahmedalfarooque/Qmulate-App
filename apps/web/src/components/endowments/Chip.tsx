import { cx } from '@qmulate/ui';

import type { ReactNode } from 'react';

/**
 * Chip — a status pill: tint fill + a dot + a text label.
 *
 * ── THE RULE IT ENCODES (DESIGN.md §0/§6/§9, WCAG 1.4.1) ──────────────────────────────────
 * COLOUR IS NEVER THE ONLY SIGNAL. Every tone below pairs its tint with a `--color-*` border and
 * a REQUIRED text label, so "blocked" reads as blocked in greyscale, in the flat report theme, in
 * print, and to a colour-blind Nazir. `label` is not optional and there is no icon-only variant —
 * a coloured dot alone would be exactly the defect this component exists to prevent.
 *
 * It emits NO `box-shadow`. A chip is not a control and does not rest raised; depth in this system
 * comes only from `<Surface>`/`<Well>`, which is what lets the report theme flatten everything at
 * once. The radius is the `pill` token.
 */

export type ChipTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: 'border-edge bg-panel-tint text-ink',
  info: 'border-blue-strong bg-blue-tint text-ink',
  success: 'border-success bg-success-tint text-ink',
  warning: 'border-warning bg-warning-tint text-ink',
  danger: 'border-danger bg-danger-tint text-ink',
};

const DOT_CLASS: Record<ChipTone, string> = {
  neutral: 'bg-mist',
  info: 'bg-blue',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

export function Chip({
  tone = 'neutral',
  label,
  'data-testid': testId,
}: {
  readonly tone?: ChipTone;
  /** REQUIRED. The chip's meaning lives in these words, not in its colour. */
  readonly label: ReactNode;
  readonly 'data-testid'?: string;
}) {
  return (
    <span
      data-testid={testId}
      data-tone={tone}
      className={cx(
        'inline-flex items-center gap-[var(--space-8)] rounded-pill border',
        'px-[var(--space-12)] py-[var(--space-4)] text-body-sm',
        TONE_CLASS[tone],
      )}
    >
      {/* Decorative: the label beside it carries the meaning, so it is hidden from AT. */}
      <span
        aria-hidden="true"
        className={cx('inline-block size-1.5 rounded-pill', DOT_CLASS[tone])}
      />
      {label}
    </span>
  );
}
