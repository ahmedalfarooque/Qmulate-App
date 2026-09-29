/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * PRIVILEGE SEPARATION — THE ONE FILE THAT MAKES ADR-0008's RESIDUAL FALSIFIABLE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * ADR-0008 spent five rounds establishing that route 2 — a forged `audit_event` marker naming
 * `user-admin-001`, the one seeded holder of `admin:access_matrix:write` on `waqf-001` — could not be
 * closed inside the database. Migration 9's header states the proof and its scope:
 *
 *   "A caller who can run arbitrary SQL as the application role writes the marker HIMSELF … attacker
 *    and application share ONE database role and the trigger can only read the row, never observe who
 *    authored it."
 *
 * **This file exists because that sharing has ended.** The runtime now connects as `qmulate_app`,
 * which holds no `INSERT` on `waqf_access_grant` and owns no table. So the forged chain fails on its
 * LAST statement with `42501 permission denied for table waqf_access_grant`, and the marker it wrote
 * is irrelevant — the question is no longer about rows.
 *
 * ── ⚠ WHY EVERY REFUSAL HERE IS ASSERTED ON `basePrisma()` AND NEVER ON `privilegedPrisma()` ──────
 * MEASURED: the local embedded cluster's default role is `rolsuper = true, rolbypassrls = true`, and a
 * superuser bypasses table GRANTs, ownership checks AND `FORCE ROW LEVEL SECURITY`. A refusal test run
 * on it would pass for entirely the wrong reason, and nothing in the test body would look wrong.
 * `assertGuardsInstalled()` therefore calls `assertRefusalConnectionIsRestricted()`, which FAILS
 * (never skips) when the connection making these claims is superuser or holds BYPASSRLS. If you are
 * reading this because that assertion failed, the suite is telling you the run cannot prove anything
 * — not that it is misconfigured in a way you should work around.
 *
 * ── ⚠ EVERY MUTATION IN THIS FILE IS RUN, NOT DESCRIBED ─────────────────────────────────────────
 * Each control below is paired with the specific change that removes it, executed for real on the
 * owner connection and restored in a `finally`. `qmulate_apply_privilege_matrix()` is re-applied
 * afterwards, and `assertGuardsInstalled()` in the next file's `beforeAll` fails loudly if any guard
 * was left in a state other than `ENABLE ALWAYS`. A source-shape assertion is not proof and there are
 * none here.
 *
 * ── WHAT THIS FILE DOES **NOT** PROVE, STATED SO NOBODY QUOTES IT AS MORE ───────────────────────
 *   1. It does not prove anything about production. Which credential a deployed service holds is a
 *      DEPLOYMENT fact; the closest thing to a test is `assertNoPrivilegedDatabaseUrls()` at each
 *      app's boot, and that only catches the variable being present in the same process.
 *   2. It does not close code running inside the web process. `provisionAccessGrant()` is reachable
 *      from `packages/api`, and case 7 MEASURES that whoever holds the provisioner credential can
 *      still forge a marker. The remaining integrity of that path is bounded by who can reach the
 *      credential, which is ADR-0008's round-6 open question 1 and is not settled here.
 *   3. It does not make `packages/database`'s cross-endowment READS scoped. That residual is pinned
 *      elsewhere (`base-client-bypass.integration.test.ts`) and is untouched.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertGuardsInstalled,
  basePrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  hasDatabase,
  privilegedPrisma,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('ADR-0008 round 6 · privilege separation of the authorization plane');

const WAQF = 'waqf-001';
/** The attacker: a plain FINANCE seat. No admin verb, no approve verb. */
const FINANCE = 'user-accountant-001';
/** PO-1's seeded access-matrix administrator — the impersonation target of route 2. */
const SEEDED_ADMIN = 'user-admin-001';
const GRANT_PREFIX = 'grant-priv-9';
const PAST = `'2026-01-01T00:00:00.000Z'`;

/**
 * Makes every forged `rowHash` unique to this process.
 *
 * ⚠ MEASURED NECESSARY, AND IT IS THE FOURTH FALSE NEGATIVE OF THIS SHAPE IN THE SPRINT.
 * `audit_event` has a UNIQUE index on `rowHash`. A fixed literal collides with a row an EARLIER run
 * left behind and the attempt fails with `23505 Key ("rowHash")=… already exists` — which this file
 * would then report as "the write was refused", i.e. as a control that does not exist. The three
 * previous instances (a unique-index collision on `waqf_access_grant`, a future-dated `validFrom`,
 * and an FK on an unseeded database) are all recorded in the round-2 re-attack notes.
 */
const RUN_NONCE = `${String(process.pid)}-${String(Date.now())}`;

interface RawClient {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  /**
   * ⚠ ADDED IN S4/E3 ROUND 2 (V3): assertion 1f's `ALTER DEFAULT PRIVILEGES` probe has ALWAYS used
   * `owner.$transaction`, and this interface has always omitted it — so `owner.$transaction` was an
   * error and `tx` inside it an implicit `any`, which meant the `<{ acl: string | null }[]>` type
   * argument on the read was silently discarded. Nobody saw it because `tsconfig.json` included
   * `tests/**` (with an s) and the directory is `test/`.
   *
   * The callback's handle is a `RawClient` too — the two statements and the read must share ONE
   * session, which is the entire point of the interactive transaction there.
   */
  $transaction: <T>(fn: (tx: RawClient) => Promise<T>) => Promise<T>;
}

/** A raw grant INSERT — the last statement of the route-2 chain. */
function grantSql(id: string): string {
  return `INSERT INTO "waqf_access_grant"
      ("id","userId","waqfId","role","permissions","dataScopes","canViewAmlRestricted",
       "amlCompartment","beneficiarySelfId","scopeRefs","grantedByUserId","validFrom","validUntil",
       "revokedAt","createdAt","updatedAt")
    VALUES ('${id}','${FINANCE}','${WAQF}','NAZIR'::"Role",
            ARRAY['approval:request:read','approval:request:approve']::text[], ARRAY[]::text[],
            false, false, NULL, ARRAY[]::text[],
            '${SEEDED_ADMIN}', ${PAST}, NULL, NULL, now(), now())`;
}

