/**
 * `eligibility/contract.ts` — who may be seated as **Nazir (ناظر)** or as an **authorized
 * representative**, expressed as a closed vocabulary (BR-109, NFR-09).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS IS A VERDICT AND NOT A BOOLEAN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §17's E3 exit clause is not "an ineligible Nazir is blocked". It is **"an ineligible Nazir
 * (non-resident) is blocked WITH A CLEAR REASON"**, and BR-109's own error row says the seat "is
 * blocked with the NFR-09 reason; cannot be overridden in-app". A predicate returning `false` satisfies
 * the first sentence and neither of the others: the caller then has to re-derive *why*, which is a
 * second implementation of the rule and the place the two answers start disagreeing.
 *
 * So {@link EligibilityVerdict} carries, always and for every criterion:
 *
 *   · `applicability` — does this criterion **bind** in this context at all;
 *   · `satisfied` — the recorded fact, `true` | `false` | **`null` = NOT ASSESSED**;
 *   · `reasonCode` — a stable {@link ELIGIBILITY_REASON_CODES} member, set iff the criterion binds and
 *     is not satisfied.
 *
 * ⚠ **The codes are MACHINE CODES, never prose.** The ar/en wording a Nazir or a family reads belongs
 * to E10/E12 and to `packages/i18n`; nothing in this module may contain user-facing copy. The English
 * strings that do exist here ({@link CRITERION_AUTHORITY}, {@link SURFACED_REPRESENTATIVE_SCOPE}) are
 * developer-facing provenance and surfaced questions — the same category as `DomainError.message` and
 * `distribution/gates.ts`'s `GATE_REASON_TEXT`, and they are never rendered to a beneficiary.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `null` IS NOT A PASS — IT IS A REFUSAL (`ELIGIBILITY_NOT_ASSESSED`)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The eligibility columns are nullable in `schema.prisma` for a real reason: intake learns these one at
 * a time, and "recorded representative, criterion not yet assessed" is a legitimate state. It is
 * emphatically **not** a legitimate state to *seat* on. A resolver that read `null` as "nothing recorded
 * against them, so fine" would seat a Nazir whose residency nobody ever checked — the precise defect
 * NFR-09 exists to prevent — so an unassessed binding criterion is a refusal, and the criterion that was
 * not assessed is named in {@link EligibilityVerdict.notAssessed}.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * TWO CRITERIA ARE CONDITIONAL, AND THE CONDITION IS AN ARGUMENT — NEVER AN ASSUMPTION
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * BR-109 makes two of the six conditional: Saudi nationality binds **where the endower is foreign AND
 * the asset is real property**, and Authority licensing binds **where the Nazir is a legal person**.
 * Both conditions arrive in {@link EligibilityContext}, all fields **required with no default**.
 *
 * A defaulted context is the same class of defect as a defaulted regulatory figure: `endowerIsForeign:
 * false` as a default silently un-binds the nationality rule for every endowment whose intake had not
 * reached that question yet, and the seat would be granted with the criterion never evaluated. The
 * caller states the context or the input does not parse.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * EVERY CRITERION IS ⚠ UNVERIFIED (CLAUDE.md binding rule 3)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The criteria come from Nazarah reg. Art. 5 and the Beneficial Ownership Standards Art. 8 **as
 * summarised in `docs/`**, not from the Arabic originals confirmed by Saudi counsel. So each outcome
 * carries `unverified: true` and the verdict carries {@link UNVERIFIED_NOTE}. That is not decoration:
 * the KSA-residency block is the single most consequential thing this module does, and it must not be
 * quoted anywhere as settled law. There is **no threshold and no figure in this file** — nothing here
 * belongs in a `Setting`, because these are *predicates*, not numbers; if a criterion is later found not
 * to bind, that is a vocabulary change with an ADR, not a config change.
 */

import { z } from 'zod';

