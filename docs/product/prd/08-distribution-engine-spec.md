# Distribution Engine Spec

The pure, deterministic engine that turns a waqf's yield (ghallah) into signed, per-beneficiary payouts — waterfall, eligibility, gates, timing, and controls.

Status: Draft v0.1 · Privileged & Confidential

> ## ⚠ PARTLY SUPERSEDED — read [ADR-0009](../../decisions/ADR-0009-lineage-entitlement-and-no-joint-waqf.md) before trusting Stage 2
>
> Product-owner decisions of 2026-08-02/03, implemented in `packages/domain/src/distribution/`. **This
> document has NOT been rewritten**; ADR-0009 carries a clause-by-clause supersession table naming every
> line below that no longer describes the engine. The four that bite hardest:
>
> 1. **Entitlement is LINEAGE-based, not ṭabaqa-arithmetic-based.** A generation's death does not block the
>    next generation. `ENTITLEMENT_ORDERS` gained **`LINEAGE_CONTINUATION`** — the deed shape treated as
>    normal — and **`ORDERED` (al-aʿlā fa-l-aʿlā) is now the explicitly-stipulated exception**, preserved
>    verbatim in behaviour. `SHARED` / tashrik and `NA_DIRECT_USE` are unchanged. ṭabaqa is **derived** from
>    a new `parentId` edge and cross-checked; a supplied value that disagrees is a refusal.
> 1b. **R-FRONTIER — entitlement sits at the NEAREST LIVING POINT on each line of descent** (product
>    owner, 2026-08-03, **correcting ADR-0009's own wording** *"every living descendant of the waqif is
>    eligible"*, which the engine had faithfully implemented). Verbatim: *"son A's child does not get since
>    Son A is alive. Son A's child only gets anything if son A is dead."* A member is entitled iff they are
>    living, **every ancestor strictly between them and the waqif is deceased**, and — under `ZUHUR_ONLY`
>    only — every such ancestor is a `SON`. A living ancestor holds it and their descendants wait
>    (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`), **temporarily**: the exclusion reverses on that ancestor's
>    death, so no statement, report or cached cohort may treat it as durable. Its Arabic must therefore not
>    be phrased like `BUTUN_LINE_NOT_CONTINUED` (E10/E12).
> 2. **A lineage cohort's arithmetic is PER CAPITA** — equal per **entitled** head (the living frontier of
>    each line per 1b, **not** every living descendant). A family
>    beneficiary's `stipulatedWeight` is **not applied** there (it is recorded, traced and flagged). The
>    single-level normalisation of line 111 still governs `ORDERED`, `SHARED` and charitable allocations.
> 3. **A JOINT waqf is REFUSED**, as is any cohort mixing a `CHARITABLE_JIHA` with a `FAMILY` beneficiary.
>    **Worked Example D and the FIXED-SHARE JOINT row (line 107) describe an input that now halts.** The
>    `joint` enum member itself stays here, in the engine and in `schema.prisma` — the engine refuses the
>    *value*, it does not narrow the *vocabulary*, and removing it is a migration owed to E3/E4.
>    ✓ **The Awqaf Law Art. 4 / مشترك contradiction is RESOLVED (product owner, 2026-08-03):** *"it just
>    means that there are 2 types of endowments/waqf, but a waqf cannot be both."* مشترك is the Authority's
>    **oversight category spanning both kinds**, not a hybrid endowment — there was never a contradiction,
>    and the refusal is correct. One caveat and no more: this is the product's position from a practising
>    Nazir rather than Saudi counsel, so a legal filing turning on المشترك should still go to counsel.
> 4. **New deed term `continuationStipulation`** (`ZUHUR_ONLY` | `ZUHUR_AND_BUTUN`), a closed two-value
>    term with **no default** — absent or unrecognised halts. Invariant **I5** is narrowed/extended and a
>    new **I-L1** carries per-capita equality.
> 5. **R6 — the LINEAGE EDGE IS REQUIRED ON EVERY DEED** (product owner, 2026-08-03, answering ADR-0009's
>    own **open question 10**). A `FAMILY` or `CATEGORY_ONLY` beneficiary carrying no `lineageLink` halts
>    the run with `SHART_INCOMPLETE` / **`LINEAGE_LINK_MISSING`** on **`ORDERED` and `SHARED` as well as
>    `LINEAGE_CONTINUATION`**. In the owner's frame: eligibility comes from descent, so the descent must be
>    on record whatever rule the deed uses, and **nobody the engine cannot place in the family tree may
>    ever be paid**. **This is a data-completeness requirement, not a change to who gets paid** — the
>    `ORDERED` tier rule of line 104, `SHARED`, `NA_DIRECT_USE` (which short-circuits before the graph is
>    built and is therefore not refused), the frontier rule, the waterfall, the gates, timing, the
>    allocator and every conservation invariant are unchanged. **Consequence for this spec's inputs:**
>    line 209's `tabaqa` and the `BeneficiaryInput` shape now require `parentId` + `lineageLink` on every
>    family/category member of **every** worked example, so **Examples A (ORDERED) and B (SHARED) describe
>    inputs that are incomplete as written** — both need a real family tree, with each declared ṭabaqa
>    matching the depth its edges imply (a mismatch is `TABAQA_MISMATCHES_LINEAGE_DEPTH`).
>    ⚠ **R6 does NOT un-qualify G-9 clause 3.** It closes the `FAMILY`/`CATEGORY_ONLY` escape measured as
>    S3-D1; the same escape survived with a `CHARITABLE_JIHA` on a `FAMILY_DHURRI` waqf (**R6-D1**, HIGH),
>    which the engine now refuses (item 6). ⚠ It also made a **charitable** waqf's unnamed `CATEGORY_ONLY`
>    segment unrepresentable without a fabricated bloodline (**R6-F1**) — **since corrected**: pass 4 now
>    demands the edge from a `CATEGORY_ONLY` member **only on a `FAMILY_DHURRI` waqf**, so an edgeless
>    charitable segment is legal again (it is `CATEGORY_NOT_CAPTURED`-gated while its `category` is blank).
> 6. **A waqf has ONE nature, and four refusals now enforce it** (2026-08-09/10 — ADR-0009 amendments D and
>    E). A `CHARITABLE_JIHA` on a `FAMILY_DHURRI` (ذري) waqf halts **`CHARITABLE_JIHA_ON_FAMILY_WAQF`**
>    ⚠ *unless the deed names it as the endowment's ultimate taker — see item 7*; a beneficiary carrying a
>    `lineageLink` on a `PUBLIC_CHARITABLE` (خيري) waqf halts **`DESCENDANT_ON_CHARITABLE_WAQF`** (this
>    closed **ESC-1**, measured at 13,750,000 of 27,500,000 halalas beside a living ṭabaqa-1 descendant and
>    at the whole 27,500,000 once they were dead); a beneficiary carrying a **`tabaqa`** on a خيري waqf halts
>    **`TABAQA_ON_CHARITABLE_WAQF`** (a charitable waqf has no generations, so no `basis.rule` on it may read
>    `ORDERED_LOWEST_LIVING_TABAQA`); and `waqfType: 'JOINT'` halts as before. ⚠ **Two of the four are
>    Claude's fail-safe reading of the owner's R5 rather than the owner's own ruling** — see the ADR's
>    amendment D and its `TODO(surface)` markers, which must not be removed.
> 7. **R7 — مآل الوقف: a ذري deed may name a charitable jiha as its ULTIMATE TAKER** (product owner,
>    2026-08-10 — ADR-0009 amendment E). The jiha receives **nothing while any descendant lives** and takes
>    the distributable **once the bloodline is over**, so it never shares a period with the family and R5
>    holds. This is a **distribution path §08 does not describe at all**: the input gained a nullable-but-
>    required waqf-level `reversion` clause (`{ kind, ultimateTakerIds }`, no default — R7-c: a reversion is
>    **never inferred** from a charity's presence), ~~the trigger is **strict** (it fires only when **no living
>    descendant is on record at all**, over the certified lineage graph)~~ **← superseded by item 8: the
>    trigger is NO CONTINUING LINE**, the taker's share is its deed
>    `stipulatedWeight` (**not** per capita — a charity is not a head of a bloodline), and a taker is
>    **EXCLUDED by default** (`REVERSION_PENDING_LIVING_BLOODLINE`) until the trigger fires. New invariant
>    **I-R1** asserts, on **every** run, that no ultimate taker is ever paid a halala in the same run as any
>    descendant. ⚠ **`SHART_REFUSALS` now holds TWENTY-SIX discriminators** — assert the specific one, never
>    a bare `SHART_INCOMPLETE`. ⚠ **The "strict" trigger above is SUPERSEDED — see item 8.**
> 8. **R7-d — *"the bloodline is over"* means NO CONTINUING LINE** (product owner, **2026-08-11** —
>    ADR-0009 **amendment F**). A living descendant keeps the endowment for the family only if their line is
>    one **the deed continues**: under `ZUHUR_AND_BUTUN` always, under `ZUHUR_ONLY` only when every ancestor
>    strictly between them and the waqif is a `SON`. So **a grandchild through a deceased daughter no longer
>    holds a `ZUHUR_ONLY` endowment** and the deed's مآل takes. The predicate reads **descent + liveness +
>    the stipulation only** — never an exclusion code — so three causes of an empty entitled cohort are pinned
>    as **NON-triggering** and still **retain** the pool with
>    `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING`: a zero-weight living descendant, one held behind a living
>    ancestor, and one withheld by a gate. **R7-D1 is CLOSED with it** — an unenumerated `CATEGORY_ONLY`
>    placeholder's `active: false` **cannot certify a death** and instead **holds** the reversion. ⚠ **Still
>    open and unasked:** the widening is scoped to `LINEAGE_CONTINUATION`, so **`ORDERED`/`SHARED` deeds still
>    use the strict *no-living-descendant* reading**.
>
> `ENGINE_VERSION` is **`e6-distribution/4.0.0`** *(v3 → v4 on 2026-08-17 with the owner's memo Q5 + Q7 rulings: Q5 changes the amounts a stored input produces on `ORDERED`/`SHARED` deeds and Q7 turns a computing run into a refusal, so runs across the boundary are not comparable and the version is hashed into the digest a Nazir signs)* (v1 → v2 with ADR-0009, v2 → v3 with R7: the input gained
> a Shart clause, the trace gained codes, and `basis.rule` can now vary within one run). Runs of "the same"
> input across versions are **not comparable** — a v2 input could not express the reversion clause at all.
> **Several fiqh/legal/scope questions returned with these decisions remain unanswered** — see the ADR; open
> question 10 is **closed by R6**, R6-D1 is **answered in part by R7** (a charity may be the ultimate taker
> and only that), **R7-d is ANSWERED and R7-D1 CLOSED (amendment F, 2026-08-11)**, and what stays open is
> **ESC-2's precedence question**, **one-shot vs recomputed reversion**, **per capita vs deed weights among
> takers**, the **خيري mirrors** (`DESCENDANT_ON_CHARITABLE_WAQF` / `TABAQA_ON_CHARITABLE_WAQF` /
> `REVERSION_ON_CHARITABLE_WAQF` — Claude's reading of R5), and the **`ORDERED`/`SHARED` strict-trigger
> asymmetry** F created.

---

## Purpose

This is the centrepiece of `packages/domain`. It specifies the **distribution engine**: given a waqf's period revenue, its Shart al-Waqif, and its beneficiary tree, compute exactly who is owed what, who may be paid now, and produce a signed, audit-reproducible distribution run with a per-beneficiary Arabic statement.

The engine is a **pure function** — no database, no clock, no network, no randomness. Everything it needs (the as-of date, the calendars, the policy windows) is passed in; the same inputs always produce byte-identical outputs. That property is not a nicety: it is what makes a distribution run **reproducible for audit** ([NFR-04](../brd/08-nonfunctional-requirements.md)), **property-testable**, and safe to re-run without side effects. All orchestration — reading the ledger, writing the audit trail, moving money, generating PDFs — lives in the API/worker layers ([06 · API](17-build-ship-dod.md), [worker]) and calls this engine.

It implements [BR-505](../brd/06-functional-requirements.md) (the distribution calculation), [BR-506](../brd/06-functional-requirements.md) (approval / segregation of duties), [BR-507](../brd/06-functional-requirements.md) (Nazir remuneration), and [BR-511](../brd/06-functional-requirements.md) (cross-border disbursement), grounded in the [Nazarah regulation](../../domain/regulations/nazarah-regulation-en.md) Art. 12–13, [unified framework §1-3 / §3-5](../../domain/unified-framework.md), and [glossary §B](../../domain/glossary.md) (ṭabaqa / ẓuhūr–buṭūn / entitlement order).

> [!important] The one distinction the whole engine turns on
> **Entitlement** (who is *owed*) and **payability** (who may be *paid now*) are different questions with different rules. Entitlement comes from the Shart al-Waqif — tier, line, ordered vs shared. Payability comes from compliance gates — KYC, category, licensing, residency. **A beneficiary who is entitled but not yet payable has their share *withheld and retained in the waqf account* — never reallocated to anyone else.** You do not give away someone's ghallah because their paperwork is late.

---

## Where this lives

```
packages/domain/
  src/distribution/
    engine.ts          // runDistribution(input): DistributionResult  — the pure entrypoint
    waterfall.ts       // Stage 1: ghallah → distributable
    resolver.ts        // Stage 2: eligibility (ṭabaqa / line / ORDERED|SHARED|NA_DIRECT_USE)
    gates.ts           // Stage 3: payability gates
    timing.ts          // Stage 4: 3-month-after-FYE window (calendars injected)
    allocate.ts        // Stage 5: rounding + residual allocation + line assembly
    contract.ts        // zod schemas (input/output), branded Money
    invariants.ts      // runtime invariant assertions
    trace.ts           // computationTrace builder
```

`packages/domain` **imports nothing internal** (locked constraint). Money is Decimal(18,2) at the Prisma boundary but the engine works in **integer minor units (halalas, 1 SAR = 100)** internally so all arithmetic is exact — no floats, ever ([NFR-08 money rule](../brd/08-nonfunctional-requirements.md)). Conversion Decimal↔minor happens only at the contract boundary.

---

## Engine overview — five stages

```
 period revenue (ghallah, gross)
        │
   ┌────▼─────────────────────────────────────────────────────────┐
   │ STAGE 1 · WATERFALL                                           │
   │   − ṣiyāna (maintenance reserve)   ← FIRST, always            │
   │   − operating / management cost                               │
   │   − Nazir fee (deed basis; default 10% of revenue = ʿushr)    │
   │   = DISTRIBUTABLE                                             │
   └────┬─────────────────────────────────────────────────────────┘
        │  (if waqf is NA_DIRECT_USE → skip everything below, nil run)
   ┌────▼──────────────┐   ┌───────────────────┐   ┌──────────────────────┐
   │ STAGE 2 · RESOLVER│──▶│ STAGE 3 · GATES    │──▶│ STAGE 4 · TIMING     │
   │ who is ENTITLED   │   │ who is PAYABLE now │   │ within 3mo of FYE?   │
   │ (tier/line/order) │   │ (KYC/cat/lic/xborder)│  │ (calendars injected) │
   └────┬──────────────┘   └───────────────────┘   └──────────┬───────────┘
        │                                                       │
   ┌────▼───────────────────────────────────────────────────────▼──────┐
   │ STAGE 5 · ALLOCATE  — exact split, residual rule, line assembly,    │
   │                        invariants, computationTrace                 │
   └─────────────────────────────────────────────────────────────────────┘
        │
   DistributionResult  → (lifecycle: DRAFT→COMPUTED→REVIEWED→SIGNED→EXECUTED→CLOSED)
```

---

## Stage 1 · The waterfall (ghallah → distributable)

The order is **fixed by the regulation** and is not configurable ([unified framework §3-5](../../domain/unified-framework.md): "استقطاع مبلغ مناسب من العوائد قبل صرفها … لتغطية تكاليف الصيانة والتشغيل"; [glossary §A](../../domain/glossary.md): *maintenance takes priority over any other disbursement*):

| # | Step | Rule |
|---|---|---|
| 1 | **Maintenance reserve (ṣiyāna)** | Reserved **first**, per the Shart al-Waqif stipulation (fixed amount, or % of revenue, or a target balance top-up). Held in the waqf account; not distributed. |
| 2 | **Operating / management cost** | Actual period operating & management expenses (excludes the Nazir fee). |
| 3 | **Nazir fee** | Deducted **before** distribution ([BR-507](../brd/06-functional-requirements.md)). Deed-set basis (below). Default **10% of revenue (ʿushr)**. |
| 4 | **= Distributable** | `revenue − reserve − operatingCost − nazirFee`. Must be **≥ 0** or the run errors (see invariants). |

### Nazir-fee basis (configurable — [BR-507](../brd/06-functional-requirements.md), [NFR-13](../brd/08-nonfunctional-requirements.md))

The fee is set by the **deed**, not by statute (Awqaf Law Art. 14 is the *Authority's* separate fee — out of scope here). **Computation basis** and **deduction position** are independent: whatever the basis, the fee is always deducted at step 3.

| Basis | `nazirFee.basis` | Computation |
|---|---|---|
| **Percent of revenue** (default, ʿushr) | `percent_of_revenue` | `revenue × rate` (default `rate = 0.10`) |
| Percent of net income | `percent_of_net_income` | `(revenue − reserve − operatingCost) × rate` |
| Fixed retainer | `retainer` | `fixedAmountMinor` (period-independent of revenue) |

Where the **deed is silent** on the fee, the engine sets `nazirFee = 0` and emits an `AUTHORITY_FEE_DETERMINATION_PENDING` flag — the fee step is *held* pending the Authority-determination path ([BR-507](../brd/06-functional-requirements.md)); the run may still compute and pay the (higher) distributable but must be flagged, not silently zero-feed.

> The first engagement's deed sets **`percent_of_revenue @ 0.10`** — configure as the default (see `nazirFees[0]` in [sample-waqf.json](../../../data/fixtures/sample-waqf.json)).

---

## Stage 2 · The eligibility resolver (who is entitled)

Eligibility is **not a flat list** ([glossary §B](../../domain/glossary.md)). The resolver walks the beneficiary tree using **tier (ṭabaqa)**, **line (ẓuhūr / buṭūn)**, and the deed's **entitlement-order rule** ([BR-103](../brd/06-functional-requirements.md), [BR-204](../brd/06-functional-requirements.md)). It outputs, for each beneficiary, an **entitled weight** (or *excluded, weight 0, with a reason*). It does **not** look at KYC or licensing — that is Stage 3.

| Mode | `entitlementOrder` | Rule |
|---|---|---|
| **ORDERED** (al-aʿlā fa-l-aʿlā / al-awwal fa-l-awwal — *waqf murattab*) | `ordered` | Find the **lowest-numbered ṭabaqa that has ≥1 living, non-excluded member**. Only that tier is entitled. **Every lower tier (higher number) is EXCLUDED** (`weight 0`, reason `UPPER_TABAQA_EXTANT`) until the upper tier is extinct. Line (ẓuhūr/buṭūn) can further partition within a tier if the deed stipulates it. |
| **SHARED** (tashrik — *waqf mushtarak bayn al-ṭabaqāt*) | `shared` | **All living tiers share together.** No tier excludes another. Weights are the deed-stipulated shares across the whole living cohort. |
| **DIRECT-USE** (intifāʿ mubāshir) | `n/a (direct use…)` | **No monetary distribution.** Beneficiaries use the asset itself. The engine short-circuits: `distributionType = NA_DIRECT_USE`, zero payout lines. |
| **FIXED-SHARE JOINT** (public + private) | `shared` + `kind` per line | A **joint** waqf (`type: "joint"`) splits by fixed deed shares between a charitable jiha (`kind: charitable_jiha`) and family branches (`kind: family`). Within the family leg, the ordered/shared rule applies to the family sub-tree. |

**Living / extant.** A beneficiary is "extant" for the ORDERED test if they are alive **and** in scope for this waqf. Death/exit is modelled as an `active: false` beneficiary; the resolver treats inactive members as absent for the extinction test. (Vital-status maintenance lives in the beneficiary registry [BR-201](../brd/06-functional-requirements.md); the engine consumes `active`.)

**Normalisation.** Stipulated weights need not sum to 100 across the *input* set (the deed may enumerate a wider tree). The resolver normalises the **entitled cohort's** weights to a fraction of distributable: `fraction_i = weight_i / Σ(weights of entitled cohort)`. Excluded members contribute 0 to the denominator.

> [!warning] Excluded ≠ withheld
> ORDERED **exclusion** removes a beneficiary from the entitled cohort entirely — they are not owed anything this period and their weight is **not** in the denominator. A Stage-3 **withhold** keeps the beneficiary *in* the cohort with a full entitled amount that is then *retained unpaid*. These are computed at different stages and must never be conflated.

---

## Stage 3 · Gates (who is payable now)

Gates run **after** entitlement. They never change an entitled amount; they set each entitled line's `status` and may raise Authority notices. Every gate records a machine `reasonCode` and human-readable reason ([BR-505](../brd/06-functional-requirements.md): produce statements with basis/evidence).

| Gate | Condition | Effect | Traces to |
|---|---|---|---|
| **KYC freshness** | `verificationStatus ≠ verified`, or `kycLastRefreshed` null, or age > `policy.kycRefreshMonths` (default 12) as of `asOf` | `status = WITHHELD`, `reasonCode = KYC_UNVERIFIED` \| `KYC_STALE`. Amount **retained**; a KYC-refresh task is flagged. | [BR-205](../brd/06-functional-requirements.md); BO Standards Art. 6 |
| **Category not captured** | Beneficiary is a not-yet-identifiable placeholder (`kind: category_only`) **and** `category` is empty | `status = WITHHELD`, `reasonCode = CATEGORY_NOT_CAPTURED`. **Block disbursement until captured.** | [BR-206](../brd/06-functional-requirements.md); BO Standards Art. 5(5) |
| **Licensed-entity check** | Line disburses to a legal entity (`disbursingEntity` present — e.g. a charitable jiha) with `licensed ≠ true` / expired licence | `status = WITHHELD`, `reasonCode = ENTITY_UNLICENSED`. | [BR-505](../brd/06-functional-requirements.md) ("where a legal entity disburses, verify it is licensed"); unified framework §1-3 |
| **Cross-border** | `residency = cross_border` | `status = CROSS_BORDER_PENDING`, routed via the approved cross-border mechanism; an **Authority notice** is queued (`authorityNotices[]`). Not a block — a dedicated path. | [BR-511](../brd/06-functional-requirements.md); Nazarah reg. Art. 10(7) |

Gate **precedence** (a line can trip several; the most restrictive wins for `status`, but *all* tripped flags are recorded in `gateFlags[]`): `CATEGORY_NOT_CAPTURED` → `ENTITY_UNLICENSED` → `KYC_*` → `CROSS_BORDER_PENDING` → `PAID`. A cross-border line that also has stale KYC is `WITHHELD` (KYC), because KYC blocks payment outright whereas cross-border merely routes it.

A line that trips **no** gate is `PAID`. Disbursement executes only via the waqf's **dedicated bank account** — no commingling ([BR-501](../brd/06-functional-requirements.md)); the engine records the target `bankingRefForProceeds` on each PAID line but does **not** move money (that is the worker, post-signature).

---

## Stage 4 · Timing (the 3-month default)

- If the Shart al-Waqif sets a **disbursement schedule**, use it.
- If the Shart is **silent**, ghallah must be distributed **within 3 months of fiscal-year-end** ([unified framework §1-3](../../domain/unified-framework.md): "خلال مدة لا تتجاوز ثلاثة أشهر من نهاية السنة المالية"; [BR-1001](../brd/06-functional-requirements.md)).

This 3-month window is a **calendar-month** span (unlike the 30/15/10 **business-day** statutory filing deadlines, which the [deadline engine](09-compliance-deadline-engine-spec.md) owns). The distribution engine is pure, so both calendars are computed and **injected**:

```
deadlineGregorian = FYE + 3 calendar months
deadlineHijri     = umm-al-qura(FYE) + 3 Hijri months   // via @umalqura/core, injected
```

The engine compares the injected `asOf` against the binding deadline and sets `timing.status = ON_TIME | OVERDUE` with both dates ([BR-1003](../brd/06-functional-requirements.md), [NFR-02](../brd/08-nonfunctional-requirements.md): dual Hijri/Gregorian). `OVERDUE` is a flag surfaced to the compliance dashboard — the engine still computes the run; it does not silently pass or fail.

---

## Stage 5 · Rounding, residual & line assembly

Working in integer halalas, `Σ round(distributable × fraction_i)` can differ from `distributable` by a few halalas. The residual is allocated **deterministically** so the invariant `Σ lines == distributable` holds exactly:

- **Largest-remainder (Hamilton) method.** Compute each line's exact `distributable × fraction_i` as an integer quotient plus a fractional remainder; hand the leftover halalas one at a time to the lines with the **largest fractional remainders**.
- **Tie-break:** ascending `beneficiaryId` (stable, so re-runs are identical).
- Residual is allocated across the **entitled** cohort (PAID + WITHHELD + CROSS_BORDER_PENDING), **not** excluded lines — a withheld beneficiary still gets their exact entitled amount, just unpaid.
- Residual magnitude is bounded: `0 ≤ residual < (number of entitled lines)` halalas.

Each output line carries: `beneficiaryId`, `status`, `entitledMinor`, `sharePercent` (for the statement), `tabaqa`/`line`/`branch` (the entitlement basis), `reasonCode?`, `gateFlags[]`, and `bankingRefForProceeds?`. Totals roll up to `{ paidMinor, withheldMinor, crossBorderMinor, excludedCount }`.

---

## Controls, run lifecycle & audit

The engine is pure; the **run lifecycle** around it enforces the human controls ([BR-506](../brd/06-functional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md), [NFR-08](../brd/08-nonfunctional-requirements.md)):

```
DRAFT ──compute──▶ COMPUTED ──review(≠initiator)──▶ REVIEWED ──Nazir signs──▶ SIGNED ──▶ EXECUTED ──▶ CLOSED
                     │                                                                    │
                     └── every transition: append-only audit event (who/what/when/before/after)
```

- **Segregation of duties (maker ≠ checker):** the user who initiates/computes a run **cannot** be the sole approver. A second authorized user reviews; the **Nazir signs** before execution. Enforced by the auth/access layer ([07 · Access control](10-roles-access-matrix-spec.md)); the engine result carries the `computationTrace` and a content hash so the signer approves a specific, reproducible computation.
- **Per-beneficiary Arabic statement** ([NFR-01](../brd/08-nonfunctional-requirements.md), [BR-505](../brd/06-functional-requirements.md)): name, entitlement basis (ṭabaqa/line/branch, ordered/shared), share %, the gross→distributable waterfall attribution, amount, date, and evidence/transfer ref — rendered in Arabic as the official record, printable via the light theme ([design/DESIGN.md](design/DESIGN.md)). Class-appropriate: Large/Medium get the full statement, Small a simplified one ([BR-902](../brd/06-functional-requirements.md)).
- **computationTrace:** an ordered, human-readable list of every step (each waterfall deduction, each resolver decision with its rule, each gate outcome, each residual allocation). Embedded in the result, persisted with the run, and hashed — this is what makes a run defensible in an audit or dispute.
- **Immutable audit trail** on every state transition and material access ([BR-607](../brd/06-functional-requirements.md)). **No orphaned distributions:** a SIGNED run reconciles to the dedicated-account movements; `paid + withheld == distributable` at all times ([NFR-14](../brd/08-nonfunctional-requirements.md), [BR-611](../brd/06-functional-requirements.md)).

---

## Input / output contract (zod)

Money is a branded `Minor` (integer halalas). Schemas are the source of truth; TS types are inferred.

```ts
import { z } from "zod";

const Minor = z.bigint().brand<"Minor">();            // halalas; 1 SAR = 100n
const Percent01 = z.number().min(0).max(1);           // 0.10 = 10%
const HijriGreg = z.object({ gregorian: z.string().date(), hijri: z.string() });

export const NazirFee = z.object({
  basis: z.enum(["percent_of_revenue", "percent_of_net_income", "retainer"]),
  rate: Percent01.optional(),          // required unless retainer
  fixedAmountMinor: Minor.optional(),  // required iff retainer
});

export const MaintenanceRule = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("fixed"),        amountMinor: Minor }),
  z.object({ kind: z.literal("percent"),      rate: Percent01 }),
  z.object({ kind: z.literal("target_topup"), targetBalanceMinor: Minor, currentBalanceMinor: Minor }),
  z.object({ kind: z.literal("none") }),
]);

