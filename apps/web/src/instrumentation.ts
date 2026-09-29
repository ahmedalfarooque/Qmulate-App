/**
 * QMULATE web — server boot hook.
 *
 * Next.js calls `register()` once, on the server, before the first request is handled. It is the only
 * place in this app where "refuse to start" is expressible: a throw here fails the process rather
 * than one request.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS AT ALL  (ADR-0008 round 6 — privilege separation)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The runtime database role (`qmulate_app`, `DATABASE_URL`) now owns nothing and holds no
 * INSERT/UPDATE/DELETE on `waqf_access_grant` or `membership`. That is what closes route 2 of the
 * ADR-0008 reproduction — a caller with any seat can no longer forge itself a `NAZIR` grant through
 * `$executeRawUnsafe`, because the privilege is gone rather than because a trigger inspected a row.
 *
 * **All of that is undone, silently, if this service is also given `MIGRATOR_DATABASE_URL`.** That
 * credential connects as `qmulate_owner`, which owns every table and can therefore
 * `ALTER TABLE … DISABLE TRIGGER` every guard in migrations 1–11 and write the authorization plane
 * directly. Nothing in the application would behave differently, and no test in this repository could
 * detect it, because it is a deployment fact.
 *
 * Railway may scope environment variables per ENVIRONMENT rather than per SERVICE, and CI's
 * "Apply migrations on staging" step needs `MIGRATOR_DATABASE_URL` to exist in that environment. So
 * the misconfiguration this guards against is not hypothetical — it is the default outcome of one
 * plausible platform behaviour. `assertNoPrivilegedDatabaseUrls()` is the detector, it costs one call
 * at boot, and it fails CLOSED.
 *
 * `ACCESS_MATRIX_DATABASE_URL` is deliberately NOT refused: `grant.activate` needs it. Whether
 * access-matrix administration should move to a separate ops service — taking that credential out of
 * the web environment too — is an open product-owner decision in ADR-0008's round-6 addendum.
 *
 * ── ⚠ WHY THE IMPORT IS `@qmulate/config/privileged-urls` AND NOT `@qmulate/config/env` ──────────
 * Next compiles `instrumentation.ts` for BOTH the nodejs and the EDGE runtime. `@qmulate/config/env`
 * imports the `.env` loader, which reads `node:fs`, `node:path` and `node:url` — and an edge bundle
 * that reaches a node builtin fails the WHOLE build with
 * `UnhandledSchemeError: Reading from "node:fs" is not handled by plugins`. MEASURED, on the first
 * attempt at this file. `@qmulate/config/privileged-urls` exists precisely so this guard is
 * dependency-free while the list of privileged variable names is still defined exactly once.
 */

import {
  assertNoPrivilegedDatabaseUrls,
  assertNoWorkerOnlyDatabaseUrls,
} from '@qmulate/config/privileged-urls';

export function register(): void {
  assertNoPrivilegedDatabaseUrls('apps/web');
  // S10/T1: the queue credential (PGBOSS_DATABASE_URL) is worker-only. Not privileged in the
  // owner-credential sense, but a web service holding it can silently stop the deadline engine —
  // and "apps/web never receives it" is a control here, not a deployment hope.
  assertNoWorkerOnlyDatabaseUrls('apps/web');
}
