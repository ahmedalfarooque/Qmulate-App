/**
 * Setting vocabulary — every configurable regulatory figure, and the shape it must arrive in.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * BINDING RULE 3 — THE STALENESS RULE — is the reason this module exists
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every numeric threshold, statutory deadline, fee percentage and classification figure in this
 * repository is **UNVERIFIED until confirmed against primary Saudi law** (the Arabic regulation
 * originals + Saudi counsel). Therefore:
 *
 *   · None of them is a code constant. Each lives in a `Setting` row, so a correction is a
 *     CONFIG change — not a code change, not a deploy (EXIT-3: "a fee-basis change via
 *     `Setting` flows through with no redeploy").
 *   · Each carries the marker {@link UNVERIFIED_NOTE} **inside its stored value**, so the
 *     caveat travels with the data into every report, export and UI that renders it. A figure
 *     cannot be quoted without its caveat coming along.
 *   · {@link settingEnvelopeSchema} makes that structural: an `unverified` envelope that lacks
 *     the marker DOES NOT PARSE, and a verified one carrying it does not parse either. An
 *     author physically cannot ship the figure without the caveat, or the caveat without the
 *     claim that it is unverified.
 *
 * This module is the *vocabulary and validation* half. The resolver (per-request, tiered,
 * uncached) is `packages/api`'s, and the rows are `packages/database`'s — the domain stays pure
 * and does no I/O.
 *
 * ## Fail closed
 * Unregistered key ⇒ `SETTING_MISSING`. Value of the wrong shape, wrong unit, unknown enum
 * member, or a marker mismatch ⇒ `SETTING_INVALID`. No tier with a row ⇒ `SETTING_MISSING`,
 * never a substituted default: an engine must never invent a statutory figure.
 *
 * ## The two 10%s — never conflate them
 * `nazirFee.percentOfRevenue` = 10% of **REVENUE**, QMULATE's own trustee fee, set by the DEED
 * (customary ʿushr / عُشر, Nazarah Art. 11). `authorityFee.maxPercentOfNetIncome` = ≤10% of
 * **NET INCOME**, the Awqaf Authority's own fee (Awqaf Law Art. 14) on endowments not under its
 * trusteeship. Different payee, different base, different instrument. They are separate keys
 * precisely so no future reader can collapse them into "the 10% rule". Both ⚠ unverified.
 */

import { z } from 'zod';

import type { MonthAnchor, WeekdayCode } from './dates/index.js';
// The distribution engine owns these two vocabularies; deriving the Setting enums from them (the
// way `distribution.rounding.method` derives from `ROUNDING_METHODS`) means a value the engine
// cannot honour is not configurable in the first place. `./distribution/contract.js` imports
// `./money.js`, `./errors.js` and `./dates/`, never this file, so there is no cycle.
import {
  BINDING_CALENDARS,
  MAINTENANCE_RULE_KINDS,
  ratePercentSchema,
} from './distribution/contract.js';
import { DomainError } from './errors.js';
import { ROUNDING_METHODS, money } from './money.js';

/**
 * The marker every unverified regulatory figure carries with it.
 *
 * **Byte-identical to `packages/database/src/seed/settings.ts`'s constant** — a test reads that
 * file and compares, because a marker that differs by one character between the writer and the
 * reader is a marker that silently stops matching.
 */
export const UNVERIFIED_NOTE = '⚠ unverified — confirm vs primary law';

/**
 * The stored shape of a `Setting.value` (§07's `value Json` column, unchanged).
 *
 * `v` is the figure; `unit` says what it measures (pinned per key — a figure that silently
 * changes its unit is the worst kind of wrong); `source` names the authority the figure came
 * from; `note` is the ⚠ marker, present **iff** `unverified`.
 */
export interface SettingEnvelope<TValue> {
  readonly v: TValue;
  readonly unit: string | null;
  readonly unverified: boolean;
  readonly source: string;
  readonly note?: string;
}

/** The `unverified ⇔ note` refinement. Mirrors the shipped seed builder's refinement exactly. */
const unverifiedMarkerRefinement = (value: { unverified: boolean; note?: string }): boolean =>
  value.unverified ? value.note === UNVERIFIED_NOTE : value.note === undefined;

const UNVERIFIED_MARKER_MESSAGE = `an unverified Setting must carry note "${UNVERIFIED_NOTE}"; a verified one must carry none`;

/**
 * The envelope schema with an unconstrained `v` — for validating envelope *structure* when the
 * key (and therefore the value's type) is not known yet.
 *
 * Per-key schemas below constrain `v` and `unit`; this is the common floor.
 */
