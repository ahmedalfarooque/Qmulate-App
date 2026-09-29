/**
 * EXIT-1 and AC-1 — the scoped procedure denies a caller without a grant, and the denial is audited.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §17 E2 EXIT CLAUSE 1, VERBATIM: "a scoped procedure denies a caller without a grant".
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Four things are asserted for each denial, and each one closes a different way the clause could be
 * satisfied dishonestly:
 *
 *  1. **`NOT_FOUND`, and explicitly NOT `FORBIDDEN`.** §10 §7.2: "do not disclose the endowment
 *     exists." A `FORBIDDEN` on endowment B tells the caller that B exists and that they are not on
 *     it — over four endowments and one family, that is an enumeration oracle.
 *  2. **The same context's own Prisma client independently returns `[]`.** The procedure boundary and
 *     the force-filter are two layers; if only one held, the clause would be one forgotten `.use()`
 *     from false.
 *  3. **Exactly ONE `ACCESS_DENIED` / `ACCESS` audit event, written OUTSIDE any transaction.** Read
 *     denials produce nothing in the force-filter by design, so the procedure boundary is the only
 *     path that can satisfy "the denied attempt is written to the audit trail" (BR-607, NFR-04).
 *  4. **A caller WITH a grant SUCCEEDS.** Without this the whole suite would pass over a ladder that
 *     denies everyone — the most comfortable possible false green.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_PREFIX,
  FIXTURE_WAQF_IDS,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  countAuditEvents,
  hasDatabase,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('EXIT-1 / AC-1 (scope denial + denial auditing)');

const createCaller = createCallerFactory(appRouter);

/** EXIT-1's subject: the SEEDED user with zero grants, documented "must never be given a grant". */
const UNSCOPED_USER = 'user-unscoped';

/**
 * AC-1's subject, which does NOT exist in the fixture and must be provisioned here.
 *
 * The seeded `user-accountant-001` has `onlyWaqfId: null` and therefore holds FINANCE on ALL FOUR
 * endowments — so it cannot demonstrate "one grant on A, none on B". Provisioned in-test rather than
 * added to the seed because `SEED_USERS` insertion order drives the audit `occurredAt` ordinals and
 * therefore the hash chain.
 */
const FINANCE_ON_A_ONLY = `${API_TEST_PREFIX}finance-a-only`;

