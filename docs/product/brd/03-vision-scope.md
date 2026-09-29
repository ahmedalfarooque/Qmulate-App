# 03 · Vision & Scope

## Vision

The reference system for **governing family endowments as an institution** in the Kingdom — so a Nazir's
every statutory duty is tracked, enforced, evidenced, and reportable, and a family's endowment outlasts
its makers with its records intact.

## In scope (this release)

The **endowment / Nazarah management platform**, with an internal operations app **and** a client/
beneficiary portal, covering these capability areas (requirements in [06](06-functional-requirements.md)):

| Area | Requirement group |
|---|---|
| Endowment & deed management (incl. trusteeship deed: primary + authorized-representative) | `BR-1xx` |
| Beneficiary & UBO / KYC management (incl. family-tree lineage) | `BR-2xx` |
| Property / asset management (land deeds, leasing, maintenance, operations) | `BR-3xx` |
| **Expropriation** management (govt takings → compensation → istibdal) | `BR-4xx` |
| Financial management (accounts, revenue, expenses, budgets, reconciliation, distributions, Nazir fees/invoicing) | `BR-5xx` |
| Compliance & governance (Authority registration/updates, filings, AML/CTF, classification, audit trail) | `BR-6xx` |
| Document & records management (vault) | `BR-7xx` |
| Client & beneficiary portal | `BR-8xx` |
| Reporting & dashboards | `BR-9xx` |
| Notifications & the deadline engine | `BR-10xx` |
| Engagement lifecycle, RACI & reserved-matter approvals | `BR-11xx` |

> [!note] What "this release" means
> "This release" = **Phases 1–3** in [11 · Roadmap](11-roadmap-phasing.md) (compliance core → portal → property/expropriation), delivered incrementally behind the mandate's gates — not three separate releases. Phase 1 is the MVP.

## Out of scope (this release) → roadmap

- Broader **multi-asset family office** (equities, holding structures, non-waqf wealth governance).
- Non-endowment real-estate **brokerage/advisory** as a standalone line.
- Serving **businesses** and **individuals** segments (this release serves **families** with endowments).
- **Live/automated integrations** with government platforms — treated as **manual status tracking** (see
  [09](09-data-integration-landscape.md)); no public APIs are evidenced.
- Public marketing site (exists separately under `docs/brand/`).

See [11 · Roadmap](11-roadmap-phasing.md) for phasing.

## Explicit non-goals

- The platform does **not** replace the Nazir's legal accountability or Saudi counsel — it supports them.
- It does **not** give investment or legal advice; it records decisions and enforces process.
- It does **not** perform regulated real-estate activity itself — that is delivered by **licensed
  subcontractors** whose work it coordinates and evidences.

## Goals & success metrics (indicative — confirm with QMULATE)

| Goal | Metric |
|---|---|
| Never miss a statutory deadline | 100% of registration/update/substitution/distribution deadlines met on time |
| No commingling | 0 commingling incidents; every transaction on a dedicated waqf account |
| Beneficiary data always audit-ready | 100% of active beneficiaries with current KYC/UBO; 0 missed AML reports |
| Institutional record-keeping | Every distribution, filing, and reserved-matter decision reconstructable from the audit trail; records retained ≥ 10 years |
| Scalable onboarding | Onboard a new endowment in days, not months, via templated compliance tasks |
| Client trust | Beneficiaries self-serve verification & statements; quarterly/annual reporting produced from the system |

## Read next

[04 · Stakeholders & roles](04-stakeholders-roles.md).
