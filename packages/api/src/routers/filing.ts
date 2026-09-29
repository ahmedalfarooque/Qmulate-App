/**
 * `filing` — BR-603: the six government platforms as MANUAL status fields, and S8-Q6's gate on the
 * one status that asserts something to a regulator.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SURFACE IS, AND WHAT IT REFUSES TO PRETEND
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * No public API is evidenced for Awqaf Digital, Baladi, Istihkam, Muqeem, Qiwa or Ejar, so these
 * rows are a Nazir's OWN record of where each filing stands — never a live integration, and the
 * copy must never imply one. One row per (endowment, platform), `@@unique([waqfId, platform])`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S8-Q6 (product owner, 2026-08-23, verbatim selection: "Require approval (Recommended)")
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * "A filing status change to `submitted` needs an approved request — the same maker≠checker shape
 * as money movement; G-3's 'filings cannot be self-approved' becomes enforced rather than
 * aspirational." So this file splits the write surface in two:
 *
 *  · `setStatus` — the MANUAL statuses (`NOT_STARTED | IN_PROGRESS | ACCEPTED | REJECTED | N_A`).
 *    Audited, ungated: `ACCEPTED`/`REJECTED` record the AUTHORITY'S OWN decision, which no internal
 *    approval can make more or less true, and the rest record intent. `SUBMITTED` is refused here
 *    BY THE INPUT TYPE — it is not a member of the enum — so the gate cannot be side-stepped by a
 *    permitted verb.
 *  · `requestSubmission` → (the nazir approves via `approval.approve`) → `markSubmitted` — the
 *    distribution-commit shape: ONE minting path (`mintApprovalRequest`, type `GOVT_FILING`, the
 *    type's FIRST minter), subject = the filing row's own id, and the approval is spent
 *    (`EXECUTED`) by the same transaction that submits, so one approval authorises exactly one
 *    submission and a re-submission needs a fresh one.
 *
 * The DECIDING side is the database: `government_filing_submission_authority` (migration 35) runs
 * `qmulate_approval_defect(...)` on every transition into `SUBMITTED`, INSERT and UPDATE alike,
 * `ENABLE ALWAYS`. Everything this file checks first is for the caller's error message, not for
 * safety — raw SQL meets the same wall.
 *
 * The approver seat: `approval.approve` is `checkerProcedure('approval:request:approve')`, held by
 * the nazir preset (with `compliance:filing:approve` beside it — §10's A* on the filing row). Q6
 * confirms the seat stays `nazir`; nothing here re-decides it.
 */

import { z } from 'zod';

import { recordEvent } from '@qmulate/database';

import { ApiError } from '../errors.js';
import { toActorContext } from '../context.js';
import { HIJRI_SNAPSHOT_PATTERN, assertHijriPairAgrees } from '../dual-date.js';
import { auditedWrite } from '../middleware/audit-projection.js';
import { assertOnboardingGateAllows } from '../middleware/onboarding-gate.js';
import { endowmentScopedProcedure, makerProcedure, router } from '../trpc.js';
import { mintApprovalRequest } from './reservedMatter.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Vocabulary — spelled here, parity-pinned against schema.prisma as text
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `GovernmentPlatform`, as a zod enum. Spelled rather than imported from the generated client for
 * the same reason `classification.ts` spells its enum: the unit suite runs with no generated
 * client. `test/reserved-matter-surface.test.ts` compares this literal list against the schema.
 */
const governmentPlatformInput = z.enum([
  'AWQAF_DIGITAL',
  'BALADI',
  'EJAR',
  'ISTIHKAM',
  'MUQEEM',
  'QIWA',
]);

/**
 * ⚠ ⊕ S8-Q6: `SUBMITTED` is DELIBERATELY ABSENT, and the omission is the transport-layer half of
 * the gate — the same shape as `classification.ts` omitting `NOT_CLASSIFIED` from `reclassify.to`.
 * A submission travels only through `markSubmitted`, which demands the approval. The full
 * six-member vocabulary is `FilingStatus` in the schema; this narrower list is the set of statuses
 * a MANUAL edit may record.
 */
const manualFilingStatusInput = z.enum([
  'NOT_STARTED',
  'IN_PROGRESS',
  'ACCEPTED',
  'REJECTED',
  'N_A',
]);

const FILING_SELECT = {
  id: true,
  platform: true,
  status: true,
  approvalRequestId: true,
  lastUpdated: true,
  lastUpdatedHijri: true,
} as const;

