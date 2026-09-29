// QMULATE — THE SETTING RESOLVER: E2 exit clause 3.
//
// §17 E2 exit clause 3, verbatim: **"a fee-basis change via `Setting` flows through with no
// redeploy."**
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE PROVES, AND WHY EACH PART IS LOAD-BEARING
// ═══════════════════════════════════════════════════════════════════════════════════════════
//  1. NO PROCESS-LIFETIME CACHE. Inside ONE live process: read the fee basis, change it through the
//     audited `set()`, and a NEW resolver in the SAME process returns the new value — no restart, no
//     module reload. EXIT-3's mutation is "hoist the per-request memo to module scope"; that makes a
//     fee-basis change require a redeploy, which is exactly what the clause forbids.
//  2. RESOLUTION ORDER endowment → global, proven BOTH ways: the seeded waqf-001 override wins for
//     waqf-001, and waqf-002 falls back to the global row. Proven by the `source` string first
//     (the two seeded rows carry the same `v: 10`, so a value comparison would pass over a broken
//     resolver) and then again by CHANGING the override so the values actually differ.
//  3. THE ENVELOPE, WITH ITS CAVEAT, IS THE DEFAULT RETURN. `unverified: true` and the exact
//     "⚠ unverified — confirm vs primary law" note survive every path — including into the audit
//     trail. Binding rule 3 leaks through a convenient API, so this is asserted, not assumed.
//  4. A MISS THROWS `SETTING_MISSING`. Never a default. Proven for an unregistered key AND for a
//     registered key whose only row is soft-deleted out from under it.
//  5. THE MUTATION IS AUDITED, with a before/after image.
//  6. AN UNAUTHORIZED CALLER IS REJECTED — specifically `admin`, which holds `admin:setting:write`
//     (config authority) and never `fee:nazir_fee:approve` (governance authority). The SAME request
//     is then approved by the Nazir, so the refusal is provably about the CALLER and not about the
//     request.
//
// ⚠ EVERY FIGURE TOUCHED HERE IS UNVERIFIED against primary Saudi law (CLAUDE.md binding rule 3).
// The test asserts the CAVEAT is carried, never that a number is correct.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// HOW THIS SUITE LEAVES THE DATABASE AS IT FOUND IT
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `@qmulate/database`'s `seed.integration.test.ts` compares ABSOLUTE table counts (`Setting: 16`)
// and asserts every Setting row carries a consistent marker. This file mutates three seeded rows
// and creates two of its own, so every mutation is captured before and restored in `afterAll`, and
// each destructive step is wrapped in try/finally so a mid-test failure still restores.
//
// `audit_event` rows are deliberately NOT cleaned: the table is append-only by database trigger and
// a DELETE raises SQLSTATE 42501 (gate G-1). An append-only trail you can tidy up is not
// append-only. Events written here are attributed to `user-test-api-*`, never `user-seed-admin`,
// because a sibling suite asserts a whole-multiple event count for that actor.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_ACTOR_ID,
  assertSeeded,
  basePrisma,
  privilegedPrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  hasDatabase,
  provisionTestSubjects,
  purgeCreatedSettingRows,
  requireSeededGlobalSetting,
  warnNoDatabase,
} from './setup.js';

import {
  ROLE_PRESETS,
  TOTP_STEP_UP_FRESHNESS_SETTING_KEY,
  isApprovalPermission,
  parsePermission,
  readGuardTag,
} from '../src/index.js';
import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import { SETTING_KEYS, createSettingResolver, type SettingResolver } from '../src/settings.js';
import {
  NAZIR_AUTHORITY_SETTING_KEYS,
  SETTING_CHANGE_APPROVAL_TYPE,
  settingChangeArtifact,
  settingChangeSubjectId,
} from '../src/routers/settings.js';

warnNoDatabase('E2 exit clause 3 (the Setting resolver: no cache, tiered resolution, authority)');

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Subjects and fixtures
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const NAZIR = 'user-test-api-d-nazir';
const MAKER = 'user-test-api-d-maker';
const ADMIN = 'user-test-api-d-admin';
/** §10 §4.2's small-team case: ONE person holding BOTH the maker seat and the Nazir seat. */
const MAKER_AND_NAZIR = 'user-test-api-d-both';

const WAQF_A = 'waqf-001'; // the endowment carrying the seeded per-waqf fee override
const WAQF_B = 'waqf-002'; // no override: must fall back to the global row

const BASIS_KEY = 'nazirFee.basis.default' as const;
const PERCENT_KEY = 'nazirFee.percentOfRevenue' as const;
/** A registered key whose global row this suite soft-deletes to prove SETTING_MISSING. */
const ROUNDING_KEY = 'distribution.rounding.method' as const;

/**
 * The step-up window, READ FROM THE SEEDED ROW in `beforeAll` — never restated here.
 *
 * It used to be a literal 600 that this suite also WROTE into the database, because the key was in
 * no registry and in no seed. Both halves were wrong: the figure now belongs to
 * `@qmulate/domain`'s registry and `packages/database`'s seed, and a test that hard-codes it would
 * keep passing over a seed that had changed underneath it.
 */
let stepUpWindowSeconds = 0;

/** Snapshots of every seeded row this suite mutates, keyed by row id. */
const originalValues = new Map<string, unknown>();
/** Rows this suite CREATES and must remove (they are not part of the seeded fifteen). */
const createdSettingIds = new Set<string>();

const createAppCaller = createCallerFactory(appRouter);

/**
 * ⚠ THE SHIPPED ROUTER, NOT A LOCAL ONE.
 *
 * These 38 EXIT-3 assertions used to run through `router({ settings: settingsRouter })` — a router
 * this file constructed — because `appRouter` did not mount `settingsRouter` at all. Every one of
 * them passed while the product's actual HTTP surface (`apps/web`'s `/api/trpc` route serves
 * `appRouter`) had no `settings.set`, so "a fee-basis change flows through with no redeploy" was
 * demonstrated against something nobody could call. The mount now exists (`src/root.ts`), and this
 * suite drives it, so the exit criterion is proven where it has to hold.
 */
const createSettingsCaller = createAppCaller;

/* ── raw helpers ─────────────────────────────────────────────────────────────────────────── */

async function readSettingRow(
  key: string,
  waqfId: string | null,
): Promise<{ id: string; value: unknown; deletedAt: Date | null } | null> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<
    { id: string; value: unknown; deletedAt: Date | null }[]
  >(
    `SELECT "id", "value", "deletedAt" FROM "setting" WHERE "key" = $1 AND ${
      waqfId === null ? `"waqfId" IS NULL` : `"waqfId" = $2`
    }`,
    ...(waqfId === null ? [key] : [key, waqfId]),
  );
  return rows[0] ?? null;
}

