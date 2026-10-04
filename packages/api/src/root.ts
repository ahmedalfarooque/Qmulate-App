/**
 * The root tRPC router.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS HERE, AND WHY IT IS THIS SMALL
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * E2 is the CROSS-CUTTING KERNEL, not a feature epic. So this router carries exactly the procedures
 * needed to prove the ladder works, and no domain surface beyond them — the endowment, beneficiary,
 * distribution, compliance and document routers land with their own epics, each built on a rung
 * below rather than on `publicProcedure`.
 *
 * The procedures here are load-bearing all the same: `router-introspection.test.ts` walks this
 * router's REAL composed middleware chains, so every rung is exercised by the shape of the router
 * itself, and a future feature router that forgets a rung fails the build (MP-34).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * DENIAL AUDITING IS INSTALLED HERE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `installApiAuditing()` is called at module scope, because this module is on the import path of
 * every API entry point (`src/index.ts` re-exports `appRouter`). It switches on
 * `installScopeDenialAuditing()` from `@qmulate/database` — a control that was shipped, documented,
 * re-exported, and had ZERO call sites through the whole of Sprint 1.
 */

import { z } from 'zod';

import { visibleSections } from '@qmulate/domain/access';

import { canonicalJson } from '@qmulate/database';

import { approveOnApprovalPlane } from './middleware/approval-plane.js';
import { installApiAuditing } from './middleware/audit.js';
import { adminRouter } from './routers/admin.js';
import { beneficiaryRouter } from './routers/beneficiary.js';
import { classificationRouter } from './routers/classification.js';
import { deedRouter } from './routers/deed.js';
import { distributionRouter } from './routers/distribution.js';
import { endowmentRouter } from './routers/endowment.js';
import { complianceRouter } from './routers/compliance.js';
import { deadlineRouter } from './routers/deadline.js';
import { documentRouter } from './routers/document.js';
import { filingRouter } from './routers/filing.js';
import { financeRouter } from './routers/finance.js';
import { navigationRouter } from './routers/navigation.js';
import { onboardingRouter } from './routers/onboarding.js';
import {
  RESERVED_MATTER_KINDS,
  assetRouter,
  mintApprovalRequest,
  reservedMatterRouter,
} from './routers/reservedMatter.js';
import { settingsRouter } from './routers/settings.js';
import { shartRouter } from './routers/shart.js';
import {
  authedProcedure,
  checkerProcedure,
  endowmentScopedProcedure,
  makerProcedure,
  publicProcedure,
  router,
} from './trpc.js';

// ⚠ AT MODULE SCOPE, ON PURPOSE. See the header. Idempotent.
installApiAuditing();

