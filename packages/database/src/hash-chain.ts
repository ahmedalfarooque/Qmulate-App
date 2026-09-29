// QMULATE — the audit hash chain (NFR-04 / gate G-1).
//
// WHAT THE CHAIN BUYS. The `audit_event` table is append-only by trigger, so an attacker cannot
// edit it through the application or through psql. But a trigger can be dropped by someone with
// enough privilege, and a backup can be doctored offline. The hash chain makes THAT detectable:
// every row binds its own content and its predecessor's hash, so altering, deleting or
// re-ordering any historical row invalidates every hash after it. You cannot ALTER history into a
// consistent chain without re-writing the entire tail — and the final `rowHash` is pinned in CI
// (A7), so re-writing the tail is detectable too.
//
// ⚠ WHAT THE CHAIN DOES **NOT** BUY, AND THE SENTENCE ABOVE USED TO BLUR IT (AV7-AUD-F1).
// It read "you cannot forge a consistent chain without re-writing the entire tail". That is a
// claim about ALTERING history and it is true. It says nothing about APPENDING history, and the
// TIP is where evidence is manufactured. MEASURED on `qmulate_app` — the runtime credential, the
// role a compromised web process holds — before migration 23:
//
//     AV7/CONTROL rows=176 verify={"ok":true,"checked":176}
//     AV7/ATTACK-A forged id=177 actorId=user-nazir-001 rowHash=27491f98… verify={"ok":true,"checked":177}
//
// — a fabricated `APPROVE` naming a real Nazir for an approval that never happened, with the head
// advanced so the next legitimate append continues from it, and `verifyChain()` calls it
// authentic. It is authentic BY THIS FILE'S DEFINITION, which is the point: the hashing algorithm
// is in this repository, so an appender computes correct hashes itself.
//
// Migration 23 (`audit_event_chain_bound`) makes both hash columns SERVER-COMPUTED and refuses a
// mismatch, so an INCOHERENT append is now impossible — no garbage hash, no fork, no de-linked
// row. It does NOT stop a COHERENT lie, and it cannot: any role that may append may append a
// falsehood, and the runtime role must hold INSERT or the trail could not be written at all. The
// residual is measured and green-by-design as ATTACK A′ in
// `test/av7-chain-forge.integration.test.ts`.
//
// So the honest statement of what verification proves is narrower than "the trail is true":
//   • `verifyChain().ok` ⇒ no row was ALTERED, DELETED or RE-ORDERED since it was written.
//   • It does NOT imply that every row DESCRIBES SOMETHING THAT HAPPENED.
// Closing the second one needs (a) that no route reaches raw INSERT — a credential and code-review
// fact, not a hash fact — and (b) an OFF-BOX ANCHOR: periodic notarisation of the chain head
// outside this database, so an appended forgery cannot be hidden by advancing the head. (b) DOES
// NOT EXIST YET; it is owed to E10, and until it does, an append-time forgery is detectable only
// by comparing the trail against the business rows it claims to describe.
//
//   rowHash(n) = sha256_hex( utf8(canonicalJson(payload(n))) || utf8(prevHash(n)) )
//   prevHash(1) = 64 zeroes ("genesis"), prevHash(n) = rowHash(n-1)
//
// WHY CANONICALIZATION IS THE HARD PART. Two byte-different encodings of the same logical row
// hash differently. `{"a":1,"b":2}` and `{"b":2,"a":1}` are the same object to JSON.stringify's
// caller but not to sha256. So the encoding is pinned exactly: sorted keys, no whitespace, one
// spelling per value. Postgres `jsonb` also drops key order and duplicate keys on the way in, so
// a payload that round-trips through the database must be order-insensitive anyway.
//
// WHY THERE ARE NO NUMBERS. `canonicalJson` REFUSES a JS `number`. Floating point is banned for
// money end to end, and `0.1 + 0.2` is the reason. But `Int` columns and JSON columns
// (`Setting.value`, `Waqf.shartAlWaqif`, `Distribution.computationTrace`) legitimately contain
// numbers, so a blanket ban would make the system unbuildable. The resolution is a two-step
// pipeline:
//
//   serializeForAudit()  turns EVERY numeric into a string  (Decimal, BigInt, Int, Float, Date)
//   canonicalJson()      then refuses any number that somehow survived
//
// So the audit payload is uniformly "numerics are strings", the strict guard still catches a
// float that leaked in from a code path nobody reviewed, and — a useful side effect — the
// payload survives a `jsonb` round-trip unchanged, because jsonb normalizes numeric literals
// (1.10 -> 1.1) but never touches strings.

