/**
 * N-5 · A LIVE NAZIR SEAT CAN STILL BE SUPPRESSED FROM RAW SQL — now DETECTABLY, not silently.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FINDING, REPRODUCED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A raw `UPDATE "waqf_access_grant" SET "revokedAt" = now()` on the seeded live NAZIR seat, measured
 * on a freshly migrated + seeded database, 2026-07-28:
 *
 *     audit_event                        131 -> 131      (nothing to attribute it to)
 *     qmulate_has_active_grant(NAZIR)    true -> false   (the endowment lost its approval authority)
 *     events naming the grant in the txn  0
 *     un-revoking afterwards             REFUSED [42501] (migration 4's one-way property DOES hold)
 *
 * `qmulate_grant_admission()` deliberately does not govern a pure NARROWING — a break-glass
 * revocation of a compromised Nazir seat must not require the very access-matrix path that is under
 * suspicion — and that reasoning stands. The half that is wrong is that the suppression leaves NO
 * TRAIL, where §12 wants an `AuditEvent action = delete_soft`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE CLOSES, AND WHAT IT DELIBERATELY DOES NOT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * CLOSED: the suppression is now DETECTABLE. `qmulate_unaudited_grant_suppressions()` lists every
 * suppressed seat the trail does not record, so a silent revocation becomes a findable one.
 *
 * NOT CLOSED — and NOT because it was overlooked: **a trigger cannot write the audit event.** Two
 * independent blockers, both verified rather than assumed:
 *
 *   1. IT WOULD FORK THE HASH CHAIN. `runAuditedTransaction` reads `audit_chain_head` ONCE, at the
 *      start of the transaction, then carries `state.prevHash` IN MEMORY, inserting each event
 *      chained on the previous one while the head row lags until `finalizeChain()`. A trigger firing
 *      mid-transaction cannot see that in-memory value: it would chain onto the real tail, and the
 *      application's next `appendEvent()` would chain onto its own last hash — two rows claiming the
 *      same predecessor. `verifyChain()` cannot tell a fork from tampering, and THREE integration
 *      files verify the whole chain end to end.
 *   2. IT WOULD NEED A SECOND HIJRI IMPLEMENTATION AND A SECOND CANONICALIZER.
 *      `audit_event."occurredAtHijri"` is NOT NULL and ADR-0007 decided there is exactly ONE Umm
 *      al-Qura implementation, in `packages/domain`, precisely because two had already drifted. And
 *      `rowHash` is SHA-256 over `canonicalJson(serializeForAudit(payload))`, so a plpgsql version
 *      whose escaping or numeric spelling drifts from the TypeScript one breaks gate G-1 SILENTLY,
 *      on real data.
 *
 * A side ledger OUTSIDE the hash chain (a table in a non-`public` schema, invisible to Prisma's drift
 * detection) would work and is the honest third option — but what goes in the evidence pack and what
 * PDPL applies to is an architecture decision, not a mechanical one. **SURFACED, NOT TAKEN.**
 *
 * AND NOT DECIDED HERE, BY INSTRUCTION: whether break-glass revocation may be unaudited AT ALL is an
 * open product decision. Nothing in this file forbids the operation — it still succeeds, exactly as
 * before. Detection and prevention are different properties and this sprint has already conflated
 * them once.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  accessMatrixClient,
  assertGuardsInstalled,
  authzScaffoldingSql,
  privilegedPrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  hasDatabase,
  provisionGrants,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('N-5 — the unaudited suppression of a live grant');

const WAQF = 'waqf-001';
const NAZIR = 'user-nazir-001';
const SUBJECT = 'user-accountant-001';
/** The live seat the round-2 finding suppressed. Seeded; never actually revoked by this file. */
const LIVE_NAZIR_SEAT = `grant-${NAZIR}-${WAQF}`;

/** ⚠ NOT `user-seed-admin` — `seed.integration.test.ts` counts events by that actor. */
const PROVISIONER = 'user-test-suppression-provisioner';

const GRANT_PREFIX = 'grant-supp-9';
/** The disposable seat the AUDITED-revocation positive control burns. Revocation is one-way. */
const AUDITED_SEAT = `${GRANT_PREFIX}001`;

interface RawTx {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}
interface PrismaLike extends RawTx {
  $transaction: <T>(fn: (tx: RawTx) => Promise<T>) => Promise<T>;
}

interface Suppression {
  grant_id: string;
  user_id: string;
  waqf_id: string;
  grant_role: string;
  suppression_column: string;
  events_naming_grant: bigint;
}

