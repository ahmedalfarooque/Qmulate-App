/**
 * `reservedMatter` + `asset` — E3's RESERVED-MATTER SKELETON (BR-306, BR-1102).
 *
 * "Mark an action reserved → block until approved", plus BR-306's four asset acts. The FULL chain
 * (principal consent, counsel review, Authority approval/notice) is E11's; what S4 owes is that the
 * act is RECORDED as reserved, that nothing changes until a genuine approval exists, and that the
 * steps which are NOT recorded are NAMED rather than implied.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ONE MINTING PATH, NOT TWO
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every `ApprovalRequest` this package creates goes through {@link mintApprovalRequest}, which
 * `root.ts`'s `approval.initiate` also calls. A second minting path is the shape of the bug this
 * whole area is about: the approver would sign one canonical form and the executor verify another, and
 * the mismatch would look like staleness rather than like a broken comparison. `approvalFingerprint`
 * is `@qmulate/database`'s ONE implementation and nothing here re-hashes a payload.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `subjectId` IS NOT OPTIONAL, AND THE INDEX IS WHY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `approval_request_one_open_per_subject` is a PARTIAL UNIQUE INDEX on
 * `(waqfId, type, COALESCE("subjectId", ''))` over the NON-TERMINAL statuses. Leaving `subjectId` null
 * therefore means "at most one open request of this TYPE on this endowment" — which sounds strict and
 * is the wrong strictness: it collides unrelated acts while allowing the thing it should forbid.
 * With a subject, two simultaneously-valid approvals for ONE act are impossible, and "the approval for
 * this act" is never ambiguous. Two simultaneously-valid approvals for one act is a second authority
 * by arithmetic (MP-31).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ CORRECTION TO THE E3 BRIEF, MEASURED: THE SUBJECT-BLIND DOOR IS ALREADY CLOSED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The brief (and `src/routers/settings.ts`'s header, which is now stale) says
 * `qmulate_reserved_matter_defect(approval, waqfId)` "accepts ANY approved RESERVED_MATTER on the
 * endowment as the key to ANY reserved-matter column and never compares `subjectId`", and that "an
 * approved istibdal is already a valid key for a deedNumber change".
 *
 * **That was closed in migration `00000000000004_e2_guard_gaps`, not in S4.** The two-argument overload
 * was DROPPED (`DROP FUNCTION IF EXISTS qmulate_reserved_matter_defect(text, text)` — deliberately,
 * "so the next guard to be written cannot reach for the shorter signature"), and the surviving
 * three-argument form compares `r."subjectId"` against `p_subject_id`, returning "…was approved for
 * subject %L, not %L — an approval binds to its artifact, and one approved act is not a licence for
 * another". `qmulate_asset_identity_guard()` calls it with `'asset:'||id||':status'` and
 * `qmulate_shart_guard()` with `'waqf:'||id||':'||column`.
 *
 * What S4 adds is the layer ABOVE it: `reservedMatterKind` now says WHAT an approval authorises, and
 * {@link assetRouter.executeReservedAct} refuses an approval whose kind names a different act — a check
 * the database cannot make, because `asset.status` is free text and the enum lives in Prisma.
 * ⚠ `packages/api/src/routers/settings.ts`'s header still records the old (closed) gap and is NOT
 * this owner's file; reported for correction.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ ISTIBDAL PROCEEDS ARE CORPUS (aṣl / أصل). NOTHING HERE WRITES A RECEIPT.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * {@link assetRouter.executeReservedAct} records the RESERVED ACT and moves `asset.status`. It creates
 * no `Transaction` and no receipt of any kind. Sale and istibdal proceeds are corpus, not income
 * (Binding rule 1); the ledger path is E5's, and a capital receipt stays blocked from the distribution
 * waterfall by `Transaction.receiptClass` and its CHECKs.
 */

import { z } from 'zod';

import {
  approvalFingerprint,
  recordEvent,
  serializeForAudit,
  withReservedMatter,
  type ExtendedPrismaClient,
} from '@qmulate/database';
import {
  DomainError,
  missingReservedMatterChainSteps,
  reservedMatterChainState,
  routeReservedMatter,
  type ReservedMatterChainRow,
  type ReservedMatterChainStep,
} from '@qmulate/domain';
import { toHijriSnapshot } from '@qmulate/domain/dates';

import { ApiError, isDatabaseGuardRefusal } from '../errors.js';
import { toActorContext, type TrpcContext } from '../context.js';
import { approveOnApprovalPlane } from '../middleware/approval-plane.js';
import { auditedTx, auditedWrite } from '../middleware/audit-projection.js';
import { resolveScope, type ScopedContext } from '../middleware/scope.js';
import {
  ROLE_KEYS,
  ROLE_PRESETS,
  hasPermission,
  type PermissionString,
  type RoleKey,
} from '../permissions.js';
import { createSettingResolver } from '../settings.js';
import { checkerProcedure, endowmentScopedProcedure, makerProcedure, router } from '../trpc.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Vocabulary
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `ReservedMatterKind` (migration 12). BR-306's four asset acts plus the reserved matters CLAUDE.md
 * names. Before this enum, an `ApprovalRequest` of type `RESERVED_MATTER` did not say what act it
 * authorised at all.
 */
export const RESERVED_MATTER_KINDS = [
  'ASSET_DISPOSAL',
  'ASSET_SUBSTITUTION_ISTIBDAL',
  'ASSET_PLEDGE',
  'ASSET_LONG_LEASE',
  'DEED_IDENTITY',
  'DEED_TERM_RECORD',
  'ACCESS_MATRIX_CHANGE',
  /**
   * ⊕ Product owner, 2026-08-18 (S4 memo Q-E5-1(b)): correcting a receipt's income-vs-capital
   * classification is a reserved matter — in BOTH directions, every time.
   *
   * ⚠ IT HAS ITS OWN KIND BECAUSE THE KIND IS COMPARED, NOT MERELY RECORDED. Borrowing one of the
   * seven above would produce a MISLABELLED authority, which is worse than an unlabelled one: an
   * approved istibdal would then pass the comparison and open a receipt reclassification.
   * ⚠ Unlike the four asset acts, this kind is NOT spent through `asset.executeReservedAct` — the
   * subject is a `transaction`, not an `asset`, so `finance.receiptClass.executeCorrection` is its
   * only executor and compares this kind itself.
   */
  'RECEIPT_CLASS_CORRECTION',
  /**
   * ⊕ Product owner, 2026-08-25 (S8 addendum, FOURTH batch — *"Allow return, reserved-matter-gated"*,
   * recorded as ⚠ OVERRULING the orchestrator's recommendation): an erroneous real classification
   * may return to `NOT_CLASSIFIED` via a maker≠checker reserved-matter approval, and *"the default
   * refusal stands for the ungated path"*.
   *
   * ⚠ THE LONG NAME IS THE POINT, for the same reason `RECEIPT_CLASS_CORRECTION` has its own kind.
   * The short form `CLASSIFICATION_CORRECTION` would be a MISLABELLED authority: an ORDINARY
   * re-classification (MEDIUM → LARGE) is a plain maker act and is NOT gated — only the return to
   * the ABSENCE of a determination is. A kind reading as authority over "classification" would let
   * an approval minted for the ungated act be spent on the gated one.
   * ⚠ Like `RECEIPT_CLASS_CORRECTION`, and unlike the four asset acts, this kind is NOT spent
   * through `asset.executeReservedAct`: its subject is a `waqf`, so
   * `classification.returnToNotClassified` is its only executor and compares this kind itself.
   */
  'CLASSIFICATION_RETURN_TO_NOT_CLASSIFIED',
] as const;

export type ReservedMatterKind = (typeof RESERVED_MATTER_KINDS)[number];

const reservedMatterKindInput = z.enum(RESERVED_MATTER_KINDS);

/** BR-306's four acts, as a caller names them. */
export const ASSET_RESERVED_ACTS = [
  'DISPOSAL',
  'SUBSTITUTION_ISTIBDAL',
  'PLEDGE',
  'LONG_LEASE',
] as const;

export type AssetReservedAct = (typeof ASSET_RESERVED_ACTS)[number];

/** act → the reserved-matter kind an approval must carry. */
export const ACT_TO_RESERVED_MATTER_KIND: Readonly<Record<AssetReservedAct, ReservedMatterKind>> = {
  DISPOSAL: 'ASSET_DISPOSAL',
  SUBSTITUTION_ISTIBDAL: 'ASSET_SUBSTITUTION_ISTIBDAL',
  PLEDGE: 'ASSET_PLEDGE',
  LONG_LEASE: 'ASSET_LONG_LEASE',
};

