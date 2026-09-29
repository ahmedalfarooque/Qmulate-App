/**
 * `eligibility/resolve.ts` — the pure Nazir / authorized-representative eligibility resolver
 * (BR-109, NFR-09; §17 E3: "an eligibility resolver in `packages/domain` (pure)").
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ONE IMPLEMENTATION, TWO CALL SITES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `deed.upsert` must **refuse before any write**, and `deed.verifyEligibility` must show the screen why
 * *before* the user submits. Those are the same rule asked twice, and NFR-09's own target says the
 * constraint lives "in `packages/domain` (pure TS, zod-validated) so [it holds] identically across web,
 * mobile, API, and jobs". So both call {@link resolveEligibility} and neither re-derives anything: the
 * dry run and the enforcing mutation cannot disagree, because there is nothing for them to disagree with.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * PURE, AND STRUCTURALLY UNABLE TO SEAT ANYBODY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * No I/O, no clock, no `Minor` and no money type anywhere in this module's signatures — a thing that
 * decides who may *manage* an endowment must not be able to touch what the endowment *pays*. It reads
 * only the flags and the context it is handed, and it returns a verdict; persisting the verification
 * event (`eligibilityVerifiedAt` / `…Hijri` / `…By`) is the caller's, because BR-109 says capture **and
 * verify** and a verification is an audited act, not a computation.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FAIL-SAFE DIRECTION, STATED ONCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Everything ambiguous here resolves **towards refusing the seat**, with exactly one exception that is
 * named and argued rather than hidden:
 *
 *   · `false` on a binding criterion ⇒ refuse.
 *   · `null` (not assessed) on a binding criterion ⇒ **refuse**, never pass. See the contract's header.
 *   · An unrecognised context ⇒ impossible: the context is three required booleans.
 *   · **The exception** — the two conditional criteria on an authorized *representative* resolve to
 *     `UNDECIDED_SURFACED`, which neither blocks nor passes. Refusing there would be a *permanent*
 *     block (no column exists to satisfy it), so the fail-safe is unavailable and the honest move is to
 *     report the question. See `SURFACED_REPRESENTATIVE_SCOPE`.
 */

import { DomainError } from '../errors.js';
import {
  CRITERION_AUTHORITY,
  CRITERION_REASON,
  ELIGIBILITY_CRITERIA,
  ELIGIBILITY_UNVERIFIED_NOTE,
  SURFACED_REPRESENTATIVE_SCOPE,
} from './contract.js';
import type {
  CriterionApplicability,
  DeedEligibility,
  EligibilityContext,
  EligibilityCriterion,
  EligibilityCriterionOutcome,
  EligibilityFlags,
  EligibilityReasonCode,
  EligibilitySubject,
  EligibilityVerdict,
} from './contract.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Applicability — the only place a criterion's binding condition is written down
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Does `criterion` bind on `subject` in `context`?
 *
 * The `switch` is exhaustive over {@link EligibilityCriterion}: a new criterion added to the vocabulary
 * without an applicability rule is a **compile error**, so it cannot default to "does not apply" — which
 * would add a regulatory condition to the model and then never evaluate it.
 */
