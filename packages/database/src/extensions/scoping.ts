// QMULATE — the per-endowment force-filter (NFR-05, §10).
//
// THE RULE: authorization is `(subject, role, waqfId) -> permitted actions`. A caller sees rows
// for the endowments in their `WaqfAccessGrant`s and nothing else. The API layer checks that on
// every procedure; THIS extension is the second, independent enforcement — the one that still
// holds when a developer writes a query that forgot to filter.
//
// FAIL-CLOSED, ALWAYS. A model that is not classified below, a context with no grants, an
// operation the extension does not recognize — every one of them yields "no rows", never "all
// rows". A force-filter that defaults open is not a security control; it is a comment.
//
// ORDER OF APPLICATION inside `scopeFilter()`:
//   1. unauthenticated             -> match nothing
//   2. explicit bypass             -> no filter (seed / jobs / migrations only)
//   3. beneficiary self-isolation  -> BEFORE role logic (§10 §5)
//   4. waqf grants                 -> the ordinary case
//   5. AML compartment             -> subtractive, applied on top
//
// WHAT THIS IS NOT. It is not row-level security. Prisma client extensions do NOT intercept
// `$queryRaw` / `$executeRawUnsafe`, so EVERY control in this file is bypassable from the very same
// scoped client it governs — measured, not assumed (see the raw-SQL entry in
// `SCOPING_KNOWN_GAPS`). The database-side guards in migrations 3, 4 and 5 narrow what a raw
// statement can produce — migration 5's admission trigger genuinely refuses an unaudited raw grant
// write — but they cover named columns and one table, and ROW VISIBILITY has no database-side
// enforcement at all: a raw `SELECT "id" FROM "waqf"` on a client scoped to one endowment returns
// all four. Of the three controls ADR-0008 named, **privilege separation and authorization-plane RLS
// landed in round 6** — the runtime role can no longer write `waqf_access_grant`/`membership` and owns
// no table — while **per-table audit triggers did NOT**, and RLS is on the authorization plane only.
// So the two items above are exactly as open as they were: an unaudited raw write to an ordinary
// audited model, and row visibility. The HARD GATE therefore still stands: no real client data.

import { isPermissionString } from '@qmulate/domain';

import { Prisma } from '../../generated/client/index.js';
import { ForbiddenScopeError, isBypassed, type RequestContext } from '../context.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Model classification — every model in the schema appears in exactly one list.
//
// `assertScopingCoverage()` fails if a model is missing from all of them, so adding a model to
// `schema.prisma` without deciding how it is scoped breaks the test suite instead of quietly
// shipping an unfiltered table.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Filtered on its own primary key. */
export const WAQF_SELF_SCOPED_MODELS = ['Waqf'] as const;

/**
 * THE AUTHORIZATION PLANE. These three tables decide who may do what; they are not endowment data.
 *
 * They remain `waqfId`-scoped for READS (a `Membership` is client-scoped — see
 * `CLIENT_REACHABLE_MODELS`), because an admin managing endowment A must be able to list A's grants.
 * What changes in E2 is WRITES: `assertAuthorizationPlaneWrite()` requires an explicit permission,
 * and fails closed when the context carries none.
 *
 * WHY THIS EXISTS. Sprint 1 classified `WaqfAccessGrant` in `WAQF_DIRECT_SCOPED_MODELS` and nowhere
 * else, so the force-filter treated the access matrix exactly like a lease: `assertCreateInScope`
 * checked only that `row.waqfId ∈ ctx.authorizedWaqfIds` and NOTHING about the caller's permissions
 * — `SCOPING_KNOWN_GAPS` recorded verbatim that `permissions` were "stored but not yet interpreted".
 * Any caller holding any write-capable grant on A could therefore INSERT a `NAZIR` grant for
 * THEMSELVES on A. That is a live second-approval-authority path, reachable with no admin, no
 * approval and no gate.
 *
 * ⚠ WHAT THE DATABASE HALF DOES AND DOES NOT DO. `waqf_access_grant_no_self_issue`,
 * `waqf_access_grant_role_immutable`, `waqf_access_grant_permission_guard`,
 * `membership_role_family_level_only` and `approval_request_authority` (migrations 3 and 4) constrain
 * what SHAPE a forged row may take; they cannot constrain WHO inserts one, because a CHECK inspects a
 * row and never its provenance — a raw INSERT naming any third party as `grantedByUserId` satisfies
 * the self-issue CHECK, and the permission guard positively PERMITS the approve verbs because
 * `role = 'NAZIR'` is exactly the role entitled to hold them. `waqf_access_grant_admission`
 * (migration 5) is the one that asks how the row got here: it refuses an INSERT or a widening UPDATE
 * with no `audit_event` admitting it in the same transaction. It was NOT the end of the story, because
 * an `audit_event` marker is a row the caller writes — which is why the closure is a PRIVILEGE and not
 * a trigger. Since ADR-0008 round 6 the runtime role (`qmulate_app`) holds NO INSERT/UPDATE/DELETE on
 * `waqf_access_grant` or `membership` and owns no table, so a raw write to either is
 * `42501 permission denied` before admission is consulted, and `ALTER TABLE … DISABLE TRIGGER` is
 * `42501 must be owner of table`. MEASURED as that role in
 * `test/authorization-plane-privilege.integration.test.ts`. Read the raw-SQL entry in
 * `SCOPING_KNOWN_GAPS` for what is STILL open (unaudited raw writes to other audited models, and
 * cross-endowment row visibility) before quoting any of these as a general defence.
 */
export const AUTHORIZATION_PLANE_MODELS = {
  /** Issuing or widening a grant is an access-matrix change (§10 §4.1: initiator `admin`). */
  WaqfAccessGrant: 'admin:access_matrix:write',
  /** Family-level access is the same authority, at the client level. */
  Membership: 'admin:access_matrix:write',
  /**
   * ANY of the approval verbs, because both sides of maker-checker write this table: `finance`
   * INITIATES a request and `nazir` APPROVES it. WHICH transition a caller may perform is decided by
   * the `approval_request_authority` trigger (the checker must hold an ACTIVE `NAZIR` grant on the
   * same endowment) and by the procedure ladder — not here. This gate only keeps a caller with no
   * approval-module permission at all out of the table.
   */
  ApprovalRequest: 'approval:request:initiate|approval:request:approve',
} as const satisfies Record<string, string>;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ORDINARY-DOMAIN WRITE GATE (round-3 findings N-1 and N-4)
 *
 * WHAT WAS OPEN, MEASURED ON A MIGRATED + SEEDED DATABASE FROM A SCOPED CLIENT — NOT ASSUMED.
 * `assertWritePolicy` consulted `ctx.permissions` for the AUTHORIZATION PLANE only, so every
 * ordinary model was authorized by ENDOWMENT MEMBERSHIP ALONE: any seat holding any grant on
 * waqf A could write any A row, whatever §3's grid said about its module. Reproduced:
 *
 *   FINANCE seat (`user-accountant-001`; effective permissions `finance:transaction:read|write`,
 *   `distribution:run:read|initiate`, `approval:request:read|initiate` — §3 row 1 gives it R ONLY
 *   on "Endowment & deed"):
 *     PERMITTED  waqf.update classification      MEDIUM  -> LARGE
 *     PERMITTED  waqf.update fiscalYearEnd       12-31   -> 06-30
 *     PERMITTED  waqf.update type/entitlementOrder  FAMILY_DHURRI/ORDERED -> JOINT/SHARED
 *                ⚠ THAT LINE WAS THE DRIFTED SIDE AND IT WAS WRONG TO LEAVE STANDING. It recorded
 *                a measurement (it really was permitted) but it read as a POSITION — this file
 *                documenting `type` / `entitlementOrder` as writable — and the adversarial pass
 *                found the same route again from a CASE_MANAGER seat two sprints later
 *                (V-E3-M6). Asked directly on 2026-08-16, the product owner answered *"yes they
 *                are unchangable"* (decisions log D-B). SO IT IS NO LONGER PERMITTED: `type`,
 *                `nature` and `entitlementOrder` are SEALED at the DATABASE by
 *                `qmulate_shart_guard()` tier 1b (migration 13), which refuses them
 *                unconditionally with 42501 and the superseding-instrument message. They are
 *                listed in `ungoverned` below for the same reason the four Shart columns are —
 *                the stronger error must be the one the caller sees.
 *     PERMITTED  trusteeshipDeed.update primaryNazir -> 'NX PROBE TAMPERED'
 *                ⚠ NO LONGER PERMITTED, AND THIS LINE IS ANNOTATED RATHER THAN DELETED for the same
 *                reason the `type`/`entitlementOrder` line above is: it records a real measurement,
 *                but left bare it reads as this file documenting a recorded Nazir appointment as
 *                writable. Asked who may change the trusteeship deed, the product owner answered on
 *                2026-08-17 (S4 owner-decision memo Q10): *"the trusteeship deed can only be editted
 *                by a court judge."* Rendered by engineering — ⚠ FLAGGED as a rendering, since it
 *                converts "edit" into "supersede" — as: NO system seat may edit a recorded
 *                `trusteeship_deed`, and a court-ordered change enters as a NEW SUPERSEDING RECORD
 *                carrying the court instrument. `trusteeship_deed_no_update` (migration 17) refuses
 *                EVERY update for every seat, including the table owner and a caller holding a
 *                genuine reserved-matter approval; only a byte-identical re-statement (`updatedAt`
 *                alone) passes. The INSERT — the initial recording — is untouched and is still gated
 *                HERE by `endowment:deed:write`, which is what this policy governs.
 *
 *   SUBCONTRACTOR seat (`compliance:task:read|initiate`, `document:document:write`; §3 row 1
 *   gives it `—`):
 *     PERMITTED  asset.update valuationSar   18,000,000.00 -> 777,777.77
 *     PERMITTED  asset.update addressAr      -> a forged Arabic address
 *     PERMITTED  asset.update status         -> 'disposed'
 *     PERMITTED  waqf.update classification / governmentFiling.update status / beneficiary
 *                .update sharePercent -> 99.0
 *
 * WHY THOSE COLUMNS AND NOT "ANY WRITE": every one of them GATES A REGULATORY OBLIGATION.
 * `classification` decides WHICH duties apply at all; `fiscalYearEnd` anchors every statutory
 * deadline; `type` / `nature` / `entitlementOrder` drive eligibility and the ghallah waterfall;
 * an asset `valuation` feeds the classification bands; a filing `status` is the compliance
 * position itself. (⚠ Every band, window and percentage behind those sentences is UNVERIFIED —
 * confirm against primary Saudi law. Binding rule 3.)
 *
 * WHAT THIS GATE IS, PRECISELY — and it is a COLUMN gate, not a model gate:
 *   · a write that touches a GOVERNED column of a governed model requires the caller to hold the
 *     named permission in `ctx.permissions`; an absent or empty list DENIES;
 *   · a write that touches no governed column is unaffected, so the existing scope rules and
 *     their messages keep priority and nothing that used to work for a legitimate seat stops;
 *   · governed columns are computed as "every SCALAR field except the ones explicitly excused",
 *     so a column ADDED to `schema.prisma` is governed by DEFAULT. The inverse list (name the
 *     governed ones) would have silently un-gated every future column.
 *
 * WHAT IT DELIBERATELY DOES NOT DO — read this before quoting it:
 *   · IT IS NOT FIELD-LEVEL AUTHORIZATION. It answers "may this seat's MODULE touch this column
 *     at all", never "may this seat see this column's value". `dataScopes` is still stored and
 *     uninterpreted and UBO field isolation is still E4/S5 (see `SCOPING_KNOWN_GAPS`).
 *   · IT DOES NOT SURVIVE RAW SQL. It is a Prisma client extension. `$executeRawUnsafe` on the
 *     same scoped client does not reach it — see the raw-SQL entry in `SCOPING_KNOWN_GAPS` and
 *     ADR-0008's hard gate. Two of the columns above are additionally guarded at the DATABASE
 *     (`asset.titleDeedNumber` and the Shart columns, migrations 4/5) and those DO hold against a
 *     raw statement; the rest do not.
 *   · IT IS NOT PER-ENDOWMENT. `ctx.permissions` is one flat list for the request, sound only
 *     because the force-filter has already narrowed every query to `authorizedWaqfIds`. A caller
 *     holding different verbs on different endowments still needs `Map<waqfId, …>` — E3.
 *   · IT IS NOT REACHED BY A RELATION-NESTED WRITE, and does not need to be: every model below is
 *     an AUDITED model, and `assertNestedWritesAuditable` in `extensions/audit.ts` refuses any
 *     nested write into an audited model outright, for every context including bypassed ones.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Column names every model carries and no policy governs: the primary key and the audit
 * bookkeeping Prisma maintains.
 *
 * ⚠ `deletedAt` IS IN THIS LIST, AND THAT IS A NAMED RESIDUAL, NOT AN OVERSIGHT. A soft delete of
 * a corpus asset or an endowment record is a material act and on the grid's reading it belongs
 * behind the same permission — but `softDelete()` is the sanctioned write path for several seats
 * and re-authorising it is a deliberate change with its own blast radius. Reported, not silently
 * decided.
 *
 * ⚠ THIS ENTRY USED TO END *"Until then a soft delete is governed by endowment membership alone,
 * exactly as before"*, AND THAT SENTENCE WAS FALSE FOR THE ASSET FROM MIGRATION 14 ONWARD.
 * Corrected rather than replaced, because a comment claiming a protection (or, here, claiming an
 * exposure that had already been closed) is what produced S2's false-comment finding and ADR-0008
 * §2.4. MEASURED as `qmulate_app`, no approval in session, each probe rolled back:
 *
 *   REFUSED 42501  UPDATE "asset" SET "deletedAt" = now() WHERE "id" = 'asset-001'
 *                  → *changing "deletedAt" (NULL -> …) is a RESERVED MATTER* (migration 14 §1c)
 *   REFUSED 42501  INSERT INTO "asset" (… "deletedAt" = now() …)  (migration 15 §0b)
 *   ⚠ COMMITS      UPDATE "waqf" SET "deletedAt" = now() WHERE "id" = 'waqf-001'
 *   ⚠ COMMITS      INSERT INTO "waqf" (… "deletedAt" = now() …)   — an endowment BORN retired
 *   ⚠ COMMITS      the same on "beneficiary" and "trusteeship_deed"
 *
 * ⚠⚠ AND TWO OF THOSE FOUR "COMMITS" LINES STOPPED BEING TRUE ON 2026-08-17 (migration 17). They are
 * ANNOTATED, NOT REWRITTEN, exactly as the corpus-asset correction above was — a comment that claims
 * an exposure already closed is the same defect as one claiming a protection that does not exist.
 * RE-MEASURED as `qmulate_app`, no approval in session, each probe rolled back:
 *
 *   REFUSED 42501  UPDATE "waqf" SET "deletedAt" = now()  WHERE "id" = 'waqf-001'   ← and the CLEAR
 *                  → *changing "deletedAt" (…) is a RESERVED MATTER* — PRODUCT OWNER, memo Q8:
 *                    *"Setting (and clearing) waqf.deletedAt on a live endowment requires an
 *                    approved reserved-matter request."* (migration 17, tier 2b of the Shart guard)
 *   REFUSED 42501  UPDATE "trusteeship_deed" SET "deletedAt" = now() — and every other DEED FACT of a
 *                  recorded appointment, for EVERY seat (memo Q10, `trusteeship_deed_no_update`)
 *                  ⚠ "and every OTHER column" is what this line said until 2026-08-17 and it was
 *                  ANNOTATED rather than rewritten: migration 18 narrowed that seal to the deed's own
 *                  FACTS, because sealing the whole row also sealed the BR-109/NFR-09 ELIGIBILITY
 *                  ASSESSMENT and made a regulatory obligation unrecordable on five existing
 *                  appointments (AV5-02, HIGH — measured through `deed.upsert`). `deletedAt` and every
 *                  fact of the appointment are still refused outright; the thirteen assessment columns
 *                  (`qmulate_trusteeship_deed_assessment_columns()`) are writable ONLY as a recorded
 *                  verification event — an advanced `eligibilityVerifiedAt` plus its Hijri pair and a
 *                  verifier, in the same statement — and are governed at THIS layer by
 *                  `endowment:deed:write` (the `TrusteeshipDeed` policy below).
 *   ⚠ COMMITS      INSERT INTO "waqf" (… "deletedAt" = now() …) — an endowment BORN retired, STILL
 *                  OPEN and reported: the `waqf` INSERT is ungoverned wholesale, and the CLEAR being
 *                  gated is what stops such a row becoming a live endowment silently
 *   ⚠ COMMITS      the same on "beneficiary" — STILL OPEN; the memo did not ask about it
 *
 * ⚠⚠ AND A THIRD LINE JOINED THEM ON 2026-08-20 (migration 25, AV7-F4) — ANNOTATED, NOT REWRITTEN,
 * for the same reason as the two above. The list never named `transaction`, and a reader auditing
 * soft-delete coverage would have concluded the LEDGER was membership-only. It was, and it cost a
 * measured breach. RE-MEASURED as `qmulate_app`, no approval in session:
 *
 *   REFUSED 42501  UPDATE "transaction" SET "deletedAt" = now()  ← and the CLEAR, and a re-date
 *   REFUSED 42501  INSERT INTO "transaction" (… "deletedAt" = now() …) — a receipt BORN retired
 *                  → *RETIRING A COMMITTED LEDGER ROW … is a RESERVED MATTER* — PRODUCT OWNER,
 *                    2026-08-20, S4 memo "S7 · AV7-F4": soft-deleting ANY committed receipt, income
 *                    or capital, needs an approved reserved matter, the class difference being in
 *                    the refusal's stated reason and never in its strictness
 *                    (`transaction_row_retirement`). Before it, ONE unapproved UPDATE took a
 *                    distribution run's `capitalReceiptsSar` from 4,200,000.00 to 0.00 with the
 *                    `CAPITAL_RECEIPTS_EXCLUDED` flag gone and no diagnostic and no trace step.
 *
 * WHAT IS ACTUALLY TRUE. This list is still accurate about THIS LAYER — `deletedAt` is ungoverned
 * by {@link DOMAIN_WRITE_POLICIES} on every model, so the app-layer gate still asks nothing. The
 * false part was the CONCLUSION drawn from it: for the CORPUS ASSET, and now for the ENDOWMENT RECORD,
 * the TRUSTEESHIP DEED and the LEDGER ROW, the net behaviour is no longer membership-only, because the
 * DATABASE refuses the write without an approved, artifact-bound reserved matter (asset, waqf,
 * transaction) or refuses it outright (the deed) — strictly stronger controls that also survive raw
 * SQL. For the BENEFICIARY the old sentence still holds, and that is the one that remains open.
 *
 * ⚠ SURFACED, NOT DECIDED, AND STILL NOT — FOR THE CORPUS PARCEL. Migration 14 §1c / 15 §0b carry a
 * `TODO(surface)` asking whether EVERY soft retirement of a CORPUS PARCEL is a reserved matter, or
 * only those that are disposals in substance. Memo Q8 answered the ENDOWMENT question and did not ask
 * the parcel one, so that flag STAYS: the owner's endowment ruling makes the parcel answer likely,
 * and "likely" is not a ruling. `beneficiary."deletedAt"` is likewise unasked.
 */
