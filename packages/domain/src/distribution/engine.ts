/**
 * `distribution/engine.ts` — the pure entrypoint of the distribution engine (PRD §08, epic E6).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE STAGE ORDER IS THE RULE, NOT AN IMPLEMENTATION DETAIL
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 *     0 · INPUT       parse + cross-field consistency, and the Shart's order made legible
 *     1 · WATERFALL   the corpus guard, then ṣiyāna (صيانة) → operating → Nazir fee → distributable
 *     2 · RESOLVER    who is ENTITLED (ṭabaqa / ẓuhūr / buṭūn, ORDERED | SHARED | JOINT | direct use)
 *     3 · GATES       who is PAYABLE now — over the entitled cohort only
 *     4 · TIMING      the injected post-FYE window, on both calendars (S3 decision D2)
 *     5 · ALLOCATE    the exact bigint split, the lines, the totals, the Authority notices
 *     6 · INVARIANTS  I1–I9 + I-C1 asserted on the assembled run, before anything is returned
 *
 * Two orderings inside that sequence are load-bearing and are not configurable:
 *
 *  · **ṣiyāna comes out first**, before any operating cost, before any fee, before any payout. That
 *    is `./waterfall.ts`'s fixed order and no `Setting` selects it.
 *  · **Entitlement is decided before payability, and allocation is last.** A gate can therefore
 *    never influence who is owed, and nothing can influence an amount after it is assigned — which
 *    is what makes invariant I6 (withhold-never-reallocates) structural rather than aspirational.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * PURITY (locked — see `../index.ts`'s header)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * No internal import, no I/O, no `process`, no clock, no randomness. `asOf` and both deadline dates
 * are **parameters**, so a run can be replayed byte-for-byte during an audit or a family dispute
 * years later. The only third-party dependencies on the whole path are `decimal.js` and `zod`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FOUR REFUSALS, AND THE FOUR NON-REFUSALS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The engine **refuses** — throwing a typed `DomainError`, emitting no run at all — on:
 *
 *  | condition                                             | code                        |
 *  |-------------------------------------------------------|-----------------------------|
 *  | the input is not the §08 shape, or is self-inconsistent| `DISTRIBUTION_INPUT_INVALID`|
 *  | a receipt is unclassified / corpus has no provenance   | `RECEIPT_UNCLASSIFIED` · `CORPUS_NOT_DISTRIBUTABLE` |
 *  | the waterfall would go negative                        | `DISTRIBUTION_NEGATIVE`     |
 *  | the Shart is unreadable — the order, the continuation term, the lineage graph, a `JOINT` waqf, a
 *    cohort mixing a charity with a bloodline concurrently, or (R7) the deed's مآل clause | `SHART_INCOMPLETE` |
 *
 * ⚠ **Stage-0 refusals outrank a money error, and R7 joins them.** `assertSingleWaqfNature` — which now
 * validates the reversion clause as its second step — runs before `computeWaterfall`, so an illegible
 * deed halts instead of being told "insufficient revenue" about figures that were never going to be
 * used. `REVERSION_WITH_NO_RECORDED_BLOODLINE` and `ULTIMATE_TAKER_WEIGHTS_UNUSABLE` are the exception:
 * both need the **certified** lineage graph, so they are raised at Stage 2, after the waterfall.
 *
 * and it **computes anyway**, recording a flag, on the four states §08 explicitly says are not
 * exceptions: a nil distribution, no eligible beneficiaries, direct utilization, and an overdue
 * window. A Nazir who is late, or whose family has nobody entitled this period, still owes the
 * family a statement — so those produce a reviewable, signable run rather than an error.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE TWO SHORT-CIRCUITS BELOW STAGE 2
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Both skip stages 3 and 5's split — and **neither skips the waterfall**, which is the DEFECT-1
 * correction §08 line 54 requires:
 *
 *  · **`NA_DIRECT_USE`** (intifāʿ mubāshir / انتفاع مباشر): the beneficiaries benefit from the asset
 *    itself, so there is no cohort and no monetary line **regardless of period revenue** (I7). The
 *    waterfall still computes, and any positive distributable is reported as `totals.retainedMinor`.
 *    Worked example C2 is exactly this case, and it is the one state in which §08's I3 as originally
 *    written is arithmetically false.
 *  · **`NIL_DISTRIBUTION`** (`distributableMinor === 0n`): §08 line 405 says `lines = []` flatly, and
 *    that is implemented literally.
 *
 *    // TODO(surface): §08 is INCONSISTENT here and this engine does not harmonise it. On zero
 *    // revenue it says `lines = []`, discarding the entitlement-basis record; on an ineligible
 *    // cohort (§08 line 403) it says zero *payout* lines, and Example A emits an EXCLUDED line for
 *    // ben-002. So a nil run with a live cohort reports `excludedCount: 0` while an
 *    // `NO_ELIGIBLE_BENEFICIARIES` run with the same cohort reports its exclusions in full. BR-505
 *    // requires a per-beneficiary statement showing the entitlement basis, which argues for
 *    // emitting the EXCLUDED lines in both branches. Whether a nil-run statement must carry the
 *    // entitlement basis is a product/reporting scope call — surfaced, not resolved
 *    // (CLAUDE.md binding rule 4).
 *
 * `NO_ELIGIBLE_BENEFICIARIES` is **not** a short-circuit: the run goes through Stage 5, which emits
 * the EXCLUDED lines with their reason codes and puts the whole distributable in `retainedMinor`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * DETERMINISM (I8) — WHAT MAKES IT TRUE HERE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  · `flags` and `invariantsChecked` are emitted in **canonical vocabulary order** (`RUN_FLAGS` /
 *    `INVARIANT_IDS`), never in the order the stages happened to produce them, so re-ordering a call
 *    below cannot change a stored run's bytes or its hash. ⚠ Note for whoever writes
 *    `worked-examples.test.ts`: this means `flags` is a **set rendered in vocabulary order** — a
 *    direct-use nil run reports `['NIL_DISTRIBUTION', 'NA_DIRECT_USE']`, which is the same set as
 *    the S3 brief's worked example C lists in the other order.
 *  · Every line ordering is `compareBeneficiaryIds` (UTF-16 code units). Never `localeCompare`,
 *    whose ICU-dependent ordering would make the residual tie-break — and therefore a payout —
 *    host-dependent.
 *  · The `computationTrace` is numbered by ONE builder threaded through every stage, so `seq` is the
 *    real order of execution and no stage can renumber another's steps.
 *  · Nothing here reads a clock, so a replay of the same input produces the same bytes.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ UNVERIFIED FIGURES TRAVEL WITH THE RUN (CLAUDE.md binding rule 3)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `unverifiedNotes` carries `policy.unverifiedNote` on **every** run, and `flags` therefore always
 * contains `UNVERIFIED_FIGURES_APPLIED`. That is by construction, and it is not noise: `policy` is
 * assembled entirely from `Setting`s that are registered in `UNVERIFIED_FIGURE_KEYS` —
 * `kyc.refreshIntervalMonths`, `distribution.rounding.method`,
 * `distribution.deadline.bindingCalendar` — so **every** run currently applies at least one figure
 * that has not been confirmed against primary Saudi law. A run WITHOUT the flag would mean every
 * applied figure had been confirmed, which has not happened yet; when the counsel memos land the
 * flag becomes informative. Under-reporting staleness is the direction that matters, so the flag
 * errs on. `timing.unverifiedNote` is narrower — it is `null` unless the *window* figure itself is
 * flagged unverified — and the two fields are deliberately not the same claim.
 */

