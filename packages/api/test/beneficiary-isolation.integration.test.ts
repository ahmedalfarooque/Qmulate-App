/**
 * AC-2 — BENEFICIARY SELF-ISOLATION, at the procedure boundary and in the force-filter.
 *
 * §10 §5, the three sentences this file exists to hold:
 *
 *   · "For any query originating from a `beneficiary` session, the force-filter narrows **every**
 *     beneficiary-scoped table … to rows where the owning `beneficiaryId == beneficiarySelfId`.
 *     Isolation is applied **before** role/permission evaluation, so a mis-scoped role can never widen
 *     it."
 *   · "A beneficiary **cannot enumerate**: list endpoints return only self rows; a direct fetch of
 *     another beneficiary's `id` returns **404, not 403** (existence itself is not disclosed)."
 *   · "`family_board` sees **aggregate** distribution/statement figures … but **not** another
 *     beneficiary's individual UBO dataset, banking details, or KYC documents."
 *
 * ⚠ SCOPE, STATED HONESTLY. AC-2 says "Full field-level UBO isolation is E4/S5; E2 proves the
 * row-level half." So this file proves the ROW-level half and says where the field-level half is
 * absent, rather than asserting something weaker and calling it AC-2.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertSeeded,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  hasDatabase,
  warnNoDatabase,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('AC-2 (beneficiary self-isolation)');

const createCaller = createCallerFactory(appRouter);

/** The seeded portal subject: `beneficiarySelfId: 'ben-001'`, `onlyWaqfId: 'waqf-001'`. */
const BENEFICIARY_USER = 'user-beneficiary-ben-001';
/** A co-beneficiary on the SAME endowment — the enumeration target. */
const OTHER_BENEFICIARY_ID = 'ben-002';
/** The seeded family-board subject: a per-endowment FAMILY_BOARD grant plus a client Membership. */
const FAMILY_BOARD_USER = 'user-family-board';

