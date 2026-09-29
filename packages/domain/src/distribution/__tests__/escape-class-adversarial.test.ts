/**
 * THE ESCAPE CLASS · is it gone by ANY route?
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠⚠ READ FIRST — THE SURROUNDING TEST LAYER WAS DESTROYED WHILE THIS FILE WAS BEING WRITTEN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * During the mutation sweep below, a `git checkout -- packages/domain/src/distribution/` was used to
 * revert a sentinel. It reverted the whole directory to HEAD, discarding the **uncommitted** S4 work
 * in it. Recovered byte-exact from scratchpad backups: `resolver.ts` (sha256 `f076e8f3…c41c`),
 * `invariants.ts` (`209322d5…6498`), `__tests__/arbitraries.ts` (`6cd3d19c…73cd`). `contract.ts` was
 * **reconstructed** from the verbatim text read earlier in the session — it typechecks and carries
 * both lost vocabulary members (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`,
 * `CHARITABLE_JIHA_ON_FAMILY_WAQF`) but is NOT byte-verified against the lost original.
 *
 * **LOST, with no backup — every one of these is at its pre-R6 HEAD version and must be regenerated:**
 * `acceptance.test.ts` · `contract.test.ts` · `distribution.property.test.ts` · `engine.test.ts` ·
 * `g9-adversarial.test.ts` · `jiha-tier-refusal.test.ts` · `lineage-adversarial.test.ts` ·
 * `lineage-entitlement.test.ts` · `resolver.test.ts` · `worked-examples.test.ts` ·
 * `fixtures/worked-examples.ts` · `fixtures/README.md`. Untouched (untracked): `r6-adversarial.test.ts`,
 * `frontier-adversarial.test.ts`, this file.
 *
 * **So a green run of THIS file is not a green suite.** The measurements recorded below were all taken
 * against the intact tree and are reported as measured; the mutation counts cannot be reproduced until
 * the test layer is restored. Nothing in the findings depends on the lost files — every figure here is
 * driven from `engine.ts` through this file's own fixtures.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE CLASS, STATED ONCE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * **A beneficiary the engine cannot place in the waqif's family tree takes ghallah that belongs to
 * the bloodline.**
 *
 * S3-D1 was one instance (an untiered `FAMILY` member escaping the ORDERED tier test and taking the
 * whole distributable). R6-D1 was the same *outcome* one `kind` field away (a `CHARITABLE_JIHA`
 * beside `CATEGORY_ONLY` placeholders on a ذري waqf). Three separate documents in this repo have
 * recorded the class as closed and all three measured false, so this file does not reason about the
 * mechanism at all. **It drives the cross-product and records what each cell does.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE PREDICATE — {@link unplacedPaidLines}
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `basis.lineageDepth` is non-null for exactly the members `buildLineage` certified as descendants of
 * the waqif: it is written from `lineage.depthById`, which is populated only for a member carrying a
 * `lineageLink` **whose whole ancestor chain terminates at a graph member** (anything else is refused
 * `LINEAGE_ROOTED_OUTSIDE_THE_WAQIF`), and whose declared ṭabaqa equals the derived depth. So
 * `lineageDepth === null` on a line that received a halala **is** "the engine paid someone it could
 * not place", read off the engine's own published basis rather than re-derived here.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * VERDICT — ⚠⚠ **UPDATED TWICE. ESC-1 IS CLOSED; R6-F1 IS NOW CLOSED TOO, AND THE CENSUS MOVED.**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The verdict below was written against the engine as it stood when this file was authored. ESC-1 was
 * then closed by `DESCENDANT_ON_CHARITABLE_WAQF` (`assertSingleWaqfNature`), and §1 and §3 were
 * inverted accordingly — inputs verbatim, every MEASURED figure preserved in the comment above the
 * assertion that replaced it. That pass recorded **2,592 cells → 2,106 refuse, 486 resolve, 54 of
 * which pay an unplaced line, all 54 the legal jiha-alone case.**
 *
 * ⚠⚠ **R6-F1 HAS SINCE BEEN CORRECTED IN `buildLineage` PASS 4, AND 72 CELLS MOVED.** The lineage
 * edge is now required from a `FAMILY` member on **every** waqf type (a bloodline member is a claim of
 * descent whatever the deed is typed) but from a `CATEGORY_ONLY` member **only on a `FAMILY_DHURRI`
 * waqf** — because on a خيري waqf eligibility does not come from descent at all, so demanding an edge
 * forced a fiction. **The current census is 2,592 cells → 2,034 refuse, 558 resolve, 114 of which pay
 * an unplaced line.** Every count below is re-derived by hand from the refusal precedence, not read
 * off the run; the moved slice is named cell-for-cell above the census assertion.
 *
 * ⚠ **The 60 newly-unplaced-paying cells are NOT an escape, and the distinction is the whole point of
 * this file.** The class is "a beneficiary the engine cannot place in the waqif's family tree takes
 * ghallah **that belongs to the bloodline**". On a وقف خيري there is no bloodline — `assertSingleWaqfNature`
 * refuses every خيري cohort that records one — so an unplaced `CATEGORY_ONLY` placeholder there is in
 * exactly the position the 54 jiha cells were always in: a legal payee of a charitable endowment with
 * no descent to record. §1 asserts that separation rather than assuming it: **no `FAMILY` member is
 * paid unplaced on any cell, and no `FAMILY_DHURRI` or `JOINT` cell has an unplaced payee at all.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠⚠ **R7 (product owner, 2026-08-10) DOUBLES THE GRID AND MAKES THE LAST SENTENCE ABOVE
 *     HALF-FALSE. IT IS RESTATED, NOT DELETED.**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A وقف ذري may name a charitable jiha as its **ultimate taker** (مآل الوقف), receiving nothing while any
 * descendant lives and taking the distributable once the bloodline is over. So the grid gains a
 * `reversion` axis — **5,184 cells** — and in the new half **8 `FAMILY_DHURRI` cells pay an unplaced
 * line** (measured at 24 when the axis went in; **R7-D1's fix took 16 of them**, see below). The claim
 * becomes: *no `FAMILY_DHURRI` or `JOINT` cell has an unplaced payee **except a recorded ultimate taker on
 * a run where no descendant was paid***.
 *
 * That is a restatement, not a relaxation, and the class's own words are why: on all 8 the recorded
 * bloodline is over — every descendant `EXCLUDED` holding `0n` — so there is no bloodline entitlement for
 * the charity to take. The refined predicate is asserted with **both** conjuncts (named in the clause,
 * AND no placed member paid in the same run), because either alone is satisfiable by a real escape: the
 * first alone would excuse any unplaced payee on a deed that happens to have a clause, and the second
 * alone is what R6-D1/ESC-1's measured 13,750,000-halala diversion violated.
 *
 * ⚠ The axis went in for **R6-C1's** reason, and the lesson is worth restating because it applies to a
 * hand-written enumeration exactly as it does to a generator: *a grid that cannot reach a configuration
 * reports its silence as success, at scale.* The 2,592-cell version stayed green while being blind to
 * every legal charity-on-a-ذري-waqf cohort R7 had just created. **Every pre-R7 count in this file is
 * preserved at its measured population** by being asserted over `NO_MAAL_CELLS` rather than re-derived to
 * absorb the new axis — the reversion half's census is derived from scratch in its own test, so the audit
 * trail of eight hand-derived counts is not overwritten by a ninth pass of arithmetic.
 *
 * The مآل half: JOINT 864 · `REVERSION_ON_CHARITABLE_WAQF` 864 · `REVERSION_ULTIMATE_TAKER_UNKNOWN` 432 ·
 * `LINEAGE_LINK_MISSING` 144 · `REVERSION_WITH_NO_RECORDED_BLOODLINE` 72 ·
 * `CONTINUATION_STIPULATION_UNRECOGNISED` 36 · RESOLVED **164** (of which the 8 above) ·
 * **`DISTRIBUTION_INVARIANT_BREACH` 16**. Four refusals are **absent** from that half — the three R7
 * narrowed plus `TABAQA_ON_CHARITABLE_WAQF`, which the clause check precedes — and each is asserted still
 * to fire in the other half, so none has been switched off.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠⚠ **R7-D1 · CLOSED (16 cells stopped paying) · R7-D2 · MEASURED, NOT ENDORSED (the same 16)**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A `CATEGORY_ONLY` record is a **placeholder** for descendants not yet enumerated. R6 forces a lineage
 * edge onto it on a ذري waqf, so it counts as recorded bloodline — and the extinction trigger read its
 * `active: false` as a death. *A placeholder is sound evidence FOR a living bloodline and no evidence at
 * all AGAINST one*, so the 16 cells whose extinct register bore one (cohorts {C,J} and {F,C,J} at the
 * `FULL` edge, `ALL_DEAD`, × 8 order/continuation combinations) used to pay their charity the whole pool —
 * measured on the sibling fixture at **27,500,000 of 27,500,000 halalas**. They no longer pay anybody.
 *
 * ⚠ But they now fail as `DISTRIBUTION_INVARIANT_BREACH` rather than retaining the pool with a reason:
 * `resolver.reversionOutcome` holds the trigger while `invariants.independentReversionState` still
 * recomputes it as fired, so `I-R1`'s flag cross-check refuses to emit the run. No halala moves, and the
 * grid keeps that population **bounded and named** (`R7-D1 · the 16 …`) instead of asserting it correct.
 * The contract it violates is pinned RED in `reversion-adversarial.test.ts` §7.
 *
 * ⚠ Three things must NOT be read as resolved by ESC-1's closure:
 *  · the **underlying disagreement** — the mixing checks key on `kind` and on the declared type,
 *    never on membership of the lineage graph — is unrepaired; the new rule keys on the
 *    `lineageLink` field, which is a proxy;
 *  · whether a `CATEGORY_ONLY` member carrying a lineage edge **is** a family leg is still an
 *    unanswered fiqh/product question (binding rule 4);
 *  · R6-F1's closure narrows the `CATEGORY_ONLY` reach of R6, which was engineering's extension of the
 *    owner's rule in the first place. It does **not** answer that question — it removes the shape that
 *    had no legal form at all. The `TODO(surface)` on both rules stands.
 *
 * ── THE ORIGINAL VERDICT, KEPT VERBATIM ──────────────────────────────────────────────────────
 * 2 592 cells driven (§1). 1 998 refuse, 594 resolve. Of the 594, **72 pay a line the engine cannot
 * place**, and every one of the 72 is a `CHARITABLE_JIHA` on a `PUBLIC_CHARITABLE` (خيري) waqf —
 * which is legal and must stay legal. **No `FAMILY_DHURRI` and no `JOINT` cell resolves with an
 * unplaced paid line at all**, which is R6-D1's closure holding.
 *
 * But 18 of those 72 are a jiha standing **beside members the engine has itself certified as
 * descendants of the waqif** — `CATEGORY_ONLY` placeholders at derived ṭabaqāt 1 and 2, with
 * `lineageDepth` and `lineageLink: 'SON'` printed on the BR-505 basis their Arabic statement carries.
 * In 12 of the 18 a certified descendant is paid beside the charity; in the other 6 every certified
 * descendant is EXCLUDED and the charity takes the whole pool.
 * MEASURED on that cell (§3): the jiha is `PAID` **13,750,000 of 27,500,000** halalas beside a living
 * ṭabaqa-1 descendant; at deed weight 90 it takes **24,750,000 of 27,500,000**; and with both
 * certified descendants dead it takes **27,500,000 of 27,500,000** while they are `EXCLUDED /
 * TABAQA_EXTINCT` — an untiered payee taking the pool the tier test was deciding, which is S3-D1's
 * outcome sentence verbatim. The only run flag is `UNVERIFIED_FIGURES_APPLIED`, and I5 is reported as
 * checked.
 *
 * **Why it survives:** `CHARITABLE_JIHA_ON_FAMILY_WAQF` keys on the DECLARED TYPE and
 * `COHORT_MIXES_CHARITABLE_AND_FAMILY` keys on `kind === 'FAMILY'`. Neither keys on the thing that
 * actually says "bloodline" — membership of the lineage graph. R6-D1's underlying disagreement (the
 * mixing check and `buildLineage` do not agree on what a family leg is) is therefore **not repaired**;
 * the new refusal closed the ذري arm of it, and the خيري arm is one `waqfType` field away, exactly as
 * R6-D1 was one `kind` field away from the route R6 had just closed.
 *
 * ⚠ **NOT FIXED HERE, and deliberately.** Whether a `CATEGORY_ONLY` member carrying a lineage edge is
 * a family leg — and therefore whether the mixing check should key on the lineage graph rather than on
 * `kind` — is a fiqh/product question (CLAUDE.md binding rule 4), and it interacts with **R6-F1**
 * (`r6-adversarial.test.ts` §5: R6 forces a خيري waqf's unnamed segment to be recorded as a child of
 * the waqif, so some of these "descendants" are fictions the engine itself demanded). Resolving it in
 * a code change would be picking a reading of the deed. It is measured, pinned and surfaced.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT PROVES THE NEGATIVE, AND WHAT ITS BOUNDS ARE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §1 is an enumeration, not an argument: every combination of `waqfType` (3) × `entitlementOrder` (4)
 * × `continuationStipulation` (3) × cohort composition (all 8 subsets of {FAMILY, CATEGORY_ONLY,
 * CHARITABLE_JIHA}) × lineage completeness (3) × liveness (3) is constructed and run, and the
 * predicate is applied to **every** resolving cell. Its bounds, stated so nobody reads more into it:
 *
 *  · **Depth ≤ 2 and ≤ 2 members per kind.** The eligibility rules that could hide an escape are the
 *    tier test, the ẓuhūr filter and the living-ancestor frontier, and all three are exercised by a
 *    two-generation tree; deeper trees are driven by `lineage-adversarial.test.ts` and the 10 000-run
 *    leakage property. What this grid cannot see is an escape that needs three generations.
 *  · **`lineageLink` is `SON` throughout.** A `DAUGHTER` link changes *who is excluded* under
 *    `ZUHUR_ONLY`; it cannot make an excluded member into an unplaced one, because the link is what
 *    puts them in the graph in the first place. `BUTUN_LINE_NOT_CONTINUED` coverage lives in
 *    `lineage-entitlement.test.ts`.
 *  · **One money shape** (Example A's 27,500,000). The predicate is about *who* is on a paid line, not
 *    how much; the waterfall has its own suite.
 *  · An `entitlementOrder` outside the four, a malformed lineage graph, a duplicate id and a tiered
 *    jiha are all refused by discriminators driven elsewhere and are not re-driven here.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MUTATION-VERIFIED (this pass, 2026-08-09)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  · Disabling the `input.waqfType === 'FAMILY_DHURRI' && charitableJihaCount > 0` block in
 *    `assertSingleWaqfNature` turns **14 tests red across 5 files** — `r6-adversarial` §2 (7) and §3
 *    (1), `worked-examples`, `engine`, `lineage-adversarial` §9 (2) and `distribution.property` (2) —
 *    plus §2 and §5 of this file. The refusal is load-bearing, not decorative.
 *  · Dropping the `waqfType: 'FAMILY_DHURRI'` override from `arbCharitableJihaOnFamilyWaqfCase`
 *    reddens the R6-D1 property immediately (`expected 'PUBLIC_CHARITABLE' to be 'FAMILY_DHURRI'`);
 *    narrowing `arbRefusedNatureInput`'s `pick` from 0–4 to 0–2 reddens the census
 *    (`expected 0 to be greater than 50`). The coverage minimums genuinely fail when the shape stops
 *    being generated — they are not silence reported as success.
 *  · Measured directly rather than read off the code: 2 000 draws of
 *    `arbCharitableJihaOnFamilyWaqfCase` are **2 000/2 000** `FAMILY_DHURRI` + ≥1 jiha + **0**
 *    `FAMILY`, spread ~500 per order over all four orders, 407 of them the jiha-alone shape and 1 486
 *    carrying a living placeholder. 2 000 draws of `arbRefusedNatureInput` yield 353
 *    `CHARITABLE_JIHA_ON_FAMILY_WAQF` (≈17.6%, so ≈141 at the property's 800 runs, against a floor of
 *    50). R6-C1's blind spot is genuinely closed at the generator.
 *  · `resolver.ts` restored byte-identically after every mutation — sha256 `f076e8f3…c41c`;
 *    `arbitraries.ts` likewise, sha256 `6cd3d19c…73cd`.
 *
 * Every figure below is derived by hand in halalas, with the arithmetic in a comment. All data
 * invented; nothing is read from `archive/raw-intake/`.
 */
import { describe, expect, it } from 'vitest';

import { isDomainError } from '../../errors.js';
import type { DomainError } from '../../errors.js';
import { runDistribution } from '../engine.js';
import type {
  DistributionInputRaw,
  DistributionLine,
  DistributionResult,
  Minor,
  ShartRefusal,
} from '../contract.js';
import {
  BENEFICIARY_KINDS,
  CONTINUATION_STIPULATIONS,
  ENTITLEMENT_ORDERS,
  LINEAGE_LINKS,
  WAQF_TYPES as CONTRACT_WAQF_TYPES,
} from '../contract.js';
import { beneficiary, exampleA, patched } from './fixtures/worked-examples.js';

type Raw = DistributionInputRaw['beneficiaries'][number];

/**
 * Example A's waterfall, by hand, in halalas:
 *
 *   revenue                       35,000,000
 *   − ṣiyāna (FIXED)             − 4,000,000
 *   − operating                  −         0
 *   = net income                  31,000,000
 *   − Nazir fee 10% of REVENUE   − 3,500,000   (⚠ ʿushr — set by THIS deed, unverified)
 *   = distributable               27,500,000
 */
const DISTRIBUTABLE = 27_500_000n as Minor;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The predicate, and the cast
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The escape-class predicate: the lines that received entitlement and whom the engine could **not**
 * place in the waqif's family tree.
 *
 * `WITHHELD` and `CROSS_BORDER_PENDING` count exactly like `PAID` — a gate stamps a status, it never
 * moves an amount (I6), so a withheld line is still ghallah attached to that beneficiary and taken
 * from the cohort's denominator. `EXCLUDED` lines carry 0 and cannot be an escape.
 */
function unplacedPaidLines(result: DistributionResult): readonly DistributionLine[] {
  return result.lines.filter(
    (line) => (line.entitledMinor as bigint) > 0n && line.basis.lineageDepth === null,
  );
}

/** Every line that received entitlement, placed or not. */
function payees(result: DistributionResult): readonly DistributionLine[] {
  return result.lines.filter((line) => (line.entitledMinor as bigint) > 0n);
}

function statusesById(result: DistributionResult): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of result.lines) {
    out[line.beneficiaryId] =
      `${line.status}/${line.reasonCode ?? 'null'}:${String(line.entitledMinor)}`;
  }
  return out;
}

function expectRefused(input: DistributionInputRaw, refusal: ShartRefusal): DomainError {
  try {
    runDistribution(input);
  } catch (error) {
    if (!isDomainError(error)) throw error;
    expect(error.code).toBe('SHART_INCOMPLETE');
    // Never a bare SHART_INCOMPLETE: twenty-six refusals share that code, so a code-only assertion
    // passes against whichever check happens to fire first — which is how a suite goes green for the
    // wrong reason when a refusal moves earlier. R6-D1's closure did exactly that.
    expect(error.details).toMatchObject({ refusal });
    // Returned so a caller can also assert WHO the refusal names — a refusal nobody can act on is
    // half a refusal, and `DESCENDANT_ON_CHARITABLE_WAQF` names the recorded descendants.
    return error;
  }
  expect.unreachable(`the run must be refused with ${refusal}`);
  throw new Error('unreachable');
}

/** A descendant of the waqif, placeable: real edge, declared ṭabaqa equal to the derived depth. */
function placed(
  id: string,
  kind: 'FAMILY' | 'CATEGORY_ONLY',
  depth: 1 | 2,
  parentId: string | null,
  active: boolean,
): Raw {
  return beneficiary({
    id,
    kind,
    active,
    tabaqa: depth,
    parentId,
    lineageLink: 'SON',
    line: 'ZUHUR',
    branch: 'Branch A',
    stipulatedWeight: '10',
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: '2026-01-15',
    // A CATEGORY_ONLY line with no captured category is CATEGORY_NOT_CAPTURED-gated, which would make
    // half this grid prove the gate rather than the entitlement. Captured, so the money moves.
    category: kind === 'CATEGORY_ONLY' ? 'descendants of Branch A not yet enrolled' : null,
    residency: 'DOMESTIC',
    disbursingEntity: null,
    bankingRefForProceeds: `FAKE-IBAN-${id}`,
  });
}

