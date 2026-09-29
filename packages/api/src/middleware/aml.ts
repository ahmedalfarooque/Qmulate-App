/**
 * The AML no-tipping-off compartment at the procedure boundary — `requireAmlMember()`.
 *
 * §10 §6, BR-604. Two sentences carry the whole design:
 *
 *   **"Invisibility, not redaction."** Outside the compartment the SAR does not appear anywhere: not
 *   as a greyed row, not as a count, not in the audit feed shown to non-members, not in any export or
 *   evidence pack, not in the subject beneficiary's portal or notifications. A non-member querying
 *   the store gets an EMPTY SET, "as if it does not exist", and the ATTEMPT is logged into the
 *   compartment's own audit stream, visible only to members.
 *
 *   **"No other role — *including the Nazir by default* — reads it unless separately made a
 *   compartment member."** Membership is explicit, per-endowment, and never implied by seniority.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * AN AML DECISION MAY ONLY BLOCK, NEVER SATISFY AN APPROVAL (MP-24)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Nothing in this file confers capability. There is no path from `amlCompartment === true` to an
 * approval: `resolveApprover` requires an ACTIVE `NAZIR` grant and consults `amlCompartment` nowhere,
 * and the `aml` module has no `approve` or `sign` resource in the registry at all. This is the
 * worst-shaped version of the second-authority bug rather than an exception to it — an approval
 * authority living inside a compartment the legally accountable Nazir cannot audit is a direct BR-105
 * violation, and the hardest kind to detect, because the evidence is hidden by design.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY READS DO NOT COME THROUGH HERE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A READ by a non-member must return the EMPTY SET, not an error — an error is a signal, and the
 * compartment's whole point is the absence of a signal. That subtraction is the force-filter's job
 * (`amlClause()` in `packages/database`, driven by `ctx.amlCompartmentWaqfIds`, which this package
 * derives from `amlCompartment === true` grants and from nothing else). This middleware is for
 * compartment WRITES and for procedures that would otherwise have to explain themselves — where
 * "nothing happened" is not an expressible answer.
 */

import { ApiError } from '../errors.js';
import { recordProcedureDenial } from './audit.js';

import type { PermissionString } from '../permissions.js';

import { roleKeyFromDbRole } from '@qmulate/domain';

import type { TrpcContext } from '../context.js';
import type { ScopedContext } from './scope.js';

/**
 * Is this caller inside the compartment FOR THIS ENDOWMENT?
 *
 * Per-endowment, from the caller's own grants. Deliberately NOT from `ctx` fields that look like
 * clearances: `RequestContext.canViewAmlRestricted` is posture only (its own doc says so), and in
 * Sprint 1 `amlClause()` returned `null` — no restriction whatsoever, on every endowment — the
 * instant that boolean was true, BEFORE the per-waqf list was consulted. A compartment is not a
 * clearance level.
 *
 * FAILS CLOSED on everything: an unknown endowment, a caller with no grants, a grant without the
 * flag. Membership is affirmative or it is absent.
 */
export function isAmlMember(ctx: Pick<TrpcContext, 'grants'>, waqfId: string): boolean {
  // ⚠ DERIVED, NOT RE-IMPLEMENTED. This was `grants.some(g => g.waqfId === waqfId &&
  // g.amlCompartment)` — a THIRD copy of the membership rule alongside `amlCompartmentWaqfIds` and
  // `context.ts`'s. Adding S8-Q2's by-construction arm to the other two left THIS one answering the
  // old question, so the rung refused a Nazir the force filter would have admitted: measured, three
  // tests red. Membership has exactly one derivation now, and it is
  // {@link deriveAmlCompartmentWaqfIds}.
  return deriveAmlCompartmentWaqfIds(ctx.grants).includes(waqfId);
}

/**
 * The endowments this caller is a compartment member for. Empty is the default and it subtracts every
 * `AML_RESTRICTED` row from every query — which is what fail-closed means for rows that must be
 * INVISIBLE rather than merely unreadable.
 *
 * ⚠ **THIS DOCSTRING USED TO END "…and which is correct for the Nazir by default." IT IS NOT, AND
 * THAT CLAUSE IS SUPERSEDED** by the product owner's S8-Q2 ruling of 2026-08-23: the Nazir is inside
 * by CONSTRUCTION. See {@link deriveAmlCompartmentWaqfIds}. The clause is quoted here rather than
 * deleted because it was engineering's fail-safe reading, shipped and believed for a sprint, and the
 * record of a superseded reading is worth more than a tidy sentence.
 */
export function amlCompartmentWaqfIds(ctx: Pick<TrpcContext, 'grants'>): string[] {
  return deriveAmlCompartmentWaqfIds(ctx.grants);
}

