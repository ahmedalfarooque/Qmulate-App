# 04 · Stakeholders & Roles

Two user populations: **QMULATE internal** (the operations app) and **external** (the client/beneficiary
portal), plus **oversight** parties who receive outputs. Accountability derives from the mandate RACI
([`../../company/operating-model.md`](../../company/operating-model.md)); **legal accountability remains
undivided with the Nazir** — the platform enforces process but does not shift liability.

## Internal users (operations app)

| Role | Responsibilities | Representative permissions |
|---|---|---|
| **Nazir (Accountable Governor)** | Full legal governance of assigned endowments; approves distributions, filings, reserved matters. | Full read/write on assigned endowments; approve/sign; cannot be bypassed on reserved matters. |
| **Authorized Representative** (delegated manager) | Delegated day-to-day acts under the Nazir; **jointly and severally liable** (Nazarah reg. Art. 11.5). | Scoped write per delegation; actions attributed and visible to the Nazir. |
| **Trustee Operations / Case Manager** | Runs the compliance calendar, tasks, filings, document vault, subcontractor coordination. | Read/write ops, tasks, documents; submit for Nazir approval. |
| **Finance / Accounting** | Bank accounts, revenue/expense capture, reconciliation, budgets, distribution runs, Nazir-fee & invoicing. | Read/write finance; initiate (not solely authorize) bank movements; no commingling. |
| **Legal / Compliance Officer** | Awqaf registration/updates, AML/CTF monitoring & reporting, KYC/UBO oversight, reserved-matter routing, audit trail. | Read across; write compliance; raise/close obligations; restricted AML-report handling. |
| **Admin / Onboarding** | Set up endowments, roles, access matrix, templates. | Configuration & user/role management. |
| **QMULATE Leadership** | Portfolio oversight across engagements; approvals per authority matrix. | Read portfolio dashboards; approvals within authority. |

## External users (client / beneficiary portal)

| Role | Responsibilities | Representative permissions |
|---|---|---|
| **Family Board (Principal / client admin)** | Strategic direction; approves reserved matters; guardian of the Waqif's intent; receives quarterly/annual reporting. | Read reporting for their endowment(s); record approvals/decisions; manage family-side contacts. |
| **Beneficiary (Mustahiq)** | Self-service: verify/refresh their own data, view their statements & distributions, upload documents, raise inquiries/complaints. | Read own entitlements/statements; submit own KYC & documents; messaging. No access to other beneficiaries' data. |

## Oversight / third parties (receive outputs; limited or no direct access)

| Party | Interaction |
|---|---|
| **General Authority for Awqaf** | Recipient of registrations, updates, filings; status tracked in-platform (manual, no API). |
| **SOCPA Auditor** | Independent assurance; consumes audit-ready financials & evidence packs (export/scoped access). |
| **Saudi Counsel** | Reserved-matter review, interpretation; scoped access to relevant matters/documents. |
| **General Dept. of Financial Intelligence (State Security)** | Recipient of AML/CTF suspicious-activity reports (out-of-band; platform records that a report was made, with strict confidentiality / no tipping-off). |
| **Licensed Subcontractors** (P-01…P-06: property/facility manager, leasing broker, registry/legal liaison, accounting support, valuer) | Scoped task access to their remit; submit evidence; no bank or legal authority unless separately approved. |

## Role × permission principles (business-level; detailed matrix in design)

- **Least privilege + explicit access matrix** per endowment (regulation requires an access matrix over
  sensitive data; PDPL + Beneficial Ownership Standards).
- **Segregation of duties** on money: the person who initiates a bank movement/distribution is not the sole
  approver; Nazir (and reserved-matter approvers) sign off.
- **Beneficiary data isolation:** a beneficiary sees only their own data.
- **Every access and change is audit-logged** ([08 · NFR](08-nonfunctional-requirements.md)).
- **Delegation is first-class:** authorized-representative scope is explicit, time-bound, and attributed.

## Read next

[05 · Operating model](05-operating-model.md).
