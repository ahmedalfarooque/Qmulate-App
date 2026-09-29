// QMULATE — S7-3's PURE LAYER, ADVERSARIALLY. The DATABASE → ENGINE mapping, with no database.
//
// ⚠ WHY THIS FILE EXISTS AT ALL. `packages/api/src/distribution/{input,maintenance,refusal,subject}.ts`
// were written in ONE pass by an agent that died before running a single assertion against them:
// 123 KB of code whose only evidence was `tsc --noEmit`. "It typechecks" says nothing about whether
// `incomeMinor` is Σ INCOME, whether a corpus receipt reaches the engine, or whether a 5% reserve
// arrives as 5% or as 0.05%. This suite is the evidence. Every number below was MEASURED by running
// it, never copied from a docstring — several docstrings turned out to be right, one turned out to be
// describing a branch that could not be reached honestly (see `receiptClass` below).
//
// ── WHAT IT PROVES, IN ONE LIST ───────────────────────────────────────────────────────────────
//  1. SAR → halala: exact, `bigint`, and a JS number is refused by NAME rather than coerced.
//  2. `incomeMinor === Σ INCOME` exactly — and both off-by-one directions are refused by the engine
//     with DIFFERENT codes (`CORPUS_NOT_DISTRIBUTABLE` above, `DISTRIBUTION_INPUT_INVALID` below).
//  3. THE CORPUS WALL: `rev-005` (CAPITAL, istibdal proceeds, waqf-001) reaches `receipts[]`, and the
//     engine's `CAPITAL_RECEIPTS_EXCLUDED` flag EXISTS ONLY BECAUSE IT DID. The counter-case — a
//     caller that filters CAPITAL out first — is asserted too: it still computes, silently, with the
//     corpus invisible instead of visibly excluded.
//  4. The unit trap, both directions: the deed's 0–1 rate is ×100; the Nazir Setting's 0–100 string
//     is verbatim. A 100× error here comes off the top of every beneficiary's share.
//  5. All SIX `MAINTENANCE_RULE_KINDS` are reachable from the resolver, deed-wins is what the code
//     does, and the Q-S7-1 conflict on `waqf-001` is VISIBLE to the caller rather than swallowed.
//  6. A reversed original and its reversal are BOTH dropped; a correction re-entry is kept.
//  7. `reversionClauseCaptured === false` is a caller-side refusal named `REVERSION_CLAUSE_UNREAD`.
//  8. The run's subject id is deterministic and round-trippable.
//  9. `resolveRefusal` reads `details.refusal` — with a test that proves keying on `err.code` alone
//     is INSUFFICIENT, because twenty-six refusals share `SHART_INCOMPLETE`.
//
// ── THE FIXTURE ROWS ARE THE SEEDED ONES, AND THE SHART JSON WAS MEASURED, NOT INVENTED ───────
// `WAQF_001_SHART` below is a byte-for-byte copy of what `buildShartAlWaqif(waqf-001, …)` in
// `packages/database/src/seed/shart.ts` returns — dumped from that function in this change rather
// than reconstructed from its zod schema. It is copied rather than imported because `shart.ts` is not
// in `@qmulate/database`'s `exports` map and this suite must stay pure (no Prisma engine, no DB).
// ⚠ THE COST IS NAMED: this is a hand-carried copy, so it can drift from the seed. What it CANNOT do
// is drift silently in a way that matters — S7-4's integration test drives the same mapper over the
// real seeded row, and `readShartForRun` refuses every shape it does not recognise rather than
// sentinel-defaulting, so a drifted key surfaces as `SHART_UNREADABLE`, not as a wrong number.

import { describe, expect, it } from 'vitest';

import { DomainError, UNVERIFIED_NOTE, isDomainError, type SettingEnvelope } from '@qmulate/domain';
import arMessages from '@qmulate/i18n/messages/ar.json';
import enMessages from '@qmulate/i18n/messages/en.json';
import {
  CAPITAL_SOURCES,
  ENGINE_VERSION,
  MAINTENANCE_RULE_KINDS,
  SHART_REFUSALS,
  canonicalizeResult,
  runDistribution,
  type DistributionInputRaw,
  type MaintenanceRuleKind,
} from '@qmulate/domain/distribution';

import {
  buildDistributionInput,
  excludeReversedPairs,
  ledgerWindowWhere,
  periodWindow,
  readShartForRun,
  type BeneficiaryRunRow,
  type BuildDistributionInputArgs,
  type DistributionRunSettings,
  type LedgerRunRow,
  type WaqfRunRow,
} from '../src/distribution/input.js';
import {
  PLAIN_DECIMAL,
  resolveMaintenanceRule,
  sarToMinor,
  significantDigits,
  timesOneHundred,
  type ShartMaintenanceReserve,
} from '../src/distribution/maintenance.js';
import {
  MAPPER_REFUSALS,
  MAPPING_DIAGNOSTICS,
  mapperRefusal,
  mappingDiagnostic,
  resolveRefusal,
  type MapperRefusal,
} from '../src/distribution/refusal.js';
import {
  DISTRIBUTION_RUN_APPROVAL_TYPE,
  DISTRIBUTION_RUN_ARTIFACT_KIND,
} from '../src/distribution/subject.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The seeded record, as rows
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ✅ MEASURED — the exact object `buildShartAlWaqif` returns for `waqf-001`.
 *
 * Note what a `.strict()` discriminated union means for the reader: `maintenanceReserve` carries
 * ONLY `{ kind, amountSar }` — there is no `rate` key and no `targetBalanceSar` key to be `null`.
 * `reversion` carries ONLY `{ status: 'none' }` — no `kind`, no `ultimateTakerIds`. A mapper that
 * required those keys to be present-and-null would refuse every seeded deed; this one reads absence
 * as `null`, which is why the run works at all.
 */
const WAQF_001_SHART = {
  schemaVersion: 1,
  sourceDocumentId: null,
  narrativeAr: null,
  narrativeEn: 'fixture narrative',
  orderRule: 'ORDERED',
  continuationStipulation: 'ZUHUR_ONLY',
  reversion: { status: 'none' },
  tiers: [
    {
      tabaqa: 1,
      labelAr: 'الطبقة الأولى',
      labelEn: 'First tier',
      lines: ['BUTUN', 'ZUHUR'],
      stipulatedWeight: null,
    },
    {
      tabaqa: 2,
      labelAr: 'الطبقة الثانية',
      labelEn: 'Second tier',
      lines: ['ZUHUR'],
      stipulatedWeight: null,
    },
  ],
  maintenanceReserve: { kind: 'fixed', amountSar: '40000.00' },
  disbursementChannel: {
    kind: 'FAMILY',
    familySharePercent: null,
    charitableSharePercent: null,
    charitablePurposeAr: null,
  },
  disbursementSchedule: 'QUARTERLY',
  nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: 10, amountSar: null },
  nazarahSuccession: { specified: true, ruleAr: 'النظارة للواقف مدة حياته ثم للأصلح من ذريته' },
  completeness: { status: 'COMPLETE', missing: [], advisory: ['TIER_WEIGHTS_NOT_STIPULATED'] },
} as const;

/** A deep-ish clone so a per-test override never leaks into the next test. */
const shart = (patch: Record<string, unknown> = {}): Record<string, unknown> => ({
  ...structuredClone(WAQF_001_SHART as unknown as Record<string, unknown>),
  ...patch,
});

const waqf001 = (patch: Partial<WaqfRunRow> = {}): WaqfRunRow => ({
  id: 'waqf-001',
  classification: 'MEDIUM',
  type: 'FAMILY_DHURRI',
  entitlementOrder: 'ORDERED',
  continuationStipulation: 'ZUHUR_ONLY',
  fiscalYearEnd: '12-31',
  reversionClauseCaptured: true,
  reversionKind: null,
  shartAlWaqif: shart(),
  ...patch,
});

/** `ben-001` — a SON of the waqif, ṭabaqa 1, verified, KYC refreshed. */
const BEN_001: BeneficiaryRunRow = {
  id: 'ben-001',
  kind: 'FAMILY',
  active: true,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '12.5',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: new Date('2026-01-15T00:00:00.000Z'),
  categoryDescriptionAr: null,
  residency: 'DOMESTIC',
};

/** `ben-001` · `ben-002` · `ben-003` exactly as `data/fixtures/sample-waqf.json` records them. */
const BENEFICIARIES: readonly BeneficiaryRunRow[] = [
  {
    id: 'ben-001',
    kind: 'FAMILY',
    active: true,
    tabaqa: 1,
    parentId: null,
    lineageLink: 'SON',
    line: 'ZUHUR',
    branch: 'Branch A',
    stipulatedWeight: '12.5',
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: new Date('2026-01-15T00:00:00.000Z'),
    categoryDescriptionAr: null,
    residency: 'DOMESTIC',
  },
  {
    id: 'ben-002',
    kind: 'FAMILY',
    active: true,
    tabaqa: 2,
    parentId: 'ben-001',
    lineageLink: 'SON',
    line: 'ZUHUR',
    branch: 'Branch A',
    stipulatedWeight: '12.5',
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: new Date('2026-01-15T00:00:00.000Z'),
    categoryDescriptionAr: null,
    residency: 'DOMESTIC',
  },
  {
    id: 'ben-003',
    kind: 'FAMILY',
    active: true,
    tabaqa: 1,
    parentId: null,
    lineageLink: 'DAUGHTER',
    line: 'BUTUN',
    branch: 'Branch B',
    stipulatedWeight: '12.5',
    verificationStatus: 'PENDING',
    kycLastRefreshed: null,
    categoryDescriptionAr: null,
    residency: 'DOMESTIC',
  },
];

const ledgerRow = (patch: Partial<LedgerRunRow> & Pick<LedgerRunRow, 'id'>): LedgerRunRow => ({
  type: 'REVENUE',
  receiptClass: 'INCOME',
  capitalSource: null,
  expenseCategory: null,
  amountSar: '1.00',
  date: new Date('2026-02-17T00:00:00.000Z'),
  reversalOfId: null,
  deletedAt: null,
  ...patch,
});

/** `rev-001` — waqf-001's only INCOME receipt in Q1-2026. 350,000.00 SAR of rent on asset-002. */
const REV_001 = ledgerRow({
  id: 'rev-001',
  receiptClass: 'INCOME',
  amountSar: '350000.00',
  date: new Date('2026-03-31T00:00:00.000Z'),
});

/**
 * `rev-005` — THE CORPUS ROW, and the whole reason this suite can prove the wall.
 *
 * Same endowment as `rev-001`, same period, same asset. Only its CLASS can explain its exclusion.
 */
const REV_005 = ledgerRow({
  id: 'rev-005',
  receiptClass: 'CAPITAL',
  capitalSource: 'ISTIBDAL_PROCEEDS',
  amountSar: '4200000.00',
  date: new Date('2026-02-17T00:00:00.000Z'),
});

