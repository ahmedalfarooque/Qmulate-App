import { Text } from '@qmulate/ui';

import type { ReactNode } from 'react';

/**
 * RecordList — a labelled record, as a real `<dl>`.
 *
 * The endowment surfaces are records before they are anything else, so the markup says so:
 * `<dl>/<dt>/<dd>` gives a screen reader the term/definition pairing that a grid of `<div>`s
 * throws away, and it is what lets a Nazir tab through a deed and hear "Waqf deed number,
 * FAKE-DEED-455" instead of two unrelated strings.
 *
 * ── LAYOUT IS LOGICAL, NOT PHYSICAL ───────────────────────────────────────────────────────
 * A two-column grid with `text-start`. No `ml-`, no `pr-`, no `left`/`right` anywhere — the whole
 * record mirrors from `dir="rtl"` on the root element with no second stylesheet. Below the app
 * breakpoint it collapses to one column, because a 2-column record on a phone is a horizontal
 * scroll and this product has none.
 *
 * ── NO COPY LIVES HERE ────────────────────────────────────────────────────────────────────
 * Both the label and the value are `ReactNode`s supplied by the caller from `@qmulate/i18n`. The
 * component never knows what it is showing, which is also why it can carry a `<Mono>` deed number
 * and an Arabic sentence in the same list.
 */

export interface RecordRow {
  /** Stable key — the field's name, not its index, so a reordered record keeps its identity. */
  readonly key: string;
  readonly label: ReactNode;
  /**
   * The recorded value. Pass the "not recorded" sentence explicitly rather than `null`: a blank
   * cell on a legal record is ambiguous between "empty" and "we failed to load it".
   */
  readonly value: ReactNode;
  /** An extra line under the value — provenance, a caveat, or the unverified marker. */
  readonly note?: ReactNode;
}

export function RecordList({
  rows,
  'data-testid': testId,
}: {
  readonly rows: readonly RecordRow[];
  readonly 'data-testid'?: string;
}) {
  return (
    <dl
      data-testid={testId}
      className="grid grid-cols-1 gap-x-[var(--space-24)] gap-y-[var(--space-16)] text-start md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]"
    >
      {rows.map((row) => (
        <div key={row.key} className="contents">
          <dt className="qm-label self-start">{row.label}</dt>
          <dd className="flex min-w-0 flex-col gap-[var(--space-4)] text-body text-ink">
            <span className="min-w-0 break-words">{row.value}</span>
            {row.note === undefined ? null : (
              <Text variant="body-sm" tone="mist">
                {row.note}
              </Text>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
