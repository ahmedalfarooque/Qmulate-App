/**
 * `compliance` — §09 Engine A's SECOND HALF: the per-endowment task register
 * (E7-completion stage; owner sequencing ruling 2026-08-24, memo "S8 addendum, sequencing").
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SURFACE DOES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  · `instantiateRegister` — the ONE-TIME setup act (§09: "On endowment setup …, once
 *    classification is set, the engine materialises one `ComplianceTask` per applicable
 *    template"). Exit clause A1's procedure. Re-running it is refused: after setup, the register
 *    changes only through `classification.reclassify`'s diff (A3/A4) — a second "initial setup"
 *    is a fabricated occasion.
 *  · `tasks` — the endowment's task board, `compliance:task:read`. The AML compartment applies
 *    (`amlClause` filters `confidentiality` in the scoping extension), so an AML-attributable task
 *    is invisible to a non-member — the same 46-vs-45 shape as the obligation register.
 *
 * The PLAN is `@qmulate/domain`'s `planRegisterInstantiation`, fed the SAME partition the register
 * screen reads (`obligationsForClassification`), so what instantiates can never disagree with what
 * `classification.applicableObligations` showed — the one-resolver principle.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE LEDGER FACT, AND WHAT THIS FILE DOES NOT DECIDE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09's `has_income` gate (and its one income-conditional cell, `SMALL_DIRECT` at
 * `DIRECT_UTILIZATION` — exit clause A6) is a fact about the LEDGER. An instantiation is an ACT at
 * an instant, so — unlike the period-less read endpoints, which report those rows UNDECIDED — this
 * procedure consults the ledger and decides them: {@link INCOME_FACT_BASIS} states the basis (§09
 * A6's own wording is period-less: "the waqf records income/expense"), it travels on the wire and
 * into the audit trail, and it is engineering's reading, TODO(surface)-flagged below. *Which
 * period a periodic register answers for* stays the open product question stage 9 surfaced —
 * nothing here answers it.
 *
 * TODO(surface): the instantiation-time income basis is "≥ 1 non-deleted ledger row on the
 * endowment at the instant of the act". If the owner rules a different basis (e.g. the current
 * fiscal year), the ONE place to change is {@link hasIncomeAtInstant} below — and it really is
 * one place: `classification.reclassify` imports the same function. *(The first shipped docblock
 * NAMED this function while the basis was actually inlined at two call sites — the
 * false-correctness-comment class's fifth instance on this record, found by the orchestrator's
 * independent verification of `d76e13e` before it could split the fact across the reclassify
 * path. The extraction below is what makes the sentence true.)*
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY ONLY THE CANONICAL LIBRARY VERSION INSTANTIATES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The database also holds ten `SEED-*` placeholder rows at `libraryVersion 'fixture-derived'` —
 * FK anchors for the fixture's hand-seeded tasks, "placeholders, not a published library" by their
 * own doc. Instantiating from them would materialise duties nobody published. So the engine reads
 * rows at `OBLIGATION_LIBRARY_VERSION` only (a version bump ships code + seed together, per S8-Q5's
 * new-row-per-version design), refuses if that version is absent, and reports — never manages —
 * open tasks it cannot attribute to that catalogue (`unknownOpen`).
 */

import {
  OBLIGATION_LIBRARY,
  OBLIGATION_LIBRARY_VERSION,
  REGISTER_INSTANTIATION_REASONS,
  isRegisterInstantiationReason,
  planRegisterInstantiation,
} from '@qmulate/domain/compliance';
import type { ExistingTaskRef, RegisterInstantiationPlan } from '@qmulate/domain/compliance';
import { obligationsForClassification } from '@qmulate/domain/classification';
import type { GatedObligation, WaqfClassification } from '@qmulate/domain/classification';
import { z } from 'zod';

import { approvalFingerprint, recordEvent, type ExtendedPrismaClient } from '@qmulate/database';

import { ApiError } from '../errors.js';
import { toActorContext } from '../context.js';
import { auditedWrite } from '../middleware/audit-projection.js';
import { endowmentScopedProcedure, makerProcedure, router } from '../trpc.js';
import { mintApprovalRequest } from './reservedMatter.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The ledger fact
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** On the wire and in the trail beside every decision the fact produced. Engineering voice. */
export const INCOME_FACT_BASIS =
  'hasIncome basis: >= 1 non-deleted ledger row on the endowment at the instant of instantiation ' +
  '(§09 A6\'s period-less wording, "the waqf records income/expense"). Engineering\'s reading, ' +
  'flagged TODO(surface); which period a PERIODIC register answers for remains the open product ' +
  'question and is not answered here.';

