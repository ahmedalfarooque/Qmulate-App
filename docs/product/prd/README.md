# QMULATE — Product Requirements Document (PRD)

**The build spec.** This is the technology-specific plan for how QMULATE's endowment-management platform is
built — the data shapes, engine rules, screens, APIs, and acceptance criteria that Claude Code implements
from. Where the [BRD](../brd/README.md) says **what** and **why**, the PRD says **how** and **build**.

> Status: **Draft v0.1** · Privileged & Confidential · Owner: TBD · Created 2026-07-14.

## How to read this

Read the index first, then jump to the section you're building. Every section is a standalone, build-ready
file: it opens with its purpose, states decisions as decided (the stack is locked — see below), specifies
data/engine/screen detail, and ends with **Given/When/Then** acceptance criteria and a `## Requirements
covered` list of the `BR-###`/`NFR-##` ids it satisfies. Read the design system ([design/DESIGN.md](design/DESIGN.md))
before building any UI.

The section numbering **mirrors the [BRD](../brd/README.md)** (00–18) so a BRD section and its PRD build-spec
share a number where they align. Sections marked **[EXT]** go beyond a vanilla PRD skeleton — they are the
domain-hard specs (data model, the two engines, access matrix, localization, security, build/ship).

| # | Section | What it specifies |
|---|---|---|
| 00 | [Document control](00-document-control.md) | Version, status, classification, the BR→PRD traceability rule, change log. |
| 01 | [Problem statement](01-problem-statement.md) | The regulated, deadline-driven, personally-liable Nazir role vs. today's SharePoint/spreadsheet reality. |
| 02 | [Goals & success metrics](02-goals-metrics.md) | Measurable goals G1–G6 + leading/lagging metrics tied to the five zero-tolerance KPIs. |
| 03 | [Non-goals](03-non-goals.md) | Explicit exclusions: portal→Phase 2, property/expropriation→Phase 3, no live integrations, no advice, not replacing Nazir liability. |
| 04 | [Personas & user stories](04-personas-user-stories.md) | Internal (Nazir, Case Manager, Finance, Legal/Compliance, Admin) + portal (Family Board, Beneficiary) personas; prioritized stories with edge/error/empty states. |
| 05 | [Scope, phasing & priority](05-scope-phasing-priority.md) | The 3-phase map and the ruthless Phase-1 **P0/P1/P2** cut with reasoning. |
| 06 | [Functional requirements](06-functional-requirements.md) | Build-level realization of every `BR-###`, by module, with **Given/When/Then** acceptance criteria. |
| 07 | [Data model spec](07-data-model-spec.md) **[EXT]** | Prisma schema: Client→Waqif→Waqf hierarchy, deeds, assets, beneficiaries/UBO, transactions, distributions, fee, tasks, filings, documents, expropriation, audit, access. Money as `Decimal(18,2)`; dual Hijri/Gregorian dates. |
| 08 | [Distribution engine spec](08-distribution-engine-spec.md) **[EXT]** | `packages/domain`: the ghallah waterfall (ṣiyāna → cost → Nazir fee → distributable) and the tier (ṭabaqa) / line (ẓuhūr–buṭūn) entitlement resolver (ORDERED vs SHARED), gates, timing, controls. |
| 09 | [Compliance & deadline engine spec](09-compliance-deadline-engine-spec.md) **[EXT]** | ~30 sub-obligations, classification gating, statutory deadlines (30/15/10 bd, 3-month) in Umm-al-Qura Hijri + Gregorian KSA business days, and the AML/no-tipping-off sub-engine. |
| 10 | [Roles, permissions & access matrix](10-roles-access-matrix-spec.md) **[EXT]** | RBAC, the per-endowment access matrix, beneficiary self-isolation, segregation of duties (maker ≠ checker), delegation, AML-restricted visibility, RACI routing. |
| 11 | [Localization spec](11-localization-spec.md) **[EXT]** | Arabic-authoritative data, true RTL via logical properties, dual Hijri/Gregorian, SAR with Latin tabular-nums; the typeface + HQ-city publish-blockers. |
| 12 | [Security, audit & retention spec](12-security-audit-retention-spec.md) **[EXT]** | Immutable append-only audit trail (who/what/when/before/after), encryption, ≥10-year retention, KSA data residency + PDPL, the `fixture-only` guardrail. |
| 13 | [UX, screens & design-system reference](13-ux-designsystem-reference.md) **[EXT]** | Screen inventory & flows for the internal ops app (portal is Phase 2), with empty/loading/error/RTL states; links [DESIGN.md](design/DESIGN.md). |
| 14 | [Reporting & dashboards spec](14-reporting-dashboards-spec.md) | Compliance dashboard (the five KPIs) + class-appropriate financial reporting + evidence-pack export. |
| 15 | [Non-functional requirements](15-nonfunctional-requirements.md) | `NFR-01`–`NFR-14` turned into measurable design targets (availability, performance, accessibility, configurability). |
| 16 | [Open questions & decisions](16-open-questions.md) | Genuinely undecided items tagged by owner; the carried defaults (decided-unless-overridden). |
| 17 | [Build & ship / Definition of Done](17-build-ship-dod.md) **[EXT]** | Monorepo layout, epics **E0–E12**, Railway deployment, CI, the residency guardrail, per-feature DoD + end-to-end verification. |
| 18 | [Appendices](18-appendices.md) | **Reverse traceability matrix** (`BR-###`/`NFR-##` → PRD section → status), glossary & regulation pointers. |
| — | [design/DESIGN.md](design/DESIGN.md) | The design system: light-first neumorphic tokens, typography (Outfit · Geist Mono · IBM Plex Sans Arabic), RTL, flat report theme for print. |

