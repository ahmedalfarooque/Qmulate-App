# ADR 0006 — The Shart al-Waqif Escape Hatch Stays Shut

**Status:** DECIDED (Accepted) — **reconciliation CLOSED 2026-07-29.** The product owner restated the position unconditionally: *"the shart cant be changed."* CLAUDE.md **Binding rule 1 has been amended to match** (it previously said "amendable only via an explicit authority-gated reserved-matter workflow"), so the rule and the code now agree and there is no open tension. The *legal ground* still awaits Saudi counsel — see *What is settled and what is not*.
**Date:** 2026-07-27
**Deciders:** QMULATE (product owner) — engineering presented four options with tradeoffs and a recommendation; the pick was the product owner's, and was **stricter** than the recommendation
**Scope:** `packages/database` — `withReservedMatter()`, the `qmulate_shart_guard()` trigger, the `waqf` table's write-once columns. Forward-looking scope: **E11/S12**, which builds the reserved-matter workflow.
**Relates to:** CLAUDE.md **Binding rule 1** (Shart immutability) · [ADR-0003](ADR-0003-append-only-audit-and-shart-immutability.md) · [§07 Data model](../product/prd/07-data-model-spec.md) · [BR-1102](../product/brd/06-functional-requirements.md) · [Build plan — carried into S2](../product/prd/BUILD-PLAN.md) · CLAUDE.md known inconsistency #2
**Classification:** Privileged & Confidential — internal

---

## Decision (in one line)

**No approval opens the Shart al-Waqif. `withReservedMatter()` ships, but for the waqf Shart columns it throws unconditionally — there is no code path and no SQL path by which `shartAlWaqif` changes after first write.**

The product owner's words: *"shart al-waqif cannot be changed, regardless of approvals."*

---

## The context, briefly

Sprint 1 handed exactly one item forward, and this was it. The immutability trigger was shipped and
proven — but its **escape hatch was inert and wide open at the same time**:

- `qmulate_shart_guard()` tests only `IF approval IS NULL OR btrim(approval) = ''`. **Any non-empty string**
  in the `qmulate.reserved_matter_approval_id` session GUC opens it. There is no check that the approval
  exists, that its status is `APPROVED`, that its type is `RESERVED_MATTER`, or that it belongs to that waqf.
- The application-side verifier did not exist at all: no `packages/database/src/reserved-matter.ts`, no
  `./reserved-matter` entry in the package exports map, and a stale comment in `client.ts` referring to
  both as though they were already there.
- The S1 `it.todo` left behind specified only an **internal** check: `type === RESERVED_MATTER &&
  status === APPROVED && waqfId matches && checkerId != null && checkerId !== makerId`.

That last point is the crux. **An internally approved maker-checker row is not an authority approval.**
Two QMULATE staff satisfying an internal workflow is not the same thing as the competent authority
consenting to alter a founder's conditions — and Binding rule 1 uses the words "authority-gated."

`ApprovalRequest` already carries `counselReviewRequired`, `authorityNoticeRequired` and
`authorityReference`. All three were unchecked by anything.

## The options presented

| | Option | Assessment given |
|---|---|---|
| (a) | Implement the S1 todo exactly: internal maker-checker only | Fastest, matches the pinned test text — but leaves Binding rule 1's word "authority-gated" unenforced in code. **This was the default an implementer would build if nobody decided**, because it is the literal instruction left in the test file. |
| (b) | The todo **plus** fail-closed authority legs: require `authorityReference` when `authorityNoticeRequired`, and a recorded counsel review when `counselReviewRequired` | *Engineering's recommendation.* Buildable on fields that already exist, costs almost nothing, fails closed, independent of E11. |
| (c) | Require the full BR-1102 chain before the GUC opens | Safest; helper ships in E2 but is only satisfiable once E11 records those steps. |
| (d) | Keep the hatch shut in E2 entirely | Safest of all; fine only if no live Shart amendment is expected in Phase 1 — a fact only QMULATE knows. |

**Decided: stricter than (d).** Not "shut until E11 builds the workflow," but *shut because no approval is
the right key for this lock.*

## Why the strict reading is defensible

