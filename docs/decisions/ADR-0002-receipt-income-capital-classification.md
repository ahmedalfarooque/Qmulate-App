# ADR 0002 — Receipt Income/Capital Classification (the Corpus Guard)

**Status:** **ACCEPTED for Q6(a)–(e) · SIGNATURE OWED · Q6(f)–(i) STILL UNRULED** — structure accepted and built (2026-07-26); the classification **rules** for rent / sale / istibdal / expropriation were **answered by Fadwa (a licensed lawyer with endowment expertise) and designated the authoritative review by the product owner on 2026-08-18, pending formal signature**. The four edge cases in §3's "Left open" column remain **unruled** and are not covered by that review.
**Date:** 2026-07-26 · **rules status updated 2026-08-18 (S6/E5)**
**Deciders:** QMULATE (product owner) + engineering — **rules per the Fadwa review, designated authoritative by the product owner 2026-08-18**
**Scope:** `packages/database` (`Transaction`, the `transaction_*` CHECK constraints, the fixture seed), `packages/domain` (the §08 distribution engine's input contract), and the E5/E6 finance + distribution modules.
**Relates to:** [ADR — Ledger system of record](ADR-ledger-system-of-record.md) · [Sharia review brief §3.2, Q6](../sharia-review-brief.md) · [BR-502](../product/brd/06-functional-requirements.md) · [BR-505](../product/brd/06-functional-requirements.md) · [§07 Data model](../product/prd/07-data-model-spec.md) · [§08 Distribution engine](../product/prd/08-distribution-engine-spec.md) · [Build plan S1/S6](../product/prd/BUILD-PLAN.md) · CLAUDE.md Binding rule 1
**Classification:** Privileged & Confidential — internal

> Second record filed under `docs/decisions/`, after [ADR — Ledger system of record](ADR-ledger-system-of-record.md). It implements the classification duty that ADR assigns to the platform (§3, row 1) and closes the enforcement gap the Sharia brief admits at §3.2.

---

## Decision (in one line)

**Every receipt is classified income-vs-capital *at entry*. Only `type = REVENUE AND receiptClass = INCOME` may enter the distribution waterfall. Capital receipts — sale proceeds, istibdal proceeds, expropriation compensation — are corpus (*aṣl* / أصل) and are structurally blocked from distribution by database CHECK constraints, not by application discipline. The *structure* is decided; the *per-receipt-type rules* are not, and remain a fiqh question awaiting sign-off.**

```
   RECEIPT ENTRY                    CLASSIFICATION            DOWNSTREAM
   ┌──────────────┐   required at   ┌──────────────┐
   │ Transaction  │ ───────────────▶│ receiptClass │
   │ type=REVENUE │   (DB CHECK)    │  = INCOME    │──────▶  ghallah · غلة
   └──────────────┘                 │              │         ENTERS the waterfall
                                    │  = CAPITAL   │──╳───▶  asl · أصل
                                    │  + source    │         BLOCKED · returns to corpus
                                    └──────────────┘
   ┌──────────────┐
   │ type=EXPENSE │ ──▶ receiptClass MUST be NULL (an outflow is neither ghallah nor aṣl inflow)
   └──────────────┘
```

The `╳` is a database constraint plus a query contract, **not** a code comment. The distribution engine's only legal input set is served by a dedicated index — `@@index([waqfId, type, receiptClass, date])`.

---

## 1. Context — the gap this closes

CLAUDE.md **Binding rule 1** states the invariant: corpus (*aṣl* / أصل) and income (*ghallah* / غلة) are distinct and never mixed; only income-class receipts may enter the distribution waterfall; capital receipts — explicitly sale and **istibdal** (substitution) proceeds — are corpus and are blocked from distribution; a non-diminution-of-corpus invariant always holds.

The system did not enforce it. Three sources say so independently:

- **[§07](../product/prd/07-data-model-spec.md)** models finance as `Transaction { TxnType REVENUE | EXPENSE; category; amountSar; … }`. There is **no field that classifies a receipt as income vs capital.** Nothing in the schema distinguishes a month's rent from the proceeds of selling the building.
- **[§08](../product/prd/08-distribution-engine-spec.md)** consumes a figure labelled "gross revenue" and *assumes* it is pure income.
- The **[Sharia review brief §3.2](../sharia-review-brief.md)** says it in the plainest terms available: the income-vs-capital principle is "a stated principle that the software does not yet enforce… There is nothing yet in the system that would stop, say, sale proceeds from being fed in as distributable yield."

[ADR — Ledger system of record](ADR-ledger-system-of-record.md) §3 assigns receipt classification and the corpus non-diminution invariant to the **platform** and says (§5) they are **never delegated** to the external accounting system — Wafeq *represents* the split in account classes, but representation is not enforcement. That ADR therefore names a platform duty for which the platform had no mechanism.

The [build plan](../product/prd/BUILD-PLAN.md) folds the `Transaction` income-vs-capital field into **Sprint 1 (E0+E1)** and records the corpus guard as **"fiqh-cleared *provisionally* (Sharia review, unsigned)"** — safe to build the invariant against the fixture; per-receipt classification needs sign-off **before real data**. This ADR builds exactly that much and no more.

## 2. Decision & rationale

**Classify at entry; enforce in the database; decide the structure now and the rules later.**

The reasoning turns on separating two things that look like one:

1. **"Corpus and income are different classes and only income is distributable" is a structural invariant.** It does not depend on any contested ruling. Every source — Binding rule 1, the ledger ADR, the Sharia brief's own framing at §3.2(a) — states it identically. It is safe to build today.
2. **"This particular receipt is income" is a fiqh judgement.** Rent is uncontested. Beyond rent, the classification of concrete receipt types is precisely what [Q6 of the Sharia brief](../sharia-review-brief.md) asks a scholar to rule on, item by item. It is **not** safe to hardcode today.
3. **A nullable enum plus conditional CHECK constraints expresses (1) without pre-empting (2).** The schema forces *that* a classification exists and is coherent; it takes no position on *which* class any given receipt type belongs to. Adding a receipt type later is a data decision, not a migration.

Enforcement lives in the database rather than the application because the guard's whole purpose is to survive the paths application code does not control — a backfill, a migration, a support script, a future epic's bulk import. A guard that only a well-behaved `create()` respects is not an invariant; it is a convention.

**Rejected alternative — `receiptClass` NOT NULL.** An `EXPENSE` is an outflow: it is neither *ghallah* nor an *aṣl* inflow. `NOT NULL` would force a meaningless value on roughly half the table and would make "unclassified" indistinguishable from "classified as the default." Nullable + a conditional CHECK expresses exactly "required for `REVENUE`, forbidden for `EXPENSE`."

**Rejected alternative — classify at distribution time.** Deferring classification to the moment of a run means the judgement is made by whoever happens to launch the run, months after the person who saw the bank statement and the contract. Classification is an act of bookkeeping evidence, not of calculation; it belongs at entry, where the evidence is.

## 3. What is decided, and what is explicitly not

| | Decided here | Left open |
|---|---|---|
| **Structure** | Corpus and income are distinct classes; every `REVENUE` receipt carries one; a `CAPITAL` receipt always names its source; the waterfall's only legal input is `REVENUE + INCOME`. | — |
| **Enforcement point** | Database CHECK constraints + the engine's input query. | — |
| **Rules** | Rent / operating returns = `INCOME`. Uncontested; it is the one classification every source agrees on and the only one the fixture seed asserts. | **Everything else.** Sale proceeds, istibdal proceeds, expropriation compensation are *modelled as* `CapitalSource` values — the model does not thereby rule that they are capital. |
| **Edge cases** | — | Lease premium / key money; insurance proceeds for a destroyed building; rent arrears collected after an istibdal (old corpus or new?); whether a *ṣiyāna* reserve funded from income becomes corpus once accumulated. |
| **Entity shape** | `CAPITAL` receipts are `Transaction` rows in S1. | Whether a capital receipt should instead be a separate `CorpusMovement` entity — the operational-COA follow-up the ledger ADR requires (§7 of that ADR, due in E5/S6). |

**The fiqh question, and where it now stands** (CLAUDE.md Binding rule 4): *the per-receipt-type income-vs-capital classification rules.* The ledger ADR §3 asserts rent = income, sale/istibdal proceeds = capital, expropriation compensation = capital, citing a Sharia review that the [build plan](../product/prd/BUILD-PLAN.md) recorded as **unsigned**. Those assertions are exactly [Q6(a)–(e)](../sharia-review-brief.md).

✓ **Answered 2026-08-18.** Fadwa's review — designated authoritative by the product owner, formal signature owed — confirms them, with expropriation compensation ruled **usually** capital rather than flatly so. The ledger ADR §3's wording is therefore no longer an overstatement of the position; it is now backed by an attributed review, and the qualifier *"usually"* is the one word that must survive any restatement of it.

⚠ **Unchanged: the four edge cases below are UNRULED and cannot be given a subject.** No account, enum value, fixture row or seed entry may pick an answer for key money, insurance proceeds, post-istibdal arrears or an income-funded ṣiyāna reserve. **The ruling precedes the record**, and until it exists these receipt types simply have nowhere to be recorded — which is the correct state, not a defect to be engineered around.

> ### Provenance — RESOLVED 2026-08-18, and the resolution came from the owner, not from the file
>
> This block used to be four escalating warnings against citing an unattributed document. They are kept
> below in compressed form, because the discipline they record is the reason this ADR is safe to move now.
>
> **The history.** An answered copy appeared in the working tree, untracked (`Sharia Review Brief_answered.docx`);
> it then left the repository without a trace, having never been tracked; a copy was then reported to exist in
> a Teams-chat OneDrive folder. At every one of those stages this record refused to move: *"a document of
> unknown authorship agreeing with what we built is not a confirmation — agreement is the easiest thing for
> an unattributed document to do."* That refusal was correct and is not being walked back.
>
> ✓ **WHAT CHANGED: THE PRODUCT OWNER ATTRIBUTED IT.** Per the S4 owner-decision memo, Q-E5-4/5 (2026-08-18),
> the answers in `Sharia Review Brief (1)__.docx` (OneDrive/Teams chat files, modified 2026-07-26) were written
> by **Fadwa — a licensed lawyer with endowment expertise** — and the owner **designates them the authoritative
> review pending formal signature**. Provenance was never going to come from reading the file harder; it could
> only ever come from the person who commissioned it. It has.
>
> **So the rules for [Q6(a)–(e)](../sharia-review-brief.md) are now ruled:** rent = INCOME; sale proceeds =
> CAPITAL; istibdal proceeds = CAPITAL; expropriation compensation = **usually** CAPITAL; non-diminution
> absolute. That is what §4's structure was built to carry, and it is what the fixture already seeds.
>
> ⚠ **THREE THINGS THIS DOES NOT DO.**
> 1. **It does not rule Q6(f)–(i)** — key money · insurance proceeds · post-istibdal arrears · income-funded
>    ṣiyāna reserve. Those were added to the brief on **2026-08-18**, after the answered copy was written
>    (2026-07-26). No review of that date could have reached them. They stay in §3's "Left open" column, and
>    the note below still binds: **the ruling must precede the record.**
> 2. **It does not make this session a reader of that file.** The `.docx` is **not in this repository and this
>    session has not opened it.** Everything above comes from the owner's written ruling in the memo. Questions
>    the memo does not enumerate (Q4, Q7, Q9, Q11, Q12) are **not** claimed here as answered — their status is
>    "covered by a review nobody in-repo has read." The owner has been asked to place the artifact in
>    `docs/product/` so each answer can be read against its question; **nothing may be transcribed from memory.**
> 3. **It does not convert the lawyer's review into a scholar's فتوى.** The brief was addressed to a waqf-fiqh
>    scholar for a مراجعة شرعية; the answers are a licensed endowment lawyer's. Whether a separate scholar's
>    فتوى is sought on top is the owner's discretion, not a blocker — but the record keeps the distinction.
>
> ⚠ **One answer of Fadwa's is reported to DISAGREE with shipped behaviour and has NOT been acted on.** On
> [Q3](../sharia-review-brief.md) (maintenance when the deed is silent) the review is reported to say the Nazir
> *"may reserve a reasonable amount if needed"*, where the engine defaults to **zero reserve**. This ADR records
> that as a **reconciliation owed** and changes nothing: "may reserve a reasonable amount if needed" is a
> discretion, and turning a discretion into an automated default is exactly the guess §2 of the brief forbids.
> The design goes to the product owner (Binding rule 4) before any line of the waterfall moves.

> ⊕ **AND THE FOUR EDGE CASES IN THE TABLE BELOW WERE NEVER ASKED (found 2026-08-18, S6/E5).** They are listed here as "Left open" and have been since 2026-07-26 — but `docs/sharia-review-brief.md` **Q6 asks only (a) rent, (b) sale proceeds, (c) istibdal proceeds, (d) expropriation compensation, (e) non-diminution.** None of the four reaches the scholar. So "the Sharia review is unsigned" understates the position: even a signed Q6 would leave these unruled. They are now added to the brief as **Q6(f)–(i)**.
>
> ⚠ **AND THEY CANNOT BE GIVEN FIXTURE SUBJECTS FIRST.** Every `REVENUE` receipt must carry a classification at entry (the CHECK below makes an unclassified one unrepresentable), so seeding a worked example of "key money" requires choosing INCOME or CAPITAL — which is the question. **The ruling must precede the record.** Stated because the natural instinct is to build the subject and then ask about it, and here that instinct answers the question by accident.

## 4. Enforcement — where the guard actually lives

**4.1 Schema.** `Transaction` gains three columns and two enums ([`packages/database/prisma/schema.prisma`](../../packages/database/prisma/schema.prisma)):

| Column / enum | Shape | Purpose |
|---|---|---|
| `receiptClass` | `ReceiptClass?` = `INCOME \| CAPITAL` | The classification. Required for `REVENUE`, forbidden for `EXPENSE`. |
| `capitalSource` | `CapitalSource?` = `SALE_PROCEEDS \| ISTIBDAL_PROCEEDS \| EXPROPRIATION_COMPENSATION \| OTHER` | Required when `CAPITAL`; forbidden when `INCOME`. A capital receipt always says where it came from. |
| `capitalSourceNoteAr` | `String?` | Arabic-authoritative justification ([NFR-01](../product/brd/08-nonfunctional-requirements.md)); required when `capitalSource = OTHER`. `OTHER` must never be a silent bucket. |
| index | `@@index([waqfId, type, receiptClass, date])` | The "income-only waterfall" index — the engine's sole legal input set, served directly. |

**4.2 The seven CHECK constraints.** Prisma's schema language has no CHECK DSL, so these are hand-authored SQL in the constraints migration (see [`packages/database/README.md`](../../packages/database/README.md) for how not to clobber it). All are idempotent and re-runnable.

| Constraint | Asserts |
|---|---|
| `transaction_revenue_requires_receipt_class` | A `REVENUE` row cannot exist unclassified. |
| `transaction_expense_has_no_receipt_class` | An `EXPENSE` carries neither `receiptClass` nor `capitalSource`. |
| `transaction_expense_requires_category` | An `EXPENSE` names its `expenseCategory`. |
| `transaction_capital_requires_source` | A `CAPITAL` receipt names its `capitalSource`. |
| `transaction_income_has_no_capital_source` | An `INCOME` receipt cannot carry a capital source. |
| `transaction_capital_other_requires_note` | `capitalSource = OTHER` requires the Arabic note. |
| `transaction_amount_nonnegative` | No negative amounts (sign is carried by `type`, never by the amount). |

**4.3 What is *not* constrained at the database, deliberately.** There is **no** money-conservation CHECK on `Distribution` (`reserve + operating + nazirFee + paid + withheld == grossRevenue`). Conservation is a [§08](../product/prd/08-distribution-engine-spec.md) **engine** invariant (I1), and the fixture's own historical `dist-001` row violates it — a database CHECK would make the fixture unseedable and would convert a data-quality finding into a build failure. The discrepancy is instead recorded in that row's `computationTrace`. See §6.

**4.4 Seed posture.** The fixture seed classifies **only** the two rent receipts (`rev-001`, `rev-002`) as `INCOME`. No other receipt type is classified anywhere in Sprint 1; the seed carries a `TODO(surface)` at the classification site. This is the minimum that lets the fixture load without asserting a single contested ruling.

## 5. Non-negotiable

**The corpus non-diminution invariant holds regardless of the outcome of the fiqh question.** Whatever a scholar rules about *which* receipts are capital, no operation may distribute, erode, or reclassify corpus as income. A ruling can move a receipt type from one class to the other; it cannot make corpus distributable. Consistent with [ADR — Ledger system of record §5](ADR-ledger-system-of-record.md), this invariant is the **platform's** duty and is never delegated to the accounting book of record.

> ### ⚠ CORRECTION (2026-07-29) — this sentence said "is enforced in the platform". It was not true.
>
> The original wording claimed enforcement. S2's round-5 adversarial verification measured the opposite:
> **corpus→income reclassification of an already-committed receipt is UNENFORCED** — both at raw SQL
> (where it is also unaudited) and through the ordinary scoped Prisma delegate. Nothing prevents a
> committed `CAPITAL` receipt from being flipped to `INCOME`, after which it is eligible for the
> distribution waterfall. So the *classification* is mandatory at entry (the database CHECK on every
> `REVENUE` row, which is what this ADR actually delivered) but the *immutability of that classification
> afterwards* was never built.
>
> **What is true today:** every receipt must carry a class at entry, and that CHECK is live and tested.
> **What is not:** the class cannot be trusted not to change afterwards.
>
> Enforcement is logged as **E5/E6 scope** (product-owner decision, 2026-07-29) — that is where the
> financial core and the receipt path are built, and building the guard here would mean enforcing a rule
> whose *content* is still awaiting Sharia sign-off. The interim protection is
> [ADR-0008](ADR-0008-authorization-plane-admission-control.md)'s hard gate: **no real client data in any
> environment**, so no real receipt can be reclassified in the meantime.
>
> Recorded plainly because this is the fifth claim in this sprint's decision records that asserted a
> property the code did not have. The pattern each time: prose stating an enforcement, with no test
> comparing the sentence to the schema. **A decision record is not a specification — if it says
> "enforced", something must fail when the enforcement is removed.**

## 6. Consequences

**Gains:**
- Binding rule 1 stops being prose and becomes a constraint. The §3.2 gap the Sharia brief names honestly is closed **structurally** in Sprint 1 rather than at E5/S6.
- The distribution engine gets a *typed* input contract: it reads `REVENUE + INCOME` and nothing else, so "the engine assumed the figure was pure income" ceases to be a possible failure mode.
- The open fiqh question is now **localised to data**, not scattered through code. A scholar's ruling becomes a classification decision (and, where a historical row was mis-filed, a corrected row) — not a schema migration.
- `CAPITAL` receipts remain visible and auditable rather than being excluded from the ledger to keep them out of the waterfall.

**Costs and dependencies:**
- **Two write paths must now supply a classification** — the finance UI (E5/S6) and any importer (E11/S12). An importer that cannot classify must fail, not default.
- **`OTHER` is a pressure valve.** It requires an Arabic note, but a high `OTHER` count is a signal that the enum is wrong. Monitor it; do not let it become the common case.
- **The fixture's `dist-001` inconsistency is now explicit.** Seeded as a historical record with the discrepancy in `computationTrace`, it is a standing question: is the fixture wrong, or is ordered exclusion narrower than §08 invariant I5 states? *(Fiqh + data question — surfaced, not resolved.)*
- **This is not the operational chart of accounts.** [ADR — Ledger system of record §7](ADR-ledger-system-of-record.md) requires a per-endowment/per-property operational COA with explicit corpus/income **account classes** before E5/E6. `receiptClass` satisfies Binding rule 1 *structurally*; it does **not** discharge that requirement, and Sprint 1 must not be recorded as having closed it.
- **Reversals and corrections are undefined.** How a mis-classified receipt is corrected — a reclassification event with maker-checker, versus a reversing entry — is not decided here and must be before real data lands.

**Unverified figures touched by this decision** *(⚠ unverified — confirm vs primary law; each lives in a `Setting`, never a constant)*: the **10-business-day** Authority notice window for istibdal (`deadline.ISTIBDAL_10BD.businessDays`), which is why the fixture's `notificationDeadlineBusinessDays: 10` is deliberately **not** a column; and the **10% of revenue** (*ʿushr*) deed-set Nazir fee that the waterfall deducts before distribution, which is contractual, not statutory, and is a different thing from the Authority's own **≤10% of net income** fee.

## 7. What would change this decision

Listed so that a future reader can tell a settled record from a provisional one:

1. ✓ **HAPPENED, 2026-08-18 — a ruling on [Q6(a)–(e)](../sharia-review-brief.md), attributed and designated authoritative.** It agrees with the ledger ADR's assumption on all four receipt types (expropriation compensation qualified as *usually* capital), so the *rules* did not have to change and **the structure did not change** — which was the prediction this row made and is the reason §4 was safe to build first. What is still owed is the **formal signature**, and a written ruling on **Q6(f)–(i)**, which no review of 2026-07-26 could have reached.
2. **A ruling that some capital receipt is conditionally distributable** (e.g. a stipulated *istibdal* surplus). That would break the flat two-class model and require a third state or a per-receipt authorisation — a genuine redesign, and the one outcome that would supersede this ADR rather than complete it.
3. **A receipt type that fits no `CapitalSource` value** and recurs. Extend the enum; do not lean on `OTHER`.
4. **The operational COA landing in E5/S6.** If `CorpusMovement` becomes a first-class entity, `receiptClass` on `Transaction` may become a projection of the account class rather than the primary record. This ADR would then be *updated*, not reversed — the invariant survives the refactor.
5. **Counsel advice that expropriation compensation has a statutory treatment** distinct from the fiqh classification. That would split one column into two concepts (fiqh class vs statutory treatment).

## 8. Supersedes / updates

- **Implements** [ADR — Ledger system of record](ADR-ledger-system-of-record.md) §3 (row 1, "receipt classification — Platform") and §5 (the non-delegated corpus invariant), which named the duty but supplied no mechanism. That ADR's §3 wording *"Fiqh basis now confirmed per the Sharia review"* **overstates the position** — the review is unsigned; read it as *provisionally assumed*, per §3 above and the build plan's own risk note.
- **Updates [§07 data model](../product/prd/07-data-model-spec.md):** `Transaction` gains `receiptClass`, `capitalSource`, `capitalSourceNoteAr` and the income-only index. §07's revenue/expense stub remains **insufficient** as the eventual substrate (see §6) — that finding stands.
- **Updates [§08 distribution engine](../product/prd/08-distribution-engine-spec.md):** the engine's input is no longer "gross revenue" but the `REVENUE + INCOME` set. §08's prose should be amended to say so.
- **Closes** the CLAUDE.md known-inconsistency **#8** ("no corpus/income segregation or capital-receipt guard in the model") **structurally**. The classification *rules* remain open under Binding rule 4.
- **Does not change** CLAUDE.md Binding rule 1 — it supplies the first enforcement of it.

---

### Note on remaining trackers

This ADR decides how receipts are classified and where the corpus guard is enforced. Of the five things it originally disclaimed, two have since moved and are recorded here so the list is not read as still current:

- **(a) The Sharia questions.** ✓ **[Q6(a)–(e)] answered** by the Fadwa review, designated authoritative by the product owner 2026-08-18, formal signature owed. ⚠ **Q6(f)–(i) and Q10 (zakat) remain open**, and the questions the owner's memo does not enumerate (Q4, Q7, Q9, Q11, Q12) are covered by a review **nobody in-repo has read** — not claimed here. ⚠ **Q3's reported answer disagrees with the engine's zero-default and has deliberately not been acted on** (see the provenance block above).
- **(b) The operational chart of accounts** the ledger ADR requires before E5/E6 — **built in S6/E5**, around the classifications that exist. Q6(f)–(i) deliberately get **no account**: an account is a place to record something, and creating one is picking an answer.
- **(c) The correction/reversal path for a mis-classified receipt** — ✓ **decided by the product owner 2026-08-18** (S4 memo, Q-E5-1(b)): a correction flow exists in **both directions**, **every** correction is reserved-matter-gated, and it is a **superseding record** (reversal + re-entry, both audited), **never an edit**. The database column guard from migration 19 is unchanged by it — the flow adds records, it does not open the column.
- **(d) The fixture's `dist-001` inconsistency** — still open.
- **(e) Verification of the ⚠ figures against primary Saudi law** — still open (Binding rule 3).
