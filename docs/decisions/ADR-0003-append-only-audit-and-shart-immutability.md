# ADR 0003 — Append-Only Audit Spine & Shart al-Waqif Immutability

**Status:** DECIDED (Accepted) — with two named reconciliations owed to the specs (§7)
**Date:** 2026-07-26
**Deciders:** QMULATE (product owner) + engineering
**Scope:** `packages/database` (the `AuditEvent` model, the hand-authored constraints migration, the audit client extension, `withReservedMatter`), `packages/api` (the `ACCESS_DENIED` path), `apps/worker` (the chain-verification job), and every epic that writes a material row.
**Relates to:** [ADR 0002 · Receipt classification](ADR-0002-receipt-income-capital-classification.md) · [§07 Data model §12](../product/prd/07-data-model-spec.md) · [§12 Security, audit & retention](../product/prd/12-security-audit-retention-spec.md) · [§17 E1 exit / G-1 / V-7](../product/prd/17-build-ship-dod.md) · [Build plan S1](../product/prd/BUILD-PLAN.md) · [NFR-04](../product/brd/08-nonfunctional-requirements.md) · [BR-607](../product/brd/06-functional-requirements.md) · CLAUDE.md Binding rule 1
**Classification:** Privileged & Confidential — internal

> Third record filed under `docs/decisions/`. It settles a naming collision across three specs and fixes the exact mechanism behind release gate **G-1** and verification scenario **V-7**, so that neither can be argued about after the fact.

---

## Decision (in one line)

**The audit table is `AuditEvent` / `audit_event`. It is append-only, enforced by a database trigger (the load-bearing control) with an INSERT-only role behind it (defence in depth); it is tamper-*evident* by a SHA-256 hash chain serialized with one advisory lock per transaction. Separately, `Waqf.shartAlWaqif` is write-once, enforced by its own trigger, with a single escape hatch — a transaction-local reserved-matter GUC — that is deliberately inert until E11 builds the approval workflow.**

```
   WRITE PATH                      DATABASE CONTROLS                 EVIDENCE
   ┌───────────────┐   same txn    ┌──────────────────────┐
   │ business row  │──────────────▶│ audit_event  INSERT  │──▶ rowHash = sha256(
   └───────────────┘               │  ✓ trigger: no U/D/T │      canonicalJSON(payload)
   ┌───────────────┐               │  ✓ role: INSERT only │      ‖ prevHash )
   │ waqf.shart…   │──────────────▶│ trigger: reject      │
   └───────────────┘   no GUC set  │  UNLESS reserved-    │──▶ chain verifies end-to-end
                                   │  matter GUC present  │    or names the first break
                                   └──────────────────────┘
```

Immutability stops the edit. The chain proves that nothing slipped past — including at the storage layer or via a restore from a doctored backup.

---

## 1. Context — one table, three names

Three governing documents name the audit table differently, and the build could not proceed without picking one:

| Source | Model | Table | Notable field names |
|---|---|---|---|
| [§07 data model §12](../product/prd/07-data-model-spec.md) | `AuditLog` | `audit_log` | `at`, `actorUserId`, `waqfId`, `hashPrev`, `hashSelf`, `ip`, `requestId` |
| [§12 security spec](../product/prd/12-security-audit-retention-spec.md) | `AuditEvent` | — (model only) | `occurredAt`, `actorId`, **`endowmentId`**, `prevHash`, `rowHash`, `context` |
| [§17](../product/prd/17-build-ship-dod.md), [BUILD-PLAN](../product/prd/BUILD-PLAN.md), CLAUDE.md | — | **`audit_event`** | — |

The collision is not cosmetic. §17's **E1 exit condition**, release gate **G-1**, and verification scenario **V-7** are all written as executable assertions against the literal string `audit_event`; §12's [`endowmentId`](../product/prd/12-security-audit-retention-spec.md) contradicts §07's `waqfId`, which every other model and the scoping force-filter use; and §12's hash payload omits four fields that materially identify an event.

Underneath the naming, the requirement is settled and uncontested: **[NFR-04](../product/brd/08-nonfunctional-requirements.md) / [BR-607](../product/brd/06-functional-requirements.md)** — an immutable, tamper-evident record of every material action, approval, and sensitive access, retained ≥10 years ⚠ *(unverified — confirm vs primary law)*. Separately, **CLAUDE.md Binding rule 1** requires the *Shart al-Waqif* to be write-once, amendable only through an authority-gated reserved-matter workflow with a full audit trail — "never by a direct edit, migration, backfill, or 'correction'." Neither §07 nor §12 nor the glossary states that immutability anywhere, and no mechanism existed for it.

## 2. Decision — the table is `AuditEvent` / `audit_event`