import { distributionInvariantBreach } from '../errors.js';
import { INVARIANT_IDS, RUN_FLAGS, assertResultShape, parseDistributionInput } from './contract.js';
import type {
  AuthorityNotice,
  DistributionInput,
  DistributionInputRaw,
  DistributionLine,
  DistributionResult,
  InvariantId,
  Minor,
  RunFlag,
  Timing,
  Totals,
} from './contract.js';
import { allocateMinor, assembleLines, emptyTotals, entitledCohortWeights } from './allocate.js';
import type { AllocationResult } from './allocate.js';
import { evaluateGates } from './gates.js';
import type { GateOutcome } from './gates.js';
import { assertInvariants } from './invariants.js';
import { assertSingleWaqfNature, parseEntitlementOrder, resolveEntitlement } from './resolver.js';
import { createTraceBuilder, step } from './trace.js';
import { evaluateTiming } from './timing.js';
import { computeWaterfall } from './waterfall.js';

/**
 * The code version a run was produced by.
 *
 * Persisted on every result so a replayed computation can be compared like for like: a difference
 * between two runs of the same input is either a version difference or a defect, and this field is
 * what tells them apart. Bump it whenever an arithmetic rule, a trace code, or the result shape
 * changes — all three change a stored run's hash.
 */
// ADR-0009 bumped the MAJOR to 2.0.0: the result shape gained four `basis` fields, the trace gained new
// codes, and the arithmetic rule for a family cohort changed from deed weights to per capita.
//
// R7 bumps it again, to 3.0.0, and the reason is not cosmetic on any of three counts: the INPUT gained a
// clause of the Shart (`reversion`) that v2 could not express at all, the trace gained three codes and
// two run flags, and `basis.rule` gained a value AND can now VARY WITHIN ONE RUN. All of that is inside
// `canonicalizeResult`'s bytes, so a v2 run and a v3 run of "the same" input are not comparable — v2's
// input could not state where the endowment goes when the family ends.
//
// **4.0.0 — the S4 owner rulings of 2026-08-17 (memo Q5 and Q7).** Nothing about the result SHAPE moved and
// no vocabulary grew, which is why the reason has to be stated rather than assumed: **the same input now
// produces different amounts.** Q5 widened the مآل trigger to every entitlement order, so an
// `ORDERED`/`SHARED` deed recording `ZUHUR_ONLY` whose survivors all sit on abandoned lines now pays the
// charity the whole distributable where v3 retained it (measured: 256 of 7,680 enumerated cells), and the
// abandoned line's living survivor moves from ENTITLED to `EXCLUDED / BUTUN_LINE_NOT_CONTINUED`. Q7 turned a
// computing run into a refusal (a tiered jiha on a direct-use waqf). A stored v3 run and a v4 run of the
// same register are therefore not comparable, which is the one thing this field exists to say — and a MINOR
// bump would have implied they were.
export const ENGINE_VERSION = 'e6-distribution/4.0.0';

