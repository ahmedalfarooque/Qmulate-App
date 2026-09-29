/**
 * E6/S7 · MIGRATION 21 — THE RUN A NAZIR CAN SIGN, THE SHARE A BENEFICIARY READS, AND THE ONE
 * LIVE RUN PER PERIOD. PLUS: EVERY GUARD THAT WAS ALREADY THERE, RE-MEASURED AFTER A HEAP REWRITE.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RULE THIS FILE FOLLOWS EVERYWHERE, INHERITED VERBATIM FROM
 * `e5-anticommingling-corpus-guard.integration.test.ts`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **A REFUSAL IS ONLY EVIDENCE WHEN IT CARRIES THE GUARD'S OWN MESSAGE.**
 *
 * That rule was paid for twice while building migration 19, and the E5 baseline banked two vacuous
 * "REFUSED" results that were really the probe's own SQL failing on wrong column names. So here:
 *   · every negative names the CONSTRAINT, INDEX or TRIGGER MESSAGE it expects, and
 *     `guardProbeSql` / {@link uniqueProbeSql} pin the SQLSTATE so a refusal with the wrong
 *     SQLSTATE propagates instead of being mistaken for a pass;
 *   · **every negative has a POSITIVE CONTROL** — the same INSERT/UPDATE/DELETE shape, differing
 *     only in the one field under test, which must SUCCEED (and is then rolled back). Two refusals
 *     of a statement that never works for an unrelated reason prove nothing at all;
 *   · nothing asserts on an exit status.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS MEASURED, AND WHERE — 2026-08-18, on a `--reset` → `provision-db-roles` →
 * `migrate:deploy` → `db:seed` cluster (`.pgdata/s71schema`, port 54371)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * BEFORE migration 21, read from the OWNER connection:
 *   · `distribution."engineVersion"` — ABSENT. `distribution."runDigest"` — ABSENT. The only hash
 *     column in the whole schema was `approval_request."payloadHash"`.
 *   · `distribution_line_item."sharePercent"` — `numeric` precision 9, scale **4**, NOT NULL, no
 *     default (`00000000000000_init/migration.sql:360` still reads `DECIMAL(9,4)`).
 *   · NO index on `distribution` covered `("waqfId","periodStart","periodEnd")` — three existed
 *     (`distribution_pkey`, `distribution_waqfId_id_key`, `distribution_waqfId_periodEnd_idx`), so
 *     a second LIVE run for one period was REPRESENTABLE, not merely unhandled.
 *
 * AND THE ROUNDING, MEASURED ON THE REAL COLUMN rather than reasoned about — the column was forced
 * back to `DECIMAL(9,4)` inside a transaction, written, read, rolled back:
 *   at (9,4): `33.333333` → stored **'33.3333'**      ← two digits of every statement figure gone
 *   at (9,6): `33.333333` → stored **'33.333333'**
 * `SHARE_PERCENT_SCALE = 6` (`packages/domain/src/distribution/contract.ts:326`) and
 * `sharePercentOf()` (`:2231-2239`) prints `toFixed(6, ROUND_HALF_UP)`, so EVERY line the engine
 * emits carries six decimals. §2 below re-measures BOTH halves on every run, so the fix cannot
 * regress into a comment.
 *
 * ⚠ NO HALALA EVER MOVED because of that rounding. The money is allocated in integer halalas by
 * largest remainder and `sharePercent` is display-only, never a base. What broke was the
 * STATEMENT: the percentage a beneficiary reads beside their amount stopped matching the run's own
 * trace at the 5th decimal.
 *
 * AFTER migration 21, and re-applied twice more to prove idempotency:
 *   · both columns present, `text`, nullable, `column_default` NULL;
 *   · `sharePercent` precision 9 scale 6; `beneficiary."sharePercent"` UNTOUCHED at (9,4);
 *   · `distribution_one_live_run_per_period` present, PARTIAL, predicate
 *     `(("deletedAt" IS NULL) AND (status <> 'CANCELLED'::"DistributionStatus"))`;
 *   · re-running the whole migration file twice more raised nothing, did NOT rewrite the heap
 *     (`pg_relation_filenode` 17741 → 17741) and did NOT recreate the index (oid 17750 → 17750).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY §4 EXISTS AT ALL — AND WHY IT IS NOT A RITUAL
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The README rule is that a change RECREATING a guarded table must be followed by
 * `SELECT qmulate_apply_guards()`. Migration 21 does not call it, and the honest justification is
 * a MEASUREMENT rather than an argument: §2's `ALTER COLUMN … TYPE` rewrites the heap of
 * `distribution_line_item` and rebuilds its indexes, but keeps the same relation, its constraints
 * and its triggers — and that table is not in the guarded set the function covers (audit_event,
 * audit_chain_head, waqf, transaction, document, setting). §4 is that measurement, taken on every
 * run: all EIGHT triggers (seven before migration 52) across the two tables still present at `tgenabled = 'A'`, both migration-19
 * composite foreign keys still biting, the status lattice still terminal at EXECUTED, and
 * `distribution_line_item_no_delete` still firing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE DOES **NOT** CLAIM
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ It does not claim `engineVersion`/`runDigest` are WRITE-ONCE. §5 MEASURES that they are not:
 *   `distribution_status_transition` fires only when the STATUS changes, so an `UPDATE … SET
 *   "runDigest" = …` on an EXECUTED run is not a transition and no guard sees it. Recorded, not
 *   papered over — it is the strongest remaining argument for the migration-22 seal.
 * ⚠ It does not claim the two columns are PAIRED. §5 measures that a version with no digest, and a
 *   digest with no version, both commit. Migration 21's header records why that CHECK was held back
 *   (the write order is still being built) and recommends it as migration 22.
 * ⚠ It does not opine on the DIGEST ALGORITHM. The database neither computes nor validates it;
 *   there is deliberately no `~ '^[0-9a-f]{64}$'` CHECK, because one would make a hash-algorithm
 *   change a migration.
 * ⚠ It rules on no fiqh question. Fixture data only — `waqf-001`, its historical `dist-001`, and
 *   its own beneficiaries.
 * ⚠ **IT DOES NOT CLAIM ONE PERIOD'S GHALLAH IS DISTRIBUTED ONCE.** §3's index is UNIQUE on the
 *   EXACT TRIPLE, so two runs whose periods OVERLAP without being identical are both live — AV7-F2,
 *   measured through the API as SAR 820,000.00 owed against SAR 410,000.00 of income. §6 measures
 *   the breach in this layer, installs the candidate fix inside a rolled-back transaction to prove
 *   the refusal AND its cost, and records why the guard is not in the tree yet. The breach is OPEN.
 *
 * ── WHY THE PRIVILEGED CONNECTION ────────────────────────────────────────────────────────────
 * `runProbe()` runs as the table OWNER, deliberately (see its header in `setup.ts`): on the app
 * role a `DELETE`/DDL probe is refused by the ACL before a trigger is reached, which would leave
 * this suite green while measuring nothing. Running as the owner makes each claim STRONGER: *even
 * the table owner cannot do this.* Privilege claims live in
 * `authorization-plane-privilege.integration.test.ts` and stay there.
 *
 * ── AND WHY EVERY WRITE HERE IS ROLLED BACK ──────────────────────────────────────────────────
 * `distribution_no_delete` (migration 6 §4.1) refuses a hard DELETE on `distribution` outright, so
 * a test that COMMITTED a scratch run could never clean it up — and the next run of this same file
 * against the same database would then collide with its own leftovers on
 * `distribution_one_live_run_per_period`. That is the V-E3-04 "green exactly once per database"
 * trap, and migration 21 makes it sharper rather than softer. Every statement below therefore
 * lands inside a block that ends in `RAISE`, or inside a `$transaction` that throws.
 * MEASURED: this file was run TWICE in a row against one seeded database (see the S7-1 report).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PACKAGE_ROOT,
  PROBE_BLOCKED,
  PROBE_NOT_BLOCKED,
  PROBE_SUCCEEDED,
  closeDatabase,
  ensureSeeded,
  guardProbeSql,
  hasDatabase,
  privilegedPrisma,
  rollbackProbeSql,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('E6/S7 migration 21 (run digest, share scale, one live run per period)');

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * The subjects. Every one is seeded fixture data; §0 proves each exists before anything below
 * depends on it, because a refusal aimed at a row that is not there is not a refusal.
 * ═════════════════════════════════════════════════════════════════════════════════════════ */

/** The MEDIUM `FAMILY_DHURRI` endowment, and the one the seeded run belongs to. */
const WAQF_A = 'waqf-001';
/** A different endowment — the "foreign" side of the cross-endowment probes. */
const WAQF_B = 'waqf-002';
/** The seeded HISTORICAL run: EXECUTED, live (`deletedAt` NULL), 2026-01-01…2026-03-31. */
const RUN = 'dist-001';
/** One of its two paid lines. Id is derived: `dli-<distributionId>-<beneficiaryId>`. */
const LINE = 'dli-dist-001-ben-001';
/** A `waqf-001` beneficiary with NO line in `dist-001` — the coherent-insert positive control. */
const BEN_A_UNPAID = 'ben-003';
/** A `waqf-002` beneficiary — a stranger to `dist-001`, and to `waqf-001` entirely. */
const BEN_B = 'ben-004';

/** The seeded run's period, to the day. Probing the unique index means colliding with exactly it. */
const SEEDED_PERIOD = { start: '2026-01-01', end: '2026-03-31' } as const;

/**
 * A period NO seeded run occupies, for the probes that need a legal second run.
 *
 * ⚠ NONCE-FREE ON PURPOSE, and that is safe only because every write in this file is rolled back.
 * Migration 21 §3's own header warns that anything keyed on `(waqfId, period)` now collides on a
 * second attempt; a committed scratch run here would make this file green exactly once per
 * database. If a future test in this file needs to COMMIT, it must nonce-derive the period.
 */
const FREE_PERIOD = { start: '2026-04-01', end: '2026-06-30' } as const;
const OTHER_FREE_PERIOD = { start: '2026-07-01', end: '2026-09-30' } as const;

/* ── §6's windows (AV7-F2) ────────────────────────────────────────────────────────────────────
 * A-10's own shape, ONE DAY APART, moved to 2029 for one reason: `@qmulate/api`'s integration
 * suite points at the SAME database and its files reach from 2026-01 to 2027-10 (measured by
 * reading their period constants). Nothing in the monorepo uses 2029, so §6 cannot collide with a
 * leftover row from a suite that died before its `afterAll`. Everything here is rolled back anyway;
 * this is belt over that.
 */
const F2_PAIR_A = { start: '2029-08-01', end: '2029-08-31' } as const;
const F2_PAIR_B = { start: '2029-08-02', end: '2029-08-31' } as const;

