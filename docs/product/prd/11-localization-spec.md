# Localization Spec — Arabic/English · RTL · Hijri/Gregorian

How QMULATE is bilingual to the data layer, renders true RTL, and computes and displays statutory dates in both the Umm-al-Qura Hijri and Gregorian calendars.

Status: Draft v0.1 · Privileged & Confidential

---

## Purpose

Localization at QMULATE is **not an i18n coat of paint** — it is a correctness and compliance requirement. Official financial records must be *stored* in Arabic ([NFR-01](../brd/08-nonfunctional-requirements.md), Nazarah Art. 15(2)); statutory deadlines are reckoned by the **Umm-al-Qura Hijri** calendar in KSA business days ([NFR-02](../brd/08-nonfunctional-requirements.md), [BR-1003](../brd/06-functional-requirements.md)); and the Family Board and beneficiaries operate in Arabic. This section specifies the language model, the RTL rules, the Arabic-authoritative data strategy, and the dual-calendar machinery. The visual half (fonts, the language-switched label convention, mirroring of icons) lives in [design/DESIGN.md §3–§4](design/DESIGN.md); this section owns the behaviour and the data.

> [!important] Arabic is first-class, not a fallback. Wherever a document is legally significant, **Arabic is the system of record** and English is an optional convenience translation — never the reverse.

---

## 1. Language & direction model

- **Locales:** `ar` (default for the product, per the domain) and `en`. Locale is a URL segment on web (`/[locale]/…`, next-intl) and device/user preference on mobile (`expo-localization` + i18next).
- **Direction:** the locale sets `<html lang dir>` — `ar` ⇒ `dir="rtl"`, `en` ⇒ `dir="ltr"`. Every layout rule hangs off `dir`, never off a hard-coded side. React Native uses `I18nManager.forceRTL` set at app start from the locale.
- **One shared catalog:** all copy lives in `packages/i18n` (`ar`/`en` ICU message catalogs) consumed by both web and mobile, so wording never drifts between surfaces. No inline hard-coded UI strings.
- **Enums are codes, not words.** Domain enums (classification, status, filing platform, roles) are stable machine codes; their Arabic/English labels come from the catalog. This keeps the database language-neutral and the UI fully translatable.

---

## 2. Arabic-authoritative data (the data-layer requirement)

Some fields are **statutorily Arabic** and are stored, validated, and exported in Arabic; a parallel English field is optional.

| Entity · field | Rule |
|---|---|
| `Transaction.descriptionAr` | **Required.** Financial records are kept in Arabic (Art. 15(2)). English `descriptionEn` optional. |
| `Client.nameAr`, `Waqif.nameAr`, `Waqf` deed text, `Asset.addressAr`, `Document.titleAr`, `LegalCase.subjectAr` | Arabic-authoritative required; English optional. |
| `shartAlWaqif` (structured JSON) | Condition labels carry Arabic; the original Arabic deed is retained as a `Document` for provenance. |
| Amounts, dates, IDs, enums | **Locale-neutral** — never store a formatted or localized value; format at render only. |

**Acceptance:** validation rejects a financial `Transaction` with an empty `descriptionAr`; official statements and evidence packs render the Arabic field as the record of truth. (See [07 data-model §2/§6/§13](07-data-model-spec.md).)

Bidi handling for mixed content: user-entered values are wrapped in `dir="auto"` / `<bdi>` so an Arabic name beside a Latin deed number and a SAR figure each resolve correctly. Arabic name inputs are `dir="rtl"`; IBAN / deed-number inputs are `dir="ltr"` **even inside an RTL form**.

---

## 3. RTL layout rules

1. **Logical CSS properties only.** `padding-inline`, `margin-inline`, `inset-inline-start/end`, `border-inline-start`, `text-align:start/end`. In Tailwind use the logical utilities (`ps-/pe-/ms-/me-/start-/end-`) and `rtl:`/`ltr:` variants. **Physical `left/right/pl/pr/ml/mr` are banned in component code** (enforce with a lint rule).
2. **Mirror** (flip in RTL): directional icons (arrows, chevrons, back/forward), breadcrumb separators, progress steppers, drawer slide-in direction, tab-underline motion, wizard "next" direction. Use an `<Icon flipRtl>` prop — never a global transform.
3. **Do NOT mirror:** the strata logo/mark, brand imagery, checkmarks, media thumbnails, and — critically — **time-series chart axes.** A distribution-history or revenue chart reads left→right by date in *both* locales; mirror the labels/legend and the axis side, but keep temporal order LTR (mirroring time confuses finance users).
4. **No overlap, clean zones** (per [DESIGN.md §7](design/DESIGN.md)); test long mixed-script strings for line-breaking; ensure the light **print/report** theme also honours `dir`.

---

## 4. Typography under RTL (behaviour; visuals in DESIGN.md)

- Font switches by language: `[lang="ar"]` uses **IBM Plex Sans Arabic**; Latin uses **Outfit** + **Geist Mono**. Scope by the element's own `lang` so mixed records render each script in its face.
- **Never uppercase or letter-space Arabic** (it breaks cursive joins). The brand's signature label = *mono, uppercase, wide-tracked* — so the label convention is **language-switched**: Latin labels are Geist Mono uppercase +0.13em; Arabic labels are IBM Plex Sans Arabic weight-600, no transform, no tracking, optionally prefixed with a small blue tick to preserve the "eyebrow" read.
- Codes, deed numbers, IBANs, SAR figures stay in Geist Mono (Latin/numeric) even inside Arabic text.

