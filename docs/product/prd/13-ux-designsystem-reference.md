# UX, Screens & Design-System Reference

How the QMULATE internal operations app is laid out, screen by screen — the navigation model, the Phase-1 screen inventory with states, and how it all binds to the design system.

Status: Draft v0.2 · Privileged & Confidential
**v0.2 change:** re-skinned to match [`./design/DESIGN.md`](./design/DESIGN.md) v0.2 — the **light-first neumorphic + glassmorphic** style (soft extruded/inset surfaces, glass overlays, grouped density) replaces the v0.1 dark-first flat hairline language. Screens, behaviors, and acceptance criteria are unchanged; only the visual binding is updated.

---

## Purpose & scope

This section is the **UX contract** for Phase 1: the **internal operations app** (QMULATE staff acting as Nazir). It defines the navigation model, a per-screen inventory (purpose, layout, key states, acceptance criteria), and the binding to the design system. It does **not** redefine visual tokens — those live in the design system and are summarized below.

- **In scope (Phase 1, this build):** the ten internal ops surfaces that operate the four endowments of the first client.
- **Out of scope here (Phase 2):** the beneficiary / Family-Board **portal** (mobile-first) — inventoried at the end as forward scope only.
- **Adjacent:** the **marketing site** rebuild is noted at the end; it reuses the same tokens but is not a Phase-1 ops deliverable.

Design system: **[`./design/DESIGN.md`](./design/DESIGN.md)** is the single source of truth for tokens, theming, typography, RTL, and the component inventory. This section summarizes and applies it; it never duplicates a token value.

---

## Design-system reference (summary — do not duplicate)

The full system is **[`./design/DESIGN.md`](./design/DESIGN.md)** (v0.2), grounded in the canonical brand (`docs/brand/QMULATE-Brand-Guidelines-FINAL.html`). What every screen below assumes:

- **Atmosphere:** a trustee's system of record rendered as a **calm, tactile instrument** — "Simple. Clean. Sensible." Surfaces are soft neumorphic extrusions on one cool-bone canvas; overlays are frosted glass; colour is almost absent. Composition ≈ **90% monochrome bone/grey, ≤10% blue**; blue is a **thread**, not a field (primary action, active state, links, focus, one highlighted data series). The ops app runs at **grouped density (6–7)**: **dense data sits *flat* inside soft containers** — never per-cell neumorphism (DESIGN.md §1, §6).
- **The one rule:** **neumorphism carries the *feeling*, never *information*.** State/affordance/status/hierarchy are always carried by contrast, fill, a ≥3:1 boundary cue (`--edge`), the accent, or text + ARIA — **never a shadow alone** (DESIGN.md §0, §11).
- **Theming:** **light-neu is the default** ops shell (bone `--bg`, raised surfaces via the `--nu-*` depth tokens, glass overlays via `--glass-*`, accent `--blue`; see DESIGN.md §2.1 / §2.5). **Dark-neu** is an optional low-light theme (§2.3). The **flat report/print theme** (§2.4) — **shadows/blur stripped** — is *contextual*, reserved for **printable statements, evidence packs, regulator exports, and anything `@media print`**, rendered inline via `<ThemeScope theme="report">`. **No general theme toggle in v1** beyond the optional dark-neu; the report theme is forced by print/export context.
- **Type:** **Outfit** (display/body; light 300–400 display weights suit the soft surface, body ≥400), **Geist Mono** (UPPERCASE +0.13em labels, IDs, timestamps, SAR, and **LCD-style numeric readouts in inset wells**), **IBM Plex Sans Arabic** under `[lang="ar"]`. "Madani" is dropped (no font file); Inter is banned.
- **Status semantics (light values):** success `#1E9E63` / warning `#B77A12` / danger `#C6363B` / info **=** brand blue — shown as a small solid dot/▲▼ + text label, **never colour alone**. **Money convention: positive = success, negative = danger, neutral/interaction = blue.**
- **Signature components** (built in `packages/ui`, grouped per DESIGN.md §6): the depth primitives **`Surface`** (`raised|inset|flat|glass`) and **`Well`** (inset field frame) that everything composes from; `Card` (raised soft, radius 20); `DataTable` (**flat inside a raised container** — hairline rows, sticky mono header, `tabular-nums`, RTL column order); `StatTile`/`KPI` (raised tile + inset LCD well); `StatusPill`; `WaqfClassificationBadge`; `CurrencyValue` (SAR, bidi-isolated); `DateValue` (dual Hijri/Greg); plus the domain set: `ComplianceTaskBoard`, `DeadlineCalendar`, `DistributionRunWizard`, `MakerCheckerPanel`, `AuditTrailViewer`, `DocumentVault`, `GovernmentFilingStatusGrid`, `ShartAlWaqifPanel`. Overlays (topbar, `Modal`, `Drawer`/`Sheet`, popovers) are **glass**.
- **RTL / bilingual:** logical CSS properties only (no `left/right`) — **including neumorphic shadow offsets, which flip with `dir`** (the light source is inline-start); font switch by `lang`; dual Hijri (Umm al-Qura) + Gregorian dates with the Hijri snapshot **frozen at write**; SAR in Latin digits with `tabular-nums`; never uppercase/letter-space Arabic; never mirror the logo or a time-series time axis.

