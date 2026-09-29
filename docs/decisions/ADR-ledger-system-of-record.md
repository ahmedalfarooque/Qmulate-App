# ADR — Ledger System of Record

**Status:** DECIDED (Accepted)
**Date:** 2026-07-26
**Deciders:** QMULATE (product owner) + engineering
**Scope:** `packages/database`, `packages/domain`, `packages/api`, the finance/distribution modules, and the FIN-ACC compliance tasks.
**Relates to:** [ADR 0001 · Initial repo structure](../architecture/0001-initial-repo-structure.md) · [BR-502](../product/brd/06-functional-requirements.md) · [FIN-ACC-01/02/04](../product/prd/09-compliance-deadline-engine-spec.md) · [§07 Data model](../product/prd/07-data-model-spec.md) · [§08 Distribution engine](../product/prd/08-distribution-engine-spec.md) · [§14 Reporting](../product/prd/14-reporting-dashboards-spec.md) · CLAUDE.md Binding rule 1

> This is the first record filed under `docs/decisions/`. Earlier structural notes live under `docs/architecture/`; new architecture decisions are recorded here going forward.

---

## Decision (in one line)

**The accredited external accounting system (Wafeq) is the accounting *book of record*. The platform is the operational *source of truth* for waqf-domain facts. Truth flows one way — platform → Wafeq: the platform classifies and feeds; Wafeq holds the statutory double-entry general ledger (GL) and produces the SOCPA-compliant statements.**

```
   waqf-domain facts                         statutory accounting
   (classified, authoritative)               (double-entry GL, statements)
   ┌───────────────────────────┐   push      ┌───────────────────────────┐
   │  PLATFORM                 │  ────────▶   │  WAFEQ                    │
   │  operational SOURCE OF     │   (one-way)  │  accounting BOOK          │
   │  TRUTH                     │  ◀ ─ ─ ─ ─   │  OF RECORD                │
   └───────────────────────────┘  reconcile   └───────────────────────────┘
   classification · corpus guard ·            double-entry GL · COA ·
   eligibility · entitlements ·               SOCPA statements ·
   immutable operational record               audit-facing books
```

The dashed line is **reconciliation only** — the platform reads Wafeq balances back to *detect divergence*, never to *derive* domain decisions.

---

## 1. Context — the FIN-ACC-01 / BR-502 gap this closes

The regulation and the operating model require QMULATE, as Nazir, to keep proper books:

- **[BR-502](../product/brd/06-functional-requirements.md)** — "Capture **revenue** (rents, yields) and **expenses** (maintenance, operations, fees) per endowment; record transactions **in Arabic**; support a **SOCPA-aligned chart of accounts**." (Awqaf Law Art. 15(2,4); operating model E-02.)
- **[FIN-ACC-01](../product/prd/09-compliance-deadline-engine-spec.md)** — "Subscribe to & maintain an **approved accounting system**." **[FIN-ACC-02](../product/prd/09-compliance-deadline-engine-spec.md)** — record & classify all revenue/expenses **in Arabic**, regularly. **[FIN-ACC-04](../product/prd/09-compliance-deadline-engine-spec.md)** — periodic **bank reconciliation vs ledger**.

The current data model does **not** satisfy this. [§07](../product/prd/07-data-model-spec.md) models finance as a single `Transaction { TxnType REVENUE | EXPENSE; category; amountSar; … }` — a **single-entry revenue/expense stub**: no debits/credits, no double-entry, no trial balance, and therefore no path to a SOCPA-compliant statement or an audit-facing set of books. [§14](../product/prd/14-reporting-dashboards-spec.md) already establishes that the platform "**never produces the SOCPA opinion**" — an external SOCPA auditor produces the audited statements from an evidence pack — but it left **who keeps the statutory ledger those statements are built on** undecided.

The spec audit flagged this as a **Critical** finding: *"ledger system-of-record undecided (single-entry, no double-entry)."* It was Critical because a Nazir keeping fiduciary books cannot operate on an ambiguous or non-statutory ledger: it blocks SOCPA audit for Large/Medium waqfs, undermines bank reconciliation (FIN-ACC-04), and leaves the corpus/income segregation with no accounting substrate to sit on. This ADR closes that finding by naming the system of record and fixing the direction of truth.