/** The allocation of an empty entitled cohort: nothing split, nothing left over. */
const NO_ALLOCATION: AllocationResult = Object.freeze({
  amountsMinor: Object.freeze([]) as readonly Minor[],
  floorsMinor: Object.freeze([]) as readonly bigint[],
  residualMinor: 0n,
});

/**
 * Compute a distribution run.
 *
 * Pure and total: for a given input it either returns the one `DistributionResult` that input
 * implies, or throws a typed `DomainError`. It never returns a partial run, never guesses the
 * founder's intent, and never lets corpus (asl / أصل) reach a beneficiary line.
 *
 * @param raw the §08 input. Parsed and cross-checked through `parseDistributionInput`, so a caller
 *   holding an untrusted object may pass it directly — a `ZodError` is converted to
 *   `DISTRIBUTION_INPUT_INVALID` rather than escaping as an untyped third-party exception.
 * @throws `DISTRIBUTION_INPUT_INVALID` · `SETTING_INVALID` · `RECEIPT_UNCLASSIFIED` ·
 *   `CORPUS_NOT_DISTRIBUTABLE` · `DISTRIBUTION_NEGATIVE` · `SHART_INCOMPLETE` ·
 *   `DISTRIBUTION_INVARIANT_BREACH` — see the module header's refusal table.
 */
