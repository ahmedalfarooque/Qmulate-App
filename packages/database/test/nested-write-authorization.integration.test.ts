/**
 * RELATION-NESTED WRITES — the door that made every other authority layer decorative (C-01).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS REACHABLE BEFORE THIS FILE EXISTED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * `query.$allModels.$allOperations` receives the TOP-LEVEL model and operation ONLY. Prisma does not
 * invoke it again for a relation-nested write, so `assertWritePolicy` and `assertCreateInScope` were
 * evaluated against the PARENT of a nested write and never against the nested row. Reproduced end to
 * end against a freshly migrated + seeded fixture database:
 *
 *   DENIED   waqfAccessGrant.create({ data: { role:'NAZIR', permissions:['approval:request:approve'] } })
 *   ALLOWED  waqf.update({ where:{id:'waqf-001'}, data:{ accessGrants:{ create: <the identical row> } } })
 *   ALLOWED  user.update({ where:{id:SELF},        data:{ grants:{        create: <the identical row> } } })
 *
 * from a FINANCE seat AND from `user-beneficiary-ben-001`, a portal login holding exactly one
 * permission (`beneficiary:beneficiary:write`). `User` sits in `UNSCOPED_MODELS`, so `scopeFilter`
 * returned `null` and the entire nested payload went to Prisma unexamined.
 *
 * THE FORGED SEAT THEN SATISFIED EVERY OTHER LAYER RATHER THAN DEFEATING IT:
 *   · `qmulate_has_active_grant('user-beneficiary-ben-001','waqf-001','NAZIR')` → TRUE — the row is
 *     genuine and well-formed, so the database function that the `approval_request_authority`
 *     trigger relies on agrees with it;
 *   · the read-time preset intersection is a no-op, because the forged role IS `nazir`;
 *   · `waqf_access_grant_no_self_issue` is satisfied by naming a third party as `grantedByUserId`,
 *     and `waqf_access_grant_permission_guard` positively PERMITS the approve verbs because
 *     `role = 'NAZIR'` is exactly the role allowed to hold them.
 *   · and ZERO audit events named the forged grant (`audit_event` gained only an `entityType:'User'`
 *     UPDATE), so the append-only spine has no record that a second approval authority was minted.
 *
 * That is the shape of the lesson these tests are written against: three layers that all read the
 * SAME TABLE are one layer. A control that asks "does this row say NAZIR?" is not a control. The
 * only question that closes it is HOW THE ROW GOT HERE, AND WAS THAT PATH AUTHORIZED.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HOW THESE TESTS ARE WRITTEN, AND WHY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * EVERY CASE DRIVES A REAL PRISMA WRITE. The sprint's only structural coverage of this guard was
 * `grant-escalation.integration.test.ts`'s source-shape assertion — it located the
 * `assertWritePolicy(...)` call site and checked that three identifiers appeared within the
 * preceding 400 characters. It passed at full strength throughout the exploit above. A test that
 * scans source cannot fail for a reason the source does not mention, so it is not coverage.
 *
 * AND THE PLANE SWEEP READS THE DMMF, NOT A HAND-WRITTEN LIST. `Waqf.accessGrants` and `User.grants`
 * are the two doors that were used, but they are not the only two, and the next back-relation into
 * the authorization plane will be added by someone who has never read this file. So the sweep
 * enumerates `Prisma.dmmf` itself and drives one nested write per relation found — the schema tests
 * the guard, in the way `role-enum-narrowing` already has `packages/auth` test `schema.prisma`.
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

warnNoDatabase('C-01 / C-04 (relation-nested write authorization)');

const WAQF_A = 'waqf-001';
const WAQF_B = 'waqf-002';
const ADMIN = 'user-seed-admin';
const FINANCE = 'user-accountant-001';
const BENEFICIARY_USER = 'user-beneficiary-ben-001';
const BENEFICIARY_SELF_ID = 'ben-001';
const PROBE_SUBJECT = 'user-family-board';

/** Test-created rows live in a 9xxx series so cleanup deletes exactly this range. */
const TEST_GRANT_PREFIX = 'grant-nest-9';
const TEST_ASSET_PREFIX = 'asset-nest-9';

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

/**
 * The forged row, exactly as the adversary wrote it: a LIVE NAZIR seat carrying the approve verbs,
 * issued by a third party so `waqf_access_grant_no_self_issue` is satisfied rather than tripped.
 */
