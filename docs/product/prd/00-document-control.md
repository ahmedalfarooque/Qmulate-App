# 00 · Document Control

The control sheet, authorship, and traceability rules that govern the QMULATE Product Requirements Document (PRD).

Status: Draft v0.1 · Privileged & Confidential

## Control sheet

| Field | Value |
|---|---|
| Document | QMULATE Endowment-Management Platform — Product Requirements Document (PRD) |
| Version | **0.1 — Draft for review** |
| Created | 2026-07-14 |
| Owner | TBD (QMULATE product owner) |
| Approvers | TBD (QMULATE leadership; engineering lead; Saudi counsel for regulatory points) |
| Status | Draft — pending stakeholder review |
| Classification | Privileged & Confidential — internal |
| Supersedes | None (first PRD revision) |
| Companion documents | [Business Requirements Document](../brd/00-document-control.md) · [Design System](./design/DESIGN.md) |

## Purpose & scope of this PRD

This PRD is the **single source of truth for how the platform is built**. Where the
[BRD](../brd/00-document-control.md) is business-level and technology-agnostic and states **what** the
platform must do and **why**, this PRD states **how** — data shapes, engine rules, screens, acceptance
criteria, and architecture — decisive enough that Claude Code can implement directly from it.

- The PRD **derives from and never contradicts** the BRD. If the two conflict on a business point, the BRD
  governs and the discrepancy is logged in [16 · Open questions](./16-open-questions.md).
- **Points of law** are governed by the regulations under [`../../domain/regulations/`](../../domain/regulations/);
  **legal interpretation** is governed by Saudi counsel. This PRD never overrides either.
