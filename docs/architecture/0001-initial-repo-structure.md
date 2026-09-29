# QMULATE — Folder Audit & Recommended Structure for a Claude Code SaaS Build

## 1. What's actually in the folder today

The connected folder holds three top-level directories, ~77MB and ~350 files total, and **no application code** — everything here is brand collateral, business/domain reference material, and one real client's operating data.

**`QMULATE Code/`** — a git repo (initialized, zero commits, no remote — see `MOVED.md`, which documents a path migration from an old Documents location). It contains exactly one piece of "code": `scripts/build_qmulate_brand.py`, a script that renders the brand guidelines PDF into cropped image assets, regenerates a "v2" brand book PDF, and outputs a 5-page static HTML/CSS marketing site (home, approach, services, contact). This is brand tooling, not a product.

**`QMULATE downloads/`** — three files (`QMULATE — Brand Guidelines.pdf`, `Qmulate · Brand Guidelines 2 .pdf`, `QMULATE_One_Pager_EN_AR.docx`) that are byte-for-byte identical (checksum-verified) to copies already in `Qmulate/`. Safe to delete outright.

**`Qmulate/`** — the substantive content:
- Brand identity: the two PDF brand guideline versions above, plus a 6.3MB standalone `QMULATE Brand Guidelines FINAL.html` export.
- The bilingual (EN/AR) one-pager — the clearest statement of the actual business model.
- Six Arabic Word/Excel documents that are the real domain material: the Saudi General Authority for Awqaf's official regulation governing *Nazarah* (waqf trusteeship) work, QMULATE's own restatement of that regulation as a "unified framework" (financial / operational / government & legal), an internal Nazir/waqf-management guide, and **live operating data for a real client** — a family waqf (multiple waqf deeds, several properties, and named beneficiaries, plus an activity-log spreadsheet tracking real tasks: bank accounts, Awqaf Authority filings, court cases, distributions).

## 2. What QMULATE actually is

QMULATE positions itself as a Saudi wealth-governance and real-estate advisory firm ("family office" framing) serving three segments — businesses, families, individuals — through three service lines: **Wealth Governance & Reporting**, **Real Estate & Facility Management**, and **Brokerage, Advisory & Market Opportunities**.

The part that's actually operating today, evidenced by real files rather than brand copy, is Wealth Governance applied to waqf: QMULATE acts as professional *Nazir* (الناظر) — the Awqaf-Authority-recognized trustee — for family endowments. The regulation, the internal framework, and the guide are the compliance backbone for that role; the client's waqf case is a live instance of it, currently run out of a spreadsheet (statuses like "تحت الاجراء" / in-progress, "تم الانتهاء منها" / completed, tracked per workstream).

That's the strongest signal in the folder for where a SaaS MVP should start: **a Nazarah/waqf case-management platform that digitizes the exact workflow currently living in that activity-log spreadsheet**, rather than building broadly across all three service lines at once.

Two inconsistencies are worth resolving before they get baked into a design system, rather than silently picking one:

- **HQ city**: the brand guideline mockups say "Family office · Riyadh"; the one-pager says "Jeddah, KSA." The one-pager reads as the real business document, so Jeddah is likely correct, but confirm before it goes on the marketing site.
- **Typography**: the v1.0 brand PDF (and `brand-tokens.json`) specify Geist/Geist Mono, packaged in the repo as Outfit + Geist Mono. The separate `FINAL.html` export instead loads a font called "Madani" with Outfit as fallback. These read like two different iterations — confirm which is current before it becomes `packages/ui`'s theme.

## 3. Recommended structure

```
qmulate/
├── CLAUDE.md                     # domain glossary + conventions for Claude Code (see below)
├── README.md
├── .gitignore
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
│
├── apps/
│   └── web/                      # Next.js app — marketing site + authenticated product
│       ├── app/
│       │   ├── (marketing)/      # home, approach, services, contact — replaces the static site
│       │   ├── (app)/            # authenticated product
│       │   │   ├── dashboard/
│       │   │   ├── waqfs/[id]/
│       │   │   ├── beneficiaries/
│       │   │   ├── assets/
│       │   │   ├── distributions/
│       │   │   ├── compliance/
│       │   │   └── documents/
│       │   └── api/
│       ├── components/
│       ├── lib/
│       └── public/
│
├── packages/
│   ├── ui/                       # design system built on the QMULATE brand tokens (Tailwind theme, components)
│   ├── database/                 # Prisma schema, migrations, seed script
│   ├── domain/                   # business logic & types: waqf, beneficiary, distribution, compliance
│   └── config/                   # shared tsconfig / eslint / tailwind preset
│
├── docs/
│   ├── product/                  # one-pager.md, positioning.md, roadmap.md
│   ├── domain/                   # nazarah-regulation.md, unified-framework.md, nazir-guide.md
│   ├── brand/                    # brand guideline PDFs, brand-tokens.json, fonts
│   └── architecture/             # ADRs, diagrams (built up as you go)
│
├── data/
│   └── fixtures/                 # ANONYMIZED sample waqf data for dev/test — never the real client records
│
├── archive/
│   └── raw-intake/               # untouched originals: downloads, duplicates, the real client case files
│                                  # (kept for provenance, excluded from git — see PII note below)
│
├── scripts/
│   └── brand/
│       └── build_qmulate_brand.py
│
└── tests/
```

