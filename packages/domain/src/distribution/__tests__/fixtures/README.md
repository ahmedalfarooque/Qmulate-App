# E6 worked-example fixtures — and the delta `sample-waqf.json` still owes

**Everything in this folder is invented.** No client data, ever. `archive/raw-intake/` holds a real
family's real names, deed numbers and bank details and is never read by anything here. Display names
exist only in `DISPLAY_NAMES`, are suffixed `(fictional)`, and never enter an engine input — the
engine's input schema is `.strict()` and has no name field at all, so a name cannot reach a run, a
trace or a `DomainError`.

That now includes an invented **family tree**: `waqf-005`'s sixteen beneficiaries carry `parentId`
edges and `lineageLink` facts (ADR-0009 + R-FRONTIER), and every one of them is fictional. The lineage
edge is an **id**, deliberately — a family tree recorded by name would put PII on the hashed, signed
trace, which is exactly why the contract has no `name` field.

## ⚠ R6 — every family beneficiary in this module now carries a lineage edge

The product owner answered ADR-0009's open question 10 **yes**: eligibility comes from descent, so the
descent must be recorded whatever rule the deed uses. A `FAMILY` or `CATEGORY_ONLY` member with no
`lineageLink` halts `SHART_INCOMPLETE` / `LINEAGE_LINK_MISSING` on **`ORDERED` and `SHARED` too**, and
`tabaqa` must equal the depth the parent edges derive. So `waqf-001` (A/E), `waqf-002` (B) and the
residual prover (F) all carry real parent chains now — Example A's tier contrast is expressed
_through_ a two-node graph rather than beside one.

Two consequences worth knowing before you touch anything here:

- **`BEN_002` now carries `parentId: 'ben-001'`.** A probe cohort built from `patched(BEN_002, …)`
  must include `BEN_001` too, or override `parentId: null, tabaqa: 1`. A ṭabaqa-2 member with no
  parent edge is a record the engine refuses, so a tier contrast on a family waqf now _requires_ a
  two-node graph. `BEN_001`, `BEN_003`, `BEN_A`/`B`/`C` are all children of the waqif and stay valid
  standalone.
- **`waqf-004` (C / C2) is the one deliberate exception and must stay edgeless.** Its cohort is
  precisely an input that would halt if it were resolved.

  ⚠ **CORRECTION (memo Q7, product owner 2026-08-17).** This bullet used to end _"which is the only way
  to observe that the `NA_DIRECT_USE` short-circuit runs *before* `buildLineage`. Giving it edges makes
  that ordering untestable."_ **That is now false: `buildLineage` was hoisted ABOVE the short-circuit**
  — _validity precedes short-circuits_, so a cycle, a dangling parent edge, an unreadable descent link
  or a ṭabaqa disagreeing with its own edges halts a direct-use deed too. What this cohort still
  observes is the one pass that stayed below: **`LINEAGE_LINK_MISSING`**, classified as a completeness
  requirement rather than a self-contradiction (see `resolver.ts`, `buildLineage` pass 4, and its
  TODO(surface)). It is also the measured cost of hoisting that pass — doing so makes
  `worked-examples.test.ts` fail to collect at all, since §08 Example C is built at module scope.

A **خيري** (`PUBLIC_CHARITABLE`) cohort is the mirror image — no lineage edge on any member at all
(ESC-1, `DESCENDANT_ON_CHARITABLE_WAQF`).

⚠ **CORRECTION (R7, product owner 2026-08-10).** This section used to end _"and a **ذري**
(`FAMILY_DHURRI`) cohort may hold no charitable jiha at all"_. That is now **false as an absolute**: a ذري
cohort **may** hold a `CHARITABLE_JIHA` **if and only if** the deed names it as the endowment's
**ultimate taker** (مآل الوقف) in the waqf-level `reversion` clause. Unnamed ⇒ still
`CHARITABLE_JIHA_ON_FAMILY_WAQF`; named ⇒ legal, and the taker is EXCLUDED
(`REVERSION_PENDING_LIVING_BLOODLINE`) until no living descendant is on record at all.

