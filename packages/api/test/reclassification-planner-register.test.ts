/**
 * ⊕ S11 — `planReclassificationTaskDiff` decides "does this endowment have a register?" from the SAME
 * named reasons as initial setup (the E11 defect fixed at all three predicates, this being the one the
 * integration route cannot reach cheaply: reclassification sits behind a reserved-matter gate).
 *
 * Unit-level, over a structural fake `db`: the planner's `db` parameter is deliberately a two-delegate
 * minimum, so a fake that applies Prisma's `in` / `not` filter semantics to an in-memory task list is
 * an honest stand-in. Two tasks are tried: an EVENT_TRIGGER-only endowment (a sweep-raised duty, no
 * register) must make the planner return `null` — "nothing to diff, setup has not run" — and an
 * INITIAL_SETUP endowment must make it proceed to read the canonical catalogue (proven by a sentinel
 * thrown from that read, which the planner can only reach by passing the predicate).
 */

import { describe, expect, it } from 'vitest';

import { planReclassificationTaskDiff } from '../src/routers/compliance.js';

interface FakeTask {
  readonly id: string;
  readonly waqfId: string;
  readonly instantiatedReason: string | null;
}

/** Applies the two filter shapes the planner may use: `{ in: [...] }` and `{ not: null }`. */
function matches(task: FakeTask, where: Record<string, unknown>): boolean {
  if (where['waqfId'] !== undefined && where['waqfId'] !== task.waqfId) return false;
  const reason = where['instantiatedReason'] as
    { in?: readonly string[]; not?: unknown } | string | undefined;
  if (reason === undefined) return true;
  if (typeof reason === 'string') return task.instantiatedReason === reason;
  if (reason.in !== undefined) {
    return task.instantiatedReason !== null && reason.in.includes(task.instantiatedReason);
  }
  if ('not' in reason && reason.not === null) return task.instantiatedReason !== null;
  throw new Error(`unexpected instantiatedReason filter: ${JSON.stringify(reason)}`);
}

const SENTINEL = 'CATALOGUE_READ_REACHED';

function fakeDb(tasks: readonly FakeTask[]) {
  let catalogueReads = 0;
  return {
    reads: () => catalogueReads,
    db: {
      complianceTask: {
        findFirst: async (args: unknown) => {
          const { where } = args as { where: Record<string, unknown> };
          return tasks.find((task) => matches(task, where)) ?? null;
        },
        findMany: async (args: unknown) => {
          const { where } = args as { where: Record<string, unknown> };
          return tasks.filter((task) => matches(task, where));
        },
      },
      complianceObligation: {
        findMany: async () => {
          catalogueReads += 1;
          throw new Error(SENTINEL);
        },
      },
    },
  };
}

const TRANSITION = { from: 'SMALL', to: 'MEDIUM' } as const;

describe('planReclassificationTaskDiff · a register is proven by a register reason, not by any reason (S11, E11 defect)', () => {
  it('an endowment holding ONLY a sweep-raised EVENT_TRIGGER duty has NO register: the planner returns null and never reads the catalogue', async () => {
    const fake = fakeDb([{ id: 't-evt', waqfId: 'w', instantiatedReason: 'EVENT_TRIGGER' }]);
    const plan = await planReclassificationTaskDiff(
      fake.db as never,
      'w',
      TRANSITION as never,
      true,
      false,
    );
    expect(plan).toBeNull();
    expect(fake.reads()).toBe(0);
  });

  it('an endowment with an INITIAL_SETUP task HAS a register: the planner passes the predicate and reads the catalogue', async () => {
    const fake = fakeDb([
      { id: 't-evt', waqfId: 'w', instantiatedReason: 'EVENT_TRIGGER' },
      { id: 't-setup', waqfId: 'w', instantiatedReason: 'INITIAL_SETUP' },
    ]);
    await expect(
      planReclassificationTaskDiff(fake.db as never, 'w', TRANSITION as never, true, false),
    ).rejects.toThrow(SENTINEL);
    expect(fake.reads()).toBe(1);
  });

  it('a task with no reason at all (a SEED- placeholder) is not a register either', async () => {
    const fake = fakeDb([{ id: 't-seed', waqfId: 'w', instantiatedReason: null }]);
    expect(
      await planReclassificationTaskDiff(fake.db as never, 'w', TRANSITION as never, true, false),
    ).toBeNull();
  });
});