export const settingEnvelopeSchema = z
  .object({
    v: z.unknown(),
    unit: z.string().nullable(),
    unverified: z.boolean(),
    source: z.string().min(1),
    note: z.string().optional(),
  })
  .strict()
  // `z.unknown()` is OPTIONAL in zod, so without this an envelope carrying no value at all
  // would parse — a fail-open in the structural floor. A Setting with no figure is not a
  // Setting; the per-key schemas below constrain `v` further.
  .refine((value) => value.v !== undefined, 'a Setting envelope must carry a value in `v`')
  .refine(unverifiedMarkerRefinement, UNVERIFIED_MARKER_MESSAGE);

/** Build a per-key envelope schema with a typed `v` and a pinned `unit`. */
function envelope<TValue extends z.ZodTypeAny>(
  valueSchema: TValue,
  unitSchema: z.ZodTypeAny,
): z.ZodType<SettingEnvelope<z.infer<TValue>>> {
  return z
    .object({
      v: valueSchema,
      unit: unitSchema,
      unverified: z.boolean(),
      source: z.string().min(1),
      note: z.string().optional(),
    })
    .strict()
    .refine(unverifiedMarkerRefinement, UNVERIFIED_MARKER_MESSAGE) as unknown as z.ZodType<
    SettingEnvelope<z.infer<TValue>>
  >;
}

/* ── value primitives ─────────────────────────────────────────────────────────────────────── */

/**
 * An escalation ladder as a POSITIONAL 3-TUPLE in `ESCALATION_LEVELS` order —
 * `[case_manager, nazir, leadership]`, each a non-negative whole business-day count, and
 * non-decreasing along the path.
 *
 * Non-decreasing is refused HERE and again at the deriver on purpose: a config boundary that
 * accepts an incoherent ladder makes the deriver's identical check unreachable, and the deriver's
 * check is the one that runs on a value read from a database somebody edited by hand.
 */
const escalationLadderTuple = z
  .array(z.number().int().min(0))
  .length(3)
  .refine(
    (t) => (t[0] as number) <= (t[1] as number) && (t[1] as number) <= (t[2] as number),
    'escalation thresholds must be non-decreasing along case_manager → nazir → leadership',
  );

/**
 * A money-valued figure. **A STRING, always** — a JS `number` is never money: binary floats
 * cannot hold halalas exactly, and a classification band decides which statutory obligations
 * an endowment carries. Validated by the money engine itself (`money()`), so the accepted
 * format is exactly what the `Decimal(18,2)` column accepts: no exponent notation, at most
 * 2 dp, within range.
 */
const moneyValue = z.string().refine((value) => {
  try {
    const parsed = money(value);
    return !parsed.isNegative();
  } catch {
    return false;
  }
}, 'must be a non-negative decimal string at the halala scale (e.g. "200000000.00") — money is never a JS number');

/**
 * A percentage out of 100 (`10` = 10%).
 *
 * A rate, not an amount — the float ban is about *money*, and a rate is stringified before it
 * reaches `percentOf()`, which does the arithmetic in `Decimal`.
 */
const percentValue = z.number().finite().min(0).max(100);

/** A whole, non-negative count of days / months / years. Fractional windows are meaningless. */
const wholeCount = z.number().int().min(0);

/**
 * The two readings of a month-based statutory window (S9-2). A `const` tuple because `z.enum()`
 * needs the literal members at runtime; `satisfies` pins it to `dates/deadline.ts`'s
 * `MonthAnchor`, so a value the calendar engine cannot honour is not configurable and a new
 * anchor kind cannot land in one place only.
 */
const MONTH_ANCHOR_VALUES = [
  'day_of_month',
  'end_of_month',
] as const satisfies readonly MonthAnchor[];

/**
 * A session-security window, in whole seconds: at least one second, at most a day.
 *
 * ⚠ THE RANGE IS PART OF THE VOCABULARY, NOT A CALLER'S PRIVATE OPINION. `packages/api`'s
 * `readStepUpWindowSeconds` (middleware/segregation.ts) refuses a non-integer, a value `<= 0` and a
 * value `> 86_400` before it will let an approval through — the same three refusals, written twice.
 * Expressing them here makes this the single declaration and lets a test compare the two sides
 * value-for-value (the "make one side test the other" instruction), instead of trusting that two
 * hand-written validators still agree.
 *
 * `min(1)`, not `min(0)`: a zero-second window is not "very strict", it is a window in which only an
 * assertion timestamped at the exact request instant survives — an approval surface that denies
 * everything while looking configured.
 */
