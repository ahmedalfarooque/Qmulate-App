/**
 * `compliance/instantiation.ts` — the pure per-endowment TASK-INSTANTIATION planner
 * (§09 Engine A's second half; E7-completion stage, owner sequencing ruling 2026-08-24).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE IS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09: *"On endowment setup …, once classification is set, the engine materialises one
 * `ComplianceTask` per applicable template (gate resolves true), snapshotting the template code +
 * version"*, and on reclassification *"the engine diffs the applicable template set"* — newly in
 * scope instantiates, newly out of scope retires WITH history, still in scope is untouched.
 *
 * This module is that diff, computed and returned as a PLAN — it writes nothing. The gating
 * decision is `obligationsForClassification`'s partition, taken as an INPUT so the plan cannot
 * disagree with what the register screen showed a moment earlier (the one-resolver principle the
 * whole classification plane runs on). The caller (the API) executes the plan inside one audited
 * transaction and records the whole delta as one correlated event (BR-104 / clause A3).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT NEVER PRE-MATERIALISES: EVENT templates
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09: *"Event-recurrence templates (`GOV-REG-02`, `GOV-PROT-02`, `GOV-GEN-03`, `GOV-AML-02`,
 * `GOV-INV-01`) are **not** pre-materialised; they are raised on their trigger."* The planner
 * derives the skip from `recurrence === 'EVENT'` rather than from that hand-list, because the
 * catalogue's own compression added two rows §09's list predates (`FIN-DIST-02`, whose §09 cell
 * reads "per run", and `GOV-RGL-01`) — a hand-list would have pre-materialised both, giving every
 * endowment a "produce distribution statements" task with no distribution run to attach to.
 * `EVENT_TEMPLATE_CODES_PER_SPEC` pins §09's five so the derivation can never silently lose them.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS MODULE REFUSES (fail-closed, WITH liveness — the S8 lesson, three outages deep)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A partition that is locked, defective, or undecided cannot honestly be turned into task rows:
 *  · `REGISTER_LOCKED_NOT_CLASSIFIED` — A2's posture: no tasks materialise before classification.
 *  · `UNRECOGNISED_GATE_ROWS` / `RETIRED_GATE_ROWS` — defence in depth; the API refuses these
 *    before planning, and the planner refuses them again rather than trusting its caller.
 *  · `INCOME_FACT_MISSING_AT_INSTANTIATION` — the register READ may honestly report ledger-gated
 *    rows as undecided (it has no period); an INSTANTIATION may not: materialising "undecided"
 *    invents a task or drops a duty. The caller must decide the fact first. Nothing here defaults
 *    it — that rule is the resolver's and this module inherits it.
 *  · `TEMPLATE_FACTS_MISSING` / `DUPLICATE_TEMPLATE_CODE` — an applicable code the caller supplied
 *    no template facts for (recurrence unreadable ⇒ the EVENT skip is unanswerable), or two facts
 *    rows for one code (the caller's version filter failed; silently taking either is how a task
 *    freezes the WRONG `templateVersion` into its snapshot).
 * The liveness half: a clean, decided partition on a real classification ALWAYS yields a plan —
 * `planned: true` with possibly-empty lists is a legal outcome (a fully-instantiated register plans
 * zero new tasks), and the unit suite asserts it, because a planner that refuses the entitled
 * caller is an outage that reads as a working control.
 */

