// QMULATE — `InMemoryStorageAdapter`: the WORM / retention / legal-hold semantics.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS SUITE EXISTS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The adapter shipped in Sprint 1 with the retention window, the legal hold, the
// "retention extends but never shortens" rule and the version history all implemented — and
// **zero tests**, because `packages/storage` had no `test` script and no vitest config at all.
// An unenforced guard and an untested one are the same thing to an auditor.
//
// These rules are not incidental to the in-memory adapter: PRD §12 requires the real vault to
// enforce them under S3 object-lock in compliance mode, and the in-memory adapter exists so a
// test proving "deletion is refused inside the window" exercises the SAME guard shape production
// will. If this suite is green and the S3 adapter (owed to the named gate — before the first
// client migration, owner ruling 2026-09-01 (C); this line said "S10/E9" until that ruling
// re-dated it) disagrees, that is a bug in the S3
// adapter — which is only detectable because the contract is pinned here first.
//
// ⚠ unverified — confirm vs primary law: the >= 10-year retention period behind every
// `retainUntil` below is UNVERIFIED against primary Saudi law. That is exactly why the adapter
// hardcodes no default period and `retainUntil` is a required caller-supplied value read from a
// `Setting`. Nothing in this file asserts a number of years.

import { describe, expect, it } from 'vitest';

import { InMemoryStorageAdapter, StorageError, createStorageAdapter } from '../src/index.js';

const NOW = new Date('2026-07-27T00:00:00.000Z');
const INSIDE_WINDOW = new Date('2030-01-01T00:00:00.000Z');
const AFTER_WINDOW = new Date('2041-01-01T00:00:00.000Z');
const RETAIN_UNTIL = new Date('2040-01-01T00:00:00.000Z');

function adapter(): InMemoryStorageAdapter {
  return new InMemoryStorageAdapter({ now: () => NOW, urlPrefix: 'memory://test-vault' });
}

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

/**
 * Reports the rejection CODE rather than letting `rejects.toThrow()` serialize the value.
 *
 * Same technique owner-C adopted after a diff serializer took a worker down: an assertion whose
 * failure you cannot read is not a verified assertion.
 */
async function rejectionCode(run: () => Promise<unknown>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error: unknown) {
    return error instanceof StorageError ? error.code : `not-a-StorageError:${String(error)}`;
  }
}

async function put(
  store: InMemoryStorageAdapter,
  overrides: {
    key?: string;
    body?: string;
    retainUntil?: Date;
    legalHold?: boolean;
  } = {},
): Promise<{ key: string; versionId: string }> {
  const key = overrides.key ?? 'waqf-001/deeds/sakk.pdf';
  const stored = await store.put({
    key,
    body: bytes(overrides.body ?? 'صك وقفية (بيانات وهمية)'),
    contentType: 'application/pdf',
    contentLanguage: 'ar',
    retainUntil: overrides.retainUntil ?? RETAIN_UNTIL,
    ...(overrides.legalHold !== undefined ? { legalHold: overrides.legalHold } : {}),
  });
  return { key, versionId: stored.versionId };
}

