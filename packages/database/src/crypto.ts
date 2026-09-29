// QMULATE — application-level field encryption and searchable HMACs (§12).
//
// WHAT THIS PROTECTS. Postgres at-rest encryption protects the disk. It does not protect a
// leaked backup, a mis-scoped query, a `pg_dump` in a support ticket, or a read-replica in the
// wrong jurisdiction. The Beneficial-Ownership minimum dataset (national id, banking reference)
// and waqf IBANs are the most sensitive data in the system, so they carry a SECOND layer that
// travels with the bytes: AES-256-GCM, encrypted in the application, decrypted only for a caller
// that got through the access matrix.
//
// THE SEARCHABILITY PROBLEM. Randomized encryption is not searchable — the same IBAN encrypts
// differently every time, so `WHERE "ibanEnc" = ?` can never match. Decrypting the whole table
// to find one row is both slow and a PII firehose. The standard answer, used here, is a
// deterministic keyed digest in a sibling `...Hmac` column: it supports EQUALITY lookup and
// uniqueness, is not reversible, and leaks only "these two rows hold the same value" — which a
// unique index on the column would leak anyway.
//
// KEYS. Never in the repo, never in a migration, never derived from something guessable.
//   FIELD_ENCRYPTION_KEYS        JSON map of version -> base64 32-byte key, e.g. {"1":"..."}
//   FIELD_ENCRYPTION_ACTIVE_KEY  which version new writes use, e.g. "1"
//   FIELD_HMAC_KEY               base64 32-byte key, SEPARATE from the encryption keys
// `@qmulate/config` validates the same three variables at app boot. They are re-validated here
// so this module works in a bare `tsx` process (the seed) and in unit tests, and so a config
// module that failed to load can never silently disable encryption.
//
// ROTATION. The stored envelope names its own key version, so rotation is: add key "2", flip
// FIELD_ENCRYPTION_ACTIVE_KEY to "2", keep "1" for reads, re-encrypt in the background. No
// schema change, no extra column.

import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';

// Side-effect import: populates `process.env` from the monorepo-root `.env` for plain Node
// entry points (seed, worker, scripts, Vitest). This module reads the key material straight
// from `process.env` — see `loadConfig()` below — so it must be loaded before that happens.
// Never overrides a value CI or Railway already injected.
import '@qmulate/config/load-env';

import { isFixtureOnly } from './context.js';

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Envelope format
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * `v<keyVersion>:<b64url(iv)>:<b64url(ciphertext)>:<b64url(tag)>`
 *
 * Self-describing: a value can be decrypted knowing only the key map. No side table, no extra
 * version column, and a plaintext value can never be mistaken for a ciphertext (it would have to
 * start `v<digits>:` and carry three base64url segments and a valid GCM tag).
 */
export const CIPHER_ENVELOPE_RE = /^v(\d+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+):([A-Za-z0-9_-]+)$/;

const IV_BYTES = 12; // 96-bit IV — the GCM-recommended size
const TAG_BYTES = 16; // 128-bit auth tag
const KEY_BYTES = 32; // AES-256

function b64url(buf: Buffer): string {
  return buf.toString('base64url');
}

function unb64url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

export class FieldCryptoError extends Error {
  readonly code = 'FIELD_CRYPTO';
  constructor(message: string) {
    super(message);
    this.name = 'FieldCryptoError';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Key material
// ═══════════════════════════════════════════════════════════════════════════════════════════

export interface FieldCryptoConfig {
  /** version -> 32-byte key */
  keys: Map<string, Buffer>;
  /** the version new writes use */
  activeKeyVersion: string;
  /** 32-byte key for the searchable HMAC — deliberately NOT one of the encryption keys */
  hmacKey: Buffer;
  /**
   * Derive the IV deterministically from the plaintext instead of at random.
   *
   * ⚠ TODO(surface): SCOPE/SECURITY. This exists because assertion A7 pins a frozen final
   * `rowHash` after a fresh seed, and a random IV makes the seeded ciphertext — and therefore
   * the audit hash chain — different on every run. It is auto-enabled ONLY when
   * `DATA_CLASSIFICATION=fixture-only`, so production can never reach it.
   *
   * The leak it introduces is equality (identical plaintexts produce identical ciphertexts) —
   * exactly what the `...Hmac` sibling columns already expose by design, so for the three
   * HMAC-backed columns it adds nothing. Confirm this trade, or drop A7's frozen-vector pin.
   */
  deterministicIv: boolean;
}

const base64Key = z
  .string()
  .min(1)
  .transform((value, ctx) => {
    const buf = Buffer.from(value, 'base64');
    if (buf.length !== KEY_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `expected a base64-encoded ${KEY_BYTES}-byte key, got ${buf.length} bytes`,
      });
      return z.NEVER;
    }
    return buf;
  });