describe.skipIf(!hasDatabase)('N-5 · the suppression of a live seat, and its trail', () => {
  let prisma: PrismaLike;
  let db: Awaited<ReturnType<typeof databaseModule>>;

  const unaudited = async (tx: RawTx = prisma): Promise<Suppression[]> =>
    tx.$queryRawUnsafe<Suppression[]>(`SELECT * FROM qmulate_unaudited_grant_suppressions()`);

  const listed = async (id: string, tx: RawTx = prisma): Promise<Suppression | undefined> =>
    (await unaudited(tx)).find((row) => row.grant_id === id);

  const hasActiveNazir = async (tx: RawTx = prisma): Promise<boolean> => {
    const rows = await tx.$queryRawUnsafe<{ active: boolean }[]>(
      `SELECT qmulate_has_active_grant('${NAZIR}','${WAQF}','NAZIR') AS active`,
    );
    return rows[0]?.active === true;
  };

  const countEvents = async (tx: RawTx = prisma): Promise<number> => {
    const rows = await tx.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM "audit_event"`,
    );
    return Number(rows[0]?.n ?? '0');
  };

  const cleanup = async (): Promise<void> => {
    await prisma.$executeRawUnsafe(
      authzScaffoldingSql([`DELETE FROM "waqf_access_grant" WHERE "id" LIKE '${GRANT_PREFIX}%'`]),
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

    // PRECONDITION, asserted rather than assumed: the seat this file suppresses must actually be
    // LIVE. If a sibling file left it revoked, every measurement below would be about a dead seat.
    expect(
      await hasActiveNazir(),
      'the seeded NAZIR seat is not live — nothing here means anything',
    ).toBe(true);
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 1. THE FINDING, RE-DRIVEN
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the raw narrowing is still PERMITTED — that half is a product decision, untouched', () => {
    it('suppresses a live NAZIR seat, with zero audit events', async () => {
      // ⚠ `now()` vs the application's UTC. `revokedAt` is `timestamp WITHOUT time zone` and SQL
      // `now()` writes LOCAL wall-clock into it, while the app writes UTC — a round-2 false negative
      // on `validFrom`/`validUntil`, where forged grants were future-dated and read as correctly
      // refused when they were merely inactive. It does NOT bite here (`activeGrantWhere()` tests
      // `revokedAt IS NULL`, so ANY non-null value suppresses), and BOTH spellings are driven below
      // so that claim is measured rather than argued.
      for (const spelling of [`now()`, `now() AT TIME ZONE 'UTC'`]) {
        const ROLLBACK = `__qmulate_supp_${spelling.length}__`;
        const observed: Record<string, unknown> = {};
        let unexpected: unknown;
        try {
          await prisma.$transaction(async (tx) => {
            observed.eventsBefore = await countEvents(tx);
            observed.activeBefore = await hasActiveNazir(tx);

            const rows = await tx.$executeRawUnsafe(
              `UPDATE "waqf_access_grant" SET "revokedAt" = ${spelling}
                WHERE "id" = '${LIVE_NAZIR_SEAT}'`,
            );
            observed.rowsUpdated = rows;
            observed.eventsAfter = await countEvents(tx);
            observed.activeAfter = await hasActiveNazir(tx);

            const naming = await tx.$queryRawUnsafe<{ n: string }[]>(
              `SELECT count(*)::text AS n FROM "audit_event"
                WHERE "entityType" = 'WaqfAccessGrant' AND "entityId" = '${LIVE_NAZIR_SEAT}'
                  AND xmin = pg_current_xact_id()::xid`,
            );
            observed.eventsNamingItInThisTxn = Number(naming[0]?.n ?? '0');
            throw new Error(ROLLBACK);
          });
        } catch (error: unknown) {
          if (!errorText(error).includes(ROLLBACK)) unexpected = error;
        }

        expect(
          unexpected === undefined
            ? null
            : `${errorText(unexpected)} | observed: ${JSON.stringify(observed)}`,
          `the narrowing was REFUSED with ${spelling} — that is not the documented rule`,
        ).toBeNull();
        expect(observed.rowsUpdated, 'the UPDATE matched no row — a false negative').toBe(1);
        expect(observed.activeBefore).toBe(true);
        expect(observed.activeAfter, 'the seat survived the suppression').toBe(false);
        expect(observed.eventsAfter, 'the suppression produced an audit event').toBe(
          observed.eventsBefore,
        );
        expect(observed.eventsNamingItInThisTxn).toBe(0);
      }

      // The database is untouched.
      expect(await hasActiveNazir()).toBe(true);
    });

    it('but un-revoking is still REFUSED — the one-way property holds', async () => {
      // Migration 4 (C-09) is unaffected, and it matters: an attacker cannot suppress a Nazir seat,
      // act, and then put it back so the trail reads as though nothing happened.
      let refusal: string | null = 'not attempted';
      const ROLLBACK = '__qmulate_supp_unrevoke__';
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "waqf_access_grant" SET "revokedAt" = now() AT TIME ZONE 'UTC'
              WHERE "id" = '${LIVE_NAZIR_SEAT}'`,
          );
          try {
            await tx.$executeRawUnsafe(
              `UPDATE "waqf_access_grant" SET "revokedAt" = NULL WHERE "id" = '${LIVE_NAZIR_SEAT}'`,
            );
            refusal = null;
          } catch (error: unknown) {
            refusal = errorText(error);
            throw new Error(ROLLBACK);
          }
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!errorText(error).includes(ROLLBACK)) throw error;
      }
      expect(
        refusal,
        'a suppression was undone, so the trail can be made to read clean',
      ).not.toBeNull();
      expect(refusal).toMatch(/revocation is one-way/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 2. THE HALF THAT IS CLOSED — the suppression is detectable
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('qmulate_unaudited_grant_suppressions() — the detection half', () => {
    it('lists nothing for a seeded, un-suppressed access matrix', async () => {
      // A DELTA-SHAPED ASSERTION, not an absolute zero: this file shares one database with every
      // sibling, and a sibling that legitimately revokes a disposable seat would make an absolute
      // count flake. What must hold is that no SEEDED seat is listed.
      const rows = await unaudited();
      const seeded = rows.filter((row) => row.grant_id.startsWith('grant-user-'));
      expect(
        seeded.map((row) => `${row.grant_id}:${row.suppression_column}`),
        'a seeded grant is suppressed with no trail — either the fixture changed or a sibling file ' +
          'left a live seat revoked',
      ).toEqual([]);
    });

    it('lists the exact seat the raw narrowing suppressed, with its role and column', async () => {
      const ROLLBACK = '__qmulate_supp_detect__';
      let found: Suppression | undefined;
      let before: Suppression | undefined;
      try {
        await prisma.$transaction(async (tx) => {
          before = await listed(LIVE_NAZIR_SEAT, tx);
          await tx.$executeRawUnsafe(
            `UPDATE "waqf_access_grant" SET "revokedAt" = now() AT TIME ZONE 'UTC'
              WHERE "id" = '${LIVE_NAZIR_SEAT}'`,
          );
          found = await listed(LIVE_NAZIR_SEAT, tx);
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!errorText(error).includes(ROLLBACK)) throw error;
      }

      expect(
        before,
        'the live seat was already listed — the negative control is broken',
      ).toBeUndefined();
      expect(found, 'the unaudited suppression was NOT detected').toBeDefined();
      expect(found?.user_id).toBe(NAZIR);
      expect(found?.waqf_id).toBe(WAQF);
      expect(found?.grant_role, 'the report does not say WHICH authority was suppressed').toBe(
        'NAZIR',
      );
      expect(found?.suppression_column).toBe('revokedAt');
      // The seat IS in the trail — it was created through the audited path — which is exactly why a
      // "does any event name this row?" predicate would have missed this. The count is reported so a
      // reviewer can go and read those events and see that none of them records a revocation.
      expect(Number(found?.events_naming_grant ?? 0)).toBeGreaterThan(0);
    });

    it('detects a `deletedAt` suppression too — a grant has TWO off-switches', async () => {
      // `activeGrantWhere()` treats `deletedAt: null` as one of its four validity clauses, so
      // soft-delete is a second suppression of a live seat (migration 4, C-09). A detector that
      // watched only `revokedAt` would miss half the finding.
      const ROLLBACK = '__qmulate_supp_softdel__';
      let found: Suppression | undefined;
      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "waqf_access_grant" SET "deletedAt" = now() AT TIME ZONE 'UTC'
              WHERE "id" = '${LIVE_NAZIR_SEAT}'`,
          );
          expect(await hasActiveNazir(tx), 'soft-delete did not suppress the seat').toBe(false);
          found = await listed(LIVE_NAZIR_SEAT, tx);
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!errorText(error).includes(ROLLBACK)) throw error;
      }
      expect(found, 'a soft-delete suppression was not detected').toBeDefined();
      expect(found?.suppression_column).toBe('deletedAt');
    });

    it('does NOT list an AUDITED revocation — the positive control', async () => {
      // ⚠ AND THE FINDING INSIDE THE FINDING: **no shipped code path revokes a grant at all.**
      // Nothing in `packages/{api,database,auth}/src` writes a non-null `revokedAt`;
      // `activateGrant()` only issues. So today EVERY revocation is necessarily raw, and this branch
      // describes a path E11/E12 has yet to build. It IS reachable now — `withAudit()` +
      // `waqfAccessGrant.update()` — which is what this control drives, so the "audited" side of the
      // detector is verified rather than aspirational.
      //
      // A disposable seat, because revocation is one-way and cannot be undone for the next run.
      const systemCtx = db.makeSystemContext({
        actorId: PROVISIONER,
        authorizedWaqfIds: [WAQF],
        requestId: 'round3-suppression-positive-control',
        reason: 'N-5: an AUDITED revocation, for the detector’s negative case',
      });
      // ⚠ `provisionGrants()`, not a bare `withAudit()`, since migration 9: the
      // `actorType = 'SYSTEM'` disjunct that used to admit this write is gone
      // (`00000000000009_e2_close_system_marker`), because a caller who writes the marker row chooses
      // `actorType`. Provisioning now suspends admission explicitly — an OWNER-only operation — while
      // the write stays audited. The REVOCATION below needs no wrapper: a pure narrowing is ungoverned.
      await provisionGrants(systemCtx, async (tx) => {
        await tx.waqfAccessGrant.create({
          data: {
            id: AUDITED_SEAT,
            userId: SUBJECT,
            waqfId: WAQF,
            // `CASE_MANAGER`, not COUNSEL/AUDITOR: `waqf_access_grant_userId_waqfId_role_key` is
            // unique on (userId, waqfId, role) and two sibling files hold COUNSEL / AUDITOR seats for
            // this same user on this same endowment during part of a run. A crashed run that left one
            // behind would otherwise make this file fail with 23505 on somebody else's leftovers.
            role: 'CASE_MANAGER' as never,
            permissions: ['endowment:waqf:read'],
            dataScopes: [],
            scopeRefs: [],
            grantedByUserId: PROVISIONER,
            validFrom: new Date('2026-01-01T00:00:00.000Z'),
          },
        });
      });
      expect(await listed(AUDITED_SEAT), 'a live seat is listed as suppressed').toBeUndefined();

      const eventsBefore = await countEvents();
      // The PROVISIONING connection: an UPDATE on `waqf_access_grant` is refused by the ACL on the
      // app role (ADR-0008 round 6), so the detector's positive control has to be issued the way a
      // real revocation is — `revokeAccessGrant()` uses exactly this connection.
      await db.withAudit(accessMatrixClient(systemCtx), async (tx) => {
        await tx.waqfAccessGrant.update({
          where: { id: AUDITED_SEAT },
          data: { revokedAt: new Date('2026-07-01T00:00:00.000Z') },
        });
      });
      expect(await countEvents(), 'the audited revocation produced no event').toBe(
        eventsBefore + 1,
      );

      // Suppressed AND audited ⇒ absent from the report. If this ever starts appearing, the detector
      // is crying wolf on the legitimate path, which is how a detector gets switched off.
      expect(
        await listed(AUDITED_SEAT),
        'an AUDITED revocation was reported as unaudited — the detector is not usable',
      ).toBeUndefined();

      // …and the event really does record the column, which is what the predicate reads.
      const [event] = await prisma.$queryRawUnsafe<
        { action: string; before: unknown; after: unknown }[]
      >(
        `SELECT "action"::text AS action, "before", "after" FROM "audit_event"
          WHERE "entityType" = 'WaqfAccessGrant' AND "entityId" = '${AUDITED_SEAT}'
          ORDER BY "id" DESC LIMIT 1`,
      );
      expect(event?.action).toBe('UPDATE');
      expect(JSON.stringify(event?.after)).toContain('revokedAt');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 3. THE MUTATION — the false negative the predicate was built to avoid
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('MUTATION · testing the KEY instead of the VALUE reports every suppression as audited', async () => {
    // The predicate is `(ae."after" ->> s.col) IS NOT NULL` — the VALUE. Testing for the KEY
    // (`ae."after" ? s.col`) looks equivalent and is not: a CREATE event's `after` is the WHOLE ROW,
    // so it already contains `"revokedAt": null`, and every grant ever created would read as having
    // an audited revocation. Measured on this fixture, which is why the migration carries a note
    // about it.
    //
    // Executed, not described: the live function is mutated with that exact substitution inside a
    // transaction that is rolled back. `mutateFunction` throws if the target substring is gone, so a
    // reworded migration fails loudly rather than passing.
    const ROLLBACK = '__qmulate_supp_mutant__';
    let mutantSawIt: Suppression | undefined;
    let realSawIt: Suppression | undefined;
    let failed: unknown;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          `UPDATE "waqf_access_grant" SET "revokedAt" = now() AT TIME ZONE 'UTC'
            WHERE "id" = '${LIVE_NAZIR_SEAT}'`,
        );
        realSawIt = await listed(LIVE_NAZIR_SEAT, tx);

        const [row] = await tx.$queryRawUnsafe<{ def: string }[]>(
          `SELECT pg_get_functiondef('qmulate_unaudited_grant_suppressions()'::regprocedure) AS def`,
        );
        const find = `(ae."after" ->> s.col) IS NOT NULL`;
        const def = row?.def ?? '';
        if (!def.includes(find)) {
          throw new Error(
            `MUTATION COULD NOT BE APPLIED: the detector no longer contains ${JSON.stringify(find)}. ` +
              `Fix the target, do not delete the test.`,
          );
        }
        await tx.$executeRawUnsafe(def.replace(find, `ae."after" ? s.col`));
        mutantSawIt = await listed(LIVE_NAZIR_SEAT, tx);
        throw new Error(ROLLBACK);
      });
    } catch (error: unknown) {
      if (!errorText(error).includes(ROLLBACK)) failed = error;
    }

    expect(
      failed === undefined ? null : errorText(failed),
      'the mutation could not be driven',
    ).toBeNull();
    expect(realSawIt, 'the real predicate did not detect the suppression').toBeDefined();
    expect(
      mutantSawIt,
      'the key-existence predicate ALSO detected it, so the value-vs-key distinction is not ' +
        'load-bearing and the migration’s note is wrong',
    ).toBeUndefined();

    // The real function is back.
    const [restored] = await prisma.$queryRawUnsafe<{ def: string }[]>(
      `SELECT pg_get_functiondef('qmulate_unaudited_grant_suppressions()'::regprocedure) AS def`,
    );
    expect(restored?.def, 'the mutant was left installed').toContain(
      `(ae."after" ->> s.col) IS NOT NULL`,
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 4. WHAT IS STILL OPEN
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it.todo(
    'NOT CLOSED — the suppression STILL LEAVES NO `AuditEvent action = delete_soft`, which is what ' +
      '§12 asks for. A trigger cannot write one: it would fork the hash chain (the audited ' +
      'transaction carries `prevHash` in memory while the head row lags, so a mid-transaction insert ' +
      'makes two rows claim the same predecessor and `verifyChain()` cannot tell a fork from ' +
      'tampering), and `occurredAtHijri` is NOT NULL while ADR-0007 allows exactly ONE Umm al-Qura ' +
      'implementation — plus `rowHash` would need a second canonicalizer whose drift breaks gate G-1 ' +
      'silently on real data. What exists instead is DETECTION, above. The three ways forward, in ' +
      'increasing cost: (a) wire this function into gate G-1’s verifier or the reporting layer so a ' +
      'suppression nobody authorised is SEEN and not merely findable; (b) an append-only side ledger ' +
      'in a non-`public` schema, written by a trigger, outside the chain — feasible today but an ' +
      'architecture decision about evidence packs and PDPL scope; (c) E11 builds a real audited ' +
      'revocation path and E12’s privilege separation removes the raw one.',
  );

  it.todo(
    'PRODUCT DECISION, SURFACED AND STILL OPEN — whether break-glass revocation of a compromised ' +
      'seat may be UNAUDITED at all. Governing the narrowing would make the trail mandatory and is ' +
      'one line in `qmulate_grant_admission()`; it would also mean that revoking a suspected-' +
      'compromised Nazir seat requires the access-matrix path that may itself be compromised. This ' +
      'file deliberately decides neither way: the operation is still permitted, and what changed is ' +
      'only that it can now be found.',
  );

  it.todo(
    'A DETECTOR NOTHING CALLS IS NOT A CONTROL. This file calls ' +
      '`qmulate_unaudited_grant_suppressions()` on every integration run, which is a standing check ' +
      'in CI and nowhere else. Production needs it on a schedule or inside the G-1 verifier — both ' +
      'live in `packages/database/src/**` / the worker, which migration 6 does not own.',
  );
});
