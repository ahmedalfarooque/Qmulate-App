/**
 * PRIVILEGE ESCALATION THROUGH THE ACCESS MATRIX — the four live Sprint-1 holes, closed and pinned.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS ACTUALLY REACHABLE BEFORE THIS FILE EXISTED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 *  T-17  SELF-ISSUED GRANT. `WaqfAccessGrant` was listed in `WAQF_DIRECT_SCOPED_MODELS` and nowhere
 *        else, so the force-filter treated the AUTHORIZATION TABLE as ordinary endowment data.
 *        `assertCreateInScope` checked only that `row.waqfId ∈ ctx.authorizedWaqfIds` and nothing
 *        about the caller's permissions — `SCOPING_KNOWN_GAPS` said verbatim that `permissions` were
 *        "stored but not yet interpreted". Any caller with any write-capable grant on endowment A
 *        could INSERT a `NAZIR` grant for THEMSELVES on A. A live second-approval-authority path.
 *        → MP-17, MP-18, MP-19
 *
 *  T-25  BYPASS ON A USER CONTEXT. `makeSystemContext` spread `...overrides` AFTER
 *        `bypass: 'system-job'`, so `makeSystemContext({ actorType: 'USER', actorId: 'u1' })`
 *        returned an AUTHENTICATED USER context with the force-filter lifted. `scopeFilter` returns
 *        `null` — no filter at all — at step 2, BEFORE beneficiary isolation, grants or AML are ever
 *        consulted.
 *        → MP-22
 *
 *  T-27  AML BLANKET. `amlClause()` returned `null` — NO restriction whatsoever — the instant
 *        `ctx.canViewAmlRestricted` was true, before the per-waqf compartment list was consulted;
 *        and `makeSystemContext` defaulted that flag to `true`. §10 §6's compartment is INVISIBILITY,
 *        not redaction, and the Nazir is NOT a member by default.
 *        → MP-25, MP-26
 *
 *  T-18  BENEFICIARY ESCALATION BY UPDATE. The beneficiary guard lived ONLY inside
 *        `assertCreateInScope`; `UNIQUE_WRITE_OPS` (update/delete/upsert) authorized by a scope
 *        PRE-CHECK and then passed the caller's `where` through as written; and `scopeFilter`'s
 *        beneficiary switch had no `WaqfAccessGrant` case, falling through to the ordinary
 *        `{waqfId: {in: ids}}`. So a beneficiary portal session could run
 *        `waqfAccessGrant.update({ where: { id: <own grant> }, data: { role: 'NAZIR' } })`.
 *        → MP-15, MP-16
 *
 * Plus MP-13 (a client-level `Membership` can never confer a seat) and MP-14 (grant validity).
 *
 * Both layers are asserted: the TypeScript force-filter AND, from a raw connection, the Postgres
 * constraints and triggers — because `SCOPING_KNOWN_GAPS` records that this extension "does not
 * survive raw SQL", so a TypeScript-only proof is one `$executeRawUnsafe` from irrelevant.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  accessMatrixClient,
  assertGuardsInstalled,
  authzScaffoldingSql,
  privilegedPrisma,
  closeDatabase,
  databaseModule,
  delegateByName,
  ensureSeeded,
  errorText,
  FICTIONAL_MARKER_AR,
  hasDatabase,
  provisionGrants,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase(
  'MP-13 … MP-19, MP-22, MP-25, MP-26 (privilege escalation through the access matrix)',
);

const WAQF_A = 'waqf-001';
const WAQF_B = 'waqf-002';
const CLIENT_ID = 'client-001';

const NAZIR = 'user-approver-001';
const FINANCE = 'user-accountant-001';
const BENEFICIARY_USER = 'user-beneficiary-ben-001';
const BENEFICIARY_SELF_ID = 'ben-001';
const ADMIN = 'user-seed-admin';
/**
 * The subject every PROBE grant is issued to.
 *
 * NOT `user-unscoped`: that seat is documented as the V-5 negative subject and "must never be given
 * a grant", and `seed.integration.test.ts` asserts it holds exactly zero. A probe row that leaked
 * would turn that assertion into a false alarm about the SEED. `user-family-board` already holds
 * grants, so an extra one proves nothing accidental — and crucially it holds NO `NAZIR` grant, which
 * is what makes the MP-14 validity cases non-vacuous.
 */
const PROBE_SUBJECT = 'user-family-board';
const UNSCOPED = 'user-unscoped';

/** Test-created rows live in a 9xxx series so cleanup can delete exactly this range. */
const TEST_GRANT_PREFIX = 'grant-esc-9';
const TEST_MEMBERSHIP_PREFIX = 'membership-esc-9';

interface PrismaLike {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}

function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}

interface GrantSql {
  readonly id: string;
  readonly userId: string;
  readonly waqfId?: string;
  readonly role?: string;
  readonly permissions?: readonly string[];
  readonly grantedByUserId?: string;
  readonly canViewAmlRestricted?: boolean;
  readonly amlCompartment?: boolean;
  readonly beneficiarySelfId?: string | null;
  readonly validFrom?: string;
  readonly validUntil?: string | null;
  readonly revokedAt?: string | null;
}

/**
 * A raw `waqf_access_grant` INSERT, wrapped so it can be laid down as SCAFFOLDING.
 *
 * ⚠ WHY THE WRAPPER. `00000000000005_e2_grant_admission` refuses any grant INSERT that is not inside
 * a transaction appending an `audit_event` naming it, by an actor holding `admin:access_matrix:write`
 * on that endowment — i.e. exactly this statement. Closing that hole is the S2 round-2 headline: a
 * FINANCE seat, correctly refused by its own scoped delegate, re-issued the byte-identical row
 * through `$executeRawUnsafe` ON THAT SAME CLIENT and it COMMITTED, on two endowments, with zero
 * audit events. `test/grant-admission.integration.test.ts` proves the closure, including by
 * re-running the whole attack chain with the guard disabled.
 *
 * The rows built here are FIXTURE SCAFFOLDING for OTHER assertions — validity windows, the AML flag
 * pair, `no_self_issue`, the beneficiary pin — so they go down through `authzScaffoldingSql()`,
 * which disables admission and re-enables it inside ONE `DO` block, i.e. one transaction. The CHECKs
 * and the other triggers these cases are actually about are untouched, so a statement expected to be
 * refused is still refused by the guard it is about.
 */
function insertGrantSql(options: GrantSql): string {
  const {
    id,
    userId,
    waqfId = WAQF_A,
    role = 'FINANCE',
    permissions = [],
    grantedByUserId = ADMIN,
    canViewAmlRestricted = false,
    amlCompartment = false,
    beneficiarySelfId = null,
    validFrom = 'now()',
    validUntil = null,
    revokedAt = null,
  } = options;
  const array = `ARRAY[${permissions.map((p) => `'${p}'`).join(',')}]::text[]`;
  return authzScaffoldingSql([
    `INSERT INTO "waqf_access_grant"
      ("id","userId","waqfId","role","permissions","dataScopes","canViewAmlRestricted",
       "amlCompartment","beneficiarySelfId","scopeRefs","grantedByUserId","validFrom","validUntil",
       "revokedAt","createdAt","updatedAt")
    VALUES ('${id}','${userId}','${waqfId}','${role}'::"Role", ${array}, ARRAY[]::text[],
            ${String(canViewAmlRestricted)}, ${String(amlCompartment)},
            ${beneficiarySelfId === null ? 'NULL' : `'${beneficiarySelfId}'`}, ARRAY[]::text[],
            '${grantedByUserId}', ${validFrom}, ${validUntil ?? 'NULL'}, ${revokedAt ?? 'NULL'},
            now(), now())`,
  ]);
}

