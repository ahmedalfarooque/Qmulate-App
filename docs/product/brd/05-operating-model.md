# 05 · Operating Model

How QMULATE performs Nazarah — the operating reality the platform must digitize. Condensed from
[`../../company/operating-model.md`](../../company/operating-model.md), the Nazarah regulation, and
QMULATE's [unified framework](../../domain/unified-framework.md).

## Two layers held together

- **Legal Mandate** — the statutory duties the Authority imposes on the **Nazir**, who is personally
  accountable.
- **Executive Mandate** — the controlled **systems** QMULATE stands up, delivered partly through **licensed
  subcontractors**, to discharge the legal mandate. QMULATE is advisory / supervisory / execution-
  coordination unless expanded in writing.

## The three workstreams

QMULATE's unified framework organizes all Nazir work into three workstreams — these are the backbone of
the functional requirements:

1. **Financial** — accounting, financial management, distribution, zakat/tax. → `BR-5xx`
2. **Operational (real estate)** — property management, leasing, maintenance, operations. → `BR-3xx`
3. **Government & Legal** — Authority registration/compliance, condition execution, AML/CFT, legal,
   judicial, regulatory, governance. → `BR-6xx` (+ `BR-1xx`, `BR-4xx`, `BR-7xx`)

Beneficiaries (`BR-2xx`) cut across all three.

## Endowment lifecycle (drives the deadline engine & tasks)

```
Onboard/Discovery → Register → Operate → Distribute → Report → Renew/Review
```

- **Onboard / Discovery** — confirm regulatory perimeter, **classification**, the Waqif's conditions
  (ambiguity → written interpretation first), and stand up systems. *Nothing downstream proceeds until the
  prior gate clears* (Gates 01–03 in the operating model).
- **Register** — waqf + all assets with the Authority within **30 business days**; keep data current
  (update within **15 business days** of certificate expiry or material change).
- **Operate** — manage properties (lease, maintain), keep books in Arabic on dedicated accounts, verify
  beneficiaries/UBO, run compliance calendar, coordinate subcontractors.
- **Distribute** — calculate shares per the Waqif's conditions; deduct maintenance/operating/Nazir cost
  **before** distribution; pay via dedicated accounts; within **3 months** of fiscal year-end if no
  schedule set; document every disbursement.
- **Report** — monthly (to QMULATE), quarterly (to Family Board), annual (to beneficiaries & Authority);
  audited or annual statement **by class**.
- **Renew / Review** — certificate renewals, re-verification (KYC/UBO), classification review, condition
  re-interpretation as needed.

## Key concepts the model depends on (glossary in [12](12-appendices.md))

- **Waqf**, **Waqif**, **Shart al-Waqif** (binding conditions), **Nazir**, **Nazarah**, **Mustahiq**
  (beneficiary), **Ghallah** (proceeds), **Sakk al-Waqfiyya** (deed). Full definitions:
  [`../../domain/glossary.md`](../../domain/glossary.md).
- **Waqf type & nature** — public/charitable (خيري) vs private/family-*dhurri* (أهلي/ذري) vs joint
  (مشترك); and in-kind *ʿayni* (عيني — e.g. real estate) vs value/*qiyami* (قيمي — e.g. cash/companies).
  Type shapes eligibility; nature shapes investment.
- **Generational layers & order of entitlement** — beneficiaries are grouped by **tier (ṭabaqa / طبقة)**
  and line (**ẓuhūr / buṭūn**). The shart is either **ordered** (*الأعلى فالأعلى* — an upper tier excludes
  the next until it is extinct) or **shared** (*tashrik* — tiers split together). This determines *who* is
  eligible and *how much* — so shares are **not** a flat list.
- **Maintenance reserve (صيانة)** — the waqif's stipulated maintenance takes **priority over any
  disbursement**; reserved before yield is shared.
- **Primary vs Authorized-representative trusteeship** — the Nazir may delegate functions; delegate is
  jointly and severally liable (Art. 11.5). The engagement folder mirrors this (Primary + Authorized-rep
  trusteeship deeds).
- **istibdal (asset substitution)** — replacing an endowed asset (e.g. after **expropriation**) by moving
  its value to a replacement asset; requires Authority permission + **10-business-day** notice.
- **Beneficial owner (UBO)** — per the Beneficial Ownership Standards, distinct from ordinary beneficiary;
  drives KYC depth.
- **Reserved matters** — actions requiring prior written approval (deviation from conditions, substitution,
  disposals, long leases/settlements/major capex, fundraising, bank movements/commingling risk, non-Sharia
  investment, data disclosure, out-of-mandate appointments).

## Reporting cadence & zero-tolerance KPIs (become requirements)

- **Monthly → QMULATE; Quarterly → Family Board (+ Q&A); Annual → Beneficiaries & Authority (+ General
  Meeting).**
- **Zero-tolerance KPIs:** on-time Authority registration/updates · no commingling · current beneficial-
  recipient KYC · no missed AML/CTF reports · no unlicensed regulated real-estate activity. These map to
  hard controls and dashboard alerts (`BR-9xx`; [09 · Data & integration](09-data-integration-landscape.md)).

## Read next

[06 · Functional requirements](06-functional-requirements.md).
