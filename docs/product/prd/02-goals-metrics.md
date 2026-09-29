# Goals & Success Metrics

How QMULATE's platform proves it works: measurable goals, and the leading indicators that predict success versus the lagging outcomes that confirm it.

Status: Draft v0.1 · Privileged & Confidential

---

## Purpose of this section

This section fixes the **targets the build is measured against**. It turns the BRD's indicative goals (see [03 · Vision & Scope](../brd/03-vision-scope.md)) and the operating model's five zero-tolerance KPIs into concrete, instrumentable metrics with numeric thresholds. Every metric here is something the platform must be able to **compute and surface from its own data** — on the [BR-901](../brd/06-functional-requirements.md) reporting dashboard, in [BR-912/9xx](../brd/06-functional-requirements.md) evidence packs, and in the [BR-1001](../brd/06-functional-requirements.md) deadline engine — not something measured out-of-band. If a metric here has no home in the product's telemetry, that is a build gap.

Two vocabularies run through this section:

- **Leading indicators** — process-health measures the team can move *this week*. They predict whether a zero-tolerance breach is coming. Targets are percentages and lead-times.
- **Lagging outcomes** — the results that matter to the Nazir, the Family Board, and the Authority. Most are **counts that must stay at zero**. They are confirmed at exam time, distribution time, and year-end.

The design intent: **hold every leading indicator at target and the lagging outcomes take care of themselves.**

---

## Goals (G1–G6)

Six goals. G1–G4 each own one of the five zero-tolerance KPIs from [operating-model.md](../../company/operating-model.md) (KPI-2 *no commingling* and KPI-5 *no unlicensed activity* are consolidated under G2 as the two "clean-money / clean-mandate" guarantees). G5 is the go-live gate. G6 is the scale promise.

| # | Goal | Zero-tolerance KPI(s) | Measurable target | Primary requirements |
|---|---|---|---|---|
| **G1** | **Never miss a statutory deadline.** Every registration, update, substitution, and distribution obligation is computed, reminded, and closed on time. | KPI-1 (on-time Authority registration & updates) | **100%** of statutory obligations met on or before their KSA-business-day deadline; **0** breaches. Every deadline carries **≥ 30 / 15 / 10 bd + configurable pre-alert** lead-time. | [BR-1001](../brd/06-functional-requirements.md), [BR-1002](../brd/06-functional-requirements.md), [BR-1003](../brd/06-functional-requirements.md), [BR-602](../brd/06-functional-requirements.md), [NFR-02](../brd/08-nonfunctional-requirements.md) |
| **G2** | **Keep money and mandate clean.** No commingling, and no unlicensed regulated real-estate activity performed by the platform or an unverified party. | KPI-2 (no commingling), KPI-5 (no unlicensed activity) | **0** transactions off a dedicated waqf account; **100%** of transactions reconcile to a dedicated-account bank feed; **0** disbursements by an unverified/unlicensed disbursing entity. | [BR-505](../brd/06-functional-requirements.md), [BR-506](../brd/06-functional-requirements.md), [BR-503](../brd/06-functional-requirements.md), [NFR-14](../brd/08-nonfunctional-requirements.md), [NFR-08](../brd/08-nonfunctional-requirements.md) |
| **G3** | **Keep beneficiary data audit-ready.** Every active beneficiary has a current KYC/UBO record; every AML suspicion is reported with no tipping-off. | KPI-3 (current beneficiary KYC), KPI-4 (no missed AML reports) | **100%** of active beneficiaries with in-window KYC and a complete UBO minimum dataset; **0** disbursements to a stale/unverified beneficiary; **0** missed or late AML reports; **0** tipping-off leaks. | [BR-201](../brd/06-functional-requirements.md), [BR-202](../brd/06-functional-requirements.md), [BR-205](../brd/06-functional-requirements.md), [BR-206](../brd/06-functional-requirements.md), [BR-604](../brd/06-functional-requirements.md), [BR-605](../brd/06-functional-requirements.md), [NFR-05](../brd/08-nonfunctional-requirements.md) |
| **G4** | **Make the record institutional.** Every distribution, filing, and reserved-matter decision is reconstructable from an immutable audit trail and retained ≥ 10 years. | (supports all five) | **100%** of material actions, approvals, and accesses in the append-only audit trail; **100%** of records retained ≥ 10 years with retrieval; distribution runs reproduce to the SAR-level line item. | [BR-1102](../brd/06-functional-requirements.md), [BR-701](../brd/06-functional-requirements.md), [BR-702](../brd/06-functional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md), [NFR-07](../brd/08-nonfunctional-requirements.md), [NFR-12](../brd/08-nonfunctional-requirements.md) |
| **G5** | **Reach a defensible go-live.** Phase 1 (compliance & operations core, incl. the distribution engine) is live for the first engagement, migrated and gate-cleared. | (go-live gate for all) | All **P0** requirements pass acceptance; the first family's **4 endowments / 3 waqifs** migrated with **100%** completeness; Gates 01–02 cleared per the operating model. | [BR-1106](../brd/06-functional-requirements.md), [BR-601](../brd/06-functional-requirements.md), [BR-1102](../brd/06-functional-requirements.md), [NFR-01](../brd/08-nonfunctional-requirements.md), [NFR-06](../brd/08-nonfunctional-requirements.md) |
| **G6** | **Onboard the next client in days, not months.** A new endowment is stood up from templated compliance tasks and reusable classification profiles. | (scale enabler) | A second client's first endowment reaches "compliance register live + beneficiaries loaded + first deadline computed" in **≤ 5 business days** of data handover. | [BR-601](../brd/06-functional-requirements.md), [BR-109](../brd/06-functional-requirements.md), [BR-1106](../brd/06-functional-requirements.md), [NFR-13](../brd/08-nonfunctional-requirements.md) |

