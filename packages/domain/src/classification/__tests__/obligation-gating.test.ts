/**
 * `obligation-gating.test.ts` — BR-104, and the FIRST HALF of §17's E3 exit clause:
 * *"the fixture's MEDIUM waqf shows audited-statement/bylaw obligations that the SMALL waqf does not."*
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE EXIT CLAUSE IS A CONTRAST, AND A CONTRAST CAN PASS VACUOUSLY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * "MEDIUM shows what SMALL does not" is satisfied by a resolver that returns nothing to anybody, and by a
 * catalogue that contains no `LARGE_MEDIUM` row at all. Both would be green and both would be worthless.
 * So this file proves the contrast from **both** sides:
 *
 *  · all twenty-five static `ClassificationGate × WaqfClassification` cells, individually;
 *  · a NEGATIVE CONTROL — the matrix must NOT admit everything for everyone, and `SMALL_DIRECT` must be
 *    the exact complement of `LARGE_MEDIUM`;
 *  · the two named obligations of the exit clause (an audited statement, internal bylaws) partitioned in
 *    opposite directions for MEDIUM and SMALL, with each appearing in the other's `excluded` list.
 *
 * ⚠ The two layers above this one carry the rest of the clause: `packages/database/test` asserts the
 * SEEDED catalogue actually contains those two codes at `gate = LARGE_MEDIUM` (without which this file is
 * asserting over a catalogue it invented itself), and `packages/api/test` asserts the procedure returns
 * them for `waqf-001` and not for `waqf-002`. Mutation check for the API layer: flipping either gate to
 * `ALL` must turn it red, or the contrast is not being measured.
 *
 * All catalogue rows here are **invented** — no client data, and no copy from `archive/raw-intake/`.
 */

import { describe, expect, it } from 'vitest';

import { WAQF_CLASSIFICATIONS } from '../../distribution/contract.js';
import type { WaqfClassification } from '../../distribution/contract.js';
import { UNVERIFIED_NOTE } from '../../settings.js';
import {
  CLASSIFICATION_BAND_SETTING_KEYS,
  CLASSIFICATION_GATES,
  CLASSIFICATION_GATE_MATRIX,
  DIRECT_USE_SENSITIVE_GATES,
  GATE_EXCLUSION_REASON,
  HAS_INCOME_GATE,
  INCOME_EXCLUSION_REASON,
  REGISTER_LOCK_REASON,
  RETIRED_GATES,
  STATIC_CLASSIFICATION_GATES,
  isClassificationGate,
  isWaqfClassification,
} from '../contract.js';
import type { GatedObligation, StaticClassificationGate } from '../contract.js';
import {
  classesAdmittedBy,
  DIRECT_USE_UNRECORDED,
  gateAppliesTo,
  obligationDelta,
  obligationsForClassification,
} from '../gating.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * An invented catalogue
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⊕ S8-Q4 — the four REAL classes: the ones a partition can be computed for.
 *
 * `NOT_CLASSIFIED` is a member of the vocabulary but not of any register answer — the resolver
 * LOCKS at it and computes nothing — so the "on every class" loops below iterate THIS list, and
 * the locked behaviour is asserted in its own block rather than smuggled through loops written for
 * determinations. DERIVED from the vocabulary rather than restated, then pinned, so a sixth class
 * cannot silently skip every loop by landing in the wrong list.
 */
const REAL_CLASSIFICATIONS = WAQF_CLASSIFICATIONS.filter(
  (classification) => classification !== 'NOT_CLASSIFIED',
);

const obligation = (
  code: string,
  gate: string,
  deadlineRuleKey: string | null = null,
): GatedObligation => ({
  code,
  gate,
  section: 'FINANCIAL',
  workstreamAr: 'الرقابة المالية',
  workstreamEn: 'Financial oversight',
  titleAr: 'التزام تنظيمي (بيانات تجريبية)',
  titleEn: 'Regulatory obligation (invented fixture)',
  deadlineRuleKey,
});

/**
 * The exit clause's two obligations, plus one at each of the other three gates.
 *
 * ⚠ `deadlineRuleKey` is a KEY, never a window: the 30/15/10-business-day figures resolve from
 * `Setting['deadline.<ruleKey>.businessDays']` and are unverified (binding rule 3).
 */
const CATALOGUE: readonly GatedObligation[] = Object.freeze([
  obligation('FIN-audited-statement', 'LARGE_MEDIUM', 'deadline.AUDITED_STATEMENT.months'),
  obligation('OPS-internal-bylaws', 'LARGE_MEDIUM'),
  obligation('GL-register-endowment', 'ALL', 'deadline.REGISTER_30BD.businessDays'),
  obligation('OPS-simplified-return', 'SMALL_DIRECT'),
  // ⊕ S8-Q3. `FIN-quarterly-board-pack` used to sit at `LARGE_ONLY`, which the owner RETIRED. It is
  // re-gated here rather than left where it was, because a fixture row on a retired gate would have
  // exercised the new refusal INCIDENTALLY — and a control tested by accident is a control nobody
  // notices when it stops working. The retirement gets its own deliberate subject below.
  obligation('FIN-quarterly-board-pack', 'EXCLUDE_DIRECT'),
]);

/**
 * ⊕ S8-Q3's two new behaviours get their own catalogues, kept OUT of `CATALOGUE` so the partition and
 * exit-clause assertions above keep measuring what they were written to measure.
 */
const RETIRED_CATALOGUE: readonly GatedObligation[] = Object.freeze([
  obligation('FIN-legacy-large-only', 'LARGE_ONLY'),
]);

const INCOME_CATALOGUE: readonly GatedObligation[] = Object.freeze([
  obligation('FIN-record-revenue-in-arabic', 'HAS_INCOME'),
  obligation('FIN-bank-reconciliation', 'HAS_INCOME'),
]);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * All sixteen cells
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The expected matrix, written out **independently of the implementation's own table**.
 *
 * A test that iterated `CLASSIFICATION_GATE_MATRIX` and asserted each cell equalled itself would be a
 * tautology. This is the second copy, on purpose, and it is the only place in this suite where a second
 * copy is the right thing: sixteen booleans is small enough to state, and stating them is what makes an
 * edit to the matrix show up as a failing test rather than as a silently different regime.
 */
