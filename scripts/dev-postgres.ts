#!/usr/bin/env -S pnpm exec tsx
/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * QMULATE — throwaway local PostgreSQL for development and local integration runs
 * ═══════════════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS. CI runs against a real `postgres:16-alpine` service container (see
 * `.github/workflows/ci.yml`, jobs `integration` / `residency-guardrail` / `e2e`). Locally,
 * this machine has neither Docker nor a system Postgres, so `prisma migrate dev`, the seed
 * and the audit-trigger work would have nothing to talk to. This script starts a private,
 * disposable cluster from the `embedded-postgres` npm package — real PostgreSQL binaries,
 * a data directory under `.pgdata/` (gitignored), no daemon, no root, no container runtime.
 *
 * WHAT IT IS NOT. It is not a substitute for the CI service container and it is not a
 * staging environment. Version parity with CI is best-effort (see `scripts/README.md`), so
 * anything that depends on server behaviour — trigger semantics, `pg_advisory_xact_lock`,
 * collation — must still be proven in CI before it counts as green.
 *
 * ── NFR-03 RESIDENCY (release gate G-8) ────────────────────────────────────────────────
 * A cluster in a scratch directory on a laptop is, by definition, NOT KSA-resident
 * production infrastructure. So:
 *   · the script REFUSES to run when `DATA_CLASSIFICATION=production` is already exported;
 *   · when the variable is unset it injects `DATA_CLASSIFICATION=fixture-only` into the
 *     child environment and says so, because `fixture-only` is the strictest legal value
 *     and is the only one this harness could ever honestly claim.
 * It never widens the guardrail — it can only ever pin it to the strictest setting.
 *
 * ── USAGE ──────────────────────────────────────────────────────────────────────────────
 *   pnpm exec tsx scripts/dev-postgres.ts start
 *   pnpm exec tsx scripts/dev-postgres.ts stop
 *   pnpm exec tsx scripts/dev-postgres.ts status
 *   pnpm exec tsx scripts/dev-postgres.ts --run "pnpm --filter @qmulate/database run seed"
 *
 * Full documentation, including the devDependency the root package.json needs, is in
 * `scripts/README.md`.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { constants as osConstants } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* ─────────────────────────────────────────────────────────────────────────────────────
 * Constants
 * ────────────────────────────────────────────────────────────────────────────────── */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PGDATA_ROOT = join(REPO_ROOT, '.pgdata');

/**
 * 54329, not 5432. A developer who also runs a system Postgres, a Docker Postgres, or a
 * second checkout should never have this cluster silently bind over the top of one — or,
 * far worse, have a migration run against the wrong database because the port collided.
 */
const DEFAULT_PORT = 54329;
const DEFAULT_CLUSTER = 'qmulate-dev';
const DEFAULT_DATABASE = 'qmulate_dev';
/** Throwaway credentials for a loopback-only scratch cluster. Never reuse them anywhere. */
const DEFAULT_USER = 'qmulate';
const DEFAULT_PASSWORD = 'qmulate';

/** How long to wait for a clean (fast) shutdown before escalating to immediate. */
const SHUTDOWN_GRACE_MS = 20_000;
const SHUTDOWN_POLL_MS = 250;

/* ─────────────────────────────────────────────────────────────────────────────────────
 * Small utilities
 * ────────────────────────────────────────────────────────────────────────────────── */

const log = (message: string): void => console.log(`[dev-postgres] ${message}`);
const warn = (message: string): void => console.warn(`[dev-postgres] ${message}`);
const fail = (message: string): void => console.error(`[dev-postgres] ✗ ${message}`);

