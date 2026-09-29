# 06 · Functional Requirements

Numbered `BR-###`, grouped by module. Priority is **M**ust / **S**hould / **C**ould (MoSCoW; Must = this
release, phase-1 unless noted). "Traces to" links the requirement to its regulatory or operating-model
source; [07 · Compliance traceability](07-compliance-traceability.md) is the reverse index. These are
**business** requirements — the *what*, not the *how*.

Conventions: an **endowment** is one waqf (one certificate). A **client** is a family that may hold
**several endowments across several waqifs** (the first client holds four). Requirements are per-endowment
unless stated.

---

## BR-1xx · Endowment & Deed Management

| ID | Pri | Requirement | Traces to |
|---|---|---|---|
| BR-101 | M | Create and maintain an **endowment (waqf) record** with: waqif, endowment/certificate number, documentation date, **classification** (Large/Medium/Small/Direct-utilization), **waqf type** (public-charitable / private-family-dhurri / joint) and **nature** (in-kind ʿayni / value qiyami), registration-certificate details & validity, and Nazir assignment. | Nazarah reg. Art. 8; classification Art. 1; [glossary](../../domain/glossary.md) |
| BR-102 | M | Model a **client (family)** that owns **one-to-many waqifs**, each owning **one-to-many endowments**; navigate and report at client, waqif, and endowment levels. | Real engagement (4 endowments / 3 waqifs) |
| BR-103 | M | Hold the **Endowment Deed (Sakk al-Waqfiyya)** and record the **Shart al-Waqif** (conditions) as structured, referenceable text driving eligibility and distribution — including the **entitlement-order rule** (ordered *الأعلى فالأعلى*, where a tier excludes the next until extinct, vs shared *tashrik*), the **maintenance reserve**, and the **disbursement channel** (مصرف الريع). | Art. 9; Art. 13 |
| BR-104 | M | Record the **classification** and let it **gate which obligations/tasks apply** (e.g. audited statements & bylaws for Large/Medium only). Support re-classification with history. | Art. 8(3), 9(4), 15 |
| BR-105 | M | Manage the **Trusteeship Deed** with an explicit **Primary Nazir** and optional **Authorized Representative(s)** (delegated manager), including delegated scope; reflect **joint & several liability**. | Art. 11(5) |
| BR-106 | S | Support a **condition-interpretation request** workflow (to the waqif while living, else the competent authority) with status and outcome recorded before dependent actions. | Art. 9(2) |
| BR-107 | S | Track **certificate validity & expiry** and trigger the update obligation (see BR-1002). | Art. 8(2)(a) |
| BR-108 | C | Record **successor-Nazir designation** and appointment provenance (by name/description, or delegated appointer). | Art. 4 |
| BR-109 | M | Capture and **verify Nazir & authorized-representative eligibility**: Islam, legal capacity, qualifications, good conduct (no disqualifying conviction), not previously removed, **Saudi nationality where the endower is foreign & the asset is real property**, **KSA residency**, and (for a legal-person Nazir) **Authority licensing**. | Art. 5; BO Standards Art. 8 |

---

## BR-2xx · Beneficiary & UBO / KYC Management

| ID | Pri | Requirement | Traces to |
|---|---|---|---|
| BR-201 | M | Maintain a **beneficiary (Mustahiq) registry** per endowment, linked to the endowment and to the **Shart al-Waqif** basis for entitlement, with a **share/entitlement** and **status** (e.g. verified / pending / unverified). | Art. 10(3); BO Standards Art. 5 |
| BR-202 | M | Capture the **UBO minimum dataset**: full name, nationality, DOB & place, address, contact, ID type & number; date UBO status acquired; **banking details for proceeds**; nature of relationship; **amount/share of proceeds**. | BO Standards Art. 5 |
| BR-203 | M | Flag which beneficiaries are **Ultimate Beneficial Owners** (founder-with-control, Nazir, other controller, identifiable beneficiary/category) distinctly from ordinary beneficiaries. | BO Standards Art. 4 |
| BR-204 | M | Support **beneficiary lineage / family tree** (branches, generations, relationships), including **tier (ṭabaqa)** and **line (ẓuhūr / buṭūn)** and the **entitlement-order rule** (ordered vs shared), to determine and evidence eligibility across generations. | Real engagement (Family Tree); Art. 13; [glossary §B](../../domain/glossary.md) |
| BR-205 | M | Run **KYC verification & periodic re-verification** against the deed, certificate, and official documents; maintain a **KYC-freshness** state and annual refresh cycle. | BO Standards Art. 6; operating model E-04 |
| BR-206 | M | Record **beneficiary category/characteristics** where no beneficiary is yet identifiable, and block disbursement until captured. | BO Standards Art. 5(5) |
| BR-207 | S | Support a **beneficiary-verification intake** (self-service via portal, BR-8xx; or staff entry) with document capture (e.g. inheritance enumeration deed). | Nazir guide; BO Standards Art. 6(4) |
| BR-208 | M | Maintain **historical payment records & classification per beneficiary** (who was paid what, when, basis). | BO Standards Art. 5(4) |
| BR-209 | S | Support a **UBO disclosure workflow** to financial institutions / DNFBPs / the Authority on request, logging what was disclosed to whom and when. | BO Standards Art. 7 |
| BR-210 | M | Enforce **beneficiary data isolation & access matrix**; treat this data as sensitive personal data. | BO Standards; PDPL ([08](08-nonfunctional-requirements.md)) |