/**
 * THE basis, as code — the one place the TODO(surface) above promises the owner. Both consumers
 * (`compliance.instantiateRegister` and `classification.reclassify`'s task diff + reported delta)
 * call this; a ruled change lands here and reaches every instantiation-time decision at once.
 */
export async function hasIncomeAtInstant(
  db: { transaction: { count: (args: unknown) => Promise<number> } },
  waqfId: string,
): Promise<boolean> {
  return (await db.transaction.count({ where: { waqfId, deletedAt: null } })) > 0;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Shared plumbing
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const CANONICAL_OBLIGATION_SELECT = {
  id: true,
  code: true,
  libraryVersion: true,
  confidentiality: true,
  section: true,
  workstreamAr: true,
  workstreamEn: true,
  titleAr: true,
  titleEn: true,
  gate: true,
  deadlineRuleKey: true,
} as const;

interface CanonicalObligationRow {
  id: string;
  code: string;
  libraryVersion: string;
  confidentiality: unknown;
  section: unknown;
  workstreamAr: string;
  workstreamEn: string;
  titleAr: string;
  titleEn: string;
  gate: unknown;
  deadlineRuleKey: string | null;
}

/**
 * ⚠ THE RECURRENCE COMES FROM THE CODE CATALOGUE, NOT THE DATABASE — because the database
 * deliberately does not store it: `recurrence` sits in `OBLIGATION_TEMPLATE_SCHEMA_DELTA`, the
 * declared list of §09 fields the library table never populates (a delta whose parity test goes
 * RED the day the column ships, at which point this map dies and the SELECT above gains the
 * column). The join is legitimate at exactly ONE version: the engine instantiates only at
 * `OBLIGATION_LIBRARY_VERSION`, the seed writes those rows FROM this catalogue, and stage 2/9's
 * byte-fidelity checks pin the two together. A DB row at that version whose code this map cannot
 * answer is DRIFT and refuses below (`TEMPLATE_FACTS_MISSING` via a null-recurrence entry would
 * silently pre-materialise an event template, which is the failure the EVENT skip exists to stop).
 */
const RECURRENCE_BY_CANONICAL_CODE: ReadonlyMap<string, string | null> = new Map(
  OBLIGATION_LIBRARY.map((row) => [row.code, row.recurrence]),
);

function templateFactsFor(
  waqfId: string,
  canonical: readonly CanonicalObligationRow[],
): { code: string; libraryVersion: string; recurrence: never }[] {
  const drifted = canonical
    .filter((row) => !RECURRENCE_BY_CANONICAL_CODE.has(row.code))
    .map((row) => row.code);
  if (drifted.length > 0) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `database rows at library version ${OBLIGATION_LIBRARY_VERSION} carry codes the code ` +
        `catalogue does not: ${drifted.join(', ')}. The recurrence (which decides §09's ` +
        `never-pre-materialise rule for EVENT templates) is unreadable for them, so instantiation ` +
        `refuses rather than guessing.`,
      { waqfId, drifted },
    );
  }
  return canonical.map((row) => ({
    code: row.code,
    libraryVersion: row.libraryVersion,
    recurrence: (RECURRENCE_BY_CANONICAL_CODE.get(row.code) ?? null) as never,
  }));
}

function toGatedObligation(row: CanonicalObligationRow): GatedObligation {
  return {
    code: row.code,
    gate: String(row.gate),
    section: String(row.section),
    workstreamAr: row.workstreamAr,
    workstreamEn: row.workstreamEn,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    deadlineRuleKey: row.deadlineRuleKey,
  };
}

const TASK_SELECT = {
  id: true,
  templateCode: true,
  templateVersion: true,
  status: true,
  confidentiality: true,
  owner: true,
  startDate: true,
  closeDate: true,
  notes: true,
  classificationAtInstantiation: true,
  instantiatedReason: true,
  retiredReason: true,
  retiredAt: true,
} as const;

