// QMULATE — S4/E3: THE THIRD IMMUTABILITY TIER, AND THE THREE GUARDS MIGRATION 12 ADDED BESIDE IT.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE ONE SENTENCE THIS FILE EXISTS TO FALSIFY
// ═══════════════════════════════════════════════════════════════════════════════════════════
//     "A founder's condition that lands in a plain column has NOT become editable."
//
// That is migration 12's own header, and it is the E3 exit clause ADR-0006 is on the hook for.
// `continuationStipulation` and the مآل clause ARE conditions of the founder — one decides which of
// the waqif's lines continue (and therefore the head count, and therefore every share), the other
// decides where the endowment goes when the family ends. Landed as ordinary nullable columns they
// would be editable by anyone holding `endowment:waqf:write`: ADR-0006's hole, reopened through a new
// column, which is the failure this repository has already had twice (a claimed enforcement with
// nothing implementing it).
//
// ⚠ WHY THIS FILE EXISTS SEPARATELY FROM `seed.integration.test.ts`. That file proves the deed terms
// landed as DATA — the right values, no `column_default`, the capture flag distinct from the kind. It
// makes NO refusal claim. Nothing anywhere asserted that a second write is refused, which is the
// whole of tier 3. Measured before this file existed: `DEED_TERM_WRITE_ONCE_COLUMNS` and
// `REVERSION_CAPTURE_COLUMN` were exported by `src/reserved-matter.ts` and named in NO test at all.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// EVERY PROBE HERE IS ROLLED BACK, AND THAT IS NOT MERELY TIDINESS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The tables under test are append-only or write-once BY CONSTRUCTION, so a row this suite leaves
// behind can never be removed — not by a teardown, not by `db:seed` (which upserts and never
// deletes), not by an owner. That is not hypothetical: `reclassification_event` rows written against
// a SEEDED endowment by another suite in this same sprint are still in the local database and
// permanently break `seed.integration.test.ts`'s "the history is empty" assertion (reported).
//
// So every statement below runs inside a `DO` block that ends in `RAISE` (`guardProbeSql`,
// `rollbackProbeSql`, `probeWithSetupSql`) or inside a Prisma interactive transaction that throws.
// One block = one statement = one transaction: even a guard that is MISSING cannot leave a row.
//
// ── AND THE PROBES RUN AS THE OWNER (ADR-0008 round 6) ───────────────────────────────────────
// `runProbe()` uses the privileged connection deliberately, so that what refuses is always the
// GUARD and never the ACL. Each claim below is therefore the stronger one: *even the table owner
// cannot do this*. The `session_replication_role = 'replica'` probes route to the platform
// superuser automatically, because that parameter is superuser-only — and those are the ones that
// prove `ENABLE ALWAYS`, the property one plain `SET` would otherwise defeat.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ✅ AV4-02 IS CLOSED (S12-1, 2026-09-08, migration 50) — AND THE QUALIFICATION THIS BLOCK CARRIED COMES OFF
// ═══════════════════════════════════════════════════════════════════════════════════════════
// This block used to read, verbatim: *"`qmulate_app` … CAN MINT ITS OWN `APPROVED` `RESERVED_MATTER`
// `approval_request` AND SPEND IT IN THE SAME TRANSACTION"* — MEASURED in S4 round 4 against
// `asset:asset-001:titleDeedNumber` (`audit_event` 153 → 153) — and concluded that every "REFUSED
// 42501 as `qmulate_app`" measurement in this file proved only that the gate is CLOSED WITHOUT A KEY,
// never that the key had to come from an approval AUTHORITY, because the caller could cut the key.
//
// It no longer can. Migration 50 makes the DECISION columns of `approval_request` (`checkerId`
// NULL→value, `status` → APPROVED | REJECTED, the decision instants) writable only when
// `current_user` is the provisioner, the owner or a superuser — the one fact about a connection the
// runtime credential cannot rewrite (`SET ROLE` measured 42501, ADR-0008 round 6) — and refuses an
// INSERT that lands already decided. `approval-decision-plane.integration.test.ts` runs the exact
// AV4-02 script as `qmulate_app` and asserts each statement refused; runs the MUTATION (the role
// clause neutralised) and asserts the whole script ADMITTED; restores; re-asserts refused.
//
// SO, PRECISELY, WHAT THE RESERVED-MATTER ASSERTIONS BELOW NOW PROVE: the gate is closed without a
// key AND a holder of the runtime credential alone cannot manufacture one. The residual that remains
// is a different one and is recorded in ADR-0008 round 7: whoever holds `ACCESS_MATRIX_DATABASE_URL`
// — the approval plane, and the web process holds it — can decide. That credential already held
// approval power transitively (a forged NAZIR seat, then the ordinary approve path), so nothing here
// is weaker than the grant plane; it is exactly as strong.
//
// The one class of guard this never qualified is the guard that consults NO approval at all —
// `waqfId` (migration 14 §1b), the Shart seal, and the primary-key seal in
// `primary-key-immutability.integration.test.ts`. There was never a key to forge for those.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  FICTIONAL_MARKER_AR,
  PROBE_BLOCKED,
  PROBE_NOT_BLOCKED,
  PROBE_SUCCEEDED,
  SQLSTATE_BY_CONDITION,
  assertGuardsInstalled,
  basePrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  guardProbeSql,
  hasDatabase,
  privilegedPrisma,
  rollbackProbeSql,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase(
  'the S4/E3 tier-3 write-once guard, the ultimate-taker table, reclassification history and BR-306',
);

/** The ORDERED endowment: both deed terms recorded, so it is the `value -> anything` subject. */
const RECORDED_WAQF = 'waqf-001';
/** The LARGE endowment: `continuationStipulation` is NULL, so it is the `NULL -> value` subject. */
const UNRECORDED_WAQF = 'waqf-003';
/**
 * ⚠ THE INTAKE-STATE ENDOWMENT, AND THE ONLY ROW IN THE FIXTURE WHOSE مآل CLAUSE IS UNREAD.
 *
 * Added to `data/fixtures/sample-waqf.json` by the S4/E3 close-out on the product owner's answer of
 * 2026-08-16 (decisions log **D-C**, *"yes"*): `reversionClauseCaptured = false`, `reversionKind`
 * NULL. Every other endowment carries `captured = true, kind = NULL`, which is the deed POSITIVELY
 * RECORDING that it names no ultimate taker — a different fact, and the one V-E3-01 was about.
 *
 * Without this row the whole "NULL -> value ONCE" half of tier 3 was UNTESTABLE for the مآل group:
 * the only subjects available were already sealed, so a test that tried to make a first write got a
 * refusal and read it as the guard misbehaving. That is exactly what happened — see the inversion
 * note on `seals the whole مآل clause` below.
 */
const UNREAD_WAQF = 'waqf-005';
/** waqf-003's charitable jiha — no lineage edge, no ṭabaqa. The fixture's only recorded jiha. */
const TAKER_BENEFICIARY = 'ben-006';
/** waqf-003's second parcel — AC-E3-08's subject. */
const ASSET_ID = 'asset-005';

const CHECKER_ID = 'user-approver-001';
const MAKER_ID = 'user-accountant-001';
const FAKE_PAYLOAD_HASH = 'b'.repeat(64);

/** Test-created approvals, 94xx so they can never collide with a fixture or a sibling file's 90xx. */
const APPROVAL = {
  /** Genuine, APPROVED, maker ≠ checker, on waqf-003, naming `asset:asset-005:status`. */
  assetStatus: 'appr-test-9401',
  /** Genuine in every way except that it names ANOTHER asset's status. */
  otherAssetStatus: 'appr-test-9402',
  /** Genuine, and about the title deed rather than the status. */
  assetTitleDeed: 'appr-test-9403',
  /** Genuine, on waqf-001, naming the continuation stipulation — a key that must NOT work. */
  deedTerm: 'appr-test-9404',
  /**
   * ── THE BIRTH-ARM KEYS (AV3-02 / AV3-03, round 3) ─────────────────────────────────────────
   * A guard that refuses everything is an outage, not a control, so the birth arm needs its own
   * PERMIT subjects. Both name {@link BORN_ASSET} — the id the probes actually INSERT — because
   * `qmulate_reserved_matter_defect()` binds an approval to its ARTIFACT, and an approval that
   * merely mentions "some asset" would prove nothing about the subject binding.
   */
  birthStatus: 'appr-test-9405',
  birthDeletedAt: 'appr-test-9406',
  /**
   * ── THE ENDOWMENT-RETIREMENT KEYS (memo Q8, migration 17 tier 2b) ──────────────────────────
   * `waqfDeletedAt` is the genuine key for BOTH directions on {@link UNRECORDED_WAQF} — one
   * approval covers set and clear, because the artifact is the same act. `waqfCertificate` is
   * genuine in every way EXCEPT that it names another act on the SAME endowment: the finest-grained
   * negative, and the one a coarser "is there any approval?" gate would wave through.
   */
  waqfDeletedAt: 'appr-test-9407',
  waqfCertificate: 'appr-test-9408',
} as const;

/**
 * The id every BIRTH probe uses. Fixture id grammar (`asset-\d+`), 9xxx series so it can never
 * collide with a seeded parcel, and never committed — see {@link insertAssetSql}.
 */
const BORN_ASSET = 'asset-9501';

/**
 * A probe whose `setup` statements MUST succeed and whose `forbidden` statement MUST be refused with
 * 42501. The re-raise aborts the whole block, so the successful setup is rolled back with it.
 *
 * This is the only shape that can express "NULL -> value ONCE, then sealed": the permitted write and
 * the refused one have to happen in that order, against the same row, in one transaction. A sibling
 * copy lives in `shart-immutability.integration.test.ts`; it is deliberately not shared, because
 * moving it into `setup.ts` would edit a file three other suites depend on for a two-line gain.
 */
function probeWithSetupSql(setup: readonly string[], forbidden: string): string {
  return [
    'DO $qm_probe$',
    'BEGIN',
    ...setup.map((statement) => `  ${statement};`),
    '  BEGIN',
    `    ${forbidden};`,
    `    RAISE EXCEPTION '${PROBE_NOT_BLOCKED}' USING ERRCODE = 'P0001';`,
    '  EXCEPTION',
    '    WHEN insufficient_privilege THEN',
    `      RAISE EXCEPTION '${PROBE_BLOCKED}[${SQLSTATE_BY_CONDITION.insufficient_privilege}]: %', SQLERRM USING ERRCODE = 'P0001';`,
    '  END;',
    'END',
    '$qm_probe$;',
  ].join('\n');
}

/**
 * The ONE permitted write of a مآل clause: the reading and the founder's answer, in one statement.
 *
 * ⚠ ONE STATEMENT IS NOT A STYLE CHOICE, AND SINCE MIGRATION 14 IT IS ENFORCED FROM BOTH SIDES.
 * `waqf_reversion_kind_requires_capture` refuses the kind without the flag (23514); tier 3 seals the
 * group the instant the flag is set, so a capture in one statement and a kind in the next is refused
 * 42501; and tier 3a now refuses the FLAG ITSELF unless the reading's dual date travels with it, so
 * the incomplete capture that used to commit and foreclose the clause cannot happen either (AV-1).
 * All three are measured in `records the reading and the answer in ONE statement, or not at all`.
 */
function recordReversionSql(waqfId: string): string {
  return (
    `UPDATE "waqf" SET "reversionClauseCaptured" = true, ` +
    `"reversionKind" = 'CHARITABLE_ULTIMATE_TAKER', ` +
    `"reversionRecordedAt" = '2026-02-01'::timestamp, "reversionRecordedAtHijri" = '1447-08-13' ` +
    `WHERE "id" = '${waqfId}'`
  );
}

/**
 * A CHARITABLE JIHA beneficiary — no `lineageLink`, no `parentId`, no `tabaqa`, so it is not a
 * descendant and `qmulate_reversion_taker_insert_integrity()` §4 does not refuse it.
 *
 * ⚠ IT HAS TO BE CONSTRUCTED RATHER THAN PICKED. waqf-005 ships with no beneficiaries at all (it is
 * an intake-state record), and the composite FK `waqf_reversion_taker_waqfId_beneficiaryId_fkey`
 * makes a taker from ANOTHER endowment structurally impossible — MEASURED: naming waqf-003's ben-006
 * on waqf-005 raises 23503. Every use of this is inside a rolled-back block.
 */
function insertJihaBeneficiarySql(id: string, waqfId: string): string {
  return `INSERT INTO "beneficiary"
      ("id","waqfId","branch","relationshipAr","kind","residency","line","active",
       "verificationStatus","isUbo","confidentiality","createdAt","updatedAt")
    VALUES ('${id}', '${waqfId}', 'Charitable', 'جهة خيرية ${FICTIONAL_MARKER_AR}',
            'CHARITABLE_JIHA'::"BeneficiaryKind", 'DOMESTIC'::"BeneficiaryResidency",
            'NA'::"BeneficiaryLine", true, 'VERIFIED'::"VerificationStatus", false,
            'SENSITIVE_PII'::"Confidentiality", now(), now())`;
}

/**
 * A NEW corpus parcel — the subject of the BIRTH-arm probes (AV3-02 / AV3-03).
 *
 * ⚠ EVERY USE IS INSIDE A ROLLED-BACK BLOCK, AND THAT IS NOT TIDINESS. `asset_no_delete` refuses
 * the hard DELETE of a corpus parcel outright (migration 6 — the non-diminution invariant), so an
 * `asset` row this suite COMMITTED could never be taken away again: not by a teardown, not by
 * `db:seed` (which upserts and never deletes), not by the owner. The only removable asset row is
 * the one that never existed.
 *
 * `waqf-003` is the endowment every `appr-test-94xx` approval in this file names, so a birth probe
 * and its approval agree on the endowment without a second fixture.
 */
function insertAssetSql(options: {
  id: string;
  status: string;
  waqfId?: string;
  deletedAt?: string;
}): string {
  const { id, status, waqfId = UNRECORDED_WAQF, deletedAt } = options;
  return `INSERT INTO "asset"
      ("id","waqfId","type","titleDeedNumber","addressAr","acquiredDate","acquiredDateHijri",
       "valuationSar","status","createdAt","updatedAt"${deletedAt === undefined ? '' : ',"deletedAt"'})
    VALUES ('${id}', '${waqfId}', 'land_parcel', 'TD-9-${id}',
            'قطعة أرض ${FICTIONAL_MARKER_AR}', '2020-01-01'::timestamp, '1441-05-06', 1000000,
            '${status}'::"AssetStatus", now(), now()${deletedAt === undefined ? '' : `,${deletedAt}`})`;
}

/** A LIVING descendant — the shape §4 of the insert-integrity guard refuses on a charitable clause. */
function insertDescendantSql(id: string, waqfId: string): string {
  return `INSERT INTO "beneficiary"
      ("id","waqfId","branch","relationshipAr","kind","residency","line","lineageLink","tabaqa",
       "active","verificationStatus","isUbo","confidentiality","createdAt","updatedAt")
    VALUES ('${id}', '${waqfId}', 'الفرع الأول', 'ابن ${FICTIONAL_MARKER_AR}',
            'FAMILY'::"BeneficiaryKind", 'DOMESTIC'::"BeneficiaryResidency",
            'ZUHUR'::"BeneficiaryLine", 'SON'::"LineageLink", 1, true,
            'VERIFIED'::"VerificationStatus", false, 'SENSITIVE_PII'::"Confidentiality",
            now(), now())`;
}

/**
 * ⚠⚠ THE SAME PROBE, ON THE **RESTRICTED** CONNECTION (`qmulate_app`) — AND IT IS A DIFFERENT CLAIM.
 *
 * ── WHY THIS EXISTS BESIDE `runProbe()` RATHER THAN REPLACING IT ────────────────────────────────
 * `setup.ts` deliberately binds `runProbe()` to the OWNER connection, and its header explains why:
 * since ADR-0008 round 6 the app role holds no DELETE, no TRUNCATE and no `waqf_access_grant` write,
 * so those probes on the app connection would be refused by the **ACL** — `42501 permission denied
 * for table asset` — before the trigger they are testing is ever reached, leaving the suite green
 * while measuring nothing. Every probe above therefore makes the OWNER-side claim: *even the table
 * owner cannot do this.*
 *
 * ── AND WHY THE OWNER-SIDE CLAIM IS NOT ENOUGH FOR **THESE** ROWS ───────────────────────────────
 * The S4/E3 findings were all measured AS `qmulate_app`: V-E3-01 (a recorded "this deed names no
 * مآل" rewritten to a charitable reversion), V-E3-02 (the Arabic spelling of a disposal committing
 * ungated), V-E3-M2 (a taker recorded against a deed that records none), V-E3-M6 (the three deed
 * facts freely writable). Those are statements about THE ROLE THE RUNTIME ACTUALLY CONNECTS AS, and
 * an owner-side refusal does not re-prove them: the two roles have different ACLs and, before this
 * migration, identical (absent) guards.
 *
 * MEASURED, and this is the fact that makes the section meaningful rather than a copy: `qmulate_app`
 * **HOLDS** `UPDATE` on `waqf` and `asset` and `INSERT` on `beneficiary` and `waqf_reversion_taker`.
 * An ordinary write through each of them SUCCEEDS on this connection (the controls below prove it),
 * so nothing here can be refused by the ACL by accident.
 *
 * ⚠ AND THE ACL IS RULED OUT EXPLICITLY, NOT ASSUMED. A `42501` from `permission denied for table`
 * and a `42501` from a guard are indistinguishable to `guardProbeSql`'s handler, so every caller
 * below also asserts the guard's own words AND that the text does NOT contain "permission denied
 * for". Without that pair the whole section could pass on a role that simply cannot write.
 */
async function runRestrictedProbe(sql: string): Promise<string> {
  const prisma = await basePrisma();
  try {
    await prisma.$executeRawUnsafe(sql);
  } catch (error: unknown) {
    return errorText(error);
  }
  throw new Error(
    `A restricted-connection probe completed without raising. Every probe ends in RAISE, so this ` +
      `means the SQL never ran as written:\n${sql}`,
  );
}

/** {@link guardOutcome}'s answer when the statement was NOT refused. */
const GUARD_OUTCOME_COMMITTED = 'QMULATE_GUARD_OUTCOME_COMMITTED';

/**
 * Runs ONE statement inside a rolled-back transaction — optionally after MUTATING the guard — and
 * reports what the database actually did.
 *
 * ── WHY THIS EXISTS BESIDE `runProbe()` (round 3, AV3-02) ───────────────────────────────────────
 * A mutation proof has to run the DDL and the probe on the SAME connection and in the SAME
 * transaction, or the probe never sees the mutated catalogue. `runProbe()` cannot: it takes a
 * connection from the pool per call, and `guardProbeSql()`'s `DO` block always ends in a `RAISE`
 * that would abort the enclosing transaction before the mutation could be rolled back deliberately.
 *
 * So this helper opens ONE interactive transaction, applies `mutation` (DDL — transactional in
 * Postgres, so it rolls back with everything else), runs `statement`, captures the outcome, and
 * throws to roll the whole thing back. It returns either {@link GUARD_OUTCOME_COMMITTED} or the
 * flattened server error, which lets a single test say the thing that matters:
 * *with the shipped guard this is REFUSED, and with the guard mutated the very same statement
 * COMMITS* — i.e. the assertion above is load-bearing rather than decorative.
 *
 * ⚠ IT RUNS ON THE OWNER CONNECTION, because DDL needs ownership. Nothing here asserts a PRIVILEGE,
 * so the connection is not under test; the `qmulate_app` claims live in section 6. And nothing here
 * can commit: the transaction always ends in a throw.
 */
async function guardOutcome(setup: readonly string[], statement: string): Promise<string> {
  const prisma = await privilegedPrisma();
  const ROLLBACK = '__qmulate_guard_outcome_rollback__';
  let outcome = '';

  await prisma
    .$transaction(async (tx) => {
      // `setup` carries the DDL mutation and/or the session GUC. Each is a SEPARATE statement on
      // purpose: `$executeRawUnsafe` speaks the extended protocol, which refuses a multi-statement
      // string, and a `SET LOCAL` bundled onto the front of the probe would silently not run.
      for (const ddl of setup) await tx.$executeRawUnsafe(ddl);
      try {
        await tx.$executeRawUnsafe(statement);
        outcome = GUARD_OUTCOME_COMMITTED;
      } catch (error: unknown) {
        outcome = errorText(error);
      }
      throw new Error(ROLLBACK);
    })
    .catch((error: unknown) => {
      if (!String(error).includes(ROLLBACK)) throw error;
    });

  if (outcome === '') {
    throw new Error(
      'DEFECTIVE PROBE: guardOutcome() never reached its statement, so neither a refusal nor a ' +
        'commit was observed. An unobserved probe reported as a refusal is R6-C1 in one line.',
    );
  }
  return outcome;
}

