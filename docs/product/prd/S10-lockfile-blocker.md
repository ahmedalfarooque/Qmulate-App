# ⚠ REPO-WIDE BLOCKER — `pnpm add <anything>` breaks `@qmulate/auth`

**Status: ✅ RESOLVED 2026-08-31 (same day), commit `0bf9c6d` — measured on a genuine re-resolve,
not on a green suite. See "Resolution" at the end of this file.** The diagnosis below is kept
intact and unedited: the three killed branches and the measured mechanism are worth more to the
next person with a peer-routing problem than a tidy status line. *(The line this replaces read
"Status: OPEN. Found 2026-08-31 during S10/E9. Nothing is committed against it.")*

> **This is not "the transport was blocked."** It is **a latent repo-wide hazard found by the first
> person to add a dependency in months.** It gates **any** dependency addition by **anyone**, for any
> reason, and it would otherwise have surfaced later as a mysterious `@qmulate/auth` failure on
> somebody's unrelated change. The framing matters: nothing S10 built caused this, and fixing it is
> not S10 work — it is repo maintenance that S10 happened to trip over.

## Symptom

```
pnpm add pg-boss --filter @qmulate/jobs
→ packages/auth/src/server.ts(22,10): error TS2305:
  Module '"better-auth/adapters/prisma"' has no exported member 'prismaAdapter'
```

The lockfile diff on **every** fresh resolve:

```
- better-call@1.3.7(zod@4.4.3)     ← what the committed lockfile pins
+ better-call@1.3.7(zod@3.25.76)   ← what a fresh resolve chooses
```

That flip changes the identity of **every `@better-auth/*` package** in the tree and yields a build
without the export.

⚠ **`pg-boss` is innocent** — checked, not assumed. Its dependencies are `cron-parser`, `pg`,
`serialize-error`; the string `zod` appears nowhere in its manifest. Any package would do this.

## Mechanism — PEER ROUTING, not a version drift

Measured, first-hand:

```
better-auth@1.6.25   dependencies.zod        : ^4.3.6     ← a REAL dependency
better-auth@1.6.25   peerDependencies.zod    : undefined
better-auth@1.6.25   dependencies.better-call: "1.3.7"    ← EXACT PIN
better-call@1.3.7    peerDependencies.zod    : ^4.0.0     ← the hard requirement
workspace × 5        zod                     : ^3.25.0
packages/database    zod = DEPENDENCY ^3.25.0 · better-auth = DEV-dependency ^1.3.0
.npmrc               auto-install-peers=true · strict-peer-dependencies=false
                     resolution-mode=highest · shamefully-hoist=false
```

**`zod@4.4.3` is in the tree legitimately** — better-auth depends on it directly. There is **no
phantom** and **no undeclared package**.

When resolving `better-call`'s zod **peer** inside `packages/database`'s subtree, pnpm prefers **the
importer's own zod 3** over better-auth's zod 4. `strict-peer-dependencies=false` makes the unmet
peer a **warning**, so pnpm cheerfully produces the broken tree and the install exits 0.

⚠ **CI has never seen this.** CI installs with `--frozen-lockfile` and therefore **never
re-resolves** — it has only ever built the zod-4 resolution. Nothing in the repo pins it: root
`package.json` has no `pnpm.overrides` and no `peerDependencyRules`. **The committed lockfile is the
only thing holding this together.**

## Branches already KILLED — do not re-spend on these

**✗ "the import is stale."** REFUTED by measurement. `better-auth/adapters/prisma` resolves via
`exports` to `dist/adapters/prisma-adapter/index.d.mts`, which is one line —
`export * from "@better-auth/prisma-adapter"` — and `@better-auth/prisma-adapter@1.6.25` contains
`declare const prismaAdapter` / `export { PrismaConfig, prismaAdapter }`. **`prismaAdapter` IS the
current, correct export at the resolved version. `packages/auth/src/server.ts:22` is right.**

**✗ "migrate the workspace to zod 4."** WITHDRAWN. It was premised on zod 4 being a phantom with no
importer. It has a legitimate one. **The workspace does not need to migrate**, and this is not a
five-package migration.

**✗ `pnpm.overrides: { "better-call>zod": "4.4.3" }`.** TRIED AND FAILED (by the S10 builder).
Installs with **zero lockfile churn**, then `pnpm add` flips it anyway; the warning merely restates
itself as `unmet peer zod@4.4.3: found 3.25.76`. **Overrides control which VERSION a dependency
resolves to; they do not control which already-present version satisfies a PEER.**

## ⊕ Best first move — MOVE the dependency, don't adjudicate the peer

`packages/database` uses better-auth at runtime in **exactly one place**:

```ts
// packages/database/src/seed.ts:292
const { hashPassword } = await import('better-auth/crypto');
```

A **dynamic** import, inside the **fixture-only seed** (reachable only after `assertFixtureOnly()`;
`SEED_PASSWORD` is a published constant, not a secret), needed because a bare `user` row will not let
better-auth accept sign-in. **Every other `better-auth` hit in `packages/database/src` is a comment.**

