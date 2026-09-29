# ADR 0005 — The Nazir Is the Sole Approval Authority

**Status:** DECIDED (Accepted) — applied 2026-07-27
**Date:** 2026-07-27
**Deciders:** QMULATE (product owner) — engineering presented the options, the tradeoffs and a recommendation; both picks were the product owner's
**Scope:** `packages/domain` (the permission algebra and role presets), `packages/api` (the RBAC procedure ladder), `packages/database` (the grant constraints and the Postgres-layer enforcement), and every later epic that approves or signs anything — money movements (E5/E6), statutory filings (E7), reserved matters (E11).
**Relates to:** [§10 Roles & access matrix](../product/prd/10-roles-access-matrix-spec.md) §2.1, §3, §4, §8, §11 · [ADR-0004](ADR-0004-role-model-thirteen.md) · [BR-105](../product/brd/06-functional-requirements.md) · [BR-1103](../product/brd/06-functional-requirements.md) · [NFR-05](../product/brd/08-nonfunctional-requirements.md)/[08](../product/brd/08-nonfunctional-requirements.md) · Nazarah regulation Art. 11(5) · CLAUDE.md Binding rule 4
**Extends:** [ADR-0004](ADR-0004-role-model-thirteen.md), which removed `APPROVER` outright. This ADR closes the two remaining textual routes to a second approval authority.
**Classification:** Privileged & Confidential — internal

---

## Decision (in one line)

**Approval authority is held by the `nazir` ROLE and by no other role. `leadership` gets no `approve` or `sign` verb on any module, and `authorized_rep`'s exclusion from approval is absolute — there is no co-authorization concept anywhere in the type system.**

> ### CLARIFICATION (2026-07-28) — this is a ROLE-level claim, not a PERSON-level one
>
> Product-owner decision. **Several people may hold the `nazir` role on one endowment**, and that is
> intended: a professional Nazir firm needs cover for leave, illness and succession, and a single named
> approver would mean a distribution cannot be approved while that person is unavailable. The shipped
> fixture deliberately seats two approve-capable holders per endowment (`user-nazir-001` and
> `user-approver-001`, both granted `NAZIR` on `waqf-001`…`waqf-004`), and
> `packages/api/src/middleware/segregation.ts:32` says so in its own comment.
>
> The invariant that carries BR-105's undivided accountability is therefore **maker ≠ approver**, enforced
> at the procedure layer and in Postgres and tested in both — *not* a cardinality limit on approvers.
>
> This clarification exists because the sprint's own summaries repeatedly said "the Nazir is the **sole**
> approver," which reads as a person-level guarantee the code never made and the fixture visibly
> contradicted. The orchestrator wrote that sentence many times before an adversarial pass compared it
> against the seed. **Where a claim is asserted in prose, check it against the fixture as well as the
> code** — the fixture is a third side that must agree.

---

## The context, briefly

[ADR-0004](ADR-0004-role-model-thirteen.md) deleted the `APPROVER` role rather than remapping it, on the
grounds that approval is an *action* the Nazir holds and a standing approver seat would create the second
approval authority BR-105 and BR-1103 forbid. Sprint 2 then had to build the actual permission grid — and
found that §10 still contained **two textual routes to exactly the thing ADR-0004 had just closed.**
Neither was a role; both were prose.

### Route 1 — `leadership`, contradicted by its own grid

§10 §3's grid-rules bullet reads:

> `A` (approve) on money/filings is held only by `nazir` *(and, within the leadership authority matrix,
> `leadership` for portfolio-level matters)*.

But the grid **table immediately above it** gives `leadership` no `A` and no `S` cell in **any of twelve
rows** — only `R`, `R portfolio`, `R(agg)`. §2.1 says "approvals only within delegated authority matrix;
no per-endowment operational write by default." §11 records the depth as *commercially unsettled* with
"default = read-only + no per-endowment write." And no "leadership authority matrix" artifact exists
anywhere in the repository.

So one parenthetical asserted an approval power that the table, §2.1 and §11 all denied. It was the
single textual hook in the entire specification for a second approval role.

### Route 2 — `authorized_rep`, and the word "solely"

§2.1 says the authorized representative "may initiate but never **solely** authorize a reserved matter."
"Never solely" invites the reading "may co-authorize." Meanwhile §3's grid gives `authorized_rep` no `A`
or `S` cell in any row (only `R W(scoped)` / `R i(scoped)`), and §8 excludes final approve and
reserved-matter sign from **every** delegatable scope — and `authorized_rep` *is* the delegation role.

The temptation was compounded by two things that read like approval power but are not:
`AUTHORIZED_REP` sits in `TOTP_REQUIRED_ROLES`, and in `roles.test.ts`'s `MONEY_OR_FILING_ROLES`. Both
are about *posture* (who must hold a second factor), not authority.

## The decision

| Question | Options presented | Decided |
|---|---|---|
| How deep is `leadership`'s approve authority? | (a) §10's stated default: portfolio read only, no approve verb anywhere · (b) approve a named, configurable set of portfolio-level actions · (c) remove leadership approve from the type system entirely | **(a)** |
| Is `authorized_rep`'s exclusion absolute? | (a) absolute, in any combination, on any module — amend §2.1's wording · (b) co-authorization for reserved matters only · (c) absolute in Phase 1, reopen if an engagement requires it | **(a)** |

**§10 §3's leadership parenthetical and §2.1's "never solely" wording are the drifted sides.** The grid
table, §2.1's own default, §8 and §11 win.

## Why

- **BR-105 puts undivided accountability on the Nazir.** An authority that can be shared is not undivided.
  A representative who can co-authorize is closer to a co-trustee than to a delegate.