function delay(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

/** `process.kill(pid, 0)` probes for existence without signalling. */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means it exists but belongs to another user — still "alive" for our purposes.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/* ─────────────────────────────────────────────────────────────────────────────────────
 * CLI parsing
 * ────────────────────────────────────────────────────────────────────────────────── */

type Command = 'start' | 'stop' | 'status' | 'run' | 'help';

interface Options {
  command: Command;
  port: number;
  clusterName: string;
  dataDir: string;
  database: string;
  user: string;
  password: string;
  runCommand: string | null;
  reset: boolean;
  keep: boolean;
  verbose: boolean;
}

const HELP = `
QMULATE — throwaway local PostgreSQL (embedded-postgres; no Docker required)

  COMMANDS
    start                 Initialise if needed, start the cluster, print DATABASE_URL and
                          stay in the FOREGROUND until Ctrl-C. Ctrl-C shuts down cleanly.
    stop                  Shut down a cluster left running by a previous session. Reads
                          postmaster.pid directly, so it works even if that session was
                          killed hard — and needs no npm package at all.
    status                Report whether the cluster exists, is initialised, and is running.
    run                   Same as --run.

  FLAGS
    --run "<command>"     Start → run <command> with DATABASE_URL injected → stop.
                          The command's exit code becomes this script's exit code.
    --port <n>            Port to listen on            (default ${DEFAULT_PORT}, env QMULATE_PG_PORT)
    --name <cluster>      Cluster name under .pgdata/  (default ${DEFAULT_CLUSTER}, env QMULATE_PG_NAME)
    --database <name>     Database to create/use       (default ${DEFAULT_DATABASE})
    --user <name>         Superuser role               (default ${DEFAULT_USER})
    --password <secret>   Superuser password           (default ${DEFAULT_PASSWORD})
    --data-dir <path>     Override the data directory  (must live under .pgdata/)
    --reset               Delete the data directory first — DESTROYS the local database.
    --keep                With --run: leave the cluster running after the command exits.
    --verbose             Forward the PostgreSQL server log to stdout.
    --help                Print this.

  EXAMPLES
    pnpm exec tsx scripts/dev-postgres.ts start
    pnpm exec tsx scripts/dev-postgres.ts --run "pnpm --filter @qmulate/database run migrate:dev"
    pnpm exec tsx scripts/dev-postgres.ts --reset --run "pnpm --filter @qmulate/database run seed"
    pnpm exec tsx scripts/dev-postgres.ts stop

  CI does NOT use this script. CI uses a real postgres:16-alpine service container.
`;

function readFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  return value;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    command: 'start',
    port: Number.parseInt(process.env.QMULATE_PG_PORT ?? String(DEFAULT_PORT), 10),
    clusterName: process.env.QMULATE_PG_NAME ?? DEFAULT_CLUSTER,
    dataDir: '',
    database: DEFAULT_DATABASE,
    user: DEFAULT_USER,
    password: DEFAULT_PASSWORD,
    runCommand: null,
    reset: false,
    keep: false,
    verbose: false,
  };

  let explicitDataDir: string | null = null;
  let sawCommand = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? '';

    if (token === '--help' || token === '-h') return { ...options, command: 'help' };
    if (token === '--reset') {
      options.reset = true;
    } else if (token === '--keep') {
      options.keep = true;
    } else if (token === '--verbose') {
      options.verbose = true;
    } else if (token === '--run' || token.startsWith('--run=')) {
      options.runCommand = token.startsWith('--run=')
        ? token.slice('--run='.length)
        : readFlagValue(argv, ++index, '--run');
    } else if (token === '--port') {
      options.port = Number.parseInt(readFlagValue(argv, ++index, '--port'), 10);
    } else if (token === '--name') {
      options.clusterName = readFlagValue(argv, ++index, '--name');
    } else if (token === '--database') {
      options.database = readFlagValue(argv, ++index, '--database');
    } else if (token === '--user') {
      options.user = readFlagValue(argv, ++index, '--user');
    } else if (token === '--password') {
      options.password = readFlagValue(argv, ++index, '--password');
    } else if (token === '--data-dir') {
      explicitDataDir = resolve(REPO_ROOT, readFlagValue(argv, ++index, '--data-dir'));
    } else if (token.startsWith('-')) {
      throw new Error(`Unknown flag: ${token}`);
    } else if (!sawCommand) {
      if (!['start', 'stop', 'status', 'run', 'help'].includes(token)) {
        throw new Error(`Unknown command: ${token}`);
      }
      options.command = token as Command;
      sawCommand = true;
    } else {
      throw new Error(`Unexpected argument: ${token}`);
    }
  }

  // `--run` implies the run command even when no verb was typed.
  if (options.runCommand !== null && options.command === 'start' && !sawCommand) {
    options.command = 'run';
  }
  if (options.command === 'run' && options.runCommand === null) {
    throw new Error('The `run` command needs --run "<command>".');
  }

  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65_535) {
    throw new Error(`Invalid port: ${String(options.port)} (expected an integer 1024–65535).`);
  }
  if (!/^[A-Za-z0-9_-]+$/.test(options.clusterName)) {
    throw new Error(`Invalid --name: ${options.clusterName} (letters, digits, - and _ only).`);
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(options.database)) {
    throw new Error(`Invalid --database: ${options.database} (a bare SQL identifier, please).`);
  }

  options.dataDir = explicitDataDir ?? join(PGDATA_ROOT, options.clusterName);

  // Guardrail against a typo turning --reset into `rm -rf /`. Everything this script may
  // create or delete lives under <repo>/.pgdata/, which is gitignored.
  if (options.dataDir !== PGDATA_ROOT && !options.dataDir.startsWith(PGDATA_ROOT + sep)) {
    throw new Error(`--data-dir must live under ${PGDATA_ROOT}; got ${options.dataDir}`);
  }

  return options;
}

