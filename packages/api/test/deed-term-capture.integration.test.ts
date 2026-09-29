/**
 * AV3-01 — **THE `reversion: null` BRANCH OF `endowment.recordDeedTerms` HAD NO TEST, AND WAS BROKEN.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT, AS MEASURED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `recordDeedTerms` has two arms. `reversion: {…}` records "the deed names THIS ultimate taker";
 * `reversion: null` records the OTHER positive statement — *"this deed names no مآل الوقف"* (R7-c),
 * which is the state **four of the five seeded endowments are in**. The date pair
 * (`reversionRecordedAt` + `reversionRecordedAtHijri`) used to be written INSIDE the
 * `reversion !== null` arm, so the `null` arm emitted:
 *
 *     reversionClauseCaptured: true,  reversionRecordedAt: NULL,  reversionRecordedAtHijri: NULL
 *
 * — which is precisely the half-write migration 14's tier 3a refuses with SQLSTATE **42501**. The
 * guard added to protect the مآل clause therefore broke its only production caller, and **no test
 * reached the branch**: `endowment-record.integration.test.ts`'s AC-E3-10 does call it with
 * `reversion: null`, but on `waqf-001`, whose clause is already captured — so the call dies at the
 * write-once pre-check (step b), several steps before the `data:` object is ever built.
 *
 * The orchestrator moved the date pair OUT of the conditional. **This file is the test that was
 * missing**, and it drives the real procedure through `appRouter.createCaller` against a real
 * migrated + seeded database: real maker-checker, the real TOTP step-up, the real `payloadHash`
 * binding, `auditedWrite`, and the trigger.
 *
 * ⚠ MUTATION-VERIFIED (S4, round 4). Putting the pair back inside the arm —
 *
 *     ...(input.reversion !== null
 *           ? { reversionKind: …, reversionRecordedAt: recordedAt,
 *               reversionRecordedAtHijri: recordedAtHijri }
 *           : {}),
 *
 * — turns this file **RED at 3 failed / 1 passed (4)** on a freshly seeded database, with the
 * database's own words underneath the first failure:
 *
 *   PostgresError 42501 · waqf waqf-005: recording that the مآل clause has been READ
 *   (`reversionClauseCaptured` false -> true) must supply `reversionRecordedAt` AND
 *   `reversionRecordedAtHijri` IN THE SAME STATEMENT — got NULL / NULL.
 *
 * The one test that still passes under the mutation is the PREMISE (waqf-005 is in the intake
 * state), which is exactly right: the premise is about the fixture, not about the code. The
 * write-once test fails as a CONSEQUENCE — the failed call left its approval PENDING, so the re-mint
 * refuses `APPROVAL_STALE / ALREADY_OPEN`, which is the ratchet described below behaving as
 * documented. The source pin fails on its own terms, naming the two lines that moved.
 *
 * MEASURED GREEN, same command, on the fix as it stands: **4 passed (4)**.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THIS FILE SPENDS A WRITE-ONCE RESOURCE — AND SINCE AV4-B2 IT SPENDS ONE **IT OWNS**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Recording a deed term is IRREVERSIBLE: `qmulate_shart_guard()` tier 3 seals the whole مآل group
 * the instant the clause is captured, nothing in the product can unseal it (that seal is V-E3-01's
 * fix), and `db:seed` upserts rather than repairs. So the subject of the capture is a resource that
 * exists exactly once per database, and WHICH ROW IT IS decides whether this suite is repeatable.
 *
 * ── WHAT THIS FILE USED TO DO, AND WHAT IT COST (AV4-B2) ────────────────────────────────────
 * It captured `waqf-005` — the ONE seeded intake endowment (owner answer D-C). That made the whole
 * `pnpm test:integration` graph green EXACTLY ONCE PER DATABASE. MEASURED on one pristine cluster
 * (provision -> migrate:deploy -> seed), before this change:
 *
 *     run 1   Tasks: 3 successful, 3 total            (green)
 *     run 2   Tasks: 1 successful, 2 total            (RED)
 *     run 3   Tasks: 1 successful, 2 total            (RED)
 *
 * and the red was in `@qmulate/database` — 19 failures across `e3-deed-term-guards.integration.
 * test.ts` and `seed.integration.test.ts`, a suite that had done nothing wrong, reporting
 * *"a deed recording NO مآل was rewritten into a charitable reversion"*. That sentence is the
 * V-E3-01 HIGH verbatim. A stale fixture was wearing a founder's-condition breach's clothes.
 *
 * ── WHAT IT DOES NOW ────────────────────────────────────────────────────────────────────────
 *   · it CREATES ITS OWN intake endowment ({@link OWNED_INTAKE_WAQF}) in `beforeAll` and removes it
 *     again in `afterAll` — see `provisionIntakeEndowment` and rule 5 in `test/setup.ts`;
 *   · `waqf-005` is READ and never written. The last test in this file asserts it is still UNSPENT
 *     after the capture above has run, which is the AV4-B2 regression pin: if some future edit
 *     points the capture back at the fixture, THIS file goes red, in this package, naming the
 *     reason — instead of `@qmulate/database` going red one run later for a reason it cannot see;
 *   · the pre-state of the owned endowment is still ASSERTED, never assumed. `provisionIntakeEndowment`
 *     purges the id before inserting, so a process killed mid-run cannot poison the next one either.
 *
 * ⚠ AND THE APPROVAL SLOT IS A ONE-WAY RATCHET TOO. `approval_request_one_open_per_subject` allows
 * ONE open request per `waqf:<id>:deedTerms` (`OPEN_STATUSES = ['PENDING','APPROVED']`), the api
 * exposes no reject/void procedure, and a refusal inside `recordDeedTerms` leaves its approval
 * PENDING **forever**. A SUCCESSFUL call ends `EXECUTED` and frees the slot; a failed one closes it.
 * So the tests below are ordered success-first by necessity, not by taste, and exactly one call can
 * ever reach step (d) on this endowment. See the block comment on the last test. That ratchet is now
 * scoped to a row this file destroys at the end, which is the second half of the AV4-B2 fix: the
 * PENDING approval goes away with its endowment rather than foreclosing the next run.
 */

