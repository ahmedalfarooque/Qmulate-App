# Design System: QMULATE

> The single source of truth for QMULATE's visual language, grounded in the canonical brand (`docs/brand/QMULATE-Brand-Guidelines-FINAL.html`, `brand-tokens.json`) and a **light-first neumorphic + glassmorphic** interface style. It governs two surfaces: the **product** (internal operations app + beneficiary portal — light, soft, tactile, bilingual) and the **marketing site**. Consumed by `packages/ui` (web, Tailwind) and `apps/mobile` (NativeWind).
>
> Status: Draft v0.2 · Privileged & Confidential
> **v0.2 change:** the interface style is now **light-first neumorphism + glassmorphism** (soft extruded/inset surfaces, dual-tone shadows, frosted-glass overlays), in QMULATE's cool-grey + blue palette, replacing the v0.1 dark-first flat hairline system. The dark palette is retained as an optional **dark-neu** theme. **Print/statements remain flat light.** RTL/bilingual, dual-calendar, and the domain component set are unchanged.

---

## 0. The style in one paragraph (read first)

QMULATE looks **soft, quiet, and tactile** — surfaces are *extruded from* a single cool-bone canvas by paired shadows (a light highlight and a soft dark shadow), controls **press inward** when active, overlays are **frosted glass**, and colour is almost absent except a single disciplined thread of blue. It should feel like a calm, well-made instrument — "Simple. Clean. Sensible." — not a flashy dashboard. **Neumorphism carries the *feeling*; it never carries *information*.** Meaning (state, affordance, status, hierarchy) is always carried by contrast, fill, a boundary cue, or text — never by a shadow alone. That single rule is what keeps a soft interface accessible and audit-legible.

---

## 1. Visual theme & atmosphere

QMULATE is a **trustee's system of record** — a regulated, Arabic-first, audit-grade product where correctness and calm outrank decoration. The atmosphere is **soft, architectural, and quiet**: one continuous bone surface, gentle extruded depth, frosted-glass layers, a single thread of blue. It should feel like a precise, tactile instrument — not a marketing dashboard. "The structure does the persuading."

- **Depth language:** **neumorphism** (soft dual-shadow extrusion; raised = resting, inset = pressed/active) for surfaces and controls; **glassmorphism** (blur + translucency) for overlays that float above content (topbar, modals, drawers, mobile nav, sheets). Depth is *subtle* — this is a data tool, not a toy.
- **Density:** the **operations app is grouped-dense (6–7)** — dense data lives *flat inside* soft containers (see §6 DataTable); the **portal/mobile is comfortable (4–5)** and leans hardest into the tactile style; the **marketing site is airy (3–4)**.
- **Variance:** moderate (4). Strict, predictable grids in the product; purposeful asymmetry on marketing.
- **Motion:** restrained (2–3). The signature micro-interaction is the **tactile press** (raised→inset on `:active`). One canonical easing. No cinematic choreography.
- **Bilingual-first:** Arabic is first-class; every rule works in RTL; official financial records are *stored* in Arabic.

**Composition rule (unchanged in spirit):** the surface is **≈90% monochrome bone/grey, ≤10% blue.** Blue is a **thread, not a field** — the primary action, links, active state, focus, the single highlighted data series. If a screen looks blue, it is wrong. Neumorphism is monochrome by nature; lean into that.

---

## 2. Color palette & roles