const WRITE_GATE_ALWAYS_UNGOVERNED: readonly string[] = [
  'id',
  'createdAt',
  'updatedAt',
  'createdBy',
  'deletedAt',
];

interface DomainWritePolicy {
  /**
   * The permission required to write a governed column. `a|b` means "any of these" — the same
   * accepted-set idiom `AUTHORIZATION_PLANE_MODELS` uses. No wildcards, deliberately.
   */
  readonly permission: string;
  /** Columns this policy does NOT govern. Every entry needs a reason in the comment above it. */
  readonly ungoverned?: readonly string[];
  /** Per-column permission that replaces {@link DomainWritePolicy.permission}. */
  readonly overrides?: Readonly<Record<string, string>>;
}

/**
 * Model → the permission its obligation-gating columns require.
 *
 * The mapping from a model to a §3 GRID ROW is the one piece of judgement here, so it is written
 * out rather than derived: `endowment` for the endowment record, its deed and its corpus assets;
 * `finance` for the ledger and the accounts; `compliance` for tasks, filings and their deadlines;
 * and so on. Anything NOT in this table is in {@link DOMAIN_WRITE_UNGATED} with a reason, and
 * {@link assertDomainWriteCoverage} fails if a model is in neither.
 */
export const DOMAIN_WRITE_POLICIES: Readonly<Record<string, DomainWritePolicy>> = {
  /**
   * §3 row 1 "Endowment & deed" — `R W` for nazir / case_manager / compliance_officer / admin,
   * `R W(scoped)` for authorized_rep, **R only for finance**, `—` for subcontractor.
   */
  Waqf: {
    permission: 'endowment:waqf:write',
    ungoverned: [
      // The Shart al-Waqif is write-once at the DATABASE (`waqf_shart_immutable`, migration
      // 3/ADR-0006) and amendable only through a verified reserved-matter approval. That guard is
      // strictly stronger than this one — it survives raw SQL — and `shart-immutability`'s
      // assertions are about ITS message. Adding a weaker app-layer refusal in front of it would
      // replace the stronger error with a weaker one.
      'shartAlWaqif',
      'shartAlWaqifVersion',
      'shartAlWaqifSetAt',
      'shartAlWaqifSetAtHijri',

      // ── THE THREE DEED FACTS, SEALED AT THE DATABASE SINCE MIGRATION 13 (D-B, V-E3-M6) ──────
      //
      // ⚠ THEY ARE `ungoverned` HERE FOR EXACTLY THE SHART COLUMNS' REASON, AND FOR THE OPPOSITE
      // REASON TO THE TIER-3 DEED TERMS IN `overrides` BELOW. The distinction is the permitted
      // FIRST write:
      //   · tier 3 (`continuationStipulation`, the four مآل columns) permits `NULL -> value` once,
      //     so an app-layer gate still has real work to do and they are GOVERNED at
      //     `endowment:deed:sign`;
      //   · these three are `NOT NULL` and already carry the founder's answer, so
      //     `qmulate_shart_guard()` tier 1b refuses EVERY change UNCONDITIONALLY. There is no
      //     first write to gate. An app-layer refusal in front of that could only replace a
      //     42501 naming Binding rule 1 and the superseding-instrument remedy with a generic
      //     permission error — a weaker message for the same outcome, and one that does not
      //     survive raw SQL while the database's does.
      //
      // MEASURED BEFORE migration 13, as `qmulate_app` on a pristine seed: all three committed,
      // together and one at a time (`ORDERED -> LINEAGE_CONTINUATION`,
      // `FAMILY_DHURRI -> PUBLIC_CHARITABLE`, `AYNI -> QIYAMI`), while `shartAlWaqifVersion` on
      // the same row was refused 42501.
      'entitlementOrder',
      'type',
      'nature',
    ],
    overrides: {
      // ── THE WRITE-ONCE DEED TERMS (S4/E3, migration 12 tier 3) ────────────────────────────
      //
      // ⚠ DELIBERATE DEVIATION FROM THE E3 BRIEF, WHICH ASKED FOR THESE IN `ungoverned`. The
      // reason `ungoverned` is right for the four Shart columns is that the database refuses them
      // ALWAYS, so any app-layer rule can only shadow a stronger error with a weaker one. Tier 3
      // is NOT like that: it refuses the SECOND write and PERMITS THE FIRST, because a deed term
      // illegible at intake must stay recordable. Listing these as `ungoverned` would therefore
      // leave the first recording of a founder's condition gated by nothing at this layer —
      // writable by anyone holding `endowment:waqf:write`, which is `case_manager`,
      // `compliance_officer` and `authorized_rep` as well as the Nazir.
      //
      // So they are GOVERNED, at the narrowest permission that exists: `endowment:deed:sign`, held
      // by `nazir` ALONE in `ROLE_PRESETS`. That is the same rung `endowment.recordDeedTerms` sits
      // on, and it means the two layers divide the work rather than duplicating it:
      //   · FIRST write  → this gate (only the Nazir may record a founder's condition);
      //   · SECOND write → the database (42501, superseding-instrument message), which is what a
      //     Nazir attempting a change will hit — so the stronger error is NOT shadowed for the one
      //     caller who gets past this gate.
      //
      // ⚠ SURFACED, NOT DECIDED: `reversionClauseCaptured` is REQUIRED on INSERT, and `create` IS
      // gated for `Waqf` (see `assertDomainWriteAuthorized` — `Waqf` is self-scoped, so its create
      // is otherwise checked by nothing). Creating an endowment therefore now requires
      // `endowment:deed:sign`. That is the fail-closed direction and it is arguably right — stating
      // whether a deed's مآل clause has been read is a deed act — but it COUPLES E11's onboarding
      // to the Nazir's signature. Widening later is safe; narrowing a live guard is the risky
      // direction (D-5), which is why it ships strict. E11 must know.
      // ⊕ E11 KNEW, AND ANSWERED (S12-3b, migration 53): a birth STATES `reversionClauseCaptured:
      // false` (unread — the column may never acquire a default, e3-lineage-reversion pins it), and
      // `assertDomainWriteAuthorized` judges that ONE sentinel on CREATE by the record verb rather
      // than by this override. Recording `true`, and every UPDATE, stays `endowment:deed:sign` exactly
      // as below. The guard did not narrow: saying "unread" records no founder's condition.
      continuationStipulation: 'endowment:deed:sign',
      reversionClauseCaptured: 'endowment:deed:sign',
      reversionKind: 'endowment:deed:sign',
      reversionRecordedAt: 'endowment:deed:sign',
      reversionRecordedAtHijri: 'endowment:deed:sign',
    },
  },
  /**
   * ⚠ THIS PERMISSION GOVERNS THE INITIAL RECORDING **AND THE ELIGIBILITY VERIFICATION**, and both
   * sentences are about a layer below as much as about this one. Since migration 17 (S4
   * owner-decision memo Q10 — *"the trusteeship deed can only be editted by a court judge"*, rendered
   * by engineering and FLAGGED as a rendering) `trusteeship_deed_no_update` refuses every update to a
   * recorded appointment's own FACTS, for every seat: not `nazir`, not the table owner, not a replica
   * session, and not a caller holding a genuine reserved-matter approval. A byte-identical
   * re-statement (only `updatedAt` moving) is permitted, because it records no new fact — that is what
   * keeps the fixture seed's `upsert` re-runnable.
   *
   * ⚠ CORRECTED 2026-08-17 (AV5-02, HIGH): the previous sentence here — *"the DB seals the whole
   * row"* — was migration 17's own claim, and it made the BR-109/NFR-09 ELIGIBILITY ASSESSMENT
   * unrecordable on the five appointments that already exist. Migration 18 classifies thirteen columns
   * (`qmulate_trusteeship_deed_assessment_columns()`: the ten criteria + the three-column verification
   * event) as QMULATE's assessment OF the appointee rather than as deed content, and permits them to
   * move ONLY as a recorded verification event. So there is still no `ungoverned` list — and now for a
   * REASON rather than by vacuity: those thirteen columns are exactly the ones this layer must gate,
   * and `endowment:deed:write` is the gate. ⚠ The line between "deed fact" and "our assessment" is
   * ENGINEERING'S reading of the owner's ruling and is flagged for his confirmation, alongside the
   * supersede rendering it sits beside.
   *
   * The remedy the fact-refusal names — a NEW SUPERSEDING RECORD carrying the court instrument — is
   * NOT REACHABLE YET (`waqfId` is `@unique`; there is no supersession link), which is owed to E4 and
   * stated in the refusal itself rather than implied.
   */
  TrusteeshipDeed: { permission: 'endowment:deed:write' },
  Asset: {
    permission: 'endowment:asset:write',
    ungoverned: [
      // `asset.titleDeedNumber` is RESERVED-MATTER-ONLY at the database (migration 5). Same
      // reasoning as the Shart columns: the DB guard holds against raw SQL and this one does not,
      // and `grant-admission.integration.test.ts` asserts on that guard's message.
      'titleDeedNumber',
      // ⚠ A NAMED RESIDUAL, NOT A JUDGEMENT THAT `status` IS HARMLESS. `ACTIVE` ->
      // `SUBSTITUTED_ISTIBDAL` on a corpus asset is a material act and on a strict reading of §3
      // row 1 it belongs behind `endowment:asset:write` with the rest.
      //
      // ⚠ WHAT MIGRATION 13 CHANGED AND WHAT IT DID NOT. The column is now the CLOSED enum
      // `AssetStatus` (D-A), so the SPELLING half of the residual is gone — the Arabic word for
      // "substituted" no longer commits an ungated disposal, because it can no longer be stored at
      // all (V-E3-02, measured before and after). The AUTHORIZATION half is unchanged: this gate
      // still does not require `endowment:asset:write` to move an asset between the four ORDINARY
      // states. Moving it into either RESERVED state is refused by
      // `qmulate_asset_identity_guard()` without an approved, artifact-bound reserved matter,
      // which survives raw SQL and this gate does not.
      //
      // It stays excused here because
      // `packages/database/test/adversarial-regressions.integration.test.ts` ("update/upsert
      // succeeds on a row inside the caller's scope", lines ~144 and ~164) pins
      // `asset.update({ data: { status } })` from a seat holding no endowment write verb as the
      // SANCTIONED in-scope write, and this change does not own that file. N-4's two named columns
      // — the value and the address — are governed. SURFACED: govern `status` too when that
      // fixture's context is widened.
      'status',
    ],
    overrides: {
      // ⚠ THE LOOSER OF TWO READINGS, SHIPPED DELIBERATELY AND FLAGGED FOR TIGHTENING.
      // §3 row 1 gives `finance` R only, so the TIGHTER rule is `endowment:asset:write` ALONE,
      // and that is what a strict transcription of the grid would ship. It is not what ships:
      // `packages/database/test/nested-write-audit.integration.test.ts` ("the top-level
      // EQUIVALENT of each refused nesting produces exactly one event per row") pins a top-level
      // `asset.update({ data: { valuationSar } })` from a seat holding ONLY
      // `finance:transaction:*` as a SANCTIONED path, and this change does not own that file.
      // Accepting the finance write verb keeps that path open while still refusing the
      // subcontractor seat that N-4 measured (it holds neither permission).
      // SURFACED: tighten to `endowment:asset:write` alone when that fixture context is widened.
      valuationSar: 'endowment:asset:write|finance:transaction:write',
      valuationDate: 'endowment:asset:write|finance:transaction:write',
      valuationDateHijri: 'endowment:asset:write|finance:transaction:write',
    },
  },
  /** A government taking + the istibdal substitution. Corpus events on an asset. */
  Expropriation: { permission: 'endowment:asset:write' },
  /** The record OF a classification change — the thing N-1 is about, one step removed. */
  ReclassificationEvent: { permission: 'endowment:waqf:write' },
  /** A lease is a contract over a corpus asset (and the Ejar filing reference). */
  Lease: { permission: 'endowment:asset:write' },
  /** Ṣiyāna on an asset. */
  MaintenanceTicket: { permission: 'endowment:asset:write' },
  /**
   * §3 row 2 "Beneficiary & UBO".
   *
   * ⚠ SINCE S4/E3 THE ENTITLEMENT-DRIVING COLUMNS ARE `parentId`, `lineageLink`, `active` and
   * `stipulatedWeight` — not `sharePercent`/`tabaqa`, which this comment used to name. `active` on
   * an ANCESTOR decides whether a whole branch is entitled (R-FRONTIER), and `parentId`/`lineageLink`
   * decide whether a member can be placed in the tree at all (R6: a member the engine cannot place
   * is never paid). They are governed by this one permission along with everything else on the row,
   * which is the §3 grid's answer; nothing here is `ungoverned`.
   */
  Beneficiary: { permission: 'beneficiary:beneficiary:write' },
  /**
   * ⚠ THE DEED CLAUSE THAT NAMES WHERE THE ENDOWMENT GOES WHEN THE FAMILY ENDS (مآل الوقف, R7).
   *
   * Governed by `endowment:deed:sign` — `nazir` ALONE — for the same reason the write-once deed-term
   * columns on `Waqf` are: a row here IS a founder's condition, and the database only guards it after
   * the first write (`waqf_reversion_taker_no_mutate` refuses UPDATE, DELETE and TRUNCATE, but
   * INSERT is how the clause is recorded at all). Governing the INSERT at the narrowest permission is
   * what stops `endowment:waqf:write` from redirecting an endowment's ultimate destination.
   */
  WaqfReversionTaker: { permission: 'endowment:deed:sign' },
  /** §3 row 3 "Finance: capture" — the ledger. `receiptClass` is Binding rule 1's discriminator. */
  Transaction: { permission: 'finance:transaction:write' },
  BankAccount: { permission: 'finance:bank_account:write' },
  Budget: { permission: 'finance:transaction:write' },
  /** §3 row 4 "Finance: bank/distribution run". */
  Distribution: { permission: 'distribution:run:write' },
  DistributionLineItem: { permission: 'distribution:line_item:write' },
  /** §3 row 5 "Nazir fee" (BR-507). ⚠ the ʿushr rate itself is unverified. */
  NazirFee: { permission: 'fee:nazir_fee:write' },
  /** §3 row 6 "Compliance tasks & filings". */
  ComplianceTask: { permission: 'compliance:task:write' },
  GovernmentFiling: { permission: 'compliance:filing:write' },
  Deadline: { permission: 'compliance:task:write' },
  // ⊕ S9-3c. §09's material-change change-set: recording one RAISES the 15-business-day update
  // duty, and its `effectiveDate` IS that duty's statutory clock (CDE-Q2). So it gates a regulatory
  // obligation as directly as the `Deadline` above, and takes the same permission the maker
  // procedure requires (`deadline.recordMaterialChange`) — not a lesser one, and not
  // DOMAIN_WRITE_UNGATED: a caller who can write a change row can start a statutory clock.
  MaterialChange: { permission: 'compliance:task:write' },
  // ⊕ S9-3d. The escalation record is written by the daily evaluator under its declared non-human
  // actor, and by nothing else — but the gate is stated rather than left to the absence of a
  // caller, because DOMAIN_WRITE_UNGATED would say "a write to this needs no permission" and that
  // is not what anybody means about a compliance-escalation record.
  EscalationEvent: { permission: 'compliance:task:write' },
  /** ⊕ S12-3 · clearing or reopening a handover gate is an endowment-record act (BR-1101). */
  OnboardingGate: { permission: 'endowment:waqf:write' },
  ZakatFiling: { permission: 'compliance:filing:write' },
  /** §3 row 8 "Legal & judicial cases". */
  LegalCase: { permission: 'legal:case:write' },
  /** §3 row 9 "Document vault". */
  Document: { permission: 'document:document:write' },

  /**
   * §3 row "AML / SAR compartment" (BR-604) — the grid's cell is `R W aml`, held by `aml_officer`
   * and nobody else. `PERMISSION_RESOURCES.aml` is `['sar']` and the registry is CLOSED, so
   * `aml:sar:write` is the only write verb that exists for this module and it appears in exactly one
   * preset.
   *
   * ⚠ **THIS GATE IS NOT THE COMPARTMENT.** It answers "may this caller write a SAR at all"; it says
   * nothing about WHICH endowment's compartment they are inside. That is `requireAmlMember()` at the
   * procedure rung plus `amlClause()` at the force filter, and the compartment default is EMPTY —
   * including for the Nazir (§10 §6). A caller could hold `aml:sar:write` and still write nothing,
   * which is the correct relationship between a permission and a compartment: the permission is a
   * capability, the membership is a scope, and neither substitutes for the other.
   */
  AmlReport: { permission: 'aml:sar:write' },
  AmlFollowUp: { permission: 'aml:sar:write' },
};