The classical position is that the founder's stipulation carries the weight of a legislative text —
*شرط الواقف كنص الشارع*, the waqif's condition is like the text of the lawgiver. On that reading, an
amendment mechanism is not a feature that is missing; it is a category error. A system whose *default*
posture is "the Shart is amendable given enough signatures" invites the amendment. A system that refuses
outright forces any genuine case out of the software and into the forum where it belongs — the competent
authority, on the record, with counsel.

The narrow direction of error also matters here more than anywhere else in the product. A refused
legitimate amendment is an inconvenience resolved by a court or the Authority. A permitted illegitimate
one silently rewrites what a dead founder instructed, in a table whose whole purpose is to be the record
of that instruction.

## Consequences

### Implemented in E2

- **`withReservedMatter()` exists** — the stale `client.ts` comment and the missing `./reserved-matter`
  exports entry are fixed, so callers have one obvious door — **but for the waqf Shart columns it always
  throws.** No approval id, however well-formed, opens it.
- **The trigger's validation checks were still added**, as defence in depth for the *other* columns the
  trigger guards. Rationale: the previous behaviour opened for any non-empty GUC string, and narrowing
  that is strictly safer regardless of how the Shart question is answered. The hatch is now both narrower
  *and*, for the Shart, closed.
- Proven from a **raw connection** as well as through Prisma — a TypeScript-only proof of an immutability
  claim is one `$executeRawUnsafe` from meaningless.
- The Shart trigger deliberately stays **wider than the specification**: `certificateNumber` and
  `deedNumber` remain reserved-matter-only, as Sprint 1 shipped them. Wider is safer; narrowing a live,
  green guard is the risky direction. Recorded as an orchestrator default the product owner may narrow.

### ⚠ AMENDMENT (2026-07-28) — the "no SQL path" claim above was FALSE as shipped, and is now true

The two sentences this ADR rests on — *"there is no code path and **no SQL path** by which `shartAlWaqif`
changes after first write"* (Decision, above) and *"Proven from a **raw connection**"* (bullet above) —
were **not true of the code that shipped**, and the proof that they were had already been reported once.
S2 adversarial review (finding **C-03**, CONFIRMED) substituted a seeded founder's Shart end to end:

```
BLOCKED  UPDATE "waqf" SET "shartAlWaqif" = …        42501, as advertised
ALLOWED  DELETE FROM "waqf" WHERE "id" = 'waqf-004'
ALLOWED  re-INSERT the same id with {"substituted":"ADVERSARY WROTE THIS"} and version 99
         audit_event 131 -> 131 (delta 0); the whole G-1 chain still verified clean
```

**The cause was one word: `waqf_shart_immutable` is registered `BEFORE UPDATE`, and nothing else.** A
`pg_trigger` census showed `waqf` was the ONLY guarded table with no DELETE coverage, while its siblings
covered exactly the verbs it missed (`document_retention_guard` DELETE, `document_no_truncate` TRUNCATE,
`audit_event_no_mutate` UPDATE OR DELETE). `TRUNCATE "waqf" CASCADE` was refused only because it cascaded
into `document` — an accident of the foreign-key graph, not a control. Section 2 of migration 1 does not
help either: its `REVOKE` hardening only ever touched `audit_event` and `audit_chain_head`, and on Railway
the runtime connects as the database OWNER, which bypasses GRANTs.

**Closed in `00000000000004_e2_guard_gaps`:** hard `DELETE` on `waqf` is refused outright (`waqf_no_delete`,
42501) — the row carries a ≥ 10-year retention obligation (NFR-07 / BR-702), so `deletedAt` is its only
legal retirement — and `TRUNCATE` is refused on the waqf's own account (`waqf_no_truncate`). Both are
`ENABLE ALWAYS`, so one `SET session_replication_role = 'replica'` cannot skip them. The claim is now
carried by tests rather than by prose: `packages/database/test/shart-immutability.integration.test.ts`
drives UPDATE, DELETE, TRUNCATE and the full DELETE-then-re-INSERT sequence from a raw connection and
asserts the seeded Shart is byte-identical afterwards, and
`packages/database/test/guard-verb-coverage.integration.test.ts` turns the `pg_trigger` census itself into
an assertion, so the next guard added to a table cannot ship UPDATE-only unnoticed.

**The generalisable lesson, recorded because it is worth more than the fix:** a `BEFORE UPDATE` trigger is
a proof about ONE VERB. Any immutability claim has to be stated over the whole verb set — UPDATE, DELETE,
TRUNCATE, and DELETE-then-re-INSERT as a sequence — or it is a claim about the statement the author
happened to imagine.

