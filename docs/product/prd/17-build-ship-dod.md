# 17 · Build & ship / Definition of Done

The Phase-1 delivery plan: the monorepo layout, the ordered build epics E0–E12, the Railway deployment topology, the CI/CD pipeline, and the release gates — with a per-feature Definition of Done and a concrete end-to-end verification plan run against the anonymized fixture.

Status: Draft v0.1 · Privileged & Confidential

This section is the build contract. It takes every prior PRD section (data model, engines, screens, RBAC, security) and turns it into a sequenced, verifiable delivery: what to build first, what "done" means for each feature, and what must be green before anything ships. It grounds the operating-model **handover gates** and RACI ([`operating-model.md`](../../company/operating-model.md)), the engagement-lifecycle requirements [BR-1101](../brd/06-functional-requirements.md)–[BR-1103](../brd/06-functional-requirements.md) and [BR-1106](../brd/06-functional-requirements.md), the Phase-1 cut in [11 · Roadmap](../brd/11-roadmap-phasing.md), and **all fourteen** non-functional requirements ([NFR-01](../brd/08-nonfunctional-requirements.md)–[NFR-14](../brd/08-nonfunctional-requirements.md)). The design system it builds against lives at [`./design/DESIGN.md`](./design/DESIGN.md).

**Scope of this document:** Phase-1 (compliance & operations core, including the distribution engine). The mobile portal is scaffolded day one but its features are Phase 2; property/lease/expropriation/fee-automation workflows are Phase 3. The Expropriation entity is *modeled* now (its workflow deferred).

---

## Delivery principles

