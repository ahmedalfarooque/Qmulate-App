/**
 * `composeComplianceKpis` / `dominantTone` — every tone rule the board relies on, driven directly. The
 * web renders what this returns and adds no logic; a wrong colour on the screen is a wrong line here.
 */
import { describe, expect, it } from 'vitest';

import {
  KPI_TONE_RANK,
  composeComplianceKpis,
  dominantTone,
  type ComposeKpisInput,
} from '../src/compliance-board.js';

const ok = <T>(value: T) => ({ ok: true as const, value });
const refused = (refusal: string) => ({ ok: false as const, refusal });

const HEALTHY: ComposeKpisInput = {
  deadlines: ok({
    kpi1: { tone: 'success' as const, reasons: [] },
    rules: [{ ruleKey: 'LICENSE_RENEWAL', rows: [{ state: 'pending' }], cause: null }],
  }),
  commingling: ok({ accountsChecked: 2, nonDedicatedAccounts: 0, receiptsOnNonDedicated: 0 }),
  kyc: ok({ counts: { FRESH: 3, STALE: 0, UNVERIFIED: 0 } }),
  aml: ok({ missedReports: false, assessable: true, reason: 'ASSESSED' }),
};

function chip(input: ComposeKpisInput, key: string) {
  const found = composeComplianceKpis(input).find((c) => c.key === key);
  if (found === undefined) throw new Error(`no chip ${key}`);
  return found;
}

