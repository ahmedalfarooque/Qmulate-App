# Functional Requirements — Build-Level + G/W/T

The build-level realization of the BRD's 81 enumerated `BR-###`: for each module, the design intent (data shapes, validation, engine hooks, screens) and the Given/When/Then acceptance criteria the implementation must pass.

Status: Draft v0.1 · Privileged & Confidential

---

## How to read this section

This section turns every [BRD functional requirement](../brd/06-functional-requirements.md) into something a developer can build and a tester can sign off. It does **not** restate the BRD — it cites each `BR-###` by link and specifies the *how*. It is organized by the BRD's own modules (BR-1xx … BR-11xx).

- **Priority tags** follow the Phase-1 cut in [05 · Scope, phasing & priority](05-scope-phasing-priority.md): **P0** (go-live blocker), **P1** (fast-follow), **P2/deferred** (Phase 2/3 or backlog). We write acceptance criteria for the **P0 and P1** requirements in each module; deferred ones get design intent and a forward link only.
- **Acceptance criteria** are **Given/When/Then** tables covering happy path, edge, error, and empty state. Cells are terse; the design-intent paragraph above each table carries the reasoning.
- **The three hardest engines are specified elsewhere, not here.** This section owns the *functional contract* (what the user does and what must be true afterwards) and **delegates the algorithm**:
  - Distribution waterfall + entitlement resolver ([BR-505](../brd/06-functional-requirements.md), [BR-507](../brd/06-functional-requirements.md)) → [04 · Distribution & entitlement engines](08-distribution-engine-spec.md).
  - Compliance-task generation + statutory deadline computation ([BR-6xx](../brd/06-functional-requirements.md) / [BR-10xx](../brd/06-functional-requirements.md)) → [05 · Compliance & deadline engine](09-compliance-deadline-engine-spec.md).
  - Roles, per-endowment access matrix, self-isolation, maker≠checker ([BR-210](../brd/06-functional-requirements.md), [BR-806](../brd/06-functional-requirements.md), [BR-1103](../brd/06-functional-requirements.md)) → [07 · Identity, roles & access control](10-roles-access-matrix-spec.md); reserved-matter approvals + audit trail → [08 · Audit trail & controls](12-security-audit-retention-spec.md).
- **Entities** referenced below use the shapes in [`data/fixtures/sample-waqf.json`](../../../data/fixtures/sample-waqf.json); the Prisma schema is [03 · Data model](07-data-model-spec.md). Screens are [09 · Internal operations app](13-ux-designsystem-reference.md) / [10 · Portal](13-ux-designsystem-reference.md). Domain terms link [`glossary`](../../domain/glossary.md); law links [`regulations/`](../../domain/regulations/).

### Cross-cutting invariants (assumed by every acceptance criterion, stated once)

Rather than repeat them per row, these hold for **every** material action in this section and are asserted by the module tests implicitly:

| Invariant | Rule | Traces |
|---|---|---|
| **Money** | All amounts are `Decimal(18,2)` SAR — never floats; rendered with Latin digits + `tabular-nums`. | [NFR-08](../brd/08-nonfunctional-requirements.md), [02 · Stack](17-build-ship-dod.md) |
| **Arabic records** | Official financial transaction records are stored in Arabic (bilingual UI; Arabic is the record of truth). | [NFR-01](../brd/08-nonfunctional-requirements.md) |
| **Dual calendar** | Every statutory or business date is stored as an instant and rendered in both Umm-al-Qura Hijri and Gregorian. | [NFR-02](../brd/08-nonfunctional-requirements.md), [BR-1003](../brd/06-functional-requirements.md) |
| **Audit trail** | Every create/update/approve/access writes an immutable append-only entry (who/what/when/before/after). | [NFR-04](../brd/08-nonfunctional-requirements.md), [08](12-security-audit-retention-spec.md) |
| **Access** | Every read/write is checked against the per-endowment access matrix; beneficiaries see only their own data. | [NFR-05](../brd/08-nonfunctional-requirements.md), [07](10-roles-access-matrix-spec.md) |
| **Segregation of duties** | Money movements and Authority filings require maker ≠ checker. | [NFR-08](../brd/08-nonfunctional-requirements.md) |
| **Fixture-only** | Non-KSA environments refuse any record not tagged `DATA_CLASSIFICATION=fixture-only`. | [15 · Non-functional](15-nonfunctional-requirements.md) |

---

## BR-1xx · Endowment & deed management

**Design intent.** The root aggregate is `Waqf` (one waqf = one certificate). A `Client` (family) owns one-to-many `Waqif`s, each owning one-to-many `Waqf`s ([BR-102](../brd/06-functional-requirements.md)) — the first client is 4 endowments across 3 waqifs, so navigation and roll-up reporting must work at all three levels. The `Waqf` record carries `classification` (large/medium/small/direct-utilization), `type` (public-charitable / family-dhurri / joint), `nature` (ʿayni / qiyami), certificate + deed numbers, `registrationDate`, `fiscalYearEnd`, and the `Trusteeship` sub-record (primary Nazir + optional authorized representative, `jointlyLiable`). The **Shart al-Waqif** ([BR-103](../brd/06-functional-requirements.md)) is stored as *structured* fields — `entitlementOrder` (`ordered` | `shared` | `n/a`), maintenance-reserve rule, disbursement channel (مصرف الريع) — **not** free text, because the distribution engine reads them ([04](08-distribution-engine-spec.md)). **Classification is a gate, not a label** ([BR-104](../brd/06-functional-requirements.md)): it drives which compliance tasks and report types exist, and re-classification is versioned with history. Nazir eligibility ([BR-109](../brd/06-functional-requirements.md)) is captured at seat time (P0) and runs an exhaustive verification checklist (P1) enforcing the KSA-residency and Saudi-nationality-where-endower-foreign-and-asset-real-property constraints from [NFR-09](../brd/08-nonfunctional-requirements.md). Screens: [09 · Endowment records](13-ux-designsystem-reference.md).

