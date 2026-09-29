# ADR 0004 — The Role Model Is §10.2's Thirteen

**Status:** DECIDED (Accepted) — applied 2026-07-27
**Date:** 2026-07-27
**Deciders:** QMULATE (product owner) — engineering presented the options and a recommendation; the pick was the product owner's
**Scope:** `packages/database` (the Prisma `Role` enum, migration `00000000000002_role_model_thirteen`, the fixture seed), `packages/auth` (`ROLES`, `DB_ROLE_TO_ROLE_KEY`, the TOTP predicates), and every epic that reads a grant — above all **S2/E2's RBAC procedure ladder and permission grid**, which was blocked on this.
**Relates to:** [§10 Roles & access matrix](../product/prd/10-roles-access-matrix-spec.md) · [§07 Data model §11](../product/prd/07-data-model-spec.md) · [Build plan S1/S2](../product/prd/BUILD-PLAN.md) · [BR-105](../product/brd/06-functional-requirements.md) · [BR-1103](../product/brd/06-functional-requirements.md) · [NFR-05](../product/brd/08-nonfunctional-requirements.md) · CLAUDE.md Binding rule 4
**Supersedes:** `OPEN-role-model-reconciliation.md` (the options paper this decision closes)
**Classification:** Privileged & Confidential — internal

---

## Decision (in one line)

**§10.2's THIRTEEN role keys are canonical. The Prisma `Role` enum was narrowed from 16 to those thirteen: `MANDATE_LEAD` and `ACCOUNTANT` were synonyms and were deleted; `APPROVER` was deleted outright — removed, not remapped — because approval is an *action* the Nazir holds, and a standing approver seat would create the second approval authority BR-105 and BR-1103 forbid.**

---

## The context, briefly

Three sources disagreed about how many roles QMULATE has:

| Source | Count |
|---|---|
| `07-data-model-spec.md` `enum Role` | 11 |
| `10-roles-access-matrix-spec.md` §2 (shipped in `packages/auth`) | **13** |
| Prisma `enum Role` as built in Sprint 1 | 16 |

They were never three rival models — they were one model plus accumulated drift:
**16 = 13 + 2 synonyms + 1 orphan.** §07's 11 was simply the oldest list, missing five seats §10
introduced and keeping two names §10 renamed; §07 defers the access model to §10 in its own text.

The full side-by-side comparison lives in the options paper this ADR supersedes.

## The canonical thirteen

| Product key (§10.2) | Prisma `Role` | Group |
|---|---|---|
| `nazir` | `NAZIR` | internal ops |
| `authorized_rep` | `AUTHORIZED_REP` | internal ops |
| `case_manager` | `CASE_MANAGER` | internal ops |
| `finance` | `FINANCE` | internal ops |
| `compliance_officer` | `COMPLIANCE_OFFICER` | internal ops |
| `aml_officer` | `AML_OFFICER` | internal ops |
| `admin` | `SYSTEM_ADMIN` | internal ops |
| `leadership` | `LEADERSHIP` | internal ops |
| `family_board` | `FAMILY_BOARD` | portal (Phase 2) |
| `beneficiary` | `BENEFICIARY` | portal (Phase 2) |
| `subcontractor` | `SUBCONTRACTOR` | third party |
| `auditor` | `AUDITOR` | third party |
| `counsel` | `COUNSEL` | third party |

`SYSTEM_ADMIN` deliberately keeps its database spelling and maps to `admin` through
`DB_ROLE_TO_ROLE_KEY`. A storage value and a product key need not be the same string, and a
rename migration buys nothing.

## Why §10.2 and not the other two

- It is the only one of the three with a **reason per role** — a RACI party, a seat/no-seat call
  and an authority posture — plus a permission grid and a maker-checker table built on it. The
  other two are bare enum literals.
- It is what **already shipped** in `packages/auth`, so `RoleKey`, `INTERNAL_OPS_ROLES` and
  `TOTP_REQUIRED_ROLES` were already expressed in it.
- The 16-value enum was a **superset**, so conforming was subtraction rather than redesign.

## `APPROVER`: removed, not remapped — and why that distinction matters

This is the load-bearing part of the decision.

§10 does not model "approver" as a role. Approval is an **action** — the `A*` / `S*` cells in the
§10.2 §3 grid — and in the maker-checker table (§10.2 §4) the required distinct approver on a bank
movement or distribution run **is the `nazir`**. A standing `APPROVER` role would mean somebody
other than the Nazir holding approval authority as a property of their seat, which is exactly what
two requirements rule out:

