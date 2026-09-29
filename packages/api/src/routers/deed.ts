/**
 * `deed` — the TrusteeshipDeed (BR-105) and the Nazir/representative eligibility gate (BR-109/NFR-09).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RULES LIVE IN `@qmulate/domain`. THIS FILE IS TRANSPORT.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §17's E3 line is "an eligibility resolver in `packages/domain` (pure)", and there is exactly ONE
 * implementation of the seven criteria: `resolveNazirEligibility`, imported below. Nothing in this
 * file decides whether a candidate is eligible — it hands the flags in and refuses on the verdict.
 *
 * That is not tidiness. `deed.upsert` and `deed.verifyEligibility` MUST give identical answers, and
 * the only way to guarantee that is for both to call the same function: a "dry run" that reimplemented
 * the rules would drift, and it would drift in the direction of the screen looking healthier than the
 * mutation, which is the worst available direction.
 *
 * ── THE E3 EXIT CLAUSE THIS FILE IS HALF OF ───────────────────────────────────────────────────
 * "An ineligible Nazir (non-resident) is blocked with a clear reason." The other halves are the pure
 * resolver's own suite and the ar+en Playwright spec. What THIS layer owes is narrower and precise:
 * **refused BEFORE ANY WRITE.** "Refused" and "refused before any write" are different claims, so the
 * resolver runs before `auditedWrite` is even opened — no transaction, no rolled-back audit event, no
 * partially-updated deed.
 *
 * ── THE TWO CONDITIONAL CRITERIA ARE EVALUATED AGAINST `context`, NEVER ASSUMED ────────────────
 * `saudiNationalWhereRequired` binds only when the endower is foreign AND real property is held;
 * `authorityLicensed` only when the Nazir is a legal person. So the caller supplies the CONTEXT and
 * the resolver decides which criteria are required — a procedure that decided requiredness itself
 * would be a second copy of the rule.
 *
 * ⚠ A REQUIRED CRITERION ARRIVING AS `null` IS A REFUSAL (`ELIGIBILITY_NOT_ASSESSED`), NEVER A PASS.
 * `null` means "nobody has checked yet", and BR-109 says capture AND VERIFY. That distinction is the
 * resolver's, and it is why the flags cross this boundary as `boolean | null` rather than as
 * `boolean` with a default.
 *
 * ── WHAT IS SURFACED AND NOT DECIDED ──────────────────────────────────────────────────────────
 * ⚠ Every figure and rule here is UNVERIFIED against primary Saudi law (Binding rule 3): the
 * Beneficial Ownership Standards Art. 8(1) residency rule, Nazarah Art. 11(5)'s joint-and-several
 * liability, and WHICH of the seven criteria bind a REPRESENTATIVE at all. S4 implements the
 * FAIL-SAFE — `repKsaResident: false` blocks, and `jointlyLiable: false` beside a recorded
 * representative is refused — pending the answer.
 *
 * TODO(surface): which of the seven eligibility criteria bind an AUTHORIZED REPRESENTATIVE, and does
 * representative non-residency BLOCK or merely FLAG? S4 blocks (the fail-safe direction).
 * TODO(surface): BR-105 says "Authorized Representative(s)" — PLURAL — and `TrusteeshipDeed` models
 * exactly ONE. Is a second delegated manager a real case, and is the second one also jointly and
 * severally liable? A `TrusteeshipRepresentative` child table is a schema change nobody has
 * authorised, so S4 keeps one.
 */

import { z } from 'zod';

import { recordEvent } from '@qmulate/database';
import { DomainError } from '@qmulate/domain';
import { toHijriSnapshot } from '@qmulate/domain/dates';
// ⚠ THE SUBPATH, matching `./dates` and `./distribution` — the established convention for a folder
// module in `@qmulate/domain`. Nothing in this file re-implements a criterion or an applicability rule:
// `resolveDeedEligibility` decides, `assertDeedEligible` refuses, and both are the SAME functions the
// dry-run query calls, which is what makes `deed.upsert` and `deed.verifyEligibility` incapable of
// disagreeing.
import {
  ELIGIBILITY_CRITERIA,
  assertDeedEligible,
  resolveDeedEligibility,
  type DeedEligibility,
  type EligibilityFlags,
  type EligibilityVerdict,
} from '@qmulate/domain/eligibility';

import { toActorContext } from '../context.js';
import { auditedWrite } from '../middleware/audit-projection.js';
import type { PermissionString } from '../permissions.js';
import { endowmentScopedProcedure, makerProcedure, router } from '../trpc.js';

/**
 * The permission that gates READING a trusteeship-deed fact — `deed.get`'s rung-2 argument.
 *
 * ⚠ SPELLED ONCE AND SHARED, for the reason `ENDOWMENT_RECORD_READ` is (V-E3-03). `endowment.get`
 * carries a THREE-FIELD SUMMARY of this deed, and G7-V2 measured it handing that summary to a seat
 * `deed.get` refuses. It now asks {@link resolveScope} with THIS constant before disclosing any of
 * it, so the summary and the record it summarises are gated by the same string and cannot drift.
 */
export const DEED_RECORD_READ = 'endowment:deed:read' satisfies PermissionString;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Inputs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const hijriSnapshot = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'a Hijri snapshot is a frozen yyyy-MM-dd string');

/**
 * The primary Nazir's six criteria.
 *
 * ⚠ **NULLABLE BUT NOT OPTIONAL — every key must be PRESENT.** That is the domain contract's own rule
 * (`eligibilityFlagsSchema`) and it is load-bearing in both directions:
 *  · a MISSING key does not parse — "the caller forgot to send residency" is a shape error;
 *  · a `null` key parses and REFUSES with `ELIGIBILITY_NOT_ASSESSED` — "the caller says residency has
 *    not been checked yet" is a legitimate, recordable state, and BR-109 says capture AND VERIFY.
 * Collapsing those two is how an unchecked criterion becomes a granted seat. There is no `.default()`
 * anywhere here: a default would be code answering a question about a person's legal standing.
 */
