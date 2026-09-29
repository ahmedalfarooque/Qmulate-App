// QMULATE — the ANCESTOR WALK. The only read that can answer "is this beneficiary entitled?".
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY A WALK AND NOT A COLUMN
// ═══════════════════════════════════════════════════════════════════════════════════════════
// R-FRONTIER (product owner, 2026-08-03) makes entitlement a property of a CHAIN, not of a row:
// entitlement sits at the NEAREST LIVING POINT on each line of descent, so a beneficiary is
// entitled only if EVERY ancestor strictly between them and the waqif is deceased. A living
// ancestor HOLDS the entitlement and their descendants wait
// (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`) — a **TEMPORARY** exclusion that reverses on that
// ancestor's death.
//
// Two consequences that decide the shape of this module:
//
//   1. `beneficiary.active` cannot be read row by row. One stale vital status on a grandparent
//      silently moves an entire branch's money, so the caller needs EVERY ancestor's status, not
//      just the nearest — which is why {@link BeneficiaryAncestryRow} is one row per
//      (beneficiary, ancestor) PAIR rather than one row per beneficiary.
//   2. ⚠ **NOTHING HERE MAY BE CACHED, MATERIALIZED OR PERSISTED.** There is deliberately no
//      `excluded`, `ineligible`, `entitledCohort` or `lastComputedFrontier` column anywhere in the
//      schema, no materialized view and no cached cohort. Entitlement is recomputed from the
//      register every period and this walk is the only authority. A cached exclusion keeps paying
//      the wrong branch after a death is recorded, which is the specific harm the temporariness of
//      `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` creates.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠⚠ THIS MODULE ISSUES RAW SQL, AND RAW SQL BYPASSES THE PRISMA FORCE FILTER
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `SCOPING_KNOWN_GAPS` records verbatim that the per-endowment force filter "does not survive raw
// SQL". So this module performs **NO AUTHORIZATION OF ANY KIND**, and that is not an oversight —
// it is the contract:
//
//   · `waqfId` is a REQUIRED, POSITIONAL argument. It is never inferred, never optional and never
//     defaulted, because inferring the endowment from the data would let a caller holding a grant
//     on endowment A read endowment B's family tree.
//   · EVERY CALLER MUST ALREADY HAVE VERIFIED THE GRANT. In `packages/api` that means a procedure
//     on rung 2 or above (`endowmentScopedProcedure`) carrying `beneficiary:beneficiary:read`,
//     which has resolved an ACTIVE `WaqfAccessGrant` for this `waqfId` before this function is
//     reached. A call from anywhere that has not done that is a scope bypass.
//   · The `waqfId` is bound as a PARAMETER (`$1`), never interpolated, so the identifier cannot
//     carry SQL. `$queryRaw` with a tagged template is used for exactly that reason.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ONE DEFINITION OF THE WALK, AND IT LIVES IN SQL
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The recursion is `qmulate_beneficiary_ancestry(text, integer)`, created by migration
// `00000000000012_e3_lineage_reversion_deed_terms`. This module CALLS it rather than re-writing a
// second `WITH RECURSIVE`, because two hand-written copies of one traversal is precisely the
// drift this repo has already been bitten by twice (the role model, and the distribution
// vocabulary). The function is anchored at one endowment, so the walk uses
// `beneficiary(waqfId, parentId)` rather than scanning the table.
//
// ⚠ NO MEASUREMENT EXISTS for that index, or for the retained `beneficiary(waqfId, tabaqa)`, on
// this schema. The recommendation was "add the walk's key, keep the tier key"; neither is measured,
// and this comment exists so nobody quotes the choice as a benchmark.

import type { PrismaClient } from '../generated/client/index.js';

/**
 * One (beneficiary, ancestor) pair on the walk.
 *
 * `depth` is 1 for the DIRECT parent and increases towards the waqif. A beneficiary who is a child
 * of the waqif (`parentId IS NULL`) produces NO rows at all — they have no ancestor strictly
 * between themselves and the waqif, which is exactly why the frontier rule finds them entitled.
 * An EMPTY ancestor list is therefore a meaningful answer and not a missing one.
 *
 * ⚠ `ancestorLineageLink` is returned because the `ZUHUR_ONLY` intermediate-ancestor test needs it.
 * It is the ẓuhūr/buṭūn ELIGIBILITY FACT and **must never be rendered as a person's gender** — no
 * UI label, no report column, no CSV export, no i18n key.
 */
export interface BeneficiaryAncestryRow {
  readonly waqfId: string;
  readonly beneficiaryId: string;
  readonly ancestorId: string;
  readonly depth: number;
  /** The ancestor's vital / in-scope status. THE input to the frontier test. */
  readonly ancestorActive: boolean;
  readonly ancestorLineageLink: 'SON' | 'DAUGHTER' | null;
  /**
   * Soft-deletion state of the ANCESTOR row. Surfaced rather than filtered: deletion is soft-only in
   * this schema, and a soft-deleted ancestor is a data-integrity question for the caller (an
   * unpayable line), not something this reader may silently drop from a chain. Dropping it would
   * SHORTEN the chain and could make a blocked descendant look entitled.
   */
  readonly ancestorDeletedAt: Date | null;
}

