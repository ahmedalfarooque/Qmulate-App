// QMULATE — the Prisma client factory.
//
// ── ⚠ WHAT THIS FILE USED TO CLAIM, AND WHY THAT SENTENCE IS GONE (S2 round 4) ────────────────
// It opened with: "THERE IS EXACTLY ONE WAY TO GET A DATABASE HANDLE: `createPrismaClient(ctx)` …
// so there is no route to a client that has skipped the three cross-cutting guarantees." THAT WAS
// FALSE, and it was false in this very file: `getBasePrismaClient()` was a public export (barrel
// line 91, plus the `./client` subpath in `package.json`) that returned the raw, unextended client.
// MEASURED on a migrated + seeded fixture database, from the package's public barrel, as
// `user-unscoped` (a real seeded USER seat holding ZERO grants):
//
//   scoped  transaction.findMany()                  -> []                       (correct)
//   BASE    transaction.findMany()                  -> 5 rows, waqf-001+waqf-003
//   BASE    beneficiary.findMany()                  -> 6 rows, three endowments
//   BASE    waqfAccessGrant.findMany()              -> 17 rows (the whole access matrix)
//   scoped  asset.update({ valuationSar })          -> ForbiddenScopeError (column gate)
//   BASE    asset.update({ valuationSar })          -> PERMITTED: 18,000,000 -> 1
//                                                      audit_event 132 -> 132.  DELTA 0.
//   BASE    setting.update({ value })               -> PERMITTED, audit delta 0
//
// So one export defeated the force filter (NFR-05), the `DOMAIN_WRITE_POLICIES` column gate and the
// audit spine (NFR-04) at once — while the comment above it told the next reader no such route
// existed. This is the third comment in this sprint to assert a security property the code did not
// have, and the previous two were believed. The rule that follows: a comment in this file states
// what was MEASURED, and names its residual.
//
// ── WHAT IS TRUE NOW ──────────────────────────────────────────────────────────────────────────
// `createPrismaClient(ctx)` is the only way to get a handle that carries all three cross-cutting
// guarantees:
//
//   audit       every mutation commits with its append-only, hash-chained event  (NFR-04)
//   scoping     every query is force-filtered to the caller's endowments         (NFR-05)
//   encryption  UBO identity and IBANs are AES-256-GCM at rest                   (§12)
//
// The raw client is now MODULE-PRIVATE (`rawUnextendedClient()`, below — not exported from this
// file, not from the barrel, not from any subpath). `getBasePrismaClient()` survives as a
// deliberately NARROWER public handle, and the exact residual it still leaves is enumerated on it.
//
// ── ⚠ "NOT FROM ANY SUBPATH" ONLY BECAME TRUE IN ROUND 6, AND IT WAS A REAL HOLE ──────────────
// `package.json#exports` carried `"./client": "./src/client.ts"` — a wholesale re-export of THIS
// module. So `import { … } from '@qmulate/database/client'` reached every export here directly, past
// the barrel and past every allowlist in `test/base-client-export-surface.test.ts` (which checks the
// barrel and the set of files that NAME a symbol — a subpath re-export is neither). Once round 6 added
// `createAccessMatrixPrismaClientInternal`, that subpath handed any package in the monorepo a client on
// the role holding `INSERT` on `waqf_access_grant`, with `$executeRawUnsafe` on it: ADR-0008's finding,
// in one import. MEASURED: nothing imported it anywhere in `packages/**`, `apps/**` or `scripts/**`.
// The subpath is DELETED and a test asserts it stays deleted, and that no other subpath points at a
// module exporting a connection factory.
//
// ── THE ORDER IS PART OF THE DESIGN ───────────────────────────────────────────────────────────
//     base.$extends(audit).$extends(scoping).$extends(encryption)
//
// Prisma composes query extensions so the LAST applied is the OUTERMOST. Arguments therefore flow
// encryption -> scoping -> audit -> database, and results unwind in reverse. Two consequences,
// both required:
//   • audit sees CIPHERTEXT, never plaintext — the trail cannot become a PII sink by accident
//   • callers get PLAINTEXT back — the round trip is invisible above this layer
// `EXTENSION_ORDER` records it and a unit test asserts it.
//
// ── ⚠ USE `withAudit()`, NOT `db.$transaction()`, FOR WRITES ──────────────────────────────────
// The audit extension routes each mutation into the transaction that `withAudit()` opened, which
// it discovers through an AsyncLocalStorage. A transaction opened with the extended client's own
// `db.$transaction()` is invisible to it, so a write inside that block would be re-executed in a
// SECOND, independent transaction — the audit event and the business row would still be atomic
// with each other, but not with the rest of the caller's block. `withAudit()` is the only write
// path that composes correctly. Reads through `db.$transaction()` are unaffected.

import { toHijriSnapshot } from '@qmulate/domain/dates';

import { PrismaClient } from '../generated/client/index.js';
import {
  RESERVED_MATTER_APPROVAL_GUC,
  SYSTEM_CONTEXT,
  assertBypassNotUser,
  isRequestContext,
  type RequestContext,
} from './context.js';
import {
  createAuditExtension,
  currentAuditTransaction,
  outsideAuditTransaction,
  recordAuditEvent,
  runAuditedTransaction,
  setHijriFormatter,
  type AuditEventInput,
  type AuditTransactionOptions,
  type RawTransactionClient,
} from './extensions/audit.js';
import { createEncryptionExtension } from './extensions/encryption.js';
import { ALL_MODELS, createScopingExtension, setScopeDenialHandler } from './extensions/scoping.js';

