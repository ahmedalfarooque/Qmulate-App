import { readFileSync, rmSync, existsSync } from 'node:fs';

/**
 * THE HALF OF THE FLAKE FIX THAT TURNS A SILENT RETRY INTO A FAILED RUN.
 *
 * `web-server.mjs` scans the server's output for Next's 80%-of-heap-limit restart warning and records
 * any crossing in a sentinel file. A crossing fails the run HERE, with its cause named. Before this,
 * `retries: 1` absorbed exactly one victim and the job went green: seven consecutive CI runs were
 * green with a restart in them, and the record read "the E2E job is green because a retry absorbed a
 * flake" for three sprints.
 *
 * ⊕ **S7 TOOK THE STRONGER GUARD TOO, AND THIS ONE CHANGED JOB RATHER THAN RETIRING.** The suite now
 * runs against `next build` + `next start`, where `isDev` is false and Next's restart branch CANNOT
 * EXECUTE — so this sentinel should never appear again. It is kept because it is the only thing that
 * would notice **a silent revert to `next dev`**: swap the wrapper's child, or bypass the wrapper in
 * `playwright.config.ts`, and the flake class comes back with `retries: 1` ready to hide it again.
 * The guard's alarm being silent is the guard working.
 *
 * So if this throws, do not read it as "the memory flake is back and needs a bigger budget". Read it
 * as: **something is running a DEV server**. Check `webServer.command` and `E2E_WEB_SERVER_COMMAND`
 * first.
 */
const RESTART_SENTINEL = '.e2e-webserver-restart';

export default function globalTeardown(): void {
  if (!existsSync(RESTART_SENTINEL)) return;

  const lines = readFileSync(RESTART_SENTINEL, 'utf8').trim();
  rmSync(RESTART_SENTINEL, { force: true });

  throw new Error(
    'The Next server crossed its memory threshold and restarted DURING this run, which unbinds ' +
      'port 3000 for ~3 s and kills whichever navigation is in flight (net::ERR_CONNECTION_REFUSED). ' +
      'Any test that "passed on retry" in this run is not evidence of anything.\n' +
      '⚠ FIRST QUESTION: WHY IS A DEV SERVER RUNNING? Since S7 the suite runs `next start` over a ' +
      'production build, where `isDev` is false and this branch is unreachable — so this message ' +
      'means the harness was reverted (webServer.command, e2e/web-server.mjs, or ' +
      'E2E_WEB_SERVER_COMMAND), not that a budget needs raising.\n' +
      '⚠ AND DO NOT "fix" it by raising E2E_WEB_HEAP_MB — that is MEASURED BACKWARDS: a 4096 MB pin ' +
      'turned a clean 72-pass run into 1 failed / 3 flaky / 68 passed WITH a crossing, because ' +
      'used_heap_size counts uncollected garbage and a bigger limit lets V8 defer GC and cross 80% ' +
      'of a bigger number. See apps/web/e2e/web-server.mjs and ' +
      `BUILD-PLAN.md.\nThe server said:\n${lines}`,
  );
}
