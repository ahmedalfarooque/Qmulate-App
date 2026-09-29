#!/usr/bin/env tsx
/**
 * QMULATE — the LOCAL E2E LEG, as ONE artifact.  (S11-2, 2026-09-02)
 *
 *   pnpm test:e2e:local-fixture-only
 *   QMULATE_PG_NAME=<cluster> QMULATE_PG_PORT=<port> pnpm test:e2e:local-fixture-only
 *
 * ── WHY A SCRIPT, WHEN THE COMMAND WAS DOCUMENTED ─────────────────────────────────────────
 * BUILD-PLAN's "Run locally" block states the E2E leg as a THREE-LINE command: a cold `.next`, two
 * environment facts (`CI=1` and the fail-closed, test-only rate-limit override), and the runnable
 * `dev-postgres … --run "…"` line. Two consecutive builders (S10, S11) read that block and ran only
 * the line that looks like a command — and better-auth's built-in `/sign-in*` and `/two-factor/*`
 * rules (3 per 10 s, per IP) then refused the harness's own sign-ins with `429`. Both times the block
 * had said what would happen. A documented invocation that has been transcribed wrongly twice is an
 * INTERFACE WITH NO MECHANISM BEHIND IT; the fix is not a better paragraph but a single artifact.
 * This file is that artifact. It also places the `env -u` flags itself — the second recorded trap
 * (a misplaced `-u` is `exit 127`, a leg that runs NOTHING and can be misread as a pass).
 *
 * ── WHAT IT REFUSES, AND WHY THE NAME IS LONG ────────────────────────────────────────────
 * The override that relaxes the auth rate limiter is DOUBLY gated by design
 * (`packages/auth/src/rate-limit.ts`): `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT` must equal the one legal
 * word AND `DATA_CLASSIFICATION` must be `fixture-only`. A wrapper that sets the first half must not
 * become the thing that lets the second be assumed — so this script REFUSES to run when
 * `DATA_CLASSIFICATION` is already set to anything other than `fixture-only`, rather than overwriting
 * it. When unset, `dev-postgres.ts` pins `fixture-only` for the child (its own documented behaviour),
 * and this script says so. The name carries the classification on purpose: a `test:e2e:local` that
 * quietly relaxed a security control would be a footgun for whoever found it by tab-completion.
 *
 * ── WHAT THE VERDICT IS ──────────────────────────────────────────────────────────────────
 * The exit code, exactly as the documented block insists ("read `$?`, not the summary line"): the
 * harness's `global-teardown` fails the run on a server restart even when every test passed. This
 * script exits with the child's code and prints it as the last line.
 *
 * Kept deliberately tiny: no options, no retries, no flag surface. Everything the child does is the
 * documented block, verbatim — that is the property being protected.
 */

