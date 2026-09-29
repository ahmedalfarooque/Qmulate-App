# S4 owner-decision memo — everything blocking E3's honest closure that only the product owner can decide

*Prepared 2026-08-17; **answered by the product owner the same day, in session** — all ten. Source: the V-E3 register, the S4 close-out, ADR-0008 and ADR-0009. Binding rule 4:
each item below is surfaced with options, tradeoffs and a recommendation — none is resolved by engineering.
Answers are recorded **verbatim** in the "Owner's answer" slot, and the drifted side (if any) is named,
per the OQ-01 convention. Where a question is fiqh, the standing caveat applies: the owner is a practising
Nazir, not Saudi counsel; a legal filing turning on the point should still go to counsel.*

**How this memo relates to the sprint:** questions **Q1–Q8** decide whether G-9 clause 3 can be
un-qualified and E3's exit claimed. **Q9–Q10** are confirmations of working answers already recorded in the
2026-08-16 decisions log (D-A, D-E). None of the four engineering residuals (ar-E2E flake, H1
`test:guardrail`, CENSUS-1 verb census, V-E3-L2 spelling) needs the owner — they proceed in parallel.

---

## Q1 · G-9 clause 3 — the untiered ultimate taker in a tiered family cohort (THE gate-keeper)

**The situation.** G-9 clause 3 (no tier-excluded payment) is proven for tiered cohorts. Its qualification:
an **untiered** `CHARITABLE_JIHA` inside a **tiered** family cohort escapes I5's tier-exclusion check. R7 made
exactly that configuration *legal* — a recorded ultimate taker (مآل الوقف) carries no `tabaqa` because it is
not a descendant. What protects it today is the taker's **default exclusion** (`REVERSION_PENDING_LIVING_BLOODLINE`)
plus invariant **I-R1** (no charity paid in the same run as any descendant) — a guarantee *stronger* than I5,
but different from it, and R7/R7-d must not be quoted as closing the qualification (five premature closures
are on this record).

**Options.**
- **(a) Rule that I-R1 + default exclusion IS the closing guarantee for the taker case** — i.e. the untiered
  taker is *by design* outside tier logic, I5's claim is narrowed to descendants, and clause 3 is closed by
  owner ruling. Tradeoff: I5 stops claiming anything about the jiha line; the honest wording of the gate
  changes. This also resolves **R6-I5** (the I5 honesty gap — it is this question's second half).
- **(b) Require an additional structural guard** (e.g. refuse any untiered line in a tiered cohort unless it
  is the recorded taker, as a distinct discriminator). Tradeoff: more machinery guarding a state I-R1 already
  makes unpayable; adds a refusal the deed vocabulary doesn't need.
- **(c) Keep the qualification standing** into Phase 2. Tradeoff: Phase 1 cannot be called complete with a
  mapped gate qualified.

**Recommendation:** (a) — with the gate's wording rewritten to say precisely what is guaranteed by what.

**Owner's answer (2026-08-17): (a) — "I-R1 is the guarantee."** The untiered ultimate taker is by design
outside tier logic; I5's claim narrows to descendants; I-R1 + the taker's default exclusion close the gate.
**Consequences:** R6-I5 is resolved by the same ruling (the exemption is correct and now claimed, not an
honesty gap). ⚠ **G-9 clause 3 stays QUALIFIED until the implementation lands** — the ruling makes closure
engineering work (rewrite the gate's wording, re-scope I5's claim, pin it), not a pending decision. The
un-qualification happens in that change, with this ruling cited, never before it.

---

## Q2 · Is the مآل (reversion) a fact about the waqf or about the waqif?

One waqif may found several endowments, and a per-deed clause can disagree across them. The schema currently
records it **per waqf** (four columns on `Waqf` + `waqf_reversion_taker`).

- **(a) Per waqf** (current): each deed's clause stands alone; two endowments of one waqif may name different
  takers or none. Matches "recorded deed clause, never inferred."
- **(b) Per waqif**: one clause spans the waqif's endowments. Tradeoff: contradicts the deed-clause framing;
  a migration; and forces an answer when deeds genuinely disagree.

**Recommendation:** (a) — the clause is text *in a deed*, and deeds disagree in reality.

**Owner's answer (2026-08-17): (a) — per waqf.** The current schema (four columns on `Waqf` +
`waqf_reversion_taker`) is confirmed; no migration owed. The "waqf or waqif" open question in
`packages/domain/src/distribution/__tests__/fixtures/README.md` and register item #12's tail closes.

---

## Q3 · Is the reversion one-shot or recomputed every period?

Today the engine **recomputes**: if a later-recorded heir surfaces after the taker has been paid, the
reversion reverses — the heir is entitled again — while halalas already paid to the charity are not
recoverable by the engine (recovering them is a legal act, not a computation).

- **(a) Recomputed** (current): the register can always be corrected; the trigger is a *state*, not an event.
  Tradeoff: a paid charity may later turn out to have been paid in a period a bloodline member existed —
  the record shows it honestly, but the money moved.
- **(b) One-shot**: once triggered, the waqf is permanently a charity's. Tradeoff: a clerical omission
  (an unrecorded grandchild) would permanently disinherit a bloodline — irreversible on bad data.

**Recommendation:** (a). Fail-safe under incomplete records; the irreversibility of (b) is the C-10 shape.

**Owner's answer (2026-08-17): (a) — recomputed.** The engine's current behaviour is confirmed as the
product's position: the trigger is a state; a later-recorded heir reverses the reversion; already-paid
halalas are a legal recovery matter outside the engine. ADR-0009's open question (c) closes.

---

## Q4 · Allocation among SEVERAL ultimate takers — deed weights or per capita?

Never asked before. Current behaviour: each taker takes its **deed weight** (`stipulatedWeight`); an all-zero
weight vector is **refused**, never split equally — per capita is the bloodline's rule, not a charity's.

- **(a) Deed weights** (current): the deed says how the charity share splits; absent weights halt.
- **(b) Per capita among takers**: simpler, but invents an allocation the deed did not state — against
  binding rule 1's grain.

**Recommendation:** (a), unchanged; confirm so it stops being engineering's assumption.

**Owner's answer (2026-08-17): (a) — deed weights.** Current behaviour confirmed: each taker takes its
`stipulatedWeight`; an all-zero vector halts rather than splitting equally. No longer engineering's assumption.

---

## Q5 · The `ORDERED`/`SHARED` strict-trigger asymmetry (opened by R7-d, never asked)

R7-d defined *"the bloodline is over"* as **no continuing line** — but that widening was scoped to
`LINEAGE_CONTINUATION` deeds. `ORDERED` and `SHARED` deeds still trigger the reversion on the **strict**
reading: *no living descendant at all*. Two deed shapes, two answers to the same question.

