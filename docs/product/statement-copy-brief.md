# Statement-Copy Drafting Brief — beneficiary-facing wording for the distribution run

**Privileged & Confidential · Prepared 2026-08-20 for Fadwa (drafter) and the product owner (approver)**
*Rev 4 — Rev 3's corrections plus the completeness pass: the five WITHHELD (gate) reasons the brief's own
ground rule 4 protects were missing entirely (REV4-H1); the third reversion run-notice added to the review
list (REV4-M1); and item 3's death-vs-scope question ruled by the owner — one code, one deliberately-covering-both sentence (REV4-M2, 2026-08-20). Each verified against source.*

## What this is and why it exists

QMULATE's distribution engine explains, for every beneficiary on every run, **why they received what they
received — or why they received nothing this period**. Each explanation is stored as a machine code; the
screen and the printed statement must render each code as a human sentence in **Arabic (authoritative) and
English**. Engineering is forbidden from writing these sentences: they are legal wording a family member may
dispute, so they must be **drafted by you and approved by the product owner**, then wired in verbatim.

**What we need from you:** for the items in Parts 1–4, one sentence in Arabic and one in English per item,
suitable for an official beneficiary statement issued by the Nazir.
For Part 5's four items, **review** of an existing sentence.
Short, neutral, and precise about whether the condition is temporary or permanent — that distinction is the
single most disputed thing a statement can say.

**Ground rules for the wording:**

1. **Arabic is the authoritative text**; the English is a faithful rendering of it, not the reverse.
2. **Never make a temporary condition sound permanent, or a permanent one sound temporary.** Each item is
   marked which it is — including two whose underlying record is *editable*, where the safe wording states
   the recorded status without promising permanence.
3. **Never state or imply anyone's death, or an expectation of it.** Some conditions resolve on an ancestor's
   death; the sentence must not read as "wait for your father to die."
4. A **withheld** share (paperwork gate) is different in kind from an **excluded** one (not entitled this
   period). Withheld = the money is kept intact for that person. The wording must never blur the two.
5. **The male-line rule is about the chain, not the person.** Where a deed continues lines "through sons"
   (ظهور), what matters is that every ancestor *between the person and the founder* is a son — the person
   themself may be male or female (a son's daughter is included; a daughter's children are not). The Arabic
   must never read as "males only."
6. Figures, dates and names are inserted by the system — draft around placeholders where needed
   (e.g. «...» for a name), or draft sentences that need none.
7. If you believe an item's stated meaning is wrong, don't draft around it — flag it; the meanings below were
   verified against the engine's own documentation and two review passes, but the rule stands.

---

## Part 1 — Exclusion reasons (why a beneficiary receives nothing this period)

