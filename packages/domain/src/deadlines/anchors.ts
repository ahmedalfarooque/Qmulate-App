/**
 * `deadlines/anchors.ts` — §09 Engine B's "CLOCK STARTS ON" COLUMN, TURNED INTO A DECLARATION.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S9-1 gave every rule a window, a basis and a roll. S9-3a made the ANCHOR the caller's stated,
 * audited fact and said so in terms: *"§09's 'clock starts on' facts are not derived here;
 * auto-derivation and the GOV-REG-02 triggers are S9-3c's, where each derivation rule is declared
 * or routed."* This is that file, and it is the whole of that promise: for each of the nine rule
 * keys, either
 *
 *   • a NAMED RECORDED HOME — a model, a date column, and its frozen Hijri twin, with the reading
 *     that makes that column the statutory fact; or
 *   • a ROUTED refusal — the fact has no recorded home (or has one on the wrong model), the
 *     auto-derivation REFUSES BY NAME, and the missing column is an owner-queue item, not a
 *     silently-substituted plausible date.
 *
 * There is no third option, and in particular there is no default. The S9-1 M4 mutation is the
 * standard this module is held to: a `?? something-reasonable` on a statutory input is a defect
 * the suite must kill, because a deadline computed from an invented anchor is indistinguishable —
 * on the screen, in the report, on the filing — from one computed from a fact.
 *
 * ── WHY A DERIVATION NEEDS DECLARING AT ALL ───────────────────────────────────────────────────
 * A due date is only as good as the day it counts from. §09's rule table names each anchor in
 * PROSE ("waqf documentation / regulation-effective date", "istibdal completion date"), and prose
 * does not say which column. Wiring a column that merely SOUNDS right is the failure mode this
 * module exists to make impossible: `Waqf.registrationDate` sounds like `REGISTER_30BD`'s anchor
 * and is in fact the completion of the very act the window governs, and `Vendor.licenseExpiry` is
 * the only expiry in the schema within reach of `LICENSE_RENEWAL` and belongs to a subcontractor
 * on a table whose own doc comment says "GLOBAL — deliberately NOT waqf-scoped". Both are refused
 * here by name, so a future "helpful" wiring is a caught mistake rather than a quiet one.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE MEASURED MAP (read out of `schema.prisma` column-by-column, 2026-08-27; re-measured 2026-09-02
 * after S11-1 / migration 48 landed the owner's ruling of 2026-08-31, commit 9f3d8fd)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * DERIVED (seven arms across six rules):
 *  - `REGISTER_30BD` — ⊕ S11-1. `Waqf.registrationAnchorDate` + `registrationAnchorDateHijri`, with
 *    `registrationAnchorKind` (WAQF_DOCUMENTATION_DATE | REGULATION_EFFECTIVE_DATE) as the DECLARED
 *    KIND that travels with the date. RECORDED OPERATOR INPUT — the owner's own words: *"the stating
 *    dates for now should be an input field that i can put"* and *"make a drop down if that
 *    helps"*. This arm is the ONE that names a `kindField`: a candidate carrying the date without
 *    its kind is REFUSED (`ANCHOR_KIND_ABSENT`) even though the database CHECK already makes that
 *    row unreachable — the domain does not trust the caller. ⚠ `Waqf.registrationDate` is STILL not
 *    the anchor (see the routed history below, kept because the reasoning is the safeguard).
 *  - `ISTIBDAL_10BD` — ⊕ S11-1. `Expropriation.istibdalCompletedDate` + `istibdalCompletedDateHijri`,
 *    subject `expropriation` (a new subject — the anchor is a fact about THAT taking's substitution,
 *    not about the endowment). Recorded operator input, one kind, no kind column. ⚠ It lives on
 *    `Expropriation` because that is the only home the schema has for an istibdal; whether VOLUNTARY
 *    istibdal is in Phase-1 scope is UNASKED (memo, S10 addendum second batch) and not decided here.
 *  - `UPDATE_15BD` — TWO arms, and §09's rule table gives both: `Waqf.certificateExpiry` +
 *    `certificateExpiryHijri` (the certificate arm), and the MATERIAL-CHANGE arm's own
 *    `MaterialChange.effectiveDate` + `effectiveDateHijri` (CDE-Q2, owner-provisional: the clock
 *    runs from the EFFECTIVE date — a late discovery does not extend the deadline).
 *  - `DISTRIBUTE_3M_FYE` — `Waqf.fiscalYearEnd`, ⚠ an `MM-DD` STRING, so a dated anchor needs a
 *    stated reading; see {@link FISCAL_YEAR_END_READING}.
 *  - `KYC_REFRESH` — `Beneficiary.kycLastRefreshed` + `kycLastRefreshedHijri`, per beneficiary.
 *  - `CONTRACT_RENEWAL` — `Lease.endDate` + `endDateHijri`, per lease.
 *  - `HEARING` — `LegalCase.nextHearing` + `nextHearingHijri`, per case. §09's "entered, never
 *    computed" is about the DATE not being computed; reading it off the row it was entered on is
 *    exactly that.
 *
 * ROUTED (ONE since S11-1 — it was three; the two that cleared are recorded below because the
 * reasoning that routed them is exactly what keeps their new columns from being mis-wired):
 *  - `LICENSE_RENEWAL` → `ANCHOR_HOME_IS_WRONG_SCOPE`, deliberately its own discriminator. The
 *    only `licenseExpiry` in all 42 models is `Vendor.licenseExpiry`: a P-01..P-06
 *    SUBCONTRACTOR's licence, on a GLOBAL table that is not waqf-scoped, where §09 §3-9 / BR-608
 *    means the ENDOWMENT's licence or permit. A global row cannot anchor an endowment-scoped
 *    statutory deadline. The remedy is a MODEL, not a column — which is exactly why this is not
 *    collapsed into the no-home case. ⚠ The owner's own enumeration of the endowment's licences and
 *    permits exists (`docs/domain/licences-and-permits.md`, 2026-08-31); the MODEL is owed. So G-5's
 *    anchor bound is NARROWED by S11-1, not cleared.
 *
 * ROUTED HISTORY (cleared by migration 48 — kept as the safeguard against re-wiring):
 *  - `REGISTER_30BD` was `ANCHOR_HAS_NO_RECORDED_HOME`. `Waqf.registrationDate` exists but is the
 *    registration ITSELF (fixture values 1980-03-11 … 2015-09-10), and §09's anchor is the "waqf
 *    documentation / regulation-effective date". Counting a 30-business-day window from the
 *    completion of the act the window governs is vacuously met or decades overdue depending which
 *    way it is read, and neither is a deadline. The column now carries a doc comment saying so
 *    (the owed item is closed); the anchor is a DIFFERENT column, entered by a human.
 *  - `ISTIBDAL_10BD` was `ANCHOR_HAS_NO_RECORDED_HOME`. `Expropriation.announcedDate` is the
 *    taking's ANNOUNCEMENT and `authorityNotifiedDate` the duty's DISCHARGE (the output, not the
 *    anchor — deriving from it would make every notification exactly on time); `istibdalStatus` is
 *    a bare STRING. The completion date is now its own column, entered by a human, never derived
 *    from any of those three.
 *
 * NOT A CLOCK (one): `RETENTION_10Y`, already refused upstream by
 * `computeRuleDeadline`/`NON_CLOCK_REFUSALS`. Named here too so the anchor table is total over
 * the nine keys — a rule missing from this table is a build defect, asserted, not a `undefined`.
 */

