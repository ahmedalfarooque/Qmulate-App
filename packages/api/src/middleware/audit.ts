/**
 * Denial auditing at the PROCEDURE BOUNDARY — the only place it can actually work.
 *
 * §10 principle 7 / BR-607 / NFR-04: "Every access and mutation is audit-logged … **including
 * *denied* attempts on sensitive resources**."
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE BOUNDARY, AND NOT INSIDE `withAudit()`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Two independent reasons, both fatal to the alternatives:
 *
 * 1. **A denial recorded inside the transaction it aborts is rolled back with it.** The scoping
 *    extension's `deny()` throws, which rolls the `withAudit()` transaction back — and
 *    `recordAuditEvent` JOINS an open audited transaction through an AsyncLocalStorage, so the
 *    denial event would join the very transaction that is about to disappear.
 *    `installScopeDenialAuditing()`'s own doc comment says so, and calls itself "the best-effort
 *    supplement for denials raised OUTSIDE one".
 * 2. **READ denials are deliberately not audited by the extension at all.** A read denial is not an
 *    event down there: the filter simply returns fewer rows, and "asked for something forbidden" is
 *    indistinguishable from "asked for something that does not exist". So a scoped READ procedure
 *    denied for want of a grant produces NO extension event, and this module is the ONLY path that
 *    satisfies AC-1's "the denied attempt is written to the audit trail".
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `installScopeDenialAuditing()` IS CALLED HERE, ONCE, AT API BOOT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * It was defined in `packages/database/src/client.ts`, re-exported from that package's barrel, and
 * had **zero call sites** through the whole of Sprint 1 — a security control that was shipped,
 * documented, and never switched on. {@link installApiAuditing} switches it on, and
 * `src/index.ts`/`src/root.ts` are on the import path of every API entry point.
 */

import { installScopeDenialAuditing, recordEvent } from '@qmulate/database';

import { toActorContext, type TrpcContext } from '../context.js';

/** What was refused. Every field is either derived server-side or echoed from the caller's own input. */
export interface ProcedureDenial {
  /** The tRPC procedure path, e.g. `endowment.get`. */
  readonly procedure: string;
  /** The API error code that was raised (`NO_GRANT`, `PERMISSION_DENIED`, …). */
  readonly code: string;
  /**
   * The endowment the caller asked about, or `null`. Echoing it discloses nothing — the value came
   * FROM the caller — and without it a denial cannot be scoped to an endowment in the trail.
   */
  readonly waqfId: string | null;
  /** The `module:resource:verb` demanded, when the refusal was about a permission. */
  readonly permission?: string;
  /** Developer-facing reason. No PII: this string lands in an append-only 10-year table. */
  readonly reason: string;
  /** `Beneficiary`, `ApprovalRequest`, … Defaults to `Procedure` when the refusal was not about a row. */
  readonly entityType?: string;
  readonly entityId?: string;
  /** `RESTRICTED` for an AML-compartment denial (§10 §6: it belongs to the compartment's own stream). */
  readonly classification?: 'ROUTINE' | 'SENSITIVE' | 'RESTRICTED';
}

let installed = false;

/**
 * Call ONCE at API boot. Idempotent.
 *
 * Installs the database package's scope-denial handler so an out-of-scope WRITE refused by the
 * force-filter also reaches the trail. That handler remains best-effort for the transactional reason
 * in the header; {@link recordProcedureDenial} is the dependable path.
 */
export function installApiAuditing(): void {
  if (installed) return;
  installed = true;
  installScopeDenialAuditing();
}

/** True once {@link installApiAuditing} has run. Asserted by `router-introspection.test.ts`. */
export function isApiAuditingInstalled(): boolean {
  return installed;
}

/**
 * Records ONE `ACCESS_DENIED` / `ACCESS` audit event for a refusal at the procedure boundary.
 *
 * ⚠ AWAITED BY EVERY CALLER, DELIBERATELY. AC-1 asserts EXACTLY ONE matching event, so a
 * fire-and-forget `void` would make the assertion race the response. The write is outside any
 * `withAudit()` block: `recordEvent` opens its own transaction when none is open, which is precisely
 * the property this needs.
 *
 * ⚠ A FAILURE TO RECORD NEVER CONVERTS INTO A SUCCESS. The refusal has already been decided by the
 * caller; this function only writes the trail. If the write itself fails it is swallowed, because
 * turning "we could not log your denial" into a 500 would tell an attacker they had found a way to
 * suppress the trail AND would replace a clean 404 with a noisy error. The alternative — letting the
 * write error escape — would also convert a NOT_FOUND into an INTERNAL_SERVER_ERROR, which is itself
 * an information leak about which endowments exist.
 */
export async function recordProcedureDenial(
  ctx: TrpcContext,
  denial: ProcedureDenial,
): Promise<void> {
  try {
    await recordEvent(toActorContext(ctx, { procedure: denial.procedure, reason: denial.reason }), {
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      entityType: denial.entityType ?? 'Procedure',
      entityId: denial.entityId ?? denial.procedure,
      // Plain column, not an FK (`AuditEvent.waqfId` is denormalized "so the trail survives its
      // subject"), so an attempted id that does not exist is still recordable — which is exactly
      // the case a denial needs.
      waqfId: denial.waqfId,
      ...(denial.classification !== undefined ? { classification: denial.classification } : {}),
      extraContext: {
        code: denial.code,
        ...(denial.permission !== undefined ? { permission: denial.permission } : {}),
        reason: denial.reason,
      },
    });
  } catch {
    // See the warning above. The refusal itself has already been raised to the caller.
  }
}
