# Data Model Spec

The logical data model for the QMULATE platform — every entity, its fields, relations, enums, and invariants — expressed as a Prisma-oriented schema that `packages/database` implements against PostgreSQL.

Status: Draft v0.1 · Privileged & Confidential

---

## Purpose

This section is the contract for `packages/database/prisma/schema.prisma`. It translates the domain hierarchy, the [glossary](../../domain/glossary.md), and the shapes already proven in [`data/fixtures/sample-waqf.json`](../../../data/fixtures/sample-waqf.json) into a concrete relational model that the engines ([08 distribution](08-distribution-engine-spec.md), [09 compliance/deadline](09-compliance-deadline-engine-spec.md)), the access layer ([10 roles/access](10-roles-access-matrix-spec.md)), and the security controls ([12 security/audit](12-security-audit-retention-spec.md)) build on.

The core hierarchy is **Client (family) → Waqif → Waqf (endowment) → { records }**. One client can hold several waqifs; one waqif several endowments. (The first real engagement is one family, 4 endowments across 3 waqifs.)

> [!important] Four conventions govern the entire schema
> 1. **Money is never a float.** Every amount is `Decimal @db.Decimal(18,2)`, currency SAR. JS `number` is banned for money end-to-end.
> 2. **Every legally-significant date is dual.** Store the canonical `xAt DateTime` (UTC — the arithmetic/sort source of truth) **plus** a frozen `xAtHijri String` (Umm-al-Qura snapshot taken at write time), so historical display never shifts when the calendar libraries update. See [11 localization](11-localization-spec.md).
> 3. **Official financial/legal records are Arabic-authoritative.** The Arabic free-text field is **required** and is the system of record ([NFR-01](../brd/08-nonfunctional-requirements.md), Nazarah Art. 15(2)); English is an optional convenience translation. Enums are stable codes rendered via i18n; amounts are locale-neutral.
> 4. **Scoping and audit are cross-cutting, not per-model boilerplate.** Every material model is reachable from a `waqfId` for the per-endowment access matrix, and every mutation flows through the append-only audit extension ([12](12-security-audit-retention-spec.md)). Models below therefore do not repeat `createdAt/updatedAt/createdBy` — assume them everywhere.

---

## 1. Enums (the domain's controlled vocabulary)