Backlog (not built Phase 1): condition-interpretation workflow [BR-106], certificate-validity tracking [BR-107] (its deadline hook lives in [BR-1002](../brd/06-functional-requirements.md)/[10](09-compliance-deadline-engine-spec.md)), successor-Nazir designation [BR-108].

| Req | Case | Given | When | Then |
|---|---|---|---|---|
| [BR-101](../brd/06-functional-requirements.md) | Happy | A staff user with `endowment.write` on the client | They create a `Waqf` with waqif, certificate #, deed #, classification, type, nature, registration date, FYE, Nazir | Record persists, appears under its waqif and client, and an audit entry is written |
| [BR-101](../brd/06-functional-requirements.md) | Error | Same, but classification is omitted or not one of the four Authority classes | They submit | Save is rejected with a field error; nothing persists (classification is mandatory because it gates obligations) |
| [BR-101](../brd/06-functional-requirements.md) | Edge | A certificate number already exists on another `Waqf` | They submit the duplicate | Save is rejected as a uniqueness violation |
| [BR-102](../brd/06-functional-requirements.md) | Happy | A client with 3 waqifs and 4 endowments (the fixture shape) | A user opens the client view | Counts and totals roll up correctly at client, waqif, and endowment levels; drilling into any endowment scopes all downstream data to it |
| [BR-102](../brd/06-functional-requirements.md) | Empty | A newly created client with no waqifs yet | A user opens it | The view renders an empty state prompting "add the first waqif", not an error |
| [BR-103](../brd/06-functional-requirements.md) | Happy | A `Waqf` being edited | A user sets `entitlementOrder = ordered`, a maintenance-reserve rule, and a disbursement channel | The structured Shart fields persist and become readable by the distribution engine; a free-text narrative may also be stored but is not authoritative |
| [BR-103](../brd/06-functional-requirements.md) | Error | A user leaves `entitlementOrder` unset on a non-direct-utilization waqf | They try to run a distribution later | Distribution is blocked upstream with "Shart entitlement order not configured" (see [BR-505](../brd/06-functional-requirements.md)) |
| [BR-104](../brd/06-functional-requirements.md) | Happy | A `large` waqf | Its compliance register is generated | SOCPA-audited statements, budgets, and bylaws obligations are present; a `small` waqf under the same client gets the simplified annual-statement obligation only |
| [BR-104](../brd/06-functional-requirements.md) | Edge | A waqf is re-classified `medium → large` | A user saves the new class with an effective date | Prior classification is retained in history; the obligation set is recomputed; the change is audited |
| [BR-105](../brd/06-functional-requirements.md) | Happy | A `Waqf` with a primary Nazir | A user adds an authorized representative with a delegated scope and `jointlyLiable = true` | The rep is recorded with scope; approval routing (maker/checker) now recognizes both parties; joint-and-several liability is reflected |
| [BR-105](../brd/06-functional-requirements.md) | Error | A user tries to seat a waqf with no primary Nazir | They save | Rejected — a primary Nazir is mandatory (defines who may sign) |
| [BR-109](../brd/06-functional-requirements.md) | Happy (P0 capture) | Seating a Nazir/authorized-rep | A user records Islam, legal capacity, qualifications, good-conduct, not-previously-removed, KSA residency, (legal person) Authority licensing | Fields persist; the seat is provisional until verification clears |
| [BR-109](../brd/06-functional-requirements.md) | Error | Endower is foreign **and** the asset is real property, and the proposed Nazir is not a Saudi national | Verification runs | The seat is blocked with the [NFR-09](../brd/08-nonfunctional-requirements.md) reason; cannot be overridden in-app |
| [BR-109](../brd/06-functional-requirements.md) | Error | Proposed Nazir is not a KSA resident | Verification runs (P1 checklist) | Blocked — no management by non-residents ([BO Standards Art. 8](../../domain/regulations/beneficial-ownership-standards.md)) |

---

## BR-2xx · Beneficiary & UBO / KYC management

**Design intent.** Each `Waqf` has a `Beneficiary` (Mustahiq) registry ([BR-201](../brd/06-functional-requirements.md)) linked to the Shart basis for entitlement, with `sharePercent`, `verificationStatus` (`verified` | `pending` | `unverified`), `tabaqa`, `line` (`zuhur` | `butun`), and `branch` — the lineage fields ([BR-204](../brd/06-functional-requirements.md)) the entitlement resolver ([04](08-distribution-engine-spec.md)) needs. Each beneficiary carries the **UBO minimum dataset** ([BR-202](../brd/06-functional-requirements.md)): identity (name, nationality, DOB/place, address, contact, ID type/number), date UBO status acquired, banking ref for proceeds, relationship nature, and share of proceeds — this doubles as the payout instruction. A distinct `isUbo` flag ([BR-203](../brd/06-functional-requirements.md)) marks founder-with-control / Nazir / other controller / identifiable beneficiary, separate from ordinary beneficiaries. **KYC freshness** ([BR-205](../brd/06-functional-requirements.md)) is a first-class state with an annual refresh cycle driven by the deadline engine ([BR-1005](../brd/06-functional-requirements.md)); stale KYC is a hard distribution gate. Where no beneficiary is yet identifiable ([BR-206](../brd/06-functional-requirements.md)), only the **category/characteristics** are captured and disbursement is blocked until they are. Historical payment records per beneficiary ([BR-208](../brd/06-functional-requirements.md), P1) preserve who was paid what, when, and on what basis. This data is the platform's most sensitive: isolation and the access matrix ([BR-210](../brd/06-functional-requirements.md)) are enforced by [07](10-roles-access-matrix-spec.md) and treated as sensitive personal data under PDPL.

