# 04 · Personas & User Stories

How the QMULATE platform is used, by whom, and the concrete jobs it must let each role do — the build-facing companion to the BRD's role model.

Status: Draft v0.1 · Privileged & Confidential

This section turns the BRD's stakeholder model ([04 · Stakeholders & Roles](../brd/04-stakeholders-roles.md)) and the operating-model RACI ([`operating-model.md`](../../company/operating-model.md)) into named personas with a permissions posture, then into ~22 prioritized, testable user stories. Requirement traceability is inline (`[BR-###]` / `[NFR-##]`); the data shapes, engine rules, and screens these stories imply are specified in the sibling PRD sections (05 data model, 06 distribution engine, 07 compliance engine, 08 screens, and [`./design/DESIGN.md`](./design/DESIGN.md)). Priorities use the Phase-1 cut: **P0** = go-live blocker, **P1** = Phase-1 fast-follow, **P2** = Phase 2+.

**One rule frames every persona below:** the platform enforces process and segregation but **never shifts legal accountability — it stays undivided with the Nazir** ([`operating-model.md`](../../company/operating-model.md)). Delegation, maker-checker, and approvals are all attribution mechanisms, not liability transfers.

---

## Persona directory

### Internal — the operations app (QMULATE staff)

| Persona | One-line responsibility | Permissions posture |
|---|---|---|
| **Nazir — Accountable Governor** | Holds full legal governance of assigned endowments; the final approver of distributions, filings, and reserved matters. | Full read/write on **assigned** endowments; sole holder of the "approve/sign" capability on reserved matters and money/filing runs; **cannot be bypassed** (no delegate can self-approve a reserved matter). TOTP required for money/filing approvals. |
| **Authorized Representative — Delegated Manager** | Performs day-to-day acts under an explicit, time-bound delegation from the Nazir; **jointly and severally liable** (Nazarah reg. Art. 11.5). | Scoped write within the delegation grant only; every action **attributed to the individual and visible to the Nazir**; may *initiate* but not solely *authorize* reserved matters. Delegation is first-class: explicit scope, start/end, revocable. |
| **Trustee Ops / Case Manager** | Runs the compliance register, deadline calendar, filings, document vault, and subcontractor coordination. | Read/write on tasks, filings, documents, calendar; **submits** money/filing/reserved items for approval; no bank-movement or sign-off authority. |
| **Finance / Accounting** | Owns bank accounts, Arabic revenue/expense capture, reconciliation, budgets, distribution runs, and Nazir-fee handling. | Read/write finance; **initiates** (never solely authorizes) bank movements and distribution runs; blocked from commingling; maker role under segregation of duties [NFR-08]. |
| **Legal / Compliance Officer** | Owns Awqaf registration/updates, AML/CTF monitoring & reporting, KYC/UBO oversight, reserved-matter routing, and audit-trail integrity. | Read across assigned endowments; write compliance obligations, UBO/KYC state, legal cases; **restricted AML-report handling** (no-tipping-off compartment); can raise/close obligations but not authorize money movements. |
| **Admin / Onboarding** | Stands up endowments, roles, the per-endowment access matrix, templates, and the first-client migration. | Configuration, user/role, and access-matrix management; **cannot approve** money/filings/reserved matters (config authority ≠ governance authority). |
| **QMULATE Leadership** | Portfolio oversight across all engagements; approvals within the authority matrix. | Read portfolio dashboards across clients/waqifs/endowments; approvals only within delegated authority; no per-endowment operational write by default. |

### External — the client / beneficiary portal (Phase 2; scaffolded day one)

| Persona | One-line responsibility | Permissions posture |
|---|---|---|
| **Family Board — Principal** | Sets strategic direction, approves reserved matters, guards the Waqif's intent, and receives quarterly/annual reporting. | Read reporting for **their** endowment(s); record reserved-matter approvals/decisions on-record; manage family-side contacts; **no operational write** into finance/compliance. |
| **Beneficiary (Mustahiq)** | Self-serves: refreshes own data & KYC, views own statements/distributions, uploads documents, raises inquiries/complaints. | Read **own** entitlements/statements only; submit own KYC & documents; messaging. **Hard data isolation** — no visibility of any other beneficiary [BR-806][NFR-05]. |

> **Oversight parties** (General Authority for Awqaf, SOCPA auditor, Saudi counsel, Financial Intelligence unit, licensed subcontractors P-01…P-06) are *recipients of outputs* or *scoped task collaborators*, not general users. They are modeled as export/scoped-access consumers, not seats — see [BR-305], [BR-604], [BR-906]. Government platforms are **manual status fields, not integrations** [BR-603].

---

## User stories

Format: **Given / When / Then** acceptance criteria live in the linked story detail; the table gives the story spine plus the edge / error / empty states that most shape the build. Each story is a slice a single persona can complete end-to-end.

