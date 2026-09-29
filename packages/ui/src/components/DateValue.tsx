/**
 * DateValue — a legally significant date shown in BOTH calendars.
 *
 * ── NFR-02: THE FROZEN HIJRI SNAPSHOT WINS ────────────────────────────────────────────
 * Every legally significant date is stored twice: a canonical Gregorian UTC `DateTime`
 * (the sort and arithmetic truth) plus a `…AtHijri` STRING frozen at insert time. When
 * `hijriSnapshot` is supplied, this component renders it VERBATIM and never recomputes
 * it — so a statement issued last year still shows the Hijri date it was issued under,
 * even if the calendar library, the ICU data or the runtime changes underneath.
 * Recomputation would silently rewrite history on a regulator-facing document.
 *
 * `formatHijri` is used only as the fallback when no snapshot exists (an unsaved draft, a
 * projected date). It is DISPLAY-ONLY: statutory deadline arithmetic belongs to
 * `@qmulate/domain` with `@umalqura/core`, never to `Intl`.
 *
 * ── Which calendar leads ──────────────────────────────────────────────────────────────
 * `primary="hijri"` on regulator-facing surfaces (Authority filings, notices),
 * `primary="gregorian"` (the default) on internal ops surfaces. The alternate is ALWAYS
 * rendered — both carry legal meaning and neither may be dropped.
 *
 * ── No hard-coded copy ────────────────────────────────────────────────────────────────
 * The calendar names are not baked in. Pass `labels` from `@qmulate/i18n`
 * (`t('common.hijri')` / `t('common.gregorian')`) and they become the accessible names
 * for each value; omit them and the two values render unlabelled rather than in English.
 */

import {
  defaultLocale,
  formatDateDual,
  type CalendarName,
  type DateInput,
  type DateStyle,
  type Locale,
} from '@qmulate/i18n';
import * as React from 'react';

import { cx } from './Surface';
import { VisuallyHidden } from './VisuallyHidden';

export interface DateValueLabels {
  hijri: string;
  gregorian: string;
}

export interface DateValueProps {
  /** Canonical Gregorian value — a UTC ISO-8601 string or a `Date`. */
  value: DateInput;
  /**
   * The frozen `…AtHijri` snapshot written at insert time. When present it is displayed
   * verbatim and the Hijri side is never recomputed.
   */
  hijriSnapshot?: string | null;
  /** `'hijri'` on regulator-facing surfaces, `'gregorian'` on ops surfaces. */
  primary?: CalendarName;
  locale?: Locale;
  dateStyle?: DateStyle;
  /** Show the alternate calendar. Only turn off inside a dense column that shows it elsewhere. */
  showSecondary?: boolean;
  /** Accessible calendar names, supplied by the caller from `@qmulate/i18n`. */
  labels?: DateValueLabels;
  /** `inline` renders "primary (secondary)"; `stacked` puts the secondary on its own line. */
  layout?: 'inline' | 'stacked';
  className?: string;
}

export function DateValue({
  value,
  hijriSnapshot,
  primary = 'gregorian',
  locale = defaultLocale,
  dateStyle = 'medium',
  showSecondary = true,
  labels,
  layout = 'inline',
  className,
}: DateValueProps): React.JSX.Element {
  const dual = formatDateDual(value, { locale, dateStyle, primary, hijriSnapshot });

  const secondaryCalendar: CalendarName = primary === 'hijri' ? 'gregorian' : 'hijri';
  const primaryIsSnapshot = primary === 'hijri' && dual.hijriFromSnapshot;
  const secondaryIsSnapshot = secondaryCalendar === 'hijri' && dual.hijriFromSnapshot;

  return (
    <span
      className={cx(
        'tabular-nums',
        layout === 'stacked' ? 'inline-flex flex-col items-start gap-0.5' : 'inline',
        className,
      )}
      // The canonical UTC value stays machine-readable regardless of what is displayed.
      data-iso={dual.iso}
    >
      <CalendarPart
        text={dual.primary}
        calendar={primary}
        isSnapshot={primaryIsSnapshot}
        label={labels?.[primary]}
      />
      {showSecondary ? (
        <>
          {layout === 'inline' ? <span aria-hidden="true">{' ('}</span> : null}
          <CalendarPart
            text={dual.secondary}
            calendar={secondaryCalendar}
            isSnapshot={secondaryIsSnapshot}
            label={labels?.[secondaryCalendar]}
            muted
          />
          {layout === 'inline' ? <span aria-hidden="true">{')'}</span> : null}
        </>
      ) : null}
    </span>
  );
}

function CalendarPart({
  text,
  calendar,
  isSnapshot,
  label,
  muted = false,
}: {
  text: string;
  calendar: CalendarName;
  isSnapshot: boolean;
  label?: string;
  muted?: boolean;
}): React.JSX.Element {
  /**
   * A frozen snapshot is a raw numeric string (`1447-11-02`), so it is Latin/numeric and
   * belongs in Geist Mono, LTR-isolated. A computed value in `ar` contains Arabic month
   * names, which Geist Mono has no glyphs for — those keep the inherited face and only
   * take `tabular-nums`.
   */
  const classes = cx(isSnapshot ? 'qm-mono' : 'tabular-nums', muted && 'text-mist text-body-sm');

  const body = isSnapshot ? (
    <bdi dir="ltr" className={classes}>
      {text}
    </bdi>
  ) : (
    <span className={classes}>{text}</span>
  );

  return (
    <span data-calendar={calendar} data-frozen={isSnapshot ? 'true' : 'false'}>
      {body}
      {label ? <VisuallyHidden>{` ${label}`}</VisuallyHidden> : null}
    </span>
  );
}