/** `exp-e-001` — a PAID ṣiyāna cost. Deliberately NOT the reserve, and NOT an operating cost. */
const EXP_MAINTENANCE = ledgerRow({
  id: 'exp-e-001',
  type: 'EXPENSE',
  receiptClass: null,
  expenseCategory: 'MAINTENANCE',
  amountSar: '40000.00',
  date: new Date('2026-02-10T00:00:00.000Z'),
});

const envelope = <T>(v: T, unit: string | null, unverified = false): SettingEnvelope<T> => ({
  v,
  unit,
  unverified,
  source: 'unit fixture',
  ...(unverified ? { note: UNVERIFIED_NOTE } : {}),
});

/**
 * The seeded `Setting` rows, resolved.
 *
 * ⚠ THE TWO SCALES ARE HERE, SIDE BY SIDE, AND THEY DISAGREE ON PURPOSE:
 * `maintenanceNazirDiscretionPercent` is `'5'` — a STRING out of 100 (`ratePercectSchema`);
 * `nazirFeePercentOfRevenue` is `10` — a NUMBER out of 100 (`percentValue`).
 * `Setting['distribution.maintenance.nazirDiscretionPercent'] = '5'` and
 * `Setting['nazirFee.percentOfRevenue'] = 10` are the ONLY two per-waqf rows in the whole seed, and
 * both sit on `waqf-001`.
 */
const settings = (patch: Partial<DistributionRunSettings> = {}): DistributionRunSettings => ({
  kycRefreshMonths: envelope(12, 'months', true),
  roundingUnitMinor: envelope(1, 'halala'),
  roundingMethod: envelope('LARGEST_REMAINDER_HALF_UP' as const, null, true),
  bindingCalendar: envelope('EARLIER_OF' as const, null, true),
  distributionWindowMonths: envelope(3, 'months', true),
  maintenanceNazirDiscretionPercent: envelope('5', 'percent', true),
  nazirFeePercentOfRevenue: envelope(10, 'percent', true),
  ...patch,
});

/** dist-001's period: Q1 2026. */
const PERIOD = { start: '2026-01-01', end: '2026-03-31' } as const;
/** A fixed instant so `asOf` and therefore `TIMING_STATUS` are reproducible. */
const NOW = new Date('2026-04-15T09:00:00.000Z');

const build = (patch: Partial<BuildDistributionInputArgs> = {}) =>
  buildDistributionInput({
    waqf: waqf001(),
    beneficiaries: BENEFICIARIES,
    ultimateTakerIds: [],
    ledger: [REV_001, REV_005, EXP_MAINTENANCE],
    settings: settings(),
    period: PERIOD,
    deadline: { gregorian: '2027-03-31', hijri: '1448-10-22' },
    now: NOW,
    ...patch,
  });

/** Catch a thrown refusal and name it. Fails loudly if nothing was thrown. */
const refusalOf = (fn: () => unknown): ReturnType<typeof resolveRefusal> => {
  try {
    fn();
  } catch (error) {
    return resolveRefusal(error);
  }
  throw new Error(
    'expected a refusal, and nothing was thrown — a test that cannot fail is not a test',
  );
};

