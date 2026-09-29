/**
 * DUAL DATES, VALIDATED AS A PAIR — the transport boundary's half of schema convention 2.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS (V-E3-M1)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every legally-significant date in this system is stored twice: the Gregorian instant, and the
 * Umm-al-Qura snapshot FROZEN at write time so a filed date can never shift because a conversion
 * library changed (D-4). Four write paths derive the Hijri half server-side —
 * `approval.approve`, `endowment.recordDeedTerms`, `deed.verifyEligibility`, `settings.set` — and
 * two accepted it FROM THE CALLER on a `\d{4}-\d{2}-\d{2}` regex with no comparison at all:
 * `classification.reclassify` and `endowment.update`.
 *
 * MEASURED at `f823365`, through `appRouter.createCaller` on a real database:
 *   classification.reclassify({ at: '2026-08-13T00:00:00.000Z', atHijri: '1300-01-01' })
 *     → ACCEPTED. Stored in the APPEND-ONLY BR-104 history as
 *       `at=2026-08-13T00:00:00.000Z  atHijri=1300-01-01` — a ~700-year discrepancy in the
 *       regulator-facing record, and `reclassification_event` refuses UPDATE, DELETE and TRUNCATE,
 *       so the corrective edit is refused too. Wrong, permanently.
 *   endowment.update({ certificateExpiry: '2026-08-13…', certificateExpiryHijri: '1300-01-01' })
 *     → ACCEPTED.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ ONE HIJRI IMPLEMENTATION, AND THIS FILE IS NOT IT (ADR-0007 / D-4)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The conversion is `@qmulate/domain`'s `toHijriSnapshot`, imported. There is no arithmetic here, no
 * table, no tolerance window and no second formatter — a "close enough" comparison would be a second
 * implementation wearing a validator's clothes. The caller's value must be BYTE-IDENTICAL to the
 * server's derivation.
 *
 * ── WHY THE CALLER STILL SENDS IT AT ALL ─────────────────────────────────────────────────────
 * Because the pair is what the Nazir SAW and what the screen recorded, and a submitted value that
 * disagrees with the server's is a real disagreement worth refusing loudly rather than silently
 * overwriting. Deriving-and-ignoring would hide a client whose calendar is wrong; refusing surfaces
 * it. The value that lands in the column is still the SERVER's — see {@link derivedHijriSnapshot}.
 */

import { HIJRI_SUPPORTED_RANGE, toHijriSnapshot } from '@qmulate/domain/dates';

import { ApiError } from './errors.js';

/** A frozen Umm-al-Qura snapshot as it crosses the wire, `yyyy-MM-dd` (schema convention 2). */
export const HIJRI_SNAPSHOT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The server's Umm-al-Qura snapshot for `instant`, or a NAMED refusal.
 *
 * `toHijriSnapshot` throws a `RangeError` outside the Umm-al-Qura table window. That must not
 * surface as an unhandled 500 — a caller can reach it with any parseable ISO date — so it is
 * restated as `GATE_NOT_CLEARED` with the range in the message.
 */
export function derivedHijriSnapshot(instant: Date, field: string): string {
  if (Number.isNaN(instant.getTime())) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `${field} is not a parseable instant, so no Umm-al-Qura snapshot can be derived for it. ` +
        `REFUSED rather than stored: a legally-significant date with an underivable Hijri half is a ` +
        `record filed in one calendar (schema convention 2).`,
      { field, reason: 'GREGORIAN_UNPARSEABLE' },
    );
  }
  try {
    return String(toHijriSnapshot(instant));
  } catch (error) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `HIJRI_OUT_OF_RANGE: ${field} = ${instant.toISOString()} is outside the Umm-al-Qura table ` +
        `window (${HIJRI_SUPPORTED_RANGE.minCivilDate} … ${HIJRI_SUPPORTED_RANGE.maxCivilDate}, i.e. ` +
        `${HIJRI_SUPPORTED_RANGE.minHijriYear}–${HIJRI_SUPPORTED_RANGE.maxHijriYear} AH), so its ` +
        `Hijri half cannot be derived. REFUSED rather than approximated: ICU would silently ` +
        `EXTRAPOLATE, and an extrapolated Hijri date on a filed waqf record is a fabricated fact. ` +
        `Original: ${String(error)}`,
      { field, reason: 'HIJRI_OUT_OF_RANGE', instant: instant.toISOString() },
    );
  }
}

/**
 * Asserts that a caller-supplied Hijri half IS the server's own snapshot of the Gregorian half, and
 * returns the SERVER's value — which is what the caller must store.
 *
 * ⚠ THE RETURN VALUE IS THE SERVER'S, NOT THE INPUT'S, even though they are now proven equal. It
 * removes the last path by which a caller string reaches a column: if this function is ever relaxed,
 * the write paths do not silently start persisting caller input again.
 *
 * @param instant       the Gregorian half, already parsed
 * @param supplied      the caller's Hijri half, already regex-validated by the router's zod schema
 * @param gregorianField the input field name, for the refusal message
 * @param hijriField     the paired input field name, for the refusal message
 */
export function assertHijriPairAgrees(
  instant: Date,
  supplied: string,
  gregorianField: string,
  hijriField: string,
): string {
  const derived = derivedHijriSnapshot(instant, gregorianField);
  if (derived !== supplied) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `DUAL_DATE_MISMATCH: ${hijriField} = ${JSON.stringify(supplied)} is not the Umm-al-Qura ` +
        `snapshot of ${gregorianField} = ${instant.toISOString()}, which is ` +
        `${JSON.stringify(derived)}. The two halves of a legally-significant date are ONE fact ` +
        `recorded in two calendars (schema convention 2), and the Hijri half is FROZEN at write time ` +
        `— it is never recomputed downstream, so a wrong value stays wrong for the life of the ` +
        `record and, where the table is append-only, for good. REFUSED rather than overwritten: a ` +
        `client whose calendar disagrees with the server's is a defect to surface, not one to paper ` +
        `over. There is a single Hijri implementation (ADR-0007) and this is its answer.`,
      {
        reason: 'DUAL_DATE_MISMATCH',
        gregorianField,
        hijriField,
        supplied,
        derived,
        instant: instant.toISOString(),
      },
    );
  }
  return derived;
}