/** Optional echo, so a caller can prove request/response correlation end to end. */
const healthInput = z
  .object({
    echo: z.string().max(64).optional(),
  })
  .optional();

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * endowment — MOVED TO `src/routers/endowment.ts` IN S4/E3
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * E2 shipped a deliberately thin `endowment.get` here whose job was the BOUNDARY, not the payload:
 * "a scoped procedure denies a caller without a grant" (AC-1 / EXIT-1). E3 widened it to the whole
 * BR-101 record and added `update` + `recordDeedTerms`, so it moved to its own module — and
 * `router-introspection.test.ts` now DERIVES from `src/` that `endowmentRouter` must be mounted WHOLE
 * under `endowment`, which is a stronger guarantee than an inline definition ever had.
 *
 * ⚠ `endowment.get` STILL RETURNS `waqfId` AND `found`, and that is not vestigial:
 * `test/scope-denial.integration.test.ts` asserts both on the POSITIVE half of AC-1 — "the half that
 * stops the suite passing over a ladder that denies everyone".
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * beneficiary — MOVED TO `src/routers/beneficiary.ts` IN S5/E4
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * E3 shipped a deliberately read-only surface here (list/get/lineage/ultimateTakerCandidates) whose
 * header said the write half waited for its own review. E4 is that review: the registry writes
 * (enrol, recordDeath, refreshKyc, captureCategory, recordUbo) landed WITH the reads in their own
 * module, and `router-introspection.test.ts` derives that `beneficiaryRouter` is mounted WHOLE
 * under `beneficiary` — a stronger guarantee than the inline definition ever had.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * approval — the sprint's centrepiece
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const approvalRouter = router({
  /** A maker raises a request. `initiate`, never `approve` — the two are different verbs and different seats. */
  initiate: makerProcedure('approval:request:initiate')
    .input(
      z.object({
        type: z.enum(['BANK_MOVEMENT', 'DISTRIBUTION_RUN', 'GOVT_FILING', 'RESERVED_MATTER']),
        subjectId: z.string().min(1).max(128),
        /**
         * ⚠ S4/E3: WHAT a `RESERVED_MATTER` authorises. Optional here and REQUIRED on the act paths
         * (`reservedMatter.markReserved`, `asset.requestReservedAct`), because `ApprovalType` has no
         * `SETTING_CHANGE` member — so `settings.set`'s minting path legitimately raises a kindless
         * `RESERVED_MATTER` and forcing a WRONG kind onto it would be worse than none
         * (`asset.executeReservedAct` COMPARES the kind). See `routers/reservedMatter.ts`'s header.
         */
        reservedMatterKind: z.enum(RESERVED_MATTER_KINDS).optional(),
        /**
         * The artifact being submitted. Money inside it must ALREADY be a decimal string:
         * `canonicalJson` THROWS on a JS `number`, which is what keeps a float out of the hash the
         * approver will sign.
         */
        payload: z.record(z.unknown()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ⚠ ONE MINTING PATH. `mintApprovalRequest` is the SAME function `reservedMatter.markReserved`
      // and `asset.requestReservedAct` call, so `makerId` (the acting identity, never an input), the
      // `approvalFingerprint` canonicalisation, the one-open-per-subject pre-check and the deliberate
      // `create` projection are written ONCE. A second minting path is the shape of this area's bug:
      // the approver signs one canonical form and the executor verifies another, and the mismatch
      // looks like staleness rather than like a broken comparison.
      const minted = await mintApprovalRequest(ctx, {
        waqfId: ctx.waqfId,
        type: input.type,
        subjectId: input.subjectId,
        payload: input.payload,
        ...(input.reservedMatterKind !== undefined
          ? { reservedMatterKind: input.reservedMatterKind }
          : {}),
        procedure: 'approval.initiate',
      });
      return { approvalRequestId: minted.approvalRequestId, status: minted.status };
    }),

  /**
   * THE APPROVE PROCEDURE. Everything about authority is decided by `checkerProcedure`'s guards
   * before this body runs — see `middleware/segregation.ts`.
   *
   * The body's own job is narrow and entirely about the TRAIL: move the status, record WHO decided
   * and WHICH grant conferred the authority, and stamp the step-up evidence.
   */
  approve: checkerProcedure('approval:request:approve').mutation(async ({ ctx }) => {
    const decidedAt = ctx.now;

    // S12-1 / AV4-02: THE DECISION IS TAKEN ON THE APPROVAL PLANE. Migration 50 refuses
    // `status → APPROVED` and `checkerId` NULL→value from the runtime connection by connection
    // role — the one fact `qmulate_app` cannot rewrite — so this row is decided on the provisioning
    // connection, in ONE audited transaction with the APPROVE event below. Every guard that decides
    // WHETHER (maker≠checker, PENDING, TOTP freshness, artifact hash) is `checkerProcedure`'s and
    // has already run. The event's key set is pinned by `approval-authority.integration.test.ts`.
    const updated = await approveOnApprovalPlane(ctx, 'approval.approve', decidedAt, {
      action: 'APPROVE',
      category: 'APPROVAL',
      classification: 'SENSITIVE',
      entityType: 'ApprovalRequest',
      entityId: ctx.approval.id,
      waqfId: ctx.waqfId,
      extraContext: {
        grantId: ctx.authority.grantId,
        role: ctx.authority.role,
        approvalType: ctx.approval.type,
        subjectId: ctx.approval.subjectId,
        makerId: ctx.approval.makerId,
        payloadHash: ctx.approval.payloadHash,
        totpAssertedAt: ctx.totpAssertedAt.toISOString(),
        canonicalLength: canonicalJson(ctx.approval.payload).length,
      },
    });

    return {
      approvalRequestId: updated.id,
      status: updated.status,
      checkerId: updated.checkerId,
      decidedAt: updated.decidedAt?.toISOString() ?? null,
    };
  }),

  /** A read of the request, for the maker and the checker alike. */
  get: endowmentScopedProcedure('approval:request:read')
    .input(z.object({ approvalRequestId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.approvalRequest.findFirst({
        where: { id: input.approvalRequestId, waqfId: ctx.waqfId },
        select: {
          id: true,
          type: true,
          status: true,
          makerId: true,
          checkerId: true,
          subjectId: true,
          payloadHash: true,
        },
      });
      return row;
    }),
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The root
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export const appRouter = router({
  /**
   * Liveness probe. THE ONLY PUBLIC PROCEDURE, and `router-introspection.test.ts` asserts that in
   * both directions against a written-down allowlist — so a second public procedure fails the build
   * until someone records why it is public.
   *
   * Deliberately says nothing about the database, the queue, or the environment: a public endpoint
   * must not leak deployment topology or configuration state.
   */
  health: publicProcedure.input(healthInput).query(({ ctx, input }) => ({
    status: 'ok' as const,
    requestId: ctx.requestId,
    locale: ctx.locale,
    /** Canonical UTC ISO-8601. Display formatting (dual Hijri/Gregorian) happens client-side. */
    serverTime: ctx.now.toISOString(),
    echo: input?.echo ?? null,
  })),

  /**
   * Who am I, and what may I reach? Authenticated but NOT endowment-scoped, because the answer is
   * "which endowments" and cannot itself require one.
   *
   * Returns endowment ids and effective permissions — the caller's own facts, nothing about anyone
   * else's. NOTE what is absent: a role list. `getUserRoleKeys()` unions roles across every grant
   * and membership with no `waqfId` at all, and a client rendering "you are a nazir" from it would
   * be one refactor away from a permission check doing the same (MP-12).
   */
  whoami: authedProcedure.query(({ ctx }) => ({
    userId: ctx.session.userId,
    email: ctx.session.email,
    locale: ctx.locale,
    grants: ctx.grants.map((grant) => ({
      waqfId: grant.waqfId,
      role: grant.role,
      permissions: [...grant.permissions],
      amlCompartment: grant.amlCompartment,
      isBeneficiarySelf: grant.beneficiarySelfId !== null,
    })),
    /** The organisation layer (migration 55): registration state, level, org-scope permissions. */
    org: {
      status: ctx.org.status,
      isPrimaryAdmin: ctx.org.isPrimaryAdmin,
      accessLevel: ctx.org.accessLevel,
      permissions: [...ctx.org.permissions],
    },
    /** Which navigation sections this caller may see; visibility, not authority. */
    // Migration 57: a level that seats its holders on every endowment opens the seat-scoped
    // sections BEFORE the first endowment exists — the pages then show their empty states and the
    // "Register an endowment" entry is reachable. Otherwise a fresh cloud database would show a
    // default FULL user four sections and a 13-section application only after a registration.
    sections: visibleSections({
      seatPermissions: [
        ...ctx.grants.flatMap((grant) => [...grant.permissions]),
        ...(ctx.org.status === 'ACTIVE' && ctx.org.accessLevel?.seatsAllEndowments
          ? ctx.org.accessLevel.seatPermissions
          : []),
      ],
      orgPermissions: ctx.org.permissions,
      isPrimaryAdmin: ctx.org.status === 'ACTIVE' && ctx.org.isPrimaryAdmin,
    }),
    /** Live endowments in the whole organisation — lets the dashboard tell "none registered yet" from "none in your scope". */
    endowmentCount: ctx.liveEndowmentCount,
  })),

  admin: adminRouter,

  endowment: endowmentRouter,
  beneficiary: beneficiaryRouter,
  approval: approvalRouter,

  /* ═══════════════════════════════════════════════════════════════════════════════════════════
   * S4/E3 · the endowment-record surface
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * ⚠ EVERY MOUNT HERE IS DERIVED-AND-ASSERTED, NOT TRUSTED. `router-introspection.test.ts` imports
   * every module under `src/`, finds every exported tRPC router, and asserts that `appRouter` exposes
   * each one WHOLE under `exportName minus "Router"`. A router that exists, typechecks and passes its
   * own suite but is absent from here is a feature the product does not have — `apps/web` serves
   * `appRouter`, and so does `createCallerFactory(appRouter)`. That is exactly how E2's `settings.set`
   * shipped unreachable with 38 green assertions.
   * ═══════════════════════════════════════════════════════════════════════════════════════════ */

  /** BR-102 · Client → Waqif → Waqf. Authed but NOT endowment-scoped — see the router's header. */
  navigation: navigationRouter,
  /** BR-105 / BR-109 · the TrusteeshipDeed and the eligibility gate. */
  deed: deedRouter,
  /** BR-104 · classification, its history, and the obligations that follow from it. */
  classification: classificationRouter,
  /** BR-103 · the founder's conditions, READ ONLY. There is no `shart.update` and never will be. */
  shart: shartRouter,
  /** BR-1102 · mark reserved → block until approved. The full chain is E11's. */
  reservedMatter: reservedMatterRouter,
  /** BR-306 · disposal / istibdal / pledge / long lease. ⚠ Proceeds are CORPUS; no receipt is written. */
  asset: assetRouter,

  /**
   * `finance` — E5's capture surface, and the MONEY-MOVEMENT half of segregation of duties.
   *
   * ⚠ THE THREE-STEP SHAPE IS DELIBERATE AND IS SPLIT ACROSS TWO MOUNTS. A bank movement is
   * `finance.bankMovement.request` (maker) → **`approval.approve` above** (checker) →
   * `finance.bankMovement.execute` (posts the ledger row from the APPROVED artifact). The middle
   * step is deliberately NOT re-implemented here: `approval.approve` is this package's ONE approving
   * path exactly as `mintApprovalRequest` is its one minting path, and a second one would restate
   * the guard chain, the MP-32 authority context and the no-`select` rule C-08 exists because of.
   *
   * ⚠ `request` writes NO `Transaction`. The approval request IS the pending state — `Transaction`
   * has no draft status column, and an unapproved movement sitting in the ledger would be
   * indistinguishable from a posted one to the reconciliation, the waterfall and every statement.
   */
  finance: financeRouter,

  /**
   * `filing` — BR-603's manual government-filing board, and S8-Q6's gate on `SUBMITTED`.
   *
   * ⚠ THE MIDDLE STEP IS `approval.approve` ABOVE, AND THE APPROVAL TYPE IS `GOVT_FILING` — its
   * FIRST minter and first consumer. `filing.requestSubmission` (maker, mints via the one minting
   * path) → **`approval.approve`** (the nazir's seat — G-3's A* on the filing) →
   * `filing.markSubmitted` (moves the row, spends the approval). The deciding side is migration
   * 35's `government_filing_submission_authority`, which re-verifies the eight approval conditions
   * at the row change itself. Every OTHER status is `filing.setStatus`, manual and ungated —
   * ACCEPTED/REJECTED record the Authority's own decision.
   */
  filing: filingRouter,

  /** ⊕ S12-3 · the three sequenced handover gates (BR-1101, V-11). */
  onboarding: onboardingRouter,

  /**
   * `deadline` — §09 Engine B's compute/persist path (S9-3a). `deadline.compute` is the maker
   * act that turns a stated anchor fact into the FROZEN date on file (migration 38's contract);
   * the reminders/escalation evaluator and the auto-raise triggers land in the worker (S9-3c/d).
   * Non-clocks refuse BY NAME (`DEADLINE_RULE_NOT_A_CLOCK`); absent figures refuse
   * (`SETTING_MISSING`); an empty holiday calendar refuses (`CALENDAR_UNAVAILABLE`).
   */
  deadline: deadlineRouter,
  document: documentRouter,

  /**
   * `compliance` — §09 Engine A's SECOND HALF (E7-completion): the per-endowment task register.
   *
   * `instantiateRegister` (maker, one-time — A1's act) materialises one `ComplianceTask` per
   * applicable non-EVENT template at the canonical library version; after that the register
   * changes ONLY through `classification.reclassify`'s add/retire diff (A3/A4), which shares the
   * planner. `tasks` is the board read; the AML compartment applies on the task plane exactly as
   * on the obligation plane (S8-Q1).
   */
  compliance: complianceRouter,

  /**
   * `distribution` — E6/S7's RUN LIFECYCLE, and the second act §10 §4.2 puts behind segregation of
   * duties.
   *
   * ⚠ THE MIDDLE STEP IS `approval.approve` ABOVE, AND THE APPROVAL TYPE IS `DISTRIBUTION_RUN`.
   * `distribution.preview` (a non-throwing query) → `create` → `submit` (mints the approval) →
   * **`approval.approve`** → `distribution.execute` (writes the line items and posts the run). The
   * middle step is deliberately NOT re-implemented there, for the same reason `finance.bankMovement`
   * does not re-implement it: this package has ONE approving path, exactly as it has one minting
   * path, and a second would restate the guard chain, the MP-32 authority context and the
   * no-`select` rule C-08 exists because of.
   *
   * ⚠ `DISTRIBUTION_RUN`, not `BANK_MOVEMENT` — and Postgres is what decides that. The deferred
   * trigger `qmulate_distribution_authority` calls
   * `qmulate_approval_defect(…, 'DISTRIBUTION_RUN', NEW."id", true)` and raises SQLSTATE 42501 **at
   * COMMIT** on any other type, with `subjectId` compared to the run row's own `id`. So a
   * bank-movement approval on that path aborts the transaction after every application check has
   * passed. The router's header records the whole ladder.
   *
   * ⚠ `preview` RETURNS A REFUSAL AS DATA rather than throwing (`{computed} | {refused}`), because
   * `src/trpc.ts`'s `errorFormatter` threads only `code` and `messageKey` and 26 of the engine's
   * refusals share the code `SHART_INCOMPLETE`. The discriminator is the only thing that tells them
   * apart, and it does not cross the wire as an error. The MUTATIONS still throw.
   */
  distribution: distributionRouter,

  /**
   * `settings.get` / `settings.set` — EXIT-3's REQUEST PATH.
   *
   * ⚠ THIS MOUNT IS THE EXIT CRITERION. §17's E2 exit clause 3 is "a fee-basis change via `Setting`
   * flows through with no redeploy", and for a whole sprint this line was a commented-out TODO: the
   * router existed, its 38 assertions passed against a router constructed inside the test file, and
   * the SHIPPED surface (`apps/web`'s `/api/trpc` route and `createCallerFactory(appRouter)`) had no
   * `settings.set` at all. So the only way to change a fee basis was a code edit and a redeploy —
   * exactly what the clause forbids — and every suite was green.
   *
   * `router-introspection.test.ts` now DERIVES the set of routers that must be reachable from the
   * contents of `src/routers/`, so an unmounted router fails the build instead of passing a suite.
   * That assertion, not this comment, is what keeps the mount honest.
   */
  settings: settingsRouter,
});

/** The router type consumed by clients (`apps/web`, `apps/mobile`) for end-to-end inference. */
export type AppRouter = typeof appRouter;