**Why this shape:** `apps/` and `packages/` follow the standard pnpm/Turborepo monorepo pattern, which Claude Code navigates well because responsibilities are unambiguous — one app, shared logic pulled into packages instead of duplicated. `docs/domain/` matters more than usual here: the regulation and framework documents aren't background reading, they're closer to a spec. Converting them from Word into structured markdown (or even JSON checklist templates) gives Claude Code something it can cite directly when implementing compliance features, instead of re-deriving waqf rules from scratch each session. `archive/raw-intake/` exists so nothing gets lost in the reorganization, but is explicitly not something the app or Claude Code should build against.

## 4. Suggested domain model (this one writes itself)

QMULATE's own "unified framework" document already splits Nazir work into three sections with ~30 sub-items — that maps almost directly onto product modules and a compliance rules engine:

| Framework section | Product module | Core entities |
|---|---|---|
| القسم الأول — الأعمال المالية (Financial) | Finance / Distributions | `Waqf`, `BankAccount`, `Budget`, `Distribution`, `ZakatFiling` |
| القسم الثاني — الأعمال التشغيلية (Operational — real estate) | Assets / Maintenance | `Asset` (property + deed refs), `Lease`, `MaintenanceTicket`, `Vendor` |
| القسم الثالث — التفويض الحكومي والقانوني (Government & Legal) | Compliance / Legal | `ComplianceTask` (templated from the ~30 regulation sub-items), `Document` (waqfiyya deeds, certificates), `LegalCase`, `GovernmentFilingStatus` |

`Beneficiary` (مستحق) cuts across all three — tied to a `Waqf`, a share/entitlement, and the waqif's condition (شرط الواقف) text that determines eligibility. The activity-log spreadsheet's columns (Workstream, Category, Task, Status, Start/Close Date, Notes) map almost one-to-one onto a `ComplianceTask` table — that spreadsheet is effectively your first user-story source.

Government touchpoints referenced in the files (Awqaf Digital, Baladi, Istihkam, Muqeem, Qiwa) don't have public APIs as far as these documents show — model them as status-tracking fields on `GovernmentFilingStatus`, not live integrations, unless you confirm otherwise.

## 5. Migration map

| Current location | New location |
|---|---|
| `QMULATE Code/scripts/build_qmulate_brand.py` | `scripts/brand/build_qmulate_brand.py` |
| `QMULATE Code/output/brand-book/*.pdf`, `output/assets/brand-tokens.json` | `docs/brand/` |
| `QMULATE Code/output/website/*` | superseded by `apps/web/app/(marketing)/` (rebuild as React components, don't carry the static HTML forward as-is) |
| `Qmulate/QMULATE — Brand Guidelines.pdf`, `Qmulate · Brand Guidelines 2 .pdf`, `QMULATE Brand Guidelines FINAL.html` | `docs/brand/` (pick one as canonical per the Geist/Madani question above) |
| `Qmulate/QMULATE_One_Pager_EN_AR.docx` | `docs/product/one-pager.md` (convert to text) |
| `Qmulate/_أعمال النظارة وفق لائحة...docx` | `docs/domain/nazarah-regulation.md` |
| `Qmulate/أعمال النظارة - الإطار الموحّد...docx` | `docs/domain/unified-framework.md` |
| `Qmulate/دليل أعمال النظارة وإدارة الوقف.docx` | `docs/domain/nazir-guide.md` |
| The real client's waqf spreadsheets (endowment register + activity log) and board file | `archive/raw-intake/` (gitignored client-case folder) — real client data, do **not** move into `data/fixtures/` as-is |
| `QMULATE downloads/` (entire folder) | delete — confirmed duplicate of files already migrated above |

## 6. Before you start building

The client family's real names, waqf deed numbers, and bank details are sitting in plain `.xlsx`/`.pptx` files. If this becomes a git repo, that data should never enter it — keep `archive/raw-intake/` out of version control (`.gitignore` it or store it outside the repo entirely), and build `data/fixtures/` from invented names and deed numbers instead. This matters more than usual because the regulation itself (§3-4) requires AML/beneficial-ownership controls — worth having that discipline internally too.

## 7. Assumptions and open questions

This structure assumes a **Next.js (TypeScript) + Tailwind + Postgres/Prisma** monorepo, which is a common, Claude-Code-friendly default and lets the marketing site and product dashboard share one design system. If you'd rather split the backend into its own service (e.g., a Python API for heavier compliance/rules logic), swap `apps/web/app/api` for a standalone `apps/api/` and it fits the same tree. Worth confirming before scaffolding: tech stack preference, and whether the MVP scope should indeed be waqf/Nazarah case management first versus something broader across all three service lines.
