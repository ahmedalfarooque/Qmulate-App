// QMULATE — shared test harness for `@qmulate/database`.
//
// Loaded as a Vitest `setupFile` (so its environment defaults are in place before any test module
// is imported) AND imported directly by the test files for its helpers. Both work: it is an
// ordinary module, and under `singleFork` the integration suite shares one instance of it.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE FOUR THINGS THIS FILE EXISTS TO GET RIGHT
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// 1. A MISSING DATABASE SKIPS, IT DOES NOT FAIL — BUT IT ALSO DOES NOT LIE.
//    This machine has no Docker and no local Postgres; the orchestrator supplies an ephemeral one
//    via `embedded-postgres`. So integration files guard on `hasDatabase` and print a loud warning
//    when they skip. A skipped G-1 assertion must never be reported as a passed G-1 assertion.
//
// 2. A DATABASE THAT IS PRESENT BUT UNMIGRATED FAILS LOUDLY.
//    `assertGuardsInstalled()` refuses to let the suite proceed against a database whose tables or
//    guard triggers are missing. Skipping there would be the worst outcome available: a green
//    suite over an UNGUARDED `audit_event`.
//
// 3. THE GUARDS ARE PROBED THROUGH SQL, NOT THROUGH THE DRIVER'S ERROR SHAPE.
//    `guardProbeSql()` wraps the forbidden statement in a `DO` block that catches exactly the
//    SQLSTATE the guard is supposed to raise and re-raises a sentinel. That gives three things a
//    plain `expect(...).rejects` cannot:
//      • the SQLSTATE is asserted at the server, not scraped out of a Prisma error string;
//      • "the guard did not fire" is distinguishable from "the guard fired with the wrong code";
//      • the probe ALWAYS aborts its transaction, so even if a guard were missing, a `TRUNCATE`
//        probe cannot actually destroy the audit trail.
//
// 4. ⚠ NO TEST MAY SPEND A WRITE-ONCE FIXTURE ROW.  ← THE AV4-B2 RULE.
//    Point 3 already gets this right for THIS package — every guard probe runs inside a `DO` block
//    that re-raises, or a Prisma interactive transaction that throws, so nothing here commits
//    against a seeded row. The rule is written down anyway, because it has now been broken three
//    times in one sprint from the OTHER side of the shared database, and each time the alarm went
//    off in THIS suite:
//      · `reclassification_event` rows appended against a seeded endowment (V-E3-04, rounds 1 & 2)
//        — the table refuses DELETE and TRUNCATE, so `seed.integration.test.ts`'s "the history is
//        empty" assertion could never be true again;
//      · `waqf-005`'s مآل capture, spent by `@qmulate/api`'s `deed-term-capture.integration.test.ts`
//        (AV4-B2) — MEASURED on one pristine database: run 1 of `pnpm test:integration`
//        `Tasks: 3 successful, 3 total`; runs 2 and 3 `Tasks: 1 successful, 2 total`, with **19
//        failures in this package** across `e3-deed-term-guards.integration.test.ts` and
//        `seed.integration.test.ts`, reading like the V-E3-01 founder's-condition HIGH.
//
//    THE RULE:
//      a. a test needing an UNSPENT one-shot subject CREATES ITS OWN and removes it again — in this
//         package that means a probe that ROLLS BACK (`guardProbeSql` / `rollbackProbeSql` /
//         `probeWithSetupSql`), never a committed write against `waqf-001…005`;
//      b. the seeded examples are READ, never spent. `waqf-005` (owner decision D-C) is the
//         fixture's only demonstration of "nobody has read this deed's مآل clause"; several
//         assertions here depend on it and `pnpm db:seed` CANNOT restore it, because the seal is the
//         product working as designed (V-E3-01's fix) and the seed upserts rather than repairs;
//      c. green CI proves nothing about this class of defect — CI's database is always pristine, so
//         it is structurally blind to it. The proof is `pnpm test:integration` run at least TWICE
//         against ONE database, both green.
//
//    ⚠ IF THIS SUITE GOES RED ON A SECOND RUN WITH FOUNDER'S-CONDITION MESSAGES, read them as a
//    QUESTION ABOUT THE FIXTURE'S STATE before reading them as a breach of the seal. Check
//    `SELECT "id","reversionClauseCaptured" FROM "waqf"` first: on a correctly seeded database
//    exactly one row (`waqf-005`) is `false`.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PACKAGE_ROOT, PERMITTED_FIXTURE_PATH, REPO_ROOT } from '../src/guardrail.js';

export { PACKAGE_ROOT, PERMITTED_FIXTURE_PATH, REPO_ROOT };

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Deterministic key material
//
// `packages/database/src/crypto.ts` reads FIELD_ENCRYPTION_KEYS / FIELD_ENCRYPTION_ACTIVE_KEY /
// FIELD_HMAC_KEY straight from `process.env`, and the seed cannot write a single UBO or IBAN
// column without them.
//
// ⚠ ORCHESTRATOR: these three variables are ABSENT from `@qmulate/config`'s `serverEnvSchema`,
// from `.env.example`, and from every job in `.github/workflows/ci.yml`. As things stand the CI
// "Seed the invented fixture" step fails before it writes a row. Defaulting them here keeps the
// suite runnable and pins them to fixed values so the ciphertext and HMAC frozen vectors below
// are reproducible — it is NOT a substitute for adding them to the env schema and to CI.
//
// These are obviously-fake constant keys (repeated bytes). They must never be used anywhere but
// a fixture-only test database.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** base64 of 32 × 0x07. Test-only AES-256 key, version "1". */
export const TEST_FIELD_ENCRYPTION_KEY_B64 = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';
/** base64 of 32 × 0x0b. Test-only HMAC key, deliberately different from the encryption key. */
export const TEST_FIELD_HMAC_KEY_B64 = 'CwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCws=';
export const TEST_FIELD_ENCRYPTION_KEYS_JSON = `{"1":"${TEST_FIELD_ENCRYPTION_KEY_B64}"}`;

function defaultEnv(name: string, value: string): void {
  if (process.env[name] === undefined || process.env[name] === '') process.env[name] = value;
}

defaultEnv('FIELD_ENCRYPTION_KEYS', TEST_FIELD_ENCRYPTION_KEYS_JSON);
defaultEnv('FIELD_ENCRYPTION_ACTIVE_KEY', '1');
defaultEnv('FIELD_HMAC_KEY', TEST_FIELD_HMAC_KEY_B64);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Database availability
// ═══════════════════════════════════════════════════════════════════════════════════════════

const rawDatabaseUrl = process.env.DATABASE_URL?.trim();

/** The connection string, or `undefined` when no database was supplied to this run. */
export const DATABASE_URL: string | undefined =
  rawDatabaseUrl === undefined || rawDatabaseUrl === '' ? undefined : rawDatabaseUrl;

/** Drives every `describe.skipIf(!hasDatabase)` in the integration files. */
export const hasDatabase: boolean = DATABASE_URL !== undefined;

/**
 * Prints the reason a suite is being skipped. Called at module scope by each integration file so
 * the reason is visible in CI output next to the skipped tests, rather than inferred from a count.
 */
