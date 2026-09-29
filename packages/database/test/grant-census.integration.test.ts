/**
 * CENSUS-G — EVERY TABLE IN `public` CARRIES THE PRIVILEGE MATRIX'S GRANTS, AND ONLY THOSE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS: A MEASURED CLASS, NOT A HYPOTHETICAL ONE (S9-3c)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Migration 10's `qmulate_apply_privilege_matrix()` is driven off `pg_tables` "so a table added to
 * the schema is covered by DEFAULT instead of by remembering" — which is true of the FUNCTION and
 * false of the SCHEMA, because the function only covers a table if somebody re-runs it. Migration
 * 11's header therefore says every migration that adds a table must end with
 * `SELECT qmulate_apply_privilege_matrix();`.
 *
 * ⚠ MIGRATION 40's FIRST DRAFT DID NOT, and here is what that looked like: the migration applied
 * cleanly; every guard probe in this package PASSED (they run as the privileged or migrator role);
 * the guard-verb census was green; `assertGuardsInstalled()` was green. The feature was completely
 * dead for `qmulate_app` — the ONLY role production uses — and the failure surfaced three layers
 * away, in an api integration suite, as `42501 permission denied for table material_change`.
 *
 * Nothing in this package could see it, because everything in this package is privileged. So the
 * class is closed here, the way the portal-read class was closed: with a CENSUS that enumerates
 * the catalogue and compares it against a declared posture, rather than a test per table.
 *
 * ── WHAT MAKES THIS A CENSUS AND NOT A LIST ─────────────────────────────────────────────────
 * The expected grants are DERIVED from the plane the table belongs to — the same three-way split
 * migration 10 encodes (`qmulate_authz_plane_tables()`, `audit_event`/`audit_chain_head`, the
 * identity plane, everything else) — and the actual grants are read from
 * `information_schema.role_table_grants`. So a NEW table needs no edit here: it is expected to look
 * like every other ordinary table, and it goes red if it does not. The only hand-written parts are
 * the plane memberships, which are read out of the migration's own functions at run time rather
 * than copied, so they cannot drift from it.
 */

import { afterAll, describe, expect, it } from 'vitest';

import { closeDatabase, hasDatabase, privilegedPrisma, warnNoDatabase } from './setup.js';

warnNoDatabase('CENSUS-G (privilege-matrix grant coverage on every table)');

/** Postgres privilege names, sorted, as a comparable string. */
function privs(list: readonly string[]): string {
  return [...list].sort().join(',');
}

const APP = 'qmulate_app';
const PROVISIONER = 'qmulate_provisioner';
const OWNER = 'qmulate_owner';
const PGBOSS = 'qmulate_pgboss';

/**
 * The complete expected role family (S10/T1). ⚠ This list exists to be COMPARED AGAINST A
 * DERIVED SET, not to filter a query — the derivation test below reads `pg_roles` for every
 * `qmulate_%` role the cluster actually holds, so a fifth role goes red without anyone
 * remembering to look. Hand-lists are for vocabulary; SUBJECTS are derived (the rule this file's
 * own S9-3c history teaches one level up).
 */
const EXPECTED_ROLE_FAMILY = [APP, OWNER, PGBOSS, PROVISIONER] as const;

interface GrantRow {
  readonly table_name: string;
  readonly grantee: string;
  readonly privilege_type: string;
}

