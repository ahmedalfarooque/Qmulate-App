// QMULATE — the ORDINARY-DOMAIN WRITE GATE (round-3 findings N-1 and N-4).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS FILE PROVES, AND WHAT IT DELIBERATELY DOES NOT
// ═══════════════════════════════════════════════════════════════════════════════════════════
// §10 §3's grid gives `finance` **R only** on "Endowment & deed" and gives `subcontractor` `—`.
// The force-filter consulted `ctx.permissions` for the AUTHORIZATION PLANE only, so every
// ordinary model was authorized by ENDOWMENT MEMBERSHIP alone. Measured, from a scoped client on
// a migrated + seeded database:
//
//   FINANCE       waqf.update classification    MEDIUM -> LARGE        PERMITTED
//   FINANCE       waqf.update fiscalYearEnd     12-31  -> 06-30        PERMITTED
//   FINANCE       trusteeshipDeed.update primaryNazir                  PERMITTED
//   SUBCONTRACTOR asset.update valuationSar  18,000,000 -> 777,777.77  PERMITTED
//   SUBCONTRACTOR asset.update addressAr                               PERMITTED
//   SUBCONTRACTOR governmentFiling.update status -> ACCEPTED           PERMITTED
//   SUBCONTRACTOR beneficiary.update sharePercent -> 99.0              PERMITTED
//
// Every one of those columns gates a regulatory obligation: the classification decides WHICH
// duties apply, the fiscal-year end anchors every statutory deadline, and an asset valuation
// feeds the classification bands. (⚠ Every band, window and percentage behind those sentences is
// UNVERIFIED — confirm against primary Saudi law. Binding rule 3.)
//
// ── THREE THINGS THAT MAKE THIS A PROOF RATHER THAN A SHAPE ASSERTION ────────────────────────
//  1. EVERY REFUSAL IS PAIRED WITH A READ OF THE STORED VALUE, taken with the UNEXTENDED client.
//     A refusal that leaves the row rewritten is not a refusal, and this sprint already shipped a
//     test that asserted on source shape (strings near a call site) and passed at full strength
//     while the guard it described was bypassable.
//  2. THE PERMISSIONS COME FROM A REAL GRANT ROW, resolved through `resolveGrantPermissions`
//     exactly as `packages/api`'s context factory does — not hand-written into a context literal.
//     So a grant that widens itself past its preset still proves nothing here.
//  3. EVERY REFUSAL HAS A POSITIVE TWIN: a seat that DOES hold the permission is asserted to
//     COMMIT, and the new value is read back. A gate that refuses everybody is an outage, and
//     "it is refused" alone cannot tell the two apart.
//
// ── AND THE HONEST NEGATIVE, PINNED SO NOBODY CAN QUOTE THE GATE AS MORE THAN IT IS ──────────
// The gate is a Prisma client extension. `$executeRawUnsafe` on the SAME scoped client does not
// reach it, and the last assertion in this file proves that rather than leaving it to a comment.
// ADR-0008's hard gate stands: no real client data before E12's privilege separation.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_PREFIX,
  assertSeeded,
  basePrisma,
  privilegedPrisma,
  cleanupApiTestRows,
  closeDatabase,
  databaseModule,
  hasDatabase,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('the ordinary-domain write gate (N-1 / N-4)');

const WAQF_A = 'waqf-001';
const ASSET = 'asset-001';

/** A plain finance seat. §3 row 1 "Endowment & deed" gives it R, never W. */
const FINANCE_SUBJECT = `${API_TEST_PREFIX}wg-finance`;
/** A scoped third party. §3 row 1 gives it `—`; its whole remit is `scopeRefs`. */
const SUBCONTRACTOR_SUBJECT = `${API_TEST_PREFIX}wg-subcontractor`;
/** The positive twin: a Nazir seat whose grant keeps the endowment-module write verbs. */
const HOLDER_SUBJECT = `${API_TEST_PREFIX}wg-holder`;