- **Nazarah Art. 11(5)'s joint-and-several liability is about LIABILITY, not authority.** It makes the
  authorized representative *answerable* for what they do; it does not hand them the Nazir's approval
  power. Conflating the two was the trap in "never solely."
- **It is the narrow direction of error.** Withholding approval authority that turns out to be wanted is
  a preset change plus a test change. Granting approval authority that turns out to be wrong is an
  unauthorized approval on a real endowment, and it is discovered after the money moves.
- **It keeps ADR-0004 coherent.** Deleting `APPROVER` and then admitting `leadership` through a
  parenthetical would have re-created the deleted seat under a different name.

## Consequences

### Implemented

- `ROLE_PRESETS.leadership` and `ROLE_PRESETS.authorized_rep` contain no `:approve` and no `:sign`
  permission string on any module.
- Approval authority is **one exported constant** — a set of roles, expressed as data rather than as
  literals scattered through the presets — and a test asserts that set equals exactly `{ nazir }`. If a
  future change widens it, that test fails first.
- **No "leadership authority matrix" Setting was modelled — not even one defaulting to empty.** An empty
  configurable is a foothold: it makes widening a config edit instead of a decision. If the commercial
  answer ever changes, that is a deliberate code change with an ADR, which is the point.
- **No co-authorization concept exists in the type system.** There is no `approvers: string[]`, no
  `coApprovedByUserId`, and no field whose cardinality on the approval side exceeds one. Single-valued
  approval authority is enforced *by construction*, not by validation.
- The rule is enforced in **three places** — the preset algebra (TypeScript), the procedure ladder
  (runtime), and Postgres (constraint/trigger).

  > ### ⚠ AMENDMENT (2026-07-28) — "three INDEPENDENT layers" was wrong, and the claim is QUALIFIED
  >
  > The three places are **not independent**: all three resolve authority by reading
  > `waqf_access_grant`. S2 adversarial review forged a row directly via `$executeRawUnsafe` on a
  > caller's own scoped Prisma client (extensions do not intercept raw SQL) and **every layer accepted
  > it — by satisfying it, not defeating it**: the preset intersection is a no-op because the forged
  > role genuinely *is* `nazir`, `qmulate_has_active_grant` returns true because the row is
  > well-formed, and the API reads that same row. A `FINANCE` seat approved two SAR 4.5m bank
  > movements this way, one on an endowment it held nothing on.
  >
  > **The claim as written in this ADR was therefore true through the APPLICATION and not true at the
  > DATABASE layer.** See [ADR-0008](ADR-0008-authorization-plane-admission-control.md).
  >
  > ### AMENDMENT 2 (2026-07-29) — privilege separation landed. The claim is **STILL QUALIFIED**, and here is exactly how.
  >
  > ADR-0008's round-6 addendum records what shipped: the runtime database role
  > (`qmulate_app`, `DATABASE_URL`) holds **no `INSERT`/`UPDATE`/`DELETE` on `waqf_access_grant`** and
  > **owns no table**. The forgery above is now refused by the server before any layer is consulted —
  > MEASURED as that role: `42501 permission denied for table waqf_access_grant`, and
  > `42501 must be owner of table` for every `DISABLE TRIGGER` / `DROP TRIGGER` /
  > `ALTER TABLE … DROP CONSTRAINT`. The re-attack, and the mutation that restores each old behaviour,
  > are in `packages/database/test/authorization-plane-privilege.integration.test.ts`.
  >
  > **So the claim may now say: through the application AND against any caller holding only the
  > application database credential.** It may **NOT** be stated unqualified, and ADR-0008 forbids
  > doing so until its round-6 open questions are answered. Three residuals are named there and must
  > accompany any quotation of the headline:
  >
  > 1. whoever holds `ACCESS_MATRIX_DATABASE_URL` can still forge the same chain — pinned as a
  >    **passing** attack, deliberately, in §6c of that test file;
  > 2. code running inside the web process can still call `provisionAccessGrant()`;
  > 3. which credential a deployed service actually holds is a **deployment fact no test can assert**.
  >
  > The hard gate is unchanged: **no real client data may enter any environment**, because the insider
  > with application-database credentials is **in** the threat model and residuals 1–3 are about
  > insiders. `DATA_CLASSIFICATION` stays `fixture-only`.
  >
  > The sentence that used to sit here — that a TypeScript-only proof "would be one
  > `$executeRawUnsafe` away from irrelevant" — was correct, and was then not acted on. A defence
  > that only asks *"does this row say NAZIR?"* is not a defence; at least one layer must validate
  > **how the row got there**.
- The procedure-level test iterates **all thirteen roles read from the registry**, not a hand-written
  list, and additionally pins `leadership` and `authorized_rep` by name — they are the two the spec's
  prose flirted with. An unknown or unmapped role is **denied**, following the fail-safe precedent set by
  `requiresTotpForDbRole`.

### Documentation to reconcile (not done here)

- **§10 §2.1's "never solely" wording should be amended** to match §3 and §8. Left to a docs pass rather
  than folded into a code sprint, so that the amendment is visible as an edit to the specification.
- **§10 §3's leadership parenthetical should be struck**, and §11's open question closed by reference to
  this ADR.

### What this does *not* decide

- Whether `leadership` should ever hold portfolio-level approval **commercially**. That question is real
  and remains open; this ADR records that the answer today is no, and that changing it is a deliberate act.
- The **reserved-matter approval chain** (§10 §4.1) is untouched. A reserved matter may still require
  several parties — principal/`family_board` approval, counsel review, Authority approval or notice — and
  this ADR does not thin that chain. Chain *participation* is not approval *authority*: the chain has
  several participants and exactly one signer, `nazir` (`S*`). Do not let a later reading collapse the two.
