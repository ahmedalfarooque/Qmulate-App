// QMULATE — append-only audit emission (NFR-04 / gate G-1).
//
// POSITION IN THE CHAIN: INNERMOST.
//
//     base.$extends(audit).$extends(scoping).$extends(encryption)
//                  ^^^^^ applied first = runs last on the way in, first on the way out
//
// By the time a write reaches this extension, encryption has already replaced every plaintext
// with ciphertext and scoping has already narrowed the filter. So the trail records ciphertext
// and the scoped shape of the operation — not by remembering to, but by construction (§12).
//
// ── THE ATOMICITY PROBLEM AND HOW IT IS SOLVED ────────────────────────────────────────────────
// An audit row that can commit without its subject (or the other way round) is worthless. Both
// must be in ONE transaction. A Prisma query extension cannot redirect the `query()` it is handed
// onto a transaction client, and an interactive transaction client cannot be `$extends`-ed — so
// the usual approaches all break one half of the requirement.
//
// The way through: this extension never calls `query()` for a model operation. It opens (or
// joins) a transaction on the BASE client and RE-EXECUTES the operation against that raw
// transaction client itself. Arguments arriving here have already been transformed by the outer
// extensions, and the value returned unwinds back through them, so scoping and encryption behave
// exactly as they would have. Business write and audit row now share one transaction and one
// fate. Assertion A9 (write then throw -> zero rows, zero events) is the test.
//
// A consequence worth stating: READS inside a `withAudit()` block are redirected to the same
// transaction too, so a block sees its own uncommitted writes.
//
// ── WHAT IS REFUSED, AND WHY THAT IS THE POINT ────────────────────────────────────────────────
//   • createMany / updateMany / deleteMany / hard delete     -> UnsupportedBulkOperationError
//   • a RELATION-NESTED write into an audited model          -> UnauditableNestedWriteError
//   • a JS number in a Decimal column                        -> MoneyAsNumberError
// None of these is a style preference. Each one is a case where the trail would silently be
// wrong: no transaction means an unaudited write, a bulk operation has no per-row before-image, a
// nested write mutates a row this extension never sees, and a float in a money column corrupts
// the value being attested to.

import { AsyncLocalStorage } from 'node:async_hooks';

import { Prisma, type PrismaClient } from '../../generated/client/index.js';
// NOTE: a mutation outside `withAudit()` is not refused — the extension opens a transaction
// around it (see `$allOperations` below), so the write and its event still commit together.
// `AuditTransactionRequiredError` therefore stays exported from `../context.js` for callers that
// want to demand an explicit block, but is not thrown here.
import {
  MoneyAsNumberError,
  UnauditableNestedWriteError,
  UnsupportedBulkOperationError,
  resolveOccurredAt,
  type RequestContext,
} from '../context.js';
import { ENCRYPTED_COLUMN_NAMES } from './encryption.js';
import {
  AUDIT_CHAIN_LOCK_KEY,
  GENESIS_HASH,
  buildAuditPayload,
  computeHash,
  recomputeRowHash,
  serializeForAudit,
  type AuditHashRow,
  type JsonSafe,
} from '../hash-chain.js';

/** What `base.$transaction(async (tx) => ...)` hands back: a client with no nesting verbs. */
export type RawTransactionClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Which models are audited
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Models that do NOT emit audit events. Every exclusion carries its justification, because
 * "which writes are invisible" is exactly the question an auditor asks first.
 */
export const UNAUDITED_MODELS: Record<string, string> = {
  AuditEvent:
    'The trail itself. Auditing it would recurse without bound, and it is append-only by database trigger, ' +
    'so a mutation is impossible rather than merely unrecorded.',
  AuditChainHead:
    'Bookkeeping for the hash chain, written by this extension inside the same transaction as the events it ' +
    'summarizes. Its integrity is implied by the chain it points at.',
  Session:
    'better-auth session churn — created and destroyed on every login and refresh. The legally interesting ' +
    'events are LOGIN / LOGIN_FAILED, recorded at the API layer with their own AuditAction values.',
  Account:
    'better-auth credential and provider records. Hashed passwords and OAuth tokens must never enter the trail.',
  Verification:
    'Short-lived one-time tokens. Recording them would put live credentials in a 10-year retention table.',
  TwoFactor: 'TOTP secrets and backup codes. Same reason as Account, more so.',
  Notification:
    'A derived UI artefact with no legal significance; the underlying event is already audited.',
};

/** Fields whose change is noise, so they are stripped from the diff (the hash covers the rest). */
export const AUDIT_DIFF_IGNORE: readonly string[] = ['updatedAt'];

/** What a `...Enc` value is replaced with in the trail. See `redactEncrypted`. */
export const REDACTED_ENCRYPTED_PLACEHOLDER = '[encrypted]';

/** Models whose rows are PII by nature, so their events are classified SENSITIVE at minimum. */
const SENSITIVE_MODELS = new Set([
  'Beneficiary',
  'Document',
  'BankAccount',
  'DistributionLineItem',
  'User',
  'TrusteeshipDeed',
]);

const READ_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

const BANNED_OPERATIONS: Record<string, string> = {
  createMany:
    'no per-row result is returned, so the created ids cannot be recorded. Loop over create().',
  createManyAndReturn: 'not supported by the audit spine in S1. Loop over create().',
  updateMany: 'no per-row before-image is available. Loop over update().',
  updateManyAndReturn: 'no per-row before-image is available. Loop over update().',
  deleteMany:
    'no per-row before-image is available, and hard deletion is not permitted during retention.',
  delete: 'hard deletion is not permitted during the retention window (§12). Use softDelete().',
};