Everything below is expressed against these primitives. **No screen introduces a new color, font, radius, or shadow — depth comes only from `Surface`/`Well` via the depth tokens.**

---

## Navigation & information architecture

The product's spine is the domain hierarchy — every screen is reachable through, or scoped to, one node of it.

**Client (family) → Waqif → Endowment (waqf)** — and within an endowment: `{ trusteeship deed · assets · beneficiaries + UBO · financial transactions · distributions · Nazir fee · compliance tasks · government filing statuses · documents }` ([BR-101](../brd/06-functional-requirements.md), [BR-102](../brd/06-functional-requirements.md), [BR-103](../brd/06-functional-requirements.md)).

### The Endowment Switcher (persistent context)
An always-visible **context switcher** in the `AppShell` **glass topbar** drives the whole app. It reads **Client → Waqif → Endowment** as a cascading breadcrumb-select. Selecting a node re-scopes every scope-aware screen (Endowment 360, beneficiaries, ledger, tasks, calendar, vault, distributions). The first client resolves to **4 endowments across 3 waqifs**; the switcher must handle that fan-out without a page reload.

- **Portfolio scope** (no endowment selected) shows **cross-endowment roll-ups**: the Dashboard, the portfolio filing grid, and the master deadline calendar aggregate across all endowments the user may see.
- **Endowment scope** (one selected) narrows every screen to that waqf and unlocks endowment-only actions (start a distribution run, file an update, add a beneficiary).
- The selected scope is reflected in the URL (`/c/:client/w/:waqif/e/:endowment/...`) so a screen is deep-linkable and the audit trail records *which endowment* an action touched.

### Primary navigation (sidebar, mono UPPERCASE, active = inset + `--blue`)
`Dashboard · Endowments · Beneficiaries & UBO · Distributions · Compliance · Calendar · Financials · Documents · Approvals · Audit Log`. The sidebar is **RTL-mirrored** (`AppShell` handles the mirror, including the neumorphic light-source direction); the active item reads as a soft **inset** well with the `--blue` accent (not shadow alone — the accent + `aria-current` carry it). Nav labels are Geist Mono in `en`, IBM Plex Sans Arabic (weight 600, no transform) in `ar`.

### Access & isolation
Navigation is filtered by the **per-endowment access matrix** ([BR-210](../brd/06-functional-requirements.md), [NFR-05](../brd/08-nonfunctional-requirements.md)): a user only sees endowments and screens they are entitled to; an unentitled deep link resolves to a scoped "not authorized" state, not a 404 that leaks existence.

---

## Global UX conventions (every screen honors these)

State design is not optional — each screen below specifies its four canonical states; the rules that generate them are shared here.

