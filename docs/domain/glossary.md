# Endowment glossary

The canonical domain vocabulary for QMULATE's waqf/Nazarah work. Two parts:

- **A — Authority official terms:** definitions from the **General Authority for Awqaf's** endowment-terms
  knowledge center (`awqaf.gov.sa/ar/knowledge-center/endowment-terms`). Faithful English renderings; the
  Arabic term is authoritative.
- **B — Generational layers & order of entitlement:** ظهور / بطون / طبقات and the entitlement-ordering
  concepts. **These are standard Awqaf/fiqh usage** — the Authority's public glossary does **not** list
  them — so they're flagged for verbatim reconciliation if the Authority later publishes them. They matter
  because they determine **who is eligible** and **how ghallah is shared**, via the [[Shart al-Waqif]].

> Cross-refs point to the Obsidian vault notes and the regulation summaries in
> [`regulations/`](regulations/). See also `CLAUDE.md` (domain glossary) and the BRD appendix.

---

## A. Authority official terms

| Term (AR) | English | Definition |
|---|---|---|
| الوقف | Waqf | Restricting the disposition of an asset and donating its benefit in the way of God (حبس الأصل والتبرع بالمنفعة). |
| الواقف | Waqif | The person who establishes the waqf. |
| الموقوف عليه | Beneficiary (Mustahiq) | The party/parties entitled to benefit from the waqf's yield; one of the waqf's pillars — must be a charitable purpose (جهة بر). |
| شرط الواقف | Shart al-Waqif | The waqif's stipulated terms regarding the waqf, its yield, disbursement channel, Nazir, and beneficiaries. |
| الصيغة الوقفية | Waqf formula | The wording the waqif uses to express the waqf's terms. |
| الأركان الأساسية للوقف | Pillars of the waqf | The waqf (the withheld asset), the **formula** (wording showing intent), the **endowed asset itself** (العين الموقوفة), and the **beneficiary** (الموقوف عليه). |
| وثيقة الوقف | Waqf document (deed) | The instrument recording the waqf contract and its conditions, identifying the endowed asset, beneficiaries, and Nazir. (= [[Sakk al-Waqfiyya]].) |
| الأصل | Asl (corpus / preserved principal) | The **endowed principal**: the asset itself and any capital standing in its place. The waqf definition above is literally "withholding the *asl* and donating the benefit" (حبس الأصل والتبرع بالمنفعة) — so *asl* is the thing withheld and **ghallah** is the benefit given. It is **never distributed**; a non-diminution invariant holds. **Sale and [[Istibdal]] proceeds are *asl*, not income**, and flow back into corpus. Paired with **ghallah** below; the two are never mixed. *(Not a separate Authority glossary headword — it is the الأصل of the Authority's own waqf definition, named here because the software needs an unambiguous term: English "principal" is already taken by the Family Board (Principal) role.)* |
| ريع الوقف | Waqf yield (rei) | The income/produce of the endowed asset; also called **ghallah** (غلة) or إيراد. The **only** class of receipt that may enter the distribution waterfall — see **الأصل / asl** above. |
| عوائد الوقف | Waqf returns | Income generated from operating, developing, and investing the endowed assets. |
| مصرف ريع الوقف | Disbursement channel | The destination(s) to which waqf yield is directed per the waqif's stipulation. |
| النظارة | Nazarah | The actions the Nazir takes to preserve, develop, repair the waqf and disburse its yield in its interest, per the shart. |
| الناظر | Nazir | The natural or legal person charged with managing the waqf's affairs and executing the shart. |
| صيانة الوقف | Maintenance of the waqf | Works the waqif stipulates to keep the waqf sustainable; **takes priority over any other disbursement.** |
| شروط استبدال الوقف | Substitution (istibdal) conditions | (1) a genuine interest is served, (2) no suspicion or favoritism, (3) the replacement is not lower in value or yield, (4) prompt purchase of the replacement, (5) approval of the competent authority or a valid Sharia fatwa. |
| الفرق بين الوقف والوصية | Waqf vs. will (wasiyya) | A waqf transfers ownership to God with its benefit spent on charity; a will is a bequest effective only after death. |
| الوقف العام (الخيري) | Public (charitable) waqf | Dedicated to general charitable causes (e.g. orphan care). |
| الوقف الخاص (الأهلي/الذري) | Private (family / dhurri) waqf | Dedicated to the waqif's descendants or specified persons. **It may also record where it goes once that line ends** — see **مآل الوقف** below; a recorded charitable ultimate taker does not make the endowment charitable while the family lives. |
| الوقف المشترك | Joint (in the sense of *both kinds together*) | **An Authority OVERSIGHT CATEGORY spanning both kinds of endowment — the public/charitable and the private/family — NOT a single endowment that combines them.** Awqaf Law **Art. 4** uses it in exactly this sense: the Authority oversees "all public, private (family), and joint" endowments, i.e. both kinds. **A given waqf is either خيري or ذري, never both** (product owner, a practising Nazir, 2026-08-03: *"it just means that there are 2 types of endowments/waqf, but a waqf cannot be both"*), which is why the distribution engine **refuses** `waqfType: 'JOINT'` and any cohort mixing a charitable jiha with a family beneficiary ([ADR-0009](../decisions/ADR-0009-lineage-entitlement-and-no-joint-waqf.md) decision 3 + amendment B). ⚠ **This row previously read "combines public and private terms (e.g. part of the yield to descendants, part to charity)" and was the drifted side of a recorded contradiction with Art. 4** — resolved 2026-08-03; there was never a contradiction. CLAUDE.md register item **#11** is closed. One caveat and no more: this is the **product's** position from a practising Nazir rather than Saudi counsel, so a legal filing turning on المشترك should still go to counsel — that does not reopen it. ⚠ **A ذري waqf that names a charity as its ultimate taker (see مآل الوقف above) is NOT مشترك**, and the engine's refusal narrowed accordingly on 2026-08-10 (R7): the charity takes only once the bloodline is over, so the two never share a period's غلة. A charity paid **alongside** living descendants is what remains refused. |
| مآل الوقف | Reversion / the waqf's ultimate destination (**the ultimate taker**) | Where the endowment's benefit goes **once its beneficiary class comes to an end** — classically, a family (ذري) waqf whose line of descent dies out reverts to a charitable purpose. **The product owner (a practising [[Nazir]]) ruled on 2026-08-10 that a وقف ذري MAY record a charitable jiha as its ultimate taker:** in their words, *"a waqf ذري may eventually (according to the regulatory mandate) end up at a charity once ALL descendants are dead and the bloodline is over."* ⚠ **This does not make the waqf مشترك and does not weaken the one-nature rule** — the charity **receives nothing while any descendant lives** and so never shares a period with the bloodline; the endowment is ذري while the family lives. In the engine the appointment must be a **recorded deed clause** (a waqf-level reversion naming the beneficiary ids), is **never inferred** from a charity's presence in the register, and a charity on a ذري deed that the clause does not name is **refused**. When it triggers, the taker's share is its **deed-stipulated weight, not a per-capita head share** — a charity is not a head of a bloodline. *(Standard fiqh/Awqaf usage, **not** an Authority-published headword here; recorded because the software must hold it. [ADR-0009 amendment E](../decisions/ADR-0009-lineage-entitlement-and-no-joint-waqf.md).)* ⚠ **Open fiqh question, not resolved:** whether *"the bloodline is over"* means **no living descendant** or **no line that still continues** — under ظهور فقط a waqif with only daughters can have living blood descendants whose line the deed does not continue. The engine builds the first reading and **retains** the income in the second, saying so on the run. |
| الأوقاف العينية | In-kind waqfs | Specific assets withheld in themselves (e.g. real estate); also includes usufructs and intangible rights. |
| الأوقاف القيمية | Value (monetary) waqfs | Waqfs where the waqif intends to invest and grow the asset commercially rather than freeze it (e.g. cash waqf, company shares). |
| الأوقاف الصغيرة | Small waqfs | Endowed-asset value **< SAR 50M**. |
| الأوقاف المتوسطة | Medium waqfs | Endowed-asset value **SAR 50M – 200M**. |
| الأوقاف الكبيرة | Large waqfs | Endowed-asset value **≥ SAR 200M**. |
| المنتجات الوقفية | Waqf products | Developmental waqf funds, waqf investment funds, waqf sukuk, and waqf investment portfolios. |
| الصناديق الاستثمارية الوقفية | Waqf investment funds | Open-ended funds whose units are endowed (non-tradable, open to all); yield goes to eligible beneficiaries per Authority rules. |
| الصناديق الاستثمارية | Investment funds | Collective-investment vehicles; investors share in returns; managed for a fee or profit share. |
| العهد المالية | Financial trust (escrow) | An amount handed from a "settlor" to a "trustee" to hold/invest for a third-party beneficiary, temporarily or permanently. |
| وثائق التملك | Ownership documents | Old title documents that usually need formal renewal and issuance of a fresh, independent deed (حجة). |
| العُشر | ʿUshr (customary Nazir fee) | Literally "a tenth." The customary Nazir-remuneration rate; **this engagement's deed sets 10% of _revenue_**. *Customary/fiqh usage — **not** an Authority-published term; the figure is deed-set and **unverified** vs primary law (see `CLAUDE.md` staleness rule). Distinct from the Awqaf Law's separate ≤10%-of-net-income Authority fee.* |

> [!note] Reconciliation with the regulations
> The Authority's **value-based classification** (small/medium/large by SAR thresholds) matches the
> [Nazarah regulation](regulations/nazarah-regulation-en.md) Art. 1. **istibdal conditions** here enrich
> Art. 12 (and the [[Expropriation]] workflow). **Maintenance-priority** and **disbursement-channel**
> feed the distribution rules (Art. 13). **Waqf products** connect to Art. 16 investment and the
> [investment-products stub](regulations/waqf-investment-products.md).

---

## B. Generational layers & order of entitlement (standard Awqaf/fiqh usage)

> [!warning] Sourcing
> These terms are **not** in the Authority's public glossary; definitions below reflect established
> Awqaf/fiqh usage (see fatwa references). Flagged for verbatim reconciliation if the Authority publishes
> them. They are essential to modeling eligibility correctly.

> [!important] The operative rule is the product owner's, not the classical gloss — [ADR-0009](../decisions/ADR-0009-lineage-entitlement-and-no-joint-waqf.md)
> Updated **2026-08-03** from the product owner, a practising [[Nazir]]. Two things changed, and the
> classical definitions below are kept because they are still what the *words* mean — they are simply no
> longer the *eligibility rule*:
>
> 1. **طبقة (ṭabaqa) is NOT an exclusion key.** The generational level is tied to family-name
>    **eligibility**, not to precedence. A generation's death does **not** block the next generation:
>    when a descendant dies, their own descendants **continue** as beneficiaries by blood connection.
>    Verbatim: *"The generational level of the beneficiary is only tied to the family name as an
>    eligibility to be beneficiary."*
> 2. **ظهور / بطون are the substantive eligibility fact**, not classificatory labels. Which of the two
>    lines a deed continues is a **closed two-value** deed term with **no default** (next table).
>
> 3. **And a family waqf may record where it goes when the family ends** — مآل الوقف (Part A). A charitable
>    ultimate taker receives **nothing while any descendant lives**; it is a deed clause that must be
>    **recorded**, never inferred, and its share is a **deed weight rather than a per-capita head share**
>    (product owner, 2026-08-10 — ADR-0009 amendment E).
>
> **الأعلى فالأعلى (ordered) is therefore the opt-in exception, not the norm** — it applies only where the
> deed explicitly stipulates tier-exclusion. Where the deed is silent or unreadable the engine
> **refuses** (`SHART_INCOMPLETE`) rather than defaulting — [[Shart al-Waqif]] is immutable and its
> meaning is not something code may choose (CLAUDE.md binding rule 1).

| Term (AR) | English | Definition & why it matters |
|---|---|---|
| طبقة / طبقات | Tier / tiers | A **generation** of beneficiaries ("the people of one era") — *"the people of one era"* remains the meaning. **⚠ It is a position in the tree, NOT a precedence key** (ADR-0009 R1): being in a lower ṭabaqa does not make you wait, and being in the lowest living one does not make you entitled. In the engine ṭabaqa is **derived** from the recorded parent edge and cross-checked against the supplied value; a disagreement halts. |
| بطن / بطون | Layer(s) / lineage | A generational layer of descendants: the first *baṭn* = the children, the second = the children's children, and so on. Classically, **أولاد البطون** = descendants through the female line — and **that classical sense is now the operative one**: whether البطون continue is the deed term below. |
| ظهور | Zuhur | Classically **أولاد الظهور** = descendants through the male line — the son-descendants, **those carrying the family name**. **Now substantive**, not a label: under a ظهور-only deed the name-carrying line is the line that continues. |
| **شرط الاستمرار: ظهور فقط / ظهور وبطون** | **Continuation stipulation** (`ZUHUR_ONLY` \| `ZUHUR_AND_BUTUN`) | **The deed term that decides WHICH LINES continue** (ADR-0009 R2). It is an **additional filter on top of the frontier rule below, never a replacement for it**. **ظهور فقط** — sons' lines continue; a **daughter is a beneficiary in her own right, but her children are not**. Precisely: **additionally** requires that every ancestor strictly between the waqif and the person is a son (so a daughter of the waqif qualifies — no intermediate ancestor; a son's daughter qualifies once her father has died; a daughter's son never does). **ظهور وبطون** — **both** sons' and daughters' lines continue indefinitely; **no line filter at all**, the frontier rule alone decides. **A CLOSED TWO-VALUE TERM: there is no third value and no default** — absent, ambiguous or unrecognised ⇒ `SHART_INCOMPLETE`. ⚠ This row previously ended *"every living descendant is eligible"*; that was corrected by the product owner on 2026-08-03 (**R-FRONTIER**, ADR-0009 amendment A). |
| **الجبهة الحية للنسب** | **The living frontier** (R-FRONTIER — the eligibility rule) | **Entitlement sits at the NEAREST LIVING POINT on each line of descent** (product owner, 2026-08-03, correcting ADR-0009's own wording). A person is entitled iff they are living, **every ancestor strictly between them and the waqif is deceased**, and — under ظهور فقط only — every such ancestor is a son. In the owner's words: *"son A's child does not get since Son A is alive. Son A's child only gets anything if son A is dead."* A **living** ancestor holds the entitlement and their descendants wait (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`); a **dead** one is walked through — a generation's death does not block the next generation, it is what **releases** it. ⚠ The wait is **temporary**: it reverses on that ancestor's death and the same person is entitled next period, so no report, cache or "permanently excluded" filter may treat it as durable. The person's **own** ظهور/بطون link is never read — an eligible line may end in a son or a daughter. |
| ذرية | Dhurriyya (descendants) | The waqif's line of descent; the beneficiary class in a family (أهلي/ذري) waqf. **Membership is by descent along a continued line**, which is why the model needs a real parent edge and not just a tier number. |
| **استمرار النسب** | **Lineage continuation** (the default order) | The entitlement order the product treats as **normal** (ADR-0009 R4): the **entitled cohort — the living head of each continuing line, per the الجبهة الحية / R-FRONTIER row above, NOT every living descendant** — shares the distributable **equally per head — per capita — recomputed each period**. A deceased member's share does **not** pass down their branch as a block, so a branch with six eligible children collectively receives six times what a branch with one eligible child receives. The owner chose this **explicitly over per-stirpes**, having been shown that exact consequence. Consequence: a family beneficiary's deed-stipulated relative weight is **not applied** on such a cohort (it is recorded, traced and flagged, never silently dropped). |
| الأعلى فالأعلى / الأول فالأول (الترتيب) | Ordered entitlement | The **upper/earlier tier takes precedence and excludes the next** until it is extinct (وقف مرتّب). Only when a tier dies out does the next tier receive. **⚠ Now the OPT-IN EXCEPTION** — it governs only where the deed explicitly stipulates it (ADR-0009 R4). Preserved verbatim in behaviour, and deed weights **are** applied here. |
| التشريك | Shared entitlement | All tiers **share together** (وقف مشترك بين الطبقات) — the opposite of ordered entitlement. **Retained unchanged and deliberately not collapsed into lineage continuation**: tashrik applies **no** ظهور/بطون eligibility filter and **does** apply the deed's relative weights. |

### Why this is a first-class product concern

Eligibility and each beneficiary's share are **not** a flat list — they depend on:

1. **Whether the person descends from the waqif on a line the deed continues** — the ظهور / ظهور وبطون
   continuation stipulation applied along their **ancestor chain**, which is the primary question;
2. **whether every ancestor on that chain is dead** — the living frontier (R-FRONTIER): a living ancestor
   holds the entitlement and their descendants wait; and
3. only where the deed **explicitly stipulates tier-exclusion**, which tier ([[Mustahiq]]) they are in
   (الأعلى فالأعلى), or whether all tiers share (التشريك); and
4. **whether the deed records a مآل الوقف** — an ultimate taker that becomes entitled only once the
   beneficiary class has ended. It is not part of the descent test at all: it is evaluated **after** it, and
   only when no living descendant remains on record.

So the platform must model a real **beneficiary lineage graph** — a parent edge per descendant, the
ظهور/بطون link, **and each member's vital status, which is now an eligibility fact about the whole chain
rather than only about the person** — and **[[Distribution]]** must compute shares from it: **per capita
over the living frontier of each continuing line** by default, tier-aware only on an ordered deed, and never
equally across everyone indiscriminately. A tier number alone **cannot** express any of this. This intersects: BRD **BR-103**
(shart), **BR-201/BR-204** (beneficiary registry + lineage), **BR-505**
(distribution). See [`../product/brd/06-functional-requirements.md`](../product/brd/06-functional-requirements.md).

> [!warning] What is written here and what the schema can hold are not yet the same thing
> The rules above are implemented in the **engine** (`packages/domain/src/distribution/`) and are
> covered by tests. They are **not yet in the database**: `schema.prisma`'s `Beneficiary` has **no parent
> edge** and no continuation stipulation — it carries `branch`, `relationshipAr` (both free text) and
> `tabaqa Int?`, so lineage eligibility is **structurally inexpressible** in a stored row. **`Waqf` likewise
> has nowhere to record مآل الوقف** (the reversion kind and the ultimate-taker link), and no member vital
> status readable along an ancestor walk. Adding the self-relation, the lineage link, the waqf-level
> stipulation and the reversion clause is **E3/E4's** work; the engine
> deliberately leads by a *declared* gap rather than a silent one. The new refusal and entitlement-rule
> codes also have **no Arabic statement copy** yet (E10/E12) — that Arabic is product-approved legal
> text a beneficiary may dispute and was **not** invented in a code change.
>
> **Open fiqh/legal questions returned with this decision and NOT resolved** (binding rule 4): whether a
> deed that explicitly allocates unequal shares among named descendants overrides per capita; whether a
> zero recorded weight should still exclude on a lineage cohort; whether the continuation stipulation
> also filters an **ordered** deed; whether a waqif's **daughter** is herself ظهور or بطون; and how a
> descendant related by a route the deed does not contemplate (e.g. adoption) is representable at all.
> **Added by R7:** whether *"the bloodline is over"* means **no living descendant** or **no continuing line**;
> whether a reversion once triggered is **final or recomputed every period** (the engine recomputes, so a
> later-recorded heir reverses it while halalas already paid cannot be recovered); whether an **unenumerated
> placeholder's** `active: false` may certify a death (the engine currently treats it as one and pays the
> charity — **R7-D1, HIGH**); and how a real مآل clause allocates among several takers.
> See ADR-0009's open-questions list.

### Sources
- General Authority for Awqaf — endowment-terms knowledge center (Part A).
- Standard Awqaf/fiqh usage for Part B (e.g. IslamWeb fatwa on waqf-on-descendants, tiers & order) — the
  **classical** definitions.
- **The operative eligibility rule in Part B — and the مآل الوقف / ultimate-taker rule in Part A — are the
  product owner's** (a practising Nazir), taken 2026-08-02/03 and 2026-08-10 and recorded in
  [`ADR-0009`](../decisions/ADR-0009-lineage-entitlement-and-no-joint-waqf.md). Where the classical gloss
  and the owner's rule differ on *what decides entitlement*, the ADR governs the product.
