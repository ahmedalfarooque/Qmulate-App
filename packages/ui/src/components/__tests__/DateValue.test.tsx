import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DateValue } from '../DateValue';

/**
 * Acceptance encoded here (E0 AC-E0-9, NFR-02, 11-localization-spec.md §6):
 *   · a FROZEN Hijri snapshot is displayed VERBATIM and never recomputed — a statement
 *     issued last year keeps the Hijri date it was issued under, whatever ICU does later;
 *   · both calendars are always rendered; neither is dropped, because both carry legal
 *     meaning;
 *   · Hijri leads on regulator-facing surfaces, Gregorian on internal ops surfaces;
 *   · the canonical UTC value stays machine-readable regardless of what is displayed.
 */

const ISO = '2026-05-01T00:00:00.000Z';

/** Deliberately NOT the true Umm-al-Qura conversion of ISO — proves it is not recomputed. */
const FROZEN_SNAPSHOT = '1447-11-02';

describe('DateValue', () => {
  it('prefers the frozen Hijri snapshot over recomputation', () => {
    const { container } = render(
      <DateValue value={ISO} hijriSnapshot={FROZEN_SNAPSHOT} primary="hijri" locale="en" />,
    );

    expect(container.textContent).toContain(FROZEN_SNAPSHOT);

    const hijriPart = container.querySelector('[data-calendar="hijri"]');
    expect(hijriPart?.getAttribute('data-frozen')).toBe('true');
  });

  it('renders the snapshot verbatim in Arabic too — no reformatting, no digit shaping', () => {
    const { container } = render(
      <DateValue value={ISO} hijriSnapshot={FROZEN_SNAPSHOT} primary="hijri" locale="ar" />,
    );

    expect(container.textContent).toContain(FROZEN_SNAPSHOT);
  });

  it('marks the snapshot as Latin/numeric so it stays in Geist Mono, LTR-isolated', () => {
    const { container } = render(
      <DateValue value={ISO} hijriSnapshot={FROZEN_SNAPSHOT} primary="hijri" locale="ar" />,
    );
    const bdi = container.querySelector('bdi');

    expect(bdi?.getAttribute('dir')).toBe('ltr');
    expect(bdi?.textContent).toBe(FROZEN_SNAPSHOT);
    expect(bdi?.className).toContain('qm-mono');
  });

  it('falls back to a computed Hijri value only when no snapshot exists', () => {
    const { container } = render(<DateValue value={ISO} primary="hijri" locale="en" />);

    const hijriPart = container.querySelector('[data-calendar="hijri"]');
    expect(hijriPart?.getAttribute('data-frozen')).toBe('false');
    expect(hijriPart?.textContent).not.toBe(FROZEN_SNAPSHOT);
    expect(hijriPart?.textContent?.length ?? 0).toBeGreaterThan(0);
  });

  it('always renders both calendars', () => {
    const { container } = render(
      <DateValue value={ISO} hijriSnapshot={FROZEN_SNAPSHOT} locale="en" />,
    );

    expect(container.querySelector('[data-calendar="hijri"]')).not.toBeNull();
    expect(container.querySelector('[data-calendar="gregorian"]')).not.toBeNull();
  });

  it('leads with Gregorian on ops surfaces and Hijri on regulator-facing ones', () => {
    const ops = render(<DateValue value={ISO} hijriSnapshot={FROZEN_SNAPSHOT} locale="en" />);
    const opsFirst = ops.container.querySelector('[data-calendar]');
    expect(opsFirst?.getAttribute('data-calendar')).toBe('gregorian');

    const regulator = render(
      <DateValue value={ISO} hijriSnapshot={FROZEN_SNAPSHOT} primary="hijri" locale="en" />,
    );
    const regulatorFirst = regulator.container.querySelector('[data-calendar]');
    expect(regulatorFirst?.getAttribute('data-calendar')).toBe('hijri');
  });

  it('keeps the canonical UTC value machine-readable', () => {
    const { container } = render(
      <DateValue value={ISO} hijriSnapshot={FROZEN_SNAPSHOT} locale="ar" />,
    );

    expect(container.querySelector('[data-iso]')?.getAttribute('data-iso')).toBe(ISO);
  });

  it('treats an empty snapshot as absent rather than rendering a blank date', () => {
    const { container } = render(
      <DateValue value={ISO} hijriSnapshot="  " primary="hijri" locale="en" />,
    );
    const hijriPart = container.querySelector('[data-calendar="hijri"]');

    expect(hijriPart?.getAttribute('data-frozen')).toBe('false');
    expect(hijriPart?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
  });

  it('attaches caller-supplied calendar names as accessible text', () => {
    const { container } = render(
      <DateValue
        value={ISO}
        hijriSnapshot={FROZEN_SNAPSHOT}
        locale="en"
        labels={{ hijri: 'Hijri', gregorian: 'Gregorian' }}
      />,
    );

    expect(container.textContent).toContain('Hijri');
    expect(container.textContent).toContain('Gregorian');
  });

  it('rejects an invalid date rather than rendering "Invalid Date"', () => {
    expect(() => render(<DateValue value="not-a-date" locale="en" />)).toThrow(TypeError);
  });
});