**Still open, and deliberately not closed here:** raw `DELETE FROM "approval_request"` and
`DELETE FROM "waqf_access_grant"` remain permitted and defeat their own write-once rules by the same
delete-and-re-insert route. The triggers are trivial; landing them requires the scaffolding cleanup in five
test files (three of them owned by other workstreams, including `packages/api/test/setup.ts`) to move to an
explicit trigger-disabling transaction first. It must land as one coordinated change.

### ✅ RESOLVED (2026-07-29) — the tension below is closed; resolution 1 was taken

The product owner restated the decision without hedging: **"the shart cant be changed."** So of the two
coherent resolutions listed below, **resolution 1 was chosen**: CLAUDE.md **Binding rule 1 is amended** to
say the Shart is immutable *full stop*, and authority-gated reserved-matter approval governs the **other**
reserved matters — istibdal and asset disposal, deed/certificate identity, access-matrix changes on a live
endowment — but is **not a key to the founder's conditions, because there is no such key.**

**What this means for E11/S12,** which builds the reserved-matter workflow and would otherwise have been
built against a rule its foundation contradicted:

- The reserved-matter workflow must **not** offer a Shart-amendment path. Not a disabled one, not a
  configurable one, not one gated behind more approvals. An empty configurable is a foothold — the same
  reasoning that kept a "leadership authority matrix" out of [ADR-0005](ADR-0005-nazir-sole-approval-authority.md).
- **The forward path for a genuine case is a superseding instrument recorded as a NEW record**, never an
  edit to the original. If a competent authority or a court directs a change, the record of what the
  founder instructed must survive intact alongside the record of what was later directed — the table's
  purpose is to be the former. Modelling that instrument is E11's problem to design and is **not** a
  loosening of this rule.
- The database says the same thing and said it first: the trigger refuses every change to the Shart
  columns unconditionally, `withReservedMatter()` throws for them, and after S2's adversarial review
  `waqf` has DELETE and TRUNCATE coverage too — so `DELETE` + re-`INSERT` cannot substitute a founder's
  conditions either. Code, rule and ADR now agree, which is the first time in this sprint that all three
  sides of a claim have.

### What is settled and what is not

**Settled:** the product rule. **Not settled:** whether Saudi law and the Awqaf regulation permit *any*
modification of a founder's conditions in narrow circumstances (impossibility, exhaustion of a
beneficiary line, a court order). That is a question for Saudi counsel under Binding rule 4, and the
answer cannot loosen this rule without a new product decision — but if counsel says such a case must be
representable, the superseding-instrument route above is where it goes, not an edit path.

### The tension this resolution closed — kept for the record

**CLAUDE.md Binding rule 1 says the Shart is "amendable only via an explicit authority-gated
reserved-matter workflow (competent-authority approval recorded, full audit trail)."** That wording
contemplates amendment. This decision says no amendment is possible. **Both cannot be literally true.**

CLAUDE.md was deliberately *not* edited — a binding rule is not something a build sprint rewrites to match
its own code. The reconciliation is a decision for the product owner, and it must be made **before E11/S12
builds the reserved-matter workflow**, because that epic will otherwise be built against a rule its own
foundation contradicts. The two coherent resolutions:

1. **Amend Binding rule 1** to say the Shart is *immutable, full stop*, and that reserved-matter
   authority-gating governs the *other* reserved matters (istibdal, asset disposal, access-matrix changes
   on a live endowment) but not the founder's conditions.
2. **Keep Binding rule 1 as written** and treat this ADR as a Phase-1 posture only — the hatch stays shut
   because the workflow does not exist yet, and E11 opens it under the full BR-1102 chain (option (c)).

These differ in what E11 builds, which is why it cannot be deferred indefinitely. It blocks nothing in S2.

### Also corrected

CLAUDE.md's inconsistency list marks **#2 as RESOLVED**. The first half is — the field is
`shartAlWaqif Json`, write-once, trigger-enforced. **The second half was not:** the trigger's escape hatch
accepted any non-empty GUC value and the application-side verifier did not exist. ADR-0003 itself says the
item "stays open until they are reconciled," which contradicted the closed marker. E2 closes it; the
marker was accurate about the field and premature about the hatch.
