/**
 * QMULATE — a plain reachability probe for the configured database.
 *
 * Uses `pg` directly (no Prisma handle, no audit spine, no scoping): the question is only "is the
 * server named by this URL answering?", asked at web start-up and by `pnpm dev:health`, so that a
 * local app pointed at a port nothing listens on says SO — instead of every sign-in collapsing
 * into "email or password is incorrect". The result never carries credentials.
 */
import { Client } from 'pg';

export interface DatabaseProbe {
  readonly ok: boolean;
  /** `host:port/database` of the URL that was probed — never the user or password. */
  readonly target: string;
  /** The pg/Node error code when `ok` is false (ECONNREFUSED, ETIMEDOUT, 28P01, 3D000 …). */
  readonly code: string | null;
  readonly message: string | null;
}

export function describeDatabaseTarget(url: string | undefined): string {
  if (!url) return '<DATABASE_URL unset>';
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}:${parsed.port || '5432'}${parsed.pathname || ''}`;
  } catch {
    return '<DATABASE_URL unparseable>';
  }
}

export async function probeDatabase(
  url: string | undefined = process.env.DATABASE_URL,
  timeoutMs = 4000,
): Promise<DatabaseProbe> {
  const target = describeDatabaseTarget(url);
  if (!url) return { ok: false, target, code: 'UNSET', message: 'DATABASE_URL is not set' };
  const client = new Client({ connectionString: url, connectionTimeoutMillis: timeoutMs, statement_timeout: timeoutMs });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return { ok: true, target, code: null, message: null };
  } catch (error) {
    const e = error as { code?: unknown; message?: unknown };
    return {
      ok: false,
      target,
      code: typeof e.code === 'string' ? e.code : null,
      message: typeof e.message === 'string' ? e.message.split('\n')[0] ?? null : null,
    };
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** True when the error is a connection-level failure (server down, wrong port, DNS, timeout). */
export function isConnectionFailure(code: string | null): boolean {
  return code !== null && ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'UNSET', 'P1001', 'P1002', 'P1017'].includes(code);
}
