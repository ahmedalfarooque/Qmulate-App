# ~~OPEN DECISION~~ — reconcile the role model to one canonical set

Status: **CLOSED — decided 2026-07-27. Superseded by
[ADR-0004 · The Role Model Is §10.2's Thirteen](ADR-0004-role-model-thirteen.md).**
Privileged & Confidential

> **Outcome: §10.2's THIRTEEN.** The recommendation below was accepted. The Prisma enum was
> narrowed from 16: `MANDATE_LEAD` and `ACCOUNTANT` were synonyms and were deleted; **`APPROVER`
> was deleted outright — removed, not remapped** — because approval is an action the Nazir holds
> and a standing approver seat would create the second approval authority BR-105/BR-1103 forbid.
> `SYSTEM_ADMIN` keeps its DB spelling and maps to `admin`.
>
> This paper is kept for the reasoning and the side-by-side comparison, which the ADR does not
> repeat. **For what was decided and how it is enforced, read the ADR.** Everything below
> describes the state *before* the decision — including the "16 as built" column, which is now
> history.

---

## The three lists, side by side

`—` means the row has no counterpart in that column.

| #   | §10.2 role key (13) — _the considered model_ | Prisma `enum Role` (16) — _as built_ | §07 `enum Role` (11) — _the older list_ | Note                                                              |
| --- | -------------------------------------------- | ------------------------------------ | --------------------------------------- | ----------------------------------------------------------------- |
| 1   | `nazir`                                      | `NAZIR`                              | `NAZIR`                                 | agrees everywhere                                                 |
| 2   | `authorized_rep`                             | `AUTHORIZED_REP`                     | —                                       | §07 predates the delegated-manager seat (BR-105, joint & several) |
| 3   | `case_manager`                               | `CASE_MANAGER`                       | —                                       |                                                                   |
| 3′  | ″ _(same key)_                               | `MANDATE_LEAD`                       | `MANDATE_LEAD`                          | **synonym** — both DB values map to `case_manager`                |
| 4   | `finance`                                    | `FINANCE`                            | —                                       |                                                                   |
| 4′  | ″ _(same key)_                               | `ACCOUNTANT`                         | `ACCOUNTANT`                            | **synonym** — both DB values map to `finance`                     |
| 5   | `compliance_officer`                         | `COMPLIANCE_OFFICER`                 | —                                       | §07 has no compliance seat at all                                 |
| 6   | `aml_officer`                                | `AML_OFFICER`                        | `AML_OFFICER`                           | the no-tipping-off compartment (§6, BR-604)                       |
| 7   | `admin`                                      | `SYSTEM_ADMIN`                       | `SYSTEM_ADMIN`                          | **name differs**: DB `SYSTEM_ADMIN` → key `admin`                 |
| 8   | `leadership`                                 | `LEADERSHIP`                         | —                                       | portfolio read-only                                               |
| 9   | `family_board`                               | `FAMILY_BOARD`                       | `FAMILY_BOARD`                          | the Principal                                                     |
| 10  | `beneficiary`                                | `BENEFICIARY`                        | `BENEFICIARY`                           | hard self-isolation (BR-210)                                      |
| 11  | `subcontractor`                              | `SUBCONTRACTOR`                      | `SUBCONTRACTOR`                         |                                                                   |
| 12  | `auditor`                                    | `AUDITOR`                            | `AUDITOR`                               |                                                                   |
| 13  | `counsel`                                    | `COUNSEL`                            | `COUNSEL`                               |                                                                   |
| —   | **no counterpart**                           | `APPROVER`                           | `APPROVER`                              | **orphan** — see below                                            |

**So the arithmetic is: 16 = 13 + 2 synonyms + 1 orphan.** The lists are not three rival role
models; they are one model plus accumulated drift.

### The three surplus DB values

| Value          | What it is                                                                                                                                                                                                                                                         | Evidence                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| `MANDATE_LEAD` | An older name for `CASE_MANAGER`. Both already map to the single key `case_manager`.                                                                                                                                                                               | `DB_ROLE_TO_ROLE_KEY`, `packages/auth/src/roles.ts` |
| `ACCOUNTANT`   | An older name for `FINANCE`. Both already map to `finance`.                                                                                                                                                                                                        | same                                                |
| `APPROVER`     | **Deliberately unmapped.** §10 does not model "approver" as a role at all — approval is an _action_ (`A*`) that `nazir` holds. A standing APPROVER role would quietly create a second approval authority next to the Nazir, which BR-105/BR-1103 say cannot exist. | `roles.ts` comment; §10.2 §4 maker-checker table    |

`APPROVER` currently falls through to the fail-safe branch of `requiresTotpForDbRole`, so it is
treated as TOTP-required. It is not a live security hole — it is an unused door.

### §07's 11 is simply the oldest list

It is missing five seats that §10 introduced (`authorized_rep`, `case_manager`, `finance`,
`compliance_officer`, `leadership`) and keeps two names §10 renamed. Nothing in §07 argues for
its list — the enum is stated without commentary, and §07 defers the access model to §10 in its
own text. Treat it as stale, not as a third opinion.

---

## Recommendation (yours to accept or reject)

**Adopt §10.2's 13 as canonical**, and make the other two conform.

Why §10.2 and not the others:

- It is the only one of the three with a **reason per role** — a RACI party, a seat/no-seat call
  and an authority posture — plus a full permission grid and a maker-checker table built on it.
  The other two are bare enum literals.
- It is what **already shipped** in `packages/auth`, so `RoleKey`, `INTERNAL_OPS_ROLES`,
  `TOTP_REQUIRED_ROLES` and the 53 passing role tests are already expressed in it.
- The 16-value enum is a **superset** of it, so conforming is subtraction, not redesign.

### What adopting it costs

| Step | Change                                                                                       | Risk                                                                                                                                                                                                                                                                        |
| ---- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Delete `MANDATE_LEAD`, `ACCOUNTANT`, `APPROVER` from the Prisma `enum Role`.                 | Enum-narrowing migration. The fixture seed writes `ACCOUNTANT` and `APPROVER` for two of its seven users — both need repointing (`ACCOUNTANT`→`FINANCE`; the approver seat becomes a second `NAZIR`, or the user is dropped). No real data exists, so there is no backfill. |
| 2    | Rename DB `SYSTEM_ADMIN` → `ADMIN`, **or** keep the mapping.                                 | Cosmetic. Keeping the mapping costs one line already written; renaming costs another migration. **Recommend keeping `SYSTEM_ADMIN`** and leaving `DB_ROLE_TO_ROLE_KEY` to translate — the DB value and the product key do not have to be the same string.                   |
| 3    | Rewrite §07's `enum Role` line to the canonical set and add a pointer to §10.2 as the owner. | Docs only.                                                                                                                                                                                                                                                                  |
| 4    | Delete `DB_ROLE_TO_ROLE_KEY`'s synonym entries once the enum is narrowed.                    | Trivial; the tests pin it.                                                                                                                                                                                                                                                  |

### The alternative, stated fairly

**Keep 16 and treat §10.2's 13 as a presentation layer.** Cheaper right now — no migration, no
seed change — and synonyms are harmless while `DB_ROLE_TO_ROLE_KEY` is total. The cost is that
every future permission decision has to be made twice (once per DB synonym), and `APPROVER`
stays available to be granted by a future admin screen, which is exactly the standing second
approval authority BR-105 rules out. Recommend against, but it is a legitimate call if S2 is
tight.

---

## What is NOT proposed here

- No change to the **broad-TOTP posture**. `TOTP_REQUIRED_ROLES` covers all eight internal ops
  seats where the §3 grid marks only `nazir`; that deviation is deliberate, recorded in
  `BUILD-PLAN.md`, and is a separate decision.
- No change to `ADR-0002` (receipt classification stays provisional).

## Decide by

Before S2/E2 writes the procedure ladder. Reply with either **"13 canonical"** (and whether to
rename `SYSTEM_ADMIN`) or **"keep 16"**, and this becomes an ADR with the migration attached.

## Sources

- `docs/product/prd/10-roles-access-matrix-spec.md` §2.1–2.3, §3 grid, §4 maker-checker
- `docs/product/prd/07-data-model-spec.md` §11 (`enum Role`, line 40)
- `packages/database/prisma/schema.prisma` (`enum Role`)
- `packages/auth/src/roles.ts` (`ROLES`, `DB_ROLE_TO_ROLE_KEY`, `requiresTotpForDbRole`)
