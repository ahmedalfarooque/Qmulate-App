/**
 * THE RUN'S IDENTITY — the one string the `Distribution` row, its approval's `subjectId`, and the
 * deferred database trigger must all agree on.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE DATABASE ACTUALLY DEMANDS — MEASURED, NOT ASSUMED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `packages/database/prisma/migrations/00000000000004_e2_guard_gaps/migration.sql`:
 *
 *   qmulate_distribution_authority()  (AFTER, DEFERRABLE INITIALLY DEFERRED, ENABLE ALWAYS)
 *     → qmulate_approval_defect(NEW."approvalRequestId", NEW."waqfId",
 *                               'DISTRIBUTION_RUN', NEW."id", true)
 *
 * and `qmulate_approval_defect` raises when `r."subjectId" IS DISTINCT FROM p_subject_id`. So the
 * approval's `subjectId` must equal **`distribution.id`** — the row's own primary key — the moment
 * the run reaches `APPROVED` or `EXECUTED`, and it raises at COMMIT, not at the UPDATE.
 *
 * Two further facts from the same measurement:
 *  · the expected type is **`DISTRIBUTION_RUN`**, not `BANK_MOVEMENT`. A run approved on a
 *    `BANK_MOVEMENT` approval raises SQLSTATE 42501 at commit. `mintApprovalRequest` already accepts
 *    `'DISTRIBUTION_RUN'`, so nothing needs widening;
 *  · `approvalRequestId` is a PLAIN COLUMN, not a foreign key — a string that names nothing
 *    satisfies the CHECK. This trigger is the check that does not.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⇒ THEREFORE: THE RUN'S PRIMARY KEY IS THIS FUNCTION'S OUTPUT, NOT A cuid
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The subject id has to be derivable *before* the row exists (the wizard needs to know whether a run
 * for this period is already open) and it has to *be* the row's id (the trigger). Both hold only if
 * the id is deterministic. So {@link distributionRunSubjectId} is what S7-4 must pass as
 * `Distribution.id`, and `subjectId === run.id === distributionRunSubjectId(...)` becomes a tautology
 * rather than a convention three call sites have to remember.
 *
 * That also gives the run the property `settingChangeSubjectId` was built for: the partial unique
 * index `approval_request_one_open_per_subject` keys on `(waqfId, type, COALESCE("subjectId",''))`
 * over the non-terminal statuses, so **two simultaneous open approvals for the same endowment and
 * period are unrepresentable** — "the approval for this distribution" is never ambiguous.
 *
 * ⚠ **THIS QUESTION IS SETTLED, AND NOT THE WAY THIS FILE ORIGINALLY WENT.** The paragraphs above
 * argued for a DETERMINISTIC subject id, and flagged the cost: `DistributionStatus.CANCELLED` is
 * terminal (the status-lattice trigger raises on any transition out of it), `distribution` refuses
 * TRUNCATE and `distribution_line_item` refuses DELETE — so a deterministic id is SPENT once a
 * period's run is cancelled, and **that period could never be run again**. Migration 21's partial
 * UNIQUE on `("waqfId","periodStart","periodEnd") WHERE "status" <> 'CANCELLED'` exists precisely to
 * PERMIT a fresh run after a cancellation, so the two designs could not both be right.
 *
 * **S7-4 chose the other branch — `subjectId = run.id`, the cuid** — because
 * `qmulate_distribution_authority` compares `subjectId` to `NEW."id"`, which a deterministic id can
 * only satisfy by BEING the primary key, and that is what makes a cancelled period unrunnable. See
 * `packages/api/src/routers/distribution.ts:35-49`. A re-run therefore gets a fresh id and a fresh
 * approval, and *"is a run already open for this period?"* is answered by a query rather than by a
 * derivation — which is the honest trade, because the question is about live rows and not about
 * arithmetic on a string.
 *
 * ⇒ **THE THREE DETERMINISTIC-SUBJECT HELPERS ARE GONE, not deprecated.** They were exported, tested,
 * and called by nothing: dead code with tests around it is worse than no code, because the tests read
 * as coverage of a live path. The two constants below stay — the router uses both, and
 * `DISTRIBUTION_RUN_APPROVAL_TYPE` in particular is the one the sprint brief got WRONG (it said
 * "BANK_MOVEMENT path", which the deferred trigger refuses at COMMIT with SQLSTATE 42501), so it is
 * pinned here to stay greppable.
 */

/** The `ApprovalType` a distribution run's approval must carry. Pinned so it is greppable. */
export const DISTRIBUTION_RUN_APPROVAL_TYPE = 'DISTRIBUTION_RUN' as const;

/** Discriminator inside the mint payload, so a run artifact is never mistaken for another kind. */
export const DISTRIBUTION_RUN_ARTIFACT_KIND = 'distribution.run' as const;
