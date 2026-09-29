// QMULATE — the deterministic, fixture-only seed.  (E1 / Sprint 1)
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT THIS PROGRAM GUARANTEES
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// 1. IT REFUSES BEFORE IT CONNECTS.  `assertFixtureOnly()` runs as the FIRST statement of
//    `main()`, before any database module is even imported (the db imports are dynamic for
//    exactly this reason). A misconfigured environment cannot open a connection, let alone write.
//    Then the input path is checked, then the fixture's own provenance markers. Every refusal
//    happens before the first write, so a refused run leaves the database byte-identical.
//                                                              → G-8 / NFR-03, assertions B3–B5
//
// 2. IT IS DETERMINISTIC.  Fixture ids become primary keys verbatim; every other id is a pure
//    function of fixture values; every timestamp the fixture does not supply comes from the
//    single `SEED_EPOCH` constant plus an insertion ordinal; every Hijri snapshot is computed
//    from a fixed Gregorian input. There is NO `Date.now()`, NO no-argument `new Date()`, NO
//    `Math.random()`, and NO `cuid()` anywhere in the seed or its mappers. That is what makes
//    the append-only audit hash chain byte-reproducible and lets assertion A7 pin a frozen final
//    `rowHash`.
//
// 3. IT IS IDEMPOTENT.  Every row is upserted on its deterministic id, and the update branch
//    carries the same field set as the create branch, so a re-run CONVERGES rows back onto the
//    fixture rather than merely skipping them. One deliberate exception: the Shart al-Waqif
//    columns are written on INSERT ONLY (Binding rule 1 — see below).
//    Re-running does append further audit events; the frozen-vector assertion (A7) is defined
//    against a fresh `migrate deploy` + exactly one seed.
//
// 4. EVERY WRITE LEAVES AN AUDIT ROW.  All writes go through the extended client inside ONE
//    audited transaction, so the whole seed and its entire audit trail commit or roll back
//    together. Nothing bypasses the audit spine — that is half of the E1 exit criterion.
//
// 5. IT NEVER REWRITES A FOUNDER'S CONDITIONS.  `shartAlWaqif` / `shartAlWaqifVersion` are
//    excluded from every update branch. A seed re-run is precisely the sort of "correction" that
//    Binding rule 1 forbids, and the `waqf_shart_immutable` database trigger would reject it
//    anyway. The seed does not try.
//
// CONFIDENTIALITY: the only file this program will read is `data/fixtures/sample-waqf.json`.
// It never reads, references, or falls back to `archive/raw-intake/`.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⚠ ORCHESTRATOR NOTE — script wiring
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `packages/database/package.json` points `db:seed` / `seed` / `prisma.seed` at
// `tsx prisma/seed.ts`, and exports `./seed` → `./src/seed/index.ts`. This file is `src/seed.ts`
// (the path assigned to this agent) and `src/seed/` holds its helper modules. Either repoint
// those scripts at `tsx src/seed.ts`, or add a one-line `prisma/seed.ts` containing
// `import '../src/seed.js';`. Nothing else needs to change.

import { OPERATING_MODEL_GATE_CHECKLIST } from '@qmulate/domain';
import { toHijriSnapshot } from '@qmulate/domain/dates';
import { readFileSync } from 'node:fs';

import {
  assertFixtureOnly,
  assertPermittedFixturePath,
  requestedFixturePath,
  SeedRefusedError,
} from './guardrail.js';
import { SEED_PASSWORD_HASH } from './seed/credentials.js';
import { parseFixture, type Fixture } from './seed/fixture-schema.js';
import { toHijri } from './seed/hijri.js';
import { SEED_HOLIDAYS } from './seed/holidays.js';
import {
  deriveAccessGrants,
  deriveBankAccounts,
  deriveOnboardingGates,
  deriveCanonicalObligations,
  OBLIGATION_LIBRARY_VERSION,
  templatesWithheldFromRegister,
  deriveComplianceObligations,
  deriveMemberships,
  deriveRegistrationDeadlines,
  deriveCertificateUpdateDeadlines,
  deriveReversionTakers,
  deriveRunApprovals,
  mapAsset,
  mapBeneficiary,
  mapClient,
  mapComplianceTask,
  mapDistribution,
  mapExpense,
  mapExpropriation,
  mapGovernmentFiling,
  mapNazirFee,
  mapRevenue,
  mapTrusteeship,
  mapWaqf,
  mapWaqif,
  SEED_ADMIN_EMAIL,
  SEED_PASSWORD,
  SEED_USERS,
  derivedId,
} from './seed/map.js';
import { ALL_SEED_SETTINGS } from './seed/settings.js';

// Type-only import: fully erased at runtime, so it cannot pull a database module in ahead of the
// guardrails. (`ActorContext` is the E1 contract's alias for `RequestContext`.)
import type { ActorContext } from './context.js';

/**
 * THE seed clock. Every timestamp the fixture does not supply derives from this constant.
 * Audit events are stamped `SEED_EPOCH + <insertion ordinal> ms`, which gives a total order that
 * is identical on every machine and every run.
 */
const SEED_EPOCH = new Date('2026-01-01T00:00:00.000Z');

/** The actor every seed write is attributed to (also the `createdBy` the audit spine stamps). */
const SEED_ACTOR_ID = 'user-seed-admin';

/**
 * Prisma models a JSON column as the recursive `InputJsonValue`, which TypeScript cannot always
 * prove a concrete, zod-validated object satisfies. This is the single documented widening point
 * for JSON columns — every value passed through it is validated by its own zod schema first.
 */
function jsonValue(value: unknown): never {
  return value as never;
}

/**
 * The field-encryption extension DERIVES every `...Hmac` column at write time and THROWS if a
 * caller supplies one — but Prisma's generated create-input still marks `BankAccount.ibanHmac` as
 * required, because the extension is invisible to the generated types. This is the single
 * documented widening point for that mismatch. It exists so the seed never sets an HMAC itself.
 */
function withDerivedHmac(data: unknown): never {
  return data as never;
}

