/**
 * Regressions for defects found by ADVERSARIAL REVIEW of Sprint 1, after the sprint was already
 * "CI-green". Each one was a live hole that the existing suite passed straight over — which is the
 * point: these tests exist because the absence of a test is what let each defect ship.
 *
 * Every case below FAILED (or silently succeeded when it should have failed) before its fix.
 *
 *   1. `session_replication_role = 'replica'` — one non-DDL `SET` skipped every `tgenabled='O'`
 *      trigger, so `UPDATE`/`DELETE`/`TRUNCATE` on `audit_event` committed. Gate G-1's DB-layer
 *      clause was simply not true. Fixed with `ENABLE ALWAYS` on every guard.
 *   2. Chain-head rewind — the head was freely UPDATE-able, so deleting the newest N events and
 *      pointing the head at the new tail produced a database that `verifyChain()` called clean.
 *      Fixed with a forward-only trigger.
 *   3. Scoped writes — the scoping extension AND-ed its filter into a unique-only `where`, which
 *      Prisma rejects, so EVERY `update`/`upsert`/`delete` threw for a real caller. Only the
 *      bypassed system context (the seed) worked, which is why nothing noticed.
 *   4. Document retention — retention could be shortened and a legal hold cleared by a plain
 *      `UPDATE`, after which the DELETE guard permitted the delete it was meant to prevent.
 */
import { beforeAll, describe, expect, it } from 'vitest';

import { privilegedPrisma, databaseModule, hasDatabase } from './setup.js';

/**
 * The privileged handle, typed to exactly what this file uses.
 *
 * ⚠ IT WAS `any` UNTIL S4/E3 ROUND 2 (V3). `tsconfig.json` included `tests/**` — with an s — while
 * the directory is `test/`, so nothing here was typechecked and the `any` cost nothing visible. It
 * cost two real things: `prisma.$queryRawUnsafe<Row[]>(…)` on an `any` is TS2347 (a call on `any`
 * may not take type arguments), so the row type was SILENTLY DISCARDED and every `row.tgname` below
 * was `any`; and `prisma.asset.findUnique` could have been misspelled without a word from the
 * compiler. Narrow rather than widen: this shape is what the file actually reaches for.
 */
interface PrivilegedHandle {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
  $transaction: <T>(fn: (tx: PrivilegedHandle) => Promise<T>) => Promise<T>;
  asset: {
    findUnique: (args: unknown) => Promise<{ status: string } | null>;
  };
}

