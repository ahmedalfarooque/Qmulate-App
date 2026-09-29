# Sharia Review Brief — QMULATE Waqf Distribution Logic

**For:** a waqf-fiqh scholar / Sharia reviewer
**Purpose:** to obtain a considered ruling (فتوى / مراجعة شرعية) on the assumptions built into QMULATE's automated distribution of waqf yield.
**You do not need to read any software to review this document.** Everything the system does is described here in plain language, in both English and Arabic terms.

Status: **ANSWERED (in part) · DESIGNATED AUTHORITATIVE · FORMAL SIGNATURE OWED** · Privileged & Confidential

> ### ⊕ 2026-08-18 — THIS BRIEF HAS BEEN ANSWERED, AND THE ANSWERS NOW HAVE A NAME
>
> An answered copy of this brief exists (`Sharia Review Brief (1)__.docx`, OneDrive/Teams chat files,
> modified 2026-07-26; located 2026-08-18). Its **provenance is established**: the answers were written by
> **Fadwa — a licensed lawyer with endowment expertise** — and the product owner has **designated them the
> authoritative review, pending formal signature** (S4 owner-decision memo, Q-E5-4/5, 2026-08-18).
>
> The status of this document therefore moves from *"draft, unanswered, awaiting the scholar"* to
> **"answered by Fadwa, designated authoritative by the owner 2026-08-18 — formal signature owed."**
>
> **Confirmed by that review, as the owner's memo enumerates them:** §5 Q1 (the no-guessing rule), Q2 (the
> waterfall order), Q5 (ordered/shared semantics), Q6(a)–(e) core classifications — **rent = income;
> sale and istibdal proceeds = capital; expropriation compensation = usually capital; non-diminution
> absolute** — and Q8 (withhold, never reallocate).
>
> **STILL OPEN, and not answered by anything:**
> - **Q10 (zakat)** — unanswered.
> - **Q6(f)–(i)** — key money · insurance proceeds · post-istibdal arrears · income-funded ṣiyāna reserve.
>   These were added to this brief on 2026-08-18, *after* the answered copy was written, so no review of any
>   date could have reached them. They stand exactly as posed.
> - **Q3's nuance** — the answer is reported as *"may reserve a reasonable amount if needed"*, which is **not
>   the same as the engine's zero-default**. Recorded as a reconciliation **owed**; the engine's behaviour is
>   deliberately **unchanged** pending a design routed through the product owner (Binding rule 4).
>
> ⚠ **What this session did NOT do, stated so the record cannot be misread.** The `.docx` is **not in this
> repository** and **this session has not opened it**. Everything above is taken from the product owner's
> written ruling in the S4 memo — the owner's account of what the review says — and from nothing else. So:
> the questions the memo does **not** enumerate (Q4, Q7, Q9, Q11, Q12) are **not hereby claimed as answered**;
> their status is *"covered by a review this session has not read."* The owner has been asked to place the
> answered `.docx` into `docs/product/` so the artifact itself is in-repo and each question's answer can be
> read against the question. **Nobody should transcribe it from memory or from a summary — including this
> brief.**
>
> ⚠ **One distinction the record keeps, without reopening the decision:** the brief was addressed to a
> waqf-fiqh scholar for a مراجعة شرعية; the answers are a licensed endowment lawyer's. Whether a separate
> scholar's فتوى is ever sought on top is the owner's discretion, not a blocker.
Sourced from the internal distribution specification (§08), the endowment glossary, the open-questions ledger (§16), and the data-model specification (§07).

---

## 0. How to read this brief

QMULATE acts as professional **Nazir (ناظر)** — court/Authority-recognised trustee — for family waqf endowments. Part of that role is calculating, each period, **who receives how much** of a waqf's yield, and **who may be paid now**. QMULATE is building software to perform that calculation the same way every time, with a full audit trail.

Every calculation the software performs rests on an **interpretation of Islamic law**. Those interpretations were made provisionally by the product team so that a system could be specified at all. **None of them is settled.** This brief lays each one out and asks you to confirm, correct, or replace it.

Two conventions used throughout:

- **"The engine"** means the automated distribution calculator. It is a pure calculator: given the founder's conditions, the period's income, and the beneficiary list, it produces a per-beneficiary payout sheet. It **moves no money by itself** and it **never guesses** — where the founder's conditions are missing or unclear, it stops and refuses to compute (see §2).
- **⚠ Unverified figure.** Any number in this brief (fee percentages, time windows, value thresholds) is treated internally as **unverified until confirmed against the primary Saudi regulation and counsel**. Where you see ⚠, the *figure* is provisional; the *question for you* is about the underlying fiqh principle, not the arithmetic.

> **What this brief asks of you.** For each item below you will find **(a) what the engine currently does** and **(b) a boxed ASSUMPTION requiring your sign-off.** Section 5 collects every open question into a single numbered list for your written answer. Please treat every boxed assumption as provisional — the system will be built to match your ruling, not the other way round.

---

## 1. Glossary used in this brief (المصطلحات)

| Term | Arabic | Meaning as used here |
|---|---|---|
| Waqf | وقف | the endowment |
| Nazir | ناظر | the trustee — QMULATE's role |
| Waqif | واقف | the founder / endower |
| Mawquf ʿalayh / Mustahiq | الموقوف عليه / مستحق | the beneficiary |
| Shart al-Waqif | شرط الواقف | the founder's binding conditions |
| **Asl** | **أصل** | the **corpus** — the endowed principal itself (the asset, or capital standing in its place). Never distributed. |
| Ghallah / ʿAwaʾid | غلة / عوائد | the **income / yield** the corpus produces. Only this is distributed. |
| Ṣiyāna | صيانة | maintenance reserved from yield **before** any distribution |
| ʿUshr | عُشر | the customary "one-tenth" (10%) Nazir fee set by this engagement's deed |
| Istibdal | استبدال | substitution of a corpus asset for a replacement |
| Ṭabaqa / Ṭabaqāt | طبقة / طبقات | generational **tier(s)** of beneficiaries |
| Ẓuhūr / Buṭūn | ظهور / بطون | generational **lines** — classically descent through the male line (ẓuhūr) vs the female line (buṭūn) |
| al-aʿlā fa-l-aʿlā / murattab | الأعلى فالأعلى / مرتّب | **ordered** entitlement — an upper tier excludes the next until extinct |
| Tashrik | التشريك | **shared** entitlement — all living tiers share together |

> **A sourcing note you should know.** The Arabic terms in the top part of this list are drawn from the **General Authority for Awqaf's** own published endowment-terms glossary. However, the generational-layer terms — **ṭabaqa, ẓuhūr/buṭūn, al-aʿlā fa-l-aʿlā, tashrik** — are **standard fiqh usage and are *not* in the Authority's public glossary.** The product team has relied on established Awqaf/fiqh usage for them. **Confirming that our understanding of these terms is correct is itself one of the questions for you** (see §5, Q4).

---

## 2. The one rule the whole engine obeys: it never guesses (لا اجتهاد من الآلة)

Before any of the specific logic below, one principle governs everything:

- **What the engine does.** If the founder's conditions (Shart al-Waqif) needed to decide *who is entitled* or *in what shares* are **missing, ambiguous, or of a kind the engine does not recognise**, the engine **halts and reports `SHART_INCOMPLETE`** ("the founder's conditions are incomplete"). It does **not** default to equal shares, it does **not** infer the founder's likely intent, and it does **not** proceed. The matter is then referred to the human interpretation path — the living waqif if alive, otherwise the competent authority.
- The founder's conditions are also treated as **immutable (شرط الواقف مُلزِم)**: once recorded, they can only be changed through a formal, authority-approved process with a full record — never by a quiet edit or "correction."

> **ASSUMPTION requiring sign-off.** That the correct behaviour, when the founder's conditions cannot resolve entitlement, is to **stop and refer to a human authority** rather than apply any default rule — and that the Nazir may **never** substitute its own judgement of the founder's intent. We believe this is the safe and correct posture; please confirm it is the required one.

---

## 3. The Sharia-dependent logic, one piece at a time