/* ─────────────────────────────────────────────────────────────────────────────────────
 * Residency guardrail (NFR-03 / G-8)
 * ────────────────────────────────────────────────────────────────────────────────── */

/**
 * Build the environment handed to a `--run` child.
 *
 * `DATA_CLASSIFICATION=production` is refused outright: this cluster is a scratch directory
 * on a developer machine, it is categorically not KSA-resident production infrastructure,
 * and pointing a production-classified process at it is exactly the mistake gate G-8
 * exists to prevent. When the variable is UNSET it is pinned to `fixture-only`, announced
 * on stdout — the strictest legal value, so the harness can only ever tighten the guard.
 */
function childEnvironment(urls: SeparatedUrls): NodeJS.ProcessEnv {
  const declared = process.env.DATA_CLASSIFICATION;

  if (declared === 'production') {
    throw new Error(
      'DATA_CLASSIFICATION=production is set in this shell.\n' +
        '  This is a throwaway local cluster, not KSA-resident production infrastructure.\n' +
        '  Refusing to run (NFR-03 / release gate G-8). Unset the variable, or set it to\n' +
        '  `fixture-only`, and try again.',
    );
  }

  if (declared === undefined) {
    log('DATA_CLASSIFICATION was unset — pinning it to `fixture-only` for the child process.');
  } else if (declared !== 'fixture-only') {
    // Let the app's own zod schema produce the authoritative error; do not second-guess it.
    warn(`DATA_CLASSIFICATION="${declared}" is not a value @qmulate/config accepts.`);
  }

  return {
    ...process.env,
    // ⚠ THE APP ROLE, NOT THE SUPERUSER. This one line is what makes every local refusal measurement
    // in this repository mean anything: `qmulate` is `rolsuper = true, rolbypassrls = true` (MEASURED)
    // and bypasses GRANTs, ownership checks and FORCE RLS, so a suite running as it would pass every
    // privilege-separation assertion for the wrong reason. `qmulate_app` is the least-privileged of
    // the four.
    DATABASE_URL: urls.app,
    // Migrations, the fixture seed and the test harnesses' scaffolding. Owns every table.
    MIGRATOR_DATABASE_URL: urls.owner,
    // The one credential that may mint or widen a seat.
    ACCESS_MATRIX_DATABASE_URL: urls.provisioner,
    // Provisioning only. Present here because a `--run` child may legitimately re-provision; it must
    // NEVER appear in a deployed application service's environment.
    SUPERUSER_DATABASE_URL: urls.superuser,
    // The queue transport's own credential (S10/T1). Deliberately NOT in turbo's globalEnv — only
    // the tasks that declare it see it (the TEST_ONLY_DISABLE_AUTH_RATE_LIMIT pattern), so apps/web
    // never receives it structurally rather than subtractively.
    PGBOSS_DATABASE_URL: urls.pgboss,
    DATA_CLASSIFICATION: declared ?? 'fixture-only',
  };
}

/* ─────────────────────────────────────────────────────────────────────────────────────
 * Cluster state
 * ────────────────────────────────────────────────────────────────────────────────── */

/** initdb writes PG_VERSION last-ish; its presence is the standard "initialised" probe. */
function isInitialised(dataDir: string): boolean {
  return existsSync(join(dataDir, 'PG_VERSION'));
}

function postmasterPidPath(dataDir: string): string {
  return join(dataDir, 'postmaster.pid');
}

