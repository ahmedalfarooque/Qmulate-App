import { resolveLocale } from '@qmulate/i18n';
import { CurrencyValue } from '@qmulate/ui';

/**
 * A SAR amount, with the locale resolved once and the display rules inherited from `<CurrencyValue>`.
 *
 * ── WHY THE VALUE IS A `string` AND WHY THAT IS NOT LAZINESS ───────────────────────────────
 * Every `…Sar` figure reaches this app as a canonical 2-dp decimal STRING, converted from integer halalas
 * inside `packages/api` (`toDbString(money(...))`). This app cannot import `@qmulate/domain` — it is not a
 * dependency and not in `transpilePackages` — so it cannot do that conversion and must not try.
 * `<CurrencyValue>`'s own signature makes the alternative uncompilable: `value` is `string | DecimalLike`,
 * and `<CurrencyValue value={1250.5} />` is a COMPILE ERROR, not a runtime surprise (NFR-08).
 *
 * ── THE DISPLAY RULES, ALL INHERITED ──────────────────────────────────────────────────────
 * Latin (Western) digits even in `ar` — Saudi banking convention, and it keeps `tabular-nums` columns
 * aligned. The currency renders as the code `SAR` in both locales. The whole token sits in a
 * `<bdi dir="ltr">` so the code and any minus sign cannot jump sides inside RTL text: a figure that
 * reorders itself against Arabic prose is a correctness bug, not a typographic nicety.
 *
 * ⚠ NO `delta` IS EVER PASSED FROM THESE SCREENS. A tinted ▲/▼ says "up" or "down" against something,
 * and a distribution figure is not a movement against a prior period — it is the answer for one window.
 */
export function Sar({
  locale,
  value,
  size = 'body',
  className,
}: {
  readonly locale: string;
  /** A canonical 2-dp decimal string, straight off the wire. Never arithmetic. */
  readonly value: string;
  readonly size?: 'body-sm' | 'body' | 'lcd';
  readonly className?: string;
}) {
  return (
    <CurrencyValue
      value={value}
      locale={resolveLocale(locale)}
      size={size}
      {...(className === undefined ? {} : { className })}
    />
  );
}