- **Empty:** composed and instructive, never bare "No data." First-run copy points at the next action ("Create the first endowment", "No beneficiaries yet — add the first Mustahiq or import from the deed"). Empty states respect access: if the user *can't* create, the empty state says why, not "add one."
- **Loading:** **skeleton shimmer over the soft surfaces, matching the real layout** (table rows, card grid, KPI tiles). **No circular spinners for content.** Skeletons preserve column count and RTL order so the reflow on load is invisible.
- **Error:** inline, specific, and **actionable with the reason** — e.g. *"Blocked: beneficiary KYC expired 2026-03-01"*, *"Filing rejected by Awqaf Digital — re-upload the certificate"*. Never a raw stack trace, never a generic toast for a blocking condition.
- **RTL:** every layout is authored in logical properties and verified in `ar`. Tables reverse column order and pin the first (identity) column to the inline-start; steppers, breadcrumbs, drawer motion, **and neumorphic shadow direction** mirror; **SAR figures, IBANs, deed numbers stay LTR/Latin inside `<bdi>`**; **time-series chart axes keep temporal LTR order** while labels/legend mirror.
- **Dates:** `<DateValue>` renders one primary + one secondary by context — **Hijri (Umm al-Qura) primary** on regulator-facing surfaces, Gregorian primary on operational ones; the alternate is always shown. Historical rows show the **frozen** Hijri snapshot ([BR-1003](../brd/06-functional-requirements.md), [NFR-02](../brd/08-nonfunctional-requirements.md)).
- **Money:** `<CurrencyValue>` — SAR, `tabular-nums`, Latin digits, bidi-isolated, signed color per the money convention; large readouts sit in an **inset LCD well** (Geist Mono). Money is **Decimal** end-to-end; the UI never renders a float artifact.
- **Depth & affordance:** interactive controls rest **raised** and go **inset** on press (the signature interaction); every control also carries a **≥3:1 non-shadow cue** (edge/fill/accent) + the right ARIA state. Dense tables are **flat inside** a raised container. Focus is a **solid** blue ring, never a soft glow.
- **Audit:** every material action a screen initiates (create, edit, approve, disburse, export, access a restricted record) writes to the immutable trail with before/after ([BR-607](../brd/06-functional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md)) — the UI surfaces a confirmation that the event was logged.

---

## Screen inventory — internal operations app (Phase 1)

Ten screens. Each: **purpose · layout · states · priority · acceptance criteria** for the load-bearing ones. Priorities follow the Phase-1 cut ([05 · Scope & Phasing](./05-scope-phasing-priority.md)).

### 1. Dashboard — compliance KPIs · **P0**
**Purpose:** the trustee's morning screen. Surfaces the **five zero-tolerance KPIs** (on-time Authority registration/updates · no commingling · current beneficiary KYC · no missed AML reports · no unlicensed regulated activity) plus deadlines due, KYC freshness, AML flags, filing statuses, and decisions required ([BR-901](../brd/06-functional-requirements.md)).
**Layout:** a row of **raised `StatTile`/`KPI` cards** (mono eyebrow, big number in an **inset LCD well**, colored ▲▼ delta + label) over a two-column grid of **raised "needs attention" cards** — *Deadlines within 30 bd*, *KYC expiring*, *Pending approvals*, *Open AML follow-ups*, *Filing statuses off-track*. Portfolio scope aggregates across endowments; endowment scope filters to one. A KPI in breach renders `danger` (dot + label, not colour alone); at-risk `warning`; clear `success` — colour spent sparingly.
**States:**
- *Empty:* clean onboarding client with no data yet → "No obligations generated — complete Gate 01 to seed the compliance register." Never an all-green board that implies false safety.
- *Loading:* KPI tiles + card rows skeletoned over their soft surfaces.
- *Error:* a data source down degrades **per-tile** ("KYC status unavailable — retry"), never blanks the whole dashboard.
- *RTL:* KPI row and cards mirror (incl. shadow direction); deltas keep numeric LTR; the "days remaining" mono badge stays LTR.

**Acceptance criteria**
- **Given** an endowment with a statutory update due in 12 business days, **when** I open the Dashboard, **then** the "Deadlines" tile shows it in `warning` with both Hijri + Gregorian due dates and a link to the obligation.
- **Given** a beneficiary whose KYC expired yesterday, **when** the Dashboard loads, **then** the KYC KPI reads `danger` and lists that beneficiary; **and** the count reconciles with the Beneficiary register's filter.
- **Given** the filing-status source is unreachable, **when** I load the Dashboard, **then** only the filing tile shows an inline retry and the other KPIs render normally.

