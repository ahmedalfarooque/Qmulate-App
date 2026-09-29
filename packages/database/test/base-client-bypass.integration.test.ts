// QMULATE — `getBasePrismaClient()` was a PUBLIC BYPASS of all three cross-cutting guarantees.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT WAS REPRODUCED (S2 round 4), FROM THE PACKAGE'S PUBLIC BARREL, ON A SEEDED DATABASE
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `getBasePrismaClient()` was re-exported at `src/index.ts:91` and returned the RAW, unextended
// Prisma client — no force filter (NFR-05), no `DOMAIN_WRITE_POLICIES` column gate, no audit spine
// (NFR-04) — while `src/client.ts`'s own header told the reader "THERE IS EXACTLY ONE WAY TO GET A
// DATABASE HANDLE … so there is no route to a client that has skipped the three cross-cutting
// guarantees". Two defects in one place: a live bypass, and a comment asserting it did not exist.
//
// Driven as `user-unscoped` — a REAL seeded USER seat with zero grants, the V-5 negative subject:
//
//   scoped  transaction.findMany()             -> []                        (correct refusal)
//   BASE    transaction.findMany()             -> 5 rows, waqf-001 + waqf-003
//   BASE    beneficiary.findMany()             -> 6 rows across 3 endowments
//   BASE    waqfAccessGrant.findMany()         -> 17 rows: the whole access matrix
//   scoped  asset.update({ valuationSar })     -> ForbiddenScopeError (column gate)
//   BASE    asset.update({ valuationSar })     -> PERMITTED. 18,000,000 -> 1.
//                                                 audit_event 132 -> 132. DELTA 0.
//   BASE    setting.update({ value })          -> PERMITTED, audit delta 0
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE PINS — INCLUDING, DELIBERATELY, WHAT IS STILL OPEN
// ═══════════════════════════════════════════════════════════════════════════════════════════
// CLOSED and asserted below: every Prisma-delegate WRITE verb on every non-identity model, through
// the top-level handle, through `$transaction`, through `$extends`, and through an open
// `withAudit()` block; plus `new PrismaClient()` from the barrel.
//
// STILL OPEN and asserted below as OPEN, on purpose: cross-endowment READS, and raw SQL. They are
// asserted so that a later reader who deletes the residual from a comment still fails a test, and
// so nobody re-derives "the base client is safe" from a green suite. Closing the read half needs
// `packages/api/src/context.ts` and both integration harnesses migrated to purpose-built accessors;
// closing raw SQL is ADR-0008's E12 privilege separation. Neither is in this change's remit.
//
// EVERY REFUSAL BELOW IS PROVEN BY THE ROW, NOT ONLY BY THE ERROR. A guard that raises AFTER the
// statement committed is not a guard, and round 3 caught four probes that read as refused for
// reasons unrelated to the control. So each write attempt also re-reads its target and asserts the
// value did not move, and each is preceded by a POSITIVE control showing the same statement really
// does work on the sanctioned path.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  basePrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  hasDatabase,
  privilegedPrisma,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('the getBasePrismaClient() bypass (NFR-04 / NFR-05)');

/** The untyped surface these probes need — `getBasePrismaClient()` returns a full `PrismaClient`. */
interface AnyDelegate {
  findMany: (args?: unknown) => Promise<Record<string, unknown>[]>;
  findUniqueOrThrow: (args: unknown) => Promise<Record<string, unknown>>;
  findFirstOrThrow: (args?: unknown) => Promise<Record<string, unknown>>;
  count: (args?: unknown) => Promise<number>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  updateMany: (args: unknown) => Promise<unknown>;
  upsert: (args: unknown) => Promise<unknown>;
  delete: (args: unknown) => Promise<unknown>;
  deleteMany: (args?: unknown) => Promise<unknown>;
}
interface AnyClient {
  [model: string]: AnyDelegate | unknown;
  $transaction: (fn: (tx: AnyClient) => Promise<unknown>) => Promise<unknown>;
  $extends: (extension: unknown) => AnyClient;
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}

const CORPUS_ASSET = 'asset-001';
/** The seeded valuation of `asset-001` — SAR 18,000,000. Pinned so a moved row is visible. */
const CORPUS_VALUATION = '18000000';

