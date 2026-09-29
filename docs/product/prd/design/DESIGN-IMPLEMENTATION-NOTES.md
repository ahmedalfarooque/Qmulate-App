# Design Implementation Notes — Sprint 1 (E0)

> The running record of **what of [DESIGN.md](DESIGN.md) v0.2 actually exists in code**, what is deferred and to
> which sprint, and which design-adjacent facts are still unresolved and must not be silently decided by a
> component. DESIGN.md is the *contract*; this file is the *delta* between the contract and the build.
>
> Status: Living · reflects the Sprint 1 (E0) handoff · Privileged & Confidential
> Consumed by: `packages/ui`, `apps/web`, and (from Phase 2) `apps/mobile`.

---

## 0. How to read this

DESIGN.md v0.2 specifies a complete system. Sprint 1's design scope is **E0 only**: a themed, bilingual, RTL
application shell plus the token layer and the depth primitives everything later composes from. **E1 writes no
UI at all** — the [§17](../17-build-ship-dod.md) DoD box "bilingual + RTL UI copy" and "design fidelity" are
explicitly **N/A for E1**, and should be recorded as N/A in the sprint PR rather than faked green.

Three rules govern every entry below:

1. **Nothing here overrides DESIGN.md.** Where the build differs, that is a *deviation* and it is named in §5,
   not quietly normalised.
2. **Absence is a decision, not an oversight** — §2 lists what is deferred and where it lands.
3. **Unresolved facts stay unresolved.** §4 lists the ones a component could accidentally settle by rendering
   them. Do not.

---

## 1. Implemented in Sprint 1 (E0)

### 1.1 Token layer — complete

`packages/ui/tokens/tokens.css` implements **all four theme scopes** from DESIGN.md §2 and §5:

| Scope | DESIGN.md | Built |
|---|---|---|
| `:root` — **light-neu** (default) | §2.1 | ✅ colours as space-separated RGB channels (so Tailwind `/<alpha-value>` works) |
| `[data-theme='dark']` — dark-neu | §2.3 | ✅ same shadow *recipes*, dark values |
| `[data-theme='report']` — flat light | §2.4 | ✅ shadows and `backdrop-filter` forced off |
| `@media print` | §5 | ✅ re-declares the flat report values |
| Depth tokens `--nu-*` / `--glass-*` | §2.5 | ✅ incl. `--glass-fallback` for `@supports not (backdrop-filter)` and `prefers-reduced-transparency` |

**The RTL light-source flip is implemented** (§4 rule 2): `--nu-dir` carries the light-source X multiplier and
the `--nu-*` shadow values are re-declared under `[dir='rtl']`, so soft depth mirrors with direction instead of
hard-coding left/right offsets. Blur is held at 18px, under the 20px ceiling.

`packages/ui/tailwind-preset.ts` maps colours, `boxShadow`, fonts, spacing, radii and `--ease` — **one** preset,
extended by both the product routes and (later) `app/(marketing)`.

### 1.2 Primitives and components in `packages/ui`

Shipped: **`Surface`** (`raised | inset | flat | glass` — the single source of depth) · **`Well`** ·
`Card` · `Button` · `Text` · `Label` · `Eyebrow` · `Mono` · **`CurrencyValue`** (SAR, tabular, bidi-isolated) ·
**`DateValue`** (dual Hijri + Gregorian) · `StatTile` · `VisuallyHidden`.

`CurrencyValue` and `DateValue` carry unit tests — correctly, since they are the two primitives where a
formatting bug becomes a *financial* or *legal* misstatement rather than a cosmetic one.

### 1.3 Shell in `apps/web`

`AppShell` (glass sticky topbar + RTL-mirrored sidebar) · `Topbar` · `Sidebar` · `ThemeScope` (the mechanism
that renders a flat statement preview inside the soft app) · `LocaleSwitch` · the auth screens
(`SignInForm`, `SignUpForm`, `TwoFactorForm`) · `[locale]` routing with `ar` + `en`, `dir`/`lang` on `<html>`,
and next-intl middleware.