### 2. Endowment 360 — Client → Waqif → Waqf detail · **P0**
**Purpose:** the canonical detail view of one endowment: identity (waqif, certificate number, documentation date), **classification** badge, waqf type & nature, registration validity, **Nazir assignment** (primary + authorized rep, joint & several liability), and tabbed access to assets, beneficiaries, financials, distributions, tasks, filings, documents ([BR-101](../brd/06-functional-requirements.md), [BR-104](../brd/06-functional-requirements.md), [BR-105](../brd/06-functional-requirements.md)).
**Layout:** `PageHeader` with `WaqfClassificationBadge` + certificate-validity `StatusPill`; a left **raised `WaqfSummaryCard`**; a `Tabs` strip (inset selected tab) for the sub-entities; a **`ShartAlWaqifPanel`** rendering the structured conditions (entitlement-order rule ordered/shared, maintenance reserve, disbursement channel) as **read-only** reference. A `Tree`/`Hierarchy` breadcrumb shows the Client → Waqif → Endowment path and lets you jump to siblings.
**States:**
- *Empty:* a newly created endowment with only identity captured → each tab shows its own instructive empty state.
- *Loading:* header + summary card + tab skeleton.
- *Error:* a malformed/absent deed reference disables dependent actions (a distribution run) with the reason surfaced, not hidden.
- *RTL:* summary card and tabs mirror; deed numbers/IBANs stay LTR in `<bdi>`.
- **Classification gating:** the tab set and task expectations adapt — Large/Medium expose audited-statement, budget, and bylaws surfaces; Small/direct-utilization show the simplified set; a **direct-utilization** waqf hides monetary distribution entirely and shows the asset-use view instead.

### 3. Beneficiary & UBO register · **P0**
**Purpose:** the Mustahiq registry per endowment with entitlement basis, share, and status; the **UBO minimum dataset**; the UBO-vs-ordinary flag; lineage/family tree with **tier (ṭabaqa)** and **line (ẓuhūr/buṭūn)**; KYC freshness and re-verification; historical payments ([BR-201](../brd/06-functional-requirements.md)–[BR-208](../brd/06-functional-requirements.md), [BR-210](../brd/06-functional-requirements.md)).
**Layout:** a dense `DataTable` **flat inside a raised card** (name · relationship · tier/line · share `ShareBar` · KYC `StatusPill` · UBO flag · last paid) with a `FilterBar` (status, tier, UBO-only, KYC-expiring). A row opens a **glass `Drawer`** with the full UBO dataset, KYC documents (`FileUpload` history — inset dropzone), category/characteristics (when no beneficiary is yet identifiable), and payment history. A `Tree`/`Hierarchy` view toggles to the family-tree rendering.
**States:**
- *Empty:* "No beneficiaries yet — add the first Mustahiq or import from the inheritance-enumeration deed."
- *Loading:* table skeleton with the real column set.
- *Error:* a beneficiary missing a required category shows a `danger` inline flag *and is counted in the disbursement-block preview*.
- *RTL:* Arabic names render in IBM Plex Sans Arabic `dir=rtl`; IBAN/ID stay LTR; share % bidi-isolated.
- **Sensitivity:** this data is sensitive PII — the register enforces the access matrix and self-isolation; opening a restricted record writes an access event.

**Acceptance criteria**
- **Given** a beneficiary with no captured category, **when** I view the register, **then** the row shows a `danger` "category required" flag **and** any distribution run excludes that line with a stated reason ([BR-206](../brd/06-functional-requirements.md)).
- **Given** a UBO, **when** I open their drawer, **then** the record is marked distinctly from an ordinary beneficiary and shows the full BO minimum dataset ([BR-202](../brd/06-functional-requirements.md), [BR-203](../brd/06-functional-requirements.md)).