Deferred: beneficiary self-service intake [BR-207] and UBO disclosure workflow [BR-209] → Phase 2 ([10 · Portal](13-ux-designsystem-reference.md)).

| Req | Case | Given | When | Then |
|---|---|---|---|---|
| [BR-201](../brd/06-functional-requirements.md) | Happy | A `Waqf` with a configured Shart | A user adds a beneficiary with branch, relationship, tabaqa, line, and share | Beneficiary persists linked to the waqf and the Shart basis; appears in the registry with `verificationStatus = pending` by default |
| [BR-201](../brd/06-functional-requirements.md) | Empty | A newly created waqf | A user opens the beneficiary registry | Empty state; distribution cannot run until at least one eligible beneficiary exists |
| [BR-202](../brd/06-functional-requirements.md) | Error | Adding a beneficiary marked to receive proceeds | The banking ref for proceeds or ID number is missing | Save allowed as a draft but the beneficiary is **not payable**; a distribution line for them is gated (see [BR-505](../brd/06-functional-requirements.md)) |
| [BR-203](../brd/06-functional-requirements.md) | Happy | A founder-with-control beneficiary | A user sets `isUbo = true` | The beneficiary is flagged UBO distinctly; appears in UBO-scoped reports and screening separate from ordinary beneficiaries |
| [BR-204](../brd/06-functional-requirements.md) | Happy | An `ordered` waqf with tabaqa-1 and tabaqa-2 beneficiaries both alive | The resolver evaluates eligibility | Only tabaqa-1 is eligible; tabaqa-2 is shown as "not yet entitled (upper tier extant)" — algorithm in [04](08-distribution-engine-spec.md) |
| [BR-204](../brd/06-functional-requirements.md) | Edge | Same `ordered` waqf, all tabaqa-1 beneficiaries recorded deceased | The resolver re-evaluates | Tabaqa-2 becomes eligible; the transition is audited and evidenced |
| [BR-205](../brd/06-functional-requirements.md) | Happy | A beneficiary with `kycLastRefreshed` within the freshness window | KYC state is computed | State = `current`; beneficiary is eligible to be paid (other gates permitting) |
| [BR-205](../brd/06-functional-requirements.md) | Edge | `kycLastRefreshed` is older than the annual window | Nightly job runs | State flips to `stale`; a refresh task and reminder are raised; distribution to them is gated |
| [BR-205](../brd/06-functional-requirements.md) | Error | `kycLastRefreshed` is null (never verified) | Distribution attempted | Line item hard-blocked; cannot be force-paid |
| [BR-206](../brd/06-functional-requirements.md) | Happy | A waqf whose Shart names a category (e.g. "descendants") with no identifiable person yet | A user records the category/characteristics | Category persists; the waqf is compliant for record-keeping but disbursement to unidentified recipients stays blocked |
| [BR-206](../brd/06-functional-requirements.md) | Error | No beneficiary and no category captured | Distribution attempted | Blocked: "beneficiary category not captured" |
| [BR-208](../brd/06-functional-requirements.md) | Happy (P1) | A completed distribution | The run closes | Each beneficiary's payment history gains a row (amount, date, basis, transfer ref) that is immutable and queryable per beneficiary |
| [BR-210](../brd/06-functional-requirements.md) | Error | A staff user without access to endowment X | They query beneficiary data for X | Denied by the access matrix; the denied access attempt is audited (detail: [07](10-roles-access-matrix-spec.md)) |

---

## BR-3xx · Asset management