/** Captures a row's current value so `afterAll` can put it back byte-for-byte. */
async function snapshot(key: string, waqfId: string | null): Promise<void> {
  const row = await readSettingRow(key, waqfId);
  if (row !== null && !originalValues.has(row.id)) originalValues.set(row.id, row.value);
}

/** Restores a captured value with raw SQL — no extension, no trigger, exact bytes. */
async function restoreCaptured(): Promise<void> {
  const prisma = await basePrisma();
  for (const [id, value] of originalValues) {
    await prisma.$executeRawUnsafe(
      `UPDATE "setting" SET "value" = $1::jsonb, "deletedAt" = NULL WHERE "id" = $2`,
      JSON.stringify(value),
      id,
    );
  }
}

/** Writes a value straight into a row, bypassing `parseSetting`. For the invalid-stored-value case. */
async function writeRawSettingValue(id: string, value: unknown): Promise<void> {
  const prisma = await basePrisma();
  await prisma.$executeRawUnsafe(
    `UPDATE "setting" SET "value" = $1::jsonb WHERE "id" = $2`,
    JSON.stringify(value),
    id,
  );
}

async function setSettingDeletedAt(id: string, deletedAt: Date | null): Promise<void> {
  const prisma = await basePrisma();
  await prisma.$executeRawUnsafe(
    deletedAt === null
      ? `UPDATE "setting" SET "deletedAt" = NULL WHERE "id" = $1`
      : `UPDATE "setting" SET "deletedAt" = now() WHERE "id" = $1`,
    id,
  );
}

/**
 * Purges a `setting` row THIS SUITE created.
 *
 * ⚠ THE GUARD IS TURNED OFF EXPLICITLY. `00000000000008_e2_retention_remainder` refuses `DELETE` on
 * `setting` outright — the table holds every regulatory figure in the system, all ⚠ unverified against
 * primary Saudi law, and before that migration a raw DELETE erased one with `audit_event` unmoved at
 * 131. Removing a per-waqf OVERRIDE is the sharpest case: the resolver falls back to the global value
 * with no error and no event, which is a silent change to a fee basis for one endowment — exactly the
 * fall-back this suite spends its EXIT-3 assertions proving.
 *
 * `purgeCreatedSettingRows` is atomic and re-enables the guard in the same transaction. Only rows in
 * `createdSettingIds` reach it; a SEEDED row must never be passed (this suite SNAPSHOTS and RESTORES
 * those instead — see `restoreCaptured`).
 */
async function deleteSettingRow(id: string): Promise<void> {
  await purgeCreatedSettingRows([id]);
}

/**
 * Purges a test approval row.
 *
 * ⚠ THE GUARD IS TURNED OFF EXPLICITLY. `00000000000005_e2_grant_admission` refuses `DELETE` on an
 * `approval_request` the audit trail records — erasing one erases the maker-checker evidence and
 * frees the one-open-per-subject slot (C-13). This row was raised through `approval.initiate`, so it
 * is in the trail. The `DO` block is atomic: a raise rolls the `DISABLE` back with the transaction.
 */
async function deleteApprovalRequest(id: string): Promise<void> {
  // Scaffolding on the PRIVILEGED (owner) connection — it suspends a DELETE guard and hard-deletes,
  // both of which need table ownership. The runtime role has neither since ADR-0008 round 6, and that
  // is the posture, not a bug. Nothing asserted in this file runs on this connection.
  const prisma = await privilegedPrisma();
  await prisma.$executeRawUnsafe(
    [
      'DO $qm_purge_approval$',
      'BEGIN',
      '  ALTER TABLE "approval_request" DISABLE TRIGGER approval_request_no_delete;',
      // Inlined rather than parameterised: a `$1` inside a `DO` block body is not a bind slot.
      `  DELETE FROM "approval_request" WHERE "id" = '${id.replace(/'/g, "''")}';`,
      '  ALTER TABLE "approval_request" ENABLE ALWAYS TRIGGER approval_request_no_delete;',
      'END',
      '$qm_purge_approval$;',
    ].join('\n'),
  );
}

async function readApprovalStatus(id: string): Promise<string | null> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<{ status: string }[]>(
    `SELECT "status"::text AS status FROM "approval_request" WHERE "id" = $1`,
    id,
  );
  return rows[0]?.status ?? null;
}

/** The most recent audit event for a Setting row, with its before/after diff. */
async function latestSettingAuditEvent(entityId: string): Promise<{
  action: string;
  before: unknown;
  after: unknown;
  actorId: string | null;
} | null> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<
    { action: string; before: unknown; after: unknown; actorId: string | null }[]
  >(
    `SELECT "action"::text AS action, "before", "after", "actorId"
       FROM "audit_event"
      WHERE "entityType" = 'Setting' AND "entityId" = $1
      ORDER BY "id" DESC
      LIMIT 1`,
    entityId,
  );
  return rows[0] ?? null;
}

/** A resolver over a freshly built context — i.e. a NEW REQUEST in the same process. */
async function resolverFor(userId: string, options: { now?: Date } = {}): Promise<SettingResolver> {
  const ctx = await contextFor({
    userId,
    ...(options.now !== undefined ? { now: options.now } : {}),
  });
  return createSettingResolver(ctx.db, { now: ctx.now });
}

/** The domain error code of a rejected promise, reported as a string (never a serialized context). */
async function failureOf(run: () => Promise<unknown>): Promise<{ code: string; message: string }> {
  try {
    await run();
    return { code: 'DID_NOT_THROW', message: 'the call resolved' };
  } catch (error: unknown) {
    const candidate = error as { code?: unknown; message?: unknown; cause?: { code?: unknown } };
    const code =
      typeof candidate.code === 'string'
        ? candidate.code
        : typeof candidate.cause?.code === 'string'
          ? String(candidate.cause.code)
          : 'UNKNOWN';
    return { code, message: String(candidate.message ?? '') };
  }
}

/** A tRPC failure, reported as `{ trpcCode, apiCode }` — both matter for the non-disclosure rules. */
async function trpcFailureOf(
  run: () => Promise<unknown>,
): Promise<{ trpcCode: string; apiCode: string; message: string }> {
  try {
    await run();
    return { trpcCode: 'DID_NOT_THROW', apiCode: 'DID_NOT_THROW', message: 'the call resolved' };
  } catch (error: unknown) {
    const candidate = error as {
      code?: unknown;
      message?: unknown;
      cause?: { code?: unknown };
    };
    return {
      trpcCode: typeof candidate.code === 'string' ? candidate.code : 'UNKNOWN',
      apiCode: typeof candidate.cause?.code === 'string' ? String(candidate.cause.code) : 'UNKNOWN',
      message: String(candidate.message ?? ''),
    };
  }
}

/**
 * Raises a PENDING setting-change `ApprovalRequest` through the REAL maker procedure, runs `body`,
 * then hard-deletes the row.
 *
 * The delete is what keeps these tests order-independent: `approval_request_one_open_per_subject`
 * allows at most ONE non-terminal row per (waqfId, type, subjectId), and the subject is derived from
 * (key, waqfId) — so a refused request left PENDING would block every later test on the same figure.
 */
