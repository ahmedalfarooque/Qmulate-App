# QMULATE

Wealth governance and real estate advisory for Saudi businesses, families, and individuals. Three service lines: Wealth Governance & Reporting, Real Estate & Facility Management, Brokerage/Advisory & Market Opportunities. See `docs/product/one-pager.md` for the full breakdown.

**Status: pre-build.** This repo currently holds brand assets and domain reference material, not application code. The concretely-operating part of the business — acting as professional *Nazir* (waqf trustee) for family endowments under Saudi Awqaf Authority regulation — is the strongest candidate for a first product module; see `docs/domain/` and `docs/architecture/`.

## Layout

- `apps/` — application(s). Empty until a tech stack is chosen.
- `packages/` — shared code (design system, database schema, domain logic). Empty until a tech stack is chosen.
- `docs/product/` — one-pager, positioning, roadmap.
- `docs/domain/` — the Awqaf Authority's Nazarah regulation, QMULATE's own unified framework restating it, and an internal Nazir guide. Read these before building compliance features — they're close to a spec.
- `docs/brand/` — brand guidelines, tokens, fonts, logo assets. Read `docs/brand/README.md` first — there are three different brand directions in the source material and it explains which one is canonical.
- `docs/architecture/` — decisions and diagrams, built up as the product takes shape.
- `data/fixtures/` — anonymized sample data for development and tests.
- `archive/raw-intake/` — original unmodified source files, including real (confidential) client data. Not for building against — see `CLAUDE.md`.
- `scripts/brand/` — the Python script that generates the brand assets in `docs/brand/generated/`.

Read `CLAUDE.md` before starting implementation work.