/** Documentary, and asserted by a unit test. Inner to outer. */
export const EXTENSION_ORDER = ['audit', 'scoping', 'encryption'] as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THREE HIJRI IMPLEMENTATIONS BECOME ONE (user decision D-4, 2026-07-27)
//
// `packages/domain` owns the single Umm al-Qura conversion. `setHijriFormatter()` is the collapse
// hook the audit extension shipped in Sprint 1 and NOBODY EVER CALLED — so `defaultToHijri` in
// `extensions/audit.ts` stayed a second, independent, anchor-untested implementation stamping
// `occurredAtHijri` on every audit event, while `src/seed/hijri.ts` was a third.
//
// It is installed HERE, at module scope, because `client.ts` is on the path of every way this package
// can write: `createPrismaClient()`, `withAudit()`, `recordEvent()` and `getSystemPrisma()` all live
// in this file, and `src/index.ts` imports it. So there is no route to an audit write that has not
// executed this line. Installing it in the seed instead would have left every OTHER writer on the
// second implementation, which is the situation this replaces.
//
// The domain implementation THROWS outside the Umm al-Qura table window (1300–1600 AH) rather than
// letting ICU extrapolate a nonsense answer. That is correct for an audit stamp: `occurredAt` is
// always `now()` or a fixture-only override, and a date outside the window is a bug, not a date.
// `test/hijri-parity.integration.test.ts` asserts the three former call sites now agree.
// ═══════════════════════════════════════════════════════════════════════════════════════════
setHijriFormatter((date: Date) => toHijriSnapshot(date));

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The base client
// ═══════════════════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════════════════
// THREE CONNECTIONS, THREE DATABASE ROLES  (ADR-0008 round 6 — privilege separation)
//
// ── WHAT CHANGED AND WHY ──────────────────────────────────────────────────────────────────────
// Until now this file held ONE pool on `globalThis.__qmulatePrismaBase`, and that pool connected as
// the database OWNER. Every control in migrations 1–9 was therefore advisory against the one actor
// they were written to constrain: the owner bypasses GRANTs, bypasses RLS, and can
// `ALTER TABLE … DISABLE TRIGGER` its own guards. Migration 9's header states the consequence
// exactly — route 2 of the ADR-0008 reproduction "is NOT closable by any in-database marker logic
// … while attacker and application share ONE database role". This is the file that ends the
// sharing.
//
//   'app'          DATABASE_URL                 → qmulate_app.  Everything on the request path.
//                                                 SELECT-only on `waqf_access_grant`/`membership`;
//                                                 owns nothing, so no DDL and no trigger suspension.
//   'provisioner'  ACCESS_MATRIX_DATABASE_URL   → qmulate_provisioner.  The ONE narrow audited path
//                                                 that may mint or widen a seat (`access-matrix.ts`)
//                                                 or DECIDE an approval (`approval-plane.ts`, S12-1 /
//                                                 AV4-02). Still fully subject to grant admission and
//                                                 to the approval-authority trigger.
//   'owner'        MIGRATOR_DATABASE_URL        → qmulate_owner.  Migrations, the fixture seed, the
//                                                 test harnesses' scaffolding, one-off bootstrap.
//
// ── ⚠ THERE IS NO FALLBACK, AND THAT IS THE POINT ─────────────────────────────────────────────
// A missing `ACCESS_MATRIX_DATABASE_URL` or `MIGRATOR_DATABASE_URL` THROWS, naming the variable. It
// does NOT quietly use the app connection. A privilege split that silently falls back is worse than
// none: it looks done, every test stays green, and the privileged write lands on the unprivileged
// connection — where it either fails with a confusing 42501 or, if a later migration ever loosens
// one GRANT, succeeds and defeats the whole design. `'app'` is the only role that may be absent-free
// (Prisma reads `DATABASE_URL` from the datasource block itself).
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** Which database role a connection authenticates as. */
export type ConnectionRole = 'app' | 'provisioner' | 'owner';

/** The environment variable each connection is built from. Mirrored in `.env.example`. */
export const CONNECTION_ROLE_ENV: Readonly<Record<ConnectionRole, string>> = {
  app: 'DATABASE_URL',
  provisioner: 'ACCESS_MATRIX_DATABASE_URL',
  owner: 'MIGRATOR_DATABASE_URL',
};

/** A privileged connection was asked for but its credential is not in the environment. */
export class MissingConnectionCredentialError extends Error {
  readonly code = 'MISSING_CONNECTION_CREDENTIAL';
  readonly role: ConnectionRole;

  constructor(role: ConnectionRole) {
    super(
      `${CONNECTION_ROLE_ENV[role]} is not set, so no "${role}" database connection can be opened. ` +
        `Since ADR-0008 round 6 the runtime role (qmulate_app) holds no INSERT/UPDATE/DELETE on ` +
        `waqf_access_grant or membership and owns no table, so the ${role} path CANNOT fall back to ` +
        `it — it would either fail with 42501 or, worse, look like it worked. Provision the roles ` +
        `with \`pnpm exec tsx scripts/provision-db-roles.ts\` and set ` +
        `${CONNECTION_ROLE_ENV[role]}. In tests, \`scripts/dev-postgres.ts\` injects all three.`,
    );
    this.name = 'MissingConnectionCredentialError';
    this.role = role;
  }
}

declare global {
  var __qmulatePrismaPools: Partial<Record<ConnectionRole, PrismaClient>> | undefined;
}

/**
 * One unextended client — and therefore one connection pool — per database role.
 *
 * ⚠ MODULE-PRIVATE, AND THAT IS THE CONTAINMENT. Nothing exports this function: not this file, not
 * `src/index.ts`, not the `./client` subpath. The callers are all in this file (or in
 * `access-matrix.ts`, through a narrow accessor that returns a write-guarded façade), each of which
 * needs raw power precisely because it is the thing that installs the guarantees.
 *
 * `$extends` returns a lightweight proxy over the SAME engine and pool, so building a client per
 * request costs almost nothing — that is what makes per-request scoping affordable.
 *
 * Cached on `globalThis` because Next.js dev-mode hot reload re-evaluates modules on every edit;
 * without it each reload would leak a pool until Postgres refused new connections.
 *
 * ⚠ `datasourceUrl` IS PASSED ONLY FOR THE NON-DEFAULT ROLES. The `'app'` client is constructed
 * exactly as it always was, so Prisma reads `DATABASE_URL` from the datasource block and nothing on
 * the request path changes shape. Passing it explicitly would also work, but it would mean this
 * module could no longer be imported by a process that has no `DATABASE_URL` at all (every unit
 * test), which is a regression the old code did not have.
 */
function rawUnextendedClient(role: ConnectionRole = 'app'): PrismaClient {
  globalThis.__qmulatePrismaPools ??= {};
  const pools = globalThis.__qmulatePrismaPools;

  const cached = pools[role];
  if (cached) return cached;

  const log: ('query' | 'warn' | 'error')[] =
    process.env.PRISMA_LOG_QUERIES === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'];

  if (role === 'app') {
    pools.app = new PrismaClient({ log });
    return pools.app;
  }

  const url = process.env[CONNECTION_ROLE_ENV[role]]?.trim();
  if (url === undefined || url === '') throw new MissingConnectionCredentialError(role);

  const client = new PrismaClient({ log, datasourceUrl: url });
  pools[role] = client;
  return client;
}