### Nazir — governance, approvals & oversight

| ID | Pri | Story | Key edge / error / empty states |
|---|---|---|---|
| US-01 | P0 | **As a Nazir, I want a single approvals queue for every item awaiting my sign-off** (distribution runs, bank movements, filings, reserved matters) so that nothing statutory slips and my accountability is discharged on-record. [BR-506][BR-1102][BR-1103] | *Edge:* item's underlying data changed after submission → queue flags "stale, re-submit". *Error:* approver == initiator → block with segregation-of-duties message [NFR-08]. *Empty:* zero pending → show next upcoming deadlines instead of a blank queue. |
| US-02 | P0 | **As a Nazir, I want an endowment governance dashboard** showing the five zero-tolerance KPIs, open reserved matters, upcoming statutory deadlines, and decisions required, so that I can govern by exception. [BR-901][NFR-04] | *Edge:* a KPI breach (e.g. missed AML report) pins to top in danger state and cannot be dismissed, only resolved. *Empty:* newly assigned endowment with no data → onboarding-gate progress shown instead of KPIs. |
| US-03 | P0 | **As a Nazir, I want reserved-matter items to arrive with the required approval package assembled** (written principal approval, counsel review, competent-authority notice where required) so that I never approve one prematurely. [BR-1102][BR-306] | *Error:* a prerequisite approval is missing → the "approve" action is disabled with the missing item named. *Edge:* Authority *notice* (vs approval) required → routes to notice path, does not block internal approval. |
| US-04 | P1 | **As a Nazir, I want to grant a time-bound, scoped delegation to an Authorized Representative** and see every act they take attributed to them, so that joint-and-several liability is transparent. [BR-105] | *Edge:* delegation expires mid-workflow → in-flight items freeze pending re-grant. *Error:* attempt to delegate a reserved-matter *approval* → blocked (accountability is non-delegable). *Empty:* no active delegations → representative sees read-only. |

### Case Manager — compliance register, deadlines & filings

| ID | Pri | Story | Key edge / error / empty states |
|---|---|---|---|
| US-05 | P0 | **As a Case Manager, I want the compliance-task register auto-generated from the regulation's obligations, filtered by the endowment's classification**, so that Large/Medium-only duties (audited statements, budgets, bylaws) don't appear for Small/direct-utilization waqfs. [BR-601][BR-104] | *Edge:* re-classification Large→Small → newly-out-of-scope tasks are archived with history, not deleted [BR-104]. *Empty:* pre-classification endowment → register locked with a "set classification first" prompt. |
| US-06 | P0 | **As a Case Manager, I want statutory deadlines computed in KSA business days on both Hijri and Gregorian calendars** (register 30 bd, update 15 bd, istibdal notice 10 bd, distribute within 3 months of FYE) with reminders ahead of each, so that no filing is late. [BR-1001][BR-1003][NFR-02] | *Edge:* deadline lands on a Fri/Sat weekend or Hijri-moving holiday → rolls to next KSA business day. *Error:* a material change (asset/beneficiary/Nazarah) fires the 15-bd update clock [BR-1002]. *Empty:* no obligations yet → calendar shows the register-30-bd clock only. |
| US-07 | P0 | **As a Case Manager, I want to record government-platform filing statuses** (Awqaf Digital, Baladi, Istihkam, Muqeem, Qiwa, Ejar) as manual status fields with evidence attached, so that filing state is visible without any live integration. [BR-603][BR-602] | *Edge:* status set to "filed" requires an evidence document or a justified exception note. *Empty:* platform never used for this endowment → status "N/A" distinct from "not started". |
| US-08 | P1 | **As a Case Manager, I want overdue and at-risk obligations to escalate automatically to the Nazir and Leadership** per the escalation path, so that risk surfaces before it becomes a breach. [BR-1004][BR-1005] | *Edge:* obligation resolved after escalation → escalation auto-closes with trail. *Error:* escalation recipient unassigned → falls back to the Nazir and logs the gap. |

### Finance — Arabic ledger, distribution engine, maker-checker & reconciliation

