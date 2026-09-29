import { render } from '@testing-library/react';
import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { CurrencyValue } from '../CurrencyValue';

/**
 * Acceptance encoded here (E0 AC-E0-9, NFR-08, 11-localization-spec.md §5):
 *   · SAR renders with LATIN digits in BOTH locales — Saudi banking convention, and it is
 *     what keeps tabular columns aligned;
 *   · the amount is one atomic, bidi-isolated `<bdi dir="ltr">` token, so the currency code
 *     and any minus sign cannot jump sides inside RTL text;
 *   · money is `string | DecimalLike` — a JS `number` does not compile;
 *   · precision survives values above 2^53, because the value never becomes a float;
 *   · colour is never the only signal for a delta.
 */

/** U+0660–U+0669: Arabic-Indic digits. None of these may ever appear in a SAR figure. */
const ARABIC_INDIC = /[٠-٩۰-۹]/;

describe('CurrencyValue', () => {
  it('renders SAR with Latin digits in English', () => {
    const { container } = render(<CurrencyValue value="1250.50" locale="en" />);
    const text = container.textContent ?? '';

    expect(text).toContain('SAR');
    expect(text).toContain('1,250.50');
    expect(ARABIC_INDIC.test(text)).toBe(false);
  });

  it('renders SAR with Latin digits in Arabic too — never Arabic-Indic', () => {
    const { container } = render(<CurrencyValue value="1250.50" locale="ar" />);
    const text = container.textContent ?? '';

    expect(text).toContain('SAR');
    expect(text).toContain('1,250.50');
    expect(ARABIC_INDIC.test(text)).toBe(false);
  });

  it('opts into Arabic-Indic digits only when explicitly asked', () => {
    const { container } = render(
      <CurrencyValue value="1250.50" locale="ar" numberingSystem="arab" />,
    );

    expect(ARABIC_INDIC.test(container.textContent ?? '')).toBe(true);
  });

  it('isolates the amount in a <bdi dir="ltr"> with tabular figures', () => {
    const { container } = render(<CurrencyValue value="1250.50" locale="ar" />);
    const bdi = container.querySelector('bdi');

    expect(bdi).not.toBeNull();
    expect(bdi?.getAttribute('dir')).toBe('ltr');
    // .qm-currency supplies Geist Mono + font-variant-numeric: tabular-nums.
    expect(bdi?.className).toContain('qm-currency');
  });

  it('accepts a decimal.js Decimal', () => {
    const { container } = render(<CurrencyValue value={new Decimal('98765.4321')} locale="en" />);

    // Rounded to 2 fraction digits for display; the underlying Decimal is untouched.
    expect(container.textContent).toContain('98,765.43');
  });

  it('keeps full precision above Number.MAX_SAFE_INTEGER', () => {
    // Decimal(18,2) allows amounts a float cannot represent. Round-tripping this through
    // a JS number would render …992.00 or similar.
    const { container } = render(<CurrencyValue value="9007199254740993.01" locale="en" />);

    expect(container.textContent).toContain('9,007,199,254,740,993.01');
  });

  it('renders the same numerals in both locales, whatever the code placement', () => {
    // `en` yields "-SAR 420.00"; `ar` yields "‏‎-420.00 SAR" — the currency code
    // trails and an RLM leads. That layout difference is correct locale behaviour. What
    // must NOT differ is the numerals themselves: same digits, same grouping separator,
    // same decimal separator, same sign, so a figure reads identically in either language.
    const digits = (s: string | null) => (s ?? '').replace(/[^0-9.,-]/g, '');

    const en = render(<CurrencyValue value="-420.00" locale="en" />).container.textContent;
    const ar = render(<CurrencyValue value="-420.00" locale="ar" />).container.textContent;

    expect(digits(en)).toBe('-420.00');
    expect(digits(ar)).toBe('-420.00');
  });

  it('pairs a delta tint with a text label, never colour alone', () => {
    const { container } = render(
      <CurrencyValue value="-420.00" locale="en" delta={{ label: 'Decrease' }} />,
    );
    const bdi = container.querySelector('bdi');

    expect(bdi?.className).toContain('text-danger');
    // The accessible label travels with the colour.
    expect(container.textContent).toContain('Decrease');
    expect(container.textContent).toContain('▼');
  });

  it('rejects a malformed amount rather than rendering something plausible', () => {
    expect(() => render(<CurrencyValue value="1,250.50" locale="en" />)).toThrow(TypeError);
  });

  it('refuses a JS number for money at compile time (NFR-08)', () => {
    // @ts-expect-error — money must be a decimal string or a Decimal, never a JS number.
    const invalid = <CurrencyValue value={1250.5} locale="en" />;

    // The assertion that matters is the @ts-expect-error above: if `number` ever becomes
    // assignable to MoneyValue, `tsc --noEmit` fails on an unused expect-error directive.
    expect(invalid).toBeTruthy();
  });
});