/** First line of postmaster.pid is the postmaster PID. Returns null if unreadable. */
function readPostmasterPid(dataDir: string): number | null {
  const path = postmasterPidPath(dataDir);
  if (!existsSync(path)) return null;
  try {
    const first = readFileSync(path, 'utf8').split('\n')[0]?.trim() ?? '';
    const pid = Number.parseInt(first, 10);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

type ClusterState = 'absent' | 'uninitialised' | 'stopped' | 'running' | 'stale-pidfile';

function clusterState(dataDir: string): { state: ClusterState; pid: number | null } {
  if (!existsSync(dataDir)) return { state: 'absent', pid: null };
  if (!isInitialised(dataDir)) return { state: 'uninitialised', pid: null };

  const pid = readPostmasterPid(dataDir);
  if (pid === null) return { state: 'stopped', pid: null };
  return isProcessAlive(pid) ? { state: 'running', pid } : { state: 'stale-pidfile', pid };
}

/* ─────────────────────────────────────────────────────────────────────────────────────
 * Shutdown — deliberately independent of the npm package
 *
 * PostgreSQL signal semantics (see the "Shutting Down the Server" docs):
 *   SIGTERM  smart shutdown    — waits for every client to disconnect; can hang forever
 *   SIGINT   fast shutdown     — disconnects clients, rolls back, closes cleanly  ← default
 *   SIGQUIT  immediate         — no clean shutdown; recovery runs on next start   ← escalation
 *
 * SIGINT (not SIGTERM) is the right first choice: an open psql session must not be able to
 * wedge the shutdown. Driving this from the pid file rather than from an in-memory handle
 * means `stop` also rescues a cluster whose supervising Node process was SIGKILLed.
 * ────────────────────────────────────────────────────────────────────────────────── */

async function shutdownCluster(dataDir: string): Promise<ClusterState> {
  const { state, pid } = clusterState(dataDir);

  if (state === 'stale-pidfile' && pid !== null) {
    warn(`Removing a stale postmaster.pid (pid ${String(pid)} is gone).`);
    rmSync(postmasterPidPath(dataDir), { force: true });
    return 'stopped';
  }
  if (state !== 'running' || pid === null) return state;

  log(`Stopping PostgreSQL (pid ${String(pid)}, fast shutdown)…`);
  try {
    process.kill(pid, 'SIGINT');
  } catch (error) {
    warn(`Could not signal pid ${String(pid)}: ${(error as Error).message}`);
    return 'running';
  }

  const deadline = Date.now() + SHUTDOWN_GRACE_MS;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      log('PostgreSQL stopped.');
      return 'stopped';
    }
    await delay(SHUTDOWN_POLL_MS);
  }

  warn('Fast shutdown timed out — escalating to immediate shutdown (SIGQUIT).');
  warn('The cluster will run crash recovery on the next start. No committed data is lost.');
  try {
    process.kill(pid, 'SIGQUIT');
  } catch {
    /* already gone */
  }
  return isProcessAlive(pid) ? 'running' : 'stopped';
}

/* ─────────────────────────────────────────────────────────────────────────────────────
 * embedded-postgres
 * ────────────────────────────────────────────────────────────────────────────────── */

interface EmbeddedPostgresLike {
  initialise(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  createDatabase?: (name: string) => Promise<void>;
}

type EmbeddedPostgresCtor = new (options: Record<string, unknown>) => EmbeddedPostgresLike;

const MISSING_PACKAGE_HELP = [
  '`embedded-postgres` is not installed.',
  '',
  '  The orchestrator must add it as a ROOT devDependency:',
  '      pnpm add -Dw embedded-postgres',
  '',
  '  It pulls a platform binary via an optional dependency',
  '  (@embedded-postgres/darwin-arm64, .../linux-x64, …). If pnpm reports a blocked build',
  '  script, add "embedded-postgres" to `onlyBuiltDependencies` in pnpm-workspace.yaml.',
  '',
  '  `stop` and `status` do NOT need this package — only `start` and `--run` do.',
].join('\n');

async function loadEmbeddedPostgres(): Promise<EmbeddedPostgresCtor> {
  // Indirect specifier: keeps the reference out of static analysis, so a checkout without
  // the package still typechecks and bundles rather than hard-failing at parse time.
  const specifier = 'embedded-postgres';
  let loaded: Record<string, unknown>;

  try {
    loaded = (await import(specifier)) as Record<string, unknown>;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') {
      throw new Error(MISSING_PACKAGE_HELP);
    }
    throw error;
  }

  // CJS/ESM interop: the package's default export is the class, but a transpiled consumer
  // can see it under `.default.default`. Probe rather than assume.
  const candidates = [
    loaded.default,
    (loaded.default as Record<string, unknown> | undefined)?.default,
    loaded.EmbeddedPostgres,
    loaded,
  ];
  const ctor = candidates.find((candidate) => typeof candidate === 'function');

  if (typeof ctor !== 'function') {
    throw new Error(
      'embedded-postgres resolved, but no constructor was found on the module. ' +
        'Its export shape has changed — update loadEmbeddedPostgres() in scripts/dev-postgres.ts.',
    );
  }
  return ctor as EmbeddedPostgresCtor;
}

function urlFor(options: Options, user: string, password: string): string {
  const auth = `${encodeURIComponent(user)}:${encodeURIComponent(password)}`;
  // 127.0.0.1, not localhost: avoids an IPv6-first resolver reaching for ::1 and failing.
  return `postgresql://${auth}@127.0.0.1:${String(options.port)}/${options.database}?schema=public`;
}