const eligibilityFlagsInput = z.object({
  islam: z.boolean().nullable(),
  legalCapacity: z.boolean().nullable(),
  noDisqualifyingRemoval: z.boolean().nullable(),
  /** ⚠ unverified — confirm against primary law (BO Standards Art. 8(1)). */
  ksaResident: z.boolean().nullable(),
  /** ⚠ unverified — binds only when the endower is foreign AND real property is held. */
  saudiNationalWhereRequired: z.boolean().nullable(),
  /** ⚠ unverified — binds only when the Nazir is a legal person. */
  authorityLicensed: z.boolean().nullable(),
});

/**
 * The representative's own criteria (BR-109's "Nazir AND authorized-representative").
 *
 * ⚠ Before S4 this model carried ONE set of flags, for the primary Nazir only — so a non-resident
 * authorized representative, jointly and severally liable under Nazarah Art. 11(5), passed unchecked.
 * `null` for the whole OBJECT means no representative is recorded, which is what the database CHECK
 * ties the four columns to; `null` for a FIELD means "recorded, not yet assessed", which the
 * one-directional CHECK deliberately keeps representable.
 */
const repEligibilityFlagsInput = z.object({
  repIslam: z.boolean().nullable(),
  repLegalCapacity: z.boolean().nullable(),
  repNoDisqualifyingRemoval: z.boolean().nullable(),
  /** ⚠ unverified. Fail-safe: `false` BLOCKS. */
  repKsaResident: z.boolean().nullable(),
});

/**
 * The facts that decide WHICH criteria are required. Supplied, never inferred.
 *
 * Inferring `holdsRealProperty` from the asset register would look helpful and would silently change
 * an eligibility verdict when an asset was added — a criterion that switches on data nobody reviewed.
 */
const eligibilityContextInput = z.object({
  endowerIsForeign: z.boolean(),
  holdsRealProperty: z.boolean(),
  nazirIsLegalPerson: z.boolean(),
});

