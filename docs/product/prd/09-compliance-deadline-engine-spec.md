# Compliance & Deadline Engine Spec

Three coupled engines — a classification-gated compliance-task library, a dual-calendar KSA business-day deadline engine, and an AML no-tipping-off sub-engine — that make QMULATE **never miss a statutory duty**.

Status: Draft v0.1 · Privileged & Confidential

---

## Scope & engine map

This section specifies the **HOW** for QMULATE's compliance core: the machinery that turns the Nazarah regulation's obligations into tracked, deadline-bearing, classification-appropriate work, and that isolates AML reporting. It builds [BR-601](../brd/06-functional-requirements.md)–[BR-605](../brd/06-functional-requirements.md), [BR-607](../brd/06-functional-requirements.md), and [BR-1001](../brd/06-functional-requirements.md)–[BR-1005](../brd/06-functional-requirements.md), and honors [NFR-02](../brd/08-nonfunctional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md), [NFR-05](../brd/08-nonfunctional-requirements.md), [NFR-07](../brd/08-nonfunctional-requirements.md), [NFR-13](../brd/08-nonfunctional-requirements.md). It is grounded in [unified-framework](../../domain/unified-framework.md) §3 (and §1), the [Nazarah regulation](../../domain/regulations/nazarah-regulation-en.md), and the [Beneficial Ownership Standards](../../domain/regulations/beneficial-ownership-standards.md).

Three engines, tightly coupled but separable:

| Engine | Owns | Produces | Consumed by |
|---|---|---|---|
| **A · Compliance-task** | The obligation **template library** + per-endowment instantiation + classification gating + reclassification history. | `ComplianceTask` records tagged by section/workstream/classification. | Compliance board & dashboard ([BR-901](../brd/06-functional-requirements.md)), Engine B (tasks carry deadlines). |
| **B · Deadline** | Statutory-date computation in **Hijri + Gregorian KSA business days**, triggers, escalation, reminders. | `Deadline` records (frozen), escalations, reminders. | Every deadline-bearing task; dashboard; jobs. |
| **C · AML sub-engine** | The **"report-was-filed"** record, FIU follow-up, and **no-tipping-off** confidentiality. | `AmlReport` / `AmlFollowUp` in the `AML_RESTRICTED` compartment. | AML-cleared roles only. |

**Where it lives.** The pure decision logic — gating predicates, business-day arithmetic, Hijri conversion, escalation-state computation — is in **`packages/domain`** (imports nothing internal; deterministic; unit-tested against fixed calendars). Persistence, the seeded template library, and the `AML_RESTRICTED` visibility class live in **`packages/database`** (Prisma). Recurring evaluation (reminders, escalation, trigger sweeps) runs in **`apps/worker`** via **pg-boss** on **Railway Cron**. Data shapes below are the engine's working contract; the canonical Prisma schema is in [03 · Data model](07-data-model-spec.md). Calendar mechanics for display (dual dates, SAR tabular-nums, RTL) are in [13 · i18n & localization](11-localization-spec.md); notification transport in [14 · Jobs & notifications](09-compliance-deadline-engine-spec.md); the audit trail in [08 · Audit & controls](12-security-audit-retention-spec.md).

**Boundary with the distribution engine.** This section owns the **timing** of distribution (the 3-months-after-FYE deadline) and the KYC/UBO/category **gate obligations** as compliance tasks. It does **not** own the ghallah waterfall or the entitlement resolver — those are [04 · Distribution & entitlement engines](08-distribution-engine-spec.md). Where a distribution line is blocked on stale KYC, this engine supplies the freshness state; that engine enforces the block.

---

## Engine A — Compliance-task engine

### The obligation template library

A **versioned, seeded library** derived 1:1 from the [unified-framework](../../domain/unified-framework.md)'s three sections (financial §1 / operational §2 / government-legal §3) and cross-checked against the [compliance-traceability matrix](../brd/07-compliance-traceability.md). Each `ObligationTemplate` is **immutable within a library version**; changing an obligation means publishing a new version, never mutating a shipped row (so historical tasks always trace to the exact text that governed them).

```ts
// packages/domain — the template is pure config; DB seed lives in packages/database
type Section = "financial" | "operational" | "government_legal";
type ClassificationGate =
  | "all"             // {large, medium, small, direct-utilization}
  | "large_medium"    // {large, medium}
  | "small_direct"    // {small, direct-utilization}
  | "exclude_direct"  // {large, medium, small} — has monetary distribution
  | "has_income";     // runtime predicate: any class WHERE the waqf records revenue/expense
type Recurrence = "once" | "annual" | "quarterly" | "monthly" | "event" | "ongoing";

interface ObligationTemplate {
  code: string;               // stable, e.g. "GOV-REG-02"
  libraryVersion: string;     // templates immutable per version
  section: Section;
  workstream: string;         // matches the framework subsection label
  titleAr: string; titleEn: string;
  classificationGate: ClassificationGate;
  recurrence: Recurrence;
  deadlineRuleCode: string | null;   // FK into the Engine-B rule table
  defaultOwnerRole: string;          // RACI role (Case Manager, Finance, Compliance, ...)
  isReservedMatter: boolean;
  phase: 1 | 2 | 3;                  // Phase-1 cut per the roadmap
  regulationRefs: string[];          // e.g. ["Nazarah Art. 8(2)", "UF §3-1"]
  brRefs: string[];
}
```

