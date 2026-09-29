# QMULATE — Business Requirements Document (BRD)

**The project "bible."** This is the authoritative, business-level specification for the QMULATE
endowment-management platform, grounded in the business model and the Saudi Awqaf / Nazarah regulatory
framework. Everything the build does should trace back to a requirement here.

> Status: **Draft v0.1 for review** · Owner: TBD · Created 2026-07-09. See [00-document-control.md](00-document-control.md).

## How to read this

Read in order; each file is one section. Requirements are numbered `BR-###` (functional) and `NFR-##`
(non-functional) and are referenced by ID elsewhere (roadmap, compliance matrix).

| # | Section | What it covers |
|---|---|---|
| 00 | [Document control](00-document-control.md) | Version, owner, audience, scope of authority, change log. |
| 01 | [Executive summary](01-executive-summary.md) | The one-page "why," what we're building, and for whom. |
| 02 | [Business context](02-business-context.md) | The company, the regulator, and the commercial/engagement model. |
| 03 | [Vision & scope](03-vision-scope.md) | In scope, out of scope / roadmap, goals & success metrics. |
| 04 | [Stakeholders & roles](04-stakeholders-roles.md) | Internal + external users, and a role × permission overview. |
| 05 | [Operating model](05-operating-model.md) | How QMULATE performs Nazarah — workstreams, lifecycle, key concepts. |
| 06 | [Functional requirements](06-functional-requirements.md) | Numbered `BR-###` requirements by module. |
| 07 | [Compliance traceability](07-compliance-traceability.md) | Every regulatory obligation → requirement ID. |
| 08 | [Non-functional requirements](08-nonfunctional-requirements.md) | `NFR-##`: bilingual, residency, security, audit, etc. |
| 09 | [Data & integration landscape](09-data-integration-landscape.md) | Government platforms, banks, documents (business-level). |
| 10 | [Assumptions & open questions](10-assumptions-open-questions.md) | What's assumed, constrained, or undecided. |
| 11 | [Roadmap & phasing](11-roadmap-phasing.md) | MoSCoW / phases; the MVP subset. |
| 12 | [Appendices](12-appendices.md) | Glossary, source register, regulation index. |

## Scope in one line

An **internal operations platform** for QMULATE to perform professional **Nazarah** (waqf trusteeship)
under the General Authority for Awqaf, **plus a client/beneficiary portal** — covering endowments, deeds,
beneficiaries/UBO, properties, expropriations, finances & distributions, Awqaf compliance, documents, and
reporting. Broader multi-asset family-office capability is **roadmap**, not this release.

## Grounding sources (the "why" behind requirements)

- Regulatory: [`../../domain/regulations/`](../../domain/regulations/) (Awqaf Law, Nazarah regulation EN/AR,
  Beneficial Ownership Standards) and [`../../domain/unified-framework.md`](../../domain/unified-framework.md).
- Business: [`../../company/operating-model.md`](../../company/operating-model.md),
  [`../../company/company-profile.md`](../../company/company-profile.md).
- Real engagement shape (confidential, gitignored): `archive/raw-intake/linga-waqf-case/`.
- Glossary: [`../../domain/`](../../domain/) and the Obsidian vault.

> [!important] Confidentiality
> This BRD contains **no real client data**. Examples use invented/anonymized data
> (`data/fixtures/sample-waqf.json`). Real client records live only in the gitignored archive.
