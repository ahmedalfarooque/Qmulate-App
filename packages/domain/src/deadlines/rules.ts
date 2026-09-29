/**
 * `deadlines/rules.ts` — §09 Engine B's RULE VOCABULARY: the nine statutory rule keys, what each
 * one is (a clock, a pre-expiry alert, an as-dated date, a retention floor), and the ONE compute
 * entry point that turns `(ruleKey, anchor, calendar, configured window)` into a frozen-shaped
 * due date — by composing the shipped `dates/` core, never by re-implementing it.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS, AND WHAT IT REFUSES TO BE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09's rule table binds each rule to a WINDOW (30/15/10 business days, 3 months, annual, a
 * pre-expiry lead), a BASIS and a ROLL. The roll and basis are STATUTORY structure and live here,
 * in code, because "you file after a trigger, you renew before an expiry" is the shape of the
 * obligation, not a figure. The WINDOW LENGTHS do not live here — binding rule 3: every one is an
 * unverified regulatory figure, so every one arrives as configuration (a `Setting` envelope the
 * caller resolved) and the compute refuses (`SETTING_MISSING`, via `computeDeadline`) rather than
 * substitute a default. Grep this file for a window figure and you will find none.
 *
 * Two of the ten bindings the obligation catalogue carries are NOT clocks, and §09 says so in its
 * own text — this module encodes that reading rather than leaving the bindings to dangle
 * (`UNRESOLVED_DEADLINE_BINDINGS` recorded exactly this debt as E8/S9's):
 *
 *  - **`RETENTION_10Y` is a floor governing deletion**, "enforced by the retention policy, not the
 *    reminder loop" (§09 §B). Computing a "due date" from it would put a `RETENTION_10Y` row into
 *    the reminder plane and invite someone to mark the floor "met".
 *  - **`AML_IMMEDIATE` is not a rule key at all.** §09 Engine C: the AML report "has no statutory
 *    countdown — the duty is 'immediate' — so it is modelled as an event obligation whose SLA is
 *    same-day, surfaced on the dashboard, not a business-day clock." Beyond the modelling point
 *    there is a G-6 point: a computed AML deadline would be an AML-attributable date sitting in
 *    the general deadline/reminder plane, which the no-tipping-off compartment exists to prevent.
 *
 * Both refuse with `DEADLINE_RULE_NOT_A_CLOCK`, discriminated by {@link NON_CLOCK_REFUSALS}.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ENGINEERING READINGS THIS MODULE TAKES, EACH DECLARED (surfaced in the S9-1 stage report)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  1. `KYC_REFRESH`'s month arithmetic uses `day_of_month` — "12 months after the last
 *     verification" measured from an ARBITRARY day, which is not the month-end-anchored statutory
 *     window whose two readings `dates/deadline.ts`'s module note names. The anchor is fixed in
 *     the descriptor rather than configurable, and this note is the declaration.
 *  2. `DISTRIBUTE_3M_FYE`'s month anchor IS that open question of law (a fiscal year end is
 *     always a month end), so here it is NOT fixed: the caller must supply it from configuration
 *     (`deadline.DISTRIBUTE_3M_FYE.monthAnchor`, registered + seeded in S9-2), and the compute
 *     refuses without it — the same refusal `computeDeadline` already makes.
 *  3. `LICENSE_RENEWAL` / `CONTRACT_RENEWAL`: the DUE date is the expiry itself (a recorded fact,
 *     roll `none` — an expiry does not move because it lands on a Friday); what this engine
 *     computes is the ACTIONABLE date, `expiry − lead` in business days, which by construction
 *     lands on a business day (§09's `preceding` intent: the obligation is met BEFORE expiry).
 *  4. `KYC_REFRESH`'s computed re-verification date rolls `preceding` (§09's table), so the
 *     renew-by date is never later than the raw anniversary.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE COMPUTE TAKES SETTING ENVELOPES, NOT NUMBERS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `computeRuleDeadline` accepts the PARSED `Setting` envelope (`SettingEnvelope<number>` etc.),
 * not a bare figure, because the envelope carries `unverified` — and binding rule 3 requires that
 * marker to travel from the config row into `ComputedDeadline.unverifiedNote` and onward to every
 * screen. A bare number would launder an unverified figure into a settled-looking date. The
 * caller resolves the row (endowment tier over global, `parseSetting`); this module checks the
 * envelope's KEY-SHAPED expectations (the right key for the rule, nothing extra) and refuses
 * mismatches the way `dates/deadline.ts` refuses a `monthAnchor` on a business-day window.
 */