Each sub-section states what the engine does, then boxes the assumption behind it.

### 3.1 The maintenance-first waterfall — كيف تُحسب الغلة القابلة للتوزيع

**What the engine does.** Before any beneficiary is paid, the engine reduces the period's gross yield (ghallah) in a **fixed order** to arrive at the *distributable* amount:

1. **Maintenance reserve (ṣiyāna / صيانة) — taken FIRST, always.** An amount set aside per the founder's stipulation to keep the endowed asset sound (a fixed sum, a percentage of yield, or a top-up to a target balance). It is **held in the waqf's account, not distributed.**
2. **Operating / management costs** — the actual running costs of the period (this does *not* include the Nazir's own fee).
3. **Nazir fee** — the trustee's remuneration, deducted **before** distribution (see §3.5).
4. **= Distributable (الغلة القابلة للتوزيع)** — what remains is what beneficiaries share.

The order is treated as **fixed and non-negotiable**, on the basis that "maintenance takes priority over any other disbursement" (صيانة الوقف تُقدَّم على غيرها من المصارف). If the deductions exceed the yield (a negative distributable), the engine **refuses to produce a run at all** rather than distribute a negative or partial amount.

> **ASSUMPTION requiring sign-off.**
> (a) That **maintenance (ṣiyāna) is reserved first**, ahead of operating costs, the Nazir fee, and any distribution.
> (b) That the **fixed sequence** — maintenance → operating → Nazir fee → distributable — is the correct Sharia ordering of deductions from yield.
> (c) That when the founder's deed is **silent on maintenance**, the correct default is to reserve **nothing** (rather than reserve a prudential minimum). *This particular default is flagged internally as unresolved.*

### 3.2 Income vs. capital: what may enter distribution at all — الغلة مقابل الأصل

**What the engine does — and an important gap.** The design principle is that **only income (ghallah / غلة) may ever be distributed.** The **corpus (asl / أصل)** — the endowed asset itself and any capital standing in its place — must be preserved and never eroded. Under this principle, **capital receipts are blocked from distribution** and flow back into corpus. In particular:

- **Rent and operating returns** → income (ghallah) → *may* be distributed.
- **Proceeds of selling a corpus asset** → capital → corpus → **blocked from distribution.**
- **Proceeds of substitution (istibdal / استبدال)** → capital → corpus → **blocked from distribution.**
- **Government expropriation compensation (تعويض نزع الملكية)** → treated as capital, to be substituted into a replacement asset → corpus → **blocked from distribution.**

> **Please note honestly:** this income-vs-capital classification is, at present, a **stated principle that the software does not yet enforce.** The current data model records each transaction only as "revenue" or "expense"; it has **no field that classifies a receipt as income vs. capital**, and the distribution calculator simply consumes a figure labelled "gross yield" that it *assumes* is already pure income. There is nothing yet in the system that would stop, say, sale proceeds from being fed in as distributable yield. Building that guard depends on your ruling on where the line falls.

> **ASSUMPTION requiring sign-off.**
> (a) That **only income (ghallah) is ever distributable, and corpus (asl) is never distributed or eroded** (non-diminution of corpus).
> (b) The **correct income-vs-capital classification of each concrete receipt type** — rent, sale proceeds, istibdal proceeds, and expropriation compensation (see §5, Q6, where each is listed for your individual ruling).
> (c) That istibdal and sale proceeds **return to corpus** rather than being treated as distributable yield in the period they are received.

### 3.3 Entitlement resolver — ORDERED vs SHARED (الترتيب مقابل التشريك)

This is the heart of the calculation: deciding **who is entitled** to a share this period. Entitlement is **not a flat list** — it depends on the founder's conditions. The engine supports two mutually exclusive modes, chosen from the deed:

**Mode 1 — ORDERED (al-aʿlā fa-l-aʿlā / الأعلى فالأعلى — waqf murattab / وقف مرتّب).**
The engine finds the **lowest-numbered tier (ṭabaqa) that still has at least one living, eligible member**. Only that tier is entitled. **Every lower tier is entirely excluded** (given a zero share, with the reason "an upper tier is still extant") **until the upper tier dies out.** When the top tier becomes extinct, the next tier down becomes entitled to the whole.

**Mode 2 — SHARED (tashrik / التشريك — waqf mushtarak bayn al-ṭabaqāt / وقف مشترك بين الطبقات).**
**All living tiers share together.** No tier excludes another. Each beneficiary's share is the weight the deed assigns them, across the whole living cohort.

The engine will only ever apply the mode **explicitly recorded** for that waqf. If the deed's mode is unrecognised, it halts with `SHART_INCOMPLETE` (§2) rather than picking one.

An important distinction the engine enforces:

- **Excluded (مُستبعَد) ≠ withheld (مَحجوز).** An *excluded* beneficiary (e.g. a lower tier under ORDERED) is owed **nothing** this period and does not even enter the share calculation. A *withheld* beneficiary (see §3.6) **is** owed their full share — it is simply **retained unpaid** because of a paperwork gate. These are different in kind and are never conflated.

> **ASSUMPTION requiring sign-off.**
> (a) That **ORDERED (al-aʿlā fa-l-aʿlā)** means the entire lower tier is **excluded** — receiving nothing — so long as one eligible member of an upper tier is alive, and only becomes entitled when the upper tier is **wholly extinct.**
> (b) That **SHARED (tashrik)** means all living tiers receive concurrently, with no tier excluding another.
> (c) That which of the two applies is **read solely from the founder's deed**, and that the engine is correct to **refuse to distribute** where the deed does not clearly specify one.

### 3.4 Generational tiers and lines — ṭabaqa, ẓuhūr / buṭūn (الطبقات، الظهور والبطون)

**What the engine does.** Within the ORDERED / SHARED logic above, the engine places each beneficiary in:

- a **tier (ṭabaqa / طبقة)** — their generation (e.g. tier 1 = the founder's children, tier 2 = grandchildren), and
- a **line (ẓuhūr / buṭūn — ظهور / بطون)** — classically, descent through the male line (ẓuhūr) versus the female line (buṭūn),
- optionally a named **branch** of the family.

Under ORDERED, "extinction" of a tier is tested by whether **any** member of that tier is still alive and in scope; a deceased or exited beneficiary is treated as absent for that test. A deed may further **partition within a tier by line** (ẓuhūr vs buṭūn) if it stipulates so.

> **ASSUMPTION requiring sign-off.**
> (a) That our reading of **ṭabaqa (tier)**, **ẓuhūr** and **buṭūn** matches the classical fiqh meaning, and that resolving entitlement by generation-tier is sound.
> (b) That a tier is "extinct" for the ordered rule **only when no member is living** — and that this is the correct test for when the next tier inherits entitlement.
> (c) That where a deed distinguishes **ẓuhūr from buṭūn**, partitioning shares along that line is a valid enforcement of the founder's condition.

### 3.5 The Nazir fee — أجرة الناظر (العُشر)

**What the engine does.** The Nazir's fee is treated as **set by the waqf deed, not by statute.** For this engagement, the deed sets **10% of revenue (the customary ʿushr / عُشر)** ⚠, deducted at step 3 of the waterfall (before distribution). The system keeps the *basis* configurable (percent of revenue, percent of net income, or a fixed retainer) because a different deed may set a different fee. Where a deed is **silent** on the fee, the engine sets the fee to **zero and flags the run** for a separate Authority-determination — it does not invent a rate.

*(Note: this deed-set ʿushr is a different thing from the Awqaf Law's separate ≤10%-of-net-income fee that the Authority itself may levy ⚠. This brief concerns only the deed-set Nazir fee.)*

> **ASSUMPTION requiring sign-off.**
> (a) That taking the Nazir fee as a **deed-set ʿushr (10% of revenue)** ⚠ is valid, and that deducting it **from yield before distribution** is correct.
> (b) That when the deed is **silent** on remuneration, holding the fee at zero pending an authority determination (rather than applying any customary default) is the correct behaviour.

### 3.6 Payability vs entitlement — withhold-never-reallocate (الحجب لا يُعاد توزيعه)

**What the engine does.** After deciding *entitlement*, the engine separately decides *payability* — whether an entitled beneficiary may actually be paid **now**. A beneficiary may be entitled yet not payable (e.g. identity verification incomplete or stale, a beneficiary category not yet identified, an unlicensed disbursing entity, or a cross-border recipient awaiting the approved channel). In every such case:

- the beneficiary **keeps their full entitled share**, and
- that share is **retained (withheld) in the waqf's own account** — it is **never given to, or split among, the other beneficiaries.** "You do not give away someone's share because their paperwork is late."

Withheld amounts sit until the gate clears; how long a share may sit before escalation is itself an open policy point.

> **ASSUMPTION requiring sign-off.**
> (a) That when an **entitled** beneficiary cannot yet be paid, their share must be **retained intact for them** and **never reallocated** to other beneficiaries.
> (b) That retaining such a share in the waqf account **indefinitely** (with recurring alerts) pending resolution is acceptable, or whether Sharia sets a limit after which the share must be otherwise directed.

### 3.7 Timing of distribution — موعد الصرف (ثلاثة أشهر)

**What the engine does.** If the founder's deed sets a **disbursement schedule**, the engine uses it. If the deed is **silent**, the engine treats the yield as due for distribution **within 3 months of the end of the fiscal year** ⚠. Distribution after that date is not blocked, but is **flagged as overdue.**

> **ASSUMPTION requiring sign-off.** That, absent a schedule in the deed, **within 3 months of fiscal-year-end** ⚠ is the correct default distribution window from a Sharia standpoint (independent of the regulatory deadline).

### 3.8 Zakat — الزكاة

**What the engine does.** The distribution waterfall (§3.1) currently contains **no zakat step.** No zakat is computed, withheld, or deducted on the yield or on any beneficiary's share by the engine. Zakat handling has been **deferred as a fiqh-and-regulatory question** to a later phase; the waterfall was, however, deliberately designed so that a zakat step *could* be inserted (between the Nazir-fee deduction and the distributable amount) if you rule one is required. Separately, preparing any zakat/tax return **for the waqf as an entity** is treated as an operational duty of the Nazir, not part of the distribution calculation.

> **ASSUMPTION requiring sign-off.**
> (a) That it is acceptable for the engine to compute and record distributions **without any zakat step**, leaving zakat to beneficiaries and/or a later feature.
> (b) If not — **whether, on what base, at what rate, and at which point** in the waterfall zakat must be inserted, and **who bears it** (the waqf, the yield, or each beneficiary).

### 3.9 Rounding and the leftover — التقريب والباقي (kusūr)

**What the engine currently does.** Shares rarely divide evenly. Working in the smallest currency unit (halalas, 1 SAR = 100), the engine splits the distributable pool by each beneficiary's fraction, then hands out any **leftover halalas one at a time to the beneficiaries with the largest fractional remainders** (a "largest-remainder" method), breaking ties by a stable order. The result is that the **sum of the shares exactly equals the distributable pool** — no leftover is left over, and the residual given to any beneficiary is at most a few halalas.

**A tension you should know about.** A separate internal decision ledger records the residual policy as **still open and blocking**, and proposes a *different* default: round each share and **carry any leftover forward into the next period's yield** as a visible line, rather than absorbing it into the current period's largest shares. **These two approaches are not the same**, and the matter is explicitly awaiting a joint product-and-Sharia decision.

> **ASSUMPTION requiring sign-off (this is OQ-01, flagged internally as blocking).**
> (a) The **rounding unit and direction** — round to the halala (2 decimal places); round half-up, half-even, or truncate?
> (b) The **treatment of the leftover (kusūr)** — is it (i) allocated within the period to the largest-remainder shares (current engine behaviour), (ii) carried forward to next period's yield, (iii) added to the maintenance reserve, or (iv) held in a named suspense line? And is the chosen treatment consistent with the founder's conditions?

---

## 4. Worked examples, in words (أمثلة محلولة)

These use invented sample data (no real family's data appears). All amounts are in Saudi Riyals (SAR). They are meant to let you see the rules of §3 acting on concrete numbers. Fee, window, and threshold figures carry the ⚠ caveat from §0.

### Example A — an ORDERED (murattab) family waqf

A medium family waqf earns **350,000** in yield for the year.

1. **Maintenance reserve** of **40,000** is set aside first.
2. **Operating costs** are **0** this period.
3. The **Nazir fee** is 10% of revenue ⚠ = **35,000**.
4. **Distributable = 350,000 − 40,000 − 0 − 35,000 = 275,000.**

The deed is **ORDERED**. The beneficiaries are: two members of **tier 1** (the eldest living generation) and one member of **tier 2**. Because an upper tier is alive, the engine finds tier 1 is entitled and **tier 2 is excluded entirely (share = 0)**. The two tier-1 members carry equal deed-weights, so they split the 275,000 evenly:

- **Tier-1 member #1:** entitled to **137,500**. Identity verification is current → **PAID 137,500.**
- **Tier-1 member #2:** entitled to **137,500**. Identity verification is missing → **WITHHELD.** The 137,500 is **retained in the waqf account for this beneficiary**; a verification task is raised; it is **not** given to member #1.
- **Tier-2 member:** **EXCLUDED**, receives nothing, because an upper tier is still extant.

Paid 137,500 + withheld 137,500 = 275,000 — the whole distributable pool is accounted for, with nothing lost and nothing reallocated.

**What this example is testing with you:** the ORDERED exclusion of the lower tier (§3.3), and the "withhold, never reallocate" rule (§3.6).

### Example B — a SHARED (tashrik) family waqf

A small family waqf earns **200,000** in yield.

1. **Maintenance reserve** at 5% of yield = **10,000**.
2. **Operating costs** = **0**.
3. **Nazir fee** 10% ⚠ = **20,000**.
4. **Distributable = 200,000 − 10,000 − 20,000 = 170,000.**

The deed is **SHARED (tashrik)**. Here there is **one member in tier 1 and one in tier 2** — and because the waqf is shared, **both tiers are entitled together; neither excludes the other.** With equal deed-weights they split evenly:

- **Tier-1 member:** entitled to **85,000**, verification current → **PAID 85,000.**
- **Tier-2 member:** entitled to **85,000**, verification not yet done → **WITHHELD 85,000** (retained for them).

Paid 85,000 + withheld 85,000 = 170,000.

**The contrast with Example A is the whole point.** In A, the tier-2 member got **nothing** (excluded, because the waqf was ordered). In B, the tier-2 member is **fully entitled to 85,000** (because the waqf is shared) — their share is merely held pending paperwork, not denied. Whether a given deed is ordered or shared therefore completely changes who is owed what — which is exactly why we need your confirmation of §3.3.

### Example D — a JOINT waqf (charity + family together)

A large joint waqf earns **1,800,000** in yield.

1. **Maintenance reserve** = **100,000**.
2. **Operating costs** = **120,000**.
3. **Nazir fee** 10% ⚠ = **180,000**.
4. **Distributable = 1,800,000 − 100,000 − 120,000 − 180,000 = 1,400,000.**

The deed fixes the split as **40% to a charitable body (jiha / جهة) and 60% to the family.** Of the family's 60%, two branches take 30% each. So:

- **Charitable body:** 40% of 1,400,000 = **560,000.** The body is a licensed legal entity → **PAID 560,000.** (Had its licence lapsed, this 560,000 would instead be **withheld and retained**, not redirected.)
- **Family Branch A:** 30% = **420,000**, a domestic beneficiary with current verification → **PAID 420,000.**
- **Family Branch B:** 30% = **420,000**, but the recipient is **abroad (cross-border)** → the payment is **routed through the approved cross-border channel and an Authority notice is queued.** It is **not blocked** — it takes a dedicated path.

560,000 + 420,000 + 420,000 = 1,400,000.

**What this example is testing with you:** that a joint waqf may be split by **fixed deed shares between a charitable purpose and family branches** (and that within the family leg the ordered/shared rule then applies), and that a cross-border beneficiary is **paid through a special channel rather than excluded.**

---

## 5. Questions for the scholar (الأسئلة المطلوب البتّ فيها)

Please answer each in writing. These are the points on which the system's behaviour must follow your ruling. **We are not asking you to endorse our answers — we are asking for yours.**

1. **The no-guessing rule (§2).** When the founder's conditions cannot resolve who is entitled or in what shares, is it correct for the Nazir/system to **stop and refer to the living waqif or the competent authority**, and never to apply any default or infer the founder's intent?

2. **The waterfall order (§3.1).** Is the fixed deduction sequence — **maintenance (ṣiyāna) first → operating costs → Nazir fee → distributable** — the correct Sharia ordering? In particular, must maintenance always precede the Nazir fee and all distribution?

3. **Maintenance when the deed is silent (§3.1c).** If the deed stipulates no maintenance reserve, should the default be **zero reserve**, or is a prudential minimum required before yield may be distributed?

4. **The generational terms (§1, §3.3, §3.4).** Do our definitions of **ṭabaqa (tier)**, **ẓuhūr / buṭūn (lines)**, **al-aʿlā fa-l-aʿlā (ordered)**, and **tashrik (shared)** match the correct fiqh meanings? (These terms are not in the Authority's official glossary, so we especially need your confirmation.)

5. **Ordered vs shared entitlement (§3.3).**
   a. Under **ORDERED**, is it correct that a lower tier receives **nothing** while any eligible member of an upper tier lives, and becomes entitled only when the upper tier is **wholly extinct**?
   b. Under **SHARED (tashrik)**, is it correct that all living tiers receive **concurrently**, none excluding another?
   c. Is the test for a tier's "extinction" correctly **"no living member remains"**?

6. **Income vs. capital — classify each receipt type (§3.2).** For each of the following, is it **income (ghallah, distributable)** or **capital (asl, returns to corpus, not distributable)**? Please rule on each individually:
   a. **Rent / operating returns** from an endowed property.
   b. **Proceeds from selling a corpus asset.**
   c. **Proceeds from substitution (istibdal).**
   d. **Government expropriation compensation (تعويض نزع الملكية).**
   e. Is the **non-diminution of corpus** (that corpus is never distributed or eroded) an absolute rule, and do sale/istibdal proceeds **always** return to corpus?

   ⊕ **ADDED 2026-08-18 (S6/E5). These four were named as open in [ADR-0002 §3](decisions/ADR-0002-receipt-income-capital-classification.md) on 2026-07-26 and were NEVER ASKED — (a)–(e) above do not reach any of them.** Recording that plainly: "the Sharia review is unsigned" understated the position, because even a signed answer to (a)–(e) would leave these four unruled. They are the receipt types a real engagement produces most often after plain rent, and the engine has no basis to classify any of them:

   f. **Lease premium / key money (خلو / بدل خلو)** received on granting a lease of endowed property — income (it arises from letting the asset) or capital (it is consideration for a right in the asset itself)?
   g. **Insurance proceeds on a destroyed or damaged endowed building** — capital standing in the place of the asset, or income of the period in which they are received? Does it differ between total loss and partial damage?
   h. **Rent arrears collected AFTER an istibdal** — arrears that accrued on the OLD corpus asset but are received once it has been substituted. Do they follow the old asset (and so join the substitution proceeds as corpus), or are they income of the endowment in the period received?
   i. **A ṣiyāna (maintenance) reserve funded out of income** — once accumulated and unspent, has it become corpus (asl), or does it remain retained income that may still be released to the beneficiaries?

   ⚠ **A NOTE ON HOW THESE MUST BE ANSWERED, because the system cannot hold the question open.** Every `REVENUE` receipt is required to carry a classification at entry — a database CHECK makes an unclassified one unrepresentable — so there is **no way to record one of these receipts pending a ruling**. Engineering therefore cannot even seed a worked example of (f)–(i) without choosing an answer, which is precisely what it must not do. **The ruling has to precede the record**, not accompany it.

   ✓ **PROVENANCE ESTABLISHED 2026-08-18 — AND IT CHANGES NOTHING ABOUT (f)–(i).** The answered copy's author is **Fadwa, a licensed lawyer with endowment expertise**, and the product owner has designated her answers the authoritative review pending formal signature (S4 memo, Q-E5-4/5). Q6**(a)–(e)** are therefore **ruled**: rent = income; sale and istibdal proceeds = capital; expropriation compensation = usually capital; non-diminution absolute.
   **(f)–(i) are NOT.** They were added to this brief on 2026-08-18, months after the answered copy was written (file modified 2026-07-26) — no review of that date could have reached them, and the owner's memo says so explicitly. They remain open in exactly the form posed above, and the note immediately above still binds: **the ruling has to precede the record.** No fixture, seed, chart-of-accounts entry or enum value may pick an answer for them in the meantime. *(The prior wording here — "provenance is not established, nothing in this brief is answered, do not cite that file" — was correct on the day it was written and is superseded by the owner's attribution, not by anyone's re-reading of the file.)*

7. **The Nazir fee (§3.5).** Is a deed-set **ʿushr (10% of revenue)** ⚠, deducted from yield before distribution, valid? And where the deed is silent on remuneration, is holding the fee at zero pending an authority determination correct — or does a customary default apply?

8. **Withhold, never reallocate (§3.6).**
   a. Must an entitled-but-not-yet-payable beneficiary's share be **retained intact for them** and never shared among the others?
   b. Is retaining a withheld share **indefinitely** (pending resolution) acceptable, or does Sharia impose a time limit after which it must be otherwise directed?

9. **Distribution timing (§3.7).** Absent a schedule in the deed, is **within 3 months of fiscal-year-end** ⚠ an acceptable Sharia default for when yield must be distributed?

10. **Zakat (§3.8).** May the system distribute yield **with no zakat step**, leaving zakat to beneficiaries / a later feature? If not, **on what base, at what rate, at which point in the waterfall, and borne by whom** must zakat be applied?

11. **Rounding and the leftover — OQ-01 (§3.9).**
    a. To what unit and in which direction should each share be **rounded**?
    b. Where should the unavoidable **leftover (kusūr)** go — spread within the period to the largest-remainder shares, **carried forward** to next period's yield, added to the **maintenance reserve**, or held in a **suspense line** — and which is consistent with the founder's conditions?

12. **Which founder conditions are validly enforceable (§2, §3).** The system treats the Shart al-Waqif as binding and immutable, and enforces conditions such as tier ordering, line (ẓuhūr/buṭūn) partitioning, maintenance reserves, disbursement schedules, and fixed charity/family splits. **Which categories of founder condition are validly enforceable as written**, and are there kinds of condition that a Nazir must **not** mechanically enforce (e.g. conditions that are void, that contravene Sharia, or that require reinterpretation before they can be applied)?

---

## 6. Scope of this review (حدود المراجعة)

- This brief covers the **distribution logic** — how yield becomes per-beneficiary payouts. It does **not** cover investment of corpus, the mechanics of istibdal approval, or beneficiary-registry rules, except where they bear on the questions above.
- All figures marked ⚠ are **provisional and unverified against the primary Saudi regulation and counsel**; your ruling is sought on the **fiqh principle**, and the figures will be confirmed separately.
- All names and numbers in the worked examples are **invented sample data**. No real family, deed, or account appears in this document.

---

### Provenance

Distilled, without code, from the internal distribution-engine specification (§08), the endowment glossary, the data-model specification (§07), and the open-questions ledger (§16, items OQ-01 and OQ-05). Prepared for Sharia review; the product team **did not** answer any of the fiqh questions above, and does not answer them here.

**Answer status (2026-08-18):** answered by **Fadwa**, a licensed lawyer with endowment expertise, in a copy held outside this repository; **designated the authoritative review by the product owner, formal signature owed** (S4 owner-decision memo, Q-E5-4/5). **Q10 (zakat), Q6(f)–(i), and the Q3 nuance remain open** — see the status block at the head of this document, which also records exactly how much of this is first-hand.