import { createHash } from 'node:crypto';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** `prevHash` of the very first event in an empty chain. */
export const GENESIS_HASH = '0'.repeat(64);

export const HASH_HEX_RE = /^[0-9a-f]{64}$/;

/**
 * Advisory-lock key serializing audit appends.
 *
 * WHY A LOCK. Appending is read-tail-then-insert. Two concurrent transactions that both read the
 * same `prevHash` would produce two rows claiming the same predecessor — a FORKED chain, which
 * verification cannot distinguish from tampering. `pg_advisory_xact_lock` serializes writers for
 * the remainder of their transaction and releases automatically on COMMIT or ROLLBACK, so a
 * crashed writer cannot wedge the chain. Assertion A10 (20 parallel writes, distinct prevHashes,
 * chain still verifies) is the test for this.
 *
 * Taken EAGERLY — as the first statement of every audited transaction, before the caller's
 * callback can take a single row lock. Taking it lazily (on the first append, which is just AFTER
 * the write it records) inverted the lock order against those row locks and deadlocked concurrent
 * writers with SQLSTATE 40P01; `runAuditedTransaction` in `extensions/audit.ts` carries the full
 * argument and `test/audit-lock-ordering.integration.test.ts` pins it. A read THROUGH A CLIENT still
 * never queues behind a writer, because it never opens an audited transaction at all — but a
 * read-only `withAudit()` block does open one, and therefore does take this lock and does serialize.
 * See the note on `runAuditedTransaction`; "eager" does not mean "always", it means "at the start of
 * every audited transaction, appending or not".
 *
 * Declared via `BigInt(...)` rather than a `1n` literal so the module compiles under a
 * pre-ES2020 target.
 */
export const AUDIT_CHAIN_LOCK_KEY: bigint = BigInt('7233057419042001');

/**
 * The EXACT 14 fields bound into the hash. Documentary order only — `canonicalJson` sorts keys.
 *
 * ⚠ DELIBERATE DEVIATION FROM §12, which lists 10 and omits `waqfId`, `actorType`,
 * `onBehalfOfId` and `category`. Leaving `waqfId` out would let a tamperer re-scope a recorded
 * event to a different endowment without breaking the chain — the trail would stay internally
 * consistent while lying about which waqf it describes. All four are immutable and material, so
 * all four are bound in. Needs a one-line §12 amendment.
 */
export const AUDIT_HASH_PAYLOAD_FIELDS = [
  'id',
  'occurredAt',
  'actorId',
  'actorType',
  'onBehalfOfId',
  'action',
  'entityType',
  'entityId',
  'waqfId',
  'before',
  'after',
  'context',
  'category',
  'classification',
] as const;

export type AuditHashPayloadField = (typeof AUDIT_HASH_PAYLOAD_FIELDS)[number];

export class CanonicalJsonError extends Error {
  readonly code = 'CANONICAL_JSON_INVALID';
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalJsonError';
  }
}

/** A value tree containing no numbers — the output of {@link serializeForAudit}. */
export type JsonSafe = string | boolean | null | JsonSafe[] | { [key: string]: JsonSafe };

// ═══════════════════════════════════════════════════════════════════════════════════════════
// serializeForAudit — numerics and dates become strings
// ═══════════════════════════════════════════════════════════════════════════════════════════

