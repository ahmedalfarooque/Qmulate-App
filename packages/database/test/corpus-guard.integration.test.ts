// QMULATE — BINDING RULE 1: corpus (aṣl / أصل) and income (ghallah / غلة) are never mixed
// (assertion A13).
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THESE CONSTRAINTS DECIDE — AND, MUCH MORE IMPORTANTLY, WHAT THEY DO NOT
// ═══════════════════════════════════════════════════════════════════════════════════════════
// They enforce the STRUCTURE of corpus/income segregation, which is a safe invariant:
//   • every REVENUE receipt is classified income-vs-capital AT ENTRY — never later, never by
//     inference;
//   • a CAPITAL receipt always names the corpus event that produced it;
//   • an EXPENSE — an outflow, neither ghallah nor aṣl inflow — carries no receipt class at all;
//   • the distribution waterfall's only legal input is `type = REVENUE AND receiptClass = INCOME`.
//
// They do NOT decide WHICH receipt is which. That is a fiqh question and it is NOT resolved (see
// the `it.todo`s at the end). ADR-0002 is PROVISIONAL and BUILD-PLAN records the Sharia review as
// UNSIGNED. This file therefore tests the shape of the rule, never the ruling.
//
// EVERY PROBE IS TESTED AT THE DATABASE, NOT IN TYPESCRIPT. A CHECK constraint that only the ORM
// respects is not a constraint: a migration, a backfill or a raw import would walk straight past
// it. So every insert below is raw SQL, and every probe rolls itself back.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_BLOCKED,
  PROBE_NOT_BLOCKED,
  PROBE_SUCCEEDED,
  assertGuardsInstalled,
  privilegedPrisma,
  closeDatabase,
  ensureSeeded,
  guardProbeSql,
  hasDatabase,
  rollbackProbeSql,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('assertion A13 (corpus/income guard)');

/**
 * A syntactically valid, referentially sound REVENUE row. Each test overrides exactly the columns
 * whose combination is supposed to be illegal, so a failure can only be the constraint under test
 * — not a missing NOT NULL and not a dangling foreign key.
 */
const BASE_ROW: Readonly<Record<string, string>> = {
  id: `'rev-900'`,
  waqfId: `'waqf-001'`,
  type: `'REVENUE'`,
  category: `'rent'`,
  expenseCategory: 'NULL',
  receiptClass: `'INCOME'`,
  capitalSource: 'NULL',
  capitalSourceNoteAr: 'NULL',
  descriptionAr: `'إيراد اختبار (بيانات وهمية)'`,
  descriptionEn: `'Probe receipt'`,
  amountSar: '1000.00',
  date: `'2026-03-31'`,
  dateHijri: `'1447-10-12'`,
  bankAccountId: `'bankacct-fake-acct-w1'`,
  assetId: 'NULL',
  // `@updatedAt` is applied by Prisma, not by a database default, so raw SQL must supply it.
  updatedAt: 'now()',
};

function insertTransaction(overrides: Readonly<Record<string, string>> = {}): string {
  const row = { ...BASE_ROW, ...overrides };
  const columns = Object.keys(row)
    .map((name) => `"${name}"`)
    .join(', ');
  const values = Object.values(row).join(', ');
  return `INSERT INTO "transaction" (${columns}) VALUES (${values})`;
}

/** Every illegal combination, with the constraint that must reject it. */
const ILLEGAL_COMBINATIONS: readonly {
  why: string;
  constraint: string;
  row: Record<string, string>;
}[] = [
  {
    why: 'a REVENUE receipt with no income-vs-capital classification',
    constraint: 'transaction_revenue_requires_receipt_class',
    row: { type: `'REVENUE'`, receiptClass: 'NULL', capitalSource: 'NULL' },
  },
  {
    why: 'a CAPITAL receipt that does not name the corpus event behind it',
    constraint: 'transaction_capital_requires_source',
    row: { receiptClass: `'CAPITAL'`, capitalSource: 'NULL' },
  },
  {
    why: 'an EXPENSE carrying a receipt class — an outflow is neither ghallah nor aṣl inflow',
    constraint: 'transaction_expense_has_no_receipt_class',
    row: { type: `'EXPENSE'`, expenseCategory: `'OPERATIONS'`, receiptClass: `'INCOME'` },
  },
  {
    why: 'an EXPENSE with no expense category',
    constraint: 'transaction_expense_requires_category',
    row: {
      type: `'EXPENSE'`,
      expenseCategory: 'NULL',
      receiptClass: 'NULL',
      capitalSource: 'NULL',
    },
  },
  {
    why: 'an INCOME receipt claiming a capital source',
    constraint: 'transaction_income_has_no_capital_source',
    row: { receiptClass: `'INCOME'`, capitalSource: `'SALE_PROCEEDS'` },
  },
  {
    why: 'a CAPITAL/OTHER receipt with no Arabic explanation of what it is',
    constraint: 'transaction_capital_other_requires_note',
    row: { receiptClass: `'CAPITAL'`, capitalSource: `'OTHER'`, capitalSourceNoteAr: 'NULL' },
  },
  {
    why: 'a negative amount — a receipt is not a reversal',
    constraint: 'transaction_amount_nonnegative',
    row: { amountSar: '-1.00' },
  },
];

