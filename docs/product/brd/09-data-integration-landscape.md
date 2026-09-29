# 09 · Data & Integration Landscape

Business-level view of the external touchpoints the platform interacts with. **No conceptual data model or
architecture here** (deliberately out of scope — [00](00-document-control.md)); this describes *what the
platform coordinates with*, and the important constraint that most touchpoints are **manual**.

## Government & regulatory platforms — manual status tracking (no live APIs)

No public APIs are evidenced in the source material. These are modeled as **status fields + document
evidence + deadline reminders**, not automated integrations (BR-603).

| Platform | Purpose in the engagement |
|---|---|
| **Awqaf Digital** (`digital.awqaf.gov.sa`) | Waqf registration, data updates, beneficiary verification, filings with the Authority. |
| **Baladi** | Municipal / property matters. |
| **Istihkam** | Government platform touchpoint (status tracked). |
| **Muqeem** | Residency/identity checks relevant to eligibility. |
| **Qiwa** | Labour/employment (staff/subcontractors). |
| **Ejar** | Lease documentation (via licensed leasing broker). |

> [!note] If any of these later expose an API, an integration can replace the manual status field — but it
> is **not assumed** and not required for this release.

## Financial institutions

- **Dedicated waqf bank accounts** at SAMA-supervised / licensed Saudi banks; funds never commingled.
- Bank statements are brought in (manually or by import) for **reconciliation** (BR-503). Direct bank
  integration is **not** assumed.

## Documents

- Deeds, certificates, title deeds, trusteeship deeds, leases, valuations, financials, KYC/AML files,
  correspondence live in the **document vault** (BR-7xx) with retention, access matrix, and audit trail.
- Source documents originate as PDFs/scans; the platform stores and organizes them (OCR/extraction is a
  possible enhancement, not a requirement here).

## People / identity data

- Beneficiary & UBO personal data (identity, banking, shares) is the platform's most sensitive data —
  governed by PDPL and the Beneficial Ownership Standards ([08 · NFR](08-nonfunctional-requirements.md)).

## Outbound reporting

- Regulator filings, beneficiary disclosures, and auditor evidence packs are **produced by the platform**
  and delivered out-of-band (upload/export), consistent with the manual-integration posture.

## Read next

[10 · Assumptions & open questions](10-assumptions-open-questions.md).