/**
 * The ONE derivation of compartment membership — ⊕ **S8-Q2 (product owner, 2026-08-23).**
 *
 * ⚠ **THE NAZIR IS INSIDE BY CONSTRUCTION, AND THIS SUPERSEDES WHAT THIS FILE USED TO SAY.** The
 * owner's verbatim selection was *"Nazir inside by construction"*: the legally accountable seat
 * ALWAYS sees the compartment on its own endowment, without an explicit `amlCompartment` grant.
 *
 * That resolves a collision this record carried openly rather than a preference. The shipped code's
 * doctrine — *"no other role, INCLUDING THE NAZIR BY DEFAULT, reads the compartment without it"* —
 * was **engineering's fail-safe reading**, and it contradicted a principle already hard-coded on
 * `ApprovalRequest`, which is forbidden from ever gaining a `confidentiality` column because *"an
 * approval hidden by AML classification is one the legally accountable Nazir cannot audit."* Same
 * person, opposite answers. The owner ruled for the accountability principle, and named the tradeoff
 * he was accepting: the widened knowledge set is exactly the seat regulators hold accountable.
 *
 * ⚠ **EXPLICIT GRANTS REMAIN FOR EVERY OTHER SEAT.** This adds one arm; it does not open the
 * compartment. `aml_officer`, `compliance_officer`, `counsel` and anyone else still need
 * `amlCompartment` on their grant, per §10 §6's "membership is explicit and per-endowment, never
 * implied by seniority" — which now has exactly one construction-level exception, ruled rather than
 * inferred.
 *
 * ⚠ **AND IT IS PER-ENDOWMENT, NOT GLOBAL.** A Nazir on `waqf-001` is inside `waqf-001`'s compartment
 * and no other. The arm reads the grant's own `waqfId`, so it cannot widen across endowments — which
 * matters because a Nazir seat on one endowment is not an accountability claim over another's.
 *
 * ── WHY THIS FUNCTION EXISTS RATHER THAN TWO COPIES OF THE FILTER ─────────────────────────────
 * The derivation lived in TWO places — here and in `context.ts`'s `toActorContext`, which builds the
 * DATABASE-layer context the force filter reads. Two copies of a membership rule is the shape this
 * repo has been bitten by five times, and adding an arm to one of them would have produced a session
 * whose procedure rung admitted the Nazir while the force filter still subtracted every row from
 * them — an outage that reads as a working control. `context.ts` calls this.
 */
export function deriveAmlCompartmentWaqfIds(
  grants: readonly {
    readonly waqfId: string;
    readonly role: string;
    readonly amlCompartment: boolean;
  }[],
): string[] {
  return [
    ...new Set(
      grants
        .filter((grant) => grant.amlCompartment || isNazirSeat(grant.role))
        .map((grant) => grant.waqfId),
    ),
  ];
}

/**
 * Is this grant the legally accountable Nazir seat?
 *
 * Compares against the DATABASE spelling via `@qmulate/domain`'s single derivation rather than a
 * literal, so a rename of the role enum cannot silently stop admitting the Nazir — which would fail
 * CLOSED (the compartment narrows) and therefore silently, since a narrower compartment produces no
 * error, just fewer rows.
 */
function isNazirSeat(role: string): boolean {
  return roleKeyFromDbRole(role) === 'nazir';
}

/**
 * Asserts compartment membership for `ctx.waqfId`, auditing the attempt into the compartment's OWN
 * stream when it fails.
 *
 * The refusal is `AML_COMPARTMENT_ONLY`, which maps to `NOT_FOUND` — a non-member is told exactly what
 * they would be told about an endowment they hold no grant on.
 *
 * ⊕ **AND SINCE S8-Q2 A NON-MEMBER IS NEVER THE NAZIR.** The owner ruled the accountable seat inside
 * by construction, so the callers this rung refuses are now: every other seat without an explicit
 * `amlCompartment` grant. That makes the refusal narrower and the compartment's membership set
 * non-empty on every seeded endowment — which is what finally gives the no-tipping-off suite a real
 * INSIDE arm to contrast against, instead of two outside arms that collapse to one.
 *
 * ⚠ **THAT SENTENCE WAS FALSE FROM THE DAY IT WAS WRITTEN UNTIL S8, AND IT IS RECORDED RATHER THAN
 * QUIETLY MADE TRUE.** The status was identical and the ar/en wording was byte-identical, but the
 * payload was not: `apiErrorToTRPCError` concatenated the CODE into `shape.message`, over the
 * developer-facing `message` written a few lines below — which explains what a compartment is, that
 * membership is per-endowment, and that not even the Nazir is inside by default. `errorFormatter`
 * then threaded `apiCode`/`messageKey` per member. So a non-member learned considerably more than a
 * no-grant caller: that this endowment has an AML compartment and that they are outside it. What
 * makes the sentence true now is the narrowing in `errors.ts` §3b + `apiErrorToTRPCError` +
 * `trpc.ts`'s `errorFormatter`, and `aml-compartment.integration.test.ts` drives all three channels
 * rather than asserting the shape of any one of them. The verbose `message` below is deliberate and
 * stays: it is the audit trail's `reason` and the operator log line, and `cause` is never serialised
 * to a client.
 *
 * The attempt is recorded with
 * `classification: 'RESTRICTED'`, which is what puts it in the compartment's own stream (§10 §6:
 * "visible only to members") rather than in the feed a non-member can read: recording a non-member's
 * attempt where non-members can see it would itself be a tip-off.
 */
export async function assertAmlMember(
  ctx: ScopedContext,
  path: string,
  permission: PermissionString,
): Promise<void> {
  if (isAmlMember(ctx, ctx.waqfId)) return;

  const error = new ApiError(
    'AML_COMPARTMENT_ONLY',
    `waqf ${ctx.waqfId} has an AML no-tipping-off compartment and this caller is not a member. ` +
      `Membership is explicit and per-endowment, never implied by seniority — with ONE ruled ` +
      `exception: the legally accountable NAZIR seat is inside by CONSTRUCTION on its own endowment ` +
      `(product owner, S8-Q2, 2026-08-23), because an AML matter hidden from the seat regulators hold ` +
      `accountable is one they cannot audit. Every other role needs an explicit grant (§10 §6, ` +
      `BR-604). Surfaced as NOT_FOUND: the compartment is invisibility, not redaction.`,
    { waqfId: ctx.waqfId, permission },
  );

  await recordProcedureDenial(ctx, {
    procedure: path,
    code: error.code,
    waqfId: ctx.waqfId,
    permission,
    reason: error.message,
    entityType: 'AmlCompartment',
    entityId: ctx.waqfId,
    classification: 'RESTRICTED',
  });

  throw error;
}
