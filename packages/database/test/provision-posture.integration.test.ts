/**
 * S10/T1 — the role-family census, SHOWN FIRING, and the repair shown winning.
 *
 * Two facts about `provision-roles.ts` that made this file necessary:
 *
 *   1. The CREATE/ALTER loop re-asserts every role's attributes BEFORE the 1b census runs — so
 *      in the shipped flow a planted `BYPASSRLS` is silently REPAIRED and the census never
 *      fires. The census is the belt against a partial failure of those statements, which means
 *      no ordinary execution can demonstrate it. A refusal nobody has ever seen fire is not a
 *      control; this file plants the attribute and calls the census DIRECTLY.
 *
 *   2. Both halves matter and they are different claims: the census REFUSES a family carrying
 *      `BYPASSRLS` (fail-closed works), and the full provision REPAIRS that family and then
 *      passes its own census (the recovery path works). Asserting only the second would let the
 *      census rot into a no-op behind a repair that happens to keep winning.
 *
 * Needs the SUPERUSER connection (only a superuser may ALTER a role's BYPASSRLS) plus the five
 * provision URLs — all injected by `scripts/dev-postgres.ts` and CI's integration job. The plant
 * is restored in `finally` AND by the provision run itself, so a crash mid-test leaves at most a
 * scratch cluster with a mis-attributed queue role, which the next provision repairs.
 */

import { Client } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';

import {
  PGBOSS_ROLE,
  assertRoleFamilyPosture,
  provisionDatabaseRoles,
} from '../src/provision-roles.js';
import { closeDatabase, hasDatabase, warnNoDatabase } from './setup.js';

warnNoDatabase('provision posture (S10/T1 — the role-family census, shown firing)');

const SUPERUSER_URL = process.env.SUPERUSER_DATABASE_URL?.trim() ?? '';
const canRun = hasDatabase && SUPERUSER_URL !== '';

describe.runIf(canRun)('S10/T1 · the role-family census fires and the repair wins', () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it('POSITIVE CONTROL: a planted BYPASSRLS on the queue role makes the census REFUSE by name; the full provision REPAIRS it', async () => {
    const superuser = new Client({ connectionString: SUPERUSER_URL });
    await superuser.connect();
    try {
      // ── Plant. Only a superuser can do this, which is exactly the out-of-band act the census
      // exists to catch when the repair statements have not run over it.
      await superuser.query(`ALTER ROLE ${PGBOSS_ROLE} BYPASSRLS`);

      // ── The census fires, naming the role and the attribute. `rejects.toThrow` with the exact
      // strings, so a census that started refusing for a different reason cannot pass as this one.
      await expect(assertRoleFamilyPosture(superuser)).rejects.toThrow(/qmulate_pgboss/);
      await superuser.query(`ALTER ROLE ${PGBOSS_ROLE} BYPASSRLS`); // still planted (idempotent)
      await expect(assertRoleFamilyPosture(superuser)).rejects.toThrow(/BYPASSRLS=true/);

      // ── The full provision runs over the planted state and WINS: the ALTER loop strips the
      // attribute, and the same census that just refused now passes on the repaired family.
      const changes = await provisionDatabaseRoles({
        superuserUrl: SUPERUSER_URL,
        appUrl: process.env.DATABASE_URL ?? '',
        provisionerUrl: process.env.ACCESS_MATRIX_DATABASE_URL ?? '',
        migratorUrl: process.env.MIGRATOR_DATABASE_URL ?? '',
        pgbossUrl: process.env.PGBOSS_DATABASE_URL ?? '',
        log: () => undefined,
      });
      // The provision reports as a list of changes; on an already-provisioned cluster the repair
      // itself is an ALTER inside the role loop (logged, not listed) — what we assert is the
      // POSTURE, not the prose.
      expect(Array.isArray(changes)).toBe(true);

      await expect(assertRoleFamilyPosture(superuser)).resolves.toBeUndefined();

      const attr = await superuser.query<{ rolbypassrls: boolean }>(
        `SELECT rolbypassrls FROM pg_roles WHERE rolname = $1`,
        [PGBOSS_ROLE],
      );
      expect(attr.rows[0]?.rolbypassrls).toBe(false);
    } finally {
      // Belt: never leave the plant behind, even if an assertion above threw.
      await superuser.query(`ALTER ROLE ${PGBOSS_ROLE} NOBYPASSRLS`).catch(() => undefined);
      await superuser.end();
    }
  });
});