## Scope in one line

An end-to-end **TypeScript monorepo** — Next.js internal operations app, Expo beneficiary portal, tRPC API,
Prisma/PostgreSQL, pure-TS domain engines — that lets QMULATE perform professional **Nazarah** under the
General Authority for Awqaf and **never miss a statutory duty**. **Phase 1 first**: the compliance &
operations core, including the distribution engine.

## The PRD ↔ BRD contract

The PRD **adds design and build detail; it never overrides business intent.** This ordering is binding:

1. **Business intent** lives in the [BRD](../brd/README.md) — the `BR-101`–`BR-1106` corpus (81 enumerated
   functional ids; the BRD intro rounds this to "72") + `NFR-01`–`NFR-14`. If a PRD decision would change
   what a requirement *means* or *achieves*, that is a BRD change, not a PRD change — raise it, don't silently
   redefine it here.
2. **Law governs above all.** On any question of Saudi Awqaf / Nazarah / AML obligation, the controlling
   authorities are, in order: **the Arabic regulation originals** ([`../../domain/regulations/`](../../domain/regulations/)),
   **Saudi counsel**, then the BRD's reading of them. The PRD implements that reading; it is never itself a
   legal source. When code and regulation appear to conflict, the regulation wins and the section is wrong.
3. **The PRD decides HOW.** Data shapes, engine algorithms, screen flows, API contracts, and acceptance
   criteria are the PRD's to own and state decisively. The [locked technical decisions](17-build-ship-dod.md)
   (stack, monorepo layout, hosting, auth) are settled — sections state them as fact and do not re-litigate.

Do **not** restate BRD prose in the PRD. Cite requirements by id; specify the build.

## Citation convention

- **Requirements**: cite inline by id with a relative link, e.g. [BR-505](../brd/06-functional-requirements.md)
  or [NFR-04](../brd/08-nonfunctional-requirements.md). Never copy the requirement text — the id and link are
  the reference.
- **Domain terms**: link the glossary ([`../../domain/glossary.md`](../../domain/glossary.md)) rather than
  re-explaining. Keep Arabic domain vocabulary (waqf, waqif, Nazir, Nazarah, Mustahiq, ghallah, Shart
  al-Waqif, ṭabaqa, ẓuhūr/buṭūn, istibdal, ʿushr) — do not translate it away.
- **Regulation**: link [`../../domain/regulations/`](../../domain/regulations/) and
  [`../../domain/unified-framework.md`](../../domain/unified-framework.md); don't paraphrase the law inline.
- **Reverse traceability**: [18 · Appendices](18-appendices.md) holds the authoritative
  `BR-###`/`NFR-##` → PRD-section matrix, so every requirement can be traced to where it's built and every
  section can prove its coverage. The per-section `## Requirements covered` lists roll up into it.

## Confidentiality

> This PRD contains **no real client data.** Every example uses the invented shapes in
> [`data/fixtures/sample-waqf.json`](../../../data/fixtures/sample-waqf.json). Real client records (the first
> engagement — one family, 4 endowments, 3 waqifs) live only in the gitignored archive and never enter the
> PRD, fixtures, tests, or UI copy. A hard `DATA_CLASSIFICATION=fixture-only` guardrail keeps real data off
> non-KSA infrastructure until a KSA-resident production environment exists (see [15](15-nonfunctional-requirements.md)
> and [17](17-build-ship-dod.md)).

## Requirements covered

This index is the PRD↔BRD **contract and map**, not a requirement-bearing section — it introduces the full
`BR-101`–`BR-1106` and `NFR-01`–`NFR-14` corpus and points each to the section that builds it. Per-requirement
coverage is asserted in each numbered section's own `## Requirements covered` list and consolidated in the
reverse traceability matrix in [18 · Appendices](18-appendices.md).