// ═══════════════════════════════════════════════════════════════════════════════════════════
// G-1 — A RELATION-NESTED WRITE INTO AN AUDITED MODEL IS REFUSED
//
// ── WHAT WAS BROKEN, MEASURED ─────────────────────────────────────────────────────────────────
// `query.$allModels.$allOperations` is invoked ONCE, with the TOP-LEVEL model and operation.
// Prisma does not invoke it again for a relation-nested write, so `auditedMutation` read the
// PARENT's before-image, re-executed the whole payload, and appended ONE event describing the
// PARENT. Reproduced against a migrated + seeded fixture database from an ordinary FINANCE seat:
//
//   waqf.update({ where: { id: 'waqf-001' },
//                 data: { assets: { update: { where: { id: 'asset-001' },
//                                             data: { titleDeedNumber: 'FORGED-D1' } } } } })
//     -> COMMITTED. asset-001.titleDeedNumber: 'FAKE-100' -> 'FORGED-D1'.
//        audit_event gained 1 row, entityType 'Waqf'.
//        events naming Asset:asset-001 -> 0.   The title-deed number changed with NO trail.
//
// The same shape one hop deeper (waqf -> assets.update -> maintenanceTickets.create) behaved
// identically: the child row was written and no event named it.
//
// G-1 is "every material write emits exactly one audit_event". The title-deed number of a corpus
// asset is a material write. So this was a Sprint-1 gate, previously proven, regressed by round 1's
// C-01 fix — which taught the FORCE FILTER to walk nested payloads and left the audit spine behind.
//
// ── THE CHOICE: REFUSE, RATHER THAN AUDIT THE CHILDREN. HERE IS THE ARGUMENT ──────────────────
// The alternative was to audit every nested child with the same before/after fidelity as a
// top-level write. That is not achievable with the information available at this layer, and a
// half-achieved version would be WORSE than a refusal because it would look complete:
//
//  1. NO BEFORE-IMAGE. A nested `update`'s `where` is relative to the parent relation, so
//     resolving the target rows means re-issuing a read per relation per nesting level — and for
//     the `updateMany` / `deleteMany` nested verbs there is no per-row before-image at all. That
//     is the identical reason `BANNED_OPERATIONS` already refuses them at TOP level. A relation is
//     not a way around a refusal.
//  2. NO AFTER-IMAGE, AND FOR `create` NO IDENTITY. A nested write returns only the parent row.
//     Ids default to `cuid()` inside the query engine, so after a nested `create` this extension
//     cannot even name the row that was created, let alone diff it. Measured above: the child row
//     existed and nothing in `audit_event` referenced its id.
//  3. THE REFUSAL COSTS NO CAPABILITY. Every nested write has an exact, fully audited top-level
//     equivalent, and `withAudit()` already makes the two commit together in one transaction. The
//     cost is ceremony — two statements instead of one — and that ceremony is the documented write
//     path. `packages/database/src/seed.ts` and every `packages/api` router already write flat.
//  4. IT IS INDEPENDENT OF THE SCOPING WALKER. `assertNestedWritesAuthorized` in
//     `extensions/scoping.ts` answers "may this actor write that row"; this walk answers "can the
//     trail record it", which is a different question with a different answer set — a PERMITTED
//     write is still unauditable. Keeping the two walks separate is the S1/S2 lesson: one clever
//     layer is one layer. It also matters mechanically: the scoping walk short-circuits on
//     `isBypassed(ctx)`, so for the seed, jobs and data migrations THIS is the only walk that runs.
//
// NO CONTEXT IS EXEMPT — not `bypass: 'system-job'`, not `bypass: 'migration'`. A job or a data
// migration writing an invisible child row is exactly as invisible to an auditor as a request
// doing it, and `bypass` is a row-VISIBILITY waiver, never an auditability waiver.
//
// ── WHAT IS STILL PERMITTED, AND WHY THAT IS SOUND ────────────────────────────────────────────
//  • a `connect` / `disconnect` whose FOREIGN KEY LIVES ON THE ROW BEING WRITTEN HERE — the
//    ubiquitous `waqf: { connect: { id } }`. That is decided from the DMMF (`relationFromFields`),
//    not from `isList`: a one-to-one back-relation is also not a list, yet its `connect` rewrites
//    the TARGET row's key. Only a local key is permitted, because a local key lands in this row's
//    own before/after image and is therefore recorded.
//  • any nested verb whose target model is in `UNAUDITED_MODELS` — by definition no event was
//    owed. The walk still RECURSES through it, because e.g. `Notification -> user -> grants`
//    reaches `WaqfAccessGrant`, which is audited.
//
// ── THE RESIDUAL, STATED PLAINLY ──────────────────────────────────────────────────────────────
// This is a Prisma-client control and it does NOT survive `$executeRawUnsafe`. MEASURED from a
// SCOPED client on a migrated + seeded fixture database, against an audited model and an ordinary
// column that no reserved-matter trigger gates:
//
//   db.$executeRawUnsafe(`UPDATE "asset" SET "valuationSar" = 777777.77 WHERE "id" = 'asset-001'`)
//     -> PERMITTED. valuationSar: 18000000.00 -> 777777.77   (a corpus asset revalued by SAR 17.2m)
//        audit_event total: 132 -> 132.                        NO EVENT AT ALL.
//
// So G-1 holds for every write that goes THROUGH THIS EXTENSION, and for nothing else. Two
// database-side controls now narrow the same surface — migration 4 makes `asset.titleDeedNumber`
// reserved-matter-only, and migration 5 refuses an unaudited raw write to `waqf_access_grant` — but
// neither is a general audit guarantee: they cover named columns and one table, and the statement
// above walks past both. Closing this needs per-table audit triggers, or a runtime role without
// write on the audited tables.
//
// ⚠ ADR-0008 ROUND 6 DELIVERED THE PRIVILEGE SPLIT, AND IT DID **NOT** CLOSE THIS. Read the two
// apart: the runtime role now owns nothing and holds no INSERT/UPDATE/DELETE on `waqf_access_grant`
// or `membership`, which closes the AUTHORIZATION-PLANE route and the DDL route (MEASURED in
// `test/authorization-plane-privilege.integration.test.ts`). But the runtime still holds
// `SELECT, INSERT, UPDATE` on every ORDINARY table — it must, or the application cannot write — so
// the statement measured above (`UPDATE "asset" SET "valuationSar" = …` with `audit_event` unmoved)
// is STILL PERMITTED. What would close it is a per-table audit trigger, not a GRANT.
//
// So the HARD GATE stands: no real client data before this is closed, and no document may cite the
// round-6 privilege split as having closed unaudited raw writes. See `SCOPING_KNOWN_GAPS` item (1).
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Nested verbs that CREATE or MUTATE rows in the TARGET table. */
const NESTED_MUTATING_VERBS: ReadonlyMap<string, string> = new Map([
  ['create', 'create'],
  ['createMany', 'bulk-create'],
  ['connectOrCreate', 'create'],
  ['update', 'update'],
  ['updateMany', 'bulk-update'],
  ['upsert', 'create or update'],
  ['delete', 'hard-delete'],
  ['deleteMany', 'bulk-delete'],
]);

/** Nested verbs that move a foreign key rather than writing a row's other columns. */
const NESTED_RELINK_VERBS = new Set(['connect', 'disconnect', 'set']);

interface RelationShape {
  readonly target: string;
  /**
   * True when the foreign key implementing this relation lives on the model that DECLARES the
   * field, so relinking it writes only the row being written here.
   */
  readonly foreignKeyIsLocal: boolean;
}