/* ─────────────────────────────────────────────────────────────────────────────────────────────
 * `AssetStatus` — THE CLOSED VOCABULARY (product owner, 2026-08-16 · D-A · V-E3-02)
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * The owner named the list: *"Active, Fully Occupied/Rented, partially rented, vacant,
 * expropriated/substituted."* Migration 13 makes it a native Postgres enum, so an unrecognised
 * spelling is refused at TYPE PARSE (SQLSTATE 22P02) before any trigger runs, and
 * `qmulate_asset_identity_guard()` partitions the six members into RESERVED and ORDINARY and RAISES
 * on a member in neither (ADR-0004: an unrecognised status HALTS, never falls through to "not
 * disposable").
 *
 * ⚠ WHAT THIS REPLACED, AND WHY THE REPLACEMENT IS NOT A LONGER LIST. `asset.status` was free text
 * with no CHECK, and BR-306's gate was an allow-list of TWELVE lower-cased Latin spellings
 * (`disposed, disposal, sold, sale, substituted, istibdal, substitution, pledged, pledge, mortgaged,
 * long_leased, long_lease`). Any other spelling — **including the Arabic one, and Arabic is
 * authoritative (NFR-01)** — committed a disposal with no reserved-matter approval. A thirteenth
 * spelling would have had the identical defect; a closed type has no thirteenth spelling.
 * ───────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Every value `asset.status` can hold — the `"AssetStatus"` enum, member for member.
 *
 * Spelled here rather than imported from the generated Prisma client for the same reason
 * `WaqfClassification` is: this package's UNIT suite runs with no generated client at all. The copy
 * is compared against `schema.prisma` and against the LIVE `pg_proc` definition of the guard by
 * `test/reserved-matter-surface.test.ts` and `test/asset-status-vocabulary.integration.test.ts`.
 */
export const ASSET_STATUSES = [
  'ACTIVE',
  'FULLY_RENTED',
  'PARTIALLY_RENTED',
  'VACANT',
  'EXPROPRIATED',
  'SUBSTITUTED_ISTIBDAL',
] as const;

export type AssetStatus = (typeof ASSET_STATUSES)[number];

/**
 * The RESERVED half: a move INTO one of these is a BR-306 reserved matter and needs an APPROVED,
 * maker ≠ checker, subject-bound `RESERVED_MATTER` approval before the state changes.
 *
 * These are the two ways corpus leaves an endowment — a government taking, and the Nazir's own
 * substitution. ⚠ Proceeds of either are CORPUS (aṣl): recording the act writes no receipt, and any
 * proceeds must be entered as `receiptClass = CAPITAL`, which the distribution waterfall excludes by
 * construction (Binding rule 1).
 */
export const RESERVED_ASSET_STATUSES = ['EXPROPRIATED', 'SUBSTITUTED_ISTIBDAL'] as const;

/** The ORDINARY half: occupancy states. Moving between them is property management, not governance. */
export const ORDINARY_ASSET_STATUSES = [
  'ACTIVE',
  'FULLY_RENTED',
  'PARTIALLY_RENTED',
  'VACANT',
] as const;

/**
 * Narrows an arbitrary value to the closed vocabulary. **Total, and fails closed** — an unknown
 * status is `false`, never "probably ordinary".
 */
export function isAssetStatus(value: unknown): value is AssetStatus {
  return typeof value === 'string' && (ASSET_STATUSES as readonly string[]).includes(value);
}

/**
 * act → the `AssetStatus` the act moves the row to, or **`null` when D-A left the act's end state
 * UNREPRESENTABLE.**
 *
 * ⚠ THREE OF THE FOUR ACTS NOW HAVE NOWHERE TO LAND, AND THAT IS THE OWNER'S DECISION, NOT A GAP.
 * `sold`, `pledged`, `mortgaged` and `long_leased` are gone from the vocabulary — *"stricter than
 * today, and coherent with waqf perpetuity. That is intended."* So `DISPOSAL`, `PLEDGE` and
 * `LONG_LEASE` map to `null`: the API can neither mint an approval for them nor execute one, and
 * both procedures refuse BY NAME ({@link assetEndStateUnrepresentable}).
 *
 * ⚠ THE ACTS AND THEIR `ReservedMatterKind`s ARE NOT DELETED — ADR-0004's rule is REFUSE, DO NOT
 * REMAP. `ASSET_DISPOSAL` / `ASSET_PLEDGE` / `ASSET_LONG_LEASE` remain in the enum, so an approval
 * already minted under one of them stays readable and refuses at execution rather than silently
 * becoming a substitution. Remapping any of them onto `SUBSTITUTED_ISTIBDAL` would record an
 * istibdal the Nazir never approved.
 *
 * TODO(surface): D-A made three of BR-306's four asset acts unperformable, and gave `EXPROPRIATED`
 * no act at all (there is no `ASSET_EXPROPRIATION` in `ReservedMatterKind`, and inventing one is an
 * authority-model change — ADR-0004 territory). Should `ASSET_DISPOSAL` / `ASSET_PLEDGE` /
 * `ASSET_LONG_LEASE` be retired as acts, and should an expropriation be recordable through this
 * router at all? S4 refuses rather than deciding it in either direction.
 */
export const ACT_TO_ASSET_STATUS: Readonly<Record<AssetReservedAct, AssetStatus | null>> = {
  DISPOSAL: null,
  SUBSTITUTION_ISTIBDAL: 'SUBSTITUTED_ISTIBDAL',
  PLEDGE: null,
  LONG_LEASE: null,
};

/**
 * The statuses `qmulate_asset_identity_guard()` treats as a reserved matter — its
 * `reserved_statuses "AssetStatus"[]` array (migration 13 §1).
 *
 * Restated here ONLY so {@link ACT_TO_ASSET_STATUS} can be checked against it. It is not a second
 * source of truth, and two tests keep it honest from both ends:
 *  · `test/reserved-matter-surface.test.ts` parses the NEWEST migration that defines the function —
 *    found by scanning the migrations directory, never by a hardcoded path. ⚠ THE HARDCODED PATH IS
 *    EXACTLY HOW THIS CHECK WENT SILENTLY VACUOUS: it pointed at migration 12 while migration 13 had
 *    already replaced the function body, so the API was compared against a definition that no longer
 *    existed in any database — ADR-0008 §2.4's failure mode, a claim read rather than measured.
 *  · `test/asset-status-vocabulary.integration.test.ts` reads the LIVE `pg_proc.prosrc` of the
 *    installed function. That one cannot be stale by construction.
 */
export const DATABASE_GATED_ASSET_STATUSES: readonly string[] = [...RESERVED_ASSET_STATUSES];

/* Import-time self-checks. Each direction catches a different mistake. */
for (const [act, status] of Object.entries(ACT_TO_ASSET_STATUS)) {
  if (status === null) continue;
  if (!isAssetStatus(status)) {
    throw new Error(
      `asset act ${act} would move status to "${status}", which is not a member of AssetStatus. The ` +
        `column is a native Postgres enum since migration 13, so the write would fail at type parse ` +
        `(22P02) after an approval had already been spent. Fix the mapping.`,
    );
  }
  if (!DATABASE_GATED_ASSET_STATUSES.includes(status)) {
    throw new Error(
      `asset act ${act} would move status to "${status}", which qmulate_asset_identity_guard() does ` +
        `NOT treat as reserved. The API would then perform a disposal the database never treated as ` +
        `a reserved matter. Fix the mapping or the guard — never ship the pair disagreeing.`,
    );
  }
}

if (
  ASSET_STATUSES.some(
    (status) =>
      (RESERVED_ASSET_STATUSES as readonly string[]).includes(status) ===
      (ORDINARY_ASSET_STATUSES as readonly string[]).includes(status),
  )
) {
  throw new Error(
    `AssetStatus is not exhaustively partitioned into RESERVED and ORDINARY — a member is in both, ` +
      `or in neither. The SQL guard RAISES on a member in neither (ADR-0004), so an unpartitioned ` +
      `member would make every status change on that asset fail at run time instead of at boot. ` +
      `Classify it in exactly one of the two.`,
  );
}

/**
 * The permission {@link reservedMatterRouter.markReserved} demands, and the roles whose preset
 * confers it — **DERIVED FROM `ROLE_PRESETS`, never transcribed** (V-E3-M3 / D-D).
 *
 * A hand-written holder list in a docstring is how the router came to name `counsel` as a holder
 * after the owner had said counsel may not mark matters reserved. This one cannot drift: it is
 * computed at import from the same table `resolveGrantPermissions` intersects against, and
 * `test/reserved-matter-surface.test.ts` asserts `counsel` is absent from it AND that minting also
 * requires `approval:request:initiate`, which is the second reason counsel cannot reach this
 * procedure. Both directions matter — removing the verb without noticing the initiate requirement is
 * how "fixed" and "still broken" look identical.
 */
export const MARK_RESERVED_PERMISSION = 'legal:reserved_matter:write' satisfies PermissionString;

/** The verb minting an `ApprovalRequest` additionally needs — see {@link mintApprovalRequest}. */
export const MINT_APPROVAL_PERMISSION = 'approval:request:initiate' satisfies PermissionString;

/** Roles whose preset confers BOTH verbs, i.e. the roles that can actually reach `markReserved`. */
export const MARK_RESERVED_HOLDER_ROLES: readonly RoleKey[] = ROLE_KEYS.filter(
  (role) =>
    hasPermission(ROLE_PRESETS[role], MARK_RESERVED_PERMISSION) &&
    hasPermission(ROLE_PRESETS[role], MINT_APPROVAL_PERMISSION),
);

/** ⚠ unverified — 10 business days is not confirmed against primary Saudi law (Binding rule 3). */
export const ISTIBDAL_NOTICE_SETTING_KEY = 'deadline.ISTIBDAL_10BD.businessDays' as const;