/** True when the credential for `role` is present, so a caller can fail early with a better message. */
export function hasConnectionCredential(role: ConnectionRole): boolean {
  if (role === 'app') return (process.env.DATABASE_URL ?? '') !== '';
  const url = process.env[CONNECTION_ROLE_ENV[role]]?.trim();
  return url !== undefined && url !== '';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// The write-guarded unextended handle — what `getBasePrismaClient()` now hands out
//
// ── WHY THIS SHAPE, AND WHAT THE OTHER TWO OPTIONS COST ───────────────────────────────────────
// Three containments were weighed for the bypass measured at the top of this file.
//
//   (1) STOP EXPORTING IT (module-private). Correct in principle and it is what happened to the RAW
//       client — but it cannot be the whole answer, because `getBasePrismaClient` is not an
//       unused export. It has FIVE call sites outside this file: `packages/auth/src/server.ts`
//       (the better-auth Prisma adapter), `packages/api/src/context.ts` (resolving a caller's
//       grants BEFORE a context exists — a genuine chicken-and-egg), `src/seed.ts`, and the two
//       integration-test harnesses, which reach it 119 times. Deleting the export breaks all of
//       them and three of those files are outside this change's remit.
//
//   (2) REQUIRE A DECLARED REASON ARGUMENT. Rejected, and worth saying why: an exported
//       `getUnextendedPrismaClient({ purpose })` is a NEW wide door that any caller opens by naming
//       any allowlisted purpose. It is ADR-0008's own argument about the reserved-matter GUC — "an
//       actor who can already call the function can set the marker as easily as they can insert the
//       row" — so it raises the cost of the attack and closes nothing. It would also have to be
//       exported to be reachable by the five call sites above, which is the hole again.
//
//   (3) NARROW WHAT THE EXPORTED HANDLE CAN DO. Shipped. The five honest callers turned out not to
//       need raw power at all — MEASURED: `grep -rE 'prisma\.[a-z]+\.(create|update|delete|upsert|
//       createMany|updateMany|deleteMany)\('` over both test harnesses returns ZERO, `packages/api`
//       reads only, and better-auth touches only the five identity tables. So the exported handle
//       keeps exactly that surface and refuses the rest, and the raw client goes private.
//
// ── WHAT IS REFUSED, WHAT IS PERMITTED, AND WHAT IS STILL OPEN ────────────────────────────────
// REFUSED: every Prisma-delegate WRITE verb on every model except the identity plane, plus
//          `$extends` (which would otherwise launder the guard away in one call).
// PERMITTED: reads on every model; writes on the five identity tables better-auth owns; raw SQL;
//          and — only through the identity check in {@link guardedDelegate} — the audit spine
//          re-issuing a caller's mutation into its own transaction.
// STILL OPEN, STATED RATHER THAN GLOSSED:
//   • CROSS-ENDOWMENT READS. `getBasePrismaClient().beneficiary.findMany()` still returns every
//     endowment's rows. It CANNOT be closed here: `packages/api`'s grant resolution and 119
//     test-harness call sites are exactly such reads, and closing it needs those call sites
//     migrated to purpose-built accessors — outside this change's files. Leg (a) of the
//     reproduction is therefore REPRODUCED AND STILL LIVE, and
//     `test/base-client-bypass.integration.test.ts` PINS it as open so no later reader mistakes
//     this guard for a complete one.
//   • RAW SQL. `$executeRawUnsafe` on this handle is exactly as unguarded as it is on a scoped
//     client. What CHANGED in ADR-0008 round 6 is not this handle but the database ROLE underneath
//     it: on the app connection a raw write to `waqf_access_grant`/`membership` is now
//     `42501 permission denied`, DDL is `42501 must be owner of table`, and
//     `SET session_replication_role` is refused outright. What did NOT change is raw writes to
//     ORDINARY audited tables — the runtime must keep `INSERT`/`UPDATE` there — so an unaudited
//     `UPDATE "asset" SET "valuationSar" = …` through this handle is STILL permitted. Closing that
//     needs per-table audit triggers, not a GRANT. See `SCOPING_KNOWN_GAPS` item (1).
//   • The identity plane is allowed to be written UNAUDITED, which is the status quo better-auth
//     already relies on (`server.ts` has its own TODO for §12 AUTH auditing). `User` is an AUDITED
//     model, so a `user` row created by better-auth still leaves no `audit_event`. Not introduced
//     here; not fixed here either.
//   • Everything here is a Prisma-client control, so a table owner can drop the underlying guards
//     with DDL and the insider with application-database credentials stays in the threat model
//     (ADR-0008). This closes an APPLICATION route, not the deployment gap.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** A write verb was issued on the unextended handle. */
export class UnextendedClientWriteError extends Error {
  readonly code = 'UNEXTENDED_CLIENT_WRITE';
  readonly delegate: string;
  readonly operation: string;

  constructor(delegate: string, operation: string) {
    super(
      `${delegate}.${operation}() was issued on the UNEXTENDED client (getBasePrismaClient()). That ` +
        `handle carries none of the three cross-cutting guarantees — no force filter (NFR-05), no ` +
        `column gate, no audit event (NFR-04) — so a write through it is an unrecorded, unscoped ` +
        `mutation of the system of record. Build a client with createPrismaClient(ctx) and wrap the ` +
        `write in withAudit(), which is the only path that emits the event. Measured before this ` +
        `guard: asset.update({ valuationSar }) revalued a corpus asset from SAR 18,000,000 to 1 with ` +
        `an audit_event delta of 0.`,
    );
    this.name = 'UnextendedClientWriteError';
    this.delegate = delegate;
    this.operation = operation;
  }
}

/** Prisma delegate operations that mutate. Kept explicit so a new verb is a visible diff. */
const UNEXTENDED_WRITE_OPERATIONS: ReadonlySet<string> = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'upsert',
  'delete',
  'deleteMany',
]);

/**
 * The five tables better-auth owns, as Prisma delegate names.
 *
 * They are the ONE write surface the unextended handle keeps, because better-auth's Prisma adapter
 * is given this client deliberately (`packages/auth/src/server.ts`) and must create sessions and
 * users on the login path. None of them is endowment-scoped — all five are in `UNSCOPED_MODELS`,
 * and four of the five are in `UNAUDITED_MODELS` for reasons that are about credentials, not
 * convenience. `User` is the exception and is a named residual above.
 */
const IDENTITY_PLANE_DELEGATES: ReadonlySet<string> = new Set([
  'user',
  'session',
  'account',
  'verification',
  'twoFactor',
]);