/**
 * The LIVE body of `qmulate_asset_identity_guard()` with ONE token replaced — a real mutation of
 * the shipped source, not a stand-in function.
 *
 * ⚠ IT THROWS WHEN THE TARGET IS NOT PRESENT EXACTLY ONCE, and that is the whole point. A mutation
 * whose find-string no longer matches would silently mutate NOTHING, the "with the guard broken
 * this commits" assertion would fail for the wrong reason, and — worse — somebody would "fix" it by
 * loosening the expectation. R6-C1's lesson: a probe that cannot reach its configuration reports
 * its silence as success.
 */
async function assetGuardBodyWithout(target: string): Promise<string> {
  const prisma = await privilegedPrisma();
  const [row] = await prisma.$queryRawUnsafe<{ def: string }[]>(
    `SELECT pg_get_functiondef(to_regprocedure('qmulate_asset_identity_guard()')) AS def`,
  );
  const def = row?.def ?? '';
  const occurrences = def.split(target).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `DEFECTIVE MUTATION: ${JSON.stringify(target)} appears ${String(occurrences)} times in the ` +
        `live qmulate_asset_identity_guard() body, not exactly once. The mutation would change ` +
        `nothing (or too much), and a mutation that changes nothing proves nothing.`,
    );
  }
  return def.replace(target, 'IF false THEN');
}

/**
 * The same idiom as {@link assetGuardBodyWithout}, for any guard function — needed by migration 17's
 * two arms, which live in `qmulate_shart_guard()` and `qmulate_trusteeship_deed_immutable()`.
 *
 * ⚠ IT THROWS UNLESS THE TARGET IS PRESENT EXACTLY ONCE, for that helper's reason: a mutation whose
 * find-string no longer matches mutates NOTHING, the "with the guard broken this commits" assertion
 * then fails for the wrong reason, and the temptation is to loosen the expectation instead of fixing
 * the mutation. R6-C1's lesson — a probe that cannot reach its configuration reports silence as
 * success.
 */
async function guardBodyWithout(signature: string, target: string): Promise<string> {
  const prisma = await privilegedPrisma();
  const [row] = await prisma.$queryRawUnsafe<{ def: string }[]>(
    `SELECT pg_get_functiondef(to_regprocedure('${signature}')) AS def`,
  );
  const def = row?.def ?? '';
  const occurrences = def.split(target).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `DEFECTIVE MUTATION: ${JSON.stringify(target)} appears ${String(occurrences)} times in the ` +
        `live ${signature} body, not exactly once. The mutation would change nothing (or too much), ` +
        `and a mutation that changes nothing proves nothing.`,
    );
  }
  return def.replace(target, 'IF false THEN');
}

/** The ACL must never be what answered. See {@link runRestrictedProbe}. */
function expectRefusedByGuardNotAcl(error: string): void {
  expect(
    error,
    'the refusal came from the table GRANT, not from the guard — this probe measures nothing',
  ).not.toMatch(/permission denied for (table|relation|sequence)/i);
}

function insertApprovalSql(options: {
  id: string;
  waqfId: string;
  subjectId: string;
  type?: string;
  status?: string;
}): string {
  const { id, waqfId, subjectId, type = 'RESERVED_MATTER', status = 'APPROVED' } = options;
  const decided = status === 'APPROVED' || status === 'EXECUTED';
  return `INSERT INTO "approval_request"
      ("id","waqfId","type","status","makerId","checkerId","subjectId","payloadHash","payload",
       "decidedAt","createdAt","updatedAt","deletedAt")
    VALUES ('${id}', '${waqfId}', '${type}'::"ApprovalType", '${status}'::"ApprovalStatus",
            '${MAKER_ID}', '${CHECKER_ID}', '${subjectId}',
            ${decided ? `'${FAKE_PAYLOAD_HASH}'` : 'NULL'},
            '{"fixture":"S4/E3 test row"}'::jsonb,
            ${decided ? 'now()' : 'NULL'}, now(), now(), NULL)`;
}