| ID | Pri | Story | Key edge / error / empty states |
|---|---|---|---|
| US-09 | P0 | **As Finance, I want to capture revenue and expenses in Arabic against a dedicated per-endowment bank account on a SOCPA-aligned chart of accounts**, so that official records are compliant and un-commingled. [BR-502][BR-501][NFR-01] | *Error:* posting to a non-dedicated or another endowment's account → hard-blocked (commingling is zero-tolerance). *Edge:* amounts stored as Decimal(18,2), Latin digits, tabular-nums; never float. *Empty:* no account linked → capture disabled until a dedicated account is registered. |
| US-10 | P0 | **As Finance, I want to run the distribution engine that applies the waterfall** — gross ghallah → reserve stipulated maintenance (ṣiyāna) **first** → deduct operating/management cost → deduct Nazir fee (deed-set, default 10% of revenue / ʿushr) → distributable — and splits it per the Shart al-Waqif's entitlement order, so that beneficiaries receive exactly what the deed dictates. [BR-505][BR-507] | *Edge:* **ordered** (al-aʿlā fa-l-aʿlā) tier excludes the next until extinct vs **shared** (tashrik) split among live tiers — engine resolves by ṭabaqa/ẓuhūr-buṭūn. *Edge:* **direct-utilization** waqf → no monetary distribution; run is disallowed. *Error:* maintenance reserve or fee basis unset → run blocked. *Empty:* zero distributable after reserves/fees → produces a zero-distribution statement, not an error. |
| US-11 | P0 | **As Finance, I want every distribution line gated on beneficiary readiness** — KYC fresh, category captured, disbursing legal entity licensed, cross-border path where applicable — so that no disbursement violates a control. [BR-505][BR-206][BR-205][BR-511] | *Error:* stale/unverified KYC or missing beneficiary category → that line is held, the rest may proceed. *Edge:* cross-border beneficiary → dedicated path + Authority notice queued [BR-511]. *Error:* disbursing entity unlicensed → line blocked. |
| US-12 | P0 | **As Finance, I want to initiate a distribution/bank run that a different approver (Nazir) must authorize** (maker ≠ checker), so that segregation of duties is enforced on all money movement. [BR-506][NFR-08] | *Error:* same user tries to approve their own run → blocked. *Edge:* run edited after submission → prior approval voided, re-approval required. *Empty:* nothing to distribute in period → no run created. |
| US-13 | P1 | **As Finance, I want periodic bank reconciliation against the ledger with no orphaned distributions**, so that records reconcile and integrity holds. [BR-503][NFR-14] | *Edge:* unmatched bank line → flagged for investigation, blocks period close. *Error:* a distribution with no matching debit → integrity alert. *Empty:* first period → opening-balance capture step. |
| US-14 | P1 | **As Finance, I want the engine to enforce the 3-months-after-fiscal-year-end distribution deadline when the Shart sets no schedule**, so that timing compliance is automatic. [BR-505][BR-1001] | *Edge:* Shart *does* set a schedule → that overrides the 3-month default. *Error:* FYE passed and no run initiated → escalates as an at-risk obligation. |

### Compliance / Legal — UBO, AML, KYC, reserved-matter routing & legal cases

| ID | Pri | Story | Key edge / error / empty states |
|---|---|---|---|
| US-15 | P0 | **As a Compliance Officer, I want to capture the UBO minimum dataset and flag which beneficiaries are Ultimate Beneficial Owners** distinctly from ordinary Mustahiqqun, so that beneficial-ownership obligations are met. [BR-202][BR-203][BR-605] | *Edge:* no identifiable beneficiary yet → capture beneficiary *category/characteristics* and block disbursement until done [BR-206]. *Error:* incomplete UBO dataset → record stays "pending", cannot be marked verified. |
| US-16 | P0 | **As a Compliance Officer, I want to record that an AML/CTF suspicious-activity report was filed with the Financial Intelligence unit, inside a restricted no-tipping-off compartment**, so that reporting is evidenced with zero risk of alerting the subject. [BR-604][NFR-05] | *Error:* the report's existence must not appear in the subject's beneficiary view, notifications, or any shared export — enforced, not conventional. *Edge:* FIU follow-up responses tracked in the same compartment. *Empty:* no reports → the compartment is invisible to unauthorized roles entirely. |
| US-17 | P0 | **As a Compliance Officer, I want a live KYC-freshness state per beneficiary with an annual refresh cycle**, so that "current beneficiary KYC" (a zero-tolerance KPI) is always measurable and enforced at distribution. [BR-205][BR-1005] | *Edge:* KYC lapses mid-cycle → state flips to stale and the beneficiary's distribution lines auto-gate. *Empty:* newly added beneficiary → "unverified" until first verification, distinct from "stale". |
| US-18 | P1 | **As a Compliance Officer, I want to route reserved matters through their approval chain** (written principal approval + counsel review + competent-authority approval/notice where required) and track each step, so that no reserved action executes without its full package. [BR-1102][BR-1103] | *Edge:* Authority *notice-only* items (e.g. istibdal completion, 10 bd) route to notice, not approval [BR-403]. *Error:* execution attempted before chain complete → blocked with the missing step named. |
| US-19 | P1 | **As a Compliance Officer, I want legal & judicial case management** — litigation, claims, hearings, execution/collection, memos, and their deadlines — so that matters representing the waqf are tracked to closure. [BR-612][BR-1001] | *Edge:* hearing date feeds the deadline engine (Hijri/Gregorian). *Empty:* no active matters → module shows a clean register, not an error. |

