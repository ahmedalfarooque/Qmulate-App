// QMULATE — the unextended handle has exactly the call sites it is allowed to have.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY A SOURCE SCAN IS THE RIGHT TOOL HERE, AND WHERE ITS AUTHORITY STOPS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The BEHAVIOURAL proof that `getBasePrismaClient()` refuses governed writes is in
// `base-client-bypass.integration.test.ts`, and that is where the security claim lives. A source
// scan proves nothing about runtime behaviour and must never be offered as if it did.
//
// What this file is for is a different question, which no runtime assertion can answer: **is the
// set of callers still the set we reasoned about?** The containment shipped in S2 round 4 is
// justified by a measurement over the call sites — "the honest callers turn out never to need a
// governed write, so the exported handle can refuse them all". A sixth call site that DOES need one
// would invalidate the reasoning, and it would do so silently, because the guard would simply raise
// in whatever new code path was added. So the allowlist is pinned: adding a caller is a decision
// that has to be made in this file, in the same diff, with the reason written down.
//
// It also pins the `PrismaClient` shadow in `src/index.ts`. Before it, one import defeated the
// entire ESLint ban on `@prisma/client`:
//
//   import { PrismaClient } from '@qmulate/database';
//   new PrismaClient().asset.update({ where: { id: 'asset-002' }, data: { valuationSar: '2.00' } })
//     -> PERMITTED. audit_event delta 0. Own connection pool. No force filter.
//
// The runtime refusal is asserted in the integration file; what is asserted HERE is that the
// shadow is still in place, because deleting it is a one-line edit whose consequence is invisible.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './setup.js';

/**
 * Every file permitted to name `getBasePrismaClient`, with the reason it needs the unextended handle.
 *
 * ⚠ ADDING A ROW HERE IS A SECURITY DECISION. The handle carries no force filter (NFR-05) and no
 * audit spine (NFR-04); it refuses governed writes but its cross-endowment READS are wide open. If a
 * new caller needs a WRITE, the answer is `createPrismaClient(ctx)` + `withAudit()`, not a row here.
 */
const THIS_FILE = 'packages/database/test/base-client-export-surface.test.ts';

const PERMITTED_CALL_SITES: readonly { file: string; why: string }[] = [
  {
    file: 'packages/database/src/client.ts',
    why: 'Declares it. The RAW client it wraps is module-private (`rawUnextendedClient`).',
  },
  {
    file: 'packages/database/src/index.ts',
    why: 'Re-exports it, with the residual named at the export site.',
  },
  // REMOVED IN ADR-0008 ROUND 6: `src/seed.ts` no longer names `getBasePrismaClient`. The whole seed
  // now runs on the PRIVILEGED (owner) connection via `getPrivilegedBasePrismaClient()` /
  // `createPrivilegedPrismaClient()`, because its step 18 must lay down the first
  // `admin:access_matrix:write` seat and that needs table ownership. Leaving a stale row here would
  // let a future re-introduction of the app-connection seed pass unreviewed, which is the exact
  // failure mode this allowlist exists to prevent.
  {
    file: 'packages/auth/src/server.ts',
    why: 'better-auth Prisma adapter. Writes only the five identity tables, which are the declared write allowlist.',
  },
  {
    file: 'packages/api/src/context.ts',
    why: 'resolveGrants() — reads a caller grants BEFORE their context exists. Chicken-and-egg; read-only.',
  },
  {
    file: 'packages/database/src/sweep-coverage.ts',
    why:
      "The sweep-coverage control (S10/T2): MUST read outside the seat's scoped view or it " +
      "inherits the exact blind spot it reports on. Two SELECTs (waqf ids, the seat's grants), " +
      "zero writes through the handle — its only write is recordEvent(), the audit spine's own " +
      "append, under the control's declared identity.",
  },
  {
    file: 'packages/database/test/setup.ts',
    why: 'Integration harness: raw SQL probes and cross-endowment assertions. Reads + raw only.',
  },
  {
    file: 'packages/api/test/setup.ts',
    why: 'Same harness, api suite.',
  },
  {
    file: 'packages/auth/test/auth-plugins.test.ts',
    why: 'Mentions it in a comment about server.ts module scope. No call.',
  },
  {
    file: 'packages/api/src/settings.ts',
    why: 'Comment only, and a NEGATIVE one: "never `getBasePrismaClient()`". No call.',
  },
  {
    // ⊕ migration 55
    file: 'packages/auth/scripts/primary-admin-setup.ts',
    why:
      'Operator script: looks the account up before designating it primary administrator through ' +
      'setPrimaryAdmin() (provisioner, audited). Reads only; the write is on the provisioning path.',
  },
  {
    // ⊕ migration 55
    file: 'packages/api/src/routers/admin.ts',
    why:
      'The organisation screens read the authorization plane itself (users, levels, overrides, ' +
      'grants, the audit trail) — not endowment data — behind orgProcedure(); every write goes ' +
      'through the provisioner helpers, never through this handle.',
  },
  {
    file: 'packages/database/test/base-client-bypass.integration.test.ts',
    why: 'The behavioural proof. Names it in prose only; reaches it through the harness.',
  },
  {
    file: 'packages/database/src/client.ts',
    why:
      'Names it in PROSE only, at `getPrivilegedBasePrismaClient()` — the handle this helper now ' +
      'REQUIRES since ADR-0008 round 6, because suspending the trigger needs table ownership and the ' +
      'app connection no longer has it. No call.',
  },
  {
    file: 'packages/database/test/base-client-export-surface.test.ts',
    why: 'This file.',
  },
];