/** The marker every regulatory figure this router returns must carry. */
export const UNVERIFIED_MARKER = '⚠ unverified — confirm against primary law' as const;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · Subject grammars — ONE definition each, and they must match the SQL guards
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The subject an asset-act approval must name.
 *
 * ⚠ IT IS `qmulate_asset_identity_guard()`'s STRING, not a convention of this file:
 * `'asset:' || OLD."id" || ':status'`. If the two ever disagree, `withReservedMatter()` sets a GUC the
 * trigger then rejects — a refusal at the last possible moment, inside a transaction, which is worse
 * than a refusal here.
 */
export function assetStatusSubjectId(assetId: string): string {
  return `asset:${assetId}:status`;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · THE ONE MINTING PATH
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Non-terminal statuses — the ones the partial unique index covers. */
const OPEN_STATUSES: readonly string[] = ['PENDING', 'APPROVED'];

export interface MintApprovalInput {
  readonly waqfId: string;
  readonly type:
    'BANK_MOVEMENT' | 'DISTRIBUTION_RUN' | 'GOVT_FILING' | 'LIBRARY_UPGRADE' | 'RESERVED_MATTER';
  readonly subjectId: string;
  readonly payload: Record<string, unknown>;
  /** Required for `RESERVED_MATTER`; refused for every other type. */
  readonly reservedMatterKind?: ReservedMatterKind;
  readonly counselReviewRequired?: boolean;
  readonly authorityNoticeRequired?: boolean;
  readonly procedure: string;
}

/**
 * Creates ONE `PENDING` `ApprovalRequest`. The only place this package mints one.
 *
 * The three invariants it holds, none of them optional:
 *  1. **`makerId` is the ACTING identity**, from the session, never an input. A caller-supplied maker
 *     would let the maker nominate somebody else and walk straight through maker ≠ checker.
 *  2. **`payloadHash` is `approvalFingerprint(payload)`** — `@qmulate/database`'s single
 *     implementation, built on its own `canonicalJson` + `computeHash`. `canonicalJson` THROWS on a JS
 *     `number`, which is what keeps a float out of the hash the approver will sign.
 *  3. **`reservedMatterKind` may appear ONLY on a `RESERVED_MATTER`**, which is exactly the CHECK
 *     migration 12 installed (`reservedMatterKind IS NULL OR type = 'RESERVED_MATTER'`).
 *
 * ⚠ THE CONVERSE IS **NOT** ENFORCED, AND THE REASON IS MEASURED RATHER THAN AN OVERSIGHT. The
 * biconditional the column wants — `("type" = 'RESERVED_MATTER') = ("reservedMatterKind" IS NOT NULL)`
 * — is still owed, and this function cannot land it: `ApprovalType` has no `SETTING_CHANGE` member, so
 * `src/routers/settings.ts` pins `SETTING_CHANGE_APPROVAL_TYPE = 'RESERVED_MATTER'` for every routine
 * fee-basis change, and `ReservedMatterKind` has no member that honestly describes one. Demanding a
 * kind for every reserved matter would therefore either break the shipped `settings.set` path
 * (`test/setting-resolver.integration.test.ts` raises exactly such a row through `approval.initiate`)
 * or force a WRONG kind onto it — and a mislabelled authority is worse than an unlabelled one, because
 * `executeReservedAct` compares the label. So a kindless `RESERVED_MATTER` stays representable, the
 * ACT paths below always set one, and the gap is reported rather than papered over.
 * ⚠ REPORTED AS OWED: `ApprovalType` wants a `SETTING_CHANGE` member; then the biconditional CHECK and
 * a mandatory kind become landable in one coordinated change.
 *
 * ⚠ `payload` IS DELIBERATELY NOT PROJECTED INTO THE AUDIT EVENT. The `create` selects the request's
 * IDENTITY and the hash that binds it, and NOT the payload, which may carry beneficiary detail and
 * would then sit in an append-only table for ≥ 10 years. A `create` may project — it has no pre-image,
 * so no diff can be falsified (C-08).
 */
export async function mintApprovalRequest(
  ctx: TrpcContext & { readonly waqfId: string },
  input: MintApprovalInput,
): Promise<{
  readonly approvalRequestId: string;
  readonly status: 'PENDING';
  readonly payloadHash: string;
}> {
  /**
   * ⊕ S10-3a — THE OWNER'S "NEVER MAKER ACTS" BOUND, AS A GUARD SOMEONE CAN POINT AT.
   *
   * The service-seat ruling (2026-08-27, S9 third batch) says the seat's writes are audited as
   * SYSTEM-actor acts and **"never maker acts: the seat can approve nothing"**. Recon for S10-1
   * found that the procedure LADDER does not deliver that: `requestLibraryUpgrade` is
   * `makerProcedure('compliance:task:write')` — the EXACT permission the seat is enumerated with —
   * and it reaches this function, which stamps `makerId`. `makerProcedure` is only
   * `endowmentScopedProcedure(write-verb)`; it is the WRITE ladder, not the approval ladder.
   *
   * ⚠ SOMETHING DID refuse it — `scoping.ts`'s `ApprovalRequest` table gate, which demands an
   * approval-module permission the seat does not hold. But that is a refusal three layers down
   * whose own comment says it merely keeps out a caller with no approval permission AT ALL: it
   * catches the seat by consequence, not by intent, and it would stop catching it the moment
   * anyone gave the seat an approval verb for an unrelated reason.
   *
   * ⚠ AND IT IS PUT HERE RATHER THAN ON ONE ROUTER DELIBERATELY. The orchestrator asked for a bar
   * on `requestLibraryUpgrade`; there are at least eight call sites that mint an approval
   * (`root.ts`, `reservedMatter.ts` ×3, `finance.ts` ×2, `distribution.ts`, `filing.ts`,
   * `compliance.ts`), and a per-router bar would protect the one we happened to notice. A bound
   * the owner stated about an IDENTITY belongs where the identity is stamped.
   *
   * Reading `actorType` is sound HERE and would not be in a database trigger — migration 9's
   * *"actorType is deliberately NOT consulted: it is a value in a row the caller writes"* is about
   * SQL, where the value arrives as data. At this layer it is set by the context factory, which
   * pins `'USER'` for every HTTP request (`context.ts`) and is unreachable from the wire.
   */
  if (ctx.actor.actorType !== 'USER') {
    throw new ApiError(
      'PERMISSION_DENIED',
      `a ${String(ctx.actor.actorType)} actor may not mint an approval request. An approval names ` +
        `a MAKER, and a non-human seat that becomes a maker is one grant away from being a party ` +
        `to the maker-checker control it exists outside of (owner ruling 2026-08-27: the seat's ` +
        `writes are "never maker acts — the seat can approve nothing"). A scheduled job that needs ` +
        `an approval is a job whose work needs a human to raise it.`,
      { waqfId: input.waqfId, type: input.type, actorType: String(ctx.actor.actorType) },
    );
  }

  if (input.type !== 'RESERVED_MATTER' && input.reservedMatterKind !== undefined) {
    throw new ApiError(
      'PERMISSION_DENIED',
      `reservedMatterKind may only appear on a RESERVED_MATTER request (got ${input.type}). The ` +
        `database CHECK says the same thing; refusing here means nothing is written and rolled back.`,
      { waqfId: input.waqfId, type: input.type },
    );
  }

  // ── ONE OPEN REQUEST PER SUBJECT, CHECKED BEFORE THE INSERT ────────────────────────────────
  // `approval_request_one_open_per_subject` is the deciding side; this pre-check exists so the caller
  // gets a reason instead of a unique-violation, and so nothing is written and rolled back.
  const open = await ctx.db.approvalRequest.findFirst({
    where: {
      waqfId: input.waqfId,
      type: input.type as never,
      subjectId: input.subjectId,
      status: { in: OPEN_STATUSES as never },
    },
    select: { id: true, status: true },
  });
  if (open !== null) {
    throw new ApiError(
      'APPROVAL_STALE',
      `ALREADY_OPEN: approval_request ${open.id} is already ${open.status} for subject ` +
        `${JSON.stringify(input.subjectId)} on waqf ${input.waqfId}. Two simultaneously-valid ` +
        `approvals for one act is a second authority by arithmetic (MP-31) — decide or void the open ` +
        `one first.`,
      { approvalRequestId: open.id, reason: 'ALREADY_OPEN', subjectId: input.subjectId },
    );
  }

  // `serializeForAudit` first: `canonicalJson` refuses a JS number, and an all-strings tree survives a
  // `jsonb` round-trip byte-identically, so the hash recomputed from the STORED payload still matches.
  const payload = serializeForAudit(input.payload) as Record<string, unknown>;
  const payloadHash = approvalFingerprint(payload);

  return auditedWrite(ctx.db, async (tx) => {
    const created = await tx.approvalRequest.create({
      data: {
        waqfId: input.waqfId,
        type: input.type as never,
        ...(input.reservedMatterKind !== undefined
          ? { reservedMatterKind: input.reservedMatterKind as never }
          : {}),
        status: 'PENDING',
        makerId: ctx.actor.actorId ?? '',
        subjectId: input.subjectId,
        payload,
        payloadHash,
        // ⊕ S12-2 · owner ruling 2026-09-08, verbatim "every matter": a KINDED reserved matter always
        // requires counsel review. The caller's flag is honoured only on a kindless row; the database
        // refuses a kinded row with `false` (CHECK approval_request_kinded_requires_counsel_review).
        counselReviewRequired:
          input.reservedMatterKind !== undefined ? true : (input.counselReviewRequired ?? false),
        authorityNoticeRequired: input.authorityNoticeRequired ?? false,
        createdBy: ctx.actor.actorId,
      },
      select: {
        id: true,
        status: true,
        type: true,
        reservedMatterKind: true,
        waqfId: true,
        makerId: true,
        subjectId: true,
        payloadHash: true,
        createdBy: true,
        counselReviewRequired: true,
        authorityNoticeRequired: true,
      },
    });

    // ⊕ S12-2 · BR-1103 RACI ROUTING. A kinded matter is announced to the seats DUE at each unrecorded
    // step — the Principal's board seat, counsel, the compliance function for the Authority notice —
    // in the SAME transaction as the mint, so a matter is never raised without being routed.
    if (created.reservedMatterKind !== null) {
      await routeReservedMatterNotifications(tx, ctx.waqfId, {
        approvalRequestId: created.id,
        reservedMatterKind: String(created.reservedMatterKind),
        subjectId: created.subjectId,
        counselReviewRequired: created.counselReviewRequired,
        authorityNoticeRequired: created.authorityNoticeRequired,
        principalConsentRecordedAt: null,
        counselReviewRecordedAt: null,
        authorityNoticeRecordedAt: null,
      });
    }

    return {
      approvalRequestId: created.id,
      status: 'PENDING' as const,
      payloadHash,
    };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4b · S12-2 — RACI routing (BR-1103) and the chain-step recorder (BR-1102)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** `Notification.kind` values this router emits. Strings, like `deadline.reminder`. */
export const RESERVED_MATTER_NOTIFICATION_KINDS = {
  stepDue: 'reserved_matter.step_due',
  signReady: 'reserved_matter.sign_ready',
} as const;

/**
 * The Prisma `Role` spelling of a domain role key. The ONE difference is `admin` ↔ `SYSTEM_ADMIN`
 * (ADR-0004); `@qmulate/auth`'s parity test pins the enum, so this stays a one-liner.
 */
function dbRoleOf(roleKey: string): string {
  return roleKey === 'admin' ? 'SYSTEM_ADMIN' : roleKey.toUpperCase();
}

async function recipientsForRoles(
  db: ExtendedPrismaClient,
  waqfId: string,
  roleKeys: readonly string[],
): Promise<string[]> {
  if (roleKeys.length === 0) return [];
  const grants = await db.waqfAccessGrant.findMany({
    where: {
      waqfId,
      role: { in: roleKeys.map(dbRoleOf) as never },
      revokedAt: null,
      deletedAt: null,
    },
    select: { userId: true },
  });
  return [...new Set(grants.map((grant) => grant.userId))].sort();
}

/**
 * Write one `Notification` per (route, recipient) for a matter's CURRENT position in the chain —
 * every unrecorded step at once (the letters arrive in any order), or the sign when complete.
 * Returns what was written so the caller's audit event can name it. Runs inside the caller's
 * transaction; `Notification` is unaudited by design (S9), so nothing here touches the trail.
 */
async function routeReservedMatterNotifications(
  tx: ExtendedPrismaClient,
  waqfId: string,
  matter: ReservedMatterChainRow & {
    readonly approvalRequestId: string;
    readonly subjectId: string | null;
  },
): Promise<{ readonly step: string; readonly recipients: readonly string[] }[]> {
  const routed: { step: string; recipients: string[] }[] = [];
  for (const route of routeReservedMatter(matter)) {
    const recipients = await recipientsForRoles(tx, waqfId, route.notifyRoles);
    for (const userId of recipients) {
      await tx.notification.create({
        data: {
          userId,
          waqfId,
          kind:
            route.step === 'NAZIR_SIGN'
              ? RESERVED_MATTER_NOTIFICATION_KINDS.signReady
              : RESERVED_MATTER_NOTIFICATION_KINDS.stepDue,
          payload: {
            approvalRequestId: matter.approvalRequestId,
            reservedMatterKind: matter.reservedMatterKind,
            subjectId: matter.subjectId,
            step: route.step,
            party: route.party,
            idempotencyKey: `reserved-matter:${matter.approvalRequestId}:${route.step}:${userId}`,
          },
        },
      });
    }
    routed.push({ step: route.step, recipients });
  }
  return routed;
}

/** The columns a chain-step recording reads and writes. */
const CHAIN_ROW_SELECT = {
  id: true,
  type: true,
  status: true,
  reservedMatterKind: true,
  subjectId: true,
  counselReviewRequired: true,
  authorityNoticeRequired: true,
  authorityReference: true,
  principalConsentRecordedAt: true,
  counselReviewRecordedAt: true,
  authorityNoticeRecordedAt: true,
} as const;

const CHAIN_STEP_COLUMNS: Readonly<
  Record<
    ReservedMatterChainStep,
    { readonly at: string; readonly hijri: string; readonly by: string; readonly reference: string }
  >
> = {
  PRINCIPAL_CONSENT: {
    at: 'principalConsentRecordedAt',
    hijri: 'principalConsentRecordedAtHijri',
    by: 'principalConsentBy',
    reference: 'principalConsentReference',
  },
  COUNSEL_REVIEW: {
    at: 'counselReviewRecordedAt',
    hijri: 'counselReviewRecordedAtHijri',
    by: 'counselReviewBy',
    reference: 'counselReviewReference',
  },
  AUTHORITY_NOTICE: {
    at: 'authorityNoticeRecordedAt',
    hijri: 'authorityNoticeRecordedAtHijri',
    by: 'authorityNoticeBy',
    // The Authority step's reference IS `authorityReference` (migration 51 §2).
    reference: 'authorityReference',
  },
};

const recordChainStepInput = z.object({
  approvalRequestId: z.string().min(1).max(64),
  /** The letter's / review's / notice's own reference — required. A vault document may be attached too. */
  reference: z.string().min(1).max(256),
  /** A `Document.id` on THIS endowment, when the written instrument is in the vault. Validated. */
  documentId: z.string().min(1).max(64).optional(),
});

/**
 * ⊕ S12-2 · RECORD ONE STEP OF THE BR-1102 CHAIN (owner ruling 2026-09-08, verbatim "staff").
 *
 * A holder of `legal:reserved_matter:write` records that the written principal approval / the
 * counsel review / the Authority notice has been RECEIVED, against its reference. `…By` is the
 * acting identity, never an input. Refused before any write when: the request is not a kinded
 * RESERVED_MATTER on this endowment, it is not PENDING (a step recorded after the decision is a
 * fiction), the step is not required, the step is already recorded (write-once — the database
 * re-proves it, migration 51 block (0d)), or the attached document is not visible on this endowment.
 *
 * When the recording COMPLETES the chain, the Nazir's seats are notified that the sign is ready
 * (BR-1103); the recording and its audit event and those notifications commit together.
 */
async function recordChainStep(
  ctx: TrpcContext & {
    readonly waqfId: string;
    readonly actor: { readonly actorId: string | null };
  },
  step: ReservedMatterChainStep,
  input: z.infer<typeof recordChainStepInput>,
  procedure: string,
): Promise<{
  readonly approvalRequestId: string;
  readonly step: ReservedMatterChainStep;
  readonly recordedAt: string;
  readonly recordedAtHijri: string;
  readonly chain: ReturnType<typeof reservedMatterChainState>;
  readonly chainMissing: readonly ReservedMatterChainStep[];
  readonly signReady: boolean;
}> {
  const row = await ctx.db.approvalRequest.findFirst({
    where: { id: input.approvalRequestId, waqfId: ctx.waqfId },
    select: CHAIN_ROW_SELECT,
  });
  if (row === null) {
    throw new ApiError(
      'NO_GRANT',
      `approval_request ${input.approvalRequestId} is not visible on waqf ${ctx.waqfId}.`,
      { approvalRequestId: input.approvalRequestId, waqfId: ctx.waqfId },
    );
  }
  if (String(row.type) !== 'RESERVED_MATTER' || row.reservedMatterKind === null) {
    throw new ApiError(
      'APPROVAL_STALE',
      `NOT_A_KINDED_RESERVED_MATTER: approval_request ${row.id} is ${String(row.type)}` +
        `${row.reservedMatterKind === null ? ' with no reservedMatterKind' : ''}; only a kinded ` +
        `reserved matter carries the BR-1102 chain.`,
      { approvalRequestId: row.id, reason: 'NOT_A_KINDED_RESERVED_MATTER' },
    );
  }
  if (String(row.status) !== 'PENDING') {
    throw new ApiError(
      'APPROVAL_STALE',
      `NOT_OPEN: approval_request ${row.id} is ${String(row.status)}, not PENDING. A chain step is ` +
        `recorded BEFORE the decision it enables; recording one afterwards is a fiction.`,
      { approvalRequestId: row.id, reason: 'NOT_OPEN' },
    );
  }
  const before = reservedMatterChainState({
    ...row,
    reservedMatterKind: String(row.reservedMatterKind),
  });
  const stateKey =
    step === 'PRINCIPAL_CONSENT'
      ? 'principalConsent'
      : step === 'COUNSEL_REVIEW'
        ? 'counselReview'
        : 'authorityNotice';
  if (before[stateKey] === 'NOT_REQUIRED') {
    throw new ApiError(
      'APPROVAL_STALE',
      `STEP_NOT_REQUIRED: ${step} is not required on approval_request ${row.id}; recording it ` +
        `would attach an authority nobody asked for.`,
      { approvalRequestId: row.id, reason: 'STEP_NOT_REQUIRED', step },
    );
  }
  if (before[stateKey] === 'RECORDED') {
    throw new ApiError(
      'APPROVAL_STALE',
      `STEP_ALREADY_RECORDED: ${step} on approval_request ${row.id} is already recorded and is ` +
        `WRITE-ONCE. Retire the request (VOID) and raise a new one (§10 §4.3).`,
      { approvalRequestId: row.id, reason: 'STEP_ALREADY_RECORDED', step },
    );
  }
  if (input.documentId !== undefined) {
    const document = await ctx.db.document.findFirst({
      where: { id: input.documentId, waqfId: ctx.waqfId, deletedAt: null },
      select: { id: true },
    });
    if (document === null) {
      throw new ApiError(
        'APPROVAL_STALE',
        `REFERENCE_DOCUMENT_NOT_VISIBLE: document ${input.documentId} is not a live document on ` +
          `waqf ${ctx.waqfId}. A step rests on an instrument this endowment holds.`,
        {
          approvalRequestId: row.id,
          reason: 'REFERENCE_DOCUMENT_NOT_VISIBLE',
          documentId: input.documentId,
        },
      );
    }
  }

  const recordedAt = ctx.now;
  const recordedAtHijri = String(toHijriSnapshot(recordedAt));
  const columns = CHAIN_STEP_COLUMNS[step];
  const actorId = ctx.actor.actorId ?? '';

  try {
    return await auditedWrite(ctx.db, async (tx) => {
      // ⚠ NO `select` (C-08): the audit extension takes its POST-image from this operation's own
      // result, so a projection here would record every unselected column as "set to null".
      const updated = await tx.approvalRequest.update({
        where: { id: row.id },
        data: {
          [columns.at]: recordedAt,
          [columns.hijri]: recordedAtHijri,
          [columns.by]: actorId,
          [columns.reference]: input.reference,
        } as never,
      });
      const chain = reservedMatterChainState({
        ...updated,
        reservedMatterKind: String(updated.reservedMatterKind),
      });
      const chainMissing = missingReservedMatterChainSteps(chain);
      const signReady = chainMissing.length === 0;

      // BR-1103: when the LAST step lands, the sign is due — and it routes to the Nazir alone.
      const routed = signReady
        ? await routeReservedMatterNotifications(tx, ctx.waqfId, {
            approvalRequestId: updated.id,
            reservedMatterKind: String(updated.reservedMatterKind),
            subjectId: updated.subjectId,
            counselReviewRequired: updated.counselReviewRequired,
            authorityNoticeRequired: updated.authorityNoticeRequired,
            principalConsentRecordedAt: updated.principalConsentRecordedAt,
            counselReviewRecordedAt: updated.counselReviewRecordedAt,
            authorityNoticeRecordedAt: updated.authorityNoticeRecordedAt,
          })
        : [];

      await recordEvent(toActorContext(ctx, { procedure }), {
        action: 'UPDATE',
        category: 'APPROVAL',
        classification: 'SENSITIVE',
        entityType: 'ApprovalRequest',
        entityId: updated.id,
        waqfId: ctx.waqfId,
        extraContext: {
          chainStep: step,
          reference: input.reference,
          documentId: input.documentId ?? null,
          recordedAtHijri,
          reservedMatterKind: String(updated.reservedMatterKind),
          chainMissing,
          signReady,
          routed,
        },
      });

      return {
        approvalRequestId: updated.id,
        step,
        recordedAt: recordedAt.toISOString(),
        recordedAtHijri,
        chain,
        chainMissing,
        signReady,
      };
    });
  } catch (error) {
    if (isDatabaseGuardRefusal(error)) {
      // The write-once block (migration 51 (0d)) won a race the pre-check could not see.
      throw new ApiError(
        'APPROVAL_STALE',
        `STEP_ALREADY_RECORDED: ${step} on approval_request ${row.id} was recorded concurrently; ` +
          `the database refused the second recording (write-once).`,
        { approvalRequestId: row.id, reason: 'STEP_ALREADY_RECORDED', step, raisedBy: 'database' },
      );
    }
    throw error;
  }
}

function holdsVerb(ctx: ScopedContext, permission: PermissionString): boolean {
  try {
    resolveScope(ctx, ctx.waqfId, permission);
    return true;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The BR-1102 chain, reported HONESTLY
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export type ChainStepState = 'RECORDED' | 'NOT_RECORDED' | 'NOT_REQUIRED';

/**
 * The three chain steps BR-1102 names, read off what the model can actually record.
 *
 * ⚠ S4 SKELETON HONESTY, AND THIS IS THE WHOLE POINT OF THE FUNCTION. `ApprovalRequest` carries
 * `counselReviewRequired`, `authorityNoticeRequired` and `authorityReference` — and **no column for
 * principal consent at all**. So `principalConsent` is `NOT_RECORDED` unconditionally, and saying so is
 * strictly better than omitting the step and letting a screen imply the chain is complete. The full
 * chain is E11's; naming the gap is S4's.
 */
export function chainState(row: {
  reservedMatterKind: unknown;
  counselReviewRequired: boolean;
  authorityNoticeRequired: boolean;
  principalConsentRecordedAt: Date | string | null;
  counselReviewRecordedAt: Date | string | null;
  authorityNoticeRecordedAt: Date | string | null;
}): {
  readonly principalConsent: ChainStepState;
  readonly counselReview: ChainStepState;
  readonly authorityNotice: ChainStepState;
} {
  // ⊕ S12-2: the three steps are RECORDED FACTS now (migration 51), and the reading is the domain's.
  return reservedMatterChainState({
    reservedMatterKind: row.reservedMatterKind === null ? null : String(row.reservedMatterKind),
    counselReviewRequired: row.counselReviewRequired,
    authorityNoticeRequired: row.authorityNoticeRequired,
    principalConsentRecordedAt: row.principalConsentRecordedAt,
    counselReviewRecordedAt: row.counselReviewRecordedAt,
    authorityNoticeRecordedAt: row.authorityNoticeRecordedAt,
  });
}

/** The unrecorded-but-required steps, in chain order. ⊕ S12-2: a BLOCKER on the sign, not a flag. */
export function chainIncompleteSteps(
  state: ReturnType<typeof chainState>,
): readonly ReservedMatterChainStep[] {
  return missingReservedMatterChainSteps(state);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · `reservedMatter`
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const RESERVED_MATTER_SELECT = {
  id: true,
  type: true,
  reservedMatterKind: true,
  status: true,
  makerId: true,
  checkerId: true,
  subjectId: true,
  payload: true,
  payloadHash: true,
  counselReviewRequired: true,
  authorityNoticeRequired: true,
  authorityReference: true,
  decidedAt: true,
  decidedAtHijri: true,
  // S12-2 — the recorded chain (migration 51).
  principalConsentRecordedAt: true,
  principalConsentRecordedAtHijri: true,
  principalConsentBy: true,
  principalConsentReference: true,
  counselReviewRecordedAt: true,
  counselReviewRecordedAtHijri: true,
  counselReviewBy: true,
  counselReviewReference: true,
  authorityNoticeRecordedAt: true,
  authorityNoticeRecordedAtHijri: true,
  authorityNoticeBy: true,
} as const;

/** One recorded step, as the screen shows it. `null` until recorded. */
function recordedStep(
  at: Date | null,
  hijri: string | null,
  by: string | null,
  reference: string | null,
): {
  readonly at: string;
  readonly atHijri: string | null;
  readonly by: string | null;
  readonly reference: string | null;
} | null {
  return at === null ? null : { at: at.toISOString(), atHijri: hijri, by, reference };
}

export const reservedMatterRouter = router({
  /**
   * MARK AN ACTION RESERVED. Creates a `PENDING` request and changes nothing else.
   *
   * `blockedActions` is returned so a screen can say what is now blocked WITHOUT the client deriving
   * it — and the list is the honest one: this skeleton blocks the DATABASE-GATED writes, which is the
   * set the trigger enforces, not an aspirational list of everything a full workflow would hold.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * WHO MAY CALL THIS — DERIVED, NEVER WRITTEN DOWN (V-E3-M3 / D-D)
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * {@link MARK_RESERVED_HOLDER_ROLES} is computed from `@qmulate/domain`'s `ROLE_PRESETS` at import,
   * so this docstring cannot name a holder the preset table does not confer. **`counsel` is NOT in
   * it.** Asked directly on 2026-08-16 — *"Should counsel be able to mark a matter reserved?"* — the
   * product owner answered ***"no"*** (D-D), and `legal:reserved_matter:write` was removed from the
   * `counsel` preset. §9's reserved-matter chain already placed counsel at the **REVIEW** step, never
   * the initiation, and so does ADR-0005.
   *
   * ⚠ AND IT IS NOT TO BE REPAIRED FROM THE OTHER END. Minting a request also needs
   * `approval:request:initiate`, which counsel does not hold and must not be given: granting it would
   * answer "no" with a wider authority than the one that was refused. `counsel`'s participation in a
   * reserved matter is `counselReviewRequired` on the request — a chain STEP, recorded by whoever
   * raises the matter — and `chainState()` reports it as `NOT_RECORDED` because E3 has no column for
   * the review itself (E11 owns that).
   */
  markReserved: makerProcedure(MARK_RESERVED_PERMISSION)
    .input(
      z.object({
        kind: reservedMatterKindInput,
        subjectType: z.string().min(1).max(64),
        /** ⚠ MUST BE SET — see the file header on the partial unique index. */
        subjectId: z.string().min(1).max(128),
        justification: z.string().min(1).max(4096),
        authorityNoticeRequired: z.boolean(),
        counselReviewRequired: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const minted = await mintApprovalRequest(ctx, {
        waqfId: ctx.waqfId,
        type: 'RESERVED_MATTER',
        reservedMatterKind: input.kind,
        subjectId: input.subjectId,
        payload: {
          kind: 'reservedMatter.mark',
          reservedMatterKind: input.kind,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          justification: input.justification,
          waqfId: ctx.waqfId,
        },
        counselReviewRequired: input.counselReviewRequired,
        authorityNoticeRequired: input.authorityNoticeRequired,
        procedure: 'reservedMatter.markReserved',
      });

      return {
        approvalRequestId: minted.approvalRequestId,
        status: minted.status,
        reservedMatterKind: input.kind,
        subjectId: input.subjectId,
        payloadHash: minted.payloadHash,
        // The writes the DATABASE now refuses without this approval. Named, not inferred.
        blockedActions:
          input.kind === 'DEED_IDENTITY'
            ? ['waqf.certificateNumber', 'waqf.deedNumber']
            : input.kind.startsWith('ASSET_')
              ? ['asset.status', 'asset.titleDeedNumber']
              : [],
      };
    }),

  /** Every reserved matter on this endowment, with the BR-1102 chain state of each. */
  list: endowmentScopedProcedure('legal:reserved_matter:read')
    .input(
      z.object({
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXECUTED', 'VOID']).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.approvalRequest.findMany({
        where: {
          waqfId: ctx.waqfId,
          type: 'RESERVED_MATTER' as never,
          ...(input.status !== undefined ? { status: input.status as never } : {}),
        },
        select: RESERVED_MATTER_SELECT,
        orderBy: { id: 'asc' },
      });

      // ⊕ S12-2 — facts about the READER, carried separately from facts about the matter: which
      // chain acts THIS caller may take. The panel draws a form only where the answer is `true`.
      const writable = {
        recordStep: holdsVerb(ctx, 'legal:reserved_matter:write'),
        sign: holdsVerb(ctx, 'legal:reserved_matter:approve'),
      };

      return rows.map((row) => {
        const chain = chainState(row);
        return {
          approvalRequestId: row.id,
          // ⚠ NULL FOR EVERY ROW MINTED BEFORE MIGRATION 12, and reported as null rather than guessed.
          // Three pre-existing minting paths (`approval.initiate` before S4, `settings.set`, and three
          // integration files' raw inserts) create RESERVED_MATTER rows with no kind; inferring one from
          // the subject would manufacture an authority the maker never asked for.
          kind: row.reservedMatterKind === null ? null : String(row.reservedMatterKind),
          subjectType: subjectTypeOf(row.subjectId),
          subjectId: row.subjectId,
          status: String(row.status),
          makerId: row.makerId,
          checkerId: row.checkerId,
          decidedAt: row.decidedAt?.toISOString() ?? null,
          decidedAtHijri: row.decidedAtHijri,
          chain,
          chainMissing: chainIncompleteSteps(chain),
          recorded: {
            principalConsent: recordedStep(
              row.principalConsentRecordedAt,
              row.principalConsentRecordedAtHijri,
              row.principalConsentBy,
              row.principalConsentReference,
            ),
            counselReview: recordedStep(
              row.counselReviewRecordedAt,
              row.counselReviewRecordedAtHijri,
              row.counselReviewBy,
              row.counselReviewReference,
            ),
            authorityNotice: recordedStep(
              row.authorityNoticeRecordedAt,
              row.authorityNoticeRecordedAtHijri,
              row.authorityNoticeBy,
              row.authorityReference,
            ),
          },
          writable,
        };
      });
    }),

  /**
   * ⊕ S12-2 · the three chain steps (BR-1102), recorded by STAFF against a reference (owner ruling
   * 2026-09-08). One helper, three names, so the trail says which letter arrived.
   */
  recordPrincipalConsent: makerProcedure('legal:reserved_matter:write')
    .input(recordChainStepInput)
    .mutation(({ ctx, input }) =>
      recordChainStep(ctx, 'PRINCIPAL_CONSENT', input, 'reservedMatter.recordPrincipalConsent'),
    ),
  recordCounselReview: makerProcedure('legal:reserved_matter:write')
    .input(recordChainStepInput)
    .mutation(({ ctx, input }) =>
      recordChainStep(ctx, 'COUNSEL_REVIEW', input, 'reservedMatter.recordCounselReview'),
    ),
  recordAuthorityNotice: makerProcedure('legal:reserved_matter:write')
    .input(recordChainStepInput)
    .mutation(({ ctx, input }) =>
      recordChainStep(ctx, 'AUTHORITY_NOTICE', input, 'reservedMatter.recordAuthorityNotice'),
    ),

  /**
   * APPROVE a reserved matter. `nazir` only — `legal:reserved_matter:approve` sits in no other preset.
   *
   * Everything about authority was decided by `checkerProcedure`'s guards before this body ran: the
   * acting identity ≠ the PERSISTED `makerId`, an ACTIVE `NAZIR` grant on THIS endowment, a fresh TOTP
   * inside the `Setting`-driven window, the `payloadHash` re-verification (which VOIDS a changed
   * artifact rather than executing it), and the `PENDING` open-status gate.
   *
   * ⚠ NOTE THE VERB. §3 row 8's `A*` is on the RESERVED MATTER; the `S*` is on the DEED
   * (`endowment:deed:sign`, which is `endowment.recordDeedTerms`'s rung). Do not swap them.
   *
   * ⚠ `chainIncomplete` NAMES the BR-1102 steps that are not recorded and DOES NOT BLOCK on them. That
   * is a deliberate skeleton limit, stated on the response so no caller has to infer it. It reuses
   * `errors.access.RESERVED_MATTER_CHAIN_INCOMPLETE`, which already has ar+en copy — no new key.
   */
  approve: checkerProcedure('legal:reserved_matter:approve').mutation(async ({ ctx }) => {
    if (ctx.approval.type !== 'RESERVED_MATTER') {
      throw new ApiError(
        'APPROVAL_STALE',
        `WRONG_APPROVAL_TYPE: approval_request ${ctx.approval.id} is ${ctx.approval.type}, not ` +
          `RESERVED_MATTER. An approval raised for one kind of act may never be spent on another — its ` +
          `payloadHash would still match its own payload, so the guard chain would look healthy while ` +
          `the wrong thing was authorized.`,
        { approvalRequestId: ctx.approval.id, reason: 'WRONG_APPROVAL_TYPE' },
      );
    }

    const decidedAt = ctx.now;

    // S12-1 / AV4-02: the decision is taken on the approval plane (see root.ts `approval.approve`
    // and `middleware/approval-plane.ts`). The chain state is read off the DECIDED row, so the
    // chainIncomplete flags below describe what was recorded at the moment of decision.
    //
    // ⚠ TWO-STEP HERE, DELIBERATELY, AND THE ORDER MATTERS FOR THE TRAIL: the decision commits on the
    // provisioning connection first; the APPROVE event carrying `chainIncomplete` is recorded on the
    // runtime second, because it needs the decided row's chain columns. S12-2 turns this into a
    // refusal-before-decision when the chain is incomplete, at which point the flag is always [].
    // ⊕ S12-2 · THE SIGN IS DISABLED UNTIL THE CHAIN IS COMPLETE (§10 §9). Read the recorded facts,
    // refuse by name BEFORE the decision — `approveOnApprovalPlane` and the database (migration 51
    // CHECK + trigger (0e)) each refuse it again, so this is the sentence and those are the walls.
    const chainRow = await ctx.db.approvalRequest.findFirst({
      where: { id: ctx.approval.id, waqfId: ctx.waqfId },
      select: CHAIN_ROW_SELECT,
    });
    if (chainRow === null) {
      throw new ApiError('NO_GRANT', `approval_request ${ctx.approval.id} is not visible.`, {
        approvalRequestId: ctx.approval.id,
      });
    }
    const missingBefore = chainIncompleteSteps(chainState(chainRow));
    if (missingBefore.length > 0) {
      throw new ApiError(
        'RESERVED_MATTER_CHAIN_INCOMPLETE',
        `the Nazir's sign is disabled on approval_request ${ctx.approval.id}: ` +
          `${missingBefore.join(', ')} not recorded (BR-1102, §10 §9). Nothing was written.`,
        { approvalRequestId: ctx.approval.id, missing: missingBefore },
      );
    }

    const updated = await approveOnApprovalPlane(ctx, 'reservedMatter.approve', decidedAt);

    return auditedWrite(ctx.db, async () => {
      const chain = chainState(chainRow);
      const chainIncomplete = chainIncompleteSteps(chain);

      // MP-32: the trail proves the AUTHORITY, not merely the identity (BR-607, NFR-04).
      await recordEvent(toActorContext(ctx, { procedure: 'reservedMatter.approve' }), {
        action: 'APPROVE',
        category: 'APPROVAL',
        classification: 'SENSITIVE',
        entityType: 'ApprovalRequest',
        entityId: ctx.approval.id,
        waqfId: ctx.waqfId,
        extraContext: {
          grantId: ctx.authority.grantId,
          role: ctx.authority.role,
          reservedMatterKind:
            updated.reservedMatterKind === null ? null : String(updated.reservedMatterKind),
          subjectId: ctx.approval.subjectId,
          makerId: ctx.approval.makerId,
          payloadHash: ctx.approval.payloadHash,
          totpAssertedAt: ctx.totpAssertedAt.toISOString(),
          // ⚠ THE GAP TRAVELS INTO THE TRAIL. An approval recorded as complete when three chain steps
          // were never taken is exactly the record a dispute would turn on.
          chainIncomplete,
          // ⊕ S12-2: the chain is ENFORCED — three ways — and this event says so.
          chainEnforced: true,
        },
      });

      return {
        approvalRequestId: updated.id,
        status: 'APPROVED' as const,
        decidedAt: decidedAt.toISOString(),
        decidedAtHijri: updated.decidedAtHijri,
        chain,
        chainIncomplete,
        /** ⊕ S12-2: ENFORCED (§10 §9). An approve never returns with a step missing any more. */
        chainEnforced: true as const,
        messageKey: null,
      };
    });
  }),
});

/** `asset:asset-005:status` → `asset`. Derived, so `subjectType` is never a second stored fact. */
function subjectTypeOf(subjectId: string | null): string | null {
  if (subjectId === null) return null;
  const head = subjectId.split(':')[0];
  return head === undefined || head === '' ? null : head;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · `asset` — BR-306
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export const assetRouter = router({
  /**
   * FLAG a disposal / substitution / pledge / long lease as reserved. **Changes nothing on the asset.**
   *
   * BR-306: the act is recorded as reserved and blocked until approved. The `subjectId` is
   * `asset:<id>:status` — `qmulate_asset_identity_guard()`'s own string — so the approval this mints is
   * the one the trigger will accept, and only for THIS asset.
   */
  requestReservedAct: makerProcedure('endowment:asset:write')
    .input(
      z.object({
        assetId: z.string().min(1).max(64),
        act: z.enum(ASSET_RESERVED_ACTS),
        justification: z.string().min(1).max(4096),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Read through the caller's own client, so an asset on another endowment is invisible rather
      // than refused — the same non-disclosure rule as a missing endowment.
      const asset = await ctx.db.asset.findFirst({
        where: { id: input.assetId, waqfId: ctx.waqfId },
        select: { id: true, status: true },
      });
      if (asset === null) {
        throw new ApiError(
          'NO_GRANT',
          `asset ${input.assetId} is not visible to this caller on waqf ${ctx.waqfId}. Surfaced as ` +
            `NOT_FOUND so the asset's existence is not disclosed.`,
          { assetId: input.assetId, waqfId: ctx.waqfId },
        );
      }

      // ⚠ D-A: three of the four acts have no representable end state. Refuse BEFORE minting — an
      // approval for an act that can never execute is a promise the system cannot keep, and it would
      // occupy this asset's one-open-per-subject slot while doing it.
      const toStatus = ACT_TO_ASSET_STATUS[input.act];
      if (toStatus === null) {
        throw assetEndStateUnrepresentable(ctx.waqfId, input.assetId, input.act);
      }

      const minted = await mintApprovalRequest(ctx, {
        waqfId: ctx.waqfId,
        type: 'RESERVED_MATTER',
        reservedMatterKind: ACT_TO_RESERVED_MATTER_KIND[input.act],
        subjectId: assetStatusSubjectId(input.assetId),
        payload: {
          kind: 'asset.reservedAct',
          act: input.act,
          assetId: input.assetId,
          waqfId: ctx.waqfId,
          fromStatus: asset.status,
          toStatus,
          justification: input.justification,
        },
        // ⚠ An istibdal carries an Authority-notice obligation. The WINDOW resolves from `Setting`
        // (see below) and is ⚠ unverified against primary law; what is recorded here is only that a
        // notice is required.
        authorityNoticeRequired: input.act === 'SUBSTITUTION_ISTIBDAL' || input.act === 'DISPOSAL',
        counselReviewRequired: true,
        procedure: 'asset.requestReservedAct',
      });

      return {
        approvalRequestId: minted.approvalRequestId,
        status: minted.status,
        /** THE ASSET IS UNCHANGED. This procedure performs no state change on it (BR-306). */
        blocked: true as const,
      };
    }),

  /**
   * EXECUTE an approved reserved act, through `withReservedMatter()`.
   *
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * ⚠ A MEASURED DEVIATION FROM THE E3 CONTRACT'S RUNG, AND THE REASON IS STRUCTURAL
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * The contract specifies `checkerProcedure` + `legal:reserved_matter:approve`. **That combination
   * cannot succeed**, and the conflict is not a matter of taste:
   *  · `checkerProcedure` → `resolveApprover()` refuses unless the request is `PENDING` ("a terminal
   *    row can never be re-decided");
   *  · `withReservedMatter()` refuses unless the request is `APPROVED`.
   * AC-E3-08's own sequence is request → **approve** → execute, so at execute time the row is
   * `APPROVED` and the checker rung would refuse every legitimate call. And the rung is not free to
   * change either: `router-introspection.test.ts` requires that an `approve`/`sign` VERB implies BOTH
   * the segregation and step-up guards, so an approve-verb procedure MUST be a `checkerProcedure`.
   *
   * So this ships on the MAKER rung with `endowment:asset:write` — the verb for the state change it
   * actually makes — and the AUTHORITY comes from the approval, verified by `withReservedMatter()`:
   * `APPROVED`, `RESERVED_MATTER`, this endowment, `checkerId != null`, `checkerId != makerId`. That is
   * the correct governance shape rather than a workaround: the Nazir approved, and execution is the
   * EFFECT of that decision, not a second decision. A `case_manager` may therefore execute what the
   * Nazir approved, which is what an operating team does.
   *
   * TODO(surface): should EXECUTION of an approved reserved act be restricted to the Nazir as well, or
   * is `endowment:asset:write` plus a verified approval the right authority? S4 ships the latter
   * because the former is unimplementable on the ladder as it stands (see above), and records the
   * question rather than pretending the contract was satisfiable.
   *
   * ⚠ AND THE HALF THE DATABASE CANNOT CHECK IS CHECKED HERE. `qmulate_reserved_matter_defect` binds an
   * approval to its SUBJECT (since migration 4), so an approved istibdal on asset A is already not a
   * key for asset B. What it cannot compare is the reservedMatterKind against the ACT, because
   * `asset.status` is free text and the enum lives in Prisma — so an approved PLEDGE would otherwise
   * open a DISPOSAL of the same asset. That comparison is this procedure's.
   */
  executeReservedAct: makerProcedure('endowment:asset:write')
    .input(
      z.object({
        assetId: z.string().min(1).max(64),
        approvalRequestId: z.string().min(1).max(64),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const asset = await ctx.db.asset.findFirst({
        where: { id: input.assetId, waqfId: ctx.waqfId },
        select: { id: true, status: true },
      });
      if (asset === null) {
        throw new ApiError(
          'NO_GRANT',
          `asset ${input.assetId} is not visible to this caller on waqf ${ctx.waqfId}.`,
          { assetId: input.assetId, waqfId: ctx.waqfId },
        );
      }

      // ── THE APPROVAL MUST BE ABOUT THIS ASSET AND THIS ACT ────────────────────────────────
      const approval = await ctx.db.approvalRequest.findFirst({
        where: { id: input.approvalRequestId, waqfId: ctx.waqfId },
        select: {
          id: true,
          type: true,
          status: true,
          reservedMatterKind: true,
          subjectId: true,
          makerId: true,
          checkerId: true,
          payload: true,
          authorityNoticeRequired: true,
          counselReviewRequired: true,
          authorityReference: true,
          // S12-2 — the recorded chain, so the execute event names what it rested on.
          principalConsentRecordedAt: true,
          counselReviewRecordedAt: true,
          authorityNoticeRecordedAt: true,
        },
      });
      if (approval === null) {
        throw reservedMatterRequired(ctx.waqfId, input.assetId, 'APPROVAL_NOT_VISIBLE');
      }
      if (approval.type !== 'RESERVED_MATTER' || approval.status !== 'APPROVED') {
        throw reservedMatterRequired(
          ctx.waqfId,
          input.assetId,
          `APPROVAL_NOT_USABLE: ${approval.type}/${approval.status}`,
        );
      }
      const expectedSubject = assetStatusSubjectId(input.assetId);
      if (approval.subjectId !== expectedSubject) {
        // ⚠ THE "ONE APPROVED ACT IS NOT A LICENCE FOR ANOTHER" REFUSAL, at the app layer. The trigger
        // says the same thing; refusing here means nothing is written and rolled back.
        throw reservedMatterRequired(
          ctx.waqfId,
          input.assetId,
          `WRONG_SUBJECT: the approval names ${JSON.stringify(approval.subjectId)}, not ` +
            `${JSON.stringify(expectedSubject)}`,
        );
      }

      // The ACT is read from the approved artifact, never from this call's input: the Nazir approved a
      // specific act, and letting the executor name one would make the approval a blank cheque.
      const payload = (
        typeof approval.payload === 'object' && approval.payload !== null ? approval.payload : {}
      ) as Record<string, unknown>;
      const approvedAct = typeof payload['act'] === 'string' ? payload['act'] : null;
      if (
        approvedAct === null ||
        !(ASSET_RESERVED_ACTS as readonly string[]).includes(approvedAct)
      ) {
        throw reservedMatterRequired(
          ctx.waqfId,
          input.assetId,
          `APPROVED_ACT_UNREADABLE: the approved artifact names act ${JSON.stringify(approvedAct)}`,
        );
      }
      const act = approvedAct as AssetReservedAct;

      const expectedKind = ACT_TO_RESERVED_MATTER_KIND[act];
      if (String(approval.reservedMatterKind) !== expectedKind) {
        throw reservedMatterRequired(
          ctx.waqfId,
          input.assetId,
          `WRONG_KIND: the approval is ${String(approval.reservedMatterKind)}, not ${expectedKind}. ` +
            `The database cannot make this comparison — asset.status is free text and the enum lives ` +
            `in Prisma — so an approved PLEDGE would otherwise open a DISPOSAL of the same asset`,
        );
      }

      // ⚠ THE SECOND HALF OF THE D-A REFUSAL, AND IT IS NOT A DUPLICATE OF THE ONE IN
      // `requestReservedAct`. An approval minted BEFORE migration 13 closed the vocabulary is still
      // sitting in `approval_request`, APPROVED and spendable. Refusing here is what stops it being
      // spent — and refusing beats remapping it onto `SUBSTITUTED_ISTIBDAL`, which would execute an
      // istibdal against an approval that says DISPOSAL.
      const toStatus = ACT_TO_ASSET_STATUS[act];
      if (toStatus === null) {
        throw assetEndStateUnrepresentable(ctx.waqfId, input.assetId, act);
      }

      // ── THE WRITE, UNDER THE VERIFIED APPROVAL ───────────────────────────────────────────
      // `withReservedMatter` re-verifies the approval (APPROVED, RESERVED_MATTER, this endowment,
      // checkerId != null, checkerId != makerId) BEFORE opening the transaction, then sets the
      // transaction-local GUC `qmulate.reserved_matter_approval_id` that `qmulate_asset_identity_guard()`
      // reads. Transaction-local is the point: the value evaporates on COMMIT or ROLLBACK, so a pooled
      // connection cannot carry one request's approval into the next request's write.
      //
      // ⚠ `auditedTx` WRAPS THE HANDLE. `withReservedMatter` yields `withAudit`'s raw facade, which is
      // NOT the guarded door — so a projected audited update inside it would reach the C-08 coercion.
      // Wrapping restores the refusal without a second write path.
      const updated = await withReservedMatter(
        ctx.db,
        toActorContext(ctx, { procedure: 'asset.executeReservedAct' }),
        input.approvalRequestId,
        ctx.waqfId,
        async (tx: ExtendedPrismaClient) => {
          const guarded = auditedTx(tx);

          // ⚠ NO `select` (C-08).
          const row = await guarded.asset.update({
            where: { id: input.assetId },
            data: { status: toStatus },
          });

          // EXECUTED: `APPROVED` is non-terminal and would keep the one-open-per-subject slot occupied,
          // blocking the next legitimate reserved matter on this asset. PENDING → APPROVED → EXECUTED
          // is the only legal route.
          await guarded.approvalRequest.update({
            where: { id: input.approvalRequestId },
            data: { status: 'EXECUTED' },
          });

          return row;
        },
      );

      // ── THE AUTHORITY-NOTICE WINDOW, FROM `Setting` ──────────────────────────────────────
      // ⚠ RESOLVED, NEVER HARDCODED, AND ⚠ UNVERIFIED. 10 business days is not confirmed against
      // primary Saudi law (Binding rule 3), so it lives in a `Setting` row and a correction is a config
      // change rather than a deploy.
      let authorityNoticeDueBusinessDays: number | null = null;
      if (act === 'SUBSTITUTION_ISTIBDAL') {
        const resolver = createSettingResolver(ctx.db, { now: ctx.now });
        const resolved = await resolver.resolve(ISTIBDAL_NOTICE_SETTING_KEY, {
          waqfId: ctx.waqfId,
        });
        const value = resolved.envelope.v;
        authorityNoticeDueBusinessDays = typeof value === 'number' ? value : null;
      }

      await recordEvent(toActorContext(ctx, { procedure: 'asset.executeReservedAct' }), {
        action: 'UPDATE',
        category: 'MUTATION',
        classification: 'SENSITIVE',
        entityType: 'Asset',
        entityId: input.assetId,
        waqfId: ctx.waqfId,
        extraContext: {
          act,
          reservedMatterKind: expectedKind,
          approvalRequestId: input.approvalRequestId,
          approvalMakerId: approval.makerId,
          approvalCheckerId: approval.checkerId,
          fromStatus: asset.status,
          toStatus,
          authorityNoticeDueBusinessDays,
          authorityNoticeSettingKey: ISTIBDAL_NOTICE_SETTING_KEY,
          unverified: true,
          note: UNVERIFIED_MARKER,
          // ⚠ NO RECEIPT WAS WRITTEN, AND THE TRAIL SAYS SO. Istibdal proceeds are CORPUS (aṣl) and
          // are blocked from the distribution waterfall by construction (Binding rule 1). The ledger
          // path is E5's.
          receiptWritten: false,
          proceedsClass: 'CORPUS_ASL',
          chainIncomplete: chainIncompleteSteps(chainState(approval)),
        },
      });

      return {
        assetId: updated.id,
        status: updated.status,
        approvalRequestId: input.approvalRequestId,
        act,
        authorityNoticeDueBusinessDays,
        /** ⚠ unverified — confirm against primary law. */
        authorityNoticeUnverified: true as const,
        /** No `Transaction` and no receipt: istibdal proceeds are corpus (Binding rule 1). */
        receiptWritten: false as const,
      };
    }),
});

/**
 * `RESERVED_MATTER_REQUIRED` — the act is reserved and no usable approval names it.
 *
 * A `DomainError`, so the single user-facing sentence lives once at
 * `errors.domain.RESERVED_MATTER_REQUIRED` and the status is `FORBIDDEN`
 * (`DOMAIN_ERROR_CODE_TO_TRPC_STATUS`). Deliberately NOT `NOT_FOUND`: the endowment's existence is
 * already disclosed by the grant that got the caller this far, so there is nothing left to protect and
 * a precise refusal is more useful than a misleading one.
 */
/**
 * `ASSET_END_STATE_UNREPRESENTABLE` — the act is real, but D-A left it nowhere to land.
 *
 * ⚠ REFUSED, NOT REMAPPED, AND REFUSED AT BOTH ENDS. `requestReservedAct` will not mint an approval
 * for an act that can never be executed — a governance record promising something the system cannot
 * do is worse than no record — and `executeReservedAct` refuses again, so an approval minted before
 * migration 13 cannot be spent afterwards. Choosing the nearest surviving status would record an act
 * the Nazir never approved (ADR-0004: refuse, do not remap).
 *
 * A `RESERVED_MATTER_REQUIRED` `DomainError` would be the wrong sentence — nothing is missing that an
 * approval could supply — so this is an `ApiError` carrying the named reason, and the message says
 * which decision removed the end state.
 */
function assetEndStateUnrepresentable(
  waqfId: string,
  assetId: string,
  act: AssetReservedAct,
): ApiError {
  return new ApiError(
    'GATE_NOT_CLEARED',
    `ASSET_END_STATE_UNREPRESENTABLE: BR-306 act ${act} on asset ${assetId} (waqf ${waqfId}) has no ` +
      `representable end state. The product owner closed the \`asset.status\` vocabulary on ` +
      `2026-08-16 (D-A) to ${ASSET_STATUSES.join(', ')}; \`sold\`, \`pledged\`, \`mortgaged\` and ` +
      `\`long_leased\` are deliberately gone — "stricter than today, and coherent with waqf ` +
      `perpetuity. That is intended." REFUSED rather than remapped onto the nearest surviving ` +
      `status, which would record an act nobody approved (ADR-0004). ⚠ Whether these three acts ` +
      `should be retired outright is an OPEN owner question, recorded on ACT_TO_ASSET_STATUS.`,
    {
      waqfId,
      assetId,
      act,
      reason: 'ASSET_END_STATE_UNREPRESENTABLE',
      vocabulary: [...ASSET_STATUSES],
    },
  );
}

function reservedMatterRequired(waqfId: string, assetId: string, detail: string): DomainError {
  return new DomainError(
    'RESERVED_MATTER_REQUIRED',
    `disposal, substitution (istibdal), pledge and long lease of a corpus asset are RESERVED MATTERS ` +
      `(BR-306): asset ${assetId} on waqf ${waqfId} may not change state without an APPROVED, ` +
      `maker <> checker RESERVED_MATTER approval naming THIS asset and THIS act. ${detail}. ` +
      `⚠ Istibdal proceeds are corpus (aṣl) and never enter the distribution waterfall.`,
    { details: { waqfId, assetId, detail } },
  );
}