## 2. Decision & rationale

**Wafeq is the accounting book of record; the platform is the operational source of truth; truth flows platform → Wafeq.**

The reasoning is a build-vs-own argument that turns on one fact:

1. **Wafeq cannot enforce the waqf-domain invariants.** No general-purpose accounting system knows what corpus (*aṣl* / أصل) vs income (*ghallah* / غلة) means, that capital receipts are barred from the distribution waterfall, that distribution is tier-ordered (al-aʿlā fa-l-aʿlā) or shared (tashrik), or how to compute per-beneficiary entitlements. That logic is QMULATE's fiduciary core and **must live in the platform regardless of which system keeps the GL.**
2. **So the platform must already hold an authoritative, classified record** — every receipt tagged corpus-vs-income at entry, tied to an endowment/property/beneficiary, with the corpus guard applied. Building that is unavoidable.
3. **Given (2), rebuilding statutory double-entry GL + SOCPA-compliant statement generation is low-differentiation, high-liability work we choose not to own.** An accredited system already provides double-entry integrity, a maintained SOCPA-aligned chart of accounts, ZATCA/e-invoicing alignment, and audit-facing books — and does so under its own accreditation. Re-implementing that in-house adds fiduciary and audit risk (a home-grown GL that an auditor must first be convinced to trust) for no product differentiation.

The platform therefore keeps the part only it can do (domain classification, invariants, eligibility, entitlements) and delegates the part a commodity accredited system does better and de-risks (the statutory ledger and statements). This is the same delegation §14 already makes for the audit *opinion*, extended to the *book of record*.

## 3. Division of responsibility

| Concern | Owner | Notes |
|---|---|---|
| **Receipt classification (corpus vs income)** | **Platform** | Every receipt tagged income (*ghallah*) or capital (*aṣl*) **at entry**. ✓ **Fiqh basis confirmed 2026-08-18** — the Sharia review is **Fadwa's** (licensed lawyer, endowment expertise), **designated authoritative by the product owner**, formal signature owed: rent = income; sale/istibdal proceeds = capital; expropriation compensation = **usually** capital, atypical cases routed to review. *(This cell asserted the confirmation before it had one — [ADR-0002 §8](ADR-0002-receipt-income-capital-classification.md) called it an overstatement and was right to. It is now backed by an attributed review; the word **usually** is the part that must survive any restatement.)* ⚠ **Key money, insurance proceeds, post-istibdal arrears and an income-funded ṣiyāna reserve are NOT covered** — still unruled. |
| **Corpus non-diminution invariant** | **Platform** | Capital receipts are blocked from the distribution waterfall; corpus is never distributed, eroded, or reclassified as income. See §5 — never delegated. |
| **Distribution eligibility & calculation** | **Platform** | The [§08](../product/prd/08-distribution-engine-spec.md) engine: waterfall, ORDERED/SHARED resolver, ṭabaqa/ẓuhūr-buṭūn, gates, timing, residual. |
| **Entitlements & beneficiary shares** | **Platform** | Per Shart al-Waqif; not derivable from an accounting GL. |
| **Per-endowment / per-property / per-beneficiary operational accounts** | **Platform** | The authoritative operational chart of accounts the domain reasons over and reconciles from. |
| **Immutable operational record & audit trail** | **Platform** | Append-only domain events (distribution runs, classifications, reserved-matter approvals) — the operational history, distinct from the accounting GL. |
| **Statutory double-entry GL** | **Wafeq** | Debits/credits, journals, trial balance, period close. |
| **Chart of accounts (statutory)** | **Wafeq** | SOCPA-aligned COA; the accounting-side accounts the platform maps onto. |
| **SOCPA-compliant financial statements** | **Wafeq** | The statements themselves. (The platform still assembles the §14 *evidence pack*; the external **SOCPA auditor** still produces the audited *opinion*.) |
| **Audit-facing books** | **Wafeq** | The books an auditor examines. |