- **BR-105** — accountability rests with the Nazir, jointly and severally with an Authorized
  Representative whose acts are attributed and visible to the Nazir.
- **BR-1103** — the RACI encodes approvals so that accountability *stays with the Nazir*.

So there is deliberately **no successor value**. Anyone tempted to add one should read this
section first: the authority did not move when the role was deleted, because it was never the
role's to begin with.

### What that means in practice

1. **The migration refuses rather than remaps.** Postgres cannot drop an enum value in place, so
   the type is recreated and every column recast. A migration *could* map `APPROVER` onto `NAZIR`
   and appear to succeed — and that would hand somebody the Nazir's approval authority as a side
   effect of a DDL script, with no approval trail and nobody deciding it. Migration
   `00000000000002_role_model_thirteen` therefore **fails loudly** while any row still holds a
   removed value, naming the rows and the two legitimate resolutions. Repointing a grant is a
   governance act; it belongs in an audited application write.
2. **One fixture seat had to be decided, not defaulted.** `user-approver-001` in the fixture seed
   held `APPROVER`, with the documented purpose *"Checker-side subject: maker-checker requires
   checkerId !== makerId."* The seat is still needed; the role is gone. Under §10.2 §4 the distinct
   approver on money **is a nazir**, so the fixture now grants `NAZIR`. That is not APPROVER under
   another name — it is the seat pointed at the role that actually holds the authority.
   `approval:request:read` / `approval:request:approve` moved from the deleted `APPROVER` grant
   shape to the `NAZIR` shape for the same reason.
3. **Two `NAZIR` grants on one endowment is a fixture convenience**, so dual control can be
   tested with two distinct identities. It is not a claim about the deed — `TrusteeshipDeed`
   remains the source of truth for who the Nazir is. If E2 prefers the checker to be the deed's
   own primary Nazir, `user-approver-001` can be dropped and the maker-checker tests re-pointed
   at `user-nazir-001`; that is noted in the seed.

## Consequences

**Good**

- One vocabulary. S2/E2 can write the permission grid once instead of once per synonym.
- `DB_ROLE_TO_ROLE_KEY` is now **total** over the enum, and a new test asserts parity against
  `schema.prisma` directly — the drift existed precisely because nothing compared the two sides.
- The prohibited-second-approver hole is closed structurally: `APPROVER` cannot be granted because
  it cannot be represented.

**Costs, accepted**

- An enum-narrowing migration, which on Postgres means recreating the type and recasting two
  columns (`waqf_access_grant.role`, `membership.role`).
- The baseline migration still creates the original 16 values and migration 3 narrows them. That
  is deliberate: it is the honest history, and the narrowing test replays the baseline to
  reconstruct the pre-decision state.

**Unchanged**

- `requiresTotpForDbRole` still **fails safe** — an unmapped or unknown DB role is treated as
  TOTP-required — so adding a value to the enum without mapping it can never mint a TOTP-exempt
  seat.
- No real data exists (`DATA_CLASSIFICATION=fixture-only`, NFR-03), so there was no backfill.
- [ADR-0002](ADR-0002-receipt-income-capital-classification.md) is untouched and remains
  **provisional**; nothing in this decision touches the receipt-classification path.

## How this is enforced

| Control | Where |
|---|---|
| The enum is exactly the thirteen | `packages/database/prisma/schema.prisma` |
| `roles.ts` and the schema cannot drift | `packages/auth/test/roles.test.ts` — "is in exact parity with the Prisma Role enum in schema.prisma" (reads `schema.prisma`) |
| The map is total; removed values stay unmapped | same file — "the map is TOTAL over the narrowed enum", plus a case per removed value |
| The migration refuses rather than remaps, and a refusal is a no-op | `packages/database/test/role-enum-narrowing.integration.test.ts` (4 cases) |
| An unknown role is still TOTP-gated | `packages/auth/test/roles.test.ts` — "fails SAFE" |

## What would reopen this

A deed, or the Authority, requiring an approval authority that is *not* the Nazir. That would be a
change to the governance model, not to an enum, and would need BR-105/BR-1103 revisited first —
which is a fiqh/legal question and therefore the product owner's and counsel's, not engineering's
(CLAUDE.md Binding rule 4).
