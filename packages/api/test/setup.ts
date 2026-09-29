// QMULATE — shared test harness for `@qmulate/api`.
//
// Loaded as a Vitest `setupFile` (so its environment defaults are in place before any test module is
// imported) AND imported directly by the test files for its helpers.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE FIVE THINGS THIS FILE EXISTS TO GET RIGHT
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// 1. A MISSING DATABASE SKIPS, IT DOES NOT FAIL — BUT IT ALSO DOES NOT LIE.
//    This machine has no Docker; the orchestrator supplies an ephemeral Postgres via
//    `scripts/dev-postgres.ts`. Integration files guard on `hasDatabase` and print a LOUD warning at
//    module scope when they skip. A skipped ACCESS_DENIED assertion must never be reported as a
//    passed one.
//
// 2. A DATABASE THAT IS PRESENT BUT UNMIGRATED OR UNSEEDED FAILS LOUDLY.
//    `assertSeeded()` refuses to let a suite proceed against a database with no fixture in it.
//    Skipping there would be the worst outcome available: a green suite that asserted nothing.
//
// 3. TEST SUBJECTS ARE PROVISIONED HERE, NOT IN THE SEED.
//    `SEED_USERS` insertion order drives the audit `occurredAt` ordinals and therefore the hash
//    chain, so adding a seat to the seed would move every subsequent event. Every subject this
//    package needs is created inside the test run, with ids under `API_TEST_PREFIX`.
//
// 4. TEST-CREATED AUDIT EVENTS ARE NEVER ATTRIBUTED TO `user-seed-admin`.
//    `@qmulate/database`'s `seed.integration.test.ts` asserts that the count of events with that
//    actorId is a whole multiple of the per-run write count, so ONE stray event from this package
//    would turn that assertion red.
//
// 5. ⚠ NO TEST MAY SPEND A WRITE-ONCE FIXTURE ROW.  ← THE AV4-B2 RULE. READ THIS BEFORE WRITING
//    A TEST THAT RECORDS A DEED TERM, A مآل CLAUSE, A RECLASSIFICATION OR ANY OTHER ONE-SHOT STATE.
//
//    A test that CONSUMES a write-once resource can only pass ONCE PER DATABASE. The second run
//    finds the resource already spent, and the failure surfaces in whichever suite asserts the
//    pristine state — which in this repo is `@qmulate/database`'s, i.e. a suite that did nothing
//    wrong, with messages that read like a founder's-condition breach (V-E3-01) rather than like a
//    stale fixture. That has now happened THREE TIMES in one sprint:
//      · `reclassification_event` rows appended against a seeded endowment (V-E3-04, round 1);
//      · the same shape again after the first "fix" (round 2);
//      · `waqf-005`'s مآل capture (AV4-B2) — this file's own AV3-01 proof spent the ONE seeded
//        intake endowment, so `seed.integration.test.ts` and `e3-deed-term-guards.
//        integration.test.ts` went red on every subsequent run. MEASURED on one pristine database:
//        run 1 `Tasks: 3 successful, 3 total`; run 2 and run 3 `Tasks: 1 successful, 2 total`.
//
//    THE RULE, and it is not negotiable by "my case is different":
//      a. A test needing an UNSPENT one-shot subject CREATES ITS OWN — see
//         {@link provisionIntakeEndowment}. It owns the row, it names it under
//         {@link API_TEST_WAQF_PREFIX}, and {@link cleanupApiTestRows} removes it again.
//      b. The SEEDED examples (`waqf-005`, owner decision D-C) are READ, never spent. They exist so
//         every run — and every human reading `data/fixtures/sample-waqf.json` — can see the intake
//         state. A test may assert their state; it may not change it.
//      c. `pnpm db:seed` CANNOT repair a spent one-shot: the seal is the product working as
//         designed (V-E3-01's fix), and the seed upserts, it never unseals.
//      d. If a test genuinely cannot create its own subject, say so in the report as an open item.
//         Do NOT leave a once-per-database landmine behind and call the suite green.
//
//    The proof obligation that goes with this rule: run `pnpm test:integration` at least TWICE
//    against ONE database and show both green. Green CI proves nothing here — CI's database is
//    always pristine, so it is structurally blind to this entire class of defect.

// ⚠ BEFORE the key defaults below, deliberately — and this line is what makes the api suite able
// to DECRYPT a database seeded by `pnpm db:seed` (S5/E4 finding). The seed loads the root `.env`
// (guardrail.ts), so its ciphertext is under the `.env` keys; `@qmulate/database`'s test harness
// loads it too (its setup imports guardrail.ts), so the two agreed — while THIS setup defaulted
// the 0x07 test keys and the first procedure ever to SELECT a `…Enc` column back
// (`beneficiary.get`, E4) failed authenticated decryption against seeded rows. `loadRootEnv()`
// never overrides, so CI — which exports one key set to every job — is byte-for-byte unaffected,
// and the defaults below still apply when no `.env` exists.
import '@qmulate/config/load-env';

import { existsSync } from 'node:fs';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Deterministic key material
 *
 * `packages/database/src/crypto.ts` reads these straight from `process.env`, and the encryption
 * extension cannot read or write a UBO/IBAN column without them. The values are the SAME obviously
 * fake constants `@qmulate/database`'s own harness defaults, so a database seeded by that suite is
 * readable by this one.
 *
 * ⚠ They are absent from `@qmulate/config`'s `serverEnvSchema`, from `.env.example` and from CI —
 * flagged by owner-E as well. Defaulting them here keeps the suite runnable; it is NOT a substitute.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const TEST_FIELD_ENCRYPTION_KEY_B64 = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=';
const TEST_FIELD_HMAC_KEY_B64 = 'CwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCwsLCws=';

function defaultEnv(name: string, value: string): void {
  if (process.env[name] === undefined || process.env[name] === '') process.env[name] = value;
}

defaultEnv('FIELD_ENCRYPTION_KEYS', `{"1":"${TEST_FIELD_ENCRYPTION_KEY_B64}"}`);
defaultEnv('FIELD_ENCRYPTION_ACTIVE_KEY', '1');
defaultEnv('FIELD_HMAC_KEY', TEST_FIELD_HMAC_KEY_B64);
// Only the invented fixture may touch any environment this package can reach (G-8).
defaultEnv('DATA_CLASSIFICATION', 'fixture-only');

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Database availability
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const rawDatabaseUrl = process.env.DATABASE_URL?.trim();

export const DATABASE_URL: string | undefined =
  rawDatabaseUrl === undefined || rawDatabaseUrl === '' ? undefined : rawDatabaseUrl;

/** Drives every `describe.skipIf(!hasDatabase)` in the integration files. */
export const hasDatabase: boolean = DATABASE_URL !== undefined;

/**
 * Prints the reason a suite is being skipped, at module scope, so it lands in CI output next to the
 * skipped tests rather than being inferred from a count.
 */
