/**
 * Migration `00000000000002_role_model_thirteen` — the enum-narrowing guard.
 *
 * ── WHAT THIS PROTECTS ───────────────────────────────────────────────────────────────────
 * The role model was reconciled to §10's thirteen (ADR-0004). Three enum values went:
 * `MANDATE_LEAD` and `ACCOUNTANT` were synonyms; **`APPROVER` was removed, not remapped**,
 * because approval is an action the `nazir` holds and a standing approver seat would create the
 * second approval authority BR-105/BR-1103 forbid.
 *
 * Postgres cannot drop an enum value in place — the type is recreated and every column recast.
 * The danger is what a well-meaning migration does with a row that still holds a removed value:
 *
 *   • coerce it (`::text::"Role_new"`) → a bare "invalid input value for enum" with no row, no
 *     value and no remedy named; or
 *   • "helpfully" map it onto a survivor → mapping `APPROVER` to `NAZIR` would hand somebody the
 *     Nazir's approval authority as a SIDE EFFECT OF A MIGRATION, with no approval trail and
 *     nobody deciding it. That is the silent rewiring ADR-0004 explicitly forbids.
 *
 * So the migration refuses while any such row exists, and this test proves three things:
 * the refusal fires, it names the offending row, and **it changes nothing** — a refused
 * migration must leave the enum and the grant exactly as they were.
 *
 * ── WHY RAW `pg` AND NOT PRISMA ──────────────────────────────────────────────────────────
 * The migration files are multi-statement and contain `DO $$ … $$` blocks. Prisma's
 * `$executeRawUnsafe` uses the extended query protocol, which rejects multiple commands in one
 * statement and cannot carry a dollar-quoted body. `pg` speaks the simple query protocol, which
 * is what `prisma migrate deploy` itself uses.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PACKAGE_ROOT } from '../src/guardrail.js';
import { DATABASE_URL, hasDatabase } from './setup.js';

const MIGRATIONS = path.join(PACKAGE_ROOT, 'prisma', 'migrations');

/**
 * The baseline migration is NOT regenerated to 13 — it still creates the 16 values the enum
 * genuinely had, and migration 3 narrows them. That is the honest history, and it is what makes
 * this test possible: replaying the baseline reproduces the pre-ADR state exactly.
 */
const PRE_ADR_VALUE_COUNT = 16;

/** A throwaway database name; dropped in `afterAll` whatever happens. */
const PROBE_DB = 'qmulate_role_narrowing_probe';

function migration(name: string): string {
  return readFileSync(path.join(MIGRATIONS, name, 'migration.sql'), 'utf8');
}

/**
 * ⚠ BUILT FROM `MIGRATOR_DATABASE_URL`, NOT `DATABASE_URL`  (ADR-0008 round 6).
 *
 * This file replays migrations into a THROWAWAY database, so it needs `CREATEDB` and then ownership of
 * everything it creates. Since privilege separation `DATABASE_URL` is `qmulate_app`: MEASURED, it gets
 * `42501 permission denied to create database`, which is the correct posture and not a problem to work
 * around. `qmulate_owner` holds `CREATEDB` (granted by `scripts/provision-db-roles.ts` for exactly
 * this and for `prisma migrate dev`'s shadow database), so the migrator credential is the right one.
 * Falls back to `DATABASE_URL` only so the failure names the missing variable rather than crashing on
 * `undefined`.
 */
function urlFor(database: string): string {
  const base = process.env.MIGRATOR_DATABASE_URL?.trim() || DATABASE_URL;
  const url = new URL(base ?? '');
  url.pathname = `/${database}`;
  return url.toString();
}