| # | Code | What it means, plainly | Temporary or permanent | Drafting pitfall |
|---|------|------------------------|------------------------|------------------|
| 1 | `UPPER_TABAQA_EXTANT` | The deed pays generations **in order** (الأعلى فالأعلى), and a member of a higher generation is still living, so this person's generation is not yet entitled. | Temporary (ends when the higher generation ends) | Must not read as a defect in the person; it is the deed's ordering working. Must not imply anticipation of the elder generation's death. |
| 2 | `TABAQA_EXTINCT` | On an ordered deed, this generation has no living members and sits below the entitled one; the line records the tier's place in the order. | Permanent for that tier | The line prints on statements that the tier's **heirs** may read; registral in tone, dignified about the deceased. |
| 3 | `BENEFICIARY_INACTIVE` | This person's **own recorded status** excludes them — either a recorded death, or a removal from the endowment's scope. Nothing about their ancestors. ⚠ **Owner decision (2026-08-20): this stays ONE code with ONE sentence deliberately covering both facts.** | One sentence for two facts: a recorded **death** (permanent) and a **scope removal** (reversible). State the recorded status **without promising permanence**. | The single hardest wording ask in this brief: the sentence must be honest to a bereaved family AND to a member who may be reinstated. Factual, dignified, status-neutral — and a reversible removal must not sound final. |
| 4 | `ZERO_STIPULATED_WEIGHT` | The deed assigns this recipient a share weight of **zero**. On **ordered/shared** deeds this can exclude any zero-weighted recipient. ⚠ On a **lineage** (default) deed it applies **only to a recorded ultimate taker (charity)** — family members on a lineage deed are **never** excluded for their weight (per capita is their rule). | Stands for as long as the deed records the zero weight | The system did not decide this — **the deed did**; attribute it to the founder's stipulation. The sentence must be safe for both audiences it can reach (a charity-taker on any deed; a family recipient on ordered/shared deeds) — draft two variants if one sentence cannot serve both. |
| 5 | `BUTUN_LINE_NOT_CONTINUED` | The deed continues lines **through sons** (ظهور فقط), and an ancestor **between this person and the founder** is a daughter — so the deed does not continue their line. The person's own sex is irrelevant: a son's daughter IS included; a daughter's children are not (ground rule 5). | **Permanent under this deed** | The hardest one. Must be unmistakably permanent (no false hope) yet attributed to the founder's condition, not the person; must not read as a judgment on the daughter or her line; and must not read as "males only." |
| 6 | `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` | Entitlement sits at the nearest **living** point of each family line; an ancestor of this person is alive and holds it, so this person waits. | **Temporary** | ⚠ The Arabic must NOT read as permanent, and must not read as "you receive it when X dies." Frame as: the entitlement currently rests with «the ancestor»; this person's position is preserved. |
| 7 | `REVERSION_PENDING_LIVING_BLOODLINE` | The deed names this charity as the endowment's **ultimate taker (مآل الوقف)** — it takes only once the family line has ended, and it has not. | Temporary (by the deed's design) | Addressed to a charity. ⚠ Engine's own warning, passed through: the wording **must not promise the charity that it waits for the family's *extinction*** — it waits for the end of **the last line the deed continues**; a survivor on a line the deed does not continue does not hold the endowment. Never as an expectation of the family's end. |
| 8 | `REVERSION_PENDING_BLOODLINE_UNENUMERATED` | The deed names this charity as ultimate taker, but **every recorded descendant is an unenumerated placeholder** (a category of people never individually recorded) — so the family's end cannot be certified, and the reversion is held. ⚠ Prints on the **charity's own** statement. | Temporary — reverses on an **enrolment**, not on a death | Must read as an **incomplete register**, never as a refusal of the charity's appointment — and must NOT assert "the bloodline is living," because nobody is individually recorded as living; the honest statement is that the record is not yet complete. |


## Part 2 — Withheld reasons (an ENTITLED beneficiary whose payment is gated) — the other half of ground rule 4

*These five are the **withheld** vocabulary: the person **is entitled and keeps their full share** — it is
retained intact in the endowment's account until the gate clears, and is never given to anyone else. ⚠ Their
only existing Arabic is **error-message copy** (validation-toast register) — the wrong voice for a statement
line telling a living, entitled person their money is held. These are arguably the most-disputed lines a
statement can carry, so each needs fresh statement wording. All five are temporary by nature.*

| # | Code | What it means, plainly | Drafting pitfall |
|---|------|------------------------|------------------|
| 9 | `CATEGORY_NOT_CAPTURED` | The recipient belongs to a beneficiary category the deed names as a class (e.g. "the poor of the district") whose individual members have not yet been captured in the register; the share is held until capture. | Must read as "your class is entitled; individual enrolment is pending" — not as doubt about the class or the person. |
| 10 | `ENTITY_UNLICENSED` | The recipient is a legal entity (e.g. a charitable body) whose licence is lapsed or unverified; the share is held until the licence is current. | Held, not forfeited — the entity keeps its share. Must not read as an accusation; licences lapse routinely. |
| 11 | `STALE_KYC` | The recipient's identity verification exists but is out of date; the share is held until it is refreshed. | The single most common gate. Must read as routine and procedural — "refresh and receive" — never as suspicion. |
| 12 | `KYC_UNVERIFIED` | The recipient's identity verification has not yet been completed; the share is held until it is. | Same voice as 11; first-time verification, not re-verification. |
| 13 | `CROSS_BORDER_PENDING` | The recipient is outside the Kingdom; the payment is routed through the approved cross-border channel and awaits it. It is **not blocked** — it takes a dedicated path. | Must read as a routing status, not a refusal; the deed's entitlement is unaffected by geography. |

