import { getTranslations } from 'next-intl/server';

import { resolveLocale } from '@qmulate/i18n';
import { DateValue } from '@qmulate/ui';

import type { DualDate } from '@/lib/endowments/types';

/**
 * A legally significant date, in BOTH calendars, with the calendar names resolved once.
 *
 * ── NFR-02: THE FROZEN SNAPSHOT WINS, ALWAYS ──────────────────────────────────────────────
 * `hijriSnapshot` is the `…AtHijri` string written at INSERT time. `<DateValue>` renders it
 * verbatim and never recomputes it, so a registration recorded in 1980 still shows the Hijri date
 * it was recorded under even if the ICU data, the calendar library or the runtime changes
 * underneath. Recomputation would silently rewrite history on a regulator-facing record — which is
 * why the snapshot is a stored column and not a derived value.
 *
 * ── BOTH CALENDARS ARE ALWAYS RENDERED ────────────────────────────────────────────────────
 * Both carry legal meaning; neither may be dropped. `primary="hijri"` is for regulator-facing
 * surfaces (Authority filings and notices), `gregorian` for internal ops screens — these endowment
 * records are internal, so the default leads with the Gregorian value and shows the Hijri beside it.
 *
 * The calendar NAMES come from `packages/i18n` and become the accessible name of each half, so a
 * screen reader says which calendar it is reading rather than announcing two bare numbers.
 */
export async function DualDateValue({
  locale,
  date,
  primary = 'gregorian',
}: {
  readonly locale: string;
  readonly date: DualDate;
  readonly primary?: 'hijri' | 'gregorian';
}) {
  const t = await getTranslations({ locale, namespace: 'common' });

  return (
    <DateValue
      value={date.iso}
      hijriSnapshot={date.hijri}
      primary={primary}
      locale={resolveLocale(locale)}
      labels={{ hijri: t('hijri'), gregorian: t('gregorian') }}
    />
  );
}
