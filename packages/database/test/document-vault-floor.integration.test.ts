/**
 * S10/T3 — the vault's retention floor, measured to the exit's own wording.
 *
 * ⚠ MOST OF THE FLOOR PREDATES THIS FILE AND IS PROBED ELSEWHERE — say so rather than duplicate:
 * `adversarial-regressions.integration.test.ts` §4 already measures the legal-hold delete
 * refusal, the retention-shorten refusal, the hold-release refusal and the extend-admitted arm;
 * `guard-verb-coverage` carries `document_no_truncate`. The guards themselves are E1's
 * (`document_retention_guard`, hold checked FIRST so it OUTLIVES the window — the storage
 * interface's own word) hardened in migration 4 (C-14: the reserved-matter hatch is
 * artifact-bound to "document:<id>:retentionUntil"/":legalHold"). This file adds ONLY what was
 * unmeasured:
 *
 *   · the EXIT CLAUSE VERBATIM, at the migrator standard: "a delete before the retention window
 *     is refused" — for the OWNER role, because a floor only ordinary callers meet is a policy;
 *   · the SCOPE-HONESTY arm: a post-retention, NON-held delete is ADMITTED by the floor (and
 *     rolled back) — the controlled-deletion workflow is later-epic governance, and a floor
 *     read as more than it is would be the (A)-shaped claim the owner did not choose;
 *   · the HOLD-OUTLIVES-WINDOW composition: past retention AND held → still refused;
 *   · migration 47's CONTENT-IDENTITY freeze: `storageKey` and `sha256` write-once — a
 *     re-pointed key is a swapped document wearing a retained row — while ordinary metadata
 *     stays editable (the control that keeps the freeze from being read as row-wide).
 */

import { afterAll, describe, expect, it } from 'vitest';

import {
  PROBE_BLOCKED,
  PROBE_SUCCEEDED,
  closeDatabase,
  guardProbeSql,
  hasDatabase,
  privilegedPrisma,
  privilegedSql,
  rollbackProbeSql,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S10/T3 (the document vault retention floor)');

/** A document row INSERT as the migrator would write it, with the retention state under test. */
function insertDocument(args: {
  id: string;
  retention: 'future' | 'past';
  legalHold?: boolean;
}): string {
  const until =
    args.retention === 'future' ? `now() + interval '9 years'` : `now() - interval '1 day'`;
  return (
    `INSERT INTO "document" ("id","waqfId","type","titleAr","storageKey","sha256",` +
    `"confidentiality","version","retentionUntil","retentionUntilHijri","legalHold",` +
    `"createdAt","updatedAt") VALUES ('${args.id}','waqf-001','financial',` +
    `'مستند اختبار (وهمي)','probe/${args.id}','${'a'.repeat(64)}','NORMAL',1,${until},` +
    `'1457-01-01',${args.legalHold === true ? 'true' : 'false'},now(),now())`
  );
}

describe.runIf(hasDatabase)("S10/T3 · the vault floor, at the exit's own wording", () => {
  afterAll(async () => {
    await closeDatabase();
  });

  it('EXIT CLAUSE 3, migrator standard: a delete BEFORE the retention window is refused — for the OWNER role', async () => {
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          guardProbeSql(
            `${insertDocument({ id: 'probe-t3-early', retention: 'future' })}; ` +
              `DELETE FROM "document" WHERE "id" = 'probe-t3-early'`,
            'insufficient_privilege',
          ),
        ),
      ),
    ).rejects.toThrow(PROBE_BLOCKED);
  });

  it('SCOPE HONESTY: past retention and NOT held, the floor ADMITS the delete (rolled back) — the workflow above it is later-epic governance', async () => {
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          rollbackProbeSql([
            insertDocument({ id: 'probe-t3-expired', retention: 'past' }),
            `DELETE FROM "document" WHERE "id" = 'probe-t3-expired'`,
          ]),
        ),
      ),
    ).rejects.toThrow(PROBE_SUCCEEDED);
  });

  it('THE HOLD OUTLIVES THE WINDOW: past retention but held → still refused', async () => {
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          guardProbeSql(
            `${insertDocument({ id: 'probe-t3-held', retention: 'past', legalHold: true })}; ` +
              `DELETE FROM "document" WHERE "id" = 'probe-t3-held'`,
            'insufficient_privilege',
          ),
        ),
      ),
    ).rejects.toThrow(PROBE_BLOCKED);
  });

  it('MIGRATION 47: storageKey is write-once — a re-pointed key is a swapped document', async () => {
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          guardProbeSql(
            `${insertDocument({ id: 'probe-t3-key', retention: 'future' })}; ` +
              `UPDATE "document" SET "storageKey" = 'probe/swapped' WHERE "id" = 'probe-t3-key'`,
            'insufficient_privilege',
          ),
        ),
      ),
    ).rejects.toThrow(PROBE_BLOCKED);
  });

  it('MIGRATION 47: sha256 is write-once — a rewritable integrity hash is a decoration', async () => {
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          guardProbeSql(
            `${insertDocument({ id: 'probe-t3-hash', retention: 'future' })}; ` +
              `UPDATE "document" SET "sha256" = '${'b'.repeat(64)}' WHERE "id" = 'probe-t3-hash'`,
            'insufficient_privilege',
          ),
        ),
      ),
    ).rejects.toThrow(PROBE_BLOCKED);
  });

  it('…while ordinary metadata stays editable: the freeze is two columns, not the row', async () => {
    const raw = await privilegedPrisma();
    await expect(
      raw.$executeRawUnsafe(
        privilegedSql(
          rollbackProbeSql([
            insertDocument({ id: 'probe-t3-meta', retention: 'future' }),
            `UPDATE "document" SET "titleEn" = 'Probe title (invented)' WHERE "id" = 'probe-t3-meta'`,
          ]),
        ),
      ),
    ).rejects.toThrow(PROBE_SUCCEEDED);
  });
});