## ⚠ R7 — the reversion clause `sample-waqf.json` and `schema.prisma` both owe

**Nothing in `data/fixtures/sample-waqf.json`, `schema.prisma` or the seed was touched by R7** — the
engine leads by a declared delta, as it does for `LINEAGE_CONTINUATION`. What is owed:

- **`Waqf` needs the مآل clause**: a `reversion` kind (engine vocabulary `REVERSION_KINDS`, one member
  today: `CHARITABLE_ULTIMATE_TAKER`) plus a link to the ultimate-taker **beneficiaries**. It is a
  **waqf-level** fact, not a beneficiary flag — a clause that names ids gives the engine two sides that
  must agree, and `BENEFICIARY_KINDS` stays at three so the ten `MUST_MATCH` Prisma pairings are
  untouched.
- **Every ذري endowment in the JSON needs the clause stated as ABSENT** (`reversion: null`), not omitted.
  The engine's input key is **nullable but required**: a defaulted reversion is a defaulted answer to
  _"where does this endowment go when the family ends?"_, which is a reading of the deed.
- **`REVERSION_KINDS` is pinned ABSENT from `schema.prisma`** by `prisma-vocabulary-parity.test.ts`
  (engine-only vocabularies 4 → 5), together with a field-level probe that `model Waqf` declares no
  `reversion*` column.
- ✓ **DECIDED — the reversion is a fact about the WAQF, per deed (memo Q2, product owner 2026-08-17).**
  This entry read: _"Open, and E3/E4 must decide before writing the migration: is the reversion a fact
  about the **waqf** or about the **waqif**? One waqif may found several endowments, and a per-waqf clause
  can disagree across them with nothing keeping it consistent … The answer decides whether
  `REVERSION_ULTIMATE_TAKER_UNKNOWN` is an integrity failure or a scoping question."_ The owner chose
  **per waqf**: the clause is text _in a deed_, and deeds disagree in reality. So the shipped shape (four
  columns on `Waqf` + `waqf_reversion_taker`) is confirmed, **no migration is owed for this question**, and
  `REVERSION_ULTIMATE_TAKER_UNKNOWN` is an **integrity failure** within one waqf's beneficiary set — which
  is what the engine already implements.
- ✓ **The reversion RECOMPUTES every period (memo Q3, product owner 2026-08-17)** — confirmed, not changed.
  The trigger is a **state**, not an event: a later-recorded heir reverses it, and halalas already paid to a
  charity are a legal recovery matter outside the engine. The one-shot alternative was declined because a
  clerical omission (an unrecorded grandchild) would permanently disinherit a bloodline. Fixtures needing a
  reversal therefore only have to add the heir; nothing latches.
- ✓ **Several takers split by DEED WEIGHTS (memo Q4, product owner 2026-08-17)** — confirmed as the
  product's rule rather than engineering's assumption. Each taker takes its `stipulatedWeight`; an all-zero
  vector **halts** (`ULTIMATE_TAKER_WEIGHTS_UNUSABLE`) and is never split equally, because per capita is the
  bloodline's rule and not a charity's (R7-e). Example J′'s 70/30 vector is the fixture that pins it.

### The two data obligations R7 adds that nobody would guess from the rule

