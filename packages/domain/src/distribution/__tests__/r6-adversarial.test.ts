/**
 * R6 · the adversarial pass on "S3-D1 is closed on the ORDERED path".
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Two documents in this repo have already recorded S3-D1 as closed, and both claims measured
 * false. R6 (product owner, 2026-08-03 — ADR-0009 open question 10, answered *"require the parent
 * on every deed"*) removed the `entitlementOrder === 'LINEAGE_CONTINUATION'` gate from
 * `buildLineage` pass 4, so a `FAMILY` / `CATEGORY_ONLY` beneficiary with no `lineageLink` now
 * halts every run. This file does not take that on trust. It drives the original attack and then
 * every other route to the same payout that the change does *not* obviously cover.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT WAS MEASURED, AND WHAT THE VERDICT IS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **The `FAMILY` / `CATEGORY_ONLY` route is genuinely and structurally shut.** §1 below drives
 * seven separate attempts and every one halts, each with the discriminator that names it. The
 * closure is structural rather than incidental: after R6 a `FAMILY` or `CATEGORY_ONLY` member
 * cannot carry `tabaqa: null` **at all** on any order — with no link the run halts
 * `LINEAGE_LINK_MISSING`, and with a link the member is in the graph, so a null ṭabaqa disagrees
 * with a derived depth of at least 1 and halts `TABAQA_MISMATCHES_LINEAGE_DEPTH`. Two independent
 * refusals, closing the shape from both sides.
 *
 * **⚠ THE PAYLOAD WAS NOT GONE — R6-D1. IT IS NOW CLOSED, AND §2 IS THE INVERSION OF THE TESTS
 * THAT MEASURED IT.** §2 originally measured the identical outcome — an untiered member escaping
 * the ORDERED tier test and taking the entire distributable of a `FAMILY_DHURRI` (ذري) waqf, with
 * no flag and with invariant **I5 still reported as checked** — reached with a `CHARITABLE_JIHA`
 * as the escapee instead of a `FAMILY` one. It was a live, reproducible run, and it was not an
 * exotic cohort: it is a family register whose descendants are recorded as not-yet-identified
 * placeholders, which `assertSingleWaqfNature`'s own comment calls *"a legitimate family waqf with
 * an unnamed descendant"*.
 *
 * The mechanism was a disagreement between two functions about what counts as a bloodline:
 *
 *  · `assertSingleWaqfNature` counted a family leg as `kind === 'FAMILY'` and nothing else, so a
 *    cohort of `CATEGORY_ONLY` members plus one jiha was not a "mixed" cohort to it.
 *  · `buildLineage` puts any member carrying a `lineageLink` into the family tree — including a
 *    `CATEGORY_ONLY` one — and R6 now *requires* that link. So the very members the mixing check
 *    did not count as family are the ones the lineage builder certifies as descendants of the
 *    waqif, at a derived ṭabaqa, on the same run. §2's surviving `basis.lineageDepth` assertion
 *    still proves it, now on the jiha-free control.
 *
 * **THE FIX (`resolver.ts` `assertSingleWaqfNature` + `SHART_REFUSALS`
 * `CHARITABLE_JIHA_ON_FAMILY_WAQF`):** a `CHARITABLE_JIHA` on a waqf typed `FAMILY_DHURRI` is
 * refused **whatever else the cohort holds and whatever the `entitlementOrder`** — an ancestral
 * waqf's beneficiaries ARE the waqif's descendants (R1) and a charity is not one, so the record
 * makes one endowment both خيري and ذري, which R5 forbids. Stated on the **declared type**, which
 * is the one thing the two neighbouring refusals could not see.
 *
 * ⚠ **Still surfaced, not settled.** The refusal carries a `TODO(surface)` in `resolver.ts`: it is
 * Claude's application of the owner's R5 to a shape the owner was not asked about directly. If a
 * family deed may legitimately name a charity, the refusal comes out and R5 needs restating. Every
 * test in §2 is written so that reversal turns them red rather than leaving them vacuously green —
 * each keeps the exact input that paid the money and asserts the refusal by its discriminator.
 *
 * **What is still NOT decided (CLAUDE.md binding rule 4):** whether a `CATEGORY_ONLY` member
 * carrying a lineage edge is a *family leg* for `COHORT_MIXES_CHARITABLE_AND_FAMILY`'s purposes.
 * The new refusal makes that question moot for the R6-D1 shape — a declared `FAMILY_DHURRI` type is
 * enough — but it is untouched for a cohort declared any other way, and register item #11 (الوقف
 * المشترك, Saudi counsel) still stands over R5 as a whole.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HOW EVERY FIGURE HERE WAS DERIVED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Example A's waterfall, by hand, in halalas — nothing below is copied from engine output:
 *
 *   revenue                       35,000,000
 *   − ṣiyāna (FIXED)             − 4,000,000
 *   − operating                  −         0
 *   = net income                  31,000,000
 *   − Nazir fee 10% of REVENUE   − 3,500,000   (⚠ ʿushr — set by this deed, unverified)
 *   = distributable               27,500,000
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MUTATION-VERIFIED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Re-gating `buildLineage` pass 4 on `order === 'LINEAGE_CONTINUATION'` (its pre-R6 form) turns
 * ten tests red across five files, §1 of this file among them; `resolver.ts` was restored
 * byte-identically afterwards (sha256 `ab9e1d2c…5619`). Separately, every one of the then-fifteen
 * `SHART_REFUSALS` discriminators and all six `EXCLUSION_REASON_CODES` were each replaced with a
 * sentinel in turn: every one turned at least two tests red, so no refusal and no exclusion reason
 * was unreachable or unpinned after R6.
 *
 * **The sixteenth refusal, `CHARITABLE_JIHA_ON_FAMILY_WAQF`, was mutation-verified the same way when
 * R6-D1 was closed.** Disabling the `if (input.waqfType === 'FAMILY_DHURRI' && charitableJihaCount
 * > 0)` block in `assertSingleWaqfNature` turns **12 tests red across 4 files** — §2's seven and
 * §3's one here (the exact tests that used to measure the payout), plus `engine.test.ts`,
 * `lineage-adversarial.test.ts` §9 and `worked-examples.test.ts`. A refusal whose removal left this
 * file green would be a refusal this file only *describes*.
 *
 * The re-pointed tests were verified the same way, because a test moved onto a cohort that refuses
 * earlier proves nothing about its own subject: hoisting `assertJihaNotTiered` ahead of the
 * `NA_DIRECT_USE` short-circuit reddens `engine.test.ts`'s "IS still unconditional…" and
 * `worked-examples.test.ts`'s direct-use precedence test (⚠ named here as "still short-circuits BEFORE
 * assertJihaNotTiered…" — a title that no longer exists: memo Q7 hoisted that guard, and the test is now
 * "short-circuits BEFORE the continuation parse — but NOT before the waqf-nature rules"); sentinelling the
 * jiha arm of `LINEAGE_EDGE_ON_NON_DESCENDANT` reddens `lineage-adversarial.test.ts` §4's re-pointed
 * case; widening `LINEAGE_ORDER_ON_CHARITABLE_WAQF` to every order reddens §9's "the refusal is
 * scoped"; and sentinelling that discriminator reddens §9's table and §2's scoping test here.
 * `resolver.ts` was restored byte-identically after every one (sha256 `f076e8f3…c41c`).
 */
