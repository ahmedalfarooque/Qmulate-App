/**
 * The storage factory — the ONE place a driver name becomes an adapter.
 *
 * Source of truth: `docs/product/prd/17-build-ship-dod.md` (E2's "storage/jobs interfaces so
 * features depend on interfaces, not MinIO/pg-boss") and PRD §12 (the vault's WORM semantics).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY A FACTORY AT ALL, AND WHY IT FAILS CLOSED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A feature must never write `new InMemoryStorageAdapter()` or `new S3Client()`. It takes a
 * {@link StorageAdapter} and is handed one. That is what makes the object store swappable (MinIO
 * in dev, an S3-compatible KSA-resident bucket in production) and what keeps the vault's
 * retention rules in one implementation instead of at every call site.
 *
 * The dangerous failure mode of a factory like this is **defaulting**. `driver` normally arrives
 * from configuration, so a typo (`'minio'`, `'S3'`, `''`, `undefined`) is realistic — and a
 * factory that answered such a value with the in-memory adapter would hand a DEPLOYED environment
 * a store that is not durable, accepts every write, and loses the endowment's deed the moment the
 * process restarts. There is no error, no log line, and no failing request: the documents simply
 * are not there.
 *
 * So: **an unrecognised driver THROWS.** `NOT_SUPPORTED`, naming the value it was given and the
 * closed list it is not in. Never a fallback, never a "probably memory", never a warning-and-
 * continue. This mirrors the house pattern (`requiresTotpForDbRole` treats an unmapped role as
 * TOTP-required; `roleKeyFromDbRole` returns `undefined` for an unmapped enum value).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT IS DELIBERATELY NOT HERE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * · **No S3 SDK dependency.** `driver: 's3'` parses, validates, and then throws `NOT_SUPPORTED`
 *   pointing at the named gate (owner ruling 2026-09-01, option C: before the first client
 *   migration — this line said "S10/E9" until that ruling re-dated it; E9's exit rides the
 *   DB retention floor instead). Adding `@aws-sdk/client-s3` early would put a network client and its
 *   transitive tree into every package that touches a document, months before anything can use
 *   it — and CI runs `--frozen-lockfile`, so a speculative dependency is a real cost.
 * · **No environment reading.** The config is an ARGUMENT. `@qmulate/config` owns env parsing;
 *   a package that reads `process.env` itself is a package whose behaviour cannot be reproduced
 *   from its inputs.
 * · **No retention default.** ⚠ unverified — confirm vs primary law: the ≥10-year retention
 *   period is unverified against primary Saudi law, so `retainUntil` stays a required
 *   caller-supplied value read from a `Setting`. A default here would be a hardcoded statutory
 *   figure in the one place nobody would think to look for one.
 */

import { InMemoryStorageAdapter, StorageError, type StorageAdapter } from './index.js';

/**
 * The closed set of driver names.
 *
 * `memory` is dev/test only and is not durable. `s3` covers every S3-compatible endpoint —
 * MinIO in dev and an S3-compatible KSA-resident bucket in production are the SAME driver with a
 * different `endpoint`, which is exactly why there is no separate `minio` value to get wrong.
 */
export const STORAGE_DRIVERS = ['memory', 's3'] as const;

export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

const STORAGE_DRIVER_SET: ReadonlySet<string> = new Set(STORAGE_DRIVERS);

/** Narrow an untrusted value (an env var, a JSON body, a config file) to a driver name. */
export function isStorageDriver(value: unknown): value is StorageDriver {
  return typeof value === 'string' && STORAGE_DRIVER_SET.has(value);
}

/**
 * What the factory needs in order to build an adapter.
 *
 * `bucket` / `endpoint` / `region` are optional at the type level because the `memory` driver
 * needs none of them; {@link createStorageAdapter} requires them for `s3` at RUNTIME rather than
 * expressing the dependency as a discriminated union, so a config assembled from environment
 * strings is validated in one place and reports every missing field at once.
 */