describe.skipIf(!hasDatabase)(
  'S4/E3 · a founder’s condition in a plain column is still not editable',
  () => {
    let guc: string;

    beforeAll(async () => {
      await assertGuardsInstalled();
      ensureSeeded();
      ({ RESERVED_MATTER_APPROVAL_GUC: guc } = await databaseModule());

      const prisma = await privilegedPrisma();
      await prisma.$executeRawUnsafe(
        `DELETE FROM "approval_request" WHERE "id" LIKE 'appr-test-94%'`,
      );
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: APPROVAL.assetStatus,
          waqfId: UNRECORDED_WAQF,
          subjectId: `asset:${ASSET_ID}:status`,
        }),
      );
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: APPROVAL.otherAssetStatus,
          waqfId: UNRECORDED_WAQF,
          subjectId: 'asset:asset-004:status',
        }),
      );
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: APPROVAL.assetTitleDeed,
          waqfId: UNRECORDED_WAQF,
          subjectId: `asset:${ASSET_ID}:titleDeedNumber`,
        }),
      );
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: APPROVAL.deedTerm,
          waqfId: RECORDED_WAQF,
          subjectId: `waqf:${RECORDED_WAQF}:continuationStipulation`,
        }),
      );
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: APPROVAL.birthStatus,
          waqfId: UNRECORDED_WAQF,
          subjectId: `asset:${BORN_ASSET}:status`,
        }),
      );
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: APPROVAL.birthDeletedAt,
          waqfId: UNRECORDED_WAQF,
          subjectId: `asset:${BORN_ASSET}:deletedAt`,
        }),
      );
      // migration 17 tier 2b (memo Q8) — the endowment's own retirement, and its near-miss.
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: APPROVAL.waqfDeletedAt,
          waqfId: UNRECORDED_WAQF,
          subjectId: `waqf:${UNRECORDED_WAQF}:deletedAt`,
        }),
      );
      await prisma.$executeRawUnsafe(
        insertApprovalSql({
          id: APPROVAL.waqfCertificate,
          waqfId: UNRECORDED_WAQF,
          subjectId: `waqf:${UNRECORDED_WAQF}:certificateNumber`,
        }),
      );
    });

    afterAll(async () => {
      const prisma = await privilegedPrisma();
      await prisma.$executeRawUnsafe(
        `DELETE FROM "approval_request" WHERE "id" LIKE 'appr-test-94%'`,
      );
      await closeDatabase();
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 1. TIER 3 — `value -> ANYTHING` IS REFUSED, INCLUDING `value -> NULL`
    //
    // MUTATION THAT RE-BREAKS THIS: delete the `FOREACH write_once_col` loop from
    // `qmulate_shart_guard()`. Measured: with the loop removed, every assertion in this section
    // fails with QMULATE_PROBE_NOT_BLOCKED, and nothing else in the suite notices.
    // ═══════════════════════════════════════════════════════════════════════════════════════

    describe('tier 3 · the recorded deed term is sealed', () => {
      it('refuses a raw UPDATE that CHANGES the continuation stipulation', async () => {
        const error = await runProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "continuationStipulation" = 'ZUHUR_AND_BUTUN' WHERE "id" = '${RECORDED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/continuationStipulation/);
        expect(error).toMatch(/WRITE-ONCE/);
        // The refusal must point at the ONE lawful route, or whoever hits it goes looking for a hatch.
        expect(error).toMatch(/SUPERSEDING INSTRUMENT/i);
        // And it must name both values, so the reader can see which write was refused.
        expect(error).toMatch(/ZUHUR_ONLY/);
        expect(error).toMatch(/ZUHUR_AND_BUTUN/);
      });

      it('refuses CLEARING it back to NULL — un-recording is the subtler substitution', async () => {
        // `value -> NULL` is the case a naive "only set it if it is null" guard permits, and it is
        // WORSE than an overwrite: it restores the state in which the term may be written again, so a
        // two-step edit would leave the row looking like a first recording.
        const error = await runProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "continuationStipulation" = NULL WHERE "id" = '${RECORDED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/continuationStipulation/);
        expect(error).toMatch(/NULL/);
      });

      it('permits NULL -> value exactly ONCE, and refuses the second write in the same breath', async () => {
        const error = await runProbe(
          probeWithSetupSql(
            [
              `UPDATE "waqf" SET "continuationStipulation" = 'ZUHUR_ONLY' WHERE "id" = '${UNRECORDED_WAQF}'`,
            ],
            `UPDATE "waqf" SET "continuationStipulation" = 'ZUHUR_AND_BUTUN' WHERE "id" = '${UNRECORDED_WAQF}'`,
          ),
        );
        // Reaching PROBE_BLOCKED at all proves the FIRST update succeeded: a raise there would have
        // aborted the block before the forbidden statement ran, and the error would say so.
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/WRITE-ONCE/);
        expect(error).not.toContain(PROBE_NOT_BLOCKED);
      });

      it('leaves the term untouched afterwards — every probe above rolled back', async () => {
        const prisma = await privilegedPrisma();
        const rows = await prisma.waqf.findMany({
          where: { id: { in: [RECORDED_WAQF, UNRECORDED_WAQF, UNREAD_WAQF] } },
          select: {
            id: true,
            continuationStipulation: true,
            reversionClauseCaptured: true,
            reversionKind: true,
          },
        });
        const byId = new Map(rows.map((row) => [row.id, row] as const));
        expect(byId.get(RECORDED_WAQF)?.continuationStipulation).toBe('ZUHUR_ONLY');
        expect(byId.get(UNRECORDED_WAQF)?.continuationStipulation).toBeNull();

        // ⚠ THE INTAKE-STATE ROW IS THE ONE A LEAK WOULD BE UNRECOVERABLE ON. Every probe above
        // records a مآل clause on it, and a clause that COMMITTED could never be taken back —
        // `db:seed` upserts and the guard refuses the correction. So its two-nulls-are-different
        // state is re-read here, not assumed.
        expect(byId.get(UNREAD_WAQF)?.reversionClauseCaptured).toBe(false);
        expect(byId.get(UNREAD_WAQF)?.reversionKind).toBeNull();
      });

      // ═════════════════════════════════════════════════════════════════════════════════════
      // ⚠ INVERTED, NOT DELETED (S4/E3 close-out, Task 5 — INCIDENT-1's lesson).
      //
      // This test used to be ONE case that made a FIRST write of `reversionKind` on waqf-003 and
      // expected it to succeed, then probed the second write. It was RED at `62f8fa3`, and it was
      // the CORRECT red: waqf-003's clause is already CAPTURED, so under the V-E3-01 fix its very
      // first write is refused (`42501 … is SEALED (NULL -> CHARITABLE_ULTIMATE_TAKER refused)`),
      // the setup statement aborted the block, and the probe never reached its subject. The test
      // encoded the PRE-FIX semantics — "NULL means unwritten" — which is the defect itself.
      //
      // A test that pinned a now-fixed defect gets INVERTED, never deleted. So the one case becomes
      // TWO, split on the fact that decides the answer, and each is now measured against a subject
      // that can actually reach it:
      //
      //   · CAPTURED  (waqf-003) — the clause was READ and records no taker. EVERY write is refused,
      //                            including `NULL -> value`, which is the direction V-E3-01 let
      //                            through.
      //   · UNREAD    (waqf-005) — nobody has looked. The FIRST recording is PERMITTED, exactly once,
      //                            and the second is refused.
      //
      // Neither half exists without the other: the first alone reads as "the مآل clause is welded
      // shut and can never be recorded", which would be a defect of its own.
      // ═════════════════════════════════════════════════════════════════════════════════════

      it('seals the whole مآل clause on a deed already READ — every column, NULL included', async () => {
        // MEASURED, all three, as the table OWNER on a pristine seed: each is refused 42501 on its
        // own, so no coherence CHECK gets there first and the guard is what answers.
        const columns: readonly { column: string; set: string }[] = [
          {
            column: 'reversionKind',
            set: `"reversionKind" = 'CHARITABLE_ULTIMATE_TAKER'`,
          },
          { column: 'reversionRecordedAt', set: `"reversionRecordedAt" = now()` },
          { column: 'reversionRecordedAtHijri', set: `"reversionRecordedAtHijri" = '1447-01-01'` },
        ];

        for (const { column, set } of columns) {
          const error = await runProbe(
            guardProbeSql(
              `UPDATE "waqf" SET ${set} WHERE "id" = '${UNRECORDED_WAQF}'`,
              'insufficient_privilege',
            ),
          );
          expect(error, `${column} is writable on a deed whose clause was READ`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
          expect(error).toMatch(new RegExp(column));
          // The refusal must say WHY NULL is not "unwritten" here, or the next reader re-introduces
          // V-E3-01 by "fixing" a guard that looks over-strict.
          expect(error).toMatch(/SEALED/);
          expect(error).toMatch(/reversionClauseCaptured/);
          expect(error).toMatch(/SUPERSEDING INSTRUMENT/i);
        }

        // And the whole coherent group written at once is refused too — a caller cannot get past the
        // seal by making the row internally consistent.
        const group = await runProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "reversionKind" = 'CHARITABLE_ULTIMATE_TAKER', ` +
              `"reversionRecordedAt" = now(), "reversionRecordedAtHijri" = '1447-01-01' ` +
              `WHERE "id" = '${UNRECORDED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(group).toContain(`${PROBE_BLOCKED}[42501]`);
      });

      it('permits the FIRST recording on an UNREAD deed, and refuses the second', async () => {
        // waqf-005 is the ONE subject in the fixture that can reach this branch (owner decision
        // D-C). Reaching PROBE_BLOCKED at all proves the first write COMMITTED inside the block: a
        // raise in the setup would have aborted before the forbidden statement ran.
        const secondWrites: readonly { column: string; set: string }[] = [
          {
            column: 'reversionKind',
            set: `"reversionKind" = NULL, "reversionRecordedAt" = NULL, "reversionRecordedAtHijri" = NULL`,
          },
          { column: 'reversionRecordedAt', set: `"reversionRecordedAt" = '2027-06-01'::timestamp` },
          { column: 'reversionRecordedAtHijri', set: `"reversionRecordedAtHijri" = '1448-01-01'` },
        ];

        for (const { column, set } of secondWrites) {
          const error = await runProbe(
            probeWithSetupSql(
              [recordReversionSql(UNREAD_WAQF)],
              `UPDATE "waqf" SET ${set} WHERE "id" = '${UNREAD_WAQF}'`,
            ),
          );
          expect(error, `${column} is not sealed after its first write`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
          expect(error).toMatch(new RegExp(column));
          expect(error).not.toContain(PROBE_NOT_BLOCKED);
        }
      });

      it('records the reading and the answer in ONE statement, or not at all', async () => {
        // ⚠ THE THIRD CASE WAS A `TODO(surface)` PINNING A LIVE DEFECT. IT IS NOW THE FIX'S TEST —
        // INVERTED, NOT DELETED (INCIDENT-1's lesson, and the same treatment V-E3-01's own test got).
        //
        // What it used to record, verbatim: "Capturing the READING on its own is PERMITTED and
        // IRREVERSIBLE … An intake flow that saves 'I have read this deed' before it saves what the
        // deed says therefore records, permanently and with no remedy short of a superseding
        // instrument, that the endowment names no ultimate taker." That is AV-1 / V2 (HIGH), and it
        // was fail-OPEN on Binding rule 1: the guard MANUFACTURED a founder's condition out of an
        // incomplete save. Re-measured as `qmulate_app` on the pristine intake endowment waqf-005:
        //
        //   BEFORE  COMMITS  UPDATE "waqf" SET "reversionClauseCaptured" = true   (alone)
        //                    -> {"reversionClauseCaptured": true, "reversionKind": null}
        //   AFTER   REFUSED  42501 … 'must supply "reversionRecordedAt" AND
        //                    "reversionRecordedAtHijri" IN THE SAME STATEMENT — got NULL / NULL'
        //
        // ⚠ AND THE SEAL IS UNCHANGED. Closing the fail-OPEN direction must not open the fail-CLOSED
        // one, so `keeps every later change refused` below re-measures it against a deed captured
        // legitimately moments earlier.
        const noCapture = await runProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "reversionKind" = 'CHARITABLE_ULTIMATE_TAKER', ` +
              `"reversionRecordedAt" = now(), "reversionRecordedAtHijri" = '1447-01-01' ` +
              `WHERE "id" = '${UNREAD_WAQF}'`,
            'check_violation',
          ),
        );
        // A recorded مآل with no recorded reading behind it: still a CHECK, because the flag does
        // not MOVE here and tier 3a keys on the movement.
        expect(noCapture).toContain(`${PROBE_BLOCKED}[23514]`);
        expect(noCapture).toMatch(/waqf_reversion_kind_requires_capture/);

        // Half a dual date. This USED to be answered by CHECK `waqf_reversion_recorded_dual_dated`
        // (23514); tier 3a now answers first, with a sentence, because the flag IS moving. The rule
        // is the same rule — schema convention 2 — and the CHECK is still installed underneath as
        // the INSERT-side backstop (no trigger on `waqf` sees an INSERT).
        const halfDate = await runProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "reversionClauseCaptured" = true, ` +
              `"reversionKind" = 'CHARITABLE_ULTIMATE_TAKER', "reversionRecordedAt" = now() ` +
              `WHERE "id" = '${UNREAD_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(halfDate).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(halfDate).toMatch(/IN THE SAME STATEMENT/);
        expect(halfDate).toMatch(/DUAL/);

        // AV-1 ITSELF: the flag alone. Refused, and the refusal must say what a complete capture
        // looks like — a Nazir who is told only "no" retries with the same half-write.
        const captureAlone = await runProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "reversionClauseCaptured" = true WHERE "id" = '${UNREAD_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(captureAlone, 'the مآل half-write still commits — AV-1 is open').toContain(
          `${PROBE_BLOCKED}[42501]`,
        );
        expect(captureAlone).toMatch(/reversionRecordedAt/);
        expect(captureAlone).toMatch(/reversionRecordedAtHijri/);
        expect(captureAlone).toMatch(/IRREVERSIBLE/);
        // …and it must name the state a half-write would have manufactured, or the next reader
        // "fixes" this guard by loosening the seal and re-opens V-E3-01.
        expect(captureAlone).toMatch(/names NO\s+ultimate taker|no ultimate taker/i);

        // The two COMPLETE shapes both commit. Without these the test above reads as "the مآل clause
        // is welded shut", which would be a defect of its own.
        const readNamesNone = await runProbe(
          rollbackProbeSql([
            `UPDATE "waqf" SET "reversionClauseCaptured" = true, ` +
              `"reversionRecordedAt" = '2026-02-01'::timestamp, ` +
              `"reversionRecordedAtHijri" = '1447-08-13' WHERE "id" = '${UNREAD_WAQF}'`,
          ]),
        );
        expect(readNamesNone, '"I read it on this date; it names NO taker" is refused').toContain(
          PROBE_SUCCEEDED,
        );

        const readNamesOne = await runProbe(rollbackProbeSql([recordReversionSql(UNREAD_WAQF)]));
        expect(readNamesOne, '"I read it; here is the taker" is refused').toContain(
          PROBE_SUCCEEDED,
        );
      });

      it('AV3-01 · the statement `recordDeedTerms` emits on the `reversion: null` branch COMMITS', async () => {
        // ⚠ THIS TEST EXISTS BECAUSE MIGRATION 14 BROKE ITS ONLY PRODUCTION CALLER AND NOTHING
        // NOTICED FOR A ROUND. `packages/api/src/routers/endowment.ts` (`recordDeedTerms`, the
        // "(ii) THE FOUNDER'S CONDITION" write) had the dual date INSIDE the `input.reversion !==
        // null` arm, so the branch that records *"this deed names NO ultimate taker"* — the state 4
        // of the 5 seeded endowments are in, and the ordinary case at intake — emitted
        // `reversionClauseCaptured = true` with BOTH dates absent. That is EXACTLY the half-write
        // tier 3a refuses (AV-1), so the guard added to protect the مآل clause foreclosed the only
        // path that records one. The fix moved the two date fields out of the conditional spread.
        //
        // The pair below is the fix's proof AT THE LAYER THAT JUDGES IT: the pre-fix emission is
        // refused and the post-fix emission commits. Both are UPDATEs on the intake endowment with
        // `reversionKind` OMITTED — which is what a `reversion: null` recording is.
        const preFix = await runProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "reversionClauseCaptured" = true, "updatedAt" = now() ` +
              `WHERE "id" = '${UNREAD_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(preFix, 'the pre-fix emission commits — AV-1 is open again').toContain(
          `${PROBE_BLOCKED}[42501]`,
        );
        expect(preFix).toMatch(/IN THE SAME STATEMENT/);

        const postFix = await runProbe(
          rollbackProbeSql([
            `UPDATE "waqf" SET "reversionClauseCaptured" = true, ` +
              `"reversionRecordedAt" = now(), "reversionRecordedAtHijri" = '1447-08-13', ` +
              `"updatedAt" = now() WHERE "id" = '${UNREAD_WAQF}'`,
          ]),
        );
        expect(
          postFix,
          'AV3-01 is open: the fixed `reversion: null` emission is STILL refused, so the one ' +
            'production caller of the مآل capture path cannot record "this deed names none"',
        ).toContain(PROBE_SUCCEEDED);
        expect(postFix).not.toMatch(/IN THE SAME STATEMENT/);

        // ⚠ WHAT THIS DOES **NOT** PROVE, AND IT IS REPORTED RATHER THAN IMPLIED: that
        // `recordDeedTerms` actually emits this shape. That is a `packages/api` assertion — a call
        // with `reversion: null` on waqf-005 driven through to a COMMIT — and there is none:
        // measured, all three `reversion: null` call sites in
        // `packages/api/test/endowment-record.integration.test.ts` end in a DEED_TERM_WRITE_ONCE
        // refusal on an already-recorded endowment, so the write branch is never reached. This test
        // pins the CONTRACT the router must meet; the router-side half is owed to the api stage.
      });

      it('keeps every later change refused after a LEGITIMATE capture — the seal is untouched', async () => {
        // ⚠ THE FAIL-CLOSED DIRECTION, MEASURED SEPARATELY. AV-1's fix constrains how a row ENTERS
        // the sealed state; it must not soften the seal itself, which is V-E3-01's whole guarantee.
        // The setup here is now a COMPLETE capture recording NO ultimate taker — the exact state
        // V-E3-01 was about — and the probe is the rewrite it used to permit.
        const capturedNamingNone =
          `UPDATE "waqf" SET "reversionClauseCaptured" = true, ` +
          `"reversionRecordedAt" = '2026-02-01'::timestamp, ` +
          `"reversionRecordedAtHijri" = '1447-08-13' WHERE "id" = '${UNREAD_WAQF}'`;

        const error = await runProbe(
          probeWithSetupSql(
            [capturedNamingNone],
            `UPDATE "waqf" SET "reversionKind" = 'CHARITABLE_ULTIMATE_TAKER' ` +
              `WHERE "id" = '${UNREAD_WAQF}'`,
          ),
        );
        expect(
          error,
          'a deed recording NO مآل was rewritten into a charitable reversion',
        ).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/SEALED/);
        expect(error).toMatch(/SUPERSEDING INSTRUMENT/i);
      });

      it('tells the truth about WHICH recorded answer it is refusing to change (AV-6)', async () => {
        // MEASURED BEFORE: the seal hard-coded "and NULL is that recorded answer — the deed names NO
        // ultimate taker" and printed that sentence on a deed whose `reversionKind` was
        // `CHARITABLE_ULTIMATE_TAKER`:
        //
        //   42501 … 'deed term "reversionRecordedAtHijri" … is SEALED (1448-01-01 -> 1449-01-01
        //           refused) … and NULL is that recorded answer — the deed names NO ultimate taker'
        //
        // A refusal that says something false about a Nazir's own record is a refusal he will route
        // around. Both recorded answers are sealed equally; only the sentence differs.
        const namesOne = await runProbe(
          probeWithSetupSql(
            [recordReversionSql(UNREAD_WAQF)],
            `UPDATE "waqf" SET "reversionRecordedAtHijri" = '1449-01-01' ` +
              `WHERE "id" = '${UNREAD_WAQF}'`,
          ),
        );
        expect(namesOne).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(namesOne).toMatch(/SEALED/);
        expect(namesOne).toMatch(/NAMES an ultimate taker/);
        expect(namesOne).toMatch(/CHARITABLE_ULTIMATE_TAKER/);
        expect(
          namesOne,
          'the seal still tells a deed that NAMES a taker that it names none (AV-6)',
        ).not.toMatch(/names NO ultimate taker/);

        // The control, on a seeded deed whose clause WAS read and records none: there the sentence
        // is true and must still be printed.
        const namesNone = await runProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "reversionRecordedAtHijri" = '1449-01-01' ` +
              `WHERE "id" = '${RECORDED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(namesNone).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(namesNone).toMatch(/names NO ultimate taker/);
      });

      it('keeps `reversionClauseCaptured` one-way on the UNREAD deed too, once it is set', async () => {
        // The `true -> false` case already has a test against a seeded row. This is the other end of
        // the same rule and the one a reader would assume is different: a deed captured MOMENTS ago,
        // in the same transaction, is no more un-capturable than one captured at intake.
        //
        // ⚠ The setup is a COMPLETE capture since round 2 — `SET "reversionClauseCaptured" = true`
        // alone no longer commits (AV-1), and a setup statement that raises would abort the block
        // before the probe ever ran, turning this into a test of nothing.
        const error = await runProbe(
          probeWithSetupSql(
            [
              `UPDATE "waqf" SET "reversionClauseCaptured" = true, ` +
                `"reversionRecordedAt" = '2026-02-01'::timestamp, ` +
                `"reversionRecordedAtHijri" = '1447-08-13' WHERE "id" = '${UNREAD_WAQF}'`,
            ],
            `UPDATE "waqf" SET "reversionClauseCaptured" = false WHERE "id" = '${UNREAD_WAQF}'`,
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/one-way/i);
      });

      it('makes `reversionClauseCaptured` ONE-WAY: true -> false is refused', async () => {
        // Un-capturing restores "nobody has read this deed's مآل clause yet" — so an unread deed could
        // masquerade as a deed that names no ultimate taker (R7-c). Every seeded row is already
        // `true`, which is why this is the reachable direction.
        const error = await runProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "reversionClauseCaptured" = false WHERE "id" = '${RECORDED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/reversionClauseCaptured/);
        expect(error).toMatch(/one-way/i);
        expect(error).toMatch(/nobody has looked|masquerade/i);
      });

      it('leaves a NO-OP write alone — the guard compares VALUES, not the presence of a column', async () => {
        // A guard keyed on "this column appears in the UPDATE" would refuse an ordinary write that
        // happens to re-state the same value (an ORM writing every mapped field, for instance), and
        // that refusal would be indistinguishable from a real substitution attempt.
        const error = await runProbe(
          rollbackProbeSql([
            `UPDATE "waqf" SET "continuationStipulation" = 'ZUHUR_ONLY', ` +
              `"reversionClauseCaptured" = true WHERE "id" = '${RECORDED_WAQF}'`,
          ]),
        );
        expect(error).toContain(PROBE_SUCCEEDED);
        expect(error).not.toMatch(/WRITE-ONCE/);
      });
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 1b. THE THREE DEED FACTS ARE SEALED OUTRIGHT  (owner decision D-B, closing V-E3-M6)
    //
    // `entitlementOrder`, `type` and `nature` are founder's conditions in the same sense the Shart
    // is — `type` says whether the endowment is خيري or ذري, `entitlementOrder` says which rule
    // decides who is paid, `nature` says whether the corpus is عيني or قيمي. Asked directly on
    // 2026-08-16 whether they should become write-once, the product owner answered
    // *"yes they are unchangable"*.
    //
    // MEASURED BEFORE migration 13, on a pristine seed: all three committed, as `qmulate_app` and
    // from a CASE_MANAGER seat, while `shartAlWaqifVersion` on the same row was refused 42501.
    //
    // ⚠ NOTE WHAT IS **NOT** PROBED HERE, AND WHY. Section 2's ORM case deliberately writes
    // `value -> NULL`, because `withAudit()` COMMITS and a term cleared by a missing guard is
    // restored by the next `db:seed`. These three are `NOT NULL` and SEALED, so there is no safe
    // direction at all: a write that landed would fix waqf-001 at a founder's condition nobody
    // stipulated, permanently, with the guard itself blocking the correction. Every probe below is
    // therefore inside a rolled-back block, and the ORM path is left to the app-layer suite.
    // ═══════════════════════════════════════════════════════════════════════════════════════

    describe('tier 1b · the deed facts are sealed, and no first write is owed', () => {
      const SEALED_DEED_FACTS: readonly { column: string; from: string; to: string }[] = [
        { column: 'entitlementOrder', from: 'ORDERED', to: 'LINEAGE_CONTINUATION' },
        { column: 'type', from: 'FAMILY_DHURRI', to: 'PUBLIC_CHARITABLE' },
        { column: 'nature', from: 'AYNI', to: 'QIYAMI' },
      ];

      it.each(SEALED_DEED_FACTS)(
        'refuses a raw UPDATE of $column ($from -> $to)',
        async ({ column, from, to }) => {
          const error = await runProbe(
            guardProbeSql(
              `UPDATE "waqf" SET "${column}" = '${to}' WHERE "id" = '${RECORDED_WAQF}'`,
              'insufficient_privilege',
            ),
          );
          expect(error, `${column} is still freely writable (V-E3-M6)`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
          expect(error).toMatch(new RegExp(column));
          // Both values, so the reader can see which write was refused.
          expect(error).toMatch(new RegExp(from));
          expect(error).toMatch(new RegExp(to));
          // ⚠ "SEALED", NOT "WRITE-ONCE", AND THE MESSAGE MUST SAY SO. A NOT NULL column has no
          // unwritten state, so a reader told "write-once" would go looking for the permitted first
          // write and conclude the guard is broken when they cannot find it.
          expect(error).toMatch(/is SEALED/);
          expect(error).toMatch(/NOT WRITE-ONCE/);
          expect(error).toMatch(/SUPERSEDING INSTRUMENT/i);
        },
      );

      it('refuses them with a GENUINE reserved-matter approval in the session', async () => {
        // Same claim tier 1 and tier 3 make, and for the same reason: "authority-gated" and
        // "sealed" are different rules. `appr-test-9404` is APPROVED, RESERVED_MATTER, maker ≠
        // checker, on this very endowment.
        for (const { column, to } of SEALED_DEED_FACTS) {
          const error = await runProbe(
            guardProbeSql(
              `PERFORM set_config('${guc}', '${APPROVAL.deedTerm}', true); ` +
                `UPDATE "waqf" SET "${column}" = '${to}' WHERE "id" = '${RECORDED_WAQF}'`,
              'insufficient_privilege',
            ),
          );
          expect(error, `an approval opened ${column}`).toContain(`${PROBE_BLOCKED}[42501]`);
          expect(error).toMatch(/is SEALED/);
        }
      });

      it('refuses them under session_replication_role = replica', async () => {
        for (const { column, to } of SEALED_DEED_FACTS) {
          const error = await runProbe(
            guardProbeSql(
              `SET LOCAL session_replication_role = 'replica'; ` +
                `UPDATE "waqf" SET "${column}" = '${to}' WHERE "id" = '${RECORDED_WAQF}'`,
              'insufficient_privilege',
            ),
          );
          expect(error, `${column} is skipped in a replica session`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
        }
      });

      it('leaves a NO-OP re-statement of all three alone — the guard compares VALUES', async () => {
        const error = await runProbe(
          rollbackProbeSql([
            `UPDATE "waqf" SET "entitlementOrder" = 'ORDERED', "type" = 'FAMILY_DHURRI', ` +
              `"nature" = 'AYNI' WHERE "id" = '${RECORDED_WAQF}'`,
          ]),
        );
        expect(error).toContain(PROBE_SUCCEEDED);
        expect(error).not.toMatch(/is SEALED/);
      });

      it('keeps scoping.ts’s ungoverned list and the trigger’s source in parity', async () => {
        // TWO SIDES THAT MUST AGREE, WITH ONE READING THE OTHER. `DOMAIN_WRITE_POLICIES.Waqf`
        // marks these three `ungoverned` on the explicit grounds that the DATABASE refuses them
        // and its message is the stronger one. If the trigger ever stopped naming a column, that
        // justification would be false and the column would be governed by NOTHING — an
        // `ungoverned` entry is a positive claim about another layer, not an omission.
        //
        // ⚠ REPORTED, NOT WORKED AROUND: unlike `SHART_COLUMNS` and
        // `DEED_TERM_WRITE_ONCE_COLUMNS`, the three sealed deed facts have NO exported constant in
        // `src/reserved-matter.ts`, so `packages/api` has no list to reason about and this parity
        // has to be anchored on `scoping.ts` instead. That asymmetry is engineering debt in a file
        // this suite does not own.
        const prisma = await privilegedPrisma();
        const { SHART_COLUMNS, DEED_TERM_WRITE_ONCE_COLUMNS, REVERSION_CAPTURE_COLUMN } =
          await databaseModule();
        const { DOMAIN_WRITE_POLICIES } = await import('../src/extensions/scoping.js');

        const ungoverned = DOMAIN_WRITE_POLICIES.Waqf?.ungoverned ?? [];
        const sealedFacts = ungoverned.filter((column) => !SHART_COLUMNS.includes(column));
        expect([...sealedFacts].sort()).toEqual(['entitlementOrder', 'nature', 'type']);

        const [row] = await prisma.$queryRawUnsafe<{ src: string }[]>(
          `SELECT prosrc AS src FROM pg_proc WHERE proname = 'qmulate_shart_guard'`,
        );
        const source = row?.src ?? '';
        for (const column of sealedFacts) {
          expect(
            source,
            `${column} is ungoverned in scoping.ts but qmulate_shart_guard() never names it — ` +
              `so nothing refuses it at all`,
          ).toContain(column);
        }

        // The three lists stay DISJOINT: sealed outright / write-once / the capture Boolean are
        // three different rules and merging any two loses one of them.
        expect(sealedFacts.filter((c) => DEED_TERM_WRITE_ONCE_COLUMNS.includes(c))).toEqual([]);
        expect(sealedFacts).not.toContain(REVERSION_CAPTURE_COLUMN);

        // ORDER IS PART OF THE CONTRACT (migration 13 §2a): tier 1b sits between the tier-1 raise
        // and the first `current_setting`, so no approval can ever reach a founder's condition.
        const shartRaise = source.indexOf('shart_al_waqif is immutable');
        const sealedRaise = source.indexOf('is SEALED');
        const gucRead = source.indexOf('current_setting');
        expect(sealedRaise).toBeGreaterThan(-1);
        expect(sealedRaise, 'the tier-1 raise must still come first').toBeGreaterThan(shartRaise);
        expect(
          sealedRaise,
          'tier 1b must be decided before the GUC is read, or an approval becomes a key to it',
        ).toBeLessThan(gucRead);
      });
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 2. NO APPROVAL, NO ORM AND NO REPLICA SESSION OPENS TIER 3
    // ═══════════════════════════════════════════════════════════════════════════════════════

    describe('tier 3 · nothing opens it', () => {
      it('refuses even with a GENUINE reserved-matter approval that NAMES this very column', async () => {
        // The strongest available form of the claim. `appr-test-9404` is APPROVED, RESERVED_MATTER, on
        // waqf-001, maker ≠ checker, and its `subjectId` is exactly the artifact grammar tier 2 uses
        // (`waqf:waqf-001:continuationStipulation`). It still may not open a recorded deed term,
        // because "authority-gated" and "write-once" are different rules and only the second applies
        // here (Binding rule 1: a change is a superseding instrument, never an edit).
        const error = await runProbe(
          guardProbeSql(
            `PERFORM set_config('${guc}', '${APPROVAL.deedTerm}', true); ` +
              `UPDATE "waqf" SET "continuationStipulation" = 'ZUHUR_AND_BUTUN' WHERE "id" = '${RECORDED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/not by any reserved-matter approval|WRITE-ONCE/);
      });

      it('refuses through the AUDITED ORM path — with the DATABASE’s error, not a weaker one', async () => {
        // ⚠ THIS IS THE `DOMAIN_WRITE_POLICIES.Waqf.ungoverned` POINT, ASSERTED. The app layer must
        // NOT shadow this refusal with a friendlier one of its own: the database's rule is the
        // stronger one (it survives raw SQL, a migration and a replica session), so the DATABASE must
        // be what raises, and the caller must see SQLSTATE 42501.
        //
        // ⚠ AND THE DIRECTION OF THE ATTEMPTED WRITE IS CHOSEN FOR SAFETY, NOT CONVENIENCE. This is
        // the one probe in this file that is NOT inside a rolled-back block — `withAudit()` commits —
        // so if the guard were MISSING the write would land. `value -> NULL` is therefore the only
        // direction it may use: a term cleared by a failing guard is restored by the next `db:seed`
        // (NULL -> value is the one permitted write), whereas `value -> another value` would seal the
        // endowment at a founder's condition nobody stipulated, with no way back at all.
        const { makeSystemContext, withAudit } = await databaseModule();
        const ctx = makeSystemContext({
          actorId: 'user-test-harness',
          authorizedWaqfIds: [RECORDED_WAQF],
          requestId: 'test-e3-deed-term-orm',
        });

        let raised: unknown = null;
        try {
          await withAudit(ctx, async (tx) => {
            await tx.waqf.update({
              where: { id: RECORDED_WAQF },
              data: { continuationStipulation: null },
            });
          });
        } catch (error: unknown) {
          raised = error;
        }
        expect(raised, 'the ORM path cleared a recorded founder’s condition').not.toBeNull();
        const text = errorText(raised);
        expect(text).toMatch(/42501/);
        expect(text).toMatch(/WRITE-ONCE/);

        // Not even a SYSTEM context — which bypasses the scoping force filter — reaches it, and the
        // value is still there.
        const prisma = await privilegedPrisma();
        const waqf = await prisma.waqf.findUniqueOrThrow({ where: { id: RECORDED_WAQF } });
        expect(waqf.continuationStipulation).toBe('ZUHUR_ONLY');
      });

      it('never reaches the database at all through the UNEXTENDED client', async () => {
        // A second, independent refusal, and it is not redundant: the base handle carries no force
        // filter, no column gate and no audit event, so a write through it would be an unrecorded
        // mutation of the system of record even if the tier-3 trigger caught the value.
        const prisma = await privilegedPrisma();
        const error = await prisma.waqf
          .update({
            where: { id: RECORDED_WAQF },
            data: { continuationStipulation: 'ZUHUR_AND_BUTUN' },
          })
          .then(() => null)
          .catch((caught: unknown) => errorText(caught));

        expect(error, 'the unextended client wrote to `waqf`').not.toBeNull();
        expect(error).toMatch(/UNEXTENDED_CLIENT_WRITE/);
      });

      it('refuses under session_replication_role = replica — so tier 3 is ENABLE ALWAYS', async () => {
        // The Sprint-1 bypass that defeated gate G-1: a plain `SET`, not DDL. `waqf_shart_immutable`
        // is `tgenabled = 'A'`, and migration 12 REPLACED its function body rather than re-creating
        // the trigger — so this probe is what proves the replacement did not silently reset that.
        const error = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; ` +
              `UPDATE "waqf" SET "continuationStipulation" = 'ZUHUR_AND_BUTUN' WHERE "id" = '${RECORDED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/WRITE-ONCE/);
      });

      it('still refuses every TIER 1 Shart column, unconditionally (G-1 / ADR-0006 regression)', async () => {
        // Migration 12 rewrote `qmulate_shart_guard()`. The four Shart columns are the thing that
        // function existed for, so a rewrite is exactly when they stop being refused — and a green
        // suite would not notice, because tier 1's own file was not touched this sprint.
        const statements: readonly { column: string; set: string }[] = [
          { column: 'shartAlWaqif', set: `"shartAlWaqif" = '{}'::jsonb` },
          { column: 'shartAlWaqifVersion', set: `"shartAlWaqifVersion" = 99` },
          { column: 'shartAlWaqifSetAt', set: `"shartAlWaqifSetAt" = now()` },
          { column: 'shartAlWaqifSetAtHijri', set: `"shartAlWaqifSetAtHijri" = '1400-01-01'` },
        ];
        for (const { column, set } of statements) {
          const error = await runProbe(
            guardProbeSql(
              `PERFORM set_config('${guc}', '${APPROVAL.deedTerm}', true); ` +
                `UPDATE "waqf" SET ${set} WHERE "id" = '${RECORDED_WAQF}'`,
              'insufficient_privilege',
            ),
          );
          expect(error, `${column} is no longer refused after migration 12`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
          expect(error).toMatch(/shart_al_waqif is immutable/);
          expect(error).toMatch(new RegExp(column));
        }
      });

      it('refuses the DELETE + re-INSERT substitution of a whole endowment (C-03 regression)', async () => {
        // The two-statement bypass tier 1 alone never saw. Re-asserted here because migration 12 is a
        // `waqf`-touching migration and `waqf_no_delete` is a DIFFERENT trigger from the one it
        // replaced — a migration that re-created the table would have taken the delete guard with it.
        const error = await runProbe(
          guardProbeSql(
            `DELETE FROM "waqf" WHERE "id" = '${RECORDED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/waqf/);
      });

      it('keeps BOTH tier-3 lists in parity with the trigger’s own source text', async () => {
        // TWO SIDES THAT MUST AGREE, WITH ONE READING THE OTHER — the same discipline the four Shart
        // columns already get. `DEED_TERM_WRITE_ONCE_COLUMNS` is what `packages/api` and
        // `src/extensions/scoping.ts` reason about; `qmulate_shart_guard()` is what actually refuses.
        // A column in one and not the other is a hole in whichever layer forgot it.
        const prisma = await privilegedPrisma();
        const { DEED_TERM_WRITE_ONCE_COLUMNS, REVERSION_CAPTURE_COLUMN, SHART_COLUMNS } =
          await databaseModule();
        const [row] = await prisma.$queryRawUnsafe<{ src: string }[]>(
          `SELECT prosrc AS src FROM pg_proc WHERE proname = 'qmulate_shart_guard'`,
        );
        const source = row?.src ?? '';
        expect(source, 'qmulate_shart_guard() is not installed').not.toBe('');

        for (const column of DEED_TERM_WRITE_ONCE_COLUMNS) {
          expect(
            source,
            `${column} is in DEED_TERM_WRITE_ONCE_COLUMNS but the trigger never names it`,
          ).toContain(column);
        }
        expect(source).toContain(REVERSION_CAPTURE_COLUMN);

        // Four write-once terms, four Shart columns, one capture flag — and the two lists are
        // DISJOINT. Tier 1 refuses every write; tier 3 permits the first. Merging them would make a
        // term illegible at intake unrecordable for ever, which is why they are separate lists.
        expect(DEED_TERM_WRITE_ONCE_COLUMNS).toHaveLength(4);
        expect(
          DEED_TERM_WRITE_ONCE_COLUMNS.filter((column) => SHART_COLUMNS.includes(column)),
        ).toEqual([]);

        // ORDER IS PART OF THE CONTRACT: tier 1 raises before the function reads the GUC at all, so no
        // approval can ever reach the Shart columns. Tier 3 must sit inside that same GUC-free region.
        const shartRaise = source.indexOf('shart_al_waqif is immutable');
        const writeOnceRaise = source.indexOf('is WRITE-ONCE');
        const gucRead = source.indexOf('current_setting');
        expect(shartRaise).toBeGreaterThan(-1);
        expect(writeOnceRaise).toBeGreaterThan(-1);
        expect(shartRaise, 'the Shart raise must precede any GUC read').toBeLessThan(gucRead);
        expect(
          writeOnceRaise,
          'tier 3 must be decided before the GUC is read, or an approval becomes a key to it',
        ).toBeLessThan(gucRead);
      });
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 3. A RECORDED ULTIMATE TAKER (مآل الوقف) IS WRITE-ONCE
    //
    // A row in `waqf_reversion_taker` names where the endowment goes once the bloodline is over.
    // Editing one re-points the corpus at a different jiha with no superseding instrument; deleting
    // one silently restores "this deed names no taker".
    // ═══════════════════════════════════════════════════════════════════════════════════════

    describe('waqf_reversion_taker · write-once, with no deletedAt to hide behind', () => {
      const TAKER_ROW = 'wrt-test-9401';
      const TAKER_JIHA = 'ben-test-9401';

      const takerSql = (id: string, waqfId: string, beneficiaryId: string): string =>
        `INSERT INTO "waqf_reversion_taker" ("id","waqfId","beneficiaryId","createdAt","createdBy")
          VALUES ('${id}', '${waqfId}', '${beneficiaryId}', now(), '${MAKER_ID}')`;

      /**
       * ⚠ EVERY SUBJECT IN THIS SECTION MOVED, AND THE OLD ONE WAS NOT MERELY STALE — IT IS NOW
       * REFUSED, CORRECTLY.
       *
       * These cases used to build their subject as `('wrt-test-9401', 'waqf-003', 'ben-006')`, and
       * waqf-003 records NO مآل (`captured = true, kind = NULL`). That is precisely the shape
       * V-E3-M2 says must be refused, and since migration 13 it is:
       * `42501 … waqf waqf-003 records NO مآل الوقف`. The write-once claims below are about a
       * LEGITIMATELY RECORDED taker, so they need a legitimate one, and the fixture now supplies the
       * route: waqf-005's clause is UNREAD, so it can be recorded (kind + the reading, one
       * statement), and a CHARITABLE JIHA beneficiary of that same endowment can then be named.
       *
       * All three statements are scaffolding inside a rolled-back block. Nothing here commits — a
       * taker row that COMMITTED could never be removed, by anything.
       */
      const RECORD_A_TAKER: readonly string[] = [
        recordReversionSql(UNREAD_WAQF),
        insertJihaBeneficiarySql(TAKER_JIHA, UNREAD_WAQF),
        takerSql(TAKER_ROW, UNREAD_WAQF, TAKER_JIHA),
      ];

      // ─────────────────────────────────────────────────────────────────────────────────────
      // 3a. INSERT INTEGRITY — the verb this table had NOTHING on until migration 13 (V-E3-M2)
      //
      // MEASURED before the fix, as `qmulate_app`: a taker on a waqf whose deed records no مآل was
      // ACCEPTED, and so was a taker naming `ben-002` — `FAMILY`, `SON`, `active` — i.e. a LIVING
      // DESCENDANT. The trigger was `BEFORE UPDATE OR DELETE`; INSERT is the recording path and was
      // unconstrained, on the one table that decides where an endowment goes when the family ends.
      // ─────────────────────────────────────────────────────────────────────────────────────

      it('accepts the INSERT that records the clause — the table is not welded shut', async () => {
        const error = await runProbe(rollbackProbeSql([...RECORD_A_TAKER]));
        expect(error).toContain(PROBE_SUCCEEDED);
      });

      it('says out loud that the PERMIT arm’s subject MUST be constructed (AV3-10)', async () => {
        // ⚠ THE FACT THE TEST ABOVE DEPENDS ON, MEASURED RATHER THAN ASSUMED. Every seeded endowment
        // lands on a REFUSAL branch of `qmulate_reversion_taker_insert_integrity()`: four record
        // `captured = true, kind = NULL` (§2 refuses) and waqf-005 records `captured = false` (§1
        // refuses), and the taker table is empty. So NO committed fixture row can reach the legal
        // path, and the PERMIT test above is only meaningful because it BUILDS its subject inside a
        // rolled-back block. If a future fixture change ever recorded a `reversionKind`, this
        // assertion goes red and whoever made that change has to decide deliberately whether the
        // seeded endowment is now the PERMIT arm's subject — rather than discovering years later
        // that the "legal path" test had been exercising a fixture row all along.
        //
        // R6-C1's lesson, applied to a PERMIT rather than a refusal: a property whose generator
        // cannot reach a configuration reports its silence as success, at scale.
        const prisma = await privilegedPrisma();
        const rows = await prisma.$queryRawUnsafe<
          { id: string; captured: boolean; kind: string | null }[]
        >(
          `SELECT "id", "reversionClauseCaptured" AS captured, "reversionKind"::text AS kind
             FROM "waqf" ORDER BY "id"`,
        );
        expect(rows.length).toBeGreaterThan(0);
        expect(
          rows.filter((row) => row.kind !== null),
          'a seeded endowment now records a reversionKind — the PERMIT arm has a FIXTURE subject, ' +
            'and this section’s constructed one is no longer the only route. Decide deliberately.',
        ).toEqual([]);
        expect(rows.filter((row) => !row.captured).map((row) => row.id)).toEqual([UNREAD_WAQF]);
        const [takers] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM "waqf_reversion_taker"`,
        );
        expect(Number(takers?.n ?? -1)).toBe(0);
      });

      it('accepts a SECOND, distinct taker — a deed may name more than one jiha', async () => {
        // The refusals below must not be a blanket "one row per endowment": the ultimate taker's
        // share is a deed WEIGHT vector, which presupposes that a vector is representable.
        const error = await runProbe(
          rollbackProbeSql([
            ...RECORD_A_TAKER,
            insertJihaBeneficiarySql('ben-test-9403', UNREAD_WAQF),
            takerSql('wrt-test-9403', UNREAD_WAQF, 'ben-test-9403'),
          ]),
        );
        expect(error).toContain(PROBE_SUCCEEDED);
      });

      it('refuses a taker on a deed that RECORDS NO مآل — waqf-003’s answer is "none"', async () => {
        const error = await runProbe(
          guardProbeSql(
            takerSql(TAKER_ROW, UNRECORDED_WAQF, TAKER_BENEFICIARY),
            'insufficient_privilege',
          ),
        );
        expect(error, 'a taker was recorded against a deed that names none').toContain(
          `${PROBE_BLOCKED}[42501]`,
        );
        expect(error).toMatch(/records NO مآل|reversionKind" is NULL/);
        // Both sides are unamendable afterwards, so the refusal has to say the correction is a
        // superseding instrument rather than an edit.
        expect(error).toMatch(/SUPERSEDING INSTRUMENT/i);
      });

      it('refuses a taker on a deed NOBODY HAS READ — captured = false', async () => {
        // The other kind of NULL, and the reason `reversionClauseCaptured` exists (R7-c). Without a
        // beneficiary of waqf-005 the FK would answer first, so one is constructed inside the block.
        const error = await runProbe(
          probeWithSetupSql(
            [insertJihaBeneficiarySql(TAKER_JIHA, UNREAD_WAQF)],
            takerSql(TAKER_ROW, UNREAD_WAQF, TAKER_JIHA),
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/reversionClauseCaptured" = false|NOBODY HAS READ/i);
      });

      it('refuses a LIVING FAMILY DESCENDANT as the CHARITABLE ultimate taker', async () => {
        // ⚠ THIS REFUSAL IS ENGINEERING'S FAIL-SAFE READING OF R5/R7, NOT THE PRODUCT OWNER'S
        // RULING — migration 13 §2b(4) carries a `TODO(surface)` saying so, and the raised message
        // repeats it. The assertion below PINS that marker: whoever eventually gets the owner's
        // answer must edit this test deliberately, and a refusal that quietly lost its "this is our
        // reading, not his" caveat would be a fiqh claim the repo is not entitled to make.
        const error = await runProbe(
          probeWithSetupSql(
            [recordReversionSql(UNREAD_WAQF), insertDescendantSql('ben-test-9402', UNREAD_WAQF)],
            takerSql('wrt-test-9402', UNREAD_WAQF, 'ben-test-9402'),
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/is a DESCENDANT of the waqif/);
        expect(error).toMatch(/ONCE THE BLOODLINE IS OVER/);
        expect(error).toMatch(/I-R1/);
        expect(error).toMatch(/TODO\(surface\)/);
      });

      it('refuses a taker for an endowment that does not exist, before the FK answers', async () => {
        const error = await runProbe(
          guardProbeSql(
            takerSql(TAKER_ROW, 'waqf-does-not-exist', TAKER_BENEFICIARY),
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/does not exist/);
      });

      it('leaves the SAME-ENDOWMENT rule to the composite FK, and that FK still fires', async () => {
        // Migration 13 §2b(3) deliberately does NOT re-implement this: the composite FK
        // `waqf_reversion_taker_waqfId_beneficiaryId_fkey` already makes a cross-endowment taker
        // structurally impossible. A reliance that is not asserted is a reliance that silently
        // lapses (ADR-0008 §2.4), so it is measured here — on a waqf whose clause IS recorded, so
        // the trigger cannot be what refuses.
        const error = await runProbe(
          probeWithSetupSql(
            [recordReversionSql(UNREAD_WAQF)],
            takerSql(TAKER_ROW, UNREAD_WAQF, TAKER_BENEFICIARY),
          ),
        );
        // 23503 is not 42501, so the handler does not catch it and the raw error surfaces.
        expect(error).toMatch(/23503|waqf_reversion_taker_waqfId_beneficiaryId_fkey/);
      });

      it('refuses the INSERT in a replica session too — the new guard is ENABLE ALWAYS', async () => {
        const error = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; ` +
              takerSql(TAKER_ROW, UNRECORDED_WAQF, TAKER_BENEFICIARY),
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/records NO مآل|reversionKind" is NULL/);
      });

      // ─────────────────────────────────────────────────────────────────────────────────────
      // 3b. WRITE-ONCE, once the row legitimately exists
      // ─────────────────────────────────────────────────────────────────────────────────────

      it('refuses an UPDATE that re-points the taker at another beneficiary', async () => {
        const error = await runProbe(
          probeWithSetupSql(
            RECORD_A_TAKER,
            `UPDATE "waqf_reversion_taker" SET "beneficiaryId" = '${TAKER_JIHA}' WHERE "id" = '${TAKER_ROW}'`,
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/UPDATE/);
        expect(error).toMatch(/write-once/i);
        expect(error).toMatch(/superseding instrument/i);
      });

      it('refuses a DELETE — removing the clause is not a correction', async () => {
        const error = await runProbe(
          probeWithSetupSql(
            RECORD_A_TAKER,
            `DELETE FROM "waqf_reversion_taker" WHERE "id" = '${TAKER_ROW}'`,
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/DELETE/);
        expect(error).toMatch(/names no taker|write-once/i);
      });

      it('refuses TRUNCATE, which fires no row trigger at all', async () => {
        const error = await runProbe(
          guardProbeSql(`TRUNCATE TABLE "waqf_reversion_taker"`, 'insufficient_privilege'),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      });

      it('refuses UPDATE, DELETE and TRUNCATE under session_replication_role = replica', async () => {
        // ⚠ THE ROW HAS TO BE THERE FIRST, AND THIS IS THE MISTAKE THIS TEST MADE ON ITS FIRST RUN.
        // `waqf_reversion_taker` is EMPTY on the seeded fixture, so `UPDATE`/`DELETE` over it touch
        // zero rows — a `FOR EACH ROW` trigger never fires, the statement "succeeds", and the probe
        // reports QMULATE_PROBE_NOT_BLOCKED. Measured: the first version of this test passed the
        // UPDATE case only because four rows another suite had leaked into a DIFFERENT table happened
        // to be there. A row-level guard can only be probed against a row.
        for (const statement of [
          `UPDATE "waqf_reversion_taker" SET "createdBy" = 'x' WHERE "id" = '${TAKER_ROW}'`,
          `DELETE FROM "waqf_reversion_taker" WHERE "id" = '${TAKER_ROW}'`,
        ]) {
          const error = await runProbe(
            probeWithSetupSql(
              [`SET LOCAL session_replication_role = 'replica'`, ...RECORD_A_TAKER],
              statement,
            ),
          );
          expect(error, `${statement} is permitted in a replica session`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
        }

        // TRUNCATE is a STATEMENT-level trigger, so it fires on an empty table too — the one verb
        // whose probe does not need a subject row.
        const truncate = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; TRUNCATE TABLE "waqf_reversion_taker"`,
            'insufficient_privilege',
          ),
        );
        expect(truncate).toContain(`${PROBE_BLOCKED}[42501]`);
      });

      it('refuses a DUPLICATE taker id rather than de-duplicating it — a repeat moves money', async () => {
        // The second side of the resolver's `REVERSION_ULTIMATE_TAKER_DUPLICATED` refusal: a repeated
        // id would double-count in the weight vector, so it must be unrepresentable rather than
        // tidied up.
        const error = await runProbe(
          probeWithSetupSql(RECORD_A_TAKER, takerSql('wrt-test-9402', UNREAD_WAQF, TAKER_JIHA)),
        );
        // A unique-index violation is 23505, not 42501, so the 42501-only handler does not catch it and
        // the raw error surfaces — which is the assertion.
        expect(error).toMatch(/23505|duplicate key|waqf_reversion_taker_waqfId_beneficiaryId_key/);
      });

      it('has no rows at all on the seeded fixture, and every probe above left it that way', async () => {
        const prisma = await privilegedPrisma();
        const [row] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM "waqf_reversion_taker"`,
        );
        expect(Number(row?.n ?? -1)).toBe(0);
        // And the beneficiaries the probes constructed went with them.
        const [orphans] = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
          `SELECT count(*) AS n FROM "beneficiary" WHERE "id" LIKE 'ben-test-9%'`,
        );
        expect(Number(orphans?.n ?? -1)).toBe(0);
      });
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 4. BR-104 · THE CLASSIFICATION HISTORY IS APPEND-ONLY, AND A FABRICATED TRANSITION IS
    //    UNREPRESENTABLE
    //
    // `model ReclassificationEvent`'s doc comment has claimed "event-sourced — append-only, never
    // edited" since Sprint 1 and NOTHING enforced the edit half until migration 12. A history that
    // can be rewritten is not a history: an endowment could be shown as always having been LARGE, or
    // a period of SMALL classification (with its lighter obligations) erased after the fact.
    //
    // ⚠ EVERY PROBE HERE USES A ROLLED-BACK BLOCK, FOR A REASON THIS SPRINT DEMONSTRATED. A committed
    // event on a seeded endowment can never be removed, and four such rows currently exist locally.
    // ═══════════════════════════════════════════════════════════════════════════════════════

    describe('reclassification_event · append-only, enforced rather than claimed', () => {
      /** waqf-003 is LARGE, so this is the ONE transition its `from` check will accept. */
      const insertEvent = `INSERT INTO "reclassification_event"
        ("id","waqfId","from","to","at","atHijri","reason","createdAt","createdBy")
      VALUES ('reclass-test-9401','${UNRECORDED_WAQF}','LARGE'::"WaqfClassification",
              'MEDIUM'::"WaqfClassification", now(), '1447-01-01',
              'S4/E3 integration probe (بيانات وهمية)', now(), '${MAKER_ID}')`;

      it('accepts an append whose `from` IS the pre-image', async () => {
        const error = await runProbe(rollbackProbeSql([insertEvent]));
        expect(error).toContain(PROBE_SUCCEEDED);
      });

      it('refuses an UPDATE of an appended event', async () => {
        const error = await runProbe(
          probeWithSetupSql(
            [insertEvent],
            `UPDATE "reclassification_event" SET "to" = 'SMALL'::"WaqfClassification" WHERE "id" = 'reclass-test-9401'`,
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/append-only/i);
        expect(error).toMatch(/BR-104/);
      });

      it('refuses a DELETE of an appended event', async () => {
        const error = await runProbe(
          probeWithSetupSql(
            [insertEvent],
            `DELETE FROM "reclassification_event" WHERE "id" = 'reclass-test-9401'`,
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        // DELETE is migration 6's guard, which carries the RETENTION hint rather than the append-only
        // one. Both are correct; the assertion matches either so the two guards can be reordered
        // without a false red, but it does require the refusal to be actionable.
        expect(error).toMatch(/further reclassification event|append-only/i);
      });

      it('refuses TRUNCATE, and refuses UPDATE/DELETE/TRUNCATE in a replica session', async () => {
        const error = await runProbe(
          guardProbeSql(`TRUNCATE TABLE "reclassification_event"`, 'insufficient_privilege'),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);

        // ⚠ The row-level verbs are probed against a row this block INSERTS, not against whatever the
        // table happens to hold. On a freshly seeded database the history is EMPTY, so an unqualified
        // `UPDATE`/`DELETE` would touch zero rows, fire no `FOR EACH ROW` trigger and pass as
        // "not blocked" — the vacuous green this file's header is about.
        for (const statement of [
          `UPDATE "reclassification_event" SET "reason" = 'rewritten' WHERE "id" = 'reclass-test-9401'`,
          `DELETE FROM "reclassification_event" WHERE "id" = 'reclass-test-9401'`,
        ]) {
          const replica = await runProbe(
            probeWithSetupSql(
              [`SET LOCAL session_replication_role = 'replica'`, insertEvent],
              statement,
            ),
          );
          expect(replica, `${statement} is permitted in a replica session`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
        }

        const truncate = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; TRUNCATE TABLE "reclassification_event"`,
            'insufficient_privilege',
          ),
        );
        expect(truncate).toContain(`${PROBE_BLOCKED}[42501]`);
      });

      it('refuses a FABRICATED transition — `from` must equal the live classification', async () => {
        const error = await runProbe(
          guardProbeSql(
            insertEvent.replace(`'LARGE'::"WaqfClassification"`, `'SMALL'::"WaqfClassification"`),
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/"from" is SMALL/);
        expect(error).toMatch(/currently LARGE/);
        // The message must give the ordering rule, or the caller "fixes" it by updating the waqf first
        // and silently records the post-image as the pre-image.
        expect(error).toMatch(/INSERT THE EVENT FIRST/);
      });

      it('refuses a no-op transition, and an event for an endowment that does not exist', async () => {
        const noop = await runProbe(
          guardProbeSql(
            insertEvent.replace(`'MEDIUM'::"WaqfClassification"`, `'LARGE'::"WaqfClassification"`),
            'insufficient_privilege',
          ),
        );
        expect(noop).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(noop).toMatch(/not a re-classification/);

        // An FK would refuse this too — but the trigger runs BEFORE INSERT and says something a
        // reader can act on, and this asserts which one answers.
        const orphan = await runProbe(
          guardProbeSql(
            insertEvent.replace(`'${UNRECORDED_WAQF}'`, `'waqf-does-not-exist'`),
            'insufficient_privilege',
          ),
        );
        expect(orphan).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(orphan).toMatch(/does not exist/);
      });
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 5. BR-306 · DISPOSAL / ISTIBDAL / PLEDGE / LONG LEASE IS RESERVED-MATTER-ONLY
    //
    // `src/extensions/scoping.ts` named `asset.status` as A NAMED RESIDUAL rather than a judgement
    // that it was harmless: "active -> disposed on a corpus asset is a material act". E3 is the epic
    // that flags disposal and substitution as reserved, and migration 12 closes it AT THE DATABASE —
    // the layer that survives raw SQL.
    //
    // ⚠ THE api LAYER'S OWN AC-E3-08 TEST DOES NOT EXIST (reported by that agent). So this section is
    // the only end-to-end proof that the reserved act is gated at all, and it is deliberately written
    // at the layer that cannot be bypassed.
    //
    // ⚠ ISTIBDAL PROCEEDS ARE CORPUS (aṣl). Nothing here writes a receipt or a Transaction; the last
    // assertion in this section is that the ledger did not move.
    // ═══════════════════════════════════════════════════════════════════════════════════════

    describe('asset_identity_guard · the reserved act, gated at the database', () => {
      /** D-A's closed vocabulary, in the owner's own order. RESERVED first / ORDINARY second. */
      const RESERVED_STATUSES = ['EXPROPRIATED', 'SUBSTITUTED_ISTIBDAL'] as const;
      const ORDINARY_STATUSES = ['ACTIVE', 'FULLY_RENTED', 'PARTIALLY_RENTED', 'VACANT'] as const;

      const statusUpdate = (status: string): string =>
        `UPDATE "asset" SET "status" = '${status}' WHERE "id" = '${ASSET_ID}'`;

      // ─────────────────────────────────────────────────────────────────────────────────────
      // ⚠ THE WHOLE SHAPE OF THIS SECTION CHANGED WITH MIGRATION 13, AND SO DID THE CLAIM.
      //
      // V-E3-02: BR-306's gate used to be an allow-list of TWELVE Latin spellings over a free-text
      // column with no CHECK. Any other spelling committed a disposal ungated — including the
      // ARABIC one, and Arabic is authoritative (NFR-01). The tests below used to probe those
      // twelve spellings, which was the best available proof of a gate that could only ever be as
      // good as its list.
      //
      // The owner closed it by VOCABULARY, not by a longer list (D-A, 2026-08-16), so the claim is
      // now two claims and they are asserted separately:
      //   1. an unrecognised status CANNOT BE STORED — refused at TYPE PARSE (22P02), before any
      //      trigger runs. Stronger than "the guard caught it".
      //   2. of the six values that CAN be stored, the two by which corpus leaves the endowment
      //      need an approved, artifact-bound reserved matter (42501).
      // ─────────────────────────────────────────────────────────────────────────────────────

      it('has EXACTLY the owner’s six statuses, read from pg_enum', async () => {
        // Read from the live catalogue rather than from the migration text: the assertion is about
        // what the database will accept. A seventh member arriving without a decision fails here
        // AND in the ADR-0004 partition test below.
        const prisma = await privilegedPrisma();
        const rows = await prisma.$queryRawUnsafe<{ label: string }[]>(
          `SELECT e.enumlabel AS label
             FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'AssetStatus'
            ORDER BY e.enumsortorder`,
        );
        expect(rows.map((row) => row.label)).toEqual([...ORDINARY_STATUSES, ...RESERVED_STATUSES]);
      });

      it('cannot STORE a status outside the vocabulary — 22P02, before any trigger', async () => {
        // ⚠ THE FIRST ENTRY IS THE HEADLINE OF V-E3-02. Arabic is the authoritative language
        // (NFR-01), and under the twelve-spelling allow-list the Arabic word for "sold" committed a
        // disposal with no approval at all. It is now unrepresentable rather than ungated.
        //
        // `'active'` is in this list ON PURPOSE: it is the value every seeded row USED to hold, so
        // its refusal is what proves the conversion happened rather than the type merely existing.
        for (const status of [
          'مباع',
          'disposed',
          'sold',
          'substituted',
          'istibdal',
          'pledged',
          'mortgaged',
          'long_leased',
          'long lease',
          'under_maintenance',
          'under_review',
          'active',
        ]) {
          const error = await runProbe(
            guardProbeSql(statusUpdate(status), 'invalid_text_representation'),
          );
          expect(error, `"${status}" is still storable in asset.status`).toContain(
            `${PROBE_BLOCKED}[22P02]`,
          );
          expect(error).toMatch(/invalid input value for enum "AssetStatus"/);
        }
      });

      it('refuses a move into EVERY reserved value, with no approval', async () => {
        for (const status of RESERVED_STATUSES) {
          const error = await runProbe(
            guardProbeSql(statusUpdate(status), 'insufficient_privilege'),
          );
          expect(error, `status -> "${status}" is not gated`).toContain(`${PROBE_BLOCKED}[42501]`);
          expect(error).toMatch(/RESERVED MATTER \(BR-306\)/);
          // ⚠ Binding rule 1, in the refusal itself. Migration 13 reworded this from "istibdal
          // proceeds are CORPUS" to "Proceeds of EITHER are CORPUS" when it split the act in two,
          // so the assertion is pinned on the two facts rather than on the sentence: proceeds are
          // corpus, and the ledger class that follows from it.
          expect(error).toMatch(/CORPUS/);
          expect(error).toMatch(/receiptClass = CAPITAL/);
          // The refusal must name the subject an approval has to carry, or the caller cannot comply.
          expect(error).toMatch(new RegExp(`asset:${ASSET_ID}:status`));
        }
      });

      it('classifies EVERY member of the live enum — ADR-0004’s halt branch has no subject', async () => {
        // ⚠ THIS IS THE ADR-0004 BRANCH, DRIVEN THROUGH THE DATABASE RATHER THAN READ IN THE SQL.
        // `qmulate_asset_identity_guard()` partitions `AssetStatus` into RESERVED and ORDINARY and
        // RAISES on a member in neither, precisely so a seventh value cannot become an ungated
        // disposal by falling through to "not disposable". The partition is only total if the two
        // arrays cover the type — which is a fact about the LIVE catalogue, not about the migration.
        //
        // So: for every member the enum actually has, move asset-005 into it with no approval and
        // require the answer to be a BR-306 refusal or a success. "UNCLASSIFIED" must never appear.
        const prisma = await privilegedPrisma();
        const members = await prisma.$queryRawUnsafe<{ label: string }[]>(
          `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'AssetStatus' ORDER BY e.enumsortorder`,
        );
        expect(members.length).toBeGreaterThan(0);

        for (const { label } of members) {
          const reserved = (RESERVED_STATUSES as readonly string[]).includes(label);
          const error = reserved
            ? await runProbe(guardProbeSql(statusUpdate(label), 'insufficient_privilege'))
            : await runProbe(rollbackProbeSql([statusUpdate(label)]));

          expect(
            error,
            `"${label}" is in neither of qmulate_asset_identity_guard()'s two arrays — it HALTS ` +
              `(ADR-0004) instead of being classified. Whoever added the enum member owes the ` +
              `guard a decision: is it a disposal or is it occupancy?`,
          ).not.toMatch(/UNCLASSIFIED/);
          expect(error).toContain(reserved ? `${PROBE_BLOCKED}[42501]` : PROBE_SUCCEEDED);
        }
      });

      it('refuses it in a replica session as well', async () => {
        const error = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; ${statusUpdate('SUBSTITUTED_ISTIBDAL')}`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      });

      it('ALLOWS it against the approval that names THIS asset’s status', async () => {
        const error = await runProbe(
          rollbackProbeSql([
            `PERFORM set_config('${guc}', '${APPROVAL.assetStatus}', true)`,
            statusUpdate('SUBSTITUTED_ISTIBDAL'),
          ]),
        );
        expect(error).toContain(PROBE_SUCCEEDED);
        expect(error).not.toMatch(/RESERVED MATTER/);
      });

      it('refuses an approval that names a DIFFERENT ASSET — the exit clause’s new half', async () => {
        // This is the assertion the exit criterion calls "the new half": an approval for one subject
        // must not be a key for another. `appr-test-9402` is genuine, APPROVED, RESERVED_MATTER, on
        // the same endowment — and it is about asset-004.
        const error = await runProbe(
          guardProbeSql(
            `PERFORM set_config('${guc}', '${APPROVAL.otherAssetStatus}', true); ${statusUpdate('EXPROPRIATED')}`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/was approved for subject/);
        expect(error).toMatch(/asset:asset-004:status/);
      });

      it('refuses an approval that names a DIFFERENT ACT on the SAME asset', async () => {
        // The finest-grained version, and the one a coarser fix would miss: `appr-test-9403` is about
        // asset-005's TITLE DEED. It must not authorise disposing of it.
        const error = await runProbe(
          guardProbeSql(
            `PERFORM set_config('${guc}', '${APPROVAL.assetTitleDeed}', true); ${statusUpdate('EXPROPRIATED')}`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/was approved for subject/);
      });

      it('leaves the titleDeedNumber half of the guard intact (D-5 regression)', async () => {
        // Migration 12 REPLACED `qmulate_asset_identity_guard()`'s body to add the status half, and
        // migration 13 replaced it AGAIN to re-key that half on the type. The half that was already
        // there is the corpus asset's legal identity, and a replacement is exactly when it
        // disappears — twice over now.
        const error = await runProbe(
          guardProbeSql(
            `UPDATE "asset" SET "titleDeedNumber" = 'FAKE-REPOINTED' WHERE "id" = '${ASSET_ID}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/titleDeedNumber/);
        expect(error).toMatch(/reserved-matter-only/);
      });

      it('leaves an ORDINARY status change alone — only moves INTO a reserved value are gated', async () => {
        // Gating every status write would make a mis-keyed status permanently un-correctable, and
        // moving back OUT of a reserved value disposes of nothing. Occupancy is property management.
        const error = await runProbe(rollbackProbeSql([statusUpdate('PARTIALLY_RENTED')]));
        expect(error).toContain(PROBE_SUCCEEDED);
      });

      it('wrote no receipt and no Transaction — istibdal proceeds are CORPUS, not income', async () => {
        const prisma = await privilegedPrisma();
        const [asset] = await prisma.$queryRawUnsafe<{ status: string }[]>(
          `SELECT "status" FROM "asset" WHERE "id" = '${ASSET_ID}'`,
        );
        expect(asset?.status, 'a probe changed the corpus asset’s status for real').toBe('ACTIVE');
        // The fixture ships 8 transactions (5 → 7 in S5/E4 with rev-003 and the CAPITAL rev-004,
        // → 8 in S7 with rev-005, waqf-001's own CAPITAL istibdal-proceeds row); recording a
        // reserved ACT must not add one. E5 owns the ledger path, and a capital receipt stays
        // blocked from the distribution waterfall.
        //
        // ⚠ THIS COUNT IS THE PROBE'S CONTROL, NOT A FIXTURE FACT, so it is an absolute rather
        // than a delta on purpose: the claim is "the reserved-act probe wrote nothing". It
        // therefore moves with every fixture ledger row and has to be re-measured, not adjusted by
        // arithmetic. MEASURED at 9 from the seed's own report (`Transaction 9`) on a fresh
        // `--reset` → `migrate deploy` → one seed (M1-b: rev-006 joined the ledger; was 8).
        expect(await prisma.transaction.count()).toBe(9);
      });
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 5b. THE **BIRTH** ARM — AV3-02, AV3-03, AV3-04 (S4/E3 round 3)
    //
    // ── WHAT THIS BLOCK REPLACES, AND WHY IT IS A TEST RATHER THAN A `todo` ─────────────────────
    // Until migration 14 this section ended in an `it.todo` reading, verbatim: *"SURFACED, NOT
    // RESOLVED — AN ASSET CAN STILL BE **BORN** IN A RESERVED STATE. `asset_identity_guard` is
    // `BEFORE UPDATE` only … an `INSERT INTO "asset" … status = 'EXPROPRIATED'` with no approval in
    // the session COMMITS. That is C-10's exact shape, one table over … Closing it is a migration …
    // REPORTED."* Migration 14 widened the trigger and migration 15 finished the arm, so leaving the
    // `todo` standing would be a FALSE CLAIM IN SHIPPED SOURCE — the same treatment
    // `guard-verb-coverage`'s "CLOSED in migration 5" test gave its own predecessor. It is inverted,
    // not deleted (INCIDENT-1's lesson), and its text survives above.
    //
    // ── WHY THE ROUND-2 "MUTATION PROOF" DID NOT COVER THIS (AV3-02) ────────────────────────────
    // Round 2 shipped the widening with ONE mutation probe, in `guard-verb-coverage`: it narrowed
    // the trigger back to `BEFORE UPDATE` and watched CENSUS-2's verb rule go red. That proves the
    // CENSUS works. It says nothing about the guard, because the census reads `pg_trigger.tgtype`
    // and never issues a single INSERT — the arm could have been an empty `IF TG_OP = 'INSERT' THEN
    // RETURN NEW; END IF;` and the census would have been just as green. Behaviour is asserted here.
    //
    // ── AND A GUARD THAT REFUSES EVERYTHING IS AN OUTAGE, NOT A CONTROL ─────────────────────────
    // Every refusal below is paired with the PERMIT it must not swallow: an ORDINARY birth, and the
    // reserved birth WITH a genuine artifact-bound approval in session. Without those pairs this
    // section would be satisfied by a guard that simply refuses every `asset` INSERT, which would
    // stop the seed, the intake flow and E4 alike.
    //
    // ⚠ NOTHING HERE COMMITS. `asset_no_delete` refuses the hard DELETE of a corpus parcel
    // (migration 6, the non-diminution invariant), so a committed test asset could never be removed.
    // Every probe is a `DO` block that raises, or a `guardOutcome()` transaction that throws.
    // ═══════════════════════════════════════════════════════════════════════════════════════

    describe('asset_identity_guard · the BIRTH arm (AV3-02 / AV3-03 / AV3-04)', () => {
      const RESERVED_STATUSES = ['EXPROPRIATED', 'SUBSTITUTED_ISTIBDAL'] as const;
      const ORDINARY_STATUSES = ['ACTIVE', 'FULLY_RENTED', 'PARTIALLY_RENTED', 'VACANT'] as const;

      /** Narrows the trigger back to migration 13's verb — the AV3-02 mutation, exactly. */
      const NARROW_TO_UPDATE_ONLY: readonly string[] = [
        `DROP TRIGGER asset_identity_guard ON "asset"`,
        `CREATE TRIGGER asset_identity_guard BEFORE UPDATE ON "asset"
           FOR EACH ROW EXECUTE FUNCTION qmulate_asset_identity_guard()`,
        `ALTER TABLE "asset" ENABLE ALWAYS TRIGGER asset_identity_guard`,
      ];

      afterAll(async () => {
        // The whole point of this block is that it creates no corpus. `asset_no_delete` would make a
        // leak permanent, so the count is asserted rather than cleaned up — there is no cleanup.
        const prisma = await privilegedPrisma();
        expect(
          await prisma.asset.count({ where: { id: { startsWith: 'asset-9' } } }),
          'a BIRTH probe COMMITTED an asset row. asset_no_delete makes that permanent.',
        ).toBe(0);
      });

      // ─────────────────────────────────────────────────────────────────────────────────────
      // AV3-02 · A ROW MAY NOT BE BORN IN A RESERVED STATUS
      // ─────────────────────────────────────────────────────────────────────────────────────

      it('refuses an INSERT in EVERY reserved status, with no approval', async () => {
        for (const status of RESERVED_STATUSES) {
          const error = await runProbe(
            guardProbeSql(insertAssetSql({ id: BORN_ASSET, status }), 'insufficient_privilege'),
          );
          expect(error, `an asset can still be BORN "${status}" — AV3-02/AV-5 is open`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
          expect(error).toMatch(/may not be CREATED already in status/);
          // The refusal must name the subject an approval has to carry, or the caller cannot comply.
          expect(error).toMatch(new RegExp(`asset:${BORN_ASSET}:status`));
          // …and it must point at the transcription route, or an intake of a historically disposed
          // parcel looks impossible and somebody removes the guard instead.
          expect(error).toMatch(/TRANSCRIBING HISTORY IS STILL POSSIBLE/);
          // Binding rule 1, in the refusal itself.
          expect(error).toMatch(/CORPUS/);
          expect(error).toMatch(/receiptClass = CAPITAL/);
        }
      });

      it('ALLOWS the birth against an approval that names THIS asset’s status', async () => {
        // A guard that refuses every reserved birth would make an intake impossible and would be
        // switched off. The legal path has to work, and it has to work for the RIGHT reason.
        const outcome = await guardOutcome(
          [`SELECT set_config('${guc}', '${APPROVAL.birthStatus}', true)`],
          insertAssetSql({ id: BORN_ASSET, status: 'EXPROPRIATED' }),
        );
        expect(
          outcome,
          'the reserved birth is refused even WITH its approval — this is an outage',
        ).toBe(GUARD_OUTCOME_COMMITTED);
      });

      it('refuses the birth against an approval for a DIFFERENT ACT on the same asset', async () => {
        // The finest-grained version, and the one a coarser gate would miss: `appr-test-9406` is a
        // genuine, APPROVED, maker ≠ checker RESERVED_MATTER on this endowment — about `deletedAt`.
        const error = await runProbe(
          guardProbeSql(
            `PERFORM set_config('${guc}', '${APPROVAL.birthDeletedAt}', true); ` +
              insertAssetSql({ id: BORN_ASSET, status: 'EXPROPRIATED' }),
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/was approved for subject/);
        expect(error).toMatch(new RegExp(`asset:${BORN_ASSET}:deletedAt`));
      });

      it('refuses the birth against an approval for a DIFFERENT ENDOWMENT’s asset', async () => {
        const error = await runProbe(
          guardProbeSql(
            `PERFORM set_config('${guc}', '${APPROVAL.otherAssetStatus}', true); ` +
              insertAssetSql({ id: BORN_ASSET, status: 'SUBSTITUTED_ISTIBDAL' }),
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/was approved for subject/);
        expect(error).toMatch(/asset:asset-004:status/);
      });

      it('refuses the reserved birth in a replica session as well', async () => {
        const error = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; ` +
              insertAssetSql({ id: BORN_ASSET, status: 'EXPROPRIATED' }),
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/may not be CREATED already in status/);
      });

      it('leaves EVERY ordinary status ungated on birth — occupancy is property management', async () => {
        for (const status of ORDINARY_STATUSES) {
          const error = await runProbe(
            rollbackProbeSql([insertAssetSql({ id: BORN_ASSET, status })]),
          );
          expect(
            error,
            `an asset can no longer be created "${status}" — the guard is an outage`,
          ).toContain(PROBE_SUCCEEDED);
        }
      });

      it('classifies EVERY member of the live enum ON INSERT — ADR-0004’s halt branch again', async () => {
        // The UPDATE arm has this assertion already; the INSERT arm is a SECOND copy of the same
        // partition in the same function, and a seventh enum value would have to be added to BOTH.
        // Driven through the database, over the LIVE catalogue, so a member nobody wrote down fails
        // here rather than becoming an ungated birth.
        const prisma = await privilegedPrisma();
        const members = await prisma.$queryRawUnsafe<{ label: string }[]>(
          `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'AssetStatus' ORDER BY e.enumsortorder`,
        );
        expect(members.length).toBe(RESERVED_STATUSES.length + ORDINARY_STATUSES.length);

        for (const { label } of members) {
          const reserved = (RESERVED_STATUSES as readonly string[]).includes(label);
          const error = reserved
            ? await runProbe(
                guardProbeSql(
                  insertAssetSql({ id: BORN_ASSET, status: label }),
                  'insufficient_privilege',
                ),
              )
            : await runProbe(rollbackProbeSql([insertAssetSql({ id: BORN_ASSET, status: label })]));
          expect(
            error,
            `"${label}" is in neither of qmulate_asset_identity_guard()'s two arrays on the INSERT ` +
              `arm — it HALTS (ADR-0004) instead of being classified.`,
          ).not.toMatch(/UNCLASSIFIED/);
          expect(error).toContain(reserved ? `${PROBE_BLOCKED}[42501]` : PROBE_SUCCEEDED);
        }
      });

      it('MUTATION · with the trigger back at `BEFORE UPDATE`, the very same INSERT COMMITS', async () => {
        // ⚠ THIS IS THE PROOF ROUND 2 DID NOT HAVE. Its mutation changed the trigger's VERB and
        // watched the VERB census go red — which proves the census works, not the guard. Here the
        // identical statement is run twice on one connection: once against the shipped guard, once
        // against the guard narrowed back to migration 13's `BEFORE UPDATE`, inside a transaction
        // that rolls the DDL back with everything else.
        const statement = insertAssetSql({ id: BORN_ASSET, status: 'EXPROPRIATED' });

        const shipped = await guardOutcome([], statement);
        expect(
          shipped,
          'AV3-02 is open: the reserved birth committed against the SHIPPED guard',
        ).not.toBe(GUARD_OUTCOME_COMMITTED);
        expect(shipped).toMatch(/may not be CREATED already in status/);

        const mutated = await guardOutcome(NARROW_TO_UPDATE_ONLY, statement);
        expect(
          mutated,
          'the trigger was narrowed to BEFORE UPDATE and the reserved birth was STILL refused — ' +
            'so the assertion above is not measuring the INSERT arm at all',
        ).toBe(GUARD_OUTCOME_COMMITTED);

        // …and the guard is back, because the transaction rolled back.
        const prisma = await privilegedPrisma();
        const [row] = await prisma.$queryRawUnsafe<{ verbs: string; enabled: string }[]>(
          `SELECT CASE WHEN (tgtype & 4) > 0 THEN 'I' ELSE '' END ||
                  CASE WHEN (tgtype & 16) > 0 THEN 'U' ELSE '' END AS verbs,
                  tgenabled::text AS enabled
             FROM pg_trigger WHERE tgname = 'asset_identity_guard' AND NOT tgisinternal`,
        );
        expect(row?.verbs).toBe('IU');
        expect(row?.enabled).toBe('A');
      });

      // ─────────────────────────────────────────────────────────────────────────────────────
      // AV3-03 · THE SAME SHAPE, ONE COLUMN OVER — A PARCEL MAY NOT BE BORN ALREADY RETIRED
      //
      // MEASURED BEFORE migration 15, as `qmulate_app` with no approval in session, on a database
      // with migration 14 applied:
      //   COMMITS  INSERT INTO "asset" (… "status", "deletedAt") VALUES (…, 'ACTIVE', now())
      //   REFUSED  UPDATE "asset" SET "deletedAt" = now() WHERE "id" = 'asset-005'   (42501)
      // Migration 14 gated the column on UPDATE and gave the new INSERT arm only the `status`; its
      // own comment said "Nothing else on INSERT … `deletedAt` [is] a question about a CHANGE",
      // which is true of `titleDeedNumber` and `waqfId` and FALSE of this one.
      // ─────────────────────────────────────────────────────────────────────────────────────

      it('refuses a parcel BORN already soft-retired, with no approval', async () => {
        const error = await runProbe(
          guardProbeSql(
            insertAssetSql({ id: BORN_ASSET, status: 'ACTIVE', deletedAt: 'now()' }),
            'insufficient_privilege',
          ),
        );
        expect(error, 'a corpus parcel can still be BORN retired — AV3-03 is open').toContain(
          `${PROBE_BLOCKED}[42501]`,
        );
        expect(error).toMatch(/may not be CREATED already RETIRED/);
        expect(error).toMatch(new RegExp(`asset:${BORN_ASSET}:deletedAt`));
        expect(error).toMatch(/TRANSCRIBING HISTORY IS STILL POSSIBLE/);
        // ⚠ THE `TODO(surface)` IS PINNED, NOT DECORATIVE. Whether EVERY retirement of a corpus
        // parcel is a reserved matter is the PRODUCT OWNER'S question (migration 14 §1c, carried
        // forward by migration 15 §1(0b)). A refusal that quietly lost that caveat would be a scope
        // ruling this repo is not entitled to make, so whoever gets the owner's answer must edit
        // this assertion deliberately.
        expect(error).toMatch(/TODO\(surface\)/);
        expect(error).toMatch(/PRODUCT OWNER/);
      });

      it('ALLOWS the retired birth against an approval that names THIS asset’s deletedAt', async () => {
        const outcome = await guardOutcome(
          [`SELECT set_config('${guc}', '${APPROVAL.birthDeletedAt}', true)`],
          insertAssetSql({ id: BORN_ASSET, status: 'ACTIVE', deletedAt: 'now()' }),
        );
        expect(outcome).toBe(GUARD_OUTCOME_COMMITTED);
      });

      it('refuses it against the STATUS approval — one approved act is not a licence for another', async () => {
        const error = await runProbe(
          guardProbeSql(
            `PERFORM set_config('${guc}', '${APPROVAL.birthStatus}', true); ` +
              insertAssetSql({ id: BORN_ASSET, status: 'ACTIVE', deletedAt: 'now()' }),
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/may not be CREATED already RETIRED/);
        expect(error).toMatch(/was approved for subject/);
      });

      it('refuses the retired birth in a replica session as well', async () => {
        const error = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; ` +
              insertAssetSql({ id: BORN_ASSET, status: 'ACTIVE', deletedAt: 'now()' }),
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/may not be CREATED already RETIRED/);
      });

      it('leaves an ordinary LIVE birth alone — `deletedAt` NULL is ungated', async () => {
        const error = await runProbe(
          rollbackProbeSql([insertAssetSql({ id: BORN_ASSET, status: 'ACTIVE' })]),
        );
        expect(error).toContain(PROBE_SUCCEEDED);
      });

      it('MUTATION · deleting the birth-side `deletedAt` branch lets the retired birth COMMIT', async () => {
        // A TARGETED mutation of the SHIPPED body, not of the trigger's verb: the live definition is
        // read from `pg_get_functiondef`, its one `IF NEW."deletedAt" IS NOT NULL THEN` is turned
        // into `IF false THEN`, and the replacement is installed inside the same rolled-back
        // transaction. `assetGuardBodyWithout()` throws if that string is not present exactly once,
        // so a mutation that silently changed nothing cannot read as a pass.
        const statement = insertAssetSql({ id: BORN_ASSET, status: 'ACTIVE', deletedAt: 'now()' });
        const withoutBranch = await assetGuardBodyWithout('IF NEW."deletedAt" IS NOT NULL THEN');

        const shipped = await guardOutcome([], statement);
        expect(shipped).not.toBe(GUARD_OUTCOME_COMMITTED);
        expect(shipped).toMatch(/may not be CREATED already RETIRED/);

        const mutated = await guardOutcome([withoutBranch], statement);
        expect(
          mutated,
          'the birth-side deletedAt branch was removed and the retired birth was STILL refused — ' +
            'something else is answering, and the assertion above measures that instead',
        ).toBe(GUARD_OUTCOME_COMMITTED);

        // The UPDATE arm must be untouched by the rollback, and by the mutation.
        const still = await runProbe(
          guardProbeSql(
            `UPDATE "asset" SET "deletedAt" = now() WHERE "id" = '${ASSET_ID}'`,
            'insufficient_privilege',
          ),
        );
        expect(still).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(still).toMatch(/is a RESERVED MATTER/);
      });

      // ─────────────────────────────────────────────────────────────────────────────────────
      // AV3-04 · `waqfId` — REFUSED OUTRIGHT, AND UNTESTED UNTIL NOW
      //
      // Migration 14 shipped this refusal with ZERO test coverage: it was verified by reading the
      // SQL. It is the branch that stops one founder's corpus from becoming another's in a single
      // statement, so "we read it and it looks right" is not an acceptable standard for it.
      // ─────────────────────────────────────────────────────────────────────────────────────

      it('refuses re-pointing a parcel at another endowment — outright, not gated', async () => {
        const error = await runProbe(
          guardProbeSql(
            `UPDATE "asset" SET "waqfId" = 'waqf-002' WHERE "id" = 'asset-001'`,
            'insufficient_privilege',
          ),
        );
        expect(error, 'one founder’s corpus can still become another’s — AV3-04 is open').toContain(
          `${PROBE_BLOCKED}[42501]`,
        );
        expect(error).toMatch(/may NEVER be changed/);
        // Both endowments must be named, or the reader cannot see what was attempted.
        expect(error).toMatch(/waqf-001/);
        expect(error).toMatch(/waqf-002/);
        // Binding rule 1 by name, and the two acts a genuine move would have to record.
        expect(error).toMatch(/distribute, erode or reclassify corpus/);
        expect(error).toMatch(/DISPOSAL/);
        expect(error).toMatch(/ACQUISITION/);
      });

      it('refuses it EVEN WITH a genuine reserved-matter approval in session', async () => {
        // ⚠ THE ASSERTION THAT DISTINGUISHES "REFUSED OUTRIGHT" FROM "GATED". `appr-test-9401` is
        // APPROVED, maker ≠ checker, RESERVED_MATTER, on this endowment. If a later change turned
        // this branch into a `qmulate_reserved_matter_defect()` gate, every other test here would
        // still pass and this one would not.
        const error = await runProbe(
          guardProbeSql(
            `PERFORM set_config('${guc}', '${APPROVAL.assetStatus}', true); ` +
              `UPDATE "asset" SET "waqfId" = '${RECORDED_WAQF}' WHERE "id" = 'asset-005'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/No approval, GUC value or migration opens this/);
      });

      it('refuses it in a replica session as well', async () => {
        const error = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; ` +
              `UPDATE "asset" SET "waqfId" = 'waqf-002' WHERE "id" = 'asset-001'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/may NEVER be changed/);
      });

      it('leaves a NO-OP `waqfId` write alone — only a MOVE is refused', async () => {
        // `IS DISTINCT FROM`, not "the column appears in the SET list". An ordinary update that
        // happens to re-state the same endowment must not become un-writable.
        const error = await runProbe(
          rollbackProbeSql([
            `UPDATE "asset" SET "waqfId" = 'waqf-001', "addressEn" = 'Probe' WHERE "id" = 'asset-001'`,
          ]),
        );
        expect(error).toContain(PROBE_SUCCEEDED);
      });

      it('MUTATION · deleting the `waqfId` branch lets one founder’s corpus become another’s', async () => {
        const statement = `UPDATE "asset" SET "waqfId" = 'waqf-002' WHERE "id" = 'asset-001'`;
        const withoutBranch = await assetGuardBodyWithout(
          'IF NEW."waqfId" IS DISTINCT FROM OLD."waqfId" THEN',
        );

        const shipped = await guardOutcome([], statement);
        expect(shipped).not.toBe(GUARD_OUTCOME_COMMITTED);
        expect(shipped).toMatch(/may NEVER be changed/);

        const mutated = await guardOutcome([withoutBranch], statement);
        expect(
          mutated,
          'the waqfId branch was removed and the move was STILL refused — an FK or another branch ' +
            'is answering, so the assertion above is not measuring this guard',
        ).toBe(GUARD_OUTCOME_COMMITTED);
      });

      it('left asset-001 in waqf-001 and asset-005 ACTIVE and live', async () => {
        const prisma = await privilegedPrisma();
        const rows = await prisma.$queryRawUnsafe<
          { id: string; waqfId: string; status: string; deletedAt: Date | null }[]
        >(
          `SELECT "id", "waqfId", "status"::text AS status, "deletedAt"
             FROM "asset" WHERE "id" IN ('asset-001', '${ASSET_ID}') ORDER BY "id"`,
        );
        expect(rows.map((row) => [row.id, row.waqfId, row.status, row.deletedAt])).toEqual([
          ['asset-001', 'waqf-001', 'ACTIVE', null],
          [ASSET_ID, UNRECORDED_WAQF, 'ACTIVE', null],
        ]);
      });
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 6. THE SAME REFUSALS, AS `qmulate_app` — THE ROLE EVERY ONE OF THESE DEFECTS WAS FOUND ON
    //
    // Sections 1–5 make the OWNER-side claim ("even the table owner cannot"), which is what
    // `runProbe()` is for and why it is bound to the privileged connection. This section makes the
    // OTHER one, and it is the one the V-E3 register's findings are written in: the LEAST-PRIVILEGED
    // runtime role — the role `DATABASE_URL` actually connects as in production — is refused, BY THE
    // GUARD and not by a missing GRANT.
    //
    // Read `runRestrictedProbe`'s header before touching anything here. The short version: the app
    // role HOLDS the privilege in every case below (proved by the two controls), so a 42501 can only
    // be the guard, and each assertion rules the ACL out by name anyway.
    //
    // ⚠ EVERY STATEMENT IS STILL INSIDE A `DO` BLOCK THAT RAISES. A committed write here would be as
    // unrecoverable as anywhere else in this file.
    // ═══════════════════════════════════════════════════════════════════════════════════════

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 7. TIER 2b — RETIRING THE ENDOWMENT IS A RESERVED MATTER, BOTH DIRECTIONS (memo Q8)
    //
    // THE OWNER'S RULING, 2026-08-17 (S4 owner-decision memo Q8, option (a)): *"Setting (and
    // clearing) `waqf.deletedAt` on a live endowment requires an approved reserved-matter request."*
    // S4 left A3 open DELIBERATELY — migration 16's header says so — because whether retiring an
    // endowment is ALWAYS reserved is a scope question. It was asked and answered, so tier 2b carries
    // NO `TODO(surface)`.
    //
    // MEASURED BEFORE MIGRATION 17, as `qmulate_app` with no approval, each probe rolled back:
    //   ⚠ COMMITS  UPDATE "waqf" SET "deletedAt" = now()  WHERE "id" = 'waqf-001'
    //   ⚠ COMMITS  …and the CLEAR straight after it: SET "deletedAt" = NULL
    //     REFUSED   the CONTROL on the same row, same role: SET "shartAlWaqifVersion" = 2  (42501)
    //
    // ⚠ A GUARD THAT REFUSES EVERYTHING IS AN OUTAGE, NOT A CONTROL, so the PERMIT arm is asserted
    // for BOTH directions with a genuine approval, and an ordinary `waqf` write is asserted to still
    // commit. And the refusals are proven against a caller who does NOT also forge an approval:
    // AV4-02 (qmulate_app can mint its own APPROVED reserved matter and spend it in the same
    // transaction) is OPEN BY DESIGN as ADR-0008's work, and it qualifies every reserved-matter
    // refusal in this repository, this section included.
    // ═══════════════════════════════════════════════════════════════════════════════════════

    describe('tier 2b · retiring the endowment (memo Q8)', () => {
      const RETIRE = (waqfId: string): string =>
        `UPDATE "waqf" SET "deletedAt" = now() WHERE "id" = '${waqfId}'`;
      const UNRETIRE = (waqfId: string): string =>
        `UPDATE "waqf" SET "deletedAt" = NULL WHERE "id" = '${waqfId}'`;

      it('refuses the RETIREMENT with no approval, and names the subject an approval must carry', async () => {
        const error = await runProbe(
          guardProbeSql(RETIRE(RECORDED_WAQF), 'insufficient_privilege'),
        );
        expect(error, 'an endowment can still be soft-retired with no approval').toContain(
          `${PROBE_BLOCKED}[42501]`,
        );
        expect(error).toMatch(/RESERVED MATTER/);
        // The caller cannot comply with a gate that will not say what to ask for.
        expect(error).toMatch(new RegExp(`waqf:${RECORDED_WAQF}:deletedAt`));
        // The refusal must carry the RULING, so nobody later reads this as engineering's caution.
        expect(error).toMatch(/PRODUCT OWNER, 2026-08-17/);
        expect(error).toMatch(/memo Q8/);
        // …and the reason a Nazir would need: perpetuity, and what a retirement removes.
        expect(error).toMatch(/PERPETUAL/);
        expect(error).toMatch(/waqf_no_delete/);
      });

      it('refuses it for the LEAST-PRIVILEGED role too — the role the register measured', async () => {
        const error = await runRestrictedProbe(
          guardProbeSql(RETIRE(RECORDED_WAQF), 'insufficient_privilege'),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/RESERVED MATTER/);
        expectRefusedByGuardNotAcl(error);
      });

      it('refuses it in a replica session — one plain SET must not skip it', async () => {
        const error = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; ${RETIRE(RECORDED_WAQF)}`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/RESERVED MATTER/);
      });

      it('PERMITS the retirement against an approval that names THIS endowment’s deletedAt', async () => {
        const outcome = await guardOutcome(
          [`SELECT set_config('${guc}', '${APPROVAL.waqfDeletedAt}', true)`],
          RETIRE(UNRECORDED_WAQF),
        );
        expect(
          outcome,
          'the retirement is refused even WITH its approval — that is an outage, not a control',
        ).toBe(GUARD_OUTCOME_COMMITTED);
      });

      it('PERMITS the UN-retirement on the same approval — one act, two directions', async () => {
        // The clear is the direction a naive "only gate the set" guard leaves open, and it is the one
        // that puts an endowment back into every register with no act behind it.
        const outcome = await guardOutcome(
          [
            `SELECT set_config('${guc}', '${APPROVAL.waqfDeletedAt}', true)`,
            RETIRE(UNRECORDED_WAQF),
          ],
          UNRETIRE(UNRECORDED_WAQF),
        );
        expect(outcome).toBe(GUARD_OUTCOME_COMMITTED);
      });

      it('refuses the UN-retirement once the approval leaves the session', async () => {
        // The same row, already retired inside this transaction WITH authority; the clear then
        // arrives without one. This is the "value -> NULL" half stated as behaviour rather than as a
        // claim about the SQL.
        const outcome = await guardOutcome(
          [
            `SELECT set_config('${guc}', '${APPROVAL.waqfDeletedAt}', true)`,
            RETIRE(UNRECORDED_WAQF),
            `SELECT set_config('${guc}', '', true)`,
          ],
          UNRETIRE(UNRECORDED_WAQF),
        );
        expect(outcome, 'an endowment was silently restored to every register').not.toBe(
          GUARD_OUTCOME_COMMITTED,
        );
        expect(outcome).toMatch(/RESERVED MATTER/);
        expect(outcome).toMatch(/no approval id was supplied/);
      });

      it('refuses an approval for ANOTHER ACT on the same endowment (the artifact bind)', async () => {
        // `appr-test-9408` is genuine, APPROVED, maker ≠ checker, on THIS endowment — and about its
        // certificate number. One approved act is not a licence for another (C-14).
        const error = await runProbe(
          guardProbeSql(
            `PERFORM set_config('${guc}', '${APPROVAL.waqfCertificate}', true); ${RETIRE(UNRECORDED_WAQF)}`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/was approved for subject/);
        expect(error).toMatch(new RegExp(`waqf:${UNRECORDED_WAQF}:certificateNumber`));
      });

      it('refuses an approval belonging to a DIFFERENT endowment', async () => {
        // `appr-test-9404` is on waqf-001 and this retirement is of waqf-003. Authority is per
        // endowment, and the message has to say which one.
        const error = await runProbe(
          guardProbeSql(
            `PERFORM set_config('${guc}', '${APPROVAL.deedTerm}', true); ${RETIRE(UNRECORDED_WAQF)}`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/belongs to waqf|was approved for subject/);
      });

      it('CONTROL · an ordinary waqf write still commits — the gate is one column wide', async () => {
        const error = await runRestrictedProbe(
          rollbackProbeSql([
            `UPDATE "waqf" SET "fiscalYearEnd" = '06-30' WHERE "id" = '${RECORDED_WAQF}'`,
          ]),
        );
        expect(error, 'tier 2b has taken the whole table with it').toContain(PROBE_SUCCEEDED);
      });

      it('MUTATION · with tier 2b disabled, the very same retirement COMMITS', async () => {
        // The assertion that makes this section load-bearing rather than decorative: the identical
        // statement, twice on one connection, once against the shipped guard and once against the
        // guard with tier 2b's single `IF` turned into `IF false THEN` — the live body read from
        // `pg_get_functiondef`, inside a transaction that rolls the DDL back with everything else.
        const shipped = await guardOutcome([], RETIRE(RECORDED_WAQF));
        expect(shipped, 'A3 is open: the retirement committed against the SHIPPED guard').not.toBe(
          GUARD_OUTCOME_COMMITTED,
        );
        expect(shipped).toMatch(/RESERVED MATTER/);

        const withoutTier2b = await guardBodyWithout(
          'qmulate_shart_guard()',
          'IF NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" THEN',
        );
        const mutated = await guardOutcome([withoutTier2b], RETIRE(RECORDED_WAQF));
        expect(
          mutated,
          'tier 2b was disabled and the retirement was STILL refused — so the assertions above are ' +
            'not measuring tier 2b at all',
        ).toBe(GUARD_OUTCOME_COMMITTED);

        // …and the guard is back, because the transaction rolled back.
        const prisma = await privilegedPrisma();
        const [row] = await prisma.$queryRawUnsafe<{ src: string }[]>(
          `SELECT prosrc AS src FROM pg_proc WHERE proname = 'qmulate_shart_guard'`,
        );
        expect(row?.src ?? '').toContain(
          'IF NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" THEN',
        );
      });

      it('tier 2b is decided AFTER the GUC read and tier 1 is still decided BEFORE it', async () => {
        // ORDER IS PART OF THE CONTRACT (migration 13 §2a / 14 §1a). Tier 2b is a RESERVED-MATTER
        // gate, so it must sit below the `current_setting` call — while tier 1's raise must stay
        // above it, because no approval may ever reach a founder's condition. One assertion, both
        // halves, against the function's own source.
        const prisma = await privilegedPrisma();
        const [row] = await prisma.$queryRawUnsafe<{ src: string }[]>(
          `SELECT prosrc AS src FROM pg_proc WHERE proname = 'qmulate_shart_guard'`,
        );
        const source = row?.src ?? '';
        expect(source, 'qmulate_shart_guard() is not installed').not.toBe('');
        const shartRaise = source.indexOf('shart_al_waqif is immutable');
        const gucRead = source.indexOf('current_setting');
        const tier2b = source.indexOf('IF NEW."deletedAt" IS DISTINCT FROM OLD."deletedAt" THEN');
        expect(shartRaise).toBeGreaterThan(-1);
        expect(tier2b, 'tier 2b is missing from the guard body').toBeGreaterThan(-1);
        expect(shartRaise, 'the tier-1 raise must still come first').toBeLessThan(gucRead);
        expect(
          tier2b,
          'a reserved-matter gate cannot be decided before its GUC is read',
        ).toBeGreaterThan(gucRead);
      });
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 8. `trusteeship_deed_no_update` — A RECORDED APPOINTMENT IS WRITE-ONCE FOR EVERY SEAT (memo Q10)
    //
    // THE OWNER'S WORDS, 2026-08-17 (memo Q10), verbatim: *"the trusteeship deed can only be editted
    // by a court judge."*
    //
    // ⚠ WHAT THIS SECTION PROVES IS ENGINEERING'S RENDERING OF THAT SENTENCE, AND THE RENDERING IS
    // FLAGGED — in the migration, in the refusal message, and here. A judge is not a system user, so
    // "editable by a court judge" cannot be a permission; it is rendered as *no seat may edit a
    // recorded deed, and a court-ordered change enters as a NEW SUPERSEDING RECORD carrying the court
    // instrument* — the ADR-0006 convention. The conversion of "edit" into "supersede" is
    // engineering's and is reported for the owner's confirmation; the guard existing does NOT retire
    // that flag.
    //
    // ⚠ AND THE RENDERED REMEDY IS NOT REACHABLE IN THIS SCHEMA — `trusteeship_deed."waqfId"` is
    // UNIQUE, so one endowment holds exactly one deed row, and no column links a superseding record
    // to the one it supersedes or names the court instrument. The refusal SAYS so, and the last test
    // in this section pins that honesty clause so it cannot quietly rot into a false promise.
    //
    // MEASURED BEFORE MIGRATION 17, as `qmulate_app` with no approval, each probe rolled back:
    //   ⚠ COMMITS  SET "primaryNazir" = 'REWRITTEN'            ← WHO holds the nazarah
    //   ⚠ COMMITS  SET "ksaResident" = false                   ← a BR-109/NFR-09 eligibility flag
    //   ⚠ COMMITS  SET "authorizedRepName" = …, "jointlyLiable" = false
    //   ⚠ COMMITS  SET "deletedAt" = now()
    //     REFUSED   the CONTROL: SET "id" = 'trust-9901'  → `trusteeship_deed_id_immutable`
    //
    // ── ⚠ AND THE SEAL IS COLUMN-CLASSIFIED SINCE MIGRATION 18 (AV5-02, HIGH) ─────────────────
    // Migration 17 sealed the WHOLE ROW on the ground that "there is no column here that is not part
    // of the appointment". That was wrong about THIRTEEN columns, and it made a REGULATORY OBLIGATION
    // UNRECORDABLE: `deed.upsert` is the only path that writes the BR-109/NFR-09 eligibility
    // verification, its UPDATE branch died on every existing appointment (MEASURED through
    // `createCaller`: `INTERNAL_SERVER_ERROR`, `eligibilityVerifiedAt` still null), and all five
    // seeded deeds carry that stamp as NULL. `TrusteeshipDeed`'s own schema comment says *"Partial
    // assessment is legal; intake learns these one at a time"* — and learning one at a time is an
    // UPDATE.
    //
    // So the classification is now: DEED FACTS sealed for every seat (this describe block's `EDITS`,
    // unchanged); `updatedAt` bookkeeping (the permit arm, unchanged); and the THIRTEEN ASSESSMENT
    // columns of `qmulate_trusteeship_deed_assessment_columns()` writable ONLY as a recorded
    // verification event — the sibling describe block below. `eligibilityVerifiedAt` MOVED OUT of
    // `EDITS` for that reason and is re-pinned there with STRICTLY MORE assertions than the one it
    // had here (it was `SET "eligibilityVerifiedAt" = now()` expecting the WRITE-ONCE message; it is
    // now four probes about what a verification event must carry).
    //
    // ⚠ THE LINE BETWEEN "DEED FACT" AND "OUR ASSESSMENT OF THE APPOINTEE" IS ENGINEERING'S READING
    // of the owner's sentence, exactly like the supersede rendering above, and is flagged for his
    // confirmation. Neither flag is retired by these guards existing.
    // ═══════════════════════════════════════════════════════════════════════════════════════

    describe('trusteeship_deed · write-once for every seat (memo Q10)', () => {
      const DEED_WAQF = RECORDED_WAQF;
      const EDITS: readonly (readonly [string, string])[] = [
        ['primaryNazir', `"primaryNazir" = 'REWRITTEN ${FICTIONAL_MARKER_AR}'`],
        ['authorizedRepName', `"authorizedRepName" = 'SUBSTITUTED ${FICTIONAL_MARKER_AR}'`],
        ['jointlyLiable', `"jointlyLiable" = false`],
        ['successorNazir', `"successorNazir" = 'SOMEBODY ELSE ${FICTIONAL_MARKER_AR}'`],
        // ⚠ RETIRING AN APPOINTMENT IS NOT AN ASSESSMENT, so `deletedAt` stays on the sealed side of
        // the line. The memo did not ask about it, and the fail-safe direction is the one that keeps
        // the >= 10-year record (NFR-07) from being soft-deleted by the least-privileged role.
        ['deletedAt', `"deletedAt" = now()`],
      ];

      it.each(EDITS)(
        'refuses an edit to %s, for the least-privileged role',
        async (column, set) => {
          const error = await runRestrictedProbe(
            guardProbeSql(
              `UPDATE "trusteeship_deed" SET ${set} WHERE "waqfId" = '${DEED_WAQF}'`,
              'insufficient_privilege',
            ),
          );
          expect(error, `a recorded appointment's ${column} is still editable`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
          expect(error).toMatch(/WRITE-ONCE FOR EVERY SEAT/);
          // The refusal names the COLUMN — and nothing else about the row. See the guard's own comment:
          // this table carries a named individual and the BR-109 criteria, so values never travel.
          expect(error).toContain(column);
          expect(error).not.toMatch(/REWRITTEN|SUBSTITUTED|SOMEBODY ELSE/);
          expectRefusedByGuardNotAcl(error);
        },
      );

      it('refuses it for the TABLE OWNER as well — "every seat" includes the owner', async () => {
        const error = await runProbe(
          guardProbeSql(
            `UPDATE "trusteeship_deed" SET "primaryNazir" = 'OWNER EDIT' WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/WRITE-ONCE FOR EVERY SEAT/);
      });

      it('refuses it in a replica session', async () => {
        const error = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; ` +
              `UPDATE "trusteeship_deed" SET "primaryNazir" = 'REPLICA EDIT' WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/WRITE-ONCE FOR EVERY SEAT/);
      });

      it('refuses it WITH a genuine reserved-matter approval in session — there is no key', async () => {
        // The strongest available form of the claim, and the difference between this guard and tier
        // 2b one section up: retiring an endowment is AUTHORITY-GATED, editing a recorded appointment
        // is REFUSED. `appr-test-9404` is APPROVED, RESERVED_MATTER, maker ≠ checker on waqf-001.
        const error = await runProbe(
          guardProbeSql(
            `PERFORM set_config('${guc}', '${APPROVAL.deedTerm}', true); ` +
              `UPDATE "trusteeship_deed" SET "primaryNazir" = 'APPROVED EDIT' WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/there is no key because there is no lock/);
      });

      it('names the REMEDY, the RULING and the flag — a refusal that only says no teaches a workaround', async () => {
        const error = await runProbe(
          guardProbeSql(
            `UPDATE "trusteeship_deed" SET "primaryNazir" = 'X' WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toMatch(/SUPERSEDING RECORD/i);
        expect(error).toMatch(/court instrument/i);
        expect(error).toMatch(/memo Q10/);
        expect(error).toMatch(/can only be editted by a court judge/);
        // ⚠ THE FLAG ITSELF IS PINNED. The rendering (judge ⇒ superseding recorded instrument) is
        // engineering's, and a later edit that quietly drops the admission would leave a refusal
        // asserting the owner ruled something he did not.
        expect(error).toMatch(/ENGINEERING'S, flagged for the owner/);
        // …and the honesty clause about the remedy being unreachable. If supersession ever lands,
        // THIS assertion is what sends whoever built it back to the message.
        expect(error).toMatch(/NOT YET REACHABLE IN THIS SCHEMA/);
        expect(error).toMatch(/"waqfId" is UNIQUE/);
      });

      it('refuses the DELETE + re-INSERT route as well (C-03, migration 6)', async () => {
        // A write-once row is only write-once while it cannot be replaced wholesale. This is the
        // premise migration 17 §4.5 asserts from the catalogue; here it is the behaviour.
        const error = await runProbe(
          guardProbeSql(
            `DELETE FROM "trusteeship_deed" WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/DELETE on "trusteeship_deed" is refused/);
      });

      it('PERMITS an IDENTICAL re-statement — an UPDATE that changes nothing is not an edit', async () => {
        // ⚠ THE PERMIT ARM, AND IT IS LOAD-BEARING RATHER THAN COSMETIC. The fixture seed is
        // `upsert`-based and re-states all five deeds byte-for-byte on every run; Prisma rewrites
        // `updatedAt` on any update, so the row arrives changed in exactly that one column. If this
        // were refused, the seed would fail on any database that has been seeded once — green on a
        // fresh database, red on a used one, which is the V-E3-04 class. MEASURED: with migration 17
        // applied, `db:seed` re-ran to completion with `TrusteeshipDeed 5` and `audited writes 153`,
        // identical to the pristine run, and the deed rows' `updatedAt` advanced.
        const error = await runRestrictedProbe(
          rollbackProbeSql([
            `UPDATE "trusteeship_deed" SET "primaryNazir" = "primaryNazir", ` +
              `"ksaResident" = "ksaResident", "updatedAt" = now() WHERE "waqfId" = '${DEED_WAQF}'`,
          ]),
        );
        expect(
          error,
          'an identical re-statement is refused — the fixture seed cannot run twice, and that is ' +
            'the once-per-database defect this sprint has already paid for four times',
        ).toContain(PROBE_SUCCEEDED);
      });

      it('REFUSES one changed column bundled INTO an otherwise identical re-statement', async () => {
        // The other side of the exclusion: it is `updatedAt` ONLY, not "mostly unchanged".
        const error = await runRestrictedProbe(
          guardProbeSql(
            `UPDATE "trusteeship_deed" SET "primaryNazir" = "primaryNazir", "updatedAt" = now(), ` +
              `"ksaResident" = false WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/ksaResident/);
        // Exactly one column is named — the guard reports the CHANGED set, not the whole row.
        expect(error).not.toMatch(/primaryNazir/);
      });

      it('PERMITS the INITIAL RECORDING — INSERT is untouched, or no deed could ever exist', async () => {
        // ⚠ THE ARM WITHOUT WHICH THIS GUARD WOULD BE AN OUTAGE. Recording an appointment for the
        // first time is the `nazir` seat's act (`endowment:deed:write`), and every endowment in the
        // fixture already has a deed — so the subject has to be CONSTRUCTED, inside a rolled-back
        // transaction, or the permit arm would have no reachable configuration at all (R6-C1).
        const NEW_WAQF = 'waqf-9903';
        const outcome = await guardOutcome(
          [
            `INSERT INTO "waqf" ("id","waqifId","certificateNumber","deedNumber","classification",
               "type","nature","entitlementOrder","shartAlWaqif","shartAlWaqifVersion",
               "shartAlWaqifSetAt","shartAlWaqifSetAtHijri","reversionClauseCaptured","fiscalYearEnd",
               "registrationDate","registrationDateHijri","createdAt","updatedAt")
             VALUES ('${NEW_WAQF}','waqif-001','CERT-9903','DEED-9903','SMALL'::"WaqfClassification",
               'FAMILY_DHURRI'::"WaqfType",'AYNI'::"WaqfNature",'ORDERED'::"EntitlementOrder",
               '{"fixture":"S4 test row"}'::jsonb,1,now(),'1447-07-12',false,'12-31',now(),
               '1447-07-12',now(),now())`,
          ],
          `INSERT INTO "trusteeship_deed" ("id","waqfId","primaryNazir","primaryAppointedDate",
             "primaryAppointedDateHijri","jointlyLiable","islam","legalCapacity",
             "noDisqualifyingRemoval","ksaResident","createdAt","updatedAt")
           VALUES ('trust-9903','${NEW_WAQF}','QMULATE (professional Nazir)',now(),'1447-07-12',
             false,true,true,true,true,now(),now())`,
        );
        expect(
          outcome,
          'the FIRST recording of an appointment is refused — the guard is a wall, not a seal',
        ).toBe(GUARD_OUTCOME_COMMITTED);
      });

      it('MUTATION · with the trigger dropped, the very same edit COMMITS', async () => {
        const statement = `UPDATE "trusteeship_deed" SET "primaryNazir" = 'MUTANT' WHERE "waqfId" = '${DEED_WAQF}'`;

        const shipped = await guardOutcome([], statement);
        expect(shipped, 'memo Q10 is open: the edit committed against the SHIPPED guard').not.toBe(
          GUARD_OUTCOME_COMMITTED,
        );
        expect(shipped).toMatch(/WRITE-ONCE FOR EVERY SEAT/);

        const mutated = await guardOutcome(
          [`DROP TRIGGER trusteeship_deed_no_update ON "trusteeship_deed"`],
          statement,
        );
        expect(
          mutated,
          'the trigger was dropped and the edit was STILL refused — the assertions above are not ' +
            'measuring this guard',
        ).toBe(GUARD_OUTCOME_COMMITTED);

        // …and the guard is back, ENABLE ALWAYS, UPDATE-only, because the transaction rolled back.
        const prisma = await privilegedPrisma();
        const [row] = await prisma.$queryRawUnsafe<{ verbs: string; enabled: string }[]>(
          `SELECT CASE WHEN (tgtype & 4) > 0 THEN 'I' ELSE '' END ||
                  CASE WHEN (tgtype & 16) > 0 THEN 'U' ELSE '' END ||
                  CASE WHEN (tgtype & 8) > 0 THEN 'D' ELSE '' END AS verbs,
                  tgenabled::text AS enabled
             FROM pg_trigger WHERE tgname = 'trusteeship_deed_no_update' AND NOT tgisinternal`,
        );
        expect(row?.verbs).toBe('U');
        expect(row?.enabled).toBe('A');
      });

      it('keeps AV4-01’s id guard in front of it, with its own message', async () => {
        // Migration 17 EXTENDS the identity-guard family rather than duplicating it: that guard owns
        // the row's NAME and fires FIRST (triggers fire in name order), so a re-key still gets the
        // specific message. If somebody "tidies away" the id guard as redundant, this goes red.
        const error = await runRestrictedProbe(
          guardProbeSql(
            `UPDATE "trusteeship_deed" SET "id" = 'trust-9904' WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/the primary key "id"/);
        expect(error).not.toMatch(/WRITE-ONCE FOR EVERY SEAT/);
      });

      it('left all six recorded appointments exactly as the seed wrote them', async () => {
        const prisma = await privilegedPrisma();
        const deeds = await prisma.trusteeshipDeed.findMany({ orderBy: { id: 'asc' } });
        expect(deeds).toHaveLength(6);
        for (const deed of deeds) {
          expect(deed.primaryNazir).toBe('QMULATE (professional Nazir)');
          expect(deed.ksaResident).toBe(true);
          expect(deed.deletedAt).toBeNull();
        }
        // And no probe leaked a constructed endowment or deed.
        expect(await prisma.waqf.count({ where: { id: { startsWith: 'waqf-99' } } })).toBe(0);
        expect(
          await prisma.trusteeshipDeed.count({ where: { id: { startsWith: 'trust-99' } } }),
        ).toBe(0);
      });
    });

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // 8b. THE OTHER SIDE OF THE LINE — QMULATE'S **ASSESSMENT OF THE APPOINTEE** IS RECORDABLE,
    //     BUT ONLY AS A VERIFICATION EVENT (AV5-02, migration 18)
    //
    // MEASURED BEFORE MIGRATION 18, through `appRouter.createCaller` on a migrated + seeded database,
    // as `user-nazir-001` (NAZIR, `endowment:deed:write` on all five endowments), restating every deed
    // FACT byte-for-byte and supplying the representative's four BR-109 criteria as the assessment:
    //     code    : INTERNAL_SERVER_ERROR      ← the only path that records the BR-109 verification
    //     after   : eligibilityVerifiedAt = null
    // …on five appointments that ALL carry that stamp as NULL. A regulatory obligation with no path.
    //
    // WHAT IS PINNED HERE, as `qmulate_app` unless a test says otherwise, every probe rolled back:
    //   ·  a criterion moving WITH a complete, ADVANCED stamp            → COMMITS (the path exists)
    //   ·  the same criterion with NO stamp                              → 42501 (a claim, not a
    //                                                                      verification — BR-109)
    //   ·  the same criterion with a stamp that did not ADVANCE          → 42501
    //   ·  CLEARING a stamp that is set                                  → 42501 (no un-verifying)
    //   ·  a stamp BACK-DATED behind the stored one                      → 42501
    //   ·  a DEED FACT bundled INTO a verification write                 → 42501, WRITE-ONCE, and the
    //                                                                      message names ONLY the fact
    // ⚠ EVERY PROBE HERE SETS THE STAMP EXPLICITLY, and none of them commits: the subject is a SEEDED
    // appointment, and `@qmulate/database`'s `e3-exit-clauses.integration.test.ts` asserts
    // `eligibilityVerifiedAt IS NULL` on it. A verification event names a real actor and a real date
    // and is not a test's to record (that is `packages/api`'s
    // `deed-eligibility-verification.integration.test.ts`, on an endowment it owns and destroys).
    // ═══════════════════════════════════════════════════════════════════════════════════════

    describe('trusteeship_deed · the eligibility ASSESSMENT is recordable, as an event (AV5-02)', () => {
      const DEED_WAQF = RECORDED_WAQF;
      /** A complete verification event, ADVANCED past the seeded NULL. `user-nazir-001` is seeded. */
      const STAMP =
        `"eligibilityVerifiedAt" = now(), "eligibilityVerifiedAtHijri" = '1447-08-13', ` +
        `"eligibilityVerifiedBy" = 'user-nazir-001'`;

      it('CONTROL · the classification the guard consults is the expected THIRTEEN columns', async () => {
        // ⚠ FIRST, AND FOR R6-C1's REASON. Every probe below asserts something about a column's
        // CLASS. If `qmulate_trusteeship_deed_assessment_columns()` were empty or missing, the
        // "refused" probes would all still be refused (by arm 2, as sealed columns) and the section
        // would pass while measuring the opposite of what it claims.
        const prisma = await privilegedPrisma();
        const [row] = await prisma.$queryRawUnsafe<{ columns: string[] }[]>(
          `SELECT qmulate_trusteeship_deed_assessment_columns() AS columns`,
        );
        expect([...(row?.columns ?? [])].sort()).toEqual(
          [
            'authorityLicensed',
            'eligibilityVerifiedAt',
            'eligibilityVerifiedAtHijri',
            'eligibilityVerifiedBy',
            'islam',
            'ksaResident',
            'legalCapacity',
            'noDisqualifyingRemoval',
            'repIslam',
            'repKsaResident',
            'repLegalCapacity',
            'repNoDisqualifyingRemoval',
            'saudiNationalWhereRequired',
          ].sort(),
        );
      });

      it('PERMITS a criterion recorded WITH a complete, advanced verification event', async () => {
        // ⚠ THE ARM WITHOUT WHICH THE WHOLE FILE WOULD BE PROVING AN OUTAGE. This is BR-109's
        // "capture AND VERIFY" on an appointment that already exists — the state all five seeded
        // deeds are in, and the one migration 17 made unreachable.
        const error = await runRestrictedProbe(
          rollbackProbeSql([
            `UPDATE "trusteeship_deed" SET "authorityLicensed" = true, ${STAMP} ` +
              `WHERE "waqfId" = '${DEED_WAQF}'`,
          ]),
        );
        expect(
          error,
          'a BR-109 eligibility verification cannot be recorded on a recorded appointment — AV5-02 ' +
            'is open again, and five seeded deeds have no path to their own verification event',
        ).toContain(PROBE_SUCCEEDED);
      });

      it('PERMITS a RE-verification that changes no criterion — the stamp alone may advance', async () => {
        const error = await runRestrictedProbe(
          rollbackProbeSql([
            `UPDATE "trusteeship_deed" SET ${STAMP} WHERE "waqfId" = '${DEED_WAQF}'`,
          ]),
        );
        expect(error, '"we re-checked and nothing changed" is not recordable').toContain(
          PROBE_SUCCEEDED,
        );
      });

      it('REFUSES a criterion with NO verification event — a flag that moves alone is a CLAIM', async () => {
        // This is the probe that used to live in `EDITS` as `SET "ksaResident" = false`, and it is
        // STILL refused — for a narrower and more useful reason, which the message states.
        for (const set of [
          `"ksaResident" = false`,
          `"repKsaResident" = true`,
          `"islam" = false`,
          `"saudiNationalWhereRequired" = true`,
        ]) {
          const error = await runRestrictedProbe(
            guardProbeSql(
              `UPDATE "trusteeship_deed" SET ${set} WHERE "waqfId" = '${DEED_WAQF}'`,
              'insufficient_privilege',
            ),
          );
          expect(error, `${set} moved with no verification event`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
          expect(error).toMatch(/RECORDED VERIFICATION EVENT/);
          expect(error).toMatch(/CAPTURE \*\*AND VERIFY\*\*/);
          // It is NOT the deed-fact refusal: an assessment is not deed content, and telling a caller
          // to go and find a court judge for it is the AV5-02 defect in message form.
          expect(error).not.toMatch(/WRITE-ONCE FOR EVERY SEAT/);
          expectRefusedByGuardNotAcl(error);
        }
      });

      it('REFUSES a criterion whose stamp did NOT advance — the event must be a NEW one', async () => {
        // The stored stamp is NULL on every seeded deed, so "did not advance" is expressed as
        // supplying NULL alongside the change: `IS NOT DISTINCT FROM` catches it, and so does the
        // NOT NULL requirement. Both are the same clause and both matter — a caller restating the
        // PREVIOUS stamp is the shape this refuses on a deed that already carries one.
        const error = await runRestrictedProbe(
          guardProbeSql(
            `UPDATE "trusteeship_deed" SET "ksaResident" = false, ` +
              `"eligibilityVerifiedAt" = NULL, "eligibilityVerifiedAtHijri" = NULL, ` +
              `"eligibilityVerifiedBy" = NULL WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/RECORDED VERIFICATION EVENT/);
        expectRefusedByGuardNotAcl(error);
      });

      it('REFUSES an INCOMPLETE event — a date with no verifier is an unattributed verification', async () => {
        // ⚠ MIGRATION 12'S CHECK ANSWERS THIS ONE ON ITS OWN TERMS (23514) IF THE TRIGGER LETS IT
        // THROUGH; the guard answers FIRST (42501) because a BEFORE trigger runs before constraints.
        // Either way it is refused — the assertion accepts the guard's answer and names why.
        const error = await runRestrictedProbe(
          guardProbeSql(
            `UPDATE "trusteeship_deed" SET "ksaResident" = false, "eligibilityVerifiedAt" = now() ` +
              `WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/eligibilityVerifiedBy/);
        expectRefusedByGuardNotAcl(error);
      });

      it('REFUSES a BACK-DATED verification on a deed that already carries one', async () => {
        // The stored stamp on every seeded deed is NULL, so this needs a deed that HAS one: the
        // probe records a verification first (permitted), then back-dates it — both inside one
        // rolled-back transaction, which is the only shape that can express "then".
        const error = await runRestrictedProbe(
          probeWithSetupSql(
            [`UPDATE "trusteeship_deed" SET ${STAMP} WHERE "waqfId" = '${DEED_WAQF}'`],
            `UPDATE "trusteeship_deed" SET "ksaResident" = false, ` +
              `"eligibilityVerifiedAt" = now() - interval '10 years', ` +
              `"eligibilityVerifiedAtHijri" = '1437-08-13', ` +
              `"eligibilityVerifiedBy" = 'user-nazir-001' WHERE "waqfId" = '${DEED_WAQF}'`,
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/BACK-DATED/);
        expectRefusedByGuardNotAcl(error);
      });

      it('REFUSES a DEED FACT bundled into a verification write, naming ONLY the fact', async () => {
        // ⚠ THE ORDER OF THE TWO ARMS, PINNED. A statement that carries a perfectly good verification
        // event AND rewrites who the Nazir is must hear the DEED objection — accepting it because the
        // stamp was valid is the failure the whole guard exists to prevent.
        const error = await runRestrictedProbe(
          guardProbeSql(
            `UPDATE "trusteeship_deed" SET "ksaResident" = false, ${STAMP}, ` +
              `"primaryNazir" = 'REWRITTEN ${FICTIONAL_MARKER_AR}' WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/WRITE-ONCE FOR EVERY SEAT/);
        expect(error).toMatch(/primaryNazir/);
        // The changed SET, not the whole row: the assessment column is not named as an offender.
        expect(error).not.toMatch(/ksaResident/);
        // …and no VALUE travels, on a row carrying a named individual and the BR-109 criteria.
        expect(error).not.toMatch(/REWRITTEN/);
        expectRefusedByGuardNotAcl(error);
      });

      it('refuses a stampless assessment write for the TABLE OWNER and in a REPLICA session too', async () => {
        // "Every seat" is a claim about the DEED facts (memo Q10). The verification RULE is a
        // different claim — it is about honesty of the record, not authority — and it must hold for
        // the same three callers, or a migration or a job could move a person's eligibility flag with
        // nothing on the record saying who decided it.
        const owner = await runProbe(
          guardProbeSql(
            `UPDATE "trusteeship_deed" SET "ksaResident" = false WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(owner).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(owner).toMatch(/RECORDED VERIFICATION EVENT/);

        const replica = await runProbe(
          guardProbeSql(
            `SET LOCAL session_replication_role = 'replica'; ` +
              `UPDATE "trusteeship_deed" SET "ksaResident" = false WHERE "waqfId" = '${DEED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(replica).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(replica).toMatch(/RECORDED VERIFICATION EVENT/);
      });

      it('MUTATION · with arm 3 neutralised, the stampless assessment write COMMITS', async () => {
        // The mutation is a real edit to the SHIPPED function body — `guardBodyWithout` refuses
        // unless its target appears exactly once, so a mutation that no longer matches fails loudly
        // instead of proving nothing (R6-C1).
        const statement = `UPDATE "trusteeship_deed" SET "ksaResident" = false WHERE "waqfId" = '${DEED_WAQF}'`;

        const shipped = await guardOutcome([], statement);
        expect(
          shipped,
          'AV5-02 in the other direction: an eligibility flag moved with nothing on the record ' +
            'saying who verified it or when',
        ).not.toBe(GUARD_OUTCOME_COMMITTED);
        expect(shipped).toMatch(/RECORDED VERIFICATION EVENT/);

        const mutated = await guardOutcome(
          [
            await guardBodyWithout(
              'qmulate_trusteeship_deed_immutable()',
              'IF NOT event_recorded THEN',
            ),
          ],
          statement,
        );
        expect(
          mutated,
          'arm 3 was neutralised and the write was STILL refused — the assertions above are not ' +
            'measuring this rule',
        ).toBe(GUARD_OUTCOME_COMMITTED);
      });

      it('MUTATION · with the allow-list emptied, the verification write is REFUSED again (AV5-02 restored)', async () => {
        // The other direction, and the one that proves the CLASSIFICATION is what makes the path
        // exist: empty the assessment list and the permitted verification write turns back into the
        // deed-fact refusal that foreclosed the obligation.
        const statement =
          `UPDATE "trusteeship_deed" SET "authorityLicensed" = true, ${STAMP} ` +
          `WHERE "waqfId" = '${DEED_WAQF}'`;

        const shipped = await guardOutcome([], statement);
        expect(shipped, 'the verification path is gone — AV5-02 is open').toBe(
          GUARD_OUTCOME_COMMITTED,
        );

        const mutated = await guardOutcome(
          [
            `CREATE OR REPLACE FUNCTION qmulate_trusteeship_deed_assessment_columns()
               RETURNS text[] LANGUAGE sql IMMUTABLE AS $mut$ SELECT ARRAY[]::text[] $mut$`,
          ],
          statement,
        );
        expect(
          mutated,
          'the allow-list was emptied and the verification write STILL committed — the guard is not ' +
            'reading the classification it claims to read',
        ).not.toBe(GUARD_OUTCOME_COMMITTED);
        expect(mutated).toMatch(/WRITE-ONCE FOR EVERY SEAT/);
      });

      it('left the six seeded appointments UNSTAMPED — no probe here recorded a verification', async () => {
        const prisma = await privilegedPrisma();
        const deeds = await prisma.trusteeshipDeed.findMany({ orderBy: { id: 'asc' } });
        expect(deeds).toHaveLength(6);
        for (const deed of deeds) {
          expect(
            deed.eligibilityVerifiedAt,
            `${deed.id} carries a verification stamp. Every probe in this block is rolled back, so a ` +
              `stamp here means one of them committed — and @qmulate/api's ` +
              `deed-eligibility-verification suite asserts the fixture is unstamped.`,
          ).toBeNull();
          expect(deed.ksaResident, `${deed.id}.ksaResident was flipped by a probe`).toBe(true);
        }
      });
    });

    describe('as the least-privileged runtime role (qmulate_app)', () => {
      it('CONTROL · this role really can write to `waqf` and `asset` — so 42501 means the guard', async () => {
        // ⚠ THE LOAD-BEARING TEST OF THE SECTION, AND THE ONE WHOSE FAILURE WOULD SILENTLY HOLLOW
        // OUT EVERY OTHER TEST IN IT. If `qmulate_app` lost `UPDATE` on these tables, every refusal
        // below would still be a 42501 and every assertion would still pass — while measuring the
        // ACL instead of the guard. So the permission is asserted POSITIVELY, first.
        const waqf = await runRestrictedProbe(
          rollbackProbeSql([
            `UPDATE "waqf" SET "updatedAt" = now() WHERE "id" = '${RECORDED_WAQF}'`,
          ]),
        );
        expect(waqf, 'qmulate_app can no longer UPDATE "waqf" at all').toContain(PROBE_SUCCEEDED);

        const asset = await runRestrictedProbe(
          rollbackProbeSql([
            `UPDATE "asset" SET "status" = 'PARTIALLY_RENTED' WHERE "id" = '${ASSET_ID}'`,
          ]),
        );
        expect(asset, 'qmulate_app can no longer UPDATE "asset" at all').toContain(PROBE_SUCCEEDED);
      });

      it('refuses the three SEALED deed facts (V-E3-M6, measured from this exact role)', async () => {
        // Before migration 13, on a pristine seed: all three COMMITTED as this role, together and
        // one at a time, while `shartAlWaqifVersion` on the same row was refused — the guard worked
        // everywhere except on the founder's conditions that had landed in plain columns.
        for (const [column, value] of [
          ['entitlementOrder', 'LINEAGE_CONTINUATION'],
          ['type', 'PUBLIC_CHARITABLE'],
          ['nature', 'QIYAMI'],
        ] as const) {
          const error = await runRestrictedProbe(
            guardProbeSql(
              `UPDATE "waqf" SET "${column}" = '${value}' WHERE "id" = '${RECORDED_WAQF}'`,
              'insufficient_privilege',
            ),
          );
          expect(error, `${column} is writable by qmulate_app`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
          expect(error).toMatch(/is SEALED/);
          expectRefusedByGuardNotAcl(error);
        }
      });

      it('refuses rewriting a recorded "this deed names no مآل" (V-E3-01, the original finding)', async () => {
        const error = await runRestrictedProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "reversionKind" = 'CHARITABLE_ULTIMATE_TAKER', ` +
              `"reversionRecordedAt" = now(), "reversionRecordedAtHijri" = '1447-01-01' ` +
              `WHERE "id" = '${UNRECORDED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error, 'V-E3-01 is open again').toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/SEALED/);
        expectRefusedByGuardNotAcl(error);
      });

      it('cannot store the ARABIC spelling of a disposal at all (V-E3-02, NFR-01)', async () => {
        // The headline of V-E3-02: Arabic is the authoritative language, and under the twelve
        // Latin-spelling allow-list this committed a disposal with no approval. It is now refused by
        // the TYPE, so it never reaches a guard or an ACL — the refusal is 22P02, not 42501.
        const error = await runRestrictedProbe(
          guardProbeSql(
            `UPDATE "asset" SET "status" = 'مباع' WHERE "id" = '${ASSET_ID}'`,
            'invalid_text_representation',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[22P02]`);
        expect(error).toMatch(/invalid input value for enum "AssetStatus"/);
      });

      it('refuses a move into a reserved status with no approval (BR-306)', async () => {
        for (const status of ['EXPROPRIATED', 'SUBSTITUTED_ISTIBDAL']) {
          const error = await runRestrictedProbe(
            guardProbeSql(
              `UPDATE "asset" SET "status" = '${status}' WHERE "id" = '${ASSET_ID}'`,
              'insufficient_privilege',
            ),
          );
          expect(error, `${status} is ungated for qmulate_app`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
          expect(error).toMatch(/RESERVED MATTER \(BR-306\)/);
          expectRefusedByGuardNotAcl(error);
        }
      });

      it('CONTROL · this role really can INSERT an asset — so 42501 below means the guard', async () => {
        // ⚠ THE SAME LOAD-BEARING CONTROL AS THE UPDATE ONE ABOVE, FOR THE VERB ROUND 3 ADDED. The
        // birth refusals that follow are 42501s, and so is `permission denied for table asset`. If
        // `qmulate_app` lost INSERT on `asset`, every one of them would still pass while measuring
        // the ACL. Asserted POSITIVELY, first.
        const ok = await runRestrictedProbe(
          rollbackProbeSql([insertAssetSql({ id: BORN_ASSET, status: 'ACTIVE' })]),
        );
        expect(ok, 'qmulate_app can no longer INSERT into "asset" at all').toContain(
          PROBE_SUCCEEDED,
        );
      });

      it('refuses an asset BORN in a reserved status (AV3-02, from this exact role)', async () => {
        for (const status of ['EXPROPRIATED', 'SUBSTITUTED_ISTIBDAL']) {
          const error = await runRestrictedProbe(
            guardProbeSql(insertAssetSql({ id: BORN_ASSET, status }), 'insufficient_privilege'),
          );
          expect(error, `an asset can be BORN "${status}" by qmulate_app`).toContain(
            `${PROBE_BLOCKED}[42501]`,
          );
          expect(error).toMatch(/may not be CREATED already in status/);
          expectRefusedByGuardNotAcl(error);
        }
      });

      it('refuses an asset BORN already soft-retired (AV3-03, from this exact role)', async () => {
        // MEASURED BEFORE migration 15, as this role, with migration 14 applied: this INSERT
        // COMMITTED, while `UPDATE "asset" SET "deletedAt" = now()` on the same connection was
        // refused 42501. The identical act, refused as a transition and committed as a birth.
        const error = await runRestrictedProbe(
          guardProbeSql(
            insertAssetSql({ id: BORN_ASSET, status: 'ACTIVE', deletedAt: 'now()' }),
            'insufficient_privilege',
          ),
        );
        expect(error, 'AV3-03 is open for qmulate_app').toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/may not be CREATED already RETIRED/);
        expect(error).toMatch(/TODO\(surface\)/);
        expectRefusedByGuardNotAcl(error);
      });

      it('refuses moving a parcel between endowments (AV3-04, from this exact role)', async () => {
        const error = await runRestrictedProbe(
          guardProbeSql(
            `UPDATE "asset" SET "waqfId" = 'waqf-002' WHERE "id" = 'asset-001'`,
            'insufficient_privilege',
          ),
        );
        expect(error, 'one founder’s corpus can become another’s as qmulate_app').toContain(
          `${PROBE_BLOCKED}[42501]`,
        );
        expect(error).toMatch(/may NEVER be changed/);
        expectRefusedByGuardNotAcl(error);
      });

      it('ALLOWS the LEGAL taker recording from this role too (AV3-10 · the PERMIT arm)', async () => {
        // ⚠ WHY THIS EXISTS. `waqf_reversion_taker_insert_integrity`'s PERMIT arm has NO REACHABLE
        // SUBJECT IN THE COMMITTED FIXTURE — MEASURED on a pristine `--reset` → `migrate deploy` →
        // `db:seed` database, read from the live tables:
        //
        //   waqf-001..004  reversionClauseCaptured = true,  reversionKind = NULL   (§2 refuses)
        //   waqf-005       reversionClauseCaptured = false, reversionKind = NULL   (§1 refuses)
        //   waqf_reversion_taker: 0 rows
        //
        // So every seeded endowment lands on a REFUSAL branch, and a guard whose legal path no test
        // walks is a guard nobody has proven is a gate rather than a wall (R6-C1: a generator that
        // cannot reach a configuration reports its silence as success). Section 3a above does walk
        // it — as the OWNER, on a subject CONSTRUCTED inside a rolled-back block. This is the other
        // half: the same legal path as `qmulate_app`, the role every V-E3 finding was measured on,
        // and the role that will actually record a مآل clause in production.
        const error = await runRestrictedProbe(
          rollbackProbeSql([
            recordReversionSql(UNREAD_WAQF),
            insertJihaBeneficiarySql('ben-test-9404', UNREAD_WAQF),
            `INSERT INTO "waqf_reversion_taker" ("id","waqfId","beneficiaryId","createdAt","createdBy")
               VALUES ('wrt-test-9404', '${UNREAD_WAQF}', 'ben-test-9404', now(), '${MAKER_ID}')`,
          ]),
        );
        expect(
          error,
          'the LEGAL مآل recording is refused for the role that performs it — the guard is a wall',
        ).toContain(PROBE_SUCCEEDED);
      });

      it('refuses recording an ultimate taker against a deed that records none (V-E3-M2)', async () => {
        const error = await runRestrictedProbe(
          guardProbeSql(
            `INSERT INTO "waqf_reversion_taker" ("id","waqfId","beneficiaryId","createdAt","createdBy")
               VALUES ('wrt-test-9409', '${UNRECORDED_WAQF}', '${TAKER_BENEFICIARY}', now(), '${MAKER_ID}')`,
            'insufficient_privilege',
          ),
        );
        expect(error, 'V-E3-M2 is open again').toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/records NO مآل|reversionKind" is NULL/);
        expectRefusedByGuardNotAcl(error);
      });

      it('still refuses tier 1 — the control that was already true before this sprint', async () => {
        const error = await runRestrictedProbe(
          guardProbeSql(
            `UPDATE "waqf" SET "shartAlWaqifVersion" = 99 WHERE "id" = '${RECORDED_WAQF}'`,
            'insufficient_privilege',
          ),
        );
        expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
        expect(error).toMatch(/shart_al_waqif is immutable/);
        expectRefusedByGuardNotAcl(error);
      });

      it('left every one of those columns exactly as the seed wrote them', async () => {
        const prisma = await privilegedPrisma();
        const waqf = await prisma.waqf.findUniqueOrThrow({ where: { id: RECORDED_WAQF } });
        expect(waqf.entitlementOrder).toBe('ORDERED');
        expect(waqf.type).toBe('FAMILY_DHURRI');
        expect(waqf.nature).toBe('AYNI');
        expect(waqf.shartAlWaqifVersion).toBe(1);

        const unrecorded = await prisma.waqf.findUniqueOrThrow({ where: { id: UNRECORDED_WAQF } });
        expect(unrecorded.reversionKind).toBeNull();
        expect(unrecorded.reversionClauseCaptured).toBe(true);

        const [asset] = await prisma.$queryRawUnsafe<{ status: string }[]>(
          `SELECT "status" FROM "asset" WHERE "id" = '${ASSET_ID}'`,
        );
        expect(asset?.status).toBe('ACTIVE');
      });
    });
  },
);