describe('composeComplianceKpis — five chips, in order, from the kernel’s facts', () => {
  it('returns exactly five chips in the §3.1 order', () => {
    expect(composeComplianceKpis(HEALTHY).map((c) => c.key)).toEqual([
      'registration',
      'commingling',
      'kyc',
      'aml',
      'licence',
    ]);
  });

  it('KPI 1 is the kernel’s kpi1 verbatim — tone and reasons', () => {
    const input: ComposeKpisInput = {
      ...HEALTHY,
      deadlines: ok({
        kpi1: {
          tone: 'danger' as const,
          reasons: ['UPDATE_15BD:overdue:deadline-update-15bd-waqf-003'],
        },
        rules: [],
      }),
    };
    expect(chip(input, 'registration')).toEqual({
      key: 'registration',
      tone: 'danger',
      reasons: ['UPDATE_15BD:overdue:deadline-update-15bd-waqf-003'],
    });
  });

  it('a REFUSED read is the fourth state, not a colour — and never success', () => {
    const input: ComposeKpisInput = {
      deadlines: refused('NOT_FOUND'),
      commingling: refused('FORBIDDEN'),
      kyc: refused('FORBIDDEN'),
      aml: refused('FORBIDDEN'),
    };
    for (const c of composeComplianceKpis(input)) {
      expect(c.tone).toBe('refused');
      expect(c.reasons[0]).toMatch(/^READ_REFUSED:/);
    }
  });

  it('KPI 2 — receipts on a non-dedicated account are danger; an idle non-dedicated account is warning', () => {
    expect(
      chip(
        {
          ...HEALTHY,
          commingling: ok({
            accountsChecked: 2,
            nonDedicatedAccounts: 1,
            receiptsOnNonDedicated: 3,
          }),
        },
        'commingling',
      ).tone,
    ).toBe('danger');
    expect(
      chip(
        {
          ...HEALTHY,
          commingling: ok({
            accountsChecked: 2,
            nonDedicatedAccounts: 1,
            receiptsOnNonDedicated: 0,
          }),
        },
        'commingling',
      ).tone,
    ).toBe('warning');
    const healthy = chip(HEALTHY, 'commingling');
    expect(healthy.tone).toBe('success');
    expect(healthy.reasons).toEqual(['ACCOUNTS_CHECKED:2']);
  });

  it('KPI 3 — stale dominates unverified; an EMPTY register is warning, not success', () => {
    expect(
      chip({ ...HEALTHY, kyc: ok({ counts: { FRESH: 1, STALE: 1, UNVERIFIED: 5 } }) }, 'kyc').tone,
    ).toBe('danger');
    expect(
      chip({ ...HEALTHY, kyc: ok({ counts: { FRESH: 1, STALE: 0, UNVERIFIED: 1 } }) }, 'kyc').tone,
    ).toBe('warning');
    const empty = chip(
      { ...HEALTHY, kyc: ok({ counts: { FRESH: 0, STALE: 0, UNVERIFIED: 0 } }) },
      'kyc',
    );
    expect(empty.tone).toBe('warning');
    expect(empty.reasons).toEqual(['KYC_NO_BENEFICIARIES']);
    expect(chip(HEALTHY, 'kyc').tone).toBe('success');
  });

  it('KPI 4 — not assessable is warning (the truth today); a missed report is danger; assessed and none missed is success', () => {
    const today = chip(
      {
        ...HEALTHY,
        aml: ok({ missedReports: null, assessable: false, reason: 'AML_TIMELINESS_NOT_MODELLED' }),
      },
      'aml',
    );
    expect(today.tone).toBe('warning');
    expect(today.reasons).toEqual(['AML_NOT_ASSESSABLE:AML_TIMELINESS_NOT_MODELLED']);
    expect(
      chip(
        { ...HEALTHY, aml: ok({ missedReports: true, assessable: true, reason: 'ASSESSED' }) },
        'aml',
      ).tone,
    ).toBe('danger');
    expect(chip(HEALTHY, 'aml').tone).toBe('success');
  });

  it('KPI 5 — ROUTED_NO_HOME is warning said in words; an overdue row is danger; a computed row is success', () => {
    const routed = chip(
      {
        ...HEALTHY,
        deadlines: ok({
          kpi1: { tone: 'success' as const, reasons: [] },
          rules: [{ ruleKey: 'LICENSE_RENEWAL', rows: [], cause: 'ROUTED_NO_HOME' }],
        }),
      },
      'licence',
    );
    expect(routed.tone).toBe('warning');
    expect(routed.reasons).toEqual(['LICENSE_RENEWAL:ROUTED_NO_HOME']);
    expect(
      chip(
        {
          ...HEALTHY,
          deadlines: ok({
            kpi1: { tone: 'success' as const, reasons: [] },
            rules: [{ ruleKey: 'LICENSE_RENEWAL', rows: [{ state: 'overdue' }], cause: null }],
          }),
        },
        'licence',
      ).tone,
    ).toBe('danger');
    expect(chip(HEALTHY, 'licence').tone).toBe('success');
    // A cannot_compute row is warning, and a board without the rule at all is warning, never success.
    expect(
      chip(
        {
          ...HEALTHY,
          deadlines: ok({
            kpi1: { tone: 'success' as const, reasons: [] },
            rules: [
              { ruleKey: 'LICENSE_RENEWAL', rows: [{ state: 'cannot_compute' }], cause: null },
            ],
          }),
        },
        'licence',
      ).tone,
    ).toBe('warning');
    expect(
      chip(
        {
          ...HEALTHY,
          deadlines: ok({ kpi1: { tone: 'success' as const, reasons: [] }, rules: [] }),
        },
        'licence',
      ).tone,
    ).toBe('warning');
  });
});

describe('dominantTone — danger dominates; refused outranks success and not warning', () => {
  it('ranks success < refused < warning < danger', () => {
    expect(KPI_TONE_RANK.success).toBeLessThan(KPI_TONE_RANK.refused);
    expect(KPI_TONE_RANK.refused).toBeLessThan(KPI_TONE_RANK.warning);
    expect(KPI_TONE_RANK.warning).toBeLessThan(KPI_TONE_RANK.danger);
  });

  it('one red chip makes the endowment red whatever the other four say', () => {
    expect(
      dominantTone([
        { tone: 'success' },
        { tone: 'success' },
        { tone: 'danger' },
        { tone: 'refused' },
        { tone: 'warning' },
      ]),
    ).toBe('danger');
  });

  it('an all-success board is success; a refused read alone makes it refused, not success', () => {
    expect(dominantTone([{ tone: 'success' }, { tone: 'success' }])).toBe('success');
    expect(dominantTone([{ tone: 'success' }, { tone: 'refused' }])).toBe('refused');
    expect(dominantTone([])).toBe('success');
  });
});

