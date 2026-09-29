// QMULATE — field-encryption Prisma extension (§12).
//
// POSITION IN THE CHAIN: OUTERMOST.
//
//     base.$extends(audit).$extends(scoping).$extends(encryption)
//                                             ^^^^^^^^^^ applied last = runs first on the way in
//
// Prisma composes query extensions so the LAST one applied wraps the others. Encryption
// therefore transforms arguments BEFORE audit ever sees them, and decrypts results AFTER audit
// has recorded them. That ordering is the mechanism by which the audit trail can only ever
// contain ciphertext — it is not a convention the audit code has to remember. `EXTENSION_ORDER`
// in `client.ts` pins it and a unit test asserts it.
//
// THE COLUMN-NAMING WART, kept deliberately from §07: a `...Enc` column holds PLAINTEXT at the
// application boundary and CIPHERTEXT at rest. Callers read and write ordinary strings; the
// round trip is invisible. The name records where the data ends up, not what you hand over.
//
// THE `...Hmac` SIBLINGS are derived, never supplied. A caller that sets one directly is
// refused: a hand-written digest could disagree with the ciphertext beside it, and the columns
// are used for uniqueness (`BankAccount.ibanHmac` is `@@unique`), so a wrong digest is a
// silently-defeated no-commingling check (BR-501).

import { Prisma } from '../../generated/client/index.js';
import { encryptField, isCipherEnvelope, decryptField, searchHash } from '../crypto.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Errors
//
// Declared before the constants below because the module-load self-check throws them: a class is
// not hoisted, so referencing one above its declaration is a temporal-dead-zone crash.
// ═══════════════════════════════════════════════════════════════════════════════════════════

export class EncryptedFieldError extends Error {
  readonly code = 'ENCRYPTED_FIELD';
  constructor(message: string) {
    super(message);
    this.name = 'EncryptedFieldError';
  }
}

/** `where` referenced a `...Enc` column. Randomized ciphertext is not comparable — use the HMAC. */
export class EncryptedFieldQueryError extends EncryptedFieldError {
  constructor(column: string, location: string, hmacSibling: string | null) {
    super(
      `cannot filter on ${column} in "${location}": ciphertext is randomized, so equality never matches. ` +
        (hmacSibling
          ? `Use the searchable digest instead: where: { ${hmacSibling}: searchHash('<Model>.${column}', value) }`
          : `${column} has no searchable digest column, so it cannot be filtered on at all.`),
    );
    this.name = 'EncryptedFieldQueryError';
  }
}