const authorizedRepInput = z.object({
  name: z.string().min(1).max(256),
  scope: z.string().min(1).max(1024),
  appointedDate: z.string().datetime(),
  appointedDateHijri: hijriSnapshot,
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Wire shape ↔ domain vocabulary
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The wire's camelCase flags → the domain's `EligibilityFlags` (SCREAMING_SNAKE, exhaustive).
 *
 * ⚠ TWO VOCABULARIES ON PURPOSE, AND THE MAPPING IS ONE FUNCTION. `EligibilityFlags` is an EXHAUSTIVE
 * `Record<EligibilityCriterion, boolean | null>`, so a criterion added to the domain vocabulary becomes
 * a COMPILE ERROR right here — which is the property that stops a caller passing five facts while the
 * rule needs six. The wire keeps the column-shaped camelCase names (`ksaResident`, `repKsaResident`)
 * because they are what `TrusteeshipDeed` and the screens use; translating in one place is a transport
 * concern, and duplicating the vocabulary would not be.
 */
function toDomainFlags(input: {
  readonly islam: boolean | null;
  readonly legalCapacity: boolean | null;
  readonly noDisqualifyingRemoval: boolean | null;
  readonly ksaResident: boolean | null;
  readonly saudiNationalWhereRequired: boolean | null;
  readonly authorityLicensed: boolean | null;
}): EligibilityFlags {
  return {
    ISLAM: input.islam,
    LEGAL_CAPACITY: input.legalCapacity,
    NO_DISQUALIFYING_REMOVAL: input.noDisqualifyingRemoval,
    KSA_RESIDENCY: input.ksaResident,
    SAUDI_NATIONALITY_WHERE_REQUIRED: input.saudiNationalWhereRequired,
    AUTHORITY_LICENSED: input.authorityLicensed,
  };
}

/**
 * A representative's four recorded facts → `EligibilityFlags`.
 *
 * ⚠ THE TWO CONDITIONAL CRITERIA ARE `null`, AND `null` IS THE HONEST VALUE. `TrusteeshipDeed` carries
 * NO column for a representative's nationality or licence, so the recorded fact genuinely is "not
 * assessed". The resolver reports them `UNDECIDED_SURFACED` for this subject — never `REQUIRED` (which
 * would make every such seat permanently unfillable) and never `NOT_APPLICABLE` (which would be code
 * answering a question for counsel).
 */
function repFlagsToDomain(input: {
  /** `null` = the column is unset, i.e. NOT ASSESSED. It refuses; it never passes. */
  readonly repIslam: boolean | null;
  readonly repLegalCapacity: boolean | null;
  readonly repNoDisqualifyingRemoval: boolean | null;
  readonly repKsaResident: boolean | null;
}): EligibilityFlags {
  return toDomainFlags({
    islam: input.repIslam,
    legalCapacity: input.repLegalCapacity,
    noDisqualifyingRemoval: input.repNoDisqualifyingRemoval,
    ksaResident: input.repKsaResident,
    saudiNationalWhereRequired: null,
    authorityLicensed: null,
  });
}

interface WireVerdict {
  readonly subject: string;
  readonly eligible: boolean;
  readonly reasons: readonly string[];
  readonly notAssessed: readonly string[];
  readonly criteria: readonly {
    readonly key: string;
    readonly required: boolean;
    /** ⚠ `UNDECIDED_SURFACED` is kept, not collapsed into `required: false`. See below. */
    readonly applicability: string;
    readonly satisfied: boolean | null;
    readonly reasonCode: string | null;
    readonly unverified: true;
  }[];
  /** Developer-facing surfaced questions. NEVER user copy. */
  readonly surfacedQuestions: readonly string[];
  /** ⚠ Binding rule 3 — travels with the verdict so the caveat cannot be dropped in transit. */
  readonly unverifiedNotes: readonly string[];
}

/**
 * The pure resolver's verdict, projected for transport.
 *
 * ⚠ `applicability` TRAVELS ALONGSIDE `required`, and dropping it would be a silent answer to a live
 * legal question. `UNDECIDED_SURFACED` — "we do not know whether this criterion binds a representative"
 * — is not the same fact as `NOT_APPLICABLE`, and a wire shape carrying only a boolean `required` makes
 * the two indistinguishable to every screen and every reader of a persisted verdict.
 *
 * ⚠ `unverified: true` travels with EVERY criterion. Each rests on a rule that has NOT been confirmed
 * against primary Saudi law (Binding rule 3), so a UI cannot render a criterion without the ⚠ marker in
 * hand — the same discipline the `Setting` envelope enforces for a numeric threshold.
 */
function toWireVerdict(verdict: EligibilityVerdict): WireVerdict {
  return {
    subject: verdict.subject,
    eligible: verdict.eligible,
    // MACHINE CODES, never sentences. `errors.domain.NAZIR_INELIGIBLE` is the single user-facing
    // wording for a refusal; a reason code is a diagnostic. Nothing here invents legal copy.
    reasons: [...verdict.reasons],
    notAssessed: [...verdict.notAssessed],
    criteria: verdict.criteria.map((outcome) => ({
      key: outcome.criterion,
      required: outcome.applicability === 'REQUIRED',
      applicability: outcome.applicability,
      satisfied: outcome.satisfied,
      reasonCode: outcome.reasonCode,
      unverified: true as const,
    })),
    surfacedQuestions: [...verdict.surfacedQuestions],
    unverifiedNotes: [...verdict.unverifiedNotes],
  };
}

/**
 * ⚠ A BUILD-TIME SELF-CHECK, RUN AT IMPORT. {@link toDomainFlags} is the one place the wire's six
 * camelCase names meet the domain's six criteria, and a silent divergence there would send a `null` for
 * a criterion the caller actually answered. The exhaustive `Record` type catches an ADDED criterion; this
 * catches a REMOVED or RENAMED one, which the type alone would not.
 */
{
  const probe = toDomainFlags({
    islam: true,
    legalCapacity: true,
    noDisqualifyingRemoval: true,
    ksaResident: true,
    saudiNationalWhereRequired: true,
    authorityLicensed: true,
  });
  for (const criterion of ELIGIBILITY_CRITERIA) {
    if (probe[criterion] !== true) {
      throw new Error(
        `deed router: the wire→domain eligibility flag mapping does not cover ${criterion}. A ` +
          `criterion the mapping misses would arrive at the resolver as "not assessed" for every ` +
          `caller, and BR-109 eligibility would then refuse every seat for a reason nobody caused.`,
      );
    }
  }
}

/** ⚠ unverified — Nazarah Art. 11(5). Reported as a reason code, not as a sentence. */
const REP_JOINT_LIABILITY_REQUIRED = 'REP_JOINT_LIABILITY_REQUIRED' as const;

/**
 * Narrows one of the four UNCONDITIONAL flags to a `boolean` for the NOT NULL column behind it.
 *
 * ⚠ UNREACHABLE AFTER `assertDeedEligible`, AND WRITTEN AS A THROW RATHER THAN A CAST FOR THAT EXACT
 * REASON. The four unconditional criteria are always `REQUIRED`, so a `null` among them has already
 * refused with `ELIGIBILITY_NOT_ASSESSED`. But `TrusteeshipDeed.islam` and its three siblings are NOT
 * NULL columns, and a `!` or an `as boolean` here would put a `null` into the database the day the
 * resolver's applicability rules changed — a silent write of "not assessed" as "false" into the record
 * that decides whether a Nazir may be seated. Failing loudly is the only safe direction.
 */
function requireAssessed(value: boolean | null, criterion: string): boolean {
  if (value === null) {
    throw new DomainError(
      'NAZIR_INELIGIBLE',
      `${criterion} reached the write path unassessed. The eligibility resolver should have refused ` +
        `first (ELIGIBILITY_NOT_ASSESSED) — this is a BUILD error in the guard order, and it DENIES ` +
        `rather than writing "not assessed" into a NOT NULL column as if it were "false".`,
      { details: { criterion, reasons: ['ELIGIBILITY_NOT_ASSESSED'] } },
    );
  }
  return value;
}

/**
 * `NAZIR_INELIGIBLE` for a refusal the PURE RESOLVER does not own.
 *
 * ⚠ USED FOR EXACTLY TWO THINGS, AND NEITHER IS AN ELIGIBILITY CRITERION: the deed's two sides
 * disagreeing about whether a representative is recorded, and Art. 11(5)'s joint-liability rule. Every
 * criterion refusal goes through `assertDeedEligible`, so there is no second implementation of the
 * seven — a reason code that appeared only here would be one the dry-run query could never report.
 *
 * A `DomainError`, so the single user-facing sentence lives at `errors.domain.NAZIR_INELIGIBLE` and the
 * status is `BAD_REQUEST` (`DOMAIN_ERROR_CODE_TO_TRPC_STATUS`). `details.reasons` is the machine list.
 */
function deedRefused(
  waqfId: string,
  subject: 'representative' | 'deed',
  reasons: readonly string[],
): DomainError {
  return new DomainError(
    'NAZIR_INELIGIBLE',
    `the ${subject} half of the trusteeship deed on waqf ${waqfId} is refused BEFORE any write: ` +
      `${reasons.join(', ')}. Eligibility is a DATA CONSTRAINT, not UI copy (BR-109/NFR-09) — a deed ` +
      `may not be recorded and then corrected. ⚠ unverified — confirm against primary Saudi law.`,
    { details: { waqfId, subject, reasons: [...reasons], unverified: true } },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2b · AV5-02 · THE DEED'S OWN FACTS vs QMULATE'S ASSESSMENT OF THE APPOINTEE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ── THE REGRESSION THIS SECTION CLOSES, AS MEASURED ───────────────────────────────────────────
 * Migration 17 (owner-decision memo Q10 — *"the trusteeship deed can only be editted by a court
 * judge"*) sealed the WHOLE `trusteeship_deed` row, on the stated ground that no column on it is not
 * part of the appointment. That was wrong about thirteen columns, and it killed this procedure's
 * UPDATE branch outright. MEASURED through `appRouter.createCaller` on a migrated + seeded database
 * at migration 17, as `user-nazir-001` (NAZIR, `endowment:deed:write` on all five endowments),
 * restating every deed fact byte-for-byte and supplying the representative's four BR-109 criteria as
 * the assessment being recorded:
 *
 *     code    : INTERNAL_SERVER_ERROR
 *     after   : eligibilityVerifiedAt = null
 *
 * …with the BR-109 verification event unrecorded on ALL FIVE seeded appointments and — because this
 * is the only procedure that writes it — no path to record it. BR-109/NFR-09 says capture **AND
 * VERIFY**, and `TrusteeshipDeed`'s own schema comment states the intake reality: *"Partial
 * assessment is legal; intake learns these one at a time."* Learning one at a time is an UPDATE.
 *
 * ── THE LINE, AND ⚠ IT IS ENGINEERING'S READING OF THE OWNER'S SENTENCE ───────────────────────
 * The ruling is about the DEED: who holds the nazarah, when, the delegate and the joint-and-several
 * liability position, the successor. An eligibility VERIFICATION is not deed content — it is
 * QMULATE's assessment OF the appointee at a point in time, and QMULATE owes it to the Authority.
 * So the deed's facts stay sealed for every seat and the assessment gets a path.
 *
 * TODO(surface): the split between "deed fact" and "our assessment of the appointee" is
 * ENGINEERING'S, exactly like migration 17's rendering of "edited by a court judge" as "recorded as a
 * superseding instrument" (which stands, flagged, untouched). Both are reported for the owner to
 * confirm or overrule. If he rules the criteria are part of the appointment, the answer is NOT to
 * re-seal them and leave BR-109 unrecordable — it is to move the verification into its own
 * append-only row.
 *
 * ── WHY THERE IS NO SEPARATE `deed.recordEligibilityVerification` PROCEDURE ───────────────────
 * It was designed and withdrawn, for a reason worth recording. A narrow procedure taking ONLY the
 * assessment must refuse when no appointment exists yet, and this package has no error code for "the
 * record you are verifying is not there": `NO_GRANT` would misreport an authorization refusal into a
 * ten-year audit trail, and a NEW `ApiErrorCode` requires `errors.access.<CODE>` in BOTH catalogues —
 * i.e. inventing Arabic user-facing copy, which is E10/E12's to write and never a code change's. So
 * the verification travels on `upsert`, whose CREATE branch already answers the missing-appointment
 * case. E4 may split it once that copy exists; the assessment object and its write are already
 * assembled in one place below, so the split is local.
 */

/**
 * The thirteen columns migration 18 classifies as QMULATE's ASSESSMENT OF THE APPOINTEE — the six
 * BR-109/NFR-09 criteria about the primary Nazir, the four about the authorized representative, and
 * the three-column verification event.
 *
 * ⚠ THE DATABASE OWNS THIS LIST; THIS IS THE API'S COPY, AND THE TWO ARE ASSERTED EQUAL.
 * `qmulate_trusteeship_deed_assessment_columns()` is what the guard actually consults, and
 * `test/deed-eligibility-verification.integration.test.ts` reads that function and compares it to
 * this array. A copy nobody compares is how a column changes class without anyone deciding it should.
 */
export const DEED_ELIGIBILITY_ASSESSMENT_COLUMNS = [
  'islam',
  'legalCapacity',
  'noDisqualifyingRemoval',
  'ksaResident',
  'saudiNationalWhereRequired',
  'authorityLicensed',
  'repIslam',
  'repLegalCapacity',
  'repNoDisqualifyingRemoval',
  'repKsaResident',
  'eligibilityVerifiedAt',
  'eligibilityVerifiedAtHijri',
  'eligibilityVerifiedBy',
] as const satisfies readonly string[];

/**
 * The deed FACTS this procedure can be asked to change, and therefore the ones it must refuse.
 *
 * ⚠ NOT THE WHOLE SEALED SET, AND THE DIFFERENCE IS DELIBERATE. The database seals every column that
 * is not on the assessment allow-list — including `id`, `waqfId`, `createdAt`, `createdBy` and
 * `deletedAt`, none of which this procedure's input can express. These nine are the intersection of
 * "sealed" with "the caller can send it", which is exactly the set an api-level refusal can be about.
 * The database remains the backstop for everything else, and for raw SQL.
 */
const DEED_FACT_COLUMNS = [
  'primaryNazir',
  'primaryAppointedDate',
  'primaryAppointedDateHijri',
  'authorizedRepName',
  'authorizedRepScope',
  'authorizedRepAppointedDate',
  'authorizedRepAppointedDateHijri',
  'jointlyLiable',
  'successorNazir',
] as const satisfies readonly string[];

/** The recorded appointment, as the write path needs to see it before deciding anything. */
interface RecordedDeedFacts {
  readonly id: string;
  readonly primaryNazir: string;
  readonly primaryAppointedDate: Date;
  readonly primaryAppointedDateHijri: string;
  readonly authorizedRepName: string | null;
  readonly authorizedRepScope: string | null;
  readonly authorizedRepAppointedDate: Date | null;
  readonly authorizedRepAppointedDateHijri: string | null;
  readonly jointlyLiable: boolean;
  readonly successorNazir: string | null;
}

const DEED_FACT_SELECT = {
  id: true,
  primaryNazir: true,
  primaryAppointedDate: true,
  primaryAppointedDateHijri: true,
  authorizedRepName: true,
  authorizedRepScope: true,
  authorizedRepAppointedDate: true,
  authorizedRepAppointedDateHijri: true,
  jointlyLiable: true,
  successorNazir: true,
} as const;

/** The submitted appointment, in the wire's own shape. Derived from the zod schema, never restated. */
type DeedFactInput = {
  readonly primaryNazir: string;
  readonly primaryAppointedDate: string;
  readonly primaryAppointedDateHijri: string;
  readonly authorizedRep: {
    readonly name: string;
    readonly scope: string;
    readonly appointedDate: string;
    readonly appointedDateHijri: string;
  } | null;
  readonly jointlyLiable: boolean;
  readonly successorNazir: string | null;
};

/**
 * WHICH DEED FACTS THE SUBMISSION WOULD CHANGE — column names only, never values.
 *
 * ⚠ INSTANTS ARE COMPARED AS INSTANTS. The wire carries an ISO-8601 string and the column holds a
 * `timestamp`, so `'2025-02-01T00:00:00.000Z'` and `'2025-02-01T00:00:00Z'` are the SAME appointment
 * date written two ways. A string comparison would call that an edit and refuse a caller who changed
 * nothing — and the refusal it produces is a CONFLICT naming a superseding court instrument, which is
 * the last thing to raise spuriously.
 */
function deedFactDifferences(recorded: RecordedDeedFacts, input: DeedFactInput): string[] {
  const sameInstant = (stored: Date | null, supplied: string | null): boolean => {
    if (stored === null || supplied === null) return stored === null && supplied === null;
    const submitted = new Date(supplied).getTime();
    // An unparseable date is not "unchanged". `z.string().datetime()` has already refused those, so
    // this is the belt-and-braces direction: NaN compares false and the column is reported changed.
    return Number.isFinite(submitted) && stored.getTime() === submitted;
  };

  const changed: string[] = [];
  if (recorded.primaryNazir !== input.primaryNazir) changed.push('primaryNazir');
  if (!sameInstant(recorded.primaryAppointedDate, input.primaryAppointedDate)) {
    changed.push('primaryAppointedDate');
  }
  if (recorded.primaryAppointedDateHijri !== input.primaryAppointedDateHijri) {
    changed.push('primaryAppointedDateHijri');
  }
  if (recorded.authorizedRepName !== (input.authorizedRep?.name ?? null)) {
    changed.push('authorizedRepName');
  }
  if (recorded.authorizedRepScope !== (input.authorizedRep?.scope ?? null)) {
    changed.push('authorizedRepScope');
  }
  if (
    !sameInstant(recorded.authorizedRepAppointedDate, input.authorizedRep?.appointedDate ?? null)
  ) {
    changed.push('authorizedRepAppointedDate');
  }
  if (
    recorded.authorizedRepAppointedDateHijri !== (input.authorizedRep?.appointedDateHijri ?? null)
  ) {
    changed.push('authorizedRepAppointedDateHijri');
  }
  if (recorded.jointlyLiable !== input.jointlyLiable) changed.push('jointlyLiable');
  if (recorded.successorNazir !== input.successorNazir) changed.push('successorNazir');

  // A build-time-ish self-check: every reported column is a declared deed fact. A typo here would
  // report a column the seal does not name, in a refusal that cites the owner's ruling.
  for (const column of changed) {
    if (!(DEED_FACT_COLUMNS as readonly string[]).includes(column)) {
      throw new Error(
        `deed router: "${column}" was reported as a changed deed fact but is not in ` +
          `DEED_FACT_COLUMNS. A refusal citing the owner's Q10 ruling must name a column that ` +
          `ruling is actually about.`,
      );
    }
  }
  return changed;
}

/**
 * `DEED_TERM_WRITE_ONCE` — the recorded appointment's own facts may not be edited, by any seat.
 *
 * ⚠ THE USER-FACING SENTENCE IS THE EXISTING `errors.domain.DEED_TERM_WRITE_ONCE` AND NO NEW COPY IS
 * INVENTED. That sentence — *"…has already been recorded and cannot be changed. A correction is
 * recorded as a superseding instrument — a new record — never as an edit to this one."* — is the
 * remedy the owner's ruling names, rendered as `CONFLICT` (`DOMAIN_ERROR_CODE_TO_TRPC_STATUS`): the
 * request is well-formed and the state of the record refuses it. It was written for the *founder's*
 * deed terms, so it says "condition of the deed" where a trusteeship appointment would say
 * "appointment". TODO(surface): dedicated ar/en copy for a trusteeship-appointment refusal is owed to
 * E10/E12 — a code change may not author product-approved legal wording, so the closest APPROVED
 * sentence ships and the precise diagnostic travels in `details`.
 *
 * ⚠ COLUMN NAMES ONLY, NEVER VALUES — the same rule the database guard follows. This row carries a
 * named individual and the BR-109 criteria (religion, capacity, removal history, residency).
 */
function deedFactsSealed(waqfId: string, changed: readonly string[]): DomainError {
  return new DomainError(
    'DEED_TERM_WRITE_ONCE',
    `trusteeship deed on waqf ${waqfId}: a recorded appointment is WRITE-ONCE FOR EVERY SEAT — ` +
      `column(s) ${changed.join(', ')} may not be edited. THE OWNER'S RULING (2026-08-17, S4 ` +
      `owner-decision memo Q10): "the trusteeship deed can only be editted by a court judge." The ` +
      `remedy is a NEW SUPERSEDING RECORD carrying the court instrument as evidence, never an edit ` +
      `— and ⚠ THAT REMEDY IS NOT REACHABLE IN THIS SCHEMA (\`waqfId\` is unique; there is no ` +
      `supersession link and no column naming the instrument), which is owed to E4. What IS ` +
      `recordable on an existing appointment is the BR-109/NFR-09 ELIGIBILITY VERIFICATION: submit ` +
      `every deed fact unchanged and this procedure writes the assessment and stamps the event. ` +
      `⚠ The rendering of the ruling as "supersede, never edit", and the line between a deed FACT ` +
      `and QMULATE's ASSESSMENT of the appointee, are both ENGINEERING'S and flagged for the owner.`,
    {
      details: {
        waqfId,
        changed: [...changed],
        // Machine facts a screen can act on without parsing prose.
        remedy: 'SUPERSEDING_RECORD',
        remedyReachable: false,
        ruling: 'S4-owner-decision-memo-Q10',
        assessmentIsWritable: [...DEED_ELIGIBILITY_ASSESSMENT_COLUMNS],
      },
    },
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The router
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const DEED_SELECT = {
  id: true,
  primaryNazir: true,
  primaryAppointedDate: true,
  primaryAppointedDateHijri: true,
  authorizedRepName: true,
  authorizedRepScope: true,
  authorizedRepAppointedDate: true,
  authorizedRepAppointedDateHijri: true,
  jointlyLiable: true,
  successorNazir: true,
  islam: true,
  legalCapacity: true,
  noDisqualifyingRemoval: true,
  ksaResident: true,
  saudiNationalWhereRequired: true,
  authorityLicensed: true,
  repIslam: true,
  repLegalCapacity: true,
  repNoDisqualifyingRemoval: true,
  repKsaResident: true,
  eligibilityVerifiedAt: true,
  eligibilityVerifiedAtHijri: true,
  eligibilityVerifiedBy: true,
} as const;

export const deedRouter = router({
  /**
   * The appointment, the delegated scope, and the eligibility verdict as it stands on the record.
   *
   * ⚠ THE VERDICT IS RECOMPUTED FROM THE STORED FLAGS ON EVERY READ, never stored. An "eligible"
   * column would be a cached verdict that keeps reading `true` after a criterion is corrected — the
   * same class of defect the register's PROHIBITION names for a cached exclusion verdict.
   *
   * The stored `context` for the two conditional criteria is not on the model, so this read reports
   * them as required only when the stored flag itself is non-null. That is a NARROWER claim than
   * `verifyEligibility`'s (which is given the context), and the difference is stated rather than
   * hidden: `deed.get` answers "what does the record say", `deed.verifyEligibility` answers "what
   * would happen if I submitted this".
   */
  get: endowmentScopedProcedure(DEED_RECORD_READ).query(async ({ ctx }) => {
    const deed = await ctx.db.trusteeshipDeed.findFirst({
      where: { waqfId: ctx.waqfId },
      select: DEED_SELECT,
    });
    if (deed === null) return null;

    // ⚠ THE CONTEXT IS DERIVED FROM THE RECORD, AND THE LIMIT IS STATED RATHER THAN HIDDEN.
    // `TrusteeshipDeed` stores the two conditional FLAGS but not the CONTEXT that made them bind, so a
    // stored non-null conditional flag is the only evidence available that somebody judged the criterion
    // to apply. `deed.get` therefore answers "what does the record say"; `deed.verifyEligibility`, which
    // is GIVEN the context, answers "what would happen if I submitted this". The difference is real and
    // is why both procedures exist.
    const assessed: DeedEligibility = resolveDeedEligibility({
      primary: toDomainFlags({
        islam: deed.islam,
        legalCapacity: deed.legalCapacity,
        noDisqualifyingRemoval: deed.noDisqualifyingRemoval,
        ksaResident: deed.ksaResident,
        saudiNationalWhereRequired: deed.saudiNationalWhereRequired,
        authorityLicensed: deed.authorityLicensed,
      }),
      // `null` means NO REPRESENTATIVE IS RECORDED — never "one is recorded and we did not check". The
      // database CHECK keeps the two states distinguishable and so does this call.
      representative:
        deed.authorizedRepName === null
          ? null
          : repFlagsToDomain({
              // The four columns migration 12 added, PASSED THROUGH UNTOUCHED. A `null` column reaches
              // the resolver as `null` and refuses with `ELIGIBILITY_NOT_ASSESSED` — never as a pass.
              // "Recorded representative, criterion not yet assessed" is a legal state (the database
              // CHECK is one-directional on purpose) and it must stay distinguishable from `false`.
              repIslam: deed.repIslam,
              repLegalCapacity: deed.repLegalCapacity,
              repNoDisqualifyingRemoval: deed.repNoDisqualifyingRemoval,
              repKsaResident: deed.repKsaResident,
            }),
      context: {
        endowerIsForeign: deed.saudiNationalWhereRequired !== null,
        holdsRealProperty: deed.saudiNationalWhereRequired !== null,
        nazirIsLegalPerson: deed.authorityLicensed !== null,
      },
    });
    const primary = assessed.primary;
    const representative = assessed.representative;

    return {
      id: deed.id,
      primaryNazir: deed.primaryNazir,
      primaryAppointedDate: deed.primaryAppointedDate.toISOString(),
      primaryAppointedDateHijri: deed.primaryAppointedDateHijri,
      authorizedRep:
        deed.authorizedRepName === null
          ? null
          : {
              name: deed.authorizedRepName,
              scope: deed.authorizedRepScope,
              appointedDate: deed.authorizedRepAppointedDate?.toISOString() ?? null,
              appointedDateHijri: deed.authorizedRepAppointedDateHijri,
            },
      jointlyLiable: deed.jointlyLiable,
      successorNazir: deed.successorNazir,
      eligibility: {
        primary: toWireVerdict(primary),
        representative: representative === null ? null : toWireVerdict(representative),
        // ⚠ FLAGS WITH NO VERIFICATION EVENT RECORD A CLAIM, NOT A VERIFICATION — which is what
        // shipped before S4. A deed may not be treated as eligibility-verified while these are null.
        verifiedAt: deed.eligibilityVerifiedAt?.toISOString() ?? null,
        verifiedAtHijri: deed.eligibilityVerifiedAtHijri,
        verifiedBy: deed.eligibilityVerifiedBy,
      },
    };
  }),

  /**
   * THE DRY RUN. Same resolver, no write — so the screen can show WHY before submitting.
   *
   * A query, deliberately: it changes nothing, and making it a mutation would put an
   * "eligibility check" in the audit trail as though a decision had been taken.
   */
  verifyEligibility: endowmentScopedProcedure(DEED_RECORD_READ)
    .input(
      z.object({
        flags: eligibilityFlagsInput,
        repFlags: repEligibilityFlagsInput.nullable(),
        context: eligibilityContextInput,
      }),
    )
    .query(({ input }) => {
      // THE SAME CALL `upsert` MAKES. One implementation, so the screen cannot look healthier than the
      // mutation — which is the direction a duplicated rule would always drift in.
      const assessed = resolveDeedEligibility({
        primary: toDomainFlags(input.flags),
        representative: input.repFlags === null ? null : repFlagsToDomain(input.repFlags),
        context: input.context,
      });

      return {
        primary: toWireVerdict(assessed.primary),
        representative:
          assessed.representative === null ? null : toWireVerdict(assessed.representative),
        /** The CONJUNCTION: a deed whose representative fails is not seatable (Art. 11(5)). */
        eligible: assessed.eligible,
        reasons: [...assessed.reasons],
        surfacedQuestions: [...assessed.surfacedQuestions],
        unverifiedNotes: [...assessed.unverifiedNotes],
      };
    }),

  /**
   * Record the appointment, or record a BR-109 eligibility VERIFICATION on one that exists.
   * REFUSES BEFORE ANY WRITE when the resolver rejects.
   *
   * ── ORDER OF OPERATIONS, AND IT IS THE WHOLE CLAIM ────────────────────────────────────────
   *  1. the pure resolver runs on the primary flags;
   *  2. the pure resolver runs on the representative's flags, when one is recorded;
   *  3. the Art. 11(5) joint-liability rule is applied;
   *  4. on an appointment that ALREADY EXISTS, every deed FACT must arrive UNCHANGED — a changed
   *     one is `DEED_TERM_WRITE_ONCE` (CONFLICT), naming the columns and the remedy;
   *  5. ONLY THEN is `auditedWrite` opened.
   * Nothing is written and rolled back, so AC-E3-07's "the TrusteeshipDeed row is unchanged"
   * assertion is a statement about the database and not merely about the thrown error.
   *
   * ── TWO BRANCHES, TWO DIFFERENT WRITES (AV5-02) ───────────────────────────────────────────
   *  · NO APPOINTMENT YET → `create`, carrying every deed fact plus the assessment. Unchanged.
   *  · APPOINTMENT EXISTS → an `update` that touches the THIRTEEN ASSESSMENT COLUMNS ONLY
   *    ({@link DEED_ELIGIBILITY_ASSESSMENT_COLUMNS}) plus the verification stamp. The deed facts are
   *    not restated at all: they were compared first, and a write that does not include them cannot
   *    contradict them.
   *
   * ⚠ AND ON THIS PATH STEP (4) IS THE ONLY THING THAT REFUSES A STALE SUBMISSION — MEASURED, NOT
   * ASSUMED. The natural sentence here is "the database guard is the backstop", and it is TRUE ONLY
   * FOR A STATEMENT THAT CARRIES A DEED FACT (raw SQL, or any other ORM caller). This `update` sends
   * the assessment alone, so a changed `primaryNazir` never reaches Postgres and the trigger has
   * nothing to refuse. Mutation-measured: with step (4) neutralised, submitting a rewritten
   * `primaryNazir` + `successorNazir` COMMITTED — the facts were silently dropped and the verification
   * stamp advanced as though the whole submission had been accepted, which is worse than a refusal
   * because the caller is told the appointment now reads as they typed it. The refusal is therefore
   * load-bearing at THIS layer, and `deed-eligibility-verification.integration.test.ts` pins it (that
   * mutation turns two of its tests red).
   *
   * What the database still owns on this path: an assessment change that does not carry an ADVANCED
   * verification stamp is refused 42501 by migration 18, for every seat and for raw SQL too.
   */
  upsert: makerProcedure('endowment:deed:write')
    .input(
      z.object({
        primaryNazir: z.string().min(1).max(256),
        primaryAppointedDate: z.string().datetime(),
        primaryAppointedDateHijri: hijriSnapshot,
        authorizedRep: authorizedRepInput.nullable(),
        jointlyLiable: z.boolean(),
        successorNazir: z.string().min(1).max(256).nullable(),
        eligibility: eligibilityFlagsInput,
        repEligibility: repEligibilityFlagsInput.nullable(),
        context: eligibilityContextInput,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ── (0) THE TWO SIDES OF "A REPRESENTATIVE IS RECORDED" MUST AGREE ─────────────────────
      // The database CHECK is one-directional (a rep flag may only be present when a rep is named),
      // so the mirror — rep flags supplied with no rep, or a rep with no flags — is refused here.
      // Silently ignoring either would record an eligibility assertion about nobody, or a
      // jointly-and-severally-liable delegate nobody assessed.
      if ((input.authorizedRep === null) !== (input.repEligibility === null)) {
        throw deedRefused(ctx.waqfId, 'deed', [
          input.authorizedRep === null
            ? 'REP_ELIGIBILITY_WITHOUT_REPRESENTATIVE'
            : 'REP_ELIGIBILITY_NOT_ASSESSED',
        ]);
      }

      // ── (1) NAZARAH ART. 11(5): A DELEGATE IS JOINTLY AND SEVERALLY LIABLE ─────────────────
      // ⚠ unverified — confirm against primary law. Refused rather than corrected: recording a
      // delegated manager while denying the liability that attaches to the delegation is a governance
      // statement, not a checkbox, and the fail-safe is to make it unrepresentable.
      //
      // Checked BEFORE the criteria so a deed failing both hears the structural objection first: the
      // criteria are about a person, and this one is about the instrument.
      if (input.authorizedRep !== null && !input.jointlyLiable) {
        throw deedRefused(ctx.waqfId, 'representative', [REP_JOINT_LIABILITY_REQUIRED]);
      }

      // ── (2) THE SEVEN CRITERIA, BOTH SUBJECTS, ONE CALL ────────────────────────────────────
      // `assertDeedEligible` exists so "refuse BEFORE any write" is one call rather than a pattern each
      // router re-implements. It throws `NAZIR_INELIGIBLE` with `details.reasons`, and it carries NO
      // name and NO id — an eligibility refusal is about a named individual's religion, capacity and
      // criminal record, and that is the last thing that should reach a log line or an audit payload.
      const assessed: DeedEligibility = resolveDeedEligibility({
        primary: toDomainFlags(input.eligibility),
        representative:
          input.repEligibility === null ? null : repFlagsToDomain(input.repEligibility),
        context: input.context,
      });
      assertDeedEligible(assessed);

      const primary: EligibilityVerdict = assessed.primary;
      const representative: EligibilityVerdict | null = assessed.representative;

      const verifiedAt = ctx.now;
      const verifiedAtHijri = String(toHijriSnapshot(verifiedAt));

      // ── (3) THE ASSESSMENT — the thirteen columns migration 18 classifies as OURS to record ──
      // Built once and used by BOTH branches, so a create and a verification can never disagree about
      // what an assessment consists of. `requireAssessed` guards the four NOT NULL columns: see its
      // doc — unreachable after `assertDeedEligible`, and written as a throw rather than a cast so a
      // future change to the applicability rules cannot write "not assessed" as `false`.
      const assessment = {
        islam: requireAssessed(input.eligibility.islam, 'ISLAM'),
        legalCapacity: requireAssessed(input.eligibility.legalCapacity, 'LEGAL_CAPACITY'),
        noDisqualifyingRemoval: requireAssessed(
          input.eligibility.noDisqualifyingRemoval,
          'NO_DISQUALIFYING_REMOVAL',
        ),
        ksaResident: requireAssessed(input.eligibility.ksaResident, 'KSA_RESIDENCY'),
        saudiNationalWhereRequired: input.eligibility.saudiNationalWhereRequired,
        authorityLicensed: input.eligibility.authorityLicensed,
        repIslam: input.repEligibility?.repIslam ?? null,
        repLegalCapacity: input.repEligibility?.repLegalCapacity ?? null,
        repNoDisqualifyingRemoval: input.repEligibility?.repNoDisqualifyingRemoval ?? null,
        repKsaResident: input.repEligibility?.repKsaResident ?? null,
        // BR-109 says capture AND VERIFY. The verification EVENT is what turns ten booleans into a
        // verification; `verifiedBy` is the ACTING identity from the session, never an input.
        eligibilityVerifiedAt: verifiedAt,
        eligibilityVerifiedAtHijri: verifiedAtHijri,
        eligibilityVerifiedBy: ctx.actor.actorId,
      };

      // ⚠ A BUILD-TIME-ISH SELF-CHECK ON THE CLASSIFICATION. The keys written on the UPDATE branch
      // must be EXACTLY the columns the database calls an assessment: one extra key is a sealed
      // column arriving in a verification write (a 42501 from the guard, i.e. AV5-02 again, and only
      // at runtime); one missing key is a criterion the verification silently fails to record.
      {
        const keys = Object.keys(assessment).sort();
        const classified = [...DEED_ELIGIBILITY_ASSESSMENT_COLUMNS].sort();
        if (keys.join(',') !== classified.join(',')) {
          throw new Error(
            `deed router: the assessment write covers [${keys.join(', ')}] but migration 18 ` +
              `classifies [${classified.join(', ')}] as QMULATE's assessment of the appointee. ` +
              `Those two lists decide which facts of a recorded appointment are editable — they may ` +
              `not drift.`,
          );
        }
      }

      // ── (4) A RECORDED APPOINTMENT'S OWN FACTS MAY NOT BE EDITED (memo Q10) ─────────────────
      // Read BEFORE `auditedWrite` opens, so "refused before any write" is a statement about the
      // database rather than about a rolled-back transaction. The facts cannot change under us: they
      // are sealed for every seat, which is the ruling this check enforces one layer up.
      const existing = await ctx.db.trusteeshipDeed.findFirst({
        where: { waqfId: ctx.waqfId },
        select: DEED_FACT_SELECT,
      });

      if (existing !== null) {
        const changedFacts = deedFactDifferences(existing, input);
        if (changedFacts.length > 0) throw deedFactsSealed(ctx.waqfId, changedFacts);
      }

      return auditedWrite(ctx.db, async (tx) => {
        // ⚠ NOT `upsert`. Prisma's `upsert` is on the audited-write guard's DIFFED list, and its
        // update branch has a pre-image — so a projection would falsify the diff. More importantly,
        // splitting the branches keeps the CREATE able to carry `waqfId` (write-once in practice: the
        // column is `@unique`) while the UPDATE touches THE ASSESSMENT ONLY — no deed fact is even
        // restated, so this statement cannot contradict a fact it was just told not to change.
        const row =
          existing === null
            ? await tx.trusteeshipDeed.create({
                data: {
                  waqfId: ctx.waqfId,
                  createdBy: ctx.actor.actorId,
                  primaryNazir: input.primaryNazir,
                  primaryAppointedDate: new Date(input.primaryAppointedDate),
                  primaryAppointedDateHijri: input.primaryAppointedDateHijri,
                  authorizedRepName: input.authorizedRep?.name ?? null,
                  authorizedRepScope: input.authorizedRep?.scope ?? null,
                  authorizedRepAppointedDate:
                    input.authorizedRep === null
                      ? null
                      : new Date(input.authorizedRep.appointedDate),
                  authorizedRepAppointedDateHijri: input.authorizedRep?.appointedDateHijri ?? null,
                  jointlyLiable: input.jointlyLiable,
                  successorNazir: input.successorNazir,
                  ...assessment,
                },
              })
            : await tx.trusteeshipDeed.update({ where: { id: existing.id }, data: assessment });

        await recordEvent(toActorContext(ctx, { procedure: 'deed.upsert' }), {
          // ⚠ A SECOND EVENT BESIDE THE EXTENSION'S OWN, for the same reason `settings.set` writes
          // one: the audit extension's diff records the four booleans that CHANGED, and it cannot
          // express the VERDICT they produced, the reason codes, or the fact that every criterion is
          // unverified against primary Saudi law. A ten-year record of "ksaResident became true" that
          // omits the caveat reads as settled law to whoever finds it.
          action: existing === null ? 'CREATE' : 'UPDATE',
          category: 'MUTATION',
          classification: 'SENSITIVE',
          entityType: 'TrusteeshipDeed',
          entityId: row.id,
          waqfId: ctx.waqfId,
          extraContext: {
            // ⚠ THE VERDICT GOES INTO THE TRAIL WITH ITS CAVEAT. A ten-year record of "this Nazir was
            // eligible" that omits "every criterion is unverified against primary Saudi law" reads as
            // settled law to whoever finds it.
            primaryEligible: primary.eligible,
            primaryReasons: [...primary.reasons],
            representativeRecorded: input.authorizedRep !== null,
            representativeEligible: representative?.eligible ?? null,
            jointlyLiable: input.jointlyLiable,
            eligibilityVerifiedAtHijri: verifiedAtHijri,
            // ⚠ WHICH OF THE TWO WRITES THIS WAS, IN THE TRAIL RATHER THAN INFERRED FROM `action`.
            // On an existing appointment the row's deed facts are untouched by construction and only
            // the assessment moved; a ten-year reader must be able to tell "an appointment was
            // recorded" from "an eligibility verification was recorded against one".
            recorded: existing === null ? 'APPOINTMENT_AND_ASSESSMENT' : 'ELIGIBILITY_VERIFICATION',
            unverified: true,
          },
        });

        return {
          id: row.id,
          // The same discriminator on the wire, so a screen can say what it just did without
          // re-reading the record. Not a sentence: E10/E12 owns the copy.
          recorded: existing === null ? 'APPOINTMENT_AND_ASSESSMENT' : 'ELIGIBILITY_VERIFICATION',
          eligibility: {
            primary: toWireVerdict(primary),
            representative: representative === null ? null : toWireVerdict(representative),
          },
        };
      });
    }),
});