import { DomainError } from '../errors.js';
import type { SettingEnvelope } from '../settings.js';
import {
  addBusinessDays,
  civilDate,
  computeDeadline,
  dual,
  isBusinessDay,
  type CivilDate,
  type ComputedDeadline,
  type DualDate,
  type HolidayCalendar,
  type MonthAnchor,
  type RollConvention,
} from '../dates/index.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The nine rule keys — §09's table, closed
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * §09 Engine B's rule vocabulary, closed. `schema.prisma`'s `Deadline.ruleKey` documents exactly
 * these nine; a test pins the two lists against each other so they cannot drift apart silently.
 */
export const DEADLINE_RULE_KEYS = [
  'REGISTER_30BD',
  'UPDATE_15BD',
  'ISTIBDAL_10BD',
  'DISTRIBUTE_3M_FYE',
  'KYC_REFRESH',
  'LICENSE_RENEWAL',
  'CONTRACT_RENEWAL',
  'HEARING',
  'RETENTION_10Y',
] as const;

export type DeadlineRuleKey = (typeof DEADLINE_RULE_KEYS)[number];

const DEADLINE_RULE_KEY_SET: ReadonlySet<string> = new Set(DEADLINE_RULE_KEYS);

/** Narrow an untrusted string (a catalogue binding, a database row) to a rule key. */
export function isDeadlineRuleKey(value: unknown): value is DeadlineRuleKey {
  return typeof value === 'string' && DEADLINE_RULE_KEY_SET.has(value);
}

/**
 * What a rule IS — which decides whether and how a due date exists:
 *
 *  - `statutory_clock` — a trigger event starts a window; the due date is trigger + window,
 *    rolled `following` (you FILE after a trigger). The 30/15/10-bd filings and the 3-month
 *    distribution window.
 *  - `pre_expiry_alert` — an expiry (recorded or computed) is the due date; the engine's job is
 *    the renew-BEFORE arithmetic. KYC refresh, licence and contract renewals.
 *  - `as_dated` — the date is entered, not computed (a hearing is when the court says it is);
 *    roll `none`, no window, no Setting.
 *  - `retention_floor` — NOT a due date at all. Refused by the compute; enforced by the
 *    retention policy (`retention.minimumYears` + the `_no_delete` guard family).
 */
export type DeadlineRuleKind =
  'statutory_clock' | 'pre_expiry_alert' | 'as_dated' | 'retention_floor';

/**
 * How a computable rule's window arrives:
 *
 *  - `setting_business_days` — a business-day count from the rule's own `deadline.<KEY>.…` row.
 *  - `setting_months` — a calendar-month count; `DISTRIBUTE_3M_FYE` additionally requires the
 *    configured month anchor (see the module note), `KYC_REFRESH` fixes `day_of_month`.
 *  - `anchor_is_due` — no window: the anchor IS the due date (`HEARING`, and the expiry half of
 *    the licence/contract renewals).
 *  - `none` — the rule computes nothing (`retention_floor`).
 */
export type RuleWindowSource =
  'setting_business_days' | 'setting_months' | 'anchor_is_due' | 'none';