- **(a) One trigger everywhere — no continuing line**: under `ZUHUR_ONLY`, a living grandchild through a
  deceased daughter no longer blocks the مآل, whatever the entitlement order. Consistent; matches R7-d's
  rationale (the deed's continuation stipulation defines the bloodline).
- **(b) Keep the asymmetry**: `ORDERED`/`SHARED` deeds wait for the last living descendant of any line.
  More conservative toward the family; but it means the same deed clause (مآل + `ZUHUR_ONLY`) fires at
  different moments depending on an unrelated setting (the entitlement order).
- **(c) Halt** (`SHART_INCOMPLETE`) when a مآل clause meets `ORDERED`/`SHARED` and the two readings diverge,
  pending per-deed interpretation.

**Recommendation:** (a) — the continuation stipulation, not the entitlement order, defines whose line counts;
but this is squarely fiqh and is yours (or counsel's) to rule.

**Owner's answer (2026-08-17): (a) — one trigger everywhere.** "No continuing line" (R7-d) now applies on
`ORDERED` and `SHARED` deeds too; the strict no-living-descendant reading is retired. **Consequence:** an
engine change is owed (widen the trigger beyond `LINEAGE_CONTINUATION`, with the enumeration-style proof the
R7-d change carried). The asymmetry register item closes as *decided*; implementation is owed to the S4
close-out or S5. *(Fiqh caveat: owner is a practising Nazir, not counsel — standing caveat applies.)*

---

## Q6 · The three خيري-nature refusals — engineering's fail-safe reading of R5, awaiting your confirmation

On a `PUBLIC_CHARITABLE` (خيري) waqf the engine refuses:
1. **`DESCENDANT_ON_CHARITABLE_WAQF`** — any member carrying a `lineageLink` (a bloodline fact on a
   no-bloodline deed);
2. **`TABAQA_ON_CHARITABLE_WAQF`** — any member carrying a `tabaqa` (a generation on a no-generations deed);
3. **R6-F1 scoping** — the lineage-edge requirement applies **only** to ذري deeds, so a خيري deed's unnamed
   segment needs no fabricated bloodline.

All three are marked `TODO(surface)` — refusals shipped on Claude's reading of R5, not your ruling.

- **(a) Confirm all three** — the markers come off; the refusals become product positions.
- **(b) Overrule any** — name which, and the engine widens accordingly.

**Recommendation:** (a). A خيري waqf carrying bloodline facts is at minimum a data error worth halting on.

**Owner's answer (2026-08-17): (a) — all three confirmed.** `DESCENDANT_ON_CHARITABLE_WAQF`,
`TABAQA_ON_CHARITABLE_WAQF`, and R6-F1's ذري-only scoping of the lineage-edge requirement are now **product
positions**, no longer engineering's fail-safe reading. The `TODO(surface)` markers on these three may come
off — citing this ruling — and register item #13's clause about "three refusals awaiting owner confirmation"
closes.

---

## Q7 · ESC-2 — must a self-contradicting record be refused even when no money moves?

A **tiered jiha** on a **direct-use** (`NA_DIRECT_USE`) waqf short-circuits before the tier check, so the
self-contradiction goes unreported — harmless today (direct use pays nothing, I7 retains everything), but the
engine has answered the same precedence question **two different ways**: `CHARITABLE_JIHA_ON_FAMILY_WAQF`
refuses the incoherent record even when unpayable; `JIHA_TIERED` lets it compute. R7 gave this a second
reachable shape (ذري direct-use with a tiered taker).

- **(a) Refuse the record** (validity checks precede short-circuits): one rule everywhere — *a record that
  cannot describe a real endowment halts, payable or not*.
- **(b) Compute-if-harmless**: fewer halts; but the register knowingly carries a self-contradiction, and the
  precedence stays settled in two directions at once.

**Recommendation:** (a).

**Owner's answer (2026-08-17): (a) — refuse the record.** Validity precedes short-circuits: a record that
cannot describe a real endowment halts even when nothing would be paid. **Consequence:** ESC-2's both shapes
(خيري direct-use with a tiered jiha; ذري direct-use with a tiered taker) become refusals — an engine change
owed, with the 240-cell census cells re-pinned from *computes-unreported* to the new discriminator.

---

## Q8 · A3 — is soft-retiring an endowment (`waqf.deletedAt`) a reserved matter?

Today `deletedAt` is **ungoverned**: the least-privileged role can soft-retire an endowment with no approval.
The guard was deliberately NOT shipped, because whether retiring an endowment is *always* a reserved matter is
your call, not a migration's.

- **(a) Yes — reserved matter**: setting `deletedAt` on a live waqf requires an approved reserved-matter
  request, like the other identity-level acts. Un-retiring likewise.
- **(b) No — operational act** for `nazir`/`case_manager` seats, audited but not gated.

**Recommendation:** (a). An endowment is perpetual; making it disappear from operations is at least as grave
as renaming its certificate.

**Owner's answer (2026-08-17): (a) — reserved matter.** Setting (and clearing) `waqf.deletedAt` on a live
endowment requires an approved reserved-matter request. **Consequence:** the guard deliberately not shipped in
S4 is now owed — same family as the identity guards, and the census must declare it. A3 closes as decided.

---

## Q9 · Confirm D-A — the closed asset-status vocabulary

Your 2026-08-16 answer was prefixed *"I'm thinking"*, so it is recorded as a **working** vocabulary. As
implemented (enum `AssetStatus`): `ACTIVE`, `FULLY_RENTED`, `PARTIALLY_RENTED`, `VACANT`, and — engineering's
split of your "expropriated/substituted", flagged for overrule — `EXPROPRIATED` (government taking) and
`SUBSTITUTED` (the Nazir's own istibdal, ≤10-business-day Authority notice *(verify — may be stale)*).
`sold`/`pledged`/`mortgaged`/`long_leased` are **unrepresentable** — stricter than before, coherent with
waqf perpetuity. The Arabic labels currently on these six are engineering's rendering of ordinary property
terms, **not** product-approved legal copy.

**Needed:** confirm the six values (or amend), and either approve the Arabic labels or mark them owed to the
same E10/E12 review path as the statement copy.

**Owner's answer (2026-08-17), verbatim:** *"remove 'sold'. since an endowment asset cannot be sold, if
expropriated by government - they will replace with similar valued asset."*
**Reading:** `sold` was already unrepresentable (not among the six) — the answer **confirms its exclusion is
his ruling**, not engineering caution, and by extension confirms the six-value vocabulary including the
EXPROPRIATED/SUBSTITUTED split. **New fact recorded:** on expropriation the government replaces with a
similar-valued asset — i.e. the expected flow is expropriation → replacement corpus asset, matching the
`Expropriation` → istibdal model (proceeds/replacement stay corpus, Binding rule 1). ⚠ The Arabic labels were
**not addressed** and therefore stay flagged, owed to the E10/E12 review path (the fallback in the question).

---

## Q10 · Confirm D-E's fallback — deed WRITE stays nazir-only

Your D-E answer settled deed **read** (nazir, case manager, eligible beneficiaries). The question asked was
about **write**; write was therefore left with the `nazir` seat only, recorded as a narrow fallback, not your
ruling. (Separately: *eligible beneficiaries may see the deed* touches BR-210 self-isolation and the BR-702
access matrix — E4/E9 owes the reconciliation; nothing for you to decide there unless you want to narrow it.)

**Needed:** confirm nazir-only deed write, or name the additional seat(s).

**Owner's answer (2026-08-17), verbatim — two parts.** First: *"the deed cannot be changed by anyone after
written by the waqif"* — which describes the **waqf deed** (already immutable, Binding rule 1). On
clarification that the question was the **trusteeship deed**: *"oh my bad, the trusteeship deed can only be
editted by a court judge."*
**Reading (engineering's rendering, flagged):** no system seat may edit a recorded `TrusteeshipDeed` — the
record is **write-once for every user**. A judge is not a system user, so "edited by a court judge" is
rendered as: a court-ordered change enters as a **new superseding record carrying the court instrument as
evidence**, never as an edit — the same superseding-instrument convention Binding rule 1 uses for the Shart.
Initial recording stays with the `nazir` seat. **Consequence:** an immutability guard on `trusteeship_deed`
(UPDATE refused for all seats; supersession via new row) is owed — note AV4-01 already put `trusteeship_deed.id`
in the identity-guard family. ⚠ The rendering (judge ⇒ superseding recorded instrument) is flagged for the
owner's confirmation since it converts "edit" into "supersede".

---

## Not in this memo (why)

- **AV4-02 / A1** (`qmulate_app` can mint and spend its own approval in one transaction) — HIGH and open, but
  it is an **engineering** authorization-plane change already named in ADR-0008; no owner decision needed,
  only prioritization. Recommended: schedule it as its own work item before any real data.
- **R7-A1…A5** (surviving mutations / honesty gaps that move no money) — engineering debt, recorded.
- The four S4 engineering residuals (ar-E2E flake · H1 · CENSUS-1 · V-E3-L2) — proceeding regardless.
- **HQ city (register item #7)** — still open, blocks nothing until a printable statement carries an address.

---

# S5 addendum — owner decisions during E4 (2026-08-17/18)

## Q-E4-1 · What does D-E's "eligible beneficiaries may see the deed" mean as an access rule?

Raised by the S5 builder: "eligible" is a computed, time-varying fact (frontier-based, changes on a death),
and the schema forbids persisting entitlement verdicts as columns — so the word cannot be read off a row.
Options were (a) deed read for **every beneficiary of that endowment** (own waqf only; a held/excluded member
can also read it — the deed is what tells them why); (b) compute entitlement at read time (a fiqh computation
on an access path; a `SHART_INCOMPLETE` deed unreadable to the people it affects; access flickers on a death);
(c) a staff-attested flag (persists a judgment beside the forbidden stored-verdict class).

**Owner's answer: (a).** Every beneficiary principal of a waqf may read **that waqf's** deed; self-isolation
otherwise untouched. Consequence, named when asked: a member currently held behind a living ancestor or
excluded under a line the deed does not continue can also read the deed. The beneficiary preset gains
`endowment:deed:read` scoped to own-waqf; BR-210/BR-702 reconciliation records this ruling.

## Q-E4-2 · Portal KYC — the builder's write-nothing default is OVERRULED in MODEL

The builder's default was: keep beneficiary sessions write-nothing in Phase 1, staff record KYC on
beneficiaries' behalf, portal write path owed to the portal epic.

**Owner's answer, verbatim: "beneficiary should enter their own kyc info - staff verifies and can request
more."**

**What it decides:** the KYC data-entry model is **beneficiary-entered, staff-verified** — a maker-checker
shape (beneficiary = maker of their own KYC record; staff verify and may request more information). "Staff
record on behalf" is NOT the product's model; it is at most an interim operational fallback, and the record
must not describe staff-entry as the design.

**Timing — RULED (owner, 2026-08-18): PHASE 2, with the beneficiary portal.** The self-entry surface ships
in the portal epic; until then staff enter KYC on beneficiaries' behalf as the stated interim, and beneficiary
sessions keep the write-nothing posture as an implementation state. The owed item in BUILD-PLAN/§17 reads:
*"beneficiary-entered KYC, staff-verified with request-more loop (owner model, Q-E4-2) — ships with the
portal epic (owner timing, 2026-08-18)."*

*(The other default in the same question — fixture `waqf-003` re-typed خيري — was not objected to and stands
as invented sample data; it never required a ruling.)*

---

# S6 addendum — owner decisions during E5 (2026-08-18)

## Q-E5-1 · May a mis-classified receipt be corrected? — **(b) BOTH DIRECTIONS, RESERVED-MATTER-GATED**

Subject: rev-004 (SAR 20M expropriation compensation, CAPITAL). The in-place flip is dead at the database
(migration 19); the question was whether any correction FLOW exists. **Owner's answer: (b)** — a correction
flow exists in **both directions** (income→capital and capital→income), and **every** such correction requires
an approved reserved-matter request. The flow is a **superseding record** (reversal entry + re-entered receipt,
both audited), never an edit. *(Engineering's recommendation was asymmetric gating (c); the owner chose the
stricter uniform gate — one rule for all reclassification corrections.)*

## Q-E5-2 · Is a committed receipt's amount correctable? — **(b) IN-PLACE EDIT, AUDITED**

Subject: rev-001. **Owner's answer: (b)** — a committed receipt's `amountSar` may be corrected **in place**,
with an audit event. ⚠ **Consequence, named:** this deliberately departs from the superseding-record
convention used elsewhere (Shart, trusteeship deed, receipt class) — a committed financial figure can change
in place, and the audit event (before/after captured) is the record of it. Engineering still owes the
narrower questions this opens (which seats hold the edit; whether maker-checker applies to the edit itself) —
those are wiring choices the builder surfaces if non-obvious, within this ruling.

## Q-E5-3 · Non-dedicated bank accounts — **(a) REPRESENTABLE, UNPOSTABLE**

**Owner's answer: (a)** — an `isDedicated=false` account may exist as a record (e.g. documenting a legacy
commingled account during onboarding) while the posting guard makes it permanently unpostable. Confirms the
shipped behaviour.

## Q-E5-4/5 · The answered Sharia Review Brief — PROVENANCE ESTABLISHED, DESIGNATED AUTHORITATIVE

The answered copy (`Sharia Review Brief (1)__.docx`, OneDrive/Teams chat files, modified 2026-07-26; located
2026-08-18 by the orchestrator session) — **owner's answers, verbatim: "yes fadwa is a liscenced lawyer with
a endowment expertise" and "yes"** [to treating it as the authoritative review pending formal signature].

**What this decides:** the brief's answers were written by **Fadwa — a licensed lawyer with endowment
expertise** — and the owner **designates them the authoritative review, pending formal signature**. The
record moves from *"Sharia review unsigned, rules open"* to *"answered by Fadwa (licensed lawyer, endowment
expertise), designated authoritative by the owner 2026-08-18 — formal signature owed."* The confirmed rulings
include Q6's core classifications (rent=income; sale/istibdal=capital; expropriation=usually capital;
non-diminution absolute), the waterfall order, no-guessing, ordered/shared semantics, and
withhold-never-reallocate. **Still open:** Q10 (zakat, unanswered), Q6(f)–(i) (key money · insurance proceeds
· post-istibdal arrears · income-funded siyana reserve — added to the brief 2026-08-18, unanswered), and the
Q3 nuance (silent deed: "may reserve a reasonable amount if needed" vs the engine's zero-default — owed a
reconciliation). ⚠ **One distinction the record keeps, without reopening the decision:** the brief was
addressed to a waqf-fiqh scholar for a مراجعة شرعية; the answers are a licensed endowment lawyer's. Whether a
separate scholar's فتوى is ever sought on top is the owner's discretion, not a blocker.

## OQ-06 · Silent-deed maintenance reserve — **PER-ENDOWMENT % AT THE NAZIR'S DISCRETION**

The review (Q3): the Nazir *"may keep a reasonable amount for necessary maintenance if needed"* — a
discretion. The engine's zero-default asserted "reserve nothing" silently on every silent deed.

**Owner's answer (2026-08-18), verbatim: "the law gives the nazir a discretion. at Qmulate each endownment
will have a % set deserve at the nazir's discretion."**

**What it decides:** where the deed is silent on maintenance, **every endowment carries a per-endowment
maintenance-reserve policy, expressed as a PERCENTAGE, set at the Nazir's discretion** — a recorded decision,
not a system default. Zero is a valid percentage, but it is *recorded as the Nazir's choice*, never assumed.
A deed that **does** stipulate maintenance is unchanged — the deed wins; the discretion applies only where
the deed is silent. **Engineering interim (flagged, not ruled):** until an endowment's policy is recorded,
the engine reserves zero and the run carries a visible "reserve policy unacknowledged" flag — no silent deed
distributes 100% of yield without a human having said so. The policy is a `Setting`-class figure (config,
not code — binding rule 3 flag-on-use applies to any suggested default %).

## S7 · REV4-M2 — `BENEFICIARY_INACTIVE` stays ONE code: **(b) — owner, 2026-08-20**

The code covers two facts the engine cannot distinguish (a recorded death — permanent; a scope removal —
reversible), and the question was whether to split it into two codes with two honest sentences, or keep one
code with one deliberately-covering-both sentence. **Owner's answer: (b) — one code, one sentence.** The
drafter writes wording that states the recorded status without promising permanence, honest to both a
bereaved family and a member who may be reinstated. **Consequences, named:** no engine input change and no
version bump; the statement line is deliberately status-neutral; and the separately-recorded
death-certification-reversal design item stays open on its own merits — this ruling is about the statement's
vocabulary, not about how deaths are certified.

## S7 · Migration 27 — retiring a PAID distribution run: **CONFIRMED (owner, 2026-08-20)**

Engineering extended the Q8 + AV7-F4 soft-delete gate family to `distribution.deletedAt` (a paid run is at
least as grave a record as a receipt), shipped flagged as engineering's reading with `TODO(surface)`.
**Owner's answer, verbatim: "confirmed."** The extension is now the owner's ruling; the `TODO(surface)`
markers on migration 27's four flag sites may come off citing this entry.

## S7 · AV7-F4 — soft-deleting a committed receipt: **(a) UNIFORM, RESERVED-MATTER-GATED (owner, 2026-08-20)**

The S7 adversarial pass found that a soft-deleted CAPITAL receipt becomes invisible to the corpus accounting
(non-diminution cannot watch what it cannot see). The question routed to the owner: does a soft-deleted
INCOME receipt deserve the same answer? **Owner's answer: (a) — uniform.** Soft-deleting **any** committed
receipt — income or capital — is a **reserved-matter-gated act**, the same logic as Q-E5-1's reclassification
gate: anything that changes what is distributable gets the gate. The income/capital difference appears in the
refusal's stated reason, never in its strictness. *(The rejected alternative, recorded: capital undeletable
absolutely + income deletable as an audited ordinary correction.)*

## S7 · E2E-vs-rate-limiter posture — **APPROVED (owner, 2026-08-19)**

S7 stage 1 root-caused the six-sighting E2E flake to `next dev` self-termination; the measured fix is running
E2E against a **production build**, which trips the auth rate limiter. **Owner approved (verbatim: "rate
limiter option approved," following "push approved"):** a **test-environment-only override via an explicit
env var that FAILS CLOSED** — absent means full rate limiting, so production posture cannot be weakened by
accident. The override is documented in the gate transcription; the tripwire (E2E red rather than falsely
green when the posture is wrong) stays.

**OQ-06 tail — which seat records the policy (owner, 2026-08-18): (b) — a DEDICATED permission string.**
Recording an endowment's maintenance-reserve percentage gets its own permission (a maintenance-policy write,
held by the `nazir` seat only), replacing the interim borrowing of `fee:nazir_fee:approve`. Same people,
cleaner record: an auditor reading the access matrix sees a maintenance decision gated by a maintenance
permission. No behavioural widening — the seat set is unchanged.

---

# S8 addendum — owner decisions during E7 (2026-08-23)

*The four unblock-chain questions (S8-Q3 → Q5 → Q1 → Q2) were put to the owner as a structured
choice with options, tradeoffs and recommendations (binding rule 4); the owner selected one option
per question on 2026-08-23. The selected option is recorded verbatim below. The remaining batch
items (S8-Q4, S8-Q6–Q10, CDE-Q2, CDE-Q5, BR-609, the Art. 18 framework gap) are still open and
nothing here answers them.*

## S8-Q3 · Classification-gate vocabulary — **ADOPT §09'S FIVE GATES**

**Owner's answer (2026-08-23), verbatim selection: "Adopt §09's five gates (Recommended)."**
Add `has_income` + `exclude_direct`; **retire `LARGE_ONLY` as refused-not-remapped vocabulary**
(the JOINT/ADR-0004 precedent — zero §09 rows, zero fixture rows use it). Gate assignments per
obligation are transcribed from §09, every one flagged *verify — may be stale (confirm vs primary
law)*. **Consequence, named by engineering and known to the owner at answer time:** `has_income`
is a **runtime predicate**, not a static class set — §09 says so in terms — and
`CLASSIFICATION_GATE_MATRIX` is a total `Record<Gate, Record<Class, boolean>>` that cannot express
it at any width. The gating resolver therefore gains a second input (does this endowment have
income in the period — a fact about the ledger, not about the classification). That design is
engineering's to make within this ruling. This unblocks the E7 migration and the 7 previously
unrepresentable templates, including FIN-DIST-01/02.

## S8-Q5 · Obligation-template immutability — **SHIP IT IN E7**

**Owner's answer (2026-08-23), verbatim selection: "Ship it in E7 (Recommended)."**
`libraryVersion` column + UPDATE guard + tasks carry a frozen `templateCode`+`templateVersion`
snapshot + census entry. The register becomes evidence of *what was owed at the time*. This also
closes the ungoverned-identity exposure migration 16's census measured (`compliance_obligation.id`
re-writable by the application role — an obligation renameable onto another's identity, silently
re-writing every task tracing to it).