Rule of thumb: **the platform decides *what a transaction means*; Wafeq records *what it does to the books*.**

## 4. Integration contract

**Direction:** one-way push, **platform → Wafeq**. The platform is upstream; Wafeq is a downstream book of record. The platform never reads distribution-eligibility, classification, or entitlement *from* Wafeq.

**4.1 What the platform pushes.** For each operational financial event (revenue capture, expense, Nazir-fee deduction, distribution line, corpus movement, istibdal/sale proceeds), the platform emits a **structured, pre-classified journal entry**: amount, Arabic description ([BR-502](../product/brd/06-functional-requirements.md)), date (Gregorian + Hijri), the dedicated waqf bank account, the target Wafeq account(s), the cost-center dimension(s), and a stable **platform-transaction id** carried as the entry's external reference (idempotency key).

**4.2 Account & cost-center mapping.** Drawing on the prior evaluation of Wafeq's **cost-center architecture and API for multi-property tracking**:

| Platform concept | Wafeq representation |
|---|---|
| Endowment (`Waqf`) | Cost-center (top level) — one per endowment; supports the Client → Waqif → Waqf hierarchy as a cost-center tree |
| Property / parcel (`Asset`) | Cost-center (child of the endowment) — enables per-property P&L and the multi-property tracking the evaluation confirmed |
| Dedicated waqf bank account | Its own GL cash account, scoped to that endowment's cost-center (enforces no-commingling on the books, mirroring [BR-501](../product/brd/06-functional-requirements.md)) |
| **Corpus (*aṣl*)** | A **distinct GL account class** (asset/capital accounts) — the endowed asset and any capital standing in its place |
| **Income (*ghallah*)** | A **separate GL account class** (revenue accounts) — rent, yield, returns |
| Nazir fee, operating cost, maintenance reserve, distribution | Their own expense/liability accounts within the endowment's cost-center |

**4.3 How corpus vs income is represented on the Wafeq side.** The corpus/income distinction is **represented** in Wafeq purely by which account class an entry posts to: capital receipts (sale proceeds, istibdal proceeds, expropriation compensation) post to **corpus accounts** and never to income/distributable accounts. This representation exists so Wafeq's statements reflect the segregation for audit — but the *decision* of which class a receipt belongs to is made by the platform and sent pre-classified (see §5). Wafeq books to the account it is told; it does not judge classification.

**4.4 Reconciliation job (scheduled, platform → Wafeq).** A scheduled job (`packages/jobs` / the worker) reconciles the platform's operational balances against Wafeq's GL:

- Compares, per endowment / property / account class: the platform's operational balance vs the Wafeq GL balance — **including, as first-class checks, the corpus balance and the distributable-income balance.**
- Entries are **idempotent** via the platform-transaction id (external reference), so re-runs and retries never double-post.
- Also covers the bank ↔ ledger leg required by **[FIN-ACC-04](../product/prd/09-compliance-deadline-engine-spec.md)**.

**4.5 Mismatch handling — fail loud, never silently diverge.** Any discrepancy beyond a defined tolerance (default: exact for classified balances) is raised as an explicit **sync/reconciliation error**: it surfaces on the compliance dashboard, blocks the affected period's sign-off, and is audit-logged. A divergence is treated as an incident to resolve, **not** a number to quietly overwrite in either system. Failed pushes are retried with backoff; unresolved sync errors escalate. The platform's record and Wafeq's record must be provably equal, or the mismatch must be visible.

## 5. Non-negotiable

**The corpus non-diminution invariant is enforced in the platform and is never delegated to Wafeq.** (CLAUDE.md Binding rule 1.)

Wafeq *represents* the corpus/income split in its accounts, but representation is not enforcement. The guarantee that no operation distributes, erodes, or reclassifies corpus — that capital receipts (sale/istibdal/expropriation proceeds) are barred from the distribution waterfall and flow back to corpus — is a platform invariant, applied **before** any entry is pushed. If Wafeq is unavailable, misconfigured, or its account mapping is wrong, the invariant still holds, because it was enforced upstream. The book of record can be delegated; the fiduciary guarantee cannot.

