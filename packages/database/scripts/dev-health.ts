/**
 * QMULATE — `pnpm dev:health`: four facts about the LOCAL development environment, in one screen.
 *
 *   1. Is embedded PostgreSQL listening on 127.0.0.1:<port>?          (TCP)
 *   2. Does the database answer?                                      (SELECT 1 as the owner role)
 *   3. Are the migrations current?                                    (prisma/migrations ⟷ _prisma_migrations)
 *   4. Is the web server answering on <web>/en/sign-in?               (HTTP 200)
 *
 * Exit code 0 only when all four hold. Prints no credentials.
 *   pnpm dev:health                      — defaults: port 54460, web http://localhost:3000
 *   pnpm dev:health -- --port 54470      — another cluster
 */
import { readdirSync } from 'node:fs';
import { createConnection } from 'node:net';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { Client } from 'pg';

const argv = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] !== undefined ? String(argv[i + 1]) : fallback;
};
const port = Number(flag('--port', '54460'));
const web = flag('--web', 'http://localhost:3000').replace(/\/$/, '');
const dbName = flag('--db', 'qmulate_dev');
// dev-postgres provisions the owner role with the cluster's fixture password; both are local-only.
const ownerUrl = `postgresql://qmulate_owner:${flag('--password', 'qmulate')}@127.0.0.1:${port}/${dbName}`;

type Check = { readonly name: string; readonly ok: boolean; readonly detail: string };
const checks: Check[] = [];

function tcp(host: string, p: number, timeoutMs = 2000): Promise<boolean> {
  return new Promise((done) => {
    const socket = createConnection({ host, port: p });
    const finish = (ok: boolean) => { socket.destroy(); done(ok); };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function main(): Promise<void> {
  const listening = await tcp('127.0.0.1', port);
  checks.push({ name: `PostgreSQL listening on 127.0.0.1:${port}`, ok: listening, detail: listening ? 'yes' : 'nothing is listening — run: pnpm dev:local' });

  let applied: string[] = [];
  let reachable = false;
  if (listening) {
    const client = new Client({ connectionString: ownerUrl, connectionTimeoutMillis: 3000 });
    try {
      await client.connect();
      await client.query('SELECT 1');
      reachable = true;
      const rows = await client.query<{ migration_name: string }>(
        'SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
      );
      applied = rows.rows.map((r) => r.migration_name);
    } catch (error) {
      checks.push({ name: `Database ${dbName} answers`, ok: false, detail: error instanceof Error ? error.message.split('\n')[0] ?? 'error' : String(error) });
    } finally {
      await client.end().catch(() => undefined);
    }
  }
  if (reachable) checks.push({ name: `Database ${dbName} answers`, ok: true, detail: 'SELECT 1 ok' });

  const here = fileURLToPath(import.meta.url);
  const migrationsDir = resolve(here, '..', '..', 'prisma', 'migrations');
  const onDisk = readdirSync(migrationsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  if (reachable) {
    const pending = onDisk.filter((name) => !applied.includes(name));
    const unknown = applied.filter((name) => !onDisk.includes(name));
    const ok = pending.length === 0 && unknown.length === 0;
    checks.push({
      name: `Migrations current (${applied.length}/${onDisk.length})`,
      ok,
      detail: ok ? `latest ${applied[applied.length - 1] ?? '-'}` : `pending: ${pending.join(', ') || '-'}${unknown.length ? ` · unknown in db: ${unknown.join(', ')}` : ''}`,
    });
  }

  let webOk = false; let webDetail = '';
  try {
    const res = await fetch(`${web}/en/sign-in`, { redirect: 'manual', signal: AbortSignal.timeout(8000) });
    webOk = res.status === 200; webDetail = `HTTP ${res.status}`;
  } catch (error) {
    webDetail = error instanceof Error ? (error.name === 'TimeoutError' ? 'timed out' : error.message) : String(error);
  }
  checks.push({ name: `Web server answers at ${web}`, ok: webOk, detail: webOk ? webDetail : `${webDetail} — is the app running? pnpm dev:local` });

  const allOk = checks.every((c) => c.ok);
  process.stdout.write('\nQMULATE local environment\n');
  for (const c of checks) process.stdout.write(`  ${c.ok ? '✔' : '✖'} ${c.name.padEnd(44)} ${c.detail}\n`);
  process.stdout.write(allOk ? '\nAll checks passed.\n\n' : '\nSome checks FAILED.\n\n');
  process.exit(allOk ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error('[dev:health] crashed:', error instanceof Error ? error.message : error);
  process.exit(2);
});