The canonical library (derived from the framework's ~30 sub-obligation clusters). `Gate` uses the enum above; `Deadline` names an Engine-B rule (§B) or `—`.

> ⊕ **AMENDED 2026-08-26 (S9-2, library version `2026-08-26.1`) per owner rulings** — S8-Q9 fourth batch
> (*"minimum three become templates"*: `FIN-MGT-05`, `FIN-DIST-03`, `GOV-GEN-04` added; the remaining seven
> untracked framework bullets are DELIBERATE non-coverage, recorded with reasons in
> `FRAMEWORK_BULLETS_WITHOUT_TEMPLATE`), S8-Q8a (*"two rows: once + annual review"*: `GOV-SHART-02` is now
> cadence `once` and `GOV-SHART-03` carries the annual review — both owner-provisional pending counsel),
> and S8-Q8b (*"annual + on-request"*: `GOV-GEN-01` is `annual`; on-request access is conduct, not a
> schedulable task). ⚠ `FIN-MGT-05`'s cadence cell is the framework's own compound (الدورية والسنوية —
> *periodic AND annual*), NOT flattened: the engine ships it cadence-less with the question recorded
> (`UNRESOLVED_RECURRENCE_SUBJECTS`), routed to the owner.

#### Financial (§1)

| Code | Workstream | Obligation | Gate | Recurrence | Deadline | Traces |
|---|---|---|---|---|---|---|
| FIN-ACC-01 | Accounting | Subscribe to & maintain an approved accounting system | `all` | once | — | [BR-502](../brd/06-functional-requirements.md); UF §1-1 |
| FIN-ACC-02 | Accounting | Record & classify all revenue/expenses **in Arabic**, regularly | `has_income` | ongoing | — | [BR-502](../brd/06-functional-requirements.md); §1-1 |
| FIN-ACC-03 | Accounting | Verify invoices/expenses before approval | `all` | ongoing | — | [BR-611](../brd/06-functional-requirements.md); §1-1 |
| FIN-ACC-04 | Accounting | Periodic bank reconciliation vs ledger | `has_income` | monthly | — | [BR-503](../brd/06-functional-requirements.md); §1-1 |
| FIN-MGT-01 | Financial mgmt | Maintain **dedicated** waqf account(s); **no commingling** | `all` | ongoing | — | [BR-501](../brd/06-functional-requirements.md); §1-2 |
| FIN-MGT-02 | Financial mgmt | Prepare budget / estimates | `large_medium` | annual | — | [BR-504](../brd/06-functional-requirements.md); §1-2 |
| FIN-MGT-03 | Financial mgmt | **SOCPA-audited** financial statements | `large_medium` | annual | — | [BR-902](../brd/06-functional-requirements.md); Art. 15; §1-2 |
| FIN-MGT-04 | Financial mgmt | **Simplified annual** financial statement | `small_direct` | annual | — | [BR-902](../brd/06-functional-requirements.md); Art. 15; §1-2 |
| FIN-MGT-05 | Financial mgmt | **Prepare** the periodic & annual financial statements (position, results, related reports) | `all` | periodic + annual | — | [BR-902](../brd/06-functional-requirements.md); §1-2 |
| FIN-DIST-01 | Distribution | Compute & disburse ghallah per Shart via dedicated accounts | `exclude_direct` | per Shart / annual | `DISTRIBUTE_3M_FYE` | [BR-505](../brd/06-functional-requirements.md); §1-3 |
| FIN-DIST-02 | Distribution | Produce per-beneficiary distribution statements | `exclude_direct` | per run | — | [BR-505](../brd/06-functional-requirements.md); §1-3 |
| FIN-DIST-03 | Distribution | Observe **waqif intent** where the beneficiary is unspecified / naming lapses / shart is general; **refer to the competent authority** | `all` | event | — | [BR-505](../brd/06-functional-requirements.md); §1-3 |
| FIN-ZKT-01 | Zakat & tax | Prepare/review zakat/tax filings where applicable | `has_income` | annual | external | [BR-509](../brd/06-functional-requirements.md); §1-4 |
| FIN-ZKT-02 | Zakat & tax | Track financial/statutory fees & deadlines | `all` | ongoing | — | [BR-608](../brd/06-functional-requirements.md); §1-4 |

#### Operational (§2) — Phase 3 workflow depth; templates tracked from day one

| Code | Workstream | Obligation | Gate | Recurrence | Deadline | Traces |
|---|---|---|---|---|---|---|
| OPS-LEASE-01 | Property & leasing | Rent collection, leasing, handover, arrears, tenant relations | `has_income` | ongoing | — | [BR-302](../brd/06-functional-requirements.md); §2-1 |
| OPS-MAINT-01 | Operations & maintenance | Preventive/corrective maintenance, utilities, safety, contractor supervision | `all` | ongoing | — | [BR-303](../brd/06-functional-requirements.md); §2-2 |
| OPS-MON-01 | Operational monitoring | Supervise labour & daily ops; coordinate service providers | `all` | ongoing | — | [BR-303](../brd/06-functional-requirements.md); §2-3 |

#### Government & legal (§3) — Phase-1 heavy

| Code | Workstream | Obligation | Gate | Recurrence | Deadline | Traces |
|---|---|---|---|---|---|---|
| GOV-REG-01 | Authority registration | Register waqf **+ all assets** with the Authority | `all` | once | `REGISTER_30BD` | [BR-602](../brd/06-functional-requirements.md); Art. 8(1); §3-1 |
| GOV-REG-02 | Authority registration | **Update** waqf data on certificate expiry / material change | `all` | event | `UPDATE_15BD` | [BR-1002](../brd/06-functional-requirements.md), [BR-107](../brd/06-functional-requirements.md); Art. 8(2); §3-1 |
| GOV-REG-03 | Authority registration | Apply & maintain the Authority **classification** | `all` | ongoing | — | [BR-104](../brd/06-functional-requirements.md); Art. 8(3); §3-1 |
| GOV-SHART-01 | Shart execution | Execute the **Shart al-Waqif**; no deviation without permission | `all` | ongoing | — | [BR-103](../brd/06-functional-requirements.md); Art. 9; §3-2 |
| GOV-SHART-02 | Shart execution | Prepare **internal bylaws** (per Shart & Authority rules) | `large_medium` | once | — | [BR-606](../brd/06-functional-requirements.md); Art. 9(4); §3-2 |
| GOV-SHART-03 | Shart execution | **Annual review** of the internal bylaws | `large_medium` | annual | — | [BR-606](../brd/06-functional-requirements.md); Art. 9(4); §3-2 |
| GOV-GEN-01 | Nazir obligations | Make info available to beneficiaries; **periodic statements** | `large_medium` | annual | — | [BR-802](../brd/06-functional-requirements.md); Art. 10(3,9); §3-3 |
| GOV-GEN-02 | Nazir obligations | Stakeholder **communication channel** (inquiries/complaints) | `all` | ongoing | — | [BR-804](../brd/06-functional-requirements.md); Art. 10(5); §3-3 |
| GOV-GEN-03 | Nazir obligations | **Cross-border** disbursement mechanism + Authority notice | `exclude_direct` | event | — | [BR-511](../brd/06-functional-requirements.md); Art. 10(7); §3-3 |
| GOV-GEN-04 | Nazir obligations | Comply with **donation-collection** rules; **no such activity without prior approval** | `all` | event | — | [BR-802](../brd/06-functional-requirements.md); Art. 10; §3-3 |
| GOV-AML-01 | AML/CTF | Collect, verify & **keep-current** UBO data (re-verification) | `all` | annual | `KYC_REFRESH` | [BR-605](../brd/06-functional-requirements.md), [BR-205](../brd/06-functional-requirements.md); Art. 10(8); §3-4 |
| GOV-AML-02 | AML/CTF | **Report AML/CTF suspicion** to the FIU (→ Engine C) | `all` | event | `AML_IMMEDIATE` | [BR-604](../brd/06-functional-requirements.md); Art. 10(10); §3-4 |
| GOV-PROT-01 | Waqf protection | Reserve **maintenance (ṣiyāna)** before distribution; preserve asset | `all` | ongoing | — | [BR-303](../brd/06-functional-requirements.md), [BR-505](../brd/06-functional-requirements.md); Art. 12; §3-5 |
| GOV-PROT-02 | Waqf protection | **istibdal**: Authority permission + **notify within 10 bd** of completion | `all` | event | `ISTIBDAL_10BD` | [BR-403](../brd/06-functional-requirements.md), [BR-306](../brd/06-functional-requirements.md); Art. 12(3); §3-5 |
| GOV-GOVN-01 | Governance | **Internal controls** over waqf funds | `all` | ongoing | — | [BR-611](../brd/06-functional-requirements.md); Art. 14; §3-6 |
| GOV-GOVN-02 | Governance | Internal **policies/procedures** (collection/disbursement/investment) | `large_medium` | annual review | — | [BR-606](../brd/06-functional-requirements.md); Art. 14; §3-6 |
| GOV-GOVN-03 | Governance | **AML/CTF & waqf training** for staff | `all` | annual | — | [BR-1104](../brd/06-functional-requirements.md); Art. 14(4); §3-6 |
| GOV-COI-01 | Governance | **Conflict-of-interest** disclosure; no self-dealing (≤ 2nd degree) | `all` | ongoing | — | [BR-610](../brd/06-functional-requirements.md); Art. 18; §3-6 |
| GOV-LEG-01 | Legal | Draft/review/**renew** contracts; legal advisory & memos | `all` | ongoing | `CONTRACT_RENEWAL` | [BR-612](../brd/06-functional-requirements.md); §3-7 |
| GOV-JUD-01 | Judicial | Represent the waqf; track cases, **hearings**, execution/collection | `all` | ongoing | `HEARING` | [BR-612](../brd/06-functional-requirements.md); §3-8 |
| GOV-RGL-01 | Regulatory | **Renew licences/permits** before expiry | `all` | event | `LICENSE_RENEWAL` | [BR-608](../brd/06-functional-requirements.md); §3-9 |
| GOV-RGL-02 | Regulatory | Track government-platform transactions & **filing status** | `all` | ongoing | — | [BR-603](../brd/06-functional-requirements.md); §3-9 |
| GOV-RGL-03 | Regulatory | **Retain records ≥ 10 years**; rapid retrieval | `all` | ongoing | `RETENTION_10Y` | [BR-607](../brd/06-functional-requirements.md); Art. 20; §3-9 |
| GOV-INV-01 | Investment | Sharia-compliant investment within risk limits; develop asset | `all` | event | — | [BR-510](../brd/06-functional-requirements.md); Art. 16; §3-10 |

> Government platforms (Awqaf Digital, Baladi, Istihkam, Muqeem, Qiwa, Ejar) are **manual status fields, not live integrations** — `GOV-RGL-02` tracks them as tasks with attached evidence; see [12 · Government filings](09-compliance-deadline-engine-spec.md).

> ⚠ **NOTE ON THIS TABLE'S CELLS.** The `GOV-AML-02` row above is left EXACTLY as written, and the
> supersession is recorded here instead — because `packages/domain`'s obligation catalogue transcribes
> these cells verbatim and a fidelity test compares them character by character. Editing the cell to
> carry a marker turned that test red on the first attempt: the spec's table is the SOURCE, and a
> source annotated for the reader's benefit stops being a source. (Measured, not theorised.)
>
> ⚠ **SUPERSEDED ON `GOV-AML-02` — product owner ruling S8-Q1, 2026-08-23 (verbatim selection:
> "Compartment the row").** This table places `GOV-AML-02` on the GENERAL register at gate `all`, and
> Engine C says its deadline is "surfaced on the dashboard". **That is now the drifted side.** The
> obligation row and its task instances are visible **only inside the AML compartment**; the general
> register shows nothing AML-attributable.
>
> The reason, measured rather than argued: a `GOV-AML-02` task moving `NOT_STARTED → COMPLETED` is an
> AML-attributable state change, and `compliance:task:read` sits in **eleven of the thirteen role
> presets** — while `aml_officer` holds no compliance permission at all. So the one seat entitled to
> know was the one seat that could not see the task, and everyone else watched it complete. *"The AML
> report task was completed on 12 Rajab"* is a tipping-off disclosure written by the compliance board
> rather than by a notification, and no status-code test would catch it because nothing malfunctions.
>
> Implemented in migration 32 as a `confidentiality Confidentiality` column on
> `compliance_obligation` and `compliance_task` — **not** as a special case on the obligation `code`,
> which would hardcode a catalogue value into a security control and silently un-compartment the duty
> the first time it is republished under a new library version (which S8-Q5's versioning makes
> routine). ⚠ Engine C's own no-tipping-off rules are unchanged; this closes the register-side leak
> they did not reach. *(Fiqh/legal caveat: Saudi AML no-tipping-off law — the owner is a practising
> Nazir, not counsel.)*

> ⊕ **BR-609 (Nazir-handover) IS DELIBERATELY ABSENT from this library — product owner ruling,
> 2026-08-23 (memo S8 addendum second batch, verbatim selection: "Traceability note only
> (Recommended)").** The duty exists — Nazarah reg. Art. 27 handover on removal/termination, and the
> Art. 7(3,4) originals-handover the BRD traces at
> [07-compliance-traceability](../brd/07-compliance-traceability.md) — but the BRD roadmap
> ([11-roadmap-phasing](../brd/11-roadmap-phasing.md)) schedules BR-609's handover packs and
> notifications for **Phase 3**, and a Phase-1 register row with no workflow behind it would be a
> duty the product displays and cannot discharge. This note is what makes the absence read as a
> DECISION rather than an omission: the catalogue-completeness question S8-Q9 asks about the ten
> untracked framework duties does not extend to BR-609 — its absence is ruled. No register row ships
> in E7; the Phase-3 epic owes the row together with the workflow.

### Classification → obligation gating matrix

Classification (by endowed-asset value: **Large ≥ SAR 200M · Medium 50–200M · Small < 50M · Direct-utilization**, per [glossary §A](../../domain/glossary.md) and Nazarah reg. Art. 1) **gates which obligations instantiate**. The engine resolves each template's `classificationGate` against the endowment's current classification.

| Obligation cluster | Large | Medium | Small | Direct-utilization |
|---|:--:|:--:|:--:|:--:|
| **SOCPA-audited statements + budget** | ✓ | ✓ | — | — |
| **Internal bylaws / policies** | ✓ | ✓ | — | — |
| **Periodic financial statements to beneficiaries** | ✓ | ✓ | — | — |
| **Simplified annual financial statement** | — | — | ✓ | ✓ *(if income/expense exists)* |
| Registration (30 bd) & updates (15 bd) | ✓ | ✓ | ✓ | ✓ |
| UBO/KYC + periodic re-verification | ✓ | ✓ | ✓ | ✓ |
| AML/CTF reporting & no-tipping-off | ✓ | ✓ | ✓ | ✓ |
| Dedicated account / no commingling | ✓ | ✓ | ✓ | ✓ *(where funds exist)* |
| **Monetary distribution + 3-month timing** | ✓ | ✓ | ✓ | — *(direct use of the asset; no monetary distribution)* |
| Maintenance reserve (ṣiyāna) first | ✓ | ✓ | ✓ | ✓ *(asset upkeep)* |
| Record retention ≥ 10 years | ✓ | ✓ | ✓ | ✓ |

Gate → class-set resolution:

- `all` → every class.
- `large_medium` → {Large, Medium}. **This is the audit / budget / bylaws / periodic-statement gate** — the four Large/Medium-only duties the roadmap and goals docs call out.
- `small_direct` → {Small, Direct-utilization} — the simplified annual statement (Direct-utilization only when it actually records income/expense).
- `exclude_direct` → {Large, Medium, Small} — monetary-distribution obligations; a **Direct-utilization** waqf has none.
- `has_income` → a **runtime predicate**, not a static class set: applies to any class where the waqf has ≥ 1 revenue/expense record in the period. Lets a Direct-utilization waqf that happens to collect incidental income still get its accounting/annual-statement duties.

Thresholds and the mapping are **configurable** ([NFR-13](../brd/08-nonfunctional-requirements.md)) — the SAR bands and gate table are data, not code. The first client's per-endowment classifications are an [open question (Q2)](16-open-questions.md); the engine refuses to instantiate a full register until classification is set (see A2 below).

### Instantiation & the ComplianceTask lifecycle

```ts
type TaskStatus =
  | "not_started" | "in_progress" | "blocked"
  | "at_risk" | "overdue"        // set by Engine B from the bound deadline
  | "completed" | "not_applicable"
  | "retired";                   // superseded by reclassification — never deleted

interface ComplianceTask {
  id: string;
  waqfId: string;
  templateCode: string; templateVersion: string;   // frozen snapshot of the source template
  section: Section; workstream: string;             // denormalised for board grouping
  status: TaskStatus;
  ownerUserId: string | null;
  classificationAtInstantiation: string;
  instantiatedReason: "initial_setup" | "reclassification" | "event_trigger";
  deadlineId: string | null;                        // Engine B, when the template binds a rule
  startDate: string | null; closeDate: string | null;
  retiredReason: string | null; retiredAt: string | null;
  evidenceDocumentIds: string[];
  notes: string | null;
}
```

**Instantiation.** On endowment setup (Gate 01 of the [operating model](../../company/operating-model.md)), once classification is set, the engine materialises one `ComplianceTask` per applicable template (gate resolves true), snapshotting the template code + version, and — where the template binds a deadline rule — asks Engine B to compute the `Deadline`. Event-recurrence templates (`GOV-REG-02`, `GOV-PROT-02`, `GOV-GEN-03`, `GOV-AML-02`, `GOV-INV-01` — joined at `2026-08-26.1` by `FIN-DIST-03` and `GOV-GEN-04`, the S8-Q9 additions) are **not** pre-materialised; they are raised on their trigger (§B). Column shape mirrors the [fixture](../../../data/fixtures/sample-waqf.json) `complianceTasks[]` (`section`, `workstream`, `task`, `status`, `classificationGate`, dates) — do not copy its rows.

**No deletion.** `ComplianceTask` rows are **append-only under retention** ([NFR-07](../brd/08-nonfunctional-requirements.md)): a task that stops applying is set to `retired` (or `not_applicable`), never removed. Every status transition, owner change, and evidence attach writes an immutable audit entry (who/what/when/before/after) per [NFR-04](../brd/08-nonfunctional-requirements.md) — see [08 · Audit & controls](12-security-audit-retention-spec.md).

### Reclassification: add / retire with history

When an endowment's classification changes (e.g. after a Taqeem revaluation or an expropriation shrinks the asset base), the engine **diffs the applicable template set** and applies [BR-104](../brd/06-functional-requirements.md)'s "with history":

1. **Newly in scope** (gate now true, no live task) → instantiate a new `ComplianceTask` with `instantiatedReason = "reclassification"`; bind its deadline if any.
2. **Newly out of scope** (gate now false, task live) → transition to `retired` with `retiredReason = "reclassified <old>→<new>"`; **keep the row and its history**. Any bound future deadline is set to `waived` (not deleted), with the reason logged.
3. **Still in scope** → untouched; completed/at-risk state preserved.
4. The classification change and the full add/retire delta are written to the audit trail as a single correlated event.

Worked shape (fixture classifications): a **Small** endowment (`waqf-002`) revalued to **Large** gains `FIN-MGT-02` (budget), `FIN-MGT-03` (SOCPA audit), `GOV-SHART-02` (bylaws), `GOV-SHART-03` (bylaws review, since `2026-08-26.1`), `GOV-GEN-01` (periodic beneficiary statements) as new tasks, and **retires** `FIN-MGT-04` (simplified annual statement). Reversing the move retires the four and re-instantiates `FIN-MGT-04` — the earlier retired rows remain queryable as history.

---

## Engine B — Deadline engine

### Statutory deadline rules

Every deadline is an instance of a **rule**. Windows and pre-alert leads are **configurable** ([NFR-13](../brd/08-nonfunctional-requirements.md)); the defaults below are the statutory values.

| Rule code | Obligation | Window | Basis | Clock starts on | Roll | Traces |
|---|---|---|---|---|---|---|
| `REGISTER_30BD` | Register waqf + assets | **30** | business days | waqf documentation / regulation-effective date — ⊕ **S11-1: RECORDED OPERATOR INPUT** on `Waqf.registrationAnchorDate` with its declared kind `registrationAnchorKind` (WAQF_DOCUMENTATION_DATE \| REGULATION_EFFECTIVE_DATE; owner rulings 9f3d8fd, editable per f57e13d). Blank ⇒ the engine refuses BY NAME (`ANCHOR_SOURCE_VALUE_ABSENT`), never "no deadline". ⚠ NOT `registrationDate` (the registration itself). Which date governs: unverified. | following | [BR-602](../brd/06-functional-requirements.md), [BR-1001](../brd/06-functional-requirements.md); Art. 8(1) ⊕ **S11-2 (owner ruling f797fea): DISCHARGED by `deadline.dischargeRegistrationDuty` — the head row gets `satisfiedAt` + `dischargeKind: MET`, the anchor is UNTOUCHED (editing corrects an input error; discharge records a fact), a correction after discharge carries the met fact forward, clearing a discharged chain is refused. Whether a pre-regulation endowment was ever subject to the duty at all (a NOT-APPLICABLE state) is an OPEN counsel question; `dischargeKind` is the seam. |
| `UPDATE_15BD` | Update Authority data | **15** | business days | certificate-expiry date **or** material-change effective date | following | [BR-1002](../brd/06-functional-requirements.md), [BR-107](../brd/06-functional-requirements.md); Art. 8(2) |
| `ISTIBDAL_10BD` | Notify Authority of substitution | **10** | business days | istibdal **completion** date — ⊕ **S11-1: RECORDED OPERATOR INPUT** on `Expropriation.istibdalCompletedDate` (9f3d8fd), never derived from the announcement or the discharge. ⚠ Lives on `Expropriation` because it is the schema's only istibdal home; whether VOLUNTARY istibdal is in Phase-1 scope is OPEN. | following | [BR-403](../brd/06-functional-requirements.md); Art. 12(3) |
| `DISTRIBUTE_3M_FYE` | Distribute yield (no Shart schedule) | **3** | calendar months | fiscal-year-end | following | [BR-505](../brd/06-functional-requirements.md), [BR-1001](../brd/06-functional-requirements.md); Art. 13 |
| `KYC_REFRESH` | Re-verify UBO/beneficiary data | annual | calendar (pre-alert) | last-verification date | preceding | [BR-205](../brd/06-functional-requirements.md), [BR-1005](../brd/06-functional-requirements.md); BO Std Art. 6 |
| `LICENSE_RENEWAL` | Renew licence / permit | pre-expiry lead | calendar (pre-alert) | licence-expiry date — ⚠ **STILL ROUTED after S11-1** (`ANCHOR_HOME_IS_WRONG_SCOPE`): the endowment's own licences need a MODEL; the owner's enumeration is in `docs/domain/licences-and-permits.md`, the model is owed. | preceding | [BR-608](../brd/06-functional-requirements.md), [BR-1005](../brd/06-functional-requirements.md); §3-9 |
| `CONTRACT_RENEWAL` | Contract / agreement expiry | pre-expiry lead | calendar (pre-alert) | contract-end date | preceding | [BR-612](../brd/06-functional-requirements.md); §3-7 |
| `HEARING` | Court/committee hearing & procedural date | as dated | calendar | scheduled date | — | [BR-612](../brd/06-functional-requirements.md); §3-8 |
| `RETENTION_10Y` | Minimum record-retention floor | **10** | years | record creation | n/a | [BR-607](../brd/06-functional-requirements.md); Art. 20 |

`following` = if the terminal date falls on a non-business day, roll **forward** to the next business day. `preceding` = the actionable/alert date rolls **backward** so the obligation is met **before** the statutory expiry (you renew before, not after). `RETENTION_10Y` is a floor governing deletion, not a due date — it is enforced by the retention policy, not the reminder loop.

```ts
interface Deadline {
  id: string;
  waqfId: string;
  complianceTaskId: string | null;
  ruleCode: string;
  triggerEvent: string;                 // human-readable cause
  triggerDateGregorian: string;         // ISO
  triggerDateHijri: string;             // frozen Umm-al-Qura, "YYYY-MM-DD"
  dueDateGregorian: string;             // computed
  dueDateHijri: string;                 // FROZEN at write
  computationBasis: "business_days" | "calendar_months" | "calendar_years";
  window: number;
  rollConvention: "following" | "preceding" | "none";
  holidayCalendarId: string;
  preAlertOffsetsBd: number[];          // e.g. [30, 15, 7, 3, 1]
  status: "pending" | "due_soon" | "at_risk" | "overdue" | "met" | "waived";
  metDate: string | null; metEvidenceId: string | null;
  frozen: boolean;                      // true once written
  recomputedFromId: string | null;      // set only on an explicit, audited recompute
}
```

### KSA business-day model

A **KSA business-day calculator** in `packages/domain`, parameterised by a `HolidayCalendar`:

- **Workweek Sun–Thu; weekend Fri/Sat** (default; the weekend set is configurable per [NFR-13](../brd/08-nonfunctional-requirements.md) to survive any future change).
- `isBusinessDay(d, cal) = weekday(d) ∉ weekendSet ∧ d ∉ cal.holidays`.
- `addBusinessDays(start, n, cal)`: step day-by-day forward from `start` **exclusive**, decrementing `n` on each business day; return the day when `n` hits 0. By construction the result is always a business day (no terminal roll needed for business-day windows).
- **Calendar-month / -year** windows (`DISTRIBUTE_3M_FYE`, `RETENTION_10Y`): add the period on the Gregorian civil calendar, then roll per `rollConvention`.

```ts
interface HolidayCalendar { id: string; name: string; jurisdiction: "KSA"; weekendSet: number[]; isDefault: boolean; active: boolean; }
interface Holiday {
  id: string; calendarId: string;
  gregorianDate: string;                // resolved date for the year
  hijriDate: string | null;             // source date for moving holidays
  nameAr: string; nameEn: string;
  kind: "fixed_gregorian" | "hijri_moving" | "one_off";  // one_off = royal-decree day
  source: string;                       // e.g. "Umm-al-Qura / Council of Ministers decree"
}
```

The crucial subtlety: **Hijri-moving holidays** (the two Eids, and any decreed days) are entered into the calendar as `hijri_moving` with their **Gregorian-resolved** date for each year. Business-day counting runs on the Gregorian civil calendar, but because those holidays sit in the calendar, the count correctly skips them (see the worked example). Seeding the moving holidays per year is an [open question](16-open-questions.md) (authoritative feed vs manual entry).

### Dual Hijri/Gregorian, frozen at write

[BR-1003](../brd/06-functional-requirements.md) / [NFR-02](../brd/08-nonfunctional-requirements.md): every deadline carries **both** representations. On write, the engine:

1. computes `dueDateGregorian` via the calculator;
2. converts to `dueDateHijri` via **`@umalqura/core`** (Umm-al-Qura);
3. persists **both** (and both trigger dates) as **immutable strings**, and sets `frozen = true`.

**Freeze rationale — deadlines never silently move.** The Umm-al-Qura civil tabulation is periodically adjusted, and holiday calendars get corrected after the fact. A deadline that has been computed, displayed, and possibly **filed** must not shift under the user's feet if a library or calendar update changes the mapping later. So the stored due date is authoritative once written. Recomputation happens **only** through an explicit, audited administrative action (a corrected trigger date, or a holiday-calendar correction an operator confirms applies) — which writes a **new** `Deadline` revision, links `recomputedFromId`, and logs before/after. No background job ever rewrites `dueDateGregorian`/`dueDateHijri` ([NFR-04](../brd/08-nonfunctional-requirements.md), [NFR-10](../brd/08-nonfunctional-requirements.md)).

### Triggers → auto-raise the 15-bd update

Two events auto-raise `GOV-REG-02` (`UPDATE_15BD`), satisfying [BR-1002](../brd/06-functional-requirements.md)/[BR-107](../brd/06-functional-requirements.md):

- **Certificate expiry.** A daily worker sweep checks each `Waqf.registrationCertificateValidUntil`. On (or a configurable lead before) expiry, if no open update task exists, it raises `GOV-REG-02` clocked from the **expiry date**.
- **Material change.** Other modules emit a domain event `MaterialChange { waqfId, kind: "asset" | "beneficiary" | "nazarah", effectiveDate, sourceRef }` — an asset added/disposed/substituted, a beneficiary added/removed/status-changed, or a trusteeship/Nazarah change. On receipt the engine raises `GOV-REG-02` clocked from `effectiveDate`.

**Coalescing.** There is **one open update obligation per waqf** at a time. Concurrent material changes append to its change-set rather than spawning parallel clocks; the due date is driven by the **earliest un-filed** change's effective date (the tightest deadline governs). Filing the update closes the task and clears the change-set; a subsequent change opens a fresh clock.

### Escalation & reminder cadence

A `Deadline` moves `pending → due_soon` (first pre-alert offset reached) `→ at_risk` (within the final at-risk threshold) `→ overdue` (past due, unmet) `→ met | waived`. State is **derived**, not stored as truth — the frozen due date is the source; a daily job computes state and mirrors it onto the bound `ComplianceTask.status`.

- **Daily evaluator** (`apps/worker`, pg-boss, Railway Cron, ~06:00 Asia/Riyadh): recomputes state for all open deadlines, fires reminders at each configured pre-alert offset, and escalates per the operating-model path — **owner (Case Manager) → Nazir → Leadership** ([BR-1004](../brd/06-functional-requirements.md)). Each escalation writes an `EscalationEvent` + audit entry.
- **Zero-tolerance deadlines** (registration/updates `GOV-REG-01/02`, AML `GOV-AML-02`) escalate on a faster ladder and **cannot be dismissed, only resolved** — mirroring the governance dashboard's non-dismissible KPI breach.
- **Reminders also cover** KYC refresh (`KYC_REFRESH`), certificate/licence/permit expiries (`LICENSE_RENEWAL`), contract renewals, and reporting-cadence dates ([BR-1005](../brd/06-functional-requirements.md)).
- The job **never mutates the frozen due date** — it computes state and emits notifications only. Transport is [14 · Jobs & notifications](09-compliance-deadline-engine-spec.md).

### Worked example — a deadline crossing a Fri/Sat weekend + Hijri holiday

`ISTIBDAL_10BD`: an istibdal completes; the Authority must be notified within **10 business days**. Suppose completion falls on a **Sunday**, and a 2-day **Hijri-moving holiday** falls mid-window. Counting excludes the trigger day, skips every Fri/Sat, and skips the holiday days. *(Illustrative dates + weekday labels; the canonical test vector is generated from the live `HolidayCalendar`, and the Hijri column comes from `@umalqura/core` at write time.)*

| Step | Weekday | Illustrative date | Counts? | Why |
|---|---|---|:--:|---|
| Trigger | Sun | 2026-05-10 | — | istibdal completion (excluded) |
| 1 | Mon | 2026-05-11 | ✓ | business day |
| 2 | Tue | 2026-05-12 | ✓ | |
| 3 | Wed | 2026-05-13 | ✓ | |
| 4 | Thu | 2026-05-14 | ✓ | |
| — | Fri | 2026-05-15 | ✗ | weekend |
| — | Sat | 2026-05-16 | ✗ | weekend |
| 5 | Sun | 2026-05-17 | ✓ | |
| 6 | Mon | 2026-05-18 | ✓ | |
| — | Tue | 2026-05-19 | ✗ | **Hijri-moving holiday** |
| — | Wed | 2026-05-20 | ✗ | **Hijri-moving holiday** |
| 7 | Thu | 2026-05-21 | ✓ | |
| — | Fri/Sat | 2026-05-22/23 | ✗ | weekend |
| 8 | Sun | 2026-05-24 | ✓ | |
| 9 | Mon | 2026-05-25 | ✓ | |
| **10** | **Tue** | **2026-05-26** | **✓ DUE** | 10th business day |

A naive "trigger + 10 calendar days" would give **2026-05-20** — which is itself a holiday, and would have the Nazir file **six days late**. The engine's due date is **2026-05-26**, and both it and its frozen Hijri equivalent are stored and displayed. The same arithmetic drives `REGISTER_30BD` and `UPDATE_15BD`.

---

## Engine C — AML sub-engine

Implements [BR-604](../brd/06-functional-requirements.md) (Nazarah reg. Art. 10(10); [BO Standards](../../domain/regulations/beneficial-ownership-standards.md)) and [NFR-05](../brd/08-nonfunctional-requirements.md). It records **that a suspicious-activity report was filed**, tracks the detailed report and FIU follow-up, and enforces **no tipping-off** as a hard, structural control — not a convention.

### Data shapes

```ts
type Visibility = "AML_RESTRICTED";     // immutable on every row this engine writes

interface AmlReport {
  id: string;
  waqfId: string;
  filedByUserId: string;
  filedAtGregorian: string; filedAtHijri: string;
  fiuReference: string | null;          // FIU acknowledgement, if issued
  suspicionSummary: string;             // the detailed report: operation + related parties
  relatedPartyRefs: string[];           // beneficiary/UBO/asset ids implicated (subjects)
  status: "filed" | "fiu_followup_requested" | "responded" | "closed";
  visibility: Visibility;               // always AML_RESTRICTED
}

interface AmlFollowUp {
  id: string; amlReportId: string;
  direction: "fiu_request" | "our_response";
  occurredAt: string;
  summary: string; documentIds: string[];
  visibility: Visibility;
}
```

`GOV-AML-02` (Engine A) is the raised obligation; filing an `AmlReport` satisfies it. The report has **no statutory countdown** — the duty is "immediate" — so it is modelled as an event obligation whose SLA is same-day, surfaced on the dashboard, not a business-day clock.

### No-tipping-off — the enforced rules

The subject (a beneficiary/UBO) must **never** learn a report exists. These are enforced by the platform, not left to discretion:

1. **No outbound signal.** No notification, email, in-app alert, activity-feed item, or export ever references an AML report to the subject or to any non-AML role. The AML compartment emits nothing into the general notification/escalation pipeline.
2. **Subject-observable state is unchanged.** The subject's portal/beneficiary view must not change in any AML-attributable way — no "under review" badge, no AML-labelled account freeze. If a disbursement must be withheld, it is expressed through a **pre-existing, neutral gate reason** owned by the distribution engine (e.g. KYC/category gate), **never** "AML". The AML compartment does not itself hold distributions.
3. **The audit trail records without leaking.** Every AML action is audit-logged (who/what/when) for [NFR-04](../brd/08-nonfunctional-requirements.md) — but the audit entry itself carries `AML_RESTRICTED` and is visible only to AML-cleared auditors. The trail proves the action occurred without exposing it to unauthorized roles.
4. **Existence is invisible to the unauthorized.** Only a holder of the endowment's explicit **AML-officer capability** can read `AmlReport`/`AmlFollowUp`. To every other role the compartment does not exist: reads return a **neutral not-found**, never "access denied to an AML record" (which would itself leak existence). Access control is specified in [07 · Identity, roles & access](10-roles-access-matrix-spec.md).
5. **Exports exclude it.** Evidence packs and regulator/auditor exports **omit** `AML_RESTRICTED` content unless the export is explicitly an AML/FIU export invoked by an AML-cleared user.
6. **Retention, no purge.** AML records inherit the ≥ 10-year retention floor and are non-purgeable within it ([NFR-07](../brd/08-nonfunctional-requirements.md)); confidentiality survives the engagement (Art. 22).

FIU follow-up (`fiu_request` → `our_response`) is tracked inside the same compartment, so the full "reported + fully responded" duty is evidenced without ever leaving `AML_RESTRICTED`.

---

## Engine boundaries, packages & jobs

| Concern | Package / app | Note |
|---|---|---|
| Gating predicates, business-day + Hijri arithmetic, escalation-state, no-tipping-off decisions | `packages/domain` | Pure, deterministic, imports nothing internal; tested against fixed calendars/fixtures. |
| Template library seed, `ComplianceTask`/`Deadline`/`AmlReport` persistence, `AML_RESTRICTED` class | `packages/database` (Prisma) | Canonical schema in [03 · Data model](07-data-model-spec.md); money never involved here. |
| Trigger sweeps, daily evaluator, reminders, escalation | `apps/worker` (pg-boss, Railway Cron) | Never mutates frozen due dates; emits state + notifications only. |
| Notification transport | [14 · Jobs & notifications](09-compliance-deadline-engine-spec.md) | Respects the AML compartment. |
| Dual-date display, RTL, SAR tabular-nums | [13 · i18n & localization](11-localization-spec.md) | Rendering only; stored values are frozen here. |
| Audit trail | [08 · Audit & controls](12-security-audit-retention-spec.md) | Every material action here writes an immutable entry. |

---

## Acceptance criteria (Given/When/Then)

### A · Compliance-task engine

- **A1 (happy).** *Given* a **Medium** endowment at setup, *When* the register is generated, *Then* every template with `gate ∈ {all, large_medium, exclude_direct, has_income✓}` instantiates as a `ComplianceTask` (incl. SOCPA audit, budget, bylaws, periodic statements), and `small_direct`-only templates do **not** appear.
- **A2 (empty).** *Given* an endowment with **no classification set**, *When* the register is opened, *Then* it is locked with a "set classification first" prompt and no tasks are materialised.
- **A3 (edge — retire with history).** *Given* a **Large** endowment reclassified to **Small**, *When* the change is saved, *Then* the audit/budget/bylaws/periodic-statement tasks transition to `retired` (reason recorded, rows kept), `FIN-MGT-04` is instantiated, and the whole delta is one correlated audit event ([BR-104](../brd/06-functional-requirements.md)).
- **A4 (edge — add on upgrade).** *Given* a **Small** endowment reclassified to **Large**, *When* saved, *Then* the four Large/Medium-only tasks are instantiated with `instantiatedReason = "reclassification"` and any previously-retired copies remain queryable as history.
- **A5 (error — no delete).** *Given* any `ComplianceTask`, *When* deletion is attempted, *Then* it is refused; only `retired`/`not_applicable` transitions are allowed, preserving retention ([NFR-07](../brd/08-nonfunctional-requirements.md)).
- **A6 (edge — direct-utilization).** *Given* a **Direct-utilization** endowment, *When* the register generates, *Then* `exclude_direct` distribution templates are omitted; `FIN-MGT-04` instantiates **only if** the waqf records income/expense (`has_income` predicate); asset-upkeep obligations (`GOV-PROT-01`) still apply.

### B · Deadline engine

- **B1 (happy).** *Given* a newly documented waqf, *When* `REGISTER_30BD` is created, *Then* the engine stores `dueDateGregorian`, a frozen `dueDateHijri`, both trigger dates, and pre-alert offsets, with `frozen = true`.
- **B2 (edge — weekend + Hijri holiday).** *Given* an `ISTIBDAL_10BD` clock starting on a Sunday with a mid-window Fri/Sat weekend **and** a 2-day Hijri-moving holiday, *When* the due date is computed, *Then* the trigger day is excluded, all weekend and holiday days are skipped, and the due date is the **10th business day** (worked example: 2026-05-26, not the naïve 2026-05-20) — always itself a business day.
- **B3 (trigger — material change).** *Given* an asset is added/disposed with an effective date, *When* the `MaterialChange` event fires, *Then* `GOV-REG-02` (`UPDATE_15BD`) is raised clocked from that effective date ([BR-1002](../brd/06-functional-requirements.md)).
- **B4 (edge — coalesce + expiry).** *Given* an open update obligation, *When* further material changes arrive, *Then* they append to its change-set (no parallel clocks) and the due date tracks the **earliest un-filed** change; separately, certificate expiry raises `UPDATE_15BD` from the expiry date if none is open ([BR-107](../brd/06-functional-requirements.md)).
- **B5 (edge — schedule overrides default).** *Given* a waqf whose Shart sets **no** distribution schedule, *When* the fiscal year ends, *Then* `DISTRIBUTE_3M_FYE` = FYE + 3 calendar months rolled to the next business day; *and* *Given* the Shart **does** set a schedule, *Then* that schedule governs and the 3-month default is not applied.
- **B6 (escalation).** *Given* a `GOV-REG-02` deadline passes unmet, *When* the daily evaluator runs, *Then* it flips to `overdue`, mirrors onto the task, escalates Case Manager → Nazir → Leadership, and **cannot be dismissed, only resolved** ([BR-1004](../brd/06-functional-requirements.md)).
- **B7 (no silent recompute).** *Given* a frozen deadline, *When* the holiday calendar or Umm-al-Qura mapping is later corrected, *Then* the stored due dates do **not** change automatically; a recompute happens only via an explicit, audited action that writes a new revision with `recomputedFromId` and before/after logged ([NFR-04](../brd/08-nonfunctional-requirements.md)/[NFR-10](../brd/08-nonfunctional-requirements.md)).
- **B8 (empty).** *Given* a freshly created endowment, *When* the deadline calendar is opened, *Then* only the `REGISTER_30BD` clock is present — no synthetic or duplicate deadlines.
- **B9 (reminders).** *Given* configured pre-alert offsets, *When* each offset is reached, *Then* a reminder fires; the same loop reminds on `KYC_REFRESH`, `LICENSE_RENEWAL`, `CONTRACT_RENEWAL`, and reporting-cadence dates ([BR-1005](../brd/06-functional-requirements.md)).

### C · AML sub-engine

- **C1 (happy).** *Given* an AML-cleared officer, *When* they record that a SAR was filed with the FIU, *Then* an `AmlReport` (`AML_RESTRICTED`, status `filed`) is stored with the detailed summary and related-party refs, and an `AML_RESTRICTED` audit entry is written ([BR-604](../brd/06-functional-requirements.md)).
- **C2 (error — no tipping-off).** *Given* an `AmlReport` naming a beneficiary as a related party, *When* that beneficiary views their portal, receives notifications, or appears in any standard export, *Then* nothing references or implies the report, and no AML-attributable state change is visible ([NFR-05](../brd/08-nonfunctional-requirements.md)).
- **C3 (edge — FIU follow-up).** *Given* a filed report, *When* the FIU requests more and the team responds, *Then* both `AmlFollowUp` rows are tracked in the compartment and status moves `fiu_followup_requested → responded`.
- **C4 (empty).** *Given* no AML reports for an endowment, *When* a non-AML role uses the app, *Then* the compartment is entirely invisible — no empty AML section, no counter, no menu item.
- **C5 (access — neutral not-found).** *Given* a user **without** the AML capability, *When* they attempt to reach an AML record by any route, *Then* the response is a neutral not-found — never "access denied to an AML record" (which would leak existence).
- **C6 (retention).** *Given* any AML record, *When* deletion is attempted within the ≥ 10-year floor, *Then* it is refused; confidentiality and retention survive engagement end ([NFR-07](../brd/08-nonfunctional-requirements.md)).

---

## Open questions

Routed to [16 · Open questions](16-open-questions.md); the engine ships with the stated defaults meanwhile.

- **CDE-Q1 — Hijri-moving-holiday source.** Is there an authoritative machine feed for KSA public holidays (Eids, decreed days), or are they entered manually per year into the `HolidayCalendar`? Default: manual entry with a yearly review task. Relates to [BRD Q8](16-open-questions.md).
- **CDE-Q2 — 15-bd clock start for material change.** Does the statutory clock start on the change's **effective** date or its **discovery/recording** date? Default: effective date; **confirm with Saudi counsel** — it is a point of law, not a build choice.
- **CDE-Q3 — Roll convention.** `following` for statutory business-day/month deadlines is assumed; confirm the Authority accepts a filing on the rolled next-business-day when the raw date is a weekend/holiday.
- **CDE-Q4 — Pre-alert lead defaults.** The `[30, 15, 7, 3, 1]`-style offsets and the at-risk threshold per rule need QMULATE sign-off (configurable regardless).
- **CDE-Q5 — First-client classifications.** [BRD Q2](16-open-questions.md) — the four endowments' classifications drive which templates instantiate; blocks a complete register until set.

---

## Requirements covered

BR-104, BR-107, BR-601, BR-602, BR-603, BR-604, BR-605, BR-606, BR-607, BR-608, BR-611, BR-612, BR-1001, BR-1002, BR-1003, BR-1004, BR-1005 · NFR-02, NFR-04, NFR-05, NFR-07, NFR-10, NFR-13
