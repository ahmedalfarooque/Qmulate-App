# 08 · Non-Functional Requirements

Business-level qualities the platform must have (the *how well*, not the *how*). Numbered `NFR-##`.
Detailed technical targets (SLAs, tooling) are for later design.

| ID | Pri | Requirement | Why |
|---|---|---|---|
| NFR-01 | M | **Bilingual Arabic/English with full RTL** support; official records (financial transactions) must be storable **in Arabic**. | Nazarah reg. Art. 15(2); KSA users |
| NFR-02 | M | **Hijri & Gregorian** dates throughout, including statutory-deadline computation. | Statutory dates are Hijri (BR-1003) |
| NFR-03 | M | **Data residency in KSA** and handling consistent with the **Personal Data Protection Law (PDPL)**. | PDPL; sensitive beneficiary/UBO data |
| NFR-04 | M | **Immutable, complete audit trail** of every material action, approval, and access (who, what, when, before/after). | Art. 20; record-keeping; disputes |
| NFR-05 | M | **Confidentiality & least-privilege access** via a per-endowment **access matrix**; enforce segregation of beneficiary data; support AML **no-tipping-off** restrictions. | Art. 22; BO Standards; PDPL |
| NFR-06 | M | **Security**: authentication, role-based authorization, encryption in transit & at rest, secrets management. | Sensitive financial & PII data |
| NFR-07 | M | **Retention ≥ 10 years** with rapid retrieval; controlled deletion respecting retention. | Art. 20; BO Standards Art. 7(3) |
| NFR-08 | S | **Segregation of duties** enforceable in workflow (maker/checker on money & filings). | Commingling & fraud controls |
| NFR-09 | M | Enforce **eligibility constraints** in data (e.g. Nazir must be **KSA resident**; Saudi-nationality rule where endower foreign & asset real property). | BO Standards Art. 8; Nazarah reg. Art. 5 |
| NFR-10 | S | **Availability & reliability** appropriate to deadline-critical compliance work; no silent data loss. *(measurable targets TBD in design.)* | Zero-tolerance KPIs |
| NFR-11 | S | **Accessibility** and clear UX for non-technical users (beneficiaries, family board). *(targets TBD in design.)* | Portal adoption |
| NFR-12 | S | **Auditability/exportability** — produce evidence packs and regulator/auditor exports without engineering effort. | Art. 21; SOCPA audit |
| NFR-13 | C | **Configurability** of parameters (fee basis, classification thresholds, deadline windows, reporting cadence) without code changes. | Commercial specifics TBD; regime may change |
| NFR-14 | S | **Data integrity & reconciliation** — financial records reconcile to bank; no orphaned distributions. | Art. 15; BR-503 |

## Read next

[09 · Data & integration landscape](09-data-integration-landscape.md).