export const BeneficiaryInput = z.object({
  id: z.string(),
  kind: z.enum(["family", "charitable_jiha", "category_only"]),
  active: z.boolean().default(true),
  tabaqa: z.number().int().positive().nullable(),      // null for charitable/category
  line: z.enum(["zuhur", "butun", "n/a"]).default("n/a"),
  branch: z.string().optional(),
  stipulatedWeight: z.number().nonnegative(),          // deed share (relative)
  verificationStatus: z.enum(["verified", "pending", "unverified"]),
  kycLastRefreshed: z.string().date().nullable(),
  category: z.string().nullable().default(null),       // for category_only
  residency: z.enum(["domestic", "cross_border"]).default("domestic"),
  disbursingEntity: z.object({ name: z.string(), licensed: z.boolean(),
                               licenceExpiry: z.string().date().nullable() }).optional(),
  bankingRefForProceeds: z.string().nullable().default(null),
});

export const DistributionInput = z.object({
  waqfId: z.string(),
  classification: z.enum(["large", "medium", "small", "direct-utilization"]),
  entitlementOrder: z.enum(["ordered", "shared", "na_direct_use"]),
  waqfType: z.enum(["family_dhurri", "public_charitable", "joint"]),
  period: z.object({ start: z.string().date(), end: z.string().date() }),
  fiscalYearEnd: z.string(),                            // "MM-DD"
  disbursementSchedule: z.enum(["annual", "quarterly", "custom"]).nullable(), // null ⇒ 3-month default
  revenueMinor: Minor,                                  // gross ghallah for the period
  operatingCostMinor: Minor,
  maintenance: MaintenanceRule,
  nazirFee: NazirFee.nullable(),                        // null ⇒ deed silent ⇒ Authority-determination path
  beneficiaries: z.array(BeneficiaryInput),
  asOf: HijriGreg,                                      // injected clock
  deadline: HijriGreg,                                  // injected FYE+3mo (both calendars)
  policy: z.object({ kycRefreshMonths: z.number().int().default(12),
                     roundingUnitMinor: Minor.default(1n) }),
}).strict();