/**
 * ⊕ S8-Q3 (product owner, 2026-08-23) — FIVE gates in service plus one retired, and the matrix now
 * covers only the STATIC ones. `HAS_INCOME` is absent from this table because it is absent from the
 * matrix: §09 calls it *"a runtime predicate, not a static class set"*, and a row of four booleans
 * would have type-checked, read as "applies to nobody", and silently dropped four of §09's
 * obligations — including recording revenue and expenses in Arabic, which NFR-01 makes
 * non-negotiable. Its behaviour is asserted in its own block below, against the ledger fact.
 */
const EXPECTED: Readonly<Record<StaticClassificationGate, readonly WaqfClassification[]>> = {
  // ⊕ S8-Q4: `NOT_CLASSIFIED` appears in NO admitted list — the whole column is false, which is the
  // ruling's own sentence ("must never gate a template TRUE") stated as data. The cells loop below
  // therefore expects `false` for all five gates at that class without a special case.
  // ⊕ S9-4a — THE SIZE AXIS ONLY. `DIRECT_UTILIZATION` is gone from `WAQF_CLASSIFICATIONS` (owner
  // ruling, fifth batch): it is an orthogonal USAGE attribute, so `SMALL_DIRECT`'s size half is just
  // SMALL and `EXCLUDE_DIRECT`'s is every size. What direct use ADDS or REMOVES is
  // `DIRECT_USE_AXIS`, asserted in its own block below.
  ALL: ['LARGE', 'MEDIUM', 'SMALL'],
  LARGE_MEDIUM: ['LARGE', 'MEDIUM'],
  SMALL_DIRECT: ['SMALL'],
  EXCLUDE_DIRECT: ['LARGE', 'MEDIUM', 'SMALL'],
  LARGE_ONLY: ['LARGE'],
};

