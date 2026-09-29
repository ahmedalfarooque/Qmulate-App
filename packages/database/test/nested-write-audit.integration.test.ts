/**
 * GATE G-1, RE-PROVEN AFTER A REGRESSION — every material write emits exactly one `audit_event`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT REGRESSED, AND WHY THIS FILE COUNTS AUDIT EVENTS INSTEAD OF READING SOURCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * G-1 was proven in Sprint 1 for TOP-LEVEL writes. S2 round 1 then taught the scoping force filter
 * to walk relation-nested payloads (C-01) and left the audit spine behind, so a PERMITTED nested
 * write committed with no event for the child row. Reproduced against a freshly migrated + seeded
 * fixture database from an ordinary FINANCE seat, before this file existed:
 *
 *   waqf.update({ where: { id: 'waqf-001' },
 *                 data: { assets: { update: { where: { id: 'asset-001' },
 *                                             data: { titleDeedNumber: 'FORGED-D1' } } } } })
 *     -> COMMITTED.  asset-001.titleDeedNumber: 'FAKE-100' -> 'FORGED-D1'
 *                    audit_event: 319 -> 320, entityType 'Waqf'
 *                    events naming Asset:asset-001 -> 0
 *
 * A rewritten title-deed number on a CORPUS asset, with no trail. The same shape one hop deeper
 * (`waqf -> assets.update -> maintenanceTickets.create`) wrote the child row and produced 0 events
 * naming it. That is a Sprint-1 gate, previously proven, broken.
 *
 * ⚠ ROUND 1 ALSO SHIPPED A TEST THAT LOCATED A CALL SITE AND CHECKED THAT THREE IDENTIFIERS
 * APPEARED NEARBY. It passed at full strength while the guard it described was fully bypassable. So
 * every case here DRIVES A REAL WRITE and then COUNTS ROWS IN `audit_event`, per affected row id.
 * The one source-reading assertion in this file is about a COMMENT's honesty, which is the only
 * claim source text can actually settle.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE CHOSEN FIX: REFUSE, NOT AUDIT-THE-CHILDREN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * The argument is in the block comment above `assertNestedWritesAuditable` in
 * `src/extensions/audit.ts`. In one line: a nested write returns only the parent row, so there is no
 * per-row before-image and — for a nested `create` — not even an id to name, which is the identical
 * reason `BANNED_OPERATIONS` already refuses `createMany`/`updateMany`/`deleteMany` at top level.
 * A relation is not a way around a refusal. The refusal costs no capability: every nested write has
 * an exact top-level equivalent, and `withAudit()` makes the two commit together.
 *
 * So the property this file proves is not "nested writes are audited". It is the stronger, checkable
 * one the round-2 brief asked for: THERE IS NO WRITE PATH, NESTED OR NOT, THAT MUTATES AN AUDITED
 * MODEL WITHOUT PRODUCING ITS AUDIT EVENT.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type AnyClient,
  delegateByName,
  assertGuardsInstalled,
  privilegedPrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  hasDatabase,
  retentionScaffoldingSql,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('G-1 (relation-nested writes are never unaudited)');

const WAQF_A = 'waqf-001';
const ASSET = 'asset-001';
const FINANCE = 'user-accountant-001';
const SUBJECT = 'user-family-board';

/** Test-created rows live in a 9xxx series so cleanup deletes exactly this range. */
const TEST_ASSET = 'asset-audit-9';
const TEST_TICKET = 'mt-audit-9';
const TEST_GRANT = 'grant-audit-9';
const TEST_NOTIFICATION = 'notif-audit-9';

interface PrismaLike {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}