```prisma
enum WaqfClassification { LARGE MEDIUM SMALL NOT_CLASSIFIED }        // SIZE ONLY — gates which obligations apply
// ⊕ S9-4a (owner ruling, 2026-08-25): `DIRECT_UTILIZATION` is GONE from this enum — it was never a
// size. Direct use (ذات انتفاع مباشر) is a SECOND, ORTHOGONAL axis: `Waqf.directUtilization Boolean?`,
// where NULL means UNRECORDED and NEVER "not direct". Migration 42 REFUSES to apply while any row
// still holds the old value (ADR-0004: refuse, never remap).
enum WaqfType          { PUBLIC_CHARITABLE FAMILY_DHURRI JOINT }     // khayrī / ahlī-dhurrī / mushtarak
enum WaqfNature        { AYNI QIYAMI }                               // in-kind vs value/cash
enum EntitlementOrder  { ORDERED SHARED NA_DIRECT_USE }              // al-aʿlā fa-l-aʿlā vs tashrīk vs direct use
enum BeneficiaryLine   { ZUHUR BUTUN NA }                            // male line / female line / n-a
enum VerificationStatus{ VERIFIED PENDING UNVERIFIED }
enum TxnType           { REVENUE EXPENSE }
enum ExpenseCategory   { MAINTENANCE OPERATIONS NAZIR_FEE ZAKAT OTHER }
enum FeeBasis          { PERCENT_OF_REVENUE PERCENT_OF_NET_INCOME RETAINER }
enum ClassificationGate{ ALL LARGE_MEDIUM SMALL_DIRECT LARGE_ONLY }
enum FilingStatus      { NOT_STARTED IN_PROGRESS SUBMITTED ACCEPTED REJECTED N_A }  // ACCEPTED = e.g. Awqaf "registered"; canonical set (aligned with §14)
enum ApprovalType      { BANK_MOVEMENT DISTRIBUTION_RUN GOVT_FILING RESERVED_MATTER }
enum ApprovalStatus    { PENDING APPROVED REJECTED EXECUTED }
enum Confidentiality   { NORMAL SENSITIVE_PII AML_RESTRICTED }       // AML_RESTRICTED = no-tipping-off
// The CANONICAL thirteen — §10.2 owns this list; decided 2026-07-27, see ADR-0004.
// This line previously held an older 11 (with MANDATE_LEAD / ACCOUNTANT / APPROVER and no
// AUTHORIZED_REP, CASE_MANAGER, FINANCE, COMPLIANCE_OFFICER or LEADERSHIP). `APPROVER` is gone
// with NO successor: approval is an action the nazir holds (BR-105 / BR-1103).
enum Role              { SYSTEM_ADMIN NAZIR AUTHORIZED_REP CASE_MANAGER FINANCE COMPLIANCE_OFFICER AML_OFFICER COUNSEL AUDITOR SUBCONTRACTOR FAMILY_BOARD LEADERSHIP BENEFICIARY }
enum DistributionStatus{ DRAFT COMPUTED PENDING_APPROVAL APPROVED EXECUTED CANCELLED }
enum AuditCategory     { ACCESS MUTATION APPROVAL AUTH }

// The audit spine's other enums — added 2026-07-27 to match what shipped; §12 owns their
// semantics. `AuditAction` is a closed vocabulary (CREATE / UPDATE / DELETE_SOFT / APPROVE /
// SIGN / READ_SENSITIVE / EXPORT / ACCESS_DENIED / LOGIN / …) enumerated in schema.prisma.
enum AuditActorType      { USER SYSTEM SERVICE }
enum AuditClassification { ROUTINE SENSITIVE RESTRICTED }   // RESTRICTED = AML no-tipping-off
```

The classification tiers map to SAR value bands ([glossary](../../domain/glossary.md)): SMALL `< 50M`, MEDIUM `50M–<200M`, LARGE `≥ 200M`. ⚠ **This line said "orthogonal" from the beginning and the schema encoded it as a fourth SIZE value anyway — for nine sprints, unreconciled.** Direct use is now its own axis (`Waqf.directUtilization`), so a MEDIUM endowment in direct use is representable; it previously was not (S9-4a). The band thresholds live in `Setting`, not in code ([NFR-13](../brd/08-nonfunctional-requirements.md)).

---

## 2. Core hierarchy

```prisma
model Client {                       // the family / engagement grouping
  id       String @id @default(cuid())
  nameAr   String                    // Arabic-authoritative
  nameEn   String?
  waqifs   Waqif[]
  memberships Membership[]           // family-level access (Family Board sees the whole family)
}

model Waqif {
  id       String @id @default(cuid())
  clientId String
  client   Client @relation(fields: [clientId], references: [id])
  nameAr   String
  nameEn   String?
  waqfs    Waqf[]
}

model Waqf {                         // the endowment — the central record (one certificate)
  id                 String @id @default(cuid())
  waqifId            String
  waqif              Waqif @relation(fields: [waqifId], references: [id])
  certificateNumber  String
  deedNumber         String
  classification     WaqfClassification
  type               WaqfType
  nature             WaqfNature
  entitlementOrder   EntitlementOrder
  shartAlWaqif       Json            // STRUCTURED conditions: tiers, lines, order rule,
                                     //   maintenance reserve %, disbursement channel (masraf al-rei)
  fiscalYearEnd      String          // "MM-DD"
  registrationDate   DateTime
  registrationDateHijri String
  certificateExpiry  DateTime?
  certificateExpiryHijri String?
  // relations
  trusteeship        TrusteeshipDeed?
  assets             Asset[]
  beneficiaries      Beneficiary[]
  bankAccounts       BankAccount[]
  transactions       Transaction[]
  distributions      Distribution[]
  nazirFees          NazirFee[]
  complianceTasks    ComplianceTask[]
  filings            GovernmentFiling[]
  deadlines          Deadline[]
  documents          Document[]
  leases             Lease[]
  legalCases         LegalCase[]
  budgets            Budget[]
  zakatFilings       ZakatFiling[]
  expropriations     Expropriation[]
  accessGrants       WaqfAccessGrant[]
  reclassifications  ReclassificationEvent[]
}
```

