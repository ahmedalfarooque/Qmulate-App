/**
 * `@qmulate/storage` — the document-vault boundary.
 *
 * Features depend on the `StorageAdapter` **interface**, never on an S3 SDK, so the object store
 * is swappable (MinIO in dev, an S3-compatible KSA-resident bucket in production) and testable
 * without network. Sprint 1 ships the interface plus an in-memory implementation; the
 * S3-compatible adapter lands with the document vault epic (no SDK dependency is added yet).
 *
 * ## What the interface has to encode (PRD §12)
 * - **WORM retention.** Vault documents are written under object-lock in compliance mode with a
 *   `retainUntil` date. Retention may be **extended, never shortened**, and a delete inside the
 *   window fails at this layer — deletion is not a policy the caller can opt out of.
 * - **Legal hold.** A hold suspends all deletion regardless of the retention date, and outlives
 *   the window until an authorized role releases it.
 * - **Versioning.** Superseding a document writes a new version and retains the prior one.
 * - **Presigned reads.** Bytes are never proxied through the app; a short-lived signed URL is
 *   issued and the read is audited by the caller (sensitive-read logging is the caller's job —
 *   this layer has no audit dependency).
 *
 * ⚠ unverified — confirm vs primary law: the **≥10-year retention period** (and every other
 * statutory figure) is unverified against primary Saudi law. That is exactly why `retainUntil`
 * is a **required caller-supplied value read from a `Setting`** and why this package hardcodes
 * no default period: correcting the figure must be a configuration change, not a code change.
 */

import { createHash } from 'node:crypto';

/**
 * The factory (E2): `createStorageAdapter(config)` is how a feature obtains an adapter, so no
 * feature ever names a concrete implementation. Re-exported here rather than only from
 * `./factory` so `import { createStorageAdapter } from '@qmulate/storage'` is the one obvious
 * door. See `src/factory.ts` for why an unknown driver THROWS instead of defaulting to memory.
 */
export {
  STORAGE_DRIVERS,
  createStorageAdapter,
  isStorageDriver,
  type StorageAdapterOptions,
  type StorageConfig,
  type StorageDriver,
} from './factory.js';

/** Machine codes for storage failures. Human wording is resolved by callers via `@qmulate/i18n`. */
export type StorageErrorCode =
  /** No object (or no such version) at that key. */
  | 'OBJECT_NOT_FOUND'
  /** Deletion refused: the object is still inside its WORM retention window. */
  | 'RETENTION_LOCKED'
  /** Deletion refused: an active legal hold suspends all deletion. */
  | 'LEGAL_HOLD'
  /** Retention may only move forward; shortening a retention date is refused. */
  | 'RETENTION_SHORTENED'
  /** The key is empty, absolute, or contains traversal segments. */
  | 'INVALID_KEY'
  /** The adapter does not implement this operation (e.g. presigning in the in-memory adapter). */
  | 'NOT_SUPPORTED';

/** Structured, non-PII context attached to a storage failure. */
export type StorageErrorDetails = Readonly<Record<string, unknown>>;

export class StorageError extends Error {
  readonly code: StorageErrorCode;
  readonly messageKey: string;
  readonly details?: StorageErrorDetails;