describe('the StaticClassificationGate × SIZE matrix — all 20 cells', () => {
  const cells = STATIC_CLASSIFICATION_GATES.flatMap((gate) =>
    WAQF_CLASSIFICATIONS.map(
      (classification) => [gate, classification, EXPECTED[gate].includes(classification)] as const,
    ),
  );

  it('is exactly 20 cells — five static gates, FOUR size values, nothing missing', () => {
    // ⊕ S9-4a: 25 → 20, and the matrix SHRANK because usage left the size enum (owner ruling, fifth
    // batch). The gate list is unchanged; `WAQF_CLASSIFICATIONS` lost `DIRECT_UTILIZATION`, and the
    // two cells it used to occupy are re-expressed on `DIRECT_USE_AXIS`.
    expect(STATIC_CLASSIFICATION_GATES).toHaveLength(5);
    expect(CLASSIFICATION_GATES).toHaveLength(6);
    expect(WAQF_CLASSIFICATIONS).toHaveLength(4);
    expect(REAL_CLASSIFICATIONS).toHaveLength(3);
    expect(cells).toHaveLength(20);
  });

  it('the ONE non-static gate is HAS_INCOME, and it is not in the matrix', () => {
    // Pinned both ways so the split cannot drift: exactly one recognised gate is outside the matrix,
    // and it is the one §09 describes as a runtime predicate.
    const nonStatic = CLASSIFICATION_GATES.filter(
      (gate) => !(STATIC_CLASSIFICATION_GATES as readonly string[]).includes(gate),
    );
    expect(nonStatic).toEqual(['HAS_INCOME']);
    expect(Object.keys(CLASSIFICATION_GATE_MATRIX)).not.toContain('HAS_INCOME');
  });

  it.each(cells)('%s admits %s === %s', (gate, classification, expected) => {
    // ⊕ S9-4a — `directUtilization: false` is passed EXPLICITLY, not omitted. Omitting it would make
    // the two usage-sensitive gates return `DIRECT_USE_UNRECORDED` instead of a boolean, and this
    // table is about the SIZE axis in isolation: "not direct use" is the condition under which the
    // size answer stands alone.
    expect(gateAppliesTo(gate, classification, false)).toBe(expected);
  });

  it('EXCLUDE_DIRECT is not merely "every size" — it is a statement about the USAGE axis', () => {
    // ⊕ S9-4a: on the SIZE axis it now admits all three, which is exactly why the old model could
    // not express it. The content of the gate lives on the OTHER axis: `excludes` means direct use
    // takes the row away whatever the size — §09's *"a Direct-utilization waqf has none"* of the
    // monetary-distribution duties, because its benefit IS the use and there is no yield.
    expect(classesAdmittedBy('EXCLUDE_DIRECT')).toStrictEqual(['LARGE', 'MEDIUM', 'SMALL']);
    for (const classification of REAL_CLASSIFICATIONS) {
      expect(gateAppliesTo('EXCLUDE_DIRECT', classification, false)).toBe(true);
      expect(gateAppliesTo('EXCLUDE_DIRECT', classification, true)).toBe(false);
    }
  });

  it('NEGATIVE CONTROL · does not admit everything for everyone', () => {
    // Without this, a matrix of all-`true` would pass every "MEDIUM shows the audited statement"
    // assertion in this file and in the two layers above it.
    const admitted = STATIC_CLASSIFICATION_GATES.flatMap((gate) =>
      WAQF_CLASSIFICATIONS.map((classification) => gateAppliesTo(gate, classification, false)),
    );
    // ⊕ S9-4a: 20 cells now (5 gates × 4 size values), of which 10 are true. The count moved because
    // the matrix LOST a column, not because a rule changed: `DIRECT_UTILIZATION`'s two admitted cells
    // (`ALL` and `SMALL_DIRECT`) left with it, and both are re-expressed on the usage axis.
    expect(admitted.length).toBe(20);
    expect(admitted.filter(Boolean).length).toBe(10);
    expect(admitted.filter((value) => !value).length).toBe(10);
  });

  it('SMALL_DIRECT is the EXACT complement of LARGE_MEDIUM, and ALL is their union', () => {
    // A relation that is invisible in nested `if`s and provable over a table. If a future gate change
    // makes MEDIUM lighter-touch, exactly one of these three lines must be edited deliberately.
    // ⊕ S8-Q4: stated over the REAL classes — complement and union are laws about DETERMINATIONS,
    // and at NOT_CLASSIFIED both sides are false by ruling (the all-false column is pinned in the
    // S8-Q4 block below), so including it here would break the complement without meaning anything.
    for (const classification of REAL_CLASSIFICATIONS) {
      expect(gateAppliesTo('SMALL_DIRECT', classification, false)).toBe(
        !gateAppliesTo('LARGE_MEDIUM', classification, false),
      );
      expect(gateAppliesTo('ALL', classification, false)).toBe(true);
    }
    // …and LARGE_ONLY is a strict subset of LARGE_MEDIUM.
    for (const classification of WAQF_CLASSIFICATIONS) {
      if (gateAppliesTo('LARGE_ONLY', classification, false)) {
        expect(gateAppliesTo('LARGE_MEDIUM', classification, false)).toBe(true);
      }
    }
    expect(classesAdmittedBy('LARGE_ONLY')).toStrictEqual(['LARGE']);
    expect(classesAdmittedBy('SMALL_DIRECT')).toStrictEqual(['SMALL']);
  });

  it('⊕ S9-4a · direct use IS NOT A SIZE — and now it literally cannot be', () => {
    // This test used to assert that `DIRECT_UTILIZATION` was never admitted by `LARGE_MEDIUM` or
    // `LARGE_ONLY` — a rule the matrix had to be trusted to keep. The owner's ruling (fifth batch,
    // 2026-08-25) moved usage OFF the size enum entirely, so the old assertion is not merely
    // updated: **the thing it guarded against is now unrepresentable**, which is the stronger form.
    // ⚠ The literal is spelled out rather than shared with a constant on purpose: the value it names
    // no longer exists anywhere in the codebase, so there is nothing to import — and that absence IS
    // the assertion. (This line was itself corrupted once by a bulk rename that ran after the test
    // was written, replacing the retired value with 'SMALL' and making the test assert that SMALL is
    // not a classification. It went red immediately, which is the value of a specific assertion over
    // a vague one.)
    expect(WAQF_CLASSIFICATIONS as readonly string[]).not.toContain('DIRECT_UTILIZATION');
    expect(Object.keys(CLASSIFICATION_GATE_MATRIX.ALL)).not.toContain('DIRECT_UTILIZATION');

    // What the ruling made expressible, and the old model could NOT: a MEDIUM endowment that is
    // ALSO direct-use. It gets the lighter-touch statement AND loses the distribution duties — two
    // gates disagreeing about one endowment, which is exactly why one column could never hold both.
    expect(gateAppliesTo('SMALL_DIRECT', 'MEDIUM', true)).toBe(true);
    expect(gateAppliesTo('EXCLUDE_DIRECT', 'MEDIUM', true)).toBe(false);
    // …and the size-only gates are untouched by usage, so a MEDIUM direct-use endowment still owes
    // the heavier duties its SIZE carries. That is the separation working in the direction nobody
    // would think to check.
    expect(gateAppliesTo('LARGE_MEDIUM', 'MEDIUM', true)).toBe(true);
    expect(gateAppliesTo('ALL', 'MEDIUM', true)).toBe(true);
  });

  it('⊕ S9-4a · an UNRECORDED usage attribute is REFUSED, never read as "not direct"', () => {
    // The ruling in terms: *"no default — an endowment whose usage is unrecorded is UNRECORDED, not
    // 'not direct'."* ⚠ And reading absence as `false` would decide the question in BOTH directions
    // at once: `EXCLUDE_DIRECT` would ADD the monetary-distribution duties to an endowment that may
    // have no yield, while `SMALL_DIRECT` would REMOVE the simplified statement from one that owes
    // it. So the sensitive gates refuse, and the size-only gates still answer.
    for (const absent of [undefined, null]) {
      expect(gateAppliesTo('SMALL_DIRECT', 'SMALL', absent)).toBe(DIRECT_USE_UNRECORDED);
      expect(gateAppliesTo('EXCLUDE_DIRECT', 'MEDIUM', absent)).toBe(DIRECT_USE_UNRECORDED);
      // Not sensitive ⇒ still a plain boolean. A caller with no attribute gets a complete answer for
      // most of the catalogue, which is what stops the refusal being a denial of service.
      expect(gateAppliesTo('ALL', 'LARGE', absent)).toBe(true);
      expect(gateAppliesTo('LARGE_MEDIUM', 'SMALL', absent)).toBe(false);
    }
    // The sensitive set is DERIVED from the axis table, never restated.
    expect([...DIRECT_USE_SENSITIVE_GATES].sort()).toStrictEqual([
      'EXCLUDE_DIRECT',
      'SMALL_DIRECT',
    ]);
  });

  it('guards reject near-miss spellings', () => {
    expect(isClassificationGate('LARGE_MEDIUM')).toBe(true);
    expect(isClassificationGate('large_medium')).toBe(false);
    expect(isClassificationGate('MEDIUM_LARGE')).toBe(false);
    expect(isWaqfClassification('SMALL')).toBe(true);
    // The §08-sketch spelling that motivated the whole vocabulary-case discipline.
    expect(isWaqfClassification('direct-utilization')).toBe(false);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE EXIT CLAUSE'S CONTRAST
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('§17 E3 exit · MEDIUM shows audited-statement/bylaw obligations that SMALL does not', () => {
  const medium = obligationsForClassification({
    classification: 'MEDIUM',
    catalogue: CATALOGUE,
    directUtilization: false,
  });
  const small = obligationsForClassification({
    classification: 'SMALL',
    catalogue: CATALOGUE,
    directUtilization: false,
  });

  it('MEDIUM binds BOTH LARGE_MEDIUM obligations', () => {
    const codes = medium.obligations.map((entry) => entry.code);
    expect(codes).toContain('FIN-audited-statement');
    expect(codes).toContain('OPS-internal-bylaws');
  });

  it('SMALL binds NEITHER — and they appear in `excluded` with the reason, not merely absent', () => {
    const codes = small.obligations.map((entry) => entry.code);
    expect(codes).not.toContain('FIN-audited-statement');
    expect(codes).not.toContain('OPS-internal-bylaws');

    // "Absent" is indistinguishable from "the catalogue never had them". The `excluded` list is what
    // makes the contrast provable in one call — and what lets a screen say WHY a duty is not shown.
    for (const code of ['FIN-audited-statement', 'OPS-internal-bylaws']) {
      const entry = small.excluded.find((candidate) => candidate.code === code);
      expect(entry, code).toBeDefined();
      expect(entry?.reason).toBe(GATE_EXCLUSION_REASON);
      expect(entry?.resolvedGate).toBe('LARGE_MEDIUM');
      expect(entry?.unverified).toBe(true);
    }
  });

  it('the contrast runs BOTH ways — SMALL gets the lighter-touch duty MEDIUM does not', () => {
    // Asserted so the matrix cannot be "LARGE_MEDIUM is everything and SMALL_DIRECT is nothing", which
    // would satisfy the clause as literally worded while being a different regime.
    expect(small.obligations.map((entry) => entry.code)).toContain('OPS-simplified-return');
    expect(medium.obligations.map((entry) => entry.code)).not.toContain('OPS-simplified-return');
    // ⊕ S8-Q3 CHANGED THIS CLAUSE and it is rewritten rather than deleted. It used to read "…and the
    // LARGE_ONLY duty binds neither of them", which was true while the board pack sat on the retired
    // gate. Re-gated to `EXCLUDE_DIRECT` it binds MEDIUM and SMALL both — they distribute money — so
    // the honest contrast is with DIRECT_UTILIZATION, which does not.
    for (const result of [medium, small]) {
      expect(result.obligations.map((entry) => entry.code)).toContain('FIN-quarterly-board-pack');
    }
    const direct = obligationsForClassification({
      classification: 'SMALL',
      directUtilization: true,
      catalogue: CATALOGUE,
    });
    expect(direct.obligations.map((entry) => entry.code)).not.toContain('FIN-quarterly-board-pack');
    expect(
      direct.excluded.find((entry) => entry.code === 'FIN-quarterly-board-pack')?.reason,
      'a direct-use endowment must be told WHY a distribution duty does not apply',
    ).toBe(GATE_EXCLUSION_REASON);
  });

  it('every REAL class gets the ALL-gated baseline duty (a locked register gets NOTHING — S8-Q4 block)', () => {
    for (const classification of REAL_CLASSIFICATIONS) {
      const result = obligationsForClassification({
        classification,
        catalogue: CATALOGUE,
        directUtilization: false,
      });
      expect(
        result.obligations.map((entry) => entry.code),
        classification,
      ).toContain('GL-register-endowment');
    }
  });

  it('partitions the catalogue exactly — nothing lost, nothing counted twice', () => {
    // REAL classes only: at NOT_CLASSIFIED the resolver refuses to partition AT ALL (S8-Q4), and
    // "all five buckets sum to zero" would be this law passing vacuously, not holding.
    for (const classification of REAL_CLASSIFICATIONS) {
      const result = obligationsForClassification({
        classification,
        catalogue: CATALOGUE,
        directUtilization: false,
      });
      expect(
        result.obligations.length +
          result.excluded.length +
          result.unrecognisedGate.length +
          // ⊕ S8-Q3 added two buckets. Counted here because the property being asserted is that the
          // catalogue is PARTITIONED — every row lands in exactly one bucket. A new bucket left out of
          // this sum would let a row vanish while the test stayed green, which is precisely what the
          // buckets exist to prevent.
          result.retiredGate.length +
          result.incomeFactMissing.length,
        classification,
      ).toBe(CATALOGUE.length);
      // ⊕ E7-completion: ALL FIVE buckets, matching the sum above. This list read obligations +
      // excluded only, and passed by luck of the test catalogue — no row of it could reach the
      // other three buckets at a real class until §09's income-conditional cell (`SMALL_DIRECT`
      // at `DIRECT_UTILIZATION`, the A6 clause) moved one to `incomeFactMissing` when no ledger
      // fact is supplied. The uniqueness property is over the PARTITION, so it counts every bucket.
      const codes = [
        ...result.obligations.map((entry) => entry.code),
        ...result.excluded.map((entry) => entry.code),
        ...result.unrecognisedGate.map((entry) => entry.code),
        ...result.retiredGate.map((entry) => entry.code),
        ...result.incomeFactMissing.map((entry) => entry.code),
      ];
      expect(new Set(codes).size).toBe(CATALOGUE.length);
    }
  });

  it('passes the Arabic-authoritative fields through untouched (NFR-01) and writes no copy', () => {
    // This module renders nothing and translates nothing. The ar/en titles are the catalogue's, and a
    // gating resolver that "helpfully" defaulted a missing Arabic title would be inventing regulatory
    // copy.
    const entry = medium.obligations.find(
      (candidate) => candidate.code === 'FIN-audited-statement',
    );
    expect(entry?.titleAr).toBe('التزام تنظيمي (بيانات تجريبية)');
    expect(entry?.deadlineRuleKey).toBe('deadline.AUDITED_STATEMENT.months');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⊕ E7-completion — §09's ONE income-conditional cell (`SMALL_DIRECT` @ `DIRECT_UTILIZATION`)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the income-conditional cell — §09: "Direct-utilization ✓ (if income/expense exists)"', () => {
  const simplifiedReturn = 'OPS-simplified-return';

  it('at DIRECT_UTILIZATION with NO fact, the SMALL_DIRECT row is UNDECIDED — never defaulted', () => {
    const result = obligationsForClassification({
      classification: 'SMALL',
      directUtilization: true,
      catalogue: CATALOGUE,
    });
    expect(result.incomeFactMissing.map((entry) => entry.code)).toContain(simplifiedReturn);
    expect(result.obligations.map((entry) => entry.code)).not.toContain(simplifiedReturn);
    expect(result.excluded.map((entry) => entry.code)).not.toContain(simplifiedReturn);
  });

  it('at DIRECT_UTILIZATION the fact DECIDES it — true applies, false excludes with the income reason', () => {
    const withIncome = obligationsForClassification({
      classification: 'SMALL',
      directUtilization: true,
      catalogue: CATALOGUE,
      hasIncomeInPeriod: true,
    });
    expect(withIncome.obligations.map((entry) => entry.code)).toContain(simplifiedReturn);

    const without = obligationsForClassification({
      classification: 'SMALL',
      directUtilization: true,
      catalogue: CATALOGUE,
      hasIncomeInPeriod: false,
    });
    expect(
      without.excluded.find((entry) => entry.code === simplifiedReturn)?.reason,
      'a moneyless direct-benefit waqf is told the duty is excluded FOR THE INCOME REASON, ' +
        'not by the gate — §09 admits the class and the ledger says no',
    ).toBe(INCOME_EXCLUSION_REASON);
  });

  it('at SMALL the same row is UNCONDITIONAL — the ✓ without the footnote', () => {
    // The negative control: the conditional is ONE cell, not the gate. A resolver that made the
    // whole gate income-conditional would strip the simplified statement from every SMALL waqf
    // with no recorded revenue — §09 conditions only the Direct-utilization ✓.
    const small = obligationsForClassification({
      classification: 'SMALL',
      catalogue: CATALOGUE,
      directUtilization: false,
    });
    expect(small.obligations.map((entry) => entry.code)).toContain(simplifiedReturn);
    expect(small.incomeFactMissing).toHaveLength(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Binding rule 3
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the SAR bands stay in `Setting` and are never reimplemented here', () => {
  it('names the band Setting KEYS and contains no threshold figure', () => {
    expect(CLASSIFICATION_BAND_SETTING_KEYS).toStrictEqual([
      'classification.threshold.large.sar',
      'classification.threshold.medium.sar',
    ]);
    const result = obligationsForClassification({
      classification: 'LARGE',
      catalogue: CATALOGUE,
      directUtilization: false,
    });
    expect(result.bandSettingKeys).toStrictEqual(CLASSIFICATION_BAND_SETTING_KEYS);
    // The module has no function that takes an AMOUNT: it maps a recorded class, so there is nowhere for
    // a hardcoded 200,000,000 to live. Asserted as the absence of the figure from the whole result.
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('200000000');
    expect(serialized).not.toContain('50000000');
  });

  it('⚠ carries the unverified marker on every result and on every applicable obligation', () => {
    for (const classification of WAQF_CLASSIFICATIONS) {
      const result = obligationsForClassification({
        classification,
        catalogue: CATALOGUE,
        directUtilization: false,
      });
      expect(result.unverifiedNotes, classification).toStrictEqual([UNVERIFIED_NOTE]);
      for (const entry of result.obligations) expect(entry.unverified).toBe(true);
      for (const entry of result.excluded) expect(entry.unverified).toBe(true);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * An unreadable gate is REPORTED, never silently excluded
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('an unrecognised gate is reported as its own bucket — a duty must not vanish', () => {
  const dirty: readonly GatedObligation[] = [
    ...CATALOGUE,
    obligation('GL-mystery-duty', 'MEDIUM_AND_UP'),
    obligation('GL-lowercase-gate', 'large_medium'),
  ];

  it('is in NEITHER `obligations` NOR `excluded`', () => {
    const result = obligationsForClassification({
      classification: 'MEDIUM',
      catalogue: dirty,
      directUtilization: false,
    });
    const codes = [
      ...result.obligations.map((entry) => entry.code),
      ...result.excluded.map((entry) => entry.code),
    ];
    expect(codes).not.toContain('GL-mystery-duty');
    expect(codes).not.toContain('GL-lowercase-gate');
    // Folding it into `excluded` would mean a mis-typed catalogue row silently removes a regulatory duty
    // from an endowment's register, with nothing anywhere saying so.
    expect(result.unrecognisedGate.map((entry) => entry.code)).toStrictEqual([
      'GL-mystery-duty',
      'GL-lowercase-gate',
    ]);
  });

  it('names the recorded value AND the recognised set, so the caller can refuse usefully', () => {
    const result = obligationsForClassification({
      classification: 'MEDIUM',
      catalogue: dirty,
      directUtilization: false,
    });
    expect(result.unrecognisedGate[0]).toMatchObject({
      recordedGate: 'MEDIUM_AND_UP',
      recognisedGates: CLASSIFICATION_GATES,
    });
    // A near-miss of a REAL gate is still unrecognised — case is part of the vocabulary, which is the
    // `direct-utilization` lesson applied to gates.
    expect(result.unrecognisedGate[1]?.recordedGate).toBe('large_medium');
  });

  it('reports every bad row in ONE pass rather than one per round trip', () => {
    const result = obligationsForClassification({
      classification: 'SMALL',
      catalogue: dirty,
      directUtilization: false,
    });
    expect(result.unrecognisedGate).toHaveLength(2);
    // …and the clean rows are still partitioned normally, so one bad row does not blind the caller to
    // the rest of the register.
    expect(result.obligations.length).toBeGreaterThan(0);
    expect(result.excluded.length).toBeGreaterThan(0);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * BR-104's actual point: re-classification changes which duties exist
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('obligationDelta · a re-classification GAINS and LOSES duties (BR-104)', () => {
  it('⊕ MEDIUM → LARGE now changes NOTHING, and that is a consequence of S8-Q3 worth stating', () => {
    // This test used to read "gains the LARGE_ONLY duty and loses nothing". `LARGE_ONLY` was the ONLY
    // gate that distinguished LARGE from MEDIUM, and the owner retired it — so after S8-Q3 **no gate
    // in the vocabulary separates the two classes**, and a MEDIUM → LARGE reclassification alters no
    // duty at all.
    //
    // ⚠ That is a real product fact, not a test artefact, and it is asserted rather than left to be
    // rediscovered: BR-104's whole premise is that "classification is a gate, not a label", and for
    // this one transition it is now, precisely, a label. If the regulation does impose something on
    // Large-and-not-Medium endowments, the library has no way to say so and somebody must add a gate
    // — which is a question for counsel about §09's own table, not a gap in this module.
    const delta = obligationDelta({
      from: 'MEDIUM',
      to: 'LARGE',
      catalogue: CATALOGUE,
      directUtilization: false,
    });
    expect(delta.gained).toStrictEqual([]);
    expect(delta.lost).toStrictEqual([]);
    expect(delta.unchanged.map((entry) => entry.code)).toStrictEqual([
      'FIN-audited-statement',
      'OPS-internal-bylaws',
      'GL-register-endowment',
      'FIN-quarterly-board-pack',
    ]);
  });

  it('MEDIUM → SMALL LOSES the audited statement and the bylaws, and gains the light return', () => {
    // The sentence a Nazir must see before confirming a downgrade: two regulatory duties stop applying.
    const delta = obligationDelta({
      from: 'MEDIUM',
      to: 'SMALL',
      catalogue: CATALOGUE,
      directUtilization: false,
    });
    expect(delta.lost.map((entry) => entry.code)).toStrictEqual([
      'FIN-audited-statement',
      'OPS-internal-bylaws',
    ]);
    expect(delta.gained.map((entry) => entry.code)).toStrictEqual(['OPS-simplified-return']);
  });

  it('a no-op reclassification gains and loses nothing', () => {
    for (const classification of WAQF_CLASSIFICATIONS) {
      const delta = obligationDelta({
        from: classification,
        to: classification,
        catalogue: CATALOGUE,
        directUtilization: false,
      });
      expect(delta.gained, classification).toStrictEqual([]);
      expect(delta.lost, classification).toStrictEqual([]);
    }
  });

  it('is antisymmetric — what one direction gains, the reverse loses', () => {
    for (const from of WAQF_CLASSIFICATIONS) {
      for (const to of WAQF_CLASSIFICATIONS) {
        const forward = obligationDelta({
          from,
          to,
          catalogue: CATALOGUE,
          directUtilization: false,
        });
        const backward = obligationDelta({
          from: to,
          to: from,
          catalogue: CATALOGUE,
          directUtilization: false,
        });
        expect(
          forward.gained.map((entry) => entry.code),
          `${from}→${to}`,
        ).toStrictEqual(backward.lost.map((entry) => entry.code));
      }
    }
  });

  it('never reports an unreadable duty as gained or lost', () => {
    const delta = obligationDelta({
      from: 'SMALL',
      to: 'LARGE',
      catalogue: [...CATALOGUE, obligation('GL-mystery-duty', 'MEDIUM_AND_UP')],
      directUtilization: false,
    });
    for (const list of [delta.gained, delta.lost, delta.unchanged]) {
      expect(list.map((entry) => entry.code)).not.toContain('GL-mystery-duty');
    }
    expect(delta.unrecognisedGate.map((entry) => entry.code)).toStrictEqual(['GL-mystery-duty']);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Purity
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the resolver is pure', () => {
  it('does not mutate the catalogue and returns frozen results', () => {
    const before = JSON.stringify(CATALOGUE);
    const result = obligationsForClassification({
      classification: 'LARGE',
      catalogue: CATALOGUE,
      directUtilization: false,
    });
    expect(JSON.stringify(CATALOGUE)).toBe(before);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.obligations)).toBe(true);
    expect(Object.isFrozen(CLASSIFICATION_GATE_MATRIX)).toBe(true);
  });

  it('handles an empty catalogue without inventing anything', () => {
    const result = obligationsForClassification({
      classification: 'LARGE',
      catalogue: [],
      directUtilization: false,
    });
    expect(result.obligations).toStrictEqual([]);
    expect(result.excluded).toStrictEqual([]);
    expect(result.unrecognisedGate).toStrictEqual([]);
    // ⚠ An empty catalogue is a CALLER problem, not a gating one — and this is why the database layer
    // has to assert the seeded catalogue is non-empty. Over an empty catalogue every contrast assertion
    // in the API layer would pass while proving nothing.
    expect(result.classification).toBe('LARGE');
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⊕ S8-Q3 — THE RETIRED GATE AND THE RUNTIME PREDICATE
 *
 * The owner's ruling adopted §09's five gates and retired `LARGE_ONLY` "refused-not-remapped",
 * naming the `has_income` runtime-predicate consequence and leaving that design to engineering. This
 * block is where the design is asserted.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('a RETIRED gate is refused — never excluded, never applied', () => {
  it('lands in its own bucket, and in NEITHER obligations nor excluded', () => {
    // The whole point of a separate bucket. Folded into `excluded` the row would read as "this duty
    // does not apply to this endowment" — a statement about the endowment — when the truth is "this
    // row was written against a rule the product no longer has", a statement about the CATALOGUE. A
    // silently excluded duty leaves no trace, which is the failure these buckets exist to prevent.
    // (REAL classes: the locked NOT_CLASSIFIED register reports nothing at all — S8-Q4 block.)
    for (const classification of REAL_CLASSIFICATIONS) {
      const result = obligationsForClassification({
        classification,
        catalogue: RETIRED_CATALOGUE,
        directUtilization: false,
      });
      expect(result.retiredGate.map((entry) => entry.code)).toStrictEqual([
        'FIN-legacy-large-only',
      ]);
      expect(result.obligations, classification).toStrictEqual([]);
      expect(result.excluded, classification).toStrictEqual([]);
      expect(result.unrecognisedGate, classification).toStrictEqual([]);
    }
  });

  it('is refused for EVERY class — including the one the matrix row would have admitted', () => {
    // `LARGE_ONLY`'s matrix row is deliberately KEPT (so the matrix stays total over its key type and
    // `classesAdmittedBy` can still answer for an old record), and it says LARGE: true. So this is the
    // case that proves the retirement check runs BEFORE the matrix is consulted rather than after —
    // without that ordering a LARGE endowment would still be handed the retired duty.
    expect(gateAppliesTo('LARGE_ONLY', 'LARGE')).toBe(true);
    const large = obligationsForClassification({
      classification: 'LARGE',
      catalogue: RETIRED_CATALOGUE,
      directUtilization: false,
    });
    expect(large.obligations).toStrictEqual([]);
    expect(large.retiredGate).toHaveLength(1);
  });

  it('names the LIVE gates, so a refusal can say what to use instead', () => {
    // A refusal that states only the prohibition gets the guard deleted by the next person who hits
    // it — the retention guards' lesson, applied to a data refusal.
    const result = obligationsForClassification({
      classification: 'LARGE',
      catalogue: RETIRED_CATALOGUE,
      directUtilization: false,
    });
    const entry = result.retiredGate[0];
    expect(entry?.retiredGateValue).toBe('LARGE_ONLY');
    expect(entry?.liveGates).not.toContain('LARGE_ONLY');
    expect(entry?.liveGates).toContain('EXCLUDE_DIRECT');
    expect(entry?.liveGates).toHaveLength(CLASSIFICATION_GATES.length - RETIRED_GATES.length);
  });

  it('a retired gate is NOT reported as unrecognised — they are different facts', () => {
    const retired = obligationsForClassification({
      classification: 'LARGE',
      catalogue: RETIRED_CATALOGUE,
      directUtilization: false,
    });
    const typo = obligationsForClassification({
      classification: 'LARGE',
      catalogue: [obligation('FIN-typo', 'LARGE_ONLYY')],
      directUtilization: false,
    });
    expect(retired.retiredGate).toHaveLength(1);
    expect(retired.unrecognisedGate).toHaveLength(0);
    expect(typo.unrecognisedGate).toHaveLength(1);
    expect(typo.retiredGate).toHaveLength(0);
  });
});

describe('HAS_INCOME is a LEDGER fact, and its absence is reported rather than guessed', () => {
  it('the fact MISSING → its own bucket, on every class, and NOTHING is decided', () => {
    // ⚠ THE SHARPEST ASSERTION IN THIS FILE. `false` would silently drop four of §09's obligations —
    // including recording revenue and expenses in Arabic, which NFR-01 makes non-negotiable. `true`
    // would tell a moneyless direct-use endowment that it owes bank reconciliation and a zakat
    // filing. There is no safe default for an unasked question, so the engine reports it was not
    // asked — the same posture the distribution engine takes on SHART_INCOMPLETE.
    for (const classification of REAL_CLASSIFICATIONS) {
      const result = obligationsForClassification({
        classification,
        catalogue: INCOME_CATALOGUE,
        directUtilization: false,
      });
      expect(
        result.incomeFactMissing.map((entry) => entry.code),
        classification,
      ).toStrictEqual(['FIN-record-revenue-in-arabic', 'FIN-bank-reconciliation']);
      expect(result.obligations, classification).toStrictEqual([]);
      expect(result.excluded, classification).toStrictEqual([]);
      for (const entry of result.incomeFactMissing)
        expect(entry.requiredFact).toBe('hasIncomeInPeriod');
    }
  });

  it('`null` is treated exactly as absent — a nullable column must not become a verdict', () => {
    const result = obligationsForClassification({
      classification: 'SMALL',
      catalogue: INCOME_CATALOGUE,
      hasIncomeInPeriod: null,
      directUtilization: false,
    });
    expect(result.incomeFactMissing).toHaveLength(2);
    expect(result.obligations).toStrictEqual([]);
  });

  it('income TRUE → applies, on every class, INCLUDING direct-utilization', () => {
    // The point of the gate: §09 says it "lets a Direct-utilization waqf that happens to collect
    // incidental income still get its accounting/annual-statement duties". So the class must not
    // narrow it — this is the assertion that would fail if somebody "helpfully" ANDed the ledger fact
    // with a class set.
    for (const classification of REAL_CLASSIFICATIONS) {
      const result = obligationsForClassification({
        classification,
        catalogue: INCOME_CATALOGUE,
        hasIncomeInPeriod: true,
        directUtilization: false,
      });
      expect(
        result.obligations.map((entry) => entry.code),
        classification,
      ).toStrictEqual(['FIN-record-revenue-in-arabic', 'FIN-bank-reconciliation']);
      expect(result.incomeFactMissing, classification).toStrictEqual([]);
      for (const entry of result.obligations) expect(entry.resolvedGate).toBe(HAS_INCOME_GATE);
    }
  });

  it('income FALSE → excluded with its OWN reason, not the gate reason', () => {
    // The two exclusions have different lifetimes and a screen must not merge them:
    // GATE_EXCLUDES_CLASSIFICATION changes only on an audited reclassification, while this one flips
    // the moment one receipt is booked. Merged under one sentence, a Nazir would be told a duty does
    // not apply to this endowment when the truth is "not yet, this period".
    const result = obligationsForClassification({
      classification: 'LARGE',
      catalogue: INCOME_CATALOGUE,
      hasIncomeInPeriod: false,
      directUtilization: false,
    });
    expect(result.obligations).toStrictEqual([]);
    expect(result.excluded).toHaveLength(2);
    for (const entry of result.excluded) {
      expect(entry.reason).toBe(INCOME_EXCLUSION_REASON);
      expect(entry.reason).not.toBe(GATE_EXCLUSION_REASON);
    }
  });

  it('the ledger fact does NOT leak onto any other gate', () => {
    // Supplying the fact must change nothing for a statically-gated row. Without this, a resolver that
    // consulted `hasIncomeInPeriod` too eagerly would pass every test above while quietly making
    // every duty conditional on the ledger.
    const withFact = obligationsForClassification({
      classification: 'MEDIUM',
      catalogue: CATALOGUE,
      hasIncomeInPeriod: false,
      directUtilization: false,
    });
    const withoutFact = obligationsForClassification({
      classification: 'MEDIUM',
      catalogue: CATALOGUE,
      directUtilization: false,
    });
    expect(withFact.obligations.map((e) => e.code)).toStrictEqual(
      withoutFact.obligations.map((e) => e.code),
    );
    expect(withFact.excluded.map((e) => e.code)).toStrictEqual(
      withoutFact.excluded.map((e) => e.code),
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⊕ S8-Q4 — `NOT_CLASSIFIED` LOCKS THE REGISTER
 *
 * Owner ruling, 2026-08-23 (memo, S8 addendum second batch): "An explicit not-yet-classified
 * value; the register locks (no tasks instantiate) until the real classification is recorded. …
 * NOT_CLASSIFIED must never gate a template TRUE — it is the absence of a determination, not a
 * class." This block is E7 exit clause A2's domain half, plus the liveness half the sprint's
 * lesson demands: the lock's ONE exit (a delta FROM the state) must work.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('S8-Q4 · NOT_CLASSIFIED locks the register', () => {
  it('THE RULING AS A PIN · no gate is ever TRUE at NOT_CLASSIFIED — the whole column, every path', () => {
    for (const gate of STATIC_CLASSIFICATION_GATES) {
      expect(gateAppliesTo(gate, 'NOT_CLASSIFIED', false), gate).toBe(false);
      expect(classesAdmittedBy(gate), gate).not.toContain('NOT_CLASSIFIED');
    }
    // …and the matrix rows themselves, so a caller reading the table raw finds the same answer.
    for (const gate of STATIC_CLASSIFICATION_GATES) {
      expect(CLASSIFICATION_GATE_MATRIX[gate].NOT_CLASSIFIED, gate).toBe(false);
    }
  });

  it('the resolver REFUSES TO PARTITION — locked, and every list empty, whatever the catalogue holds', () => {
    // The catalogue below contains every kind of row this module knows: static, retired,
    // unrecognised, and ledger-gated WITH the fact supplied. A locked register reports NONE of
    // them — not even the defective ones — because the lock sits ABOVE the partition: no question
    // was answered, so no row was inspected. (A defective catalogue row still cannot hide: every
    // read for a REAL class reports it, and the API's asserts run on those.)
    const result = obligationsForClassification({
      classification: 'NOT_CLASSIFIED',
      catalogue: [
        ...CATALOGUE,
        ...RETIRED_CATALOGUE,
        ...INCOME_CATALOGUE,
        obligation('GL-mystery-duty', 'MEDIUM_AND_UP'),
      ],
      hasIncomeInPeriod: true,
      directUtilization: false,
    });
    expect(result.registerLocked).toBe(true);
    expect(result.classification).toBe('NOT_CLASSIFIED');
    expect(result.obligations).toStrictEqual([]);
    expect(result.excluded).toStrictEqual([]);
    expect(result.unrecognisedGate).toStrictEqual([]);
    expect(result.retiredGate).toStrictEqual([]);
    expect(result.incomeFactMissing).toStrictEqual([]);
    // Still a result of this module: frozen, and carrying the binding-rule-3 marker.
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.unverifiedNotes).toStrictEqual([UNVERIFIED_NOTE]);
    expect(REGISTER_LOCK_REASON).toBe('REGISTER_LOCKED_NOT_CLASSIFIED');
  });

  it('an EMPTY register and a LOCKED one are different facts — `registerLocked` is what tells them apart', () => {
    // An empty catalogue for a REAL class: same empty lists, registerLocked false. Without the
    // flag the two responses would be byte-identical, and a screen would tell an unclassified
    // endowment "you owe nothing" — the exact misreading the lock exists to prevent.
    const emptyReal = obligationsForClassification({
      classification: 'SMALL',
      catalogue: [],
      directUtilization: false,
    });
    expect(emptyReal.registerLocked).toBe(false);
    const locked = obligationsForClassification({
      classification: 'NOT_CLASSIFIED',
      catalogue: [],
      directUtilization: false,
    });
    expect(locked.registerLocked).toBe(true);
  });

  it('every REAL class stays unlocked', () => {
    for (const classification of REAL_CLASSIFICATIONS) {
      const result = obligationsForClassification({
        classification,
        catalogue: CATALOGUE,
        directUtilization: false,
      });
      expect(result.registerLocked, classification).toBe(false);
    }
  });

  it("LIVENESS · the delta FROM NOT_CLASSIFIED — the lock's only exit — reports the full incoming set as GAINED", () => {
    // What a Nazir recording the FIRST classification must be shown: the endowment is not "gaining
    // nothing relative to nothing", it is acquiring its entire regulatory register. A locked
    // before-side contributes empty lists, so gained = everything the new class binds, lost = [].
    const delta = obligationDelta({
      from: 'NOT_CLASSIFIED',
      to: 'MEDIUM',
      catalogue: CATALOGUE,
      directUtilization: false,
    });
    expect(delta.gained.map((entry) => entry.code)).toStrictEqual([
      'FIN-audited-statement',
      'OPS-internal-bylaws',
      'GL-register-endowment',
      'FIN-quarterly-board-pack',
    ]);
    expect(delta.lost).toStrictEqual([]);
    expect(delta.unchanged).toStrictEqual([]);
  });

  it("the delta TO NOT_CLASSIFIED stays total here — the refusal of that transition is the API's and migration 34's", () => {
    // Pure math over the resolver: everything the real class bound is reported lost. The pure
    // module does not mint the refusal (both the reclassify input schema and the database's
    // to-check own it); it stays total so no caller can be handed an exception where the two
    // guards were expecting to be the answer.
    const delta = obligationDelta({
      from: 'MEDIUM',
      to: 'NOT_CLASSIFIED',
      catalogue: CATALOGUE,
      directUtilization: false,
    });
    expect(delta.gained).toStrictEqual([]);
    expect(delta.lost.map((entry) => entry.code)).toStrictEqual([
      'FIN-audited-statement',
      'OPS-internal-bylaws',
      'GL-register-endowment',
      'FIN-quarterly-board-pack',
    ]);
  });
});
