/**
 * packages/database/src/self-approval-exemption.ts — the fixture-only self-approval exemption,
 * READ from and WRITTEN to the database (migration 54).
 *
 * Maker ≠ checker is a database rule; so is its one exception. Nothing here decides who is exempt:
 * the reader asks `qmulate_self_approval_exempt(userId)`, which reads the per-database setting
 * `qmulate.dev_admin_self_approval_user_id` straight from `pg_db_role_setting` — a value only the
 * database OWNER or a superuser can write (`ALTER DATABASE … SET`), and one a session-level `SET`
 * cannot imitate. The TypeScript pre-checks that mirror the SQL rule (`withReservedMatter`, the
 * distribution executor, the segregation rung) call the reader so they agree with the CHECK
 * constraint instead of refusing a row the database would accept.
 *
 * The writer exists for ONE caller — `packages/auth/scripts/dev-admin-setup.ts`, a provisioning
 * program that refuses to start outside `DATA_CLASSIFICATION=fixture-only`. It is raw SQL over a
 * dedicated connection, deliberately: the fact lives in the catalog, has no Prisma model, and is
 * written with a privilege no application connection holds.
 */

import { Client } from 'pg';

export const SELF_APPROVAL_EXEMPTION_SETTING = 'qmulate.dev_admin_self_approval_user_id';

interface RawQueryable {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
}

/** True only when the database names `userId` as its (single) self-approval-exempt user. */
export async function isSelfApprovalExempt(
  db: RawQueryable,
  userId: string | null,
): Promise<boolean> {
  if (userId === null || userId.trim() === '') return false;
  const rows = await db.$queryRaw<{ exempt: boolean }[]>`
    SELECT qmulate_self_approval_exempt(${userId}) AS exempt
  `;
  return rows[0]?.exempt === true;
}

/** Postgres refuses `ALTER DATABASE` to a non-owner with 42501. */
function isPrivilegeRefusal(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === '42501' || /must be owner|permission denied/i.test(String(error));
}

/**
 * Names `userId` as THE self-approval-exempt user of the connected database, or clears it
 * (`userId === null`). Tries `primaryUrl` (the migrator) first; the migrator owns the schema, not
 * the database, so on a privilege refusal it retries on `fallbackUrl` (the platform superuser)
 * when one is given. Returns which connection performed the write. Never logs the URLs.
 */
export async function recordSelfApprovalExemption(
  userId: string | null,
  urls: { readonly primaryUrl: string; readonly fallbackUrl?: string | undefined },
): Promise<'primary' | 'fallback'> {
  const run = async (connectionString: string): Promise<void> => {
    const client = new Client({ connectionString });
    await client.connect();
    try {
      const { rows } = await client.query<{ db: string }>('SELECT current_database() AS db');
      const database = client.escapeIdentifier(rows[0]?.db ?? '');
      await client.query(
        userId === null
          ? `ALTER DATABASE ${database} RESET ${SELF_APPROVAL_EXEMPTION_SETTING}`
          : `ALTER DATABASE ${database} SET ${SELF_APPROVAL_EXEMPTION_SETTING} = ${client.escapeLiteral(userId)}`,
      );
    } finally {
      await client.end();
    }
  };

  try {
    await run(urls.primaryUrl);
    return 'primary';
  } catch (error: unknown) {
    if (urls.fallbackUrl === undefined || urls.fallbackUrl === '' || !isPrivilegeRefusal(error)) {
      throw error;
    }
    await run(urls.fallbackUrl);
    return 'fallback';
  }
}