> [!note] Classification gates the denominator, not the target
> Several obligations only apply above a classification threshold (SOCPA-audited statements, budgets, bylaws, periodic beneficiary statements are **large/medium only**; small = simplified annual statement). Metrics below are computed **against the obligations that actually apply** to each waqf's classification — a small waqf is never scored against a large-waqf obligation. Direct-utilization waqfs are excluded from all distribution metrics (they have no monetary distribution).

---

## Leading indicators (process health — predict success)

Measured continuously, surfaced on the [BR-901](../brd/06-functional-requirements.md) dashboard, and reviewed at the monthly QMULATE operations cadence. **Amber/red thresholds are where the team intervenes before a zero-tolerance breach becomes possible.**

| # | Leading indicator | Definition | Target (green) | Amber | Red | Feeds goal |
|---|---|---|---|---|---|---|
| **L1** | **Compliance-register completeness** | Applicable obligations (post-classification filter) that exist as tracked tasks with owner + due date, ÷ obligations the regulation requires for that classification. | **100%** | 95–99% | < 95% | G1, G5 |
| **L2** | **UBO dataset completeness** | Active beneficiaries whose UBO minimum dataset ([BR-202](../brd/06-functional-requirements.md)) is fully captured (all mandatory fields non-empty), ÷ active beneficiaries. | **100%** | 98–99% | < 98% | G3 |
| **L3** | **KYC freshness %** | Active beneficiaries whose KYC re-verification is **within the annual refresh window**, ÷ active beneficiaries. Stale = past window. | **100%** | 95–99% | < 95% | G3 |
| **L4** | **Deadline lead-time** | Median calendar lead-time between an obligation being **actionable** and its statutory due date, and the % of obligations whose first pre-alert fired at the configured lead (≥ 30/15/10 bd). | **100%** of alerts on time; median lead ≥ target window | 1 late alert | > 1 late alert | G1 |
| **L5** | **Maker-checker coverage** | Money-movement and filing actions executed with a distinct initiator and approver (initiator ≠ approver; Nazir signs), ÷ all such actions. | **100%** | — | < 100% | G2, G4 |
| **L6** | **Audit-log coverage** | Material actions/approvals/accesses that produced an append-only audit entry with who/what/when/before/after, ÷ all material actions (sampled + assertion-tested). | **100%** | — | < 100% | G4 |
| **L7** | **Migration completeness** | For each onboarding client: source records (endowments, beneficiaries, documents, financials) landed and reconciled in-platform, ÷ source records in the handover manifest. | **100%** | 98–99% | < 98% | G5, G6 |
| **L8** | **Reserved-matter approval hygiene** | Reserved-matter actions executed **only after** written principal approval + counsel review (+ Authority notice where required), ÷ reserved-matter actions. | **100%** | — | < 100% | G4 |