async function main(): Promise<void> {
  // ── LAYER 2 OF THE RESIDENCY GUARDRAIL ────────────────────────────────────────────────────
  // First statement. No database module has been imported at this point.
  assertFixtureOnly();
  const fixturePath = assertPermittedFixturePath(requestedFixturePath());
  const fixture: Fixture = parseFixture(JSON.parse(readFileSync(fixturePath, 'utf8')));

  process.stdout.write(
    [
      'QMULATE fixture seed',
      '  DATA_CLASSIFICATION = fixture-only  (guardrail passed)',
      `  input               = ${fixturePath}`,
      '',
    ].join('\n') + '\n',
  );

  // ── Only now may the database be touched. ────────────────────────────────────────────────
  const { makeSystemContext } = await import('./context.js');
  const { runAuditedTransaction } = await import('./extensions/audit.js');
  // ⚠ THE WHOLE SEED RUNS ON THE PRIVILEGED (OWNER) CONNECTION — `MIGRATOR_DATABASE_URL`.
  //
  // Since ADR-0008 round 6 the runtime role (`qmulate_app`, `DATABASE_URL`) holds SELECT-only on
  // `waqf_access_grant` and `membership` and owns no table. MEASURED as that role: the seed runs all
  // seventeen business steps with no privilege error and dies at exactly ONE point — step 18's
  // `withAccessMatrixBootstrap()`, on `ALTER TABLE "waqf_access_grant" DISABLE TRIGGER` with
  // `42501 must be owner of table`. So the app role is *almost* sufficient.
  //
  // Two ways to close that one gap were weighed, and the choice matters:
  //
  //   (a) run steps 1–17 on the app connection and steps 18–19 on the owner connection. REJECTED.
  //       The whole seed is ONE audited transaction, and every audit event's `occurredAt` is
  //       `SEED_EPOCH + <insertion ordinal>`. Splitting it into two transactions on two connections
  //       renumbers the ordinals, rewrites the frozen hash chain and breaks assertion A7's pinned
  //       final `rowHash` — while also giving the seed two independent fates, so a failure in step 19
  //       would leave steps 1–18 committed. That is a worse property than the one it buys.
  //
  //   (b) run the ENTIRE seed on the owner connection. SHIPPED. The seed is a PROVISIONING PROGRAM,
  //       not a request path: it refuses to start outside `DATA_CLASSIFICATION=fixture-only`, it is
  //       invoked next to `migrate deploy` by the same privileged credential, and it is the thing
  //       that lays down the first `admin:access_matrix:write` seat — which by construction no
  //       ordinary rule can authorise (authority cannot authorise its own first instance).
  //
  // What (b) gives up, stated rather than glossed: the seed no longer DEMONSTRATES that the app
  // role's privilege matrix is sufficient for ordinary business writes. That demonstration moved to
  // `test/authorization-plane-privilege.integration.test.ts`, which exercises the business tables as
  // `qmulate_app` explicitly.
  const { createPrivilegedPrismaClient, getPrivilegedBasePrismaClient } =
    await import('./client.js');
  // ⚠ SUSPENDS A SECURITY GUARD, FOR STEP 18 ONLY. Read `./access-matrix-bootstrap.js`'s header
  // before touching the call site below — it is not a convenience, it is the irreducible bootstrap
  // of the authorization plane, and it needs table OWNERSHIP.
  const { withAccessMatrixBootstrap } = await import('./access-matrix-bootstrap.js');
  // The package's ONE approval-artifact fingerprint, which itself uses the package's ONE
  // canonicaliser (`canonicalJson`, which THROWS on a JS number — that is what keeps money off this
  // path in float form). `deriveRunApprovals` binds an approval to the exact artifact it approved,
  // and a second fingerprint implementation is how two "canonical" forms of one object come to exist.
  const { approvalFingerprint } = await import('./reserved-matter.js');

  const waqfIds = fixture.waqfs.map((waqf) => waqf.id);

  /**
   * Insertion ordinal → audit `occurredAt`.
   *
   * `RequestContext.occurredAtOverride` accepts a FUNCTION precisely so a seed can advance an
   * ordinal per event without rebuilding the context. It is honoured only for a SYSTEM actor
   * under `DATA_CLASSIFICATION=fixture-only`; in production every event gets the wall clock, so
   * no actor can ever backdate their own trail.
   */
  let auditOrdinal = 0;
  const nextOccurredAt = (): Date => new Date(SEED_EPOCH.getTime() + auditOrdinal++);
  // ⊕ S11-1 — one line per recorded registration anchor, computable or not, hoisted out of the
  // transaction so the summary can print it: "recorded, not computable" must be a sentence in the
  // output, never a silence.
  let anchorReport: readonly string[] = [];

  /**
   * SYSTEM context: the scoping force-filter is lifted so the seed can write across all four
   * endowments, but audit emission and field encryption stay ON — every seed write leaves an
   * audit row (E1 exit criterion) and every UBO/IBAN column is still encrypted at rest.
   */
  const seedActor: ActorContext = makeSystemContext({
    actorId: SEED_ACTOR_ID,
    authorizedWaqfIds: waqfIds,
    requestId: 'seed',
    reason: 'fixture seed (E1)',
    occurredAtOverride: nextOccurredAt,
  });

  /**
   * COMPOSITION ORDER IS PART OF THE SECURITY CONTRACT — encryption outermost, audit innermost.
   *
   * It is decided in exactly one place, `createScopedPrisma()` in `./client.js`, which documents
   * why (and which way round Prisma actually nests extensions — the intuitive reading is wrong).
   * The seed deliberately does not compose its own chain: a second copy of that order is a second
   * chance to get it wrong, and getting it wrong writes plaintext PII into `audit_event`.
   */
  const base = getPrivilegedBasePrismaClient();
  const db = createPrivilegedPrismaClient(seedActor);

  const counts: Record<string, number> = {};
  /** One audited write. Counting here keeps the report honest: no count without a write. */
  const step = async <T>(model: string, run: () => Promise<T>): Promise<T> => {
    counts[model] = (counts[model] ?? 0) + 1;
    return run();
  };

  try {
    // ONE audited transaction for the whole seed: every row and every audit event share a single
    // fate, so a failure anywhere leaves the database exactly as it was. The `audit_chain_head`
    // singleton is created on demand by the audit spine under its advisory lock — the seed does
    // not write it, because a chain that only starts working if the seed ran first is a chain
    // that silently does not start.
    await runAuditedTransaction(
      base,
      seedActor,
      async (auditTx) => {
        // ── 1. Settings (GLOBAL only) ────────────────────────────────────────────────────────
        // Every regulatory figure in the system, each carrying its own "⚠ unverified" marker.
        // Global rows are seeded FIRST so nothing downstream is tempted to hard-code a threshold
        // it needs. Per-endowment OVERRIDES carry a `waqfId` foreign key, so they cannot be
        // written until the waqfs exist — they land at step 5b below.
        const writeSetting = (setting: (typeof ALL_SEED_SETTINGS)[number]) => {
          const data = {
            waqfId: setting.waqfId,
            key: setting.key,
            value: jsonValue(setting.value),
          };
          return step('Setting', () =>
            db.setting.upsert({
              where: { id: setting.id },
              create: { id: setting.id, ...data },
              update: data,
            }),
          );
        };

        for (const setting of ALL_SEED_SETTINGS.filter((s) => s.waqfId === null)) {
          await writeSetting(setting);
        }

        // ── 2. Users ─────────────────────────────────────────────────────────────────────────
        for (const user of SEED_USERS) {
          const data = {
            name: user.name,
            email: user.email,
            emailVerified: user.emailVerified,
            twoFactorEnabled: user.twoFactorEnabled,
            locale: user.locale,
            isActive: user.isActive,
          };
          await step('User', () =>
            db.user.upsert({
              where: { id: user.id },
              create: { id: user.id, ...data },
              update: data,
            }),
          );
        }

        // ── 2b. Credential accounts (better-auth) ────────────────────────────────────────────
        // E0's exit criterion is "a SEEDED admin can register, enrol TOTP and log in". Seeding a
        // bare `user` row does not achieve that: better-auth refuses sign-up for an existing
        // email ("User already exists") AND refuses sign-in without a credential `account` row,
        // so the seeded admin would be permanently locked out. Every seeded operator therefore
        // gets a credential account here.
        //
        // The hash IS better-auth's own hasher's output — precomputed once and pinned in
        // `./seed/credentials.ts` (provenance and regeneration command there), NOT computed
        // here. The runtime dynamic import of `better-auth/crypto` this replaced was the only
        // reason `better-auth` sat in this package's manifest, and that entry mis-routed
        // `better-call`'s zod peer on every fresh resolve, breaking `@qmulate/auth` on any
        // `pnpm add` anywhere in the repo (`docs/product/prd/S10-lockfile-blocker.md`). The
        // format still matches what the sign-in path verifies —
        // `packages/auth/test/seed-credential-parity.test.ts` re-proves that on every unit run,
        // and the E2E suite signs in with it. Deliberate side effect, in the right direction:
        // the credential row is now deterministic like every other seeded row (a runtime hash
        // was salted per run — this seed's one exception to guarantee 2).
        //
        // SAFETY: reachable only after `assertFixtureOnly()` has passed, so this can only ever
        // run against a fixture-only database. `SEED_PASSWORD` is a published constant, not a
        // secret; it exists so a developer can sign in, and it is worthless anywhere real.
        const seedPasswordHash = SEED_PASSWORD_HASH;
        for (const user of SEED_USERS) {
          // ⚠ A DECLARED SERVICE SEAT GETS NO CREDENTIAL — S10/T2, and it is the point, not an
          // optimisation: with no `account` row there is no password, sign-in is impossible, and
          // "non-human" is a fact of the identity plane rather than a naming convention. The
          // seat's context is built in-process by `makeServiceSeatContext` only (D1).
          if (user.serviceSeat !== undefined) continue;
          const accountData = {
            userId: user.id,
            accountId: user.id,
            providerId: 'credential',
            password: seedPasswordHash,
          };
          await step('Account', () =>
            db.account.upsert({
              where: { id: derivedId.credentialAccount(user.id) },
              create: { id: derivedId.credentialAccount(user.id), ...accountData },
              update: accountData,
            }),
          );
        }

        // ── 3. Client → 4. Waqifs → 5. Waqfs ─────────────────────────────────────────────────
        for (const fixtureClient of fixture.clients) {
          const { id, data } = mapClient(fixtureClient);
          await step('Client', () =>
            db.client.upsert({ where: { id }, create: { id, ...data }, update: data }),
          );
        }

        for (const fixtureWaqif of fixture.waqifs) {
          const { id, data } = mapWaqif(fixtureWaqif);
          await step('Waqif', () =>
            db.waqif.upsert({ where: { id }, create: { id, ...data }, update: data }),
          );
        }

        for (const fixtureWaqf of fixture.waqfs) {
          const beneficiaries = fixture.beneficiaries.filter((b) => b.waqfId === fixtureWaqf.id);
          const nazirFee = fixture.nazirFees.find((f) => f.waqfId === fixtureWaqf.id);
          const { id, data, immutable } = mapWaqf(fixtureWaqf, beneficiaries, nazirFee);
          await step('Waqf', () =>
            db.waqf.upsert({
              where: { id },
              create: {
                id,
                ...data,
                // WRITE-ONCE. Present on create only.
                shartAlWaqif: jsonValue(immutable.shartAlWaqif),
                shartAlWaqifVersion: immutable.shartAlWaqifVersion,
                shartAlWaqifSetAt: immutable.shartAlWaqifSetAt,
                shartAlWaqifSetAtHijri: immutable.shartAlWaqifSetAtHijri,
                // ── THE DEED TERMS, ALSO WRITE-ONCE (S4/E3, migration 12 tier 3) ──────────────
                // Same treatment and the same reason: they are FOUNDER'S CONDITIONS. The database
                // permits `NULL -> value` once and refuses `value -> anything` afterwards, so a seed
                // re-run that restated one would be rejected with 42501. They are absent from the
                // update branch below so the seed does not even try.
                //
                // ⚠ `reversionClauseCaptured` is REQUIRED with no default and is therefore
                // unavoidable here: every seeded endowment must state whether its مآل clause has
                // been read. waqf-001…004 state `true` + `reversion: null` — "the deed was read and
                // names no ultimate taker" — which is a statement about an INVENTED deed. A real
                // endowment must never be given `true` by a migration or a seed.
                //
                // ⚠ waqf-005 STATES `false`, AND IT IS THE ONLY ONE (owner decision D-C, 2026-08-16
                // — "yes"). It is the INTAKE state: the endowment is on the system and nobody has
                // read its مآل clause yet. Before it, all four endowments recorded the clause, so
                // the two meanings of a NULL `reversionKind` — "the deed says none" and "nobody has
                // looked" — had only one example between them and the second could not be tested.
                // It is also the subject the inverted seal test needs, and it is reachable by id.
                continuationStipulation: immutable.continuationStipulation,
                reversionClauseCaptured: immutable.reversionClauseCaptured,
                reversionKind: immutable.reversionKind,
                reversionRecordedAt: immutable.reversionRecordedAt,
                reversionRecordedAtHijri: immutable.reversionRecordedAtHijri,
              },
              // BINDING RULE 1: the Shart al-Waqif is IMMUTABLE. It is absent from this update
              // branch on purpose — an amendment is a reserved matter requiring competent-authority
              // approval and a full audit trail, never a re-run of a seed script. The
              // `waqf_shart_immutable` trigger enforces the same thing at the database, so a seed
              // that did try would be rejected with SQLSTATE 42501. The write-once deed terms above
              // are absent for the same reason.
              update: data,
            }),
          );
        }

        // ── 5a. Onboarding gates (S12-3, BR-1101) ────────────────────────────────────────────
        //
        // Three rows per endowment, in gate order, BEFORE any distribution or filing row: migration
        // 52's twins refuse a `distribution` INSERT and a filing's move to SUBMITTED while Gate 02 is
        // not CLEARED, so the gates must be on file first. The fixture STATES each gate's clearance
        // (an invented date, attributed to the seed actor, the operating model's checklist fully
        // attested); waqf-004 is left at Gate 02 OPEN on purpose — V-11's browser subject — and
        // waqf-005 is NOT (see its `_note`: the engine suites create runs there). The ORDER is the
        // database's: a fixture stating Gate 02 cleared over an open Gate 01 refuses to seed rather
        // than being remapped (ADR-0004).
        for (const gate of deriveOnboardingGates(
          fixture,
          (date) => String(toHijriSnapshot(date)),
          OPERATING_MODEL_GATE_CHECKLIST,
          SEED_ACTOR_ID,
        )) {
          const { id, data } = gate;
          const { evidence, ...plain } = data;
          // A nullable Json column is OMITTED when null — Prisma refuses a bare `null` on create.
          const create = {
            id,
            ...plain,
            ...(evidence === null ? {} : { evidence: jsonValue(evidence) }),
          };
          // The update branch never REGRESSES a gate: an E2E journey that cleared waqf-004's Gate 02
          // must survive a re-seed (the S11-2 discharge lesson — a recorded act is not undone by a
          // seed). Only the descriptive `note` is refreshed.
          await step('OnboardingGate', () =>
            db.onboardingGate.upsert({
              where: { id },
              create,
              update: { note: plain.note },
            }),
          );
        }

        // ── 5b. Settings (per-endowment OVERRIDES) ───────────────────────────────────────────
        // Deferred from step 1: `setting.waqfId` is a foreign key onto `waqf`.
        for (const setting of ALL_SEED_SETTINGS.filter((s) => s.waqfId !== null)) {
          await writeSetting(setting);
        }

        // ── 6. Trusteeship deeds ─────────────────────────────────────────────────────────────
        for (const fixtureWaqf of fixture.waqfs) {
          const { id, data } = mapTrusteeship(fixtureWaqf);
          await step('TrusteeshipDeed', () =>
            db.trusteeshipDeed.upsert({ where: { id }, create: { id, ...data }, update: data }),
          );
        }

        // ── 7. Bank accounts (derived) ───────────────────────────────────────────────────────
        // Plaintext IBAN in, ciphertext at rest; the `ibanHmac` column is derived by the extension.
        for (const account of deriveBankAccounts(fixture)) {
          const { id, data } = account;
          await step('BankAccount', () =>
            db.bankAccount.upsert({
              where: { id },
              create: withDerivedHmac({ id, ...data }),
              update: withDerivedHmac(data),
            }),
          );
        }

        // ── 8. Assets → 9. Expropriations ────────────────────────────────────────────────────
        for (const fixtureAsset of fixture.assets) {
          const { id, data } = mapAsset(fixtureAsset);
          await step('Asset', () =>
            db.asset.upsert({ where: { id }, create: { id, ...data }, update: data }),
          );
        }

        for (const fixtureExpropriation of fixture.expropriations) {
          const { id, data } = mapExpropriation(fixtureExpropriation);
          await step('Expropriation', () =>
            db.expropriation.upsert({ where: { id }, create: { id, ...data }, update: data }),
          );
        }

        // ── 10. Beneficiaries (+ UBO, field-encrypted) ───────────────────────────────────────
        for (const fixtureBeneficiary of fixture.beneficiaries) {
          const { id, data } = mapBeneficiary(fixtureBeneficiary);
          await step('Beneficiary', () =>
            db.beneficiary.upsert({
              where: { id },
              create: withDerivedHmac({ id, ...data }),
              update: withDerivedHmac(data),
            }),
          );
        }

        // ── 11. Transactions ─────────────────────────────────────────────────────────────────
        // Revenue first, then expenses, matching the fixture's own order.
        for (const revenue of fixture.financialTransactions.revenue) {
          const { id, data } = mapRevenue(revenue);
          await step('Transaction', () =>
            db.transaction.upsert({ where: { id }, create: { id, ...data }, update: data }),
          );
        }
        for (const expense of fixture.financialTransactions.expenses) {
          const { id, data } = mapExpense(expense);
          await step('Transaction', () =>
            db.transaction.upsert({ where: { id }, create: { id, ...data }, update: data }),
          );
        }

        // ── 12. Nazir fees ───────────────────────────────────────────────────────────────────
        for (const fee of fixture.nazirFees) {
          const { id, data } = mapNazirFee(fee);
          await step('NazirFee', () =>
            db.nazirFee.upsert({ where: { id }, create: { id, ...data }, update: data }),
          );
        }

        // ── 13. Distributions + 14. line items ───────────────────────────────────────────────
        for (const fixtureDistribution of fixture.distributions) {
          const mapped = mapDistribution(fixtureDistribution, fixture);
          const { id, data } = mapped.distribution;
          const payload = { ...data, computationTrace: jsonValue(data.computationTrace) };
          await step('Distribution', () =>
            db.distribution.upsert({ where: { id }, create: { id, ...payload }, update: payload }),
          );
          for (const lineItem of mapped.lineItems) {
            await step('DistributionLineItem', () =>
              db.distributionLineItem.upsert({
                where: { id: lineItem.id },
                create: { id: lineItem.id, ...lineItem.data },
                update: lineItem.data,
              }),
            );
          }
        }

        // ── 15. Compliance obligations (derived template) → 16. task instances ───────────────
        const obligations = deriveComplianceObligations(fixture);
        for (const obligation of obligations) {
          const { id, data } = obligation;
          await step('ComplianceObligation', () =>
            db.complianceObligation.upsert({
              where: { id },
              create: { id, ...data },
              update: data,
            }),
          );
        }

        // ── 15b. The CANONICAL §09 obligation library — S8/E7 ────────────────────────────────
        //
        // ⚠ ALONGSIDE the ten placeholders above, NEVER as an edit to them. That is the whole shape
        // of the owner's S8-Q5 ruling and of migration 31: a template is immutable within a library
        // version, so a different library is DIFFERENT ROWS carrying a different `libraryVersion`,
        // never the same rows rewritten. The placeholders keep `'fixture-derived'`; these carry
        // `'2026-08-20.1'`, and the ids are version-qualified so a future release can coexist with
        // this one under `UNIQUE (code, libraryVersion)`.
        //
        // ⚠ RE-SEEDING WRITES IDENTICAL VALUES INTO THE UPDATE BRANCH AND MIGRATION 31 PERMITS IT,
        // because the guard compares `IS DISTINCT FROM` — an upsert that changes nothing changes
        // nothing. That is MEASURED by seeding twice, not reasoned about: an immutability guard that
        // refuses a converging re-seed would make the seed non-idempotent, and idempotency is what
        // makes the audit spine reproducible at all.
        //
        // ⚠ ONE ROW CARRIES `confidentiality: 'AML_RESTRICTED'` — `GOV-AML-02`, the duty to report
        // suspicion to the FIU (owner ruling S8-Q1). Migration 32 installed the mechanism and marked
        // no row; the classification arrives WITH the row, here. Every other row is `NORMAL`, and a
        // test pins EXACTLY ONE restricted obligation — because "compartment the row" quietly
        // becoming "compartment the register" is an outage that reads as a working control.
        for (const obligation of deriveCanonicalObligations()) {
          const { id, data } = obligation;
          await step('ComplianceObligation', () =>
            db.complianceObligation.upsert({
              where: { id },
              create: { id, ...data },
              update: data,
            }),
          );
        }
        // ⊕ S8-Q5 — the CODE travels with the id, because the task now carries a FROZEN snapshot of
        // the template it was instantiated from and the two must agree by construction rather than by
        // a second lookup that could drift.
        const obligationByTaskId = new Map(
          obligations.map((o) => [o.taskId, { id: o.id, code: o.data.code }]),
        );
        for (const task of fixture.complianceTasks) {
          const obligation = obligationByTaskId.get(task.id);
          if (obligation === undefined) {
            throw new SeedRefusedError(`fixture drift — no obligation derived for ${task.id}`);
          }
          const { id, data } = mapComplianceTask(task, obligation.id, obligation.code);
          await step('ComplianceTask', () =>
            db.complianceTask.upsert({ where: { id }, create: { id, ...data }, update: data }),
          );
        }

        // ── 16b. ⊕ S11-1 — the computed REGISTER_30BD deadline for each RECORDED, COMPUTABLE anchor ─
        // Computed THROUGH THE ENGINE over the seed's own holidays and envelopes (see
        // `deriveRegistrationDeadlines`), after the tasks so the row can bind to an open GOV-REG-01
        // instance where the fixture has one. Migration 38 freezes the row's identity; a re-run
        // upserts identical values, which the frozen-identity guard compares by VALUE and permits.
        const globalSettingValue = (key: string): unknown => {
          const row = ALL_SEED_SETTINGS.find((s) => s.key === key && s.waqfId === null);
          if (row === undefined) {
            throw new SeedRefusedError(
              `seed settings carry no global "${key}" — refusing to compute a deadline over a guessed window.`,
            );
          }
          return row.value;
        };
        const registrationDeadlines = deriveRegistrationDeadlines(fixture, {
          workweekSetting: globalSettingValue('calendar.workweek'),
          registerWindowSetting: globalSettingValue('deadline.REGISTER_30BD.businessDays'),
          holidays: SEED_HOLIDAYS,
          openRegistrationTaskIdFor: (waqfId) => {
            for (const task of fixture.complianceTasks) {
              if (task.waqfId !== waqfId) continue;
              if (task.status !== 'not_started' && task.status !== 'in_progress') continue;
              if (obligationByTaskId.get(task.id)?.code === 'GOV-REG-01') return task.id;
            }
            return null;
          },
        });
        anchorReport = registrationDeadlines.report;
        for (const { id, data } of registrationDeadlines.rows) {
          await step('Deadline', () =>
            db.deadline.upsert({
              where: { id },
              create: { id, ...data, windowSnapshot: jsonValue(data.windowSnapshot) },
              update: { ...data, windowSnapshot: jsonValue(data.windowSnapshot) },
            }),
          );
        }

        // ── 16c. ⊕ S11 item 2a — the CERTIFICATE arm of UPDATE_15BD, where the fixture records that the
        // sweep RAISED the duty: a canonical GOV-REG-02 task (EVENT_TRIGGER) + the deadline computed
        // THROUGH THE ENGINE from the expiry, bound to it — what `deadline.sweepCertificateExpiry` writes.
        // The canonical obligation is resolved from the rows step 15b just wrote, never assumed.
        const canonicalUpdate = await db.complianceObligation.findFirst({
          where: {
            code: 'GOV-REG-02',
            libraryVersion: OBLIGATION_LIBRARY_VERSION,
            deletedAt: null,
          },
          select: { id: true, confidentiality: true },
        });
        if (canonicalUpdate === null) {
          throw new SeedRefusedError(
            `the canonical GOV-REG-02 obligation at ${OBLIGATION_LIBRARY_VERSION} is not seeded — refusing ` +
              'to raise an update duty against a placeholder.',
          );
        }
        const certificateUpdates = deriveCertificateUpdateDeadlines(fixture, {
          workweekSetting: globalSettingValue('calendar.workweek'),
          holidays: SEED_HOLIDAYS,
          updateWindowSetting: globalSettingValue('deadline.UPDATE_15BD.businessDays'),
          leadSetting: globalSettingValue('deadline.UPDATE_15BD.certificateExpiryLeadBd'),
          canonicalUpdateObligation: {
            id: canonicalUpdate.id,
            confidentiality: String(canonicalUpdate.confidentiality),
          },
        });
        anchorReport = [...anchorReport, ...certificateUpdates.report];
        for (const { id, data } of certificateUpdates.tasks) {
          await step('ComplianceTask', () =>
            db.complianceTask.upsert({
              where: { id },
              create: { id, ...data } as never,
              update: data as never,
            }),
          );
        }
        for (const { id, data } of certificateUpdates.deadlines) {
          await step('Deadline', () =>
            db.deadline.upsert({
              where: { id },
              create: { id, ...data, windowSnapshot: jsonValue(data.windowSnapshot) },
              update: { ...data, windowSnapshot: jsonValue(data.windowSnapshot) },
            }),
          );
        }

        // ── 17. Government filing statuses ───────────────────────────────────────────────────
        for (const filing of fixture.governmentFilingStatus) {
          const { id, data } = mapGovernmentFiling(filing);
          await step('GovernmentFiling', () =>
            db.governmentFiling.upsert({ where: { id }, create: { id, ...data }, update: data }),
          );
        }

        // ── 18. Access grants → 19. memberships ──────────────────────────────────────────────
        //
        // ⚠ THE ONE STEP THAT RUNS WITH A GUARD OFF, AND WHY IT HAS TO. Since migration
        // `00000000000009_e2_close_system_marker`, a `waqf_access_grant` row is admitted only when
        // the audit event admitting it names an actor who ALREADY holds `admin:access_matrix:write`
        // on that endowment. The seed cannot satisfy that and no seed could:
        //
        //   · every seed write is attributed to ONE actor, `user-seed-admin`, so only that actor
        //     could be the issuer (migration 5 §2b binds `grantedByUserId` to the marker's actor);
        //   · `CHECK waqf_access_grant_no_self_issue` is `grantedByUserId <> userId`, so an admin
        //     seat FOR `user-seed-admin` ISSUED BY `user-seed-admin` is unrepresentable;
        //   · therefore the FIRST admin seat on a fresh database has no admissible issuer. Authority
        //     cannot authorise its own first instance.
        //
        // Until migration 9 this step was admitted because the seed runs on a SYSTEM context and the
        // trigger short-circuited on `actorType = 'SYSTEM'`. That branch was worthless as a control —
        // a caller who writes the marker row chooses `actorType`, and a FINANCE seat used exactly
        // that to mint itself an ACTIVE NAZIR seat and approve another maker's SAR 4.5m bank
        // movement. So provisioning is now explicit about needing a privilege (table OWNERSHIP)
        // instead of hiding behind a claim anybody can make.
        //
        // WHAT IS *NOT* SUSPENDED: the audit spine. All 21 grants still emit their `audit_event`, so
        // they land in the append-only hash chain with their event ids — which is what makes
        // `user-admin-001`'s seeded admin seat "established" and able to issue further grants through
        // the ordinary `activateGrant()` path afterwards. `seed.integration.test.ts` asserts both.
        await withAccessMatrixBootstrap(auditTx.rawTx, async () => {
          for (const grant of deriveAccessGrants(waqfIds, SEED_EPOCH)) {
            const { id, data } = grant;
            // Prisma's scalar-list inputs are mutable `string[]`; the mapper models them as
            // `readonly string[]` so a caller cannot mutate a derived grant in place. Copy at
            // the boundary rather than widening the mapper's type.
            const payload = {
              ...data,
              permissions: [...data.permissions],
              dataScopes: [...data.dataScopes],
              scopeRefs: [...data.scopeRefs],
            };
            await step('WaqfAccessGrant', () =>
              db.waqfAccessGrant.upsert({
                where: { id },
                create: { id, ...payload },
                update: payload,
              }),
            );
          }
        });

        for (const fixtureClient of fixture.clients) {
          for (const membership of deriveMemberships(fixtureClient.id)) {
            const { id, data } = membership;
            await step('Membership', () =>
              db.membership.upsert({ where: { id }, create: { id, ...data }, update: data }),
            );
          }
        }

        // ── 20. Maker-checker records for already-executed runs (E2) ─────────────────────────
        //
        // ⚠ APPEND-ONLY, AND IT MUST STAY LAST-ISH. This step is deliberately AFTER step 18: the
        // `approval_request_authority` trigger requires the recorded `checkerId` to hold an ACTIVE
        // `NAZIR` `waqf_access_grant` on the SAME endowment, so the grants have to exist first. It is
        // also appended at the END rather than inserted next to the distributions, because every
        // audit event's `occurredAt` is `SEED_EPOCH + <insertion ordinal>` — inserting a step in the
        // middle would renumber every later ordinal and rewrite the frozen audit hash chain.
        //
        // WHY IT EXISTS AT ALL: E2's `distribution_approved_requires_approval_request` CHECK makes an
        // EXECUTED run with no recorded authority unrepresentable. See `deriveRunApprovals` for what
        // this row does and does not claim.
        const runApprovals = deriveRunApprovals(
          fixture.distributions.map((d) => mapDistribution(d, fixture).distribution),
          approvalFingerprint,
        );
        for (const approval of runApprovals) {
          const { id, data } = approval;
          const payload = { ...data, payload: jsonValue(data.payload) };
          await step('ApprovalRequest', () =>
            db.approvalRequest.upsert({
              where: { id },
              create: { id, ...payload },
              update: payload,
            }),
          );
        }

        // ── 21. KSA business-day calendar (E2, EXIT-2) ────────────────────────────────────────
        //
        // `HolidayCalendar` had ZERO ROWS before E2, which made §17's exit clause "crosses … a
        // SEEDED Hijri holiday" unsatisfiable and left every business-day computation running over an
        // empty holiday set. Every row carries the ⚠ unverified marker in BOTH names — see
        // `src/seed/holidays.ts` for why the marker lives in the name column and what is still open
        // about the list itself.
        //
        // The model is NOT in `UNAUDITED_MODELS`, so each row appends an audit event. Appended last
        // for the ordinal reason above.
        for (const holiday of SEED_HOLIDAYS) {
          const data = {
            date: holiday.date,
            dateHijri: holiday.dateHijri,
            nameAr: holiday.nameAr,
            nameEn: holiday.nameEn,
            isWorkingDay: holiday.isWorkingDay,
          };
          await step('HolidayCalendar', () =>
            db.holidayCalendar.upsert({
              where: { id: holiday.id },
              create: { id: holiday.id, ...data },
              update: data,
            }),
          );
        }

        // ── 22. مآل الوقف — the ultimate takers each deed NAMES (E3/S4) ───────────────────────
        //
        // ⚠ THIS STEP WRITES ZERO ROWS AGAINST TODAY'S FIXTURE, AND THAT IS THE HONEST OUTCOME.
        // Every endowment in `sample-waqf.json` records `reversion: null` — the deed was read and
        // names no ultimate taker. Seeding a live reversion would require authoring a ذري deed that
        // names a charity, which is exactly the configuration open defect R7-D1 (HIGH) concerns:
        // the extinction trigger currently reads an unenumerated `CATEGORY_ONLY` placeholder's
        // `active: false` as a family's death and pays the charity the whole distributable. Inventing
        // that shape to give a new table a row is not a decision a seed is entitled to take, so the
        // reversion path's only fixtures stay in `packages/domain`'s worked examples (J / J′).
        // REPORTED as owed, deliberately empty rather than silently absent.
        //
        // ⚠ SINCE MIGRATION 13 THE INSERT PATH IS ALSO GUARDED, so "zero rows" is now the only
        // outcome this fixture COULD have. `waqf_reversion_taker_insert_integrity` refuses a taker
        // whose parent waqf has `reversionClauseCaptured = false` (waqf-005) or `reversionKind IS
        // NULL` (waqf-001…004) — measured before it existed, both shapes were ACCEPTED as
        // `qmulate_app`, including one naming ben-002, a LIVING FAMILY DESCENDANT (V-E3-M2).
        //
        // Appended LAST for the ordinal reason above, and it must in any case follow step 10: the
        // composite foreign key `(waqfId, beneficiaryId) -> beneficiary(waqfId, id)` means a taker
        // cannot be recorded before the beneficiary it names exists.
        for (const taker of deriveReversionTakers(fixture)) {
          const { id, data } = taker;
          await step('WaqfReversionTaker', () =>
            db.waqfReversionTaker.upsert({
              where: { id },
              // NO `update` PAYLOAD: `waqf_reversion_taker_no_mutate` refuses every UPDATE with
              // SQLSTATE 42501, because a row here names where the endowment goes once the bloodline
              // is over. An empty update makes the upsert converge on existence only, which is the
              // only idempotency this table permits.
              create: { id, ...data },
              update: {},
            }),
          );
        }
      },
      // A seed is a long transaction by nature; a request is not. Raised from the 120 s default
      // so a cold CI database cannot fail the run on timing alone.
      { timeout: 300_000, maxWait: 30_000 },
    );

    report(counts, fixture, auditOrdinal, anchorReport);
  } finally {
    await base.$disconnect();
  }
}