/** Caller supplied a derived `...Hmac` column. */
export class HmacColumnWriteError extends EncryptedFieldError {
  constructor(column: string) {
    super(
      `${column} is derived from its encrypted sibling and may not be written directly. Set the plaintext on ` +
        `the ...Enc column; the digest is computed for you.`,
    );
    this.name = 'HmacColumnWriteError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The encrypted columns — the complete list (§07 §5, §07 §6)
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * `...Enc` column -> owning model, and `...Enc` column -> its searchable `...Hmac` sibling
 * (`null` where the schema has none).
 *
 * Column names are globally unique across the schema, which is what lets both the write and the
 * read path derive the AAD (`<Model>.<column>`) from the column name alone, without tracking
 * which model a nested `data` object belongs to. `assertEncryptedColumnsAreUnique()` enforces
 * that assumption at module load rather than letting it rot.
 */
export const ENCRYPTED_FIELDS = {
  Beneficiary: {
    // Beneficial-Ownership minimum dataset (BR-202/203).
    uboIdTypeEnc: null,
    uboIdNumberEnc: 'uboIdNumberHmac',
    uboBankingRefEnc: 'uboBankingRefHmac',
  },
  BankAccount: {
    // The dedicated per-endowment account IBAN. `ibanHmac` is @@unique, so it is also the
    // no-commingling duplicate check (BR-501).
    ibanEnc: 'ibanHmac',
  },
  AmlReport: {
    // The SAR's detailed free text — the operation and the related parties (S9-4b, owner ruling
    // 2026-08-25: S8-Q10 "Field-encrypt now"; migration 37). NO searchable digest, deliberately:
    // subject search is served by `relatedPartyRefs` (plain ids), and an HMAC of free suspicion
    // text has no lookup key a caller could ever hold. Registering the column here is also what
    // keeps it out of the audit trail's `after` image in plaintext (`redactEncrypted`).
    suspicionSummaryEnc: null,
  },
} as const satisfies Record<string, Record<string, string | null>>;

/**
 * NOT encrypted in Sprint 1, recorded so the gap is visible rather than forgotten:
 *
 * `DistributionLineItem.transferRef` — §12 names "distribution payout references" as an
 * encryption target; §07 models it as a plain String and this build follows §07. No real payout
 * reference exists yet, so renaming it to `transferRefEnc` in E6/S7 is a schema change with no
 * data migration. After the first real payout it is a migration. Do it in E6/S7.
 */
export const KNOWN_UNENCRYPTED_SENSITIVE_FIELDS = ['DistributionLineItem.transferRef'] as const;

type EncColumn = string;

const OWNER_OF: Record<EncColumn, string> = {};
const HMAC_SIBLING: Record<EncColumn, string | null> = {};

for (const [model, columns] of Object.entries(ENCRYPTED_FIELDS)) {
  for (const [column, hmac] of Object.entries(columns) as [string, string | null][]) {
    OWNER_OF[column] = model;
    HMAC_SIBLING[column] = hmac;
  }
}

/** Every `...Enc` column name in the schema. */
export const ENCRYPTED_COLUMN_NAMES: ReadonlySet<string> = new Set(Object.keys(OWNER_OF));

/** Every derived `...Hmac` column name. Writing one directly is refused. */
export const HMAC_COLUMN_NAMES: ReadonlySet<string> = new Set(
  Object.values(HMAC_SIBLING).filter((value): value is string => value !== null),
);

/** `Beneficiary.uboIdNumberEnc` — the AAD and the HMAC domain separator. */
export function qualifiedColumn(column: string): string {
  const owner = OWNER_OF[column];
  if (!owner) throw new EncryptedFieldError(`${column} is not a registered encrypted column`);
  return `${owner}.${column}`;
}

function assertEncryptedColumnsAreUnique(): void {
  const seen = new Map<string, string>();
  for (const [model, columns] of Object.entries(ENCRYPTED_FIELDS)) {
    for (const column of Object.keys(columns)) {
      const previous = seen.get(column);
      if (previous && previous !== model) {
        throw new EncryptedFieldError(
          `encrypted column "${column}" appears on both ${previous} and ${model}. The extension derives the ` +
            `AAD from the column name alone, so column names must be globally unique. Rename one, or teach ` +
            `the walker to track the owning model.`,
        );
      }
      seen.set(column, model);
    }
  }
}
assertEncryptedColumnsAreUnique();

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Tree helpers
// ═══════════════════════════════════════════════════════════════════════════════════════════

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** A Prisma update can be `{ set: v }`, `{ increment: n }`, ... as well as a bare value. */
function unwrapFieldWrite(value: unknown): { value: unknown; rewrap: (next: unknown) => unknown } {
  if (isPlainObject(value) && 'set' in value && Object.keys(value).length === 1) {
    return { value: value.set, rewrap: (next) => ({ set: next }) };
  }
  return { value, rewrap: (next) => next };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Write path
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Recursively encrypts every `...Enc` value in a write payload and derives its `...Hmac` sibling.
 *
 * The walk is name-driven rather than model-driven, so it handles nested relation writes
 * (`waqf.create({ data: { bankAccounts: { create: [...] } } })`) without a relation map. Values
 * that are already envelopes are left alone, which keeps the extension idempotent — re-running a
 * write payload cannot double-encrypt.
 *
 * Returns a COPY. Prisma arguments are frequently reused by callers (loops, retries); mutating
 * them in place would encrypt the caller's own object and produce a double-encrypted second
 * attempt.
 */
function encryptWriteTree(node: unknown, path: string): unknown {
  if (Array.isArray(node)) return node.map((item, i) => encryptWriteTree(item, `${path}[${i}]`));
  if (!isPlainObject(node)) return node;

  const out: Record<string, unknown> = {};

  for (const [key, raw] of Object.entries(node)) {
    if (HMAC_COLUMN_NAMES.has(key) && raw !== undefined) throw new HmacColumnWriteError(key);

    if (ENCRYPTED_COLUMN_NAMES.has(key)) {
      const { value, rewrap } = unwrapFieldWrite(raw);

      if (value === null || value === undefined) {
        out[key] = raw;
        // Clearing the plaintext must clear the digest too, or a stale digest would keep
        // matching a value that is no longer stored.
        const sibling = HMAC_SIBLING[key];
        if (sibling && value === null) out[sibling] = null;
        continue;
      }

      if (typeof value !== 'string') {
        throw new EncryptedFieldError(
          `${qualifiedColumn(key)} must be a string, got ${typeof value} at ${path}.${key}`,
        );
      }

      const qualified = qualifiedColumn(key);
      const plaintext = value;
      out[key] = rewrap(
        isCipherEnvelope(plaintext) ? plaintext : encryptField(qualified, plaintext),
      );

      const sibling = HMAC_SIBLING[key];
      if (sibling && !isCipherEnvelope(plaintext)) out[sibling] = searchHash(qualified, plaintext);
      continue;
    }

    out[key] = encryptWriteTree(raw, `${path}.${key}`);
  }

  return out;
}

/**
 * Fail-closed net: after the walk, no plaintext may remain in an `...Enc` position anywhere in
 * the argument tree. Catches a shape the walker did not anticipate rather than letting an
 * unencrypted national id reach the database.
 */
function assertNoPlaintextRemains(node: unknown, path: string): void {
  if (Array.isArray(node)) {
    node.forEach((item, i) => assertNoPlaintextRemains(item, `${path}[${i}]`));
    return;
  }
  if (!isPlainObject(node)) return;

  for (const [key, value] of Object.entries(node)) {
    if (ENCRYPTED_COLUMN_NAMES.has(key)) {
      const { value: inner } = unwrapFieldWrite(value);
      if (typeof inner === 'string' && !isCipherEnvelope(inner)) {
        throw new EncryptedFieldError(
          `${path}.${key} still holds plaintext after the encryption pass. This argument shape is not supported; ` +
            `write the value with a top-level operation on ${OWNER_OF[key]}.`,
        );
      }
      continue;
    }
    assertNoPlaintextRemains(value, `${path}.${key}`);
  }
}

/** Refuses a filter that references a `...Enc` column. */
function assertNoEncryptedFilter(node: unknown, location: string): void {
  if (Array.isArray(node)) {
    node.forEach((item) => assertNoEncryptedFilter(item, location));
    return;
  }
  if (!isPlainObject(node)) return;

  for (const [key, value] of Object.entries(node)) {
    if (ENCRYPTED_COLUMN_NAMES.has(key))
      throw new EncryptedFieldQueryError(qualifiedColumn(key), location, HMAC_SIBLING[key] ?? null);
    assertNoEncryptedFilter(value, location);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Read path
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Decrypts every `...Enc` envelope in a result tree, including nested `include`d relations.
 *
 * Only touches strings that parse as a QMULATE envelope, so a legacy plaintext row (or a
 * `select` that never asked for the column) passes through untouched instead of throwing.
 */
function decryptResultTree(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(decryptResultTree);
  if (!isPlainObject(node)) return node;

  let changed = false;
  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(node)) {
    if (ENCRYPTED_COLUMN_NAMES.has(key) && isCipherEnvelope(value)) {
      out[key] = decryptField(qualifiedColumn(key), value);
      changed = true;
      continue;
    }
    const next = decryptResultTree(value);
    if (next !== value) changed = true;
    out[key] = next;
  }

  return changed ? out : node;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The extension
// ═══════════════════════════════════════════════════════════════════════════════════════════

const FILTER_KEYS = ['where', 'cursor', 'having', 'orderBy'] as const;
const WRITE_KEYS = ['data', 'create', 'update'] as const;

/**
 * Stateless — it holds no actor context, because encryption is not an authorization decision.
 * Who may SEE a decrypted value is the scoping extension's and the API layer's job.
 */
export function createEncryptionExtension() {
  return Prisma.defineExtension({
    name: 'qmulate-field-encryption',
    query: {
      $allModels: {
        /* eslint-disable @typescript-eslint/no-explicit-any --
           This hook is generic over every model and every operation at once, so Prisma's
           per-operation argument unions cannot be named here. Block-level rather than
           `-next-line`, because Prettier reflows the signature and detaches the directive. */
        async $allOperations({
          args,
          query,
        }: {
          args: any;
          query: (args: any) => Promise<unknown>;
        }) {
          let nextArgs = args;

          if (isPlainObject(nextArgs)) {
            for (const key of FILTER_KEYS) {
              if (nextArgs[key] !== undefined) assertNoEncryptedFilter(nextArgs[key], key);
            }

            const patched: Record<string, unknown> = { ...nextArgs };
            let touched = false;
            for (const key of WRITE_KEYS) {
              if (patched[key] !== undefined) {
                patched[key] = encryptWriteTree(patched[key], key);
                assertNoPlaintextRemains(patched[key], key);
                touched = true;
              }
            }
            if (touched) nextArgs = patched;
          }

          return decryptResultTree(await query(nextArgs));
        },
        /* eslint-enable @typescript-eslint/no-explicit-any */
      },
    },
  });
}

// Re-exported so callers can build an equality lookup without importing `../crypto.js` directly:
//   where: { ibanHmac: searchHash('BankAccount.ibanEnc', iban) }
export { searchHash };
