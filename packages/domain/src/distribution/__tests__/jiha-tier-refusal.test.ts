/**
 * `assertJihaNotTiered` — a `CHARITABLE_JIHA` recorded inside the generational tier tree halts the
 * run with `SHART_INCOMPLETE` / `JIHA_TIERED`.
 *
 * **Product-owner decision, 2026-07-30 (S3-D3). UNCHANGED by ADR-0009.** A charitable jiha is not a
 * descendant of the waqif, so it has no ṭabaqa; *al-aʿlā fa-l-aʿlā* is a rule about generations of a
 * family and a charity is not in one. A jiha carrying a ṭabaqa is a deed record that contradicts
 * itself, and per CLAUDE.md binding rule 1 the engine halts rather than choosing a reading.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠⚠⚠ THE FINDING THIS HEADER CARRIED IS **FALSE AS OF R7**. `assertJihaNotTiered` IS
 *      REACHABLE AGAIN THROUGH `runDistribution`, AND IT WAS RE-MEASURED, NOT REASONED. ⚠⚠⚠
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * What this header said, from 2026-08-03 until now, was: *"`JIHA_TIERED` cannot be produced by
 * `runDistribution` or by `resolveEntitlement`."* That was true of that engine. **It is not true of this
 * one**, and the sentence is replaced rather than softened, because a header that overstates a closure
 * is how a suite goes on passing while proving nothing (the failure this file has warned about three
 * times about other people's comments).
 *
 * The header even predicted its own reversal, in the paragraph justifying why the guard was not deleted:
 * *"it would silently become load-bearing again the moment R6-D1 is removed — which is live: 'a ذري deed
 * may be permitted to name a charity' is under review right now. If R6-D1 goes, `FAMILY_DHURRI` + tiered
 * jiha reaches this function again and it must still be there."* **The owner answered on 2026-08-10
 * (R7): a وقف ذري MAY name a charity, as its ultimate taker (مآل الوقف).** R6-D1 did not go, but it
 * became conditional — it now exempts a jiha the deed names as its مآل — so the route the header
 * described is open, the guard is load-bearing again, and it is still there.
 *
 * ## THE ROUTE, precisely
 * `waqfType: 'FAMILY_DHURRI'` + a legible `reversion` clause naming the jiha + that jiha carrying a
 * `tabaqa`. Stage 0 lets it through: `JOINT` does not apply, `assertReversionLegible` passes (the named
 * id exists and is a `CHARITABLE_JIHA`), `TABAQA_ON_CHARITABLE_WAQF` and `DESCENDANT_ON_CHARITABLE_WAQF`
 * are خيري-only, and all three narrowed cohort refusals exempt a recorded taker. Stage 2 then reaches
 * `assertJihaNotTiered` — **before `buildLineage`**, so `LINEAGE_EDGE_ON_NON_DESCENDANT` does not
 * pre-empt it — and the run halts `SHART_INCOMPLETE` / `JIHA_TIERED`.
 *
 * MEASURED, not reasoned: §"REACHABILITY" below enumerates all **240** cells of
 * `waqfType × entitlementOrder × cohort × continuation × reversion` that hold a tiered jiha, and **32 of
 * them land on `JIHA_TIERED`** (24 before memo Q7 moved the eight direct-use cells here from `RESOLVED`).
 * The census is derived by hand from the refusal precedence in the comment above the assertion, then
 * confirmed. **No cell resolves any more: a tiered jiha never computes on any route.**
 *
 * ⚠ **AND THAT IS ALL IT PROVES.** Every cell holds a tiered jiha, so this census says nothing about the
 * other checks the `NA_DIRECT_USE` short-circuit was outranking — seven of them, found by enumerating the
 * discriminators instead of the cohorts, and closed by Q7's second pass. See
 * `q7-validity-precedence.test.ts`, and the note beside the expectation below.
 *
 * | route | who answers a TIERED JIHA | why |
 * |---|---|---|
 * | `JOINT`, any clause | **`WAQF_TYPE_JOINT_NOT_SUPPORTED`** | refused unconditionally, first check in the function |
 * | `PUBLIC_CHARITABLE` + a clause | **`REVERSION_ON_CHARITABLE_WAQF`** | a خيري waqf has no bloodline to end, so it has no مآل (⚠ Claude's fail-safe reading of R5 — see the TODO(surface) in `resolver.ts`) |
 * | `PUBLIC_CHARITABLE`, no clause | **`TABAQA_ON_CHARITABLE_WAQF`** | the jiha's `tabaqa` is itself a ṭabaqa on a خيري waqf |
 * | …with a `FAMILY` member beside it, no clause | **`COHORT_MIXES_CHARITABLE_AND_FAMILY`** | earlier still — a charity and a bloodline cannot SHARE one endowment |
 * | `FAMILY_DHURRI`, no clause, or a clause not naming this jiha | **`CHARITABLE_JIHA_ON_FAMILY_WAQF`** | R6-D1 as narrowed by R7: a charity on a ذري waqf must be its recorded ultimate taker |
 * | **`FAMILY_DHURRI` + a clause naming it + ANY of the four orders** | **`JIHA_TIERED`** ← **THE REVIVED ROUTE**, direct use included since Q7 | nothing earlier applies, and a charity still has no generation to sit in |
 *
 * ── ✓ ESC-2 IS CLOSED BY RULING — memo Q7, product owner 2026-08-17 ──────────────────────────
 * **The eight `RESOLVED` cells are gone: `JIHA_TIERED` 24 → 32, `RESOLVED` 8 → 0, re-measured.** What this
 * header said until now, and it is quoted because the state it described was real: *"Eight of the 240 cells
 * RESOLVE: a ذري direct-use waqf with a valid reversion and a TIERED taker jiha short-circuits at
 * `NA_DIRECT_USE` before `assertJihaNotTiered`, so the self-contradiction in the record goes unreported. No
 * money moves … but the run is emitted as valid over a deed record the engine would refuse on any other
 * order. … The precedence question — should the engine refuse a self-contradicting record even when nothing
 * would be paid? — … is the owner's to settle and engineering must not settle it silently in either
 * direction."*
 *
 * It was carried to him and settled: **validity precedes short-circuits — a record that cannot describe a
 * real endowment halts even when nothing would be paid.** `assertJihaNotTiered` moved to step 3 of
 * `resolveEntitlement`, above the short-circuit, joining the JOINT refusal that had answered the same
 * question that way since S3. The engine no longer answers one precedence question in two directions.
 *
 * ⚠ **ESC-2's OTHER shape was already closed, and Q7 must not be credited with it.** A tiered jiha on a
 * **خيري** direct-use waqf was refused before this change (`TABAQA_ON_CHARITABLE_WAQF` with no clause,
 * `REVERSION_ON_CHARITABLE_WAQF` with one — both in `assertSingleWaqfNature`, which already preceded the
 * short-circuit). Every خيري count in the census is unchanged.
 *
 * ── AND THE SECOND CASUALTY OF 2026-08-03 IS **REPAIRED** ───────────────────────────────────
 * `isTiered()`'s discriminating case — one member tiered, another untiered, in the SAME cohort — had no
 * reachable cohort on any money-moving order, which made invariant I5's untiered exemption and AT-15
 * vacuous in the money path. **R7 gives it a subject again**: a ذري cohort of TIERED descendants plus an
 * UNTIERED recorded ultimate-taker jiha is now legal and computes. That is the case which must NOT be
 * tier-excluded, and AT-15 is re-pointed at it in `acceptance.test.ts`. §"REACHABILITY" measures the
 * repair rather than asserting it.
 *
 * ## What this suite exists to stop coming back
 * Before the refusal, S3's adversarial review MEASURED the following on §08's Example D with
 * `entitlementOrder: ORDERED` and the jiha patched to `tabaqa: 2`: the jiha was
 * `EXCLUDED (UPPER_TABAQA_EXTANT)` and its entire 56,000,000 halalas (SAR 560,000) deed share was
 * redistributed to the family, **no flag raised**, and the line still stamped
 * `JOINT_FIXED_DEED_SHARES`. Two comments — in `resolver.ts` and `invariants.ts` — asserted that
 * exactly this could not happen. They were believed by the next reader, which is the defect class
 * this project has been bitten by most. **That loss is still prevented** — the run still halts, and
 * the halt is still driven end to end below. What changed is only WHICH rule says no.
 *
 * ## ⚠ THE RE-POINTING HISTORY, kept because each version was true of a different engine
 * (1) S3: driven from a **JOINT** waqf (`exampleD` re-typed `ORDERED`).
 * (2) ADR-0009 R5 made that input refused earlier (`WAQF_TYPE_JOINT_NOT_SUPPORTED`), so every test here
 *     would have gone on passing while proving **nothing about `assertJihaNotTiered`**. Re-pointed at
 *     a `PUBLIC_CHARITABLE` waqf whose cohort is jihas only — at the time, the one shape where a jiha
 *     and a ṭabaqa could legally coexist in a record.
 * (3) `TABAQA_ON_CHARITABLE_WAQF` (2026-08-03) refused that shape too, and there was no third shape to
 *     re-point at: the file stopped trying to reach the function through the front door and pinned the
 *     closure instead. That was the right call **for that engine** — the alternative would have been
 *     hunting for a cohort that still landed on `JIHA_TIERED`, which is the "green for the wrong reason"
 *     move this header warns about.
 * (4) ✓ **R7 (product owner, 2026-08-10) OPENS A FOURTH SHAPE, and it is the one version (3) said to
 *     watch for**: `FAMILY_DHURRI` + a reversion clause naming the jiha as ultimate taker. The
 *     front-door tests version (3) had to give up are RESTORED below — through `runDistribution` and
 *     through `resolveEntitlement` — and the closure-pinning census is kept beside them, now measuring
 *     which of the two states each route is in rather than asserting that only one exists.
 *
 * Each refusal assertion names its own discriminator and never a bare `SHART_INCOMPLETE`, because
 * ADR-0009 and its successors give that one code **twenty-six** different reasons.
 *
 * ## MUTATION-VERIFIED — RE-MEASURED AT R7, NOT COPIED
 * The recorded result used to be: *"deleting the `assertJihaNotTiered(input)` call from
 * `resolveEntitlement` leaves every test in this file green — which is the finding."* **That is now
 * false and would have been the worst kind of stale claim, since it asserted the guard was untested.**
 *
 * RE-MEASURED (2026-08-10) with the `assertJihaNotTiered(input)` call deleted from `resolveEntitlement`.
 * **FIVE of this file's thirteen tests go RED** — the census, both restored front-door tests, and both
 * route-naming tests — and the 24 `JIHA_TIERED` cells scatter, exactly as follows:
 *
 * ⊕ **RE-RE-MEASURED 2026-08-17 after memo Q7 moved the guard above the direct-use short-circuit:
 * still FIVE of thirteen RED, the same five.** ⚠ The scatter table below can no longer be reproduced *as a
 * table*: the census now **aborts** instead of classifying, because one mutated cell throws
 * `DISTRIBUTION_INVARIANT_BREACH` — which carries an `invariantId` and no `refusal`, so `outcomeOf` fails on
 * `expect(SHART_REFUSALS).toContain(undefined)`. That is the I5 second-guard named in the second bullet
 * below, arriving one step earlier than it used to. The counts in the table are therefore **as taken on
 * 2026-08-10 against the pre-Q7 engine** and are kept rather than silently re-attributed.
 *
 * | what answers instead | cells | why |
 * |---|---|---|
 * | **`RESOLVED`** ⚠ | **6** | `SHARED` (4) and `LINEAGE_CONTINUATION` + a recorded stipulation (2): the self-contradicting record computes with nothing raised |
 * | `CODE:DISTRIBUTION_INVARIANT_BREACH` — **I5** | 4 | `ORDERED` with a real family member present: the tiered taker's line carries `REVERSION_PENDING_LIVING_BLOODLINE` while its ṭabaqa says the tier rule should have decided it, and I5 refuses the run |
 * | `REVERSION_WITH_NO_RECORDED_BLOODLINE` | 5 | the jiha-alone cohorts — no certified descendant to be extinct |
 * | `LINEAGE_LINK_MISSING` | 5 | the edgeless-placeholder cohorts, refused by R6 further down |
 * | `CONTINUATION_STIPULATION_UNRECOGNISED` | 4 | `LINEAGE_CONTINUATION` with a `null` term, which this guard used to pre-empt |
 *
 * Two things in that table are worth more than the mutation score itself:
 *
 *  · **six cells PAY OUT over a record the engine is supposed to refuse.** No money is *misdirected* —
 *    the taker is still default-excluded by the reversion ladder, so the family takes the pool — but the
 *    contradiction goes unreported, which is the whole substance of S3-D3. The guard is load-bearing;
 *  · **invariant I5 is an independent second guard on four of them**, and its message is the honest one:
 *    a tiered taker's verdict comes from the reversion clause, so it can never satisfy the tier rule its
 *    own `tabaqa` invokes. That is a structural argument for the refusal existing at all, discovered by
 *    mutation rather than asserted, and it is *not* a reason to delete the guard and lean on I5 — I5 only
 *    fires when a tiered family member is present to establish an entitled tier.
 *
 * And, unchanged: deleting the `TABAQA_ON_CHARITABLE_WAQF` block from `assertSingleWaqfNature` turns the
 * census red and moves 32 خيري cells onto `JIHA_TIERED`.
 */