### 4. Distribution Run Wizard — compute → allocate → review → maker-checker → export · **P0**
**Purpose:** operate the **distribution engine** end-to-end for one endowment's fiscal period — the single most consequential ops workflow ([BR-505](../brd/06-functional-requirements.md), [BR-506](../brd/06-functional-requirements.md), [BR-507](../brd/06-functional-requirements.md), [BR-511](../brd/06-functional-requirements.md)).
**Layout:** a 5-step `Stepper` (RTL-aware, inset track) with the `ShartAlWaqifPanel` pinned as read-only context throughout:
1. **Compute** — gross yield (ghallah) in; the **waterfall** displayed as an explicit, auditable ledger (flat rows inside a raised card): reserve **maintenance (ṣiyāna) FIRST** → deduct operating/management cost → deduct **Nazir fee** (deed-set; default **10% of revenue** = ʿushr; basis shown: percent_of_revenue | percent_of_net_income | retainer) → **distributable**. Each step is a line with its basis cited.
2. **Allocate** — the **entitlement resolver** applies the Shart's tier/line rule: **ORDERED** ("al-aʿlā fa-l-aʿlā" — an upper ṭabaqa excludes the next until extinct) vs **SHARED** (tashrik — all live tiers split). Per-beneficiary shares render with `ShareBar`; the rule in force is labeled.
3. **Review** — a per-beneficiary allocation table with **distribution gates** evaluated inline: block a line if KYC is stale/unverified or category not captured; require licensed-entity verification where a legal entity disburses; route cross-border beneficiaries to the dedicated path + Authority notice. Blocked lines are `danger` (icon + reason, not colour alone).
4. **Maker-checker** — `MakerCheckerPanel`: a dual-control diff; the **initiator cannot be the sole approver**; the Nazir signs ([NFR-08](../brd/08-nonfunctional-requirements.md)).
5. **Export** — per-beneficiary statements (name, share, amount, date, evidence) rendered in the **flat report theme / printable**; disbursement via the dedicated waqf account.

**States:**
- *Empty:* no yield captured → step 1 blocks with "Enter the period's ghallah to begin."
- *Loading:* the allocation table skeletons while the resolver runs.
- *Error / blocked:* any gate failure halts progression to export and lists every blocked line with its reason; a **direct-utilization** waqf shows "No monetary distribution — beneficiaries use the asset" and the wizard is not offered.
- *RTL:* stepper and tables mirror; amounts LTR/`tabular-nums`.

**Acceptance criteria**
- **Given** gross ghallah and a deed with a maintenance reserve + 10%-of-revenue Nazir fee, **when** I run step 1, **then** the waterfall reserves maintenance **before** any other deduction, then operating cost, then the Nazir fee, and the distributable equals gross − (maintenance + operating + fee), each line labeled with its basis ([BR-505](../brd/06-functional-requirements.md), [BR-507](../brd/06-functional-requirements.md)).
- **Given** an ORDERED Shart with a living upper tier, **when** the resolver allocates, **then** the next tier receives **zero** until the upper tier is extinct; **given** a SHARED Shart, **then** all live tiers split together.
- **Given** a beneficiary with stale KYC, **when** I reach Review, **then** their line is blocked with "KYC expired <date>" and cannot be exported until resolved ([BR-505](../brd/06-functional-requirements.md)).
- **Given** the initiator attempts to approve their own run, **when** they open maker-checker, **then** approval is refused and the reason (SoD) is shown ([BR-506](../brd/06-functional-requirements.md), [NFR-08](../brd/08-nonfunctional-requirements.md)).
- **Given** a cross-border beneficiary, **when** allocated, **then** the run routes them to the dedicated disbursement path and records the required Authority notice ([BR-511](../brd/06-functional-requirements.md)).
- **Given** no distribution schedule in the Shart, **when** the fiscal year ends, **then** the deadline engine flags the **3-month** distribution window.