/**
 * ⚠ THE GREEN-FROM-NOTHING DEFECT (found while planning S11 item 2c, fixed on 2b's row).
 *
 * The commingling chip's final `else` returned `success` whenever both counters were zero — INCLUDING
 * when `accountsChecked` was 0, i.e. when the endowment has no dedicated account on record at all. On a
 * fixture endowment with no transactions (and therefore no derived account) the board rendered a GREEN
 * chip whose own reason string read `ACCOUNTS_CHECKED:0` — a sentence contradicting itself, and the exact
 * thing `dashboard/page.tsx`'s E0 comment names as the most dangerous placeholder this product can ship.
 * `waqf-004`, the 2b E2E seat's own grant, is such an endowment, so this shipped and went CI-green.
 *
 * These tests are written to have CAUGHT it, not merely to confirm the fix: the first drives the exact
 * input the board produced for that endowment, and the last pins the consistency with KPI 3's empty
 * register that the module's own stated rules already required.
 */
describe('KPI 2 — no dedicated account recorded is NOT a clean bill of health', () => {
  const withCommingling = (
    accountsChecked: number,
    nonDedicatedAccounts: number,
    receiptsOnNonDedicated: number,
  ): ComposeKpisInput => ({
    ...HEALTHY,
    commingling: ok({ accountsChecked, nonDedicatedAccounts, receiptsOnNonDedicated }),
  });

  it('zero accounts checked is WARNING, never success — BR-501 requires a dedicated account', () => {
    const c = chip(withCommingling(0, 0, 0), 'commingling');
    expect(c.tone).toBe('warning');
    expect(c.tone).not.toBe('success');
  });

  it('says BOTH what is missing and what was checked', () => {
    // A chip reading `ACCOUNTS_CHECKED:0` in a success tone contradicted itself; the reasons must now
    // name the absence explicitly as well as carrying the count.
    expect(chip(withCommingling(0, 0, 0), 'commingling').reasons).toEqual([
      'COMMINGLING_NO_ACCOUNTS_RECORDED',
      'ACCOUNTS_CHECKED:0',
    ]);
  });

  it('a real dedicated account with nothing wrong is still success — the fix does not blanket-warn', () => {
    const c = chip(withCommingling(2, 0, 0), 'commingling');
    expect(c.tone).toBe('success');
    expect(c.reasons).toEqual(['ACCOUNTS_CHECKED:2']);
  });

  it('the danger and warning arms are unchanged by the fix', () => {
    expect(chip(withCommingling(2, 1, 1), 'commingling').tone).toBe('danger');
    expect(chip(withCommingling(2, 1, 0), 'commingling').tone).toBe('warning');
  });

  it('an endowment with no accounts does not report a HEALTHY board overall', () => {
    // The roll-up is what a Nazir triages by, so the fix has to move the dominant tone too.
    expect(dominantTone(composeComplianceKpis(withCommingling(0, 0, 0)))).not.toBe('success');
  });

  it('is CONSISTENT with KPI 3’s empty register — the rule the module already stated', () => {
    // "no account to check" is not "no commingling", exactly as "nobody to verify" is not "everyone
    // verified". Both empty-set cases must land on the same tone, or the board contradicts its own
    // documented rules depending on which chip you read.
    const noAccounts = chip(withCommingling(0, 0, 0), 'commingling');
    const noBeneficiaries = chip(
      { ...HEALTHY, kyc: ok({ counts: { FRESH: 0, STALE: 0, UNVERIFIED: 0 } }) },
      'kyc',
    );
    expect(noBeneficiaries.tone).toBe('warning');
    expect(noAccounts.tone).toBe(noBeneficiaries.tone);
  });
});
