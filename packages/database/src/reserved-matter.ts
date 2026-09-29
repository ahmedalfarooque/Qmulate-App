// QMULATE — the reserved-matter door, and the approval-artifact fingerprint.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS MODULE IS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `setReservedMatterApproval()` in `src/client.ts` is a PRIMITIVE: it sets the transaction-local
// GUC that the reserved-matter database guards read, and it performs NO authorization check. Its own
// comment says so, and it named this file as the caller that would do the checking — a file that,
// through Sprint 1, did not exist and was not in the package's `exports` map either. So the
// documented door had no doorway, and the only thing standing between an arbitrary caller and a
// reserved-matter column was the guard's test that the GUC was a non-empty string.
//
// This module is that doorway. There is exactly ONE way to open a reserved-matter guard from
// TypeScript, and it is `withReservedMatter()`.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠ THE SHART AL-WAQIF IS NOT ONE OF THE THINGS THIS DOOR OPENS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// USER DECISION, 2026-07-27, verbatim: **"shart al-waqif cannot be changed, regardless of
// approvals."** So:
//
//   • `withReservedMatter()` REFUSES, unconditionally, any write that touches a Shart column — no
//     approval id, however genuine, opens it. `ShartAmendmentForbiddenError`.
//   • `qmulate_shart_guard()` (migration `00000000000003_e2_authority_guards`) raises on those four
//     columns with no reference to the GUC at all, so the SQL path is shut too. There is no code
//     path and no SQL path by which `shartAlWaqif` changes after its first write, and both halves
//     are asserted in `test/shart-immutability.integration.test.ts`.
//
// WHAT THE DOOR DOES OPEN: the OTHER reserved-matter columns the trigger guards —
// `waqf.certificateNumber`, `waqf.deedNumber` (D-5: they stay reserved-matter-only, because silently
// re-pointing a waqf at a different deed is as damaging as editing the Shart), and the
// document legal-hold / retention release. For those, a GENUINE approval is required and is now
// verified rather than assumed.
//
// ⚠ SURFACED, NOT RESOLVED (report it; do not "fix" it here). This is STRICTER than CLAUDE.md
// binding rule 1, which says the Shart is "amendable only via an explicit authority-gated
// reserved-matter workflow" — i.e. the binding rule contemplates an amendment while the user
// decision says none is possible. Both cannot be literally true. Binding rule 1's wording needs
// reconciling with the S2 decision before E11/S12 builds the reserved-matter workflow.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// FAIL CLOSED. Every unknown is a refusal.
// ═══════════════════════════════════════════════════════════════════════════════════════════
// A missing request, a soft-deleted one, the wrong type, a status that is not `APPROVED`, an approval
// belonging to another endowment, a null `checkerId`, `checkerId === makerId` — each throws
// `ReservedMatterNotApprovedError` BEFORE the transaction opens, so a refused call writes nothing at
// all. The same five conditions are re-checked inside the Postgres trigger, because a TypeScript-only
// proof is one `$executeRawUnsafe` from irrelevant.

import { createPrismaClient, setReservedMatterApproval, withAudit } from './client.js';
import {
  ReservedMatterNotApprovedError,
  ShartAmendmentForbiddenError,
  isRequestContext,
  type RequestContext,
} from './context.js';
import { canonicalJson, computeHash, GENESIS_HASH } from './hash-chain.js';
import { isSelfApprovalExempt } from './self-approval-exemption.js';
import { firstMissingReservedMatterChainStep } from '@qmulate/domain';

import type { ExtendedPrismaClient } from './client.js';
import type { AuditTransactionOptions } from './extensions/audit.js';

/**
 * The four write-once Shart al-Waqif columns.
 *
 * Named here as well as in the trigger because the two layers refuse at different moments and both
 * refusals matter: this one keeps the write out of the transaction entirely (so nothing is written
 * and rolled back), the trigger one holds against raw SQL. `test/shart-immutability.integration.test.ts`
 * compares this list against `qmulate_shart_guard()`'s source so the two cannot drift.
 */