> [!important] `shartAlWaqif` is the engine's brain, so it is **structured JSON, not prose.** It encodes the tier/line definitions, the order rule, the maintenance-reserve priority, and the disbursement channel — because the [distribution engine](08-distribution-engine-spec.md) computes shares from it and the [compliance engine](09-compliance-deadline-engine-spec.md) reads its stipulations. The original deed text is kept as a `Document` for provenance; the structured form is what the software acts on ([BR-103](../brd/06-functional-requirements.md)).

**Invariants.** A `Waqf` must have exactly one `TrusteeshipDeed`. `classification` drives which `ComplianceTask`s are templated ([09](09-compliance-deadline-engine-spec.md)) and whether distributions are monetary (**`directUtilization === true`** ⇒ none — re-keyed off the size enum in S9-4a; a NULL attribute decides nothing and is reported as `DIRECT_USE_UNRECORDED`). Navigation and reporting must work at all three levels — client, waqif, waqf ([BR-102](../brd/06-functional-requirements.md)).

---

## 3. Trusteeship & eligibility

```prisma
model TrusteeshipDeed {
  id                  String  @id @default(cuid())
  waqfId              String  @unique
  waqf                Waqf    @relation(fields: [waqfId], references: [id])
  primaryNazir        String
  primaryAppointedDate DateTime
  primaryAppointedDateHijri String
  authorizedRepName   String?
  authorizedRepScope  String?             // delegated day-to-day scope
  jointlyLiable       Boolean @default(false)   // Nazarah Art. 11(5): joint & several
  successorNazir      String?
  // Nazir eligibility flags (BR-109 / NFR-09) — verified at onboarding
  islam                       Boolean
  legalCapacity               Boolean
  noDisqualifyingRemoval      Boolean
  ksaResident                 Boolean            // hard rule: BO Standards Art. 8(1)
  saudiNationalWhereRequired  Boolean?           // foreign endower + real-property asset
  authorityLicensed           Boolean?           // legal-person Nazir
}
```

**Invariant.** A `Waqf` cannot be activated (leave onboarding Gate 01) unless its `TrusteeshipDeed` records a primary Nazir whose eligibility flags satisfy [BR-109](../brd/06-functional-requirements.md)/[NFR-09](../brd/08-nonfunctional-requirements.md) — in particular `ksaResident = true`. The authorized representative, when present, is **jointly and severally liable**; their actions are attributed and visible to the Nazir ([10 roles](10-roles-access-matrix-spec.md)).

---

## 4. Assets & expropriation

```prisma
model Asset {
  id             String @id @default(cuid())
  waqfId         String
  type           String            // residential_building | commercial_building | commercial_tower | land_parcel …
  titleDeedNumber String
  addressAr      String
  addressEn      String?
  acquiredDate   DateTime
  acquiredDateHijri String
  valuationSar   Decimal @db.Decimal(18,2)
  valuationDate  DateTime?
  status         String
  leases         Lease[]
  maintenanceTickets MaintenanceTicket[]
  expropriations Expropriation[]
}

model Expropriation {                // govt taking → compensation → istibdal. Entity NOW; workflow Phase 3.
  id                 String @id @default(cuid())
  assetId            String
  waqfId             String
  authorityAr        String
  scope              String          // partial | full
  announcedDate      DateTime
  announcedDateHijri String
  compensationSar    Decimal? @db.Decimal(18,2)
  compensationStatus String          // assessed | received | …
  istibdalStatus     String          // pending_authority_permission | replacement_acquired | …
  replacementAssetId String?
  authorityNotifiedDate DateTime?
  // links to a Deadline row with ruleKey = istibdal_10bd
}
```

