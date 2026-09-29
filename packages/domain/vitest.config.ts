import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // The domain package is pure: no DB, no network, no filesystem. If a test here
    // ever needs a setup file that touches I/O, the code under test is in the wrong package.
    //
    // `vitest.setup.ts` honours that rule and is NOT a fixture: it yields the worker's event loop
    // after each test (one `setImmediate`, no I/O) because a file of back-to-back SYNCHRONOUS tests
    // never reaches a macrotask boundary, so vitest's 60 s birpc deadline on `onTaskUpdate` expires
    // and a fully-passing suite is reported as a failed job. Read that file's header before removing
    // this line — three CI runs failed with 1696/1696 tests passing before it existed.
    setupFiles: ['./vitest.setup.ts'],
    globals: false,
    restoreMocks: true,
    // Vitest's default is 5 s, and that default is measured against a test running ALONE. These
    // suites do not: CI's unit job is `turbo run test` across nine workspaces, so nine vitest
    // instances compete for the box — and on a 2-core GitHub runner, harder than on any dev machine.
    //
    // MEASURED on this repo (S3): the 10 000-run leakage property takes 9.5 s in isolation and
    // 129.8 s inside a full `turbo run typecheck lint build test --force` — a 13.7× contention
    // factor. `acceptance.test.ts`'s AT-09 (50 canonicalization repeats, no fast-check at all) went
    // from 188 ms to 7 025 ms and blew the 5 s default. Both went red in the pipeline while passing
    // standalone.
    //
    // Five suites had already worked around this with their own `vi.setConfig`, which is
    // whack-a-mole: it fixes the file that happened to go red and leaves the next one exposed —
    // exactly how AT-09 slipped through. The budget belongs here, once. Per-file `vi.setConfig`
    // calls are kept where they exist: they document the intent locally and can only narrow.
    //
    // 60 s is a CEILING, not a duration. Nothing here normally runs longer than ~10 s, so a real
    // O(n²) regression still fails loudly; it is only generous enough that CONTENTION cannot.
    // A test that genuinely hangs still fails, just a minute later.
    testTimeout: 60_000,
    // ⚠ RUN THE FILES SEQUENTIALLY. This is not a performance preference — without it CI FAILS WITH
    // EVERY TEST PASSING, which is the most misleading red a pipeline can produce.
    //
    // MEASURED on CI runs 31483348149 and 31483906799 (`sprint/s3-e6-domain`), identically both times:
    //   Test Files  28 passed (28)
    //   Tests       1645 passed (1645)
    //   Errors      1 error
    //   Error: [vitest-worker]: Timeout calling "onTaskUpdate"
    // …then `@qmulate/domain#test … exited (1)`, which skipped Build, Integration, G-8 and E2E.
    //
    // `onTaskUpdate` is the worker→main RPC a vitest worker uses to report progress; when the main
    // thread cannot answer inside its (internal, unconfigurable) timeout the worker treats it as fatal.
    // The FIRST attempt at this blamed cross-package contention and capped `turbo --concurrency=2`; the
    // second run failed identically and the log named `@qmulate/domain#test` alone, so that diagnosis
    // was WRONG and is recorded here rather than quietly replaced. The real cause is inside this one
    // package: 28 files, several of them CPU-bound fast-check suites (the leakage property runs 10 000
    // engine executions), spread across parallel workers on a 2-core runner — the workers saturate both
    // cores and starve the main thread that has to answer them.
    //
    // Sequential execution removes the starvation instead of masking it. The alternatives were worse:
    // `dangerouslyIgnoreUnhandledErrors` would suppress real errors too, a CI retry would make a
    // deterministic failure look flaky, and trimming the 10 000 runs would breach the E6 exit clause.
    // Cost is wall-clock only (~27 s → ~50 s locally), paid once per run, and the property suites were
    // always the long pole regardless of how they were scheduled.
    fileParallelism: false,
  },
});
