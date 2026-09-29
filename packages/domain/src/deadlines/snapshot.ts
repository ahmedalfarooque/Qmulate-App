/**
 * `deadlines/snapshot.ts` — the window AS APPLIED, built in ONE place.  (⊕ S11-1)
 *
 * Migration 38 demands a `windowSnapshot` on every engine-era `Deadline` INSERT and freezes it
 * against UPDATE: it is what a stored due date is DEFENDED with later ("computed under THIS window,
 * from THIS setting, with THIS roll"). Until S11-1 the shape lived as a module-private function in
 * `packages/api`'s deadline router — fine while the router was the only writer. S11-1 makes the
 * SEED a second writer (the fixture's in-coverage anchor gets its computed row seeded), and a second
 * copy of the key list would agree with the first only until one of them changed. ADR-0007's
 * single-implementation rule, applied to a snapshot: the shape is declared here, once, and both
 * writers call it.
 *
 * ⊕ `anchorSource` (see `anchors.ts` §6) is the provenance the correction chain reads back. It is
 * ABSENT — not `null` — where the caller names no declared home: the coalescing path's provenance
 * is the governing cause it records in its own audit event.
 */

import { type AnchorProvenance } from './anchors.js';
import { DEADLINE_RULES, type ComputedRuleDeadline, type RuleSettingValues } from './rules.js';

/** The keys every snapshot carries, in the order they are written. Pinned by a test. */
export const WINDOW_SNAPSHOT_KEYS = [
  'settingKey',
  'basis',
  'businessDays',
  'calendarMonths',
  'calendarDays',
  'monthAnchor',
  'roll',
  'unverified',
  'leadSettingKey',
  'preExpiryLeadBd',
] as const;

export type WindowSnapshot = Readonly<Record<(typeof WINDOW_SNAPSHOT_KEYS)[number], unknown>> & {
  readonly anchorSource?: AnchorProvenance;
};

/**
 * The window AS APPLIED for a computed deadline — every key present, `null` where a dimension does
 * not apply to this rule (a business-day rule has no `calendarMonths`), so a reader can tell "not
 * applicable" from "not recorded".
 */
export function windowSnapshotOf(
  computed: ComputedRuleDeadline,
  settings: RuleSettingValues,
  anchorSource: AnchorProvenance | null,
): WindowSnapshot {
  const rule = DEADLINE_RULES[computed.ruleKey];
  const base = {
    settingKey: computed.computed.window.settingKey,
    basis: computed.computed.basis,
    businessDays: computed.computed.window.businessDays ?? null,
    calendarMonths: computed.computed.window.calendarMonths ?? null,
    calendarDays: computed.computed.window.calendarDays ?? null,
    monthAnchor: computed.computed.window.monthAnchor ?? null,
    roll: computed.computed.rollConvention,
    unverified: computed.computed.unverifiedNote !== null,
    leadSettingKey: rule.leadSettingKey,
    preExpiryLeadBd: settings.preExpiryLeadBd?.v ?? null,
  };
  return anchorSource === null ? base : { ...base, anchorSource };
}