describe.runIf(hasDatabase)('CENSUS-G · privilege-matrix grant coverage', () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it('every table in public carries EXACTLY the grants its plane calls for — app role and provisioner', async () => {
    const raw = await privilegedPrisma();

    // The plane memberships come from the MIGRATION'S OWN functions, not from a copy here: a
    // hand-copied plane list is the drift this census exists to prevent, one level up.
    const authzRows = await raw.$queryRawUnsafe<{ t: string[] }[]>(
      `SELECT qmulate_authz_plane_tables() AS t`,
    );
    const identityRows = await raw.$queryRawUnsafe<{ t: string[] }[]>(
      `SELECT qmulate_identity_plane_tables() AS t`,
    );
    // ⊕ S12-3b (migration 53): the BIRTH plane and its children, from the migration's own functions.
    const birthRows = await raw.$queryRawUnsafe<{ t: string[] }[]>(
      `SELECT qmulate_endowment_birth_tables() AS t`,
    );
    const birthKidRows = await raw.$queryRawUnsafe<{ t: string[] }[]>(
      `SELECT qmulate_endowment_birth_child_tables() AS t`,
    );
    const birth = new Set(birthRows[0]?.t ?? []);
    const birthKids = new Set(birthKidRows[0]?.t ?? []);
    expect([...birth].sort()).toEqual(['waqf', 'waqif']);
    expect([...birthKids].sort()).toEqual(['onboarding_gate', 'trusteeship_deed']);
    const authz = new Set(authzRows[0]?.t ?? []);
    const identity = new Set(identityRows[0]?.t ?? []);
    expect(authz.size, 'the authz plane must be non-empty').toBeGreaterThan(0);
    expect(identity.size, 'the identity plane must be non-empty').toBeGreaterThan(0);

    const tables = await raw.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables
        WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
        ORDER BY tablename`,
    );
    expect(tables.length, 'the schema must have tables').toBeGreaterThan(30);

    const grants = await raw.$queryRawUnsafe<GrantRow[]>(
      `SELECT table_name, grantee, privilege_type
         FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND grantee IN ('${APP}', '${PROVISIONER}')`,
    );
    const held = new Map<string, string[]>();
    for (const row of grants) {
      const key = `${row.grantee}|${row.table_name}`;
      held.set(key, [...(held.get(key) ?? []), row.privilege_type]);
    }

    const problems: string[] = [];
    for (const { tablename } of tables) {
      // ── The APP role's expected posture, by plane ──────────────────────────────────────────
      let expectedApp: string[];
      if (authz.has(tablename)) {
        // THE AUTHORIZATION PLANE. Read-only: a runtime that can write grants makes itself Nazir.
        expectedApp = ['SELECT'];
      } else if (tablename === 'audit_event') {
        // APPEND-ONLY as a PRIVILEGE, not only as a trigger. INSERT must stay — that is what
        // append-only means; UPDATE/DELETE/TRUNCATE must not.
        expectedApp = ['SELECT', 'INSERT'];
      } else if (identity.has(tablename)) {
        // better-auth deletes sessions on sign-out and prunes expired verification rows. The one
        // carve-out where a too-broad revoke breaks LOGIN rather than a test.
        expectedApp = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
      } else if (birth.has(tablename)) {
        // S12-3b: the runtime UPDATES an endowment record and never BIRTHS one (migration 53).
        expectedApp = ['SELECT', 'UPDATE'];
      } else {
        // ⚠ THE ORDINARY CASE, and the one that matters for this census: SELECT+INSERT+UPDATE and
        // NO DELETE / NO TRUNCATE. A brand-new table lands here with no edit to this file — which
        // is exactly what makes a migration that forgot the matrix call go red.
        expectedApp = ['SELECT', 'INSERT', 'UPDATE'];
      }
      const actualApp = held.get(`${APP}|${tablename}`) ?? [];
      if (privs(actualApp) !== privs(expectedApp)) {
        problems.push(
          `${APP} on "${tablename}": expected [${privs(expectedApp)}], found ` +
            `[${privs(actualApp) || '(none)'}]`,
        );
      }

      // ── The PROVISIONER's expected posture ────────────────────────────────────────────────
      let expectedProv: string[];
      if (authz.has(tablename)) {
        expectedProv = ['SELECT', 'INSERT', 'UPDATE'];
      } else if (tablename === 'audit_event') {
        expectedProv = ['SELECT', 'INSERT'];
      } else if (tablename === 'audit_chain_head') {
        expectedProv = ['SELECT', 'INSERT', 'UPDATE'];
      } else if (birth.has(tablename) || birthKids.has(tablename)) {
        // S12-3b: the provisioner BIRTHS the endowment, its founder, its deed and its gates — INSERT
        // only; it never updates any of them (migration 53).
        expectedProv = ['SELECT', 'INSERT'];
      } else if (tablename === 'approval_request') {
        // S12-1 / AV4-02 (migration 50): the provisioner IS the approval plane — it DECIDES a
        // request (UPDATE) and never MINTS one (no INSERT). The runtime keeps the ordinary posture
        // and its decision UPDATEs die at the trigger, not the ACL.
        expectedProv = ['SELECT', 'UPDATE'];
      } else {
        expectedProv = ['SELECT'];
      }
      const actualProv = held.get(`${PROVISIONER}|${tablename}`) ?? [];
      if (privs(actualProv) !== privs(expectedProv)) {
        problems.push(
          `${PROVISIONER} on "${tablename}": expected [${privs(expectedProv)}], found ` +
            `[${privs(actualProv) || '(none)'}]`,
        );
      }
    }

    expect(
      problems,
      'PRIVILEGE-MATRIX DRIFT. The most likely cause by far: a migration CREATED A TABLE and did ' +
        'not end with `SELECT qmulate_apply_privilege_matrix();` — migration 10 grants by ' +
        'ITERATING pg_tables, so a table born after the last application has NO GRANTS AT ALL for ' +
        'the runtime role. That failure is invisible to every privileged probe in this package and ' +
        'shows up as `42501 permission denied` in an api suite (measured: migration 40, S9-3c). ' +
        'Add the call at the end of the offending migration. If a table genuinely needs a ' +
        'DIFFERENT posture, change the plane split in migration 10 and the expectation here ' +
        'TOGETHER, with the reason.\n' +
        problems.join('\n'),
    ).toStrictEqual([]);
  });

  it('THE GRANTEE SET IS DERIVED: every qmulate_% role in the cluster is accounted for, and the queue role holds ZERO in public', async () => {
    // ⚠ S10/T1 closed a gap this file's own record had already named: the posture sweep above
    // filters grantees with a hardcoded two-element list, so a NEW role over-granted on public
    // tables passed silently — "a hand-list where a subject set was needed". While no fourth role
    // existed that was record-don't-fix; the day qmulate_pgboss became real it stopped being
    // hypothetical. This test derives the subjects from the CLUSTER, twice over:
    const raw = await privilegedPrisma();

    // 1 · The role family itself, from pg_roles — a fifth qmulate_% role is refused BY NAME until
    //     someone declares its expected posture here and in the sweep above. (`qmulate` — the
    //     local/CI platform superuser — has no underscore and is deliberately outside the family;
    //     provision-roles.ts asserts ITS attributes separately.)
    const family = await raw.$queryRawUnsafe<{ rolname: string }[]>(
      `SELECT rolname FROM pg_roles WHERE rolname LIKE 'qmulate\\_%' ORDER BY rolname`,
    );
    expect(
      family.map((row) => row.rolname),
      'an UNACCOUNTED role appeared in the qmulate_% family. Every role here must have a declared ' +
        'expected posture in this census — an over-granted role this sweep does not look at is ' +
        'exactly the silence this test exists to end.',
    ).toStrictEqual([...EXPECTED_ROLE_FAMILY]);

    // 2 · The grantees that actually hold table privileges in public, derived from the grants
    //     catalogue rather than assumed. The owner appears via its implicit owner-grants; app and
    //     provisioner are the matrix's two grantees; the queue role must NOT appear AT ALL —
    //     qmulate_pgboss owns schema pgboss and its whole design premise (Option B, S10/T1) is
    //     that the queue existing grants NOTHING in public.
    const grantees = await raw.$queryRawUnsafe<{ grantee: string }[]>(
      `SELECT DISTINCT grantee FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND grantee LIKE 'qmulate\\_%' ORDER BY grantee`,
    );
    expect(grantees.map((row) => row.grantee)).toStrictEqual([APP, OWNER, PROVISIONER]);

    const pgbossGrants = await raw.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND grantee = '${PGBOSS}'`,
    );
    expect(Number(pgbossGrants[0]?.n ?? -1)).toBe(0);
  });

  it('the app role holds DELETE on the identity plane and NOWHERE else', async () => {
    const raw = await privilegedPrisma();
    const identityRows = await raw.$queryRawUnsafe<{ t: string[] }[]>(
      `SELECT qmulate_identity_plane_tables() AS t`,
    );
    const identity = [...(identityRows[0]?.t ?? [])].sort();

    const deletes = await raw.$queryRawUnsafe<{ table_name: string }[]>(
      `SELECT table_name FROM information_schema.role_table_grants
        WHERE table_schema = 'public' AND grantee = '${APP}' AND privilege_type = 'DELETE'
        ORDER BY table_name`,
    );
    // ⚠ The complement is the point. Retention is enforced by triggers that RAISE — but a privilege
    // the runtime never holds is a control that cannot be disabled by a `SET`, and the two are
    // separate latches on purpose (migration 8's own reasoning about `_no_delete`).
    expect(deletes.map((row) => row.table_name)).toStrictEqual(identity);
  });

  it('no table is missing from the catalogue sweep — the census reads pg_tables, not a list', async () => {
    const raw = await privilegedPrisma();
    // A guard against this file quietly becoming a list: if the sweep above ever reads fewer tables
    // than the schema has, it would pass by not looking. `material_change` is named explicitly
    // because it is the table whose absence from the matrix produced this file.
    const present = await raw.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const names = new Set(present.map((row) => row.tablename));
    expect(names.has('material_change')).toBe(true);
    expect(names.has('deadline')).toBe(true);
    expect(names.has('audit_event')).toBe(true);
    expect(names.has('waqf_access_grant')).toBe(true);
  });
});
