# 03 · Non-goals

What QMULATE deliberately does **not** do — the boundaries that keep the build focused and the mandate defensible.

Status: Draft v0.1 · Privileged & Confidential

This section makes exclusions explicit so scope stays honest and no reader assumes a capability that is out of scope, deferred, or a category error for the product. Each non-goal carries a one-line rationale and, where relevant, the phase or requirement that governs it. Grounded in [BRD §03 · Vision & Scope](../brd/03-vision-scope.md) and [BRD §11 · Roadmap & Phasing](../brd/11-roadmap-phasing.md).

> [!important] How to read this
> Three kinds of exclusion appear below and must not be conflated:
> - **Category non-goals** — things the product will *never* do because they are legally or professionally not its job (§1). No phase reopens these.
> - **Phased deferrals** — real scope, sequenced later (§2). These *are* built, just not now; where a deferred entity must still be modeled in Phase 1, that is stated.
> - **Out-of-product scope** — belongs to QMULATE-the-firm or another workstream, not this codebase (§3).

---

## 1. Category non-goals (never in scope, any phase)

These are permanent. They define what the software *is not*, regardless of roadmap. They flow directly from [BRD §03 · Explicit non-goals](../brd/03-vision-scope.md).

| # | Non-goal | Rationale | Guardrail the product enforces instead |
|---|---|---|---|
| NG-1 | **Not a replacement for the Nazir's legal accountability or Saudi counsel** | Legal responsibility for the Nazarah rests with the licensed Nazir and the family's counsel; software supports, evidences, and reminds — it never assumes the duty. | Reserved-matter approvals, RACI ownership, and the audit trail route accountability to named humans ([BR-1101](../brd/06-functional-requirements.md)–[BR-1103](../brd/06-functional-requirements.md), [BR-612](../brd/06-functional-requirements.md)). |
| NG-2 | **Does not give investment, legal, tax, or Sharʿī advice** | QMULATE is not a licensed advisor; the product records decisions and enforces process, it does not recommend or opine. | Decision-recording + reserved-matter workflow; the distribution engine applies the *deed's* rules, it does not choose them ([BR-505](../brd/06-functional-requirements.md), [BR-1102](../brd/06-functional-requirements.md)). |
| NG-3 | **Does not itself perform regulated real-estate activity** | Brokerage, valuation, leasing, and property development are regulated activities requiring licenses QMULATE does not hold as software; **licensed subcontractors** perform them. | Zero-tolerance KPI: no unlicensed regulated real-estate activity. Product **coordinates and evidences** subcontractor work rather than executing it ([BR-303](../brd/06-functional-requirements.md), [BR-305](../brd/06-functional-requirements.md); subcontractor coordination is Phase 3). |
| NG-4 | **Does not deviate from the Shart al-Waqif** | A Nazir cannot alter the waqif's stipulated conditions without Authority approval; the software must refuse to model distributions or beneficiary orders that contradict the deed. | Entitlement resolver derives shares strictly from ṭabaqa/ẓuhūr-buṭūn + the deed's entitlement-order rule; overrides require a logged reserved-matter approval, never a silent edit. |
| NG-5 | **Does not move money or file with regulators autonomously** | Disbursements and statutory filings are human-authorized acts under segregation of duties; the system stages and evidences them, it does not act as an unattended actor. | Maker ≠ checker on money movement and filings; TOTP-gated money/filing roles ([BR-611](../brd/06-functional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md)). |
| NG-6 | **Not a general accounting/ERP or bank ledger of record** | The waqf's books of account and dedicated bank accounts remain authoritative; the product tracks, reconciles against, and never silently overwrites them. | Reconciliation against dedicated waqf accounts, Arabic financial records, no commingling ([BR-502](../brd/06-functional-requirements.md), [BR-503](../brd/06-functional-requirements.md), [BR-506](../brd/06-functional-requirements.md)). |

---

## 2. Phased deferrals (real scope, sequenced later)

These are **in the product's ambition** ([BRD §03 "this release" = Phases 1–3](../brd/03-vision-scope.md)) but explicitly **out of Phase 1**. Building any of them in Phase 1 is out of scope. See [BRD §11](../brd/11-roadmap-phasing.md) for the authoritative sequencing.

### 2.1 No live government or bank API integrations (Phase 1)