/** A plausible engine stamp. The engine's real constant is `ENGINE_VERSION` in `packages/domain`. */
const ENGINE_VERSION_SAMPLE = 'e6-distribution/4.0.0';
/** 64 hex characters — the shape `packages/api` will compute. The DB does not validate it. */
const DIGEST_SAMPLE = 'a'.repeat(64);

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * Local helpers
 * ═════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `guardProbeSql` for a UNIQUE VIOLATION — the one SQLSTATE `setup.ts`'s `GuardCondition` union
 * does not carry (it has `insufficient_privilege`, `check_violation`, `foreign_key_violation`,
 * `invalid_text_representation`; `unique_violation` / 23505 is absent because until migration 21
 * no test needed it).
 *
 * ⚠ IT IS LOCAL RATHER THAN IN `setup.ts` DELIBERATELY, AND THAT IS A DEBT, NOT A DESIGN. `setup.ts`
 * is owned by no S7 stage and is shared by 30+ files in flight, so widening the union here would be
 * a cross-stage edit. Two things are consequently OWED and are named in the S7-1 report rather than
 * left to be discovered:
 *   1. `GuardCondition` should gain `'unique_violation'` and this helper should be deleted;
 *   2. `distribution_one_live_run_per_period` should be added to `REQUIRED_UNIQUE_INDEXES`, and
 *      `distribution_engine_version_not_blank` / `distribution_run_digest_not_blank` to
 *      `REQUIRED_CHECK_CONSTRAINTS`, so `assertGuardsInstalled()` fails a database that lacks them
 *      instead of only this file failing. Until then the three are pinned BY NAME below and nowhere
 *      else — which is why §1 and §3 read them out of `pg_constraint` / `pg_indexes` explicitly.
 *
 * Shape copied verbatim from `guardProbeSql` so the sentinels and the "wrong SQLSTATE propagates"
 * property are identical: the handler catches ONLY `unique_violation`.
 */
function uniqueProbeSql(statement: string): string {
  return [
    'DO $qm_probe$',
    'BEGIN',
    `  ${statement};`,
    `  RAISE EXCEPTION '${PROBE_NOT_BLOCKED}' USING ERRCODE = 'P0001';`,
    'EXCEPTION',
    '  WHEN unique_violation THEN',
    `    RAISE EXCEPTION '${PROBE_BLOCKED}[23505]: %', SQLERRM USING ERRCODE = 'P0001';`,
    'END',
    '$qm_probe$;',
  ].join('\n');
}

interface RunRow {
  readonly id: string;
  readonly waqfId?: string;
  readonly start: string;
  readonly end: string;
  readonly status?: string;
  readonly deletedAt?: string | null;
  readonly engineVersion?: string | null;
  readonly runDigest?: string | null;
  /**
   * ⚠ ADDED FOR §6, AND IT IS NOT OPTIONAL FOR AN `EXECUTED` ROW.
   *
   * `distribution_approved_requires_approval_request` and `distribution_approval_id_not_blank` both
   * refuse `APPROVED`/`EXECUTED` with a NULL or blank value, so a §6 probe that omitted it would die
   * on `23514` — which reads as "the guard refused" in a probe that never reached the guard. Exactly
   * the vacuous negative migration 19's baseline banked twice.
   *
   * The value is a plain string: `approvalRequestId` carries NO foreign key (an `ApprovalRequest`
   * may outlive its subject — see the model comment), and the `distribution_authority` constraint
   * trigger that WOULD verify it is `DEFERRABLE INITIALLY DEFERRED`, so it fires at COMMIT only.
   * MEASURED on this cluster: an `EXECUTED` row with a made-up approval id inserts cleanly inside a
   * transaction that ends in `RAISE`. Nothing in §6 ever commits, so no unverifiable authority is
   * ever recorded.
   */
  readonly approvalRequestId?: string | null;
}

/** SQL literal for a nullable text value. */
const text = (value: string | null | undefined): string =>
  value === null || value === undefined ? 'NULL' : `'${value.replace(/'/g, "''")}'`;

/**
 * One INSERT of a `distribution` row, with every NOT NULL column supplied explicitly.
 *
 * `updatedAt` is passed by hand because Prisma's `@updatedAt` is CLIENT-side: the column is
 * `TIMESTAMP(3) NOT NULL` with NO database default (`00000000000000_init/migration.sql:347`), and a
 * raw INSERT that omits it fails with `23502` — which would read as "the guard refused" in a probe
 * that was actually never reached. `approvalRequestId` stays NULL because every run built here is
 * DRAFT or CANCELLED, which `distribution_approved_requires_approval_request` and
 * `distribution_approval_id_not_blank` both permit, and which the DEFERRED `distribution_authority`
 * constraint trigger returns early on.
 */
