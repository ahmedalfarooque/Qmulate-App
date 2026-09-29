# 10 · Roles, permissions & access-matrix spec

The concrete RBAC model, per-endowment access matrix, segregation-of-duties rules, and the code ladder that enforces them — the build-facing authority model for every screen, procedure, and query in the platform.

Status: Draft v0.1 · Privileged & Confidential

This section turns the BRD's stakeholder model ([04 · Stakeholders & Roles](../brd/04-stakeholders-roles.md)) and the operating-model RACI ([`operating-model.md`](../../company/operating-model.md)) into an implementable authorization system: a role catalogue, a read/write/approve/sign permission **grid**, first-class **delegation**, hard **beneficiary isolation**, an **AML no-tipping-off** compartment, and the exact enforcement path — `WaqfAccessGrant` → the tRPC procedure ladder → a defence-in-depth Prisma force-filter. It grounds [NFR-05](../brd/08-nonfunctional-requirements.md) (least-privilege access matrix), [NFR-08](../brd/08-nonfunctional-requirements.md) (segregation of duties), [NFR-06](../brd/08-nonfunctional-requirements.md) (authz/authn), [NFR-04](../brd/08-nonfunctional-requirements.md) (audit), and [NFR-09](../brd/08-nonfunctional-requirements.md) (eligibility constraints).

**The one rule that frames everything below:** authorization is a **process and attribution** mechanism. It enforces who may do what, records who did it, and blocks self-approval — but it **never shifts legal accountability, which stays undivided with the Nazir** ([`operating-model.md`](../../company/operating-model.md)). Delegation, maker-checker, and approvals are attribution mechanics, not liability transfers.

---

## 1 · Design principles (decided)

1. **Deny by default.** No grant → no access. There is no ambient "logged-in can read" tier; every domain read/write resolves through a `WaqfAccessGrant` for the target endowment.
2. **Scope is the endowment, not the client.** A grant is per-**waqf/endowment** (`waqfId`), never per-family. A user assigned to endowment A holds nothing on endowment B, even within the same client family. Cross-endowment access requires a distinct grant per endowment.
3. **Capability, not just role.** A grant carries a role **and** an explicit permission set (`read | write | approve | sign` × module). Roles are presets that expand into permissions; the check always evaluates the resolved permission, so custom scoping (a scoped subcontractor, a time-boxed delegate) is expressible without inventing new roles.
4. **Maker ≠ checker is structural.** On money movements and statutory filings, the initiator can never be the sole/final approver — enforced in the procedure layer, not by convention ([NFR-08](../brd/08-nonfunctional-requirements.md)).
5. **Beneficiaries are isolated by identity, not by role.** A beneficiary sees only rows tied to their own `beneficiarySelfId`; isolation is a row-level filter applied *before* any role logic ([BR-210](../brd/06-functional-requirements.md), [NFR-05](../brd/08-nonfunctional-requirements.md)).
6. **AML is a compartment, not a permission level.** The suspicious-activity-report compartment is invisible to everyone outside it — it does not appear, greyed-out or count-only, to unauthorized roles ([BR-604](../brd/06-functional-requirements.md)).
7. **Every access and mutation is audit-logged** (who / what / when / before / after), including *denied* attempts on sensitive resources ([BR-607](../brd/06-functional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md)).
8. **Defence in depth.** The same rule is enforced at three layers — UI capability gating, the tRPC procedure ladder, and a Prisma client extension that force-filters every query by the caller's grant set. A bug in one layer must not open the data.

---

## 2 · Role catalogue

Roles are grouped by population. Each maps to a RACI party ([`operating-model.md`](../../company/operating-model.md) §Accountability) and to the BRD role rows ([04 · Stakeholders & Roles](../brd/04-stakeholders-roles.md)). "Seat?" = holds a login; oversight parties without seats are export/scoped-access consumers, not general users.

### 2.1 Internal — operations app (QMULATE staff)