- **What's excluded:** automated/live integration with Awqaf Digital, Baladi, Istihkam, Muqeem, Qiwa, Ejar, or banking rails.
- **Rationale:** no public APIs are evidenced in the source material ([BRD §09](../brd/09-data-integration-landscape.md)); these remain **manual status fields + document import**, not integrations.
- **What Phase 1 *does* build instead:** filing-status tracking and government-platform status fields as manual, human-updated state, plus document upload/import ([BR-604](../brd/06-functional-requirements.md), [BR-605](../brd/06-functional-requirements.md), [BR-701](../brd/06-functional-requirements.md)).

### 2.2 Client & beneficiary portal (Phase 2)

- **What's excluded from Phase 1:** beneficiary self-service verification/refresh, statements, uploads, messaging; Family Board online view and online reserved-matter approvals; cadence reporting packs and beneficiary disclosure; UBO disclosure workflow ([BR-8xx](../brd/06-functional-requirements.md), [BR-209](../brd/06-functional-requirements.md), [BR-903](../brd/06-functional-requirements.md)–[BR-905](../brd/06-functional-requirements.md)).
- **Rationale:** Phase 1 must first make one client operable and compliant from the **internal operations app**; the portal is external-facing surface that depends on that core.
- **Note:** the Expo mobile portal is **scaffolded day one** but carries no Phase-1 feature scope — scaffolding is not delivery.

### 2.3 Property operations, expropriation → istibdal, fee automation (Phase 3)

- **What's excluded from Phase 1:** property/lease/maintenance management and subcontractor coordination ([BR-302](../brd/06-functional-requirements.md), [BR-303](../brd/06-functional-requirements.md), [BR-305](../brd/06-functional-requirements.md), [BR-307](../brd/06-functional-requirements.md)); the **expropriation → compensation → istibdal** workflow ([BR-401](../brd/06-functional-requirements.md)–[BR-404](../brd/06-functional-requirements.md)); valuations and investment recording ([BR-304](../brd/06-functional-requirements.md), [BR-510](../brd/06-functional-requirements.md)); **Nazir-fee automation & client invoicing** ([BR-507](../brd/06-functional-requirements.md) full, [BR-508](../brd/06-functional-requirements.md)); zakat/tax ([BR-509](../brd/06-functional-requirements.md)); handover/training templates ([BR-609](../brd/06-functional-requirements.md), [BR-1104](../brd/06-functional-requirements.md), [BR-1105](../brd/06-functional-requirements.md)).
- **Rationale:** these depend on the Phase-1 asset register and financial core and are lower-frequency than the compliance duties that gate go-live.

> [!warning] Exception — model the Expropriation entity now
> Although the expropriation **workflow** is Phase 3, the **Expropriation entity** is modeled in Phase 1 (schema only, no workflow). This is a deliberate carve-out from the deferral so the data model does not need a breaking migration later. The **Nazir-fee deduction step** in the distribution waterfall is likewise Phase 1 (a hard rule of the engine); only fee **automation/invoicing** is deferred.

### 2.4 What Phase 1 *is* — for contrast

Phase 1 (MVP, go-live blockers) is the compliance & operations core **including the distribution engine**: endowment/deed/classification records and the client→waqif→endowment hierarchy, beneficiary & UBO/KYC registry, document vault, dedicated-account financials + reconciliation + distribution engine, compliance-task register + Authority filings + AML + audit trail, the deadline engine, dashboards, and gated onboarding ([BRD §11 Phase 1](../brd/11-roadmap-phasing.md)). Anything not on that list is, by definition, a Phase-1 non-goal.

---

## 3. Out-of-product scope (belongs elsewhere)

These are excluded from **this build entirely** — either firm-level activity or a separate workstream. They map to [BRD §03 "Out of scope"](../brd/03-vision-scope.md) and the [North Star](../brd/11-roadmap-phasing.md).

