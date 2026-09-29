/**
 * Rung 3: `requireDistinctApprover()` — maker ≠ checker, the Nazir's per-endowment authority, the
 * TOTP step-up, and the staleness void.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RULE THIS FILE EXISTS TO PROVE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **The Nazir is the sole approval authority, per endowment, and never the maker.**
 *
 * This is layer TWO of three. `@qmulate/domain`'s preset algebra is layer one; the
 * `approval_request_authority` trigger and the `approval_request_checker_ne_maker` CHECK in migration
 * `00000000000003_e2_authority_guards` are layer three. All three must hold, because a
 * TypeScript-only proof is one `$executeRawUnsafe` away from irrelevant — and because this layer can
 * say things SQL cannot (a typed error code before any state change; a `Setting`-driven freshness
 * window a CHECK constraint cannot read).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE CHECKS, IN ORDER, AND WHY THAT ORDER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  1. **`actorType === 'USER'`** — a SYSTEM or SERVICE actor can never produce an approval (MP-23).
 *     A scheduled distribution job, a retry, or a "clean up stuck approvals" task that completed an
 *     approval would be a non-human approval authority with no identity to attribute it to. §8: an
 *     expired-delegation in-flight item FREEZES — "not auto-approved and not silently dropped".
 *  2. **the request exists and belongs to `input.waqfId`** — read through the caller's own scoped
 *     client, so a caller with no grant on the endowment cannot even see it. Refused as `NO_GRANT`
 *     (NOT_FOUND): "does not exist" and "not yours" must be indistinguishable.
 *  3. **maker ≠ checker** — `ctx.actor.actorId` against the PERSISTED `makerId`. §10 §4.2 verbatim:
 *     "resolves the acting identity from the session, compares it to the persisted
 *     `initiatedByUserId` … and rejects a match with a typed `SEGREGATION_OF_DUTIES` error —
 *     *before any state change*". FIRST among the substantive checks precisely so nothing has been
 *     written when it fires (MP-10). **NEVER a role predicate**: the fixture makes the role-shaped
 *     mistake easy, because it grants NAZIR to BOTH `user-nazir-001` and `user-approver-001` on all
 *     four endowments, so "caller is a nazir → allow" passes both halves of MP-11 and only an
 *     identity check fails the right one.
 *  4. **the checker holds an ACTIVE `NAZIR` grant on THIS endowment** — from `ctx.grants`, which were
 *     re-evaluated on this request against the shared `activeGrantWhere()` predicate. Not
 *     `family_board` (§9 calls the principal consent part of an "approval chain", but §3's grid gives
 *     it no A/S cell and §9's chain ends "→ `nazir` S*"); not `aml_officer` (an AML decision may only
 *     BLOCK — an approval authority inside a compartment the Nazir cannot see is a direct BR-105
 *     violation, MP-24); not `admin` (config authority ≠ governance authority, MP-05); not
 *     `leadership` (D-1); not `authorized_rep` (D-2, absolutely, in any combination).
 *  5. **a fresh TOTP assertion**, against a `Setting`-driven window (D-6, NFR-06). Fail closed on all
 *     four unknowns: no assertion, an assertion older than the window, an unparseable value, or NO
 *     CONFIGURED WINDOW AT ALL.
 *  6. **the artifact is unchanged** — `payloadHash` recomputed with `approvalFingerprint`. On a
 *     mismatch the request is VOIDED and `APPROVAL_STALE` is raised (§10 §4.3: "the prior approval is
 *     voided and the item returns to re-submit"). Checked BEFORE the open-status gate, so replaying
 *     an approval whose payload has since changed voids it rather than reporting "already decided".
 *  7. **the request is open for decision** — `PENDING`. A terminal row can never be re-decided; the
 *     `approval_request_authority` trigger enforces the same lattice in SQL.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS DELIBERATELY ABSENT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * · **No `getUserRoleKeys()` / `getUserDbRoles()` call** (MP-12). Both union roles across every grant
 *   and membership with NO `waqfId` parameter, and `getUserRoleKeys`'s own doc says "for any SECURITY
 *   decision use `userRequiresTotpEnrolment`" — i.e. it is a posture helper. They are the most
 *   convenient functions in the codebase for a permission check, and a source scan proves this
 *   package does not import them.
 * · **No `ctx.actor.onBehalfOfId`** (MP-36). The checker grant is resolved for `actorId`, never for
 *   `onBehalfOfId ?? actorId` — that would be straight impersonation of the sole approval authority,
 *   cryptographically sealed by the audit hash.
 * · **No co-authorization**. There is no `approvers[]`, no `coApprovedByUserId`, nothing whose
 *   cardinality on the approval side exceeds one (D-2). A second approval authority is not
 *   EXPRESSIBLE here.
 * · **No second canonicaliser.** `approvalFingerprint` is imported from `@qmulate/database`, which
 *   builds it on that package's `canonicalJson` + `computeHash`. Two "canonical" forms of one payload
 *   is the shape of this whole sprint's bug: the approver signs one, the executor verifies the other,
 *   and the mismatch looks like staleness rather than like a broken comparison.
 */