/**
 * The delegates are reached untyped on purpose: `createPrismaClient` returns the fully-extended
 * client type, and narrowing it here would make this file assert against a TYPE rather than against
 * the runtime behaviour it exists to measure.
 */
type AnyClient = any;

describe.skipIf(!hasDatabase)('the ordinary-domain write gate · N-1 / N-4', () => {
  let db: Awaited<ReturnType<typeof databaseModule>>;
  let prisma: Awaited<ReturnType<typeof basePrisma>>;

  /** Runs a write and returns the flattened error message, or `null` when it was PERMITTED. */
  const attempt = async (fn: () => Promise<unknown>): Promise<string | null> => {
    try {
      await fn();
      return null;
    } catch (error: unknown) {
      return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    }
  };

  /**
   * A request context built the way the API builds one: the grant row is READ back from the
   * database and its permissions are intersected with the role preset.
   *
   * Deliberately not a context literal. A literal would let this file assert a refusal against a
   * permission set no real seat ever has.
   */
  const contextFor = async (userId: string): Promise<unknown> => {
    const { resolveGrantPermissions, roleKeyFromDbRole } = await import('@qmulate/domain');
    const grants = await prisma.waqfAccessGrant.findMany({
      where: { userId, waqfId: WAQF_A, revokedAt: null, deletedAt: null },
      select: { role: true, permissions: true },
    });
    expect(grants.length, `${userId} has no grant on ${WAQF_A}`).toBeGreaterThan(0);
    const permissions = grants.flatMap((grant) =>
      resolveGrantPermissions(roleKeyFromDbRole(grant.role), grant.permissions),
    );
    return {
      actorId: userId,
      actorType: 'USER',
      role: grants[0]?.role ?? null,
      authorizedWaqfIds: [WAQF_A],
      permissions,
      requestId: `api-test-write-gate-${userId}`,
    };
  };

  const clientFor = async (userId: string): Promise<AnyClient> =>
    db.createPrismaClient((await contextFor(userId)) as never) as AnyClient;

  /** Reads a single column with the UNEXTENDED client: no force-filter, no soft-delete filter. */
  const stored = async (table: string, id: string, column: string): Promise<string | null> => {
    const rows = await prisma.$queryRawUnsafe<{ v: string | null }[]>(
      `SELECT "${column}"::text AS v FROM "${table}" WHERE "id" = $1`,
      id,
    );
    return rows[0]?.v ?? null;
  };

  beforeAll(async () => {
    db = await databaseModule();
    prisma = await basePrisma();
    await assertSeeded();

    await provisionTestSubjects([
      {
        id: FINANCE_SUBJECT,
        role: 'FINANCE',
        waqfIds: [WAQF_A],
        // The seeded FINANCE shape, verbatim: a maker under SoD. No endowment write verb anywhere.
        permissions: [
          'finance:transaction:read',
          'finance:transaction:write',
          'distribution:run:read',
          'distribution:run:initiate',
          'approval:request:read',
          'approval:request:initiate',
        ],
      },
      {
        id: SUBCONTRACTOR_SUBJECT,
        role: 'SUBCONTRACTOR',
        waqfIds: [WAQF_A],
        // §10 §2.3's cells exactly: R scoped(i) on compliance tasks, W scoped on the vault.
        permissions: [
          'compliance:task:read',
          'compliance:task:initiate',
          'document:document:write',
        ],
      },
      {
        id: HOLDER_SUBJECT,
        role: 'NAZIR',
        waqfIds: [WAQF_A],
        permissions: [
          'endowment:waqf:read',
          'endowment:waqf:write',
          'endowment:deed:read',
          'endowment:deed:write',
          'endowment:asset:read',
          'endowment:asset:write',
        ],
      },
    ]);
  }, 300_000);

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // N-1 — the endowment record and its deed
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('N-1 · a FINANCE seat holds R only on "Endowment & deed"', () => {
    it('refuses `classification`, and the stored band is unchanged', async () => {
      const client = await clientFor(FINANCE_SUBJECT);
      const before = await stored('waqf', WAQF_A, 'classification');
      expect(before, 'waqf-001 has no classification — the fixture is not seeded').not.toBeNull();
      // A DIFFERENT value from the current one: a no-op UPDATE commits and would read as PERMITTED,
      // which is one of the false negatives that made a round-2 probe look like a working control.
      const target = before === 'LARGE' ? 'SMALL' : 'LARGE';

      const error = await attempt(() =>
        client.waqf.update({ where: { id: WAQF_A }, data: { classification: target } }),
      );

      expect(
        error,
        'a FINANCE seat rewrote the classification that gates every duty',
      ).not.toBeNull();
      expect(error).toMatch(/gates a regulatory obligation/);
      expect(error).toMatch(/endowment:waqf:write/);
      expect(await stored('waqf', WAQF_A, 'classification')).toBe(before);
    });

    it('refuses `fiscalYearEnd`, and the stored anchor is unchanged', async () => {
      const client = await clientFor(FINANCE_SUBJECT);
      const before = await stored('waqf', WAQF_A, 'fiscalYearEnd');
      const target = before === '06-30' ? '12-31' : '06-30';

      const error = await attempt(() =>
        client.waqf.update({ where: { id: WAQF_A }, data: { fiscalYearEnd: target } }),
      );

      expect(error, 'a FINANCE seat moved the FYE that anchors every statutory deadline').toMatch(
        /gates a regulatory obligation/,
      );
      expect(await stored('waqf', WAQF_A, 'fiscalYearEnd')).toBe(before);
    });

    it('refuses `type` and `entitlementOrder` — now SEALED at the database, for EVERY seat (D-B)', async () => {
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ⚠ THIS PIN MOVED DELIBERATELY. IT WAS NOT WEAKENED — THE REFUSAL GOT STRONGER.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // It used to assert the SCOPING EXTENSION's message ("gates a regulatory obligation"), i.e. a
      // refusal that depended on the caller lacking `endowment:waqf:write`. A CASE_MANAGER holding
      // that verb was measured rewriting all three columns freely — that is V-E3-M6.
      //
      // Asked whether `entitlementOrder` / `type` / `nature` should be changeable, the product owner
      // answered on 2026-08-16: ***"yes they are unchangable"*** (D-B). Migration 13 therefore adds
      // them to `qmulate_shart_guard()` as TIER 1b, SEALED OUTRIGHT — no approval, no GUC, no
      // migration, no backfill — and `packages/database`'s `DOMAIN_WRITE_POLICIES.Waqf.ungoverned`
      // now lists them so the DATABASE's refusal is the one the caller sees, rather than a
      // permission message that would imply the right seat could do it.
      //
      // So the assertion is now about the STRONGER guarantee, and it is checked in the direction
      // that matters: the message must be the SEAL's, and it must NOT be the permission gate's.
      const client = await clientFor(FINANCE_SUBJECT);
      const beforeType = await stored('waqf', WAQF_A, 'type');
      const beforeOrder = await stored('waqf', WAQF_A, 'entitlementOrder');

      const error = await attempt(() =>
        client.waqf.update({
          where: { id: WAQF_A },
          data: {
            type: beforeType === 'JOINT' ? 'FAMILY_DHURRI' : 'JOINT',
            entitlementOrder: beforeOrder === 'SHARED' ? 'ORDERED' : 'SHARED',
          },
        }),
      );

      expect(error, 'a FINANCE seat rewrote a founder’s condition').not.toBeNull();
      expect(error).toMatch(/is SEALED/);
      expect(error).toMatch(/SEALED OUTRIGHT, NOT WRITE-ONCE/);
      // The superseding-instrument rule is the only remaining answer, and the message must say so —
      // it is the one place a future engineer learns there is no approval to go and get.
      expect(error).toMatch(/SUPERSEDING INSTRUMENT/);
      // ⚠ AND NOT THE PERMISSION MESSAGE. If this ever comes back, the seal has been bypassed and
      // the refusal has silently become "the wrong seat tried" — which the right seat would pass.
      expect(error).not.toMatch(/gates a regulatory obligation/);
      expect(error).toMatch(/42501/);

      expect(await stored('waqf', WAQF_A, 'type')).toBe(beforeType);
      expect(await stored('waqf', WAQF_A, 'entitlementOrder')).toBe(beforeOrder);
    });

    it('D-B · the seal holds for a seat that DOES hold endowment:waqf:write', async () => {
      // ⚠ THE HALF THE OLD PIN COULD NOT EXPRESS, and the whole point of D-B. V-E3-M6 was measured
      // from a CASE_MANAGER seat — one that legitimately holds `endowment:waqf:write` — rewriting
      // `type`, `nature` and `entitlementOrder` with an ordinary update. A permission-based refusal
      // is no refusal at all against the seat that holds the permission, so the subject here is
      // `HOLDER_SUBJECT`: a NAZIR grant carrying every endowment-module write verb. If ANY seat may
      // move these columns, this is the one, and it may not.
      const client = await clientFor(HOLDER_SUBJECT);
      const before = {
        type: await stored('waqf', WAQF_A, 'type'),
        nature: await stored('waqf', WAQF_A, 'nature'),
        entitlementOrder: await stored('waqf', WAQF_A, 'entitlementOrder'),
      };

      for (const [column, next] of [
        ['type', before.type === 'JOINT' ? 'FAMILY_DHURRI' : 'JOINT'],
        ['nature', before.nature === 'QIYAMI' ? 'AYNI' : 'QIYAMI'],
        ['entitlementOrder', before.entitlementOrder === 'SHARED' ? 'ORDERED' : 'SHARED'],
      ] as const) {
        const error = await attempt(() =>
          client.waqf.update({ where: { id: WAQF_A }, data: { [column]: next } }),
        );
        expect(error, `a CASE_MANAGER rewrote waqf.${column}`).not.toBeNull();
        expect(error, `waqf.${column} must be refused BY THE SEAL`).toMatch(/is SEALED/);
        expect(await stored('waqf', WAQF_A, column)).toBe(before[column]);
      }
    });

    it('refuses the TrusteeshipDeed — the same grid row, a different resource', async () => {
      const client = await clientFor(FINANCE_SUBJECT);
      const deed = await prisma.trusteeshipDeed.findFirstOrThrow({
        where: { waqfId: WAQF_A },
        select: { id: true },
      });
      const before = await stored('trusteeship_deed', deed.id, 'primaryNazir');

      const error = await attempt(() =>
        client.trusteeshipDeed.update({
          where: { id: deed.id },
          data: { primaryNazir: 'REWRITTEN BY A LEDGER SEAT' },
        }),
      );

      expect(error, 'a FINANCE seat rewrote who the Nazir is').toMatch(/endowment:deed:write/);
      expect(await stored('trusteeship_deed', deed.id, 'primaryNazir')).toBe(before);
    });

    it('refuses a CONJURED endowment: a Waqf create is scope-checked by nothing else', async () => {
      // `Waqf` is self-scoped, so `assertCreateInScope` finds no parent endowment to check and the
      // create was governed by NOTHING — a ledger seat could conjure an endowment with a
      // classification of its choosing, and every obligation for it would be computed from that.
      const client = await clientFor(FINANCE_SUBJECT);
      const id = `${API_TEST_PREFIX}wg-conjured-waqf`;

      // ⚠ FAIL LOUDLY IF THE ROW IS ALREADY THERE, rather than letting the attempt below fail for
      // its own reasons. Migration 4 refuses a DELETE on `waqf`, so a run with this gate MUTATED
      // OFF leaves the conjured endowment behind for ever — and the next run would then be refused
      // by a UNIQUE violation and read as a working control. That is precisely the false negative
      // this sprint has already been bitten by three times. Reset the database instead.
      const existing = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM "waqf" WHERE "id" = $1`,
        id,
      );
      expect(
        existing.length,
        'a conjured endowment from an earlier MUTATED run is still present, and `waqf` has no ' +
          'delete path (migration 4). This assertion cannot prove anything against it — re-run with ' +
          '`scripts/dev-postgres.ts --reset`.',
      ).toBe(0);

      const error = await attempt(() =>
        client.waqf.create({
          data: {
            id,
            waqifId: 'waqif-001',
            certificateNumber: `${id}-cert`,
            deedNumber: `${id}-deed`,
            classification: 'SMALL',
            type: 'FAMILY_DHURRI',
            nature: 'AYNI',
            entitlementOrder: 'ORDERED',
            shartAlWaqif: { conjured: true },
            shartAlWaqifSetAt: new Date('2026-01-01T00:00:00.000Z'),
            shartAlWaqifSetAtHijri: '1447-07-12',
            fiscalYearEnd: '12-31',
            registrationDate: new Date('2026-01-01T00:00:00.000Z'),
            registrationDateHijri: '1447-07-12',
          },
        }),
      );

      expect(error, 'a FINANCE seat conjured an endowment').toMatch(/endowment:waqf:write/);
      const rows = await prisma.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM "waqf" WHERE "id" = $1`,
        id,
      );
      expect(rows.length, 'the conjured endowment committed').toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // N-4 — the scoped third party and the corpus asset
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('N-4 · a SUBCONTRACTOR is a scoped third party, not a general seat', () => {
    it('refuses an asset REVALUATION, and the stored valuation is unchanged', async () => {
      const client = await clientFor(SUBCONTRACTOR_SUBJECT);
      const before = await stored('asset', ASSET, 'valuationSar');
      expect(before, 'asset-001 is missing from the fixture').not.toBeNull();

      const error = await attempt(() =>
        client.asset.update({ where: { id: ASSET }, data: { valuationSar: '777777.77' } }),
      );

      expect(error, 'a subcontractor revalued a corpus asset').toMatch(
        /gates a regulatory obligation/,
      );
      expect(error).toMatch(/endowment:asset:write/);
      expect(await stored('asset', ASSET, 'valuationSar')).toBe(before);
    });

    it('refuses the ADDRESS columns too', async () => {
      const client = await clientFor(SUBCONTRACTOR_SUBJECT);
      const before = await stored('asset', ASSET, 'addressAr');

      expect(
        await attempt(() =>
          client.asset.update({ where: { id: ASSET }, data: { addressAr: 'عنوان مزيّف' } }),
        ),
      ).toMatch(/endowment:asset:write/);
      expect(await stored('asset', ASSET, 'addressAr')).toBe(before);
    });

    it('refuses the compliance POSITION and a beneficiary SHARE', async () => {
      const client = await clientFor(SUBCONTRACTOR_SUBJECT);

      const filing = await prisma.governmentFiling.findFirstOrThrow({
        where: { waqfId: WAQF_A },
        select: { id: true },
      });
      const filingBefore = await stored('government_filing', filing.id, 'status');
      expect(
        await attempt(() =>
          client.governmentFiling.update({
            where: { id: filing.id },
            data: { status: filingBefore === 'ACCEPTED' ? 'REJECTED' : 'ACCEPTED' },
          }),
        ),
        'a subcontractor moved a filing to ACCEPTED',
      ).toMatch(/compliance:filing:write/);
      expect(await stored('government_filing', filing.id, 'status')).toBe(filingBefore);

      const beneficiary = await prisma.beneficiary.findFirstOrThrow({
        where: { waqfId: WAQF_A },
        select: { id: true },
      });
      const shareBefore = await stored('beneficiary', beneficiary.id, 'sharePercent');
      expect(
        await attempt(() =>
          client.beneficiary.update({
            where: { id: beneficiary.id },
            data: { sharePercent: '99.0' },
          }),
        ),
        'a subcontractor rewrote an entitlement share',
      ).toMatch(/beneficiary:beneficiary:write/);
      expect(await stored('beneficiary', beneficiary.id, 'sharePercent')).toBe(shareBefore);
    });

    it('leaves `asset.titleDeedNumber` to the DATABASE guard, which is the stronger one', async () => {
      // Migration 5 makes the title-deed number reserved-matter-only, and that guard holds against
      // raw SQL where this one does not. Putting a weaker app-layer refusal in front of it would
      // REPLACE the stronger error with a weaker one and hide which layer actually stopped the
      // write — so `titleDeedNumber` is explicitly excused from the column gate.
      const client = await clientFor(SUBCONTRACTOR_SUBJECT);
      const before = await stored('asset', ASSET, 'titleDeedNumber');

      const error = await attempt(() =>
        client.asset.update({
          where: { id: ASSET },
          data: { titleDeedNumber: 'FORGED-BY-SUBCONTRACTOR' },
        }),
      );

      expect(error, 'a subcontractor rewrote a title-deed number').not.toBeNull();
      expect(error, 'the app-layer gate pre-empted the reserved-matter guard').toMatch(
        /reserved-matter-only/,
      );
      expect(await stored('asset', ASSET, 'titleDeedNumber')).toBe(before);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // A SUBTRACTION, NOT A LOCKOUT
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the positive twin · a seat that HOLDS the permission still commits', () => {
    it('writes the classification and the FYE, and the new values are read back', async () => {
      const client = await clientFor(HOLDER_SUBJECT);
      const before = await stored('waqf', WAQF_A, 'classification');
      const target = before === 'LARGE' ? 'SMALL' : 'LARGE';

      expect(
        await attempt(() =>
          client.waqf.update({ where: { id: WAQF_A }, data: { classification: target } }),
        ),
        'the sanctioned write was refused — that IS a lockout',
      ).toBeNull();
      expect(await stored('waqf', WAQF_A, 'classification')).toBe(target);

      // Restore, through the same gate, so the fixture is left exactly as it was found.
      await client.waqf.update({ where: { id: WAQF_A }, data: { classification: before } });
      expect(await stored('waqf', WAQF_A, 'classification')).toBe(before);
    });

    it('revalues a corpus asset and rewrites its address', async () => {
      const client = await clientFor(HOLDER_SUBJECT);
      const valuationBefore = await stored('asset', ASSET, 'valuationSar');
      const addressBefore = await stored('asset', ASSET, 'addressAr');

      expect(
        await attempt(() =>
          client.asset.update({
            where: { id: ASSET },
            data: { valuationSar: '18500000.00', addressAr: 'حي المثال المحدَّث' },
          }),
        ),
        'the sanctioned revaluation was refused — that IS a lockout',
      ).toBeNull();
      expect(await stored('asset', ASSET, 'valuationSar')).toBe('18500000.00');
      expect(await stored('asset', ASSET, 'addressAr')).toBe('حي المثال المحدَّث');

      await client.asset.update({
        where: { id: ASSET },
        data: { valuationSar: valuationBefore, addressAr: addressBefore },
      });
      expect(await stored('asset', ASSET, 'valuationSar')).toBe(valuationBefore);
      expect(await stored('asset', ASSET, 'addressAr')).toBe(addressBefore);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // THE RESIDUAL, ASSERTED — so that no document can claim it is gone
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('what the gate is NOT', () => {
    it('does NOT survive raw SQL from the very same scoped client (ADR-0008)', async () => {
      // Pinned as an ASSERTION rather than left in a comment. If privilege separation ever lands
      // and this stops being true, this test goes red and somebody has to come and delete it — which
      // is the correct way for a named residual to disappear.
      const client = await clientFor(FINANCE_SUBJECT);
      const before = await stored('waqf', WAQF_A, 'classification');
      const target = before === 'LARGE' ? 'SMALL' : 'LARGE';

      await client.$executeRawUnsafe(
        `UPDATE "waqf" SET "classification" = '${target}' WHERE "id" = '${WAQF_A}'`,
      );

      expect(
        await stored('waqf', WAQF_A, 'classification'),
        'raw SQL was blocked — the residual may be closed; re-read ADR-0008 and update it',
      ).toBe(target);

      await prisma.$executeRawUnsafe(
        `UPDATE "waqf" SET "classification" = '${String(before)}' WHERE "id" = '${WAQF_A}'`,
      );
      expect(await stored('waqf', WAQF_A, 'classification')).toBe(before);
    });

    it('does NOT gate the CREATE of a child row, and says so in SCOPING_KNOWN_GAPS', async () => {
      // A child create supplies governed columns (a `Budget` cannot be created without its revenue
      // and expense estimates) and is still authorized by endowment membership alone. Asserted
      // rather than described, because the round-2 lesson is that a comment claiming a property is
      // indistinguishable from a control that has it.
      //
      // `Budget` and not `Asset`, for one reason only: migration 6 refuses a DELETE on `asset` (it
      // is corpus), so a probe asset could never be cleaned up and would break the sibling suite's
      // absolute `Asset` count on the next run against the same database. `budget` is not in that
      // guard's table list. The residual being proven is the same one either way — `Budget` is
      // governed by `finance:transaction:write`, which the SUBCONTRACTOR seat does not hold.
      const client = await clientFor(SUBCONTRACTOR_SUBJECT);
      const id = `${API_TEST_PREFIX}wg-budget`;
      // ⚠ THE CLEANUP RUNS ON THE PRIVILEGED CONNECTION (ADR-0008 round 6). The runtime role holds no
      // DELETE on any endowment table now, so this hard delete is `42501 permission denied for table
      // budget` on the app connection — correct posture, and scaffolding belongs on the owner. The
      // WRITE GATE assertions below still run on the caller's own scoped client, which is the point.
      const scaffold = await privilegedPrisma();
      await scaffold.$executeRawUnsafe(`DELETE FROM "budget" WHERE "id" = $1`, id);

      const error = await attempt(() =>
        client.budget.create({
          data: {
            id,
            waqfId: WAQF_A,
            fiscalYear: '2099',
            revenueEstimate: '1.00',
            expenseEstimate: '1.00',
          },
        }),
      );

      expect(
        error,
        'the child-create residual may be closed — update SCOPING_KNOWN_GAPS',
      ).toBeNull();
      // …and the very same payload IS refused as an UPDATE, which is what makes this a statement
      // about the create path rather than about the policy being absent.
      expect(
        await attempt(() =>
          client.budget.update({ where: { id }, data: { revenueEstimate: '2.00' } }),
        ),
      ).toMatch(/finance:transaction:write/);

      await scaffold.$executeRawUnsafe(`DELETE FROM "budget" WHERE "id" = $1`, id);

      const { SCOPING_KNOWN_GAPS } = db;
      expect(
        SCOPING_KNOWN_GAPS.some((gap) => gap.includes('CREATE of a')),
        'the create-path residual is not recorded in SCOPING_KNOWN_GAPS',
      ).toBe(true);
    });
  });

  it('every model is either governed by a write policy or excused with a reason', () => {
    // Fail-closed by construction: a model added to `schema.prisma` and to neither table breaks
    // this, rather than arriving silently ungated. It also compares every column name named by a
    // policy against the DMMF, because a typo in `ungoverned` would silently govern (an outage) or
    // silently stop governing (a hole).
    expect(() => {
      db.assertDomainWriteCoverage();
    }).not.toThrow();
  });
});
