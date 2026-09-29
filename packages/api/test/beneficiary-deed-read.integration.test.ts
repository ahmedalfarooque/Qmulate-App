/**
 * **Q-E4-1(a) — A BENEFICIARY PRINCIPAL READS ITS OWN ENDOWMENT'S TRUSTEESHIP DEED, AND NO OTHER'S.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RULING THIS FILE MEASURES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Product owner, **2026-08-18**, `docs/product/prd/S4-owner-decision-memo.md` → "S5 addendum",
 * **Q-E4-1 option (a)**: *every beneficiary principal of a waqf may read THAT waqf's deed;
 * self-isolation otherwise untouched.*
 *
 * It settles D-E (*"deed can be seen by nazir, case manager and elegible beneficiaries"*) against
 * the objection S5 raised and could not resolve itself (binding rule 4): **"eligible" is a computed,
 * frontier-varying, never-persisted fact.** Entitlement moves when somebody dies; the register
 * forbids a stored entitlement verdict; so no column can carry the word and no access check can read
 * it off a row. The owner was given three doors and chose the widest, with the consequence named
 * BEFORE the answer and accepted: **a member currently HELD behind a living ancestor
 * (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`), or excluded under a line the deed does not continue, reads
 * the deed too** — the deed is the document that tells them why. The two declined options are on the
 * record with it: computing entitlement at read time (a fiqh computation gating an access path, and a
 * `SHART_INCOMPLETE` deed unreadable to exactly the people it affects) and a staff-attested flag (a
 * stored judgment beside the forbidden verdict class).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS MEASURED HERE AND WHAT IS MEASURED ELSEWHERE — the claim is split on purpose
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The permission string went into two lists (`ROLE_PRESETS.beneficiary` in `@qmulate/domain`,
 * `GRANT_SHAPE_BY_ROLE.BENEFICIARY` in the seed). **Neither list can prove "own waqf only"** — a
 * preset is a set of strings that has never seen an endowment, and `preset-parity.test.ts` can only
 * pin that the ruling opened exactly ONE endowment verb. The scoping is structural and lives one
 * layer down:
 *
 *  · `WaqfAccessGrant` is **per endowment**, and the seeded portal seat is `onlyWaqfId: 'waqf-001'`;
 *  · rung 2 (`resolveScope`) resolves the grant for the **requested** `waqfId` with no fallback;
 *  · and the force filter narrows `TrusteeshipDeed` (a `WAQF_DIRECT_SCOPED` model) to the request's
 *    own `authorizedWaqfIds` independently of the procedure.
 *
 * So this file measures the behaviour, twice over, and **non-vacuously**: block 2 first proves —
 * through a staff seat provisioned for the purpose — that the foreign endowments really do carry
 * trusteeship deeds, and only then asserts that the portal seat cannot see them. A negative measured
 * over an empty set is R6-C1's failure shape (*a property whose generator cannot reach a
 * configuration reports its silence as success*), and this repo has paid for that lesson once.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE SUBJECT IS THE SEEDED SEAT, DELIBERATELY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `user-beneficiary-ben-001` — the fixture's own portal login — not an invented one. V-E3-L1 was
 * exactly this mistake one layer up: E3's deed exit clause was measured on seats the tests minted,
 * while **no seeded grant carried `endowment:deed:*` at all**, so the clause was unreachable by every
 * user that existed. A ruling that widens the fixture must be measured ON the fixture.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE DOES NOT CLAIM
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ **BR-702 IS NOT SATISFIED BY THIS AND MUST NOT BE REPORTED AS SATISFIED.** The ruling and this
 * file are about the `TrusteeshipDeed` **record** (BR-105). The document **vault** access matrix
 * (BR-702) is E9's, and whether the deed FILE follows the deed RECORD is a row nobody has written.
 * Named here so a later reader does not inherit the record's answer as the file's.
 *
 * ⚠ This file writes NOTHING to seeded rows. Block 2's staff seat is provisioned under
 * `API_TEST_PREFIX` and removed by `cleanupApiTestRows()`; every deed read is a read. That is what
 * makes the suite green TWICE against one database (setup.ts rule 5).
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ROLE_PRESETS } from '@qmulate/domain';

import {
  API_TEST_PREFIX,
  assertSeeded,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  hasDatabase,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('Q-E4-1(a) (beneficiary deed read, own waqf only)');

const createCaller = createCallerFactory(appRouter);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Subjects
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * THE SEEDED PORTAL SEAT. `beneficiarySelfId: 'ben-001'`, `onlyWaqfId: 'waqf-001'`, and — since the
 * Q-E4-1(a) ruling — `endowment:deed:read` in `GRANT_SHAPE_BY_ROLE.BENEFICIARY`.
 */