/*
 * ⚠ `AnyClient` MOVED TO `./setup.js` (S4/E3 round 2, V3). All three files that reach for delegates
 * by name declared the same `Record<string, Record<string, …>>` locally, and none of them compiled:
 * `tsconfig.json` included `tests/**` — with an s — while the directory is `test/`, so nothing here
 * had EVER been typechecked. Under `noUncheckedIndexedAccess` that shape yields `… | undefined` at
 * every call site, and the cast itself is rejected outright (TS2352). The shared type is a MAPPED
 * TYPE over finite model/operation unions, which is stronger: a mistyped delegate is now a compile
 * error rather than `undefined is not a function` inside a probe that expects to be refused.
 */

function assetPayload(id: string, waqfId?: string): Record<string, unknown> {
  return {
    id,
    ...(waqfId === undefined ? {} : { waqfId }),
    type: 'land_parcel',
    titleDeedNumber: `AUD-${id}`,
    addressAr: 'عنوان اختباري (بيانات وهمية)',
    acquiredDate: new Date('2020-01-01T00:00:00Z'),
    acquiredDateHijri: '1441-05-06',
    valuationSar: '1000.00',
  };
}

function ticketPayload(id: string, assetId?: string): Record<string, unknown> {
  return {
    id,
    ...(assetId === undefined ? {} : { assetId }),
    kind: 'repair',
    status: 'open',
    openedAt: new Date('2026-01-01T00:00:00Z'),
    openedAtHijri: '1447-07-12',
  };
}