const securityWindowSeconds = z.number().int().min(1).max(86_400);

/**
 * Weekday codes, Sunday-first — the vocabulary the workweek Setting is expressed in.
 *
 * `['SUN','MON','TUE','WED','THU']` survives a JSON round-trip and a code review in a way
 * `[0,1,2,3,4]` does not, and the KSA weekend being Fri/Sat rather than Sat/Sun is exactly the
 * fact a bare integer array hides.
 *
 * A `const` **tuple** rather than the union type declared in `./dates/civil-date.ts`, because
 * `z.enum()` needs the literal members at runtime. The date engine's list is `@internal` and
 * indexed by weekday number; **a test compares the two lists, in order, by reading
 * `./dates/civil-date.ts` as text** — so the config vocabulary and the calendar arithmetic
 * cannot come to disagree about which day is which.
 */
export const WEEKDAY_CODES = [
  'SUN',
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
] as const satisfies readonly WeekdayCode[];

/**
 * Compile-time exhaustiveness: the tuple above must cover EVERY member of the calendar's
 * `WeekdayCode` union, not merely be a subset of it. A missing day would silently make that
 * weekday unconfigurable.
 */
type WeekdayCodesAreExhaustive =
  Exclude<WeekdayCode, (typeof WEEKDAY_CODES)[number]> extends never ? true : never;
const _weekdayCodesAreExhaustive: WeekdayCodesAreExhaustive = true;
void _weekdayCodesAreExhaustive;

/** Narrow an untrusted string to a weekday code. */
export function isWeekdayCode(value: unknown): value is WeekdayCode {
  return typeof value === 'string' && (WEEKDAY_CODES as readonly string[]).includes(value);
}

/**
 * Fee basis. **Must stay in step with `schema.prisma`'s `enum FeeBasis`** — a test reads the
 * schema and asserts every enum member parses here.
 *
 * The basis is CONTRACTUAL (fixed by the deed, Nazarah Art. 11), not a regulatory figure, so it
 * is the one fee-related key that is legitimately `unverified: false`. The *rate* is not.
 */
const feeBasisValue = z.enum(['PERCENT_OF_REVENUE', 'PERCENT_OF_NET_INCOME', 'RETAINER']);

/* ── the registry ─────────────────────────────────────────────────────────────────────────── */

/**
 * Key → schema. The CLOSED vocabulary of configurable figures.
 *
 * Every key here is seeded (a test asserts the two sets match in both directions), and every
 * ⚠ unverified figure the platform relies on is here rather than in code.
 */
