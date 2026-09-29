# Licences and permits — the endowment's own, and its properties'

**Source of truth: the product owner's own enumeration**, supplied 2026-08-31 as
`licences-and-permits.xlsx` (this folder) and transcribed here verbatim. The workbook is the
artifact; this file is the readable, greppable, diffable form of it and carries the rulings that
came with it.

> ⚠ **UNVERIFIED AGAINST PRIMARY LAW (binding rule 3).** This is what a practising Nazir identified
> in operation. It is **not** a statutory list confirmed against the Arabic regulation originals or
> Saudi counsel, and it must never be presented as one. Treat every entry as *"verify — may be
> stale (confirm vs primary law)."*

## Why this exists

`LICENSE_RENEWAL` (§3-9 / BR-608) is a statutory deadline rule with **no recorded home**: the only
`licenseExpiry` in the schema is `Vendor`'s — a subcontractor's professional licence, on a table
whose own doc comment reads *"GLOBAL — deliberately NOT waqf-scoped"*. The regulation means the
**endowment's** licences and permits. Engineering could not enumerate them and must not guess; the
owner could. This is that answer.

## Two scopes, not one

The owner's enumeration splits by **what the credential attaches to**, and the split is load-bearing —
these are different levels of the model and must not be merged:

1. **`النوع: مبنى أو أرض`** — the property (building or land). Attaches to an `Asset`.
2. **`على الوقف (المنشأة)`** — the waqf as an operating establishment. Attaches to the `Waqf`.

## Three kinds

`تصاريح` (permits) · `تراخيص` (licences) · `شهادات` (certificates). Kept as a sub-classification
rather than flattened to "licence", because the owner's own table distinguishes them.

## Scope 1 — `النوع: مبنى أو أرض` (the property)

| `تصاريح` permits | `تراخيص` licences | `شهادات` certificates |
|---|---|---|
| `تصريح بناء` | `رخضة إنشاء` ⚠ | `شهادة إنزال مصعد` |
| `تصريح إسكان حجاج` | `ترخيص الدفاع المدني` | `شهادة التزام` |
| | `استمارة كشف على وسائل السلامة في المبنى` ⊘ | `شهادة تفتيش مصعد` |
| | `رخصة سكنى` | `مشهد تعقيم وتنظيف` ⊘ |
| | `إذن شراء (في حال كانت أرض: بعد إزالة الأرض)` ⊕ | `شهادة الكشف على المبنى` |
| | | `صك الملكية` ⊗ |

## Scope 2 — `على الوقف (المنشأة)` (the waqf as an establishment)

All recorded by the owner under `شهادات`:

| | |
|---|---|
| `شهادة الوقف` | `شهادة المديونيات` |
| `شهادة التزام مدد` | `شهادة مدد السعودين` ✎ |
| `شهادة توطين` | `شهادة الزكاة والدخل` |
| `صك النظارة` ⊗ | `شهادة السلامة والصحة المهنية` |
| `صك الوقفية (يحتوي على صكوك الملكية و العقارات)` ⊗ | `شهادة الغرفة التجارية` |

## Owner rulings that came with the list (2026-08-31)

**⊗ DEEDS DO NOT EXPIRE — owner, verbatim: *"deeds dont expire"*.** `صك الملكية`, `صك النظارة` and
`صك الوقفية` are therefore **OUT of the renewal rule**. They are permanent instruments, not
credentials that lapse, and all three already have homes in the model: the title deed on `Asset`,
`صك النظارة` as `TrusteeshipDeed`, `صك الوقفية` as the `Waqf`'s deed. A renewal deadline computed
against a deed would be a deadline against something that never falls due.

**⊘ ATTESTATIONS ARE NOT LICENCES — owner confirmed.** `استمارة كشف على وسائل السلامة في المبنى` and
`مشهد تعقيم وتنظيف` are **attestations / evidence produced**, not credentials with an expiry, so they
are **OUT of the renewal rule** too. (Note `استمارة كشف` sits in the owner's `تراخيص` column; the
ruling governs, not the column.)

**✎ SPELLING, owner-corrected:** the workbook's `شهادة عدد السعودين` is corrected to
**`شهادة مدد السعودين`**. Recorded exactly as the owner gave it — `السعودين`, not `السعوديين`; the
owner corrected `عدد`→`مدد` and did **not** correct the second word, so it is not "improved" here.

## ⚠ What this list is really two lists

Removing ⊗ and ⊘ leaves the set that **expires and must be renewed** — the `LICENSE_RENEWAL` anchor's
actual subject. What was removed does not disappear: deeds and attestations are things the Nazir
**must hold and be able to produce**, which is the **document vault** (E9's own exit, BR-701–703),
not the deadline engine. **One workbook, two features.** Do not let the excluded rows fall out of
the product on their way out of this rule.

## Open — do not resolve in code

- ⚠ **`رخضة إنشاء`** is carried **verbatim from the workbook and is NOT confirmed.** It reads as a
  likely typo for `رخصة إنشاء` (construction licence). The owner corrected a different entry in the
  same round and did not correct this one, so it must not be silently normalised — **ask before it
  becomes a canonical value.**
- ⊕ **`إذن شراء`** carries its own condition in its label — *`في حال كانت أرض: بعد إزالة الأرض`*
  (land only, after clearing). Whether that condition belongs in the value, in a separate
  applicability field, or in guidance is undecided.
- Several scope-2 entries correspond to platforms `GovernmentFilingStatus` already tracks
  (مدد, توطين, الزكاة والدخل, الغرفة التجارية). Whether a given item is a **filing status**, a
  **renewable credential**, or both is unresolved — a filing may produce a certificate with its own
  validity period.
- Whether the closed vocabulary is **closable at all** stays open until real data has been entered.
  Per the owner's 2026-08-31 sequencing ruling, the fields are **operator input now, governance
  refined later** — so this list is the *working* enumeration, not a frozen enum.

## Sources

- `docs/domain/licences-and-permits.xlsx` — the owner's workbook (the artifact this transcribes)
- `docs/product/prd/S4-owner-decision-memo.md` — the S10 addendum recording these rulings
- `packages/domain/src/deadlines/anchors.ts` — `LICENSE_RENEWAL`'s declared remedy and its
  `ANCHOR_HOME_IS_WRONG_SCOPE` routing