import { describe, expect, it } from 'vitest';

import { isDomainError } from '../../errors.js';
import { runDistribution } from '../engine.js';
import { assertJihaNotTiered, assertSingleWaqfNature, resolveEntitlement } from '../resolver.js';
import {
  ENTITLEMENT_ORDERS,
  SHART_REFUSALS,
  WAQF_TYPES,
  distributionInputSchema,
  type DistributionInputRaw,
} from '../contract.js';
import {
  BEN_006,
  BEN_007,
  BEN_306,
  BEN_307,
  exampleDCharitable,
  patched,
} from './fixtures/worked-examples.js';

type BeneficiaryRaw = DistributionInputRaw['beneficiaries'][number];

/**
 * Example D-خ re-typed `ORDERED` — a legal `PUBLIC_CHARITABLE` waqf, three jihas, no family member.
 *
 * `ORDERED` matters: it is the only order that runs a tier test at all, so it is the order in which a
 * tiered jiha could actually lose money. Under `SHARED` a tier decides nothing and the loss this suite
 * guards against is not reachable.
 */
function orderedCharitableInput() {
  return { ...exampleDCharitable(), entitlementOrder: 'ORDERED' as const };
}

/** The refusal discriminator a run produced, or `'RESOLVED'`. Never a bare `SHART_INCOMPLETE`. */
function outcomeOf(raw: DistributionInputRaw): string {
  try {
    runDistribution(raw);
    return 'RESOLVED';
  } catch (error) {
    if (!isDomainError(error)) throw error;
    const details = error.details as { readonly refusal?: unknown } | undefined;
    const refusal = details?.refusal;
    expect(SHART_REFUSALS).toContain(refusal);
    return String(refusal);
  }
}

