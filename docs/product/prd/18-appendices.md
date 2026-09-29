# 18 · Appendices — Requirements Traceability Matrix

The reverse index proving every BRD requirement is designed for in this PRD: each **BR-###** / **NFR-##** → the PRD section(s) that design it → phase → status.

Status: Draft v0.1 · Privileged & Confidential

---

## How to read this appendix

This is the PRD's coverage ledger. It maps **all 81 functional requirements** ([BR-101 … BR-1106](../brd/06-functional-requirements.md)) and **all 14 non-functional requirements** ([NFR-01 … NFR-14](../brd/08-nonfunctional-requirements.md)) onto the PRD sections that specify their build. The BRD's own forward index is [07 · Compliance traceability](../brd/07-compliance-traceability.md) (requirement → regulation); this appendix is the complementary index (requirement → design).

**Status vocabulary** (one word per requirement):

| Status | Meaning |
|---|---|
| **designed** | A dedicated HOW-level section specs the build (data shapes, engine rules, screens, roles, controls, or acceptance criteria). Phase-1 (P0/P1) requirements should all be here. |
| **referenced** | Named and scoped in the PRD (scope, non-goals, functional list) but not given a dedicated design section — typically low-priority (Could) items that need no engine of their own. |
| **deferred** | Out of Phase 1 by the priority cut (Phase 2 portal/cadence, Phase 3 property/expropriation/fee-automation/handover). The entity may be **modeled** now (e.g. Expropriation) but the workflow is later. |

**Phase** follows the PRD scope cut in [05 · Scope, phasing & priority](./05-scope-phasing-priority.md): **P0** = go-live blocker · **P1** = Phase-1 fast-follow · **P2** = Phase-1 optional/Could · **Phase-2** = portal & reporting cadence · **Phase-3** = property, expropriation→istibdal, fee automation, zakat/investment, handover/training.

