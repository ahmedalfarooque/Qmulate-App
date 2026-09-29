// QMULATE — THE LEGITIMATE ACCESS-MATRIX WRITE PATH.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Round 1 closed C-01 by refusing RELATION-NESTED writes into the authorization plane
// unconditionally — including for a caller who legitimately holds `admin:access_matrix:write`. That
// is the right default, and it leaves an obligation: **the legitimate path must still exist, and
// must be proven to exist.** A control that also breaks the sanctioned door is not a control, it is
// an outage that later gets "fixed" by widening the guard.
//
// Round 1 also left a comment on `activateGrant` asserting that
// `approval-authority.integration.test.ts` "drives both halves … this function succeeds for the same
// caller and writes an audit event that names the grant". It did not: that file drives only the two
// REFUSAL cases (the not-implemented default hook, and a named-criterion ineligibility). No
// assertion anywhere proved a grant could actually be issued. This file is that proof, and the
// comment now points here.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT IS PROVEN
// ═══════════════════════════════════════════════════════════════════════════════════════════
//  1. An admin holding `admin:access_matrix:write` issues a grant through `activateGrant`, the row
//     lands ACTIVE, and `audit_event` gains ONE event that NAMES THE GRANT (`entityType`
//     `WaqfAccessGrant`, `entityId` = the new row's id) — not the parent Waqf, not the parent User.
//     That is the property the nested form destroys and the reason the refusal is unconditional.
//  2. The issued grant is REAL: a fresh request context for the grantee resolves it, with the
//     preset-intersected permissions, so the write went through the whole live path rather than
//     landing somewhere nothing reads.
//  3. THE ISSUER IS THE SESSION, NOT THE PAYLOAD. `CHECK waqf_access_grant_no_self_issue` is
//     `grantedByUserId <> userId`; a caller-supplied issuer defeats it with no raw SQL at all and
//     misattributes the escalation to an innocent colleague. `activateGrant` ignores the input field
//     and stamps `ctx.actor.actorId` — asserted here against the stored column, and asserted again
//     by driving the attack (a self-grant naming somebody else as issuer is REFUSED).
//  4. The eligibility hook still gates it: the audited door is not a way around BR-109.
//
// ⚠ WHAT THIS FILE DOES NOT PROVE, AND MUST NOT BE READ AS PROVING. It says nothing about whether
// the nested form is refused — that walk lives in `packages/database`'s extensions and is proven by
// that package's suites. And it says nothing about raw SQL: `$executeRawUnsafe` on the caller's own
// scoped client is intercepted by no Prisma extension, so an insider with application-database
// credentials can still insert a grant row. ADR-0008 defers that to E12 with a hard gate (no real
// client data first). Nothing here narrows it.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_GRANTOR_ID,
  API_TEST_PREFIX,
  assertSeeded,
  basePrisma,
  privilegedPrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  hasDatabase,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

import { ROLE_PRESETS } from '../src/index.js';
import { GrantIneligibleError, activateGrant } from '../src/context.js';

warnNoDatabase(
  'the legitimate access-matrix write path (a direct, audited, top-level grant write)',
);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Subjects
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** `g-` = grant activation. */
const ADMIN = `${API_TEST_PREFIX}g-admin`;
/** A seat with endowment reach but NO `admin:access_matrix:write` — the negative control. */
const FINANCE = `${API_TEST_PREFIX}g-finance`;
/** The grantee. Exists as a `User` with no grant of its own until a test issues one. */
const GRANTEE = `${API_TEST_PREFIX}g-grantee`;
/**
 * A SECOND grantee, for the issuer assertions.
 *
 * Deliberately not reusing {@link GRANTEE}: the "the issued grant is REAL" test asserts the
 * grantee's resolved grant set EXACTLY, and a second seat added by a later test would make that
 * assertion order-dependent — which is how a suite starts passing for the wrong reason.
 */
const GRANTEE_2 = `${API_TEST_PREFIX}g-grantee-2`;

const WAQF_A = 'waqf-001';

/** Stands in for E3/S4's resolver. The DEFAULT hook throws, by design — see `activateGrant`. */
const ELIGIBLE = () => ({ eligible: true as const });

interface StoredGrant {
  readonly id: string;
  readonly userId: string;
  readonly waqfId: string;
  readonly role: string;
  readonly permissions: string[];
  readonly grantedByUserId: string;
  readonly createdBy: string | null;
  readonly revokedAt: Date | null;
}

async function readGrant(id: string): Promise<StoredGrant | null> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<StoredGrant[]>(
    `SELECT "id", "userId", "waqfId", "role"::text AS role, "permissions", "grantedByUserId",
            "createdBy", "revokedAt"
       FROM "waqf_access_grant" WHERE "id" = $1`,
    id,
  );
  return rows[0] ?? null;
}

/**
 * Every `WaqfAccessGrant` audit event naming `grantId`.
 *
 * ⚠ THE ALIAS IS `event_id`, NOT `id`. PostgreSQL resolves `ORDER BY <name>` against the SELECT
 * list's OUTPUT columns first, so `SELECT "id"::text AS id … ORDER BY "id" DESC` sorts the TEXT cast
 * and event 99 outranks event 132. Aliasing away from `id` keeps the ordering numeric.
 */