**Invariant.** Asset **disposal / substitution / pledge / long-lease** are reserved matters — they require an approved `ApprovalRequest` before the mutation is allowed ([BR-306](../brd/06-functional-requirements.md), [10](10-roles-access-matrix-spec.md)). Expropriation compensation must land in a dedicated waqf account (no commingling) and drive an `istibdal` flow with a 10-business-day Authority-notice deadline.

---

## 5. Beneficiaries & UBO (the most sensitive data)

```prisma
model Beneficiary {
  id                 String @id @default(cuid())
  waqfId             String
  branch             String            // family branch / "Charitable" for the charitable slice
  relationshipAr     String
  tabaqa             Int?              // generational tier (null for charitable causes)
  line               BeneficiaryLine   // zuhur | butun | na
  sharePercent       Decimal? @db.Decimal(9,4)   // from Shart; may be null when computed
  verificationStatus VerificationStatus
  kycLastRefreshed   DateTime?
  kycLastRefreshedHijri String?
  // Beneficial-Ownership minimum dataset (BR-202/203). Sensitive PII — field-encrypted.
  isUbo              Boolean @default(false)
  uboIdTypeEnc       String?           // e.g. national_id (encrypted)
  uboIdNumberEnc     String?           // encrypted
  uboBankingRefEnc   String?           // proceeds banking ref (encrypted)
  uboShareOfProceeds Decimal? @db.Decimal(9,4)
  confidentiality    Confidentiality @default(SENSITIVE_PII)
  payments           DistributionLineItem[]
}
```

> [!important] Entitlement is **not a flat list.** A beneficiary's eligibility and share are a function of `tabaqa` (tier) + `line` (ẓuhūr/buṭūn) + the waqf's `entitlementOrder`. In an **ORDERED** waqf a tier-2 beneficiary is *registered but non-entitled* while any tier-1 survives; in a **SHARED** waqf all live tiers draw together. This is why lineage is first-class data — the [distribution engine](08-distribution-engine-spec.md) resolves it. See [glossary §B](../../domain/glossary.md).

**Invariants.** UBO ID/IBAN fields are **encrypted at rest** on top of DB encryption ([12](12-security-audit-retention-spec.md)); a beneficiary user may read **only their own** record (`beneficiarySelfId` on the grant, [10](10-roles-access-matrix-spec.md)). Where no beneficiary is yet identifiable, the **category/characteristics** must be captured before any disbursement — otherwise the distribution engine blocks the run ([BR-206](../brd/06-functional-requirements.md)). Stale/`PENDING`/`UNVERIFIED` KYC blocks that beneficiary's distribution line (share withheld, never reallocated).

---

## 6. Financial core

```prisma
model BankAccount {                  // dedicated per endowment — no commingling (BR-501)
  id          String @id @default(cuid())
  waqfId      String
  ibanEnc     String                 // encrypted
  bankNameAr  String
  purpose     String
  isDedicated Boolean @default(true)
}

model Transaction {                  // Revenue + Expense unified; recorded IN ARABIC (BR-502)
  id            String  @id @default(cuid())
  waqfId        String
  type          TxnType
  category      String                // SOCPA-aligned chart-of-accounts code
  descriptionAr String                // Arabic-authoritative, REQUIRED
  descriptionEn String?
  amountSar     Decimal @db.Decimal(18,2)
  date          DateTime
  dateHijri     String
  bankAccountId String
  assetId       String?
  reconciledAt  DateTime?
}

model Budget {                       // estimates; class-gated (Large/Medium) — BR-504
  id              String @id @default(cuid())
  waqfId          String
  fiscalYear      String
  revenueEstimate Decimal @db.Decimal(18,2)
  expenseEstimate Decimal @db.Decimal(18,2)
  approvedAt      DateTime?
}

model NazirFee {                     // set by the DEED, not statute (BR-507)
  id                        String @id @default(cuid())
  waqfId                    String
  basis                     FeeBasis          // default PERCENT_OF_REVENUE
  percent                   Decimal? @db.Decimal(6,3)   // default 10.000 (ʿushr)
  amountSar                 Decimal @db.Decimal(18,2)
  periodEnd                 DateTime
  deductedBeforeDistribution Boolean @default(true)
  invoiceRef                String?
  sourceNote                String
}
```