function isDecimalLike(
  value: unknown,
): value is { toFixed: (dp?: number) => string; decimalPlaces: () => number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { toFixed?: unknown }).toFixed === 'function' &&
    typeof (value as { decimalPlaces?: unknown }).decimalPlaces === 'function'
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * ISO-8601 UTC with exactly three fractional digits and a `Z`. `Date.prototype.toISOString()`
 * already emits exactly that shape, and Prisma stores `DateTime` as `timestamp(3)`, so a value
 * written and a value read back serialize identically.
 */
export function dateToCanonicalString(value: Date): string {
  if (Number.isNaN(value.getTime()))
    throw new CanonicalJsonError('cannot canonicalize an Invalid Date');
  return value.toISOString();
}

/**
 * Decimal -> fixed-point string, never exponential.
 *
 * Scale rule: at least 2 decimal places (so SAR money always reads `350000.00`, matching the
 * `Decimal(18,2)` column and the E1 contract's worked example) and never fewer than the value
 * actually carries (so a `Decimal(9,4)` share is `12.3456`, not silently rounded to `12.35`).
 * Lossless and deterministic: two logically equal Decimals always produce the same string.
 */
export function decimalToCanonicalString(value: {
  toFixed: (dp?: number) => string;
  decimalPlaces: () => number;
}): string {
  const dp = value.decimalPlaces();
  return value.toFixed(Math.max(2, Number.isFinite(dp) ? dp : 2));
}

/**
 * JS number -> string. Rejects NaN and +/-Infinity (not representable in JSON and never
 * meaningful in a ledger); normalizes -0 to "0" so the two spellings of zero cannot produce two
 * different hashes. `String(n)` is fully specified by ECMAScript (shortest round-tripping
 * representation), so it is deterministic across engines and versions.
 */
export function numberToCanonicalString(value: number, path: string): string {
  if (!Number.isFinite(value))
    throw new CanonicalJsonError(`${path}: ${String(value)} cannot be canonicalized`);
  return Object.is(value, -0) ? '0' : String(value);
}

/**
 * Normalizes an arbitrary value into a number-free JSON tree.
 *
 * `undefined` object properties are OMITTED (not encoded as null) — Prisma uses `undefined` to
 * mean "field not present in this operation", and encoding it would make a partial diff hash
 * differently from a full one.
 */
export function serializeForAudit(value: unknown, path = '$'): JsonSafe {
  if (value === null || value === undefined) return null;

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return value;
    case 'number':
      return numberToCanonicalString(value, path);
    case 'bigint':
      return value.toString(10);
    case 'function':
    case 'symbol':
      throw new CanonicalJsonError(`${path}: ${typeof value} cannot appear in an audit payload`);
    default:
      break;
  }

  if (value instanceof Date) return dateToCanonicalString(value);
  if (Buffer.isBuffer(value)) return value.toString('base64');
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if (isDecimalLike(value)) return decimalToCanonicalString(value);
  if (Array.isArray(value)) return value.map((item, i) => serializeForAudit(item, `${path}[${i}]`));

  if (isPlainObject(value)) {
    const out: Record<string, JsonSafe> = {};
    for (const key of Object.keys(value)) {
      const item = value[key];
      if (item === undefined) continue; // "not present", not "null"
      out[key] = serializeForAudit(item, `${path}.${key}`);
    }
    return out;
  }

  // A class instance we do not recognize. Refuse rather than guess: silently coercing it would
  // put an unpredictable encoding into the hash.
  throw new CanonicalJsonError(
    `${path}: value of type ${Object.getPrototypeOf(value)?.constructor?.name ?? 'unknown'} cannot be canonicalized. ` +
      `Convert it to a string, Decimal, Date or plain object first.`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// canonicalJson
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Minimal JSON string escaping: `"`, `\`, and C0 controls as lowercase `\u00xx`. Everything else
 * — including U+2028/U+2029 and unpaired surrogates — is emitted verbatim, so the encoding of an
 * Arabic or RTL string is byte-stable and does not depend on a JSON library's escaping policy.
 */
function encodeString(value: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i += 1) {
    const ch = value[i] as string;
    const code = value.charCodeAt(i);
    if (ch === '"') out += '\\"';
    else if (ch === '\\') out += '\\\\';
    else if (code < 0x20) out += `\\u${code.toString(16).padStart(4, '0')}`;
    else out += ch;
  }
  return `${out}"`;
}