/**
 * Models this gate does NOT cover, each with the reason. Fail-closed in the sense that matters:
 * {@link assertDomainWriteCoverage} refuses a model that is in neither table, so a NEW model
 * cannot arrive ungated by omission — somebody has to write a sentence here.
 */
export const DOMAIN_WRITE_UNGATED: Readonly<Record<string, string>> = {
  WaqfAccessGrant: 'AUTHORIZATION_PLANE_MODELS — gated by assertWritePolicy, more strictly.',
  Membership: 'AUTHORIZATION_PLANE_MODELS.',
  ApprovalRequest: 'AUTHORIZATION_PLANE_MODELS.',
  AuditEvent:
    'Append-only by database trigger (G-1). A mutation is impossible, not merely ungated.',
  AuditChainHead: 'Written only by the audit spine, inside the transaction it summarizes.',
  Client:
    'ABOVE the endowment (Client -> Waqif -> Waqf), so §3 — whose every row is per-endowment — has ' +
    'no cell for it. ⚠ SURFACED, NOT CLOSED: a create here is not scope-checked either, because ' +
    '`payloadWaqfId` finds no endowment to check against. Onboarding is E11 and owns both halves.',
  Waqif: 'Same as Client: above the endowment, no §3 row, create unscoped. E11.',
  User:
    'The staff directory / better-auth user record. Provisioning a seat is E11 (and the AUTHORITY ' +
    'a seat carries is `WaqfAccessGrant`, which IS gated).',
  AccessLevel:
    'Organisation-wide, above every endowment (migration 55) — no §3 row applies. A write is gated ' +
    'OUTSIDE this extension: `orgProcedure("admin:access_level:write")` on the API, the ' +
    'provisioning connection (the runtime role holds SELECT only), and `access_level_guard` in the ' +
    'database (system levels keep their key and cannot be deleted).',
  UserPermissionOverride:
    'Organisation-wide per-user ALLOW/DENY (migration 55). Same gate as AccessLevel: ' +
    '`orgProcedure("admin:user:write")`, provisioning connection only, and DELETE revoked from ' +
    'every application role — withdrawal stamps `deletedAt`.',
  Session: 'better-auth session store.',
  Account: 'better-auth credential records.',
  Verification: 'better-auth one-time tokens.',
  TwoFactor: 'better-auth TOTP secrets.',
  Vendor:
    'Global subcontractor registry, shared across every engagement — not endowment data, so no ' +
    '§3 row applies. ⚠ SURFACED: an admin-only write path for global reference data is E3.',
  HolidayCalendar: 'KSA public-holiday reference data. Same reasoning as Vendor.',
  ComplianceObligation:
    'The global obligation TEMPLATE library seeded from the regulation. Instances are ' +
    'ComplianceTask, which IS gated. Same reasoning as Vendor.',
  Notification: 'A derived UI artefact scoped to the calling user, with no legal significance.',
  Setting:
    '⚠ SURFACED, NOT RESOLVED — a QUESTION about the authority model, not an oversight. A `Setting` ' +
    'row has TWO legitimate writers with DIFFERENT permissions, and no single required permission is ' +
    'right for both: §3 row 11 gives `admin` R W on the configuration plane (`admin:setting:write` ' +
    'INITIATES a fee-basis change, EXIT-3), while the change itself is APPLIED by the Nazir under ' +
    '`fee:nazir_fee:approve` — which is what `settings.set` in packages/api is actually tagged with, ' +
    'and `admin` deliberately does not hold it. Requiring `admin:setting:write` would refuse the ' +
    'approving Nazir (measured: it broke five assertions across setting-resolver and ' +
    'audit-projection); accepting `fee:nazir_fee:approve` for EVERY key would let a fee approval ' +
    'rewrite the classification bands and the deadline windows too. That is an authority decision for ' +
    'the product owner, and it wants a per-KEY answer rather than a per-table one. Until then the ' +
    'procedure ladder in packages/api is the control (it tags both rungs) and this table is ungated ' +
    'at the force-filter.',
};

/**
 * Models a BENEFICIARY-scoped session may never write, and whose read set is EMPTY for it.
 *
 * §10 §5: beneficiary isolation is applied BEFORE role logic, so no role can widen it. The
 * authorization plane is here for the obvious reason, plus the two tables that would let a portal
 * session read the endowment's banking and the Nazir's remuneration.
 *
 * ⚠ THE UPDATE PATH IS THE ONE THAT WAS OPEN. Sprint 1's beneficiary guard lived ONLY inside
 * `assertCreateInScope` (the CREATE path); `UNIQUE_WRITE_OPS` authorized by a scope pre-check and
 * then passed the caller's `where` through as written; and `scopeFilter`'s beneficiary switch had no
 * `WaqfAccessGrant` case, so it fell through to `default: break` onto the ordinary
 * `{waqfId: {in: ids}}`. A beneficiary portal session could therefore run
 * `waqfAccessGrant.update({ where: { id: <own grant> }, data: { role: 'NAZIR' } })`.
 */
export const BENEFICIARY_FORBIDDEN_MODELS = [
  'WaqfAccessGrant',
  'ApprovalRequest',
  'Membership',
  'BankAccount',
  'NazirFee',
  // ── THE COMPLIANCE PLANE, added S8/E7 ──────────────────────────────────────────────────────
  // Every one of these fell through `default: break` onto `{waqfId: {in: ids}}`, so a portal
  // session's raw `complianceTask.findMany()` returned EVERY statutory duty on their endowment —
  // its status, its owner, its dates and its notes. Nothing legitimate reached it (the
  // `beneficiary` preset holds no `compliance:*` verb), which is precisely the shape of the
  // `AuditEvent` hole already closed a few lines below: unreachable through a procedure, wide open
  // through the force filter, and reachable the moment a router is mis-tagged. E7 ships that
  // router, so the fall-through stops being adjacent and becomes live.
  //
  // §10 §5 pins the portal seat to ITS OWN RECORD. A compliance register is the endowment's record
  // of the Nazir's duties — not the beneficiary's — and the leak is not abstract: an unmet
  // obligation, a REJECTED Authority filing, or a live `LegalCase` are exactly the facts a
  // beneficiary in dispute with the Nazir would want, arriving without any of the context a
  // statement would carry.
  'ComplianceTask',
  'GovernmentFiling',
  'LegalCase',
  'ZakatFiling',
  // ⚠ `Deadline` is the one with a real argument on the other side: `DISTRIBUTE_3M_FYE` is the date
  // a beneficiary is most entitled to ask about. It is refused here anyway, because the force
  // filter must fail CLOSED and because a deadline row carries every OTHER statutory clock too —
  // registration, istibdal notice, licence renewal. If the portal should show a distribution date,
  // that is an explicit case returning exactly that rule, not a table a seat can enumerate.
  'Deadline',
  // ── E7's AML compartment (S8) — THE SUBJECT MUST NEVER READ THE REPORT ────────────────────
  // §09 C2: a beneficiary named as a related party in a SAR must see nothing that references or
  // implies it. `amlClause` already subtracts these rows from a non-member, and a portal seat is
  // never a compartment member — but relying on that alone would make C2 depend on the compartment
  // list rather than on self-isolation, and the two are separate controls for a reason. Belt: a
  // portal session's read of these tables is EMPTY before the compartment predicate is even
  // consulted, so revoking a membership can never accidentally open a subject's own file to them.
  'AmlReport',
  'AmlFollowUp',
  // ── S9-3c · §09 Engine B's material-change change-set (migration 40) ───────────────────────
  // Refused to a portal seat for `Deadline`'s reason, one table earlier in the chain: a change row
  // says an ASSET, a BENEFICIARY or the NAZARAH changed, on a stated effective date, with a
  // `sourceRef`. That is a timeline of the endowment's internal events — including changes to OTHER
  // beneficiaries' records — and it is exactly what a beneficiary in dispute with the Nazir would
  // want, arriving with none of the context a statement would carry. If a portal should ever show
  // "your own record changed on <date>", that is an explicit case returning exactly that, not a
  // table a seat can enumerate.
  //
  // ⚠ HOW THIS ENTRY GOT HERE, recorded because the outcome was right and the route was not: this
  // line was first written for `WAQF_DIRECT_SCOPED_MODELS` and landed in THIS array, because both
  // lists end with the same `'AmlReport', 'AmlFollowUp',` pair and the patch matched the first one.
  // The api suite then failed in a way that looked like a scoping bug and was a MISSING scoping
  // entry. Both entries are now deliberate: this one is the portal-seat read boundary, the one in
  // the coverage list is what makes an ordinary caller's read work at all.
  'MaterialChange',
  // ── S9-3d · §09's escalation record (migration 41) ─────────────────────────────────────────
  // ⚠ REFUSED TO A PORTAL SEAT, and this is the sharpest member of the list rather than the
  // mildest. An escalation row says a statutory duty on this endowment went overdue, how many
  // business days late it is, and how far up the Nazir's own management chain it has been reported.
  // §09 rule 1 already singles out the escalation pipeline as the highest-risk outbound path; a
  // beneficiary in dispute with the Nazir reading the escalation history is that risk arriving
  // through the force filter instead of through a notification. If a portal should ever show a
  // beneficiary that their own distribution is late, that is a purpose-built statement, not a table
  // of internal escalations a seat can enumerate.
  'EscalationEvent',
  'OnboardingGate',
] as const;