/**
 * The PLATFORM SUPERUSER connection (`SUPERUSER_DATABASE_URL`, connection D) — not the app's.
 *
 * ⚠ MEASURED: `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user` returns
 * `true / true` for this role on this cluster. A superuser bypasses GRANTs, ownership checks AND
 * `FORCE ROW LEVEL SECURITY`, so **every "it is blocked" result obtained on this connection is
 * worthless.** It is used for exactly two things: creating the database, and running role
 * provisioning. It is NOT what `DATABASE_URL` points at any more.
 */
function superuserUrlFor(options: Options): string {
  return urlFor(options, options.user, options.password);
}

/**
 * The three separated roles' connection strings (ADR-0008 round 6).
 *
 * ⚠ THE PASSWORDS ARE FIXED, LOCAL-ONLY PLACEHOLDERS, exactly like the `FIELD_ENCRYPTION_*` test
 * keys in the harness. This cluster is a scratch directory on a developer machine listening on
 * 127.0.0.1; the residency guardrail already refuses `DATA_CLASSIFICATION=production` against it.
 * `scripts/provision-db-roles.ts` reads each role's password FROM the URL it will connect with, so
 * these values are the single source of truth for both sides and cannot disagree.
 */
const LOCAL_ROLE_PASSWORD = 'qmulate';

interface SeparatedUrls {
  /** Connection A — `qmulate_app`. Becomes `DATABASE_URL`. LEAST privileged. */
  app: string;
  /** Connection B — `qmulate_provisioner`. Becomes `ACCESS_MATRIX_DATABASE_URL`. */
  provisioner: string;
  /** Connection C — `qmulate_owner`. Becomes `MIGRATOR_DATABASE_URL`. */
  owner: string;
  /** Connection D — the platform superuser. Becomes `SUPERUSER_DATABASE_URL`. */
  superuser: string;
  /** Connection E — `qmulate_pgboss`, the queue transport's own credential. Becomes `PGBOSS_DATABASE_URL` (S10/T1). */
  pgboss: string;
}

function separatedUrlsFor(options: Options): SeparatedUrls {
  return {
    app: urlFor(options, 'qmulate_app', LOCAL_ROLE_PASSWORD),
    provisioner: urlFor(options, 'qmulate_provisioner', LOCAL_ROLE_PASSWORD),
    owner: urlFor(options, 'qmulate_owner', LOCAL_ROLE_PASSWORD),
    superuser: superuserUrlFor(options),
    pgboss: urlFor(options, 'qmulate_pgboss', LOCAL_ROLE_PASSWORD),
  };
}

interface StartedCluster {
  instance: EmbeddedPostgresLike;
  urls: SeparatedUrls;
}