import { UNVERIFIED_NOTE } from '../settings.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The closed vocabularies
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Who is being assessed.
 *
 * Two subjects, because BR-109 says "Nazir **AND** authorized-representative" and the representative is
 * **jointly and severally liable** (Nazarah Art. 11(5) — ⚠ unverified). Before S4 the data model carried
 * one set of flags, for the primary Nazir only, so a non-resident representative passed unchecked.
 *
 * ⚠ BR-105 says "Authorized Representative(**s**)" — plural — and `TrusteeshipDeed` models exactly one.
 * S4 keeps one. A second delegated manager, and whether the second is also jointly and severally liable,
 * is a schema question nobody has authorised.
 */
export const ELIGIBILITY_SUBJECTS = ['PRIMARY_NAZIR', 'AUTHORIZED_REPRESENTATIVE'] as const;
export type EligibilitySubject = (typeof ELIGIBILITY_SUBJECTS)[number];

/**
 * The six criteria, in the order a verdict reports them.
 *
 * Order is part of the contract: {@link EligibilityVerdict.reasons} is built by walking this list, so a
 * refusal's reason order is deterministic and a persisted verdict from last year reads the same way
 * today. The four unconditional ones come first, so the two conditional ones cannot be mistaken for the
 * baseline.
 *
 * ⚠ **BR-109 names two more that are NOT here: "qualifications" and "good conduct".** They are absent
 * because `TrusteeshipDeed` records no flag for either, and a criterion this module could only ever
 * report as `null` would make **every** deed permanently unseatable — a brick wall, not a fail-safe.
 * `NO_DISQUALIFYING_REMOVAL` is the conduct half the schema does carry (Art. 5's "not previously
 * removed"). Capturing qualifications is the P1 "exhaustive verification checklist" §05 defers, and
 * adding it here means adding the columns first.
 */
export const ELIGIBILITY_CRITERIA = [
  'ISLAM',
  'LEGAL_CAPACITY',
  'NO_DISQUALIFYING_REMOVAL',
  'KSA_RESIDENCY',
  'SAUDI_NATIONALITY_WHERE_REQUIRED',
  'AUTHORITY_LICENSED',
] as const;
export type EligibilityCriterion = (typeof ELIGIBILITY_CRITERIA)[number];

/**
 * Whether a criterion binds on this subject in this context.
 *
 * `UNDECIDED_SURFACED` is the honest third value and it exists for one shape only: a criterion whose
 * applicability to an **authorized representative** is a live legal question (see
 * {@link SURFACED_REPRESENTATIVE_SCOPE}). It never blocks and it is never a pass — it is *reported*, so
 * an unanswered question cannot masquerade as a satisfied criterion. Collapsing it into
 * `NOT_APPLICABLE` would have been a silent answer to a question for counsel.
 */
export const CRITERION_APPLICABILITIES = [
  'REQUIRED',
  'NOT_APPLICABLE',
  'UNDECIDED_SURFACED',
] as const;
export type CriterionApplicability = (typeof CRITERION_APPLICABILITIES)[number];

/**
 * The refusal vocabulary. **Stable machine codes; the ar/en copy is E10/E12's and lives in
 * `packages/i18n`.**
 *
 * One code per criterion plus `ELIGIBILITY_NOT_ASSESSED`, which is deliberately **one code for all
 * unassessed criteria** rather than six: "nobody has checked this yet" is a single operational condition
 * with a single remedy (go and check), and six codes for it would be six ar/en messages saying the same
 * sentence. *Which* criterion was not assessed is data — {@link EligibilityVerdict.notAssessed} — not a
 * separate code. That is the same reasoning that keeps `SHART_REFUSALS` under one `SHART_INCOMPLETE`.
 *
 * ⚠ **Note the polarity of `DISQUALIFYING_REMOVAL_RECORDED`**, the one code not shaped
 * `<CRITERION>_REQUIRED`: the flag is positive (`noDisqualifyingRemoval: true` = clean), so the *refusal*
 * names the removal rather than the flag — "a prior removal disqualifies this appointment" is the
 * condition, and `NO_DISQUALIFYING_REMOVAL_REQUIRED` would name a double negative nobody reads correctly.
 *
 * ⚠ **THIS ONE CODE'S SPELLING WAS A LIVE MISMATCH DURING S4/E3 AND IT IS WORTH THE PARAGRAPH.** The
 * domain and the ar/en catalogue were written in parallel and briefly disagreed — one side
 * `DISQUALIFYING_REMOVAL_RECORDED`, the other `NO_DISQUALIFYING_REMOVAL_REQUIRED`, in both locales.
 * **next-intl does not throw for a missing message; it prints the key**, so the visible symptom would
 * have been a Nazir reading Arabic (authoritative, NFR-01 — not a fallback) seeing
 * `endowments.eligibility.reasons.…` on a refusal screen, with every test in every package green. It was
 * caught by `__tests__/eligibility-i18n-parity.test.ts`, which exists for exactly this and which is the
 * only reason the two sides now agree. Do not rename any of these seven without running it.
 */
