# 12 · Security, Audit, Retention & Data-Protection Spec

How QMULATE builds the immutable audit trail, access control, encryption, retention, and KSA/PDPL data-protection posture — the technical realization of [NFR-03](../brd/08-nonfunctional-requirements.md)–[NFR-07](../brd/08-nonfunctional-requirements.md).

Status: Draft v0.1 · Privileged & Confidential

---

## Purpose

This section specifies the **security spine** every other module hangs off. Where the BRD states the platform must be secure, auditable, confidential, retained, and KSA-resident ([NFR-03](../brd/08-nonfunctional-requirements.md)–[NFR-07](../brd/08-nonfunctional-requirements.md); [BR-607](../brd/06-functional-requirements.md), [BR-702](../brd/06-functional-requirements.md)), this document states **exactly how**: the audit-log schema and its tamper-evident hash chain, the database-enforced append-only guarantee, authentication with TOTP step-up, field-level encryption of UBO identifiers, retention with legal hold and object-lock, and the hard guardrail that keeps real client data off non-KSA infrastructure until a KSA-resident production environment exists.

These controls are **P0 go-live blockers** ([NFR-03](../brd/08-nonfunctional-requirements.md)–[NFR-07](../brd/08-nonfunctional-requirements.md) all sit in the Phase-1 P0 cut). They protect three of the five [zero-tolerance KPIs](../../company/operating-model.md) directly — no commingling (evidenced only if money movements are auditable), current beneficiary KYC (access + audit on sensitive reads), and no missed AML reports with **no tipping-off** (restricted visibility, no subject notification, [BR-604](../brd/06-functional-requirements.md)).

The controls implement, in law, Nazarah Regulation Art. 20 (record-keeping/audit), Art. 22 (confidentiality), the Beneficial-Ownership Standards Art. 5(4) and Art. 7(3) (BO record integrity + ≥10-year retention), and the Personal Data Protection Law (PDPL). See [`../../domain/regulations/`](../../domain/regulations/) for the source instruments; this spec never restates them.

---

## Security principles (the non-negotiables)

1. **Every material action is provable after the fact.** If it moved money, changed a filing, touched a deed/Shart, or read UBO data, there is an immutable record of who/what/when/before/after ([NFR-04](../brd/08-nonfunctional-requirements.md), [BR-607](../brd/06-functional-requirements.md)).
2. **The audit trail cannot be edited or deleted — not even by a DBA, not even by the app.** Immutability is enforced at the **database** layer, not just in application code. Application-layer discipline is defence-in-depth on top, never the primary control.
3. **Least privilege by default; access is granted, never assumed.** Per-endowment access matrix ([NFR-05](../brd/08-nonfunctional-requirements.md)); beneficiaries see only their own line; AML subjects are never told they are subjects.
4. **Segregation of duties on anything that moves money or files with a regulator** — maker ≠ checker, enforced in workflow and re-checked at commit ([NFR-08](../brd/08-nonfunctional-requirements.md)).
5. **Sensitive data is encrypted in transit, at rest, and — for the most sensitive identifiers — at the field level** ([NFR-06](../brd/08-nonfunctional-requirements.md)).
6. **Real client data never touches non-KSA infrastructure.** Until a KSA-resident production environment exists, only the anonymized fixture may exist in any deployed environment ([NFR-03](../brd/08-nonfunctional-requirements.md)) — enforced by a boot assertion, seed refusal, import hard-fail, and CI check.

Ownership of these packages: `packages/database` (audit extension, triggers, encryption transformers), `packages/auth` (better-auth + TOTP + access matrix), `packages/storage` (object-lock retention), `apps/worker` (chain-verification + retention jobs). `packages/domain` stays pure and imports none of them.

---

## Audit trail — data model

One append-only table, `AuditEvent`, records every material action, approval, and sensitive access. It is written **inside the same database transaction** as the change it describes, so an event and its subject commit or roll back together — there is no window in which a change exists without its audit record.