function forgedGrant(id: string): Record<string, unknown> {
  return {
    id,
    role: 'NAZIR',
    permissions: ['approval:request:approve', 'approval:request:initiate'],
    dataScopes: [],
    canViewAmlRestricted: false,
    amlCompartment: false,
    beneficiarySelfId: null,
    scopeRefs: [],
    grantedByUserId: ADMIN,
    validFrom: new Date('2026-01-01T00:00:00Z'),
  };
}

function assetPayload(id: string, waqfId?: string): Record<string, unknown> {
  return {
    id,
    ...(waqfId === undefined ? {} : { waqfId }),
    type: 'land_parcel',
    titleDeedNumber: `NEST-${id}`,
    addressAr: 'عنوان اختباري (بيانات وهمية)',
    acquiredDate: new Date('2020-01-01T00:00:00Z'),
    acquiredDateHijri: '1441-05-06',
    valuationSar: '1000.00',
  };
}

describe.skipIf(!hasDatabase)('relation-nested write authorization', () => {
  let prisma: PrismaLike;
  let db: Awaited<ReturnType<typeof databaseModule>>;

  const cleanup = async (): Promise<void> => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "waqf_access_grant" WHERE "id" LIKE '${TEST_GRANT_PREFIX}%'`,
    );
    // ⚠ WRAPPED SINCE `00000000000006_e2_corpus_retention_guards` — see nested-write-audit's note.
    await prisma.$executeRawUnsafe(
      retentionScaffoldingSql([`DELETE FROM "asset" WHERE "id" LIKE '${TEST_ASSET_PREFIX}%'`]),
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

  const grantExists = async (id: string): Promise<boolean> => {
    const rows = await prisma.$queryRawUnsafe<unknown[]>(
      `SELECT 1 FROM "waqf_access_grant" WHERE "id" = '${id}'`,
    );
    return rows.length > 0;
  };

  const hasActiveNazirGrant = async (userId: string, waqfId: string): Promise<boolean> => {
    const rows = await prisma.$queryRawUnsafe<{ ok: boolean }[]>(
      `SELECT qmulate_has_active_grant('${userId}','${waqfId}','NAZIR') AS ok`,
    );
    return rows[0]?.ok === true;
  };

  // ── the seats the exploit was driven from ────────────────────────────────────────────────
  const financeContext = () =>
    ({
      actorId: FINANCE,
      actorType: 'USER',
      authorizedWaqfIds: [WAQF_A],
      permissions: ['finance:transaction:write', 'finance:transaction:read'],
      requestId: 'test-nested-finance',
    }) as never;

  const beneficiaryContext = () =>
    ({
      actorId: BENEFICIARY_USER,
      actorType: 'USER',
      authorizedWaqfIds: [WAQF_A],
      beneficiarySelfId: BENEFICIARY_SELF_ID,
      permissions: ['beneficiary:beneficiary:write'],
      requestId: 'test-nested-beneficiary',
    }) as never;

  /** Holds EVERY authorization-plane permission — the defence-in-depth case. */
  const matrixAdminContext = () =>
    ({
      actorId: FINANCE,
      actorType: 'USER',
      authorizedWaqfIds: [WAQF_A],
      permissions: [
        'admin:access_matrix:write',
        'approval:request:initiate',
        'approval:request:approve',
      ],
      requestId: 'test-nested-matrix-admin',
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
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // C-01 — the exploit itself, driven exactly as it was reproduced
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('C-01 · a NAZIR seat cannot be minted through a relation', () => {
    it('THE LIVE HOLE: waqf.update{accessGrants:{create}} from a FINANCE seat', async () => {
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const id = `${TEST_GRANT_PREFIX}01`;

      // The control: the identical row at top level is refused. If this ever stops being refused,
      // the nested assertion below proves nothing.
      const topLevel = await attempt(() =>
        client.waqfAccessGrant.create({
          data: { ...forgedGrant(`${TEST_GRANT_PREFIX}00`), userId: PROBE_SUBJECT, waqfId: WAQF_A },
        }),
      );
      expect(topLevel, 'the top-level control was permitted').toMatch(/AUTHORIZATION PLANE/);

      const nested = await attempt(() =>
        client.waqf.update({
          where: { id: WAQF_A },
          data: {
            accessGrants: {
              create: { ...forgedGrant(id), user: { connect: { id: PROBE_SUBJECT } } },
            },
          },
        }),
      );

      // Asserted on the REASON, not merely on "it threw": before the fix this payload committed,
      // and an empty/invalid payload would throw a Prisma validation error that means nothing.
      expect(nested, 'a NAZIR grant was minted under waqf.update').toMatch(/AUTHORIZATION PLANE/);
      expect(nested).toMatch(/accessGrants/);
      expect(await grantExists(id)).toBe(false);
      expect(await hasActiveNazirGrant(PROBE_SUBJECT, WAQF_A)).toBe(false);
    });

    it('THE LIVE HOLE: a PORTAL session minting itself a NAZIR grant via user.update{grants}', async () => {
      // The worst variant: `User` is UNSCOPED, so `scopeFilter` returned `null` and there was not
      // even a scope pre-check. A beneficiary is pinned to its OWN user row — which is precisely
      // the self-escalation case, and it worked.
      const client = db.createPrismaClient(beneficiaryContext()) as unknown as AnyClient;
      const id = `${TEST_GRANT_PREFIX}02`;

      const nested = await attempt(() =>
        client.user.update({
          where: { id: BENEFICIARY_USER },
          data: { grants: { create: { ...forgedGrant(id), waqf: { connect: { id: WAQF_A } } } } },
        }),
      );

      expect(nested, 'a portal session minted itself a NAZIR seat').toMatch(
        /beneficiary-scoped session|AUTHORIZATION PLANE/,
      );
      expect(await grantExists(id)).toBe(false);
      expect(
        await hasActiveNazirGrant(BENEFICIARY_USER, WAQF_A),
        'the database now believes a beneficiary portal login is the Nazir',
      ).toBe(false);
    });

    it('THE LIVE HOLE: a FINANCE seat minting a NAZIR grant onto a THIRD PARTY user row', async () => {
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const id = `${TEST_GRANT_PREFIX}03`;

      const nested = await attempt(() =>
        client.user.update({
          where: { id: PROBE_SUBJECT },
          data: { grants: { create: { ...forgedGrant(id), waqf: { connect: { id: WAQF_A } } } } },
        }),
      );

      expect(nested).toMatch(/AUTHORIZATION PLANE/);
      expect(await grantExists(id)).toBe(false);
      expect(await hasActiveNazirGrant(PROBE_SUBJECT, WAQF_A)).toBe(false);
    });

    it('refuses the nested form even for a caller who legitimately holds admin:access_matrix:write', async () => {
      // DEFENCE IN DEPTH. Issuing a grant is a top-level, gated, scoped, AUDITED act. Nothing
      // legitimate mints a seat as a by-product of editing a waqf — and the by-product is invisible
      // to the audit spine, which records the PARENT row's before/after and never names the child.
      const client = db.createPrismaClient(matrixAdminContext()) as unknown as AnyClient;
      const id = `${TEST_GRANT_PREFIX}04`;

      const nested = await attempt(() =>
        client.waqf.update({
          where: { id: WAQF_A },
          data: {
            accessGrants: {
              create: { ...forgedGrant(id), user: { connect: { id: PROBE_SUBJECT } } },
            },
          },
        }),
      );

      expect(nested).toMatch(/AUTHORIZATION PLANE/);
      expect(await grantExists(id)).toBe(false);
    });

    it('the forged row never exists, so the hash chain is never asked to vouch for it', async () => {
      // THE LAUNDERING, WHICH IS WORSE THAN THE ESCALATION. The nested INSERT produced no audit
      // event at all — the audit extension hooks `$allOperations` the same way, so the trail gained
      // only an `entityType:'User'` UPDATE and NOTHING named the grant. An ACTIVE second approval
      // authority existed with no record of its creation, and the APPROVE event it later signed
      // faithfully recorded `role:'NAZIR'` and the forged grantId — a true statement about a
      // fabricated fact. The only way to keep the spine honest here is for the row never to exist.
      const id = `${TEST_GRANT_PREFIX}05`;
      const subject = 'user-unscoped'; // holds no grant of any kind, so nothing masks the write
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;

      await attempt(() =>
        client.user.update({
          where: { id: subject },
          data: { grants: { create: { ...forgedGrant(id), waqf: { connect: { id: WAQF_A } } } } },
        }),
      );

      expect(await grantExists(id), 'the forged grant row was written').toBe(false);
      expect(await hasActiveNazirGrant(subject, WAQF_A)).toBe(false);
      const events = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM "audit_event" WHERE "entityId" = '${id}'`,
      );
      expect(events.length, 'an event names a grant that must not exist').toBe(0);
    });

    /**
     * THE SWEEP. Enumerates every writable relation whose target is an authorization-plane table,
     * from the DMMF, and drives a nested write down each one. A relation added to `schema.prisma`
     * tomorrow is covered the day it is added, with no edit here.
     */
    it('refuses a nested write down EVERY relation into the authorization plane (DMMF-derived)', async () => {
      const plane = new Set(Object.keys(db.AUTHORIZATION_PLANE_MODELS));
      const doors: { model: string; field: string; target: string }[] = [];
      for (const model of db.Prisma.dmmf.datamodel.models) {
        for (const field of model.fields) {
          if (field.kind === 'object' && plane.has(field.type)) {
            doors.push({ model: model.name, field: field.name, target: field.type });
          }
        }
      }

      expect(
        doors.length,
        'no relation into the authorization plane was found — the DMMF scan is broken, ' +
          'and this test would then pass vacuously',
      ).toBeGreaterThan(0);
      // The two doors the exploit actually used must be among them.
      expect(doors).toEqual(
        expect.arrayContaining([
          { model: 'Waqf', field: 'accessGrants', target: 'WaqfAccessGrant' },
          { model: 'User', field: 'grants', target: 'WaqfAccessGrant' },
        ]),
      );

      const client = db.createPrismaClient(matrixAdminContext()) as unknown as AnyClient;
      const permitted: string[] = [];
      for (const door of doors) {
        const delegate = delegateByName(
          client,
          door.model.charAt(0).toLowerCase() + door.model.slice(1),
        );
        const error = await attempt(() =>
          delegate.update({
            where: { id: 'does-not-need-to-exist' },
            data: { [door.field]: { create: {} } },
          }),
        );
        // The refusal must come from the force-filter, BEFORE Prisma ever validates the payload or
        // resolves the `where`. A PrismaClientValidationError here would mean the guard did not run.
        if (error === null || !/AUTHORIZATION PLANE/.test(error)) {
          permitted.push(
            `${door.model}.${door.field} -> ${door.target}: ${String(error).slice(0, 120)}`,
          );
        }
      }
      expect(permitted, 'a relation into the authorization plane is not guarded').toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // The nested payload gets the SAME policy the row would get at top level
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('nested rows are authorized exactly as top-level rows are', () => {
    /**
     * ⚠ THIS ASSERTION WAS INVERTED IN S2 ROUND 2, DELIBERATELY. IT USED TO EXPECT `null`.
     *
     * When this file was written, an AUTHORIZED nested create was permitted, and that was the
     * intended "subtraction, not a lockout" property: the walker refuses what the actor may not
     * write, and passes what it may. A re-attack then found the other half of the same door — a
     * PERMITTED nested write commits with NO audit event for the child row (it rewrote
     * `asset-001`'s title-deed number and left no trail), because `$allOperations` sees only the
     * TOP-LEVEL model and `auditedMutation` therefore recorded the parent `Waqf`. Gate G-1 says
     * every material write emits exactly one `audit_event`, so "authorized" was never sufficient.
     *
     * `assertNestedWritesAuditable` in `extensions/audit.ts` now refuses every nested write into an
     * audited model, and the argument for refusing rather than auditing the children is the block
     * comment above it. AUTHORIZATION IS STILL NOT THE REASON THIS IS REFUSED — the message must
     * come from the audit spine, not the force filter, which is what the second assertion pins. And
     * the no-lockout property is preserved below: the top-level equivalent still works.
     */
    it('refuses a nested create it AUTHORIZES, because the audit spine cannot record it (G-1)', async () => {
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const id = `${TEST_ASSET_PREFIX}01`;
      const error = await attempt(() =>
        client.waqf.update({
          where: { id: WAQF_A },
          data: { assets: { create: assetPayload(id) } },
        }),
      );
      expect(error, 'a nested write into an audited model was permitted').toMatch(
        /audit spine cannot record it/,
      );
      // NOT an authorization refusal: this payload is fully within the caller's scope.
      expect(error).not.toMatch(/AUTHORIZATION PLANE|no WaqfAccessGrant/);
      expect(
        (await prisma.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM "asset" WHERE "id" = '${id}'`))
          .length,
      ).toBe(0);
    });

    it('and the top-level equivalent still commits — a subtraction, not a lockout', async () => {
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const id = `${TEST_ASSET_PREFIX}01`;
      const error = await attempt(() => client.asset.create({ data: assetPayload(id, WAQF_A) }));
      expect(
        error,
        'the sanctioned top-level write was refused too — that IS a lockout',
      ).toBeNull();

      const [row] = await prisma.$queryRawUnsafe<{ waqfId: string }[]>(
        `SELECT "waqfId" FROM "asset" WHERE "id" = '${id}'`,
      );
      expect(row?.waqfId).toBe(WAQF_A);
    });

    it('refuses a nested create for a BENEFICIARY session, exactly as the top-level create is refused', async () => {
      const client = db.createPrismaClient(beneficiaryContext()) as unknown as AnyClient;
      const error = await attempt(() =>
        client.waqf.update({
          where: { id: WAQF_A },
          data: { assets: { create: assetPayload(`${TEST_ASSET_PREFIX}02`) } },
        }),
      );
      expect(error).toMatch(/beneficiary-scoped session/);
      expect(
        (
          await prisma.$queryRawUnsafe<unknown[]>(
            `SELECT 1 FROM "asset" WHERE "id" = '${TEST_ASSET_PREFIX}02'`,
          )
        ).length,
      ).toBe(0);
    });

    it('recurses to arbitrary depth: a plane write two hops down is still refused', async () => {
      const client = db.createPrismaClient(matrixAdminContext()) as unknown as AnyClient;
      const error = await attempt(() =>
        client.client.update({
          where: { id: 'client-001' },
          data: {
            waqifs: {
              update: {
                where: { id: 'waqif-001' },
                data: {
                  waqfs: {
                    update: { where: { id: WAQF_A }, data: { accessGrants: { create: {} } } },
                  },
                },
              },
            },
          },
        }),
      );
      expect(error).toMatch(/AUTHORIZATION PLANE/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // FAIL CLOSED — unknown field, unknown verb, unrecordable verb, re-parenting
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('fail-closed on anything the walker does not recognize', () => {
    it('refuses an unknown field in a write payload rather than handing it to Prisma', async () => {
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const error = await attempt(() =>
        client.asset.update({ where: { id: 'asset-001' }, data: { notARealField: 1 } }),
      );
      expect(error).toMatch(/is not a field of Asset/);
    });

    it('refuses an unknown nested verb', async () => {
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const error = await attempt(() =>
        client.waqf.update({ where: { id: WAQF_A }, data: { assets: { frobnicate: {} } } }),
      );
      expect(error).toMatch(/not a nested-write verb/);
    });

    it.each(['createMany', 'updateMany', 'deleteMany', 'delete'])(
      'refuses nested %s — the audit spine cannot record it, and a relation is not a loophole',
      async (verb) => {
        const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
        const error = await attempt(() =>
          client.waqf.update({ where: { id: WAQF_A }, data: { assets: { [verb]: {} } } }),
        );
        expect(error).toMatch(/not permitted through a relation/);
      },
    );

    it.each(['connect', 'set', 'disconnect'])(
      'refuses nested to-many %s — it re-parents rows by rewriting their foreign key',
      async (verb) => {
        const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
        const error = await attempt(() =>
          client.waqf.update({
            where: { id: WAQF_A },
            data: { assets: { [verb]: { id: 'asset-003' } } },
          }),
        );
        expect(error).toMatch(/re-parents existing Asset rows/);
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // C-04 and its siblings — the operation NAME must not decide authorization
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('C-04 · upsert’s create branch gets the CREATE policy', () => {
    it('refuses an out-of-scope waqfId through upsert, exactly as through create', async () => {
      // ctx holds `admin:access_matrix:write` and a grant on waqf-001 only. waqf-002 is a stranger's
      // endowment. Before the fix the ONLY difference between these two calls was the operation
      // NAME, and the `upsert` one created a live NAZIR seat there.
      const client = db.createPrismaClient(matrixAdminContext()) as unknown as AnyClient;
      const payload = {
        ...forgedGrant(`${TEST_GRANT_PREFIX}10`),
        userId: PROBE_SUBJECT,
        waqfId: WAQF_B,
      };

      const created = await attempt(() => client.waqfAccessGrant.create({ data: payload }));
      expect(created).toMatch(/no WaqfAccessGrant for waqf waqf-002/);

      const upserted = await attempt(() =>
        client.waqfAccessGrant.upsert({
          where: { id: `${TEST_GRANT_PREFIX}10` },
          update: {},
          create: payload,
        }),
      );
      expect(
        upserted,
        'upsert created a NAZIR grant on an endowment the caller holds nothing on',
      ).toMatch(/no WaqfAccessGrant for waqf waqf-002/);
      expect(await grantExists(`${TEST_GRANT_PREFIX}10`)).toBe(false);
    });

    it('refuses an out-of-scope upsert on an ORDINARY model held with NO permissions at all', async () => {
      // Broader than the grant case: ordinary models are not gated by the plane check, so before the
      // fix ANY authenticated seat with a grant on ANY one endowment could seed rows into any other.
      const client = db.createPrismaClient({
        actorId: FINANCE,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A],
        permissions: [],
        requestId: 'test-nested-nopermissions',
      } as never) as unknown as AnyClient;
      const id = `${TEST_ASSET_PREFIX}10`;

      expect(await attempt(() => client.asset.create({ data: assetPayload(id, WAQF_B) }))).toMatch(
        /no WaqfAccessGrant for waqf waqf-002/,
      );
      expect(
        await attempt(() =>
          client.asset.upsert({ where: { id }, update: {}, create: assetPayload(id, WAQF_B) }),
        ),
      ).toMatch(/no WaqfAccessGrant for waqf waqf-002/);

      const rows = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM "asset" WHERE "id" = '${id}'`,
      );
      expect(rows.length, 'the row was written to a stranger’s endowment').toBe(0);
    });

    it('resolves the endowment through a to-one `connect`, not only through a literal waqfId', async () => {
      // `assertCreateInScope` read `row.waqfId` and skipped anything that was not a string, with the
      // comment "set via a nested connect". So the endowment could be supplied through the door the
      // check was not looking at.
      const client = db.createPrismaClient({
        actorId: FINANCE,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A],
        permissions: [],
        requestId: 'test-nested-connect',
      } as never) as unknown as AnyClient;
      const id = `${TEST_ASSET_PREFIX}11`;

      const error = await attempt(() =>
        client.asset.create({
          data: { ...assetPayload(id), waqf: { connect: { id: WAQF_B } } },
        }),
      );
      expect(error, 'a `waqf: { connect }` walked straight past the scope check').toMatch(
        /no WaqfAccessGrant for waqf waqf-002/,
      );
      expect(
        (await prisma.$queryRawUnsafe<unknown[]>(`SELECT 1 FROM "asset" WHERE "id" = '${id}'`))
          .length,
      ).toBe(0);
    });

    it('refuses to RELOCATE an in-scope row into another endowment through update data', async () => {
      // The update path resolved the target row through the scope filter and then passed `data`
      // through unexamined, so `data.waqfId` could move the row out from under the filter that had
      // just authorized it.
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const error = await attempt(() =>
        client.asset.update({ where: { id: 'asset-001' }, data: { waqfId: WAQF_B } }),
      );
      expect(error).toMatch(/no WaqfAccessGrant for waqf waqf-002/);

      const [row] = await prisma.$queryRawUnsafe<{ waqfId: string }[]>(
        `SELECT "waqfId" FROM "asset" WHERE "id" = 'asset-001'`,
      );
      expect(row?.waqfId, 'an asset was relocated into another endowment').toBe(WAQF_A);
    });

    it('refuses the same relocation through upsert’s UPDATE branch', async () => {
      // `upsert` carries its update payload under `update`, not `data` — a second name for the
      // same door.
      const client = db.createPrismaClient(financeContext()) as unknown as AnyClient;
      const error = await attempt(() =>
        client.asset.upsert({
          where: { id: 'asset-001' },
          update: { waqfId: WAQF_B },
          create: assetPayload('asset-001'),
        }),
      );
      expect(error).toMatch(/no WaqfAccessGrant for waqf waqf-002/);

      const [row] = await prisma.$queryRawUnsafe<{ waqfId: string }[]>(
        `SELECT "waqfId" FROM "asset" WHERE "id" = 'asset-001'`,
      );
      expect(row?.waqfId).toBe(WAQF_A);
    });
  });
});