import { DomainError } from '../errors.js';
import { civilDate, type CivilDate } from '../dates/index.js';

import { DEADLINE_RULE_KEYS, isDeadlineRuleKey, type DeadlineRuleKey } from './rules.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The routing refusal vocabulary — closed
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The closed discriminator vocabulary for `DEADLINE_ANCHOR_NOT_DERIVABLE` (`details.refusal`) —
 * the one-code-many-conditions shape `SHART_INCOMPLETE` and `DEADLINE_RULE_NOT_A_CLOCK` use, for
 * the same reason: one user-facing meaning ("we could not establish the day this clock starts, so
 * no date was computed"), several distinguishable causes, each with a DIFFERENT remedy.
 */
export const ANCHOR_ROUTING_REFUSALS = [
  /**
   * No column anywhere records the statutory fact. The remedy is a COLUMN (and a decision about
   * what it means): `REGISTER_30BD`'s documentation/regulation-effective date, `ISTIBDAL_10BD`'s
   * completion date.
   */
  'ANCHOR_HAS_NO_RECORDED_HOME',
  /**
   * A column of the right NAME exists, on the wrong SUBJECT — `Vendor.licenseExpiry` is a
   * subcontractor's licence on a table that is deliberately not waqf-scoped, where the rule means
   * the endowment's own licence. The remedy is a MODEL, not a column, and reading the wrong one
   * would produce a confident date about the wrong legal person.
   */
  'ANCHOR_HOME_IS_WRONG_SCOPE',
  /**
   * The home exists and this subject's value is NULL. Not a defect and not a route — a fact
   * nobody has recorded yet. ⚠ Deliberately NOT satisfiable by a substitute: a NULL
   * `kycLastRefreshed` is `KYC_NEVER_VERIFIED`'s condition, and treating "today" as the last
   * verification date would compute a statutory date from a fact nobody attested.
   */
  'ANCHOR_SOURCE_VALUE_ABSENT',
  /**
   * ⊕ S11-1. The home exists, the date is present, and the DECLARED KIND that must travel with it
   * is missing — `REGISTER_30BD`'s "which date is this" (`Waqf.registrationAnchorKind`). The owner
   * ruled that a bare date is not the record (2026-08-31: *"make a drop down if that helps"*), and
   * CHECK `waqf_registration_anchor_kind_pairs_with_date` makes the row unreachable — this refusal
   * exists because the domain does not trust the caller to have read the row through the schema.
   * Refusing here is what keeps a kind from ever being INFERRED from whether the date happens to
   * precede the regulation.
   */
  'ANCHOR_KIND_ABSENT',
  /**
   * The rule has no anchor to derive because it is not a clock (`RETENTION_10Y` — a deletion
   * floor). Mirrors `RETENTION_FLOOR_NOT_A_CLOCK` at the anchor layer so a caller that reaches
   * here first still gets a refusal that names the reason.
   */
  'ANCHOR_RULE_NOT_A_CLOCK',
  /** A rule key outside the nine — resolves to nothing, never to something plausible. */
  'ANCHOR_RULE_KEY_UNKNOWN',
] as const;

export type AnchorRoutingRefusal = (typeof ANCHOR_ROUTING_REFUSALS)[number];

function refuseAnchor(
  refusal: AnchorRoutingRefusal,
  ruleKey: string,
  reason: string,
  extra: Readonly<Record<string, unknown>> = {},
): never {
  throw new DomainError('DEADLINE_ANCHOR_NOT_DERIVABLE', reason, {
    details: { refusal, ruleKey, ...extra },
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The declaration table
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Which SUBJECT ROW carries the anchor — a deadline's anchor is not always a fact about the
 * endowment. Named rather than inferred so a caller cannot hand a beneficiary's date to a
 * waqf-level rule and have it counted.
 */
export type AnchorSubject =
  | 'waqf'
  | 'material_change'
  | 'beneficiary'
  | 'lease'
  | 'legal_case'
  /** ⊕ S11-1 — `Expropriation`, the only home the schema has for an istibdal. */
  | 'expropriation';

/** A named recorded home for a rule's anchor: the model, the column, and its frozen Hijri twin. */
export interface AnchorSource {
  readonly subject: AnchorSubject;
  /** The Prisma model the fact is recorded on. */
  readonly model: string;
  /** The Gregorian date column. */
  readonly dateField: string;
  /** Its frozen Hijri twin (§09: both representations, frozen at write). */
  readonly hijriField: string;
  /**
   * ⊕ S11-1 — the column recording WHICH date this is, where §09 names more than one fact for the
   * same clock and the owner ruled the kind must travel with the date (`REGISTER_30BD`'s
   * "documentation / regulation-effective date"). `null` where the anchor has one kind only. When
   * non-null, `deriveAnchor` REFUSES a candidate whose `declaredKind` is null (`ANCHOR_KIND_ABSENT`).
   */
  readonly kindField: string | null;
  /** §09's own prose for what this date IS. */
  readonly semantics: string;
  /**
   * A DECLARED READING where the column does not hand over a date directly — the one case is
   * `Waqf.fiscalYearEnd`, an `MM-DD` string. `null` where the column IS the date.
   *
   * ⚠ Where this is non-null the reading is engineering's and is declared as such: it is not a
   * ruling, and it must never be silently swapped for another.
   */
  readonly reading: string | null;
}

/** Why a rule's anchor cannot be derived, with the remedy named. */
export interface AnchorRouting {
  readonly refusal: Extract<
    AnchorRoutingRefusal,
    'ANCHOR_HAS_NO_RECORDED_HOME' | 'ANCHOR_HOME_IS_WRONG_SCOPE' | 'ANCHOR_RULE_NOT_A_CLOCK'
  >;
  /** What was looked at and rejected — so the next reader does not re-discover it. */
  readonly examined: readonly string[];
  /** The remedy, in one line: a column, a model, or nothing (a non-clock). */
  readonly remedy: string;
  /**
   * `true` where this is an OPEN OWNER-QUEUE ITEM (a fact the product must decide how to record),
   * `false` where the route is settled (a non-clock has no anchor and never will).
   */
  readonly ownerQueueItem: boolean;
}

export interface AnchorDeclaration {
  readonly key: DeadlineRuleKey;
  /**
   * `derived` — at least one named recorded home; `routed` — none usable, refuses by name;
   * `not_a_clock` — no anchor exists to derive.
   */
  readonly mode: 'derived' | 'routed' | 'not_a_clock';
  /** One entry per arm. `UPDATE_15BD` has two; every other derived rule has one; routed rules none. */
  readonly sources: readonly AnchorSource[];
  readonly routing: AnchorRouting | null;
}

/**
 * The declared reading that turns `Waqf.fiscalYearEnd` (an `MM-DD` string, `"12-31"` on every
 * seeded endowment) into a dated anchor.
 *
 * ⚠ ENGINEERING'S READING, DECLARED — not a ruling. Two things could be meant by "the fiscal-year
 * end" when a distribution window is being computed on some reference day, and they differ by a
 * year: the year end that has ALREADY PASSED (whose income is now distributable) or the NEXT one
 * (not yet reached, nothing to distribute). Only the first can be a clock that has started, so
 * the reading is: **the most recently ENDED fiscal-year end at or before the reference date**. A
 * reference date that IS the fiscal-year end anchors on that day, not on the previous year.
 *
 * This is exported as a constant, and pinned by a test, so that changing the reading is an edit to
 * a named declaration rather than an adjustment to an expression buried in a date walk.
 */
export const FISCAL_YEAR_END_READING =
  'the most recently ENDED fiscal-year end at or before the reference date (inclusive) — the ' +
  'only reading under which the clock has started; declared engineering reading, not a ruling';

/**
 * §09's "clock starts on" column, declared for all nine keys. Total by construction: a test
 * asserts the key set equals `DEADLINE_RULE_KEYS`, so a tenth rule cannot arrive without a
 * declaration and a rule cannot lose one.
 */
export const ANCHOR_DECLARATIONS: Readonly<Record<DeadlineRuleKey, AnchorDeclaration>> =
  Object.freeze({
    REGISTER_30BD: Object.freeze({
      key: 'REGISTER_30BD',
      mode: 'derived',
      // ⊕ S11-1 (migration 48; owner ruling 2026-08-31, commit 9f3d8fd). RECORDED OPERATOR INPUT with
      // a DECLARED KIND. ⚠ NOT `Waqf.registrationDate` — that is the registration ITSELF, and
      // counting 30 business days from the completion of the governed act is vacuously met or
      // decades overdue. The routed history in the header records why.
      sources: Object.freeze([
        Object.freeze({
          subject: 'waqf' as const,
          model: 'Waqf',
          dateField: 'registrationAnchorDate',
          hijriField: 'registrationAnchorDateHijri',
          kindField: 'registrationAnchorKind',
          semantics:
            'waqf documentation / regulation-effective date (Art. 8(1)) — WHICH of the two is the recorded kind (WAQF_DOCUMENTATION_DATE | REGULATION_EFFECTIVE_DATE), entered by the operator, never inferred; which one GOVERNS is unverified vs primary law (binding rule 3)',
          reading: null,
        }),
      ]),
      routing: null,
    }),
    UPDATE_15BD: Object.freeze({
      key: 'UPDATE_15BD',
      mode: 'derived',
      // §09's rule table gives this rule TWO anchors ("certificate-expiry date **or**
      // material-change effective date"), and they are not alternatives to choose between by
      // taste: they are two different triggers of the same duty, each with its own recorded home.
      sources: Object.freeze([
        Object.freeze({
          subject: 'waqf' as const,
          model: 'Waqf',
          dateField: 'certificateExpiry',
          hijriField: 'certificateExpiryHijri',
          semantics: 'certificate-expiry date (Art. 8(2)) — the certificate arm of the 15-bd duty',
          kindField: null,
          reading: null,
        }),
        Object.freeze({
          subject: 'material_change' as const,
          model: 'MaterialChange',
          dateField: 'effectiveDate',
          hijriField: 'effectiveDateHijri',
          semantics:
            'material-change EFFECTIVE date (Art. 8(2); CDE-Q2, owner-provisional 2026-08-25: the clock runs from the effective date — a late discovery does not extend the deadline, a missed window is reported)',
          kindField: null,
          reading: null,
        }),
      ]),
      routing: null,
    }),
    ISTIBDAL_10BD: Object.freeze({
      key: 'ISTIBDAL_10BD',
      mode: 'derived',
      // ⊕ S11-1 (migration 48; owner ruling 2026-08-31, commit 9f3d8fd). RECORDED OPERATOR INPUT on
      // the taking's row. ⚠ NOT `announcedDate` (the taking's announcement), NOT
      // `authorityNotifiedDate` (the duty's DISCHARGE — every notification would be exactly on time),
      // NOT the replacement asset's acquisition. ⚠ The subject is `expropriation` because that is the
      // ONLY home the schema has for an istibdal; whether VOLUNTARY istibdal is in Phase-1 scope is
      // UNASKED (memo, S10 addendum second batch) and is not decided by this arm.
      sources: Object.freeze([
        Object.freeze({
          subject: 'expropriation' as const,
          model: 'Expropriation',
          dateField: 'istibdalCompletedDate',
          hijriField: 'istibdalCompletedDateHijri',
          kindField: null,
          semantics:
            'istibdal COMPLETION date (Art. 12(3)) — per expropriation record, entered by the operator; the 10-business-day figure is unverified vs primary law (binding rule 3)',
          reading: null,
        }),
      ]),
      routing: null,
    }),
    DISTRIBUTE_3M_FYE: Object.freeze({
      key: 'DISTRIBUTE_3M_FYE',
      mode: 'derived',
      sources: Object.freeze([
        Object.freeze({
          subject: 'waqf' as const,
          model: 'Waqf',
          dateField: 'fiscalYearEnd',
          // The column is an `MM-DD` string with no Hijri twin — the twin is DERIVED from the
          // resolved Gregorian date at write time, like every other frozen pair.
          hijriField: '<derived at write from the resolved date>',
          semantics:
            'fiscal-year end, where the Shart sets no schedule (Art. 13; §08 B5: a Shart schedule governs instead)',
          kindField: null,
          reading: FISCAL_YEAR_END_READING,
        }),
      ]),
      routing: null,
    }),
    KYC_REFRESH: Object.freeze({
      key: 'KYC_REFRESH',
      mode: 'derived',
      sources: Object.freeze([
        Object.freeze({
          subject: 'beneficiary' as const,
          model: 'Beneficiary',
          dateField: 'kycLastRefreshed',
          hijriField: 'kycLastRefreshedHijri',
          semantics:
            "last-verification date (BO Std Art. 6) — per beneficiary, never per endowment: the refresh clock is a fact about a person's file",
          kindField: null,
          reading: null,
        }),
      ]),
      routing: null,
    }),
    LICENSE_RENEWAL: Object.freeze({
      key: 'LICENSE_RENEWAL',
      mode: 'routed',
      sources: Object.freeze([]),
      routing: Object.freeze({
        refusal: 'ANCHOR_HOME_IS_WRONG_SCOPE',
        examined: Object.freeze([
          'Vendor.licenseExpiry — the ONLY licence expiry in the schema, and it is a P-01..P-06 SUBCONTRACTOR\'s licence on a table whose own doc comment reads "GLOBAL — deliberately NOT waqf-scoped"; §3-9 / BR-608 means the ENDOWMENT\'s licence or permit, and a global row cannot anchor an endowment-scoped statutory deadline',
          "Beneficiary.disbursingEntity.licenceExpiry (fixture Json) — a CHARITY's licence, the ENTITY_UNLICENSED gate's subject, about a payee rather than about the endowment",
          'Document.retentionUntil — a retention floor, not an expiry of a permission',
        ]),
        remedy:
          "a MODEL for the endowment's own licences/permits (waqf-scoped, with number, issuer, expiry + Hijri twin) — not a column on an existing table, which is why this refusal is distinct from the no-home case",
        ownerQueueItem: true,
      }),
    }),
    CONTRACT_RENEWAL: Object.freeze({
      key: 'CONTRACT_RENEWAL',
      mode: 'derived',
      sources: Object.freeze([
        Object.freeze({
          subject: 'lease' as const,
          model: 'Lease',
          dateField: 'endDate',
          hijriField: 'endDateHijri',
          semantics:
            'contract/agreement end date (§3-7) — per lease; the end date is a recorded fact and does not roll',
          kindField: null,
          reading: null,
        }),
      ]),
      routing: null,
    }),
    HEARING: Object.freeze({
      key: 'HEARING',
      mode: 'derived',
      sources: Object.freeze([
        Object.freeze({
          subject: 'legal_case' as const,
          model: 'LegalCase',
          dateField: 'nextHearing',
          hijriField: 'nextHearingHijri',
          semantics:
            'the scheduled court/committee date (§3-8) — §09\'s "entered, never computed" is about the DATE not being computed; reading it off the case row somebody entered it on is exactly that',
          kindField: null,
          reading: null,
        }),
      ]),
      routing: null,
    }),
    RETENTION_10Y: Object.freeze({
      key: 'RETENTION_10Y',
      mode: 'not_a_clock',
      sources: Object.freeze([]),
      routing: Object.freeze({
        refusal: 'ANCHOR_RULE_NOT_A_CLOCK',
        examined: Object.freeze([
          'Document.retentionUntil + retentionUntilHijri — the FLOOR itself, already computed and enforced by the retention policy and the `_no_delete` guard family, not an anchor for a due date',
        ]),
        remedy:
          'none — §09: a retention floor is "enforced by the retention policy, not the reminder loop". There is no anchor to find; this is a settled route, not an owner-queue item.',
        ownerQueueItem: false,
      }),
    }),
  });

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · Derivation — the only way a stored anchor gets to skip a human stating it
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** A subject row's candidate anchor, as read out of the database by the caller. */
export interface AnchorCandidate {
  readonly subject: AnchorSubject;
  /** The recorded Gregorian value, or `null` where the subject's column is NULL. */
  readonly date: Date | CivilDate | string | null;
  /** The recorded frozen Hijri twin, or `null` — asserted present whenever `date` is. */
  readonly hijri: string | null;
  /**
   * ⊕ S11-1 — the recorded KIND read off the home's `kindField`, or `null` where the home has none
   * (or the column is NULL). REQUIRED, not optional: every reader of a home must say whether it read
   * a kind, so that "the caller forgot" and "the row has no kind" are never the same value.
   */
  readonly declaredKind: string | null;
  /** Which row it came from, for the audit context (never PII — an id). */
  readonly sourceId: string;
}

/** A derived anchor: the date, its frozen twin, and the declaration that authorised reading it. */
export interface DerivedAnchor {
  readonly ruleKey: DeadlineRuleKey;
  readonly anchor: CivilDate;
  readonly anchorHijri: string;
  /** The declared kind where the arm names a `kindField`; `null` for single-kind anchors. */
  readonly anchorKind: string | null;
  readonly source: AnchorSource;
  readonly sourceId: string;
}

/**
 * Look up a rule's declaration. Refuses an unknown key rather than returning `undefined` — a
 * caller that gets `undefined` writes `?? somethingReasonable`, which is the exact defect this
 * module exists to prevent.
 *
 * @throws `DEADLINE_ANCHOR_NOT_DERIVABLE` (`ANCHOR_RULE_KEY_UNKNOWN`).
 */
export function anchorDeclarationFor(ruleKey: string): AnchorDeclaration {
  if (!isDeadlineRuleKey(ruleKey)) {
    refuseAnchor(
      'ANCHOR_RULE_KEY_UNKNOWN',
      ruleKey,
      `'${ruleKey}' is not one of the nine §09 rule keys, so it has no declared anchor. An ` +
        'unknown binding resolves to nothing, never to something plausible.',
    );
  }
  return ANCHOR_DECLARATIONS[ruleKey];
}

/**
 * Derive a rule's anchor from a candidate the caller read out of the declared home — or REFUSE by
 * name, with the remedy in the message.
 *
 * The candidate's `subject` must match one of the rule's declared arms: that check is what stops
 * a lease's end date being counted as a certificate expiry because both are "a date on a row
 * related to the endowment".
 *
 * @throws `DEADLINE_ANCHOR_NOT_DERIVABLE` — routed rule, wrong subject, or an absent value.
 */
export function deriveAnchor(ruleKey: string, candidate: AnchorCandidate): DerivedAnchor {
  const declaration = anchorDeclarationFor(ruleKey);

  if (declaration.routing !== null) {
    const { routing } = declaration;
    refuseAnchor(
      routing.refusal,
      declaration.key,
      `${declaration.key}'s anchor cannot be auto-derived: ${routing.remedy}. Examined and ` +
        `rejected: ${routing.examined.join(' · ')}. The engine refuses rather than counting from ` +
        'a date that merely sounds right — a due date computed from an invented anchor is ' +
        'indistinguishable from a real one on every screen it appears on.',
      {
        remedy: routing.remedy,
        examined: routing.examined,
        ownerQueueItem: routing.ownerQueueItem,
      },
    );
  }

  const source = declaration.sources.find((arm) => arm.subject === candidate.subject);
  if (source === undefined) {
    const declared = declaration.sources.map((arm) => `${arm.model}.${arm.dateField}`).join(' | ');
    throw new DomainError(
      'DEADLINE_ANCHOR_NOT_DERIVABLE',
      `${declaration.key}'s anchor was offered from subject '${candidate.subject}', which is not ` +
        `one of its declared homes (${declared}). A date on some row related to the endowment is ` +
        "not thereby this rule's statutory anchor.",
      {
        details: {
          refusal: 'ANCHOR_HAS_NO_RECORDED_HOME' satisfies AnchorRoutingRefusal,
          ruleKey: declaration.key,
          offeredSubject: candidate.subject,
          declaredSubjects: declaration.sources.map((arm) => arm.subject),
        },
      },
    );
  }

  if (candidate.date === null) {
    refuseAnchor(
      'ANCHOR_SOURCE_VALUE_ABSENT',
      declaration.key,
      `${declaration.key}'s anchor is recorded on ${source.model}.${source.dateField}, and this ` +
        "row's value is NULL — a fact nobody has recorded yet. No substitute is used: counting " +
        "from today, or from the row's creation, would compute a statutory date from something " +
        'never attested.',
      { model: source.model, dateField: source.dateField, sourceId: candidate.sourceId },
    );
  }
  if (candidate.hijri === null) {
    // The dual pair is the §09 freeze contract; half a pair is a corrupt record, not a
    // convenience to paper over by re-converting here (a re-conversion under a later library
    // adjustment is exactly what the freeze exists to prevent).
    throw new DomainError(
      'DEADLINE_ANCHOR_NOT_DERIVABLE',
      `${declaration.key}'s anchor on ${source.model} carries a Gregorian date with no frozen ` +
        `Hijri twin (${source.hijriField} is NULL). §09 freezes both representations together; ` +
        "re-deriving the missing half here would substitute today's conversion tables for the " +
        'ones in force when the fact was recorded.',
      {
        details: {
          refusal: 'ANCHOR_SOURCE_VALUE_ABSENT' satisfies AnchorRoutingRefusal,
          ruleKey: declaration.key,
          model: source.model,
          hijriField: source.hijriField,
          sourceId: candidate.sourceId,
        },
      },
    );
  }

  // ⊕ S11-1 — where the arm names a kind column, the kind is part of the fact. A date without its
  // kind is the bare date the owner ruled against, and inferring the kind from whether the date
  // precedes the regulation is exactly the guess this module exists to refuse.
  if (source.kindField !== null && candidate.declaredKind === null) {
    refuseAnchor(
      'ANCHOR_KIND_ABSENT',
      declaration.key,
      `${declaration.key}'s anchor on ${source.model}.${source.dateField} carries a date whose ` +
        `declared kind (${source.kindField}) is NULL. The owner ruled the kind travels with the ` +
        'date; a bare date is not the record, and which kind it is must never be inferred.',
      {
        model: source.model,
        dateField: source.dateField,
        kindField: source.kindField,
        sourceId: candidate.sourceId,
      },
    );
  }

  return Object.freeze({
    ruleKey: declaration.key,
    anchor: civilDate(candidate.date instanceof Date ? isoDay(candidate.date) : candidate.date),
    anchorHijri: candidate.hijri,
    anchorKind: source.kindField === null ? null : candidate.declaredKind,
    source,
    sourceId: candidate.sourceId,
  });
}

/** A `Date` narrowed to its UTC calendar day — the same convention the dual-date columns store. */
function isoDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The one declared reading: fiscal-year end
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Resolve `Waqf.fiscalYearEnd` (`MM-DD`) to the dated anchor {@link FISCAL_YEAR_END_READING}
 * names, relative to a STATED reference date.
 *
 * `reference` is a parameter and never a clock read — the S9-1 discipline: the same endowment
 * asked on two days must be allowed to give two answers, and a function that reads the clock
 * cannot be pinned by a test vector.
 *
 * @throws `DATE_INVALID` — `fiscalYearEnd` is not an `MM-DD` day that exists.
 */
export function resolveFiscalYearEndAnchor(
  fiscalYearEnd: string,
  reference: CivilDate | string,
): CivilDate {
  const match = /^(\d{2})-(\d{2})$/.exec(fiscalYearEnd);
  if (match === null) {
    throw new DomainError(
      'DATE_INVALID',
      `Waqf.fiscalYearEnd '${fiscalYearEnd}' is not an MM-DD day. The column is a recurring ` +
        'month-and-day, not a date, and it cannot be guessed at.',
      { details: { fiscalYearEnd } },
    );
  }
  const [, month, day] = match as unknown as [string, string, string];
  const ref = civilDate(reference);
  const refYear = Number(String(ref).slice(0, 4));

  // The candidate in the reference year; if it has not been reached yet, the most recently ENDED
  // one is the year before. `civilDate` refuses a day that does not exist (e.g. 02-30), so an
  // impossible fiscalYearEnd fails here rather than silently rolling into March.
  const thisYear = civilDate(`${String(refYear).padStart(4, '0')}-${month}-${day}`);
  if (String(thisYear) <= String(ref)) return thisYear;
  return civilDate(`${String(refYear - 1).padStart(4, '0')}-${month}-${day}`);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · Totality — asserted here, not merely tested
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The rules whose anchors auto-derive, and the rules that route — derived FROM the declaration
 * table rather than restated, so the two can never disagree. Exported for the stage report and
 * the tests, which is also why nothing recomputes them by hand.
 */
export const ANCHOR_DERIVED_RULE_KEYS: readonly DeadlineRuleKey[] = DEADLINE_RULE_KEYS.filter(
  (key) => ANCHOR_DECLARATIONS[key].mode === 'derived',
);

export const ANCHOR_ROUTED_RULE_KEYS: readonly DeadlineRuleKey[] = DEADLINE_RULE_KEYS.filter(
  (key) => ANCHOR_DECLARATIONS[key].mode === 'routed',
);

/**
 * The open OWNER-QUEUE items this module carries — the routed anchors whose remedy is a product
 * decision, not a refactor. Read by the stage report; asserted non-empty so that "we derived
 * everything" can never be claimed while a route stands.
 */
export const ANCHOR_OWNER_QUEUE_ITEMS: readonly { key: DeadlineRuleKey; remedy: string }[] =
  DEADLINE_RULE_KEYS.filter((key) => ANCHOR_DECLARATIONS[key].routing?.ownerQueueItem === true).map(
    (key) => ({
      key,
      // Non-null by the filter above.
      remedy: (ANCHOR_DECLARATIONS[key].routing as AnchorRouting).remedy,
    }),
  );

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · ⊕ S11-1 — Provenance frozen INTO the row, and the correction CHAIN it makes findable
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The owner made the clock-start dates plain, CORRECTABLE operator input (9f3d8fd). The stored
 * `Deadline` they produce is FROZEN (migration 38: identity columns refuse UPDATE; `recomputedFromId`
 * is UNIQUE, so the correction lineage is a CHAIN, not a tree). A correction therefore INSERTs a new
 * row chained from the CURRENT HEAD — and finding that head needs to know which SOURCE a row was
 * computed from: `Deadline` has no source-id column and no unique on `(waqfId, ruleKey)`, so two
 * `ISTIBDAL_10BD` rows for one endowment (two takings) legitimately coexist.
 *
 * The provenance is written INTO `windowSnapshot` (JSONB, refused NULL at INSERT and frozen against
 * UPDATE by migration 38 — frozen for free). ⚠ THE COST, DECLARED: an identifier inside JSONB has NO
 * index, NO foreign key and NO unique constraint. "One head per source" is enforced by
 * {@link selectAnchorChainHead} — CODE, not the database — and a soft-deleted expropriation leaves a
 * reference nothing checks. A real `anchorSourceId` column is DECLARED OWED to whichever stage next
 * touches migration 38's frozen-identity guard. This is (b) over (a), not (b) equal to (a).
 *
 * Pure, like everything else in this module: rows arrive as parameters, the decision is a function.
 */

/** WHERE a stored deadline's anchor was read from — the shape frozen into `windowSnapshot.anchorSource`. */
export interface AnchorProvenance {
  readonly subject: AnchorSubject;
  /** The row the anchor was read off (an id, never PII): the waqf id for waqf-subject arms. */
  readonly sourceId: string;
  /** The declared kind where the arm names a `kindField` (`REGISTER_30BD`), else `null`. */
  readonly kind: string | null;
}

const ANCHOR_SUBJECT_SET: ReadonlySet<string> = new Set<AnchorSubject>([
  'waqf',
  'material_change',
  'beneficiary',
  'lease',
  'legal_case',
  'expropriation',
]);

/**
 * Read the provenance out of a stored `windowSnapshot`, or `null` where the row names no declared
 * home (the coalescing path records its governing cause in its own audit event instead) — or where
 * the shape is not the one this module writes. STRICT on purpose: a snapshot whose `anchorSource`
 * is half-formed is not provenance, and a partial read here would let a malformed row claim a chain.
 */
export function anchorProvenanceOf(snapshot: unknown): AnchorProvenance | null {
  if (typeof snapshot !== 'object' || snapshot === null) return null;
  const raw = (snapshot as Record<string, unknown>)['anchorSource'];
  if (typeof raw !== 'object' || raw === null) return null;
  const { subject, sourceId, kind } = raw as Record<string, unknown>;
  if (typeof subject !== 'string' || !ANCHOR_SUBJECT_SET.has(subject)) return null;
  if (typeof sourceId !== 'string' || sourceId === '') return null;
  if (kind !== null && typeof kind !== 'string') return null;
  return Object.freeze({ subject: subject as AnchorSubject, sourceId, kind });
}

/** Closed discriminators for `DEADLINE_STATE_INCOHERENT` raised from the chain selector. */
export const ANCHOR_CHAIN_REFUSALS = [
  /**
   * Two or more live rows for ONE source, neither superseding the other. `UNIQUE("recomputedFromId")`
   * makes this unreachable through the correction path; reaching it means a row was inserted around
   * that path, and the selector refuses rather than picking the newest — picking would silently
   * bless whichever row won a race.
   */
  'ANCHOR_CHAIN_MULTIPLE_HEADS',
] as const;

export type AnchorChainRefusal = (typeof ANCHOR_CHAIN_REFUSALS)[number];

/** One stored deadline row, as the caller read it for this rule on this endowment. */
export interface AnchorChainCandidate {
  readonly id: string;
  /** {@link anchorProvenanceOf} of the row's snapshot — `null` where the row names no declared home. */
  readonly provenance: AnchorProvenance | null;
  /** The id of the row that superseded this one (`recomputedTo`), or `null` — i.e. this row is a HEAD. */
  readonly supersededById: string | null;
}

/**
 * The CURRENT HEAD of the correction chain for one source — the live row a correction must chain
 * from — or `null` where no live row names this source.
 *
 * Rows with no provenance are NOT this source's: for the two S11-1 rules none exist (both were
 * routed until migration 48), and for every other rule provenance is either present or the row was
 * written by the coalescing path, which has its own head logic.
 *
 * @throws `DEADLINE_STATE_INCOHERENT` (`ANCHOR_CHAIN_MULTIPLE_HEADS`) — see the vocabulary.
 */
export function selectAnchorChainHead(
  ruleKey: string,
  sourceId: string,
  candidates: readonly AnchorChainCandidate[],
): string | null {
  const heads = candidates.filter(
    (row) =>
      row.provenance !== null &&
      row.provenance.sourceId === sourceId &&
      row.supersededById === null,
  );
  if (heads.length > 1) {
    throw new DomainError(
      'DEADLINE_STATE_INCOHERENT',
      `${ruleKey} has ${String(heads.length)} live deadline rows for source '${sourceId}' and ` +
        'none of them supersedes the others. The correction lineage is a CHAIN (migration 38: ' +
        '`recomputedFromId` is UNIQUE), so a second head means a row was inserted around the ' +
        'correction path. Refusing rather than choosing the newest: choosing would bless whichever ' +
        'row won a race.',
      {
        details: {
          refusal: 'ANCHOR_CHAIN_MULTIPLE_HEADS' satisfies AnchorChainRefusal,
          ruleKey,
          sourceId,
          headIds: heads.map((row) => row.id),
        },
      },
    );
  }
  const head = heads[0];
  return head === undefined ? null : head.id;
}