export const SETTING_SCHEMAS = {
  // ── classification bands (which obligations apply at all) ────────────────────────────────
  /** ⚠ unverified — SAR 200M "large" band. Money-valued ⇒ a decimal STRING. */
  'classification.threshold.large.sar': envelope(moneyValue, z.literal('SAR')),
  /** ⚠ unverified — SAR 50M "medium" band. */
  'classification.threshold.medium.sar': envelope(moneyValue, z.literal('SAR')),

  // ── Nazir remuneration (deed-set, NOT statutory) ─────────────────────────────────────────
  /** Contractual, fixed by the deed — the one fee key that is legitimately verified. */
  'nazirFee.basis.default': envelope(feeBasisValue, z.null()),
  /**
   * ⚠ unverified — the customary ʿushr (عُشر): a tenth of REVENUE, set by this engagement's
   * deed. NOT a statutory rate, and NOT the Authority's fee below.
   *
   * This is the canonical key. See {@link LEGACY_SETTING_KEYS} for the `.default`-suffixed
   * spelling the seed currently uses for the global tier.
   */
  'nazirFee.percentOfRevenue': envelope(percentValue, z.literal('percent')),

  // ── the Authority's OWN, separate fee — different payee and base ─────────────────────────
  /** ⚠ unverified — Awqaf Law Art. 14: ≤10% of NET INCOME, payable to the Authority. */
  'authorityFee.maxPercentOfNetIncome': envelope(percentValue, z.literal('percent')),

  // ── statutory windows (the deadline engine resolves these; nothing is hard-coded) ────────
  /** ⚠ unverified — registration window, in KSA business days. */
  'deadline.REGISTER_30BD.businessDays': envelope(wholeCount, z.literal('business_days')),
  /** ⚠ unverified — material-change update window, in business days. */
  'deadline.UPDATE_15BD.businessDays': envelope(wholeCount, z.literal('business_days')),
  /** ⚠ unverified — istibdal (substitution) Authority-notice window, in business days. */
  'deadline.ISTIBDAL_10BD.businessDays': envelope(wholeCount, z.literal('business_days')),
  /** ⚠ unverified — distribution window after fiscal-year end where the deed is silent. */
  'deadline.DISTRIBUTE_3M_FYE.months': envelope(wholeCount, z.literal('months')),
  /**
   * ⚠ unverified — HOW the 3-month window treats the day of month, which is a QUESTION OF LAW
   * with no default (`dates/deadline.ts`'s module note: "within 3 months of the end of the
   * fiscal year" has two readings that differ by up to three days on exactly the dates that
   * matter, because a fiscal year end is always a month end). `computeRuleDeadline` REFUSES
   * without this row — mutation-proven in S9-1 — so the answer is made visibly, in
   * configuration, by whoever can answer it. The seeded value is `day_of_month`, the EARLIER of
   * the two readings — the direction in which lateness can never be UNDER-reported (the S3-D2
   * `EARLIER_OF` precedent), and exactly as provisional as that one.
   *
   * The vocabulary is `dates/deadline.ts`'s `MonthAnchor`, pinned by `satisfies` below so a
   * value the engine cannot honour is not configurable.
   */
  'deadline.DISTRIBUTE_3M_FYE.monthAnchor': envelope(z.enum(MONTH_ANCHOR_VALUES), z.null()),
  /**
   * The pre-expiry ACTIONABLE lead for licence/permit renewals, in business days — when QMULATE
   * starts acting before a recorded expiry. ⚠ NOT an unverified regulatory figure, and
   * deliberately not marked as one (the `auth.totpStepUp.freshnessSeconds` reasoning): the
   * statutory fact is the EXPIRY; the lead is our own operating policy for meeting it early.
   */
  'deadline.LICENSE_RENEWAL.preExpiryLeadBd': envelope(wholeCount, z.literal('business_days')),
  /** Contract-renewal actionable lead, in business days. Operating policy, same as above. */
  'deadline.CONTRACT_RENEWAL.preExpiryLeadBd': envelope(wholeCount, z.literal('business_days')),
  /**
   * S9-3c — how many business days BEFORE a recorded `Waqf.certificateExpiry` the daily sweep
   * raises the `GOV-REG-02` update duty. §09's own parenthesis: the certificate trigger fires "on
   * (or a configurable lead before) expiry".
   *
   * ⚠ THIS CONFIGURES WHEN WE NOTICE, NOT WHEN THE CLOCK STARTS — and the distinction is the
   * whole reason it is safe to have a lead at all. §09's rule table fixes the anchor: the
   * 15-business-day window runs from the CERTIFICATE-EXPIRY DATE. A lead of 30 makes the sweep
   * raise the duty a month early; it does not move the anchor by one day, and the computed due
   * date is identical whichever day the sweep noticed. So this is QMULATE's own alerting policy,
   * NOT an unverified regulatory figure, and it is deliberately absent from
   * `UNVERIFIED_FIGURE_KEYS` for the `auth.totpStepUp.freshnessSeconds` reason — the same
   * treatment the two renewal leads, the pre-alert offsets and the at-risk threshold get.
   *
   * There is no code default: the sweep refuses (`SETTING_MISSING`) without a row, because a
   * hard-coded `0` would silently answer §09's parenthesis with "never early".
   */
  'deadline.UPDATE_15BD.certificateExpiryLeadBd': envelope(wholeCount, z.literal('business_days')),
  /**
   * Reminder pre-alert offsets, in business days before due (e.g. `[30, 15, 7, 3, 1]`). Each
   * fires exactly on its own day (`preAlertsFiringOn` — idempotence by derivation). Operating
   * policy, not a statutory figure. Positive, unique, whole — the same validation the domain
   * deriver enforces (`DEADLINE_STATE_INCOHERENT`), applied at the config boundary too.
   */
  'deadline.preAlertOffsetsBd': envelope(
    z
      .array(z.number().int().min(1))
      .min(1)
      .refine((offsets) => new Set(offsets).size === offsets.length, 'offsets must be unique'),
    z.literal('business_days'),
  ),
  /** The final at-risk threshold, in business days before due (inclusive). Operating policy. */
  'deadline.atRiskThresholdBd': envelope(wholeCount, z.literal('business_days')),
  /**
   * S9-3d — the BR-1004 escalation ladder: after how many business days OVERDUE each rung engages.
   *
   * ⚠ A POSITIONAL 3-TUPLE IN PATH ORDER — `[case_manager, nazir, leadership]` — and the shape is a
   * decision, not a convenience. The seed's `SettingScalar` union deliberately admits only strings,
   * numbers, booleans and flat arrays; a first draft of this key used an OBJECT and the seed refused
   * it with a `ZodError`. Widening that union to carry one config's convenience would have loosened
   * a narrow safety contract for every future key, so the ladder took the shape that already exists
   * (`deadline.preAlertOffsetsBd`'s precedent). The ORDER is unambiguous because the path itself is
   * FIXED vocabulary in `deadlines/escalation.ts` (`ESCALATION_LEVELS`) — and `ladderFromTuple` is
   * the one place the positional convention is read, so it cannot be re-invented per caller.
   *
   * The PATH is not configuration (a ladder reaching Leadership before the Nazir is not a policy).
   * The THRESHOLDS are QMULATE's own operating policy, exempt from `UNVERIFIED_FIGURE_KEYS` for the
   * `auth.totpStepUp.freshnessSeconds` reason: nothing in primary law says when we escalate
   * internally. Validated non-decreasing HERE as well as at the deriver, because a config boundary
   * that accepts an incoherent ladder makes the deriver's check unreachable.
   */
  'deadline.escalationLadderBd': envelope(escalationLadderTuple, z.literal('business_days')),
  /**
   * S9-3d — the ladder for ZERO-TOLERANCE rules (§09: they "escalate on a faster ladder"). Same
   * positional 3-tuple.
   *
   * ⚠ THE RELATION TO THE ORDINARY LADDER IS STRUCTURAL, NOT CONFIGURATION, and it is checked in
   * `selectEscalationLadder`: not slower at any rung. §09 gives no figures, so both ladders are
   * configuration — but a pair where the zero-tolerance rung engages LATER would make the strictest
   * statutory duties the slowest to reach anyone, silently and in the one direction nobody checks.
   * That refuses (`ZERO_TOLERANCE_LADDER_NOT_FASTER`) rather than being accepted as a policy.
   */
  'deadline.escalationLadderZeroToleranceBd': envelope(
    escalationLadderTuple,
    z.literal('business_days'),
  ),

  // ── KYC / retention ─────────────────────────────────────────────────────────────────────
  /** ⚠ unverified — UBO/KYC refresh cadence (Beneficial Ownership Standards). */
  'kyc.refreshIntervalMonths': envelope(wholeCount, z.literal('months')),
  /** ⚠ unverified — document retention floor, in years. */
  'retention.minimumYears': envelope(wholeCount, z.literal('years')),
  /**
   * ⚠ unverified — the SAR retention floor (AmlReport/AmlFollowUp), in years, DISTINCT from the
   * document floor above: whether a SAR's clock is even the same clock is an open counsel question
   * (S8-Q2's recorded remainder). Owner ruling 2026-08-25 (memo, fourth batch, "SAR retention"):
   * adopt ≥10y as a configurable Setting flagged *confirm vs primary AML law* — the ENFORCEMENT
   * half has existed since migration 29 (`aml_report`/`aml_follow_up` `_no_delete`/`_no_truncate`,
   * `ENABLE ALWAYS`); this key is the FIGURE those guards' documentation cites, so a counsel
   * correction is a config change, not a migration.
   */
  'retention.aml.minimumYears': envelope(wholeCount, z.literal('years')),

  // ── distribution rounding (OQ-01, unresolved) ───────────────────────────────────────────
  /**
   * ⚠ unverified — OQ-01. The vocabulary is the money engine's `ROUNDING_METHODS`, derived from
   * it rather than restated, so a method the engine cannot perform is not configurable.
   */
  'distribution.rounding.method': envelope(z.enum(ROUNDING_METHODS), z.null()),
  /** Arithmetic granularity, not a legal figure: SAR's minor unit is the halala, 1/100. */
  'distribution.rounding.unitMinor': envelope(z.number().int().min(1), z.literal('halala')),

  // ── distribution timing and ṣiyāna (E6 / S3) ────────────────────────────────────────────
  /**
   * ⚠ unverified (S3 decision D2) — which calendar binds the post-fiscal-year-end distribution
   * window when the two disagree.
   *
   * `deadlineGregorian = FYE + N calendar months` and `deadlineHijri = Hijri(FYE) + N Hijri
   * months` are DIFFERENT DAYS: for FYE 2026-12-31 they are 2027-03-31 and 1448-10-22 =
   * 2027-03-30, one day apart. Which one a Nazir is actually late against is a question of Saudi
   * law, so it is configuration, not a coded choice. The seeded default is `EARLIER_OF` — the
   * direction in which lateness can never be UNDER-reported. The engine reports both dates
   * whichever is selected.
   *
   * The vocabulary is DERIVED from the engine's `BINDING_CALENDARS`, so a selector the engine
   * cannot honour is not configurable.
   */
  'distribution.deadline.bindingCalendar': envelope(z.enum(BINDING_CALENDARS), z.null()),
  /**
   * ✓ **ANSWERED 2026-08-18 (product owner, OQ-06) — and the answer is `NAZIR_DISCRETION_PERCENT`.**
   *
   * This key asked *"which ṣiyāna rule applies when the Shart al-Waqif is silent about
   * maintenance?"* and was seeded `NONE` as the "we have not decided" value. The owner decided:
   * *"the law gives the nazir a discretion. at Qmulate each endownment will have a % set deserve at
   * the nazir's discretion."* So the rule KIND is settled platform-wide and the only remaining
   * variable is the PERCENTAGE, which is per endowment and belongs to
   * {@link SETTING_SCHEMAS}`['distribution.maintenance.nazirDiscretionPercent']`.
   *
   * ⚠ **KEPT, NOT DELETED, AND STILL NEVER READ BY THE ENGINE.** The registry is closed and this key
   * is seeded; removing it would be a data change dressed as a cleanup. It now records *which kind a
   * silent deed resolves to* — and the honest value is `NAZIR_DISCRETION_PERCENT` where a percentage
   * has been recorded, `UNSET` where none has. The engine is still handed an already-resolved rule
   * and still reads neither key, so nothing here can silently become a default.
   */
  'distribution.maintenance.ruleWhenShartSilent': envelope(
    z.enum(MAINTENANCE_RULE_KINDS),
    z.null(),
  ),
  /**
   * ⊕ **OQ-06 (product owner, 2026-08-18): the ṣiyāna percentage a NAZIR has recorded for THIS
   * endowment, where the deed is silent on maintenance.** Verbatim: *"each endownment will have a %
   * set deserve at the nazir's discretion."*
   *
   * ⚠ **PER-ENDOWMENT BY DESIGN, AND THERE IS NO PLATFORM DEFAULT.** A global row for this key would
   * be a percentage nobody chose applied to every endowment — which is the exact defect OQ-06 opened
   * (a zero nobody decided, asserted silently on every silent deed). It is therefore seeded ONLY as
   * a per-waqf override, and an endowment with no row resolves to no policy: the caller assembles
   * `{ kind: 'UNSET' }` and the run carries `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED`.
   *
   * ⚠ **unverified — confirm vs primary law.** The *discretion* is the owner's ruling; any particular
   * percentage is a figure, and binding rule 3's flag-on-use applies to every one of them. This
   * package suggests none, floors none and caps none below 100.
   *
   * ⚠ **It is NOT the founder's `PERCENT`.** That is a term of the Shart al-Waqif — immutable, and
   * it wins wherever the deed states one. This is the trustee's discretion under a silent deed, and
   * the two are separate `MaintenanceRule` kinds so a statement can always say which produced the
   * reserve.
   */
  'distribution.maintenance.nazirDiscretionPercent': envelope(
    ratePercentSchema,
    z.literal('percent'),
  ),

  // ── session security (OPERATIONAL, not a regulatory figure) ──────────────────────────────
  /**
   * How recently a TOTP must have been asserted for an approve/sign to count as fresh (D-6).
   *
   * ⚠ NOT AN UNVERIFIED REGULATORY FIGURE, and deliberately not marked as one. Binding rule 3
   * covers statutory thresholds, deadlines, fee percentages and classification bands — figures
   * whose *correctness* is a question for primary Saudi law and counsel. This one traces to
   * NFR-06, which is QMULATE's OWN security policy (§15: "re-auth (TOTP) required to approve a
   * disbursement"; the ≤30-minute idle ceiling is a target we set, not a statute we are quoting).
   * Same class as `calendar.workweek` and `distribution.rounding.unitMinor`: configurable because
   * operations will tune it, not because a lawyer has yet to confirm it. Marking it ⚠ unverified
   * would dilute the marker — a reader who finds it on an operational knob learns to skim past it
   * on the SAR 200M band.
   *
   * It is still a `Setting` and not a constant: `packages/auth`'s documentary
   * `STEP_UP_FRESH_AGE_SECONDS = 600` is never read by the check, because a code fallback is
   * exactly how a fail-closed guard becomes fail-open the day the row goes missing.
   */
  'auth.totpStepUp.freshnessSeconds': envelope(securityWindowSeconds, z.literal('seconds')),

  // ── calendar ────────────────────────────────────────────────────────────────────────────
  /**
   * The KSA working week (Sun–Thu; Fri/Sat weekend) — an operating fact, not a statutory
   * figure. Read by the business-day engine; an empty or duplicated workweek is refused,
   * because a silently-empty calendar produces confidently wrong statutory due dates.
   */
  'calendar.workweek': envelope(
    z
      .array(z.enum(WEEKDAY_CODES))
      .min(1)
      .refine((days) => new Set(days).size === days.length, 'workweek days must be unique'),
    z.null(),
  ),
} as const;