**Chosen:** model `AuditEvent`, table `@@map("audit_event")`, field set = §12's (the richer one) merged with §07's, with `waqfId` (not `endowmentId`) and §07's `ip`/`requestId` folded into `context`.

Reasons, in order of weight:

1. **§17's gate is the acceptance test.** G-1 and V-7 assert `UPDATE`/`DELETE`/`TRUNCATE` failures against `audit_event` by name. A schema that named the table `audit_log` would fail the sprint's own exit condition on a spelling.
2. **§12 owns the mechanism; §07 defers to it.** §07's own note says "the mechanism is in [12]." Where the two disagree on the mechanism's own vocabulary, the mechanism document wins.
3. **`waqfId` over `endowmentId`** for consistency with every other model, the scoping force-filter, and the per-endowment access matrix. §12 is the outlier on this one field.
4. **Three-to-one on the physical name.** §17, BUILD-PLAN and CLAUDE.md all say `audit_event`.

**This obliges a documentation fix, not a code change** — see §7. Until §07 is amended it remains a live inconsistency, and a reader who trusts §07 will look for the wrong table.

### 2.1 Field set as built

`id BigInt` (autoincrement, also the chain ordering key) · `occurredAt` + `occurredAtHijri` (dual calendar, [NFR-02](../product/brd/08-nonfunctional-requirements.md)) · `actorId?` · `actorType` (`USER|SYSTEM|SERVICE`) · `onBehalfOfId?` (delegated authorized-representative Nazir, [BR-105](../product/brd/06-functional-requirements.md)) · `action` · `entityType` · `entityId` · `waqfId?` · `before?`/`after?` (**changed keys only**, money as `Decimal(18,2)` strings, **ciphertext never plaintext**) · `context` (request id, IP, user agent, tRPC procedure, reason, `reservedMatterApprovalId`) · `category` · `classification` (`ROUTINE|SENSITIVE|RESTRICTED`) · `prevHash`/`rowHash` (`Char(64)`).

The table carries **no** `updatedAt` and **no** `deletedAt`: both would be lies on an append-only table.

## 3. Enforcement — two layers, one of which is load-bearing

**3.1 Reject-mutation trigger (the control that actually holds).** A `BEFORE UPDATE OR DELETE OR TRUNCATE` **statement-level** trigger on `audit_event` raises unconditionally with `SQLSTATE 42501` and a message containing *"append-only"*. Statement-level is required for `TRUNCATE`, is correct for all three, and fires even on a zero-row `UPDATE`.

**3.2 Least-privilege runtime role (defence in depth).** `qmulate_app_runtime` (`NOLOGIN`) holds `SELECT, INSERT` on `audit_event` and `USAGE, SELECT` on its sequence; `UPDATE, DELETE, TRUNCATE` are revoked, and `ALL` is revoked from `PUBLIC`.

**3.3 Why the order matters — an honest limitation.** On Railway the application normally connects as the **database owner**, and an owner **bypasses GRANTs — but not triggers.** The trigger is therefore the load-bearing control and G-1/V-7 must be provable on its strength alone; the role is preparation for a future dedicated non-owner login (`APP_DATABASE_URL`), which is **recommended before staging carries anything beyond fixtures**. Both legs are tested; only the trigger leg is asserted unconditionally.

**3.4 A second limitation, stated rather than papered over.** A trigger cannot record a rejected attempt **into the very table it is protecting**. For a raw-SQL attempt, the evidence is the Postgres error log. The API-layer path emits an `ACCESS_DENIED` audit event instead. V-7 must claim exactly this and not that "the raw attempt self-audits."

**3.5 Soft-delete only.** Business rows are never hard-deleted during the retention window; a "delete" is `deletedAt` plus an audit event with `action = DELETE_SOFT` ([§12](../product/prd/12-security-audit-retention-spec.md)). True erasure exists only through the controlled-deletion workflow (a later epic).

**3.6 One sanctioned write path.** `withAudit(ctx, fn)` opens the interactive transaction, buffers events, and flushes before commit. Business write and audit row commit or roll back **together**. `createMany`/`updateMany`/`deleteMany`/`delete` are banned at runtime on audited models (no reliable per-row before/after), as are raw `$executeRaw` mutations outside `packages/database`.

## 4. The hash chain

```
rowHash = sha256_hex( utf8(canonicalJSON(payload)) ‖ utf8(prevHash) )      genesis prevHash = "0" × 64
```

**4.1 Payload — 14 fields, a deliberate deviation from §12.** §12 lists ten and omits `waqfId`, `actorType`, `onBehalfOfId`, and `category`. Omitting `waqfId` would let a tamperer **re-scope an event to a different endowment undetected** — the hash would still verify. All four are immutable and material, so all four are bound in: `id`, `occurredAt`, `actorId`, `actorType`, `onBehalfOfId`, `action`, `entityType`, `entityId`, `waqfId`, `before`, `after`, `context`, `category`, `classification`. This deviation needs a one-line amendment to §12 (§7).