/** Map a planner refusal to an ApiError. One place, so every caller's message names the subjects. */
function refuseFromPlan(
  waqfId: string,
  plan: Extract<RegisterInstantiationPlan, { planned: false }>,
): never {
  const subjects = plan.subjects.join(', ');
  const messages: Record<typeof plan.refusal, string> = {
    REGISTER_LOCKED_NOT_CLASSIFIED:
      `waqf ${waqfId} is NOT_CLASSIFIED: the register is LOCKED and no tasks are materialised ` +
      `(§09 A2; S8-Q4). Record the real classification via classification.reclassify first — ` +
      `that transition reports the incoming class's full obligation set and is the lock's one exit.`,
    UNRECOGNISED_GATE_ROWS:
      `catalogue rows carry an unrecognised classificationGate and instantiation refuses rather ` +
      `than silently dropping a duty (BR-104): ${subjects}. Fix the catalogue rows.`,
    RETIRED_GATE_ROWS:
      `catalogue rows are written against a RETIRED gate (S8-Q3, refused-not-remapped): ` +
      `${subjects}. Re-gate them to a gate still in service.`,
    INCOME_FACT_MISSING_AT_INSTANTIATION:
      `the ledger fact could not be supplied for: ${subjects}. This is a defect in this procedure ` +
      `— it always computes the fact — so its appearance means the computation was skipped.`,
    TEMPLATE_FACTS_MISSING:
      `applicable obligations have no template facts at library version ` +
      `${OBLIGATION_LIBRARY_VERSION}: ${subjects}. The recurrence is unreadable, so the ` +
      `never-pre-materialise rule for EVENT templates (§09) cannot be answered.`,
    DUPLICATE_TEMPLATE_CODE:
      `more than one template facts row per code: ${subjects}. Instantiating from either would ` +
      `freeze an arbitrary templateVersion into the task's snapshot (S8-Q5).`,
    RECLASSIFICATION_CONTEXT_MISSING: `a RECLASSIFICATION plan was requested without the from→to transition. Defect in the caller.`,
  };
  throw new ApiError('GATE_NOT_CLEARED', messages[plan.refusal], {
    waqfId,
    refusal: plan.refusal,
    subjects: [...plan.subjects],
  });
}

/**
 * Everything `classification.reclassify` needs to apply the §09 task diff inside ITS transaction —
 * exported for that one caller, so the two procedures share one implementation of the plan-and-
 * write step and cannot drift. Returns `null` when the endowment's register was never
 * engine-instantiated: §09's reclassification clauses diff a GENERATED register; on a pre-engine
 * endowment (the fixture's hand-seeded rows) there is nothing the engine may honestly retire, and
 * the caller reports `taskDiff.applied: false` instead.
 */