  constructor(code: StorageErrorCode, message: string, details?: StorageErrorDetails) {
    super(message);
    this.name = 'StorageError';
    this.code = code;
    this.messageKey = `errors.storage.${code}`;
    if (details !== undefined) {
      this.details = details;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Points at a specific object, optionally at a specific version (default: the current one). */
export interface ObjectRef {
  readonly key: string;
  readonly versionId?: string;
}

export interface PutObjectInput {
  readonly key: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  /**
   * BCP-47 language of the stored document. Official financial and legal records are
   * **Arabic-authoritative**, so this is normally `'ar'`.
   */
  readonly contentLanguage?: string;
  /**
   * WORM retention expiry. **Required** — supplied by the caller from the retention `Setting`.
   * ⚠ unverified — the underlying statutory period must be confirmed vs primary law.
   */
  readonly retainUntil: Date;
  /** Start the object under legal hold (suspends deletion irrespective of `retainUntil`). */
  readonly legalHold?: boolean;
  /** Non-PII metadata only. Never put beneficiary identifiers or bank details in here. */
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface StoredObject {
  readonly key: string;
  readonly versionId: string;
  readonly size: number;
  readonly contentType: string;
  readonly contentLanguage?: string;
  /** Integrity digest, hex-encoded. Lets the caller prove the bytes were not altered. */
  readonly checksumSha256: string;
  readonly createdAt: Date;
  readonly retainUntil: Date;
  readonly legalHold: boolean;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface PresignInput extends ObjectRef {
  /** Signed-URL lifetime. Keep it short; the URL is a bearer credential for the bytes. */
  readonly expiresInSeconds: number;
  /** Filename offered to the browser in `Content-Disposition`. */
  readonly downloadFilename?: string;
}

export interface PresignedUrl {
  readonly url: string;
  readonly expiresAt: Date;
  readonly method: 'GET';
}

export interface SetRetentionInput extends ObjectRef {
  /** New expiry. Must be **at or after** the current one — retention never shortens. */
  readonly retainUntil?: Date;
  /** Place (`true`) or release (`false`) the legal hold. Release is an authority-gated action upstream. */
  readonly legalHold?: boolean;
}

export interface DeleteObjectInput extends ObjectRef {
  /**
   * Evaluation instant for the retention check. Injected rather than read from the clock so
   * retention behaviour is deterministic and testable.
   */
  readonly asOf: Date;
  /** Why this object is being erased. Recorded by the caller in the audit trail. */
  readonly reason: string;
}

/**
 * The vault boundary.
 *
 * Implementations must enforce retention and legal hold **themselves** — a caller must not be
 * able to erase a record inside its window by passing the right flag. There is intentionally no
 * "force" parameter on `delete`.
 */
export interface StorageAdapter {
  /** Write a new version of an object. Never overwrites a prior version in place. */
  put(input: PutObjectInput): Promise<StoredObject>;

  /** Read an object's bytes plus its metadata. */
  get(ref: ObjectRef): Promise<{ object: StoredObject; body: Uint8Array }>;

  /** Metadata only; `null` when absent. */
  head(ref: ObjectRef): Promise<StoredObject | null>;

  /** All retained versions of a key, newest first. */
  listVersions(key: string): Promise<StoredObject[]>;

  /** Issue a short-lived signed read URL. Callers audit the read; this layer does not. */
  presign(input: PresignInput): Promise<PresignedUrl>;

  /** Extend retention and/or set the legal hold. Refuses to shorten retention. */
  setRetention(input: SetRetentionInput): Promise<StoredObject>;

  /**
   * The controlled-deletion path — the **only** way bytes ever leave the vault.
   *
   * Throws `RETENTION_LOCKED` inside the retention window and `LEGAL_HOLD` while a hold is
   * active. PDPL erasure requests come through here and are reconciled against the statutory
   * retention duty, which overrides an erasure request for records the law requires QMULATE to keep.
   */
  delete(input: DeleteObjectInput): Promise<void>;
}

function assertValidKey(key: string): void {
  const invalid = key.length === 0 || key.startsWith('/') || key.split('/').includes('..');
  if (invalid) {
    throw new StorageError(
      'INVALID_KEY',
      'Object key must be a non-empty relative path with no ".." segments.',
      { key },
    );
  }
}

function sha256Hex(body: Uint8Array): string {
  return createHash('sha256').update(body).digest('hex');
}

/**
 * Run a synchronous implementation as a promise.
 *
 * A guard failure must **reject** the returned promise, not throw synchronously out of a
 * promise-returning method — otherwise `adapter.delete(...).catch(...)` silently misses the
 * retention-lock error.
 */
function settle<T>(compute: () => T): Promise<T> {
  try {
    return Promise.resolve(compute());
  } catch (error: unknown) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

export interface InMemoryStorageOptions {
  /** Injected clock, so tests are deterministic. Defaults to the real clock. */
  readonly now?: () => Date;
  /** Prefix used to build the fake presigned URLs. */
  readonly urlPrefix?: string;
}

/**
 * In-memory `StorageAdapter` for local development and tests.
 *
 * It enforces the same retention and legal-hold rules as the real adapter — that is the point:
 * a test proving deletion is refused inside the window must exercise the same guard the
 * production vault uses. It is **not** durable and its `presign` URLs are not real credentials,
 * so it must never back a deployed environment.
 */
export class InMemoryStorageAdapter implements StorageAdapter {
  readonly #versions = new Map<string, StoredObject[]>();
  readonly #bodies = new Map<string, Uint8Array>();
  readonly #now: () => Date;
  readonly #urlPrefix: string;

  constructor(options: InMemoryStorageOptions = {}) {
    this.#now = options.now ?? ((): Date => new Date());
    this.#urlPrefix = options.urlPrefix ?? 'memory://qmulate-vault';
  }

  put(input: PutObjectInput): Promise<StoredObject> {
    return settle(() => this.#put(input));
  }

  get(ref: ObjectRef): Promise<{ object: StoredObject; body: Uint8Array }> {
    return settle(() => this.#get(ref));
  }

  head(ref: ObjectRef): Promise<StoredObject | null> {
    return settle(() => this.#find(ref) ?? null);
  }

  listVersions(key: string): Promise<StoredObject[]> {
    return settle(() => [...(this.#versions.get(key) ?? [])]);
  }

  presign(input: PresignInput): Promise<PresignedUrl> {
    return settle(() => this.#presign(input));
  }

  setRetention(input: SetRetentionInput): Promise<StoredObject> {
    return settle(() => this.#setRetention(input));
  }

  delete(input: DeleteObjectInput): Promise<void> {
    return settle(() => {
      this.#delete(input);
    });
  }

  /** Test helper — drops everything. Not part of `StorageAdapter`. */
  clear(): void {
    this.#versions.clear();
    this.#bodies.clear();
  }

  #put(input: PutObjectInput): StoredObject {
    assertValidKey(input.key);

    const existing = this.#versions.get(input.key) ?? [];
    const versionId = `v${String(existing.length + 1)}`;
    const body = input.body.slice();

    const stored: StoredObject = {
      key: input.key,
      versionId,
      size: body.byteLength,
      contentType: input.contentType,
      ...(input.contentLanguage !== undefined ? { contentLanguage: input.contentLanguage } : {}),
      checksumSha256: sha256Hex(body),
      createdAt: this.#now(),
      retainUntil: input.retainUntil,
      legalHold: input.legalHold ?? false,
      metadata: { ...(input.metadata ?? {}) },
    };

    this.#versions.set(input.key, [stored, ...existing]);
    this.#bodies.set(this.#bodyKey(input.key, versionId), body);
    return stored;
  }

  #get(ref: ObjectRef): { object: StoredObject; body: Uint8Array } {
    const object = this.#require(ref);
    const body = this.#bodies.get(this.#bodyKey(object.key, object.versionId));
    if (body === undefined) {
      throw new StorageError('OBJECT_NOT_FOUND', 'Object metadata exists but its bytes do not.', {
        key: ref.key,
      });
    }
    return { object, body: body.slice() };
  }

  #presign(input: PresignInput): PresignedUrl {
    const object = this.#require(input);
    const expiresAt = new Date(this.#now().getTime() + input.expiresInSeconds * 1000);
    const query = new URLSearchParams({
      versionId: object.versionId,
      expiresAt: expiresAt.toISOString(),
      ...(input.downloadFilename !== undefined ? { filename: input.downloadFilename } : {}),
    });
    return {
      url: `${this.#urlPrefix}/${object.key}?${query.toString()}`,
      expiresAt,
      method: 'GET',
    };
  }

  #setRetention(input: SetRetentionInput): StoredObject {
    const object = this.#require(input);

    const shortening =
      input.retainUntil !== undefined && input.retainUntil.getTime() < object.retainUntil.getTime();
    if (shortening) {
      throw new StorageError(
        'RETENTION_SHORTENED',
        'Retention may be extended but never shortened.',
        {
          key: object.key,
          current: object.retainUntil.toISOString(),
          requested: input.retainUntil?.toISOString(),
        },
      );
    }

    const updated: StoredObject = {
      ...object,
      retainUntil: input.retainUntil ?? object.retainUntil,
      legalHold: input.legalHold ?? object.legalHold,
    };

    const versions = this.#versions.get(object.key) ?? [];
    this.#versions.set(
      object.key,
      versions.map((version) => (version.versionId === object.versionId ? updated : version)),
    );
    return updated;
  }

  #delete(input: DeleteObjectInput): void {
    const object = this.#require(input);

    if (object.legalHold) {
      throw new StorageError(
        'LEGAL_HOLD',
        'An active legal hold suspends deletion of this object.',
        { key: object.key, versionId: object.versionId },
      );
    }

    if (input.asOf.getTime() < object.retainUntil.getTime()) {
      throw new StorageError(
        'RETENTION_LOCKED',
        'Object is inside its retention window and cannot be deleted.',
        {
          key: object.key,
          versionId: object.versionId,
          retainUntil: object.retainUntil.toISOString(),
        },
      );
    }

    const versions = (this.#versions.get(object.key) ?? []).filter(
      (version) => version.versionId !== object.versionId,
    );
    if (versions.length === 0) {
      this.#versions.delete(object.key);
    } else {
      this.#versions.set(object.key, versions);
    }
    this.#bodies.delete(this.#bodyKey(object.key, object.versionId));
  }

  #bodyKey(key: string, versionId: string): string {
    return `${key}#${versionId}`;
  }

  #find(ref: ObjectRef): StoredObject | undefined {
    const versions = this.#versions.get(ref.key) ?? [];
    if (ref.versionId === undefined) {
      return versions[0];
    }
    return versions.find((version) => version.versionId === ref.versionId);
  }

  #require(ref: ObjectRef): StoredObject {
    const object = this.#find(ref);
    if (object === undefined) {
      throw new StorageError('OBJECT_NOT_FOUND', 'No such object or version in the vault.', {
        key: ref.key,
        ...(ref.versionId !== undefined ? { versionId: ref.versionId } : {}),
      });
    }
    return object;
  }
}