**4.2 Canonicalization** (`canonicalJSON`, frozen-vector tested so the algorithm can never drift silently): object keys sorted by UTF-16 code unit; no whitespace; UTF-8 out; arrays keep order; `undefined` keys omitted; `null` preserved. **JS `number` is forbidden in the payload and throws** — this is where the money rule is enforced mechanically rather than by review. `Decimal` → fixed-scale string; `BigInt` → decimal string; `Date` → ISO-8601 UTC with exactly three millisecond digits and a `Z`.

**4.3 `id` is inside the payload**, so it must be known *before* the insert: the id is allocated with `nextval` on the table's sequence inside the same transaction and supplied explicitly.

**4.4 Concurrency — one advisory lock per transaction.** `pg_advisory_xact_lock` (key `7233057419042001`) is taken **lazily, on the first audited write**; `prevHash` is then read from the singleton `audit_chain_head` row (O(1)), events are appended, and the head's `lastId`/`lastRowHash` are updated in the same transaction. The lock serializes writers, so no two rows can share a `prevHash` and the chain cannot fork. Read-only transactions never take it.

> **Deviation from §12, recorded:** §12 specifies `SELECT … FOR UPDATE` on the chain-head row. The advisory lock gives the **same** serialization guarantee, is taken lazily rather than on every transaction, and avoids holding a row lock across the business work. Same invariant, cheaper contention. Also worth §12 amending.

**4.5 What the chain buys.** Because each hash binds the previous, altering, removing, or reordering any historical row breaks every hash after it, and a verifier recomputes the chain and names the **first** break. This is what makes tampering detectable even below the application — a doctored backup restore included. A `apps/worker` job re-verifies periodically.

**4.6 Determinism as a test instrument.** Because the fixture seed is byte-deterministic (fixed ids, a fixed `SEED_EPOCH`, no `Date.now()` / `Math.random()` / `cuid()`), the chain's final `rowHash` after a fresh migrate + seed is a **pinned constant**. One assertion then proves canonicalization stability *and* seed determinism at once.

## 5. Shart al-Waqif immutability

**5.1 Representation.** `Waqf.shartAlWaqif Json` + `shartAlWaqifVersion Int` + `shartAlWaqifSetAt`/`…Hijri`. §07 specifies the `Json` field ("structured, not prose") and the schema contract wins over the vault's `waqifConditionSummary` prose field; the deed's narrative survives inside the JSON as an explicitly **non-authoritative** `narrativeAr`/`narrativeEn`. The zod contract (`shartAlWaqifSchema`, in `@qmulate/domain`) keeps `{kind:"unspecified"}` strictly distinct from `{kind:"none"}` — "the deed says no reserve" and "we do not know" must never collapse into the same value — and separates **halting** gaps (`missing` → the engine raises `SHART_INCOMPLETE`) from **advisory** ones (proceed with a flag).

**5.2 The guard.** A `BEFORE UPDATE` **row-level** trigger on `waqf` raises `SQLSTATE 42501` with *"shart_al_waqif is immutable"* whenever `shartAlWaqif` or `shartAlWaqifVersion` changes, unless a transaction-local GUC is set:

```
current_setting('qmulate.reserved_matter_approval_id', true)   -- must be non-empty
```

**Write-once, precisely:** `INSERT` is unguarded, `UPDATE` is guarded. **A migration or a backfill hits the same trigger — that is the point**, and it is exactly what Binding rule 1 asks for.

**5.3 The escape hatch, and why it is currently inert.** `withReservedMatter(db, ctx, approvalRequestId, waqfId, fn)` opens a transaction, loads the `ApprovalRequest`, and asserts **all** of: `type = RESERVED_MATTER`, `status = APPROVED`, the `waqfId` matches, `checkerId` is set, and `checkerId ≠ makerId` (segregation of duties). Only then does it `set_config('qmulate.reserved_matter_approval_id', …, true)` — transaction-local, so it cannot leak to another statement or session — run the callback, stamp `context.reservedMatterApprovalId` into the audit event, and bump `shartAlWaqifVersion`.

In Sprint 1 **no workflow can produce an `APPROVED` reserved-matter approval.** The approval workflow is E11/S12. The only Sprint-1 path to an amendment is a hand-inserted approval row in a test. The hatch therefore ships closed: the mechanism is in place and tested, and there is no product path through it.