> [!important] Two "10%"s that must never be conflated. `NazirFee` is the **deed-set** trustee fee — this engagement's deed sets **10% of *revenue*** (customary *ʿushr*), deducted before distribution; the basis is **configurable** because the next deed may differ ([BR-507](../brd/06-functional-requirements.md)). This is *not* the Awqaf Law Art. 14 ≤10%-of-*net-income* fee that the **Authority itself** may charge endowments not under its trusteeship — a different payee, base, and instrument.

**Invariant (no commingling — zero-tolerance).** A `Transaction` may only post to a `BankAccount` whose `waqfId` matches the transaction's `waqfId` and `isDedicated = true`; any other posting is rejected and audited ([BR-501](../brd/06-functional-requirements.md)). Bank movements require maker-checker ([BR-506](../brd/06-functional-requirements.md)). `Budget` (BR-504) is required for Large/Medium and feeds the compliance gate; it is a *Must* — its acceptance criteria live in [06](06-functional-requirements.md).

---

## 7. Distributions

```prisma
model Distribution {
  id              String @id @default(cuid())
  waqfId          String
  periodStart     DateTime
  periodEnd       DateTime
  periodEndHijri  String
  grossRevenueSar Decimal @db.Decimal(18,2)
  reserveSar      Decimal @db.Decimal(18,2)   // maintenance reserved FIRST
  operatingSar    Decimal @db.Decimal(18,2)
  nazirFeeSar     Decimal @db.Decimal(18,2)
  distributableSar Decimal @db.Decimal(18,2)
  status          DistributionStatus
  approvalRequestId String?                   // maker-checker gate
  computationTrace Json                        // per-beneficiary "why", reproducible for audit
  lineItems       DistributionLineItem[]
}

model DistributionLineItem {
  id             String @id @default(cuid())
  distributionId String
  beneficiaryId  String
  sharePercent   Decimal @db.Decimal(9,4)
  amountSar      Decimal @db.Decimal(18,2)
  transferRef    String?
  blockedReason  String?          // STALE_KYC | UNVERIFIED | CATEGORY_NOT_CAPTURED | …
}
```

**Invariant (money conservation).** For any executed run: `reserveSar + operatingSar + nazirFeeSar + Σ(lineItems.amountSar for paid) + Σ(withheld) == grossRevenueSar`. No negative amounts. A waqf with **`directUtilization === true`** produces a `Distribution` with `distributableSar = 0` and no monetary line items (re-keyed in S9-4a; the size enum no longer carries this fact). Full rules in [08](08-distribution-engine-spec.md).

---

## 8. Compliance, filings, deadlines

```prisma
model ComplianceObligation {         // TEMPLATE — seeded from unified-framework §1/§2/§3
  id              String @id @default(cuid())
  code            String @unique     // e.g. "GL-3-1-register-30bd"
  section         String             // financial | operational | government_legal
  workstream      String
  titleAr         String
  titleEn         String
  gate            ClassificationGate // which endowments it applies to
  deadlineRuleKey String?            // links to a configurable rule (30bd/15bd/10bd/3mo)
}

model ComplianceTask {               // INSTANCE per endowment
  id           String @id @default(cuid())
  waqfId       String
  obligationId String
  status       String                // not_started | in_progress | completed
  owner        String?
  startDate    DateTime?
  closeDate    DateTime?
  notes        String?
}

model GovernmentFiling {             // MANUAL status fields — NOT integrations (BR-603)
  id         String @id @default(cuid())
  waqfId     String
  platform   String                  // Awqaf Digital | Baladi | Ejar | Istihkam | Muqeem | Qiwa
  status     FilingStatus
  lastUpdated DateTime?
}

model Deadline {                     // computed by the deadline engine (BR-1001)
  id                String @id @default(cuid())
  waqfId            String
  ruleKey           String           // register_30bd | update_15bd | istibdal_10bd | distribute_3mo
  anchorDate        DateTime
  dueDate           DateTime
  dueDateHijri      String
  businessDaysUsed  Int
  satisfiedAt       DateTime?
  escalatedAt       DateTime?
}
```