export const SHART_COLUMNS: readonly string[] = [
  'shartAlWaqif',
  'shartAlWaqifVersion',
  'shartAlWaqifSetAt',
  'shartAlWaqifSetAtHijri',
];

/**
 * TIER 3 — the WRITE-ONCE deed-term columns (S4/E3, migration 12).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THEY ARE A SEPARATE LIST FROM {@link SHART_COLUMNS} AND NOT AN ADDITION TO IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * These ARE founder's conditions — `continuationStipulation` decides which of the waqif's lines
 * continue, and the مآل clause decides where the endowment goes when the family ends. But they
 * cannot join tier 1: tier 1 refuses EVERY write, which is correct for a Shart written at insert
 * and fatal for a term that was illegible at intake. Such a term would be unrecordable for ever,
 * and an endowment could never be brought onto the system after the fact.
 *
 * So the database permits `NULL -> value` exactly ONCE and then refuses `value -> anything`,
 * including `value -> NULL`. `reversionClauseCaptured` is `false -> true` only.
 *
 * ⚠ CONSEQUENCE FOR THIS MODULE, AND IT IS THE OPPOSITE OF THE SHART'S: `shartSealedFacade()`
 * DELIBERATELY DOES NOT SEAL THESE. The facade inspects a write PAYLOAD, and a payload cannot tell
 * a first write from a second — only the OLD ROW can, which is why tier 3 lives in a trigger. If the
 * facade refused these columns on presence, it would refuse the legitimate first recording through
 * the one door that carries a recorded governance decision, and a term illegible at intake would be
 * unrecordable for ever. So the DATABASE owns this rule alone: it refuses `value -> anything` from
 * Prisma, from raw SQL, from a migration, and under `session_replication_role = 'replica'`, and the
 * caller sees SQLSTATE 42501 with the superseding-instrument message.
 *
 * The app-layer control on the FIRST write is a different mechanism and lives elsewhere: the column
 * gate in `src/extensions/scoping.ts` requires `endowment:deed:sign` — held only by `nazir` — for
 * every column in this list.
 *
 * `test/shart-immutability.integration.test.ts` compares this list against
 * `qmulate_shart_guard()`'s own source text, exactly as it does for {@link SHART_COLUMNS}, so the
 * two layers cannot drift.
 */
export const DEED_TERM_WRITE_ONCE_COLUMNS: readonly string[] = [
  'continuationStipulation',
  'reversionKind',
  'reversionRecordedAt',
  'reversionRecordedAtHijri',
];

/**
 * The one-way Boolean beside them. Not in {@link DEED_TERM_WRITE_ONCE_COLUMNS} because its rule is
 * different in kind: it is not "NULL once then sealed" but "false -> true, never back". Un-capturing
 * would restore the "nobody has read this deed" state and let an unread deed masquerade as one that
 * names no ultimate taker (R7-c).
 */
export const REVERSION_CAPTURE_COLUMN = 'reversionClauseCaptured';

/** `ApprovalType.RESERVED_MATTER` — the only type that may open a reserved-matter guard. */
const RESERVED_MATTER_TYPE = 'RESERVED_MATTER';
/** `ApprovalStatus.APPROVED` — a PENDING approval is not an approval. */
const APPROVED_STATUS = 'APPROVED';

/**
 * THE canonical fingerprint of an approved artifact — `ApprovalRequest.payloadHash`.
 *
 * ONE implementation, exported so `packages/api`'s approve/execute procedures and the fixture seed
 * compute the identical value. Two "canonical" forms of the same object is the shape of the bug this
 * whole sprint is about: the approver would sign one and the executor would verify the other, and the
 * mismatch would look like a stale approval rather than like a broken comparison.
 *
 * Built on the package's existing `canonicalJson` + `computeHash` (no second canonicaliser), which
 * means it inherits their two useful refusals: `canonicalJson` THROWS on a JS `number`, so money
 * cannot reach this path in float form, and object key order is normalised, so a re-serialised
 * payload fingerprints identically.
 *
 * `GENESIS_HASH` stands in for the chain's `prevHash`: a fingerprint has no predecessor, and reusing
 * the chain's hasher with a constant prefix is what keeps it to one code path.
 */
