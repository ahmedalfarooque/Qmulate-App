# 12 · Appendices

## A. Glossary (quick reference)

The **canonical glossary** is [`../../domain/glossary.md`](../../domain/glossary.md) — the Authority's
official terms plus the generational-layer terms; cross-linked notes live in the Obsidian vault. Key terms:

| Term | Meaning |
|---|---|
| **Waqf (وقف)** | Islamic endowment; asset locked in perpetuity, its proceeds allocated to beneficiaries/causes. |
| **Waqif (واقف)** | The founder who establishes the waqf. |
| **Shart al-Waqif (شرط الواقف)** | The founder's binding conditions (who benefits, how, order). |
| **Nazir (ناظر)** | The trustee — the role QMULATE performs. "Beholder" in the official EN translation. |
| **Nazarah (النظارة)** | The body of trustee duties. "Beholding" in the official EN translation. |
| **Mustahiq (مستحق)** | Beneficiary entitled to proceeds. |
| **Ghallah / ʿAwaʾid (غلة/عوائد)** | Proceeds/yield distributed to beneficiaries. |
| **Sakk al-Waqfiyya (صك الوقفية)** | The waqf deed (founding document). |
| **istibdal (استبدال)** | Substitution of an endowed asset (e.g. after expropriation) by transferring value to a replacement. |
| **UBO** | Ultimate Beneficial Owner (Beneficial Ownership Standards). |
| **Classification** | Large ≥ SAR 200M / Medium 50–200M / Small < 50M / Direct-utilization. |
| **SOCPA** | Saudi Organization for Chartered and Professional Accountants (audit standard). |
| **DNFBP** | Designated Non-Financial Businesses and Professions (AML disclosure counterparties). |
| **REGA** | Real Estate General Authority (brokerage law; Ejar lease documentation). |
| **Taqeem** | Saudi Authority for Accredited Valuers. |
| **PDPL** | Personal Data Protection Law (KSA). |
| **Gov platforms** | Awqaf Digital (Authority), Baladi (municipal), Istihkam, Muqeem (residency), Qiwa (labour), Ejar (leases) — tracked as manual statuses. |
| **Waqf type / nature** | Public-charitable (خيري) / private-family-dhurri (أهلي·ذري) / joint (مشترك); in-kind *ʿayni* (عيني) / value *qiyami* (قيمي). |
| **Tier & order** | Tier = *ṭabaqa* (طبقة, a generation); lines *ẓuhūr / buṭūn*; entitlement **ordered** (الأعلى فالأعلى — a tier excludes the next until extinct) or **shared** (*tashrik*). |
| **ʿUshr (عُشر)** | Customary Nazir remuneration = 10% of the waqf's revenue, when the deed so sets it (contractual, not statutory). |

## B. Source register (provenance & confidentiality tier)

| Source | Location | Tier | Ingested to |
|---|---|---|---|
| Awqaf Law (M/11) EN+AR | SharePoint `References & Regulations/` | Public | [`../../domain/regulations/awqaf-law.md`](../../domain/regulations/awqaf-law.md) |
| Nazarah regulation (EN, 32 arts) | SharePoint `References & Regulations/` | Public | [`../../domain/regulations/nazarah-regulation-en.md`](../../domain/regulations/nazarah-regulation-en.md) |
| Nazarah regulation (AR) | SharePoint (client folder) | Public | [`../../domain/nazarah-regulation.md`](../../domain/nazarah-regulation.md) |
| Beneficial Ownership Standards (Dec 2025) EN+AR | SharePoint `References & Regulations/` | Public | [`../../domain/regulations/beneficial-ownership-standards.md`](../../domain/regulations/beneficial-ownership-standards.md) |
| Waqf Investment Products list (AR) | SharePoint `References & Regulations/` | Public | [stub](../../domain/regulations/waqf-investment-products.md) (extraction pending) |
| QMULATE letterhead + CR + VAT certs | SharePoint `Company Details/` + root | Company | [`../../company/company-profile.md`](../../company/company-profile.md) |
| Endowment Mandate Memorandum V2.0 | Colleague OneDrive / Teams (⚠ outside linked folder) | Company (client instance → archive) | [`../../company/operating-model.md`](../../company/operating-model.md) |
| Brand guidelines (HTML/PDF/SVG) | SharePoint `Company Details/Branding1/` | Company | existing `docs/brand/` |
| **First client engagement** (4 endowments / 3 waqifs — deeds, beneficiaries, financials, family tree) | SharePoint client folder (confidential) | **Confidential (client)** | **gitignored** archive (see repo `.gitignore`) |

## C. Regulation index

- [Awqaf Law](../../domain/regulations/awqaf-law.md) · [Nazarah regulation (EN)](../../domain/regulations/nazarah-regulation-en.md) ·
  [Nazarah regulation (AR)](../../domain/nazarah-regulation.md) ·
  [Beneficial Ownership Standards](../../domain/regulations/beneficial-ownership-standards.md) ·
  [Unified framework](../../domain/unified-framework.md) · [Nazir guide](../../domain/nazir-guide.md)

## D. Related repo material

- Sample (anonymized) data: `data/fixtures/sample-waqf.json`
- Domain model & glossary: [`../../domain/`](../../domain/), CLAUDE.md
- Obsidian knowledge base: `Qmulate/` vault (BRD mirrored under `BRD/`)

---

*End of BRD v0.1. Review, then raise gaps against [06](06-functional-requirements.md) /
[07](07-compliance-traceability.md).*