describe.skipIf(!hasDatabase)('ADR-0004 · narrowing Role refuses to rewire a removed value', () => {
  let admin: pg.Client;
  let probe: pg.Client;

  beforeAll(async () => {
    admin = new pg.Client(urlFor('postgres'));
    await admin.connect().catch(async () => {
      // Some clusters have no `postgres` database; fall back to the configured one.
      admin = new pg.Client(process.env.MIGRATOR_DATABASE_URL?.trim() || DATABASE_URL);
      await admin.connect();
    });
    await admin.query(`DROP DATABASE IF EXISTS "${PROBE_DB}"`);
    await admin.query(`CREATE DATABASE "${PROBE_DB}"`);

    probe = new pg.Client(urlFor(PROBE_DB));
    await probe.connect();

    // Rebuild the pre-ADR state by replaying the baseline, which still creates all 16 values.
    await probe.query(migration('00000000000000_init'));

    const { rows: precondition } = await probe.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'Role'`,
    );
    expect(
      Number(precondition[0]?.n),
      'the baseline must still create the pre-ADR 16 values, or this test proves nothing',
    ).toBe(PRE_ADR_VALUE_COUNT);

    // The minimum rows the FKs need, then the grant that must block the migration.
    await probe.query(
      `INSERT INTO "user" ("id","name","email","emailVerified","createdAt","updatedAt")
       VALUES ('user-probe','Probe (fictional)','probe@example.test',false,now(),now())`,
    );
    await probe.query(
      `INSERT INTO "client" ("id","nameAr","createdAt","updatedAt")
       VALUES ('client-probe','عميل وهمي (بيانات وهمية)',now(),now())`,
    );
    await probe.query(
      `INSERT INTO "waqif" ("id","clientId","nameAr","createdAt","updatedAt")
       VALUES ('waqif-probe','client-probe','واقف وهمي (بيانات وهمية)',now(),now())`,
    );
    await probe.query(
      `INSERT INTO "waqf" ("id","waqifId","certificateNumber","deedNumber","classification","type",
                           "nature","entitlementOrder","shartAlWaqif","shartAlWaqifVersion",
                           "shartAlWaqifSetAt","shartAlWaqifSetAtHijri","fiscalYearEnd",
                           "registrationDate","registrationDateHijri","createdAt","updatedAt")
       VALUES ('waqf-probe','waqif-probe','FAKE-PROBE-1','FAKE-PROBE-D1','MEDIUM','FAMILY_DHURRI',
               'AYNI','ORDERED','{}'::jsonb,1,now(),'1447-01-01','12-31',now(),'1447-01-01',
               now(),now())`,
    );
    await probe.query(
      `INSERT INTO "waqf_access_grant" ("id","userId","waqfId","role","grantedByUserId","validFrom",
                                        "createdAt","updatedAt")
       VALUES ('grant-probe','user-probe','waqf-probe','APPROVER','user-probe',now(),now(),now())`,
    );
  }, 120_000);

  afterAll(async () => {
    await probe?.end().catch(() => undefined);
    await admin?.query(`DROP DATABASE IF EXISTS "${PROBE_DB}"`).catch(() => undefined);
    await admin?.end().catch(() => undefined);
  });

  it('refuses to run while a grant still holds APPROVER, and names the row', async () => {
    const narrowing = migration('00000000000002_role_model_thirteen');

    await expect(probe.query(narrowing)).rejects.toThrow(/refusing to narrow "Role"/);

    // The message has to be actionable — a refusal nobody can act on just blocks a deploy.
    //
    // ⚠ THE RESOLVED BRANCH IS NOW A LOUD FAILURE, NOT `String(undefined)` (V3). `.catch(caught =>
    // caught as Error)` types the result `Error | QueryResult`, so if the migration ever STOPPED
    // refusing, `error.message` would be `undefined` and the three assertions below would fail with
    // "expected 'undefined' to contain 'waqf_access_grant.role'" — a report about the wrong thing.
    // `tsconfig.json` never typechecked this directory, so nothing said so.
    const outcome = await probe
      .query(narrowing)
      .then(() => null)
      .catch((caught: unknown) => caught as Error);
    expect(
      outcome,
      'the narrowing migration SUCCEEDED while a grant still holds APPROVER — ADR-0004 says ' +
        'refuse, never remap, so this must throw',
    ).not.toBeNull();
    const message = String((outcome as Error).message);
    expect(message).toContain('waqf_access_grant.role');
    expect(message).toContain('APPROVER');
    expect(message, 'the refusal must say WHY approval cannot be remapped').toMatch(
      /BR-105|governance/,
    );
  });

  it('changes nothing when it refuses — the enum still has all 16 values', async () => {
    const { rows } = await probe.query<{ n: string }>(
      `SELECT count(*)::text AS n
         FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'Role'`,
    );
    expect(Number(rows[0]?.n)).toBe(PRE_ADR_VALUE_COUNT);
  });

  it('changes nothing when it refuses — the grant still holds APPROVER, unrewired', async () => {
    const { rows } = await probe.query<{ role: string }>(
      `SELECT "role"::text AS role FROM "waqf_access_grant" WHERE "id" = 'grant-probe'`,
    );
    expect(rows[0]?.role).toBe('APPROVER');
  });

  it('succeeds once the offending grant is resolved deliberately', async () => {
    // The legitimate resolution for an APPROVER holder: decide who actually holds approval
    // authority on that endowment. Here that is the Nazir — decided, not defaulted.
    await probe.query(`UPDATE "waqf_access_grant" SET "role" = 'NAZIR' WHERE "id" = 'grant-probe'`);

    await expect(
      probe.query(migration('00000000000002_role_model_thirteen')),
    ).resolves.toBeDefined();

    const { rows } = await probe.query<{ value: string }>(
      `SELECT e.enumlabel AS value
         FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'Role'
        ORDER BY e.enumsortorder`,
    );
    const values = rows.map((row) => row.value);

    expect(values).toHaveLength(13);
    expect(values).not.toContain('MANDATE_LEAD');
    expect(values).not.toContain('ACCOUNTANT');
    expect(values, 'APPROVER must be gone, with no successor value').not.toContain('APPROVER');
    expect(values).toContain('CASE_MANAGER');
    expect(values).toContain('FINANCE');
  }, 60_000);
});
