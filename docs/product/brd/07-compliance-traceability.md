# 07 · Compliance Traceability Matrix

Every material regulatory obligation → the requirement(s) that satisfy it. This is the assurance that
nothing statutory is missed. Sources: [Nazarah regulation (EN)](../../domain/regulations/nazarah-regulation-en.md),
[Beneficial Ownership Standards](../../domain/regulations/beneficial-ownership-standards.md),
[Awqaf Law](../../domain/regulations/awqaf-law.md). Requirement IDs are defined in
[06 · Functional requirements](06-functional-requirements.md) and [08 · NFR](08-nonfunctional-requirements.md).

## Nazarah regulation — Activities of the Nazir

| Obligation | Article | Requirement(s) |
|---|---|---|
| Register waqf + all assets within **30 business days** | 8(1) | BR-602, BR-1001 |
| Update waqf data within **15 business days** (certificate expiry / material change) | 8(2) | BR-107, BR-1002 |
| Apply and maintain **classification** (drives obligations) | 8(3), 1 | BR-104, BR-601 |
| **Appointment conditions** of the Nazir (Islam, capacity, qualifications, conduct, Saudi-nationality where applicable, legal-person licensing) | 5 | BR-109 |
| Implement the **Shart al-Waqif** (incl. tier order-of-entitlement); no deviation without approval | 9(1,5) | BR-103, BR-204, BR-1102 |
| **Interpretation** of conditions (waqif/authority) before dependent action | 9(2) | BR-106 |
| Internal **bylaws** for Large/Medium | 9(4), 14(1) | BR-606 |
| Make information available to beneficiaries; stakeholder channel | 10(3,5) | BR-801, BR-804 |
| Cross-border transfer rules (SAMA); disbursement mechanism for beneficiaries abroad + Authority notice | 10(6,7) | BR-501, BR-511 |
| **Collect/verify beneficial-owner data; keep current** | 10(8) | BR-202, BR-205, BR-605 |
| Periodic **financial statements to beneficiaries** (Large/Medium) | 10(9) | BR-802, BR-902, BR-903 |
| **AML/CTF suspicion report**; confidentiality / no tipping-off | 10(10) | BR-604 |
| **Nazir remuneration** (deed or authority-set) | 11(1) | BR-507 |
| **Delegation** with joint & several liability (authorized representative) | 11(5) | BR-105 |
| Protect the waqf; maintain/repair; **deduct cost before distribution** | 12(1,2) | BR-303, BR-505 |
| **Represent the waqf** & legal standing; judicial matters | 11(3), 12(1); §3-8 | BR-612 |
| **No asset substitution without permission**; notify within **10 business days** | 12(3) | BR-306, BR-403 |
| Disburse per conditions via **dedicated accounts**; **3 months** default; document all | 13 | BR-501, BR-505 |
| Administration: internal policies, **internal controls**, competent staff, **AML training** | 14 | BR-606, BR-611, BR-1104 |
| **Dedicated bank account, no commingling**; **Arabic** records; orderly docs; **audited (SOCPA)** for L/M; annual statement for Small/direct | 15 | BR-501, BR-502, BR-701, BR-902 |
| Sharia-compliant **investment** within risk limits; develop asset | 16 | BR-510, BR-304, BR-307 |
| **Conflict of interest** — no self-dealing (relatives ≤ 2nd degree) | 18 | BR-610 |
| **Pledging** only with permission + notice | 19 | BR-306, BR-1102 |
| **Record keeping ≥ 10 years**, rapid access | 20 | BR-607, BR-702 |
| Provide info/reports to Authority; full cooperation with examination | 21 | BR-603, BR-906 |
| **Confidentiality** of information (survives engagement) | 22 | BR-604, NFR-05 |
| Handover on **removal/termination** (assets, records, notify SAMA/CMA) | 27 | BR-609 |

## Beneficial Ownership Standards

| Obligation | Article | Requirement(s) |
|---|---|---|
| Identify **UBO** (founder-with-control / Nazir / other controller / identifiable beneficiary) | 4 | BR-203 |
| **Minimum UBO dataset** (identity, banking, share of proceeds, relationship) | 5(1) | BR-202 |
| Legal-entity UBO & professional-service-provider details | 5(2,3) | BR-202, BR-209 |
| **Payment records & historical classification** per beneficiary | 5(4) | BR-208 |
| Beneficiary **category** where none identifiable; block disbursement until captured | 5(5) | BR-206 |
| **Periodic verification** against deed/certificate; update on change | 6(1,2) | BR-205 |
| Risk-based verification; beneficiaries provide info | 6(3,4) | BR-205, BR-801 |
| **Disclosure** to FIs/DNFBPs/Authority; disclose Nazir capacity | 7(1) | BR-209 |
| **Retain ≥ 10 years**; **handover originals** on term end | 7(3,4) | BR-702, BR-609 |
| Nazir must be **KSA resident**; no management by non-residents | 8(1) | BR-109, NFR-09 |

## Awqaf Law (M/11)

| Obligation / rule | Article | Requirement(s) |
|---|---|---|
| **Segregated accounts** with SAMA/licensed bank | 16 | BR-501 |
| **Audit** by licensed/SOCPA auditor | 20 | BR-902, BR-906 |
| Fee benchmark **≤ 10% of net income** — the Authority's own fee for endowments **not** under its trusteeship (external benchmark, not a cap on QMULATE's fee) | 14 | BR-507 |
| Comply with endower conditions, Sharia, law in all actions | 23 | BR-103, BR-1102 |

## Zero-tolerance KPIs (operating model) → controls

| KPI | Requirement(s) |
|---|---|
| On-time Authority registration & updates | BR-602, BR-1001, BR-1002, BR-901 |
| No commingling | BR-501, BR-506 |
| Current beneficial-recipient KYC | BR-205, BR-901 |
| No missed AML/CTF reports | BR-604, BR-901 |
| No unlicensed regulated real-estate activity | BR-305 |

## Coverage note

Requirements not tied to a specific obligation (e.g. BR-102 client/waqif hierarchy, BR-204 lineage,
BR-4xx expropriation, BR-8xx portal breadth, BR-9xx dashboards) exist because the **real engagement** and
the **operating model** demand them, even where the regulation is silent. Conversely, every obligation in
the tables above maps to at least one requirement. Gaps discovered in review should be added here first,
then to [06](06-functional-requirements.md).

## Read next

[08 · Non-functional requirements](08-nonfunctional-requirements.md).