---

## BR-3xx · Property / Asset Management

| ID | Pri | Requirement | Traces to |
|---|---|---|---|
| BR-301 | M | Maintain an **asset (property) register** per endowment: type, **title-deed number(s)**, location, acquisition, valuation, and status; support multiple parcels per endowment. | Art. 12, 15; real engagement (land deeds) |
| BR-302 | M | Manage **leases**: tenant, term, rent, status; track rent collection and **arrears** with follow-up. | Operating model P-01/P-03; unified framework §2 |
| BR-303 | S | Manage **maintenance & operations**: preventive & corrective work orders, vendor/subcontractor supervision, safety, incident log, completion evidence. | Art. 12; framework §2; P-02 |
| BR-304 | S | Track **valuations** by accredited valuers (Taqeem) — relevant to classification thresholds and disposals. | Awqaf Law audit; classification Art. 1 |
| BR-305 | S | Coordinate and evidence **licensed-subcontractor** work per remit (property/facility manager, leasing broker via Ejar, valuer), keeping regulated activity with licensed parties. | Operating model P-01…P-06; zero-tolerance KPI 5 |
| BR-306 | M | Record and enforce that **asset disposal/substitution/pledge/long-lease** are **reserved matters** requiring approval before action (see BR-11xx, BR-4xx). | Art. 12(3), 19; reserved matters |
| BR-307 | S | Support **asset development / capital projects** (عمارة — build up the endowed real estate to grow proceeds), under reserved-matter approval. | Art. 16(4) |

---

## BR-4xx · Expropriation Management (govt takings → compensation → istibdal)

| ID | Pri | Requirement | Traces to |
|---|---|---|---|
| BR-401 | M | Record an **expropriation** event against an asset: initiating authority, scope (full/partial), dates, status. | Real engagement (Expropriations); Art. 12 |
| BR-402 | M | Track **compensation** for expropriated endowed property (assessed value, negotiation, receipt) into a dedicated waqf account (no commingling). | Art. 15(1); Art. 13 |
| BR-403 | M | Drive the **istibdal (substitution)** workflow: obtain competent-authority permission, acquire the replacement asset, and **notify the Authority within 10 business days** of completion with replacement-asset details. | Art. 12(3); Art. 1 (substitution) |
| BR-404 | S | Link expropriation/compensation/replacement so the endowment's asset base and value remain reconstructable and correctly reclassified. | Art. 8(2)(b), 12 |

---

## BR-5xx · Financial Management

| ID | Pri | Requirement | Traces to |
|---|---|---|---|
| BR-501 | M | Manage **dedicated waqf bank account(s)** per endowment; **prevent commingling** with personal or other-endowment funds (segregation is a zero-tolerance control). | Art. 15(1); Awqaf Law Art. 16; KPI 2 |
| BR-502 | M | Capture **revenue** (rents, yields) and **expenses** (maintenance, operations, fees) per endowment; record transactions **in Arabic**; support a **SOCPA-aligned chart of accounts**. | Art. 15(2,4); operating model E-02 |
| BR-503 | M | Perform **periodic bank reconciliation** against the ledger. | Framework §1-1; E-02 |
| BR-504 | M | Prepare **budgets / estimates** (required for Large/Medium — class-gated). | Art. 15(4) |
| BR-505 | M | **Distribution engine:** calculate beneficiary shares per the Shart al-Waqif, **respecting the entitlement order** (ordered tiers exclude the next until extinct; shared tiers split together); **reserve maintenance first, then deduct operating/management/Nazir cost, before distribution**; disburse via dedicated accounts; **where a legal entity disburses, verify it is licensed**; enforce the **3-months-after-year-end** default when no schedule is set; produce per-beneficiary statements (name, share, amount, date, evidence). | Art. 12(2), 13; framework §1-3 |
| BR-506 | M | Require **approval/segregation of duties** on bank movements and distribution runs (initiator ≠ sole approver; Nazir signs). | Reserved matters; RACI |
| BR-507 | M | Support **Nazir remuneration** deducted before distribution. The fee basis is **set by the waqf deed** (Art. 11), not a statutory rate — support configurable bases (**% of revenue**, % of net income, retainer). **This engagement's deed sets 10% of the waqf's _revenue_ (customary ʿushr)** — configure as the default; where a deed is silent, support the authority-determination path. | Art. 11(1); the waqf deed; Awqaf Law Art. 14 = Authority's *own* separate fee |
| BR-508 | S | Support **client invoicing** and engagement/SLA tracking for QMULATE's commercials. | Commercial model ([02](02-business-context.md)) |
| BR-509 | S | Prepare **zakat/tax** filings where applicable and track related obligations/fees/deadlines. | Framework §1-4 |
| BR-510 | S | Record **waqf investments** against a permissible-product list (Sharia-compliant, within risk limits — the compliance check is mandatory *when* investing); products list pending extraction. | Art. 16; [waqf-investment-products](../../domain/regulations/waqf-investment-products.md) |
| BR-511 | M | Support a **cross-border disbursement mechanism** for beneficiaries outside the Kingdom, and **notify the Authority** accordingly. | Art. 10(7) |

