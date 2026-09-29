/**
 * PLAYWRIGHT'S WEB SERVER — a `next start` wrapper that REFUSES TO HIDE A SERVER RESTART.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────────────────────
 *
 * For seven consecutive CI runs the E2E job was green only because a retry absorbed a failure, and
 * the cause was the DEV server killing itself mid-suite. `next dev`'s request listener re-checks the
 * V8 heap after EVERY request and exits the process when it crosses 80% of the limit
 * (`next/dist/server/lib/start-server.js`, inside `requestListener`'s `finally`, gated on `isDev`):
 *
 *     if (v8.getHeapStatistics().used_heap_size > 0.8 * v8.getHeapStatistics().heap_size_limit) {
 *       log.warn('Server is approaching the used memory threshold, restarting...');
 *       process.exit(RESTART_EXIT_CODE);
 *     }
 *
 * The supervisor brings it back in ~2.9 s, and for that window NOTHING IS BOUND TO :3000 — so
 * whichever navigation is in flight dies with `net::ERR_CONNECTION_REFUSED`. CI run 32140325175 shows
 * the chain with nothing between the lines: a 200 on `…/deed`, the warning, the failure on the very
 * next sub-route, `▲ Next.js 15.5.22`, `✓ Ready in 2.9s`, then a pass on retry #1.
 *
 * ── ⊕ S7: THIS NOW SPAWNS THE PRODUCTION SERVER, AND THAT IS THE FIX ─────────────────────────
 *
 * **`next build` + `next start` makes `isDev` FALSE, so the branch above cannot execute.** That is
 * the only measured route to zero crossings, and the owner approved taking it
 * (`docs/product/prd/S4-owner-decision-memo.md` — "S7 · E2E-vs-rate-limiter posture", 2026-08-19).
 * What had blocked it was auth, not memory: a production server **429s the suite**, because
 * better-auth's rate limiter is off in development and on in production and this repo configured
 * none. That is now an explicit posture with a doubly-gated, fail-closed test override —
 * `packages/auth/src/rate-limit.ts`, and `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT` in the E2E job's
 * environment. **This wrapper does not set that variable and must not**: a harness that relaxes a
 * security control by itself is a harness that relaxes it everywhere it runs.
 *
 * ⚠ **THE TRIPWIRE BELOW THEREFORE SHOULD NEVER FIRE AGAIN — WHICH IS EXACTLY WHY IT STAYS.** Its
 * job has changed from *detecting the flake* to **detecting a silent revert to `next dev`**: if a
 * future change swaps this command back (or a `webServer.command` edit bypasses this file), the
 * marker returns, and `global-teardown.ts` fails the run with the cause named instead of letting a
 * retry absorb it for another three sprints. A guard whose alarm is silent is doing its job.
 *
 * ── THE MEASUREMENT MATRIX, WHICH THE SWITCH DOES NOT INVALIDATE ─────────────────────────────
 *
 * **The heap knob was tried and is measured BACKWARDS. That result still stands and is still the
 * reason not to reach for it.** An earlier version of this file pinned `--max-old-space-size=4096`
 * on the theory that a declared budget beats one V8 derives from the host:
 *
 * | heap (under `next dev`) | result | crossings | wall |
 * |---|---|---|---|
 * | unpinned (2096 MB default on this host) | 72 passed | **0** | 4.5 m |
 * | **pinned 4096 MB** | **1 failed, 3 flaky, 68 passed** — killed `endowment.spec.ts:387 [en]` | **1** | **7.5 m** |
 * | pinned 768 MB | 8 spurious `toHaveURL` failures, compiles 1.3 s → 24.4 s | 0 | — |
 *
 * **Raising the limit CAUSED the crossing.** `used_heap_size` counts garbage that has not been
 * collected yet, and the trigger is `used > 0.8 * limit` — so a larger limit lets V8 defer GC, grow
 * `used_heap_size` to a larger absolute figure, and cross 80% anyway. A smaller limit makes V8 collect
 * harder and stay under, at the cost of pathological compile times. **The knob is not monotonic in the
 * direction the first version assumed, so every value is a guess about a host nobody has measured.**
 *
 * ⊕ **That same measurement produced THE FIRST LOCAL REPRODUCER OF THE CI FLAKE**, and it is kept:
 * `E2E_WEB_HEAP_MB=4096` **with a `next dev` child** (`E2E_WEB_SERVER_COMMAND`, below) reproduces it
 * on demand — same test (`endowment.spec.ts:387 [en]`), same signature, same 7.5 m wall-clock as CI.
 * It also explains why CI crossed on every run while this arm64 dev machine never did: `ubuntu-latest`
 * has 16 GB, so V8's default limit there is roughly double this host's 2096 MB.
 * **`E2E_WEB_HEAP_MB` is a reproducer; it is not a fix and must not be set in CI.** Note that it no
 * longer reproduces anything against the DEFAULT child — under `next start` there is no branch to
 * trip, which is the point of the switch.
 *
 * The sentinel is truncated at startup, so a crashed previous run cannot fail the next one.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { appendFileSync, existsSync, rmSync } from 'node:fs';

/** The exact string Next logs immediately before `process.exit(RESTART_EXIT_CODE)`. */
const RESTART_MARKER = 'approaching the used memory threshold';