- **Compliance-first ordering.** Nothing that moves money or files with a regulator ships before the controls that protect it (audit trail, access matrix, maker-checker, dedicated accounts). Epics are ordered so each builds only on already-hardened foundations.
- **The kernel before the features.** Cross-cutting concerns — auth, RBAC, dates, money, audit, scoping — are built once in shared packages (E0–E2) and every feature consumes them. No feature re-implements a deadline calculation or a money type.
- **`packages/domain` is pure.** The engines (distribution waterfall, entitlement resolver, deadline calculator, classification gating) are pure TypeScript with **no internal imports** and no I/O. They are property-tested in isolation before any screen calls them.
- **The fixture is the proving ground.** Every epic's DoD is demonstrated against [`data/fixtures/sample-waqf.json`](../../../data/fixtures/sample-waqf.json) — the four endowments across three waqifs exercise ordered vs. shared entitlement, medium vs. small classification, and an authorized-representative deed.
- **Residency guardrail is non-negotiable.** Until a KSA-resident production environment exists, only fixture data may exist in any Railway environment (see [Residency guardrail](#residency-guardrail-nfr-03)). This is enforced in code, seed tooling, import tooling, and CI — not by policy alone.

---

## Monorepo layout

Turborepo + pnpm workspaces, end-to-end TypeScript. `packages/domain` imports nothing internal; every other package may depend on it. The dependency direction is strictly **apps → api → {auth, domain, database, storage, jobs, i18n} → config**.

```
qmulate/
├─ apps/
│  ├─ web/          Next.js (App Router) — internal ops app (Phase 1) + light SSR for print statements
│  ├─ mobile/       Expo (React Native) — beneficiary / Family-Board portal (scaffold day 1, features Phase 2)
│  └─ worker/       pg-boss job runner — deadline engine, notifications, cron (Railway Cron)
├─ packages/
│  ├─ domain/       PURE TS engines: distribution waterfall, entitlement resolver, dates, money, classification gating, deadline rules — no internal imports, no I/O
│  ├─ database/     Prisma schema + client extensions (audit, scoping, field-encryption), migrations, fixture seed
│  ├─ api/          tRPC v11 routers + context + procedure ladder; thin REST/OpenAPI adapter for regulator/auditor exports
│  ├─ auth/         better-auth (self-hosted): email/password + TOTP for money/filing roles; session → tRPC context
│  ├─ storage/      S3-compatible object storage interface (MinIO dev, S3 prod); presigned URLs, object-lock/retention
│  ├─ jobs/         pg-boss queue definitions, schedules, typed job payloads
│  ├─ ui/           shared React component library — brand tokens, RTL-aware primitives, dual-calendar & money widgets
│  ├─ i18n/         next-intl / i18next resources (ar + en), RTL helpers, SAR/date formatters
│  └─ config/       shared tsconfig, eslint, prettier, zod env schema, DATA_CLASSIFICATION flag
├─ .github/workflows/   CI (typecheck → lint → unit → build → integration → e2e → deploy)
└─ turbo.json           pipeline graph + remote cache
```

**Locked stack (do not re-open):** Next.js App Router · Expo · tRPC v11 (+ thin REST/OpenAPI) · Prisma + PostgreSQL (money as `Decimal(18,2)`, never floats) · better-auth (+ TOTP) · next-intl/i18next · `@umalqura/core` for Umm-al-Qura Hijri · zod · pg-boss on Railway Cron · S3-compatible storage. Hosting on **Railway** now; **KSA data residency + PDPL deferred to before production** ([NFR-03](../brd/08-nonfunctional-requirements.md)).

---

## Build epics (ordered)

Each epic lists its deliverable, the requirements it lands, its P-priority, and its exit condition. Epics are strictly ordered: an epic may not start until its predecessors' exit conditions are met. P-priorities follow the Phase-1 cut in [05 · Scope](05-scope-phasing-priority.md).

### E0 · Foundation & scaffold — *(enabling; no BR)*

Turborepo + pnpm workspace; `apps/{web,mobile,worker}` shells that boot; `packages/*` skeletons; shared `config` (tsconfig/eslint/prettier, zod-validated env incl. `DATA_CLASSIFICATION`); **better-auth** wired with email/password + **TOTP enrolment** for money/filing roles ([NFR-06](../brd/08-nonfunctional-requirements.md)); **i18n** (ar/en, RTL via logical CSS) and **brand tokens** from [`./design/DESIGN.md`](./design/DESIGN.md) in `packages/ui`; GitHub Actions CI green on an empty build.

> **Exit:** `pnpm turbo build lint typecheck` passes; web renders a themed, RTL-capable shell in both locales; a seeded admin can register, enrol TOTP, and log in. **P0.**

### E1 · Data model, migrations, seed & the append-only spine — [BR-101](../brd/06-functional-requirements.md)–[BR-102](../brd/06-functional-requirements.md), [BR-607](../brd/06-functional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md)/[07](../brd/08-nonfunctional-requirements.md)

Full Prisma schema for the Phase-1 entities (Client → Waqif → Waqf/Endowment → {TrusteeshipDeed, Asset, Expropriation *(modeled, workflow deferred)*, Beneficiary+UBO, FinancialTransaction, Distribution, NazirFee, ComplianceTask, GovernmentFilingStatus, Document, AuditEvent, WaqfAccessGrant, Setting}); money columns are `Decimal(18,2)`. **Prisma client extensions** for (a) automatic **audit-event** emission on every material write (who/what/when/before/after), (b) **tenant/endowment scoping** force-filter, (c) **field-encryption** hooks for sensitive columns. An **append-only audit table** enforced at the DB layer: dedicated Postgres role with `INSERT`-only grant + a `BEFORE UPDATE/DELETE` trigger that raises. Deterministic **fixture seed** that loads `sample-waqf.json` and **refuses to run** unless `DATA_CLASSIFICATION=fixture-only`.

> **Exit:** `prisma migrate deploy` + seed produce the four fixture endowments; a raw `UPDATE`/`DELETE` against `audit_event` fails; every seed write leaves audit rows. **P0.**

### E2 · Cross-cutting kernel — [NFR-01](../brd/08-nonfunctional-requirements.md)/[02](../brd/08-nonfunctional-requirements.md)/[04](../brd/08-nonfunctional-requirements.md)/[05](../brd/08-nonfunctional-requirements.md)/[13](../brd/08-nonfunctional-requirements.md), [BR-1003](../brd/06-functional-requirements.md)

The shared machinery every feature consumes:

- **tRPC context** — resolves session (from `auth`), locale, and the caller's access grants; attaches an audit actor.
- **RBAC / access-matrix procedure ladder** — `publicProcedure → authedProcedure → endowmentScopedProcedure → makerProcedure / checkerProcedure / signerProcedure`, with beneficiary **self-isolation** and the AML **no-tipping-off** compartment, per [10 · Roles & access matrix](./10-roles-access-matrix-spec.md). ([NFR-05](../brd/08-nonfunctional-requirements.md)/[08](../brd/08-nonfunctional-requirements.md))
- **`Setting` config store** — typed, per-scope (global / client / endowment) parameters: fee basis, classification thresholds, deadline windows, reporting cadence, holiday calendar. Read through a single resolver so nothing is hard-coded. ([NFR-13](../brd/08-nonfunctional-requirements.md))
- **Dates engine** (`packages/domain`) — `@umalqura/core` Umm-al-Qura Hijri ↔ Gregorian; a **KSA business-day calculator** (workweek Sun–Thu, Fri/Sat weekend) driven by a data-configured **`HolidayCalendar`** (Hijri-moving holidays); `addBusinessDays`, `isBusinessDay`. ([NFR-02](../brd/08-nonfunctional-requirements.md), [BR-1003](../brd/06-functional-requirements.md))
- **Money helpers** (`packages/domain`) — decimal arithmetic, rounding policy, SAR formatting (Latin digits, `tabular-nums`); no floats ever. ([NFR-08](../brd/08-nonfunctional-requirements.md) money)
- **Storage & jobs interfaces** — thin typed wrappers so features depend on interfaces, not MinIO/pg-boss directly.

> **Exit:** a scoped procedure denies a caller without a grant; `addBusinessDays` crosses a weekend + a seeded Hijri holiday correctly (unit-tested); a fee-basis change via `Setting` flows through with no redeploy. **P0.**

### E3 · Endowment, deed, classification & hierarchy — [BR-101](../brd/06-functional-requirements.md)–[BR-105](../brd/06-functional-requirements.md), [BR-109](../brd/06-functional-requirements.md), [BR-306](../brd/06-functional-requirements.md), [BR-1102](../brd/06-functional-requirements.md) *(skeleton)*

CRUD + screens for Client→Waqif→Endowment navigation; the **Trusteeship Deed** with Primary Nazir + Authorized Representative and joint-&-several liability; the **Shart al-Waqif** captured as structured, referenceable conditions (entitlement-order rule, maintenance reserve, disbursement channel); **classification** recorded with history and **gating** which obligations apply; **Nazir/rep eligibility verification** (Islam, capacity, no disqualifying conviction, KSA residency, nationality-where-foreign-endower-and-real-property, legal-person licensing — [NFR-09](../brd/08-nonfunctional-requirements.md)); an **eligibility resolver** in `packages/domain` (pure); the **reserved-matter skeleton** (mark an action as reserved → block until approved; full workflow in E11). Asset disposal/substitution flagged reserved ([BR-306](../brd/06-functional-requirements.md)).

> **Exit:** the fixture's medium waqf shows audited-statement/bylaw obligations that the small waqf does not; an ineligible Nazir (non-resident) is blocked with a clear reason. **P0** (BR-104 gating, 109 eligibility, 306 reserved-flag); **P1** for re-classification history depth.

### E4 · Beneficiary, UBO/KYC, isolation & field encryption — [BR-201](../brd/06-functional-requirements.md)–[BR-206](../brd/06-functional-requirements.md), [BR-208](../brd/06-functional-requirements.md), [BR-210](../brd/06-functional-requirements.md)

Beneficiary (Mustahiq) registry per endowment linked to the Shart-al-Waqif basis; the **UBO minimum dataset** ([BR-202](../brd/06-functional-requirements.md)) with UBO flag distinct from ordinary beneficiary ([BR-203](../brd/06-functional-requirements.md)); **lineage / family tree** with tier (ṭabaqa) and line (ẓuhūr/buṭūn) ([BR-204](../brd/06-functional-requirements.md)); **KYC verification + freshness state** and annual refresh ([BR-205](../brd/06-functional-requirements.md)); **beneficiary-category capture** with disbursement blocked until captured ([BR-206](../brd/06-functional-requirements.md)); **historical payment records** ([BR-208](../brd/06-functional-requirements.md)). **Field-level encryption** on identity/banking columns (searchable-HMAC for equality lookup) and hard **beneficiary self-isolation** in the scoping filter ([BR-210](../brd/06-functional-requirements.md), [NFR-05](../brd/08-nonfunctional-requirements.md)/[06](../brd/08-nonfunctional-requirements.md)).

> **Exit:** a beneficiary principal can read only their own record; a DB operator sees ciphertext for ID/bank columns; a beneficiary with no category set cannot be included in a distribution run. **P0** (201–206, 210); **P1** (208).
>
> **⊕ S5/E4 status (2026-08-18, closed):** all three exit clauses are **built and measured** (`packages/api/test/e4-registry.integration.test.ts`) — self-isolation on the widened surface, ciphertext at rest incl. HMAC-digest reproduction, the BR-206 category block. **BR-208 (historical payment records) is P1 and NOT built this sprint** — it stays owed, named, to a later epic.
>
> ✅ **Q-E4-1 — RULED AND LANDED (product owner, 2026-08-18): option (a).** D-E (2026-08-16) said *"deed can be seen by nazir, case manager and eligible beneficiaries"*, and *"eligible"* is a computed, never-persisted, frontier-varying fact (the schema forbids a persisted entitlement verdict) that cannot be read off a beneficiary row — so engineering surfaced three doors and resolved none (binding rule 4). **The owner chose the widest: every beneficiary principal of a waqf may read THAT waqf's deed, self-isolation otherwise untouched**, accepting the named consequence that a member held behind a living ancestor, or excluded under a line the deed does not continue, reads it too. The two declined options are on the record: computing entitlement at read time (a fiqh computation on an access path; a `SHART_INCOMPLETE` deed unreadable to exactly the people it affects) and a staff-attested flag (a stored judgment beside the forbidden verdict class). **Implemented in S5's tail:** the `beneficiary` preset and the seeded grant shape hold `endowment:deed:read` — **that one endowment verb and no other**, pinned in both directions, so the endowment record and `endowment.get`'s trusteeship summary stay shut. Own-waqf scoping is structural (the grant is per-endowment; rung 2 has no fallback; the force filter narrows `TrusteeshipDeed` independently) and is measured **non-vacuously** against four foreign endowments proven to carry deeds — `packages/api/test/beneficiary-deed-read.integration.test.ts`. ⚠ **BR-702 is NOT satisfied by this and must not be reported as satisfied:** the ruling settles the `TrusteeshipDeed` **record** (BR-105); whether the deed **file** follows it is a document-access-matrix row **E9 still owes**.
>
> ✅ **Q-E4-2 — RULED (product owner, 2026-08-18).** The portal KYC model is **beneficiary-entered, staff-verified with a request-more loop** (owner, verbatim: *"beneficiary should enter their own kyc info - staff verifies and can request more"*) — the beneficiary is the maker of their own KYC record. The owed item reads: **"beneficiary-entered KYC, staff-verified with request-more loop (owner model, Q-E4-2) — ships with the portal epic (owner timing, 2026-08-18)."** ⚠ **Staff recording KYC on a beneficiary's behalf is the stated INTERIM, never the design**, and the beneficiary session's write-nothing posture is an implementation state of that timing, not the product's model. **No write path is built here.**

### E5 · Financial core — [BR-501](../brd/06-functional-requirements.md)–[BR-503](../brd/06-functional-requirements.md), [BR-506](../brd/06-functional-requirements.md), [BR-611](../brd/06-functional-requirements.md), [NFR-01](../brd/08-nonfunctional-requirements.md)/[14](../brd/08-nonfunctional-requirements.md)

**Dedicated waqf bank account(s)** per endowment with an **anti-commingling** invariant enforced in the domain layer (no transaction may reference an account not belonging to its endowment; no personal/cross-endowment mixing — zero-tolerance KPI 2) ([BR-501](../brd/06-functional-requirements.md)); **revenue/expense capture stored in Arabic** with a SOCPA-aligned chart of accounts ([BR-502](../brd/06-functional-requirements.md), [NFR-01](../brd/08-nonfunctional-requirements.md)); **periodic bank reconciliation** with no orphaned entries ([BR-503](../brd/06-functional-requirements.md), [NFR-14](../brd/08-nonfunctional-requirements.md)); **maker-checker** on every money movement (initiator ≠ approver; Nazir signs) via the E2 procedure ladder ([BR-506](../brd/06-functional-requirements.md), [NFR-08](../brd/08-nonfunctional-requirements.md)); **internal financial controls** ([BR-611](../brd/06-functional-requirements.md)). All amounts `Decimal(18,2)`.

> **Exit:** posting a transaction against a foreign endowment's account is rejected; a maker cannot self-approve; a reconciliation run reports a deliberately-planted mismatch. **P0.**

### E6 · Distribution engine (property-tested) — [BR-505](../brd/06-functional-requirements.md), [BR-507](../brd/06-functional-requirements.md) *(deduction step)*, [BR-511](../brd/06-functional-requirements.md)

The heart of Phase 1, built **pure** in `packages/domain` and property-tested with fast-check before any UI. The **waterfall**, in order:

1. gross yield (ghallah) →
2. **reserve stipulated maintenance (ṣiyāna) FIRST** →
3. deduct operating/management cost →
4. deduct **Nazir fee** (deed-set; default **10% of revenue** = ʿushr; basis configurable via `Setting`: `percent_of_revenue | percent_of_net_income | retainer`) ([BR-507](../brd/06-functional-requirements.md) deduction step) →
5. **distributable**.

The **entitlement resolver** applies the Shart-al-Waqif using tier (ṭabaqa) + line (ẓuhūr/buṭūn) + the **entitlement-order rule**: `ORDERED` (al-aʿlā fa-l-aʿlā — an upper tier excludes the next until extinct) vs `SHARED` (tashrik — all live tiers split together). A **direct-utilization** waqf produces **no monetary distribution**. **Distribution gates** (block a line if beneficiary KYC stale/unverified or category uncaptured; verify a licensed entity when it disburses; route a cross-border beneficiary to a dedicated path + Authority notice — [BR-511](../brd/06-functional-requirements.md)). **Timing**: default distribute within **3 months** of FYE when the Shart sets no schedule. Property invariants tested: distributed total + reserves + costs + fee = gross (no leakage); shares sum to 100% of distributable; ordered mode never pays an excluded lower tier while an upper tier is live.

> **Exit:** all three modes verified on the fixture (see [Verification plan](#end-to-end-verification-plan-fixture)); fast-check finds no waterfall leakage over 10k generated cases; a stale-KYC beneficiary is gated out with reason. **P0.**

### E7 · Compliance-task register, AML & governance — [BR-601](../brd/06-functional-requirements.md)–[BR-605](../brd/06-functional-requirements.md), [BR-607](../brd/06-functional-requirements.md), [BR-612](../brd/06-functional-requirements.md), [BR-606](../brd/06-functional-requirements.md)

**Templated compliance-task register** generated from the regulation's ~30 sub-obligations ([`unified-framework.md`](../../domain/unified-framework.md)), tagged financial/operational/government-legal, **filtered by classification**, with status/owner/dates/notes ([BR-601](../brd/06-functional-requirements.md)); **Authority registration/updates** as deadline-bearing tasks ([BR-602](../brd/06-functional-requirements.md)); **government-platform filing statuses** as **manual status fields** — Awqaf Digital, Baladi, Istihkam, Muqeem, Qiwa, Ejar (no live API) ([BR-603](../brd/06-functional-requirements.md)); **AML/CTF SAR** recording with the detailed report + FIU follow-ups under a strict **no-tipping-off** compartment (restricted visibility, no subject alert) ([BR-604](../brd/06-functional-requirements.md)); **beneficial-owner records** as obligations ([BR-605](../brd/06-functional-requirements.md)); **internal bylaws for Large/Medium** ([BR-606](../brd/06-functional-requirements.md)); **legal & judicial case management** ([BR-612](../brd/06-functional-requirements.md)); audit trail on all of it ([BR-607](../brd/06-functional-requirements.md)).

> **Exit:** the fixture's medium waqf generates the class-gated task set; an AML SAR is visible only to the compartment and generates no notification to the subject; filing statuses persist as manual fields with evidence. **P0** (601–605, 607); **P1** (606, 612).

### E8 · Deadline & notification engine — [BR-1001](../brd/06-functional-requirements.md)–[BR-1003](../brd/06-functional-requirements.md), [BR-1004](../brd/06-functional-requirements.md)/[1005](../brd/06-functional-requirements.md)

`apps/worker` + **pg-boss** on **Railway Cron**: compute statutory dates on the KSA business-day calendar — **register 30 bd**, **update 15 bd**, **istibdal notice 10 bd**, **distribute within 3 months of FYE** ([BR-1001](../brd/06-functional-requirements.md)); trigger the 15-bd update on certificate expiry / material change ([BR-1002](../brd/06-functional-requirements.md)); Hijri + Gregorian throughout ([BR-1003](../brd/06-functional-requirements.md)); reminders ahead of each deadline; **escalation** of overdue/at-risk obligations ([BR-1004](../brd/06-functional-requirements.md)); KYC-refresh / certificate / cadence reminders ([BR-1005](../brd/06-functional-requirements.md)). Jobs are idempotent and audited.

> **Exit:** a deadline falling on a Friday and again on a seeded Hijri holiday rolls to the next business day correctly; a due reminder fires exactly once; re-running the cron is idempotent. **P0** (1001–1003); **P1** (1004, 1005).

### E9 · Document vault — [BR-701](../brd/06-functional-requirements.md)–[BR-702](../brd/06-functional-requirements.md), [BR-703](../brd/06-functional-requirements.md)

Structured per-endowment vault (deed, certificate, title deeds, trusteeship deeds, leases, valuations, financials, KYC/AML files, correspondence) ([BR-701](../brd/06-functional-requirements.md)); **retention ≥10 years** via object-lock, an access matrix, and full audit trail on every read/write ([BR-702](../brd/06-functional-requirements.md), [NFR-07](../brd/08-nonfunctional-requirements.md)); **versioning + metadata** (type/endowment/date/source/confidentiality) ([BR-703](../brd/06-functional-requirements.md)). Storage via `packages/storage` (MinIO dev, S3 prod) with presigned URLs.

> **Exit:** a document is retrievable, its reads are audited, and a delete before the retention window is refused. **P0** (701, 702); **P1** (703).

### E10 · Dashboards — [BR-901](../brd/06-functional-requirements.md)–[BR-902](../brd/06-functional-requirements.md)

**Compliance dashboard** (regulatory deadlines, KYC freshness, AML alerts, filing statuses, decisions required — surfacing the five **zero-tolerance KPIs**) ([BR-901](../brd/06-functional-requirements.md)); **financial dashboard** (cash position, revenue/expense, distributions, arrears; class-appropriate statements) ([BR-902](../brd/06-functional-requirements.md)). Light-neu product UI per [`./design/DESIGN.md`](./design/DESIGN.md); the accent "thread" stays under 10% of the composition.

> **Exit:** both dashboards render live fixture data; an overdue Authority update lights the KPI red. **P0.**

### E11 · Onboarding gates, reserved-matter workflow & first-client migration — [BR-1101](../brd/06-functional-requirements.md)–[BR-1103](../brd/06-functional-requirements.md), [BR-1106](../brd/06-functional-requirements.md)

The **gated onboarding** state machine (Gate 01 Authority & Legal → Gate 02 Systems & Controls → Gate 03 People/Property/Cadence) that **blocks downstream activity until the prior gate clears** ([BR-1101](../brd/06-functional-requirements.md)); the full **reserved-matter approval workflow** (written principal approval + counsel review + competent-authority approval/notice where required, before execution) building on E3's skeleton ([BR-1102](../brd/06-functional-requirements.md)); the **RACI** encoded so approvals/notifications route correctly and accountability stays with the Nazir ([BR-1103](../brd/06-functional-requirements.md)); and the **residency-guarded first-client migration** tooling — importers for endowments/beneficiaries/documents/financials that **hard-fail** unless a KSA-resident prod exists (see guardrail) ([BR-1106](../brd/06-functional-requirements.md)).

> **Exit:** a distribution run is blocked while Gate 02 is incomplete; a reserved matter cannot execute without all three approvals recorded; the importer refuses to run against a non-KSA / non-fixture target. **P0.**

### E12 · Hardening & regulator/auditor export — [BR-906](../brd/06-functional-requirements.md) *(baseline)*, [NFR-10](../brd/08-nonfunctional-requirements.md)–[NFR-12](../brd/08-nonfunctional-requirements.md)

Thin **REST/OpenAPI** adapter over the tRPC layer for regulator/auditor **evidence-pack exports** produced without engineering effort ([NFR-12](../brd/08-nonfunctional-requirements.md), [BR-906](../brd/06-functional-requirements.md) baseline); **light-theme printable statements** (Arabic financial statement, per-beneficiary distribution statement); availability/reliability hardening and no-silent-data-loss checks ([NFR-10](../brd/08-nonfunctional-requirements.md)); accessibility pass on the ops app ([NFR-11](../brd/08-nonfunctional-requirements.md)). Security review and penetration-test checklist before any real data is contemplated.

> **Exit:** an auditor export downloads via the REST endpoint with an audit record of who exported what; a print statement renders correctly in Arabic (RTL) light theme. **P1.**

---

## Deployment topology (Railway)

**Now:** Railway. **Production (real client data): deferred to KSA-resident infra** ([NFR-03](../brd/08-nonfunctional-requirements.md)). Two Railway environments — **dev** and **staging** — both `DATA_CLASSIFICATION=fixture-only`.

| Service | What | Notes |
|---|---|---|
| **web** | Next.js ops app | Public over TLS; better-auth sessions. |
| **worker** | pg-boss runner | Deadline/notification jobs; **Railway Cron** schedules. |
| **postgres** | PostgreSQL | Append-only audit role + trigger applied by migration. |
| **minio** | S3-compatible object store | Vault documents; object-lock for retention. |

Config via zod-validated env in `packages/config`; secrets in Railway secret store, never in the repo ([NFR-06](../brd/08-nonfunctional-requirements.md)). No real client data touches any Railway environment.

### CI/CD pipeline (GitHub Actions)

Ordered, fail-fast; deploy only from `main` and only after everything below is green:

```
typecheck → lint → unit (+ fast-check property tests) → build
  → integration (ephemeral Postgres service container, prisma migrate + seed)
  → Playwright e2e (web, ar + en)
  → deploy staging  +  prisma migrate deploy
```

- **Ephemeral Postgres** for integration so migrations + fixture seed are exercised every run.
- **`prisma migrate deploy`** runs against staging on deploy; migrations are reviewed, never `db push` in CI.
- A dedicated CI step asserts the **residency guardrail** (below) — the build fails if it can be defeated.
- Turbo remote cache keeps the pipeline fast; the audit-immutability and distribution-invariant tests are **not** cache-skippable on `main`.

---

## Residency guardrail ([NFR-03](../brd/08-nonfunctional-requirements.md))

Until a KSA-resident production environment exists, **only the anonymized fixture may exist in any Railway environment**, and real client data never touches non-KSA infrastructure. Enforced in four independent layers so no single mistake can leak real data:

1. **Env flag.** `DATA_CLASSIFICATION` (`fixture-only` | `production`) is required and zod-validated at boot; the app refuses to start without it.
2. **Seed refuses.** The fixture seed aborts unless `DATA_CLASSIFICATION=fixture-only`; it will not load anything but `sample-waqf.json`.
3. **Import hard-fails.** The first-client migration/import tooling ([BR-1106](../brd/06-functional-requirements.md)) **hard-fails** unless `DATA_CLASSIFICATION=production` **and** the target is a KSA-resident host — so it can never run against Railway.
4. **CI check.** A CI job proves (2) and (3): it asserts the seed rejects non-fixture input and the importer rejects a non-KSA target; failure blocks the pipeline.

> **This guardrail is a release gate.** It is verified in the [end-to-end plan](#end-to-end-verification-plan-fixture) and re-checked before every deploy.

---

## Per-feature Definition of Done

A feature is **not done** until *every* box is checked. This is the checklist reviewers apply on each PR.

- [ ] **Requirements traced** — the PR names the BR-###/NFR-## it lands; behavior matches the PRD section.
- [ ] **Domain logic pure & tested** — engine code lives in `packages/domain` with no internal imports; unit-tested, and **property-tested** (fast-check) where invariants exist (money, shares, dates).
- [ ] **Types & validation** — end-to-end TypeScript; all inputs validated with zod; money is `Decimal(18,2)`, never a float ([NFR-08](../brd/08-nonfunctional-requirements.md)).
- [ ] **Access enforced** — the feature goes through the tRPC procedure ladder; endowment scoping + beneficiary isolation verified; AML compartment respected where relevant ([NFR-05](../brd/08-nonfunctional-requirements.md)).
- [ ] **Audit emitted** — every material write/approval/access produces an immutable audit event (who/what/when/before/after) ([NFR-04](../brd/08-nonfunctional-requirements.md), [BR-607](../brd/06-functional-requirements.md)).
- [ ] **Maker-checker** — money movements & filings enforce initiator ≠ approver; Nazir signature captured ([NFR-08](../brd/08-nonfunctional-requirements.md), [BR-506](../brd/06-functional-requirements.md)).
- [ ] **Bilingual + RTL** — all copy in `packages/i18n` (ar + en); UI correct in RTL via logical CSS; official financial records stored in Arabic ([NFR-01](../brd/08-nonfunctional-requirements.md)).
- [ ] **Dual calendar** — any date is Hijri + Gregorian; statutory dates computed on the KSA business-day calendar ([NFR-02](../brd/08-nonfunctional-requirements.md), [BR-1003](../brd/06-functional-requirements.md)).
- [ ] **Configurable, not hard-coded** — fee basis, thresholds, deadline windows, cadence read from `Setting` ([NFR-13](../brd/08-nonfunctional-requirements.md)).
- [ ] **Acceptance criteria** — Given/When/Then cover happy path + edge + error + empty state, encoded as tests.
- [ ] **Design fidelity** — matches [`./design/DESIGN.md`](./design/DESIGN.md) tokens (light-neu default; accent < 10%; **affordance never shadow-only**); flat report theme correct for any printable output.
- [ ] **Residency-safe** — no path can introduce non-fixture data into a Railway env; new import surfaces respect the guardrail.
- [ ] **CI green** — typecheck, lint, unit/property, integration, e2e all pass; no cache-skipped critical test on `main`.

---

## Zero-tolerance release gates

No build ships (dev → staging, and later staging → KSA prod) unless **all** of these are demonstrably green. They mirror the operating-model's five **zero-tolerance KPIs** and the mandate's non-negotiable controls. A red gate blocks release with no override.

| Gate | Assertion | Grounded in |
|---|---|---|
| **G-1 · Audit immutable** | `UPDATE`/`DELETE` on `audit_event` fails at the DB layer; every material action leaves a before/after record. | [NFR-04](../brd/08-nonfunctional-requirements.md), [BR-607](../brd/06-functional-requirements.md) |
| **G-2 · No commingling** | No transaction can reference an account outside its own endowment; cross-endowment/personal mixing rejected. | [BR-501](../brd/06-functional-requirements.md), KPI 2 |
| **G-3 · Maker ≠ checker** | Money movements & filings cannot be self-approved; Nazir signature required. | [NFR-08](../brd/08-nonfunctional-requirements.md), [BR-506](../brd/06-functional-requirements.md) |
| **G-4 · KYC gates distribution** | A stale/unverified/uncategorized beneficiary is blocked from any distribution line, with reason. | [BR-206](../brd/06-functional-requirements.md), [BR-505](../brd/06-functional-requirements.md), KPI 3 |
| **G-5 · No missed statutory deadline** | The deadline engine computes 30/15/10-bd + 3-month dates correctly across weekends & Hijri holidays and reminds ahead. | [BR-1001](../brd/06-functional-requirements.md)–[1003](../brd/06-functional-requirements.md), KPI 1 |
| **G-6 · AML no-tipping-off** | A SAR is visible only to the compartment; no notification reaches the subject. | [BR-604](../brd/06-functional-requirements.md), [NFR-05](../brd/08-nonfunctional-requirements.md), KPI 4 |
| **G-7 · Access matrix holds** | A caller without a grant is denied; a beneficiary sees only their own data. | [NFR-05](../brd/08-nonfunctional-requirements.md), [BR-210](../brd/06-functional-requirements.md) |
| **G-8 · Residency guardrail** | Seed refuses non-fixture; importer refuses non-KSA target; CI proves both. | [NFR-03](../brd/08-nonfunctional-requirements.md), [BR-1106](../brd/06-functional-requirements.md) |
| **G-9 · Distribution integrity** | Waterfall conserves value (no leakage); shares sum correctly; ordered mode excludes lower tiers while upper live. | [BR-505](../brd/06-functional-requirements.md), [NFR-14](../brd/08-nonfunctional-requirements.md) |
| **G-10 · Licensed real-estate activity** | No regulated real-estate action is recorded against an unlicensed party. | KPI 5, [BR-305](../brd/06-functional-requirements.md) *(enforced when P3 lands; asserted as a data constraint now)* |

---

## End-to-end verification plan (fixture)

The go-live proof. Run entirely against [`data/fixtures/sample-waqf.json`](../../../data/fixtures/sample-waqf.json) (four endowments, three waqifs) — never real data. Each scenario is a Given/When/Then encoded as an automated test (Playwright for UI paths, integration tests for engine + DB paths), and each maps to a release gate.

### V-1 · Ordered distribution (al-aʿlā fa-l-aʿlā) — G-9

- **Given** the fixture's `ordered` medium endowment (`waqf-001`) with a live upper tier and a lower tier,
- **When** a distribution run is computed for a fiscal year with gross yield, a stipulated maintenance reserve, operating cost, and the default 10%-of-revenue Nazir fee,
- **Then** maintenance is reserved first, then operating cost, then the Nazir fee are deducted in that order; only the live upper tier receives shares; the lower tier receives nothing while the upper is extant; and (distributed + reserve + cost + fee) exactly equals gross.

### V-2 · Shared distribution (tashrik) — G-9

- **Given** the fixture's `shared` small endowment (`waqf-002`),
- **When** a distribution run is computed,
- **Then** all live tiers split the distributable together per the Shart, shares sum to 100% of distributable, and no value leaks.

### V-3 · Direct-utilization — G-9

- **Given** a direct-utilization endowment,
- **When** a distribution is attempted,
- **Then** the engine produces **no monetary distribution** and records that beneficiaries use the asset itself.

### V-4 · Hijri deadline across weekend + holiday — G-5

- **Given** a material change with a 15-business-day update obligation dated so the naive due date lands on a **Friday** and a subsequent one on a seeded **Hijri-moving holiday**,
- **When** the deadline engine computes the due date on the KSA calendar (Sun–Thu workweek),
- **Then** it rolls forward to the next business day in both cases, shows Hijri + Gregorian, and a reminder fires exactly once ahead of it (idempotent on cron re-run).

### V-5 · Access-matrix denial + beneficiary isolation — G-7

- **Given** a staff user with no grant on `waqf-003` and a beneficiary principal of `waqf-001`,
- **When** each requests `waqf-003`'s beneficiary data,
- **Then** both are denied; the beneficiary can read only their own record; both denied attempts are audited.

### V-6 · Maker-checker on a money movement — G-3

- **Given** a distribution run prepared by a maker,
- **When** the same user attempts to approve it,
- **Then** approval is rejected (initiator ≠ approver); a distinct checker approves and the Nazir signs; each step is audited.

### V-7 · Audit immutability — G-1

- **Given** any material action from V-1…V-6 has written audit rows,
- **When** a privileged operator attempts `UPDATE`/`DELETE` on `audit_event`,
- **Then** the DB refuses (INSERT-only role + trigger) and the attempt itself is recorded.

### V-8 · Arabic financial statement + light-theme print — G-9 support, [NFR-01](../brd/08-nonfunctional-requirements.md)

- **Given** posted revenue/expense transactions on `waqf-001`,
- **When** a financial statement and a per-beneficiary distribution statement are produced,
- **Then** official records render in Arabic (RTL), SAR uses Latin digits with tabular-nums, and the printable output uses the light theme correctly.

### V-9 · Configurability without code change — [NFR-13](../brd/08-nonfunctional-requirements.md)

- **Given** the fee basis defaulted to `percent_of_revenue` at 10%,
- **When** an authorized user changes the basis to `percent_of_net_income` via `Setting` (no deploy),
- **Then** the next distribution run applies the new basis, the old runs are unchanged, and the change is audited.

### V-10 · AML no-tipping-off — G-6

- **Given** a SAR recorded against a beneficiary,
- **When** users outside the AML compartment view that beneficiary and the beneficiary views their own portal,
- **Then** the SAR is invisible to all of them and no notification is generated to the subject; only the compartment sees it.

### V-11 · Onboarding gate blocks downstream — G-8 support, [BR-1101](../brd/06-functional-requirements.md)

- **Given** Gate 02 (Systems & Controls) incomplete,
- **When** a distribution run or an Authority filing is attempted,
- **Then** it is blocked with a clear gate-not-cleared reason; completing the gate unblocks it.

### V-12 · Residency guardrail — G-8

- **Given** a Railway environment with `DATA_CLASSIFICATION=fixture-only`,
- **When** the fixture seed runs and, separately, the first-client importer is pointed at this environment,
- **Then** the seed loads only fixture data and the importer **hard-fails** (non-KSA / non-production target); CI reproduces both failures.

---

## Open questions

Routed to [16 · Open questions](./16-open-questions.md):

- **KSA-resident hosting target & cutover** — which provider/region satisfies residency + rapid retrieval ([NFR-03](../brd/08-nonfunctional-requirements.md)/[07](../brd/08-nonfunctional-requirements.md)), and the migration plan off Railway before any real client data. Blocks the staging→prod gate.
- **Availability/reliability targets** ([NFR-10](../brd/08-nonfunctional-requirements.md)) and **accessibility conformance level** ([NFR-11](../brd/08-nonfunctional-requirements.md)) — measurable numbers are TBD in design; the DoD checks presence, not a threshold, until set.
- **HQ address (Riyadh vs. Jeddah)** and **display typeface** — unresolved in source material; do not bake either into printable statements (V-8) until confirmed with QMULATE.
- **Seeded Hijri holiday calendar source of truth** — which authority list feeds `HolidayCalendar`, and its update cadence, so V-4 stays accurate year to year. ⊕ **S11-1 (2026-09-02) sharpened this item with a MEASURED edge:** the engine can only answer for dates between the FIRST and LAST observed holiday ROW (`assembleCalendar` derives coverage from the rows, "never wider than them" — fail-closed and correct), so a loaded year whose first listed holiday is in late February leaves January and February UNANSWERABLE (`CALENDAR_UNAVAILABLE`) while every human involved says "we have that year loaded". On the fixture the answerable window is 2026-02-22 → 2028-09-23, not the seed constant's 2026-01-01 → 2028-12-31. **So the source-of-truth decision must fix not only WHICH years are loaded but the FRONT and BACK edges within each loaded year** — a statutory duty whose window opens in that gap is a deadline the system declines to compute.

---

## Requirements covered

- **Functional (P0):** [BR-101](../brd/06-functional-requirements.md)–[BR-105](../brd/06-functional-requirements.md), [BR-109](../brd/06-functional-requirements.md) *(endowment/deed/classification/hierarchy/eligibility)* · [BR-201](../brd/06-functional-requirements.md)–[BR-206](../brd/06-functional-requirements.md), [BR-210](../brd/06-functional-requirements.md) *(beneficiary/UBO/KYC/isolation)* · [BR-301](../brd/06-functional-requirements.md), [BR-306](../brd/06-functional-requirements.md) *(asset register, reserved-matter flag)* · [BR-501](../brd/06-functional-requirements.md)–[BR-503](../brd/06-functional-requirements.md), [BR-505](../brd/06-functional-requirements.md), [BR-506](../brd/06-functional-requirements.md), [BR-507](../brd/06-functional-requirements.md) *(deduction step)*, [BR-511](../brd/06-functional-requirements.md), [BR-611](../brd/06-functional-requirements.md) *(financial core + distribution engine)* · [BR-601](../brd/06-functional-requirements.md)–[BR-605](../brd/06-functional-requirements.md), [BR-607](../brd/06-functional-requirements.md) *(compliance/AML/audit)* · [BR-701](../brd/06-functional-requirements.md), [BR-702](../brd/06-functional-requirements.md) *(vault/retention)* · [BR-901](../brd/06-functional-requirements.md), [BR-902](../brd/06-functional-requirements.md) *(dashboards)* · [BR-1001](../brd/06-functional-requirements.md)–[BR-1003](../brd/06-functional-requirements.md) *(deadline engine)* · [BR-1101](../brd/06-functional-requirements.md)–[BR-1103](../brd/06-functional-requirements.md), [BR-1106](../brd/06-functional-requirements.md) *(gates/reserved-matter/RACI/migration)*.
- **Functional (P1):** [BR-208](../brd/06-functional-requirements.md), [BR-606](../brd/06-functional-requirements.md), [BR-612](../brd/06-functional-requirements.md), [BR-703](../brd/06-functional-requirements.md), [BR-1004](../brd/06-functional-requirements.md), [BR-1005](../brd/06-functional-requirements.md), [BR-906](../brd/06-functional-requirements.md) *(baseline export)*.
- **Functional (asserted-as-constraint now, workflow deferred):** [BR-305](../brd/06-functional-requirements.md) *(licensed-party constraint, KPI 5)* · Expropriation entity ([BR-401](../brd/06-functional-requirements.md)) modeled without workflow.
- **Non-functional:** [NFR-01](../brd/08-nonfunctional-requirements.md)–[NFR-14](../brd/08-nonfunctional-requirements.md) — all fourteen are exercised by the DoD checklist, the release gates, and the verification plan (residency [NFR-03](../brd/08-nonfunctional-requirements.md); audit [NFR-04](../brd/08-nonfunctional-requirements.md); access matrix [NFR-05](../brd/08-nonfunctional-requirements.md); money/SoD [NFR-08](../brd/08-nonfunctional-requirements.md); configurability [NFR-13](../brd/08-nonfunctional-requirements.md); reconciliation integrity [NFR-14](../brd/08-nonfunctional-requirements.md) prominent among them).
