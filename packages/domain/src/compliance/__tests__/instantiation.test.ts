/**
 * `instantiation.test.ts` — the per-endowment task-instantiation planner (§09 Engine A's second
 * half; E7-completion stage, owner sequencing ruling 2026-08-24).
 *
 * What this file proves, and from which side:
 *
 *  · the EVENT skip is DERIVED (`recurrence === 'EVENT'`) and the derivation still contains every
 *    code §09's own not-pre-materialised list names — measured over the REAL catalogue, so a
 *    catalogue edit that moved `GOV-AML-02` to `ONGOING` (pre-materialising an AML-attributable
 *    task onto every board) turns this file red;
 *  · every refusal refuses, NAMING its subjects — and the liveness half: a clean, decided
 *    partition on a real classification always plans (the S8 lesson: a fail-closed control that
 *    denies the entitled caller is an outage that reads as safety);
 *  · the §09 diff clauses, each in its own direction: newly-in-scope instantiates with the right
 *    identity, newly-out-of-scope retires WITH §09's own reason string at RECLASSIFICATION and is
 *    only REPORTED at INITIAL_SETUP, still-in-scope is untouched, and rows the planner cannot
 *    attribute to its catalogue (the fixture's pre-engine `SEED-*` tasks) are never managed;
 *  · `TASK_INSTANTIATION_REASONS` is parity-pinned against `schema.prisma`'s
 *    `TaskInstantiationReason` (the pure module spells it; the database owns it).
 *
 * All rows invented — no client data.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { obligationsForClassification } from '../../classification/gating.js';
import type { GatedObligation } from '../../classification/contract.js';
import { OBLIGATION_LIBRARY } from '../catalogue.js';
import {
  EVENT_TEMPLATE_CODES_PER_SPEC,
  OPEN_TASK_STATUSES,
  TASK_INSTANTIATION_REASONS,
  RETURN_TO_NOT_CLASSIFIED_RETIREMENT_REASON,
  isOpenTaskStatus,
  planRegisterInstantiation,
  planReturnToNotClassified,
} from '../instantiation.js';
import type {
  ExistingTaskRef,
  InstantiableTemplateFacts,
  RegisterInstantiationPlan,
} from '../instantiation.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Invented inputs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const LIBRARY_VERSION = 'test-lib.1';

const gated = (code: string, gate: string): GatedObligation => ({
  code,
  gate,
  section: 'FINANCIAL',
  workstreamAr: 'الرقابة المالية',
  workstreamEn: 'Financial oversight',
  titleAr: 'التزام تنظيمي (بيانات تجريبية)',
  titleEn: 'Regulatory obligation (invented fixture)',
  deadlineRuleKey: null,
});

const facts = (
  code: string,
  recurrence: InstantiableTemplateFacts['recurrence'] = 'ONGOING',
): InstantiableTemplateFacts => ({ code, libraryVersion: LIBRARY_VERSION, recurrence });

/** Five gates' worth of catalogue: one ALL, one LARGE_MEDIUM, one SMALL_DIRECT, one EVENT, one HAS_INCOME. */
const CATALOGUE: readonly GatedObligation[] = Object.freeze([
  gated('T-BASELINE', 'ALL'),
  gated('T-AUDIT', 'LARGE_MEDIUM'),
  gated('T-SIMPLIFIED', 'SMALL_DIRECT'),
  gated('T-PER-EVENT', 'ALL'), // recurrence EVENT below — gate applies, task never pre-materialises
  gated('T-LEDGER', 'HAS_INCOME'),
]);

const TEMPLATES: readonly InstantiableTemplateFacts[] = Object.freeze([
  facts('T-BASELINE'),
  facts('T-AUDIT', 'ANNUAL'),
  facts('T-SIMPLIFIED', 'ANNUAL'),
  facts('T-PER-EVENT', 'EVENT'),
  facts('T-LEDGER'),
]);

const openTask = (id: string, templateCode: string, status = 'NOT_STARTED'): ExistingTaskRef => ({
  id,
  templateCode,
  templateVersion: LIBRARY_VERSION,
  status,
});

