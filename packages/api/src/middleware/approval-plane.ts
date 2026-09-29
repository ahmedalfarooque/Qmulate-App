/**
 * The approve procedures' ONE way onto the approval plane. (S12-1 / AV4-02, migration 50)
 *
 * Since migration 50 the DECISION on an `ApprovalRequest` — `status → APPROVED | REJECTED`,
 * `checkerId` NULL→value, the decision instants — is refused from the runtime connection by
 * connection role. `@qmulate/database`'s `decideApproval()` takes it on the provisioning connection
 * in one audited transaction. This module adapts an `ApproverContext` to it, so every approve
 * procedure spells the decision the same way and none re-implements it.
 *
 * ── decide FIRST, execute SECOND, and VOID if the execution fails ─────────────────────────────
 * `settings.set` and `endowment.recordDeedTerms` used to approve AND execute in one runtime
 * transaction. They cannot any more: the decision lives on another connection and cannot join the
 * runtime transaction (a decision that committed independently would survive the block's rollback).
 * `decideThenExecute()` therefore takes the decision, runs the execution on the runtime, and on
 * failure retires the fresh APPROVED row with `VOID` (§10 §4.3's representable state — a
 * non-decision the lattice permits from the runtime) before rethrowing the execution's own error.
 * The window between the two commits is REAL and is stated here rather than hidden: for its
 * duration an APPROVED, unexecuted approval exists, exactly as it does between `approval.approve`
 * and `distribution.execute` on every other flow in this package.
 */

import { ReservedMatterChainIncompleteError, decideApproval, recordEvent } from '@qmulate/database';
import { toHijriSnapshot } from '@qmulate/domain/dates';

import type { AuditEventInput, DecidedApprovalRow } from '@qmulate/database';

import { toActorContext } from '../context.js';
import { ApiError } from '../errors.js';
import { auditedWrite } from './audit-projection.js';
import type { ApproverContext } from './segregation.js';

/** Take the APPROVED decision for the request `checkerProcedure` resolved onto `ctx`. */
export async function approveOnApprovalPlane(
  ctx: ApproverContext,
  procedure: string,
  decidedAt: Date,
  event?: AuditEventInput,
): Promise<DecidedApprovalRow> {
  // An approve rung with no actor is a build error, not a decision: the trail must name a person.
  if (ctx.actor.actorId === null || ctx.actor.actorId === '') {
    throw new Error(
      `${procedure}: the approval rung produced no actorId; an approval with no approver is not an ` +
        `approval (BR-105). Refused before anything was written.`,
    );
  }
  try {
    return await decideApproval(toActorContext(ctx, { procedure }), {
      approvalRequestId: ctx.approval.id,
      decision: 'APPROVED',
      // The ACTING identity from the session — never an input. The DB CHECK
      // `approval_request_checker_ne_maker` and the `approval_request_authority` trigger re-prove
      // maker≠checker and "an ACTIVE NAZIR on THIS endowment" independently, in SQL.
      checkerId: ctx.actor.actorId,
      decidedAt,
      decidedAtHijri: String(toHijriSnapshot(decidedAt)),
      checkerTotpAssertedAt: ctx.totpAssertedAt,
      ...(event !== undefined ? { event } : {}),
    });
  } catch (error) {
    // ⊕ S12-2 · the plane refused a kinded reserved matter whose BR-1102 chain is incomplete —
    // BEFORE opening its transaction. Every approve procedure (generic `approval.approve` included)
    // therefore says the same sentence, naming the missing steps.
    if (error instanceof ReservedMatterChainIncompleteError) {
      throw new ApiError('RESERVED_MATTER_CHAIN_INCOMPLETE', error.message, {
        approvalRequestId: ctx.approval.id,
        missing: [...error.missing],
      });
    }
    throw error;
  }
}

/**
 * Decide on the approval plane, then run `execute` on the runtime connection. If `execute`
 * throws, the APPROVED row is VOIDED (audited, on the runtime) and the original error propagates.
 * A failure to void is reported in the rethrown error's `cause` chain rather than swallowed.
 */
export async function decideThenExecute<T>(
  ctx: ApproverContext,
  procedure: string,
  decidedAt: Date,
  execute: () => Promise<T>,
): Promise<T> {
  await approveOnApprovalPlane(ctx, procedure, decidedAt);
  try {
    return await execute();
  } catch (error) {
    try {
      await voidAfterFailedExecution(ctx, procedure, error);
    } catch (voidError) {
      throw new Error(
        `${procedure}: the execution failed AND the fresh approval ${ctx.approval.id} could not be ` +
          `voided — it stands APPROVED and unexecuted. Original error: ` +
          `${error instanceof Error ? error.message : String(error)}`,
        { cause: voidError },
      );
    }
    throw error;
  }
}

async function voidAfterFailedExecution(
  ctx: ApproverContext,
  procedure: string,
  error: unknown,
): Promise<void> {
  await auditedWrite(ctx.db, async (tx) => {
    await tx.approvalRequest.update({
      where: { id: ctx.approval.id },
      data: { status: 'VOID' },
    });
    await recordEvent(toActorContext(ctx, { procedure }), {
      action: 'UPDATE',
      category: 'APPROVAL',
      classification: 'SENSITIVE',
      entityType: 'ApprovalRequest',
      entityId: ctx.approval.id,
      waqfId: ctx.waqfId,
      extraContext: {
        code: 'APPROVAL_VOIDED_EXECUTION_FAILED',
        procedure,
        reason: error instanceof Error ? error.message : String(error),
      },
    });
  });
}
