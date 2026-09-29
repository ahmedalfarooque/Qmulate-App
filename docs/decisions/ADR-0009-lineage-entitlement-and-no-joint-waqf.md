# ADR 0009 — Entitlement Is Lineage-Based and Per Capita; a Joint Waqf Is Refused

**Status:** DECIDED (Accepted) — **AMENDED SIX TIMES. Read the amendment block immediately below before any other line of this record**: **A** corrects decision 2's eligibility wording (R-FRONTIER), **B** closes decision 3's "unreconciled" conflict, **C** answers this record's own open question 10 (R6), **D** (2026-08-09, **engineering's reading, not an owner decision**) records R6-D1's closure by `CHARITABLE_JIHA_ON_FAMILY_WAQF`, **E** (2026-08-10, **a product-owner ruling — R7**) *answers* the R6-D1 question in part: a وقف ذري **may** name a charitable jiha as its **ultimate taker** (مآل الوقف), which takes the distributable only **once the bloodline is over**, so `CHARITABLE_JIHA_ON_FAMILY_WAQF` becomes **conditional rather than deleted** — and **F** (2026-08-11, **a product-owner ruling — R7-d**) fixes what *"over"* means: **NO CONTINUING LINE**, not merely no survivor, which **supersedes E's own R7-d subsection** and also **closes E's HIGH residual R7-D1** (a placeholder cannot certify a death). The engine changes in S4; the database enum stays.
**Date:** 2026-08-03 (decisions taken 2026-08-02 / 2026-08-03; **amended 2026-08-03, 2026-08-09, 2026-08-10 and 2026-08-11**)
**Deciders:** QMULATE (product owner), who is a practising **Nazir**. Engineering surfaced the two S3 defects (S3-D1, S3-D2) with options; the answers came back as **domain corrections rather than option picks**, which is why they need an ADR rather than a line in the build plan.
**Scope:** `packages/domain/src/distribution/` — `contract.ts` (vocabulary + `BeneficiaryInput`), `resolver.ts` (Stage 2, substantially rewritten), `invariants.ts` (I5, new I-L1), `engine.ts` (Stage 0 pre-flight), and the whole `__tests__/` tree. **Forward-looking scope:** **E3/E4** (the lineage edge must reach `schema.prisma` and `sample-waqf.json`), **E5/S6** (the mapper that feeds the engine from a row), **E10/E12** (the beneficiary's Arabic statement).
**Relates to:** CLAUDE.md **Binding rules 1 and 4** · [§08 Distribution engine](../product/prd/08-distribution-engine-spec.md) Stage 2 (**partly superseded — see below**) · [glossary §B](../../docs/domain/glossary.md) · [awqaf-law Art. 4](../domain/regulations/awqaf-law.md) · [ADR-0004](ADR-0004-role-model-thirteen.md) (refuse, do not remap) · [ADR-0006](ADR-0006-shart-hatch-shut-in-e2.md) (a superseding instrument, never an edit) · [Build plan — Sprint 3 outcome](../product/prd/BUILD-PLAN.md) · V-1 / V-2 / V-3 · G-9 clause 3
**Classification:** Privileged & Confidential — internal

---

## ⚠ AMENDMENT — 2026-08-03 (A, B, C), 2026-08-09 (D), 2026-08-10 (E) and 2026-08-11 (F)

Everything below the amendment block was written before these rulings. **Where this record and amendments
A–C, E and F differ, the amendment wins**, because those are the owner's own corrections of engineering's
wording. **A · R-FRONTIER** corrects the eligibility test · **B** closes the joint-waqf conflict ·
**C · R6** answers this record's own open question 10 · **E · R7** answers the R6-D1 question in part ·
**F · R7-d** fixes what *"the bloodline is over"* means (**no continuing line**) and closes **R7-D1**.
⚠ **F supersedes part of E** — the *strict* extinction trigger E documents was built and is now replaced —
so read **F before E's R7-d subsection**, and note that **E's residual table still shows R7-D1 and R7-d as
open; F is the later word on both.**

⚠ **Amendment D is a different kind of thing and must not be read as the others are.** A–C and E are
**product-owner rulings**. **D is ENGINEERING'S OWN APPLICATION of the owner's R5 to a cohort shape the
owner was never asked about**, shipped in the fail-safe direction to stop a measured payout. It closed
**R6-D1** in the engine; it did **not** close the R6-D1 *question*. ⚠ **Amendment E now answers that
question — in part, and only in part:** the refusal is **CONFIRMED for a charity that would be paid
alongside the family** and **REVERSED for a charity recorded as the endowment's ultimate taker**. D's own
`TODO(surface)` in `resolver.ts` is therefore **replaced, not removed** — and the *other* two refusals D's
phase shipped (`DESCENDANT_ON_CHARITABLE_WAQF`, `TABAQA_ON_CHARITABLE_WAQF`) are **still** engineering's
reading of R5 and still await confirmation.

⚠ **This record has now needed five corrections; that is its value.** Superseded text is struck through and
left visible rather than deleted, so what was believed — and when it changed — stays legible to the next
reader.

### A · R-FRONTIER — entitlement sits at the NEAREST LIVING POINT on each line of descent

This ADR's own wording of the eligibility test — *"every living descendant of the waqif is eligible"* — was
**the orchestrator's translation, and it was wrong**. The engine faithfully implemented the wrong wording
and paid a grandchild while their father was still alive. The owner corrected it in one sentence:

> *"son A's child does not get since Son A is alive. Son A's child only gets anything if son A is dead."*

which matches their original narrative — *"**if** a male descendant is dead, their descendants continue to
be beneficiaries"* — where continuation is **triggered by the ancestor's death**. **The bug was in the
translation, not the rule.**

**The corrected test.** Under `LINEAGE_CONTINUATION` a beneficiary **b** is entitled iff **all** of:

1. `b.active === true`; **and**
2. **every ancestor strictly between b and the waqif is DECEASED** — a living ancestor holds the
   entitlement and their descendants wait (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`); **and**
3. under `ZUHUR_ONLY` only: every ancestor strictly between b and the waqif is a `SON`.

`b`'s **own** `lineageLink` is still not read — an eligible line may end in a son or a daughter. That half
of this ADR was right and is unchanged.

| Tree (waqif at the root) | Verdict |
|---|---|
| Waqif → S1 (**alive**) | S1 entitled — no intermediate ancestors |
| Waqif → S1 (**alive**) → C (alive) | **C NOT entitled** — S1 is alive and holds it (the case the owner corrected) |
| Waqif → S1 (**dead**) → C (alive) | C entitled |
| Waqif → S1 (**alive**) → S2 (dead) → C (alive) | **C NOT entitled** — a further-up ancestor is still alive |
| Waqif → S1 (dead) → S2 (dead) → C (alive) | C entitled |
| Waqif → D (daughter, alive) | D entitled under BOTH stipulations |
| Waqif → D (daughter, **dead**) → C, `ZUHUR_ONLY` | C NOT entitled — `BUTUN_LINE_NOT_CONTINUED` |
| Waqif → D (daughter, **dead**) → C, `ZUHUR_AND_BUTUN` | C entitled |
| Waqif → D (daughter, **alive**) → C, `ZUHUR_AND_BUTUN` | C NOT entitled — D is alive |

**The arithmetic is unchanged: PER CAPITA, equal per head** — the cohort is simply now the living frontier
rather than every living descendant. The flagship fixture's measured result moves from
`26,000,000 / 26,000,000 / 26,000,000` to **the two sons taking half each and the child taking nothing**.

**In the code:** a new exclusion code `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`, named for the fact rather than
the mechanism, whose doc records that it is **temporary and reverses on the ancestor's death** — the same
person is entitled next period, so nothing downstream may treat it as durable. The **nearest** blocking
ancestor is named in the trace detail, because it is the fact a beneficiary disputes. Where a member is
blocked by **both** a living ancestor and a daughter-line break under `ZUHUR_ONLY`, the **daughter-line
break is reported** — one reason is permanent under this deed and the other temporary, and the Arabic
statement must not tell someone "wait for your father to die" when their line never continues under this
Shart. ⚠ **That precedence is a `TODO(surface)` — engineering's call, not the owner's.**

`ORDERED`, `SHARED`, `NA_DIRECT_USE`, the waterfall, the gates, timing, the allocator and every
conservation invariant are **UNCHANGED**.

### B · The joint-waqf conflict is RESOLVED — decision 3 stands and there was never a contradiction

Decision 3 below records an unresolved conflict with Awqaf Law **Art. 4** and with
`docs/domain/glossary.md`'s الوقف المشترك line, and refers a precise either/or to Saudi counsel.
**The owner has answered it:**

> *"it just means that there are 2 types of endowments/waqf, but a waqf cannot be both."*

So Art. 4's "joint" is the **Authority's oversight category spanning both kinds of endowment** — not a
single hybrid endowment. **There was never a contradiction.** Consequently:

- The engine's refusal (`WAQF_TYPE_JOINT_NOT_POSSIBLE`, `COHORT_MIXES_CHARITABLE_AND_FAMILY`) is
  **correct and stays**.
- `docs/domain/glossary.md`'s الوقف المشترك line was the **drifted side** and is reworded: it denotes that
  the Authority oversees both kinds, not that one waqf combines both. The Arabic term stays.
- `docs/domain/regulations/awqaf-law.md`'s Art. 4 annotation moves from "open question for counsel" to
  **resolved**. The Art. 4 summary line itself is unchanged.
- CLAUDE.md register item **#11** moves from ⚠ OPEN to ✓ RESOLVED.
- **`JOINT` stays in `schema.prisma`'s `WaqfType`.** It is now a *vocabulary the engine refuses* rather
  than a contested one. Removing it is a migration owed to **E3/E4**; ADR-0004's refuse-don't-remap
  discipline applies. No migration is written here.
- ⚠ **One honest caveat, and no more:** the owner is a practising Nazir, not Saudi counsel, so this is the
  **product's** position. A legal filing or an Authority dispute that turns on the meaning of المشترك
  should still be put to counsel. **That caveat does not reopen the item — it is resolved.**

Item 2 of *"What is settled and what is not"* at the foot of this record — *"(a) whether الوقف المشترك as
Art. 4 uses it means one endowment with both legs"* — is therefore **closed**. Items (b) and (c) stand.

### C · R6 — open question 10 is ANSWERED: **require the parent on every deed**

This record's **open question 10** asked whether `ORDERED` (al-aʿlā fa-l-aʿlā) deeds should also require a
family beneficiary's lineage edge, or whether the requirement belongs only to `LINEAGE_CONTINUATION`.
Amendment A's paragraph on G-9 and the `buildLineage` header both recorded that engineering **would not add
the refusal unilaterally** and were waiting on this. **The owner answered YES** (2026-08-03).

**The rationale, in the owner's frame — not engineering's:** eligibility comes from **descent**, so the
descent must be **on record whatever rule the deed happens to use**, and **nobody the engine cannot place in
the family tree may ever be paid**. The requirement is therefore about the *record*, not about the *order*:
an unplaceable family beneficiary is an **incomplete Shart**, not a beneficiary with an unusual shape.

**What changed in the engine — one gate, no arithmetic.** `resolver.ts` `buildLineage` pass 4 is no longer
gated on `entitlementOrder === 'LINEAGE_CONTINUATION'`. A `FAMILY` or `CATEGORY_ONLY` beneficiary carrying no
`lineageLink` now halts the run with `SHART_INCOMPLETE` / **`LINEAGE_LINK_MISSING`** on **every** order —
`ORDERED`, `SHARED` and `LINEAGE_CONTINUATION` alike. (`NA_DIRECT_USE` short-circuits before the graph is
built; see the caveat below.)

**What R6 does NOT change.** The `ORDERED` tier rule itself, `SHARED`, `NA_DIRECT_USE`, the R-FRONTIER
lineage rule, the per-capita arithmetic, the waterfall, the gates, timing, the allocator and every
conservation invariant are **untouched**. R6 is a **data-completeness requirement**, not a change to who gets
paid among properly recorded beneficiaries. Amendment A's own summary of what it left alone stands.

#### What R6 closes — S3-D1's mechanism, and it closes from both sides

**MEASURED on the shipped engine immediately before the change:** an `ORDERED` deed with every recorded
ṭabaqa extinct plus one `FAMILY` member carrying `tabaqa: null, lineageLink: null` paid that member the
**ENTIRE distributable — 78,000,000 halalas of 78,000,000 — with no flag raised, while the run still reported
invariant I5 as checked.** That is **S3-D1**, open since Sprint 3. *(Three independent measurements of the
same defect now exist, on three different pools: 31,500,000/31,500,000 in this ADR's amendment-A paragraph,
27,500,000/27,500,000 in the BUILD-PLAN's docs-pass re-measurement, and 78,000,000/78,000,000 here. The pools
differ because the fixtures differ; "the whole pool" is the finding in all three.)*

The closure is **structural rather than incidental**, because after R6 such a member cannot carry
`tabaqa: null` **at all**, by either route:

| The record the attacker needs | What happens now |
|---|---|
| `FAMILY`/`CATEGORY_ONLY`, **no** `lineageLink` | halts `LINEAGE_LINK_MISSING` (pass 4, every order) |
| `FAMILY`/`CATEGORY_ONLY`, **with** a `lineageLink` | the member is in the graph, so a null ṭabaqa disagrees with a derived depth of ≥ 1 ⇒ halts `TABAQA_MISMATCHES_LINEAGE_DEPTH` |

**Two independent refusals with no gap between them.** `packages/domain/src/distribution/__tests__/r6-adversarial.test.ts` §1 drives eight routes — the original
attack; `CATEGORY_ONLY` in place of `FAMILY`; a jiha standing beside `FAMILY` members (refused earlier still,
at Stage 0, `COHORT_MIXES_CHARITABLE_AND_FAMILY`); a link without a ṭabaqa; a legal parent *chain* with a null
ṭabaqa; `SHARED`; an all-unplaceable cohort; and `NA_DIRECT_USE` — each asserted **by its own `details.refusal`
discriminator, never by a bare `SHART_INCOMPLETE`**, which now carries **fifteen** distinct discriminators *(⚠ that was the count on 2026-08-03; it is **twenty-six** as of 2026-08-10 — see amendment D's corrected paragraph and amendment E)*
(counted in `contract.ts`'s `SHART_REFUSALS` — the adversarial pass reported "sixteen"; corrected here). A
control run proves R6
refuses a **gap**, not a legal deed. Mutation-verified: re-gating pass 4 on the order turns 10 tests red
across 5 files; `resolver.ts` restored byte-identically (md5 `b8df2c6a646160763c169edfa06ef1a5`).

⚠ **`NA_DIRECT_USE` is pinned as an exception and is not a hole:** it short-circuits before the lineage graph
is built, so it is **not** refused — but it emits zero monetary lines and retains the whole distributable
(I7), so there is nothing for an unplaceable member to escape *with*.

#### G-9 clause 3 — **still QUALIFIED.** Narrower than before, and not closed

Stated exactly as the adversarial pass measured it, because two earlier documents overstated this and both
were caught:

> Clause 3's **literal words** ("ordered mode excludes lower tiers while upper live") hold, and are now
> well proven — §4 of the R6 adversarial suite drives a real two-generation `waqf-001` tree (derived depths
> `[1,2,1]`, reported ṭabaqāt `[1,2,1]`), shows the **tier exclusion and nothing else** deciding the outcome
> (ben-002 is active, VERIFIED, KYC-fresh and non-zero-weight, and receives nothing solely because its
> parent's generation lives; killing that generation moves the whole 27,500,000 to it), and tiers a
> three-generation chain correctly end to end. P3 still holds over a generated 1–4-deep spine with a
> forced-extinct ṭabaqa-1 root. ⚠ **At `RUNS_PAIRED` = 500, not 10,000** — the adversarial pass wrote
> "P3 at 10,000 runs" and that is corrected here: `RUNS_LEAKAGE` = 10,000 belongs to **P1**, the leakage
> property the E6 exit clause names.
>
> **But clause 3 was never qualified over its literal words.** It was qualified because *"an untiered
> beneficiary escapes the tier test and takes the whole pool"* — and **that sentence is still true today**,
> with a `CHARITABLE_JIHA` in place of the `FAMILY` member (finding **R6-D1** below). Un-qualifying clause 3
> on the same standard that qualified it therefore requires closing R6-D1, and **R6-D1 is a product
> decision, not an engineering one**.
>
> **Honest status: clause 3 is qualified in a STRICTLY NARROWER way than before.** The escape now requires a
> `CHARITABLE_JIHA` on a family-typed waqf, rather than any `FAMILY` member with a missing field, and the far
> commoner shape is structurally impossible. That is real progress and roughly a third of the previous
> exposure. **It is not closure.**

⚠ **The paragraph above is the 2026-08-09 pre-fix state and is SUPERSEDED IN PART by amendment D.** Its
verdict — **clause 3 STILL QUALIFIED** — stands unchanged, but the route it names is now refused: a
`CHARITABLE_JIHA` on a **family-typed** waqf halts on `CHARITABLE_JIHA_ON_FAMILY_WAQF`. **The escape that
keeps the clause qualified today runs on a `PUBLIC_CHARITABLE` waqf instead** (**ESC-1**). Read amendment D's
G-9 section for the operative wording; do not quote this paragraph as the current route.

So **S3-D1 is a split verdict**, and which half you mean decides the answer:

- **The lineage path** — closed, and never dependent on R6: entitlement under `LINEAGE_CONTINUATION` is not
  keyed on `tabaqa` at all, so there is no tier test to escape.
- **The `FAMILY` / `CATEGORY_ONLY` route on `ORDERED`/`SHARED`** — **genuinely closed by R6**, from both
  sides, as tabulated above.
- **The payload as a class** — **NOT closed.** See R6-D1.

#### The four findings R6 leaves open — surfaced, not resolved (binding rule 4)

| # | Finding | Severity | Status |
|---|---|---|---|
| **R6-D1** | **S3-D1's payload survives with a charity as the escapee.** A `FAMILY_DHURRI` (ذري) waqf under `ORDERED` whose recorded descendants are `CATEGORY_ONLY` placeholders **carrying real lineage edges**, plus one `CHARITABLE_JIHA`, is not refused: `assertSingleWaqfNature` counts only `kind === 'FAMILY'` as a family leg, and the tier test skips anyone with a null ṭabaqa — which after R6 only a jiha can be. **MEASURED: with the bloodline extinct the jiha takes 27,500,000 of 27,500,000, unflagged, with I5 reported as checked**; with a **living** ṭabaqa-1 descendant present, that descendant is halved from 27,500,000 to 13,750,000 — a **13,750,000-halala (SAR 137,500.00) diversion in a single period**. `SHARED` reaches the same outcome by a different exclusion, and a jiha **alone** on a `FAMILY_DHURRI` waqf is accepted under `ORDERED` while the identical cohort under `LINEAGE_CONTINUATION` is refused `LINEAGE_ORDER_ON_CHARITABLE_WAQF`. | **HIGH** | ⚠ **CLOSED IN THE ENGINE 2026-08-09 — see amendment D. THE QUESTION IS STILL OPEN.** `CHARITABLE_JIHA_ON_FAMILY_WAQF` refuses this cohort unconditionally, but that refusal is **Claude's application of R5, not the owner's ruling**, and it carries a `TODO(surface)`. The question below stands until the owner confirms: **does decision 3's "either خيري or ذري, never both" bind a cohort of `CATEGORY_ONLY` descendants plus a jiha?** R6's principle cannot simply be extended to jihas — a jiha is *legitimately* outside the family tree and must be payable on a خيري waqf. ⚠ **And the escape CLASS is not gone**: it survives as **ESC-1** on a **`PUBLIC_CHARITABLE`** waqf. ⚠⚠ **BOTH SENTENCES ARE NOW SUPERSEDED — 2026-08-10.** The question was put to the owner and **ANSWERED (amendment E, R7)**: a jiha may sit in a ذري cohort **only as the deed's recorded ultimate taker (مآل الوقف)**, taking the distributable once the bloodline is over and nothing before it — so the refusal is **conditional**, not unconditional. And **ESC-1's route is refused** (`DESCENDANT_ON_CHARITABLE_WAQF`), though its own fiqh question is open. ⚠ **What is NOT superseded is the payload**: R7 restores a reachable untiered line to a tiered family cohort, and **R7-D1** measures this exact 27,500,000-of-27,500,000 outcome one `reversion` field away — on a register of unenumerated `CATEGORY_ONLY` placeholders marked `active: false`. |
| **R6-C1** | **No property test can now generate the `FAMILY_DHURRI` + `CHARITABLE_JIHA` cohort.** After R6 only a jiha may be untiered, so `arbTieredCohort`'s untiered subject had to become one — and `arbLiveRunInput` types **any** cohort containing a jiha as `PUBLIC_CHARITABLE`, while `arbCharitableCohort` never emits a `FAMILY` member. The two branches are exhaustive, so the property suite's untiered-member coverage **moved to the one waqf type where paying a jiha is legitimate**. P3 and P5 are **not vacuous** — their claims still hold and are still reached over a real generated spine — but the property surface's only window onto R6-D1 is closed. That is why every generated run is green while the adversarial suite hand-builds the same shape and watches it pay out. | MEDIUM | ⚠ **CLOSED 2026-08-09 as a coverage gap — see amendment D.** New arbitraries (`arbFamilyWaqfJihaCohort`, `withoutCharitableJihas`, `arbTieredJihaCohort`, `arbCharitableJihaOnFamilyWaqfCase`) draw the cohort and its control on all four orders; `RUNS_LEAKAGE` stays at 10,000 and nothing was weakened. **The lesson it produced stands permanently and is now this record's headline lesson** — *a property whose generator cannot reach a configuration reports its silence as success, at scale.* |
| **R6-F1** | **R6 made a charitable waqf's unnamed segment unrepresentable.** Pass 4 covers `CATEGORY_ONLY` on **every** waqf type, so on a `PUBLIC_CHARITABLE` (خيري) waqf a not-yet-identified segment ("the orphans of the district") can no longer be recorded **unless it is given a SON/DAUGHTER edge from a line that does not exist** — and the refusal message it raises tells a charitable waqf about *"entitlement in a family waqf"*. The only workaround runs: asserting the segment is a child of the waqif computes (22,916,667 / 4,583,333 of 27,500,000) with **nothing on the result marking the edge as invented**. **A fiction written into a record to satisfy a check is the shape R6 exists to prevent.** | MEDIUM | ⚠ **CLOSED 2026-08-10 — see amendment D's corrected residual row.** Engineering's own extension was withdrawn: pass 4 now demands the edge from a `CATEGORY_ONLY` member **only on a `FAMILY_DHURRI` waqf**, so an edgeless charitable segment resolves (BR-206's `CATEGORY_NOT_CAPTURED` gate covers the blank category) while the same segment carrying an edge halts `DESCENDANT_ON_CHARITABLE_WAQF`. The requirement on **`FAMILY`** members is the owner's R6 and is untouched. |
| **R6-I5** | **`invariantsChecked` still reports I5 on a run whose only PAID line lies outside I5's claim.** `assertOrderedExclusion` skips any line with `tabaqa === null`. On a purely family cohort that branch is now **unreachable**, and that is pinned positively (I5 present **and** no line's `basis.tabaqa` null). On the R6-D1 cohort the exemption is still live, so I5 is reported while making no claim about the line that took the money — the same honesty gap S3-D1 carried, narrowed to the jiha case. | MEDIUM | **NOT FIXED**, and it **cannot** be fixed independently: it is R6-D1's second half. Whatever the owner decides about a jiha in a ذري cohort determines whether I5's exemption should refuse, narrow, or stay. |

Two further items, recorded so nobody re-derives them:

- **R6-DOC1 (low, NOT fixed) — a stale comment of exactly the class this repo has paid for three times.**
  `packages/domain/src/distribution/contract.ts:790` still documents `LINEAGE_LINK_MISSING` as *"Under
  `LINEAGE_CONTINUATION`, a `FAMILY`/`CATEGORY_ONLY` member with no `lineageLink` at all"*, and
  `resolver.ts`'s `buildLineage` precedence table still reads *"under lineage: …"* in row 4. Both are now
  **order-independent**. The behaviour is correct and driven by tests; only the prose lags — but it is the
  exact sentence that would tell the next reader S3-D1 is still open on `ORDERED`. **Left to the code owner
  rather than edited in this docs pass**, because `resolver.ts`'s byte-identity is what the R6 mutation
  verification rests on.
- **R6-CI1 (medium, NOT fixed) — `turbo run … --force` failed 2 of 6 attempts during this work, once via a
  whole test *file* failing to collect while the same run reported 127 tests passed.** A collection failure
  takes an entire file's tests with it and still prints a green-looking count. That is **lesson 3** at the
  runner level, and it is why every green number in this record was measured with
  `pnpm --filter @qmulate/domain exec vitest run` — file count included, so a vanished file is visible.

~~**Green, measured 2026-08-09 after R6 and the fixture sweep:**
`pnpm --filter @qmulate/domain exec vitest run` → **26 files / 1473 tests, all pass** ·
`pnpm --filter @qmulate/domain exec tsc --noEmit` → clean.~~

⚠ **SUPERSEDED the same day — the line above is left visible because it is what was true before
INCIDENT-1.** The tree is now **RED**: 27 files, **65 failed / 927 passed (992)**, four files failing at
collection. See amendment D, *"The numbers — measured, not inherited"*. **Do not quote 1473/26 as this
tree's state.**

**Open question 10 is therefore CLOSED and replaced by two new ones** (both owner-facing, both in the
open-questions list): *may a charitable jiha sit in a ذري cohort at all* (R6-D1), and *does the
lineage-edge requirement reach `CATEGORY_ONLY` on a خيري waqf* (R6-F1).

### D · R6-D1 is CLOSED IN THE ENGINE — and the refusal that closes it is **Claude's reading, not the owner's**

*(2026-08-09, same day as R6. Adversarial review found R6-D1 within hours of R6 landing; the closure is
recorded here in the same record so the two are never read apart.)*

⚠ **Read this heading exactly as written.** `CHARITABLE_JIHA_ON_FAMILY_WAQF` is **engineering's
application of the owner's R5 to a shape the owner was never asked about directly.** It is **not** a
product-owner decision, it is **not** an answer to the R6-D1 open question above, and the open question
**stays open** until the owner confirms it. The refusal ships in the fail-safe direction — it halts a run
rather than paying a charity a family's ghallah — and it carries a `TODO(surface)` in `resolver.ts` that
**must not be removed** until that confirmation exists. ~~**If the owner says a family deed may legitimately
name a charity, this refusal comes out and R5 needs restating.**~~

⚠ **ANSWERED 2026-08-10 — amendment E, and the struck sentence above is exactly half right.** The owner was
asked and said a وقف ذري **may** end up at a charity — *"once ALL descendants are dead and the bloodline is
over"*. So the refusal did **not** come out and R5 did **not** need restating: it **narrowed**. A charity on
a ذري deed **recorded as the endowment's ultimate taker** is permitted; the same charity **not so recorded**
is still refused by this discriminator, because that is the concurrent payment R5 forbids. Read amendment E
before quoting anything below as the current rule.

#### What R6-D1 was, and how close to R6 it sat

A `FAMILY_DHURRI` (وقف ذري) waqf whose descendants are recorded as `CATEGORY_ONLY` placeholders — **a
legitimate way to record a not-yet-enumerated generation** — plus one `CHARITABLE_JIHA` passed every
existing check, because the two neighbouring refusals each need a fact this shape does not supply:

| Refusal | Why it could not see this cohort |
|---|---|
| `COHORT_MIXES_CHARITABLE_AND_FAMILY` | requires a member with `kind === 'FAMILY'` to be present. There is none — the descendants are `CATEGORY_ONLY`. |
| `LINEAGE_ORDER_ON_CHARITABLE_WAQF` | requires `entitlementOrder === 'LINEAGE_CONTINUATION'`. The attack runs on `ORDERED` (and `SHARED`). |

And the tier test skips anyone with a null ṭabaqa — which, **after R6, only a jiha can be**. So R6 closing
the `FAMILY`/`CATEGORY_ONLY` route left the *payload* reachable **one `kind` field away** from the route it
had just closed.

**MEASURED on the shipped engine before the fix** — the same figures as the R6-D1 row above, restated here
so the closure and the defect carry one set of numbers:

- bloodline extinct ⇒ **the charity was PAID 27,500,000 of 27,500,000 halalas**, unflagged, with invariant
  **I5 still reported as checked**;
- with a **LIVING ṭabaqa-1 descendant** present ⇒ the charity still took **13,750,000** halalas
  (**SAR 137,500.00 ⚠ verify — a halala/SAR conversion, not a regulatory figure**) that belonged to the
  bloodline, halving that descendant from 27,500,000 to 13,750,000 in a single period.

That is the **S3-D1 outcome** — an untiered beneficiary escaping the tier test and taking the pool — with a
charity as the escapee.

#### The refusal

`resolver.assertSingleWaqfNature` gained one unconditional check, and `contract.ts`'s `SHART_REFUSALS`
gained the discriminator **`CHARITABLE_JIHA_ON_FAMILY_WAQF`**:

> a `CHARITABLE_JIHA` on a `FAMILY_DHURRI` waqf is refused **whatever else the cohort holds and whatever
> the `entitlementOrder`** — an ancestral waqf's beneficiaries **are** the waqif's descendants (R1) and a
> charity is not one, so the record makes one endowment both خيري and ذري, which **R5** forbids.

Three properties of it are load-bearing and are recorded rather than left to be re-derived:

1. **It keys on the DECLARED TYPE** (`input.waqfType`), which is the one fact the two neighbouring
   refusals cannot see. ⚠ That is also its fragility: **a mis-transcribed `waqfType` defeats it**, and a
   mis-transcription is exactly where this class of defect lives. See the residual **ESC-1** below.
2. **It sits inside `assertSingleWaqfNature`, which runs BEFORE the `NA_DIRECT_USE` short-circuit**, under
   the precedence note already documented in `resolveEntitlement` ("R5 · unconditional"). A direct-use waqf
   carrying this contradiction therefore also refuses — **consistent with how `JOINT` already behaved
   there**, and deliberate: a record that cannot describe a real endowment should not be accepted merely
   because no money would have moved on it.
3. **It does not narrow any vocabulary.** `CHARITABLE_JIHA` and `FAMILY_DHURRI` both remain legal values;
   only their *combination on one record* is refused — ADR-0004's refuse-don't-remap discipline again.

~~**`SHART_REFUSALS` now carries SIXTEEN discriminators**~~ (counted in `contract.ts`: fifteen before this
one). ⚠ The change brief that commissioned this pass said *"seventeen"*; **that is wrong and is corrected
here** — the same off-by-one class as the "sixteen"/"fifteen" correction recorded in the R6 block above.
Every assertion in the suite must name its discriminator: `SHART_INCOMPLETE` alone now proves nothing.

⚠ **The count is now TWENTY-SIX** — sixteen after this refusal, eighteen after amendment D's phase added
`DESCENDANT_ON_CHARITABLE_WAQF` and `TABAQA_ON_CHARITABLE_WAQF`, twenty-six after R7's eight (amendment E).
**Counted in `contract.ts`'s `SHART_REFUSALS` on 2026-08-10, not inherited.** Three off-by-ones have now
been recorded in this file for this one number; the count is quoted here only because every test must assert
a discriminator, and the honest instruction is *"read the array"* rather than *"trust this line"*.

#### G-9 clause 3 — **STILL QUALIFIED.** Do not un-qualify it

Stated exactly as the adversarial enumeration measured it. **Three documents have now overstated this
clause and every one was caught**, so the wording below is the verdict and not a summary of it:

> Clause 3 (*"ordered mode excludes lower tiers while upper live"*) was qualified **not on its literal
> words** but because **an unplaceable beneficiary could escape the tier test and take the pool**. That
> escape is **still drivable**, so the qualification stands.
>
> **The surviving route, named precisely:** on a waqf declared **`PUBLIC_CHARITABLE`** under **`ORDERED`**,
> with a cohort of `CATEGORY_ONLY` placeholders **the engine has itself certified as descendants of the
> waqif** at derived ṭabaqāt 1 and 2, plus one `CHARITABLE_JIHA` — the jiha is untiered, so
> `orderedExclusionReason` never tests it, and it takes **13,750,000 of 27,500,000 halalas beside a living
> ṭabaqa-1 descendant**, **24,750,000 at deed weight 90**, and **27,500,000 of 27,500,000 when both
> certified descendants are dead** and sit on the run as `EXCLUDED`/`TABAQA_EXTINCT`. Clause 3 is **visibly
> operating** on that last run — it excludes both tiers — and **the whole pool leaves the tier contest
> anyway.**
>
> **What IS proven, and worth recording as progress rather than closure:** on **every `FAMILY_DHURRI` cell**
> of the enumeration, clause 3's exclusions are **exhaustive over the paid lines** — no untiered line is
> ever paid on an ancestral waqf, because a jiha there is now refused outright and a `FAMILY`/
> `CATEGORY_ONLY` member cannot reach a line without a lineage edge. **If clause 3's scope were narrowed to
> "on a waqf typed `FAMILY_DHURRI`", it would be un-qualifiable on this evidence. As written, unqualified,
> it is not.**

⚠ **TWO CORRECTIONS to the paragraph above, and the verdict survives both — 2026-08-10.**

1. **The route it names is now refused.** `DESCENDANT_ON_CHARITABLE_WAQF` halts any خيري cohort carrying a
   lineage edge and `TABAQA_ON_CHARITABLE_WAQF` halts any خيري beneficiary carrying a ṭabaqa, so ESC-1's
   18 cells no longer compute. A phase-level claim was made at that point that this *"closes the last of the
   three reasons G-9 clause 3 was reported qualified"* — **that claim is not adopted here.**
2. **The sentence *"no untiered line is ever paid on an ancestral waqf"* became FALSE on 2026-08-10 (R7).**
   A ذري deed may now carry an **untiered ultimate-taker jiha**, which is paid the whole distributable once
   the bloodline is over — **a reachable untiered line inside a tiered family cohort, which is the exact
   configuration this clause's qualification is about.** What keeps it safe is no longer *"no jiha can be
   here"* but two pieces of **new code**: the taker is **EXCLUDED by default** until the reversion triggers,
   and invariant **I-R1** asserts no charity is ever paid a halala in the same run as any descendant.

**So the verdict stands as written: G-9 clause 3 is STILL QUALIFIED.** Do not read either correction as
closing it, and do not quote R7 as closing it. Four premature closures are recorded in this file; a stronger
guarantee that is one day old is not the fifth. The configuration is now driven explicitly in
`g9-adversarial.test.ts` (the taker takes **0** beside a living ṭabaqa-1 descendant; **27,500,000** when the
line has ended), because a suite that certifies clause 3 without exercising the shape the certification turns
on is green for the wrong reason.

**Two further reasons to stay conservative**, recorded because they are the reasons and not decoration:

- **The surviving route turns on a single `waqfType` field** — the same shape of fragility the last two
  closure claims died on. `CHARITABLE_JIHA_ON_FAMILY_WAQF` keys on the **declared type**, which is exactly
  where a mis-transcription lives.
- **The evidence base is weaker than it was an hour before the verdict** — see **INCIDENT-1** below.
  Un-qualifying a gate on a tree whose suite **cannot be run to green** would be the fourth premature
  closure in this file's history.

#### The enumeration behind that verdict — and its bounds, stated rather than glossed

**2,592 cells**, every combination constructed in code and run, plus named near-misses.

**REFUSED — 1,998 cells**, each by the discriminator that names it, never a bare `SHART_INCOMPLETE`:

| Route | Cells | Discriminator |
|---|---|---|
| `waqfType: JOINT`, any cohort, any order, incl. direct use | 864 | `WAQF_TYPE_JOINT_NOT_POSSIBLE` |
| any cohort holding both a jiha and a `FAMILY` member, under either legal type | 432 | `COHORT_MIXES_CHARITABLE_AND_FAMILY` |
| **a jiha on a `FAMILY_DHURRI` waqf with no `FAMILY` member — the R6-D1 shape — on ALL FOUR orders including `NA_DIRECT_USE`** | **216** | **`CHARITABLE_JIHA_ON_FAMILY_WAQF`** |
| a lineage order on a خيري waqf or over a jiha | 162 | `LINEAGE_ORDER_ON_CHARITABLE_WAQF` |
| a lineage order with a null/unrecognised continuation term | 36 | `CONTINUATION_STIPULATION_UNRECOGNISED` |
| any `FAMILY`/`CATEGORY_ONLY` member with no `lineageLink`, on every order that builds the graph | 288 | `LINEAGE_LINK_MISSING` |

That last row is what shuts the **original S3-D1 shape from both sides**: without a link the run halts;
with one the member is in the graph and a null ṭabaqa halts on the depth cross-check.

**RESOLVED — 594 cells.** The escape predicate — `entitledMinor > 0 && basis.lineageDepth === null`, i.e.
***the engine paid someone it could not place***, read off the engine's **own published basis** rather than
recomputed — was applied to every one:

- **0 escapes on any `FAMILY_DHURRI` cell. 0 on any `JOINT` cell. 1,728 cells clean. R6-D1's closure holds.**
- **0 escapes where the unplaced payee was a `FAMILY` or `CATEGORY_ONLY` member** — after R6 they cannot
  reach a line unplaced at all.
- **72 escapes**, all `PUBLIC_CHARITABLE`, all under `ORDERED` or `SHARED`, the escapee always the
  `CHARITABLE_JIHA`. **54 of the 72 are the jiha alone in the cohort — legal, and must stay legal.**
- ⚠ **18 are ESC-1** (below).

**Near-misses driven explicitly, all behaving:** a jiha alone on خيري computes (it must not refuse) · a
`CATEGORY_ONLY`-only cohort computes on both legal types · a family waqf with zero beneficiaries computes,
flags `NO_ELIGIBLE_BENEFICIARIES` and retains the whole distributable · `NA_DIRECT_USE` + jiha on ذري is
**refused** (the refusal outranks I7) while `NA_DIRECT_USE` + jiha on خيري resolves and pays nobody · a jiha
beside real `FAMILY` members keeps `COHORT_MIXES_CHARITABLE_AND_FAMILY` as **its own** discriminator rather
than being absorbed by the new one.

⚠ **The bounds of the enumeration, stated rather than glossed:** depth ≤ 2, ≤ 2 members per kind,
`lineageLink: SON` throughout, one money shape. **It cannot see an escape that needs three generations or a
`DAUGHTER`-specific interaction** — though a `DAUGHTER` link cannot turn an *excluded* member into an
*unplaced* one, since the link is what puts them in the tree at all.

#### Residuals this pass leaves — surfaced, not resolved (binding rule 4)

| # | Finding | Sev | Status / why it is not an engineering call |
|---|---|---|---|
| **ESC-1** | ~~**The escape class is NOT gone.**~~ On a **خيري** waqf a jiha still takes ghallah from members **the engine itself certified as descendants of the waqif** — derived depth, `lineageLink: SON`, ṭabaqa cross-check passed, all printed on their BR-505 basis. 18 cells: **12 pay a certified descendant beside the charity; in the other 6 every certified descendant is `EXCLUDED` (`TABAQA_EXTINCT` / `BENEFICIARY_INACTIVE`) and the charity takes 100%.** | **HIGH** | ⚠ **CLOSED IN THE ENGINE in this same phase, and this row never said so** — the record lagged the code by two commits and is corrected on 2026-08-10. **`DESCENDANT_ON_CHARITABLE_WAQF`**: any beneficiary carrying a `lineageLink` on a `PUBLIC_CHARITABLE` waqf halts, on every `entitlementOrder`, because a خيري waqf's beneficiaries are the segment the waqif chose and a cohort carrying lineage edges **is** a bloodline. A companion refusal **`TABAQA_ON_CHARITABLE_WAQF`** (2026-08-10) closes the same contradiction along the other axis — on a خيري waqf **nobody** may carry a ṭabaqa, so a ṭabaqa now exists only where a bloodline does. ⚠ **Both are again ENGINEERING'S reading of R5, not the owner's ruling**, each with a `TODO(surface)`: *may a خيري waqf's cohort contain members recorded as the waqif's own descendants at all?* is still the owner's question. **The escape route is refused; the fiqh question is open.** |
| **ESC-2** | **A tiered jiha on a خيري `NA_DIRECT_USE` waqf computes** — `assertJihaNotTiered` sits after the direct-use short-circuit, so the self-contradicting record (S3-D3's shape) goes **unreported**. **No money moves** (direct use emits zero monetary lines and retains the whole distributable, I7). | low | **NOT FIXED, and R7 gave it a SECOND reachable shape:** a **ذري** direct-use waqf with a legible reversion and a **tiered** ultimate-taker jiha short-circuits at `NA_DIRECT_USE` before `assertJihaNotTiered`, so the same self-contradiction goes unreported (8 cells of the 240-cell census resolve this way; still no money moves). Whether a record that cannot describe a real endowment should be refused even when nothing would be paid is the **same precedence question** `CHARITABLE_JIHA_ON_FAMILY_WAQF` answered one way and `JIHA_TIERED` answers the other. Engineering should not settle it silently in two different directions. |
| **R6-C1** | **CLOSED as a coverage gap — see the lesson below.** The property generators could not reach the `FAMILY_DHURRI` + `CHARITABLE_JIHA` cohort at all; new arbitraries now draw it (and its control) on all four orders. | — | Coverage restored. **The lesson it produced stands permanently.** |
| **R6-F1** | ~~Unchanged and still open~~ — R6 made a خيري waqf's unnamed segment recordable only by asserting a bloodline that does not exist. | MEDIUM | ⚠ **CLOSED 2026-08-10, and this row also lagged the code.** `buildLineage` pass 4 now requires the lineage edge from a `CATEGORY_ONLY` member **only on a `FAMILY_DHURRI` waqf** — on a charitable deed eligibility does not come from descent, so demanding an edge forced a fiction. An **edgeless** `CATEGORY_ONLY` segment on a خيري waqf now **resolves** (and is `CATEGORY_NOT_CAPTURED`-gated while its `category` is blank, which is the gate BR-206 exists for); the same segment **with** an edge still halts `DESCENDANT_ON_CHARITABLE_WAQF`. **The requirement is unchanged for `FAMILY` members on every waqf type** — that half is the owner's R6 and was never engineering's to narrow. Measured both arms, both recordings kept: `arbCharitablePlaceholderCase` draws ṭabaqa and link as **independent** axes, because welding them would have retargeted ESC-1's only remaining cell onto the newer ṭabaqa rule and left ESC-1 with no generator while the suite stayed green. |
| **R6-I5** | Unchanged and still open — `invariantsChecked` reports I5 on a run whose only PAID line lies outside I5's claim. ~~Now **narrowed to the خيري case**: on a `FAMILY_DHURRI` cohort the exemption is unreachable.~~ | MEDIUM | **NOT FIXED**, and **restated twice since**. (1) On a **خيري** `ORDERED` run over a wholly untiered cohort I5 is still certified while testing nothing, and every line's `basis.rule` still reads `ORDERED_LOWEST_LIVING_TABAQA` — which, if a charitable waqf has no generations at all, is wrong for the **whole** cohort and not only its untiered members. (2) ⚠ **R7 gave the `FAMILY_DHURRI` exemption a reachable subject again** — a cohort of tiered descendants plus an **untiered ultimate-taker jiha** is now legal, and that jiha is the one line I5's exemption skips. It is the case that must **not** be tier-excluded, it is now driven by acceptance test **AT-15** and by `g9-adversarial.test.ts`, and what protects it is the taker's default exclusion plus **I-R1** rather than I5. |
| **INCIDENT-1** | ⚠ **The uncommitted S4 test layer was DESTROYED by `git checkout -- packages/domain/src/distribution/` during this pass.** `g9-adversarial.test.ts` and the rest of the S4 suite are back at their **pre-R6** versions while the engine sources are post-R6 and post-R6-D1. | **CRITICAL** | ✓ **RESOLVED 2026-08-10.** The layer was rebuilt **by inverting rather than deleting** — every test whose input became legal or refused kept that input verbatim and asserts the new outcome, with its measured old behaviour in the doc comment. Suite measured green at **27 files / 1518 tests** after the rebuild and at **28 files / 1642 tests** after R7. **The `git checkout` prohibition is now written into every agent brief in this sprint.** |
| **SUITE-1** | **The domain suite cannot be certified in the state this pass leaves it.** | **CRITICAL** | ✓ **RESOLVED 2026-08-10 — measured, not inherited:** `pnpm --filter @qmulate/domain exec vitest run` → **28 files / 1642 tests, all pass**; `tsc --noEmit` clean. The file count is part of the measurement because a collection failure takes a whole file's tests with it and still prints a green-looking count (R6-CI1). |

#### The numbers — measured, not inherited

⚠ **This tree is RED.** Measured **2026-08-09** with the runner that shows the file count (not `turbo`,
which races sibling agents and, per R6-CI1, can print a green-looking count while a whole file fails to
collect):

```
pnpm --filter @qmulate/domain exec vitest run
  Test Files  10 failed | 17 passed (27)
       Tests  65 failed | 927 passed (992)
```

**Four of the ten failing files fail at COLLECTION** — `acceptance.test.ts`, `engine.test.ts`,
`g9-adversarial.test.ts`, `worked-examples.test.ts` — so their assertions did not run at all. The failures
are the signature of INCIDENT-1, not of the engine: the surviving tests assert the **pre-R6** contract
(*"does NOT require the link under `ORDERED` or `SHARED`"*, *"still lets an untiered `FAMILY` member escape
the tier test — S3-D1 is NOT closed here"*) against an engine where R6 and R6-D1 have both landed.

⚠ **Three different green numbers were reported to this docs pass and NONE of them describes the tree as it
now stands** — *"26 files / 1481 passed"*, *"12 failed / 1461 passed across 5 files"*, and this record's own
pre-incident *"26 files / 1473 tests, all pass"*. They are pre-INCIDENT-1 snapshots. **The measured number
above supersedes all three.** This is lesson 3 one more time: a count you did not take yourself is a claim,
not a measurement.

⚠ **AND THE RED NUMBER ABOVE IS ITSELF NOW HISTORY — 2026-08-10.** The test layer was rebuilt (INCIDENT-1
resolved) and the tree is green again. Measured with the same runner, twice, both taken in this repo rather
than reported into it:

```
after the خيري-nature refusals   Test Files  27 passed (27)   Tests  1518 passed (1518)
after R7 (amendment E)           Test Files  28 passed (28)   Tests  1642 passed (1642)
```

`pnpm --filter @qmulate/domain exec tsc --noEmit` → clean. **The 65-failed block above is left visible on
purpose**: it is what INCIDENT-1 cost, and this record's own history is the argument for never quoting an
inherited count.

#### The lesson this finding produced — and it is a LESSON, not a note

> **A property whose generator cannot reach a configuration reports its silence as success, at scale.**

**10,000 generated runs were green while a hand-built cohort paid a charity a family's entire ghallah**,
because no generator emitted `FAMILY_DHURRI` + `CHARITABLE_JIHA` — `arbLiveRunInput` typed *any* cohort
containing a jiha as `PUBLIC_CHARITABLE`, and `arbCharitableCohort` never emitted a `FAMILY` member, so the
two branches were exhaustive and the window onto the defect was closed by construction. **Coverage is not a
nice-to-have here; it is the difference between a property that proves something and one that decorates.**

The blind spot is now closed **in the generators, not by reading them**: `arbFamilyWaqfJihaCohort` (the
R6-D1 shape — `CATEGORY_ONLY` placeholders in a real derived-ṭabaqa tree plus 1–2 live jihas, no `FAMILY`
member **by construction**, because with one the engine refuses *earlier* and the draw would re-prove a
refusal that already has an arbitrary), its control `withoutCharitableJihas`, `arbTieredJihaCohort`,
`arbCharitableJihaOnFamilyWaqfCase` (`{input, control, order}` over all four orders), plus widened
`arbRefusedNatureInput` and `arbMalformedLineageInput`. `RUNS_LEAKAGE` stays at **10,000** and P1 still runs
10,000 cases — **no run count, timeout or assertion was weakened anywhere in this pass.**

#### What is owed after amendment D — the complete list, none of it discharged here

1. ⚠ **Owner confirmation of `CHARITABLE_JIHA_ON_FAMILY_WAQF`.** It is engineering's reading of R5. Until
   confirmed, the `TODO(surface)` in `resolver.ts` **stays** and this ADR does not present the refusal as a
   decision. If the answer is *"a family deed may name a charity"*, the refusal comes out and R5 is restated.
2. ⚠ **The ESC-1 question** — may a **خيري** waqf's cohort hold members recorded as the waqif's own
   descendants? This is what stands between G-9 clause 3 and closure. Also **ESC-2**'s precedence question
   (refuse a self-contradicting direct-use record, or let it compute paying nobody?).
3. ⚠ **Arabic (`ar`) and English (`en`) statement copy for every exclusion-reason, entitlement-rule and
   trace code**, including the new refusal (E10/E12). **It must NOT be invented in a code change** — it is
   product-approved legal text a beneficiary may dispute before the Authority or a court, and
   `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`'s Arabic must specifically not read as permanent.
4. ⚠ **The lineage edge in `schema.prisma` and `data/fixtures/sample-waqf.json`** (E3/E4) — no `parentId`
   self-relation, no `lineageLink`, no waqf-level continuation stipulation, and no member vital status
   usable as an eligibility fact along an ancestor walk. The engine leads by a **declared delta** pinned in
   `prisma-vocabulary-parity.test.ts`, failing in both directions. R6 enlarged this debt (`waqf-001` and
   `waqf-002` now need real invented trees); amendment D does not enlarge it further.
5. ⚠ **`JOINT` remains a live `schema.prisma` enum value that the engine refuses**, with the narrowing
   migration owed to E3/E4 under ADR-0004's refuse-don't-remap discipline. **No migration was written here.**
6. ⚠ **Per capita vs deed weights is still unasked.** Every lineage run still visibly flags a recorded Shart
   weight it did not apply (`STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA`) — honest, not stable.
7. ⚠ **The test layer must be rebuilt after INCIDENT-1**, inverting rather than deleting: each test that
   *measured* R6-D1 as live keeps its input verbatim, asserts `CHARITABLE_JIHA_ON_FAMILY_WAQF`, and records
   the measured old behaviour (27,500,000 of 27,500,000; the 13,750,000 diversion) in its doc comment.
8. ⚠ **§08 is still deliberately not rewritten** and its worked **Example D describes a refused input**
   (register item #12). **V-1 still needs a lineage sibling before Milestone 1.**

*(Regulatory figures referenced anywhere in this record — the 10% ʿushr, the 3-month post-FYE window, the
12-month KYC refresh, the classification bands — remain **⚠ unverified; confirm against primary Saudi law**,
binding rule 3. The halala figures above are engine measurements, not regulatory figures.)*

⚠ **Status of that owed-list after amendment E:** item 1 is **answered in part** (E) · item 2's ESC-1 *route*
is refused but its *question* is open, and ESC-2 is open with a second reachable shape · item 3 has **grown**
(R7 added an exclusion reason, an entitlement rule and three trace codes, all still without Arabic) · item 4
has **grown** (the reversion clause is owed to E3/E4 too) · items 5, 6 and 8 are **unchanged** · item 7 is
**done** (INCIDENT-1 resolved).

### E · R7 — a وقف ذري MAY name a charity, as its **ULTIMATE TAKER** and nothing else (مآل الوقف)

*(2026-08-10. **A product-owner ruling**, in answer to the R6-D1 question amendment D left open. Read this
before quoting amendment D's refusal as absolute.)*

The owner was asked whether a وقف ذري may name a charity and, if so, **when** the charity becomes entitled,
and chose the **ultimate-taker** reading:

> *"a waqf ذري may eventually (according to the regulatory mandate) end up at a charity once ALL descendants
> are dead and the bloodline is over."*

**This does not weaken R5** (*"a waqf is either خيري or ذري, never both"*) — it **narrows what R5 forbids**.
The endowment is ذري while the family lives; the charity **never shares a period with the bloodline**. What
changes is that a charity *recorded* on a ذري deed is no longer *per se* a contradiction — only a charity
**paid alongside living descendants** is. ⚠ **One caveat, the same one amendment B carries:** the owner is a
practising Nazir, not Saudi counsel. A filing or an Authority dispute turning on مآل الوقف still goes to
counsel; that does not reopen the ruling.

#### The shape: a WAQF-LEVEL deed clause naming beneficiary ids, and never inferred

`DistributionInput` gained one field beside `continuationStipulation`:

```
reversion: { kind: 'CHARITABLE_ULTIMATE_TAKER', ultimateTakerIds: string[] } | null   // nullable, NOT optional, NO default
```

**No new `BeneficiaryKind` and no per-beneficiary flag.** Four reasons, recorded so the next reader does not
re-litigate them: (1) مآل الوقف is a **clause of the deed**, like `waqfType` and `continuationStipulation`,
not a property of a person — the same charity is a خيري waqf's ordinary payee and a ذري waqf's ultimate taker
depending only on what the deed says; (2) it gives the engine **two sides that check each other** (the clause
names ids; the resolver verifies each id exists, is a `CHARITABLE_JIHA`, and carries no lineage edge) — a
boolean on the beneficiary row has **one** trusted side, which is exactly how S3-D1 shipped; (3) it reads
correctly on a **descendant's** BR-505 statement, where the endowment's مآل belongs, not only on the taker's;
(4) it costs no vocabulary — `BENEFICIARY_KINDS` stays one of the ten `MUST_MATCH` pairings in
`prisma-vocabulary-parity.test.ts` and E3/E4 is owed one migration rather than two (ADR-0004 discipline).

**R7-c — the reversion is a RECORDED DEED FACT and is never inferred.** The engine does **not** conclude that
a charity is the ultimate taker because it happens to be the only beneficiary left, and does **not** conclude
that a waqf has a reversion because a jiha is present. `null` means the deed records no مآل, and a charity on
a ذري deed is then refused exactly as amendment D refused it. Absent or ambiguous ⇒ `SHART_INCOMPLETE`
(binding rule 1). **`kind` is parsed as a free string on purpose**: a deed reverting to another waqf, to the
Authority, or to the waqif's nearest relatives must halt **by name** (`REVERSION_KIND_UNRECOGNISED`) rather
than be coerced into the one reading the owner gave.

⚠ **Honest limit, stated because a comment claiming a property the code lacks is a defect:** this shape does
**not** make the invalid record unrepresentable. It makes every invalid state **few, named, and refused in
one place before anything depends on it** — `assertReversionLegible` runs immediately after the `JOINT` check
and **before every cohort refusal**, so no exemption below can be granted on the strength of an unreadable
clause.

#### The three refusals that narrowed — each by exactly one clause, none deleted

| Refusal | What changed |
|---|---|
| **`CHARITABLE_JIHA_ON_FAMILY_WAQF`** | **CONDITIONAL, not deleted.** A jiha on a ذري waqf that the deed's reversion clause **names** is permitted; one it does **not** name is still refused, and the message **names the unnamed ids**. `reversion === null` still refuses (R7-c). Amendment D's `TODO(surface)` is **replaced** by a note recording what the owner confirmed and what they reversed. |
| **`COHORT_MIXES_CHARITABLE_AND_FAMILY`** | **MUST NARROW, by one exemption clause.** It keyed on *co-presence* in the register because, before R7, co-presence implied concurrency. **R7 breaks that implication** — a deed may name both while their periods are strictly disjoint — so as written it over-reached and would have made R7 unimplementable for every properly-recorded family register. The exemption is a ذري waqf + a legible reversion + **every** jiha in the cohort named in it (`every`, not `some`: one unnamed charity beside named ones is still a charity that would be paid concurrently). **What keeps firing, unchanged:** every خيري cohort holding a jiha and a `FAMILY` member; every ذري cohort with a jiha that is not a recorded taker; every cohort whose reversion the validator rejected. **Still keyed on the COHORT, not the declared type**, so a genuinely mixed cohort cannot re-enter as `FAMILY_DHURRI` — that half of decision 3 is untouched. |
| **`LINEAGE_ORDER_ON_CHARITABLE_WAQF`** | **Its jiha arm narrows; its `PUBLIC_CHARITABLE` arm stays ABSOLUTE.** Missing this would have silently killed R7 on the **primary** deed shape — a ذري deed under `LINEAGE_CONTINUATION`, the normal order, with an ultimate-taker jiha. The lineage order resolves entitlement **by descent**, and a recorded taker is not inside that descent (its entitlement comes from the reversion clause, evaluated after and outside the frontier test), so the record no longer contradicts itself. The payload this refusal closed stays closed by **two independent means**: the taker is default-EXCLUDED, and a jiha-alone cohort refuses `REVERSION_WITH_NO_RECORDED_BLOODLINE`. |

**Unchanged and load-bearing for R7:** `WAQF_TYPE_JOINT_NOT_POSSIBLE` (still the first check, so a reversion
on a `JOINT` waqf is unreachable) · `DESCENDANT_ON_CHARITABLE_WAQF` and `TABAQA_ON_CHARITABLE_WAQF` ·
`LINEAGE_LINK_MISSING` and `TABAQA_MISMATCHES_LINEAGE_DEPTH`, which are what make graph membership a
**certification** rather than a claim. ⚠ **`assertJihaNotTiered` / `JIHA_TIERED` is REACHABLE AGAIN** through
`runDistribution` — a tiered ultimate-taker jiha on a ذري waqf lands on it — after having been measured
unreachable across a 120-cell census days earlier. The census is now **240 cells**: 24 land on `JIHA_TIERED`,
8 resolve (ESC-2's second shape). A guard whose reachability flips twice in a week is the argument for pinning
reachability positively rather than deleting the guard.

#### R7-d — the extinction trigger: the STRICT reading is built, and the ambiguity is FLAGGED

> ⚠ **SUPERSEDED 2026-08-11 BY AMENDMENT F.** The owner answered R7-d — *"over"* means **no continuing
> line** — so the strict reading described in this subsection is **no longer what the engine does**. Kept
> because it records what was built, what was asked, and the fail-safe reasoning behind the retention
> behaviour that F preserves for the three non-triggering causes. **Read F for the rule.**

The trigger is **the bloodline being over**, which is **not** the same as *"nobody is entitled this period"*.
Under R-FRONTIER a cohort can hold living descendants **none of whom is entitled** — e.g. under `ZUHUR_ONLY`
every survivor sits on a broken daughter line (`BUTUN_LINE_NOT_CONTINUED`). The owner said *"once ALL
descendants are dead"*, so:

- **Built (strict):** the reversion fires only when **no living descendant is on record at all**, computed
  over the **certified lineage graph** — the members whose whole ancestor chain terminates at the waqif and
  whose declared ṭabaqa equals the derived depth — and never over a `kind` filter.
- **Living descendants but nobody entitled ⇒ does NOT fire.** The pool is retained exactly as before
  (`NO_ELIGIBLE_BENEFICIARIES`) and the run additionally says the reversion did not trigger and why
  (`REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`, plus a trace step naming the living descendants and carrying
  `openQuestion: 'R7-d — no living descendant vs no continuing line'`). **Money waits, recoverably, instead of
  going to a charity irreversibly.**
- **Zero descendants on record ⇒ REFUSED** (`REVERSION_WITH_NO_RECORDED_BLOODLINE`): ∅ is *"not yet
  enrolled"*, not *"extinct"* — the engine will not certify the extinction of a family it has never been
  shown. ⚠ The operational cost is real and is the owner's call: an old endowment taken on **after** its
  family died out must have its **deceased** descendants enrolled before it can compute at all. A live control
  proves this is a scoping rule and not a denial of service — enrol **one** deceased descendant and the
  identical deed pays 27,500,000.

⚠ **THE OPEN FIQH QUESTION (R7-d), NOT RESOLVED AND NOT RESOLVABLE IN CODE:** does *"the bloodline is over"*
mean **no living descendant** or **no continuing line**? Under `ZUHUR_ONLY` a waqif with only daughters can
have living blood descendants whose line the deed does not continue — **the ẓuhūr line is over while the
family is not.** The engine builds the first reading, retains the pool under the second, and makes the two
**visibly different on the run** (different flag, different `retainedMinor`, different reason code on the
taker's line, different trace code). The `TODO(surface)` in `resolver.ts` must not be removed.

#### The share, once it triggers — deed weights, not per capita

Per capita is the **bloodline's** rule; a charity is not a head of a bloodline. One taker takes the
distributable; several split it by their deed `stipulatedWeight` (weights are already meaningful for
charitable allocations). An **all-zero or absent** weight vector is **refused**
(`ULTIMATE_TAKER_WEIGHTS_UNUSABLE`) rather than turned into an invented equal split — and rather than being
allowed to fall through to `NO_ELIGIBLE_BENEFICIARIES`, which would hide an unusable deed record behind an
ordinary flag. Derived by hand in halalas from the same 40,000,000 → **27,500,000** chain R6-D1 and ESC-1 were
measured on, so the before/after is directly comparable *(⚠ the 10% ʿushr in that chain is unverified —
confirm against primary law)*:

| register | outcome |
|---|---|
| bloodline over, 1 taker | **27,500,000** to the jiha, residual 0, every descendant `EXCLUDED`, retained 0, flag `REVERSION_TO_ULTIMATE_TAKER_APPLIED` |
| bloodline over, takers at 70/30 | 27,500,000 × 70/100 = **19,250,000**; × 30/100 = **8,250,000**; Σ = 27,500,000 ✓ (spread 11,000,000 — so **I-L1 must not be asserted on this run**) |
| bloodline over, takers at 1/2 | exact 9,166,666.66… / 18,333,333.33…; floors sum to 27,499,999; residual **1** to the larger remainder ⇒ **9,166,667 / 18,333,333** |
| one living child, one living grandchild, 1 taker | the child takes **27,500,000**; the grandchild `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`; the jiha **0**, `REVERSION_PENDING_LIVING_BLOODLINE`. ⚠ **MEASURED before amendment D this exact input PAID the charity 13,750,000 of 27,500,000, halving the descendant. R7 prices that diversion at nothing** — it is not merely refused, it computes to zero |
| living descendants, none entitled (`ZUHUR_ONLY`, broken buṭūn line) | jiha **0**; **27,500,000 retained**; `NO_ELIGIBLE_BENEFICIARIES` + `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` — the R7-d ambiguity, on the run, in the fail-safe direction |

#### New vocabulary, and the one new invariant

`SHART_REFUSALS` **+8** (`REVERSION_KIND_UNRECOGNISED`, `REVERSION_WITH_NO_ULTIMATE_TAKER`,
`REVERSION_ULTIMATE_TAKER_UNKNOWN`, `REVERSION_ULTIMATE_TAKER_NOT_CHARITABLE`,
`REVERSION_ULTIMATE_TAKER_DUPLICATED` — refused, **never deduplicated**, because a repeated id double-counts
in the weight vector and therefore moves money — `REVERSION_ON_CHARITABLE_WAQF`,
`REVERSION_WITH_NO_RECORDED_BLOODLINE`, `ULTIMATE_TAKER_WEIGHTS_UNUSABLE`) ⇒ **26 in total** ·
`EXCLUSION_REASON_CODES` += `REVERSION_PENDING_LIVING_BLOODLINE` · `ENTITLEMENT_RULES` +=
`ULTIMATE_TAKER_MAAL_AL_WAQF`, carried on the **taker's line only** and only on a triggered run, so
`basis.rule` **varies within one run for the first time** (a charity paid a family endowment's whole ghallah
on a line stamped `LINEAGE_PER_CAPITA_ZUHUR_ONLY` is the exact BR-505 mis-statement this record already calls
a defect) · `RUN_FLAGS` += `REVERSION_TO_ULTIMATE_TAKER_APPLIED`,
`REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` · `REVERSION_KINDS` becomes a **fifth engine-only vocabulary**
pinned **absent** from `schema.prisma` · `ENGINE_VERSION` → **`e6-distribution/3.0.0`**.

**I-R1 · reversion integrity**, recomputed independently from the input rather than read off the resolution:
on a triggered run every entitled line is a **named** taker stamped `ULTIMATE_TAKER_MAAL_AL_WAQF` and every
bloodline line is `EXCLUDED` holding `0n`; **on EVERY run — the universal mirror — no named taker holds a
non-zero amount unless the trigger fired, i.e. a charity is never paid a halala in the same run as any
descendant.** That mirror is **R5 turned into a runtime assertion**, and it is the strongest guarantee this
design offers because it holds whatever a future refusal is relaxed to. I-R1 also **cross-checks the flag**
(flag set but the independent recomputation says the bloodline lives, or vice versa, ⇒
`DISTRIBUTION_INVARIANT_BREACH`), and **I-L1 is gated off on a triggered run** and I-R1 asserted in its place
— reporting a per-capita invariant about a run whose money went to a charity is the R6-I5 honesty gap again.

#### What R7 leaves open — surfaced, not resolved (binding rule 4)

| # | Finding | Sev | Status |
|---|---|---|---|
| **R7-D1** | **The extinction trigger reads an UNENUMERATED `CATEGORY_ONLY` placeholder's `active: false` as a family's death.** MEASURED: a ذري register whose only recorded descendants are placeholders (*"descendants of Branch A not yet enrolled"*, real edges, derived ṭabaqāt 1→2, `active: false`) plus one named taker pays that charity **27,500,000 of 27,500,000 halalas**, flagged only as an ordinary applied reversion, with **I-R1 reported as checked**. **Nobody's death is on that register.** It is R6-D1's payload to the halala — the same cohort `r6-adversarial.test.ts` §2 refuses — **one `reversion` field later**. | **HIGH** | ✅ **CLOSED 2026-08-11 — amendment F.** The owner confirmed the placeholder hold: an unenumerated placeholder's `active: false` **cannot certify a death**, and a non-empty placeholder set **holds** the reversion. The measured payment no longer happens, and `invariants.ts`'s fourth conjunct enforces it from the raw input. *(The reasoning below is kept — the "require ≥1 enumerated member" option is in substance what shipped, and the load-bearing other direction is why the hold, not a refusal, was the right shape.)* |
| **R7-d** | *"The bloodline is over"* — **no living descendant** (built) or **no continuing line**? | — | ✅ **ANSWERED 2026-08-11 — amendment F: NO CONTINUING LINE.** Implemented; 3,584 enumerated runs, trigger fired in 288, I-R1 held on all. ⚠ Replaced by a narrower **unasked** item: the widening is scoped to `LINEAGE_CONTINUATION`, so `ORDERED`/`SHARED` still use the strict reading. |
| **Is the reversion ONE-SHOT or RECOMPUTED?** | This design **recomputes it from the register every period**, so a later-recorded birth or a discovered heir **reverses** it and the charity stops being paid — while halalas already paid out cannot be recovered. Classical مآل clauses may be final once the family leg is extinguished. | MEDIUM | **OPEN, never asked.** Engineering's per-period recomputation is a **choice, not a finding**, and it is the one whose money is irreversible in one direction and recoverable in the other. |
| **R7-A2** | `REVERSION_TO_ULTIMATE_TAKER_APPLIED` is documented as *"the distributable went to the مآل"* but is also raised on a triggered run whose taker is gate-blocked, where the pool was **retained**. | MEDIUM | **NOT FIXED.** No money moves wrongly; the **flag misstates what happened**, which is the false-claim class. |
| **R7-A3** | On a **pending** run the taker's published `basis.rule` is a lineage/generational rule — a charity's BR-505 line stamped with a statement about descent. | MEDIUM | **NOT FIXED — touches statement copy (E10/E12), so not settled in a code change.** |
| **R7-A4** | `ULTIMATE_TAKER_WEIGHTS_UNUSABLE` surfaces only in the period the family ends, and is **evaded** by an inactive taker carrying a weight — so the same substantive deed defect is refused in one arrangement and quietly retained in another. | low | **NOT FIXED.** |
| **R7-A1 / R7-A5** | Two mutations **survived**, and both are recorded rather than papered over: deleting `LINEAGE_ORDER_ON_CHARITABLE_WAQF`'s jiha arm leaves all 1642 tests green (an unnamed jiha on a ذري waqf is already refused two checks earlier), and replacing the bloodline set with a `kind !== 'CHARITABLE_JIHA'` filter leaves all 36 reversion tests green (the two sets are extensionally equal on every legal input). | low | **NOT FIXED, and deliberately not "fixed" by deleting either.** *"Never key an eligibility fact on `kind`"* is currently defence-in-depth with **no observable behaviour** — worth keeping, and it **must not be described as behaviourally load-bearing** (lesson 2). |
| **ESC-2** | Unchanged, now with a second reachable shape (a ذري direct-use waqf with a tiered taker). | low | **OPEN, owner's precedence question.** |
| **R6-I5** | Unchanged; **its `FAMILY_DHURRI` exemption has a reachable subject again** — the untiered ultimate taker. | MEDIUM | **OPEN.** Now driven by AT-15 and by the G-9 suite. |
| **G-9 clause 3** | **STILL QUALIFIED.** R7 restores a reachable untiered line to a tiered family cohort — the exact configuration the qualification names — and replaces *"no jiha can be here"* with *"the taker is default-excluded and I-R1 says a charity is never paid beside a descendant"*. | — | **Do not un-qualify it, and do not quote R7 as closing it.** A stronger guarantee that is one day old is not the fifth premature closure. |

#### What amendment E adds to the owed-list

- ⚠ **Arabic and English statement copy (E10/E12), and it is harder here than anywhere else.**
  `REVERSION_PENDING_LIVING_BLOODLINE` must tell a charity it receives nothing **without** implying either a
  permanent exclusion or an expectation of the family's extinction; `ULTIMATE_TAKER_MAAL_AL_WAQF` appears on a
  statement issued in the period a family endowment **ends**, which the deceased descendants' heirs may read
  and dispute. **Product-approved legal text — it must NOT be invented in a code change.**
- ⚠ **E3/E4 owes the reversion clause in the data model**, on top of the lineage debt: `Waqf` has nowhere to
  record مآل الوقف (kind + a link to the ultimate-taker beneficiaries), and `sample-waqf.json`'s ذري
  endowments need it stated as **absent**. `schema.prisma`, the seed and the shared fixture were **not**
  touched; the delta is appended to
  `packages/domain/src/distribution/__tests__/fixtures/README.md`. **Open with it:** *is the reversion a fact
  about the waqf or about the waqif?* — one waqif may found several endowments, and a per-waqf clause can
  disagree across them with nothing keeping it consistent (the same shape as open question 9 for the lineage
  edge). The answer decides whether `REVERSION_ULTIMATE_TAKER_UNKNOWN` is an integrity failure or a scoping
  question.
- ⚠ **How does a real مآل clause allocate among several takers?** R7 reuses `stipulatedWeight` (the خيري
  rule). Nobody has been asked whether a real clause allocates proportionally at all, or by named purpose —
  and a taker whose recorded weight is `'0'` is **excluded** here (`ZERO_STIPULATED_WEIGHT`, which makes that
  code reachable on the **lineage** path for the first time) while an **all**-zero vector refuses.
- ⚠ **May a خيري waqf record a reversion at all?** Refused here (`REVERSION_ON_CHARITABLE_WAQF`) — partly on
  principle, partly to close the vacuous-trigger route structurally. **Claude's reading, not the owner's
  ruling**, with the same status amendment D's refusal had before R7.

### F · R7-d ANSWERED — *"the bloodline is over"* means **NO CONTINUING LINE**; R7-D1 CLOSED

**Product-owner ruling, 2026-08-11.** This amendment answers **two** of amendment E's own residuals — the
open fiqh question R7-d and the HIGH defect R7-D1 — and it **supersedes E's R7-d subsection**, which built the
opposite reading. E's text is kept because it records what was built and what was asked.

Asked directly whether *"the bloodline is over"* meant **no living descendant** or **no continuing line**, the
owner answered **no continuing line**.

> **The rule as implemented.** A living descendant keeps the endowment for the family only if their line is one
> **the deed continues**: under `ZUHUR_AND_BUTUN` always; under `ZUHUR_ONLY` only when **every ancestor strictly
> between them and the waqif is a `SON`**. So **a grandchild through a deceased daughter no longer holds a
> `ZUHUR_ONLY` endowment** — the ẓuhūr line is over though the family is not, and the deed's مآل takes.

**What the predicate reads, and what it deliberately does not.** `resolver.continuesTheLine` reads **descent +
liveness + the deed's continuation term, and nothing else** — **not** an exclusion code, **not**
`entitledBloodlineCount`, **not** a line status. That distinction is the whole difficulty of this change: an
empty *entitled* cohort has causes that are **not** the line ending, and all three are pinned as
**NON-triggering**:

1. a **zero-weight** living descendant (`ZERO_STIPULATED_WEIGHT`),
2. one **held behind a living ancestor** (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` — R-FRONTIER's temporary hold),
3. one **withheld by a gate** — entitlement is untouched by gates (I6), so a gate must never be able to end a
   bloodline.

Reading "nobody entitled" as "the line is over" would have paid a charity in all three cases. **The
strict-reading behaviour E documented for case 2 — retain and flag — is preserved** for exactly these
non-triggering causes: `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`, pool retained, money waiting recoverably.

**R7-D1 · CLOSED — the owner confirmed the placeholder hold.** An unenumerated `CATEGORY_ONLY` placeholder's
`active: false` **cannot certify a death**, and a non-empty placeholder set **holds** the reversion even when
no *continuing* descendant is on record. The 27,500,000-of-27,500,000 payment amendment E measured **no longer
happens**; `invariants.ts`'s fourth conjunct enforces the same thing from the **raw** input, independently.

**Both sides moved and stayed independent.** `invariants.independentReversionState` re-narrows the order **and**
the stipulation from the **RAW** input and walks its own ancestor rebuild, so it remains a *check* on the
resolver rather than a restatement of it — losing that independence is what caused **R7-D2**. Proven
**behaviourally**, not by reading source: fed a context of all-zero `EXCLUDED` lines, its verdict still flips on
`continuationStipulation` alone, and again on `entitlementOrder` alone.

**Evidence — enumeration, not sampling.** **3,584 real `runDistribution` calls**: two trees × every link
assignment × every liveness pattern × both stipulations × three orders, with the taker's deed weight set
**equal to every descendant's** so an escape surfaces as **13,750,000 halalas** rather than only as a reason
code. **No cell refused.** The trigger fired in **288**, and in each an independent ancestor walk confirmed no
living descendant sat on a continuing line. **I-R1 held on all 3,584** and was reported checked on each.
`pnpm --filter @qmulate/domain exec vitest run` → **29 files / 1696 tests, all pass** (re-measured 2026-08-12);
CI run **`31492769809`** green on `38be99e`.

⚠ **NEW AND UNASKED — the widening is scoped to `LINEAGE_CONTINUATION`.** `continuation` is non-null only on
that order, so on **`ORDERED` / `SHARED`** deeds the extinction trigger still falls back to the **strict**
*no-living-descendant* reading; the continuation stipulation is *carried* but not *consumed* there. The scoping
is deliberate — the widening reaches exactly the deeds whose entitlement path already applies ẓuhūr/buṭūn — but
**one deed shape now answers *"is the bloodline over?"* differently from another, and the owner has not been
asked whether that is right.** `TODO(surface)` markers stay.

⚠ **G-9 clause 3 stays QUALIFIED, and R7-d must not be quoted as closing it** either. Amendment E's verdict
stands unchanged: the protection is the taker's default exclusion plus I-R1, both still young, on a record
carrying four premature closures. **Also still open after F:** one-shot vs recomputed reversion · ESC-2 ·
R6-I5 · R7-A1…A5 · per capita vs deed weights among takers · ESC-1's and R6-F1's underlying fiqh questions ·
the whole `ar`/`en` statement copy · and E3/E4's migration, which **S4 now lands in full** (owner decision,
2026-08-12).

---

## Decision (in three lines)

1. **Entitlement is lineage-based.** A beneficiary is entitled because they descend from the waqif on a line the deed continues — **not** because their ṭabaqa happens to be the lowest living one. A generation's death does not block the next generation; **it is what releases it** (amendment A). ṭabaqa stops being an exclusion key and becomes a **derived, cross-checked** depth.
2. **The arithmetic is per capita.** The entitled cohort splits the distributable **equally per head**, recomputed each period. A deceased member's share does **not** pass down their branch as a block. ⚠ **The cohort is the LIVING FRONTIER of each line, not every living descendant** — see amendment A; this line originally read "all living eligible descendants" and that wording was corrected by the owner on 2026-08-03.
3. **A joint waqf is not possible, so the engine refuses one.** `waqfType: 'JOINT'`, and any cohort mixing a `CHARITABLE_JIHA` with a `FAMILY` beneficiary, halt with `SHART_INCOMPLETE`. **The `JOINT` enum member stays in `schema.prisma`** — a vocabulary the engine refuses, with the migration owed to E3/E4. ⚠ **The "contradiction" this line recorded is RESOLVED (amendment B): مشترك is the Authority's oversight category spanning both kinds, not a hybrid endowment.** ⚠ **NARROWED by amendment E (R7):** the mixed-cohort half now carries **one** exemption — a ذري deed whose reversion clause names **every** jiha in the cohort as its **ultimate taker** (مآل الوقف), which is paid only once the bloodline is over and therefore never shares a period with the family. `waqfType: 'JOINT'` is **not** exempted and never will be.

Where these rules are silent, the engine **refuses** (`SHART_INCOMPLETE`). It does not default and does not infer (binding rule 1).

---

## Decision 1 — lineage, in the owner's terms first

The owner's account of *ẓuhūr wa buṭūn* (ظهور وبطون), in substance: beneficiaries are the waqif's
descendants; when a generation dies, the descendants in later generations **continue** as beneficiaries by
blood connection. Under the **ẓuhūr** rule — the son-descendants, those carrying the family name — if a male
descendant carrying the name dies, **their own descendants who still carry the name continue to be
beneficiaries**. And, verbatim: *"The generational level of the beneficiary is only tied to the family name
as an eligibility to be beneficiary."*

That last sentence is the whole change. **ṭabaqa is not an exclusion key.** The shipped resolver keys every
verdict on it: `lowestLivingTabaqa()` finds the lowest-numbered tier holding one living member and excludes
every tier above it as `UPPER_TABAQA_EXTANT`. Under the owner's model that exclusion is simply not what the
deed says — the tier number tells you *where in the tree* someone stands, and the deed's continuation term
tells you *whether their line still runs*.

### The continuation stipulation is a closed TWO-value deed term

Every deed follows exactly one of two lines. There is no third value and **no default**:

| Value | Rule |
|---|---|
| `ZUHUR_ONLY` | Sons' lines continue. A **daughter is a beneficiary in her own right**, but **her children are not**. |
| `ZUHUR_AND_BUTUN` | **Both** sons' and daughters' lines continue indefinitely. |

Reduced to a test the engine can run — **as corrected by amendment A; the continuation stipulation is an
ADDITIONAL filter on top of the frontier test, never a replacement for it**:

- **The frontier test, under both values** — a person is eligible only if **every ancestor strictly between
  the waqif and them is DECEASED**. A living ancestor holds the entitlement and their descendants wait.
- **`ZUHUR_AND_BUTUN`** — no line filter at all; the frontier test alone decides, whatever the sexes on the
  path. ⚠ This bullet originally read *"every living descendant of the waqif is eligible"* and that wording
  was corrected by the owner on 2026-08-03.
- **`ZUHUR_ONLY`** — **additionally** requires that every ancestor STRICTLY BETWEEN the waqif and them is a
  son. The person themself may be a son or a daughter. So: a daughter of the waqif is eligible (there are
  no intermediate ancestors); her son is not (the intermediate ancestor is a daughter); a son's daughter is
  eligible **once her father has died**; a son's son's daughter likewise.
- **Absent, unrecognised or ambiguous ⇒ `SHART_INCOMPLETE`.** Not a default.

### Decision 2 — per capita, and the correction it makes to the build plan

The BUILD-PLAN's Sprint-3 note characterised the owner's account as *"per-stirpes representation"*. **That
characterisation is now wrong and this ADR corrects it.** Shown the exact consequence — that a branch with
six eligible children collectively receives six times what a branch with one eligible child receives — the
owner chose **per capita** explicitly. The entitled cohort shares equally per head, recomputed each period;
a deceased member's share does not descend as a block. ⚠ This sentence originally read *"all living eligible
descendants"*; per amendment A the cohort is the **living frontier of each line**, and the arithmetic over
it is unchanged.

### The consequence we are NOT allowed to hide: `stipulatedWeight` stops being used

Per capita means a family beneficiary's deed-stipulated `stipulatedWeight` is **not applied** in a lineage
cohort. A Shart figure that vanishes without trace is precisely the class of defect this project keeps
paying for, so the engine must say so out loud rather than quietly ignoring it:

- The resolver publishes an **effective weight of `'1'`** for every eligible member — the existing bigint
  Hamilton allocator then divides equally with no change to `allocate.ts` at all.
- Whenever a lineage cohort contains a member carrying a non-equal explicit weight, the run raises
  **`STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA`**, and the `computationTrace` names **every** such member
  and the deed figure that was not applied. The figure survives on `source.stipulatedWeight` and on the
  trace; it is never silently dropped.
- **`TODO(surface)` — not put to the owner as its own question:** *"per capita always"* versus *"deed
  weights govern where the deed explicitly allocates them"*. The owner chose per capita over per stirpes;
  nobody asked whether a deed that names explicit unequal shares among descendants should override per
  capita. Until that is answered the flag is the honest position.
- **The sharpest edge of this, stated because it moves money:** a member whose recorded
  `stipulatedWeight` is `'0'` is now **eligible and paid an equal share**, because weights are not applied.
  Under `ORDERED`/`SHARED` that member is excluded (`ZERO_STIPULATED_WEIGHT`). This is a direct consequence
  of the rule as given, not a reading engineering chose, and it is listed as an open question below.
- `stipulatedWeight` remains fully meaningful for a **charitable** waqf's allocations, which is why the
  field stays.

---

## Decision 3 — a joint waqf is not possible, and the repo says otherwise

The owner: a waqf is **either** charitable (وقف خيري) for a segment the waqif chooses, **or**
ancestral/generational (وقف ذري) — **not both**. Shares pool toward the surviving descendants of the family
tree.

### ✓ RESOLVED 2026-08-03 — what follows is the conflict AS IT STOOD, kept for the record

> **The owner answered the question this section refers to counsel:** *"it just means that there are 2
> types of endowments/waqf, but a waqf cannot be both."* Art. 4's "joint" is the **Authority's oversight
> category spanning both kinds**, not a hybrid endowment — reading (a) below, and **there was never a
> contradiction**. The refusal is correct and stays; `glossary.md` was the drifted side and is reworded;
> `awqaf-law.md`'s Art. 4 annotation is now marked resolved; CLAUDE.md register item #11 is closed. The
> only surviving caveat is that the owner is a practising Nazir rather than Saudi counsel, so a legal
> filing turning on المشترك should still go to counsel — **that does not reopen the item**. See
> amendment B at the head of this record.

The rest of this section is the conflict as it stood before that answer, retained because the reasoning
about *why* the engine refused while the enum stayed is still the reasoning in force.

This contradicted **this repo's own summary of primary law**, in two places:

- **`docs/domain/regulations/awqaf-law.md`, Art. 4 — Oversight scope:** the Authority oversees *"all
  public, private (family), and **joint**"* endowments. A category the law names as overseen is hard to call
  impossible.
- **`docs/domain/glossary.md:40`** defines **الوقف المشترك / joint waqf** as combining public and private
  terms — part of the yield to descendants, part to charity.

CLAUDE.md is explicit that a docs-versus-practice contradiction is **surfaced, never silently resolved in
favour of one side**. So both sides stand, and each is given the weight it actually has:

| Side | What it is | What it governs |
|---|---|---|
| The owner's rule | A practising Nazir's account of what a waqf *is*, and of what QMULATE administers | **The engine refuses.** No mixed cohort computes. |
| Art. 4 + الوقف المشترك | This repo's summary of the Awqaf Law and of the Authority's own vocabulary | **The database enum, §07, the glossary and the fixture keep `JOINT` / المشترك.** No migration. |

**Why the engine refusing and the schema keeping the value is coherent rather than a fudge.** Two readings
reconcile the conflict and they differ enormously in blast radius: (a) the law recognises مشترك but
**QMULATE does not administer one**, so `JOINT` remains a legal category the platform can *record* while the
engine declines to *compute* it; or (b) the type is wrong in the model and comes out — a migration, a
fixture change, and a rewrite of two source-law summaries. **This ADR implements (a) and does not decide
between them.** Refusing is the safe direction: a refused legitimate waqf is a conversation with counsel; a
computed illegitimate one distributes a founder's ghallah on a structure the Nazir says cannot exist. And
**ADR-0004 established this repo's discipline for enum narrowing — refuse rather than remap**, with no
successor value invented.

**What would have to change to reconcile it, named so nobody has to re-derive the list. ⚠ The owner
answered on 2026-08-03 and the answer is reading (1)-the-latter, so item 1 is done, item 2 does not
arise, and item 3's migration is the only live remainder (owed to E3/E4):**

1. Saudi **counsel on Art. 4**: does الوقف المشترك mean one endowment with both charitable and family
   beneficiaries, or a *portfolio* term (an Authority oversight category spanning both kinds)? If the
   latter, there is no contradiction at all and only the glossary line needs rewording.
2. If counsel confirms a single endowment may carry both legs: **this decision is wrong**, the refusal comes
   out, and the S3-D2 two-level normalisation defect (a lapsed family share inflating the jiha's fixed share
   from 40.000000% to 57.142857%) becomes a live defect that must be fixed rather than dissolved.
3. If counsel confirms the owner: `WaqfType.JOINT` becomes a **migration** (refusing, per ADR-0004, rather
   than remapping), `docs/domain/glossary.md:40` and `awqaf-law.md` Art. 4 need a recorded correction with
   the source cited, and §08's Example D comes out of the spec.

Until then: **`JOINT` is live in `schema.prisma` and refused by the engine.** That gap is a *recorded fact*,
carried by a test, not an oversight.

### What the refusal is, exactly

- `waqfType === 'JOINT'` ⇒ `SHART_INCOMPLETE`, **unconditionally** — including on a direct-use waqf (see
  the I7 precedence note below).
- Any cohort holding **both** a `CHARITABLE_JIHA` and a `FAMILY` beneficiary ⇒ `SHART_INCOMPLETE`, whatever
  the declared `waqfType`. This is the substantive half: the refusal has to key on the *cohort*, or a mixed
  cohort simply re-enters under `waqfType: 'FAMILY_DHURRI'`. ⚠ **ONE exemption since amendment E**, and the
  keying is unchanged: a `FAMILY_DHURRI` waqf with a legible `reversion` clause naming **every** jiha in the
  cohort as ultimate taker. Co-presence in the register no longer implies concurrency of payment, which is
  what this refusal was really about.
- A `CATEGORY_ONLY` placeholder is **not** a leg for this purpose: `CHARITABLE_JIHA` + `CATEGORY_ONLY` is a
  legitimate charitable waqf whose beneficiary segment is not yet individually identified, and
  `FAMILY` + `CATEGORY_ONLY` is a legitimate family waqf with an unnamed descendant.
- Both refusals run at **Stage 0 (pre-flight)**, beside `parseEntitlementOrder` — before any money is
  computed. Rationale: Stage 0 refuses facts about **the waqf itself** (its type, the legibility of its
  order); a run on a waqf that cannot exist is void whatever its figures say. Stage 2 refuses facts about
  **the cohort's shape**. This ordering **inverts an existing pinned asymmetry** (see *Tests to invert*).

### The S3 work built on JOINT is re-pointed, not deleted

`assertJointLegsPresent`, `JOINT_FIXED_DEED_SHARES`, §08's worked Example D, the `JOINT_LEGS_PRESENT` trace
step and the property generator's deliberate `JOINT` draws all now describe a **refused input**. Every test
that exercised them is **inverted to assert the refusal** rather than removed — the same discipline used
when the tiered-jiha defect (S3-D3) was closed, and for the same reason: the inputs that used to compute
must be pinned as inputs that can never compute again.

`JOINT_FIXED_DEED_SHARES` **stays in `ENTITLEMENT_RULES` as an unreachable value**, with a test asserting no
run can produce it. Deleting it would erase the record that the repo once modelled joint deeds; leaving it
with only a comment claiming unreachability would be exactly the defect class this project has shipped three
times. The claim is carried by a test.

---

## What this supersedes in §08 — clause by clause

§08's **Stage 2** is substantially rewritten. Precisely:

| §08 clause | Status |
|---|---|
| §08 line 29 — `resolver.ts // Stage 2: eligibility (ṭabaqa / line / ORDERED\|SHARED\|NA_DIRECT_USE)` | **Superseded.** Four orders, and the primary one is lineage. |
| §08 line 100 — *"The resolver walks the beneficiary tree using tier (ṭabaqa), line (ẓuhūr / buṭūn), and the deed's entitlement-order rule"* | **Superseded in emphasis.** The resolver walks a real **parent graph**; ṭabaqa is derived from it, and `line` alone never decided anything (grep confirmed both S3 reads of `line` were assignments). |
| §08 line 104 — the **ORDERED** row, and its framing as the primary mode | **Demoted, not deleted.** ORDERED is preserved verbatim in behaviour but becomes the **explicitly-stipulated exception**. §08's presentation of it as the leading mode is superseded. |
| §08 line 105 — the **SHARED / tashrik** row | **Retained unchanged.** It is a real deed term in the source docs and it differs from lineage in two ways: no ẓuhūr eligibility filter, and deed weights *are* applied. |
| §08 line 106 — **DIRECT-USE** | **Retained unchanged** (I7 still holds), with one precedence amendment: it no longer outranks a `JOINT` refusal — **nor, as of amendment D, a `CHARITABLE_JIHA_ON_FAMILY_WAQF` refusal**. ⚠ It *does* still outrank `JIHA_TIERED` (ESC-2, open). |
| §08 line 107 — **FIXED-SHARE JOINT** (`type: "joint"`, two-level normalisation inside the family leg) | **Superseded — the input is refused.** The whole row now describes an input that halts. |
| §08 line 111 — *"Stipulated weights … normalises the entitled cohort's weights"* | **Superseded for a lineage cohort only.** Per capita: effective weight `'1'` per head, with the deed figure recorded and flagged, never applied. Unchanged for ORDERED, SHARED and charitable allocations. |
| §08 line 114 — the **Excluded ≠ withheld** warning | **Retained, and it matters more.** Under lineage the commonest exclusion is *"this line does not continue"*, which a beneficiary is far more likely to dispute than a tier wait. |
| §08 line 209 — `tabaqa: z.number().int().positive().nullable()` as an **input** | **Superseded.** ṭabaqa is derived from lineage depth; a supplied value that disagrees with the derived one is a **refusal**. |
| §08 line 212 — `stipulatedWeight: z.number().nonnegative()` described as *"deed share (relative)"* | **Superseded for lineage cohorts** (see line 111) — and already corrected in S3 from `number` to a decimal string. |
| §08 line 226 — `waqfType: z.enum(["family_dhurri", "public_charitable", "joint"])` | **The `joint` member is now a refused input.** The enum member itself stays, in the engine and in `schema.prisma`. |
| §08 line 287 — **I5 · Ordered exclusion** | **Narrowed and extended.** I5's ORDERED claim is unchanged, but it must now also assert the **lineage contrast** (no tier-based exclusion code may appear on a lineage run) and the positive ẓuhūr claim. A new **I-L1** carries per-capita equality. |
| §08 lines 299–348 — Examples **A** (ORDERED) and **B** (SHARED) | **Retained.** Both remain valid deeds under R4 and are the contrast that proves the order is read. |
| §08 line 353 — worked **Example D** (JOINT, 40/30/30 fixed deed shares) | **Superseded.** It is now a refused input. Its unique coverage — `ENTITY_UNLICENSED`, `CROSS_BORDER_PENDING` + Authority notice, and the CAPITAL-receipt corpus prover — must be **re-homed onto two legal fixtures**, not lost (see *Fixture delta*). |
| §08 line 403 — *"every beneficiary excluded or `stipulatedWeight = 0` ⇒ `NO_ELIGIBLE_BENEFICIARIES`"* | **Superseded for lineage cohorts:** a zero weight no longer excludes there, because weights are not applied. Open question below. |
| §08 line 407 — *"Malformed shart … an unrecognised `entitlementOrder` **or a joint waqf with no charitable/family split**"* | **The second half is superseded.** It is no longer "a joint waqf missing a leg" that halts — it is **every** joint waqf. |
| **Glossary §B**, lines 75–76 (ordered vs shared as the two entitlement-order readings) and lines 82–83 (*"whether the Shart is ordered or shared"*) | **Incomplete rather than wrong.** They present a binary where there are now four values, and they do not carry the continuation stipulation at all. Reconcile in the same pass as the vault notes. |
| **Glossary §B**, `ظهور` / `بطون` — recorded as *classificatory* labels for male-line / female-line descent | **Promoted to substantive.** They are now the eligibility fact, not a label. |
| **§08 as a whole — the REVERSION path (مآل الوقف)** | **MISSING, not superseded** (amendment E). §08 describes no path by which a family endowment's income goes anywhere once the bloodline ends: no `reversion` input, no `REVERSION_*` refusals, no `ULTIMATE_TAKER_MAAL_AL_WAQF` rule label, no I-R1. It is the one path that matters at exactly the moment a family endowment ends. §08's banner now names it; the body is still deliberately not rewritten. |
| **§08 line 287 — I5, and the invariant list generally** | **Extended again.** `I-L1` is **gated off** on a reverted run and **`I-R1`** is asserted in its place; I-R1's universal mirror runs on **every** run. |

---

## Consequences

### For the verification scenarios

- **V-1 (ordered distribution, al-aʿlā fa-l-aʿlā — G-9).** **Survives, with its status changed.** `waqf-001`
  is an `ordered` deed and ORDERED is preserved, so V-1 still describes a real path — but it now verifies
  the **opt-in exception**, not the product's normal behaviour. **V-1 must gain a sibling** covering the
  default lineage path, or the milestone-1 proof will demonstrate the one mode most deeds do not use. This
  is a build-plan change, not a spec contradiction.
- **V-2 (shared distribution, tashrik — G-9).** **Unaffected.** `waqf-002` is a `shared` deed and SHARED is
  retained unchanged.
- **V-3 (direct-utilization — G-9).** **Unaffected in substance.** I7 still holds unconditionally for runs
  that happen; the only change is that a direct-use waqf typed `JOINT` no longer computes.
- **G-9 clause 3** (*"ordered mode excludes lower tiers while upper live"*) stays qualified as a statement
  about ORDERED, and ~~**S3-D1 is closed on the LINEAGE path ONLY — it remains OPEN on `ORDERED`.**~~

  ⚠ **SECOND CORRECTION, 2026-08-03 (R6 — amendment C at the head of this record).** The struck sentence
  above was true when written and is now **superseded in part**. Open question 10 was answered — *require
  the parent on every deed* — so `LINEAGE_LINK_MISSING` is **no longer gated on the order**, and the
  `FAMILY` / `CATEGORY_ONLY` route measured in the paragraph below is **closed on `ORDERED` and `SHARED`
  too**, from both sides (no link ⇒ `LINEAGE_LINK_MISSING`; with a link ⇒ a null ṭabaqa disagrees with the
  derived depth ⇒ `TABAQA_MISMATCHES_LINEAGE_DEPTH`). **G-9 clause 3 nevertheless stays QUALIFIED**, for a
  strictly narrower reason: the same escape survives with a `CHARITABLE_JIHA` in place of the `FAMILY`
  member (**R6-D1**, MEASURED at 27,500,000 of 27,500,000 and at a 13,750,000-halala diversion from a
  living descendant, unflagged, I5 still reported). **Do not read "S3-D1 closed" as "clause 3
  unqualified"** — the measured paragraph below is retained precisely so the two claims stay distinguishable.

  ⚠ **CORRECTION, 2026-08-03 (adversarial review), replacing this ADR's own first draft of this
  paragraph.** The draft claimed S3-D1 was "closed as a side effect … a refused input on both paths",
  on the reasoning that building the lineage graph for every order makes the missing edge a refusal
  everywhere. **That was measured false.** `LINEAGE_LINK_MISSING` is raised *only* under
  `LINEAGE_CONTINUATION` (this ADR's own open question 10 asks whether `ORDERED` should require the
  edge, and answers "confirm rather than assume"), so under `ORDERED` a `FAMILY` member with
  `tabaqa: null, lineageLink: null` is still untiered and still escapes the tier test. Measured on the
  shipped engine: an `ORDERED` / `FAMILY_DHURRI` waqf with one tier-1 member `active: false` and one
  such untiered member computes, excludes the tiered member `TABAQA_EXTINCT`, and **pays the untiered
  member the entire distributable (31,500,000 halalas of 31,500,000)** — the S3-D1 loss, unchanged.
  `resolver.buildLineage`'s header carries the same correction.

  On the lineage path the hole is closed **structurally**, not by refusal alone: the edge is mandatory
  there and eligibility is not keyed on `tabaqa` at all, so there is no "untiered escape" to have.
  ~~Closing it on `ORDERED` needs the product owner's answer to open question 10 — a unilateral extra
  refusal would make the engine stricter about an input the owner never discussed.~~ ⚠ **The owner
  answered open question 10 on 2026-08-03 (R6, amendment C): YES, require the parent on every deed.** The
  extra refusal is therefore the owner's rule and not a unilateral tightening, and it shipped.
- **S3-D2 dissolves** rather than being fixed: the two-level normalisation defect only arises in a mixed
  cohort, and a mixed cohort no longer computes. ⚠ **This bullet originally continued *"If counsel
  reverses decision 3, S3-D2 comes back live"* — that contingency is CLOSED by amendment B.** The owner
  answered the question that had been drafted for counsel, مشترك is an oversight category rather than a
  hybrid endowment, and the refusal is correct — so **S3-D2 stays dissolved** rather than sitting one
  legal opinion away from returning.

### For E3/E4's data model — the lineage edge has to reach the database

The engine can be changed this sprint; **the model cannot express any of this yet**:

- **`schema.prisma`'s `Beneficiary` has no parent edge.** It carries `branch String` (free text) and
  `relationshipAr` (free text) and `tabaqa Int?`. Per-stirpes *or* per-capita lineage eligibility is
  **structurally inexpressible**. E3/E4 must add a self-relation (`parentId String?` +
  `parent`/`children`), the lineage-link fact, and the waqf-level continuation stipulation — and must decide
  whether `tabaqa Int?` becomes generated/derived or stays a stored, trigger-checked mirror. **No migration
  is written in S4**, and `schema.prisma` is not touched.
- **`@@index([waqfId, tabaqa])`** exists on the assumption that ṭabaqa is a query key for entitlement. Under
  lineage the hot query is an ancestor walk. Revisit in E3/E4, not now.
- **`data/fixtures/sample-waqf.json`** is untouched (S3 decision D3 stands). The additions it needs are
  appended to `packages/domain/src/distribution/__tests__/fixtures/README.md`'s delta list, which is where
  S5/S7 will look.

### For the beneficiary's official Arabic statement (BR-505 / NFR-01)

`basis.rule` is **printed on a legally consequential Arabic document a beneficiary may dispute**, so it must
name *which path decided their entitlement*. The lineage path therefore gets **two** rule labels rather than
one — `LINEAGE_PER_CAPITA_ZUHUR_ONLY` and `LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN` — because "your line does not
continue under this deed" and "your line continues" are different statements to make to a family member, and
the reason must be legible from the statement without re-reading the deed.

⚠ **Amendment E adds a rule label that is MANDATORY rather than decorative, and a `basis.rule` that varies
within one run.** `ULTIMATE_TAKER_MAAL_AL_WAQF` is printed on an ultimate taker's basis on a run where the
reversion triggered, while the run-level `result.entitlementRule` keeps the deed's standing order (the
endowment's entitlement order did not change; its **reversion clause took effect**). Without that label a
charity paid a family endowment's entire ghallah would carry a line stamped
`LINEAGE_PER_CAPITA_ZUHUR_ONLY` — a statement about descent, printed on a body that has none, in the period
the family ended. ⚠ **And on a PENDING run the taker's line still carries the order's lineage rule (R7-A3,
open)**, which is the same mis-statement in a smaller form.

⚠ **Amendment A adds a sixth code with a twist E10/E12 must not miss.**
`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` is the one exclusion in the list that **reverses on an event nobody
controls** — the ancestor's death makes the identical person entitled next period. Its Arabic must **not**
read as permanent, i.e. must not be phrased like `BUTUN_LINE_NOT_CONTINUED` ("your line does not continue"),
or the statement misstates the deed to a family member. The exclusion codes are deliberately **not**
`DOMAIN_ERROR_CODES` members (a test pins that), so they carry no shipped `errors.domain.*` copy and none
is implied by this change.

Every consequence recorded in the Sprint-3 carry-forward applies unchanged and grows: the new
`EXCLUSION_REASON_CODES`, the new `ENTITLEMENT_RULES` and the new trace codes have **no ar/en copy in either
catalogue, and nothing fails because of it** (next-intl prints the raw key). **E10/E12 must add
`distribution.reasons.*` / `distribution.rules.*` / `distribution.trace.*` in Arabic and English and extend
the catalogue-parity test.** The Arabic is deliberately **not invented here** — a refusal reason a
beneficiary reads is product-approved legal text, not a translation written in a code change.

### For the run hash and the engine version

`LineBasis` gains fields and every rule label changes, so **`ENGINE_VERSION` must be bumped** (`1.0.0` →
`2.0.0`): the result shape and the trace codes both change, and both are inside the bytes
`canonicalizeResult` hands the caller to hash. A stored S3 run and a stored S4 run of the same input are not
comparable, and the version field is what says so.

⚠ **AND AGAIN ON 2026-08-17 — `3.0.0` → `e6-distribution/4.0.0`** — by the owner's memo Q5 (one extinction trigger on every entitlement order) and Q7 (validity precedes short-circuits). Q5 changes what a stored input PAYS on `ORDERED`/`SHARED` deeds (256 of 7,680 enumerated cells changed answer, all in one direction) and Q7 converts some computing runs into refusals, so a v3 result and a v4 result of the same register are **not comparable** — and the version is a byte inside the digest the Nazir's signature attests to.

⚠ **Bumped again by amendment E: `2.0.0` → `e6-distribution/3.0.0`.** The **input** gained a Shart clause
(so a v2 run of "the same" input is not the same input — v2 could not express the reversion at all), the
trace gained three codes, `basis.rule` gained a value, and `basis.rule` can now **vary between lines of one
run**. A MAJOR bump is the only honest signal for a change to what the input can say.

### What is settled and what is not

**Settled:** the product rules — lineage eligibility, the two-value continuation stipulation, per capita,
and the engine's refusal of a joint waqf.

**Not settled:** ~~(a) whether الوقف المشترك as Art. 4 uses it means one endowment with both legs~~ —
**(a) is CLOSED 2026-08-03, see amendment B: it is an oversight category, not a hybrid endowment**;
(b) whether deed-allocated unequal shares among descendants override per capita;
(c) everything in the open-questions list returned with this decision — ⚠ **of which open question 10 is now
CLOSED (amendment C: *require the parent on every deed*), and two new owner-facing questions replace it:**
~~**(d) may a `CHARITABLE_JIHA` sit in a ذري cohort at all**~~ (R6-D1 — measured taking the whole ghallah of a
family-typed waqf, and diverting 13,750,000 halalas from a living descendant), and ~~**(e) does the
lineage-edge requirement reach `CATEGORY_ONLY` on a خيري waqf**~~ (R6-F1 — where it currently forces a
fabricated bloodline onto an unnamed charitable segment). ~~None of (b)–(e) can be closed by a build sprint,
and the engine refuses rather than choosing in every case where they bite — **except (d), where it does not
refuse and pays**, which is why R6-D1 carries the higher severity.~~

⚠ **UPDATED 2026-08-10.** **(d) is ANSWERED (amendment E):** a `CHARITABLE_JIHA` may sit in a ذري cohort
**only** as the deed's recorded **ultimate taker**, paid only once the bloodline is over. **(e) is CLOSED**:
the edge requirement reaches `CATEGORY_ONLY` **only on a `FAMILY_DHURRI` waqf**, so a خيري deed's unnamed
segment needs no fabricated bloodline. **(b) is unchanged and still unasked.** The live list is now
**(f) R7-d** — does *"the bloodline is over"* mean no living descendant or no continuing line? — **(g) is the
reversion one-shot or recomputed every period?** (the engine recomputes; the money is irreversible in one
direction only), **(h) R7-D1** — can an unenumerated placeholder's `active: false` certify a death? (the
engine says **yes** and pays, which is why R7-D1 is HIGH) — **(i) may a خيري waqf record a reversion, or hold
members recorded as the waqif's own descendants at all?** (both refused on Claude's reading, neither ruled on)
and **(j) ESC-2's precedence question**. As before, the engine refuses rather than choosing wherever these
bite — **except (h), where it does not refuse and pays.**