/**
 * ⚠ THE LIST ABOVE IS NO LONGER THE WRITE BOUNDARY — IT IS ONLY THE READ BOUNDARY AND THE MESSAGE.
 *
 * A beneficiary-scoped session may not write ANY model, on ANY operation (C-07). §10 §5 makes the
 * portal seat READ-ONLY over its own data, and `assertCreateInScope` already refused a beneficiary
 * every CREATE unconditionally — but `assertWritePolicy` refused only the five models above, so
 * update/delete/upsert fell through for every ordinary model. Reproduced from the seeded portal seat:
 * `asset.update({data:{titleDeedNumber}})`, `waqf.update({data:{fiscalYearEnd}})` and
 * `asset.update({data:{deletedAt}})` (the sanctioned soft-delete path) all COMMITTED — an untrusted
 * external party rewriting a title-deed number, a soft-deleting corpus record, and moving the fiscal
 * year end that drives the 3-month post-FYE distribution window. The `permissions: []` variant
 * committed too, so it never depended on the preset carrying `beneficiary:beneficiary:write`.
 *
 * The denylist is kept because it still carries the READ set (`MATCH_NOTHING`) and because the
 * plane-specific refusal message is the one a reviewer needs to see; the write refusal is now
 * unconditional and does not consult it.
 *
 * ⚠ SURFACED, AND SINCE 2026-08-18 THE MODEL IS RULED — THE TIMING IS WHAT KEEPS THIS SHUT. §10 §2.2
 * gives the portal seat "submit own KYC & documents", and the product owner answered Q-E4-2 verbatim:
 * *"beneficiary should enter their own kyc info - staff verifies and can request more."* So the design
 * is **beneficiary-entered KYC, staff-verified with a request-more loop** — the beneficiary is the
 * maker of their own KYC record — and it **ships with the portal epic** (owner timing, same date).
 * Until then the seat writes nothing and staff enter KYC on a beneficiary's behalf as the **stated
 * interim**. ⚠ Do not restate that interim as the design: it is an operational fallback, and this
 * write-nothing posture is an implementation state of the ruled timing, not a decision that the
 * portal never writes. It still needs a deliberate, column-limited path (a field-level question, see
 * the gap above) — never a model-level hole.
 */

/** Own non-null `waqfId` column. */
export const WAQF_DIRECT_SCOPED_MODELS = [
  'TrusteeshipDeed',
  // The مآل clause's named takers (R7). Own non-null `waqfId`, like every other endowment child —
  // the clause disposes of ONE endowment, and the composite FK to `beneficiary(waqfId, id)` makes a
  // cross-endowment taker structurally impossible on top of this filter.
  'WaqfReversionTaker',
  'Asset',
  'Expropriation',
  'Beneficiary',
  'BankAccount',
  'Transaction',
  'Budget',
  'NazirFee',
  'Distribution',
  'ComplianceTask',
  'GovernmentFiling',
  'Deadline',
  'ReclassificationEvent',
  'Document',
  'Lease',
  'LegalCase',
  'ZakatFiling',
  'WaqfAccessGrant',
  'ApprovalRequest',
  // ── E7's AML compartment (S8) ──────────────────────────────────────────────────────────────
  // Both carry their own non-null `waqfId`, so both scope like any other endowment child. The
  // follow-up's `waqfId` is DENORMALISED rather than joined through its report, and a composite FK
  // (migration 29 §3) makes a cross-endowment follow-up structurally impossible — because a child
  // whose visibility depends on a join is a child one `include` away from being readable, and the
  // nested-`include` bypass of `amlClause` is a RECORDED gap, not a closed one.
  'AmlReport',
  'AmlFollowUp',
  // ── S9-3c · §09 Engine B's material-change change-set (migration 40) ───────────────────────
  // Own non-null `waqfId`, so it scopes like any other endowment child.
  //
  // ⚠ IT HAD TO JOIN THIS LIST, not merely be permitted to. A model in NO list fails closed, which
  // is the correct default and is how this omission surfaced: `recordMaterialChange` created a row
  // and the very next read INSIDE THE SAME TRANSACTION returned nothing, so the coalescer saw an
  // empty change-set and refused `UPDATE_OBLIGATION_WITHOUT_CAUSE` — a raw `$queryRawUnsafe` in the
  // same transaction saw the row with the right `waqfId`, which is what identified the force filter
  // as the cause. Fail-closed turned a missing classification into a loud, local failure instead of
  // a cross-endowment leak.
  'MaterialChange',
  // ── S9-3d · §09's escalation record (migration 41) ─────────────────────────────────────────
  // Own non-null `waqfId`; scopes like any other endowment child.
  'EscalationEvent',
  'OnboardingGate',
] as const;

// ⚠⚠ WARNING TO THE NEXT PERSON PATCHING A MODEL INTO A LIST IN THIS FILE — THIS HAS NOW HAPPENED
// TWICE. `WAQF_DIRECT_SCOPED_MODELS` (above) and `BENEFICIARY_FORBIDDEN_MODELS` (earlier) end with
// SIMILAR trailing entries and similar closing lines, and a patch keyed on the tail lands in
// whichever array comes first in the file. S9-3c's `MaterialChange` went into the wrong one and the
// symptom was a row invisible to a read in its own transaction; S9-3d's `EscalationEvent` did it
// again on the same trap. Anchor an edit on the array's OWN `export const` line, and afterwards
// COUNT the occurrences — `scoping-coverage.test.ts` catches an absence from ALL_MODELS but nothing
// catches presence in the wrong list except the behaviour going strange three layers away.

/**
 * Nullable `waqfId`, so a policy for the global rows is required.
 *
 *  • `Setting`    — global rows (`waqfId IS NULL`) hold the regulatory figures every screen
 *                   needs (classification bands, deadline windows, the rounding rule). They are
 *                   configuration, not client data, and are readable by any authenticated caller.
 *  • `AuditEvent` — global rows are AUTH and system events, which can concern OTHER users.
 *                   Excluded (fail-closed). A cross-endowment audit view is a deliberate
 *                   compliance/auditor feature, not a default.
 */
export const WAQF_NULLABLE_SCOPED_MODELS = {
  Setting: 'allow-global',
  AuditEvent: 'deny-global',
} as const satisfies Record<string, 'allow-global' | 'deny-global'>;

/** Reached through exactly one relation hop. */
export const PARENT_SCOPED_MODELS = {
  DistributionLineItem: 'distribution',
  MaintenanceTicket: 'asset',
} as const satisfies Record<string, string>;

/**
 * Above the endowment in the hierarchy (Client -> Waqif -> Waqf). Narrowed to the families and
 * endowers that own at least one endowment the caller may see — otherwise the client list would
 * enumerate every family QMULATE acts for.
 */
export const CLIENT_REACHABLE_MODELS = {
  Client: 'waqifs.waqfs',
  Waqif: 'waqfs',
  Membership: 'client.waqifs.waqfs',
} as const satisfies Record<string, string>;

/** Narrowed to the calling user's own rows. */
export const USER_SCOPED_MODELS = {
  Notification: 'userId',
} as const satisfies Record<string, string>;

/**
 * Deliberately NOT waqf-scoped. Each entry is a decision with a reason, so an unscoped table can
 * never be an oversight.
 */
export const UNSCOPED_MODELS: Record<string, string> = {
  User:
    'Staff directory. Names and emails of QMULATE personnel are not endowment data. A BENEFICIARY ' +
    'caller is still narrowed to their own row (see scopeFilter) so they cannot enumerate staff.',
  Vendor:
    'Global subcontractor registry (P-01..P-06, BR-305). Shared across every engagement by design.',
  HolidayCalendar:
    'KSA public-holiday reference data feeding business-day arithmetic. Contains no client data.',
  ComplianceObligation:
    'Global obligation TEMPLATE library seeded from the regulation. Instances are ComplianceTask, which IS scoped.',
  AuditChainHead:
    'Single bookkeeping row for the hash chain. Written only by the audit spine; never surfaced to a caller.',
  Session:
    'better-auth session store, keyed by user, not by endowment. Access is governed by session ownership.',
  Account: 'better-auth credential/provider records. Never surfaced through the domain API.',
  Verification: 'better-auth one-time tokens. Short-lived; never surfaced.',
  TwoFactor: 'better-auth TOTP secrets and backup codes. Never surfaced.',
  AccessLevel:
    'The organisation-wide access levels (migration 55): configuration rows, no endowment data. ' +
    'Read by any authenticated caller for navigation; written only on the provisioning connection.',
  UserPermissionOverride:
    'Per-user organisation-scope ALLOW/DENY rows (migration 55). No endowment data; written only on ' +
    'the provisioning connection through the audited admin path.',
};

/** Every model in `schema.prisma`. Kept explicit so coverage is reviewable in a diff. */
export const ALL_MODELS = [
  'Client',
  'Waqif',
  'Waqf',
  'WaqfReversionTaker',
  'TrusteeshipDeed',
  'Asset',
  'Expropriation',
  'Beneficiary',
  'BankAccount',
  'Transaction',
  'Budget',
  'NazirFee',
  'Distribution',
  'DistributionLineItem',
  'ComplianceObligation',
  'ComplianceTask',
  'GovernmentFiling',
  'Deadline',
  // ⊕ S9-3c (migration 40) — §09's material-change change-set, beside the deadlines it clocks.
  'MaterialChange',
  // ⊕ S9-3d (migration 41) — the escalation record for those deadlines.
  'EscalationEvent',
  'OnboardingGate',
  'ReclassificationEvent',
  'Document',
  'Lease',
  'MaintenanceTicket',
  'Vendor',
  'LegalCase',
  'ZakatFiling',
  'User',
  'AccessLevel',
  'UserPermissionOverride',
  'Session',
  'Account',
  'Verification',
  'TwoFactor',
  'Membership',
  'WaqfAccessGrant',
  'ApprovalRequest',
  'AuditEvent',
  'AuditChainHead',
  'Setting',
  'HolidayCalendar',
  'Notification',
  'AmlReport',
  'AmlFollowUp',
] as const;

/**
 * Enforcement that is specified but NOT delivered in Sprint 1. Exported so the sprint report and
 * the S2 planning session read from the same list instead of rediscovering it.
 */