/**
 * A FORGED admission marker naming the seeded admin, as a plpgsql statement assigning the event id.
 *
 * `rowHash` is derived from `tag` because `audit_event` has a UNIQUE index on it; a repeated literal
 * trips 23505 and masks the control under test behind the wrong error. `occurredAt` is a fixed UTC
 * literal, never `now()` — the column is `timestamp WITHOUT time zone` and SQL `now()` writes local
 * wall-clock, which once made forged grants future-dated and therefore merely inactive rather than
 * refused. Both were false negatives in an earlier round.
 *
 * ⚠ MIGRATION 23 · THE HASH COLUMNS ARE NO LONGER THE CALLER'S TO INVENT, and this helper had to
 * change because of it. `audit_event_chain_bound` (BEFORE INSERT, ENABLE ALWAYS) recomputes
 * `prevHash` and `rowHash` SERVER-SIDE and refuses a mismatch, and it refuses any append made
 * without `pg_advisory_xact_lock(7233057419042001)` — so the old `repeat('0',64)` / `sha256(tag)`
 * pair is now rejected by name. The row is therefore built the way the guard demands: the lock is
 * taken, the id is allocated from the sequence FIRST (the id is one of the fourteen hashed fields),
 * and both hashes come from `qmulate_audit_expected_prev_hash()` / `qmulate_audit_row_hash()`.
 *
 * ⚠ THIS DOES NOT WEAKEN THE FIXTURE — IT MAKES IT FAITHFUL. The row's CONTENT is byte-identical to
 * before; only the two hash columns changed, from values no writer could have produced to the values
 * the real writer would have produced. That is exactly the attacker capability AV7-AUD-F1's residual
 * describes (the hashing algorithm is in the repository, so a forger can compute correct hashes),
 * and it is the shape the admission guard must be proven against. `rowHash` is now unique for free,
 * because the id is inside the hash, so `RUN_NONCE` is no longer load-bearing for it.
 */
function markerSql(tag: string, grantId: string): string {
  return `PERFORM pg_advisory_xact_lock(7233057419042001);
    ev := nextval(pg_get_serial_sequence('public."audit_event"', 'id'));
    INSERT INTO "audit_event"
      ("id","occurredAt","occurredAtHijri","actorId","actorType","onBehalfOfId","action",
       "entityType","entityId","waqfId","before","after","context","category","classification",
       "prevHash","rowHash")
    VALUES (ev, '2026-07-29T00:00:00.000Z'::timestamp, '1448-02-14',
            '${SEEDED_ADMIN}', 'USER'::"AuditActorType", NULL,
            'CREATE'::"AuditAction", 'WaqfAccessGrant', '${grantId}', '${WAQF}',
            NULL, '{"forged":"${tag}-${RUN_NONCE}"}'::jsonb,
            '{"probe":"${tag}","fixture":"round-6 privilege test row (بيانات وهمية)"}'::jsonb,
            'MUTATION'::"AuditCategory", 'ROUTINE'::"AuditClassification",
            qmulate_audit_expected_prev_hash(ev),
            qmulate_audit_row_hash(
              ev, '2026-07-29T00:00:00.000Z'::timestamp, '${SEEDED_ADMIN}', 'USER', NULL,
              'CREATE', 'WaqfAccessGrant', '${grantId}', '${WAQF}', NULL,
              '{"forged":"${tag}-${RUN_NONCE}"}'::jsonb,
              '{"probe":"${tag}","fixture":"round-6 privilege test row (بيانات وهمية)"}'::jsonb,
              'MUTATION', 'ROUTINE', qmulate_audit_expected_prev_hash(ev)))`;
}

const advanceHead = (): string =>
  `UPDATE "audit_chain_head"
      SET "lastId" = ev,
          "lastRowHash" = (SELECT "rowHash" FROM "audit_event" WHERE "id" = ev),
          "updatedAt" = now()
    WHERE "id" = 1`;

/**
 * Wraps plpgsql statements as ONE autocommitted `DO` block.
 *
 * ⚠ THE `DO` BLOCK IS LOAD-BEARING AND SO IS `SET CONSTRAINTS ALL IMMEDIATE` WHERE IT APPEARS.
 * MEASURED: `waqf_access_grant_admission` is a CONSTRAINT trigger, `DEFERRABLE INITIALLY DEFERRED`
 * (`pg_trigger.tgdeferrable = true, tginitdeferred = true`), so it fires at COMMIT — not at the
 * INSERT. A probe that inserts inside `BEGIN … ROLLBACK` never makes it fire at all, and reads as
 * "the write was permitted" when the guard simply never ran. That is a false negative this file must
 * not produce, and it is the single easiest mistake to make against this trigger.
 */
function doBlock(statements: readonly string[]): string {
  return [
    'DO $qmpriv$',
    'DECLARE ev bigint;',
    'BEGIN',
    ...statements.map((s) => `  ${s};`),
    'END',
    '$qmpriv$;',
  ].join('\n');
}

interface Posture {
  currentUser: string;
  currentUserIsSuperuser: boolean;
  currentUserBypassesRls: boolean;
  roles: Record<
    string,
    {
      canLogin: boolean;
      superuser: boolean;
      bypassRls: boolean;
      createRole: boolean;
      createDb: boolean;
      memberOf: string[];
    }
  >;
  inventory: { tables: number; functions: number; sequences: number };
  tableOwners: Record<string, number>;
  functionOwners: Record<string, number>;
  sequenceOwners: Record<string, number>;
  appPrivileges: Record<string, string[]>;
  provisionerPrivileges: Record<string, string[]>;
  rls: Record<string, { enabled: boolean; forced: boolean; policies: string[] }>;
  securityDefinerFunctions: Record<string, string>;
  publicExecutableFunctions: string[];
}

