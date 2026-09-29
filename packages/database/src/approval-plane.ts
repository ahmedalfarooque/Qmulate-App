// QMULATE — the approval DECISION door. (S12-1 / AV4-02 — ADR-0008 round 7, migration 50)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE IS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Until migration 50 every approve procedure decided an `ApprovalRequest` on the RUNTIME connection:
// `tx.approvalRequest.update({ data: { status: 'APPROVED', checkerId, … } })` as `qmulate_app`. So
// did an attacker holding only that credential — MEASURED (AV4-02, S4 round 4): the runtime role
// minted its own APPROVED `RESERVED_MATTER` row and spent it in the same transaction, and every
// "refused 42501 as `qmulate_app`" measurement in the register was qualified by exactly that.
//
// Migration 50 makes the decision columns writable ONLY when `current_user` is the provisioner, the
// owner or a superuser — the one fact about a connection the runtime credential cannot rewrite. This
// module is the application's ONE way through that rule: `decideApproval()` opens a single audited
// transaction on the provisioning connection (`ACCESS_MATRIX_DATABASE_URL`, the same credential and
// the same shape as `access-matrix.ts`), records the decision and its APPROVE/REJECT event together,
// and never returns the client.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT IT DOES NOT DO — the guards stay IN FRONT of it, in `packages/api`
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Maker ≠ checker, "PENDING and open for decision", TOTP step-up freshness, the artifact hash and
// the approval's type/subject/kind are all resolved by `checkerProcedure` / `resolveApprover` BEFORE
// this is called. This function trusts its caller's context exactly as much as `provisionAccessGrant`
// does — which is to say it re-proves nothing the database re-proves, and the database re-proves
// `checkerId <> makerId` (CHECK) and "ACTIVE NAZIR on this endowment" (trigger). What it adds is the
// CONNECTION ROLE, and that is the whole point.
//
// ⚠ THE HONEST RESIDUAL, stated here as it is in migration 50's header: code inside the web process
// can call this function, because the process holds the provisioner credential. This is ADR-0008
// round 6's residual (1)/(2) for grants, now for approvals. It is bounded by who can reach the
// credential, not by anything in this file.
//
// ⚠ NOT INSIDE AN AUDITED TRANSACTION. It runs on a different connection, so it cannot join one; a
// decision committed independently of an enclosing block would SURVIVE that block's rollback. The
// procedures that used to approve-then-execute atomically (`settings.set`,
// `endowment.recordDeedTerms`) now decide FIRST, here, and execute SECOND on the runtime — and if
// the execution fails they VOID the decision on the runtime, which the lattice permits.

import {
  createAccessMatrixPrismaClientInternal,
  hasConnectionCredential,
  MissingConnectionCredentialError,
  recordEvent,
  withAudit,
} from './client.js';
import { currentAuditTransaction, type AuditEventInput } from './extensions/audit.js';
import {
  missingReservedMatterChainSteps,
  reservedMatterChainState,
  type ReservedMatterChainStep,
} from '@qmulate/domain';

import type { RequestContext } from './context.js';

/**
 * Thrown BEFORE the transaction opens when a kinded RESERVED_MATTER is decided in favour with a
 * BR-1102 step unrecorded (S12-2, migration 51). Names the steps so the caller can say which
 * letter is missing. `code` is the api's machine code; the Arabic/English sentence lives in
 * `@qmulate/i18n` under `errors.access.RESERVED_MATTER_CHAIN_INCOMPLETE`.
 */
export class ReservedMatterChainIncompleteError extends Error {
  readonly code = 'RESERVED_MATTER_CHAIN_INCOMPLETE';
  readonly missing: readonly ReservedMatterChainStep[];

  constructor(approvalRequestId: string, missing: readonly ReservedMatterChainStep[]) {
    super(
      `approval_request ${approvalRequestId}: the Nazir's sign is disabled — the BR-1102 approval ` +
        `chain is incomplete (${missing.join(', ')} not recorded). Written principal approval, ` +
        `counsel review and the Authority notice where required precede the signature (§10 §9; ` +
        `owner ruling 2026-09-08 "every matter"). Nothing was written.`,
    );
    this.name = 'ReservedMatterChainIncompleteError';
    this.missing = missing;
  }
}

/** Thrown when `decideApproval()` is called inside an open audited transaction. */
export class ApprovalPlaneNestedTransactionError extends Error {
  readonly code = 'APPROVAL_PLANE_NESTED_TRANSACTION';

  constructor() {
    super(
      'decideApproval() was called INSIDE an open audited transaction. It runs on the provisioning ' +
        'connection (ACCESS_MATRIX_DATABASE_URL), so it cannot join that transaction: the decision ' +
        'would commit independently and SURVIVE a rollback of the enclosing block. Decide first, ' +
        'then execute on the runtime connection; VOID the decision if the execution fails.',
    );
    this.name = 'ApprovalPlaneNestedTransactionError';
  }
}

/** The two decisions a checker can take. `EXECUTED` and `VOID` are not decisions and stay on the runtime. */
export type ApprovalDecision = 'APPROVED' | 'REJECTED';