- **A ذري cohort may now hold a `CHARITABLE_JIHA` — if and only if the deed names it.** This
  **corrects** the flat statement carried under R6-D1 that a `FAMILY_DHURRI` waqf may hold none at all.
  Unnamed ⇒ still refused (`CHARITABLE_JIHA_ON_FAMILY_WAQF`); named in `reversion.ultimateTakerIds` ⇒
  permitted, and **`EXCLUDED / REVERSION_PENDING_LIVING_BLOODLINE` until no line the deed continues is still
  going** (R7-d, and on every order since memo Q5). The خيري half of that rule is unchanged and still
  absolute: a `PUBLIC_CHARITABLE` waqf may hold no beneficiary recording a `lineageLink` (✓ **ruled**, memo
  Q6), and may not record a reversion at all (`REVERSION_ON_CHARITABLE_WAQF` — ⚠ **still** Claude's
  fail-safe reading of R5, awaiting the owner: memo Q6 confirmed three refusals and this is **not** one of
  them). So
  `waqf-003` may become **either** jiha-only-and-خيري **or** ذري-with-descendants-plus-a-named-مآل; it
  may not become ذري with an unnamed charity.
- **A reverting deed needs its DECEASED descendants enrolled.** The reversion triggers only when no
  descendant on record keeps a line the deed **continues** going (R7-d, 2026-08-11; on **every** entitlement
  order since memo Q5, 2026-08-17 — see the next section), measured over the graph `buildLineage` certified
  — and a
  clause recorded over an **empty** family register is refused
  (`REVERSION_WITH_NO_RECORDED_BLOODLINE`), because ∅ is _"not yet enrolled"_, not _"extinct"_. So an
  old endowment taken on after its family died out cannot be computed until its dead descendants exist
  as records with `active: false` and real lineage edges. ⚠ That is **engineering's** fail-safe call,
  not the owner's; the operational cost is real and is surfaced rather than absorbed.

### ✓ The fiqh question R7 left open is ANSWERED TWICE — and this section was STALE until now

⚠ **This section said the opposite of the shipped engine and is corrected rather than trimmed.** It read:
_"Does 'the bloodline is over' mean no living descendant or no continuing line? The owner said 'once ALL
descendants are dead', so the engine builds the **strict** reading … In that case the reversion does **not**
fire: the pool is retained … Do not collapse the two cases."_ That was true for one day.

- **R7-d (product owner, 2026-08-11): _"bloodline is over means no continuing line."_** The strict reading is
  wrong. Under `ZUHUR_ONLY` a waqif with only daughters can have living blood descendants whose line the deed
  does not continue, and the مآل **takes** — the ẓuhūr line is over even though the family is not.
- **Memo Q5 (product owner, 2026-08-17): one trigger everywhere.** R7-d's widening had been scoped to
  `LINEAGE_CONTINUATION`; `ORDERED` and `SHARED` kept the strict reading, so one مآل clause fired at two
  different moments depending on an unrelated setting. The continuation stipulation — **not** the entitlement
  order — defines whose line counts. Proven by enumeration in `continuing-line-adversarial.test.ts`: **7,680
  runs, 672 triggered, 256 cells moved by the ruling, I-R1 asserted on every one.**

⚠ **What still holds, and what a fixture must not collapse:** an **empty entitled cohort is not a line
ending.** A zero deed weight on every living head, a head held behind a living ancestor, and a gate-withheld
payment all **retain** the pool (`REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`), and an unenumerated
`CATEGORY_ONLY` placeholder **holds** the reversion however the continuing-line test comes out (R7-D1,
owner-confirmed). ⊕ And Q5 forced one consequence worth a fixture author's attention: on a **triggered**
`ORDERED`/`SHARED` run a living descendant on an abandoned line is excluded `BUTUN_LINE_NOT_CONTINUED` — the
only way that code appears outside `LINEAGE_CONTINUATION`.

### Examples J and J′ — the reversion path's only fixture

`waqf-006`, `ben-601`, `ben-602`, `jiha-601`: wholly invented, and the **only** place the reversion path
exists, since the seed cannot express the clause. They are **one deed in two periods**, differing by two
`active` flags and by 27,500,000 halalas of destination — from the chain
`40,000,000 − 4,000,000 (ṣiyāna 10%) − 4,500,000 (operating) − 4,000,000 (ʿushr 10% of revenue)`.
⚠ The 10% ʿushr is this deed's own rate under Nazarah Art. 11 and is **unverified — confirm vs primary
law**.