### Admin — access matrix, onboarding & first-client migration

| ID | Pri | Story | Key edge / error / empty states |
|---|---|---|---|
| US-20 | P0 | **As an Admin, I want to configure the per-endowment access matrix with least-privilege defaults and beneficiary self-isolation**, so that sensitive UBO/beneficiary data is compartmentalized per PDPL and the BO Standards. [BR-210][BR-806][NFR-05][NFR-06] | *Error:* attempt to grant a beneficiary cross-family visibility → blocked by design. *Edge:* removing a user's last access to an endowment revokes in-flight tasks. *Audit:* every matrix change is logged before/after [NFR-04]. |
| US-21 | P1 | **As an Admin, I want templated new-endowment onboarding through the three gates** (Authority & Legal → Systems & Controls → People/Property/Cadence) that provisions the task register, vault structure, roles, and access matrix, so that a new endowment is stood up fast and no gate is skipped. [BR-1101][BR-1105] | *Error:* downstream activity attempted before the prior gate clears → blocked [BR-1101]. *Edge:* Nazir/authorized-rep eligibility (KSA residency; Saudi-nationality rule) verified at Gate 01 [BR-109][NFR-09]. |
| US-22 | P1 | **As an Admin, I want to import/migrate the first client's existing records** (4 endowments across 3 waqifs — deeds, beneficiaries, documents, financials) from SharePoint/spreadsheets, so that the live engagement moves onto the platform without re-keying. [BR-1106] | *Error:* import tooling **hard-fails** on any non-fixture data while `DATA_CLASSIFICATION=fixture-only` (no KSA-resident prod yet) — real client data never lands on non-KSA infra [NFR-03]. *Edge:* malformed row → row-level reject with a reconciliation report, not a whole-batch abort. *Empty:* dry-run mode validates shapes against the fixture without writing. |

### Portal — beneficiary self-service & Family Board (Phase 2)

| ID | Pri | Story | Key edge / error / empty states |
|---|---|---|---|
| US-23 | P2 | **As a Beneficiary, I want to refresh my own KYC, upload documents, and view only my own statements and distribution history**, so that I stay verified and informed without seeing anyone else's data. [BR-801][BR-802][BR-806] | *Error:* any attempt to reach another beneficiary's record → denied and audit-logged. *Empty:* no distributions yet → shows entitlement basis and next expected cycle, not a blank screen. *Edge:* stale KYC → prominent refresh prompt, since it gates my distributions. |
| US-24 | P2 | **As a Family Board member, I want quarterly/annual reporting, the KPI dashboard, and the compliance calendar for our endowments, and to record reserved-matter approvals on-record**, so that the Principal governs and the Waqif's intent is guarded. [BR-803][BR-804][BR-805] | *Edge:* recording a reserved-matter approval feeds the Nazir's approval chain (US-03/US-18). *Empty:* first quarter → shows cadence schedule and onboarding status. *Error:* Board write attempt into finance/compliance ops → not permitted (read + decisions only). |

---

## Cross-cutting: the immutable audit trail

Every story above writes to one shared, **append-only audit trail** capturing **who / what / when / before / after** on every material action, approval, and access [BR-607][NFR-04]. This is not a per-story feature — it is a platform invariant the acceptance criteria of *all* stories inherit:

- **Given** any create/update/approve/access on endowment, financial, beneficiary, UBO, AML, document, or access-matrix data, **When** it succeeds, **Then** an immutable log entry is written atomically with the change (no change without a log line).
- **Given** an AML no-tipping-off compartment [BR-604], **When** its entries are logged, **Then** the log itself respects the restricted-visibility boundary — the trail records that action occurred without leaking it to unauthorized roles.
- **Given** a retention floor of ≥10 years [BR-702][NFR-07], **When** any deletion is attempted, **Then** it is refused or controlled per the retention policy; the audit trail is never editable or purgeable within retention.

---

## Requirements covered

BR-104, BR-105, BR-109, BR-202, BR-203, BR-205, BR-206, BR-210, BR-306, BR-403, BR-501, BR-502, BR-503, BR-505, BR-506, BR-507, BR-511, BR-601, BR-602, BR-603, BR-604, BR-605, BR-607, BR-612, BR-801, BR-802, BR-803, BR-804, BR-805, BR-806, BR-901, BR-1001, BR-1002, BR-1003, BR-1004, BR-1005, BR-1101, BR-1102, BR-1103, BR-1105, BR-1106 · NFR-01, NFR-02, NFR-03, NFR-04, NFR-05, NFR-06, NFR-07, NFR-08, NFR-09, NFR-14