| Field | Type | Notes |
|---|---|---|
| `id` | `BigInt` autoincrement (PK) | Monotonic sequence; also the chain ordering key. |
| `occurredAt` | `DateTime` (UTC) | Server clock; rendered dual Hijri/Gregorian in UI ([NFR-02](../brd/08-nonfunctional-requirements.md)). |
| `actorId` | `String?` | better-auth user id; `null` only for system/job actors, then `actorType='system'`. |
| `actorType` | enum | `user` · `system` · `service`. |
| `onBehalfOfId` | `String?` | Set when an authorized-representative Nazir acts under delegation ([BR-105](../brd/06-functional-requirements.md)). |
| `action` | enum | `create` · `update` · `delete_soft` · `approve` · `reject` · `read_sensitive` · `export` · `login` · `login_failed` · `access_denied` · `filing_status_change` · `distribution_post` · `aml_report`. |
| `entityType` | `String` | e.g. `Waqf`, `Distribution`, `Beneficiary`, `GovernmentFilingStatus`, `Document`. |
| `entityId` | `String` | Target row id. |
| `endowmentId` | `String?` | Denormalized for the per-endowment access matrix and evidence-pack scoping. |
| `before` | `Jsonb?` | Prior field values (changed keys only); `null` on create. **UBO/IBAN values stored here are the encrypted ciphertext, never plaintext.** |
| `after` | `Jsonb?` | New field values (changed keys only); `null` on hard-delete records. |
| `context` | `Jsonb` | Request id, IP, user-agent, tRPC procedure, reason/justification string where the action requires one. |
| `classification` | enum | `routine` · `sensitive` · `restricted` — `restricted` covers AML SAR events (no-tipping-off visibility). |
| `prevHash` | `Char(64)` | SHA-256 of the previous event's `rowHash` — the chain link. |
| `rowHash` | `Char(64)` | SHA-256 over the canonical serialization of this row + `prevHash` (see below). |

**Diff discipline.** `before`/`after` carry only the keys that changed, so the log stays legible and small. Money fields are serialized as their `Decimal(18,2)` string form, never floats ([NFR-08](../brd/08-nonfunctional-requirements.md) money rule), so a hash is stable and a reviewer sees exact amounts.

**Retention linkage.** `AuditEvent` is itself subject to the ≥10-year retention rule ([NFR-07](../brd/08-nonfunctional-requirements.md)) and is never purged while any endowment it references is live or under legal hold.

---

## Audit trail — the hash chain (tamper evidence)

Immutability (below) stops edits. The **hash chain** proves it — it makes any undetected tampering, including out-of-band tampering at the storage layer or a restore from a doctored backup, mathematically detectable.

Each row's `rowHash` is computed at insert time over a **canonical, key-sorted JSON serialization** of the immutable fields (`id`, `occurredAt`, `actorId`, `action`, `entityType`, `entityId`, `before`, `after`, `context`, `classification`) concatenated with the immediately preceding row's `rowHash` (`prevHash`):

```
rowHash = SHA256( canonicalJSON(fields) || prevHash )
```

- The first row (genesis) uses a fixed, documented `prevHash` of 64 zeroes.
- Canonicalization is deterministic: sorted keys, no insignificant whitespace, UTF-8, `Decimal` as string. The exact serializer lives in `packages/database` and is unit-tested against frozen vectors so the algorithm can never drift silently.
- Hashing is centralized in the audit extension; callers cannot supply their own `rowHash`/`prevHash`.

Because each hash binds the previous one, changing any historical row (or removing/reordering rows) breaks every hash after it. A verifier recomputes the chain and finds the first break.