export const ELIGIBILITY_REASON_CODES = [
  'ISLAM_REQUIRED',
  'LEGAL_CAPACITY_REQUIRED',
  'DISQUALIFYING_REMOVAL_RECORDED',
  'KSA_RESIDENCY_REQUIRED',
  'SAUDI_NATIONALITY_REQUIRED',
  'AUTHORITY_LICENCE_REQUIRED',
  'ELIGIBILITY_NOT_ASSESSED',
] as const;
export type EligibilityReasonCode = (typeof ELIGIBILITY_REASON_CODES)[number];

/**
 * Criterion → the reason code its failure carries. **Exhaustive on purpose.**
 *
 * A criterion added to {@link ELIGIBILITY_CRITERIA} without a code here is a **compile error**, so a new
 * criterion cannot be added and then silently fail to produce a reason — which would block a seat with
 * an empty reason list and make the exit clause's "with a clear reason" false while every test passed.
 */
export const CRITERION_REASON: Readonly<Record<EligibilityCriterion, EligibilityReasonCode>> = {
  ISLAM: 'ISLAM_REQUIRED',
  LEGAL_CAPACITY: 'LEGAL_CAPACITY_REQUIRED',
  NO_DISQUALIFYING_REMOVAL: 'DISQUALIFYING_REMOVAL_RECORDED',
  KSA_RESIDENCY: 'KSA_RESIDENCY_REQUIRED',
  SAUDI_NATIONALITY_WHERE_REQUIRED: 'SAUDI_NATIONALITY_REQUIRED',
  AUTHORITY_LICENSED: 'AUTHORITY_LICENCE_REQUIRED',
};

/**
 * Developer-facing provenance for each criterion — **not user-facing copy, and not a citation to rely
 * on.** Every line is ⚠ unverified against the Arabic originals (binding rule 3) and travels with the
 * verdict so a figure or a rule cannot be quoted without its caveat.
 */
export const CRITERION_AUTHORITY: Readonly<Record<EligibilityCriterion, string>> = {
  ISLAM: 'Nazarah reg. Art. 5 (appointment conditions) — ⚠ unverified, confirm vs primary law',
  LEGAL_CAPACITY: 'Nazarah reg. Art. 5 (legal capacity) — ⚠ unverified, confirm vs primary law',
  NO_DISQUALIFYING_REMOVAL:
    'Nazarah reg. Art. 5 (not previously removed / no disqualifying conviction) — ⚠ unverified, confirm vs primary law',
  KSA_RESIDENCY:
    'Beneficial Ownership Standards Art. 8(1) (KSA residency; no management by non-residents) — ⚠ unverified, confirm vs primary law',
  SAUDI_NATIONALITY_WHERE_REQUIRED:
    'Beneficial Ownership Standards Art. 8 (Saudi nationality where the endower is foreign and the asset is real property) — ⚠ unverified, confirm vs primary law',
  AUTHORITY_LICENSED:
    'Nazarah reg. Art. 5 / Awqaf Law (Authority licensing of a legal-person Nazir) — ⚠ unverified, confirm vs primary law',
};