import { describe, expect, it } from 'vitest';

import { isDomainError } from '../../errors.js';
import { runDistribution } from '../engine.js';
import type { DistributionInputRaw, DistributionResult, Minor, ShartRefusal } from '../contract.js';
import {
  BEN_001,
  BEN_002,
  BEN_003,
  BEN_006,
  beneficiary,
  exampleA,
  exampleDCharitable,
  patched,
} from './fixtures/worked-examples.js';

/** Example A's distributable, derived in the header. */
const DISTRIBUTABLE = 27_500_000n as Minor;

function mustRun(input: DistributionInputRaw): DistributionResult {
  return runDistribution(input);
}

/**
 * Assert the input is REFUSED, and refused for the stated reason.
 *
 * The discriminator is always asserted and a bare `SHART_INCOMPLETE` never is: twenty-six refusals
 * share that code, so a code-only assertion passes against whichever check happens to fire first —
 * which is exactly how a suite goes green for the wrong reason when a refusal moves earlier. R6-D1's
 * closure is a live example: it added a refusal that fires *before* two of the ones this file
 * already asserted, and only the discriminator made that visible instead of silently green.
 */
function expectRefused(
  input: DistributionInputRaw,
  refusal: ShartRefusal,
): { message: string; details: unknown } {
  try {
    runDistribution(input);
  } catch (error) {
    if (!isDomainError(error)) throw error;
    expect(error.code).toBe('SHART_INCOMPLETE');
    expect(error.details).toMatchObject({ refusal });
    // R7 · `details` is returned as well as the message: the narrowed refusals now carry
    // `reversionRecorded` and `unnamedJihaIds`, which are how an operator tells "no مآل clause at all"
    // from "a clause that does not name THIS charity" — two different deed defects with two different
    // repairs. A test that only matched the discriminator could not see which arm fired.
    return { message: error.message, details: error.details };
  }
  expect.unreachable(`the run must be refused with ${refusal}`);
  throw new Error('unreachable');
}