> [!note] Hash chain vs. external anchoring
> A per-row hash chain is the P0 mechanism. Periodically **anchoring** the latest `rowHash` to an independent store (e.g. a WORM object with object-lock, or a notarization service) so even a full-table rewrite is detectable is a **P1 hardening** — see [Open questions](#open-questions). No blockchain; a signed daily checkpoint is sufficient.

---

## Audit trail — immutability enforced at the database

Application code writing carefully is not a guarantee. The database itself forbids mutation of `AuditEvent`:

1. **Dedicated INSERT-only role.** The application connects as a role granted `INSERT` (and `SELECT`) on `AuditEvent` and **explicitly not** `UPDATE` or `DELETE`. Migrations run as a separate privileged role that the application runtime never uses. `REVOKE UPDATE, DELETE, TRUNCATE ON "AuditEvent" FROM app_runtime;`
2. **Reject-mutation trigger.** A `BEFORE UPDATE OR DELETE OR TRUNCATE` trigger on `AuditEvent` raises an exception unconditionally — a hard backstop against any path (a superuser session, a future migration, a mis-granted role) that slips past role grants:

   ```sql
   CREATE FUNCTION audit_reject_mutation() RETURNS trigger AS $$
   BEGIN
     RAISE EXCEPTION 'AuditEvent is append-only; % rejected', TG_OP;
   END; $$ LANGUAGE plpgsql;

   CREATE TRIGGER audit_no_update BEFORE UPDATE OR DELETE OR TRUNCATE
     ON "AuditEvent" FOR EACH STATEMENT EXECUTE FUNCTION audit_reject_mutation();
   ```
3. **Prisma client extension writes in-transaction.** A `packages/database` client extension intercepts every write to an audited model. Within the **same** interactive transaction as the business write, it: reads the previous `rowHash` (`SELECT ... ORDER BY id DESC LIMIT 1 FOR UPDATE` on a lightweight chain-head row to serialize concurrent writers), computes `before`/`after` diffs, computes `rowHash`, and inserts the `AuditEvent`. If the business write rolls back, so does its audit row; if the audit insert fails, the business write rolls back. The extension is the **only** sanctioned write path for audited models — a lint/CI rule forbids raw `prisma.$executeRaw` mutations on audited tables outside `packages/database`.
4. **Serialization of the chain head.** Concurrent transactions cannot both read the same `prevHash`; the `FOR UPDATE` lock on the chain-head row forces them to serialize, guaranteeing a single unbroken chain under load. This is a deliberate, narrow contention point on audit writes only.

**Soft-delete only for business data.** Business entities are never hard-deleted during the retention window; a "delete" is a soft-delete (`deletedAt`) recorded as an `AuditEvent` with `action='delete_soft'`. True erasure happens only through the [controlled-deletion](#retention-legal-hold--controlled-deletion) path.

---

## Sensitive-read logging

Reads are normally not logged — but reads of **sensitive and restricted** data are ([NFR-04](../brd/08-nonfunctional-requirements.md) "…and access"; [NFR-05](../brd/08-nonfunctional-requirements.md); Art. 22 confidentiality). The tRPC/`packages/api` layer tags procedures that return sensitive payloads; the audit extension emits a `read_sensitive` event (with `classification` propagated) whenever such a payload is served. Logged reads include:

- UBO minimum dataset and banking references for proceeds ([BR-202](../brd/06-functional-requirements.md)).
- Beneficiary KYC files and identity documents ([BR-205](../brd/06-functional-requirements.md)).
- AML SAR content and FIU correspondence — logged as `restricted`, visible only to the AML role ([BR-604](../brd/06-functional-requirements.md)).
- Deed/Shart al-Waqif documents and the document vault ([BR-701](../brd/06-functional-requirements.md), [BR-702](../brd/06-functional-requirements.md)).
- Any **export** or evidence-pack generation ([NFR-12](../brd/08-nonfunctional-requirements.md)) — `action='export'`, capturing scope and recipient.

Every **denied** access is also logged (`action='access_denied'`) — the authorization decision, the subject, and the requester — so an attempt to reach data outside one's matrix scope is itself evidence.

---

## Access control & authentication

**Authentication — self-hosted better-auth** (`packages/auth`). Email + password with a strong password policy; sessions are short-lived with rotating refresh. No third-party IdP dependency (KSA-residency and control reasons).

**TOTP step-up for privileged roles.** Any actor in a **money-movement** role (posting/approving distributions, recording transactions, Nazir-fee actions) or a **filing** role (changing a `GovernmentFilingStatus`, recording an Authority registration/update, filing an AML SAR) must have TOTP enrolled and must satisfy a **fresh** TOTP challenge to perform those actions ([NFR-06](../brd/08-nonfunctional-requirements.md); guards the on-time-filing and no-commingling KPIs). TOTP enrolment state and last-challenge time are themselves audited.

**Authorization — per-endowment access matrix** ([NFR-05](../brd/08-nonfunctional-requirements.md)). Authorization is `(subject, role, endowmentId) → permitted actions`. Enforced in `packages/api` on every procedure and mirrored as Postgres row-level security (RLS) on endowment-scoped tables as defence-in-depth, so a query that escapes the API layer still cannot cross endowment boundaries.

- **Beneficiary self-isolation.** A beneficiary (portal, Phase 2 — scaffolded now) is scoped to their own beneficiary/line records only; they can never enumerate co-beneficiaries or other endowments.
- **AML no-tipping-off.** `restricted` AML records are visible only to the AML role; the subject beneficiary sees no flag, no task, no notification, nothing in their portal ([BR-604](../brd/06-functional-requirements.md)).
- **Segregation of duties.** Maker ≠ checker on money movements and filings ([NFR-08](../brd/08-nonfunctional-requirements.md)): the approver identity is re-checked at commit against the maker identity and the check is recorded in the `approve` event. The same person cannot both post and approve a distribution or a filing.

**Delegation.** Authorized-representative Nazirs act under recorded delegated scope; their actions carry `onBehalfOfId` so joint-and-several accountability ([BR-105](../brd/06-functional-requirements.md)) is visible in the trail.

---

## Encryption & secrets

**In transit.** TLS everywhere — client↔web, web↔API, API↔Postgres, API↔object storage, worker↔queue. No plaintext transport on any hop.

**At rest.** Managed PostgreSQL with provider-managed volume encryption; S3-compatible object storage with server-side encryption ([NFR-06](../brd/08-nonfunctional-requirements.md)).

**Application-level field encryption** for the most sensitive identifiers, so they are ciphertext even to a database operator with `SELECT`:

- **UBO national-ID / passport numbers** (`Beneficiary.ubo.idNumber`).
- **Beneficiary banking references / IBANs for proceeds** (`ubo.bankingRefForProceeds`, distribution payout references).

Encryption is a Prisma field transformer in `packages/database`: **AES-256-GCM**, per-field random IV, authenticated. A short **searchable-hash** (HMAC with a separate key) is stored alongside where equality lookup is needed (e.g. dedupe an IBAN) so the app never has to decrypt-to-search. Ciphertext — not plaintext — is what flows into `AuditEvent.before/after`, so the audit trail never becomes a plaintext PII sink. Keys are versioned to allow rotation and re-encryption without downtime.

**Secrets management.** No secret in source or in an image layer. Runtime secrets (DB URL, encryption keys, TOTP pepper, storage credentials, `better-auth` secret) are injected as environment variables from the platform secret store; local dev uses an untracked `.env` and the fixture-only classification. Key material for field encryption is distinct from transport/at-rest keys and is the highest-sensitivity secret in the system.

---

## Retention, legal hold & controlled deletion

**≥10-year retention** ([NFR-07](../brd/08-nonfunctional-requirements.md), [BR-702](../brd/06-functional-requirements.md); Art. 20, BO Standards Art. 7(3)) with **rapid retrieval** — records stay online and queryable, not cold-archived, for the full window.

- **Object-lock + lifecycle on documents.** Vault documents ([BR-701](../brd/06-functional-requirements.md)) are written to object storage under **object-lock (WORM) in compliance mode** with a retention-until date ≥ 10 years from the record's controlling date. A lifecycle policy transitions older objects to cheaper storage tiers but **never** deletes within the window. Versioning is on ([BR-703](../brd/06-functional-requirements.md)); superseding a document creates a new version and retains the prior.
- **Retention clock.** The clock for a document/record starts at the later of its own date and the **end of the engagement / trusteeship** it belongs to, so nothing ages out while the endowment is still under QMULATE's Nazarah.
- **Official financial records in Arabic** ([NFR-01](../brd/08-nonfunctional-requirements.md); Art. 15(2)) are retained in Arabic; the retention path is language-agnostic but the stored record satisfies the Arabic requirement.

**Legal hold.** A hold flag on an endowment (or a specific matter under [BR-612](../brd/06-functional-requirements.md) legal case management) **suspends all deletion** — controlled deletion refuses to run, and object-lock retention-until dates are extended, until the hold is released by an authorized role. Placing/releasing a hold is an audited, TOTP-gated action.

**Controlled deletion (the only true-erasure path).** After the retention window closes **and** no legal hold is active **and** the endowment is not live, an authorized role may run controlled deletion. It is a maker/checker, TOTP-gated, fully-audited workflow that: verifies window elapsed + no hold, records an `AuditEvent` (retained beyond the deleted data — the record of erasure survives), then releases object-lock and deletes. PDPL data-subject erasure requests are handled through **this** path — reconciled against the statutory retention duty, which overrides an erasure request for records law requires QMULATE to keep. Ad-hoc deletion outside this workflow is impossible: business data is soft-delete-only and `AuditEvent` is append-only.

---

## Data residency, PDPL & the fixture-only guardrail

**Target posture.** Production data resides **in KSA**, handled per **PDPL** ([NFR-03](../brd/08-nonfunctional-requirements.md)) — data residency + a PDPL compliance pass (lawful basis, data-subject rights via controlled deletion, breach process, processing records) is a **hard gate before production**.

**Interim posture (locked).** Hosting is on **Railway now**; KSA residency + full PDPL are **deferred to before production**. This is safe **only** because of a hard guardrail: **until a KSA-resident production environment exists, the only data permitted in any deployed environment is the anonymized fixture** (`data/fixtures/sample-waqf.json`). Real client names, deed/certificate numbers, beneficiary and bank data never touch non-KSA infrastructure — consistent with the [hard constraint](../../../CLAUDE.md) that real intake data is never read into fixtures, tests, docs, or UI.

The guardrail is enforced at four independent layers, keyed off an environment flag `DATA_CLASSIFICATION`:

1. **Boot assertion.** On startup, `apps/*` assert: if `DATA_CLASSIFICATION=fixture-only` (the only permitted value for any non-KSA-resident environment), the app records the classification and refuses to proceed if any residency-sensitive integration is misconfigured. A KSA-resident prod sets `DATA_CLASSIFICATION=production` — a value the deployment pipeline only permits for the KSA target.
2. **Seed refuses non-fixture.** The seed script loads **only** records tagged as fixture data and hard-refuses anything else; it will not seed a `production` classification against a non-KSA target.
3. **Import tooling hard-fails.** The client-onboarding/import tooling ([BR-1106](../brd/06-functional-requirements.md)) **hard-fails, writes nothing, and emits an explicit residency/PDPL message** when handed a record not tagged fixture while `DATA_CLASSIFICATION != production`.
4. **CI check.** A CI job fails the build if a code path could seed/import non-fixture data under `fixture-only`, or if the flag plumbing is removed. The guardrail cannot be quietly deleted.

> [!warning] This guardrail is load-bearing, not decorative
> Removing or weakening any of the four layers is a compliance regression. Real client data on Railway (or any non-KSA host) would breach [NFR-03](../brd/08-nonfunctional-requirements.md) and PDPL. Treat changes here as reserved-matter-level.

---

## Acceptance criteria

### Audit immutability — mutation attempts fail hard

**A material change and its audit record commit atomically**
- **Given** an authenticated maker posts a distribution line item,
- **When** the write commits,
- **Then** exactly one `AuditEvent` with `action='distribution_post'`, correct `before`/`after` (money as `Decimal` strings), and a valid `rowHash` chained to the prior event exists in the **same** transaction — and if the business write rolls back, no `AuditEvent` remains.

**An UPDATE on the audit table is rejected**
- **Given** any connection, including one attempting to "correct" a historical event,
- **When** it issues `UPDATE "AuditEvent" SET ...` or `DELETE FROM "AuditEvent" ...`,
- **Then** the reject-mutation trigger raises an exception, the statement fails, and the runtime role lacks `UPDATE`/`DELETE` privilege besides — the row is unchanged.

**Chain verification detects tampering**
- **Given** the periodic chain-verification job ([`apps/worker`](../brd/09-data-integration-landscape.md)) runs over `AuditEvent`,
- **When** any historical row's content, order, or presence has been altered out-of-band,
- **Then** the recomputed `rowHash` diverges at the first altered row, the job flags the break with the offending `id`, and raises a compliance alert — a clean chain passes silently.

**Concurrent writers keep one unbroken chain**
- **Given** two transactions post audited changes simultaneously,
- **When** both compute `prevHash`,
- **Then** the `FOR UPDATE` chain-head lock serializes them so each links to a distinct predecessor and no two rows share a `prevHash` — verification finds no fork.

### Access-denied logging & confidentiality

**A cross-endowment read is denied and recorded**
- **Given** a user whose access matrix does not include endowment X,
- **When** they request a beneficiary/UBO record under endowment X,
- **Then** the request is refused (API + RLS), no sensitive payload is returned, and an `AuditEvent` with `action='access_denied'` records requester, subject, and endowment.

**A permitted sensitive read is logged**
- **Given** an authorized AML officer opens a SAR record,
- **When** the `restricted` payload is served,
- **Then** a `read_sensitive` (`classification='restricted'`) event is recorded — and the **subject beneficiary receives no notification, flag, or portal indication** (no tipping-off, [BR-604](../brd/06-functional-requirements.md)).

**Step-up enforced on money/filing actions**
- **Given** a money-movement or filing-role user without a fresh TOTP challenge,
- **When** they attempt to approve a distribution or change a `GovernmentFilingStatus`,
- **Then** the action is blocked pending TOTP, and both the challenge and the eventual action are audited; a maker cannot also be the checker ([NFR-08](../brd/08-nonfunctional-requirements.md)).

### Retention & residency (edge / error / empty)

**Legal hold blocks deletion**
- **Given** an endowment under active legal hold past its retention window,
- **When** controlled deletion is attempted,
- **Then** it refuses with an explicit legal-hold message, deletes nothing, and object-lock retention-until is not shortened.

**Fixture-only guardrail refuses real data (error state)**
- **Given** a Railway environment with `DATA_CLASSIFICATION=fixture-only`,
- **When** import tooling ([BR-1106](../brd/06-functional-requirements.md)) receives a record not tagged fixture,
- **Then** it **hard-fails, writes nothing**, emits a residency/PDPL message, and CI fails if such a path is reachable.

**Empty state — fresh install has a genesis chain**
- **Given** a newly provisioned environment seeded only with the fixture,
- **When** the audit view is first opened,
- **Then** the chain begins at the documented genesis `prevHash`, seed-generated events verify cleanly, and no plaintext UBO id/IBAN appears anywhere in `AuditEvent`.

**Field encryption round-trips without leaking**
- **Given** a beneficiary UBO record with an ID number and IBAN,
- **When** it is written then read back by an authorized user,
- **Then** plaintext is returned to the app, the stored column is AES-256-GCM ciphertext, equality lookup works via the searchable HMAC, and a DB operator with `SELECT` sees only ciphertext.

---

## Open questions

Routed to [16 · Open questions](./16-open-questions.md):

- **External anchoring of the audit chain** (P1): signed daily checkpoint to WORM object storage vs. a notarization service — decide before scaling past the first client.
- **KSA-resident hosting target**: which provider/region satisfies residency + rapid retrieval, and the migration/cutover plan off Railway before production ([NFR-03](../brd/08-nonfunctional-requirements.md)).
- **PDPL specifics**: appointment of a data-protection officer, cross-border transfer stance for a cross-border beneficiary path, and breach-notification timelines — confirm with Saudi counsel.
- **Key custody**: managed KMS vs. self-custodied field-encryption keys, and rotation cadence.

---

## Requirements covered

- **Non-functional:** [NFR-03](../brd/08-nonfunctional-requirements.md) *(residency/PDPL + fixture-only guardrail)*, [NFR-04](../brd/08-nonfunctional-requirements.md) *(immutable audit trail incl. access)*, [NFR-05](../brd/08-nonfunctional-requirements.md) *(access matrix, self-isolation, no-tipping-off)*, [NFR-06](../brd/08-nonfunctional-requirements.md) *(authn/authz, encryption in transit & at rest, secrets)*, [NFR-07](../brd/08-nonfunctional-requirements.md) *(≥10-year retention, controlled deletion)* · supporting: [NFR-01](../brd/08-nonfunctional-requirements.md) *(Arabic official records retained)*, [NFR-08](../brd/08-nonfunctional-requirements.md) *(maker/checker on money & filings)*, [NFR-12](../brd/08-nonfunctional-requirements.md) *(audited exports/evidence packs)*.
- **Functional:** [BR-607](../brd/06-functional-requirements.md) *(immutable audit trail of every material action, approval, access)*, [BR-702](../brd/06-functional-requirements.md) *(document retention ≥10y, access matrix, audit trail)* · touched: [BR-604](../brd/06-functional-requirements.md) *(AML no-tipping-off visibility)*, [BR-701](../brd/06-functional-requirements.md) *(vault sensitive-read logging)*, [BR-703](../brd/06-functional-requirements.md) *(versioning under object-lock)*, [BR-1106](../brd/06-functional-requirements.md) *(import hard-fail under fixture-only)*.