async function startCluster(options: Options): Promise<StartedCluster> {
  if (options.reset) {
    const running = clusterState(options.dataDir);
    if (running.state === 'running') {
      log('--reset: stopping the running cluster first.');
      await shutdownCluster(options.dataDir);
    }
    if (existsSync(options.dataDir)) {
      warn(`--reset: deleting ${options.dataDir}`);
      rmSync(options.dataDir, { recursive: true, force: true });
    }
  }

  const existing = clusterState(options.dataDir);
  if (existing.state === 'running') {
    throw new Error(
      `A cluster is already running for ${options.dataDir} (pid ${String(existing.pid)}).\n` +
        '  Use it as-is, or run `dev-postgres.ts stop` first.',
    );
  }
  if (existing.state === 'stale-pidfile') {
    warn('Removing a stale postmaster.pid left by a hard-killed session.');
    rmSync(postmasterPidPath(options.dataDir), { force: true });
  }
  if (existing.state === 'uninitialised' && readdirSync(options.dataDir).length > 0) {
    throw new Error(
      `${options.dataDir} exists, is not empty, and has no PG_VERSION — a previous initdb\n` +
        '  was interrupted. Re-run with --reset to discard it.',
    );
  }

  mkdirSync(options.dataDir, { recursive: true });

  const EmbeddedPostgres = await loadEmbeddedPostgres();
  const instance = new EmbeddedPostgres({
    databaseDir: options.dataDir,
    user: options.user,
    password: options.password,
    port: options.port,
    // Keep the cluster between runs so migrations and seed data survive; `--reset` is the
    // explicit way to throw it away.
    persistent: true,
    // initdb derives the cluster encoding from the OS locale when not told otherwise; on Windows
    // that is WIN1252, and the migrations contain UTF-8 (box-drawing, Arabic) that 22P05 rejects.
    // Pin UTF8 at cluster creation so every database created from template1 inherits it.
    initdbFlags: ['--encoding=UTF8'],
    // embedded-postgres calls `options.onLog(...)` unconditionally, so it must always be a
    // function — passing `undefined` for the quiet case throws `onLog is not a function`
    // the first time the server writes a line. Swallow instead.
    onLog: (message: string) => {
      if (options.verbose) console.log(`[postgres] ${message}`);
    },
    onError: (message: string) => console.error(`[postgres] ${message}`),
  });

  // "Already initialised" is the normal case on every run after the first — detect it from
  // PG_VERSION and skip initdb, rather than letting initdb fail and having to parse why.
  if (isInitialised(options.dataDir)) {
    log(`Reusing the existing cluster at ${options.dataDir}`);
  } else {
    log(`Initialising a new cluster at ${options.dataDir} (first run — this takes a moment)…`);
    await instance.initialise();
  }

  log(`Starting PostgreSQL on 127.0.0.1:${String(options.port)}…`);
  await instance.start();

  await ensureDatabase(instance, options);

  const urls = separatedUrlsFor(options);
  await provisionSeparatedRoles(urls);

  log('Ready.');
  log('');
  log(`  DATABASE_URL=${urls.app}`);
  log(`    ↑ the LEAST-privileged role (qmulate_app). It cannot INSERT waqf_access_grant,`);
  log(`      cannot ALTER TABLE, and cannot SET session_replication_role. That is the point.`);
  log(`  MIGRATOR_DATABASE_URL=${urls.owner}`);
  log(`  ACCESS_MATRIX_DATABASE_URL=${urls.provisioner}`);
  log(`  SUPERUSER_DATABASE_URL=${urls.superuser}`);
  log(`  PGBOSS_DATABASE_URL=${urls.pgboss}`);
  log('');

  return { instance, urls };
}

/**
 * Creates the three separated roles and applies the privilege matrix (ADR-0008 round 6).
 *
 * ⚠ THIS IS THE SINGLE MOST IMPORTANT ADDITION TO THIS FILE. Before it, `DATABASE_URL` pointed at a
 * role with `rolsuper = true, rolbypassrls = true` (MEASURED) — so every local run of the integration
 * suite proved nothing about any GRANT, any ownership check or any RLS policy, and a refusal test
 * would have passed for entirely the wrong reason. `childEnvironment()` now hands the `--run` child
 * the APP role's URL as `DATABASE_URL`, and the superuser's only as `SUPERUSER_DATABASE_URL`.
 *
 * Runs on EVERY start, not only after `--reset`: it is idempotent, and an existing cluster from before
 * this change has tables owned by the superuser that must be reassigned before anything is enforced.
 *
 * The implementation lives in `packages/database/src/provision-roles.ts` because it needs `pg`, which
 * resolves from that package rather than from the repo root.
 */
async function provisionSeparatedRoles(urls: SeparatedUrls): Promise<void> {
  const implementation = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'packages',
    'database',
    'src',
    'provision-roles.ts',
  );

  interface ProvisionModule {
    provisionDatabaseRoles: (options: {
      superuserUrl: string;
      appUrl: string;
      provisionerUrl: string;
      migratorUrl: string;
      pgbossUrl: string;
      ownerCreateDb?: boolean;
      log?: (line: string) => void;
    }) => Promise<string[]>;
  }

  log('Provisioning the four separated database roles (ADR-0008 round 6; qmulate_pgboss S10/T1)…');
  const module = (await import(pathToFileURL(implementation).href)) as ProvisionModule;
  const changes = await module.provisionDatabaseRoles({
    superuserUrl: urls.superuser,
    appUrl: urls.app,
    provisionerUrl: urls.provisioner,
    migratorUrl: urls.owner,
    pgbossUrl: urls.pgboss,
    // `prisma migrate dev` creates and drops a shadow database on the migrate connection, so the
    // owner needs CREATEDB locally. Production runs `migrate deploy` only and should not have it.
    ownerCreateDb: true,
    log: (line: string) => log(line),
  });
  if (changes.length === 0) log('  (roles and matrix already in place)');
}

/**
 * initdb creates `postgres`, `template0` and `template1` — not the application database.
 * Creating it is idempotent here: "already exists" is the expected outcome from the second
 * run onwards. Any OTHER failure is surfaced rather than swallowed, because silently
 * falling back to the `postgres` database would let migrations land somewhere unexpected.
 */