### 1.4 Rules enforced rather than merely written down

- **No hex in components** — every colour is a token reference.
- **No hand-rolled `box-shadow`** — depth comes from a token, via `Surface`.
- **Logical properties only** — `left/right/pl/pr/ml/mr` are banned; lint should keep them banned as the
  component set grows.
- **Latin digits by default for financial figures**, even under `ar` (`ar-SA-u-nu-latn`), with SAR amounts
  rendered as one atomic bidi-isolated token.

---

## 2. Deferred — and where it lands

Nothing below is cut; each is scheduled. The sprint numbers follow [BUILD-PLAN.md](../BUILD-PLAN.md).

| Deferred | DESIGN.md | Lands |
|---|---|---|
| `Mark`/`Logo` (auto/light/dark) and `Icon` (1.5px stroke, `flipRtl`) | §6 foundational | S2–S4, with the first screens that need chrome |
| Layout set: `PageHeader`, `Section`, `Container`, `SplitPanel`, `Tabs`, `Breadcrumb`, `Accordion`, `Modal`, `Drawer`/`Sheet` | §6 layout | S4 onward, per screen demand |
| Full form set: `Input`, `Textarea`, `Select`/`Combobox`, `NumberInput`, **`DatePicker` (dual Hijri+Gregorian)**, `Checkbox`/`Radio`/`Switch`, `FileUpload`, `FormField`, `SearchInput`, `FilterBar` | §6 forms | S4 (E3 endowment CRUD) |
| `DataTable` (flat inside a raised container), `KeyValueList`, `StatusPill`/`Badge`, `WaqfClassificationBadge`, `Tree`, `ShareBar`/`EntitlementDial`, `Chart`, `Timeline`, `EmptyState`, `Skeleton` | §6 data display | S4–S11 |
| Feedback set: `Toast`, `Alert`/`Banner`, `InlineFieldError`, `ConfirmDialog`, `Stepper`, `Tooltip` | §6 feedback | S4–S7 |
| **Domain components** — `DistributionRunWizard`, `MakerCheckerPanel`, `ShartAlWaqifPanel`, `ComplianceTaskBoard`, `DeadlineCalendar`, `AuditTrailViewer`, `DocumentVault`, `GovernmentFilingStatusGrid` | §6 domain | S7 (wizard + maker-checker, the MVP slice), S8–S11 for the rest |
| **Beneficiary portal** components, incl. `BeneficiaryStatement` in the flat report theme | §6 portal | Phase 2 |
| **`apps/mobile` / NativeWind** consumption of `tokens.ts` | §10 | Phase 2 — scaffolded only |
| **Marketing routes** `app/(marketing)` rebuilt off the canonical preset | §12 | S13, and **not before §4.1 is resolved** |
| Print/statement output (Arabic, flat theme, PDF) | §5, §2.4 | S13 (E12) — the `report` theme and `ThemeScope` exist now; nothing is rendered through them yet |
| Formal a11y audit against §11 | §11 | S13, but §11 is a build-time rule *now* (see §6 below) |

---

## 3. The font situation

Three families, three different supply stories. This is the part of the design system most likely to be
misread, so it is written out in full.

| Family | Role (§3) | Source as built | Weights actually available |
|---|---|---|---|
| **Outfit** | `--font-sans` — display + body | **Delivered TTFs** in `packages/ui/fonts/`, bound with `next/font/local` in `app/[locale]/layout.tsx` | **400, 700 only** |
| **Geist Mono** | `--font-mono` — labels, IDs, deed numbers, IBANs, SAR figures, LCD readouts | **Delivered TTFs**, same mechanism | **400, 700 only** |
| **IBM Plex Sans Arabic** | `--font-ar` — everything under `[lang="ar"]` | **`@fontsource/ibm-plex-sans-arabic`**, imported in `apps/web/src/app/globals.css` (`arabic` 400/500/600/700 + `latin` 400/600) | 400, 500, 600, 700 |
| **"Madani"** | `--font-display-override` | **Never delivered.** No font file exists anywhere in the repo. | — |