/** A registered Setting key. */
export type SettingKey = keyof typeof SETTING_SCHEMAS;

/** Every registered key, as a list. */
export const SETTING_KEYS = Object.keys(SETTING_SCHEMAS) as readonly SettingKey[];

/** The parsed envelope type for a given key. */
export type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]>;

const SETTING_KEY_SET: ReadonlySet<string> = new Set(SETTING_KEYS);

/** Narrow an untrusted string (a database row, a query parameter) to a registered key. */
export function isSettingKey(value: unknown): value is SettingKey {
  return typeof value === 'string' && SETTING_KEY_SET.has(value);
}

/**
 * Keys whose seeded value MUST carry the ⚠ marker — the regulatory figures of binding rule 3.
 *
 * A test asserts this list equals the set of seeded rows with `unverified: true`, in both
 * directions. Flipping one to verified is a claim that primary Saudi law and counsel confirmed
 * it; the test forces that claim to be made here, deliberately, rather than in a config edit
 * nobody reviews.
 *
 * The four keys deliberately absent are `nazirFee.basis.default` (contractual — fixed by the
 * deed, no primary-law figure to verify against), `distribution.rounding.unitMinor` (SAR's
 * minor unit), `calendar.workweek` (an operating fact) and
 * `auth.totpStepUp.freshnessSeconds` (our own NFR-06 security policy, not a statutory figure).
 */