---

## 5. Numbers & currency

- Format with `Intl.NumberFormat`. **Default to Latin (Western) digits even in `ar`** for financial figures (`'ar-SA-u-nu-latn'`, `{ style:'currency', currency:'SAR' }`) — this matches the brand mockups and Saudi banking convention and keeps `tabular-nums` columns aligned in tables.
- Expose a locale-level `numberingSystem` toggle so **Arabic-Indic (`arab`) digits** can be enabled for beneficiary-facing prose if the business wants it. Never hard-code digit glyphs.
- SAR amounts render as an **atomic, bidi-isolated token** so the currency symbol and any minus sign don't jump sides. All figures use `font-variant-numeric: tabular-nums`. A shared `<CurrencyValue>` component ([DESIGN.md §6](design/DESIGN.md)) enforces this.

---

## 6. Dual calendar — Umm-al-Qura Hijri + Gregorian

> [!important] KSA statutory dates are **Umm-al-Qura**, not the tabular Islamic calendar — this is the correctness fork. Use `@umalqura/core` for conversion/arithmetic, cross-checked against native `Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura')` for display.

- **Storage.** Persist the canonical `DateTime` (UTC, Gregorian — the arithmetic/sort source of truth) **plus** a `…Hijri String` **frozen at write time**, so a stored deadline or transaction date never shifts if a calendar library updates later. (See [07 §Purpose conventions](07-data-model-spec.md).)
- **Display.** `<DateValue>` shows one calendar primary + the other secondary by context (regulator-facing surfaces lead with Hijri; internal ops may lead with Gregorian). Both are always available.
- **Deadline math (KSA business days).** The [deadline engine](09-compliance-deadline-engine-spec.md) computes statutory dates over the **KSA workweek (Sunday–Thursday; Friday/Saturday weekend)** plus a configurable `HolidayCalendar` (the two Eids, National Day, Founding Day — Hijri-moving). Windows: register **30 bd**, update **15 bd**, istibdal notice **10 bd**, distribute within **3 months** of fiscal-year-end. The engine stores both `dueDate` and `dueDateHijri`.

---

## 7. Publish-blocking localization decisions (flag before any public/legal output)

Two brand-copy facts must be confirmed with the business before they appear on anything with legal or public weight (both flagged in [`docs/brand/README.md`](../../brand/README.md) and carried into [16 open questions](16-open-questions.md)):

- **HQ city.** The brand mockups say **Riyadh**; the Commercial Registration and one-pager say **Jeddah**. Use **Jeddah** wherever it has legal weight (registered office, letterhead, statements); do not carry "Family office · Riyadh" into product copy or the marketing site unverified.
- **Display typeface (Madani vs Outfit).** Resolved default: **Outfit** (Madani has no delivered font file). A documented `--font-display-override` slot allows swapping Madani in if files arrive — without touching component code ([DESIGN.md §3](design/DESIGN.md)).

---

## 8. Acceptance criteria

- **Given** the `ar` locale, **When** any screen renders, **Then** `dir="rtl"` is set, layout uses logical properties, directional icons mirror, but the logo and any time-series chart axis do not.
- **Given** a revenue `Transaction` created with an Arabic description, **When** its official statement is generated, **Then** the statement renders correct RTL Arabic with the Arabic text as the record of truth; English is optional.
- **Given** a beneficiary distribution amount, **When** displayed in either locale, **Then** it shows Latin digits with `tabular-nums`, currency SAR, as a bidi-isolated token.
- **Given** an istibdal notice anchored on 2026-05-01, **When** the 10-business-day deadline is computed, **Then** it skips Fri/Sat and any `HolidayCalendar` holidays and stores both `dueDate` and a frozen `dueDateHijri`.
- **Given** a stored date is re-read a year later, **When** rendered, **Then** its Hijri value is identical to the snapshot taken at write (no drift).
- **Given** an IBAN input inside an RTL Arabic form, **When** the user types, **Then** the field renders `dir="ltr"` while the surrounding form stays RTL.

---

## Requirements covered

**Primary:** [NFR-01](../brd/08-nonfunctional-requirements.md) (bilingual Arabic/English, full RTL, Arabic-stored financial records), [NFR-02](../brd/08-nonfunctional-requirements.md) (Hijri + Gregorian throughout, incl. deadline computation).

**Contributing:** [BR-502](../brd/06-functional-requirements.md) (Arabic financial records), [BR-1003](../brd/06-functional-requirements.md) (Hijri + Gregorian dates), [BR-505](../brd/06-functional-requirements.md) (per-beneficiary Arabic statements), [BR-902](../brd/06-functional-requirements.md) (class-appropriate statements), [BR-1001](../brd/06-functional-requirements.md)/[BR-1002](../brd/06-functional-requirements.md) (statutory deadline dates). See [09 compliance/deadline engine](09-compliance-deadline-engine-spec.md) for the calendar math and [design/DESIGN.md](design/DESIGN.md) for the visual system.
