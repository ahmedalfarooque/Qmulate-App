// QMULATE — `createStorageAdapter` (E2's storage seam).
//
// THE ASSERTION THAT MATTERS MOST is the fail-closed one: an unrecognised driver THROWS rather
// than falling back to the in-memory adapter. A deployed environment silently backed by a
// non-durable store accepts every write and loses the vault on restart, with no error to notice —
// so `driver: 'minio'` (a realistic typo, since MinIO IS the dev endpoint) must be a loud failure.
//
// `mutationToVerify` for each test is written in the `it` name where it is not obvious.

import { describe, expect, it } from 'vitest';

import {
  InMemoryStorageAdapter,
  STORAGE_DRIVERS,
  StorageError,
  createStorageAdapter,
  isStorageDriver,
  type StorageConfig,
} from '../src/index.js';

/** The one place this suite spells a retention date. Far future so nothing is deletable. */
const RETAIN_UNTIL = new Date('2040-01-01T00:00:00.000Z');

function codeOf(run: () => unknown): { code: string | null; message: string } {
  try {
    run();
    return { code: null, message: 'did not throw' };
  } catch (error: unknown) {
    return {
      code: error instanceof StorageError ? error.code : `not-a-StorageError:${String(error)}`,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

describe('STORAGE_DRIVERS / isStorageDriver', () => {
  it('is a closed list of exactly the two drivers E2 knows about', () => {
    expect([...STORAGE_DRIVERS]).toEqual(['memory', 's3']);
  });

  it('refuses every near-miss: wrong case, MinIO, empty, null, non-string', () => {
    for (const value of ['S3', 'Memory', 'minio', 'MinIO', '', ' memory', 'memory ', 'gcs']) {
      expect(isStorageDriver(value), `${JSON.stringify(value)} must not narrow`).toBe(false);
    }
    for (const value of [null, undefined, 0, 1, {}, [], true]) {
      expect(isStorageDriver(value)).toBe(false);
    }
    expect(isStorageDriver('memory')).toBe(true);
    expect(isStorageDriver('s3')).toBe(true);
  });
});

describe('createStorageAdapter — the memory driver', () => {
  it('returns a WORKING adapter, not merely an object with the right methods', async () => {
    const adapter = createStorageAdapter({ driver: 'memory' });
    expect(adapter).toBeInstanceOf(InMemoryStorageAdapter);

    const stored = await adapter.put({
      key: 'waqf-001/deeds/sakk.pdf',
      body: new TextEncoder().encode('نسخة وهمية'),
      contentType: 'application/pdf',
      contentLanguage: 'ar',
      retainUntil: RETAIN_UNTIL,
    });
    expect(stored.versionId).toBe('v1');

    const read = await adapter.get({ key: 'waqf-001/deeds/sakk.pdf' });
    expect(new TextDecoder().decode(read.body)).toBe('نسخة وهمية');
  });

  it('honours an injected clock, so retention assertions are deterministic', async () => {
    const frozen = new Date('2026-07-27T00:00:00.000Z');
    const adapter = createStorageAdapter({ driver: 'memory' }, { now: () => frozen });

    const stored = await adapter.put({
      key: 'a/b.pdf',
      body: new Uint8Array([1]),
      contentType: 'application/pdf',
      retainUntil: RETAIN_UNTIL,
    });
    expect(stored.createdAt.toISOString()).toBe(frozen.toISOString());
  });

  it('honours an injected URL prefix in the (fake) presigned URL', async () => {
    const adapter = createStorageAdapter(
      { driver: 'memory' },
      { urlPrefix: 'memory://test-vault' },
    );
    await adapter.put({
      key: 'a/b.pdf',
      body: new Uint8Array([1]),
      contentType: 'application/pdf',
      retainUntil: RETAIN_UNTIL,
    });
    const signed = await adapter.presign({ key: 'a/b.pdf', expiresInSeconds: 60 });
    expect(signed.url.startsWith('memory://test-vault/')).toBe(true);
  });

  it('ignores bucket/endpoint/region — they belong to s3, not memory', () => {
    const adapter = createStorageAdapter({
      driver: 'memory',
      bucket: 'ignored',
      endpoint: 'http://localhost:9000',
      region: 'me-south-1',
    });
    expect(adapter).toBeInstanceOf(InMemoryStorageAdapter);
  });
});

describe('createStorageAdapter — the s3 driver is NOT_SUPPORTED until the named gate', () => {
  it('throws NOT_SUPPORTED for a well-formed s3 config, naming the gate it is owed to', () => {
    const result = codeOf(() =>
      createStorageAdapter({
        driver: 's3',
        bucket: 'qmulate-vault',
        region: 'me-south-1',
        endpoint: 'https://s3.example.test',
      }),
    );
    expect(result.code).toBe('NOT_SUPPORTED');
    // Was `toContain('E9')` until the owner's ruling (2026-09-01, option C) moved the S3 adapter
    // off S10/E9 to the named gate — before the first client migration. The message must name
    // that gate, because a developer reads this error at the moment they wonder where S3 went.
    expect(result.message).toContain('before the first client migration');
    // The message must NOT read like a mis-configuration when the config is fine.
    expect(result.message).not.toContain('missing');
  });

  it('names the missing fields when the s3 config is also incomplete', () => {
    const result = codeOf(() => createStorageAdapter({ driver: 's3' }));
    expect(result.code).toBe('NOT_SUPPORTED');
    expect(result.message).toContain('bucket');
    expect(result.message).toContain('region');
  });

  it('treats a blank bucket as missing rather than as present', () => {
    const result = codeOf(() =>
      createStorageAdapter({ driver: 's3', bucket: '   ', region: 'me-south-1' }),
    );
    expect(result.code).toBe('NOT_SUPPORTED');
    expect(result.message).toContain('bucket');
  });
});

describe('createStorageAdapter — FAIL CLOSED on an unknown driver', () => {
  // mutationToVerify: in factory.ts, replace the `!isStorageDriver(driver)` throw with
  // `return new InMemoryStorageAdapter()`. Every assertion in this describe goes red.
  it('THROWS for every unrecognised driver and never returns an adapter', () => {
    const candidates: unknown[] = [
      'minio',
      'MinIO',
      'S3',
      'Memory',
      'gcs',
      'azure',
      '',
      ' memory',
      'memory ',
      null,
      undefined,
      0,
      {},
      [],
      true,
    ];

    for (const driver of candidates) {
      const result = codeOf(() => createStorageAdapter({ driver } as unknown as StorageConfig));
      expect(result.code, `driver ${JSON.stringify(driver)} must be refused`).toBe('NOT_SUPPORTED');
      expect(result.message).toContain('never falls back');
    }
  });

  it('THROWS when the config object itself is absent', () => {
    for (const config of [null, undefined, 'memory', 42]) {
      const result = codeOf(() => createStorageAdapter(config as unknown as StorageConfig));
      expect(result.code).toBe('NOT_SUPPORTED');
    }
  });

  it('reports the offending value as data, not as prose', () => {
    try {
      createStorageAdapter({ driver: 'minio' } as unknown as StorageConfig);
      expect.unreachable('should have thrown');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(StorageError);
      const storageError = error as StorageError;
      expect(storageError.details?.['driver']).toBe('minio');
      expect(storageError.messageKey).toBe('errors.storage.NOT_SUPPORTED');
    }
  });
});
