/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE HEADLINE. The rule this whole sprint exists to prove, at the RUNTIME layer:
 *
 *     **The Nazir is the sole approval authority, per endowment, and never the maker.**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * `@qmulate/domain`'s preset algebra is layer one; the `approval_request_authority` trigger and the
 * `approval_request_checker_ne_maker` CHECK are layer three. THIS is layer two, and it is the only one
 * that can say things the other two cannot: a typed refusal BEFORE any state change, and a
 * `Setting`-driven freshness window a CHECK constraint cannot read.
 *
 * Must-proves in this file: MP-07, MP-10, MP-11, MP-12, MP-13, MP-23, MP-24, MP-30, MP-32, MP-36,
 * plus AC-4 (segregation on a run) and AC-6 (the eligibility SEAM only).
 *
 * ── HOW THE ROLE SWEEP IS DERIVED, NOT ENUMERATED ────────────────────────────────────────────
 * The "no role but `nazir`" assertion iterates **all thirteen** roles by reading `ROLE_KEYS` and
 * `ROLE_PRESETS` out of `@qmulate/domain` and translating each to its Prisma `Role` value by INVERTING
 * `@qmulate/auth`'s `DB_ROLE_TO_ROLE_KEY`. Nothing here is hand-written, so a fourteenth role — or a
 * renamed one — is swept the moment it exists, whatever it is called.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DB_ROLE_TO_ROLE_KEY } from '@qmulate/auth';
import { APPROVAL_AUTHORITY_ROLES, ROLE_KEYS, ROLE_PRESETS } from '@qmulate/domain';

import {
  API_TEST_ACTOR_ID,
  API_TEST_PREFIX,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  countAuditEvents,
  databaseModule,
  hasDatabase,
  provisionTestSubjects,
  requireSeededGlobalSetting,
  warnNoDatabase,
  withGlobalSettingHidden,
  type TestSubjectSpec,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import { resolveApprover } from '../src/middleware/segregation.js';
import { activateGrant, GrantIneligibleError } from '../src/context.js';
import { TOTP_STEP_UP_FRESHNESS_SETTING_KEY } from '../src/permissions.js';

import type { ScopedContext } from '../src/middleware/scope.js';
import type { ResolvedGrant, TrpcContext } from '../src/context.js';

warnNoDatabase('the approval-authority suite (MP-07/10/11/12/13/23/24/30/32/36, AC-4, AC-6)');

const createCaller = createCallerFactory(appRouter);
const WAQF_A = 'waqf-001';
const WAQF_B = 'waqf-002';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Subjects
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** AC-4's `F`: the MAKER, who ALSO legitimately holds a nazir grant on the same endowment (§4.2). */
const MAKER_AND_NAZIR = `${API_TEST_PREFIX}maker-and-nazir`;
/** AC-4's `C`: a DISTINCT second nazir on the same endowment. */
const SECOND_NAZIR = `${API_TEST_PREFIX}second-nazir`;
/** MP-12/MP-08: NAZIR on A, FINANCE on B. A nazir on A holds nothing on B. */
const NAZIR_A_FINANCE_B = `${API_TEST_PREFIX}nazir-a-finance-b`;
/** MP-24: an AML compartment member with NO nazir grant. */
const AML_OFFICER = `${API_TEST_PREFIX}aml-officer`;
/** MP-13: a client-level Membership and NO WaqfAccessGrant at all. */
const MEMBERSHIP_ONLY = `${API_TEST_PREFIX}membership-only`;
/** The maker of the fixtures the sweep approves — never one of the sweep's own subjects. */
const SWEEP_MAKER = `${API_TEST_PREFIX}sweep-maker`;

/**
 * `Role` enum value → role key, INVERTED from `@qmulate/auth`'s single map.
 *
 * Inverted rather than re-spelled so the sweep cannot drift from the role catalogue: ADR-0004's
 * thirteen, with the one documented `SYSTEM_ADMIN ↔ admin` exception.
 */
const ROLE_KEY_TO_DB_ROLE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(DB_ROLE_TO_ROLE_KEY).map(([dbRole, roleKey]) => [roleKey, dbRole]),
);