| Role key | Role | RACI party | Seat? | Authority posture |
|---|---|---|---|---|
| `nazir` | **Nazir — Accountable Governor** | Accountable | Yes | Full read/write on **assigned** endowments; **sole holder** of `sign` on reserved matters and final `approve` on money/filing runs; **cannot be bypassed**. TOTP required for every `approve`/`sign`. [BR-105](../brd/06-functional-requirements.md) [BR-1103](../brd/06-functional-requirements.md) |
| `authorized_rep` | **Authorized Representative — Delegated Manager** | Accountable (joint & several) | Yes | Scoped write **within an active delegation grant only**; may `initiate` but never solely `authorize` a reserved matter; every act attributed to the individual and visible to the Nazir. [BR-105](../brd/06-functional-requirements.md) |
| `case_manager` | **Trustee Ops / Case Manager** | Mandate Lead (QMULATE) | Yes | Read/write on tasks, filings, calendar, documents; **submits** money/filing/reserved items for approval; no bank-movement or sign authority. |
| `finance` | **Finance / Accounting** | Mandate Lead (QMULATE) | Yes | Read/write finance; **initiates** (never solely authorizes) bank movements & distribution runs; maker under SoD; commingling hard-blocked. [BR-506](../brd/06-functional-requirements.md) |
| `compliance_officer` | **Legal / Compliance Officer** | Mandate Lead (QMULATE) | Yes | Read across assigned endowments; write compliance/UBO/KYC/legal-case state; raise/close obligations; **AML-compartment member** (see §6); no money authorization. |
| `aml_officer` | **AML/CTF Reporting Officer** (compartment role) | Mandate Lead (QMULATE) | Yes | The *only* role that can read/write the AML SAR compartment (§6). Usually held **in addition** to `compliance_officer`. Membership is explicit and per-endowment; never implied by seniority. [BR-604](../brd/06-functional-requirements.md) |
| `admin` | **Admin / Onboarding** | Mandate Lead (QMULATE) | Yes | Configuration, user/role, and access-matrix management; **cannot `approve`/`sign`** money, filings, or reserved matters (config authority ≠ governance authority). |
| `leadership` | **QMULATE Leadership** | Mandate Lead (QMULATE) | Yes | Read portfolio dashboards across clients/waqifs/endowments; approvals only within delegated authority matrix; **no per-endowment operational write** by default. |

### 2.2 External — client / beneficiary portal (Phase 2; access model scaffolded day one)

| Role key | Role | RACI party | Seat? | Authority posture |
|---|---|---|---|---|
| `family_board` | **Family Board — Principal / client admin** | **Principal** | Yes | Read reporting for **their** endowment(s); record reserved-matter approvals/decisions on-record; manage family-side contacts. **No operational write** into finance/compliance. [BR-1103](../brd/06-functional-requirements.md) |
| `beneficiary` | **Beneficiary (Mustahiq)** | — | Yes | Read **own** entitlements/statements/distributions only; submit own KYC & documents; messaging. **Hard identity isolation** (§5). [BR-210](../brd/06-functional-requirements.md) |

### 2.3 Oversight / third parties (scoped or export-only; no general seat)

| Role key | Party | RACI party | Access model |
|---|---|---|---|
| `subcontractor` | **Licensed Subcontractor** (P-01…P-06) | Subcontractor | **Scoped task access** to assigned work items on one endowment only; submit evidence/documents to their remit; **no** finance, legal, beneficiary-PII, or AML access unless separately granted. [BR-603](../brd/06-functional-requirements.md) |
| `auditor` | **SOCPA Auditor** | Independent assurance | Read-only, **scoped to an audit engagement window**; consumes evidence packs & audit-ready financials (export or read-only scoped grant). [BR-906](../brd/06-functional-requirements.md) |
| `counsel` | **Saudi Counsel** | Legal review | Scoped read on reserved-matter dossiers, legal cases, and relevant documents for matters they are engaged on. [BR-612](../brd/06-functional-requirements.md) [BR-1102](../brd/06-functional-requirements.md) |
| *(no seat)* | **General Authority for Awqaf** | Regulator | Recipient of filings/exports; status tracked as **manual fields**, not a login. [BR-603](../brd/06-functional-requirements.md) |
| *(no seat)* | **General Dept. of Financial Intelligence** | AML recipient | Out-of-band recipient; platform only *records that a SAR was made* inside the AML compartment (§6). No inbound access. |

---

## 3 · The permission grid (read / write / approve / sign × module)

Permissions are the four verbs below, evaluated **per module, per endowment**. A role preset expands into the cells here; a custom grant may narrow (never silently widen) them.