export interface DeadlineRuleDescriptor {
  readonly key: DeadlineRuleKey;
  readonly kind: DeadlineRuleKind;
  readonly windowSource: RuleWindowSource;
  /**
   * The `Setting` key the window figure resolves from, or `null` where no figure exists.
   *
   * ⚠ Four of these are REGISTERED AND SEEDED today; the rest are S9-2's to register (schema key +
   * seeded row move together — `settings.test.ts` enforces the pair). A test here asserts each
   * name's registration status EXPLICITLY, so S9-2's registration flips a pinned expectation
   * rather than silently satisfying a string match.
   */
  readonly windowSettingKey: string | null;
  /** Present only for `setting_months` rules. `null` = must arrive from configuration. */
  readonly monthAnchor: MonthAnchor | null;
  /** The `Setting` key the month anchor resolves from, where it is configuration. */
  readonly monthAnchorSettingKey: string | null;
  /**
   * The `Setting` key for the pre-expiry ACTIONABLE lead (business days), where the rule has one.
   * The lead is QMULATE's own alerting policy (when we start acting), not a statutory figure —
   * the statutory fact is the expiry itself.
   */
  readonly leadSettingKey: string | null;
  /** The statutory roll for the rule's computed date. */
  readonly roll: RollConvention;
  /**
   * §09's "clock starts on" column — documentation of what the ANCHOR means, carried into
   * results so a stored deadline's anchor is self-describing.
   */
  readonly anchorSemantics: string;
  /**
   * §09: zero-tolerance deadlines escalate on a faster ladder and **cannot be dismissed, only
   * resolved**. `GOV-REG-01/02`'s clocks; AML is zero-tolerance too but is not a clock at all.
   */
  readonly zeroTolerance: boolean;
}

/**
 * The descriptor table — §09's rule table, transcribed structurally (windows excluded, by design).
 */
export const DEADLINE_RULES: Readonly<Record<DeadlineRuleKey, DeadlineRuleDescriptor>> =
  Object.freeze({
    REGISTER_30BD: Object.freeze({
      key: 'REGISTER_30BD',
      kind: 'statutory_clock',
      windowSource: 'setting_business_days',
      windowSettingKey: 'deadline.REGISTER_30BD.businessDays',
      monthAnchor: null,
      monthAnchorSettingKey: null,
      leadSettingKey: null,
      roll: 'following',
      anchorSemantics: 'waqf documentation / regulation-effective date (Art. 8(1))',
      zeroTolerance: true,
    }),
    UPDATE_15BD: Object.freeze({
      key: 'UPDATE_15BD',
      kind: 'statutory_clock',
      windowSource: 'setting_business_days',
      windowSettingKey: 'deadline.UPDATE_15BD.businessDays',
      monthAnchor: null,
      monthAnchorSettingKey: null,
      leadSettingKey: null,
      roll: 'following',
      anchorSemantics:
        'certificate-expiry date OR material-change effective date (Art. 8(2); CDE-Q2: the effective date, owner-provisional)',
      zeroTolerance: true,
    }),
    ISTIBDAL_10BD: Object.freeze({
      key: 'ISTIBDAL_10BD',
      kind: 'statutory_clock',
      windowSource: 'setting_business_days',
      windowSettingKey: 'deadline.ISTIBDAL_10BD.businessDays',
      monthAnchor: null,
      monthAnchorSettingKey: null,
      leadSettingKey: null,
      roll: 'following',
      anchorSemantics: 'istibdal COMPLETION date (Art. 12(3))',
      zeroTolerance: false,
    }),
    DISTRIBUTE_3M_FYE: Object.freeze({
      key: 'DISTRIBUTE_3M_FYE',
      kind: 'statutory_clock',
      windowSource: 'setting_months',
      windowSettingKey: 'deadline.DISTRIBUTE_3M_FYE.months',
      // The month anchor is an open question of law (module note, reading 2) — configuration.
      monthAnchor: null,
      monthAnchorSettingKey: 'deadline.DISTRIBUTE_3M_FYE.monthAnchor',
      leadSettingKey: null,
      roll: 'following',
      anchorSemantics:
        'fiscal-year end, where the Shart sets no schedule (Art. 13; §08 B5: a Shart schedule governs instead)',
      zeroTolerance: false,
    }),
    KYC_REFRESH: Object.freeze({
      key: 'KYC_REFRESH',
      kind: 'pre_expiry_alert',
      windowSource: 'setting_months',
      windowSettingKey: 'kyc.refreshIntervalMonths',
      // Fixed, not configurable: an interval from an arbitrary day (module note, reading 1).
      monthAnchor: 'day_of_month',
      monthAnchorSettingKey: null,
      leadSettingKey: null,
      roll: 'preceding',
      anchorSemantics: 'last-verification date (BO Std Art. 6)',
      zeroTolerance: false,
    }),
    LICENSE_RENEWAL: Object.freeze({
      key: 'LICENSE_RENEWAL',
      kind: 'pre_expiry_alert',
      windowSource: 'anchor_is_due',
      windowSettingKey: null,
      monthAnchor: null,
      monthAnchorSettingKey: null,
      leadSettingKey: 'deadline.LICENSE_RENEWAL.preExpiryLeadBd',
      roll: 'none',
      anchorSemantics: 'licence-expiry date (§3-9) — the expiry is a fact and does not roll',
      zeroTolerance: false,
    }),
    CONTRACT_RENEWAL: Object.freeze({
      key: 'CONTRACT_RENEWAL',
      kind: 'pre_expiry_alert',
      windowSource: 'anchor_is_due',
      windowSettingKey: null,
      monthAnchor: null,
      monthAnchorSettingKey: null,
      leadSettingKey: 'deadline.CONTRACT_RENEWAL.preExpiryLeadBd',
      roll: 'none',
      anchorSemantics: 'contract-end date (§3-7) — the end date is a fact and does not roll',
      zeroTolerance: false,
    }),
    HEARING: Object.freeze({
      key: 'HEARING',
      kind: 'as_dated',
      windowSource: 'anchor_is_due',
      windowSettingKey: null,
      monthAnchor: null,
      monthAnchorSettingKey: null,
      leadSettingKey: null,
      roll: 'none',
      anchorSemantics: 'the scheduled court/committee date (§3-8) — entered, never computed',
      zeroTolerance: false,
    }),
    RETENTION_10Y: Object.freeze({
      key: 'RETENTION_10Y',
      kind: 'retention_floor',
      windowSource: 'none',
      windowSettingKey: 'retention.minimumYears',
      monthAnchor: null,
      monthAnchorSettingKey: null,
      leadSettingKey: null,
      roll: 'none',
      anchorSemantics:
        'record creation (Art. 20) — a FLOOR governing deletion, enforced by the retention policy, never a due date',
      zeroTolerance: false,
    }),
  });

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The non-clock refusal vocabulary
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The closed discriminator vocabulary for `DEADLINE_RULE_NOT_A_CLOCK` (`details.refusal`).
 * One code, several bindings — the `SHART_INCOMPLETE` shape.
 */