/** One sweep subject per role key, carrying that role's OWN preset — nothing more, nothing less. */
function sweepSubjects(): TestSubjectSpec[] {
  return ROLE_KEYS.map((roleKey) => {
    const dbRole = ROLE_KEY_TO_DB_ROLE[roleKey];
    if (dbRole === undefined) {
      throw new Error(
        `role key "${roleKey}" has no Prisma Role value in @qmulate/auth's DB_ROLE_TO_ROLE_KEY. The ` +
          `sweep is derived from both sides on purpose: a role that exists in one and not the other ` +
          `must fail here rather than being silently skipped.`,
      );
    }
    return {
      id: `${API_TEST_PREFIX}role-${roleKey}`,
      role: dbRole,
      waqfIds: [WAQF_A],
      // THE ROLE'S FULL PRESET. Not a curated subset: the claim being tested is that even a caller
      // holding EVERYTHING their role may hold cannot approve unless that role is `nazir`.
      permissions: [...ROLE_PRESETS[roleKey]],
      // The DB CHECK `waqf_access_grant_beneficiary_self_pin` makes this mandatory IFF role=BENEFICIARY.
      beneficiarySelfId: dbRole === 'BENEFICIARY' ? 'ben-001' : null,
      // An `aml_officer` seat is only meaningful with the compartment flag; nothing else gets it.
      amlCompartment: dbRole === 'AML_OFFICER',
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Fixture helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

let requestCounter = 0;

/**
 * A per-PROCESS tag mixed into every fixture `subjectId`.
 *
 * ⚠ NOT COSMETIC. `approval_request_one_open_per_subject` is a partial unique index over
 * `(waqfId, type, COALESCE(subjectId, ''))` for NON-TERMINAL rows, so a `subjectId` that repeats across
 * runs collides with any row a previous run left behind — and a run that is KILLED (an OOM, a Ctrl-C, a
 * CI timeout) never reaches `afterAll`. Learned the hard way: a crashed run made the next four runs
 * red with a unique-constraint violation that looked nothing like the thing being tested.
 */
const RUN_TAG = String(Math.floor(Math.random() * 9000) + 1000);

/** A payload whose money is a decimal STRING — `canonicalJson` throws on a JS number, deliberately. */
function runPayload(subjectId: string): Record<string, unknown> {
  return {
    kind: 'DISTRIBUTION_RUN',
    distributionId: subjectId,
    waqfId: WAQF_A,
    grossRevenueSar: '100000.00',
    reserveSar: '10000.00',
    operatingSar: '5000.00',
    nazirFeeSar: '10000.00',
    distributableSar: '75000.00',
  };
}

/**
 * Creates a PENDING `ApprovalRequest`, satisfying every guard owner-E installed.
 *
 * ⚠ EVERY REQUEST GETS A DISTINCT `subjectId`. `approval_request_one_open_per_subject` is a partial
 * unique index over `(waqfId, type, COALESCE(subjectId, ''))` for non-terminal rows, so two open
 * requests for one subject are unrepresentable — which is the point (MP-31), and which means the
 * fixtures have to be distinct rather than incidentally colliding.
 */
async function makePendingRequest(options: {
  readonly waqfId?: string;
  readonly makerId: string;
  readonly payload?: Record<string, unknown>;
  /**
   * Overrides the bound fingerprint AT BIRTH.
   *
   * ⚠ THE ONLY REMAINING WAY TO BUILD A STALE ARTIFACT. Migration `00000000000004_e2_guard_gaps`
   * made `payload` and (once set) `payloadHash` part of the request's WRITE-ONCE identity, so the
   * old technique — approve, then rewrite the payload with raw SQL — now raises SQLSTATE 42501
   * before it can create the state. The API-level staleness guard is still defence in depth and
   * still has to be proven, so the mismatch is created where the database still permits one:
   * at insertion. `null` leaves the request unbound.
   */
  readonly payloadHash?: string | null;
}): Promise<{ id: string; subjectId: string; payload: Record<string, unknown> }> {
  const { makeSystemContext, withAudit, createPrismaClient, approvalFingerprint } =
    await databaseModule();

  requestCounter += 1;
  const subjectId = `dist-9${RUN_TAG}${String(requestCounter).padStart(3, '0')}`;
  const payload = options.payload ?? runPayload(subjectId);
  const waqfId = options.waqfId ?? WAQF_A;

  const ctx = makeSystemContext({ actorId: API_TEST_ACTOR_ID, requestId: 'api-test-approval' });
  const db = createPrismaClient(ctx);

  return withAudit(db, async (tx) => {
    const created = await tx.approvalRequest.create({
      data: {
        waqfId,
        type: 'DISTRIBUTION_RUN',
        status: 'PENDING',
        makerId: options.makerId,
        subjectId,
        payload: payload as never,
        payloadHash:
          options.payloadHash === undefined ? approvalFingerprint(payload) : options.payloadHash,
      },
      select: { id: true },
    });
    return { id: created.id, subjectId, payload };
  });
}

/** Reads a request's authoritative row through the UNEXTENDED client (no force-filter). */
async function readRequest(id: string) {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<
    { id: string; status: string; checkerId: string | null; payloadHash: string | null }[]
  >(
    `SELECT "id", "status"::text AS status, "checkerId", "payloadHash" FROM "approval_request" WHERE "id" = $1`,
    id,
  );
  return rows[0];
}

/** Builds a ScopedContext by hand, so `resolveApprover` can be driven past the rungs above it. */
function scopedFrom(
  ctx: TrpcContext,
  overrides: {
    readonly waqfId?: string;
    readonly grant?: Partial<ResolvedGrant>;
    readonly grants?: readonly ResolvedGrant[];
    readonly actor?: Partial<TrpcContext['actor']>;
  } = {},
): ScopedContext {
  const waqfId = overrides.waqfId ?? WAQF_A;
  const base = ctx.grants.find((grant) => grant.waqfId === waqfId) ?? ctx.grants[0];
  if (base === undefined) throw new Error('scopedFrom needs a context with at least one grant');
  const grant = { ...base, ...overrides.grant };
  return {
    ...ctx,
    session: ctx.session as never,
    grants: overrides.grants ?? ctx.grants,
    actor: { ...ctx.actor, ...overrides.actor },
    grant,
    waqfId,
    permission: 'approval:request:approve',
  } as ScopedContext;
}

/**
 * Drives {@link resolveApprover} and reports ONLY a boolean plus the message.
 *
 * ⚠ NOT `expect(promise).rejects.toThrow(...)`, AND THE REASON MATTERS. When such an assertion FAILS —
 * i.e. when the promise resolves — Vitest serializes the resolved value to build the diff, and the
 * resolved value here is an `ApproverContext` carrying `ctx.db`: a Prisma client proxy whose object
 * graph is effectively unbounded. Verified empirically while mutation-testing this file: the failing
 * assertion took the whole worker down with "FATAL ERROR: JavaScript heap out of memory" instead of
 * printing a failure, which makes the mutation UNOBSERVABLE — a mutation you cannot see fail is not a
 * verified test.
 */
async function approverRefusal(
  scoped: ScopedContext,
  approvalRequestId: string,
): Promise<{ refused: boolean; message: string }> {
  try {
    await resolveApprover(scoped, approvalRequestId);
    return { refused: false, message: '(resolved — no refusal)' };
  } catch (error) {
    return { refused: true, message: error instanceof Error ? error.message : String(error) };
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * PART 1 · D-6 with the window MISSING — the fail-closed half
 *
 * ⚠ THE PREMISE INVERTED IN S2. The window used to be missing by default: `auth.totpStepUp.
 * freshnessSeconds` was in no registry and in no seed, so "absent" was the shipped state and this
 * suite only had to not create it — while Part 2 created it in order to prove anything positive.
 * That is the bug this sprint closed: on a real, migrated, seeded database EVERY approve and EVERY
 * sign denied, and it looked like correct fail-closed behaviour.
 *
 * The row is now SEEDED, so the absence has to be manufactured, and only for the duration of the
 * one test that needs it — `withGlobalSettingHidden` soft-deletes it and restores it in a `finally`.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.skipIf(!hasDatabase)('D-6 · with NO configured step-up window, approve DENIES', () => {
  beforeAll(async () => {
    await assertSeeded();
    // Clean FIRST as well as last. `afterAll` does not run when a process is killed, so a previous
    // crash can leave non-terminal approval rows and half-provisioned subjects behind — and a leftover
    // row makes a premise silently true (or, worse, collides with a unique index).
    await cleanupApiTestRows();
    await provisionTestSubjects([
      {
        id: SWEEP_MAKER,
        role: 'FINANCE',
        waqfIds: [WAQF_A],
        permissions: [...ROLE_PRESETS.finance],
      },
      { id: SECOND_NAZIR, role: 'NAZIR', waqfIds: [WAQF_A], permissions: [...ROLE_PRESETS.nazir] },
    ]);
  });

  it('refuses with TOTP_STEP_UP_REQUIRED / SETTING_MISSING — never a hardcoded fallback window', async () => {
    const request = await makePendingRequest({ makerId: SWEEP_MAKER });
    const ctx = await contextFor({ userId: SECOND_NAZIR, requestId: 'd6-missing-setting' });

    let thrown: unknown;
    await withGlobalSettingHidden(TOTP_STEP_UP_FRESHNESS_SETTING_KEY, async () => {
      try {
        await createCaller(ctx).approval.approve({
          waqfId: WAQF_A,
          approvalRequestId: request.id,
        });
      } catch (error) {
        thrown = error;
      }
    });
    expect((thrown as { code?: string }).code).toBe('FORBIDDEN');
    expect(String((thrown as { message?: string }).message)).toContain('TOTP_STEP_UP_REQUIRED');
    expect(String((thrown as { message?: string }).message)).toContain('SETTING_MISSING');

    // NO STATE CHANGE. `packages/auth` ships a documentary STEP_UP_FRESH_AGE_SECONDS = 600; if this
    // layer ever read it as a fallback, the approval would have gone through under a window nobody
    // configured.
    expect((await readRequest(request.id))?.status).toBe('PENDING');
  });

  it('and the SAME approval then succeeds on the SEEDED window — no test-written Setting row', async () => {
    // ⚠ THE REGRESSION THIS SPRINT ADDS. The refusal above is only meaningful if the positive path
    // works on a database built by `migrate:deploy && db:seed` and nothing else. Before the key was
    // registered and seeded, THIS test could not exist: every suite that needed an approval to
    // succeed wrote the row itself, so "the Nazir can approve" was never once demonstrated against
    // the shipped configuration.
    const seeded = await requireSeededGlobalSetting(TOTP_STEP_UP_FRESHNESS_SETTING_KEY);
    expect(seeded.unit).toBe('seconds');
    expect(typeof seeded.v).toBe('number');

    const request = await makePendingRequest({ makerId: SWEEP_MAKER });
    const ctx = await contextFor({ userId: SECOND_NAZIR, requestId: 'd6-seeded-setting' });
    const result = await createCaller(ctx).approval.approve({
      waqfId: WAQF_A,
      approvalRequestId: request.id,
    });

    expect(result.status).toBe('APPROVED');
    expect(result.checkerId).toBe(SECOND_NAZIR);
    expect((await readRequest(request.id))?.status).toBe('APPROVED');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * PART 2 · the authority model
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.skipIf(!hasDatabase)('the Nazir is the sole approval authority, per endowment', () => {
  beforeAll(async () => {
    await assertSeeded();

    await provisionTestSubjects([
      ...sweepSubjects(),
      {
        id: SWEEP_MAKER,
        role: 'FINANCE',
        waqfIds: [WAQF_A],
        permissions: [...ROLE_PRESETS.finance],
      },
      { id: SECOND_NAZIR, role: 'NAZIR', waqfIds: [WAQF_A], permissions: [...ROLE_PRESETS.nazir] },
      // AC-4's F holds BOTH seats on the SAME endowment — §4.2's small-team case, spelled out.
      {
        id: MAKER_AND_NAZIR,
        role: 'FINANCE',
        waqfIds: [WAQF_A],
        permissions: [...ROLE_PRESETS.finance],
      },
      {
        id: MAKER_AND_NAZIR,
        role: 'NAZIR',
        waqfIds: [WAQF_A],
        permissions: [...ROLE_PRESETS.nazir],
      },
      {
        id: NAZIR_A_FINANCE_B,
        role: 'NAZIR',
        waqfIds: [WAQF_A],
        permissions: [...ROLE_PRESETS.nazir],
      },
      {
        id: NAZIR_A_FINANCE_B,
        role: 'FINANCE',
        waqfIds: [WAQF_B],
        permissions: [...ROLE_PRESETS.finance],
      },
      {
        id: AML_OFFICER,
        role: 'AML_OFFICER',
        waqfIds: [WAQF_A],
        permissions: [...ROLE_PRESETS.aml_officer],
        // Membership is the gate; the preset is only the capability. Without this flag the subject is
        // an aml_officer who is inside no compartment, and MP-24's premise would be untrue.
        amlCompartment: true,
      },
      { id: MEMBERSHIP_ONLY, role: null, waqfIds: [] },
    ]);

    // MP-13's subject: a client-level Membership and NO grant. The CHECK
    // `membership_role_family_level_only` pins the column to FAMILY_BOARD, so `role: NAZIR` is not
    // even representable — which is itself part of the answer, and is asserted below.
    const { makeSystemContext, withAudit, createPrivilegedPrismaClient } = await databaseModule();
    const systemCtx = makeSystemContext({
      actorId: API_TEST_ACTOR_ID,
      requestId: 'api-test-membership',
    });
    // ⚠ `membership` IS AUTHORIZATION-PLANE, AND THE RUNTIME ROLE MAY ONLY READ IT (ADR-0008 round 6).
    // MEASURED on the app connection: `42501 permission denied for table membership`. `membership` is
    // revoked alongside `waqf_access_grant` because it is the other row-shaped claim about who somebody
    // is; nothing on the request path writes it (only the fixture seed does), so revoking it cost
    // nothing and closed a route before it opened. Provisioning one is therefore a privileged act, and
    // the privileged client is what performs it — still fully audited.
    const systemDb = createPrivilegedPrismaClient(systemCtx);
    await withAudit(systemDb, async (tx) => {
      const existing = await tx.membership.findFirst({
        where: { userId: MEMBERSHIP_ONLY, clientId: 'client-001' },
        select: { id: true },
      });
      if (existing === null) {
        await tx.membership.create({
          data: { userId: MEMBERSHIP_ONLY, clientId: 'client-001', role: 'FAMILY_BOARD' },
        });
      }
    });

    // ⚠ THE STEP-UP WINDOW IS NOT WRITTEN HERE. It is seeded, and this asserts so rather than
    // provisioning it: a suite that creates its own precondition can prove the ladder works and say
    // nothing at all about whether the shipped configuration lets a Nazir approve.
    await requireSeededGlobalSetting(TOTP_STEP_UP_FRESHNESS_SETTING_KEY);
  });

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * THE SWEEP — all thirteen roles, derived from the registry
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('the sweep really covers thirteen roles, and exactly one of them is the authority', () => {
    expect(ROLE_KEYS).toHaveLength(13);
    expect([...APPROVAL_AUTHORITY_ROLES]).toEqual(['nazir']);
    // Every role key must translate, in both directions — a role present in one catalogue and not the
    // other would be silently skipped by the sweep otherwise.
    for (const roleKey of ROLE_KEYS) {
      expect(ROLE_KEY_TO_DB_ROLE[roleKey], `${roleKey} has no Prisma Role value`).toBeTruthy();
    }
  });

  it('MP-01/MP-04/MP-05/MP-06 · no role but `nazir` can reach an approve procedure', async () => {
    for (const roleKey of ROLE_KEYS) {
      const userId = `${API_TEST_PREFIX}role-${roleKey}`;
      const request = await makePendingRequest({ makerId: SWEEP_MAKER });
      const ctx = await contextFor({ userId, requestId: `sweep-${roleKey}` });

      // The premise: this subject really does hold a grant on this endowment, carrying its role's FULL
      // preset. Without asserting it, a provisioning failure would produce a NOT_FOUND that looks like
      // a passing authority refusal.
      expect(
        ctx.grants.map((grant) => grant.waqfId),
        roleKey,
      ).toContain(WAQF_A);

      let thrown: unknown;
      let succeeded = false;
      try {
        await createCaller(ctx).approval.approve({
          waqfId: WAQF_A,
          approvalRequestId: request.id,
        });
        succeeded = true;
      } catch (error) {
        thrown = error;
      }

      if (roleKey === 'nazir') {
        expect(
          succeeded,
          'the nazir must be able to approve — a suite that denies everyone is worthless',
        ).toBe(true);
        expect((await readRequest(request.id))?.status).toBe('APPROVED');
      } else {
        expect(succeeded, `role ${roleKey} was able to approve`).toBe(false);
        // FORBIDDEN, from the scope rung: the role's preset contains no approve verb, so the grant
        // cannot carry `approval:request:approve` and the caller never reaches the approval rung.
        expect((thrown as { code?: string }).code, roleKey).toBe('FORBIDDEN');
        expect((await readRequest(request.id))?.status, roleKey).toBe('PENDING');
      }
    }
  });

  it('D-1 / D-2 · `leadership` and `authorized_rep` specifically hold no approve or sign', () => {
    // Named explicitly as well as swept, because these two are the ones the spec's PROSE flirted with:
    // §3's parenthetical ("within the leadership authority matrix") and §2.1's "never SOLELY
    // authorize". Both are the drifted side and both are overridden by user decision.
    for (const roleKey of ['leadership', 'authorized_rep'] as const) {
      for (const permission of ROLE_PRESETS[roleKey]) {
        expect(permission.endsWith(':approve'), `${roleKey} holds ${permission}`).toBe(false);
        expect(permission.endsWith(':sign'), `${roleKey} holds ${permission}`).toBe(false);
      }
    }
  });

  it('the DATABASE refuses to issue a non-NAZIR grant carrying an approve permission', async () => {
    // This is what makes the sweep airtight rather than circumstantial: a non-nazir cannot reach the
    // approval rung because the grant that would let them is UNREPRESENTABLE, not merely unusual.
    await expect(
      provisionTestSubjects([
        {
          id: `${API_TEST_PREFIX}illegal-approver`,
          role: 'FINANCE',
          waqfIds: [WAQF_A],
          permissions: ['finance:transaction:read', 'approval:request:approve'],
        },
      ]),
    ).rejects.toThrow(/approve and sign belong to the NAZIR alone|may not hold/i);
  });

  it('MP-07 · even a hand-forged approve permission on FAMILY_BOARD fails the authority check', async () => {
    // Driven directly at `resolveApprover`, because the DB refuses to create the grant that would let a
    // FAMILY_BOARD caller reach it through the router. This is MP-07's mutation target: widening the
    // predicate from `role === 'NAZIR'` to `'NAZIR' || 'FAMILY_BOARD'`.
    const request = await makePendingRequest({ makerId: SWEEP_MAKER });
    const boardCtx = await contextFor({
      userId: `${API_TEST_PREFIX}role-family_board`,
      requestId: 'mp07-forged',
    });

    const scoped = scopedFrom(boardCtx, {
      grant: { permissions: ['approval:request:approve'] as never, role: 'FAMILY_BOARD' },
      grants: boardCtx.grants.map((grant) => ({
        ...grant,
        permissions: ['approval:request:approve'] as never,
      })),
    });

    const outcome = await approverRefusal(scoped, request.id);
    expect(outcome.refused, `FAMILY_BOARD reached an approval: ${outcome.message}`).toBe(true);
    expect(outcome.message).toContain('must hold an ACTIVE NAZIR WaqfAccessGrant');
    expect((await readRequest(request.id))?.status).toBe('PENDING');
  });

  it('MP-24 · an AML compartment member with no nazir grant is denied, and AML can only BLOCK', async () => {
    const request = await makePendingRequest({ makerId: SWEEP_MAKER });
    const ctx = await contextFor({ userId: AML_OFFICER, requestId: 'mp24-aml' });

    // The premise: this caller really IS inside the compartment for this endowment.
    expect(ctx.grants.find((grant) => grant.waqfId === WAQF_A)?.amlCompartment).toBe(true);

    await expect(
      createCaller(ctx).approval.approve({ waqfId: WAQF_A, approvalRequestId: request.id }),
    ).rejects.toThrow();
    expect((await readRequest(request.id))?.status).toBe('PENDING');

    // …and, driven past the scope rung, compartment membership STILL does not satisfy the authority.
    const scoped = scopedFrom(ctx, {
      grant: { permissions: ['approval:request:approve'] as never },
      grants: ctx.grants.map((grant) => ({
        ...grant,
        permissions: ['approval:request:approve'] as never,
      })),
    });
    const outcome = await approverRefusal(scoped, request.id);
    expect(outcome.refused, `an AML compartment member approved: ${outcome.message}`).toBe(true);
    expect(outcome.message).toContain('must hold an ACTIVE NAZIR WaqfAccessGrant');
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * MP-12 / MP-13 — per-endowment, and never from a Membership
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('MP-12 · a NAZIR on A is denied approve on B — the lookup is parameterised by the TARGET', async () => {
    const request = await makePendingRequest({ waqfId: WAQF_B, makerId: SWEEP_MAKER });
    const ctx = await contextFor({ userId: NAZIR_A_FINANCE_B, requestId: 'mp12-cross' });

    // The premise, both halves: NAZIR on A, FINANCE on B. A role-shaped check
    // (`roles.includes('nazir')`) would pass, because `getUserRoleKeys` unions across every grant with
    // no waqfId at all — which is exactly why nothing in this package calls it.
    expect(ctx.grants.find((grant) => grant.waqfId === WAQF_A)?.role).toBe('NAZIR');
    expect(ctx.grants.find((grant) => grant.waqfId === WAQF_B)?.role).toBe('FINANCE');

    await expect(
      createCaller(ctx).approval.approve({ waqfId: WAQF_B, approvalRequestId: request.id }),
    ).rejects.toThrow();
    expect((await readRequest(request.id))?.status).toBe('PENDING');

    // …and the same caller CAN approve on A, so the refusal is about the endowment and nothing else.
    const onA = await makePendingRequest({ makerId: SWEEP_MAKER });
    await expect(
      createCaller(
        await contextFor({ userId: NAZIR_A_FINANCE_B, requestId: 'mp12-own' }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: onA.id }),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('MP-12/MP-08 · rung 3 re-checks the endowment ITSELF, past the scope rung', async () => {
    // ⚠ WHY THIS EXISTS AS A SEPARATE TEST. Through the router the previous case is refused by rung 2:
    // the caller's grant on B is FINANCE and lacks `approval:request:approve`, so rung 3 is never
    // reached — which means dropping `grant.waqfId === ctx.waqfId` from rung 3's authority lookup would
    // change NOTHING observable, and the clause would be untested defence in depth. Found by running
    // exactly that mutation and watching every test stay green.
    //
    // So this drives `resolveApprover` DIRECTLY with a forged approve permission on the B grant, which
    // is the only way to make rung 3's own per-endowment clause load-bearing.
    const request = await makePendingRequest({ waqfId: WAQF_B, makerId: SWEEP_MAKER });
    const ctx = await contextFor({ userId: NAZIR_A_FINANCE_B, requestId: 'mp12-rung3' });

    const scoped = scopedFrom(ctx, {
      waqfId: WAQF_B,
      grant: { permissions: ['approval:request:approve'] as never },
      grants: ctx.grants.map((grant) =>
        grant.waqfId === WAQF_B
          ? { ...grant, permissions: ['approval:request:approve'] as never }
          : grant,
      ),
    });

    const outcome = await approverRefusal(scoped, request.id);
    expect(
      outcome.refused,
      `a NAZIR grant on ${WAQF_A} satisfied the authority check for ${WAQF_B}: ${outcome.message}`,
    ).toBe(true);
    expect(outcome.message).toContain('must hold an ACTIVE NAZIR WaqfAccessGrant');
    expect(outcome.message).toContain(WAQF_B);
    expect((await readRequest(request.id))?.status).toBe('PENDING');
  });

  it('MP-13 · a client-level Membership yields authorizedWaqfIds [] and confers no approve', async () => {
    const ctx = await contextFor({ userId: MEMBERSHIP_ONLY, requestId: 'mp13-membership' });

    // A Membership contributes NOTHING to the API context — not a role, and not even read scope. See
    // `resolveGrants`' companion note: the model has no revokedAt / validFrom / validUntil at all, so
    // any reach it conferred would be unexpirable and revocable only by soft-delete.
    expect(ctx.grants).toEqual([]);
    await expect(ctx.db.waqf.findMany({ select: { id: true } })).resolves.toEqual([]);

    for (const waqfId of [WAQF_A, WAQF_B]) {
      const request = await makePendingRequest({ waqfId, makerId: SWEEP_MAKER });
      let thrown: unknown;
      try {
        await createCaller(ctx).approval.approve({ waqfId, approvalRequestId: request.id });
      } catch (error) {
        thrown = error;
      }
      // NOT_FOUND: with no grant the caller is not told the endowment exists, let alone the request.
      expect((thrown as { code?: string }).code, waqfId).toBe('NOT_FOUND');
    }
  });

  it('MP-13 · the DATABASE refuses a client-level Membership carrying an operational seat', async () => {
    const prisma = await basePrisma();
    // One row at the client level with `role: NAZIR` would mint an approval authority spanning every
    // endowment of the family, with no validity window and no revocation path.
    await expect(
      prisma.$executeRawUnsafe(
        `INSERT INTO "membership" ("id","userId","clientId","role","createdAt","updatedAt")
         VALUES ('membership-test-illegal', $1, 'client-001', 'NAZIR', now(), now())`,
        MEMBERSHIP_ONLY,
      ),
    ).rejects.toThrow();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * MP-10 / MP-11 / AC-4 — maker != checker, IDENTITY-shaped, before any state change
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('MP-10/MP-11/AC-4 · the maker cannot approve their own run EVEN holding a nazir grant', async () => {
    const request = await makePendingRequest({ makerId: MAKER_AND_NAZIR });
    const ctx = await contextFor({ userId: MAKER_AND_NAZIR, requestId: 'ac4-self' });

    // The premise: this caller holds BOTH seats on this endowment. A role-shaped check ("caller is a
    // nazir → allow") passes here, and only an identity check fails it.
    const roles = ctx.grants.filter((grant) => grant.waqfId === WAQF_A).map((grant) => grant.role);
    expect(roles.sort()).toEqual(['FINANCE', 'NAZIR']);

    const beforeApproveEvents = await countAuditEvents({
      action: 'APPROVE',
      entityId: request.id,
    });

    let thrown: unknown;
    try {
      await createCaller(ctx).approval.approve({ waqfId: WAQF_A, approvalRequestId: request.id });
    } catch (error) {
      thrown = error;
    }

    expect((thrown as { code?: string }).code).toBe('FORBIDDEN');
    expect(String((thrown as { message?: string }).message)).toContain('SEGREGATION_OF_DUTIES');

    // ⚠ BEFORE ANY STATE CHANGE (§10 §4.2). Not merely "the final status is unchanged": there must be
    // no partial write and no audit row claiming an approval.
    const row = await readRequest(request.id);
    expect(row?.status).toBe('PENDING');
    expect(row?.checkerId).toBeNull();
    expect(await countAuditEvents({ action: 'APPROVE', entityId: request.id })).toBe(
      beforeApproveEvents,
    );
  });

  it('MP-11 · the SAME caller CAN approve a run initiated by someone else', async () => {
    // The second half, and the half that makes the first one meaningful: the refusal above is about
    // WHO INITIATED, not about who is asking. §4.2: "they may approve runs initiated by others."
    const request = await makePendingRequest({ makerId: SWEEP_MAKER });
    const ctx = await contextFor({ userId: MAKER_AND_NAZIR, requestId: 'ac4-other' });

    await expect(
      createCaller(ctx).approval.approve({ waqfId: WAQF_A, approvalRequestId: request.id }),
    ).resolves.toMatchObject({ status: 'APPROVED', checkerId: MAKER_AND_NAZIR });
  });

  it('AC-4 · the approval succeeds only with a FRESH TOTP assertion', async () => {
    for (const [label, assertedAt] of [
      ['no assertion at all', null],
      ['an assertion older than the 600s window', new Date(Date.now() - 601_000)],
      ['a future-dated assertion', new Date(Date.now() + 60_000)],
    ] as const) {
      const request = await makePendingRequest({ makerId: SWEEP_MAKER });
      const ctx = await contextFor({
        userId: SECOND_NAZIR,
        totpAssertedAt: assertedAt,
        requestId: `ac4-totp-${label}`,
      });
      let thrown: unknown;
      try {
        await createCaller(ctx).approval.approve({ waqfId: WAQF_A, approvalRequestId: request.id });
      } catch (error) {
        thrown = error;
      }
      expect(String((thrown as { message?: string }).message), label).toContain(
        'TOTP_STEP_UP_REQUIRED',
      );
      expect((await readRequest(request.id))?.status, label).toBe('PENDING');
    }

    // …and a fresh one succeeds, and is RECORDED as evidence on the row.
    const ok = await makePendingRequest({ makerId: SWEEP_MAKER });
    const freshCtx = await contextFor({ userId: SECOND_NAZIR, requestId: 'ac4-totp-fresh' });
    await expect(
      createCaller(freshCtx).approval.approve({ waqfId: WAQF_A, approvalRequestId: ok.id }),
    ).resolves.toMatchObject({ status: 'APPROVED' });

    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<{ t: Date | null }[]>(
      `SELECT "checkerTotpAssertedAt" AS t FROM "approval_request" WHERE "id" = $1`,
      ok.id,
    );
    expect(rows[0]?.t).toBeInstanceOf(Date);
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * MP-30 / AC-4 — staleness voids approval
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('MP-30/AC-4 · a post-approval payload change is REFUSED IN SQL, and a stale artifact VOIDS', async () => {
    // ⚠ ADAPTED FOR MIGRATION `00000000000004_e2_guard_gaps` (finding C-02, another owner). This
    // test used to APPROVE a request and then rewrite its `payload` with raw SQL, to prove the API
    // noticed on replay. The database now refuses that UPDATE outright — `payload` is part of the
    // request's write-once identity — so the old body no longer reaches its own assertion. Both
    // halves are asserted here rather than one being dropped: the SQL refusal is the STRONGER new
    // guarantee, and the API's staleness path is still defence in depth and still has to be proven.
    const request = await makePendingRequest({ makerId: SWEEP_MAKER });

    // C approves the artifact as submitted.
    await expect(
      createCaller(
        await contextFor({ userId: SECOND_NAZIR, requestId: 'mp30-approve' }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: request.id }),
    ).resolves.toMatchObject({ status: 'APPROVED' });

    // HALF 1 — the artifact cannot change after approval AT ALL. Raw SQL, because that is the honest
    // shape of the threat: whoever changes the lines after approval is otherwise the real approver,
    // and they will not go through a procedure that recomputes the hash.
    const prisma = await basePrisma();
    const tampered = { ...request.payload, distributableSar: '95000.00' };
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "approval_request" SET "payload" = $1::jsonb WHERE "id" = $2`,
        JSON.stringify(tampered),
        request.id,
      ),
    ).rejects.toThrow(/WRITE-ONCE IDENTITY/);
    // Refused BEFORE any state change: the approval still stands, unaltered.
    expect((await readRequest(request.id))?.status).toBe('APPROVED');

    // HALF 2 — the API-level guard, on the one path the database still leaves open: a request whose
    // bound hash never matched its payload. §10 §4.3: "the prior approval is VOIDED and the item
    // returns to re-submit." `VOID` exists as of E2 precisely so that state is REPRESENTABLE —
    // before it, the only options were to leave a stale APPROVED row standing (a live second
    // authority) or to rewrite history.
    const stale = await makePendingRequest({
      makerId: SWEEP_MAKER,
      payloadHash: 'f'.repeat(64),
    });

    let thrown: unknown;
    try {
      await createCaller(
        await contextFor({ userId: SECOND_NAZIR, requestId: 'mp30-replay' }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: stale.id });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: string }).code).toBe('CONFLICT');
    expect(String((thrown as { message?: string }).message)).toContain('APPROVAL_STALE');
    expect((await readRequest(stale.id))?.status).toBe('VOID');
  });

  it('MP-30 · a request whose payloadHash is absent can never be approved', async () => {
    // `approvalFingerprintMatches(payload, null)` is false by construction: "an unbound approval
    // matches nothing". Without that, a request created with no hash would be trivially "current".
    //
    // ⚠ THE NULL IS NOW SET AT BIRTH, not by a later UPDATE: migration `00000000000004` makes
    // `payloadHash` write-once ONCE SET, so nulling a bound hash raises SQLSTATE 42501. Creating the
    // request unbound reaches the same guard by the only route that remains — and it is the
    // realistic one, since the trigger deliberately permits a request raised before its artifact is
    // fingerprinted.
    const request = await makePendingRequest({ makerId: SWEEP_MAKER, payloadHash: null });
    expect((await readRequest(request.id))?.payloadHash).toBeNull();

    await expect(
      createCaller(
        await contextFor({ userId: SECOND_NAZIR, requestId: 'mp30-nohash' }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: request.id }),
    ).rejects.toThrow(/APPROVAL_STALE/);
  });

  it('a TERMINAL request cannot be re-decided', async () => {
    const request = await makePendingRequest({ makerId: SWEEP_MAKER });
    await createCaller(
      await contextFor({ userId: SECOND_NAZIR, requestId: 'terminal-1' }),
    ).approval.approve({ waqfId: WAQF_A, approvalRequestId: request.id });

    // Same artifact, unchanged — so this is the "already decided" path rather than the stale one.
    let thrown: unknown;
    try {
      await createCaller(
        await contextFor({ userId: SECOND_NAZIR, requestId: 'terminal-2' }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: request.id });
    } catch (error) {
      thrown = error;
    }
    expect(String((thrown as { message?: string }).message)).toContain('APPROVAL_STALE');
    expect(String((thrown as { message?: string }).message)).toContain('NOT_OPEN');
    // Still APPROVED, not re-decided and not voided: re-deciding a closed approval is how a second
    // authority is created through an UPDATE.
    expect((await readRequest(request.id))?.status).toBe('APPROVED');
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * MP-23 / MP-36 — non-human actors, and delegation claims
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('MP-23 · a SYSTEM or SERVICE actor can never produce an approval', async () => {
    const request = await makePendingRequest({ makerId: SWEEP_MAKER });
    const ctx = await contextFor({ userId: SECOND_NAZIR, requestId: 'mp23-system' });

    for (const actorType of ['SYSTEM', 'SERVICE'] as const) {
      const scoped = scopedFrom(ctx, { actor: { actorType, actorId: null } });
      const outcome = await approverRefusal(scoped, request.id);
      expect(outcome.refused, `${actorType} produced an approval: ${outcome.message}`).toBe(true);
      expect(outcome.message).toContain('cannot approve');
    }
    expect((await readRequest(request.id))?.status).toBe('PENDING');
  });

  it('MP-23 · a job cannot satisfy the DATABASE either — an approval with no approver is refused', async () => {
    const request = await makePendingRequest({ makerId: SWEEP_MAKER });
    const prisma = await basePrisma();

    // A job has no user id, so the closest it can come is a NULL checker. The trigger refuses it, and
    // so does the CHECK `approval_request_decided_requires_checker`.
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "approval_request" SET "status" = 'APPROVED', "decidedAt" = now() WHERE "id" = $1`,
        request.id,
      ),
    ).rejects.toThrow();
    expect((await readRequest(request.id))?.status).toBe('PENDING');
  });

  it('MP-36 · onBehalfOfId confers ZERO approve capability', async () => {
    // The maker is a DIFFERENT person from the caller, so maker≠checker passes and the refusal below
    // can only be the authority check — otherwise segregation would mask what is being tested.
    const request = await makePendingRequest({ makerId: MAKER_AND_NAZIR });
    // A FINANCE-only caller claiming to act on behalf of a real Nazir. If any authority path resolved
    // the checker grant for `onBehalfOfId ?? actorId`, this would be straight impersonation of the sole
    // approval authority — and the audit hash would cryptographically seal the lie.
    const financeCtx = await contextFor({ userId: SWEEP_MAKER, requestId: 'mp36-obo' });
    const scoped = scopedFrom(financeCtx, {
      actor: { onBehalfOfId: SECOND_NAZIR },
      grant: { permissions: ['approval:request:approve'] as never },
      grants: financeCtx.grants.map((grant) => ({
        ...grant,
        permissions: ['approval:request:approve'] as never,
      })),
    });

    const outcome = await approverRefusal(scoped, request.id);
    expect(outcome.refused, `onBehalfOfId conferred approval: ${outcome.message}`).toBe(true);
    expect(outcome.message).toContain('must hold an ACTIVE NAZIR WaqfAccessGrant');
    expect((await readRequest(request.id))?.status).toBe('PENDING');
  });

  it('MP-36 · the context pins onBehalfOfId to null, so it cannot be supplied by a request', async () => {
    const ctx = await contextFor({ userId: SECOND_NAZIR, requestId: 'mp36-null' });
    expect(ctx.actor.onBehalfOfId).toBeNull();
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * MP-32 — the trail proves the AUTHORITY, not merely the identity
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('MP-32 · the APPROVE event names the grant and the role that conferred the authority', async () => {
    const request = await makePendingRequest({ makerId: SWEEP_MAKER });
    const ctx = await contextFor({ userId: SECOND_NAZIR, requestId: 'mp32-audit' });
    await createCaller(ctx).approval.approve({ waqfId: WAQF_A, approvalRequestId: request.id });

    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<
      {
        action: string;
        category: string;
        classification: string;
        actorId: string | null;
        waqfId: string | null;
        grantId: string | null;
        role: string | null;
        makerId: string | null;
      }[]
    >(
      `SELECT "action"::text AS action, "category"::text AS category,
              "classification"::text AS classification, "actorId", "waqfId",
              "context"->>'grantId' AS "grantId", "context"->>'role' AS role,
              "context"->>'makerId' AS "makerId"
         FROM "audit_event"
        WHERE "action" = 'APPROVE' AND "entityId" = $1
        ORDER BY "id" DESC LIMIT 1`,
      request.id,
    );

    const event = rows[0];
    expect(event, 'no APPROVE audit event was written').toBeDefined();
    expect(event?.category).toBe('APPROVAL');
    // actorId = the CHECKER. An approval attributed to anyone else is not an attribution.
    expect(event?.actorId).toBe(SECOND_NAZIR);
    expect(event?.waqfId).toBe(WAQF_A);
    // ⚠ MP-32's substance: the AUTHORITY, not merely the identity. An approval whose authority is
    // unrecorded is an unauditable one (BR-607, NFR-04).
    expect(event?.grantId, 'the APPROVE event does not name the grant').toBeTruthy();
    expect(event?.role).toBe('NAZIR');
    expect(event?.makerId).toBe(SWEEP_MAKER);
    // MP-24's mirror image: an approval must never be classified into the AML compartment, where the
    // legally accountable Nazir could not audit it.
    expect(event?.classification).not.toBe('RESTRICTED');
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * C-08 — the APPROVE event's before/after diff must be TRUE
   *
   * What shipped: the `update` inside `approval.approve` carried
   * `select: { id, status, checkerId, decidedAt }`. The audit extension takes its pre-image from a
   * full `findFirst` and its post-image from the operation's OWN result — so the diff compared a
   * whole row against a four-key projection, and `diffChangedKeys` reads an absent key as `null`.
   * The event therefore asserted, in writing, that approving a request set `makerId`, `payloadHash`,
   * `subjectId`, `waqfId`, `type` and `payload` TO NULL. Eight of eighteen APPROVE rows in a single
   * integration run carried that false statement, and `verifyChain` returned ok over all of them:
   * the hash chain seals whatever it is given, so a false statement in an append-only table is
   * cryptographically authentic evidence of something that did not happen — on the single most
   * legally significant action in the product.
   *
   * Two properties, both behavioural, both driven through the REAL procedure:
   *  (a) the diff names EXACTLY the columns the write moves — no more (a narrow projection adds
   *      phantom keys) and no fewer (a widened projection would drop `decidedAtHijri` and
   *      `checkerTotpAssertedAt`, which is how the step-up evidence went missing from the diff);
   *  (b) NO ApprovalRequest update event anywhere in this run reports a non-null value becoming
   *      null. Nothing on this table is ever legitimately nulled — the identity columns are
   *      write-once and the status lattice only moves forward — so a single such key is a false
   *      statement, whatever call site produced it.
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('C-08 · the APPROVE diff names exactly the columns the write moved — no phantom nulls', async () => {
    const request = await makePendingRequest({ makerId: SWEEP_MAKER });
    const ctx = await contextFor({ userId: SECOND_NAZIR, requestId: 'c08-diff' });
    await createCaller(ctx).approval.approve({ waqfId: WAQF_A, approvalRequestId: request.id });

    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<
      {
        before: Record<string, unknown> | null;
        after: Record<string, unknown> | null;
        operation: string | null;
      }[]
    >(
      `SELECT "before", "after", "context"->>'operation' AS operation
         FROM "audit_event"
        WHERE "action" = 'APPROVE' AND "entityType" = 'ApprovalRequest' AND "entityId" = $1
          AND "context"->>'operation' = 'update'
        ORDER BY "id" DESC LIMIT 1`,
      request.id,
    );

    const event = rows[0];
    expect(event, 'no APPROVE update event was written for this request').toBeDefined();
    const before = event?.before ?? {};
    const after = event?.after ?? {};

    // (a) EXACTLY the five columns `approval.approve` writes. `updatedAt` is in the extension's
    //     ignore list; everything else here is a column this procedure genuinely moves.
    expect(Object.keys(after).sort()).toEqual([
      'checkerId',
      'checkerTotpAssertedAt',
      'decidedAt',
      'decidedAtHijri',
      'status',
    ]);
    expect(Object.keys(before).sort()).toEqual(Object.keys(after).sort());

    // The facts the false diff used to erase are simply not claimed to have changed, because they
    // did not: maker≠checker and artifact-binding both rest on them.
    for (const key of ['makerId', 'payloadHash', 'subjectId', 'waqfId', 'type', 'payload']) {
      expect(key in after, `the APPROVE diff claims ${key} changed; it did not`).toBe(false);
    }

    // And the step-up evidence IS in the diff — it moved from null to a timestamp, and a projection
    // that omitted it made the change invisible rather than false.
    expect(before['checkerTotpAssertedAt']).toBeNull();
    expect(after['checkerTotpAssertedAt']).not.toBeNull();
    expect(after['status']).toBe('APPROVED');
    expect(after['checkerId']).toBe(SECOND_NAZIR);
  });

  it('C-08 · NO ApprovalRequest update event in this run reports a value becoming null', async () => {
    // The class, not the one call site. `diffChangedKeys` still coerces an absent post-image key to
    // null (that repair lives in `packages/database`), so any future narrow `select` on an audited
    // ApprovalRequest write re-creates the falsehood — and this sweep catches it at whatever call
    // site introduces it, including ones that do not exist yet.
    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<
      {
        id: string;
        entityId: string;
        before: Record<string, unknown> | null;
        after: Record<string, unknown> | null;
      }[]
    >(
      `SELECT "id"::text AS id, "entityId", "before", "after"
         FROM "audit_event"
        WHERE "entityType" = 'ApprovalRequest' AND "context"->>'operation' = 'update'`,
    );
    expect(
      rows.length,
      'no ApprovalRequest update events — the sweep would be vacuous',
    ).toBeGreaterThanOrEqual(1);

    const lies: string[] = [];
    for (const row of rows) {
      const before = row.before ?? {};
      const after = row.after ?? {};
      for (const [key, value] of Object.entries(after)) {
        if (value === null && before[key] !== null && before[key] !== undefined) {
          lies.push(`audit_event ${row.id} (${row.entityId}): ${key} reported as set to null`);
        }
      }
    }
    expect(lies, lies.join('\n')).toEqual([]);
  });

  it('a REFUSED approval is audited too — an attempt on the sole authority is never silent', async () => {
    const request = await makePendingRequest({ makerId: MAKER_AND_NAZIR });
    const before = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      entityId: request.id,
    });

    await expect(
      createCaller(
        await contextFor({ userId: MAKER_AND_NAZIR, requestId: 'refusal-audit' }),
      ).approval.approve({ waqfId: WAQF_A, approvalRequestId: request.id }),
    ).rejects.toThrow();

    const after = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      entityId: request.id,
    });
    expect(after - before).toBe(1);
  });

  /* ───────────────────────────────────────────────────────────────────────────────────────────
   * AC-6 — the eligibility SEAM, and nothing more
   * ─────────────────────────────────────────────────────────────────────────────────────── */

  it('AC-6 · the DEFAULT eligibility hook is NOT a silent pass-through', async () => {
    const ctx = await contextFor({ userId: SECOND_NAZIR, requestId: 'ac6-default' });
    await expect(
      activateGrant(
        ctx,
        { userId: `${API_TEST_PREFIX}candidate`, waqfId: WAQF_A, role: 'AUTHORIZED_REP' },
        {
          permissions: ['endowment:waqf:read'],
          grantedByUserId: SECOND_NAZIR,
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
      ),
    ).rejects.toThrow(/eligibility resolver is E3\/S4/);

    // NOTHING was written. A grant that existed for the duration of a transaction is a grant that
    // existed, so the hook runs before the transaction opens.
    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*)::bigint AS n FROM "waqf_access_grant" WHERE "userId" = $1`,
      `${API_TEST_PREFIX}candidate`,
    );
    expect(Number(rows[0]?.n)).toBe(0);
  });

  it('AC-6 · an INELIGIBLE candidate is blocked, the criterion is NAMED, and the block is audited', async () => {
    const candidate = `${API_TEST_PREFIX}candidate-ineligible`;
    const ctx = await contextFor({ userId: SECOND_NAZIR, requestId: 'ac6-ineligible' });

    const before = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      entityId: `${candidate}@${WAQF_A}`,
    });

    let thrown: unknown;
    try {
      await activateGrant(
        ctx,
        { userId: candidate, waqfId: WAQF_A, role: 'NAZIR' },
        {
          permissions: ['endowment:waqf:read'],
          grantedByUserId: SECOND_NAZIR,
          validFrom: new Date('2026-01-01T00:00:00.000Z'),
        },
        {
          // Stands in for E3's resolver. BR-109: a nazir/authorized_rep candidate must be a KSA
          // resident (and a Saudi national where the endower is foreign and the asset is real property).
          eligibilityCheck: () => ({
            eligible: false,
            failing: [
              { criterion: 'KSA_RESIDENCY', detail: 'candidate is not recorded as a KSA resident' },
            ],
          }),
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(GrantIneligibleError);
    // The failing criterion is NAMED — that is the deliverable, not the refusal itself.
    expect((thrown as GrantIneligibleError).failing.map((f) => f.criterion)).toEqual([
      'KSA_RESIDENCY',
    ]);
    expect(String((thrown as Error).message)).toContain('KSA_RESIDENCY');

    // Eligibility is a data constraint, not UI copy — which cuts both ways: a refusal nobody can
    // review is not an enforcement either.
    const after = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      entityId: `${candidate}@${WAQF_A}`,
    });
    expect(after - before).toBe(1);
  });

  it.todo(
    "AC-5 ATTRIBUTION half: a delegated act must stamp the DELEGATE's actorId with onBehalfOfId " +
      'set. NOT PROVABLE IN E2 — there is no `Delegation` model in schema.prisma (D-7 defers it to ' +
      'E3/E11), so there is no ACTIVE delegation row a stamped onBehalfOfId could be backed by. E2 ' +
      'therefore pins onBehalfOfId to null and proves the WEAKER, safer property instead (MP-36: it ' +
      'confers zero capability and no authority path reads it). The pure algebra half of AC-5 lives ' +
      'in packages/domain assertDelegatableScope. Do not claim AC-5 green.',
  );

  it.todo(
    'MP-23 RESIDUAL GAP, surfaced: the DATABASE cannot distinguish "a Nazir approved this" from "a ' +
      'job wrote a real Nazir\'s userId into checkerId". The trigger only asks whether checkerId ' +
      'resolves to an ACTIVE NAZIR grant. So the procedure-level `actorType !== USER` refusal is the ' +
      'ONLY thing standing between a scheduled job and a forged approval, and it does not survive raw ' +
      'SQL. Closing it needs either a session-bound GUC the trigger can read or an approval-signature ' +
      'column — an E5/E11 decision, not something this layer can paper over.',
  );
});