export const SCOPING_KNOWN_GAPS: readonly string[] = [
  'CREATE on a parent-scoped model (DistributionLineItem, MaintenanceTicket) is not verified against the ' +
    'caller grants: proving it needs a read of the parent row, which a query extension cannot do without ' +
    'the surrounding transaction. The API-layer procedure check covers it in E2/S2.',
  'RAW SQL STILL DEFEATS THIS EXTENSION, AND THE DATABASE GUARDS DO NOT MAKE IT SAFE. An earlier version ' +
    'of this entry asserted that the authority invariants survive a raw statement as a SECURITY property. ' +
    'What is TRUE: migrations 3 and 4 install them as CHECKs and ENABLE ALWAYS triggers, so they hold ' +
    'against `session_replication_role = replica` and against a statement that never touches this ' +
    'extension, and migration 5 adds admission control that refuses an UNAUDITED raw INSERT or widening ' +
    'UPDATE on waqf_access_grant. What was FALSE is the conclusion drawn from it, because a CHECK inspects ' +
    'a row SHAPE and never its PROVENANCE: waqf_access_grant_no_self_issue compares two columns the ' +
    'ATTACKER supplies (naming any third party as grantedByUserId passes it), role immutability is BEFORE ' +
    'UPDATE while a forged seat is an INSERT, and the permission guard positively PERMITS the approve verbs ' +
    'because role = NAZIR is exactly the role entitled to hold them. THREE THINGS REMAIN OPEN, ALL ' +
    'MEASURED FROM A SCOPED CLIENT ON A MIGRATED + SEEDED DATABASE, NOT ASSUMED. (1) AN UNAUDITED RAW ' +
    'WRITE TO AN AUDITED MODEL: `UPDATE "asset" SET "valuationSar" = 777777.77 WHERE "id" = ' +
    "'asset-001'` was PERMITTED, moved a corpus asset from 18,000,000.00 to 777,777.77, and left " +
    'audit_event at 132 -> 132 — no event at all. Migration 4 gates titleDeedNumber and migration 5 gates ' +
    'one table; neither is a general audit guarantee, and this statement walks past both. (2) ROW ' +
    'VISIBILITY: `$queryRawUnsafe(SELECT "id" FROM "waqf")` from a client scoped to waqf-001 returned all ' +
    'four endowments, while the force-filtered read returned one. RLS is installed on the AUTHORIZATION ' +
    'PLANE only (migration 11: waqf_access_grant + membership, ENABLE + FORCE), never on the endowment ' +
    'tables, so this read is still wide open and is pinned by base-client-bypass.integration.test.ts. ' +
    '(3) ⚠ ITEM (3) IS **CLOSED FOR THE RUNTIME ROLE** SINCE ADR-0008 ROUND 6, AND THE WORDING HERE IS ' +
    'DELIBERATELY NARROW. It used to read "THE OWNER CAN SWITCH THE GUARDS OFF: on Railway the runtime ' +
    'connects as the database OWNER". The runtime now connects as qmulate_app, which owns nothing: ' +
    'MEASURED as that role, ALTER TABLE … DISABLE TRIGGER / DROP TRIGGER / ALTER TABLE … DROP CONSTRAINT ' +
    '/ CREATE OR REPLACE FUNCTION are 42501, SET session_replication_role = replica is 42501 (it needs ' +
    'SUPERUSER, which retires that whole bypass class for the runtime), and INSERT on waqf_access_grant ' +
    'is 42501 both by REVOKE and, if the GRANT is ever restored, by migration 11 RLS. See ' +
    'authorization-plane-privilege.integration.test.ts, whose every mutation is run. WHAT REPLACED IT: ' +
    'the same power now lives on MIGRATOR_DATABASE_URL (qmulate_owner) and on the platform superuser, ' +
    'so anyone holding EITHER credential can still switch every guard off — and whoever holds ' +
    'ACCESS_MATRIX_DATABASE_URL can still forge a grant (pinned as a PASSING attack in that file 6c). ' +
    'Which credential a deployed service holds is a DEPLOYMENT fact no test can assert; ' +
    'assertNoPrivilegedDatabaseUrls() at each app boot is the only in-repo detector. Items (1) and (2) ' +
    'above are UNCHANGED and still open, so an insider with application-database credentials remains IN ' +
    'the threat model and DATA_CLASSIFICATION stays fixture-only until ADR-0008 round 6 open questions ' +
    'are answered.',
  'PERMISSIONS ARE INTERPRETED ON THE AUTHORIZATION PLANE (every column, every operation) AND ON THE ' +
    'OBLIGATION-GATING COLUMNS OF ORDINARY MODELS (DOMAIN_WRITE_POLICIES). Both are fail-closed on an absent ' +
    'permission list. WHAT IS STILL OPEN, PRECISELY: (1) a column that gates NOTHING is still authorized by ' +
    'ENDOWMENT MEMBERSHIP alone, so a seat holding any write-capable grant on waqf A can still write A rows ' +
    'the grid gives its module no W cell for, as long as no governed column is touched; (2) the CREATE of a ' +
    'CHILD row is not column-gated — only a self-scoped model (Waqf) is, because that is the one create no ' +
    'other check covers — so an Asset can still be CREATED with any valuation by a seat holding no ' +
    'endowment:asset:write; (3) `deletedAt` is deliberately ungoverned BY THIS LAYER, so a SOFT DELETE is ' +
    'membership-only wherever the DATABASE does not refuse it — which since migration 14/15 is everywhere ' +
    'EXCEPT the corpus asset. ⚠ ITEM (3) IS CORRECTED, NOT REPLACED, AND THE PREVIOUS WORDING WAS FALSE. It ' +
    'used to read "so a SOFT DELETE of a corpus asset OR AN ENDOWMENT RECORD is still membership-only", and ' +
    'the corpus-asset half stopped being true the day migration 14 shipped — reported by round 3 and left ' +
    'standing until now. A comment that claims an exposure already closed is the same defect as one that ' +
    'claims a protection that does not exist (S2 false-comment finding, ADR-0008 §2.4): both stop a reader ' +
    'looking. MEASURED as `qmulate_app`, no approval in session, every probe rolled back: `UPDATE "asset" ' +
    'SET "deletedAt" = now()` is REFUSED 42501 as a RESERVED MATTER (migration 14 §1c) and so is an INSERT ' +
    'carrying it (migration 15 §0b); while `UPDATE "waqf" SET "deletedAt" = now()` COMMITS, an endowment can ' +
    'be INSERTed already carrying `deletedAt`, and the same holds on `beneficiary` and `trusteeship_deed`. ' +
    'What stayed true is the premise — DOMAIN_WRITE_POLICIES asks nothing about `deletedAt` on any model; ' +
    'what was false is the conclusion, because a stronger control landed one layer down. ⚠⚠ AND SINCE ' +
    '2026-08-17 THE SENTENCE "everywhere EXCEPT the corpus asset" IS ITSELF OUT OF DATE — annotated, not ' +
    'rewritten, for the reason the previous correction gives. The product owner ruled on both open ' +
    'questions (S4 owner-decision memo Q8 and Q10) and migration 17 implements them: `UPDATE "waqf" SET ' +
    '"deletedAt"` is now REFUSED 42501 in BOTH directions without an approved, artifact-bound reserved ' +
    'matter naming "waqf:<id>:deletedAt", and EVERY column of a recorded `trusteeship_deed` — deletedAt ' +
    'included — is refused outright for EVERY seat. RE-MEASURED as qmulate_app, rolled back. So the ' +
    'membership-only residue of item (3) is now: `beneficiary."deletedAt"` (never asked about), and the ' +
    '`waqf` INSERT carrying `deletedAt` (an endowment BORN retired — still COMMITS, still reported, and ' +
    'declared per column in guard-verb-coverage.integration.test.ts). ⚠ The CORPUS-PARCEL TODO(surface) ' +
    'stays open: memo Q8 answered the ENDOWMENT question, not the parcel one. All items are reported, ' +
    'not assumed away. The ' +
    'per-procedure permission check in packages/api remains the primary control (§10 §7.2); items (1) and ' +
    '(2) do not survive raw SQL — see the raw-SQL entry above — whereas the corpus-asset half of (3) is now ' +
    'closed by an ENABLE ALWAYS trigger, which does.',
  '`ctx.permissions` is ONE FLAT LIST for the whole request, not a per-endowment map. That is sound only ' +
    'because the force-filter has already narrowed every query to `authorizedWaqfIds`. A caller holding ' +
    'different verbs on different endowments needs `Map<waqfId, PermissionString[]>` — surfaced for E3.',
  'Field-level (column) authorization is still not modelled. `dataScopes` on WaqfAccessGrant remains stored ' +
    'and uninterpreted. Full field-level UBO isolation is E4/S5; E2 proves the row-level half.',
  'RELATION-NESTED WRITES: BOTH HALVES ARE NOW CLOSED, IN TWO SEPARATE WALKS. `assertNestedWritesAuthorized` ' +
    'here applies the full write policy to every nested row ("may this actor write that row"). ' +
    '`assertNestedWritesAuditable` in `extensions/audit.ts` answers the different question ("can the trail ' +
    'record it") and REFUSES any nested write into an audited model outright, for every context including ' +
    'bypassed ones — a permitted write can still be unauditable, and round 1 shipped exactly that gap: a ' +
    "nested update rewrote asset-001's title-deed number and audit_event gained one event naming the PARENT " +
    'Waqf and none naming the Asset. The two walks are deliberately NOT merged: this one short-circuits on ' +
    '`isBypassed(ctx)`, so the seed and every data migration are covered only by the audit-side walk. What ' +
    'this costs: a nested write must be reissued as the equivalent top-level operation, wrapped in ' +
    '`withAudit()` when the statements must commit together. Neither walk survives raw SQL — see the ' +
    'raw-SQL entry above.',
  'A beneficiary-scoped session now writes NOTHING, on any model, on any operation. §10 §2.2 nonetheless ' +
    'gives the portal seat "submit own KYC & documents". That path needs a deliberate, column-limited design ' +
    '(it is a field-level question, see the gap above) — it is deliberately NOT reopened at model level. ' +
    '⚠ THE MODEL IS RULED AND THIS POSTURE IS AN IMPLEMENTATION STATE, NOT THE DESIGN (product owner, ' +
    'Q-E4-2, 2026-08-18): beneficiary-entered KYC, staff-verified with a request-more loop — the ' +
    'beneficiary is the MAKER of their own KYC record. It ships with the PORTAL EPIC (owner timing, same ' +
    "date); staff recording KYC on a beneficiary's behalf is the stated INTERIM and must never be written " +
    "down as the product's model. So this entry records a TIMING, not a decision that the portal writes " +
    'nothing.',
  'NESTED `include` / RELATION `select` IS NOT FILTERED, SO amlClause AND EVERY OTHER CLAUSE APPLY TO THE ' +
    'TOP-LEVEL MODEL ONLY. Recorded in S8/E7 because it was ABSENT from this list, which is worse than ' +
    'being on it: a reviewer auditing the known gaps found raw SQL, per-endowment permissions, ' +
    'field-level authorization, parent-scoped CREATE and nested WRITES all declared here, concluded the ' +
    'list was the boundary, and never learned about this one. The read path is ' +
    '`query({ ...args, where: andWhere(args?.where, filter) })` — `include` and nested relation `select` ' +
    'are passed through UNTOUCHED, and `include` appears nowhere in this file as a handled argument key. ' +
    'THE CONSEQUENCE THAT MATTERS: an AML_RESTRICTED row reachable as a RELATION of a permitted parent is ' +
    'returned without ever passing amlClause — e.g. ' +
    '`beneficiary.findFirst({ where: { id: self }, include: { documents: true } })`, where the parent read ' +
    "is legitimately the caller's own record and the child set is the compartment. It is a CODE-PATH " +
    'finding, NOT a measured exploit: no query was executed to demonstrate it, so it is stated as ' +
    'PLAUSIBLE rather than CONFIRMED, and closing it is a real design question (filtering nested reads ' +
    'means walking the args tree per model, which is where a query extension stops being cheap). Until ' +
    "then the API layer's procedure projections are the control — which is a convention, not a " +
    'structure, and conventions are what this list exists to stop being mistaken for structures.',
];

const SELF_SET = new Set<string>(WAQF_SELF_SCOPED_MODELS);
const DIRECT_SET = new Set<string>(WAQF_DIRECT_SCOPED_MODELS);
const BENEFICIARY_FORBIDDEN_SET = new Set<string>(BENEFICIARY_FORBIDDEN_MODELS);

/**
 * Throws if any model in {@link ALL_MODELS} is unclassified or classified twice.
 *
 * ⚠ **WHAT THIS DOES NOT DO, stated because a comment elsewhere claimed it did:** it does not compare
 * anything to `schema.prisma`. It is a statement about `ALL_MODELS`' internal consistency, not about
 * whether `ALL_MODELS` knows what the schema contains. The schema↔array parity is a separate
 * assertion, and both live in `test/scoping-coverage.test.ts` — which is the call site this docstring
 * asked for and did not have for six sprints.
 */