## 6. Consequences

**Simplifies (what we no longer own):**
- No in-house statutory double-entry GL, no trial-balance/close engine, no SOCPA-compliant statement generator to build, test, and defend to auditors.
- Statutory COA maintenance and e-invoicing/ZATCA alignment sit with the accredited system.
- The platform's finance surface shrinks to what is genuinely QMULATE-specific: classification, invariants, eligibility, entitlements.

**Creates dependencies (what we now rely on):**
- **Wafeq API reliability and its account/cost-center model.** Availability, rate limits, and the fidelity of the cost-center dimension to per-endowment/per-property tracking are now on the critical path for closing books and passing audit.
- **A correct, maintained mapping** (platform accounts/cost-centers ↔ Wafeq accounts/cost-centers). Drift in this mapping is a live source of reconciliation errors.
- **A hard operational dependency on the reconciliation job** as the divergence detector — it must run and its errors must be actioned, not muted.

**Open integration risks to watch:**
- **Cost-center depth/limits.** Confirm Wafeq's cost-center model actually supports the Client → Waqif → Waqf → property depth (and any limits on nesting or count) for every real endowment — the multi-property evaluation must hold at production scale.
- **Corpus/income account modelling.** Validate that the segregation can be expressed as durable account classes an auditor will accept, not as ad-hoc tags.
- **Idempotency & partial failure.** A push that succeeds in Wafeq but whose acknowledgement is lost must not double-post on retry (external-reference keying must be watertight).
- **Data residency / PDPL.** Pushing waqf financial data to Wafeq must respect the KSA-residency + PDPL guardrail (CLAUDE.md tech-stack section); until KSA-resident prod exists, only fixture data may cross any boundary. Confirm Wafeq's hosting/residency posture and DPA before any real client data is pushed.
- **Accreditation scope.** Record in the engagement file exactly which accreditation (e.g., ZATCA e-invoicing, SOCPA alignment) is being relied upon, so the "accredited book of record" claim is auditable.
- **Reversals & corrections.** Define how a corrected/void platform transaction propagates as an adjusting entry in Wafeq without breaking reconciliation history.

## 7. Supersedes / updates

- **Resolves** the spec audit's **Critical** finding *"ledger system-of-record undecided (single-entry, no double-entry)."* The system of record is now decided (Wafeq for the statutory GL; platform for the operational record), and the direction of truth is fixed (platform → Wafeq).
- **Updates [§07 data model](../product/prd/07-data-model-spec.md):** the current `Transaction { TxnType REVENUE | EXPENSE }` stub is **insufficient** and must be superseded. The platform's operational ledger needs **real accounts** — a per-endowment/per-property/per-beneficiary operational chart of accounts with an explicit **corpus vs income account class** — for two reasons this ADR makes load-bearing: (a) to **enforce** the non-diminution invariant (§5), and (b) to **reconcile** line-for-line against Wafeq (§4.4). A follow-up data-model change is required before the finance/distribution epics (E5/E6) build; the revenue/expense stub must not be the substrate the corpus guard sits on.
- **Consistent with [§14 reporting](../product/prd/14-reporting-dashboards-spec.md):** the platform continues to assemble the evidence pack and never emits a SOCPA opinion; this ADR extends the same "delegate the statutory artifact, own the domain facts" principle from the audit *opinion* to the *book of record*.
- **Does not change** CLAUDE.md Binding rule 1 — it reaffirms it and assigns its enforcement unambiguously to the platform.

---

### Note on remaining trackers

This ADR decides the system of record and the direction of truth. It does **not** by itself (a) redesign the §07 operational chart of accounts — that is the follow-up flagged above; (b) discharge the PDPL/data-residency review for pushing data to Wafeq; or (c) close BR-502's implementation, which now reads "platform classifies and feeds an approved accounting system (Wafeq)" rather than "platform is the accounting system." Those remain tracked work.