export const UNVERIFIED_FIGURE_KEYS: readonly SettingKey[] = [
  'classification.threshold.large.sar',
  'classification.threshold.medium.sar',
  'nazirFee.percentOfRevenue',
  'authorityFee.maxPercentOfNetIncome',
  'deadline.REGISTER_30BD.businessDays',
  'deadline.UPDATE_15BD.businessDays',
  'deadline.ISTIBDAL_10BD.businessDays',
  'deadline.DISTRIBUTE_3M_FYE.months',
  // S9-2: the month anchor is a QUESTION OF LAW (two readings, up to three days apart on exactly
  // the dates that matter); the seeded `day_of_month` is the earlier/conservative reading (the
  // S3-D2 EARLIER_OF precedent), not a settled position. The four `deadline.*` keys NOT listed
  // here (the two renewal leads, the pre-alert offsets, the at-risk threshold) are QMULATE's own
  // alerting policy, exempt for the `auth.totpStepUp.freshnessSeconds` reason.
  'deadline.DISTRIBUTE_3M_FYE.monthAnchor',
  'kyc.refreshIntervalMonths',
  'retention.minimumYears',
  // S9-4b (owner ruling 2026-08-25, memo fourth batch): the SAR retention floor is a distinct
  // figure under a distinct law (primary AML law, not the Nazarah document floor) — unverified.
  'retention.aml.minimumYears',
  'distribution.rounding.method',
  // E6 / S3 additions. Both are ⚠ unverified: D2's binding calendar is a question of Saudi law
  // (which deadline a Nazir is actually late against), and the ṣiyāna-when-silent rule is a fiqh
  // reading of the founder's intent. Neither is a figure this codebase may settle.
  'distribution.deadline.bindingCalendar',
  'distribution.maintenance.ruleWhenShartSilent',
  // ⊕ OQ-06. The DISCRETION is ruled; the PERCENTAGE is a figure, and every figure in this repo is
  // unverified until confirmed against primary law (binding rule 3). Listed here so a Nazir's
  // recorded percentage renders with the marker wherever it is shown.
  'distribution.maintenance.nazirDiscretionPercent',
];