The taker's deed weight is deliberately **equal to `ben-601`'s**: had it ever escaped its verdict ladder
on the pending period it would have taken `27,500,000 × 10/20 = 13,750,000` — the exact figure R6-D1 and
ESC-1 were measured at, halving a living descendant of the waqif. R7 does not merely refuse that input;
it computes it to **nothing**.

## ⊕ M1-b (2026-08-24) — the JSON gained a COMPUTING lineage deed, and waqf-005 stayed halting

`data/fixtures/sample-waqf.json` now carries **waqf-007** (`FAMILY_DHURRI` / `LINEAGE_CONTINUATION` /
`ZUHUR_ONLY`, deed recorded COMPLETE — مآل clause read, positively no taker) with the four-member tree
`ben-701…ben-704`: two living frontier heads (a son and a daughter of the waqif, both entitled), one
member held behind his living father (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`), and one son of a living
daughter (`BUTUN_LINE_NOT_CONTINUED` — reported over the temporary hold per the rung-2-over-rung-3
precedence, which remains engineering's `TODO(surface)` in `resolver.ts`, register item #12). It exists
because the S7 close-out refused Milestone 1 while no wired run over the DEFAULT deed shape had ever
computed — waqf-005's halting states are load-bearing subjects and were **not** touched. This module's
own trees (Examples G/G′/H, sixteen members) are unchanged and remain the engine-side subjects; the
JSON tree is deliberately smaller and NOT a mirror of them. A seeded deed that actually **names** an
ultimate taker is still owed — Examples J/J′ remain the reversion path's only fixtures.

## Why the data is a TypeScript module and not the JSON fixture (S3 decision D3)

`packages/domain` is the pure core: no database, no network, **no filesystem**. Reading
`data/fixtures/sample-waqf.json` at test time would put I/O on the engine's own test path and couple
the engine's expected figures to a file that E5/S6 still has to change. So the numbers are literals
in `worked-examples.ts`, derived from the JSON's _shape_ and never from the JSON at runtime.

## ✓ S5/E4 (2026-08-17) — MOST OF THE DELTA IS PAID

`data/fixtures/sample-waqf.json`, the seed mapper and the structured-Shart builder were updated in
S5/E4: **waqf-003 is re-typed `public_charitable`** (three jihas — ben-006 licensed, ben-306
unlicensed, ben-307 expired-licence — at the deed's fixed 40/30/30; `joint` stays in the schema and
mapper as refused-not-remapped vocabulary, ADR-0004); **waqf-005 carries the sixteen-member tree
ben-201…ben-216**, mirroring this module's `LINEAGE_COHORT` record for record; every beneficiary
states `residency` / `category` / `disbursingEntity` / `bankingRefForProceeds`; revenue gains
`rev-003` (waqf-002's rent, `FAKE-ACCT-W2`) and `rev-004` — the fixture's first CAPITAL receipt
(expropriation compensation, corpus); every waqf states `maintenanceRule` / `nazirFee` /
`disbursementSchedule`, which now feed the structured Shart at seed time. **Measured:** database
suite 36 files / 889 tests green twice consecutively on one database; api suite 358 twice.
What moved lives in `FIXTURE_DELTA_CLOSED_IN_S5` (worked-examples.ts); what is STILL owed stays in
`FIXTURE_DELTA_REQUIRED` — notably AT-03's all-inactive ORDERED tier, the `disbursingEntity` /
top-level banking-ref **columns** (fixture data exists; E5/E6 owes the homes), and a seeded deed
that actually NAMES an ultimate taker (Examples J/J′ remain this module's only reversion fixtures).

## The fixture delta — where it actually lives

**Do not maintain a second copy of the list here.** It is machine-readable data in
`worked-examples.ts`:

```ts
export const FIXTURE_DELTA_REQUIRED: readonly string[];
```

That constant is authoritative and is asserted non-empty by the suite, so the engine-vs-database gap
stays visible rather than being quietly forgotten. This README exists so someone planning S5/S7 can
_find_ it; read the constant for the content.

What it covers, as headings only:

- **ADR-0009's lineage model** — the biggest items on the list, and they are new: `parentId`,
  `lineageLink` (`SON`/`DAUGHTER`, the ẓuhūr/buṭūn **eligibility fact**, not demographics) per
  beneficiary; `continuationStipulation` and the new `entitlementOrder` value `LINEAGE_CONTINUATION`
  per waqf; a whole new `waqf-005` with **sixteen** beneficiaries forming a three-generation,
  four-branch tree; and `beneficiaries[].tabaqa` demoted from a trusted input to a **cross-check**
  against the depth derived from the parent edges (a disagreement halts). ⚠ `LINEAGE_CONTINUATION` is
  **not yet in Prisma's `EntitlementOrder`** — the engine is deliberately ahead by that one declared
  member and E3/E4 owes the migration.
- **R6 — `lineageLink` and `parentId` are required on EVERY deed, not only lineage ones.** This is the
  single largest new obligation on the JSON: `ben-001`…`ben-005` each need a real, coherent edge, and
  a seeded `ORDERED` or `SHARED` waqf whose beneficiaries record no descent **no longer computes at
  all**. It closes S3-D1, measured at 78,000,000 of 78,000,000 halalas paid to a member the engine
  could place in neither the ṭabaqāt nor the tree.
- **R6-D1 and ESC-1 — the cohort must match the waqf's nature, in both directions.** A `PUBLIC_CHARITABLE`
  waqf may hold no beneficiary recording a `lineageLink` — ✓ **a product position since memo Q6 (product
  owner, 2026-08-17), no longer Claude's reading of R5; the `TODO(surface)` in `resolver.ts` is replaced by
  the ruling**, together with `TABAQA_ON_CHARITABLE_WAQF` and R6-F1's ذري-only scoping of the lineage-edge
  requirement. A `FAMILY_DHURRI` waqf may hold a `charitable_jiha` **only as its
  recorded ultimate taker** — ⚠ **R7 (2026-08-10) confirmed the refusal for the non-taker case and
  reversed it for the ultimate-taker case**, so the flat "may hold none at all" reading is superseded; see
  the R7 section above.
- **R-FRONTIER — `active` is now load-bearing on ANCESTORS, not just on the beneficiary.** Entitlement
  sits at the nearest living point on each line of descent, so one stale vital status silently moves a
  whole branch's money. `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` is a **temporary** exclusion that
  reverses on that ancestor's death: any UI, report, cached cohort or "permanently excluded" filter
  that treats it as durable is wrong for this code specifically, and its Arabic copy must not read as
  permanent (E10/E12).
- **⚠ WHY R6 IS NOT A TIDINESS RULE, measured in the S5 adversarial pass (`escape-class-adversarial.test.ts` §8).**
  `lineageFrontierVerdict` walks `lineage.ancestorsById.get(id) ?? []`. A beneficiary who is **not in
  the graph** gets an EMPTY chain from that `??`, so they have no living ancestor and no broken line,
  satisfy R-FRONTIER **vacuously**, and are ENTITLED — the lineage path **fails OPEN**. Disabling R6
  and re-driving the depth-3 grid measured **128 cells paying an unplaced line**, the smallest being a
  `FAMILY_DHURRI` / `LINEAGE_CONTINUATION` / `ZUHUR_ONLY` run where one third-generation member with
  its edge stripped took **27,500,000 of 27,500,000 halalas**. Nothing downstream can catch this: the
  allocator sees a legal weight vector and the invariants recompute the same empty chain. The entire
  defence is three upstream refusals — R6 (`LINEAGE_LINK_MISSING`) for `FAMILY`/`CATEGORY_ONLY`,
  `LINEAGE_ORDER_ON_CHARITABLE_WAQF` for a jiha, and ESC-1 for a jiha beside placed descendants. So
  **a seeded row missing its edge is not a cosmetic gap in the JSON — it is a payout.**
  ⚠ **R7 adds a fourth line of defence for the one case it opens**: a recorded ultimate-taker jiha is a
  legal member of a ذري cohort and is deliberately kept **out** of the lineage graph — but it never reaches
  `lineageFrontierVerdict` at all, because its verdict comes from the reversion ladder, where it is
  **EXCLUDED by default** until no living descendant remains on record. Invariant `I-R1` asserts that
  independently. The vacuous-entitlement hole is not widened by R7; it is closed a second way.
- **`waqf-003` must be re-typed.** It is recorded `joint`, and a JOINT waqf is now REFUSED (a waqf is
  either خيري or ذري, never both — ADR-0009 R5), as is any cohort mixing a charitable jiha with a
  family member under any type. ⚠⚠ Do **not** remove `joint` from `schema.prisma` and do not write a
  migration: Awqaf Law Art. 4 and the glossary's الوقف المشترك both record joint endowments as real,
  that contradiction is an open item for Saudi counsel, and ADR-0004 established that this repo's enum
  narrowings refuse rather than remap.
- **`beneficiaries[]`** is missing seven further fields the engine requires — `kind`, `active`,
  `stipulatedWeight`, `residency`, `disbursingEntity`, a top-level `bankingRefForProceeds`, and
  `category`. Two of those absences are load-bearing rather than cosmetic: `active` is the _sole_
  input to the ORDERED extinction test, and `stipulatedWeight` is **not** the existing
  `sharePercent` (waqf-001's three `sharePercent: 12.5` values sum to 37.5, not 100 — §08 treats
  12.5 as a _relative_ deed weight normalised over the entitled cohort, so collapsing the two fields
  is how a 37.5%-of-distributable payout ships).
- **New records** — a `category_only` beneficiary, without which the `CATEGORY_NOT_CAPTURED` gate has
  no fixture-shaped subject at all. ⚠ The earlier ask for family members `ben-007` / `ben-008` on
  `waqf-003` is **superseded**: it exists so the joint waqf would have a family leg, which is now the
  opposite of what is wanted (see the re-typing item above). Those records survive in
  `worked-examples.ts` only as the REFUSAL subject and must not be seeded as a computable waqf.
- **`revenue[]`** needs an explicit `receiptClass` on every row plus a `capitalSource` where capital,
  and at least one CAPITAL row. Today `packages/database/src/seed/map.ts` _hardcodes_
  `receiptClass: 'INCOME'` — which is precisely the silent trust the engine-side corpus guard (D1)
  exists to close. The classification must be **data in the fixture**, not a decision in the mapper.
- **`waqfs[]`** needs a structured `maintenanceRule`, a `nazirFee` basis+rate (or an explicit `null`
  for "deed silent"), and an explicit `disbursementSchedule` — `null` is what makes the post-FYE
  default window bind, so it has to be a _recorded_ fact and not an inference from a missing key.

**Nothing in that list is applied in S3** (D3): `data/fixtures/sample-waqf.json`, the database seed
and the Obsidian vault are untouched by this sprint.

## Which example records are §08's, and which are invented extensions

Every extension is marked `ILLUSTRATIVE EXTENSION` at its definition in `worked-examples.ts`. In
summary:

| Example                                                                                                                             | Grounded in the JSON's shape                                    | Illustrative extension                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** — `waqf-001`, ORDERED                                                                                                         | `rev-001` 350,000.00; `fee-001` 10% of revenue; ben-001…ben-003 | the ṣiyāna **rule** (see below)                                                                                                                                                                                                                                 |
| **B** — `waqf-002`, SHARED                                                                                                          | —                                                               | the whole 200,000.00 revenue _and_ the 5% ṣiyāna rate; `waqf-002` has **no revenue row at all** (§08 flags this as illustrative too)                                                                                                                            |
| **C** — `waqf-004`, direct use, nil                                                                                                 | the nil period                                                  | —                                                                                                                                                                                                                                                               |
| **C2** — `waqf-004`, direct use **with** revenue                                                                                    | —                                                               | the incidental rent and both beneficiary records. **This is the DEFECT-1 prover**: it is the only case where §08's invariant I3 as written is false, so it must not be dropped                                                                                  |
| **D** — `waqf-003`, JOINT — **now a REFUSED input** (ADR-0009 R5), kept as the refusal subject                                      | `rev-002` 1,800,000.00; `exp-e-003` 120,000.00                  | the ṣiyāna rule, the CAPITAL receipt, ben-007, ben-008, ben-006's `disbursingEntity`                                                                                                                                                                            |
| **D-خ** — `waqf-003` re-typed `PUBLIC_CHARITABLE`; D's money, gates and corpus proof re-homed onto three jihas at the same 40/30/30 | the same `rev-002` / `exp-e-003`                                | ben-306, ben-307 and all three `disbursingEntity` records                                                                                                                                                                                                       |
| **E** — `waqf-001`, stale KYC                                                                                                       | A with one field changed (ben-001's `kycLastRefreshed`)         | —                                                                                                                                                                                                                                                               |
| **F** — residual prover                                                                                                             | —                                                               | wholly invented; §08's own 100.00-three-ways case                                                                                                                                                                                                               |
| **G / G′** — `waqf-005`, `LINEAGE_CONTINUATION` under `ZUHUR_ONLY` and `ZUHUR_AND_BUTUN`                                            | —                                                               | **wholly invented and not in §08 at all.** One three-generation, four-branch, sixteen-member tree run under both stipulations, so the continuation term is the ONLY difference between two results: 780,000.00 pays 6 heads at 13,000.00 or 8 heads at 9,750.00 |
| **H** — the per-capita residual prover                                                                                              | —                                                               | wholly invented; the same tree with equal weights and 100.00, so the Hamilton residual is 4n and I-L1's `max − min <= 1n` bound is exercised at its limit rather than at zero                                                                                   |

The `waqf-005` tree was **rebuilt** for R-FRONTIER, not extended. The nine-member tree it replaces was
written for ADR-0009's original wording (_"every living descendant of the waqif is eligible"_); run
through the corrected frontier test it yields the **identical** three-head cohort under both
stipulations, so Examples G and G′ would have been the same answer twice and the continuation term
would have looked like it did nothing. The current tree is built from the frontier rule outwards, and
every record in it breaks a different wrong implementation — see the table in `worked-examples.ts`.

## Two things here are unresolved, not decided

- **ṣiyāna (صيانة): forward reserve, incurred cost, or both?** §08 Example A uses `exp-e-001` — a
  _paid_ maintenance expense — as the _stipulated reserve_. Those are different ledger events, and
  treating one as the other either double-counts or under-reserves. The engine takes `maintenance` as
  a **rule** and `operatingCostMinor` as **actuals** and never derives one from the other; whether
  that is the right reading is a fiqh + accounting question for the Sharia reviewer. Recorded in
  `worked-examples.ts` as `MAINTENANCE_RULE_IS_NOT_AN_EXPENSE`.
- **Every regulatory figure these fixtures apply is ⚠ unverified — confirm vs primary law**
  (CLAUDE.md binding rule 3): the 10% ʿushr rate, the 3-month post-FYE window, the 12-month KYC
  refresh interval, and the `EARLIER_OF` binding-calendar selector. They appear here as _injected
  caller inputs_, which is the point — none of them is a default inside the engine.

Separately, and on the record because the corpus guard is easy to over-read: the **structure** of
income-vs-capital classification is enforced, but **which receipt types count as capital is not
signed off** (ADR-0002's Sharia review is unsigned — lease premium / key money, insurance proceeds on
a destroyed building, rent arrears collected after an istibdal, and whether an income-funded ṣiyāna
reserve becomes corpus are all still open). Do not let real data through this path before sign-off.
