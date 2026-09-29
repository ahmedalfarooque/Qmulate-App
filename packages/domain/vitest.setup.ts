/**
 * `vitest.setup.ts` — yield the worker's event loop after every test.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS. IT IS NOT A SETUP FIXTURE; IT IS A CI CORRECTNESS FIX.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Three consecutive CI runs of `sprint/s3-e6-domain` (31483348149, 31483906799, 31489512114)
 * failed the Unit tests job with **every test passing**:
 *
 *     Test Files  29 passed (29)
 *     Tests       1696 passed (1696)
 *     Errors      1 error
 *     Error: [vitest-worker]: Timeout calling "onTaskUpdate"
 *
 * …then `@qmulate/domain#test … exited (1)`, which skipped Build, Integration, G-8 and E2E. A
 * pipeline that reports a fully-passing suite as a failure is worse than a slow one: it trains the
 * next reader to disbelieve red, and this repo has already been bitten by a green build that meant
 * nothing (the Turborepo cache hole that let a parity test silently not run).
 *
 * ── THE MECHANISM, read out of vitest's own source rather than guessed ──────────────────────
 * `onTaskUpdate` is the worker→main RPC a vitest worker uses to report progress. It goes through
 * **birpc**, whose per-call timeout is `DEFAULT_TIMEOUT = 6e4` — 60 seconds — in
 * `vitest/dist/chunks/index.*.js`. On timeout vitest's `onTimeoutError` **throws unconditionally**
 * (`chunks/rpc.*.js`), the call's promise rejects, and the rejection surfaces as a run-level
 * unhandled error. There is no user-facing config for that timeout: `createBirpc` only skips the
 * timer when `timeout < 0`, and vitest never passes one through.
 *
 * The worker can only *receive* main's reply when its event loop reaches a **macrotask** boundary.
 * Vitest awaits between tests, but awaiting a synchronous test body yields only microtasks — which
 * do not let the message port be serviced. So a file whose tests are all synchronous blocks the
 * worker's event loop for the file's whole duration.
 *
 * `distribution.property.test.ts` is exactly that file: two 10 000-run fast-check properties plus
 * dozens more, all synchronous. Locally the two big ones measure 6.6 s and 8.2 s and the file is far
 * under a minute; on CI the same suite reports `tests 80.90s`, so the file's cumulative synchronous
 * time crosses 60 s and a pending `onTaskUpdate` is never answered in time.
 *
 * ── WHY NOT THE OTHER THINGS, ALL OF WHICH WERE TRIED OR CONSIDERED ────────────────────────
 * · **`turbo --concurrency=2`** (attempt 1) — blamed cross-package contention. WRONG: the next run
 *   failed identically and named `@qmulate/domain#test` alone. Kept anyway, harmless, but it is not
 *   the fix and the CI comment records that it was a misdiagnosis.
 * · **`fileParallelism: false`** (attempt 2) — took effect (duration went to 95 s, sequential) and the
 *   timeout still fired, which is what ruled out worker-vs-worker starvation.
 * · **Raising `testTimeout`** — cannot help. This is not a test timing out; every test passes. The 60 s
 *   is an RPC deadline, not a test budget.
 * · **`dangerouslyIgnoreUnhandledErrors`** — would suppress genuine unhandled errors too. Masking.
 * · **A CI retry** — would dress a deterministic failure up as flake. Worse than the failure.
 * · **Trimming the 10 000 runs** — breaches the E6 exit clause ("fast-check finds no waterfall
 *   leakage over 10k generated cases"). Never on the table.
 *
 * ── WHAT THIS DOES ────────────────────────────────────────────────────────────────────────
 * One `setImmediate` after each test: a real macrotask boundary, so the worker services its message
 * port and any pending `onTaskUpdate` resolves long before the 60 s deadline. Cost is one event-loop
 * turn per test — about a millisecond across the whole suite, against a ~95 s run.
 *
 * ⚠ **This is not I/O and it does not weaken the purity constraint.** The config's standing rule —
 * *"if a test here ever needs a setup file that touches I/O, the code under test is in the wrong
 * package"* — still holds: nothing here reads a file, a socket, a clock or an environment variable.
 * It schedules an empty callback and returns.
 */
import { afterEach } from 'vitest';

afterEach(async () => {
  await new Promise((resolve) => {
    setImmediate(resolve);
  });
});