async function grantEvents(
  grantId: string,
): Promise<{ event_id: string; action: string; entityType: string; waqfId: string | null }[]> {
  const prisma = await basePrisma();
  return prisma.$queryRawUnsafe(
    `SELECT "id"::text AS event_id, "action"::text AS action, "entityType", "waqfId"
       FROM "audit_event"
      WHERE "entityType" = 'WaqfAccessGrant' AND "entityId" = $1
      ORDER BY "id" ASC`,
    grantId,
  );
}

/**
 * Removes a grant this file issued, so the suite is re-runnable.
 *
 * ⚠ THE DELETE GUARD IS TURNED OFF EXPLICITLY. `00000000000005_e2_grant_admission` refuses `DELETE`
 * on a `waqf_access_grant` **that the audit trail records**: such a row is evidence carrying a
 * >= 10-year retention obligation (NFR-07 / BR-702), and `DELETE` + re-`INSERT` of the same id is how
 * a seat's write-once `role` and both one-way off-switches were defeated at once (C-09). Every grant
 * `activateGrant()` issues is audited by construction, so every grant this file creates is refused.
 *
 * The `DO` block is atomic — one block, one statement, one transaction — so if the DELETE raises,
 * the `DISABLE` rolls back with it and the guard is never left off (`@qmulate/database`'s
 * `assertGuardsInstalled()` fails loudly if it is). `ALTER TABLE … DISABLE TRIGGER` needs table
 * OWNERSHIP, which is also the residual the migration documents and ADR-0008 defers to E12: on
 * Railway the runtime connects AS the owner.
 */