const diagnosticCodes = (mapping: {
  diagnostics: readonly { code: string }[];
}): readonly string[] => mapping.diagnostics.map((d) => d.code);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · SAR → halala
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('1 · SAR → halala', () => {
  it('converts a 2-decimal SAR string to exact halalas as a bigint', () => {
    const minor = sarToMinor('350000.00', 'rev-001.amountSar');
    expect(minor).toBe(35_000_000n);
    expect(typeof minor).toBe('bigint');
  });

  it('converts a 0-decimal SAR string to exact halalas as a bigint', () => {
    const minor = sarToMinor('4200000', 'rev-005.amountSar');
    expect(minor).toBe(420_000_000n);
    expect(typeof minor).toBe('bigint');
  });

  it("carries a Decimal-shaped column value (Prisma's `Decimal(18,2)`) exactly", () => {
    // ⚠ MEASURED SEAM, worth knowing before S7-4 writes the router: `sarToMinor`'s parameter type is
    // `MoneyInput` = `string | Decimal`, and `money()` REFUSES a plain `{ toString() }` object by name
    // (`MONEY_INVALID`). `LedgerRunRow.amountSar` is declared `string | { toString(): string }`, so the
    // builder narrows it through its private `asMoneyInput` first. A real Prisma `Decimal` satisfies
    // both paths; a hand-rolled stub only satisfies the builder's. Assert the builder's path, which is
    // the one a router actually uses.
    const decimalShaped = ledgerRow({
      id: 'rev-dec',
      amountSar: { toString: () => '40000.00' },
      date: new Date('2026-03-01T00:00:00.000Z'),
    });
    expect(build({ ledger: [decimalShaped] }).input.revenue.incomeMinor).toBe(4_000_000n);
    expect(refusalOf(() => sarToMinor({ toString: () => '1.00' } as never, 'x')).code).toBe(
      'MONEY_INVALID',
    );
  });

  it('refuses a JS number by NAME rather than coercing it', () => {
    // ⚠ The point is not that it throws — it is that the MONEY_* code survives. Flattening this into
    // one mapper refusal would report "the amount was unusable" where the engine's own vocabulary
    // can say "money is never a JS number", and that sentence already exists in both locales.
    const refusal = refusalOf(() => sarToMinor(350_000 as never, 'rev-001.amountSar'));
    expect(refusal.code).toBe('MONEY_NUMBER_INPUT');
    expect(refusal.refusal).toBeNull();
    expect(refusal.messageKey).toBe('errors.domain.MONEY_NUMBER_INPUT');
  });

  it('refuses a third decimal place rather than rounding it away', () => {
    expect(refusalOf(() => sarToMinor('100.005', 'x')).code).toBe('MONEY_PRECISION');
  });

  it('carries every receipt amount into the engine input as a bigint, never a number', () => {
    const { input } = build();
    for (const receipt of input.revenue.receipts) {
      expect(typeof receipt.amountMinor).toBe('bigint');
    }
    expect(typeof input.revenue.incomeMinor).toBe('bigint');
    expect(typeof input.operatingCostMinor).toBe('bigint');
    // `policy.roundingUnitMinor` comes off a `Setting` whose `v` is a JS number (an arithmetic knob,
    // not money). It must still reach the engine as 1n — anything else is `SETTING_INVALID`.
    expect(input.policy.roundingUnitMinor).toBe(1n);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · incomeMinor === Σ INCOME, exactly, in both directions
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('2 · incomeMinor is Σ INCOME exactly', () => {
  it('sums the INCOME receipts and nothing else', () => {
    const { input } = build();
    const sumOfIncome = input.revenue.receipts
      .filter((r) => r.receiptClass === 'INCOME')
      .reduce((total, r) => total + r.amountMinor, 0n);
    expect(input.revenue.incomeMinor).toBe(35_000_000n);
    expect(input.revenue.incomeMinor).toBe(sumOfIncome);
    // and the CAPITAL row is NOT in it, even though it is in `receipts`
    expect(input.revenue.receipts).toHaveLength(2);
    expect(sumOfIncome).not.toBe(
      input.revenue.receipts.reduce((total, r) => total + r.amountMinor, 0n),
    );
  });

  it('is what the engine demands: one halala TOO MUCH is CORPUS_NOT_DISTRIBUTABLE', () => {
    const { input } = build();
    const inflated: DistributionInputRaw = {
      ...input,
      revenue: { ...input.revenue, incomeMinor: input.revenue.incomeMinor + 1n },
    };
    const refusal = refusalOf(() => runDistribution(inflated));
    expect(refusal.code).toBe('CORPUS_NOT_DISTRIBUTABLE');
  });

  it('is what the engine demands: one halala TOO LITTLE is DISTRIBUTION_INPUT_INVALID', () => {
    // ⚠ TWO DIRECTIONS, TWO CODES, AND THE ASYMMETRY IS THE POINT. Declaring MORE income than the
    // classified receipts carry is a claim on corpus; declaring LESS is a caller that lost a row.
    // A mapper tested only in one direction would pass with `>=`.
    const { input } = build();
    const short: DistributionInputRaw = {
      ...input,
      revenue: { ...input.revenue, incomeMinor: input.revenue.incomeMinor - 1n },
    };
    const refusal = refusalOf(() => runDistribution(short));
    expect(refusal.code).toBe('DISTRIBUTION_INPUT_INVALID');
    expect(refusal.code).not.toBe('CORPUS_NOT_DISTRIBUTABLE');
  });

  it('computes untouched — so the two refusals above are about the mutation, not the fixture', () => {
    const { input } = build();
    expect(() => runDistribution(input)).not.toThrow();
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · THE CORPUS WALL
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('3 · the corpus wall — a CAPITAL receipt survives into receipts[]', () => {
  it('carries rev-005 to the engine with its capitalSource intact', () => {
    const { input } = build();
    const capital = input.revenue.receipts.find((r) => r.id === 'rev-005');
    expect(capital).toBeDefined();
    expect(capital?.receiptClass).toBe('CAPITAL');
    expect(capital?.capitalSource).toBe('ISTIBDAL_PROCEEDS');
    expect(capital?.amountMinor).toBe(420_000_000n);
    // istibdal proceeds are corpus (asl / أصل) — RULED, S4 owner memo Q6. They may be SEEN, never spent.
    expect(input.revenue.incomeMinor).toBe(35_000_000n);
  });

  it('records the pass-through as a diagnostic naming the receipt id', () => {
    const mapping = build();
    const passed = mapping.diagnostics.find((d) => d.code === 'CAPITAL_RECEIPTS_PASSED_TO_ENGINE');
    expect(passed).toBeDefined();
    expect(passed?.severity).toBe('NOTICE');
    expect(passed?.detail['capitalReceiptIds']).toBe('rev-005');
    expect(passed?.detail['engineFlagExpected']).toBe('CAPITAL_RECEIPTS_EXCLUDED');
  });

  it('makes the engine raise CAPITAL_RECEIPTS_EXCLUDED and trace the id it excluded', () => {
    const result = runDistribution(build().input);
    expect(result.waterfall.revenueMinor).toBe(35_000_000n);
    expect(result.waterfall.capitalReceiptsMinor).toBe(420_000_000n);
    expect(result.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
    const step = result.computationTrace.find(
      (entry) => entry.code === 'CAPITAL_RECEIPTS_EXCLUDED',
    );
    expect(step).toBeDefined();
    expect(JSON.stringify(step?.data)).toContain('rev-005');
    // and the corpus is in NO figure below revenue
    expect(result.waterfall.netIncomeMinor).toBe(31_000_000n);
    expect(result.waterfall.distributableMinor).toBe(27_500_000n);
  });

  it('🔴 THE COUNTER-CASE: a caller that filters CAPITAL out first still computes, SILENTLY', () => {
    // This is the defect the wall exists to prevent, executed. It is not hypothetical: `where:
    // { receiptClass: 'INCOME' }` is the single most natural thing to write in the router, it looks
    // like the corpus guard, and it produces a run that is arithmetically identical and audit-blind.
    const filtered = build({ ledger: [REV_001, EXP_MAINTENANCE] });
    const result = runDistribution(filtered.input);
    expect(result.waterfall.distributableMinor).toBe(27_500_000n); // identical to the honest run
    expect(result.waterfall.capitalReceiptsMinor).toBe(0n); // the corpus has VANISHED
    expect(result.flags).not.toContain('CAPITAL_RECEIPTS_EXCLUDED');
    expect(result.computationTrace.some((e) => e.code === 'CAPITAL_RECEIPTS_EXCLUDED')).toBe(false);
    expect(diagnosticCodes(filtered)).not.toContain('CAPITAL_RECEIPTS_PASSED_TO_ENGINE');
  });

  it('raises the flag on a ZERO-halala capital row — the flag keys on PRESENCE, not on an amount', () => {
    const zeroCapital = ledgerRow({
      id: 'rev-zero',
      receiptClass: 'CAPITAL',
      capitalSource: 'SALE_PROCEEDS',
      amountSar: '0.00',
    });
    const result = runDistribution(build({ ledger: [REV_001, zeroCapital] }).input);
    expect(result.waterfall.capitalReceiptsMinor).toBe(0n);
    expect(result.flags).toContain('CAPITAL_RECEIPTS_EXCLUDED');
  });

  // ⚠ INVERTED 2026-08-20 (AV7-F4). This test used to require `deletedAt` to be IN the `where`
  // (`toEqual(['date','deletedAt','waqfId'])`), which is the pin that made the breach look
  // deliberate: one unapproved `UPDATE "transaction" SET "deletedAt" = now()` on `qmulate_app` took
  // a run's `capitalReceiptsSar` from 4,200,000.00 to 0.00 with no flag, no diagnostic and no trace
  // step, and this assertion was green over it. The soft-delete filter is now the THIRD ABSENT
  // FILTER, absent for the `receiptClass` one's reason exactly — a retired row must be SEEN so the
  // run can refuse by name instead of quietly losing the corpus.
  it('has NO receiptClass, NO reversal and NO deletedAt filter in the ledger `where` — structurally, not by comment', () => {
    const where = ledgerWindowWhere({
      waqfId: 'waqf-001',
      window: periodWindow('2026-01-01', '2026-03-31'),
    });
    // The EXACT key set, in both directions: an absence assertion alone would stay green if the
    // filter came back under another name, and a presence assertion alone would not notice it going.
    expect(Object.keys(where).sort()).toEqual(['date', 'waqfId']);
    expect(where).not.toHaveProperty('deletedAt');
    expect(JSON.stringify(where)).not.toContain('receiptClass');
    expect(JSON.stringify(where)).not.toContain('deleted');
    // and no reversal filter either — `excludeReversedPairs` needs to SEE the reversal rows
    expect(JSON.stringify(where)).not.toContain('reversal');
  });

  // The other half of the same change, and the reason the absence above is safe: the row the query
  // now returns is REFUSED BY NAME rather than counted. Asserted here, next to the query shape, so
  // the two cannot drift apart — a `where` that stopped filtering with nothing refusing downstream
  // would be strictly worse than the breach it replaced.
  it('and a soft-deleted CAPITAL row the query now returns HALTS the run, naming the corpus', () => {
    const retired = ledgerRow({
      id: 'rev-retired',
      receiptClass: 'CAPITAL',
      capitalSource: 'ISTIBDAL_PROCEEDS',
      amountSar: '4200000.00',
      deletedAt: new Date('2026-03-02T00:00:00.000Z'),
    });
    const refusal = refusalOf(() => build({ ledger: [REV_001, retired] }));
    expect(refusal.refusal).toBe('LEDGER_ROW_SOFT_DELETED');
    expect(refusal.refusalSource).toBe('mapper');
    expect(refusal.code).toBe('DISTRIBUTION_INPUT_INVALID');
    // The refusal must NAME the corpus it is halting over — id, class, source and amount. A bare
    // rejection would leave the Nazir where silence left them.
    expect(refusal.details['transactionId']).toBe('rev-retired');
    expect(refusal.details['receiptClass']).toBe('CAPITAL');
    expect(refusal.details['capitalSource']).toBe('ISTIBDAL_PROCEEDS');
    expect(refusal.details['amountSar']).toBe('4200000.00');
    expect(refusal.details['deletedAt']).toBe('2026-03-02T00:00:00.000Z');
    // SAME STRICTNESS FOR INCOME, different stated reason (owner, 2026-08-20, memo "S7 · AV7-F4").
    const retiredIncome = refusalOf(() =>
      build({
        ledger: [
          REV_001,
          ledgerRow({
            id: 'rev-retired-income',
            amountSar: '1000.00',
            deletedAt: new Date('2026-03-02T00:00:00.000Z'),
          }),
        ],
      }),
    );
    expect(retiredIncome.refusal).toBe('LEDGER_ROW_SOFT_DELETED');
    expect(retiredIncome.details['receiptClass']).toBe('INCOME');
  });

  it('refuses a REVENUE row with no receiptClass instead of assuming income', () => {
    const unclassified = ledgerRow({ id: 'rev-bad', receiptClass: null, amountSar: '10.00' });
    const refusal = refusalOf(() => build({ ledger: [REV_001, unclassified] }));
    expect(refusal.refusal).toBe('RECEIPT_CLASS_MISSING');
    expect(refusal.refusalSource).toBe('mapper');
    expect(refusal.code).toBe('RECEIPT_UNCLASSIFIED');
  });

  it('refuses an unrecognised capitalSource rather than nulling it', () => {
    const strange = ledgerRow({
      id: 'rev-strange',
      receiptClass: 'CAPITAL',
      capitalSource: 'LOTTERY_WIN',
      amountSar: '10.00',
    });
    const refusal = refusalOf(() => build({ ledger: [REV_001, strange] }));
    expect(refusal.refusal).toBe('CAPITAL_SOURCE_UNRECOGNISED');
    expect(refusal.details['capitalSource']).toBe('LOTTERY_WIN');
    expect(CAPITAL_SOURCES).not.toContain('LOTTERY_WIN' as never);
  });

  it('hands an UNRECOGNISED receiptClass to the engine verbatim, and does not call it capital', () => {
    // A class the DB CHECK cannot produce, but a bypassed constraint or a future enum member could.
    // The mapper must not decide it is corpus; the engine's RECEIPT_UNCLASSIFIED is the right answer.
    const odd = ledgerRow({ id: 'rev-odd', receiptClass: 'income', amountSar: '10.00' });
    const mapping = build({ ledger: [REV_001, odd] });
    expect(mapping.input.revenue.receipts.map((r) => r.receiptClass)).toContain('income');
    expect(mapping.input.revenue.incomeMinor).toBe(35_000_000n);
    // ⚠ NOT reported as a corpus receipt — "we cannot classify this" is not "this is capital".
    expect(diagnosticCodes(mapping)).not.toContain('CAPITAL_RECEIPTS_PASSED_TO_ENGINE');
    expect(refusalOf(() => runDistribution(mapping.input)).code).toBe('RECEIPT_UNCLASSIFIED');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The unit trap — two sources, two scales
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('4 · rate unit conversion', () => {
  it("passes the Nazir Setting's 0–100 string VERBATIM: '5' stays '5', never '0.05'", () => {
    const { rule } = resolveMaintenanceRule({
      waqfId: 'waqf-001',
      deed: { kind: 'unspecified', amountSar: null, rate: null, targetBalanceSar: null },
      nazirDiscretionPercent: '5',
      reserveFundBalanceMinor: null,
    });
    expect(rule).toEqual({ kind: 'NAZIR_DISCRETION_PERCENT', ratePercent: '5' });
    expect((rule as { ratePercent: string }).ratePercent).not.toBe('0.05');
  });

  it("shifts the deed's 0–1 rate by two places: 0.05 becomes '5', never '0.05' and never a float", () => {
    const { rule } = resolveMaintenanceRule({
      waqfId: 'waqf-002',
      deed: { kind: 'percent', amountSar: null, rate: 0.05, targetBalanceSar: null },
      nazirDiscretionPercent: null,
      reserveFundBalanceMinor: null,
    });
    expect(rule).toEqual({ kind: 'PERCENT', ratePercent: '5' });
    expect((rule as { ratePercent: string }).ratePercent).toBe('5');
  });

  it('does the ×100 as a STRING SHIFT, on a rate where multiplication is provably wrong', () => {
    // ⚠ MEASURED, and it corrected a false claim in `maintenance.ts`'s own header, which said
    // `0.05 * 100` was `5.000000000000001`. It is exactly 5 — the seeded 5% deed is the lucky case.
    expect(0.05 * 100).toBe(5);
    expect(0.07 * 100).toBe(7.000000000000001);
    expect(0.29 * 100).toBe(28.999999999999996);
    // The shift is exact where the multiplication is not. This is the whole reason rates are strings.
    expect(timesOneHundred('0.07', 'x')).toBe('7');
    expect(timesOneHundred('0.29', 'x')).toBe('29');
    const { rule } = resolveMaintenanceRule({
      waqfId: 'w',
      deed: { kind: 'percent', amountSar: null, rate: 0.07, targetBalanceSar: null },
      nazirDiscretionPercent: null,
      reserveFundBalanceMinor: null,
    });
    expect(rule).toEqual({ kind: 'PERCENT', ratePercent: '7' });
  });

  it('is exact on the shift table, including a float residue the seed can actually store', () => {
    expect(timesOneHundred('0.05', 'x')).toBe('5');
    expect(timesOneHundred('0.0025', 'x')).toBe('0.25');
    expect(timesOneHundred('1', 'x')).toBe('100');
    expect(timesOneHundred('0', 'x')).toBe('0');
    expect(timesOneHundred('0.1', 'x')).toBe('10');
    // 2.9 % stored as `2.9 / 100` — the upstream defect the resolver reports rather than repairs
    expect(timesOneHundred('0.028999999999999998', 'x')).toBe('2.8999999999999998');
  });

  it('reports a stored rate that is float residue rather than a figure a human wrote', () => {
    const resolution = resolveMaintenanceRule({
      waqfId: 'waqf-x',
      deed: { kind: 'percent', amountSar: null, rate: 2.9 / 100, targetBalanceSar: null },
      nazirDiscretionPercent: null,
      reserveFundBalanceMinor: null,
    });
    expect(resolution.rule).toEqual({ kind: 'PERCENT', ratePercent: '2.8999999999999998' });
    const reported = resolution.diagnostics.find(
      (d) => d.code === 'MAINTENANCE_PERCENT_RATE_NOT_EXACTLY_REPRESENTABLE',
    );
    expect(reported?.severity).toBe('CONFLICT');
    expect(reported?.detail['storedRate']).toBe('0.028999999999999998');
    expect(significantDigits('0.028999999999999998')).toBe(17);
    expect(significantDigits('0.05')).toBe(1);
  });

  it("carries the deed's Nazir fee percentage as an out-of-100 string: 10 becomes '10'", () => {
    const { input } = build();
    expect(input.nazirFee).toEqual({ basis: 'PERCENT_OF_REVENUE', ratePercent: '10' });
    // '0.10' here would be a silent 100× UNDERPAYMENT of the trustee's fee, and both parse.
    expect(PLAIN_DECIMAL.test('0.10')).toBe(true);
  });

  it('turns the two scales into the SAME reserve when the same 5% arrives from either source', () => {
    // The human fact is "five percent". The deed records 0.05; the Setting records '5'. If either
    // conversion were backwards, these two would differ by a factor of 10,000.
    const fromDeed = resolveMaintenanceRule({
      waqfId: 'w',
      deed: { kind: 'percent', amountSar: null, rate: 0.05, targetBalanceSar: null },
      nazirDiscretionPercent: null,
      reserveFundBalanceMinor: null,
    }).rule as { ratePercent: string };
    const fromSetting = resolveMaintenanceRule({
      waqfId: 'w',
      deed: { kind: 'unspecified', amountSar: null, rate: null, targetBalanceSar: null },
      nazirDiscretionPercent: '5',
      reserveFundBalanceMinor: null,
    }).rule as { ratePercent: string };
    expect(fromDeed.ratePercent).toBe(fromSetting.ratePercent);
    expect(fromDeed.ratePercent).toBe('5');
  });

  it('refuses a rate that cannot be written as a plain decimal', () => {
    expect(
      refusalOf(() =>
        resolveMaintenanceRule({
          waqfId: 'w',
          deed: { kind: 'percent', amountSar: null, rate: 1e-7, targetBalanceSar: null },
          nazirDiscretionPercent: null,
          reserveFundBalanceMinor: null,
        }),
      ).refusal,
    ).toBe('RATE_UNREPRESENTABLE');
    expect(
      refusalOf(() =>
        resolveMaintenanceRule({
          waqfId: 'w',
          deed: { kind: 'percent', amountSar: null, rate: -0.05, targetBalanceSar: null },
          nazirDiscretionPercent: null,
          reserveFundBalanceMinor: null,
        }),
      ).refusal,
    ).toBe('RATE_UNREPRESENTABLE');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · The ṣiyāna resolver — all six kinds, and Q-S7-1
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const deed = (
  patch: Partial<ShartMaintenanceReserve> & Pick<ShartMaintenanceReserve, 'kind'>,
): ShartMaintenanceReserve => ({
  amountSar: null,
  rate: null,
  targetBalanceSar: null,
  ...patch,
});

describe('5 · all six MAINTENANCE_RULE_KINDS are reachable, and the deed wins', () => {
  const resolve = (
    d: ShartMaintenanceReserve,
    discretion: string | null,
    balance: bigint | null = null,
  ) =>
    resolveMaintenanceRule({
      waqfId: 'waqf-001',
      deed: d,
      nazirDiscretionPercent: discretion,
      reserveFundBalanceMinor: balance,
    });

  it('FIXED — a stipulated amount becomes halalas', () => {
    expect(resolve(deed({ kind: 'fixed', amountSar: '40000.00' }), null).rule).toEqual({
      kind: 'FIXED',
      amountMinor: 4_000_000n,
    });
  });

  it('PERCENT — the deed rate, shifted', () => {
    expect(resolve(deed({ kind: 'percent', rate: 0.05 }), null).rule).toEqual({
      kind: 'PERCENT',
      ratePercent: '5',
    });
  });

  it('TARGET_TOPUP — target from the deed, current balance from the caller', () => {
    expect(
      resolve(deed({ kind: 'target_topup', targetBalanceSar: '500000.00' }), null, 12_345n).rule,
    ).toEqual({
      kind: 'TARGET_TOPUP',
      targetBalanceMinor: 50_000_000n,
      currentBalanceMinor: 12_345n,
    });
  });

  it('NONE — the founder positively stipulated no reserve', () => {
    expect(resolve(deed({ kind: 'none' }), null).rule).toEqual({ kind: 'NONE' });
  });

  it('NAZIR_DISCRETION_PERCENT — a SILENT deed plus a recorded discretion', () => {
    expect(resolve(deed({ kind: 'unspecified' }), '5').rule).toEqual({
      kind: 'NAZIR_DISCRETION_PERCENT',
      ratePercent: '5',
    });
  });

  it('UNSET — a silent deed and NOTHING recorded, plus the flag that says the zero is not a decision', () => {
    const resolution = resolve(deed({ kind: 'unspecified' }), null);
    expect(resolution.rule).toEqual({ kind: 'UNSET' });
    const notice = resolution.diagnostics.find(
      (d) => d.code === 'MAINTENANCE_POLICY_UNACKNOWLEDGED',
    );
    expect(notice?.severity).toBe('NOTICE');
    expect(notice?.detail['engineFlagExpected']).toBe('MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED');
  });

  it('reaches every one of the six kinds — an unreachable kind reports its silence as success', () => {
    const produced = new Set<MaintenanceRuleKind>([
      resolve(deed({ kind: 'fixed', amountSar: '1.00' }), null).rule.kind,
      resolve(deed({ kind: 'percent', rate: 0.01 }), null).rule.kind,
      resolve(deed({ kind: 'target_topup', targetBalanceSar: '1.00' }), null, 0n).rule.kind,
      resolve(deed({ kind: 'none' }), null).rule.kind,
      resolve(deed({ kind: 'unspecified' }), '1').rule.kind,
      resolve(deed({ kind: 'unspecified' }), null).rule.kind,
    ]);
    expect([...produced].sort()).toEqual([...MAINTENANCE_RULE_KINDS].sort());
  });

  it('⚠ Q-S7-1 · deed-stated wins over a recorded Nazir percentage — and the conflict is VISIBLE', () => {
    // `waqf-001` carries BOTH a deed-stipulated fixed 40,000.00 reserve AND
    // `Setting['distribution.maintenance.nazirDiscretionPercent'] = '5'`. This test asserts what the
    // code DOES; it does not adjudicate whether that row is dead data, inert, or a live defect.
    // ⇒ SURFACED to the product owner (fiqh/trusteeship authority — binding rule 4), not resolved here.
    const resolution = resolve(deed({ kind: 'fixed', amountSar: '40000.00' }), '5');
    expect(resolution.rule).toEqual({ kind: 'FIXED', amountMinor: 4_000_000n });
    const conflict = resolution.diagnostics.find(
      (d) => d.code === 'MAINTENANCE_DEED_RULE_WINS_OVER_RECORDED_NAZIR_DISCRETION',
    );
    expect(conflict).toBeDefined();
    expect(conflict?.severity).toBe('CONFLICT');
    expect(conflict?.detail).toEqual({
      waqfId: 'waqf-001',
      deedMaintenanceKind: 'fixed',
      recordedNazirDiscretionPercent: '5',
      applied: 'DEED',
    });
  });

  it('⚠ Q-S7-1 · the conflict reaches the RUN, not only the resolver', () => {
    // The builder must forward the resolver's diagnostics. A conflict visible only to a unit test is
    // not visible to a Nazir.
    const mapping = build();
    expect(diagnosticCodes(mapping)).toContain(
      'MAINTENANCE_DEED_RULE_WINS_OVER_RECORDED_NAZIR_DISCRETION',
    );
    expect(mapping.input.maintenance).toEqual({ kind: 'FIXED', amountMinor: 4_000_000n });
  });

  it('reports the conflict on a `none` deed too — a discretion may not override a stipulated zero', () => {
    const resolution = resolve(deed({ kind: 'none' }), '5');
    expect(resolution.rule).toEqual({ kind: 'NONE' });
    expect(diagnosticCodes(resolution)).toContain(
      'MAINTENANCE_DEED_RULE_WINS_OVER_RECORDED_NAZIR_DISCRETION',
    );
  });

  it('is silent when there is no conflict to report', () => {
    expect(diagnosticCodes(resolve(deed({ kind: 'fixed', amountSar: '1.00' }), null))).toEqual([]);
  });

  it('refuses a target_topup deed with no current balance rather than topping up the FULL target', () => {
    const refusal = refusalOf(() =>
      resolve(deed({ kind: 'target_topup', targetBalanceSar: '1.00' }), null, null),
    );
    expect(refusal.refusal).toBe('MAINTENANCE_TARGET_BALANCE_UNAVAILABLE');
    expect(refusal.code).toBe('SETTING_MISSING');
  });

  it('refuses a half-written rule and an unrecognised kind', () => {
    expect(refusalOf(() => resolve(deed({ kind: 'fixed' }), null)).refusal).toBe(
      'MAINTENANCE_RULE_UNRECOGNISED',
    );
    expect(refusalOf(() => resolve(deed({ kind: 'percent' }), null)).refusal).toBe(
      'MAINTENANCE_RULE_UNRECOGNISED',
    );
    expect(refusalOf(() => resolve(deed({ kind: 'target_topup' }), null, 0n)).refusal).toBe(
      'MAINTENANCE_RULE_UNRECOGNISED',
    );
    expect(refusalOf(() => resolve(deed({ kind: 'PERCENT' }), null)).refusal).toBe(
      'MAINTENANCE_RULE_UNRECOGNISED',
    );
    expect(refusalOf(() => resolve(deed({ kind: '' }), null)).refusal).toBe(
      'MAINTENANCE_RULE_UNRECOGNISED',
    );
  });

  it('drives the engine flag from UNSET, end to end', () => {
    const silent = build({
      waqf: waqf001({ shartAlWaqif: shart({ maintenanceReserve: { kind: 'unspecified' } }) }),
      settings: settings({ maintenanceNazirDiscretionPercent: null }),
    });
    expect(silent.input.maintenance).toEqual({ kind: 'UNSET' });
    const result = runDistribution(silent.input);
    expect(result.flags).toContain('MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED');
    expect(result.waterfall.maintenanceReserveMinor).toBe(0n);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · The reversed pair
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('6 · a reversed original and its reversal are BOTH excluded', () => {
  const original = ledgerRow({ id: 'rev-100', amountSar: '99000.00' });
  const reversal = ledgerRow({ id: 'rev-101', amountSar: '99000.00', reversalOfId: 'rev-100' });

  it('drops both rows from the pool, so the money is neither double-counted nor netted', () => {
    // The pair nets to zero by EXCLUSION, not arithmetic: `amountSar` is non-negative and the sign
    // is carried by `type`, so a negative contra-entry is structurally unrepresentable.
    const { kept, excludedIds } = excludeReversedPairs([REV_001, original, reversal]);
    expect(kept.map((r) => r.id)).toEqual(['rev-001']);
    expect(excludedIds).toEqual(['rev-100', 'rev-101']);
  });

  it('leaves incomeMinor untouched by the pair, and names both ids to the caller', () => {
    const mapping = build({ ledger: [REV_001, REV_005, original, reversal] });
    expect(mapping.input.revenue.incomeMinor).toBe(35_000_000n);
    expect(mapping.input.revenue.receipts.map((r) => r.id)).toEqual(['rev-001', 'rev-005']);
    const dropped = mapping.diagnostics.find((d) => d.code === 'LEDGER_REVERSED_PAIR_EXCLUDED');
    expect(dropped?.detail['excludedTransactionIds']).toBe('rev-100,rev-101');
  });

  it('keeps a CORRECTION RE-ENTRY — it is a new fact, not a cancelled one', () => {
    // `correctionOfId` is a different column from `reversalOfId` and the mapper never reads it, so a
    // re-entry must survive on its own merits. If it did not, a corrected receipt would vanish.
    const reentry = ledgerRow({
      id: 'rev-102',
      receiptClass: 'CAPITAL',
      capitalSource: 'SALE_PROCEEDS',
      amountSar: '99000.00',
    });
    const { kept } = excludeReversedPairs([original, reversal, reentry]);
    expect(kept.map((r) => r.id)).toEqual(['rev-102']);
  });

  it('drops a lone reversal whose original is outside the window', () => {
    const { kept, excludedIds } = excludeReversedPairs([REV_001, reversal]);
    expect(kept.map((r) => r.id)).toEqual(['rev-001']);
    expect(excludedIds).toEqual(['rev-101']);
  });

  it('excludes nothing when nothing was reversed', () => {
    const { kept, excludedIds } = excludeReversedPairs([REV_001, REV_005]);
    expect(kept).toHaveLength(2);
    expect(excludedIds).toEqual([]);
    expect(diagnosticCodes(build())).not.toContain('LEDGER_REVERSED_PAIR_EXCLUDED');
  });

  it('excludes an EXPENSE pair as well — the predicate is about rows, not about revenue', () => {
    const expOriginal = ledgerRow({
      id: 'exp-200',
      type: 'EXPENSE',
      receiptClass: null,
      expenseCategory: 'OPERATIONS',
      amountSar: '7000.00',
    });
    const expReversal = ledgerRow({
      id: 'exp-201',
      type: 'EXPENSE',
      receiptClass: null,
      expenseCategory: 'OPERATIONS',
      amountSar: '7000.00',
      reversalOfId: 'exp-200',
    });
    const mapping = build({ ledger: [REV_001, expOriginal, expReversal] });
    expect(mapping.input.operatingCostMinor).toBe(0n);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 7 · The third reversion state
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('7 · reversionClauseCaptured === false is a CALLER-SIDE refusal', () => {
  it("refuses with the mapper's own name, not a bare throw and not an engine discriminator", () => {
    // `waqf-005` is exactly this row. The engine's `reversion` is two-state (`clause | null`) and
    // `null` means the deed POSITIVELY records no ultimate taker (R7-c) — so passing `null` here
    // would make the run assert, on the deed's behalf, that the founder named nobody.
    const refusal = refusalOf(() =>
      build({
        waqf: waqf001({
          reversionClauseCaptured: false,
          shartAlWaqif: shart({ reversion: { status: 'unread' } }),
        }),
      }),
    );
    expect(refusal.refusal).toBe('REVERSION_CLAUSE_UNREAD');
    expect(refusal.refusalSource).toBe('mapper');
    expect(refusal.code).toBe('SHART_INCOMPLETE');
    expect(refusal.messageKey).toBe('errors.domain.SHART_INCOMPLETE');
    // ⚠ and it is NOT one of the engine's twenty-six — no new engine discriminator was minted for it
    expect(SHART_REFUSALS).not.toContain('REVERSION_CLAUSE_UNREAD' as never);
    expect(MAPPER_REFUSALS).toContain('REVERSION_CLAUSE_UNREAD' satisfies MapperRefusal);
  });

  it('refuses a DISAGREEMENT between the columns and the Json ahead of the un-read state', () => {
    // Strictly more alarming than either state alone: two records of where the endowment goes.
    const refusal = refusalOf(
      () => build({ waqf: waqf001({ reversionClauseCaptured: false }) }), // columns say unread, Json says none
    );
    expect(refusal.refusal).toBe('REVERSION_CLAUSE_DISAGREES_WITH_DEED_RECORD');
    expect(refusal.details['columnState']).toBe('unread');
    expect(refusal.details['shartState']).toBe('none');
  });

  it('maps a captured-and-silent deed to reversion: null — a statement, not an omission', () => {
    expect(build().input.reversion).toBeNull();
  });

  it('refuses a named taker with no recorded kind', () => {
    const refusal = refusalOf(() => build({ ultimateTakerIds: ['jiha-601'] }));
    expect(refusal.refusal).toBe('REVERSION_CLAUSE_DISAGREES_WITH_DEED_RECORD');
  });

  it('sorts the taker ids without deduplicating them — a repeat MOVES MONEY', () => {
    const mapping = build({
      waqf: waqf001({
        reversionKind: 'CHARITABLE_ULTIMATE_TAKER',
        shartAlWaqif: shart({
          reversion: {
            status: 'named',
            kind: 'CHARITABLE_ULTIMATE_TAKER',
            ultimateTakerIds: ['jiha-601', 'jiha-601'],
            recordedAtHijri: '1446-10-12',
          },
        }),
      }),
      ultimateTakerIds: ['jiha-601', 'jiha-601'],
    });
    expect(mapping.input.reversion).toEqual({
      kind: 'CHARITABLE_ULTIMATE_TAKER',
      ultimateTakerIds: ['jiha-601', 'jiha-601'],
    });
  });
});

describe("8 · the run's identity — the two constants that ARE live", () => {
  // ⚠ These replace an unused-import lint error, and they are not filler. `DISTRIBUTION_RUN_APPROVAL_TYPE`
  // is the constant the sprint brief got WRONG: it said the run should take "the BANK_MOVEMENT path",
  // and the deferred trigger `qmulate_distribution_authority` refuses that at COMMIT with SQLSTATE
  // 42501, because it calls `qmulate_approval_defect(..., 'DISTRIBUTION_RUN', ...)`. Pinning the value
  // here means a well-meaning "align this with the finance router" edit fails a unit test in
  // milliseconds instead of failing a deferred constraint at the end of a transaction.
  it('the approval type is DISTRIBUTION_RUN — never BANK_MOVEMENT', () => {
    expect(DISTRIBUTION_RUN_APPROVAL_TYPE).toBe('DISTRIBUTION_RUN');
  });

  // The mint payload's own discriminator is deliberately NOT the ApprovalType's spelling, so a run
  // artifact and a run approval-type can never be confused for one another in a payload.
  it('the artifact kind is distinct from the approval type', () => {
    expect(DISTRIBUTION_RUN_ARTIFACT_KIND).toBe('distribution.run');
    expect(DISTRIBUTION_RUN_ARTIFACT_KIND).not.toBe(DISTRIBUTION_RUN_APPROVAL_TYPE);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 8 · The run's identity — DELIBERATELY NOT TESTED HERE ANY MORE
 *
 * This section used to cover `distributionRunSubjectId` / `parse…` / `…Matches`, a DETERMINISTIC
 * subject-id vocabulary. S7-4 settled the design the other way — `subjectId = run.id`, the cuid,
 * because `qmulate_distribution_authority` compares `subjectId` to `NEW."id"` and a deterministic id
 * could only satisfy that by BEING the primary key, which would make a cancelled period permanently
 * unrunnable (see `src/distribution/subject.ts`). The three functions were therefore called by
 * nothing, and have been REMOVED rather than deprecated.
 *
 * ⚠ The tests went with them ON PURPOSE. Tests around dead code are worse than no tests: they read
 * as coverage of a live path, and every future reader has to re-derive that nothing calls it. What
 * IS live — the approval type and the artifact-kind discriminator — is asserted where it is used.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 9 · resolveRefusal — and why `code` alone is not enough
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('9 · resolveRefusal reads the discriminator, never the code alone', () => {
  it('pins the count that makes the code useless on its own', () => {
    expect(SHART_REFUSALS).toHaveLength(26);
  });

  it('🔴 TWO DIFFERENT ENGINE HALTS SHARE ONE CODE — keying on `err.code` learns nothing', () => {
    // ⚠ BOTH REFUSALS COME FROM A **RECORD**, not from a mutated parse result. That is refusal rule 4:
    // the mapper passes a joint waqf and a mis-transcribed order rule THROUGH so the engine can name
    // them, rather than pre-empting them and creating a second, drifting judge of the founder's
    // conditions. The `buildDistributionInput` calls below must therefore SUCCEED.
    const jointMapping = build({ waqf: waqf001({ type: 'JOINT' }) });
    const tashrikMapping = build({
      waqf: waqf001({ entitlementOrder: 'tashrik', shartAlWaqif: shart({ orderRule: 'tashrik' }) }),
    });
    expect(jointMapping.input.waqfType).toBe('JOINT');
    expect(tashrikMapping.input.entitlementOrder).toBe('tashrik');

    const joint = refusalOf(() => runDistribution(jointMapping.input));
    const unrecognisedOrder = refusalOf(() => runDistribution(tashrikMapping.input));

    // identical code …
    expect(joint.code).toBe('SHART_INCOMPLETE');
    expect(unrecognisedOrder.code).toBe('SHART_INCOMPLETE');
    expect(joint.code).toBe(unrecognisedOrder.code);
    // … and identical user-facing sentence key …
    expect(joint.messageKey).toBe(unrecognisedOrder.messageKey);
    // … but different remedies, and only the DISCRIMINATOR says which.
    expect(joint.refusal).toBe('WAQF_TYPE_JOINT_NOT_SUPPORTED');
    expect(unrecognisedOrder.refusal).toBe('ENTITLEMENT_ORDER_UNRECOGNISED');
    expect(joint.refusal).not.toBe(unrecognisedOrder.refusal);
    expect(joint.refusalSource).toBe('engine');
    expect(unrecognisedOrder.refusalSource).toBe('engine');
  });

  it('reads the discriminator out of `details.refusal`, not out of the message', () => {
    const refusal = refusalOf(() =>
      runDistribution(build({ waqf: waqf001({ type: 'JOINT' }) }).input),
    );
    expect(refusal.details['refusal']).toBe('WAQF_TYPE_JOINT_NOT_SUPPORTED');
    expect(refusal.refusal).toBe(refusal.details['refusal']);
    // ⚠ AND IT COULD NOT COME FROM THE MESSAGE, MEASURED: `shartIncomplete(reason, details)` embeds
    // only its `reason` prose, and NEITHER of these two call sites puts its discriminator in that
    // prose. A caller that parsed the string would find nothing to parse — which is worse than
    // fragile, because it would silently fall through to "some SHART_INCOMPLETE".
    const order = refusalOf(() =>
      runDistribution(
        build({
          waqf: waqf001({
            entitlementOrder: 'tashrik',
            shartAlWaqif: shart({ orderRule: 'tashrik' }),
          }),
        }).input,
      ),
    );
    expect(refusal.message).not.toContain('WAQF_TYPE_JOINT_NOT_SUPPORTED');
    expect(order.message).not.toContain('ENTITLEMENT_ORDER_UNRECOGNISED');
    expect(order.refusal).toBe('ENTITLEMENT_ORDER_UNRECOGNISED');
  });

  it('separates the two vocabularies, so a mapper halt is never read as an engine halt', () => {
    const mapper = refusalOf(() =>
      build({
        waqf: waqf001({
          reversionClauseCaptured: false,
          shartAlWaqif: shart({ reversion: { status: 'unread' } }),
        }),
      }),
    );
    expect(mapper.refusalSource).toBe('mapper');
    expect(mapper.details['mapperRefusal']).toBe('REVERSION_CLAUSE_UNREAD');
    expect(mapper.details['refusal']).toBeUndefined();
    // The disjointness is asserted at import in `refusal.ts`; assert it here as data too.
    for (const name of MAPPER_REFUSALS) {
      expect(SHART_REFUSALS).not.toContain(name as never);
    }
  });

  it('drops an UNRECOGNISED discriminator to null and surfaces it without trusting it', () => {
    // A REAL `DomainError` — an earlier draft of this test used a look-alike subclass of `Error`, which
    // `isDomainError` correctly rejected, so the assertion ran down the `'UNKNOWN'` branch and proved
    // nothing about this behaviour at all. A test that cannot reach the code it names is not a test.
    const drifted = new DomainError('SHART_INCOMPLETE', 'a future engine halted', {
      details: { refusal: 'A_REFUSAL_FROM_A_FUTURE_ENGINE', beneficiaryId: 'ben-001' },
    });
    expect(isDomainError(drifted)).toBe(true);

    const resolved = resolveRefusal(drifted);
    // ⚠ NOT FORWARDED. Passing an unknown string through would put a code on a Nazir's screen that no
    // `<DiagnosticCode>` can explain and no test enumerates.
    expect(resolved.refusal).toBeNull();
    expect(resolved.refusalSource).toBeNull();
    expect(resolved.code).toBe('SHART_INCOMPLETE');
    expect(resolved.messageKey).toBe('errors.domain.SHART_INCOMPLETE');
    expect(resolved.details['unrecognisedRefusal']).toBe('A_REFUSAL_FROM_A_FUTURE_ENGINE');
    expect(resolved.details['beneficiaryId']).toBe('ben-001'); // the rest of `details` survives
  });

  it('adds no `unrecognisedRefusal` key when the error carried no discriminator at all', () => {
    const plain = new DomainError('SETTING_MISSING', 'no row', { details: { key: 'x' } });
    const resolved = resolveRefusal(plain);
    expect(resolved.refusal).toBeNull();
    expect(Object.keys(resolved.details)).toEqual(['key']);
  });

  it('prefers the engine discriminator when an error somehow carries both', () => {
    // Not reachable from either constructor today; asserted so the precedence is a decision on the
    // record rather than whichever `if` happens to be written first.
    const both = new DomainError('SHART_INCOMPLETE', 'both', {
      details: { refusal: 'WAQF_TYPE_JOINT_NOT_SUPPORTED', mapperRefusal: 'SHART_UNREADABLE' },
    });
    const resolved = resolveRefusal(both);
    expect(resolved.refusal).toBe('WAQF_TYPE_JOINT_NOT_SUPPORTED');
    expect(resolved.refusalSource).toBe('engine');
  });

  it('is total: a non-DomainError throw resolves to UNKNOWN rather than escaping', () => {
    const plain = resolveRefusal(new Error('kaboom'));
    expect(plain.code).toBe('UNKNOWN');
    expect(plain.refusal).toBeNull();
    expect(plain.refusalSource).toBeNull();
    expect(plain.messageKey).toBeNull();
    expect(plain.message).toBe('kaboom');
    expect(plain.details).toEqual({});
    expect(resolveRefusal('a string').code).toBe('UNKNOWN');
    expect(resolveRefusal(undefined).message).toBe('undefined');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 9b · Every code in both new vocabularies is REACHABLE
 *
 * R6-C1's lesson, permanently: *a property whose generator cannot reach a configuration reports its
 * silence as success, at scale.* `MAPPER_REFUSALS` and `MAPPING_DIAGNOSTICS` are two new machine-code
 * vocabularies with 18 and 11 members. A member no input can produce is not a control — it is a
 * comment with a type. These two tests fail the moment somebody adds a name and nothing emits it.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('9b · both new vocabularies are fully reachable', () => {
  it('reaches all 18 MAPPER_REFUSALS from a recorded state', () => {
    const reached = new Set<string>();
    const cases: readonly (() => unknown)[] = [
      () =>
        build({
          waqf: waqf001({
            reversionClauseCaptured: false,
            shartAlWaqif: shart({ reversion: { status: 'unread' } }),
          }),
        }),
      () =>
        build({
          waqf: waqf001({
            shartAlWaqif: shart({
              completeness: { status: 'INCOMPLETE', missing: ['ORDER_RULE'], advisory: [] },
            }),
          }),
        }),
      () => build({ waqf: waqf001({ shartAlWaqif: 'not an object' }) }),
      () => build({ waqf: waqf001({ entitlementOrder: 'SHARED' }) }),
      () => build({ waqf: waqf001({ continuationStipulation: null }) }),
      () => build({ ultimateTakerIds: ['jiha-601'] }),
      () =>
        build({
          waqf: waqf001({ shartAlWaqif: shart({ maintenanceReserve: { kind: 'whatever' } }) }),
        }),
      () =>
        build({
          waqf: waqf001({
            shartAlWaqif: shart({
              maintenanceReserve: { kind: 'target_topup', targetBalanceSar: '1.00' },
            }),
          }),
        }),
      () =>
        build({
          waqf: waqf001({
            shartAlWaqif: shart({ maintenanceReserve: { kind: 'percent', rate: 1e-9 } }),
          }),
        }),
      () =>
        build({
          waqf: waqf001({
            shartAlWaqif: shart({
              nazirFee: { basis: 'RETAINER', ratePercent: null, amountSar: null },
            }),
          }),
        }),
      () =>
        build({
          waqf: waqf001({
            shartAlWaqif: shart({
              nazirFee: { basis: 'PERCENT_OF_GROSS', ratePercent: 1, amountSar: null },
            }),
          }),
        }),
      () =>
        build({ waqf: waqf001({ shartAlWaqif: shart({ disbursementSchedule: 'FORTNIGHTLY' }) }) }),
      () => build({ beneficiaries: [{ ...BEN_001, stipulatedWeight: null }] }),
      () => build({ beneficiaries: [{ ...BEN_001, stipulatedWeight: '-1' }] }),
      () => build({ ledger: [ledgerRow({ id: 'rev-x', receiptClass: null })] }),
      () =>
        build({
          ledger: [ledgerRow({ id: 'rev-x', receiptClass: 'CAPITAL', capitalSource: 'MYSTERY' })],
        }),
      () =>
        build({ ledger: [ledgerRow({ id: 'rev-x', date: new Date('2027-01-01T00:00:00.000Z') })] }),
      () =>
        build({
          ledger: [ledgerRow({ id: 'rev-x', deletedAt: new Date('2026-03-01T00:00:00.000Z') })],
        }),
    ];
    for (const scenario of cases) {
      const refusal = refusalOf(scenario);
      expect(refusal.refusalSource).toBe('mapper');
      reached.add(String(refusal.refusal));
    }
    expect([...reached].sort()).toEqual([...MAPPER_REFUSALS].sort());
  });

  it('reaches all 11 MAPPING_DIAGNOSTICS from a recorded state', () => {
    const reached = new Set<string>();
    const collect = (codes: readonly string[]): void => {
      for (const code of codes) reached.add(code);
    };
    // the seeded waqf-001 run: the Q-S7-1 conflict, the advisory gap, the corpus pass-through, the
    // two missing columns, the excluded MAINTENANCE expense
    collect(diagnosticCodes(build()));
    // a reversed pair
    collect(
      diagnosticCodes(
        build({
          ledger: [
            REV_001,
            ledgerRow({ id: 'rev-100', amountSar: '5.00' }),
            ledgerRow({ id: 'rev-101', amountSar: '5.00', reversalOfId: 'rev-100' }),
          ],
        }),
      ),
    );
    // a silent deed with nothing recorded
    collect(
      diagnosticCodes(
        build({
          waqf: waqf001({ shartAlWaqif: shart({ maintenanceReserve: { kind: 'unspecified' } }) }),
          settings: settings({ maintenanceNazirDiscretionPercent: null }),
        }),
      ),
    );
    // a silent fee deed beside a configured figure
    collect(
      diagnosticCodes(
        build({
          waqf: waqf001({
            shartAlWaqif: shart({
              nazirFee: { basis: 'UNSPECIFIED', ratePercent: null, amountSar: null },
            }),
          }),
        }),
      ),
    );
    // a deed fee rate that disagrees with the configured figure
    collect(
      diagnosticCodes(
        build({ settings: settings({ nazirFeePercentOfRevenue: envelope(7, 'percent', true) }) }),
      ),
    );
    // a float-residue percentage
    collect(
      diagnosticCodes(
        build({
          waqf: waqf001({
            shartAlWaqif: shart({ maintenanceReserve: { kind: 'percent', rate: 2.9 / 100 } }),
          }),
        }),
      ),
    );
    expect([...reached].sort()).toEqual([...MAPPING_DIAGNOSTICS].sort());
  });

  it('gives every mapper refusal ONE user-facing sentence that already exists in BOTH locales', () => {
    // ⚠ THIS IS THE ONLY THING BACKING THE "NEVER SILENCED" PROMISE FOR THIS PACKAGE TODAY. The 18
    // mapper refusals are machine codes with no ar/en labels of their own — by design: they render as
    // untranslated `<DiagnosticCode>`s beside the ONE catalogued sentence their `DomainError` code
    // points at. That design only holds if the code always HAS a sentence. `next-intl` PRINTS a
    // missing key rather than throwing, and `code-source-parity.test.ts` derives its groups from
    // `routers/deed.ts` alone, so nothing else in CI would notice a code with no copy.
    // ✅ MEASURED here: 39 `errors.domain` keys in each catalogue, and every code below is one of them.
    // (36 → 38 in S9-1: `DEADLINE_RULE_NOT_A_CLOCK` + `DEADLINE_STATE_INCOHERENT`, Engine B's two.
    //  38 → 39 in S9-3c: `DEADLINE_ANCHOR_NOT_DERIVABLE` — §09's "clock starts on" fact could not
    //  be established, so no due date was computed. Its five conditions ride `details.refusal`
    //  (`ANCHOR_ROUTING_REFUSALS`) rather than becoming five codes, for the reason this pin exists:
    //  one user-facing meaning gets ONE sentence. Both moves are TRUE POSITIVES of this assertion —
    //  it went red on the first run of each stage's suite, which is the whole point of pinning a
    //  count rather than asserting "every code has copy" and letting the set grow unwatched.)
    const arDomain = (arMessages as { errors: { domain: Record<string, string> } }).errors.domain;
    const enDomain = (enMessages as { errors: { domain: Record<string, string> } }).errors.domain;
    expect(Object.keys(arDomain)).toHaveLength(39);
    expect(Object.keys(enDomain)).toHaveLength(39);

    const codes = new Set<string>();
    for (const refusal of MAPPER_REFUSALS) {
      const resolved = resolveRefusal(mapperRefusal(refusal, 'probe'));
      expect(resolved.refusal).toBe(refusal);
      codes.add(String(resolved.code));
      expect(resolved.messageKey).toBe(`errors.domain.${String(resolved.code)}`);
      expect(arDomain[String(resolved.code)], `ar copy for ${refusal}`).toBeTruthy();
      expect(enDomain[String(resolved.code)], `en copy for ${refusal}`).toBeTruthy();
    }
    // and they are NOT all flattened into one code — a missing reserve-fund balance has an operational
    // remedy, an unreadable founder's condition a legal one.
    expect([...codes].sort()).toEqual([
      'DISTRIBUTION_INPUT_INVALID',
      'RECEIPT_UNCLASSIFIED',
      'SETTING_INVALID',
      'SETTING_MISSING',
      'SHART_INCOMPLETE',
    ]);
  });

  it("refuses a non-string diagnostic detail — the same rule the engine's trace data lives under", () => {
    expect(() => mappingDiagnostic('SHART_ADVISORY_GAP', 'NOTICE', { n: 1 as never })).toThrow(
      /not a string/,
    );
    expect(() => mappingDiagnostic('SHART_ADVISORY_GAP', 'NOTICE', { m: 1n as never })).toThrow(
      /bigint/,
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 10 · The rest of the boundary — the refusals nothing else in this repo enforces
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('10 · the deed recorded twice, and the Shart Json', () => {
  it('refuses when the column and the Json disagree about the order rule', () => {
    const refusal = refusalOf(() => build({ waqf: waqf001({ entitlementOrder: 'SHARED' }) }));
    expect(refusal.refusal).toBe('ENTITLEMENT_ORDER_DISAGREES_WITH_SHART');
    expect(refusal.details['column']).toBe('SHARED');
    expect(refusal.details['shart']).toBe('ORDERED');
  });

  it('refuses when the column and the Json disagree about the continuation stipulation', () => {
    const refusal = refusalOf(() => build({ waqf: waqf001({ continuationStipulation: null }) }));
    expect(refusal.refusal).toBe('CONTINUATION_STIPULATION_DISAGREES_WITH_SHART');
  });

  it('refuses a HALTING completeness gap the engine cannot see at all', () => {
    // `completeness` is not part of `DistributionInputRaw`. The seed's claim that a halting gap makes
    // the engine refuse is only TRUE because this boundary enforces it — nothing else does.
    const refusal = refusalOf(() =>
      build({
        waqf: waqf001({
          shartAlWaqif: shart({
            completeness: { status: 'INCOMPLETE', missing: ['ORDER_RULE'], advisory: [] },
          }),
        }),
      }),
    );
    expect(refusal.refusal).toBe('SHART_COMPLETENESS_HALTING_GAP');
    expect(refusal.details['missing']).toEqual(['ORDER_RULE']);
  });

  it('reports an ADVISORY gap without halting, in a separate channel', () => {
    const mapping = build();
    const advisory = mapping.diagnostics.find((d) => d.code === 'SHART_ADVISORY_GAP');
    expect(advisory?.severity).toBe('NOTICE');
    expect(advisory?.detail['advisory']).toBe('TIER_WEIGHTS_NOT_STIPULATED');
  });

  it('refuses an unreadable Shart rather than treating it as an empty one', () => {
    expect(refusalOf(() => readShartForRun(null)).refusal).toBe('SHART_UNREADABLE');
    expect(refusalOf(() => readShartForRun('{}')).refusal).toBe('SHART_UNREADABLE');
    expect(refusalOf(() => readShartForRun([])).refusal).toBe('SHART_UNREADABLE');
    expect(refusalOf(() => readShartForRun({ orderRule: 'ORDERED' })).refusal).toBe(
      'SHART_UNREADABLE',
    );
  });

  it('reports a PRESENT-but-EMPTY reversion clause as a disagreement, not as unreadable', () => {
    // ⚠ MEASURED, AND WORTH KNOWING RATHER THAN FIXING BLIND: `readShartForRun` requires the four
    // clause OBJECTS to exist but reads a missing `reversion.status` as `''`. So `reversion: {}` gets
    // past `SHART_UNREADABLE` and lands on the columns-vs-Json comparison, which refuses it because
    // `''` is not `'none'`. Either refusal halts the run and no money moves; the difference is which
    // remedy a Nazir is pointed at (finish transcribing vs reconcile two records). Recorded so the
    // choice is visible if S7-5 renders these two codes differently.
    const refusal = refusalOf(() =>
      build({ waqf: waqf001({ shartAlWaqif: shart({ reversion: {} }) }) }),
    );
    expect(refusal.refusal).toBe('REVERSION_CLAUSE_DISAGREES_WITH_DEED_RECORD');
    expect(refusal.details['shartState']).toBe('');
  });

  it('reads a strict-union clause whose optional keys are ABSENT, not null', () => {
    const projection = readShartForRun(WAQF_001_SHART);
    expect(projection.maintenanceReserve).toEqual({
      kind: 'fixed',
      amountSar: '40000.00',
      rate: null,
      targetBalanceSar: null,
    });
    expect(projection.reversion).toEqual({ status: 'none', kind: null, ultimateTakerIds: [] });
    expect(projection.completeness).toEqual({
      missing: [],
      advisory: ['TIER_WEIGHTS_NOT_STIPULATED'],
    });
  });
});

describe('10b · the Nazir fee comes from the DEED and from nowhere else', () => {
  it('does not substitute a configured figure for a silent deed, and says so', () => {
    const mapping = build({
      waqf: waqf001({
        shartAlWaqif: shart({
          nazirFee: { basis: 'UNSPECIFIED', ratePercent: null, amountSar: null },
        }),
      }),
    });
    expect(mapping.input.nazirFee).toBeNull();
    const reported = mapping.diagnostics.find(
      (d) => d.code === 'NAZIR_FEE_DEED_SILENT_CONFIGURED_FIGURE_NOT_SUBSTITUTED',
    );
    expect(reported?.severity).toBe('CONFLICT');
    expect(reported?.detail['applied']).toBe('NONE');
    // and the engine says the determination is pending rather than deducting a figure nobody set
    const result = runDistribution(mapping.input);
    expect(result.flags).toContain('AUTHORITY_FEE_DETERMINATION_PENDING');
    expect(result.waterfall.nazirFeeMinor).toBe(0n);
    expect(result.waterfall.nazirFeeBasis).toBeNull();
  });

  it('reports a disagreement between the deed rate and the configured figure, deed applied', () => {
    const mapping = build({
      settings: settings({ nazirFeePercentOfRevenue: envelope(7, 'percent', true) }),
    });
    const reported = mapping.diagnostics.find(
      (d) => d.code === 'NAZIR_FEE_DEED_RATE_DISAGREES_WITH_CONFIGURED_FIGURE',
    );
    expect(reported?.detail).toEqual({
      waqfId: 'waqf-001',
      deedRatePercent: '10',
      configuredPercentOfRevenue: '7',
      applied: 'DEED',
    });
    expect(mapping.input.nazirFee).toEqual({ basis: 'PERCENT_OF_REVENUE', ratePercent: '10' });
  });

  it('is silent when the deed and the configured figure agree — the seeded case', () => {
    expect(diagnosticCodes(build())).not.toContain(
      'NAZIR_FEE_DEED_RATE_DISAGREES_WITH_CONFIGURED_FIGURE',
    );
  });

  it('refuses a basis with no figure, and an unrecognised basis', () => {
    const noRate = refusalOf(() =>
      build({
        waqf: waqf001({
          shartAlWaqif: shart({
            nazirFee: { basis: 'PERCENT_OF_REVENUE', ratePercent: null, amountSar: null },
          }),
        }),
      }),
    );
    expect(noRate.refusal).toBe('NAZIR_FEE_RULE_INCOMPLETE');

    const strangeBasis = refusalOf(() =>
      build({
        waqf: waqf001({
          shartAlWaqif: shart({
            nazirFee: { basis: 'PERCENT_OF_GROSS', ratePercent: 10, amountSar: null },
          }),
        }),
      }),
    );
    expect(strangeBasis.refusal).toBe('NAZIR_FEE_BASIS_UNRECOGNISED');
  });

  it('maps a RETAINER to halalas', () => {
    const mapping = build({
      waqf: waqf001({
        shartAlWaqif: shart({
          nazirFee: { basis: 'RETAINER', ratePercent: null, amountSar: '5000.00' },
        }),
      }),
    });
    expect(mapping.input.nazirFee).toEqual({ basis: 'RETAINER', fixedAmountMinor: 500_000n });
  });
});

describe('10c · operating cost is Σ OPERATIONS only', () => {
  it('counts OPERATIONS and names every category it excluded, with its total', () => {
    const operations = ledgerRow({
      id: 'exp-op-1',
      type: 'EXPENSE',
      receiptClass: null,
      expenseCategory: 'OPERATIONS',
      amountSar: '1200.00',
    });
    const zakat = ledgerRow({
      id: 'exp-z-1',
      type: 'EXPENSE',
      receiptClass: null,
      expenseCategory: 'ZAKAT',
      amountSar: '900.00',
    });
    const uncategorised = ledgerRow({
      id: 'exp-u-1',
      type: 'EXPENSE',
      receiptClass: null,
      expenseCategory: null,
      amountSar: '300.00',
    });
    const mapping = build({ ledger: [REV_001, EXP_MAINTENANCE, operations, zakat, uncategorised] });

    expect(mapping.input.operatingCostMinor).toBe(120_000n);
    const excluded = mapping.diagnostics.filter(
      (d) => d.code === 'OPERATING_COST_EXPENSE_CATEGORY_EXCLUDED',
    );
    expect(excluded.map((d) => d.detail['expenseCategory'])).toEqual([
      'MAINTENANCE',
      'UNCATEGORISED',
      'ZAKAT',
    ]);
    expect(excluded.map((d) => d.detail['excludedTotalSar'])).toEqual([
      '40000.00',
      '300.00',
      '900.00',
    ]);
  });

  it('never folds a paid ṣiyāna cost into the deed-stipulated reserve — that would deduct it twice', () => {
    const mapping = build();
    expect(mapping.input.operatingCostMinor).toBe(0n); // exp-e-001 is MAINTENANCE, 40,000.00
    expect(mapping.input.maintenance).toEqual({ kind: 'FIXED', amountMinor: 4_000_000n });
    const result = runDistribution(mapping.input);
    expect(result.waterfall.maintenanceReserveMinor).toBe(4_000_000n);
    expect(result.waterfall.operatingCostMinor).toBe(0n);
  });
});

describe('10d · the period window, checked twice', () => {
  it('is half-open, so a receipt captured with a clock time on the last day is INCLUDED', () => {
    // `Transaction.date` is a bare `DateTime` with no `@db.Date`. A `lte midnight` bound would drop
    // every receipt captured with a time of day on the period's last day — which is exactly when a
    // Nazir captures a fiscal year's final receipts.
    const window = periodWindow('2026-01-01', '2026-03-31');
    expect(window.fromInclusive.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(window.toExclusive.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    const lateInTheDay = ledgerRow({
      id: 'rev-late',
      amountSar: '1000.00',
      date: new Date('2026-03-31T23:59:59.000Z'),
    });
    expect(build({ ledger: [REV_001, lateInTheDay] }).input.revenue.incomeMinor).toBe(35_100_000n);
  });

  it('refuses a row the query should never have returned, rather than paying a plausible wrong number', () => {
    const nextQuarter = ledgerRow({
      id: 'rev-apr',
      amountSar: '1000.00',
      date: new Date('2026-04-01T00:00:00.000Z'),
    });
    expect(refusalOf(() => build({ ledger: [REV_001, nextQuarter] })).refusal).toBe(
      'LEDGER_ROW_OUTSIDE_PERIOD_WINDOW',
    );
    const softDeleted = ledgerRow({
      id: 'rev-del',
      amountSar: '1000.00',
      deletedAt: new Date('2026-03-01T00:00:00.000Z'),
    });
    expect(refusalOf(() => build({ ledger: [REV_001, softDeleted] })).refusal).toBe(
      'LEDGER_ROW_SOFT_DELETED',
    );
  });
});

describe('10e · the beneficiary roster', () => {
  it('refuses a NULL stipulated weight instead of substituting "1"', () => {
    const refusal = refusalOf(() =>
      build({ beneficiaries: [{ ...BEN_001, stipulatedWeight: null }] }),
    );
    expect(refusal.refusal).toBe('BENEFICIARY_WEIGHT_MISSING');
    expect(refusal.details['beneficiaryId']).toBe('ben-001');
  });

  it('refuses a weight that is not a plain non-negative decimal', () => {
    for (const weight of ['-1', '1e3', '', 'NaN']) {
      expect(
        refusalOf(() => build({ beneficiaries: [{ ...BEN_001, stipulatedWeight: weight }] }))
          .refusal,
      ).toBe('BENEFICIARY_WEIGHT_UNREPRESENTABLE');
    }
  });

  it('carries a null KYC date through as null — KYC_UNVERIFIED, never STALE_KYC', () => {
    const { input } = build();
    const ben003 = input.beneficiaries.find((b) => b.id === 'ben-003');
    expect(ben003?.kycLastRefreshed).toBeNull();
    expect(input.beneficiaries.find((b) => b.id === 'ben-001')?.kycLastRefreshed).toBe(
      '2026-01-15',
    );
    const result = runDistribution(input);
    const line = result.lines.find((l) => l.beneficiaryId === 'ben-003');
    expect(line?.gateFlags ?? []).not.toContain('STALE_KYC');
  });

  it('sends NO beneficiary name anywhere — the structural PII guard (AT-16)', () => {
    const { input } = build();
    for (const beneficiary of input.beneficiaries) {
      expect(Object.keys(beneficiary)).not.toContain('name');
    }
    expect(JSON.stringify(input.beneficiaries)).not.toContain('name');
  });

  it('handles an EMPTY roster — the wizard will hit it, and it must not be a crash', () => {
    const mapping = build({ beneficiaries: [] });
    expect(mapping.input.beneficiaries).toEqual([]);
    // and the two "no column" notices are suppressed: there is nobody they would be about
    expect(diagnosticCodes(mapping)).not.toContain('DISBURSING_ENTITY_HAS_NO_COLUMN');
    const result = runDistribution(mapping.input);
    expect(result.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
    expect(result.totals.paidMinor).toBe(0n);
    // ⚠ the distributable is RETAINED, not swept anywhere — where a retained halala goes is OQ-01,
    // unresolved (⚠ verify — may be stale; the rounding method is seeded `unverified: true`).
    expect(result.totals.retainedMinor).toBe(27_500_000n);
  });

  it('reports the two columns that do not exist rather than passing null silently', () => {
    const codes = diagnosticCodes(build());
    expect(codes).toContain('DISBURSING_ENTITY_HAS_NO_COLUMN');
    expect(codes).toContain('BANKING_REF_FOR_PROCEEDS_HAS_NO_COLUMN');
    const { input } = build();
    expect(input.beneficiaries.every((b) => b.disbursingEntity === null)).toBe(true);
    expect(input.beneficiaries.every((b) => b.bankingRefForProceeds === null)).toBe(true);
  });
});

describe('10f · policy, timing, and the bytes a Nazir signs', () => {
  it('copies the verbatim ⚠ marker into the input, because it lands inside the digest', () => {
    const { input } = build();
    expect(input.policy.unverifiedNote).toBe('⚠ unverified — confirm vs primary law');
    expect(input.policy.unverifiedNote).toBe(UNVERIFIED_NOTE);
    expect(runDistribution(input).unverifiedNotes).toContain(UNVERIFIED_NOTE);
  });

  it("derives asOf from ONE instant in ONE zone, so the engine's dual-date check passes by construction", () => {
    // 2026-04-15T22:30Z is already 2026-04-16 in Riyadh. The zone is a DECISION (it moves a deadline
    // by a day for three hours out of every twenty-four) and it is SURFACED, not settled here.
    expect(build().input.asOf.gregorian).toBe('2026-04-15');
    expect(build({ now: new Date('2026-04-15T22:30:00.000Z') }).input.asOf.gregorian).toBe(
      '2026-04-16',
    );
    const { input } = build();
    expect(input.asOf.hijri).toBe('1447-10-27');
    expect(() => runDistribution(input)).not.toThrow();
    // ⚠ `Timing.asOf` is the DUAL-DATE PAIR, not a Gregorian string — the engine carries both halves
    // all the way to the output, so a statement can print the day in the calendar its reader uses.
    expect(runDistribution(input).timing.asOf).toEqual({
      gregorian: '2026-04-15',
      hijri: '1447-10-27',
    });
  });

  it('carries the deadline as TWO independent days plus its Setting provenance', () => {
    const { input } = build();
    expect(input.deadline).toEqual({
      gregorian: '2027-03-31',
      hijri: '1448-10-22',
      settingKey: 'deadline.DISTRIBUTE_3M_FYE.months',
      months: 3,
      unverified: true,
    });
  });

  it("maps the deed's disbursement schedule, and refuses one this build does not know", () => {
    expect(build().input.disbursementSchedule).toBe('QUARTERLY');
    expect(
      build({ waqf: waqf001({ shartAlWaqif: shart({ disbursementSchedule: 'UNSPECIFIED' }) }) })
        .input.disbursementSchedule,
    ).toBeNull();
    expect(
      refusalOf(() =>
        build({ waqf: waqf001({ shartAlWaqif: shart({ disbursementSchedule: 'FORTNIGHTLY' }) }) }),
      ).refusal,
    ).toBe('DISBURSEMENT_SCHEDULE_UNRECOGNISED');
  });

  it('produces byte-identical canonical bytes from the same record, twice', () => {
    // The digest a Nazir signs is `sha256(canonicalizeResult(result))`. If the mapping were not
    // deterministic, the same record would sign as two different runs.
    expect(canonicalizeResult(runDistribution(build().input))).toBe(
      canonicalizeResult(runDistribution(build().input)),
    );
    expect(runDistribution(build().input).engineVersion).toBe(ENGINE_VERSION);
  });

  it('is INDEPENDENT of the order the caller fetched the receipts and the roster in', () => {
    // Two different guarantees, and it is worth knowing which is whose — a router that relies on the
    // wrong one gets a digest that moves for an unchanged record:
    //  · the ROSTER is the ENGINE's (`resolver.ts` sorts `input.beneficiaries` with
    //    `compareBeneficiaryIds` before it resolves or traces anything), so the mapper does not sort it
    //    and deliberately does not need to;
    //  · the RECEIPTS are the MAPPER's. ✅ MEASURED: `computeWaterfall` builds `capitalReceiptIds` in
    //    INPUT ORDER and joins them straight into the `CAPITAL_RECEIPTS_EXCLUDED` trace step's `data`,
    //    which `canonicalizeResult` walks — so with two corpus rows, the caller's fetch order would
    //    reach the signed bytes if this mapper did not sort. The next test proves that half.
    const forwards = canonicalizeResult(runDistribution(build().input));
    const reversed = canonicalizeResult(
      runDistribution(
        build({
          ledger: [EXP_MAINTENANCE, REV_005, REV_001],
          beneficiaries: [...BENEFICIARIES].reverse(),
        }).input,
      ),
    );
    expect(reversed).toBe(forwards);
  });

  it('sorts the receipts, which is load-bearing: TWO corpus rows would otherwise reach the digest in fetch order', () => {
    const second = ledgerRow({
      id: 'rev-006',
      receiptClass: 'CAPITAL',
      capitalSource: 'SALE_PROCEEDS',
      amountSar: '11.00',
      date: new Date('2026-03-02T00:00:00.000Z'),
    });
    const ascending = build({ ledger: [REV_001, REV_005, second] });
    const shuffled = build({ ledger: [second, REV_001, REV_005] });
    expect(ascending.input.revenue.receipts.map((r) => r.id)).toEqual([
      'rev-001',
      'rev-005',
      'rev-006',
    ]);
    expect(shuffled.input.revenue.receipts.map((r) => r.id)).toEqual([
      'rev-001',
      'rev-005',
      'rev-006',
    ]);

    const trace = (mapping: typeof ascending) =>
      runDistribution(mapping.input).computationTrace.find(
        (entry) => entry.code === 'CAPITAL_RECEIPTS_EXCLUDED',
      )?.data?.['receiptIds'];
    expect(trace(ascending)).toBe('rev-005,rev-006');
    expect(trace(shuffled)).toBe(trace(ascending));
    expect(canonicalizeResult(runDistribution(shuffled.input))).toBe(
      canonicalizeResult(runDistribution(ascending.input)),
    );
  });
});
