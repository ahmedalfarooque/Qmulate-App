/**
 * StatTile / KPI — a raised tile whose figure sits in an inset "LCD" well.
 *
 * The Dashboard's five zero-tolerance KPIs and every cash-position readout use this shape
 * (DESIGN.md §6, 13-ux-designsystem-reference.md §1): mono eyebrow → big SAR figure in an
 * inset `<Well>` → optional ▲▼ delta with its label.
 *
 * ── Colour and glyphs are never the only signal ───────────────────────────────────────
 * `status` and `delta` are objects whose `label` is REQUIRED. There is deliberately no
 * way to get a danger-red tile or a red ▼ without also supplying the text that says why —
 * a red dot alone fails WCAG 1.4.1 and, on a compliance dashboard, is genuinely dangerous:
 * an all-green board that implies false safety is the failure mode the spec calls out.
 *
 * ── No copy lives here ────────────────────────────────────────────────────────────────
 * `eyebrow`, `status.label`, `delta.label` and `caption` are all supplied by the caller
 * from `@qmulate/i18n`. Pass `locale` so the eyebrow picks the right label treatment
 * (Latin mono/uppercase/tracked vs Arabic IPSA 600 untracked) where the `:lang` cascade
 * cannot be trusted.
 *
 * ⚠ Any regulatory figure displayed in a tile (classification band, deadline window, fee
 * percentage) is UNVERIFIED against primary Saudi law. Surface it with the
 * `common.unverifiedFigure` string as the `caption` — never present it as settled.
 */

import type { Locale } from '@qmulate/i18n';
import * as React from 'react';

import { Card } from './Card';
import { Eyebrow } from './Eyebrow';
import { cx } from './Surface';
import { Well } from './Well';

export type StatTone = 'neutral' | 'success' | 'warning' | 'danger';

export interface StatStatus {
  tone: StatTone;
  /** Required: the text that carries the meaning the colour only reinforces. */
  label: string;
}

export interface StatDelta {
  direction: 'up' | 'down' | 'flat';
  /** Required accessible text, e.g. t('common.increase'). */
  label: string;
  /** Usually a `<CurrencyValue>` or a formatted percentage. */
  value?: React.ReactNode;
}

export interface StatTileProps {
  /** Translated kicker, e.g. t('nav.distributions'). */
  eyebrow: React.ReactNode;
  /** The figure. Typically `<CurrencyValue size="lcd" />` or a `<Mono>` count. */
  value: React.ReactNode;
  /** Secondary line under the well — a period, a basis, or the unverified-figure note. */
  caption?: React.ReactNode;
  status?: StatStatus;
  delta?: StatDelta;
  /** Only needed where the `:lang` cascade cannot be trusted (report/PDF renderers). */
  locale?: Locale;
  className?: string;
}

const STATUS_DOT: Record<StatTone, string> = {
  neutral: 'bg-mist-2',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

const STATUS_TEXT: Record<StatTone, string> = {
  neutral: 'text-mist',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

const DELTA_GLYPH = { up: '▲', down: '▼', flat: '—' } as const;

/** Money convention: positive = success, negative = danger, unchanged = neutral. */
const DELTA_TEXT = {
  up: 'text-success',
  down: 'text-danger',
  flat: 'text-mist',
} as const;

export function StatTile({
  eyebrow,
  value,
  caption,
  status,
  delta,
  locale,
  className,
}: StatTileProps): React.JSX.Element {
  return (
    <Card className={cx('flex flex-col gap-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow locale={locale}>{eyebrow}</Eyebrow>
        {status ? (
          <span
            className={cx('inline-flex items-center gap-2 text-body-sm', STATUS_TEXT[status.tone])}
          >
            <span
              aria-hidden="true"
              className={cx('inline-block size-2 rounded-pill', STATUS_DOT[status.tone])}
            />
            {status.label}
          </span>
        ) : null}
      </div>

      {/* The LCD well: the figure is pressed into the surface, Geist Mono, tabular. */}
      <Well bordered={false} className="flex items-baseline gap-2">
        {value}
      </Well>

      {delta || caption ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm">
          {delta ? (
            <span className={cx('inline-flex items-center gap-1', DELTA_TEXT[delta.direction])}>
              <span aria-hidden="true">{DELTA_GLYPH[delta.direction]}</span>
              {delta.value}
              {/* The label is visible, not hidden — the text IS the signal. */}
              <span>{delta.label}</span>
            </span>
          ) : null}
          {caption ? <span className="text-mist">{caption}</span> : null}
        </div>
      ) : null}
    </Card>
  );
}