export function runDistribution(raw: DistributionInputRaw): DistributionResult {
  /* ── Stage 0 · INPUT ──────────────────────────────────────────────────────────────────── */
  const input: DistributionInput = parseDistributionInput(raw);
  const trace = createTraceBuilder();

  trace.add(
    step('INPUT', 'INPUT_PARSED', 'Distribution input parsed and cross-checked against §08.', {
      engineVersion: ENGINE_VERSION,
      waqfId: input.waqfId,
      classification: input.classification,
      waqfType: input.waqfType,
      periodStart: input.period.start,
      periodEnd: input.period.end,
      fiscalYearEnd: input.fiscalYearEnd,
      disbursementSchedule: input.disbursementSchedule ?? 'NONE',
      beneficiaryCount: String(input.beneficiaries.length),
      receiptCount: String(input.revenue.receipts.length),
    }),
  );

  // The Shart's order is narrowed BEFORE any money is computed. `resolveEntitlement` narrows it
  // again (idempotently) at Stage 2, but doing it here means a waqf whose recorded order nobody can
  // read halts with SHART_INCOMPLETE instead of being told "insufficient revenue" about figures
  // that were never going to be used. Binding rule 1: the engine halts, it does not infer.
  const declaredOrder = parseEntitlementOrder(input.entitlementOrder);
  trace.add(
    step(
      'INPUT',
      'SHART_ORDER_LEGIBLE',
      "The Shart's recorded order of entitlement is one the engine recognises; no interpretation was applied.",
      { entitlementOrder: declaredOrder },
    ),
  );

  // ADR-0009 R5 · a waqf has ONE nature — خيري or ذري, never both. Refused HERE, before any money is
  // computed, and that placement is the rule: Stage 0 refuses facts about THE WAQF ITSELF, and a run
  // on a waqf that cannot exist is void whatever its figures say. `resolveEntitlement` asserts the
  // same thing again (idempotently) at Stage 2, but doing it here is what makes the refusal outrank
  // `DISTRIBUTION_NEGATIVE` — a deliberate inversion of S3's "money wins" asymmetry for this one case,
  // because "insufficient revenue" is the wrong answer to give about an impossible endowment.
  assertSingleWaqfNature(input);
  trace.add(
    step(
      'INPUT',
      'WAQF_NATURE_SINGLE',
      'The waqf declares one nature — خيري (charitable) or ذري (ancestral/generational) — and its recorded cohort does not mix the two.',
      { waqfType: input.waqfType, beneficiaryCount: String(input.beneficiaries.length) },
    ),
  );

  /* ── Stage 1 · WATERFALL — corpus guard, then ṣiyāna → operating → Nazir fee ───────────── */
  const waterfallOutcome = computeWaterfall(input);
  const { waterfall } = waterfallOutcome;
  trace.addAll(waterfallOutcome.trace);

  /* ── Stage 2 · RESOLVER — who is ENTITLED ─────────────────────────────────────────────── */
  const resolution = resolveEntitlement(input);
  trace.addAll(resolution.trace);

  if (resolution.order !== declaredOrder) {
    // Defensive: both narrowings run `parseEntitlementOrder` over the same string, so they cannot
    // disagree. Asserted because if they ever did, the run would report one rule and apply another.
    throw distributionInvariantBreach(
      'I7',
      `the pre-flight narrowed entitlementOrder to ${declaredOrder} but the resolver reports ${resolution.order}`,
      { preflight: declaredOrder, resolver: resolution.order },
    );
  }

  const distributionType: 'MONETARY' | 'NA_DIRECT_USE' =
    resolution.order === 'NA_DIRECT_USE' ? 'NA_DIRECT_USE' : 'MONETARY';

  const isDirectUse = distributionType === 'NA_DIRECT_USE';
  const isNil = (waterfall.distributableMinor as bigint) === 0n;
  const shortCircuited = isDirectUse || isNil;

  /* ── Stage 3 · GATES — who is PAYABLE now (entitled cohort only) ───────────────────────── */
  const entitledMembers = resolution.resolved.filter((member) => member.entitled);
  const gateOutcomes = new Map<string, GateOutcome>();

  if (shortCircuited) {
    trace.add(
      step(
        'GATES',
        'GATES_SKIPPED',
        'No monetary line will be emitted, so payability was not evaluated: a gate reason on a line that does not exist would misrepresent why nothing was paid.',
        {
          reason: shortCircuitReason(isDirectUse, isNil),
          entitledCount: String(entitledMembers.length),
        },
      ),
    );
  } else {
    for (const member of entitledMembers) {
      // `evaluateGates` sees the beneficiary, the injected `asOf` and the resolved refresh window —
      // and no `Minor` at all. That is half of I6's structural proof; see `./gates.ts`'s header.
      const outcome = evaluateGates({
        beneficiary: member.source,
        asOfGregorian: input.asOf.gregorian,
        kycRefreshMonths: input.policy.kycRefreshMonths,
      });
      gateOutcomes.set(member.beneficiaryId, outcome);

      trace.add(
        step('GATES', 'GATE_OUTCOME', 'Payability evaluated for an entitled beneficiary.', {
          beneficiaryId: member.beneficiaryId,
          status: outcome.status,
          reasonCode: outcome.reasonCode ?? 'null',
          gateFlags: outcome.gateFlags.join(','),
        }),
      );
    }

    trace.add(
      step(
        'GATES',
        'GATES_EVALUATED',
        'Payability gates evaluated over the entitled cohort. A gate stamps a status; it never changes an amount (I6).',
        {
          entitledCount: String(entitledMembers.length),
          kycRefreshMonths: String(input.policy.kycRefreshMonths),
          asOfGregorian: input.asOf.gregorian,
        },
      ),
    );
  }

  /* ── Stage 4 · TIMING — the post-FYE window, on both calendars (D2) ────────────────────── */
  const timingOutcome = evaluateTiming(input);
  const timing: Timing = timingOutcome.timing;
  trace.addAll(timingOutcome.trace);

  /* ── Stage 5 · ALLOCATE — the exact split, the lines, the totals, the notices ──────────── */
  let lines: readonly DistributionLine[];
  let totals: Totals;
  let authorityNotices: readonly AuthorityNotice[];
  let allocation: AllocationResult;

  if (shortCircuited) {
    allocation = NO_ALLOCATION;
    lines = Object.freeze([]);
    // The whole distributable is reported as retained — attached to no line. This is the DEFECT-1
    // correction: without `retainedMinor`, §08's I2 and I3 are false for a direct-use waqf that had
    // period revenue. Where the retained value GOES is OQ-01 sub-question 2 and is unsigned; the
    // engine reports it and carries nothing forward.
    totals = emptyTotals(waterfall.distributableMinor, 0);
    authorityNotices = Object.freeze([]);

    trace.add(
      step(
        'ALLOCATE',
        'ALLOCATE_SHORT_CIRCUIT',
        'No split was performed; the distributable is reported as retained and attached to no line. The waterfall above it still computed in full.',
        {
          reason: shortCircuitReason(isDirectUse, isNil),
          retainedMinor: String(waterfall.distributableMinor),
        },
      ),
    );
  } else {
    // The cohort's ONE definition of order, taken from `./allocate.ts` rather than re-derived: the
    // allocation is positional, so the order the weights go in IS the mapping from halalas to
    // people, and §08's "tie-break by ascending beneficiaryId" is only meaningful in that order.
    const cohort = entitledCohortWeights(resolution);
    allocation =
      cohort.weights.length === 0
        ? NO_ALLOCATION
        : allocateMinor(
            waterfall.distributableMinor,
            cohort.weights,
            // ⚠ unverified (OQ-01) — `Setting distribution.rounding.method`. Resolved by the caller
            // and passed in; `LARGEST_REMAINDER_BANKERS` is declared but unimplemented and is
            // REFUSED with SETTING_INVALID rather than falling back to half-up, which would produce
            // a statement indistinguishable from a ratified one.
            input.policy.roundingMethod,
          );

    const assembled = assembleLines({
      resolution,
      gateOutcomes,
      allocation,
      distributableMinor: waterfall.distributableMinor,
    });
    lines = assembled.lines;
    totals = assembled.totals;
    authorityNotices = assembled.authorityNotices;
    trace.addAll(assembled.trace);
  }

  /* ── Flags and ⚠ markers ──────────────────────────────────────────────────────────────── */
  const unverifiedNotes = collectUnverifiedNotes(
    input.policy.unverifiedNote,
    timing.unverifiedNote,
  );

  const collectedFlags: RunFlag[] = [
    ...waterfallOutcome.flags,
    // Stage 2's flags: a Shart term this engine RECORDED but did not APPLY must be visibly
    // not-applied on the run itself (ADR-0009 R3), not merely mentioned in a trace step nobody reads.
    // Only ever STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA and CONTINUATION_STIPULATION_NOT_APPLIED.
    ...resolution.flags,
    ...timingOutcome.flags,
  ];
  if (isDirectUse) collectedFlags.push('NA_DIRECT_USE');
  if (isNil) collectedFlags.push('NIL_DISTRIBUTION');
  if (!shortCircuited && resolution.entitledIds.length === 0) {
    // §08's own text: "not an exception … a flag". The EXCLUDED lines are still emitted and the
    // whole distributable is retained (AT-06).
    collectedFlags.push('NO_ELIGIBLE_BENEFICIARIES');
  }
  if (unverifiedNotes.length > 0) collectedFlags.push('UNVERIFIED_FIGURES_APPLIED');
  const flags = canonicalRunFlags(collectedFlags);

  /* ── Stage 6 · INVARIANTS — asserted on the assembled run, before anything is returned ── */
  const invariantsChecked: readonly InvariantId[] = assertInvariants({
    input,
    distributionType,
    order: resolution.order,
    waterfall,
    lines,
    totals,
    floorsMinor: allocation.floorsMinor,
    entitledIds: resolution.entitledIds,
    // R7 · handed in so I-R1 can CROSS-CHECK the reversion flag against its own recomputation of the
    // extinction test. `flags` is computed above, before this call, precisely so it is available to be
    // checked rather than merely published.
    flags,
  });

  trace.add(
    step(
      'INVARIANTS',
      'INVARIANTS_ASSERTED',
      'Every invariant this run supports was asserted on the assembled figures. I8 (determinism) is a statement about two runs and is not assertable from one, so it is never reported as checked.',
      {
        checked: invariantsChecked.join(','),
        notChecked: notCheckedInvariants(invariantsChecked).join(','),
      },
    ),
  );

  /* ── The result ───────────────────────────────────────────────────────────────────────── */
  const result: DistributionResult = Object.freeze({
    engineVersion: ENGINE_VERSION,
    waqfId: input.waqfId,
    distributionType,
    classification: input.classification,
    waqfType: input.waqfType,
    entitlementOrder: resolution.order,
    entitlementRule: resolution.rule,
    // Copied, not aliased: the result is persisted and hashed, and must not change if the caller
    // mutates its own input object afterwards.
    period: Object.freeze({ start: input.period.start, end: input.period.end }),
    waterfall,
    lines: Object.freeze([...lines]),
    totals: Object.freeze({ ...totals }),
    timing,
    authorityNotices: Object.freeze([...authorityNotices]),
    flags,
    computationTrace: trace.entries(),
    invariantsChecked,
    unverifiedNotes,
  });

  // One line per beneficiary, ascending `beneficiaryId`. Asserted rather than assumed: the residual
  // tie-break (I9) is defined in terms of that order and the canonical serialization (I8) is only
  // stable if the array order is.
  return assertResultShape(result);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Internals
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

function shortCircuitReason(isDirectUse: boolean, isNil: boolean): string {
  if (isDirectUse && isNil) return 'NA_DIRECT_USE,NIL_DISTRIBUTION';
  return isDirectUse ? 'NA_DIRECT_USE' : 'NIL_DISTRIBUTION';
}

/**
 * Deduplicate the run's flags and emit them in canonical `RUN_FLAGS` order.
 *
 * Two stages can legitimately raise the same flag — `UNVERIFIED_FIGURES_APPLIED` comes from
 * `./timing.ts` when the window figure is flagged and from here whenever any ⚠ figure was applied —
 * so the set is collapsed rather than left with a duplicate. Ordering by the shared vocabulary
 * instead of by emission order is what keeps a stored run's bytes stable when the calls above are
 * reshuffled (I8), and it means a flag cannot be "first" merely because its stage runs early.
 */
function canonicalRunFlags(collected: readonly RunFlag[]): readonly RunFlag[] {
  const present = new Set<RunFlag>(collected);
  return Object.freeze(RUN_FLAGS.filter((flag) => present.has(flag)));
}

/**
 * The ⚠ markers this run carried, deduplicated, first-seen order.
 *
 * `policy.unverifiedNote` is always present (the contract requires a non-empty string), so this list
 * is never empty — see the module header for why that is the honest direction rather than noise.
 * `timing.unverifiedNote` is included when it differs, which it can if a caller carries the longer
 * marker `../dates/deadline.ts` uses; `packages/domain` currently holds two different ⚠ strings and
 * this engine reports both rather than picking one.
 */
function collectUnverifiedNotes(policyNote: string, timingNote: string | null): readonly string[] {
  const notes: string[] = [policyNote];
  if (timingNote !== null && timingNote !== policyNote) notes.push(timingNote);
  return Object.freeze(notes);
}

/**
 * The invariant ids this run did NOT assert, recorded in the trace so the omission is explicit.
 *
 * A reader of a stored run can see that, say, I5 was not checked because no line was emitted —
 * rather than having to infer it from the absence of an id. I8 appears here on every run.
 */
function notCheckedInvariants(checked: readonly InvariantId[]): readonly InvariantId[] {
  const asserted = new Set<InvariantId>(checked);
  return Object.freeze(INVARIANT_IDS.filter((id) => !asserted.has(id)));
}
