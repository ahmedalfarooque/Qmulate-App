/**
 * ⊕ S11-1 — migration 48's three CHECKs, DRIVEN at raw SQL as the application role.
 *
 * The owner ruled the clock-start dates are recorded operator input with the KIND travelling with
 * the date (9f3d8fd). The database keeps the MECHANICAL half of that: a half dual pair and a date
 * without its kind are unrepresentable — so the domain's `ANCHOR_KIND_ABSENT` refusal is a second
 * layer over a row the schema already refuses, not the only one. Which date GOVERNS is deliberately
 * NOT a constraint (binding rule 3).
 *
 * Every probe is wrapped in `guardProbeSql`, which catches ONLY `check_violation` (23514) and rolls
 * the statement back either way — a probe can never leave a row changed. And every refusal is paired
 * with the write it must still PERMIT (the S8 liveness lesson): the full pair records, and clearing
 * both halves records.
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

warnNoDatabase('S11-1 anchor columns (migration 48 CHECKs)');

const WAQF = 'waqf-003'; // blank anchor in the fixture (⊕ S11-2: waqf-002 now carries a DISCHARGED anchor)
const EXP = 'exp-001'; // pending istibdal in the fixture

describe.runIf(hasDatabase)(
  'S11-1 · migration 48 — the anchor pairs move together, and the kind travels with the date',
  () => {
    afterAll(async () => {
      await closeDatabase();
    });

    it('REFUSES a registration anchor date without its Hijri twin (waqf_registration_anchor_dual_dated)', async () => {
      const out = await runProbe(
        guardProbeSql(
          `UPDATE "waqf" SET "registrationAnchorDate" = '2026-01-15T00:00:00.000Z',
           "registrationAnchorKind" = 'REGULATION_EFFECTIVE_DATE' WHERE "id" = '${WAQF}'`,
          'check_violation',
        ),
      );
      expect(out).toContain(`${PROBE_BLOCKED}[23514]`);
      expect(out).toMatch(/waqf_registration_anchor_dual_dated/);
    });

    it('REFUSES a registration anchor date WITHOUT its kind (waqf_registration_anchor_kind_pairs_with_date) — a bare date is not the record', async () => {
      const out = await runProbe(
        guardProbeSql(
          `UPDATE "waqf" SET "registrationAnchorDate" = '2026-01-15T00:00:00.000Z',
           "registrationAnchorDateHijri" = '1447-07-25' WHERE "id" = '${WAQF}'`,
          'check_violation',
        ),
      );
      expect(out).toContain(`${PROBE_BLOCKED}[23514]`);
      expect(out).toMatch(/waqf_registration_anchor_kind_pairs_with_date/);
    });

    it('REFUSES a kind with no date — a kind declares which clock-start a non-existent date is', async () => {
      const out = await runProbe(
        guardProbeSql(
          `UPDATE "waqf" SET "registrationAnchorKind" = 'WAQF_DOCUMENTATION_DATE' WHERE "id" = '${WAQF}'`,
          'check_violation',
        ),
      );
      expect(out).toContain(`${PROBE_BLOCKED}[23514]`);
    });

    it('PERMITS the full triple, and permits clearing all three — the row the operator actually writes', async () => {
      // `rollbackProbeSql`, not `guardProbeSql`: these statements MUST succeed, and the wrapper then
      // throws so the seeded rows are left exactly as they were (the S8 liveness pairing).
      const recorded = await runProbe(
        rollbackProbeSql([
          `UPDATE "waqf" SET "registrationAnchorDate" = '2026-01-15T00:00:00.000Z',
           "registrationAnchorDateHijri" = '1447-07-25',
           "registrationAnchorKind" = 'REGULATION_EFFECTIVE_DATE' WHERE "id" = '${WAQF}'`,
        ]),
      );
      expect(recorded).toContain(PROBE_SUCCEEDED);
      const cleared = await runProbe(
        rollbackProbeSql([
          `UPDATE "waqf" SET "registrationAnchorDate" = NULL, "registrationAnchorDateHijri" = NULL,
           "registrationAnchorKind" = NULL WHERE "id" = 'waqf-001'`,
        ]),
      );
      expect(cleared).toContain(PROBE_SUCCEEDED);
    });

    it('REFUSES an istibdal completion date without its twin (expropriation_istibdal_completed_dual_dated), and PERMITS the pair', async () => {
      const half = await runProbe(
        guardProbeSql(
          `UPDATE "expropriation" SET "istibdalCompletedDate" = '2026-05-10T00:00:00.000Z' WHERE "id" = '${EXP}'`,
          'check_violation',
        ),
      );
      expect(half).toContain(`${PROBE_BLOCKED}[23514]`);
      expect(half).toMatch(/expropriation_istibdal_completed_dual_dated/);

      const pair = await runProbe(
        rollbackProbeSql([
          `UPDATE "expropriation" SET "istibdalCompletedDate" = '2026-05-10T00:00:00.000Z',
           "istibdalCompletedDateHijri" = '1447-11-23' WHERE "id" = '${EXP}'`,
        ]),
      );
      expect(pair).toContain(PROBE_SUCCEEDED);
    });

    it('the enum is CLOSED — a third kind is refused at the type, not merely unmapped', async () => {
      const out = await runProbe(
        guardProbeSql(
          `UPDATE "waqf" SET "registrationAnchorDate" = '2026-01-15T00:00:00.000Z',
           "registrationAnchorDateHijri" = '1447-07-25',
           "registrationAnchorKind" = 'A_THIRD_DATE' WHERE "id" = '${WAQF}'`,
          'invalid_text_representation',
        ),
      );
      expect(out).toContain(`${PROBE_BLOCKED}[22P02]`);
    });
  },
);