import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toHijriSnapshot } from '@qmulate/domain/dates';

import {
  API_TEST_PREFIX,
  API_TEST_WAQF_PREFIX,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  countAuditEvents,
  hasDatabase,
  provisionIntakeEndowment,
  provisionTestSubjects,
  warnNoDatabase,
  recordReservedMatterChain,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { deedTermArtifact, deedTermSubjectId } from '../src/routers/endowment.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('AV3-01 (the reversion:null arm of endowment.recordDeedTerms)');

const createCaller = createCallerFactory(appRouter);

/** Reads a file under `packages/api/`, refusing an empty read (which would pass over nothing). */
function readSource(relative: string): string {
  const text = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
  if (text.trim() === '') throw new Error(`${relative} read as empty — fix the reader`);
  return text;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Subjects
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ THE INTAKE ENDOWMENT THIS FILE OWNS, CREATES AND DESTROYS — the AV4-B2 fix.
 *
 * `reversionClauseCaptured = false`, `reversionKind` NULL, both reversion dates NULL: the one state
 * on which the capture path can run at all. `continuationStipulation` is recorded AT INSERT as
 * `ZUHUR_AND_BUTUN`, which reproduces the seeded intake endowment's shape exactly and is why the
 * call below OMITS that field rather than passing it.
 *
 * The id is under {@link API_TEST_WAQF_PREFIX} and deliberately does NOT match the fixture grammar
 * `^waqf-[0-9]+$`, so it can never be mistaken for — or counted as — a seeded endowment.
 */
const OWNED_INTAKE_WAQF = `${API_TEST_WAQF_PREFIX}9001`;

/**
 * THE SEEDED INTAKE ENDOWMENT (owner answer D-C). **READ HERE, NEVER WRITTEN.**
 *
 * It is the fixture's one demonstration of "nobody has read this deed's مآل clause", it is what
 * `@qmulate/database`'s `seed.integration.test.ts` and `e3-deed-term-guards.integration.test.ts`
 * both depend on, and spending it is what made this whole graph green exactly once per database.
 * The last test in this file asserts it survived.
 */
const SEEDED_INTAKE_WAQF = 'waqf-005';

/** The MAKER. A CASE_MANAGER holds `approval:request:initiate` and no approval/sign verb. */
const MAKER = `${API_TEST_PREFIX}av301-maker`;
/** The CHECKER/SIGNER. `endowment:deed:sign` sits only in the `nazir` preset. */
const SIGNER = `${API_TEST_PREFIX}av301-nazir`;

/** The waqf columns this file asserts on, read on the base client so no projection can soften them. */
interface DeedTermRow {
  readonly continuationStipulation: string | null;
  readonly reversionClauseCaptured: boolean;
  readonly reversionKind: string | null;
  readonly reversionRecordedAt: Date | null;
  readonly reversionRecordedAtHijri: string | null;
}

async function readDeedTerms(waqfId: string): Promise<DeedTermRow> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<DeedTermRow[]>(
    `SELECT "continuationStipulation"::text  AS "continuationStipulation",
            "reversionClauseCaptured",
            "reversionKind"::text            AS "reversionKind",
            "reversionRecordedAt",
            "reversionRecordedAtHijri"
       FROM "waqf" WHERE "id" = $1`,
    waqfId,
  );
  const row = rows[0];
  if (row === undefined) {
    // Two different causes, and the message must not guess between them: a missing FIXTURE id means
    // the database is unseeded, while a missing TEST id means `provisionIntakeEndowment` did not run
    // or its self-healing purge removed a row it then failed to re-insert.
    throw new Error(
      waqfId.startsWith(API_TEST_WAQF_PREFIX)
        ? `${waqfId} does not exist — provisionIntakeEndowment did not create this file's own ` +
            `intake endowment, so nothing below is asserting anything.`
        : `${waqfId} does not exist — the fixture is not seeded`,
    );
  }
  return row;
}

describe.skipIf(!hasDatabase)('AV3-01 · recordDeedTerms records "this deed names no مآل"', () => {
  beforeAll(async () => {
    await assertSeeded();
    // ⚠ THE ENDOWMENT FIRST, THE SEATS SECOND — a `WaqfAccessGrant` carries an FK to `waqf`, so the
    // order is structural, not stylistic. `provisionIntakeEndowment` purges the id (its grants, its
    // approvals, then the row) before inserting, so a run killed between here and `afterAll` cannot
    // leave a CAPTURED subject behind for the next one. That self-healing purge is the difference
    // between "tidy" and "idempotent".
    await provisionIntakeEndowment({
      id: OWNED_INTAKE_WAQF,
      // The same waqif `waqf-005` sits under, so the constructed endowment is a plausible sibling of
      // the seeded intake record rather than an orphan hanging off nothing.
      waqifId: 'waqif-002',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
      entitlementOrder: 'LINEAGE_CONTINUATION',
    });
    await provisionTestSubjects([
      {
        id: MAKER,
        role: 'CASE_MANAGER',
        waqfIds: [OWNED_INTAKE_WAQF],
        permissions: [
          'endowment:waqf:read',
          'endowment:deed:read',
          'beneficiary:beneficiary:read',
          'legal:reserved_matter:read',
          'approval:request:read',
          'approval:request:initiate',
        ],
      },
      {
        id: SIGNER,
        role: 'NAZIR',
        waqfIds: [OWNED_INTAKE_WAQF],
        permissions: [
          'endowment:waqf:read',
          'endowment:waqf:write',
          'endowment:deed:read',
          'endowment:deed:write',
          'endowment:deed:sign',
          'beneficiary:beneficiary:read',
          'legal:reserved_matter:read',
          'legal:reserved_matter:write',
          'legal:reserved_matter:approve',
          'approval:request:read',
          'approval:request:approve',
        ],
      },
    ]);
  }, 300_000);

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE PREMISE — asserted, because everything below is meaningless without it
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('the OWNED endowment is in the INTAKE state, which is what makes this branch reachable', async () => {
    const before = await readDeedTerms(OWNED_INTAKE_WAQF);
    expect(
      before.reversionClauseCaptured,
      `${OWNED_INTAKE_WAQF}.reversionClauseCaptured is ALREADY true, so the capture path this file exists ` +
        `for cannot run and every assertion below would prove nothing. Recording a deed term is ` +
        `WRITE-ONCE and IRREVERSIBLE (qmulate_shart_guard tier 3). ⚠ THIS ROW IS PROVISIONED BY ` +
        `THIS FILE'S OWN beforeAll AND PURGED FIRST, so "a previous run spent it" is no longer a ` +
        `possible explanation — either provisionIntakeEndowment did not run, or its purge is no ` +
        `longer removing the row (check that waqf_no_delete was suspended and re-enabled).`,
    ).toBe(false);
    expect(before.reversionKind).toBeNull();
    expect(before.reversionRecordedAt).toBeNull();
    expect(before.reversionRecordedAtHijri).toBeNull();
    // ⚠ ITS CONTINUATION TERM IS ALREADY RECORDED, and that is why the call below OMITS
    // `continuationStipulation` rather than passing it: supplying an already-recorded term trips the
    // write-once pre-check (step b) and the run would never reach the arm under test.
    expect(before.continuationStipulation).toBe('ZUHUR_AND_BUTUN');
  });

  it('the SEEDED intake endowment is unspent when this file starts — the other half of the premise', async () => {
    // Read, not written. If this is already `true` on a database that was just seeded, something
    // ELSE in the graph is spending the fixture's one demonstration of the intake state, and the
    // AV4-B2 class of defect has simply moved again rather than being fixed.
    const seeded = await readDeedTerms(SEEDED_INTAKE_WAQF);
    expect(
      seeded.reversionClauseCaptured,
      `${SEEDED_INTAKE_WAQF}.reversionClauseCaptured is ALREADY true at the START of this file. ` +
        `The seeded intake endowment (owner decision D-C) is the fixture's only example of "nobody ` +
        `has read this deed's مآل clause", and @qmulate/database's seed.integration and ` +
        `e3-deed-term-guards suites both depend on it. Nothing may spend it — and a spent one ` +
        `cannot be repaired by db:seed, because the seal is the product working (V-E3-01's fix). ` +
        `Re-seed onto a pristine database, then find what wrote it.`,
    ).toBe(false);
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE AV3-01 PROOF
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('records "this deed names NO ultimate taker": captured=true, kind NULL, dates NON-NULL', async () => {
    // ── (1) THE MAKER RAISES THE REQUEST ────────────────────────────────────────────────────
    // The payload is built by `deedTermArtifact` — the SAME function the procedure re-derives at
    // step (c) and compares against the stored request.
    const artifact = deedTermArtifact({
      waqfId: OWNED_INTAKE_WAQF,
      continuationStipulation: null,
      reversion: null,
    });
    const makerCaller = createCaller(await contextFor({ userId: MAKER, requestId: 'av301-mint' }));
    const minted = await makerCaller.approval.initiate({
      waqfId: OWNED_INTAKE_WAQF,
      type: 'RESERVED_MATTER',
      reservedMatterKind: 'DEED_TERM_RECORD',
      subjectId: deedTermSubjectId(OWNED_INTAKE_WAQF),
      // ⚠ THE ARTIFACT ITSELF, NOT A COPY OF IT. `mintApprovalRequest` runs `serializeForAudit` on
      // whatever it is handed, and every value here is already a string, a boolean or `null`, so the
      // stored `jsonb` is byte-identical to what step (c) re-derives. Hand-writing an equivalent
      // literal would be a SECOND canonicalisation, which is the shape of this area's bug — the
      // approver signs one encoding and the executor verifies another.
      payload: artifact,
    });
    expect(minted.status).toBe('PENDING');

    const auditBefore = await countAuditEvents({
      action: 'APPROVE',
      category: 'APPROVAL',
      entityId: OWNED_INTAKE_WAQF,
    });

    // ── (2) THE NAZIR SIGNS IT — the whole rung-3c chain, not a stub ────────────────────────
    const signerCaller = createCaller(
      await contextFor({ userId: SIGNER, requestId: 'av301-sign' }),
    );
    // ⊕ S12-2: DEED_TERM_RECORD is a kinded reserved matter — its BR-1102 chain precedes the sign.
    await recordReservedMatterChain(signerCaller, {
      waqfId: OWNED_INTAKE_WAQF,
      approvalRequestId: minted.approvalRequestId,
    });
    const result = await signerCaller.endowment.recordDeedTerms({
      waqfId: OWNED_INTAKE_WAQF,
      approvalRequestId: minted.approvalRequestId,
      // ⚠ `continuationStipulation` OMITTED — see the premise test.
      reversion: null,
      reversionClauseCaptured: true,
    });

    // ── (3) IT SUCCEEDED, AND SAID SO IN THE SHAPE R7-c SEPARATES ───────────────────────────
    // `captured: true` with `kind: null` is the positive statement "the deed records no ultimate
    // taker" — NOT "nobody has looked", which is what this row said a moment ago.
    expect(result.waqfId).toBe(OWNED_INTAKE_WAQF);
    expect(result.reversion.captured).toBe(true);
    expect(result.reversion.kind).toBeNull();
    expect(result.reversion.ultimateTakerIds).toEqual([]);
    expect(result.writeOnce).toBe(true);

    // ── (4) THE ROW. THIS IS THE ASSERTION AV3-01 IS ABOUT ──────────────────────────────────
    // Read on the base client rather than through `endowment.get`: a projection that mapped an
    // absent date to `null` would hide exactly the half-write under test.
    const after = await readDeedTerms(OWNED_INTAKE_WAQF);
    expect(after.reversionClauseCaptured).toBe(true);
    expect(after.reversionKind, 'the deed names none, so the KIND stays NULL').toBeNull();
    expect(
      after.reversionRecordedAt,
      `reversionRecordedAt is NULL beside reversionClauseCaptured = true. That is the AV3-01 ` +
        `half-write: the date pair belongs to the CAPTURE ("I read the clause on this date"), not ` +
        `to the kind, and migration 14's tier 3a refuses the row without it.`,
    ).not.toBeNull();
    expect(after.reversionRecordedAtHijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The pair is a PAIR: the frozen Umm-al-Qura twin of the instant that was stored, taken through
    // the single Hijri implementation (ADR-0007) — not a plausible-looking constant.
    expect(after.reversionRecordedAtHijri).toBe(
      String(toHijriSnapshot(after.reversionRecordedAt as Date)),
    );
    // Untouched: the arm writes the مآل group and nothing else.
    expect(after.continuationStipulation).toBe('ZUHUR_AND_BUTUN');

    // ── (5) THE TRAIL PROVES THE AUTHORITY, and exactly ONE event was appended ──────────────
    expect(
      await countAuditEvents({
        action: 'APPROVE',
        category: 'APPROVAL',
        entityId: OWNED_INTAKE_WAQF,
      }),
    ).toBe(auditBefore + 1);
  }, 120_000);

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * AND IT IS STILL WRITE-ONCE AFTERWARDS — the fix widened the WRITE, not the door
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('a SECOND recording on the now-captured endowment is refused DEED_TERM_WRITE_ONCE', async () => {
    // ⚠ A REAL, FRESHLY MINTED APPROVAL — not a made-up id. `resolveApprover` runs in the rung-3c
    // MIDDLEWARE, before the procedure body, so a bogus id would be refused for the wrong reason and
    // this test would pass without ever reaching the write-once pre-check.
    //
    // Minting is possible again precisely because the recording above SUCCEEDED: its approval ended
    // `EXECUTED`, and `OPEN_STATUSES` is `['PENDING','APPROVED']`, so the one-open-per-subject slot
    // is free. Had the previous call FAILED inside the body, its request would still be PENDING and
    // this mint would refuse `ALREADY_OPEN` — which is why the arms below cannot be probed first.
    const reversion = {
      kind: 'CHARITABLE_ULTIMATE_TAKER' as const,
      ultimateTakerIds: ['ben-006'],
    };
    const makerCaller = createCaller(
      await contextFor({ userId: MAKER, requestId: 'av301-remint' }),
    );
    const minted = await makerCaller.approval.initiate({
      waqfId: OWNED_INTAKE_WAQF,
      type: 'RESERVED_MATTER',
      reservedMatterKind: 'DEED_TERM_RECORD',
      subjectId: deedTermSubjectId(OWNED_INTAKE_WAQF),
      payload: deedTermArtifact({
        waqfId: OWNED_INTAKE_WAQF,
        continuationStipulation: null,
        reversion: {
          kind: reversion.kind,
          ultimateTakerIds: [...reversion.ultimateTakerIds],
        },
      }),
    });

    const signerCaller = createCaller(
      await contextFor({ userId: SIGNER, requestId: 'av301-second' }),
    );
    // ⊕ S12-2: the chain is recorded so the refusal below is the TIER-3 guard's, not the chain's.
    await recordReservedMatterChain(signerCaller, {
      waqfId: OWNED_INTAKE_WAQF,
      approvalRequestId: minted.approvalRequestId,
    });
    let thrown: unknown;
    try {
      await signerCaller.endowment.recordDeedTerms({
        waqfId: OWNED_INTAKE_WAQF,
        approvalRequestId: minted.approvalRequestId,
        reversion,
        reversionClauseCaptured: true,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown, 'a captured مآل clause was re-recorded').toBeDefined();
    // A CONFLICT, not a BAD_REQUEST: the request is well-formed and the STATE refuses it.
    expect((thrown as { code?: string }).code).toBe('CONFLICT');
    const cause = (thrown as { cause?: { code?: string; message?: string } }).cause;
    expect(cause?.code).toBe('DEED_TERM_WRITE_ONCE');
    // The message must point at the superseding-instrument rule — it is the only place a future
    // engineer learns there is no approval to go and get (Binding rule 1, ADR-0006).
    expect(cause?.message).toMatch(/SUPERSEDING INSTRUMENT/);

    // And nothing moved: the `null` reading recorded above is still the reading.
    const after = await readDeedTerms(OWNED_INTAKE_WAQF);
    expect(after.reversionKind).toBeNull();
    expect(after.reversionRecordedAt).not.toBeNull();
  }, 120_000);

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE OTHER ARM — pinned at the SOURCE, because the fixture cannot reach it
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * ⚠ SURFACED, NOT SOLVED: **the `reversion: {…}` arm has no reachable behavioural test anywhere at
   * the request layer, and the obstacle is the FIXTURE, not this file.** Three facts compose into a
   * dead end, each MEASURED against the seeded rows:
   *
   *   1. the write-once pre-check (step b) refuses on all of `waqf-001…004`, whose clause is already
   *      captured — so the arm's body is reachable only on `waqf-005`;
   *   2. `waqf-005` has **no beneficiaries at all**, and the fixture's ONE `CHARITABLE_JIHA`
   *      (`ben-006`) sits on `waqf-003`. The taker lookup is `{ id: { in: … }, waqfId: ctx.waqfId }`,
   *      so on the one endowment that can reach the arm there is no id that resolves — the happy
   *      path is unreachable, and the two refusals that ARE reachable there
   *      (`…_UNKNOWN`, `…_DUPLICATED`) would each leave their approval PENDING;
   *   3. and the ordering is forced: a refusal leaves its approval PENDING, which closes
   *      `approval_request_one_open_per_subject` for good (no reject/void procedure exists), so a
   *      step-(d) probe run FIRST would make the AV3-01 proof unmintable — while run SECOND it is
   *      already refused at step (b). Exactly one call reaches step (d) on this endowment, ever.
   *
   * So R7's whole point — recording a ذري deed's ultimate taker — is exercised nowhere above the
   * database. Closing it is a FIXTURE decision, not a test-file one, and it is reported rather than
   * worked around here.
   *
   * TODO(surface): should the fixture carry a SECOND intake-state endowment, one with a
   * `CHARITABLE_JIHA` beneficiary, so the R7 ultimate-taker capture path is testable end to end? It
   * moves seeded counts (`Waqf`, `Beneficiary`, `TrusteeshipDeed`, `WaqfAccessGrant`) and it adds a
   * ذري endowment that names a charity — a shape the product owner ruled on only days ago (R7,
   * 2026-08-10), so the fixture would be asserting a fresh position rather than an old one.
   *
   * ── ⚠ WHAT AV4-B2 CHANGED ABOUT THE ABOVE, AND WHAT IT DID NOT (2026-08-16) ────────────────
   * Facts 1 and 3 are now about a row THIS FILE OWNS ({@link OWNED_INTAKE_WAQF}), not about the
   * seeded fixture, so the paragraph above is kept as the record of why the arm went untested and is
   * no longer the whole reason. **Fact 2 still stands and is still the blocker.** A behavioural test
   * of the `reversion: {…}` arm needs a `CHARITABLE_JIHA` beneficiary ON the endowment reaching the
   * arm, and provisioning one from this harness means suspending THREE more production DELETE guards
   * in teardown — `beneficiary_no_delete` (migration 6: the row carries entitlement and the UBO
   * dataset, and its hint names the PDPL conflict explicitly) and `waqf_reversion_taker_no_mutate` +
   * its TRUNCATE sibling (migration 12: removing a recorded مآل clause is not a correction). Three
   * guard suspensions to reach one arm is a change that deserves its own review, not a line inside
   * an idempotency fix — and the fixture question above may make all three unnecessary. Deliberately
   * NOT done here; reported instead.
   *
   * What IS pinned meanwhile is the exact shape of the AV3-01 fix, at the source: the three CAPTURE
   * columns are written unconditionally on BOTH arms, and `reversionKind` is the only conditional
   * member of the group. A source assertion for the same reason
   * `navigation-disclosure.integration.test.ts` carries one — the guarantee is a property of HOW the
   * write is spelled, and the branch that would prove it behaviourally cannot be reached.
   */
  it('writes the CAPTURE columns unconditionally, and only `reversionKind` conditionally', () => {
    const source = readSource('src/routers/endowment.ts');

    // Anchored inside `recordDeedTerms`: `reversionClauseCaptured: true,` also appears in
    // `deedTermArtifact` EARLIER in the file, so a bare `indexOf` would inspect the wrong object.
    const procedure = source.slice(source.indexOf('recordDeedTerms: signerProcedure'));
    expect(procedure.length, 'recordDeedTerms is no longer a signerProcedure').toBeGreaterThan(0);
    const updateAt = procedure.indexOf('const updated = await tx.waqf.update(');
    expect(updateAt, 'the deed-term update is gone from recordDeedTerms').toBeGreaterThan(0);

    // Comments are stripped so the long explanatory block above the columns cannot satisfy — or
    // break — an assertion about the CODE.
    const code = procedure
      .slice(updateAt, updateAt + 2_000)
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('//'));

    const capturedAt = code.indexOf('reversionClauseCaptured: true,');
    expect(
      capturedAt,
      'the deed-term update no longer sets reversionClauseCaptured',
    ).toBeGreaterThan(-1);
    // ADJACENCY IS THE ASSERTION. Anything spliced between these three — a conditional spread above
    // all — is AV3-01 coming back.
    expect(
      [code[capturedAt + 1], code[capturedAt + 2]],
      'the date pair no longer follows the capture flag unconditionally. That is AV3-01: the dates ' +
        'belong to the CAPTURE, not to the kind — the `reversion: null` arm records "I read this ' +
        'deed and it names none", which is as dated an act as naming a taker, and migration 14 ' +
        'refuses the row without them.',
    ).toEqual(['reversionRecordedAt: recordedAt,', 'reversionRecordedAtHijri: recordedAtHijri,']);

    // No conditional spread may carry either date.
    for (const line of code.filter((candidate) => candidate.startsWith('...('))) {
      expect(
        line.includes('reversionRecordedAt'),
        `a conditional spread carries a capture date: ${line}`,
      ).toBe(false);
    }

    // CONDITIONAL, and the only one: a `kind` is a fact only the non-null arm has.
    expect(code[capturedAt + 3]).toBe(
      '...(input.reversion !== null ? { reversionKind: input.reversion.kind } : {}),',
    );
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * AV4-B2 — THE REGRESSION PIN. LAST, BECAUSE IT IS ABOUT WHAT THIS FILE LEFT BEHIND
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  /**
   * ⚠ THIS IS THE ONE ASSERTION THAT MAKES THE WHOLE GRAPH REPEATABLE, AND IT IS DELIBERATELY HERE
   * RATHER THAN IN `@qmulate/database`.
   *
   * The defect it pins is not "waqf-005 is captured" — it is "the api suite spent a resource the
   * database suite needs, and the database suite is where the alarm went off". Measured before the
   * fix: run 2 of `pnpm test:integration` against the same database reported **19 failed** across
   * `e3-deed-term-guards.integration.test.ts` and `seed.integration.test.ts`, with the first message
   * reading *"a deed recording NO مآل was rewritten into a charitable reversion"* — the V-E3-01 HIGH
   * verbatim, on a database where nothing of the sort had happened.
   *
   * An alarm in the wrong package is worse than no alarm: it sends the next reader to audit the
   * founder's-condition seal, which is fine, while the actual cause sits two packages away. So the
   * pin lives HERE, immediately after the code that could break it, and it names the rule rather
   * than the symptom.
   */
  it('leaves the SEEDED intake endowment UNSPENT — the AV4-B2 pin', async () => {
    const seeded = await readDeedTerms(SEEDED_INTAKE_WAQF);
    expect(
      seeded.reversionClauseCaptured,
      `THIS FILE JUST SPENT ${SEEDED_INTAKE_WAQF}, THE SEEDED INTAKE ENDOWMENT. That is AV4-B2: ` +
        `recording a deed term is irreversible (qmulate_shart_guard tier 3), db:seed cannot repair ` +
        `it, and the next run of @qmulate/database's suite will fail with founder's-condition ` +
        `messages that have nothing to do with the real cause. The capture must run against an ` +
        `endowment THIS FILE PROVISIONS (provisionIntakeEndowment) and destroys again — see rule 5 ` +
        `in test/setup.ts. The seeded row is READ, never written.`,
    ).toBe(false);
    expect(seeded.reversionKind).toBeNull();
    expect(seeded.reversionRecordedAt).toBeNull();
    expect(seeded.reversionRecordedAtHijri).toBeNull();
  }, 120_000);
});