### 5. Compliance Task Board — three framework sections · **P0**
**Purpose:** operate the templated compliance-task register, generated from the regulation's ~30 sub-obligations, **filtered by classification**, tagged by workstream ([BR-601](../brd/06-functional-requirements.md), [BR-104](../brd/06-functional-requirements.md)).
**Layout:** `ComplianceTaskBoard` — **three columns keyed to the unified framework**: **Financial · Operational · Government & Legal**. Each is a **raised card**: obligation title, owner, due (`DateValue` dual), status `StatusPill`, evidence link. A `FilterBar` filters by status/owner/due. Cards for obligations that don't apply at the endowment's classification are **not generated** (Large/Medium-only obligations are absent for Small).
**States:**
- *Empty:* pre-Gate-01 → "Register seeds when the endowment classification is set."
- *Loading:* three-column card skeleton.
- *Error:* an obligation with a missing owner shows a `warning` "unassigned" chip.
- *RTL:* column order mirrors (Financial reads from the inline-start in both `dir`, order preserved semantically).

### 6. Deadline Calendar — Hijri + Gregorian · **P0**
**Purpose:** render the deadline engine's computed statutory dates and reminders on a calendar respecting the **KSA workweek (Sun–Thu; Fri/Sat weekend)** and Hijri-moving holidays ([BR-1001](../brd/06-functional-requirements.md)–[BR-1005](../brd/06-functional-requirements.md)).
**Layout:** `DeadlineCalendar` with **dual Hijri + Gregorian** day cells; events colored by type/urgency (register 30 bd · update 15 bd · istibdal notice 10 bd · distribute within 3 months of FYE · KYC/licence renewals). A list/agenda toggle for a linear "next 30 bd" read. Business-day math excludes Fri/Sat and Hijri holidays.
**States:**
- *Empty:* "No deadlines in this range."
- *Loading:* calendar grid skeleton.
- *Error:* if the Hijri calendar service is unavailable, fall back to Gregorian primary with a `warning` banner (never silently drop the Hijri obligation date).
- *RTL:* the week reads right-to-left; **temporal order and any embedded time-series keep LTR**; Hijri numerals per the numbering-system rule.

### 7. Document Vault · **P0**
**Purpose:** the structured per-endowment vault — deed, registration certificate, title deeds, trusteeship deeds, leases, valuations, financials, KYC/AML files, correspondence — with retention, versioning, access matrix, and audit ([BR-701](../brd/06-functional-requirements.md)–[BR-704](../brd/06-functional-requirements.md), [NFR-07](../brd/08-nonfunctional-requirements.md)).
**Layout:** `DocumentVault` — a typed folder tree (by document category) + a `DataTable` (flat inside a raised card) of documents (type · date · source · confidentiality · version) with inline preview. `FileUpload` (inset dropzone) for new versions; version history per document; a confidentiality tag drives visibility.
**States:**
- *Empty:* "No documents yet — upload the endowment deed to begin the vault."
- *Loading:* tree + table skeleton.
- *Error:* an unsupported file type or a retention-violating delete attempt is refused with the reason ("Retention: this record must be kept ≥10 years").
- *RTL:* tree and table mirror; file names auto-direction.

### 8. Reserved-matter Approval · **P0/P1**
**Purpose:** gate the defined **reserved matters** (asset disposal/substitution/pledge/long-lease, istibdal, and other Art. 9/12/13/16/19 actions) behind **prior written principal approval + counsel review + competent-authority approval/notice where required** before execution, routed per the **RACI** ([BR-1102](../brd/06-functional-requirements.md), [BR-1103](../brd/06-functional-requirements.md), [BR-306](../brd/06-functional-requirements.md)).
**Layout:** an approval inbox `DataTable` (matter · endowment · requester · required approvers · status) → a detail view showing the request, the required approval chain (Family Board Principal → Counsel → Authority notice) as an inset stepper, each approver's sign-off, and the **block on execution** until the chain completes. Uses the same dual-control pattern as maker-checker for the sign-offs.
**States:**
- *Empty:* "No reserved matters pending."
- *Loading:* inbox skeleton.
- *Error / blocked:* an attempt to execute before the chain clears is refused with the missing step named.
- *RTL:* chain/stepper mirrors.