The **platform enum** is authoritative here: `Awqaf Digital | Baladi | Ejar | Istihkam | Muqeem | Qiwa` (reconciling the drift noted across sources; `Istihkam`'s exact purpose is an [open question](16-open-questions.md)). Reclassification is event-sourced:

```prisma
model ReclassificationEvent { id String @id @default(cuid()) waqfId String from WaqfClassification to WaqfClassification at DateTime reason String }
```

---

## 9. Documents (the vault)

```prisma
model Document {                     // BR-701/702
  id             String @id @default(cuid())
  waqfId         String
  type           String             // deed | certificate | title_deed | trusteeship | lease | valuation | financial | kyc | correspondence
  titleAr        String
  storageKey     String             // object-store key (packages/storage)
  sha256         String             // integrity
  confidentiality Confidentiality @default(NORMAL)
  version        Int @default(1)
  retentionUntil DateTime           // ≥10 years
  legalHold      Boolean @default(false)
}
```

**Invariant.** Postgres stores only key + metadata + hash + retention flags; bytes live in object storage, downloaded via short-lived signed URLs minted **after** the access-matrix check ([12](12-security-audit-retention-spec.md)). Deletion is blocked while `retentionUntil` is in the future or `legalHold = true` ([BR-702](../brd/06-functional-requirements.md), [NFR-07](../brd/08-nonfunctional-requirements.md)).

---

## 10. Operational entities (modeled now; richer workflows land in Phase 3)

These were implied by the operating model and architecture but not yet in the fixture; they get tables now so relations are stable, with full workflows in later phases ([05 scope](05-scope-phasing-priority.md)).

```prisma
model Lease            { id String @id @default(cuid()) waqfId String assetId String tenantAr String rentSar Decimal @db.Decimal(18,2) startDate DateTime endDate DateTime status String ejarRef String? }   // BR-302
model MaintenanceTicket{ id String @id @default(cuid()) assetId String kind String status String openedAt DateTime vendorId String? }                                                                        // BR-303
model Vendor           { id String @id @default(cuid()) nameAr String licenseNo String? role String }                                                                                                        // P-01..P-06 subcontractors, BR-305
model LegalCase        { id String @id @default(cuid()) waqfId String subjectAr String forum String status String nextHearing DateTime? nextHearingHijri String? }                                            // BR-612
model ZakatFiling      { id String @id @default(cuid()) waqfId String fiscalYear String status String amountSar Decimal? @db.Decimal(18,2) }                                                                  // BR-509
```

---

## 11. Identity, access matrix & maker-checker

```prisma
model User {
  id               String @id @default(cuid())
  email            String @unique
  twoFactorEnabled Boolean @default(false)   // TOTP mandatory for money/filing roles
  memberships      Membership[]
  grants           WaqfAccessGrant[]
}

model Membership {                   // family-level (Family Board sees the whole family)
  id       String @id @default(cuid())
  userId   String
  clientId String
  role     Role
}

model WaqfAccessGrant {              // THE per-endowment access matrix (NFR-05)
  id                  String @id @default(cuid())
  userId              String
  waqfId              String
  role                Role
  dataScopes          String[]          // e.g. ["finance","beneficiary","aml"]
  canViewAmlRestricted Boolean @default(false)
  beneficiarySelfId   String?           // beneficiary users: pinned to their own record only
}

model ApprovalRequest {              // maker-checker / reserved matters (BR-506, BR-1102)
  id                    String @id @default(cuid())
  waqfId                String
  type                  ApprovalType
  payload               Json
  status                ApprovalStatus
  makerId               String
  checkerId             String?           // enforced: checker != maker
  counselReviewRequired Boolean @default(false)
  authorityNoticeRequired Boolean @default(false)
  decidedAt             DateTime?
}
```

Full permission grid, segregation-of-duties, delegation, and AML visibility rules are in [10](10-roles-access-matrix-spec.md).

---

## 12. Cross-cutting: audit, config, calendar, notifications

> [!note] Naming reconciled 2026-07-27 — this model is **`AuditEvent` / `audit_event`**
> This section previously called it `AuditLog` / `audit_log`, which made it the only source in the repo to do so: [12 · security & audit](12-security-audit-retention-spec.md) (which owns the mechanism), [17 · build & ship](17-build-ship-dod.md), release gate **G-1** and verification scenario **V-7** all say `AuditEvent` / `audit_event`, and that is what Sprint 1 built. §07 always deferred the mechanism to §12, so §07 was the straggler and has been brought into line. Recorded in [ADR-0003](../../decisions/ADR-0003-append-only-audit-and-shart-immutability.md); an integration test pins `to_regclass('public.audit_log') IS NULL` so the old name cannot quietly reappear.
>
> The field list below is the one that shipped. It is **wider than the original sketch** because §12 requires more than the sketch carried: a frozen Hijri stamp on every event ([NFR-02](../brd/08-nonfunctional-requirements.md)), an actor *type* and an `onBehalfOfId` so a delegated Authorized Representative's acts stay attributable ([BR-105](../brd/06-functional-requirements.md)), a `classification` for the AML no-tipping-off compartment, and `context` (ip / requestId / reason) as one column instead of two loose fields.

```prisma
model AuditEvent {                   // append-only, tamper-evident (NFR-04) — mechanism in 12
  id              BigInt              @id @default(autoincrement())
  occurredAt      DateTime            @default(now())
  occurredAtHijri String                        // frozen Umm-al-Qura snapshot (NFR-02)
  actorId         String?
  actorType       AuditActorType                // USER | SYSTEM | SERVICE
  onBehalfOfId    String?                       // delegation: BR-105 joint & several
  action          AuditAction
  entityType      String
  entityId        String
  waqfId          String?                       // scope; bound into the hash — see 12
  before          Json?
  after           Json?
  context         Json                          // ip, requestId, reason
  category        AuditCategory
  classification  AuditClassification @default(ROUTINE)
  prevHash        String              @db.Char(64)   // tamper-evident hash chain
  rowHash         String              @db.Char(64)

  @@unique([rowHash])
  @@index([waqfId, occurredAt])
  @@index([entityType, entityId])
  @@map("audit_event")
}

/// The chain's high-water mark: a singleton row (id = 1) that serialises appenders under an
/// advisory lock, and is forward-only by trigger so a truncated trail cannot be made to verify
/// clean. Not in the original sketch — added in Sprint 1 after adversarial review.
model AuditChainHead {
  id          Int      @id @default(1)
  lastId      BigInt
  lastRowHash String   @db.Char(64)
  updatedAt   DateTime
}

model Setting {                      // runtime configurability (NFR-13); global + per-waqf override
  id     String @id @default(cuid())
  waqfId String?                     // null = global
  key    String                      // fee basis/rate, classification thresholds, deadline windows, cadence, kyc interval
  value  Json
}

model HolidayCalendar { id String @id @default(cuid()) date DateTime nameAr String isWorkingDay Boolean }  // KSA Fri/Sat weekend + Hijri-moving holidays
model Notification    { id String @id @default(cuid()) userId String waqfId String? kind String payload Json readAt DateTime? }
```

> [!important] `AuditEvent` is **write-once at the database level.** A dedicated DB role holds only `INSERT` on `audit_event`; a `BEFORE UPDATE OR DELETE OR TRUNCATE` trigger — installed `ENABLE ALWAYS`, so a session setting `session_replication_role = 'replica'` cannot skip it — rejects every mutation; the app writes the row **inside the same transaction** as the mutation and computes `rowHash = H(canonicalJSON(row) || prevHash)`. This is the schema-level half of [NFR-04](../brd/08-nonfunctional-requirements.md); the mechanism is in [12](12-security-audit-retention-spec.md).

---

## 13. Data-integrity acceptance criteria

- **Given** a `Transaction` for waqf A, **When** it is posted to a `BankAccount` belonging to waqf B (or a non-dedicated account), **Then** the write is rejected and an `AuditEvent` (category `MUTATION`, denied) is recorded. *(no commingling — [BR-501](../brd/06-functional-requirements.md))*
- **Given** a new revenue `Transaction`, **When** `descriptionAr` is empty, **Then** validation fails — the Arabic description is required. *(Arabic-authoritative — [NFR-01](../brd/08-nonfunctional-requirements.md))*
- **Given** any legally-significant record is created, **When** it is written, **Then** both `xAt` (UTC) and a frozen `xAtHijri` are stored, and the Hijri value never changes on later reads. *([NFR-02](../brd/08-nonfunctional-requirements.md))*
- **Given** a `Document` with `retentionUntil` in the future, **When** deletion is attempted, **Then** it is blocked. *([BR-702](../brd/06-functional-requirements.md)/[NFR-07](../brd/08-nonfunctional-requirements.md))*
- **Given** an executed `Distribution`, **When** its components are summed, **Then** `reserve + operating + nazirFee + paid + withheld == grossRevenue` with no negatives. *([BR-505](../brd/06-functional-requirements.md)/[NFR-14](../brd/08-nonfunctional-requirements.md))*
- **Given** a user with a `WaqfAccessGrant` for waqf A only, **When** they query waqf B, **Then** the Prisma scoping extension returns nothing and the attempt is audited. *([NFR-05](../brd/08-nonfunctional-requirements.md))*

---

## Requirements covered

**Primary (entities/relations designed here):** [BR-101](../brd/06-functional-requirements.md), [BR-102](../brd/06-functional-requirements.md), [BR-103](../brd/06-functional-requirements.md), [BR-104](../brd/06-functional-requirements.md), [BR-105](../brd/06-functional-requirements.md), [BR-109](../brd/06-functional-requirements.md) (Waqf/Waqif/Client + TrusteeshipDeed + eligibility); [BR-201](../brd/06-functional-requirements.md)–[BR-204](../brd/06-functional-requirements.md), [BR-206](../brd/06-functional-requirements.md), [BR-208](../brd/06-functional-requirements.md) (Beneficiary + UBO + lineage + payments); [BR-301](../brd/06-functional-requirements.md), [BR-306](../brd/06-functional-requirements.md) (Asset + reserved-matter gate); [BR-401](../brd/06-functional-requirements.md)–[BR-404](../brd/06-functional-requirements.md) (Expropriation entity, workflow Phase 3); [BR-501](../brd/06-functional-requirements.md), [BR-502](../brd/06-functional-requirements.md), [BR-504](../brd/06-functional-requirements.md), [BR-505](../brd/06-functional-requirements.md), [BR-507](../brd/06-functional-requirements.md) (BankAccount, Transaction, Budget, Distribution, NazirFee); [BR-601](../brd/06-functional-requirements.md), [BR-603](../brd/06-functional-requirements.md) (ComplianceObligation/Task, GovernmentFiling); [BR-612](../brd/06-functional-requirements.md) (LegalCase); [BR-701](../brd/06-functional-requirements.md), [BR-702](../brd/06-functional-requirements.md) (Document + retention); [BR-1001](../brd/06-functional-requirements.md) (Deadline); [BR-1102](../brd/06-functional-requirements.md), [BR-1106](../brd/06-functional-requirements.md) (ApprovalRequest, migration target shapes). Operational entities Lease/MaintenanceTicket/Vendor/ZakatFiling seed [BR-302](../brd/06-functional-requirements.md), [BR-303](../brd/06-functional-requirements.md), [BR-305](../brd/06-functional-requirements.md), [BR-509](../brd/06-functional-requirements.md).

**Non-functional:** [NFR-01](../brd/08-nonfunctional-requirements.md) (Arabic-authoritative fields), [NFR-02](../brd/08-nonfunctional-requirements.md) (dual Hijri/Gregorian storage), [NFR-04](../brd/08-nonfunctional-requirements.md) (AuditEvent table), [NFR-05](../brd/08-nonfunctional-requirements.md) (WaqfAccessGrant), [NFR-07](../brd/08-nonfunctional-requirements.md) (retention fields), [NFR-13](../brd/08-nonfunctional-requirements.md) (Setting), [NFR-14](../brd/08-nonfunctional-requirements.md) (integrity constraints).
