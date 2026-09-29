# Open Questions & Decisions

The single running ledger of what is still undecided, who owns each call, and whether it blocks the Phase-1 build.

Status: Draft v0.1 · Privileged & Confidential

---

## Purpose

Every other PRD section is written to be **decisive** — it states HOW we build. This file is the deliberate exception: it collects the points that are genuinely *not ours to decide*, or not yet decided, and routes each one to an owner with a due-by. It carries the eight BRD open questions ([BR §10](../brd/10-assumptions-open-questions.md)) forward and adds the design-level questions that surfaced while writing the PRD.

Two rules keep this file honest:

1. **Nothing here is a placeholder for laziness.** If the PRD could reasonably decide something, it decided it. Items land here only because they need QMULATE's commercial input, Saudi counsel's legal ruling, a product owner's prioritization call, or a design resolution the brand source left open.
2. **A blocking question must be closed before the requirement it gates ships.** Non-blocking questions have a safe default already coded; the answer only *refines* behavior. Each row says which.

The [carried defaults](#carried-defaults-decided-unless-overridden) at the end are the opposite category: already decided, listed only so a stakeholder who wants to reopen one knows it was a choice, not an accident.

---

## Ownership tags

| Tag | Owner | Decides |
|---|---|---|
| **[QMULATE]** | QMULATE partners / operations | Commercial terms, client facts, which platforms are in use, engagement data. |
| **[Counsel]** | Saudi legal counsel | Points of law — the regulation summaries are working references only ([BR A4](../brd/10-assumptions-open-questions.md)); the Arabic originals and counsel govern. |
| **[Product]** | QMULATE product owner | Scope, sequencing, prioritization, acceptance of a default. |
| **[Design]** | Brand / design lead | Typeface, palette, and unresolved brand-source conflicts (`docs/brand/`). |

**Blocking** = the tagged owner must answer before the dependent requirement can ship. **Non-blocking** = a coded default holds; the answer tunes it.

---

## Carried-forward BRD questions (Q1–Q8)

These are the eight from [BR §10](../brd/10-assumptions-open-questions.md), restated with the PRD's disposition. Where the PRD has already resolved or narrowed one, it says so.

| # | Question | Owner | Blocking? | PRD disposition |
|---|---|---|---|---|
| **Q1** | **Commercial model** — invoicing terms & SLA thresholds. | [QMULATE] | **No** (Phase 1) | Nazir-fee *basis* is **resolved**: this deed sets **10% of revenue** (ʿushr), platform keeps basis configurable — `percent_of_revenue \| percent_of_net_income \| retainer` per the distribution engine ([BR-507](../brd/06-functional-requirements.md)). Invoicing cadence and client-facing SLAs are **Phase 3** ([BR-508](../brd/06-functional-requirements.md), full fee automation/invoicing deferred); no Phase-1 screen depends on them. |
| **Q2** | **Endowment classification** of the first client's 4 endowments (Large / Medium / Small / Direct-benefit). | [QMULATE] | **No** (data entry) | Platform supports **all four classes** and gates obligations off the stored value (§classification-gating). This is a **data-entry fact per endowment**, not a build decision — enter the Authority's classification at onboarding. It changes *which* compliance tasks and statement templates appear, never the code. Until confirmed, an endowment defaults to the **strictest applicable** obligation set (treat as Large/Medium) so nothing is silently skipped. |
| **Q3** | **Registered-office / HQ city** — legal **Jeddah** (CR) vs brand **Riyadh**. | [QMULATE] + [Counsel] | **Yes** (any published address) | Use **Jeddah** wherever the address carries legal weight (deeds, filings, statements, evidence packs, engagement letters). The Riyadh reference is brand copy only. Confirm the exact CR-registered wording with counsel before **any** published or filed document renders an address. See [company profile](../../company/company-profile.md). Do not hard-code a single city string; source it from an org-config value so a correction is one edit. |
| **Q4** | **Tech stack.** | [Product] | **Closed** | **Decided** — see the [locked stack](00-document-control.md) (TS monorepo · Next.js · Expo · tRPC · Prisma/Postgres · better-auth). Removed from the open list. |
| **Q5** | **Display typeface** — "Madani" vs Outfit. | [Design] | **Closed** | **Decided** — **Outfit** (display/body) + **Geist Mono** (labels) + **IBM Plex Sans Arabic** (RTL). "Madani" is **dropped** (no font file was ever delivered). Recorded as a [carried default](#carried-defaults-decided-unless-overridden) in case the brand lead reopens it. |
| **Q6** | **Waqf-investment products list** — content not yet extracted. | [QMULATE] | **No** (Phase 3) | **Not extracted.** Investment-product management is **Phase 3** ([BR-510](../brd/06-functional-requirements.md), "Could"); no Phase-1 requirement needs the list. When Phase 3 starts, re-extract the source Arabic PDF and route the products through the entitlement/ghallah model. Tracked, not blocking. |
| **Q7** | **Portal phasing** — parallel with internal app, or internal-first? | [Product] | **Closed** | **Decided** — **internal-first**. Phase 1 is the internal ops app; the beneficiary/Family-Board **portal is Phase 2**, but the Expo app, auth, and per-endowment access matrix are **scaffolded day one** so it is a build-out, not a bolt-on ([05 · Scope & Phasing](05-scope-phasing-priority.md)). |
| **Q8** | **Which government platforms this client actually uses**, and whether any expose data feeds. | [QMULATE] | **No** (manual by design) | Treat **all** platforms (Awqaf Digital, Baladi, Istihkam, Muqeem, Qiwa, Ejar) as **manual status fields, not live integrations** ([BR A2](../brd/10-assumptions-open-questions.md), [09 · Data & Integration](../brd/09-data-integration-landscape.md)). No public APIs are evidenced. Confirming *which* platforms apply to this client only sets which `GovernmentFilingStatus` rows are seeded — a data-config choice, not an integration build. If counsel/QMULATE later evidence a real feed, it becomes a new scoped requirement, not a Phase-1 assumption. |

---

## PRD-level open questions

Surfaced while specifying the engines and data model. Each is a real decision the PRD could not make alone.

### OQ-01 · Distribution rounding & residual policy — ✅ **ANSWERED (product owner, 2026-08-11)** — no longer blocking

> **The decision.** In the owner's words: *"the engine's current halala handover rule is good."* The engine
> **floors** each line, then hands the leftover halalas one each to the lines with the **largest fractional
> remainders**, ties broken by **ascending `beneficiaryId`**. The residual therefore goes to **beneficiary
> lines inside the run** — it is not carried forward.
>
> ⚠ **This means the "PRD's proposed default" paragraph below is the DRIFTED side and was not adopted.**
> It proposed the opposite on both counts: half-up rounding, and sweeping the residual into next-period
> ghallah carry-forward so that no line received it. Those two policies pay different people different
> money. The paragraph is left in place, unedited, because this file's job is to record what was proposed
> and what was actually decided — not to be retro-fitted into agreement.
>
> Sub-question 1 (rounding *direction*) is moot on this path: largest-remainder is floor-then-distribute,
> so no half-up/half-even/truncate choice arises inside the allocator. `money.ts`'s `moneyRound` still
> takes a direction for other callers and keeps its own marker.
>
> ⚠ One honest residue: this item is tagged **[Product] + [Counsel]** and only Product has answered. The
> owner is a practising Nazir, so this is the product's settled position; a Sharia reviewer reading the
> residual differently against the Shart al-Waqif would change it. That does **not** reopen the item — the
> engine has a decided rule and no longer implements a flagged guess. Implementation and rationale:
> `packages/domain/src/distribution/allocate.ts`.

**Original entry, kept as the record:**

The [distribution waterfall](05-scope-phasing-priority.md) produces a distributable amount that rarely divides into share fractions without a remainder (money is `Decimal(18,2)`, never a float). Two sub-questions:

1. **Rounding unit & direction.** Round each beneficiary line to **halalas (2 dp)**? Round-half-up, round-half-even, or truncate?
2. **Residual allocation.** After rounding, the summed line items will differ from the distributable pool by a few halalas. Where does the residual go — carried to the next period's ghallah, added to the largest share, allocated to the maintenance (ṣiyāna) reserve, or held in a named suspense line?

**PRD's proposed default (to confirm, not assume):** round each line **half-up to 2 dp**; sweep any residual into the **next-period ghallah carry-forward** as an explicit, audit-trailed line (never silently absorbed). This keeps the sum of distributions ≤ distributable and leaves a visible trail. Counsel confirms the residual treatment is consistent with the Shart al-Waqif; product confirms the carry-forward mechanic. **Blocks** the distribution-calculation acceptance criteria in [BR-505/BR-506](../brd/06-functional-requirements.md) — the engine cannot be signed off with an undefined residual.

### OQ-02 · Business-day / holiday calendar — source of truth — [Product] + [QMULATE] · **Blocking (BR-101 deadlines)**

Every statutory deadline (register 30 bd · update 15 bd · istibdal 10 bd · distribute within 3 months of FYE) is counted in **KSA business days**: workweek **Sun–Thu**, Fri/Sat weekend, minus **Hijri-moving public holidays** (Eid al-Fitr, Eid al-Adha, National Day 23 Sep Gregorian-fixed, Founding Day 22 Feb). The weekend rule and Umm-al-Qura conversion (`@umalqura/core`) are coded. The unresolved piece: **where does the authoritative holiday list come from, and who maintains it?**

- Hijri religious holidays shift and are sometimes announced by royal decree only weeks ahead — a hard-coded table drifts.
- Options: (a) a **QMULATE-maintained holiday table** in org config, reviewed annually + on decree; (b) a licensed KSA holiday data source; (c) manual per-deadline override with mandatory reason.

**PRD's proposed default:** ship **(a)** — an admin-editable holiday table seeded with known fixed + best-estimate movable dates, with a required annual review task and a per-deadline manual override (audit-trailed) for late decrees. **Blocks** the deadline-clock acceptance criteria; a wrong calendar produces a wrong due-date, which is a zero-tolerance KPI (on-time registration/updates).

### OQ-03 · First-client migration & cutover plan — [QMULATE] + [Product] · **Blocking (go-live)**

The first engagement is a **live, in-flight trusteeship**: 4 endowments, 3 waqifs, an existing activity log, existing bank accounts, historical filings. Go-live is a **migration**, not a greenfield start. Open points:

- **Historical depth.** How far back do we load transactions, distributions, and filing history — full history, current fiscal year only, or opening balances + forward?
- **Cutover moment.** Big-bang (freeze the spreadsheet, load, switch) vs parallel-run (both systems for one cycle)?
- **Data hygiene gate.** The real activity log has the column shape we modeled `ComplianceTask` on, but its rows are **confidential real data** — migration happens **only in the KSA-resident production environment** once it exists, never on Railway ([data-residency guardrail](00-document-control.md); `DATA_CLASSIFICATION=fixture-only` refuses non-fixture loads elsewhere).

**PRD's proposed default:** **opening balances + current-fiscal-year forward**, big-bang cutover after one reconciled dry-run **against the fixture** on Railway, then the real load exclusively in KSA prod. **Blocks** go-live; QMULATE owns the historical-depth call, product owns the cutover mechanics.

### OQ-04 · SLA & invoicing terms (detail behind Q1) — [QMULATE] · **Non-blocking (Phase 3)**

Beyond the fee *basis* (resolved, OQ/Q1), the concrete numbers — invoice cadence, payment terms, internal task SLAs (e.g., "beneficiary query answered within N business days"), and any client-facing service levels — are **QMULATE commercial policy** and land with fee automation in **Phase 3** ([BR-508](../brd/06-functional-requirements.md)). No Phase-1 screen enforces them. Listed so they are not forgotten when Phase 3 opens.

### OQ-05 · Zakat treatment on distributions — [Counsel] · **Non-blocking (Phase 3)**

Whether and how zakat is computed/withheld on ghallah or distributions is a **fiqh + regulatory** question, deferred with the zakat/investment feature to **Phase 3** ([BR-509](../brd/06-functional-requirements.md)). The waterfall as specified does **not** insert a zakat step; if counsel later rules one is required, it enters the waterfall between Nazir-fee deduction and distributable as a new, configurable step. Flagged now so the engine's step ordering is designed to accept an insertion.

⊕ **2026-08-18 — STILL OPEN, and now confirmed open rather than merely deferred.** This is [Q10 of the Sharia review brief](../../sharia-review-brief.md). The brief has been **answered** by Fadwa (a licensed lawyer with endowment expertise) and **designated the authoritative review by the product owner** — but **Q10 was left unanswered** (S4 memo, Q-E5-4/5). So the deferral no longer rests on "nobody has been asked"; it rests on "the reviewer was asked and did not answer." Re-put it when the formal signature is sought.

### OQ-06 · Maintenance reserve when the deed is silent — ✅ **ANSWERED (product owner, 2026-08-18)** — a PER-ENDOWMENT % AT THE NAZIR'S DISCRETION

⊕ **Opened 2026-08-18 (S6/E5), from the answered Sharia review.** This is [Q3 of the brief](../../sharia-review-brief.md): *if the deed stipulates no ṣiyāna reserve, is the default zero, or is a prudential minimum required before yield may be distributed?*

- **What the engine does today:** reserves **zero**. A deed silent on maintenance produces a waterfall whose first step is 0, and the whole yield proceeds to operating costs, Nazir fee and distribution.
- **What the review is reported to answer:** the Nazir **"may reserve a reasonable amount if needed."**

**Those are not the same answer, and the difference is not cosmetic.** "May reserve a reasonable amount if needed" is a **discretion granted to the Nazir**, exercised on the facts of a particular asset in a particular period. The engine's zero-default is an **automated rule**. Coding the discretion as a default — any default, including a "prudential minimum" percentage — converts a judgement the Nazir is supposed to make into a number the software picked, which is precisely the substitution [§2 of the brief](../../sharia-review-brief.md) exists to forbid. Coding it as *zero* is also wrong in a subtler way: zero is not the absence of an answer, it is the answer *"reserve nothing"*, asserted silently on every silent deed.

**Deliberately NOT acted on in S6/E5.** The engine's behaviour is unchanged. What this item asks the product owner to decide is the **shape of the mechanism**, not the number:

1. **Nazir-entered per period, no default** — the run halts (or blocks the period) until a human records a reserve amount **or** records "nil, reasoned". Most faithful to "may reserve if needed"; costs an interaction every period on every silent deed.
2. **Zero-default + a visible, auditable prompt** — the run computes with zero but the period is flagged *"no maintenance reserve was set and the deed is silent"* until acknowledged. Cheapest change; keeps a silent zero from being invisible.
3. **A configurable per-endowment reserve policy on the endowment record** (`nil | fixed | percentage | top-up-to-target`), set once at onboarding with a reason, so the discretion is exercised once and recorded rather than re-asked or assumed.
4. **Status quo, explicitly ratified** — the owner rules that zero is the correct automated default and the discretion is exercised outside the system.

**Engineering's recommendation was (3), with (2) as the interim.** A recorded per-endowment policy makes the discretion a *deed-adjacent fact about this endowment*, which is what it actually is, and it is the only option that leaves an auditable trace of who exercised the discretion and why. **This was a fiqh + product decision and was not engineering's to take** (CLAUDE.md Binding rule 4).

---

### ✅ ANSWERED — product owner, 2026-08-18, the same day

**Verbatim:** *"the law gives the nazir a discretion. at Qmulate each endownment will have a % set deserve at the nazir's discretion."* Recorded in the [S4 owner-decision memo](S4-owner-decision-memo.md), commit `a6962ca`.

**The ruling is (3), sharpened.** Not a policy object with four shapes — a **percentage**, per endowment, recorded at the Nazir's discretion. Where the deed **does** stipulate maintenance, the deed wins and none of this applies; the discretion exists only under a silent deed.

**What shipped in S6/E5, and it changes the money:**

| | Before | After |
|---|---|---|
| Deed stipulates a reserve | `FIXED` / `PERCENT` / `TARGET_TOPUP` | unchanged — **the deed wins** |
| Deed expressly stipulates *no* reserve | `NONE` | `NONE`, now documented as **a founder's condition** |
| Deed silent, Nazir recorded x% | *(unrepresentable)* | **`NAZIR_DISCRETION_PERCENT`** — a separate kind from `PERCENT`, because one is the founder's condition and the other the trustee's discretion |
| Deed silent, nobody has decided | `NONE` — **indistinguishable from the row above** | **`UNSET`** → reserve zero **+ flag `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED`** |

**The defect this closes was never arithmetic.** Before the ruling, a deed the founder wrote saying "no maintenance reserve" and a deed nobody had ever looked at produced **byte-identical runs**, because both were spelled `NONE`. Zero is not the absence of an answer; it is the answer *"reserve nothing"*, and the engine was giving it on the Nazir's behalf. The amounts are still identical — which is exactly why the difference is carried by a **flag** and by the trace's `reserveAuthority` (`SHART_AL_WAQIF` | `NAZIR_DISCRETION` | `NOBODY`), never by the number.

**Where the figure lives:** `Setting['distribution.maintenance.nazirDiscretionPercent']`, **per-endowment, with deliberately no global row** — a platform-wide default percentage would be a figure nobody chose applied to every endowment, i.e. this same defect one layer up. Seeded on `waqf-001` only; `waqf-002` and `waqf-003` carry none *on purpose*, so the fixture exercises both sides. ⚠ The seeded 5% is **invented fixture data**, not a ruled rate — the *discretion* is the owner's ruling, the *number* is a figure and carries binding rule 3's marker.

**Engineering interim, flagged in the memo and NOT ruled:** until a policy is recorded the engine reserves zero and the run carries the flag. The run still computes — turning it into a `SHART_INCOMPLETE` halt would block every silent-deed endowment on day one — but no silent deed can distribute its whole yield in a run that looks like one a human signed off.

✅ **THE TAIL IS ANSWERED TOO — product owner, 2026-08-18, the same day: (b), a DEDICATED permission string.** Recording an endowment's maintenance-reserve percentage gets its own verb, held by the `nazir` seat only. *"Same people, cleaner record: an auditor reading the access matrix sees a maintenance decision gated by a maintenance permission. No behavioural widening — the seat set is unchanged."*

Shipped as `finance:maintenance_policy:{read,write}` in the `nazir` preset **and no other**, asserted in both directions, behind `finance.maintenanceReservePolicy.{get,set}`.

⚠ **AND THE QUESTION AS THIS LEDGER POSED IT WAS WRONG, which is worth more than a tidy closure.** It said the interim was "an ordinary `Setting` row behind `checkerProcedure('fee:nazir_fee:approve')`". Measured while building the answer: `settings.set` governs `nazirFee.*` keys and **refuses every other registered key**, so `distribution.maintenance.nazirDiscretionPercent` had **no request-path write surface at all** — it was recordable only by a seed edit or by raw SQL. The borrowing this item complained about did not exist; what existed was a figure the ruling requires and no way for a Nazir to record it. The implementation therefore *builds* the path rather than *renaming* a gate.

⚠ **Provenance caveat, kept:** the Q3 wording *"may reserve a reasonable amount if needed"* reached this ledger through the product owner's memo, not through anyone in-repo reading the review. The artifact is still not in the repository. The owner's ruling above stands on its own and does not depend on it.

---

## Carried defaults (decided unless overridden)

These are **decided**. They are listed so a stakeholder who wants to reopen one is reopening a choice, not filling a gap. To change any of them, raise it against the tagged owner and update the referencing PRD section.

| Default | Value | Owner to reopen |
|---|---|---|
| **Mobile app role** | Beneficiary / Family-Board **portal**, **Phase 2**; scaffolded day one (Expo). | [Product] |
| **Auth** | Self-hosted **better-auth** — email/password + **TOTP** for money/filing roles. | [Product] |
| **Typefaces** | **Outfit** (display/body) + **Geist Mono** (uppercase wide-tracked labels) + **IBM Plex Sans Arabic** (RTL). "Madani" dropped. | [Design] |
| **Theme** | **Light-first neumorphic + glass** product UI (dark-neu optional); **flat light theme** for printable statements / evidence packs. *(Changed 2026-07-26 from dark-first, by design decision — see [`design/DESIGN.md`](design/DESIGN.md) v0.2.)* | [Design] |
| **Government platforms** | **Manual status fields**, no live integrations. | [QMULATE] + [Counsel] |
| **Nazir-fee basis** | **10% of revenue** (ʿushr) for this deed; basis configurable platform-wide. | [QMULATE] |
| **Hosting (interim)** | **Railway** now; **KSA residency + PDPL before production**; fixture-only until KSA prod exists. | [Product] |

---

## How to close an item

1. Owner records the decision (email/memo to the engagement file).
2. Update this row: strike the question, state the decision, link the memo.
3. If the decision changes behavior, update the **referencing PRD section** and its acceptance criteria in the same change.
4. A closed **blocking** item must be reflected before the dependent requirement is marked done.

---

## Requirements covered

- **Functional:** [BR-101](../brd/06-functional-requirements.md), [BR-505](../brd/06-functional-requirements.md), [BR-506](../brd/06-functional-requirements.md), [BR-507](../brd/06-functional-requirements.md), [BR-508](../brd/06-functional-requirements.md), [BR-509](../brd/06-functional-requirements.md), [BR-510](../brd/06-functional-requirements.md)
- **Non-functional:** [NFR-03](../brd/08-nonfunctional-requirements.md) (KSA data residency / PDPL — grounds OQ-03), [NFR-07](../brd/08-nonfunctional-requirements.md) (≥10-year retention — grounds OQ-03 historical depth)
- **Source:** [BR §10 · Assumptions & Open Questions](../brd/10-assumptions-open-questions.md), [BR §09 · Data & Integration](../brd/09-data-integration-landscape.md), [BR §11 · Roadmap](../brd/11-roadmap-phasing.md)