> [!important] Zero-target indicators have no amber band
> L5, L6, and L8 are control integrities, not trends: anything below 100% is red. A single money movement without maker-checker, or one material action with no audit entry, is a control failure to be fixed the same day — there is no "acceptable" 99%.

---

## Lagging outcomes (results — confirm success)

Confirmed at distribution time, filing time, exam time, and year-end. The five zero-tolerance KPIs live here as **counts that must stay at zero**. These are the numbers the Family Board and the Authority ultimately judge.

| # | Lagging outcome | Definition | Target | Confirmed at | Zero-tolerance KPI |
|---|---|---|---|---|---|
| **O1** | **Missed statutory deadlines** | Count of registration / update (15 bd) / substitution notice (10 bd) / registration (30 bd) / distribution-within-3-months obligations not met on time. | **0** | Monthly + at each filing | KPI-1 |
| **O2** | **Commingling incidents** | Count of transactions touching a non-dedicated account or an account shared across waqfs; unreconciled balances. | **0** | Monthly close + audit | KPI-2 |
| **O3** | **Missed AML reports / tipping-off events** | Count of reportable suspicions not reported to the FIU, or any disclosure to the subject of a report. | **0** | On event + audit | KPI-4 |
| **O4** | **Distribution defects vs. Shart al-Waqif** | Count of distribution line items whose share, entitlement order (ordered ṭabaqa exclusion vs. shared tashrīk), waterfall (ṣiyāna → cost → Nazir fee → distributable), or gate (KYC, category, licensed disburser, cross-border path) deviated from the Shart or the deed. | **0** | Each distribution run | — (correctness of core engine) |
| **O5** | **Unlicensed regulated-activity events** | Count of regulated real-estate activities performed by the platform or an unverified/unlicensed party rather than a verified licensed subcontractor. | **0** | On event + audit | KPI-5 |
| **O6** | **Clean SOCPA audit & Authority exam** | Material findings / qualifications from the SOCPA audit (large/medium) or Authority review attributable to platform records or process. | **0 material findings** | Annual | KPI-1, KPI-3 |
| **O7** | **Retention & PDPL integrity** | Records lost, prematurely deleted, or improperly disclosed against the access matrix; retention-window breaches. Real client data present on any non-KSA-resident env. | **0** | Continuous + annual | (NFR-03/07) |
| **O8** | **Onboarding time (per endowment)** | Elapsed business days from data handover to "compliance register live + beneficiaries loaded + first deadline computed" for a new endowment. | **≤ 5 bd** (G6); first engagement measured as baseline | Per onboarding | (scale) |