**Three consequences to know:**

1. **Outfit 300/500/600 and Geist Mono 500 have no file.** DESIGN.md's scale asks for Outfit 300–400 (Display),
   500 (H3), 600 (H1/H2, primary button labels) and Geist Mono 500 (labels/eyebrows). With only 400 and 700
   on disk, those weights render **synthetically** or snap to 400/700 — the "airy" display intent is
   approximated, not delivered. `packages/ui/src/fonts.ts` enumerates the gap as data
   (`MISSING_FONT_WEIGHTS`) so it can be closed without archaeology. Closing it means adding
   `@fontsource-variable/outfit` and `@fontsource-variable/geist-mono` — the same route already taken for
   Arabic. **That is a brand-fidelity call for the user, not a mechanical one; it is flagged, not taken.**
2. **Arabic comes from `@fontsource`, deliberately.** No Arabic file was ever delivered, IBM Plex Sans Arabic
   has **no upstream variable release** (do not look for `@fontsource-variable/…`), and Arabic is not a
   fallback in this product — it is the authoritative language of the financial record. Self-hosting via
   `@fontsource` keeps it offline-capable and residency-safe: **no Google Fonts request at runtime**, which
   matters under [NFR-03](../../brd/08-nonfunctional-requirements.md).
3. **The Madani override slot stays commented out**, exactly as DESIGN.md §3 says:
   ```css
   /* --font-display-override: 'Madani';  RESERVED — no font file delivered. */
   ```
   Do not uncomment it, do not substitute a lookalike, and do not quietly re-describe Outfit as "Madani". If
   files ever arrive, this is the single line that changes. Until then the display face **is Outfit** — the
   typeface question CLAUDE.md lists as unresolved is answered *for the build* only in the sense that Outfit
   is what ships; whether Madani was ever meant to be the brand face is still the business's call.

**A naming wart, recorded so it is not "fixed" by accident:** `tokens.css` declares
`--font-sans: 'Outfit Variable', Outfit, …` — a *fallback stack*, not a claim that a variable file exists.
`globals.css` re-points `--font-sans`/`--font-mono` at the `next/font` hashed families after the import, so
components keep referencing the token names while the real faces stay self-hosted and versioned. Changing
either half without the other silently drops the brand face.

---

## 4. Unresolved facts a component must not settle

### 4.1 HQ city — **Riyadh vs Jeddah — still unresolved**

The brand mockups say **Riyadh**; the legal/registered identity in `docs/company/` and the one-pager say
**Jeddah** (Jeddah, CR 7054453274). CLAUDE.md lists this as one of two facts that are *unresolved in the source
material, not decided*, and the PRD's own status is self-contradictory — `Home.md` and `Product/Open Questions.md`
call it resolved to Jeddah while [§16 Q3](../16-open-questions.md) and [§17](../17-build-ship-dod.md) call it
unresolved and blocking.

**Build rule, unconditional:**

- **No address, no city, and no "Family office · <city>" string may appear on any printable or
  regulator-facing surface** — beneficiary statements, evidence packs, PDFs, letterheads, invoices, anything
  rendered through `[data-theme='report']` or `@media print`.
- Where a layout needs the slot, leave it **empty and obviously empty**, or drive it from a `Setting` so a
  correction is a config change. Never a hardcoded literal in a component.
- The **marketing site (§12) must not ship** until the business confirms the city — carrying "Riyadh" over from
  a mockup onto a public page is the specific failure mode this note exists to prevent.
- Per CLAUDE.md Binding rule 4 this is a **decision to surface, not to resolve**. Surface it; do not pick.

### 4.2 Regulatory figures rendered in the UI

