/**
 * E5 — G-2 (ANTI-COMMINGLING) AS STRUCTURE, AND THE CORPUS GUARD (Binding rule 1 / ADR-0002).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * EVERY TEST BELOW IS A MEASURED ATTACK, REPLAYED VERBATIM
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Before migration 19, on a `--reset` → `migrate deploy` → `db:seed` database at migration 18, as
 * the least-privileged runtime role, ALL of these COMMITTED. They are not hypotheticals and they
 * are not paraphrased — the statements here are the statements that worked.
 *
 *   G-2 was unenforced on TEN edges across SIX tables (§1 below), the gravest being a
 *   `distribution_line_item` on waqf-001's run paying a beneficiary of **waqf-002** — a payment to
 *   a stranger, not a bookkeeping error. Commingling is a zero-tolerance control (BR-501 / KPI 2).
 *
 *   And the corpus guard (S2 handover row 10, open since 2026-07-28):
 *     UPDATE "transaction" SET "receiptClass"='INCOME', "capitalSource"=NULL WHERE "id"='rev-004'
 *   committed. rev-004 is SAR 20,000,000 of EXPROPRIATION_COMPENSATION — corpus — and it became
 *   distributable ghallah while `audit_event` for the row moved **1 → 1**: it did not move. The
 *   audit silence is the worse half: an erosion nobody could attribute or reconstruct.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RULE THIS FILE FOLLOWS EVERYWHERE, AND WHY IT IS WRITTEN DOWN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **A REFUSAL IS ONLY EVIDENCE WHEN IT CARRIES THE GUARD'S OWN MESSAGE.**
 *
 * This is not a style preference; it was paid for twice while building this migration.
 *  · Four of the ten edges FIRST probed as "REFUSED" — and that was the probe's own SQL failing on
 *    wrong column names. A vacuous negative (R6-C1's lesson one layer down).
 *  · Then edge 7 probed as "REFUSED" AFTER the migration — on a NOT NULL violation, because the
 *    probe predated the new `waqfId` column. The composite foreign key, the thing actually under
 *    test, had not been reached at all.
 * Both would have been recorded as a working guard. So every assertion here names the constraint
 * or the guard text it expects, `guardProbeSql` pins the SQLSTATE class, and §1.7 carries a
 * POSITIVE CONTROL — a coherent line that must COMMIT — because two refusals of an INSERT that
 * never works for an unrelated reason prove nothing at all.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE DOES **NOT** CLAIM
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ It does not claim a correction is impossible, and §2 says so explicitly. What is dead is the
 * IN-PLACE MUTATION. In this house a correction is never an edit anyway — the Shart al-Waqif
 * (ADR-0006) and the trusteeship deed (owner memo Q10) both correct by SUPERSEDING RECORD — so if
 * the owner rules that a mis-classified receipt may be corrected, the shape is a reversal entry
 * plus a re-entered receipt, both audited. That would ADD A FLOW; it would not re-open the column.
 * The question is open (`TODO(surface)`), and the register carries it with `rev-004` attached.
 *
 * ⚠ It does not claim `amountSar` is protected. It is deliberately still mutable (§2.4 measures
 * that it is), because bank statements really are corrected and no correction flow exists yet.
 * Named, not guessed at.
 *
 * ⚠ It does not touch WHICH receipt types are capital. That is register item #8, the Sharia review
 * is UNSIGNED (ADR-0002 §3), and nothing here rules on it. Fixture data only.
 *
 * ── WHY THE PRIVILEGED CONNECTION ────────────────────────────────────────────────────────────
 * `runProbe()` runs as the table OWNER, deliberately (see its header in `setup.ts`): on the app
 * role, a `DELETE`/`TRUNCATE` probe is refused by the ACL before a trigger is reached, which would
 * leave this suite green while measuring nothing. Running as the owner makes each claim STRONGER:
 * *even the table owner cannot do this.* Privilege claims live elsewhere and stay there.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_BLOCKED,
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

warnNoDatabase('E5 (G-2 anti-commingling as structure; the corpus guard)');

/** The MEDIUM `FAMILY_DHURRI` endowment, and the one the seeded distribution run belongs to. */
const WAQF_A = 'waqf-001';
/** A different endowment — every "foreign" subject below is one of its rows. */
const WAQF_B = 'waqf-002';
/** waqf-003's EXPROPRIATION_COMPENSATION receipt: SAR 20,000,000 of CORPUS. The S2 row-10 subject. */
const CAPITAL_RECEIPT = 'rev-004';
/** A waqf-001 INCOME receipt — the control for "ordinary receipts still behave". */
const INCOME_RECEIPT = 'rev-001';