/** Read by `global-teardown.ts`. Relative to `apps/web`, which is this process's cwd. */
export const RESTART_SENTINEL = '.e2e-webserver-restart';

/**
 * ⚠ **UNSET BY DEFAULT, DELIBERATELY — see the matrix in the header.** Setting this is a guess about
 * a host nobody has measured, and the guess is measured HARMFUL in the upward direction: 4096 MB
 * turned a clean 72-pass run into `1 failed, 3 flaky, 68 passed` with a crossing, because a bigger
 * limit lets V8 defer collection and cross 80% of a bigger number.
 *
 * **Its real use is as THE REPRODUCER**, and since S7 that requires BOTH variables, because the
 * default child no longer has the branch:
 *
 *     E2E_WEB_SERVER_COMMAND='pnpm --filter web dev' E2E_WEB_HEAP_MB=4096 pnpm --filter web test:e2e
 *
 * That is what to run when verifying a candidate fix for anything in this class. **Never set either
 * in CI.**
 */
const HEAP_MB = process.env.E2E_WEB_HEAP_MB ? Number(process.env.E2E_WEB_HEAP_MB) : null;

/**
 * ⚠ A TEST SEAM. The guard is verified by feeding this wrapper a child that PRINTS the marker —
 * deterministic, seconds long, and needing no database, where reproducing a real crossing costs a
 * 7.5-minute run and depends on the host. Both were done; this is the one that can be re-run cheaply
 * whenever the guard changes. Without it the guard would ship unverified, and a guard nobody has seen
 * fire is not a guard.
 *
 * ⊕ Since S7 it carries a second job: it is how `next dev` is summoned back deliberately (for the
 * reproducer above), now that the default child is the production server. Never set this in CI or in
 * a normal local run; `test:e2e` does not.
 */
const CHILD = process.env.E2E_WEB_SERVER_COMMAND
  ? ['sh', ['-c', process.env.E2E_WEB_SERVER_COMMAND]]
  : ['pnpm', ['--filter', 'web', 'start']];

/**
 * ⚠ `next start` NEEDS A BUILD, AND A MISSING ONE MUST NOT LOOK LIKE A TIMEOUT.
 *
 * Without this, an unbuilt tree fails as `Error: Could not find a production build` buried under
 * Playwright's 180-second `webServer` wait — three minutes to learn one word. The ordering is
 * turbo's job: `test:e2e` in `turbo.json` depends on this package's OWN `build` as well as
 * `^build`, because CI's Build job is a separate runner and this repository has no usable turbo
 * remote cache (no `TURBO_TOKEN` is configured). This check exists for the case where someone runs
 * `playwright test` directly.
 */
if (!process.env.E2E_WEB_SERVER_COMMAND && !existsSync('.next/BUILD_ID')) {
  process.stderr.write(
    '[e2e][web-server] ✗ NO PRODUCTION BUILD at apps/web/.next — `next start` cannot run.\n' +
      "  The e2e suite runs against `next build` + `next start` since S7 (that is what makes Next's\n" +
      '  memory-threshold restart branch unreachable — see the header). Build first:\n' +
      '      pnpm --filter web run build      # or: pnpm turbo run test:e2e, which depends on it\n',
  );
  process.exit(1);
}

rmSync(RESTART_SENTINEL, { force: true });

const child = spawn(CHILD[0], CHILD[1], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    // Only when explicitly asked for. Inherited by every node process Next spawns, which is the point
    // when reproducing: the limit must apply to the process that runs `requestListener`, not to this
    // wrapper.
    ...(HEAP_MB
      ? {
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --max-old-space-size=${HEAP_MB}`.trim(),
        }
      : {}),
  },
});

console.log(
  [
    `[e2e][web-server] child: ${CHILD[0]} ${CHILD[1].join(' ')}`,
    process.env.E2E_WEB_SERVER_COMMAND
      ? '⚠ E2E_WEB_SERVER_COMMAND is set — this is NOT the shipped harness'
      : "production build (next start) · Next's memory-threshold restart branch is unreachable here",
    HEAP_MB
      ? `⚠ HEAP PINNED to ${HEAP_MB} MB (threshold ~${Math.round(HEAP_MB * 0.8)} MB) — REPRODUCER, not a fix`
      : 'heap NOT pinned (host default)',
    'watching for Next memory-threshold restarts (a hit here now means a REVERT to next dev)',
  ].join(' · '),
);

/** Pass output through untouched — Playwright's `stdout: 'pipe'` still surfaces it — and scan it. */
for (const [stream, sink] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
]) {
  createInterface({ input: stream }).on('line', (line) => {
    sink.write(`${line}\n`);
    if (line.includes(RESTART_MARKER)) {
      appendFileSync(RESTART_SENTINEL, `${line}\n`);
      process.stderr.write(
        '[e2e][web-server] ⚠ THE SERVER CROSSED ITS MEMORY THRESHOLD AND IS RESTARTING. ' +
          'Any navigation in flight will fail with ERR_CONNECTION_REFUSED. This run will be FAILED ' +
          'by global-teardown rather than absorbed by a retry. Under the shipped harness this ' +
          'branch is unreachable (`isDev` is false), so a hit here means the suite is running a DEV ' +
          'server again — check webServer.command and E2E_WEB_SERVER_COMMAND.\n',
      );
    }
  });
}

/** Playwright kills the process group, but forwarding is explicit so a stray server is not left. */
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