/**
 * DECLARED DRIFT, not a supported alias.
 *
 * EXIT-3 is currently broken by data: the seeded GLOBAL row is
 * `nazirFee.percentOfRevenue.default` while the seeded PER-WAQF override is
 * `nazirFee.percentOfRevenue` — two different keys with no fallback link, so the endowment
 * override can never win over the global default. The canonical key is the un-suffixed one.
 *
 * This map exists ONLY so the seed-parity test can NAME the drift instead of silently
 * absorbing it. **Nothing resolves through it**: `parseSetting` does not accept a legacy key,
 * and no resolver should. Delete this map (and the test branch that reads it) once the seed
 * rename lands.
 */
export const LEGACY_SETTING_KEYS: Readonly<Record<string, SettingKey>> = {
  'nazirFee.percentOfRevenue.default': 'nazirFee.percentOfRevenue',
};

/**
 * Validate a stored `Setting.value` against its key's schema.
 *
 * - key not in the registry ⇒ `SETTING_MISSING` (the engine cannot be handed a figure it has
 *   no vocabulary for, and it will not guess one);
 * - value of the wrong shape, wrong unit, unknown enum member, or a ⚠ marker mismatch ⇒
 *   `SETTING_INVALID`.
 *
 * The returned envelope keeps `unverified` and `note`, so the caveat continues travelling with
 * the value into whatever renders it.
 */