function insertRun(row: RunRow): string {
  return (
    'INSERT INTO "distribution" ' +
    '("id","waqfId","periodStart","periodStartHijri","periodEnd","periodEndHijri",' +
    '"grossRevenueSar","reserveSar","operatingSar","nazirFeeSar","distributableSar",' +
    '"status","approvalRequestId","computationTrace","engineVersion","runDigest",' +
    '"createdAt","updatedAt","deletedAt") ' +
    `VALUES (${text(row.id)}, ${text(row.waqfId ?? WAQF_A)}, ` +
    `'${row.start}'::timestamp, 'probe-hijri-start', '${row.end}'::timestamp, 'probe-hijri-end', ` +
    '100000.00, 0.00, 0.00, 10000.00, 90000.00, ' +
    `'${row.status ?? 'DRAFT'}'::"DistributionStatus", ${text(row.approvalRequestId)}, ` +
    `'{"origin":"s7-1-probe"}'::jsonb, ${text(row.engineVersion)}, ${text(row.runDigest)}, ` +
    `now(), now(), ${row.deletedAt === undefined || row.deletedAt === null ? 'NULL' : `'${row.deletedAt}'::timestamp`})`
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * §6's local scaffolding (AV7-F2) — the candidate exclusion constraint, installed inside a
 * transaction that always ends in `RAISE`.
 * ═════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The SHIPPED constraint's name (migration 26), asserted in the report so a rename cannot silently
 * pass the test.
 *
 * ⚠ THIS USED TO BE `candidate_paid_periods_disjoint`, INSTALLED BY THIS FILE INSIDE A DOOMED
 * TRANSACTION. It no longer installs anything: the guard is in the tree, so the sub-probes below
 * drive THE REAL OBJECT. That is strictly better evidence — an experiment can only ever measure the
 * constraint it wrote itself.
 */
const CANDIDATE_CONSTRAINT = 'distribution_paid_periods_disjoint';

/**
 * The predicate that SHIPPED, which is not quite the one this section recommended.
 *
 * `status = 'EXECUTED'` rather than `status <> 'CANCELLED'` — kept, and for this section's own
 * reason: two overlapping runs that have not paid are two COMPUTATIONS, and refusing them would
 * kill the ability to preview an alternative window for one period, while the invariant AV7-F2
 * breaks is about MONEY RECORDED AS OWED. MEASURED cost: 45 of 60 API tests red for
 * `<> 'CANCELLED'` against 25 for this one.
 *
 * ⚠ AND `"deletedAt" IS NULL` WAS **DROPPED** FROM WHAT THIS SECTION RECOMMENDED. Migration 26's
 * header carries the argument; the short form is that with it, ONE ungoverned
 * `UPDATE "distribution" SET "deletedAt" = now()` on a PAID run drops it out of the index and FREES
 * ITS PERIOD TO BE PAID AGAIN — a paid run going INVISIBLE rather than visibly PAID, which is
 * AV7-F4's failure mode rebuilt in a new constraint on the day AV7-F4 was closed one table over.
 * Nothing gates `distribution."deletedAt"`. The consequence is visible below: the
 * `SOFT_DELETED_OVERLAP` sub-probe, which this section originally asserted as a POSITIVE CONTROL,
 * is now asserted as a REFUSAL — and that inversion is the design decision, pinned.
 */
const CANDIDATE_PREDICATE = `"status" = 'EXECUTED'`;

/** An `EXECUTED` run's non-negotiable extras. See {@link RunRow.approvalRequestId}. */
const EXECUTED_RUN = { status: 'EXECUTED', approvalRequestId: 'apr-s76-probe' } as const;

interface SubProbe {
  /** Appears verbatim in the report, and is what the assertions match on. */
  readonly label: string;
  readonly statements: readonly string[];
}

/**
 * One sub-probe: a nested plpgsql block whose outcome is APPENDED TO A REPORT instead of aborting
 * the experiment.
 *
 * ⚠ WHY IT IS SHAPED LIKE THIS. `runProbe` gives one statement, one transaction — and the candidate
 * constraint must exist for every sub-probe, so all of them have to live inside that one statement.
 * A plpgsql `BEGIN … EXCEPTION` block is a SUBTRANSACTION, so each sub-probe's own rows are rolled
 * back when its trailing `RAISE` fires, and a genuine refusal is caught rather than killing the
 * outer transaction. The report is raised at the very end, which both returns it to the caller and
 * rolls back the DDL.
 *
 * The handler is SPLIT on purpose: `raise_exception` (P0001) is this probe's own sentinel, and
 * anything else is the DATABASE refusing — recorded with its SQLSTATE, its CONSTRAINT_NAME, its
 * MESSAGE_TEXT and its DETAIL, because a refusal is only evidence when it carries the guard's own
 * message. A wrong-SQLSTATE refusal therefore shows up as `REFUSED[<that state>]` and fails the
 * assertion, instead of being mistaken for the one under test.
 */
function subProbeSql(probe: SubProbe): string {
  return [
    '  BEGIN',
    ...probe.statements.map((statement) => `    ${statement};`),
    "    RAISE EXCEPTION 'QM_F2_UNDO';",
    '  EXCEPTION',
    '    WHEN raise_exception THEN',
    `      IF SQLERRM = 'QM_F2_UNDO' THEN report := report || '${probe.label}=COMMITTED' || E'\\n';`,
    `      ELSE report := report || '${probe.label}=RAISED[' || SQLSTATE || '] ' || SQLERRM ||`,
    "        E'\\n'; END IF;",
    '    WHEN others THEN',
    '      GET STACKED DIAGNOSTICS cname = CONSTRAINT_NAME, msg = MESSAGE_TEXT,',
    '        det = PG_EXCEPTION_DETAIL;',
    `      report := report || '${probe.label}=REFUSED[' || SQLSTATE || '] constraint=' ||`,
    "        coalesce(cname, '?') || ' :: ' || msg || ' :: ' || coalesce(det, '') || E'\\n';",
    '  END;',
  ].join('\n');
}

/**
 * The whole §6 experiment as ONE statement: install `btree_gist` + the candidate exclusion
 * constraint, drive seven sub-probes against it, then RAISE the report so everything — rows,
 * constraint and extension — is rolled back.
 */
function exclusionExperimentSql(predicate: string): string {
  const probes: readonly SubProbe[] = [
    {
      // A-10's shape verbatim: two paid runs one day apart. THE breach.
      label: 'PAIR_ONE_DAY_APART',
      statements: [
        insertRun({ id: 'dist-s76-a', ...F2_PAIR_A, ...EXECUTED_RUN }),
        insertRun({ id: 'dist-s76-b', ...F2_PAIR_B, ...EXECUTED_RUN }),
      ],
    },
    {
      // POSITIVE CONTROL — genuinely disjoint windows must still both pay.
      label: 'DISJOINT_PAIR',
      statements: [
        insertRun({ id: 'dist-s76-mar', start: '2029-03-01', end: '2029-03-31', ...EXECUTED_RUN }),
        insertRun({ id: 'dist-s76-apr', start: '2029-04-01', end: '2029-04-30', ...EXECUTED_RUN }),
      ],
    },
    {
      // POSITIVE CONTROL — two overlapping COMPUTED runs are two computations, not two payments.
      label: 'OVERLAPPING_DRAFTS',
      statements: [
        insertRun({
          id: 'dist-s76-draft-a',
          start: '2029-05-01',
          end: '2029-05-31',
          status: 'COMPUTED',
        }),
        insertRun({
          id: 'dist-s76-draft-b',
          start: '2029-05-02',
          end: '2029-05-31',
          status: 'COMPUTED',
        }),
      ],
    },
    {
      // POSITIVE CONTROL — a CANCELLED run must not wedge its period (§08's correction path).
      label: 'CANCELLED_OVERLAP',
      statements: [
        insertRun({ id: 'dist-s76-jun', start: '2029-06-01', end: '2029-06-30', ...EXECUTED_RUN }),
        insertRun({
          id: 'dist-s76-jun-cancelled',
          start: '2029-06-02',
          end: '2029-06-30',
          status: 'CANCELLED',
        }),
      ],
    },
    {
      // POSITIVE CONTROL — the soft-delete retirement, for the same reason.
      label: 'SOFT_DELETED_OVERLAP',
      statements: [
        insertRun({ id: 'dist-s76-jul', start: '2029-07-01', end: '2029-07-31', ...EXECUTED_RUN }),
        insertRun({
          id: 'dist-s76-jul-deleted',
          start: '2029-07-02',
          end: '2029-07-31',
          deletedAt: '2029-08-15',
          ...EXECUTED_RUN,
        }),
      ],
    },
    {
      // POSITIVE CONTROL — the key is PER ENDOWMENT: waqf-002's own quarter is not this breach.
      label: 'OTHER_ENDOWMENT',
      statements: [
        insertRun({
          id: 'dist-s76-sep-a',
          start: '2029-09-01',
          end: '2029-09-30',
          ...EXECUTED_RUN,
        }),
        insertRun({
          id: 'dist-s76-sep-b',
          waqfId: WAQF_B,
          start: '2029-09-01',
          end: '2029-09-30',
          ...EXECUTED_RUN,
        }),
      ],
    },
    {
      // THE COST — a second paid run inside the quarter the SEEDED historical run already paid.
      label: 'INSIDE_THE_PAID_QUARTER',
      statements: [
        insertRun({ id: 'dist-s76-feb', start: '2026-02-01', end: '2026-02-28', ...EXECUTED_RUN }),
      ],
    },
  ];

  return [
    'DO $qm_f2$',
    'DECLARE',
    "  report text := '';",
    '  cname text; msg text; det text;',
    'BEGIN',
    // ⚠ NOTHING IS INSTALLED HERE ANY MORE. `distribution_paid_periods_disjoint` and `btree_gist`
    // both ship in migration 26, so the sub-probes below are driven against the REAL constraint on
    // the REAL schema. The `predicate` argument survives only so the assertions can state which
    // predicate they believe is live, and §6's census test compares that belief to
    // `pg_get_constraintdef()` rather than trusting it.
    `  PERFORM 1; -- predicate under test: ${predicate}`,
    // `'[]'` — INCLUSIVE on both ends, because `periodEnd` is the last day the run pays for, and a
    // half-open range would let 2029-08-31…09-30 sit beside 2029-08-01…08-31 as if they were
    // disjoint. Postgres normalises it to `[start, end+1)`, which is what the DETAIL prints.
    "  report := report || 'INSTALLED' || E'\\n';",
    ...probes.map(subProbeSql),
    // Returns the report AND rolls back the DDL. Both, in one statement, deliberately.
    "  RAISE EXCEPTION '%', report;",
    'END',
    '$qm_f2$;',
  ].join('\n');
}

/** One INSERT of a `distribution_line_item`. The three ids are passed separately ON PURPOSE. */
function insertLine(args: {
  id: string;
  waqfId: string;
  distributionId: string;
  beneficiaryId: string;
  sharePercent?: string;
}): string {
  return (
    'INSERT INTO "distribution_line_item" ' +
    '("id","waqfId","distributionId","beneficiaryId","status","sharePercent","amountSar") ' +
    `VALUES (${text(args.id)}, ${text(args.waqfId)}, ${text(args.distributionId)}, ` +
    `${text(args.beneficiaryId)}, 'PAID'::"DistributionLineStatus", ` +
    `${args.sharePercent ?? '12.500000'}, 1000.00)`
  );
}

describe.skipIf(!hasDatabase)('E6/S7 · migration 21 — the signable run and its guards', () => {
  beforeAll(() => {
    ensureSeeded();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * §0 · THE SUBJECTS ARE REAL — otherwise every refusal below is vacuous
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('§0 · the subjects', () => {
    it('the seeded run is EXECUTED, LIVE, and occupies exactly the period the probes collide with', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<
        {
          id: string;
          waqfId: string;
          status: string;
          ps: string;
          pe: string;
          deletedAt: Date | null;
          engineVersion: string | null;
          runDigest: string | null;
        }[]
      >(
        `SELECT "id","waqfId","status"::text AS status,
                "periodStart"::date::text AS ps, "periodEnd"::date::text AS pe,
                "deletedAt", "engineVersion", "runDigest"
           FROM "distribution" WHERE "id" = $1`,
        RUN,
      );
      const run = rows[0];
      expect(run?.waqfId).toBe(WAQF_A);
      // EXECUTED and live: the terminal status §4 probes, and inside the partial index's predicate.
      expect(run?.status).toBe('EXECUTED');
      expect(run?.deletedAt).toBeNull();
      expect(run?.ps).toBe(SEEDED_PERIOD.start);
      expect(run?.pe).toBe(SEEDED_PERIOD.end);
      // ⚠ NOT BACKFILLED, and that is migration 21's decision, not an oversight: `dist-001` is a
      // HISTORICAL record whose own numbers are internally inconsistent three ways (defect F1, in
      // its `computationTrace`). Stamping `e6-distribution/4.0.0` on it would assert that this
      // engine produced a run this engine would refuse. NULL means NOBODY RECORDED ONE.
      expect(run?.engineVersion).toBeNull();
      expect(run?.runDigest).toBeNull();
    });

    it('its line exists, and the two beneficiaries the FK probes use sit on the endowments claimed', async () => {
      const prisma = await privilegedPrisma();

      const lines = await prisma.$queryRawUnsafe<{ id: string; waqfId: string; share: string }[]>(
        `SELECT "id","waqfId","sharePercent"::text AS share
           FROM "distribution_line_item" WHERE "distributionId" = $1 ORDER BY "id"`,
        RUN,
      );
      expect(lines.map((row) => row.id)).toContain(LINE);
      for (const line of lines) expect(line.waqfId).toBe(WAQF_A);

      const beneficiaries = await prisma.$queryRawUnsafe<{ id: string; waqfId: string }[]>(
        `SELECT "id","waqfId" FROM "beneficiary" WHERE "id" = ANY($1::text[]) ORDER BY "id"`,
        [BEN_A_UNPAID, BEN_B],
      );
      const byId = new Map(beneficiaries.map((row) => [row.id, row.waqfId]));
      expect(byId.get(BEN_A_UNPAID)).toBe(WAQF_A);
      // The whole point of the cross-endowment probe: this person is a STRANGER to waqf-001.
      expect(byId.get(BEN_B)).toBe(WAQF_B);

      // …and BEN_A_UNPAID must NOT already have a line on this run, or the "coherent line commits"
      // positive control would be measuring nothing but a primary-key collision.
      expect(lines.map((row) => row.id)).not.toContain(`dli-${RUN}-${BEN_A_UNPAID}`);
    });

    it('no seeded run occupies the two periods the positive controls use', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM "distribution"
          WHERE "waqfId" = $1
            AND ("periodStart"::date, "periodEnd"::date) IN
                (($2::date, $3::date), ($4::date, $5::date))`,
        WAQF_A,
        FREE_PERIOD.start,
        FREE_PERIOD.end,
        OTHER_FREE_PERIOD.start,
        OTHER_FREE_PERIOD.end,
      );
      // If this ever fails, a previous run of this file COMMITTED a scratch run — the
      // "green exactly once per database" trap. Fix the leak; do not nonce around it silently.
      expect(rows[0]?.n).toBe(0);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * §1 · `engineVersion` AND `runDigest` — PRESENT, NULLABLE, UNDEFAULTED, NOT BLANK
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('§1 · the run says what produced it', () => {
    it('both columns exist as nullable TEXT with NO default — the absence of a default IS the feature', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<
        {
          column_name: string;
          data_type: string;
          is_nullable: string;
          column_default: string | null;
        }[]
      >(
        `SELECT column_name, data_type, is_nullable, column_default
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'distribution'
            AND column_name IN ('engineVersion','runDigest')
          ORDER BY column_name`,
      );
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.data_type).toBe('text');
        expect(row.is_nullable).toBe('YES');
        // A `@default` would let the DATABASE assert "the current engine produced this run" on
        // behalf of nobody. NULL means NOBODY RECORDED ONE — never "the current version".
        expect(row.column_default).toBeNull();
      }
    });

    it('a real engine version and digest can be written and read back exactly (positive control)', async () => {
      // Rolled back: `distribution_no_delete` means a committed scratch run could never be removed.
      const probe = await runProbe(
        rollbackProbeSql([
          insertRun({
            id: 'dist-s71-digest',
            start: FREE_PERIOD.start,
            end: FREE_PERIOD.end,
            engineVersion: ENGINE_VERSION_SAMPLE,
            runDigest: DIGEST_SAMPLE,
          }),
          // Read it back INSIDE the transaction and raise if the round-trip changed either value.
          `DO $qm_inner$
             DECLARE v text; d text;
             BEGIN
               SELECT "engineVersion","runDigest" INTO v, d
                 FROM "distribution" WHERE "id" = 'dist-s71-digest';
               IF v IS DISTINCT FROM '${ENGINE_VERSION_SAMPLE}' OR d IS DISTINCT FROM '${DIGEST_SAMPLE}' THEN
                 RAISE EXCEPTION 'ROUND_TRIP_CHANGED: version=%, digest=%', v, d;
               END IF;
             END
           $qm_inner$`,
        ]),
      );
      expect(probe).toContain(PROBE_SUCCEEDED);
      expect(probe).not.toContain('ROUND_TRIP_CHANGED');
    });

    it("`engineVersion = ''` is refused by distribution_engine_version_not_blank", async () => {
      const probe = await runProbe(
        guardProbeSql(
          insertRun({
            id: 'dist-s71-blank-v',
            start: FREE_PERIOD.start,
            end: FREE_PERIOD.end,
            engineVersion: '',
          }),
          'check_violation',
        ),
      );
      expect(probe).toContain(PROBE_BLOCKED);
      // The constraint's OWN name — not merely "a check failed". `''` satisfying `IS NOT NULL` is
      // C-10 case #4's shape, on the column that says which engine computed the money.
      expect(probe).toContain('distribution_engine_version_not_blank');
    });

    it("whitespace-only is refused too — the CHECK is `btrim(...) <> ''`, not `<> ''`", async () => {
      const probe = await runProbe(
        guardProbeSql(
          insertRun({
            id: 'dist-s71-ws-v',
            start: FREE_PERIOD.start,
            end: FREE_PERIOD.end,
            engineVersion: '   ',
          }),
          'check_violation',
        ),
      );
      expect(probe).toContain(PROBE_BLOCKED);
      expect(probe).toContain('distribution_engine_version_not_blank');
    });

    it("`runDigest = ''` is refused by distribution_run_digest_not_blank", async () => {
      const probe = await runProbe(
        guardProbeSql(
          insertRun({
            id: 'dist-s71-blank-d',
            start: FREE_PERIOD.start,
            end: FREE_PERIOD.end,
            runDigest: '',
          }),
          'check_violation',
        ),
      );
      expect(probe).toContain(PROBE_BLOCKED);
      expect(probe).toContain('distribution_run_digest_not_blank');
    });

    it('both CHECKs are installed under exactly those names, with the NULL disjunct intact', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ conname: string; def: string }[]>(
        `SELECT conname, pg_get_constraintdef(oid) AS def
           FROM pg_constraint
          WHERE contype = 'c' AND conrelid = 'public.distribution'::regclass
            AND conname IN ('distribution_engine_version_not_blank','distribution_run_digest_not_blank')
          ORDER BY conname`,
      );
      expect(rows.map((row) => row.conname)).toEqual([
        'distribution_engine_version_not_blank',
        'distribution_run_digest_not_blank',
      ]);
      for (const row of rows) {
        // NULL must stay LEGAL. A `NOT NULL` here would have forced the seeded historical run to
        // claim an engine version, which is the one thing migration 21 refuses to fabricate.
        expect(row.def).toMatch(/IS NULL/);
        expect(row.def).toMatch(/btrim/);
      }
    });

    it('there is NO unique index on runDigest — two identical runs hashing alike is the POINT', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'distribution'`,
      );
      const combined = rows.map((row) => row.indexdef).join('\n');
      // Reproducibility is the digest's whole claim: one register at one engine version SHOULD hash
      // identically twice. A UNIQUE index would turn that property into an insert failure.
      expect(combined).not.toMatch(/UNIQUE INDEX.*runDigest/);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * §2 · THE PRINTED SHARE IS THE ENGINE'S SHARE — DECIMAL(9,4) → DECIMAL(9,6)
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('§2 · the share scale', () => {
    it('distribution_line_item.sharePercent is numeric(9,6); beneficiary.sharePercent is UNTOUCHED at (9,4)', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<
        {
          table_name: string;
          data_type: string;
          numeric_precision: number;
          numeric_scale: number;
        }[]
      >(
        `SELECT table_name, data_type, numeric_precision, numeric_scale
           FROM information_schema.columns
          WHERE table_schema = 'public' AND column_name = 'sharePercent'
          ORDER BY table_name`,
      );
      const byTable = new Map(rows.map((row) => [row.table_name, row]));

      const line = byTable.get('distribution_line_item');
      expect(line?.data_type).toBe('numeric');
      expect(line?.numeric_precision).toBe(9);
      expect(line?.numeric_scale).toBe(6);

      // A DIFFERENT FIELD ON A DIFFERENT TABLE. The deed weight the engine actually reads is
      // `beneficiary."stipulatedWeight" DECIMAL(38,18)`; waqf-001's three roster `sharePercent`s
      // sum to 37.5 rather than 100 precisely because they are a relic. Widening this one would
      // imply it is an engine figure. Its fate is E4's.
      const beneficiary = byTable.get('beneficiary');
      expect(beneficiary?.numeric_precision).toBe(9);
      expect(beneficiary?.numeric_scale).toBe(4);
    });

    it('BOTH HALVES, on the real column: (9,4) truncates 33.333333 to 33.3333 and (9,6) keeps it', async () => {
      const prisma = await privilegedPrisma();

      // The measurement that justifies the migration, re-taken every run rather than quoted from a
      // comment. The column is forced BACK to (9,4) inside a transaction that always throws, so the
      // regression this fixed is demonstrated rather than described — and if someone reverts §2 the
      // second half of this test goes red instead of the first quietly agreeing with it.
      const measured: Record<string, string | undefined> = {};
      await prisma
        .$transaction(async (tx) => {
          const post = await tx.$queryRawUnsafe<{ share: string }[]>(
            `UPDATE "distribution_line_item" SET "sharePercent" = 33.333333
              WHERE "id" = $1 RETURNING "sharePercent"::text AS share`,
            LINE,
          );
          measured.post = post[0]?.share;

          await tx.$executeRawUnsafe(
            'ALTER TABLE "distribution_line_item" ALTER COLUMN "sharePercent" TYPE DECIMAL(9,4)',
          );
          const pre = await tx.$queryRawUnsafe<{ share: string }[]>(
            `SELECT "sharePercent"::text AS share FROM "distribution_line_item" WHERE "id" = $1`,
            LINE,
          );
          measured.pre = pre[0]?.share;

          throw new Error('S7_1_ROLLBACK');
        })
        .catch((error: unknown) => {
          if (!String(error).includes('S7_1_ROLLBACK')) throw error;
        });

      expect(measured.post).toBe('33.333333');
      // ⚠ THE DEFECT, REPRODUCED: at scale 4 the last two digits of every statement figure are gone.
      expect(measured.pre).toBe('33.3333');

      // …and the write was rolled back, so the seeded value is still the seeded value.
      const after = await prisma.$queryRawUnsafe<{ share: string }[]>(
        `SELECT "sharePercent"::text AS share FROM "distribution_line_item" WHERE "id" = $1`,
        LINE,
      );
      expect(after[0]?.share).toBe('12.500000');
    });

    it('the seeded lines now read at six decimals — the statement figure the engine would print', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ id: string; share: string }[]>(
        `SELECT "id","sharePercent"::text AS share
           FROM "distribution_line_item" WHERE "distributionId" = $1 ORDER BY "id"`,
        RUN,
      );
      // Before migration 21 these read '12.5000'. The value did not change; its SCALE did.
      expect(rows.map((row) => row.share)).toEqual(['12.500000', '12.500000']);
    });

    it('a six-decimal share round-trips byte-for-byte, and a seventh decimal rounds HALF UP', async () => {
      const probe = await runProbe(
        rollbackProbeSql([
          insertRun({ id: 'dist-s71-share', start: FREE_PERIOD.start, end: FREE_PERIOD.end }),
          insertLine({
            id: 'dli-s71-share',
            waqfId: WAQF_A,
            distributionId: 'dist-s71-share',
            beneficiaryId: BEN_A_UNPAID,
            // 100/3 as the engine prints it: `sharePercentOf()` → toFixed(6, ROUND_HALF_UP).
            sharePercent: '33.333333',
          }),
          `DO $qm_inner$
             DECLARE s text;
             BEGIN
               SELECT "sharePercent"::text INTO s
                 FROM "distribution_line_item" WHERE "id" = 'dli-s71-share';
               IF s <> '33.333333' THEN RAISE EXCEPTION 'SIX_DECIMALS_LOST: %', s; END IF;
               -- A SEVENTH decimal is not representable and Postgres rounds half up, matching
               -- Decimal.ROUND_HALF_UP in the engine. Asserted so the two agree by measurement.
               UPDATE "distribution_line_item" SET "sharePercent" = 12.3456789
                WHERE "id" = 'dli-s71-share';
               SELECT "sharePercent"::text INTO s
                 FROM "distribution_line_item" WHERE "id" = 'dli-s71-share';
               IF s <> '12.345679' THEN RAISE EXCEPTION 'ROUNDING_DISAGREES: %', s; END IF;
             END
           $qm_inner$`,
        ]),
      );
      expect(probe).toContain(PROBE_SUCCEEDED);
      expect(probe).not.toContain('SIX_DECIMALS_LOST');
      expect(probe).not.toContain('ROUNDING_DISAGREES');
    });

    it('the narrowing half of the widening is real: 1000 no longer fits, which is what §0b pre-flights', async () => {
      // (9,4) allowed five integer digits (99999.9999); (9,6) allows three (999.999999). A share is
      // 0…100 by construction, so nothing legal is near it — but "should be" is what a measurement
      // replaces. `22003 numeric_value_out_of_range` is not in `GuardCondition`, so this asserts on
      // the server's own message via the ordinary error path.
      const prisma = await privilegedPrisma();
      let message = '';
      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `UPDATE "distribution_line_item" SET "sharePercent" = 1000 WHERE "id" = $1`,
            LINE,
          );
          throw new Error('S7_1_UNREACHED');
        })
        .catch((error: unknown) => {
          message = error instanceof Error ? error.message : String(error);
        });
      expect(message).not.toContain('S7_1_UNREACHED');
      expect(message).toMatch(/numeric field overflow|22003/);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * §3 · ONE LIVE RUN PER ENDOWMENT AND PERIOD
   *
   * Three positive controls, because without them "the index refused" is indistinguishable from
   * "the index is TOTAL" — and a total index would silently kill §08's correction path, which is a
   * NEW run plus the old one retired as CANCELLED.
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('§3 · one live run per period', () => {
    it('the index exists, is UNIQUE, and carries BOTH exclusions in its stored predicate', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
        `SELECT indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'distribution_one_live_run_per_period'`,
      );
      const def = rows[0]?.indexdef ?? '';
      expect(def).toMatch(/CREATE UNIQUE INDEX/);
      expect(def).toMatch(/"waqfId", "periodStart", "periodEnd"/);
      // PARTIAL, and the predicate is read out of the catalogue rather than trusted from the file.
      expect(def).toMatch(/"deletedAt" IS NULL/);
      expect(def).toMatch(/status <> 'CANCELLED'/);
    });

    it('a SECOND LIVE run for the same endowment and period is refused, by that index by name', async () => {
      const probe = await runProbe(
        uniqueProbeSql(
          insertRun({ id: 'dist-s71-dup', start: SEEDED_PERIOD.start, end: SEEDED_PERIOD.end }),
        ),
      );
      expect(probe).toContain(PROBE_BLOCKED);
      // The index's OWN name. Two live runs for one quarter are two answers to what this family is
      // owed, picked between by `ORDER BY` accident.
      expect(probe).toContain('distribution_one_live_run_per_period');
    });

    it('POSITIVE CONTROL — a CANCELLED second run for that same period COMMITS (§08 correction path)', async () => {
      const probe = await runProbe(
        rollbackProbeSql([
          insertRun({
            id: 'dist-s71-cancelled',
            start: SEEDED_PERIOD.start,
            end: SEEDED_PERIOD.end,
            status: 'CANCELLED',
          }),
        ]),
      );
      // If this went red, the index would be TOTAL and the correction path unrepresentable: the
      // replacement run could never be inserted, and the database would be enforcing
      // "compute once, correctly, forever", which no engine can promise.
      expect(probe).toContain(PROBE_SUCCEEDED);
    });

    it('⚠ WAS A POSITIVE CONTROL · a SOFT-DELETED second run for that period is now refused BEFORE the index', async () => {
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ⚠ THIS TEST CHANGED MEANING IN S7, AND THE OLD MEANING IS RECORDED RATHER THAN OVERWRITTEN.
      // It used to prove that `distribution_one_live_run_per_period`'s partial predicate
      // (`WHERE "deletedAt" IS NULL`) really is partial: a second run for the SEEDED period COMMITS
      // when it is born soft-deleted. That claim about §3's INDEX is still true.
      //
      // What changed is that the statement no longer REACHES the index. `distribution_row_retirement`
      // (migration 27) is `BEFORE INSERT OR UPDATE`, so a run BORN RETIRED is refused 42501 as a
      // reserved matter first — AV3-03's lesson applied in advance: gating the transition and not the
      // birth is the hole migration 15 had to close on `asset`.
      //
      // ⚠ SO THE INDEX'S PARTIALITY IS NOW PROVEN BY ITS **DEFINITION**, not by this insert:
      // §3's own census test reads `indexdef` and asserts the `WHERE "deletedAt" IS NULL` clause.
      // A behavioural proof would need an approved reserved matter naming the run, and minting one
      // inside a rolled-back plpgsql probe would test the approval machinery rather than the index.
      // Said out loud because "the test still passes" and "the test still proves what it says" are
      // different claims, and this file has been careful about that distinction elsewhere.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      const probe = await runProbe(
        guardProbeSql(
          insertRun({
            id: 'dist-s71-deleted',
            start: SEEDED_PERIOD.start,
            end: SEEDED_PERIOD.end,
            deletedAt: '2026-05-01',
          }),
          'insufficient_privilege',
        ),
      );
      expect(probe).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(probe).toMatch(/RECORDING A DISTRIBUTION RUN THAT IS ALREADY RETIRED/);
      // ⚠ And it says what it is: engineering's extension, not a ruling.
      // ⚠ INVERTED with the owner's confirmation (memo "S7 · Migration 27"; migration 28 replaced
      // the body, since 27 was applied and Prisma checksums applied migrations). It used to require
      // the flagged wording; requiring it now would pin a sentence that is false.
      expect(probe).toMatch(/verbatim: "confirmed\."/);
    });

    it('POSITIVE CONTROL — a LIVE run for a DIFFERENT period COMMITS (so the insert shape is legal)', async () => {
      // This is the control that makes the refusal above mean anything: the identical statement,
      // differing only in the period, succeeds.
      const probe = await runProbe(
        rollbackProbeSql([
          insertRun({ id: 'dist-s71-other', start: FREE_PERIOD.start, end: FREE_PERIOD.end }),
        ]),
      );
      expect(probe).toContain(PROBE_SUCCEEDED);
    });

    it('POSITIVE CONTROL — the same period on a DIFFERENT endowment COMMITS (the key is per-waqf)', async () => {
      const probe = await runProbe(
        rollbackProbeSql([
          insertRun({
            id: 'dist-s71-waqf-b',
            waqfId: WAQF_B,
            start: SEEDED_PERIOD.start,
            end: SEEDED_PERIOD.end,
          }),
        ]),
      );
      expect(probe).toContain(PROBE_SUCCEEDED);
    });

    it("migration 21's own §0a PRE-FLIGHT fires when a database really holds two live runs", async () => {
      // ⚠ WHY THIS TEST EXISTS. §0a is the branch nobody ever executes: on every clean database the
      // offenders query returns NULL and the block is a no-op, so a broken pre-flight would look
      // exactly like a working one. That is R6-C1's lesson one layer down — a generator that cannot
      // reach a configuration reports its silence as success. So the configuration is CONSTRUCTED:
      // drop the index, insert the duplicate, run §0a's REAL SQL read from the migration file, and
      // roll the whole thing back.
      const file = readFileSync(
        join(
          PACKAGE_ROOT,
          'prisma',
          'migrations',
          '00000000000021_e6_distribution_run_digest',
          'migration.sql',
        ),
        'utf8',
      );
      // The single `DO $$ … $$;` block that is §0. Extracted, not retyped: a re-implementation here
      // would test this file's copy of the predicate instead of the migration's.
      const match = /^DO \$\$\n[\s\S]*?\n\$\$;$/m.exec(file);
      const preflight = match?.[0];
      expect(preflight).toBeDefined();
      expect(preflight).toContain('QMULATE_E6_PREFLIGHT');

      const prisma = await privilegedPrisma();
      let message = '';
      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe('DROP INDEX "distribution_one_live_run_per_period"');
          await tx.$executeRawUnsafe(
            insertRun({
              id: 'dist-s71-preflight',
              start: SEEDED_PERIOD.start,
              end: SEEDED_PERIOD.end,
            }),
          );
          await tx.$executeRawUnsafe(preflight ?? '');
          throw new Error('S7_1_PREFLIGHT_DID_NOT_FIRE');
        })
        .catch((error: unknown) => {
          message = error instanceof Error ? error.message : String(error);
        });

      expect(message).not.toContain('S7_1_PREFLIGHT_DID_NOT_FIRE');
      expect(message).toContain('QMULATE_E6_PREFLIGHT');
      // It must NAME the offending group — the whole reason §0 exists instead of letting
      // `CREATE UNIQUE INDEX` die on a bare 23505 with no row named. Two live runs are a FINDING
      // for a Nazir, not something a migration quietly picks a winner from.
      expect(message).toContain(WAQF_A);
      expect(message).toContain(RUN);
      expect(message).toContain('dist-s71-preflight');

      // …and the index is back, because the transaction rolled back. Asserted, not assumed: a
      // leaked DROP INDEX would silently disarm §3 for every later file in this single-fork suite.
      const rows = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'distribution_one_live_run_per_period'`,
      );
      expect(rows[0]?.n).toBe(1);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * §4 · THE GUARD FAMILY STILL HOLDS AFTER THE HEAP REWRITE
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('§4 · the pre-existing guards, re-measured', () => {
    it('all EIGHT triggers across the two tables are present at ENABLE ALWAYS (seven before migration 52)', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<
        { tbl: string; tgname: string; verbs: string; enabled: string }[]
      >(
        `SELECT c.relname AS tbl, t.tgname,
                CASE WHEN (t.tgtype &  4) > 0 THEN 'I' ELSE '' END ||
                CASE WHEN (t.tgtype & 16) > 0 THEN 'U' ELSE '' END ||
                CASE WHEN (t.tgtype &  8) > 0 THEN 'D' ELSE '' END ||
                CASE WHEN (t.tgtype & 32) > 0 THEN 'T' ELSE '' END AS verbs,
                t.tgenabled::text AS enabled
           FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE NOT t.tgisinternal AND n.nspname = 'public'
            AND c.relname IN ('distribution','distribution_line_item')
          ORDER BY c.relname, t.tgname`,
      );
      // MEASURED after migration 21 on a fresh cluster, and re-measured after 26/27.
      // `distribution_authority` is the DEFERRED constraint trigger (C-10) and fires on INSERT and
      // UPDATE; the rest are BEFORE row/statement.
      // ⊕ SIX BECAME SEVEN IN S7 — ONE addition, and a second guard that is deliberately ABSENT:
      //   · `distribution_row_retirement` (migration 27) is the new trigger — the soft-delete gate,
      //     an extension of Q8 + AV7-F4 to a new SUBJECT, shipped flagged and since CONFIRMED by
      //     the product owner (memo "S7 · Migration 27"; the flagged wording was replaced by
      //     migration 28, not edited into 27, which is applied and checksummed). `IU`, because a run BORN retired is an `EXECUTED`-status row that blocks
      //     its period while being invisible to every read path (AV3-03 one table over).
      //   · ⚠ `distribution_paid_periods_disjoint` IS **NOT** IN THIS LIST, AND ITS ABSENCE IS THE
      //     WHOLE REASON `guard-verb-coverage`'s CENSUS-4 EXISTS. It is an EXCLUDE CONSTRAINT rather
      //     than a trigger, so dropping it leaves this census — and every other trigger census —
      //     GREEN while re-opening AV7-F2. Named here so a reader of this list does not conclude
      //     that AV7-F2's guard is missing, and does not "helpfully" add it to the array.
      expect(rows.map((row) => `${row.tbl}.${row.tgname}:${row.verbs}`)).toEqual([
        'distribution.distribution_authority:IU',
        'distribution.distribution_no_delete:D',
        'distribution.distribution_no_truncate:T',
        // ⊕ EIGHT since migration 52 (S12-3 · BR-1101 / V-11): a run cannot be BORN on an endowment
        // whose onboarding Gate 02 is not CLEARED — INSERT only, since a run that exists was admitted
        // when the gate was cleared and a later reopen does not retire it. Its walls are measured in
        // `onboarding-gate.integration.test.ts`; it is named here so this census stays exact.
        'distribution.distribution_onboarding_gate:I',
        'distribution.distribution_row_retirement:IU',
        'distribution.distribution_status_transition:U',
        'distribution_line_item.distribution_line_item_no_delete:D',
        'distribution_line_item.distribution_line_item_no_truncate:T',
      ]);
      // 'A' = ENABLE ALWAYS. 'O' means one `SET session_replication_role = 'replica'` skips it —
      // the Sprint-1 finding that defeated gate G-1.
      for (const row of rows) expect(row.enabled).toBe('A');
    });

    it('the status lattice still refuses a transition OUT of EXECUTED (distribution_status_transition)', async () => {
      const probe = await runProbe(
        guardProbeSql(
          `UPDATE "distribution" SET "status" = 'APPROVED'::"DistributionStatus" WHERE "id" = '${RUN}'`,
          'insufficient_privilege',
        ),
      );
      expect(probe).toContain(PROBE_BLOCKED);
      // The trigger's OWN sentence, not merely a 42501.
      expect(probe).toContain('is terminal');
      expect(probe).toContain('A correction is a NEW run');
      expect(probe).toContain(RUN);
    });

    it('…including EXECUTED → CANCELLED: the terminal test runs BEFORE the CANCELLED allowance', async () => {
      const probe = await runProbe(
        guardProbeSql(
          `UPDATE "distribution" SET "status" = 'CANCELLED'::"DistributionStatus" WHERE "id" = '${RUN}'`,
          'insufficient_privilege',
        ),
      );
      expect(probe).toContain(PROBE_BLOCKED);
      expect(probe).toContain('is terminal');
      // ⚠ Load-bearing for §3: if a paid run could be walked to CANCELLED, the partial index's
      // exclusion would become a way to un-occupy a period that had already been PAID.
      expect(probe).toContain('CANCELLED rejected');
    });

    it('POSITIVE CONTROL — a legal DRAFT → COMPUTED transition still COMMITS', async () => {
      // The control that keeps the two refusals above from being "UPDATE never works here".
      // ⚠ It uses FREE_PERIOD, not the seeded one: migration 21 §3 now refuses a second live run
      // for waqf-001's Q1, so a DRAFT scratch run must occupy a period of its own. That collision
      // is exactly the "consequence for writers" the migration's header names.
      const probe = await runProbe(
        rollbackProbeSql([
          insertRun({ id: 'dist-s71-lattice', start: FREE_PERIOD.start, end: FREE_PERIOD.end }),
          `UPDATE "distribution" SET "status" = 'COMPUTED'::"DistributionStatus"
            WHERE "id" = 'dist-s71-lattice'`,
        ]),
      );
      expect(probe).toContain(PROBE_SUCCEEDED);
    });

    it('distribution_line_item_no_delete still fires on a line of a run that has left computation', async () => {
      const probe = await runProbe(
        guardProbeSql(
          `DELETE FROM "distribution_line_item" WHERE "id" = '${LINE}'`,
          'insufficient_privilege',
        ),
      );
      expect(probe).toContain(PROBE_BLOCKED);
      // The guard's own sentence, and the run's status inside it — so a refusal for some other
      // reason (an ACL, an FK) cannot be mistaken for this guard.
      expect(probe).toContain('DELETE on "distribution_line_item" is refused');
      expect(probe).toContain(RUN);
      expect(probe).toContain('EXECUTED');
    });

    it('POSITIVE CONTROL — a line of a DRAFT run is still deletable (re-computation is unaffected)', async () => {
      // §2b of migration 6 draws the line at PENDING_APPROVAL precisely so a DRAFT run's lines stay
      // working state. If this went red the guard would be over-broad and E6's re-compute path dead.
      const probe = await runProbe(
        rollbackProbeSql([
          insertRun({ id: 'dist-s71-draft', start: FREE_PERIOD.start, end: FREE_PERIOD.end }),
          insertLine({
            id: 'dli-s71-draft',
            waqfId: WAQF_A,
            distributionId: 'dist-s71-draft',
            beneficiaryId: BEN_A_UNPAID,
          }),
          `DELETE FROM "distribution_line_item" WHERE "id" = 'dli-s71-draft'`,
        ]),
      );
      expect(probe).toContain(PROBE_SUCCEEDED);
    });

    it('migration 19 composite FK — a line may not pay a beneficiary of ANOTHER endowment', async () => {
      const probe = await runProbe(
        guardProbeSql(
          insertLine({
            id: 'dli-s71-stranger',
            waqfId: WAQF_A,
            distributionId: RUN,
            // A waqf-002 person, on waqf-001's run. Before migration 19 this COMMITTED.
            beneficiaryId: BEN_B,
          }),
          'foreign_key_violation',
        ),
      );
      expect(probe).toContain(PROBE_BLOCKED);
      expect(probe).toContain('distribution_line_item_waqfId_beneficiaryId_fkey');
    });

    it('migration 19 composite FK — a line may not claim an endowment its parent run does not have', async () => {
      const probe = await runProbe(
        guardProbeSql(
          insertLine({
            id: 'dli-s71-wrong-parent',
            // waqfId says waqf-002; the parent run dist-001 is waqf-001. The beneficiary FK is
            // SATISFIED here (ben-004 really is waqf-002), so the constraint that must bite is the
            // one tying the line to its RUN — asserted by name, not by "an FK failed".
            waqfId: WAQF_B,
            distributionId: RUN,
            beneficiaryId: BEN_B,
          }),
          'foreign_key_violation',
        ),
      );
      expect(probe).toContain(PROBE_BLOCKED);
      expect(probe).toContain('distribution_line_item_waqfId_distributionId_fkey');
    });

    it('POSITIVE CONTROL — a COHERENT line on the same EXECUTED run COMMITS', async () => {
      // Identical statement shape to both FK refusals above, differing only in which ids agree.
      // Without this, "the FK refused" could not be told apart from "this INSERT never works".
      const probe = await runProbe(
        rollbackProbeSql([
          insertLine({
            id: 'dli-s71-coherent',
            waqfId: WAQF_A,
            distributionId: RUN,
            beneficiaryId: BEN_A_UNPAID,
          }),
        ]),
      );
      expect(probe).toContain(PROBE_SUCCEEDED);
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * §5 · WHAT IS **NOT** GUARDED — MEASURED AND RECORDED, NOT PAPERED OVER
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('§5 · the residual, measured', () => {
    it('⚠ NOT WRITE-ONCE: runDigest and engineVersion can be REWRITTEN on an EXECUTED run', async () => {
      // `distribution_status_transition` is `BEFORE UPDATE` and returns early when the STATUS is
      // unchanged, so this UPDATE is not a transition and no guard sees it. Recorded here as a
      // MEASUREMENT because the alternative — a comment claiming "the lattice protects it" — is the
      // exact class of false assurance this suite exists to prevent.
      //
      // TODO(surface): seal both columns once a run leaves computation. Recommended shape is a
      // trigger mirroring `qmulate_distribution_line_reject_delete()`'s parent-status test rather
      // than a second invented rule, held back only because WHEN the two are written is a workflow
      // question S7's router is still being built around. Migration 22.
      const probe = await runProbe(
        rollbackProbeSql([
          `UPDATE "distribution"
              SET "engineVersion" = '${ENGINE_VERSION_SAMPLE}', "runDigest" = '${DIGEST_SAMPLE}'
            WHERE "id" = '${RUN}'`,
          `UPDATE "distribution" SET "runDigest" = '${'b'.repeat(64)}' WHERE "id" = '${RUN}'`,
        ]),
      );
      expect(probe).toContain(PROBE_SUCCEEDED);
    });

    it('⚠ NOT PAIRED: a version with no digest, and a digest with no version, both COMMIT', async () => {
      // The right invariant is `("engineVersion" IS NULL) = ("runDigest" IS NULL)` — a digest whose
      // engine version is unknown is unverifiable, and a version with no digest attests to nothing.
      // The house even has the convention (`waqf_reversion_recorded_dual_dated`). Held back because
      // a constraint that decides a workflow by SQLSTATE is migration 12's rule broken in the usual
      // direction. TODO(surface): confirm the write order, then pair them. Migration 22.
      const half = await runProbe(
        rollbackProbeSql([
          insertRun({
            id: 'dist-s71-half-a',
            start: FREE_PERIOD.start,
            end: FREE_PERIOD.end,
            engineVersion: ENGINE_VERSION_SAMPLE,
          }),
          insertRun({
            id: 'dist-s71-half-b',
            start: OTHER_FREE_PERIOD.start,
            end: OTHER_FREE_PERIOD.end,
            runDigest: DIGEST_SAMPLE,
          }),
        ]),
      );
      expect(half).toContain(PROBE_SUCCEEDED);
    });

    it('the run output still has nowhere to land but computationTrace — named, not guessed at', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'distribution'`,
      );
      const columns = new Set(rows.map((row) => row.column_name));
      // The engine emits all of these; migration 21 invented a column for NONE of them, because
      // each has a PRODUCT half (which vocabulary, whose ar/en copy, which figures are unverified)
      // and a column would be an answer nobody has given. Asserted so the absence stays a recorded
      // decision rather than becoming an oversight somebody "fixes" without asking.
      for (const missing of [
        'flags',
        'invariantsChecked',
        'unverifiedNotes',
        'entitlementRule',
        'refusalCode',
        'shartAlWaqifVersion',
      ]) {
        expect(columns.has(missing)).toBe(false);
      }
      expect(columns.has('computationTrace')).toBe(true);
    });

    it('distribution_line_item.transferRef is STILL plaintext — the E6/S7 rename window is open, not taken', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'distribution_line_item'
            AND column_name IN ('transferRef','transferRefEnc')`,
      );
      // The model's own `TODO(surface)` names E6/S7 as the window to rename this to `transferRefEnc`
      // (§12 lists distribution payout references as a field-encryption target while §07 models it
      // as plaintext). Migration 21 did NOT do it: a rename plus an encryption path is a change to
      // how money references are stored, and it belongs with the router that first writes one.
      expect(rows.map((row) => row.column_name)).toEqual(['transferRef']);
    });

    it('blockedReason is STILL free text with no vocabulary — the copy question is unanswered', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ data_type: string; udt_name: string }[]>(
        `SELECT data_type, udt_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'distribution_line_item'
            AND column_name = 'blockedReason'`,
      );
      // Deliberate. Turning it into an enum would fix a vocabulary before anyone has authored the
      // product-approved ar/en sentence for each value — and NO refusal or exclusion code may get
      // invented Arabic in a code change (E10/E12). It stays text until the copy exists.
      expect(rows[0]?.data_type).toBe('text');
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * §6 · AV7-F2 — THE SAME GHALLAH DISTRIBUTED TWICE. ✅ **CLOSED 2026-08-20**, AND THIS SECTION
   *      NOW DRIVES THE SHIPPED CONSTRAINT RATHER THAN A CANDIDATE IT INSTALLED ITSELF.
   *
   * WHAT THE ADVERSARY MEASURED THROUGH THE API (probe A-10,
   * `packages/api/test/av7-corpus-wall.integration.test.ts`): two windows ONE DAY APART —
   * 2027-08-01…08-31 and 2027-08-02…08-31 — both live, both approved by a real second Nazir, both
   * EXECUTED. SAR 820,000.00 recorded as owed against SAR 410,000.00 of ghallah from ONE SAR
   * 500,000 receipt. §3's index cannot see it: it is UNIQUE on the EXACT TRIPLE
   * `(waqfId, periodStart, periodEnd)`, and those two triples differ. The excess has no income
   * provenance, so it is asl by the engine's own definition (Binding rule 1) — and the engine
   * cannot see it either, because each run is INDIVIDUALLY CORRECT.
   *
   * ⚠ THIS SECTION USED TO SAY *"NOTHING HERE CLAIMS THE BREACH IS CLOSED. It is open."* It is now
   * closed, by `distribution_paid_periods_disjoint` (migration 26), and A-10 is INVERTED rather than
   * deleted: it asserts the second run is refused `23P01` and POSTS NOTHING, while the first still
   * pays its 410,000.00 in full.
   *
   * ── WHAT HAD TO HAPPEN FIRST, AND IT WAS NOT A LINE IN A MIGRATION ──────────────────────────
   * MEASURED on a `--reset` → `migrate:deploy` → `db:seed` cluster by installing the constraint for
   * real and running `@qmulate/api`'s integration suite against it:
   *   · predicate `deletedAt IS NULL AND status <> 'CANCELLED'`  → **45 of 60 distribution tests RED**;
   *   · the shipped predicate                                    → **25 of 620 tests RED**, 5 files
   *     (av7-approval-identity 7 · distribution-run 11 · distribution-maker-checker 3 ·
   *     av7-lifecycle-trail 3 · av7-corpus-wall 1, the last being A-10 itself).
   * EVERY failure was `23P01` naming the constraint, and every one was a TRUE POSITIVE. `waqf-001`
   * has exactly ONE income receipt in the whole fixture (`rev-001`, SAR 350,000.00, 2026-03-31) and
   * `dist-001` had already paid the quarter containing it, so four suites pinned `periodEnd` to
   * `2026-03-31` and varied only the START DAY — in their own headers, *"so the ledger window's
   * CONTENTS do not change"*. **That strategy IS this breach, written down as a design principle and
   * repeated on every run.** The guard therefore landed together with a test round: a disjoint-window
   * ALLOCATOR (`paidPeriod()` in `packages/api/test/setup.ts`, with its own suite proving every
   * window it can produce is pairwise disjoint and inside the band the holiday calendar can compute)
   * plus `bookIncome()`, which books each window's own pool through the real procedure and REFUSES if
   * the window holds anything else.
   *
   * ── ⚠ THE SHIPPED PREDICATE IS NARROWER THAN THE ONE THIS SECTION RECOMMENDED ───────────────
   * `"deletedAt" IS NULL` was dropped — see {@link CANDIDATE_PREDICATE}. The visible consequence is
   * that `SOFT_DELETED_OVERLAP`, asserted here as a POSITIVE CONTROL while the fix was a candidate,
   * is now asserted as a REFUSAL. Soft-deleting a paid run does not un-pay a beneficiary: the
   * `distribution_line_item` rows are still there and the halalas are still owed, so its period must
   * stay blocked.
   *
   * ── ⚠ WHAT IS STILL OPEN, AND IT IS NO LONGER A CONTROL ─────────────────────────────────────
   * `transaction` still has NO link to a `Distribution` — candidate (B), the consumed-by-a-run
   * marker. It is no longer a CONTROL, and the argument is in migration 26's header: a run's
   * receipts are the ledger rows inside `[periodStart, periodEnd + 1 day)`, `create` writes the
   * period columns and the stored input from ONE argument, `computationTrace` is write-once
   * (migration 22 §1), and `execute` pays from a REPLAY of that stored input — so DISJOINT periods
   * make one receipt in two paid runs impossible. The marker would answer *"which run paid this
   * rent?"*, a QUERYABILITY question, and it is still owed. The two tests below that measure its
   * absence are kept, reframed.
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  describe('§6 · AV7-F2 · the same ghallah twice — CLOSED, and measured', () => {
    it('✅ THE FIX · the EXCLUDE constraint exists, with the predicate that shipped and NOT `deletedAt`', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<
        { conname: string; contype: string; def: string }[]
      >(
        `SELECT conname, contype::text AS contype, pg_get_constraintdef(oid) AS def
           FROM pg_constraint WHERE conrelid = 'distribution'::regclass ORDER BY conname`,
      );
      // `x` is Postgres' contype for an EXCLUDE constraint. This test used to assert there were
      // NONE — that assertion WAS AV7-F2: two runs whose periods overlap without being identical
      // were representable. It is inverted, not deleted.
      const exclusions = rows.filter((row) => row.contype === 'x');
      expect(exclusions.map((row) => row.conname)).toEqual([CANDIDATE_CONSTRAINT]);
      const def = exclusions[0]?.def ?? '';
      expect(def).toContain('USING gist');
      // The INCLUSIVE bound is load-bearing: `'[]'` normalises to [start, end+1), byte-for-byte the
      // interval `periodWindow()` gives the run's own ledger query. A half-open `'[)'` would let
      // 2029-08-31…09-30 sit beside 2029-08-01…08-31 as if they were disjoint.
      expect(def).toContain("'[]'");
      expect(def).toContain('EXECUTED');
      // ⚠ AND NOT `deletedAt` — the one clause a future reader is most likely to "restore" while
      // reconciling this file against the recommendation it used to make. Migration 26 §3 refuses to
      // install if it comes back; this says the same thing from the other side.
      expect(def).not.toContain('deletedAt');
      // …and the only period key on this table is §3's exact-triple index. Asserted together so a
      // reader cannot mistake "a period key exists" for "overlap is handled".
      const indexes = await prisma.$queryRawUnsafe<{ indexname: string; indexdef: string }[]>(
        `SELECT indexname, indexdef FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = 'distribution' ORDER BY indexname`,
      );
      // ⚠ TWO period keys now, not one, and the second is the EXCLUDE constraint's backing index.
      // This assertion used to name only the exact-triple index and then say — correctly at the
      // time — that a reader must not mistake "a period key exists" for "overlap is handled". Both
      // now exist, and they answer DIFFERENT questions: the unique index refuses a duplicate TRIPLE
      // among live runs, the exclusion refuses an overlapping RANGE among PAID ones.
      const periodKeys = indexes.filter((row) => row.indexdef.includes('"periodStart"'));
      expect(periodKeys.map((row) => row.indexname).sort()).toEqual([
        'distribution_one_live_run_per_period',
        CANDIDATE_CONSTRAINT,
      ]);
      const triple = periodKeys.find(
        (row) => row.indexname === 'distribution_one_live_run_per_period',
      );
      expect(triple?.indexdef).toContain('"waqfId", "periodStart", "periodEnd"');
    });

    it('THE DEEPER FACT · nothing on `transaction` records that a receipt was distributed', async () => {
      const prisma = await privilegedPrisma();
      const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'transaction' ORDER BY column_name`,
      );
      const names = columns.map((row) => row.column_name);
      // 24 columns, and not one of them points at a run. So there is no answer to "which run paid
      // this rent?" outside the paying run's own Json, and NOTHING makes a second run of the same
      // receipt visible — which is why candidate (A)'s period test does not close the invariant:
      // even NON-overlapping consecutive windows rely entirely on the caller choosing them.
      expect(names).not.toContain('consumedByDistributionId');
      expect(names).not.toContain('distributionId');
      expect(names.filter((name) => /distribution/i.test(name))).toEqual([]);

      const fks = await prisma.$queryRawUnsafe<{ conname: string; target: string }[]>(
        `SELECT conname, confrelid::regclass::text AS target FROM pg_constraint
          WHERE conrelid = 'transaction'::regclass AND contype = 'f' ORDER BY conname`,
      );
      // Seven foreign keys — waqf, bank_account ×2, asset ×2, transaction ×2 (the reversal and
      // correction links migration 20 added). None to `distribution`.
      expect(fks.map((row) => row.target)).not.toContain('distribution');
    });

    it('…and the ASYMMETRY between the two candidate fixes: the seeded run names no receipts', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ keys: string | null }[]>(
        `SELECT (SELECT string_agg(k, ',' ORDER BY k) FROM jsonb_object_keys("computationTrace") k)
                AS keys
           FROM "distribution" WHERE "id" = $1`,
        RUN,
      );
      // `dist-001` is a HISTORICAL record: its trace carries `derivation,fixtureTotalSar,note,origin`
      // and NO `input`, so it does not name the receipts it paid. MEASURED, because it decides
      // between the candidates rather than colouring them:
      //   · candidate (B) — a marker written from a run's own stored input — is BLIND to this run,
      //     so a re-distribution of waqf-001's already-paid Q1 2026 would not be refused by it;
      //   · candidate (A) — periods — refuses it, because the period is a column on every run
      //     whatever its provenance.
      // Neither candidate dominates. That is an argument for both, not for picking the cheaper one.
      expect(rows[0]?.keys).toBe('derivation,fixtureTotalSar,note,origin');
      expect(rows[0]?.keys).not.toContain('input');
    });

    it('✅ THE BREACH IS NO LONGER REPRESENTABLE · two EXECUTED runs ONE DAY APART are REFUSED', async () => {
      // A-10's shape in the layer that owns the constraint. `insertRun` is the same helper §3's
      // refusals use, so the only difference from an ACCEPTED insert is the period — which is
      // exactly the point: one day of difference used to be invisible to the exact-triple index.
      // ⚠ THIS ASSERTION IS INVERTED FROM `PROBE_SUCCEEDED`. It used to prove the exploit worked.
      // ⚠ `guardProbeSql` WITH `exclusion_violation`, NOT `rollbackProbeSql`. The latter is for
      // statements that MUST SUCCEED (it raises PROBE_SUCCEEDED at the end), so under the fix it let
      // the raw driver error through and the assertion matched a string nobody had pinned. Pinning
      // the CONDITION is what stops a refusal with the wrong SQLSTATE reading as the right one —
      // `exclusion_violation` / 23P01 was added to `setup.ts`'s union by this change, because every
      // guard before this one was a trigger (42501) or a CHECK (23514).
      const probe = await runProbe(
        guardProbeSql(
          // ⚠ JOINED INTO ONE STATEMENT STRING: `guardProbeSql` takes a single statement, and an
          // array interpolates as `a,b` — invalid SQL whose raw driver error looks like a refusal.
          [
            insertRun({ id: 'dist-s76-paid-a', ...F2_PAIR_A, ...EXECUTED_RUN }),
            insertRun({ id: 'dist-s76-paid-b', ...F2_PAIR_B, ...EXECUTED_RUN }),
          ].join('; '),
          'exclusion_violation',
        ),
      );
      expect(probe).toContain(PROBE_BLOCKED);
      expect(probe).toContain('23P01');
      expect(probe).toContain(CANDIDATE_CONSTRAINT);
    });

    /**
     * The experiment runs ONCE and every assertion below reads one line of its report.
     *
     * ⚠ ONE RUN, NOT ONE PER TEST, AND FOR A REASON THAT IS NOT SPEED: installing the constraint
     * takes an `ACCESS EXCLUSIVE` lock on `distribution`, and seven of those inside one file is
     * seven chances to collide with `@qmulate/api`'s suite on the SAME database (the two are
     * serialized by turbo, not by vitest — see this package's `vitest.config.ts`).
     *
     * One `it()` per line, rather than one `it()` asserting eight things, because a mutation must
     * kill a NAMED test: neutralising `&&` and neutralising the `deletedAt` clause are different
     * defects and must not both read as "the AV7-F2 test went red".
     */
    let report = '';

    beforeAll(async () => {
      report = await runProbe(exclusionExperimentSql(CANDIDATE_PREDICATE));
    });

    it('THE PREMISE · the sub-probes ran against the SHIPPED constraint (or every control is vacuous)', () => {
      // The premise, asserted separately: if the constraint were absent, "COMMITTED" would mean
      // "nothing was checked" and the six controls below would be measuring nothing at all. The
      // experiment no longer installs anything of its own, so this is now a statement about the
      // real schema — which is why the refusal assertions name the SHIPPED constraint.
      expect(report).toContain('PAIR_ONE_DAY_APART=REFUSED[23P01]');
      expect(report).toContain(`constraint=${CANDIDATE_CONSTRAINT}`);
    });

    it("THE FIX (A) · the pair ONE DAY APART is refused, by the constraint's OWN message and both ranges", () => {
      // Not an exit status and not a bare rejection: the SQLSTATE, the constraint's own name, its
      // own sentence, and BOTH conflicting dateranges out of the server's own DETAIL.
      expect(report).toContain('PAIR_ONE_DAY_APART=REFUSED[23P01]');
      expect(report).toContain(`constraint=${CANDIDATE_CONSTRAINT}`);
      expect(report).toContain('conflicting key value violates exclusion constraint');
      // Postgres normalises the inclusive `'[]'` bound to `end + 1 day`, which is what it prints.
      expect(report).toContain('[2029-08-02,2029-09-01)');
      expect(report).toContain('[2029-08-01,2029-09-01)');
    });

    it('POSITIVE CONTROL · two runs for genuinely DISJOINT periods still both compute and execute', () => {
      // The control that makes the refusal mean anything: the same two inserts, differing only in
      // whether the windows touch.
      expect(report).toContain('DISJOINT_PAIR=COMMITTED');
    });

    it('POSITIVE CONTROL · two OVERLAPPING COMPUTED runs still commit — computing is not paying', () => {
      // `= 'EXECUTED'` is a deliberate narrowing of §3's `<> 'CANCELLED'`. Two unpaid runs for one
      // period are two answers nobody has acted on; refusing them would kill the ability to compute
      // an alternative window. The breach is money recorded as owed twice, not arithmetic done twice.
      expect(report).toContain('OVERLAPPING_DRAFTS=COMMITTED');
    });

    it("POSITIVE CONTROL · a CANCELLED run does NOT wedge its period (§08's correction path)", () => {
      // The whole purpose of §3's partial predicate, carried into the exclusion: §08's correction
      // path is a NEW run with the old one retired as CANCELLED. A total constraint would make the
      // replacement unrepresentable — the database enforcing "compute once, correctly, forever".
      expect(report).toContain('CANCELLED_OVERLAP=COMMITTED');
    });

    it('⚠ INVERTED · a SOFT-DELETED overlapping PAID run is REFUSED — retiring a run does not un-pay it', () => {
      // ⚠ THIS WAS A POSITIVE CONTROL AND IS NOW A REFUSAL, AND THE FLIP IS THE DESIGN DECISION.
      // While the fix was a candidate, this section reasoned: *"`distribution_no_delete` means
      // soft-deletion is the only retirement other than CANCELLED, so the exclusion must exempt it
      // or that retirement stops working too."* That is true of RETIREMENT and false of MONEY.
      //
      // Migration 26 therefore ships `WHERE ("status" = 'EXECUTED')` with NO `deletedAt` clause.
      // With the clause, ONE ungoverned `UPDATE "distribution" SET "deletedAt" = now()` on a paid
      // run would drop it out of the index and FREE ITS PERIOD TO BE PAID AGAIN — and nothing gates
      // `distribution."deletedAt"` (migration 25 gated `transaction`; the soft-delete family's own
      // declared gap list names `beneficiary` and `setting`, not this). A paid run going INVISIBLE
      // rather than visibly PAID is AV7-F4's failure mode, rebuilt in a new constraint on the day
      // AV7-F4 was closed one table over.
      //
      // Soft-deleting a paid run does not un-pay a beneficiary: the `distribution_line_item` rows
      // are still there and the halalas are still owed. A SCREEN may hide a retired run; a query
      // that decides whether money may move may not.
      // ⚠ AND SINCE MIGRATION 27 IT IS REFUSED **EARLIER STILL**, BY A DIFFERENT GUARD, WHICH IS
      // WHY THE SQLSTATE BELOW IS 42501 AND NOT 23P01. `distribution_row_retirement` is
      // `BEFORE INSERT OR UPDATE`, so a run BORN RETIRED never reaches the exclusion index at all.
      // The two facts are independent and BOTH hold; only one of them is still observable here:
      //   · the predicate omits `deletedAt`  → asserted from `pg_get_constraintdef()` in the
      //     `✅ THE FIX` test above, and again in `guard-verb-coverage`'s CENSUS-4;
      //   · a born-retired run is a reserved matter → what this probe now measures.
      // Recorded rather than quietly re-pointed: a test whose assertion changed SQLSTATE has
      // changed which guard it is about, and that is worth a reader's attention.
      expect(report).toContain('SOFT_DELETED_OVERLAP=REFUSED[42501]');
      expect(report).toMatch(/RECORDING A DISTRIBUTION RUN THAT IS ALREADY RETIRED/);
    });

    it('POSITIVE CONTROL · the same calendar period on ANOTHER endowment still commits', () => {
      // The key is per-waqf. waqf-002 paying its own quarter is not this breach, and a constraint
      // that refused it would be commingling by arithmetic.
      expect(report).toContain('OTHER_ENDOWMENT=COMMITTED');
    });

    it('THE FIX (A), ITS COST · the same constraint refuses a run inside the quarter `dist-001` already paid', () => {
      // This is not a defect in the constraint — it is the constraint being RIGHT, and it is the
      // measured reason AV7-F2 is still open. 24 of 60 tests in four `@qmulate/api` suites perform
      // exactly this insert (through `create` → `submit` → `approve` → `execute`) on a window inside
      // 2026-01-01…2026-03-31, because `waqf-001`'s only income receipt is in it.
      expect(report).toContain('INSIDE_THE_PAID_QUARTER=REFUSED[23P01]');
      // It names the SEEDED run's own range — the historical payment this second run would repeat.
      expect(report).toContain('[2026-01-01,2026-04-01)');
    });

    it('the experiment left NOTHING behind — no extension, no constraint, no run', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ ext: number; excl: number; runs: number }[]>(
        `SELECT (SELECT count(*)::int FROM pg_extension WHERE extname = 'btree_gist') AS ext,
                (SELECT count(*)::int FROM pg_constraint
                  WHERE conrelid = 'distribution'::regclass AND contype = 'x') AS excl,
                (SELECT count(*)::int FROM "distribution"
                  WHERE "id" LIKE 'dist-s76-%' OR "id" LIKE 'f2-%') AS runs`,
      );
      // `distribution_no_delete` refuses a hard DELETE outright, so a committed scratch run here
      // could never be cleaned up and this file would be green exactly once per database. Every
      // statement in §6 therefore ends in a RAISE.
      // ⚠ `ext` AND `excl` ARE NOW 1, NOT 0, AND THAT IS THE FIX BEING PRESENT. This assertion used
      // to read `{ ext: 0, excl: 0, runs: 0 }` because the experiment installed `btree_gist` and its
      // own candidate constraint and had to leave neither behind. Migration 26 ships both, so the
      // only thing this test still guards is the one that matters: NO SCRATCH RUN COMMITTED.
      expect(rows[0]).toEqual({ ext: 1, excl: 1, runs: 0 });
    });

    it('`btree_gist` IS installed, by the migration, and the migrator could install it', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<
        { name: string; installed: string | null; available: string | null }[]
      >(
        `SELECT name, installed_version AS installed, default_version AS available
           FROM pg_available_extensions WHERE name = 'btree_gist'`,
      );
      // An `EXCLUDE` mixing `=` on text with `&&` on a range needs `btree_gist` for the text
      // operator class, and migration 26 §1 installs it — so `installed` is now NON-null where this
      // test used to require it null.
      //
      // ⚠ THE PRIVILEGE QUESTION THIS TEST USED TO DEFER WAS ANSWERED BEFORE THE MIGRATION WAS
      // WRITTEN, AND NOT BY GUESSING. It said *"the parity that matters is CI's postgres:16-alpine,
      // which this laptop cannot assert."* What CAN be asserted here is the thing that actually
      // decides it: `btree_gist` is a TRUSTED extension, and the MIGRATOR role is NOT a superuser
      // yet holds CREATE on the database — granted by `packages/database/src/provision-roles.ts`
      // (`GRANT CREATE, CONNECT, TEMPORARY ON DATABASE … TO qmulate_owner`), which CI runs BEFORE
      // `migrate deploy`. A trusted extension plus a non-superuser with database CREATE is
      // installable; that is why this is not a CI-only gamble. MEASURED on this cluster:
      // `rolsuper = false` for `qmulate_owner`, `trusted = true` for `btree_gist`, and
      // `qmulate_app` reports `has_database_privilege(…, 'CREATE') = false` and cannot.
      // ⚠ The residual is honest and small: CI's image must SHIP the contrib module. The official
      // postgres images do; the CI log is still the proof, and this test is not it.
      expect(rows[0]?.available).not.toBeUndefined();
      expect(rows[0]?.installed).not.toBeNull();
      // Not a superuser — so the install is not privileged by accident.
      const role = await prisma.$queryRawUnsafe<{ super: boolean }[]>(
        `SELECT rolsuper AS super FROM pg_roles WHERE rolname = current_user`,
      );
      expect(role[0]?.super).toBe(false);

      // ⚠ AND IT IS **NOT IN `public`**, WHICH IS A SECURITY FACT AND NOT TIDINESS. MEASURED: a
      // bare `CREATE EXTENSION btree_gist` puts 186 functions into `public` with `proacl = NULL`,
      // which MEANS EXECUTE TO PUBLIC, plus a second owner among them — and
      // `authorization-plane-privilege.integration.test.ts` assertions 1b and 1f both went RED,
      // correctly. Migration 26 §1 therefore installs into a dedicated `extensions` schema, so
      // `public` carries no third-party objects and every posture assertion keeps its original
      // meaning. Pinned from both sides: migration 26 §3 refuses to install if this is violated.
      const where = await prisma.$queryRawUnsafe<{ schema: string; publicFuncs: number }[]>(
        `SELECT n.nspname AS schema,
                (SELECT count(*)::int FROM pg_proc p2
                   JOIN pg_namespace n2 ON n2.oid = p2.pronamespace
                  WHERE n2.nspname = 'public'
                    AND EXISTS (SELECT 1 FROM pg_depend d
                                 WHERE d.objid = p2.oid AND d.deptype = 'e')) AS "publicFuncs"
           FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
          WHERE e.extname = 'btree_gist'`,
      );
      expect(where[0]?.schema).toBe('extensions');
      expect(where[0]?.publicFuncs, 'schema public holds extension-owned functions').toBe(0);
    });
  });
});