## Part 3 — Entitlement rules (the basis printed beside a PAID share) — all seven

| # | Code | What it means, plainly | Drafting pitfall |
|---|------|------------------------|------------------|
| 14 | `LINEAGE_PER_CAPITA_ZUHUR_ONLY` | Entitled by descent: only **sons' lines** continue past the founder's children (ground rule 5), and within a continuing line entitlement rests at the **nearest living head** — a person with a living ancestor between them and the founder is *not* entitled. Equal share per entitled head this period. | Must name the deed's continuation condition (ظهور) without editorializing; must not read as "males only"; and must not imply every living descendant shares — the living-frontier rule is part of the meaning. |
| 15 | `LINEAGE_PER_CAPITA_ZUHUR_AND_BUTUN` | Entitled by descent: **both** sons' and daughters' lines continue, and within each line entitlement rests at the nearest living head (a descendant whose parent is alive is not entitled). Equal share per entitled head this period. | Same care as 14 — the frontier is part of the meaning. |
| 16 | `ORDERED_LOWEST_LIVING_TABAQA` | Entitled as a member of the **most senior generation still living**, under the deed's ordering (الأعلى فالأعلى). Within that generation, shares follow the **deed's recorded weights**. *(The code says "lowest" because tiers are numbered from 1 at the top — lowest index = most senior.)* | "Most senior still living" must be precise — the classical مرتّب sense; and the share is the deed's weight, not automatically equal. |
| 17 | `SHARED_ALL_LIVING_TABAQAT` | Entitled under the deed's sharing rule (التشريك): all living generations share together, and shares follow the **deed's recorded weights**. | Keep the deed attribution; do not imply equal splitting — the weights decide the money. |
| 18 | `ULTIMATE_TAKER_MAAL_AL_WAQF` | Paid as the deed's ultimate taker: the family line **the deed continues** has ended, and the deed directs the endowment's yield to this recipient. | Printed in the period a family endowment's continuing line **ends** — ⚠ family members on lines the deed does *not* continue may still be alive and will read it, alongside the deceased line's heirs. Must be exact about the deed's authority for the transfer and dignified about the line's end. |
| 19 | `NA_DIRECT_USE` | This endowment is a **direct-use** one (ذات انتفاع مباشر): its benefit is enjoyed in kind rather than distributed as money. No monetary shares are computed; the statement records this as the basis. | Must not read as "nothing is owed" — the benefit exists, in kind. ⚠ Arabic already exists for this *value* under three other screen labels; this sentence is the **statement** text and must be drafted fresh for a beneficiary reader, not copied from a label written for staff. |
| 20 | `JOINT_FIXED_DEED_SHARES` | The recipient's share is a fixed deed share on a joint-form record. ⚠ **Unreachable twice over**: the engine refuses joint-form records outright, and even bypassing that refusal the resolver has no arm for this label (it would halt, not render). The sentence is commissioned anyway because the enforced copy-register lists it as owed, and a drafted sentence is cheaper and safer than a register exemption. | Keep it registral; it describes a record form the product refuses, so precision matters more than warmth. |

## Part 4 — Trusteeship-deed eligibility notices (shown on the deed screen)

