/**
 * ⊕ S11 item 2a — THE DASHBOARDS' READ LAYER, on the wire.
 *
 * E10's exit is "both dashboards render live fixture data; an overdue Authority update lights the KPI
 * red" — and before this stage NO read derived any KPI. This file drives the three reads the boards
 * consume, each against the seeded fixture at a STATED clock (never the wall clock), so every state
 * family §14 names is proven on a real row or a real absence:
 *
 *  1. `deadline.board` — every seeded endowment's rules, with the state DERIVED at the clock and the
 *     CAUSE named where no row exists; the six endowments between them cover: overdue · met · open ·
 *     not recorded · recorded-not-computable · routed/no home · not computed · not-in-scope-yet ·
 *     no subject; and the whole board `cannot_compute` when the clock is outside calendar coverage;
 *  2. KPI 1's gating: danger iff a zero-tolerance head is overdue; warning iff anything is
 *     indeterminate; success ONLY when every clock is computed and none overdue — no override to green
 *     (the fixture has NO green endowment, and the test says so rather than manufacturing one);
 *  3. `finance.summary` — exact sums from the ledger with INCOME and CAPITAL receipts APART (binding
 *     rule 1 on the wire; a mutation folds them and this file goes red), arrears an explicit state;
 *  4. `compliance.amlKpi` — the boolean shape, indeterminate for everyone today, by name;
 *  5. non-disclosure — a seat without the read verb is told NOT_FOUND, never FORBIDDEN.
 *
 * Nothing here writes. Read-only subjects; no cleanup beyond the provisioned seats.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toHijriSnapshot } from '@qmulate/domain/dates';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import {
  API_TEST_PREFIX,
  assertSeeded,
  cleanupApiTestRows,
  contextFor,
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
} from './setup.js';

const createCaller = createCallerFactory(appRouter);

const READER = `${API_TEST_PREFIX}s11-board-reader`;
const NO_VERB = `${API_TEST_PREFIX}s11-board-no-verb`;
const ELSEWHERE = `${API_TEST_PREFIX}s11-board-elsewhere`;
const ALL_WAQFS = ['waqf-001', 'waqf-002', 'waqf-003', 'waqf-004', 'waqf-005', 'waqf-007'];

/** The stated clock: inside calendar coverage (2026-02-22 → 2028-09-23), after every seeded due date. */
const NOW = new Date('2026-09-02T09:00:00.000Z');
/** A stated clock OUTSIDE coverage: the board must say it cannot compute, not guess. */
const BEYOND_COVERAGE = new Date('2029-01-15T09:00:00.000Z');

function hijriOf(day: string): string {
  return String(toHijriSnapshot(new Date(`${day}T00:00:00.000Z`)));
}

async function reader(requestId: string, now: Date = NOW) {
  return createCaller(await contextFor({ userId: READER, requestId, now }));
}

type Board = Awaited<ReturnType<Awaited<ReturnType<typeof reader>>['deadline']['board']>>;
function rule(board: Board, ruleKey: string) {
  const found = board.rules.find((r) => r.ruleKey === ruleKey);
  if (found === undefined) throw new Error(`rule ${ruleKey} missing from the board`);
  return found;
}