**Acceptance criteria**
- **Given** a reserved matter requiring Authority notice, **when** the principal and counsel have signed but the Authority notice is unrecorded, **then** execution stays blocked and the UI names the missing step ([BR-1102](../brd/06-functional-requirements.md)).
- **Given** a completed approval chain, **when** the matter is executed, **then** the full chain (who/when) is written to the audit trail ([BR-607](../brd/06-functional-requirements.md)).

### 9. Audit Log viewer · **P0**
**Purpose:** read the **immutable, append-only** trail — who/what/when/before/after — for every material action, approval, and access ([BR-607](../brd/06-functional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md)).
**Layout:** `AuditTrailViewer` — a filterable `DataTable` (flat inside a raised card): timestamp mono · actor · action · entity · endowment · before→after diff, with filters by actor, entity, endowment, date range, and action type. Row opens a before/after diff. **Read-only by construction** — no edit or delete affordance exists.
**States:**
- *Empty:* "No events match these filters" (never "no audit trail" — the trail always exists).
- *Loading:* table skeleton.
- *Error:* filter that returns too broad a range prompts to narrow, doesn't time out silently.
- *RTL:* mirrors; timestamps and IDs stay LTR mono.
- **AML confidentiality:** SAR-related events honor **no tipping-off** — restricted visibility, no subject-identifying leakage to unauthorized viewers ([BR-604](../brd/06-functional-requirements.md), [NFR-05](../brd/08-nonfunctional-requirements.md)).

### 10. Financial ledger & reconciliation · **P0**
**Purpose:** the per-endowment ledger — revenue/expenses recorded **in Arabic** on a SOCPA-aligned chart of accounts, **dedicated waqf account(s) with no commingling**, and periodic **bank reconciliation** ([BR-501](../brd/06-functional-requirements.md), [BR-502](../brd/06-functional-requirements.md), [BR-503](../brd/06-functional-requirements.md), [NFR-14](../brd/08-nonfunctional-requirements.md)).
**Layout:** an account header (dedicated account + cash position `StatTile` with inset LCD well), a dense transaction `DataTable` **flat inside a raised card** (date dual · account · description Arabic · debit/credit `CurrencyValue` · reconciliation status), and a **reconciliation panel** matching ledger to bank statement with an unmatched-items queue. The `GovernmentFilingStatusGrid` and a class-appropriate statement export (SOCPA-audited for Large/Medium; simplified annual for Small — rendered in the flat report theme) hang off this screen.
**States:**
- *Empty:* "No transactions yet — the dedicated waqf account must be linked first."
- *Loading:* ledger skeleton.
- *Error:* a transaction that would commingle funds (wrong account) is **refused** with the reason — commingling is zero-tolerance.
- *RTL:* Arabic descriptions RTL; amounts LTR/`tabular-nums`; debit/credit columns keep semantic order.

**Acceptance criteria**
- **Given** a transaction posted to a non-dedicated or another endowment's account, **when** I save it, **then** it is refused with a commingling error ([BR-501](../brd/06-functional-requirements.md)).
- **Given** a bank statement import, **when** I reconcile, **then** matched items clear and unmatched items queue for review; **no distribution reconciles to an orphaned account** ([BR-503](../brd/06-functional-requirements.md), [NFR-14](../brd/08-nonfunctional-requirements.md)).

---

## Government filing statuses are manual (all screens)

The `GovernmentFilingStatusGrid` (Awqaf Digital · Baladi · Istihkam · Muqeem · Qiwa · Ejar) renders **manual status pills**, never live-integration widgets — no public APIs are evidenced ([BR-603](../brd/06-functional-requirements.md), [09 · Data & Integration Landscape](../brd/09-data-integration-landscape.md)). The UI must not imply real-time sync (no "connected" badge, no auto-refresh spinner) — status is a field a staff member sets, timestamped and audited.

---

## Portal screens — Phase 2, mobile (forward scope only)

Not built in Phase 1; **scaffolded day one** (Expo app, better-auth, access matrix) so it is a build-out, not a bolt-on ([05 · Scope](./05-scope-phasing-priority.md)). Inventoried here for continuity; specced fully in a later phase. **The portal leans hardest into the soft neumorphic/glass style** (DESIGN.md §6) — it is the shared/mobile surface the design system is richest on.