describe.skipIf(!hasDatabase)('privilege escalation through the access matrix', () => {
  let prisma: PrismaLike;
  let db: Awaited<ReturnType<typeof databaseModule>>;

  const attempt = async (sql: string): Promise<string | null> => {
    try {
      await prisma.$executeRawUnsafe(sql);
      return null;
    } catch (error: unknown) {
      return errorText(error);
    }
  };

  const cleanup = async (): Promise<void> => {
    // Wrapped: some of these rows go down through the AUDITED path, and migration 5 refuses a bare
    // `DELETE` on any grant the trail records (C-09). Wrapping the whole sweep, rather than only the
    // audited ids, keeps teardown reliable when a test failed part-way through.
    await prisma.$executeRawUnsafe(
      authzScaffoldingSql([
        `DELETE FROM "waqf_access_grant" WHERE "id" LIKE '${TEST_GRANT_PREFIX}%'`,
      ]),
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "membership" WHERE "id" LIKE '${TEST_MEMBERSHIP_PREFIX}%'`,
    );
  };

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
  // MP-22 — a bypass is INVALID on a USER context (T-25)
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-22 · bypass is invalid on a non-SYSTEM context', () => {
    it('makeSystemContext refuses to build a USER context with a bypass', () => {
      // The exact Sprint-1 call. It used to return an AUTHENTICATED USER context with the
      // force-filter lifted, because the spread put `...overrides` after `bypass: 'system-job'`.
      expect(() => db.makeSystemContext({ actorType: 'USER', actorId: 'u1' } as never)).toThrow(
        db.InvalidBypassError,
      );
      expect(() => db.makeSystemContext({ actorType: 'SERVICE' } as never)).toThrow(
        db.InvalidBypassError,
      );
    });

    it('createPrismaClient refuses a hand-built USER context carrying a bypass', () => {
      // The factory is not the only route to a context: an object literal, an `as never` cast, or a
      // context deserialized from a job payload all reach `createPrismaClient` directly. That is why
      // the assertion lives at the client chokepoint too.
      expect(() =>
        db.createPrismaClient({
          actorId: 'u1',
          actorType: 'USER',
          authorizedWaqfIds: [],
          bypass: 'system-job',
        } as never),
      ).toThrow(db.InvalidBypassError);

      expect(() =>
        db.createPrismaClient({
          actorId: 'svc',
          actorType: 'SERVICE',
          authorizedWaqfIds: [],
          bypass: 'migration',
        } as never),
      ).toThrow(/may only be lifted for a SYSTEM actor/);
    });

    it('isBypassed is false for a USER context even when `bypass` is set', () => {
      // The predicate re-checks the actor type rather than trusting the field. It is the ONE thing
      // standing between a context and an unfiltered query, so it must not be satisfiable by the
      // `bypass` value alone — and a context CAN be built as a bare literal (tests do it).
      const forged = {
        actorId: 'u1',
        actorType: 'USER',
        authorizedWaqfIds: [],
        bypass: 'migration',
      } as never;
      expect(db.isBypassed(forged)).toBe(false);
      // …and the force-filter therefore still applies, rather than returning `null`.
      expect(db.scopeFilter('Waqf', forged)).toEqual({ id: { in: [] } });
    });

    it('still allows the legitimate SYSTEM bypass, and defaults AML clearance to FALSE', () => {
      const ctx = db.makeSystemContext({ actorId: 'user-seed-admin', requestId: 'seed' });
      expect(ctx.actorType).toBe('SYSTEM');
      expect(ctx.bypass).toBe('system-job');
      expect(db.isBypassed(ctx)).toBe(true);
      // Was `true` in Sprint 1, which combined with amlClause()'s short-circuit to mean "a system
      // context sees the whole AML compartment". A bypassed context does not need it — `scopeFilter`
      // returns `null` at step 2 before AML is consulted — so the flag was pure blast radius.
      expect(ctx.canViewAmlRestricted).toBe(false);
      expect(db.SYSTEM_CONTEXT.canViewAmlRestricted).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MP-17 / MP-18 / MP-19 — the authorization plane (T-17)
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-17 · writing waqf_access_grant requires admin:access_matrix:write', () => {
    /** A real FINANCE caller on waqf-001 — a write-capable grant, and nothing more. */
    const financeContext = () =>
      ({
        actorId: FINANCE,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A],
        permissions: ['finance:transaction:read', 'finance:transaction:write'],
        requestId: 'test-self-issue',
      }) as never;

    it('DENIES a FINANCE caller creating a NAZIR grant for themselves', async () => {
      const client = db.createPrismaClient(financeContext());
      await expect(
        client.waqfAccessGrant.create({
          data: {
            id: `${TEST_GRANT_PREFIX}001`,
            userId: FINANCE,
            waqfId: WAQF_A, // IN their authorized set — the only thing Sprint 1 checked
            role: 'NAZIR',
            permissions: ['approval:request:approve'],
            dataScopes: [],
            scopeRefs: [],
            grantedByUserId: FINANCE,
            validFrom: new Date(),
          },
        }),
      ).rejects.toThrow(/AUTHORIZATION PLANE/);

      expect(
        await prisma.$queryRawUnsafe<{ n: string }[]>(
          `SELECT count(*)::text AS n FROM "waqf_access_grant" WHERE "id" = '${TEST_GRANT_PREFIX}001'`,
        ),
      ).toEqual([{ n: '0' }]);
    });

    it('DENIES the same caller UPDATING an existing grant — not only CREATE', async () => {
      // Sprint 1's guard existed only in `assertCreateInScope`. Update, delete, upsert, updateMany
      // and deleteMany were governed by the scope pre-check and nothing else.
      const client = db.createPrismaClient(financeContext());
      const own = `grant-${FINANCE}-${WAQF_A}`;
      await expect(
        client.waqfAccessGrant.update({ where: { id: own }, data: { dataScopes: ['aml'] } }),
      ).rejects.toThrow(/AUTHORIZATION PLANE/);
      await expect(
        client.waqfAccessGrant.updateMany({ where: {}, data: { dataScopes: ['aml'] } }),
      ).rejects.toThrow(/AUTHORIZATION PLANE/);
      await expect(client.waqfAccessGrant.delete({ where: { id: own } })).rejects.toThrow(
        /AUTHORIZATION PLANE/,
      );
    });

    it('DENIES a caller whose permissions are ABSENT — an unresolved context grants nothing', async () => {
      // The opposite of Sprint 1, where `permissions` were "stored but not yet interpreted" and
      // therefore equivalent to "granted". Absent must mean nothing, not everything.
      const client = db.createPrismaClient({
        actorId: FINANCE,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A],
        requestId: 'test-no-permissions',
      } as never);
      await expect(
        client.waqfAccessGrant.create({
          data: {
            id: `${TEST_GRANT_PREFIX}002`,
            userId: FINANCE,
            waqfId: WAQF_A,
            role: 'NAZIR',
            permissions: [],
            dataScopes: [],
            scopeRefs: [],
            grantedByUserId: ADMIN,
            validFrom: new Date(),
          },
        }),
      ).rejects.toThrow(/AUTHORIZATION PLANE/);
    });

    it('ALLOWS an admin holding admin:access_matrix:write — the gate is a permission, not a ban', async () => {
      // ⚠ THE PERMISSION IS NOW BACKED BY A REAL SEAT, NOT MERELY CLAIMED IN A CONTEXT.
      // This case used to assert the positive path for a hand-built context whose actor
      // (`user-test-access-admin`) held no grant at all, and which named a THIRD PARTY as the issuer.
      // `00000000000005_e2_grant_admission` closes both: it checks `admin:access_matrix:write`
      // against an ACTIVE grant on that endowment ("a claim in a request context is not authority")
      // and binds `grantedByUserId` to the acting identity. The test is stronger for it — before, it
      // proved only that a context can assert its own authority.
      //
      // The admin seat itself is PROVISIONED, because no seeded grant on this endowment can issue it:
      // a first administrator has to come from provisioning.
      //
      // ⚠ AND SINCE MIGRATION 9 PROVISIONING IS A PRIVILEGE, NOT A CLAIM. This used to be written on a
      // `makeSystemContext()` and admitted by `qmulate_grant_admission()`'s `actorType = 'SYSTEM'`
      // disjunct. `00000000000009_e2_close_system_marker` deleted that disjunct — a caller who writes
      // the marker row chooses `actorType`, and a FINANCE seat used the claim to mint itself an ACTIVE
      // NAZIR seat and approve another maker's SAR 4.5m bank movement. `provisionGrants()` suspends
      // admission explicitly (OWNER-only) and keeps the write audited.
      const ADMIN_SEAT = `${TEST_GRANT_PREFIX}00A`;
      const ACCESS_ADMIN = NAZIR; // `user-approver-001` — an existing User row, which the FK needs

      // ⚠ NOT `ADMIN` (= 'user-seed-admin') as the ACTOR: `seed.integration.test.ts` asserts the
      // count of audit events with that actorId is a whole multiple of one seed run, so one extra
      // event attributed to the seed actor turns E1-4 red from this file. Measured, not guessed.
      const PROVISIONER = 'user-test-esc-provisioner';
      await provisionGrants(
        db.makeSystemContext({
          actorId: PROVISIONER,
          authorizedWaqfIds: [WAQF_A],
          requestId: 'test-admin-bootstrap',
        }),
        async (tx) => {
          await tx.waqfAccessGrant.create({
            data: {
              id: ADMIN_SEAT,
              userId: ACCESS_ADMIN,
              waqfId: WAQF_A,
              role: 'SYSTEM_ADMIN',
              permissions: ['admin:access_matrix:read', 'admin:access_matrix:write'],
              dataScopes: [],
              scopeRefs: [],
              grantedByUserId: PROVISIONER, // = the acting provisioning identity
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
            },
          });
        },
      );

      const client = // ⚠ THE PROVISIONING CONNECTION (ADR-0008 round 6), NOT `createPrismaClient()`.
        // Since privilege separation the app role holds NO INSERT/UPDATE on `waqf_access_grant`, so a
        // grant write through the ordinary client is refused by the ACL — `42501 permission denied for
        // table waqf_access_grant` — before any guard is consulted, and every assertion below about WHY
        // a write is admitted or refused would be measuring the ACL instead. `accessMatrixClient()` is
        // the connection the shipped `provisionAccessGrant()` uses, and its guards are FULLY live: it
        // owns nothing, so it cannot suspend the admission trigger.
        accessMatrixClient({
          actorId: ACCESS_ADMIN,
          actorType: 'USER',
          authorizedWaqfIds: [WAQF_A],
          permissions: ['admin:access_matrix:write', 'admin:access_matrix:read'],
          requestId: 'test-admin-issue',
        } as never);

      await db.withAudit(client, async (tx) => {
        await tx.waqfAccessGrant.create({
          data: {
            id: `${TEST_GRANT_PREFIX}003`,
            userId: PROBE_SUBJECT, // NOT the admin: a self-issued grant is refused by the DB CHECK
            waqfId: WAQF_A,
            role: 'FINANCE',
            permissions: ['finance:transaction:read'],
            dataScopes: [],
            scopeRefs: [],
            grantedByUserId: ACCESS_ADMIN, // the acting identity; a third party cannot commit
            validFrom: new Date(),
          },
        });
      });

      const [row] = await prisma.$queryRawUnsafe<{ role: string }[]>(
        `SELECT "role"::text AS role FROM "waqf_access_grant" WHERE "id" = '${TEST_GRANT_PREFIX}003'`,
      );
      expect(row?.role).toBe('FINANCE');
      // Both rows went down through the AUDITED path, so the trail records them and migration 5
      // refuses a bare `DELETE` (C-09). The scaffolding wrapper says so out loud.
      await prisma.$executeRawUnsafe(
        authzScaffoldingSql([
          `DELETE FROM "waqf_access_grant" WHERE "id" IN ('${TEST_GRANT_PREFIX}003', '${ADMIN_SEAT}')`,
        ]),
      );
    });

    it('makes a SELF-ISSUED grant unrepresentable in Postgres, whoever writes the statement', async () => {
      const error = await attempt(
        insertGrantSql({
          id: `${TEST_GRANT_PREFIX}010`,
          userId: FINANCE,
          grantedByUserId: FINANCE, // grantedByUserId = userId
          role: 'NAZIR',
        }),
      );
      expect(error, 'a self-issued grant was INSERTed from raw SQL').not.toBeNull();
      expect(error).toMatch(/waqf_access_grant_no_self_issue/);
    });

    it('classifies WaqfAccessGrant as authorization plane AND keeps it read-scoped', () => {
      // Both, deliberately. An admin managing endowment A must still be able to LIST A's grants, so
      // the model stays `waqfId`-scoped for reads; what changed is that WRITES need a permission.
      expect(Object.keys(db.AUTHORIZATION_PLANE_MODELS).sort()).toEqual([
        'ApprovalRequest',
        'Membership',
        'WaqfAccessGrant',
      ]);
      expect(db.WAQF_DIRECT_SCOPED_MODELS).toContain('WaqfAccessGrant');
      expect(db.AUTHORIZATION_PLANE_MODELS.WaqfAccessGrant).toBe('admin:access_matrix:write');
    });
  });

  describe('MP-18 / MP-19 · the preset is the ceiling, enforced in Postgres too', () => {
    it('refuses an approve permission on a NON-NAZIR grant (D-1 / D-2)', async () => {
      // A grant that keeps `role = FINANCE` while appending `distribution:run:approve` is a second
      // approval authority that every role-shaped check misses.
      for (const permission of [
        'distribution:run:approve',
        'approval:request:approve',
        'legal:reserved_matter:sign',
        'endowment:deed:sign',
      ]) {
        const error = await attempt(
          insertGrantSql({
            id: `${TEST_GRANT_PREFIX}020`,
            userId: PROBE_SUBJECT,
            role: 'FINANCE',
            permissions: [permission],
          }),
        );
        expect(error, `${permission} was accepted on a FINANCE grant`).not.toBeNull();
        expect(error).toMatch(/Approve and sign belong to the NAZIR alone/);
      }
    });

    it.each([
      ['LEADERSHIP (D-1: read-only, no approve on any module)', 'LEADERSHIP'],
      ['AUTHORIZED_REP (D-2: never approves, in any combination)', 'AUTHORIZED_REP'],
      [
        'FAMILY_BOARD (§9 calls its consent an "approval"; §3 gives it no A/S cell)',
        'FAMILY_BOARD',
      ],
      ['SYSTEM_ADMIN (config authority is not governance authority)', 'SYSTEM_ADMIN'],
      ['AML_OFFICER (an AML decision can only BLOCK)', 'AML_OFFICER'],
    ])('refuses distribution:run:approve on %s', async (_label, role) => {
      const error = await attempt(
        insertGrantSql({
          id: `${TEST_GRANT_PREFIX}021`,
          userId: PROBE_SUBJECT,
          role,
          permissions: ['distribution:run:approve'],
          // BENEFICIARY/self-pin CHECK does not apply to these roles.
        }),
      );
      expect(error).not.toBeNull();
      expect(error).toMatch(/Approve and sign belong to the NAZIR alone/);
    });

    it('ALLOWS an approve permission on a NAZIR grant — the exception is exactly one role', async () => {
      const error = await attempt(
        insertGrantSql({
          id: `${TEST_GRANT_PREFIX}022`,
          userId: PROBE_SUBJECT,
          role: 'NAZIR',
          permissions: ['approval:request:approve', 'distribution:run:sign'],
        }),
      );
      expect(error, `a legitimate NAZIR grant was refused: ${String(error)}`).toBeNull();
      await prisma.$executeRawUnsafe(
        `DELETE FROM "waqf_access_grant" WHERE "id" = '${TEST_GRANT_PREFIX}022'`,
      );
    });

    it.each([
      ['a wildcard', '*'],
      ['a module wildcard', 'approval:*'],
      ['a resource wildcard', 'approval:request:*'],
      ['a two-segment string', 'approval:approve'],
      ['a four-segment string', 'approval:request:approve:extra'],
      ['an unknown verb', 'finance:transaction:create'],
      ['a typo of approve', 'distribution:run:aprove'],
      ['an empty segment', 'finance::read'],
      ['an empty string', ''],
    ])('refuses %s as a permission string', async (_label, permission) => {
      const error = await attempt(
        insertGrantSql({
          id: `${TEST_GRANT_PREFIX}023`,
          userId: PROBE_SUBJECT,
          role: 'FINANCE',
          permissions: [permission],
        }),
      );
      expect(error, `${JSON.stringify(permission)} was stored`).not.toBeNull();
      expect(error).toMatch(/wildcard|three-segment|five closed verbs/);
    });

    it('the seeded fixture grants all load under the guard — the seed is not exempt', async () => {
      // The guard fires on the seed's own INSERTs too, so this is really a statement about the
      // fixture: its PROVISIONAL Sprint-1 strings (`waqf:waqf:update`, `finance:transaction:create`,
      // `portal:statement:read`) would NOT have loaded, which is why they were rewritten.
      const rows = await prisma.$queryRawUnsafe<{ permissions: string[]; role: string }[]>(
        `SELECT "permissions", "role"::text AS role FROM "waqf_access_grant" WHERE "id" LIKE 'grant-user-%'`,
      );
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        for (const permission of row.permissions) {
          expect(permission.split(':')).toHaveLength(3);
          expect(['read', 'write', 'initiate', 'approve', 'sign']).toContain(
            permission.split(':')[2],
          );
          if (permission.endsWith(':approve') || permission.endsWith(':sign')) {
            expect(row.role, `${permission} on a ${row.role} grant`).toBe('NAZIR');
          }
        }
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MP-15 — a grant's role is write-once
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-15 · waqf_access_grant.role is immutable', () => {
    it('refuses a raw UPDATE that changes role', async () => {
      const error = await attempt(
        `UPDATE "waqf_access_grant" SET "role" = 'NAZIR' WHERE "id" = 'grant-${FINANCE}-${WAQF_A}'`,
      );
      expect(error, 'a FINANCE grant was promoted to NAZIR in place').not.toBeNull();
      expect(error).toMatch(/role is write-once/);
      expect(error).toMatch(/revoke this grant/);
    });

    it('refuses it under session_replication_role = replica', async () => {
      const error = await attempt(
        `DO $probe$ BEGIN
           SET LOCAL session_replication_role = 'replica';
           UPDATE "waqf_access_grant" SET "role" = 'NAZIR' WHERE "id" = 'grant-${FINANCE}-${WAQF_A}';
         END $probe$;`,
      );
      expect(error, 'one plain SET skipped the role-immutability trigger').not.toBeNull();
      expect(error).toMatch(/role is write-once/);
    });

    it('refuses re-pointing a grant at another person or another endowment', async () => {
      expect(
        await attempt(
          `UPDATE "waqf_access_grant" SET "userId" = '${UNSCOPED}' WHERE "id" = 'grant-${FINANCE}-${WAQF_A}'`,
        ),
      ).toMatch(/write-once/);
      expect(
        await attempt(
          `UPDATE "waqf_access_grant" SET "waqfId" = '${WAQF_B}' WHERE "id" = 'grant-${FINANCE}-${WAQF_A}'`,
        ),
      ).toMatch(/write-once/);
    });

    it('refuses UN-revoking a grant — revocation is one-way', async () => {
      await prisma.$executeRawUnsafe(
        insertGrantSql({
          id: `${TEST_GRANT_PREFIX}030`,
          userId: PROBE_SUBJECT,
          role: 'FINANCE',
          revokedAt: 'now()',
        }),
      );
      const error = await attempt(
        `UPDATE "waqf_access_grant" SET "revokedAt" = NULL WHERE "id" = '${TEST_GRANT_PREFIX}030'`,
      );
      expect(error, 'a revoked grant was restored with no issue record').not.toBeNull();
      expect(error).toMatch(/revocation is one-way/);
    });

    it('ALLOWS revoking — escalation is revoke + re-issue, and both halves must work', async () => {
      // WAQF_B, not WAQF_A: `…030` above already holds (PROBE_SUBJECT, waqf-001, FINANCE) and
      // `@@unique([userId, waqfId, role])` would reject a second one — a collision that reads as a
      // guard failure while actually being test scaffolding.
      await prisma.$executeRawUnsafe(
        insertGrantSql({
          id: `${TEST_GRANT_PREFIX}031`,
          userId: PROBE_SUBJECT,
          waqfId: WAQF_B,
          role: 'FINANCE',
        }),
      );
      expect(
        await attempt(
          `UPDATE "waqf_access_grant" SET "revokedAt" = now() WHERE "id" = '${TEST_GRANT_PREFIX}031'`,
        ),
      ).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MP-16 — a beneficiary session cannot touch the authorization plane (T-18)
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-16 · beneficiary self-isolation covers every write, and empties the read set', () => {
    const beneficiaryContext = () =>
      ({
        actorId: BENEFICIARY_USER,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A],
        beneficiarySelfId: BENEFICIARY_SELF_ID,
        permissions: ['beneficiary:beneficiary:read', 'reporting:statement:read'],
        requestId: 'test-beneficiary-escalation',
      }) as never;

    it('THE LIVE HOLE: cannot update its own grant to NAZIR', async () => {
      const client = db.createPrismaClient(beneficiaryContext());
      const ownGrant = `grant-${BENEFICIARY_USER}-${WAQF_A}`;

      await expect(
        client.waqfAccessGrant.update({ where: { id: ownGrant }, data: { role: 'NAZIR' } }),
      ).rejects.toThrow();

      const [row] = await prisma.$queryRawUnsafe<{ role: string }[]>(
        `SELECT "role"::text AS role FROM "waqf_access_grant" WHERE "id" = '${ownGrant}'`,
      );
      expect(row?.role, 'a beneficiary portal session became the Nazir').toBe('BENEFICIARY');
    });

    /* ─────────────────────────────────────────────────────────────────────────────────────
     * S8/E7 · THE COMPLIANCE PLANE — DRIVEN, not asserted as a filter shape
     *
     * `scopeFilter()` returning `{id:{in:[]}}` is a shape assertion, and a shape assertion is not
     * a test (S2's lesson): it proves what the function returns, not what a query returns. So this
     * drives real reads through a real portal-scoped client, and — the half that makes it mean
     * anything — proves the SAME rows are visible to a staff seat on the SAME endowment. Without
     * that contrast an empty result is indistinguishable from an empty table, which is exactly how
     * `retention-remainder-delete` describes a DELETE against nothing reading as a working control.
     * ───────────────────────────────────────────────────────────────────────────────────────── */

    it('a portal session reads NO compliance task — while a staff seat on the same endowment reads them', async () => {
      const staffContext = () =>
        ({
          actorId: 'test-staff-compliance-reader',
          actorType: 'USER',
          authorizedWaqfIds: [WAQF_A],
          beneficiarySelfId: null,
          permissions: ['compliance:task:read'],
          requestId: 'test-staff-compliance-read',
        }) as never;

      const staff = db.createPrismaClient(staffContext());
      const portal = db.createPrismaClient(beneficiaryContext());

      const staffTasks = await staff.complianceTask.findMany({ where: { waqfId: WAQF_A } });
      const portalTasks = await portal.complianceTask.findMany({ where: { waqfId: WAQF_A } });

      // THE PREMISE. If the fixture ever stops seeding tasks on this endowment the contrast below
      // becomes vacuous, and it would pass — loudly wrong in the direction of false comfort.
      expect(
        staffTasks.length,
        'the fixture seeds no compliance task on waqf-001, so this test proves nothing',
      ).toBeGreaterThan(0);
      expect(portalTasks).toEqual([]);
    });

    it.each(['ComplianceTask', 'GovernmentFiling', 'Deadline', 'LegalCase', 'ZakatFiling'])(
      'the compliance plane is EMPTY for a portal session: %s',
      (model) => {
        // Belt to the driven test above, and the one that covers the four tables the fixture seeds
        // ZERO rows into — where a real query would return `[]` whatever the filter said, so the
        // filter is the only thing that CAN be checked. Recorded as such rather than presented as
        // proof of suppression.
        expect(db.scopeFilter(model, beneficiaryContext())).toEqual({ id: { in: [] } });
      },
    );

    it.each(['WaqfAccessGrant', 'ApprovalRequest', 'Membership', 'BankAccount', 'NazirFee'])(
      'returns an EMPTY read set for %s',
      (model) => {
        // EMPTY, not "the ordinary waqf-scoped set". `Membership` in particular used to be narrowed
        // to the caller's OWN rows — which is the one row that tells a beneficiary a seat exists to
        // be escalated.
        expect(db.scopeFilter(model, beneficiaryContext())).toEqual({ id: { in: [] } });
      },
    );

    it.each(['WaqfAccessGrant', 'ApprovalRequest', 'Membership', 'BankAccount', 'NazirFee'])(
      'denies every write operation on %s',
      async (model) => {
        const client = db.createPrismaClient(beneficiaryContext()) as unknown as Record<
          string,
          Record<string, (args: unknown) => Promise<unknown>>
        >;
        // ⚠ `delegateByName`, NOT AN INDEX READ. The name is computed from `it.each`'s model list at
        // runtime, so `noUncheckedIndexedAccess` made both `delegate` and `delegate[operation]`
        // possibly-undefined — and the old `expect(delegate).toBeDefined()` did not narrow the
        // second one. A missing delegate would have thrown inside `expect(...).rejects.toThrow(…)`
        // and matched nothing, turning "the write was denied" into "the probe could not find the
        // model". The helper throws with that reasoning spelled out instead.
        const delegate = delegateByName(client, model.charAt(0).toLowerCase() + model.slice(1));

        for (const operation of [
          'update',
          'delete',
          'upsert',
          'updateMany',
          'deleteMany',
        ] as const) {
          await expect(
            delegate[operation]({
              where: { id: 'anything' },
              data: {},
              create: {},
              update: {},
            }),
            `${model}.${operation} was permitted for a beneficiary session`,
          ).rejects.toThrow(/beneficiary-scoped session|FORBIDDEN_SCOPE/);
        }
      },
    );

    it('still lets the beneficiary read its OWN record — isolation, not a lockout', () => {
      const filter = db.scopeFilter('Beneficiary', beneficiaryContext()) as {
        AND: Record<string, unknown>[];
      };
      expect(filter.AND).toEqual(
        expect.arrayContaining([{ id: BENEFICIARY_SELF_ID }, { waqfId: { in: [WAQF_A] } }]),
      );
    });

    it('names the forbidden models in ONE reviewable list', () => {
      // ⊕ WIDENED FROM FIVE TO TEN IN S8/E7, and the pin is kept exact rather than relaxed to a
      // `arrayContaining` — the whole value of this assertion is that the list cannot grow or shrink
      // without somebody writing down why. The five added are the COMPLIANCE PLANE, every one of
      // which previously reached `default: break` in `scopeFilter`'s beneficiary branch and was
      // therefore readable by any portal session for the entire endowment: its statutory duties and
      // their status, its Authority filing statuses, its deadline clocks, its litigation, its zakat
      // filings. Nothing legitimate reached them (the `beneficiary` preset holds no `compliance:*`
      // verb) — which is the same "unreachable through a procedure, wide open through the force
      // filter" state the AuditEvent and WaqfAccessGrant holes were in, and E7 ships the router that
      // ends it.
      // ⊕ TWELVE since migration 29: the AML compartment's own tables joined the list. A beneficiary
      // named as a related party in a SAR is its SUBJECT, and §09 C2 says the subject must see
      // nothing that references or implies the report. `amlClause` already subtracts these rows from
      // any non-member and a portal seat is never a member — but relying on that alone would make C2
      // depend on the compartment list rather than on self-isolation, and they are separate controls.
      // Belt: a portal read of these tables is EMPTY before the compartment predicate is consulted,
      // so revoking a membership can never accidentally open a subject's own file to them.
      // ⊕ FOURTEEN since migration 41 (S9-3d): `EscalationEvent`, and it is the SHARPEST member of
      // this list rather than the mildest. An escalation row says a statutory duty on this endowment
      // went overdue, how many business days late it is, and how far up the Nazir's own management
      // chain it has been reported. §09 rule 1 singles out the escalation pipeline as the
      // highest-risk outbound path; a beneficiary in dispute with the Nazir reading the escalation
      // history is that risk arriving through the force filter instead of through a notification.
      //
      // ⊕ THIRTEEN since migration 40 (S9-3c): `MaterialChange`, refused for `Deadline`'s reason one
      // table earlier in the chain. A change row states that an ASSET, a BENEFICIARY or the NAZARAH
      // changed, on an effective date, with a `sourceRef` — a timeline of the endowment's internal
      // events, including changes to OTHER beneficiaries' records, arriving with none of the context
      // a statement would carry. If a portal should ever show "your own record changed on <date>",
      // that is an explicit case returning exactly that, not a table a seat can enumerate.
      // ⊕ FIFTEEN since migration 52 (S12-3): `OnboardingGate`. A gate row says which handover
      // gate the Nazir has or has not cleared on this endowment, who cleared it, what was attested
      // and why it was reopened — the state of the Nazir's own onboarding, not a beneficiary's fact.
      // A portal seat reads none of it; the statement is the surface a beneficiary reads.
      expect([...db.BENEFICIARY_FORBIDDEN_MODELS].sort()).toEqual([
        'AmlFollowUp',
        'AmlReport',
        'ApprovalRequest',
        'BankAccount',
        'ComplianceTask',
        'Deadline',
        'EscalationEvent',
        'GovernmentFiling',
        'LegalCase',
        'MaterialChange',
        'Membership',
        'NazirFee',
        'OnboardingGate',
        'WaqfAccessGrant',
        'ZakatFiling',
      ]);
    });

    /**
     * ⚠ WHAT USED TO BE HERE, AND WHY IT IS GONE.
     *
     * This slot held a SOURCE-SHAPE assertion: it located the `assertWritePolicy(model, operation,
     * ctx)` call site and checked that the strings CREATE_OPS / UNIQUE_WRITE_OPS / WHERE_WRITE_OPS
     * appeared in the 400 characters before it. It passed at full strength while a beneficiary
     * portal session minted itself an ACTIVE NAZIR grant through `user.update({data:{grants:
     * {create:…}}})` — because a test that reads source can only fail for a reason the source
     * mentions, and the source never mentioned relation-nested writes.
     *
     * It is replaced by tests that DRIVE the write. `nested-write-authorization.integration.test.ts`
     * owns the nested case; the two below own the ordinary write ops, one per operation, with the
     * row re-read from a raw connection afterwards.
     */
    it.each(['create', 'update', 'delete', 'upsert', 'updateMany', 'deleteMany'])(
      'refuses %s on an ORDINARY endowment model — the portal seat is read-only (C-07)',
      async (operation) => {
        // §10 §5: read-only over its OWN data. Creates were refused unconditionally; update, delete
        // and upsert were refused only for the five plane models, so every ordinary model was open.
        // Reproduced before the fix, all COMMITTED from the seeded portal seat:
        //   asset.update({data:{titleDeedNumber:'PROBE-BEN-WROTE-THIS'}})   — a title-deed number
        //   waqf.update({data:{fiscalYearEnd:'06-30'}})                     — the FYE that drives
        //                                                                     the 3-month window
        //   asset.update({data:{deletedAt: now}})                           — effective deletion
        // …and the `permissions: []` variant committed too, so it never depended on the preset.
        const client = db.createPrismaClient(beneficiaryContext()) as unknown as Record<
          string,
          Record<string, (args: unknown) => Promise<unknown>>
        >;
        await expect(
          client.asset?.[operation]?.({
            where: { id: 'asset-001' },
            data: { titleDeedNumber: 'PROBE-BEN-WROTE-THIS' },
            create: { id: 'asset-001', titleDeedNumber: 'PROBE-BEN-WROTE-THIS' },
            update: { titleDeedNumber: 'PROBE-BEN-WROTE-THIS' },
          }),
          `Asset.${operation} was permitted for a beneficiary portal session`,
        ).rejects.toThrow(/beneficiary-scoped session/);

        const [row] = await prisma.$queryRawUnsafe<{ titleDeedNumber: string | null }[]>(
          `SELECT "titleDeedNumber" FROM "asset" WHERE "id" = 'asset-001'`,
        );
        expect(row?.titleDeedNumber, 'a portal session rewrote a title-deed number').not.toBe(
          'PROBE-BEN-WROTE-THIS',
        );
      },
    );

    it('cannot move the fiscal year end, and cannot soft-delete a corpus record', async () => {
      const client = db.createPrismaClient(beneficiaryContext()) as unknown as {
        waqf: { update: (args: unknown) => Promise<unknown> };
        asset: { update: (args: unknown) => Promise<unknown> };
      };

      await expect(
        client.waqf.update({ where: { id: WAQF_A }, data: { fiscalYearEnd: '06-30' } }),
      ).rejects.toThrow(/beneficiary-scoped session/);
      await expect(
        client.asset.update({ where: { id: 'asset-002' }, data: { deletedAt: new Date() } }),
      ).rejects.toThrow(/beneficiary-scoped session/);

      const [waqf] = await prisma.$queryRawUnsafe<{ fiscalYearEnd: string }[]>(
        `SELECT "fiscalYearEnd" FROM "waqf" WHERE "id" = '${WAQF_A}'`,
      );
      expect(waqf?.fiscalYearEnd, 'the compliance deadline window was moved by a beneficiary').toBe(
        '12-31',
      );
      const [asset] = await prisma.$queryRawUnsafe<{ deletedAt: Date | null }[]>(
        `SELECT "deletedAt" FROM "asset" WHERE "id" = 'asset-002'`,
      );
      expect(asset?.deletedAt, 'a beneficiary soft-deleted an endowment asset').toBeNull();
    });

    /**
     * THE SWEEP, over `ALL_MODELS` rather than over five hand-listed names.
     *
     * The old loop was `it.each` over exactly the five `BENEFICIARY_FORBIDDEN_MODELS`, so the
     * thirty-odd models that were actually writable were the ones it could not see. Deriving the
     * list from `ALL_MODELS` means a model added to the schema is covered the day it is added.
     */
    it('refuses EVERY write operation on EVERY model for a portal session', async () => {
      const client = db.createPrismaClient(beneficiaryContext()) as unknown as Record<
        string,
        Record<string, (args: unknown) => Promise<unknown>> | undefined
      >;
      const permitted: string[] = [];

      for (const model of db.ALL_MODELS) {
        const delegate = client[model.charAt(0).toLowerCase() + model.slice(1)];
        if (delegate === undefined) {
          permitted.push(`${model}: no delegate — ALL_MODELS and schema.prisma disagree`);
          continue;
        }
        for (const operation of [
          'create',
          'update',
          'delete',
          'upsert',
          'updateMany',
          'deleteMany',
        ]) {
          try {
            await delegate[operation]?.({
              where: { id: 'anything' },
              data: {},
              create: {},
              update: {},
            });
            permitted.push(`${model}.${operation} was PERMITTED`);
          } catch (error: unknown) {
            const text = errorText(error);
            // The refusal must be the beneficiary one, from the force-filter — not a Prisma
            // validation error about the deliberately empty payload, which would mean the guard
            // never ran.
            if (!/beneficiary-scoped session/.test(text)) {
              permitted.push(
                `${model}.${operation} refused for the wrong reason: ${text.slice(0, 120)}`,
              );
            }
          }
        }
      }

      expect(permitted, 'a beneficiary portal session can still write').toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MP-13 — a client-level Membership can never confer approve/sign
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-13 · Membership is family-level only', () => {
    it.each(['NAZIR', 'SYSTEM_ADMIN', 'FINANCE', 'AUTHORIZED_REP', 'AML_OFFICER', 'BENEFICIARY'])(
      'refuses a client-level Membership with role %s',
      async (role) => {
        // §10 principle 2: "Scope is the endowment, not the client … never per-family." Sprint 1
        // accepted ALL THIRTEEN values here, with no `revokedAt`, no validity window and only
        // `deletedAt` — so ONE row could mint a `NAZIR` role string spanning every endowment of the
        // family, that never expires and cannot be revoked except by soft-delete.
        const error = await attempt(
          `INSERT INTO "membership" ("id","userId","clientId","role","createdAt","updatedAt")
           VALUES ('${TEST_MEMBERSHIP_PREFIX}${role}','${UNSCOPED}','${CLIENT_ID}','${role}'::"Role",now(),now())`,
        );
        expect(error, `a ${role} Membership was accepted at the CLIENT level`).not.toBeNull();
        expect(error).toMatch(/membership_role_family_level_only/);
      },
    );

    it('ALLOWS FAMILY_BOARD — the one seat the table is actually for', async () => {
      const error = await attempt(
        `INSERT INTO "membership" ("id","userId","clientId","role","createdAt","updatedAt")
         VALUES ('${TEST_MEMBERSHIP_PREFIX}ok','${UNSCOPED}','${CLIENT_ID}','FAMILY_BOARD'::"Role",now(),now())`,
      );
      expect(error).toBeNull();
    });

    it('refuses promoting an existing FAMILY_BOARD membership to NAZIR', async () => {
      const error = await attempt(
        `UPDATE "membership" SET "role" = 'NAZIR' WHERE "id" = 'membership-user-family-board-${CLIENT_ID}'`,
      );
      expect(error).not.toBeNull();
      expect(error).toMatch(/membership_role_family_level_only/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MP-14 — grant validity: revoked, expired, future-dated
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-14 · a revoked, expired or future-dated grant confers nothing', () => {
    const CASES = [
      ['revoked', { revokedAt: 'now()' }],
      [
        'expired',
        { validFrom: `now() - interval '2 days'`, validUntil: `now() - interval '1 day'` },
      ],
      ['future-dated', { validFrom: `now() + interval '1 day'` }],
    ] as const;

    it.each(CASES)(
      'a %s grant is excluded by the shared active-grant predicate',
      async (label, overrides) => {
        const id = `${TEST_GRANT_PREFIX}04-${label}`;
        await prisma.$executeRawUnsafe(
          insertGrantSql({ id, userId: PROBE_SUBJECT, role: 'NAZIR', ...overrides }),
        );

        // THE SAME PREDICATE `getUserDbRoles()` and the request-context factory use — IMPORTED, not
        // re-typed. It lives in `packages/database` because the dependency direction is `auth ->
        // database` (§17); importing `@qmulate/auth` from here would be a cycle. MP-14's mutation
        // deletes its `revokedAt: null` clause, and every consumer fails at once.
        const { activeGrantWhere } = await import('../src/context.js');
        const prismaClient = await privilegedPrisma();
        const active = await prismaClient.waqfAccessGrant.findMany({
          where: { ...activeGrantWhere(new Date()), userId: PROBE_SUBJECT },
          select: { id: true },
        });
        expect(
          active.map((row) => row.id),
          `a ${label} grant was treated as active`,
        ).not.toContain(id);

        // …and it cannot confer approval authority in the database either.
        const error = await attempt(
          `INSERT INTO "approval_request"
           ("id","waqfId","type","status","makerId","checkerId","subjectId","payloadHash","payload",
            "decidedAt","createdAt","updatedAt")
         VALUES ('appr-esc-9-${label}','${WAQF_A}','DISTRIBUTION_RUN','APPROVED',
                 '${FINANCE}','${PROBE_SUBJECT}','subj-${label}',repeat('c',64),'{}'::jsonb,
                 now(),now(),now())`,
        );
        expect(error, `a ${label} NAZIR grant conferred approval authority`).not.toBeNull();
        expect(error).toMatch(/holds no ACTIVE NAZIR waqf_access_grant/);

        await prisma.$executeRawUnsafe(`DELETE FROM "waqf_access_grant" WHERE "id" = '${id}'`);
      },
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // MP-25 / MP-26 — the AML compartment (T-27)
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MP-25 · the two AML booleans must agree', () => {
    it('refuses canViewAmlRestricted = true while amlCompartment = false', async () => {
      const error = await attempt(
        insertGrantSql({
          id: `${TEST_GRANT_PREFIX}050`,
          userId: PROBE_SUBJECT,
          role: 'AML_OFFICER',
          canViewAmlRestricted: true,
          amlCompartment: false,
        }),
      );
      expect(
        error,
        'a global AML clearance without compartment membership was accepted — the combination that ' +
          'let amlClause() short-circuit to "no restriction at all"',
      ).not.toBeNull();
      expect(error).toMatch(/waqf_access_grant_aml_flags/);
    });

    it('ALLOWS compartment membership, with or without the legacy flag', async () => {
      for (const [id, clearance] of [
        [`${TEST_GRANT_PREFIX}051`, true],
        [`${TEST_GRANT_PREFIX}052`, false],
      ] as const) {
        const error = await attempt(
          insertGrantSql({
            id,
            userId: PROBE_SUBJECT,
            waqfId: clearance ? WAQF_A : WAQF_B,
            role: 'AML_OFFICER',
            canViewAmlRestricted: clearance,
            amlCompartment: true,
          }),
        );
        expect(error, `compartment membership was refused: ${String(error)}`).toBeNull();
        await prisma.$executeRawUnsafe(`DELETE FROM "waqf_access_grant" WHERE "id" = '${id}'`);
      }
    });

    it('refuses a beneficiarySelfId on a non-BENEFICIARY grant, and requires one on a BENEFICIARY grant', async () => {
      // Otherwise a FINANCE grant carrying a `beneficiarySelfId` would silently switch that caller
      // onto the self-isolation path — or worse, a BENEFICIARY grant WITHOUT one would leave a portal
      // session un-pinned and reading the whole endowment.
      expect(
        await attempt(
          insertGrantSql({
            id: `${TEST_GRANT_PREFIX}060`,
            userId: PROBE_SUBJECT,
            role: 'FINANCE',
            beneficiarySelfId: 'ben-002',
          }),
        ),
      ).toMatch(/waqf_access_grant_beneficiary_self_pin/);

      expect(
        await attempt(
          insertGrantSql({
            id: `${TEST_GRANT_PREFIX}061`,
            userId: PROBE_SUBJECT,
            role: 'BENEFICIARY',
            beneficiarySelfId: null,
          }),
        ),
      ).toMatch(/waqf_access_grant_beneficiary_self_pin/);
    });
  });

  describe('T-27 · the per-waqf compartment list is the ONLY authority', () => {
    it('amlClause never returns "no restriction", whatever canViewAmlRestricted says', () => {
      // Sprint 1: `if (ctx.canViewAmlRestricted) return null;` — no restriction, on every endowment,
      // before the per-waqf list was consulted at all.
      const forged = {
        actorId: NAZIR,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A, WAQF_B],
        canViewAmlRestricted: true, // the flag that used to open everything
        amlCompartmentWaqfIds: [],
        requestId: 'test-aml-blanket',
      } as never;

      const filter = db.scopeFilter('Beneficiary', forged) as { AND: Record<string, unknown>[] };
      expect(filter.AND).toEqual(
        expect.arrayContaining([{ confidentiality: { not: 'AML_RESTRICTED' } }]),
      );
    });

    it('restricts a Nazir who is NOT a compartment member — §10 §6, by default', () => {
      const nazirCtx = {
        actorId: NAZIR,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A],
        amlCompartmentWaqfIds: [],
        requestId: 'test-aml-nazir',
      } as never;
      const filter = db.scopeFilter('Document', nazirCtx) as { AND: Record<string, unknown>[] };
      expect(filter.AND).toEqual(
        expect.arrayContaining([{ confidentiality: { not: 'AML_RESTRICTED' } }]),
      );
    });

    it('exempts ONLY the endowments in the per-waqf list', () => {
      const memberCtx = {
        actorId: 'user-aml-officer',
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A, WAQF_B],
        amlCompartmentWaqfIds: [WAQF_A], // member on A only
        requestId: 'test-aml-member',
      } as never;
      const filter = db.scopeFilter('Beneficiary', memberCtx) as { AND: unknown[] };
      expect(JSON.stringify(filter)).toContain(WAQF_A);
      expect(JSON.stringify(filter)).toContain('AML_RESTRICTED');
    });

    it('never reads ctx.canViewAmlRestricted inside amlClause (source scan)', () => {
      const source = readSource('../src/extensions/scoping.ts');
      const start = source.indexOf('function amlClause(');
      expect(start).toBeGreaterThan(-1);
      const body = source.slice(start, source.indexOf('\n}', start));
      expect(
        body,
        'amlClause reads canViewAmlRestricted again — the short-circuit that opened the whole ' +
          'no-tipping-off compartment on one boolean',
      ).not.toMatch(/canViewAmlRestricted/);
      // And it must not be able to return "no restriction" at all.
      expect(body).not.toMatch(/return null/);
    });
  });

  describe('MP-26 · amlClause is applied to exactly the models that carry `confidentiality`', () => {
    it('AML_CONFIDENTIALITY_MODELS equals schema.prisma’s set, in BOTH directions', () => {
      // TWO SIDES THAT MUST AGREE, WITH ONE READING THE OTHER. A model that GAINS the column but is
      // absent here keeps returning its AML_RESTRICTED rows to everyone; a model listed here without
      // the column produces a Prisma validation error on every query. And an APPROVAL-BEARING table
      // must never be pulled into the compartment: §10 §6 hides it from everyone outside, "including
      // the Nazir by default", so an approval hidden by AML classification is one the legally
      // accountable Nazir cannot audit (BR-105).
      const schema = readSource('../prisma/schema.prisma');
      const withColumn = new Set<string>();
      let currentModel: string | null = null;
      for (const line of schema.split('\n')) {
        const model = /^model\s+(\w+)\s*\{/.exec(line);
        if (model) {
          currentModel = model[1] ?? null;
          continue;
        }
        if (line.trim() === '}') {
          currentModel = null;
          continue;
        }
        if (currentModel !== null && /^\s*confidentiality\s+Confidentiality\b/.test(line)) {
          withColumn.add(currentModel);
        }
      }

      expect(
        withColumn.size,
        'no model with a `confidentiality` column was found — scan is broken',
      ).toBeGreaterThan(0);
      expect(new Set(db.AML_CONFIDENTIALITY_MODELS)).toEqual(withColumn);
      expect(
        withColumn.has('ApprovalRequest'),
        'ApprovalRequest gained a `confidentiality` column: an approval could then be hidden from ' +
          'the Nazir by AML classification, which is a direct BR-105 violation',
      ).toBe(false);
    });

    it('does not inject a confidentiality predicate on a model without the column', () => {
      const ctx = {
        actorId: NAZIR,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A],
        amlCompartmentWaqfIds: [],
        requestId: 'test-aml-scope',
      } as never;
      // A predicate on a non-existent column is a Prisma validation error on every query — i.e. an
      // outage, not a leak, but it must not happen either.
      expect(db.scopeFilter('Transaction', ctx)).toEqual({ waqfId: { in: [WAQF_A] } });
      expect(db.scopeFilter('ApprovalRequest', ctx)).toEqual({ waqfId: { in: [WAQF_A] } });
      expect(JSON.stringify(db.scopeFilter('Beneficiary', ctx))).toContain('AML_RESTRICTED');
      expect(JSON.stringify(db.scopeFilter('Document', ctx))).toContain('AML_RESTRICTED');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // C-06 — the compartment is subtracted from the AUDIT FEED too
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('C-06 · an AML_RESTRICTED row is invisible in the audit feed, not merely in its own table', () => {
    /**
     * WHAT LEAKED. `AuditEvent`'s entire read predicate was `{waqfId: {in: ids}}`, and nothing in
     * this package ever filtered on `classification` — the label was written and never read. A
     * non-member Nazir got `document.findMany() => []` (that half worked) while
     * `auditEvent.findMany({where:{entityType:'Document', entityId:<the restricted doc>}})` returned
     * the event with the WHOLE row in `after`, and `count({where:{classification:'RESTRICTED'}})`
     * answered as an enumeration oracle. `audit:event:read` is in 10 of the 13 presets, and
     * `middleware/aml.ts` files a non-member's own ATTEMPT as RESTRICTED — so the event whose stated
     * purpose is to stay out of "the feed a non-member can read" was in it. §10 §6, verbatim: "not
     * as a greyed row, not as a count, not in the audit-trail feed shown to non-members, not in any
     * export or evidence pack".
     */
    const RESTRICTED_DOC = 'document-esc-9601';

    const beneficiaryContextForAudit = () =>
      ({
        actorId: BENEFICIARY_USER,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A],
        beneficiarySelfId: BENEFICIARY_SELF_ID,
        permissions: ['beneficiary:beneficiary:read'],
        requestId: 'test-aml-audit-feed-portal',
      }) as never;

    const nazirContext = (compartments: string[]) =>
      ({
        actorId: NAZIR,
        actorType: 'USER',
        authorizedWaqfIds: [WAQF_A],
        permissions: ['document:document:read', 'audit:event:read'],
        amlCompartmentWaqfIds: compartments,
        requestId: 'test-aml-audit-feed',
      }) as never;

    beforeAll(async () => {
      await prisma.$executeRawUnsafe(`DELETE FROM "document" WHERE "id" = '${RESTRICTED_DOC}'`);
      // Written through the AUDITED path so the event is real and hash-chained, not hand-inserted.
      // `retentionUntil` is deliberately in the past so `document_retention_guard` lets the cleanup
      // hard-delete it; the audit event it produced stays, as an append-only table requires.
      const writer = db.createPrismaClient(
        db.makeSystemContext({ requestId: 'test-aml-audit-feed-writer' }) as never,
      ) as unknown as { document: { create: (args: unknown) => Promise<unknown> } };
      await writer.document.create({
        data: {
          id: RESTRICTED_DOC,
          waqfId: WAQF_A,
          type: 'kyc_aml',
          titleAr: `تقرير معاملة مشبوهة ${FICTIONAL_MARKER_AR}`,
          storageKey: 'test/aml-audit-feed.pdf',
          sha256: '2'.repeat(64),
          confidentiality: 'AML_RESTRICTED',
          retentionUntil: new Date('2020-01-01T00:00:00Z'),
          retentionUntilHijri: '1441-05-06',
        },
      });
    });

    afterAll(async () => {
      await prisma.$executeRawUnsafe(`DELETE FROM "document" WHERE "id" = '${RESTRICTED_DOC}'`);
    });

    it('the classification predicate is in the filter itself, keyed on the per-waqf compartment', () => {
      expect(JSON.stringify(db.scopeFilter('AuditEvent', nazirContext([])))).toContain(
        'RESTRICTED',
      );
      // A member of SOME compartments still loses the restricted rows of the others.
      const partial = JSON.stringify(db.scopeFilter('AuditEvent', nazirContext([WAQF_B])));
      expect(partial).toContain('RESTRICTED');
      expect(partial).toContain(WAQF_B);
    });

    it('a NON-member sees nothing of it: not the row, not the event, not a count', async () => {
      const client = db.createPrismaClient(nazirContext([])) as unknown as {
        document: { count: (args?: unknown) => Promise<number> };
        auditEvent: {
          findMany: (args?: unknown) => Promise<unknown[]>;
          count: (args?: unknown) => Promise<number>;
        };
      };

      expect(await client.document.count({ where: { id: RESTRICTED_DOC } })).toBe(0);
      expect(
        await client.auditEvent.findMany({
          where: { entityType: 'Document', entityId: RESTRICTED_DOC },
        }),
        'the whole restricted row was readable out of the audit feed',
      ).toEqual([]);
      expect(
        await client.auditEvent.count({ where: { classification: 'RESTRICTED' } }),
        'classification:RESTRICTED answers as an enumeration oracle',
      ).toBe(0);
    });

    it('a MEMBER still sees it — this is a subtraction, not a broken query', async () => {
      const client = db.createPrismaClient(nazirContext([WAQF_A])) as unknown as {
        auditEvent: { count: (args?: unknown) => Promise<number> };
      };
      expect(
        await client.auditEvent.count({
          where: { entityType: 'Document', entityId: RESTRICTED_DOC },
        }),
      ).toBeGreaterThan(0);
    });

    it('a PORTAL session has no audit feed at all', async () => {
      const client = db.createPrismaClient(beneficiaryContextForAudit()) as unknown as {
        auditEvent: { count: (args?: unknown) => Promise<number> };
      };
      // Before the fix this returned the endowment's ENTIRE trail — every staff actorId and the
      // before/after image of every row the endowment ever wrote.
      expect(await client.auditEvent.count({})).toBe(0);
      expect(db.scopeFilter('AuditEvent', beneficiaryContextForAudit())).toEqual({
        id: { in: [] },
      });
    });

    it('an ordinary event stays visible, and an APPROVAL is never hidden from the Nazir (BR-105)', async () => {
      const client = db.createPrismaClient(nazirContext([])) as unknown as {
        auditEvent: { count: (args?: unknown) => Promise<number> };
      };
      // The subtraction must be narrow: RESTRICTED only, never the ordinary trail.
      expect(
        await client.auditEvent.count({ where: { waqfId: WAQF_A } }),
        'the whole audit feed disappeared — the predicate is too wide',
      ).toBeGreaterThan(0);

      // THE CONVERSE, PINNED: `deriveClassification` must never mark an approval RESTRICTED. If it
      // ever did, the compartment would hide an approval from the legally accountable Nazir — the
      // hardest failure to detect, because the evidence is hidden by design.
      const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "audit_event"
          WHERE "entityType" = 'ApprovalRequest' AND "classification" = 'RESTRICTED'`,
      );
      expect(String(row?.n), 'an approval event is classified RESTRICTED').toBe('0');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // The known gaps are still declared honestly
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('keeps SCOPING_KNOWN_GAPS truthful about what E2 did and did NOT close', () => {
    const gaps = db.SCOPING_KNOWN_GAPS.join('\n');
    // The Sprint-1 wording said `permissions` were "stored but not yet interpreted". That is no
    // longer true for the authorization plane, and it IS still true for everything else — the entry
    // has to say which.
    expect(gaps).not.toMatch(/stored but not yet interpreted/);
    expect(gaps).toMatch(/AUTHORIZATION PLANE/);
    expect(gaps).toMatch(/ONE FLAT LIST/);
    // RLS is still absent, and saying so is the point of the list.
    expect(gaps).toMatch(/RLS/);

    // ── THE OVER-CLAIM MAY NOT COME BACK (S2 round 2) ──────────────────────────────────
    // The previous wording said the authority invariants "DO survive raw SQL". They are real
    // constraints, but the security conclusion was false: a raw INSERT from a SCOPED client mints a
    // live NAZIR seat, because `no_self_issue` compares two attacker-supplied columns and the
    // permission guard positively permits the approve verbs on `role = 'NAZIR'`. A comment
    // asserting a property the code lacks is the exact S1 failure mode, so the phrase is banned
    // and the honest statement is asserted in its place.
    expect(gaps, 'the round-1 over-claim is back in SCOPING_KNOWN_GAPS').not.toMatch(
      /DO survive raw SQL/,
    );
    expect(gaps).toMatch(/RAW SQL STILL DEFEATS THIS EXTENSION/);
    // The entry must stay GROUNDED in measurements, not in adjectives: it names the exact statement,
    // the exact numbers, and the file that drives the attack.
    expect(gaps).toMatch(/audit_event at 132 -> 132/);
    expect(gaps).toMatch(/ALTER TABLE … DISABLE TRIGGER/);
    expect(gaps).toMatch(/privilege separation|qmulate_app/);
    expect(gaps).toMatch(/ADR-0008/);

    // ── ⚠ UPDATED DELIBERATELY IN ADR-0008 ROUND 6, AND THIS PIN IS WHY ─────────────────
    // This assertion used to require the entry to name `grant-admission.integration.test.ts` — the
    // file whose MUTATION case demonstrated that the OWNER can disable the guard. It went RED the
    // moment the gap entry was rewritten for round 6, which is exactly the job it was given: a
    // truthfulness pin that does not break when the truth changes is not a pin.
    //
    // The proof it must now name is `authorization-plane-privilege.integration.test.ts`, where the
    // DDL bypass is measured AS `qmulate_app` (42501 for every form) and the identical statement is
    // shown PERMITTED on the owner connection, so the refusal is attributable to ownership.
    expect(gaps).toMatch(/authorization-plane-privilege\.integration\.test\.ts/);

    // ── THE RESIDUAL WORDING: STILL OPEN, STILL GATED, NOW NARROWER ─────────────────────
    // Item (3) is closed FOR THE RUNTIME ROLE. Items (1) and (2) are untouched, so the entry may not
    // stop saying the residual is open and may not stop naming the hard gate. What the phrasing must
    // additionally do now is say WHOSE credential still holds the power — otherwise "closed" reads as
    // "gone", which is the over-claim this whole block exists to prevent.
    expect(gaps).toMatch(/UNCHANGED and still open/);
    expect(gaps).toMatch(/MIGRATOR_DATABASE_URL/);
    expect(gaps).toMatch(/ACCESS_MATRIX_DATABASE_URL/);
    expect(gaps).toMatch(/DEPLOYMENT fact no test can assert/);
    expect(gaps).toMatch(/no real client data|fixture-only/i);
  });

  it('keeps the raw-SQL over-claim out of the shipped scoping source too', () => {
    // The same sentence lived in a doc comment on `AUTHORIZATION_PLANE_MODELS` and in this file's
    // header. A gap list that is honest while the source next to it over-claims is not honest.
    const source = readSource('../src/extensions/scoping.ts');
    expect(source, 'scoping.ts still claims a control survives raw SQL').not.toMatch(
      /DO survive raw SQL/,
    );
    expect(source).toMatch(/ADR-0008/);
  });
});