export interface StorageConfig {
  readonly driver: StorageDriver;
  /** S3 bucket name. Required for `s3`, ignored by `memory`. */
  readonly bucket?: string;
  /** S3-compatible endpoint URL (MinIO in dev, the KSA-resident bucket in prod). */
  readonly endpoint?: string;
  readonly region?: string;
}

/** Non-config knobs the in-memory adapter accepts. Deterministic clock injection, mainly. */
export interface StorageAdapterOptions {
  /** Injected clock so retention tests are deterministic. `memory` only. */
  readonly now?: () => Date;
  /** Prefix for the in-memory adapter's fake presigned URLs. `memory` only. */
  readonly urlPrefix?: string;
}

/**
 * The fields an `s3` config must carry. Checked even though the driver is not implemented yet,
 * so the error a caller gets is "S3 is E9" rather than "bucket is undefined" six months later.
 */
const S3_REQUIRED_FIELDS = ['bucket', 'region'] as const;

/**
 * Builds a {@link StorageAdapter} for `config.driver`.
 *
 * - `memory` → {@link InMemoryStorageAdapter}. Enforces the same retention and legal-hold rules
 *   as the real adapter, which is the point: a test proving deletion is refused inside the
 *   window must exercise the same guard production uses.
 * - `s3` → **throws `NOT_SUPPORTED`.** The S3-compatible adapter + its object-lock proof are
 *   owed to the named gate — before the first client migration (owner ruling 2026-09-01, (C);
 *   this line said "S10/E9" until then). The config is
 *   validated first so the message distinguishes "not built yet" from "mis-configured".
 * - anything else → **throws `NOT_SUPPORTED`.** See the file header: a default here would hand a
 *   deployed environment a non-durable store, silently.
 */
export function createStorageAdapter(
  config: StorageConfig,
  options: StorageAdapterOptions = {},
): StorageAdapter {
  const driver: unknown = (config as { driver?: unknown } | null | undefined)?.driver;

  if (!isStorageDriver(driver)) {
    throw new StorageError(
      'NOT_SUPPORTED',
      `Unknown storage driver ${JSON.stringify(driver)}. The list is closed: ` +
        `${STORAGE_DRIVERS.join(' | ')}. An unrecognised driver THROWS and never falls back to ` +
        `the in-memory adapter — a deployed environment silently backed by a non-durable store ` +
        `accepts every write and loses the vault on restart, with no error to notice.`,
      { driver: typeof driver === 'string' ? driver : typeof driver },
    );
  }

  if (driver === 'memory') {
    return new InMemoryStorageAdapter({
      ...(options.now !== undefined ? { now: options.now } : {}),
      ...(options.urlPrefix !== undefined ? { urlPrefix: options.urlPrefix } : {}),
    });
  }

  // driver === 's3' — validate, then refuse.
  const missing = S3_REQUIRED_FIELDS.filter((field) => {
    const value = config[field];
    return typeof value !== 'string' || value.trim() === '';
  });

  throw new StorageError(
    'NOT_SUPPORTED',
    missing.length > 0
      ? `The S3-compatible adapter (with its object-lock proof) is owed to the named gate — ` +
          `before the first client migration (owner ruling 2026-09-01, option C) — and is not ` +
          `implemented yet. This config could not build one anyway: ` +
          `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing. No S3 SDK ` +
          `dependency is added before the epic that uses it (CI runs --frozen-lockfile).`
      : `The S3-compatible adapter (with its object-lock proof) is owed to the named gate — ` +
          `before the first client migration (owner ruling 2026-09-01, option C) — and is not ` +
          `implemented yet. The config is well-formed; the driver is not built. No S3 SDK ` +
          `dependency is added before the epic that uses it (CI runs --frozen-lockfile).`,
    {
      driver,
      ...(missing.length > 0 ? { missing: [...missing] } : {}),
      epic: 'E9',
    },
  );
}