---

## BR-6xx · Compliance & Governance

| ID | Pri | Requirement | Traces to |
|---|---|---|---|
| BR-601 | M | Maintain a **templated compliance-task register** generated from the regulation's obligations, tagged by workstream (financial/operational/government-legal), **filtered by classification**, with status, owner, dates, and notes. | Unified framework; Art. 8–20 |
| BR-602 | M | Track **Authority registration & updates** as obligations with their **statutory deadlines** (register 30 bd; update 15 bd) and evidence of filing. | Art. 8 |
| BR-603 | M | Track **government-platform filing statuses** (Awqaf Digital, Baladi, Istihkam, Muqeem, Qiwa, Ejar) as **manual status fields** (no live API). | Domain model; [09](09-data-integration-landscape.md) |
| BR-604 | M | **AML/CTF:** support recording that a **suspicious-activity report** was made to the General Dept. of Financial Intelligence — including the **detailed report** (operation + related parties) and tracking of **follow-up responses** to the FIU — with strict **confidentiality / no tipping-off** controls (restricted visibility; no alerts to the subject). | Art. 10(10); BO Standards |
| BR-605 | M | Maintain **beneficial-owner records** and periodic verification as compliance obligations (links to BR-2xx). | BO Standards Art. 5–8 |
| BR-606 | M | Enforce **internal bylaws / policies** existence for Large/Medium endowments as a tracked obligation. | Art. 9(4), 14(1) |
| BR-607 | M | Maintain a complete, **immutable audit trail** of every material action, approval, and access (see [08 · NFR](08-nonfunctional-requirements.md)). | Art. 20; BO Standards Art. 5(4) |
| BR-608 | S | Track **licences, registrations, permits** and their renewals for waqf activity before expiry. | Framework §3-9 |
| BR-609 | S | Support **Nazir-handover** on trusteeship change: disclose all assets/records, produce a handover pack, and support Authority/SAMA/CMA notifications. | Art. 27; real engagement (Previous Trusteeship Documentation) |
| BR-610 | S | Record **conflict-of-interest** disclosures and block self-dealing with relatives to the 2nd degree. | Art. 18 |
| BR-611 | M | Maintain **internal financial controls** over waqf funds (protection, proper disbursement, optimal utilization) — distinct from conflict-of-interest. | Art. 14(2) |
| BR-612 | M | **Legal & judicial case management:** represent the waqf and track legal matters, litigation & claims, court/committee hearings, execution & collection, legal memos, and related deadlines. | Art. 11(3), 12(1); framework §3-7, §3-8 |
| BR-613 | C | If donation/fundraising is ever undertaken, enforce **prior competent-authority approval**; otherwise record it as out-of-scope for a family waqf. | Art. 10(2); framework §3-3 |

---

## BR-7xx · Document & Records Management (Vault)

| ID | Pri | Requirement | Traces to |
|---|---|---|---|
| BR-701 | M | Provide a **structured document vault** per endowment for: endowment deed, registration certificate, title deeds, trusteeship deeds (primary + authorized-rep), leases, valuations, financials, beneficiary/KYC & AML files, correspondence. | Operating model E-05; Art. 15(3), 20 |
| BR-702 | M | Enforce **retention ≥ 10 years**, an **access matrix**, and full **audit trail** on documents. | Art. 20; BO Standards Art. 7(3) |
| BR-703 | S | Support **versioning** and document metadata (type, endowment, date, source, confidentiality). | E-05 |
| BR-704 | S | Keep **all correspondence on-record** via the dedicated channel, not personal accounts. | Operating model E-01 |

---

## BR-8xx · Client & Beneficiary Portal