export function approvalFingerprint(payload: unknown): string {
  return computeHash(payload, GENESIS_HASH);
}

/** True when `canonicalJson(payload)` fingerprints to `expected`. Constant work, no throw on null. */
export function approvalFingerprintMatches(payload: unknown, expected: string | null): boolean {
  if (expected === null || expected === '') return false; // an unbound approval matches nothing
  return approvalFingerprint(payload) === expected;
}

/** Exposed for the parity test: the canonical form the fingerprint is taken over. */
export function approvalCanonicalForm(payload: unknown): string {
  return canonicalJson(payload);
}

/** The `ApprovalRequest` columns `withReservedMatter` needs. Kept narrow on purpose. */
interface ApprovalRow {
  readonly id: string;
  readonly type: string;
  readonly status: string;
  readonly waqfId: string;
  readonly makerId: string;
  readonly checkerId: string | null;
  readonly deletedAt: Date | null;
  // S12-2 — the BR-1102 chain (migration 51). Read so the door can name the missing step.
  readonly reservedMatterKind: string | null;
  readonly counselReviewRequired: boolean;
  readonly authorityNoticeRequired: boolean;
  readonly principalConsentRecordedAt: Date | null;
  readonly counselReviewRecordedAt: Date | null;
  readonly authorityNoticeRecordedAt: Date | null;
}

/**
 * The five conditions, in the same order and with the same wording as
 * `qmulate_reserved_matter_defect()` in SQL. Returns the reason it is NOT usable, or `null`.
 */
function reservedMatterDefect(
  approvalRequestId: string,
  waqfId: string,
  row: ApprovalRow | null,
  /** Migration 54: the database names this checker as self-approval-exempt (fixture-only dev admin). */
  selfApprovalExempt = false,
): string | null {
  if (row === null) {
    return `approval_request ${JSON.stringify(approvalRequestId)} does not exist — a fabricated id is not an approval`;
  }
  if (row.deletedAt !== null) {
    return `approval_request ${JSON.stringify(approvalRequestId)} is soft-deleted`;
  }
  if (row.type !== RESERVED_MATTER_TYPE) {
    return `approval_request ${JSON.stringify(approvalRequestId)} is type ${row.type}, not ${RESERVED_MATTER_TYPE}`;
  }
  if (row.status !== APPROVED_STATUS) {
    return `approval_request ${JSON.stringify(approvalRequestId)} is ${row.status}, not ${APPROVED_STATUS}`;
  }
  if (row.waqfId !== waqfId) {
    return (
      `approval_request ${JSON.stringify(approvalRequestId)} belongs to waqf ${row.waqfId}, not ` +
      `${waqfId} — an approval is per endowment, never portfolio-wide`
    );
  }
  if (row.checkerId === null) {
    return `approval_request ${JSON.stringify(approvalRequestId)} has no checkerId — nobody approved it`;
  }
  if (row.checkerId === row.makerId && !selfApprovalExempt) {
    return (
      `approval_request ${JSON.stringify(approvalRequestId)} was self-approved ` +
      `(checkerId = makerId): the maker may never be the checker (§10 §4.2)`
    );
  }
  // S12-2 — the chain, LAST, in the same order as `qmulate_approval_defect()` (migration 51 §4).
  const missing = firstMissingReservedMatterChainStep({
    reservedMatterKind: row.reservedMatterKind === null ? null : String(row.reservedMatterKind),
    counselReviewRequired: row.counselReviewRequired,
    authorityNoticeRequired: row.authorityNoticeRequired,
    principalConsentRecordedAt: row.principalConsentRecordedAt,
    counselReviewRecordedAt: row.counselReviewRecordedAt,
    authorityNoticeRecordedAt: row.authorityNoticeRecordedAt,
  });
  if (missing !== null) {
    return (
      `approval_request ${JSON.stringify(approvalRequestId)}: the BR-1102 approval chain is ` +
      `incomplete — ${missing} is not recorded. A reserved matter cannot execute without written ` +
      `principal approval, counsel review and the Authority notice where required (§10 §9)`
    );
  }
  return null;
}

