/**
 * ⊕ S11-2 — migration 49: the discharge kind pairs with the met fact, both directions, and is
 * write-once.
 *
 * Owner ruling 2026-09-02 (S4 memo, S11 addendum second batch; f797fea): a red registration deadline
 * clears because the duty was MET — recorded as a discharge — never by editing the clock-start. The
 * database's part of that ruling is small and is what this file drives, statement by statement:
 *
 *   · a `dischargeKind` with no `satisfiedAt` is refused (`deadline_discharge_kind_pairs_with_met`) —
 *     a kind names HOW a duty was discharged; a duty not yet met has no kind;
 *   · a `satisfiedAt` with no kind is refused (`deadline_discharge_met_means_satisfied`) — the
 *     precedent path (`fileUpdateObligation`) now writes both, and nothing may write half;
 *   · both together are PERMITTED — the row the discharge procedure actually writes;
 *   · once recorded, the kind is WRITE-ONCE (migration 38's `qmulate_deadline_lifecycle_write_once`,
 *     re-created by 49 with its two original clauses verbatim plus the kind) — 42501, the guard family's
 *     own SQLSTATE, not a CHECK;
 *   · the enum is CLOSED at the type — a second kind is 22P02, the type system refusing, which is
 *     the seam (a NOT-APPLICABLE member arrives only by migration + pin edit + declared copy).
 *
 * SUBJECTS are the seeded rows: `deadline-register-30bd-waqf-001` stands OPEN (overdue by
 * construction); `deadline-register-30bd-waqf-002` is seeded DISCHARGED (MET, 2026-04-20). Nothing
 * here leaves a mark: refusals roll back by raising, and the permitted write is inside `rollbackProbeSql`.
 */

import { afterAll, describe, expect, it } from 'vitest';

import {
  PROBE_BLOCKED,
  PROBE_SUCCEEDED,
  closeDatabase,
  guardProbeSql,
  hasDatabase,
  rollbackProbeSql,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S11-2 discharge kind (migration 49 CHECKs + write-once)');

const OPEN_ROW = 'deadline-register-30bd-waqf-001';
const MET_ROW = 'deadline-register-30bd-waqf-002';

describe.runIf(hasDatabase)(
  'S11-2 · migration 49 — the discharge kind pairs with the met fact and is write-once',
  () => {
    afterAll(async () => {
      await closeDatabase();
    });

    it('REFUSES a kind on a row that is not met — a duty not yet discharged has no kind', async () => {
      const out = await runProbe(
        guardProbeSql(
          `UPDATE "deadline" SET "dischargeKind" = 'MET' WHERE "id" = '${OPEN_ROW}'`,
          'check_violation',
        ),
      );
      expect(out).toContain(`${PROBE_BLOCKED}[23514]`);
      expect(out).toMatch(/deadline_discharge_(kind_pairs_with_met|met_means_satisfied)/);
    });

    it('REFUSES satisfiedAt without its kind — the precedent path writes both, nothing writes half', async () => {
      const out = await runProbe(
        guardProbeSql(
          `UPDATE "deadline" SET "satisfiedAt" = '2026-05-01T00:00:00.000Z' WHERE "id" = '${OPEN_ROW}'`,
          'check_violation',
        ),
      );
      expect(out).toContain(`${PROBE_BLOCKED}[23514]`);
      expect(out).toMatch(/deadline_discharge_(kind_pairs_with_met|met_means_satisfied)/);
    });

    it('PERMITS the pair — the row the discharge procedure writes — and leaves the anchor columns alone', async () => {
      const out = await runProbe(
        rollbackProbeSql([
          `UPDATE "deadline" SET "satisfiedAt" = '2026-05-01T00:00:00.000Z', "dischargeKind" = 'MET'
           WHERE "id" = '${OPEN_ROW}'`,
        ]),
      );
      expect(out).toContain(PROBE_SUCCEEDED);
    });

    it('the seeded discharged row IS the pair — satisfiedAt 2026-04-20 with kind MET (the seed writes what the API writes)', async () => {
      // Read-only: the seed's own row, so the write-once probes below have a real subject.
      const out = await runProbe(
        guardProbeSql(
          `DO $qm_inner$ DECLARE k text; s date; BEGIN
             SELECT "dischargeKind"::text, "satisfiedAt"::date INTO k, s FROM "deadline" WHERE "id" = '${MET_ROW}';
             IF k IS DISTINCT FROM 'MET' OR s IS DISTINCT FROM DATE '2026-04-20' THEN
               RAISE EXCEPTION 'seeded row % is not the expected pair: kind=%, satisfiedAt=%', '${MET_ROW}', k, s
                 USING ERRCODE = 'check_violation';
             END IF;
             RAISE EXCEPTION 'pair present' USING ERRCODE = 'insufficient_privilege';
           END $qm_inner$`,
          'insufficient_privilege',
        ),
      );
      // The inner block raises 42501 ONLY when the pair is exactly as seeded; a wrong pair raises 23514.
      expect(out).toContain(`${PROBE_BLOCKED}[42501]`);
    });

    it('WRITE-ONCE: a recorded kind cannot be cleared (42501, the trigger — not the CHECK)', async () => {
      const out = await runProbe(
        guardProbeSql(
          `UPDATE "deadline" SET "dischargeKind" = NULL, "satisfiedAt" = NULL WHERE "id" = '${MET_ROW}'`,
          'insufficient_privilege',
        ),
      );
      expect(out).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(out).toMatch(/write-once/);
    });

    it('WRITE-ONCE: a met date cannot move (migration 38 clause, still enforced after 49 re-created the function)', async () => {
      const out = await runProbe(
        guardProbeSql(
          `UPDATE "deadline" SET "satisfiedAt" = '2026-04-21T00:00:00.000Z' WHERE "id" = '${MET_ROW}'`,
          'insufficient_privilege',
        ),
      );
      expect(out).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(out).toMatch(/met statutory deadline/);
    });

    it('the enum is CLOSED — a second kind is refused at the type (22P02), which is the seam', async () => {
      const out = await runProbe(
        guardProbeSql(
          `UPDATE "deadline" SET "satisfiedAt" = '2026-05-01T00:00:00.000Z', "dischargeKind" = 'NOT_APPLICABLE'
           WHERE "id" = '${OPEN_ROW}'`,
          'invalid_text_representation',
        ),
      );
      expect(out).toContain(`${PROBE_BLOCKED}[22P02]`);
    });

    it('a zero-tolerance waiver is STILL refused beside the new column (migration 41 untouched)', async () => {
      const out = await runProbe(
        guardProbeSql(
          `UPDATE "deadline" SET "waivedAt" = '2026-05-01T00:00:00.000Z', "waivedReason" = 'probe'
           WHERE "id" = '${OPEN_ROW}'`,
          'insufficient_privilege',
        ),
      );
      expect(out).toContain(`${PROBE_BLOCKED}[42501]`);
    });
  },
);