describe.skipIf(!hasDatabase)('E5 · anti-commingling and the corpus guard', () => {
  beforeAll(() => {
    ensureSeeded();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 0 · THE SUBJECTS ARE REAL — otherwise every refusal below is vacuous
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('the fixture really contains the rows these attacks target', async () => {
    const prisma = await privilegedPrisma();

    // A CAPITAL receipt must exist, or §2 refuses a state nothing is ever in.
    const capital = await prisma.$queryRawUnsafe<
      {
        id: string;
        waqfId: string;
        receiptClass: string;
        capitalSource: string;
        amountSar: string;
      }[]
    >(
      `SELECT "id","waqfId","receiptClass"::text AS "receiptClass",
              "capitalSource"::text AS "capitalSource", "amountSar"::text AS "amountSar"
         FROM "transaction" WHERE "id" = $1`,
      CAPITAL_RECEIPT,
    );
    expect(capital[0]?.receiptClass).toBe('CAPITAL');
    expect(capital[0]?.capitalSource).toBe('EXPROPRIATION_COMPENSATION');

    // Endowments with DIFFERENT bank accounts, assets and beneficiaries — the cross-endowment
    // subjects. If waqf-002 had none of these, §1 would be measuring an empty set.
    const pairs = await prisma.$queryRawUnsafe<{ tbl: string; a: number; b: number }[]>(
      `SELECT 'bank_account' AS tbl,
              count(*) FILTER (WHERE "waqfId" = $1)::int AS a,
              count(*) FILTER (WHERE "waqfId" = $2)::int AS b FROM "bank_account"
       UNION ALL
       SELECT 'asset', count(*) FILTER (WHERE "waqfId" = $1)::int,
              count(*) FILTER (WHERE "waqfId" = $2)::int FROM "asset"
       UNION ALL
       SELECT 'beneficiary', count(*) FILTER (WHERE "waqfId" = $1)::int,
              count(*) FILTER (WHERE "waqfId" = $2)::int FROM "beneficiary"`,
      WAQF_A,
      WAQF_B,
    );
    for (const row of pairs) {
      expect(row.a, `${row.tbl}: waqf-001 has no row to attack from`).toBeGreaterThan(0);
      expect(row.b, `${row.tbl}: waqf-002 has no row to attack toward`).toBeGreaterThan(0);
    }
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 1 · G-2 — CROSS-ENDOWMENT REFERENCES ARE UNREPRESENTABLE
   *
   * Ten measured edges. Each asserts the COMPOSITE constraint by name, so a future migration that
   * drops it and leaves the single-column FK in place turns these red rather than passing on the
   * survivor.
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('EDGE 1 · a receipt cannot name another endowment’s bank account', async () => {
    const text = await runProbe(
      guardProbeSql(
        `INSERT INTO "transaction"
           ("id","waqfId","type","category","receiptClass","descriptionAr","amountSar","date",
            "dateHijri","bankAccountId","updatedAt")
         SELECT 'e5-x1', '${WAQF_A}', 'REVENUE', 'probe', 'INCOME',
                'إيراد تجريبي (بيانات وهمية)', 1.00, now(), '1447-01-01', b."id", now()
           FROM "bank_account" b WHERE b."waqfId" = '${WAQF_B}' LIMIT 1`,
        'foreign_key_violation',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('transaction_waqfId_bankAccountId_fkey');
  });

  it('EDGE 2 · a receipt cannot name another endowment’s parcel', async () => {
    const text = await runProbe(
      guardProbeSql(
        `INSERT INTO "transaction"
           ("id","waqfId","type","category","receiptClass","descriptionAr","amountSar","date",
            "dateHijri","bankAccountId","assetId","updatedAt")
         SELECT 'e5-x2', '${WAQF_A}', 'REVENUE', 'probe', 'INCOME',
                'إيراد تجريبي (بيانات وهمية)', 1.00, now(), '1447-01-01',
                (SELECT "id" FROM "bank_account" WHERE "waqfId" = '${WAQF_A}' LIMIT 1),
                a."id", now()
           FROM "asset" a WHERE a."waqfId" = '${WAQF_B}' LIMIT 1`,
        'foreign_key_violation',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('transaction_waqfId_assetId_fkey');
  });

  it('EDGE 9 · a lease cannot name another endowment’s parcel', async () => {
    const text = await runProbe(
      guardProbeSql(
        `INSERT INTO "lease"
           ("id","waqfId","assetId","tenantAr","rentSar","startDate","startDateHijri","endDate",
            "endDateHijri","status","updatedAt")
         SELECT 'e5-x9', '${WAQF_A}', a."id", 'مستأجر تجريبي (بيانات وهمية)', 1.00, now(),
                '1447-01-01', now() + interval '1 year', '1448-01-01', 'active', now()
           FROM "asset" a WHERE a."waqfId" = '${WAQF_B}' LIMIT 1`,
        'foreign_key_violation',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('lease_waqfId_assetId_fkey');
  });

  it('EDGE 10 · an expropriation cannot name another endowment’s parcel', async () => {
    // Worth stating: an expropriation is the event that turns a parcel into CAPITAL proceeds
    // (Binding rule 1). Recording one against a parcel of a different endowment would attribute
    // another endowment's corpus movement to this one.
    const text = await runProbe(
      guardProbeSql(
        `INSERT INTO "expropriation"
           ("id","waqfId","assetId","authorityAr","scope","announcedDate","announcedDateHijri",
            "compensationStatus","istibdalStatus","updatedAt")
         SELECT 'e5-x10', '${WAQF_A}', a."id", 'جهة تجريبية (بيانات وهمية)', 'partial', now(),
                '1447-01-01', 'assessed', 'pending_authority_permission', now()
           FROM "asset" a WHERE a."waqfId" = '${WAQF_B}' LIMIT 1`,
        'foreign_key_violation',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('expropriation_waqfId_assetId_fkey');
  });

  it('EDGE 8 · a document cannot be attached to another endowment’s beneficiary', async () => {
    // Also a §10 §5 isolation edge: the force filter narrows Document by
    // `beneficiaryId = beneficiarySelfId`, so a cross-endowment attachment would put one
    // endowment's file inside a different endowment's beneficiary's own-record view.
    const text = await runProbe(
      guardProbeSql(
        `INSERT INTO "document"
           ("id","waqfId","beneficiaryId","type","titleAr","storageKey","sha256","confidentiality",
            "retentionUntil","retentionUntilHijri","updatedAt")
         SELECT 'e5-x8', '${WAQF_A}', b."id", 'kyc', 'مستند تجريبي (بيانات وهمية)',
                'probe/e5-x8', repeat('0', 64), 'NORMAL', now() + interval '10 years',
                '1457-01-01', now()
           FROM "beneficiary" b WHERE b."waqfId" = '${WAQF_B}' LIMIT 1`,
        'foreign_key_violation',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('document_waqfId_beneficiaryId_fkey');
  });

  /* ── EDGE 7 — THE GRAVEST, AND THE ONE THAT NEEDED TWO CONSTRAINTS ────────────────────────── */

  it('EDGE 7a · a payout line cannot pay a beneficiary of another endowment', async () => {
    const text = await runProbe(
      guardProbeSql(
        `INSERT INTO "distribution_line_item"
           ("id","waqfId","distributionId","beneficiaryId","sharePercent","amountSar","status")
         SELECT 'e5-x7a', d."waqfId", d."id", b."id", 1.0000, 1.00, 'PAID'
           FROM "distribution" d
           CROSS JOIN LATERAL (
             SELECT "id" FROM "beneficiary" WHERE "waqfId" <> d."waqfId" LIMIT 1
           ) b
          LIMIT 1`,
        'foreign_key_violation',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('distribution_line_item_waqfId_beneficiaryId_fkey');
  });

  it('EDGE 7b · nor by stamping the line with the BENEFICIARY’s endowment instead', async () => {
    // THIS IS WHY THERE ARE TWO COMPOSITE KEYS AND NOT ONE. With only the beneficiary key, a line
    // could carry the beneficiary's own endowment — the pair would agree with each other while
    // disagreeing with the run that is actually paying. The second key ties the line to its parent.
    const text = await runProbe(
      guardProbeSql(
        `INSERT INTO "distribution_line_item"
           ("id","waqfId","distributionId","beneficiaryId","sharePercent","amountSar","status")
         SELECT 'e5-x7b', b."waqfId", d."id", b."id", 1.0000, 1.00, 'PAID'
           FROM "distribution" d
           CROSS JOIN LATERAL (
             SELECT "id", "waqfId" FROM "beneficiary" WHERE "waqfId" <> d."waqfId" LIMIT 1
           ) b
          LIMIT 1`,
        'foreign_key_violation',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('distribution_line_item_waqfId_distributionId_fkey');
  });

  it('EDGE 7c · POSITIVE CONTROL — a COHERENT payout line still commits', async () => {
    // Without this, 7a and 7b could both be an INSERT that never works for an unrelated reason —
    // which is exactly how this file's own probes went wrong twice before it was written.
    const text = await runProbe(
      rollbackProbeSql([
        `INSERT INTO "distribution_line_item"
           ("id","waqfId","distributionId","beneficiaryId","sharePercent","amountSar","status")
         SELECT 'e5-x7ok', d."waqfId", d."id", b."id", 1.0000, 1.00, 'PAID'
           FROM "distribution" d
           CROSS JOIN LATERAL (
             SELECT "id" FROM "beneficiary" WHERE "waqfId" = d."waqfId" LIMIT 1
           ) b
          LIMIT 1`,
      ]),
    );
    expect(text).toContain(PROBE_SUCCEEDED);
  });

  it('EDGE 7d · nor by UPDATING an existing line onto a foreign beneficiary', async () => {
    const text = await runProbe(
      guardProbeSql(
        `UPDATE "distribution_line_item" li
            SET "beneficiaryId" = (
              SELECT "id" FROM "beneficiary" WHERE "waqfId" <> li."waqfId" LIMIT 1
            )
          WHERE li."id" = (SELECT "id" FROM "distribution_line_item" LIMIT 1)`,
        'foreign_key_violation',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('distribution_line_item_waqfId_beneficiaryId_fkey');
  });

  /* ── EDGES 3, 4 — a COHERENT pair moved wholesale, which no foreign key can see ────────────── */

  it('EDGE 4 · a committed receipt cannot change endowment', async () => {
    const text = await runProbe(
      guardProbeSql(
        `UPDATE "transaction" SET "waqfId" = '${WAQF_B}' WHERE "id" = '${INCOME_RECEIPT}'`,
        'insufficient_privilege',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('may not change endowment');
    // The reason is in the message, because a Nazir reading a refusal needs to know what to do
    // instead — "enter the correction as its own transactions on each endowment".
    expect(text).toContain('zero-tolerance');
  });

  it('EDGE 3 · a committed receipt cannot change bank account', async () => {
    const text = await runProbe(
      guardProbeSql(
        `UPDATE "transaction" SET "bankAccountId" = (
           SELECT "id" FROM "bank_account" WHERE "waqfId" = '${WAQF_B}' LIMIT 1
         ) WHERE "id" = '${INCOME_RECEIPT}'`,
        'insufficient_privilege',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('may not change bank account');
    // Named consequence: re-pointing silently invalidates a completed reconciliation (BR-503).
    expect(text).toContain('reconciliation');
  });

  /* ── EDGE 6 — BR-501's "personal funds" leg ────────────────────────────────────────────────── */

  it('EDGE 6 · nothing may be posted to a NON-DEDICATED account', async () => {
    const text = await runProbe(
      guardProbeSql(
        `WITH acct AS (
           INSERT INTO "bank_account"
             ("id","waqfId","accountRef","ibanEnc","ibanHmac","bankNameAr","purpose","isDedicated","updatedAt")
           VALUES ('e5-personal','${WAQF_A}','E5-PROBE-PERSONAL','x','e5-probe-hmac',
                   'بنك تجريبي (بيانات وهمية)','personal',false,now())
           RETURNING "id"
         )
         INSERT INTO "transaction"
           ("id","waqfId","type","category","receiptClass","descriptionAr","amountSar","date",
            "dateHijri","bankAccountId","updatedAt")
         SELECT 'e5-x6', '${WAQF_A}', 'REVENUE', 'probe', 'INCOME',
                'إيراد تجريبي (بيانات وهمية)', 1.00, now(), '1447-01-01', acct."id", now()
           FROM acct`,
        'insufficient_privilege',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('not a DEDICATED waqf account');
    expect(text).toContain('BR-501');
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 2 · THE CORPUS GUARD — asl does not become ghallah
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('THE MEASURED ATTACK, VERBATIM · a CAPITAL receipt cannot be reclassified INCOME', async () => {
    const text = await runProbe(
      guardProbeSql(
        `UPDATE "transaction" SET "receiptClass" = 'INCOME', "capitalSource" = NULL
          WHERE "id" = '${CAPITAL_RECEIPT}'`,
        'insufficient_privilege',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('CAPITAL receipt');
    expect(text).toContain('may not be reclassified');
    // The refusal names the row's BEFORE state, so the trail shows what was attempted on what.
    expect(text).toContain('EXPROPRIATION_COMPENSATION');

    // ⊕ S6/E5, migration 20 §6. This assertion used to read `toContain('superseding record')`,
    // pointing at a CONVENTION while the message itself called the correction flow "an OPEN
    // PRODUCT QUESTION". The product owner ANSWERED it on 2026-08-18 (S4 memo Q-E5-1(b)), so the
    // message now names the ruling, the reserved-matter kind and the two procedures — and this
    // test was updated with it rather than being left asserting the older, vaguer text.
    expect(text).toContain('SUPERSEDING RECORD');
    expect(text).toContain('RECEIPT_CLASS_CORRECTION');
    expect(text).toContain('finance.receiptClass.requestCorrection');

    // ⚠ THE ASSERTION THAT MATTERS MOST, because it is the one a future reader is most likely to
    // get backwards: the existence of a correction flow does NOT mean this column opened. The
    // guard is unconditional and consults no approval id, and its own message has to say so —
    // otherwise "corrections are allowed now" becomes a licence to relax the trigger.
    expect(text).toContain('DOES NOT OPEN THIS COLUMN');
  });

  it('THE SECOND DOOR · nor by turning the row into an EXPENSE and nulling the class', async () => {
    // Every CHECK migration 1 installed is SATISFIED by this statement — a REVENUE row must carry
    // a class, an EXPENSE must carry none — which is exactly why the guard is written against the
    // STATE THE ROW LEAVES rather than against one column. A column-wise guard misses this.
    const text = await runProbe(
      guardProbeSql(
        `UPDATE "transaction"
            SET "type" = 'EXPENSE', "receiptClass" = NULL, "capitalSource" = NULL
          WHERE "id" = '${CAPITAL_RECEIPT}'`,
        'insufficient_privilege',
      ),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('may not be reclassified');
  });

  it('THE GUARD IS NOT A SEAL · a CAPITAL receipt’s ordinary columns still move', async () => {
    // If this went red, E5 could not do its own job: reconciliation stamps `reconciledAt` on
    // receipts, including capital ones. A guard that froze the row would be a different defect
    // wearing the same name.
    const text = await runProbe(
      rollbackProbeSql([
        `UPDATE "transaction" SET "reconciledAt" = now() WHERE "id" = '${CAPITAL_RECEIPT}'`,
        `UPDATE "transaction" SET "descriptionAr" = 'وصف معدل (بيانات وهمية)'
          WHERE "id" = '${CAPITAL_RECEIPT}'`,
      ]),
    );
    expect(text).toContain(PROBE_SUCCEEDED);
  });

  it('AND IT IS DIRECTIONAL · an INCOME receipt is untouched by this guard', async () => {
    // The guard asks one question — "did this row stop being a CAPITAL receipt?" — so an INCOME
    // row is outside it entirely. Asserted so a later "tighten it a bit" edit that freezes every
    // receipt's class is visible as a behaviour change rather than a tidy-up.
    //
    // ⚠ THIS IS NOT A RULING THAT INCOME → CAPITAL IS CORRECT. It is the corpus-PROTECTING
    // direction and binding rule 1 does not forbid it, so the database takes no position. Whether
    // any reclassification flow should exist is the owner's open question (TODO(surface)).
    const text = await runProbe(
      rollbackProbeSql([
        `UPDATE "transaction"
            SET "receiptClass" = 'CAPITAL', "capitalSource" = 'OTHER',
                "capitalSourceNoteAr" = 'سبب تجريبي (بيانات وهمية)'
          WHERE "id" = '${INCOME_RECEIPT}'`,
      ]),
    );
    expect(text).toContain(PROBE_SUCCEEDED);
  });

  it('DELIBERATELY STILL OPEN · a committed receipt’s AMOUNT is mutable, and that is recorded', async () => {
    // NOT a guard, and this test exists so the gap is VISIBLE rather than assumed closed by the
    // file's title. Bank statements really are corrected and no correction flow is designed yet;
    // refusing an amount change with no path forward would make a typo permanent.
    // TODO(surface): is a committed receipt's amount correctable, by whom, and does it need the
    // same superseding shape as a reclassification would?
    const text = await runProbe(
      rollbackProbeSql([
        `UPDATE "transaction" SET "amountSar" = "amountSar" + 1 WHERE "id" = '${INCOME_RECEIPT}'`,
      ]),
    );
    expect(text).toContain(PROBE_SUCCEEDED);
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 3 · THE GUARDS SURVIVE THE BYPASS THAT DEFEATED G-1 IN SPRINT 1
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('`session_replication_role = replica` does not skip the corpus guard (ENABLE ALWAYS)', async () => {
    // Routed to the SUPERUSER connection by `runProbe` (the GUC is superuser-only), which makes
    // this the strongest available form of the claim: even a superuser wielding the replica GUC
    // cannot turn a capital receipt into income.
    const text = await runProbe(
      [
        'DO $qm_probe$',
        'BEGIN',
        "  SET LOCAL session_replication_role = 'replica';",
        `  UPDATE "transaction" SET "receiptClass" = 'INCOME', "capitalSource" = NULL`,
        `   WHERE "id" = '${CAPITAL_RECEIPT}';`,
        "  RAISE EXCEPTION 'QMULATE_PROBE_NOT_BLOCKED' USING ERRCODE = 'P0001';",
        'EXCEPTION',
        '  WHEN insufficient_privilege THEN',
        `    RAISE EXCEPTION '${PROBE_BLOCKED}[42501]: %', SQLERRM USING ERRCODE = 'P0001';`,
        'END',
        '$qm_probe$;',
      ].join('\n'),
    );
    expect(text).toContain(PROBE_BLOCKED);
    expect(text).toContain('may not be reclassified');
  });
});