/** Refuses any `data` payload that would touch a Shart column. See the module header (D-3). */
function assertNoShartWrite(data: unknown, where: string): void {
  if (typeof data !== 'object' || data === null) return;
  const touched = SHART_COLUMNS.filter((column) => column in (data as Record<string, unknown>));
  if (touched.length === 0) return;
  throw new ShartAmendmentForbiddenError(
    `${where}: the Shart al-Waqif is immutable and cannot be amended, regardless of approvals ` +
      `(Binding rule 1; user decision 2026-07-27). Offending column(s): ${touched.join(', ')}. ` +
      `withReservedMatter() opens the OTHER reserved-matter columns; it does not and will never ` +
      `open these, and qmulate_shart_guard() refuses them from raw SQL too.`,
  );
}

/**
 * A transaction facade that refuses a Shart write before it reaches Postgres.
 *
 * Belt and braces: the trigger would refuse it anyway, and refusing here as well means the
 * transaction is never opened for a write that cannot succeed — so an audit event is never written
 * and rolled back, and the caller gets a domain error instead of a SQLSTATE.
 *
 * ⚠ IT SEALS TIER 1 ONLY. {@link DEED_TERM_WRITE_ONCE_COLUMNS} (tier 3) are deliberately NOT sealed
 * here — a payload cannot distinguish the permitted first write from a refused second, so the rule
 * belongs in the trigger that can see the old row. See that constant's doc comment.
 */
function shartSealedFacade(tx: ExtendedPrismaClient): ExtendedPrismaClient {
  const facade = new Proxy(tx as unknown as Record<string, unknown>, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property !== 'waqf') {
        return typeof value === 'function'
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      }
      // Only the `waqf` delegate carries Shart columns, so only it is wrapped.
      return new Proxy(value as Record<string, unknown>, {
        get(delegate, operation) {
          const fn = Reflect.get(delegate, operation, delegate);
          if (typeof fn !== 'function' || typeof operation !== 'string') return fn;
          return (...args: unknown[]) => {
            const argument = args[0];
            if (typeof argument === 'object' && argument !== null) {
              const shaped = argument as { data?: unknown; create?: unknown; update?: unknown };
              assertNoShartWrite(shaped.data, `waqf.${operation}`);
              assertNoShartWrite(shaped.create, `waqf.${operation} (create branch)`);
              assertNoShartWrite(shaped.update, `waqf.${operation} (update branch)`);
            }
            return (fn as (...a: unknown[]) => unknown).apply(delegate, args);
          };
        },
      });
    },
  });
  return facade as unknown as ExtendedPrismaClient;
}