import { z } from 'zod';

import { isDevAdminExempt } from '@qmulate/auth';
import { approvalFingerprintMatches } from '@qmulate/database';

import { ApiError, segregationOfDuties } from '../errors.js';
import {
  TOTP_STEP_UP_FRESHNESS_SETTING_KEY,
  parsePermission,
  requiresTotpStepUp,
  type PermissionString,
} from '../permissions.js';
import type { SettingReader, TrpcContext } from '../context.js';
import { auditedWrite } from './audit-projection.js';
import { recordProcedureDenial } from './audit.js';

import type { ScopedContext } from './scope.js';

export { approvalFingerprint, approvalFingerprintMatches } from '@qmulate/database';

/** The `Role` enum value that is the sole approval authority. One literal, one place. */
const NAZIR_DB_ROLE = 'NAZIR';

/**
 * The input every approval procedure carries, on top of `waqfScopedInput`.
 *
 * ⚠ NOTE THE SHAPE. The caller names the REQUEST, never the decision. There is no `checkerId` field,
 * no `approvers[]`, no `coApprovedByUserId`, and no `approve: boolean` — the acting identity comes
 * from the session and the outcome from the procedure, so a caller cannot nominate the approver and
 * co-authorization is not EXPRESSIBLE (D-2). Approval authority is single-valued by construction.
 */
export const approvalTargetInput = z.object({
  approvalRequestId: z.string().min(1).max(64),
});

export type ApprovalTarget = z.infer<typeof approvalTargetInput>;

/**
 * Asserts `permission` is a MAKER verb — `write` or `initiate` — and returns it.
 *
 * `makerProcedure` refuses an `approve`/`sign` permission at CONSTRUCTION, and that refusal is the
 * point: the maker is the party who may never authorize (§10 §4.2), so a "maker" procedure guarding
 * an approval verb is a contradiction — and one that would compose NO segregation guard onto an
 * approval action, which is the failure mode with no symptom.
 *
 * `read` is refused too: a maker procedure is a WRITE path, and labelling a read as one would put a
 * misleading verb in the trail.
 */
export function permissionIsWriteVerb(permission: PermissionString): PermissionString {
  const verb = parsePermission(permission)?.verb;
  if (verb !== 'write' && verb !== 'initiate') {
    throw new Error(
      `makerProcedure may only guard a write or initiate permission; "${permission}" has verb ` +
        `${JSON.stringify(String(verb))}. The maker is the party who may NEVER authorize (§10 §4.2) ` +
        `— a maker procedure guarding an approve/sign verb would compose no segregation guard onto ` +
        `an approval action. Use checkerProcedure or signerProcedure.`,
    );
  }
  return permission;
}

/** The persisted approval columns this rung reads. Narrow on purpose. */
export interface ApprovalRow {
  readonly id: string;
  readonly waqfId: string;
  readonly type: string;
  readonly status: string;
  readonly makerId: string;
  readonly checkerId: string | null;
  readonly subjectId: string | null;
  readonly payload: unknown;
  readonly payloadHash: string | null;
  readonly deletedAt: Date | null;
}