describe.skipIf(!hasDatabase)('G-1 · no unaudited write path, nested or not', () => {
  let prisma: PrismaLike;
  let db: Awaited<ReturnType<typeof databaseModule>>;

  const cleanup = async (): Promise<void> => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "maintenance_ticket" WHERE "id" LIKE '${TEST_TICKET}%'`,
    );
    // ⚠ WRAPPED SINCE `00000000000006_e2_corpus_retention_guards`. An `asset` row is the corpus
    // (asl / أصل) and its hard DELETE is refused OUTRIGHT, so the suite has to say out loud that it
    // is disabling the guard to take its own fixture away. See `retentionScaffoldingSql`.
    await prisma.$executeRawUnsafe(
      retentionScaffoldingSql([`DELETE FROM "asset" WHERE "id" LIKE '${TEST_ASSET}%'`]),
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "waqf_access_grant" WHERE "id" LIKE '${TEST_GRANT}%'`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "notification" WHERE "id" LIKE '${TEST_NOTIFICATION}%'`,
    );
  };

  /** Runs a write and returns the flattened error, or `null` when it was PERMITTED. */
  const attempt = async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      await fn();
      return null;
    } catch (error: unknown) {
      return errorText(error);
    }
  };

  /**
   * `audit_event` id at the start of this run — every count below is taken from here forward.
   *
   * `audit_event` is APPEND-ONLY by database trigger, so `cleanup()` can delete the business rows a
   * test created but can never delete their events. Counting the whole table would therefore return
   * 2 instead of 1 the second time this file runs against the same database, and "exactly one event
   * per write" would degrade into "at least one" — flaky in exactly the direction that hides a
   * double-write. Measured: re-running this file without a `--reset` produced `expected 2 to be 1`.
   */
  let baselineEventId = BigInt(0);

  /** `audit_event` rows naming one entity, THIS RUN ONLY. THE assertion of this file. */
  const eventsFor = async (entityType: string, entityId: string): Promise<number> => {
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "audit_event"
        WHERE "entityType" = $1 AND "entityId" = $2 AND "id" > $3::bigint`,
      entityType,
      entityId,
      baselineEventId.toString(),
    );
    return Number(rows[0]?.n ?? 0);
  };

  const totalEvents = async (): Promise<number> => {
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "audit_event"`,
    );
    return Number(rows[0]?.n ?? 0);
  };

  const scalar = async <T>(sql: string, ...values: unknown[]): Promise<T | undefined> => {
    const rows = await prisma.$queryRawUnsafe<{ v: T }[]>(sql, ...values);
    return rows[0]?.v;
  };

  const rowExists = async (table: string, id: string): Promise<boolean> => {
    const rows = await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM "${table}" WHERE "id" = $1`,
      id,
    );
    return rows.length > 0;
  };

  const financeContext = () =>
    ({
      actorId: FINANCE,
      actorType: 'USER',
      authorizedWaqfIds: [WAQF_A],
      permissions: ['finance:transaction:write', 'finance:transaction:read'],
      requestId: 'test-nested-audit-finance',
    }) as never;

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    db = await databaseModule();
    prisma =
      // ⚠ THE PRIVILEGED (OWNER) CONNECTION, NOT THE APP ONE  (ADR-0008 round 6). This handle issues RAW
      // GUARD STATEMENTS. Since privilege separation the app role holds no DELETE on any endowment table,
      // no UPDATE on `audit_event`, no TRUNCATE anywhere and no write at all on `waqf_access_grant` — so
      // on the app connection every probe below would be refused by the **ACL** before reaching the guard
      // it is testing (`42501 permission denied for table asset`, not the retention trigger's message).
      // The suite would stay green while measuring nothing. Running as the OWNER restores exactly the
      // environment these assertions were written for and makes each claim STRONGER: "even the table
      // owner is refused". Every PRIVILEGE claim lives in `authorization-plane-privilege.integration.test.ts`
      // on the restricted connection instead; do not merge the two.
      (await privilegedPrisma()) as unknown as PrismaLike;
    await cleanup();
    const head = await prisma.$queryRawUnsafe<{ v: string }[]>(
      `SELECT COALESCE(max("id"), 0)::text AS v FROM "audit_event"`,
    );
    baselineEventId = BigInt(head[0]?.v ?? '0');
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // THE REGRESSION ITSELF, driven exactly as it was reproduced
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the reproduced regression', () => {
    it('THE LIVE HOLE: a nested update rewrote asset-001’s title-deed number with no event', async () => {
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;

      const deedBefore = await scalar<string>(
        `SELECT "titleDeedNumber" AS v FROM "asset" WHERE "id" = $1`,
        ASSET,
      );
      const eventsBefore = await eventsFor('Asset', ASSET);
      const totalBefore = await totalEvents();

      const error = await attempt(() =>
        client.waqf.update({
          where: { id: WAQF_A },
          data: {
            assets: {
              update: { where: { id: ASSET }, data: { titleDeedNumber: 'FORGED-BY-NESTING' } },
            },
          },
        }),
      );

      // Asserted on the REASON, not merely on "it threw". Before the fix this payload COMMITTED,
      // and a malformed payload would throw a Prisma validation error that proves nothing.
      expect(error, 'the nested write into an audited model was permitted').toMatch(
        /audit spine cannot record it/,
      );
      expect(error).toMatch(/Waqf\.data\.assets/);
      expect(error).toMatch(/UnauditableNestedWriteError|top-level asset operation/);

      // The write did not happen…
      expect(
        await scalar<string>(`SELECT "titleDeedNumber" AS v FROM "asset" WHERE "id" = $1`, ASSET),
        'a corpus asset’s title-deed number was rewritten through a relation',
      ).toBe(deedBefore);
      // …and nothing at all was recorded, because nothing at all happened. The refusal is raised
      // before the audit transaction opens, so the PARENT gains no event either.
      expect(await eventsFor('Asset', ASSET)).toBe(eventsBefore);
      expect(await totalEvents(), 'a refused write still moved the trail').toBe(totalBefore);
    });

    it('THE LIVE HOLE, one hop deeper: waqf -> assets.update -> maintenanceTickets.create', async () => {
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const ticket = `${TEST_TICKET}01`;

      const error = await attempt(() =>
        client.waqf.update({
          where: { id: WAQF_A },
          data: {
            assets: {
              update: {
                where: { id: ASSET },
                data: { maintenanceTickets: { create: ticketPayload(ticket) } },
              },
            },
          },
        }),
      );

      // Refused at the OUTERMOST audited hop (`Waqf.data.assets`), which is correct: the whole
      // payload is one statement and Prisma would execute all of it or none of it.
      expect(error).toMatch(/audit spine cannot record it/);
      expect(await rowExists('maintenance_ticket', ticket)).toBe(false);
      expect(await eventsFor('MaintenanceTicket', ticket)).toBe(0);
    });

    it('a nested create off a top-level CREATE is refused too', async () => {
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const asset = `${TEST_ASSET}02`;
      const ticket = `${TEST_TICKET}02`;

      const error = await attempt(() =>
        client.asset.create({
          data: {
            ...assetPayload(asset, WAQF_A),
            maintenanceTickets: { create: ticketPayload(ticket) },
          },
        }),
      );

      expect(error).toMatch(/audit spine cannot record it/);
      expect(error).toMatch(/Asset\.data\.maintenanceTickets/);
      // The PARENT must not survive either: refusing the child while committing the parent would be
      // a partial write with a trail that reads as complete.
      expect(await rowExists('asset', asset), 'the parent committed without its child').toBe(false);
      expect(await eventsFor('Asset', asset)).toBe(0);
      expect(await eventsFor('MaintenanceTicket', ticket)).toBe(0);
    });

    it('refuses the same nesting under upsert’s `create` AND its `update` branch', async () => {
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const asset = `${TEST_ASSET}03`;

      // `upsert` carries two write payloads under two different names. Round 1's C-04 finding was
      // exactly this: a second name for the same door.
      const viaCreate = await attempt(() =>
        client.asset.upsert({
          where: { id: asset },
          update: {},
          create: {
            ...assetPayload(asset, WAQF_A),
            maintenanceTickets: { create: ticketPayload(`${TEST_TICKET}03`) },
          },
        }),
      );
      expect(viaCreate).toMatch(/audit spine cannot record it/);
      expect(viaCreate).toMatch(/Asset\.create\.maintenanceTickets/);

      const viaUpdate = await attempt(() =>
        client.asset.upsert({
          where: { id: ASSET },
          update: { maintenanceTickets: { create: ticketPayload(`${TEST_TICKET}04`) } },
          create: assetPayload(ASSET, WAQF_A),
        }),
      );
      expect(viaUpdate).toMatch(/audit spine cannot record it/);
      expect(viaUpdate).toMatch(/Asset\.update\.maintenanceTickets/);

      expect(await rowExists('asset', asset)).toBe(false);
      expect(await rowExists('maintenance_ticket', `${TEST_TICKET}03`)).toBe(false);
      expect(await rowExists('maintenance_ticket', `${TEST_TICKET}04`)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // EVERY nested mutating verb, on EVERY relation, at several depths — counted
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the refusal is total, not a list of the shapes somebody thought of', () => {
    it.each([
      'create',
      'createMany',
      'connectOrCreate',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
    ])('refuses nested %s into an audited model', async (verb) => {
      // Driven through a BYPASSED context on purpose: the scoping walker short-circuits on
      // `isBypassed`, so for the seed / jobs / data migrations the audit-side walk is the ONLY one
      // that runs. If this guard were placed inside the scoping extension instead, every one of
      // these would pass through here unrecorded.
      const client = db.createPrismaClient(db.makeSystemContext()) as unknown as AnyClient;
      const error = await attempt(() =>
        client.waqf.update({ where: { id: WAQF_A }, data: { assets: { [verb]: {} } } }),
      );
      expect(error, `nested ${verb} was not refused`).toMatch(/audit spine cannot record it/);
    });

    it('sweeps EVERY relation into an audited model, from the DMMF', async () => {
      // The schema tests the guard. A relation added to `schema.prisma` tomorrow is covered the day
      // it is added, with no edit here — which is how `Waqf.accessGrants` and `User.grants` became
      // unguarded doors in Sprint 1 (a hand-written list is right only on the day it is written).
      const client = db.createPrismaClient(db.makeSystemContext()) as unknown as AnyClient;

      const doors: { model: string; field: string; target: string; localFk: boolean }[] = [];
      for (const model of db.Prisma.dmmf.datamodel.models) {
        for (const field of model.fields) {
          if (field.kind !== 'object') continue;
          if (field.type in db.UNAUDITED_MODELS) continue;
          doors.push({
            model: model.name,
            field: field.name,
            target: field.type,
            localFk: (field.relationFromFields?.length ?? 0) > 0,
          });
        }
      }

      expect(
        doors.length,
        'no relation into an audited model was found — the DMMF scan is broken and this test ' +
          'would then pass vacuously',
      ).toBeGreaterThan(20);

      const permitted: string[] = [];
      for (const door of doors) {
        const delegate = delegateByName(
          client,
          door.model.charAt(0).toLowerCase() + door.model.slice(1),
        );
        // `where` need not resolve: the guard must fire BEFORE Prisma validates the payload or
        // looks up the row. A PrismaClientValidationError here would mean the guard did not run.
        const error = await attempt(() =>
          delegate.update({
            where: { id: 'does-not-need-to-exist' },
            data: { [door.field]: { create: {} } },
          }),
        );
        if (error === null || !/audit spine cannot record it/.test(error)) {
          permitted.push(
            `${door.model}.${door.field} -> ${door.target}: ${String(error).slice(0, 100)}`,
          );
        }
      }
      expect(permitted, 'a relation into an audited model accepts an unrecordable write').toEqual(
        [],
      );
    });

    it('refuses an audited TOP-LEVEL model reached from an unaudited one (Notification -> user)', async () => {
      // `Notification` is in `UNAUDITED_MODELS`, so the guard has to run BEFORE the
      // unaudited-model early return in `$allOperations` rather than after it. Otherwise
      // `notification.create({ data: { user: { … } } })` writes `User` — which IS audited — through
      // a table that owes no event of its own.
      const client = db.createPrismaClient(db.makeSystemContext()) as unknown as AnyClient;

      const error = await attempt(() =>
        client.notification.create({
          data: {
            id: `${TEST_NOTIFICATION}01`,
            kind: 'test',
            titleAr: 'اختبار',
            user: { update: { name: 'renamed through a notification' } },
          },
        }),
      );

      expect(error, 'an audited model was written through an unaudited parent').toMatch(
        /audit spine cannot record it/,
      );
      expect(error).toMatch(/Notification\.data\.user/);
      expect(error).toMatch(/would update User rows/);
      expect(await rowExists('notification', `${TEST_NOTIFICATION}01`)).toBe(false);
    });

    it('RECURSES THROUGH an unaudited target to the audited model beyond it', async () => {
      // The other direction, and the one that needs the recursion rather than the early-return
      // ordering: `User.notifications` targets an UNAUDITED model, so no event is owed for the
      // notification row and the walk must not stop there — the notification's OWN payload nests
      // back into `User`, which is audited. Path asserted, so a walk that merely refuses the
      // outermost hop for the wrong reason cannot pass this.
      const client = db.createPrismaClient(db.makeSystemContext()) as unknown as AnyClient;

      const error = await attempt(() =>
        client.user.update({
          where: { id: SUBJECT },
          data: {
            notifications: {
              create: {
                id: `${TEST_NOTIFICATION}02`,
                kind: 'test',
                titleAr: 'اختبار',
                user: { update: { name: 'renamed two hops down' } },
              },
            },
          },
        }),
      );

      expect(error).toMatch(/audit spine cannot record it/);
      expect(error, 'the walk stopped at the unaudited hop').toMatch(
        /User\.data\.notifications\.create\.user/,
      );
      expect(await rowExists('notification', `${TEST_NOTIFICATION}02`)).toBe(false);
      expect(
        await scalar<string>(`SELECT "name" AS v FROM "user" WHERE "id" = $1`, SUBJECT),
      ).not.toBe('renamed two hops down');
    });

    it('refuses a to-many relink, which rewrites the TARGET row’s foreign key', async () => {
      const client = db.createPrismaClient(db.makeSystemContext()) as unknown as AnyClient;
      // Read it first rather than assuming which endowment the fixture put it in — asserting
      // against a hard-coded id is how a test starts passing for the wrong reason.
      const before = await scalar<string>(
        `SELECT "waqfId" AS v FROM "asset" WHERE "id" = 'asset-003'`,
      );
      expect(before, 'asset-003 is missing from the fixture').toBeDefined();

      for (const verb of ['connect', 'disconnect', 'set']) {
        const error = await attempt(() =>
          client.waqf.update({
            where: { id: WAQF_A },
            data: { assets: { [verb]: { id: 'asset-003' } } },
          }),
        );
        expect(error, `nested to-many ${verb} was not refused`).toMatch(
          /audit spine cannot record it/,
        );
        expect(error).toMatch(/re-parent/);
      }
      // Nothing was re-parented while we were looking.
      expect(
        await scalar<string>(`SELECT "waqfId" AS v FROM "asset" WHERE "id" = 'asset-003'`),
      ).toBe(before);
    });

    it('refuses an unrecognized nested verb on an audited target (fail-closed)', async () => {
      const client = db.createPrismaClient(db.makeSystemContext()) as unknown as AnyClient;
      const error = await attempt(() =>
        client.waqf.update({ where: { id: WAQF_A }, data: { assets: { frobnicate: {} } } }),
      );
      expect(error).toMatch(/audit spine cannot record it/);
      expect(error).toMatch(/unrecognized nested verb/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // THIS IS A SUBTRACTION, NOT A LOCKOUT — and the top-level path IS audited, counted
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the sanctioned path still works, and produces exactly one event per row', () => {
    it('a to-ONE `connect` whose foreign key is LOCAL stays permitted', async () => {
      // `waqf: { connect: { id } }` is how half the codebase supplies the endowment. It writes the
      // FK on THIS row, so it lands in this row's own before/after image and IS recorded. Refusing
      // it would be a lockout; permitting a to-MANY connect would be the hole above.
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const asset = `${TEST_ASSET}10`;

      const error = await attempt(() =>
        client.asset.create({
          data: { ...assetPayload(asset), waqf: { connect: { id: WAQF_A } } },
        }),
      );
      expect(error, 'a local-FK to-one connect was refused — that is a lockout').toBeNull();
      expect(await scalar<string>(`SELECT "waqfId" AS v FROM "asset" WHERE "id" = $1`, asset)).toBe(
        WAQF_A,
      );
      expect(await eventsFor('Asset', asset), 'the permitted create was not audited').toBe(1);
    });

    it('the top-level EQUIVALENT of each refused nesting produces exactly one event per row', async () => {
      // The refusal's whole defence is that it costs no capability. So prove the replacement:
      // parent and child as two top-level statements inside ONE `withAudit()` block — which is what
      // the refusal message tells the caller to write — then the update as its own statement.
      const ctx = financeContext();
      const asset = `${TEST_ASSET}11`;
      const ticket = `${TEST_TICKET}11`;

      await db.withAudit(ctx, async (tx: unknown) => {
        const t = tx as unknown as AnyClient;
        await t.asset.create({ data: assetPayload(asset, WAQF_A) });
        await t.maintenanceTicket.create({ data: ticketPayload(ticket, asset) });
      });

      // ⚠ THE UPDATE IS DELIBERATELY OUTSIDE THE BLOCK, and not as a stylistic choice. Updating a
      // row created earlier in the SAME `withAudit()` block currently fails with
      // `ForbiddenScopeError: no Asset matching that key is within the caller's scope`: the scoping
      // extension's `UNIQUE_WRITE_OPS` pre-check calls `findFirst` on the client it was applied to,
      // which does not include the audit extension, so that read runs on the pool OUTSIDE the
      // enclosing transaction and cannot see the block's uncommitted rows. That is a PRE-EXISTING
      // defect in `extensions/scoping.ts`, unrelated to this guard and reported separately — pinning
      // it here rather than papering over it, so the next reader knows the split is not arbitrary.
      //
      // `valuationSar`, not `titleDeedNumber`: migration 5 makes an asset's title-deed number
      // reserved-matter-only, so it is no longer an ordinary column and would prove the wrong thing
      // here. A revaluation is an ordinary audited update.
      const client = db.createPrismaClient(ctx) as unknown as AnyClient;
      await client.asset.update({ where: { id: asset }, data: { valuationSar: '2500.00' } });

      expect(await rowExists('asset', asset)).toBe(true);
      expect(await rowExists('maintenance_ticket', ticket)).toBe(true);
      // EXACTLY ONE per material write — one CREATE + one UPDATE on the asset, one CREATE on the
      // ticket. "At least one" would not be G-1; a duplicated event is a trail that double-counts.
      expect(await eventsFor('Asset', asset)).toBe(2);
      expect(await eventsFor('MaintenanceTicket', ticket)).toBe(1);
      expect(
        await scalar<string>(
          `SELECT "valuationSar"::text AS v FROM "asset" WHERE "id" = $1`,
          asset,
        ),
      ).toBe('2500.00');
    });

    it('a BYPASSED writer — the seed’s own shape — still writes and is still audited', async () => {
      // The guard applies to `bypass` contexts too (a data migration writing an invisible child row
      // is as invisible to an auditor as a request doing it), so a bypassed writer is the case that
      // would break first if the refusal were too broad. This drives the seed's actual payload shape
      // — flat `create`/`update` on a deterministic id — through `makeSystemContext()`.
      //
      // The whole fixture seed is proven to still run by the harness itself: `ensureSeeded()` in
      // `beforeAll` and the `pnpm run db:seed` step of the one-shot/CI command both fail the run if
      // it does not. Re-spawning it from inside a test competes with this process for the audit
      // chain's advisory lock and for pool connections, which is a flake, not a proof.
      const client = db.createPrismaClient(db.makeSystemContext()) as unknown as AnyClient;
      const asset = `${TEST_ASSET}12`;

      await client.asset.upsert({
        where: { id: asset },
        create: assetPayload(asset, WAQF_A),
        update: { valuationSar: '99.00' },
      });

      expect(await rowExists('asset', asset)).toBe(true);
      expect(await eventsFor('Asset', asset), 'a bypassed write was not audited').toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // The comment may not out-claim the code (the S1 failure mode)
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('audit.ts no longer describes the nested-write hole as an OPEN known gap', async () => {
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const source = readFileSync(
      fileURLToPath(new URL('../src/extensions/audit.ts', import.meta.url)),
      'utf8',
    );
    // Round 1 left a header comment saying the fix "is NOT implemented". It is now implemented, and
    // a stale comment describing a shipped guard as absent is as misleading as one claiming a guard
    // that does not exist.
    expect(source).not.toMatch(/is NOT implemented/);
    expect(source).not.toMatch(/KNOWN GAP, NOT A REFUSAL/);
    expect(source).toMatch(/UnauditableNestedWriteError/);
    // And the residual it CANNOT close must stay stated.
    expect(source).toMatch(/does NOT survive `\$executeRawUnsafe`/);
    // The residual must be MEASURED and CURRENT. Migration 4 gated `asset.titleDeedNumber`, which is
    // what this note used as its worked example — so the example had gone stale and was quietly
    // describing a write the database now refuses. A residual note that has drifted is the same
    // defect as an over-claim, in the other direction.
    expect(source, 'the residual example is one the database now blocks').not.toMatch(
      /UPDATE asset SET "titleDeedNumber"/,
    );
    expect(source).toMatch(/valuationSar/);
    expect(source).toMatch(/132 -> 132/);
    expect(source).toMatch(/ADR-0008/);
  });
});
