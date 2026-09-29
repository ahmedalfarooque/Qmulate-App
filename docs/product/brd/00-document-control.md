# 00 · Document Control

| Field | Value |
|---|---|
| Document | QMULATE Endowment-Management Platform — Business Requirements Document |
| Version | **0.1 — Draft for review** |
| Created | 2026-07-09 |
| Owner | TBD (QMULATE product owner) |
| Approvers | TBD (QMULATE leadership; Saudi counsel for regulatory points) |
| Status | Draft — pending stakeholder review |
| Classification | Privileged & Confidential — internal |

## Purpose & authority

This BRD is the **single source of truth for what the platform must do and why**. It is business-level and
**technology-agnostic**: it specifies requirements, not design. Data models, schemas, APIs, screen designs,
and the technology stack are deliberately **out of scope** and belong in later design documents (see
[10 · Assumptions](10-assumptions-open-questions.md)).

Where this BRD and other repo material conflict, this BRD governs **business requirements**; the
**regulations** ([`../../domain/regulations/`](../../domain/regulations/)) govern any point of law, and
**Saudi counsel** governs legal interpretation.

## Audience

QMULATE leadership; the product/build team; Saudi counsel (for regulatory requirements); and,
selectively, the Family Board and auditor as the accountability model matures.

## Intended use

- **Traceability:** implementation work references `BR-###` / `NFR-##` IDs.
- **Compliance assurance:** [07 · Compliance traceability](07-compliance-traceability.md) maps each
  regulatory obligation to a requirement, so nothing statutory is missed.
- **Scope control:** [03 · Vision & scope](03-vision-scope.md) and [11 · Roadmap](11-roadmap-phasing.md)
  define what is in this release vs later.

## Conventions

- Requirement IDs are **stable** — never renumber; deprecate instead.
- "**Must / Should / May**" follow MoSCoW-style priority, made explicit per requirement where it matters.
- Arabic domain terms are kept (Waqf, Nazir, Nazarah, Mustahiq, Ghallah, istibdal…) — see the glossary.
- "Nazarah/Nazir" = the official English translation's "Beholding/Beholder."

## Change log

| Version | Date | Author | Notes |
|---|---|---|---|
| 0.1 | 2026-07-09 | Claude (with QMULATE) | Initial draft from SharePoint engagement material, the Awqaf regulations, and the mandate memorandum. |