export function applicabilityOf(
  criterion: EligibilityCriterion,
  subject: EligibilitySubject,
  context: EligibilityContext,
): CriterionApplicability {
  switch (criterion) {
    // ── The four unconditional criteria. They bind on both subjects, in every context. ──
    case 'ISLAM':
    case 'LEGAL_CAPACITY':
    case 'NO_DISQUALIFYING_REMOVAL':
      return 'REQUIRED';
    // KSA residency binds on both, and on a representative it BLOCKS — the fail-safe reading of
    // BO Standards Art. 8(1) ("no management by non-residents") against a delegated manager who is
    // jointly and severally liable. ⚠ unverified; surfaced, not resolved.
    case 'KSA_RESIDENCY':
      return 'REQUIRED';
    // ── The two conditional criteria. ──
    // Nationality binds only on BOTH halves of BR-109's condition: a foreign endower AND real property.
    // `&&`, not `||`, is load-bearing — either half alone is not the rule, and widening it would block
    // seats the regulation does not block.
    case 'SAUDI_NATIONALITY_WHERE_REQUIRED':
      return subject === 'AUTHORIZED_REPRESENTATIVE'
        ? 'UNDECIDED_SURFACED'
        : context.endowerIsForeign && context.holdsRealProperty
          ? 'REQUIRED'
          : 'NOT_APPLICABLE';
    // Licensing is a fact about the NAZIR's legal personality, so it cannot bind a natural-person Nazir.
    case 'AUTHORITY_LICENSED':
      return subject === 'AUTHORIZED_REPRESENTATIVE'
        ? 'UNDECIDED_SURFACED'
        : context.nazirIsLegalPerson
          ? 'REQUIRED'
          : 'NOT_APPLICABLE';
    default: {
      const unhandled: never = criterion;
      throw new DomainError(
        'NAZIR_INELIGIBLE',
        `Eligibility criterion ${String(unhandled)} has no applicability rule. Refusing the seat rather than treating an unevaluated regulatory condition as satisfied.`,
        { details: { criterion: String(unhandled) } },
      );
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The resolver
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Assess one subject against BR-109's criteria.
 *
 * Pure and total: every criterion is reported, in {@link ELIGIBILITY_CRITERIA} order, and the input is
 * never mutated. Returns a verdict — **never a bare boolean** — because the exit clause is "blocked with
 * a clear reason".
 */
export function resolveEligibility(args: {
  readonly subject: EligibilitySubject;
  readonly flags: EligibilityFlags;
  readonly context: EligibilityContext;
}): EligibilityVerdict {
  const { subject, flags, context } = args;

  const criteria: EligibilityCriterionOutcome[] = [];
  const reasons: EligibilityReasonCode[] = [];
  const notAssessed: EligibilityCriterion[] = [];

  for (const criterion of ELIGIBILITY_CRITERIA) {
    const applicability = applicabilityOf(criterion, subject, context);
    // The recorded fact, passed through untouched. A NOT_APPLICABLE criterion recorded as `false` still
    // reports `satisfied: false` — the fact is not erased just because it does not bind here, and a
    // reader can see that the endowment recorded a negative answer to a question it did not have to ask.
    const satisfied = flags[criterion];

    const failing = applicability === 'REQUIRED' && satisfied !== true;
    const reasonCode = failing
      ? satisfied === null
        ? 'ELIGIBILITY_NOT_ASSESSED'
        : CRITERION_REASON[criterion]
      : null;

    criteria.push({
      criterion,
      applicability,
      satisfied,
      reasonCode,
      unverified: true,
      authority: CRITERION_AUTHORITY[criterion],
    });

    if (failing) {
      if (satisfied === null) notAssessed.push(criterion);
      // Deduped, first occurrence wins, so `ELIGIBILITY_NOT_ASSESSED` appears once however many
      // criteria are unassessed — one operational condition, one code (see the contract's header).
      if (reasonCode !== null && !reasons.includes(reasonCode)) reasons.push(reasonCode);
    }
  }

  const surfacedQuestions =
    subject === 'AUTHORIZED_REPRESENTATIVE' ? [SURFACED_REPRESENTATIVE_SCOPE] : [];

  return Object.freeze({
    subject,
    // Derived from the outcomes rather than tracked alongside them: one source, so `eligible` cannot
    // disagree with the reason list it is supposed to summarise.
    eligible: reasons.length === 0,
    reasons: Object.freeze(reasons),
    criteria: Object.freeze(criteria),
    notAssessed: Object.freeze(notAssessed),
    surfacedQuestions: Object.freeze(surfacedQuestions),
    unverifiedNotes: Object.freeze([ELIGIBILITY_UNVERIFIED_NOTE]),
  });
}

/**
 * Assess a whole trusteeship deed: the primary Nazir, plus the representative when one is recorded.
 *
 * `representative: null` means **no representative is recorded** — not "one is recorded and we did not
 * check". The caller must not pass `null` to skip an assessment; `TrusteeshipDeed`'s CHECK makes the two
 * states distinguishable in the database (the four `rep*` flags may only be present when
 * `authorizedRepName` is), and this signature keeps them distinguishable here.
 */
export function resolveDeedEligibility(args: {
  readonly primary: EligibilityFlags;
  readonly representative: EligibilityFlags | null;
  readonly context: EligibilityContext;
}): DeedEligibility {
  const primary = resolveEligibility({
    subject: 'PRIMARY_NAZIR',
    flags: args.primary,
    context: args.context,
  });
  const representative =
    args.representative === null
      ? null
      : resolveEligibility({
          subject: 'AUTHORIZED_REPRESENTATIVE',
          flags: args.representative,
          context: args.context,
        });

  // The CONJUNCTION. A deed whose representative fails is not seatable: the representative acts under
  // the deed and is jointly and severally liable for what they do (Nazarah Art. 11(5), ⚠ unverified).
  const reasons: EligibilityReasonCode[] = [...primary.reasons];
  for (const reason of representative?.reasons ?? []) {
    if (!reasons.includes(reason)) reasons.push(reason);
  }

  return Object.freeze({
    primary,
    representative,
    eligible: primary.eligible && (representative === null || representative.eligible),
    reasons: Object.freeze(reasons),
    surfacedQuestions: Object.freeze([
      ...primary.surfacedQuestions,
      ...(representative?.surfacedQuestions ?? []),
    ]),
    unverifiedNotes: Object.freeze([ELIGIBILITY_UNVERIFIED_NOTE]),
  });
}

/**
 * Refuse the seat, as a typed `DomainError`, if the deed is not eligible.
 *
 * Exists so "refuse **before any write**" is one call rather than a pattern each router re-implements —
 * `deed.upsert` calls this and the write never starts. `details.reasons` carries the machine codes the
 * surface renders through `packages/i18n`; the `message` is developer-facing English for logs.
 *
 * ⚠ The error carries **no name, no id and no personal fact** — only vocabulary members. An eligibility
 * refusal is about a named individual's religion, capacity and criminal record, and that is the last
 * thing that should reach a log line or an audit payload.
 */
export function assertDeedEligible(deed: DeedEligibility): void {
  if (deed.eligible) return;
  throw new DomainError(
    'NAZIR_INELIGIBLE',
    `Trusteeship deed refused: ${deed.reasons.join(', ')}. BR-109/NFR-09 eligibility is enforced before any write and cannot be overridden in-app.`,
    {
      details: {
        reasons: deed.reasons,
        primary: deed.primary.reasons,
        representative: deed.representative?.reasons ?? null,
        notAssessed: deed.primary.notAssessed,
        representativeNotAssessed: deed.representative?.notAssessed ?? null,
        unverifiedNotes: deed.unverifiedNotes,
      },
    },
  );
}
