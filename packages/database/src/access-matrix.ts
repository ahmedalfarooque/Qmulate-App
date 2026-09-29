/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ACCESS-MATRIX WRITE PATH — THE ONLY RUNTIME ROUTE THAT MAY MINT OR WIDEN A SEAT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Since ADR-0008 round 6 the runtime database role (`qmulate_app`, `DATABASE_URL`) holds **no
 * INSERT, UPDATE, DELETE or TRUNCATE on `waqf_access_grant`** — SELECT only. That closes route 2 of
 * the ADR-0008 reproduction by PRIVILEGE rather than by inspecting a row: a caller with any seat who
 * reaches `$executeRawUnsafe` on its own scoped Prisma client now gets
 * `42501 permission denied for table waqf_access_grant` before the admission trigger is even
 * consulted, and no forged `audit_event` marker changes that, because a marker is a row and this is
 * not a question about rows.
 *
 * The one legitimate runtime write therefore needs its own credential. This module is it.
 *
 * ── WHAT MAKES THIS NARROW RATHER THAN JUST A SECOND WAY IN ─────────────────────────────────────
 *   1. **The client object never escapes.** `createAccessMatrixPrismaClientInternal()` is called
 *      inside the two functions below and the handle is never returned, never stored on a context,
 *      never exported. So there is no route by which a caller obtains something with
 *      `$executeRawUnsafe` on a role that holds INSERT on the authorization plane. An exported
 *      `getProvisionerClient()` would have re-created the exact hole this closes.
 *   2. **The app-layer ladder still runs, unchanged.** Both functions build their client from the
 *      CALLER'S OWN `RequestContext`, so the scoping extension's write policy, the force filter and
 *      the column gate all evaluate exactly as they did on the app connection. The privileged
 *      credential buys a database privilege, not an authorization exemption.
 *   3. **Grant admission is NOT suspended.** `qmulate_provisioner` owns nothing, so it cannot
 *      `ALTER TABLE … DISABLE TRIGGER` (MEASURED: 42501 must be owner of table waqf_access_grant).
 *      `waqf_access_grant_admission` is fully live on this connection: the write still has to happen
 *      inside a transaction appending an `audit_event` that names an actor holding ESTABLISHED
 *      `admin:access_matrix:write` on that endowment. The privileged path is NARROWER, not exempt.
 *      Bootstrap — where no such actor can exist — is a different path with a different credential;
 *      see `access-matrix-bootstrap.ts`.
 *
 * ── ⚠ WHAT THIS DOES **NOT** CLOSE ─────────────────────────────────────────────────────────────
 * Code running inside the web process can still call these functions. The split removes two attacker
 * classes outright — raw SQL on a caller's own scoped client, and the holder of the application
 * database credential alone — and it does NOT remove an attacker who is executing arbitrary
 * JavaScript in `apps/web`. Only an out-of-process provisioner with its own operator authentication
 * would, and that is an open product-owner decision (ADR-0008 round-6 addendum, open question 1).
 * Do not let any document claim otherwise.
 *
 * ── ⚠ TRANSACTIONAL ATOMICITY IS A REAL CONSTRAINT ON FUTURE CALLERS ───────────────────────────
 * These functions open their OWN transaction, on their OWN connection. They therefore cannot share a
 * transaction with the caller's block. Today that costs nothing (`activateGrant()` already opened its
 * own `auditedWrite`), but a future caller that composes one of these INSIDE a larger
 * `withAudit(ctx.db, …)` would silently get two independent transactions and a grant that survives a
 * rolled-back parent. {@link assertNotInsideAuditTransaction} makes that mistake LOUD rather than
 * eventual.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */

import {
  createAccessMatrixPrismaClientInternal,
  hasConnectionCredential,
  MissingConnectionCredentialError,
  withAudit,
} from './client.js';
import { currentAuditTransaction } from './extensions/audit.js';

import type { RequestContext } from './context.js';

/** Raised when a provisioning call is nested inside another connection's audited transaction. */
export class AccessMatrixNestedTransactionError extends Error {
  readonly code = 'ACCESS_MATRIX_NESTED_TRANSACTION';

  constructor(operation: string) {
    super(
      `${operation}() was called INSIDE an open audited transaction. It runs on a different database ` +
        `connection (ACCESS_MATRIX_DATABASE_URL), so it cannot join that transaction: the grant would ` +
        `commit independently and would SURVIVE a rollback of the enclosing block. Move the call ` +
        `outside the transaction, or — if the two writes genuinely must be atomic — that is a design ` +
        `question about where access-matrix administration lives, not something to work around here.`,
    );
    this.name = 'AccessMatrixNestedTransactionError';
  }
}

function assertNotInsideAuditTransaction(operation: string): void {
  if (currentAuditTransaction() !== null) throw new AccessMatrixNestedTransactionError(operation);
}