function partitionAt(
  classification: 'LARGE' | 'MEDIUM' | 'SMALL' | 'SMALL' | 'NOT_CLASSIFIED',
  hasIncomeInPeriod?: boolean | null,
) {
  // ⊕ S9-4a — `directUtilization: false` stated explicitly. These tests are about SIZE gating, and
  // "not direct use" is the condition under which the size answer stands alone; omitting it would
  // leave every usage-sensitive row undecided in `directUseFactMissing` and make the partitions here
  // silently incomplete.
  return obligationsForClassification({
    classification,
    catalogue: CATALOGUE,
    hasIncomeInPeriod,
    directUtilization: false,
  });
}

function planned(
  plan: RegisterInstantiationPlan,
): Extract<RegisterInstantiationPlan, { planned: true }> {
  expect(
    plan.planned,
    plan.planned ? '' : `refused: ${(plan as { refusal: string }).refusal}`,
  ).toBe(true);
  return plan as Extract<RegisterInstantiationPlan, { planned: true }>;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The EVENT derivation, over the REAL catalogue
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the EVENT skip is derived, and the derivation covers §09’s own list', () => {
  const derived = OBLIGATION_LIBRARY.filter((row) => row.recurrence === 'EVENT').map(
    (row) => row.code,
  );

  it('every code §09 names as not-pre-materialised derives as EVENT', () => {
    for (const code of EVENT_TEMPLATE_CODES_PER_SPEC) {
      expect(derived, `§09 names ${code} as raised-on-trigger`).toContain(code);
    }
  });

  it('the derivation is the pinned seven — §09’s five plus the catalogue’s two compressions', () => {
    // FIN-DIST-02's own catalogue comment: "§09's cell reads `per run`; compressed to EVENT".
    // GOV-RGL-01 is the same shape. A hand-list from §09 would have pre-materialised both.
    expect([...derived].sort()).toEqual(
      [...EVENT_TEMPLATE_CODES_PER_SPEC, 'FIN-DIST-02', 'GOV-RGL-01'].sort(),
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Refusals — each naming its subjects — and the liveness half
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('refusals', () => {
  it('a LOCKED register plans nothing: REGISTER_LOCKED_NOT_CLASSIFIED (A2)', () => {
    const plan = planRegisterInstantiation({
      occasion: 'INITIAL_SETUP',
      partition: partitionAt('NOT_CLASSIFIED', true),
      templates: TEMPLATES,
      existingTasks: [],
    });
    expect(plan).toMatchObject({ planned: false, refusal: 'REGISTER_LOCKED_NOT_CLASSIFIED' });
  });

  it('an UNDECIDED ledger row refuses instantiation, naming the undecided codes', () => {
    // The register READ may report undecided rows; an INSTANTIATION may not materialise them.
    const plan = planRegisterInstantiation({
      occasion: 'INITIAL_SETUP',
      partition: partitionAt('MEDIUM'), // no fact supplied → T-LEDGER undecided
      templates: TEMPLATES,
      existingTasks: [],
    });
    expect(plan).toMatchObject({
      planned: false,
      refusal: 'INCOME_FACT_MISSING_AT_INSTANTIATION',
      subjects: ['T-LEDGER'],
    });
  });

  it('an applicable code with no template facts refuses: the EVENT skip would be unanswerable', () => {
    const plan = planRegisterInstantiation({
      occasion: 'INITIAL_SETUP',
      partition: partitionAt('MEDIUM', true),
      templates: TEMPLATES.filter((row) => row.code !== 'T-AUDIT'),
      existingTasks: [],
    });
    expect(plan).toMatchObject({
      planned: false,
      refusal: 'TEMPLATE_FACTS_MISSING',
      subjects: ['T-AUDIT'],
    });
  });

  it('two facts rows for one code refuse: the wrong templateVersion must not be frozen silently', () => {
    const plan = planRegisterInstantiation({
      occasion: 'INITIAL_SETUP',
      partition: partitionAt('MEDIUM', true),
      templates: [...TEMPLATES, { ...facts('T-AUDIT'), libraryVersion: 'test-lib.2' }],
      existingTasks: [],
    });
    expect(plan).toMatchObject({
      planned: false,
      refusal: 'DUPLICATE_TEMPLATE_CODE',
      subjects: ['T-AUDIT'],
    });
  });

  it('RECLASSIFICATION without the transition context refuses: §09’s reason string needs it', () => {
    const plan = planRegisterInstantiation({
      occasion: 'RECLASSIFICATION',
      partition: partitionAt('SMALL', true),
      templates: TEMPLATES,
      existingTasks: [],
    });
    expect(plan).toMatchObject({ planned: false, refusal: 'RECLASSIFICATION_CONTEXT_MISSING' });
  });

  it('LIVENESS: a clean, decided partition on a real classification ALWAYS plans', () => {
    // The S8 lesson, asserted rather than hoped: a planner that refuses the entitled caller is an
    // outage that reads as a working control. Empty lists are a legal outcome; a refusal is not.
    for (const classification of ['LARGE', 'MEDIUM', 'SMALL', 'SMALL'] as const) {
      for (const fact of [true, false]) {
        const plan = planRegisterInstantiation({
          occasion: 'INITIAL_SETUP',
          partition: partitionAt(classification, fact),
          templates: TEMPLATES,
          existingTasks: [],
        });
        expect(plan.planned, `${classification} hasIncome=${String(fact)}`).toBe(true);
      }
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * INITIAL_SETUP — A1's shape
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('INITIAL_SETUP', () => {
  it('instantiates every applicable non-EVENT template with the full identity, and skips EVENT', () => {
    const plan = planned(
      planRegisterInstantiation({
        occasion: 'INITIAL_SETUP',
        partition: partitionAt('MEDIUM', true),
        templates: TEMPLATES,
        existingTasks: [],
      }),
    );
    // MEDIUM with income: ALL + LARGE_MEDIUM + HAS_INCOME apply; SMALL_DIRECT excluded;
    // T-PER-EVENT applies but never pre-materialises.
    expect(plan.instantiate.map((task) => task.templateCode).sort()).toEqual([
      'T-AUDIT',
      'T-BASELINE',
      'T-LEDGER',
    ]);
    for (const task of plan.instantiate) {
      expect(task).toMatchObject({
        templateVersion: LIBRARY_VERSION,
        instantiatedReason: 'INITIAL_SETUP',
        classificationAtInstantiation: 'MEDIUM',
      });
    }
    expect(plan.skippedEventTemplates).toEqual(['T-PER-EVENT']);
    expect(plan.retire).toHaveLength(0);
  });

  it('an open copy blocks re-instantiation (kept); a COMPLETED or RETIRED copy does not block', () => {
    const plan = planned(
      planRegisterInstantiation({
        occasion: 'INITIAL_SETUP',
        partition: partitionAt('MEDIUM', true),
        templates: TEMPLATES,
        existingTasks: [
          openTask('task-open', 'T-BASELINE', 'IN_PROGRESS'),
          openTask('task-done', 'T-AUDIT', 'COMPLETED'),
          openTask('task-hist', 'T-LEDGER', 'RETIRED'),
        ],
      }),
    );
    expect(plan.keptOpen.map((task) => task.id)).toEqual(['task-open']);
    // History never blocks: §09 A4 — "previously-retired copies remain queryable as history".
    expect(plan.instantiate.map((task) => task.templateCode).sort()).toEqual([
      'T-AUDIT',
      'T-LEDGER',
    ]);
  });

  it('setup NEVER retires: an out-of-scope open row is reported, not touched (§09 gives setup no retirement clause)', () => {
    const plan = planned(
      planRegisterInstantiation({
        occasion: 'INITIAL_SETUP',
        partition: partitionAt('MEDIUM', true),
        templates: TEMPLATES,
        existingTasks: [openTask('task-oos', 'T-SIMPLIFIED')],
      }),
    );
    expect(plan.retire).toHaveLength(0);
    expect(plan.outOfScopeOpen.map((task) => task.id)).toEqual(['task-oos']);
  });

  it('a pre-engine row the catalogue cannot attribute is never managed: unknownOpen', () => {
    const plan = planned(
      planRegisterInstantiation({
        occasion: 'INITIAL_SETUP',
        partition: partitionAt('MEDIUM', true),
        templates: TEMPLATES,
        existingTasks: [openTask('task-seed', 'SEED-fixture-001')],
      }),
    );
    expect(plan.unknownOpen.map((task) => task.id)).toEqual(['task-seed']);
    expect(plan.retire).toHaveLength(0);
    expect(plan.outOfScopeOpen).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * LIBRARY_UPGRADE — S9-3b's occasion (owner ruling 2026-08-25, S9 first batch)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('LIBRARY_UPGRADE', () => {
  it('attaches only the uncovered applicable codes, and NOTHING retires — the ruling in one plan', () => {
    const plan = planned(
      planRegisterInstantiation({
        occasion: 'LIBRARY_UPGRADE',
        partition: partitionAt('MEDIUM', true),
        templates: TEMPLATES,
        existingTasks: [
          openTask('task-covered', 'T-BASELINE'), // already carried → keptOpen, not duplicated
          openTask('task-oos', 'T-SIMPLIFIED'), // out of scope at MEDIUM → REPORTED, never retired
        ],
      }),
    );
    expect(plan.occasion).toBe('LIBRARY_UPGRADE');
    for (const task of plan.instantiate) {
      expect(task.instantiatedReason).toBe('LIBRARY_UPGRADE');
    }
    expect(plan.instantiate.map((task) => task.templateCode)).not.toContain('T-BASELINE');
    expect(plan.keptOpen.map((task) => task.id)).toEqual(['task-covered']);
    // THE RULED DIFFERENCE: retirement stays RECLASSIFICATION's alone.
    expect(plan.retire).toHaveLength(0);
    expect(plan.outOfScopeOpen.map((task) => task.id)).toEqual(['task-oos']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * RECLASSIFICATION — A3/A4's shape
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('RECLASSIFICATION', () => {
  it('LARGE→SMALL: the LARGE_MEDIUM task retires with §09’s own reason string; SMALL_DIRECT is gained', () => {
    const plan = planned(
      planRegisterInstantiation({
        occasion: 'RECLASSIFICATION',
        partition: partitionAt('SMALL', true), // the AFTER side
        templates: TEMPLATES,
        existingTasks: [
          openTask('task-audit', 'T-AUDIT', 'IN_PROGRESS'),
          openTask('task-base', 'T-BASELINE'),
        ],
        reclassification: { from: 'LARGE', to: 'SMALL' },
      }),
    );
    expect(plan.retire).toEqual([
      {
        taskId: 'task-audit',
        templateCode: 'T-AUDIT',
        retiredReason: 'reclassified LARGE→SMALL',
      },
    ]);
    expect(plan.instantiate.map((task) => task.templateCode).sort()).toEqual([
      'T-LEDGER',
      'T-SIMPLIFIED',
    ]);
    for (const task of plan.instantiate) {
      expect(task.instantiatedReason).toBe('RECLASSIFICATION');
      expect(task.classificationAtInstantiation).toBe('SMALL');
    }
    expect(plan.keptOpen.map((task) => task.id)).toEqual(['task-base']);
  });

  it('a COMPLETED out-of-scope task is history, not a retirement subject (§09 clause 2: "task live")', () => {
    const plan = planned(
      planRegisterInstantiation({
        occasion: 'RECLASSIFICATION',
        partition: partitionAt('SMALL', true),
        templates: TEMPLATES,
        existingTasks: [openTask('task-audit-done', 'T-AUDIT', 'COMPLETED')],
        reclassification: { from: 'LARGE', to: 'SMALL' },
      }),
    );
    expect(plan.retire).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Parity with the schema
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const SCHEMA = readFileSync(
  fileURLToPath(new URL('../../../../database/prisma/schema.prisma', import.meta.url)),
  'utf8',
);

function prismaEnum(name: string): readonly string[] | null {
  const block = new RegExp(String.raw`\benum\s+${name}\s*\{([^}]*)\}`).exec(SCHEMA);
  if (block === null) return null;
  return (block[1] ?? '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, '').trim())
    .filter((line) => /^[A-Z][A-Z0-9_]*$/.test(line));
}

describe('parity with schema.prisma', () => {
  it('TASK_INSTANTIATION_REASONS === enum TaskInstantiationReason, in order', () => {
    expect(prismaEnum('TaskInstantiationReason')).toEqual([...TASK_INSTANTIATION_REASONS]);
  });

  it('OPEN_TASK_STATUSES is a strict subset of enum ComplianceTaskStatus, and the guard agrees', () => {
    const statuses = prismaEnum('ComplianceTaskStatus');
    expect(statuses).not.toBeNull();
    for (const status of OPEN_TASK_STATUSES) {
      expect(statuses).toContain(status);
      expect(isOpenTaskStatus(status)).toBe(true);
    }
    // The complement is CLOSED: every non-open schema status must be recognised as not-open,
    // so a new schema status lands on the SAFE side (history, never silently "open").
    for (const status of (statuses ?? []).filter(
      (candidate) => !(OPEN_TASK_STATUSES as readonly string[]).includes(candidate),
    )) {
      expect(isOpenTaskStatus(status), status).toBe(false);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RETURN TO `NOT_CLASSIFIED` (S10-2b)
 *
 * Owner rulings: 2026-08-25 (S8 fourth batch) the act is ALLOWED but RESERVED-MATTER-GATED and
 * its register interaction "must be DESIGNED, not defaulted"; 2026-08-27 (S9 second batch) that
 * design — "retires the open tasks with reason 'classification returned to NOT_CLASSIFIED'".
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */
describe('RETURN TO NOT_CLASSIFIED', () => {
  const task = (id: string, status: string, code = `CODE-${id}`) => ({
    id,
    templateCode: code,
    templateVersion: '2026-08-26.1',
    status,
  });

  it('retires EVERY open task, whatever its code — the property the ordinary diff cannot express', () => {
    // ⚠ THE POINT OF A SEPARATE PLANNER. `planRegisterInstantiation` retires an open task only
    // when its code is in `partition.excluded`, and at NOT_CLASSIFIED the resolver refuses to
    // partition — `excluded` is empty — so every one of these would land in `unknownOpen` and stay
    // in force on a locked register. Codes here are deliberately arbitrary and share nothing with
    // the catalogue, because membership is exactly what must NOT be consulted.
    const plan = planReturnToNotClassified([
      task('t1', 'NOT_STARTED'),
      task('t2', 'IN_PROGRESS'),
      task('t3', 'NOT_STARTED', 'GOV-REG-01'),
    ]);

    expect(plan.retire.map((r) => r.taskId)).toEqual(['t1', 't2', 't3']);
    expect(plan.untouched).toEqual([]);
  });

  it("carries the owner's ruled reason VERBATIM on every retirement", () => {
    // The string is the ruling (S9 addendum, second batch). Asserted literally rather than through
    // the constant on ONE side, so that renaming the constant cannot quietly change the phrase.
    const plan = planReturnToNotClassified([task('t1', 'NOT_STARTED'), task('t2', 'IN_PROGRESS')]);

    expect(RETURN_TO_NOT_CLASSIFIED_RETIREMENT_REASON).toBe(
      'classification returned to NOT_CLASSIFIED',
    );
    for (const retirement of plan.retire) {
      expect(retirement.retiredReason).toBe('classification returned to NOT_CLASSIFIED');
    }
  });

  it('leaves COMPLETED, RETIRED and NOT_APPLICABLE rows ALONE and reports them', () => {
    // ⚠ The ruling retires "the OPEN tasks". A COMPLETED row is the record of work actually done —
    // an endowment that filed its statements did file them, whatever is later discovered about its
    // classification — and retiring it would rewrite performed work.
    const plan = planReturnToNotClassified([
      task('open', 'IN_PROGRESS'),
      task('done', 'COMPLETED'),
      task('gone', 'RETIRED'),
      task('na', 'NOT_APPLICABLE'),
    ]);

    expect(plan.retire.map((r) => r.taskId)).toEqual(['open']);
    expect(plan.untouched.map((t) => t.id)).toEqual(['done', 'gone', 'na']);
  });

  it('an empty register plans nothing, and an all-terminal register retires nothing', () => {
    expect(planReturnToNotClassified([]).retire).toEqual([]);
    const terminal = planReturnToNotClassified([task('a', 'COMPLETED'), task('b', 'RETIRED')]);
    expect(terminal.retire).toEqual([]);
    expect(terminal.untouched).toHaveLength(2);
  });

  it('the open set it retires is EXACTLY `OPEN_TASK_STATUSES` — derived, not a second list', () => {
    // Guards the drift this planner would otherwise invite: a new open status added to
    // OPEN_TASK_STATUSES must retire here too, and a status removed from it must stop retiring.
    // Asserted by construction over the vocabulary rather than by repeating it.
    const all = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'RETIRED', 'NOT_APPLICABLE'];
    const plan = planReturnToNotClassified(all.map((status) => task(status, status)));
    expect(plan.retire.map((r) => r.taskId).sort()).toEqual([...OPEN_TASK_STATUSES].sort());
  });
});