/**
 * The withheld half of the canonical library, said out loud.
 *
 * ⚠ A LIBRARY THAT SHRINKS QUIETLY IS A REGISTER MISSING A DUTY QUIETLY. `compliance_obligation.titleAr`
 * is NOT NULL and one §09 template has no Arabic anywhere in QMULATE's framework to put in it, so the
 * seed writes 36 of 37 — and prints WHICH one and WHY, rather than letting a count nobody reconciles
 * be the only trace. Empty output here means the whole library was stored, which is the state this
 * should eventually reach.
 */
function canonicalLibraryNote(): readonly string[] {
  const withheld = templatesWithheldFromRegister();
  if (withheld.length === 0) return [];
  return [
    `  • ⚠ ${String(withheld.length)} CANONICAL TEMPLATE(S) WERE NOT STORED, and this is a measurement, not a`,
    '    transcription failure: `compliance_obligation.titleAr` is NOT NULL and these rows have no',
    '    Arabic in `docs/domain/unified-framework.md` to carry. Composing one would be inventing the',
    '    wording of a regulatory obligation. The gap is in the FRAMEWORK, not in the catalogue.',
    ...withheld.map((entry) => `      – ${entry.code}`),
  ];
}

/** Say what was done, in a form a human can eyeball against the E1 exit counts. */
function report(
  counts: Record<string, number>,
  fixture: Fixture,
  auditedWrites: number,
  anchorReport: readonly string[],
): void {
  const order = [
    'Setting',
    'User',
    'Account',
    'Client',
    'Waqif',
    'Waqf',
    'TrusteeshipDeed',
    'BankAccount',
    'Asset',
    'Expropriation',
    'Beneficiary',
    'Transaction',
    'NazirFee',
    'Distribution',
    'DistributionLineItem',
    'ComplianceObligation',
    'ComplianceTask',
    // ⊕ S11-1 — the computed REGISTER_30BD row(s) for recorded, computable anchors. Listed so the
    // count is MEASURED from this report (`Deadline 1`), and so a zero here would be visible.
    'Deadline',
    'GovernmentFiling',
    'WaqfAccessGrant',
    'Membership',
    'ApprovalRequest',
    'HolidayCalendar',
    // Zero rows against today's fixture, and listed anyway: a step that reports nothing is
    // indistinguishable from a step that was never written. See step 22.
    'WaqfReversionTaker',
  ];
  const width = Math.max(...order.map((model) => model.length));
  const lines = order.map(
    (model) => `  ${model.padEnd(width)}  ${String(counts[model] ?? 0).padStart(4)}`,
  );
  const shartCount = fixture.waqfs.length;

  process.stdout.write(
    [
      'Seeded (upsert — safe to re-run):',
      ...lines,
      '',
      `  audited writes        ${String(auditedWrites).padStart(4)}   (one audit_event per write)`,
      `  unaudited writes      ${String(counts.Account ?? 0).padStart(4)}   (Account — hashed credentials`,
      '                             must never enter a 10-year retention table; see UNAUDITED_MODELS)',
      `  seed epoch            ${SEED_EPOCH.toISOString()}  (${toHijri(SEED_EPOCH)} AH)`,
      `  admin login           ${SEED_ADMIN_EMAIL} / ${SEED_PASSWORD}`,
      '                        (fixture-only credential — TOTP enrolment is required on first sign-in)',
      '',
      'Notes:',
      `  • ${shartCount} Shart al-Waqif records written WRITE-ONCE; a re-run never rewrites them.`,
      // ⊕ S11-1 — every recorded clock-start, by name, computable or not.
      ...anchorReport.map((line) => `  • ⊕ ${line}`),
      '  • waqf-005 is the INTAKE-STATE endowment (D-C): reversionClauseCaptured = false — nobody',
      '    has read its مآل clause. That is NOT the same as waqf-001…004 and waqf-007, whose clause',
      '    was read and records no ultimate taker. A distribution run input cannot be built from',
      '    waqf-005 at all.',
      '  • waqf-007 is the COMPUTING LINEAGE SIBLING (M1-b): the second LINEAGE_CONTINUATION deed,',
      '    recorded COMPLETE (zuhur_only; مآل read 2025-04-20, no taker; deed 10% ṣiyāna / 10% ʿushr),',
      '    with the four-member tree ben-701…704 — so a wired run over the DEFAULT deed shape can',
      '    COMPUTE. waqf-005 stays halting on purpose; its intake state is a load-bearing subject.',
      '  • DEED ACCESS (D-E): READ is granted to the nazir seats, to user-case-manager-001, and —',
      '    since 2026-08-18 — to user-beneficiary-ben-001, ON WAQF-001 ONLY.',
      '    ⊕ DEED **WRITE** IS NO LONGER A FALLBACK — the owner RULED on 2026-08-17 (memo Q10):',
      '    "the trusteeship deed can only be editted by a court judge." So the nazir seat RECORDS an',
      '    appointment once and NO seat may edit a recorded one: `trusteeship_deed_no_update`',
      '    (migration 17) refuses every UPDATE, for every seat, and a court-ordered change is a NEW',
      '    superseding record carrying the court instrument. ⚠ THAT LAST STEP IS ENGINEERING’S',
      '    RENDERING of his sentence (it turns "edit" into "supersede") and is flagged for his',
      '    confirmation — and the schema cannot express it yet: `waqfId` is unique and there is no',
      '    supersession link, so a court-ordered change is currently UNRECORDABLE. Owed to E4.',
      '    ⊕ THE THIRD HOLDER HE NAMED IS NOW GRANTED — RULED, NOT ASSUMED. This line used to read',
      '    "an eligible beneficiary is NOT granted: ROLE_PRESETS.beneficiary carries no endowment:*',
      '    verb and grant ∩ preset would drop it. Owed there." True, and the blocker was a DECISION:',
      '    "eligible" is a computed, frontier-varying fact no row may carry. The owner answered',
      '    Q-E4-1 with option (a) on 2026-08-18 — EVERY beneficiary principal of a waqf may read',
      "    THAT waqf's deed, including one held behind a living ancestor or excluded under a line",
      '    the deed does not continue (the deed is what tells them why). The preset gained',
      '    endowment:deed:read; this seat is seated on waqf-001 alone, so every other deed answers',
      '    NOT_FOUND. ⚠ BR-702 (the document access matrix) is NOT satisfied by this: it is the',
      '    TrusteeshipDeed RECORD, not the vault FILE. E9 owes that row.',
      `  • COMPLIANCE OBLIGATIONS are ${String(counts.ComplianceObligation ?? 0)} rows from TWO libraries, and`,
      '    they are distinguishable from the row itself. The ten `SEED-`-namespaced PLACEHOLDERS carry',
      "    libraryVersion 'fixture-derived' — derived backwards from fixture task instances, one per",
      `    task. The CANONICAL §09 library carries '${OBLIGATION_LIBRARY_VERSION}' and lands ALONGSIDE them,`,
      '    never as an edit (S8-Q5; migration 31 refuses the edit outright).',
      ...canonicalLibraryNote(),
      '  • ONE obligation is AML_RESTRICTED — GOV-AML-02, the duty to report suspicion to the FIU',
      '    (owner ruling S8-Q1, 2026-08-23: "compartment the row"). It is invisible outside the AML',
      '    compartment, INCLUDING on this register. Every other obligation is NORMAL.',
      '  • RESERVED MATTERS are reachable from the nazir seats (legal:reserved_matter:*). ⚠ NOT from',
      '    counsel — asked directly, the owner answered "no" (D-D); there is no counsel seat here.',
      '  • Every regulatory figure lives in `setting`, each carrying "⚠ unverified — confirm vs',
      '    primary law". None is hard-coded anywhere.',
      '  • dist-001 is seeded as a HISTORICAL record; its own numbers are internally inconsistent',
      '    and the discrepancy is recorded in `computationTrace` rather than repaired.',
      '',
    ].join('\n') + '\n',
  );
}

main().catch((error: unknown) => {
  // A refusal must be the FIRST thing on stderr and must not be dressed in a stack trace:
  // assertion B3 matches /^SEED_REFUSED/ against the whole stream, with no `m` flag.
  //
  // `process.exitCode` rather than `process.exit()`: an explicit exit can truncate a pending
  // stderr write to a pipe, which is exactly how a CI assertion on stderr text turns flaky. By
  // the time we get here nothing holds the loop open — a refusal happens before the database
  // modules are even imported, and any later failure has already run `base.$disconnect()`.
  if (error instanceof SeedRefusedError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