**Design intent.** Phase 1 builds the **asset register** ([BR-301](../brd/06-functional-requirements.md)) and the **reserved-matter guard on disposal** ([BR-306](../brd/06-functional-requirements.md)); the operational depth (leases, maintenance, valuations, subcontractor coordination, development) is Phase 3. An `Asset` belongs to one `Waqf` and records type, title-deed number(s), address, acquisition date, and valuation; a waqf may hold multiple parcels (the fixture's large waqf holds a tower + a land parcel). Disposal, substitution, pledge, and long-lease are **not editable actions** — they are entry points into the reserved-matter approval workflow ([BR-1102](../brd/06-functional-requirements.md), [08](12-security-audit-retention-spec.md)) and cannot execute without prior written principal approval + counsel review + Authority approval/notice where required. Valuation matters because it feeds classification thresholds (small < SAR 50M ≤ medium < SAR 200M ≤ large — see [glossary A](../../domain/glossary.md)).

Deferred to Phase 3: leases [BR-302], maintenance/operations [BR-303], valuations [BR-304], licensed-subcontractor coordination [BR-305], asset development/capex [BR-307].

| Req | Case | Given | When | Then |
|---|---|---|---|---|
| [BR-301](../brd/06-functional-requirements.md) | Happy | A `Waqf` | A user adds an asset with type, title-deed #, address, acquisition date, valuation | Asset persists under the waqf; multiple parcels per waqf are supported; audited |
| [BR-301](../brd/06-functional-requirements.md) | Edge | Adding a second parcel with a duplicate title-deed number | User submits | Rejected as duplicate title deed |
| [BR-306](../brd/06-functional-requirements.md) | Happy | An asset a user wants to sell/substitute/pledge/long-lease | They initiate the action | It does **not** mutate the asset; it opens a reserved-matter approval request and blocks execution until approvals clear ([BR-1102](../brd/06-functional-requirements.md)) |
| [BR-306](../brd/06-functional-requirements.md) | Error | A reserved-matter request that lacks counsel review or Authority notice where required | Someone tries to mark it executed | Execution is blocked with the missing-approval reason; attempt is audited |

---

## BR-4xx · Expropriation (entity now, workflow Phase 3)

**Design intent.** Per the "model the entity now, defer the workflow" rule ([05 · Phasing principle 3](05-scope-phasing-priority.md)), the `Expropriation` entity ships in Phase 1 so nothing is reshaped later, but the compensation → istibdal *workflow* ([BR-402](../brd/06-functional-requirements.md)–[BR-404](../brd/06-functional-requirements.md)) is Phase 3. The entity (fixture shape) records the initiating authority, scope (full/partial), announced date, `compensationSar` + `compensationStatus`, and an `istibdal` sub-record (`status`, `replacementAssetId`, `authorityNotifiedDate`, `notificationDeadlineBusinessDays = 10`). The **one live wire in Phase 1** is the deadline hook: recording an expropriation with an istibdal obligation registers the **10-business-day substitution-notice** deadline ([BR-403](../brd/06-functional-requirements.md)) in the deadline engine ([05](09-compliance-deadline-engine-spec.md)) so the clock is never silently missed, even though the guided workflow comes later. Compensation must land in a dedicated waqf account (no commingling — [BR-501](../brd/06-functional-requirements.md)).

| Req | Case | Given | When | Then |
|---|---|---|---|---|
| [BR-401](../brd/06-functional-requirements.md) | Happy | An asset subject to a government taking | A user records the expropriation (authority, scope, dates) | The `Expropriation` persists linked to the asset and waqf; audited |
| [BR-403](../brd/06-functional-requirements.md) | Edge (P1 hook) | An expropriation whose istibdal status implies a substitution notice | The record is saved | A 10-business-day Authority-notice deadline is registered and counted down; overdue triggers escalation ([BR-1004](../brd/06-functional-requirements.md)). Full workflow → Phase 3 |

---

## BR-5xx · Financial management & the distribution engine

**Design intent.** Money is where the zero-tolerance controls bite hardest. Every `Waqf` has one or more **dedicated bank accounts** ([BR-501](../brd/06-functional-requirements.md)); the model forbids a transaction referencing an account owned by another endowment or a personal account — **no commingling** is enforced in data, not just policy. Revenue and expenses ([BR-502](../brd/06-functional-requirements.md)) are captured per endowment against a SOCPA-aligned chart of accounts, with the official record stored **in Arabic** ([NFR-01](../brd/08-nonfunctional-requirements.md)). Bank reconciliation ([BR-503](../brd/06-functional-requirements.md), P1) matches ledger to imported statements with no orphaned distributions ([NFR-14](../brd/08-nonfunctional-requirements.md)). Every bank movement and every distribution run requires **maker ≠ checker** ([BR-506](../brd/06-functional-requirements.md), [NFR-08](../brd/08-nonfunctional-requirements.md)); the Nazir signs.

**The distribution engine ([BR-505](../brd/06-functional-requirements.md)) and Nazir-fee deduction ([BR-507](../brd/06-functional-requirements.md)) are the single hardest thing in Phase 1. Their algorithm lives in [04 · Distribution & entitlement engines](08-distribution-engine-spec.md); this section owns only the functional contract.** The contract the engine must satisfy:

1. **Waterfall order is fixed:** gross ghallah → **reserve stipulated maintenance (ṣiyāna) FIRST** → deduct operating/management cost → deduct **Nazir fee** → **distributable**. The Nazir fee is deed-set ([BR-507](../brd/06-functional-requirements.md)); default **10% of revenue** (ʿushr, this engagement's deed); basis is configurable (`percent_of_revenue` | `percent_of_net_income` | `retainer`) and, where the deed is silent, the Authority-determination path applies. The fee is a *deduction step* in Phase 1 (full fee automation + invoicing [BR-508] is Phase 3).
2. **Shares come from the resolver** ([BR-204](../brd/06-functional-requirements.md)/[04](08-distribution-engine-spec.md)): `ordered` waqfs exclude the next tier until the current is extinct; `shared` waqfs split across live tiers; a `direct-utilization` waqf has **no monetary distribution** at all.
3. **Gates block individual line items** before any money moves: stale/unverified KYC ([BR-205](../brd/06-functional-requirements.md)), beneficiary category not captured ([BR-206](../brd/06-functional-requirements.md)), missing payout banking detail ([BR-202](../brd/06-functional-requirements.md)); a **licensed disbursing entity must be verified** when it pays; a **cross-border beneficiary** routes to the dedicated path with an Authority notice ([BR-511](../brd/06-functional-requirements.md)).
4. **Timing:** if the Shart sets no schedule, distribute within **3 months of fiscal-year-end** — the deadline engine ([BR-1001](../brd/06-functional-requirements.md)) tracks it.
5. **Output:** per-beneficiary statements (name, share, amount, date, evidence) and immutable payment history ([BR-208](../brd/06-functional-requirements.md)).

Deferred: budgets/estimates [BR-504] (class-gated, Phase 2), client invoicing [BR-508], zakat/tax [BR-509], investment recording [BR-510] (Phase 3).

| Req | Case | Given | When | Then |
|---|---|---|---|---|
| [BR-501](../brd/06-functional-requirements.md) | Happy | A `Waqf` with a dedicated account | A revenue/expense txn is booked to that account | It persists scoped to the waqf; audited |
| [BR-501](../brd/06-functional-requirements.md) | Error | A txn referencing an account belonging to another endowment or a personal account | User submits | Rejected as a commingling violation (zero-tolerance KPI 2); attempt audited |
| [BR-502](../brd/06-functional-requirements.md) | Happy | A dedicated account | A user records rent revenue with a SOCPA account code, in Arabic | Txn persists in Arabic against the chart of accounts; appears in the endowment ledger |
| [BR-503](../brd/06-functional-requirements.md) | Happy (P1) | A period's ledger + an imported bank statement | Reconciliation runs | Matched items clear; unmatched items are flagged; no distribution can close against an unreconciled period without an override that is audited |
| [BR-506](../brd/06-functional-requirements.md) | Error | A distribution run or bank movement initiated by user A | User A also tries to approve it | Rejected — approver must differ from initiator ([NFR-08](../brd/08-nonfunctional-requirements.md)) |
| [BR-505](../brd/06-functional-requirements.md) | Happy | An `ordered` waqf, tabaqa-1 beneficiaries verified, KYC current, maintenance + cost + fee configured | A distribution run is executed and approved | Engine reserves maintenance, deducts cost, deducts Nazir fee, computes distributable, allocates by resolver, disburses via dedicated accounts, emits per-beneficiary statements. Arithmetic → [04](08-distribution-engine-spec.md) |
| [BR-505](../brd/06-functional-requirements.md) | Edge | A `direct-utilization` waqf | A distribution run is attempted | No monetary distribution is produced; the run is a no-op with an explanatory note |
| [BR-505](../brd/06-functional-requirements.md) | Error | A beneficiary line whose KYC is stale/unverified or banking detail missing | Run executes | That line is blocked and excluded (or the whole run halts, per configured strictness); reason is recorded; other gates ([BR-206](../brd/06-functional-requirements.md)) apply identically |
| [BR-505](../brd/06-functional-requirements.md) | Edge | A `shared` waqf with two live tiers | Run executes | Distributable is split across all live tiers per the Shart, not by flat headcount |
| [BR-505](../brd/06-functional-requirements.md) | Error | Shart sets no schedule and it is > 3 months after FYE with no distribution | Deadline check runs | The obligation is flagged overdue (zero-tolerance-adjacent) and escalated ([BR-1004](../brd/06-functional-requirements.md)) |
| [BR-507](../brd/06-functional-requirements.md) | Happy | A deed setting `percent_of_revenue = 10` (default ʿushr) | A run computes the waterfall | The fee is deducted **after** maintenance + cost and **before** distributable; the deducted fee is itemized and audited |
| [BR-507](../brd/06-functional-requirements.md) | Edge | A deed setting `percent_of_net_income` or `retainer` instead | A run computes | The configured basis is applied; the default is not silently used |
| [BR-507](../brd/06-functional-requirements.md) | Edge | A deed silent on the fee | A run is attempted | The engine requires the Authority-determination value before proceeding; it does not assume 10% |
| [BR-511](../brd/06-functional-requirements.md) | Happy | A beneficiary resident outside the Kingdom | A run allocates them a share | The line routes to the cross-border disbursement path and raises an Authority-notice obligation; the notice status is tracked |
| [BR-511](../brd/06-functional-requirements.md) | Error | A cross-border line with no Authority notice recorded | The run tries to close | Blocked until the notice obligation is satisfied or explicitly deferred with approval |

---

## BR-6xx · Compliance & governance

**Design intent.** This module is the platform's reason to exist: it must guarantee **no statutory duty is ever silently missed**. The **compliance-task register** ([BR-601](../brd/06-functional-requirements.md)) is *generated* from the ~30 sub-obligations in the [unified framework](../../domain/unified-framework.md), tagged by workstream (`financial` | `operational` | `government_legal`), **filtered by classification** ([BR-104](../brd/06-functional-requirements.md)), each with owner, status, dates, and notes — the fixture's `complianceTasks` shape (with `classificationGate` and `dueWithinBusinessDays`) is the target. **Task templating and generation is a hard engine, delegated to [05 · Compliance & deadline engine](09-compliance-deadline-engine-spec.md)**; this section owns the functional contract: the right tasks exist for the right class, deadlines are attached, and evidence of filing is captured.

Authority registration/updates ([BR-602](../brd/06-functional-requirements.md)) carry statutory deadlines (register 30 bd, update 15 bd) and require filing evidence. Government-platform statuses ([BR-603](../brd/06-functional-requirements.md)) — Awqaf Digital, Baladi, Istihkam, Muqeem, Qiwa, Ejar — are **manual status fields, never live APIs** ([09 · Data landscape](../brd/09-data-integration-landscape.md), [12 · Government filings](09-compliance-deadline-engine-spec.md)). **AML/CTF** ([BR-604](../brd/06-functional-requirements.md)) records that a suspicious-activity report was filed with the FIU, the detailed report, and follow-up responses — under strict **no-tipping-off**: restricted visibility, no subject notification, no alerts that could reach the subject ([07](10-roles-access-matrix-spec.md) enforces the visibility rule). Beneficial-owner records + periodic verification ([BR-605](../brd/06-functional-requirements.md)) link back to [BR-2xx]. Bylaws for large/medium ([BR-606](../brd/06-functional-requirements.md), P1), internal financial controls ([BR-611](../brd/06-functional-requirements.md), P1), and **legal/judicial case management** ([BR-612](../brd/06-functional-requirements.md), P1 — matters, hearings, execution/collection, memos, deadlines) round out the module. The **immutable audit trail** ([BR-607](../brd/06-functional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md)) underlies everything — spec in [08](12-security-audit-retention-spec.md).

Deferred/backlog: licence/permit renewals [BR-608], Nazir handover [BR-609] (Phase 3), conflict-of-interest [BR-610], donation/fundraising guard [BR-613].

| Req | Case | Given | When | Then |
|---|---|---|---|---|
| [BR-601](../brd/06-functional-requirements.md) | Happy | A new `medium` waqf | The register is generated | Tasks whose `classificationGate` includes medium appear, tagged by workstream, with owners and due dates; small-only and large-only tasks are absent |
| [BR-601](../brd/06-functional-requirements.md) | Edge | A waqf re-classified to a higher class | Register recomputes | Newly-applicable obligations appear as open tasks; already-satisfied ones are preserved with history |
| [BR-602](../brd/06-functional-requirements.md) | Happy | A newly registered asset/waqf | Registration is completed | Filing evidence is attached and the 30-bd registration obligation is marked satisfied within its window |
| [BR-602](../brd/06-functional-requirements.md) | Error | A material change with no update filed | 15 bd elapse | The obligation goes overdue, surfaces on the compliance dashboard ([BR-901](../brd/06-functional-requirements.md)), and escalates ([BR-1004](../brd/06-functional-requirements.md)) |
| [BR-603](../brd/06-functional-requirements.md) | Happy | An Awqaf Digital filing done out-of-band | A user sets its status to `registered` with a date and evidence | The manual status + evidence persist; no API call is made or implied |
| [BR-604](../brd/06-functional-requirements.md) | Happy | A suspicious activity | A user files a SAR record (detailed report + related parties) and later logs the FIU follow-up response | The report persists with restricted visibility; only the AML-authorized role can see it |
| [BR-604](../brd/06-functional-requirements.md) | Error (no tipping-off) | An open SAR concerning a beneficiary | Anyone views/edits that beneficiary | No indication of the SAR is shown to non-AML roles; no notification is emitted that could reach the subject; the access is audited |
| [BR-605](../brd/06-functional-requirements.md) | Happy | UBO records exist | The periodic-verification obligation fires | A verification task is raised per beneficiary and linked to [BR-205](../brd/06-functional-requirements.md) KYC state |
| [BR-606](../brd/06-functional-requirements.md) | Edge (P1) | A `small` waqf | Register is generated | The bylaws obligation is **absent** (large/medium only); it appears if the waqf is later re-classified up |
| [BR-607](../brd/06-functional-requirements.md) | Error | Any attempt to edit or delete a past audit entry | User (any role) tries | Rejected — the trail is append-only and immutable ([08](12-security-audit-retention-spec.md)) |
| [BR-611](../brd/06-functional-requirements.md) | Happy (P1) | A waqf's fund controls | A disbursement is proposed | Internal-control checks (authorization, purpose, dedicated-account) run before it can be approved |
| [BR-612](../brd/06-functional-requirements.md) | Happy (P1) | An active litigation matter | A user logs the matter, a hearing date, and a legal memo | The matter tracks with its deadlines; hearing dates feed the deadline engine; execution/collection status is maintained |

---

## BR-7xx · Documents & records (vault)

**Design intent.** The vault ([BR-701](../brd/06-functional-requirements.md)) is a per-endowment structured store for the deed, registration certificate, title deeds, trusteeship deeds (primary + authorized-rep), leases, valuations, financials, beneficiary/KYC & AML files, and correspondence; storage is S3-compatible via [`packages/storage`](12-security-audit-retention-spec.md). Every document enforces **≥10-year retention**, an access matrix, and a full audit trail ([BR-702](../brd/06-functional-requirements.md), [NFR-07](../brd/08-nonfunctional-requirements.md)) — controlled deletion respects retention, so a document inside its window cannot be hard-deleted. Versioning + metadata ([BR-703](../brd/06-functional-requirements.md), P1: type, endowment, date, source, confidentiality) and keeping correspondence on-record via the dedicated channel ([BR-704](../brd/06-functional-requirements.md), P1) complete it. Full spec: [11 · Documents, storage & evidence packs](12-security-audit-retention-spec.md).

| Req | Case | Given | When | Then |
|---|---|---|---|---|
| [BR-701](../brd/06-functional-requirements.md) | Happy | An endowment | A user uploads a title deed into the deeds folder | It persists with type/endowment metadata, is access-scoped, and is audited |
| [BR-702](../brd/06-functional-requirements.md) | Error | A document within its 10-year retention window | A user tries to hard-delete it | Blocked by the retention rule; only a controlled, audited soft-archive is possible |
| [BR-702](../brd/06-functional-requirements.md) | Error | A user without access to endowment X | They request a document in X | Denied by the access matrix; attempt audited |
| [BR-703](../brd/06-functional-requirements.md) | Happy (P1) | An existing document | A user uploads a new version | Prior version is retained and retrievable; metadata (source, confidentiality) is updated; change audited |

---

## BR-8xx · Client & beneficiary portal (Phase 2)

**Design intent.** The entire portal module is **Phase 2** ([11 · Roadmap](../brd/11-roadmap-phasing.md)), but it is scaffolded day one (Expo mobile + web, better-auth, access matrix) so it is a build-out, not a bolt-on ([05 · Phasing principle 4](05-scope-phasing-priority.md)). It gives beneficiaries self-service verify/refresh + document upload ([BR-801](../brd/06-functional-requirements.md)), their own statements/entitlements/history ([BR-802](../brd/06-functional-requirements.md)), a Family-Board admin view with reporting + reserved-matter decisions ([BR-803](../brd/06-functional-requirements.md)), an on-record communication channel ([BR-804](../brd/06-functional-requirements.md)), and beneficiary disclosure outputs ([BR-805](../brd/06-functional-requirements.md)). **Hard rule carried from day one: portal users see only their own / their family's data** ([BR-806](../brd/06-functional-requirements.md)) — self-isolation is enforced by the same access engine as internal apps ([07](10-roles-access-matrix-spec.md)). Acceptance criteria for these are authored with the portal build in [10 · Portal](13-ux-designsystem-reference.md); the isolation invariant is already asserted under [BR-210](../brd/06-functional-requirements.md) above.

---

## BR-9xx · Reporting & dashboards

**Design intent.** Phase 1 builds the **compliance dashboard** ([BR-901](../brd/06-functional-requirements.md), P0) and **financial reporting** ([BR-902](../brd/06-functional-requirements.md), P1); cadence packs and portfolio views are Phase 2. The compliance dashboard surfaces the **five zero-tolerance KPIs** ([operating model](../../company/operating-model.md)): on-time registration/updates, no commingling, current KYC, no missed AML reports, no unlicensed activity — plus regulatory deadlines, KYC freshness, AML alerts, filing statuses, and decisions required. Financial reporting is **class-appropriate** ([BR-902](../brd/06-functional-requirements.md)): SOCPA-audited statements for large/medium, simplified annual statement for small/direct-utilization. Audit-ready evidence packs ([BR-906](../brd/06-functional-requirements.md), P1) export financials + supporting evidence without engineering effort ([NFR-12](../brd/08-nonfunctional-requirements.md)); they use the light print theme ([design/DESIGN.md](design/DESIGN.md)).

Deferred: cadence packs [BR-903], portfolio view [BR-904], beneficiary/UBO disclosure exports [BR-905] → Phase 2.

| Req | Case | Given | When | Then |
|---|---|---|---|---|
| [BR-901](../brd/06-functional-requirements.md) | Happy | A client with several endowments | A user opens the compliance dashboard | All five zero-tolerance KPIs render with current state; overdue/at-risk deadlines, stale KYC, open AML alerts, and pending filings are surfaced with drill-down |
| [BR-901](../brd/06-functional-requirements.md) | Edge | An overdue Authority update on one endowment | Dashboard loads | That KPI shows a breach state prominently; it cannot be dismissed without resolution or an audited acknowledgement |
| [BR-901](../brd/06-functional-requirements.md) | Empty | A just-onboarded endowment with no data | Dashboard loads | KPIs render as "pending setup", not errors |
| [BR-902](../brd/06-functional-requirements.md) | Happy (P1) | A `large` waqf | A financial statement is generated | The SOCPA-audited statement type is produced; a `small` waqf yields the simplified annual statement instead |
| [BR-906](../brd/06-functional-requirements.md) | Happy (P1) | A closed period | A user requests an evidence pack | A print-ready pack (statements + supporting evidence) exports without code changes ([NFR-12](../brd/08-nonfunctional-requirements.md)) |

---

## BR-10xx · Notifications & deadline engine

**Design intent.** The deadline engine computes statutory dates on the **KSA business-day calendar** (workweek Sun–Thu; Fri/Sat weekend; Hijri-moving holidays) using Umm-al-Qura, and reminds ahead of them ([BR-1001](../brd/06-functional-requirements.md)): **register 30 bd, update 15 bd, substitution notice 10 bd, distribute within 3 months of FYE**. **This computation is a hard engine, delegated to [05 · Compliance & deadline engine](09-compliance-deadline-engine-spec.md)**; this section owns the functional contract — the right triggers create the right countdowns, and dates render in both calendars ([BR-1003](../brd/06-functional-requirements.md), [NFR-02](../brd/08-nonfunctional-requirements.md)). The 15-bd update obligation is triggered by certificate expiry or **any** material change to asset/beneficiaries/Nazarah ([BR-1002](../brd/06-functional-requirements.md)). Overdue/at-risk obligations escalate per the operating-model paths ([BR-1004](../brd/06-functional-requirements.md), P1), and reminders cover KYC refresh, certificate renewals, licence/permit expiries, and reporting cadence ([BR-1005](../brd/06-functional-requirements.md), P1). Jobs run via pg-boss in `apps/worker` on Railway Cron ([14 · Jobs](09-compliance-deadline-engine-spec.md)).

| Req | Case | Given | When | Then |
|---|---|---|---|---|
| [BR-1001](../brd/06-functional-requirements.md) | Happy | A newly registrable waqf/asset | It is created | A 30-bd registration deadline is computed on the KSA business-day calendar and reminders are scheduled before it |
| [BR-1001](../brd/06-functional-requirements.md) | Edge | A deadline window spanning a Hijri-moving public holiday and Fri/Sat weekends | The engine computes the due date | Non-business days are excluded; the due date shifts accordingly (algorithm: [05](09-compliance-deadline-engine-spec.md)) |
| [BR-1002](../brd/06-functional-requirements.md) | Happy | An existing waqf | A material change to assets/beneficiaries/Nazarah is saved, or the certificate expires | A 15-bd update obligation is auto-created with its countdown |
| [BR-1003](../brd/06-functional-requirements.md) | Happy | Any deadline or statutory date | It is displayed | Both Umm-al-Qura Hijri and Gregorian are shown; the stored instant is unambiguous |
| [BR-1004](../brd/06-functional-requirements.md) | Edge (P1) | An obligation crossing its at-risk threshold, then its due date | Time passes | It escalates up the configured path (owner → Nazir → leadership); each escalation is audited |
| [BR-1005](../brd/06-functional-requirements.md) | Happy (P1) | A beneficiary KYC nearing its annual refresh | The window approaches | A refresh reminder + task fire ahead of expiry; same for certificate/licence/permit and cadence dates |

---

## BR-11xx · Engagement lifecycle, RACI & reserved-matter approvals

**Design intent.** This module encodes *how work is authorized and sequenced* — the third hard engine (**roles/approvals**), delegated to [07 · Identity, roles & access control](10-roles-access-matrix-spec.md) (RACI roles, per-endowment access matrix, maker≠checker) and [08 · Audit trail & controls](12-security-audit-retention-spec.md) (reserved-matter approval state machine). Onboarding is **gated** ([BR-1101](../brd/06-functional-requirements.md), P1): Gate 01 Authority & Legal → Gate 02 Systems & Controls → Gate 03 People/Property/Cadence, and downstream activity is blocked until the prior gate clears ([operating model](../../company/operating-model.md)). **Reserved-matter approvals** ([BR-1102](../brd/06-functional-requirements.md), P0) require prior written principal approval + counsel review + competent-authority approval/notice where required before execution — the guard that [BR-306](../brd/06-functional-requirements.md) and money movements route through. The **RACI** ([BR-1103](../brd/06-functional-requirements.md), P1) — Family Board (Principal), Nazir (Accountable, cannot delegate accountability), QMULATE (Mandate Lead), Counsel, Auditor, Subcontractors, Authority — is encoded so approvals and notifications route correctly. **First-client data migration** ([BR-1106](../brd/06-functional-requirements.md), P0) imports the existing endowments/beneficiaries/documents/financials from SharePoint/spreadsheet sources — and, critically, the import tooling **hard-fails on any non-fixture record in a non-KSA environment** ([15](15-nonfunctional-requirements.md)). A new-endowment setup template ([BR-1105](../brd/06-functional-requirements.md), P1) speeds onboarding.

Deferred to Phase 3: training & competency tracking [BR-1104].

| Req | Case | Given | When | Then |
|---|---|---|---|---|
| [BR-1102](../brd/06-functional-requirements.md) | Happy | A reserved-matter action (e.g. asset disposal, large capex) | Principal approval + counsel review + Authority notice (where required) are all recorded | Execution is unlocked; the full approval chain is audited |
| [BR-1102](../brd/06-functional-requirements.md) | Error | The same action missing counsel review | Someone tries to execute | Blocked with the missing-step reason; no state change; attempt audited |
| [BR-1102](../brd/06-functional-requirements.md) | Edge | An action requiring Authority notice but not approval | Notice is recorded | Execution unlocks on notice (not approval), per the reserved-matter matrix ([08](12-security-audit-retention-spec.md)) |
| [BR-1106](../brd/06-functional-requirements.md) | Happy | Legacy records for the first client | A migration run imports endowments, beneficiaries, documents, financials | Records land mapped to the schema, linked into the client→waqif→endowment hierarchy, and the migration is auditable/repeatable |
| [BR-1106](../brd/06-functional-requirements.md) | Error | A migration attempted against a non-KSA environment with real (non-fixture) data | Import runs | It hard-fails before writing anything (`DATA_CLASSIFICATION` guardrail); only fixture data may load off KSA infra |
| [BR-1101](../brd/06-functional-requirements.md) | Error (P1) | An endowment still in Gate 01 (Authority & Legal not cleared) | A user attempts a Gate 03 activity (e.g. distribution setup) | Blocked until Gate 01 and Gate 02 clear; the gate state is visible |
| [BR-1103](../brd/06-functional-requirements.md) | Happy (P1) | A reserved matter needing Family-Board approval | It is raised | It routes to the Principal role for approval and to Counsel for review per the encoded RACI; accountability stays with the Nazir |
| [BR-1105](../brd/06-functional-requirements.md) | Happy (P1) | A new endowment | The setup template is applied | Default tasks, vault folders, roles, and access-matrix entries are provisioned in one step |

---

## Requirements covered

**Functional (build-level contract + G/W/T here; hard-engine algorithms delegated as noted):**
BR-101, BR-102, BR-103, BR-104, BR-105, BR-106, BR-107, BR-108, BR-109 · BR-201, BR-202, BR-203, BR-204, BR-205, BR-206, BR-207, BR-208, BR-209, BR-210 · BR-301, BR-302, BR-303, BR-304, BR-305, BR-306, BR-307 · BR-401, BR-402, BR-403, BR-404 · BR-501, BR-502, BR-503, BR-504, BR-505, BR-506, BR-507, BR-508, BR-509, BR-510, BR-511 · BR-601, BR-602, BR-603, BR-604, BR-605, BR-606, BR-607, BR-608, BR-609, BR-610, BR-611, BR-612, BR-613 · BR-701, BR-702, BR-703, BR-704 · BR-801, BR-802, BR-803, BR-804, BR-805, BR-806 · BR-901, BR-902, BR-903, BR-904, BR-905, BR-906 · BR-1001, BR-1002, BR-1003, BR-1004, BR-1005 · BR-1101, BR-1102, BR-1103, BR-1104, BR-1105, BR-1106.

**Non-functional (asserted by the acceptance criteria in this section; full spec in [15](15-nonfunctional-requirements.md)):**
NFR-01, NFR-02, NFR-04, NFR-05, NFR-07, NFR-08, NFR-09, NFR-12, NFR-14.