/** A licensed, KYC-fresh charitable jiha — untiered and edgeless, as every jiha must be. */
const JIHA: Raw = beneficiary({
  id: 'esc-jiha',
  kind: 'CHARITABLE_JIHA',
  active: true,
  tabaqa: null,
  parentId: null,
  lineageLink: null,
  line: 'NA',
  branch: 'Charitable',
  stipulatedWeight: '10',
  verificationStatus: 'VERIFIED',
  kycLastRefreshed: '2026-03-05',
  category: null,
  residency: 'DOMESTIC',
  disbursingEntity: {
    name: 'Escape-probe Jiha (fictional)',
    licensed: true,
    licenceExpiry: '2027-06-30',
  },
  bankingRefForProceeds: 'FAKE-IBAN-ESCJ',
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · the full cross-product, enumerated in code
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const WAQF_TYPES = ['PUBLIC_CHARITABLE', 'FAMILY_DHURRI', 'JOINT'] as const;
const ORDERS = ['LINEAGE_CONTINUATION', 'ORDERED', 'SHARED', 'NA_DIRECT_USE'] as const;
const CONTINUATIONS = [null, 'ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] as const;
/** All eight subsets of the three beneficiary kinds, including the empty cohort. */
const KIND_SETS = [
  [],
  ['FAMILY'],
  ['CATEGORY_ONLY'],
  ['CHARITABLE_JIHA'],
  ['FAMILY', 'CATEGORY_ONLY'],
  ['FAMILY', 'CHARITABLE_JIHA'],
  ['CATEGORY_ONLY', 'CHARITABLE_JIHA'],
  ['FAMILY', 'CATEGORY_ONLY', 'CHARITABLE_JIHA'],
] as const;
/**
 * Lineage completeness of the FAMILY/CATEGORY_ONLY members. `NO_LINK_WITH_TABAQA` is the S3-D1 shape
 * with a tier declared; `NO_LINK_NO_TABAQA` is it without one. A jiha is unaffected by this axis —
 * it never carries either field.
 */
const EDGES = ['FULL', 'NO_LINK_NO_TABAQA', 'NO_LINK_WITH_TABAQA'] as const;
/** Vital status of the two generations: both live, the depth-1 head dead, or the whole line dead. */
const LIVENESS = ['ALL_LIVE', 'HEAD_DEAD', 'ALL_DEAD'] as const;
/**
 * **R7** · the deed's مآل clause — absent, or naming {@link JIHA} as this endowment's ultimate taker.
 *
 * ⚠ **This axis went in because R6-C1's lesson applies to a hand-written enumeration exactly as it does
 * to a generator: a grid that cannot reach a configuration reports its silence as success, at scale.**
 * The 2,592-cell grid was green over a surface that could no longer contain a LEGAL charity-on-a-ذري-waqf
 * cohort at all, because R7 made that shape depend on a field the grid did not vary. The axis doubles the
 * grid to 5,184 cells and — measured below — added **24 cells that pay an unplaced line on a
 * `FAMILY_DHURRI` waqf**, which §1's central claim previously asserted could not exist. ⚠ **R7-D1's fix
 * took 16 of those 24**: an extinct register bearing a `CATEGORY_ONLY` placeholder can no longer certify
 * its own extinction, so **8** remain and the 16 are enumerated in their own test.
 *
 * It names the jiha by id whether or not the cohort holds one, deliberately: the cells whose cohort has
 * no jiha then become a legitimate probe of `REVERSION_ULTIMATE_TAKER_UNKNOWN` rather than a hole.
 */
const REVERSIONS = [
  null,
  { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: ['esc-jiha'] },
] as const;

function unlinked(member: Raw, keepTabaqa: boolean): Raw {
  return patched(member, {
    lineageLink: null,
    parentId: null,
    tabaqa: keepTabaqa ? member.tabaqa : null,
  });
}

function cohortFor(
  kinds: readonly string[],
  edge: (typeof EDGES)[number],
  liveness: (typeof LIVENESS)[number],
): readonly Raw[] {
  const headAlive = liveness === 'ALL_LIVE';
  const leafAlive = liveness !== 'ALL_DEAD';
  const out: Raw[] = [];
  const add = (prefix: string, kind: 'FAMILY' | 'CATEGORY_ONLY'): void => {
    const head = placed(`${prefix}1`, kind, 1, null, headAlive);
    const leaf = placed(`${prefix}2`, kind, 2, `${prefix}1`, leafAlive);
    if (edge === 'FULL') out.push(head, leaf);
    else {
      const keep = edge === 'NO_LINK_WITH_TABAQA';
      out.push(unlinked(head, keep), unlinked(leaf, keep));
    }
  };
  if (kinds.includes('FAMILY')) add('esc-f', 'FAMILY');
  if (kinds.includes('CATEGORY_ONLY')) add('esc-c', 'CATEGORY_ONLY');
  if (kinds.includes('CHARITABLE_JIHA')) out.push(JIHA);
  return out;
}

interface Cell {
  readonly waqfType: (typeof WAQF_TYPES)[number];
  readonly order: (typeof ORDERS)[number];
  readonly kinds: readonly string[];
  /** **R7** · whether this cell's deed records a مآل clause naming {@link JIHA}. */
  readonly reversionRecorded: boolean;
  readonly key: string;
  readonly outcome: string;
  readonly unplaced: readonly string[];
  readonly placedPayees: readonly string[];
}

/** Drive every cell once. Deterministic; no generator, no seed, nothing sampled. */
function driveCrossProduct(): readonly Cell[] {
  const cells: Cell[] = [];
  for (const waqfType of WAQF_TYPES)
    for (const order of ORDERS)
      for (const continuationStipulation of CONTINUATIONS)
        for (const kinds of KIND_SETS)
          for (const edge of EDGES)
            for (const liveness of LIVENESS)
              for (const reversion of REVERSIONS) {
                const reversionRecorded = reversion !== null;
                const key = [
                  waqfType,
                  order,
                  continuationStipulation ?? 'null',
                  kinds.join('+') || 'EMPTY',
                  edge,
                  liveness,
                  reversionRecorded ? 'MAAL' : 'noMaal',
                ].join(' | ');
                const input = {
                  ...exampleA(),
                  waqfType,
                  entitlementOrder: order,
                  continuationStipulation,
                  reversion,
                  beneficiaries: cohortFor(kinds, edge, liveness),
                } as DistributionInputRaw;
                try {
                  const result = runDistribution(input);
                  cells.push({
                    waqfType,
                    order,
                    kinds,
                    reversionRecorded,
                    key,
                    outcome: 'RESOLVED',
                    unplaced: unplacedPaidLines(result).map((line) => line.beneficiaryId),
                    placedPayees: payees(result)
                      .filter((line) => line.basis.lineageDepth !== null)
                      .map((line) => line.beneficiaryId),
                  });
                } catch (error) {
                  if (!isDomainError(error)) throw error;
                  const refusal = (error.details as { refusal?: string } | undefined)?.refusal;
                  if (error.code !== 'SHART_INCOMPLETE') {
                    /*
                     * ⚠⚠ **R7-D2 · A NON-REFUSAL FAILURE IS NOW RECORDED AS A CENSUS OUTCOME INSTEAD OF
                     * ABORTING THE GRID — and that change is itself a finding, not a convenience.**
                     *
                     * This branch used to be `expect(error.code).toBe('SHART_INCOMPLETE')`, which is the
                     * right claim: a deed record is either legible or refused with a discriminator, and an
                     * engine that reports itself broken on a legal input is a defect. But it aborted
                     * `driveCrossProduct` at MODULE LOAD, so the whole file — 5,184 cells and every other
                     * section — stopped collecting and reported as one failed suite. Losing an adversarial
                     * file's entire coverage to hide one measurement is the worse trade.
                     *
                     * So the code is recorded as the cell's outcome and the population is named, counted
                     * and bounded in its own test below (`R7-D2 · the 16 …`). **It is NOT asserted to be
                     * correct** — that test's own comment says what must replace it, and the contract it
                     * violates is pinned RED in `reversion-adversarial.test.ts` §7.
                     */
                    cells.push({
                      waqfType,
                      order,
                      kinds,
                      reversionRecorded,
                      key,
                      outcome: error.code,
                      unplaced: [],
                      placedPayees: [],
                    });
                    continue;
                  }
                  cells.push({
                    waqfType,
                    order,
                    kinds,
                    reversionRecorded,
                    key,
                    outcome: refusal ?? 'SHART_INCOMPLETE(no discriminator)',
                    unplaced: [],
                    placedPayees: [],
                  });
                }
              }
  return cells;
}

const CELLS = driveCrossProduct();

/**
 * **R7** · the grid's two halves.
 *
 * Every claim §1 made before R7 was derived over a grid in which no deed recorded a مآل clause, and each
 * one is kept at **exactly its measured population** by being asserted over {@link NO_MAAL_CELLS} rather
 * than loosened to fit a doubled grid. That is the difference between preserving a measurement and
 * quietly widening it until it still passes. The new half's census, the 8 cells that break §1's central
 * claim, and R7-D1's 16, are derived separately below.
 */
const NO_MAAL_CELLS = CELLS.filter((cell) => !cell.reversionRecorded);
const MAAL_CELLS = CELLS.filter((cell) => cell.reversionRecorded);

describe('1 · the full cross-product — every cell driven, every resolving cell tested', () => {
  it('drives exactly 3 × 4 × 3 × 8 × 3 × 3 × 2 = 5,184 cells', () => {
    // 3 waqf types × 4 orders × 3 continuation values × 8 cohort compositions × 3 lineage-completeness
    // values × 3 liveness values × **2 reversion values (R7)** = 5,184. Pinned so a dimension silently
    // dropped shows up here — which is precisely what would have happened to the reversion axis, since
    // the grid was green without it while being blind to the whole configuration R7 introduced.
    expect(CELLS).toHaveLength(5_184);
    expect(new Set(CELLS.map((cell) => cell.key)).size).toBe(5_184);
    // The two halves are equal by construction, and asserted so a filter typo cannot shrink one.
    expect(NO_MAAL_CELLS).toHaveLength(2_592);
    expect(MAAL_CELLS).toHaveLength(2_592);
  });

  /**
   * The census, every count derived by hand from the refusal precedence in `assertSingleWaqfNature`
   * (JOINT → mixed cohort → jiha-on-family → lineage-order-on-charity), then `buildLineage`:
   *
   *  · `WAQF_TYPE_JOINT_NOT_SUPPORTED` — refused first and unconditionally:
   *    1 type × 4 orders × 3 cont × 8 kinds × 3 edges × 3 live = **864**
   *  · `COHORT_MIXES_CHARITABLE_AND_FAMILY` — jiha AND family present, on the two legal types.
   *    Cohorts with both = {F+J, F+C+J} = 2: 2 × 4 × 3 × 2 × 3 × 3 = **432**
   *  · `CHARITABLE_JIHA_ON_FAMILY_WAQF` — ذري, jiha present, no FAMILY. Cohorts = {J, C+J} = 2:
   *    1 × 4 × 3 × 2 × 3 × 3 = **216**
   *  · `LINEAGE_ORDER_ON_CHARITABLE_WAQF` — خيري under the lineage order, whatever the cohort, minus
   *    the 2 mixed cohorts already refused: 1 × 1 × 3 × 6 × 3 × 3 = **162**
   *  · `CONTINUATION_STIPULATION_UNRECOGNISED` — only what is left under the lineage order: ذري with
   *    no jiha (4 cohorts) and a null term: 1 × 1 × 1 × 4 × 3 × 3 = **36**
   *  · `LINEAGE_LINK_MISSING` — an unlinked FAMILY/CATEGORY_ONLY member wherever the edge is still
   *    REQUIRED (2 of the 3 edge values; never on `NA_DIRECT_USE`. ⚠ The reason given here was "which
   *    short-circuits first", i.e. before `buildLineage` ran at all — false since memo Q7, 2026-08-17:
   *    `buildLineage` now runs above the short-circuit and its contradiction refusals fire on a
   *    direct-use deed. What the short-circuit outranks is pass 4 alone, because R6's edge requirement is
   *    a completeness check whose stated reason is that the engine will not pay someone it cannot place.
   *    Every count in this census is unchanged — the edge axis only ever STRIPS a link, and never builds
   *    a contradiction):
   *    خيري ORDERED/SHARED 2 × 4 cohorts × 3 × 2 × 3 = 144, ذري ORDERED/SHARED 2 × 3 × 3 × 2 × 3 = 108,
   *    ذري lineage 3 × 2 × 2 × 3 = 36 ⇒ **288**
   *  · RESOLVED = 2,592 − 864 − 432 − 216 − 162 − 36 − 288 = **594**
   */
  /**
   * ⚠ **UPDATED FOR ESC-1's CLOSURE — and the deltas are derived by hand, not read off the run.**
   *
   * `DESCENDANT_ON_CHARITABLE_WAQF` is new and takes 144 cells:
   *   خيري (864) minus the mixed cohorts `COHORT_MIXES` already refuses ({F,J}, {F,C,J} = 216) leaves
   *   648. ESC-1 needs ≥1 recorded `lineageLink`, i.e. a cohort containing `FAMILY` or
   *   `CATEGORY_ONLY` — of the 6 surviving subsets that is {F}, {C}, {F,C}, {C,J} = **4** — and the
   *   `FULL` edge value, which is the only one of the 3 that records a link:
   *     4 cohorts × 4 orders × 3 continuations × 1 edge × 3 liveness = **144**.
   *
   * `LINEAGE_ORDER_ON_CHARITABLE_WAQF` falls 162 → 126, because ESC-1 is checked FIRST and absorbs
   * the خيري × `LINEAGE_CONTINUATION` × (F|C cohort) × FULL cells:
   *     4 cohorts × 3 continuations × 1 edge × 3 liveness = **36**, and 162 − 36 = 126.
   *
   * `RESOLVED` falls 594 → 486: of ESC-1's 144, 36 were already refusals, so 108 are newly refused.
   * `LINEAGE_LINK_MISSING` is unchanged at 288 — it fires on the two edge values that record NO link,
   * which is exactly the complement of the set ESC-1 takes.
   */
  /**
   * ⚠⚠ **UPDATED AGAIN FOR R6-F1's CLOSURE. EXACTLY ONE COUNT MOVES, AND IT IS DERIVED BY HAND.**
   *
   * `buildLineage` pass 4 now requires the lineage edge from a `FAMILY` member on every waqf type, and
   * from a `CATEGORY_ONLY` member **only on a `FAMILY_DHURRI` waqf**. Nothing else in the precedence
   * chain changed, so the five Stage-0 refusals are untouched — JOINT (864), `COHORT_MIXES` (432),
   * ESC-1 (144), R6-D1 (216) and `LINEAGE_ORDER_ON_CHARITABLE_WAQF` (126) all fire *before*
   * `buildLineage` is reached, and `CONTINUATION_STIPULATION_UNRECOGNISED` (36) fires between them.
   *
   * `LINEAGE_LINK_MISSING` falls **288 → 216**, re-derived from scratch rather than adjusted:
   *
   *   · **خيري** — only a `FAMILY` member still needs the edge. Cohorts holding one and surviving the
   *     earlier refusals are {F} and {F,C} = **2**; the edge must be absent, which is 2 of the 3 edge
   *     values; and the edge is only DEMANDED under ORDERED/SHARED (`LINEAGE_CONTINUATION` on a
   *     خيري waqf is refused at Stage 0; `NA_DIRECT_USE` outranks pass 4 — ⚠ this read "short-circuits
   *     before the graph", which memo Q7 made false: the graph is built there now, only its
   *     completeness pass is skipped):
   *       2 orders × 2 cohorts × 3 continuations × 2 edges × 3 liveness = **72** (was 144).
   *   · **ذري** — unchanged, because `CATEGORY_ONLY` still needs the edge on a family waqf. Cohorts
   *     {F}, {C}, {F,C} = 3:
   *       ORDERED+SHARED  2 × 3 × 3 cont × 2 edges × 3 live = 108
   *       LINEAGE          1 × 3 × 2 cont × 2 edges × 3 live =  36   (the null term already refused)
   *     ⇒ 144. Total 72 + 144 = **216**.
   *
   * `RESOLVED` rises **486 → 558** — the same 72 cells and no others, so the two deltas must be equal
   * and are asserted to be.
   *
   * ═══ WHICH CELLS MOVED, EXACTLY ═══
   * خيري × {ORDERED, SHARED} × cohorts **{C}** and **{C,J}** × 3 continuations × the 2 edge values
   * that record NO link × 3 liveness = 2 × 2 × 3 × 2 × 3 = **72**. In words: *a charitable endowment
   * whose beneficiary is an unnamed segment — with or without a jiha beside it — used to be refused for
   * not descending from the waqif, and now computes.* Nothing on a `FAMILY_DHURRI` or `JOINT` waqf
   * moved, and nothing at the `FULL` edge value moved (those cells are ESC-1's, and ESC-1 still
   * refuses them).
   */
  /**
   * ⚠⚠⚠ **UPDATED FOR `TABAQA_ON_CHARITABLE_WAQF` (product owner, 2026-08-03). FOUR COUNTS MOVE AND
   * ONE REFUSAL DISAPPEARS FROM THE GRID ENTIRELY — every figure re-derived by hand, not read off the
   * run, and the run then agreed with all eight.**
   *
   * The rule: on a `PUBLIC_CHARITABLE` waqf, **no** beneficiary may carry a `tabaqa`. It sits in
   * `assertSingleWaqfNature` after the JOINT and mixed-cohort checks and **before** ESC-1, R6-D1 and
   * the lineage-order check. On this grid only a `FAMILY`/`CATEGORY_ONLY` member ever carries a
   * ṭabaqa (a jiha's is always null), and it carries one at 2 of the 3 `EDGES` values — `FULL` and
   * `NO_LINK_WITH_TABAQA`; `NO_LINK_NO_TABAQA` strips it.
   *
   *  · **`TABAQA_ON_CHARITABLE_WAQF` = 288, new.** خيري is 864 cells; `COHORT_MIXES` already takes its
   *    {F,J} and {F,C,J} share (2 kinds × 4 orders × 3 cont × 3 edges × 3 live = 216), leaving 648 to
   *    reach the new check. Of the 6 surviving kind subsets — {}, {F}, {C}, {J}, {F,C}, {C,J} — the
   *    four holding a ṭabaqa-bearing member are {F}, {C}, {F,C}, {C,J}:
   *      4 kinds × 4 orders × 3 continuations × 2 edges × 3 liveness = **288**.
   *
   *  · **`DESCENDANT_ON_CHARITABLE_WAQF` = 144 → 0. It vanishes from the grid.** Every cell it held
   *    was خيري × (F|C cohort) × the `FULL` edge — and `FULL` records the ṭabaqa *and* the link, so
   *    the new rule takes all 144 first. ⚠ ESC-1 is **not** dead in general: the shape that still
   *    reaches it is a link recorded WITHOUT a ṭabaqa, which this grid has no axis value for. It is
   *    driven directly in §3 rather than left unasserted, because a refusal with no test is a refusal
   *    that gets deleted by the next reader.
   *
   *  · **`LINEAGE_ORDER_ON_CHARITABLE_WAQF` = 126 → 90.** 162 خيري × `LINEAGE_CONTINUATION` cells
   *    survive `COHORT_MIXES`; the ṭabaqa rule now takes 4 kinds × 3 cont × 2 edges × 3 live = **72**
   *    of them, where ESC-1 previously took only the 36 at the `FULL` edge. 162 − 72 = **90**.
   *
   *  · **`LINEAGE_LINK_MISSING` = 216 → 180.** Its ذري half (144) is untouched — the new rule keys on
   *    خيري. Its خيري half falls 72 → **36**, because only the `NO_LINK_NO_TABAQA` edge value now
   *    reaches `buildLineage` at all: 2 orders × 2 cohorts ({F}, {F,C}) × 3 cont × 1 edge × 3 live.
   *
   *  · **`RESOLVED` = 558 → 486.** Of the ṭabaqa rule's 288 cells, 144 + 36 + 36 = 216 were already
   *    refusals, so **72** are newly refused out of RESOLVED. 558 − 72 = 486, and the four deltas are
   *    asserted to add back to 288 rather than each being an independent edit.
   *
   * ═══ WHICH 72 CELLS MOVED OUT OF RESOLVED, EXACTLY ═══
   * All 72 are خيري at the `NO_LINK_WITH_TABAQA` edge — the `FULL` edge contributed none, because
   * ESC-1 was already refusing every one of those. They split into two disjoint halves:
   *
   *   · **36 · `NA_DIRECT_USE`**, all four ṭabaqa-bearing cohorts {F}, {C}, {F,C}, {C,J}:
   *     4 kinds × 1 order × 3 continuations × 1 edge × 3 liveness = 36. These resolved because I7
   *     short-circuited before `buildLineage`; they no longer do, because the ṭabaqa rule is a
   *     Stage-0 fact about the waqf's NATURE and outranks the short-circuit — the same precedence
   *     `WAQF_TYPE_JOINT_NOT_SUPPORTED` already established.
   *   · **36 · {ORDERED, SHARED} × the placeholder cohorts {C} and {C,J}**:
   *     2 kinds × 2 orders × 3 continuations × 1 edge × 3 liveness = 36. These are exactly half of
   *     the 72 R6-F1 moved IN, and it is the informative half.
   *
   * In one sentence: *an unnamed charitable segment is still representable, but it may no longer be
   * recorded as sitting in a generation.*
   */
  it('the outcome census is exactly as the refusal precedence predicts', () => {
    const census: Record<string, number> = {};
    // ⚠ Over the NO-مآل half only. Every derivation above was measured on a grid where no deed recorded
    // a reversion, and re-deriving eight counts to absorb a new axis would destroy the audit trail that
    // makes them claims rather than transcriptions. R7's half is derived from scratch in its own test.
    for (const cell of NO_MAAL_CELLS) census[cell.outcome] = (census[cell.outcome] ?? 0) + 1;
    expect(census).toStrictEqual({
      RESOLVED: 486,
      WAQF_TYPE_JOINT_NOT_SUPPORTED: 864,
      COHORT_MIXES_CHARITABLE_AND_FAMILY: 432,
      TABAQA_ON_CHARITABLE_WAQF: 288,
      CHARITABLE_JIHA_ON_FAMILY_WAQF: 216,
      LINEAGE_ORDER_ON_CHARITABLE_WAQF: 90,
      CONTINUATION_STIPULATION_UNRECOGNISED: 36,
      LINEAGE_LINK_MISSING: 180,
    });
    // ⚠ `DESCENDANT_ON_CHARITABLE_WAQF` is ABSENT, not zero-by-accident: asserted explicitly so the
    // absorption is a pinned fact rather than a gap in a `toStrictEqual` nobody re-read.
    expect(census['DESCENDANT_ON_CHARITABLE_WAQF']).toBeUndefined();
    // 864 + 432 + 288 + 216 + 90 + 36 + 180 = 2,106 refusals; 2,106 + 486 = 2,592.
    expect(2_592 - census['RESOLVED']!).toBe(2_106);
    expect(864 + 432 + 288 + 216 + 90 + 36 + 180).toBe(2_106);
    // The conservation law that makes "the ṭabaqa rule took 288" a claim rather than eight
    // independent edits: 144 came from ESC-1, 36 from the lineage-order refusal, 36 from
    // LINEAGE_LINK_MISSING's خيري half, and the remaining 72 out of RESOLVED.
    expect(144 + 36 + 36 + 72).toBe(census['TABAQA_ON_CHARITABLE_WAQF']!);
    expect(216 - census['LINEAGE_LINK_MISSING']!).toBe(36);
    expect(126 - census['LINEAGE_ORDER_ON_CHARITABLE_WAQF']!).toBe(36);
    expect(558 - census['RESOLVED']!).toBe(72);
  });

  /**
   * The 72 moved cells, identified by their coordinates rather than by their count — so a future
   * change that keeps the totals but moves a DIFFERENT slice cannot pass this section.
   *
   * Read directly off the corrected pass-4 predicate: `buildLineage` refuses an edgeless member only
   * when `kind === 'FAMILY' || waqfType === 'FAMILY_DHURRI'`, so the cells it stopped refusing are
   * precisely the ones with a `CATEGORY_ONLY` member, no `FAMILY` member, no edge, on a خيري waqf,
   * under an order that reaches the graph at all.
   *
   * ⚠ **HALVED BY `TABAQA_ON_CHARITABLE_WAQF` (2026-08-03): 72 → 36, and the filter is UNCHANGED.**
   * The slice's two edge values are `NO_LINK_NO_TABAQA` and `NO_LINK_WITH_TABAQA`; the second is now
   * refused, because a segment of a وقف خيري may not be recorded in a generation. So the surviving
   * slice is the one edge value that records **neither** a descent nor a tier — which is exactly the
   * recording that asserts nothing false about an unnamed charitable segment. The correction R6-F1
   * made is intact; only its ṭabaqa-bearing half is gone.
   */
  it('the cells that moved from LINEAGE_LINK_MISSING to RESOLVED are the ṭabaqa-free خيري slice', () => {
    const moved = NO_MAAL_CELLS.filter(
      (cell) =>
        cell.outcome === 'RESOLVED' &&
        cell.waqfType === 'PUBLIC_CHARITABLE' &&
        cell.key.includes('NO_LINK') &&
        cell.kinds.includes('CATEGORY_ONLY') &&
        !cell.kinds.includes('FAMILY') &&
        // ⚠ `NA_DIRECT_USE` is excluded because those cells did NOT move: the edge requirement never
        // applied there, so they resolved under the old rule too. Including them would make "N moved"
        // arithmetic that happens to land rather than a claim. (⚠ The reason recorded here was "I7
        // short-circuits before `buildLineage` is ever called" — false since memo Q7 hoisted the graph
        // above the short-circuit. The exclusion stands; only the mechanism was misstated.)
        cell.order !== 'NA_DIRECT_USE',
    );
    // 2 orders × 2 cohorts ({C}, {C,J}) × 3 continuations × 1 surviving edge × 3 liveness = 36.
    expect(moved).toHaveLength(36);
    // …and the other edge value of the same slice is refused, by name. The pair is what makes "36"
    // a halving rather than a slice that silently shrank.
    const tabaqaHalf = NO_MAAL_CELLS.filter(
      (cell) =>
        cell.waqfType === 'PUBLIC_CHARITABLE' &&
        cell.key.includes('NO_LINK_WITH_TABAQA') &&
        cell.kinds.includes('CATEGORY_ONLY') &&
        !cell.kinds.includes('FAMILY') &&
        // The same two orders as `moved`, so the pair is one slice split by one field and not two
        // differently-shaped populations that happen to be the same size.
        (cell.order === 'ORDERED' || cell.order === 'SHARED'),
    );
    expect(tabaqaHalf).toHaveLength(36);
    for (const cell of tabaqaHalf) {
      expect(cell.outcome, cell.key).toBe('TABAQA_ON_CHARITABLE_WAQF');
    }
    for (const cell of moved) expect(cell.key).toContain('NO_LINK_NO_TABAQA');
    expect(new Set(moved.map((cell) => cell.order))).toStrictEqual(new Set(['ORDERED', 'SHARED']));
    expect(new Set(moved.map((cell) => cell.kinds.join('+')))).toStrictEqual(
      new Set(['CATEGORY_ONLY', 'CATEGORY_ONLY+CHARITABLE_JIHA']),
    );
    // ⚠ THE PREDICATE THAT MAKES THIS A CORRECTION AND NOT A REGRESSION: not one moved cell pays a
    // member the engine placed in a family tree, because on a خيري waqf ESC-1 refuses every cohort
    // that records descent — so no bloodline is sharing a pool with these placeholders.
    expect(moved.flatMap((cell) => cell.placedPayees)).toStrictEqual([]);
    // …and the same slice on a ذري waqf is still refused, which is what keeps R6 intact where the
    // owner's rationale ("eligibility comes from descent") actually applies.
    const familySame = NO_MAAL_CELLS.filter(
      (cell) =>
        cell.waqfType === 'FAMILY_DHURRI' &&
        cell.key.includes('NO_LINK') &&
        cell.order !== 'NA_DIRECT_USE' &&
        cell.kinds.includes('CATEGORY_ONLY') &&
        !cell.kinds.includes('FAMILY'),
    );
    expect(familySame.length).toBeGreaterThan(0);
    for (const cell of familySame) expect(cell.outcome).not.toBe('RESOLVED');
  });

  /**
   * ⚠⚠ **THE VERDICT CELL — INVERTED TWICE. THE ESCAPE CLASS IS STILL CLOSED ON THIS GRID.**
   *
   * ── WHAT THE PREVIOUS PASS ASSERTED, KEPT AS THE RECORD ──────────────────────────────────────
   * "The predicate applied to all 486 resolving cells finds **54**, and every one of them is the
   * legal, uninteresting case: a `CHARITABLE_JIHA` **alone** on a خيري waqf. **The 18 that were ESC-1
   * are gone** — 12 in which a certified descendant was PAID beside the charity, 6 in which every
   * certified descendant was EXCLUDED and the charity took 100% of the pool the tier test was
   * deciding (S3-D1's outcome sentence verbatim). All 18 were cohort {C, J} at the `FULL` edge value
   * and all 18 are now `DESCENDANT_ON_CHARITABLE_WAQF`." **All of that still holds and is still
   * asserted below.**
   *
   * ── WHAT R6-F1's CLOSURE ADDED ───────────────────────────────────────────────────────────────
   * The predicate now finds **114**, derived by hand in two disjoint parts:
   *
   *  · **54 · the jiha alone.** Cohort {J} needs no edge, so all 3 edge values resolve:
   *      2 orders (ORDERED, SHARED) × 3 continuations × 3 edges × 3 liveness = **54**. Unchanged.
   *  · **60 · the خيري placeholder, edgeless.** Of the 72 cells that moved into RESOLVED, the ones
   *    that actually put a halala on an unplaced line:
   *      – cohort **{C,J}** — 2 orders × 3 cont × 2 edges × 3 live = **36**, and every one has a
   *        payee, because the jiha is active and payable in all three liveness values;
   *      – cohort **{C}** — 2 orders × 3 cont × 2 edges × 3 live = 36, **minus** the `ALL_DEAD` third
   *        (2 orders × 3 cont × 2 edges = 12) in which both placeholders are `BENEFICIARY_INACTIVE`,
   *        nobody is entitled and the pool is retained ⇒ **24**.
   *    36 + 24 = **60**, and 72 − 60 = 12 resolving-but-paying-nobody cells.
   *    54 + 60 = **114**.
   *
   * ⚠⚠ **THIS IS NOT THE ESCAPE CLASS RE-OPENING, AND THE DIFFERENCE IS ASSERTED, NOT ARGUED.** The
   * class is an unplaceable payee taking ghallah **that belongs to the bloodline**. Every one of the
   * 114 sits on a `PUBLIC_CHARITABLE` waqf, where ESC-1 refuses any cohort that records descent at
   * all — so there is no bloodline present to take it from. The two assertions that carry that claim:
   * `placedPayees` is empty on every escaping cell (no placed member shares a pool with an unplaced
   * one, anywhere), and no `esc-f*` id — the `FAMILY` members — appears among the unplaced on any cell
   * in the grid. If either goes red, the class is back.
   *
   * ── ⚠ UPDATED FOR `TABAQA_ON_CHARITABLE_WAQF`: **114 → 84**, in the placeholder half only ───────
   * The 54 jiha-alone cells are untouched — a jiha never carries a ṭabaqa, so the new rule cannot see
   * cohort {J}. The placeholder half falls **60 → 30**, losing exactly its `NO_LINK_WITH_TABAQA` edge
   * value, re-derived from scratch on the one surviving edge:
   *   – cohort **{C,J}** — 2 orders × 3 continuations × 1 edge × 3 liveness = **18**, every one with a
   *     payee because the jiha is active and payable in all three liveness values;
   *   – cohort **{C}** — 2 × 3 × 1 × 3 = 18, **minus** the `ALL_DEAD` third (2 orders × 3 cont × 1
   *     edge = 6) in which both placeholders are `BENEFICIARY_INACTIVE` and the pool is retained
   *     ⇒ **12**.
   *   18 + 12 = **30**, and 54 + 30 = **84**.
   * The claim the section carries is unchanged and, if anything, easier to hold: fewer records can be
   * paid unplaced, and every one that can is still on a خيري waqf with no bloodline in the run.
   */
  it('the 84 unplaced-payee cells are ALL charitable-waqf cells — no bloodline shares a pool', () => {
    const escapes = NO_MAAL_CELLS.filter((cell) => cell.unplaced.length > 0);
    expect(escapes).toHaveLength(84);
    // The unplaced payees are the jiha and the two edgeless placeholders — and nobody else.
    expect(new Set(escapes.flatMap((cell) => cell.unplaced))).toStrictEqual(
      new Set(['esc-jiha', 'esc-c1', 'esc-c2']),
    );
    expect(new Set(escapes.map((cell) => cell.waqfType))).toStrictEqual(
      new Set(['PUBLIC_CHARITABLE']),
    );
    expect(new Set(escapes.map((cell) => cell.order))).toStrictEqual(
      new Set(['ORDERED', 'SHARED']),
    );

    // The 54/30 split, asserted as the derivation states it.
    const jihaAlone = escapes.filter((cell) => !cell.kinds.includes('CATEGORY_ONLY'));
    const withPlaceholder = escapes.filter((cell) => cell.kinds.includes('CATEGORY_ONLY'));
    expect(jihaAlone).toHaveLength(54);
    expect(withPlaceholder).toHaveLength(30);
    // Every placeholder cell is edgeless AND ṭabaqa-free. The `FULL` edge would mean ESC-1 had
    // stopped refusing recorded descent on a خيري waqf; `NO_LINK_WITH_TABAQA` would mean the new
    // ṭabaqa rule had stopped refusing a generation on one.
    for (const cell of withPlaceholder) expect(cell.key).toContain('NO_LINK_NO_TABAQA');
    // …and not one escaping line in this half claims a generation.
    expect(
      NO_MAAL_CELLS.filter(
        (cell) => cell.unplaced.length > 0 && cell.waqfType === 'PUBLIC_CHARITABLE',
      ).length,
    ).toBe(84);

    // ⚠ THE TWO PREDICATES THAT KEEP THIS A CLOSURE. First: no escaping cell pays a PLACED member, so
    // no bloodline shares a pool with an unplaced payee. Second: no `FAMILY` member is an unplaced
    // payee anywhere on the grid — R6 still demands the edge from a bloodline member on every type,
    // and ESC-1 then refuses the خيري cohort that records one, so a FAMILY member cannot reach a line
    // on a charitable waqf by either door.
    expect(escapes.flatMap((cell) => cell.placedPayees)).toStrictEqual([]);
    // ⚠ This one is asserted over the WHOLE grid, both halves, deliberately: "no `FAMILY` member is
    // ever paid on a line the engine could not place" is the class's own sentence, and R7 must not be
    // allowed to weaken it anywhere. It holds — the ultimate taker is a charity by construction
    // (`REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE` refuses naming a descendant).
    expect(
      CELLS.flatMap((cell) => cell.unplaced).filter((id) => id.startsWith('esc-f')),
    ).toStrictEqual([]);

    // ⚠ INVERTED. This asserted `esc1` had 144 cells, of which 18 were the ESC-1 shape (cohort {C,J}
    // at the `FULL` edge under ORDERED/SHARED, where a certified descendant either shared a pool with
    // the charity or was excluded while it took 100%).
    //
    // MEASURED NOW: **zero** cells on this grid carry `DESCENDANT_ON_CHARITABLE_WAQF`. Every one of
    // its 144 is absorbed by `TABAQA_ON_CHARITABLE_WAQF`, because the `FULL` edge value records the
    // ṭabaqa alongside the link and the ṭabaqa rule is checked first. The 18 have not come back —
    // they moved from one refusal to a stricter one, which is asserted rather than assumed.
    expect(CELLS.filter((cell) => cell.outcome === 'DESCENDANT_ON_CHARITABLE_WAQF')).toStrictEqual(
      [],
    );
    // ESC-1's own 144: خيري × the `FULL` edge × the four cohorts that survive the mixed-cohort rule
    // ({F}, {C}, {F,C}, {C,J}) × 4 orders × 3 continuations × 3 liveness = 4 × 4 × 3 × 3 = 144.
    const absorbed = NO_MAAL_CELLS.filter(
      (cell) =>
        cell.waqfType === 'PUBLIC_CHARITABLE' &&
        cell.key.includes('FULL') &&
        (cell.kinds.includes('CATEGORY_ONLY') || cell.kinds.includes('FAMILY')) &&
        // {F,J} and {F,C,J} were always the mixed-cohort rule's, never ESC-1's.
        !(cell.kinds.includes('FAMILY') && cell.kinds.includes('CHARITABLE_JIHA')),
    );
    expect(absorbed).toHaveLength(144);
    for (const cell of absorbed) {
      expect(cell.outcome, cell.key).toBe('TABAQA_ON_CHARITABLE_WAQF');
    }
    // The 18 ESC-1-shaped cells specifically: cohort {C,J}, FULL edge, ORDERED/SHARED.
    expect(
      absorbed.filter(
        (cell) =>
          cell.kinds.includes('CATEGORY_ONLY') &&
          cell.kinds.includes('CHARITABLE_JIHA') &&
          (cell.order === 'ORDERED' || cell.order === 'SHARED'),
      ),
    ).toHaveLength(18);
  });

  it('R6-D1 holds · NO family-typed or JOINT cell resolves with an unplaced paid line', () => {
    // The half of the class that IS closed, stated over the whole grid rather than over the one
    // cohort that exposed it. 1,728 cells of the 2,592 declare a type other than PUBLIC_CHARITABLE.
    const familyOrJoint = NO_MAAL_CELLS.filter((cell) => cell.waqfType !== 'PUBLIC_CHARITABLE');
    expect(familyOrJoint).toHaveLength(1_728);
    expect(familyOrJoint.filter((cell) => cell.unplaced.length > 0)).toStrictEqual([]);
    // ⚠ **AND THIS CLAIM IS NOW HALF-FALSE, WHICH IS WHY IT IS SCOPED RATHER THAN DELETED.** With a
    // recorded مآل clause, 8 `FAMILY_DHURRI` cells DO pay an unplaced line — the endowment's ultimate
    // taker, on a run where the recorded bloodline is over. R7's own section derives them and asserts
    // what makes them legitimate; asserting the blanket claim over both halves would simply be false.
  });

  /**
   * ⚠⚠ **INVERTED, AND THE INVERSION IS THE PRECISE CONTENT OF R6-F1's CORRECTION.**
   *
   * MEASURED BEFORE THE CORRECTION, and this is what the assertion said: *every* cell with an edgeless
   * `FAMILY` **or** `CATEGORY_ONLY` member, on any order that builds the graph, was refused —
   * `for (const cell of unlinkedCohorts) expect(cell.outcome).not.toBe('RESOLVED')`, over all 396 such
   * cells. That blanket claim is now false for 72 of them, and false **on purpose**: it was the
   * measurement of R6-F1, i.e. of a خيري deed's unnamed segment having no representable record.
   *
   * What replaces it is the same claim split along the line the corrected rule actually draws, so the
   * half that still protects the bloodline is asserted at full strength rather than weakened to fit:
   *
   *   · a `FAMILY` member with no edge  ⇒ REFUSED on every waqf type, every order that builds the
   *     graph. This is S3-D1's own shape and it stays shut everywhere.
   *   · a `CATEGORY_ONLY` member with no edge, on a **ذري** waqf ⇒ REFUSED. R6's rationale —
   *     eligibility comes from descent — applies, so the descent must be on record.
   *   · a `CATEGORY_ONLY` member with no edge, on a **خيري** waqf ⇒ RESOLVES. Eligibility there does
   *     not come from descent, so there is no descent to record and demanding one forced a fiction.
   *
   * ⚠ **AND ONE CONDITION IS ADDED (2026-08-03), not removed: `…AND NO ṬABAQA`.** The third bullet is
   * now true only of the `NO_LINK_NO_TABAQA` edge value. A placeholder recorded at
   * `NO_LINK_WITH_TABAQA` on a خيري waqf is refused `TABAQA_ON_CHARITABLE_WAQF` — a segment the waqif
   * chose does not sit in a generation. The loop below therefore checks the narrower predicate and
   * asserts the winning refusal on the cells that fell out of it, rather than letting the count drop
   * silently.
   */
  it('a FAMILY member is NEVER paid unplaced — only a ṭabaqa-free خيري placeholder resolves', () => {
    const unlinked = NO_MAAL_CELLS.filter(
      (cell) =>
        cell.key.includes('NO_LINK') &&
        cell.order !== 'NA_DIRECT_USE' &&
        (cell.kinds.includes('FAMILY') || cell.kinds.includes('CATEGORY_ONLY')),
    );
    expect(unlinked.length).toBeGreaterThan(0);

    for (const cell of unlinked) {
      // The one shape that may resolve: a خيري waqf whose edgeless members are placeholders only AND
      // record no generation, under an order that reaches `buildLineage` at all.
      // ⚠ `LINEAGE_CONTINUATION` is excluded and the exclusion is load-bearing rather than
      // bookkeeping: a lineage order on a charitable waqf is refused at Stage 0
      // (`LINEAGE_ORDER_ON_CHARITABLE_WAQF`, "a charitable waqf has no descendants") long before
      // pass 4 is consulted, so R6-F1's correction cannot reach it.
      const isCharitablePlaceholderOnly =
        cell.waqfType === 'PUBLIC_CHARITABLE' &&
        (cell.order === 'ORDERED' || cell.order === 'SHARED') &&
        cell.kinds.includes('CATEGORY_ONLY') &&
        !cell.kinds.includes('FAMILY');
      if (isCharitablePlaceholderOnly && cell.key.includes('NO_LINK_NO_TABAQA')) {
        expect(cell.outcome, `${cell.key} must resolve`).toBe('RESOLVED');
      } else if (isCharitablePlaceholderOnly) {
        // The half that fell out, named rather than merely excluded from the count above.
        expect(cell.outcome, `${cell.key} must be refused for its ṭabaqa`).toBe(
          'TABAQA_ON_CHARITABLE_WAQF',
        );
      } else {
        expect(cell.outcome, `${cell.key} must be refused`).not.toBe('RESOLVED');
      }
    }

    // …and the count, so "36 resolve" is a pinned number and not whatever the loop happened to find.
    expect(unlinked.filter((cell) => cell.outcome === 'RESOLVED')).toHaveLength(36);
  });

  /* ── R7 · the مآل half of the grid, derived from scratch ──────────────────────────────────── */

  /**
   * **R7 · the reversion half's census, every count derived by hand from the precedence chain, then
   * confirmed.** 2,592 cells, all with a clause naming `esc-jiha` as the endowment's ultimate taker.
   *
   *  · **`WAQF_TYPE_JOINT_NOT_SUPPORTED` = 864.** `JOINT` is check 1 and `assertReversionLegible` is
   *    check 2, so a reversion on a joint waqf is unreachable — exactly as designed:
   *    1 type × 4 orders × 3 cont × 8 kinds × 3 edges × 3 live = 864.
   *  · **`REVERSION_ON_CHARITABLE_WAQF` = 864.** All of خيري, and it is the FIRST thing the clause
   *    validator checks, so it absorbs every خيري cell that the ṭabaqa rule, ESC-1, the mixed-cohort
   *    rule and the lineage-order rule would otherwise have taken. ⚠ Claude's fail-safe reading of R5,
   *    awaiting the owner (TODO(surface) in `resolver.ts`) — if it is reversed, 864 cells move and this
   *    census is where that shows up.
   *  · **`REVERSION_ULTIMATE_TAKER_UNKNOWN` = 432.** ذري cells whose cohort holds no jiha, so the id the
   *    clause names is not in the register: 4 of the 8 kind subsets ({}, {F}, {C}, {F,C}) ×
   *    4 orders × 3 cont × 3 edges × 3 live = 432. Referential integrity, exactly as
   *    `LINEAGE_PARENT_UNKNOWN` treats a dangling parent edge.
   *  · the remaining **432** are ذري with a jiha present, where the clause names the only jiha, so
   *    `unnamedJihaIds` is empty and **all three narrowed cohort refusals stand aside** — this is R7-a:
   *      – **`RESOLVED` 108** · `NA_DIRECT_USE`: 4 kinds × 3 cont × 3 edges × 3 live. I7 short-circuits
   *        before the clause is even evaluated; the run emits no line and retains everything.
   *      – **`CONTINUATION_STIPULATION_UNRECOGNISED` 36** · `LINEAGE_CONTINUATION` + a `null` term:
   *        4 kinds × 3 edges × 3 live. R2 has no default and never will.
   *      – **`LINEAGE_LINK_MISSING` 144** · the 8 surviving (order, continuation) combinations ×
   *        the 3 kind subsets holding a `FAMILY`/`CATEGORY_ONLY` member × the 2 edgeless values ×
   *        3 live = 8 × 3 × 2 × 3. R6 is untouched by R7 and still demands the edge.
   *      – **`REVERSION_WITH_NO_RECORDED_BLOODLINE` 72** · the jiha-ALONE cohort, all 3 edge values
   *        (there is no family member for the edge axis to strip): 8 combos × 1 kind × 3 edges × 3 live.
   *        **∅ is "not yet enrolled", not "extinct"** — and this is the second, independent means by
   *        which the pre-R7 measured payload stays closed: a jiha alone under `LINEAGE_CONTINUATION`
   *        once took 100% of the ghallah on a line stamped `LINEAGE_PER_CAPITA_ZUHUR_ONLY`.
   *      – **`RESOLVED` 72** · a placed bloodline beside the taker, at the `FULL` edge:
   *        8 combos × 3 kinds × 1 edge × 3 live.
   *    ⇒ RESOLVED 108 + 72 = **180**.
   *
   * Σ 864 + 864 + 432 + 180 + 36 + 144 + 72 = 2,592 ✓
   *
   * ═══ ⚠⚠ UPDATED FOR R7-D1's FIX. EXACTLY ONE COUNT MOVES, AND ITS 16 CELLS GO TO A NEW OUTCOME ═══
   * The extinction trigger no longer fires over a register bearing a `CATEGORY_ONLY` **placeholder** — *a
   * placeholder is sound evidence FOR a living bloodline and no evidence at all AGAINST one* — so those
   * cells are held instead of paying the charity. Derived by hand from the coordinates:
   *
   *   ذري × the `FULL` edge (the only value that records a bloodline at all) × `ALL_DEAD` (the only value
   *   with no living descendant) × the kind subsets holding a jiha AND a placeholder — {C,J} and {F,C,J},
   *   = **2** — × the 8 surviving (order, continuation) combinations
   *     = 1 × 1 × 1 × 2 × 8 = **16**.
   *
   * `NA_DIRECT_USE` contributes none: it emits no line, so `I-R1` makes no claim and is not asserted.
   * `ALL_LIVE` and `HEAD_DEAD` contribute none: the leaf lives, so the ordinary living-bloodline hold
   * already applied there. So **`RESOLVED` 180 → 164**, and the 16 land on
   * **`DISTRIBUTION_INVARIANT_BREACH`** — ⚠ which is the R7-D2 defect, measured here and bounded in the
   * next test but never asserted to be right. Σ 2,592 unchanged.
   */
  it('R7 · the مآل half`s census is exactly as the precedence chain predicts', () => {
    const census: Record<string, number> = {};
    for (const cell of MAAL_CELLS) census[cell.outcome] = (census[cell.outcome] ?? 0) + 1;
    // ⚠ R7-D2 IS NOW FIXED, and this census records it. The 16 placeholder-extinct cells previously
    // came out as `DISTRIBUTION_INVARIANT_BREACH`: the resolver held the trigger (R7-D1) while
    // `invariants.independentReversionState` still recomputed `applied` WITHOUT the placeholder
    // conjunct, so I-R1's flag cross-check refused the whole run. No halala moved either way, but a
    // retained pool and an engine defect are different answers to a Nazir and only one was true.
    // The invariant now recomputes the fourth conjunct independently, so those 16 cells RESOLVE with the
    // pool retained and a reason on the run — hence `RESOLVED` returns to 180 and the breach term is
    // gone entirely. Its ABSENCE is the assertion: a reappearing breach means the two sides have drifted
    // apart again, which is exactly what this census exists to catch.
    expect(census).toStrictEqual({
      WAQF_TYPE_JOINT_NOT_SUPPORTED: 864,
      REVERSION_ON_CHARITABLE_WAQF: 864,
      REVERSION_ULTIMATE_TAKER_UNKNOWN: 432,
      RESOLVED: 180,
      LINEAGE_LINK_MISSING: 144,
      REVERSION_WITH_NO_RECORDED_BLOODLINE: 72,
      CONTINUATION_STIPULATION_UNRECOGNISED: 36,
    });
    expect(864 + 864 + 432 + 180 + 144 + 72 + 36).toBe(2_592);
    // No cell in this half may be an invariant breach — the resolver and the invariant must agree about
    // when the reversion applies. This is the R7-D2 regression pin.
    expect(census['DISTRIBUTION_INVARIANT_BREACH']).toBeUndefined();

    // ⚠ FOUR REFUSALS ARE ABSENT FROM THIS HALF, and their absence is the measurement of R7's
    // narrowing rather than a gap: `COHORT_MIXES_CHARITABLE_AND_FAMILY`,
    // `CHARITABLE_JIHA_ON_FAMILY_WAQF` and `LINEAGE_ORDER_ON_CHARITABLE_WAQF` all stand aside for a
    // recorded taker, and `TABAQA_ON_CHARITABLE_WAQF` is absorbed by the clause check that precedes it.
    // Each of the three narrowed ones still fires 216–432 times in the OTHER half, so none has been
    // switched off — they have been made conditional, which is the whole content of the decision.
    for (const absent of [
      'COHORT_MIXES_CHARITABLE_AND_FAMILY',
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
      'LINEAGE_ORDER_ON_CHARITABLE_WAQF',
      'TABAQA_ON_CHARITABLE_WAQF',
    ]) {
      expect(census[absent], absent).toBeUndefined();
      expect(
        NO_MAAL_CELLS.filter((cell) => cell.outcome === absent).length,
        absent,
      ).toBeGreaterThan(0);
    }
  });

  /**
   * ⚠⚠ **THE PREDICATE HAD TO BE REFINED, AND THIS IS WHERE THE CLASS'S DEFINITION EARNS ITS KEEP.**
   *
   * §1's central claim was: *no `FAMILY_DHURRI` or `JOINT` cell has an unplaced payee at all.* With a
   * recorded مآل clause **24 `FAMILY_DHURRI` cells do** — the endowment's ultimate taker is paid, and it
   * is by definition unplaced, because a charity is not a descendant of the waqif. Restated as it must
   * now be: *none except a recorded ultimate taker on a run where no descendant was paid.*
   *
   * That is not a weakening, and the distinction is exactly the class's own sentence — *"a beneficiary
   * the engine cannot place in the waqif's family tree takes ghallah **that belongs to the
   * bloodline**"*. On these 24 cells the bloodline is over: every descendant is `EMPTY`/`EXCLUDED`
   * holding `0n`, so there is no bloodline entitlement for the charity to take. The refined predicate is
   * asserted with **both** conjuncts, because either alone would be satisfiable by an escape:
   *
   *   1. the unplaced payee's id is in `reversion.ultimateTakerIds` — without this, ANY unplaced payee
   *      would be excused by the mere presence of a clause;
   *   2. **no placed member is paid in the same run** — without this, the 13,750,000-halala diversion
   *      R6-D1/ESC-1 measured would pass, since that jiha was also "named" in nothing at all.
   *
   * Conjunct 2 is the one invariant `I-R1`'s universal mirror enforces at runtime, so this grid and the
   * engine's own invariant are two independent statements of the same rule.
   *
   * The 24, by hand: ذري × the `FULL` edge × the 3 kind subsets holding a jiha AND a bloodline member
   * ({F,J}, {C,J}, {F,C,J}) × the 8 surviving (order, continuation) combinations × `ALL_DEAD` = 3 × 8 ×
   * 1 × 1 = 24. The other two liveness values leave a living descendant, so the clause has not
   * triggered and the taker is `EXCLUDED / REVERSION_PENDING_LIVING_BLOODLINE` holding `0n`.
   *
   * ── ⚠⚠ **UPDATED FOR R7-D1: 24 → 8, AND THE 16 THAT LEFT ARE THE POINT OF THE FIX** ─────────────
   * Extinction cannot be certified from a placeholder, so the two kind subsets that reach `ALL_DEAD`
   * with an UNENUMERATED record on the register — **{C,J}** (placeholders only) and **{F,C,J}**
   * (enumerated dead *beside* a placeholder, the mixed register a real engagement produces) — no longer
   * pay their charity at all: 2 kinds × 8 combos = **16**, leaving **8** = {F,J} × 8 combos.
   *
   * The surviving 8 are the reversion's actual subject and the reason the fix cannot be *"refuse every
   * ذري reversion"*: a register of individually-named `FAMILY` members, every one of them deceased, is
   * precisely the state the owner described. **This test is therefore the over-broadness check on the
   * grid** — if it ever reads 0, the fix has stopped the reversion working at all.
   */
  it('R7 · the 8 surviving unplaced payees are recorded ultimate takers over an ENUMERATED extinct line', () => {
    const maalEscapes = MAAL_CELLS.filter((cell) => cell.unplaced.length > 0);
    // ⚠ **8, not 8 + 84.** The other half's 84 خيري escapes have NO counterpart here: every خيري cell
    // in this half is refused `REVERSION_ON_CHARITABLE_WAQF`, so the entire unplaced-payee population
    // of the مآل half is ذري. Asserting the partition rather than only the count, because "8" would
    // also be satisfied by 8 cells of some other shape.
    expect(maalEscapes).toHaveLength(8);
    const onFamilyWaqf = maalEscapes.filter((cell) => cell.waqfType === 'FAMILY_DHURRI');
    expect(onFamilyWaqf).toHaveLength(8);
    expect(
      MAAL_CELLS.filter(
        (cell) => cell.waqfType === 'PUBLIC_CHARITABLE' && cell.unplaced.length > 0,
      ),
    ).toStrictEqual([]);

    for (const cell of onFamilyWaqf) {
      // 1 · the unplaced payee is the recorded ultimate taker, and nobody else.
      expect(cell.unplaced, cell.key).toStrictEqual(['esc-jiha']);
      // 2 · NO placed member is paid in the same run — the conjunct that makes this not an escape.
      expect(cell.placedPayees, cell.key).toStrictEqual([]);
      // …and the coordinates the derivation names, so a same-sized different slice cannot pass.
      expect(cell.key, cell.key).toContain('ALL_DEAD');
      expect(cell.key, cell.key).toContain('FULL');
      expect(cell.order, cell.key).not.toBe('NA_DIRECT_USE');
    }
    // ⚠ ONE kind subset, and it is the enumerated one. The two placeholder-bearing subsets that used to
    // appear here are R7-D1's closure, asserted by name in the next test rather than merely absent.
    expect(new Set(onFamilyWaqf.map((cell) => cell.kinds.join('+')))).toStrictEqual(
      new Set(['FAMILY+CHARITABLE_JIHA']),
    );
    for (const cell of onFamilyWaqf) expect(cell.kinds).not.toContain('CATEGORY_ONLY');

    // ⚠ AND THE CONVERSE, which is what stops conjunct 2 being vacuous: on every مآل cell where a
    // PLACED member is paid, the taker is paid NOTHING. There is no cell anywhere in the grid — either
    // half — where a charity and a certified descendant are both on paid lines.
    for (const cell of MAAL_CELLS) {
      if (cell.placedPayees.length > 0) expect(cell.unplaced, cell.key).toStrictEqual([]);
    }
    for (const cell of CELLS) {
      const sharesWithBloodline = cell.unplaced.length > 0 && cell.placedPayees.length > 0;
      expect(sharesWithBloodline, cell.key).toBe(false);
    }
  });

  /**
   * ⚠⚠ **R7-D1 · CLOSED ON THIS GRID — and R7-D2 · MEASURED ON IT, NOT ENDORSED.**
   *
   * ── WHAT WAS MEASURED BEFORE THE FIX, kept as the record ──────────────────────────────────────
   * These 16 cells paid their charity the **whole distributable** on the strength of a `CATEGORY_ONLY`
   * placeholder's `active: false`. `esc-c1` / `esc-c2` mean *"the children of Branch A, not yet
   * enrolled"*; R6 forces a lineage edge onto them on a ذري waqf, so they count as recorded bloodline,
   * and the trigger read *"nobody on record is living"* as *"the family is over"*. On the sibling
   * fixture in `reversion-adversarial.test.ts` §7 that same cohort was measured at **27,500,000 of
   * 27,500,000 halalas** — R6-D1's payload restored one `reversion` field later.
   *
   * ── WHAT THE GRID SAYS NOW · BOTH HALVES HOLD ─────────────────────────────────────────────────
   * Not one of the 16 pays anybody — `unplaced` and `placedPayees` are both empty on every one — **and
   * the mechanism is now the right one.** R7-D2 is fixed: `invariants.independentReversionState`
   * recomputes the placeholder conjunct independently, so it no longer disagrees with
   * `resolver.reversionOutcome`, `I-R1`'s flag cross-check passes, and each cell **RESOLVES with the
   * whole distributable RETAINED** and a reason naming the unenumerated records
   * (`REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED` on the run,
   * `REVERSION_PENDING_BLOODLINE_UNENUMERATED` on the taker's line).
   *
   * Those two codes are deliberately **distinct** from their `…DESCENDANTS_LIVING` siblings: on this
   * register nobody is recorded as living, so the sibling's wording would put a false statement about
   * descent on a BR-505 record and send a Nazir looking for a family the register does not contain. One
   * reason reverses on a death; this one reverses on an enrolment.
   *
   * The assertion is therefore that the breach population is **empty** — a reappearing breach means the
   * resolver and the invariant have drifted apart again, which is the whole reason this grid exists.
   */
  it('R7-D1/R7-D2 · the 16 placeholder-extinct cells RETAIN the pool, pay nobody, and breach nothing', () => {
    const held = CELLS.filter(
      (cell) =>
        cell.outcome === 'RESOLVED' &&
        cell.reversionRecorded &&
        cell.kinds.includes('CATEGORY_ONLY') &&
        cell.kinds.includes('CHARITABLE_JIHA') &&
        cell.key.includes('ALL_DEAD') &&
        cell.key.includes('FULL') &&
        cell.order !== 'NA_DIRECT_USE',
    );
    // 2 placeholder-bearing jiha cohorts × 8 surviving (order, continuation) combinations = 16.
    expect(held).toHaveLength(16);
    // ⚠ R7-D2 REGRESSION PIN, both halves: no cell anywhere may report a legal deed record as an engine
    // defect. A breach leaking into the no-clause half would mean something much wider than R7-D2.
    expect(CELLS.filter((cell) => cell.outcome === 'DISTRIBUTION_INVARIANT_BREACH')).toEqual([]);
    expect(
      NO_MAAL_CELLS.filter((cell) => cell.outcome === 'DISTRIBUTION_INVARIANT_BREACH'),
    ).toEqual([]);

    for (const cell of held) {
      // THE MONEY CLAIM: a held run pays nobody, charity or family — the pool waits.
      expect(cell.unplaced, cell.key).toStrictEqual([]);
      expect(cell.placedPayees, cell.key).toStrictEqual([]);
      // …and the coordinates, so a same-sized different slice cannot pass this test.
      expect(cell.waqfType, cell.key).toBe('FAMILY_DHURRI');
      expect(cell.reversionRecorded, cell.key).toBe(true);
      expect(cell.key, cell.key).toContain('ALL_DEAD');
      expect(cell.key, cell.key).toContain('FULL');
      expect(cell.kinds, cell.key).toContain('CATEGORY_ONLY');
      expect(cell.kinds, cell.key).toContain('CHARITABLE_JIHA');
      expect(cell.order, cell.key).not.toBe('NA_DIRECT_USE');
    }
    expect(new Set(held.map((cell) => cell.kinds.join('+')))).toStrictEqual(
      new Set(['CATEGORY_ONLY+CHARITABLE_JIHA', 'FAMILY+CATEGORY_ONLY+CHARITABLE_JIHA']),
    );
    // All three money orders, so the hold is a fact about the register and not about one order's path.
    expect(new Set(held.map((cell) => cell.order))).toStrictEqual(
      new Set(['LINEAGE_CONTINUATION', 'ORDERED', 'SHARED']),
    );

    /* ── THE OVER-BROADNESS CHECK, on the same grid and in the same test ─────────────────────────
     * The identical coordinates with the placeholder generation REMOVED — cohort {F,J}, every named
     * member deceased — must still pay the taker. If the fix had been "hold whenever the register is
     * extinct" these 8 would have gone quiet too, and nothing else in this file would have noticed.
     * ────────────────────────────────────────────────────────────────────────────────────────── */
    const enumeratedExtinct = MAAL_CELLS.filter(
      (cell) =>
        cell.waqfType === 'FAMILY_DHURRI' &&
        cell.kinds.includes('CHARITABLE_JIHA') &&
        cell.kinds.includes('FAMILY') &&
        !cell.kinds.includes('CATEGORY_ONLY') &&
        cell.key.includes('FULL') &&
        cell.key.includes('ALL_DEAD') &&
        cell.order !== 'NA_DIRECT_USE',
    );
    // 3 orders × 3 continuations = 9 coordinates, of which `LINEAGE_CONTINUATION` + a `null` term is
    // refused `CONTINUATION_STIPULATION_UNRECOGNISED` two checks earlier (R2 has no default) — leaving
    // the 8 surviving (order, continuation) combinations the derivation names.
    expect(enumeratedExtinct).toHaveLength(9);
    const paying = enumeratedExtinct.filter((cell) => cell.outcome === 'RESOLVED');
    expect(paying).toHaveLength(8);
    expect(
      enumeratedExtinct.filter((cell) => cell.outcome !== 'RESOLVED').map((cell) => cell.outcome),
    ).toStrictEqual(['CONTINUATION_STIPULATION_UNRECOGNISED']);
    for (const cell of paying) {
      expect(cell.unplaced, cell.key).toStrictEqual(['esc-jiha']);
      expect(cell.placedPayees, cell.key).toStrictEqual([]);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · the near-misses of `CHARITABLE_JIHA_ON_FAMILY_WAQF`
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('2 · the new refusal is neither too wide nor too narrow', () => {
  const charitable = (beneficiaries: readonly Raw[]): DistributionInputRaw =>
    ({
      ...exampleA(),
      waqfType: 'PUBLIC_CHARITABLE',
      entitlementOrder: 'ORDERED',
      beneficiaries,
    }) as DistributionInputRaw;
  const family = (beneficiaries: readonly Raw[]): DistributionInputRaw =>
    ({ ...exampleA(), beneficiaries }) as DistributionInputRaw;

  it('MUST NOT refuse · a jiha alone on a خيري waqf — the legal case', () => {
    // Sole entitled head, weight 10 ⇒ 27,500,000 × 10/10 = 27,500,000, residual 0.
    const result = runDistribution(charitable([JIHA]));
    expect(statusesById(result)).toStrictEqual({ 'esc-jiha': 'PAID/null:27500000' });
  });

  /**
   * ⚠⚠ **HALF-INVERTED BY ESC-1, THEN THE OTHER HALF INVERTED BACK BY R6-F1's CORRECTION.**
   *
   * The original claim was "a `CATEGORY_ONLY`-only cohort must not be refused **on either legal waqf
   * type**". `CHARITABLE_JIHA_ON_FAMILY_WAQF` never over-reached into it — that is what this test was
   * built to prove and it still holds. ESC-1 then refused the خيري half, because these placeholders
   * carry the `lineageLink` R6 required and a charitable waqf's beneficiaries may not be a bloodline;
   * and R6 refused the same cohort with the links stripped, which is what left the shape with **no
   * legal form at all** (R6-F1).
   *
   * MEASURED at that point, and kept as the record: `expectRefused(charitable(edgeless placeholders),
   * 'LINEAGE_LINK_MISSING')` passed — a وقف خيري could not record a not-yet-enumerated segment by
   * either recording of `lineageLink`.
   *
   * **`buildLineage` pass 4 now scopes the `CATEGORY_ONLY` requirement to a ذري waqf, and the third
   * assertion below is inverted onto the computation.** The squeeze is gone in one direction only, and
   * that is the correct one: the edge-BEARING cohort is still refused (ESC-1 — a خيري deed recording
   * descent still claims two natures), and the edge-FREE cohort now computes.
   */
  it('MUST NOT refuse on a ذري waqf — refused on a خيري one WITH descent, computes WITHOUT it', () => {
    const placeholders = [
      placed('esc-c1', 'CATEGORY_ONLY', 1, null, true),
      placed('esc-c2', 'CATEGORY_ONLY', 2, 'esc-c1', true),
    ];

    // ذري · ORDERED, ṭabaqa 1 alive ⇒ the head takes the pool whole and its child waits.
    // By hand: 27,500,000 × 10/10 = 27,500,000, residual 0.
    expect(statusesById(runDistribution(family(placeholders)))).toStrictEqual({
      'esc-c1': 'PAID/null:27500000',
      'esc-c2': 'EXCLUDED/UPPER_TABAQA_EXTANT:0',
    });

    // خيري · the identical cohort, one field different. MEASURED before ESC-1: it computed, with the
    // identical statuses above. It is now refused — and since 2026-08-03 the FIRST rule to answer it
    // is `TABAQA_ON_CHARITABLE_WAQF`, because `placed()` records a ṭabaqa alongside the edge and a
    // وقف خيري has no generations. MEASURED between ESC-1 and that change:
    // `DESCENDANT_ON_CHARITABLE_WAQF`. Both are driven, one field apart, so neither rule's coverage is
    // silently absorbed by the other.
    expectRefused(charitable(placeholders), 'TABAQA_ON_CHARITABLE_WAQF');
    expectRefused(
      charitable(placeholders.map((member) => patched(member, { tabaqa: null }))),
      'DESCENDANT_ON_CHARITABLE_WAQF',
    );

    // ⚠ THE INVERSION. The same edgeless cohort that used to halt `LINEAGE_LINK_MISSING` now computes.
    // Neither placeholder is in the lineage graph, so neither is tiered and `lowestLivingTabaqa` is
    // null: `orderedExclusionReason` skips the tier test entirely, both are active, and both carry a
    // non-zero deed weight. ORDERED applies deed weights (R3 exempts only a lineage cohort), and the
    // two weights are equal at '10':
    //   esc-c1: 27,500,000 × 10 / 20 = 13,750,000   (exact, no remainder)
    //   esc-c2: 27,500,000 × 10 / 20 = 13,750,000   (exact, no remainder)
    //   Σ = 27,500,000, residual 0.
    const edgeless = placeholders.map((member) =>
      patched(member, { lineageLink: null, tabaqa: null, parentId: null }),
    );
    const computed = runDistribution(charitable(edgeless));
    expect(statusesById(computed)).toStrictEqual({
      'esc-c1': 'PAID/null:13750000',
      'esc-c2': 'PAID/null:13750000',
    });
    // Unplaced, and stated as such on the published basis — the record does not pretend to a descent
    // it does not have, which is the whole reason the fictional edge was the wrong answer.
    expect(computed.lines.map((line) => line.basis.lineageDepth)).toStrictEqual([null, null]);
    expect(computed.lines.map((line) => line.basis.lineageLink)).toStrictEqual([null, null]);

    // ⚠ BR-206 IS REACHABLE AGAIN, and that is the point of the correction rather than a side effect:
    // the category-capture gate had no representable subject while the record itself was refused.
    // Blank the category on the first placeholder and it is WITHHELD — with its entitlement INTACT,
    // because a gate stamps a status and never moves an amount (I6).
    const uncaptured = runDistribution(
      charitable([patched(edgeless[0]!, { category: '   ' }), edgeless[1]!]),
    );
    expect(statusesById(uncaptured)).toStrictEqual({
      'esc-c1': 'WITHHELD/CATEGORY_NOT_CAPTURED:13750000',
      'esc-c2': 'PAID/null:13750000',
    });
  });

  it('MUST refuse · the same jiha the moment the waqf is typed ذري — on all four orders', () => {
    for (const entitlementOrder of ORDERS)
      expectRefused({ ...family([JIHA]), entitlementOrder }, 'CHARITABLE_JIHA_ON_FAMILY_WAQF');
  });

  it('MUST refuse · NA_DIRECT_USE with a jiha on a ذري waqf — the refusal outranks I7', () => {
    // The one that would slip if the check sat after the short-circuit: a direct-use run resolves no
    // cohort at all, so every downstream check is skipped. Contrast the خيري direct-use waqf below,
    // which resolves and simply pays nobody.
    expectRefused(
      { ...family([JIHA]), entitlementOrder: 'NA_DIRECT_USE' },
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );
    const charitableDirectUse = runDistribution({
      ...charitable([JIHA]),
      entitlementOrder: 'NA_DIRECT_USE',
    });
    expect(charitableDirectUse.lines).toStrictEqual([]);
    expect(charitableDirectUse.totals.retainedMinor).toBe(DISTRIBUTABLE);
  });

  it('MUST NOT refuse · a family waqf with ZERO beneficiaries — nothing to place, nothing paid', () => {
    const result = runDistribution(family([]));
    expect(result.lines).toStrictEqual([]);
    expect(result.flags).toContain('NO_ELIGIBLE_BENEFICIARIES');
    // The whole distributable is retained, attached to no line — not quietly absorbed.
    expect(result.totals.retainedMinor).toBe(DISTRIBUTABLE);
  });

  it('MUST refuse · a jiha beside real FAMILY members keeps its OWN discriminator', () => {
    // The older cohort check still fires first here. Asserted separately so neither refusal can
    // quietly absorb the other's cases — a merge would show up as a discriminator change.
    for (const waqfType of ['FAMILY_DHURRI', 'PUBLIC_CHARITABLE'] as const)
      expectRefused(
        {
          ...family([placed('esc-f1', 'FAMILY', 1, null, true), JIHA]),
          waqfType,
        },
        'COHORT_MIXES_CHARITABLE_AND_FAMILY',
      );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · ⚠ ESC-1 — the surviving route
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('3 · ESC-1 · CLOSED — the jiha can no longer stand beside members placed in the tree', () => {
  /**
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   * ESC-1 · **FOUND HERE, AND NOW CLOSED.** Severity was HIGH.
   * ══════════════════════════════════════════════════════════════════════════════════════════════
   *
   * ⚠⚠ **EVERY TEST BELOW IS INVERTED, EXACTLY AS THIS BLOCK'S LAST PARAGRAPH INSTRUCTED — the
   * inputs are verbatim and each MEASURED figure is preserved in the comment above its assertion.**
   * `DESCENDANT_ON_CHARITABLE_WAQF` (`assertSingleWaqfNature`, Stage 0) refuses a beneficiary
   * carrying a `lineageLink` on a `PUBLIC_CHARITABLE` waqf, whatever the `entitlementOrder` — the
   * mirror of `CHARITABLE_JIHA_ON_FAMILY_WAQF`, read from the other end.
   *
   * ⚠ **The underlying disagreement this block identified is NOT repaired, and must not be reported
   * as repaired.** `COHORT_MIXES_CHARITABLE_AND_FAMILY` still keys on `kind === 'FAMILY'` and
   * `CHARITABLE_JIHA_ON_FAMILY_WAQF` still keys on the declared type; neither keys on membership of
   * the lineage graph. The new refusal keys on the `lineageLink` field, which is the closest
   * available proxy and is why it lands — but "is a `CATEGORY_ONLY` member carrying a lineage edge a
   * family leg?" is still unanswered, and it is still a fiqh/product question (binding rule 4).
   *
   * ⚠ **And the closure has a price, measured next door:** R6 requires that link on every
   * `CATEGORY_ONLY` record, so a وقف خيري's unnamed segment cannot be recorded either way — R6-F1,
   * `r6-adversarial.test.ts` §5, severity raised to HIGH on exactly this ground.
   *
   * ── THE ORIGINAL FINDING, KEPT VERBATIM ───────────────────────────────────────────────────────
   * The cohort is R6-D1's, with **one field changed**: `waqfType` reads `PUBLIC_CHARITABLE` instead of
   * `FAMILY_DHURRI`. Everything else — `CATEGORY_ONLY` placeholders carrying real lineage edges at
   * derived ṭabaqāt 1 and 2, one licensed jiha, `ORDERED` — is identical, and identical to the
   * register `assertSingleWaqfNature`'s own comment calls "a legitimate family waqf with an unnamed
   * descendant".
   *
   * Neither surviving check can see it: `COHORT_MIXES_CHARITABLE_AND_FAMILY` counts only
   * `kind === 'FAMILY'` (there is none) and `CHARITABLE_JIHA_ON_FAMILY_WAQF` reads the declared type
   * (which now says charitable). Meanwhile `buildLineage` certifies both placeholders as descendants
   * of the waqif and publishes `lineageDepth` and `lineageLink: 'SON'` on the BR-505 basis their
   * Arabic statement prints. **The engine says bloodline on one line and charity on the next, in the
   * same run, and pays the charity out of the same pool.**
   *
   * ⚠ Read alongside **R6-F1** (`r6-adversarial.test.ts` §5): R6 requires a `lineageLink` on every
   * `CATEGORY_ONLY` record whatever the waqf type, so a خيري waqf's unnamed segment can *only* be
   * recorded by asserting it is a child of the waqif. Some of these certified descendants are
   * therefore fictions the engine itself demanded — which is precisely why the engine cannot tell this
   * cell from a real ذري register that was mistyped.
   *
   * **What is NOT decided, and must not be decided in a code change:** whether a `CATEGORY_ONLY`
   * member carrying a lineage edge is a family leg — i.e. whether the mixing check should key on
   * membership of the lineage graph rather than on `kind`. That is a reading of the deed, and it
   * cannot be settled without also settling R6-F1. The options and their tradeoffs go to the product
   * owner; nothing here picks one.
   *
   * These tests assert the CURRENT behaviour. If the route is closed they go red, and the fix is to
   * INVERT them onto the refusal — never to delete them.
   */
  const P1 = placed('esc-p1', 'CATEGORY_ONLY', 1, null, true);
  const P2 = placed('esc-p2', 'CATEGORY_ONLY', 2, 'esc-p1', true);
  const escInput = (beneficiaries: readonly Raw[], order = 'ORDERED'): DistributionInputRaw =>
    ({
      ...exampleA(),
      waqfType: 'PUBLIC_CHARITABLE',
      entitlementOrder: order,
      beneficiaries,
    }) as DistributionInputRaw;

  /* ─────────────────────────────────────────────────────────────────────────────────────────
   * ⚠⚠ INVERTED A SECOND TIME (product owner, 2026-08-03 · `TABAQA_ON_CHARITABLE_WAQF`).
   *
   * `placed()` records a ṭabaqa as well as a `lineageLink` — it has to, since `buildLineage`
   * cross-checks the two — so every cohort in this block carries BOTH facts, and the newer rule (no
   * beneficiary of a وقف خيري may carry a ṭabaqa) is checked BEFORE ESC-1 inside
   * `assertSingleWaqfNature`. MEASURED on every input below: `DESCENDANT_ON_CHARITABLE_WAQF` before,
   * `TABAQA_ON_CHARITABLE_WAQF` after. The inputs are unchanged and every MEASURED figure above each
   * assertion still records what the cohort used to PAY, which is what these tests are for.
   *
   * ⚠ ESC-1's own discriminator is NOT left untested as a result — that would hand the next reader a
   * refusal with no coverage. {@link NO_TABAQA} strips the tier and keeps the fictional edge, which is
   * the one shape that still reaches ESC-1 through `runDistribution`, and it is driven beside each
   * inversion. (The §1 grid has no axis value for it: its `EDGES` axis pairs the link and the tier,
   * so ESC-1 vanishes from that census entirely — see the note there.)
   * ───────────────────────────────────────────────────────────────────────────────────────── */
  /** The same record with the generational claim dropped and the descent claim kept — ESC-1's residue. */
  const NO_TABAQA = (member: Raw): Raw => patched(member, { tabaqa: null });

  it('INVERTED · the cohort that paid the jiha 13,750,000 beside a LIVING descendant now HALTS', () => {
    // ── MEASURED BEFORE ESC-1, on this exact input ────────────────────────────────────────────
    // ORDERED, ṭabaqa 1 alive ⇒ entitled tier 1 ⇒ the placeholder (weight 10) and the jiha (weight
    // 10, untiered so no tier test applied to it at all) split the pool:
    //     27,500,000 × 10/20 = 13,750,000 each. Σ 27,500,000, residual 0.
    //   { esc-jiha: PAID/null:13750000, esc-p1: PAID/null:13750000,
    //     esc-p2: EXCLUDED/UPPER_TABAQA_EXTANT:0 }
    // …with the engine's OWN certification on the same run — `basis.lineageDepth` 1 and 2 on the two
    // placeholders and `null` on the payee beside them — the only flag `UNVERIFIED_FIGURES_APPLIED`,
    // and I5 reported as checked. The 13,750,000 was DIVERTED, not merely shared: the identical
    // register without the jiha paid esc-p1 the whole 27,500,000.
    const error = expectRefused(escInput([P1, P2, JIHA]), 'TABAQA_ON_CHARITABLE_WAQF');
    // The refusal names the offending records — the fact it is keyed on.
    expect(error.message).toContain('esc-p1');
    expect(error.message).toContain('esc-p2');

    // ⚠ THE CONTROL, and it is the one that matters: the refusal is keyed on the DESCENDANTS, not on
    // the jiha, so removing the charity does NOT make the record legal. Without this assertion a
    // reader would take the refusal above to mean "the charity was the problem" — it was not; the
    // خيري waqf claiming a bloodline is.
    expectRefused(escInput([P1, P2]), 'TABAQA_ON_CHARITABLE_WAQF');

    // ⚠ AND ESC-1 ITSELF, on the same cohort with the generational claim dropped. One field apart:
    // the descent claim alone is still `DESCENDANT_ON_CHARITABLE_WAQF`, so the newer rule has not
    // absorbed the older one's meaning — only its cells on this particular cohort.
    const esc1 = expectRefused(
      escInput([NO_TABAQA(P1), NO_TABAQA(P2), JIHA]),
      'DESCENDANT_ON_CHARITABLE_WAQF',
    );
    expect(esc1.message).toContain('esc-p1');
    expect(esc1.message).toContain('esc-p2');
    expectRefused(escInput([NO_TABAQA(P1), NO_TABAQA(P2)]), 'DESCENDANT_ON_CHARITABLE_WAQF');
  });

  it('INVERTED · the 90%-deed-weight variant halts on the same rule, weight irrelevant', () => {
    // MEASURED BEFORE ESC-1: the dilution was unbounded by anything but the deed weight, because the
    // jiha stood outside the tier contest entirely —
    //     27,500,000 × 90/100 = 24,750,000 to the charity, 27,500,000 × 10/100 = 2,750,000 to the
    //     certified descendant. Σ 27,500,000, residual 0.
    // The refusal does not read `stipulatedWeight` at all, which is the point: it is not a size
    // threshold, it is a statement about what kind of endowment this is.
    expectRefused(
      escInput([P1, P2, patched(JIHA, { stipulatedWeight: '90' })]),
      'TABAQA_ON_CHARITABLE_WAQF',
    );
    // …and the same weight-irrelevance claim on ESC-1's own residue.
    expectRefused(
      escInput([NO_TABAQA(P1), NO_TABAQA(P2), patched(JIHA, { stipulatedWeight: '90' })]),
      'DESCENDANT_ON_CHARITABLE_WAQF',
    );
  });

  it('INVERTED · the all-descendants-dead variant halts too — S3-D1 outcome unreachable here', () => {
    // MEASURED BEFORE ESC-1: **S3-D1's outcome sentence verbatim** — no living ṭabaqa ⇒ every tiered
    // member EXCLUDED/TABAQA_EXTINCT ⇒ the untiered jiha the sole entitled head ⇒
    //     27,500,000 × 10/10 = **27,500,000 of 27,500,000** to the charity, residual 0,
    // with the only flag `UNVERIFIED_FIGURES_APPLIED` and I5 reported as checked.
    //
    // ⚠ Vital status is irrelevant to the refusal, and that is deliberate: it is keyed on the
    // recorded `lineageLink`, which a death does not remove. A rule that read `active` would leave
    // this exact cell — the most expensive one — open.
    expectRefused(
      escInput([patched(P1, { active: false }), patched(P2, { active: false }), JIHA]),
      'TABAQA_ON_CHARITABLE_WAQF',
    );
    // Vital status is irrelevant to ESC-1's residue for the same reason — the recorded `lineageLink`
    // survives a death, and so does the refusal.
    expectRefused(
      escInput([
        NO_TABAQA(patched(P1, { active: false })),
        NO_TABAQA(patched(P2, { active: false })),
        JIHA,
      ]),
      'DESCENDANT_ON_CHARITABLE_WAQF',
    );
  });

  it('INVERTED · SHARED reached the same place by another route, and is refused by the same rule', () => {
    // MEASURED BEFORE ESC-1: tashrik runs no tier test, so all three were entitled and the charity
    // took a third of a pool two certified descendants would otherwise have halved. Weights 10:10:10:
    //     27,500,000 / 3 = 9,166,666.67 ⇒ floor 9,166,666 each, Σ 27,499,998, residual 2 halalas to
    //     the two largest remainders, tie-broken by ascending id ('esc-jiha' < 'esc-p1' < 'esc-p2')
    //     ⇒ 9,166,667 / 9,166,667 / 9,166,666.
    //
    // ⚠ The refusal is asserted on BOTH non-lineage orders here, because that is precisely the gap
    // `LINEAGE_ORDER_ON_CHARITABLE_WAQF` left: it fires only under `LINEAGE_CONTINUATION`, and ESC-1
    // lived under ORDERED and SHARED.
    for (const order of ['ORDERED', 'SHARED']) {
      expectRefused(escInput([P1, P2, JIHA], order), 'TABAQA_ON_CHARITABLE_WAQF');
      expectRefused(
        escInput([NO_TABAQA(P1), NO_TABAQA(P2), JIHA], order),
        'DESCENDANT_ON_CHARITABLE_WAQF',
      );
    }
  });

  it('the route is one field wide — the same cohort typed ذري is refused', () => {
    // The whole of ESC-1, in one contrast: `waqfType` is the only difference between the run above
    // that pays a charity and the run below that halts. A single mis-typed deed field is the boundary.
    expectRefused(
      { ...escInput([P1, P2, JIHA]), waqfType: 'FAMILY_DHURRI' },
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · THE AXES ARE THE VOCABULARY — a new enum member cannot escape the grids
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ **The failure mode this section exists for is the one that made four prior verdicts false:**
 * an enumeration is only a proof of a negative over the values it enumerates, and every grid in this
 * file hard-codes its axis values as string literals. If `BENEFICIARY_KINDS` ever gains a fourth
 * member, or `WAQF_TYPES` a fourth, every grid above and below keeps passing while saying nothing
 * about the new value — the enumeration silently stops being exhaustive and the verdict it supports
 * silently stops being true.
 *
 * So the axes are pinned to the **exported closed vocabularies**, not merely counted. This is the
 * only assertion in the file that can fail because of a change in `contract.ts` alone, and that is
 * precisely its job.
 */
describe('4 · the enumeration axes ARE the contract vocabularies, not a hand-picked subset', () => {
  it('every axis covers its whole closed vocabulary — a new enum member breaks this test first', () => {
    expect([...WAQF_TYPES].sort()).toStrictEqual([...CONTRACT_WAQF_TYPES].sort());
    expect([...ORDERS].sort()).toStrictEqual([...ENTITLEMENT_ORDERS].sort());
    // The continuation axis is the vocabulary PLUS `null` — "not recorded" is a distinct input state
    // and the one that must halt, so it is an axis value, not an omission.
    expect([...CONTINUATIONS].sort()).toStrictEqual([null, ...CONTINUATION_STIPULATIONS].sort());
    // The kind axis is driven as the eight SUBSETS of the three kinds (`KIND_SETS`), so what must
    // match the vocabulary is the union of those subsets.
    expect([...new Set(KIND_SETS.flat())].sort()).toStrictEqual([...BENEFICIARY_KINDS].sort());
    expect([...DEEP_LINKS].sort()).toStrictEqual([...LINEAGE_LINKS].sort());
  });

  it('and the counts are pinned, so a vocabulary that SHRINKS is caught too', () => {
    expect(CONTRACT_WAQF_TYPES).toHaveLength(3);
    expect(ENTITLEMENT_ORDERS).toHaveLength(4);
    expect(CONTINUATION_STIPULATIONS).toHaveLength(2);
    expect(BENEFICIARY_KINDS).toHaveLength(3);
    expect(LINEAGE_LINKS).toHaveLength(2);
    expect(KIND_SETS).toHaveLength(8); // 2³ — every subset, including the empty cohort.
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · PAST THE PREVIOUS BOUNDS — three generations, both links
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠⚠ **THE BOUNDS THE PREVIOUS VERDICT DECLARED, AND WHY THEY WERE NOT ENOUGH.**
 *
 * §1's grid is exhaustive over its axes and explicitly bounded at **depth ≤ 2**, **≤ 2 members per
 * kind**, **`lineageLink: 'SON'` throughout**, and **one money shape**. Its own verdict recorded that
 * it "could not see an escape that needs three generations" — which is a statement about the grid,
 * not about the engine. Three generations is exactly where R-FRONTIER first has something to do that
 * two cannot express:
 *
 *  · an ancestor who is **intermediate but not a root** — `dg-2` is both somebody's parent and
 *    somebody's child, so a `DAUGHTER` link on it breaks the line for `dg-3` while `dg-2` itself is
 *    entitled. At depth 2 the only intermediate ancestor is a root, and a root's link is read for
 *    nobody's exclusion but its own children's.
 *  · **two reasons competing on one person** — `dg-3` under `ZUHUR_ONLY` with `dg-2` alive AND a
 *    daughter is blocked by both rung 2 and rung 3, which is the precedence the resolver's own
 *    `TODO(surface)` flags as engineering's call. At depth 2 the two cannot co-occur on a member
 *    whose ancestor chain has length 1.
 *  · **a link that must NOT be read** — `dg-2`'s own `DAUGHTER` link is irrelevant to `dg-2`'s
 *    entitlement. A depth-2 grid where every link is `SON` cannot tell a correct engine from one
 *    that reads the beneficiary's own link.
 *
 * The chain, all invented:
 *
 *     waqif
 *     └── dg-1  SON          ṭ1
 *         └── dg-2  <SON|DAUGHTER>  ṭ2
 *             └── dg-3  SON      ṭ3
 *     (optional) dg-p  CATEGORY_ONLY  DAUGHTER  ṭ2  — a second child of dg-1, always living
 *
 * `dg-p` carries a `DAUGHTER` link at a **leaf** position: a line may end in a daughter, and her own
 * link is never read, so she must be entitled under `ZUHUR_ONLY` whenever `dg-1` is dead.
 */
const DEEP_LINKS = ['SON', 'DAUGHTER'] as const;
/** Liveness of (dg-1, dg-2, dg-3) as a 3-bit pattern — all 8, not a hand-picked few. */
const DEEP_LIVENESS = [0, 1, 2, 3, 4, 5, 6, 7] as const;
const DEEP_EXTRAS = ['NONE', 'JIHA', 'PLACEHOLDER'] as const;
const DEEP_EDGES = ['FULL', 'LEAF_UNLINKED'] as const;

function deepMember(
  id: string,
  kind: 'FAMILY' | 'CATEGORY_ONLY',
  depth: 1 | 2 | 3,
  parentId: string | null,
  link: 'SON' | 'DAUGHTER',
  active: boolean,
  weight = '10',
): Raw {
  return beneficiary({
    id,
    kind,
    active,
    tabaqa: depth,
    parentId,
    lineageLink: link,
    // `line` is carried to the statement and is NOT cross-checked against `lineageLink` by any engine
    // rule (verified: no reader outside `basisFor`/the trace). Kept consistent anyway so a reader of
    // a failure message is not misled about which fact the engine acted on.
    line: link === 'SON' ? 'ZUHUR' : 'BUTUN',
    branch: 'Deep Branch (fictional)',
    stipulatedWeight: weight,
    verificationStatus: 'VERIFIED',
    kycLastRefreshed: '2026-01-15',
    category: kind === 'CATEGORY_ONLY' ? 'descendants not yet enrolled (fictional)' : null,
    residency: 'DOMESTIC',
    disbursingEntity: null,
    bankingRefForProceeds: `FAKE-IBAN-${id}`,
  });
}

function deepCohort(
  middleLink: (typeof DEEP_LINKS)[number],
  liveness: number,
  extra: (typeof DEEP_EXTRAS)[number],
  edge: (typeof DEEP_EDGES)[number],
  weights: readonly [string, string, string, string] = ['10', '10', '10', '10'],
  placeholderActive = true,
): readonly Raw[] {
  const alive = (bit: number): boolean => (liveness & (1 << bit)) !== 0;
  const g1 = deepMember('dg-1', 'FAMILY', 1, null, 'SON', alive(0), weights[0]);
  const g2 = deepMember('dg-2', 'FAMILY', 2, 'dg-1', middleLink, alive(1), weights[1]);
  const g3raw = deepMember('dg-3', 'FAMILY', 3, 'dg-2', 'SON', alive(2), weights[2]);
  // The S3-D1 shape carried to the deepest position available: the LEAF loses its edge, so the two
  // generations above it are fully placed and only the member that would be paid last is unplaceable.
  const g3 =
    edge === 'FULL' ? g3raw : patched(g3raw, { lineageLink: null, parentId: null, tabaqa: null });
  const out: Raw[] = [g1, g2, g3];
  if (extra === 'JIHA') out.push(JIHA);
  if (extra === 'PLACEHOLDER')
    out.push(
      deepMember('dg-p', 'CATEGORY_ONLY', 2, 'dg-1', 'DAUGHTER', placeholderActive, weights[3]),
    );
  return out;
}

interface DeepCell {
  readonly waqfType: (typeof WAQF_TYPES)[number];
  readonly order: (typeof ORDERS)[number];
  readonly continuation: (typeof CONTINUATIONS)[number];
  readonly middleLink: (typeof DEEP_LINKS)[number];
  readonly liveness: number;
  readonly extra: (typeof DEEP_EXTRAS)[number];
  readonly edge: (typeof DEEP_EDGES)[number];
  readonly key: string;
  readonly outcome: string;
  readonly unplaced: readonly string[];
  readonly paid: readonly string[];
  readonly entitledIds: readonly string[];
  readonly reasons: Readonly<Record<string, string>>;
  readonly paidTotal: bigint;
}

function driveDeepGrid(): readonly DeepCell[] {
  const cells: DeepCell[] = [];
  for (const waqfType of WAQF_TYPES)
    for (const order of ORDERS)
      for (const continuation of CONTINUATIONS)
        for (const middleLink of DEEP_LINKS)
          for (const liveness of DEEP_LIVENESS)
            for (const extra of DEEP_EXTRAS)
              for (const edge of DEEP_EDGES) {
                const key = [
                  waqfType,
                  order,
                  continuation ?? 'null',
                  middleLink,
                  `L${String(liveness)}`,
                  extra,
                  edge,
                ].join(' | ');
                const input = {
                  ...exampleA(),
                  waqfType,
                  entitlementOrder: order,
                  continuationStipulation: continuation,
                  beneficiaries: deepCohort(middleLink, liveness, extra, edge),
                } as DistributionInputRaw;
                const base = {
                  waqfType,
                  order,
                  continuation,
                  middleLink,
                  liveness,
                  extra,
                  edge,
                  key,
                } as const;
                try {
                  const result = runDistribution(input);
                  const paidLines = payees(result);
                  cells.push({
                    ...base,
                    outcome: 'RESOLVED',
                    unplaced: unplacedPaidLines(result).map((line) => line.beneficiaryId),
                    paid: paidLines.map((line) => line.beneficiaryId),
                    entitledIds: paidLines.map((line) => line.beneficiaryId),
                    reasons: statusesById(result),
                    paidTotal: paidLines.reduce(
                      (sum, line) => sum + (line.entitledMinor as bigint),
                      0n,
                    ),
                  });
                } catch (error) {
                  if (!isDomainError(error)) throw error;
                  expect(error.code, `${key} threw an untyped failure`).toBe('SHART_INCOMPLETE');
                  const refusal = (error.details as { refusal?: string } | undefined)?.refusal;
                  cells.push({
                    ...base,
                    outcome: refusal ?? 'SHART_INCOMPLETE(no discriminator)',
                    unplaced: [],
                    paid: [],
                    entitledIds: [],
                    reasons: {},
                    paidTotal: 0n,
                  });
                }
              }
  return cells;
}

const DEEP_CELLS = driveDeepGrid();

describe('5 · the deep grid — depth 3, both lineage links, every liveness pattern', () => {
  it('drives exactly 3 × 4 × 3 × 2 × 8 × 3 × 2 = 3,456 cells, all distinct', () => {
    expect(DEEP_CELLS).toHaveLength(3_456);
    expect(new Set(DEEP_CELLS.map((cell) => cell.key)).size).toBe(3_456);
  });

  /**
   * The census, derived BY HAND from the refusal precedence, not read off the run.
   *
   * `assertSingleWaqfNature` runs first, in this order: JOINT → mixed cohort → descendant-on-charity
   * → jiha-on-family → lineage-order-on-charity. The base chain is **always three `FAMILY` members**,
   * so `familyCount ≥ 3` in every cell — which decides most of the grid before anything else runs.
   *
   *  · `WAQF_TYPE_JOINT_NOT_SUPPORTED` — refused first, unconditionally:
   *      1 type × 4 orders × 3 cont × 2 links × 8 liveness × 3 extras × 2 edges = **1,152**
   *  · `COHORT_MIXES_CHARITABLE_AND_FAMILY` — jiha AND family present. `extra === 'JIHA'` is 1 of 3
   *    extras, on the 2 legal types: 2 × 4 × 3 × 2 × 8 × 1 × 2 = **768**
   *  · `TABAQA_ON_CHARITABLE_WAQF` — **768**, and it is the SAME 768 cells `DESCENDANT_ON_CHARITABLE_
   *    WAQF` held until 2026-08-03. ⚠ INVERTED: the ṭabaqa rule is checked first, and `dg-1` and
   *    `dg-2` always carry both a link AND a ṭabaqa (the `LEAF_UNLINKED` edge strips only `dg-3`), so
   *    every خيري cell trips the newer rule before the older one is consulted:
   *      1 × 4 × 3 × 2 × 8 × 2 extras × 2 = **768**.
   *    ESC-1's discriminator is therefore **absent from this grid too**; it is driven directly in §3,
   *    on the one shape neither grid has an axis value for (a link recorded WITHOUT a ṭabaqa).
   *  · `CHARITABLE_JIHA_ON_FAMILY_WAQF` — **0**, and that is a fact about the grid, not the engine:
   *    `COHORT_MIXES` outranks it and fires on every ذري+jiha cell here, because the chain guarantees
   *    a `FAMILY` member. §1 and §2 drive the jiha-alone shape that reaches it.
   *  · `LINEAGE_ORDER_ON_CHARITABLE_WAQF` — **0**, for the same reason: every خيري cell is already
   *    taken by the ṭabaqa rule, which is checked earlier.
   *
   * That leaves 3,456 − 1,152 − 768 − 768 = **768** cells at Stage 2, all ذري, no jiha:
   *  · `NA_DIRECT_USE` refuses neither the unreadable continuation term nor a missing leaf edge:
   *      1 order × 3 cont × 2 × 8 × 2 extras × 2 = **192 RESOLVED**
   *    ⚠ This line read "short-circuits **before** the continuation parse and before `buildLineage`".
   *    Half false since memo Q7 (2026-08-17): `buildLineage` runs above the short-circuit now, and the
   *    192 cells still RESOLVE only because this grid's `LEAF_UNLINKED` axis strips the link AND the
   *    parent edge AND the ṭabaqa together — so it produces an *incomplete* record (pass 4, still
   *    outranked) and never a *contradictory* one. Give the leaf a dangling `parentId` instead and these
   *    cells refuse. The count is unchanged; the reason it holds is narrower than stated.
   *  · `CONTINUATION_STIPULATION_UNRECOGNISED` — the lineage order with the term not recorded. The
   *    parse runs before `buildLineage`, so it outranks the missing leaf edge:
   *      1 order × 1 cont(null) × 2 × 8 × 2 × 2 = **64**
   *  · of the remaining 512 (lineage×2 cont = 128, ORDERED = 192, SHARED = 192), the `LEAF_UNLINKED`
   *    half hits `LINEAGE_LINK_MISSING` on `dg-3` — R6, on every order: **256**
   *  · the `FULL` half builds the graph, every declared ṭabaqa equals its derived depth: **256 RESOLVED**
   *
   * RESOLVED = 192 + 256 = **448**. Sum: 1,152 + 768 + 768 + 64 + 256 + 448 = 3,456. ✓
   */
  it('the deep census is exactly what the refusal precedence predicts', () => {
    const census: Record<string, number> = {};
    for (const cell of DEEP_CELLS) census[cell.outcome] = (census[cell.outcome] ?? 0) + 1;
    expect(census).toStrictEqual({
      WAQF_TYPE_JOINT_NOT_SUPPORTED: 1_152,
      COHORT_MIXES_CHARITABLE_AND_FAMILY: 768,
      TABAQA_ON_CHARITABLE_WAQF: 768,
      CONTINUATION_STIPULATION_UNRECOGNISED: 64,
      LINEAGE_LINK_MISSING: 256,
      RESOLVED: 448,
    });
    // ⚠ ABSENT, not zero-by-accident. Asserted so the absorption is pinned rather than resting on a
    // `toStrictEqual` a later reader skims.
    expect(census['DESCENDANT_ON_CHARITABLE_WAQF']).toBeUndefined();
    expect(1_152 + 768 + 768 + 64 + 256 + 448).toBe(3_456);
  });

  /**
   * ⚠⚠ **THE VERDICT CELL AT DEPTH 3. Zero — and zero is the honest number here, not a stronger
   * claim than §1's 54.** §1's 54 escapees were all the legal `jiha-alone` cohort on a خيري waqf;
   * this grid never contains that cohort, because the three-generation chain is always present, so
   * every jiha cell is refused by `COHORT_MIXES_CHARITABLE_AND_FAMILY` before any money moves. The
   * two grids therefore prove different halves: §1 that the only unplaced payee anywhere is a
   * charity with no bloodline beside it, this one that adding a third generation and a daughter link
   * creates no new unplaced payee at all.
   */
  /**
   * ⚠⚠ **MUTATION-VERIFIED, AND THIS IS THE ONE THAT MATTERS.** Disabling R6's mandatory lineage
   * edge (`buildLineage` pass 4, `LINEAGE_LINK_MISSING`) and re-driving this grid produces **128
   * resolving cells with an unplaced payee**, and the assertion below fails on the ESCAPE PREDICATE
   * itself — not on a cell count. The smallest one measured:
   *
   *     FAMILY_DHURRI | LINEAGE_CONTINUATION | ZUHUR_ONLY | SON | L4 | NONE | LEAF_UNLINKED
   *       dg-1 dead · dg-2 dead · dg-3 alive, and dg-3's lineage edge stripped
   *       ⇒ entitled = ['dg-3'], PAID 27,500,000 of 27,500,000 halalas
   *
   * `lineageFrontierVerdict` reads `ancestorsById.get('dg-3') ?? []` — an empty chain for a member
   * who is not in the graph — so the unplaceable member satisfies "every intermediate ancestor is
   * deceased" **vacuously**, is entitled, and takes the whole pool that belonged to the bloodline.
   * That is the escape class verbatim, one generation deeper than any previous grid could express,
   * and R6 is what stands between the engine and it. The `?? []` fails OPEN by construction; R6 is
   * its only guard, so R6 is not a tidiness rule and must not be relaxed for convenience.
   */
  it('NOT ONE resolving deep cell pays a line the engine could not place', () => {
    const resolved = DEEP_CELLS.filter((cell) => cell.outcome === 'RESOLVED');
    // ⚠ THE VERDICT ASSERTION COMES FIRST, AND THE ORDER IS DELIBERATE. It was originally written
    // after the `toHaveLength(448)` coverage pin, and a mutation run proved that ordering DISHONEST:
    // disabling ESC-1 made this test go red on the COUNT (448 → 832) without the escape predicate
    // ever being evaluated, which reads in a CI log as "the escape reappeared" when what actually
    // changed was how many cells resolve. Four prior verdicts on this file were overstated in
    // exactly that way. Verdict first, coverage second.
    expect(resolved.filter((cell) => cell.unplaced.length > 0)).toStrictEqual([]);
    // Coverage pin, NOT the verdict: it fails whenever the refusal precedence moves at all.
    expect(resolved).toHaveLength(448);
  });

  /**
   * ⚠⚠ **MEASURED, AND IT NARROWS WHAT THIS GRID PROVES — recorded because the opposite is the
   * tempting claim.** Disabling `DESCENDANT_ON_CHARITABLE_WAQF` and re-driving this grid yields 832
   * resolving cells instead of 448, and **every one of the 384 newly-resolving cells pays only
   * members the engine placed** (measured: خيري under `ORDERED`/`SHARED`, the whole chain in the
   * graph, `UNPLACED=[]` in all of them; the lineage order is still refused by
   * `LINEAGE_ORDER_ON_CHARITABLE_WAQF`).
   *
   * So on THIS grid ESC-1 is load-bearing for **R5** — a خيري waqf must not pay the waqif's
   * bloodline — and **not** for the escape class. The escape class needs an *unplaceable* payee
   * standing beside a bloodline, and the only cohort that produces one is a `CHARITABLE_JIHA` beside
   * placed descendants on a خيري waqf. That cohort cannot occur here, because the always-present
   * three-`FAMILY` chain makes every jiha cell `COHORT_MIXES_CHARITABLE_AND_FAMILY` first. It is
   * §1's cohort `{CATEGORY_ONLY, CHARITABLE_JIHA}` and §3's inverted cases that carry that half, and
   * those DO go red under the same mutation.
   *
   * The two grids are therefore complements, and neither alone supports the verdict.
   */
  it('the deep grid constrains R5 — the escape-class half rests on §1/§3, not on this grid', () => {
    // No cell here can hold a jiha beside a placed descendant, which is the only shape that produces
    // an unplaced payee next to a bloodline. Stated as an assertion so the complementarity is not
    // merely a comment: if a jiha ever survives Stage 0 on this grid, this test says so.
    const jihaCells = DEEP_CELLS.filter((cell) => cell.extra === 'JIHA');
    expect(jihaCells).toHaveLength(1_152);
    expect(new Set(jihaCells.map((cell) => cell.outcome))).toStrictEqual(
      new Set(['WAQF_TYPE_JOINT_NOT_SUPPORTED', 'COHORT_MIXES_CHARITABLE_AND_FAMILY']),
    );
    expect(jihaCells.filter((cell) => cell.outcome === 'RESOLVED')).toStrictEqual([]);
  });

  it('and the 192 NA_DIRECT_USE cells pay NOBODY at all — an empty cohort, not an unplaced one', () => {
    // The one resolving route on this grid that never builds the lineage graph. If it paid anyone,
    // the escape predicate above would be reading `lineageDepth: null` on a real payee. It pays
    // nobody: `resolveEntitlement` returns `resolved: []` before `buildLineage` is reached.
    const directUse = DEEP_CELLS.filter(
      (cell) => cell.outcome === 'RESOLVED' && cell.order === 'NA_DIRECT_USE',
    );
    // Verdict first here too, for the same reason as above.
    for (const cell of directUse) {
      expect(cell.paid, cell.key).toStrictEqual([]);
      expect(cell.paidTotal, cell.key).toBe(0n);
    }
    expect(directUse).toHaveLength(192);
  });

  /**
   * ⚠ **ANTI-VACUITY.** A grid that refused everything would also satisfy the verdict cell. These
   * assertions prove the 256 graph-building cells actually resolve a cohort and move money, and that
   * the two axes this grid was built to add — the third generation and the `DAUGHTER` link — change
   * the answer rather than sitting inert.
   */
  it('the deep grid is NOT vacuous — the third generation and the daughter link both move the cohort', () => {
    const money = DEEP_CELLS.filter(
      (cell) => cell.outcome === 'RESOLVED' && cell.order !== 'NA_DIRECT_USE',
    );
    expect(money).toHaveLength(256);
    // Somebody is paid in most of them; the exceptions are the wholly-extinct cohorts.
    expect(money.filter((cell) => cell.paid.length > 0).length).toBeGreaterThan(0);
    // dg-3 — the third generation — is genuinely reachable as a payee, which is the whole point of
    // going past depth 2.
    expect(money.filter((cell) => cell.paid.includes('dg-3')).length).toBeGreaterThan(0);

    // THE DAUGHTER AXIS IS LOAD-BEARING: under ZUHUR_ONLY, holding everything else equal, flipping
    // dg-2's link from SON to DAUGHTER must change the entitled cohort in at least one cell. If this
    // ever stops being true, the engine has stopped reading the intermediate ancestor's link.
    const zuhurOnly = money.filter(
      (cell) => cell.order === 'LINEAGE_CONTINUATION' && cell.continuation === 'ZUHUR_ONLY',
    );
    expect(zuhurOnly.length).toBeGreaterThan(0);
    const differing = zuhurOnly.filter((cell) => {
      if (cell.middleLink !== 'SON') return false;
      const twin = zuhurOnly.find(
        (other) =>
          other.middleLink === 'DAUGHTER' &&
          other.liveness === cell.liveness &&
          other.extra === cell.extra &&
          other.edge === cell.edge,
      );
      return twin !== undefined && twin.paid.join(',') !== cell.paid.join(',');
    });
    expect(differing.length).toBeGreaterThan(0);

    // …and it is INERT under ZUHUR_AND_BUTUN, which is the other half of the same claim: that term
    // applies no line filter at all, so the same flip must change nothing.
    const both = money.filter(
      (cell) => cell.order === 'LINEAGE_CONTINUATION' && cell.continuation === 'ZUHUR_AND_BUTUN',
    );
    expect(both.length).toBeGreaterThan(0);
    for (const cell of both.filter((c) => c.middleLink === 'SON')) {
      const twin = both.find(
        (other) =>
          other.middleLink === 'DAUGHTER' &&
          other.liveness === cell.liveness &&
          other.extra === cell.extra &&
          other.edge === cell.edge,
      );
      expect(twin, cell.key).toBeDefined();
      expect(twin?.paid, cell.key).toStrictEqual(cell.paid);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · THE OTHER BOUNDS — money shape, deed weights, and a wholly inactive cohort
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * §1 and §5 both drive **one** money shape (Example A's 27,500,000) and **one** weight vector (every
 * member at `'10'`). Neither is innocent for this question:
 *
 *  · a **nil** distributable makes every line 0, so a payee the engine could not place would carry 0
 *    and the escape predicate — which keys on `entitledMinor > 0` — would not see it. If a shape only
 *    ever escapes on a nil period, both grids above are blind to it.
 *  · a distributable **smaller than the head count** puts the whole payout into the Hamilton
 *    residual, which is allocated by a different code path from the quotient.
 *  · an **all-zero** deed vector is the one input where `ORDERED`/`SHARED` and `LINEAGE_CONTINUATION`
 *    disagree completely about the same record (excluded everywhere vs paid 100% per capita), and
 *    the resolver's own comment records that the earlier reasoning about it was FALSE.
 *  · a **wholly inactive** cohort leaves the distributable with no entitled head at all — the state
 *    in which "somebody unplaceable takes the pool" would be most profitable and least noticed.
 *
 * Every figure below is derived by hand in halalas. The waterfall is
 * `revenue − ṣiyāna − operating − Nazir fee`, and the fee is 10% **of revenue** (ʿushr, set by this
 * deed — ⚠ verify, may be stale; confirm vs primary law).
 */
interface MoneyShape {
  readonly name: string;
  readonly revenue: bigint;
  readonly siyana: bigint;
  /** Derived BY HAND below; asserted against the engine's own total in the coverage test. */
  readonly distributable: bigint;
}

const MONEY_SHAPES: readonly MoneyShape[] = [
  // 35,000,000 − 4,000,000 − 0 − 3,500,000 (10% of 35,000,000) = 27,500,000
  { name: 'STANDARD', revenue: 35_000_000n, siyana: 4_000_000n, distributable: 27_500_000n },
  //         10 −          9 − 0 −          1 (10% of 10)        =          0
  { name: 'NIL', revenue: 10n, siyana: 9n, distributable: 0n },
  //         10 −          8 − 0 −          1 (10% of 10)        =          1
  { name: 'ONE_HALALA', revenue: 10n, siyana: 8n, distributable: 1n },
  //        100 −         83 − 0 −         10 (10% of 100)       =          7
  { name: 'SEVEN_HALALAS', revenue: 100n, siyana: 83n, distributable: 7n },
];

const WEIGHT_SHAPES = [
  { name: 'ALL_TEN', weights: ['10', '10', '10', '10'] },
  { name: 'ALL_ZERO', weights: ['0', '0', '0', '0'] },
  { name: 'MIXED', weights: ['10', '20', '30', '40'] },
] as const satisfies readonly {
  readonly name: string;
  readonly weights: readonly [string, string, string, string];
}[];

/** The four money-bearing orders, with the continuation term each one legally requires. */
const MONEY_ORDERS = [
  { order: 'LINEAGE_CONTINUATION', continuation: 'ZUHUR_ONLY' },
  { order: 'LINEAGE_CONTINUATION', continuation: 'ZUHUR_AND_BUTUN' },
  { order: 'ORDERED', continuation: null },
  { order: 'SHARED', continuation: null },
] as const;

interface ShapeCell {
  readonly key: string;
  readonly orderName: string;
  readonly money: MoneyShape;
  readonly weightName: string;
  readonly liveness: number;
  readonly placeholderActive: boolean;
  readonly outcome: string;
  readonly unplaced: readonly string[];
  readonly paid: readonly string[];
  readonly paidTotal: bigint;
  readonly flags: readonly string[];
}

function driveShapeGrid(): readonly ShapeCell[] {
  const cells: ShapeCell[] = [];
  for (const { order, continuation } of MONEY_ORDERS)
    for (const money of MONEY_SHAPES)
      for (const weight of WEIGHT_SHAPES)
        for (const liveness of DEEP_LIVENESS)
          for (const placeholderActive of [true, false]) {
            const orderName = `${order}${continuation === null ? '' : `/${continuation}`}`;
            const key = [
              orderName,
              money.name,
              weight.name,
              `L${String(liveness)}`,
              placeholderActive ? 'P_LIVE' : 'P_DEAD',
            ].join(' | ');
            const base = exampleA();
            const input = {
              ...base,
              waqfType: 'FAMILY_DHURRI',
              entitlementOrder: order,
              continuationStipulation: continuation,
              revenue: {
                incomeMinor: money.revenue,
                receipts: [
                  { id: 'rev-deep-001', receiptClass: 'INCOME', amountMinor: money.revenue },
                ],
              },
              operatingCostMinor: 0n,
              maintenance: { kind: 'FIXED', amountMinor: money.siyana },
              beneficiaries: deepCohort(
                'SON',
                liveness,
                'PLACEHOLDER',
                'FULL',
                weight.weights,
                placeholderActive,
              ),
            } as DistributionInputRaw;
            const stem = {
              key,
              orderName,
              money,
              weightName: weight.name,
              liveness,
              placeholderActive,
            } as const;
            try {
              const result = runDistribution(input);
              const paidLines = payees(result);
              // The engine's own distributable, checked against the hand figure in the coverage test.
              cells.push({
                ...stem,
                outcome: 'RESOLVED',
                unplaced: unplacedPaidLines(result).map((line) => line.beneficiaryId),
                paid: paidLines.map((line) => line.beneficiaryId),
                paidTotal: paidLines.reduce(
                  (sum, line) => sum + (line.entitledMinor as bigint),
                  0n,
                ),
                flags: [...result.flags],
              });
            } catch (error) {
              if (!isDomainError(error)) throw error;
              const refusal = (error.details as { refusal?: string } | undefined)?.refusal;
              cells.push({
                ...stem,
                outcome: refusal ?? `${error.code}(no discriminator)`,
                unplaced: [],
                paid: [],
                paidTotal: 0n,
                flags: [],
              });
            }
          }
  return cells;
}

const SHAPE_CELLS = driveShapeGrid();

describe('6 · money shape × deed weights × inactivity, over the one configuration that resolves', () => {
  it('drives exactly 4 × 4 × 3 × 8 × 2 = 768 cells, all distinct, and every one RESOLVES', () => {
    expect(SHAPE_CELLS).toHaveLength(768);
    expect(new Set(SHAPE_CELLS.map((cell) => cell.key)).size).toBe(768);
    // ذري, no jiha, every member placed, the continuation term supplied where the order consumes one:
    // nothing here is refusable, so a refusal would mean a rule fires on a legal family deed.
    const refused = SHAPE_CELLS.filter((cell) => cell.outcome !== 'RESOLVED');
    expect(refused.map((cell) => `${cell.key} → ${cell.outcome}`)).toStrictEqual([]);
  });

  it('⚠ THE VERDICT CELL · not one of the 768 pays a line the engine could not place', () => {
    expect(SHAPE_CELLS.filter((cell) => cell.unplaced.length > 0)).toStrictEqual([]);
    // Stated positively as well: every payee anywhere in this grid is one of the four placed members.
    expect(new Set(SHAPE_CELLS.flatMap((cell) => cell.paid))).toStrictEqual(
      new Set(['dg-1', 'dg-2', 'dg-3', 'dg-p']),
    );
  });

  it('conservation · the paid total is the hand-derived distributable, or exactly zero', () => {
    for (const cell of SHAPE_CELLS) {
      // I6: a gate stamps a status, it never moves an amount, so WITHHELD/CROSS_BORDER lines count
      // toward the total exactly like PAID ones. Either the cohort had a head and the whole
      // distributable went out, or it had none and nothing did. There is no third state — a partial
      // payout would mean halalas were created or destroyed between the waterfall and the lines.
      expect(
        cell.paidTotal === cell.money.distributable || cell.paidTotal === 0n,
        `${cell.key} paid ${String(cell.paidTotal)} against a distributable of ${String(cell.money.distributable)}`,
      ).toBe(true);
      if (cell.paid.length > 0) expect(cell.paidTotal, cell.key).toBe(cell.money.distributable);
    }
  });

  /**
   * ⚠ **ANTI-VACUITY, per axis.** Each of the four money shapes and each of the three weight vectors
   * must actually reach a paying cell, or its row of the grid proves nothing. `NIL` is the deliberate
   * exception: it has a distributable of 0 by construction, so it can never pay — which is exactly
   * why the escape predicate alone would be blind to it, and why the assertion for that row is that
   * it still resolves a non-empty ENTITLED cohort while paying zero.
   */
  it('every money shape and weight vector is genuinely exercised — none of the rows is inert', () => {
    for (const shape of MONEY_SHAPES) {
      const row = SHAPE_CELLS.filter((cell) => cell.money.name === shape.name);
      expect(row.length, shape.name).toBe(192);
      if (shape.distributable === 0n) {
        // NIL: nobody can be paid, so the honest coverage claim is that the row is not refused and
        // not skipped — 192 resolving cells with a 0 distributable.
        expect(
          row.every((cell) => cell.paidTotal === 0n),
          shape.name,
        ).toBe(true);
      } else {
        expect(row.filter((cell) => cell.paidTotal > 0n).length, shape.name).toBeGreaterThan(0);
      }
    }
    for (const weight of WEIGHT_SHAPES) {
      const row = SHAPE_CELLS.filter((cell) => cell.weightName === weight.name);
      expect(row.length, weight.name).toBe(256);
      expect(row.filter((cell) => cell.paid.length > 0).length, weight.name).toBeGreaterThan(0);
    }
  });

  /**
   * The all-zero deed vector, and the disagreement the resolver's own comment records: `ORDERED` and
   * `SHARED` exclude every member `ZERO_STIPULATED_WEIGHT` and retain the whole distributable, while
   * `LINEAGE_CONTINUATION` ignores weights entirely (R3) and pays 100% per capita — flagged, never
   * silent. Pinned here because the LINEAGE half is the one that MOVES MONEY on a record whose own
   * figures gave everyone nothing, and it must at least be visible.
   */
  it('an all-zero deed vector: excluded under ORDERED/SHARED, paid-and-FLAGGED under lineage', () => {
    const zero = SHAPE_CELLS.filter(
      (cell) => cell.weightName === 'ALL_ZERO' && cell.money.distributable > 0n,
    );
    expect(zero.length).toBeGreaterThan(0);
    for (const cell of zero) {
      const isLineage = cell.orderName.startsWith('LINEAGE_CONTINUATION');
      if (!isLineage) {
        expect(cell.paid, cell.key).toStrictEqual([]);
        expect(cell.paidTotal, cell.key).toBe(0n);
      } else if (cell.paid.length > 0) {
        // The override is never silent — that flag is the whole of R3's honesty obligation.
        expect(cell.flags, cell.key).toContain('STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA');
        expect(cell.paidTotal, cell.key).toBe(cell.money.distributable);
      }
    }
  });

  /**
   * ⚠ **THE WHOLLY INACTIVE COHORT — the state in which an escape would be most profitable.** Every
   * recorded beneficiary dead or out of scope, and a full distributable sitting there. If anything in
   * the engine were willing to hand a pool to a member it could not place, this is the input on which
   * it would happen, because there is no bloodline left to notice.
   */
  it('a cohort with NO living member pays nobody, on every order, weight and money shape', () => {
    const extinct = SHAPE_CELLS.filter((cell) => cell.liveness === 0 && !cell.placeholderActive);
    // 4 orders × 4 money × 3 weights = 48.
    expect(extinct).toHaveLength(48);
    for (const cell of extinct) {
      expect(cell.paid, cell.key).toStrictEqual([]);
      expect(cell.paidTotal, cell.key).toBe(0n);
      expect(cell.unplaced, cell.key).toStrictEqual([]);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 7 · the named three-generation cases, every halala by hand
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The grids above are censuses; these are the individual readings behind them. Each figure is
 * derived in halalas from the 27,500,000 distributable at the head of this file, and each case is one
 * the depth-2 bound could not express.
 */
describe('7 · depth-3 readings — the frontier at three generations, computed by hand', () => {
  const deepInput = (
    continuation: 'ZUHUR_ONLY' | 'ZUHUR_AND_BUTUN',
    middleLink: 'SON' | 'DAUGHTER',
    liveness: number,
    extra: (typeof DEEP_EXTRAS)[number] = 'NONE',
  ): DistributionInputRaw =>
    ({
      ...exampleA(),
      waqfType: 'FAMILY_DHURRI',
      entitlementOrder: 'LINEAGE_CONTINUATION',
      continuationStipulation: continuation,
      beneficiaries: deepCohort(middleLink, liveness, extra, 'FULL'),
    }) as DistributionInputRaw;

  /** Liveness bit 0 = dg-1, bit 1 = dg-2, bit 2 = dg-3. */
  const L = { G2_G3: 0b110, G3_ONLY: 0b100, ALL: 0b111 } as const;

  it("the owner's sentence, one generation deeper · dg-2 alive ⇒ dg-3 waits, and dg-1 is dead", () => {
    // dg-1 dead        → BENEFICIARY_INACTIVE
    // dg-2 alive, ancestors [dg-1] all dead, no line filter → ENTITLED
    // dg-3 alive, ancestors [dg-2 ALIVE, dg-1]              → ENTITLEMENT_HELD_BY_LIVING_ANCESTOR
    // one head ⇒ 27,500,000 × 1/1 = 27,500,000, residual 0
    const result = runDistribution(deepInput('ZUHUR_AND_BUTUN', 'SON', L.G2_G3));
    expect(statusesById(result)).toStrictEqual({
      'dg-1': 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      'dg-2': 'PAID/null:27500000',
      'dg-3': 'EXCLUDED/ENTITLEMENT_HELD_BY_LIVING_ANCESTOR:0',
    });
    expect(unplacedPaidLines(result)).toStrictEqual([]);
    expect(payees(result).reduce((s, l) => s + (l.entitledMinor as bigint), 0n)).toBe(
      DISTRIBUTABLE,
    );
  });

  it('…and it REVERSES on dg-2 death — the third generation inherits the frontier, not a share', () => {
    // dg-1 dead, dg-2 dead → both BENEFICIARY_INACTIVE
    // dg-3 alive, every intermediate ancestor deceased → ENTITLED, sole head ⇒ 27,500,000
    // ⚠ This is the temporary-exclusion claim tested rather than asserted: the SAME dg-3 record that
    // was excluded above is now entitled, with nothing changed but an ancestor's vital status.
    const result = runDistribution(deepInput('ZUHUR_AND_BUTUN', 'SON', L.G3_ONLY));
    expect(statusesById(result)).toStrictEqual({
      'dg-1': 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      'dg-2': 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      'dg-3': 'PAID/null:27500000',
    });
    expect(unplacedPaidLines(result)).toStrictEqual([]);
  });

  it('ZUHUR_ONLY · a daughter TWO generations up breaks the line, and the pool is RETAINED', () => {
    // dg-2 is DAUGHTER. dg-1 dead, dg-2 dead, dg-3 alive.
    // dg-3's intermediate ancestors are [dg-2 (DAUGHTER), dg-1 (SON)] ⇒ BUTUN_LINE_NOT_CONTINUED.
    // ⚠ THE ESCAPE-CLASS STRESS POINT: the entitled cohort is EMPTY and 27,500,000 is sitting there.
    // Nothing may pick it up — least of all a line the engine could not place.
    const result = runDistribution(deepInput('ZUHUR_ONLY', 'DAUGHTER', L.G3_ONLY));
    expect(statusesById(result)).toStrictEqual({
      'dg-1': 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      'dg-2': 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      'dg-3': 'EXCLUDED/BUTUN_LINE_NOT_CONTINUED:0',
    });
    expect(payees(result)).toStrictEqual([]);
    expect(unplacedPaidLines(result)).toStrictEqual([]);
  });

  it('precedence at depth 3 · butūn beats held-by-living when ONE ancestor is both', () => {
    // dg-2 is a LIVING DAUGHTER, so for dg-3 the same ancestor triggers rung 2 and rung 3 at once —
    // a collision that cannot occur at depth 2 with a one-link chain. Rung 2 wins: dg-3 is told their
    // line does not continue (permanent) rather than to wait for a death (temporary).
    //
    // dg-2 itself: ancestors [dg-1 (SON, dead)] ⇒ ENTITLED. ⚠ dg-2's OWN DAUGHTER link is never read —
    // if it were, dg-2 would be excluded and this cohort would be empty.
    // one head ⇒ 27,500,000.
    const result = runDistribution(deepInput('ZUHUR_ONLY', 'DAUGHTER', L.G2_G3));
    expect(statusesById(result)).toStrictEqual({
      'dg-1': 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      'dg-2': 'PAID/null:27500000',
      'dg-3': 'EXCLUDED/BUTUN_LINE_NOT_CONTINUED:0',
    });
    expect(unplacedPaidLines(result)).toStrictEqual([]);
  });

  it('a line may END in a daughter · dg-p is paid an equal head beside dg-2 under ZUHUR_ONLY', () => {
    // dg-1 dead; dg-2 (SON) alive; dg-3 alive; dg-p (DAUGHTER, ṭ2, child of dg-1) alive.
    //   dg-2 → ancestors [dg-1 SON, dead]      ⇒ ENTITLED
    //   dg-3 → ancestors [dg-2 SON, ALIVE]     ⇒ ENTITLEMENT_HELD_BY_LIVING_ANCESTOR
    //   dg-p → ancestors [dg-1 SON, dead]      ⇒ ENTITLED — her own DAUGHTER link is never read
    // TWO heads, per capita: 27,500,000 ÷ 2 = 13,750,000 each, remainder 0.
    const result = runDistribution(deepInput('ZUHUR_ONLY', 'SON', L.G2_G3, 'PLACEHOLDER'));
    expect(statusesById(result)).toStrictEqual({
      'dg-1': 'EXCLUDED/BENEFICIARY_INACTIVE:0',
      'dg-2': 'PAID/null:13750000',
      'dg-3': 'EXCLUDED/ENTITLEMENT_HELD_BY_LIVING_ANCESTOR:0',
      'dg-p': 'PAID/null:13750000',
    });
    expect(13_750_000n * 2n).toBe(DISTRIBUTABLE);
    expect(unplacedPaidLines(result)).toStrictEqual([]);
  });

  it('every generation alive ⇒ only the FRONTIER is paid, and it is dg-1 alone', () => {
    // The degenerate reading that the whole rule turns on: with dg-1 living, neither dg-2 nor dg-3
    // receives anything at all, whatever the continuation term.
    for (const continuation of ['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN'] as const) {
      const result = runDistribution(deepInput(continuation, 'SON', L.ALL));
      expect(statusesById(result), continuation).toStrictEqual({
        'dg-1': 'PAID/null:27500000',
        'dg-2': 'EXCLUDED/ENTITLEMENT_HELD_BY_LIVING_ANCESTOR:0',
        'dg-3': 'EXCLUDED/ENTITLEMENT_HELD_BY_LIVING_ANCESTOR:0',
      });
      expect(unplacedPaidLines(result), continuation).toStrictEqual([]);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 8 · THE FORMER FAIL-OPEN — NOW A REFUSAL, WITH ALL THREE GUARDS STILL IN FRONT OF IT
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠⚠ **THE STRUCTURAL REASON THE ESCAPE CLASS EXISTED AT ALL — AND THE CORRECTION THAT REMOVED IT.**
 *
 * ── MEASURED, AND THE RECORD OF WHAT THIS SECTION USED TO ASSERT ─────────────────────────────
 * `lineageFrontierVerdict` decided entitlement by walking `lineage.ancestorsById.get(id) ?? []`. For
 * a beneficiary who is **not in the graph** that lookup returns `undefined` and the `?? []` made the
 * chain EMPTY — so the member had no living ancestor and no broken line, satisfied R-FRONTIER
 * **vacuously**, and was ENTITLED. The lineage path therefore **failed OPEN**: its default answer for
 * someone it could not place was *pay them*, and the whole defence was three upstream rules. That was
 * one of three reasons G-9 clause 3 could not be called closed — removing any single guard re-opened
 * **128** paying cells, measured.
 *
 * ── ⚠⚠ THE DEFAULT IS NOW A REFUSAL (`LINEAGE_LINK_MISSING`) ─────────────────────────────────
 * The `?? []` is gone. A beneficiary absent from `ancestorsById` — one the engine cannot place —
 * **halts the run** instead of collecting. A rule about who is owed a family's ghallah must fail
 * towards paying nobody, never towards paying someone unknown, and "should be unreachable" is
 * precisely the assumption this engine has been burned by.
 *
 * ── WHAT DOES NOT CHANGE, AND WHY THIS SECTION KEEPS EVERY TEST ──────────────────────────────
 * The three upstream guards are still load-bearing and are still enumerated below. They are now
 * **defence in depth rather than the whole defence**: each still refuses its slice *earlier*, with a
 * discriminator that names the actual deed defect, which is far more actionable than the last-resort
 * refusal saying only "not in the lineage graph". The consequence is that the new default is
 * **unreachable through `runDistribution`**, and the final test pins that unreachability route by
 * route rather than leaving it asserted in prose — because an unreachable guard whose unreachability
 * nobody has enumerated is how the previous three passes each generalised from one rule.
 *
 * The three slices, each covering a disjoint part of "who can be in the cohort but not in the graph":
 *
 * | who is unplaceable | the rule that refuses it | measured when disabled |
 * |---|---|---|
 * | `FAMILY` / `CATEGORY_ONLY` with no `lineageLink` | R6 · `LINEAGE_LINK_MISSING` | **128** deep cells pay an unplaced line; 40 tests red |
 * | a `CHARITABLE_JIHA` (never in the graph by construction) | `LINEAGE_ORDER_ON_CHARITABLE_WAQF` | §1 escapes 54 → **72**; 8 tests red |
 * | a jiha standing beside placed descendants on a خيري waqf | ESC-1 · `DESCENDANT_ON_CHARITABLE_WAQF` | §1's `{CATEGORY_ONLY, JIHA}` escapes return; 23 tests red |
 *
 * Every one of the three was mutation-verified in an earlier pass by disabling it, re-running the whole
 * domain suite, restoring the source by re-editing, and confirming the file hash returned to
 * `9024b7cd…`. **The closure WAS a conjunction of three rules and no mechanism** — which is exactly
 * why "is it closed?" kept being answered wrongly: each prior pass checked one rule and generalised.
 * With the default inverted it is now a conjunction of three rules **over** a mechanism, and the
 * measured-when-disabled column above is the record of the state that made that necessary.
 *
 * The kinds axis below is the argument that the three slices are EXHAUSTIVE: membership in the graph
 * is `lineageLink !== null`, and `BENEFICIARY_KINDS` is closed at three, so "in the cohort but not in
 * the graph" is exactly {FAMILY, CATEGORY_ONLY} without a link, plus CHARITABLE_JIHA.
 */
describe('8 · the lineage path fails CLOSED — and the guards in front of it are enumerated', () => {
  it('the unplaceable-member space is exactly three slices, over the closed kinds vocabulary', () => {
    // Graph membership is decided by `lineageLink !== null` and by nothing else (`buildLineage`).
    // So the members who can reach a verdict without a place in the tree are, exhaustively:
    const unplaceableSlices = BENEFICIARY_KINDS.flatMap((kind) =>
      kind === 'CHARITABLE_JIHA'
        ? [`${kind} (never in the graph — a charity does not descend from the waqif)`]
        : [`${kind} with lineageLink === null`],
    );
    expect(unplaceableSlices).toHaveLength(3);
    // If a fourth kind is ever added, this fails and the table above must gain a row before any
    // verdict about the escape class can be restated.
    expect(BENEFICIARY_KINDS).toHaveLength(3);
  });

  it('slice 1 · FAMILY with no link is refused under the lineage order — the fail-open never runs', () => {
    // The exact cell measured at 27,500,000 with R6 disabled, driven here as a refusal.
    const cohort = [
      deepMember('dg-1', 'FAMILY', 1, null, 'SON', false),
      deepMember('dg-2', 'FAMILY', 2, 'dg-1', 'SON', false),
      patched(deepMember('dg-3', 'FAMILY', 3, 'dg-2', 'SON', true), {
        lineageLink: null,
        parentId: null,
        tabaqa: null,
      }),
    ];
    const error = expectRefused(
      {
        ...exampleA(),
        waqfType: 'FAMILY_DHURRI',
        entitlementOrder: 'LINEAGE_CONTINUATION',
        continuationStipulation: 'ZUHUR_ONLY',
        beneficiaries: cohort,
      } as DistributionInputRaw,
      'LINEAGE_LINK_MISSING',
    );
    // A refusal nobody can act on is half a refusal — it must name WHO could not be placed.
    expect(error.details).toMatchObject({ beneficiaryId: 'dg-3', kind: 'FAMILY' });
  });

  it('slice 2 · CATEGORY_ONLY with no link is refused on the same rule — R6 covers both kinds', () => {
    const error = expectRefused(
      {
        ...exampleA(),
        waqfType: 'FAMILY_DHURRI',
        entitlementOrder: 'LINEAGE_CONTINUATION',
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        beneficiaries: [
          deepMember('dg-1', 'FAMILY', 1, null, 'SON', false),
          patched(deepMember('dg-x', 'CATEGORY_ONLY', 2, 'dg-1', 'SON', true), {
            lineageLink: null,
            parentId: null,
            tabaqa: null,
          }),
        ],
      } as DistributionInputRaw,
      'LINEAGE_LINK_MISSING',
    );
    expect(error.details).toMatchObject({ beneficiaryId: 'dg-x', kind: 'CATEGORY_ONLY' });
  });

  it('slice 3 · a CHARITABLE_JIHA cannot reach the lineage path at all, on EITHER legal waqf type', () => {
    // A jiha is never in the graph, so under LINEAGE_CONTINUATION it would walk an empty chain and be
    // entitled — measured at 100% of the ghallah when this guard is disabled. Refused on both types,
    // by two different discriminators, and the discriminator is asserted rather than the bare code.
    expectRefused(
      {
        ...exampleA(),
        waqfType: 'PUBLIC_CHARITABLE',
        entitlementOrder: 'LINEAGE_CONTINUATION',
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        beneficiaries: [JIHA],
      } as DistributionInputRaw,
      'LINEAGE_ORDER_ON_CHARITABLE_WAQF',
    );
    expectRefused(
      {
        ...exampleA(),
        waqfType: 'FAMILY_DHURRI',
        entitlementOrder: 'LINEAGE_CONTINUATION',
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        beneficiaries: [JIHA],
      } as DistributionInputRaw,
      'CHARITABLE_JIHA_ON_FAMILY_WAQF',
    );
  });

  /**
   * ⚠ **THE UNPLACEABLE STATE IS REAL, not merely described** — otherwise the guards above are being
   * credited for stopping something nobody has shown exists. A member outside the graph has NO entry
   * in `ancestorsById`, which is precisely the `undefined` the frontier walk now refuses on.
   */
  it('the unplaceable state is real · a member outside the graph has NO ancestor chain to walk', () => {
    const input = {
      ...exampleA(),
      waqfType: 'PUBLIC_CHARITABLE',
      entitlementOrder: 'ORDERED',
      continuationStipulation: null,
      beneficiaries: [JIHA],
    } as DistributionInputRaw;
    // Driven through the engine on a cohort the guards ALLOW, so this reads the real index rather
    // than a hand-built one: the jiha resolves, and its line carries no lineage depth at all.
    const result = runDistribution(input);
    const jihaLine = result.lines.find((line) => line.beneficiaryId === 'esc-jiha');
    expect(jihaLine?.basis.lineageDepth).toBeNull();
    expect(jihaLine?.basis.parentId).toBeNull();
    expect(jihaLine?.basis.lineageLink).toBeNull();
    // It is PAID — legally, because it is a charity on a charitable waqf with no bloodline beside it,
    // under an order that reads no ancestor chain at all. The SAME emptiness under
    // LINEAGE_CONTINUATION used to make it entitled by the frontier rule; the next test enumerates
    // every route to that state and shows all nine refuse.
    expect(jihaLine?.entitledMinor as bigint).toBe(DISTRIBUTABLE);
  });

  /**
   * ⚠⚠ **CORRECTION 2, PINNED AS UNREACHABILITY — AND WHICH REFUSAL WINS IN EVERY CELL.**
   *
   * The frontier walk's own default is now `LINEAGE_LINK_MISSING` rather than ENTITLED. It cannot be
   * reached through `runDistribution`, and that is a claim about **nine cells**, not a hope: the only
   * way to reach `lineageFrontierVerdict` at all is `entitlementOrder: 'LINEAGE_CONTINUATION'`, and
   * the only way to be absent from `ancestorsById` is `lineageLink === null` — so the space is
   * exactly `BENEFICIARY_KINDS` (3, closed) × `WAQF_TYPES` (3, closed), and every cell is enumerated.
   *
   * Derived from the precedence in `resolveEntitlement`, Stage 0 first:
   *
   * | kind | JOINT | PUBLIC_CHARITABLE | FAMILY_DHURRI |
   * |---|---|---|---|
   * | `FAMILY`         | `WAQF_TYPE_JOINT_NOT_SUPPORTED` | `LINEAGE_ORDER_ON_CHARITABLE_WAQF` | `LINEAGE_LINK_MISSING` |
   * | `CATEGORY_ONLY`  | `WAQF_TYPE_JOINT_NOT_SUPPORTED` | `LINEAGE_ORDER_ON_CHARITABLE_WAQF` | `LINEAGE_LINK_MISSING` |
   * | `CHARITABLE_JIHA`| `WAQF_TYPE_JOINT_NOT_SUPPORTED` | `LINEAGE_ORDER_ON_CHARITABLE_WAQF` | `CHARITABLE_JIHA_ON_FAMILY_WAQF` |
   *
   * ⚠ Note what the `PUBLIC_CHARITABLE` column says about R6-F1's correction: it does **not** open a
   * route here. Scoping the `CATEGORY_ONLY` edge requirement to a ذري waqf let an edgeless placeholder
   * through `buildLineage`, but a خيري waqf under `LINEAGE_CONTINUATION` is refused at Stage 0, three
   * steps earlier, on the ground that a charitable waqf has no descendants. The correction and the
   * frontier walk never meet.
   *
   * Only the `FAMILY_DHURRI` column is `buildLineage`'s own work; the other six are Stage 0. So the
   * mechanism-level default sits behind two independent layers, and this test is what would go red —
   * naming the cell — if a future change let one of them lapse.
   */
  it('the frontier default is UNREACHABLE · all nine kind × waqfType routes refuse first', () => {
    const winner: Readonly<Record<string, Readonly<Record<string, string>>>> = {
      FAMILY: {
        JOINT: 'WAQF_TYPE_JOINT_NOT_SUPPORTED',
        PUBLIC_CHARITABLE: 'LINEAGE_ORDER_ON_CHARITABLE_WAQF',
        FAMILY_DHURRI: 'LINEAGE_LINK_MISSING',
      },
      CATEGORY_ONLY: {
        JOINT: 'WAQF_TYPE_JOINT_NOT_SUPPORTED',
        PUBLIC_CHARITABLE: 'LINEAGE_ORDER_ON_CHARITABLE_WAQF',
        FAMILY_DHURRI: 'LINEAGE_LINK_MISSING',
      },
      CHARITABLE_JIHA: {
        JOINT: 'WAQF_TYPE_JOINT_NOT_SUPPORTED',
        PUBLIC_CHARITABLE: 'LINEAGE_ORDER_ON_CHARITABLE_WAQF',
        FAMILY_DHURRI: 'CHARITABLE_JIHA_ON_FAMILY_WAQF',
      },
    };

    let cells = 0;
    for (const kind of BENEFICIARY_KINDS)
      for (const waqfType of CONTRACT_WAQF_TYPES) {
        // The unplaceable member, in every kind: no link, so no entry in `ancestorsById`; no ṭabaqa,
        // so the depth cross-check has nothing to disagree with; alive and payable, so nothing but a
        // refusal can stop it being paid.
        const unplaceable = patched(JIHA, {
          id: 'esc-ghost',
          kind,
          tabaqa: null,
          parentId: null,
          lineageLink: null,
          line: kind === 'CHARITABLE_JIHA' ? 'NA' : 'ZUHUR',
          category: kind === 'CATEGORY_ONLY' ? 'a segment not yet enrolled (fictional)' : null,
          disbursingEntity: kind === 'CHARITABLE_JIHA' ? JIHA.disbursingEntity : null,
        });
        const expected = winner[kind]?.[waqfType];
        expect(expected, `no expected refusal recorded for ${kind} × ${waqfType}`).toBeDefined();
        const error = expectRefused(
          {
            ...exampleA(),
            waqfType,
            entitlementOrder: 'LINEAGE_CONTINUATION',
            // Non-null, so `CONTINUATION_STIPULATION_UNRECOGNISED` cannot pre-empt the refusal under
            // test and make this grid green on the wrong rule.
            continuationStipulation: 'ZUHUR_AND_BUTUN',
            beneficiaries: [unplaceable],
          } as DistributionInputRaw,
          expected as ShartRefusal,
        );
        expect(error.code).toBe('SHART_INCOMPLETE');
        cells += 1;
      }
    // 3 kinds × 3 waqf types. If either vocabulary grows, this fails before the table can go stale.
    expect(cells).toBe(9);
    expect(BENEFICIARY_KINDS).toHaveLength(3);
    expect(CONTRACT_WAQF_TYPES).toHaveLength(3);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 9 · ⚠ NEW FINDING (R6-F1-A) — what the widened legal space let in beside the fix
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠⚠ **A FINDING, PINNED AS A MEASUREMENT — NOT AN ASSERTION THAT THIS IS CORRECT.**
 *
 * R6-F1's correction made a `CATEGORY_ONLY` placeholder representable on a `PUBLIC_CHARITABLE` waqf.
 * 72 cells of §1's grid moved from `LINEAGE_LINK_MISSING` to `RESOLVED`, and §1 proves that none of
 * them re-opens the escape class. **But 36 of those 72 sit at the `NO_LINK_WITH_TABAQA` edge value,
 * and inside them the engine now applies GENERATIONAL TIER ARITHMETIC to a CHARITABLE cohort.**
 *
 * That combination was unreachable before the correction — every cell holding it was refused — so it
 * has never been looked at by anyone.
 *
 * ═══ WHY IT IS A QUESTION AND NOT OBVIOUSLY A BUG ═══
 * A ṭabaqa (طبقة) is a *generation of the waqif's descendants*. A وقف خيري has no descendants at all —
 * that is the entire basis on which `LINEAGE_ORDER_ON_CHARITABLE_WAQF` refuses the lineage order here,
 * and on which `assertJihaNotTiered` refuses a `CHARITABLE_JIHA` that carries a ṭabaqa ("a charity is
 * not in the generational tree"). A `CATEGORY_ONLY` placeholder on a خيري waqf is in *exactly* the
 * position of that jiha: it is a segment the waqif chose, not a descendant. Yet the engine accepts a
 * ṭabaqa on it and then lets that field decide who is paid.
 *
 * ═══ WHAT IT COSTS, IN HALALAS, ON EXAMPLE A's POOL (27,500,000) ═══
 * Two charitable segments, deed weights 10 and 10, both live, `ORDERED`:
 *   · ṭabaqa 1 and 2 declared ⇒ `ORDERED_LOWEST_LIVING_TABAQA` EXCLUDES the second on
 *     `UPPER_TABAQA_EXTANT`, and the first takes 27,500,000 × 10/10 = **27,500,000** — the whole pool.
 *   · the SAME cohort with `tabaqa: null` on both ⇒ 27,500,000 × 10/20 = **13,750,000** each
 *     (Σ = 27,500,000, residual 0).
 * So a field with no meaning on this deed moves **13,750,000 halalas** between two charitable
 * segments, and the deed stipulated no such precedence.
 *
 * ⚠ **TODO(surface) — CLAUDE.md binding rule 4 (fiqh/legal decisions are surfaced, never resolved).**
 * Two coherent answers, and this is the product owner's call, not engineering's:
 *   (a) `assertJihaNotTiered`'s rule generalises — **no beneficiary of a `PUBLIC_CHARITABLE` waqf may
 *       carry a ṭabaqa**, and this record halts (a new discriminator alongside `JIHA_TIERED`);
 *   (b) a ṭabaqa on a خيري deed is a legitimate *precedence* device the waqif may stipulate over
 *       segments ("the district's poor first, the travellers after"), in which case the behaviour
 *       below is right and only needs naming in §08.
 * Until answered, this section MEASURES the behaviour so it cannot drift unnoticed, and does not
 * assert that it is correct.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ✓✓ **ANSWERED, 2026-08-03 — THE PRODUCT OWNER TOOK (a). THIS SECTION IS NOW A CLOSURE.**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * *"A وقف خيري has no generations, so no beneficiary of one may carry a `tabaqa`."*
 * `TABAQA_ON_CHARITABLE_WAQF` is the new discriminator, raised in `assertSingleWaqfNature` — Stage 0,
 * so it outranks every rule this section reached through. The 13,750,000-halala swing measured below
 * is unreachable: both cohorts that produced it now halt.
 *
 * Every MEASURED figure is kept verbatim above its assertion, and every assertion is INVERTED onto
 * the refusal rather than deleted. What was a finding is now the record of what the refusal prevents.
 *
 * ⚠⚠ **ONE PART OF THIS SECTION IS NOT CLOSED BY THAT ANSWER, AND IT MUST NOT BE REPORTED AS
 * CLOSED — R6-F1-B, the I5 honesty gap.** Its cohort carries `tabaqa: null` on both segments, so the
 * new refusal does not see it. A خيري `ORDERED` run over an untiered cohort still certifies **I5** in
 * `invariantsChecked` while `assertOrderedExclusion` tests nothing, and still stamps every line's
 * BR-505 basis `ORDERED_LOWEST_LIVING_TABAQA`. Answer (a)'s own logic makes that label *more* wrong,
 * not less: if a خيري waqf has no generations at all, then a خيري `ORDERED` deed has no tier
 * semantics to name — for the WHOLE cohort, not merely for its untiered members. Still surfaced,
 * still not resolved, and its test below is unchanged and still passing on the measurement.
 */
describe('9 · FINDING ✓ CLOSED (a) — a ṭabaqa on a CHARITABLE cohort now halts the run', () => {
  /** An edgeless charitable segment: legal on a خيري waqf since R6-F1, refused on a ذري one. */
  const segment = (id: string, tabaqa: number | null, active: boolean): Raw =>
    beneficiary({
      id,
      kind: 'CATEGORY_ONLY',
      active,
      tabaqa,
      parentId: null,
      lineageLink: null,
      line: 'NA',
      branch: 'Segment',
      stipulatedWeight: '10',
      verificationStatus: 'VERIFIED',
      kycLastRefreshed: '2026-01-15',
      // Captured, so BR-206's gate is not what this section is measuring.
      category: 'a segment of the district, not yet enrolled (fictional)',
      residency: 'DOMESTIC',
      disbursingEntity: null,
      bankingRefForProceeds: `FAKE-IBAN-${id}`,
    });

  const charitableOrdered = (cohort: readonly Raw[]): DistributionResult =>
    runDistribution({
      ...exampleA(),
      waqfType: 'PUBLIC_CHARITABLE',
      entitlementOrder: 'ORDERED',
      continuationStipulation: null,
      beneficiaries: cohort,
    } as DistributionInputRaw);

  /** The same cohort as `charitableOrdered`, driven for its refusal instead of its result. */
  const charitableOrderedRefused = (cohort: readonly Raw[], refusal: ShartRefusal): DomainError =>
    expectRefused(
      {
        ...exampleA(),
        waqfType: 'PUBLIC_CHARITABLE',
        entitlementOrder: 'ORDERED',
        continuationStipulation: null,
        beneficiaries: cohort,
      } as DistributionInputRaw,
      refusal,
    );

  it('INVERTED · the ṭabaqa-2 segment can no longer be EXCLUDED — the tiered cohort HALTS', () => {
    // ── MEASURED BEFORE `TABAQA_ON_CHARITABLE_WAQF`, on this exact input ──────────────────────
    //   entitlementRule: 'ORDERED_LOWEST_LIVING_TABAQA'
    //   { esc-s1: PAID/null:27500000,           ← 27,500,000 × 10/10, the sole eligible weight
    //     esc-s2: EXCLUDED/UPPER_TABAQA_EXTANT:0 }
    // …i.e. a generational rule decided, on a وقف خيري, which of two charitable segments was paid.
    const error = charitableOrderedRefused(
      [segment('esc-s1', 1, true), segment('esc-s2', 2, true)],
      'TABAQA_ON_CHARITABLE_WAQF',
    );
    // Both offenders named — the refusal is on the cohort's ṭabaqāt, not on one member's.
    expect(error.message).toContain('esc-s1');
    expect(error.message).toContain('esc-s2');

    // ⚠ THE CONTRAST, UNCHANGED AND STILL THE POINT: one field, no other change, and this cohort
    // still computes. R6-F1's correction (an edgeless خيري segment is representable) is intact; only
    // the generational claim on top of it is refused.
    const untiered = charitableOrdered([
      segment('esc-s1', null, true),
      segment('esc-s2', null, true),
    ]);
    expect(statusesById(untiered)).toStrictEqual({
      // 27,500,000 × 10/20 = 13,750,000 each; Σ = 27,500,000, residual 0.
      'esc-s1': 'PAID/null:13750000',
      'esc-s2': 'PAID/null:13750000',
    });
    // The 13,750,000 the ṭabaqa used to move — 27,500,000 − 13,750,000 — is now unreachable, because
    // the only run that produced the 27,500,000 figure no longer exists.
    expect(27_500_000n - 13_750_000n).toBe(13_750_000n);
  });

  it('INVERTED · the reversal on the ṭabaqa-1 segment going inactive is unreachable too', () => {
    // MEASURED BEFORE: { esc-s1: EXCLUDED/TABAQA_EXTINCT:0, esc-s2: PAID/null:27500000 } — the whole
    // pool swinging to the other segment on a vital-status change that the deed never made relevant.
    charitableOrderedRefused(
      [segment('esc-s1', 1, false), segment('esc-s2', 2, true)],
      'TABAQA_ON_CHARITABLE_WAQF',
    );
    // ⚠ Vital status is irrelevant to the refusal, and deliberately so: a ṭabaqa recorded against a
    // dead segment is the same impossible claim as one recorded against a living one.
    charitableOrderedRefused(
      [segment('esc-s1', 1, false), segment('esc-s2', 2, false)],
      'TABAQA_ON_CHARITABLE_WAQF',
    );
  });

  /**
   * ⚠⚠ **R6-F1-B · DEFECT-A1's I5 HONESTY GAP IS RE-OPENED, ON THE CHARITABLE SIDE.**
   *
   * `g9-adversarial.test.ts`'s DEFECT-A1 corollary carries this note, and it is now **STALE**:
   *
   *     "⚠ The underlying honesty gap in I5 is NOT itself closed and must not be read as closed.
   *      `invariants.assertOrderedExclusion` still skips every line whose beneficiary has a null
   *      `tabaqa`; **what changed is that a `FAMILY`/`CATEGORY_ONLY` member can no longer BE one.**
   *      A `CHARITABLE_JIHA` still can — legitimately […] — so the exemption survives for the kind
   *      it was written for."
   *
   * The sentence in bold was true under R6-as-first-built and is **false since R6-F1's correction**:
   * a `CATEGORY_ONLY` member on a خيري waqf can now carry `tabaqa: null`, reach an `ORDERED` run and
   * be paid. That is the DEFECT-A1 shape restored for a second kind — not the money escape (§1 and
   * §10 rule that out on this space), but the REPORTING dishonesty DEFECT-A1 was actually about.
   *
   * MEASURED below, and every part of it is the original defect's own signature:
   *   · the run reports **`I5` in `invariantsChecked`** — the certificate that the tier rule was
   *     enforced;
   *   · `assertOrderedExclusion` never tested either line, because both have `tabaqa: null`;
   *   · each line's published `basis.rule` nonetheless reads **`ORDERED_LOWEST_LIVING_TABAQA`** —
   *     a BR-505 beneficiary statement telling a charitable segment that al-aʿlā fa-l-aʿlā was the
   *     rule applied to it, when no tier test touched it and it has no ṭabaqa to be tested on.
   *
   * ⚠ **TODO(surface) — this rides on the same product-owner question as the section header.** If
   * answer (a) is taken (no beneficiary of a خيري waqf may carry a ṭabaqa), then a خيري `ORDERED`
   * deed has no tier semantics at all and the rule label is wrong for the whole cohort, not just for
   * the untiered members. Pinned as a measurement; NOT asserted to be correct.
   */
  it('MEASURED · R6-F1-B · I5 is certified while no tier test ran, and the basis says otherwise', () => {
    const untiered = charitableOrdered([
      segment('esc-s1', null, true),
      segment('esc-s2', null, true),
    ]);
    // The certificate.
    expect(untiered.invariantsChecked).toContain('I5');
    // Nothing was tested: no ṭabaqa on either line, and no exclusion reason on either.
    expect(untiered.lines.map((line) => line.basis.tabaqa)).toStrictEqual([null, null]);
    expect(untiered.lines.map((line) => line.reasonCode)).toStrictEqual([null, null]);
    // …and the run tells them a generational rule decided their share anyway.
    expect(untiered.lines.map((line) => line.basis.rule)).toStrictEqual([
      'ORDERED_LOWEST_LIVING_TABAQA',
      'ORDERED_LOWEST_LIVING_TABAQA',
    ]);
    // The money is untouched by the gap — 27,500,000 × 10/20 each — which is precisely why it is a
    // HONESTY defect and would never surface as a conservation failure.
    expect(statusesById(untiered)).toStrictEqual({
      'esc-s1': 'PAID/null:13750000',
      'esc-s2': 'PAID/null:13750000',
    });
  });

  /**
   * ✓ **THE INCONSISTENCY IS GONE — that is what answer (a) bought, and it is asserted here.**
   *
   * This test used to prove the inconsistency was REAL: the identical ṭabaqa on a `CHARITABLE_JIHA`
   * was REFUSED (`JIHA_TIERED`) while on a `CATEGORY_ONLY` segment it was PAID, so the engine held two
   * different rules for "a charity carrying a generation number", decided by `kind`. MEASURED BEFORE
   * on the mixed cohort below: `SHART_INCOMPLETE` / **`JIHA_TIERED`**.
   *
   * Both kinds are now refused on a خيري waqf, and the refusal no longer reads `kind` at all — it
   * names every offender whatever they are. ⚠ A side effect worth knowing: `JIHA_TIERED` has become
   * unreachable through `runDistribution` on every route (`jiha-tier-refusal.test.ts`
   * §"REACHABILITY"). It is kept, not deleted, because R6-D1 is under review and its removal would
   * make the jiha rule load-bearing again on a ذري waqf.
   */
  it('THE INCONSISTENCY · CLOSED — both charitable kinds are now refused by ONE rule', () => {
    const error = expectRefused(
      {
        ...exampleA(),
        waqfType: 'PUBLIC_CHARITABLE',
        entitlementOrder: 'ORDERED',
        continuationStipulation: null,
        beneficiaries: [segment('esc-s1', 1, true), patched(JIHA, { tabaqa: 2 })],
      } as DistributionInputRaw,
      'TABAQA_ON_CHARITABLE_WAQF',
    );
    // Both kinds named by the same rule — the inconsistency was that only one of them was.
    expect(error.details).toMatchObject({
      offendingBeneficiaryIds: ['esc-s1', 'esc-jiha'],
    });
    // …and each kind alone, so the single rule is not merely covering for a kind-keyed one.
    expectRefused(
      {
        ...exampleA(),
        waqfType: 'PUBLIC_CHARITABLE',
        entitlementOrder: 'ORDERED',
        continuationStipulation: null,
        beneficiaries: [patched(JIHA, { tabaqa: 2 })],
      } as DistributionInputRaw,
      'TABAQA_ON_CHARITABLE_WAQF',
    );
    charitableOrderedRefused([segment('esc-s1', 1, true)], 'TABAQA_ON_CHARITABLE_WAQF');
  });

  /**
   * …and the boundary of the finding, so it is not read as wider than it is: this is confined to the
   * charitable side. On a ذري waqf the same edgeless record is still `LINEAGE_LINK_MISSING`, so no
   * family cohort can reach the shape, and §1's escape predicate is untouched by any of it.
   */
  it('BOUNDED · the same record on a ذري waqf is still refused — no family cohort reaches this', () => {
    expectRefused(
      {
        ...exampleA(),
        waqfType: 'FAMILY_DHURRI',
        entitlementOrder: 'ORDERED',
        continuationStipulation: null,
        beneficiaries: [segment('esc-s1', 1, true), segment('esc-s2', 2, true)],
      } as DistributionInputRaw,
      'LINEAGE_LINK_MISSING',
    );
  });

  /**
   * ⚠ **INVERTED — the reachability claim, stated over §1's own grid rather than over the hand-built
   * cases above, is now a claim of UNreachability.**
   *
   * MEASURED BEFORE: 36 of the 72 cells R6-F1 moved into `RESOLVED` carried a declared ṭabaqa on an
   * edgeless charitable placeholder — `expect(tieredMoved).toHaveLength(36)` over exactly the filter
   * below with `outcome === 'RESOLVED'`. That was what made the finding real rather than theoretical.
   *
   * The same 36 cells are now `TABAQA_ON_CHARITABLE_WAQF`, and the slice is asserted to be EMPTY of
   * resolving cells and FULL of that one refusal — both halves, so a future change that merely stops
   * these cells resolving for some other reason cannot pass as the closure.
   */
  it('REACHABILITY · INVERTED — not one moved cell carries a ṭabaqa any more', () => {
    const tieredSlice = NO_MAAL_CELLS.filter(
      (cell) =>
        cell.waqfType === 'PUBLIC_CHARITABLE' &&
        cell.key.includes('NO_LINK_WITH_TABAQA') &&
        cell.kinds.includes('CATEGORY_ONLY') &&
        !cell.kinds.includes('FAMILY') &&
        cell.order !== 'NA_DIRECT_USE',
    );
    // 3 orders (the ND cells are excluded above) × 2 cohorts ({C}, {C,J}) × 3 continuations × 1 edge
    // × 3 liveness = 54 — the 36 that used to resolve plus the 18 lineage-order cells beside them.
    expect(tieredSlice).toHaveLength(54);
    expect(tieredSlice.filter((cell) => cell.outcome === 'RESOLVED')).toStrictEqual([]);
    for (const cell of tieredSlice) {
      expect(cell.outcome, cell.key).toBe('TABAQA_ON_CHARITABLE_WAQF');
    }
    // The 36 specifically — ORDERED and SHARED — so the inverted number is the SAME population the
    // finding was measured on, not a differently-shaped slice that happens to be empty.
    expect(
      tieredSlice.filter((cell) => cell.order === 'ORDERED' || cell.order === 'SHARED'),
    ).toHaveLength(36);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 10 · the money × weight axis, on the space R6-F1 made legal
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ **A NAMED BOUND OF THE NEGATIVE, CLOSED BY MEASUREMENT.**
 *
 * §6 crosses money shapes with deed-weight vectors, and its header says so plainly: *"over the ONE
 * configuration that resolves"* — which is `FAMILY_DHURRI`, no jiha, every member placed. That was
 * exhaustive when the only cohort that resolved with an unplaced payee was a jiha standing alone.
 * **R6-F1 changed that**: an edgeless `CATEGORY_ONLY` placeholder on a خيري waqf now resolves, and the
 * money × weight axis had never been run over it. §1 drives that space on Example A's single money
 * profile and a single '10' weight on every member, so the arithmetic-shaped failures — a residual
 * that lands on an unplaced line, an all-zero vector that leaves the pool to one member, a
 * one-halala pool, an exclusion that silently transfers a share — were all outside every grid.
 *
 * This section runs the cross-product on that space and asserts, per cell:
 *
 *  · **conservation** — Σ `entitledMinor` + `retainedMinor` == `distributableMinor`, and no line is
 *    negative. A residual mis-landing shows up here and nowhere else in the file.
 *  · **the strict escape predicate** — no line with a lineage depth is ever paid, AND no member of
 *    the cohort records a `lineageLink` at all. The second half is the sharper one: §1's predicate
 *    (`placedPayees === []`) only looks at who was PAID, so it would stay green in the S3-D1 outcome
 *    shape, where the placed descendants sit `EXCLUDED` at 0 while an unplaced member takes the whole
 *    pool. Asserting that no descent is ON RECORD at all rules that shape out by construction.
 *
 * ⚠ The second assertion is a tautology **given ESC-1** — a خيري cohort recording descent is refused
 * at Stage 0 — and that is exactly why it is worth writing down: it is the load-bearing reason these
 * 960 paying cells are not the escape class, and if ESC-1 ever lapses it fails here rather than being
 * argued about in a comment.
 */
describe('10 · money × weights × ṭabaqāt over the newly legal خيري placeholder space', () => {
  const MONEY_PROFILES = [
    { label: 'nil', incomeMinor: 0n },
    { label: 'one-halala', incomeMinor: 1n },
    { label: 'residual-3-ways', incomeMinor: 100n },
    { label: 'big-prime', incomeMinor: 1_000_000_007n },
    { label: 'exampleA', incomeMinor: 35_000_000n },
  ] as const;
  /** All-zero, equal, unequal, one-zero, two-zero, and an 18-dp-adjacent extreme. */
  const WEIGHT_VECTORS = [
    ['0', '0', '0'],
    ['10', '10', '10'],
    ['1', '2', '3'],
    ['0', '10', '10'],
    ['10', '0', '0'],
    ['0.000001', '10', '99.999999'],
  ] as const;
  /** Untiered, ascending, descending, and a tie — the ṭabaqa axis §9 found newly reachable here. */
  const TABAQA_VECTORS = [
    [null, null],
    [1, 2],
    [2, 1],
    [1, 1],
  ] as const;

  const chSegment = (id: string, weight: string, tabaqa: number | null, active: boolean): Raw =>
    beneficiary({
      id,
      kind: 'CATEGORY_ONLY',
      active,
      tabaqa,
      parentId: null,
      lineageLink: null,
      line: 'NA',
      branch: 'Segment',
      stipulatedWeight: weight,
      verificationStatus: 'VERIFIED',
      kycLastRefreshed: '2026-01-15',
      category: 'a segment of the district, not yet enrolled (fictional)',
      residency: 'DOMESTIC',
      disbursingEntity: null,
      bankingRefForProceeds: `FAKE-IBAN-${id}`,
    });

  it('conserves in every cell, and not one of them pays out of a bloodline', () => {
    let resolved = 0;
    let paying = 0;
    const refusals: string[] = [];

    for (const money of MONEY_PROFILES)
      for (const weights of WEIGHT_VECTORS)
        for (const order of ['ORDERED', 'SHARED'] as const)
          for (const tabaqat of TABAQA_VECTORS)
            for (const withJiha of [true, false])
              for (const secondActive of [true, false]) {
                const key = `${money.label} | ${weights.join('/')} | ${order} | ${String(tabaqat[0])},${String(tabaqat[1])} | jiha=${String(withJiha)} | bActive=${String(secondActive)}`;
                const cohort: Raw[] = [
                  chSegment('esc-m1', weights[0], tabaqat[0], true),
                  chSegment('esc-m2', weights[1], tabaqat[1], secondActive),
                ];
                if (withJiha) cohort.push(patched(JIHA, { stipulatedWeight: weights[2] }));

                const input = {
                  ...exampleA(),
                  waqfType: 'PUBLIC_CHARITABLE',
                  entitlementOrder: order,
                  continuationStipulation: null,
                  // The waterfall is flattened so the pool IS the money profile — this grid is about
                  // the SPLIT, and a reserve or a fee would only re-test `waterfall.test.ts`.
                  maintenance: { kind: 'NONE' },
                  operatingCostMinor: 0n,
                  nazirFee: null,
                  revenue: {
                    incomeMinor: money.incomeMinor,
                    receipts: [
                      {
                        id: 'esc-rev',
                        receiptClass: 'INCOME',
                        amountMinor: money.incomeMinor,
                      },
                    ],
                  },
                  beneficiaries: cohort,
                } as DistributionInputRaw;

                let result;
                try {
                  result = runDistribution(input);
                } catch (error) {
                  if (!isDomainError(error)) throw error;
                  refusals.push(
                    `${key} → ${String((error.details as { refusal?: string } | undefined)?.refusal ?? error.code)}`,
                  );
                  continue;
                }
                resolved += 1;

                // ── conservation ──
                const distributable = result.waterfall.distributableMinor as bigint;
                const summed = result.lines.reduce(
                  (acc, line) => acc + (line.entitledMinor as bigint),
                  0n,
                );
                expect(summed + (result.totals.retainedMinor as bigint), key).toBe(distributable);
                for (const line of result.lines)
                  expect(line.entitledMinor as bigint, key).toBeGreaterThanOrEqual(0n);

                // ── the strict escape predicate ──
                expect(
                  result.lines.filter(
                    (line) =>
                      (line.entitledMinor as bigint) > 0n && line.basis.lineageDepth !== null,
                  ),
                  key,
                ).toStrictEqual([]);
                expect(
                  cohort.filter((member) => member.lineageLink !== null),
                  key,
                ).toStrictEqual([]);

                if (summed > 0n) paying += 1;
              }

    // ⚠⚠ **INVERTED (2026-08-03). The grid is UNCHANGED — all 960 cells are still driven — and it is
    // the accounting that splits, along the one axis §9's answer speaks to.**
    //
    // MEASURED BEFORE `TABAQA_ON_CHARITABLE_WAQF`: `refusals` was empty, `resolved` was **960** and
    // `paying` was **596** (the rest being the nil pool, the all-zero weight vector, and the cells
    // where every weighted member was excluded).
    //
    // MEASURED AFTER: the three ṭabaqa-bearing vectors — `[1,2]`, `[2,1]`, `[1,1]` — are refused on
    // every one of their cells, because no beneficiary of a وقف خيري may carry a generation number:
    //     5 money × 6 weights × 2 orders × 3 tiered vectors × 2 jiha × 2 liveness = **720**.
    // The untiered vector `[null, null]` is untouched, so R6-F1's legal space is intact:
    //     5 × 6 × 2 × 1 × 2 × 2 = **240 RESOLVED**, and 720 + 240 = 960. ✓
    expect(refusals).toHaveLength(720);
    // Every one of them by NAME, so a different rule swallowing this grid cannot pass as the closure.
    for (const refusal of refusals) {
      expect(refusal.endsWith('→ TABAQA_ON_CHARITABLE_WAQF'), refusal).toBe(true);
    }
    // …and none of the untiered cells is among them: the refusal is keyed on the ṭabaqa and nothing
    // else, which is what keeps the money × weight coverage of the legal space at full strength.
    for (const refusal of refusals) expect(refusal).not.toContain('| null,null |');
    expect(resolved).toBe(240);
    // ⚠ Load-bearing: without it, "nothing escapes" would be satisfied by a grid that pays nothing.
    // **152 of the 240**, derived by hand over the surviving `[null, null]` vector rather than read
    // off the run (the waterfall is flattened, so distributable == the money profile):
    //   · the `nil` profile pays nobody at all: 6 weights × 2 orders × 2 jiha × 2 live = 48 cells out.
    //     240 − 48 = 192 cells with a positive pool.
    //   · `['0','0','0']` — every member EXCLUDED/ZERO_STIPULATED_WEIGHT, so the pool is retained:
    //     4 money × 2 orders × 2 jiha × 2 live = 32 more out. 192 − 32 = 160.
    //   · `['0','10','10']` — `esc-m1` is zero-weighted and out; the cell pays iff someone else can.
    //     With the jiha (weight 10, always active) it always pays: 4 × 2 × 2 live = 16. Without it,
    //     only when `esc-m2` is active: 4 × 2 × 1 = 8. So 24 of its 32 pay ⇒ 8 more out. 160 − 8 = 152.
    //   · `['10','10','10']`, `['1','2','3']`, `['10','0','0']` and the 6-dp extreme all pay in every
    //     cell, because `esc-m1` is active and carries a non-zero weight in each: 4 × 32 = 128 of the
    //     152, and 128 + 24 = 152. ✓
    expect(paying).toBe(152);
  });
});