/** What a passing approval rung injects. */
export interface ApproverContext extends ScopedContext {
  readonly approval: ApprovalRow;
  /**
   * The grant that conferred the authority, and the role on it — recorded in the APPROVE audit event
   * so the trail proves the AUTHORITY and not merely the identity (MP-32, BR-607, NFR-04).
   */
  readonly authority: { readonly grantId: string; readonly role: string };
  /** The TOTP assertion that satisfied the step-up, stamped onto the row as evidence. */
  readonly totpAssertedAt: Date;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · maker != checker, as a standalone assertion
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * §10 §4.2's invariant, on its own, so it can be asserted without a database.
 *
 * The comparison is IDENTITY against IDENTITY. `approverUserId` is `null` for a SYSTEM/SERVICE actor,
 * and a null approver is refused rather than treated as "not the maker" — an approval with no
 * approver is not an approval (BR-105).
 */
export function assertDistinctApprover(input: {
  readonly initiatedByUserId: string;
  readonly approverUserId: string | null;
}): void {
  if (input.approverUserId === null || input.approverUserId === '') {
    throw new ApiError(
      'SEGREGATION_OF_DUTIES',
      'the approving identity is absent. An approval with no approver is not an approval (BR-105): ' +
        'a job, a retry, or a maintenance task cannot be a checker because it has no identity to ' +
        'attribute the decision to.',
      { initiatedByUserId: input.initiatedByUserId },
    );
  }
  if (input.approverUserId === input.initiatedByUserId) {
    throw segregationOfDuties({
      initiatedByUserId: input.initiatedByUserId,
      approverUserId: input.approverUserId,
    });
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The TOTP step-up window (D-6)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Why a step-up was refused. Recorded in the trail; never a reason to allow. */
export type StepUpRefusal = 'NO_ASSERTION' | 'SETTING_MISSING' | 'SETTING_INVALID' | 'EXPIRED';

/**
 * Reads the step-up freshness window, in seconds, from `Setting`.
 *
 * ⚠ NEVER A CONSTANT, AND NEVER A FALLBACK. `packages/auth` ships a documentary
 * `STEP_UP_FRESH_AGE_SECONDS = 600`; this function does NOT read it. A hardcoded fallback is exactly
 * how a fail-closed check becomes a fail-open one: the day the `Setting` row is missing, the fallback
 * silently keeps approvals flowing under a window nobody configured.
 *
 * Returns `null` for every unknown — absent row, wrong envelope shape, non-integer, non-positive,
 * absurdly large — and every caller treats `null` as DENY.
 *
 * ⚠ THE FIGURE IS CONFIGURATION, NOT LAW, BUT IT IS STILL UNVERIFIED: NFR-06's ≤30-minute idle
 * ceiling and any step-up window derived from it must be confirmed against primary Saudi law and
 * counsel before production — verify, may be stale.
 */
export async function readStepUpWindowSeconds(
  settings: SettingReader,
  waqfId: string,
): Promise<number | null> {
  const raw = await settings.raw(TOTP_STEP_UP_FRESHNESS_SETTING_KEY, waqfId);
  if (raw === null || typeof raw !== 'object') return null;

  // The seeded envelope shape (E1 contract §H): { v, unit, unverified, source, note? }. Read
  // structurally and refuse anything else — a bare number stored by hand is NOT accepted, because
  // accepting two shapes is how the caveat-carrying envelope quietly stops being mandatory.
  const value = (raw as { v?: unknown }).v;
  if (typeof value !== 'number' || !Number.isInteger(value)) return null;
  if (value <= 0 || value > 86_400) return null;
  return value;
}

/**
 * Was a fresh TOTP asserted? Returns `null` on success, or the {@link StepUpRefusal} reason.
 *
 * A FUTURE-DATED assertion is refused, not accepted: treating "asserted three days from now" as
 * fresh would turn a clock skew — or a value someone managed to write — into an indefinite pass.
 */
export function evaluateStepUp(input: {
  readonly assertedAt: Date | null;
  readonly windowSeconds: number | null;
  readonly now: Date;
}): StepUpRefusal | null {
  if (input.assertedAt === null) return 'NO_ASSERTION';
  if (input.windowSeconds === null) return 'SETTING_MISSING';
  const asserted = input.assertedAt.getTime();
  if (Number.isNaN(asserted)) return 'SETTING_INVALID';
  const ageSeconds = (input.now.getTime() - asserted) / 1000;
  if (ageSeconds < 0) return 'EXPIRED';
  return ageSeconds <= input.windowSeconds ? null : 'EXPIRED';
}

/**
 * {@link evaluateStepUp} with the ONE carve-out applied: the local development administrator
 * (`isDevAdminExempt` — fixture-only, exact email, see `@qmulate/auth`'s `dev-admin.ts`) is not
 * refused for a STALE assertion. It is still refused for NO assertion: the value written to the
 * approval record (`checkerTotpAssertedAt`) is the real sign-in instant, never fabricated, so an
 * account with nothing to record cannot approve even under the exemption. Every other caller gets
 * `evaluateStepUp`'s verdict unchanged.
 */
/**
 * Does the maker≠checker pre-check step aside for THIS decision? Only when the approver IS the
 * maker (a distinct approver never needs a carve-out), the approver is the authenticated caller,
 * and that caller is the fixture-only development administrator (`isDevAdminExempt`: exact email,
 * `DATA_CLASSIFICATION=fixture-only`, no wildcard). Everyone else keeps `assertDistinctApprover`.
 */
export function selfCheckCarveOutApplies(
  session: { readonly email: string; readonly userId: string },
  makerId: string,
  approverUserId: string | null,
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  if (approverUserId === null || approverUserId === '') return false;
  if (approverUserId !== makerId) return false;
  if (approverUserId !== session.userId) return false;
  return isDevAdminExempt(session.email, env);
}

export function stepUpRefusalFor(
  session: { readonly email: string; readonly totpAssertedAt: Date | null },
  windowSeconds: number | null,
  now: Date,
  env: Readonly<Record<string, string | undefined>> = process.env,
): StepUpRefusal | null {
  const refusal = evaluateStepUp({ assertedAt: session.totpAssertedAt, windowSeconds, now });
  if (refusal === null || refusal === 'NO_ASSERTION') return refusal;
  return isDevAdminExempt(session.email, env) ? null : refusal;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The full rung
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const APPROVAL_SELECT = {
  id: true,
  waqfId: true,
  type: true,
  status: true,
  makerId: true,
  checkerId: true,
  subjectId: true,
  payload: true,
  payloadHash: true,
  deletedAt: true,
} as const;

/** Non-terminal statuses. Mirrors the `approval_request_authority` trigger's lattice. */
const VOIDABLE_STATUSES: readonly string[] = ['PENDING', 'APPROVED'];

/**
 * Resolves and validates the caller's authority to decide `approvalRequestId`.
 *
 * Every refusal is an {@link ApiError} raised BEFORE any state change, with one deliberate exception:
 * a stale artifact VOIDS the request (which is the §10 §4.3 outcome, not a side effect) and then
 * raises `APPROVAL_STALE`.
 */
export async function resolveApprover(
  ctx: ScopedContext,
  approvalRequestId: string,
): Promise<ApproverContext> {
  // ── 1. a job is not an approver (MP-23) ────────────────────────────────────────────────────
  if (ctx.actor.actorType !== 'USER') {
    throw new ApiError(
      'SEGREGATION_OF_DUTIES',
      `actorType ${ctx.actor.actorType} cannot approve. A SYSTEM or SERVICE actor has no user ` +
        `identity, so it can satisfy neither maker≠checker nor the trigger's requirement that ` +
        `checkerId resolve to an ACTIVE NAZIR grant. §8: an expired-delegation in-flight item ` +
        `FREEZES — "not auto-approved and not silently dropped".`,
      { actorType: ctx.actor.actorType },
    );
  }

  // ── 2. the request, through the caller's own scoped client ─────────────────────────────────
  const approval = (await ctx.db.approvalRequest.findFirst({
    where: { id: approvalRequestId, deletedAt: null },
    select: APPROVAL_SELECT,
  })) as ApprovalRow | null;

  if (approval === null || approval.waqfId !== ctx.waqfId) {
    // "does not exist", "not yours" and "belongs to another endowment" are ONE answer, on purpose.
    throw new ApiError(
      'NO_GRANT',
      `no approval_request ${approvalRequestId} on waqf ${ctx.waqfId} is visible to this caller. ` +
        `An approval is per endowment (§10 principle 2); surfaced as NOT_FOUND so neither its ` +
        `existence nor its owning endowment is disclosed.`,
      { approvalRequestId, waqfId: ctx.waqfId },
    );
  }

  // ── 3. maker != checker, BEFORE ANY STATE CHANGE (MP-10, MP-11, AC-4) ─────────────────────
  // An IDENTITY comparison against the persisted makerId. Reached before anything has been written,
  // and before the authority lookup, so a caller who is the maker is refused even if they are also
  // the Nazir — which is §4.2's small-team case, stated explicitly.
  // Migration 54 / `dev-admin.ts`: the fixture-only development administrator may decide their own
  // request. The carve-out is claimed HERE only when the classification and the exact email agree
  // (`isDevAdminExempt`); the database then admits the row only if IT names the same user
  // (`qmulate_self_approval_exempt`). Both must hold — neither layer trusts the other alone.
  if (!selfCheckCarveOutApplies(ctx.session, approval.makerId, ctx.actor.actorId)) {
    assertDistinctApprover({
      initiatedByUserId: approval.makerId,
      approverUserId: ctx.actor.actorId,
    });
  }

  // ── 4. an ACTIVE NAZIR grant on THIS endowment (MP-07, MP-08, MP-12, MP-13, MP-24) ────────
  // `ctx.grant` is already the grant for `ctx.waqfId` — resolved from `ctx.grants`, which were loaded
  // for THIS request against the shared `activeGrantWhere()` predicate. So a revoked, expired or
  // future-dated grant is already absent, a grant on another endowment cannot satisfy this, and a
  // client-level Membership contributes nothing at all.
  const nazirGrant = ctx.grants.find(
    (grant) => grant.waqfId === ctx.waqfId && grant.role === NAZIR_DB_ROLE,
  );
  if (nazirGrant === undefined) {
    throw new ApiError(
      'PERMISSION_DENIED',
      `role ${ctx.grant.role} may not decide approval_request ${approvalRequestId}: the checker ` +
        `must hold an ACTIVE NAZIR WaqfAccessGrant on waqf ${ctx.waqfId}. The Nazir is the sole ` +
        `approval authority, PER ENDOWMENT (BR-105 / BR-1103, §10 §4). A recorded family_board ` +
        `consent or a counsel review is a separate chain STEP, never an approval; an AML ` +
        `compartment decision may only BLOCK; and config authority (admin) is not governance ` +
        `authority.`,
      { approvalRequestId, waqfId: ctx.waqfId, role: ctx.grant.role },
    );
  }

  // ── 5. a fresh TOTP assertion (D-6, NFR-06) ────────────────────────────────────────────────
  const windowSeconds = await readStepUpWindowSeconds(ctx.settings, ctx.waqfId);
  // `stepUpRefusalFor` = `evaluateStepUp` plus the fixture-only dev-admin carve-out (stale ⇒ pass,
  // absent ⇒ still refused). Maker≠checker above is NOT carved out: it is a database CHECK.
  const refusal = stepUpRefusalFor(ctx.session, windowSeconds, ctx.now);
  if (refusal !== null) {
    throw new ApiError(
      'TOTP_STEP_UP_REQUIRED',
      `approve/sign needs a fresh TOTP assertion (NFR-06) and does not have one: ${refusal}. The ` +
        `freshness window is Setting[${TOTP_STEP_UP_FRESHNESS_SETTING_KEY}] and is never a ` +
        `hardcoded constant — a missing, unparseable or absent value DENIES, because a fallback ` +
        `window is how a fail-closed check becomes fail-open. ⚠ the window itself is unverified — ` +
        `confirm vs primary law.`,
      { approvalRequestId, reason: refusal, settingKey: TOTP_STEP_UP_FRESHNESS_SETTING_KEY },
    );
  }
  // Non-null by construction: `evaluateStepUp` returns NO_ASSERTION for a null assertedAt.
  const totpAssertedAt = ctx.session.totpAssertedAt as Date;

  // ── 6. the approver signs the exact artifact they saw (MP-30, §10 §4.3) ───────────────────
  // BEFORE the open-status gate, so replaying an approval whose payload has since changed VOIDS it
  // rather than reporting "already decided" and leaving a stale APPROVED row standing — which would
  // be a live second authority.
  if (!approvalFingerprintMatches(approval.payload, approval.payloadHash)) {
    await voidStaleApproval(ctx, approval);
    throw new ApiError(
      'APPROVAL_STALE',
      `FINGERPRINT_MISMATCH: approval_request ${approvalRequestId}'s artifact changed after ` +
        `submission — the bound payloadHash no longer matches approvalFingerprint(payload). The prior ` +
        `approval is VOIDED and the item returns to re-submit (§10 §4.3). Whoever changes the lines ` +
        `after approval would otherwise be the real approver.`,
      { approvalRequestId, reason: 'FINGERPRINT_MISMATCH' },
    );
  }

  // ── 7. open for decision ───────────────────────────────────────────────────────────────────
  if (approval.status !== 'PENDING') {
    throw new ApiError(
      'APPROVAL_STALE',
      `NOT_OPEN: approval_request ${approvalRequestId} is ${approval.status}, not PENDING, so it is ` +
        `not open for decision. Re-deciding a closed approval is how a second authority is created ` +
        `through an UPDATE — raise a NEW request instead. The approval_request_authority trigger ` +
        `enforces the same lattice in SQL.`,
      { approvalRequestId, reason: 'NOT_OPEN', status: approval.status },
    );
  }

  return {
    ...ctx,
    approval,
    authority: { grantId: nazirGrant.grantId, role: nazirGrant.role },
    totpAssertedAt,
  };
}

/**
 * Voids a request whose artifact changed (§10 §4.3).
 *
 * `VOID` exists as of E2 precisely so "voided" is a REPRESENTABLE state: before it, the only ways to
 * express it were to leave a stale APPROVED row standing (a live second authority) or to rewrite
 * history. Neither is acceptable.
 *
 * Runs inside `withAudit()` so the transition and its audit event commit together, and only for a
 * non-terminal row — the trigger refuses a transition out of a terminal state, and swallowing that
 * refusal would hide it.
 */
async function voidStaleApproval(ctx: ScopedContext, approval: ApprovalRow): Promise<void> {
  if (!VOIDABLE_STATUSES.includes(approval.status)) return;

  await auditedWrite(ctx.db, async (tx) => {
    await tx.approvalRequest.update({
      where: { id: approval.id },
      data: { status: 'VOID' },
    });
  });
}

/**
 * Reads and validates the `approvalRequestId` an approval procedure must carry.
 *
 * Refused rather than skipped when absent: the maker≠checker comparison is against the PERSISTED
 * `makerId`, so there is nothing to compare without one — and "no id, therefore no comparison,
 * therefore allow" is the exact shape of a check that silently does nothing.
 */
export function requireApprovalRequestIdInput(input: unknown, path: string): string {
  const parsed =
    typeof input === 'object' && input !== null
      ? approvalTargetInput.safeParse(input)
      : ({ success: false } as const);
  if (!parsed.success) {
    throw new ApiError(
      'NO_GRANT',
      `procedure ${path} is an approval procedure but its input carries no usable ` +
        `approvalRequestId. The maker≠checker comparison is against the PERSISTED makerId, so there ` +
        `is nothing to compare without one. Refused rather than skipped.`,
      { procedure: path },
    );
  }
  return parsed.data.approvalRequestId;
}

/**
 * Records the boundary denial for a refused approval attempt.
 *
 * ⚠ A REFUSED APPROVAL IS ALWAYS AUDITED, whatever the reason — MP-24's "no `APPROVE` audit event
 * may be suppressed from a Nazir by AML classification" has a mirror image: a refusal that leaves no
 * trace is an attempt on the sole approval authority that nobody can review. The event is
 * `SENSITIVE`, because an attempt to approve money movement is not routine traffic.
 */
export async function auditApprovalRefusal(
  ctx: TrpcContext,
  path: string,
  approvalRequestId: string,
  permission: PermissionString,
  error: unknown,
): Promise<void> {
  if (!(error instanceof ApiError)) return;

  await recordProcedureDenial(ctx, {
    procedure: path,
    code: error.code,
    waqfId: 'waqfId' in ctx && typeof ctx.waqfId === 'string' ? ctx.waqfId : null,
    permission,
    reason: error.message,
    entityType: 'ApprovalRequest',
    entityId: approvalRequestId,
    classification: 'SENSITIVE',
  });
}

/**
 * Asserts that this permission is one the approval rungs may guard.
 *
 * `checkerProcedure`/`signerProcedure` exist for `approve`/`sign` ONLY. A `read` permission handed to
 * one of them would compose the segregation guard onto a procedure whose verb needs none, and
 * `router-introspection.test.ts` asserts the converse too — so the two directions are pinned and a
 * mislabelled procedure fails the build rather than shipping.
 */
export function assertApprovalPermission(permission: PermissionString): PermissionString {
  if (!requiresTotpStepUp(permission)) {
    throw new Error(
      `checkerProcedure/signerProcedure may only guard an approve or sign permission; ` +
        `"${permission}" is neither. Use makerProcedure or endowmentScopedProcedure instead — ` +
        `composing the segregation guard onto a non-approval verb makes the ladder's shape a lie.`,
    );
  }
  return permission;
}
