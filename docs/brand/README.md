# QMULATE brand — three iterations found, here's what's canonical

> **⊕ 2026-08-17 — a NEW canonical document supersedes FINAL.html as the latest word:**
> **`QMULATE-Brand-Guidelines-FINAL-v1.1.pdf`** ("Version 1.1 — 2026", 30 pages), delivered by the owner as
> the replacement for the latest brand file. It is the **same v1.0 → FINAL.html lineage** (strata-bar mark,
> ink/graphite/blue palette, "Structured for generations") — **not** the ALT onyx-bone concept — and it
> **resolves half of the Madani question**: the PDF embeds **MadaniArabic Light/Regular/SemiBold/Bold**, so
> the typeface is real and in use, no longer aspirational. ⚠ What it does **not** resolve: no distributable
> Madani font *files* (`.ttf`/`.woff2`) exist in `fonts/` yet — an embedded PDF subset is not a licensed
> webfont — so `packages/ui` still must not build against "Madani" until the files are delivered. The
> section below predates this document and is kept as the record of how the three originals were reconciled.

## The three documents

1. **`QMULATE-Brand-Guidelines-v1.0.pdf`** — "Structured for generations." Dark palette (Ink `#0A0B0D`, Graphite `#1B1E25`, Mist `#8C909B`, White `#ECEEF2`, Blue `#5B7CFA`). Geist Display / Geist / Geist Mono. Logo: stacked horizontal bars ("strata"), shortest top bar in blue. Domain shown: `qmulate.ai`.
2. **`QMULATE-Brand-Guidelines-ALT-onyx-bone-concept.pdf`** (originally "Brand Guidelines 2") — a **completely different concept**: "Onyx & Bone" warm palette (Onyx `#0E0E0E`, Graphite `#2A2A2A`, Sand `#D8CDB0`, Bone `#EBE5D7`, Sienna `#A04020` accent), Bodoni Moda (display serif) + Geist (text), a single-letter/monogram "Q" mark instead of the strata bars, and domain shown as `qmulate.com`. Same tagline ("Structured for generations") and the same fictional mockup persona (Faisal Al-Mansouri) as v1.0, which is why it's easy to mistake for a variant rather than a separate concept — it isn't; it's a different logo, palette, and typeface family entirely.
3. **`QMULATE-Brand-Guidelines-FINAL.html`** — explicitly named "FINAL." Its embedded CSS carries the *same* strata-bar SVG mark and the *same* blue/dark colour family as v1.0, extended with more tokens (`--panel`, `--panel-2`, `--line-2`, `--mist-2`, `--blue-dk`, `--blue-tint` — see below). It swaps the typeface to a font called **"Madani"** (falling back to Outfit) — but no actual Madani font file (`.woff2`/`.ttf`) exists anywhere in the original folder. That reference is aspirational, not delivered.

## What's canonical (used going forward)

Logo and colour family: **v1.0 → FINAL.html lineage** (strata-bar mark, ink/graphite/blue palette). The ALT onyx-bone/monogram concept is kept in this folder for reference only — treat it as a separate creative direction that was not carried forward, not as "the old version of the real one."

Typography: **Geist Display / Geist / Geist Mono**, delivered in this repo as the Outfit + Geist Mono TTFs in `fonts/` (Outfit was used as the practical stand-in for Geist Display/Geist when the brand package was built). "Madani" in FINAL.html is unresolved — either source the actual Madani font files and swap it in, or treat Outfit as the real answer and update FINAL.html's CSS to stop referencing a font that doesn't exist. Don't build `packages/ui` against "Madani" until one of those happens.

Domain: **qmulate.ai** — this is corroborated outside the brand documents too: the real Nazir guide (`docs/domain/nazir-guide.md`) instructs actual beneficiaries to email `ceo@qmulate.ai`. `qmulate.com` only appears in the ALT concept file and is very likely just that concept's placeholder.

Extended colour tokens (from FINAL.html, not present in `brand-tokens.json`):

| Token | Hex | Role |
|---|---|---|
| `--bg` | `#0A0B0D` | page background |
| `--ink` | `#060708` | deepest surface |
| `--panel` | `#14161B` | card surface |
| `--panel-2` | `#1B1E25` | secondary card surface |
| `--line` | `#262932` | hairline borders |
| `--line-2` | `#31343E` | stronger borders |
| `--mist` | `#8C909B` | secondary text |
| `--mist-2` | `#5A5E68` | tertiary text |
| `--blue` | `#5B7CFA` | primary accent |
| `--blue-br` | `#8AA4FF` | bright accent (legibility on ink) |
| `--blue-dk` | `#2C3A86` | dark accent |
| `--blue-tint` | `#18203C` | accent tint / subtle fills |

## Open question not resolved here: HQ city

All three brand documents place QMULATE in **Riyadh** (v1.0 says "Family office · Riyadh"; the ALT concept gives a specific fake address on King Fahd Road, Riyadh; FINAL.html's application mockups also say Riyadh). But `docs/product/one-pager.md` — a real bilingual business document, not a mockup — says **Jeddah, KSA**, and the client's real waqf case has properties in well-known Jeddah districts (Al-Mansoura, Al-Aziziyah). Both could be true at once (registered/legal HQ in Riyadh, operations in Jeddah), or the brand mockups may simply have defaulted to Riyadh as the generic "Saudi family office" placeholder city. Confirm with the business before it goes on a real marketing site.

## What's in this folder

- `QMULATE-Brand-Guidelines-FINAL-v1.1.pdf` — **the current canonical document** (owner-delivered 2026-08-17; strata/blue lineage, Madani Arabic embedded)
- `QMULATE-Brand-Guidelines-v1.0.pdf`, `QMULATE-Brand-Guidelines-FINAL.html` — canonical identity (earlier iterations of the same lineage)
- `QMULATE-Brand-Guidelines-ALT-onyx-bone-concept.pdf` — the alternate concept, reference only
- `brand-tokens.json` — original token export from the v1.0 PDF (ink/graphite/mist/white/blue only; doesn't yet include the extended FINAL.html tokens above)
- `assets/source-exact/` — cropped PNGs of every panel from the v1.0 PDF (logo, colour, type, misuse, lockups, imagery direction, applications)
- `assets/` — app icons and favicons generated from the source mark
- `fonts/` — Outfit (Regular/Bold) and Geist Mono (Regular/Bold) TTFs
- `generated/` — outputs of `scripts/brand/build_qmulate_brand.py`: a re-composed "v2" brand book PDF, a 5-page static HTML/CSS marketing site preview, and QA screenshots. These are derivative, not source — don't treat the generated website as real product code; it's a style reference for `apps/web` once that's built.