/**
 * Every delegate whose writes are refused — derived from `ALL_MODELS` rather than hand-listed, so a
 * model added to the schema is guarded by default instead of by remembering.
 *
 * ⚠ **THE SECOND HALF OF THIS COMMENT WAS FALSE UNTIL S8 AND IS CORRECTED RATHER THAN DELETED.** It
 * read: *"`assertScopingCoverage` already pins `ALL_MODELS` against `schema.prisma`, so the two
 * cannot drift apart silently."* Neither clause was true. `assertScopingCoverage()` compares nothing
 * to `schema.prisma` — it walks `ALL_MODELS` and checks each member is classified exactly once — and
 * it had **zero call sites**, so even that narrower property was never exercised. "Derived rather
 * than hand-listed" is only as complete as the array it derives from: a model added to the schema and
 * forgotten here got no scope classification, no write policy and no place in this set, and the
 * comment said that could not happen.
 *
 * The pin now exists, in `test/scoping-coverage.test.ts`: it reads `schema.prisma` as TEXT, compares
 * against `ALL_MODELS` in **both** directions, and calls `assertScopingCoverage()`. It is a UNIT test,
 * so it runs on every branch and on a laptop with no Postgres.
 */
const GUARDED_DELEGATES: ReadonlySet<string> = new Set(
  ALL_MODELS.map((model) => model.charAt(0).toLowerCase() + model.slice(1)).filter(
    (delegate) => !IDENTITY_PLANE_DELEGATES.has(delegate),
  ),
);

/**
 * Wraps one delegate so its write verbs refuse — unless the audit spine is the caller.
 *
 * ⚠ THE EXEMPTION IS AN OBJECT-IDENTITY CHECK, NOT "AM I INSIDE A TRANSACTION". That distinction is
 * the whole soundness of it. `runAuditedTransaction()` stores the client it was handed by
 * `$transaction` as `state.rawTx`, and the audit extension re-issues each mutation through
 * `state.rawTx[delegate][operation]` so the row and its event share one transaction. So the ONLY
 * receiver that may write is the exact transaction proxy the audit spine is currently driving.
 *
 * A check on `currentAuditTransaction() !== null` instead would be a laundering route: any caller
 * could open `withAudit(ctx, …)` and, inside it, write anything at all through the unextended
 * handle with no event. Under the identity check that attempt fails, because `withAudit()` builds
 * its transaction from the module-private RAW client, so `state.rawTx` is never this proxy.
 */
function guardedDelegate(target: object, delegate: string, self: () => unknown): unknown {
  const raw = (target as Record<string, unknown>)[delegate] as object;
  return new Proxy(raw, {
    get(delegateTarget, property) {
      if (
        typeof property === 'string' &&
        UNEXTENDED_WRITE_OPERATIONS.has(property) &&
        currentAuditTransaction() !== self()
      ) {
        // REJECTS, rather than throwing synchronously, so the delegate keeps Prisma's contract of
        // always returning a promise. That matters for observable consistency with the sibling
        // control: `ForbiddenScopeError` from the scoping extension surfaces as a rejection because
        // it is raised inside a `query` hook, and a caller writing `.catch(…)` instead of
        // `try { await } catch` must see both refusals the same way. An unawaited call still fails
        // loudly — Node treats an unhandled rejection as fatal.
        return () => Promise.reject(new UnextendedClientWriteError(delegate, property));
      }
      const value = Reflect.get(delegateTarget, property, delegateTarget);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(delegateTarget)
        : value;
    },
  });
}

/**
 * The write-guarded façade. Applied to the client AND to every transaction client it opens, so
 * `base.$transaction(tx => tx.asset.update(…))` is refused exactly like the top-level call —
 * a guard that one `$transaction` hop walks around is not a guard.
 */
function writeGuarded(target: PrismaClient | RawTransactionClient): PrismaClient {
  const delegates = new Map<string, unknown>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const facade: any = new Proxy(target as unknown as Record<string, unknown>, {
    get(proxyTarget, property) {
      if (typeof property === 'string') {
        if (property === '$extends') {
          return () => {
            throw new UnextendedClientWriteError('$extends', 'call');
          };
        }
        if (property === '$transaction') {
          // A transaction client has no `$transaction` of its own, so this branch must fall through
          // for the nested case rather than return an undefined-calling wrapper.
          const open = Reflect.get(proxyTarget, property, proxyTarget) as unknown;
          if (typeof open === 'function') {
            const run = open as (arg: unknown, options?: unknown) => Promise<unknown>;
            return (arg: unknown, options?: unknown) =>
              run.call(
                proxyTarget,
                typeof arg === 'function'
                  ? (tx: unknown) =>
                      (arg as (client: PrismaClient) => unknown)(
                        writeGuarded(tx as RawTransactionClient),
                      )
                  : arg,
                options,
              );
          }
        }
        if (GUARDED_DELEGATES.has(property)) {
          let delegate = delegates.get(property);
          if (delegate === undefined) {
            delegate = guardedDelegate(proxyTarget, property, () => facade);
            delegates.set(property, delegate);
          }
          return delegate;
        }
      }
      const value = Reflect.get(proxyTarget, property, proxyTarget);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(proxyTarget)
        : value;
    },
  });
  return facade as PrismaClient;
}

/**
 * The façade, and the raw client it wraps.
 *
 * ⚠ KEYED ON THE RAW CLIENT'S IDENTITY, not memoized once. `disconnectPrisma()` clears
 * `globalThis.__qmulatePrismaBase`, after which `rawUnextendedClient()` lazily builds a NEW client
 * and pool; a façade memoized once would keep wrapping the DISCONNECTED one and every subsequent
 * call would fail on a closed pool. The integration harnesses close the pool in `afterAll` and the
 * denial-audit queue can reopen it, so this is a live path, not a hypothetical.
 */
const guardedBases = new WeakMap<PrismaClient, PrismaClient>();

/** The write-guarded façade over one role's raw client, built once per raw-client identity. */
function guardedBaseFor(role: ConnectionRole): PrismaClient {
  const raw = rawUnextendedClient(role);
  let guarded = guardedBases.get(raw);
  if (guarded === undefined) {
    guarded = writeGuarded(raw);
    guardedBases.set(raw, guarded);
  }
  return guarded;
}