describe.skipIf(!hasDatabase)('EXIT-1 · a scoped procedure denies a caller without a grant', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      {
        id: FINANCE_ON_A_ONLY,
        role: 'FINANCE',
        waqfIds: ['waqf-001'],
        // A FINANCE preset permission set. `endowment:waqf:read` is what the procedure demands, and
        // FINANCE legitimately holds it — so a refusal on waqf-003 can only be about the ENDOWMENT.
        permissions: ['endowment:waqf:read', 'finance:transaction:read'],
      },
    ]);
  });

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  it('every endowment is denied to user-unscoped, with NOT_FOUND and never FORBIDDEN', async () => {
    const ctx = await contextFor({ userId: UNSCOPED_USER, requestId: 'exit1-unscoped' });
    const caller = createCaller(ctx);

    // Sanity: this subject really does hold nothing. If a grant were ever added to the fixture, the
    // rest of this test would still "pass" while proving nothing — so assert the premise.
    expect(ctx.grants).toEqual([]);

    for (const waqfId of FIXTURE_WAQF_IDS) {
      let thrown: unknown;
      try {
        await caller.endowment.get({ waqfId });
      } catch (error) {
        thrown = error;
      }
      expect(thrown, `waqf ${waqfId} was NOT denied`).toBeDefined();
      const code = (thrown as { code?: string }).code;
      expect(code, `waqf ${waqfId}`).toBe('NOT_FOUND');
      // ⚠ Stated as a negation as well, because AC-1's and EXIT-1's mutation is exactly this swap.
      expect(code, `waqf ${waqfId} disclosed the endowment's existence`).not.toBe('FORBIDDEN');
    }
  });

  it("the same context's own Prisma client returns [] — fail closed, never the full table", async () => {
    const ctx = await contextFor({ userId: UNSCOPED_USER, requestId: 'exit1-forcefilter' });

    // The SECOND, independent enforcement. A caller with no grants must see nothing at all, on every
    // model — not "fewer rows", and certainly not the whole table.
    await expect(ctx.db.waqf.findMany({ select: { id: true } })).resolves.toEqual([]);
    await expect(ctx.db.beneficiary.findMany({ select: { id: true } })).resolves.toEqual([]);
    await expect(ctx.db.transaction.findMany({ select: { id: true } })).resolves.toEqual([]);
    await expect(ctx.db.approvalRequest.findMany({ select: { id: true } })).resolves.toEqual([]);

    // …and a direct, unique-key fetch of a KNOWN row is narrowed too: the unique-where rewrite is the
    // path that has to hold for `findUnique`, and it is the one Sprint 1 got wrong for writes.
    await expect(
      ctx.db.waqf.findUnique({ where: { id: 'waqf-001' }, select: { id: true } }),
    ).resolves.toBeNull();
  });

  it('each denial writes exactly ONE ACCESS_DENIED / ACCESS event, outside any transaction', async () => {
    const before = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      actorId: UNSCOPED_USER,
      waqfId: 'waqf-002',
    });

    const ctx = await contextFor({ userId: UNSCOPED_USER, requestId: 'exit1-audit' });
    await expect(createCaller(ctx).endowment.get({ waqfId: 'waqf-002' })).rejects.toThrow();

    const after = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      actorId: UNSCOPED_USER,
      waqfId: 'waqf-002',
    });

    // EXACTLY one. Not zero (the Sprint-1 state: `installScopeDenialAuditing` had no call sites and
    // read denials are not audited by the extension at all), and not two (which would mean the
    // boundary and the extension are both recording the same refusal).
    expect(after - before).toBe(1);
  });

  it('the denial event survives — it is written OUTSIDE the transaction it would have aborted', async () => {
    // The structural reason this test exists: a denial recorded INSIDE a `withAudit()` block joins the
    // transaction that the refusal is about to roll back, and disappears with it. So the assertion is
    // not "an event exists" but "an event exists AFTER a refusal that rolled nothing back" — which is
    // only observable because the count above went up rather than staying flat.
    const ctx = await contextFor({ userId: UNSCOPED_USER, requestId: 'exit1-outside-tx' });
    await expect(createCaller(ctx).endowment.get({ waqfId: 'waqf-004' })).rejects.toThrow();

    expect(
      await countAuditEvents({
        action: 'ACCESS_DENIED',
        category: 'ACCESS',
        actorId: UNSCOPED_USER,
        waqfId: 'waqf-004',
      }),
    ).toBeGreaterThanOrEqual(1);
  });

  /**
   * AL-1 · THE DENIAL ROW CAN VERIFY ITSELF — the property the denial trail is FOR.
   *
   * A denial recorded in a row that cannot be verified is not evidence. This asserts the two halves
   * that came apart in S4 (`packages/database/src/extensions/audit.ts`, and the sweep in
   * `packages/database/test/audit-content-reproducibility.integration.test.ts`):
   *
   *   · `before`/`after` are SQL NULL — asked of POSTGRES with `IS NULL`, because Prisma reports a
   *     JSON `{}` and a SQL NULL indistinguishably once read, and that coercion is exactly what hid
   *     the fault. A denial has no before-image; `{}` would state something different and false ("a
   *     diff with no changed keys").
   *   · the row's `rowHash` recomputes from the content the database now holds, using the SAME
   *     `recomputeRowHash()` the G-1 chain verifier uses.
   *
   * MEASURED (2026-08-16): denials written by the Next.js server stored `{}`/`{}` while their hash
   * had been computed over `null` — 2 of 2, unverifiable and (append-only) unrepairable — while
   * denials written by this very suite, same procedure, same writer, stored NULL and verified. The
   * fault was a `Prisma.DbNull` sentinel losing its identity under the bundler, so it was invisible
   * to every assertion that ran in a plain Node realm. This one is realm-independent: it reads the
   * stored bytes back and re-derives the hash, whoever wrote them.
   */
  it('AL-1 · a denial row stores SQL NULL for before/after and reproduces its own rowHash', async () => {
    const ctx = await contextFor({ userId: UNSCOPED_USER, requestId: 'al1-denial-row' });
    await expect(createCaller(ctx).endowment.get({ waqfId: 'waqf-001' })).rejects.toThrow();

    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<
      { id: bigint; beforeIsSqlNull: boolean; afterIsSqlNull: boolean; beforeText: string | null }[]
    >(
      `SELECT "id", "before" IS NULL AS "beforeIsSqlNull", "after" IS NULL AS "afterIsSqlNull",
              "before"::text AS "beforeText"
         FROM "audit_event"
        WHERE "action" = 'ACCESS_DENIED' AND "actorId" = '${UNSCOPED_USER}'
        ORDER BY "id" DESC LIMIT 1`,
    );
    const row = rows[0];
    if (row === undefined) throw new Error('the denial wrote no audit row at all');

    expect(
      { beforeIsSqlNull: row.beforeIsSqlNull, afterIsSqlNull: row.afterIsSqlNull },
      `audit_event ${String(row.id)} stored before=${row.beforeText ?? 'SQL NULL'} — an empty ` +
        'object here is AL-1: the writer hashed `null` and persisted `{}`, and the row can then ' +
        'never verify and never be repaired.',
    ).toEqual({ beforeIsSqlNull: true, afterIsSqlNull: true });

    const { recomputeRowHash } = await import('@qmulate/database/hash-chain');
    const stored = (await prisma.auditEvent.findUniqueOrThrow({
      where: { id: row.id },
    })) as unknown as Parameters<typeof recomputeRowHash>[0] & {
      prevHash: string;
      rowHash: string;
    };
    expect(recomputeRowHash(stored, stored.prevHash)).toBe(stored.rowHash);
  });

  it('AC-1 · a grant on A does not reach B, C or D — same family, different endowment', async () => {
    // GIVEN a finance user with ONE active grant, on waqf-001 of client-001, which also owns
    // waqf-002/003/004. Same family does NOT imply access: scope is the endowment, never the client
    // (§10 principle 2).
    const ctx = await contextFor({ userId: FINANCE_ON_A_ONLY, requestId: 'ac1-cross-endowment' });
    expect(ctx.grants.map((grant) => grant.waqfId)).toEqual(['waqf-001']);

    const caller = createCaller(ctx);

    // A: succeeds. This is the half that stops the suite passing over a ladder that denies everyone.
    const allowed = await caller.endowment.get({ waqfId: 'waqf-001' });
    expect(allowed.waqfId).toBe('waqf-001');
    expect(allowed.found).toBe(true);

    // B, C, D: NOT_FOUND.
    for (const waqfId of ['waqf-002', 'waqf-003', 'waqf-004'] as const) {
      let thrown: unknown;
      try {
        await caller.endowment.get({ waqfId });
      } catch (error) {
        thrown = error;
      }
      expect((thrown as { code?: string }).code, waqfId).toBe('NOT_FOUND');
      expect((thrown as { code?: string }).code, waqfId).not.toBe('FORBIDDEN');
    }

    // …and the force-filter agrees independently: the caller's own client sees ONLY waqf-001, and a
    // waqf-003-owned transaction id is invisible even when named directly.
    await expect(ctx.db.waqf.findMany({ select: { id: true } })).resolves.toEqual([
      { id: 'waqf-001' },
    ]);
    const bRows = await ctx.db.transaction.findMany({
      where: { waqfId: 'waqf-003' },
      select: { id: true },
    });
    expect(bRows).toEqual([]);
  });

  it('AC-1 · the cross-endowment attempt is audited against the endowment that was asked for', async () => {
    const before = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      actorId: FINANCE_ON_A_ONLY,
      waqfId: 'waqf-003',
    });

    const ctx = await contextFor({ userId: FINANCE_ON_A_ONLY, requestId: 'ac1-audit' });
    await expect(createCaller(ctx).endowment.get({ waqfId: 'waqf-003' })).rejects.toThrow();

    const after = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      actorId: FINANCE_ON_A_ONLY,
      waqfId: 'waqf-003',
    });
    expect(after - before).toBe(1);
  });

  it('a granted caller who lacks the VERB gets FORBIDDEN, not NOT_FOUND', async () => {
    // The complementary refusal, asserted so the two are never collapsed into one. Existence is
    // already disclosed by the grant, so there is nothing left to protect — and a caller told
    // NOT_FOUND about an endowment they demonstrably hold would have no way to understand it.
    const ctx = await contextFor({ userId: FINANCE_ON_A_ONLY, requestId: 'ac1-verb' });

    // `beneficiary.list` demands `beneficiary:beneficiary:read`, which this subject's grant does not
    // carry (its permissions are endowment:waqf:read + finance:transaction:read).
    let thrown: unknown;
    try {
      await createCaller(ctx).beneficiary.list({ waqfId: 'waqf-001' });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: string }).code).toBe('FORBIDDEN');
  });

  it('an UNAUTHENTICATED caller is refused before scope is ever considered', async () => {
    const ctx = await contextFor({ userId: null, requestId: 'exit1-anon' });
    let thrown: unknown;
    try {
      await createCaller(ctx).endowment.get({ waqfId: 'waqf-001' });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: string }).code).toBe('UNAUTHORIZED');

    // …and the public procedure still works, so the refusal is about authorization and not a broken
    // transport.
    await expect(createCaller(ctx).health({})).resolves.toMatchObject({ status: 'ok' });
  });

  it('a caller who has not enrolled TOTP is refused, whatever they hold — the gate is universal', async () => {
    const ctx = await contextFor({
      userId: FINANCE_ON_A_ONLY,
      status: 'totp-enrolment-required',
      requestId: 'exit1-enrolment',
    });
    let thrown: unknown;
    try {
      await createCaller(ctx).endowment.get({ waqfId: 'waqf-001' });
    } catch (error) {
      thrown = error;
    }
    // FORBIDDEN, and the machine code is on the error's cause so a client can branch on it.
    expect((thrown as { code?: string }).code).toBe('FORBIDDEN');
    expect(String((thrown as { message?: string }).message)).toContain('TOTP_ENROLMENT_REQUIRED');
  });
});