describe.runIf(hasDatabase)('S11 item 2a · the dashboards’ read layer', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      {
        id: READER,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: ALL_WAQFS,
        permissions: ['endowment:waqf:read', 'compliance:task:read', 'finance:transaction:read'],
      },
      {
        id: NO_VERB,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: ALL_WAQFS,
        permissions: ['endowment:waqf:read'],
      },
      {
        id: ELSEWHERE,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: ['waqf-002'],
        permissions: ['endowment:waqf:read', 'compliance:task:read', 'finance:transaction:read'],
      },
    ]);
    // Self-healing (the anchor-input file's discipline): a sibling killed mid-file may leave waqf-005 with a
    // recorded anchor or a live non-seed REGISTER row, which would flip NOT_RECORDED. Restore the fixture.
    const raw = await privilegedPrisma();
    await raw.$executeRawUnsafe(
      `UPDATE "waqf" SET "registrationAnchorDate" = NULL, "registrationAnchorDateHijri" = NULL,
         "registrationAnchorKind" = NULL WHERE "id" = 'waqf-005'`,
    );
    await raw.$executeRawUnsafe(
      `UPDATE "deadline" SET "deletedAt" = now()
         WHERE "waqfId" = 'waqf-005' AND "ruleKey" = 'REGISTER_30BD' AND "deletedAt" IS NULL
           AND "id" NOT LIKE 'deadline-%'`,
    );
  });

  afterAll(async () => {
    await cleanupApiTestRows();
  });

  /* ── 1 · the board, endowment by endowment ─────────────────────────────────────────────── */

  it('the board covers all NINE rules for every endowment, in the rule table’s order, with a mode each', async () => {
    const board = await (await reader('s112a-shape')).deadline.board({ waqfId: 'waqf-001' });
    expect(board.rules.map((r) => r.ruleKey)).toStrictEqual([
      'REGISTER_30BD',
      'UPDATE_15BD',
      'ISTIBDAL_10BD',
      'DISTRIBUTE_3M_FYE',
      'KYC_REFRESH',
      'LICENSE_RENEWAL',
      'CONTRACT_RENEWAL',
      'HEARING',
      'RETENTION_10Y',
    ]);
    expect(rule(board, 'LICENSE_RENEWAL').mode).toBe('routed');
    expect(rule(board, 'RETENTION_10Y').mode).toBe('not_a_clock');
    expect(rule(board, 'REGISTER_30BD').zeroTolerance).toBe(true);
    expect(rule(board, 'UPDATE_15BD').zeroTolerance).toBe(true);
    expect(board.calendar.available).toBe(true);
    expect(board.calendar.coverage).toStrictEqual({ from: '2026-02-22', to: '2028-09-23' });
    expect(board.asOf).toStrictEqual({ gregorian: '2026-09-02', hijri: hijriOf('2026-09-02') });
    expect(board.unverifiedNote).toMatch(/verify — may be stale/);
  });

  it('waqf-001 — the seeded REGISTER_30BD row is OVERDUE at the clock, so KPI 1 is DANGER; the certificate is NOT RECORDED; licences are ROUTED; retention is not a clock', async () => {
    const board = await (await reader('s112a-001')).deadline.board({ waqfId: 'waqf-001' });
    const register = rule(board, 'REGISTER_30BD');
    expect(register.rows).toHaveLength(1);
    const row = register.rows[0];
    expect(row?.state).toBe('overdue');
    expect(row?.businessDaysRemaining).not.toBeNull();
    expect(Number(row?.businessDaysRemaining)).toBeLessThan(0);
    expect(row?.dueDateHijri).toBe('1447-10-26');
    expect(register.cause).toBeNull();
    expect(rule(board, 'UPDATE_15BD')).toMatchObject({ rows: [], cause: 'NOT_RECORDED' });
    expect(rule(board, 'ISTIBDAL_10BD')).toMatchObject({ rows: [], cause: 'NO_SUBJECT' });
    expect(rule(board, 'LICENSE_RENEWAL')).toMatchObject({ rows: [], cause: 'ROUTED_NO_HOME' });
    expect(rule(board, 'KYC_REFRESH')).toMatchObject({ rows: [], cause: 'NOT_COMPUTED' });
    expect(rule(board, 'RETENTION_10Y')).toMatchObject({ rows: [], cause: null });
    expect(board.kpi1.tone).toBe('danger');
    expect(board.kpi1.reasons).toContain(`REGISTER_30BD:overdue:${String(row?.id)}`);
    expect(board.kpi1.reasons).toContain('UPDATE_15BD:NOT_RECORDED');
  });

  it('waqf-002 — the DISCHARGED row reads MET with its kind and a derived Hijri twin; KPI 1 is still WARNING because the certificate is not recorded (indeterminate ≠ green)', async () => {
    const board = await (await reader('s112a-002')).deadline.board({ waqfId: 'waqf-002' });
    const register = rule(board, 'REGISTER_30BD');
    expect(register.rows).toHaveLength(1);
    expect(register.rows[0]).toMatchObject({
      state: 'met',
      dischargeKind: 'MET',
      satisfiedAtHijri: hijriOf('2026-04-20'),
      businessDaysRemaining: null,
    });
    expect(board.kpi1.tone).toBe('warning');
    expect(board.kpi1.reasons).toStrictEqual(['UPDATE_15BD:NOT_RECORDED']);
  });

  it('waqf-003 — THE EXIT’S RED: the certificate arm’s UPDATE_15BD row is OVERDUE, bound to the canonical GOV-REG-02 task; the pending istibdal is NOT RECORDED; the registration clock is NOT RECORDED', async () => {
    const board = await (await reader('s112a-003')).deadline.board({ waqfId: 'waqf-003' });
    const update = rule(board, 'UPDATE_15BD');
    expect(update.rows).toHaveLength(1);
    expect(update.rows[0]).toMatchObject({
      state: 'overdue',
      complianceTaskId: 'task-gov-reg-02-waqf-003',
      dueDateHijri: '1447-12-23',
      dischargeKind: null,
    });
    expect(new Date(String(update.rows[0]?.dueDate)).toISOString().slice(0, 10)).toBe('2026-06-09');
    expect(rule(board, 'ISTIBDAL_10BD')).toMatchObject({ rows: [], cause: 'NOT_RECORDED' });
    expect(rule(board, 'REGISTER_30BD')).toMatchObject({ rows: [], cause: 'NOT_RECORDED' });
    expect(board.kpi1.tone).toBe('danger');
    expect(board.kpi1.reasons).toContain(`UPDATE_15BD:overdue:${String(update.rows[0]?.id)}`);
  });

  it('waqf-004 — a VALID certificate outside the lead is NOT_IN_SCOPE_YET (nothing due, said as its own cause), while the open registration row is overdue', async () => {
    const board = await (await reader('s112a-004')).deadline.board({ waqfId: 'waqf-004' });
    expect(rule(board, 'UPDATE_15BD')).toMatchObject({ rows: [], cause: 'NOT_IN_SCOPE_YET' });
    expect(rule(board, 'REGISTER_30BD').rows[0]?.state).toBe('overdue');
    expect(board.kpi1.tone).toBe('danger');
    // NOT_IN_SCOPE_YET is not indeterminate — it never appears among the reasons.
    expect(board.kpi1.reasons.some((r) => r.includes('NOT_IN_SCOPE_YET'))).toBe(false);
  });

  // MEASURED on the first full-suite run: sibling files leave LIVE rows of OTHER rules on waqf-005
  // (a distribution run's timing row, for one) and Vitest does not guarantee file order — so this test
  // pins the two CLOCKS it is about and says nothing about rules it does not own. "Nothing recorded"
  // is a claim about the fixture's inputs, not about what other suites computed on the same endowment.
  it('waqf-005 — nothing recorded: both clocks NOT_RECORDED with no row of their own, KPI 1 WARNING (never green)', async () => {
    const board = await (await reader('s112a-005')).deadline.board({ waqfId: 'waqf-005' });
    expect(rule(board, 'REGISTER_30BD').rows).toHaveLength(0);
    expect(rule(board, 'UPDATE_15BD').rows).toHaveLength(0);
    expect(rule(board, 'REGISTER_30BD').cause).toBe('NOT_RECORDED');
    expect(rule(board, 'UPDATE_15BD').cause).toBe('NOT_RECORDED');
    expect(board.kpi1.tone).toBe('warning');
  });

  it('waqf-007 — the clock-start is RECORDED but NOT COMPUTABLE (outside calendar coverage): the cause says so, KPI 1 WARNING', async () => {
    const board = await (await reader('s112a-007')).deadline.board({ waqfId: 'waqf-007' });
    expect(rule(board, 'REGISTER_30BD')).toMatchObject({
      rows: [],
      cause: 'RECORDED_NOT_COMPUTABLE',
    });
    expect(board.kpi1.tone).toBe('warning');
    expect(board.kpi1.reasons).toContain('REGISTER_30BD:RECORDED_NOT_COMPUTABLE');
  });

  it('no seeded endowment is GREEN — and the test says so instead of manufacturing one (the healthy subject is a row, not a board)', async () => {
    const tones: Record<string, string> = {};
    for (const waqfId of ALL_WAQFS) {
      tones[waqfId] = (
        await (await reader(`s112a-tone-${waqfId}`)).deadline.board({ waqfId })
      ).kpi1.tone;
    }
    expect(Object.values(tones)).not.toContain('success');
    expect(tones).toStrictEqual({
      'waqf-001': 'danger',
      'waqf-002': 'warning',
      'waqf-003': 'danger',
      'waqf-004': 'danger',
      'waqf-005': 'warning',
      'waqf-007': 'warning',
    });
  });

  it('a clock OUTSIDE calendar coverage makes every computed row CANNOT_COMPUTE with the refusal named — and KPI 1 WARNING, never danger from a date nobody could count', async () => {
    const board = await (
      await reader('s112a-beyond', BEYOND_COVERAGE)
    ).deadline.board({
      waqfId: 'waqf-001',
    });
    const row = rule(board, 'REGISTER_30BD').rows[0];
    expect(row?.state).toBe('cannot_compute');
    expect(row?.cannotCompute).not.toBeNull();
    expect(row?.businessDaysRemaining).toBeNull();
    expect(board.kpi1.tone).toBe('warning');
    // The MET row is a recorded fact, not date arithmetic — it stays MET whatever the clock.
    const met = await (
      await reader('s112a-beyond-met', BEYOND_COVERAGE)
    ).deadline.board({
      waqfId: 'waqf-002',
    });
    expect(rule(met, 'REGISTER_30BD').rows[0]?.state).toBe('met');
  });

  /* ── 3 · the financial read — binding rule 1 on the wire ──────────────────────────────── */

  it('finance.summary on waqf-003 — INCOME and CAPITAL receipts APART, exact 2-dp strings, expenses by category, arrears NOT_MODELLED, commingling counted', async () => {
    const summary = await (await reader('s112a-fin-003')).finance.summary({ waqfId: 'waqf-003' });
    expect(summary.receipts.incomeSar).toBe('1800000.00');
    expect(summary.receipts.capitalSar).toBe('20000000.00');
    expect(summary.receipts.capitalBySource).toStrictEqual([
      { source: 'EXPROPRIATION_COMPENSATION', amountSar: '20000000.00' },
    ]);
    expect(summary.expenses.totalSar).toBe('120000.00');
    expect(summary.expenses.byCategory).toStrictEqual([
      { category: 'OPERATIONS', amountSar: '120000.00' },
    ]);
    // Cash includes the corpus — and says how much of it is corpus.
    expect(summary.cashPosition.totalSar).toBe('21680000.00');
    expect(summary.cashPosition.ofWhichCapitalSar).toBe('20000000.00');
    expect(summary.arrears).toStrictEqual({ state: 'NOT_MODELLED' });
    expect(summary.commingling.accountsChecked).toBeGreaterThan(0);
    expect(summary.commingling.nonDedicatedAccounts).toBe(0);
    expect(summary.commingling.receiptsOnNonDedicated).toBe(0);
    expect(summary.excludedRows).toBe(0);
    for (const amount of [summary.receipts.incomeSar, summary.cashPosition.totalSar]) {
      expect(amount).toMatch(/^-?\d+\.\d{2}$/);
    }
  });

  it('finance.summary on waqf-001 — the istibdal proceeds (CAPITAL) never appear as revenue, whatever else the ledger holds', async () => {
    const summary = await (await reader('s112a-fin-001')).finance.summary({ waqfId: 'waqf-001' });
    const istibdal = summary.receipts.capitalBySource.find((s) => s.source === 'ISTIBDAL_PROCEEDS');
    expect(istibdal).toBeDefined();
    // The fixture's rev-005 is 4,200,000.00 of istibdal proceeds; income is rev-001's 350,000.00 plus
    // whatever sibling suites booked — but NEVER the corpus figure.
    expect(BigInt(summary.receipts.capitalSar.replace('.', ''))).toBeGreaterThanOrEqual(420000000n);
    expect(summary.receipts.incomeSar).not.toBe(summary.receipts.capitalSar);
    expect(summary.distributions.count).toBeGreaterThanOrEqual(1);
    expect(summary.distributions.executedDistributableSar).toMatch(/^\d+\.\d{2}$/);
  });

  /**
   * ⊕ S11 item 2c — THE PER-ACCOUNT BLENDING DEFECT, pinned on the endowment where it is UNHEDGED.
   *
   * `cashPosition.totalSar` has carried `ofWhichCapitalSar` since 2a, but the PER-ACCOUNT rows did
   * not: the accumulator added every REVENUE row to `account.receipts` ABOVE the class branch, so
   * `accounts[].netSar` blended CORPUS and INCOME with nothing on the wire saying so. On waqf-001 that
   * single account row reads ~4,475,000.00 of which 4,200,000.00 — 93.9% — is ISTIBDAL PROCEEDS:
   * principal, never distributable, and capital by a RULED classification (S4 memo Q6), so this row
   * opens no fiqh question. waqf-003 shows the same wall at scale but its expropriation compensation
   * is ruled "USUALLY capital" (Q6(d)) — hedged — which is why the pin lives here.
   *
   * WRITTEN TO HAVE CAUGHT IT, not to confirm the fix: it asserts the companion and the net DISAGREE
   * by exactly the corpus figure, so a future refactor that drops the companion — or that reverts the
   * accumulator split — goes RED rather than quiet.
   *
   * ⚠ DEGENERACY DECLARED, not engineered around: every fixture endowment has exactly ONE bank
   * account, so `accounts[0].netSar` is numerically identical to `cashPosition.totalSar` and this
   * assertion cannot distinguish correct PER-ACCOUNT attribution from correct PORTFOLIO attribution.
   * A second account is NOT manufactured to make the test sharper — that would be fixture invention
   * in service of a test, and the defect is real whether or not the fixture can express it.
   */
  it('finance.summary on waqf-001 — every per-account row says how much of its net is CORPUS', async () => {
    const summary = await (await reader('s112c-acct-001')).finance.summary({ waqfId: 'waqf-001' });
    expect(summary.cashPosition.accounts.length).toBeGreaterThan(0);

    for (const account of summary.cashPosition.accounts) {
      // The companion is REQUIRED on the type — never optional, never absent, always 2-dp.
      expect(account.ofWhichCapitalSar, `account ${account.accountRef}`).toMatch(/^\d+\.\d{2}$/);
    }

    const halalas = (sar: string) => BigInt(sar.replace('.', ''));
    const account = summary.cashPosition.accounts.find(
      (row) => halalas(row.ofWhichCapitalSar) > 0n,
    );
    expect(account, 'waqf-001 books its istibdal proceeds on a dedicated account').toBeDefined();
    if (account === undefined) throw new Error('unreachable');

    // rev-005 is 4,200,000.00 of ISTIBDAL_PROCEEDS. Sibling suites book INCOME on this ledger, never
    // capital, so the corpus figure is exact while the net is a floor.
    expect(halalas(account.ofWhichCapitalSar)).toBe(420000000n);
    expect(halalas(account.netSar)).toBeGreaterThan(halalas(account.ofWhichCapitalSar));

    // The blend, stated: the net is NOT the corpus figure, and the difference is the income side.
    expect(account.netSar).not.toBe(account.ofWhichCapitalSar);
    expect(halalas(account.netSar) - halalas(account.ofWhichCapitalSar)).toBeGreaterThan(0n);

    // And the portfolio companion agrees with the sum of the per-account ones — one wall, two
    // altitudes, never two different answers about how much of this endowment is principal.
    const perAccount = summary.cashPosition.accounts.reduce(
      (total, row) => total + halalas(row.ofWhichCapitalSar),
      0n,
    );
    expect(perAccount).toBe(halalas(summary.cashPosition.ofWhichCapitalSar));
  });

  /* ── 4 · KPI 4 — a boolean that renders for everyone, indeterminate today by name ──────── */

  it('compliance.amlKpi — not assessable, said by name; no row read, no leak possible', async () => {
    const kpi = await (await reader('s112a-aml')).compliance.amlKpi({ waqfId: 'waqf-001' });
    expect(kpi).toStrictEqual({
      waqfId: 'waqf-001',
      missedReports: null,
      assessable: false,
      reason: 'AML_TIMELINESS_NOT_MODELLED',
    });
  });

  /* ── 5 · non-disclosure ──────────────────────────────────────────────────────────────── */

  // MEASURED, and corrected toward the system on the first run: a seat GRANTED on the endowment but
  // lacking the verb is refused FORBIDDEN (it already knows the endowment exists — nothing to hide);
  // a seat with NO grant on it is told NOT_FOUND (§10 §7.2's non-disclosure). Two shapes, both asserted.
  it('a seat granted on the endowment WITHOUT the read verb is refused FORBIDDEN on every read', async () => {
    const caller = createCaller(
      await contextFor({ userId: NO_VERB, requestId: 's112a-no-verb', now: NOW }),
    );
    for (const call of [
      () => caller.deadline.board({ waqfId: 'waqf-001' }),
      () => caller.finance.summary({ waqfId: 'waqf-001' }),
      () => caller.compliance.amlKpi({ waqfId: 'waqf-001' }),
    ]) {
      let code: string | null = null;
      try {
        await call();
      } catch (error) {
        code = (error as { code?: string }).code ?? null;
      }
      expect(code).toBe('FORBIDDEN');
    }
  });

  it('a seat with NO grant on the endowment is told NOT_FOUND on every read — never FORBIDDEN (§10 §7.2)', async () => {
    const caller = createCaller(
      await contextFor({ userId: ELSEWHERE, requestId: 's112a-elsewhere', now: NOW }),
    );
    for (const call of [
      () => caller.deadline.board({ waqfId: 'waqf-001' }),
      () => caller.finance.summary({ waqfId: 'waqf-001' }),
      () => caller.compliance.amlKpi({ waqfId: 'waqf-001' }),
    ]) {
      let code: string | null = null;
      try {
        await call();
      } catch (error) {
        code = (error as { code?: string }).code ?? null;
      }
      expect(code).toBe('NOT_FOUND');
      expect(code).not.toBe('FORBIDDEN');
    }
  });
});