export function warnNoDatabase(gate: string): void {
  if (hasDatabase) return;
  console.warn(
    `[qmulate] DATABASE_URL is not set — SKIPPING ${gate}. These assertions did NOT run, so this ` +
      `run does not prove ${gate}. Run: pnpm exec tsx scripts/dev-postgres.ts --reset --run ` +
      `"pnpm --filter @qmulate/database run migrate:deploy && pnpm run db:seed && ` +
      `pnpm --filter @qmulate/api run test:integration"`,
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Lazy module access
 *
 * `@qmulate/database` re-exports the GENERATED Prisma client, which does not exist until
 * `prisma generate` has run. A static import would crash the UNIT suite on a fresh checkout, so every
 * integration file reaches both packages through these dynamic accessors.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

import type * as DatabaseModuleShape from '@qmulate/database';
import type * as ApiContextShape from '../src/context.js';

type DatabaseModule = typeof DatabaseModuleShape;
type ApiContextModule = typeof ApiContextShape;

let databaseModulePromise: Promise<DatabaseModule> | null = null;

export function databaseModule(): Promise<DatabaseModule> {
  databaseModulePromise ??= import('@qmulate/database').catch((error: unknown) => {
    throw new Error(
      'Could not load @qmulate/database. The generated Prisma client is probably missing — run ' +
        `\`pnpm --filter @qmulate/database exec prisma generate\` first. Original: ${String(error)}`,
    );
  });
  return databaseModulePromise;
}

/**
 * The API's context factory module.
 *
 * ⚠ IMPORTED FROM `../src/context.js`, NOT FROM THE PACKAGE BARREL, ON PURPOSE.
 * `createContextForSession` is deliberately NOT re-exported from `src/index.ts` — it is the seam that
 * builds a request context around an already-resolved session, bypassing `evaluateAuthGate`, and a
 * barrel export would make it reachable from `apps/web`. Reaching it through the file path is what
 * confines it to this package, and `procedure-ladder.test.ts` asserts the barrel does not carry it.
 */
export function apiContextModule(): Promise<ApiContextModule> {
  return import('../src/context.js');
}

/** The UNEXTENDED client: raw SQL, and reads that must not be narrowed by the force-filter. */
export async function basePrisma(): Promise<
  Awaited<ReturnType<DatabaseModule['getBasePrismaClient']>>
> {
  const { getBasePrismaClient } = await databaseModule();
  return getBasePrismaClient();
}

/**
 * ⚠ THE PRIVILEGED (OWNER) CONNECTION — `MIGRATOR_DATABASE_URL`  (ADR-0008 round 6).
 *
 * SCAFFOLDING ONLY: the `DISABLE TRIGGER` blocks that lay this package's fixture rows down and take
 * them away, and the hard DELETEs in `cleanupApiTestRows()`. Since privilege separation the runtime
 * role (`qmulate_app`, `DATABASE_URL`) owns no table and holds no DELETE on any endowment table — so
 * every one of those statements raises `42501 must be owner of table` / `permission denied for table`
 * on the app connection. That is the correct posture, not a harness bug.
 *
 * ⚠ NO ASSERTION MAY BE MADE ON THIS CONNECTION. Every refusal this suite asserts must come through a
 * tRPC procedure or through {@link basePrisma}; a refusal observed as the table owner proves nothing
 * about the runtime, which is the entire point of the split.
 */
export async function privilegedPrisma(): Promise<
  Awaited<ReturnType<DatabaseModule['getPrivilegedBasePrismaClient']>>
> {
  const { getPrivilegedBasePrismaClient } = await databaseModule();
  return getPrivilegedBasePrismaClient();
}

/** Closes the shared pool. Call from every integration file's `afterAll`. */
export async function closeDatabase(): Promise<void> {
  // `disconnectPrisma()` closes EVERY pool in the role registry (app, provisioner, owner), not one —
  // a half-closed registry is what produced the S2 orphaned-pool cascade.
  if (databaseModulePromise === null) return;
  const { disconnectPrisma } = await databaseModule();
  await disconnectPrisma();
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Readiness
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Every fixture endowment, in fixture order. `waqf-001` is the one with beneficiaries.
 *
 * ⚠ FIVE SINCE THE S4/E3 CLOSE-OUT, AND IT WAS FOUR FOR THREE DAYS AFTER `waqf-005` LANDED (owner
 * answer D-C). Nothing failed while it lagged, which is the problem: `scope-denial.integration.
 * test.ts` iterates this list to prove "EVERY endowment is denied to a caller with no grant", so a
 * missing id is an endowment whose denial was never checked while the test's own name claimed it
 * was.
 *
 * TODO(surface): this list is still TRANSCRIBED. The drift-proof form is to derive it from the
 * database (`SELECT "id" FROM "waqf" WHERE "id" ~ '^waqf-[0-9]+$'`) and assert the two agree, which
 * belongs in `scope-denial.integration.test.ts` beside the loop that consumes it — left out of this
 * change only because that file is being edited concurrently and a lost update there is worse than
 * a transcribed list here.
 */
export const FIXTURE_WAQF_IDS = [
  'waqf-001',
  'waqf-002',
  'waqf-003',
  'waqf-004',
  'waqf-005',
] as const;

/**
 * FAILS — never skips — when the database is present but not migrated and seeded.
 *
 * The E2 authority guards are checked too: this package's assertions are ABOUT them, so running
 * against a database that predates migration `00000000000003_e2_authority_guards` would produce a
 * green suite over an unguarded `approval_request`.
 */
export async function assertSeeded(): Promise<void> {
  const prisma = await basePrisma();

  const [waqfCount] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "waqf"`,
  );
  if (waqfCount === undefined || Number(waqfCount.n) === 0) {
    throw new Error(
      'The database has no `waqf` rows: it is unseeded. Every assertion in this package is about a ' +
        'real caller reaching real rows, so an empty database would make them vacuous. Run ' +
        '`pnpm --filter @qmulate/database run migrate:deploy && pnpm run db:seed` first.',
    );
  }

  const guards = await prisma.$queryRawUnsafe<{ tgname: string }[]>(
    `SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'approval_request_authority'`,
  );
  if (guards.length === 0) {
    throw new Error(
      'The `approval_request_authority` trigger is missing: migration ' +
        '00000000000003_e2_authority_guards has not been applied. This package asserts the RUNTIME ' +
        'half of "the Nazir is the sole approval authority"; running it against a database with no ' +
        'SQL half would prove one layer and imply three.',
    );
  }
}

/** True when the repository's invented fixture is present. Nothing else may ever be loaded (G-8). */
export const FIXTURE_PRESENT = existsSync(
  new URL('../../../data/fixtures/sample-waqf.json', import.meta.url),
);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Test subjects
 *
 * Ids are all under one prefix so cleanup is exact and can never touch a fixture row.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Every row this package creates starts with this. `cleanupApiTestRows()` deletes exactly this range. */
export const API_TEST_PREFIX = 'user-test-api-';

/**
 * The actor every provisioning write is attributed to.
 *
 * ⚠ NOT `user-seed-admin`. See point 4 in the header — `@qmulate/database`'s seed suite asserts a
 * whole-multiple event count for that actor, and one stray event here would turn it red.
 */
export const API_TEST_ACTOR_ID = 'user-test-api-fixture';

/** The user id recorded as the ISSUER of a test grant. `grantedByUserId <> userId` is a DB CHECK. */
export const API_TEST_GRANTOR_ID = 'user-test-api-grantor';

/**
 * Every ENDOWMENT this package creates starts with this — see rule 5 in the header.
 *
 * ⚠ IT DELIBERATELY DOES NOT MATCH THE FIXTURE GRAMMAR `^waqf-[0-9]+$`. `@qmulate/database`'s
 * `seed.integration.test.ts` asserts ABSOLUTE row counts (`Waqf: 5`) and enumerates the fixture ids,
 * so a test endowment that looked like a seeded one would be indistinguishable from a seed defect —
 * and one that OUTLIVED the run would turn that suite red for a reason no message would explain.
 */
export const API_TEST_WAQF_PREFIX = 'waqf-test-api-';

/** The Arabic marker every invented string in this repository carries (G-8 / Binding rule: fixtures only). */
export const FICTIONAL_MARKER_AR = '(بيانات وهمية)';

export interface TestSubjectSpec {
  /** Must start with {@link API_TEST_PREFIX}. */
  readonly id: string;
  /** The Prisma `Role` enum value, or `null` for a user with NO grant at all. */
  readonly role: string | null;
  /** Which endowments the grant covers. Ignored when `role` is null. */
  readonly waqfIds: readonly string[];
  /** Permission strings. Must satisfy `waqf_access_grant_permission_guard` (3 segments, closed verbs). */
  readonly permissions?: readonly string[];
  /** Required IFF `role === 'BENEFICIARY'` (DB CHECK `waqf_access_grant_beneficiary_self_pin`). */
  readonly beneficiarySelfId?: string | null;
  /** AML compartment membership. `canViewAmlRestricted` is derived from it (DB CHECK). */
  readonly amlCompartment?: boolean;
  /** Backdated/expired/future windows, for the grant-validity assertions. */
  readonly validFrom?: Date;
  readonly validUntil?: Date | null;
  readonly revokedAt?: Date | null;
}

/**
 * Creates (idempotently) the `User` rows and `WaqfAccessGrant` rows for a set of test subjects.
 *
 * ── EVERY DB GUARD THESE ROWS MUST SATISFY, IN ONE PLACE ──────────────────────────────────────
 *  · `waqf_access_grant_no_self_issue`              — `grantedByUserId <> userId`
 *  · `waqf_access_grant_aml_flags`                  — `canViewAmlRestricted` implies `amlCompartment`
 *  · `waqf_access_grant_beneficiary_self_pin`       — `beneficiarySelfId` set IFF role = BENEFICIARY
 *  · `waqf_access_grant_permission_guard` (trigger) — 3 segments, closed verbs, no wildcard, and
 *                                                     approve/sign only on role = NAZIR
 *  · `waqf_access_grant_role_immutable` (trigger)   — so this NEVER updates an existing grant's role;
 *                                                     an existing row is left exactly as it is.
 *
 * Runs on a SYSTEM context with `bypass: 'system-job'`, which is the only legitimate way to write the
 * authorization plane without an `admin:access_matrix:write` permission — and it is legitimate here
 * precisely because this is fixture provisioning, not a request path.
 *
 * ── ⚠ AND SINCE MIGRATION 9 THAT IS NOT SUFFICIENT: IT SUSPENDS A GUARD ────────────────────────
 * `00000000000009_e2_close_system_marker` removed the `actorType = 'SYSTEM'` disjunct from
 * `qmulate_grant_admission()`. A `SYSTEM` context is no longer admitted by the database at all — the
 * admitting `audit_event` must name an actor who ALREADY holds `admin:access_matrix:write` on that
 * endowment, and `API_TEST_ACTOR_ID` holds nothing anywhere by design (a provisioner that held real
 * authority would be a seat every api test silently ran beside).
 *
 * So the grant writes below run inside `withAccessMatrixBootstrap()`, which turns the admission
 * trigger off and restores `ENABLE ALWAYS` afterwards. Read that module's header before copying this:
 * it needs table OWNERSHIP, it is ADR-0008's named DDL residual (open until E12), and it is legitimate
 * HERE only because this is provisioning. It must never appear in a request path, and no assertion in
 * this suite may be written as though admission were unenforceable — the guard is fully live for every
 * statement not inside this one wrapper.
 */
export async function provisionTestSubjects(subjects: readonly TestSubjectSpec[]): Promise<void> {
  // ⚠ `createPrivilegedPrismaClient`, NOT `createPrismaClient` (ADR-0008 round 6). This function
  // suspends `waqf_access_grant_admission` through `withAccessMatrixBootstrap()`, which requires table
  // OWNERSHIP — a privilege the runtime role no longer has, deliberately. MEASURED on the app
  // connection: `42501 must be owner of table waqf_access_grant`. The writes stay AUDITED (identical
  // extension chain, same hash chain), so a provisioned seat still lands in the trail with its event
  // id, which is what the admission trigger reads for anything issued afterwards.
  const { makeSystemContext, withAudit, createPrivilegedPrismaClient, withAccessMatrixBootstrap } =
    await databaseModule();

  for (const subject of subjects) {
    if (!subject.id.startsWith(API_TEST_PREFIX)) {
      throw new Error(
        `test subject "${subject.id}" must start with "${API_TEST_PREFIX}" so cleanup is exact and ` +
          `can never touch a fixture row.`,
      );
    }
  }

  const ctx = makeSystemContext({ actorId: API_TEST_ACTOR_ID, requestId: 'api-test-provision' });
  const db = createPrivilegedPrismaClient(ctx);

  await withAudit(db, async (tx) => {
    // The grantor exists as a User so the trail can resolve it. It holds no grant of its own.
    for (const id of [API_TEST_GRANTOR_ID, ...subjects.map((s) => s.id)]) {
      const existing = await tx.user.findFirst({ where: { id }, select: { id: true } });
      if (existing !== null) continue;
      await tx.user.create({
        data: {
          id,
          name: `API test subject ${id} (بيانات وهمية)`,
          email: `${id}@example.test`,
          emailVerified: false,
          // Every test subject is TOTP-enrolled: the enrolment gate is universal, so a subject
          // without it could never reach a scoped procedure and every assertion below it would be
          // proving the wrong refusal.
          twoFactorEnabled: true,
          locale: 'ar',
          isActive: true,
        },
      });
    }

    // ⚠ ADMISSION IS SUSPENDED FROM HERE TO THE END OF THE LOOP, AND ONLY HERE. See the note on this
    // function: since migration 9 there is no marker a provisioner holding no authority can write.
    await withAccessMatrixBootstrap(tx as never, async () => {
      for (const subject of subjects) {
        if (subject.role === null) continue;
        for (const waqfId of subject.waqfIds) {
          const existing = await tx.waqfAccessGrant.findFirst({
            where: { userId: subject.id, waqfId, role: subject.role as never },
            select: { id: true },
          });
          // NEVER update: `role`, `userId` and `waqfId` are write-once at the database, and
          // revocation is one-way. A re-run reuses the row it already made.
          if (existing !== null) continue;

          await tx.waqfAccessGrant.create({
            data: {
              userId: subject.id,
              waqfId,
              role: subject.role as never,
              permissions: [...(subject.permissions ?? [])],
              dataScopes: [],
              amlCompartment: subject.amlCompartment ?? false,
              canViewAmlRestricted: false,
              beneficiarySelfId: subject.beneficiarySelfId ?? null,
              scopeRefs: [],
              // ⚠ THE PROVISIONING ACTOR, NOT `API_TEST_GRANTOR_ID`. This is a DIRECT delegate write
              // rather than a call to `activateGrant()` (which derives the issuer from the session),
              // and migration `00000000000005_e2_grant_admission` binds `grantedByUserId` to the
              // identity the admitting `audit_event` records: a caller free to name a third party as
              // issuer defeats `waqf_access_grant_no_self_issue` (`grantedByUserId <> userId`) by
              // writing somebody else's id and promoting themselves. A grantor distinct from the
              // acting identity can no longer commit. `API_TEST_GRANTOR_ID` still exists and is still
              // the right value for `grant-activation.integration.test.ts`, whose whole point is that
              // a PAYLOAD issuer is ignored.
              grantedByUserId: API_TEST_ACTOR_ID,
              validFrom: subject.validFrom ?? new Date('2026-01-01T00:00:00.000Z'),
              validUntil: subject.validUntil ?? null,
              revokedAt: subject.revokedAt ?? null,
            },
          });
        }
      }
    });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * A ONE-SHOT SUBJECT THE TEST OWNS  (rule 5 in the header — the AV4-B2 fix)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface IntakeEndowmentSpec {
  /** Must start with {@link API_TEST_WAQF_PREFIX}. */
  readonly id: string;
  /** An EXISTING seeded waqif — the FK is real. Defaults to `waqif-002`, `waqf-005`'s own waqif. */
  readonly waqifId?: string;
  /**
   * Recorded AT INSERT, so the deed-term capture call can omit it exactly as it must on the seeded
   * intake endowment (supplying an already-recorded term trips the write-once pre-check). Pass
   * `null` to leave the column NULL — the state that keeps HALTING at the engine.
   */
  readonly continuationStipulation?: 'ZUHUR_ONLY' | 'ZUHUR_AND_BUTUN' | null;
  readonly entitlementOrder?: 'ORDERED' | 'SHARED' | 'LINEAGE_CONTINUATION';
  /**
   * ⚠ The previous union spelled a fourth member `'DIRECT_BENEFIT'`, which is NOT a
   * `WaqfClassification` — any caller would have died on the `::"WaqfClassification"` cast. No
   * caller ever passed it (every user takes the SMALL default), so the typo was latent; fixed to
   * the real member. ⊕ `NOT_CLASSIFIED` added for S8-Q4's register-lock subjects.
   */
  readonly classification?: 'LARGE' | 'MEDIUM' | 'SMALL' | 'NOT_CLASSIFIED';
  /**
   * ⊕ S9-4a — ذات انتفاع مباشر, the orthogonal usage axis (owner ruling, fifth batch, 2026-08-25).
   *
   * Defaults to `false` — an explicit "not direct use", **NOT** the unrecorded state — because a
   * provisioned test endowment is a worked example and has to state its facts. Pass `null`
   * deliberately to build the UNRECORDED subject the gate resolver refuses to gate on
   * (`DIRECT_USE_UNRECORDED`).
   */
  readonly directUtilization?: boolean | null;
  readonly type?: 'FAMILY_DHURRI' | 'PUBLIC_CHARITABLE' | 'JOINT';
  /**
   * ⊕ S12-3 · the endowment's onboarding gates. `'cleared'` (default) writes all three CLEARED so the
   * suites that distribute and file on provisioned endowments keep working; `'open'` writes all
   * three OPEN — the V-11 subject. Migration 52's twins treat a MISSING row as not cleared, so every
   * provisioned endowment gets its rows.
   */
  readonly gates?: 'cleared' | 'open';
}

/**
 * Creates an INTAKE-STATE endowment this test file owns: `reversionClauseCaptured = false`,
 * `reversionKind` NULL, both reversion dates NULL — the one state on which the مآل capture path can
 * run at all.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS EXISTS AT ALL, IN ONE PARAGRAPH  (AV4-B2)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Recording a deed term is IRREVERSIBLE — `qmulate_shart_guard()` tier 3 seals the whole مآل group
 * the instant the clause is captured, nothing in the product can unseal it, and `db:seed` upserts
 * rather than repairs. A test that spent the seeded intake endowment (`waqf-005`) was therefore
 * green EXACTLY ONCE PER DATABASE, and its second run reddened `@qmulate/database`'s suite with
 * messages that read like a founder's-condition breach. The subject has to be one the test can make
 * and take away again; the seeded example stays UNSPENT so it keeps demonstrating the intake state.
 *
 * ── ⚠ RAW SQL ON THE OWNER CONNECTION, AND WHY THAT IS THE HONEST CHOICE ─────────────────────
 * There is no product path that CREATES an endowment (E3 records terms on one that exists), so
 * there is nothing to drive. Writing it raw means the row carries no `audit_event`, which is fine
 * and is stated rather than hidden: nothing in this package asserts a creation event for it, and
 * the capture UNDER TEST is audited through the real procedure, which is the assertion that matters.
 *
 * ── SELF-HEALING, BECAUSE A CRASHED RUN MUST NOT POISON THE NEXT ONE ─────────────────────────
 * A previous process killed between `beforeAll` and `afterAll` leaves the row behind — possibly
 * already CAPTURED. So this purges the id first (its grants, its approvals, then the row) and
 * inserts fresh. That is what makes the suite idempotent rather than merely tidy.
 */
export async function provisionIntakeEndowment(spec: IntakeEndowmentSpec): Promise<void> {
  if (!spec.id.startsWith(API_TEST_WAQF_PREFIX)) {
    throw new Error(
      `test endowment "${spec.id}" must start with "${API_TEST_WAQF_PREFIX}" so cleanup is exact ` +
        `and can never touch a fixture endowment.`,
    );
  }

  await deleteProvisionedEndowments([spec.id]);

  const prisma = await privilegedPrisma();
  const waqifId = spec.waqifId ?? 'waqif-002';
  const order = spec.entitlementOrder ?? 'LINEAGE_CONTINUATION';
  const classification = spec.classification ?? 'SMALL';
  const type = spec.type ?? 'FAMILY_DHURRI';
  const continuation =
    spec.continuationStipulation === undefined ? 'ZUHUR_AND_BUTUN' : spec.continuationStipulation;

  // ⚠ LITERALS, NOT BIND PARAMETERS, AND THAT IS THE SAME CHOICE `@qmulate/database`'s
  // `e3-lineage-reversion.integration.test.ts` makes for its constructed endowments. Six of these
  // columns are ENUMS; a bound `$n` under an enum-typed placeholder is resolved by the driver rather
  // than by Postgres, and a harness that fails on a driver's type inference teaches nothing about
  // the schema. Every value is a closed-union constant or the prefix-checked id, and both are
  // quote-escaped anyway.
  //
  // The values are INVENTED and the prose carries the Arabic fictional marker (G-8). Both date pairs
  // are stated (schema convention 2), and the reversion columns state the INTAKE fact — `false` with
  // BOTH dates NULL, which is what CHECK `waqf_reversion_recorded_at_pairs_with_capture` requires
  // on INSERT (no trigger on `waqf` sees one) and what leaves the capture path reachable.
  const q = (value: string): string => `'${value.replace(/'/g, "''")}'`;
  const shart = JSON.stringify({ note: `api test intake endowment ${FICTIONAL_MARKER_AR}` });

  await prisma.$executeRawUnsafe(
    `INSERT INTO "waqf" (
       "id","waqifId","certificateNumber","deedNumber","classification","type","nature",
       "entitlementOrder","shartAlWaqif","shartAlWaqifVersion","shartAlWaqifSetAt",
       "shartAlWaqifSetAtHijri","continuationStipulation","reversionClauseCaptured",
       "reversionKind","reversionRecordedAt","reversionRecordedAtHijri",
       "fiscalYearEnd","registrationDate","registrationDateHijri","directUtilization",
       "createdAt","updatedAt"
     ) VALUES (
       ${q(spec.id)}, ${q(waqifId)}, ${q(`FAKE-CERT-${spec.id}`)}, ${q(`FAKE-DEED-${spec.id}`)},
       ${q(classification)}::"WaqfClassification", ${q(type)}::"WaqfType", 'AYNI'::"WaqfNature",
       ${q(order)}::"EntitlementOrder", ${q(shart)}::jsonb, 1, '2026-01-01'::timestamp,
       '1447-07-12',
       ${continuation === null ? 'NULL' : `${q(continuation)}::"ContinuationStipulation"`},
       false,
       NULL, NULL, NULL,
       '12-31', '2026-01-01'::timestamp, '1447-07-12',
       ${spec.directUtilization === null ? 'NULL' : String(spec.directUtilization ?? false)},
       now(), now()
     )`,
  );

  // ⊕ S12-3 · the three gates (BR-1101). Born CLEARED by default, in gate order (the order trigger
  // is live on the owner too, so Gate 01 is inserted first); OPEN for the V-11 subject.
  const cleared = (spec.gates ?? 'cleared') === 'cleared';
  const gates = [
    'GATE_01_AUTHORITY_LEGAL',
    'GATE_02_SYSTEMS_CONTROLS',
    'GATE_03_PEOPLE_PROPERTY_CADENCE',
  ];
  for (const [index, gate] of gates.entries()) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "onboarding_gate"
         ("id","waqfId","gate","status","clearedAt","clearedAtHijri","clearedBy","evidence","createdAt","updatedAt")
       VALUES (${q(`gate-${spec.id}-${String(index + 1)}`)}, ${q(spec.id)}, ${q(gate)}::"OnboardingGateKind",
               ${cleared ? `'CLEARED'` : `'OPEN'`}::"OnboardingGateStatus",
               ${cleared ? `'2026-01-01'::timestamp` : 'NULL'}, ${cleared ? `'1447-07-12'` : 'NULL'},
               ${cleared ? q(API_TEST_GRANTOR_ID) : 'NULL'}, ${cleared ? `'{"harness":true}'::jsonb` : 'NULL'},
               now(), now())`,
    );
  }
}

/**
 * Removes endowments this package created, with `waqf_no_delete` explicitly and visibly off.
 *
 * ⚠ THE GUARD IS SUSPENDED ON PURPOSE, AND ONLY HERE. `00000000000004_e2_guard_gaps` refuses
 * `DELETE` on `waqf` outright because DELETE + re-INSERT of the same id was how the founder's
 * conditions were substituted with no audit event (register item #2). The exemption is written the
 * way this harness already writes the `waqf_access_grant` / `approval_request` / `setting` ones: a
 * single `DO` block, so one block = one statement = one transaction, and a raise rolls the DISABLE
 * back with it — the guard can never be left off for the next suite, and `@qmulate/database`'s
 * `assertGuardsInstalled()` fails loudly if it ever is.
 *
 * The children go first, and all FOUR are scoped to the TEST endowment rather than to a user prefix,
 * so a crashed run whose grants were issued under some other id still cannot block the delete. Nothing
 * seeded can reference these ids: the FK direction is child -> waqf and the prefix is test-only.
 *
 * ⚠ `trusteeship_deed` IS ONE OF THOSE CHILDREN SINCE AV5-02, AND ITS DELETE GUARD IS SUSPENDED THE
 * SAME WAY. A test that records an appointment on an endowment it owns (which is the ONLY way to reach
 * `deed.upsert`'s create branch — all five fixture endowments already have a deed) leaves a row that
 * `trusteeship_deed_no_delete` refuses to remove, and the FK then refuses the endowment's own delete.
 * That is a once-per-database landmine of exactly the AV4-B2 shape: the NEXT run's
 * `provisionIntakeEndowment` would fail in `beforeAll`. The suspension is bounded to the same
 * `DO`-block transaction as the others and to the test prefix, and the guard is re-`ENABLE ALWAYS`d
 * before the block ends — a raise anywhere rolls the whole thing back, guard included.
 *
 * `audit_event` rows naming the endowment are deliberately LEFT ALONE — the table is append-only,
 * `DELETE` on it raises 42501 unconditionally (gate G-1), and there is no FK from it to `waqf`. An
 * append-only trail you can tidy up is not append-only.
 */
export async function deleteProvisionedEndowments(ids?: readonly string[]): Promise<void> {
  if (ids !== undefined && ids.length === 0) return;
  const prisma = await privilegedPrisma();
  // Inlined rather than parameterised: a `$1` inside a `DO` block body is not a bind slot. Every id
  // is checked against the test prefix before it can get here.
  const predicate =
    ids === undefined
      ? `LIKE '${API_TEST_WAQF_PREFIX}%'`
      : `IN (${ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ')})`;

  await prisma.$executeRawUnsafe(
    [
      'DO $qm_api_waqf_purge$',
      'BEGIN',
      '  ALTER TABLE "waqf_access_grant" DISABLE TRIGGER waqf_access_grant_no_delete;',
      '  ALTER TABLE "approval_request" DISABLE TRIGGER approval_request_no_delete;',
      '  ALTER TABLE "trusteeship_deed" DISABLE TRIGGER trusteeship_deed_no_delete;',
      '  ALTER TABLE "beneficiary" DISABLE TRIGGER beneficiary_no_delete;',
      // ⊕ S8-Q4. `reclassification_event` is a child of `waqf` (FK RESTRICT) and its DELETE guard
      // is migration 6's `reclassification_event_no_delete`. Until Q4's liveness test, no api test
      // reclassified a PROVISIONED endowment, so the purge never met the FK; the first appended
      // event on a test-prefixed waqf would have refused the endowment's own delete — the AV4-B2
      // once-per-database landmine, one table over, AGAIN (see the `beneficiary` note below).
      // Suspended the same bounded way: one DO block, one transaction, re-armed before it ends,
      // scoped to the TEST endowments. Seeded endowments' history is untouchable through this —
      // the predicate is the test prefix or an explicit prefix-checked id list.
      '  ALTER TABLE "reclassification_event" DISABLE TRIGGER reclassification_event_no_delete;',
      // ⊕ S8-Q6, the SAME landmine a third time in one stage: `government_filing` is a child of
      // `waqf` (FK RESTRICT) with its own migration-6 DELETE guard, and until Q6's suite no api
      // test ever wrote a filing row on a provisioned endowment. First run green, second run's
      // beforeAll dead on 23503 — measured, not theorised. Same bounded suspension as the others.
      '  ALTER TABLE "government_filing" DISABLE TRIGGER government_filing_no_delete;',
      // ⊕ E7-completion, the SAME landmine pre-empted rather than measured this time:
      // `compliance_task`, `transaction` and `bank_account` are all `waqf` children (FK RESTRICT)
      // with their own DELETE guards, and the instantiation suite is the first api test to write
      // rows of all three on PROVISIONED endowments (engine tasks; a raw dedicated account + one
      // INCOME receipt for A6's has_income contrast). Without these, the first instantiation on a
      // test-prefixed endowment would make the NEXT run's provisionIntakeEndowment die in
      // beforeAll on 23503 — the AV4-B2 once-per-database shape, tables four through six. Same
      // bounded suspension: one DO block, one transaction, re-armed before it ends, scoped to the
      // TEST endowments (fixture endowments are unreachable through the predicate).
      // ⊕ S10-1. §09 Engine B's five tables, all `waqf` children with FK RESTRICT and all
      // carrying their own DELETE guards — `lease` from migration 6, `deadline` and
      // `legal_case` from migration 8, `material_change` from 40, `escalation_event` from 41.
      // The AV4-B2 once-per-database landmine again, tables seven through eleven: until S10 no
      // api test wrote a deadline on a PROVISIONED endowment, so the purge never met these FKs
      // and the first one written would kill the NEXT run's provisioning in beforeAll on 23503.
      // Pre-empted rather than measured, which is the cheaper end of that lesson.
      '  ALTER TABLE "escalation_event" DISABLE TRIGGER escalation_event_no_delete;',
      '  ALTER TABLE "deadline" DISABLE TRIGGER deadline_no_delete;',
      '  ALTER TABLE "material_change" DISABLE TRIGGER material_change_no_delete;',
      '  ALTER TABLE "legal_case" DISABLE TRIGGER legal_case_no_delete;',
      '  ALTER TABLE "lease" DISABLE TRIGGER lease_no_delete;',
      '  ALTER TABLE "compliance_task" DISABLE TRIGGER compliance_task_no_delete;',
      '  ALTER TABLE "transaction" DISABLE TRIGGER transaction_no_delete;',
      '  ALTER TABLE "bank_account" DISABLE TRIGGER bank_account_no_delete;',
      '  ALTER TABLE "waqf" DISABLE TRIGGER waqf_no_delete;',
      // ⊕ S12-3 · the gate rows are a child of `waqf` (FK RESTRICT) with their own DELETE guard.
      '  ALTER TABLE "onboarding_gate" DISABLE TRIGGER onboarding_gate_no_delete;',
      `  DELETE FROM "onboarding_gate" WHERE "waqfId" ${predicate};`,
      `  DELETE FROM "waqf_access_grant" WHERE "waqfId" ${predicate};`,
      `  DELETE FROM "notification" WHERE "waqfId" ${predicate};`,
      `  DELETE FROM "approval_request" WHERE "waqfId" ${predicate};`,
      // ⚠ `beneficiary` IS ONE OF THOSE CHILDREN SINCE S5/E4, AND ITS DELETE GUARD IS SUSPENDED THE
      // SAME BOUNDED WAY AS THE OTHERS. `e4-registry.integration.test.ts` exercises the write
      // surface (`beneficiary.enrol` and friends) against an endowment this package provisions, so
      // rows accumulate on test-prefixed endowments and `beneficiary_no_delete` (migration 6) plus
      // the FK `beneficiary.waqfId -> waqf.id` (RESTRICT) would otherwise refuse the endowment's own
      // delete — the AV4-B2 once-per-database landmine, again, one table over. The delete is a
      // LEAF-FIRST LOOP because the lineage edge is a SELF-FK (`[waqfId, parentId] -> [waqfId, id]`,
      // ON DELETE RESTRICT): a parent deleted before its children raises 23503 even inside one
      // statement, so each pass removes only rows no other test row names as parent, until none are
      // left. Scoped to the TEST endowments, never to a user prefix, same as the other three.
      // `audit_event` rows naming these beneficiaries are LEFT ALONE — append-only, no FK, exactly
      // the precedent the endowment purge below already set.
      '  LOOP',
      `    DELETE FROM "beneficiary" AS b WHERE b."waqfId" ${predicate}`,
      '      AND NOT EXISTS (SELECT 1 FROM "beneficiary" AS c',
      '                       WHERE c."waqfId" = b."waqfId" AND c."parentId" = b."id");',
      '    EXIT WHEN NOT FOUND;',
      '  END LOOP;',
      `  DELETE FROM "trusteeship_deed" WHERE "waqfId" ${predicate};`,
      `  DELETE FROM "reclassification_event" WHERE "waqfId" ${predicate};`,
      `  DELETE FROM "government_filing" WHERE "waqfId" ${predicate};`,
      // ⊕ S10-1, in FK order. `escalation_event` and `material_change` name a compliance task
      // by PLAIN COLUMN (no FK), so only the `waqf` edge constrains them.
      `  DELETE FROM "escalation_event" WHERE "waqfId" ${predicate};`,
      // ⚠ `deadline` IS SELF-REFERENTIAL (§09's recompute chain: `recomputedFromId`, UNIQUE) and
      // a FLAT DELETE IS NEVERTHELESS CORRECT — which is the opposite of `beneficiary` above, so
      // the difference is worth stating rather than leaving the next reader to copy the loop.
      //
      // The two self-FKs differ in their DELETE ACTION, not in their shape:
      //   · `beneficiary_waqfId_parentId_fkey` is `ON DELETE RESTRICT` (migration 12) — RESTRICT
      //     is checked IMMEDIATELY, per row, so a parent removed before its child raises 23503
      //     even inside one statement. Hence the loop there.
      //   · `deadline_recomputedFromId_fkey` (migration 38) carries NO `ON DELETE` clause, so it
      //     is NO ACTION — checked at the END OF THE STATEMENT. One DELETE that removes the whole
      //     chain leaves nothing dangling by the time the check runs, and succeeds.
      //
      // This was MEASURED, not reasoned: the first version of this block used a leaf-first loop
      // copied from `beneficiary`, and the mutation that replaced it with the flat DELETE below
      // SURVIVED against a planted two-link recompute chain. A surviving mutation is a claim
      // about the test; this one was a true claim about the code — the loop was never needed,
      // and the comment justifying it was wrong.
      `  DELETE FROM "deadline" WHERE "waqfId" ${predicate};`,
      `  DELETE FROM "material_change" WHERE "waqfId" ${predicate};`,
      `  DELETE FROM "legal_case" WHERE "waqfId" ${predicate};`,
      // ⚠ DECLARED INCOMPLETE, and deliberately not papered over: `lease` also names `asset`
      // (FK RESTRICT), and `asset` is NOT in this purge at all. So removing leases is correct
      // and necessary but not SUFFICIENT — a provisioned endowment carrying an asset still
      // cannot be purged, and the asset chain (`expropriation`, `maintenance_ticket`, `asset`)
      // is owed to the first stage that provisions one. Listed here so that stage does not have
      // to rediscover `lease`.
      `  DELETE FROM "lease" WHERE "waqfId" ${predicate};`,
      // Children before their own children: `transaction` names `bank_account` (FK RESTRICT).
      `  DELETE FROM "compliance_task" WHERE "waqfId" ${predicate};`,
      `  DELETE FROM "transaction" WHERE "waqfId" ${predicate};`,
      `  DELETE FROM "bank_account" WHERE "waqfId" ${predicate};`,
      `  DELETE FROM "waqf" WHERE "id" ${predicate};`,
      '  ALTER TABLE "bank_account" ENABLE ALWAYS TRIGGER bank_account_no_delete;',
      '  ALTER TABLE "transaction" ENABLE ALWAYS TRIGGER transaction_no_delete;',
      '  ALTER TABLE "compliance_task" ENABLE ALWAYS TRIGGER compliance_task_no_delete;',
      '  ALTER TABLE "lease" ENABLE ALWAYS TRIGGER lease_no_delete;',
      '  ALTER TABLE "legal_case" ENABLE ALWAYS TRIGGER legal_case_no_delete;',
      '  ALTER TABLE "material_change" ENABLE ALWAYS TRIGGER material_change_no_delete;',
      '  ALTER TABLE "deadline" ENABLE ALWAYS TRIGGER deadline_no_delete;',
      '  ALTER TABLE "escalation_event" ENABLE ALWAYS TRIGGER escalation_event_no_delete;',
      '  ALTER TABLE "government_filing" ENABLE ALWAYS TRIGGER government_filing_no_delete;',
      '  ALTER TABLE "reclassification_event" ENABLE ALWAYS TRIGGER reclassification_event_no_delete;',
      '  ALTER TABLE "waqf" ENABLE ALWAYS TRIGGER waqf_no_delete;',
      '  ALTER TABLE "onboarding_gate" ENABLE ALWAYS TRIGGER onboarding_gate_no_delete;',
      '  ALTER TABLE "beneficiary" ENABLE ALWAYS TRIGGER beneficiary_no_delete;',
      '  ALTER TABLE "trusteeship_deed" ENABLE ALWAYS TRIGGER trusteeship_deed_no_delete;',
      '  ALTER TABLE "approval_request" ENABLE ALWAYS TRIGGER approval_request_no_delete;',
      '  ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_no_delete;',
      'END',
      '$qm_api_waqf_purge$;',
    ].join('\n'),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The step-up window: READ from the seed, never written by this package
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ WHAT USED TO BE HERE, AND WHY IT IS GONE.
 *
 * This file exported `upsertGlobalSetting` + `settingEnvelope` + `API_TEST_SETTING_KEYS`, and every
 * suite that needed an approval to SUCCEED wrote the `auth.totpStepUp.freshnessSeconds` row itself
 * in `beforeAll` and deleted it again in cleanup. The key was in no registry and in no seed, so on
 * any shipped database every approve and every sign denied with `SETTING_MISSING` — D-6's correct
 * fail-closed direction, which is exactly why nothing caught it. The suite provisioned the
 * precondition it was proving, and the Nazir could approve nothing in production.
 *
 * The key is now registered (`@qmulate/domain`'s `SETTING_SCHEMAS`) and seeded
 * (`packages/database/src/seed/settings.ts`), so the tests READ it. If the seed row ever goes away,
 * the approve suites go red — which is the whole point.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** A global `Setting` row as stored, or `null`. Raw SQL: no extension, no soft-delete filter. */
export async function readGlobalSettingRow(
  key: string,
): Promise<{ id: string; value: unknown; deletedAt: Date | null } | null> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<
    { id: string; value: unknown; deletedAt: Date | null }[]
  >(`SELECT "id", "value", "deletedAt" FROM "setting" WHERE "key" = $1 AND "waqfId" IS NULL`, key);
  return rows[0] ?? null;
}

/**
 * The SEEDED value of a global figure, or a loud failure.
 *
 * Deliberately not "read it, and write it if absent": a helper that repairs the precondition is how
 * the missing seed row stayed invisible for a whole sprint. Absent ⇒ throw, and the message says
 * where the row is supposed to come from.
 */
export async function requireSeededGlobalSetting(key: string): Promise<{
  readonly v: unknown;
  readonly unit: string | null;
  readonly unverified: boolean;
}> {
  const row = await readGlobalSettingRow(key);
  if (row === null || row.deletedAt !== null) {
    throw new Error(
      `Setting "${key}" is not present (or is soft-deleted) on this database. It is seeded by ` +
        `packages/database/src/seed/settings.ts — run \`pnpm run db:seed\`. This helper refuses to ` +
        `write it: a test package that provisions its own precondition proves nothing about the ` +
        `shipped configuration, which is how every approve/sign came to deny in production while ` +
        `CI stayed green.`,
    );
  }
  return row.value as { v: unknown; unit: string | null; unverified: boolean };
}

/**
 * Runs `body` with a global `Setting` row made INVISIBLE to every reader, then restores it.
 *
 * Soft-deletes rather than deletes: `readStepUpWindowSeconds` and the resolver both filter
 * `deletedAt: null`, so the row is absent as far as the code under test is concerned, while the
 * sibling `seed.integration` suite's absolute row count (`Setting: 16`) still holds even if this
 * process is killed mid-test.
 */
export async function withGlobalSettingHidden<T>(key: string, body: () => Promise<T>): Promise<T> {
  const prisma = await basePrisma();
  const row = await readGlobalSettingRow(key);
  if (row === null) {
    throw new Error(`cannot hide Setting "${key}": no global row exists to hide`);
  }
  await prisma.$executeRawUnsafe(
    `UPDATE "setting" SET "deletedAt" = now() WHERE "id" = $1`,
    row.id,
  );
  try {
    return await body();
  } finally {
    await prisma.$executeRawUnsafe(
      `UPDATE "setting" SET "deletedAt" = NULL WHERE "id" = $1`,
      row.id,
    );
  }
}

/**
 * Hard-deletes `setting` rows this package CREATED, with the migration-8 guard explicitly off.
 *
 * ⚠ THE GUARD IS TURNED OFF ON PURPOSE, AND VISIBLY. `00000000000008_e2_retention_remainder` refuses
 * `DELETE` on `setting` outright: the table holds EVERY regulatory figure in the system — the
 * classification bands, the 30/15/10-business-day windows, the 3-month post-FYE distribution window,
 * the >= 10-year retention period and both 10% fees — all of them ⚠ unverified against primary Saudi
 * law (Binding rule 3), which is exactly why they are configuration rather than constants. Measured
 * before that migration: a raw `DELETE FROM "setting"` erased a row with `audit_event` unmoved at 131,
 * and deleting a per-waqf OVERRIDE makes the resolver fall back to the global value with no error and
 * no event — a silent change to a fee basis for one endowment.
 *
 * A test suite that can only pass by leaving a production guard off is not a passing suite, so the
 * exemption lives here, in one named helper, rather than being spread across the files that need it.
 * The `DO` block is atomic: one block = one statement = one transaction, so if the DELETE raises, the
 * `DISABLE` rolls back with it and the guard is never left off — `@qmulate/database`'s
 * `assertGuardsInstalled()` fails the next suite loudly if it ever is.
 *
 * ONLY for rows this package created. A SEEDED row must never be passed here: `seed.integration`
 * asserts an absolute `Setting` count, and the resolver fails closed on an absent global figure, so
 * removing one would silently re-arm the deny for every later test in the run.
 */
export async function purgeCreatedSettingRows(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  // Scaffolding: it suspends `setting_no_delete` and hard-deletes, both of which need ownership.
  const prisma = await privilegedPrisma();
  // Inlined rather than parameterised: a `$1` inside a `DO` block body is not a bind slot.
  const list = ids.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
  await prisma.$executeRawUnsafe(
    [
      'DO $qm_purge_setting$',
      'BEGIN',
      '  ALTER TABLE "setting" DISABLE TRIGGER setting_no_delete;',
      `  DELETE FROM "setting" WHERE "id" IN (${list});`,
      '  ALTER TABLE "setting" ENABLE ALWAYS TRIGGER setting_no_delete;',
      'END',
      '$qm_purge_setting$;',
    ].join('\n'),
  );
}

/**
 * Hard-deletes every row this package created. Raw SQL: no trigger, no audit, no residue.
 *
 * `audit_event` rows are deliberately LEFT ALONE — the table is append-only and a DELETE on it raises
 * SQLSTATE 42501 unconditionally, which is gate G-1 and must stay true. Test-created events therefore
 * accumulate in a throwaway database, which is correct: an append-only trail you can tidy up is not
 * append-only.
 */
export async function cleanupApiTestRows(): Promise<void> {
  // Scaffolding on the OWNER connection: it suspends two DELETE guards and hard-deletes rows the
  // runtime role has no DELETE privilege on at all since ADR-0008 round 6.
  const prisma = await privilegedPrisma();
  // ORDER MATTERS: `membership` and `waqf_access_grant` both carry a `userId` FK to `user`, so the
  // user rows cannot go first. Learned by a failing DELETE rather than assumed.
  //
  // ⚠ THE AUTHORIZATION-PLANE DELETES NEED THEIR GUARDS TURNED OFF, EXPLICITLY.
  // `00000000000005_e2_grant_admission` refuses `DELETE` on a `waqf_access_grant` or an
  // `approval_request` **that the audit trail records** — such a row is evidence and carries a
  // >= 10-year retention obligation (NFR-07 / BR-702), and `DELETE` + re-`INSERT` of the same id is
  // how a seat's write-once role was defeated (C-09), while erasing a REJECTED approval erases the
  // refusal itself (C-13). Every row this package provisions goes through the AUDITED path, so
  // every one of them is in the trail and is refused.
  //
  // The `DO` block makes the exemption visible and atomic: one block = one statement = one
  // transaction, so if any statement raises, the `DISABLE` rolls back with it and the guards are
  // never left off (`@qmulate/database`'s `assertGuardsInstalled()` fails loudly if they are).
  // `ALTER TABLE … DISABLE TRIGGER` needs table OWNERSHIP — which is also the residual the migration
  // header documents and ADR-0008 defers to E12: on Railway the runtime IS the owner.
  await prisma.$executeRawUnsafe(
    [
      'DO $qm_api_purge$',
      'BEGIN',
      '  ALTER TABLE "waqf_access_grant" DISABLE TRIGGER waqf_access_grant_no_delete;',
      '  ALTER TABLE "approval_request" DISABLE TRIGGER approval_request_no_delete;',
      `  DELETE FROM "waqf_access_grant" WHERE "userId" LIKE '${API_TEST_PREFIX}%';`,
      `  DELETE FROM "approval_request" WHERE "makerId" LIKE '${API_TEST_PREFIX}%' OR "checkerId" LIKE '${API_TEST_PREFIX}%';`,
      '  ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_no_delete;',
      '  ALTER TABLE "approval_request" ENABLE ALWAYS TRIGGER approval_request_no_delete;',
      'END',
      '$qm_api_purge$;',
    ].join('\n'),
  );
  // ⚠ THE BOOKED LEDGER ROWS, AND THIS IS RULE 5 AGAIN — MEASURED, NOT ANTICIPATED.
  // `bookIncome()` records real receipts through `finance.recordRevenue`, and nothing here used to
  // remove them. MEASURED on one cluster after the api suite ran: `@qmulate/database`'s suite went
  // **7 tests red across 4 files** — `seed.integration.test.ts`'s ABSOLUTE row counts,
  // `corpus-guard`'s *"the three seeded rent receipts"* (it saw 15), `e3-deed-term-guards`'
  // transaction count (20, expected 8), and the seed's receipt-classification list. Every one of
  // those suites did nothing wrong, and every message read like a fixture defect. That is exactly
  // the once-per-database landmine rule 5 forbids, and the cause was a teardown that did not
  // remove what a helper created.
  //
  // Scoped to `createdBy = API_TEST_INCOME_BOOKER` — the dedicated booking seat — so it can never
  // reach a fixture row. `transaction_no_delete` (migration 6) refuses a hard DELETE outright, so
  // the guard is suspended and restored inside ONE atomic `DO` block.
  await prisma.$executeRawUnsafe(
    [
      'DO $qm_api_ledger_purge$',
      'BEGIN',
      '  ALTER TABLE "transaction" DISABLE TRIGGER transaction_no_delete;',
      `  DELETE FROM "transaction" WHERE "createdBy" = '${API_TEST_INCOME_BOOKER}';`,
      '  ALTER TABLE "transaction" ENABLE ALWAYS TRIGGER transaction_no_delete;',
      'END',
      '$qm_api_ledger_purge$;',
    ].join('\n'),
  );

  await prisma.$executeRawUnsafe(
    `DELETE FROM "membership" WHERE "userId" LIKE '${API_TEST_PREFIX}%'`,
  );
  // ⊕ S12-2: RACI routing writes `notification` rows to test seats (board / counsel / nazir) when a
  // reserved matter is raised or its chain completes. They reference the user and must go first.
  await prisma.$executeRawUnsafe(
    `DELETE FROM "notification" WHERE "userId" LIKE '${API_TEST_PREFIX}%'`,
  );
  await prisma.$executeRawUnsafe(`DELETE FROM "user" WHERE "id" LIKE '${API_TEST_PREFIX}%'`);

  // ⚠ LAST, AND UNCONDITIONALLY — rule 5 in the header. Any endowment this package provisioned
  // ({@link provisionIntakeEndowment}) goes away here, so no file can forget it and so the ABSOLUTE
  // `Waqf: 5` count `@qmulate/database`'s `seed.integration.test.ts` asserts still holds on the
  // NEXT run against the same database. It is a no-op for the files that provision none, which is
  // most of them — the cost of that no-op is one statement, and the cost of omitting it is a suite
  // that is green exactly once.
  await deleteProvisionedEndowments();

  // ⚠ NO `Setting` ROW IS DELETED HERE ANY MORE, AND THAT IS THE FIX, NOT AN OMISSION.
  //
  // This package used to write `auth.totpStepUp.freshnessSeconds` in `beforeAll` and delete it
  // here — a sixteenth row that turned `seed.integration`'s absolute count (`Setting: 15`) red
  // whenever the two suites overlapped, and, far worse, meant the positive approve path was only
  // ever proven against a row the test itself had written. The key is now registered and SEEDED, so
  // this package reads it and must never remove it: deleting a seeded row here would break the
  // sibling suite in the other direction, and would silently re-arm the fail-closed deny for every
  // later test in the run.
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Building a request context for a chosen subject
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface TestSessionOptions {
  /** `null` builds an UNAUTHENTICATED context. */
  readonly userId: string | null;
  /** Defaults to `'authorized'`; pass `'totp-enrolment-required'` to drive the enrolment gate. */
  readonly status?: 'authorized' | 'totp-enrolment-required';
  /**
   * The TOTP assertion instant. Defaults to `now` (fresh). Pass `null` to prove the fail-closed
   * refusal, or an old `Date` to prove the window is honoured.
   */
  readonly totpAssertedAt?: Date | null;
  readonly now?: Date;
  readonly requestId?: string;
  readonly locale?: string;
}

/**
 * Builds a real {@link ApiContextShape.TrpcContext} for a chosen subject: real grant resolution
 * against the real database, a real `createPrismaClient` with the caller's grants baked in, and a real
 * `SettingReader`.
 *
 * What is synthesized is ONLY the better-auth session, because minting a signed better-auth cookie in
 * a unit-test process would test better-auth rather than the ladder. Everything the ladder actually
 * decides on — grants, permissions, AML membership, the step-up window — comes from the database.
 */
export async function contextFor(options: TestSessionOptions) {
  const { createContextForSession } = await apiContextModule();
  const now = options.now ?? new Date();

  const session =
    options.userId === null
      ? null
      : {
          status: options.status ?? ('authorized' as const),
          userId: options.userId,
          email: `${options.userId}@example.test`,
          twoFactorEnabled: true,
          totpAssertedAt: options.totpAssertedAt === undefined ? now : options.totpAssertedAt,
          freshUntil: null,
        };

  return createContextForSession(session as never, {
    now,
    ...(options.requestId !== undefined ? { requestId: options.requestId } : {}),
    ...(options.locale !== undefined ? { locale: options.locale } : {}),
  });
}

/** Counts `audit_event` rows matching an action/category/entity, for the denial assertions. */
export async function countAuditEvents(where: {
  action: string;
  category?: string;
  entityId?: string;
  waqfId?: string | null;
  actorId?: string;
}): Promise<number> {
  const prisma = await basePrisma();
  const clauses: string[] = [`"action" = '${where.action}'`];
  if (where.category !== undefined) clauses.push(`"category" = '${where.category}'`);
  if (where.entityId !== undefined) clauses.push(`"entityId" = '${where.entityId}'`);
  if (where.actorId !== undefined) clauses.push(`"actorId" = '${where.actorId}'`);
  if (where.waqfId !== undefined) {
    clauses.push(where.waqfId === null ? `"waqfId" IS NULL` : `"waqfId" = '${where.waqfId}'`);
  }
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "audit_event" WHERE ${clauses.join(' AND ')}`,
  );
  return Number(rows[0]?.n ?? 0);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * PAID PERIODS — the disjoint-window allocator  (AV7-F2, migration 26)
 *
 * ── WHY THIS EXISTS, AND IT IS NOT A CONVENIENCE ────────────────────────────────────────────
 * `distribution_paid_periods_disjoint` (migration 26) refuses two `EXECUTED` runs whose
 * `[periodStart, periodEnd + 1 day)` intervals OVERLAP on one endowment. That closes AV7-F2 —
 * SAR 820,000.00 recorded as owed against SAR 410,000.00 of ghallah from one receipt.
 *
 * ⚠ AND INSTALLING IT TURNED 25 OF 620 TESTS IN THIS PACKAGE RED, EVERY ONE A TRUE POSITIVE.
 * MEASURED, before any of them was touched:
 *     av7-approval-identity 7 · distribution-run 11 · distribution-maker-checker 3 ·
 *     av7-lifecycle-trail 3 · av7-corpus-wall 1 (A-10, which IS the attack)
 * The reason is one shared habit. `waqf-001` has exactly ONE income receipt in the whole fixture
 * (`rev-001`, SAR 350,000.00, 2026-03-31) and the seeded historical run `dist-001` has ALREADY
 * PAID the quarter containing it (2026-01-01…2026-03-31, `EXECUTED`, `createdBy`
 * `user-seed-admin`, so no suite's cleanup removes it). So every suite needing a nonzero pool
 * pinned `periodEnd` to `2026-03-31` and varied only the START DAY — `2026-01-02`, `2026-01-05`,
 * `2026-01-15`, `2026-02-xx` — which kept `rev-001` inside the window and produced a distinct
 * triple that `distribution_one_live_run_per_period` could not see.
 *
 * ⚠ SAID PLAINLY, BECAUSE IT IS THE FINDING AND NOT AN INCONVENIENCE: **THE TEST SUITE WAS
 * EXERCISING AV7-F2, AT SCALE, ON EVERY RUN.** Those windows all overlap each other and all
 * overlap `dist-001`. One receipt was being paid by run after run, and the tests asserting the
 * lifecycle "worked" were the same shape as the attack that A-10 wrote down as a breach.
 *
 * ── WHAT THIS ALLOCATOR GUARANTEES, MECHANICALLY RATHER THAN BY DISCIPLINE ──────────────────
 * A suite asks for a period by (suite key, ordinal). It gets a WHOLE CALENDAR MONTH inside the
 * year this registry assigns to that suite. Disjointness is then structural, in three layers:
 *   · two ordinals in one suite      → different months of one year → disjoint;
 *   · two suites                     → different YEARS              → disjoint;
 *   · every allocated year           → far from the fixture's own 2026–2028 ledger and from
 *                                      `dist-001`'s paid quarter    → disjoint from the seed.
 * Nothing depends on an author remembering to pick an unused window, which is exactly what
 * failed the first time. The keys are a closed union, so an undeclared suite is a TYPE ERROR
 * rather than a silent collision, and `paid-period-allocator.test.ts` asserts the years are
 * distinct and that every window this allocator can produce is pairwise disjoint.
 *
 * ⚠ AN ALLOCATED WINDOW IS EMPTY OF LEDGER ROWS BY CONSTRUCTION. That is the point — it cannot
 * inherit `rev-001` — so a suite that needs a pool must BOOK ONE: see {@link bookIncome}.
 *
 * ⚠ DO NOT "SAVE A YEAR" BY SHARING ONE BETWEEN TWO FILES. The suites share ONE database and
 * `@qmulate/api`'s files run serially, but several purge distributions with
 * `createdBy LIKE 'user-test-api-%'` — i.e. each other's — so a shared year would pass or fail
 * depending on FILE ORDER. A year per file costs nothing; there are 9999 of them.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠⚠ THE BAND EVERY ALLOCATED WINDOW MUST LIE IN, AND IT IS NOT AN AESTHETIC CHOICE.
 *
 * The FIRST version of this allocator handed out months in 2031-2035 — clear of every hard-coded
 * date in the repo, which seemed like the whole problem. It made the engine REFUSE outright:
 *
 *     TRPCError CALENDAR_UNAVAILABLE: business-day query 2034-12-31 is outside the calendar's
 *     coverage 2026-02-22 … 2028-09-23. Beyond the seeded holidays any answer would be a guess.
 *     Refusing to compute rather than treating every day as a business day.
 *
 * That refusal is the product working exactly as designed, and it constrains this file. TRACED
 * rather than guessed: `runDeadline()` in `src/routers/distribution.ts` builds its anchor as
 * `<periodEnd's YEAR>-<fiscalYearEnd MM-DD>` and then adds the 3-month post-FYE window, rolling
 * to a FOLLOWING BUSINESS DAY. So a period in year Y makes the engine ask the holiday calendar
 * about `Y-12-31` **and** about `(Y+1)-03-31`. MEASURED coverage of the seeded calendar:
 * `min = 2026-02-22`, `max = 2028-09-23`, 33 rows. Therefore:
 *
 *     Y = 2026 → asks 2026-12-31 and 2027-03-31   ✓ both covered
 *     Y = 2027 → asks 2027-12-31 and 2028-03-31   ✓ both covered
 *     Y = 2028 → asks 2028-12-31                  ✗ OUTSIDE — every run in 2028 refuses
 *
 * **So a paid window is only computable in 2026 or 2027.** The lower bound is `dist-001`: it has
 * already paid `2026-01-01 … 2026-03-31`, and 2026-04 holds `exp-e-002`. Widening the band means
 * extending the seeded holiday calendar — a fixture change with its own count assertions — not
 * editing this constant.
 */
export const PAID_PERIOD_BAND = { from: '2026-05-01', to: '2027-12-31' } as const;

/**
 * The months each suite owns. **Each month yields TWO half-month windows**, so a suite's capacity
 * is `months.length * 2` and `paidPeriod(suite, ordinal)` walks them in order.
 *
 * ⚠ HALF-MONTHS RATHER THAN MONTHS BECAUSE THE BAND IS ONLY 20 MONTHS WIDE (above) and the five
 * suites drive more paid runs than that between them. Halves are still disjoint by construction —
 * `01…15` and `16…end` cannot overlap — so nothing about the guarantee weakens.
 *
 * ⚠ 2027-03, 2027-08 and 2027-09 ARE DELIBERATELY ABSENT: `av7-corpus-wall` hard-codes receipts
 * and windows in those months (A-6, A-10, A-11), and a window that captured one of its receipts
 * would change a pool some other file asserts. `paid-period-allocator.test.ts` re-derives that
 * exclusion from the test sources as TEXT, so this comment cannot rot into a false claim.
 */
const SUITE_MONTHS = {
  'distribution-run': ['2026-05', '2026-06'],
  'distribution-maker-checker': ['2026-07'],
  'av7-approval-identity': ['2026-08', '2027-11'],
  'av7-lifecycle-trail': ['2027-12'],
} as const satisfies Record<string, readonly string[]>;

/** Kept as the public name so a reader grepping for the registry finds the months, not a year. */
export const PAID_PERIOD_YEARS = SUITE_MONTHS;

export type PaidPeriodSuite = keyof typeof SUITE_MONTHS;

/** A civil-date period, in the shape `distribution.preview`/`create` take. */
export interface PaidPeriod {
  readonly periodStart: string;
  readonly periodEnd: string;
}

/** Last day of a Gregorian month. Day 0 of the NEXT month, which handles February and leap years. */
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Weekly slots per month. FOUR, not two, because the computable band (above) leaves only SIX free
 * months once `av7-corpus-wall`'s own 2026-09 … 2027-10 range is left alone, and the four suites
 * drive more paid runs than twelve between them. `01…07`, `08…14`, `15…21`, `22…end` cannot
 * overlap, so nothing about the guarantee weakens by cutting finer.
 */
const SLOTS_PER_MONTH = 4;

/** How many paid windows a suite may allocate. */
export function paidPeriodCapacity(suite: PaidPeriodSuite): number {
  return SUITE_MONTHS[suite].length * SLOTS_PER_MONTH;
}

/**
 * A half-month window, disjoint from every other period this allocator hands out.
 *
 * @param suite   the calling file's key — a closed union, so a new suite cannot silently borrow
 *                another's months.
 * @param ordinal 1-based, one per run the file drives to `EXECUTED`. Bounded by
 *                {@link paidPeriodCapacity}; asking for more THROWS rather than wrapping into a
 *                neighbour's window, because a silent wrap is the collision this exists to stop.
 */
export function paidPeriod(suite: PaidPeriodSuite, ordinal: number): PaidPeriod {
  const capacity = paidPeriodCapacity(suite);
  if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > capacity) {
    throw new Error(
      `paidPeriod("${suite}", ${ordinal}): the ordinal must be an integer in 1…${capacity} — ` +
        `${suite} owns ${SUITE_MONTHS[suite].length} month(s) and each yields ${SLOTS_PER_MONTH} ` +
        `weekly windows. Add a month to SUITE_MONTHS (inside PAID_PERIOD_BAND, and clear of the ` +
        `2026-09 … 2027-10 range av7-corpus-wall populates itself) rather than widening this ` +
        `bound: wrapping into a neighbour's window is exactly the AV7-F2 collision this ` +
        `allocator replaced.`,
    );
  }
  const month = SUITE_MONTHS[suite][Math.floor((ordinal - 1) / SLOTS_PER_MONTH)] as string;
  const slot = (ordinal - 1) % SLOTS_PER_MONTH;
  const [year, mm] = month.split('-').map(Number) as [number, number];
  const firstDay = slot * 7 + 1;
  // The LAST slot runs to the end of the month, so 29th/30th/31st are never left unreachable in a
  // window somebody might book a receipt into.
  const lastDay = slot === SLOTS_PER_MONTH - 1 ? lastDayOfMonth(year, mm) : firstDay + 6;
  return {
    periodStart: `${month}-${String(firstDay).padStart(2, '0')}`,
    periodEnd: `${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * A date safely INSIDE an allocated window, for booking the receipt it needs.
 *
 * `+1 day`, not `+2`: the smallest slot this allocator produces is seven days, so `start + 1` is
 * always strictly inside it, and `paid-period-allocator.test.ts` asserts that over EVERY window
 * the allocator can produce. A date one day outside is the failure that looks like "the engine
 * lost my receipt" — the run computes, finds an empty ledger and reports a zero pool.
 */
export function dateInsidePaidPeriod(period: PaidPeriod): string {
  const day = Number(period.periodStart.slice(-2)) + 1;
  return `${period.periodStart.slice(0, 8)}${String(day).padStart(2, '0')}T00:00:00.000Z`;
}

/**
 * The identity that books test income: its OWN subject, holding ONLY the finance verbs needed.
 *
 * ⚠ NOT one of the calling suite's makers. Those hold `distribution:*` and mostly do NOT hold
 * `finance:transaction:write`, and widening a run-maker's grant to book a receipt would quietly
 * weaken the very segregation several of those files exist to assert (AV7-A is about a maker
 * doing too much). A dedicated booking seat keeps the run identities exactly as narrow as the
 * tests claim they are.
 */
export const API_TEST_INCOME_BOOKER = `${API_TEST_PREFIX}income-booker`;

/** The booking seat's grant. Provisioned by {@link bookIncome} on first use. */
export function incomeBookerSubject(waqfIds: readonly string[]): TestSubjectSpec {
  return {
    id: API_TEST_INCOME_BOOKER,
    // `FINANCE` — one of ADR-0004's THIRTEEN. There is no `FINANCE_OFFICER`; a wrong value here
    // fails as a Prisma validation error inside the grant lookup, not as a permission denial.
    role: 'FINANCE',
    waqfIds,
    permissions: [
      'finance:transaction:read',
      'finance:transaction:write',
      'finance:bank_account:read',
    ],
  };
}

/**
 * Book ONE income receipt inside an allocated window, through the REAL procedure.
 *
 * ⚠ THROUGH `finance.recordRevenue`, NEVER RAW SQL. `transaction` carries five guards — the
 * corpus-class immutability, the correction shape, the dedicated-account rule, the endowment
 * pin, and (since migration 25) the row-retirement gate — plus the income/capital CHECK that
 * makes a class mandatory on every `REVENUE` row. A raw INSERT in a test would be a receipt no
 * production path could have produced, and every waterfall figure asserted downstream would be
 * a figure about a row the product cannot make.
 *
 * ── WHAT THE AMOUNT MEANS, MEASURED SO THE CONVERTED SUITES KEEP THEIR NUMBERS ──────────────
 * `waqf-001`'s waterfall is `revenue − maintenance − operating − nazirFee`. On that endowment
 * the maintenance reserve is a DEED-STIPULATED FLAT SAR 40,000.00 and the Nazir fee is 10% OF
 * REVENUE (`PERCENT_OF_REVENUE`) — measured from A-6's own output, where a window containing NO
 * expense row still reserved 40,000.00 against a 500,000.00 receipt and charged 50,000.00,
 * leaving 410,000.00. So:
 *     350,000.00 booked → reserve 40,000.00 · operating 0.00 · fee 35,000.00 → 275,000.00
 * which is EXACTLY what the seeded 2026-Q1 window produced from `rev-001`. A suite moved onto an
 * allocated window and booking {@link SEEDED_QUARTER_INCOME_SAR} therefore keeps every expected
 * figure it already asserted, and the diff stays a period change rather than a rewrite of the
 * numbers under test.
 *
 * ⚠ ONLY INCOME IS BOOKED, AND NOT A MAINTENANCE EXPENSE, WHICH IS COUNTER-INTUITIVE ENOUGH TO
 * STATE. `av7-lifecycle-trail`'s header proposed cloning `exp-e-001`'s SAR 40,000.00 as well.
 * TRACED: `resolveOperatingCost()` sums `OPERATIONS` expenses ONLY and merely emits an
 * `OPERATING_COST_EXPENSE_CATEGORY_EXCLUDED` NOTICE for anything else, so a cloned MAINTENANCE
 * expense would change no figure and would add a diagnostic some suites enumerate. The reserve
 * comes from the DEED, not from the ledger — measured in A-6, where a window containing no
 * expense row still reserved 40,000.00.
 */
export const SEEDED_QUARTER_INCOME_SAR = '350000.00';

/** `waqf-001`'s dedicated fixture bank account. Anti-commingling means a receipt needs one. */
export const FIXTURE_BANK_ACCOUNT_W1 = 'bankacct-fake-acct-w1';

let incomeBookerProvisionedFor: string | null = null;

export interface BookIncomeArgs {
  readonly waqfId: string;
  readonly bankAccountId?: string;
  /**
   * The ALLOCATED window this receipt is for. Passing the period rather than a date is what lets
   * this helper verify afterwards that the window holds nothing else — see the docstring.
   */
  readonly period: PaidPeriod;
  readonly amountSar?: string;
  /** Distinguishes this file's receipts in the ledger and in the audit trail. */
  readonly tag: string;
}

/**
 * Provisions the booking seat if needed, records one INCOME receipt, and returns its id.
 *
 * The caller is built here rather than taken as an argument so no suite can accidentally book on
 * an identity whose grant it is also asserting.
 */
export async function bookIncome(args: BookIncomeArgs): Promise<string> {
  if (incomeBookerProvisionedFor !== args.waqfId) {
    await provisionTestSubjects([incomeBookerSubject([args.waqfId])]);
    incomeBookerProvisionedFor = args.waqfId;
  }
  // ⚠ IMPORTED LAZILY, NOT AT MODULE SCOPE. This file is a Vitest `setupFile`, so a top-level
  // import of the router would pull the whole tRPC tree in before any test module — and before
  // the environment defaults above have been applied — which is the ordering this file exists
  // to control.
  const [{ appRouter }, { createCallerFactory }] = await Promise.all([
    import('../src/root.js'),
    import('../src/trpc.js'),
  ]);
  const ctx = await contextFor({
    userId: API_TEST_INCOME_BOOKER,
    requestId: `book-income-${args.tag}`,
  });
  const caller = createCallerFactory(appRouter)(ctx) as unknown as {
    finance: {
      recordRevenue: (input: unknown) => Promise<{ transactionId: string }>;
    };
  };
  const { toHijriSnapshot } = (await import('@qmulate/domain/dates')) as {
    toHijriSnapshot: (date: Date) => string;
  };
  const date = dateInsidePaidPeriod(args.period);

  // ── ⚠ IDEMPOTENT FOR ITS OWN ROWS — RULE 5 IN THIS FILE'S HEADER, LEARNED THE HARD WAY ─────
  // `cleanupApiTestRows()` does not delete `transaction` rows, so a receipt booked here SURVIVES the
  // suite. MEASURED: running `distribution-run.integration.test.ts` three times against one cluster
  // left three identical SAR 350,000.00 receipts in the same allocated window, and the check below
  // then refused the fourth — i.e. the helper was green exactly once per database, which is the
  // once-per-database landmine rule 5 exists to forbid, rebuilt inside the fix for AV7-F2.
  //
  // So this purges the BOOKING SEAT's OWN prior rows in this window first, and only its own:
  // `createdBy = API_TEST_INCOME_BOOKER` is the exact scope. A receipt any OTHER identity put here
  // is still a stranger and still throws below — self-healing about its own leftovers, strict about
  // everybody else's. The DELETE guard is suspended and restored inside ONE atomic `DO` block, so a
  // raise cannot leave it off.
  const owner = await privilegedPrisma();
  const windowFrom = `${args.period.periodStart} 00:00:00`;
  const windowToExclusiveDate = new Date(`${args.period.periodEnd}T00:00:00.000Z`);
  windowToExclusiveDate.setUTCDate(windowToExclusiveDate.getUTCDate() + 1);
  const windowTo = `${windowToExclusiveDate.toISOString().slice(0, 10)} 00:00:00`;
  await owner.$executeRawUnsafe(
    [
      'DO $qm_book_purge$',
      'BEGIN',
      '  ALTER TABLE "transaction" DISABLE TRIGGER transaction_no_delete;',
      `  DELETE FROM "transaction"`,
      `   WHERE "waqfId" = '${args.waqfId}'`,
      `     AND "createdBy" = '${API_TEST_INCOME_BOOKER}'`,
      `     AND "date" >= '${windowFrom}'::timestamp AND "date" < '${windowTo}'::timestamp;`,
      '  ALTER TABLE "transaction" ENABLE ALWAYS TRIGGER transaction_no_delete;',
      'END',
      '$qm_book_purge$;',
    ].join('\n'),
  );

  const created = await caller.finance.recordRevenue({
    waqfId: args.waqfId,
    bankAccountId: args.bankAccountId ?? FIXTURE_BANK_ACCOUNT_W1,
    amountSar: args.amountSar ?? SEEDED_QUARTER_INCOME_SAR,
    date,
    dateHijri: toHijriSnapshot(new Date(date)),
    descriptionAr: `إيراد اختباري لفترة مخصصة ${FICTIONAL_MARKER_AR}`,
    category: 'rent',
    receiptClass: 'INCOME',
    capitalSource: null,
  });

  // ── ⚠ THE WINDOW MUST HOLD NOTHING ELSE, AND THIS IS THE EXACT GUARANTEE ──────────────────
  // A window can be perfectly disjoint from every other ALLOCATED window and still contain a
  // receipt some other suite booked, or a fixture row nobody remembered. The effect would be a
  // pool that is quietly wrong, surfacing in whichever suite asserts a figure — a message about
  // money, three files away from its cause. `paid-period-allocator.test.ts` checks what it can
  // statically; this checks the thing itself, at the moment it matters, against the database.
  //
  // ⚠ The query is the SAME half-open interval the run itself will use — `[periodStart,
  // periodEnd + 1 day)`, i.e. `ledgerWindowWhere`'s — so it cannot disagree with what the engine
  // sees. `deletedAt` is NOT filtered, for the same reason `ledgerWindowWhere` no longer filters
  // it (AV7-F4): a retired row still HALTS the run, so a helper that ignored one would report an
  // empty window and leave the suite to fail on a refusal it could not explain.
  const prisma = await basePrisma();
  const toExclusive = new Date(`${args.period.periodEnd}T00:00:00.000Z`);
  toExclusive.setUTCDate(toExclusive.getUTCDate() + 1);
  const inWindow = await prisma.transaction.findMany({
    where: {
      waqfId: args.waqfId,
      date: { gte: new Date(`${args.period.periodStart}T00:00:00.000Z`), lt: toExclusive },
    },
    select: { id: true, type: true, receiptClass: true, amountSar: true, deletedAt: true },
    orderBy: { id: 'asc' },
  });
  const strangers = inWindow.filter((row) => row.id !== created.transactionId);
  if (strangers.length > 0) {
    throw new Error(
      `bookIncome("${args.tag}"): the allocated window ${args.period.periodStart}…` +
        `${args.period.periodEnd} on ${args.waqfId} holds ${strangers.length} row(s) besides the ` +
        `one just booked, so the pool this suite is about to assert is NOT the pool it thinks:\n` +
        strangers
          .map(
            (row) =>
              `  · ${row.id} ${row.type} ${row.receiptClass ?? '—'} ${row.amountSar.toString()}` +
              `${row.deletedAt === null ? '' : ' [RETIRED — this HALTS the run]'}`,
          )
          .join('\n') +
        `\nFix the ALLOCATION, not the assertion: give this suite a month in SUITE_MONTHS that ` +
        `nothing else populates (see PAID_PERIOD_BAND for the computable range). A window that ` +
        `captures another suite's receipt is how one receipt came to be distributed run after ` +
        `run — which is AV7-F2, the breach this allocator exists because of.`,
    );
  }
  return created.transactionId;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * S12-2 · the BR-1102 chain — record every missing step so a test can reach the Nazir's sign
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The slice of a tRPC caller {@link recordReservedMatterChain} needs. Structural, so no import cycle. */
export interface ReservedMatterChainCaller {
  readonly reservedMatter: {
    list(input: { waqfId: string }): Promise<
      ReadonlyArray<{
        readonly approvalRequestId: string;
        readonly chainMissing: readonly string[];
      }>
    >;
    recordPrincipalConsent(input: {
      waqfId: string;
      approvalRequestId: string;
      reference: string;
    }): Promise<unknown>;
    recordCounselReview(input: {
      waqfId: string;
      approvalRequestId: string;
      reference: string;
    }): Promise<unknown>;
    recordAuthorityNotice(input: {
      waqfId: string;
      approvalRequestId: string;
      reference: string;
    }): Promise<unknown>;
  };
}

/**
 * Records, through the REAL procedures on a STAFF caller (`legal:reserved_matter:write`), every step
 * the matter still lacks — so a test that wants to prove something AFTER the sign does not have to
 * re-spell the chain. Since migration 51 a kinded reserved matter cannot be approved otherwise: the
 * chain is a wall, not a flag. Returns the steps it recorded, in chain order.
 */
export async function recordReservedMatterChain(
  caller: ReservedMatterChainCaller,
  args: {
    readonly waqfId: string;
    readonly approvalRequestId: string;
    readonly reference?: string;
  },
): Promise<readonly string[]> {
  const reference = args.reference ?? `FAKE-CHAIN-${args.approvalRequestId}`;
  const rows = await caller.reservedMatter.list({ waqfId: args.waqfId });
  const row = rows.find((r) => r.approvalRequestId === args.approvalRequestId);
  if (row === undefined) {
    throw new Error(
      `recordReservedMatterChain: approval_request ${args.approvalRequestId} is not visible on ` +
        `waqf ${args.waqfId} to this caller — it needs legal:reserved_matter:read.`,
    );
  }
  const recorded: string[] = [];
  for (const step of row.chainMissing) {
    const input = { waqfId: args.waqfId, approvalRequestId: args.approvalRequestId, reference };
    if (step === 'PRINCIPAL_CONSENT') await caller.reservedMatter.recordPrincipalConsent(input);
    else if (step === 'COUNSEL_REVIEW') await caller.reservedMatter.recordCounselReview(input);
    else if (step === 'AUTHORITY_NOTICE') await caller.reservedMatter.recordAuthorityNotice(input);
    else throw new Error(`recordReservedMatterChain: unknown chain step ${step}`);
    recorded.push(step);
  }
  return recorded;
}