- **Beneficiary self-service** — verify/refresh own data & KYC, upload documents (`KYCUploadFlow`), confirm contact/eligibility ([BR-801](../brd/06-functional-requirements.md)).
- **My Statements & Entitlements** — `BeneficiaryStatement` (**flat report theme, printable, SAR tabular**), `EntitlementView` with share % and history (neu dial) — **own data only** ([BR-802](../brd/06-functional-requirements.md), [BR-806](../brd/06-functional-requirements.md)).
- **Family Board dashboard** — cadence reporting, KPI dashboard, property/beneficiary status, compliance calendar, and **online reserved-matter approvals** (`ReservedMatterApproval`) ([BR-803](../brd/06-functional-requirements.md)).
- **On-record communication** — `ContactNazir` / `NotificationCenter`, logged and answered ([BR-804](../brd/06-functional-requirements.md)).

Portal components are the **shared/mobile** surface (DESIGN.md §6): tokens, depth primitives (`Surface`/`Well`), currency/date primitives, statements, and status components are shared; the ops app's dense DataTable/wizards stay desktop-web-only.

---

## Marketing site (adjacent, not Phase-1 ops)

The public site **rebuilds as Next.js `app/(marketing)` routes inside `apps/web`**, reusing the **same `tailwind-preset` + `tokens.css` + shared primitives** — not the stale static preview at `docs/brand/generated/website-preview/` (which uses the v0.1 dark flat tokens). It runs at balanced-to-airy density (3–4) in the light-neu style (soft raised cards, glass nav, a large soft "pillow" hero rather than a glow) with purposeful asymmetry; the "3 equal cards" feature row is banned there. Two items must be **confirmed with the business before public ship** (both flagged in `docs/brand/README.md`): **HQ city** (brand mockups say Riyadh; registered/legal is **Jeddah** — do not carry "Family office · Riyadh" over unverified) and whether **"Madani"** display font ever arrives. Routed to [16 · Open Questions](./16-open-questions.md).

---

## Accessibility & verification checklist (per DESIGN.md §11 + [NFR-11](../brd/08-nonfunctional-requirements.md))

- **Affordance is never shadow-only:** every interactive control + its state carry a **≥3:1 non-shadow cue** (`--edge`/fill/accent) and the correct ARIA state (`aria-pressed`/`aria-checked`/`aria-current`/`aria-invalid`). Soft shadows are decorative and may be <3:1.
- **Text contrast never traded for softness:** body `--ink` ≥7:1 on the bone `--bg`; secondary `--mist` ≥4.5:1 (verify); `--mist-2` decorative/disabled only. Accent text uses `--blue`/`--blue-strong` on light (the `blue-bright` token is the dark-neu variant).
- **Primary buttons:** labels **≥14px semibold** on the `--blue` fill (large-text AA) — apply everywhere; verify.
- **Focus** is a **solid** blue ring (never a soft glow) visible on every interactive element; all touch targets ≥44px; full keyboard + screen-reader support.
- **Glass** surfaces carry a contrast-guaranteeing scrim for any text, and a solid fallback under `prefers-reduced-transparency` / no-`backdrop-filter`.
- **Every screen verified in both `dir`** (`en` LTR + `ar` RTL, incl. mirrored shadow direction) and, for statement/export surfaces, in the **flat report/print theme**.
- Skeletons everywhere for content loading; no circular spinners; no emoji in the UI.

---

## Requirements covered

**Functional:** BR-101, BR-102, BR-103, BR-104, BR-105, BR-201, BR-202, BR-203, BR-204, BR-205, BR-206, BR-207, BR-208, BR-210, BR-306, BR-501, BR-502, BR-503, BR-505, BR-506, BR-507, BR-511, BR-601, BR-603, BR-604, BR-607, BR-701, BR-702, BR-703, BR-704, BR-801, BR-802, BR-803, BR-804, BR-806, BR-901, BR-902, BR-1001, BR-1002, BR-1003, BR-1004, BR-1005, BR-1102, BR-1103.

**Non-functional:** NFR-01, NFR-02, NFR-04, NFR-05, NFR-07, NFR-08, NFR-11, NFR-14.