**So: have `packages/auth` — which owns better-auth legitimately — expose a hash helper the seed
calls, and drop `better-auth` from `packages/database` entirely.** That removes the collision by
taking the dependency out of the subtree where the peer misroutes, rather than arguing about which
zod wins.

⚠ **`packages/auth/src` does NOT currently export such a helper.** This is *add one, then call it* —
**not** a two-line import re-point. Scope it accordingly.

⚠ **The seed is load-bearing for every integration suite.** A one-function refactor of dev-only code
still needs a **full gate run and its own CI leg**.

**If that fails, remaining levers** (none tested): `dedupePeerDependents`; an `overrides` on `zod`
itself; `pnpm.packageExtensions` rewriting `better-call`'s peer range — ⚠ that last one **asserts
zod-3 compatibility on a library that declares otherwise**, papering over rather than resolving.

## Rules for whoever takes this

1. **Its own stage, its own gate run, its own CI leg.** Never bundled into feature work — a
   repo-wide build change inside a feature commit is a diff nobody can read.
2. **Restore by hand only.** No `git checkout` / `restore` / `stash` / `reset` / `clean` (INCIDENT-1).
   The S10 builder reverted its failed attempt with `git show HEAD:<file> >` per file, diffs captured
   first, then `--frozen-lockfile` reinstall, then typecheck 13/13.
3. **A wrong resolution rewrites the lockfile for the whole repo.** Blocked-and-clean beats
   maybe-fixed. Stop rather than guess.

## ⚠ What this blocks

**Both remaining pieces of S10, not just the queue.** `packages/storage` has **zero dependencies**
and two source files, so the **document vault** (E9's own exit, BR-701–703 — object storage with
≥10-year object-lock and versioning) will need a storage client. **Anything needing a new dependency
is blocked until this is fixed.**

## Provenance

Diagnosed by the S10/E9 builder session during 2026-08-31; the `pnpm.overrides` attempt and its
failure reason are that session's. Every dependency-graph claim above was **independently re-measured
by the orchestrator** from the installed tree and manifests before being written here.

## ✅ Resolution (2026-08-31, commit `0bf9c6d` — added after the diagnosis above; nothing above is edited)

**A FOURTH BRANCH DIED FIRST: the "best first move" above is STRUCTURALLY IMPOSSIBLE as written.**
"Have `packages/auth` expose a hash helper the seed calls" needs a manifest edge database → auth,
and `packages/auth`'s `dependencies` already carry `@qmulate/database` (for the Prisma adapter) —
a workspace cycle, which turbo hard-errors on while every task hangs off `^build`. Measured from
the manifests by the continuation builder; confirmed by the orchestrator, who wrote the move.

**The lever that worked keeps the move's spirit — the dependency LEAVES the subtree — with a
different mechanism: the hash became a PINNED CONSTANT.** The seed's one runtime need was a
better-auth-format hash of `SEED_PASSWORD`, a published fixture constant; the hash of a public
value is itself public. It was generated once by better-auth@1.6.25's own `hashPassword` and lives
in `packages/database/src/seed/credentials.ts` (provenance + re-runnable regeneration command in
its header), and `better-auth` left `packages/database`'s manifest entirely — this was the last
importer holding both `zod@^3` and `better-auth` (auth and apps/web hold better-auth and NO zod;
api/config/domain/jobs hold zod and NO better-auth). Side effect in the right direction: the
credential row was the seed's one nondeterministic field (salted per run); it is now
deterministic.

**Controls, each shown red before the fix committed:** `packages/auth/test/
seed-credential-parity.test.ts` (verifyPassword round-trip + negative control — dies on a
corrupted constant or a format-breaking better-auth upgrade) · `packages/database/test/
seed-credentials.test.ts` (manifest pin + comment-stripped source scan, in database's OWN suite so
turbo's hash inputs cover what it reads) · the E2E suite's 84 sign-ins through the real verify
path.

**The proof that counts — a genuine re-resolution, the thing CI never does:**
`pnpm add pg-boss --filter @qmulate/jobs` → full re-resolve (resolved 1145, reused 0) →
`@qmulate/auth` `tsc --noEmit` exit 0; `better-call@1.3.7(zod@4.4.3)` the sole better-call key; no
`better-*` keyed to any zod 3. The same command produced the TS2305 at the top of this file before
the fix. The re-resolve did bump unrelated transitives inside better-auth's peer-suffix key (pg,
jiti) — the identity-churn mechanism visibly exercising itself, this time with no zod flip. The
add was hand-reverted so the fix commit carries exactly a three-deletion-line lockfile delta.

**Full gate at the fix commit:** typecheck 13/13 · lint/format clean · unit 10/10 packages ·
integration both suites twice on one fresh cluster (s10lockfix/54447), identical rounds (db
50 files / 1103+38 todo · api 734+4 todo) · guardrail · E2E 84 passed exit 0 · three mutations
killed (one on a declared retake after a mis-aimed first form that executed zero tests — the
zero-tests trap this repo's "Run locally" block warns about, met in the wild and caught by the
both-halves rule).

`pnpm add` is UNBLOCKED for everyone. The S10 transport (pg-boss) and the vault's storage client
may now add their dependencies normally.