/**
 * `git grep`, not a hand-rolled directory walk.
 *
 * WHY: it respects `.gitignore`, so `node_modules/`, `generated/`, `dist/` and — the one that
 * actually bit during this work — `apps/web/.next/` cannot inflate the result. A plain recursive
 * grep over the repo matched compiled Next.js chunks and reported "hits" in files nobody wrote.
 *
 * `--untracked` is load-bearing: a NEW file is untracked until it is committed, and without the flag
 * the scan would not see the very test files being added — the allowlist would then appear stale for
 * files that exist. `--untracked` still honours `.gitignore` (unlike `--no-exclude-standard`).
 *
 * `git grep -l` exits 1 when there are no matches, which is not an error here.
 */
function filesNaming(symbol: string): string[] {
  let out: string;
  try {
    out = execFileSync('git', ['grep', '-l', '-F', '--untracked', symbol, '--', '*.ts', '*.tsx'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) return [];
    throw error;
  }
  return out
    .split('\n')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
    .sort();
}

/**
 * Every file permitted to name `withAccessMatrixBootstrap`, with the reason it needs to SUSPEND a guard.
 *
 * ⚠ ADDING A ROW HERE IS A SECURITY DECISION, AND A LOUDER ONE THAN THE LIST ABOVE. This helper turns
 * `waqf_access_grant_admission` OFF — the migration-5/7/9 trigger that is the only thing standing between
 * the authorization plane and a raw INSERT. It exists because authority cannot authorise its own first
 * instance: migration 9 deleted the forgeable `actorType = 'SYSTEM'` disjunct, so the FIRST holder of
 * `admin:access_matrix:write` on a database has no admissible issuer and bootstrap had to move behind a
 * PRIVILEGE (table ownership) instead of behind a claim.
 *
 * The permitted set is therefore exactly: the module that declares it, the barrel that exports it with
 * the warning attached, the fixture SEED, and the two test harnesses. **A request path must never appear
 * here** — `activateGrant()` in `packages/api` is the request path and it goes through admission. Nor may
 * an application module: `apps/web`, `apps/worker` and `packages/api/src/**` have no legitimate reason to
 * disable a database guard, and if one appears to, the answer is E12's provisioning path (ADR-0008), not
 * a row in this list.
 */
const PERMITTED_BOOTSTRAP_CALL_SITES: readonly { file: string; why: string }[] = [
  {
    // ⊕ S12-4 (BR-1106)
    file: 'packages/database/src/import-apply.ts',
    why:
      'Seats the optional `bootstrapAdmin` on every imported endowment — the FIRST access-matrix seat ' +
      'of a brand-new client, which no ordinary rule can authorise (authority cannot authorise its own ' +
      'first instance). Same reason, same shape, as the seed’s step 18.',
  },
  {
    // ⊕ S12-3b (migration 53)
    file: 'packages/database/test/endowment-birth-admission.integration.test.ts',
    why:
      'Lays down the registrar, clerk and foreign seats ESTABLISHED in the trail (the birth trigger ' +
      'reads sibling authority through migration 7’s precedence clause), exactly as the api harness ' +
      'does. Never the statement under test.',
  },
  {
    file: 'packages/database/src/access-matrix-bootstrap.ts',
    why: 'Declares it, with the full contract and the residual in its header.',
  },
  {
    file: 'packages/database/src/index.ts',
    why: 'Re-exports it, with the warning at the export site.',
  },
  {
    file: 'packages/database/src/seed.ts',
    why:
      'Step 18 — the fixture’s 21 grants, including the ONE seat that carries the admin verb. No ' +
      'seed can satisfy admission: it writes every grant as one actor that no_self_issue forbids from ' +
      'holding a seat of its own.',
  },
  {
    file: 'packages/database/test/setup.ts',
    why: 'Wraps it as `provisionGrants()` for the five files that bootstrap a test admin seat.',
  },
  {
    file: 'packages/auth/scripts/dev-admin-setup.ts',
    why:
      'The local development administrator’s seats — a fixture-only provisioning program that ' +
      'refuses to start outside DATA_CLASSIFICATION=fixture-only, same shape as the seed’s step 18.',
  },
  {
    file: 'packages/api/test/setup.ts',
    why:
      'provisionTestSubjects() — the api harness’s subject seats, on a provisioner that holds ' +
      'nothing anywhere by design.',
  },
  {
    file: 'packages/database/test/grant-admission-system-branch.integration.test.ts',
    why:
      'Names it in PROSE only — its header explains why bootstrap had to move behind a privilege ' +
      'when migration 9 deleted the SYSTEM disjunct. No call: that file’s own bootstrap now goes ' +
      'through the LEGITIMATE admin path, which doubles as its control that the path still works.',
  },
  {
    file: 'packages/database/src/client.ts',
    why:
      'Names it in PROSE only, at `getPrivilegedBasePrismaClient()` — the handle this helper now ' +
      'REQUIRES since ADR-0008 round 6, because suspending the trigger needs table ownership and the ' +
      'app connection no longer has it. No call.',
  },
  {
    file: 'packages/database/test/base-client-export-surface.test.ts',
    why: 'This file.',
  },
];

/**
 * Every file permitted to name the PRIVILEGED (owner-connection) handles, with the reason.
 *
 * ⚠ ADDING A ROW HERE IS THE LOUDEST SECURITY DECISION IN THIS FILE. `MIGRATOR_DATABASE_URL` connects
 * as `qmulate_owner`, which OWNS every table in `public`: it can `ALTER TABLE … DISABLE TRIGGER` every
 * guard in migrations 1–11, `DROP` any constraint, hard-delete rows inside the ≥10-year retention
 * window, and write `waqf_access_grant` directly. It is the credential ADR-0008 round 6 took away from
 * the request path — the whole point of the change — so a new caller is either provisioning, or a
 * regression of the finding.
 *
 * If a new caller is a REQUEST path, the answer is `createPrismaClient(ctx)`; if it needs to mint a
 * seat, the answer is `provisionAccessGrant()` on the provisioning connection, where grant admission
 * is still fully enforced. Neither is a row here.
 *
 * ⚠ AND A REFUSAL PROBE MAY NEVER RUN ON THESE HANDLES. As the owner every ACL question answers "yes",
 * so a privilege assertion made on one is vacuous. That is the failure mode most likely to undo this
 * change quietly, and the reason the two names are deliberately ugly.
 */
const PERMITTED_PRIVILEGED_CALL_SITES: readonly { file: string; why: string }[] = [
  {
    // ⊕ S12-4 (BR-1106 · G-8 layer 3)
    file: 'packages/database/src/import-apply.ts',
    why:
      'The first-client IMPORTER — the owner-credential bootstrap S12 Q7 names. It runs ONLY after ' +
      '`import.ts` has refused anything but production+ksa, a non-fixture source and a marker-free ' +
      'file, and it writes the first endowment of a brand-new client (no sibling can lend authority) ' +
      'plus the first admin seat. Never a request path; its module imports the database DYNAMICALLY ' +
      'so the guard runs on a connection-free process.',
  },
  {
    // ⊕ S12-3b (migration 53)
    file: 'packages/database/test/endowment-birth-admission.integration.test.ts',
    why:
      'Constructs the birth subjects AS THE OWNER (a second family with one endowment; four users; ' +
      'three ESTABLISHED seats through the bootstrap) and purges them with the delete guards suspended ' +
      'in one DO block. Every REFUSAL it asserts runs on the PROVISIONER or the app connection, never ' +
      'here — the owner is exempt from `waqf_birth_admission` by current_user, by design.',
  },
  {
    file: 'packages/database/src/client.ts',
    why: 'Declares both, over the role-keyed connection registry.',
  },
  {
    file: 'packages/database/src/index.ts',
    why: 'Re-exports them, with the warning at the export site.',
  },
  {
    file: 'packages/database/src/seed.ts',
    why:
      'The fixture seed runs ENTIRELY on the owner connection: its step 18 lays down the first ' +
      'admin:access_matrix:write seat, which no ordinary rule can authorise, and the seed is ONE ' +
      'audited transaction whose frozen hash chain cannot be split across two connections.',
  },
  {
    file: 'packages/database/src/access-matrix-bootstrap.ts',
    why:
      'Names them in PROSE only, in the error it raises when handed a non-privileged executor. ' +
      'No call.',
  },
  {
    file: 'packages/database/test/setup.ts',
    why: 'privilegedPrisma() / privilegedExtendedPrisma() — SCAFFOLDING only. Probes stay on the app connection.',
  },
  {
    file: 'packages/auth/scripts/dev-admin-setup.ts',
    why:
      'The local development administrator is provisioned on the owner connection for the seed’s ' +
      'reason: one audited transaction that lays down access-matrix seats behind ownership.',
  },
  {
    file: 'packages/api/test/setup.ts',
    why: 'privilegedPrisma() and provisionTestSubjects() — SCAFFOLDING only; every assertion goes through tRPC or basePrisma().',
  },
  {
    file: 'packages/database/test/authorization-plane-privilege.integration.test.ts',
    why:
      'Uses the owner connection for the MUTATIONS (which assert a PERMIT, so the connection is not ' +
      'under test) and for the posture read. Every REFUSAL in that file is asserted on basePrisma().',
  },
  {
    file: 'packages/api/test/approval-authority.integration.test.ts',
    why:
      'Provisions one `membership` fixture row. `membership` is authorization-plane: the runtime role ' +
      'holds SELECT only on it (MEASURED: 42501 permission denied for table membership), so laying ' +
      'the row down is a privileged act. Still audited. No assertion in that file runs on this ' +
      'connection.',
  },
  {
    file: 'packages/database/test/base-client-export-surface.test.ts',
    why: 'This file.',
  },
];

describe('the privileged (owner) connection: who may reach it', () => {
  it('is named only by the files on the allowlist', () => {
    const found = [
      ...new Set([
        ...filesNaming('getPrivilegedBasePrismaClient'),
        ...filesNaming('createPrivilegedPrismaClient'),
      ]),
    ].sort();
    const permitted = new Set(PERMITTED_PRIVILEGED_CALL_SITES.map((entry) => entry.file));

    const unexpected = found.filter((file) => !permitted.has(file));
    expect(
      unexpected,
      'A NEW CALLER OF THE PRIVILEGED (OWNER) CONNECTION. That role owns every table: it can suspend ' +
        'every guard trigger in migrations 1-11, drop any constraint, and write waqf_access_grant ' +
        'directly — precisely the privilege ADR-0008 round 6 removed from the request path. If this is ' +
        'a request path, use createPrismaClient(ctx). If it mints a seat, use provisionAccessGrant(), ' +
        'where admission is still enforced. If it is genuinely provisioning, add it here WITH THE ' +
        'REASON — and make sure no refusal is asserted on it, because as the owner every ACL question ' +
        'answers yes.',
    ).toEqual([]);

    const stale = [...permitted].filter((file) => !found.includes(file));
    expect(stale, 'Stale PERMITTED_PRIVILEGED_CALL_SITES entries — delete them.').toEqual([]);
  });

  it('there is no `./client` subpath, so the barrel is the ONLY door', () => {
    // ⚠ THIS WAS A REAL HOLE, FOUND WHILE AUDITING THIS FILE'S OWN CLAIM, AND IT IS THE REASON THE
    // SUBPATH IS GONE. `package.json#exports` carried `"./client": "./src/client.ts"`, which re-exports
    // the WHOLE module — so `import { createAccessMatrixPrismaClientInternal } from
    // '@qmulate/database/client'` handed any package in the monorepo a client on the role that holds
    // INSERT on `waqf_access_grant`, complete with `$executeRawUnsafe`. That is ADR-0008's finding,
    // reachable in one import, past every allowlist above — because the lists check the BARREL and the
    // set of files that NAME a symbol, and a subpath re-export is neither.
    //
    // MEASURED before removing it: nothing imported `@qmulate/database/client` anywhere in
    // `packages/**`, `apps/**` or `scripts/**`. It was an unused door.
    //
    // The same reasoning applies to any future subpath that points at a module holding a connection
    // factory: `./extensions/*`, `./context`, `./hash-chain`, `./crypto` and `./reserved-matter` export
    // no client and are fine. Adding `"./client"` back re-opens this.
    const pkg = JSON.parse(
      readFileSync(path.join(REPO_ROOT, 'packages/database/package.json'), 'utf8'),
    ) as { exports?: Record<string, string> };
    const subpaths = Object.entries(pkg.exports ?? {});

    expect(
      subpaths.map(([name]) => name),
      'a `./client` subpath is back in package.json#exports. It re-exports src/client.ts wholesale, ' +
        'including createAccessMatrixPrismaClientInternal (the provisioning connection) and ' +
        'createPrivilegedPrismaClient (the owner connection) — past every allowlist in this file, in ' +
        'one import.',
    ).not.toContain('./client');

    // And no OTHER subpath may point at a module that exports a connection factory.
    const leaking = subpaths.filter(([name, target]) => {
      if (name === '.' || name === './package.json') return false;
      const file = path.join(REPO_ROOT, 'packages/database', target.replace(/^\.\//, ''));
      if (!file.endsWith('.ts')) return false;
      const source = readFileSync(file, 'utf8');
      return /export\s+(function|const)\s+(create(Privileged|AccessMatrix)\w*|getPrivilegedBasePrismaClient)/.test(
        source,
      );
    });
    expect(
      leaking.map(([name]) => name),
      'a package.json#exports subpath points at a module that exports a privileged or provisioning ' +
        'client factory. Every such factory must be reachable ONLY through the barrel, where the ' +
        'allowlists above apply.',
    ).toEqual([]);
  });

  it('the provisioning-connection client is NOT exported from the barrel', () => {
    // ⚠ THE NARROWEST AND MOST IMPORTANT OF THE THREE. `qmulate_provisioner` holds INSERT on
    // `waqf_access_grant` and on `audit_event` — exactly the two privileges ADR-0008's route 2 needed.
    // An exported handle on that role would carry `$executeRawUnsafe` and would re-create the hole the
    // whole change closes. So `createAccessMatrixPrismaClientInternal` is declared in `client.ts`,
    // consumed by `access-matrix.ts`, reachable by the in-package test harness — and absent from
    // `src/index.ts` and from every `exports` entry in `package.json`.
    const barrel = readFileSync(path.join(REPO_ROOT, 'packages/database/src/index.ts'), 'utf8');
    expect(
      barrel,
      'the provisioning-connection client is exported from the barrel. Any caller could then obtain a ' +
        'handle whose database role may INSERT into waqf_access_grant and reach raw SQL on it.',
    ).not.toMatch(/createAccessMatrixPrismaClientInternal/);

    const permitted = new Set([
      'packages/database/src/client.ts',
      'packages/database/src/access-matrix.ts',
      // S12-1 / AV4-02: the approval DECISION door — same credential, same shape, never returns
      // the client (`decideApproval()` is its entire surface).
      'packages/database/src/approval-plane.ts',
      // S12-3b: the INTAKE door — same credential, same shape, never returns the client
      // (`intakeEndowment()` is its entire surface; migration 53 admits the birth it performs).
      'packages/database/src/intake.ts',
      // Migration 55: registration decisions, levels, overrides — audited provisioner writes.
      'packages/database/src/org-access.ts',
      'packages/database/test/setup.ts',
      'packages/database/test/authorization-plane-privilege.integration.test.ts',
      THIS_FILE,
    ]);
    const unexpected = filesNaming('createAccessMatrixPrismaClientInternal').filter(
      (file) => !permitted.has(file),
    );
    expect(
      unexpected,
      'A NEW REACH INTO THE PROVISIONING CONNECTION. The four exported functions ' +
        '(provisionAccessGrant / revokeAccessGrant / decideApproval / intakeEndowment) are the entire sanctioned ' +
        'surface, and none returns its client.',
    ).toEqual([]);
  });
});

describe('the access-matrix bootstrap: who may suspend admission', () => {
  it('is named only by the files on the allowlist', () => {
    const found = filesNaming('withAccessMatrixBootstrap');
    const permitted = new Set(PERMITTED_BOOTSTRAP_CALL_SITES.map((entry) => entry.file));

    const unexpected = found.filter((file) => !permitted.has(file));
    expect(
      unexpected,
      'A NEW CALLER OF THE ACCESS-MATRIX BOOTSTRAP. It DISABLES `waqf_access_grant_admission`, so ' +
        'anything written inside it is not admission-checked at all, and it needs table OWNERSHIP — ' +
        'the privilege ADR-0008 says E12 must take away from the runtime. If this is a request path, ' +
        'the answer is activateGrant() + an established `admin:access_matrix:write` holder. If it is ' +
        'genuinely provisioning, add it here WITH THE REASON.',
    ).toEqual([]);

    const stale = [...permitted].filter((file) => !found.includes(file));
    expect(stale, 'Stale PERMITTED_BOOTSTRAP_CALL_SITES entries — delete them.').toEqual([]);
  });

  it('is not reachable from apps/** or from packages/api/src/**', () => {
    // The direction that matters most, asserted separately from the allowlist so it cannot be
    // weakened by adding a row: an application module suspending a database guard is never right.
    const found = filesNaming('withAccessMatrixBootstrap');
    const applicationCallers = found.filter(
      (file) =>
        file.startsWith('apps/') ||
        file.startsWith('packages/api/src/') ||
        file.startsWith('packages/auth/src/'),
    );
    expect(
      applicationCallers,
      'An application module suspends access-matrix admission. There is no legitimate case: a ' +
        'request path issues grants through activateGrant(), and provisioning is E12’s job.',
    ).toEqual([]);
  });
});

describe('the unextended handle: who may reach it', () => {
  it('is named only by the files on the allowlist', () => {
    const found = filesNaming('getBasePrismaClient');
    const permitted = new Set(PERMITTED_CALL_SITES.map((entry) => entry.file));

    const unexpected = found.filter((file) => !permitted.has(file));
    expect(
      unexpected,
      'A NEW CALLER OF THE UNEXTENDED HANDLE. It has no force filter (NFR-05) and no audit spine ' +
        '(NFR-04). If it needs a WRITE, use createPrismaClient(ctx) + withAudit() instead. If the ' +
        'access is genuinely legitimate, add it to PERMITTED_CALL_SITES with the reason.',
    ).toEqual([]);

    // And the other direction: a stale allowlist row is a claim about the codebase that is no
    // longer true, which is how a review comes to reason about callers that do not exist.
    const stale = [...permitted].filter((file) => !found.includes(file));
    expect(stale, 'Stale PERMITTED_CALL_SITES entries — delete them.').toEqual([]);
  });

  it('keeps the RAW client module-private', () => {
    const source = readFileSync(path.join(REPO_ROOT, 'packages/database/src/client.ts'), 'utf8');
    // The declaration must not be exported, from this file or anywhere.
    // ⚠ THE SIGNATURE GAINED A ROLE PARAMETER IN ADR-0008 ROUND 6 — there are up to THREE pools now
    // (app / provisioner / owner), one per separated database role. What is pinned is unchanged and is
    // the only thing that matters: the function is `function`-declared and NOT exported, from this
    // file, from the barrel, or from any subpath.
    expect(source).toMatch(
      /^function rawUnextendedClient\(role: ConnectionRole = 'app'\): PrismaClient \{/m,
    );
    expect(source).not.toMatch(/export\s+(function|const|\{[^}]*)\s*rawUnextendedClient/);
    // Only the declaring module and this file (which names it in prose) may mention it at all. If
    // any other file does, it either re-exports it or has found some other way to reach it.
    expect(filesNaming('rawUnextendedClient').filter((file) => file !== THIS_FILE)).toEqual([
      'packages/database/src/client.ts',
      // Prose only: the round-6 privilege test explains that `withAudit()` used to reach for this
      // singleton instead of the base its own client was built on — the latent defect that becomes a
      // real bug the moment there is more than one pool. It pins the fix by reading `current_user`
      // from inside the transaction, and naming the old call is how the reason stays legible.
      'packages/database/test/authorization-plane-privilege.integration.test.ts',
    ]);
  });

  it('does not re-export the Prisma constructor from the barrel', () => {
    const source = readFileSync(path.join(REPO_ROOT, 'packages/database/src/index.ts'), 'utf8');
    // The shadow, which an explicit local export gives precedence over `export *`.
    expect(source).toMatch(/export class PrismaClient \{/);
    expect(source).toMatch(/new PrismaClient\(\) from @qmulate\/database is refused/);
  });

  it('does not re-export runAuditedTransaction from the barrel', () => {
    const source = readFileSync(path.join(REPO_ROOT, 'packages/database/src/index.ts'), 'utf8');
    // It hands its callback `state.rawTx` — a raw transaction client the write guard must exempt.
    // MEASURED through the guarded handle: `s.rawTx.asset.update(…)` moved asset-002 from
    // 42,000,000 to 11 with an audit_event delta of 0. `withAudit()` is the public equivalent.
    expect(source).not.toMatch(/^\s*runAuditedTransaction,$/m);
    expect(source).toMatch(/^\s*withAudit,$/m);
  });

  it('does not re-export the scope-denial off switch from the barrel', () => {
    const source = readFileSync(path.join(REPO_ROOT, 'packages/database/src/index.ts'), 'utf8');
    // MEASURED: one call to `setScopeDenialHandler(() => {})` took the ACCESS_DENIED delta from 1
    // to 0, process-wide, for every caller. `installScopeDenialAuditing()` — which can only ever
    // re-install the real handler — stays exported.
    expect(source).not.toMatch(/^\s*setScopeDenialHandler,$/m);
    expect(source).toMatch(/^\s*installScopeDenialAuditing,$/m);
  });
});