/**
 * ⚠ THE UNEXTENDED HANDLE. NO FORCE FILTER, NO COLUMN GATE, NO AUDIT EVENT ON THE READ PATH.
 *
 * @deprecated Not because it is going away — five call sites still need it — but because the name
 * reads like an implementation detail and the thing it returns is a security boundary. Read the
 * block above `UnextendedClientWriteError` before adding a sixth call site;
 * `test/base-client-export-surface.test.ts` pins the five so a new one cannot arrive unreviewed.
 *
 * What it is FOR, and nothing else:
 *   • better-auth's Prisma adapter (the identity tables, which are not endowment data);
 *   • resolving a caller's grants before their context exists (`packages/api/src/context.ts`);
 *   • the integration-test harnesses' raw SQL and cross-endowment assertions;
 *   • `src/seed.ts`, as the base of one audited transaction.
 *
 * What it REFUSES since S2 round 4: every Prisma-delegate write on every non-identity model, and
 * `$extends`. What it still PERMITS: cross-endowment READS, and raw SQL. Both are named residuals
 * — see the block above.
 *
 * If you are reaching for this inside an API route or a job, you want `createPrismaClient(ctx)`.
 */
export function getBasePrismaClient(): PrismaClient {
  // Lazily built over the raw client, so importing this module still costs no connection — and so
  // the guard is the FIRST thing any external caller can touch, never an afterthought applied later.
  return guardedBaseFor('app');
}

/**
 * ⚠⚠ THE OWNER CONNECTION (`MIGRATOR_DATABASE_URL`). IT CAN RUN DDL, SUSPEND GUARDS, AND DELETE.
 *
 * This is the handle that survives privilege separation for the three things that genuinely need
 * ownership, and NOTHING else may use it:
 *
 *   • `src/seed.ts` — the fixture seed, which must lay down the first `admin:access_matrix:write`
 *     seat on a virgin database (authority cannot authorise its own first instance);
 *   • the two integration-test harnesses' SCAFFOLDING — the `DISABLE TRIGGER` blocks that lay
 *     fixture rows down and take them away, and the hard `DELETE`s of test rows;
 *   • the one-off production bootstrap of an endowment's first admin seat.
 *
 * ⚠ IT MUST NEVER BE REACHED FROM A REQUEST PATH. `apps/web` and `apps/worker` call
 * `assertNoPrivilegedDatabaseUrls()` at boot precisely so that a service which was accidentally
 * given `MIGRATOR_DATABASE_URL` refuses to start rather than quietly holding this power.
 *
 * ⚠ AND A REFUSAL PROBE MUST NEVER RUN ON IT. A test that asserts "the guard refuses" while
 * connected as the owner is measuring nothing — that is the single most likely way this change gets
 * quietly undone. The harness keeps `runProbe()`/`guardProbeSql()` on the app connection for exactly
 * this reason, and asserts the probing connection is neither SUPERUSER nor BYPASSRLS.
 *
 * Still write-guarded at the Prisma-delegate level (same façade as {@link getBasePrismaClient}), so
 * an accidental `privileged.asset.update(…)` is refused; raw SQL is the intended surface.
 */
export function getPrivilegedBasePrismaClient(): PrismaClient {
  return guardedBaseFor('owner');
}

/**
 * THE EXTENSION ORDER IS LOAD-BEARING. Do not reorder without reading this.
 *
 * Prisma applies the **first**-added extension **outermost** — its `query` hook runs first and
 * every later extension is nested inside it. (Verified empirically, not assumed: with
 * `.$extends(A).$extends(B).$extends(C)` the hooks enter A → B → C.)
 *
 * That matters here because the audit extension does not simply delegate: for a mutation it
 * re-issues the operation against the raw transaction client so the row and its `audit_event`
 * share one transaction. Anything nested INSIDE audit is therefore dead code on the write path.
 *
 *   1. encryption (outermost) — rewrites `data`/`create`/`update` to ciphertext + search HMACs
 *      on the way in, and decrypts on the way out. It must run first so that (a) the row written
 *      is encrypted and (b) `audit_event.before/after` records CIPHERTEXT, never plaintext PII
 *      (§12: "the audit trail never becomes a plaintext PII sink").
 *   2. scoping — injects the caller's `waqfId` grants and beneficiary self-isolation. Must sit
 *      outside audit for the same short-circuit reason.
 *   3. audit (innermost) — opens the transaction, takes the chain lock, writes the row and its
 *      hash-chained event together.
 */
function buildExtended(base: PrismaClient, ctx: RequestContext) {
  return base
    .$extends(createEncryptionExtension())
    .$extends(createScopingExtension(ctx))
    .$extends(createAuditExtension(ctx, base));
}

/** The client type every consumer should accept in its signatures. */
export type ExtendedPrismaClient = ReturnType<typeof buildExtended>;

/** Lets `withAudit(db, fn)` recover the context and base a client was built from. */
const clientRegistry = new WeakMap<
  object,
  { ctx: RequestContext; base: PrismaClient; role: ConnectionRole }
>();
/**
 * One extended client per (context object, role) — rebuilding on every call would churn proxies.
 *
 * Keyed by role as well as context because the same `RequestContext` may legitimately be used to
 * build both an app-connection client and a privileged one (the fixture seed does not, but
 * `provisionAccessGrant()` reuses the caller's actor context on the provisioner connection). A
 * single map would hand back a client on the WRONG connection, silently.
 */
const clientCache: Record<ConnectionRole, WeakMap<RequestContext, ExtendedPrismaClient>> = {
  app: new WeakMap(),
  provisioner: new WeakMap(),
  owner: new WeakMap(),
};

/**
 * The connection a context's client was most recently built on.
 *
 * ⚠ WHY THIS EXISTS: `recordEvent()` used to hardcode the single pool, which was harmless while
 * there was one and WRONG the moment there were three. An `ACCESS_DENIED` raised on the provisioner
 * connection would have been written on the app connection — the row is identical, so no test would
 * ever have noticed, and the trail would have quietly disagreed with itself about which credential
 * was refused. Rather than thread a role through the seventeen `deny()` call sites in
 * `extensions/scoping.ts`, the connection is recorded against the context object that every denial
 * already carries.
 *
 * Last-write-wins if one context object is used on two connections, and `'app'` when a context was
 * never registered (a bare `recordEvent()` on a hand-built context). Both are documented rather than
 * defended, because both write the same row to the same append-only table.
 */
const contextConnection = new WeakMap<RequestContext, ConnectionRole>();

/**
 * Builds the client for one caller. Call it ONCE per request, in the tRPC context (E2/S2), and
 * pass the result down. Never cache it across requests: the grants baked into it are the
 * caller's, and reusing it would hand one user another user's visibility.
 */
export function createPrismaClient(ctx: RequestContext): ExtendedPrismaClient {
  return createPrismaClientOn('app', ctx);
}

/**
 * Builds a fully-extended client on a NAMED connection.
 *
 * ⚠ MODULE-PRIVATE ON PURPOSE — the public surface is `createPrismaClient()` (app),
 * `createPrivilegedPrismaClient()` (owner) and, inside `access-matrix.ts` only, the provisioner.
 * A general "give me a client on any role" export would be a one-argument route to the owner
 * connection from anywhere in the monorepo, which is the privilege this whole change removes.
 */