⚠ **UPDATED 2026-08-11 (amendment F).** **(f) is ANSWERED: *"over"* means NO CONTINUING LINE** — a living
descendant on a line the deed does not continue no longer holds the endowment. **(h) is CLOSED:** a placeholder
**cannot** certify a death, the engine holds the reversion instead of paying, and the sentence above — *"the
engine says yes and pays"* — **no longer describes the code**. So nothing on this list is now in the
*"does not refuse and pays"* state. The live list is **(b)** per capita vs deed weights (still unasked) ·
**(g)** one-shot vs recomputed · **(i)** the خيري mirrors · **(j)** ESC-2's precedence · and **one new item F
created: (k) the widening is scoped to `LINEAGE_CONTINUATION`, so `ORDERED`/`SHARED` still use the strict
extinction reading — two deed shapes, two answers to the same question, and the owner has not been asked.**

---

## The lesson worth keeping

The shipped resolver was the strongest-tested code in the repo — 47 hand-written mutants, 47 killed — and it
computed the **wrong model**. Every one of those tests asserted that the tier arithmetic was applied
correctly; none could ask whether ṭabaqa was the right key, because the input contract had no lineage edge
for the question to be asked with. **A vocabulary that cannot express the domain cannot be tested into
expressing it**, and that is a stronger argument for surfacing fiqh questions early (binding rule 4) than
any coverage number.