async function withPendingSettingChange(
  makerUserId: string,
  input: { key: string; waqfId: string; envelope: Record<string, unknown> },
  body: (approvalRequestId: string) => Promise<void>,
): Promise<void> {
  const makerCtx = await contextFor({ userId: makerUserId });
  const maker = createAppCaller(makerCtx);

  const created = await maker.approval.initiate({
    waqfId: input.waqfId,
    type: SETTING_CHANGE_APPROVAL_TYPE,
    subjectId: settingChangeSubjectId(input.key, input.waqfId),
    payload: settingChangeArtifact({
      key: input.key,
      waqfId: input.waqfId,
      envelope: input.envelope,
    }),
  });

  try {
    await body(created.approvalRequestId);
  } finally {
    await deleteApprovalRequest(created.approvalRequestId);
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.skipIf(!hasDatabase)('E2 exit clause 3 — the Setting resolver', () => {
  beforeAll(async () => {
    await assertSeeded();

    // ⚠ Every subject carries its role's FULL preset. The SEEDED grants are deliberate narrowings
    // (the seeded NAZIR shape holds neither `fee:nazir_fee:approve` nor `admin:setting:read`), so a
    // suite built on them would prove "a narrowed grant cannot reach this procedure" — true, and not
    // the thing under test.
    await provisionTestSubjects([
      { id: NAZIR, role: 'NAZIR', waqfIds: [WAQF_A], permissions: ROLE_PRESETS.nazir },
      { id: MAKER, role: 'FINANCE', waqfIds: [WAQF_A], permissions: ROLE_PRESETS.finance },
      // Grants on BOTH endowments: `admin:setting:read` is what makes the tier-resolution assertions
      // readable through the real procedure on waqf-001 AND waqf-002. SYSTEM_ADMIN, so this does not
      // add an ACTIVE NAZIR grant to any endowment (a sibling suite counts those exactly).
      {
        id: ADMIN,
        role: 'SYSTEM_ADMIN',
        waqfIds: [WAQF_A, WAQF_B],
        permissions: ROLE_PRESETS.admin,
      },
      // The small-team case, as TWO grants on ONE endowment (WaqfAccessGrant is unique on
      // (userId, waqfId, role), so this is a normal, representable state).
      {
        id: MAKER_AND_NAZIR,
        role: 'FINANCE',
        waqfIds: [WAQF_A],
        permissions: ROLE_PRESETS.finance,
      },
      { id: MAKER_AND_NAZIR, role: 'NAZIR', waqfIds: [WAQF_A], permissions: ROLE_PRESETS.nazir },
    ]);

    // The step-up window is SEEDED, not provisioned here — and the suite reads the seeded figure
    // rather than restating it, so a seed change cannot leave the staleness assertion below testing
    // a window nobody uses.
    const seededWindow = await requireSeededGlobalSetting(TOTP_STEP_UP_FRESHNESS_SETTING_KEY);
    expect(seededWindow.unit).toBe('seconds');
    expect(typeof seededWindow.v).toBe('number');
    stepUpWindowSeconds = seededWindow.v as number;

    await snapshot(BASIS_KEY, null);
    await snapshot(PERCENT_KEY, null);
    await snapshot(PERCENT_KEY, WAQF_A);
    await snapshot(ROUNDING_KEY, null);
  });

  afterAll(async () => {
    await restoreCaptured();
    for (const id of createdSettingIds) await deleteSettingRow(id);
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 1 · The envelope is the default return, and the caveat travels with it
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('the envelope, and its ⚠ unverified caveat', () => {
    it('get() returns the WHOLE envelope, marker included (binding rule 3)', async () => {
      const resolver = await resolverFor(NAZIR);
      const envelope = await resolver.get(PERCENT_KEY, { waqfId: WAQF_A });

      expect(envelope.unverified).toBe(true);
      // The EXACT marker. A note that differs by one character is a note that silently stops
      // matching the writer's — which is why `@qmulate/domain` and the seed compare theirs too.
      expect(envelope.note).toBe('⚠ unverified — confirm vs primary law');
      expect(envelope.unit).toBe('percent');
      expect(envelope.source.length).toBeGreaterThan(0);
    });

    it('the fee BASIS is legitimately verified: contractual, so it carries NO marker', async () => {
      const resolver = await resolverFor(NAZIR);
      const envelope = await resolver.get(BASIS_KEY);

      // The basis is fixed by the DEED (Nazarah Art. 11), so there is no primary-law figure to
      // verify it against. The RATE is a different matter and is unverified above. The two must not
      // be conflated, and the marker refinement is what stops them being.
      expect(envelope.unverified).toBe(false);
      expect(envelope.note).toBeUndefined();
      expect(envelope.v).toBe('PERCENT_OF_REVENUE');
    });

    it('getValue() is the NAMED escape hatch: same figure, caveat dropped', async () => {
      const resolver = await resolverFor(NAZIR);
      const envelope = await resolver.get(PERCENT_KEY, { waqfId: WAQF_A });
      const bare = await resolver.getValue(PERCENT_KEY, { waqfId: WAQF_A });

      expect(bare).toBe(envelope.v);
      // The point of the naming: a bare figure has nowhere to carry `unverified` or `note`.
      expect(typeof bare).toBe('number');
    });

    it('getMany() resolves several keys, each with its own envelope', async () => {
      const resolver = await resolverFor(NAZIR);
      const many = await resolver.getMany(
        [BASIS_KEY, PERCENT_KEY, 'deadline.ISTIBDAL_10BD.businessDays'],
        { waqfId: WAQF_A },
      );

      expect(many[BASIS_KEY].v).toBe('PERCENT_OF_REVENUE');
      expect(many[PERCENT_KEY].unverified).toBe(true);
      // ⚠ The istibdal notice window: 10 business days, UNVERIFIED against primary law.
      expect(many['deadline.ISTIBDAL_10BD.businessDays'].unverified).toBe(true);
      expect(many['deadline.ISTIBDAL_10BD.businessDays'].unit).toBe('business_days');
    });

    it('getMany() agrees with get() for the same key in the same request', async () => {
      const resolver = await resolverFor(NAZIR);
      const many = await resolver.getMany([PERCENT_KEY], { waqfId: WAQF_A });
      const single = await resolver.get(PERCENT_KEY, { waqfId: WAQF_A });
      expect(single).toEqual(many[PERCENT_KEY]);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 2 · Resolution order: endowment → global
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('resolution order — endowment override BEATS global', () => {
    it('waqf-001 gets the OVERRIDE and waqf-002 gets the GLOBAL row', async () => {
      const resolver = await resolverFor(ADMIN);

      const onA = await resolver.resolve(PERCENT_KEY, { waqfId: WAQF_A });
      const onB = await resolver.resolve(PERCENT_KEY, { waqfId: WAQF_B });

      expect(onA.tier).toBe('endowment');
      expect(onA.waqfId).toBe(WAQF_A);
      expect(onB.tier).toBe('global');
      expect(onB.waqfId).toBeNull();

      // ⚠ BOTH SEEDED ROWS CARRY `v: 10`, so a value comparison would pass over a resolver that
      // ignored the override entirely. The `source` strings differ, and that is what distinguishes
      // them: the waqf-001 row names the fixture, the global row names the deed's customary ʿushr.
      expect(onA.envelope.source).toContain('fixture fee-001');
      expect(onB.envelope.source).not.toContain('fixture fee-001');
      expect(onA.envelope.source).not.toBe(onB.envelope.source);
    });

    it('EXIT-3 the data half: the override and the global default are the SAME key', async () => {
      // Sprint 1 seeded `nazirFee.percentOfRevenue.default` globally and `nazirFee.percentOfRevenue`
      // per waqf — two keys with no fallback link, so the override could never win and no other
      // endowment had a fallback at all. Both rows parse and both exist, which is why the failure was
      // invisible. Asserted here from the RESOLVER's side, end to end.
      const prisma = await basePrisma();
      const legacy = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*)::bigint AS n FROM "setting" WHERE "key" = 'nazirFee.percentOfRevenue.default'`,
      );
      expect(Number(legacy[0]?.n ?? 0)).toBe(0);

      const resolver = await resolverFor(ADMIN);
      // The same key answers at both tiers — that IS the fallback link.
      expect((await resolver.resolve(PERCENT_KEY, { waqfId: WAQF_A })).tier).toBe('endowment');
      expect((await resolver.resolve(PERCENT_KEY, { waqfId: WAQF_B })).tier).toBe('global');
    });

    it('omitting the scope reads the GLOBAL tier deliberately, never an arbitrary override', async () => {
      const resolver = await resolverFor(ADMIN);
      const global = await resolver.resolve(PERCENT_KEY);
      expect(global.tier).toBe('global');
      expect(global.envelope.source).not.toContain('fixture fee-001');
    });

    it('a per-endowment row is INVISIBLE to a caller with no grant on that endowment', async () => {
      // The resolver reads through the caller's own scoped client, so the force-filter still applies:
      // `Setting` is `allow-global`, meaning global rows are readable by any authenticated caller and
      // a per-endowment row only with a grant. The Nazir here holds waqf-001 only.
      const resolver = await resolverFor(NAZIR);
      const onB = await resolver.resolve(PERCENT_KEY, { waqfId: WAQF_B });
      // waqf-002 has no override anyway; the meaningful half is that asking about an endowment the
      // caller cannot reach yields the GLOBAL figure rather than another endowment's override.
      expect(onB.tier).toBe('global');
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 2b · MP-06's Setting half — the leadership authority matrix DOES NOT EXIST
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('MP-06 · there is NO leadership-authority-matrix Setting', () => {
    // MP-06 as originally written expected "a Setting whose DEFAULT resolves to the empty set,
    // asserted empty". D-1 (USER DECISION) is STRICTER and overrides it, verbatim: "Do NOT model a
    // 'leadership authority matrix' Setting. Not even one defaulting to empty — an empty configurable
    // is a foothold." So the assertion is ABSENCE, at both layers, not emptiness.
    //
    // Why this is the load-bearing form: §3's grid-rules bullet — "A is held by nazir (and, within
    // the leadership authority matrix, `leadership` for portfolio-level matters)" — is the single
    // textual hook in the whole spec for a SECOND approval role. An empty configurable would turn
    // "add a second approval authority" into a one-row config change with no code review, no
    // migration, and no ADR.
    it('no REGISTERED key names one — the vocabulary is closed and this is not in it', () => {
      const suspicious = SETTING_KEYS.filter((key) =>
        /leader|authority[_.]?matrix|approver/i.test(key),
      );
      expect(suspicious).toEqual([]);
    });

    it('no SEEDED row names one either, at any tier', async () => {
      const prisma = await basePrisma();
      const rows = await prisma.$queryRawUnsafe<{ key: string; waqfId: string | null }[]>(
        `SELECT "key", "waqfId" FROM "setting"
          WHERE "key" ~* 'leader' OR "key" ~* 'authorityMatrix' OR "key" ~* 'authority_matrix'
             OR "key" ~* 'approver'`,
      );
      expect(rows).toEqual([]);
    });

    it('and the resolver REFUSES to serve such a key rather than returning an empty default', async () => {
      const resolver = await resolverFor(ADMIN);
      for (const key of [
        'leadership.authorityMatrix',
        'leadership.authority_matrix',
        'authorityMatrix.leadership',
      ]) {
        const failure = await failureOf(() => resolver.get(key as never));
        // SETTING_MISSING, not "[]". A resolver that answered an unregistered authority key with an
        // empty list would make "the matrix is empty" TRUE and "the matrix exists" true at once —
        // and the next person would populate it.
        expect(failure.code, `key ${key}`).toBe('SETTING_MISSING');
      }
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 3 · TWO tiers, and it says so (the §17 three-tier gap)
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('the CLIENT tier is refused, not silently ignored', () => {
    it('a clientId scope THROWS SETTING_INVALID and names the missing column', async () => {
      const resolver = await resolverFor(ADMIN);
      const failure = await failureOf(() => resolver.get(PERCENT_KEY, { clientId: 'client-001' }));

      expect(failure.code).toBe('SETTING_INVALID');
      expect(failure.message).toContain('clientId');
      // The honesty requirement: §17 names three tiers, TWO ship, and the resolver says which.
      expect(failure.message).toContain('TWO ship');
    });

    it('a clientId alongside a waqfId is still refused (no partial support)', async () => {
      const resolver = await resolverFor(ADMIN);
      const failure = await failureOf(() =>
        resolver.get(PERCENT_KEY, { waqfId: WAQF_A, clientId: 'client-001' }),
      );
      expect(failure.code).toBe('SETTING_INVALID');
    });

    it('a BLANK waqfId is refused rather than silently widened to global', async () => {
      const resolver = await resolverFor(ADMIN);
      for (const waqfId of ['', '   ']) {
        const failure = await failureOf(() => resolver.get(PERCENT_KEY, { waqfId }));
        expect(failure.code, `waqfId ${JSON.stringify(waqfId)}`).toBe('SETTING_INVALID');
      }
      // `null` and `undefined` are the DELIBERATE spellings of "the global tier", and they resolve.
      expect((await resolver.resolve(PERCENT_KEY, { waqfId: null })).tier).toBe('global');
      expect((await resolver.resolve(PERCENT_KEY, {})).tier).toBe('global');
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 4 · Fail closed: SETTING_MISSING / SETTING_INVALID
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('fail closed — a miss NEVER becomes a default', () => {
    it('an unregistered key throws SETTING_MISSING', async () => {
      const resolver = await resolverFor(NAZIR);
      for (const key of [
        'nazirFee.percentOfRevenue.default', // the Sprint-1 spelling: must NOT resolve
        'nazirFee.percentofrevenue',
        ' nazirFee.percentOfRevenue',
        'not.a.key',
        '',
      ]) {
        const failure = await failureOf(() => resolver.get(key as never));
        expect(failure.code, `key ${JSON.stringify(key)}`).toBe('SETTING_MISSING');
      }
    });

    // mutationToVerify: in `createSettingResolver`, replace `pickMostSpecific(key, candidates)` with
    // `candidates[0] ?? { tier: 'global', raw: { v: 10, unit: 'percent', unverified: false,
    // source: 'fallback' } }` — a substituted default. This test is the one that goes red.
    it('a REGISTERED key with no live row at any tier throws SETTING_MISSING', async () => {
      const row = await readSettingRow(ROUNDING_KEY, null);
      expect(row).not.toBeNull();
      const id = row?.id ?? '';

      try {
        // Soft-deleted, so the row still exists (a sibling suite counts rows) but the resolver must
        // treat it as absent — `deletedAt: null` is part of every tier query.
        await setSettingDeletedAt(id, new Date());

        const resolver = await resolverFor(NAZIR);
        const failure = await failureOf(() => resolver.get(ROUNDING_KEY));
        expect(failure.code).toBe('SETTING_MISSING');
        expect(failure.message).toContain('never hardcoded defaults');
      } finally {
        await setSettingDeletedAt(id, null);
      }

      // And it resolves again once restored — so the assertion above was about the deletion, not
      // about a permanently broken fixture.
      const after = await resolverFor(NAZIR);
      expect((await after.get(ROUNDING_KEY)).unverified).toBe(true);
    });

    it('a stored value that does not satisfy its schema throws SETTING_INVALID on READ', async () => {
      const row = await readSettingRow(PERCENT_KEY, WAQF_A);
      const id = row?.id ?? '';
      expect(id).not.toBe('');

      try {
        // Written RAW, bypassing `parseSetting`: this is how a bad row really arrives (a migration,
        // a hand-edit, an older fixture). Validating only on WRITE would let it through on read.
        // `unverified: true` with NO note — the marker refinement's exact failure mode.
        await writeRawSettingValue(id, {
          v: 10,
          unit: 'percent',
          unverified: true,
          source: 'raw write with no ⚠ marker',
        });

        const resolver = await resolverFor(NAZIR);
        const failure = await failureOf(() => resolver.get(PERCENT_KEY, { waqfId: WAQF_A }));
        expect(failure.code).toBe('SETTING_INVALID');
      } finally {
        await restoreCaptured();
      }
    });

    it('set() REFUSES an invalid envelope, and writes nothing', async () => {
      const before = await readSettingRow(BASIS_KEY, null);
      const resolver = await resolverFor(NAZIR);

      const failure = await failureOf(() =>
        // `RETAINER_PLUS` is not a `FeeBasis` member. An engine must never guess what a mistyped
        // regulatory figure meant.
        resolver.set(BASIS_KEY, {
          v: 'RETAINER_PLUS',
          unit: null,
          unverified: false,
          source: 'x',
        } as never),
      );
      expect(failure.code).toBe('SETTING_INVALID');

      const after = await readSettingRow(BASIS_KEY, null);
      expect(after?.value).toEqual(before?.value);
    });

    it('set() REFUSES an unverified figure that is missing its ⚠ marker', async () => {
      const resolver = await resolverFor(NAZIR);
      const failure = await failureOf(() =>
        resolver.set(
          PERCENT_KEY,
          { v: 7, unit: 'percent', unverified: true, source: 'no marker' } as never,
          { waqfId: WAQF_A },
        ),
      );
      expect(failure.code).toBe('SETTING_INVALID');
      // Structural, not advisory: an author physically cannot store the figure without the caveat.
      expect(failure.message).toContain('unverified');
    });

    it('set() REFUSES a verified figure that carries the ⚠ marker anyway', async () => {
      const resolver = await resolverFor(NAZIR);
      const failure = await failureOf(() =>
        resolver.set(BASIS_KEY, {
          v: 'RETAINER',
          unit: null,
          unverified: false,
          source: 'deed',
          note: '⚠ unverified — confirm vs primary law',
        } as never),
      );
      expect(failure.code).toBe('SETTING_INVALID');
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 5 · EXIT-3: no process-lifetime cache
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('EXIT-3 — a fee-basis change flows through with NO redeploy', () => {
    // mutationToVerify: in `createSettingResolver`, hoist `const memo = new Map(...)` to module
    // scope. The second read below then returns the STALE basis and this test goes red — which is
    // exactly how it would fail in production: the change would need a restart.
    it('changes the basis and a NEW resolver in the SAME process sees it', async () => {
      const beforeResolver = await resolverFor(NAZIR);
      const before = await beforeResolver.get(BASIS_KEY);
      expect(before.v).toBe('PERCENT_OF_REVENUE');

      try {
        const writer = await resolverFor(NAZIR);
        const written = await writer.set(BASIS_KEY, {
          v: 'RETAINER',
          unit: null,
          unverified: false,
          source: 'waqf deed (E2 EXIT-3 exercise)',
        });
        expect(written.v).toBe('RETAINER');

        // ⚠ THE ASSERTION. Same process, same module graph, no restart, no re-import: a NEW
        // resolver — i.e. the next REQUEST — reads the new figure.
        const next = await resolverFor(NAZIR);
        expect((await next.get(BASIS_KEY)).v).toBe('RETAINER');

        // And a third, to rule out "the second resolver happened to be the writer's".
        const third = await resolverFor(ADMIN);
        expect((await third.get(BASIS_KEY)).v).toBe('RETAINER');
      } finally {
        await restoreCaptured();
      }

      const restored = await resolverFor(NAZIR);
      expect((await restored.get(BASIS_KEY)).v).toBe('PERCENT_OF_REVENUE');
    });

    it('the memo is PER REQUEST: one request sees one consistent figure', async () => {
      // A request that read the figure before the change keeps its answer — deliberately. A figure
      // that changed halfway through a distribution computation would produce a payout nobody can
      // reproduce. The guarantee is "stable within a request, always re-read across requests".
      const holder = await resolverFor(NAZIR);
      expect((await holder.get(BASIS_KEY)).v).toBe('PERCENT_OF_REVENUE');

      try {
        const writer = await resolverFor(NAZIR);
        await writer.set(BASIS_KEY, {
          v: 'RETAINER',
          unit: null,
          unverified: false,
          source: 'waqf deed (E2 EXIT-3 exercise)',
        });

        expect((await holder.get(BASIS_KEY)).v).toBe('PERCENT_OF_REVENUE'); // same request: stable
        const fresh = await resolverFor(NAZIR);
        expect((await fresh.get(BASIS_KEY)).v).toBe('RETAINER'); // next request: current
      } finally {
        await restoreCaptured();
      }
    });

    it('set() invalidates its OWN memo, so a writer never reads back what it replaced', async () => {
      const resolver = await resolverFor(NAZIR);
      expect((await resolver.get(BASIS_KEY)).v).toBe('PERCENT_OF_REVENUE');

      try {
        await resolver.set(BASIS_KEY, {
          v: 'RETAINER',
          unit: null,
          unverified: false,
          source: 'waqf deed (E2 EXIT-3 exercise)',
        });
        // Same resolver instance. Without the invalidation this would still say PERCENT_OF_REVENUE,
        // and a request that changed a figure and then acted on it would act on the old one.
        expect((await resolver.get(BASIS_KEY)).v).toBe('RETAINER');
      } finally {
        await restoreCaptured();
      }
    });

    it('the mutation is AUDITED with a before/after image', async () => {
      const row = await readSettingRow(BASIS_KEY, null);
      const id = row?.id ?? '';

      try {
        const writer = await resolverFor(NAZIR);
        await writer.set(BASIS_KEY, {
          v: 'RETAINER',
          unit: null,
          unverified: false,
          source: 'waqf deed (E2 EXIT-3 exercise)',
        });

        const event = await latestSettingAuditEvent(id);
        expect(event).not.toBeNull();
        expect(event?.action).toBe('UPDATE');
        // Attributed to the acting Nazir, NOT to `user-seed-admin` (a sibling suite counts that one).
        expect(event?.actorId).toBe(NAZIR);
        expect(event?.actorId).not.toBe(API_TEST_ACTOR_ID);

        const before = (event?.before as { value?: { v?: unknown } } | null)?.value;
        const after = (event?.after as { value?: { v?: unknown } } | null)?.value;
        expect(before?.v).toBe('PERCENT_OF_REVENUE');
        expect(after?.v).toBe('RETAINER');
      } finally {
        await restoreCaptured();
      }
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 6 · The AUTHORITY half — `settings.set` is a nazir A* action
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('settings.set — the approval rung', () => {
    it('the governed key list is DERIVED from the registry, and is the nazirFee family', () => {
      expect([...NAZIR_AUTHORITY_SETTING_KEYS].sort()).toEqual([
        'nazirFee.basis.default',
        'nazirFee.percentOfRevenue',
      ]);
    });

    it('is composed on the SEGREGATION and STEP-UP rungs, read off the REAL middleware chain', () => {
      // Not a `.meta()` claim — tRPC's meta is caller-supplied and a later `.meta()` overwrites an
      // earlier one, so a router that FORGOT the ladder could still declare it had it. This walks
      // the composed `_def.middlewares` and reads each guard's own tag, which carries the SAME
      // closure variable the middleware enforces.
      const procedures = (
        appRouter as unknown as {
          _def: { procedures: Record<string, { _def: { middlewares: unknown[] } }> };
        }
      )._def.procedures;

      const tagsFor = (path: string): { kinds: string[]; permissions: string[] } => {
        const middlewares = procedures[path]?._def.middlewares ?? [];
        const tags = middlewares.map((mw) => readGuardTag(mw)).filter((tag) => tag !== undefined);
        return {
          kinds: tags.map((tag) => tag?.kind ?? ''),
          permissions: tags.map((tag) => tag?.permission ?? '').filter((value) => value !== ''),
        };
      };

      const set = tagsFor('settings.set');
      expect(set.kinds).toContain('authed');
      expect(set.kinds).toContain('endowment-scope');
      expect(set.kinds).toContain('segregation');
      expect(set.kinds).toContain('totp-step-up');
      expect(new Set(set.permissions)).toEqual(new Set(['fee:nazir_fee:approve']));
      // Rung ORDER: authed before scope before segregation before step-up.
      expect(set.kinds.indexOf('authed')).toBeLessThan(set.kinds.indexOf('endowment-scope'));
      expect(set.kinds.indexOf('endowment-scope')).toBeLessThan(set.kinds.indexOf('segregation'));
      expect(set.kinds.indexOf('segregation')).toBeLessThan(set.kinds.indexOf('totp-step-up'));

      const get = tagsFor('settings.get');
      expect(get.kinds).toEqual(['authed', 'endowment-scope']);
      expect(get.permissions).toEqual(['admin:setting:read']);
      // A READ must NOT be on the approval rung: composing the segregation guard onto a query makes
      // the ladder's shape a lie, and would demand an approvalRequestId to read a figure.
      expect(get.kinds).not.toContain('segregation');
      // No AML compartment guard anywhere: a configuration figure is not compartment material, and
      // an approval authority living inside the compartment the Nazir cannot see is a BR-105
      // violation (MP-24). The two must never co-exist on one procedure.
      expect(set.kinds).not.toContain('aml-member');
      expect(get.kinds).not.toContain('aml-member');
    });

    it('every permission it declares PARSES against the closed registry', () => {
      // Not "looks like a permission": `parsePermission` is `@qmulate/domain`'s closed
      // module × resource × verb registry, so `fee:nazir_fee:aprove` and `admin:setting:*` both
      // fail here — at router-construction time, which is import time, which is every test run.
      for (const permission of ['fee:nazir_fee:approve', 'admin:setting:read']) {
        expect(parsePermission(permission), permission).toBeDefined();
      }
      expect(isApprovalPermission('fee:nazir_fee:approve')).toBe(true);
      expect(isApprovalPermission('admin:setting:read')).toBe(false);
    });

    it('IS MOUNTED on appRouter — whole, and adding no public or unscoped-authed procedure', () => {
      // ⚠ THIS ASSERTION REPLACED ITS OWN OPPOSITE. What stood here was a de-risking exercise —
      // `mergeRouters(appRouter, settingsOnlyRouter)`, i.e. "the mount WOULD be safe" — written
      // because its author could not edit `src/root.ts`. It was self-defeating: the moment the mount
      // actually happened, the merge threw `Duplicate key settings` and the suite went red. A test
      // that fails when the thing it de-risks is done cannot be the thing that keeps it done.
      //
      // What it says now is "the mount HAPPENED", which is the assertion whose absence let a P0 exit
      // criterion ship unreachable. `router-introspection.test.ts` derives the same property from
      // the contents of `src/routers/`; this one pins the two procedure names for a reader.
      const procedures = (
        appRouter as unknown as {
          _def: { procedures: Record<string, { _def: { middlewares: unknown[] } }> };
        }
      )._def.procedures;

      const settingsPaths = Object.keys(procedures).filter((path) => path.startsWith('settings.'));
      expect(settingsPaths.sort()).toEqual(['settings.get', 'settings.set']);

      for (const path of settingsPaths) {
        const kinds = (procedures[path]?._def.middlewares ?? [])
          .map((mw) => readGuardTag(mw)?.kind)
          .filter((kind) => kind !== undefined);
        expect(kinds, `${path} must be authed`).toContain('authed');
        expect(kinds, `${path} must be endowment-scoped`).toContain('endowment-scope');
      }

      // And the mount shadowed nothing: a `settings` key that collided with an existing branch
      // would change which procedures are public.
      expect(Object.keys(procedures)).toContain('health');
      expect(Object.keys(procedures)).toContain('whoami');
      expect(Object.keys(procedures)).toContain('approval.approve');
    });

    it('a NAZIR approves a maker-raised fee-rate change, and the new figure resolves', async () => {
      const proposed = {
        v: 7,
        unit: 'percent',
        unverified: true,
        source: 'waqf deed — customary ʿushr, amended (E2 EXIT-3 exercise)',
        note: '⚠ unverified — confirm vs primary law',
      };

      try {
        await withPendingSettingChange(
          MAKER,
          { key: PERCENT_KEY, waqfId: WAQF_A, envelope: proposed },
          async (approvalRequestId) => {
            const nazirCtx = await contextFor({ userId: NAZIR });
            const result = await createSettingsCaller(nazirCtx).settings.set({
              waqfId: WAQF_A,
              approvalRequestId,
              key: PERCENT_KEY,
              value: proposed,
            });

            expect(result.status).toBe('EXECUTED');
            expect(result.tier).toBe('endowment');
            expect(result.value.v).toBe(7);
            // The caveat survives the round trip into the response.
            expect(result.value.unverified).toBe(true);
            expect(result.value.note).toBe('⚠ unverified — confirm vs primary law');

            // ⚠ EXECUTED, not APPROVED: `APPROVED` is NON-terminal, so the one-open-per-subject
            // index would keep the slot occupied and block the next legitimate change to this figure.
            expect(await readApprovalStatus(approvalRequestId)).toBe('EXECUTED');

            // THE FIGURE FLOWED THROUGH, in the same process, with no restart — and now the two
            // tiers genuinely DIFFER, so "the override wins" is proven by value and not only by
            // provenance.
            const after = await resolverFor(ADMIN);
            expect((await after.resolve(PERCENT_KEY, { waqfId: WAQF_A })).envelope.v).toBe(7);
            expect((await after.resolve(PERCENT_KEY, { waqfId: WAQF_B })).envelope.v).toBe(10);

            // MP-32's shape: the trail names the GRANT and the ROLE that conferred the authority.
            const prisma = await basePrisma();
            const approveEvents = await prisma.$queryRawUnsafe<{ context: unknown }[]>(
              `SELECT "context" FROM "audit_event"
                WHERE "action" = 'APPROVE' AND "entityType" = 'Setting' AND "actorId" = $1
                ORDER BY "id" DESC LIMIT 1`,
              NAZIR,
            );
            const context = approveEvents[0]?.context as Record<string, unknown> | undefined;
            expect(context).toBeDefined();
            expect(typeof context?.['grantId']).toBe('string');
            expect(context?.['role']).toBe('NAZIR');
            expect(context?.['makerId']).toBe(MAKER);
            expect(context?.['settingKey']).toBe(PERCENT_KEY);
            expect(context?.['unverified']).toBe(true);
            expect(context?.['note']).toBe('⚠ unverified — confirm vs primary law');
            expect(typeof context?.['payloadHash']).toBe('string');
          },
        );
      } finally {
        await restoreCaptured();
      }
    });

    it('EXIT-3: `admin` is REJECTED — config authority is not governance authority', async () => {
      const proposed = {
        v: 'RETAINER',
        unit: null,
        unverified: false,
        source: 'waqf deed (E2 EXIT-3 exercise)',
      };
      const createdId = `setting-${WAQF_A}-${BASIS_KEY}`;

      try {
        await withPendingSettingChange(
          MAKER,
          { key: BASIS_KEY, waqfId: WAQF_A, envelope: proposed },
          async (approvalRequestId) => {
            // ── the refusal ────────────────────────────────────────────────────────────────────
            const adminCtx = await contextFor({ userId: ADMIN });
            const refusal = await trpcFailureOf(() =>
              createSettingsCaller(adminCtx).settings.set({
                waqfId: WAQF_A,
                approvalRequestId,
                key: BASIS_KEY,
                value: proposed,
              }),
            );

            // FORBIDDEN, not NOT_FOUND: the admin DOES hold a grant on this endowment, so its
            // existence is already disclosed and a precise error is the honest one. §2.1: admin
            // "cannot approve/sign money, filings, or reserved matters".
            expect(refusal.trpcCode).toBe('FORBIDDEN');
            expect(refusal.apiCode).toBe('PERMISSION_DENIED');
            expect(refusal.message).toContain('fee:nazir_fee:approve');

            // Nothing happened: no row written, and the request is still open.
            expect(await readSettingRow(BASIS_KEY, WAQF_A)).toBeNull();
            expect(await readApprovalStatus(approvalRequestId)).toBe('PENDING');

            // ── and the SAME request IS approvable by the Nazir ────────────────────────────────
            // Without this half, the refusal above could have been about the request rather than
            // about the caller, and the test would prove nothing about authority.
            const nazirCtx = await contextFor({ userId: NAZIR });
            const result = await createSettingsCaller(nazirCtx).settings.set({
              waqfId: WAQF_A,
              approvalRequestId,
              key: BASIS_KEY,
              value: proposed,
            });
            expect(result.status).toBe('EXECUTED');
            createdSettingIds.add(createdId);

            const after = await resolverFor(ADMIN);
            expect((await after.resolve(BASIS_KEY, { waqfId: WAQF_A })).envelope.v).toBe(
              'RETAINER',
            );
            // The GLOBAL row is untouched — an endowment-tier change governs one endowment.
            expect((await after.resolve(BASIS_KEY)).envelope.v).toBe('PERCENT_OF_REVENUE');
          },
        );
      } finally {
        await deleteSettingRow(createdId);
        createdSettingIds.delete(createdId);
        await restoreCaptured();
      }
    });

    it('the MAKER cannot approve their own change, even holding a NAZIR grant (§10 §4.2)', async () => {
      const proposed = {
        v: 9,
        unit: 'percent',
        unverified: true,
        source: 'waqf deed — customary ʿushr (small-team case)',
        note: '⚠ unverified — confirm vs primary law',
      };

      await withPendingSettingChange(
        MAKER_AND_NAZIR,
        { key: PERCENT_KEY, waqfId: WAQF_A, envelope: proposed },
        async (approvalRequestId) => {
          const ctx = await contextFor({ userId: MAKER_AND_NAZIR });
          const refusal = await trpcFailureOf(() =>
            createSettingsCaller(ctx).settings.set({
              waqfId: WAQF_A,
              approvalRequestId,
              key: PERCENT_KEY,
              value: proposed,
            }),
          );

          // The comparison is IDENTITY against the persisted makerId — never a role predicate.
          // Holding the Nazir seat does not lift it.
          expect(refusal.apiCode).toBe('SEGREGATION_OF_DUTIES');
          expect(refusal.trpcCode).toBe('FORBIDDEN');

          // BEFORE ANY STATE CHANGE: the request is untouched and the figure is unchanged.
          expect(await readApprovalStatus(approvalRequestId)).toBe('PENDING');
          const resolver = await resolverFor(ADMIN);
          expect((await resolver.resolve(PERCENT_KEY, { waqfId: WAQF_A })).envelope.v).toBe(10);
        },
      );
    });

    it('a STALE TOTP assertion refuses the change (NFR-06 step-up, Setting-driven)', async () => {
      const proposed = {
        v: 8,
        unit: 'percent',
        unverified: true,
        source: 'waqf deed — customary ʿushr (stale step-up case)',
        note: '⚠ unverified — confirm vs primary law',
      };

      await withPendingSettingChange(
        MAKER,
        { key: PERCENT_KEY, waqfId: WAQF_A, envelope: proposed },
        async (approvalRequestId) => {
          const now = new Date();
          const staleCtx = await contextFor({
            userId: NAZIR,
            now,
            // Older than the configured window. The window is a Setting, never a constant.
            totpAssertedAt: new Date(now.getTime() - (stepUpWindowSeconds + 60) * 1000),
          });

          const refusal = await trpcFailureOf(() =>
            createSettingsCaller(staleCtx).settings.set({
              waqfId: WAQF_A,
              approvalRequestId,
              key: PERCENT_KEY,
              value: proposed,
            }),
          );
          expect(refusal.apiCode).toBe('TOTP_STEP_UP_REQUIRED');
          expect(await readApprovalStatus(approvalRequestId)).toBe('PENDING');
        },
      );
    });

    it('a change the Nazir did NOT approve is refused: ARTIFACT_MISMATCH', async () => {
      const approved = {
        v: 7,
        unit: 'percent',
        unverified: true,
        source: 'waqf deed — the figure that was approved',
        note: '⚠ unverified — confirm vs primary law',
      };
      const substituted = { ...approved, v: 1 };

      await withPendingSettingChange(
        MAKER,
        { key: PERCENT_KEY, waqfId: WAQF_A, envelope: approved },
        async (approvalRequestId) => {
          const nazirCtx = await contextFor({ userId: NAZIR });
          const refusal = await trpcFailureOf(() =>
            createSettingsCaller(nazirCtx).settings.set({
              waqfId: WAQF_A,
              approvalRequestId,
              // A DIFFERENT figure from the one bound to the request. The request's own payloadHash
              // still matches its own payload, so the approval rung is satisfied — only this
              // comparison catches it. Whoever changes the number after approval would otherwise be
              // the real approver (§10 §4.3).
              key: PERCENT_KEY,
              value: substituted,
            }),
          );

          expect(refusal.apiCode).toBe('APPROVAL_STALE');
          expect(refusal.message).toContain('ARTIFACT_MISMATCH');
          expect(await readApprovalStatus(approvalRequestId)).toBe('PENDING');

          const resolver = await resolverFor(ADMIN);
          expect((await resolver.resolve(PERCENT_KEY, { waqfId: WAQF_A })).envelope.v).toBe(10);
        },
      );
    });

    it('an approval raised for ANOTHER key cannot be spent on this one: WRONG_SUBJECT', async () => {
      const proposed = {
        v: 'RETAINER',
        unit: null,
        unverified: false,
        source: 'waqf deed (wrong-subject case)',
      };

      await withPendingSettingChange(
        MAKER,
        { key: BASIS_KEY, waqfId: WAQF_A, envelope: proposed },
        async (approvalRequestId) => {
          const nazirCtx = await contextFor({ userId: NAZIR });
          const refusal = await trpcFailureOf(() =>
            createSettingsCaller(nazirCtx).settings.set({
              waqfId: WAQF_A,
              approvalRequestId,
              // The request names the BASIS subject; this asks to change the RATE.
              key: PERCENT_KEY,
              value: {
                v: 7,
                unit: 'percent',
                unverified: true,
                source: 'x',
                note: '⚠ unverified — confirm vs primary law',
              },
            }),
          );
          expect(refusal.apiCode).toBe('APPROVAL_STALE');
          expect(refusal.message).toContain('WRONG_SUBJECT');
        },
      );
    });

    it('an UNGOVERNED key is refused even for a Nazir with a genuine approval', async () => {
      const proposed = {
        v: 'RETAINER',
        unit: null,
        unverified: false,
        source: 'waqf deed (ungoverned-key case)',
      };

      await withPendingSettingChange(
        MAKER,
        { key: BASIS_KEY, waqfId: WAQF_A, envelope: proposed },
        async (approvalRequestId) => {
          const nazirCtx = await contextFor({ userId: NAZIR });
          for (const key of [
            'deadline.REGISTER_30BD.businessDays',
            'classification.threshold.large.sar',
            'retention.minimumYears',
            'calendar.workweek',
            'not.a.key',
          ]) {
            const refusal = await trpcFailureOf(() =>
              createSettingsCaller(nazirCtx).settings.set({
                waqfId: WAQF_A,
                approvalRequestId,
                key,
                value: proposed,
              }),
            );
            expect(refusal.apiCode, `key ${key}`).toBe('PERMISSION_DENIED');
          }
        },
      );
    });

    it('an unscoped caller cannot even READ a figure through the procedure (NOT_FOUND)', async () => {
      // `user-unscoped` is the seeded V-5 negative subject: a valid session, TOTP enrolled, ZERO
      // grants, documented as "must never be given a grant".
      const ctx = await contextFor({ userId: 'user-unscoped' });
      const refusal = await trpcFailureOf(() =>
        createSettingsCaller(ctx).settings.get({ waqfId: WAQF_A, key: PERCENT_KEY }),
      );
      expect(refusal.trpcCode).toBe('NOT_FOUND');
      expect(refusal.trpcCode).not.toBe('FORBIDDEN');
      expect(refusal.apiCode).toBe('NO_GRANT');
    });

    it('settings.get returns the envelope AND the tier through the real procedure', async () => {
      const adminCtx = await contextFor({ userId: ADMIN });
      const caller = createSettingsCaller(adminCtx);

      const onA = await caller.settings.get({ waqfId: WAQF_A, key: PERCENT_KEY });
      expect(onA.tier).toBe('endowment');
      expect(onA.value.unverified).toBe(true);
      expect(onA.value.note).toBe('⚠ unverified — confirm vs primary law');

      const onB = await caller.settings.get({ waqfId: WAQF_B, key: PERCENT_KEY });
      expect(onB.tier).toBe('global');
      expect(onB.waqfId).toBeNull();
    });
  });
});