/**
 * Deterministic JSON encoding. STRICT: a JS `number` throws.
 *
 * Run {@link serializeForAudit} first — it turns every numeric into a string, so this guard only
 * fires on a value that skipped the pipeline. That is the point: it is a tripwire for "somebody
 * added a code path that puts a float in the ledger", not an obstacle for ordinary data.
 *
 * Rules, all load bearing:
 *   • object keys sorted ascending by UTF-16 code unit (`Array.prototype.sort` default)
 *   • no whitespace anywhere
 *   • `undefined` properties omitted; explicit `null` preserved
 *   • array order preserved (it is data)
 *   • Date / Decimal / BigInt accepted here too, encoded exactly as `serializeForAudit` would,
 *     so a caller who hands over a raw row still gets the canonical bytes
 */
export function canonicalJson(value: unknown, path = '$'): string {
  if (value === null || value === undefined) return 'null';

  if (typeof value === 'number') {
    throw new CanonicalJsonError(
      `${path}: JS number ${String(value)} is banned in a canonical payload. Money and shares are Decimal; ` +
        `run serializeForAudit() first, which encodes every numeric as a string.`,
    );
  }
  if (typeof value === 'string') return encodeString(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'bigint') return encodeString(value.toString(10));
  if (value instanceof Date) return encodeString(dateToCanonicalString(value));
  if (Buffer.isBuffer(value)) return encodeString(value.toString('base64'));
  if (value instanceof Uint8Array) return encodeString(Buffer.from(value).toString('base64'));
  if (isDecimalLike(value)) return encodeString(decimalToCanonicalString(value));

  if (Array.isArray(value)) {
    return `[${value.map((item, i) => canonicalJson(item, `${path}[${i}]`)).join(',')}]`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${encodeString(key)}:${canonicalJson(value[key], `${path}.${key}`)}`).join(',')}}`;
  }

  throw new CanonicalJsonError(
    `${path}: value of type ${Object.getPrototypeOf(value)?.constructor?.name ?? 'unknown'} cannot be canonicalized`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Hashing
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * `sha256_hex( utf8(canonicalJson(payload)) || utf8(prevHash) )`, lowercase hex, 64 chars.
 *
 * `prevHash` is appended as its 64 ASCII characters rather than as 32 decoded bytes: it is the
 * spelling the E1 contract pins, and it keeps the input to sha256 inspectable by eye when
 * debugging a broken chain.
 */
export function computeHash(payload: unknown, prevHash: string): string {
  if (!HASH_HEX_RE.test(prevHash)) {
    throw new CanonicalJsonError(
      `prevHash must be 64 lowercase hex characters, got ${JSON.stringify(prevHash)}`,
    );
  }
  const body = Buffer.from(canonicalJson(payload), 'utf8');
  return createHash('sha256').update(body).update(Buffer.from(prevHash, 'utf8')).digest('hex');
}

/** The 14 hashed fields, as read from the database or as about to be written. */
export interface AuditHashRow {
  id: bigint | string;
  occurredAt: Date | string;
  actorId: string | null;
  actorType: string;
  onBehalfOfId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  waqfId?: string | null;
  before?: unknown;
  after?: unknown;
  context: unknown;
  category: string;
  classification: string;
}

/**
 * Projects a row onto exactly the hashed fields and normalizes each one. Used at WRITE time and
 * again at VERIFY time — one function, so a verifier can never disagree with a writer about what
 * was hashed.
 */
export function buildAuditPayload(row: AuditHashRow): Record<string, JsonSafe> {
  const source = row as unknown as Record<string, unknown>;
  const payload: Record<string, JsonSafe> = {};
  for (const field of AUDIT_HASH_PAYLOAD_FIELDS) {
    payload[field] = serializeForAudit(source[field] ?? null, `$.${field}`);
  }
  return payload;
}

/** Recomputes a row's `rowHash` from its content and its recorded predecessor. */
export function recomputeRowHash(row: AuditHashRow, prevHash: string): string {
  return computeHash(buildAuditPayload(row), prevHash);
}

export interface ChainVerificationResult {
  ok: boolean;
  checked: number;
  /** `id` of the first row that failed, as a string. */
  brokenAtId?: string;
  reason?: string;
}

/**
 * Verifies a whole chain (assertion A6). Rows MUST be supplied ordered by `id` ascending.
 *
 * Three independent things are checked, because they fail differently:
 *   • the first row starts from genesis          -> rows were deleted from the head
 *   • each `prevHash` matches the previous `rowHash` -> a row was deleted or re-ordered
 *   • each `rowHash` recomputes from its content -> a row's content was edited
 *
 * ⚠ AND EACH REASON STRING NOW NAMES THE CAUSE IT CANNOT RULE OUT, which AV7-AUD-F2 asked for: the
 * chain-head poison produced a genuine `prevHash` mismatch and the verifier reported *"a row was
 * deleted or re-ordered"* — a FALSE ACCUSATION, and the one an auditor would act on. Migration 23
 * closes that route, so the reachable causes have changed rather than gone away:
 *
 *   · a `prevHash` mismatch now means either a real deletion/re-ordering — which every role,
 *     SUPERUSER included, is refused, so it implies a dropped trigger or a doctored backup — or
 *     THE READ: a filtered `WHERE`, a partial window, or a wrong `ORDER BY`. The last is not
 *     hypothetical here; a bare `ORDER BY "id"` against a `text`-cast output column sorts 10 before
 *     2 and looks exactly like a break at row 10.
 *   · a CONTENT mismatch is where AV7-AUD-F6 lands, and it is the more misleading of the two: on a
 *     non-UTC host node-postgres localises `occurredAt` (`timestamp WITHOUT time zone`), every hash
 *     recomputes from a shifted instant, and the verifier reports the trail forged FROM ROW 1.
 *     Measured: `TZ=+03` -> `row 1 content does not match its rowHash`; `TZ=UTC` -> the truth. The
 *     normalisation is still owed here; naming the cause in the message is not a substitute for it,
 *     it is what stops a genuine break and a wrong `TZ` being indistinguishable to the reader.
 */
export function verifyChain(
  rows: readonly (AuditHashRow & { prevHash: string; rowHash: string })[],
): ChainVerificationResult {
  let expectedPrev = GENESIS_HASH;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] as AuditHashRow & { prevHash: string; rowHash: string };
    const id = String(row.id);

    if (row.prevHash !== expectedPrev) {
      return {
        ok: false,
        checked: i,
        brokenAtId: id,
        reason:
          i === 0
            ? `chain does not start at genesis: first row's prevHash is ${row.prevHash} — either ` +
              `rows were deleted from the head, or this read did not start at id 1 (a filtered ` +
              `WHERE or a partial window looks identical from here)`
            : `prevHash of row ${id} does not match rowHash of the preceding row (a row was ` +
              `deleted or re-ordered — or the rows were supplied filtered or mis-ordered; a bare ` +
              `ORDER BY over an id cast to text sorts 10 before 2)`,
      };
    }

    const recomputed = recomputeRowHash(row, row.prevHash);
    if (recomputed !== row.rowHash) {
      return {
        ok: false,
        checked: i,
        brokenAtId: id,
        reason:
          `row ${id} content does not match its rowHash (expected ${recomputed}, stored ` +
          `${row.rowHash}) — the row's content was edited, OR occurredAt was localised by the ` +
          `driver: this function is TZ-dependent (AV7-AUD-F6) and a non-UTC host reports the ` +
          `whole trail broken from row 1. Confirm TZ=UTC before treating this as tampering`,
      };
    }

    expectedPrev = row.rowHash;
  }

  return { ok: true, checked: rows.length };
}