| # | Code | What it means, plainly | Temporary or permanent | Drafting pitfall |
|---|------|------------------------|------------------------|------------------|
| 21 | `REP_ELIGIBILITY_WITHOUT_REPRESENTATIVE` | An eligibility conclusion concerning an **authorized representative** was requested, but no representative is recorded on this trusteeship deed. | Temporary (resolves when a representative is recorded, or the request is withdrawn) | A registral notice; must not imply a representative *should* exist. |
| 22 | `REP_ELIGIBILITY_NOT_ASSESSED` | A representative is recorded on this deed, but their eligibility assessment has not yet been performed and recorded. | Temporary | Must read as "assessment pending," never as a doubt about the person. |

## Part 5 — Run-level notices: REVIEW of four existing sentences (not fresh drafting)

⚠ *Correction from Rev 2: these notices already carry shipped Arabic and English — written by engineering
under the staff-label precedent, i.e. never yet reviewed as beneficiary-facing legal text. Your task here is
to **confirm or amend** each sentence below, not to draft from scratch. These four are selected (out of
thirteen run notices) because their subject is a founder-conditions outcome a family member or charity may
dispute; the other ten are operational notices (deadlines, unverified figures, and similar) whose review is
deferred to the general statement-copy pass. The English of each is quoted; the Arabic equivalent is in the
same catalogue and will be provided alongside.*

| # | Code | Existing English (for your review) | What must stay true |
|---|------|-------------------------------------|---------------------|
| 23 | `REVERSION_TO_ULTIMATE_TAKER_APPLIED` | "The deed's ultimate-taker clause took effect: the distributable went to the party the deed names, at the weight the deed [records...]" | The run-level mirror of #18 — same audience caution: living family members on discontinued lines may read it. |
| 24 | `REVERSION_NOT_TRIGGERED_DESCENDANTS_LIVING` | "The ultimate-taker clause did not take effect: a line the deed continues remains among the descendants, so the distributable stayed in the endowment." | ⚠ **This notice fires only when NOBODY is entitled this period** — the whole distributable is retained in the endowment, recoverably, rather than going to the charity. It is NOT reassurance boilerplate: the reader learns that no one was paid and where the money sits. Rev 2 of this brief glossed it as "the pool was handled normally," which was **wrong** and is corrected here. |
| 25 | `REVERSION_NOT_TRIGGERED_BLOODLINE_UNENUMERATED` | "The ultimate-taker clause did not take effect: the descendant register is not fully enumerated, and no line may be declared [ended...]" | The run-level mirror of #8 — same rule: an incomplete register, never a refusal of the charity's appointment, and never an assertion that the bloodline is living. |
| 26 | `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED` | "The deed is silent on maintenance and no Nazir discretion is recorded, so the reserve was zero — and that zero is not a [decision...]" | Must read as "a decision is pending," never as "no maintenance is needed." |

---

## Process — stated exactly

1. Fadwa drafts Arabic + English for Parts 1–4, and confirms or amends Part 5's four sentences.
2. The product owner approves the final wording (his approval is what makes it product text).
3. Engineering wires the approved text verbatim into the ar/en catalogues and empties the owed-copy register.

**What the existing enforcement does and does not guarantee** (stated precisely because this document asks
for an approval): the platform's copy-register test guarantees the debt is **visible** — a code without
approved copy must be explicitly registered as owed, the register is printed on every test run, cannot rot
(a code that gains copy must be de-registered), and cannot name codes nothing emits. It does **not** by
itself prevent a registered code from rendering as a raw Latin code on a screen. **Wiring your approved text
and emptying the register is what removes that possibility** — which is why this brief exists.

*Sources: `packages/domain/src/distribution/contract.ts` (the code catalogues and their doc comments),
`packages/i18n/test/code-source-parity.test.ts` (the owed-copy register; the five withheld codes of Part 2 are
not yet on it — their registration is owed to engineering alongside Part 5's four),
`packages/i18n/messages/{ar,en}.json` (the shipped run-flag sentences quoted in Part 4), ADR-0009 and its
amendments, and the owner's rulings in `docs/product/prd/S4-owner-decision-memo.md`. Everything here
describes invented fixture data only; no real family appears.*