export const DistributionLine = z.object({
  beneficiaryId: z.string(),
  status: z.enum(["PAID", "WITHHELD", "CROSS_BORDER_PENDING", "EXCLUDED"]),
  entitledMinor: Minor,
  sharePercent: z.number(),                             // of distributable, for the statement
  basis: z.object({ tabaqa: z.number().int().nullable(), line: z.string(),
                    branch: z.string().optional(), rule: z.string() }),
  reasonCode: z.string().nullable(),
  gateFlags: z.array(z.string()),
  bankingRefForProceeds: z.string().nullable(),
});

export const DistributionResult = z.object({
  waqfId: z.string(),
  distributionType: z.enum(["MONETARY", "NA_DIRECT_USE"]),
  waterfall: z.object({ revenueMinor: Minor, maintenanceReserveMinor: Minor,
                        operatingCostMinor: Minor, nazirFeeMinor: Minor,
                        distributableMinor: Minor }),
  lines: z.array(DistributionLine),
  totals: z.object({ paidMinor: Minor, withheldMinor: Minor,
                     crossBorderMinor: Minor, excludedCount: z.number().int() }),
  timing: z.object({ status: z.enum(["ON_TIME", "OVERDUE"]),
                     deadline: HijriGreg }),
  authorityNotices: z.array(z.object({ type: z.string(), beneficiaryId: z.string(),
                                       reason: z.string() })),
  flags: z.array(z.string()),                           // e.g. AUTHORITY_FEE_DETERMINATION_PENDING
  computationTrace: z.array(z.string()),
  invariantsChecked: z.array(z.string()),
}).strict();

