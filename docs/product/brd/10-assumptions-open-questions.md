# 10 · Assumptions, Constraints & Open Questions

## Assumptions

- **A1** — The MVP serves the **Families × endowment/Nazarah** cell; other segments/service lines are later.
- **A2** — Government platforms are **manual** touchpoints (no public APIs) for this release.
- **A3** — QMULATE is **advisory/supervisory/execution-coordination**; regulated real-estate work is done by
  **licensed subcontractors**; **legal accountability stays with the Nazir**.
- **A4** — The **regulation summaries** in `docs/domain/regulations/` are working references; **Saudi counsel
  and the Arabic originals govern** any point of law.
- **A5** — Both an **internal ops app and a client/beneficiary portal** are in scope from the start.

## Constraints

- **C1** — Hard **statutory deadlines** (30/15/10 business days; 3 months; ≥10-year retention) and
  **zero-tolerance controls** (no commingling, current KYC, AML reporting, licensed activity).
- **C2** — **Dedicated segregated bank accounts**; records **in Arabic**; **SOCPA-audited** statements for
  Large/Medium.
- **C3** — **PDPL** + Beneficial Ownership Standards govern personal data; KSA data residency.
- **C4** — **No real client data** in the repo's tracked files or fixtures (confidential; gitignored archive
  only).

## Open questions (decide before/at build)

| # | Question | Notes / default |
|---|---|---|
| Q1 | **Commercial model** — invoicing terms & SLA thresholds. | Nazir fee basis is **resolved**: this engagement's deed sets **10% of the waqf's revenue** (ʿushr); platform keeps it configurable (BR-507/508). Invoicing/SLA still **TBD with QMULATE.** |
| Q2 | **Endowment classification** of the first client's endowments (Large/Medium/Small/Direct). | "To be confirmed" in the mandate memo. Drives which obligations apply. |
| Q3 | **Registered office wording** — legal **Jeddah** (CR) vs brand **Riyadh**. | Use Jeddah where it has legal weight; confirm before any published address. See [company profile](../../company/company-profile.md). |
| Q4 | **Tech stack** — not chosen (default discussed: Next.js + Tailwind + Postgres/Prisma). | Out of BRD scope; noted for design. |
| Q5 | **Display typeface** — "Madani" vs Outfit (no delivered Madani font). | Brand/UI concern; see `docs/brand/`. |
| Q6 | **Waqf investment products list** — content not yet extracted. | BR-510 kept "Could." Re-extract the Arabic PDF. |
| Q7 | **Phasing of the portal** vs internal app — build in parallel or internal-first? | Roadmap ([11](11-roadmap-phasing.md)) proposes a phased default; **confirm.** |
| Q8 | **Which government platforms are actually used** for this client, and any that expose data feeds. | Assume manual; confirm per platform. |

## Read next

[11 · Roadmap & phasing](11-roadmap-phasing.md).
