/**
 * QMULATE — the privilege-separation boot guard.  (ADR-0008 round 6)
 *
 * ⚠ THIS MODULE MUST NEVER IMPORT A NODE BUILTIN, ZOD, OR `./load-env.js`.
 *
 * `apps/web/src/instrumentation.ts` imports it, and Next compiles instrumentation for BOTH the nodejs
 * and the EDGE runtime. An edge bundle that reaches `node:fs` fails the entire build with
 * `UnhandledSchemeError: Reading from "node:fs" is not handled by plugins` — MEASURED, when this guard
 * still lived in `env.ts` next to the `.env` loader. Keeping it dependency-free is what lets the ONE
 * list of privileged variable names be shared by the web app, the worker and the env schema instead of
 * being copied into three places.
 *
 * It reads `process.env` directly rather than a parsed schema, deliberately: the point is to catch a
 * variable that is PRESENT, and a service that never reads it would never parse it.
 */

/** Thrown when a privileged credential is found in an application service's environment. */
export class PrivilegedDatabaseUrlError extends Error {
  readonly code = 'PRIVILEGED_DATABASE_URL_PRESENT';
  readonly variables: readonly string[];

  constructor(service: string, variables: readonly string[]) {
    // Names only, never values — the secret-hygiene rule this package is built on. These are
    // connection strings with passwords in them.
    super(
      [
        `${service} refuses to boot: privilege separation (ADR-0008 round 6).`,
        `  ${variables.join(', ')}: present in this service's environment, and must not be.`,
        `  That credential owns every table (or is the platform superuser), so it can suspend every`,
        `  guard trigger in migrations 1-11 and write waqf_access_grant directly — which is exactly`,
        `  the privilege the runtime role was stripped of.`,
        `  Keep it on the migrate/ops service or in CI only. If Railway scopes variables per`,
        `  ENVIRONMENT rather than per SERVICE, move it to a dedicated service instead.`,
      ].join('\n'),
    );
    this.name = 'PrivilegedDatabaseUrlError';
    this.variables = variables;
  }
}

/**
 * The variables that must NEVER appear in an application service's environment.
 *
 * `MIGRATOR_DATABASE_URL` connects as `qmulate_owner`, which owns every table —
 * so it can `ALTER TABLE … DISABLE TRIGGER` every guard in migrations 1–11,
 * `DROP` any constraint, and write the authorization plane directly.
 * `SUPERUSER_DATABASE_URL` is the platform credential and bypasses even
 * ownership checks and `FORCE ROW LEVEL SECURITY`.
 *
 * `ACCESS_MATRIX_DATABASE_URL` is deliberately NOT on this list: the shipped
 * `grant.activate` procedure needs it, so a web service that serves that
 * procedure must hold it. Whether access-matrix administration should instead
 * move to a separate ops service — which would take this credential out of the
 * web environment entirely — is an open product-owner decision recorded in
 * ADR-0008's round-6 addendum, not something this function can settle.
 *
 * `PGBOSS_DATABASE_URL` is deliberately NOT on this list either, and that is a
 * DECISION, not an omission (S10/T1). It connects as `qmulate_pgboss`, which
 * owns schema `pgboss` and holds NOTHING in `public`: it cannot read endowment
 * data, cannot `ALTER TABLE … DISABLE TRIGGER` a guard, cannot write the
 * authorization plane — so it is not "privileged" in the sense this list
 * means. ⚠ Its blast radius is NOT zero: a service holding it can drop or
 * drain the queue schema and thereby SILENTLY STOP THE DEADLINE ENGINE, which
 * is G-5 territory. It is therefore a WORKER-ONLY credential, enforced by
 * {@link assertNoWorkerOnlyDatabaseUrls} at apps/web's boot — this function's
 * per-service story cannot express it, because the list here does not vary by
 * service (the `service` parameter reaches only the error message). Sits
 * ADJACENT to ADR-0008's round-6 open item (whether ops credentials move to a
 * dedicated service); adjacency noted, no new owner question manufactured.
 */