import { spawnSync } from 'node:child_process';
import { readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The ONE legal value of `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT` — `AUTH_RATE_LIMIT_TEST_OVERRIDE` in
 * `packages/config/src/env.ts`, restated here because this script runs outside the workspaces. Drift
 * is FAIL-CLOSED by construction: an unrecognised value is a boot failure of the web server, never a
 * silently full or silently relaxed limiter — so a mismatch shows up as a red leg, not a wrong one.
 */
const AUTH_RATE_LIMIT_TEST_OVERRIDE = 'disabled-for-tests';

/** The documented block's inner command, verbatim — including the `env -u` flags in their only correct place. */
const INNER_COMMAND = [
  'pnpm exec tsx scripts/provision-db-roles.ts',
  'pnpm --filter @qmulate/database run migrate:deploy',
  'pnpm run db:seed',
  'env -u MIGRATOR_DATABASE_URL -u SUPERUSER_DATABASE_URL pnpm turbo run test:e2e',
].join(' && ');

function log(message: string): void {
  process.stdout.write(`[e2e-local] ${message}\n`);
}

function refuse(message: string): never {
  process.stderr.write(`[e2e-local] REFUSED: ${message}\n`);
  process.exit(2);
}

const declared = process.env.DATA_CLASSIFICATION;
if (declared !== undefined && declared !== 'fixture-only') {
  refuse(
    `DATA_CLASSIFICATION="${declared}" is set in this shell. The rate-limit override this leg needs ` +
      'is legal ONLY beside `fixture-only`, and this script will not overwrite a classification ' +
      'somebody declared. Unset it (or set it to `fixture-only`) and run again.',
  );
}
if (declared === undefined) {
  log(
    'DATA_CLASSIFICATION is unset — dev-postgres pins `fixture-only` for the child, as documented.',
  );
}

const cluster = process.env.QMULATE_PG_NAME ?? '<default>';
const port = process.env.QMULATE_PG_PORT ?? '<default 54329>';
log(
  `cluster ${cluster} · port ${port} · CI=1 · TEST_ONLY_DISABLE_AUTH_RATE_LIMIT=${AUTH_RATE_LIMIT_TEST_OVERRIDE}`,
);

// A cold run, as CI always is.
rmSync(join(REPO_ROOT, 'apps', 'web', '.next'), { recursive: true, force: true });
log('apps/web/.next removed — the leg builds cold.');

/**
 * ⚠ THE THIRD TRAP, found by running two legs within fifteen minutes (S11-2, 2026-09-02). The seated
 * specs cooperate through a filesystem handshake (`<tmpdir>/qmulate-e2e-seat-<seat>`): one leader
 * enrols and publishes a session; everyone else waits for it. A handshake left behind by an EARLIER
 * run is reset only when it is older than 15 minutes — and a leader that DIED before publishing
 * (leg #1's leaders did, refused by the rate limiter) leaves a young, empty directory behind. The
 * next leg's tests then all become followers of a leader that no longer exists and time out at
 * 20–25 s each, reporting "no session … was published" for reasons that have nothing to do with the
 * screens under test. MEASURED: leg #2, run 12 minutes after leg #1, 25 such timeouts.
 *
 * Because turbo's strict env mode does not pass `TMPDIR` to the task, the specs' `os.tmpdir()` may
 * resolve differently from this process's — so BOTH candidates are swept. Only this repo's own
 * prefix is touched; nothing else in a temp directory is anyone's business here.
 */
const HANDSHAKE_PREFIX = 'qmulate-e2e-';
const swept: string[] = [];
for (const dir of new Set([tmpdir(), '/tmp'])) {
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    continue;
  }
  for (const entry of entries) {
    if (!entry.startsWith(HANDSHAKE_PREFIX)) continue;
    const path = join(dir, entry);
    rmSync(path, { recursive: true, force: true });
    swept.push(path);
  }
}
log(
  swept.length === 0
    ? 'no seat-handshake directories from an earlier run were present.'
    : `swept ${String(swept.length)} seat-handshake director${swept.length === 1 ? 'y' : 'ies'} left by an earlier run: ${swept.join(', ')}`,
);

/**
 * ⚠ THE FOURTH TRAP, found by running two legs back to back (S11-2b, 2026-09-03). A leg that dies
 * inside the suite can leave Playwright's own `next start` LISTENING on the port. The next leg then
 * fails during setup with *"http://localhost:3000/en is already used"* — after building, seeding and
 * migrating, and with nothing whatever wrong with the product. That cost a whole leg, and the
 * sentence it fails with names Playwright's config rather than the orphan, so the natural next move
 * is to edit `reuseExistingServer`, which would silently run the suite against a server built from
 * DIFFERENT bytes: green over stale code is the worst outcome available here.
 *
 * So the leg REFUSES up front, and refuses rather than killing: the listener might be a dev server
 * somebody is deliberately using, and this script does not get to decide that. `PLAYWRIGHT_PORT` is
 * honoured because `playwright.config.ts` honours it.
 */
const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3000);
const portFree = await new Promise<boolean>((settle) => {
  const probe = createServer();
  probe.once('error', () => {
    settle(false);
  });
  probe.once('listening', () => {
    probe.close(() => {
      settle(true);
    });
  });
  probe.listen(PORT, '127.0.0.1');
});
if (!portFree) {
  refuse(
    `port ${String(PORT)} is already in use, so Playwright's webServer cannot start and the leg ` +
      'would fail after the whole build+migrate+seed chain for a reason that has nothing to do with ' +
      'the product. Usually an orphaned `next start` from a leg that died mid-suite — find it with ' +
      `\`lsof -nP -iTCP:${String(PORT)} -sTCP:LISTEN\` and stop that process, or point this leg ` +
      'elsewhere with `PLAYWRIGHT_PORT`. Do NOT set `reuseExistingServer`: the suite would then run ' +
      'against a server built from different bytes.',
  );
}
log(`port ${String(PORT)} is free.`);

const child = spawnSync(
  'pnpm',
  ['exec', 'tsx', 'scripts/dev-postgres.ts', '--reset', '--run', INNER_COMMAND],
  {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      CI: '1',
      TEST_ONLY_DISABLE_AUTH_RATE_LIMIT: AUTH_RATE_LIMIT_TEST_OVERRIDE,
    },
  },
);

const code = child.status ?? 1;
if (child.error !== undefined) {
  process.stderr.write(`[e2e-local] the child could not be started: ${String(child.error)}\n`);
}
log(
  `E2E LEG VERDICT: exit ${String(code)} (the exit code IS the verdict — not the "N passed" line)`,
);
process.exit(code);