export const NON_CLOCK_REFUSALS = [
  /** `RETENTION_10Y`: a deletion floor, not a due date (§09 §B, its own words). */
  'RETENTION_FLOOR_NOT_A_CLOCK',
  /**
   * `AML_IMMEDIATE`: a same-day event SLA, not a business-day clock (§09 Engine C, its own
   * words) — and a computed AML date in the general deadline plane would be a G-6 leak.
   */
  'AML_IMMEDIATE_NOT_A_CLOCK',
  /** Any string outside the nine — an unknown binding resolves to nothing, never to something plausible. */
  'RULE_KEY_UNKNOWN',
] as const;

export type NonClockRefusal = (typeof NON_CLOCK_REFUSALS)[number];

function refuseNonClock(refusal: NonClockRefusal, ruleKey: string, reason: string): never {
  throw new DomainError('DEADLINE_RULE_NOT_A_CLOCK', reason, {
    details: { refusal, ruleKey },
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The compute
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The configured figures a rule needs, as PARSED `Setting` envelopes — so `unverified` travels.
 * Supply exactly what the rule's descriptor names; extras are refused (a lead on a hearing means
 * the values were assembled from the wrong rows).
 */
export interface RuleSettingValues {
  /** For `setting_business_days` rules: the `deadline.<KEY>.businessDays` envelope. */
  readonly windowBusinessDays?: SettingEnvelope<number>;
  /** For `setting_months` rules: the months envelope (`deadline.DISTRIBUTE_3M_FYE.months`, `kyc.refreshIntervalMonths`). */
  readonly windowMonths?: SettingEnvelope<number>;
  /** For `DISTRIBUTE_3M_FYE` only: the configured month anchor. */
  readonly monthAnchor?: SettingEnvelope<MonthAnchor>;
  /** For licence/contract renewals: the pre-expiry actionable lead, in business days. */
  readonly preExpiryLeadBd?: SettingEnvelope<number>;
}

export interface ComputeRuleDeadlineInput {
  readonly ruleKey: string;
  /** The rule's anchor per its `anchorSemantics` — a trigger, an expiry, a hearing date. */
  readonly anchor: CivilDate | string;
  readonly calendar: HolidayCalendar;
  readonly settings: RuleSettingValues;
}

/** A computed rule deadline: the due date, and — for pre-expiry rules with a lead — the actionable date. */
export interface ComputedRuleDeadline {
  readonly ruleKey: DeadlineRuleKey;
  readonly kind: DeadlineRuleKind;
  /** §09's "clock starts on" text for the anchor, echoed so a stored row is self-describing. */
  readonly anchorSemantics: string;
  /** The underlying computation, with `unverifiedNote`, provenance and both dual dates. */
  readonly computed: ComputedDeadline;
  /**
   * The renew-by/act-by date for `pre_expiry_alert` rules that carry a lead
   * (`due − lead` business days; a business day by construction), `null` elsewhere.
   */
  readonly actionable: DualDate | null;
  readonly zeroTolerance: boolean;
}

function requireEnvelope<T>(
  ruleKey: DeadlineRuleKey,
  envelope: SettingEnvelope<T> | undefined,
  settingKey: string,
  what: string,
): SettingEnvelope<T> {
  if (envelope === undefined) {
    // The same refusal computeDeadline makes for an absent window, made before assembly so the
    // message can name the rule and the Setting row that should have supplied the figure.
    throw new DomainError(
      'SETTING_MISSING',
      `Rule ${ruleKey} requires ${what} from Setting '${settingKey}', and none was supplied. ` +
        'Regulatory figures are configuration, never hardcoded defaults, so the engine refuses ' +
        'rather than inventing one.',
      { details: { settingKey, ruleKey } },
    );
  }
  return envelope;
}

function refuseExtras(
  ruleKey: DeadlineRuleKey,
  settings: RuleSettingValues,
  allowed: readonly (keyof RuleSettingValues)[],
): void {
  const supplied = (Object.keys(settings) as (keyof RuleSettingValues)[]).filter(
    (key) => settings[key] !== undefined,
  );
  const extras = supplied.filter((key) => !allowed.includes(key));
  if (extras.length > 0) {
    throw new DomainError(
      'SETTING_INVALID',
      `Rule ${ruleKey} does not take ${extras.join(', ')}; their presence means the values were ` +
        'assembled from the wrong Setting rows.',
      { details: { ruleKey, extras } },
    );
  }
}

/**
 * Compute a rule's due date (and actionable date, where the rule has one).
 *
 * Composes `computeDeadline` — every window still refuses when absent, every result still carries
 * the ⚠ unverified note, and the roll is the DESCRIPTOR's, never the caller's: a caller who could
 * pass a roll could file after an expiry by taste.
 *
 * @throws `DEADLINE_RULE_NOT_A_CLOCK` — `RETENTION_10Y`, `AML_IMMEDIATE`, or an unknown key.
 * @throws `SETTING_MISSING` / `SETTING_INVALID` — a required figure is absent or mis-assembled.
 * @throws `CALENDAR_UNAVAILABLE` — the anchor or a computed date leaves calendar coverage.
 */
export function computeRuleDeadline(input: ComputeRuleDeadlineInput): ComputedRuleDeadline {
  const { ruleKey, settings, calendar } = input;

  if (ruleKey === 'AML_IMMEDIATE') {
    refuseNonClock(
      'AML_IMMEDIATE_NOT_A_CLOCK',
      ruleKey,
      'AML_IMMEDIATE is not a deadline rule: §09 Engine C models the AML report as an event ' +
        "obligation whose SLA is same-day ('no statutory countdown'), surfaced on the dashboard, " +
        'not a business-day clock — and a computed AML date in the general deadline plane would ' +
        'itself be a no-tipping-off leak (G-6).',
    );
  }
  if (!isDeadlineRuleKey(ruleKey)) {
    refuseNonClock(
      'RULE_KEY_UNKNOWN',
      ruleKey,
      `'${ruleKey}' is not one of the nine §09 rule keys. An unknown binding resolves to ` +
        'nothing, never to something plausible.',
    );
  }
  const rule = DEADLINE_RULES[ruleKey];
  if (rule.kind === 'retention_floor') {
    refuseNonClock(
      'RETENTION_FLOOR_NOT_A_CLOCK',
      ruleKey,
      'RETENTION_10Y is a minimum record-retention FLOOR governing deletion — §09: "enforced by ' +
        'the retention policy, not the reminder loop". It has no due date to compute; the figure ' +
        `lives in Setting '${String(rule.windowSettingKey)}' and the _no_delete guard family enforces it.`,
    );
  }

  switch (rule.windowSource) {
    case 'setting_business_days': {
      refuseExtras(ruleKey, settings, ['windowBusinessDays']);
      const window = requireEnvelope(
        ruleKey,
        settings.windowBusinessDays,
        rule.windowSettingKey ?? '<unset>',
        'a business-day window',
      );
      const computed = computeDeadline({
        from: input.anchor,
        window: {
          settingKey: rule.windowSettingKey ?? '<unset>',
          businessDays: window.v,
          unverified: window.unverified,
        },
        calendar,
        roll: rule.roll,
      });
      return finish(rule, computed, null);
    }
    case 'setting_months': {
      if (rule.key === 'DISTRIBUTE_3M_FYE') {
        refuseExtras(ruleKey, settings, ['windowMonths', 'monthAnchor']);
      } else {
        refuseExtras(ruleKey, settings, ['windowMonths']);
      }
      const window = requireEnvelope(
        ruleKey,
        settings.windowMonths,
        rule.windowSettingKey ?? '<unset>',
        'a calendar-month window',
      );
      let anchor: MonthAnchor;
      if (rule.monthAnchor !== null) {
        anchor = rule.monthAnchor;
      } else {
        const configured = requireEnvelope(
          ruleKey,
          settings.monthAnchor,
          rule.monthAnchorSettingKey ?? '<unset>',
          "the month anchor ('day_of_month' | 'end_of_month' — a question of law, so it is configuration)",
        );
        anchor = configured.v;
      }
      const computed = computeDeadline({
        from: input.anchor,
        window: {
          settingKey: rule.windowSettingKey ?? '<unset>',
          calendarMonths: window.v,
          monthAnchor: anchor,
          // The date is unverified if EITHER figure is: a verified window read through an
          // unverified anchor is still an unverified date.
          unverified: window.unverified || (settings.monthAnchor?.unverified ?? false),
        },
        calendar,
        roll: rule.roll,
      });
      return finish(rule, computed, null);
    }
    case 'anchor_is_due': {
      if (rule.leadSettingKey !== null) {
        refuseExtras(ruleKey, settings, ['preExpiryLeadBd']);
      } else {
        refuseExtras(ruleKey, settings, []);
      }
      const from = civilDate(input.anchor);
      // Coverage check, same as computeDeadline's own: an as-dated deadline outside the
      // calendar's coverage cannot have its reminders computed either.
      void isBusinessDay(from, calendar);
      const computed = computeDeadline({
        from,
        window: {
          settingKey: `<${rule.key}: anchor is the due date>`,
          calendarDays: 0,
          // The DATE is a recorded fact, not a regulatory figure — nothing to verify.
          unverified: false,
        },
        calendar,
        roll: 'none',
      });
      let actionable: DualDate | null = null;
      if (rule.leadSettingKey !== null) {
        const lead = requireEnvelope(
          ruleKey,
          settings.preExpiryLeadBd,
          rule.leadSettingKey,
          'a pre-expiry actionable lead (business days)',
        );
        if (!Number.isInteger(lead.v) || lead.v < 0) {
          throw new DomainError(
            'SETTING_INVALID',
            `Rule ${ruleKey}'s pre-expiry lead must be a non-negative whole business-day count ` +
              `(received ${String(lead.v)}).`,
            { details: { ruleKey, settingKey: rule.leadSettingKey } },
          );
        }
        actionable = dual(addBusinessDays(from, -lead.v, calendar));
      }
      return finish(rule, computed, actionable);
    }
    case 'none':
    default:
      // Unreachable: retention_floor refused above and the union is closed. Kept so a new
      // windowSource cannot default-allow.
      refuseNonClock('RULE_KEY_UNKNOWN', ruleKey, `unmapped window source for ${ruleKey}`);
  }
}

function finish(
  rule: DeadlineRuleDescriptor,
  computed: ComputedDeadline,
  actionable: DualDate | null,
): ComputedRuleDeadline {
  return Object.freeze({
    ruleKey: rule.key,
    kind: rule.kind,
    anchorSemantics: rule.anchorSemantics,
    computed,
    actionable,
    zeroTolerance: rule.zeroTolerance,
  });
}
