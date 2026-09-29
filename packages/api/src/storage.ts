/**
 * The api's ONE storage adapter instance.  (S10/T3)
 *
 * Driver comes from `STORAGE_DRIVER` and defaults to `memory` — the dev/CI adapter that
 * contract-implements the retention semantics (extend-never-shorten, hold-outlives-window,
 * delete-inside-window refused). ⚠ THE CLAIM BOUNDARY, stated where the instance is made:
 * "retrievable" is proven against the storage INTERFACE CONTRACT via this adapter, not against
 * S3 — the S3 adapter and its object-lock proof are owed to the named gate (before the first
 * client migration; owner ruling 2026-09-01, option C), and `createStorageAdapter` THROWS
 * `NOT_SUPPORTED` for `driver: 's3'` today rather than pretending.
 *
 * Module-scope memo is deliberate here (unlike Settings, which must never be cached): the
 * adapter is a connection-shaped resource, not a value someone updates in the database.
 */

import { createStorageAdapter, type StorageAdapter } from '@qmulate/storage';

let adapter: StorageAdapter | null = null;

export function getStorageAdapter(): StorageAdapter {
  if (adapter === null) {
    const driver = process.env.STORAGE_DRIVER?.trim() || 'memory';
    adapter = createStorageAdapter({ driver: driver as never });
  }
  return adapter;
}