function statusesById(result: DistributionResult): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of result.lines) {
    out[line.beneficiaryId] = `${line.status}/${line.reasonCode ?? 'null'}:${String(
      line.entitledMinor,
    )}`;
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The cast — all invented, none from `archive/raw-intake/`
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The original S3-D1 escapee: a `FAMILY` member the engine cannot place — no ṭabaqa, so outside
 * the generational tree, and no lineage edge, so outside the family tree.
 */
const UNPLACEABLE_FAMILY = beneficiary({
  id: 'ben-r6-escape',
  kind: 'FAMILY',
  active: true,
  tabaqa: null,
  parentId: null,
  lineageLink: null,
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '12.5',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-01-15',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-R6ESC',
});

/** Example A's three, with every recorded ṭabaqa extinct — the "nobody left in the tiers" state. */
const EXTINCT_TIERS = [
  patched(BEN_001, { active: false }),
  patched(BEN_002, { active: false }),
  patched(BEN_003, { active: false }),
];

/**
 * A ṭabaqa-1 descendant of the waqif recorded as a **not-yet-identified** person — `CATEGORY_ONLY`
 * with a real lineage edge. `assertSingleWaqfNature`'s own comment calls family + placeholder
 * "a legitimate family waqf with an unnamed descendant"; the edge is required by R6.
 */
const PLACEHOLDER_T1 = beneficiary({
  id: 'ben-r6-p1',
  kind: 'CATEGORY_ONLY',
  active: false,
  tabaqa: 1,
  parentId: null,
  lineageLink: 'SON',
  line: 'ZUHUR',
  branch: 'Branch A',
  stipulatedWeight: '10',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-01-15',
  category: 'descendants of Branch A not yet enrolled',
  residency: 'DOMESTIC',
  disbursingEntity: null,
  bankingRefForProceeds: 'FAKE-IBAN-R6P1',
});

/** That placeholder's child — derived depth 2, declared ṭabaqa 2, the two agreeing. */
const PLACEHOLDER_T2 = patched(PLACEHOLDER_T1, {
  id: 'ben-r6-p2',
  tabaqa: 2,
  parentId: 'ben-r6-p1',
  bankingRefForProceeds: 'FAKE-IBAN-R6P2',
});

/** A licensed, KYC-fresh charitable jiha with deed weight 10 — untiered, as every jiha must be. */
const JIHA = patched(BEN_006, {
  id: 'ben-r6-jiha',
  stipulatedWeight: '10',
  bankingRefForProceeds: 'FAKE-IBAN-R6J',
});

function orderedFamily(beneficiaries: readonly unknown[]): DistributionInputRaw {
  // ⚠ `exampleA()` carries `reversion: null`, and **every verdict in §1 and §2 depends on it.** R7
  // (product owner, 2026-08-10) makes a ذري deed's charitable jiha legal WHEN the deed names it as the
  // endowment's ultimate taker (مآل الوقف), so a cohort that is refused here would resolve with a clause
  // added. Each route below states that dependence rather than inheriting it silently, and the R7
  // siblings at the end of each section drive the clause-present half.
  return { ...exampleA(), beneficiaries } as DistributionInputRaw;
}

/** **R7** · a مآل clause naming these ids as the endowment's ultimate taker(s). */
function maal(...ultimateTakerIds: readonly string[]): DistributionInputRaw['reversion'] {
  return { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: [...ultimateTakerIds] };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · S3-D1 on the ORDERED path — the original attack, and every route around it
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('1 · S3-D1 · the FAMILY/CATEGORY_ONLY escape is shut on every order', () => {
  /**
   * The original attack, verbatim. BEFORE R6, MEASURED: `ben-r6-escape` was PAID
   * 27,500,000 of 27,500,000 halalas on Example A — and 78,000,000 of 78,000,000 on the waqf-005
   * money the product owner was shown — with **no flag raised**, while the run reported invariant
   * I5 in `invariantsChecked`.
   */
  it('the original attack — ORDERED, every ṭabaqa extinct, an unplaceable FAMILY member — is REFUSED', () => {
    const refusal = expectRefused(
      orderedFamily([...EXTINCT_TIERS, UNPLACEABLE_FAMILY]),
      'LINEAGE_LINK_MISSING',
    );
    // A refusal nobody can act on is half a refusal: four beneficiaries are recorded here and the
    // Nazir has to find the one deed entry to repair.
    expect(refusal.message).toContain('ben-r6-escape');
  });

  it('route · CATEGORY_ONLY instead of FAMILY is refused the same way', () => {
    expectRefused(
      orderedFamily([...EXTINCT_TIERS, patched(UNPLACEABLE_FAMILY, { kind: 'CATEGORY_ONLY' })]),
      'LINEAGE_LINK_MISSING',
    );
  });

  it('route · a CHARITABLE_JIHA standing beside FAMILY members is refused at Stage 0', () => {
    // Not `LINEAGE_LINK_MISSING`: `assertSingleWaqfNature` runs before `buildLineage`, and the
    // discriminator is asserted precisely so this test cannot be read as proving pass 4.
    //
    // ⚠ **AND ONLY BECAUSE `reversion` IS NULL (R7).** Stated explicitly, because after 2026-08-10 this
    // verdict is conditional: the deed records no مآل clause, so there is no reading on which this
    // charity is the endowment's ultimate taker, and R7-c forbids inferring one from its presence.
    const refusal = expectRefused(
      { ...orderedFamily([...EXTINCT_TIERS, JIHA]), reversion: null },
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );
    expect(refusal.details).toMatchObject({
      reversionRecorded: false,
      unnamedJihaIds: ['ben-r6-jiha'],
    });
  });

  /**
   * ⚠ **R7 · THE SIBLING THAT PROVES THE NARROWING DID NOT WIDEN.** `COHORT_MIXES_CHARITABLE_AND_FAMILY`
   * gained exactly one exemption clause — a ذري deed, a legible مآل, and **every** jiha in the cohort
   * named in it — and the risk of any narrowing is that it takes more than it was meant to. Three
   * variants of one cohort, one field apart, so the boundary is asserted rather than described.
   */
  it('R7 · the same cohort resolves with a مآل naming that jiha, and still refuses otherwise', () => {
    const cohort = [...EXTINCT_TIERS, JIHA];

    // (a) named ⇒ RESOLVES, and the reversion has TRIGGERED, because every recorded descendant in
    //     `EXTINCT_TIERS` is inactive. By hand: one entitled taker at weight 10 over Σ 10 ⇒
    //     27,500,000 × 10/10 = 27,500,000 halalas, residual 0.
    const resolved = mustRun({ ...orderedFamily(cohort), reversion: maal('ben-r6-jiha') });
    expect(statusesById(resolved)).toStrictEqual({
      'ben-001': 'EXCLUDED/TABAQA_EXTINCT:0',
      'ben-002': 'EXCLUDED/TABAQA_EXTINCT:0',
      'ben-003': 'EXCLUDED/TABAQA_EXTINCT:0',
      'ben-r6-jiha': 'PAID/null:27500000',
    });
    expect(resolved.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    // ⚠ Its BR-505 basis names the reversion, not the generational rule — the mis-statement ADR-0009
    // records as a defect would be a charity told it was ranked among a family's ṭabaqāt.
    expect(resolved.lines.find((line) => line.beneficiaryId === 'ben-r6-jiha')?.basis.rule).toBe(
      'ULTIMATE_TAKER_MAAL_AL_WAQF',
    );

    // (b) a clause naming a DIFFERENT charity ⇒ still refused, and the message names the unnamed id.
    const other = patched(JIHA, { id: 'ben-r6-jiha-b', bankingRefForProceeds: 'FAKE-IBAN-R6JB' });
    const wrong = expectRefused(
      { ...orderedFamily([...cohort, other]), reversion: maal('ben-r6-jiha-b') },
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );
    expect(wrong.details).toMatchObject({
      reversionRecorded: true,
      unnamedJihaIds: ['ben-r6-jiha'],
    });

    // (c) ⚠ THE ONE THAT MATTERS MOST — a LIVING descendant beside the named taker. The clause is
    //     valid, so nothing refuses; the charity is nonetheless paid ZERO, because a recorded taker is
    //     EXCLUDED until the bloodline is over. MEASURED before amendment D on this cohort shape: the
    //     charity took 13,750,000 of 27,500,000 and halved the living descendant. R7 prices it at
    //     nothing rather than merely refusing it — a guarantee that survives the refusal being relaxed.
    const living = mustRun({
      ...orderedFamily([patched(BEN_001, { active: true, stipulatedWeight: '10' }), JIHA]),
      reversion: maal('ben-r6-jiha'),
    });
    expect(statusesById(living)).toStrictEqual({
      // 27,500,000 × 10/10 = 27,500,000 to the sole living ṭabaqa-1 descendant, residual 0.
      'ben-001': 'PAID/null:27500000',
      'ben-r6-jiha': 'EXCLUDED/REVERSION_PENDING_LIVING_BLOODLINE:0',
    });
    expect(living.flags).not.toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');
    // I-R1's mirror is asserted on this run and is what guarantees the ZERO independently of the ladder.
    expect(living.invariantsChecked).toContain('I-R1');
  });

  it('route · a lineage link WITHOUT a ṭabaqa is refused from the other side', () => {
    // The complementary half of the closure: with the link the member IS in the graph, derived
    // depth 1, and `tabaqa: null` contradicts it. So there is no value of `lineageLink` that
    // leaves a FAMILY member untiered.
    expectRefused(
      orderedFamily([...EXTINCT_TIERS, patched(UNPLACEABLE_FAMILY, { lineageLink: 'SON' })]),
      'TABAQA_MISMATCHES_LINEAGE_DEPTH',
    );
  });

  it('route · a legal parent CHAIN with a null ṭabaqa is refused too', () => {
    expectRefused(
      orderedFamily([
        ...EXTINCT_TIERS,
        patched(UNPLACEABLE_FAMILY, { lineageLink: 'SON', parentId: 'ben-001' }),
      ]),
      'TABAQA_MISMATCHES_LINEAGE_DEPTH',
    );
  });

  it('route · SHARED (tashrik) instead of ORDERED is refused — R6 is not order-specific', () => {
    expectRefused(
      { ...orderedFamily([...EXTINCT_TIERS, UNPLACEABLE_FAMILY]), entitlementOrder: 'SHARED' },
      'LINEAGE_LINK_MISSING',
    );
  });

  it('route · a cohort in which EVERY member is unplaceable halts on the first by id', () => {
    expectRefused(
      orderedFamily([
        patched(UNPLACEABLE_FAMILY, { id: 'ben-r6-x1', bankingRefForProceeds: 'FAKE-X1' }),
        patched(UNPLACEABLE_FAMILY, { id: 'ben-r6-x2', bankingRefForProceeds: 'FAKE-X2' }),
      ]),
      'LINEAGE_LINK_MISSING',
    );
  });

  it('route · NA_DIRECT_USE short-circuits before R6’s edge requirement — but pays nobody', () => {
    // I7: a direct-use waqf resolves no cohort at all, so the unplaceable member is NOT refused. That
    // is not a hole: no monetary line is emitted and the whole distributable is retained. Pinned
    // because "no refusal" is otherwise read as "accepted".
    //
    // ⚠ **CORRECTED (memo Q7, product owner 2026-08-17).** This comment used to say *"so `buildLineage`
    // is never reached"* — false now. `buildLineage` IS reached on a direct-use run, above the
    // short-circuit, and every one of its contradiction refusals fires there (see
    // `q7-validity-precedence.test.ts`). What the short-circuit still outranks is pass 4 alone,
    // `LINEAGE_LINK_MISSING`, which is R6's edge requirement and a COMPLETENESS check — its own stated
    // reason is that the engine will not pay someone it cannot place, and this run pays nobody. The
    // test's subject is unchanged; the mechanism named in its title and comment was wrong.
    const result = mustRun({
      ...orderedFamily([...EXTINCT_TIERS, UNPLACEABLE_FAMILY]),
      entitlementOrder: 'NA_DIRECT_USE',
    });
    expect(result.lines).toStrictEqual([]);
    expect(result.totals.paidMinor).toBe(0n as Minor);
    expect(result.totals.retainedMinor).toBe(DISTRIBUTABLE);
  });

  it('control · the SAME cohort with the edge recorded still computes — R6 refuses a gap, not a deed', () => {
    // Without this, every test above would also pass against an engine that refused Example A
    // outright. ṭabaqa 1 lives (ben-001, ben-003 at weight 12.5 each), ṭabaqa 2 waits.
    // By hand: 27,500,000 × 12.5/25 = 13,750,000 each, Σ 27,500,000, residual 0.
    const result = mustRun(orderedFamily([BEN_001, BEN_002, BEN_003]));
    expect(statusesById(result)).toStrictEqual({
      'ben-001': 'PAID/null:13750000',
      'ben-002': 'EXCLUDED/UPPER_TABAQA_EXTANT:0',
      // Withheld by the KYC gate — the entitlement is untouched, which is I6's whole content.
      'ben-003': 'WITHHELD/KYC_UNVERIFIED:13750000',
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · R6-D1 — CLOSED. Every input below PAID a charity a family's ghallah; all are now refused.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('2 · R6-D1 · CLOSED — an untiered jiha on a family waqf is REFUSED, not paid', () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * R6-D1 · ATTACK SUCCEEDED, THEN CLOSED. Severity: HIGH. Fixed 2026-08-03 in `resolver.ts`.
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * **Every input in this block is preserved VERBATIM from the run that paid the money.** That is
   * the whole value of the block: these are not illustrations of a refusal, they are the exact
   * cohorts that once produced a payout, kept so that undoing the fix cannot go unnoticed. The
   * measured old figure is recorded on each test.
   *
   * The cohort: a `FAMILY_DHURRI` (ذري) waqf under `ORDERED` whose recorded descendants are
   * `CATEGORY_ONLY` placeholders carrying real lineage edges (ṭabaqa 1 → ṭabaqa 2), plus one
   * `CHARITABLE_JIHA`. Nothing refused it — `assertSingleWaqfNature` counted only `kind === 'FAMILY'`
   * as a family leg — and `orderedExclusionReason` skips the tier test for anyone with a null
   * ṭabaqa, which after R6 only a jiha can be.
   *
   * That was the S3-D1 payload with one field changed. R6's stated principle — *"nobody the engine
   * cannot place in the family tree may ever be paid"* — could not simply be extended to jihas,
   * because a jiha is legitimately outside the tree and must be payable on a خيري waqf. The narrower
   * question R6 did not reach — *may a charity sit in a ذري cohort at all?* — is what
   * `CHARITABLE_JIHA_ON_FAMILY_WAQF` answers, on the **declared type**: no.
   */
  const COHORT = [PLACEHOLDER_T1, PLACEHOLDER_T2, JIHA];

  /**
   * ⚠ **MEASURED BEFORE THE FIX** on this exact input: the jiha was
   * **`PAID/null:27500000` of 27,500,000 halalas** (SAR 275,000.00 — the whole distributable),
   * `ben-r6-p1` and `ben-r6-p2` both `EXCLUDED/TABAQA_EXTINCT:0`, `result.waqfType` reported
   * `FAMILY_DHURRI`, and `result.flags` was `['UNVERIFIED_FIGURES_APPLIED']` — i.e. the ʿushr caveat
   * alone, with **nothing** on the run saying an ancestral waqf had paid its entire ghallah to a
   * charity. The run also reported invariant **I5** as checked (§3).
   *
   * By hand, the arithmetic that produced it: both placeholders inactive ⇒ no living ṭabaqa ⇒ every
   * tiered member `TABAQA_EXTINCT`; the jiha untiered, active, weight 10 ≠ 0 ⇒ the sole entitled
   * head ⇒ 27,500,000 × 10/10 = 27,500,000, residual 0.
   */
  it('INVERTED · the cohort that paid a charity 27,500,000 of 27,500,000 is REFUSED', () => {
    const refusal = expectRefused(orderedFamily(COHORT), 'CHARITABLE_JIHA_ON_FAMILY_WAQF');

    // The refusal must explain itself in the domain's own terms, as the JOINT refusal does: a Nazir
    // reading it has to be told a waqf is either خيري or ذري and never both.
    expect(refusal.message).toContain('خيري');
    expect(refusal.message).toContain('ذري');
    expect(refusal.message).toContain('FAMILY_DHURRI');
  });

  it('INVERTED · and it names the counts that made R6-D1 invisible to its two neighbours', () => {
    // This is the evidence that the new refusal is not a duplicate of an existing one. On THIS
    // cohort `COHORT_MIXES_CHARITABLE_AND_FAMILY` cannot fire (familyCount 0 — the descendants are
    // placeholders) and `LINEAGE_ORDER_ON_CHARITABLE_WAQF` cannot fire (the order is ORDERED). The
    // details carry all three counts so an operator can see exactly that.
    try {
      mustRun(orderedFamily(COHORT));
      expect.unreachable('the R6-D1 cohort must be refused');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.details).toMatchObject({
        refusal: 'CHARITABLE_JIHA_ON_FAMILY_WAQF',
        waqfType: 'FAMILY_DHURRI',
        entitlementOrder: 'ORDERED',
        charitableJihaCount: 1,
        familyCount: 0,
        categoryOnlyCount: 2,
      });
    }
  });

  /**
   * ⚠ **MEASURED BEFORE THE FIX**: with ṭabaqa 1 alive the entitled tier was 1, so the placeholder
   * (weight 10) and the jiha (weight 10) split it — 27,500,000 × 10/20 = **13,750,000 each**, so a
   * **LIVING ṭabaqa-1 descendant of the waqif lost 13,750,000 halalas (SAR 137,500.00) in a single
   * period** to a charity recorded on their family's deed (27,500,000 − 13,750,000).
   */
  it('INVERTED · the LIVING-descendant variant that diverted 13,750,000 is REFUSED too', () => {
    expectRefused(
      orderedFamily([patched(PLACEHOLDER_T1, { active: true }), PLACEHOLDER_T2, JIHA]),
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );

    // ⚠ THE LOAD-BEARING HALF. The identical family register WITHOUT the jiha still computes, and
    // the living descendant now takes the whole distributable — which is what the closure restored,
    // and the 13,750,000 the defect diverted. If the fix had been written as "refuse family waqfs
    // with placeholders", this control would be red and the refusal would be a denial of service.
    // By hand: one entitled head, weight 10 ⇒ 27,500,000 × 10/10 = 27,500,000, residual 0.
    const control = mustRun(
      orderedFamily([patched(PLACEHOLDER_T1, { active: true }), PLACEHOLDER_T2]),
    );
    expect(statusesById(control)).toStrictEqual({
      'ben-r6-p1': 'PAID/null:27500000',
      'ben-r6-p2': 'EXCLUDED/UPPER_TABAQA_EXTANT:0',
    });
    // Stated as the recovered amount rather than as a bare total: 27,500,000 − 13,750,000.
    const restored = control.lines.find((line) => line.beneficiaryId === 'ben-r6-p1');
    expect(restored?.entitledMinor).toBe(13_750_000n + 13_750_000n);
  });

  it('PROOF · the placeholders really ARE in the waqif’s family tree — so the cohort was mixed', () => {
    // The mechanism claim, still driven. It is what makes the refused cohort a mixed one in
    // SUBSTANCE and not merely by declared type: `buildLineage` certifies these two as descendants
    // at derived depths 1 and 2. It is now read off the jiha-free control, because the mixed cohort
    // is refused at Stage 0 before `buildLineage` runs at all — which is itself the point: the
    // refusal is earlier than the graph, so no family tree has to be built to reject a charity.
    const result = mustRun(
      orderedFamily([patched(PLACEHOLDER_T1, { active: true }), PLACEHOLDER_T2]),
    );
    const depths = Object.fromEntries(
      result.lines.map((line) => [line.beneficiaryId, line.basis.lineageDepth]),
    );
    expect(depths).toStrictEqual({ 'ben-r6-p1': 1, 'ben-r6-p2': 2 });
    // …and the jiha, added back, is refused rather than given a depth of its own.
    expectRefused(orderedFamily(COHORT), 'CHARITABLE_JIHA_ON_FAMILY_WAQF');
  });

  /**
   * ⚠ **MEASURED BEFORE THE FIX** under `SHARED` (tashrik): the same 27,500,000 to
   * `ben-r6-jiha`, reached by a different route — tashrik runs no tier test at all, so the
   * placeholders were `EXCLUDED/BENEFICIARY_INACTIVE:0` on their own vital status and the jiha was
   * again the sole entitled head (27,500,000 × 10/10).
   */
  it('INVERTED · SHARED reached the same payout by another exclusion — also REFUSED', () => {
    expectRefused(
      { ...orderedFamily(COHORT), entitlementOrder: 'SHARED' },
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );
  });

  /**
   * ⚠ **MEASURED BEFORE THE FIX**: a jiha ALONE on a `FAMILY_DHURRI` waqf under `ORDERED` ran to
   * completion and was `PAID/null:27500000` — 100% of an ancestral waqf's ghallah to a charity, the
   * simplest form of the disagreement. `LINEAGE_ORDER_ON_CHARITABLE_WAQF` already refused the same
   * cohort under `LINEAGE_CONTINUATION`; under `ORDERED` no equivalent refusal existed.
   */
  it('INVERTED · a jiha ALONE on a FAMILY_DHURRI waqf is REFUSED under ORDERED', () => {
    expectRefused(orderedFamily([JIHA]), 'CHARITABLE_JIHA_ON_FAMILY_WAQF');
  });

  it('the refusal is unconditional on the ORDER — all four, including the direct-use path', () => {
    // Coverage, deliberately, because the lesson R6-D1 taught is that a check nobody drives through
    // every reachable configuration reports its silence as success. `NA_DIRECT_USE` is the one that
    // matters most: I7's short-circuit normally outranks everything downstream of it, so a refusal
    // placed after it would leave a direct-use ذري waqf carrying a charity un-refused. It is placed
    // BEFORE, exactly as WAQF_TYPE_JOINT_NOT_SUPPORTED is.
    for (const entitlementOrder of [
      'ORDERED',
      'SHARED',
      'LINEAGE_CONTINUATION',
      'NA_DIRECT_USE',
    ] as const) {
      expectRefused(
        { ...orderedFamily([JIHA]), entitlementOrder },
        'CHARITABLE_JIHA_ON_FAMILY_WAQF',
      );
    }
  });

  it('and it is scoped to the DECLARED TYPE — the same jiha on a خيري waqf still computes', () => {
    // Without this the refusal above could be "a jiha is never paid", which would be a different and
    // wrong rule. By hand: sole entitled head, weight 10 ⇒ 27,500,000 × 10/10 = 27,500,000.
    const charitable = mustRun({ ...orderedFamily([JIHA]), waqfType: 'PUBLIC_CHARITABLE' });
    expect(statusesById(charitable)).toStrictEqual({ 'ben-r6-jiha': 'PAID/null:27500000' });

    // …and on that legal charitable waqf the OTHER refusal is still the operative one under a
    // lineage order — proving the two are distinct checks rather than one renamed. Re-pointed to
    // PUBLIC_CHARITABLE because on FAMILY_DHURRI the new refusal now fires first (asserted above),
    // so keeping the old cohort here would have proved the new check twice and this one never.
    expectRefused(
      {
        ...orderedFamily([JIHA]),
        waqfType: 'PUBLIC_CHARITABLE',
        entitlementOrder: 'LINEAGE_CONTINUATION',
        continuationStipulation: 'ZUHUR_ONLY',
      },
      'LINEAGE_ORDER_ON_CHARITABLE_WAQF',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · `invariantsChecked` honesty — is I5 still genuinely asserted on an ORDERED run?
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('3 · I5 · reported as checked, and what its claim now does and does not cover', () => {
  /**
   * The S3-D1 defect had a second half: every escaping run still reported **I5** in
   * `invariantsChecked`, because `invariants.assertOrderedExclusion` `continue`s on any line whose
   * beneficiary has a null `tabaqa`. R6 narrowed the exposure without removing it — after R6 only a
   * `CHARITABLE_JIHA` can be untiered, so on a purely family cohort I5's claim covers every line.
   *
   * ⚠ **R6-D1's closure narrows it once more, and the distinction matters.** `invariants.ts` is
   * UNCHANGED: I5's exemption for an untiered line is exactly as wide as it was, and a run holding a
   * jiha still reports I5 while making no claim about that jiha's line. What changed is *where such
   * a run can occur* — no longer on a `FAMILY_DHURRI` waqf, because that cohort is now refused
   * before any invariant is reported at all. So the honesty gap is not repaired, it is confined to
   * the خيري waqf where the exemption is correct. Both halves are driven below.
   */
  it('on a purely family ORDERED cohort, I5 is reported AND covers every line', () => {
    const result = mustRun(orderedFamily([BEN_001, BEN_002, BEN_003]));
    expect(result.invariantsChecked).toContain('I5');
    // The load-bearing half: no line escapes the tier claim, because none can be untiered.
    for (const line of result.lines) expect(line.basis.tabaqa).not.toBeNull();
  });

  /**
   * ⚠ **MEASURED BEFORE THE FIX** on this exact cohort: `invariantsChecked` contained **I5**, the
   * only `PAID` line was `ben-r6-jiha` (27,500,000 of 27,500,000), and that line's `basis.tabaqa`
   * was `null` — so `assertOrderedExclusion` skipped it and I5 made no claim whatever about the one
   * line that received a halala, on a run that reported I5 as checked.
   */
  it('INVERTED · the R6-D1 cohort no longer reports I5, because it no longer runs', () => {
    expectRefused(
      orderedFamily([PLACEHOLDER_T1, PLACEHOLDER_T2, JIHA]),
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );
  });

  it('⚠ SURVIVES · I5’s claim still stops short of an untiered PAID line, on the خيري waqf', () => {
    // The finding itself is NOT fixed and must not be read as fixed: `invariants.ts` was not
    // touched. Re-pointed onto the waqf type where an untiered paid line is legitimate, so the gap
    // in I5's claim is still measured rather than quietly retired with the cohort that exposed it.
    // By hand: sole entitled head, weight 10 ⇒ 27,500,000 × 10/10 = 27,500,000.
    const result = mustRun({ ...orderedFamily([JIHA]), waqfType: 'PUBLIC_CHARITABLE' });
    expect(result.invariantsChecked).toContain('I5');
    const paid = result.lines.filter((line) => line.status === 'PAID');
    expect(paid.map((line) => line.beneficiaryId)).toStrictEqual(['ben-r6-jiha']);
    expect(paid[0]?.entitledMinor).toBe(DISTRIBUTABLE);
    // Untiered ⇒ `assertOrderedExclusion` skips it ⇒ I5 is reported over a line it says nothing
    // about. Harmless here (a jiha on a خيري waqf SHOULD never be tier-excluded); it was not
    // harmless on the ancestral waqf, and the refusal is what removed that case.
    expect(paid[0]?.basis.tabaqa).toBeNull();
  });

  it('I5’s untiered EXEMPTION itself is unchanged and still driven — a jiha walks through it', () => {
    // The exemption is correct where it belongs: on a PUBLIC_CHARITABLE waqf a jiha must never be
    // tier-excluded. Driven so this file cannot be read as proposing to delete it.
    const result = mustRun({ ...exampleDCharitable(), entitlementOrder: 'ORDERED' });
    expect(result.invariantsChecked).toContain('I5');
    for (const line of result.lines) {
      expect(line.reasonCode).not.toBe('TABAQA_EXTINCT');
      expect(line.reasonCode).not.toBe('UPPER_TABAQA_EXTANT');
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · did the R6 fixture sweep gut the ORDERED tier structure?
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('4 · the ORDERED tier structure survived the fixture sweep', () => {
  /**
   * The cheap way to make every R6 failure green was a blanket `parentId: null, lineageLink: 'SON'`
   * over every record — which would make every member a child of the waqif, flatten every cohort to
   * ṭabaqa 1, and leave the ORDERED suites proving nothing about al-aʿlā fa-l-aʿlā. These tests
   * check the shipped fixtures against that, from the outside.
   */
  it('waqf-001 is a real two-generation tree, not a flat set of waqif children', () => {
    const result = mustRun(orderedFamily([BEN_001, BEN_002, BEN_003]));
    const depths = result.lines.map((line) => line.basis.lineageDepth);
    expect(depths).toStrictEqual([1, 2, 1]);
    // …and the ṭabaqa the run reports is the DERIVED depth, not the declared field echoed back.
    expect(result.lines.map((line) => line.basis.tabaqa)).toStrictEqual([1, 2, 1]);
  });

  it('the tier exclusion — not a gate, not a weight — is what decides the ORDERED outcome', () => {
    // ben-002 is active, VERIFIED, KYC-fresh and carries a non-zero deed weight: the ONLY reason it
    // receives nothing is that its parent's generation still lives. Killing that generation moves
    // the money to it, which no gate or weight change could do.
    const upperLives = mustRun(orderedFamily([BEN_001, BEN_002, BEN_003]));
    expect(statusesById(upperLives)['ben-002']).toBe('EXCLUDED/UPPER_TABAQA_EXTANT:0');

    // ṭabaqa 1 both dead ⇒ entitled tier becomes 2 ⇒ ben-002 is the sole entitled head.
    // By hand: 27,500,000 × 12.5/12.5 = 27,500,000, residual 0.
    const upperExtinct = mustRun(
      orderedFamily([
        patched(BEN_001, { active: false }),
        BEN_002,
        patched(BEN_003, { active: false }),
      ]),
    );
    expect(statusesById(upperExtinct)).toStrictEqual({
      'ben-001': 'EXCLUDED/TABAQA_EXTINCT:0',
      'ben-002': 'PAID/null:27500000',
      'ben-003': 'EXCLUDED/TABAQA_EXTINCT:0',
    });
  });

  it('a three-generation chain still tiers correctly end to end', () => {
    // An invented 3-chain built here rather than patched from a fixture, so this claim does not
    // depend on any other suite's cohort surviving unchanged.
    const g1 = patched(PLACEHOLDER_T1, {
      id: 'ben-r6-g1',
      kind: 'FAMILY',
      category: null,
      active: false,
      stipulatedWeight: '12.5',
    });
    const g2 = patched(g1, {
      id: 'ben-r6-g2',
      tabaqa: 2,
      parentId: 'ben-r6-g1',
      active: true,
      bankingRefForProceeds: 'FAKE-G2',
    });
    const g3 = patched(g1, {
      id: 'ben-r6-g3',
      tabaqa: 3,
      parentId: 'ben-r6-g2',
      active: true,
      bankingRefForProceeds: 'FAKE-G3',
    });
    // Lowest living ṭabaqa is 2 ⇒ g1 EXTINCT below it, g3 waits above it, g2 takes the pool whole.
    expect(statusesById(mustRun(orderedFamily([g1, g2, g3])))).toStrictEqual({
      'ben-r6-g1': 'EXCLUDED/TABAQA_EXTINCT:0',
      'ben-r6-g2': 'PAID/null:27500000',
      'ben-r6-g3': 'EXCLUDED/UPPER_TABAQA_EXTANT:0',
    });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · ✓ R6-F1 — CLOSED. The charitable waqf's unnamed segment is representable again.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('5 · ✓ R6-F1 · a charitable waqf’s unnamed segment is representable again', () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * R6-F1 · **A REGRESSION R6 INTRODUCED, WIDENED BY ESC-1 — NOW CLOSED IN `buildLineage` PASS 4.**
   *          Severity was raised MEDIUM → HIGH before the correction.
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   *
   * ── MEASURED BEFORE THE CORRECTION, kept verbatim as the record of the deadlock ──────────────
   * Pass 4 covered `CATEGORY_ONLY` as well as `FAMILY`, on every order, whatever the waqf's type. So
   * on a `PUBLIC_CHARITABLE` (وقف خيري) waqf — whose beneficiaries are segments the waqif chose and
   * not descendants of anyone — a not-yet-identified segment ("the poor of the district") could not
   * be recorded at all:
   *
   *     no edge  ⇒ LINEAGE_LINK_MISSING          (R6, buildLineage pass 4)
   *     an edge  ⇒ DESCENDANT_ON_CHARITABLE_WAQF (ESC-1, assertSingleWaqfNature)
   *
   * Both tests below asserted a refusal, and the second one asserted that the *other* value of the
   * same field was refused too — the squeeze, closed in one place. The engine stated the
   * contradiction itself, one function away: `assertSingleWaqfNature` refuses a *lineage order* on
   * such a waqf precisely because "a charitable waqf has no descendants", while the refusal pass 4
   * raised read "entitlement in a family waqf is decided by descent from the waqif" — about a waqf
   * that is not one.
   *
   * ── ✓ WHAT CLOSED IT ────────────────────────────────────────────────────────────────────────
   * Pass 4's `CATEGORY_ONLY` arm is now scoped to a `FAMILY_DHURRI` waqf. R6's rationale in the
   * owner's own frame is *"eligibility comes from descent, so the descent must be recorded"* — and on
   * a charitable waqf eligibility does **not** come from descent, so there is no descent to record and
   * demanding one forced a fiction. A `FAMILY` member is still refused on every waqf type, because a
   * bloodline member is a claim of descent whatever the deed is typed. It is a narrowing of
   * engineering's extension of the owner's rule, not a change to the owner's rule.
   *
   * ⚠ **The two tests are INVERTED, not deleted, and both inputs are verbatim.** The first now
   * computes; the second still refuses the fiction and only its *second half* is inverted, which is
   * the precise shape of the fix: one of the two recordings is now accepted, and it is the honest one.
   *
   * ⚠ **NOT resolved by this**: whether a `CATEGORY_ONLY` member carrying a lineage edge *is* a
   * family leg remains an open fiqh/product question (binding rule 4), and the `TODO(surface)` on
   * both R6's placeholder arm and ESC-1 stands. What is gone is the state in which the record had no
   * legal form at all.
   */
  const CHARITABLE_PLACEHOLDER = beneficiary({
    id: 'ben-r6-seg',
    kind: 'CATEGORY_ONLY',
    active: true,
    tabaqa: null,
    parentId: null,
    lineageLink: null,
    line: 'NA',
    branch: 'Charitable',
    stipulatedWeight: '50',
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: '2026-01-15',
    category: 'orphans of the district, not yet enrolled',
    residency: 'DOMESTIC',
    disbursingEntity: null,
    bankingRefForProceeds: 'FAKE-IBAN-R6SEG',
  });

  /**
   * ⚠⚠ **INVERTED. Input verbatim; the assertion is now the computation.**
   *
   * MEASURED BEFORE THE CORRECTION, on this exact input: `SHART_INCOMPLETE` /
   * `LINEAGE_LINK_MISSING`, and the refusal's own message was the evidence of the over-reach — it
   * told a **charitable** waqf that *"entitlement in a family waqf is decided by descent from the
   * waqif"*. The old assertion was `expect(refusal.message).toContain('family waqf')`.
   *
   * THE ARITHMETIC, by hand, in halalas. Example A's distributable is 27,500,000 (header). Neither
   * member is in the lineage graph, so neither is tiered and `lowestLivingTabaqa` is `null`:
   * `orderedExclusionReason` skips the tier test entirely, both are active, and both carry a non-zero
   * deed weight. `ORDERED` applies deed weights (R3 exempts only a lineage cohort). Weights 50 and 10,
   * Σ 60:
   *
   *     ben-r6-seg :  27,500,000 × 50 / 60 = 22,916,666.66…  ⇒ floor 22,916,666, remainder .66…
   *     ben-r6-jiha:  27,500,000 × 10 / 60 =  4,583,333.33…  ⇒ floor  4,583,333, remainder .33…
   *     Σ floors 27,499,999 ⇒ residual 1 halala to the LARGEST remainder (.66… beats .33…)
   *     ⇒ ben-r6-seg 22,916,667 · ben-r6-jiha 4,583,333, Σ 27,500,000
   *
   * ⚠ These are the SAME two figures the second test recorded as measured under the *fictional* edge.
   * That is the finding in one line: the money was never the problem — the record was. The engine now
   * reaches the identical allocation without anyone writing a descent that does not exist.
   */
  it('RESOLVES a charitable waqf’s unnamed segment — no descent recorded, and none demanded', () => {
    const result = mustRun({
      ...orderedFamily([CHARITABLE_PLACEHOLDER, JIHA]),
      waqfType: 'PUBLIC_CHARITABLE',
    });

    expect(statusesById(result)).toStrictEqual({
      'ben-r6-seg': 'PAID/null:22916667',
      'ben-r6-jiha': 'PAID/null:4583333',
    });
    expect(result.totals.paidMinor).toBe(DISTRIBUTABLE);

    // ⚠ THE POINT OF THE CORRECTION, on the published basis (BR-505): the segment is recorded as what
    // it is — unplaced — rather than as a child of the waqif. Nothing on the statement claims a
    // descent, which is exactly what the fictional edge used to print as fact.
    const segment = result.lines.find((line) => line.beneficiaryId === 'ben-r6-seg');
    expect(segment?.basis.lineageDepth).toBeNull();
    expect(segment?.basis.lineageLink).toBeNull();
    expect(segment?.basis.parentId).toBeNull();
    expect(segment?.basis.kind).toBe('CATEGORY_ONLY');
  });

  /**
   * ⚠⚠ **BR-206's `CATEGORY_NOT_CAPTURED` GATE HAS A REACHABLE SUBJECT AGAIN — this is the test that
   * says why the correction matters beyond one refusal moving.**
   *
   * The gate exists for exactly one shape: a `CATEGORY_ONLY` placeholder whose category is still
   * blank, on a waqf whose beneficiaries are a segment rather than named people. While the record
   * itself was refused, that shape could not be constructed on a وقف خيري at all — the gate's own
   * subject was unrepresentable, so a green gate suite proved nothing about the case BR-206 names.
   *
   * Both directions are driven, because a gate that blocks everything is as useless as one that
   * blocks nothing:
   *   · category captured  ⇒ PAID (the test above)
   *   · category blank     ⇒ WITHHELD / CATEGORY_NOT_CAPTURED, **entitlement unchanged**
   *
   * The unchanged entitlement is invariant I6, not a detail: a gate stamps a status and never moves an
   * amount, so the withheld 22,916,667 is still that beneficiary's ghallah and is still out of every
   * other line's denominator. Whitespace counts as blank (`isCategoryUncaptured` trims), and that arm
   * is driven too — a guard a single typed space unlocks is a guard an operator bypasses under
   * deadline pressure.
   */
  it('BR-206 · the category-capture gate is reachable on a خيري waqf, and blocks without moving money', () => {
    for (const blank of [null, '', '   ']) {
      const result = mustRun({
        ...orderedFamily([patched(CHARITABLE_PLACEHOLDER, { category: blank }), JIHA]),
        waqfType: 'PUBLIC_CHARITABLE',
      });
      // Identical halalas to the captured case — the gate did not redistribute a thing.
      expect(statusesById(result), `category ${JSON.stringify(blank)}`).toStrictEqual({
        'ben-r6-seg': 'WITHHELD/CATEGORY_NOT_CAPTURED:22916667',
        'ben-r6-jiha': 'PAID/null:4583333',
      });
      // I3 with the restated `retainedMinor`: withheld ghallah is reported, never quietly absorbed.
      expect((result.totals.paidMinor as bigint) + (result.totals.withheldMinor as bigint)).toBe(
        DISTRIBUTABLE as bigint,
      );
    }
  });

  /**
   * ⚠⚠ **HALF-INVERTED, AND WHICH HALF IS THE WHOLE FINDING.**
   *
   * ── THE FIRST HALF IS UNCHANGED AND MUST STAY UNCHANGED ─────────────────────────────────────
   * Before ESC-1, this test asserted the escape hatch R6-F1 left open: give the segment a fictional
   * `SON` edge and the run COMPUTED. MEASURED then, on the exact input kept verbatim below —
   * placeholder weight 50, jiha weight 10, distributable 27,500,000:
   *
   *     27,500,000 × 50/60 = 22,916,666.67 ⇒ floor 22,916,666
   *     27,500,000 × 10/60 =  4,583,333.33 ⇒ floor  4,583,333
   *     Σ floors 27,499,999, residual 1 halala to the LARGEST remainder (.666… beats .333…)
   *     ⇒ ben-r6-seg PAID 22,916,667 · ben-r6-jiha PAID 4,583,333
   *
   * …with the invented edge published as fact on the beneficiary's own basis (`lineageDepth: 1`,
   * `lineageLink: 'SON'`) and therefore on the Arabic statement that basis prints (BR-505). Nothing
   * on the result distinguished it from a real descent. `DESCENDANT_ON_CHARITABLE_WAQF` (ESC-1)
   * refuses that, and **still does** — a lineage edge on a خيري waqf makes the endowment both خيري
   * and ذري, and the correction to R6 did not touch that rule.
   *
   * ── ⚠ THE SECOND HALF IS INVERTED: THE SQUEEZE IS GONE ──────────────────────────────────────
   * The old closing assertion was that the OTHER value of the same field was refused too:
   * `expectRefused(edgeless cohort, 'LINEAGE_LINK_MISSING')`, and reaching it was the proof that
   * **neither** value of `lineageLink` was accepted. `buildLineage` pass 4 now scopes its
   * `CATEGORY_ONLY` arm to a ذري waqf, so:
   *
   *     no edge  ⇒ COMPUTES                      ← inverted; the honest recording is accepted
   *     an edge  ⇒ DESCENDANT_ON_CHARITABLE_WAQF   (ESC-1, unchanged)
   *
   * Exactly one recording of the field is now legal, and it is the one that asserts nothing false.
   * ⚠ The pair is kept together in one test on purpose: the finding was never "a refusal fired", it
   * was "**both** values were refused". A future change that re-broadened R6 would leave the first
   * assertion green and turn only the second red — which is the failure this arrangement is for.
   *
   * ── ⚠ THIRD REVISION (2026-08-03): THE FICTION IS REFUSED BY A NEWER RULE, SO IT IS DRIVEN TWICE ─
   * The fiction below carries `tabaqa: 1` as well as the invented `SON` edge — a placeholder claiming
   * to be a *first-generation descendant*. `TABAQA_ON_CHARITABLE_WAQF` (a وقف خيري has no
   * generations, so no beneficiary of one may carry a ṭabaqa) now answers that record FIRST.
   * MEASURED BEFORE: `DESCENDANT_ON_CHARITABLE_WAQF`. MEASURED AFTER: `TABAQA_ON_CHARITABLE_WAQF`.
   *
   * ESC-1's discriminator is **not** allowed to go untested as a result — that would be exactly the
   * "green for the wrong reason" trade this file warns about. The fiction is therefore driven in both
   * of its recordings: with the ṭabaqa (answered by the newer rule) and with `tabaqa: null` (the
   * residue ESC-1 still owns and the only shape that still reaches it through `runDistribution`).
   */
  it('the fiction is STILL refused — by both خيري rules — but the honest edgeless record computes', () => {
    const withFictionalEdge = {
      ...orderedFamily([
        patched(CHARITABLE_PLACEHOLDER, { tabaqa: 1, parentId: null, lineageLink: 'SON' }),
        JIHA,
      ]),
      waqfType: 'PUBLIC_CHARITABLE' as const,
    };
    const tabaqaRefusal = expectRefused(withFictionalEdge, 'TABAQA_ON_CHARITABLE_WAQF');
    expect(tabaqaRefusal.message).toContain('ben-r6-seg');

    // …and ESC-1 itself, on the same fiction recorded WITHOUT the generational claim: the invented
    // `SON` edge alone still makes the endowment both خيري and ذري.
    const refusal = expectRefused(
      {
        ...orderedFamily([
          patched(CHARITABLE_PLACEHOLDER, { tabaqa: null, parentId: null, lineageLink: 'SON' }),
          JIHA,
        ]),
        waqfType: 'PUBLIC_CHARITABLE' as const,
      },
      'DESCENDANT_ON_CHARITABLE_WAQF',
    );
    expect(refusal.message).toContain('ben-r6-seg');
    // The refusal names both natures, which is what makes the rule legible to whoever reads it.
    expect(refusal.message).toContain('خيري');
    expect(refusal.message).toContain('ذري');

    // ⚠ THE INVERSION. The other value of the same field is no longer refused — it is the correct
    // recording, and the run reaches the SAME allocation the fiction used to buy, without the fiction.
    const honest = mustRun({
      ...orderedFamily([CHARITABLE_PLACEHOLDER, JIHA]),
      waqfType: 'PUBLIC_CHARITABLE',
    });
    expect(statusesById(honest)).toStrictEqual({
      'ben-r6-seg': 'PAID/null:22916667',
      'ben-r6-jiha': 'PAID/null:4583333',
    });
    // And the difference that made the fiction worth refusing: the basis no longer claims a descent.
    expect(honest.lines.find((line) => line.beneficiaryId === 'ben-r6-seg')?.basis).toMatchObject({
      lineageDepth: null,
      lineageLink: null,
      tabaqa: null,
    });
  });

  /**
   * The boundary of the correction, driven rather than reasoned: it is scoped to `CATEGORY_ONLY` on a
   * charitable waqf, and to nothing else. Two neighbours one field away must both still refuse.
   *
   *  · the same edgeless record typed `FAMILY` on the same خيري waqf ⇒ still `LINEAGE_LINK_MISSING`.
   *    A bloodline member is a claim of descent whatever the deed is typed, so R6 still demands the
   *    edge — and ESC-1 then refuses it, which is why a `FAMILY` member genuinely has no place on a
   *    charitable waqf. That is not R6-F1: it is R5 working, because the record IS contradictory.
   *  · the same edgeless `CATEGORY_ONLY` record on a ذري waqf ⇒ still `LINEAGE_LINK_MISSING`. There
   *    eligibility does come from descent, so the descent must be on record — R6 untouched.
   */
  it('the correction is scoped · FAMILY on خيري and CATEGORY_ONLY on ذري are both still refused', () => {
    expectRefused(
      {
        ...orderedFamily([
          patched(CHARITABLE_PLACEHOLDER, { kind: 'FAMILY', category: null, line: 'ZUHUR' }),
          JIHA,
        ]),
        waqfType: 'PUBLIC_CHARITABLE',
      },
      // Not `COHORT_MIXES_CHARITABLE_AND_FAMILY`: that is Stage 0 and would fire FIRST on this
      // cohort, so the jiha is dropped to leave `buildLineage` as the only thing that can refuse.
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
    );
    const familyAlone = expectRefused(
      {
        ...orderedFamily([
          patched(CHARITABLE_PLACEHOLDER, { kind: 'FAMILY', category: null, line: 'ZUHUR' }),
        ]),
        waqfType: 'PUBLIC_CHARITABLE',
      },
      'LINEAGE_LINK_MISSING',
    );
    expect(familyAlone.message).toContain('ben-r6-seg');

    // …and the placeholder itself, on the waqf type where descent IS the eligibility.
    expectRefused(orderedFamily([CHARITABLE_PLACEHOLDER]), 'LINEAGE_LINK_MISSING');
  });
});