- The **technical stack and platform decisions are settled** (see [Locked technical decisions](#locked-technical-decisions))
  and are stated as decided, not re-opened.

## Audience

QMULATE leadership; the engineering/build team (primary readers); Saudi counsel (for regulatory
requirements and their implementation); and, selectively, the auditor and Family Board as the
accountability model matures.

## The BR → PRD traceability rule

This is the binding rule of this document and applies to **every section of the PRD**:

> **Every PRD requirement, engine rule, screen behaviour, and acceptance criterion MUST cite at least one
> upstream `BR-###` or `NFR-##` identifier.** Nothing gets built that is not traceable to a business
> requirement. If build work appears necessary but has no BR/NFR anchor, do not invent a requirement here —
> raise it in [16 · Open questions](./16-open-questions.md) for the BRD owner to add upstream, then cite it.

Supporting conventions:

- **Cite inline via relative links**, e.g. [BR-505](../brd/06-functional-requirements.md) /
  [NFR-04](../brd/08-nonfunctional-requirements.md). Never copy BRD requirement prose into the PRD — link to it.
- **BR/NFR identifiers are stable and owned by the BRD.** The PRD never renumbers, redefines, or deprecates
  them; it only references them.
- Each PRD section **ends with a `## Requirements covered` list** enumerating the `BR-###`/`NFR-##` ids it
  addresses. The union of those lists is reconciled against the BRD's
  [compliance-traceability matrix](../brd/07-compliance-traceability.md) so no P0/P1 requirement is orphaned.
- **Phase tags** (P0 / P1 / P2) accompany requirements where scheduling matters, consistent with the
  [roadmap](../brd/11-roadmap-phasing.md). P0 = Phase-1 go-live blocker; deferred items are modelled but
  not built where the roadmap says so.
- Domain terms are **kept in Arabic** (waqf, waqif, Nazir, Nazarah, Mustahiq, ghallah, Shart al-Waqif,
  ṭabaqa, ẓuhūr/buṭūn, istibdal, ʿushr) and defined once in the [glossary](../../domain/glossary.md), not
  re-explained per section.
- Acceptance criteria are written **Given/When/Then**, covering happy path, edge, error, and empty states.

## Locked technical decisions

Stated here once as the canonical reference; individual sections assume these without re-litigating them.

- **Monorepo:** Turborepo + pnpm. Apps `apps/{web,mobile,worker}`; packages
  `packages/{domain,database,api,auth,storage,jobs,ui,i18n,config}`. `packages/domain` (pure-TS engines)
  imports nothing internal.
- **Stack:** Next.js (App Router) web · Expo (React Native) mobile portal (Phase 2, scaffolded day one) ·
  tRPC v11 first-party API + thin REST/OpenAPI for regulator/auditor exports · Prisma + PostgreSQL
  (money as `Decimal(18,2)`, never floats) · better-auth self-hosted (email/password + TOTP for
  money/filing roles) · next-intl / i18next + `packages/i18n` · `@umalqura/core` for Umm-al-Qura Hijri +
  KSA business-day calculator · zod · pg-boss jobs in `apps/worker` on Railway Cron · S3-compatible
  storage via `packages/storage`.
- **Hosting & residency:** Railway now; **KSA data residency + PDPL deferred to before production**. Hard
  guardrail — until a KSA-resident prod exists, only the anonymized fixture may exist in any Railway env
  (`DATA_CLASSIFICATION=fixture-only`; seed refuses non-fixture; import tooling hard-fails; CI check). Real
  client data never touches non-KSA infra.
- **Scope order:** Build **Phase 1 first** (compliance & operations core, including the distribution engine).

## Confidentiality & data handling

- **Privileged & Confidential — internal.** Do not distribute outside the audience above without the owner's approval.
- The PRD **never contains real client data** — names, deed numbers, bank details, or beneficiary records.
  All illustrative data derives from the shapes in
  [`data/fixtures/sample-waqf.json`](../../../data/fixtures/sample-waqf.json). The confidential reference case
  under `archive/raw-intake/` is off-limits as a source for any content in this document.

## Reference pointers

| Need | Go to |
|---|---|
| Business requirements (BR-###) | [06 · Functional requirements](../brd/06-functional-requirements.md) |
| Non-functional requirements (NFR-##) | [08 · Non-functional requirements](../brd/08-nonfunctional-requirements.md) |
| Regulatory obligation ↔ requirement map | [07 · Compliance traceability](../brd/07-compliance-traceability.md) |
| Data & integration landscape (manual filing statuses) | [09 · Data & integration landscape](../brd/09-data-integration-landscape.md) |
| Assumptions & open questions (BRD) | [10 · Assumptions & open questions](../brd/10-assumptions-open-questions.md) |
| Roadmap & phasing (P0/P1/P2) | [11 · Roadmap & phasing](../brd/11-roadmap-phasing.md) |
| Domain glossary (tiers/lines, entitlement order) | [glossary](../../domain/glossary.md) |
| The ~30 sub-obligations framework | [unified framework](../../domain/unified-framework.md) |
| Regulations (points of law) | [`regulations/`](../../domain/regulations/) |
| Operating model (RACI, gates, zero-tolerance KPIs) | [operating model](../../company/operating-model.md) |
| Entity shapes for dev/seed data | [`sample-waqf.json`](../../../data/fixtures/sample-waqf.json) |
| Design tokens & UI system | [Design System](./design/DESIGN.md) |
| PRD-level open questions | [16 · Open questions](./16-open-questions.md) |

## Change log

| Version | Date | Author | Notes |
|---|---|---|---|
| 0.1 | 2026-07-14 | Claude (with QMULATE) | Initial PRD draft. Establishes control sheet, BR→PRD traceability rule, locked technical decisions, confidentiality handling, and reference pointers, derived from the BRD (v0.1) and domain docs. |

## Requirements covered

This is a governance/control section; it defines the rules by which all other sections cite requirements
rather than implementing a specific `BR-###`/`NFR-##`. It anchors to the traceability and quality-attribute
baseline that binds the whole PRD:

- [NFR-01](../brd/08-nonfunctional-requirements.md) — auditability / traceability baseline the BR→PRD rule enforces.
- [NFR-06](../brd/08-nonfunctional-requirements.md) — data residency / confidentiality guardrail reflected in the fixture-only rule.
