# Scope, Phasing & P0/P1/P2

The master → Phase-1 cut: what we build first, what waits, and — ruthlessly — what blocks go-live versus what trails it.

Status: Draft v0.1 · Privileged & Confidential

---

## Purpose

The BRD defines **81 enumerated functional (BR-###) + 14 non-functional (NFR-##)** requirements across the full endowment/Nazarah platform ([03 · Vision & Scope](../brd/03-vision-scope.md), [06 · Functional Requirements](../brd/06-functional-requirements.md)). This document is the **build cut**: it maps those requirements onto three phases, then slices Phase 1 into **P0 (go-live blockers) / P1 (fast-follow) / P2 (deferred)** with the reasoning behind each call. Engineering builds top-down from this list; product defends scope with it.

The single decision this document exists to make: **the minimum system that lets QMULATE act as Nazir for the first family — four endowments across three waqifs — without ever missing a statutory duty.** Everything that is not that is later.

---

## Phasing principles

Four rules govern the cut. They come straight from the mandate ([03 · Vision & Scope](../brd/03-vision-scope.md), [11 · Roadmap & Phasing](../brd/11-roadmap-phasing.md)) and the [operating model](../../company/operating-model.md).

1. **Gated, not big-bang.** Onboarding is gated (Gate 01 Authority & Legal → Gate 02 Systems & Controls → Gate 03 People/Property/Cadence); nothing downstream proceeds until the prior gate clears. Phasing mirrors that so the first real client can go live on a small, correct core.
2. **Compliance correctness beats feature breadth.** A control that prevents a zero-tolerance failure (missed filing, commingling, stale KYC, missed AML report, unlicensed activity) outranks any convenience feature. When two requirements compete for the same sprint, the one that protects a [zero-tolerance KPI](../../company/operating-model.md) wins.
3. **Model the entity now; defer the workflow.** Where a Phase 2/3 workflow depends on a data shape, we design and migrate that shape in Phase 1 so nothing has to be reshaped later. The **Expropriation** entity ([BR-401](../brd/06-functional-requirements.md)) is the standing example: schema day one, workflow Phase 3.
4. **Ship internal-first.** Phase 1 is the **internal operations app** only. The beneficiary/Family-Board **portal** is Phase 2 but is scaffolded (Expo app, auth, access matrix) from day one so it is a build-out, not a bolt-on.

---

## Phase map

| Phase | Theme | Scope | BRD source |
|---|---|---|---|
| **Phase 1** | **Compliance & operations core (MVP)** — *this build* | Endowment/deed/hierarchy records & classification; beneficiary + UBO/KYC registry; asset register (+ disposal as reserved matter); dedicated accounts, Arabic ledger, reconciliation, **distribution engine**, internal financial controls; compliance-task register, Authority filings, AML, legal-matter tracking, immutable audit trail; deadline engine (30/15/10 bd, 3-month) on Hijri/Gregorian; compliance dashboard; reserved-matter approvals + first-client migration. | [11 · Phase 1](../brd/11-roadmap-phasing.md) |
| **Phase 2** | **Client & beneficiary portal + reporting depth** | Beneficiary self-service (verify/refresh, statements, uploads, messaging); Family Board view + online reserved-matter approvals; cadence reporting packs (monthly/quarterly/annual); UBO disclosure workflow; class-gated budgets. | [11 · Phase 2](../brd/11-roadmap-phasing.md) |
| **Phase 3** | **Property operations, expropriation & commercials** | Lease/maintenance/subcontractor management; **expropriation → compensation → istibdal** workflow; valuations, investment recording, asset development; **Nazir-fee automation & client invoicing**; zakat/tax; handover packs & training tracking; portfolio view. | [11 · Phase 3](../brd/11-roadmap-phasing.md) |
| **Out of scope (this release)** | **North Star — multi-asset family office** | Non-waqf wealth governance, standalone brokerage/advisory, the *businesses*/*individuals* segments, live government-API integrations. Vision only; **not** built here. | [03 · Out of scope](../brd/03-vision-scope.md) |

> [!note] Government platforms stay manual
> Awqaf Digital, Baladi, Istihkam, Muqeem, Qiwa, and Ejar are **manual status fields in every phase**, not live integrations — no public APIs are evidenced ([09 · Data & Integration Landscape](../brd/09-data-integration-landscape.md)). This is a scope decision, not a deferral.

---

## Phase 1 priority tiers

Phase 1 is itself too large to build in one pass. It splits into three tiers. **P0** must be complete and correct before the first client goes live. **P1** is fast-follow — needed to operate fully, but the first client can be onboarded while it lands over the following weeks (some steps run as manual checklists in the interim). **P2** is everything consciously pushed past Phase 1.

### P0 — go-live blockers

The first client cannot go live until every one of these is built and correct. Reason column states *why it blocks*.

| ID | Requirement | Why it's a go-live blocker |
|---|---|---|
| [BR-101](../brd/06-functional-requirements.md) | Endowment (waqf) record + classification | Root entity; nothing exists without it. |
| [BR-102](../brd/06-functional-requirements.md) | Client → waqif → endowment hierarchy | First client is 4 endowments / 3 waqifs; every scope, report, and access rule hangs off this shape. |
| [BR-103](../brd/06-functional-requirements.md) | Deed + **Shart al-Waqif** structured (entitlement-order rule, maintenance reserve, disbursement channel) | The distribution engine reads this; shares cannot be computed without the structured conditions. |
| [BR-104](../brd/06-functional-requirements.md) | Classification gating | Decides which obligations fire; wrong tier = wrong compliance surface = silent non-compliance. |
| [BR-105](../brd/06-functional-requirements.md) | Trusteeship deed (primary + authorized-rep, joint & several liability) | Defines who may approve and sign — prerequisite for every maker/checker gate. |
| [BR-109](../brd/06-functional-requirements.md) | Nazir eligibility **capture** (incl. KSA residency) | [NFR-09](../brd/08-nonfunctional-requirements.md) constraint; cannot seat a Nazir who fails eligibility. *(Exhaustive verification checklist → P1.)* |
| [BR-201](../brd/06-functional-requirements.md) | Beneficiary (Mustahiq) registry | Distribution and KYC have no subject without it. |
| [BR-202](../brd/06-functional-requirements.md) | UBO minimum dataset | Statutory BO data; also the payout banking details. |
| [BR-203](../brd/06-functional-requirements.md) | UBO flag (distinct from ordinary beneficiary) | AML/BO obligation; drives disclosure and screening. |
| [BR-204](../brd/06-functional-requirements.md) | Lineage: **ṭabaqa / ẓuhūr-buṭūn** + entitlement-order | The resolver's core input; ordered-vs-shared logic depends on it. |
| [BR-205](../brd/06-functional-requirements.md) | KYC verification + freshness state | Hard distribution gate; a stale/unverified beneficiary must block their payout line. |
| [BR-206](../brd/06-functional-requirements.md) | Beneficiary category capture + block disbursement until captured | Statutory gate on money movement. |
| [BR-210](../brd/06-functional-requirements.md) | Beneficiary data isolation + access matrix | Sensitive personal data; PDPL + BO confidentiality. |
| [BR-301](../brd/06-functional-requirements.md) | Asset register (title deeds, parcels, valuation) | Revenue and classification source; every ghallah figure traces to an asset. |
| [BR-306](../brd/06-functional-requirements.md) | Disposal/substitution/pledge as **reserved matters** | Zero-tolerance guardrail against unauthorized disposal of endowed property. |
| [BR-501](../brd/06-functional-requirements.md) | Dedicated waqf accounts, **no commingling** | Zero-tolerance KPI 2. |
| [BR-502](../brd/06-functional-requirements.md) | Revenue/expense in **Arabic**, SOCPA chart of accounts | Ledger foundation; official records must be Arabic ([NFR-01](../brd/08-nonfunctional-requirements.md)). |
| [BR-505](../brd/06-functional-requirements.md) | **Distribution engine** (waterfall + entitlement resolver + gates + 3-month timing) | The flagship Phase-1 engine; the mandate's central act. |
| [BR-506](../brd/06-functional-requirements.md) | Maker/checker on bank movements & distribution runs | Segregation of duties on money; initiator ≠ sole approver. |
| [BR-507](../brd/06-functional-requirements.md) *(deduction step only)* | **Nazir-fee deduction in the waterfall** (default 10% of revenue / ʿushr; basis configurable) | Distribution **correctness** — the distributable amount is wrong without it. *(Fee automation + invoicing → Phase 3; see nuance below.)* |
| [BR-601](../brd/06-functional-requirements.md) | Templated compliance-task register (class-filtered) | The operational backbone; how every obligation is tracked. |
| [BR-602](../brd/06-functional-requirements.md) | Authority registration/updates with statutory deadlines + evidence | Zero-tolerance KPI 1. |
| [BR-603](../brd/06-functional-requirements.md) | Government-platform filing statuses (manual fields) | Evidences filings against Awqaf Digital/Baladi/etc. |
| [BR-604](../brd/06-functional-requirements.md) | AML SAR recording + **no tipping-off** | Zero-tolerance KPI 4; restricted visibility, no subject notification. |
| [BR-605](../brd/06-functional-requirements.md) | Beneficial-owner records + periodic verification | BO Standards obligation; pairs with BR-2xx. |
| [BR-607](../brd/06-functional-requirements.md) | Immutable, complete **audit trail** | [NFR-04](../brd/08-nonfunctional-requirements.md); nothing is defensible in audit/dispute without it. |
| [BR-701](../brd/06-functional-requirements.md) | Structured document vault per endowment | Home for deeds, certificates, KYC/AML files, financials. |
| [BR-702](../brd/06-functional-requirements.md) | Retention ≥ 10 years + access matrix + audit on docs | [NFR-07](../brd/08-nonfunctional-requirements.md); statutory. |
| [BR-901](../brd/06-functional-requirements.md) | Compliance dashboard (zero-tolerance KPIs surfaced) | The daily operating surface; also carries the **basic financial view** (see nuance below). |
| [BR-1001](../brd/06-functional-requirements.md) | Deadline engine — 30/15/10 bd, 3-month, KSA business days | The reason the platform exists; spreadsheets cannot do this. |
| [BR-1002](../brd/06-functional-requirements.md) | 15-bd update trigger on expiry / material change | Keeps registrations current; zero-tolerance KPI 1. |
| [BR-1003](../brd/06-functional-requirements.md) | Hijri **and** Gregorian throughout | Statutory dates are Hijri; deadlines miscompute without it. |
| [BR-1102](../brd/06-functional-requirements.md) | Reserved-matter approval workflow | Hard control; the enforcement point for every reserved action. |
| [BR-1106](../brd/06-functional-requirements.md) | First-client data migration | Go-live *is* migrating the first client. *(Build the tooling in Phase 1; real-data migration itself waits on the KSA-resident prod gate — see below.)* |

**P0 non-functionals:** [NFR-01](../brd/08-nonfunctional-requirements.md) (bilingual/RTL, Arabic records), [NFR-02](../brd/08-nonfunctional-requirements.md) (Hijri/Gregorian), [NFR-03](../brd/08-nonfunctional-requirements.md) (KSA residency + PDPL — *designed in Phase 1; residency itself is a pre-production gate*), [NFR-04](../brd/08-nonfunctional-requirements.md) (audit trail), [NFR-05](../brd/08-nonfunctional-requirements.md) (access matrix + no-tipping-off), [NFR-06](../brd/08-nonfunctional-requirements.md) (security), [NFR-07](../brd/08-nonfunctional-requirements.md) (retention), [NFR-08](../brd/08-nonfunctional-requirements.md) *(maker/checker on money & filings only)*, [NFR-09](../brd/08-nonfunctional-requirements.md) (eligibility constraints).

> [!warning] The data-residency guardrail is not optional
> Until a KSA-resident production environment exists, **only the anonymized fixture may live in any Railway environment** (`DATA_CLASSIFICATION=fixture-only`; seed refuses non-fixture; import tooling hard-fails; CI enforces). BR-1106's *tooling* is P0; the actual migration of real client data is gated on KSA prod + PDPL sign-off. See [NFR-03](../brd/08-nonfunctional-requirements.md).

### P1 — Phase-1 fast-follow

Still Phase 1, still required to operate the mandate fully — but the first client can be onboarded before these land, running the gap as a manual/checklist process for a few weeks.

| ID | Requirement | Why P1, not P0 |
|---|---|---|
| [BR-109](../brd/06-functional-requirements.md) *(full checklist)* | Exhaustive eligibility verification (provenance, prior-removal history, legal-person licensing) | Core capture (residency, capacity) is P0; the full documentary checklist can be completed manually for the first Nazir while the workflow is built. |
| [BR-208](../brd/06-functional-requirements.md) | Historical payment records & classification per beneficiary | Needed for the annual cycle, not for the first distribution run; backfilled during migration. |
| [BR-503](../brd/06-functional-requirements.md) | Periodic bank reconciliation | First month can reconcile manually; automate immediately after go-live to protect [NFR-14](../brd/08-nonfunctional-requirements.md). |
| [BR-511](../brd/06-functional-requirements.md) | Cross-border disbursement + Authority notice | Only fires if a beneficiary is outside the Kingdom; the engine gates the line until it exists, so it can trail the first domestic run. |
| [BR-606](../brd/06-functional-requirements.md) | Internal bylaws for Large/Medium | Class-gated obligation; tracked as a task at go-live, enforced as a structured artifact shortly after. |
| [BR-611](../brd/06-functional-requirements.md) | Internal financial controls (protection, proper disbursement) | Maker/checker (P0) covers the acute risk; the fuller control set follows. |
| [BR-612](../brd/06-functional-requirements.md) | Legal & judicial case management | Real, but no active litigation blocks day-one onboarding of a clean engagement. |
| [BR-703](../brd/06-functional-requirements.md) | Document versioning & metadata | Vault (P0) stores documents; versioning is a maturity add. |
| [BR-704](../brd/06-functional-requirements.md) | Correspondence-on-record channel | Policy at go-live, tooling as fast-follow. |
| [BR-902](../brd/06-functional-requirements.md) | Class-appropriate financial **statement** generation (SOCPA-audited for Large/Medium) | The **basic financial view** is P0; formal statement/audit-pack generation is P1 (see nuance below). |
| [BR-906](../brd/06-functional-requirements.md) | Audit-ready evidence pack on demand | Pulled forward from the BRD's later phase because auditors ask early; builds on the P0 audit trail + vault. |
| [BR-1004](../brd/06-functional-requirements.md) | Escalation of overdue/at-risk obligations | Dashboard (P0) surfaces status; automated escalation routing is the follow-on. |
| [BR-1005](../brd/06-functional-requirements.md) | KYC-refresh / certificate / licence / cadence reminders | Deadline engine (P0) covers statutory windows; softer recurring reminders follow. |
| [BR-1101](../brd/06-functional-requirements.md) | Gated-onboarding orchestration (Gate 01/02/03) | Reserved-matter approvals (P0) are the hard control; the first client is gated **manually** while the 3-gate flow is encoded. |
| [BR-1103](../brd/06-functional-requirements.md) | RACI encoding (routing of approvals/notifications) | Roles exist in the access matrix (P0); automated routing is fast-follow. |
| [BR-1105](../brd/06-functional-requirements.md) | New-endowment setup templates | Speeds *client #2*; the first client is set up hands-on regardless. |

**P1 non-functionals:** [NFR-10](../brd/08-nonfunctional-requirements.md) (availability/reliability), [NFR-11](../brd/08-nonfunctional-requirements.md) (accessibility/UX), [NFR-12](../brd/08-nonfunctional-requirements.md) (auditability/exports), [NFR-13](../brd/08-nonfunctional-requirements.md) (configurability), [NFR-14](../brd/08-nonfunctional-requirements.md) (data integrity/reconciliation).

### P2 — deferred past Phase 1

Consciously out of Phase 1. Grouped by target phase, with the reasoning for the deferral. **Entities are modeled in Phase 1 where a later workflow needs the shape** (see principle 3).

| Target | IDs | Reasoning |
|---|---|---|
| **Phase 2 — portal & reporting depth** | [BR-207](../brd/06-functional-requirements.md), [BR-209](../brd/06-functional-requirements.md), [BR-801](../brd/06-functional-requirements.md)–[BR-806](../brd/06-functional-requirements.md), [BR-903](../brd/06-functional-requirements.md), [BR-805](../brd/06-functional-requirements.md), [BR-905](../brd/06-functional-requirements.md), [BR-504](../brd/06-functional-requirements.md) | The portal is a second face; the first client is served **staff-operated** in Phase 1. Beneficiary self-service, Family-Board views, cadence packs, UBO disclosure, and class-gated budgets all sit behind that face. Portal shell is scaffolded day one so this is a build-out, not a rewrite. |
| **Phase 3 — property, expropriation & commercials** | [BR-302](../brd/06-functional-requirements.md)–[BR-305](../brd/06-functional-requirements.md), [BR-307](../brd/06-functional-requirements.md), [BR-401](../brd/06-functional-requirements.md)–[BR-404](../brd/06-functional-requirements.md), [BR-507](../brd/06-functional-requirements.md) *(automation)*, [BR-508](../brd/06-functional-requirements.md), [BR-509](../brd/06-functional-requirements.md), [BR-510](../brd/06-functional-requirements.md), [BR-609](../brd/06-functional-requirements.md), [BR-904](../brd/06-functional-requirements.md), [BR-1104](../brd/06-functional-requirements.md) | Active property operations, the govt-taking → compensation → istibdal chain, fee automation/invoicing, zakat, investments, handover, portfolio view, and training tracking are not needed to run one clean family engagement. **The asset register (BR-301) is P0 and the Expropriation entity is modeled in Phase 1; only its workflow is Phase 3.** |
| **Backlog — schedule or defer each cycle** | [BR-106](../brd/06-functional-requirements.md), [BR-107](../brd/06-functional-requirements.md), [BR-108](../brd/06-functional-requirements.md), [BR-608](../brd/06-functional-requirements.md), [BR-610](../brd/06-functional-requirements.md), [BR-613](../brd/06-functional-requirements.md) | Defined but unscheduled ([11 · Backlog](../brd/11-roadmap-phasing.md)): condition-interpretation requests, certificate-validity tracking (*its expiry trigger is already covered by the P0 BR-1002*), successor-Nazir designation, licence/permit renewals, conflict-of-interest/self-dealing blocks, donation approval. Revisit every planning cycle. |

---

## Two calls that look inconsistent but aren't

Both are deliberate splits where part of one BR-### is P0 and the rest is deferred. Flagged here so no one "corrects" them.

### 1 · Nazir-fee **deduction** is P0; fee **automation & invoicing** is Phase 3

[BR-507](../brd/06-functional-requirements.md) spans two very different things:

- **The deduction step** — subtracting the Nazir fee inside the distribution waterfall (after maintenance reserve and operating cost, before distributable) — is **P0**. Without it the distributable amount, and therefore every beneficiary's payout, is **arithmetically wrong**. The engine must apply the deed-set fee (default **10% of revenue** = ʿushr; basis configurable: `percent_of_revenue | percent_of_net_income | retainer`).
- **Fee automation & client invoicing** — generating QMULATE's own invoices, engagement/SLA tracking, commercial billing ([BR-508](../brd/06-functional-requirements.md)) — is **Phase 3**. It is a back-office commercial convenience, not distribution correctness.

The distinction: one is *how much the beneficiaries receive* (correctness, non-negotiable); the other is *how QMULATE bills* (commercial, can wait).

### 2 · A basic financial **view** is P0; SOCPA-audited **statement generation** is P1

- **Basic financial view** — cash position, revenue/expense, distributions, arrears, read off the P0 Arabic ledger ([BR-502](../brd/06-functional-requirements.md)) and surfaced on the compliance dashboard ([BR-901](../brd/06-functional-requirements.md)) — is **P0**. The Nazir cannot operate blind to the money.

  > ⊗ **SUPERSEDED IN PART, 2026-09-03 (product owner ruling, `d3ef04c`; implemented S11 item 2c).** The
  > words *"surfaced on the compliance dashboard ([BR-901])"* above are **the DRIFTED side** and are kept
  > as written rather than rewritten, per the annotate-in-place protocol. **The P0 financial view has its
  > own screen: `/financials`**, built to [`13-ux-designsystem-reference.md`](./13-ux-designsystem-reference.md)
  > §10's layout and four states — the only layout spec for financial figures in this repository — and
  > [`17-build-ship-dod.md:138`](./17-build-ship-dod.md)'s *"both dashboards"* is the side the ruling
  > UPHOLDS. Everything else in this bullet stands: the figures, the P0 priority, and the reason.
  >
  > ⚠ **AND ONE CONFLICT THIS LINE PARTLY CAUSES IS STILL OPEN WITH THE OWNER, unresolved by that
  > ruling:** `17:138` DEFINES the financial dashboard as *"cash position, revenue/expense,
  > distributions, arrears; **class-appropriate statements**"* and marks E10's exit **P0** — while
  > statement generation is **P1** in this document's own §5. **A P0 exit criterion therefore requires a
  > P1 feature.** One of the two has to move; neither engineering nor the orchestrator moves it, and
  > **E10's exit stands UNCLAIMED for that reason — a spec conflict, not a shortfall in the work.**
- **Class-appropriate statement generation** — SOCPA-aligned audited statements for Large/Medium, simplified annual statements for Small/direct-utilization ([BR-902](../brd/06-functional-requirements.md)) — is **P1**. It is a formatted, class-gated output layered on the same ledger; the first client can see and reconcile their finances before the formal statement generator exists, and produce the first statutory statement by year-end.

---

## Acceptance criteria

Scope and phasing are themselves enforced in the product — a deferred feature must not leak into Phase 1, and go-live must be blocked until P0 is whole.

**Go-live is blocked until every P0 requirement is verifiably complete**
- **Given** an endowment being prepared for go-live with an incomplete P0 control (e.g. no maker/checker configured on its bank account, [BR-506](../brd/06-functional-requirements.md)),
- **When** an operator attempts to mark the endowment "live",
- **Then** the system refuses, lists the incomplete P0 items with links, and records the blocked attempt in the audit trail.

**Deferred entities are modeled but their workflows are inert**
- **Given** the Expropriation entity exists in the schema in Phase 1 ([BR-401](../brd/06-functional-requirements.md)) but its workflow is Phase 3,
- **When** a user opens an asset and looks for expropriation actions,
- **Then** the data model accepts an expropriation record if imported, **but** the initiate/compensation/istibdal workflow controls are absent or disabled with a "Phase 3" empty state — never a half-wired action that could be triggered.

**Phase 2/3 surfaces are hidden, not broken, in Phase 1**
- **Given** the beneficiary portal is Phase 2 and scaffolded but not enabled,
- **When** the app renders for a Phase-1 internal user,
- **Then** portal-only navigation is not shown, and any direct route to a Phase-2 screen returns a clear "not yet available" state — not a runtime error or a partially functional page.

**The fixture-only residency guardrail refuses real data**
- **Given** a Railway environment with `DATA_CLASSIFICATION=fixture-only` (no KSA-resident prod yet),
- **When** the import tooling ([BR-1106](../brd/06-functional-requirements.md)) is handed a record not tagged as fixture data,
- **Then** the import **hard-fails** with an explicit residency/PDPL message, writes nothing, and the CI classification check fails the build if such a path is reachable.

**Empty state — a fresh Phase-1 install**
- **Given** a newly provisioned Phase-1 environment with only the anonymized fixture seeded,
- **When** a Nazir opens the compliance dashboard ([BR-901](../brd/06-functional-requirements.md)),
- **Then** they see the fixture family's endowments with computed deadlines and zero-tolerance KPI tiles populated — proving the P0 core is wired end-to-end before any real client touches it.

---

## Requirements covered

This section prioritizes and phases the full requirement set; the ids it explicitly tiers are:

- **Phase 1 · P0:** [BR-101](../brd/06-functional-requirements.md), [BR-102](../brd/06-functional-requirements.md), [BR-103](../brd/06-functional-requirements.md), [BR-104](../brd/06-functional-requirements.md), [BR-105](../brd/06-functional-requirements.md), [BR-109](../brd/06-functional-requirements.md), [BR-201](../brd/06-functional-requirements.md), [BR-202](../brd/06-functional-requirements.md), [BR-203](../brd/06-functional-requirements.md), [BR-204](../brd/06-functional-requirements.md), [BR-205](../brd/06-functional-requirements.md), [BR-206](../brd/06-functional-requirements.md), [BR-210](../brd/06-functional-requirements.md), [BR-301](../brd/06-functional-requirements.md), [BR-306](../brd/06-functional-requirements.md), [BR-501](../brd/06-functional-requirements.md), [BR-502](../brd/06-functional-requirements.md), [BR-505](../brd/06-functional-requirements.md), [BR-506](../brd/06-functional-requirements.md), [BR-507](../brd/06-functional-requirements.md) *(deduction)*, [BR-601](../brd/06-functional-requirements.md), [BR-602](../brd/06-functional-requirements.md), [BR-603](../brd/06-functional-requirements.md), [BR-604](../brd/06-functional-requirements.md), [BR-605](../brd/06-functional-requirements.md), [BR-607](../brd/06-functional-requirements.md), [BR-701](../brd/06-functional-requirements.md), [BR-702](../brd/06-functional-requirements.md), [BR-901](../brd/06-functional-requirements.md), [BR-1001](../brd/06-functional-requirements.md), [BR-1002](../brd/06-functional-requirements.md), [BR-1003](../brd/06-functional-requirements.md), [BR-1102](../brd/06-functional-requirements.md), [BR-1106](../brd/06-functional-requirements.md)
- **Phase 1 · P1:** [BR-109](../brd/06-functional-requirements.md) *(full checklist)*, [BR-208](../brd/06-functional-requirements.md), [BR-503](../brd/06-functional-requirements.md), [BR-511](../brd/06-functional-requirements.md), [BR-606](../brd/06-functional-requirements.md), [BR-611](../brd/06-functional-requirements.md), [BR-612](../brd/06-functional-requirements.md), [BR-703](../brd/06-functional-requirements.md), [BR-704](../brd/06-functional-requirements.md), [BR-902](../brd/06-functional-requirements.md), [BR-906](../brd/06-functional-requirements.md), [BR-1004](../brd/06-functional-requirements.md), [BR-1005](../brd/06-functional-requirements.md), [BR-1101](../brd/06-functional-requirements.md), [BR-1103](../brd/06-functional-requirements.md), [BR-1105](../brd/06-functional-requirements.md)
- **P2 · Phase 2:** [BR-207](../brd/06-functional-requirements.md), [BR-209](../brd/06-functional-requirements.md), [BR-504](../brd/06-functional-requirements.md), [BR-801](../brd/06-functional-requirements.md), [BR-802](../brd/06-functional-requirements.md), [BR-803](../brd/06-functional-requirements.md), [BR-804](../brd/06-functional-requirements.md), [BR-805](../brd/06-functional-requirements.md), [BR-806](../brd/06-functional-requirements.md), [BR-903](../brd/06-functional-requirements.md), [BR-905](../brd/06-functional-requirements.md)
- **P2 · Phase 3:** [BR-302](../brd/06-functional-requirements.md), [BR-303](../brd/06-functional-requirements.md), [BR-304](../brd/06-functional-requirements.md), [BR-305](../brd/06-functional-requirements.md), [BR-307](../brd/06-functional-requirements.md), [BR-401](../brd/06-functional-requirements.md), [BR-402](../brd/06-functional-requirements.md), [BR-403](../brd/06-functional-requirements.md), [BR-404](../brd/06-functional-requirements.md), [BR-507](../brd/06-functional-requirements.md) *(automation)*, [BR-508](../brd/06-functional-requirements.md), [BR-509](../brd/06-functional-requirements.md), [BR-510](../brd/06-functional-requirements.md), [BR-609](../brd/06-functional-requirements.md), [BR-904](../brd/06-functional-requirements.md), [BR-1104](../brd/06-functional-requirements.md)
- **P2 · Backlog:** [BR-106](../brd/06-functional-requirements.md), [BR-107](../brd/06-functional-requirements.md), [BR-108](../brd/06-functional-requirements.md), [BR-608](../brd/06-functional-requirements.md), [BR-610](../brd/06-functional-requirements.md), [BR-613](../brd/06-functional-requirements.md)
- **Non-functionals:** [NFR-01](../brd/08-nonfunctional-requirements.md), [NFR-02](../brd/08-nonfunctional-requirements.md), [NFR-03](../brd/08-nonfunctional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md), [NFR-05](../brd/08-nonfunctional-requirements.md), [NFR-06](../brd/08-nonfunctional-requirements.md), [NFR-07](../brd/08-nonfunctional-requirements.md), [NFR-08](../brd/08-nonfunctional-requirements.md), [NFR-09](../brd/08-nonfunctional-requirements.md) *(P0)* · [NFR-10](../brd/08-nonfunctional-requirements.md), [NFR-11](../brd/08-nonfunctional-requirements.md), [NFR-12](../brd/08-nonfunctional-requirements.md), [NFR-13](../brd/08-nonfunctional-requirements.md), [NFR-14](../brd/08-nonfunctional-requirements.md) *(P1)*