describe.skipIf(!hasDatabase)('getBasePrismaClient(): the unextended handle', () => {
  // The barrel, reached untyped: these probes call `withAudit`, `runAuditedTransaction`,
  // `makeSystemContext`, `ALL_MODELS` and the shadowed `PrismaClient` through one handle. Test files
  // are exempt from `no-explicit-any` in this repo's ESLint config, so no directive is needed here.
  let db: any;
  let base: AnyClient;

  beforeAll(async () => {
    ensureSeeded();
    db = await databaseModule();
    base = (await basePrisma()) as unknown as AnyClient;
  });

  afterAll(async () => {
    // ⚠ CLEANS UP WHAT A *REGRESSED* GUARD WOULD HAVE LET THROUGH, not what this file writes when
    // green. When the guard holds, every statement below deletes nothing. It exists because a
    // mutation run — or a real regression — commits the forged grant and the probe session, and a
    // leftover `NAZIR` grant on `waqf-001` would silently change the authority answer for every
    // later integration file that shares this database. Raw SQL: no trigger, no audit, no residue.
    // ⚠ ON THE PRIVILEGED CONNECTION (ADR-0008 round 6). `base` is the APP connection, which is the
    // whole point of this file — and since privilege separation it holds no DELETE on
    // `waqf_access_grant` at all, so this cleanup would fail with 42501 and abort the hook. The
    // cleanup is scaffolding, not an assertion, so it belongs on the owner connection; every claim in
    // this file still runs on `base`.
    const cleanup = await privilegedPrisma();
    await cleanup.$executeRawUnsafe(
      `DELETE FROM "waqf_access_grant" WHERE "id" = 'base-client-forged-grant'`,
    );
    await cleanup.$executeRawUnsafe(
      `DELETE FROM "session" WHERE "id" = 'base-client-probe-session'`,
    );
    await closeDatabase();
  });

  const delegate = (model: string): AnyDelegate => base[model] as AnyDelegate;

  const valuation = async (): Promise<string> =>
    String(
      (
        await delegate('asset').findUniqueOrThrow({
          where: { id: CORPUS_ASSET },
          select: { valuationSar: true },
        })
      ).valuationSar,
    );

  const auditTotal = async (): Promise<number> => Number(await delegate('auditEvent').count());

  /**
   * The seat the reproduction used: a real seeded user with NO grant at all. Built as a bare object
   * literal on purpose — that is how an adversary reaches `createPrismaClient`, and the fail-closed
   * contract has to hold for it.
   */
  const unscopedContext = () => ({
    actorId: 'user-unscoped',
    actorType: 'USER' as const,
    authorizedWaqfIds: [] as string[],
    requestId: 'base-client-bypass',
  });

  describe('the governed write is refused, and the row proves it', () => {
    it('POSITIVE CONTROL: the same update succeeds on the sanctioned path', async () => {
      // Not a formality. If this failed, every refusal below could be refused for some unrelated
      // reason — a bad `where`, a missing column, a foreign key — and the suite would still be green.
      const before = await valuation();
      const events = await auditTotal();

      await expect(
        db.withAudit(
          db.makeSystemContext({
            actorId: 'base-client-positive',
            authorizedWaqfIds: ['waqf-001'],
          }),
          async (tx: AnyClient) => {
            await (tx.asset as AnyDelegate).update({
              where: { id: CORPUS_ASSET },
              data: { valuationSar: '17999999.00' },
            });
            // Roll the whole thing back: this file must leave the fixture — and the audit chain's
            // event count, which other files assert exactly — byte-identical.
            throw new Error('POSITIVE_CONTROL_ROLLBACK');
          },
        ),
      ).rejects.toThrow('POSITIVE_CONTROL_ROLLBACK');

      expect(await valuation()).toBe(before);
      expect(await auditTotal()).toBe(events);
    });

    it.each([
      [
        'update',
        () =>
          delegate('asset').update({ where: { id: CORPUS_ASSET }, data: { valuationSar: '1.00' } }),
      ],
      [
        'updateMany',
        () =>
          delegate('asset').updateMany({
            where: { id: CORPUS_ASSET },
            data: { valuationSar: '1.00' },
          }),
      ],
      [
        'upsert',
        () =>
          delegate('asset').upsert({
            where: { id: CORPUS_ASSET },
            create: { id: CORPUS_ASSET, waqfId: 'waqf-001', kind: 'LAND', nameAr: 'x' },
            update: { valuationSar: '1.00' },
          }),
      ],
      ['delete', () => delegate('asset').delete({ where: { id: CORPUS_ASSET } })],
      ['deleteMany', () => delegate('asset').deleteMany({ where: { id: CORPUS_ASSET } })],
    ])('refuses asset.%s and leaves the corpus valuation untouched', async (_verb, run) => {
      expect(await valuation()).toBe(CORPUS_VALUATION);
      const events = await auditTotal();

      await expect(run()).rejects.toMatchObject({ code: 'UNEXTENDED_CLIENT_WRITE' });

      expect(await valuation()).toBe(CORPUS_VALUATION);
      expect(await auditTotal()).toBe(events);
    });

    it('refuses the forged NAZIR grant that ADR-0008 reproduced through raw SQL', async () => {
      const grants = await delegate('waqfAccessGrant').count();

      await expect(
        delegate('waqfAccessGrant').create({
          data: {
            id: 'base-client-forged-grant',
            userId: 'user-accountant-001',
            waqfId: 'waqf-001',
            role: 'NAZIR',
            grantedByUserId: 'user-nazir-001',
            validFrom: new Date(),
            permissions: [],
            dataScopes: [],
          },
        }),
      ).rejects.toMatchObject({ code: 'UNEXTENDED_CLIENT_WRITE' });

      expect(await delegate('waqfAccessGrant').count()).toBe(grants);
    });

    it('refuses a delete of the audit trail itself', async () => {
      const events = await auditTotal();
      await expect(delegate('auditEvent').deleteMany({})).rejects.toMatchObject({
        code: 'UNEXTENDED_CLIENT_WRITE',
      });
      expect(await auditTotal()).toBe(events);
    });

    it('covers every non-identity model, not a hand-picked few', async () => {
      // Derived from the same `ALL_MODELS` the guard derives from, so a model added to the schema is
      // guarded by default. The five identity tables are the declared exception and are asserted to
      // be WRITABLE in their own test below — the allowlist is proven, not assumed.
      const identity = new Set(['user', 'session', 'account', 'verification', 'twoFactor']);
      const guarded = (db.ALL_MODELS as readonly string[])
        .map((model) => model.charAt(0).toLowerCase() + model.slice(1))
        .filter((name) => !identity.has(name));

      expect(guarded.length).toBeGreaterThan(30);

      for (const model of guarded) {
        await expect(
          (base[model] as AnyDelegate).updateMany({ where: { id: '__no_such_row__' }, data: {} }),
          `${model}.updateMany must be refused`,
        ).rejects.toMatchObject({ code: 'UNEXTENDED_CLIENT_WRITE' });
      }
    });
  });

  describe('the laundering routes are closed too', () => {
    it('refuses the write inside base.$transaction()', async () => {
      await expect(
        base.$transaction((tx) =>
          (tx.asset as AnyDelegate).update({
            where: { id: CORPUS_ASSET },
            data: { valuationSar: '7.00' },
          }),
        ),
      ).rejects.toMatchObject({ code: 'UNEXTENDED_CLIENT_WRITE' });
      expect(await valuation()).toBe(CORPUS_VALUATION);
    });

    it('refuses $extends, which would otherwise strip the guard in one call', async () => {
      expect(() => base.$extends({})).toThrow(/UNEXTENDED client|\$extends/);
      expect(await valuation()).toBe(CORPUS_VALUATION);
    });

    it('refuses the write even while an audited transaction is open (the ALS is NOT the check)', async () => {
      // The exemption for the audit spine is an OBJECT-IDENTITY check on `state.rawTx`, not
      // "is a transaction open". If it were the latter, any caller could open `withAudit()` and
      // write anything unaudited through this handle inside it. That is this assertion.
      const events = await auditTotal();
      await expect(
        db.withAudit(db.makeSystemContext({ actorId: 'base-client-als' }), () =>
          delegate('asset').update({ where: { id: CORPUS_ASSET }, data: { valuationSar: '9.00' } }),
        ),
      ).rejects.toMatchObject({ code: 'UNEXTENDED_CLIENT_WRITE' });
      expect(await valuation()).toBe(CORPUS_VALUATION);
      expect(await auditTotal()).toBe(events);
    });

    it('refuses `new PrismaClient()` reached through the barrel', () => {
      // The star re-export in `src/index.ts` carried the constructor out with the model types, so
      // the ESLint ban on `@prisma/client` was satisfied by importing the class from
      // `@qmulate/database`. MEASURED before the shadow: `new PrismaClient().asset.update(…)` moved
      // asset-002 to 2.00 with an audit delta of 0, on its own pool.
      expect(() => new db.PrismaClient()).toThrow(/refused/i);
    });

    it('does not re-export runAuditedTransaction, which hands out the raw transaction client', () => {
      // MEASURED after the write guard shipped, through the guarded handle:
      //   runAuditedTransaction(getBasePrismaClient(), makeSystemContext(), async (s) =>
      //     s.rawTx.asset.update({ where: { id: 'asset-002' }, data: { valuationSar: '11.00' } }))
      //   -> PERMITTED. asset-002: 42,000,000 -> 11. audit_event DELTA 0.
      // It is exempt BY CONSTRUCTION — `state.rawTx` is the one receiver the guard must let write,
      // because that is how the audit spine records anything at all. So the only way to close it is
      // to stop handing it out. `withAudit()` is the public equivalent and is still exported.
      expect(db.runAuditedTransaction).toBeUndefined();
      expect(typeof db.withAudit).toBe('function');
    });

    it('does not re-export the denial-trail off switch', () => {
      // MEASURED: `ACCESS_DENIED` delta was 1 with the default handler and 0 after one call to
      // `setScopeDenialHandler(() => {})`, process-wide. Nothing in the monorepo imported it.
      expect(db.setScopeDenialHandler).toBeUndefined();
      expect(typeof db.installScopeDenialAuditing).toBe('function');
    });
  });

  describe('the honest callers still work — the guard is useless if it breaks them', () => {
    it('permits the identity-plane writes better-auth performs on the login path', async () => {
      // `packages/auth/src/server.ts` hands this very client to better-auth's Prisma adapter. If
      // `session.create` were refused, nobody could log in.
      const session = delegate('session');
      await session.create({
        data: {
          id: 'base-client-probe-session',
          token: 'base-client-probe-token',
          userId: 'user-nazir-001',
          expiresAt: new Date(Date.now() + 60_000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });
      expect(await session.count({ where: { id: 'base-client-probe-session' } })).toBe(1);
      await session.delete({ where: { id: 'base-client-probe-session' } });
      expect(await session.count({ where: { id: 'base-client-probe-session' } })).toBe(0);
    });

    it('permits the grant-resolution read packages/api makes before a context exists', async () => {
      expect((await delegate('waqfAccessGrant').findMany()).length).toBeGreaterThan(0);
      expect((await delegate('membership').findMany()).length).toBeGreaterThan(0);
    });

    it('permits the audit spine to re-issue a mutation into its own transaction', async () => {
      // THE COMPATIBILITY CASE THAT MATTERS MOST. `src/seed.ts` passes this guarded handle to
      // `runAuditedTransaction`, whose `state.rawTx` is where the audit extension re-issues every
      // one of the seed's audited writes. If the identity exemption were wrong, `pnpm db:seed`
      // would fail outright — which is also why `ensureSeeded()` in `beforeAll` is itself evidence.
      // Rolled back, so no row and no event survives.
      //
      // Reached through the EXTENSION MODULE, not the barrel: `runAuditedTransaction` was removed
      // from the public surface in this change because `state.rawTx` is an unaudited write door (see
      // the note at its former export site). The in-package callers import it exactly this way.
      const { runAuditedTransaction } = await import('../src/extensions/audit.js');

      await expect(
        runAuditedTransaction(
          base as never,
          db.makeSystemContext({ actorId: 'base-client-spine' }),
          // ⚠ THE PARAMETER IS NOT ANNOTATED. It used to be declared `{ rawTx: AnyClient }`, which
          // is not assignable to `runAuditedTransaction`'s own `AuditTxState` — an error nothing
          // reported, because `tsconfig.json` typechecked `tests/**` and this directory is `test/`
          // (V3). Inferring it from the callee keeps the two in step; the narrowing to a delegate
          // stays explicit on the next line, where it is the thing being said.
          async (state) => {
            await ((state.rawTx as unknown as AnyClient).asset as AnyDelegate).update({
              where: { id: CORPUS_ASSET },
              data: { valuationSar: '12345.00' },
            });
            throw new Error('SPINE_CONTROL_ROLLBACK');
          },
        ),
      ).rejects.toThrow('SPINE_CONTROL_ROLLBACK');

      expect(await valuation()).toBe(CORPUS_VALUATION);
    });
  });

  describe('WHAT IS STILL OPEN — pinned as a residual so it cannot be quietly reclassified', () => {
    it('STILL BYPASSES THE FORCE FILTER ON READS (leg (a) of the reproduction)', async () => {
      // A zero-grant seat reads nothing through its own client and everything through this one.
      const scoped = db.createPrismaClient(unscopedContext());
      expect(await scoped.transaction.findMany({ select: { id: true } })).toEqual([]);

      const rows = await delegate('transaction').findMany({ select: { id: true, waqfId: true } });
      expect(rows.length).toBeGreaterThan(0);
      expect(new Set(rows.map((row) => row.waqfId)).size).toBeGreaterThan(1);

      // If this assertion ever starts FAILING, the read half has been closed — delete the residual
      // from `client.ts` and from the build plan in the same change, and do not leave this test
      // inverted. It exists so "closed" is a decision someone made, never an assumption.
    });

    it('STILL BYPASSES EVERY GUARD THROUGH RAW SQL (ADR-0008, closing in E12)', async () => {
      const events = await auditTotal();
      const affected = await base.$executeRawUnsafe(
        `UPDATE "asset" SET "valuationSar" = "valuationSar" WHERE "id" = '${CORPUS_ASSET}'`,
      );
      expect(affected).toBe(1);
      // A no-op value on purpose: the point is that the STATEMENT ran unrecorded, not to move money.
      expect(await auditTotal()).toBe(events);
      expect(await valuation()).toBe(CORPUS_VALUATION);
    });
  });
});