export function warnNoDatabase(gate: string): void {
  if (hasDatabase) return;

  console.warn(
    `[qmulate] DATABASE_URL is not set — SKIPPING ${gate}. ` +
      `These assertions did NOT run, so this run does not prove ${gate}. ` +
      `Run: DATABASE_URL=postgresql://... pnpm --filter @qmulate/database test:integration`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Lazy database module access
//
// `../src/index.ts` re-exports the GENERATED Prisma client, which does not exist until
// `prisma generate` has run. Importing it statically would crash the unit suite on a fresh
// checkout, so every integration file reaches it through this dynamic accessor instead.
// ═══════════════════════════════════════════════════════════════════════════════════════════

// `import type * as …` is fully erased at compile time — it declares the shape without
// emitting a runtime import, which is exactly what this file needs (see the note above).
import type * as DatabaseModuleShape from '../src/index.js';

type DatabaseModule = typeof DatabaseModuleShape;

let databaseModulePromise: Promise<DatabaseModule> | null = null;

export function databaseModule(): Promise<DatabaseModule> {
  databaseModulePromise ??= import('../src/index.js').catch((error: unknown) => {
    throw new Error(
      'Could not load @qmulate/database. The generated Prisma client is probably missing — run ' +
        `\`pnpm --filter @qmulate/database exec prisma generate\` first. Original error: ${String(error)}`,
    );
  });
  return databaseModulePromise;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// TWO CONNECTIONS IN THE HARNESS, AND THE SPLIT IS THE DELICATE PART  (ADR-0008 round 6)
//
// Since privilege separation there are two connections this suite must keep straight, and getting it
// wrong in either direction destroys a claim:
//
//   basePrisma()        → `qmulate_app` (DATABASE_URL). The LEAST-PRIVILEGED role. **Every probe
//                         that asserts a REFUSAL must run here.** A refusal observed as the owner —
//                         or, locally, as the embedded cluster's superuser, which is
//                         `rolsuper = true, rolbypassrls = true` (MEASURED) — proves nothing at all,
//                         because that role bypasses GRANTs, ownership checks and FORCE RLS. Quietly
//                         moving `runProbe()` to the privileged connection would convert this
//                         suite's strongest assertions into vacuous ones without a single test going
//                         red. Do not.
//
//   privilegedPrisma()  → `qmulate_owner` (MIGRATOR_DATABASE_URL). Owns the tables. **Only
//                         SCAFFOLDING runs here** — the `DISABLE TRIGGER` blocks that lay fixture
//                         rows down and take them away, `provisionGrants()`, and the hard DELETEs of
//                         test rows. Since the app role no longer owns anything, those statements
//                         raise `42501 must be owner of table` on the app connection: MEASURED, and
//                         it is the correct behaviour, not a harness bug.
//
// ── HOW SCAFFOLDING GETS THERE WITHOUT EDITING FORTY CALL SITES ─────────────────────────────────
// `basePrisma()` returns a routing façade. Its `$executeRawUnsafe`/`$queryRawUnsafe` look for the
// {@link PRIVILEGED_SQL_SENTINEL} comment that `scaffoldingSql()` — and ONLY `scaffoldingSql()` —
// emits, and send exactly those statements to the privileged connection. Everything else, including
// every `guardProbeSql()` and `rollbackProbeSql()`, goes to the app connection untouched.
//
// ⚠ WHY THAT IS HONEST RATHER THAN A LOOPHOLE. The sentinel is emitted by three generators in this
// file, all of which are DOCUMENTED SCAFFOLDING and all of which already announced that they suspend
// a production guard. No probe carries it, so no assertion about what the database refuses is
// affected: the routing decides which credential lays a FIXTURE down, never which credential is
// being tested. It is test-harness plumbing and it exists in no shipped code path.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * The marker that routes a statement to the privileged connection. A SQL comment, so it is inert to
 * Postgres and visible to the façade.
 *
 * ⚠ NEVER PUT IT ON A STATEMENT UNDER TEST. It moves the statement to the connection that owns the
 * table, which is the one connection for which "it was refused" means nothing.
 */
export const PRIVILEGED_SQL_SENTINEL = '/* QMULATE_PRIVILEGED_SCAFFOLD */';

/** Prefixes `sql` so {@link basePrisma}'s façade routes it to the owner connection. */
export function privilegedSql(sql: string): string {
  return `${PRIVILEGED_SQL_SENTINEL}\n${sql}`;
}

type BaseClient = Awaited<ReturnType<DatabaseModule['getBasePrismaClient']>>;

/** Cached per underlying client identity, so `disconnectPrisma()` + reconnect rebuilds the façade. */
const routingFacades = new WeakMap<object, BaseClient>();

/**
 * Wraps the app-connection client so sentinel-carrying raw SQL is re-issued on the privileged one.
 *
 * Only the two `*Unsafe` raw methods are intercepted; those are the only ones the scaffolding
 * generators are ever passed to. A tagged-template `$executeRaw` cannot carry the sentinel, so it is
 * deliberately left alone rather than given a silent second meaning.
 */
function routingFacade(app: BaseClient, privileged: BaseClient): BaseClient {
  const cached = routingFacades.get(app as unknown as object);
  if (cached) return cached;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const facade: any = new Proxy(app as unknown as Record<string, unknown>, {
    get(target, property) {
      if (property === '$executeRawUnsafe' || property === '$queryRawUnsafe') {
        return (sql: string, ...values: unknown[]) => {
          const receiver =
            typeof sql === 'string' && sql.includes(PRIVILEGED_SQL_SENTINEL) ? privileged : app;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const method = (receiver as any)[property] as (...a: unknown[]) => unknown;
          return method.call(receiver, sql, ...values);
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });

  routingFacades.set(app as unknown as object, facade as BaseClient);
  return facade as BaseClient;
}

/**
 * The UNEXTENDED client on the **app** connection (`qmulate_app`): raw SQL, and reads that must not
 * be narrowed by the force-filter.
 *
 * This is where every refusal assertion belongs. See the block above for the one thing it does
 * differently — scaffolding statements carrying {@link PRIVILEGED_SQL_SENTINEL} are re-issued on the
 * owner connection, because the app role no longer owns any table and therefore cannot suspend a
 * guard to lay a fixture row down.
 */
export async function basePrisma(): Promise<BaseClient> {
  const { getBasePrismaClient, getPrivilegedBasePrismaClient } = await databaseModule();
  return routingFacade(getBasePrismaClient(), getPrivilegedBasePrismaClient());
}

/**
 * ⚠ THE UNEXTENDED CLIENT ON THE **OWNER** CONNECTION (`MIGRATOR_DATABASE_URL`). IT CAN RUN DDL.
 *
 * SCAFFOLDING AND MUTATION BLOCKS ONLY:
 *   • a `DISABLE TRIGGER` / statement / `ENABLE ALWAYS TRIGGER` sequence that the harness spells by
 *     hand rather than through `scaffoldingSql()`;
 *   • the deliberate MUTATION cases — "with the guard removed, the forbidden thing succeeds" —
 *     which need ownership to remove the guard, and which are asserting a PERMIT rather than a
 *     refusal, so the connection's privilege is not what is under test.
 *
 * ⚠ A REFUSAL PROBE MUST NEVER RUN ON THIS. Use {@link basePrisma} for those. The two are named
 * differently on purpose: `privilegedPrisma` should look wrong in a test that expects a 42501.
 */
export async function privilegedPrisma(): Promise<BaseClient> {
  const { getPrivilegedBasePrismaClient } = await databaseModule();
  return replicaRoleFacade(getPrivilegedBasePrismaClient(), await superuserPrisma());
}

/**
 * Routes the `session_replication_role = 'replica'` probes to the platform superuser.
 *
 * ⚠ MEASURED: setting that parameter requires SUPERUSER — `qmulate_owner` gets
 * `42501 permission denied to set parameter "session_replication_role"`, exactly as `qmulate_app`
 * does. So after privilege separation there is NO application role that can run the G-1 bypass probes
 * at all, and without this routing every one of them would fail with a privilege error and read as
 * "the guard held" when the guard was never exercised.
 *
 * That would silently retire the strongest assertion in the repository. `ENABLE ALWAYS`
 * (`tgenabled = 'A'`) exists BECAUSE one `SET session_replication_role = 'replica'` skips a plain
 * trigger — the Sprint-1 finding that defeated gate G-1 outright — and the only honest way to keep
 * proving it is to probe as an actor who can actually set the GUC. The resulting claim is the
 * strongest form available: *even a superuser wielding the replica role cannot skip these triggers.*
 *
 * ⚠ IT DOES NOT APPLY TO {@link basePrisma}. On the restricted connection the refusal of that same
 * `SET` is itself a control worth asserting, and `authorization-plane-privilege.integration.test.ts`
 * asserts it. Routing it there would have destroyed that assertion.
 */
function replicaRoleFacade(owner: BaseClient, superuser: BaseClient): BaseClient {
  const cached = routingFacades.get(owner as unknown as object);
  if (cached) return cached;

  const wantsSuperuser = (sql: unknown): boolean =>
    typeof sql === 'string' && /session_replication_role/i.test(sql);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const facade: any = new Proxy(owner as unknown as Record<string, unknown>, {
    get(target, property) {
      if (property === '$executeRawUnsafe' || property === '$queryRawUnsafe') {
        return (sql: string, ...values: unknown[]) => {
          const receiver = wantsSuperuser(sql) ? superuser : owner;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const method = (receiver as any)[property] as (...a: unknown[]) => unknown;
          return method.call(receiver, sql, ...values);
        };
      }
      if (property === '$transaction') {
        // A `$transaction` whose body sets the replica role has to run ENTIRELY on the superuser
        // connection — the GUC is session-scoped, so splitting the block across two connections would
        // set it on one and probe on the other, which is a false negative in the dangerous direction.
        // The block is attempted on the OWNER first; if its first replica-role statement is refused,
        // the WHOLE block is re-run on the superuser connection, so no test file has to know which
        // connection it is on.
        return (arg: unknown, options?: unknown) => {
          if (typeof arg !== 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (owner as any).$transaction(arg, options);
          }
          const run = (client: BaseClient): unknown =>
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (client as any).$transaction(
              (tx: unknown) => (arg as (t: unknown) => unknown)(replicaTxFacade(tx, client)),
              options,
            );
          // Optimistically run on the OWNER; if the body's first replica-role statement is refused,
          // re-run the whole block on the superuser connection. Transactions here are probes that end
          // in a raise and roll back, so a discarded first attempt costs nothing.
          return Promise.resolve(run(owner)).catch((error: unknown) => {
            if (/session_replication_role/i.test(String(error))) return run(superuser);
            throw error;
          });
        };
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });

  routingFacades.set(owner as unknown as object, facade as BaseClient);
  return facade as BaseClient;
}

/** Inside a transaction there is nothing to route — the connection was chosen when it opened. */
function replicaTxFacade(tx: unknown, _client: BaseClient): unknown {
  return tx;
}

/**
 * A fully-extended, AUDITED client on the owner connection — the seed's shape, for provisioning.
 *
 * Used by {@link provisionGrants}. Writes through it still emit their hash-chained `audit_event`,
 * which is what makes a bootstrapped admin seat "established" for anything issued afterwards.
 */
export async function privilegedExtendedPrisma(
  ctx: Parameters<DatabaseModule['createPrivilegedPrismaClient']>[0],
): Promise<DatabaseModuleShape.ExtendedPrismaClient> {
  const { createPrivilegedPrismaClient } = await databaseModule();
  return createPrivilegedPrismaClient(ctx);
}

/**
 * A fully-extended, AUDITED client on the **PROVISIONING** connection (`qmulate_provisioner`).
 *
 * ⚠ THIS IS THE ONLY CONNECTION ON WHICH A `waqf_access_grant` WRITE CAN BE TESTED AT ALL. Since
 * ADR-0008 round 6 the app role holds no INSERT/UPDATE on that table, so a test that mints a grant
 * through `createPrismaClient(ctx)` is refused by the ACL — `42501 permission denied for table
 * waqf_access_grant` — before `waqf_access_grant_admission`, `waqf_access_grant_permission_guard` or
 * `CHECK waqf_access_grant_no_self_issue` is ever consulted. Every assertion about WHY a grant write
 * is admitted or refused therefore has to run here, where the privilege is present and the GUARDS are
 * the control. That mirrors production exactly: `provisionAccessGrant()` is this connection.
 *
 * ⚠ AND THE GUARDS ARE FULLY LIVE HERE. The provisioner owns nothing, so it cannot suspend a trigger
 * (MEASURED: `42501 must be owner of table waqf_access_grant`). Using it is not an exemption — it is
 * the narrow credential the one legitimate write path holds.
 *
 * Synchronous so the many `adminClient()`-style helpers in the guard suites keep their shape. The
 * factory is loaded by {@link assertGuardsInstalled}, which every integration file already awaits in
 * `beforeAll`.
 */
let accessMatrixFactory: ((ctx: never) => DatabaseModuleShape.ExtendedPrismaClient) | null = null;

export function accessMatrixClient(ctx: unknown): DatabaseModuleShape.ExtendedPrismaClient {
  if (accessMatrixFactory === null) {
    throw new Error(
      'accessMatrixClient() was called before the provisioning client factory was loaded. Await ' +
        '`assertGuardsInstalled()` in beforeAll first — it loads it.',
    );
  }
  return accessMatrixFactory(ctx as never);
}

async function loadAccessMatrixFactory(): Promise<void> {
  if (accessMatrixFactory !== null) return;
  // Imported from `src/client.js` rather than the barrel: `createAccessMatrixPrismaClientInternal`
  // is deliberately NOT exported from `src/index.ts`, because an exported handle on a role that holds
  // INSERT on the authorization plane would re-create the hole ADR-0008 describes. The test harness
  // is inside the package and may reach it; nothing outside can.
  const { createAccessMatrixPrismaClientInternal } = await import('../src/client.js');
  accessMatrixFactory = createAccessMatrixPrismaClientInternal as unknown as (
    ctx: never,
  ) => DatabaseModuleShape.ExtendedPrismaClient;
}

/**
 * FAILS — never skips — when the connection that refusal assertions run on could not honestly
 * produce one.
 *
 * ⚠ THIS IS THE STRUCTURAL FIX FOR THE MOST DANGEROUS PROPERTY OF LOCAL RUNS. MEASURED: the embedded
 * cluster's default role is `rolsuper = true, rolbypassrls = true`, and a superuser bypasses table
 * GRANTs, ownership checks and `FORCE ROW LEVEL SECURITY` alike. A privilege-separation suite running
 * on it would pass every single refusal test for entirely the wrong reason, and no amount of
 * diligence in the test bodies would notice. So the check is structural, it runs before the claims,
 * and it FAILS rather than skipping — a skipped assertion misreported as a passed one is how the
 * previous five rounds of this sprint each shipped a property the code lacked.
 */
export async function assertRefusalConnectionIsRestricted(): Promise<void> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<
    { current_user: string; rolsuper: boolean; rolbypassrls: boolean }[]
  >(
    `SELECT current_user,
            COALESCE((SELECT rolsuper     FROM pg_roles WHERE rolname = current_user), false) AS rolsuper,
            COALESCE((SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user), false) AS rolbypassrls`,
  );
  const row = rows[0];
  if (!row) throw new Error('Could not read the identity of the app database connection.');

  if (row.rolsuper || row.rolbypassrls) {
    throw new Error(
      `DATABASE_URL connects as "${row.current_user}", which is SUPERUSER=${String(row.rolsuper)} ` +
        `BYPASSRLS=${String(row.rolbypassrls)}. Either attribute bypasses table GRANTs, ownership ` +
        `checks and FORCE ROW LEVEL SECURITY, so EVERY refusal this suite asserts would pass for ` +
        `the wrong reason and ADR-0008's residual would look closed while being wide open.\n` +
        `  Fix: run the suite through \`pnpm exec tsx scripts/dev-postgres.ts --run "…"\` (which ` +
        `provisions the roles and injects the qmulate_app URL as DATABASE_URL), or point ` +
        `DATABASE_URL at qmulate_app yourself after \`pnpm exec tsx scripts/provision-db-roles.ts\`.`,
    );
  }
}

/**
 * Closes EVERY pool this run opened. Call from every integration file's `afterAll`.
 *
 * ⚠ "Every" is now three or four pools, not one: app, owner, provisioner (from `src/client.ts`'s
 * role registry) plus the harness-owned superuser one. A half-closed set reproduces the S2 orphaned-pool
 * cascade — `audit-lock-ordering` spent 109 s and fourteen files went red because the seed subprocess
 * could no longer open a connection.
 */
export async function closeDatabase(): Promise<void> {
  await disconnectSuperuser();
  if (databaseModulePromise === null) return;
  const { disconnectPrisma } = await databaseModule();
  await disconnectPrisma();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Schema / guard readiness
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * The database-level controls the constraints migrations install. All are load-bearing.
 *
 * ⚠ ADDING A GUARD TO A MIGRATION WITHOUT ADDING IT HERE is how a database that has lost a guard
 * gets mistaken for a healthy one: `assertGuardsInstalled()` FAILS (never skips) when one is
 * missing, and it can only fail for the guards it knows about.
 */
export const REQUIRED_TRIGGERS = [
  // 00000000000001_init_append_only_audit
  'audit_event_no_mutate',
  'audit_event_no_truncate',
  'audit_event_no_mutate_row',
  'waqf_shart_immutable',
  'document_retention_guard',
  // 00000000000047 — S10/T3. The document's CONTENT IDENTITY (storageKey + sha256) is
  // write-once: a re-pointed key is a swapped document wearing a retained row, and a
  // rewritable hash is a decoration. No hatch — a corrected document is a NEW version.
  'document_content_identity',
  // 00000000000003_e2_authority_guards — the authority plane
  'approval_request_authority',
  'waqf_access_grant_role_immutable',
  'waqf_access_grant_permission_guard',
  'distribution_status_transition',
  // 00000000000004_e2_guard_gaps — the VERBS migration 3 left uncovered. Every one of these was a
  // reproduced bypass: `waqf` was the only guarded table with no DELETE trigger, so DELETE +
  // re-INSERT substituted a founder's Shart al-Waqif (C-03); TRUNCATE fires no row triggers at all
  // and was refused on `waqf` only by the accident of a cascade into `document` (C-03); and a
  // distribution could be BORN `EXECUTED` naming an approval that did not exist (C-10).
  'waqf_no_delete',
  'waqf_no_truncate',
  'approval_request_no_truncate',
  'waqf_access_grant_no_truncate',
  'distribution_no_truncate',
  'distribution_authority',
  // 00000000000005_e2_grant_admission — the verb migrations 3 and 4 never governed AT ALL: who may
  // INSERT a grant. A FINANCE seat, refused by its own scoped Prisma delegate, re-issued the
  // byte-identical row through `$executeRawUnsafe` on that same client and it COMMITTED, on two
  // endowments, with zero audit events — after which `qmulate_has_active_grant(…, 'NAZIR')` was
  // true and the approval trigger accepted it as a checker. Plus the two hard-DELETE guards
  // migration 4 §3.4 recorded as a "known, reported residue" and deferred.
  'waqf_access_grant_admission',
  'waqf_access_grant_no_delete',
  'approval_request_no_delete',
  'approval_request_authority_in_use',
  'asset_identity_guard',
  'asset_no_truncate',
  // 00000000000006_e2_corpus_retention_guards — the verb NO corpus or ledger table had at all.
  // Migration 4 closed DELETE on `waqf` after a census over the GUARDED tables; a census over ALL
  // of them found every corpus- and ledger-bearing table erasable from a raw connection with
  // `audit_event` not moving: `asset` (the corpus, asl / أصل — Binding rule 1's non-diminution
  // invariant), `expropriation` (the istibdal record), `transaction` (the ledger), `distribution`
  // and `distribution_line_item` (who was paid what, on a PAID run), `bank_account`, `nazir_fee`,
  // `lease`, `trusteeship_deed` (the Nazir's own appointment), `beneficiary` (entitlement + the
  // UBO dataset) and `reclassification_event`. TRUNCATE fires no row triggers, so each DELETE guard
  // has a TRUNCATE sibling — migration 4 learned that on `waqf`, where the refusal came only from
  // an accident of the FK cascade.
  'asset_no_delete',
  'expropriation_no_delete',
  'expropriation_no_truncate',
  'reclassification_event_no_delete',
  'reclassification_event_no_truncate',
  'transaction_no_delete',
  'transaction_no_truncate',
  'distribution_no_delete',
  'distribution_line_item_no_delete',
  'distribution_line_item_no_truncate',
  'nazir_fee_no_delete',
  'nazir_fee_no_truncate',
  'bank_account_no_delete',
  'bank_account_no_truncate',
  'lease_no_delete',
  'lease_no_truncate',
  'trusteeship_deed_no_delete',
  'trusteeship_deed_no_truncate',
  'beneficiary_no_delete',
  'beneficiary_no_truncate',
  // 00000000000008_e2_retention_remainder — the tables migration 6 named as left open. A census read
  // from the LIVE `pg_trigger` catalogue over ALL of `public` measured every one of these erasable
  // with `audit_event` not moving: `setting` (EVERY regulatory figure in the system, all ⚠ unverified
  // per Binding rule 3 — and deleting a per-waqf OVERRIDE makes the resolver fall back to the global
  // value silently), `client` and `waqif` (the family and the FOUNDER, whose Shart al-Waqif is
  // immutable while its author was erasable), and the compliance-evidence tables
  // `compliance_obligation`, `compliance_task`, `government_filing`, `zakat_filing`, `deadline`,
  // `legal_case`.
  //
  // ⚠ `client`, `waqif` and `compliance_obligation` LOOKED protected before: a plain DELETE raised
  // 23503 because a child row happened to exist. One `SET session_replication_role = 'replica'` skips
  // the internal RI triggers too and all three became PERMITTED, leaving orphaned children. An FK is
  // not a retention control.
  'setting_no_delete',
  'setting_no_truncate',
  'client_no_delete',
  'client_no_truncate',
  'waqif_no_delete',
  'waqif_no_truncate',
  'compliance_obligation_no_delete',
  'compliance_obligation_no_truncate',
  'compliance_task_no_delete',
  'compliance_task_no_truncate',
  'government_filing_no_delete',
  'government_filing_no_truncate',
  'zakat_filing_no_delete',
  'zakat_filing_no_truncate',
  'deadline_no_delete',
  'deadline_no_truncate',
  'legal_case_no_delete',
  'legal_case_no_truncate',
  // 00000000000012_e3_lineage_reversion_deed_terms — S4/E3. The census is what makes a guard's
  // DISAPPEARANCE loud; without these four entries, migration 12's controls were asserted only by the
  // files that probe them, so a migration that dropped one would have turned exactly one file red
  // instead of stopping the suite.
  //
  // ⚠ TIER 3 IS NOT IN THIS LIST AND CANNOT BE: it lives inside `qmulate_shart_guard()`, whose
  // trigger (`waqf_shart_immutable`) is already named above. A trigger census cannot see a branch
  // inside a function body, which is precisely why `e3-deed-term-guards.integration.test.ts` compares
  // `DEED_TERM_WRITE_ONCE_COLUMNS` against that function's own source text and probes each refusal.
  'waqf_reversion_taker_no_mutate',
  'waqf_reversion_taker_no_truncate',
  // 00000000000013_e3_closeout — S4/E3 close-out, V-E3-M2. INSERT was the ONE verb this table had
  // nothing on, and INSERT is its RECORDING path: measured before the fix, a taker on a waqf whose
  // deed records no مآل, and a taker naming a LIVING FAMILY DESCENDANT, were both accepted.
  'waqf_reversion_taker_insert_integrity',
  // The EDIT half of `ReclassificationEvent`'s own "append-only, never edited" claim — unenforced
  // from Sprint 1 until migration 12. DELETE and TRUNCATE on that table are migration 6's and are
  // already listed above; E3 deliberately did not re-create them.
  'reclassification_event_no_update',
  'reclassification_event_from_matches_current',
  // 00000000000017_owner_rulings — the product owner's memo Q10, *"the trusteeship deed can only be
  // editted by a court judge"* (rendered by engineering, and FLAGGED as a rendering, as: no system
  // seat may edit a recorded appointment; a court-ordered change is a NEW superseding record). Every
  // FACT the deed carries — who holds the nazarah, the jointly-and-severally-liable representative,
  // the BR-109 eligibility criteria — was editable by the least-privileged role until this trigger:
  // MEASURED as `qmulate_app` with no approval, `primaryNazir`, `ksaResident`,
  // `authorizedRepName` + `jointlyLiable` and `deletedAt` ALL COMMITTED.
  //
  // ⚠ MEMO Q8's SIBLING RULING IS NOT IN THIS LIST AND CANNOT BE: the reserved-matter gate on
  // `waqf."deletedAt"` is tier 2b INSIDE `qmulate_shart_guard()`, whose trigger
  // (`waqf_shart_immutable`) is already named at the top. A trigger census cannot see a branch in a
  // function body — the same reason tier 3 is absent — so that gate is declared per COLUMN in
  // `guard-verb-coverage.integration.test.ts` and probed in `e3-deed-term-guards.integration.test.ts`.
  'trusteeship_deed_no_update',
  // 00000000000029_e7_aml_compartment — the AML compartment's own subject (BR-604, §09 Engine C).
  // D and T only, and deliberately UNCONDITIONAL rather than keyed on the >= 10-year retention
  // window: that figure is UNVERIFIED against primary law and whether a SAR's clock is the same
  // clock has not been asked, so a window-keyed guard would encode an unconfirmed figure.
  // 00000000000031_e7_obligation_immutability — S8-Q5. §09 Engine A's claim, finally enforced:
  // a template is immutable WITHIN a library version, and a task carries the frozen (code, version)
  // of the duty it discharged. The two `*_id_immutable` members close migration 16's measured
  // identity exposure, which the content guard alone cannot see.
  'compliance_obligation_template_immutable',
  'compliance_obligation_id_immutable',
  'compliance_task_snapshot_frozen',
  'compliance_task_id_immutable',
  'aml_report_no_delete',
  'aml_report_no_truncate',
  'aml_follow_up_no_delete',
  'aml_follow_up_no_truncate',
  // 00000000000040_s9_material_change_coalescing — S9-3c. §09's material-change CHANGE-SET, the
  // table its coalescing paragraph is unimplementable without. `cause_frozen` seals the tuple the
  // statutory clock is read from (the effective date IS the clock — CDE-Q2); `filing_write_once`
  // stops an un-filing resurrecting a discharged clock and stops a bound cause being re-pointed at
  // a different duty. The `_no_delete`/`_no_truncate` pair JOINS migration 8's retention family
  // rather than declaring a second mechanism — same function, own hint.
  'material_change_cause_frozen',
  'material_change_filing_write_once',
  'material_change_no_delete',
  'material_change_no_truncate',
  // 00000000000041_s9_escalation_event_and_zero_tolerance — S9-3d. §09's escalation RECORD, kept
  // append-only for the reason `reclassification_event` is: the party with the strongest motive to
  // edit "somebody was told, at this rung, on this day" is the party it escalated past. Plus the
  // obligation half of §09's "cannot be dismissed, only resolved" — migration 38 made `waivedAt`
  // write-once, which still permitted ONE waiver, and one waiver on a zero-tolerance rule is a
  // dismissal under another name.
  'escalation_event_no_update',
  'escalation_event_no_delete',
  'escalation_event_no_truncate',
  // 00000000000052_s12_onboarding_gates — S12-3. The three handover gates in order, no delete /
  // truncate, and the two downstream twins: a distribution INSERT and a filing's move to SUBMITTED
  // refuse while Gate 02 is not CLEARED (BR-1101, V-11).
  'onboarding_gate_order',
  'onboarding_gate_no_delete',
  'onboarding_gate_no_truncate',
  'distribution_onboarding_gate',
  'government_filing_onboarding_gate',
  // 00000000000053_s12_endowment_birth_admission — S12-3b. The birth of an endowment is admitted on
  // sibling-endowment authority, or not at all (the owner connection is the bootstrap, by current_user).
  'waqf_birth_admission',
  'deadline_zero_tolerance_no_waiver',
] as const;

export const REQUIRED_CHECK_CONSTRAINTS = [
  // 00000000000001_init_append_only_audit — corpus/income segregation (Binding rule 1)
  'transaction_revenue_requires_receipt_class',
  'transaction_expense_has_no_receipt_class',
  'transaction_expense_requires_category',
  'transaction_capital_requires_source',
  'transaction_income_has_no_capital_source',
  'transaction_capital_other_requires_note',
  'transaction_amount_nonnegative',
  'audit_chain_head_singleton',
  // 00000000000003_e2_authority_guards — "the Nazir is the sole approval authority, per endowment,
  // and never the maker", as constraints rather than as a doc comment claiming it.
  'approval_request_checker_ne_maker',
  'approval_request_decided_requires_checker',
  'approval_request_approved_binds_payload',
  // 00000000000050_s12_approval_decision_plane — a PENDING row carries no checker (AV4-02 closure)
  'approval_request_pending_has_no_checker',
  // 00000000000052_s12_onboarding_gates
  'onboarding_gate_cleared_is_attributed',
  'onboarding_gate_cleared_dual_dated',
  'onboarding_gate_reopen_is_reasoned',
  'onboarding_gate_cleared_has_no_reopen',
  'waqf_access_grant_no_self_issue',
  'waqf_access_grant_aml_flags',
  'waqf_access_grant_beneficiary_self_pin',
  'membership_role_family_level_only',
  'distribution_approved_requires_approval_request',
  // 00000000000004_e2_guard_gaps — `''` satisfies `IS NOT NULL`, so a paid run could be born
  // EXECUTED naming the empty string (C-10, case #4).
  'distribution_approval_id_not_blank',
  // 00000000000005_e2_grant_admission — `waqf_access_grant_no_self_issue` is
  // `grantedByUserId <> userId`, which the EMPTY STRING satisfies: the same "'' passes the check"
  // shape as C-10 case #4, on the column that says who issued a seat.
  'waqf_access_grant_granted_by_not_blank',
  // 00000000000045 — S10/T2. A 'deadline.reminder' notification MUST carry a non-empty
  // idempotencyKey: NULLs do not conflict in a unique index, so without this CHECK a key-less
  // reminder row would slip under `notification_reminder_single_flight` and take unlimited
  // duplicates — the floor's one trapdoor, closed at row admission.
  'notification_reminder_requires_idempotency_key',
  // 00000000000012_e3_lineage_reversion_deed_terms — S4/E3. Every one of these is MECHANICAL: the
  // shape of a row, never a reading of a deed. The fiqh-adjacent rules (a خيري cohort's members, an
  // ultimate taker's kind) are deliberately NOT constraints — a CHECK is the wrong home for a rule
  // whose fiqh half is unconfirmed, because it makes relaxing it a migration and turns an engine
  // refusal a Nazir can dispute into a SQLSTATE.
  'beneficiary_no_self_parent',
  'beneficiary_active_not_deceased',
  'beneficiary_deceased_dual_dated',
  'waqf_reversion_kind_requires_capture',
  'waqf_reversion_recorded_dual_dated',
  // 00000000000014_e3_closeout_round2 — S4/E3 round 2, AV-1. These REPLACE migration 12's
  // `waqf_reversion_recorded_at_pairs_with_kind`, which paired the recording dates with the KIND and
  // so left a deed recording NO ultimate taker with no date at all — which is what let
  // `reversionClauseCaptured` be flipped ALONE and seal a row that had recorded nothing. The dates
  // now pair with the CAPTURE, which is the act they are the provenance of.
  'waqf_reversion_recorded_at_pairs_with_capture',
  'waqf_reversion_kind_requires_recorded_at',
  'trusteeship_deed_rep_eligibility_needs_a_rep',
  'trusteeship_deed_eligibility_verification_complete',
  'approval_request_kind_only_on_reserved_matter',
  // 00000000000029_e7_aml_compartment — the DEFAULT is not the control, the CHECK is.
  // `confidentiality` DEFAULTs to AML_RESTRICTED and a DEFAULT governs only an INSERT that OMITS the
  // column. Every ORM names it, so a row born NORMAL would be a tipped-off subject that `amlClause`
  // correctly declines to hide and `deriveClassification` correctly labels ROUTINE.
  'aml_report_always_restricted',
  'aml_follow_up_always_restricted',
  // 00000000000040 — S9-3c. "Cleared the change-set" is recorded as a FACT (a date and its frozen
  // twin), never as an absence; and a FILED change must name the duty it was filed under. The
  // converse is deliberately NOT constrained — a change may be recorded before the raise binds it.
  'material_change_filed_dual_dated',
  'material_change_filed_implies_bound',
  // 00000000000041 — S9-3d. Only an OVERDUE deadline escalates: `deriveEscalationLevel` returns
  // null for every other status, and a stored row saying `at_risk` would mean somebody escalated a
  // deadline that was not yet late. ⚠ There is deliberately NO separate vocabulary CHECK on
  // `derivedStatus` — pinning it to exactly 'overdue' subsumes one, and a dead constraint reads as
  // coverage while enforcing nothing.
  'escalation_event_only_overdue_escalates',
  'escalation_event_ladder_known',
  // 00000000000048 — S11-1. The `REGISTER_30BD` / `ISTIBDAL_10BD` clock-starts as RECORDED OPERATOR
  // INPUT (owner ruling 9f3d8fd). MECHANICAL shape only: the dual pair moves together, and the
  // registration anchor's KIND is present exactly when its date is — a bare date is what the owner
  // ruled against ("make a drop down"), and a kind with no date is nothing. Which date GOVERNS is
  // deliberately NOT a constraint (binding rule 3: unverified).
  'waqf_registration_anchor_dual_dated',
  'waqf_registration_anchor_kind_pairs_with_date',
  'expropriation_istibdal_completed_dual_dated',
  // ⊕ S11-2 (migration 49) — the discharge kind pairs with the met fact, both directions.
  'deadline_discharge_kind_pairs_with_met',
  'deadline_discharge_met_means_satisfied',
] as const;

/** Unique indexes that carry an invariant rather than merely an access path. */
export const REQUIRED_UNIQUE_INDEXES = [
  'setting_global_key_unique',
  'approval_request_one_open_per_subject',
  // 00000000000012_e3_lineage_reversion_deed_terms — S4/E3.
  //
  // `beneficiary_waqfId_id_key` is NOT an optimisation: it is the TARGET of the two composite foreign
  // keys, and those are what make a cross-endowment parent edge and a cross-endowment ultimate taker
  // STRUCTURALLY IMPOSSIBLE rather than merely refused by application code. Dropping it would silently
  // take both FKs with it.
  'beneficiary_waqfId_id_key',
  // The second side of the resolver's `REVERSION_ULTIMATE_TAKER_DUPLICATED` refusal: a repeated taker
  // id is never de-duplicated, because a repeat double-counts in the weight vector and MOVES MONEY.
  'waqf_reversion_taker_waqfId_beneficiaryId_key',
  // 00000000000029_e7_aml_compartment — the TARGET of `aml_follow_up_of_same_waqf`, the composite FK
  // that makes a cross-endowment follow-up structurally impossible. `id` is already the primary key,
  // so this pair adds nothing to uniqueness and everything to the FK: dropping it takes the FK too.
  // 00000000000031 — the VERSIONED key. `UNIQUE (code)` alone made §09's "publish a new version"
  // unfollowable: two versions of one obligation could not both exist, so a correction could only ever
  // be an in-place edit. Dropping this index silently restores that.
  'compliance_obligation_code_libraryVersion_key',
  'aml_report_waqfId_id_key',
  // 00000000000040 — S9-3c. §09's "there is ONE open update obligation per waqf at a time", as a
  // constraint rather than a convention. The application coalesces; this partial unique index is
  // what happens when it forgets — a second concurrent raise gets 23505 instead of quietly
  // creating a parallel statutory clock somebody later files twice. Dropping it turns the
  // coalescing rule back into a comment.
  'compliance_task_one_open_update_per_waqf',
  // 00000000000041 — S9-3d. ONE escalation per (deadline, rung, day): the transport's idempotency
  // key as a constraint, so a retried cron is a no-op rather than a second record of the same
  // notification. The DAY is in the key on purpose — an obligation that stays overdue must keep
  // escalating daily at the rung it reached, or a ladder going quiet would be a dismissal
  // implemented as silence.
  'escalation_event_one_per_rung_per_day',
  // 00000000000045 — S10/T2. The reminder dedupe's FLOOR: at most one 'deadline.reminder' row per
  // (userId, payload idempotencyKey), as a partial unique EXPRESSION index. The evaluator's
  // read-then-write survives as the fast path only; the race's loser aborts and the transport
  // retry converges (two-worker test). Dropping this turns the two-worker deployment back into a
  // duplicate-sender whose comment says "structural".
  'notification_reminder_single_flight',
] as const;

const MIGRATION_HINT =
  'Apply migrations first:\n' +
  '  pnpm --filter @qmulate/database exec prisma generate\n' +
  '  pnpm --filter @qmulate/database run migrate:deploy\n' +
  'If the tables exist but the guards do not, the hand-written constraints migration ran BEFORE ' +
  'the Prisma-generated init migration (they apply in lexicographic directory order). Generate ' +
  'the init migration into prisma/migrations/00000000000000_init/ — see prisma/sql/README.md.';

/**
 * Fails — never skips — when the database is present but not fully guarded.
 *
 * A green suite over an `audit_event` with no append-only trigger is the single most dangerous
 * outcome this repository can produce, so "the schema is not ready" must be an error.
 */
export async function assertGuardsInstalled(): Promise<void> {
  // ⚠ FIRST, BEFORE ANY GUARD IS INSPECTED (ADR-0008 round 6). Every integration file in this suite
  // calls this in `beforeAll`, which makes it the one place that can hold the whole suite to the
  // privilege posture. Two things are asserted and both FAIL rather than skip:
  //   1. the connection making refusal claims is neither SUPERUSER nor BYPASSRLS — otherwise every
  //      such claim passes for the wrong reason (the local cluster's default role is BOTH);
  //   2. `MIGRATOR_DATABASE_URL` exists, because the scaffolding that lays fixture rows down needs
  //      table ownership and would otherwise fail with a bare 42501 in whichever file happened to
  //      scaffold first.
  await assertRefusalConnectionIsRestricted();
  await loadAccessMatrixFactory();
  if ((process.env.MIGRATOR_DATABASE_URL ?? '').trim() === '') {
    throw new Error(
      'MIGRATOR_DATABASE_URL is not set. Since ADR-0008 round 6 the app role owns no table, so the ' +
        'harness scaffolding (`authzScaffoldingSql`, `retentionScaffoldingSql`, `provisionGrants`, ' +
        '`deleteTestClients`) runs on the OWNER connection and needs this variable. ' +
        '`scripts/dev-postgres.ts` injects it; CI sets it per job.',
    );
  }

  const prisma = await basePrisma();

  const tables = await prisma.$queryRawUnsafe<{ missing: string | null }[]>(
    `SELECT string_agg(t, ', ' ORDER BY t) AS missing
       FROM unnest(ARRAY['audit_event','audit_chain_head','waqf','transaction','document','setting','client']) AS t
      WHERE to_regclass(format('public.%I', t)) IS NULL`,
  );
  const missingTables = tables[0]?.missing;
  if (missingTables) {
    throw new Error(
      `Database is not migrated — missing table(s): ${missingTables}.\n${MIGRATION_HINT}`,
    );
  }

  const triggers = await prisma.$queryRawUnsafe<{ tgname: string; tgenabled: string }[]>(
    `SELECT tgname, tgenabled::text AS tgenabled FROM pg_trigger WHERE NOT tgisinternal`,
  );
  const present = new Set(triggers.map((row) => row.tgname));
  const missingTriggers = REQUIRED_TRIGGERS.filter((name) => !present.has(name));
  if (missingTriggers.length > 0) {
    throw new Error(
      `The QMULATE guard triggers are NOT installed: ${missingTriggers.join(', ')}. ` +
        `An unguarded audit_event must never be mistaken for a healthy one.\n${MIGRATION_HINT}`,
    );
  }

  // INSTALLED IS NOT THE SAME AS ENABLED, and since migration 5 the suite itself can turn guards
  // off: `authzScaffoldingSql()` disables three of them to lay down raw test rows. That is done
  // inside a single `DO` block so an exception rolls the DISABLE back with the transaction — but a
  // future helper that spans statements could leave one off, and the next file would then run
  // against an UNGUARDED authorization plane and pass. `tgenabled` must be `'A'` (ENABLE ALWAYS)
  // for every guard, which also catches the plain `CREATE TRIGGER` that Postgres skips under
  // `session_replication_role = 'replica'` — the Sprint-1 finding that defeated gate G-1.
  const notAlwaysEnabled = triggers
    .filter((row) => REQUIRED_TRIGGERS.includes(row.tgname as never) && row.tgenabled !== 'A')
    .map((row) => `${row.tgname}=${row.tgenabled}`);
  if (notAlwaysEnabled.length > 0) {
    throw new Error(
      `QMULATE guard trigger(s) are installed but NOT 'ENABLE ALWAYS': ${notAlwaysEnabled.join(', ')}. ` +
        `'D' means a previous suite disabled it and did not restore it; 'O' means it was created ` +
        `without ENABLE ALWAYS and one \`SET session_replication_role = 'replica'\` skips it. ` +
        `Restore with: ALTER TABLE <table> ENABLE ALWAYS TRIGGER <name>;`,
    );
  }

  const constraints = await prisma.$queryRawUnsafe<{ conname: string }[]>(
    `SELECT conname FROM pg_constraint WHERE contype = 'c'`,
  );
  const constraintNames = new Set(constraints.map((row) => row.conname));
  const missingChecks = REQUIRED_CHECK_CONSTRAINTS.filter((name) => !constraintNames.has(name));
  if (missingChecks.length > 0) {
    throw new Error(
      `The corpus/income and authority CHECK constraints are NOT installed: ${missingChecks.join(', ')}.\n${MIGRATION_HINT}`,
    );
  }

  const indexes = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
  );
  const indexNames = new Set(indexes.map((row) => row.indexname));
  const missingIndexes = REQUIRED_UNIQUE_INDEXES.filter((name) => !indexNames.has(name));
  if (missingIndexes.length > 0) {
    throw new Error(
      `Invariant-carrying unique index(es) NOT installed: ${missingIndexes.join(', ')}. ` +
        `Without approval_request_one_open_per_subject, two concurrent PENDING approvals for the ` +
        `same act can each be approved by a different Nazir.\n${MIGRATION_HINT}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Reaching a Prisma delegate BY NAME — the shared, TYPED escape hatch
//
// Several files here drive shapes the generated client REFUSES to express (a nested `create` into
// an audited model, a relation-nested grant mint, a write from a bypassed context). They did it by
// casting to `Record<string, Record<string, (args: unknown) => Promise<unknown>>>`, which has two
// problems that only became visible when `tsconfig.json`'s include glob was fixed from `tests/**` to
// `test/**` (V3 — the database test layer had NEVER been typechecked):
//
//   · the cast itself is rejected (TS2352) — a `DynamicClientExtensionThis` and an index-signature
//     record do not overlap, so every call site needed `as unknown as`;
//   · `noUncheckedIndexedAccess` is ON, so `client.asset` came back `… | undefined` and each of
//     ~40 call sites produced a "possibly undefined" pair (TS18048 + TS2722).
//
// A MAPPED TYPE OVER FINITE UNIONS fixes both and is STRICTLY STRONGER than what it replaces: it is
// not an index signature, so `noUncheckedIndexedAccess` does not apply, and a mistyped model or
// operation name is now a COMPILE error instead of a runtime `undefined is not a function` inside a
// probe whose whole job is to be refused. Add a member when a probe needs one — that edit is the
// point, not an obstacle.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** The models the by-name probes reach for. Extend deliberately. */
export type ProbeModel =
  | 'asset'
  | 'beneficiary'
  | 'client'
  | 'maintenanceTicket'
  | 'notification'
  | 'transaction'
  | 'user'
  | 'waqf'
  | 'waqfAccessGrant';

/** The operations the by-name probes reach for. Extend deliberately. */
export type ProbeOperation =
  | 'count'
  | 'create'
  | 'createMany'
  | 'delete'
  | 'deleteMany'
  | 'findFirst'
  | 'findMany'
  | 'findUnique'
  | 'update'
  | 'updateMany'
  | 'upsert';

/** One Prisma delegate, its operations reached by name. */
export type AnyDelegate = {
  readonly [O in ProbeOperation]: (args: unknown) => Promise<unknown>;
};

/**
 * A Prisma client reached BY NAME. Always produced with `as unknown as AnyClient` — the double cast
 * is deliberate and says out loud that this is off the generated surface.
 */
export type AnyClient = { readonly [M in ProbeModel]: AnyDelegate };

/**
 * A delegate whose NAME IS COMPUTED AT RUNTIME — the two DMMF sweeps that walk every relation into
 * an audited model and try a nested `create` through each. A finite union cannot express those:
 * the whole value of those sweeps is that they enumerate the schema rather than a hand-written list.
 *
 * ⚠ IT THROWS RATHER THAN RETURNING `undefined`, AND THAT IS THE POINT. Both sweeps assert "every
 * door was refused" by collecting the ones that were NOT. A missing delegate would have thrown
 * `undefined is not a function` INSIDE the `attempt()` wrapper, been captured as an error string,
 * and read as a refusal — a door reported as closed because the probe could not find it. That is
 * R6-C1's lesson (a generator that cannot reach a configuration reports its silence as success) in
 * one line of type-erasure.
 */
export function delegateByName(client: unknown, model: string): AnyDelegate {
  const delegate = (client as Record<string, unknown>)[model];
  if (typeof delegate !== 'object' || delegate === null) {
    throw new Error(
      `DEFECTIVE PROBE: the Prisma client exposes no delegate named "${model}" (got ` +
        `${typeof delegate}). The caller computed this name from the DMMF, so either the scan and ` +
        `the client disagree or the camel-casing is wrong. Failing loudly: a missing delegate ` +
        `inside an attempt() wrapper reads as a REFUSAL, so the sweep would report a door as ` +
        `closed precisely because it could not find it.`,
    );
  }
  return delegate as AnyDelegate;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Guard probes
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Sentinel raised when the forbidden statement executed instead of being refused. */
export const PROBE_NOT_BLOCKED = 'QMULATE_PROBE_NOT_BLOCKED';
/** Sentinel raised when the guard refused with exactly the expected SQLSTATE condition. */
export const PROBE_BLOCKED = 'QMULATE_PROBE_BLOCKED';
/** Sentinel raised when a statement that SHOULD succeed did, and was then rolled back. */
export const PROBE_SUCCEEDED = 'QMULATE_PROBE_SUCCEEDED_AND_ROLLED_BACK';

/**
 * plpgsql condition names for the SQLSTATEs the guards raise.
 *
 * ⚠ `invalid_text_representation` (22P02) IS NOT A GUARD RAISING — IT IS THE TYPE SYSTEM REFUSING,
 * and that distinction is the whole point of migration 13's `AssetStatus` enum (owner decision D-A,
 * closing V-E3-02). A refusal at type parse happens BEFORE any trigger runs, so the probe that
 * asserts it is asserting something strictly stronger than "a guard caught it": the value cannot be
 * stored at all. Keep it separate from `insufficient_privilege` — a test that accepted either would
 * no longer be able to tell "the vocabulary is closed" from "the gate refused a legal value".
 */
export type GuardCondition =
  | 'insufficient_privilege'
  | 'check_violation'
  | 'foreign_key_violation'
  | 'invalid_text_representation'
  /**
   * ⊕ ADDED S7 (AV7-F2, migration 26). `distribution_paid_periods_disjoint` is an `EXCLUDE`
   * constraint, and an exclusion violation is `23P01` — a SQLSTATE no guard in this repo could
   * assert before, because every previous guard was a trigger raising `42501` or a CHECK raising
   * `23514`. Without it a probe of that constraint had to match the raw driver error, which is how
   * a refusal with the WRONG SQLSTATE gets mistaken for the right one.
   */
  | 'exclusion_violation'
  /**
   * ⊕ ADDED S10/T2 (migration 45). `notification_reminder_single_flight` is a partial UNIQUE
   * expression index, and a unique violation is `23505` — until now every unique index in the
   * registry was probed indirectly (through the application's own refusal reading) or not at
   * all. The floor's whole claim is "the DATABASE refuses the duplicate", so its probe must
   * assert exactly that SQLSTATE, or a refusal with the wrong one passes as the right one.
   */
  | 'unique_violation';

export const SQLSTATE_BY_CONDITION: Readonly<Record<GuardCondition, string>> = {
  insufficient_privilege: '42501',
  check_violation: '23514',
  foreign_key_violation: '23503',
  invalid_text_representation: '22P02',
  exclusion_violation: '23P01',
  unique_violation: '23505',
};

/**
 * Wraps a forbidden `statement` so the server itself reports which of three things happened.
 *
 * The `EXCEPTION` handler catches ONLY `condition`, so a guard that raises the wrong SQLSTATE
 * propagates its own error rather than being mistaken for a pass. Whatever happens, the outer
 * `RAISE` aborts the transaction — the probe can never leave a row behind or take one away.
 */
export function guardProbeSql(statement: string, condition: GuardCondition): string {
  return [
    'DO $qm_probe$',
    'BEGIN',
    `  ${statement};`,
    `  RAISE EXCEPTION '${PROBE_NOT_BLOCKED}' USING ERRCODE = 'P0001';`,
    'EXCEPTION',
    `  WHEN ${condition} THEN`,
    `    RAISE EXCEPTION '${PROBE_BLOCKED}[${SQLSTATE_BY_CONDITION[condition]}]: %', SQLERRM USING ERRCODE = 'P0001';`,
    'END',
    '$qm_probe$;',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Authorization-plane test scaffolding
//
// Since `00000000000005_e2_grant_admission` a `waqf_access_grant` row may only be BORN inside a
// transaction that is appending an `audit_event` naming it, by an actor holding
// `admin:access_matrix:write` on that endowment — and neither a grant nor an `approval_request`
// may be hard-DELETEd ONCE THE AUDIT TRAIL RECORDS IT. That is the point of the migration, and it is
// exactly the raw `INSERT`-then-`DELETE` shape the suite uses to lay down and tear down test rows.
//
// (The DELETE guards are predicated on the trail, not on a blanket ban, so a row this suite
// raw-INSERTs — with admission disabled, and therefore with no audit event — stays purgeable without
// any wrapper. The wrapper is still needed wherever a test lays a row down through the AUDITED path
// and has to take it away again.)
//
// So the suite has to say so OUT LOUD rather than sneak past. `authzScaffoldingSql()` wraps
// scaffolding statements in a `DO` block that DISABLES the three guards, runs them, and re-enables
// them with `ENABLE ALWAYS`. One block = one statement = one transaction, so if any statement
// raises, the DISABLE rolls back with it and the guards are never left off.
//
// ⚠ THIS IS ALSO THE HONEST DEMONSTRATION OF THE RESIDUAL. `ALTER TABLE … DISABLE TRIGGER`
// requires table OWNERSHIP — and on Railway the runtime connects AS THE OWNER, so today the
// application role can do precisely this to its own guards. The migration's header says so
// plainly; privilege separation is deferred to E12 by ADR-0008. Every assertion about what the
// guards refuse is therefore an assertion about a caller who has NOT disabled them, and no test in
// this repository may be written as though disabling were impossible.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** The migration-5 guards that stand between the suite and its own raw scaffolding rows. */
export const AUTHZ_PLANE_SCAFFOLDING_GUARDS: readonly { table: string; trigger: string }[] = [
  { table: 'waqf_access_grant', trigger: 'waqf_access_grant_admission' },
  { table: 'waqf_access_grant', trigger: 'waqf_access_grant_no_delete' },
  { table: 'approval_request', trigger: 'approval_request_no_delete' },
];

/**
 * One statement that runs `statements` with the authorization-plane guards temporarily off.
 *
 * Use it ONLY for scaffolding — laying a fixture row down, tearing one down. Never for the
 * statement under test: a probe run inside this block proves nothing, because the guard it is
 * probing is not installed while it runs.
 */
export function authzScaffoldingSql(statements: readonly string[]): string {
  return scaffoldingSql(AUTHZ_PLANE_SCAFFOLDING_GUARDS, statements, 'qm_scaffold');
}

/**
 * PROVISIONS grants through the AUDITED path with access-matrix admission suspended.
 *
 * ── WHY EVERY BOOTSTRAP SITE IN THIS SUITE NEEDS IT SINCE MIGRATION 9 ──────────────────────────
 * `00000000000009_e2_close_system_marker` removed the `actorType = 'SYSTEM'` disjunct from
 * `qmulate_grant_admission()`. Until then, five files bootstrapped their first admin (or disposable)
 * seat by writing it on a `makeSystemContext()` — the shape the seed used — and admission
 * short-circuited on the claim. It no longer does: the admitting `audit_event` must name an actor who
 * ALREADY holds `admin:access_matrix:write` on that endowment, and a test provisioner deliberately
 * holds nothing (a provisioner with real authority would be a seat every test silently ran beside).
 *
 * So provisioning is now explicit about needing a PRIVILEGE — table ownership — instead of a claim
 * anybody can write. `withAccessMatrixBootstrap()` documents that fully; this is the suite-local
 * spelling that also keeps the write audited, so the row lands in the hash chain with an event id and
 * becomes "established" authority for anything issued through the ordinary path afterwards.
 *
 * ⚠ SCAFFOLDING ONLY — the same rule as `authzScaffoldingSql()`. Never wrap the statement under test:
 * the guard it is probing is not installed while this runs. Every refusal this suite asserts is an
 * assertion about a caller who has NOT suspended admission, and the trigger is fully live for every
 * statement outside this wrapper.
 */
export async function provisionGrants(
  ctx: Parameters<DatabaseModule['createPrismaClient']>[0],
  write: (tx: DatabaseModuleShape.ExtendedPrismaClient) => Promise<void>,
): Promise<void> {
  const db = await databaseModule();
  // ⚠ THE PRIVILEGED (OWNER) CLIENT, NOT `createPrismaClient()`  (ADR-0008 round 6). It used to be
  // the app connection, which owned the tables and could therefore suspend the admission trigger.
  // It no longer does — MEASURED: `ALTER TABLE "waqf_access_grant" DISABLE TRIGGER` from the app role
  // raises `42501 must be owner of table waqf_access_grant`. The write stays AUDITED (same extension
  // chain, same hash chain), so a seat bootstrapped here is still "established" authority for
  // anything issued through the ordinary `provisionAccessGrant()` path afterwards.
  await db.withAudit(db.createPrivilegedPrismaClient(ctx), async (tx) =>
    db.withAccessMatrixBootstrap(tx as unknown as DatabaseModuleShape.RawSqlExecutor, () =>
      write(tx),
    ),
  );
}

/**
 * The migration-6 guards that stand between the suite and its own corpus / ledger fixture rows.
 *
 * ⚠ WHY THIS LIST IS NOT PREDICATED ON THE TRAIL, unlike `AUTHZ_PLANE_SCAFFOLDING_GUARDS`. Migration
 * 5's DELETE guards ask "does an `audit_event` name this row?", so a raw-INSERTed test row stays
 * purgeable with no wrapper. Migration 6 refuses OUTRIGHT — there is no admission control on `asset`
 * / `transaction` / `distribution`, so a row CAN be born raw and untrailed, and a trail-conditional
 * guard would have protected the honest rows while leaving exactly the forged ones deletable
 * (migration 6 §1). The price is that every test that lays a corpus row down has to take it away
 * through this wrapper, and that price is the point: it is visible in the source, and
 * `assertGuardsInstalled()` fails the next file if a block ever leaks a guard in the OFF state.
 */
export const RETENTION_SCAFFOLDING_GUARDS: readonly { table: string; trigger: string }[] = [
  { table: 'asset', trigger: 'asset_no_delete' },
  { table: 'expropriation', trigger: 'expropriation_no_delete' },
  { table: 'reclassification_event', trigger: 'reclassification_event_no_delete' },
  { table: 'transaction', trigger: 'transaction_no_delete' },
  { table: 'distribution', trigger: 'distribution_no_delete' },
  { table: 'distribution_line_item', trigger: 'distribution_line_item_no_delete' },
  { table: 'nazir_fee', trigger: 'nazir_fee_no_delete' },
  { table: 'bank_account', trigger: 'bank_account_no_delete' },
  { table: 'lease', trigger: 'lease_no_delete' },
  { table: 'trusteeship_deed', trigger: 'trusteeship_deed_no_delete' },
  { table: 'beneficiary', trigger: 'beneficiary_no_delete' },
];

/**
 * One statement that runs `statements` with the corpus / ledger retention guards temporarily off.
 *
 * Same contract and same warning as {@link authzScaffoldingSql}: scaffolding ONLY. A probe run
 * inside this block proves nothing, because the guard it is probing is not installed while it runs.
 */
export function retentionScaffoldingSql(statements: readonly string[]): string {
  return scaffoldingSql(RETENTION_SCAFFOLDING_GUARDS, statements, 'qm_retention_scaffold');
}

/**
 * The migration-8 guards that stand between the suite and its own configuration / identity /
 * compliance-evidence fixture rows.
 *
 * Same rule as {@link RETENTION_SCAFFOLDING_GUARDS} and for the same reason: migration 8 refuses
 * `DELETE` OUTRIGHT rather than conditionally on the audit trail, because none of these tables has
 * admission control — a row can be born by raw `INSERT` with no event naming it, so a
 * trail-conditional guard would protect the honest rows and leave exactly the forged ones deletable.
 *
 * The price is that every test which lays one of these rows down has to take it away through this
 * wrapper, and that price is the point: the exemption is visible in the source, and
 * `assertGuardsInstalled()` fails the NEXT file if a block ever leaks a guard in the OFF state.
 */
export const RETENTION_REMAINDER_SCAFFOLDING_GUARDS: readonly {
  table: string;
  trigger: string;
}[] = [
  { table: 'setting', trigger: 'setting_no_delete' },
  // ⊕ migration 55 — the last-primary-admin rule and the system-level rule refuse DELETE.
  { table: 'user', trigger: 'user_last_primary_admin_guard' },
  { table: 'access_level', trigger: 'access_level_guard' },
  { table: 'client', trigger: 'client_no_delete' },
  { table: 'waqif', trigger: 'waqif_no_delete' },
  { table: 'compliance_obligation', trigger: 'compliance_obligation_no_delete' },
  { table: 'compliance_task', trigger: 'compliance_task_no_delete' },
  { table: 'government_filing', trigger: 'government_filing_no_delete' },
  { table: 'zakat_filing', trigger: 'zakat_filing_no_delete' },
  { table: 'deadline', trigger: 'deadline_no_delete' },
  { table: 'legal_case', trigger: 'legal_case_no_delete' },
  // ⊕ S9-3c (migration 40). `material_change` JOINS this family rather than declaring a second
  // mechanism: its `_no_delete` calls migration 8's own `qmulate_remainder_reject_delete()` with
  // its own `TG_ARGV[0]` hint. A change row is the evidence of WHY a 15-business-day update clock
  // started, and its effective date IS that clock — and because "un-filed" is a query over
  // SURVIVING rows, erasing one can silently loosen or remove the obligation itself.
  { table: 'material_change', trigger: 'material_change_no_delete' },
  // ⊕ S9-3d (migration 41). Joins the family for the same reason: an escalation row is the evidence
  // that a warning was raised, and erasing it is the cheapest way to make a missed statutory
  // deadline look as though nobody was ever told.
  { table: 'escalation_event', trigger: 'escalation_event_no_delete' },
];

/**
 * One statement that runs `statements` with the migration-8 retention guards temporarily off.
 *
 * Same contract and same warning as {@link authzScaffoldingSql}: scaffolding ONLY. A probe run inside
 * this block proves nothing, because the guard it is probing is not installed while it runs.
 */
export function retentionRemainderScaffoldingSql(statements: readonly string[]): string {
  return scaffoldingSql(
    RETENTION_REMAINDER_SCAFFOLDING_GUARDS,
    statements,
    'qm_remainder_scaffold',
  );
}

/**
 * The shared body of the three scaffolding wrappers. One block = one statement = one transaction.
 *
 * ⚠ IT CARRIES {@link PRIVILEGED_SQL_SENTINEL}, so {@link basePrisma}'s façade re-issues it on the
 * OWNER connection. That is required, not cosmetic: `ALTER TABLE … DISABLE TRIGGER` needs table
 * ownership, and since ADR-0008 round 6 the app role owns nothing — MEASURED, this block raises
 * `42501 must be owner of table` on the app connection. The sentinel is on the SCAFFOLDING only;
 * `guardProbeSql()` and `rollbackProbeSql()` do not emit it and therefore keep running on the
 * restricted connection, where a refusal means something.
 */
function scaffoldingSql(
  guards: readonly { table: string; trigger: string }[],
  statements: readonly string[],
  tag: string,
): string {
  return [
    PRIVILEGED_SQL_SENTINEL,
    `DO $${tag}$`,
    'BEGIN',
    ...guards.map(({ table, trigger }) => `  ALTER TABLE "${table}" DISABLE TRIGGER ${trigger};`),
    ...statements.map((statement) => `  ${statement};`),
    ...guards.map(
      ({ table, trigger }) => `  ALTER TABLE "${table}" ENABLE ALWAYS TRIGGER ${trigger};`,
    ),
    'END',
    `$${tag}$;`,
  ].join('\n');
}

/**
 * Wraps statements that MUST succeed, then throws so they are rolled back.
 *
 * Used for the reserved-matter escape hatch and for "an ordinary column is still editable":
 * both need to prove the statement runs without leaving the seeded database altered.
 */
export function rollbackProbeSql(statements: readonly string[]): string {
  return [
    'DO $qm_probe$',
    'BEGIN',
    ...statements.map((statement) => `  ${statement};`),
    `  RAISE EXCEPTION '${PROBE_SUCCEEDED}' USING ERRCODE = 'P0001';`,
    'END',
    '$qm_probe$;',
  ].join('\n');
}

/** Everything a Postgres error might be hiding in, flattened for matching. */
export function errorText(error: unknown): string {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);
  const withMeta = error as { meta?: unknown; code?: unknown };
  if (withMeta.meta !== undefined) parts.push(JSON.stringify(withMeta.meta));
  if (typeof withMeta.code === 'string') parts.push(withMeta.code);
  parts.push(String(error));
  return parts.join(' || ');
}

/**
 * Runs a GUARD probe and returns the flattened server error. Throws if the statement did not throw.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠⚠ IT RUNS ON THE **PRIVILEGED** CONNECTION, AND THAT IS DELIBERATE. READ THIS BEFORE CHANGING IT.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Since ADR-0008 round 6 the app role holds no `DELETE` on any endowment table, no `UPDATE` on
 * `audit_event`, no `TRUNCATE` anywhere and no write at all on `waqf_access_grant`. So a probe of a
 * GUARD TRIGGER, run on the app connection, is refused by the **ACL** before the trigger is ever
 * reached: `42501 permission denied for table asset` instead of the trigger's
 * "asset rows may not be deleted during the retention window".
 *
 * That would leave the whole guard suite GREEN while measuring nothing about the guards — the single
 * most dangerous outcome available here, and precisely the silent degradation this sprint has shipped
 * five times. `runProbe()` therefore runs on the connection that HOLDS every table privilege, so that
 * **what refuses is always the GUARD and never the ACL.** The claim each existing probe makes is
 * consequently STRONGER than before, not weaker: "even the table OWNER cannot delete this row".
 *
 * ── AND HERE IS THE LINE THAT MUST NOT BE CROSSED ────────────────────────────────────────────────
 * A probe of a **PRIVILEGE** must never run here. As the owner, every ACL question answers "yes", so
 * a privilege assertion made on this connection is vacuous. Every privilege claim in this repository
 * lives in `authorization-plane-privilege.integration.test.ts`, which uses its own `attempt()` helper
 * bound to {@link basePrisma} — the restricted connection — and whose `beforeAll` fails outright if
 * that connection turns out to be SUPERUSER or BYPASSRLS. Keep the two apart.
 *
 * ── THE `session_replication_role` EXCEPTION ─────────────────────────────────────────────────────
 * `SET session_replication_role = 'replica'` — the Sprint-1 bypass that defeated gate G-1, and the
 * reason every guard in this schema is `ENABLE ALWAYS` — requires SUPERUSER. MEASURED: neither
 * `qmulate_app` nor `qmulate_owner` may set it (`42501 permission denied to set parameter`). A probe
 * that uses it must therefore run on the platform superuser, or it proves nothing about
 * `ENABLE ALWAYS` at all. Those probes are routed to {@link superuserPrisma} automatically, which also
 * makes the resulting claim the strongest available: *even a superuser wielding the replica GUC cannot
 * skip these triggers.*
 */
export async function runProbe(sql: string): Promise<string> {
  const prisma = /session_replication_role/i.test(sql)
    ? await superuserPrisma()
    : await privilegedPrisma();
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error: unknown) {
    return errorText(error);
  }
  throw new Error(
    `A guard probe completed without raising. Every probe ends in RAISE, so this means the SQL ` +
      `never ran as written:\n${sql}`,
  );
}

/**
 * ⚠⚠ THE PLATFORM SUPERUSER CONNECTION (`SUPERUSER_DATABASE_URL`). IT BYPASSES EVERYTHING.
 *
 * MEASURED: `rolsuper = true, rolbypassrls = true`. It bypasses table GRANTs, ownership checks and
 * `FORCE ROW LEVEL SECURITY` alike. **No assertion about a privilege, an ACL or an RLS policy may be
 * made on this connection — it would pass for the wrong reason, always.**
 *
 * It exists for exactly ONE class of probe: the ones that `SET session_replication_role = 'replica'`,
 * which is a superuser-only parameter and is the bypass `ENABLE ALWAYS` (`tgenabled = 'A'`) was
 * introduced to survive. Proving that survival requires an actor who can actually set the GUC.
 *
 * Constructed from the generated client directly rather than through `src/client.ts`, so that no
 * shipped module has a superuser client factory in it at all.
 */
let superuserClientPromise: Promise<BaseClient> | null = null;

export function superuserPrisma(): Promise<BaseClient> {
  superuserClientPromise ??= (async () => {
    const url = process.env.SUPERUSER_DATABASE_URL?.trim();
    if (url === undefined || url === '') {
      throw new Error(
        'SUPERUSER_DATABASE_URL is not set. It is needed ONLY for the probes that ' +
          "`SET session_replication_role = 'replica'` — a superuser-only parameter, and the bypass " +
          'that `ENABLE ALWAYS` exists to survive (the Sprint-1 finding that defeated gate G-1). ' +
          'Neither qmulate_app nor qmulate_owner may set it (MEASURED: 42501), so without this ' +
          'variable those probes cannot run and the G-1 claim would be UNPROVEN rather than merely ' +
          'unmeasured. `scripts/dev-postgres.ts` injects it; CI sets it per job.',
      );
    }
    const { PrismaClient } = await import('../generated/client/index.js');
    return new PrismaClient({
      datasourceUrl: url,
      log: ['warn', 'error'],
    }) as unknown as BaseClient;
  })();
  return superuserClientPromise;
}

/** Closes the harness-owned superuser pool. Called by {@link closeDatabase}. */
async function disconnectSuperuser(): Promise<void> {
  if (superuserClientPromise === null) return;
  const client = await superuserClientPromise.catch(() => null);
  superuserClientPromise = null;
  await (client as unknown as { $disconnect?: () => Promise<void> } | null)?.$disconnect?.();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The fixture seed, as a subprocess
//
// The seed is a PROGRAM, not a library: `src/seed.ts` calls `main()` at module scope and sets
// `process.exitCode` on refusal. Importing it would run it inside the test worker and make the
// exit code unobservable, so every seed assertion spawns it exactly the way CI does.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** `packages/database/src/seed.ts` — the real entry point. */
export const SEED_ENTRYPOINT = path.join(PACKAGE_ROOT, 'src', 'seed.ts');

/**
 * Every declared seed entry point (`scripts.seed`, `prisma.seed`) resolved to the file it would
 * actually execute.
 *
 * These tests invoke `src/seed.ts` directly, which means they would keep passing while
 * `pnpm --filter @qmulate/database run seed` — used by BOTH the CI integration job and the CI
 * residency-guardrail job — pointed at a file that does not exist. This derives the targets from
 * `package.json` so the mismatch is a failing assertion instead of a comment that goes stale.
 */
export function declaredSeedTargets(): { source: string; command: string; target: string }[] {
  const pkg = JSON.parse(readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
    prisma?: { seed?: string };
  };

  const declared: { source: string; command: string }[] = [];
  for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
    if (name === 'seed' || name === 'db:seed')
      declared.push({ source: `scripts.${name}`, command });
  }
  if (pkg.prisma?.seed) declared.push({ source: 'prisma.seed', command: pkg.prisma.seed });

  // `tsx src/seed.ts` -> `src/seed.ts`; the last whitespace-separated token that looks like a path.
  // ⚠ `.reverse().find()` RATHER THAN `.findLast()`, and that is a TYPE fact, not a taste one:
  // `Array.prototype.findLast` is ES2023 and `@qmulate/config`'s base sets `lib: ["ES2022"]`. It runs
  // fine on this Node 22 runtime, which is why nothing noticed while `tsconfig.json`'s include glob
  // said `tests/**` and typechecked ZERO of this directory (V3). `split()` returns a fresh array, so
  // reversing it in place mutates nothing a caller can see.
  return declared.map(({ source, command }) => {
    const token =
      command
        .trim()
        .split(/\s+/)
        .reverse()
        .find((part) => /\.(ts|js|mts|mjs)$/.test(part)) ?? '';
    return { source, command, target: path.join(PACKAGE_ROOT, token) };
  });
}

/** True when any declared seed entry point points at a file that does not exist. */
export const SEED_SCRIPT_TARGET_IS_MISSING = declaredSeedTargets().some(
  ({ target }) => !existsSync(target),
);

/** Windows publishes the bin as `tsx.cmd`, and Node refuses to spawn a `.cmd` without a shell. */
const IS_WINDOWS = process.platform === 'win32';

/** `spawnSync` of the `tsx` bin: a `.cmd` shim needs `shell: true`, and then a path with spaces needs quoting. */
function spawnTsx(args: readonly string[], env: NodeJS.ProcessEnv): ReturnType<typeof spawnSync> {
  const tsx = resolveTsx();
  const quote = (value: string): string => (IS_WINDOWS ? `"${value}"` : value);
  return spawnSync(quote(tsx), args.map(quote), {
    cwd: PACKAGE_ROOT,
    encoding: 'utf8',
    env,
    timeout: 300_000,
    shell: IS_WINDOWS,
  });
}

function resolveTsx(): string {
  const bin = IS_WINDOWS ? 'tsx.cmd' : 'tsx';
  const candidates = [
    path.join(PACKAGE_ROOT, 'node_modules', '.bin', bin),
    path.join(REPO_ROOT, 'node_modules', '.bin', bin),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    `Could not find the \`tsx\` binary in any of: ${candidates.join(', ')}. ` +
      'It is a devDependency of @qmulate/database — run `pnpm install`.',
  );
}

export interface SeedRun {
  status: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs the seed with an environment override map. A `null` value DELETES the variable, which is
 * how the "`DATA_CLASSIFICATION` unset" case is exercised without mutating the test process.
 */
export function runSeed(
  overrides: Readonly<Record<string, string | null>> = {},
  args: readonly string[] = [],
): SeedRun {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete env[key];
    else env[key] = value;
  }

  const result = spawnTsx([SEED_ENTRYPOINT, ...args], env);

  if (result.error) {
    throw new Error(`Could not spawn the seed: ${String(result.error)}`);
  }
  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

/** ⊕ S12-4 · the importer's entry point, spawned exactly the way CI spawns it (G-8 layer 3). */
export const IMPORT_ENTRYPOINT = path.join(PACKAGE_ROOT, 'src', 'import.ts');

export function runImport(
  overrides: Readonly<Record<string, string | null>> = {},
  args: readonly string[] = [],
): SeedRun {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete env[key];
    else env[key] = value;
  }
  const result = spawnTsx([IMPORT_ENTRYPOINT, ...args], env);
  if (result.error) throw new Error(`Could not spawn the importer: ${String(result.error)}`);
  return {
    status: result.status,
    stdout: String(result.stdout ?? ''),
    stderr: String(result.stderr ?? ''),
  };
}

let seededRun: SeedRun | null = null;

/**
 * Seeds the fixture once per test process and returns the run.
 *
 * The seed is idempotent (every row is upserted on a deterministic id), so calling it on a
 * database CI already seeded is safe — it converges the rows and appends a second batch of audit
 * events, which is exactly the behaviour `seed.integration.test.ts` asserts.
 */
export function ensureSeeded(): SeedRun {
  if (seededRun !== null) return seededRun;
  const run = runSeed({ DATA_CLASSIFICATION: 'fixture-only', SEED_FILE: null });
  if (run.status !== 0) {
    throw new Error(
      `The fixture seed failed (exit ${String(run.status)}). Integration assertions need a seeded ` +
        `database.\n--- stdout ---\n${run.stdout}\n--- stderr ---\n${run.stderr}`,
    );
  }
  seededRun = run;
  return run;
}

/** Forgets the memoized seed so a test can deliberately run it a second time. */
export function forgetSeed(): void {
  seededRun = null;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Test-row conventions
//
// CONFIDENTIALITY (hard rule 1): the only permitted data is `data/fixtures/sample-waqf.json`.
// Rows created BY the tests use the fixture's own id grammar with a 9xx series, so they can never
// collide with a fixture id and still satisfy the `^(client|waqif|waqf|...)-\d+$` provenance
// pattern that the post-seed scan (B6) applies. Arabic strings carry the fixture's
// "(بيانات وهمية)" — "fictional data" — marker.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Every test-created row id starts with this. Cleanup deletes exactly this range. */
export const TEST_ROW_PREFIX = 'client-9';
export const FICTIONAL_MARKER_AR = '(بيانات وهمية)';

/**
 * Hard-deletes the test-created `client` rows.
 *
 * ⚠ WRAPPED SINCE `00000000000008_e2_retention_remainder`. `client` is the engagement grouping and a
 * named natural person's family; its hard `DELETE` is now refused OUTRIGHT, so this teardown has to
 * say out loud that it is disabling a production guard rather than sneak past one. Before that
 * migration a plain `DELETE FROM "client"` looked refused (23503, because a `waqif` child existed) and
 * became PERMITTED under one `SET session_replication_role = 'replica'` — an FK is not a control.
 *
 * The `DO` block is atomic: one block = one statement = one transaction, so a raise rolls the DISABLE
 * back with it and the guard is never left off. `assertGuardsInstalled()` fails loudly if it ever is.
 */
export async function deleteTestClients(): Promise<void> {
  const prisma = await basePrisma();
  await prisma.$executeRawUnsafe(
    retentionRemainderScaffoldingSql([
      `DELETE FROM "client" WHERE "id" LIKE '${TEST_ROW_PREFIX}%'`,
    ]),
  );
}