| ID | Pri | Requirement | Traces to |
|---|---|---|---|
| BR-801 | M | Provide a **beneficiary self-service portal**: verify/refresh own data & KYC, upload documents, and confirm contact/eligibility details. | Art. 10(3,5); BO Standards Art. 6(4); E-04 |
| BR-802 | M | Let beneficiaries **view their own statements, entitlements, and distribution history** (own data only). | Art. 10(9); reporting cadence |
| BR-803 | M | Provide a **Family Board (client-admin) view**: quarterly/annual reporting, KPI dashboard, property/beneficiary status, compliance calendar; record **reserved-matter approvals/decisions**. | Reporting cadence; RACI; reserved matters |
| BR-804 | M | Provide an **on-record communication channel** for inquiries/suggestions/complaints, logged and answered (supports the annual General Meeting & quarterly Q&A). | Art. 10(5); operating model |
| BR-805 | S | Support **beneficiary disclosure** outputs required at the annual meeting (by class). | Art. 10(9), 13 |
| BR-806 | M | Enforce that portal users see **only their own / their family's** data, with the access matrix and audit trail. | PDPL; BO Standards |

---

## BR-9xx · Reporting & Dashboards

| ID | Pri | Requirement | Traces to |
|---|---|---|---|
| BR-901 | M | **Compliance dashboard:** regulatory deadlines, KYC freshness, AML alerts, filing statuses, and decisions required — surfacing the **zero-tolerance KPIs**. | Operating model E-06; KPIs |
| BR-902 | M | **Financial reporting:** cash position, revenue/expense, distributions, arrears; **class-appropriate** statements (SOCPA-audited for Large/Medium; annual statement for Small/direct-utilization). | Art. 15(4,5); Awqaf Law Art. 20 |
| BR-903 | M | **Cadence reporting:** monthly pack (to QMULATE), quarterly pack (to Family Board), annual pack (to beneficiaries & Authority). | Reporting cadence |
| BR-904 | S | **Portfolio view** across clients/waqifs/endowments for QMULATE leadership. | Leadership role |
| BR-905 | S | **Beneficiary/UBO reporting** and disclosure exports for the Authority and audit. | BO Standards Art. 7 |
| BR-906 | S | Produce an **audit-ready evidence pack** on demand (financials + supporting evidence). | Art. 21; SOCPA audit |

---

## BR-10xx · Notifications & Deadline Engine

| ID | Pri | Requirement | Traces to |
|---|---|---|---|
| BR-1001 | M | A **deadline engine** computing statutory dates and reminding ahead of them: **register 30 bd**, **update 15 bd**, **substitution notice 10 bd**, **distribution within 3 months** of fiscal year-end. | Art. 8, 12, 13 |
| BR-1002 | M | Trigger the **15-business-day update** obligation on **certificate expiry** or any **material change** (asset / beneficiaries / Nazarah). | Art. 8(2) |
| BR-1003 | M | Support **Hijri and Gregorian** dates throughout (statutory dates are often Hijri). | KSA context ([08](08-nonfunctional-requirements.md)) |
| BR-1004 | S | Escalate overdue/at-risk obligations per **escalation paths** to the Nazir/leadership. | Operating model E-03 |
| BR-1005 | S | Remind on **KYC refresh**, **certificate renewals**, **licence/permit** expiries, and **reporting cadence** dates. | BO Standards Art. 6; framework §3-9 |

---

## BR-11xx · Engagement Lifecycle, RACI & Reserved-Matter Approvals

| ID | Pri | Requirement | Traces to |
|---|---|---|---|
| BR-1101 | M | Support **gated onboarding** (Gate 01 Authority & Legal → Gate 02 Systems & Controls → Gate 03 People/Property/Cadence); block downstream activity until the prior gate clears. | Operating model (handover gates) |
| BR-1102 | M | Implement **reserved-matter approval workflows**: the defined actions require prior **written principal approval + counsel review + competent-authority approval/notice where required** before execution. | Reserved matters; Art. 9,12,13,16,19 |
| BR-1103 | M | Encode the **RACI**: Family Board (Principal), Nazir (Accountable), QMULATE (Mandate Lead), Counsel, Auditor, Subcontractors, Authority — so approvals/notifications route correctly and accountability stays with the Nazir. | Operating model (RACI) |
| BR-1104 | S | Track **training & competency** completion (Nazarah reg., waqf foundations, AML/CTF, SAMA, finance, CRM, vault) for staff. | Operating model E-07; Art. 14(4) |
| BR-1105 | S | Templatize a new-endowment setup (tasks, vault structure, roles, access matrix) for **fast onboarding**. | Goals ([03](03-vision-scope.md)) |
| BR-1106 | M | **Import / migrate existing records** for the first client (endowments, beneficiaries, documents, financials) from current SharePoint/spreadsheet sources into the platform. | Onboarding reality |

---

## Read next

[07 · Compliance traceability](07-compliance-traceability.md).