function assertCredentialPresent(operation: string): void {
  // Checked BEFORE any work, so a runtime that was never given the credential fails closed with a
  // named variable rather than half-way through an audited transaction.
  if (!hasConnectionCredential('provisioner')) {
    const cause = new MissingConnectionCredentialError('provisioner');
    throw new Error(`${operation}() cannot run. ${cause.message}`, { cause });
  }
}

/**
 * The columns a caller may supply when minting a seat.
 *
 * ⚠ `grantedByUserId` IS ABSENT AND MUST STAY ABSENT. `CHECK waqf_access_grant_no_self_issue` is
 * `grantedByUserId <> userId`; a caller-supplied issuer defeats it without any raw SQL at all — an
 * admin self-promoting to `NAZIR` names any other user as the issuer, the CHECK compares two
 * attacker-chosen values, passes, and the trail then attributes the escalation to an innocent
 * colleague. The issuer is taken from the SESSION, below.
 */
export interface AccessGrantInput {
  readonly userId: string;
  readonly waqfId: string;
  /** The Prisma `Role` enum value. */
  readonly role: string;
  readonly permissions: readonly string[];
  readonly validFrom: Date;
  readonly validUntil?: Date | null;
  readonly amlCompartment?: boolean;
  readonly beneficiarySelfId?: string | null;
}

/**
 * Mints one `waqf_access_grant` row on the provisioning connection, inside one audited transaction.
 *
 * The `audit_event` this emits is what `qmulate_grant_admission` reads: the write is admitted only
 * because `ctx.actorId` holds an established `admin:access_matrix:write` grant on `input.waqfId`. So
 * the trigger's rule is unchanged and unweakened — what changed is that a caller who does NOT come
 * through here has no privilege to attempt the insert at all.
 */
export async function provisionAccessGrant(
  ctx: RequestContext,
  input: AccessGrantInput,
): Promise<{ grantId: string }> {
  assertCredentialPresent('provisionAccessGrant');
  assertNotInsideAuditTransaction('provisionAccessGrant');

  const db = createAccessMatrixPrismaClientInternal(ctx);

  return withAudit(db, async (tx) => {
    const created = await tx.waqfAccessGrant.create({
      data: {
        userId: input.userId,
        waqfId: input.waqfId,
        role: input.role as never,
        permissions: [...input.permissions],
        dataScopes: [],
        // Derived, never accepted: the DB CHECK `waqf_access_grant_aml_flags` ties the clearance to
        // the membership, and this is the code side of the same rule.
        amlCompartment: input.amlCompartment ?? false,
        canViewAmlRestricted: false,
        beneficiarySelfId: input.beneficiarySelfId ?? null,
        scopeRefs: [],
        // ⚠ THE ISSUER IS THE SESSION, NEVER THE PAYLOAD. See `AccessGrantInput`.
        //
        // The empty-string fallback exists only so the type is honest — and it FAILS
        // `CHECK waqf_access_grant_granted_by_not_blank` loudly rather than writing a grant with no
        // issuer.
        grantedByUserId: ctx.actorId ?? '',
        validFrom: input.validFrom,
        validUntil: input.validUntil ?? null,
        revokedAt: null,
        createdBy: ctx.actorId,
      },
      // A `create` projection is a deliberate privacy choice, not the C-08 diff bug: a create has no
      // pre-image, so the audit extension records the result AS the after-image with no diff and an
      // omitted column is simply not reported. See `packages/api/src/middleware/audit-projection.ts`.
      select: { id: true },
    });
    return { grantId: created.id };
  });
}

/**
 * Revokes one seat by stamping `revokedAt`, on the provisioning connection.
 *
 * ⚠ A REVOCATION IS AN UPDATE, NOT A DELETE, AND THAT IS NOT NEGOTIABLE. `waqf_access_grant_no_delete`
 * refuses a hard delete of any grant the audit trail names, and migration 10 additionally REVOKEs
 * `DELETE` on the table from BOTH the runtime and the provisioning role — so "revoke by erasing the
 * evidence" is now refused twice, by privilege and by trigger. `activeGrantWhere()` is the one
 * predicate that decides what an unrevoked grant is, so a stamped `revokedAt` takes effect everywhere
 * at once.
 */
export async function revokeAccessGrant(
  ctx: RequestContext,
  input: { readonly grantId: string; readonly revokedAt?: Date },
): Promise<{ grantId: string; revokedAt: Date }> {
  assertCredentialPresent('revokeAccessGrant');
  assertNotInsideAuditTransaction('revokeAccessGrant');

  const db = createAccessMatrixPrismaClientInternal(ctx);
  const revokedAt = input.revokedAt ?? new Date();

  return withAudit(db, async (tx) => {
    // No `select`: an `update` IS diffed against a full-row pre-image, and a projection there makes
    // the audit event claim every dropped column was set to null (C-08). The audited-write guard in
    // `packages/api` refuses a projected `update` for exactly this reason; this call site simply does
    // not have one.
    const updated = await tx.waqfAccessGrant.update({
      where: { id: input.grantId },
      data: { revokedAt },
    });
    return { grantId: updated.id, revokedAt };
  });
}