/**
 * ⚠ **SURFACED, NOT RESOLVED (CLAUDE.md binding rule 4) — which criteria bind a REPRESENTATIVE?**
 *
 * BR-109 requires eligibility for "Nazir **and** authorized-representative" and says nothing about which
 * of the criteria transfer. S4 implements the **four unconditional** ones on a representative — matching
 * the four columns migration 12 added (`repIslam`, `repLegalCapacity`, `repNoDisqualifyingRemoval`,
 * `repKsaResident`) — with the fail-safe direction on the one that matters most: `repKsaResident: false`
 * **blocks**, because Art. 8(1) forbids management by non-residents and a representative jointly and
 * severally liable for the Nazarah plainly manages.
 *
 * The two **conditional** criteria are reported `UNDECIDED_SURFACED` on a representative, and this is a
 * deliberate refusal to answer rather than an oversight:
 *
 *   · treating them as `NOT_APPLICABLE` would be Claude answering a legal question by omission;
 *   · treating them as `REQUIRED` would be worse than wrong — `TrusteeshipDeed` has **no column** for a
 *     representative's nationality or licence, so every such deed would report
 *     `ELIGIBILITY_NOT_ASSESSED` for ever and no representative could ever be seated on a
 *     foreign-endower real-property endowment. That is a brick wall dressed as a safeguard.
 *
 * So the resolver says "undecided, and here is the question", and the answer is a column plus a
 * vocabulary change, not a code tweak.
 */
export const SURFACED_REPRESENTATIVE_SCOPE =
  'Which of BR-109’s criteria bind an AUTHORIZED REPRESENTATIVE, and whether representative non-residency BLOCKS or merely FLAGS, is a question for Saudi counsel. S4 binds the four unconditional criteria (fail-safe: repKsaResident=false blocks) and reports the two CONDITIONAL criteria as UNDECIDED — the deed records no representative nationality or licence, so requiring them would make every such seat permanently unfillable. ⚠ unverified — confirm vs primary law.';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Inputs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * One subject's recorded eligibility facts: `true` satisfies, `false` fails, **`null` = not assessed**.
 *
 * An **exhaustive** record over {@link ELIGIBILITY_CRITERIA}, not a bag of optional fields. Two things
 * follow, both of them the point:
 *
 *   · a criterion added to the vocabulary becomes a **compile error at every call site**, so no caller
 *     can keep passing five facts while the rule now needs six;
 *   · there is no optional key and no `.default()`, so "the caller forgot to send residency" and "the
 *     caller says residency is unassessed" are **different inputs** — the first does not parse, the
 *     second refuses with `ELIGIBILITY_NOT_ASSESSED`. Collapsing those two is how an unchecked criterion
 *     becomes a granted seat.
 */
export type EligibilityFlags = Readonly<Record<EligibilityCriterion, boolean | null>>;

/**
 * The facts that decide whether the two conditional criteria bind. All required; no defaults.
 *
 * `nazirIsLegalPerson` is a fact about the **endowment's Nazir**, not about the subject being assessed —
 * which is why it also reaches a representative's verdict, where it currently decides nothing (see
 * {@link SURFACED_REPRESENTATIVE_SCOPE}).
 */
export interface EligibilityContext {
  /** The waqif is a foreign national/entity. Half of the nationality condition. */
  readonly endowerIsForeign: boolean;
  /** The endowment holds real property (عقار). The other half. */
  readonly holdsRealProperty: boolean;
  /** The Nazir is a legal person (a company/entity), not a natural person. */
  readonly nazirIsLegalPerson: boolean;
}

/**
 * `EligibilityFlags` as zod. **Nullable but NOT optional** — the key must be present.
 *
 * Same rule, and the same reason, as `distribution/contract.ts`'s `beneficiaryInputSchema`: a
 * `.default()` here would be code answering a question about a person's legal standing.
 */