describe.skipIf(!hasDatabase)(
  'Binding rule 1 · corpus/income segregation is enforced at the database (A13)',
  () => {
    beforeAll(async () => {
      await assertGuardsInstalled();
      // waqf-001 and bankacct-fake-acct-w1 must exist, or these probes would fail on a foreign key
      // and look like a passing CHECK.
      ensureSeeded();
      const prisma = // ⚠ THE PRIVILEGED (OWNER) CONNECTION, NOT THE APP ONE  (ADR-0008 round 6). This handle issues RAW
        // GUARD STATEMENTS. Since privilege separation the app role holds no DELETE on any endowment table,
        // no UPDATE on `audit_event`, no TRUNCATE anywhere and no write at all on `waqf_access_grant` — so
        // on the app connection every probe below would be refused by the **ACL** before reaching the guard
        // it is testing (`42501 permission denied for table asset`, not the retention trigger's message).
        // The suite would stay green while measuring nothing. Running as the OWNER restores exactly the
        // environment these assertions were written for and makes each claim STRONGER: "even the table
        // owner is refused". Every PRIVILEGE claim lives in `authorization-plane-privilege.integration.test.ts`
        // on the restricted connection instead; do not merge the two.
        await privilegedPrisma();
      expect(await prisma.waqf.count({ where: { id: 'waqf-001' } })).toBe(1);
      expect(await prisma.bankAccount.count({ where: { id: 'bankacct-fake-acct-w1' } })).toBe(1);
    });

    afterAll(async () => {
      await closeDatabase();
    });

    // ── the illegal shapes ─────────────────────────────────────────────────────────────────────

    for (const { why, constraint, row } of ILLEGAL_COMBINATIONS) {
      it(`rejects ${why} (${constraint})`, async () => {
        const error = await runProbe(guardProbeSql(insertTransaction(row), 'check_violation'));
        expect(error, `${why} was ACCEPTED by the database`).toContain(`${PROBE_BLOCKED}[23514]`);
        expect(error).not.toContain(PROBE_NOT_BLOCKED);
        expect(error).toContain(constraint);
      });
    }

    // ── the legal shapes ───────────────────────────────────────────────────────────────────────

    it('accepts a well-formed INCOME receipt — the guard is a filter, not a wall', async () => {
      const error = await runProbe(rollbackProbeSql([insertTransaction()]));
      expect(error).toContain(PROBE_SUCCEEDED);
    });

    it('accepts a well-formed EXPENSE', async () => {
      const error = await runProbe(
        rollbackProbeSql([
          insertTransaction({
            id: `'exp-900'`,
            type: `'EXPENSE'`,
            category: `'maintenance'`,
            expenseCategory: `'MAINTENANCE'`,
            receiptClass: 'NULL',
            capitalSource: 'NULL',
            descriptionAr: `'مصروف صيانة (بيانات وهمية)'`,
          }),
        ]),
      );
      expect(error).toContain(PROBE_SUCCEEDED);
    });

    it('represents an istibdal CAPITAL receipt AND keeps it out of the distribution waterfall', async () => {
      // The load-bearing pair. Istibdal (استبدال) proceeds stand in place of the endowed asset:
      // they are aṣl, not ghallah, and the non-diminution invariant means they can never be paid
      // out to beneficiaries. Both halves are checked inside ONE transaction, then rolled back.
      const error = await runProbe(
        rollbackProbeSql([
          insertTransaction({
            id: `'rev-901'`,
            category: `'istibdal_proceeds'`,
            receiptClass: `'CAPITAL'`,
            capitalSource: `'ISTIBDAL_PROCEEDS'`,
            amountSar: '20000000.00',
            descriptionAr: `'عوض استبدال (بيانات وهمية)'`,
          }),
          `IF NOT EXISTS (
           SELECT 1 FROM "transaction"
            WHERE "id" = 'rev-901' AND "receiptClass" = 'CAPITAL'
              AND "capitalSource" = 'ISTIBDAL_PROCEEDS'
         ) THEN
           RAISE EXCEPTION 'CAPITAL_RECEIPT_NOT_REPRESENTABLE' USING ERRCODE = 'P0001';
         END IF`,
          `IF EXISTS (
           SELECT 1 FROM "transaction"
            WHERE "id" = 'rev-901' AND "type" = 'REVENUE' AND "receiptClass" = 'INCOME'
         ) THEN
           RAISE EXCEPTION 'CAPITAL_LEAKED_INTO_THE_DISTRIBUTION_WATERFALL' USING ERRCODE = 'P0001';
         END IF`,
        ]),
      );
      expect(error).not.toContain('CAPITAL_RECEIPT_NOT_REPRESENTABLE');
      expect(error).not.toContain('CAPITAL_LEAKED_INTO_THE_DISTRIBUTION_WATERFALL');
      expect(error).toContain(PROBE_SUCCEEDED);
    });

    it('accepts CAPITAL/OTHER once it carries an Arabic explanation', async () => {
      const error = await runProbe(
        rollbackProbeSql([
          insertTransaction({
            id: `'rev-902'`,
            category: `'other_capital'`,
            receiptClass: `'CAPITAL'`,
            capitalSource: `'OTHER'`,
            capitalSourceNoteAr: `'عوض نزع ملكية جزئي (بيانات وهمية)'`,
          }),
        ]),
      );
      expect(error).toContain(PROBE_SUCCEEDED);
    });

    // ── the seeded ledger obeys the same rules ─────────────────────────────────────────────────

    it('classifies the four seeded rent receipts as INCOME and leaves expenses unclassified', async () => {
      const prisma = await privilegedPrisma();

      const revenue = await prisma.transaction.findMany({
        where: { type: 'REVENUE', receiptClass: 'INCOME' },
        orderBy: { id: 'asc' },
      });
      // Was ['rev-001','rev-002'] until S5/E4 added rev-003 (waqf-002's rent) with the fixture
      // delta, and ['rev-001'…'rev-003'] until M1-b added rev-006 (waqf-007's rent — the computing
      // lineage sibling's yield). The CAPITAL receipts are asserted separately below — exactly NOT
      // income.
      expect(revenue.map((row) => row.id)).toEqual(['rev-001', 'rev-002', 'rev-003', 'rev-006']);
      for (const row of revenue) {
        expect(row.receiptClass).toBe('INCOME');
        expect(row.capitalSource).toBeNull();
      }

      const expenses = await prisma.transaction.findMany({
        where: { type: 'EXPENSE' },
        orderBy: { id: 'asc' },
      });
      expect(expenses).toHaveLength(3);
      for (const row of expenses) {
        expect(row.receiptClass).toBeNull();
        expect(row.capitalSource).toBeNull();
        expect(row.expenseCategory).not.toBeNull();
      }
    });

    it('seeds EXACTLY TWO CAPITAL receipts, on TWO endowments — and both are corpus', async () => {
      // ⚠ INVERTED IN S5/E4. This test pinned zero CAPITAL rows ("the seed classified only what is
      // uncontested"), which left every "no corpus leakage" claim proven over a set with nothing
      // to leak (FIXTURE_DELTA_REQUIRED named it). rev-004 is the compensation exp-001 records —
      // an UNCONTESTED capital classification (expropriation compensation is corpus by Binding
      // rule 1's own text).
      //
      // ⊕ WIDENED IN S7, AND THE SECOND ROW IS NOT A DUPLICATE OF THE FIRST. One capital row was
      // enough to prove the CONSTRAINTS and not enough to prove the WATERFALL: rev-004 lives on
      // waqf-003, while the distribution run V-1/G-9 exercises is on **waqf-001**. Such a run
      // excludes rev-004 on the `waqfId` filter before `receiptClass` is ever consulted — endowment
      // scoping wearing the corpus guard's name. rev-005 is waqf-001's own capital receipt
      // (istibdal proceeds, on asset-002, the same asset rev-001's rent comes from), so the class
      // is the only remaining explanation for its exclusion.
      //
      // ⚠ THE CONTESTED CLASSIFICATIONS STAY UNSEEDED, and that is unchanged by rev-005:
      // CLAUDE.md item #8 rules istibdal proceeds = capital (S4 owner memo Q6), while lease
      // premium / key money, insurance proceeds on a destroyed building, post-istibdal rent
      // arrears and an income-funded ṣiyāna reserve remain UNRULED and get no fixture subject —
      // every REVENUE row must carry a class at entry, so seeding one would BE the answer.
      const prisma = await privilegedPrisma();
      const capital = await prisma.transaction.findMany({
        where: { receiptClass: 'CAPITAL' },
        orderBy: { id: 'asc' },
      });
      expect(capital.map((row) => row.id)).toEqual(['rev-004', 'rev-005']);
      expect(capital.map((row) => [row.id, row.capitalSource, row.waqfId])).toEqual([
        ['rev-004', 'EXPROPRIATION_COMPENSATION', 'waqf-003'],
        ['rev-005', 'ISTIBDAL_PROCEEDS', 'waqf-001'],
      ]);
      // Both are REVENUE rows: a capital receipt is an INFLOW that is corpus, not an expense, and
      // `transaction_expense_has_no_receipt_class` would refuse the alternative anyway.
      for (const row of capital) expect(row.type).toBe('REVENUE');
    });

    it('carries the income-only waterfall index', async () => {
      const prisma = await privilegedPrisma();
      const indexes = await prisma.$queryRawUnsafe<{ indexdef: string }[]>(
        `SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'transaction'`,
      );
      const combined = indexes.map((row) => row.indexdef).join('\n');
      // The engine's only legal input is (waqfId, type, receiptClass, date) — the index exists so
      // "income only" stays the cheap query and nobody is tempted to widen it.
      expect(combined).toMatch(/waqfId[\s\S]*type[\s\S]*receiptClass[\s\S]*date/);
    });

    // ── what is deliberately NOT constrained ───────────────────────────────────────────────────

    it('does NOT enforce distribution money-conservation at the database', async () => {
      // Deliberate (E1 contract decision 9): conservation is a §08 ENGINE invariant, and the
      // fixture's own historical dist-001 violates it, so a CHECK would make the fixture
      // unseedable. Asserted so the absence is a recorded decision, not an oversight.
      const prisma = await privilegedPrisma();
      const constraints = await prisma.$queryRawUnsafe<{ conname: string }[]>(
        `SELECT conname FROM pg_constraint
        WHERE contype = 'c' AND conrelid = 'public.distribution'::regclass`,
      );
      expect(constraints.map((row) => row.conname)).not.toContain('distribution_conservation');

      const distribution = await prisma.distribution.findUniqueOrThrow({
        where: { id: 'dist-001' },
      });
      const trace = distribution.computationTrace as Record<string, unknown>;
      expect(trace.origin).toBe('fixture-historical');
      expect(trace.fixtureTotalSar).toBe('279000.00');
    });

    it.todo(
      'SURFACED (FIQH): the per-receipt-type income-vs-capital RULES are not settled. ADR-0002 is ' +
        'PROVISIONAL and BUILD-PLAN records the Sharia review as UNSIGNED. Open questions the ' +
        'structure above does not answer: lease premium / key money; insurance proceeds on a ' +
        'destroyed building; rent arrears collected after an istibdal (old corpus or new?); whether ' +
        'an income-funded ṣiyāna reserve becomes corpus once accumulated; whether a CAPITAL receipt ' +
        'belongs in `transaction` at all rather than a separate CorpusMovement entity. The seed ' +
        'classifies only the two rent receipts, because rent is the one uncontested case.',
    );

    it.todo(
      'SURFACED (SCOPE): the ledger ADR §7 requires a real per-endowment/per-property operational ' +
        'chart of accounts with explicit corpus/income account classes before E5/E6. ' +
        '`Transaction.category` currently carries the raw fixture string. receiptClass satisfies ' +
        'Binding rule 1 structurally; it does NOT discharge that requirement, and Sprint 1 must not ' +
        'be logged as having closed it.',
    );
  },
);