function createPrismaClientOn(role: ConnectionRole, ctx: RequestContext): ExtendedPrismaClient {
  // ⚠ BEFORE THE CACHE LOOKUP, and before anything is built. A bypass is valid only for a SYSTEM
  // actor, and this is the single chokepoint every database handle in the monorepo passes through —
  // so there is no way to obtain a client whose force-filter is lifted for a USER or SERVICE caller,
  // however the context was constructed. `makeSystemContext` refuses it at construction too; this
  // catches the bare object literal, the `as never` cast, and the context deserialized from a job
  // payload. See `InvalidBypassError` for the hole this closes (T-25).
  assertBypassNotUser(ctx);

  const cached = clientCache[role].get(ctx);
  if (cached) {
    contextConnection.set(ctx, role);
    return cached;
  }

  // THE RAW client, not the write-guarded handle: this is the thing that INSTALLS the guarantees,
  // so it is one of the callers module-privacy exists to serve.
  const base = rawUnextendedClient(role);
  const client = buildExtended(base, ctx);
  clientRegistry.set(client as unknown as object, { ctx, base, role });
  clientCache[role].set(ctx, client);
  contextConnection.set(ctx, role);
  return client;
}

/**
 * ⚠⚠ A FULLY-EXTENDED CLIENT ON THE OWNER CONNECTION (`MIGRATOR_DATABASE_URL`).
 *
 * Audited, scoped and encrypted exactly like {@link createPrismaClient} — the extension chain is
 * identical, so a write through it still emits its hash-chained `audit_event`. What differs is the
 * database ROLE underneath: it owns the tables, so it can suspend a guard and it is the only handle
 * `withAccessMatrixBootstrap()` will accept.
 *
 * PERMITTED CALLERS, and the reason each is not a request path:
 *   • `src/seed.ts` — a program that refuses to run outside `DATA_CLASSIFICATION=fixture-only`;
 *   • `packages/database/test/setup.ts` and `packages/api/test/setup.ts` — scaffolding only;
 *   • a one-off operational bootstrap script.
 *
 * `test/base-client-export-surface.test.ts` allow-lists every file permitted to name it.
 */
export function createPrivilegedPrismaClient(ctx: RequestContext): ExtendedPrismaClient {
  return createPrismaClientOn('owner', ctx);
}

/**
 * The provisioner connection's extended client. **Not exported from `src/index.ts`.**
 *
 * `access-matrix.ts` is the only module that may reach it, and it never returns the client object to
 * a caller — only the two narrow functions `provisionAccessGrant()` / `revokeAccessGrant()`. If this
 * were exported, any caller could obtain a handle whose role holds `INSERT` on `waqf_access_grant`
 * and reach `$executeRawUnsafe` on it, which is the exact shape of the attack ADR-0008 describes.
 *
 * @internal
 */
export function createAccessMatrixPrismaClientInternal(ctx: RequestContext): ExtendedPrismaClient {
  return createPrismaClientOn('provisioner', ctx);
}

/**
 * The E1 build contract's name for {@link createPrismaClient}. Same function — exported under
 * both spellings so neither the contract's `createScopedPrisma` nor the task brief's
 * `createPrismaClient` is a broken import.
 */
export const createScopedPrisma = createPrismaClient;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// systemPrisma
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠⚠ BYPASSES THE SCOPING FORCE-FILTER. EVERY ROW OF EVERY ENDOWMENT IS VISIBLE. ⚠⚠
 *
 * FOR THE FIXTURE SEED, DATA MIGRATIONS AND TRUSTED IN-PROCESS JOBS ONLY. It must never be
 * reachable from a request path — anything holding this client has left the per-endowment access
 * matrix (NFR-05) behind, and no downstream check will notice.
 *
 * If you are reaching for it inside an API route, you want `createPrismaClient(ctx)` and a
 * `WaqfAccessGrant`. If a job legitimately needs it, give the job its own
 * `makeSystemContext({ actorId })` so the trail names something more useful than "system".
 *
 * What it does NOT switch off: writes still emit audit events, and UBO/IBAN columns are still
 * encrypted. Only row visibility is lifted.
 *
 * Lazy: constructing a PrismaClient at import time would make every unit test that merely imports
 * this module require a `DATABASE_URL`.
 */
export function getSystemPrisma(): ExtendedPrismaClient {
  return createPrismaClient(SYSTEM_CONTEXT);
}