export async function planReclassificationTaskDiff(
  db: {
    complianceTask: {
      findFirst: (args: unknown) => Promise<unknown>;
      findMany: (args: unknown) => Promise<unknown>;
    };
    complianceObligation: { findMany: (args: unknown) => Promise<unknown> };
  },
  waqfId: string,
  transition: { from: WaqfClassification; to: WaqfClassification },
  /** Computed ONCE by the caller (which also feeds it to the reported delta) — one fact, one read. */
  hasIncome: boolean,
  /**
   * ⊕ S9-4a — the usage axis, READ ONCE BY THE CALLER for `hasIncome`'s reason and passed in rather
   * than read here: this function's `db` parameter is deliberately a structural minimum (two
   * delegates), and widening it to reach `waqf` would give a task-diff planner access to the
   * endowment record it has no business reading. `null` = UNRECORDED, never coerced.
   */
  directUtilization: boolean | null,
): Promise<{
  plan: Extract<RegisterInstantiationPlan, { planned: true }>;
  obligationIdByCode: ReadonlyMap<string, { id: string; confidentiality: string }>;
  hasIncome: boolean;
} | null> {
  // ⊕ S11 — a REGISTER exists iff a task carries a register-instantiation reason. An EVENT_TRIGGER
  // duty alone (a sweep-raised GOV-REG-02) is not a register, and reclassifying an endowment that has
  // none is INITIAL_SETUP's occasion, not a diff (the E11 defect, fixed at all three predicates).
  const engineRow = await db.complianceTask.findFirst({
    where: { waqfId, instantiatedReason: { in: [...REGISTER_INSTANTIATION_REASONS] } },
    select: { id: true },
  });
  if (engineRow === null) return null;

  const canonical = (await db.complianceObligation.findMany({
    where: { libraryVersion: OBLIGATION_LIBRARY_VERSION, deletedAt: null },
    select: CANONICAL_OBLIGATION_SELECT,
    orderBy: { code: 'asc' },
  })) as CanonicalObligationRow[];

  const partition = obligationsForClassification({
    classification: transition.to,
    catalogue: canonical.map(toGatedObligation),
    hasIncomeInPeriod: hasIncome,
    // ⊕ S9-4a — a reclassification changes the SIZE axis; the usage axis is unchanged by it, so the
    // same recorded value applies to both sides of the diff.
    directUtilization,
  });
  const existingTasks = (await db.complianceTask.findMany({
    where: { waqfId },
    select: { id: true, templateCode: true, templateVersion: true, status: true },
    orderBy: { id: 'asc' },
  })) as ExistingTaskRef[];

  const plan = planRegisterInstantiation({
    occasion: 'RECLASSIFICATION',
    partition,
    templates: templateFactsFor(waqfId, canonical),
    existingTasks,
    reclassification: transition,
  });
  if (!plan.planned) refuseFromPlan(waqfId, plan);

  return {
    plan: plan as Extract<RegisterInstantiationPlan, { planned: true }>,
    obligationIdByCode: new Map(
      canonical.map((row) => [
        row.code,
        { id: row.id, confidentiality: String(row.confidentiality) },
      ]),
    ),
    hasIncome,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The router
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⊕ S9-4a — read the endowment's USAGE AXIS (ذات انتفاع مباشر).
 *
 * ⚠ Returns `null` when unrecorded and NEVER coerces it. The owner's ruling is explicit — *"an
 * endowment whose usage is unrecorded is UNRECORDED, not 'not direct'"* — and
 * `obligationsForClassification` reports such rows in `directUseFactMissing` rather than deciding
 * them. A `?? false` here would be the single line that undoes the whole separation of the two axes.
 */
async function readDirectUtilization(
  db: ExtendedPrismaClient,
  waqfId: string,
): Promise<boolean | null> {
  const waqf = await db.waqf.findFirst({
    where: { id: waqfId, deletedAt: null },
    select: { directUtilization: true },
  });
  return waqf?.directUtilization ?? null;
}

export const complianceRouter = router({
  /**
   * The endowment's task board. The AML compartment applies through the scoping extension's
   * `amlClause` on `confidentiality` — a non-member's board simply has no AML-attributable row,
   * which is S8-Q1's shape on the TASK plane (the obligation plane's 46-vs-45 read, one table
   * over). Enum-ish columns cross the wire as strings; the transport never narrows them.
   */
  tasks: endowmentScopedProcedure('compliance:task:read').query(async ({ ctx }) => {
    const rows = await ctx.db.complianceTask.findMany({
      where: { waqfId: ctx.waqfId },
      select: TASK_SELECT,
      orderBy: [{ templateCode: 'asc' }, { id: 'asc' }],
    });
    return {
      tasks: rows.map((row) => ({
        id: row.id,
        templateCode: row.templateCode,
        templateVersion: row.templateVersion,
        status: String(row.status),
        owner: row.owner,
        startDate: row.startDate?.toISOString() ?? null,
        closeDate: row.closeDate?.toISOString() ?? null,
        notes: row.notes,
        classificationAtInstantiation:
          row.classificationAtInstantiation === null
            ? null
            : String(row.classificationAtInstantiation),
        instantiatedReason: row.instantiatedReason === null ? null : String(row.instantiatedReason),
        retiredReason: row.retiredReason,
        retiredAt: row.retiredAt?.toISOString() ?? null,
      })),
    };
  }),

  /**
   * ⊕ S11 item 2a — KPI 4 ("no missed AML/CTF reports") as a BOOLEAN that may render for EVERY viewer.
   *
   * §14:76 — the chip must render even for non-compartment viewers, "or its absence would tip off",
   * resolving from a compartment-computed boolean. A boolean cannot leak rows, which is why the
   * indicator may be shown to someone who may not see what is behind it. THIS PROCEDURE READS NO
   * COMPARTMENT ROW AT ALL — because there is nothing yet to compute: `GOV-AML-02` is `AML_IMMEDIATE`,
   * a non-clock, and no model records that a report was DUE and not filed. So `missedReports` is
   * `null` with the reason, for members and non-members alike, and the chip renders `warning`
   * (indeterminate ≠ green) — never a green nobody computed. When a definition of "due" exists, the
   * boolean is computed INSIDE the compartment and only the boolean leaves it.
   */
  amlKpi: endowmentScopedProcedure('compliance:task:read').query(({ ctx }) => ({
    waqfId: ctx.waqfId,
    /** `true` = a report was due and not filed · `false` = none missed · `null` = not assessable. */
    missedReports: null as boolean | null,
    assessable: false as const,
    reason: 'AML_TIMELINESS_NOT_MODELLED' as const,
  })),

  /**
   * A1's act: generate the register. Maker rung (`compliance:task:write`); the DELTA of a later
   * reclassification is authorised by THAT procedure's own gate — this one refuses to run twice.
   */
  instantiateRegister: makerProcedure('compliance:task:write').mutation(async ({ ctx }) => {
    const waqf = await ctx.db.waqf.findFirst({
      where: { id: ctx.waqfId },
      select: { classification: true },
    });
    if (waqf === null) {
      throw new ApiError(
        'NO_GRANT',
        `waqf ${ctx.waqfId} is not visible through this caller's own client. Surfaced as ` +
          `NOT_FOUND so the endowment's existence is not disclosed (§10 §7.2).`,
        { waqfId: ctx.waqfId },
      );
    }

    // ── ONE initial setup per endowment ──────────────────────────────────────────────────────
    // ⊕ S11 (the E11 defect, found by item 2a): this predicate read `instantiatedReason IS NOT NULL`,
    // i.e. "one instantiation event of ANY kind", while the comment above says what it means — ONE
    // INITIAL SETUP. A duty raised by its trigger (`EVENT_TRIGGER`: the certificate sweep, a material
    // change) is not a register, and it can exist BEFORE setup — so an endowment whose certificate
    // expired before its register was generated was refused setup forever, with a message that was
    // false. Now: only the REGISTER-instantiation reasons count, named in the domain and pinned against
    // the enum. The refusal itself is load-bearing (a second setup fabricates an occasion) and stays.
    const alreadyInstantiated = await ctx.db.complianceTask.findFirst({
      where: {
        waqfId: ctx.waqfId,
        instantiatedReason: { in: [...REGISTER_INSTANTIATION_REASONS] },
      },
      select: { id: true, instantiatedReason: true },
      orderBy: { id: 'asc' },
    });
    if (alreadyInstantiated !== null) {
      throw new ApiError(
        'PERMISSION_DENIED',
        `waqf ${ctx.waqfId} already has an engine-instantiated register (task ` +
          `${alreadyInstantiated.id}, reason ${String(alreadyInstantiated.instantiatedReason)}). A ` +
          `second "initial setup" would fabricate an occasion that did not occur; after setup the ` +
          `register changes only through classification.reclassify's add/retire diff (§09 Engine A).`,
        { waqfId: ctx.waqfId },
      );
    }

    // ── The canonical catalogue, and the refusal when it is not there ───────────────────────
    const canonical = (await ctx.db.complianceObligation.findMany({
      where: { libraryVersion: OBLIGATION_LIBRARY_VERSION, deletedAt: null },
      select: CANONICAL_OBLIGATION_SELECT,
      orderBy: { code: 'asc' },
    })) as CanonicalObligationRow[];
    if (canonical.length === 0) {
      throw new ApiError(
        'GATE_NOT_CLEARED',
        `the canonical obligation library (version ${OBLIGATION_LIBRARY_VERSION}) is not in the ` +
          `database — a register instantiated from placeholders would materialise duties nobody ` +
          `published. Seed the library first.`,
        { waqfId: ctx.waqfId, libraryVersion: OBLIGATION_LIBRARY_VERSION },
      );
    }

    // ── The ledger fact, computed — never defaulted, basis declared ─────────────────────────
    const hasIncome = await hasIncomeAtInstant(ctx.db as never, ctx.waqfId);

    const classification = String(waqf.classification) as WaqfClassification;
    const partition = obligationsForClassification({
      classification,
      catalogue: canonical.map(toGatedObligation),
      hasIncomeInPeriod: hasIncome,
      directUtilization: await readDirectUtilization(ctx.db, ctx.waqfId),
    });

    const existingTasks = await ctx.db.complianceTask.findMany({
      where: { waqfId: ctx.waqfId },
      select: { id: true, templateCode: true, templateVersion: true, status: true },
      orderBy: { id: 'asc' },
    });

    const plan = planRegisterInstantiation({
      occasion: 'INITIAL_SETUP',
      partition,
      templates: templateFactsFor(ctx.waqfId, canonical),
      existingTasks: existingTasks as ExistingTaskRef[],
    });
    if (!plan.planned) refuseFromPlan(ctx.waqfId, plan);

    const obligationByCode = new Map(canonical.map((row) => [row.code, row]));

    return auditedWrite(ctx.db, async (tx) => {
      const created: { id: string; templateCode: string }[] = [];
      for (const task of plan.instantiate) {
        // Non-null: the planner's TEMPLATE_FACTS_MISSING refusal proves every code resolves.
        const obligation = obligationByCode.get(task.templateCode) as CanonicalObligationRow;
        const row = await tx.complianceTask.create({
          data: {
            waqfId: ctx.waqfId,
            obligationId: obligation.id,
            templateCode: task.templateCode,
            templateVersion: task.templateVersion,
            // The task INHERITS the template's confidentiality, so a compartmented duty's
            // instance is born inside the compartment. Today this is always NORMAL — the one
            // AML_RESTRICTED template is EVENT-recurrence and never pre-materialises — and the
            // integration suite asserts exactly that, so the day it stops being true is loud.
            confidentiality: obligation.confidentiality as never,
            status: 'NOT_STARTED',
            classificationAtInstantiation: task.classificationAtInstantiation as never,
            instantiatedReason: task.instantiatedReason as never,
            createdBy: ctx.actor.actorId,
          },
          select: { id: true, templateCode: true },
        });
        created.push(row);
      }

      // ONE correlated event for the whole act (the A3 shape, applied to setup): the per-row
      // audit entries carry the same procedure and transaction; this row records the REGISTER
      // generation as a single fact — entity = the register, whose natural key is the endowment.
      await recordEvent(toActorContext(ctx, { procedure: 'compliance.instantiateRegister' }), {
        action: 'CREATE',
        category: 'MUTATION',
        classification: 'ROUTINE',
        entityType: 'ComplianceRegister',
        entityId: ctx.waqfId,
        waqfId: ctx.waqfId,
        extraContext: {
          occasion: 'INITIAL_SETUP',
          classificationAtInstantiation: classification,
          libraryVersion: OBLIGATION_LIBRARY_VERSION,
          instantiated: created.map((row) => row.templateCode),
          skippedEventTemplates: [...plan.skippedEventTemplates],
          keptOpen: plan.keptOpen.map((task) => task.id),
          outOfScopeOpen: plan.outOfScopeOpen.map((task) => task.id),
          unknownOpen: plan.unknownOpen.map((task) => task.id),
          hasIncome,
          incomeFactBasis: INCOME_FACT_BASIS,
        },
      });

      return {
        classification,
        libraryVersion: OBLIGATION_LIBRARY_VERSION,
        instantiated: created,
        skippedEventTemplates: [...plan.skippedEventTemplates],
        keptOpen: plan.keptOpen.map((task) => ({ id: task.id, templateCode: task.templateCode })),
        outOfScopeOpen: plan.outOfScopeOpen.map((task) => ({
          id: task.id,
          templateCode: task.templateCode,
        })),
        unknownOpen: plan.unknownOpen.map((task) => ({
          id: task.id,
          templateCode: task.templateCode,
        })),
        hasIncome,
        incomeFactBasis: INCOME_FACT_BASIS,
      };
    });
  }),

  /**
   * S9-3b step 1 — "apply library vN to this register", the REQUEST half.
   *
   * **Owner ruling (2026-08-25, S9 first batch, recorded `e808bb6`):** a version bump changes only
   * future instantiations; attaching newly-in-scope templates to an ALREADY-instantiated register
   * is an explicit per-endowment maker≠checker act, reason `LIBRARY_UPGRADE`, reusing the
   * reclassify diff shape — and NOTHING retires implicitly (out-of-scope open tasks are REPORTED,
   * exactly as on setup; retirement stays reclassification's alone).
   *
   * The plan is derived HERE and its code set is hashed into the approval payload, so the checker
   * signs the exact duty set that will attach; `applyLibraryUpgrade` re-derives and refuses on
   * drift. A no-op upgrade (nothing newly in scope) REFUSES rather than minting — an approval for
   * nothing fabricates an occasion.
   *
   * ⚠ AML-SILENCE HOLDS ON THIS WIRE SHAPE: the catalogue read goes through the caller's own
   * compartment-filtered client, so a non-member's plan (and the approval payload it hashes)
   * never names `GOV-AML-02` even in a skip list — the S8-Q1 property, inherited structurally.
   */
  requestLibraryUpgrade: makerProcedure('compliance:task:write').mutation(async ({ ctx }) => {
    const upgrade = await assembleUpgradePlan(ctx.db, ctx.waqfId);
    const minted = await mintApprovalRequest(ctx as never, {
      waqfId: ctx.waqfId,
      type: 'LIBRARY_UPGRADE',
      subjectId: `library:${OBLIGATION_LIBRARY_VERSION}`,
      payload: upgradePayload(ctx.waqfId, upgrade),
      procedure: 'compliance.requestLibraryUpgrade',
    });
    return {
      approvalRequestId: minted.approvalRequestId,
      status: minted.status,
      toVersion: OBLIGATION_LIBRARY_VERSION,
      willInstantiate: upgrade.plan.instantiate.map((task) => task.templateCode),
      skippedEventTemplates: [...upgrade.plan.skippedEventTemplates],
      outOfScopeOpen: upgrade.plan.outOfScopeOpen.map((task) => ({
        id: task.id,
        templateCode: task.templateCode,
      })),
    };
  }),

  /**
   * S9-3b step 2 — the APPLY half, consuming the approval.
   *
   * Order inside the transaction is load-bearing (the migration-35/filing shape): the TASKS
   * insert first, while the approval is still `APPROVED` — migration 39's `BEFORE INSERT`
   * trigger re-verifies the authority at each row — and the approval is marked `EXECUTED` last,
   * so it can never authorise a second attachment. The plan is RE-DERIVED at apply time and its
   * fingerprint compared to what the checker signed: a register or catalogue that moved since
   * approval refuses as stale rather than attaching a set nobody signed.
   */
  applyLibraryUpgrade: makerProcedure('compliance:task:write')
    .input(z.object({ approvalRequestId: z.string().min(1).max(128) }))
    .mutation(async ({ ctx, input }) => {
      const upgrade = await assembleUpgradePlan(ctx.db, ctx.waqfId);

      const approval = await ctx.db.approvalRequest.findFirst({
        where: { id: input.approvalRequestId, waqfId: ctx.waqfId },
        select: { id: true, type: true, status: true, subjectId: true, payloadHash: true },
      });
      if (approval === null) {
        throw new ApiError(
          'NO_GRANT',
          `approval_request ${input.approvalRequestId} is not visible on waqf ${ctx.waqfId} — ` +
            `attaching new duties needs an APPROVED maker≠checker LIBRARY_UPGRADE approval.`,
          { waqfId: ctx.waqfId, approvalRequestId: input.approvalRequestId },
        );
      }
      if (
        String(approval.type) !== 'LIBRARY_UPGRADE' ||
        String(approval.status) !== 'APPROVED' ||
        approval.subjectId !== `library:${OBLIGATION_LIBRARY_VERSION}`
      ) {
        throw new ApiError(
          'APPROVAL_STALE',
          `approval_request ${input.approvalRequestId} does not authorise applying library ` +
            `${OBLIGATION_LIBRARY_VERSION} to this register (type=${String(approval.type)}, ` +
            `status=${String(approval.status)}, subject=${String(approval.subjectId)}).`,
          { reason: 'NOT_OPEN', waqfId: ctx.waqfId },
        );
      }
      // The checker signed a specific duty set. Re-derive and compare fingerprints — a moved
      // register (a task instantiated meanwhile) or a moved catalogue must refuse, not attach.
      const expectedHash = approvalFingerprint(upgradePayload(ctx.waqfId, upgrade));
      if (expectedHash !== approval.payloadHash) {
        throw new ApiError(
          'APPROVAL_STALE',
          `the register or catalogue moved since approval ${input.approvalRequestId} was signed: ` +
            `the re-derived upgrade plan no longer matches the approved one. Re-request the ` +
            `upgrade so the checker signs what will actually attach.`,
          { reason: 'FINGERPRINT_MISMATCH', waqfId: ctx.waqfId },
        );
      }

      const obligationByCode = new Map(upgrade.canonical.map((row) => [row.code, row]));
      return auditedWrite(ctx.db, async (tx) => {
        const created: { id: string; templateCode: string }[] = [];
        for (const task of upgrade.plan.instantiate) {
          const obligation = obligationByCode.get(task.templateCode) as CanonicalObligationRow;
          const row = await tx.complianceTask.create({
            data: {
              waqfId: ctx.waqfId,
              obligationId: obligation.id,
              templateCode: task.templateCode,
              templateVersion: task.templateVersion,
              confidentiality: obligation.confidentiality as never,
              status: 'NOT_STARTED',
              classificationAtInstantiation: task.classificationAtInstantiation as never,
              instantiatedReason: 'LIBRARY_UPGRADE' as never,
              instantiatedByApprovalId: approval.id,
              createdBy: ctx.actor.actorId,
            },
            select: { id: true, templateCode: true },
          });
          created.push(row);
        }

        // Spend LAST: the row inserts above were verified by migration 39's trigger while the
        // approval was still APPROVED; marking it EXECUTED here closes it against a second act.
        await tx.approvalRequest.update({
          where: { id: approval.id },
          data: { status: 'EXECUTED' },
        });

        await recordEvent(toActorContext(ctx, { procedure: 'compliance.applyLibraryUpgrade' }), {
          action: 'CREATE',
          category: 'MUTATION',
          classification: 'ROUTINE',
          entityType: 'ComplianceRegister',
          entityId: ctx.waqfId,
          waqfId: ctx.waqfId,
          extraContext: {
            occasion: 'LIBRARY_UPGRADE',
            approvalRequestId: approval.id,
            toVersion: OBLIGATION_LIBRARY_VERSION,
            instantiated: created.map((row) => row.templateCode),
            skippedEventTemplates: [...upgrade.plan.skippedEventTemplates],
            outOfScopeOpen: upgrade.plan.outOfScopeOpen.map((task) => task.id),
            hasIncome: upgrade.hasIncome,
            incomeFactBasis: INCOME_FACT_BASIS,
          },
        });

        return {
          toVersion: OBLIGATION_LIBRARY_VERSION,
          instantiated: created,
          approvalRequestId: approval.id,
          approvalStatus: 'EXECUTED' as const,
          outOfScopeOpen: upgrade.plan.outOfScopeOpen.map((task) => ({
            id: task.id,
            templateCode: task.templateCode,
          })),
        };
      });
    }),
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * S9-3b — the upgrade plan, derived once per act and signed as a set
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface UpgradePlanBundle {
  readonly classification: WaqfClassification;
  readonly hasIncome: boolean;
  readonly canonical: readonly CanonicalObligationRow[];
  readonly plan: Extract<RegisterInstantiationPlan, { planned: true }>;
}

/**
 * Derive the LIBRARY_UPGRADE diff over the caller's own compartment-filtered client. Refuses:
 * a never-instantiated register (that is INITIAL_SETUP's occasion, not an upgrade's) and a
 * no-op plan (an approval for nothing fabricates an occasion).
 */
async function assembleUpgradePlan(
  db: ExtendedPrismaClient,
  waqfId: string,
): Promise<UpgradePlanBundle> {
  const waqf = await db.waqf.findFirst({
    where: { id: waqfId },
    select: { classification: true },
  });
  if (waqf === null) {
    throw new ApiError(
      'NO_GRANT',
      `waqf ${waqfId} is not visible through this caller's own client.`,
      {
        waqfId,
      },
    );
  }
  const existingTasks = await db.complianceTask.findMany({
    where: { waqfId },
    select: {
      id: true,
      templateCode: true,
      templateVersion: true,
      status: true,
      instantiatedReason: true,
    },
    orderBy: { id: 'asc' },
  });
  // ⊕ S11 — the same predicate as initial setup's, from the other side: an upgrade attaches duties
  // to an EXISTING register, and a sweep-raised EVENT_TRIGGER duty is not one.
  const engineInstantiated = (
    existingTasks as (ExistingTaskRef & { instantiatedReason: string | null })[]
  ).some((task) => isRegisterInstantiationReason(task.instantiatedReason));
  if (!engineInstantiated) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `waqf ${waqfId} has no engine-instantiated register — a library upgrade attaches new ` +
        `duties to an EXISTING register (owner ruling 2026-08-25). Run ` +
        `compliance.instantiateRegister first; initial setup already lands at the current version.`,
      { waqfId },
    );
  }

  const canonical = await db.complianceObligation.findMany({
    where: { libraryVersion: OBLIGATION_LIBRARY_VERSION, deletedAt: null },
    select: CANONICAL_OBLIGATION_SELECT,
    orderBy: { code: 'asc' },
  });
  if (canonical.length === 0) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `the canonical obligation library (version ${OBLIGATION_LIBRARY_VERSION}) is not in the ` +
        `database — nothing exists to upgrade to. Seed the library first.`,
      { waqfId, libraryVersion: OBLIGATION_LIBRARY_VERSION },
    );
  }

  const hasIncome = await hasIncomeAtInstant(db as never, waqfId);
  const classification = String(waqf.classification) as WaqfClassification;
  const partition = obligationsForClassification({
    classification,
    catalogue: canonical.map(toGatedObligation),
    hasIncomeInPeriod: hasIncome,
    directUtilization: await readDirectUtilization(db, waqfId),
  });
  const plan = planRegisterInstantiation({
    occasion: 'LIBRARY_UPGRADE',
    partition,
    templates: templateFactsFor(waqfId, canonical),
    existingTasks: existingTasks as ExistingTaskRef[],
  });
  if (!plan.planned) refuseFromPlan(waqfId, plan);
  const planned = plan as Extract<RegisterInstantiationPlan, { planned: true }>;
  if (planned.instantiate.length === 0) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `nothing is newly in scope for waqf ${waqfId} at library ${OBLIGATION_LIBRARY_VERSION} ` +
        `— the register already carries every applicable duty, so there is no act to approve. ` +
        `Minting an approval for a no-op would fabricate an occasion.`,
      { waqfId, libraryVersion: OBLIGATION_LIBRARY_VERSION },
    );
  }
  return { classification, hasIncome, canonical, plan: planned };
}

/** The exact object the checker signs — one spelling, hashed by the ONE fingerprint. */
function upgradePayload(waqfId: string, upgrade: UpgradePlanBundle) {
  return {
    act: 'LIBRARY_UPGRADE',
    waqfId,
    toVersion: OBLIGATION_LIBRARY_VERSION,
    classification: upgrade.classification,
    hasIncome: upgrade.hasIncome,
    codes: upgrade.plan.instantiate.map((task) => task.templateCode).sort(),
  };
}