**5.4 Residual risk.** Anyone who can execute `set_config` on that GUC inside a transaction can amend a Shart. Mitigations: `set_config` for this key appears **only** in `packages/database/src/reserved-matter.ts`; the helper's maker≠checker assertion runs first; the amendment is audited with the approval id bound into the hash. Hardening beyond that — Postgres row-level security as a second layer — is recommended but **not** shipped in Sprint 1 (§8).

## 6. Consequences

**Gains:**
- G-1 and V-7 become mechanically provable, and provable by the trigger alone — the leg that survives an owner connection.
- Tamper *evidence* is independent of tamper *resistance*: even a successful out-of-band edit is detectable, and the chain names where.
- Binding rule 1's Shart immutability gets its first actual enforcement, at the layer a migration cannot route around.
- Money is kept out of the hash as a float **by construction** — `canonicalJSON` throws on `number`.

**Costs and dependencies:**
- **A narrow, deliberate contention point.** Every audited write transaction serializes on one advisory lock. Acceptable for a trustee's back-office write volume; it would need revisiting under high-throughput writes.
- **Hand-authored SQL in the migration chain.** The triggers, role, CHECKs and partial indexes are not Prisma-generated and must not be clobbered by `prisma migrate dev` — see [`packages/database/README.md`](../../packages/database/README.md). Every statement is idempotent, and there is a `SELECT qmulate_apply_guards();` re-entry point after any schema change that recreates a guarded table.
- **A pinned frozen `rowHash`** means a deliberate change to the seed or to canonicalization requires re-pinning the constant. That friction is the feature.
- **The runtime is not yet actually constrained by the GRANTs** on Railway (§3.3). A dedicated non-owner login role is owed before staging holds anything beyond fixtures.
- **The `ACCESS_DENIED` API path is the only self-auditing denial route.** Raw-SQL denials leave evidence only in the Postgres log, which must therefore be retained and monitored — an operational dependency, not a code one.

## 7. Supersedes / updates — the reconciliations this ADR owes

1. **[§07 data model §12](../product/prd/07-data-model-spec.md) must be amended:** `model AuditLog` → `AuditEvent`, `audit_log` → `audit_event`, and the field names `at`/`actorUserId`/`hashPrev`/`hashSelf` → `occurredAt`/`actorId`/`prevHash`/`rowHash`, with `ip`/`requestId` folded into `context`. Until then §07 points readers at a table that does not exist.
2. **[§12](../product/prd/12-security-audit-retention-spec.md) needs two one-line amendments:** the hash payload is **14** fields, not 10 (§4.1, with the security reason); and chain-head serialization is a **transaction advisory lock**, not `SELECT … FOR UPDATE` (§4.4). §12's `endowmentId` should read `waqfId`.
3. **CLAUDE.md known-inconsistency #2 is partially closed.** The field name and representation are decided (`shartAlWaqif Json`) and immutability is now encoded. The **glossary and the Obsidian vault still say `waqifConditionSummary`** (`docs/domain/glossary.md`, `Glossary/Shart al-Waqif.md`, `Domain Model/Waqf (data model).md`), and [§06](../product/prd/06-functional-requirements.md) still describes discrete structured fields. Those three must be reconciled to §07's shape; that entry stays **open** until they are.
4. **Reaffirms, does not change,** CLAUDE.md Binding rule 1 and [NFR-04](../product/brd/08-nonfunctional-requirements.md) / [BR-607](../product/brd/06-functional-requirements.md).

## 8. Deliberately not done in Sprint 1

Named so that absence is a recorded decision rather than an oversight:

- **External anchoring** of the latest `rowHash` to an independent WORM store — §12 marks it P1. Without it, a full-table rewrite *plus* a chain recomputation is theoretically undetectable.
- **Postgres row-level security.** §12 names RLS as defence in depth alongside the Prisma force-filter. The extension ships in S1; RLS is separate hardening and should be **scheduled (S12/E12), not dropped silently**.
- **A dedicated non-owner runtime login** and a separate `APP_DATABASE_URL` (§3.3).
- **The reserved-matter approval workflow** itself (E11/S12) — only the helper and its preconditions ship now.
- **Retention enforcement beyond the schema.** `retentionUntil`, `legalHold` and the ≥10-year floor ⚠ *(unverified — confirm vs primary law)* exist as columns and a `Setting`; object-lock storage retention is E9, and controlled deletion is later still.

---

### Note on remaining trackers

This ADR settles the audit table's identity, its two enforcement layers, its hash-chain algorithm and concurrency guarantee, and the Shart-al-Waqif guard. It does **not** (a) amend §07 or §12 — those edits are owed and listed in §7; (b) build the reserved-matter approval workflow that would make the escape hatch usable; (c) provision the non-owner database role that would make the GRANT leg meaningful in production; (d) ship RLS or external anchoring; or (e) verify the ≥10-year retention figure against primary Saudi law. Those remain tracked work.