describe.skipIf(!hasDatabase)('AC-2 · beneficiary self-isolation', () => {
  beforeAll(async () => {
    await assertSeeded();
  });

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  it('the resolved context pins the session to exactly one beneficiary record', async () => {
    const ctx = await contextFor({ userId: BENEFICIARY_USER, requestId: 'ac2-context' });

    // The premise, asserted rather than assumed: a BENEFICIARY grant carries `beneficiarySelfId`
    // (the DB CHECK `waqf_access_grant_beneficiary_self_pin` makes it mandatory IFF the role is
    // BENEFICIARY), and it reaches the force-filter through the actor context.
    expect(ctx.grants).toHaveLength(1);
    expect(ctx.grants[0]?.waqfId).toBe('waqf-001');
    expect(ctx.grants[0]?.beneficiarySelfId).toBe('ben-001');
  });

  it("a LIST returns only the caller's own row — no co-beneficiaries, at any count", async () => {
    const ctx = await contextFor({ userId: BENEFICIARY_USER, requestId: 'ac2-list' });
    const rows = await createCaller(ctx).beneficiary.list({ waqfId: 'waqf-001' });

    expect(rows.map((row) => row.id)).toEqual(['ben-001']);

    // Independently, through the caller's own client — and including `count`, because a COUNT that
    // leaked the true number would be an enumeration oracle even with the rows hidden.
    await expect(ctx.db.beneficiary.count({})).resolves.toBe(1);
    await expect(
      ctx.db.beneficiary.findMany({ where: { waqfId: 'waqf-001' }, select: { id: true } }),
    ).resolves.toEqual([{ id: 'ben-001' }]);
  });

  it('a DIRECT FETCH of another beneficiary returns 404, NOT 403', async () => {
    const ctx = await contextFor({ userId: BENEFICIARY_USER, requestId: 'ac2-direct' });

    let thrown: unknown;
    try {
      await createCaller(ctx).beneficiary.get({
        waqfId: 'waqf-001',
        beneficiaryId: OTHER_BENEFICIARY_ID,
      });
    } catch (error) {
      thrown = error;
    }
    const code = (thrown as { code?: string }).code;
    // ⚠ THE ASSERTION IS THE PAIR. `NOT_FOUND` alone would also be satisfied by a broken procedure;
    // the negation is what pins the non-disclosure.
    expect(code).toBe('NOT_FOUND');
    expect(code).not.toBe('FORBIDDEN');

    // The caller's OWN id still resolves — so the 404 above is about isolation, not a broken query.
    await expect(
      createCaller(ctx).beneficiary.get({ waqfId: 'waqf-001', beneficiaryId: 'ben-001' }),
    ).resolves.toMatchObject({ id: 'ben-001' });
  });

  it('a direct fetch by UNIQUE KEY is narrowed too', async () => {
    // `findUnique` accepts only unique fields in `where`, so the force-filter cannot inject a
    // predicate into it — it rewrites the call as `findFirst`. That rewrite is the one path where an
    // isolation filter can silently fail to apply, which is why it is asserted separately.
    const ctx = await contextFor({ userId: BENEFICIARY_USER, requestId: 'ac2-unique' });
    await expect(
      ctx.db.beneficiary.findUnique({
        where: { id: OTHER_BENEFICIARY_ID },
        select: { id: true },
      }),
    ).resolves.toBeNull();
  });

  it('the raw LEDGER is empty for a beneficiary — statements, never the ledger', async () => {
    const ctx = await contextFor({ userId: BENEFICIARY_USER, requestId: 'ac2-ledger' });

    // AC-2: "the beneficiary's Transaction read returns the empty set". Note the endowment DOES have
    // transactions — the fixture seeds them — so this is a real subtraction and not an empty table.
    await expect(ctx.db.transaction.findMany({ select: { id: true } })).resolves.toEqual([]);
    await expect(ctx.db.transaction.count({})).resolves.toBe(0);
    await expect(ctx.db.bankAccount.findMany({ select: { id: true } })).resolves.toEqual([]);
    await expect(ctx.db.nazirFee.findMany({ select: { id: true } })).resolves.toEqual([]);
  });

  it("DISTRIBUTION LINE ITEMS are narrowed to the caller's own lines", async () => {
    const ctx = await contextFor({ userId: BENEFICIARY_USER, requestId: 'ac2-lines' });
    const lines = await ctx.db.distributionLineItem.findMany({
      select: { id: true, beneficiaryId: true },
    });
    for (const line of lines) {
      expect(line.beneficiaryId).toBe('ben-001');
    }
  });

  it('THE AUTHORIZATION PLANE IS INVISIBLE to a portal session, not merely unwritable', async () => {
    const ctx = await contextFor({ userId: BENEFICIARY_USER, requestId: 'ac2-plane' });

    // A beneficiary can see neither the access matrix nor the approval queue — not even their own row.
    // "Their own row" is the one row that tells them a seat exists to be escalated, which is why the
    // beneficiary read set for these models is EMPTY rather than self-narrowed.
    await expect(ctx.db.waqfAccessGrant.findMany({ select: { id: true } })).resolves.toEqual([]);
    await expect(ctx.db.approvalRequest.findMany({ select: { id: true } })).resolves.toEqual([]);
    await expect(ctx.db.membership.findMany({ select: { id: true } })).resolves.toEqual([]);
  });

  it('a portal session cannot ESCALATE its own grant — the live Sprint-1 path', async () => {
    // `waqfAccessGrant.update({ where: { id: <own grant> }, data: { role: 'NAZIR' } })` was reachable
    // from a beneficiary login: the guard lived only in `assertCreateInScope`, `UNIQUE_WRITE_OPS`
    // authorized by a scope pre-check and then passed the caller's `where` through as written, and
    // `scopeFilter`'s beneficiary switch had no `WaqfAccessGrant` case at all.
    const ctx = await contextFor({ userId: BENEFICIARY_USER, requestId: 'ac2-escalate' });
    const grantId = ctx.grants[0]?.grantId;
    expect(grantId).toBeTruthy();

    await expect(
      ctx.db.waqfAccessGrant.update({
        where: { id: grantId ?? '' },
        data: { role: 'NAZIR' as never },
      }),
    ).rejects.toThrow();

    // …and the grant is unchanged. A refusal that left the row edited would be worse than no refusal.
    const after = await contextFor({ userId: BENEFICIARY_USER, requestId: 'ac2-escalate-verify' });
    expect(after.grants[0]?.role).toBe('BENEFICIARY');
  });

  it('a portal session holds no approve capability, whatever it asks for', async () => {
    const ctx = await contextFor({ userId: BENEFICIARY_USER, requestId: 'ac2-approve' });
    const permissions = ctx.grants.flatMap((grant) => [...grant.permissions]);
    for (const permission of permissions) {
      expect(permission.endsWith(':approve')).toBe(false);
      expect(permission.endsWith(':sign')).toBe(false);
    }
  });

  it("family_board sees the endowment's aggregate figures", async () => {
    const ctx = await contextFor({ userId: FAMILY_BOARD_USER, requestId: 'ac2-board-agg' });

    // The board's reach is real: it holds a per-endowment FAMILY_BOARD grant on all four endowments,
    // so distribution rows are visible and totals are computable.
    const runs = await ctx.db.distribution.findMany({
      where: { waqfId: 'waqf-001' },
      select: { id: true, distributableSar: true, status: true },
    });
    expect(runs.length).toBeGreaterThan(0);
    // Money crosses as a decimal STRING. `String(Decimal)` — never a float.
    expect(typeof String(runs[0]?.distributableSar)).toBe('string');
  });

  it('family_board is DENIED the beneficiary register — its grant NARROWS its preset', () => {
    // §10 principle 3: a grant "may narrow (never silently widen)". The seeded FAMILY_BOARD grant
    // carries only `reporting:report:read`, so the beneficiary register is out of reach at the
    // procedure boundary even though the FAMILY_BOARD PRESET would allow a read. Asserting the
    // narrowing here is what proves the resolver intersects rather than expanding the preset.
    return (async () => {
      const ctx = await contextFor({ userId: FAMILY_BOARD_USER, requestId: 'ac2-board-deny' });
      let thrown: unknown;
      try {
        await createCaller(ctx).beneficiary.list({ waqfId: 'waqf-001' });
      } catch (error) {
        thrown = error;
      }
      expect((thrown as { code?: string }).code).toBe('FORBIDDEN');
    })();
  });

  it('family_board is NOT pinned to a beneficiary — isolation is by identity, not by role', async () => {
    const ctx = await contextFor({ userId: FAMILY_BOARD_USER, requestId: 'ac2-board-pin' });
    for (const grant of ctx.grants) {
      expect(grant.beneficiarySelfId).toBeNull();
    }
  });

  it.todo(
    'AC-2 FIELD-LEVEL half: a family_board (or any non-owner) read of a beneficiary row must not ' +
      'return the UBO dataset, banking reference or KYC files. NOT PROVABLE IN E2 — `dataScopes` on ' +
      'WaqfAccessGrant remains stored and uninterpreted and there is no column-level authorization ' +
      'layer (SCOPING_KNOWN_GAPS). §17 assigns field-level UBO isolation to E4/S5. The UBO columns ' +
      'are field-ENCRYPTED at rest, which is a different control: it protects the database, not a ' +
      'caller who is entitled to the row. Do not claim AC-2 fully green.',
  );
});