- **R** read · **W** write (create/update draft) · **A** approve (authorize another's initiated action) · **S** sign (final governance signature, reserved matters).
- **`—`** = no access. **`i`** = may *initiate/submit* only (creates a request that a different party must `A`/`S`). **`self`** = own records only (identity-isolated). **`scoped`** = only rows explicitly assigned to this grant. **`aml`** = gated behind AML-compartment membership (§6). Approve/sign cells marked **`A*`/`S*`** require TOTP ([NFR-06](../brd/08-nonfunctional-requirements.md)).

Modules map to the PRD's functional groupings (endowment/deed, beneficiary/UBO, finance/distribution, compliance/filings, documents/vault, reporting, admin/access-matrix, AML compartment).

| Module | `nazir` | `authorized_rep` | `case_manager` | `finance` | `compliance_officer` | `aml_officer` | `admin` | `leadership` | `family_board` | `beneficiary` | `subcontractor` | `auditor` | `counsel` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Endowment & deed** (BR-101–105) | R W S* | R W(scoped) | R W | R | R W | — | R W | R | R | — | — | R | R(scoped) |
| **Beneficiary & UBO** (BR-201–210) | R W | R W(scoped) | R W | R | R W | R | R W(config) | R(agg) | R(agg) | R self / W self | — | R(agg) | R(scoped) |
| **Finance: capture** (BR-501–503) | R W | R W(scoped) | R | R W | R | — | — | R(agg) | R(agg) | R self | — | R | — |
| **Finance: bank/distribution run** (BR-505–506) | R A* S* | R i(scoped) | R i | R W i | R | — | — | R | R | R self | — | R | — |
| **Nazir fee** (BR-507) | R A* | R | R | R W i | R | — | — | R | R | — | — | R | — |
| **Compliance tasks & filings** (BR-601–603) | R W A* | R W(scoped) | R W | R | R W | — | R W(config) | R | — | — | R scoped(i) | R | R(scoped) |
| **AML / SAR compartment** (BR-604) | **aml** | — | — | — | **aml** | **R W aml** | — | — | — | — | — | — | **aml** (if engaged) |
| **Legal & judicial cases** (BR-612) | R W A* | R W(scoped) | R | — | R W | — | — | R | R(agg) | — | — | R(scoped) | R W(scoped) |
| **Document vault** (BR-701–702) | R W | R W(scoped) | R W | R W(finance) | R W | R W aml | R W(config) | R | R(shared) | R self / W self | W scoped | R(evidence pack) | R(scoped) |
| **Reporting & dashboards** (BR-901–902) | R | R(scoped) | R | R | R | R aml | R | R portfolio | R(their endowments) | R self | — | R(export) | R(scoped) |
| **Admin / access matrix** (this doc) | R (own endowments) | — | — | — | — | — | **R W** | R | R(family contacts) | — | — | — | — |
| **Audit trail** (BR-607, NFR-04) | R | R(scoped) | R | R | R | R aml | R | R | — | — | — | R(scoped, read) | R(scoped) |

**Grid rules that the presets must not violate:**

- No internal operational role except `nazir` holds `S` (sign). `A` (approve) on money/filings is held only by `nazir` (and, within the leadership authority matrix, `leadership` for portfolio-level matters) — **never** by the same identity that holds `i`/`W` on the same run.
- `admin` never holds `A`/`S` on domain money/filing/reserved matters. It configures *who can*, which is itself an audited, reserved-adjacent action.
- `beneficiary` never holds any aggregate (`agg`) read — only `self`. `family_board` reads aggregates for their own endowments but never other beneficiaries' individual PII.
- The **AML compartment column** is not "another permission on the compliance module" — it is a separate resource whose very existence is hidden outside `aml` membership (§6).

---

## 4 · Segregation of duties (maker ≠ checker)

Enforces [NFR-08](../brd/08-nonfunctional-requirements.md) and the money/filing rules of [BR-506](../brd/06-functional-requirements.md), [BR-1102](../brd/06-functional-requirements.md).

### 4.1 Which actions require a second party

| Action class | Initiator (`i`/`W`) | Required distinct approver | Signature |
|---|---|---|---|
| Bank movement / distribution run (BR-505–506) | `finance` (or `authorized_rep`) | `nazir` (`A*`) | — |
| Statutory filing / Authority update (BR-602) | `case_manager` / `compliance_officer` | `nazir` (`A*`) | — |
| Reserved matter (BR-1102) | any initiator | approval **chain**: principal (`family_board`) + counsel review + Authority approval/notice where required | `nazir` (`S*`) |
| Access-matrix change on a live endowment | `admin` | `nazir` acknowledgement (recorded, non-blocking) | — |
| Nazir-fee basis change (BR-507) | `finance`/`admin` | `nazir` (`A*`) | — |

### 4.2 The invariant

**`initiatorUserId != approverUserId` on every money movement and statutory filing.** The procedure layer resolves the acting identity from the session, compares it to the persisted `initiatedByUserId` on the run/request, and rejects a match with a typed `SEGREGATION_OF_DUTIES` error — *before* any state change. A user who legitimately holds both `finance` and `nazir` grants on the same endowment (small teams) is still blocked from approving a run they themselves initiated; they may approve runs initiated by others.

### 4.3 Staleness voids approval

If the underlying data of a run/request changes after submission (line items, amounts, beneficiary set), the prior approval is **voided** and the item returns to "re-submit". The approver always signs the exact artifact they saw. This is the US-01 / US-12 edge case made structural.

---

## 5 · Beneficiary data isolation (`beneficiarySelfId`)

Grounds [BR-210](../brd/06-functional-requirements.md) and [NFR-05](../brd/08-nonfunctional-requirements.md). Beneficiary PII is sensitive personal data under PDPL + the Beneficial Ownership Standards.

- The `beneficiary` seat is linked to exactly one `Beneficiary` row via **`beneficiarySelfId`** on the user's grant (a beneficiary is never linked by role alone).
- For any query originating from a `beneficiary` session, the force-filter (§7.3) narrows **every** beneficiary-scoped table — `Beneficiary`, `Distribution.lineItems`, `Document`, `FinancialTransaction`(their statements), messages — to rows where the owning `beneficiaryId == beneficiarySelfId`. Isolation is applied **before** role/permission evaluation, so a mis-scoped role can never widen it.
- A beneficiary **cannot enumerate**: list endpoints return only self rows; a direct fetch of another beneficiary's `id` returns **404, not 403** (existence itself is not disclosed).
- `family_board` sees **aggregate** distribution/statement figures for their endowment(s) but **not** another beneficiary's individual UBO dataset, banking details, or KYC documents.
- Household/guardian cases (a beneficiary acting for a minor/incapacitated relative) are modeled as an **explicit secondary `beneficiarySelfId` grant**, time-bound and audited — never inferred from the family tree.

---

## 6 · AML no-tipping-off compartment

Grounds [BR-604](../brd/06-functional-requirements.md), [NFR-05](../brd/08-nonfunctional-requirements.md); mirrors US-16.

- The SAR record (the report to the Financial Intelligence unit: the operation, related parties, and FIU follow-up correspondence) lives in a **compartment** resource, gated by explicit `aml_officer` membership on the endowment. No other role — **including the Nazir by default** — reads it unless separately made a compartment member.
- **Invisibility, not redaction.** Outside the compartment, the SAR does not appear anywhere: not as a greyed row, not as a count, not in the audit-trail feed shown to non-members, not in any export or evidence pack, not in the subject beneficiary's portal or notifications. A non-member querying the SAR store gets an **empty set** (as if it does not exist), and the *attempt* is logged into the compartment's own audit stream, visible only to members.
- **No subject signal.** Nothing about a beneficiary who is a SAR subject changes in their portal — statements, KYC prompts, and messaging behave identically to any other beneficiary. Distribution gating that would otherwise leak ("held pending review") uses the same neutral copy as ordinary KYC holds.
- Compartment membership is itself an audited, admin-restricted grant; adding/removing a member is a material action ([BR-607](../brd/06-functional-requirements.md)).

---

## 7 · Enforcement: the `WaqfAccessGrant` model and the code ladder

Three layers enforce the same rule; each is independently sufficient to deny.

### 7.1 The `WaqfAccessGrant` model (packages/database)

The single source of authorization truth. One row = one user's access to one endowment.

```
WaqfAccessGrant {
  id                String
  userId            String        // the individual — attribution is always to a person
  waqfId            String        // scope is the endowment, never the client family
  role              Role          // enum: nazir | authorized_rep | case_manager | finance |
                                  //       compliance_officer | aml_officer | admin | leadership |
                                  //       family_board | beneficiary | subcontractor | auditor | counsel
  permissions       Permission[]  // resolved {module, verb} set; role preset expands here, may be narrowed
  beneficiarySelfId String?       // set ONLY for `beneficiary`/guardian grants → §5 isolation key
  scopeRefs         String[]      // for `subcontractor`/`counsel`/`auditor`: the task/case/engagement ids in remit
  amlCompartment    Boolean       // true only for aml_officer membership → §6
  delegation        Delegation?   // present iff this grant is a delegation → §8
  grantedByUserId   String        // who provisioned it (admin/nazir)
  validFrom         DateTime
  validUntil        DateTime?     // null = standing; non-null = time-bound (delegations, audit windows)
  revokedAt         DateTime?     // soft-revoke; never hard-deleted (audit/NFR-04)
  createdAt / updatedAt
  @@unique([userId, waqfId, role])
  @@index([waqfId]) @@index([userId])
}
```

A grant is **active** iff `revokedAt == null && now ∈ [validFrom, validUntil ?? ∞)`. Expiry/revocation is evaluated on every request — no cached "logged-in = authorized" state.

### 7.2 The tRPC procedure ladder (packages/api)

Procedures compose, each strictly narrowing the last. A domain procedure is *unwritable* without declaring its endowment scope and required permission — the type system makes the check non-optional.

```
publicProcedure
  └─ authedProcedure            // better-auth session valid; sets ctx.user (+ TOTP asserted for step-up ops)
       └─ waqfScoped(permission)  // input MUST carry waqfId; loads the caller's active WaqfAccessGrant for
                                  // that waqfId; asserts the grant contains `permission` ({module,verb});
                                  // injects ctx.grant (role, permissions, beneficiarySelfId, scopeRefs, amlCompartment).
                                  // No grant → NOT_FOUND (not FORBIDDEN — do not disclose the endowment exists).
            ├─ requireDistinctApprover()  // for A*/S* money & filing ops → §4 maker≠checker + TOTP + staleness void
            └─ requireAmlMember()         // for SAR compartment ops → §6; non-member sees NOT_FOUND / empty set
```

- `waqfScoped('finance:distribution:approve')` on a distribution-approve procedure both scopes to the endowment **and** demands the `approve` verb — a `finance` grant (which has `initiate`, not `approve`) is rejected at the boundary.
- Subcontractor/counsel/auditor procedures additionally intersect `input.resourceId ∈ ctx.grant.scopeRefs`.
- Every allowed mutation writes an audit entry; every **denied** attempt on a sensitive resource (beneficiary PII, finance, AML, documents) is also logged ([NFR-04](../brd/08-nonfunctional-requirements.md)).

### 7.3 The Prisma force-filter (packages/database) — defence in depth

A Prisma client extension wraps every query with an authorization context derived from the request's active grants, so even a procedure that forgot to scope cannot leak:

- **Endowment narrowing:** every domain model carries `waqfId`; the extension injects `where.waqfId IN (ctx.authorizedWaqfIds)` on all `find*`/`update*`/`delete*`. A query with no authorized endowments returns `[]`.
- **Beneficiary narrowing:** if the context is a beneficiary session, it additionally injects `beneficiaryId = ctx.beneficiarySelfId` on beneficiary-scoped models (§5).
- **AML narrowing:** the SAR compartment model is filtered to `[]` unless the context carries `amlCompartment` for the relevant endowment (§6).
- **Money as `Decimal(18,2)`** throughout; the extension never coerces to float. (Cross-reference: distribution-engine spec.)
- The extension is **fail-closed**: absent an authorization context, it filters to the empty set rather than the full table. Only explicit, audited system jobs (pg-boss workers) run with a declared service context.

---

## 8 · Delegation as a first-class object

Grounds [BR-105](../brd/06-functional-requirements.md); mirrors US-04. Delegation is the mechanism behind the `authorized_rep` role and any time-boxed staff cover.

```
Delegation {
  id               String
  grantId          String     // the WaqfAccessGrant this delegation backs
  delegatorUserId  String     // the Nazir granting scope
  delegateUserId   String     // the Authorized Representative receiving it
  scope            Permission[]  // an explicit SUBSET of the delegator's own permissions — never a superset
  jointlyLiable    Boolean       // true for authorized_rep → recorded, surfaced in UI (Art. 11.5)
  validFrom        DateTime
  validUntil       DateTime      // REQUIRED — a delegation is always time-bound
  revokedAt        DateTime?
  reason           String
}
```

- **Bounded by the delegator.** A delegation's `scope` is validated to be a subset of the delegator's active permissions at grant time; a Nazir cannot delegate what they do not hold, and no delegate can hold more than the Nazir.
- **Accountability is non-delegable.** `sign` on reserved matters and final `approve` are **excluded from any delegatable scope** — an attempt to delegate them is rejected. A delegate may `initiate` a reserved matter; only the Nazir signs it.
- **Attributed, always.** Every act by a delegate is stamped with the delegate's `userId` (not the Nazir's) and marked `viaDelegation: grantId`; the audit trail and the Nazir's oversight views show the real actor. Joint-and-several liability is displayed, never hidden.
- **Expiry freezes in-flight work.** When `validUntil` passes (or the grant is revoked) mid-workflow, in-flight items the delegate initiated **freeze pending re-grant or Nazir action** — they are not auto-approved and not silently dropped.