describe('put / get — the bytes and their integrity digest', () => {
  it('stores Arabic-authoritative content and returns a sha256 the caller can verify', async () => {
    const store = adapter();
    const stored = await store.put({
      key: 'waqf-001/financials/2026.pdf',
      body: bytes('بيان مالي وهمي'),
      contentType: 'application/pdf',
      contentLanguage: 'ar',
      retainUntil: RETAIN_UNTIL,
    });

    expect(stored.contentLanguage).toBe('ar');
    expect(stored.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(stored.legalHold).toBe(false);
    expect(stored.createdAt.toISOString()).toBe(NOW.toISOString());

    const read = await store.get({ key: 'waqf-001/financials/2026.pdf' });
    expect(new TextDecoder().decode(read.body)).toBe('بيان مالي وهمي');
    expect(read.object.checksumSha256).toBe(stored.checksumSha256);
  });

  it('COPIES the caller buffer, so a later mutation cannot rewrite stored bytes', async () => {
    const store = adapter();
    const body = bytes('original');
    await store.put({
      key: 'a/b.txt',
      body,
      contentType: 'text/plain',
      retainUntil: RETAIN_UNTIL,
    });

    body.fill(0);

    const read = await store.get({ key: 'a/b.txt' });
    expect(new TextDecoder().decode(read.body)).toBe('original');
  });

  it('returns OBJECT_NOT_FOUND for an absent key and for an absent version', async () => {
    const store = adapter();
    await put(store);

    expect(await rejectionCode(() => store.get({ key: 'nope' }))).toBe('OBJECT_NOT_FOUND');
    expect(
      await rejectionCode(() => store.get({ key: 'waqf-001/deeds/sakk.pdf', versionId: 'v99' })),
    ).toBe('OBJECT_NOT_FOUND');
    expect(await store.head({ key: 'nope' })).toBeNull();
  });

  it('refuses an absolute key and a traversal segment (INVALID_KEY)', async () => {
    const store = adapter();
    for (const key of ['', '/etc/passwd', 'a/../../secret', '..']) {
      expect(
        await rejectionCode(() =>
          store.put({
            key,
            body: bytes('x'),
            contentType: 'text/plain',
            retainUntil: RETAIN_UNTIL,
          }),
        ),
        `key ${JSON.stringify(key)} must be refused`,
      ).toBe('INVALID_KEY');
    }
  });

  it('REJECTS rather than throwing synchronously — `.catch()` must see the guard', async () => {
    const store = adapter();
    // If a guard threw synchronously out of a promise-returning method, this would blow up before
    // `.catch` was attached and the retention error would escape every caller that used `.catch`.
    let caught: unknown = null;
    const promise = store.put({
      key: '',
      body: bytes('x'),
      contentType: 'text/plain',
      retainUntil: RETAIN_UNTIL,
    });
    expect(promise).toBeInstanceOf(Promise);
    await promise.catch((error: unknown) => {
      caught = error;
    });
    expect(caught).toBeInstanceOf(StorageError);
  });
});

describe('versioning — superseding never overwrites', () => {
  it('writes a new version and retains the prior one, newest first', async () => {
    const store = adapter();
    await put(store, { body: 'v1 body' });
    await put(store, { body: 'v2 body' });

    const versions = await store.listVersions('waqf-001/deeds/sakk.pdf');
    expect(versions.map((version) => version.versionId)).toEqual(['v2', 'v1']);

    const current = await store.get({ key: 'waqf-001/deeds/sakk.pdf' });
    expect(new TextDecoder().decode(current.body)).toBe('v2 body');

    const prior = await store.get({ key: 'waqf-001/deeds/sakk.pdf', versionId: 'v1' });
    expect(new TextDecoder().decode(prior.body)).toBe('v1 body');
  });

  it('lists nothing for a key that was never written (no throw, empty list)', async () => {
    expect(await adapter().listVersions('never/written')).toEqual([]);
  });
});

describe('retention — extends, NEVER shortens', () => {
  it('extends retention forward', async () => {
    const store = adapter();
    await put(store);
    const extended = await store.setRetention({
      key: 'waqf-001/deeds/sakk.pdf',
      retainUntil: new Date('2045-01-01T00:00:00.000Z'),
    });
    expect(extended.retainUntil.toISOString()).toBe('2045-01-01T00:00:00.000Z');
  });

  // mutationToVerify: in InMemoryStorageAdapter#setRetention, drop the `shortening` guard.
  it('REFUSES a shorter retention date with RETENTION_SHORTENED', async () => {
    const store = adapter();
    await put(store);
    expect(
      await rejectionCode(() =>
        store.setRetention({
          key: 'waqf-001/deeds/sakk.pdf',
          retainUntil: new Date('2027-01-01T00:00:00.000Z'),
        }),
      ),
    ).toBe('RETENTION_SHORTENED');

    // And the stored date is UNCHANGED — a refused shortening must not half-apply.
    const head = await store.head({ key: 'waqf-001/deeds/sakk.pdf' });
    expect(head?.retainUntil.toISOString()).toBe(RETAIN_UNTIL.toISOString());
  });

  it('treats an equal date as a no-op rather than as a shortening', async () => {
    const store = adapter();
    await put(store);
    const same = await store.setRetention({
      key: 'waqf-001/deeds/sakk.pdf',
      retainUntil: new Date(RETAIN_UNTIL.getTime()),
    });
    expect(same.retainUntil.toISOString()).toBe(RETAIN_UNTIL.toISOString());
  });

  it('leaves retention alone when only the legal hold is being set', async () => {
    const store = adapter();
    await put(store);
    const held = await store.setRetention({ key: 'waqf-001/deeds/sakk.pdf', legalHold: true });
    expect(held.legalHold).toBe(true);
    expect(held.retainUntil.toISOString()).toBe(RETAIN_UNTIL.toISOString());
  });
});

describe('delete — the ONLY way bytes leave the vault', () => {
  // mutationToVerify: in #delete, drop the `input.asOf < object.retainUntil` guard.
  it('REFUSES deletion inside the retention window (RETENTION_LOCKED)', async () => {
    const store = adapter();
    await put(store);
    expect(
      await rejectionCode(() =>
        store.delete({
          key: 'waqf-001/deeds/sakk.pdf',
          asOf: INSIDE_WINDOW,
          reason: 'PDPL erasure request (fixture)',
        }),
      ),
    ).toBe('RETENTION_LOCKED');

    // Still there. A refused deletion that removed the bytes anyway would be the worst outcome.
    expect(await store.head({ key: 'waqf-001/deeds/sakk.pdf' })).not.toBeNull();
  });

  // mutationToVerify: in #delete, drop the `object.legalHold` guard.
  it('REFUSES deletion under a legal hold even AFTER the retention window (LEGAL_HOLD)', async () => {
    const store = adapter();
    await put(store, { legalHold: true });
    expect(
      await rejectionCode(() =>
        store.delete({
          key: 'waqf-001/deeds/sakk.pdf',
          asOf: AFTER_WINDOW,
          reason: 'retention elapsed (fixture)',
        }),
      ),
    ).toBe('LEGAL_HOLD');
    expect(await store.head({ key: 'waqf-001/deeds/sakk.pdf' })).not.toBeNull();
  });

  it('checks the legal hold BEFORE the retention window, so the stronger rule wins', async () => {
    const store = adapter();
    await put(store, { legalHold: true });
    // Inside the window AND under hold: the hold is the outliving control, so it is the one
    // reported. A caller who releases the hold must still wait out retention.
    expect(
      await rejectionCode(() =>
        store.delete({
          key: 'waqf-001/deeds/sakk.pdf',
          asOf: INSIDE_WINDOW,
          reason: 'both guards active (fixture)',
        }),
      ),
    ).toBe('LEGAL_HOLD');
  });

  it('deletes exactly one version once retention has elapsed and no hold is active', async () => {
    const store = adapter();
    await put(store, { body: 'v1' });
    await put(store, { body: 'v2' });

    await store.delete({
      key: 'waqf-001/deeds/sakk.pdf',
      versionId: 'v1',
      asOf: AFTER_WINDOW,
      reason: 'controlled deletion (fixture)',
    });

    const versions = await store.listVersions('waqf-001/deeds/sakk.pdf');
    expect(versions.map((version) => version.versionId)).toEqual(['v2']);
    expect(
      await rejectionCode(() => store.get({ key: 'waqf-001/deeds/sakk.pdf', versionId: 'v1' })),
    ).toBe('OBJECT_NOT_FOUND');
  });

  it('drops the key entirely when its last version is deleted', async () => {
    const store = adapter();
    await put(store);
    await store.delete({
      key: 'waqf-001/deeds/sakk.pdf',
      asOf: AFTER_WINDOW,
      reason: 'controlled deletion (fixture)',
    });
    expect(await store.listVersions('waqf-001/deeds/sakk.pdf')).toEqual([]);
  });

  it('has NO force flag — the interface does not let a caller opt out of retention', () => {
    // A TYPE-LEVEL assertion, deliberately: the guard cannot be bypassed because there is no
    // parameter through which to ask. `DeleteObjectInput` carries `key`/`versionId`/`asOf`/`reason`
    // and nothing else, so the object literal below — which `satisfies` the real parameter type —
    // stops compiling the moment someone adds a `force`-shaped escape hatch and starts passing it.
    // ⚠ REPORTED, NOT SILENTLY ACCEPTED: the stronger form of this assertion is a
    // `@ts-expect-error` on `{ ...input, force: true }`, which would fail `tsc --noEmit` the moment
    // such a flag existed. It is NOT written here because `packages/storage/tsconfig.json` includes
    // `src/**/*.ts` only, so no test file in this package is typechecked at all — a `@ts-expect-error`
    // here would be a directive nobody evaluates, i.e. a claim with no enforcement, which is the
    // exact Sprint-1 failure mode this sprint exists to stop. Widening that `include` to cover
    // `test/**/*.ts` is a one-line change to a file owner-D does not own.
    const input = {
      key: 'waqf-001/deeds/sakk.pdf',
      asOf: NOW,
      reason: 'controlled deletion (fixture)',
    } satisfies Parameters<InMemoryStorageAdapter['delete']>[0];

    expect(Object.keys(input)).toEqual(['key', 'asOf', 'reason']);
  });
});

describe('presign — a short-lived bearer credential, not a proxy', () => {
  it('issues a URL that expires at now + expiresInSeconds', async () => {
    const store = adapter();
    await put(store);
    const signed = await store.presign({
      key: 'waqf-001/deeds/sakk.pdf',
      expiresInSeconds: 300,
      downloadFilename: 'sakk.pdf',
    });

    expect(signed.method).toBe('GET');
    expect(signed.expiresAt.toISOString()).toBe(new Date(NOW.getTime() + 300_000).toISOString());
    expect(signed.url).toContain('memory://test-vault/waqf-001/deeds/sakk.pdf');
    expect(signed.url).toContain('versionId=v1');
  });

  it('refuses to presign an object that does not exist', async () => {
    expect(
      await rejectionCode(() => adapter().presign({ key: 'nope', expiresInSeconds: 60 })),
    ).toBe('OBJECT_NOT_FOUND');
  });
});

describe('the factory and the class agree', () => {
  it('createStorageAdapter({driver:"memory"}) enforces the SAME retention guard', async () => {
    const store = createStorageAdapter({ driver: 'memory' }, { now: () => NOW });
    await store.put({
      key: 'a/b.pdf',
      body: bytes('x'),
      contentType: 'application/pdf',
      retainUntil: RETAIN_UNTIL,
    });
    expect(
      await rejectionCode(() =>
        store.delete({ key: 'a/b.pdf', asOf: INSIDE_WINDOW, reason: 'fixture' }),
      ),
    ).toBe('RETENTION_LOCKED');
  });
});