export const PRIVILEGED_DATABASE_URL_VARIABLES = [
  'MIGRATOR_DATABASE_URL',
  'SUPERUSER_DATABASE_URL',
] as const;

/**
 * Credentials that belong to `apps/worker` ALONE. Not privileged in the
 * table-ownership sense above — but a web service has no business holding a
 * queue credential, and Railway env vars "may be scoped per-environment rather
 * than per-service" (the exact inheritance path the guard above exists for).
 * The bound "apps/web never receives it" is a CONTROL here, not a sentence in
 * a plan: {@link assertNoWorkerOnlyDatabaseUrls} makes web refuse to boot.
 */
export const WORKER_ONLY_DATABASE_URL_VARIABLES = ['PGBOSS_DATABASE_URL'] as const;

/** Thrown when a worker-only credential is found in another service's environment. */
export class WorkerOnlyDatabaseUrlError extends Error {
  readonly code = 'WORKER_ONLY_DATABASE_URL_PRESENT';
  readonly variables: readonly string[];

  constructor(service: string, variables: readonly string[]) {
    // Names only, never values — same secret hygiene as PrivilegedDatabaseUrlError, but the
    // blast-radius sentence is this credential's OWN: it cannot touch endowment data, and the
    // harm it CAN do is different, so borrowing the owner-credential text would misdescribe
    // the refusal to exactly the person debugging it.
    super(
      [
        `${service} refuses to boot: worker-only credential present (S10/T1).`,
        `  ${variables.join(', ')}: present in this service's environment, and must not be.`,
        `  That credential owns the queue schema (pgboss). It cannot read endowment data, but a`,
        `  holder can drop or drain the queue and silently stop the deadline engine — and a web`,
        `  service has no business holding it at all. Keep it on apps/worker only. If Railway`,
        `  scopes variables per ENVIRONMENT rather than per SERVICE, scope this one per service.`,
      ].join('\n'),
    );
    this.name = 'WorkerOnlyDatabaseUrlError';
    this.variables = variables;
  }
}

/**
 * Refuses to let a NON-WORKER service boot while holding a worker-only credential.
 * Same shape, same fail-closed direction, same names-only error hygiene as
 * {@link assertNoPrivilegedDatabaseUrls}; a separate function because the two
 * lists answer different questions ("owns the schema" vs "belongs to one service").
 *
 * @param service the non-worker service asserting — `'apps/web'`.
 */
export function assertNoWorkerOnlyDatabaseUrls(service: string): void {
  const present = WORKER_ONLY_DATABASE_URL_VARIABLES.filter((name) => {
    const value = process.env[name];
    return value !== undefined && value.trim() !== '';
  });
  if (present.length === 0) return;

  throw new WorkerOnlyDatabaseUrlError(service, present);
}

/**
 * Refuses to let an application service boot while holding a privileged database credential.
 *
 * ⚠ WHY A GUARD AND NOT A CONVENTION. Railway environment variables may be scoped per-environment
 * rather than per-service, and the "Apply migrations on staging" CI step needs
 * `MIGRATOR_DATABASE_URL` to exist in that environment. If the scope turns out to be environment-wide,
 * the web service inherits the owner credential and the privilege split is worth nothing — silently,
 * with every test still green. This is the cheapest possible detector of that, it costs one line at
 * each boot, and it fails CLOSED.
 *
 * It reads `process.env` directly rather than the parsed schema, because the point is to catch a
 * variable that is PRESENT, and a service that never reads it would never parse it.
 *
 * @param service the name to put in the error — `'apps/web'`, `'apps/worker'`.
 */
export function assertNoPrivilegedDatabaseUrls(service: string): void {
  const present = PRIVILEGED_DATABASE_URL_VARIABLES.filter((name) => {
    const value = process.env[name];
    return value !== undefined && value.trim() !== '';
  });
  if (present.length === 0) return;

  throw new PrivilegedDatabaseUrlError(service, present);
}