export function parseSetting<K extends SettingKey>(key: K, raw: unknown): SettingValue<K> {
  if (!isSettingKey(key)) {
    throw new DomainError(
      'SETTING_MISSING',
      `"${String(key)}" is not a registered Setting key. Regulatory figures are configuration, never hardcoded defaults — and never an unknown vocabulary either.`,
      { details: { key: typeof key === 'string' ? key : typeof key } },
    );
  }

  const result = SETTING_SCHEMAS[key].safeParse(raw);
  if (!result.success) {
    throw new DomainError(
      'SETTING_INVALID',
      `Setting "${key}" does not satisfy its schema: ${result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`).join('; ')}`,
      { details: { key, issues: result.error.issues.map((issue) => issue.message) } },
    );
  }
  return result.data as SettingValue<K>;
}

/* ── scope resolution ─────────────────────────────────────────────────────────────────────── */

/**
 * The tiers a Setting may be defined at.
 *
 * There are exactly two: a per-endowment row (`Setting.waqfId` set) and a global row
 * (`waqfId = null`). **There is deliberately no client/family tier** — §10 principle 2: scope
 * is the endowment, never the client family.
 */
export type SettingScopeTier = 'endowment' | 'global';

/** Resolution order: most specific first. The endowment override always wins. */
export const SETTING_SCOPE_ORDER: readonly SettingScopeTier[] = ['endowment', 'global'];

/** Resolution order, as a function (for callers that prefer not to import the constant). */
export function settingScopeOrder(): readonly SettingScopeTier[] {
  return SETTING_SCOPE_ORDER;
}

/** A candidate value found at one tier. */
export interface ScopedSettingCandidate<TValue> {
  readonly tier: SettingScopeTier;
  readonly value: TValue;
}

/**
 * Pick the most specific candidate: endowment before global.
 *
 * - no candidate at any tier ⇒ `SETTING_MISSING`. Never a substituted default — EXIT-3
 *   requires exactly this, because a silently-defaulted statutory window produces a
 *   confidently wrong due date.
 * - an unmapped tier ⇒ `SETTING_INVALID`. Fail closed on an unrecognised enum value rather
 *   than treating it as "probably global".
 */
export function pickMostSpecific<TValue>(
  key: string,
  candidates: readonly ScopedSettingCandidate<TValue>[],
): TValue {
  for (const candidate of candidates) {
    if (!SETTING_SCOPE_ORDER.includes(candidate.tier)) {
      throw new DomainError(
        'SETTING_INVALID',
        `Setting "${key}": "${String(candidate.tier)}" is not a recognised scope tier (${SETTING_SCOPE_ORDER.join(' → ')}).`,
        { details: { key, tier: String(candidate.tier) } },
      );
    }
  }

  for (const tier of SETTING_SCOPE_ORDER) {
    const match = candidates.find((candidate) => candidate.tier === tier);
    if (match !== undefined) return match.value;
  }

  throw new DomainError(
    'SETTING_MISSING',
    `Required setting "${key}" has no row at any tier (${SETTING_SCOPE_ORDER.join(' → ')}). Regulatory figures are configuration, never hardcoded defaults.`,
    { details: { key, tiersSearched: [...SETTING_SCOPE_ORDER] } },
  );
}