export const eligibilityFlagsSchema = z.object({
  ISLAM: z.boolean().nullable(),
  LEGAL_CAPACITY: z.boolean().nullable(),
  NO_DISQUALIFYING_REMOVAL: z.boolean().nullable(),
  KSA_RESIDENCY: z.boolean().nullable(),
  SAUDI_NATIONALITY_WHERE_REQUIRED: z.boolean().nullable(),
  AUTHORITY_LICENSED: z.boolean().nullable(),
});

/** `EligibilityContext` as zod. No `.default()`: an unstated condition is not a false condition. */
export const eligibilityContextSchema = z.object({
  endowerIsForeign: z.boolean(),
  holdsRealProperty: z.boolean(),
  nazirIsLegalPerson: z.boolean(),
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Outputs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** One criterion's outcome. Reported for **every** criterion, whether it binds or not. */
export interface EligibilityCriterionOutcome {
  readonly criterion: EligibilityCriterion;
  /** Does it bind here? See {@link CRITERION_APPLICABILITIES}. */
  readonly applicability: CriterionApplicability;
  /** The recorded fact as given: `true` | `false` | `null` (not assessed). Never inferred. */
  readonly satisfied: boolean | null;
  /** Set iff `applicability === 'REQUIRED'` and `satisfied !== true`. A machine code, never prose. */
  readonly reasonCode: EligibilityReasonCode | null;
  /** ⚠ Always `true` — binding rule 3. See {@link CRITERION_AUTHORITY}. */
  readonly unverified: true;
  /** Developer-facing provenance. Not a citation to rely on, and not user copy. */
  readonly authority: string;
}

/** One subject's verdict. */
export interface EligibilityVerdict {
  readonly subject: EligibilitySubject;
  /** `true` iff **every** `REQUIRED` criterion is `satisfied === true`. */
  readonly eligible: boolean;
  /** Deduped, in {@link ELIGIBILITY_CRITERIA} order. **Empty iff `eligible`.** */
  readonly reasons: readonly EligibilityReasonCode[];
  /** One entry per criterion, in vocabulary order. Always the full six. */
  readonly criteria: readonly EligibilityCriterionOutcome[];
  /** Which binding criteria were `null`. The detail behind `ELIGIBILITY_NOT_ASSESSED`. */
  readonly notAssessed: readonly EligibilityCriterion[];
  /** Developer-facing surfaced questions raised by this verdict. Never user copy. */
  readonly surfacedQuestions: readonly string[];
  /** ⚠ binding rule 3 — travels with the verdict so the caveat cannot be dropped in transit. */
  readonly unverifiedNotes: readonly string[];
}

/**
 * A trusteeship deed's eligibility: the primary Nazir, and the representative when one is recorded.
 *
 * `eligible` is the **conjunction** — a deed with an ineligible representative is not seatable, because
 * the representative is jointly and severally liable for acts done under it (Nazarah Art. 11(5), ⚠
 * unverified). `representative === null` means no representative is recorded, which is not a failure.
 */
export interface DeedEligibility {
  readonly primary: EligibilityVerdict;
  readonly representative: EligibilityVerdict | null;
  readonly eligible: boolean;
  readonly reasons: readonly EligibilityReasonCode[];
  readonly surfacedQuestions: readonly string[];
  readonly unverifiedNotes: readonly string[];
}

/** The one ⚠ marker every verdict carries. Re-exported so a caller need not reach into `../settings`. */
export const ELIGIBILITY_UNVERIFIED_NOTE = UNVERIFIED_NOTE;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Type guards
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Is this a recognised criterion? */
export function isEligibilityCriterion(value: unknown): value is EligibilityCriterion {
  return (ELIGIBILITY_CRITERIA as readonly unknown[]).includes(value);
}

/** Is this a recognised refusal code? */
export function isEligibilityReasonCode(value: unknown): value is EligibilityReasonCode {
  return (ELIGIBILITY_REASON_CODES as readonly unknown[]).includes(value);
}

/** Is this a recognised subject? */
export function isEligibilitySubject(value: unknown): value is EligibilitySubject {
  return (ELIGIBILITY_SUBJECTS as readonly unknown[]).includes(value);
}
