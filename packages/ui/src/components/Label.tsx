/**
 * Label — the form-field label.
 *
 * Same language-switched treatment as `<Eyebrow>` (see that file for the full note on the
 * Arabic label problem): Latin labels are Geist Mono UPPERCASE +0.13em; Arabic labels are
 * IBM Plex Sans Arabic 600 with no transform and no tracking, because uppercasing or
 * letter-spacing Arabic breaks the cursive joins.
 *
 * Labels sit ABOVE the field, never floating inside it (DESIGN.md §6) — a floating label
 * disappears once the field has a value, which is unacceptable on a form that records
 * legally significant data.
 *
 * NO HARD-CODED COPY: the required marker's accessible text is supplied by the caller from
 * `@qmulate/i18n`. The asterisk alone is `aria-hidden` — a glyph is not an accessible name.
 */

import { labelClass, type Locale } from '@qmulate/i18n';
import * as React from 'react';

import { cx } from './Surface';

export interface LabelProps {
  /** The id of the field this labels. Required — a label with no target is decoration. */
  htmlFor: string;
  /** Only needed where the `:lang` cascade cannot be trusted (report/PDF/email). */
  locale?: Locale;
  /**
   * Accessible text for the required marker, e.g. t('common.required'). Passing it is
   * what marks the field required; omit it for optional fields.
   */
  requiredLabel?: string;
  tone?: 'mist' | 'ink' | 'danger';
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

const TONE_CLASS = {
  mist: '', // .qm-label already sets --color-mist
  ink: 'text-ink',
  danger: 'text-danger',
} as const;

export function Label({
  htmlFor,
  locale,
  requiredLabel,
  tone = 'mist',
  id,
  className,
  children,
}: LabelProps): React.JSX.Element {
  return (
    <label
      id={id}
      htmlFor={htmlFor}
      className={cx(
        locale ? labelClass(locale) : 'qm-label',
        TONE_CLASS[tone],
        'inline-flex items-center gap-1',
        className,
      )}
    >
      {children}
      {requiredLabel ? (
        <>
          <span aria-hidden="true" className="text-danger">
            *
          </span>
          <span className="sr-only">{requiredLabel}</span>
        </>
      ) : null}
    </label>
  );
}