async function ensureDatabase(instance: EmbeddedPostgresLike, options: Options): Promise<void> {
  if (typeof instance.createDatabase !== 'function') {
    warn(
      `This build of embedded-postgres exposes no createDatabase(). Create "${options.database}" ` +
        'manually, or point DATABASE_URL at the default database.',
    );
    return;
  }

  try {
    await instance.createDatabase(options.database);
    log(`Created database "${options.database}".`);
  } catch (error) {
    const message = (error as Error).message ?? String(error);
    if (/already exists/i.test(message)) {
      log(`Database "${options.database}" already exists — reusing it.`);
      return;
    }
    throw new Error(`Could not create database "${options.database}": ${message}`);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────────────
 * Commands
 * ────────────────────────────────────────────────────────────────────────────────── */

/** `start`: hold the cluster in the foreground until Ctrl-C. */
async function commandStart(options: Options): Promise<number> {
  const { instance } = await startCluster(options);

  log('Holding the cluster open. Press Ctrl-C to shut down cleanly.');
  log('(From another terminal: `pnpm exec tsx scripts/dev-postgres.ts stop`.)');

  const signal = await new Promise<NodeJS.Signals>((done) => {
    const onSignal = (received: NodeJS.Signals): void => {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      done(received);
    };
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
  });

  log(`Received ${signal}.`);
  await stopQuietly(instance, options.dataDir);
  return 0;
}

/** `stop`: no npm package needed — this drives the pid file directly. */
async function commandStop(options: Options): Promise<number> {
  const state = await shutdownCluster(options.dataDir);

  switch (state) {
    case 'absent':
      log(`No cluster at ${options.dataDir}. Nothing to stop.`);
      return 0;
    case 'uninitialised':
      log('The data directory exists but was never initialised. Nothing to stop.');
      return 0;
    case 'stopped':
      return 0;
    default:
      fail('The cluster is still running. Inspect .pgdata/*/postmaster.pid manually.');
      return 1;
  }
}

function commandStatus(options: Options): number {
  const { state, pid } = clusterState(options.dataDir);

  log(`cluster   ${options.clusterName}`);
  log(`data dir  ${options.dataDir}`);
  log(`state     ${state}${pid === null ? '' : ` (pid ${String(pid)})`}`);
  if (state === 'running') {
    // All four, so a developer can copy the one they need. The APP url is DATABASE_URL.
    const urls = separatedUrlsFor(options);
    log(`DATABASE_URL                ${urls.app}`);
    log(`MIGRATOR_DATABASE_URL       ${urls.owner}`);
    log(`ACCESS_MATRIX_DATABASE_URL  ${urls.provisioner}`);
    log(`SUPERUSER_DATABASE_URL      ${urls.superuser}`);
  }
  return state === 'running' || state === 'stopped' || state === 'absent' ? 0 : 1;
}

/**
 * `--run`: start → run the command with DATABASE_URL injected → stop, propagating the
 * command's exit code. The cluster is stopped in a `finally`, so a throwing command, a
 * non-zero exit and a Ctrl-C all converge on the same cleanup path.
 */
async function commandRun(options: Options): Promise<number> {
  const command = options.runCommand ?? '';
  const { instance, urls } = await startCluster(options);

  let child: ChildProcess | null = null;
  let signalCount = 0;

  const onSignal = (received: NodeJS.Signals): void => {
    signalCount += 1;
    if (child === null || child.exitCode !== null) return;

    if (signalCount === 1) {
      warn(`Received ${received} — forwarding to the child, then shutting down.`);
      child.kill(received);
    } else {
      warn('Second signal — killing the child immediately.');
      child.kill('SIGKILL');
    }
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    log(`Running: ${command}`);
    log('');

    // `shell: true` so the caller can pass a full command line (pipes, &&, quoting) exactly
    // as they would type it. `stdio: 'inherit'` keeps colour and interactivity intact.
    child = spawn(command, {
      cwd: REPO_ROOT,
      shell: true,
      stdio: 'inherit',
      env: childEnvironment(urls),
    });

    const exitCode = await new Promise<number>((done) => {
      child?.on('error', (error) => {
        fail(`Could not launch the command: ${error.message}`);
        done(127);
      });
      child?.on('exit', (code, signal) => {
        if (signal !== null) {
          const number = (osConstants.signals as Record<string, number>)[signal] ?? 0;
          done(128 + number);
          return;
        }
        done(code ?? 1);
      });
    });

    log('');
    log(`Command exited with code ${String(exitCode)}.`);
    return exitCode;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);

    // `--keep` is honoured only on a normal exit. If the developer pressed Ctrl-C they want
    // everything gone, not a cluster silently holding the port.
    if (options.keep && signalCount === 0) {
      log('--keep: leaving the cluster running.');
      log(`  DATABASE_URL=${urls.app}`);
    } else {
      await stopQuietly(instance, options.dataDir);
    }
  }
}

/**
 * Prefer the package's own `stop()` (it knows about its child handle), but always fall back
 * to the pid-file shutdown so a cluster is never left orphaned holding the port.
 */
async function stopQuietly(instance: EmbeddedPostgresLike, dataDir: string): Promise<void> {
  try {
    await instance.stop();
  } catch (error) {
    warn(`embedded-postgres stop() failed (${(error as Error).message}); using the pid file.`);
  }
  await shutdownCluster(dataDir);
}

/* ─────────────────────────────────────────────────────────────────────────────────────
 * Entry point
 * ────────────────────────────────────────────────────────────────────────────────── */

async function main(): Promise<number> {
  let options: Options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail((error as Error).message);
    console.error(HELP);
    return 2;
  }

  if (options.command === 'help') {
    console.log(HELP);
    return 0;
  }

  // Refuse before touching the filesystem: a production-classified shell must not get as
  // far as creating a data directory.
  const startsSomething = options.command === 'run' || options.command === 'start';
  if (startsSomething && process.env.DATA_CLASSIFICATION === 'production') {
    fail(
      'DATA_CLASSIFICATION=production is set in this shell.\n' +
        '  This is a throwaway local cluster, not KSA-resident production infrastructure.\n' +
        '  Refusing to run (NFR-03 / release gate G-8).',
    );
    return 1;
  }

  switch (options.command) {
    case 'start':
      return commandStart(options);
    case 'stop':
      return commandStop(options);
    case 'status':
      return commandStatus(options);
    case 'run':
      return commandRun(options);
    default:
      console.log(HELP);
      return 0;
  }
}