/**
 * `model -> relation field -> shape`, derived from `Prisma.dmmf` at import time.
 *
 * Read from the datamodel rather than hand-listed on purpose: a hand-written relation list is
 * correct on the day it is written and wrong the first time somebody adds a back-relation — which
 * is precisely how `Waqf.accessGrants` and `User.grants` became unguarded doors in Sprint 1.
 *
 * Built EAGERLY and without a `try`. `modelMeta()` below degrades to a no-op when the DMMF is
 * unavailable, which is acceptable for a convenience (`createdBy` stamping); it is not acceptable
 * for an integrity guard, because "no relations found" and "no relation map" would then be the
 * same answer and the guard would fail OPEN. `extensions/scoping.ts` builds its own map the same
 * way, so a runtime without a DMMF already fails at import rather than silently unguarded.
 */
const RELATION_FIELDS: ReadonlyMap<string, ReadonlyMap<string, RelationShape>> = (() => {
  const models = new Map<string, ReadonlyMap<string, RelationShape>>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const relations = new Map<string, RelationShape>();
    for (const field of model.fields) {
      if (field.kind !== 'object') continue;
      relations.set(field.name, {
        target: field.type,
        foreignKeyIsLocal: (field.relationFromFields?.length ?? 0) > 0,
      });
    }
    models.set(model.name, relations);
  }
  return models;
})();

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function payloadRows(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : [value]).filter(isPlainObject);
}

/**
 * The write payload(s) carried by a nested verb's argument.
 *
 * `create` carries it directly; `update` may be `{ where, data }` (to-many) or the data itself
 * (to-one); `upsert` carries `create` and `update`; `createMany` carries `{ data: [...] }`. Only
 * reached for UNAUDITED targets — an audited target has already been refused — so the cost of
 * being generous here is a redundant walk, never a missed one.
 */
function nestedWritePayloads(target: string, value: unknown): unknown[] {
  const relations = RELATION_FIELDS.get(target);
  const out: unknown[] = [];
  for (const entry of payloadRows(value)) {
    let unwrapped = false;
    for (const key of ['data', 'create', 'update'] as const) {
      // A target model could legitimately own a scalar column called `data`, so the DMMF decides
      // whether the key is a relation field (walk it as one) or a Prisma wrapper (unwrap it).
      if (key in entry && !(relations?.has(key) ?? false)) {
        out.push(entry[key]);
        unwrapped = true;
      }
    }
    if (!unwrapped) out.push(entry);
  }
  return out;
}

/**
 * Throws unless every row this payload would write, at any depth, is either the top-level row
 * itself or a row in an unaudited model.
 */
export function assertNestedWritesAuditable(model: string, payload: unknown, path: string): void {
  const relations = RELATION_FIELDS.get(model);
  if (relations === undefined) {
    // Fail closed, exactly as the scoping walker does: a model the datamodel does not know is a
    // model whose payload cannot be classified.
    throw new UnauditableNestedWriteError(
      model,
      path,
      'be written under a model that is not in the Prisma datamodel, so the walk cannot classify',
      delegateName(model),
    );
  }
  if (relations.size === 0) return;

  for (const row of payloadRows(payload)) {
    for (const [key, spec] of Object.entries(row)) {
      if (spec === undefined || spec === null) continue;
      const relation = relations.get(key);
      // Not a relation field: a scalar, an enum, or a key Prisma will reject on its own. A scalar
      // write is part of THIS row and is covered by this row's own before/after image.
      if (relation === undefined) continue;
      if (!isPlainObject(spec)) continue; // Prisma rejects any other shape for a relation field

      const targetAudited = !(relation.target in UNAUDITED_MODELS);

      for (const [verb, value] of Object.entries(spec)) {
        if (value === undefined) continue;

        const mutation = NESTED_MUTATING_VERBS.get(verb);
        if (mutation !== undefined) {
          if (targetAudited) {
            throw new UnauditableNestedWriteError(
              relation.target,
              `${path}.${key}`,
              mutation,
              delegateName(relation.target),
            );
          }
          // Unaudited target — no event was owed for it, but its own payload may nest onward into
          // a model that IS audited (`Notification.user.grants` reaches WaqfAccessGrant).
          for (const inner of nestedWritePayloads(relation.target, value)) {
            assertNestedWritesAuditable(relation.target, inner, `${path}.${key}.${verb}`);
          }
          continue;
        }

        if (NESTED_RELINK_VERBS.has(verb)) {
          if (!relation.foreignKeyIsLocal && targetAudited) {
            throw new UnauditableNestedWriteError(
              relation.target,
              `${path}.${key}`,
              `re-parent (\`${verb}\` rewrites the foreign key held by)`,
              delegateName(relation.target),
            );
          }
          continue;
        }

        // An unrecognized nested verb on an audited target is refused rather than passed through:
        // a verb this walker does not know is a verb whose audit consequences it cannot reason
        // about. (Prisma would reject most of them anyway — this is the fail-closed half.)
        if (targetAudited) {
          throw new UnauditableNestedWriteError(
            relation.target,
            `${path}.${key}`,
            `apply the unrecognized nested verb "${verb}" to`,
            delegateName(relation.target),
          );
        }
      }
    }
  }
}

/**
 * Every write-carrying argument of a Prisma operation.
 *
 * `where` is not one — it selects, it does not write. (A nested `update`'s inner `where` is
 * reached through `data`, and `nestedWritePayloads` unwraps it there.)
 */