/**
 * Run `fn` with a VERIFIED reserved-matter approval in force for `waqfId`.
 *
 * ```ts
 * await withReservedMatter(db, ctx, approvalRequestId, 'waqf-001', async (tx) => {
 *   await tx.waqf.update({ where: { id: 'waqf-001' }, data: { certificateNumber: 'FAKE-2000002' } });
 * });
 * ```
 *
 * The sequence, and why it is this way round:
 *
 *  1. **Load and verify the `ApprovalRequest` BEFORE opening the transaction.** A refusal therefore
 *     costs nothing and writes nothing — not even a rolled-back audit event.
 *  2. **Open one audited transaction** (`withAudit`), so the reserved-matter write and its
 *     `audit_event` commit together or not at all.
 *  3. **Set the GUC transaction-locally** (`set_config(..., true)`). Transaction-local is the whole
 *     point: the value evaporates on COMMIT or ROLLBACK, so a pooled connection cannot carry one
 *     request's approval into the next request's write.
 *  4. **Stamp `reservedMatterApprovalId` on the context**, so the audit extension records WHICH
 *     approval opened the door (`audit_event.context.reservedMatterApprovalId`). An authority-gated
 *     write whose authority is not in the trail is not auditable.
 *  5. **Seal the Shart columns** — see the module header.
 *
 * @param db     an extended client built by `createPrismaClient(ctx)`, or nothing if `ctx` is given
 * @param ctx    the acting context; a COPY carrying `reservedMatterApprovalId` is used internally
 * @param waqfId the endowment the approval must belong to. NOT optional and NOT inferred: an
 *               approval is per endowment, and inferring the target from the write would let an
 *               approval for endowment A unlock a column on endowment B.
 */
export async function withReservedMatter<T>(
  db: ExtendedPrismaClient,
  ctx: RequestContext,
  approvalRequestId: string,
  waqfId: string,
  fn: (tx: ExtendedPrismaClient) => Promise<T>,
  options: AuditTransactionOptions = {},
): Promise<T> {
  if (!isRequestContext(ctx)) {
    throw new ReservedMatterNotApprovedError(
      'withReservedMatter: a RequestContext is required — the approval is recorded against an actor, ' +
        'and an unattributed reserved matter is not a reserved matter.',
    );
  }
  if (typeof approvalRequestId !== 'string' || approvalRequestId.trim() === '') {
    throw new ReservedMatterNotApprovedError(
      'withReservedMatter: an empty approval id would leave the reserved-matter guard engaged and ' +
        'is refused before anything is loaded.',
    );
  }
  if (typeof waqfId !== 'string' || waqfId.trim() === '') {
    throw new ReservedMatterNotApprovedError(
      'withReservedMatter: waqfId is required — an approval is per endowment (§10 principle 2).',
    );
  }

  // Read through the caller's own client, so the scoping force-filter applies: a caller with no
  // grant on this endowment cannot even see the approval, let alone use it. A `null` here is
  // therefore either "does not exist" or "not yours", and both are refusals.
  const row = (await db.approvalRequest.findFirst({
    where: { id: approvalRequestId },
    select: {
      id: true,
      type: true,
      status: true,
      waqfId: true,
      makerId: true,
      checkerId: true,
      deletedAt: true,
      reservedMatterKind: true,
      counselReviewRequired: true,
      authorityNoticeRequired: true,
      principalConsentRecordedAt: true,
      counselReviewRecordedAt: true,
      authorityNoticeRecordedAt: true,
    },
  })) as ApprovalRow | null;

  // Migration 54: ask the database whether THIS checker is the fixture-only exempt user, so the
  // pre-check agrees with the CHECK constraint rather than refusing a row it would accept.
  const selfApprovalExempt =
    row !== null && row.checkerId !== null && row.checkerId === row.makerId
      ? await isSelfApprovalExempt(db, row.checkerId)
      : false;
  const defect = reservedMatterDefect(approvalRequestId, waqfId, row, selfApprovalExempt);
  if (defect !== null) {
    throw new ReservedMatterNotApprovedError(
      `withReservedMatter refused: ${defect}. A reserved-matter column may only be amended against ` +
        `an APPROVED, maker <> checker RESERVED_MATTER approval for THIS endowment (Binding rule 1).`,
    );
  }

  const stamped: RequestContext = { ...ctx, reservedMatterApprovalId: approvalRequestId };

  return withAudit(
    createPrismaClient(stamped),
    async (tx) => {
      await setReservedMatterApproval(tx, approvalRequestId);
      return fn(shartSealedFacade(tx));
    },
    options,
  );
}