describe.skipIf(!hasDatabase)('adversarial regressions (Sprint 1)', () => {
  let db: Awaited<ReturnType<typeof databaseModule>>;
  let prisma: PrivilegedHandle;

  beforeAll(async () => {
    db = await databaseModule();
    prisma = // ⚠ THE PRIVILEGED (OWNER) CONNECTION, NOT THE APP ONE  (ADR-0008 round 6). This handle issues RAW
      // GUARD STATEMENTS. Since privilege separation the app role holds no DELETE on any endowment table,
      // no UPDATE on `audit_event`, no TRUNCATE anywhere and no write at all on `waqf_access_grant` — so
      // on the app connection every probe below would be refused by the **ACL** before reaching the guard
      // it is testing (`42501 permission denied for table asset`, not the retention trigger's message).
      // The suite would stay green while measuring nothing. Running as the OWNER restores exactly the
      // environment these assertions were written for and makes each claim STRONGER: "even the table
      // owner is refused". Every PRIVILEGE claim lives in `authorization-plane-privilege.integration.test.ts`
      // on the restricted connection instead; do not merge the two.
      (await privilegedPrisma()) as unknown as PrivilegedHandle;
  });

  // ── 1. the session_replication_role bypass ────────────────────────────────────────────────
  describe('G-1 · guards fire under session_replication_role = replica', () => {
    const underReplicaRole = async (statement: string): Promise<Error | null> => {
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`);
          await tx.$executeRawUnsafe(statement);
          throw new Error('__should_not_reach__');
        });
        return null;
      } catch (error) {
        const message = String((error as Error).message);
        if (message.includes('__should_not_reach__')) return null; // statement was NOT blocked
        return error as Error;
      }
    };

    it('every guard trigger is ENABLE ALWAYS (tgenabled = A), not origin-only', async () => {
      const rows = await prisma.$queryRawUnsafe<{ tgname: string; tgenabled: string }[]>(
        `SELECT tgname, tgenabled::text AS tgenabled
           FROM pg_trigger
          WHERE NOT tgisinternal AND tgname LIKE ANY (ARRAY['audit_%','waqf_shart%','document_%'])
          ORDER BY tgname`,
      );
      expect(rows.length).toBeGreaterThanOrEqual(8);
      // 'A' = ALWAYS. 'O' (origin) is the default and is what the bypass exploited.
      for (const row of rows) {
        expect(row.tgenabled, `${row.tgname} must be ENABLE ALWAYS`).toBe('A');
      }
    });

    it('refuses UPDATE on audit_event even under the replica role', async () => {
      const error = await underReplicaRole(
        `UPDATE "audit_event" SET "classification" = 'RESTRICTED' WHERE "id" = (SELECT MIN("id") FROM "audit_event")`,
      );
      expect(error, 'UPDATE was NOT blocked — G-1 is broken').not.toBeNull();
      expect(String(error?.message)).toMatch(/append-only/i);
    });

    it('refuses DELETE on audit_event even under the replica role', async () => {
      const error = await underReplicaRole(
        `DELETE FROM "audit_event" WHERE "id" = (SELECT MAX("id") FROM "audit_event")`,
      );
      expect(error, 'DELETE was NOT blocked — G-1 is broken').not.toBeNull();
    });

    it('refuses TRUNCATE on audit_event even under the replica role', async () => {
      const error = await underReplicaRole(`TRUNCATE "audit_event"`);
      expect(error, 'TRUNCATE was NOT blocked — G-1 is broken').not.toBeNull();
    });

    it('refuses a Shart al-Waqif amendment even under the replica role (Binding rule 1)', async () => {
      const error = await underReplicaRole(
        `UPDATE "waqf" SET "shartAlWaqif" = '{"tampered":true}'::jsonb WHERE "id" = 'waqf-001'`,
      );
      expect(error, 'the Shart guard was bypassed — Binding rule 1 is broken').not.toBeNull();
    });
  });

  // ── 2. tail truncation via a chain-head rewind ─────────────────────────────────────────────
  describe('G-1 · the audit chain head only moves forward', () => {
    it('refuses to rewind lastId', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "audit_chain_head" SET "lastId" = "lastId" - 5 WHERE "id" = 1`,
        ),
      ).rejects.toThrow(/only move forward/i);
    });

    it('refuses to rewrite lastRowHash in place at the same lastId', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "audit_chain_head" SET "lastRowHash" = repeat('0', 64) WHERE "id" = 1`,
        ),
      ).rejects.toThrow(/may not be rewritten in place/i);
    });

    it('the head never ends up behind the tail (which is what a rewind would produce)', async () => {
      // Deliberately an inequality, not an equality: sibling suites in this same database append
      // their own events, so pinning head === tail would couple this test to the whole run order.
      // The property the fix guarantees is that the head is a high-water mark.
      const [row] = await prisma.$queryRawUnsafe<{ head: string; tail: string }[]>(
        `SELECT (SELECT "lastId" FROM "audit_chain_head" WHERE "id" = 1)::text AS head,
                (SELECT COALESCE(MAX("id"), 0) FROM "audit_event")::text        AS tail`,
      );
      expect(BigInt(row?.head ?? '0')).toBeGreaterThanOrEqual(BigInt(row?.tail ?? '0'));
    });
  });

  // ── 3. the scoped write path ───────────────────────────────────────────────────────────────
  describe('scoping · a real (non-bypassed) caller can write in scope and only in scope', () => {
    /** A genuine USER context — NOT `makeSystemContext`, which bypasses the force-filter. */
    const scopedClient = () =>
      db.createScopedPrisma({
        actorId: 'user-nazir-001',
        actorType: 'USER',
        authorizedWaqfIds: ['waqf-001'],
        requestId: 'regression-scoped-write',
        ip: '127.0.0.1',
        bypass: undefined,
        beneficiarySelfId: null,
        canViewAmlRestricted: false,
      } as never);

    it('update succeeds on a row inside the caller’s scope', async () => {
      // Before the fix this threw PrismaClientValidationError: the unique key was buried in AND.
      //
      // ⚠ THE STATUS VALUE IS NOW A MEMBER OF THE CLOSED `AssetStatus` VOCABULARY (migration 13,
      // owner decision D-A). It used to be the free text `'under_review'`, which after the enum
      // conversion fails in the Prisma CLIENT with a validation error — i.e. the assertion would
      // have gone red for a reason that has nothing to do with the scoping bug it pins. The value
      // chosen is ORDINARY (not `EXPROPRIATED`/`SUBSTITUTED_ISTIBDAL`), so the write reaches the
      // scoping layer rather than being refused by `asset_identity_guard`'s BR-306 gate — and the
      // `upsert` case below puts asset-001 back to `ACTIVE`.
      await expect(
        scopedClient().asset.update({
          where: { id: 'asset-001' },
          data: { status: 'PARTIALLY_RENTED' },
        }),
      ).resolves.toBeTruthy();
    });

    it('upsert succeeds on a row inside the caller’s scope', async () => {
      await expect(
        scopedClient().asset.upsert({
          where: { id: 'asset-001' },
          create: {
            id: 'asset-001',
            waqfId: 'waqf-001',
            type: 'land_parcel',
            titleDeedNumber: 'FAKE-REGRESSION',
            addressAr: 'عنوان وهمي',
            acquiredDate: new Date('2020-01-01T00:00:00.000Z'),
            acquiredDateHijri: '1441-05-06',
            valuationSar: '1.00',
            status: 'ACTIVE',
          },
          update: { status: 'ACTIVE' },
        }),
      ).resolves.toBeTruthy();
    });

    // ⚠⚠ THE TWO DENIAL CASES BELOW WERE VACUOUS FOR ONE RUN AND NOBODY ASKED ME TO LOOK.
    // They wrote `'hijacked'` and `'x'` — free text, fine while `asset.status` was a `String`. After
    // migration 13 made it the closed enum `AssetStatus`, both values are rejected by the Prisma
    // CLIENT (and, in raw SQL, at type parse with 22P02) BEFORE the scoping extension is consulted.
    // The tests still PASSED, because `rejects.toThrow()` cannot tell a scoping denial from a
    // validation error — a green assertion measuring nothing, which is the exact failure mode this
    // whole suite exists to prevent. Both now use a VALID, ORDINARY status, so the only thing that
    // can refuse the write is the force-filter these cases are about.
    it('update is DENIED on a row belonging to another endowment', async () => {
      // asset-003 belongs to waqf-002; the caller holds waqf-001 only. Its seeded status moved
      // VACANT → FULLY_RENTED in S5/E4 (rev-003 is its rent — the ledger and the occupancy status
      // keep agreeing), so the probe value moved with it: `PARTIALLY_RENTED` is a real change and
      // the post-check below stays a real check. A probe equal to the seeded value would make the
      // post-check a no-op — the vacuity this block's own header warns about.
      await expect(
        scopedClient().asset.update({
          where: { id: 'asset-003' },
          data: { status: 'PARTIALLY_RENTED' },
        }),
      ).rejects.toThrow();

      const untouched = await prisma.asset.findUnique({
        where: { id: 'asset-003' },
        select: { status: true },
      });
      expect(untouched?.status).toBe('FULLY_RENTED');
    });

    it('update is DENIED for a key that does not exist (no scope-probe oracle)', async () => {
      await expect(
        scopedClient().asset.update({
          where: { id: 'asset-999' },
          data: { status: 'FULLY_RENTED' },
        }),
      ).rejects.toThrow();
    });
  });

  // ── 4. document retention / legal hold ─────────────────────────────────────────────────────
  describe('NFR-07 · retention may only be extended and a hold only released via authority', () => {
    const DOC_ID = 'doc-regression-9001';

    beforeAll(async () => {
      // ⚠ THE CLEANUP HAS TO SUSPEND THE GUARD IT IS ABOUT TO TEST, AND SAY SO. This block runs the
      // fixture down and up again, and the document it creates carries `legalHold = true` — which is
      // exactly what `document_retention_guard` refuses to delete. A previous run of this file that
      // did not reach its own teardown therefore leaves a row that a bare `DELETE` cannot remove, and
      // the whole describe block fails in `beforeAll` for a reason that has nothing to do with the
      // property under test. (Observed, on a database this suite had already run against.)
      //
      // Scaffolding, not an assertion: it goes on the OWNER connection, which is the only one that may
      // suspend a trigger since ADR-0008 round 6, and the guard is restored `ENABLE ALWAYS` inside the
      // same atomic `DO` block. Every refusal asserted below runs OUTSIDE this wrapper with the guard
      // fully live.
      const scaffold = await privilegedPrisma();
      await scaffold.$executeRawUnsafe(
        `DO $qm_adv$
         BEGIN
           ALTER TABLE "document" DISABLE TRIGGER document_retention_guard;
           DELETE FROM "document" WHERE "id" = '${DOC_ID}';
           ALTER TABLE "document" ENABLE ALWAYS TRIGGER document_retention_guard;
         END
         $qm_adv$;`,
      );
      await prisma.$executeRawUnsafe(
        `INSERT INTO "document" ("id","waqfId","type","titleAr","storageKey","sha256",
                                 "confidentiality","version","retentionUntil","retentionUntilHijri",
                                 "legalHold","createdAt","updatedAt")
         VALUES ($1,'waqf-001','deed','وثيقة وهمية (بيانات وهمية)',
                 'fake/regression/' || $1, repeat('0',64),
                 'NORMAL', 1, now() + interval '10 years', '1457-01-01',
                 true, now(), now())`,
        DOC_ID,
      );
    });

    it('refuses to shorten retentionUntil', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "document" SET "retentionUntil" = now() - interval '1 day' WHERE "id" = $1`,
          DOC_ID,
        ),
      ).rejects.toThrow(/may only be extended/i);
    });

    it('refuses to clear legalHold directly', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "document" SET "legalHold" = false WHERE "id" = $1`,
          DOC_ID,
        ),
      ).rejects.toThrow(/legal hold may only be released/i);
    });

    it('still refuses the hard delete the two guards above protect', async () => {
      await expect(
        prisma.$executeRawUnsafe(`DELETE FROM "document" WHERE "id" = $1`, DOC_ID),
      ).rejects.toThrow(/LEGAL HOLD|retention window/i);
    });

    it('allows extending retention', async () => {
      await expect(
        prisma.$executeRawUnsafe(
          `UPDATE "document" SET "retentionUntil" = now() + interval '20 years' WHERE "id" = $1`,
          DOC_ID,
        ),
      ).resolves.toBeDefined();
    });
  });
});
