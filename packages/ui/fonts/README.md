# Fonts — what is here, what is missing, and what still has to be decided

Typeface decision (Q5) is **closed**: **Outfit** (display/body) + **Geist Mono** (labels,
IDs, SAR figures) + **IBM Plex Sans Arabic** (`[lang="ar"]`). **Madani is dropped** — it is
named in the "FINAL" brand document but no font file was ever delivered. **Inter is banned.**

The machine-readable version of everything below is `../src/fonts.ts`.

## What was copied into this folder

Copied verbatim from `docs/brand/fonts/` — these are the **only** font files the brand
delivered:

| File | Family | Weight | Serves |
|---|---|---|---|
| `Outfit-Regular.ttf` | Outfit | 400 | `--font-sans` — Body, Body-sm |
| `Outfit-Bold.ttf` | Outfit | 700 | `--font-sans` — heavy emphasis |
| `GeistMono-Regular.ttf` | Geist Mono | 400 | `--font-mono` — IDs, deed numbers, IBANs, SAR |
| `GeistMono-Bold.ttf` | Geist Mono | 700 | `--font-mono` — emphasis |

## What is missing

The design system uses weights that have **no delivered file**. Rendered from these four
TTFs alone they produce a synthetic (faux) weight or silently snap to 400/700:

| Family | Weight | Used by |
|---|---|---|
| Outfit | **300** | Display (`--fw-display`) |
| Outfit | **500** | H3 (`--fw-h3`) |
| Outfit | **600** | H1, H2, primary button labels |
| Geist Mono | **500** | Labels and eyebrows (`--fw-label`) |
| IBM Plex Sans Arabic | **400 / 500 / 600 / 700** | **All Arabic text.** Nothing delivered at all. |

⚠ **Corrected 2026-09-02 (S11): the Arabic face has NOT been missing since Sprint 1.** This
paragraph used to say "there is no Arabic face on disk" — and a second document repeated it —
while `apps/web` already depended on `@fontsource/ibm-plex-sans-arabic` and imported its
400/500/600/700 in `globals.css`. The face is delivered as an npm dependency of the app, not as
a TTF in this folder, which is how two documents stayed stale together. A document is not a
measurement. The table above is still true of the BRAND's delivery: no Arabic TTF was ever
handed over; the dependency fills it.

## The decision — Option A, decided 2026-09-02 (S11)

**Option A — `@fontsource`.** Three dependencies of `apps/web`, `@import`ed in `globals.css`:

- `@fontsource-variable/outfit` — variable 100–900, OFL. Fills 300 / 500 / 600.
- `@fontsource-variable/geist-mono` — variable. Fills 500.
  *(Existence was unverified at authoring time; RESOLVED 2026-09-02 by measurement — it exists
  at 5.3.0, no fallback to the static `@fontsource/geist-mono` needed.)*
- `@fontsource/ibm-plex-sans-arabic` — **static** weights 100–700, OFL. Import 400/500/600/700
  with the `arabic` subset. IBM Plex Sans Arabic has **no upstream variable release** — do
  not look for `@fontsource-variable/ibm-plex-sans-arabic`.

Fills every gap, keeps ownership in `packages/ui`, self-hosted (no external CDN, which
matters for the KSA residency posture). Costs three dependencies.

**Option B — `next/font/local` over the four TTFs — NOT taken** (it was the interim wiring for
Outfit and Geist Mono from Sprint 1 to S11, alongside the @fontsource Arabic face, and it left
one family name resolving to two faces). Why not:

- Every missing weight above stays missing. Display (300), H3 (500) and H1/H2 (600) render
  synthetically or snap — visibly losing the "airy neu" intent.
- **Arabic is still unsolved** and needs `@fontsource` anyway, so Option B does not actually
  avoid the dependency.
- `next/font/local`'s `src` must be a path **relative to the importing file**, not a package
  specifier. It cannot read `packages/ui/fonts/`, so `apps/web` needs its own duplicate copy
  of these four files.

Either way, `packages/ui/src/fonts.ts` exports `buildFontFaceCss()` for surfaces that cannot
use `next/font` at all (the Expo web build, PDF and email renderers).

## Rules that do not change whichever option wins

- Font **families are only ever referenced through the tokens** — `--font-sans`,
  `--font-mono`, `--font-ar`. No component names a typeface.
- The Arabic face is selected by the `[lang="ar"]` cascade, **scoped per element**, so a
  mixed record renders each script in its own face.
- **Never uppercase or letter-space Arabic** — it breaks the cursive joins. Latin labels are
  Geist Mono UPPERCASE +0.13em; Arabic labels are IBM Plex Sans Arabic 600, no transform, no
  tracking. See `labelClass()` in `@qmulate/i18n`.
- Codes, deed numbers, IBANs and SAR figures stay **Geist Mono** even inside Arabic prose,
  wrapped in `<bdi>` — Geist Mono has no Arabic glyphs, so never put Arabic text in it.
- `--font-display-override` stays commented out in `tokens.css`, reserved in case Madani
  files ever arrive. Swapping it must not require touching component code.