## S8-Q1 · The AML obligation ROW itself — **COMPARTMENT THE ROW**

**Owner's answer (2026-08-23), verbatim selection: "Compartment the row (Recommended)."**
The GOV-AML-02 obligation row and its status changes are visible **only inside the AML
compartment**; the general register shows nothing AML-attributable. The register keeps the duty;
the board cannot leak it. This deliberately departs from §09's literal text (obligation on the
general register at gate `all`), which is now the drifted side — §09 owes a supersession note
citing this ruling. *(Fiqh/legal caveat: Saudi AML no-tipping-off law; the owner is a practising
Nazir, not counsel — a filing turning on this should still go to counsel.)*

## S8-Q2 · The Nazir and the SAR's existence — **NAZIR INSIDE BY CONSTRUCTION**

**Owner's answer (2026-08-23), verbatim selection: "Nazir inside by construction."**
The legally accountable Nazir seat **always sees the compartment** — membership by construction,
not by explicit grant. This **supersedes the shipped code's contrary doctrine**
(`packages/api/src/middleware/aml.ts`'s "no other role, INCLUDING THE NAZIR BY DEFAULT, reads the
compartment without it" — that sentence was engineering's fail-safe reading and is now the drifted
side). It resolves the recorded collision in favour of the accountability principle already
hard-coded on `ApprovalRequest` (an approval hidden from the accountable Nazir is one they cannot
audit). **Consequences owed to engineering:** compartment membership derivation gains a
by-construction arm for the `nazir` seat on that endowment (explicit grants remain for every other
seat); the middleware doctrine text and its tests change; the fixture gains at least one
by-construction member, which is what finally gives the no-tipping-off suite a real inside-arm.
⚠ **Still open within Q2 and NOT answered here: the SAR retention period** (≥10y is unverified —
binding rule 3; whether a SAR's clock is even the same clock is unasked; route to counsel).
*(Same counsel caveat as Q1. The widened knowledge set is exactly the seat regulators hold
accountable — recorded as the owner's accepted tradeoff.)*

## S8 addendum, second batch (2026-08-23) — Q4, Q6, Q12, BR-609

*Same mechanism as the first batch: structured choice with options, tradeoffs and recommendations;
the owner's selection recorded verbatim. One answer overrules the orchestrator's recommendation and
is recorded as such.*

### S8-Q4 · Unclassified endowment — **`NOT_CLASSIFIED` ENUM MEMBER**

**Owner's answer (2026-08-23), verbatim selection: "NOT_CLASSIFIED enum member (Recommended)."**
An explicit not-yet-classified value; the register **locks** (no tasks instantiate) until the real
classification is recorded. A real onboarding state, stated rather than NULL. Unblocks exit clause
A2 as a schema change (enum member + the register-lock rule), not a fixture edit. `NOT_CLASSIFIED`
must never gate a template TRUE — it is the absence of a determination, not a class.

### S8-Q6 · GovernmentFiling status change — **REQUIRE CHECKER APPROVAL**

**Owner's answer (2026-08-23), verbatim selection: "Require approval (Recommended)."**
A filing status change to `submitted` needs an approved request — the same maker≠checker shape as
money movement; G-3's "filings cannot be self-approved" becomes enforced rather than aspirational.
`ApprovalType.GOVT_FILING` finally gets a minter; the approver seat stays `nazir` (already decided).

### S8-Q12 · Retiring an obligation TEMPLATE — **ORDINARY MAINTENANCE, AUDITED — ⚠ OVERRULES THE ORCHESTRATOR'S RECOMMENDATION**

**Owner's answer (2026-08-23), verbatim selection: "Ordinary maintenance, audited."**
The owner sides with the builder's reading: retiring a catalogue template is catalogue upkeep, not
retiring an endowment's record — audited, **not** reserved-matter gated. The orchestrator had
recommended the gate; that recommendation is rejected and the rejection is the record. The
`TODO(surface)`-style flag on the builder's reading may come off citing this entry. *(The accepted
tradeoff, stated at answer time: a seat with catalogue write can retire a template without a second
approval; the audit trail is the control.)*

### BR-609 · Nazir-handover in E7 — **TRACEABILITY NOTE ONLY**

**Owner's answer (2026-08-23), verbatim selection: "Traceability note only (Recommended)."**
§09 gains a note that BR-609 is deliberately absent from the Phase-1 library and scheduled Phase 3
(BRD roadmap), so the absence reads as a decision. No register row in E7.

## S8 addendum, third batch (2026-08-24) — the two Fadwa-document questions

### Item 3 (statement-copy brief) · **REV4-M2 STANDS** — the doc's "ON HOLD" is the drifted side

**Owner's answer (2026-08-24), verbatim selection: "REV4-M2 stands (Recommended)."**
The 2026-08-20 ruling (BENEFICIARY_INACTIVE stays one code / one sentence) holds; the answered
document's "ON HOLD — DO NOT DRAFT YET" marker predates or missed it. Fadwa drafts item 3's wording
per the ruling; the code stays on the owed register until her wording arrives. The contradiction
recorded in APPROVED-WORDING.md and BUILD-PLAN closes with this entry as the resolution.

### Item 6 (English wording contains untranslated Arabic "محفوظًا") · **WIRE AS-IS NOW**

**Owner's answer (2026-08-24), verbatim selection: "Wire as-is now."**
Item 6's English is transcribed verbatim including the Arabic word — which is exactly what M1-a
(`027efe9`) did, with the anomaly PINNED by a fidelity test so it cannot be silently "fixed" in
code. The correction, if any, arrives only as a re-issued wording from the drafter in the follow-up
round (which also owes the six blank sentences / seven codes and now item 3), and lands by editing
the provenance document + fidelity locks — never by editing the catalogue directly.

## S8 addendum, sequencing (2026-08-24) — the session after M1-b

### S9 scope · **INSTANTIATION FIRST** — a short E7-completion stage before E8 opens

**Owner's answer (2026-08-24), verbatim selection: "Instantiation first (Recommended)."**
The session after M1-b builds the per-endowment task-instantiation engine (the missing half of
Engine A), claims E7's exit and G-6 properly on measured evidence, and only THEN does S9 = E8
(deadline & notification engine) open — E8's deadlines attach to instantiated tasks, so the
dependency order is natural. The plan's S9 row gains this preceding stage rather than being
re-scoped.

## S8 addendum, fourth batch (2026-08-25) — the post-Milestone-1 owner batch

*Twelve items put to the owner as structured choices with options, tradeoffs and recommendations
(binding rule 4), across three rounds on 2026-08-24/25; the selected option is recorded verbatim.
One selection (migration 34's door) OVERRULES the orchestrator's recommendation and is marked so.
Counsel-routed items are PROVISIONAL by the owner's own election — counsel confirms later, and a
reversal lands as a superseding entry here, never an edit.*

### Register #12 · exclusion-reason precedence — **RATIFIED: PERMANENT OVER TEMPORARY**

**Owner's answer (2026-08-25), verbatim selection: "Ratify permanent-over-temporary (Recommended)."**
When a member is dual-blocked (living ancestor + a line the deed does not continue), the statement
reports the PERMANENT reason. The shipped behaviour becomes the product's position; the
`TODO(surface)` markers in resolver.ts and the register-#12 citations at M1-b's literal sites may
come off citing this ruling. Moves no money — only which sentence a beneficiary reads. The
"unratified precedence" bound inside the Milestone-1 claim (`a432bba`) is DISCHARGED by this entry.

### S8-Q9 · The ten untracked framework duties — **MINIMUM THREE BECOME TEMPLATES**

**Owner's answer (2026-08-25), verbatim selection: "Minimum three now (Recommended)."**
1-3#6 (the duty binding rule 1's SHART_INCOMPLETE refusal hands off to), 1-2#2 and 3-3#2 become
obligation templates; the remaining seven are recorded as deliberate non-coverage with reasons.
Implementation owed (library version bump per S8-Q5's immutability ruling — new rows, never edits).
Arabic wording must be sourced, never invented (the GOV-COI-01 lesson applies).

### Migration 34 · return to NOT_CLASSIFIED — **ALLOWED, RESERVED-MATTER-GATED** ⚠ overrules the orchestrator's recommendation

**Owner's answer (2026-08-25), verbatim selection: "Allow return, reserved-matter-gated."**
An erroneous real classification MAY return to `NOT_CLASSIFIED` via a maker≠checker reserved-matter
approval (e.g. a classification entered on the wrong endowment entirely). The one-way door gains
exactly this gated exception; the default refusal stands for the ungated path. Implementation owed:
the gate, the audit shape, and the interaction with instantiated tasks (the return re-locks the
register — what happens to tasks instantiated under the erroneous classification must be DESIGNED,
not defaulted; engineering surfaces the shape before shipping).

### S8-Q10 · `suspicionSummary` at rest — **FIELD-ENCRYPT NOW**

**Owner's answer (2026-08-25), verbatim selection: "Field-encrypt now (Recommended)."**
`AmlReport.suspicionSummary` joins the field-encryption set (existing FIELD_ENCRYPTION_KEYS infra).
The compartment controls who reads; encryption protects against the database itself leaking.
Implementation owed (one migration + the column joins the encrypted census).

### S8-Q7 · The seven portal-readable models — **DEFERRED TO THE PORTAL EPIC**

**Owner's answer (2026-08-25), verbatim selection: "Defer to the portal epic (Recommended)."**
The CENSUS-P pin keeps the set from growing silently; the read-matrix ruling lands when the portal
epic designs beneficiary-facing reads deliberately. No change now.

### S8-Q8 + CDE-Q2 routing — **PROVISIONAL ANSWERS NOW, COUNSEL CONFIRMS LATER**

**Owner's answer (2026-08-25), verbatim selection: "Provisional answer now, counsel confirms later."**
The three provisional rulings follow. Each is owner-provisional pending Saudi counsel; the register
carries them flagged, and a counsel reversal reshapes obligation rows as a NEW library version.

### S8-Q8a · GOV-SHART-02's compound cadence — **TWO ROWS: ONCE + ANNUAL REVIEW** (provisional)

**Owner's answer (2026-08-25), verbatim selection: "Two rows: ONCE + ANNUAL review (Recommended)."**
GOV-SHART-02 splits: prepare the bylaws (once) and review them (annual), each a clean single
cadence E8 can compute. Implementation owed (library version bump; the UNRESOLVED_RECURRENCE
question-reason on the row retires with the split).

### S8-Q8b · GOV-GEN-01's compound cadence — **ANNUAL + ON-REQUEST** (provisional)

**Owner's answer (2026-08-25), verbatim selection: "Annual + on-request (Recommended)."**
The periodic duty is ANNUAL (the audited-statements cycle); on-request access is conduct, not a
schedulable task. One ANNUAL row. Implementation owed (same library-version mechanics).

### CDE-Q2 · the 15-business-day clock — **EFFECTIVE DATE** (provisional)

**Owner's answer (2026-08-25), verbatim selection: "Effective date (Recommended)."**
The clock runs from the change's effective date — §09's shipped default, now owner-provisional
rather than engineering's. A late discovery does not extend the deadline; a missed window is
reported. Counsel confirmation queued (it is a point of law).

### SAR retention — **ADOPT ≥10Y, FLAGGED UNVERIFIED**

**Owner's answer (2026-08-25), verbatim selection: "Adopt ≥10y, flagged unverified (Recommended)."**
SAR rows (AmlReport/AmlFollowUp) join the ≥10-year retention posture as a configurable Setting
marked "verify — may be stale (confirm vs primary AML law)". Counsel confirmation queued. Closes
the gap S8-Q2's ruling left open. Implementation owed if the AML tables are not already under the
retention guard (verify, don't assume).

### G-6 claim standard — **(b) BOUNDED CLAIM**

**Owner's answer (2026-08-25), verbatim selection: "(b) Bounded claim (Recommended)."**
G-6 is claimed with clause 2 explicitly BOUNDED as fail-closed-by-construction (the mayDispatch
54-cell refusal + source census) until E8's real pipeline forces the measurement. No throwaway
channel is built to test it. *(The E7-completion builder had independently reached (b) and said so
before this ruling arrived; this entry converts that engineering judgment into the owner's
position — the claim in its stage log now rests here.)*

### CDE-Q5 · the first client's four classifications — **OWNER WILL PROVIDE; DATA STILL OWED**

**Owner's answer (2026-08-25), verbatim selection: "Provide the four now."**
The selection was made but the four values did not accompany it. The data remains OWED and this
entry is not a classification of anything; the real endowments stay `NOT_CLASSIFIED` until the
values arrive (and any SAR-band figure behind them is unverified vs primary law).

### Recorded with the batch, unanswered (new item, from the E7-completion stage)

The instantiation-time income basis — `hasIncome` = at least one non-deleted ledger row at the
instant of the act — is ENGINEERING'S reading of A6's period-less wording, `TODO(surface)` in
`compliance.ts`. Distinct from and narrower than the still-open periodic-register period question.
Owed to the next batch.

## S8 addendum, fifth batch (2026-08-25) — the classification axes

### CDE-Q5 prelude · Is direct-utilization a SIZE CLASS or an ORTHOGONAL ATTRIBUTE? — **(a) ORTHOGONAL ATTRIBUTE**

**Owner's answer (2026-08-25), verbatim selection: "a"** — to the orchestrator's framed choice:
*"(a) The Authority's size bands are three (large/medium/small), and ذات انتفاع مباشر is an
orthogonal usage attribute, not a size — an endowment could be small AND direct-use."* The owner
had stated the taxonomy in their own words first: *"there are 3 types of endowments: وقف عام خيري -
وقف مشترك - وقف الخاص (الاهلي - الذري); there are 3 types: large, medium, small."*

**What this rules:** the Authority's size classification has THREE values — large / medium / small
(thresholds unverified vs primary law, as ever) — and **direct-utilization (ذات انتفاع مباشر) is a
separate axis**: a usage attribute an endowment carries alongside its size, not instead of it.

**What is now the drifted side:** the shipped `WaqfClassification` enum (schema, §09, the E7
engine's gate table, fixture `waqf-004`, and `docs/domain/`'s regulation summary) conflates the two
axes by carrying `DIRECT_UTILIZATION` as a fourth classification value. Consequences, all OWED and
none taken silently:
- The classification axis narrows to LARGE / MEDIUM / SMALL (+ NOT_CLASSIFIED per S8-Q4); direct
  use becomes its own recorded attribute — **no default**: an endowment whose usage is unrecorded
  is UNRECORDED, not "not direct".
- §09's `exclude_direct` gate and the `SMALL_DIRECT` income-conditional cell re-key on the
  attribute rather than on a classification value. The E7-completion stage's **A6 claim stands as
  measured behaviour** (the dry/wet contrast is real); its VOCABULARY is now known-drifted — noted,
  not retracted.
- ADR-0004 discipline applies: the enum member is **refused, never remapped**; the migration is
  owed to a successor stage (candidate: alongside S9/E8's library-version bump, or its own stage —
  sequencing is the owner's call at S9 kickoff).
- Counsel flag: the regulation summary reads the classification instrument as FOUR categories; the
  owner (a practising Nazir) reads direct-benefit as an attribute. **Verify against the Arabic
  original with counsel** — this entry records the product's position, not a legal finding.

**Still open from the same exchange (asked, unanswered):** (1) confirmation that وقف مشترك in the
owner's taxonomy is a RESTATEMENT of the Authority's oversight-category label (register item #11,
2026-08-03: "a waqf cannot be both") and not a reversal — the orchestrator's strong assumption,
awaiting the owner's word; (2) CDE-Q5's actual data — the four endowments' type + size values.

### الوقف المشترك · REGISTER ITEM #11 IS REVERSED BY THE OWNER — a joint waqf IS a single endowment, partially ذري and partially خيري

**Owner's answer (2026-08-25), verbatim: "i was wrong earlier, a joint waqf is described as
partially ذري and partially خيري."**

This SUPERSEDES the 2026-08-03 ruling (register item #11: المشترك as an Authority oversight
category; *"a waqf cannot be both"*) — by the protocol's own rule, as a new entry, never an edit.
The correction aligns with the Awqaf Law Art. 4's literal text, which was the original 2026-08-03
open question. The 2026-08-03 counsel caveat stands and now cuts the other way: this too is the
product's position (the owner is a practising Nazir, not Saudi counsel) — **verify with counsel**.

**What turns on this — SURFACED, NOT IMPLEMENTED (binding rule 4; nothing in the engine moves on
this entry alone):**
1. **The refusals' NAMES are now wrong even if their behaviour stays.** `WAQF_TYPE_JOINT_NOT_POSSIBLE`
   asserts impossibility; the reversed doctrine makes joint POSSIBLE-BUT-UNSUPPORTED at most. The
   same reconsideration reaches `COHORT_MIXES_CHARITABLE_AND_FAMILY` (already narrowed once by R7's
   ultimate-taker exemption).
2. **I-R1** ("no charity is ever paid a halala in the same run as any descendant") is FALSE BY
   DESIGN on a true joint deed, where a jiha takes its deed share alongside the family every
   period. It remains a correct invariant OF THE CURRENTLY SUPPORTED SHAPES; its framing as "R5 as
   a runtime assertion" narrows to those shapes.
3. **The S3-D2 defect class returns as LIVE DESIGN WORK if joint is ever supported** (a lapsed
   family share inflating a jiha's fixed share was dissolved BY the refusal, not fixed).
4. **Record sites owing superseding notes:** register item #11, `docs/domain/glossary.md`'s
   المشترك line, `docs/domain/regulations/awqaf-law.md`'s Art. 4 annotation, ADR-0009 amendment B,
   fixture waqf-003's re-typing rationale (the invented DATA stands; the doctrine cited for it is
   superseded).

**THE DECISION THIS OPENS (owner to rule, options + recommendation):**
(a) **Refuse-as-unsupported for now (RECOMMENDED):** rename/reword the discriminators so they say
    "not supported", not "not possible"; joint support becomes a designed epic with its own fiqh
    questions (share basis between the ذري and خيري portions, the S3-D2 lapse question, I-R1's
    re-scoping). (b) **Support joint computation now:** concurrent family + jiha by deed weights —
    a large engine change touching I-R1, the cohort validators, and the statement copy.
**And one question of fact, asked with it:** do any of the first client's four endowments fall
under مشترك? If yes, (a) still holds for MVP but the epic gains a real subject and a deadline.

### المشترك consequence · **(a) REFUSE-AS-UNSUPPORTED** — rename the discriminators; joint support is a later designed epic

**Owner's answer (2026-08-25), verbatim selection: "a".**
The engine keeps refusing joint deeds, but as SCOPE, not doctrine: `WAQF_TYPE_JOINT_NOT_POSSIBLE`
(and the impossibility language around `COHORT_MIXES_CHARITABLE_AND_FAMILY`) must be renamed/reworded
to say NOT SUPPORTED. Joint support becomes its own epic when taken, carrying the open design
questions this batch enumerated (portion split basis, the live S3-D2 lapse question, I-R1
re-scoping). Implementation owed (rename per ADR-0004 discipline — refuse the old name, never remap
silently). ⊕ The question of fact is MOOTED by the CDE-Q5 data below: none of the first client's
endowments is مشترك.

### CDE-Q5 · **CLOSED — the first client's endowments enumerated by the owner (2026-08-25)**

**The data (anonymized per the confidentiality rule — real waqf names, deed/certificate numbers and
individuals' names were provided in the owner's message of 2026-08-25 and are deliberately NOT
recorded here; the owner holds the mapping):**

- **FIVE endowments, not four.** The record (CLAUDE.md, the S2 handover, this memo's own framing)
  carried "4 endowments across 3 waqifs"; the owner's enumeration is FIVE. The record is corrected
  where it states the count; the SharePoint-era "4" was stale or pre-dated one endowment.
- **Type: ALL FIVE are ذري (FAMILY_DHURRI).** No مشترك among them; no خيري.
- **Size: ALL FIVE are MEDIUM — PROVISIONAL, pending official valuation.** The owner explicitly
  reserves the right to change each on valuation. The shipped machinery already honours this:
  classification lands as a normal act, a later valuation moves it FORWARD via
  `classification.reclassify` (task diff + history, A3/A4), and the S8-Q4 gated return door exists
  for outright error. The provisional flag travels with each classification when real data lands.
- **Two waqf-level facts the model should note (anonymized):** (1) title/ownership deeds carry a
  RENEWABILITY status (قابل للتجديد / غير قابل للتجديد) — a per-deed fact `Asset`/`Document` does
  not currently model; candidate column owed to a later epic, surfaced not decided. (2) One nazir
  (an individual) + one deputy serve ALL FIVE endowments — the TrusteeshipDeed primary vs
  authorized-representative pair, now with a real shape behind it.

**CDE-Q5 is CLOSED as a question.** The values enter the database only when real client data lands
on KSA-resident infrastructure (the DATA_CLASSIFICATION=fixture-only gate stands); nothing in the
fixture changes on this entry.

### Deed renewability · **NO DEDICATED MODEL — AUDIT-TRAILED EDITS** (owner, 2026-08-25)

**Owner's answer (2026-08-25), verbatim: "the renewability could just be audit trailed and the
numebrs could be editted thru admin / nazir."**

Renewability gets NO dedicated column or workflow: a deed renewal that changes a number is an EDIT
to the deed/certificate identity, captured by the audit trail. ⚠ **Compatibility note, kept with
the ruling:** deed/certificate identity on a live endowment is a RESERVED MATTER (binding rules;
the asset_identity_guard class), so "edited thru admin / nazir" is read as the NAZIR-INITIATED
RESERVED-MATTER FLOW — the maker≠checker approval path that already exists — not a new ungated
edit route. Nothing is weakened by this entry; if the owner intended a LIGHTER path than the
reserved-matter gate, that is a separate question to raise explicitly, not to fold in.

### The endowment reference-number structure (owner data points, 2026-08-25 — reference, anonymized)

Each endowment carries THREE identity documents (structure recorded; real numbers stay with the
owner):

1. **صك النظارة (Nazarah deed)** — COURT-issued; authorizes the nazir to manage the waqf.
   → maps to `TrusteeshipDeed`.
2. **شهادة الوقف (waqf certificate)** — AWQAF-AUTHORITY-issued; carries the nazir, the waqf
   number, waqf location and name — **and the certificate has its own name/identity**.
   → maps to `Waqf.certificateNumber`, but the certificate's OWN NAME is a fact the model does not
   yet carry.
3. **صك الوقفية (waqf deed)** — COURT-issued; attests the waqif endowed the listed assets
   (ownership deeds) and **contains the waqf TYPE**; **its number is referenced on the waqf
   certificate**.
   → maps to `Waqf.deedNumber`; the cross-reference (certificate quotes the وقفية number) is a
   VALIDATION CANDIDATE — two documents claiming different وقفية numbers is an intake red flag the
   system could catch.

Plus per-asset **صكوك الملكية (ownership deeds)** → `Asset.titleDeedNumber`, already modelled.
Owed (surfaced, not decided): glossary entries for صك النظارة and شهادة الوقف (Sakk al-Waqfiyya
exists); the certificate-name field; the cross-reference check — all E-epic candidates, none
blocking.

## S9 addendum, first batch (2026-08-25) — the two S9-2/S9-4a blockers

### Library upgrade vs live registers · **EXPLICIT ACT, MAKER≠CHECKER** — new duties attach because someone attaches them

**Owner's answer (2026-08-25), verbatim selection: "Explicit act, maker≠checker (Recommended)."**
A library version bump changes only future instantiations by itself. Attaching newly-in-scope
templates to an ALREADY-instantiated register is a new audited act — "apply library vN to this
register" — per endowment, maker≠checker, reusing the reclassify diff shape: newly-in-scope
templates instantiate with a new reason (LIBRARY_UPGRADE), nothing retires implicitly. The
duty-tracking gap between the bump and the act is the owner's accepted operational window, visible
per endowment rather than silently closed. Implementation owed in S9-2/S9-3.

### Classification-axes migration sequencing · **OWN STAGE**

**Owner's answer (2026-08-25), verbatim selection: "Own stage (Recommended)."**
S9-4a stands as its own stage with its own mutation matrix — not folded into the library bump.
The S9-4a record commit cites THIS entry.

## S9 addendum, second batch (2026-08-27)

### Instantiation-time income basis — **ANY LEDGER ROW EVER** (ratifies engineering's reading)

**Owner's answer (2026-08-27), verbatim selection: "Any ledger row ever (Recommended)."**
"The waqf records income" = ≥1 non-deleted ledger row on the endowment at the instant of the act —
the shipped `hasIncomeAtInstant` reading is RATIFIED, period-less like §09 A6's own wording, erring
toward more duties tracked. The `TODO(surface)` on `hasIncomeAtInstant` comes off citing this entry
(the extraction stays — it remains the one place a future re-ruling lands). The separate
periodic-register period question stays open; nothing here answers it.

### Migration-34 return door · task disposition — **RETIRE WITH NAMED REASON**

**Owner's answer (2026-08-27), verbatim selection: "Retire with named reason (Recommended)."**
The return-to-NOT_CLASSIFIED act retires the open tasks with reason "classification returned to
NOT_CLASSIFIED" — rows kept, history queryable, the reclassification-retirement shape reused. A
later correct classification runs a fresh instantiation. This completes the design the fourth
batch's ruling demanded before the door could be built; the door + this disposition are now
BUILDABLE as one stage (S9 tail or successor sprint — sequencing engineering's).

### FIN-MGT-05 cadence — **ANNUAL; the periodic half is CONDUCT** (provisional, counsel confirms)

**Owner's answer (2026-08-27), verbatim selection: "Annual, periodic = conduct (Recommended)."**
The schedulable duty is ANNUAL (the audited statements); الدورية is ongoing conduct like
GOV-GEN-01's on-request half — real, but not a calendar task. Provisional pending counsel, same
mechanics as the S8-Q8a/b rulings: a library-version bump moves the row from cadence-less to
ANNUAL and retires its UNRESOLVED_RECURRENCE entry citing this ruling. ⊕ The attached gate-reading
note (FIN-MGT-05 applies to a moneyless direct-use endowment because its gate is "all") was shown
with the question and NOT objected to — the declared transcription stands ratified-by-presentation.

## S9 addendum, third batch (2026-08-27, at S9 close) — the two S10/E9 gate items

### The worker's identity — **A DECLARED SERVICE SEAT**

**Owner's answer (2026-08-27), verbatim selection: "Declared service seat (Recommended)."**
E9's evaluator runs as a declared NON-HUMAN identity: enumerated minimal permissions
(`compliance:task:write` only), granted on every endowment it sweeps, visible in the access matrix
like any seat, its writes audited as SYSTEM-actor acts — **never maker acts: the seat can approve
nothing** (no second approval authority, the BR-105/BR-1103 line the deleted APPROVER role
established). E9's kickoff gate is DISCHARGED; the runner may be built. Design details (grant
provisioning, the seat's own audit shape) are engineering's within these bounds.

### MIRROR_UNDECIDED_WAIVED — **KEEP THE ABSTENTION**

**Owner's answer (2026-08-27), verbatim selection: "Keep abstention (Recommended)."**
A waiver is a DEADLINE fact, not a task fact: the linked task's status stays whatever the case
manager set, the waiver lives on the deadline record, and reports that read deadlines see it. No
status invents a fact; no new enum member; the evaluator's abstention bucket is ratified as the
permanent shape. The owner queue's MIRROR_UNDECIDED_WAIVED item CLOSES with this entry.

## S10 addendum, first batch (2026-08-28) — D1, the seat's audited actor type

### The service seat's `actorType` — **`SYSTEM`, WITH THE SCOPING BYPASS EXPLICITLY OFF**

**Owner's answer (2026-08-28), verbatim selection: "ok 2nd form as you recommended"** — the second
of two forms of `SYSTEM` put to the owner: `actorType: 'SYSTEM'` with `bypass` explicitly `null`,
as against `SYSTEM` left at the factory default (which supplies `bypass: 'system-job'`).

**The owner's reasoning, verbatim, given with the first half of the ruling (2026-08-28):** *"I think
system should be good, since i have not had a chance to really test the entire platform yet and so
when we are done building, i will test, add data, user testing etc - which will likely result in
changes/modification to the build - and i dont want issues /blockers to those changes, so i think
system is more reasonable for now. we can create a new user type/identity later if needed"*

**Why the question arose.** The third-batch ruling (2026-08-27) fixed the seat's audit shape as
*"writes audited as SYSTEM-actor acts"* while the same sentence required the seat be *"granted on
every endowment it sweeps, visible in the access matrix like any seat."* In this codebase those
pull against each other: `SYSTEM` is the **sole** `actorType` for which a scoping bypass is legal
(`packages/database/src/context.ts` — `assertBypassNotUser`, and `isBypassed` re-checks the actor
type), and the one exported system-context factory supplies `bypass: 'system-job'` **unless the
caller explicitly passes `bypass: null`** (the ternary tests `=== undefined`). A bypass skips six
guards in `extensions/scoping.ts` — not only row visibility but the write-authorization plane,
including the permission check that would otherwise hold the seat to `compliance:task:write`.
Engineering read the third batch's word as meaning *non-human rather than a person's* and proposed
`SERVICE`; the orchestrator ruled that a **re-reading of a bound is not a delegated design detail**
(the delegation clause is bounded by the six clauses, and the audited actor type is the one aspect
of the audit shape the ruling fixes) and returned it under binding rule 4.

**What is ruled.** The seat is `actorType: 'SYSTEM'`. Its `bypass` is **explicitly `null` at every
construction site** — never left to the factory default. The force filter therefore applies to the
seat exactly as to a human seat, `authorizedWaqfIds` resolves from its real grants, and every other
bound of the third-batch ruling is unchanged (enumerated minimal permissions, `compliance:task:write`
only; granted on every endowment it sweeps; visible in the access matrix; **never maker acts**).

⊕ **CLARIFICATION OF THE ORCHESTRATOR'S OWN DRAFTING, 2026-08-28 — the phrase "explicitly `null` at
every construction site" above is IMPRECISE, and following it literally BREAKS A CONTROL.** The
superseded phrasing is kept visible because the pull toward the literal is the whole point. The
owner's ruling is untouched: it was the verbatim selection *"ok 2nd form as you recommended"*, and
the substance — the seat holds no bypass — is unchanged. What is corrected is the orchestrator's
rendering of how that is expressed **per package**:

- In **`@qmulate/database`**, where the seat's context is built, the ruling is satisfied by an
  explicit literal: `bypass: null` in `makeServiceSeatContext`, written last in the object so no
  spread can reach it, with no parameter able to flip it.
- In **`@qmulate/api`**, the ruling is satisfied by **ABSENCE — and absence is the STRONGER form.**
  That package forbids the property outright: `toActorContext` states "NO `bypass`", and **MP-22
  (`packages/api/test/procedure-ladder.test.ts`) scans EVERY file under `src/` and fails on
  `/\bbypass\s*:/`**. Writing `bypass: null` there to look faithful to the wording above would turn
  MP-22 RED — measured, not argued: mutation T2 does exactly that and kills two tests. **A literal
  can be edited; a scan refuses the property's existence.**

**The general rule this establishes: "explicitly null" means "the bypass is not inherited from a
default" — it does NOT mean "the token `bypass: null` appears everywhere."** In a package that
refuses the property altogether, the absence IS the explicit answer, and it is the better one. Found
by the builder resisting the literal reading of a record the orchestrator had written; the reasoning
is recorded in the source file too, because the next reader of this entry will feel the same pull.

**The reasoning the owner accepted for the second form over the first.** A seat running with the
bypass ON during the owner's testing phase would not be the seat that ships: it would see every
endowment regardless of its grants, so the one class of defect user testing most needs to surface —
the engine touching an endowment it should not — could not appear. The second form keeps the escape
hatch **available** (one parameter, one place) against the blockers the owner is guarding against,
while leaving it OFF so that testing measures shipped behaviour.

⚠ **RECORDED AS THE KNOWN COST OF THIS FORM, so it is never discovered as a surprise:** unlike a
`SERVICE` seat — for which a bypass is refused **by type**, throwing at both chokepoints — this seat
remains *eligible* for a bypass. The guarantee is therefore a **convention that every future
construction site must keep**, not a structural impossibility. Engineering owes a control that makes
the convention hard to break silently, and any future flip of that parameter is a decision someone
makes, never a default they inherit.

⊕ **Correction recorded with the ruling:** the owner's *"we can create a new user type/identity later
if needed"* rested on the premise that `SERVICE` would be new work. It is not — `SERVICE` is already
a live member of `AuditActorType` alongside `USER` and `SYSTEM`, with its own refusal logic written.
Both options were available at equal cost. ⚠ Switching afterwards is cheap in code but leaves a seam
in the record: audit events already written as `SYSTEM` stay `SYSTEM`.

**Consequence:** S10/E9's priority 1 (the runner) is UNBLOCKED. The worker constructs its context
in-process — it must not arrive over HTTP, because rung 1 demands an `authorized` session and the
TOTP-enrolment gate is universal by the 2026-07-27 decision, which a seat cannot satisfy.

## S10 addendum, second batch (2026-08-31) — the anchor batch

### Anchor start-dates — **OPERATOR INPUT NOW, GOVERNANCE REFINED LATER**

**Owner's answer (2026-08-31), verbatim:** *"the stating dates for now should be an input field
that i can put. once there is clarity we can refine down th eline and increase governance"*

The clock-start dates that `REGISTER_30BD` and `ISTIBDAL_10BD` had no home for become **recorded
operator input**: a human enters them, the engine consumes them, and **nothing derives, infers or
defaults them.** This is the `continuationStipulation` shape applied to dates — the fact is
recorded or it is absent, and absence is not an answer.

⚠ **CONDITION attached by the orchestrator and accepted by presentation: BLANK MEANS "CANNOT
COMPUTE", NEVER "NO DEADLINE".** An unrecorded anchor makes the engine refuse that rule for that
endowment **by name**, exactly as it does today when routing. It must never be read as "nothing is
due" — a defaulted anchor would be a defaulted answer to *when the clock started*, and this repo has
ruled against that shape three times (OQ-06's ṣiyāna reserve, `continuationStipulation`, the
periodic-register period).

**⊕ A DECLARED KIND TRAVELS WITH THE DATE.** Owner's answer to the follow-up, verbatim: *"yes sure,
make a drop down if that helps."* The row records **which** date it is — the waqf documentation date
or the regulation-effective date — rather than leaving it to be inferred from whether the value
happens to precede the regulation. **The reason is the owner's own stated intent to refine later:**
storing a bare date preserves *when* but discards *what it is*, so a later refinement could not tell
which endowments were recorded on which basis without re-interviewing every one of them. One
dropdown now; a mechanical refinement later instead of another round of questions.

⚠ Which date governs, and the 30/10-business-day figures themselves, remain **unverified against
primary law** (binding rule 3) and are flagged for counsel wherever stated.

⚠ **STILL OPEN — `ISTIBDAL_10BD`'s second half is NOT answered by this ruling.** An input field gives
istibdal a completion date, but the only place the schema can record an istibdal **at all** is inside
`Expropriation`. **Whether VOLUNTARY (non-expropriation) istibdal is in Phase-1 scope is unasked and
undecided.** If it is not, that must be written down as a deliberate exclusion rather than left
looking like an oversight.

### `LICENSE_RENEWAL` — **ANSWERED FROM THE OWNER'S OWN ENUMERATION**

The owner supplied their own workbook rather than answering from memory — now
`docs/domain/licences-and-permits.xlsx`, transcribed with its rulings at
`docs/domain/licences-and-permits.md` and mirrored at `Qmulate/Domain Model/Licences and Permits.md`.

**Two scopes, and the split is load-bearing:** `النوع: مبنى أو أرض` (the property — attaches to
`Asset`) and `على الوقف (المنشأة)` (the waqf as an operating establishment — attaches to `Waqf`).
Engineering had asked about one; the owner supplied both, and merging them would be wrong.
**Three kinds kept, not flattened:** `تصاريح` permits · `تراخيص` licences · `شهادات` certificates.

**Owner rulings supplied with the list:**
- **Deeds do not expire** — verbatim: *"deeds dont expire"*. `صك الملكية`, `صك النظارة`,
  `صك الوقفية` are **OUT of the renewal rule**; all three already have homes (`Asset` title deed,
  `TrusteeshipDeed`, the `Waqf` deed). A renewal deadline against a deed is a deadline that never
  falls due.
- **Attestations are not licences** — `استمارة كشف على وسائل السلامة في المبنى` and
  `مشهد تعقيم وتنظيف` are evidence produced, not credentials that lapse: **OUT of the renewal rule.**
  (The ruling governs, not the column the owner filed them under.)
- **Spelling, owner-corrected:** `شهادة عدد السعودين` → **`شهادة مدد السعودين`**. Recorded exactly as
  given — `السعودين`, **not** `السعوديين`; the owner corrected `عدد`→`مدد` and left the second word,
  so it is not "improved" here.

⚠ **ONE WORKBOOK, TWO FEATURES — the excluded rows must not fall out of the product.** What the
rulings remove from the renewal rule are things the Nazir **must hold and be able to produce**, which
is the **document vault** (E9's own exit, BR-701–703), not the deadline engine.

⚠ **`رخضة إنشاء` is carried VERBATIM and is NOT CONFIRMED.** It reads as a likely typo for
`رخصة إنشاء`. The owner corrected a different entry in the same round and did not correct this one,
so it **must not be silently normalised** — ask before it becomes a canonical value.

⚠ **The vocabulary is a WORKING list, not a frozen enum**, per the sequencing ruling above: operator
input now, closed later from real data rather than from memory. Nothing here is counsel-verified.

## S10 addendum, third batch (2026-09-01) — the vault: retention enforcement + sprint shape

### Q1 · What enforces the ≥10-year retention — **OPTION (C): BOTH LAYERS, CLAIM THE PROVABLE FLOOR, OBJECT-LOCK OWED TO A NAMED GATE**

**Owner's answer (2026-09-01), verbatim and complete: *"c and keep in s10"*** — a selection from three
options put in prose, after the owner said *"i dont understand the difference between a b or c. explain
and help me decide for both q1 and q2"* and the options were re-explained plainly. **Both answers in
that one line; Q2 is recorded below.**

**THE OPTIONS AS PUT, because a bare "c" is meaningless without them.** The question was *what
physically prevents a document being deleted before its retention window expires* — BR-702 is a
**Must** traced to **Art. 20**, so the mechanism is what QMULATE can state to the Authority:

- **(A)** Application code checks the date and refuses. Defeatable by any developer, any future code
  change, or anyone with database access. *Presented as: a sign on the filing cabinet.*
- **(B)** **S3 object-lock** — the file is written with a retain-until date and the **storage layer
  itself** refuses deletion thereafter, even to the account owner. *Presented as: a time-locked safe.*
  Proving it needs a real S3-compatible target in the harness; MinIO normally needs Docker and **this
  machine has none** (the reason Postgres is embedded), and some S3 lookalikes **accept the lock
  instruction without enforcing it** — which would be worse than (A), because it looks like the safe.
- **(C) — CHOSEN.** Both layers: a **database-level refusal** proven now and carrying the exit claim,
  with **object-lock configured for production and its proof owed**.

**⚠ TWO CONDITIONS WERE PART OF OPTION (C) AS PRESENTED, and are therefore ruled by the selection —
but they are ENGINEERING'S conditions accepted by choice, NOT the owner's own words.** *(The
distinction matters: this memo has already had to correct one entry whose wording was the
orchestrator's and was read as the owner's — see the first batch's clarification note.)*

1. **THE FLOOR MUST BE A DATABASE-LEVEL REFUSAL, not a check in application code** — the same family
   as the shipped guards that refuse to `DELETE` a `waqf` row or alter the Shart columns. An
   application-layer check was explicitly described as the thing option (A) *is*, and (A) was not
   chosen.
2. **THE OBJECT-LOCK DEBT IS TIED TO A NAMED GATE — "before the first client migration" — NOT to a
   vague "later."** Presented as the condition that makes (C) honest rather than a fudge. The gate is
   real and already exists: `BR-1106`'s residency-guarded importer (E11) and E12's security review both
   sit before any real client data, and the `DATA_CLASSIFICATION=fixture-only` guardrail holds until
   then.

**THE REASONING PUT TO THE OWNER, including that the recommendation CHANGED.** The orchestrator first
recommended **(B)**, on the ground that this sprint had twice proven a guarantee against the **real
mechanism** rather than a stand-in — pg-boss's own policy-scoped indexes and migration 45's floor in
the actual database — and **both times the real mechanism behaved differently from what its name
promised** (`singletonKey` deduplicated nothing; the reminder dedupe was blind). That argument was the
builder's, was accepted, and is **why (A) is wrong**: it is the argument against ever claiming a
control that has not been tested against the real thing.

The recommendation then moved to **(C)** on a fact that surfaced only when the options were written out
plainly: **the retention claim does not have to be TRUE until real client data exists**, and that is
gated separately and later (E11's first-client migration, E12's security review, the fixture-only
guardrail). Building storage infrastructure now to prove something that cannot be needed for two
sprints is the wrong ORDER of work — **provided the debt is bound to a hard gate, which condition 2
does.** The change of recommendation is recorded because the reasoning matters more than the answer.

⚠ **WHAT (C) DOES NOT LICENSE.** E9's epic text says retention *"via object-lock"*, so claiming the
exit on a database floor is a **recorded deviation from the epic's stated mechanism**, not a silent
substitution: the S10 row must say which mechanism carries the claim. And E9's exit clause — *"a delete
before the retention window is refused"* — is claimed **on the floor that was measured**, never on
object-lock that was configured but not proven.

### Q2 · Sprint shape — **THE VAULT FINISHES INSIDE S10**

**Owner's answer (2026-09-01), verbatim: the same line — *"c and keep in s10"*.**

The alternative put was: close S10 now with the vault unstarted and the row annotated, give the vault
its own slot, and renumber what follows. **It was described to the owner as bookkeeping rather than
risk** — neither option changes the work, its order, or what may be claimed — with one practical
difference named: **a sprint boundary is the natural moment to merge to `main`**, which has not moved
since S9 while 22 commits sit on `sprint/s10-e9`. The question was therefore put as *"do you want a
checkpoint now?"*, and the answer is no.

**Consequence:** S10 becomes the largest sprint of the build and finishes what it is named for. **The
merge to `main` happens after the vault**, when S10 is complete rather than complete-except-its-own-
gate — and it remains its own authorization moment in the builder's window.

⚠ **UNCHANGED BY EITHER RULING, and neither is a thing the vault can fix:** **G-5's row stays
UNWRITTEN** (the anchor gaps mean two of four rule families still cannot be computed) and **E9's exit
is claimed only on BR-701–703 MEASURED** — if the vault is unfinished at close, the S10 row is
**ANNOTATED IN PLACE, never edited away.**

## S10 addendum, fourth batch (2026-09-01) — BR-702's owed row: the deed FILE does NOT follow the deed RECORD

### The document-access-matrix row for the deed file — **OPTION (b): THE RECORD ONLY**

**Owner's answer (2026-09-01), verbatim and complete: *"b"*.**

**THE QUESTION, because a bare "b" is meaningless without it.** `17-build-ship-dod.md:94` and the
header of the shipped `beneficiary-deed-read.integration.test.ts` (lines 55-56) both state that
Q-E4-1 settled the `TrusteeshipDeed` **record** and that **"whether the deed FILE follows the deed
RECORD is a row nobody has written."** E9's vault put that row in front of the owner: **may a
beneficiary read the deed FILE — the scanned instrument in the document vault — given they may
already read the deed RECORD?**

**THE OPTIONS AS PUT:**
- **(a)** Yes, same as the record — consistent with Q-E4-1, where the owner took the widest option
  because *"the deed is what tells them why"*. Named cost: **a scanned file's contents are unbounded**
  (witness names, third-party details, bank particulars) and, unlike a structured record, an image
  cannot be field-filtered.
- **(b) — CHOSEN.** No: the beneficiary gets the structured deed information, not the source document.
  Named cost: **a beneficiary who asks to see the actual deed is refused by their own trustee.**
- **(c)** Yes, but as a **derived artifact** — the deed rendered as a statement rather than the source
  file. E12 printable-statement work, not E9.

⚠ **(c) WAS THE ORCHESTRATOR'S STATED "EVENTUAL" LEAN AND WAS NEITHER CHOSEN NOR REJECTED.** The
recommendation put was *"(b) for now, with (c) as the eventual answer"*; the owner answered **"b"** and
said nothing about (c). **Nothing here licenses building (c)**, and it must not be recorded as a plan.

**WHAT IS RULED, and what it changes:**
1. **Q-E4-1 IS UNTOUCHED.** Beneficiary principals keep `endowment:deed:read` on the `TrusteeshipDeed`
   **record**, own-waqf only, exactly as landed in S5's tail.
2. **NOTHING IS ADDED TO THE BENEFICIARY PRESET ON `Document`.** No `document:document:read`, no
   type-carve, no widening.
3. **THE BENEFICIARY `Document` SCOPING BRANCH STAYS AS IT IS** — `scoping.ts:1092-1095`,
   `AND: [{ waqfId in ids }, { beneficiaryId: selfId }, amlClause(ctx)]` — i.e. **own documents only.**
   The branch that option (a) would have widened is hereby **confirmed correct as written.**
4. **BR-702's OWED ROW IS NOW WRITTEN — in the negative.** It is no longer a gap in the access matrix;
   it is an **answered row with a recorded answer.** E9's record must say so rather than continuing to
   list it as owed.
5. ⊕ **THE TYPE SUB-QUESTION DISSOLVES.** The owner was also asked whether the answer differs for the
   **trusteeship** deed (the Nazir's appointment) versus the **waqf** deed (the founder's instrument).
   Under (b) **no deed file of any type is beneficiary-readable**, so the distinction has no work to do.
   ⚠ It **revives** if this ruling is ever revisited — it is dissolved, not decided.

⚠ **THE ENGINEERING CONSEQUENCE, AND IT IS NOT "NOTHING TO DO": A "NO" STILL NEEDS A CONTROL.**
Today a beneficiary cannot read an endowment-level deed document — but **only as a side-effect of
`beneficiaryId: selfId`**, not because any rule says deeds are excluded. A future change widening that
branch for an unrelated reason would **silently open the deed file**, and nothing would go red. So this
ruling lands as a **named pin**: a positive control asserting that a beneficiary principal reading an
endowment-level `type: 'deed'` document is refused, citing this ruling, so the refusal is *stated*
rather than incidental. **An unpinned "no" is a "no" until someone refactors.**

⚠ **A HAZARD THIS RULING RETIRES, recorded because it would otherwise have had to be solved:** a carve
keyed on `Document.type` would **not have consulted `confidentiality`** — `amlClause` excludes only
`AML_RESTRICTED`, so a deed marked at any other confidentiality level would have been exposed by a
type-based carve. Option (b) removes that interaction entirely.

⚠ **Not counsel-verified.** This is a disclosure decision by the product owner in their capacity as
practising Nazir; whether a beneficiary has a *legal right* to a copy of the waqf deed under Saudi law
is a question for counsel and is **not** answered here. If counsel says such a right exists, this row is
revisited — and the answer would be a superseding entry, never an edit to this one.

## S11 addendum, first batch (2026-09-02) — the anchor dates are EDITABLE, and the audit trail is the history

### Anchor dates: **operator-editable, corrections audited, history retained**

**Owner's answer (2026-09-02), verbatim and complete: *"they are all registered, but i should be
able to edit dates to remove red.  audit log maintain record"***

**WHAT PROMPTED IT.** S11-1 builds the registration-anchor field the owner ruled on 2026-08-31
(`9f3d8fd`). Working the fixture, the S11 builder produced a finding that is about the **statute's
shape and not about fixtures**: *"a `REGISTER_30BD` row on an old endowment is overdue by
construction or it is nothing — that is the statute's shape for existing endowments."* Every
endowment predating the regulation that did not register within 30 business days of its effective
date therefore carries a **permanently overdue** registration deadline. The orchestrator put the
consequence to the owner: their five endowments are all registered, so the duty was in all
likelihood discharged years ago, and **unless the discharge can be recorded, the first real client's
compliance board opens with five permanent reds for a duty already satisfied.**

**WHAT THIS RULING SETTLES — three things, and one of them ratifies an engineering call.**
1. **THE FACT, from the owner directly: all five endowments ARE registered.** Recorded because it is
   the premise the whole question rests on and it came from the only person who holds it.
2. **THE DATES ARE EDITABLE.** ⊕ This **ratifies, in the owner's own words, the engineering
   recommendation taken on 2026-09-02** that the anchor be a **plain audited `UPDATE` (correctable)
   rather than write-once** — a call made on the reading that *"once there is clarity we can refine
   down th eline and increase governance"* deferred write-once governance. **It is no longer an
   inference; the owner has said "I should be able to edit".**
3. **THE AUDIT TRAIL IS THE HISTORY** — *"audit log maintain record"*. Every edit is an audit event;
   the prior value is never lost. This is the existing `auditedWrite` shape and G-1's guarantee
   (`UPDATE`/`DELETE` on `audit_event` refused at the database layer), so the ruling is satisfied by
   the spine that already exists rather than by anything new.

⚠ **WHAT IT DOES *NOT* SETTLE, AND WHY THE DISTINCTION IS BEING PUT BACK TO THE OWNER RATHER THAN
RESOLVED HERE.** *"Edit dates to remove red"* is satisfiable by **two mechanisms that are not
equivalent**, and engineering must not choose between them:

- **(i) EDIT THE ANCHOR DATE** — move the recorded clock-start so the computed window no longer
  falls in the past. ⚠ **This makes a compliance indicator green by changing a STATUTORY FACT.** The
  audit log would preserve the history, but the **current record** would then assert a clock-start
  the owner knows is not the true one. In a system whose purpose is to be the record of what
  happened, that is the shape this repo has refused elsewhere: the Shart's immutability, the
  refuse-don't-remap migration rule, and `ANCHOR_HAS_NO_RECORDED_HOME` itself all exist because *a
  date that merely produces the right answer is the defect.*
- **(ii) RECORD THE DUTY AS DISCHARGED** — the anchor stays true, the deadline stays computed, and
  the status becomes **`met`** (or `waived`) because the registration **was** completed, on a date
  the owner can supply. The red clears because the duty was satisfied, which is what actually
  happened.

⊕ **Engineering's reading, offered as a recommendation and NOT applied:** the owner may have reached
for "edit dates" because the input field is the only mechanism they had been told about. **(ii) is
the mechanism that makes their board green by recording a true fact**, and the evaluator's vocabulary
already contains `met` and `waived`. ⚠ **Whether a pre-system discharge is recorded as `met`, as
`waived`, or as a third thing is a product judgment about what the record asserts to the Authority,
and it is the owner's.** Both mechanisms may well be wanted — (i) for genuine input corrections, (ii)
for discharge — and that is the recommendation being put.

⚠ **Not counsel-verified.** Whether an endowment registered before the regulation's effective date
was ever subject to the 30-business-day duty at all — as against having satisfied it, or having been
outside it — is a question of Saudi law and is **not answered here**. If counsel says the duty never
attached, the honest state is neither `overdue` nor `met` but **not applicable**, which is a third
answer neither mechanism above provides. Flagged, unresolved, and it does not block S11-1.

⚠ **NOTHING IN S11-1 IMPLEMENTS "remove red" YET.** S11-1 lands the editable audited anchor
(clauses 2 and 3 above, already ratified). The discharge mechanism waits on the follow-up ruling.

## S11 addendum, second batch (2026-09-02) — the DISCHARGE PATH is authorized

### Clearing a red registration deadline: **RECORD THE DUTY AS DISCHARGED, not by editing the clock-start**

**Owner's answer (2026-09-02), verbatim and complete: *"yes, build the discharge path"*** — given in
answer to *"what you recommend?"*, so it is the **selection of the orchestrator's recommendation**,
and that recommendation is reproduced below because a bare "yes" is meaningless without it.

**THE QUESTION IT CLOSES.** The first batch (`f57e13d`) recorded *"I should be able to edit dates to
remove red. audit log maintain record"* and left one thing open: **which of two non-equivalent
mechanisms clears the red.** That is now answered.

**THE RECOMMENDATION THE OWNER ACCEPTED, as put to them:**
- **Editing the anchor date** clears the indicator by **changing a statutory fact.** The audit trail
  would preserve the history — which means it would preserve *"a permanent history of the Nazir
  editing statutory dates to clear compliance indicators"*, the worst possible sentence in a trail an
  Authority or auditor might read. **Rejected on that ground.**
- **Recording the duty as DISCHARGED** leaves the anchor true and turns the status `met` because the
  registration **was** completed. **This is what is authorized.**
- It is **cheap and precedented**: `fileUpdateObligation` (`deadline.ts:1472`, setting `satisfiedAt`
  at `:1546`) already does this shape for the certificate-filing duty — find the live head deadline,
  mark it satisfied on a date, and the row leaves the escalation ladder because `evaluate` reads
  `satisfiedAt: null, waivedAt: null` only.
- **The timing argument, also accepted:** the owner's five endowments hit this on day one of the
  first-client migration (E11), so building it while the deadline engine is fresh costs a fraction of
  building it under the pressure of real data and residency.

**WHAT THE MEASUREMENT ESTABLISHED BEFORE THE RULING (orchestrator, 2026-09-02), because it is why
there were only two options and not three:**
- **Discharge did not exist.** Of the deadline router's **nine** procedures, exactly one sets
  `satisfiedAt` — `fileUpdateObligation` — and that is the **UPDATE** duty, not registration.
- **Waiver is FORBIDDEN for this rule and refused at the database.** `REGISTER_30BD` is
  zero-tolerance; §09's words are that such obligations *"cannot be dismissed"*; the refusal is
  enforced **on UPDATE and at BIRTH** (`escalation-event-structure.integration.test.ts:12,267`).
- ⇒ **editing the anchor was the ONLY mechanism that existed**, which is precisely why it needed
  replacing rather than accepting.

⚠ **ENGINEERING CONDITIONS ATTACHED TO THE RECOMMENDATION AS PUT — ruled by the selection, but they
are ENGINEERING'S and NOT the owner's words** *(the distinction this memo has had to correct once
before — see the first S10 batch's clarification note)*:
1. **The anchor stays TRUE.** Discharge does not touch `registrationAnchorDate` or its kind. The two
   mechanisms remain separate: **editing corrects an INPUT ERROR; discharge records a FACT.**
2. **Design so a THIRD state can be added later without rework** — see the counsel caveat below. This
   was offered as a refinement costing *"almost nothing now"* and saving a migration later.

⚠ **STILL OPEN AND NOT BLOCKING — the counsel question, which could make BOTH states wrong.** Whether
an endowment registered **before** the regulation's effective date was ever subject to the
30-business-day duty at all is a question of Saudi law and is **unanswered.** If the duty never
attached, the honest state is **NOT APPLICABLE** — neither `overdue` nor `met` — and nothing in the
system represents it. Recorded as the reason for condition 2. **It does not block the build:** a
discharge path is right regardless (any endowment registered genuinely within its window needs one),
and *not applicable* would need building either way, so counsel's answer changes **what else** is
owed, not whether this is.

⚠ **STILL OWED BY THE OWNER — DATA, NOT A DECISION: the five endowments' actual registration dates.**
The mechanism can be built and shipped without them; they are entered afterwards through the field
S11-1 landed. **The decision unblocked the work; the data follows.**

⚠ **ONE SUB-DECISION ENGINEERING IS NOT TAKING SILENTLY, to be surfaced WITH the design rather than
asked in the abstract: WHICH RUNG may assert a discharge.** `fileUpdateObligation`'s precedent is a
plain `makerProcedure('compliance:task:write')` — one person. But **a discharge record asserts to the
Authority that a statutory duty was satisfied**, which is a stronger claim than recording a date, and
this repo requires maker-checker for money movements (BR-506 / G-3). **Orchestrator's recommendation:
follow the precedent (plain maker), because the filing path makes the same class of claim and is not
maker-checked.** The builder brings this back with a concrete design; it is not settled here.

## S11 addendum, third batch (2026-09-03) — the board's Arabic: ENGINEERING DRAFTS, the owner reviews

**THE QUESTION AS PUT** (recorded because the answer was three words and cites nothing on its own —
the same reason the S10 fourth batch and the S11 first batch record their options):

> The compliance board needs Arabic labels for the five KPI chips and the seven "cannot determine"
> causes — text a beneficiary or an Authority reviewer may eventually read. Do you want engineering to
> draft that Arabic for your review, or will you write it yourself?
> **(a)** *"you draft it"* — engineering writes the Arabic, marks every key as awaiting your review,
> and the next session finishes 2b end to end. You review the wording later, on screen.
> **(b)** *"I'll write it"* — it builds everything else, leaves the Arabic keys registered as owed, and
> stops one step short until you supply them.
> Orchestrator's recommendation: **(a)**. The copy is descriptive UI labelling, not legal wording, and
> reviewing it rendered on a real board is easier than writing it cold. Nothing about the choice is
> irreversible — the keys stay marked until you sign them off either way.

**THE RULING (product owner, 2026-09-03), verbatim and complete:**

> you draft it

**WHAT THIS AUTHORISES.** Engineering may author the `ar` values for the `dashboard` i18n namespace —
**88 keys, measured** — covering the five zero-tolerance KPI chips, the seven deadline cause families
(`NOT_RECORDED` / `RECORDED_NOT_COMPUTABLE` / `ROUTED_NO_HOME` / `NOT_COMPUTED` / `NOT_IN_SCOPE_YET` /
`NO_SUBJECT` / `CALENDAR_UNAVAILABLE`), the board's own chrome, and the AML "not modelled" statement.
2b may therefore be **built and closed** without waiting on the owner's pen.

⚠ **WHAT THIS DOES NOT AUTHORISE, AND THE BOUNDARY IS NOT A TECHNICALITY.** The ruling covers
**descriptive dashboard labelling**. It does **not** reach the distribution engine's beneficiary-facing
statement copy — the **exclusion-reason**, **entitlement-rule** and **withheld** vocabularies, whose
`ar`/`en` text remains owed and whose Arabic register item #12 designates **product-approved legal
text that must not be invented in a code change**. Those live in three registers that are separate
from the dashboard's by construction (`EXCLUSION_COPY_OWED_TO_REVIEW`,
`ENTITLEMENT_RULE_COPY_OWED_TO_REVIEW`, `WITHHELD_COPY_OWED_TO_REVIEW` in
`packages/i18n/test/code-source-parity.test.ts`), and **the separation was measured before this ruling
was recorded**: of the 88 `dashboard` keys, **zero** touch that vocabulary. The difference is what the
sentence does. *"Cannot determine — no licence model"* describes the system's own state to its
operator. *`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`* tells a named human being why they were not paid
this period, and must not read as permanent when it is temporary. **A ruling that engineering may
draft the first is not a ruling that it may draft the second.**

⚠ **ENGINEERING CONDITIONS ATTACHED TO OPTION (a) AS PUT — ruled by the selection, but they are
ENGINEERING'S and NOT the owner's words** *(the distinction this memo has had to correct once
before — see the first S10 batch's clarification note)*:
1. **Every drafted `ar` key is REGISTERED AS AWAITING REVIEW**, through the same `owed:` mechanism the
   three sibling registers use — an owed register, **never a skip and never a red test**. Drafted is
   not approved; the register is what keeps the two apart.
2. **The owner reviews the wording rendered on the board**, not as a JSON diff. That was the argument
   for (a) and it is the argument for how the review happens.
3. **`status.label` stays REQUIRED on every chip** — colour is never the only signal. A drafted Arabic
   label is still a label, and the accessibility property does not wait for sign-off.

⚠ **STILL OWED BY THE OWNER — a REVIEW, not a blocker.** His sign-off on the drafted Arabic. Until it
lands, every `dashboard` `ar` key is marked in the register and the wording is provisional. **This does
not hold 2b open:** the stage closes on the drafted copy, and the sign-off is a later, separate act
that clears the register. If he changes wording afterwards, it is a copy edit, not a re-open.

⚠ **UNCHANGED BY THIS RULING, and still with the owner:** the definition of *"arrears"* (2c,
non-blocking) · the five endowments' real registration dates (data, not a decision) · voluntary
istibdal's Phase-1 scope · the spelling رخضة إنشاء · grant-at-creation for the seat · Fadwa's
outstanding items.

## S11 addendum, fourth batch (2026-09-03) — ARREARS: 2c ships the honest NOT-MODELLED state, and the figure waits for BR-302

**THE QUESTION AS PUT** (recorded verbatim because the answer was one word and cites nothing on its own —
the same reason the S10 fourth batch, and the S11 first and third batches, carry their options):

> My recommendation stands and needs one word from you: **let 2c show that honest state and move on.**
> The financial dashboard reports cash, revenue, expense and distributions from real ledger data, and
> says plainly that arrears isn't modelled. The actual figure belongs with lease tracking, in its own
> stage, because building tenants and rent schedules and payment matching inside a dashboard sprint is
> how a read layer turns into three weeks.

**THE RULING (product owner, 2026-09-03), verbatim and complete:**

> go

**WHAT THIS AUTHORISES.** S11 item **2c** — the financial dashboard, BR-902 — opens and may **close**
with `arrears` rendered as the **explicit `NOT_MODELLED` state** the API already returns
(`packages/api/src/routers/finance.ts:437`, whose own comment is the reasoning: *"an explicit state,
never a zero: a zero would assert 'nothing owed'"*). Cash position, revenue/expense and distributions
are computed from the real ledger. The arrears **figure** is deferred to **BR-302's own stage** (lease
management: tenant, term, rent, status, collection and follow-up).

⚠ **THIS WAS NEVER A DEFINITIONAL RULING, AND THE MEMO SHOULD NOT BE READ AS MAKING ONE.** *"Arrears"*
is already defined by the product's own requirements — **BR-302**: *"track rent collection and
**arrears** with follow-up"* — i.e. **rent owed TO the endowment by a tenant and not yet paid**, tracked
per lease. The orchestrator had also offered *"a declared but unpaid distribution to a beneficiary"* as a
candidate reading: **that was invented, appears in no requirement, and is withdrawn.** The owner was
asked a question his own BRD had answered; the ruling above is a **SCOPE** decision only.

**WHAT THE MEASUREMENT ESTABLISHED BEFORE THE RULING (orchestrator, 2026-09-03), because it is why there
were only two options and not three:**
- **`Lease` EXISTS** — `packages/database/prisma/schema.prisma:2298` — carrying `tenantAr`, `rentSar`,
  `startDate`/`endDate` with their Hijri twins, `status`, and an `ejarRef`. So the entity is not missing.
- **The fixture seeds ZERO leases.** There is no subject.
- **No payment-side model exists at all**: no `RentPayment`, no `Receivable`, no `LeasePayment`, no
  `Invoice`. **Nothing records what a tenant actually paid**, so there is nothing to net the expected rent
  against.
- ⇒ **An arrears figure was not merely unbuilt; it was UNCOMPUTABLE.** No ruling could have produced one,
  which is why the honest state was the only shippable answer and the deferral is not a cut.

⚠ **ENGINEERING CONDITIONS ATTACHED TO THE RECOMMENDATION AS PUT — ruled by the selection, but they are
ENGINEERING'S and NOT the owner's words** *(the distinction this memo has had to correct once before —
see the first S10 batch's clarification note)*:
1. **The not-modelled state is RENDERED, not omitted.** A missing tile would read as "nothing owed" just
   as a zero would. It says, in both locales, that arrears is not modelled — a refusal shown as a
   refusal, the same standard the compliance board is held to.
2. **No lease, tenant, rent-schedule or payment model is introduced in 2c.** That is BR-302's stage.
3. **2c claims only its own half of E10's exit.** With 2b's conjunct already claimed, 2c is the commit at
   which *"both dashboards render live fixture data"* may finally be claimed — and it must be claimed on a
   measured run, not inferred from the pair existing.

⚠ **STILL OPEN AND NOT BLOCKING — a Sharia question sits inside this vocabulary.**
**`POST_ISTIBDAL_RENT_ARREARS`** (`packages/domain/src/ledger/accounts.ts:357`) — *rent arrears collected
after an istibdal* — is one of the **four edge receipt types still awaiting Fadwa's income-vs-capital
ruling** (register item #8). It does not touch the dashboard, which only reads. It **will** bind the
moment money moves through an arrears path, so BR-302's stage inherits it: **the ruling precedes the
record.**

⚠ **UNCHANGED BY THIS RULING, and still with the owner:** his **sign-off on the drafted board Arabic**
(a review, judged on the rendered screen — not a blocker) · **V-9's spec-vs-invariant conflict** (§17 asks
that a `Setting` change reach the next run's Nazir fee; the engine resolves the fee from the **deed and
nowhere else**, which is correct under Art. 11 — so a Milestone-2 criterion is unachievable as written and
one of the two must move) · the five endowments' real registration dates (data, not a decision) ·
voluntary istibdal's Phase-1 scope · the spelling رخضة إنشاء · grant-at-creation for the seat · Fadwa's
outstanding items.

## S11 addendum, fifth batch (2026-09-03) — the financial figures get THEIR OWN SCREEN: a scoped `/financials`

**THE QUESTION AS PUT** (recorded verbatim because the answer was three words and cites nothing on its own —
the fourth one-word/short ruling in this sprint, and the memo's standing practice since the S10 fourth batch):

> **Three options:**
> **A — a region on the existing dashboard.** Matches the phasing doc word for word. Cheapest. But then
> the definition of done has to be reworded, because there is no second dashboard.
> **B — a proper `/financials` screen.** Matches the UX spec, which is the only layout spec that exists,
> and lights up the sidebar item that's already there. Makes the milestone claim honest. Costs a route
> and some layout work. The dense transaction table and reconciliation panel can't be built yet — they
> need a transaction-list endpoint that doesn't exist — so those get declared as owed rather than
> quietly skipped.
> **C — both.** A summary on the dashboard, a fuller ledger screen later. Most work, and it means
> designing the same numbers twice.
> **I recommend B.** It's the only option where the milestone claim is truthful without editing the
> milestone, it uses the one real design spec instead of inventing a layout, and it fills a navigation
> slot your product already advertises to users.

**THE RULING (product owner, 2026-09-03), verbatim and complete:**

> i like b

**WHY THERE WERE THREE OPTIONS: THREE SPECS DISAGREED, and all four citations were verified at source
before the question was put.**
- `docs/product/prd/13-ux-designsystem-reference.md:189-196` — *"### 10. Financial ledger & reconciliation ·
  **P0**"*: the **only layout spec for financial figures in this repository**. Account header (dedicated
  account + cash-position `StatTile` with inset LCD well) · a dense transaction `DataTable` **flat inside a
  raised card** (date dual · account · description Arabic · debit/credit `CurrencyValue` · reconciliation
  status) · a **reconciliation panel** with an unmatched-items queue · four named states, including the exact
  empty-state sentence *"No transactions yet — the dedicated waqf account must be linked first."* and an
  error state in which a commingling transaction is **refused with the reason**.
- `docs/product/prd/05-scope-phasing-priority.md:144` — the P0 basic financial view is *"read off the P0
  Arabic ledger and surfaced on the **compliance dashboard** (BR-901)"*.
- `docs/product/prd/17-build-ship-dod.md:138` — *"both dashboards"*, i.e. a **separate** financial dashboard.
- `apps/web/src/components/Sidebar.tsx:30` — `{ key: 'financials', segment: 'financials', built: false }`,
  with **no `/financials` route in existence** (only `approvals`, `dashboard`, `distributions`,
  `endowments`). That file's own rule is that an unbuilt item renders **unlinked**, because *"a nav item that
  404s teaches the user"* — so flipping it true without a route breaks the rule, and so does leaving it inert
  while putting financial regions on `/dashboard`.

**WHAT MADE THIS LOAD-BEARING RATHER THAN COSMETIC.** Under option A the figures would have been a **region
on `/dashboard`**, and E10's exit clause *"both dashboards render live fixture data"* could **not honestly
have been claimed** — one dashboard with two regions is not two dashboards, and that would have been the
**sixth premature exit claim** on this record. Option B makes the claim truthful without editing the
criterion.

**WHAT THIS AUTHORISES.** S11 item **2c** builds **`/financials`** as its own route under
`apps/web/src/app/[locale]/(app)/`, to `13-ux` §10's contract: the figures that exist — cash position,
revenue/expense, distributions, and `arrears` as the explicit `NOT_MODELLED` state ruled in the **fourth
batch** — with §10's four states and **its exact empty-state sentence**, and `Sidebar.tsx`'s `financials`
entry flipped to `built: true` because the route now exists.

⊕ **CORRECTION TO THE PARAGRAPH ABOVE, 2026-09-03, the same day it was written — the builder's precision,
and the wording above is the orchestrator's error, kept visible rather than rewritten.** The phrase
*"§10's contract"* is **too wide and must not be quoted as the claim.** 2c can build §10's **LAYOUT** and
its **FOUR STATES**; it **cannot** satisfy §10's **ACCEPTANCE CRITERIA**, because both of them are
**write/import** criteria — verbatim at `13-ux-designsystem-reference.md:201-203`: *"**Given** a transaction
posted to a non-dedicated or another endowment's account, **when** I save it, **then** it is refused with a
commingling error"* and *"**Given** a bank statement import, **when** I reconcile, **then** matched items
clear and unmatched items queue for review"*. Neither is reachable: `finance.recordRevenue`,
`finance.reconcile` and any statement import are **not called from `apps/web` at all** (measured), and both
sit in this entry's own owed set. **The row must therefore read "built to §10's LAYOUT AND FOUR STATES",
never "to §10's contract"** — the wider phrase would read as *"§10's ACs pass"*, which is precisely the shape
of the premature exit claims this memo exists to prevent. Nothing about the owner's ruling changes; only the
orchestrator's description of its scope.

⚠ **WHAT THIS DOES NOT AUTHORISE, and each omission is DECLARED OWED rather than silently skipped:**
1. **The dense transaction `DataTable` is NOT built.** It needs a transaction-list read procedure that does
   not exist — the same absence as §14 §2's drill-through requirement, which currently has **no destination**.
2. **The reconciliation panel and its unmatched-items queue are NOT built.** ⊕ But **`reconciliationStatus`
   is an existing column merely left out of a select**, and §14 §5.1(1) demands that *"commingling shows as a
   red exception, not a silent line"* — so what the board **can** honestly surface, it must.
3. **No SOCPA / class-appropriate statement export.** `05-scope-phasing-priority.md:144` marks statement
   generation **P1** in its own words, so it is out of scope by that document and not by this ruling.

⊕ **A DOCUMENT RECONCILIATION IS NOW OWED, and the drifted side is named:**
`05-scope-phasing-priority.md:144`'s *"surfaced on the compliance dashboard (BR-901)"* is **superseded by
this ruling** — the P0 financial view gets its own screen. That line must be annotated in place, dated, and
never silently rewritten (the standing annotate-in-place protocol). `17:138`'s *"both dashboards"* and
`13-ux` §10 are the sides this ruling **upholds**.

⚠ **ENGINEERING CONDITIONS ATTACHED TO OPTION B AS PUT — ruled by the selection, but they are ENGINEERING'S
and NOT the owner's words** *(the distinction this memo has had to correct once before — see the first S10
batch's clarification note)*:
1. **The two unbuilt regions are declared on the screen and in the row**, not omitted in silence. A financial
   screen that shows no reconciliation panel must not read as *"nothing to reconcile"* — the same standard
   that made `arrears: NOT_MODELLED` a rendered state rather than a missing tile.
2. **Every date on it carries BOTH calendars** (§14 §2 + NFR-02): an as-of, a period label, and a per-account
   last-reconciled. 2b's `DualDateValue` / `qm-board-as-of` is the precedent.
3. **INCOME and CAPITAL stay visibly apart on screen.** A financial dashboard is the one surface that can
   breach **binding rule 1** silently, and `finance.summary` already separates them on the wire.
4. **The E2E uses the `nazir@example.test` seat, and NO grant is widened.** Measured: the 2b compliance seat
   cannot read finance — `GRANT_SHAPE_BY_ROLE.CASE_MANAGER` carries ten verbs and **no `finance:*`**, while
   the `case_manager` preset holds `finance:transaction:read`; effective permissions are grant ∩ preset, so
   that seat gets `FORBIDDEN`. The `NAZIR` shape already holds `finance:transaction:read`. **Widening the
   grant would edge into the `grant-at-creation` question still held with the owner; using an existing seat
   touches the access matrix not at all.** *(An orchestrator ruling on a mechanical choice, recorded here for
   traceability — it is not the owner's.)*
5. **2c claims E10's remaining conjunct on a MEASURED per-job CI run**, never inferred from two dashboards
   existing.

⚠ **UNCHANGED BY THIS RULING, and still with the owner:** his **sign-off on the drafted board Arabic**
(a review on the rendered screen, not a blocker) · **V-9's spec-vs-invariant conflict** (§17 asks that a
`Setting` change reach the next run's Nazir fee; the engine resolves it from the **deed and nowhere else**,
correct under Art. 11 — one of the two must move) · the five endowments' real registration dates (data) ·
voluntary istibdal's Phase-1 scope · the spelling رخضة إنشاء · grant-at-creation for the seat · Fadwa's
outstanding items, including **`POST_ISTIBDAL_RENT_ARREARS`** (`Q6(h)`, **Unruled**), which BR-302's stage
inherits.

---

⊕ **THREE CORRECTIONS TO THIS ENTRY'S OWN ENGINEERING CONDITIONS, 2026-09-03 — all three are the
ORCHESTRATOR'S errors, all three found by the builder's adversarial critique of its own plan, and all three
annotated in place rather than rewritten. The owner's ruling — "i like b" — is untouched by every one of
them.**

**(i) `reconciliationStatus` DOES NOT EXIST, AND THIS ENTRY IS THE ONLY PLACE IT HAS EVER EXISTED.** A
repo-wide search returns **exactly one hit: this file, obligation 2 above.** **Zero hits in code.** The real
columns are `bankReference String?` and `reconciledAt DateTime?` (`schema.prisma:1400-1401`) — there is no
status column and no status enum, so a reconciliation status must be **DERIVED**, and
`finance.reconcile`'s existing vocabulary (`UNREFERENCED`, `DUPLICATE_LEDGER_REFERENCE`, …) is where that
logic already lives. Obligation 2's phrase *"an existing column merely left out of a select"* was the
builder's unverified claim, which the orchestrator wrote into this record without measuring it. ⚠ **This is a
worse shape than "a record is not a measurement": the record was CREATED BY the unverified claim, so a future
reader grepping for the identifier would find only the sentence that invented it.** **The obligation survives
in weaker and true form:** §14 §5.1(1) still demands that commingling show as a red exception rather than a
silent line, and `summary.commingling`'s three counters already carry that honestly — but nothing is "merely
left out of a select".

**(ii) CONDITION 2 (both calendars on every date) IS NOT ACHIEVABLE AS WRITTEN, and is AMENDED here rather
than dropped.** Measured: `finance.summary` returns **not one date**, and `reconciledAt` is **per
transaction**, so a *"per-account last-reconciled"* is **not derivable** from this read at all. **The amended
condition:** the screen carries an **as-of timestamp generated at read time, dual-calendar** — that IS
derivable, and §14 §2 + NFR-02 require it — while the **per-account last-reconciled is DECLARED OWED with
its reason.** A condition that cannot be met must be amended in the open; the builder's first plan dropped it
silently, and it noted that this *"is how a row claims a condition that never landed"*, which is the reason
this correction is written down instead of quietly fixed.

**(iii) CONDITION 4's SEAT IS UNUSABLE — `nazir@example.test` cannot be used by 2c.** The verb half was
right (`GRANT_SHAPE_BY_ROLE.NAZIR` does hold `finance:transaction:read`); the **TOTP half kills it.**
`TOTP_REQUIRED_ROLES = INTERNAL_OPS_ROLES` (`roles.ts:73`) includes NAZIR, and
`auth-journey.spec.ts:102,359` **enrols that seat and discards the secret**. `kernel.spec.ts:104-112` states
the governing rule in its own words: *"enrolment is a one-way door for a test (the TOTP secret is returned
exactly once, so a spec cannot recover it afterwards). Sharing a seat across files would make the two suites
order-dependent."* Both seeded NAZIR seats are already claimed — `nazir@` by `auth-journey`,
`approver@` by `kernel`. **The amended condition: 2c gets its OWN seat, read-only, holding an EXISTING verb
from an EXISTING preset — never a widening of an existing grant, so `grant-at-creation` stays untouched — and
the seed's `WaqfAccessGrant` exact-count pin is updated DELIBERATELY in the same commit with its reason
stated.** *(An orchestrator ruling on a mechanical choice, recorded for traceability; it is not the owner's.)*

⊕ **AND ONE CORRECTION TO THE ORCHESTRATOR'S DESCRIPTION OF THE EMPTY-STATE CASE, which never reached this
entry but did reach the owner:** `waqf-004` is **`directUtilization: true`**, its deed *"POSITIVELY
stipulates"* no yield is distributed, and `14-reporting-dashboards-spec.md:87` already specifies its
sentence — *"**Direct-utilization waqfs have no monetary distribution** — the report states this rather than
showing zeros."* So §10's *"the dedicated waqf account must be linked first"* is **actively wrong copy** for
it: it instructs an act that would change nothing. **There are THREE empty states, not two** — direct
utilization (specified, §14:87) · deed un-transcribed (`waqf-005`; **not covered by any spec**, so its copy
is drafted and marked awaiting review) · and a genuine nil balance, **which no fixture endowment exhibits**.
⚠ The two candidate predicates — `accounts.length === 0` versus `total === 0.00` — are **indistinguishable on
this fixture**, and keying on the sum would print a false statement about a dedicated account for any real
endowment sitting at nil. **Key it on the account count, and say in the row that the fixture cannot tell the
two apart.**
