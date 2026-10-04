/**
 * QMULATE — `pnpm dev:local`: the ONE local start, with a port-3000 preflight.
 *
 * Why a preflight: a dev server orphaned by a killed terminal keeps port 3000 while its embedded
 * database is gone; the next `pnpm dev:local` then dies with EADDRINUSE and the browser shows the
 * orphan's "Jest worker encountered 2 child process exceptions" overlay (its static-path workers
 * crash without a database). The preflight looks at WHO owns :3000:
 *   · this project's own Next.js dev process (command line names this repository and `next`) →
 *     stopped, and the start proceeds;
 *   · anything else → refused with a clear message. Nothing unrelated is ever killed, and the port
 *     is never silently changed.
 * Then it runs the documented chain: embedded PostgreSQL on 127.0.0.1:54460 → migrate:deploy →
 * `pnpm --filter web dev` with the five local connection strings injected by dev-postgres.
 */
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const PORT = 3000;
const CLUSTER_PORT = 54460;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function listeners(port: number): number[] {
  if (process.platform !== 'win32') {
    try {
      const out = execFileSync('lsof', ['-tiTCP:' + String(port), '-sTCP:LISTEN'], { encoding: 'utf8' });
      return [...new Set(out.split(/\s+/).filter(Boolean).map(Number))];
    } catch {
      return [];
    }
  }
  const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' });
  const pids = new Set<number>();
  for (const line of out.split(/\r?\n/)) {
    const m = /^\s*TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)/.exec(line);
    if (m && Number(m[1]) === port) pids.add(Number(m[2]));
  }
  return [...pids];
}

function commandLine(pid: number): string {
  try {
    if (process.platform === 'win32') {
      return execFileSync(
        'powershell',
        ['-NoProfile', '-Command', `(Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}').CommandLine`],
        { encoding: 'utf8' },
      ).trim();
    }
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function isThisProjectsDevServer(cmd: string): boolean {
  const normalised = cmd.split('\\').join('/').toLowerCase();
  const root = repoRoot.split('\\').join('/').toLowerCase();
  return normalised.includes(root) && normalised.includes('/next/') && /\bnext\b/.test(normalised);
}

function stop(pid: number): void {
  if (process.platform === 'win32') execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
  else process.kill(pid, 'SIGTERM');
}

function preflight(): void {
  for (const pid of listeners(PORT)) {
    const cmd = commandLine(pid);
    if (isThisProjectsDevServer(cmd)) {
      console.warn(`[dev:local] port ${PORT} is held by a stale dev server of THIS project (pid ${pid}) — stopping it.`);
      stop(pid);
      continue;
    }
    console.error(
      `\n[dev:local] ✖ port ${PORT} is in use by a process that is NOT this project's dev server (pid ${pid}).\n` +
        `[dev:local]   ${cmd.slice(0, 200) || '(command line unavailable)'}\n` +
        `[dev:local]   Stop it yourself, or free the port, then run pnpm dev:local again. The port is not changed silently.\n`,
    );
    process.exit(1);
  }
  const busy = listeners(PORT);
  if (busy.length > 0) {
    console.error(`[dev:local] ✖ port ${PORT} is still held by pid(s) ${busy.join(', ')} after the stop attempt.`);
    process.exit(1);
  }
}

preflight();

const run =
  'pnpm --filter @qmulate/database run migrate:deploy && ' +
  'pnpm exec cross-env MIGRATOR_DATABASE_URL= SUPERUSER_DATABASE_URL= PGBOSS_DATABASE_URL= pnpm --filter web dev';
// No shell: the `--run` command carries spaces and `&&`, and a Windows shell spawn would concatenate
// the arguments unquoted (dev-postgres then saw `--filter` as its own flag). Running tsx's CLI
// through the current Node binary keeps every argument intact on every platform.
const tsxCli = resolve(dirname(createRequire(import.meta.url).resolve('tsx/package.json')), 'dist', 'cli.mjs');
const child = spawn(
  process.execPath,
  [tsxCli, 'scripts/dev-postgres.ts', '--name', 'manual', '--port', String(CLUSTER_PORT), '--run', run],
  { cwd: repoRoot, stdio: 'inherit' },
);
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