/** Lazy alias for {@link getSystemPrisma}. Same warnings apply — read them. */
export const systemPrisma: ExtendedPrismaClient = new Proxy({} as ExtendedPrismaClient, {
  get(_target, property) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = getSystemPrisma() as any;
    const value = client[property];
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as ExtendedPrismaClient;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// withAudit — the sanctioned write path
// ═══════════════════════════════════════════════════════════════════════════════════════════

const RAW_PASSTHROUGH = new Set([
  '$queryRaw',
  '$queryRawUnsafe',
  '$executeRaw',
  '$executeRawUnsafe',
  '$queryRawTyped',
]);

/**
 * A hybrid handle over one transaction:
 *   • MODEL operations go through the full extension chain (which routes them into the
 *     transaction), so they are scoped, encrypted and audited exactly as outside it;
 *   • RAW operations go straight to the transaction client, so `$executeRaw` really does run in
 *     the same transaction — which is what `withReservedMatter()` depends on when it sets the
 *     transaction-local GUC.
 *
 * Without the split, raw SQL issued on the extended client would silently execute on a DIFFERENT
 * connection and land outside the transaction.
 */
function makeTxFacade(db: ExtendedPrismaClient, rawTx: RawTransactionClient): ExtendedPrismaClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const facade: any = new Proxy(db as unknown as Record<string, unknown>, {
    get(target, property) {
      if (typeof property === 'string') {
        if (RAW_PASSTHROUGH.has(property)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const raw = (rawTx as any)[property];
          return typeof raw === 'function' ? raw.bind(rawTx) : raw;
        }
        if (property === '$transaction') {
          // Already in one. Join it rather than opening a nested transaction Postgres does not have.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (arg: any) => (typeof arg === 'function' ? arg(facade) : Promise.all(arg));
        }
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function'
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  });
  return facade as ExtendedPrismaClient;
}

/**
 * Runs `fn` inside one transaction in which every mutation emits its audit event.
 *
 * Guarantees:
 *   • business writes and audit events commit together or not at all (assertion A9);
 *   • the hash chain is appended under one advisory lock, so concurrent callers cannot fork it
 *     (assertion A10);
 *   • reads inside the block see the block's own uncommitted writes.
 *
 * Nesting JOINS the outer transaction and keeps the OUTER actor context, so a helper cannot
 * quietly re-attribute its writes.
 *
 *   await withAudit(ctx, async (tx) => {
 *     const waqf = await tx.waqf.create({ data: { ... } });
 *     await tx.asset.create({ data: { waqfId: waqf.id, ... } });
 *   });
 */
export function withAudit<T>(
  ctx: RequestContext,
  fn: (tx: ExtendedPrismaClient) => Promise<T>,
  options?: AuditTransactionOptions,
): Promise<T>;
export function withAudit<T>(
  db: ExtendedPrismaClient,
  fn: (tx: ExtendedPrismaClient) => Promise<T>,
  options?: AuditTransactionOptions,
): Promise<T>;
export function withAudit<T>(
  target: RequestContext | ExtendedPrismaClient,
  fn: (tx: ExtendedPrismaClient) => Promise<T>,
  options: AuditTransactionOptions = {},
): Promise<T> {
  let ctx: RequestContext;
  let db: ExtendedPrismaClient;
  // ⚠ THE BASE MUST COME FROM THE CLIENT, NOT FROM A SINGLETON. This used to be a hardcoded
  // `rawUnextendedClient()` while `clientRegistry` was ALREADY storing the base it was built on and
  // being ignored. Harmless with one pool; with three it is the most dangerous line in the package:
  // a client built on the provisioner or owner connection would open its audited transaction on the
  // APP connection, so the business row and its audit event would be written by a role that (a) is
  // refused with 42501 for a `waqf_access_grant` insert, or (b) — if a later migration ever loosens
  // one GRANT — succeeds on the unprivileged connection and defeats the entire split with every test
  // still green. `test/authorization-plane-privilege.integration.test.ts` asserts the `current_user`
  // observed INSIDE a provisioning transaction, and its mutation is reverting this line to the
  // singleton.
  let base: PrismaClient;

  if (isRequestContext(target)) {
    ctx = target;
    db = createPrismaClient(ctx);
    base = rawUnextendedClient('app');
  } else {
    db = target;
    const registered = clientRegistry.get(db as unknown as object);
    if (!registered) {
      throw new Error(
        'withAudit() was given a client it does not recognize. Build clients with createPrismaClient(ctx) ' +
          'so the actor context travels with them.',
      );
    }
    ctx = registered.ctx;
    base = registered.base;
  }

  return runAuditedTransaction(
    // Raw, deliberately: the audit spine re-issues the caller's mutations through this client's
    // transaction, so a write-guarded one here would refuse the very writes it is recording.
    base,
    ctx,
    (state) => fn(makeTxFacade(db, state.rawTx)),
    options,
  );
}

/**
 * Records a non-mutation event: `READ_SENSITIVE`, `EXPORT`, `LOGIN`, `ACCESS_DENIED`, ...
 *
 * The event is written on WHICHEVER connection the context's client was built on (see
 * `contextConnection`), not on a hardcoded singleton. Every role holds `INSERT` on `audit_event` —
 * that is what append-only means, and it is the one privilege migration 10 keeps for all three —
 * so this cannot fail for want of a grant; what it buys is that the trail is written by the same
 * credential whose refusal it is recording.
 */
export function recordEvent(
  ctx: RequestContext,
  input: AuditEventInput,
): Promise<{ id: bigint; rowHash: string }> {
  // Raw: appending to `audit_event` IS the guarantee, so it cannot be gated by it.
  return recordAuditEvent(rawUnextendedClient(contextConnection.get(ctx) ?? 'app'), ctx, input);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Reserved-matter primitive
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Sets the transaction-local GUC that the reserved-matter database guards read.
 *
 * ⚠ THIS IS A PRIMITIVE, NOT THE WORKFLOW. It performs NO authorization check. Call
 * `withReservedMatter()` from `@qmulate/database/reserved-matter` instead — it loads the
 * `ApprovalRequest` and asserts `type === RESERVED_MATTER && status === APPROVED && waqfId matches
 * && checkerId != null && checkerId !== makerId` BEFORE opening the transaction, throwing
 * `ReservedMatterNotApprovedError` otherwise. Since E2 those five conditions are re-checked inside
 * the Postgres trigger as well, so raw SQL is held to the same standard.
 *
 * ⚠ IT DOES NOT AND CANNOT UNLOCK THE SHART AL-WAQIF. Per the 2026-07-27 user decision the four
 * Shart columns are unconditionally immutable: `qmulate_shart_guard()` raises on them without
 * consulting this GUC at all. What the GUC still opens is `waqf.certificateNumber`,
 * `waqf.deedNumber`, and the document legal-hold / retention release.
 *
 * (This comment used to claim `src/reserved-matter.ts` was "named in the package `exports` map".
 * It was not — there was no such entry and no such file. Both now exist.)
 *
 * `set_config(..., true)` scopes the value to the transaction, so it evaporates on COMMIT or
 * ROLLBACK and cannot leak onto the next statement of a pooled connection.
 */
export async function setReservedMatterApproval(
  tx: ExtendedPrismaClient | RawTransactionClient,
  approvalRequestId: string,
): Promise<void> {
  if (!approvalRequestId || approvalRequestId.trim() === '') {
    throw new Error(
      'setReservedMatterApproval: an empty approval id would leave the Shart al-Waqif guard engaged',
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (tx as any).$queryRawUnsafe(
    `SELECT set_config($1, $2, true)`,
    RESERVED_MATTER_APPROVAL_GUC,
    approvalRequestId,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// Scope-denial auditing (INSTALLED BY DEFAULT — see below)
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * Denial writes run one at a time, in submission order.
 *
 * Serial, not parallel: every one of them opens an audited transaction, and audited transactions
 * are serialized by the chain advisory lock anyway (see `runAuditedTransaction`). Firing N of them
 * concurrently would only occupy N pooled connections all waiting for the same lock.
 */
let denialAuditQueue: Promise<void> = Promise.resolve();
let denialAuditsRecorded = 0;
let denialAuditsFailed = 0;

/**
 * Resolves once every denial event submitted so far has been written (or has failed).
 *
 * Exported because "the refusal is recorded" is a testable claim and a fire-and-forget write is
 * not testable without a barrier. A `setTimeout` in its place is how a real regression gets to
 * look like a flake.
 */
export function flushScopeDenialAudits(): Promise<void> {
  return denialAuditQueue;
}

/** `{ recorded, failed }` since process start. `failed > 0` means the trail is incomplete. */
export function scopeDenialAuditStats(): { recorded: number; failed: number } {
  return { recorded: denialAuditsRecorded, failed: denialAuditsFailed };
}

/**
 * Routes out-of-scope WRITE refusals into the audit trail as `ACCESS_DENIED` (NFR-04).
 *
 * ── INSTALLED BY DEFAULT (S2 round 2). IT USED TO BE OPT-IN, AND THAT WAS A HOLE ───────────────
 * The default handler in `extensions/scoping.ts` was a no-op and only `packages/api` ever called
 * this. MEASURED consequence: a blocked self-issued-NAZIR grant — top level AND relation-nested —
 * was refused correctly and left `audit_event` COMPLETELY UNCHANGED (`ACCESS_DENIED` delta 0) for
 * every caller that is not the tRPC API: `apps/worker`, every script, every integration test, and
 * an adversary who reaches this package directly. The forge attempt was as invisible as the forge
 * itself would have been, and NFR-04 requires a denied attempt on a sensitive resource to be
 * logged. The install now happens at the bottom of this module, which is on the path of every way
 * this package can produce a client, so "recorded" is the default and silence has to be chosen
 * deliberately via `setScopeDenialHandler()`.
 *
 * ── THE EVENT IS WRITTEN OUT OF BAND, AND THAT IS THE WHOLE POINT ──────────────────────────────
 * A refusal raised inside a `withAudit()` block used to append its event to that block's
 * transaction — the same transaction the refusal is about to roll back. MEASURED: the denial count
 * moved by 0 and Prisma reported "Transaction already closed: A query cannot be executed on a
 * transaction that was rolled back". `outsideAuditTransaction()` detaches the async context so the
 * event commits in its own transaction, on its own connection, and survives the rollback.
 *
 * ── STILL BEST-EFFORT. WHAT THAT MEANS EXACTLY ─────────────────────────────────────────────────
 * `deny()` in the force filter is synchronous and returns `never`, so this handler cannot await
 * the write before the refusal propagates — and it must not: the enclosing transaction holds the
 * chain advisory lock for its whole duration, so awaiting a fresh audited transaction from inside
 * it would self-deadlock. The write is therefore ENQUEUED and lands shortly after the enclosing
 * transaction ends. Consequences, stated rather than glossed:
 *   • a caller that CATCHES the refusal and keeps its transaction open delays the denial event for
 *     as long as it holds the lock (bounded by the Prisma transaction timeout, not unbounded);
 *   • a process that exits immediately after a refusal can lose the event.
 *     `flushScopeDenialAudits()` is the barrier for anything that cares — tests, shutdown paths;
 *   • `scopeDenialAuditStats().failed` counts what did not make it, so an incomplete trail is
 *     visible instead of assumed absent.
 * The DEPENDABLE record of a denial remains the API-layer procedure boundary, outside any
 * transaction. This is the supplement that covers refusals raised below it. V-7 states the same
 * limitation for the raw-SQL path: a control cannot always record its own refusal into the table
 * it is protecting.
 */
export function installScopeDenialAuditing(): void {
  setScopeDenialHandler((denial) => {
    const write = () =>
      outsideAuditTransaction(() =>
        recordEvent(denial.ctx, {
          action: 'ACCESS_DENIED',
          entityType: denial.model,
          entityId: denial.attemptedWaqfId ?? 'unknown',
          waqfId: denial.attemptedWaqfId ?? null,
          category: 'ACCESS',
          extraContext: { operation: denial.operation, reason: denial.reason },
        }),
      );

    denialAuditQueue = denialAuditQueue.then(
      // `.then(onFulfilled)` alone would run `write` in the async context of whatever scheduled the
      // previous link, so the detach has to happen inside the callback, not around it.
      async () => {
        try {
          await write();
          denialAuditsRecorded += 1;
        } catch {
          // Best effort. The refusal itself has already been raised to the caller; losing the
          // record must never turn a denial into a success.
          denialAuditsFailed += 1;
        }
      },
    );
  });
}

// Denial auditing is ON unless a caller deliberately replaces the handler. Installed at module
// scope for the same reason `setHijriFormatter()` is (see the note at the top of this file): every
// route to a client passes through this module, so there is no way to obtain one whose write
// refusals are silent. `packages/api` still calls it explicitly at boot — that call is now a
// harmless re-install, and it stays because the API layer owns the boot-time contract.
installScopeDenialAuditing();

/**
 * Closes the shared pool. Test teardown and graceful shutdown only.
 *
 * ⚠ IT DRAINS THE DENIAL QUEUE FIRST, AND THAT IS LOAD-BEARING, NOT TIDINESS.
 *
 * `recordEvent()` reaches the pool through `rawUnextendedClient()`, which LAZILY CONSTRUCTS a new
 * `PrismaClient` when the cached one is absent. So a queued denial write that lands after
 * `$disconnect()` does not fail — it silently builds a SECOND pool. Measured before this drain: the
 * integration suite (20 files, each closing the pool in `afterAll`, and hundreds of deliberate
 * denials) accumulated orphaned pools until `audit-lock-ordering` spent 109 s and the seed
 * subprocess could no longer open a connection, cascading 14 test files into failure.
 *
 * Draining is also the honest thing for a graceful shutdown: the "a process that exits immediately
 * after a refusal can lose the event" caveat on `installScopeDenialAuditing()` applies to a CRASH,
 * not to an orderly close, and this is what makes that distinction true rather than asserted.
 *
 * The drain is a single await, not a loop: nothing may still be ENQUEUEING refusals at the point
 * where the caller has decided to close the pool, and looping until the chain is empty would hang
 * forever if something were.
 *
 * ⚠ IT CLOSES **EVERY** POOL, NOT ONE. Since privilege separation there are up to three (app,
 * provisioner, owner). A half-closed registry reproduces the S2 orphaned-pool cascade exactly:
 * `audit-lock-ordering` spent 109 s and fourteen test files went red because the seed subprocess
 * could no longer open a connection.
 */
export async function disconnectPrisma(): Promise<void> {
  await flushScopeDenialAudits();
  const pools = globalThis.__qmulatePrismaPools;
  if (!pools) return;
  globalThis.__qmulatePrismaPools = undefined;
  // Sequential, and every failure surfaced: `Promise.all` would leave the remaining pools open if
  // the first rejected, which is the leak this drain exists to prevent.
  const failures: unknown[] = [];
  for (const client of Object.values(pools)) {
    try {
      await client?.$disconnect();
    } catch (error: unknown) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw failures[0];
}