---

## 9 · RACI routing

Encodes [BR-1103](../brd/06-functional-requirements.md); the RACI table from [`operating-model.md`](../../company/operating-model.md) drives where approvals and notifications route. Roles above are the platform embodiment of these parties.

| RACI party | Platform role(s) | Routes / receives |
|---|---|---|
| **Principal** | `family_board` | Reserved-matter **approvals** (written principal approval); quarterly/annual reporting; strategic decisions on-record. |
| **Accountable governor** | `nazir` | Final `approve`/`sign` on all money, filings, reserved matters; cannot be bypassed; accountability never routes away. |
| **Mandate Lead** | `case_manager`, `finance`, `compliance_officer`, `aml_officer`, `admin`, `leadership` | Initiation, execution, coordination, supervision, reporting — never final governance sign-off. |
| **Legal review** | `counsel` | Reserved-matter **counsel review** step in the approval chain; scoped legal-case access. |
| **Independent assurance** | `auditor` | Scoped read + evidence-pack export within an audit window. |
| **Subcontractors** | `subcontractor` (P-01…P-06) | Scoped task assignment + evidence submission within their remit; no governance authority. |
| **Regulator / AML recipient** | *(no seat)* Authority, FIU | Recipients of filings/notices (manual status) and out-of-band SAR (compartment record) respectively. |