export function assertOperationNestedWritesAuditable(model: string, args: unknown): void {
  if (!isPlainObject(args)) return;
  for (const name of ['data', 'create', 'update'] as const) {
    const payload = args[name];
    if (payload === undefined || payload === null) continue;
    assertNestedWritesAuditable(model, payload, `${model}.${name}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Hijri stamping
//
// Every audit event carries a FROZEN Umm al-Qura snapshot alongside its UTC timestamp, so a
// future ICU or calendar-library update can never retroactively shift the Hijri date on an event
// that has already been filed.
//
// ⚠ ORCHESTRATOR: `packages/database/src/seed/hijri.ts` (seed agent) implements the identical
// conversion. There must be ONE implementation in the package — collapse them onto a single
// `src/hijri.ts` and have both call sites import it. Two implementations means two frozen strings
// for the same instant. `setHijriFormatter()` below exists so that collapse is a one-line change.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const HIJRI_FORMATTER = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'UTC',
});

function defaultToHijri(date: Date): string {
  const parts = HIJRI_FORMATTER.formatToParts(date);
  let year: string | undefined;
  let month: string | undefined;
  let day: string | undefined;
  for (const part of parts) {
    if (part.type === 'year') year = part.value;
    else if (part.type === 'month') month = part.value;
    else if (part.type === 'day') day = part.value;
  }
  if (!year || !month || !day) {
    throw new Error(
      'Hijri conversion failed: Intl returned no year/month/day. This Node build is probably small-icu; ' +
        'QMULATE requires full ICU (the Node 22 default), or call setHijriFormatter().',
    );
  }
  // Sanity check: a small-icu build silently falls back to the Gregorian calendar, which would
  // put Gregorian years into a column labelled Hijri. Umm al-Qura years are ~1440-1500 today.
  if (year === String(date.getUTCFullYear())) {
    throw new Error(
      'Hijri conversion produced the Gregorian year — the islamic-umalqura calendar is not available in this ' +
        'runtime. Refusing to write a mislabelled date.',
    );
  }
  return `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

let hijriFormatter: (date: Date) => string = defaultToHijri;

/** Swaps the Umm al-Qura implementation (e.g. onto `@umalqura/core`, or a package-wide wrapper). */
export function setHijriFormatter(formatter: (date: Date) => string): void {
  hijriFormatter = formatter;
}

/** `yyyy-MM-dd`, Latin digits, zero-padded, Umm al-Qura, evaluated in UTC. */
export function toHijri(date: Date): string {
  return hijriFormatter(date);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Model metadata (from the generated DMMF)
// ═══════════════════════════════════════════════════════════════════════════════════════════

interface ModelMeta {
  decimalFields: Set<string>;
  hasCreatedBy: boolean;
  hasWaqfId: boolean;
}

let metaCache: Map<string, ModelMeta> | null = null;

function modelMeta(model: string): ModelMeta | null {
  if (metaCache === null) {
    metaCache = new Map();
    try {
      for (const dm of Prisma.dmmf.datamodel.models) {
        const decimalFields = new Set<string>();
        let hasCreatedBy = false;
        let hasWaqfId = false;
        for (const field of dm.fields) {
          if (field.type === 'Decimal') decimalFields.add(field.name);
          if (field.name === 'createdBy') hasCreatedBy = true;
          if (field.name === 'waqfId') hasWaqfId = true;
        }
        metaCache.set(dm.name, { decimalFields, hasCreatedBy, hasWaqfId });
      }
    } catch {
      // DMMF unavailable (an unusual generator setup). The money guard and `createdBy` injection
      // degrade to no-ops; nothing else depends on it.
      metaCache = new Map();
    }
  }
  return metaCache.get(model) ?? null;
}

/**
 * Money is `decimal.js` end to end (§17 cross-cutting DoD). Prisma will happily accept a JS
 * number for a `Decimal` column and convert it — silently importing every floating-point
 * rounding error into the ledger. Refuse at the boundary.
 */
function assertNoNumberMoney(model: string, data: unknown): void {
  const meta = modelMeta(model);
  if (!meta || meta.decimalFields.size === 0) return;
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue;
    for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
      if (!meta.decimalFields.has(key)) continue;
      const inner =
        typeof value === 'object' && value !== null && 'set' in (value as object)
          ? (value as { set: unknown }).set
          : value;
      if (typeof inner === 'number') throw new MoneyAsNumberError(model, key);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Transaction state
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Exported because it appears in the public signatures of `runAuditedTransaction` / `appendAuditEvent`. */
export interface AuditTxState {
  rawTx: RawTransactionClient;
  ctx: RequestContext;
  /**
   * True once `ensureChainHead()` has taken the chain lock and read the head in THIS transaction.
   *
   * It is set at the very START of the transaction, before the caller's callback runs — see
   * `runAuditedTransaction`. It survives as an idempotence flag only: `appendAuditEvent()` still
   * calls `ensureChainHead()` (defence in depth, in case a future entry point forgets to), and a
   * nested `withAudit()` joins this state rather than re-locking.
   */
  lockTaken: boolean;
  prevHash: string;
  lastId: bigint;
  eventCount: number;
}

const txStore = new AsyncLocalStorage<AuditTxState>();

/** The raw transaction client of the enclosing `withAudit()` block, if any. */
export function currentAuditTransaction(): RawTransactionClient | null {
  return txStore.getStore()?.rawTx ?? null;
}

/**
 * Runs `fn` with the enclosing audited transaction DETACHED from the async context, so anything it
 * starts opens its own transaction on its own connection instead of joining — and therefore
 * survives a rollback of the enclosing one.
 *
 * There is exactly one legitimate caller shape: recording the REFUSAL of a write, which by
 * construction is about to roll the enclosing transaction back and take the record with it (see
 * `installScopeDenialAuditing` in `client.ts`). MEASURED, not assumed: a refusal raised inside a
 * `withAudit()` block previously appended its `ACCESS_DENIED` event to that same block and Prisma
 * reported "Transaction already closed: A query cannot be executed on a transaction that was
 * rolled back" — the denial count moved by 0. Do not reach for this to make a business write
 * "escape" a transaction; that is how a partial commit is built.
 *
 * ⚠ THE RETURNED WORK MUST NOT BE AWAITED FROM INSIDE THE ENCLOSING TRANSACTION. That transaction
 * holds `pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_KEY)` for its whole duration (see
 * `runAuditedTransaction`), and a fresh audited transaction takes the same lock as its first
 * statement — so awaiting it inside would self-deadlock until the Prisma transaction timeout.
 * Enqueue it and let the enclosing transaction end first.
 */
export function outsideAuditTransaction<T>(fn: () => T): T {
  return txStore.exit(fn);
}

export interface AuditTransactionOptions {
  /** ms a transaction may run before Postgres aborts it. Seeds are long; requests are not. */
  timeout?: number;
  /** ms to wait for a connection from the pool. */
  maxWait?: number;
  /** Postgres isolation level, passed straight through to Prisma. */
  isolationLevel?: Prisma.TransactionIsolationLevel;
}

const DEFAULT_TX_OPTIONS: Required<Pick<AuditTransactionOptions, 'timeout' | 'maxWait'>> = {
  timeout: 120_000,
  maxWait: 15_000,
};

/**
 * Opens — or JOINS — the audited transaction.
 *
 * Nesting joins the outer transaction and keeps the OUTER actor context, so a helper called from
 * inside a `withAudit()` block cannot quietly re-attribute its writes to a different actor.
 *
 * ── THE CHAIN LOCK IS TAKEN EAGERLY. THAT IS A CORRECTNESS REQUIREMENT, NOT A PREFERENCE ──────
 *
 * Sprint 1 took `pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_KEY)` LAZILY, inside `ensureChainHead()`
 * on the first append — which is immediately AFTER the mutation being recorded. An audited
 * transaction therefore reached the lock request already holding row locks, and two of them could
 * acquire the same two lockables in opposite orders:
 *
 *   T1: writes row A (row lock on A)      ──► asks for the chain lock  ── waits on T2
 *   T2: writes row B (row lock on B) ──► HOLDS the chain lock ──► writes row A ── waits on T1
 *
 * Postgres breaks that cycle by killing one side with SQLSTATE 40P01, and the loser loses its
 * WHOLE transaction: the business row and its audit event together. For `apps/web` and
 * `apps/worker`, which write concurrently, that is a system of record that drops writes under
 * load. CI reproduced it ("waits for ExclusiveLock on advisory lock ... blocked by ... waits for
 * ShareLock on transaction"); `test/audit-lock-ordering.integration.test.ts` pins it.
 *
 * Taking the lock as the FIRST statement of the transaction removes the inversion by construction:
 * every audited transaction acquires the chain lock before it can hold any row lock, so all of
 * them order their acquisitions identically and no cycle exists. Ordering, not retrying — a
 * bounded retry on 40P01 would paper over a real cycle and would still lose the occasional
 * transaction outright once the retries were exhausted.
 *
 * THE COST, STATED HONESTLY: an audited transaction now holds the chain lock for its whole
 * duration instead of from first-append to COMMIT, so audited transactions are fully serialized.
 * That is the right trade here:
 *   • the LEVEL of concurrency is unchanged — this same lock already serialized the write path
 *     from the first append onwards; only the HOLD DURATION grows, by the length of whatever the
 *     callback does before its first write;
 *   • the append is read-tail-then-insert, so serialized appenders are what stops the chain
 *     forking in the first place (A10). Any design that lets two appenders run concurrently has to
 *     re-solve that;
 *   • an audited transaction is a governance write for a trustee — a distribution, a filing, an
 *     approval — measured in dozens per day, not thousands per second. Correct ordering of the
 *     evidence chain is worth more than write throughput we do not need.
 * READS THROUGH A CLIENT ARE UNAFFECTED: `db.x.findMany()` never enters this function (see
 * `$allOperations`), takes no advisory lock, and is never delayed by a writer.
 *
 * ⚠ BUT A READ INSIDE A `withAudit()` BLOCK IS NOT A READ, FOR THIS PURPOSE. The block IS an
 * audited transaction, so it takes the exclusive chain lock at its start WHETHER OR NOT it ever
 * appends an event — a `withAudit()` body that only reads, or whose write is behind a condition
 * that turns out false, still serializes against every other audited transaction in the system for
 * as long as it runs. Measured, not assumed: two concurrent read-only `withAudit()` blocks with a
 * 600 ms body take ~1.2 s, and a read-only block delays an unrelated writer by its full duration.
 * The rule that follows: put reads and external I/O OUTSIDE the block and only the writes inside.
 */
export async function runAuditedTransaction<T>(
  base: PrismaClient,
  ctx: RequestContext,
  fn: (state: AuditTxState) => Promise<T>,
  options: AuditTransactionOptions = {},
): Promise<T> {
  const existing = txStore.getStore();
  if (existing) return fn(existing);

  return base.$transaction(
    async (rawTx: Prisma.TransactionClient) => {
      const state: AuditTxState = {
        rawTx: rawTx as RawTransactionClient,
        ctx,
        lockTaken: false,
        prevHash: GENESIS_HASH,
        lastId: BigInt(0),
        eventCount: 0,
      };
      return txStore.run(state, async () => {
        // FIRST, before the callback can touch a single row. See the lock-order note above.
        await ensureChainHead(state);
        const result = await fn(state);
        await finalizeChain(state); // still inside the transaction — commits with the work
        return result;
      });
    },
    {
      timeout: options.timeout ?? DEFAULT_TX_OPTIONS.timeout,
      maxWait: options.maxWait ?? DEFAULT_TX_OPTIONS.maxWait,
      ...(options.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
    },
  );
}

/**
 * Takes the advisory lock and reads the chain head — once per transaction, at its START.
 *
 * ⚠ CALLED EAGERLY by `runAuditedTransaction()` before the caller's callback runs, so the chain
 * lock is always acquired BEFORE any row lock. Read the lock-order note on that function before
 * moving this call: deferring it to the first append is the 40P01 deadlock this replaced. The
 * `appendAuditEvent()` call site is kept as a belt-and-braces no-op (`lockTaken` short-circuits
 * it) so a future entry point that opens a transaction some other way still cannot append
 * unlocked.
 *
 * The lock serializes appenders for the rest of the transaction, so two concurrent writers can
 * never read the same `prevHash` and fork the chain (assertion A10). It releases automatically on
 * COMMIT or ROLLBACK, so a crashed writer cannot wedge it.
 *
 * Reading the head here is as valid as reading it at the first append: only a holder of this lock
 * ever updates `audit_chain_head` (see `finalizeChain`), and we hold it.
 *
 * The head row is created on demand rather than assumed: a chain that starts working only if the
 * seed ran first is a chain that silently does not start.
 */
async function ensureChainHead(state: AuditTxState): Promise<void> {
  if (state.lockTaken) return;

  // `$executeRawUnsafe`, not `$queryRawUnsafe`: `pg_advisory_xact_lock()` returns `void`, and
  // Prisma cannot deserialize a `void` column ("Failed to deserialize column of type 'void'").
  // We want the lock's side effect, not its result.
  await state.rawTx.$executeRawUnsafe(
    `SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY.toString()})`,
  );
  await state.rawTx.$executeRawUnsafe(
    `INSERT INTO "audit_chain_head" ("id", "lastId", "lastRowHash", "updatedAt")
     VALUES (1, 0, $1, now()) ON CONFLICT ("id") DO NOTHING`,
    GENESIS_HASH,
  );

  const rows = await state.rawTx.$queryRawUnsafe<{ lastId: string; lastRowHash: string }[]>(
    `SELECT "lastId"::text AS "lastId", "lastRowHash" FROM "audit_chain_head" WHERE "id" = 1`,
  );
  const head = rows[0];
  state.prevHash = head?.lastRowHash ?? GENESIS_HASH;
  state.lastId = BigInt(head?.lastId ?? '0');
  state.lockTaken = true;
}

async function finalizeChain(state: AuditTxState): Promise<void> {
  if (state.eventCount === 0) return;
  await state.rawTx.$executeRawUnsafe(
    `UPDATE "audit_chain_head" SET "lastId" = $1::bigint, "lastRowHash" = $2, "updatedAt" = now() WHERE "id" = 1`,
    state.lastId.toString(),
    state.prevHash,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Event construction
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface AuditEventInput {
  action: string;
  entityType: string;
  entityId: string;
  waqfId?: string | null;
  before?: unknown;
  after?: unknown;
  category?: string;
  classification?: string;
  /** Merged into the recorded `context` alongside the request provenance. */
  extraContext?: Record<string, unknown>;
}

/**
 * Replaces every `...Enc` value with a constant placeholder.
 *
 * §12 requires the trail to hold ciphertext rather than plaintext; this goes one step further and
 * holds NEITHER, for two reasons. Ciphertext in an append-only 10-year table is a durable copy
 * that key rotation can never reach — the audit trail would pin the old key alive forever. And a
 * randomized IV makes the ciphertext differ on every write, so an unchanged value would show up
 * as a change in every diff and the chain could never be reproduced byte for byte (assertion A7).
 *
 * Change detection is not lost: the deterministic `...Hmac` sibling columns are ordinary columns
 * and stay in the diff, so a changed national id still shows as a changed digest. The one column
 * with no sibling is `uboIdTypeEnc`, whose changes are therefore invisible in the diff — noted
 * rather than hidden.
 */
function redactEncrypted(value: JsonSafe): JsonSafe {
  if (Array.isArray(value)) return value.map(redactEncrypted);
  if (typeof value !== 'object' || value === null) return value;

  const out: Record<string, JsonSafe> = {};
  for (const [key, item] of Object.entries(value)) {
    out[key] =
      ENCRYPTED_COLUMN_NAMES.has(key) && item !== null
        ? REDACTED_ENCRYPTED_PLACEHOLDER
        : redactEncrypted(item);
  }
  return out;
}

function normalizeRow(row: unknown): Record<string, JsonSafe> | null {
  if (row === null || row === undefined) return null;
  const serialized = serializeForAudit(row);
  if (typeof serialized !== 'object' || serialized === null || Array.isArray(serialized))
    return null;
  return redactEncrypted(serialized) as Record<string, JsonSafe>;
}

/** Changed keys only (§12). A full-row diff on every update would bloat the trail beyond reading. */
function diffChangedKeys(
  before: Record<string, JsonSafe> | null,
  after: Record<string, JsonSafe> | null,
): { before: Record<string, JsonSafe> | null; after: Record<string, JsonSafe> | null } {
  if (!before || !after) return { before, after };

  const beforeOut: Record<string, JsonSafe> = {};
  const afterOut: Record<string, JsonSafe> = {};

  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (AUDIT_DIFF_IGNORE.includes(key)) continue;
    const a = before[key] ?? null;
    const b = after[key] ?? null;
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    beforeOut[key] = a;
    afterOut[key] = b;
  }

  return { before: beforeOut, after: afterOut };
}

function deriveCategory(input: AuditEventInput): string {
  if (input.category) return input.category;
  if (input.action === 'APPROVE' || input.action === 'REJECT') return 'APPROVAL';
  if (input.action === 'LOGIN' || input.action === 'LOGIN_FAILED') return 'AUTH';
  if (
    input.action === 'READ_SENSITIVE' ||
    input.action === 'ACCESS_DENIED' ||
    input.action === 'EXPORT'
  )
    return 'ACCESS';
  return 'MUTATION';
}

function deriveClassification(
  input: AuditEventInput,
  row: Record<string, JsonSafe> | null,
): string {
  if (input.classification) return input.classification;
  const confidentiality = row?.confidentiality;
  if (confidentiality === 'AML_RESTRICTED' || input.action === 'AML_REPORT') return 'RESTRICTED';
  if (confidentiality === 'SENSITIVE_PII' || SENSITIVE_MODELS.has(input.entityType))
    return 'SENSITIVE';
  return 'ROUTINE';
}

function buildContext(
  ctx: RequestContext,
  extra?: Record<string, unknown>,
): Record<string, JsonSafe> {
  const raw: Record<string, unknown> = {
    requestId: ctx.requestId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    procedure: ctx.procedure,
    reason: ctx.reason,
    // Present only when the write went through withReservedMatter() — this is the field that
    // links a Shart al-Waqif amendment to the approval that authorized it.
    reservedMatterApprovalId: ctx.reservedMatterApprovalId ?? undefined,
    bypass: ctx.bypass ?? undefined,
    ...extra,
  };
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return serializeForAudit(out) as Record<string, JsonSafe>;
}

/**
 * Allocates an id, hashes, inserts. Must run inside an audited transaction.
 *
 * The id is allocated with `nextval` BEFORE the insert because `id` is one of the fourteen hashed
 * fields — the row's hash cannot be computed after the database has chosen its key.
 */
export async function appendAuditEvent(
  state: AuditTxState,
  input: AuditEventInput,
): Promise<{ id: bigint; rowHash: string }> {
  await ensureChainHead(state);

  const idRows = await state.rawTx.$queryRawUnsafe<{ id: bigint }[]>(
    `SELECT nextval(pg_get_serial_sequence('public."audit_event"', 'id')) AS id`,
  );
  const rawId = idRows[0]?.id;
  if (rawId === undefined)
    throw new Error('could not allocate an audit_event id (is the audit_event sequence present?)');
  const id = typeof rawId === 'bigint' ? rawId : BigInt(String(rawId));

  const occurredAt = resolveOccurredAt(state.ctx);
  const beforeRow = normalizeRow(input.before);
  const afterRow = normalizeRow(input.after);
  const diffed =
    input.before === undefined || input.before === null
      ? { before: null, after: afterRow }
      : diffChangedKeys(beforeRow, afterRow);

  const payloadRow = {
    id,
    occurredAt,
    actorId: state.ctx.actorId,
    actorType: state.ctx.actorType,
    onBehalfOfId: state.ctx.onBehalfOfId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    waqfId: input.waqfId ?? null,
    before: diffed.before,
    after: diffed.after,
    context: buildContext(state.ctx, input.extraContext),
    category: deriveCategory(input),
    classification: deriveClassification(input, afterRow ?? beforeRow),
  };

  const rowHash = computeHash(buildAuditPayload(payloadRow), state.prevHash);

  /* ─────────────────────────────────────────────────────────────────────────────────────────
   * AL-1 · THE STORED BYTES AND THE HASHED BYTES ARE THE SAME BYTES, IN EVERY RUNTIME REALM
   *
   * This used to read `before: payloadRow.before === null ? Prisma.DbNull : payloadRow.before`.
   * `Prisma.DbNull` is a SENTINEL OBJECT, and the query engine recognizes it BY IDENTITY. Under
   * the Next.js bundler the identity is lost — the `Prisma` namespace the transpiled
   * `@qmulate/database` closes over is not the copy the executing client compares against — and an
   * unrecognized sentinel is written as what it looks like: `{}` (`JSON.stringify(Prisma.DbNull)`
   * is `'{}'`). The hash had already been computed over `null`. The row was therefore born unable
   * to verify against its own content, on the one table whose entire purpose is verifiability, and
   * on the rows that record REFUSED access — the rows an auditor reads after an incident.
   *
   * MEASURED (2026-08-16, this fix's "before"), fresh cluster, migrate + seed + two denials issued
   * over HTTP against `next dev`:
   *     155 rows · 153 recompute from stored content · 2 BROKEN
   *     both broken rows: action=ACCESS_DENIED procedure=endowment.get, stored `{}`/`{}`,
   *     and both reproduce EXACTLY when before/after are replaced by `null`.
   *     The 153 that verify include every seed row — the same writer, in a plain Node realm.
   *
   * WHICH SIDE IS RIGHT: the HASH is. `before: null` on a denial means "there was no before-image",
   * which is true and is NOT the same statement as `{}`, which means "a diff with no changed keys"
   * (a real and common shape — see `diffChangedKeys`). Storing `{}` there would make the trail say
   * something false about the event, so the fix is to write what was hashed, not to hash what was
   * written.
   *
   * HOW: the key is OMITTED when the value is null. An absent key is a JS primitive fact that no
   * bundler, no duplicated runtime copy and no second module instance can reinterpret; Prisma
   * leaves the column out of the INSERT and the column (nullable, no DEFAULT) takes SQL NULL. No
   * sentinel is involved on any path, and `Prisma.DbNull` no longer appears anywhere in this repo.
   * ───────────────────────────────────────────────────────────────────────────────────────── */
  const data: Record<string, unknown> = {
    id: payloadRow.id,
    occurredAt: payloadRow.occurredAt,
    occurredAtHijri: toHijri(payloadRow.occurredAt),
    actorId: payloadRow.actorId,
    actorType: payloadRow.actorType,
    onBehalfOfId: payloadRow.onBehalfOfId,
    action: payloadRow.action,
    entityType: payloadRow.entityType,
    entityId: payloadRow.entityId,
    waqfId: payloadRow.waqfId,
    context: payloadRow.context,
    category: payloadRow.category,
    classification: payloadRow.classification,
    prevHash: state.prevHash,
    rowHash,
  };
  if (payloadRow.before !== null) data.before = payloadRow.before;
  if (payloadRow.after !== null) data.after = payloadRow.after;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stored = (await (state.rawTx as any).auditEvent.create({ data })) as AuditHashRow;

  /* ─────────────────────────────────────────────────────────────────────────────────────────
   * …AND THE ROW PROVES IT BEFORE IT IS ALLOWED TO COMMIT.
   *
   * Omitting the key fixes the ONE mechanism that was measured. This check is what makes the
   * property true rather than argued: `create()` is an `INSERT … RETURNING`, so `stored` is the
   * row as the DATABASE now holds it — not an echo of the input — and recomputing its hash here
   * costs no extra query. The same `recomputeRowHash()` the G-1 verifier uses is called, so a
   * writer can never disagree with a verifier about what was hashed.
   *
   * It THROWS, and throwing rolls the whole audited transaction back — the business write with it.
   * That is the fail-safe direction and it is deliberate: `audit_event` is append-only, so a row
   * that cannot verify is UNREPAIRABLE and breaks every future chain verification on that database
   * for ever, while a refused write leaves a verifiable trail and a loud error. A refusal recorded
   * through `recordEvent()` (which swallows write failures by design) still stands and still
   * increments `scopeDenialAuditStats().failed`, so an incomplete trail is visible, not assumed.
   *
   * This is not a second hash algorithm and not a second canonicaliser — it is the writer checking
   * its own work with the reader's function.
   * ───────────────────────────────────────────────────────────────────────────────────────── */
  const storedHash = recomputeRowHash(stored, state.prevHash);
  if (storedHash !== rowHash) {
    throw new Error(
      `audit_event ${String(id)} (${input.action} ${input.entityType} ${input.entityId}) would ` +
        `have been stored with content its own rowHash does not reproduce: hashed ${rowHash}, ` +
        `stored content hashes to ${storedHash}. The row is REFUSED and the transaction rolled ` +
        `back, because audit_event is append-only and such a row can never be verified or ` +
        `repaired. Compare the stored before/after against the hashed ones — this is how AL-1 ` +
        `(a Prisma.DbNull sentinel serialized as {} under a bundler) reached the table.`,
    );
  }

  state.prevHash = rowHash;
  state.lastId = id;
  state.eventCount += 1;

  return { id, rowHash };
}

/**
 * Records an event that is not a model mutation — `READ_SENSITIVE`, `EXPORT`, `LOGIN`,
 * `LOGIN_FAILED`, `ACCESS_DENIED`. This is the hook the API layer and the scoping denial handler
 * use. Joins the caller's transaction if there is one, otherwise opens its own.
 */
export async function recordAuditEvent(
  base: PrismaClient,
  ctx: RequestContext,
  input: AuditEventInput,
): Promise<{ id: bigint; rowHash: string }> {
  return runAuditedTransaction(base, ctx, (state) => appendAuditEvent(state, input));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Operation handling
// ═══════════════════════════════════════════════════════════════════════════════════════════

function delegateName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/* eslint-disable @typescript-eslint/no-explicit-any --
   Prisma's dynamic delegate lookup and its per-operation argument unions are not expressible
   here: this function is generic over EVERY model and EVERY operation at once. A block-level
   disable (rather than a line-level one) because Prettier reflows these signatures and a
   `-next-line` directive silently detaches from its target. */
function execOnRawTx(
  state: AuditTxState,
  model: string,
  operation: string,
  args: any,
): Promise<unknown> {
  const delegate = (state.rawTx as any)[delegateName(model)];
  if (!delegate || typeof delegate[operation] !== 'function') {
    throw new Error(
      `cannot route ${model}.${operation} into the audited transaction: no such delegate operation`,
    );
  }
  return delegate[operation](args);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function extractId(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) return null;
  const id = (value as { id?: unknown }).id;
  if (typeof id === 'string') return id;
  if (typeof id === 'bigint' || typeof id === 'number') return String(id);
  return null;
}

function extractWaqfId(model: string, ...candidates: unknown[]): string | null {
  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const waqfId = (candidate as { waqfId?: unknown }).waqfId;
    if (typeof waqfId === 'string') return waqfId;
    if (model === 'Waqf') {
      const id = (candidate as { id?: unknown }).id;
      if (typeof id === 'string') return id;
    }
  }
  return null;
}

/** Distinguishes the semantically-different updates that share the `update` operation. */
function deriveAction(
  model: string,
  operation: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string {
  if (operation === 'create' || (operation === 'upsert' && before === null)) return 'CREATE';

  // A soft delete is a deletion, and must be findable as one in the trail.
  if (before && after && before.deletedAt == null && after.deletedAt != null) return 'DELETE_SOFT';

  if (model === 'ApprovalRequest' && after && before && before.status !== after.status) {
    if (after.status === 'APPROVED') return 'APPROVE';
    if (after.status === 'REJECTED') return 'REJECT';
  }
  if (model === 'GovernmentFiling' && after && before && before.status !== after.status)
    return 'FILING_STATUS_CHANGE';
  if (
    model === 'Distribution' &&
    after &&
    before &&
    before.status !== after.status &&
    after.status === 'EXECUTED'
  ) {
    return 'DISTRIBUTION_POST';
  }

  return 'UPDATE';
}

/**
 * Per-request audit extension.
 *
 * @param ctx  the actor whose identity is stamped on every event
 * @param base the UNEXTENDED client, used to open the transaction the mutation is re-executed in
 */
export function createAuditExtension(ctx: RequestContext, base: PrismaClient) {
  return Prisma.defineExtension({
    name: 'qmulate-audit',
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          args: any;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          query: (args: any) => Promise<unknown>;
        }) {
          const state = txStore.getStore();
          const audited = !(model in UNAUDITED_MODELS);

          // ── reads ─────────────────────────────────────────────────────────────────────────
          if (READ_OPERATIONS.has(operation)) {
            // Inside a transaction everything is redirected, so a block sees its own writes.
            return state ? execOnRawTx(state, model, operation, args) : query(args);
          }

          // ── G-1: no write path, nested or not, mutates an audited model unrecorded ────────
          // Runs BEFORE the unaudited-model early return below, and before the bulk-operation,
          // money and `bypass: 'migration'` branches, because an unaudited PARENT can nest into an
          // audited CHILD: refusing only on audited top-level models would leave
          // `notification.create({ data: { user: { update: { grants: { create: … } } } } })` open,
          // and exempting `bypass` would leave the seed and every data migration open. See the
          // block comment on `assertNestedWritesAuditable`.
          assertOperationNestedWritesAuditable(model, args);

          // ── writes to unaudited models ────────────────────────────────────────────────────
          if (!audited) {
            return state ? execOnRawTx(state, model, operation, args) : query(args);
          }

          if (operation in BANNED_OPERATIONS) {
            // `migration` is the one context allowed bulk operations — data migrations and
            // integration-test teardown genuinely need them, and neither is a request path.
            if (ctx.bypass !== 'migration') {
              throw new UnsupportedBulkOperationError(
                model,
                operation,
                BANNED_OPERATIONS[operation] as string,
              );
            }
            return state ? execOnRawTx(state, model, operation, args) : query(args);
          }

          assertNoNumberMoney(model, args?.data ?? args?.create);

          if (!state) {
            // No enclosing withAudit(). Open one and re-run this operation inside it, so the
            // mutation and its event share a transaction. Refusing instead would make every
            // single-statement write ceremonial; auditing without a transaction would make the
            // trail unreliable. This does both correctly.
            if (ctx.bypass === 'migration') {
              // Data migrations opt out of the transaction requirement explicitly.
              return query(args);
            }
            return runAuditedTransaction(base, ctx, (opened) =>
              auditedMutation(opened, model, operation, args),
            );
          }

          return auditedMutation(state, model, operation, args);
        },
      },
    },
  });
}

/* eslint-disable @typescript-eslint/no-explicit-any --
   Generic over every model and operation; see the note on execOnRawTx. Block-level because
   Prettier reflows these signatures and detaches a `-next-line` directive. */
async function auditedMutation(
  state: AuditTxState,
  model: string,
  operation: string,
  args: any,
): Promise<unknown> {
  // Pre-image, read inside the same transaction and through the RAW client, so it is the
  // ciphertext-and-all row as stored. `findFirst` rather than `findUnique`: the scoping extension
  // may have added non-unique predicates to `where`.
  let before: Record<string, unknown> | null = null;
  if (operation !== 'create' && args?.where) {
    const delegate = (state.rawTx as any)[delegateName(model)];
    before = (await delegate.findFirst({ where: args.where })) as Record<string, unknown> | null;
  }

  // `createdBy` is provenance, not payload — stamp it rather than trusting every caller to.
  const meta = modelMeta(model);
  let effectiveArgs = args;
  if (meta?.hasCreatedBy && state.ctx.actorId) {
    if (
      operation === 'create' &&
      args?.data &&
      (args.data as { createdBy?: unknown }).createdBy === undefined
    ) {
      effectiveArgs = { ...args, data: { ...args.data, createdBy: state.ctx.actorId } };
    } else if (
      operation === 'upsert' &&
      args?.create &&
      (args.create as { createdBy?: unknown }).createdBy === undefined
    ) {
      effectiveArgs = { ...args, create: { ...args.create, createdBy: state.ctx.actorId } };
    }
  }

  const result = await execOnRawTx(state, model, operation, effectiveArgs);
  const after = (typeof result === 'object' && result !== null ? result : null) as Record<
    string,
    unknown
  > | null;

  const entityId =
    extractId(after) ??
    extractId(before) ??
    extractId(args?.where) ??
    extractId(args?.data) ??
    'unknown';

  await appendAuditEvent(state, {
    action: deriveAction(model, operation, before, after),
    entityType: model,
    entityId,
    waqfId: extractWaqfId(model, after, before, args?.data, args?.create),
    before: operation === 'create' ? null : before,
    after,
    extraContext: { operation },
  });

  return result;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Soft delete
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * The only sanctioned deletion. Records `DELETE_SOFT` rather than `UPDATE` (see `deriveAction`).
 *
 * Hard deletion is refused for the whole retention window (§12); for `Document` the database
 * enforces it too, via the `document_retention_guard` trigger.
 */
export async function softDelete(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  model: string,
  id: string,
  at: Date = new Date(),
): Promise<unknown> {
  const delegate = db[delegateName(model)];
  if (!delegate?.update) throw new Error(`softDelete: ${model} has no update delegate`);
  return delegate.update({ where: { id }, data: { deletedAt: at } });
}