| # | Non-goal | Rationale | Where it lives |
|---|---|---|---|
| NG-7 | **Multi-asset family office** (equities, holding structures, non-waqf wealth governance) | This product governs **endowments**, not general wealth; broader family-office is the firm's North Star, not this codebase. | Vision only — [positioning](../positioning.md) / [BRD §11 North Star](../brd/11-roadmap-phasing.md). |
| NG-8 | **Standalone real-estate brokerage/advisory line** | A separate commercial line, not the Nazarah platform; conflating them would blur the regulated-activity boundary in NG-3. | Out of scope for this release. |
| NG-9 | **Serving the Businesses and Individuals segments** | This release serves **families with endowments**; other segments are future market expansion. | North Star / future roadmap. |
| NG-10 | **Public marketing / brand website** | A content site, not the operational SaaS; tracked and built separately. | `docs/brand/` — separate workstream. |
| NG-11 | **KSA data-residency / PDPL production infrastructure (this build stage)** | Deferred to **before production** per locked hosting decision; until a KSA-resident prod exists, only the anonymized fixture may exist in any Railway env. | Pre-production guardrail: `DATA_CLASSIFICATION=fixture-only`, seed/import hard-fail, CI check ([NFR-05](../brd/08-nonfunctional-requirements.md)). |

---

## 4. Acceptance criteria

Non-goals are testable: the product must **actively refuse** category non-goals and must **not ship** deferred surface in the wrong phase.

**AC-1 — Engine refuses to deviate from the deed (NG-4)**
- **Given** a beneficiary line item whose share is manually set to contradict the Shart al-Waqif's entitlement order,
- **When** the operator attempts to save the distribution run,
- **Then** the system blocks the save and requires a logged reserved-matter approval with before/after captured in the audit trail — it never silently accepts the override.

**AC-2 — No autonomous money movement or filing (NG-5)**
- **Given** a staged disbursement or statutory filing,
- **When** the same user who created it attempts to approve/release it,
- **Then** the system rejects the action on segregation-of-duties grounds (maker ≠ checker) and requires a distinct TOTP-authenticated checker.

**AC-3 — Government platforms are manual, not integrated (§2.1)**
- **Given** any government-platform status field (Awqaf Digital, Baladi, Istihkam, Muqeem, Qiwa, Ejar),
- **When** a developer inspects its data source,
- **Then** it is a human-updated status value with an audit entry — there is **no** outbound API call, sync job, or credential store for these platforms in Phase 1.

**AC-4 — Deferred surface is absent in Phase 1 (§2.2–2.3)**
- **Given** the Phase-1 build,
- **When** a reviewer audits shipped features,
- **Then** no beneficiary self-service portal features, property-ops workflows, expropriation workflow, or fee-automation/invoicing are present — **except** the Expropriation entity schema and the distribution-waterfall fee-deduction step, which are present by design.

**AC-5 — Fixture-only guardrail holds (NG-11)**
- **Given** a non-KSA (Railway) environment,
- **When** seed or import tooling receives data not flagged as fixture,
- **Then** the operation hard-fails and CI blocks the change; no real client data can enter non-KSA infrastructure.

**AC-6 — Empty/edge: advice is never generated (NG-2)**
- **Given** any screen where an operator might expect a recommendation (e.g., how to invest ghallah, which beneficiary to prefer),
- **When** the operator uses the product,
- **Then** the UI records the human's decision and rationale but presents **no** system-generated investment/legal/tax/Sharʿī recommendation.

---

## 5. Open questions

Genuinely unresolved boundary questions are routed to [16 · Open questions](16-open-questions.md), including: confirmation of the Phase 1–3 sequencing and gates ([BRD §10 Q7](../brd/10-assumptions-open-questions.md)); and whether any backlog items ([BRD §11 unscheduled](../brd/11-roadmap-phasing.md): BR-106–108, 207, 608, 610, 613, 703–704, 1004–1005; NFR-08, 10–14) are pulled forward into Phase 1.

---

## Requirements covered

This section defines boundaries around the following requirements rather than implementing them; it is referenced for scope-fencing:

- **Category non-goals & guardrails:** BR-303, BR-305, BR-502, BR-503, BR-505, BR-506, BR-611, BR-612, BR-1101, BR-1102, BR-1103, NFR-04.
- **Phased-deferral boundaries:** BR-209, BR-302, BR-304, BR-305, BR-307, BR-401, BR-402, BR-403, BR-404, BR-507, BR-508, BR-509, BR-510, BR-604, BR-605, BR-609, BR-701, BR-8xx (BR-801, BR-802, BR-804, BR-805, BR-806, BR-803), BR-903, BR-904, BR-905, BR-1104, BR-1105.
- **Out-of-product scope & pre-production guardrail:** NFR-05.