export function runDistribution(input: z.infer<typeof DistributionInput>)
  : z.infer<typeof DistributionResult>;                 // pure; throws DomainError on invariant breach
```

---

## Invariants

Asserted at runtime (`invariants.ts`) and exercised by property tests. A breach throws a typed `DomainError` — **no partial or negative run is ever emitted**.

| # | Invariant | Statement |
|---|---|---|
| I1 | **Conservation (waterfall)** | `revenue == maintenanceReserve + operatingCost + nazirFee + distributable`. |
| I2 | **Conservation (split)** | `Σ entitledMinor over entitled lines == distributable` (exactly, after residual). |
| I3 | **Payout reconciliation** | `paidMinor + withheldMinor + crossBorderMinor == distributable`; excluded lines contribute `0`. |
| I4 | **No negatives** | Every monetary field `≥ 0`. If `distributable < 0` → throw `DISTRIBUTION_NEGATIVE` (reserve+cost+fee exceed revenue). |
| I5 | **Ordered exclusion** | If `ordered` and any member of ṭabaqa *k* is active & entitled, then every member of ṭabaqa `> k` has `status = EXCLUDED`, `entitledMinor = 0`. |
| I6 | **Withhold-never-reallocates** | Changing a beneficiary's payability (gate result) does **not** change any *other* line's `entitledMinor`. (Payability is orthogonal to the split.) |
| I7 | **Direct-use nullity** | `entitlementOrder = na_direct_use` ⇒ `distributionType = NA_DIRECT_USE`, `lines = []`, no monetary payout. |
| I8 | **Determinism** | `runDistribution(x)` is a pure function: equal inputs ⇒ deep-equal outputs (no clock/RNG/IO). |
| I9 | **Residual bound** | `0 ≤ (Σ naïve-rounded lines vs distributable) < entitledLineCount` halalas; fully absorbed by Hamilton allocation. |

---

## Worked examples (Given / When / Then)

All figures use [sample-waqf.json](../../../data/fixtures/sample-waqf.json) (waqf-001…004). Amounts shown in SAR; the engine computes in halalas. `asOf = 2026-07-14`, `policy.kycRefreshMonths = 12`. Illustrative, fixture-shaped extensions are flagged *(illustrative)*.

### Example A — ORDERED · waqf-001 (family_dhurri, medium)

**Given** revenue `350,000` (rev-001); maintenance reserve `40,000` (exp-e-001); operating `0`; Nazir fee `percent_of_revenue @ 0.10 = 35,000` (fee-001); beneficiaries ben-001 (ṭabaqa 1, Branch A, ẓuhūr, w=12.5, **verified**, KYC 2026-01-15), ben-002 (ṭabaqa 2, Branch A, w=12.5, verified), ben-003 (ṭabaqa 1, Branch B, buṭūn, w=12.5, **pending**, KYC null).

**When** the run computes.

| Waterfall | SAR |
|---|---|
| Revenue (ghallah) | 350,000 |
| − Maintenance reserve (first) | 40,000 |
| − Operating cost | 0 |
| − Nazir fee (ʿushr, 10% of revenue) | 35,000 |
| **= Distributable** | **275,000** |

Resolver (ordered): lowest tier with a living member is **ṭabaqa 1** → ṭabaqa 1 entitled, ṭabaqa 2 excluded. Entitled cohort `{ben-001, ben-003}`, weights `12.5 : 12.5` → `0.5 : 0.5`.

| Line | Entitled | Gate | Status |
|---|---|---|---|
| ben-001 | 137,500 | KYC fresh (6mo) | **PAID** |
| ben-003 | 137,500 | KYC null / pending | **WITHHELD** (`KYC_UNVERIFIED`) |
| ben-002 | 0 | — | **EXCLUDED** (`UPPER_TABAQA_EXTANT`) |

**Then** `paid=137,500`, `withheld=137,500`, `excludedCount=1`; `paid+withheld = 275,000 = distributable` (I3 ✓). ben-003's share is **retained in the waqf account**, a KYC-refresh task is raised, and it is **not** reallocated to ben-001 (I6 ✓). `timing.status = ON_TIME` (deadline 2027-03-31).

### Example B — SHARED · waqf-002 (family_dhurri, small)

**Given** revenue `200,000` *(illustrative — no rev row for waqf-002 in the fixture)*; maintenance `percent @ 0.05 = 10,000`; operating `0`; Nazir fee `10% of revenue = 20,000`; beneficiaries ben-004 (ṭabaqa 1, w=25, **verified**, KYC 2025-12-01) and ben-005 (ṭabaqa 2, w=25, **unverified**, KYC null).

**When** the run computes.

| Waterfall | SAR |
|---|---|
| Revenue | 200,000 |
| − Maintenance reserve | 10,000 |
| − Nazir fee (10%) | 20,000 |
| **= Distributable** | **170,000** |

Resolver (**shared / tashrik**): all living tiers share — **no exclusion**. Cohort `{ben-004, ben-005}`, `0.5 : 0.5`.

| Line | Entitled | Gate | Status |
|---|---|---|---|
| ben-004 | 85,000 | KYC fresh (~7.5mo) | **PAID** |
| ben-005 | 85,000 | unverified | **WITHHELD** (`KYC_UNVERIFIED`) |

**Then** `paid=85,000`, `withheld=85,000`, `excludedCount=0`. The contrast with Example A is the point: here ṭabaqa 2 (ben-005) is **entitled** (shared), not excluded — the block is a *payability* withhold, not an *entitlement* exclusion (I5 vs I6).

### Example C — DIRECT-UTILIZATION · waqf-004

**Given** `classification = direct-utilization`, `entitlementOrder = na_direct_use`; asset-006 is a residential building used directly by the family; any incidental revenue/expense is nil this period.

**When** the run computes.

**Then** the engine short-circuits before the split: `distributionType = NA_DIRECT_USE`, `lines = []`, `distributable = 0` (I7 ✓). A **nil-distribution statement** is still generated for the record, and — per [unified framework §1-2](../../domain/unified-framework.md) — *if* the period had revenue/expenses, the engine records the financial statement while producing **zero payout lines** (beneficiaries benefit from the asset itself, not from ghallah).

### Example D — JOINT (charitable + family) · waqf-003 (large)

**Given** revenue `1,800,000` (rev-002); maintenance reserve `100,000` *(illustrative)*; operating `120,000` (exp-e-003); Nazir fee `10% = 180,000`. Fixed deed split: charitable jiha **40%**, family branches **60%**. Lines: ben-006 (`charitable_jiha`, verified, disbursingEntity licensed), ben-007 *(illustrative, family, Branch A, domestic, verified)*, ben-008 *(illustrative, family, Branch B, **cross-border**, verified)*.

**When** the run computes.

| Waterfall | SAR |
|---|---|
| Revenue | 1,800,000 |
| − Maintenance reserve | 100,000 |
| − Operating cost | 120,000 |
| − Nazir fee (10%) | 180,000 |
| **= Distributable** | **1,400,000** |

Fixed shares of distributable: charitable 40% = `560,000`; family 60% = `840,000`, split Branch A 30% = `420,000`, Branch B 30% = `420,000`.

| Line | Entitled | Gate | Status |
|---|---|---|---|
| ben-006 (jiha) | 560,000 | licensed-entity check → licence valid | **PAID** |
| ben-007 (Branch A) | 420,000 | domestic, KYC fresh | **PAID** |
| ben-008 (Branch B) | 420,000 | cross-border | **CROSS_BORDER_PENDING** + Authority notice |

**Then** `distributable = 560,000 + 420,000 + 420,000 = 1,400,000` (I2 ✓). `authorityNotices` contains a cross-border notice for ben-008 ([BR-511](../brd/06-functional-requirements.md)); it is **routed, not blocked**. Had ben-006's charity licence been expired, that line would be `WITHHELD (ENTITY_UNLICENSED)` and its `560,000` retained.

### Example E — STALE-KYC block (and its edges) · waqf-001

**Given** an **annual** run; ben-001 verified but `kycLastRefreshed = 2025-06-01` (age 13.5 months > 12 → **stale**); ben-003 as in Example A.

**When** the run computes.

**Then** ben-001's line is `WITHHELD (KYC_STALE)` — entitlement unchanged, amount retained, refresh task raised; the run **still computes, is reviewable and signable**, and records the withholding. Variants the engine must handle identically:

- **Category not captured** — a `category_only` beneficiary with empty `category` → `WITHHELD (CATEGORY_NOT_CAPTURED)`; disbursement blocked until captured ([BR-206](../brd/06-functional-requirements.md)).
- **All lines gated** — every entitled line withheld → `paid = 0`, `withheld = distributable`; the run closes as *fully withheld*, nothing disbursed, invariant I3 still holds, alerts raised.
- **Overdue timing** — `asOf` after `deadline` → `timing.status = OVERDUE`; the engine computes anyway and flags for the compliance dashboard (a zero-tolerance-adjacent signal).

---

## Acceptance criteria (Given / When / Then)

**Fee basis — net income (happy).** *Given* `nazirFee = percent_of_net_income @ 0.10`, revenue `100,000`, reserve `10,000`, operating `5,000`; *when* computed; *then* net income `= 85,000`, fee `= 8,500`, distributable `= 76,500` (fee computed on net, deducted at step 3).

**Fee basis — deed silent (edge).** *Given* `nazirFee = null`; *when* computed; *then* `nazirFeeMinor = 0`, `flags` contains `AUTHORITY_FEE_DETERMINATION_PENDING`, and the run is not auto-signable until resolved ([BR-507](../brd/06-functional-requirements.md)).

**Ordered — top tier extinct (edge).** *Given* `ordered` and every ṭabaqa-1 member `active:false`; *when* computed; *then* ṭabaqa 2 becomes the entitled cohort and receives 100% of distributable; ṭabaqa 1 lines are `EXCLUDED` with `reasonCode = TABAQA_EXTINCT`.

**Residual allocation (edge).** *Given* distributable `100.00` split three equal ways; *when* computed; *then* lines are `33.34 / 33.33 / 33.33` (largest-remainder, tie-broken by ascending id), `Σ = 100.00` exactly (I2, I9 ✓).

**Insufficient revenue (error).** *Given* revenue `50,000`, reserve `40,000`, operating `10,000`, fee `5,000`; *when* computed; *then* `distributable` would be `−5,000` → throws `DISTRIBUTION_NEGATIVE`; **no run is produced** (I4).

**No eligible beneficiaries (error/empty).** *Given* every beneficiary excluded or `stipulatedWeight = 0`; *when* computed; *then* `NO_ELIGIBLE_BENEFICIARIES` — distributable is retained (carried forward), the run is flagged, and zero payout lines are emitted (not an exception if distributable is 0; a flag if > 0).

**Zero revenue (empty).** *Given* `revenueMinor = 0`; *when* computed; *then* `distributable = 0`, `lines = []`, a valid **nil run** (I3 holds trivially).

**Malformed shart (error).** *Given* an unrecognised `entitlementOrder` or a joint waqf with no charitable/family split; *when* computed; *then* throws `SHART_INCOMPLETE` — the engine refuses to guess ([BR-103](../brd/06-functional-requirements.md)).

**Determinism (property).** *Given* any valid input run twice; *when* compared; *then* the two `DistributionResult`s (including `computationTrace`) are deep-equal (I8).

---

## Property-based testing (fast-check)

The invariants above are encoded as **fast-check** properties over generated inputs (arbitrary revenues, expense mixes, weight vectors, tree shapes, gate states). Minimum property suite:

- **Conservation:** for any input, `revenue == reserve + operating + fee + distributable` and `Σ entitled == distributable` (I1, I2).
- **Non-negativity:** no negative field ever escapes; negative distributable always throws (I4).
- **Ordered monotonicity:** adding a living upper-tier member never *increases* any lower-tier entitlement (it excludes it) (I5).
- **Withhold isolation:** flipping any single beneficiary's gate result leaves every *other* line's `entitledMinor` unchanged (I6).
- **Residual soundness:** `Σ lines == distributable` and residual `< entitledLineCount` for all weight vectors (I2, I9).
- **Idempotence / determinism:** `run(x)` deep-equals `run(x)` (I8).
- **Direct-use nullity:** `na_direct_use` ⇒ empty monetary lines regardless of revenue (I7).

Shrinking gives minimal counter-examples (e.g. the smallest weight vector that breaks the residual bound), which become regression fixtures.

---

## Open questions

Routed to [16 · Open questions](16-open-questions.md); do not block the build:

- **Maintenance-reserve semantics when the Shart is silent.** Default assumed `none` (no reserve) unless the deed stipulates — confirm vs a prudential minimum. (Relates to [BRD Q2](../brd/10-assumptions-open-questions.md) classification.)
- **Withheld-share expiry.** How long may a withheld share sit before escalation / Authority consultation? Assumed carried indefinitely with recurring alerts; confirm a policy window.
- **Cross-border execution rail.** The approved mechanism and SAMA remittance rules for `CROSS_BORDER_PENDING` payout ([BR-511](../brd/06-functional-requirements.md)) — path is modelled; the concrete rail is TBD with QMULATE.

---

## Requirements covered

**Primary:** [BR-505](../brd/06-functional-requirements.md) (distribution calculation, entitlement order, reserve-first, licensed-entity check, 3-month timing, per-beneficiary statements), [BR-506](../brd/06-functional-requirements.md) (approval / SoD, Nazir signs), [BR-507](../brd/06-functional-requirements.md) (Nazir fee before distribution, configurable basis, default ʿushr), [BR-511](../brd/06-functional-requirements.md) (cross-border path + Authority notice).

**Contributing:** [BR-103](../brd/06-functional-requirements.md) (structured Shart drives the engine), [BR-104](../brd/06-functional-requirements.md) (classification gates direct-utilization & statement depth), [BR-201](../brd/06-functional-requirements.md) / [BR-204](../brd/06-functional-requirements.md) (beneficiary registry + lineage/tier/line as entitlement basis), [BR-205](../brd/06-functional-requirements.md) (KYC freshness gate), [BR-206](../brd/06-functional-requirements.md) (category-not-captured block), [BR-501](../brd/06-functional-requirements.md) (dedicated-account disbursement, no commingling), [BR-607](../brd/06-functional-requirements.md) (audit trail on run lifecycle), [BR-611](../brd/06-functional-requirements.md) (internal financial controls / reconciliation), [BR-902](../brd/06-functional-requirements.md) (class-appropriate statements), [BR-1001](../brd/06-functional-requirements.md) / [BR-1003](../brd/06-functional-requirements.md) (3-month timing, dual calendars).

**Non-functional:** [NFR-01](../brd/08-nonfunctional-requirements.md) (Arabic official statements), [NFR-02](../brd/08-nonfunctional-requirements.md) (Hijri + Gregorian), [NFR-04](../brd/08-nonfunctional-requirements.md) (immutable audit trail + reproducible computationTrace), [NFR-08](../brd/08-nonfunctional-requirements.md) (segregation of duties on money movement), [NFR-13](../brd/08-nonfunctional-requirements.md) (configurable fee basis / KYC & timing windows), [NFR-14](../brd/08-nonfunctional-requirements.md) (data integrity, no orphaned distributions).