> [!note] O4 has no zero-tolerance KPI but is the strictest metric in the product
> The distribution engine is the highest-consequence correctness surface: an error here is a mis-payment against a binding Shart al-Waqif. It is measured to **0 defects** and every run must be reproducible from the audit trail ([G4](#goals-g1g6)). Acceptance criteria for the engine live in the distribution-engine PRD section; this metric is its scoreboard.

---

## Acceptance criteria (metric instrumentation)

The platform must **produce these numbers itself**. Given/When/Then covers happy path, edge, error, and empty states.

### AC-1 — Metrics are computed from live data, not entered

- **Given** an operations user opens the compliance dashboard for an endowment,
  **when** the dashboard loads,
  **then** L1–L8 are computed from current records (tasks, beneficiaries, audit log, bank reconciliation) at read time — never from a manually maintained figure.

### AC-2 — Classification scopes the denominator

- **Given** a waqf classified **small**,
  **when** L1 (register completeness) is computed,
  **then** large/medium-only obligations (SOCPA audit, budgets, bylaws, periodic beneficiary statements) are excluded from both numerator and denominator, and the UI labels the register "simplified annual statement" scope.
- **Given** a **direct-utilization** waqf,
  **when** distribution metrics (O4, and any waterfall indicator) are requested,
  **then** they return **N/A** with an explicit "no monetary distribution" state, not 0/0.

### AC-3 — Zero-target controls fail loud

- **Given** a money movement or filing is submitted with the same user as initiator and approver,
  **when** the action is attempted,
  **then** it is **blocked** (not merely flagged), L5 stays 100% because no non-compliant action can complete, and the attempt is written to the audit log.
- **Given** any material action completes,
  **when** L6 (audit coverage) is sampled,
  **then** a corresponding append-only entry with who/what/when/before/after exists; a missing entry is a **red** control failure raising an alert to the Nazir.

### AC-4 — Leading-indicator thresholds drive alerts

- **Given** KYC freshness (L3) for an endowment falls below 95%,
  **when** the threshold is crossed,
  **then** the endowment shows **red**, the affected beneficiaries are listed, and disbursement to any stale beneficiary is gated per [G3](#goals-g1g6) — the metric and the enforcement are the same rule.

### AC-5 — Deadline lead-time is real, not retrospective

- **Given** an obligation becomes actionable (e.g. a certificate nears expiry triggering the 15 bd update),
  **when** the deadline engine computes its KSA-business-day due date (Sun–Thu week, Hijri-moving holidays, dual Hijri/Gregorian),
  **then** the first pre-alert fires at the configured lead and L4 records the alert as on-time; a due date computed **after** it should already have alerted is flagged as a data-import gap, not silently passed.

### AC-6 — Onboarding clock (G6 / O8)

- **Given** a new client's handover manifest is imported,
  **when** the compliance register generates from templates, beneficiaries load, and the first deadline computes,
  **then** O8 records elapsed business days from handover to that milestone; the target is **≤ 5 bd** and the first engagement's actual is stored as the baseline to improve against.

### AC-7 — Empty and pre-go-live states

- **Given** an endowment with no beneficiaries yet captured,
  **when** L2/L3 are computed,
  **then** they show an explicit **"no beneficiaries — capture required"** empty state (not 100% by vacuous truth, not 0% as failure), and O4/distribution remains blocked until at least beneficiary categories are captured ([BR-206](../brd/06-functional-requirements.md)).
- **Given** the platform runs in a `DATA_CLASSIFICATION=fixture-only` environment,
  **when** any metric is displayed,
  **then** the environment banner marks the numbers as **fixture data**, and O7 asserts no non-fixture record exists.

---

## How the metrics map to reporting cadence

Aligned to the operating model's cadence so the same numbers serve internal ops, the Family Board, and the Authority.

| Cadence | Audience | Metrics surfaced |
|---|---|---|
| **Continuous / dashboard** | QMULATE operations | All leading L1–L8; live zero-count of O1–O5 |
| **Monthly** | QMULATE operations | L1–L8 review; O1, O2 confirmed at close; exceptions + decisions-required |
| **Quarterly** | Family Board | Goal scorecard (G1–G4), KPI dashboard, O1–O5 counts, KYC/UBO health (L2–L3) |
| **Annual** | Beneficiaries & Authority | O6 (clean audit/exam), O7 (retention/PDPL), full-year O1–O5, onboarding baseline (O8) |

---

## Requirements covered

- **Functional:** [BR-109](../brd/06-functional-requirements.md), [BR-201](../brd/06-functional-requirements.md), [BR-202](../brd/06-functional-requirements.md), [BR-205](../brd/06-functional-requirements.md), [BR-206](../brd/06-functional-requirements.md), [BR-503](../brd/06-functional-requirements.md), [BR-505](../brd/06-functional-requirements.md), [BR-506](../brd/06-functional-requirements.md), [BR-601](../brd/06-functional-requirements.md), [BR-602](../brd/06-functional-requirements.md), [BR-604](../brd/06-functional-requirements.md), [BR-605](../brd/06-functional-requirements.md), [BR-701](../brd/06-functional-requirements.md), [BR-702](../brd/06-functional-requirements.md), [BR-901](../brd/06-functional-requirements.md), [BR-1001](../brd/06-functional-requirements.md), [BR-1002](../brd/06-functional-requirements.md), [BR-1003](../brd/06-functional-requirements.md), [BR-1102](../brd/06-functional-requirements.md), [BR-1106](../brd/06-functional-requirements.md)
- **Non-functional:** [NFR-01](../brd/08-nonfunctional-requirements.md), [NFR-02](../brd/08-nonfunctional-requirements.md), [NFR-03](../brd/08-nonfunctional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md), [NFR-05](../brd/08-nonfunctional-requirements.md), [NFR-06](../brd/08-nonfunctional-requirements.md), [NFR-07](../brd/08-nonfunctional-requirements.md), [NFR-08](../brd/08-nonfunctional-requirements.md), [NFR-12](../brd/08-nonfunctional-requirements.md), [NFR-13](../brd/08-nonfunctional-requirements.md), [NFR-14](../brd/08-nonfunctional-requirements.md)