describe.skipIf(!hasDatabase)('ADR-0008 round 6 · privilege separation', () => {
  let app: RawClient;
  let owner: RawClient;

  /** Runs SQL on the RESTRICTED connection. Returns the flattened error, or `null` if PERMITTED. */
  const attempt = async (sql: string): Promise<string | null> => {
    try {
      await app.$executeRawUnsafe(sql);
      return null;
    } catch (error: unknown) {
      return errorText(error);
    }
  };

  /**
   * Runs statements on the OWNER connection, one at a time, and raises. Scaffolding and mutations only.
   *
   * ⚠ ONE STATEMENT PER CALL, ALWAYS. Prisma sends `$executeRawUnsafe` as a PREPARED statement, and
   * Postgres refuses a prepared statement carrying more than one command with
   * `42601 cannot insert multiple commands into a prepared statement`. A helper that accepted a
   * semicolon-separated script would fail with that error and read as "the statement was refused" —
   * a false negative in exactly the direction this file must never produce.
   */
  const asOwner = async (...statements: readonly string[]): Promise<void> => {
    for (const statement of statements) await owner.$executeRawUnsafe(statement);
  };

  /**
   * Runs statements on the RESTRICTED connection inside an explicit transaction that ALWAYS rolls
   * back, and returns the first error (or `null` if every statement was permitted).
   *
   * ⚠ `SET CONSTRAINTS ALL IMMEDIATE` IS NOT OPTIONAL WHERE A DEFERRED GUARD IS UNDER TEST.
   * `waqf_access_grant_admission` is `DEFERRABLE INITIALLY DEFERRED`, so inside an explicit
   * transaction it does not fire until COMMIT — and this helper never commits. Callers that need it
   * to fire pass it as the last statement.
   *
   * ⚠ AND NOTHING HERE MAY COMMIT A FORGED `audit_event`. The forged markers this file writes carry
   * `prevHash = repeat('0', 64)` and advance `audit_chain_head`, so committing one would FORK THE
   * HASH CHAIN and turn the G-1 chain-continuity assertions in other files red for a reason that has
   * nothing to do with them. Every marker write is therefore inside a rolled-back transaction. (Case
   * 2a is the exception and is safe: it FAILS, so its autocommitting `DO` block commits nothing.)
   */
  const attemptInRolledBackTx = async (
    client: RawClient,
    statements: readonly string[],
  ): Promise<string | null> => {
    let failure: string | null = null;
    await client.$executeRawUnsafe('BEGIN');
    try {
      for (const statement of statements) await client.$executeRawUnsafe(statement);
    } catch (error: unknown) {
      failure = errorText(error);
    } finally {
      await client.$executeRawUnsafe('ROLLBACK').catch(() => undefined);
    }
    return failure;
  };

  const posture = async (): Promise<Posture> => {
    const rows = await owner.$queryRawUnsafe<{ p: Posture }[]>(
      `SELECT qmulate_assert_privilege_separation() AS p`,
    );
    const value = rows[0]?.p;
    if (!value) throw new Error('qmulate_assert_privilege_separation() returned nothing.');
    return value;
  };

  const grantExists = async (id: string): Promise<boolean> => {
    const rows = await app.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM "waqf_access_grant" WHERE "id" = '${id}'`,
    );
    return rows[0]?.n !== '0';
  };

  const isActiveNazir = async (userId: string): Promise<boolean> => {
    const rows = await app.$queryRawUnsafe<{ active: boolean }[]>(
      `SELECT qmulate_has_active_grant('${userId}','${WAQF}','NAZIR') AS active`,
    );
    return rows[0]?.active === true;
  };

  beforeAll(async () => {
    // `assertGuardsInstalled()` also runs `assertRefusalConnectionIsRestricted()` and requires
    // MIGRATOR_DATABASE_URL, so this single call is what makes every claim below meaningful.
    await assertGuardsInstalled();
    ensureSeeded();
    app = (await basePrisma()) as unknown as RawClient;
    owner = (await privilegedPrisma()) as unknown as RawClient;
  }, 300_000);

  afterAll(async () => {
    await closeDatabase();
  });

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // 1 · THE POSTURE IS PRESENT — AND THIS TEST IS THE HARD FAILURE THE MIGRATION CANNOT BE
  // ═════════════════════════════════════════════════════════════════════════════════════════
  //
  // Migration 10 §4 tolerates missing roles with a `RAISE NOTICE`, because a hard failure there would
  // break `prisma migrate dev` on a fresh cluster. The consequence, written into that migration's
  // header, is that a database where provisioning never ran ends up migrated, seeded and green over a
  // completely unenforced matrix. THIS is where that becomes a red build. Deleting this describe block
  // deletes the only thing that notices.

  describe('1 · the live posture, read from the catalogue', () => {
    it('1a · all three roles exist, and NONE is SUPERUSER or BYPASSRLS', async () => {
      const p = await posture();
      const names = ['qmulate_app', 'qmulate_provisioner', 'qmulate_owner'];

      expect(
        Object.keys(p.roles).sort(),
        'the three separated roles are not all present — run `pnpm exec tsx scripts/provision-db-roles.ts`. ' +
          'Migration 10 degrades to a NOTICE when they are missing, so a database in that state is ' +
          'migrated, seeded and GREEN with the authorization plane unprotected at the privilege layer.',
      ).toEqual([...names].sort());

      for (const name of names) {
        const role = p.roles[name];
        expect(role, `${name} is missing`).toBeDefined();
        // ⚠ BOTH ATTRIBUTES ARE MANDATORY, AND NOT FOR TIDINESS. `FORCE ROW LEVEL SECURITY`
        // (migration 11) binds neither a superuser nor a BYPASSRLS role, so either attribute makes
        // that whole migration decorative — and a superuser additionally ignores every GRANT in
        // migration 10 and every ownership check.
        expect(role?.superuser, `${name} is SUPERUSER — every control here is decorative`).toBe(
          false,
        );
        expect(role?.bypassRls, `${name} holds BYPASSRLS — FORCE RLS does not bind it`).toBe(false);
        expect(role?.canLogin, `${name} cannot LOGIN, so nothing can connect as it`).toBe(true);
        expect(
          role?.createRole,
          `${name} holds CREATEROLE, which lets it create a role with any attribute and become it`,
        ).toBe(false);
        // No role may be a MEMBER of another: one `SET ROLE` would otherwise hand the request path
        // the owner's entire privilege set.
        expect(role?.memberOf, `${name} is a member of another separated role`).toEqual([]);
      }
    });

    it('1b · everything in schema public is owned by qmulate_owner, and the inventory is asserted', async () => {
      const p = await posture();

      // Asserted rather than trusted to a loop: "the ownership pass ran" and "the ownership pass
      // covered everything" are different claims, and only the second one matters.
      expect(Object.keys(p.tableOwners), 'more than one role owns tables in public').toEqual([
        'qmulate_owner',
      ]);
      expect(Object.keys(p.functionOwners), 'more than one role owns functions in public').toEqual([
        'qmulate_owner',
      ]);
      expect(Object.keys(p.sequenceOwners), 'more than one role owns sequences in public').toEqual([
        'qmulate_owner',
      ]);

      // MEASURED on a migrated database: 38 tables (37 business + `_prisma_migrations`), 1 sequence
      // (`audit_event_id_seq` — the only autoincrement column in the schema). A lower bound rather
      // than an equality so adding a table is not a spurious failure, but a DROP is.
      expect(p.inventory.tables, 'fewer tables than a migrated schema has').toBeGreaterThanOrEqual(
        38,
      );
      expect(p.inventory.sequences).toBe(1);
      expect(p.inventory.functions).toBeGreaterThanOrEqual(39);
    });

    it('1c · the runtime role holds SELECT and NOTHING ELSE on the authorization plane', async () => {
      const p = await posture();

      for (const table of ['waqf_access_grant', 'membership']) {
        expect(
          p.appPrivileges[table],
          `qmulate_app holds a write privilege on ${table}. That is ADR-0008's route 2, reopened.`,
        ).toEqual(['SELECT']);
      }

      // ⚠ SELECT MUST STAY, and it is not a concession: `packages/api/src/context.ts`'s
      // `resolveGrants()` reads both tables BEFORE a request context exists (a genuine
      // chicken-and-egg), and the scoping force filter reads grants on every query. Revoking SELECT
      // would break every authenticated request.
      const grantRows = await app.$queryRawUnsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM "waqf_access_grant"`,
      );
      expect(Number(grantRows[0]?.n ?? 0), 'the runtime role cannot READ grants').toBeGreaterThan(
        0,
      );
    });

    it('1d · audit_event keeps INSERT for every role and nothing more', async () => {
      const p = await posture();
      expect(
        p.appPrivileges.audit_event?.sort(),
        'audit_event must be INSERT + SELECT for the runtime role: INSERT because append-only ' +
          'REQUIRES it, SELECT because verification reads the chain. UPDATE/DELETE/TRUNCATE must be ' +
          'absent.',
      ).toEqual(['INSERT', 'SELECT']);
      expect(p.provisionerPrivileges.audit_event?.sort()).toEqual(['INSERT', 'SELECT']);
      // The chain head is UPDATEd on every audited write, so UPDATE is required here and only here.
      expect(p.appPrivileges.audit_chain_head?.sort()).toEqual(['INSERT', 'SELECT', 'UPDATE']);
    });

    it('1e · FORCE ROW LEVEL SECURITY is on the authorization plane, with both policies', async () => {
      const p = await posture();
      for (const table of ['waqf_access_grant', 'membership']) {
        const entry = p.rls[table];
        expect(entry?.enabled, `RLS is not enabled on ${table}`).toBe(true);
        // ⚠ WITHOUT `FORCE`, POLICIES DO NOT APPLY TO THE TABLE OWNER and migration 11 is a comment.
        expect(
          entry?.forced,
          `RLS is not FORCEd on ${table} — the owner bypasses every policy`,
        ).toBe(true);
        expect(entry?.policies?.sort()).toEqual(
          [`${table}_privileged_write`, `${table}_read_all`].sort(),
        );
      }
    });

    it('1f · no SECURITY DEFINER function is executable by PUBLIC or by the runtime role', async () => {
      const p = await posture();

      // ⚠ THIS IS THE ONE MEASURED SILENT FULL ESCALATION, AND THE TEST MUST EXIST BEFORE THE FIRST
      // SECURITY DEFINER FUNCTION DOES. MEASURED: a freshly created function has `proacl = NULL`,
      // which MEANS EXECUTE IS GRANTED TO PUBLIC. An owner-owned SECURITY DEFINER function with a
      // default ACL was called successfully as the app role, and `current_user` INSIDE it was the
      // OWNER — a complete escalation from one forgotten line, invisible in the migration that adds
      // it. Migration 10 §2.4 revokes EXECUTE from PUBLIC and grants it back only on
      // `prosecdef = false` functions.
      expect(
        p.securityDefinerFunctions,
        'a SECURITY DEFINER function exists in schema public. Review its ACL by hand and extend this ' +
          'assertion — a SECURITY DEFINER function callable by qmulate_app runs as qmulate_owner and ' +
          'is a complete privilege escalation.',
      ).toEqual({});

      expect(
        p.publicExecutableFunctions,
        'some function in schema public still grants EXECUTE to PUBLIC (proacl NULL counts). Harmless ' +
          'for SECURITY INVOKER functions, fatal for a SECURITY DEFINER one — and the default is ' +
          'PUBLIC, so this must be asserted rather than assumed.',
      ).toEqual([]);
    });

    it('1f-ENVIRONMENT · ALTER DEFAULT PRIVILEGES does NOT protect a future function, so the sweep is the only mechanism', async () => {
      // ⚠ THIS TEST PINS A MEASURED POSTGRES FACT, NOT A POLICY, AND IT EXISTS BECAUSE THE REPO
      // BELIEVED THE OPPOSITE FOR TWO MIGRATIONS.
      //
      // Migration 10 §2.4 ran `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS
      // FROM PUBLIC` and its comment reads as though FUTURE functions are therefore covered. They are
      // NOT. Measured on PostgreSQL 17.10 as `qmulate_owner` — the role that applies every migration:
      // that statement stores NO `pg_default_acl` row when none exists (REVOKE only DELETES an
      // explicit row), and "no row" means the BUILT-IN default, which for FUNCTIONS grants EXECUTE to
      // PUBLIC. Identical bare or inside a plpgsql `DO` block.
      //
      // Consequence: S4's migration 12 was the first migration since 10 to add a function, and all
      // five of its functions landed PUBLIC-executable on a fresh database — caught by 1f above,
      // exactly as designed. The remedy is `qmulate_revoke_public_function_execute()`, called at the
      // end of any migration that adds a function.
      //
      // If a future Postgres changes this behaviour, THIS TEST GOES RED — which is the correct
      // outcome: the sweep could then be replaced by the default, deliberately, by someone reading
      // this comment. What must never happen is the reliance being re-introduced silently.
      const inherited = await owner
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',
          );
          await tx.$executeRawUnsafe(
            `CREATE OR REPLACE FUNCTION qmulate_probe_default_acl_1f() RETURNS int
             LANGUAGE sql AS $probe$ SELECT 1 $probe$`,
          );
          const rows = await tx.$queryRawUnsafe<{ acl: string | null }[]>(
            `SELECT array_to_string(p.proacl, ',') AS acl
             FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'qmulate_probe_default_acl_1f'`,
          );
          // An interactive transaction, so both statements and the read share ONE session, and the
          // rollback below undoes the default-privileges change and the probe function together.
          throw Object.assign(new Error('QMULATE_PROBE_ROLLBACK'), { acl: rows[0]?.acl ?? null });
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.message === 'QMULATE_PROBE_ROLLBACK') {
            return (error as Error & { acl: string | null }).acl;
          }
          throw error;
        });

      expect(
        inherited,
        'a function created immediately after `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON ' +
          'FUNCTIONS FROM PUBLIC` came out with a NON-null ACL, which would mean this Postgres DOES ' +
          'apply the default to future functions. If that is now true, the sweep in migration 12 can ' +
          'be retired — deliberately, and with migration 10 §2.4 re-read first.',
      ).toBeNull();

      // And the sweep function that DOES hold is present, so the mechanism is not just a comment.
      const sweep = await owner.$queryRawUnsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'qmulate_revoke_public_function_execute'`,
      );
      expect(
        sweep[0]?.n,
        'qmulate_revoke_public_function_execute() is missing. It is the ONLY mechanism that keeps ' +
          'PUBLIC from executing a newly added function — see the measurement above.',
      ).toBe('1');
    });

    it('1f-MUTATION · granting EXECUTE to PUBLIC on one function is DETECTED', async () => {
      // Run for real, on the owner connection, inside a transaction that rolls back. DDL and ACL
      // changes are transactional in Postgres, so nothing survives — but the posture function is
      // queried INSIDE the transaction, so the detection is measured rather than argued.
      let rows: { detected: string[] }[] = [];
      await owner.$executeRawUnsafe('BEGIN');
      try {
        await owner.$executeRawUnsafe('GRANT EXECUTE ON FUNCTION qmulate_runtime_role() TO PUBLIC');
        rows = await owner.$queryRawUnsafe<{ detected: string[] }[]>(
          `SELECT (qmulate_assert_privilege_separation() -> 'publicExecutableFunctions') AS detected`,
        );
      } finally {
        await owner.$executeRawUnsafe('ROLLBACK').catch(() => undefined);
      }

      expect(
        rows[0]?.detected,
        'the posture function did NOT notice a function granted EXECUTE to PUBLIC, so assertion 1f ' +
          'proves nothing and a SECURITY DEFINER escalation would pass unseen.',
      ).toContain('qmulate_runtime_role');

      // And the rollback really did undo it.
      const after = await posture();
      expect(after.publicExecutableFunctions).toEqual([]);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // 2 · ROUTE 2, DRIVEN END TO END AS `qmulate_app`, AND REFUSED
  // ═════════════════════════════════════════════════════════════════════════════════════════

  describe('2 · route 2 · the forged-marker chain', () => {
    it('2a · the full chain is REFUSED, the grant does not exist, and the FINANCE seat is not NAZIR', async () => {
      const id = `${GRANT_PREFIX}01`;
      expect(await isActiveNazir(FINANCE), 'the attacker already holds NAZIR here').toBe(false);

      // The precondition of the whole attack: the impersonation target really does hold the verb, so
      // a refusal below cannot be explained away as "the marker named nobody useful".
      const [pre] = await app.$queryRawUnsafe<{ holds: boolean }[]>(
        `SELECT qmulate_actor_holds_permission('${SEEDED_ADMIN}','${WAQF}','admin:access_matrix:write')
                  AS holds`,
      );
      expect(pre?.holds, 'PO-1’s seeded admin seat is gone — this case proves nothing').toBe(true);

      const refusal = await attempt(doBlock([markerSql('r2a', id), advanceHead(), grantSql(id)]));

      expect(
        refusal,
        'ROUTE 2 WAS PERMITTED. The forged-marker chain minted a NAZIR seat for a FINANCE user from ' +
          'the runtime database role — which is ADR-0008’s central finding, reopened. Check that ' +
          '`scripts/provision-db-roles.ts` ran and that DATABASE_URL connects as qmulate_app.',
      ).not.toBeNull();

      // ⚠ THE **REASON** IS THE DELIVERABLE, NOT MERELY THE REFUSAL. Five rounds of this sprint
      // produced refusals that came from the wrong control — a unique-index collision, a future-dated
      // `validFrom`, an FK on an unseeded database — and each read as a closed hole. So the SQLSTATE
      // and the object are both pinned: this must be the PRIVILEGE layer refusing an INSERT on
      // `waqf_access_grant`, not the admission trigger and not an accident.
      expect(refusal).toMatch(/42501|permission denied/i);
      expect(
        refusal,
        'the refusal did not name waqf_access_grant — something else refused first, and this case is ' +
          'no longer measuring the privilege on the authorization plane.',
      ).toMatch(/waqf_access_grant/);

      expect(await grantExists(id)).toBe(false);
      expect(await isActiveNazir(FINANCE)).toBe(false);
    });

    it('2b · the marker on its own is still writable — which is WHY the privilege had to be the control', async () => {
      // ⚠ THIS IS NOT A HOLE, IT IS THE PROOF THAT THE OLD APPROACH COULD NOT WORK. `audit_event`
      // MUST accept INSERTs from the runtime role — that is what append-only means, and it is the
      // reason migration 10 keeps INSERT. So the attacker can still write a marker naming anyone; it
      // simply buys nothing now, because the statement it was meant to admit is refused before the
      // trigger is ever consulted. Any scheme that tried to make the marker unforgeable was doomed
      // for exactly this reason (migration 9's header).
      // Rolled back, deliberately: a COMMITTED forged marker would fork the audit hash chain (see
      // `attemptInRolledBackTx`). The claim under test is only "the INSERT is permitted".
      const markerOnly = await attemptInRolledBackTx(app, [
        doBlock([markerSql('r2b', `${GRANT_PREFIX}02`), advanceHead()]),
      ]);
      expect(
        markerOnly,
        'the runtime role can no longer INSERT into audit_event. That breaks append-only auditing ' +
          '(NFR-04) — every audited write emits an event on this connection.',
      ).toBeNull();

      // And the grant that marker was written to admit is still refused.
      expect(await attempt(grantSql(`${GRANT_PREFIX}02`))).toMatch(/permission denied/i);
      expect(await grantExists(`${GRANT_PREFIX}02`)).toBe(false);
    });

    it('2a-MUTATION · with INSERT re-granted to the runtime role, the RLS latch STILL refuses', async () => {
      // ⚠ THE MUTATION IS PERFORMED FOR REAL, AND IT IS THE ONLY WAY TO KNOW MIGRATION 11 IS DOING
      // WORK. The GRANT is issued on the OWNER connection and COMMITTED, because a rolled-back GRANT
      // is invisible to the app connection's separate session — an ACL change has to commit to be
      // seen. It is restored in `finally`, and the whole matrix is re-applied afterwards.
      const id = `${GRANT_PREFIX}03`;
      let withGrant: string | null = 'not-attempted';
      try {
        await asOwner('GRANT INSERT ON TABLE "waqf_access_grant" TO qmulate_app');
        withGrant = await attempt(doBlock([markerSql('r2m', id), advanceHead(), grantSql(id)]));
      } finally {
        await asOwner('REVOKE INSERT ON TABLE "waqf_access_grant" FROM qmulate_app');
        await asOwner('SELECT qmulate_apply_privilege_matrix()');
      }

      expect(
        withGrant,
        'with INSERT re-granted the chain was PERMITTED, which means the REVOKE in migration 10 is ' +
          'the ONLY thing standing between this repository and ADR-0008’s route 2 — and migration ' +
          '11’s RLS latch is not doing the second-latch job its header claims. One loosened GRANT in ' +
          'a future migration would then reopen the whole finding.',
      ).not.toBeNull();
      // MEASURED: `42501 new row violates row-level security policy for table "waqf_access_grant"`.
      // RLS RAISES on INSERT (there is no row to filter) — which is exactly why migration 11 protects
      // the INSERT side and why it must NOT be trusted for UPDATE/DELETE, where an absent policy is a
      // silent zero-row no-op instead.
      expect(withGrant).toMatch(/row-level security|permission denied/i);
      expect(await grantExists(id)).toBe(false);

      // The posture is back.
      const p = await posture();
      expect(p.appPrivileges.waqf_access_grant).toEqual(['SELECT']);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // 3 · THE DDL RESIDUAL — THE OTHER HALF OF ADR-0008's OPEN ITEM
  // ═════════════════════════════════════════════════════════════════════════════════════════

  describe('3 · DDL and session-level bypasses', () => {
    const cases: readonly { what: string; sql: string; expect: RegExp }[] = [
      {
        what: 'ALTER TABLE … DISABLE TRIGGER (the round-4 measurement: "PERMITTED")',
        sql: 'ALTER TABLE "waqf_access_grant" DISABLE TRIGGER waqf_access_grant_admission',
        expect: /must be owner|permission denied/i,
      },
      {
        what: 'DROP TRIGGER',
        sql: 'DROP TRIGGER waqf_access_grant_admission ON "waqf_access_grant"',
        expect: /must be owner|permission denied/i,
      },
      {
        what: 'ALTER TABLE … DROP CONSTRAINT (no_self_issue is a CHECK, not a trigger)',
        sql: 'ALTER TABLE "waqf_access_grant" DROP CONSTRAINT waqf_access_grant_no_self_issue',
        expect: /must be owner|permission denied/i,
      },
      {
        what: 'CREATE OR REPLACE FUNCTION on the admission guard itself',
        sql:
          'CREATE OR REPLACE FUNCTION qmulate_grant_admission() RETURNS trigger LANGUAGE plpgsql ' +
          'AS $x$ BEGIN RETURN NULL; END $x$',
        expect: /permission denied for schema public|must be owner/i,
      },
      {
        // ⚠ THIS ONE RETIRES A WHOLE CLASS. Since Sprint 1 every guard in this schema has been
        // `ENABLE ALWAYS` because one `SET session_replication_role = 'replica'` skips a plain
        // trigger — that is the finding that defeated gate G-1 outright. Setting the parameter needs
        // superuser, so the runtime role cannot even attempt it now. `ENABLE ALWAYS` stays, as
        // defence in depth against a privileged caller.
        what: "SET session_replication_role = 'replica' (the G-1 bypass class)",
        sql: "SET session_replication_role = 'replica'",
        expect: /permission denied to set parameter/i,
      },
      {
        what: 'SET ROLE to the owner',
        sql: 'SET ROLE qmulate_owner',
        expect: /permission denied to set role/i,
      },
      {
        what: 'TRUNCATE audit_event',
        sql: 'TRUNCATE "audit_event"',
        expect: /permission denied for table audit_event/i,
      },
      {
        what: 'CREATE TABLE in schema public',
        sql: 'CREATE TABLE "zzz_privilege_probe" ("a" integer)',
        expect: /permission denied for schema public/i,
      },
      {
        what: 'CREATE SCHEMA (which is what pg-boss will one day want — it must NOT be pre-authorised)',
        sql: 'CREATE SCHEMA "zzz_privilege_probe"',
        expect: /permission denied for database/i,
      },
      {
        what: 'DELETE on a corpus table (asl / أصل — Binding rule 1 non-diminution)',
        sql: `DELETE FROM "asset" WHERE "id" = 'asset-001'`,
        expect: /permission denied for table asset/i,
      },
      {
        what: 'UPDATE on membership (the second authorization-plane table)',
        sql: `UPDATE "membership" SET "role" = 'FAMILY_BOARD'`,
        expect: /permission denied for table membership/i,
      },
    ];

    for (const testCase of cases) {
      it(`3 · REFUSED as qmulate_app — ${testCase.what}`, async () => {
        const refusal = await attempt(testCase.sql);
        expect(
          refusal,
          `PERMITTED as the runtime role: ${testCase.sql}. ADR-0008's DDL residual is open again.`,
        ).not.toBeNull();
        expect(refusal).toMatch(testCase.expect);
      });
    }

    it('3-MUTATION · the IDENTICAL statement is PERMITTED on the owner connection', async () => {
      // ⚠ THE MUTATION HERE IS THE CONNECTION, NOT THE SCHEMA, AND THAT IS THE STRONGER FORM.
      //
      // The intended mutation was `ALTER TABLE "setting" OWNER TO qmulate_app`, then re-run the
      // DISABLE as the app role. MEASURED, IT CANNOT BE DONE: the owner gets
      // `42501 must be able to SET ROLE "qmulate_app"` — Postgres requires the grantor to be a member
      // of the role it hands ownership to, and `provision-db-roles.ts` deliberately grants no
      // membership between the three roles (case 1a pins `memberOf: []`). So `qmulate_owner` cannot
      // give the runtime role ownership of anything even if it tried, which is a property worth
      // knowing and is asserted below.
      //
      // What is left is the mutation that actually isolates the variable: run the SAME statement on
      // the connection that DOES own the table. If it is permitted there and refused on the app
      // connection, the refusal in case 3 is attributable to ownership and to nothing else. It is
      // issued inside a transaction that ROLLS BACK — DDL is transactional in Postgres — and the
      // guard is re-asserted `ENABLE ALWAYS` afterwards regardless.
      let permittedAsOwner: string | null = 'not-attempted';
      try {
        permittedAsOwner = await attemptInRolledBackTx(owner, [
          'ALTER TABLE "setting" DISABLE TRIGGER setting_no_delete',
        ]);
      } finally {
        await asOwner('ALTER TABLE "setting" ENABLE ALWAYS TRIGGER setting_no_delete');
      }

      expect(
        permittedAsOwner,
        'even the OWNER could not disable the trigger, so case 3 above is not measuring ownership at ' +
          'all — it is measuring something else, and the DDL claim in ADR-0008’s round-6 addendum ' +
          'would be unfounded.',
      ).toBeNull();

      // And the owner cannot hand that power to the runtime role either.
      const handover = await attemptInRolledBackTx(owner, [
        'ALTER TABLE "setting" OWNER TO qmulate_app',
      ]);
      expect(
        handover,
        'qmulate_owner was able to make qmulate_app the owner of a table. A role membership must have ' +
          'been granted between the two, which case 1a is supposed to forbid — one `SET ROLE` then ' +
          'hands the request path the owner’s entire privilege set.',
      ).toMatch(/must be able to SET ROLE/i);

      // The guard is back and ownership never moved.
      const p = await posture();
      expect(Object.keys(p.tableOwners)).toEqual(['qmulate_owner']);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // 4 · `audit_event` — WHICH CONTROL FIRES, PER VERB. BELT AND BRACES, NAMED.
  // ═════════════════════════════════════════════════════════════════════════════════════════
  //
  // ⚠ THE POINT OF THIS BLOCK IS THAT THE TWO CONTROLS ARE DISTINGUISHED. It would be easy to ship a
  // green suite in which the append-only TRIGGERS had silently stopped mattering because the privilege
  // now refuses first — and then a privileged caller (the owner, a migration, an ops script) would
  // find `audit_event` mutable. So each verb is probed twice: once on the restricted connection, where
  // the PRIVILEGE must refuse, and once on the owner connection, where the privilege is present and
  // the TRIGGER must refuse.

  describe('4 · append-only auditing: privilege AND trigger, distinguished', () => {
    it('4a · as qmulate_app, UPDATE/DELETE/TRUNCATE are refused by the PRIVILEGE', async () => {
      const update = await attempt(`UPDATE "audit_event" SET "action" = 'CREATE' WHERE "id" = 1`);
      const del = await attempt(`DELETE FROM "audit_event" WHERE "id" = 1`);
      const truncate = await attempt(`TRUNCATE "audit_event"`);

      for (const [verb, refusal] of [
        ['UPDATE', update],
        ['DELETE', del],
        ['TRUNCATE', truncate],
      ] as const) {
        expect(refusal, `${verb} on audit_event was PERMITTED for the runtime role`).not.toBeNull();
        expect(refusal, `${verb} was refused, but not by the privilege layer`).toMatch(
          /permission denied for table audit_event/i,
        );
      }
    });

    it('4b · as the OWNER — which HAS the privilege — the TRIGGER is what refuses', async () => {
      // This is the assertion that keeps migration 1's triggers load-bearing. If it ever fails while
      // 4a passes, the trail is protected only from the runtime role and is mutable by anybody with
      // the migrator credential — a materially weaker property than the one ADR-0003 records.
      const update = await attemptInRolledBackTx(owner, [
        `UPDATE "audit_event" SET "action" = 'CREATE' WHERE "id" = 1`,
      ]);
      expect(
        update,
        'the OWNER could UPDATE audit_event — the append-only trigger is gone',
      ).not.toBeNull();
      expect(
        update,
        'the owner was refused, but not by a QMULATE trigger. Read the message: if this is a bare ' +
          'privilege error the owner has lost UPDATE, and 4a can no longer distinguish the two ' +
          'controls at all.',
      ).toMatch(/append-only|immutable|audit/i);

      const truncate = await attemptInRolledBackTx(owner, [`TRUNCATE "audit_event"`]);
      expect(truncate, 'the OWNER could TRUNCATE audit_event').not.toBeNull();
    });

    it('4c · INSERT is PERMITTED for the runtime role — append-only requires it', async () => {
      const rows = await app.$queryRawUnsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM information_schema.table_privileges
          WHERE table_schema = 'public' AND table_name = 'audit_event'
            AND grantee = 'qmulate_app' AND privilege_type = 'INSERT'`,
      );
      expect(
        rows[0]?.n,
        'the runtime role has lost INSERT on audit_event. Every audited write emits its event on this ' +
          'connection, so this breaks NFR-04 outright.',
      ).toBe('1');
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // 5 · THE RUNTIME ROLE IS STILL SUFFICIENT FOR ORDINARY BUSINESS WRITES
  // ═════════════════════════════════════════════════════════════════════════════════════════
  //
  // The fixture seed used to be the demonstration of this, and it no longer is: since round 6 the
  // whole seed runs on the owner connection (its step 18 must lay down the first admin seat, which no
  // ordinary rule can authorise). So the demonstration lives here instead. Without it, a matrix that
  // was too tight in some corner would surface as an obscure 42501 in an unrelated feature months
  // later.

  describe('5 · the matrix is not too tight', () => {
    it('5a · INSERT and UPDATE on a business table are PERMITTED (rolled back)', async () => {
      const probeId = 'client-9930';
      const failure = await attemptInRolledBackTx(app, [
        `INSERT INTO "client" ("id","nameAr","nameEn","createdAt","updatedAt")
           VALUES ('${probeId}','عميل اختبار (بيانات وهمية)','Privilege probe client', now(), now())`,
        `UPDATE "client" SET "nameEn" = 'Privilege probe client v2' WHERE "id" = '${probeId}'`,
      ]);
      expect(
        failure,
        'the runtime role can no longer INSERT/UPDATE an ordinary business table. The privilege ' +
          'matrix in migration 10 is too tight and the application is broken, not merely tested.',
      ).toBeNull();

      // Nothing survived.
      const rows = await app.$queryRawUnsafe<{ n: string }[]>(
        `SELECT count(*)::text AS n FROM "client" WHERE "id" = '${probeId}'`,
      );
      expect(rows[0]?.n).toBe('0');
    });

    it('5b · the identity-plane DELETE carve-out is present, and is exactly five tables', async () => {
      const p = await posture();
      const withDelete = Object.entries(p.appPrivileges)
        .filter(([, privileges]) => privileges.includes('DELETE'))
        .map(([table]) => table)
        .sort();
      expect(
        withDelete,
        'the set of tables the runtime role may DELETE from has changed. It must be exactly the five ' +
          'better-auth owns: sign-out deletes sessions and expired verification/two_factor rows, so a ' +
          'too-broad REVOKE breaks LOGIN rather than a test — and a too-narrow one hands the request ' +
          'path hard deletion of endowment data during a ≥10-year retention window.',
      ).toEqual(['account', 'session', 'two_factor', 'user', 'verification']);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // 6 · THE PROVISIONING CONNECTION IS NARROWER, NOT EXEMPT
  // ═════════════════════════════════════════════════════════════════════════════════════════

  describe('6 · the provisioner', () => {
    it('6a · grant admission is STILL ENFORCED on the provisioning connection', async () => {
      // ⚠ THIS WAS THE PLAN'S ONE UNPROVEN ASSUMPTION, AND IT IS NOW MEASURED. An earlier probe of it
      // stopped at `23503 waqf_access_grant_userId_fkey` on an UNSEEDED database and therefore never
      // reached the trigger at all — so "the provisioner is still subject to admission" was DESIGNED,
      // not measured. It is measured here, on a seeded database, and the COMMIT is essential:
      // `waqf_access_grant_admission` is DEFERRABLE INITIALLY DEFERRED and fires at COMMIT, so a
      // `BEGIN … ROLLBACK` probe would report the write as permitted when the guard never ran.
      const { createAccessMatrixPrismaClientInternal } =
        (await import('../src/client.js')) as unknown as {
          createAccessMatrixPrismaClientInternal: (ctx: unknown) => RawClient;
        };
      const { makeSystemContext } = await databaseModule();

      const provisioner = createAccessMatrixPrismaClientInternal(
        makeSystemContext({ actorId: 'user-test-priv-provisioner', requestId: 'r6-6a' }),
      );

      const id = `${GRANT_PREFIX}06`;
      // Inside an explicit transaction, so nothing can survive — with `SET CONSTRAINTS ALL IMMEDIATE`
      // forcing the DEFERRED admission trigger to fire before the rollback. Without that line the
      // trigger would never run and this test would report the write as permitted.
      const refusal = await attemptInRolledBackTx(provisioner, [
        grantSql(id),
        'SET CONSTRAINTS ALL IMMEDIATE',
      ]);

      expect(
        refusal,
        'the PROVISIONING role minted a NAZIR seat with NO admission marker at all. The provisioning ' +
          'path is meant to be narrower than the runtime path, not exempt from it — if this passes, ' +
          'holding ACCESS_MATRIX_DATABASE_URL is equivalent to holding the whole access matrix.',
      ).not.toBeNull();
      expect(refusal, 'the refusal did not come from waqf_access_grant_admission').toMatch(
        /not writable outside the AUDITED access-matrix path/i,
      );
      expect(await grantExists(id)).toBe(false);
    });

    it('6b · the provisioner CANNOT suspend the admission trigger — it owns nothing either', async () => {
      const { createAccessMatrixPrismaClientInternal } =
        (await import('../src/client.js')) as unknown as {
          createAccessMatrixPrismaClientInternal: (ctx: unknown) => RawClient;
        };
      const { makeSystemContext } = await databaseModule();
      const provisioner = createAccessMatrixPrismaClientInternal(
        makeSystemContext({ actorId: 'user-test-priv-provisioner', requestId: 'r6-6b' }),
      );

      let refusal: string | null = null;
      try {
        await provisioner.$executeRawUnsafe(
          'ALTER TABLE "waqf_access_grant" DISABLE TRIGGER waqf_access_grant_admission',
        );
      } catch (error: unknown) {
        refusal = errorText(error);
      }
      expect(refusal, 'the provisioner can DISABLE the admission trigger').not.toBeNull();
      expect(refusal).toMatch(/must be owner of table waqf_access_grant/i);
    });

    it('6c · ⚠ THE HONEST RESIDUAL: whoever holds the provisioner credential CAN forge a marker', async () => {
      // ⚠ THIS TEST ASSERTS THAT AN ATTACK SUCCEEDS, AND THAT IS DELIBERATE — the same convention this
      // sprint used for route 2 before it was closed. A residual recorded only in prose is a residual
      // nobody is accountable for.
      //
      // The provisioner must hold INSERT on `audit_event` and `waqf_access_grant` to do its one job.
      // Those are exactly the two privileges route 2 needed. So the split does NOT protect against an
      // actor who has reached `ACCESS_MATRIX_DATABASE_URL` — it protects against an actor who has only
      // reached `DATABASE_URL`, which is every SQL-injection, every `$executeRawUnsafe` on a scoped
      // client, and every holder of the application database credential alone.
      //
      // WHAT WOULD CLOSE THIS: an out-of-process provisioner with its own operator authentication.
      // That is ADR-0008 round-6 open question 1 and it is a product-owner decision, not an
      // engineering one. Until it is answered, NO DOCUMENT MAY SAY THE AUTHORIZATION PLANE IS CLOSED
      // WITHOUT NAMING THIS BOUND.
      const { createAccessMatrixPrismaClientInternal } =
        (await import('../src/client.js')) as unknown as {
          createAccessMatrixPrismaClientInternal: (ctx: unknown) => RawClient;
        };
      const { makeSystemContext } = await databaseModule();
      const provisioner = createAccessMatrixPrismaClientInternal(
        makeSystemContext({ actorId: 'user-test-priv-provisioner', requestId: 'r6-6c' }),
      );

      const id = `${GRANT_PREFIX}07`;
      // ⚠ ROLLED BACK, AND THE ROLLBACK IS PART OF THE DESIGN. The forged marker sets
      // `prevHash = repeat('0', 64)` and advances `audit_chain_head`; committing it would FORK the
      // append-only hash chain and turn the G-1 continuity assertions in other files red for reasons
      // that have nothing to do with them. `SET CONSTRAINTS ALL IMMEDIATE` makes the deferred
      // admission trigger fire INSIDE the transaction, so the attack is fully evaluated and then
      // discarded — and the observation below is taken before the rollback.
      let observedRole: string | undefined;
      let unexpected: string | null = null;

      await provisioner.$executeRawUnsafe('BEGIN');
      try {
        await provisioner.$executeRawUnsafe(
          doBlock([markerSql('r6c', id), advanceHead(), grantSql(id)]),
        );
        await provisioner.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
        const rows = await provisioner.$queryRawUnsafe<{ role: string }[]>(
          `SELECT "role"::text AS role FROM "waqf_access_grant" WHERE "id" = '${id}'`,
        );
        observedRole = rows[0]?.role;
      } catch (error: unknown) {
        unexpected = errorText(error);
      } finally {
        await provisioner.$executeRawUnsafe('ROLLBACK').catch(() => undefined);
      }

      expect(
        unexpected,
        'the forged chain was REFUSED on the provisioning connection. If that is because a further ' +
          'control landed, this residual has NARROWED and the round-6 addendum in ADR-0008 must be ' +
          'updated to say so — then DELETE this test rather than inverting it.',
      ).toBeNull();
      expect(observedRole, 'the forged seat was not minted as NAZIR').toBe('NAZIR');

      // Nothing survived.
      expect(await grantExists(id)).toBe(false);
    });
  });

  // ═════════════════════════════════════════════════════════════════════════════════════════
  // 7 · THE AUDITED TRANSACTION RUNS ON THE CLIENT'S OWN CONNECTION
  // ═════════════════════════════════════════════════════════════════════════════════════════

  describe('7 · withAudit() opens its transaction on the right connection', () => {
    it('7a · a privileged client’s audited transaction observes current_user = qmulate_owner', async () => {
      // ⚠ THE LATENT DEFECT THIS PINS. `withAudit()` used to call `rawUnextendedClient()` — the
      // SINGLETON — while `clientRegistry` was already storing the base the client was built on and
      // being ignored. Harmless with one pool; with three, a privileged or provisioning write would
      // open its audited transaction on the APP connection. If the matrix is exactly right that
      // surfaces as a confusing 42501; if a later migration ever loosens one GRANT it instead
      // SUCCEEDS on the unprivileged connection and defeats the entire split WITH EVERY TEST STILL
      // GREEN. A source assertion cannot detect that, so this reads `current_user` from inside the
      // transaction. The mutation is reverting `withAudit()` to the singleton.
      const db = await databaseModule();
      const ctx = db.makeSystemContext({ actorId: 'user-test-priv-conn', requestId: 'r6-7a' });
      const privileged = db.createPrivilegedPrismaClient(ctx);

      const observed = await db.withAudit(privileged, async (tx) => {
        const rows = await (
          tx as unknown as {
            $queryRawUnsafe: <T>(sql: string) => Promise<T>;
          }
        ).$queryRawUnsafe<{ who: string }[]>(`SELECT current_user AS who`);
        return rows[0]?.who;
      });

      expect(
        observed,
        'the audited transaction of a PRIVILEGED client ran on a different database role. withAudit() ' +
          'is using a singleton base client instead of `clientRegistry.get(db).base`.',
      ).toBe('qmulate_owner');
    });

    it('7b · an app client’s audited transaction observes current_user = qmulate_app', async () => {
      const db = await databaseModule();
      const ctx = db.makeSystemContext({ actorId: 'user-test-priv-conn', requestId: 'r6-7b' });
      const scoped = db.createPrismaClient(ctx);

      const observed = await db.withAudit(scoped, async (tx) => {
        const rows = await (
          tx as unknown as {
            $queryRawUnsafe: <T>(sql: string) => Promise<T>;
          }
        ).$queryRawUnsafe<{ who: string }[]>(`SELECT current_user AS who`);
        return rows[0]?.who;
      });

      expect(observed).toBe('qmulate_app');
    });
  });
});