describe('assertJihaNotTiered — the refusal itself, driven DIRECTLY', () => {
  /**
   * ⚠ The call is direct and that is now the ONLY way in. Every assertion in this block is about the
   * function's own behaviour; nothing here claims a run can reach it. The controls that used to
   * demand `assertSingleWaqfNature` stand aside for this cohort are **inverted** — it no longer does,
   * and pretending otherwise is what would make this suite green for the wrong reason.
   */
  it('halts with SHART_INCOMPLETE / JIHA_TIERED when a CHARITABLE_JIHA carries a tabaqa', () => {
    const input = distributionInputSchema.parse({
      ...orderedCharitableInput(),
      beneficiaries: [patched(BEN_006, { tabaqa: 2 }), BEN_306, BEN_307],
    });

    // ⚠ THE CONTROL, INVERTED. It used to read `.not.toThrow()`, and that was the guarantee that
    // `assertJihaNotTiered` was the only rule that could refuse this cohort. MEASURED NOW:
    // `assertSingleWaqfNature` throws `TABAQA_ON_CHARITABLE_WAQF` on this exact input — which is the
    // finding in this file's header, pinned at the point where it used to be denied.
    let stage0: unknown;
    try {
      assertSingleWaqfNature(input);
    } catch (error) {
      stage0 = error;
    }
    expect(isDomainError(stage0)).toBe(true);
    if (isDomainError(stage0)) {
      expect(stage0.details).toMatchObject({ refusal: 'TABAQA_ON_CHARITABLE_WAQF' });
    }

    expect(() => {
      assertJihaNotTiered(input);
    }).toThrowError(/CHARITABLE_JIHA/);

    try {
      assertJihaNotTiered(input);
      expect.unreachable('assertJihaNotTiered must throw');
    } catch (error) {
      expect(isDomainError(error)).toBe(true);
      if (!isDomainError(error)) return;
      expect(error.code).toBe('SHART_INCOMPLETE');
      // The message must name the offender — a refusal nobody can act on is half a refusal.
      expect(error.message).toContain('ben-006');
      expect(error.details).toMatchObject({
        field: 'beneficiaries[].tabaqa',
        // The DISCRIMINATOR, not just the code: twenty-six distinct refusals share SHART_INCOMPLETE,
        // so a code-only assertion would pass against the wrong one.
        refusal: 'JIHA_TIERED',
        offendingBeneficiaryIds: ['ben-006'],
      });
    }
  });

  it('permits a jiha with a null tabaqa — the legal shape must still compute', () => {
    const input = distributionInputSchema.parse(orderedCharitableInput());
    expect(() => {
      assertJihaNotTiered(input);
    }).not.toThrow();
    // …and this cohort really is legal all the way through Stage 0, unlike the tiered one above.
    expect(() => {
      assertSingleWaqfNature(input);
    }).not.toThrow();
  });

  it('names every offender, not just the first', () => {
    const secondJiha = patched(BEN_006, {
      id: 'ben-006b',
      tabaqa: 3,
      bankingRefForProceeds: 'FAKE-IBAN-006B',
    });
    const input = distributionInputSchema.parse({
      ...orderedCharitableInput(),
      beneficiaries: [patched(BEN_006, { tabaqa: 2 }), secondJiha, BEN_306, BEN_307],
    });

    try {
      assertJihaNotTiered(input);
      expect.unreachable('assertJihaNotTiered must throw');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.details).toMatchObject({ offendingBeneficiaryIds: ['ben-006', 'ben-006b'] });
    }
  });

  /**
   * ⚠⚠ **THE END-TO-END HALF IS INVERTED — THREE TIMES NOW — AND THE COHORT'S LEGALITY IS THE
   * REASON EVERY TIME.**
   *
   * ── The comment history, kept because each version was true of a different engine ────────────
   * (1) Original: *"a placeholder is NOT a leg (ADR-0009), so jiha + placeholder is a legitimate
   *     charitable waqf whose segment is not yet individually identified — this cohort reaches the
   *     assert."*
   * (2) Under R6 + ESC-1, MEASURED: through `runDistribution` this cohort never reached
   *     `assertJihaNotTiered` at all. Edgeless it halted `LINEAGE_LINK_MISSING`; with the edge R6
   *     demanded it halted `DESCENDANT_ON_CHARITABLE_WAQF`.
   * (3) After R6-F1 scoped `buildLineage` pass 4's `CATEGORY_ONLY` arm to a `FAMILY_DHURRI` waqf,
   *     version (1) was true again and this cohort COMPUTED end to end. MEASURED, in halalas:
   *     distributable 140,000,000 (revenue 180,000,000 − ṣiyāna 10,000,000 − operating 12,000,000 −
   *     ʿushr 18,000,000); the tiered placeholder was the only tiered member so `lowestLivingTabaqa`
   *     was 2 and it took the entitled tier; the untiered jiha was never tested; weights 40 and 30
   *     over Σ 70 gave `ben-006` 140,000,000 × 40 / 70 = **80,000,000** and `ben-cat`
   *     140,000,000 × 30 / 70 = **60,000,000**, residual 0, `excludedCount` 0, and `ben-cat`'s basis
   *     read `{ tabaqa: 2, lineageDepth: null, lineageLink: null }`.
   * (4) ✓ **Now REFUSED `TABAQA_ON_CHARITABLE_WAQF`** — and outcome (3) is precisely the defect the
   *     new rule exists to kill: `ben-cat`'s ṭabaqa DECIDED the entitled tier on a وقف خيري, on a
   *     line whose BR-505 basis was stamped with the generational rule, while
   *     `assertOrderedExclusion` never tested it and **I5 was still certified in `invariantsChecked`**.
   *
   * ── WHAT THIS COSTS THIS SUITE, SAID PLAINLY ────────────────────────────────────────────────
   * The construction the file relied on — *the untiered cohort computes, and the same cohort with the
   * jiha tiered is refused `JIHA_TIERED`, one field apart* — is **gone**, because the tiered variant
   * is now answered by a different rule and the placeholder variant no longer computes either. The
   * narrow unit claim below is what survives, and it is still worth its lines: `assertJihaNotTiered`
   * keys on `kind === 'CHARITABLE_JIHA'` and on nothing else, so a tiered placeholder is NOT swept
   * into the jiha rule on the strength of the resemblance (that function's own TODO(surface)).
   */
  it('leaves a CATEGORY_ONLY placeholder with a tabaqa alone — but Stage 0 no longer does', () => {
    const placeholder = patched(BEN_306, {
      id: 'ben-cat',
      kind: 'CATEGORY_ONLY',
      category: 'orphans not yet enrolled',
      tabaqa: 2,
    });
    const input = distributionInputSchema.parse({
      ...orderedCharitableInput(),
      beneficiaries: [BEN_006, placeholder],
    });
    // The narrow unit claim, unchanged: this function keys on `kind`, so it does not touch it.
    expect(() => {
      assertJihaNotTiered(input);
    }).not.toThrow();

    // ⚠ INVERTED. This used to be `.not.toThrow()` — the control proving nothing at Stage 0 touched
    // the cohort. The ṭabaqa on a خيري waqf is now exactly what Stage 0 refuses.
    try {
      assertSingleWaqfNature(input);
      expect.unreachable('a ṭabaqa on a وقف خيري must be refused at Stage 0');
    } catch (error) {
      if (!isDomainError(error)) throw error;
      expect(error.details).toMatchObject({
        refusal: 'TABAQA_ON_CHARITABLE_WAQF',
        field: 'beneficiaries[].tabaqa',
        offendingBeneficiaryIds: ['ben-cat'],
      });
    }

    // ⚠ AND THE RUN, INVERTED: the figures in (3) above are now unreachable.
    expect(outcomeOf({ ...orderedCharitableInput(), beneficiaries: [BEN_006, placeholder] })).toBe(
      'TABAQA_ON_CHARITABLE_WAQF',
    );

    // …the SURVIVING half, driven so the inversion is not just an assertion of absence: drop the
    // placeholder's ṭabaqa and R6-F1's correction still holds — an edgeless خيري placeholder is a
    // representable record that computes. Weights 40 and 30 over Σ 70 on a distributable of
    // 140,000,000 halalas (180,000,000 − 10,000,000 − 12,000,000 − 18,000,000):
    //     ben-006: 140,000,000 × 40 / 70 = 5,600,000,000 / 70 = 80,000,000   (exact)
    //     ben-cat: 140,000,000 × 30 / 70 = 4,200,000,000 / 70 = 60,000,000   (exact)
    //     Σ = 140,000,000, residual 0.
    const untieredPlaceholder = patched(placeholder, { tabaqa: null });
    const result = runDistribution({
      ...orderedCharitableInput(),
      beneficiaries: [BEN_006, untieredPlaceholder],
    });
    expect(
      result.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor]),
    ).toEqual([
      ['ben-006', 'PAID', 80_000_000n],
      ['ben-cat', 'PAID', 60_000_000n],
    ]);
    expect(result.totals.excludedCount).toBe(0);
    // No ṭabaqa survives anywhere on the خيري line — the whole point of the new rule.
    const catLine = result.lines.find((line) => line.beneficiaryId === 'ben-cat');
    expect(catLine?.basis).toMatchObject({ tabaqa: null, lineageDepth: null, lineageLink: null });
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * REACHABILITY — the finding, enumerated rather than argued
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('REACHABILITY · which refusal answers a TIERED JIHA on each route', () => {
  /** A jiha carrying a ṭabaqa — the one and only subject `assertJihaNotTiered` has. */
  const TIERED_JIHA = patched(BEN_006, { tabaqa: 2 });

  /**
   * Cohorts that all contain {@link TIERED_JIHA}, spanning the shapes each neighbouring refusal keys
   * on: a jiha alone, beside a second jiha, beside a `FAMILY` member (the mixed-cohort key), and
   * beside a `CATEGORY_ONLY` placeholder both with and without a lineage edge.
   */
  const COHORTS: Readonly<Record<string, readonly BeneficiaryRaw[]>> = Object.freeze({
    jihaAlone: [TIERED_JIHA],
    jihaPlusJiha: [TIERED_JIHA, BEN_306],
    jihaPlusFamily: [TIERED_JIHA, BEN_007],
    jihaPlusEdgelessPlaceholder: [
      TIERED_JIHA,
      patched(BEN_306, {
        id: 'ben-cat',
        kind: 'CATEGORY_ONLY',
        category: 'orphans',
        tabaqa: null,
        parentId: null,
        lineageLink: null,
      }),
    ],
    jihaPlusEdgedPlaceholder: [
      TIERED_JIHA,
      patched(BEN_306, {
        id: 'ben-cat',
        kind: 'CATEGORY_ONLY',
        category: 'orphans',
        tabaqa: 1,
        parentId: null,
        lineageLink: 'SON',
      }),
    ],
  });

  /**
   * **R7** · the مآل clause naming the tiered jiha — the axis that revives this guard's route. It names
   * `ben-006`, which is {@link TIERED_JIHA}'s id in every cohort below.
   */
  const MAAL_NAMING_THE_TIERED_JIHA = Object.freeze({
    kind: 'CHARITABLE_ULTIMATE_TAKER',
    ultimateTakerIds: ['ben-006'],
  });

  /**
   * The whole cross-product, and the exact winner in every cell.
   *
   * `WAQF_TYPES` (3) × `ENTITLEMENT_ORDERS` (4) × cohorts (5) × continuation recorded-or-not (2) ×
   * **reversion recorded-or-not (2)** = **240 cells**, every one of which holds a tiered jiha. The set
   * of winners is asserted as a closed census with counts: adding a route, or changing which rule
   * answers one, moves a number here.
   *
   * ⚠ The reversion axis went in for R6-C1's reason, stated as a lesson this repo has paid for: *a
   * property whose generator cannot reach a configuration reports its silence as success, at scale.* The
   * 120-cell census was green over a surface that no longer contained the route it existed to police.
   */
  it('enumerates all 240 cells — and JIHA_TIERED wins 32 of them (R7 revived the route; Q7 added the direct-use 8)', () => {
    const winners = new Map<string, number>();
    const cells: string[] = [];
    for (const waqfType of WAQF_TYPES) {
      for (const entitlementOrder of ENTITLEMENT_ORDERS) {
        for (const [cohortName, beneficiaries] of Object.entries(COHORTS)) {
          for (const continuationStipulation of [null, 'ZUHUR_ONLY'] as const) {
            for (const reversion of [null, MAAL_NAMING_THE_TIERED_JIHA]) {
              const outcome = outcomeOf({
                ...exampleDCharitable(),
                waqfType,
                entitlementOrder,
                continuationStipulation,
                reversion,
                beneficiaries: [...beneficiaries],
              });
              cells.push(
                `${waqfType}|${entitlementOrder}|${cohortName}|${
                  reversion === null ? 'noMaal' : 'maal'
                }|${outcome}`,
              );
              winners.set(outcome, (winners.get(outcome) ?? 0) + 1);
            }
          }
        }
      }
    }

    expect(cells.length).toBe(240);

    /*
     * THE CLOSED CENSUS, DERIVED BY HAND from the refusal precedence in `assertSingleWaqfNature` and
     * `resolveEntitlement`, then confirmed. 3 types × 4 orders × 5 cohorts × 2 continuations × 2
     * reversions = 240, split 120 / 120 by the reversion axis.
     *
     * ── no مآل clause (120 cells): the 2026-08-03 census, UNCHANGED ────────────────────────────
     *   JOINT             — all 40, refused first of all.
     *   PUBLIC_CHARITABLE — 40: the 8 `jihaPlusFamily` cells go to the mixed-cohort rule (which
     *                       precedes the ṭabaqa rule), the other 32 to `TABAQA_ON_CHARITABLE_WAQF`.
     *   FAMILY_DHURRI     — 40: the same 8 are mixed-cohort, 32 are `CHARITABLE_JIHA_ON_FAMILY_WAQF`.
     *
     * ── a مآل clause naming the tiered jiha (120 cells) ────────────────────────────────────────
     *   JOINT             — all 40. `JOINT` is check 1 and the clause is check 2, so the clause is
     *                       unreachable on a joint waqf, exactly as designed.
     *   PUBLIC_CHARITABLE — all 40 → `REVERSION_ON_CHARITABLE_WAQF`. A خيري waqf has no bloodline to
     *                       end, so the clause itself is refused before any cohort rule is consulted.
     *                       ⚠ Claude's fail-safe reading of R5 — TODO(surface) in `resolver.ts`.
     *   FAMILY_DHURRI     — 40, and this is where the new behaviour lives:
     *                        · `jihaPlusJiha` (1 cohort × 4 orders × 2 continuations = **8**) →
     *                          `CHARITABLE_JIHA_ON_FAMILY_WAQF`, because `ben-306` is a SECOND jiha the
     *                          clause does NOT name. `every`, not `some` — one unnamed charity beside a
     *                          named one is still a charity that would be paid beside the family.
     *                        · the other 4 cohorts × **all four orders** × 2 = **32** →
     *                          **`JIHA_TIERED`**. ← the revived route, plus Q7's eight.
     *
     * ⇒ WAQF_TYPE_JOINT 40 + 40 = 80 · REVERSION_ON_CHARITABLE_WAQF 40 · TABAQA_ON_CHARITABLE 32 ·
     *   COHORT_MIXES 8 + 8 = 16 · CHARITABLE_JIHA_ON_FAMILY 32 + 8 = 40 · JIHA_TIERED 32 · RESOLVED 0.
     *   Σ = 80 + 40 + 32 + 16 + 40 + 32 = 240 ✓
     *
     * ✓✓ **THE EIGHT `RESOLVED` CELLS ARE GONE — memo Q7, product owner 2026-08-17, MEASURED not predicted.**
     * They were `FAMILY_DHURRI | NA_DIRECT_USE | maal`, ESC-2's second reachable shape, and the census
     * carried them as *computes-with-the-contradiction-unreported*. `assertJihaNotTiered` now runs **above**
     * the direct-use short-circuit (validity precedes short-circuits), so those exact eight cells land on
     * `JIHA_TIERED`: 24 → 32, `RESOLVED` 8 → **0**, nothing else moves. The re-measurement was taken before
     * this expectation was edited — the counts here are what the run reported.
     *
     * ⚠ **ESC-2's FIRST shape is NOT what Q7 closed, and saying so would be a false credit.** A tiered jiha
     * on a **خيري** direct-use waqf was already refused before this change — by `TABAQA_ON_CHARITABLE_WAQF`
     * (no clause) or `REVERSION_ON_CHARITABLE_WAQF` (clause), both of which sit in `assertSingleWaqfNature`
     * and already preceded the short-circuit. Every خيري count in this census is therefore unchanged. Q7
     * closed the ذري shape and made the precedence uniform.
     *
     * ── ⚠⚠ AND THIS CENSUS DOES **NOT** MEASURE THE GENERAL RULE. RE-MEASURED, UNCHANGED, SAID PLAINLY ──
     * Q7's **second** pass (2026-08-17) hoisted `buildLineage` above the short-circuit as well, because the
     * first pass had moved one check while claiming the rule. **This census did not move a single number**:
     * re-measured before and after, `JIHA_TIERED` 32 · `RESOLVED` 0 · `WAQF_TYPE_JOINT_NOT_SUPPORTED` 80 ·
     * `REVERSION_ON_CHARITABLE_WAQF` 40 · `CHARITABLE_JIHA_ON_FAMILY_WAQF` 40 ·
     * `TABAQA_ON_CHARITABLE_WAQF` 32 · `COHORT_MIXES_CHARITABLE_AND_FAMILY` 16, and the expectations below
     * were **not edited**.
     *
     * That is the honest result and it is also the warning: **every cell here holds a tiered jiha, so
     * `assertJihaNotTiered` answers first on every ذري route and this table is blind to the other seven
     * discriminators the short-circuit was skipping.** Its silence was not evidence — R6-C1's lesson again
     * (*a property whose generator cannot reach a configuration reports its silence as success, at
     * scale*), this time about a hand-built census rather than a generator. The general rule is measured in
     * **`q7-validity-precedence.test.ts`**, which enumerates every `SHART_REFUSALS` discriminator × all four
     * orders; a change to the precedence moves a string there, not a count here.
     */
    expect([...winners.entries()].sort()).toStrictEqual([
      ['CHARITABLE_JIHA_ON_FAMILY_WAQF', 40],
      ['COHORT_MIXES_CHARITABLE_AND_FAMILY', 16],
      ['JIHA_TIERED', 32],
      ['REVERSION_ON_CHARITABLE_WAQF', 40],
      ['TABAQA_ON_CHARITABLE_WAQF', 32],
      ['WAQF_TYPE_JOINT_NOT_SUPPORTED', 80],
    ]);

    // ⚠ Every `JIHA_TIERED` cell is a ذري waqf with a مآل clause, and every such cell IS `JIHA_TIERED`.
    // Stated as a partition rather than a count, so a future change that preserved the number 32 while
    // moving WHICH cells they are still fails. ⚠ The `NA_DIRECT_USE` exclusion that stood here — the
    // assertion `expect(cell.includes('|NA_DIRECT_USE|')).toBe(false)` — is what Q7 inverted: the
    // direct-use cells are now IN this set, so the assertion is REMOVED rather than left as a lie, and
    // §"Q7" below asserts their presence positively.
    const tiered = cells.filter((cell) => cell.endsWith('|JIHA_TIERED'));
    expect(tiered).toHaveLength(32);
    for (const cell of tiered) {
      expect(cell.startsWith('FAMILY_DHURRI|'), cell).toBe(true);
      expect(cell.includes('|maal|'), cell).toBe(true);
      expect(cell.includes('|jihaPlusJiha|'), cell).toBe(false);
    }

    // ✓ Q7 · the eight cells that used to RESOLVE are the eight direct-use cells of that set, and nothing
    // computes over a tiered jiha any more. Both halves asserted: the census holds NO resolving cell, and
    // the shape that used to resolve is now refused by name.
    expect(cells.filter((cell) => cell.endsWith('|RESOLVED'))).toStrictEqual([]);
    const directUse = tiered.filter((cell) => cell.includes('|NA_DIRECT_USE|'));
    expect(directUse).toHaveLength(8);
    for (const cell of directUse) {
      expect(cell.startsWith('FAMILY_DHURRI|NA_DIRECT_USE|'), cell).toBe(true);
      expect(cell.includes('|maal|'), cell).toBe(true);
    }
  });

  /** The routes named one at a time, so a failure says which one moved. */
  it('names the winner on each waqfType route individually', () => {
    const base = { ...orderedCharitableInput(), beneficiaries: [TIERED_JIHA, BEN_306] };
    expect(outcomeOf({ ...base, waqfType: 'PUBLIC_CHARITABLE' })).toBe('TABAQA_ON_CHARITABLE_WAQF');
    expect(outcomeOf({ ...base, waqfType: 'FAMILY_DHURRI' })).toBe(
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );
    expect(outcomeOf({ ...base, waqfType: 'JOINT' })).toBe('WAQF_TYPE_JOINT_NOT_SUPPORTED');
    // And the mixed-cohort rule outranks BOTH of the first two when a FAMILY member is present.
    for (const waqfType of ['PUBLIC_CHARITABLE', 'FAMILY_DHURRI'] as const) {
      expect(
        outcomeOf({ ...orderedCharitableInput(), waqfType, beneficiaries: [TIERED_JIHA, BEN_007] }),
      ).toBe('COHORT_MIXES_CHARITABLE_AND_FAMILY');
    }

    // R7 · and with the clause, the same three types diverge differently: the ذري route reaches THIS
    // FILE'S guard, the خيري route is refused for having a clause at all, and JOINT is unmoved.
    const withMaal = {
      ...orderedCharitableInput(),
      reversion: MAAL_NAMING_THE_TIERED_JIHA,
      beneficiaries: [TIERED_JIHA],
    };
    expect(outcomeOf({ ...withMaal, waqfType: 'FAMILY_DHURRI' })).toBe('JIHA_TIERED');
    expect(outcomeOf({ ...withMaal, waqfType: 'PUBLIC_CHARITABLE' })).toBe(
      'REVERSION_ON_CHARITABLE_WAQF',
    );
    expect(outcomeOf({ ...withMaal, waqfType: 'JOINT' })).toBe('WAQF_TYPE_JOINT_NOT_SUPPORTED');
  });

  /**
   * ⚠ **RESTORED (R7-f) — THE FRONT DOOR, through `runDistribution`.**
   *
   * Version (3) of this file's history had to give this up: there was no cohort that reached the guard
   * through the real entrypoint, so the file could only pin the closure. R7 opens one, and driving the
   * guard end to end is what makes it a test of the engine rather than of an exported helper.
   */
  it('restores the front door · runDistribution refuses a TIERED ultimate-taker jiha on a ذري waqf', () => {
    let caught: unknown;
    try {
      runDistribution({
        ...orderedCharitableInput(),
        waqfType: 'FAMILY_DHURRI',
        reversion: MAAL_NAMING_THE_TIERED_JIHA,
        beneficiaries: [TIERED_JIHA],
      });
      expect.unreachable('a tiered ultimate-taker jiha must be refused JIHA_TIERED');
    } catch (error) {
      caught = error;
    }
    if (!isDomainError(caught)) throw caught;
    expect(caught.code).toBe('SHART_INCOMPLETE');
    expect(caught.details).toMatchObject({
      field: 'beneficiaries[].tabaqa',
      // The DISCRIMINATOR, never a bare `SHART_INCOMPLETE`: this input clears four other refusals on
      // its way here, and any one of them coming back would still throw the same code.
      refusal: 'JIHA_TIERED',
      offendingBeneficiaryIds: ['ben-006'],
    });
    // The message must name the offender — a refusal nobody can act on is half a refusal.
    expect(caught.message).toContain('ben-006');

    // …and on all three money-moving orders, because the guard sits after the direct-use short-circuit
    // and before `buildLineage`, so the order decides only whether it is reached at all.
    for (const entitlementOrder of ['ORDERED', 'SHARED', 'LINEAGE_CONTINUATION'] as const) {
      expect(
        outcomeOf({
          ...orderedCharitableInput(),
          waqfType: 'FAMILY_DHURRI',
          entitlementOrder,
          continuationStipulation:
            entitlementOrder === 'LINEAGE_CONTINUATION' ? 'ZUHUR_ONLY' : null,
          reversion: MAAL_NAMING_THE_TIERED_JIHA,
          beneficiaries: [TIERED_JIHA],
        }),
        entitlementOrder,
      ).toBe('JIHA_TIERED');
    }
  });

  /**
   * ⚠ **RESTORED (R7-f) — and it proves the guard runs BEFORE `buildLineage`.**
   *
   * A `CHARITABLE_JIHA` carrying a `tabaqa` would also trip `LINEAGE_EDGE_ON_NON_DESCENDANT` inside
   * `buildLineage` if it got that far. It does not: `assertJihaNotTiered` is step 4 of
   * `resolveEntitlement` and `buildLineage` is step 6, so the refusal an operator sees names the
   * ṭabaqa — the field they actually have to correct — rather than the graph edge.
   */
  it('restores the front door · resolveEntitlement reaches the guard before buildLineage does', () => {
    const input = distributionInputSchema.parse({
      ...orderedCharitableInput(),
      waqfType: 'FAMILY_DHURRI',
      reversion: MAAL_NAMING_THE_TIERED_JIHA,
      beneficiaries: [TIERED_JIHA],
    });
    // Stage 0 lets it through now — the control that inverts version (3)'s central claim.
    expect(() => {
      assertSingleWaqfNature(input);
    }).not.toThrow();

    let caught: unknown;
    try {
      resolveEntitlement(input);
      expect.unreachable('resolveEntitlement must refuse a tiered ultimate-taker jiha');
    } catch (error) {
      caught = error;
    }
    if (!isDomainError(caught)) throw caught;
    expect(caught.details).toMatchObject({ refusal: 'JIHA_TIERED' });
    // NOT the graph-edge refusal, which is the one that would fire if the order of the two ever moved.
    expect(caught.details).not.toMatchObject({ refusal: 'LINEAGE_EDGE_ON_NON_DESCENDANT' });
  });

  it('and the same cohort with the ṭabaqa dropped COMPUTES — one field apart, restored too', () => {
    // ⚠ The construction this file lost at version (3) — *the untiered cohort computes, and the same
    // cohort with the jiha tiered is refused `JIHA_TIERED`, ONE FIELD apart* — is back. It is worth
    // more than either half alone: it shows the refusal keys on the `tabaqa` and on nothing else about
    // the record.
    //
    // The cohort needs a recorded bloodline to be computable at all (`REVERSION_WITH_NO_RECORDED_BLOODLINE`
    // — ∅ is "not enrolled", not "extinct"), so a deceased son of the waqif is enrolled beside the jiha.
    const deadSon = patched(BEN_007, {
      id: 'ben-son',
      tabaqa: 1,
      parentId: null,
      lineageLink: 'SON',
      active: false,
    });
    const untieredJiha = patched(BEN_006, { tabaqa: null });
    const result = runDistribution({
      ...orderedCharitableInput(),
      waqfType: 'FAMILY_DHURRI',
      reversion: MAAL_NAMING_THE_TIERED_JIHA,
      beneficiaries: [deadSon, untieredJiha],
    });
    // The recorded bloodline is over, so the مآل takes the whole distributable: 140,000,000 halalas
    // (revenue 180,000,000 − ṣiyāna 10,000,000 − operating 12,000,000 − ʿushr 18,000,000), one taker at
    // weight 40 over Σ 40 ⇒ 140,000,000 × 40 / 40 = 140,000,000 exactly, residual 0.
    // ⚠ the 10% ʿushr rate is this deed's (Nazarah Art. 11) and is unverified — confirm vs primary law.
    expect(result.waterfall.distributableMinor).toBe(140_000_000n);
    expect(
      result.lines.map((line) => [line.beneficiaryId, line.status, line.entitledMinor]),
    ).toEqual([
      ['ben-006', 'PAID', 140_000_000n],
      ['ben-son', 'EXCLUDED', 0n],
    ]);
    expect(result.flags).toContain('REVERSION_TO_ULTIMATE_TAKER_APPLIED');

    // …and tiering that same jiha refuses. One field.
    expect(
      outcomeOf({
        ...orderedCharitableInput(),
        waqfType: 'FAMILY_DHURRI',
        reversion: MAAL_NAMING_THE_TIERED_JIHA,
        beneficiaries: [deadSon, TIERED_JIHA],
      }),
    ).toBe('JIHA_TIERED');
  });

  /**
   * ⚠ **THE SECOND CASUALTY IS REPAIRED — `isTiered()` HAS A DISCRIMINATING COHORT ON A MONEY PATH
   * AGAIN, AND THIS IS THE MEASUREMENT.**
   *
   * On 2026-08-03 this test asserted the opposite: *"a cohort mixing a tiered and an untiered member
   * computes on NO money-moving order"*, which made invariant I5's untiered exemption and AT-15 vacuous
   * in the money path. The reasoning was sound for that engine — on خيري **no** member may carry a
   * ṭabaqa, on ذري **every** member must (a jiha was refused outright, and an edged member's ṭabaqa is
   * cross-checked against its derived depth so `null` is itself a mismatch), and `JOINT` is refused.
   *
   * **R7 removes the middle premise.** A ذري cohort may now hold a jiha — as its recorded ultimate
   * taker — and that jiha carries **no** `tabaqa` and **no** lineage edge, because it is not a
   * descendant. So a cohort of TIERED descendants plus an UNTIERED taker is legal, computes, and is
   * exactly `isTiered()`'s discriminating configuration. AT-15 is re-pointed at it in
   * `acceptance.test.ts`; what is measured here is that the configuration is REACHABLE at all.
   *
   * The old claim's other two premises still hold, and both halves are asserted below so the repair is
   * not mistaken for a general relaxation.
   */
  it('MEASURED · R7 revives isTiered()`s discriminating cohort — tiered family + untiered taker', () => {
    const tieredSon = patched(BEN_007, {
      id: 'ben-son',
      tabaqa: 1,
      parentId: null,
      lineageLink: 'SON',
    });
    const untieredTaker = patched(BEN_006, { tabaqa: null });

    // ── THE REPAIR: legal, computed, and genuinely MIXED on tieredness ────────────────────────
    for (const entitlementOrder of ['ORDERED', 'SHARED'] as const) {
      const result = runDistribution({
        ...orderedCharitableInput(),
        waqfType: 'FAMILY_DHURRI',
        entitlementOrder,
        continuationStipulation: null,
        reversion: MAAL_NAMING_THE_TIERED_JIHA,
        beneficiaries: [tieredSon, untieredTaker],
      });
      // One member tiered, one not — the configuration itself, asserted on the emitted lines.
      const basisTabaqa = new Map(
        result.lines.map((line) => [line.beneficiaryId, line.basis.tabaqa]),
      );
      expect(basisTabaqa.get('ben-son'), entitlementOrder).toBe(1);
      expect(basisTabaqa.get('ben-006'), entitlementOrder).toBeNull();
      // ⚠ AND THE THING THAT MUST NOT HAPPEN: the untiered taker is NOT tier-excluded. It is excluded
      // because the BLOODLINE IS ALIVE, which is R7's rule and not the tier rule — a
      // `UPPER_TABAQA_EXTANT` or `TABAQA_EXTINCT` here would be S3-D3's defect returning by another door.
      const takerLine = result.lines.find((line) => line.beneficiaryId === 'ben-006');
      expect(takerLine?.reasonCode, entitlementOrder).toBe('REVERSION_PENDING_LIVING_BLOODLINE');
      // 140,000,000 halalas, one entitled head at deed weight 30 over Σ 30 ⇒ all of it to the family.
      expect(takerLine?.entitledMinor, entitlementOrder).toBe(0n);
      expect(result.totals.paidMinor, entitlementOrder).toBe(140_000_000n);
    }

    // ── AND THE UNREPAIRED PREMISES, still true, so the repair is not read as a general relaxation ──
    const untieredVariants: readonly BeneficiaryRaw[] = [
      // a FAMILY member with an edge but no ṭabaqa ⇒ TABAQA_MISMATCHES_LINEAGE_DEPTH on ذري
      patched(BEN_007, { id: 'ben-u', tabaqa: null, parentId: null, lineageLink: 'SON' }),
      // a FAMILY member with neither ⇒ LINEAGE_LINK_MISSING
      patched(BEN_007, { id: 'ben-u', tabaqa: null, parentId: null, lineageLink: null }),
      // an edgeless CATEGORY_ONLY placeholder
      patched(BEN_306, {
        id: 'ben-u',
        kind: 'CATEGORY_ONLY',
        category: 'orphans',
        tabaqa: null,
        parentId: null,
        lineageLink: null,
      }),
      // an untiered charitable jiha the deed does NOT name as its ultimate taker
      patched(BEN_006, { id: 'ben-u', tabaqa: null }),
    ];
    for (const waqfType of WAQF_TYPES) {
      for (const entitlementOrder of ['ORDERED', 'SHARED', 'LINEAGE_CONTINUATION'] as const) {
        for (const untiered of untieredVariants) {
          const outcome = outcomeOf({
            ...exampleDCharitable(),
            waqfType,
            entitlementOrder,
            continuationStipulation:
              entitlementOrder === 'LINEAGE_CONTINUATION' ? 'ZUHUR_AND_BUTUN' : null,
            // ⚠ NO مآل clause: that is what keeps these four variants refused, and stating it here is
            // the difference between "this cohort is illegal" and "this cohort is illegal WITHOUT a
            // recorded reversion" — which is the whole content of R7.
            reversion: null,
            beneficiaries: [tieredSon, untiered],
          });
          expect(outcome, `${waqfType}/${entitlementOrder}/${untiered.id}`).not.toBe('RESOLVED');
        }
      }
    }
  });
});

describe('the loss the refusal prevents, driven through the real entrypoint', () => {
  /**
   * ⚠ **INVERTED (2026-08-03).** The INPUT is verbatim what S3-D3's review measured the loss on —
   * `orderedCharitableInput()` with the jiha at `tabaqa: 2` beside two untiered jihas. MEASURED
   * BEFORE `TABAQA_ON_CHARITABLE_WAQF`: `SHART_INCOMPLETE` / **`JIHA_TIERED`**. MEASURED AFTER:
   * `SHART_INCOMPLETE` / **`TABAQA_ON_CHARITABLE_WAQF`**.
   *
   * The substance — *this input never computes and the jiha's 56,000,000 halalas are never
   * redistributed* — is unchanged and is still what the test proves. Only the rule that says so moved,
   * and the assertion names the new one rather than being loosened to a bare `SHART_INCOMPLETE`,
   * because a code-only assertion here is how a suite starts passing against the wrong refusal.
   */
  it('runDistribution refuses the exact input that used to hand the jiha share to the others', () => {
    expect(
      outcomeOf({
        ...orderedCharitableInput(),
        beneficiaries: [patched(BEN_006, { tabaqa: 2 }), BEN_306, BEN_307],
      }),
    ).toBe('TABAQA_ON_CHARITABLE_WAQF');
  });

  /** The mirror case — jiha senior to the rest. Same inversion, same input, same reasoning. */
  it('the mirror case — jiha senior to the rest — is refused too', () => {
    // MEASURED BEFORE: `JIHA_TIERED`, naming only `ben-006`. Here EVERY member is tiered, so the new
    // rule names all three offenders — the refusal got WIDER, not narrower.
    let caught: unknown;
    try {
      runDistribution({
        ...orderedCharitableInput(),
        beneficiaries: [
          patched(BEN_006, { tabaqa: 1 }),
          patched(BEN_306, { tabaqa: 2 }),
          patched(BEN_307, { tabaqa: 2 }),
        ],
      });
      expect.unreachable('runDistribution must refuse a tiered cohort on a وقف خيري');
    } catch (error) {
      caught = error;
    }
    if (!isDomainError(caught)) throw caught;
    expect(caught.code).toBe('SHART_INCOMPLETE');
    expect(caught.details).toMatchObject({
      refusal: 'TABAQA_ON_CHARITABLE_WAQF',
      offendingBeneficiaryIds: ['ben-006', 'ben-306', 'ben-307'],
    });
  });

  /**
   * The run the refusal must NOT break — and the figure RE-DERIVED, not carried over.
   *
   * The old assertion took 56_000_000n / '40.000000' from §08's joint 40/30/30 split. Those numbers
   * survive here, but from a different derivation and it has to be stated rather than assumed:
   * distributable 140_000_000n (revenue 180_000_000 − ṣiyāna 10_000_000 − operating 12_000_000 − fee
   * 18_000_000), deed weights [40, 30, 30] over Σ 100 ⇒ 140_000_000 × 40 / 100 = **56_000_000n**, and
   * sharePercent = 56_000_000 × 100 / 140_000_000 = **40.000000**. `SHARED` and `ORDERED` agree here
   * because no member is tiered, which is exactly the property under test.
   */
  it('the untiered jiha keeps exactly its deed share', () => {
    const result = runDistribution(orderedCharitableInput());
    const jiha = result.lines.find((line) => line.beneficiaryId === 'ben-006');
    expect(jiha?.status).toBe('PAID');
    expect(jiha?.entitledMinor).toBe(56_000_000n);
    expect(jiha?.sharePercent).toBe('40.000000');
    // And the other two are untouched: 140_000_000 × 30 / 100 = 42_000_000 each.
    expect(result.lines.map((line) => line.entitledMinor)).toEqual([
      56_000_000n,
      42_000_000n,
      42_000_000n,
    ]);
    // No exclusion happened at all — the point of "untiered is never tier-excluded".
    expect(result.totals.excludedCount).toBe(0);
  });
});