async function deleteGrant(id: string): Promise<void> {
  // Scaffolding on the PRIVILEGED (owner) connection — it suspends a DELETE guard and hard-deletes,
  // both of which need table ownership. The runtime role has neither since ADR-0008 round 6, and that
  // is the posture, not a bug. Nothing asserted in this file runs on this connection.
  const prisma = await privilegedPrisma();
  await prisma.$executeRawUnsafe(
    [
      'DO $qm_purge_grant$',
      'BEGIN',
      '  ALTER TABLE "waqf_access_grant" DISABLE TRIGGER waqf_access_grant_no_delete;',
      // Inlined rather than parameterised: `$1` inside a `DO` block body is not a bind slot.
      `  DELETE FROM "waqf_access_grant" WHERE "id" = '${id.replace(/'/g, "''")}';`,
      '  ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER waqf_access_grant_no_delete;',
      'END',
      '$qm_purge_grant$;',
    ].join('\n'),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The suite
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.skipIf(!hasDatabase)('the legitimate access-matrix write path', () => {
  const issued: string[] = [];

  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      // `ROLE_PRESETS.admin` is where `admin:access_matrix:write` comes from — never a literal here,
      // so a preset change cannot leave this suite asserting against a permission nobody holds.
      { id: ADMIN, role: 'SYSTEM_ADMIN', waqfIds: [WAQF_A], permissions: ROLE_PRESETS.admin },
      { id: FINANCE, role: 'FINANCE', waqfIds: [WAQF_A], permissions: ROLE_PRESETS.finance },
      // No grant: the grantees' `User` rows are created, and nothing else.
      { id: GRANTEE, role: null, waqfIds: [] },
      { id: GRANTEE_2, role: null, waqfIds: [] },
    ]);

    expect(
      ROLE_PRESETS.admin as readonly string[],
      'the admin preset no longer carries admin:access_matrix:write — this suite would be testing ' +
        'the wrong seat',
    ).toContain('admin:access_matrix:write');
    expect(ROLE_PRESETS.finance as readonly string[]).not.toContain('admin:access_matrix:write');
  });

  afterAll(async () => {
    for (const id of issued) await deleteGrant(id);
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 1 · the sanctioned door WORKS, and the trail NAMES THE GRANT
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('an admin issues a grant, and audit_event names the GRANT — not its parent row', async () => {
    const ctx = await contextFor({ userId: ADMIN, requestId: 'grant-activate-ok' });

    const { grantId } = await activateGrant(
      ctx,
      { userId: GRANTEE, waqfId: WAQF_A, role: 'FAMILY_BOARD' },
      {
        permissions: ['endowment:waqf:read'],
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      { eligibilityCheck: ELIGIBLE },
    );
    issued.push(grantId);

    // (a) THE ROW. Real, active, on the right endowment, with the right seat.
    const stored = await readGrant(grantId);
    expect(stored, 'activateGrant returned an id for a row that does not exist').not.toBeNull();
    expect(stored?.userId).toBe(GRANTEE);
    expect(stored?.waqfId).toBe(WAQF_A);
    expect(stored?.role).toBe('FAMILY_BOARD');
    expect(stored?.revokedAt).toBeNull();

    // (b) THE TRAIL NAMES THE GRANT. This is the whole reason the nested form is refused
    //     unconditionally: a nested create records the PARENT's before/after image and never the
    //     child, so an access-matrix change becomes unreviewable even when it is authorized.
    const events = await grantEvents(grantId);
    expect(events.length, 'no audit event names the new grant').toBe(1);
    expect(events[0]?.action).toBe('CREATE');
    expect(events[0]?.entityType).toBe('WaqfAccessGrant');
    // Scoped to the endowment, so the trail can be read per waqf.
    expect(events[0]?.waqfId).toBe(WAQF_A);
  });

  it('the issued grant is REAL — a fresh request for the grantee resolves it', async () => {
    // Not "a row exists": the grantee's own next request must see the seat, through the live grant
    // resolver and the preset intersection. A row nothing reads is not an access-matrix change.
    const granteeCtx = await contextFor({ userId: GRANTEE, requestId: 'grant-activate-resolve' });

    const grant = granteeCtx.grants.find((candidate) => candidate.waqfId === WAQF_A);
    expect(grant, 'the grantee resolves no grant on waqf-001').toBeDefined();
    expect(grant?.role).toBe('FAMILY_BOARD');
    // EFFECTIVE permissions: `grant.permissions ∩ preset(role)`, applied on read (MP-18).
    expect(grant?.permissions).toContain('endowment:waqf:read');
    expect(granteeCtx.grants.map((candidate) => candidate.waqfId)).toEqual([WAQF_A]);
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 2 · the ISSUER comes from the session, never from the payload
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('`grantedByUserId` is the ACTING identity — a payload value is ignored, not trusted', async () => {
    const ctx = await contextFor({ userId: ADMIN, requestId: 'grant-activate-issuer' });

    const { grantId } = await activateGrant(
      ctx,
      { userId: GRANTEE_2, waqfId: WAQF_A, role: 'LEADERSHIP' },
      {
        permissions: ['endowment:waqf:read'],
        // A LIE, offered deliberately: the payload names an innocent third party as the issuer.
        grantedByUserId: API_TEST_GRANTOR_ID,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
      },
      { eligibilityCheck: ELIGIBLE },
    );
    issued.push(grantId);

    const stored = await readGrant(grantId);
    // The SESSION won. Whoever issues a seat is on the hook for it, and the trail must say who.
    expect(stored?.grantedByUserId).toBe(ADMIN);
    expect(stored?.grantedByUserId).not.toBe(API_TEST_GRANTOR_ID);
    expect(stored?.createdBy).toBe(ADMIN);
  });

  it('a SELF-issued grant is refused by the database even with a forged issuer in the payload', async () => {
    // The attack `CHECK waqf_access_grant_no_self_issue` exists to stop, driven for real: the admin
    // grants ITSELF a NAZIR seat and names somebody else as the issuer. When the issuer is read from
    // the payload the CHECK compares two attacker-chosen values and passes. Reading it from the
    // session makes `grantedByUserId = userId`, and the CHECK fires.
    const ctx = await contextFor({ userId: ADMIN, requestId: 'grant-activate-self' });

    await expect(
      activateGrant(
        ctx,
        { userId: ADMIN, waqfId: WAQF_A, role: 'NAZIR' },
        {
          permissions: ['endowment:waqf:read'],
          grantedByUserId: API_TEST_GRANTOR_ID,
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
        { eligibilityCheck: ELIGIBLE },
      ),
    ).rejects.toThrow(/no_self_issue/i);

    // And no NAZIR seat exists for the admin — the refusal was not merely reported.
    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "waqf_access_grant"
        WHERE "userId" = $1 AND "role" = 'NAZIR'`,
      ADMIN,
    );
    expect(Number(rows[0]?.n)).toBe(0);
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * 3 · the door does not bypass the constraints around it
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('the eligibility hook still gates the sanctioned door (BR-109)', async () => {
    const ctx = await contextFor({ userId: ADMIN, requestId: 'grant-activate-ineligible' });

    await expect(
      activateGrant(
        ctx,
        { userId: GRANTEE, waqfId: WAQF_A, role: 'AUTHORIZED_REP' },
        {
          permissions: ['endowment:waqf:read'],
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          eligibilityCheck: () => ({
            eligible: false,
            failing: [{ criterion: 'KSA_RESIDENCY', detail: 'not recorded as a KSA resident' }],
          }),
        },
      ),
    ).rejects.toThrow(GrantIneligibleError);
  });

  it('a FINANCE seat cannot issue a grant — the write policy refuses the plane', async () => {
    // The negative control for test 1. Without it, "an admin can issue a grant" would be consistent
    // with "anyone can", and the whole suite would be measuring nothing about authority.
    const ctx = await contextFor({ userId: FINANCE, requestId: 'grant-activate-finance' });

    await expect(
      activateGrant(
        ctx,
        { userId: GRANTEE, waqfId: WAQF_A, role: 'LEADERSHIP' },
        {
          permissions: ['endowment:waqf:read'],
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
        { eligibilityCheck: ELIGIBLE },
      ),
    ).rejects.toThrow();

    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "waqf_access_grant"
        WHERE "userId" = $1 AND "role" = 'LEADERSHIP'`,
      GRANTEE,
    );
    expect(Number(rows[0]?.n)).toBe(0);
  });
});