const envSchema = z.object({
  FIELD_ENCRYPTION_KEYS: z.string().min(1),
  FIELD_ENCRYPTION_ACTIVE_KEY: z.string().min(1),
  FIELD_HMAC_KEY: base64Key,
  FIELD_ENCRYPTION_DETERMINISTIC_IV: z.string().optional(),
});

let config: FieldCryptoConfig | null = null;

/**
 * Inject key material explicitly — the path `@qmulate/config` should use at app boot, and the
 * path tests use. Overrides anything read from `process.env`.
 */
export function configureFieldCrypto(input: {
  keys: Record<string, string | Buffer>;
  activeKeyVersion: string;
  hmacKey: string | Buffer;
  deterministicIv?: boolean;
}): void {
  const keys = new Map<string, Buffer>();
  for (const [version, key] of Object.entries(input.keys)) {
    const buf = typeof key === 'string' ? Buffer.from(key, 'base64') : key;
    if (buf.length !== KEY_BYTES) {
      throw new FieldCryptoError(
        `field encryption key "${version}" must be ${KEY_BYTES} bytes, got ${buf.length}`,
      );
    }
    keys.set(version, buf);
  }
  if (!keys.has(input.activeKeyVersion)) {
    throw new FieldCryptoError(
      `FIELD_ENCRYPTION_ACTIVE_KEY="${input.activeKeyVersion}" is not present in the key map (have: ${[...keys.keys()].join(', ') || 'none'})`,
    );
  }
  const hmacKey =
    typeof input.hmacKey === 'string' ? Buffer.from(input.hmacKey, 'base64') : input.hmacKey;
  if (hmacKey.length !== KEY_BYTES) {
    throw new FieldCryptoError(`FIELD_HMAC_KEY must be ${KEY_BYTES} bytes, got ${hmacKey.length}`);
  }
  config = {
    keys,
    activeKeyVersion: input.activeKeyVersion,
    hmacKey,
    deterministicIv: input.deterministicIv ?? isFixtureOnly(),
  };
}

/** Drops cached key material. Tests only. */
export function resetFieldCrypto(): void {
  config = null;
}

