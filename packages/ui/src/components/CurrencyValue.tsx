/**
 * CurrencyValue — a SAR amount rendered as one atomic, bidi-isolated token.
 *
 * ── NFR-08: JS `number` IS BANNED FOR MONEY ───────────────────────────────────────────
 * `value` is typed `MoneyValue = string | DecimalLike`. `DecimalLike` requires
 * `toNumber()` / `isNegative()` / `isZero()` — members a primitive `number` does not have —
 * so `<CurrencyValue value={1250.5} />` is a COMPILE ERROR, not a runtime surprise:
 *
 *     Type 'number' is not assignable to type 'MoneyValue'.
 *
 * Money is `Decimal @db.Decimal(18,2)` in Prisma and `decimal.js` all the way to this
 * component; the value is handed to `Intl` as a decimal STRING, so an 18-digit amount
 * above 2^53 still formats exactly. The UI can never render a float artifact.
 *
 * ── Display rules (11-localization-spec.md §5, DESIGN.md §4.5) ────────────────────────
 *   · Latin (Western) digits even in `ar` — Saudi banking convention, and it keeps
 *     `tabular-nums` columns aligned. `numberingSystem="arab"` is available for
 *     beneficiary-facing prose; digit glyphs are never hard-coded.
 *   · Currency renders as the code "SAR" in both locales.
 *   · The whole token sits in a `<bdi dir="ltr">` so the currency code and any minus sign
 *     cannot jump sides inside RTL text.
 *   · Geist Mono, `font-variant-numeric: tabular-nums` (via `.qm-currency`).
 *
 * ── Colour is never the only signal ───────────────────────────────────────────────────
 * The money convention is positive = success, negative = danger. Colour alone fails
 * WCAG 1.4.1, so tinting is only available through `delta`, whose `label` is REQUIRED and
 * is rendered for assistive technology alongside the ▲/▼ glyph. There is no way to get
 * the colour without the text.
 */

import {
  defaultLocale,
  formatSar,
  type Locale,
  type MoneyValue,
  type NumberingSystem,
  toDecimalString,
} from '@qmulate/i18n';
import * as React from 'react';

import { cx } from './Surface';
import { VisuallyHidden } from './VisuallyHidden';

export interface CurrencyDelta {
  /**
   * Accessible text for the direction, supplied by the caller from `@qmulate/i18n`
   * (e.g. t('common.increase')). Required — this is what keeps colour from being the
   * only cue.
   */
  label: string;
}

export interface CurrencyValueProps {
  /** `string | DecimalLike`. A JS `number` will not compile — see the note above. */
  value: MoneyValue;
  locale?: Locale;
  currency?: string;
  numberingSystem?: NumberingSystem;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero';
  /**
   * Render as a signed financial delta: adds the ▲/▼ glyph and the success/danger tone,
   * and requires an accessible label.
   */
  delta?: CurrencyDelta;
  /** Larger step for an LCD readout inside a `<Well>`. */
  size?: 'body-sm' | 'body' | 'lcd';
  className?: string;
  /** Optional native tooltip, e.g. the unrounded amount. */
  title?: string;
}

const SIZE_CLASS = {
  'body-sm': 'text-body-sm',
  body: 'text-body',
  lcd: 'text-h2',
} as const;

export function CurrencyValue({
  value,
  locale = defaultLocale,
  currency,
  numberingSystem,
  minimumFractionDigits,
  maximumFractionDigits,
  signDisplay,
  delta,
  size = 'body',
  className,
  title,
}: CurrencyValueProps): React.JSX.Element {
  const formatted = formatSar(value, {
    locale,
    currency,
    numberingSystem,
    minimumFractionDigits,
    maximumFractionDigits,
    signDisplay,
  });

  // Sign is read off the exact decimal string — never by coercing to a float.
  const decimal = toDecimalString(value);
  const isNegative = decimal.startsWith('-');
  const isZero = /^[+-]?0*(\.0*)?$/.test(decimal);

  const toneClass = delta
    ? isZero
      ? 'text-mist'
      : isNegative
        ? 'text-danger'
        : 'text-success'
    : '';

  return (
    <bdi
      dir="ltr"
      title={title}
      className={cx('qm-currency', SIZE_CLASS[size], toneClass, className)}
    >
      {delta && !isZero ? <span aria-hidden="true">{isNegative ? '▼' : '▲'}&#8239;</span> : null}
      {formatted}
      {delta ? <VisuallyHidden>{delta.label}</VisuallyHidden> : null}
    </bdi>
  );
}