/**
 * The depth cap handed to the SQL walk.
 *
 * ⚠ IT IS A SAFETY VALVE, NOT A DOMAIN LIMIT. The composite parent foreign key and CHECK
 * `beneficiary_no_self_parent` make a one-row cycle impossible, but `A -> B -> A` across two rows is
 * perfectly representable, and an uncapped recursion over one would hold a connection open for
 * ever. Sixty-four generations is far beyond any real waqf (the oldest endowments in the source
 * material run to three or four), so a chain that reaches this cap is malformed DATA rather than a
 * large family — and the engine refuses such a graph (`LINEAGE_CYCLE`), which is where the refusal
 * belongs.
 */
export const ANCESTRY_MAX_DEPTH = 64;

/** The row shape the SQL function returns, before the Prisma `Decimal`/`bigint` boundary. */
interface RawAncestryRow {
  readonly waqfId: string;
  readonly beneficiaryId: string;
  readonly ancestorId: string;
  readonly depth: number;
  readonly ancestorActive: boolean;
  readonly ancestorLineageLink: string | null;
  readonly ancestorDeletedAt: Date | null;
}

/**
 * Read every (beneficiary, ancestor) pair for ONE endowment.
 *
 * ```ts
 * // In packages/api, AFTER endowmentScopedProcedure has resolved the grant for `waqfId`:
 * const ancestry = await readBeneficiaryAncestry(db, waqfId);
 * ```
 *
 * @param db     any Prisma client handle — extended or base. The extension's force filter does NOT
 *               apply to this query (see the header); the `waqfId` argument is the scope.
 * @param waqfId REQUIRED. The endowment whose tree is being read. Never inferred.
 */
export async function readBeneficiaryAncestry(
  db: Pick<PrismaClient, '$queryRaw'>,
  waqfId: string,
  maxDepth: number = ANCESTRY_MAX_DEPTH,
): Promise<readonly BeneficiaryAncestryRow[]> {
  if (typeof waqfId !== 'string' || waqfId.trim() === '') {
    throw new Error(
      'readBeneficiaryAncestry: waqfId is required and may not be blank. This function issues raw ' +
        'SQL, which BYPASSES the per-endowment force filter — so the endowment is the argument, ' +
        'never an inference, and the caller must already hold a verified grant on it.',
    );
  }
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new Error(
      `readBeneficiaryAncestry: maxDepth must be a positive integer (got ${String(maxDepth)}). It ` +
        'is the cycle safety valve — see ANCESTRY_MAX_DEPTH.',
    );
  }

  const rows = await db.$queryRaw<RawAncestryRow[]>`
    SELECT * FROM qmulate_beneficiary_ancestry(${waqfId}::text, ${maxDepth}::integer)
  `;

  return rows.map((row) => ({
    waqfId: row.waqfId,
    beneficiaryId: row.beneficiaryId,
    ancestorId: row.ancestorId,
    depth: Number(row.depth),
    ancestorActive: row.ancestorActive,
    // Narrowed rather than cast: the column is a `LineageLink` enum, so any other value means the
    // enum and this union have drifted, and a silent widening here is how that stops being visible.
    ancestorLineageLink:
      row.ancestorLineageLink === 'SON' || row.ancestorLineageLink === 'DAUGHTER'
        ? row.ancestorLineageLink
        : row.ancestorLineageLink === null
          ? null
          : (() => {
              throw new Error(
                `readBeneficiaryAncestry: ancestor ${row.ancestorId} carries lineageLink ` +
                  `"${row.ancestorLineageLink}", which is not a LineageLink member. The Prisma enum ` +
                  'and this module have drifted — fix the union, do not widen it.',
              );
            })(),
    ancestorDeletedAt: row.ancestorDeletedAt,
  }));
}

/**
 * Group a walk by beneficiary — nearest ancestor FIRST.
 *
 * A convenience for the one shape every caller needs (the chain, in order), kept here so the
 * ordering is decided once. It is a PURE projection of a freshly-read walk: nothing here may be
 * stored, and the result must not outlive the request that read it.
 */
export function ancestryByBeneficiary(
  rows: readonly BeneficiaryAncestryRow[],
): ReadonlyMap<string, readonly BeneficiaryAncestryRow[]> {
  const byBeneficiary = new Map<string, BeneficiaryAncestryRow[]>();
  for (const row of rows) {
    const chain = byBeneficiary.get(row.beneficiaryId) ?? [];
    chain.push(row);
    byBeneficiary.set(row.beneficiaryId, chain);
  }
  for (const chain of byBeneficiary.values()) chain.sort((a, b) => a.depth - b.depth);
  return byBeneficiary;
}