function loadConfig(): FieldCryptoConfig {
  if (config) return config;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new FieldCryptoError(
      'field encryption is not configured. Set FIELD_ENCRYPTION_KEYS (JSON {"1":"<base64 32 bytes>"}), ' +
        'FIELD_ENCRYPTION_ACTIVE_KEY and FIELD_HMAC_KEY (base64 32 bytes), or call ' +
        `configureFieldCrypto(). Reason: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }

  let rawKeys: unknown;
  try {
    rawKeys = JSON.parse(parsed.data.FIELD_ENCRYPTION_KEYS);
  } catch {
    throw new FieldCryptoError(
      'FIELD_ENCRYPTION_KEYS must be a JSON object mapping key version to a base64 key',
    );
  }
  const keyMap = z.record(z.string(), z.string()).safeParse(rawKeys);
  if (!keyMap.success) {
    throw new FieldCryptoError(
      'FIELD_ENCRYPTION_KEYS must be a JSON object of {"<version>": "<base64 32 bytes>"}',
    );
  }

  configureFieldCrypto({
    keys: keyMap.data,
    activeKeyVersion: parsed.data.FIELD_ENCRYPTION_ACTIVE_KEY,
    hmacKey: parsed.data.FIELD_HMAC_KEY,
    deterministicIv:
      parsed.data.FIELD_ENCRYPTION_DETERMINISTIC_IV === undefined
        ? isFixtureOnly()
        : parsed.data.FIELD_ENCRYPTION_DETERMINISTIC_IV === '1' ||
          parsed.data.FIELD_ENCRYPTION_DETERMINISTIC_IV === 'true',
  });

  // configureFieldCrypto always assigns; the check keeps TypeScript honest.
  if (!config) throw new FieldCryptoError('field encryption configuration failed');
  return config;
}

/** True once key material is available (env or explicit). Never throws. */
export function isFieldCryptoConfigured(): boolean {
  try {
    loadConfig();
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Searchable HMAC
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * NFKC -> upper case -> strip everything that is not a letter or a digit.
 *
 * Without normalization `SA03 8000 0000 6080 1016 7519` and `sa0380000000608010167519` would
 * produce different digests and a duplicate-IBAN check would pass when it must fail. `\p{L}` and
 * `\p{N}` rather than `[A-Z0-9]` so Arabic-script values survive.
 */
export function normalizeForHash(plaintext: string): string {
  return plaintext
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * Deterministic, non-reversible digest for equality lookup.
 *
 * DOMAIN SEPARATED by `<Model>.<column>` so the same national id stored in two different columns
 * produces two different digests. Without that, a digest lifted from one table could be replayed
 * against another.
 *
 * @param qualifiedColumn e.g. `BankAccount.ibanEnc`
 */
export function searchHash(qualifiedColumn: string, plaintext: string): string {
  const { hmacKey } = loadConfig();
  return createHmac('sha256', hmacKey)
    .update(`${qualifiedColumn}:${normalizeForHash(plaintext)}`, 'utf8')
    .digest('hex');
}

/** Constant-time comparison of two hex digests. */
export function searchHashEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Encrypt / decrypt
// ═══════════════════════════════════════════════════════════════════════════════════════════

export function isCipherEnvelope(value: unknown): value is string {
  return typeof value === 'string' && CIPHER_ENVELOPE_RE.test(value);
}

/**
 * Deterministic IV, SIV-style: HMAC(hmacKey, "iv:" + qualifiedColumn + ":" + plaintext), first
 * 12 bytes. Keyed, so it is not guessable without `FIELD_HMAC_KEY`; deterministic, so the same
 * plaintext always yields the same ciphertext. Fixture-only — see `FieldCryptoConfig`.
 */
function deriveIv(cfg: FieldCryptoConfig, qualifiedColumn: string, plaintext: string): Buffer {
  return createHmac('sha256', cfg.hmacKey)
    .update(`iv:${qualifiedColumn}:${plaintext}`, 'utf8')
    .digest()
    .subarray(0, IV_BYTES);
}

/**
 * @param qualifiedColumn e.g. `Beneficiary.uboIdNumberEnc` — bound into the GCM additional
 *        authenticated data, so a ciphertext copied into a different column fails to decrypt
 *        instead of silently succeeding.
 */
export function encryptField(qualifiedColumn: string, plaintext: string): string {
  const cfg = loadConfig();
  const key = cfg.keys.get(cfg.activeKeyVersion);
  if (!key)
    throw new FieldCryptoError(`active field encryption key "${cfg.activeKeyVersion}" is missing`);

  const iv = cfg.deterministicIv
    ? deriveIv(cfg, qualifiedColumn, plaintext)
    : randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(Buffer.from(qualifiedColumn, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v${cfg.activeKeyVersion}:${b64url(iv)}:${b64url(ct)}:${b64url(tag)}`;
}

export function decryptField(qualifiedColumn: string, envelope: string): string {
  const cfg = loadConfig();
  const match = CIPHER_ENVELOPE_RE.exec(envelope);
  if (!match)
    throw new FieldCryptoError(`value in ${qualifiedColumn} is not a QMULATE cipher envelope`);

  const [, version, ivB64, ctB64, tagB64] = match;
  const key = cfg.keys.get(version as string);
  if (!key) {
    throw new FieldCryptoError(
      `${qualifiedColumn} was encrypted with key version "${version}", which is not in FIELD_ENCRYPTION_KEYS. ` +
        `Retired keys must be kept for reads until the column has been re-encrypted.`,
    );
  }

  const decipher = createDecipheriv('aes-256-gcm', key, unb64url(ivB64 as string), {
    authTagLength: TAG_BYTES,
  });
  decipher.setAAD(Buffer.from(qualifiedColumn, 'utf8'));
  decipher.setAuthTag(unb64url(tagB64 as string));
  try {
    return Buffer.concat([decipher.update(unb64url(ctB64 as string)), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    // GCM authentication failure: wrong key, wrong column, or the ciphertext was tampered with.
    throw new FieldCryptoError(
      `${qualifiedColumn} failed authenticated decryption. The ciphertext was modified, or it belongs to a different column or key.`,
    );
  }
}

/** Decrypts only if the value is an envelope; passes plaintext through untouched. */
export function maybeDecryptField(qualifiedColumn: string, value: unknown): unknown {
  return isCipherEnvelope(value) ? decryptField(qualifiedColumn, value) : value;
}