/**
 * Set the process's exit code so it SURVIVES to the shell — which `process.exitCode` alone does not.
 *
 * ── THE DEFECT THIS EXISTS TO CLOSE, AND IT IS THE H1 CLASS: A GREEN THAT MEASURED NOTHING ──────
 * MEASURED before the fix: `dev-postgres.ts --run "exit 7"` printed *"Command exited with code 7."*
 * and then **exited 0**. So the whole local gate — every `--reset --run "… && … && …"` chain in
 * BUILD-PLAN's "Run locally" block and in `tests/README.md` — reported success over a RED suite to
 * any caller that read `$?`. It was found the only way this class ever is: a full Playwright run
 * failed 6 of 72 inside a `--run` chain and the wrapper still handed back 0.
 *
 * ── ROOT CAUSE, NAMED PRECISELY (it is not in this file's logic) ─────────────────────────────────
 * `commandRun` already returned the child's code and `main().then()` already assigned it. The
 * assignment was being DISCARDED by a transitive dependency: `embedded-postgres` depends on
 * `async-exit-hook`, which registers `beforeExit` with an explicit code of **0**
 * (`add.hookEvent('beforeExit', 0)`) and, when the event loop drains, runs
 * `process.nextTick(process.exit.bind(null, 0))`. An explicit `process.exit(0)` overrides whatever
 * `process.exitCode` holds. Nothing in this file was wrong; something else was louder.
 *
 * ── WHY AN `exit` LISTENER RATHER THAN CALLING `process.exit(code)` HERE ─────────────────────────
 * Because `process.exit()` can truncate a pending stdout write to a pipe — the same trap
 * `packages/database/src/seed.ts` documents at its own entry point, where a CI assertion matches
 * text on stderr. Node emits `'exit'` LAST, immediately before `reallyExit(process.exitCode)`, and
 * it reads the field again at that moment — so re-asserting here is the final word over
 * `async-exit-hook`'s `exit(0)` without ever shortening the process ourselves. VERIFIED both ways:
 * `--run "exit 7"` exits 7, `--run "true"` exits 0.
 *
 * ⚠ Nothing in CI calls this script (CI uses a real `postgres` service container) and no script
 * branches on its exit code today, so the fix breaks no caller — the damage was confined to local
 * gate runs, which is exactly where this repo's discipline says the measurement has to be real.
 */
function exitWith(code: number): void {
  process.exitCode = code;
  process.on('exit', () => {
    process.exitCode = code;
  });
}

main()
  .then((code) => {
    exitWith(code);
  })
  .catch((error: unknown) => {
    fail((error as Error).message ?? String(error));
    exitWith(1);
  });