export interface ApprovalDecisionInput {
  readonly approvalRequestId: string;
  readonly decision: ApprovalDecision;
  /** The acting Nazir. Bound by the caller to the SESSION identity, never to a payload. */
  readonly checkerId: string;
  readonly decidedAt: Date;
  readonly decidedAtHijri: string;
  /** The step-up assertion instant (NFR-06). Evidence, recorded write-once. */
  readonly checkerTotpAssertedAt: Date;
  /**
   * The explicit APPROVE / REJECT event the procedure records, committed in the SAME transaction as
   * the decision. Its `extraContext` is the caller's — `approval-authority.integration.test.ts`
   * pins the exact key set for `approval.approve`, so nothing is added or removed here.
   */
  readonly event?: AuditEventInput;
}

/** The decided row, unprojected — see root.ts's C-08 note on why `select` is absent. */
export interface DecidedApprovalRow {
  readonly id: string;
  readonly status: string;
  readonly checkerId: string | null;
  readonly decidedAt: Date | null;
  readonly decidedAtHijri: string | null;
  readonly reservedMatterKind: string | null;
  readonly counselReviewRequired: boolean;
  readonly authorityNoticeRequired: boolean;
  readonly authorityReference: string | null;
}

function assertCredentialPresent(): void {
  if (!hasConnectionCredential('provisioner')) {
    const cause = new MissingConnectionCredentialError('provisioner');
    throw new Error(`decideApproval() cannot run. ${cause.message}`, { cause });
  }
}

/**
 * Take the decision on an `ApprovalRequest`, on the approval plane.
 *
 * ONE audited transaction on the provisioning connection: the UPDATE (which the audit extension
 * projects as an `APPROVE` / `REJECT` event of its own) and the caller's explicit event commit
 * together or not at all. The row is read and written through the caller's OWN context, so the
 * scoping force-filter applies: a checker with no grant on the endowment cannot even see the row.
 */
export async function decideApproval(
  ctx: RequestContext,
  input: ApprovalDecisionInput,
): Promise<DecidedApprovalRow> {
  assertCredentialPresent();
  if (currentAuditTransaction() !== null) throw new ApprovalPlaneNestedTransactionError();

  const db = createAccessMatrixPrismaClientInternal(ctx);

  // S12-2 · THE CHAIN GATES THE SIGN (§10 §9). Read through the caller's own (force-filtered)
  // client; refused BEFORE the transaction so a blocked sign writes nothing at all. The database
  // re-proves it (migration 51: CHECK + trigger block (0e)) — this is the sentence, that is the wall.
  if (input.decision === 'APPROVED') {
    const row = await db.approvalRequest.findFirst({
      where: { id: input.approvalRequestId },
      select: {
        type: true,
        reservedMatterKind: true,
        counselReviewRequired: true,
        authorityNoticeRequired: true,
        principalConsentRecordedAt: true,
        counselReviewRecordedAt: true,
        authorityNoticeRecordedAt: true,
      },
    });
    if (row !== null && String(row.type) === 'RESERVED_MATTER' && row.reservedMatterKind !== null) {
      const missing = missingReservedMatterChainSteps(
        reservedMatterChainState({
          reservedMatterKind: String(row.reservedMatterKind),
          counselReviewRequired: row.counselReviewRequired,
          authorityNoticeRequired: row.authorityNoticeRequired,
          principalConsentRecordedAt: row.principalConsentRecordedAt,
          counselReviewRecordedAt: row.counselReviewRecordedAt,
          authorityNoticeRecordedAt: row.authorityNoticeRecordedAt,
        }),
      );
      if (missing.length > 0) {
        throw new ReservedMatterChainIncompleteError(input.approvalRequestId, missing);
      }
    }
  }

  return withAudit(db, async (tx) => {
    // ⚠ NO `select`. A projection here made the APPROVE event state, in the append-only trail,
    // that `makerId`, `payloadHash` and `subjectId` were set to null (C-08).
    const updated = await tx.approvalRequest.update({
      where: { id: input.approvalRequestId },
      data: {
        status: input.decision,
        checkerId: input.checkerId,
        decidedAt: input.decidedAt,
        decidedAtHijri: input.decidedAtHijri,
        checkerTotpAssertedAt: input.checkerTotpAssertedAt,
      },
    });

    // Joins THIS transaction through the audit extension's async-local state, whichever
    // connection the context object was first bound to.
    if (input.event !== undefined) await recordEvent(ctx, input.event);

    return {
      id: updated.id,
      status: String(updated.status),
      checkerId: updated.checkerId,
      decidedAt: updated.decidedAt,
      decidedAtHijri: updated.decidedAtHijri,
      reservedMatterKind:
        updated.reservedMatterKind === null ? null : String(updated.reservedMatterKind),
      counselReviewRequired: updated.counselReviewRequired,
      authorityNoticeRequired: updated.authorityNoticeRequired,
      authorityReference: updated.authorityReference,
    };
  });
}