/** One filing row, wire shape. Enums cross as strings — the transport never narrows them. */
function toWire(row: {
  id: string;
  platform: unknown;
  status: unknown;
  approvalRequestId: string | null;
  lastUpdated: Date | null;
  lastUpdatedHijri: string | null;
}): {
  id: string;
  platform: string;
  status: string;
  approvalRequestId: string | null;
  lastUpdated: string | null;
  lastUpdatedHijri: string | null;
} {
  return {
    id: row.id,
    platform: String(row.platform),
    status: String(row.status),
    approvalRequestId: row.approvalRequestId,
    lastUpdated: row.lastUpdated?.toISOString() ?? null,
    lastUpdatedHijri: row.lastUpdatedHijri,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The router
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export const filingRouter = router({
  /** The endowment's filing board — one row per platform, rows exist only once recorded. */
  list: endowmentScopedProcedure('compliance:filing:read').query(async ({ ctx }) => {
    const rows = await ctx.db.governmentFiling.findMany({
      where: { waqfId: ctx.waqfId },
      select: FILING_SELECT,
      orderBy: { platform: 'asc' },
    });
    return {
      filings: rows.map(toWire),
      /** BR-603 stated on the wire, so no screen can imply a live integration. */
      manualStatusNote:
        'Manual status fields recorded by the Nazir — not a live integration with any government platform.',
    };
  }),

  /**
   * Record a MANUAL status — everything except `SUBMITTED`, which the input type cannot express.
   *
   * Upsert by (waqfId, platform): the seed creates rows only for platforms the fixture engagement
   * has touched, and the first manual recording of a new platform IS the row's creation.
   */
  setStatus: makerProcedure('compliance:filing:write')
    .input(
      z.object({
        platform: governmentPlatformInput,
        status: manualFilingStatusInput,
        at: z.string().datetime(),
        atHijri: z
          .string()
          .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const at = new Date(input.at);
      const atHijri = assertHijriPairAgrees(at, input.atHijri, 'at', 'atHijri');

      return auditedWrite(ctx.db, async (tx) => {
        const existing = await tx.governmentFiling.findFirst({
          where: { waqfId: ctx.waqfId, platform: input.platform as never },
          select: { id: true, status: true },
        });

        const row =
          existing === null
            ? await tx.governmentFiling.create({
                data: {
                  waqfId: ctx.waqfId,
                  platform: input.platform as never,
                  status: input.status as never,
                  lastUpdated: at,
                  lastUpdatedHijri: atHijri,
                  createdBy: ctx.actor.actorId,
                },
                select: FILING_SELECT,
              })
            : await tx.governmentFiling.update({
                where: { id: existing.id },
                data: {
                  status: input.status as never,
                  lastUpdated: at,
                  lastUpdatedHijri: atHijri,
                },
                // ⚠ NO `select` on the update — the audit extension diffs against a full-row
                // pre-image and reads an absent key as null (C-08). The `create` above MAY project.
              });

        await recordEvent(toActorContext(ctx, { procedure: 'filing.setStatus' }), {
          action: existing === null ? 'CREATE' : 'UPDATE',
          category: 'MUTATION',
          classification: 'ROUTINE',
          entityType: 'GovernmentFiling',
          entityId: row.id,
          waqfId: ctx.waqfId,
          extraContext: {
            platform: input.platform,
            from: existing?.status !== undefined ? String(existing.status) : null,
            to: input.status,
            atHijri,
          },
        });

        const after = await tx.governmentFiling.findFirstOrThrow({
          where: { id: row.id },
          select: FILING_SELECT,
        });
        return toWire(after);
      });
    }),

  /**
   * Step 1 of a submission: mint the `GOVT_FILING` approval a checker must approve.
   *
   * Creates the filing row (`NOT_STARTED`) if the platform has none yet — the approval's SUBJECT
   * is the row's id, so the row must exist before the request can name it.
   */
  requestSubmission: makerProcedure('compliance:filing:write')
    .input(z.object({ platform: governmentPlatformInput }))
    .mutation(async ({ ctx, input }) => {
      // ⊕ S12-3 · BR-1101 / V-11: an Authority filing is not ATTEMPTED while Gate 02 is not CLEARED.
      await assertOnboardingGateAllows(
        ctx,
        'AUTHORITY_FILING_SUBMISSION',
        'filing.requestSubmission',
      );
      const filing = await auditedWrite(ctx.db, async (tx) => {
        const existing = await tx.governmentFiling.findFirst({
          where: { waqfId: ctx.waqfId, platform: input.platform as never },
          select: { id: true, status: true },
        });
        if (existing !== null) return existing;
        const created = await tx.governmentFiling.create({
          data: {
            waqfId: ctx.waqfId,
            platform: input.platform as never,
            status: 'NOT_STARTED',
            createdBy: ctx.actor.actorId,
          },
          select: { id: true, status: true },
        });
        await recordEvent(toActorContext(ctx, { procedure: 'filing.requestSubmission' }), {
          action: 'CREATE',
          category: 'MUTATION',
          classification: 'ROUTINE',
          entityType: 'GovernmentFiling',
          entityId: created.id,
          waqfId: ctx.waqfId,
          extraContext: { platform: input.platform, to: 'NOT_STARTED' },
        });
        return created;
      });

      // ONE minting path — the same function `approval.initiate`, `reservedMatter.markReserved`
      // and `distribution.create` use, so maker identity, fingerprinting and the
      // one-open-per-subject pre-check are written once (its header's rule).
      const minted = await mintApprovalRequest(ctx as never, {
        waqfId: ctx.waqfId,
        type: 'GOVT_FILING',
        subjectId: filing.id,
        payload: {
          platform: input.platform,
          filingId: filing.id,
          waqfId: ctx.waqfId,
          act: 'GOVT_FILING_SUBMISSION',
        },
        procedure: 'filing.requestSubmission',
      });

      return {
        filingId: filing.id,
        approvalRequestId: minted.approvalRequestId,
        status: minted.status,
      };
    }),

  /**
   * Step 2: record the submission, consuming the approval.
   *
   * Order inside the transaction is load-bearing: the FILING moves first, while the approval is
   * still `APPROVED` — migration 35's BEFORE trigger verifies it at that instant — and the
   * approval is marked `EXECUTED` after, so the two reach their recorded states together and the
   * approval can never authorise a second submission.
   */
  markSubmitted: makerProcedure('compliance:filing:write')
    .input(
      z.object({
        platform: governmentPlatformInput,
        approvalRequestId: z.string().min(1).max(128),
        at: z.string().datetime(),
        atHijri: z
          .string()
          .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ⊕ S12-3 · the move to SUBMITTED is what migration 52's twin refuses; the sentence is here.
      await assertOnboardingGateAllows(ctx, 'AUTHORITY_FILING_SUBMISSION', 'filing.markSubmitted');
      const at = new Date(input.at);
      const atHijri = assertHijriPairAgrees(at, input.atHijri, 'at', 'atHijri');

      const filing = await ctx.db.governmentFiling.findFirst({
        where: { waqfId: ctx.waqfId, platform: input.platform as never },
        select: { id: true, status: true },
      });
      if (filing === null) {
        throw new ApiError(
          'GATE_NOT_CLEARED',
          `waqf ${ctx.waqfId} has no ${input.platform} filing row to submit. requestSubmission ` +
            `creates the row and mints the approval; nothing can be marked submitted before it exists.`,
          { waqfId: ctx.waqfId, platform: input.platform },
        );
      }

      // Pre-checks for the caller's ERROR MESSAGE only — migration 35's trigger re-verifies all
      // eight approval conditions at the row change, and would refuse without any of this.
      const approval = await ctx.db.approvalRequest.findFirst({
        where: { id: input.approvalRequestId, waqfId: ctx.waqfId },
        select: { id: true, type: true, status: true, subjectId: true, makerId: true },
      });
      if (approval === null) {
        throw new ApiError(
          'GATE_NOT_CLEARED',
          `approval_request ${input.approvalRequestId} is not visible on waqf ${ctx.waqfId} — a ` +
            `submission needs an APPROVED maker≠checker GOVT_FILING approval (G-3, S8-Q6).`,
          { waqfId: ctx.waqfId, approvalRequestId: input.approvalRequestId },
        );
      }
      if (
        String(approval.type) !== 'GOVT_FILING' ||
        String(approval.status) !== 'APPROVED' ||
        approval.subjectId !== filing.id
      ) {
        throw new ApiError(
          'GATE_NOT_CLEARED',
          `approval_request ${input.approvalRequestId} does not authorise submitting filing ` +
            `${filing.id}: it is type ${String(approval.type)}, status ${String(approval.status)}, ` +
            `subject ${approval.subjectId ?? '<null>'}. A filing submission needs an APPROVED ` +
            `GOVT_FILING approval naming THIS filing row (G-3, S8-Q6) — one approved act is not a ` +
            `licence for another.`,
          {
            waqfId: ctx.waqfId,
            approvalRequestId: input.approvalRequestId,
            filingId: filing.id,
          },
        );
      }

      return auditedWrite(ctx.db, async (tx) => {
        // (a) THE FILING FIRST — the trigger checks the approval while it is still APPROVED.
        await tx.governmentFiling.update({
          where: { id: filing.id },
          data: {
            status: 'SUBMITTED',
            approvalRequestId: input.approvalRequestId,
            lastUpdated: at,
            lastUpdatedHijri: atHijri,
          },
          // No `select`: full-row post-image for an honest audit diff (C-08).
        });

        // (b) THEN the approval is SPENT. EXECUTED, not left APPROVED: a non-terminal approval
        //     keeps the one-open-per-subject slot and would read as a standing licence to submit
        //     again — the distribution commit's reasoning, verbatim.
        await tx.approvalRequest.update({
          where: { id: input.approvalRequestId },
          data: { status: 'EXECUTED' },
        });

        await recordEvent(toActorContext(ctx, { procedure: 'filing.markSubmitted' }), {
          action: 'UPDATE',
          category: 'MUTATION',
          // SENSITIVE, unlike the manual-board events: this one records the CONSUMPTION of an
          // approval — the same class the approve event itself carries.
          classification: 'SENSITIVE',
          entityType: 'GovernmentFiling',
          entityId: filing.id,
          waqfId: ctx.waqfId,
          extraContext: {
            platform: input.platform,
            from: String(filing.status),
            to: 'SUBMITTED',
            approvalRequestId: input.approvalRequestId,
            atHijri,
          },
        });

        const after = await tx.governmentFiling.findFirstOrThrow({
          where: { id: filing.id },
          select: FILING_SELECT,
        });
        return toWire(after);
      });
    }),
});