const PORTAL_SEAT = 'user-beneficiary-ben-001';

/** The endowment that seat is seated on. */
const OWN_WAQF = 'waqf-001';

/**
 * Every OTHER seeded endowment. All four carry a trusteeship deed in `sample-waqf.json`, which is
 * what block 2 proves before asserting the portal seat cannot reach any of them.
 */
const FOREIGN_WAQFS = ['waqf-002', 'waqf-003', 'waqf-004', 'waqf-005'] as const;

/**
 * A staff seat granted deed READ on all four foreign endowments — provisioned ONLY to make block 2's
 * negative non-vacuous. It proves the deeds exist and are readable by somebody, so "the portal seat
 * got NOT_FOUND" means "it was refused", not "there was nothing there".
 */
const FOREIGN_DEED_READER = `${API_TEST_PREFIX}qe41-foreign-reader`;

/** A thrown tRPC error, read structurally — the idiom the sibling files use. */
interface ThrownShape {
  readonly code?: string;
  readonly message?: string;
  readonly cause?: { readonly code?: string };
}

async function capture(run: () => Promise<unknown>): Promise<ThrownShape> {
  try {
    await run();
  } catch (error) {
    return error as ThrownShape;
  }
  throw new Error('expected the call to throw, and it resolved');
}

describe.skipIf(!hasDatabase)('Q-E4-1(a) · a beneficiary reads its own deed and no other', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      {
        id: FOREIGN_DEED_READER,
        role: 'NAZIR',
        waqfIds: [...FOREIGN_WAQFS],
        // Narrowed hard from the nazir preset (grant ∩ preset). This seat exists to READ four deeds
        // and to do nothing else, so it holds one verb.
        permissions: ['endowment:deed:read'],
      },
    ]);
  }, 300_000);

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 0 · The premise, asserted rather than assumed
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('the seeded portal seat really resolves `endowment:deed:read`, on waqf-001 and nowhere else', async () => {
    const ctx = await contextFor({ userId: PORTAL_SEAT, requestId: 'qe41-premise' });

    // Resolved permissions are `stored ∩ preset(role)`. If the ruling had landed in only ONE of the
    // two lists, this is where it would show: a seeded string outside the preset resolves to
    // nothing and would look granted while being inert.
    expect(ROLE_PRESETS.beneficiary).toContain('endowment:deed:read');

    const grants = ctx.grants.map((grant) => ({
      waqfId: grant.waqfId,
      role: grant.role,
      hasDeedRead: grant.permissions.includes('endowment:deed:read'),
    }));
    expect(grants).toEqual([{ waqfId: OWN_WAQF, role: 'BENEFICIARY', hasDeedRead: true }]);

    // The self-pin is intact — this is a portal session, not a staff one wearing the role name.
    // Read off the GRANT (where the DB CHECK `waqf_access_grant_beneficiary_self_pin` puts it);
    // `TrpcContext` carries no such field — that is `@qmulate/database`'s `RequestContext`, a
    // different object with a colliding name (context.ts header).
    expect(ctx.grants[0]?.beneficiarySelfId).toBe('ben-001');
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 1 · DIRECTION ONE — it reads its OWN endowment's deed
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('reads its own endowment’s trusteeship deed, with the record’s real facts', async () => {
    const ctx = await contextFor({ userId: PORTAL_SEAT, requestId: 'qe41-own-deed' });
    const deed = await createCaller(ctx).deed.get({ waqfId: OWN_WAQF });

    // Not merely "did not throw": the fixture's actual appointment crosses the boundary. A read
    // that returned `null` would also "not throw", and would mean the ruling shipped a door onto
    // an empty room.
    expect(deed).not.toBeNull();
    expect(deed?.primaryNazir).toBe('QMULATE (professional Nazir)');
    // waqf-001 is the fixture endowment WITH a delegated manager (Nazarah Art. 11(5)), so the
    // representative half of the record is exercised too, not just the primary.
    expect(deed?.authorizedRep).not.toBeNull();
    expect(deed?.jointlyLiable).toBe(true);
    // The eligibility verdict is RECOMPUTED on every read and never stored, so its presence here is
    // the same recomputation a staff seat gets — the portal seat is not handed a different answer.
    expect(deed?.eligibility.primary).toBeDefined();
  });

  it('the deed the portal seat reads is byte-for-byte the deed a staff seat reads', async () => {
    // The point: the ruling opened a DOOR, it did not create a redacted portal projection. If a
    // future change starts trimming this payload for portal sessions, that is a product decision
    // and it should arrive as a red test rather than as a quiet divergence.
    const portalCtx = await contextFor({ userId: PORTAL_SEAT, requestId: 'qe41-parity-portal' });
    const portal = await createCaller(portalCtx).deed.get({ waqfId: OWN_WAQF });

    const staffCtx = await contextFor({ userId: 'user-nazir-001', requestId: 'qe41-parity-staff' });
    const staff = await createCaller(staffCtx).deed.get({ waqfId: OWN_WAQF });

    expect(portal).toEqual(staff);
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 2 · DIRECTION TWO — it reads NO OTHER endowment's deed, and the negative is NON-VACUOUS
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('the four foreign endowments really do have deeds — the premise of the refusal below', async () => {
    const ctx = await contextFor({ userId: FOREIGN_DEED_READER, requestId: 'qe41-foreign-exist' });
    const caller = createCaller(ctx);

    for (const waqfId of FOREIGN_WAQFS) {
      const deed = await caller.deed.get({ waqfId });
      expect(
        deed,
        `${waqfId} has no trusteeship deed, so refusing it proves nothing`,
      ).not.toBeNull();
      expect(deed?.primaryNazir).toBe('QMULATE (professional Nazir)');
    }
  });

  it('is refused every foreign endowment’s deed — NOT_FOUND, never FORBIDDEN', async () => {
    const ctx = await contextFor({ userId: PORTAL_SEAT, requestId: 'qe41-foreign-refused' });
    const caller = createCaller(ctx);

    for (const waqfId of FOREIGN_WAQFS) {
      const thrown = await capture(() => caller.deed.get({ waqfId }));
      // THE PAIR IS THE ASSERTION (§10 §7.2): no grant on the endowment ⇒ NO_GRANT ⇒ NOT_FOUND, so
      // the caller learns nothing about whether the endowment exists. FORBIDDEN here would be a
      // disclosure, and `resolveScope`'s named mutation is exactly a `ctx.grants[0]` fallback that
      // would have returned the DEED instead of either.
      expect(thrown.code, `deed.get(${waqfId})`).toBe('NOT_FOUND');
      expect(thrown.code).not.toBe('FORBIDDEN');
      expect(thrown.cause?.code).toBe('NO_GRANT');
    }
  });

  it('the force filter narrows TrusteeshipDeed to waqf-001 too — a second, independent lock', async () => {
    // Rung 2 could be bypassed by any caller that queries the model directly (a future router, a
    // job, a mis-written loader). `TrusteeshipDeed` is WAQF_DIRECT_SCOPED, so the request's own
    // client narrows it to `authorizedWaqfIds` with no procedure involved. Asserted separately
    // because "the procedure refuses" and "the data is unreachable" are different claims.
    const ctx = await contextFor({ userId: PORTAL_SEAT, requestId: 'qe41-filter' });

    const rows = await ctx.db.trusteeshipDeed.findMany({ select: { waqfId: true } });
    expect(rows.map((row) => row.waqfId)).toEqual([OWN_WAQF]);
    await expect(ctx.db.trusteeshipDeed.count({})).resolves.toBe(1);
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 3 · SELF-ISOLATION OTHERWISE UNTOUCHED (BR-210, §10 §5)
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * The ruling's own words. This block is the half that would make the widening a defect if it
   * failed, and it is re-taken here rather than inherited from `beneficiary-isolation` /
   * `e4-registry`: those files measured the seat BEFORE it held an `endowment:*` verb.
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('the ENDOWMENT record stays shut — and with it endowment.get’s trusteeship SUMMARY', async () => {
    const ctx = await contextFor({ userId: PORTAL_SEAT, requestId: 'qe41-endowment-shut' });

    // FORBIDDEN, not NOT_FOUND, and the difference is correct: the seat HOLDS a grant on waqf-001,
    // so existence is already disclosed to it and there is nothing left to protect. What it lacks
    // is the verb.
    const thrown = await capture(() => createCaller(ctx).endowment.get({ waqfId: OWN_WAQF }));
    expect(thrown.code).toBe('FORBIDDEN');
    expect(thrown.cause?.code).toBe('PERMISSION_DENIED');
    expect(thrown.message).toContain('endowment:waqf:read');

    // The V-E3-03 shape, stated: `endowment.get` carries a three-field trusteeship summary gated on
    // `endowment:deed:read`. The portal seat now HOLDS that string — so the only thing keeping the
    // endowment record away from it is the OTHER string, and this test is what pins that. Widening
    // the preset with `endowment:waqf:read` "while we are in there" turns this red.
    expect(ROLE_PRESETS.beneficiary).not.toContain('endowment:waqf:read');
  });

  it('navigation still discloses nothing — the tree is empty for a portal seat', async () => {
    const ctx = await contextFor({ userId: PORTAL_SEAT, requestId: 'qe41-nav' });
    const tree = await createCaller(ctx).navigation.tree();
    // `disclosableWaqfIds` demands `endowment:waqf:read`, which the ruling did not grant. An
    // endowment the seat can read the DEED of is still not an endowment it can SEE in the tree —
    // stated, because that asymmetry is deliberate and looks like a bug to a fresh reader.
    expect(tree.clients).toEqual([]);
  });

  it('the beneficiary register is still exactly the caller’s own row', async () => {
    const ctx = await contextFor({ userId: PORTAL_SEAT, requestId: 'qe41-register' });
    const rows = await createCaller(ctx).beneficiary.list({ waqfId: OWN_WAQF });
    // waqf-001 carries several beneficiaries, so this is a real subtraction and not an empty table.
    expect(rows.map((row) => row.id)).toEqual(['ben-001']);
  });

  it('every other force-filter pin is byte-identical to before the widening', async () => {
    const ctx = await contextFor({ userId: PORTAL_SEAT, requestId: 'qe41-pins' });

    // The raw ledger (AC-2: statements, never the ledger).
    await expect(ctx.db.transaction.findMany({ select: { id: true } })).resolves.toEqual([]);
    await expect(ctx.db.bankAccount.findMany({ select: { id: true } })).resolves.toEqual([]);
    await expect(ctx.db.nazirFee.findMany({ select: { id: true } })).resolves.toEqual([]);
    // The authorization plane is INVISIBLE to a portal session, not merely unwritable.
    await expect(ctx.db.waqfAccessGrant.findMany({ select: { id: true } })).resolves.toEqual([]);
    await expect(ctx.db.approvalRequest.findMany({ select: { id: true } })).resolves.toEqual([]);
    await expect(ctx.db.membership.findMany({ select: { id: true } })).resolves.toEqual([]);
    // The trail of everybody else's work is not this seat's own record.
    await expect(ctx.db.auditEvent.findMany({ select: { id: true } })).resolves.toEqual([]);
    // Co-beneficiaries stay unenumerable.
    await expect(ctx.db.beneficiary.count({})).resolves.toBe(1);
  });

  it('the seat still writes NOTHING — including the deed it can now read', async () => {
    const ctx = await contextFor({ userId: PORTAL_SEAT, requestId: 'qe41-write-nothing' });

    // Rung 2 refuses first: the preset holds no `endowment:deed:write` (memo Q10 put deed write
    // beyond EVERY seat — "the trusteeship deed can only be editted by a court judge"), so this is
    // PERMISSION_DENIED, and the C-07 write-nothing posture is never even reached.
    const thrown = await capture(() =>
      createCaller(ctx).deed.upsert({
        waqfId: OWN_WAQF,
        primaryNazir: 'not the appointed Nazir',
        primaryAppointedDate: new Date('2025-02-01T00:00:00.000Z').toISOString(),
        primaryAppointedDateHijri: '1446-08-02',
        authorizedRep: null,
        jointlyLiable: false,
        successorNazir: null,
        eligibility: {
          islam: true,
          legalCapacity: true,
          noDisqualifyingRemoval: true,
          ksaResident: true,
          saudiNationalWhereRequired: null,
          authorityLicensed: null,
        },
        repEligibility: null,
        context: {
          endowerIsForeign: false,
          holdsRealProperty: true,
          nazirIsLegalPerson: false,
        },
      }),
    );
    expect(thrown.code).toBe('FORBIDDEN');
    expect(thrown.cause?.code).toBe('PERMISSION_DENIED');

    // …and the record is unchanged, which is the assertion that matters. A refusal that rolled back
    // a write is a different (worse) system than one that never opened a transaction.
    const after = await createCaller(ctx).deed.get({ waqfId: OWN_WAQF });
    expect(after?.primaryNazir).toBe('QMULATE (professional Nazir)');
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 4 · THE NEIGHBOURING DOOR THE SAME STRING OPENS — recorded, not narrowed
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('deed.verifyEligibility is now reachable, and discloses nothing stored', async () => {
    // `verifyEligibility` is mounted on the SAME permission constant as `deed.get`, so the ruling
    // opened it too. Left reachable DELIBERATELY rather than re-gated on `:write`: it is a pure dry
    // run over caller-supplied flags — it reads no row — and re-gating it would silently narrow the
    // `case_manager` seat the owner ruled on in D-E. This test is the evidence for "discloses
    // nothing stored", so the decision rests on a measurement rather than on the claim.
    const ctx = await contextFor({ userId: PORTAL_SEAT, requestId: 'qe41-dry-run' });

    const verdict = await createCaller(ctx).deed.verifyEligibility({
      waqfId: OWN_WAQF,
      // Deliberately a REFUSING set, and deliberately unlike the stored record (which passes): if
      // the procedure leaked anything from the row, the answer would not track the input.
      flags: {
        islam: true,
        legalCapacity: true,
        noDisqualifyingRemoval: true,
        ksaResident: false,
        saudiNationalWhereRequired: null,
        authorityLicensed: null,
      },
      repFlags: null,
      context: { endowerIsForeign: false, holdsRealProperty: true, nazirIsLegalPerson: false },
    });

    expect(verdict.eligible).toBe(false);
    // The payload carries the RULES and the verdict on the caller's own flags — no appointment, no
    // representative, no name, nothing off the row.
    expect(verdict).not.toHaveProperty('primaryNazir');
    expect(JSON.stringify(verdict)).not.toContain('QMULATE (professional Nazir)');
    expect(JSON.stringify(verdict)).not.toContain('Delegated Manager');
  });
});