**GAP flag:** any requirement not designed, referenced, or deferred by *any* section is marked **GAP**. See [Coverage summary](#coverage-summary) — there are currently **zero gaps**.

---

## Section legend

Short codes used in the matrix cells below (all links relative to this file):

| Code | Section |
|---|---|
| [00](./00-document-control.md) | Document control |
| [01](./01-problem-statement.md) | Problem statement |
| [02](./02-goals-metrics.md) | Goals & metrics |
| [03](./03-non-goals.md) | Non-goals |
| [04](./04-personas-user-stories.md) | Personas & user stories |
| [05](./05-scope-phasing-priority.md) | Scope, phasing & priority |
| [06](./06-functional-requirements.md) | Functional requirements (PRD) |
| [07](./07-data-model-spec.md) | Data model spec |
| [08](./08-distribution-engine-spec.md) | Distribution engine spec |
| [09](./09-compliance-deadline-engine-spec.md) | Compliance & deadline engine spec |
| [10](./10-roles-access-matrix-spec.md) | Roles & access-matrix spec |
| [11](./11-localization-spec.md) | Localization spec (Arabic/RTL · Hijri/Gregorian) |
| [12](./12-security-audit-retention-spec.md) | Security, audit & retention spec |
| [13](./13-ux-designsystem-reference.md) | UX & design-system reference |
| [14](./14-reporting-dashboards-spec.md) | Reporting & dashboards spec |
| [15](./15-nonfunctional-requirements.md) | Non-functional requirements (PRD) |
| [16](./16-open-questions.md) | Open questions |
| [17](./17-build-ship-dod.md) | Build, ship & definition of done |

> Every requirement is additionally enumerated in [05](./05-scope-phasing-priority.md) and [06](./06-functional-requirements.md); those two are omitted from the "design home" column where a more specific spec section exists, to keep the primary owner legible.
>
> **Two cross-cutting design homes** are likewise not repeated in every row: **[07 · Data model](./07-data-model-spec.md)** is the entity/field/relation home for *all* entity-bearing requirements (BR-1xx/2xx/3xx/4xx/5xx/6xx/7xx and the audit/access/config tables), and **[11 · Localization](./11-localization-spec.md)** is the home for the Arabic-authoritative, RTL, and Hijri/Gregorian requirements (NFR-01, NFR-02, BR-502, BR-1003). Treat 07 and 11 as implicit co-owners wherever a row involves persisted data or bilingual/calendar behaviour.

---

## BR-1xx · Endowment & Deed Management

| Req | Design home | Phase | Status |
|---|---|---|---|
| [BR-101](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [13](./13-ux-designsystem-reference.md) · [17](./17-build-ship-dod.md) | P0 | designed |
| [BR-102](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [13](./13-ux-designsystem-reference.md) · [17](./17-build-ship-dod.md) | P0 | designed |
| [BR-103](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [08](./08-distribution-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-104](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [08](./08-distribution-engine-spec.md) · [09](./09-compliance-deadline-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-105](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [10](./10-roles-access-matrix-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-106](../brd/06-functional-requirements.md) | [05](./05-scope-phasing-priority.md) · [06](./06-functional-requirements.md) | P1 | referenced |
| [BR-107](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [09](./09-compliance-deadline-engine-spec.md) | P1 | designed |
| [BR-108](../brd/06-functional-requirements.md) | [05](./05-scope-phasing-priority.md) · [06](./06-functional-requirements.md) | P2 | referenced |
| [BR-109](../brd/06-functional-requirements.md) | [04](./04-personas-user-stories.md) · [10](./10-roles-access-matrix-spec.md) · [17](./17-build-ship-dod.md) | P0 | designed |

## BR-2xx · Beneficiary & UBO / KYC Management

| Req | Design home | Phase | Status |
|---|---|---|---|
| [BR-201](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [08](./08-distribution-engine-spec.md) · [10](./10-roles-access-matrix-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-202](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [13](./13-ux-designsystem-reference.md) · [17](./17-build-ship-dod.md) | P0 | designed |
| [BR-203](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-204](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [08](./08-distribution-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-205](../brd/06-functional-requirements.md) | [04](./04-personas-user-stories.md) · [08](./08-distribution-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-206](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [08](./08-distribution-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-207](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [13](./13-ux-designsystem-reference.md) | P1 | designed |
| [BR-208](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [13](./13-ux-designsystem-reference.md) · [17](./17-build-ship-dod.md) | P1 | designed |
| [BR-209](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) | Phase-2 | deferred |
| [BR-210](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [10](./10-roles-access-matrix-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |

## BR-3xx · Property / Asset Management

| Req | Design home | Phase | Status |
|---|---|---|---|
| [BR-301](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [17](./17-build-ship-dod.md) | P0 | designed |
| [BR-302](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) | Phase-3 | deferred |
| [BR-303](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) | Phase-3 | deferred |
| [BR-304](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) | Phase-3 | deferred |
| [BR-305](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) · [17](./17-build-ship-dod.md) | Phase-3 | deferred |
| [BR-306](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [13](./13-ux-designsystem-reference.md) · [17](./17-build-ship-dod.md) | P0 | designed |
| [BR-307](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) | Phase-3 | deferred |

## BR-4xx · Expropriation Management (entity modeled now, workflow Phase 3)

| Req | Design home | Phase | Status |
|---|---|---|---|
| [BR-401](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) · [17](./17-build-ship-dod.md) | Phase-3 | deferred |
| [BR-402](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) | Phase-3 | deferred |
| [BR-403](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [04](./04-personas-user-stories.md) · [06](./06-functional-requirements.md) | Phase-3 | deferred |
| [BR-404](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) | Phase-3 | deferred |

## BR-5xx · Financial Management

| Req | Design home | Phase | Status |
|---|---|---|---|
| [BR-501](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [08](./08-distribution-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-502](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [13](./13-ux-designsystem-reference.md) · [17](./17-build-ship-dod.md) | P0 | designed |
| [BR-503](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [13](./13-ux-designsystem-reference.md) · [15](./15-nonfunctional-requirements.md) | P1 | designed |
| [BR-504](../brd/06-functional-requirements.md) | [05](./05-scope-phasing-priority.md) · [06](./06-functional-requirements.md) | P1 | referenced |
| [BR-505](../brd/06-functional-requirements.md) | [08](./08-distribution-engine-spec.md) · [13](./13-ux-designsystem-reference.md) · [16](./16-open-questions.md) | P0 | designed |
| [BR-506](../brd/06-functional-requirements.md) | [08](./08-distribution-engine-spec.md) · [10](./10-roles-access-matrix-spec.md) · [15](./15-nonfunctional-requirements.md) | P0 | designed |
| [BR-507](../brd/06-functional-requirements.md) | [08](./08-distribution-engine-spec.md) · [10](./10-roles-access-matrix-spec.md) · [16](./16-open-questions.md) | P0 (deduction step; full fee automation Phase-3) | designed |
| [BR-508](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) | Phase-3 | deferred |
| [BR-509](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) · [16](./16-open-questions.md) | Phase-3 | deferred |
| [BR-510](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) · [16](./16-open-questions.md) | Phase-3 | deferred |
| [BR-511](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [08](./08-distribution-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P1 | designed |

## BR-6xx · Compliance & Governance

| Req | Design home | Phase | Status |
|---|---|---|---|
| [BR-601](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [09](./09-compliance-deadline-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-602](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [09](./09-compliance-deadline-engine-spec.md) · [17](./17-build-ship-dod.md) | P0 | designed |
| [BR-603](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [09](./09-compliance-deadline-engine-spec.md) · [10](./10-roles-access-matrix-spec.md) | P0 | designed |
| [BR-604](../brd/06-functional-requirements.md) | [09](./09-compliance-deadline-engine-spec.md) · [10](./10-roles-access-matrix-spec.md) · [12](./12-security-audit-retention-spec.md) | P0 | designed |
| [BR-605](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [09](./09-compliance-deadline-engine-spec.md) | P0 | designed |
| [BR-606](../brd/06-functional-requirements.md) | [09](./09-compliance-deadline-engine-spec.md) · [17](./17-build-ship-dod.md) | P1 | designed |
| [BR-607](../brd/06-functional-requirements.md) | [09](./09-compliance-deadline-engine-spec.md) · [12](./12-security-audit-retention-spec.md) · [10](./10-roles-access-matrix-spec.md) | P0 | designed |
| [BR-608](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [09](./09-compliance-deadline-engine-spec.md) | P1 | designed |
| [BR-609](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) | Phase-3 | deferred |
| [BR-610](../brd/06-functional-requirements.md) | [05](./05-scope-phasing-priority.md) · [06](./06-functional-requirements.md) | P2 | referenced |
| [BR-611](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [08](./08-distribution-engine-spec.md) · [09](./09-compliance-deadline-engine-spec.md) | P1 | designed |
| [BR-612](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [09](./09-compliance-deadline-engine-spec.md) · [10](./10-roles-access-matrix-spec.md) | P1 | designed |
| [BR-613](../brd/06-functional-requirements.md) | [05](./05-scope-phasing-priority.md) · [06](./06-functional-requirements.md) | P2 | referenced |

## BR-7xx · Document & Records Management (Vault)

| Req | Design home | Phase | Status |
|---|---|---|---|
| [BR-701](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [12](./12-security-audit-retention-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-702](../brd/06-functional-requirements.md) | [10](./10-roles-access-matrix-spec.md) · [12](./12-security-audit-retention-spec.md) · [17](./17-build-ship-dod.md) | P0 | designed |
| [BR-703](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [12](./12-security-audit-retention-spec.md) · [13](./13-ux-designsystem-reference.md) | P1 | designed |
| [BR-704](../brd/06-functional-requirements.md) | [06](./06-functional-requirements.md) · [13](./13-ux-designsystem-reference.md) | P1 | designed |

## BR-8xx · Client & Beneficiary Portal (Phase 2)

| Req | Design home | Phase | Status |
|---|---|---|---|
| [BR-801](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [04](./04-personas-user-stories.md) · [06](./06-functional-requirements.md) | Phase-2 | deferred |
| [BR-802](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [04](./04-personas-user-stories.md) · [06](./06-functional-requirements.md) | Phase-2 | deferred |
| [BR-803](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [04](./04-personas-user-stories.md) · [06](./06-functional-requirements.md) | Phase-2 | deferred |
| [BR-804](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [04](./04-personas-user-stories.md) · [06](./06-functional-requirements.md) | Phase-2 | deferred |
| [BR-805](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [04](./04-personas-user-stories.md) · [06](./06-functional-requirements.md) | Phase-2 | deferred |
| [BR-806](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) · [10](./10-roles-access-matrix-spec.md) | Phase-2 | deferred |

## BR-9xx · Reporting & Dashboards

| Req | Design home | Phase | Status |
|---|---|---|---|
| [BR-901](../brd/06-functional-requirements.md) | [14](./14-reporting-dashboards-spec.md) · [13](./13-ux-designsystem-reference.md) · [09](./09-compliance-deadline-engine-spec.md) | P0 | designed |
| [BR-902](../brd/06-functional-requirements.md) | [14](./14-reporting-dashboards-spec.md) · [08](./08-distribution-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P1 | designed |
| [BR-903](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [14](./14-reporting-dashboards-spec.md) | Phase-2 | deferred |
| [BR-904](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [14](./14-reporting-dashboards-spec.md) | Phase-2 | deferred |
| [BR-905](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [14](./14-reporting-dashboards-spec.md) | Phase-2 | deferred |
| [BR-906](../brd/06-functional-requirements.md) | [14](./14-reporting-dashboards-spec.md) · [10](./10-roles-access-matrix-spec.md) · [17](./17-build-ship-dod.md) | P1 | designed |

## BR-10xx · Notifications & Deadline Engine

| Req | Design home | Phase | Status |
|---|---|---|---|
| [BR-1001](../brd/06-functional-requirements.md) | [09](./09-compliance-deadline-engine-spec.md) · [08](./08-distribution-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [BR-1002](../brd/06-functional-requirements.md) | [09](./09-compliance-deadline-engine-spec.md) · [13](./13-ux-designsystem-reference.md) · [17](./17-build-ship-dod.md) | P0 | designed |
| [BR-1003](../brd/06-functional-requirements.md) | [09](./09-compliance-deadline-engine-spec.md) · [08](./08-distribution-engine-spec.md) · [15](./15-nonfunctional-requirements.md) | P0 | designed |
| [BR-1004](../brd/06-functional-requirements.md) | [09](./09-compliance-deadline-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P1 | designed |
| [BR-1005](../brd/06-functional-requirements.md) | [09](./09-compliance-deadline-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P1 | designed |

## BR-11xx · Engagement Lifecycle, RACI & Reserved-Matter Approvals

| Req | Design home | Phase | Status |
|---|---|---|---|
| [BR-1101](../brd/06-functional-requirements.md) | [04](./04-personas-user-stories.md) · [06](./06-functional-requirements.md) · [17](./17-build-ship-dod.md) | P1 | designed |
| [BR-1102](../brd/06-functional-requirements.md) | [10](./10-roles-access-matrix-spec.md) · [13](./13-ux-designsystem-reference.md) · [17](./17-build-ship-dod.md) | P0 | designed |
| [BR-1103](../brd/06-functional-requirements.md) | [10](./10-roles-access-matrix-spec.md) · [13](./13-ux-designsystem-reference.md) · [17](./17-build-ship-dod.md) | P1 | designed |
| [BR-1104](../brd/06-functional-requirements.md) | [03](./03-non-goals.md) · [06](./06-functional-requirements.md) | Phase-3 | deferred |
| [BR-1105](../brd/06-functional-requirements.md) | [04](./04-personas-user-stories.md) · [06](./06-functional-requirements.md) | P1 | designed |
| [BR-1106](../brd/06-functional-requirements.md) | [12](./12-security-audit-retention-spec.md) · [06](./06-functional-requirements.md) · [17](./17-build-ship-dod.md) | P0 | designed |

---

## NFR-## · Non-Functional Requirements

| Req | Design home | Phase | Status |
|---|---|---|---|
| [NFR-01](../brd/08-nonfunctional-requirements.md) | [15](./15-nonfunctional-requirements.md) · [13](./13-ux-designsystem-reference.md) · [00](./00-document-control.md) | P0 | designed |
| [NFR-02](../brd/08-nonfunctional-requirements.md) | [15](./15-nonfunctional-requirements.md) · [09](./09-compliance-deadline-engine-spec.md) · [13](./13-ux-designsystem-reference.md) | P0 | designed |
| [NFR-03](../brd/08-nonfunctional-requirements.md) | [15](./15-nonfunctional-requirements.md) · [12](./12-security-audit-retention-spec.md) · [16](./16-open-questions.md) | P0 | designed |
| [NFR-04](../brd/08-nonfunctional-requirements.md) | [12](./12-security-audit-retention-spec.md) · [15](./15-nonfunctional-requirements.md) | P0 | designed |
| [NFR-05](../brd/08-nonfunctional-requirements.md) | [10](./10-roles-access-matrix-spec.md) · [12](./12-security-audit-retention-spec.md) · [15](./15-nonfunctional-requirements.md) | P0 | designed |
| [NFR-06](../brd/08-nonfunctional-requirements.md) | [12](./12-security-audit-retention-spec.md) · [10](./10-roles-access-matrix-spec.md) · [00](./00-document-control.md) | P0 | designed |
| [NFR-07](../brd/08-nonfunctional-requirements.md) | [12](./12-security-audit-retention-spec.md) · [15](./15-nonfunctional-requirements.md) · [16](./16-open-questions.md) | P0 | designed |
| [NFR-08](../brd/08-nonfunctional-requirements.md) | [08](./08-distribution-engine-spec.md) · [10](./10-roles-access-matrix-spec.md) · [15](./15-nonfunctional-requirements.md) | P0 (money paths) | designed |
| [NFR-09](../brd/08-nonfunctional-requirements.md) | [10](./10-roles-access-matrix-spec.md) · [15](./15-nonfunctional-requirements.md) | P0 | designed |
| [NFR-10](../brd/08-nonfunctional-requirements.md) | [15](./15-nonfunctional-requirements.md) · [09](./09-compliance-deadline-engine-spec.md) · [14](./14-reporting-dashboards-spec.md) | P1 | designed |
| [NFR-11](../brd/08-nonfunctional-requirements.md) | [15](./15-nonfunctional-requirements.md) · [13](./13-ux-designsystem-reference.md) · [14](./14-reporting-dashboards-spec.md) | P1 | designed |
| [NFR-12](../brd/08-nonfunctional-requirements.md) | [15](./15-nonfunctional-requirements.md) · [12](./12-security-audit-retention-spec.md) · [14](./14-reporting-dashboards-spec.md) | P1 | designed |
| [NFR-13](../brd/08-nonfunctional-requirements.md) | [15](./15-nonfunctional-requirements.md) · [08](./08-distribution-engine-spec.md) · [14](./14-reporting-dashboards-spec.md) | P1 | designed |
| [NFR-14](../brd/08-nonfunctional-requirements.md) | [15](./15-nonfunctional-requirements.md) · [08](./08-distribution-engine-spec.md) · [14](./14-reporting-dashboards-spec.md) | P1 | designed |

---

## Coverage summary

**95 requirements total: 81 functional (BR-###) + 14 non-functional (NFR-##). Zero GAPs.**

| Status | Count | Requirements |
|---|---|---|
| **designed** | 68 | BR-101–105, 107, 109, 201–208, 210, 301, 306, 501–503, 505–507, 511, 601–608, 611, 612, 701–704, 901, 902, 906, 1001–1005, 1101–1103, 1105, 1106; NFR-01–14 |
| **referenced** | 5 | BR-106, 108, 504, 610, 613 |
| **deferred** | 22 | BR-209, 302–305, 307, 401–404, 508–510, 609, 801–806, 903–905, 1104 |

**By phase:**

| Phase | Requirements |
|---|---|
| **P0** (go-live blockers) | BR-101–105, 109, 201–206, 210, 301, 306, 501, 502, 505, 506, 507, 601–605, 607, 701, 702, 901, 1001–1003, 1102, 1106; NFR-01–09 |
| **P1** (Phase-1 fast-follow) | BR-106, 107, 207, 208, 503, 504, 511, 606, 608, 611, 612, 703, 704, 902, 906, 1004, 1005, 1101, 1103, 1105; NFR-10–14 |
| **P2** (Phase-1 optional / Could) | BR-108, 610, 613 |
| **Phase-2** (portal & cadence depth) | BR-209, 801–806, 903–905 |
| **Phase-3** (property, expropriation, fee automation, zakat/investment, handover/training) | BR-302–305, 307, 401–404, 508–510, 609, 1104 |

### Thin-coverage watch list (`referenced`, not yet a design home)

These five are in scope and enumerated but do **not** yet have a dedicated design section. None is a go-live blocker; each should acquire a design home before its phase begins:

- **[BR-106](../brd/06-functional-requirements.md)** — condition-interpretation request workflow (Should). Needs a small state machine (request → authority/waqif → outcome) before dependent actions unblock; candidate home is [09](./09-compliance-deadline-engine-spec.md).
- **[BR-108](../brd/06-functional-requirements.md)** — successor-Nazir designation (Could). A field-level addition to the Trusteeship Deed model in [10](./10-roles-access-matrix-spec.md).
- **[BR-504](../brd/06-functional-requirements.md)** — budgets / estimates for Large/Medium (Must, class-gated). Marked P1; **flag** — this is a *Must* with only enumeration coverage. Should acquire acceptance criteria in [06](./06-functional-requirements.md) / a financial-module home before Phase-1 close.
- **[BR-610](../brd/06-functional-requirements.md)** — conflict-of-interest & self-dealing block to 2nd degree (Could). A rule on money/reserved-matter workflows; natural home [10](./10-roles-access-matrix-spec.md).
- **[BR-613](../brd/06-functional-requirements.md)** — donation/fundraising approval gate (Could). Recorded as out-of-scope for a family waqf; keep as a guard-rail note in [03](./03-non-goals.md).

---

## External pointers

- **Glossary** — Arabic domain vocabulary, beneficiary tiers/lines (§B), and the entitlement-order rule: [../../domain/glossary.md](../../domain/glossary.md).
- **Regulation index** — Nazarah Regulation, Beneficial-Ownership Standards, Awqaf Law, and the unified framework's ~30 sub-obligations: [../../domain/regulations/](../../domain/regulations/) and [../../domain/unified-framework.md](../../domain/unified-framework.md).
- **Design system** — the light-first neumorphic token set, RTL rules, and component library referenced throughout the UX sections: [./design/DESIGN.md](./design/DESIGN.md) (see also [13 · UX & design-system reference](./13-ux-designsystem-reference.md)).
- **BRD forward index** — requirement → regulation traceability: [../brd/07-compliance-traceability.md](../brd/07-compliance-traceability.md).

---

## Requirements covered

This appendix indexes **every** PRD requirement:

- **Functional:** BR-101, BR-102, BR-103, BR-104, BR-105, BR-106, BR-107, BR-108, BR-109, BR-201, BR-202, BR-203, BR-204, BR-205, BR-206, BR-207, BR-208, BR-209, BR-210, BR-301, BR-302, BR-303, BR-304, BR-305, BR-306, BR-307, BR-401, BR-402, BR-403, BR-404, BR-501, BR-502, BR-503, BR-504, BR-505, BR-506, BR-507, BR-508, BR-509, BR-510, BR-511, BR-601, BR-602, BR-603, BR-604, BR-605, BR-606, BR-607, BR-608, BR-609, BR-610, BR-611, BR-612, BR-613, BR-701, BR-702, BR-703, BR-704, BR-801, BR-802, BR-803, BR-804, BR-805, BR-806, BR-901, BR-902, BR-903, BR-904, BR-905, BR-906, BR-1001, BR-1002, BR-1003, BR-1004, BR-1005, BR-1101, BR-1102, BR-1103, BR-1104, BR-1105, BR-1106.
- **Non-functional:** NFR-01, NFR-02, NFR-03, NFR-04, NFR-05, NFR-06, NFR-07, NFR-08, NFR-09, NFR-10, NFR-11, NFR-12, NFR-13, NFR-14.