Any figure a screen displays that is a statutory threshold, deadline, fee percentage or classification band is
**⚠ unverified — confirm vs primary law**, and must (a) come from a `Setting`, never a constant in a component,
and (b) be presented as configured, not as settled law. This covers, non-exhaustively: the **SAR 200M / 50M**
classification bands behind `WaqfClassificationBadge`; the **30 / 15 / 10-business-day** windows a
`DeadlineCalendar` renders; the **3-month post-fiscal-year-end** distribution window; the **≥10-year**
retention period shown in the document vault; and the **10%** *ʿushr* Nazir fee (deed-set, contractual) —
which is a **different figure with a different payee and base** from the Authority's own **≤10% of net income**
fee, and the two must never be conflated in a label.

### 4.3 What the design system may not decide

DESIGN.md §9 already bans real client data and PII in mockups. Extending that to this sprint: a component may
not invent a beneficiary name, a deed number, an IBAN, or an amount for a placeholder. Use the shapes in
`data/fixtures/sample-waqf.json` and its `FAKE-*` conventions.

---

## 5. Deviations from DESIGN.md v0.2, as built

| # | DESIGN.md says | Built as | Why |
|---|---|---|---|
| D1 | §10: `packages/ui/fonts/` holds "Outfit (variable), GeistMono, IBMPlexSansArabic (self-hosted)" | Only the **four delivered static TTFs** live there; Arabic comes from `@fontsource` in `apps/web` | No Arabic file was delivered and no IBM Plex Sans Arabic variable release exists (§3) |
| D2 | §3: `next/font/local` from `packages/ui/fonts` | `next/font/local` resolves paths **relative to the importing file**, not to a package specifier, so the binding lives in `apps/web/src/app/[locale]/layout.tsx` | Framework constraint; the token contract is unchanged |
| D3 | §2.3 dark-neu palette | Two glass values under `[data-theme='dark']` are marked **⚠ DERIVED** in `tokens.css` | DESIGN.md gives dark colour values but no dark glass fill/border; derived rather than invented silently |
| D4 | §6 inventory (~60 components) | 12 primitives + the shell | E0 scope. §2 schedules the rest |

Each deviation is a candidate correction to DESIGN.md at its next revision — D1 and D2 in particular, since
they describe where files physically live.

---

## 6. Standing checks before any screen ships

These are DESIGN.md §11 obligations that apply from the first component, not at a late audit:

- **Contrast:** `--ink` ≥ 7:1 on `--bg`; **verify `--mist` clears 4.5:1** and darken it if short; `--mist-2` is
  large/decorative/disabled only; **verify `--edge` clears 3:1** on `--bg`. These three verifications are
  written in DESIGN.md as *"verify"* and have **not** been measured yet.
- **Affordance is never shadow-only.** Every interactive control carries a ≥3:1 cue independent of the soft
  shadow, plus the correct ARIA state. This is the single rule that makes a neumorphic interface accessible;
  a component that fails it is not a style issue, it is a defect.
- **Focus is a solid 2px `--blue` ring**, never a soft glow. Targets ≥44px. Test in both `dir`.
- **Glass needs a scrim and a solid fallback** (`@supports`, `prefers-reduced-transparency`).
- **Never uppercase or letter-space Arabic**; never mirror the logo or a time-series axis; wrap codes, deed
  numbers, IBANs and SAR figures in `<bdi>`.
- **Report/print stays flat.** No `box-shadow`, no `backdrop-filter` — statements must print legibly.

---

### Related

[DESIGN.md](DESIGN.md) (the contract) · [§13 UX/design-system reference](../13-ux-designsystem-reference.md) ·
[§17 Build & ship / DoD](../17-build-ship-dod.md) · [BUILD-PLAN.md](../BUILD-PLAN.md) ·
[`docs/brand/README.md`](../../../brand/README.md) (which of the three brand directions is canonical, and the
two items to confirm with the business) · [§16 Open questions](../16-open-questions.md)