import type { ClassificationObligations, WaqfClassification } from '../classification/contract.js';
import type { ComplianceRecurrence } from './contract.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Vocabulary
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Why a task row exists — `schema.prisma`'s `TaskInstantiationReason`, spelled here because the
 * pure module runs with no generated client (the classification contract's own rule). Parity is
 * pinned against the schema text by the unit suite.
 *
 * ⚠ `EVENT_TRIGGER` is vocabulary only in this stage: §09's event templates are raised on their
 * trigger (an AML report filed, an expropriation recorded, a distribution run) and no trigger
 * wiring exists yet — E8 territory, declared in the stage log. The planner never emits it.
 */
export const TASK_INSTANTIATION_REASONS = [
  'INITIAL_SETUP',
  'RECLASSIFICATION',
  'EVENT_TRIGGER',
  // ⊕ S9-3b (owner ruling 2026-08-25, S9 first batch): the explicit maker≠checker act that
  // attaches newly-in-scope templates to an ALREADY-instantiated register. A version bump alone
  // changes only future instantiations; this reason exists so the attachment is an occasion
  // somebody performed, never a side effect.
  'LIBRARY_UPGRADE',
] as const;
export type TaskInstantiationReason = (typeof TASK_INSTANTIATION_REASONS)[number];

/**
 * The occasions this planner serves. `EVENT_TRIGGER` is not an occasion — it has no diff.
 * `LIBRARY_UPGRADE` (S9-3b) reuses the same diff shape with ONE ruled difference: NOTHING
 * retires implicitly — newly-out-of-scope open tasks are REPORTED (`outOfScopeOpen`), exactly
 * like `INITIAL_SETUP`, never retired (retirement stays `RECLASSIFICATION`'s alone).
 */
export type InstantiationOccasion = Extract<
  TaskInstantiationReason,
  'INITIAL_SETUP' | 'RECLASSIFICATION' | 'LIBRARY_UPGRADE'
>;

/**
 * §09's own not-pre-materialised list, pinned. The DERIVATION is `recurrence === 'EVENT'`; this
 * constant exists so a test can prove the derived set still contains every code §09 names — a
 * catalogue edit that quietly moved `GOV-AML-02` to `ONGOING` would otherwise pre-materialise an
 * AML-attributable task onto every endowment's board (the exact leak S8-Q1 compartments).
 */
export const EVENT_TEMPLATE_CODES_PER_SPEC = Object.freeze([
  'GOV-REG-02',
  'GOV-PROT-02',
  'GOV-GEN-03',
  'GOV-AML-02',
  'GOV-INV-01',
  // ⊕ 2026-08-26.1 (S9-2, the S8-Q9 additions) — §09's event list names them since the same
  // amendment. Pinned here for the same reason as the five: the derivation must never silently
  // lose an event template, GOV-AML-02 above most of all.
  'FIN-DIST-03',
  'GOV-GEN-04',
] as const);

/** Task statuses that make a task OPEN — §09's "live task". Everything else is history. */
export const OPEN_TASK_STATUSES = ['NOT_STARTED', 'IN_PROGRESS'] as const;
export type OpenTaskStatus = (typeof OPEN_TASK_STATUSES)[number];

/** Is this status one of the OPEN ones? Total over strings, so a caller can filter raw rows. */
export function isOpenTaskStatus(value: string): value is OpenTaskStatus {
  return (OPEN_TASK_STATUSES as readonly string[]).includes(value);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Inputs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The catalogue facts instantiation needs beyond the partition: the frozen-snapshot version and
 * the recurrence (which decides the EVENT skip). One row per code, AT THE PUBLISHED VERSION —
 * the caller filters; the planner refuses duplicates rather than picking one.
 */
export interface InstantiableTemplateFacts {
  readonly code: string;
  readonly libraryVersion: string;
  /** `ComplianceRecurrence` as recorded, `null` = deliberately cadence-less (instantiates). */
  readonly recurrence: ComplianceRecurrence | null;
}

/** An existing task row, as the planner needs to see it. */
export interface ExistingTaskRef {
  readonly id: string;
  readonly templateCode: string;
  readonly templateVersion: string;
  /** `ComplianceTaskStatus` as recorded; the planner narrows via {@link isOpenTaskStatus}. */
  readonly status: string;
}

export interface RegisterInstantiationArgs {
  readonly occasion: InstantiationOccasion;
  /**
   * The gating partition — `obligationsForClassification`'s output, computed by the caller WITH
   * the ledger fact supplied. Passing the partition rather than recomputing is what makes "the
   * plan agrees with the register screen" structural.
   */
  readonly partition: ClassificationObligations;
  /** Template facts for (at least) every applicable code, at the published library version. */
  readonly templates: readonly InstantiableTemplateFacts[];
  /** Every existing task row on the endowment — open AND historical; the planner filters. */
  readonly existingTasks: readonly ExistingTaskRef[];
  /**
   * Required when `occasion === 'RECLASSIFICATION'`: the transition, for §09's retirement reason
   * (*"`retiredReason = "reclassified <old>→<new>"`"* — the spec's own record string).
   */
  readonly reclassification?: {
    readonly from: WaqfClassification;
    readonly to: WaqfClassification;
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · Outputs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export const INSTANTIATION_REFUSALS = [
  'REGISTER_LOCKED_NOT_CLASSIFIED',
  'UNRECOGNISED_GATE_ROWS',
  'RETIRED_GATE_ROWS',
  'INCOME_FACT_MISSING_AT_INSTANTIATION',
  'TEMPLATE_FACTS_MISSING',
  'DUPLICATE_TEMPLATE_CODE',
  'RECLASSIFICATION_CONTEXT_MISSING',
] as const;
export type InstantiationRefusal = (typeof INSTANTIATION_REFUSALS)[number];

export interface PlannedTask {
  readonly templateCode: string;
  /** Frozen into the task's S8-Q5 snapshot by the caller. */
  readonly templateVersion: string;
  readonly instantiatedReason: InstantiationOccasion;
  readonly classificationAtInstantiation: WaqfClassification;
}

export interface PlannedRetirement {
  readonly taskId: string;
  readonly templateCode: string;
  /** §09's record string: `reclassified <old>→<new>`. */
  readonly retiredReason: string;
}

export type RegisterInstantiationPlan =
  | {
      readonly planned: false;
      readonly refusal: InstantiationRefusal;
      /** The rows/codes the refusal is ABOUT, so a caller can name every one in its error. */
      readonly subjects: readonly string[];
    }
  | {
      readonly planned: true;
      readonly occasion: InstantiationOccasion;
      readonly classification: WaqfClassification;
      /** Applicable, non-EVENT, no open copy → create. */
      readonly instantiate: readonly PlannedTask[];
      /**
       * Open tasks whose template the partition now EXCLUDES → retire with history (§09 clause 2).
       * ⚠ Always empty at `INITIAL_SETUP`: setup instantiates, it never retires — an out-of-scope
       * open row at setup is REPORTED in `outOfScopeOpen` for a human, because retiring a row this
       * engine did not create, on an occasion §09 gives no retirement clause for, is a decision.
       */
      readonly retire: readonly PlannedRetirement[];
      /** Applicable with an open copy already — §09 clause 3, untouched. */
      readonly keptOpen: readonly ExistingTaskRef[];
      /** Applicable but `recurrence === 'EVENT'` — never pre-materialised (§09). */
      readonly skippedEventTemplates: readonly string[];
      /** INITIAL_SETUP only (see `retire`): open rows whose template the partition excludes. */
      readonly outOfScopeOpen: readonly ExistingTaskRef[];
      /**
       * Open rows whose `templateCode` is not in the partition at all — pre-engine hand-seeded
       * rows (the fixture's `SEED-*` codes) or rows from another library version. Untouched and
       * reported: the planner does not manage what it cannot attribute to the catalogue it was
       * given.
       */
      readonly unknownOpen: readonly ExistingTaskRef[];
    };

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The planner
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export function planRegisterInstantiation(
  args: RegisterInstantiationArgs,
): RegisterInstantiationPlan {
  const { occasion, partition, templates, existingTasks } = args;

  // ── Refusals first, each naming its subjects ──────────────────────────────────────────────
  if (partition.registerLocked) {
    return refuse('REGISTER_LOCKED_NOT_CLASSIFIED', [String(partition.classification)]);
  }
  if (partition.unrecognisedGate.length > 0) {
    return refuse(
      'UNRECOGNISED_GATE_ROWS',
      partition.unrecognisedGate.map((row) => row.code),
    );
  }
  if (partition.retiredGate.length > 0) {
    return refuse(
      'RETIRED_GATE_ROWS',
      partition.retiredGate.map((row) => row.code),
    );
  }
  if (partition.incomeFactMissing.length > 0) {
    return refuse(
      'INCOME_FACT_MISSING_AT_INSTANTIATION',
      partition.incomeFactMissing.map((row) => row.code),
    );
  }
  if (occasion === 'RECLASSIFICATION' && args.reclassification === undefined) {
    return refuse('RECLASSIFICATION_CONTEXT_MISSING', []);
  }

  // ── Template facts: one row per code, and one for every applicable code ───────────────────
  const factsByCode = new Map<string, InstantiableTemplateFacts>();
  const duplicates: string[] = [];
  for (const facts of templates) {
    if (factsByCode.has(facts.code)) duplicates.push(facts.code);
    factsByCode.set(facts.code, facts);
  }
  if (duplicates.length > 0) return refuse('DUPLICATE_TEMPLATE_CODE', duplicates);

  const missingFacts = partition.obligations
    .filter((row) => !factsByCode.has(row.code))
    .map((row) => row.code);
  if (missingFacts.length > 0) return refuse('TEMPLATE_FACTS_MISSING', missingFacts);

  // ── The diff ──────────────────────────────────────────────────────────────────────────────
  const applicableCodes = new Set(partition.obligations.map((row) => row.code));
  const excludedCodes = new Set(partition.excluded.map((row) => row.code));
  const openTasks = existingTasks.filter((task) => isOpenTaskStatus(task.status));
  const openByCode = new Map<string, ExistingTaskRef[]>();
  for (const task of openTasks) {
    const bucket = openByCode.get(task.templateCode);
    if (bucket === undefined) openByCode.set(task.templateCode, [task]);
    else bucket.push(task);
  }

  const instantiate: PlannedTask[] = [];
  const skippedEventTemplates: string[] = [];
  const keptOpen: ExistingTaskRef[] = [];

  for (const row of partition.obligations) {
    // Non-null asserted by the TEMPLATE_FACTS_MISSING refusal above.
    const facts = factsByCode.get(row.code) as InstantiableTemplateFacts;
    if (facts.recurrence === 'EVENT') {
      skippedEventTemplates.push(row.code);
      continue;
    }
    const open = openByCode.get(row.code);
    if (open !== undefined && open.length > 0) {
      keptOpen.push(...open);
      continue;
    }
    instantiate.push({
      templateCode: row.code,
      templateVersion: facts.libraryVersion,
      instantiatedReason: occasion,
      classificationAtInstantiation: partition.classification,
    });
  }

  const retire: PlannedRetirement[] = [];
  const outOfScopeOpen: ExistingTaskRef[] = [];
  const unknownOpen: ExistingTaskRef[] = [];
  for (const task of openTasks) {
    if (applicableCodes.has(task.templateCode)) continue; // kept above
    if (!excludedCodes.has(task.templateCode)) {
      unknownOpen.push(task);
      continue;
    }
    if (occasion === 'RECLASSIFICATION') {
      const { from, to } = args.reclassification as NonNullable<
        RegisterInstantiationArgs['reclassification']
      >;
      retire.push({
        taskId: task.id,
        templateCode: task.templateCode,
        retiredReason: `reclassified ${from}→${to}`,
      });
    } else {
      outOfScopeOpen.push(task);
    }
  }

  return Object.freeze({
    planned: true as const,
    occasion,
    classification: partition.classification,
    instantiate: Object.freeze(instantiate),
    retire: Object.freeze(retire),
    keptOpen: Object.freeze(keptOpen),
    skippedEventTemplates: Object.freeze(skippedEventTemplates),
    outOfScopeOpen: Object.freeze(outOfScopeOpen),
    unknownOpen: Object.freeze(unknownOpen),
  });
}

function refuse(
  refusal: InstantiationRefusal,
  subjects: readonly string[],
): RegisterInstantiationPlan {
  return Object.freeze({
    planned: false as const,
    refusal,
    subjects: Object.freeze([...subjects]),
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · THE RETURN TO `NOT_CLASSIFIED` — a SEPARATE planner, and the separation is the design
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * **Owner rulings, in the order they were given and both load-bearing:**
 *  · 2026-08-25 (S8 addendum, FOURTH batch) — the return is ALLOWED but RESERVED-MATTER-GATED,
 *    *"the default refusal stands for the ungated path"*, and the interaction with instantiated
 *    tasks *"must be DESIGNED, not defaulted"*.
 *  · 2026-08-27 (S9 addendum, SECOND batch) — that design, ruled: *"retires the open tasks with
 *    reason 'classification returned to NOT_CLASSIFIED' — rows kept, history queryable, the
 *    reclassification-retirement shape reused. A later correct classification runs a fresh
 *    instantiation."*
 *
 * ── WHY THIS CANNOT BE AN OCCASION ON {@link planRegisterInstantiation} ──────────────────────
 * Two independent reasons, and the second is the one that would have bitten silently:
 *
 *  1. {@link InstantiationOccasion} is `Extract<TaskInstantiationReason, …>` — a SUBSET of the
 *     Prisma enum, pinned member-for-member and IN ORDER by a parity test. A new occasion would
 *     force a new `TaskInstantiationReason` member into `schema.prisma` that **no row would ever
 *     carry**, because this act instantiates nothing. A vocabulary entry that exists only to
 *     satisfy a type is a vocabulary entry the next reader has to explain away.
 *
 *  2. ⚠ THE DIFF SHAPE PHYSICALLY CANNOT EXPRESS "RETIRE EVERYTHING". `planRegisterInstantiation`
 *     retires an open task only when its code is in `partition.excluded` (see the retire loop
 *     above). At `NOT_CLASSIFIED` the resolver REFUSES TO PARTITION — `registerLocked: true` with
 *     every list frozen-empty — so `excluded` is empty, and every open task would fall into
 *     `unknownOpen` and be silently left in force on a locked register. Widening the occasion enum
 *     would have produced a green path that retired NOTHING while reporting a plan.
 *
 * ── WHAT THIS PLANNER DELIBERATELY DOES NOT CONSULT ─────────────────────────────────────────
 * No partition, no catalogue, no gate matrix, no template facts, no ledger fact, no usage axis.
 * That is not an omission, it is the meaning of the target state: `NOT_CLASSIFIED` is the ABSENCE
 * of a determination, so there is no applicable set to compute and nothing to compare against.
 * Asking a locked register what it contains is the question the lock exists to refuse.
 */

/**
 * The retirement reason, VERBATIM from the owner's ruling (S9 addendum, second batch, 2026-08-27).
 *
 * ⚠ A CONSTANT, not a template literal, and that is a deliberate difference from its sibling
 * `` `reclassified ${from}→${to}` ``. That one DESCRIBES a transition and varies with it; this one
 * is a phrase the owner chose, and an engineer improving its wording later would be editing a
 * ruling. It is compared verbatim by the test that proves the ruling is implemented.
 */
export const RETURN_TO_NOT_CLASSIFIED_RETIREMENT_REASON =
  'classification returned to NOT_CLASSIFIED';

export interface ReturnToNotClassifiedPlan {
  /** Every OPEN task on the register, each with the ruled reason. */
  readonly retire: readonly PlannedRetirement[];
  /**
   * Tasks in a TERMINAL state (`COMPLETED`, `RETIRED`, `NOT_APPLICABLE`), reported and left
   * exactly as they are.
   *
   * ⚠ A COMPLETED TASK IS NOT RETIRED BY THIS ACT, and the ruling's own wording is the authority:
   * it retires *"the open tasks"*. A discharged duty is a fact about what was actually done — an
   * endowment that filed its annual statements did file them, whatever is later discovered about
   * its classification. Retiring those rows would rewrite the record of performed work, and
   * `compliance_task_retirement_terminal` would refuse it anyway (RETIRED is terminal and
   * COMPLETED is not a legal source for it).
   */
  readonly untouched: readonly ExistingTaskRef[];
}

/**
 * Plans the register side of a return to `NOT_CLASSIFIED`: every open task retires with the ruled
 * reason, nothing instantiates, terminal rows are untouched.
 *
 * Pure and total — it takes the register as it is and returns a plan. The AUTHORITY for the act
 * (the maker≠checker reserved-matter approval the owner's fourth-batch ruling demands) is enforced
 * at the procedure and at the database, not here: a pure planner that could refuse on authority
 * would be a second, weaker copy of a control that already exists in the layer that survives raw
 * SQL.
 */
export function planReturnToNotClassified(
  existingTasks: readonly ExistingTaskRef[],
): ReturnToNotClassifiedPlan {
  const retire: PlannedRetirement[] = [];
  const untouched: ExistingTaskRef[] = [];

  for (const task of existingTasks) {
    if (isOpenTaskStatus(task.status)) {
      retire.push({
        taskId: task.id,
        templateCode: task.templateCode,
        retiredReason: RETURN_TO_NOT_CLASSIFIED_RETIREMENT_REASON,
      });
    } else {
      untouched.push(task);
    }
  }

  return Object.freeze({
    retire: Object.freeze(retire),
    untouched: Object.freeze(untouched),
  });
}