**Reserved-matter chain (BR-1102):** initiator (`i`) → `family_board` principal approval → `counsel` review → Authority approval/notice where required → `nazir` `S*`. The engine disables the `nazir` sign action until every prior step is recorded complete, and names the missing step when blocked.

---

## 10 · Acceptance criteria (Given / When / Then)

### AC-1 · Cross-endowment denial (scope is the endowment, not the family)

- **Given** a `finance` user holds an active `WaqfAccessGrant` on endowment **A** of a family that also owns endowment **B**, but has **no** grant on **B**,
- **When** they call any `waqfScoped` procedure with `waqfId = B` (or craft a request referencing a B-owned transaction id),
- **Then** the procedure returns **NOT_FOUND** (not FORBIDDEN — B's existence is not disclosed), the Prisma force-filter independently returns `[]` for any B row, and the denied attempt is written to the audit trail. *(Same-family does not imply access.)*

### AC-2 · Beneficiary self-isolation

- **Given** beneficiary user *M* with `beneficiarySelfId = m1` and beneficiary *N* (`n1`) on the same endowment,
- **When** *M* lists beneficiaries/statements/documents, **or** directly fetches `n1`,
- **Then** every list returns only `m1`-owned rows, the direct fetch of `n1` returns **404**, and `family_board` for that endowment sees aggregate distribution totals but never *N*'s individual UBO dataset, banking details, or KYC files. *(Edge: a guardian grant for a minor adds a second explicit `beneficiarySelfId`; no other widening.)*

### AC-3 · AML invisibility (no tipping-off)

- **Given** an active SAR compartment record on an endowment naming beneficiary *X* as subject, and a `case_manager` + a `nazir` who are **not** compartment members,
- **When** the `case_manager`/`nazir` view the audit feed, dashboards, evidence pack, or *X*'s beneficiary record, **and** *X* logs into the portal,
- **Then** the SAR appears **nowhere** — no row, no count, no notification, no export line — a direct query returns an **empty set** as if it does not exist; *X*'s portal (statements, KYC prompts, messaging) is byte-for-byte identical to a non-subject; and only the `aml_officer` compartment sees the record and the log of these access attempts. *(Empty: with zero SARs, the compartment UI is invisible to unauthorized roles entirely.)*

### AC-4 · Segregation of duties on a distribution run

- **Given** a distribution run initiated by user *F* (`finance`, `initiatedByUserId = F`),
- **When** *F* — who also happens to hold a `nazir` grant on that endowment — attempts to `approve` the run,
- **Then** `requireDistinctApprover()` rejects with `SEGREGATION_OF_DUTIES` before any state change; a *different* Nazir may approve (with TOTP); and if the run's line items changed after submission, the prior approval is voided and re-approval is required. *(Error + edge both covered.)*

### AC-5 · Delegation is bounded, attributed, and non-escalating

- **Given** a Nazir grants a time-bound `authorized_rep` delegation scoped to "compliance:write" until a set date,
- **When** the delegate acts, tries to `sign` a reserved matter, and the delegation later expires mid-workflow,
- **Then** each act is attributed to the **delegate's** `userId` with `viaDelegation` set and joint-liability shown; the reserved-matter `sign` attempt is **rejected** (accountability non-delegable); and on expiry, in-flight items **freeze pending re-grant**, none auto-approved. *(Empty: with no active delegation, the representative sees read-only.)*

### AC-6 · Eligibility constraint enforced in data (NFR-09)

- **Given** onboarding a Nazir/authorized-rep grant,
- **When** the candidate is not a KSA resident (or, where the endower is foreign and the asset is real property, not a Saudi national) per [BR-109](../brd/06-functional-requirements.md),
- **Then** the grant **cannot be activated** — the eligibility check blocks provisioning with the failing criterion named, and the block is audited. *(Eligibility is a data constraint, not merely UI copy.)*

---

## 11 · Open questions

Routed to [16 · Open questions](16-open-questions.md); flagged here where they touch the access model:

- **Leadership authority matrix depth** — exactly which portfolio-level `approve` actions `leadership` may perform vs. must route to a Nazir is commercially unsettled ([NFR-13](../brd/08-nonfunctional-requirements.md) configurability). Modeled as configurable; default = read-only + no per-endowment write.
- **Auditor access mechanism** — scoped read-only grant vs. export-only handoff for SOCPA engagements; both are supported by the model, the default posture per engagement is TBD.
- **Break-glass access** — whether an emergency elevation path (e.g. Nazir incapacitated) is needed, and its recording/notification rules, is deferred; no ambient override exists today.

---

## Requirements covered

- **Functional (BR):** [BR-105](../brd/06-functional-requirements.md) *(delegation / joint liability)*, [BR-109](../brd/06-functional-requirements.md) *(eligibility as data constraint)*, [BR-201](../brd/06-functional-requirements.md), [BR-210](../brd/06-functional-requirements.md) *(beneficiary isolation / access matrix)*, [BR-506](../brd/06-functional-requirements.md) *(maker-checker on money)*, [BR-507](../brd/06-functional-requirements.md) *(fee-basis change control)*, [BR-603](../brd/06-functional-requirements.md) *(manual filing status, subcontractor scoping)*, [BR-604](../brd/06-functional-requirements.md) *(AML no-tipping-off compartment)*, [BR-607](../brd/06-functional-requirements.md) *(audit trail incl. denied attempts)*, [BR-612](../brd/06-functional-requirements.md) *(legal-case / counsel scoping)*, [BR-702](../brd/06-functional-requirements.md) *(document access matrix)*, [BR-901](../brd/06-functional-requirements.md) *(dashboard read scoping)*, [BR-906](../brd/06-functional-requirements.md) *(auditor evidence-pack access)*, [BR-1102](../brd/06-functional-requirements.md) *(reserved-matter approval chain)*, [BR-1103](../brd/06-functional-requirements.md) *(RACI routing)*.
- **Non-functional (NFR):** [NFR-04](../brd/08-nonfunctional-requirements.md) *(immutable audit trail)*, [NFR-05](../brd/08-nonfunctional-requirements.md) *(per-endowment access matrix, beneficiary segregation, AML no-tipping-off)*, [NFR-06](../brd/08-nonfunctional-requirements.md) *(authn/authz, TOTP step-up)*, [NFR-08](../brd/08-nonfunctional-requirements.md) *(segregation of duties)*, [NFR-09](../brd/08-nonfunctional-requirements.md) *(eligibility constraints enforced in data)*.