Cool-grey neutral family (carried from the brand's cool ink/graphite DNA) + the brand blue thread. Stored as CSS custom properties (space-separated RGB channels so Tailwind `/<alpha-value>` works) and consumed **only via tokens — no raw hex in components.** Neumorphism needs a **non-white** canvas (a pure-white base cannot cast a light highlight), so the light base is a cool **bone**.

### 2.1 Light-neu theme (product + portal — **default**)
| Token | Hex | Role |
|---|---|---|
| `--bg` | `#E7E9EE` | the neumorphic canvas (the ~90%); also the fill of raised surfaces |
| `--panel` | `#E7E9EE` | surface fill — **same as `--bg`** (depth is shadow, not fill) |
| `--well` | `#E0E3E9` | recessed/inset field fill (inputs, tracks, LCD wells) |
| `--panel-tint` | `#ECEEF2` | faint raised-layer lift where two soft cards stack |
| `--hi` | `#FFFFFF` | neumorphic **light** shadow (highlight, top-left) |
| `--sh` | `#C4C8D2` | neumorphic **dark** shadow (cool grey, bottom-right) |
| `--line` | `#D2D6DE` | hairline divider (dense tables, list rows) |
| `--edge` | `#6E7480` | **affordance boundary** — control outline meeting **≥3:1** non-text contrast (WCAG 1.4.11) |
| `--ink` | `#14161B` | primary text (AAA on `--bg`) |
| `--mist` | `#545B67` | secondary text (labels/captions) — **target ≥4.5:1, verify** |
| `--mist-2` | `#7E8593` | tertiary/disabled — **large/decorative only** |
| `--blue` | `#3A54D6` | **the accent thread**: primary fill, active, links (AA on light) |
| `--blue-strong` | `#2C3A86` | pressed/hover on accent; accent text needing >4.5:1 |
| `--blue-tint` | `#E4E8FB` | subtle accent fill, selected-row wash |

> **Primary-text token note:** the shared token *name* stays `--white` in code (it flips per theme); in light-neu its **value is `--ink #14161B`**. Components reference the name, never the hex.

### 2.2 Semantic status (invented — the brand ships none)
Muted, mid-luminance, tuned to sit quietly on bone. A `base` (fills/icons at AA on `--bg`), a `tint` (soft badge fill), `on` (text/icon on a base fill). **`info` *is* the brand blue — never a second blue.**

| Role | base | tint | on-base |
|---|---|---|---|
| success | `#1E9E63` | `#DCEFE4` | `#FFFFFF` |
| warning | `#B77A12` | `#F3E7CE` | `#1B1206` |
| danger | `#C6363B` | `#F5DADB` | `#FFFFFF` |
| info | `#3A54D6` | `#E4E8FB` | `#FFFFFF` |

**Financial-delta convention:** **positive money = `success`, negative = `danger`, neutral emphasis/interaction = `blue`.** All muted — status spends from the same restraint budget as the accent, shown as a small solid dot/▲▼ + text label (never colour alone — see §11).

### 2.3 Dark-neu theme (optional secondary)
The brand's dark DNA, re-skinned as **dark neumorphism** (same shadow *recipes* §2.5, dark values). Not the default; available where a low-light context is wanted.
`--bg`/`--panel` `#181A20` · `--well` `#131519` · `--hi` `#22252D` (top-left) · `--sh` `#0C0D11` (bottom-right) · `--line` `#262932` · `--edge` `#3C414D` · `--ink` `#ECEEF2` · `--mist` `#9AA0AC` · `--blue` `#5B7CFA` · `--blue-strong`(text) `#8AA4FF` · `--blue-tint` `#1A2440`.

### 2.4 Flat-light theme (statements / evidence packs / print — **shadows stripped**)
Printed and regulator-facing output must be **flat**: neumorphic shadows and glass blur do not print and hurt legibility. `@media print` and `<ThemeScope theme="report">` force this theme — same token names, **hairline borders replace all soft shadows**, pure-white paper base.
`--bg` `#FFFFFF` · `--panel` `#FFFFFF` · `--well` `#F5F6F8` · `--line`/`--edge` `#D2D6DE`/`#9AA0AC` · `--ink` `#14161B` · `--mist` `#545B67` · `--blue` `#2C3A86` (max contrast for print) · status = §2.2 bases. **No `box-shadow`, no `backdrop-filter` in this theme.**

### 2.5 Depth tokens — the neumorphic + glass recipes
Depth is expressed only through these tokens; components never hand-roll shadows.

| Token | Value (light-neu) | Use |
|---|---|---|
| `--nu-raised-sm` | `-3px -3px 6px var(--hi), 3px 3px 6px var(--sh)` | resting: tiles, small cards, buttons |
| `--nu-raised-md` | `-6px -6px 12px var(--hi), 6px 6px 12px var(--sh)` | resting: primary cards, dials |
| `--nu-inset` | `inset -3px -3px 6px var(--hi), inset 3px 3px 6px var(--sh)` | pressed/active, input wells, tracks |
| `--nu-flat` | `none` (rely on `--line`/`--edge`) | dense tables, print, reduced-transparency |
| `--glass-fill` | `rgb(255 255 255 / 0.55)` | frosted overlay fill (min opacity to hold AA text) |
| `--glass-border` | `rgb(255 255 255 / 0.75)` | 1px top/left inner highlight of glass |
| `--glass-blur` | `blur(18px) saturate(1.2)` | `backdrop-filter` for overlays |

**Rules:** raised and inset use the **same fill as `--bg`** — depth is shadow, not colour. Keep blur ≤20px. Every glass surface needs a fallback solid fill (`--panel` at ≥0.9 opacity) under `@supports not (backdrop-filter)` and under `prefers-reduced-transparency`.

---

## 3. Typography

Self-hosted via `next/font/local` from `packages/ui/fonts` (Outfit + Geist Mono TTFs live in `docs/brand/fonts/`; add IBM Plex Sans Arabic, OFL). The soft style favours **lighter display weights and generous letter-spacing**, but body/label legibility is protected (see A11y).

- **`--font-sans`: Outfit** — display + body. Geometric-humanist; the natural companion to a neumorphic surface. Weights 300/400/500/600/700. Display may use **300–400** for the airy neu look; **body never below 400**.
- **`--font-mono`: Geist Mono** — eyebrows, nav, column heads, timestamps, IDs, currency, and **LCD-style numeric readouts** in inset wells (KPIs, dials, meters). **UPPERCASE + wide tracking (+0.13em)** for Latin labels.
- **`--font-ar`: IBM Plex Sans Arabic** — under `[lang="ar"]`. Full 100–700 axis, genuine tabular figures, excellent small-size legibility, OFL. (Alternate: **Cairo**.)
- **`--font-display-override`** — reserved commented slot for **"Madani"** if real font files are ever delivered; until then dropped.
- **Inter is banned.** Generic serifs banned.

### Fluid scale (`clamp`)
| Role | Family / weight | Size | Line-height | Tracking |
|---|---|---|---|---|
| Display | sans 300–400 | `clamp(2.5rem, 7vw, 4.75rem)` | 1.0 | −0.02em |
| H1 | sans 600 | `clamp(1.75rem, 3.4vw, 2.5rem)` | 1.05 | −0.02em |
| H2 | sans 600 | `clamp(1.25rem, 2.4vw, 1.625rem)` | 1.1 | −0.02em |
| H3 | sans 500 | 1.125–1.375rem | 1.2 | −0.01em |
| Body | sans 400 | 1rem (min) | 1.55 | 0 |
| Body-sm | sans 400 | 0.875rem | 1.5 | 0 |
| Label / eyebrow | mono 500 | 0.6875–0.8125rem | 1 | **+0.13em UPPERCASE** |
| Numeric / SAR / LCD | mono **tabular-nums** | inherits | inherits | 0 |

Rules: `letter-spacing:-0.02em` on h1–h4; **all figures `font-variant-numeric: tabular-nums`**; body max ~65ch; never set body in mono; never use Display below 40px.

### The Arabic label problem (must encode — unchanged)
Geist Mono has no Arabic glyphs, and **Arabic must never be uppercased or letter-spaced** (breaks cursive joins). Label convention is **language-switched**:
- **Latin label:** Geist Mono, uppercase, `letter-spacing:.13em`, `--mist`/`--blue`.
- **Arabic label:** IBM Plex Sans Arabic, weight 600, **`letter-spacing:0`, no transform**, `--mist`; optional small blue tick to preserve the "eyebrow" read.
- Codes, deed numbers, IBANs, SAR figures stay in Geist Mono (Latin/numeric) even inside Arabic text, wrapped in `<bdi>`.

---

## 4. RTL & bilingual strategy

Arabic is first-class (financial records stored in Arabic; ships `ar` + `en`). *(Orthogonal to the visual skin — unchanged from v0.1.)*

1. **Direction:** `<html dir>` + `lang` by locale (`rtl`/`ar`, `ltr`/`en`). Everything hangs off `dir`.
2. **Logical properties only.** `padding-inline`, `margin-inline`, `inset-inline-start/end`, `border-inline-start`, `text-align:start/end`; Tailwind logical utilities (`ps-/pe-/ms-/me-/start-/end-`) + `rtl:`/`ltr:` variants. **`left/right/pl/pr/ml/mr` banned in components** — this now also means **neumorphic shadow offsets must flip in RTL** (the light source is inline-start): provide `--nu-raised-*`/`--nu-inset` with logical/`[dir]`-swapped offsets, not hard-coded left/right.
3. **Font switch by language:** `[lang="ar"] { font-family: var(--font-ar); }`, scoped per-element; wrap user values in `dir="auto"`/`<bdi>`.
4. **Mirror:** directional icons, breadcrumb separators, steppers, drawer slide, tab-underline, **and the neumorphic light-source direction**. **Do NOT mirror:** the logo/mark, brand imagery, checkmarks, **time-series chart axes** (temporal order stays LTR; mirror labels/legend only). Provide `<Icon flipRtl>`.
5. **Numbers/currency:** `Intl.NumberFormat`; **Latin digits by default even in `ar`** for financial figures (`'ar-SA-u-nu-latn'`, `currency:'SAR'`); `numberingSystem` toggle for Arabic-Indic in beneficiary prose. Never hard-code digit glyphs.
6. **Dates → dual Hijri + Gregorian.** Regulator filings Umm al-Qura; `<DateValue>` renders one primary + the other secondary (`'ar-SA-u-ca-islamic-umalqura'` / `'…-ca-gregory'`). Store canonical Gregorian ISO; **freeze the Hijri snapshot at write.**
7. **Gotchas to lint:** never uppercase/letter-space Arabic; bidi-isolate `%`, parentheses, `+966`; render a SAR amount as one atomic isolated token; Arabic name inputs `dir=rtl` but IBAN/deed inputs `dir=ltr`; test mixed-string line-breaking; the print/report theme must also respect `dir`.

---

## 5. Theming (light-neu default + dark-neu optional + flat report/print)

Same token *names*, different *values*; components never see hex.

- **Mechanism:** semantic CSS variables on `:root` (**light-neu defaults**); `[data-theme="dark"]` re-declares them (dark-neu §2.3); `[data-theme="report"]` **and** `@media print` re-declare them flat (§2.4) **and set `--nu-raised-*`/`--nu-inset` to `--nu-flat` and disable `backdrop-filter`**. Tailwind maps `colors:{ bg:'rgb(var(--color-bg)/<alpha-value>)', … }` plus `boxShadow:{ raised, inset, … }` from the depth tokens. Utilities flip automatically.
- **Where used:** ops app + portal shells = **light-neu**. Beneficiary **statements, evidence/regulator packs, PDFs, anything `@media print`** = **flat report**. `<ThemeScope theme="report">` renders a flat statement preview inside the soft app. Dark-neu is an optional user/context setting, not the default.
- **Logo:** one `<Mark variant="auto|light|dark">` — ink strata + `--mark-accent:var(--blue)` on light; white strata on dark. On glass, place the mark on its own solid chip to hold contrast.
- **Toggle policy:** theme is primarily **contextual** (product = light-neu, document = flat report). A dark-neu toggle *may* be exposed for low-light use; the report theme is never user-toggled — it's forced by print/export context.

---

## 6. Component stylings & inventory

Shared token package feeds web (Tailwind) + mobile (NativeWind). **[W]** web-only (data-dense) · **[S]** shared · **[M]** mobile-primary. Every component is drawn across its states (default · hover · pressed/active · focus · disabled · error/valid where relevant) — the kit's "up to 6 states" discipline.

### Interaction rules (all components)
- **The press is the signature.** Interactive elements rest **raised** (`--nu-raised-sm`) and go **inset** (`--nu-inset`) on `:active`, transitioning on `--ease`. Hover lifts subtly (larger raised) or tints.
- **Affordance is never shadow-only (the hard rule).** Every interactive control also carries a **≥3:1 cue independent of the soft shadow**: an `--edge` outline, a fill change, an accent, or an icon. State (selected/active/on) is shown by fill/accent/inset **plus** an ARIA state — not by shadow direction alone. This is what makes the soft style pass WCAG 1.4.11 and work for low-vision users.
- **Buttons:** soft raised, radius **12px**, pill for compact/toggle. **Primary** = `--blue` fill (high contrast) with soft raised depth → inset on press; **secondary** = bone raised with `--edge` outline; **tertiary/icon** = round raised. Labels ≥14px semibold (A11y). No outer glow, no neon.
- **Cards / tiles:** soft raised (`--nu-raised-md`), radius **20px** (product) / **24px** (marketing). Stacked cards lift the inner one with `--panel-tint`, not a heavier shadow. Dense content inside a card is **flat** (see DataTable).
- **Inputs:** **inset wells** (`--nu-inset`) — they look pressed-in — with a leading icon slot, label above, helper/error below (never floating labels). Border/`--edge` gives the 3:1 boundary; focus = solid 2px `--blue` ring (not a glow). Numeric/IBAN `dir=ltr` + tabular. Fields expose valid/error states (kit's 7-state fields): error = danger edge + inline reason; valid = success tick.
- **Switches / sliders:** **inset track** + **raised knob**; `on` = `--blue` filled track + knob at end + ARIA. Segmented control = inset track with a raised selected segment.
- **Numeric displays / meters ("LCD"):** value in **Geist Mono tabular** inside an inset `--well` — used for KPIs, SAR figures, dials, progress meters; the tactile equivalent of the kit's segmented readouts.
- **Loaders:** skeletal shimmer over soft surfaces matching real layout. **No circular spinners** for content.
- **Empty states:** composed, instructive ("Create the first endowment").
- **Errors:** inline, specific, with the reason ("Blocked: beneficiary KYC expired 2026-03-01").
- **Overlays = glass:** topbar, `Modal`, `Drawer`/`Sheet`, mobile bottom-nav, popovers use `--glass-*` (blur + translucency) over a scrim that guarantees AA text; solid fallback when blur unsupported / reduced-transparency.

### Inventory
- **Foundational [S]:** `Mark`/`Logo` (auto/light/dark), `Icon` (1.5px stroke, `flipRtl`), `Text`/`Heading`/`Eyebrow`/`Label`/`Mono`, **`CurrencyValue`** (SAR, tabular, bidi-isolated), **`DateValue`** (dual Hijri/Greg), `VisuallyHidden`. New depth primitives: **`Surface`** (`variant=raised|inset|flat|glass`, the single source of neu/glass depth), **`Well`** (inset field frame).
- **Layout:** `AppShell` (glass sticky topbar z=60 + RTL-mirrored sidebar) [W], `Sidebar`/`NavItem` (mono uppercase; active = inset + `--blue`) [W], `PageHeader` [S], `Section` [S], `Container` (max-w 1240) [S], `Card`/`Surface` [S], `SplitPanel` [W], `Drawer`/`Sheet` (glass) [S], `Modal` (glass) [S], `Tabs` (inset selected) [S], `Breadcrumb` [W], `Accordion` [S].
- **Data display:** **`DataTable`** (**flat inside a raised container** — hairline `--line` rows, mono sticky sortable header, `tabular-nums`, zebra via `--panel`/`--panel-tint`, row-select wash `--blue-tint`, RTL column order, pinned first column; **no per-cell neumorphism**) [W], `KeyValueList` [S], **`StatTile`/`KPI`** (raised tile: mono eyebrow + big SAR in an inset LCD well + colored ▲▼ delta) [S], `StatusPill`/`Badge` (tint fill + dot + label, radius full) [S], **`WaqfClassificationBadge`** [S], `Tree`/`Hierarchy` (Waqf→Asset→Beneficiary) [W], **`ShareBar`/`EntitlementDial`** (entitlement % as an inset track or neu radial dial, blue fill) [S], `Chart` (bar/line/donut, **single-blue-series / rest grey**, **LTR time axis**; plotted flat on a raised card) [S], `Timeline` [S], `EmptyState`/`Skeleton` [S].
- **Feedback:** `Toast` (glass) [S], `Alert`/`Banner` (info/success/warning/danger — tint fill + icon) [S], `InlineFieldError` [S], `ConfirmDialog` (glass) [S], `Stepper` (RTL-aware, inset track) [S], `Tooltip` [W].
- **Forms:** `Input`, `Textarea`, `Select`/`Combobox`, **`NumberInput`** (SAR, tabular, `dir=ltr`), **`DatePicker`** (dual Hijri+Gregorian), `Checkbox`/`Radio`/`Switch` (inset track/raised knob), **`FileUpload`** (KYC docs, deed scans; inset dropzone), `FormField` (label+hint+error, RTL), `SearchInput` (inset well + leading magnifier — the kit's search field), `FilterBar` [W].
- **Domain — ops app [W]:** **`ComplianceTaskBoard`** (three framework columns: financial / operational / government-legal; cards raised), **`DeadlineCalendar`** (Hijri+Greg), **`DistributionRunWizard`** (compute ghallah → allocate by tier/line → review → **maker-checker** → export payout; stepper inset), **`MakerCheckerPanel`** (dual-control diff + sign-off), **`AuditTrailViewer`** (immutable log, actor/timestamp mono; dense = flat), **`DocumentVault`** (version + preview), **`GovernmentFilingStatusGrid`** (Awqaf Digital / Baladi / Ejar / Istihkam / Muqeem / Qiwa — **manual status pills, not integrations**), **`ShartAlWaqifPanel`** (read-only conditions during a run), `WaqfSummaryCard` [S].
- **Domain — portal (Phase 2, mostly [S]/[M] — leans hardest into the soft style):** **`BeneficiaryStatement`** (**flat report theme**, printable, SAR tabular), `EntitlementView` (dial + history), `KYCUploadFlow` (verified/pending/unverified), `FamilyBoardDashboard`, `ReservedMatterApproval`, `NotificationCenter`, `ContactNazir` [M].

**Web/mobile split:** tokens + depth primitives (`Surface`/`Well`) + typographic/currency/date primitives + status/badge/statement components are **shared**; the dense ops app (DataTable, TaskBoard, DistributionRunWizard, MakerChecker, AuditTrail) is **desktop web-only** and uses depth *sparingly* (grouping, not decoration); the **portal is the shared/mobile surface**, built first, and is where neumorphism/glass are richest.

---

## 7. Layout principles

- **CSS Grid over flexbox math**; no `calc()` percentage hacks. Contain with `max-width` (product 1240px; marketing 1400px).
- Soft surfaces need **breathing room**: neumorphic cards carry ≥16px internal padding and ≥16–24px gaps so highlight/shadow have room to read; never crowd two raised surfaces without a gap.
- **Product** = strict, predictable, aligned grids. **Marketing** may use asymmetric splits; the "3 equal cards" feature row is banned there.
- **No overlapping soft surfaces** — extruded elements own a clean spatial zone (overlap muddies the shadows). Glass is the *only* layer allowed to float over content.
- Full-height sections use `min-h-[100dvh]`, never `h-screen`.
- Single primary breakpoint ~760px (marketing) + a desktop-app breakpoint for the ops shell; **all multi-column layouts collapse to one column < 768px; no horizontal overflow on mobile**; touch targets ≥44px.
- Section padding fluid: `clamp(24px, 7vw, 96px)`. Spacing scale (4px base): `4,8,12,16,20,24,28,32,40,48,56,72,88,96,120`.
- **Radii (softer than v0.1):** `12` buttons/inputs · `full` pills/switches/avatars · `16` images · **`20` product cards** · `24` marketing cards · `20`+ tiles. Z: dropdown 1000, sticky-header 60, overlay 1100, modal 1200, toast 1300, tooltip 1400.

---

## 8. Motion

- **One easing:** `--ease: cubic-bezier(0.22,1,0.36,1)`. Durations `fast 120ms / base 180ms / slow 240ms`.
- **Signature interaction:** the **press** — `box-shadow` raised→inset (+ optional `translateY(1px)`) on `:active`; hover raises subtly. Keep it quick (`fast`).
- Animate **`transform`, `opacity`, and `box-shadow`**; never `top/left/width/height`. (Shadow is animated only for the press; keep it cheap.)
- Restrained by voice: fades, 4–8px translate, no bounce, no perpetual loops. Staggered list reveals allowed, subtle.
- Glass overlays fade + 4–8px rise on open.
- Respect `prefers-reduced-motion: reduce` (drop transitions, keep opacity) **and** `prefers-reduced-transparency` (swap glass for solid `--panel`).

---

## 9. Anti-patterns (banned)

- No **Inter**; no generic serifs; no emojis in the UI chrome.
- **Neumorphism-specific bans:** never rely on **shadow alone** for state, affordance, or grouping (always a ≥3:1 cue too); never put neumorphism on a **pure-white** base (highlights vanish); **no per-cell neumorphism in dense tables** (flat inside a soft container); no **stacked heavy shadows** (subtle > deep); no soft depth in the **report/print** theme.
- **Glass-specific bans:** no text on glass without a contrast-guaranteeing scrim; no blur >20px; always ship a solid fallback (`@supports`, reduced-transparency).
- No **neon / outer-glow** shadows; **no "AI blue/purple neon" gradients**. Blue is a thread ≤10%, never a glowing field.
- No oversaturated accents; no gradient text on headers; no custom mouse cursors.
- No overlapping soft surfaces; no "3 equal cards" feature rows (marketing).
- No circular spinners for content (skeletons); no filler text / bouncing chevrons.
- **Never uppercase or letter-space Arabic.** Never use `left/right` physical properties (incl. hard-coded shadow offsets — flip with `dir`). Never mirror the logo or a time-series axis.
- No `h-screen` (use `100dvh`); no `calc()` percentage layout hacks.
- No real client data or PII in mockups/examples — use `data/fixtures/sample-waqf.json` shapes and invented names only.
- No fake round numbers or AI copy clichés ("Elevate", "Seamless", "Next-Gen").

---

## 10. How this maps to the build (`packages/ui`)

```
packages/ui/
  tokens/
    tokens.css        # :root (light-neu) + [data-theme=dark] + [data-theme=report] + @media print
                      #   colours (RGB channels) + depth tokens (--nu-*, --glass-*)
    tokens.ts         # typed token export (NativeWind / RN)
  tailwind-preset.ts  # colours → rgb(var(--color-*)/<alpha>); boxShadow: {raised-sm,raised-md,inset,glass}; fonts, spacing, radii, --ease
  fonts/              # Outfit (variable), GeistMono, IBMPlexSansArabic (self-hosted, OFL)
  src/components/     # grouped exactly by §6; Surface/Well are the depth primitives everything composes from
apps/web              # imports tailwind-preset + tokens.css; app light-neu, statements report/flat
apps/mobile (Expo)    # NativeWind consumes tokens.ts (same names); RN shadow API for neu (iOS shadow* / Android elevation + inner-shadow lib)
```
`apps/web` product routes and `app/(marketing)` routes both extend the **one** `tailwind-preset.ts`. No hex ever appears in a component; **no component hand-rolls a `box-shadow` — it uses a depth token via `Surface`.** This DESIGN.md is the contract both `apps/web` and `packages/ui` build against.

> **Mobile note:** true dual-direction inset shadows are non-trivial in React Native. `Surface` abstracts it: iOS uses layered `shadowColor/Offset`, Android uses `elevation` + a light top border, and inset wells use a small inner-shadow implementation — so the *token contract* is identical even where the RN implementation differs.

---

## 11. Accessibility (the guardrails that make soft UI usable — verify during build)

Neumorphism fails accessibility when done naively; these rules are **non-negotiable** (NFR-11):

- **Text contrast is never traded for softness.** Body/`--ink` ≥ 7:1 on `--bg`; secondary `--mist` **≥4.5:1** (verify the exact value; darken if short); `--mist-2` large/decorative/disabled only.
- **Non-text contrast (WCAG 1.4.11):** every interactive control and its state carry a **≥3:1** cue against the adjacent surface via `--edge`, a fill, or the accent — **not the soft shadow** (shadows may be <3:1 and are decorative). Verify `--edge` meets 3:1 on `--bg`.
- **State is never colour- or shadow-only:** pair with an icon, text, fill, and the correct ARIA state (`aria-pressed`, `aria-checked`, `aria-current`, `aria-invalid`).
- **Primary blue button:** white on `#3A54D6` (light) passes AA for ≥14px semibold; keep labels ≥14px semibold or use `--blue-strong`. Verify.
- **Focus** is a **solid** 2px `--blue` ring with offset (`0 0 0 2px var(--bg), 0 0 0 4px var(--blue)`) — never a soft glow; visible on every interactive element; all targets ≥44px; full keyboard + screen-reader support; test both `dir`.
- **Glass:** text on glass must clear AA against the *effective* backdrop — apply a scrim; provide the solid fallback for `prefers-reduced-transparency`.
- **Report/print theme is flat** so statements stay maximally legible and printable.

---

## 12. Marketing site

A working 5-page static preview exists at `docs/brand/generated/website-preview/` (home / approach / services / contact + template) and demonstrates earlier patterns — but it uses the **stale v0.1 dark flat tokens and short token set**. **Rebuild it as Next.js `app/(marketing)` routes inside `apps/web`, reusing the canonical `tailwind-preset` + `tokens.css` + shared primitives** in the new light-neu style (airier density 3–4; soft raised cards; glass nav; hero may use a large soft "pillow" panel rather than a glow). Two items must be confirmed with the business before it ships publicly (both in `docs/brand/README.md`): **HQ city** (mockups say Riyadh; legal/registered is **Jeddah** — don't carry "Family office · Riyadh" over unverified) and whether **Madani** ever arrives.