export function assertScopingCoverage(): void {
  const problems: string[] = [];
  for (const model of ALL_MODELS) {
    const hits = [
      SELF_SET.has(model),
      DIRECT_SET.has(model),
      model in WAQF_NULLABLE_SCOPED_MODELS,
      model in PARENT_SCOPED_MODELS,
      model in CLIENT_REACHABLE_MODELS,
      model in USER_SCOPED_MODELS,
      model in UNSCOPED_MODELS,
    ].filter(Boolean).length;

    if (hits === 0)
      problems.push(
        `${model} is not classified — add it to a scoping list (fail-closed until you do)`,
      );
    if (hits > 1)
      problems.push(`${model} is classified ${hits} times — it must appear in exactly one list`);
  }
  if (problems.length)
    throw new Error(`scoping coverage is incomplete:\n  - ${problems.join('\n  - ')}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Denial hook
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface ScopeDenial {
  model: string;
  operation: string;
  ctx: RequestContext;
  reason: string;
  attemptedWaqfId?: string | null;
}

export type ScopeDenialHandler = (denial: ScopeDenial) => void;

let denialHandler: ScopeDenialHandler = () => {
  /* no-op by default; client.ts installs one that records an ACCESS_DENIED audit event */
};

/**
 * Registers the callback fired when a write is refused for being out of scope.
 *
 * Only WRITE denials reach it. A read denial is not an event — the filter simply returns fewer
 * rows, and there is no way to tell "asked for something forbidden" apart from "asked for
 * something that does not exist". Recording every narrowed read would drown the trail.
 */
export function setScopeDenialHandler(handler: ScopeDenialHandler): void {
  denialHandler = handler;
}

function deny(denial: ScopeDenial): never {
  try {
    denialHandler(denial);
  } catch {
    // The denial itself must still propagate even if recording it fails.
  }
  throw new ForbiddenScopeError(denial.model, denial.operation, denial.reason);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Filter construction
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Matches nothing, on every model (`id` exists on all of them). */
const MATCH_NOTHING = { id: { in: [] as string[] } };

function isAuthenticated(ctx: RequestContext): boolean {
  return ctx.actorType !== 'USER' || ctx.actorId !== null;
}

/** `{ waqfs: { some: { id: { in } } } }` from a dotted relation path. */
function nestedSome(
  pathSegments: readonly string[],
  leaf: Record<string, unknown>,
): Record<string, unknown> {
  return pathSegments.reduceRight<Record<string, unknown>>(
    (acc, segment) => ({ [segment]: { some: acc } }),
    leaf,
  );
}

/** `{ distribution: { waqfId: { in } } }` — a to-one hop needs `is`-style nesting, not `some`. */
function nestedIs(relation: string, leaf: Record<string, unknown>): Record<string, unknown> {
  return { [relation]: leaf };
}

/**
 * The predicate to AND into every query on `model`, or `null` for "no restriction".
 *
 * Exported so tests can assert the shape directly — the E1 DoD marks "access enforced" as only
 * PARTIALLY applicable in S1 (the tRPC procedure ladder is E2/S2), so the extension's own
 * fail-closed behaviour is what gets asserted.
 */
export function scopeFilter(model: string, ctx: RequestContext): Record<string, unknown> | null {
  // 1. Unauthenticated: nothing, on every model, including the global ones.
  if (!isAuthenticated(ctx)) return MATCH_NOTHING;

  // 2. Explicit bypass: seed, jobs, migrations. Audit and encryption still apply.
  if (isBypassed(ctx)) return null;

  const ids = ctx.authorizedWaqfIds;
  const selfId = ctx.beneficiarySelfId ?? null;

  // 3. Beneficiary self-isolation — BEFORE role logic (§10 §5). A beneficiary login is pinned to
  //    its own record: it can never enumerate co-beneficiaries, other endowments, or the ledger.
  if (selfId) {
    // THE AUTHORIZATION PLANE IS INVISIBLE TO A PORTAL SESSION, not merely unwritable.
    //
    // Checked BEFORE the switch so it cannot be forgotten when a case is added, and expressed as a
    // set membership rather than as cases so the list is reviewable in one place. Sprint 1's switch
    // had no `WaqfAccessGrant` case at all and fell through to the ordinary `{waqfId: {in: ids}}`,
    // which is what made `waqfAccessGrant.update({ where: { id: <own grant> }, data: { role:
    // 'NAZIR' } })` reachable from a beneficiary login.
    //
    // `Membership` was previously narrowed to the caller's own rows here. It is now EMPTY too: a
    // beneficiary has no business enumerating the family's access matrix, and "their own row" is the
    // one row that tells them a seat exists to be escalated.
    if (BENEFICIARY_FORBIDDEN_SET.has(model)) return MATCH_NOTHING;

    switch (model) {
      case 'Beneficiary':
        return { AND: [{ waqfId: { in: ids } }, { id: selfId }, amlClause(ctx)] };
      case 'DistributionLineItem':
        return {
          AND: [nestedIs('distribution', { waqfId: { in: ids } }), { beneficiaryId: selfId }],
        };
      case 'Document':
        return {
          AND: [{ waqfId: { in: ids } }, { beneficiaryId: selfId }, amlClause(ctx)],
        };
      case 'Transaction':
        // A beneficiary sees their distribution statements, never the raw ledger.
        return MATCH_NOTHING;
      case 'AuditEvent':
        // THE PORTAL SEAT HAS NO AUDIT FEED. `AuditEvent` had no beneficiary case, so it fell
        // through to `{waqfId: {in: ids}}` and a portal session could enumerate the endowment's
        // ENTIRE activity trail — 31 events on the fixture DB, including every staff actorId and the
        // before/after image of every row the endowment ever wrote. §10 §5 pins the seat to its own
        // record; the trail of everyone else's work is not its own record. (The `beneficiary` preset
        // holds no `audit:event:read`, so nothing legitimate reads this today.)
        return MATCH_NOTHING;
      case 'User':
        return { id: ctx.actorId ?? '' };
      default:
        break; // fall through to the ordinary rules
    }
  }

  // 4. The ordinary case.
  if (SELF_SET.has(model)) return { id: { in: ids } };

  if (DIRECT_SET.has(model)) {
    // `amlClauseFor` returns the clause only for the models that actually carry a `confidentiality`
    // column (AML_CONFIDENTIALITY_MODELS, compared against schema.prisma by a test). Sprint 1 spelt
    // the same thing as an inline `model === 'Beneficiary' || model === 'Document'` — a hand-copied
    // list of the kind that goes stale the first time a model gains the column.
    const aml = amlClauseFor(model, ctx);
    return aml === null ? { waqfId: { in: ids } } : { AND: [{ waqfId: { in: ids } }, aml] };
  }

  if (model in WAQF_NULLABLE_SCOPED_MODELS) {
    const policy = WAQF_NULLABLE_SCOPED_MODELS[model as keyof typeof WAQF_NULLABLE_SCOPED_MODELS];
    const base =
      policy === 'allow-global'
        ? { OR: [{ waqfId: { in: ids } }, { waqfId: null }] }
        : { waqfId: { in: ids } };
    // THE AML COMPARTMENT IS SUBTRACTED FROM THE AUDIT FEED TOO (C-06).
    const audit = auditCompartmentClause(model, ctx);
    return audit === null ? base : { AND: [base, audit] };
  }

  if (model in PARENT_SCOPED_MODELS) {
    const relation = PARENT_SCOPED_MODELS[model as keyof typeof PARENT_SCOPED_MODELS];
    return nestedIs(relation, { waqfId: { in: ids } });
  }

  if (model in CLIENT_REACHABLE_MODELS) {
    const path = CLIENT_REACHABLE_MODELS[model as keyof typeof CLIENT_REACHABLE_MODELS].split('.');
    // The last segment is the to-many hop that lands on Waqf; earlier segments may be to-one.
    if (model === 'Membership') {
      return { client: nestedSome(['waqifs', 'waqfs'], { id: { in: ids } }) };
    }
    return nestedSome(path, { id: { in: ids } });
  }

  if (model in USER_SCOPED_MODELS) {
    return { userId: ctx.actorId ?? '' };
  }

  if (model in UNSCOPED_MODELS) {
    // ⊕ S8-Q1 — AN UNSCOPED MODEL CAN STILL BE COMPARTMENTED, and before this it could not.
    //
    // `null` means "no filter", which is right for global reference data — a holiday calendar is not
    // an endowment's. But `compliance_obligation` is global reference data that now carries a
    // `confidentiality` column, because the owner ruled the GOV-AML-02 obligation row itself
    // compartmented (S8-Q1, 2026-08-23). Returning `null` for it would hand every authenticated
    // caller the AML obligation row — the exact tip-off the ruling exists to prevent, and reached
    // through the branch that looks least like a decision.
    //
    // ⚠ This is the ONLY place in this function where an unscoped model gets a predicate, and the
    // predicate is the compartment's alone: there is no endowment narrowing, because there is no
    // endowment. A non-member sees the catalogue minus the restricted rows; a member sees all of it.
    const aml = amlClauseFor(model, ctx);
    // `{}` from `amlClauseGlobal` means "member — no subtraction", which is the same as `null` here.
    return aml === null || Object.keys(aml).length === 0 ? null : aml;
  }

  // 6. Unknown model: fail closed. Reaching here means schema.prisma gained a table and nobody
  //    decided how it is scoped.
  return MATCH_NOTHING;
}

/**
 * The models `amlClause()` may be applied to: exactly those carrying a `confidentiality` column.
 *
 * ⚠ COMPARED AGAINST `schema.prisma` AT TEST TIME (`grant-escalation.integration.test.ts`), in both
 * directions. Two reasons it must be a closed, checked list rather than "whatever has the column":
 *
 *  • a model that GAINS a `confidentiality` column but is not listed here would keep returning its
 *    AML_RESTRICTED rows to everyone — the compartment leaks;
 *  • a model listed here that does NOT have the column produces a Prisma validation error on every
 *    query, i.e. an outage;
 *  • and an APPROVAL-BEARING table must never be pulled into the compartment at all. §10 §6 hides a
 *    compartment from everyone outside it "including the Nazir by default", so an approval hidden by
 *    AML classification is an approval the legally accountable Nazir cannot audit — a direct BR-105
 *    violation, and the hardest kind to detect because the evidence is hidden by design.
 */
export const AML_CONFIDENTIALITY_MODELS = [
  'Beneficiary',
  'Document',
  // ⊕ E7/S8 — the compartment finally has its own SUBJECT. Before this it protected only rows on
  // OTHER models that happened to be labelled restricted; `aml-compartment.integration.test.ts`
  // said so in terms and told the reader not to claim AC-3 green.
  //
  // ⚠ These two are here BECAUSE their column is spelled `confidentiality`. §09's own TS shape calls
  // it `visibility`, and a `visibility` column would have been invisible to this list, invisible to
  // `amlClause`'s predicate, invisible to `deriveClassification`, and invisible to the both-directions
  // parity test that keys on the literal `confidentiality Confidentiality` — four controls defeated
  // by a field name, with nothing turning red. The name is the control.
  'AmlReport',
  'AmlFollowUp',
  // ⊕ S8-Q1 (owner, 2026-08-23) — "compartment the row". The AML obligation and its task instances
  // are AML-attributable state, so they are subtracted from a non-member exactly like a SAR is.
  //
  // ⚠ `ComplianceObligation` IS UNSCOPED (global reference data), and `amlClauseFor` was only ever
  // reached from the endowment-scoped branch — so listing it here required giving the UNSCOPED branch
  // an AML arm it had never had. That is a change to the shape of the force filter for every global
  // reference table, not a copy of the SAR wiring, which is why it landed as its own stage.
  'ComplianceObligation',
  'ComplianceTask',
] as const;

const AML_MODEL_SET = new Set<string>(AML_CONFIDENTIALITY_MODELS);

/**
 * AML no-tipping-off compartment (BR-604). Subtractive: hides `AML_RESTRICTED` rows unless the
 * caller is inside the compartment FOR THAT ENDOWMENT. Expressed as an OR so a caller who is
 * compartment-cleared for SOME of their endowments still sees the restricted rows for exactly
 * those, and not for the others.
 *
 * ── THE PER-WAQF LIST IS THE ONLY AUTHORITY (T-27) ───────────────────────────────────────────
 * Sprint 1 opened with `if (ctx.canViewAmlRestricted) return null;` — NO RESTRICTION WHATSOEVER, on
 * every endowment, the instant one boolean was true, and BEFORE the per-waqf compartment list was
 * consulted at all. `makeSystemContext()` defaulted that boolean to `true`. The compartment is
 * INVISIBILITY, not redaction (§10 §6), and the Nazir is NOT a member by default — so a global flag
 * is not a shortcut for it, it is its negation. The short-circuit is gone and
 * `ctx.canViewAmlRestricted` is not read here at all; `RequestContext` documents it as posture only,
 * and `grant-escalation.integration.test.ts` scans this file's source to prove the field is not
 * referenced.
 *
 * NEVER RETURNS `null`. An empty compartment list is the DEFAULT and it subtracts every restricted
 * row — which is what fail-closed means for a table whose rows must be invisible rather than merely
 * unreadable.
 */
function amlClause(ctx: RequestContext): Record<string, unknown> {
  const compartments = ctx.amlCompartmentWaqfIds ?? [];
  if (compartments.length === 0) return { confidentiality: { not: 'AML_RESTRICTED' } };
  return { OR: [{ confidentiality: { not: 'AML_RESTRICTED' } }, { waqfId: { in: compartments } }] };
}

/**
 * The compartment clause for a GLOBAL (unscoped) model — ⊕ S8-Q1.
 *
 * ⚠ **`amlClause()` CANNOT BE REUSED HERE, AND THE REASON IS NOT A TECHNICALITY.** It ORs on
 * `{ waqfId: { in: compartments } }`, because membership is per-endowment. A global reference row has
 * no `waqfId` — so that predicate matches nothing, and reusing it made the restricted obligation
 * invisible **to members as well**: measured, the member's own read came back empty. A compartment
 * that hides a row from its own members is not a compartment, it is an outage.
 *
 * So the rule for a global row is necessarily different, and it is stated rather than inferred:
 * **a caller inside ANY endowment's compartment may read the global AML obligation template.** That
 * is a widening compared to the per-endowment rule, and it is the correct one — the template is the
 * REGULATION'S TEXT, which belongs to no endowment. The endowment-specific fact is the `ComplianceTask`
 * instance, which stays per-endowment on the ordinary clause.
 *
 * ⚠ What this does NOT do is make membership global: a caller inside no compartment still cannot see
 * the row, which is the whole of S8-Q1.
 */
function amlClauseGlobal(ctx: RequestContext): Record<string, unknown> {
  const compartments = ctx.amlCompartmentWaqfIds ?? [];
  return compartments.length === 0 ? { confidentiality: { not: 'AML_RESTRICTED' } } : {};
}

/** `amlClause()` for models that carry the column; `null` for every other model. */
function amlClauseFor(model: string, ctx: RequestContext): Record<string, unknown> | null {
  if (!AML_MODEL_SET.has(model)) return null;
  // A global model's membership cannot be keyed on an endowment it does not belong to.
  return model in UNSCOPED_MODELS ? amlClauseGlobal(ctx) : amlClause(ctx);
}

/**
 * THE SAME COMPARTMENT, ON THE AUDIT FEED (C-06). `AuditEvent` carries no `confidentiality` column,
 * so it can never join `AML_CONFIDENTIALITY_MODELS` — it needs its own predicate, keyed on
 * `AuditEvent.classification`.
 *
 * ── WHAT LEAKED ──────────────────────────────────────────────────────────────────────────────
 * `AuditEvent`'s ENTIRE read predicate was `{ waqfId: { in: ids } }`, and NOTHING in this package
 * ever filtered on `classification` — the label was written by `deriveClassification()` and never
 * read. Reproduced: a non-member Nazir (`amlCompartmentWaqfIds: []`) got `document.findMany() => []`
 * and `document.count() => 0` — that half worked — while
 * `auditEvent.findMany({where:{entityType:'Document', entityId:<the restricted doc>}})` returned the
 * event with the WHOLE restricted row in `after` (titleAr, type `kyc_aml`, storageKey,
 * `confidentiality: AML_RESTRICTED`), and `auditEvent.count({where:{classification:'RESTRICTED'}})`
 * returned 1 — a direct enumeration oracle. `audit:event:read` sits in 10 of the 13 presets, and
 * `middleware/aml.ts` records a non-member's ATTEMPT as `classification:'RESTRICTED'`, so the very
 * event whose purpose is to stay out of "the feed a non-member can read" was in it. §10 §6 is
 * explicit: "not as a greyed row, not as a count, **not in the audit-trail feed shown to
 * non-members**, not in any export or evidence pack".
 *
 * INVISIBILITY, NOT REDACTION, and the Nazir is NOT a member by default — an empty compartment list
 * subtracts every RESTRICTED row, exactly as `amlClause()` does for the rows themselves.
 *
 * BLAST RADIUS IS BOUNDED AND PINNED: `deriveClassification()` marks RESTRICTED only for
 * `confidentiality === 'AML_RESTRICTED'`, `action === 'AML_REPORT'`, or an explicit
 * `classification: 'RESTRICTED'`. It can never swallow an APPROVE event — `approval-authority`
 * already asserts an APPROVE event is not RESTRICTED, and this file's tests assert the converse — so
 * the legally accountable Nazir never loses sight of an approval (BR-105).
 */
function auditCompartmentClause(
  model: string,
  ctx: RequestContext,
): Record<string, unknown> | null {
  if (model !== 'AuditEvent') return null;
  const notRestricted = { classification: { not: 'RESTRICTED' } };
  const compartments = ctx.amlCompartmentWaqfIds ?? [];
  if (compartments.length === 0) return notRestricted;
  return { OR: [notRestricted, { waqfId: { in: compartments } }] };
}

function andWhere(existing: unknown, injected: Record<string, unknown>): Record<string, unknown> {
  if (existing === undefined || existing === null) return injected;
  return { AND: [existing, injected] };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Operation classification
// ═══════════════════════════════════════════════════════════════════════════════════════════

const READ_OPS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);
/** Need a `where` injected, but Prisma requires a unique field, so they are rewritten. */
const UNIQUE_READ_OPS = new Set(['findUnique', 'findUniqueOrThrow']);
/**
 * Write ops whose `where` is a plain `WhereInput` — the scope filter can simply be AND-ed in.
 */
const WHERE_WRITE_OPS = new Set(['updateMany', 'updateManyAndReturn', 'deleteMany']);

/**
 * Write ops whose `where` is a `WhereUniqueInput`.
 *
 * These need the SAME treatment as `UNIQUE_READ_OPS` and, until adversarial review caught it,
 * did not get it: the extension AND-ed the scope filter into a unique-only `where`, producing
 * `{ AND: [{ id: … }, { waqfId: { in: […] } }] }`. Prisma generates `XWhereUniqueInput` as
 * `AtLeast<{…}, "id">`, i.e. the unique field must appear at the TOP level — so burying it
 * inside `AND` is a validation error, and **every scoped write threw** for a real caller:
 *
 *   PrismaClientValidationError: Invalid `prisma.asset.update()` invocation
 *
 * Reads worked, `create` worked, and the seed worked (it runs bypassed), so nothing caught it.
 *
 * The fix cannot be "rewrite to updateMany": the audit extension needs a per-row before-image
 * and deliberately refuses bulk operations. So authorization is enforced as a **scoped
 * pre-check** — resolve the target through the scope filter first, and only then hand the
 * caller's own untouched unique `where` to Prisma.
 */
const UNIQUE_WRITE_OPS = new Set(['update', 'delete', 'upsert']);
const CREATE_OPS = new Set(['create', 'createMany', 'createManyAndReturn']);

function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * THE AUTHORIZATION-PLANE WRITE POLICY. Applied to EVERY write operation, not only `create`.
 *
 * Three refusals, in this order, each of them fail-closed:
 *
 *  1. an unauthenticated caller writes nothing, ever;
 *  2. a BENEFICIARY-scoped session may not write any model in `BENEFICIARY_FORBIDDEN_MODELS` — and
 *     this is the clause whose absence on the UPDATE path was the live escalation: the Sprint-1
 *     guard existed only inside `assertCreateInScope`;
 *  3. a write to an `AUTHORIZATION_PLANE_MODELS` table requires the caller to hold the named
 *     permission in `ctx.permissions`. An ABSENT list denies — a context that has not resolved its
 *     permissions cannot issue a grant. That is the opposite of the Sprint-1 behaviour, where
 *     `permissions` were "stored but not yet interpreted" and therefore equivalent to "granted".
 *
 * WHAT IT DELIBERATELY DOES NOT DO: gate ordinary domain models on permissions. `ctx.permissions` is
 * one flat list for the whole request, so using it per-model would be an authorization decision made
 * without an endowment — exactly the role-shaped mistake MP-12 is about. Ordinary models stay
 * authorized by endowment membership at this layer, with the per-procedure check in `packages/api`
 * as the primary control (§10 §7.2). Recorded in `SCOPING_KNOWN_GAPS`.
 */
function assertWritePolicy(model: string, operation: string, ctx: RequestContext): void {
  if (isBypassed(ctx)) return;

  if (!isAuthenticated(ctx)) {
    deny({ model, operation, ctx, reason: `unauthenticated callers may not write ${model} rows` });
  }

  if (ctx.beneficiarySelfId) {
    deny({
      model,
      operation,
      ctx,
      reason: BENEFICIARY_FORBIDDEN_SET.has(model)
        ? `a beneficiary-scoped session may not ${operation} a ${model} row. Beneficiary isolation is ` +
          `applied BEFORE role logic (§10 §5), so no role and no grant widens it — and ${model} is ` +
          `part of the authorization plane or the endowment's banking/remuneration record.`
        : `a beneficiary-scoped session may not ${operation} a ${model} row: the portal seat is ` +
          `READ-ONLY over its own data (§10 §5). It creates nothing and it mutates nothing — not the ` +
          `endowment record, not an asset, not a soft delete. An untrusted external party does not ` +
          `write the corpus record or the compliance calendar.`,
    });
  }

  const required = AUTHORIZATION_PLANE_MODELS[model as keyof typeof AUTHORIZATION_PLANE_MODELS];
  if (required === undefined) return;

  // `a|b` means "any of these". No wildcard support, deliberately: a wildcard in a string-based
  // permission model is how a least-privilege matrix quietly becomes root.
  const accepted = required.split('|');
  const held: ReadonlySet<string> = new Set(ctx.permissions ?? []);
  if (!accepted.some((permission) => held.has(permission))) {
    deny({
      model,
      operation,
      ctx,
      reason:
        `${model} is the AUTHORIZATION PLANE, not endowment data: ${operation} requires ` +
        `${accepted.join(' or ')}, which this caller does not hold. Holding a write-capable grant on ` +
        `an endowment does not confer the power to issue grants on it — that is how a caller makes ` +
        `themselves the Nazir (BR-105 / BR-1103).`,
    });
  }
}

/**
 * THE ORDINARY-DOMAIN COLUMN GATE. See the block comment on {@link DOMAIN_WRITE_POLICIES}.
 *
 * Called AFTER every existing scope assertion, on purpose: a caller writing into an endowment
 * they hold nothing on must keep hearing "no WaqfAccessGrant for waqf X", not a permission
 * message. The scope answer is the more specific one and it is the one every existing assertion
 * is written against.
 *
 * `create` is gated ONLY for a self-scoped model — today that is `Waqf` alone. The reason is not
 * stylistic: for every other model `assertCreateInScope` has already proved the caller holds a
 * grant on the endowment the new row hangs off, and a brand-new child row reclassifies nothing.
 * `Waqf` has no parent endowment, so `payloadWaqfId` returns `undefined`, the loop `continue`s and
 * the create is checked by NOTHING — a `FINANCE` seat could conjure an endowment with a
 * classification of its choosing. That is closed here.
 *
 * ⚠ THE CREATE PATH ON CHILD MODELS IS A NAMED RESIDUAL. A create still supplies governed columns
 * (an `Asset` cannot be created without a `valuationSar`) and is gated by endowment membership
 * alone. Extending the gate to child creates is blocked by two fixtures this change does not own
 * (`nested-write-audit.integration.test.ts` creates an `Asset` and a `MaintenanceTicket` from a
 * `finance:transaction:*`-only seat and asserts both COMMIT, as the "subtraction, not a lockout"
 * proof). Reported with the exact call sites; not silently decided.
 */
function assertDomainWriteAuthorized(
  model: string,
  operation: string,
  ctx: RequestContext,
  data: unknown,
): void {
  if (isBypassed(ctx)) return;

  // A WRITE TRAVELLING THROUGH A VERIFIED RESERVED MATTER IS ALREADY MORE STRONGLY AUTHORIZED
  // THAN ANY PERMISSION STRING, so it is not second-guessed here. `reservedMatterApprovalId` is set
  // ONLY by `withReservedMatter()`, and only after it has resolved an `ApprovalRequest` that is
  // APPROVED, of type RESERVED_MATTER, for THIS endowment, with `checkerId != null &&
  // checkerId !== makerId`, and visible to the caller through the force-filter. That is a recorded
  // governance decision by the sole approval authority; a permission grid is the routine path, and
  // refusing the exceptional one on top of it would mean an approved amendment could not be applied
  // by the person the approval names. (The Shart columns are NOT reachable this way regardless —
  // D-3 makes `qmulate_shart_guard()` refuse them even WITH a genuine approval.)
  if (
    ctx.reservedMatterApprovalId !== undefined &&
    ctx.reservedMatterApprovalId !== null &&
    ctx.reservedMatterApprovalId !== ''
  ) {
    return;
  }

  const policy = DOMAIN_WRITE_POLICIES[model];
  if (policy === undefined) return;

  const fields = MODEL_FIELDS.get(model);
  const held: ReadonlySet<string> = new Set(ctx.permissions ?? []);

  for (const row of asRows(data)) {
    for (const column of Object.keys(row)) {
      if (row[column] === undefined) continue;

      // Relations are the nested walk's business, and every governed model is audited — so a
      // nested write into one is refused outright by `assertNestedWritesAuditable` before it could
      // matter here. An UNKNOWN field is likewise already refused by the nested walk (fail-closed),
      // so it is skipped rather than double-refused with a worse message.
      const field = fields?.get(column);
      if (field === undefined || field.target !== null) continue;

      if (WRITE_GATE_ALWAYS_UNGOVERNED.includes(column)) continue;
      if (policy.ungoverned?.includes(column) === true) continue;

      // ⊕ S12-3b (migration 53) · THE ONE SENTINEL A BIRTH MAY STATE WITHOUT THE SIGNER. On CREATE of a
      // `Waqf`, `reversionClauseCaptured: false` says "the مآل clause is UNREAD" — every endowment's
      // state at intake, and the record must SAY it (the column may never acquire a default —
      // e3-lineage-reversion pins it). Saying "unread" records no founder's condition, so it is judged
      // by the record verb (`policy.permission`); recording `true`, or ANY update, stays the signer's
      // (`overrides`). Narrow by construction: one model, one column, one operation, one value.
      const intakeSentinel =
        operation === 'create' &&
        model === 'Waqf' &&
        column === 'reversionClauseCaptured' &&
        row[column] === false;
      const required = intakeSentinel
        ? policy.permission
        : (policy.overrides?.[column] ?? policy.permission);
      const accepted = required.split('|');
      if (accepted.some((permission) => held.has(permission))) continue;

      deny({
        model,
        operation,
        ctx,
        reason:
          `${model}.${column} gates a regulatory obligation, so ${operation} requires ` +
          `${accepted.join(' or ')} — which this caller does not hold. §10 §3's grid decides which ` +
          `MODULE may write which row: holding a write verb on one module (a ledger seat, a scoped ` +
          `subcontractor remit) is not authority over the endowment record, its corpus assets, or ` +
          `the compliance position. Membership of an endowment is not a capability on it.`,
      });
      return;
    }
  }
}

/**
 * Throws unless every model in {@link ALL_MODELS} is either governed by a write policy or listed
 * in {@link DOMAIN_WRITE_UNGATED} with a reason — and unless every governed/excused column name
 * actually exists on its model in the Prisma datamodel.
 *
 * The second half is the one that matters most: a governed-column list is only a control if the
 * names are real. `ungoverned: ['titleDeedNo']` would silently govern `titleDeedNumber` (an
 * outage), and `ungoverned: ['titleDeedNumber']` on a model that renamed the column would
 * silently stop governing something. Both are caught by comparing against the DMMF, which is
 * generated from `schema.prisma`. Call from a unit test.
 */
export function assertDomainWriteCoverage(): void {
  const problems: string[] = [];

  for (const model of ALL_MODELS) {
    const governed = model in DOMAIN_WRITE_POLICIES;
    const excused = model in DOMAIN_WRITE_UNGATED;
    if (!governed && !excused) {
      problems.push(
        `${model} is in neither DOMAIN_WRITE_POLICIES nor DOMAIN_WRITE_UNGATED — decide whether a ` +
          `write to it needs a permission, and write down the answer (fail-closed until you do)`,
      );
    }
    if (governed && excused) {
      problems.push(`${model} is both governed and excused — it must appear in exactly one table`);
    }
  }

  for (const [model, policy] of Object.entries(DOMAIN_WRITE_POLICIES)) {
    const fields = MODEL_FIELDS.get(model);
    if (fields === undefined) {
      problems.push(`DOMAIN_WRITE_POLICIES names "${model}", which is not in the Prisma datamodel`);
      continue;
    }
    const named = [...(policy.ungoverned ?? []), ...Object.keys(policy.overrides ?? {})];
    for (const column of named) {
      const field = fields.get(column);
      if (field === undefined) {
        problems.push(
          `${model}.${column} is named by its write policy but is not a field of ${model}`,
        );
      } else if (field.target !== null) {
        problems.push(
          `${model}.${column} is a RELATION, not a scalar column — the nested-write walk governs it, ` +
            `so naming it in a column policy is misleading`,
        );
      }
    }
    for (const permission of [policy.permission, ...Object.values(policy.overrides ?? {})].flatMap(
      (value) => value.split('|'),
    )) {
      if (!isPermissionString(permission)) {
        problems.push(
          `${model}'s write policy requires "${permission}", which is not a registered ` +
            `module:resource:verb permission — an unregistered string can never be held, so the ` +
            `model would be unwritable by every caller (fail-closed, but as an outage)`,
        );
      }
    }
  }

  if (problems.length)
    throw new Error(
      `the ordinary-domain write gate is incomplete:\n  - ${problems.join('\n  - ')}`,
    );
}

/** Asserts that every `waqfId` about to be written is one the caller holds a grant for. */
function assertCreateInScope(
  model: string,
  operation: string,
  ctx: RequestContext,
  data: unknown,
): void {
  if (isBypassed(ctx)) return;
  if (!isAuthenticated(ctx)) {
    deny({ model, operation, ctx, reason: `unauthenticated callers may not create ${model} rows` });
  }
  // A beneficiary login is read-only over its own data. It never creates domain rows.
  if (ctx.beneficiarySelfId) {
    deny({
      model,
      operation,
      ctx,
      reason: `a beneficiary-scoped session may not create ${model} rows`,
    });
  }

  for (const row of asRows(data)) {
    const waqfId = payloadWaqfId(model, row);
    if (waqfId === undefined) continue; // nullable/absent (global row, or inherited from the parent)
    if (!ctx.authorizedWaqfIds.includes(waqfId)) {
      deny({
        model,
        operation,
        ctx,
        attemptedWaqfId: waqfId,
        reason: `no WaqfAccessGrant for waqf ${waqfId}; cannot create a ${model} row against it`,
      });
    }
  }
}

/**
 * The UPDATE-side twin of `assertCreateInScope`'s `waqfId` check.
 *
 * The `UNIQUE_WRITE_OPS` pre-check proves the TARGET row is in scope and then hands Prisma the
 * caller's `data` unexamined — so `data.waqfId` (or `waqf: { connect }`) could RELOCATE an in-scope
 * row into an endowment the caller holds nothing on. `waqf_access_grant` is covered by its
 * subject-write-once trigger; Asset / Transaction / Document are not.
 */
function assertUpdateDataInScope(
  model: string,
  operation: string,
  ctx: RequestContext,
  data: unknown,
): void {
  if (isBypassed(ctx)) return;
  for (const row of asRows(data)) {
    const waqfId = payloadWaqfId(model, row);
    if (waqfId === undefined) continue;
    if (!ctx.authorizedWaqfIds.includes(waqfId)) {
      deny({
        model,
        operation,
        ctx,
        attemptedWaqfId: waqfId,
        reason:
          `no WaqfAccessGrant for waqf ${waqfId}; a ${model} row may not be ${operation}d into an ` +
          `endowment the caller holds nothing on`,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// RELATION-NESTED WRITES — the hole that made every other layer decorative (C-01)
//
// `query.$allModels.$allOperations` receives the TOP-LEVEL model and operation ONLY. Prisma does
// not invoke it again for a relation-nested write, so `assertWritePolicy` and `assertCreateInScope`
// were evaluated against the PARENT and never against the nested row. Reproduced end to end:
//
//   DENIED   waqfAccessGrant.create({ role:'NAZIR', permissions:['approval:request:approve'] })
//   ALLOWED  waqf.update({ data:{ accessGrants:{ create: <the identical row> } } })
//   ALLOWED  user.update({ where:{id:SELF}, data:{ grants:{ create: <the identical row> } } })
//
// from a FINANCE seat AND from a beneficiary portal seat holding only `beneficiary:beneficiary:write`
// (`User` is in `UNSCOPED_MODELS`, so `scopeFilter` returns `null` and the whole payload went to
// Prisma unchecked). `qmulate_has_active_grant(<portal user>, 'waqf-001', 'NAZIR')` then returned
// TRUE, and ZERO audit events named the forged grant.
//
// THE LESSON THIS IS DESIGNED AGAINST: the forged row did not defeat the checks, it SATISFIED them —
// the preset intersection was a no-op because the forged role genuinely IS nazir, the DB function
// agreed because the row is well-formed, and the API read the same row. A defence that only asks
// "does this row say NAZIR?" is not a defence. This one asks HOW THE ROW GOT HERE.
//
// FAIL CLOSED, EVERYWHERE: an unknown model, an unknown field, an unknown nested verb, a payload
// shape this walker does not recognize — every one of them DENIES. Adding a relation to
// `schema.prisma` cannot open a door here, because the map below is derived from the DMMF at import
// time rather than hand-maintained.
// ═══════════════════════════════════════════════════════════════════════════════════════════

interface FieldShape {
  /** The target model for a relation field; `null` for a scalar, enum or unsupported field. */
  readonly target: string | null;
  /** `true` for a to-many relation — the side where `connect`/`set` rewrites the TARGET's FK. */
  readonly isList: boolean;
}

/**
 * `model -> field -> shape`, derived from `Prisma.dmmf` so it cannot go stale.
 *
 * A hand-copied relation list is exactly the artefact that produced this defect class: the list
 * would be right on the day it was written and wrong the first time somebody added a back-relation.
 */
const MODEL_FIELDS: ReadonlyMap<string, ReadonlyMap<string, FieldShape>> = (() => {
  const models = new Map<string, ReadonlyMap<string, FieldShape>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const fields = new Map<string, FieldShape>();
    for (const field of model.fields) {
      fields.set(field.name, {
        target: field.kind === 'object' ? field.type : null,
        isList: field.isList === true,
      });
    }
    models.set(model.name, fields);
  }
  return models;
})();

/** Nested verbs that CREATE rows in the target table. */
const NESTED_CREATE_VERBS = new Set(['create', 'connectOrCreate']);
/** Nested verbs that MUTATE existing rows in the target table. */
const NESTED_UPDATE_VERBS = new Set(['update', 'upsert']);
/** Nested verbs that RE-PARENT rows by moving a foreign key. */
const NESTED_RELINK_VERBS = new Set(['connect', 'disconnect', 'set']);
/**
 * Nested verbs the AUDIT SPINE cannot record: bulk writes have no per-row before-image and a hard
 * `delete` destroys one inside the ≥10-year retention window. `audit.ts` refuses all four at TOP
 * level (`UnsupportedBulkOperationError` / "Use softDelete()"). A relation is not a loophole around
 * a refusal — so they are refused here too, rather than executing unrecorded.
 */
const NESTED_UNRECORDABLE_VERBS = new Set(['createMany', 'updateMany', 'deleteMany', 'delete']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A write payload is one row or many; normalize so every caller handles exactly one shape. */
function asRows(data: unknown): Record<string, unknown>[] {
  const candidates = Array.isArray(data) ? data : [data];
  return candidates.filter(isRecord);
}

/**
 * The `waqfId` a payload would write — from the scalar column, from Prisma's `{ set: … }` form, or
 * from a to-one `connect` / `connectOrCreate` on the model's own `Waqf` relation.
 *
 * THE RELATION FORM MATTERS: Sprint 1's check read `row.waqfId` only and skipped everything else
 * with the comment "set via a nested connect", so `asset.create({ data: { waqf: { connect: { id:
 * <another endowment> } } } })` supplied the endowment through a door the check did not look at.
 */
function payloadWaqfId(model: string, row: Record<string, unknown>): string | undefined {
  const direct = row.waqfId;
  if (typeof direct === 'string') return direct;
  if (isRecord(direct) && typeof direct.set === 'string') return direct.set;

  const fields = MODEL_FIELDS.get(model);
  if (fields === undefined) return undefined;
  for (const [name, shape] of fields) {
    if (shape.target !== 'Waqf' || shape.isList) continue;
    const spec = row[name];
    if (!isRecord(spec)) continue;
    const connect = spec.connect;
    if (isRecord(connect) && typeof connect.id === 'string') return connect.id;
    const connectOrCreate = spec.connectOrCreate;
    if (isRecord(connectOrCreate)) {
      const where = connectOrCreate.where;
      if (isRecord(where) && typeof where.id === 'string') return where.id;
    }
  }
  return undefined;
}

/**
 * Unwraps `{ where, data }` to `data`. A to-ONE nested update may be written either way, and a
 * target model could legitimately own a column called `data` — so the DMMF decides, not a guess.
 */
function nestedUpdateData(target: string, entry: unknown): unknown {
  if (!isRecord(entry)) return entry;
  const fields = MODEL_FIELDS.get(target);
  const wrapped = 'data' in entry && !(fields?.has('data') ?? false);
  return wrapped ? entry.data : entry;
}

/**
 * Walks a write payload and applies the SAME policy to every nested row that the row would get at
 * top level. Recurses to arbitrary depth.
 */
function assertNestedWritesAuthorized(
  model: string,
  operation: string,
  ctx: RequestContext,
  data: unknown,
  path: string,
): void {
  if (isBypassed(ctx)) return;

  const fields = MODEL_FIELDS.get(model);
  if (fields === undefined) {
    deny({
      model,
      operation,
      ctx,
      reason:
        `${path}: "${model}" is not a model in the Prisma datamodel, so its write payload cannot be ` +
        `classified. Refused rather than passed through (fail-closed).`,
    });
    return;
  }

  for (const row of asRows(data)) {
    for (const [key, value] of Object.entries(row)) {
      if (value === undefined) continue;
      const field = fields.get(key);
      if (field === undefined) {
        deny({
          model,
          operation,
          ctx,
          reason:
            `${path}.${key} is not a field of ${model}. The scoping force-filter cannot decide ` +
            `whether it is a relation into a governed table, so the write is refused (fail-closed).`,
        });
        return;
      }
      if (field.target === null) continue; // scalar or enum — covered by the waqfId checks
      assertNestedRelationWrite(field, key, operation, ctx, value, `${path}.${key}`);
    }
  }
}

function assertNestedRelationWrite(
  field: FieldShape,
  key: string,
  operation: string,
  ctx: RequestContext,
  spec: unknown,
  path: string,
): void {
  const target = field.target as string;

  // ── DEFENCE IN DEPTH: the authorization plane is never a side effect ──────────────────────
  //
  // Even a caller who legitimately holds `admin:access_matrix:write` issues a grant by writing the
  // grant table, never by editing a waqf or a user. There is no product reason to mint a seat as a
  // by-product of another write, and the by-product is also invisible to the audit spine, which
  // records the PARENT row's before/after image and never names the child.
  if (target in AUTHORIZATION_PLANE_MODELS) {
    deny({
      model: target,
      operation,
      ctx,
      reason:
        `${path} writes ${target}, which is the AUTHORIZATION PLANE. A grant, a membership or an ` +
        `approval is never minted as a side effect of writing another table — issue it with a ` +
        `top-level ${delegateName(target)} operation, which is gated, scoped and audited. ` +
        `(This is the C-01 path: the identical row refused at top level was accepted here.)`,
    });
    return;
  }

  if (!isRecord(spec)) {
    deny({
      model: target,
      operation,
      ctx,
      reason: `${path} is not a recognized nested-write payload for ${target} (fail-closed)`,
    });
    return;
  }

  for (const [verb, value] of Object.entries(spec)) {
    if (value === undefined) continue;

    if (NESTED_UNRECORDABLE_VERBS.has(verb)) {
      deny({
        model: target,
        operation,
        ctx,
        reason:
          `${path}.${verb} is not permitted through a relation: bulk writes carry no per-row ` +
          `before-image and a hard delete destroys a row inside the retention window (§12). The ` +
          `audit spine refuses all four at top level; a nested relation is not a way around that.`,
      });
      return;
    }

    if (NESTED_RELINK_VERBS.has(verb)) {
      // A to-ONE `connect` writes the FK on the row being written HERE — that row is already
      // governed by the checks above, and `payloadWaqfId` resolves the endowment it points at. A
      // to-MANY `connect`/`set`/`disconnect` is the other direction: it REWRITES THE TARGET ROW's
      // foreign key, re-parenting a row this caller may hold nothing on, with no before-image and
      // no audit event. Refused.
      if (field.isList) {
        deny({
          model: target,
          operation,
          ctx,
          reason:
            `${path}.${verb} re-parents existing ${target} rows by rewriting their foreign key. ` +
            `The force-filter cannot prove the rows on the other end are within the caller's scope ` +
            `without reading them, and the write would leave no audit trail — refused (fail-closed).`,
        });
        return;
      }
      continue;
    }

    if (NESTED_CREATE_VERBS.has(verb)) {
      const rows =
        verb === 'connectOrCreate'
          ? asRows(value).map((entry) => entry.create)
          : (value as unknown);
      assertWritePolicy(target, 'create', ctx);
      assertCreateInScope(target, 'create', ctx, rows);
      assertNestedWritesAuthorized(target, 'create', ctx, rows, `${path}.${verb}`);
      continue;
    }

    if (NESTED_UPDATE_VERBS.has(verb)) {
      assertWritePolicy(target, verb, ctx);
      for (const entry of asRows(value)) {
        if (verb === 'upsert') {
          assertCreateInScope(target, 'upsert', ctx, entry.create);
          assertNestedWritesAuthorized(
            target,
            'upsert',
            ctx,
            entry.create,
            `${path}.upsert.create`,
          );
          assertUpdateDataInScope(target, 'upsert', ctx, entry.update);
          assertNestedWritesAuthorized(
            target,
            'upsert',
            ctx,
            entry.update,
            `${path}.upsert.update`,
          );
          continue;
        }
        const payload = nestedUpdateData(target, entry);
        assertUpdateDataInScope(target, 'update', ctx, payload);
        assertNestedWritesAuthorized(target, 'update', ctx, payload, `${path}.update`);
      }
      continue;
    }

    deny({
      model: target,
      operation,
      ctx,
      reason:
        `${path}.${verb} is not a nested-write verb this force-filter recognizes. Unknown nesting ` +
        `is refused, never passed through — that is what let a NAZIR grant be minted under a ` +
        `waqf.update (C-01).`,
    });
    return;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The extension
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Built per request, bound to one {@link RequestContext}.
 *
 * The callback form of `defineExtension` is used because of ONE Prisma trap: `findUnique` accepts
 * only unique fields in `where`, so injecting `waqfId: { in: [...] }` makes Prisma throw a
 * validation error instead of filtering. The fix is to run the query as `findFirst` — which the
 * handler does by calling the delegate on the inner client rather than the supplied `query()`.
 * The result still unwinds through the outer encryption extension, so callers get plaintext.
 */
/**
 * The client handed to a `defineExtension` callback is Prisma's *extended-this* shape, not the
 * plain `PrismaClient` — annotate it from `defineExtension` itself so the type follows the
 * generated client rather than being re-stated (and drifting) here.
 */
type ExtensionCallbackClient = Parameters<
  Extract<Parameters<typeof Prisma.defineExtension>[0], (client: never) => unknown>
>[0];

export function createScopingExtension(ctx: RequestContext) {
  return Prisma.defineExtension((client: ExtensionCallbackClient) =>
    client.$extends({
      name: 'qmulate-waqf-scoping',
      query: {
        $allModels: {
          async $allOperations({
            model,
            operation,
            args,
            query,
          }: {
            model: string;
            operation: string;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            args: any;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            query: (args: any) => Promise<unknown>;
          }) {
            // THE WRITE POLICY RUNS FIRST, FOR EVERY WRITE OPERATION.
            //
            // Placed above the `filter === null` early return on purpose: a bypassed context
            // short-circuits inside `assertWritePolicy` itself, so the seed and jobs are unaffected,
            // but an UNSCOPED model (`filter === null` for `UNSCOPED_MODELS`) no longer skips the
            // authorization-plane and beneficiary checks. Sprint 1's ONLY write guard was
            // `assertCreateInScope`, reached from the `CREATE_OPS` branch alone — so update, delete,
            // upsert, updateMany and deleteMany were governed by the scope pre-check and nothing else.
            if (
              CREATE_OPS.has(operation) ||
              UNIQUE_WRITE_OPS.has(operation) ||
              WHERE_WRITE_OPS.has(operation)
            ) {
              assertWritePolicy(model, operation, ctx);

              // …AND THEN AGAIN FOR EVERY NESTED ROW THE PAYLOAD WOULD WRITE (C-01).
              //
              // `$allOperations` sees the TOP-LEVEL model and operation only, so without this walk
              // the two asserts above are evaluated against the PARENT of a relation-nested write
              // and never against the nested row itself. Every write-carrying argument is walked:
              // `data` (create/update/updateMany), `create` and `update` (upsert).
              for (const [name, payload] of [
                ['data', args?.data],
                ['create', args?.create],
                ['update', args?.update],
              ] as const) {
                if (payload === undefined) continue;
                assertNestedWritesAuthorized(model, operation, ctx, payload, `${model}.${name}`);
              }
            }

            if (CREATE_OPS.has(operation)) {
              assertCreateInScope(model, operation, ctx, args?.data);
              // A self-scoped model's create is checked by NOTHING above — see the note on
              // `assertDomainWriteAuthorized`. For every other model the create path is the named
              // residual, so the gate is deliberately not applied there.
              if (SELF_SET.has(model)) {
                assertDomainWriteAuthorized(model, operation, ctx, args?.data);
              }
              return query(args);
            }

            if (WHERE_WRITE_OPS.has(operation) || UNIQUE_WRITE_OPS.has(operation)) {
              // The data side of an UPDATE was never examined: the scope pre-check proves the
              // TARGET row is in scope, then Prisma gets `data` as written — so `data.waqfId` could
              // relocate the row into a stranger's endowment. `upsert` carries its update payload
              // under `update`, not `data`, so both are checked.
              assertUpdateDataInScope(model, operation, ctx, args?.data);
              assertUpdateDataInScope(model, operation, ctx, args?.update);

              // …AND ONLY THEN the ordinary-domain column gate, so the scope refusal above keeps
              // priority. `upsert` carries its mutation under `update`; a `create` reached through
              // `upsert` is handled in the UNIQUE_WRITE_OPS branch below, with the same
              // self-scoped-only rule the CREATE_OPS branch applies.
              assertDomainWriteAuthorized(model, operation, ctx, args?.data);
              assertDomainWriteAuthorized(model, operation, ctx, args?.update);
            }

            const filter = scopeFilter(model, ctx);
            if (filter === null) return query(args);

            if (UNIQUE_READ_OPS.has(operation)) {
              // See the class comment: rewrite rather than inject into a unique-only `where`.
              const rewritten = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow';
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const delegate = (client as any)[delegateName(model)];
              return delegate[rewritten]({ ...args, where: andWhere(args?.where, filter) });
            }

            if (READ_OPS.has(operation) || WHERE_WRITE_OPS.has(operation)) {
              return query({ ...args, where: andWhere(args?.where, filter) });
            }

            if (UNIQUE_WRITE_OPS.has(operation)) {
              // See UNIQUE_WRITE_OPS: the unique key must stay at the top level of `where`, so
              // authorization is a pre-check instead of an injected predicate.
              //
              // `upsert` is the one case where a miss is not necessarily a denial: the row may
              // simply not exist yet, which is what `upsert` is for. So a miss on `upsert` is
              // only denied if the row EXISTS but sits outside the caller's scope — otherwise it
              // is genuinely a CREATE and gets exactly the CREATE policy (C-04).
              //
              // ⚠ IT DID NOT, AND THAT WAS THE WHOLE DEFECT. This branch returned `query(args)`
              // with `args.create` unexamined, so the operation NAME alone decided authorization:
              //   REFUSED   waqfAccessGrant.create({ data:   { waqfId: <not mine>, role:'NAZIR' } })
              //   ALLOWED   waqfAccessGrant.upsert({ create: { waqfId: <not mine>, role:'NAZIR' } })
              // — a live, ACTIVE second approval authority on a stranger's endowment, and the same
              // for every ordinary model with no permission string held at all. The comment that
              // used to sit here redirected the reader to the parent-scoped-CREATE gap in
              // SCOPING_KNOWN_GAPS; that gap is about DistributionLineItem/MaintenanceTicket parent
              // resolution and has nothing to do with an out-of-scope literal `waqfId`.
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const delegate = (client as any)[delegateName(model)];

              const inScope: unknown = await delegate.findFirst({
                where: andWhere(args?.where, filter),
                select: { id: true },
              });

              if (inScope === null) {
                if (operation === 'upsert') {
                  const existsAnywhere: unknown = await delegate.findFirst({
                    where: args?.where,
                    select: { id: true },
                  });
                  if (existsAnywhere === null) {
                    // Genuinely a create — same policy as the CREATE_OPS branch, no exceptions.
                    assertCreateInScope(model, operation, ctx, args?.create);
                    if (SELF_SET.has(model)) {
                      assertDomainWriteAuthorized(model, operation, ctx, args?.create);
                    }
                    return query(args);
                  }
                }
                deny({
                  model,
                  operation,
                  ctx,
                  reason:
                    `no ${model} matching that key is within the caller's scope — ` +
                    `the row is absent or belongs to another endowment`,
                });
              }

              // Authorized. Prisma gets the caller's `where` exactly as written.
              return query(args);
            }

            // Anything unrecognized (a future Prisma operation) is refused rather than passed
            // through unfiltered.
            deny({
              model,
              operation,
              ctx,
              reason: `operation "${operation}" is not covered by the scoping force-filter`,
            });
          },
        },
      },
    }),
  );
}
