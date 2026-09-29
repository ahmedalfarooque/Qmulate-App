/**
 * AC-3 — the AML no-tipping-off compartment. **PARTIAL IN E2, and this file says where the line is.**
 *
 * §10 §6 / BR-604, the sentence everything below serves:
 *
 *   **"Invisibility, not redaction."** Outside the compartment the SAR does not appear anywhere: not as
 *   a greyed row, not as a COUNT, not in the audit-trail feed shown to non-members, not in any export
 *   or evidence pack, not in the subject beneficiary's portal or notifications. A non-member querying
 *   the store gets an EMPTY SET — as if it does not exist — and the ATTEMPT is logged into the
 *   compartment's own audit stream, visible only to members.
 *
 *   And: **"No other role — *including the Nazir by default* — reads it unless separately made a
 *   compartment member."**
 *
 * ── WHAT E2 CAN PROVE, AND WHAT IT CANNOT ────────────────────────────────────────────────────
 * CAN: `requireAmlMember()`'s predicate; the subtractive `AML_RESTRICTED` clause on the two models
 * that carry a `confidentiality` column; that the clause is driven ONLY by per-endowment compartment
 * membership; that a non-member's row count is unchanged by the restricted row's existence; and that a
 * non-member's attempt lands in the compartment's own (RESTRICTED) stream.
 *
 * CANNOT: there is **no SAR model in `schema.prisma`** and no notification fan-out, so the SAR record
 * itself, its own audit stream and evidence-pack exclusion are E7/S8. **Do not claim AC-3 green.**
 *
 * ── WHY THE RESTRICTED ROW IS A `Document` AND NOT A `Beneficiary` ───────────────────────────
 * `@qmulate/database`'s `seed.integration.test.ts` compares ABSOLUTE table counts against
 * `EXPECTED_COUNTS`, and `Beneficiary` is one of them — so creating (or re-classifying) a beneficiary
 * would make a sibling suite's assertion depend on whether this one had run. `Document` is not in that
 * list because the seed writes none, so a document created and deleted here is invisible to it.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ROLE_PRESETS } from '@qmulate/domain';

import {
  API_TEST_ACTOR_ID,
  API_TEST_PREFIX,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  countAuditEvents,
  databaseModule,
  hasDatabase,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { amlProcedure, createCallerFactory, router } from '../src/trpc.js';
import { amlCompartmentWaqfIds, isAmlMember } from '../src/middleware/aml.js';
import {
  ApiError,
  apiErrorToTRPCError,
  API_ERROR_CODES,
  API_ERROR_STATUS,
  NON_DISCLOSURE_CODES,
  NON_DISCLOSURE_WIRE_CODE,
  NON_DISCLOSURE_WIRE_MESSAGE,
} from '../src/errors.js';

warnNoDatabase('AC-3 (the AML no-tipping-off compartment)');

const WAQF_A = 'waqf-001';

/** Inside the compartment for waqf-001. */
const AML_MEMBER = `${API_TEST_PREFIX}aml-member`;
/** A case manager on the same endowment, NOT a member. */
const CASE_MANAGER = `${API_TEST_PREFIX}aml-case-manager`;
/** A NAZIR on the same endowment, NOT a member — "including the Nazir by default". */
const NAZIR_NON_MEMBER = `${API_TEST_PREFIX}aml-nazir`;

/** The restricted row. Deleted in `afterAll`. */
const RESTRICTED_DOCUMENT_ID = `${API_TEST_PREFIX}doc-aml-restricted`;
const NORMAL_DOCUMENT_ID = `${API_TEST_PREFIX}doc-normal`;

/**
 * A tiny router built on `amlProcedure`, so the compartment RUNG is exercised as a procedure and not
 * only as a predicate.
 *
 * It lives here rather than in `src/root.ts` because E2 has no SAR model to hang a real compartment
 * procedure off (§10 §6's subject is the SAR record, which is E7/S8). Putting a placeholder into the
 * shipped router would be worse than this: it would look like a feature.
 */
const amlProbeRouter = router({
  probe: amlProcedure('aml:sar:read').query(({ ctx }) => ({
    waqfId: ctx.waqfId,
    member: true as const,
  })),
});

const createProbeCaller = createCallerFactory(amlProbeRouter);

describe.skipIf(!hasDatabase)('AC-3 · the AML compartment is invisibility, not redaction', () => {
  beforeAll(async () => {
    await assertSeeded();
    // Clean first as well as last: a crashed previous run must not leave rows that make a premise
    // silently true.
    await cleanupApiTestRows();
    await deleteProbeDocuments();

    await provisionTestSubjects([
      {
        id: AML_MEMBER,
        role: 'AML_OFFICER',
        waqfIds: [WAQF_A],
        permissions: [...ROLE_PRESETS.aml_officer],
        // Membership is the GATE; the preset is only the capability (§10 §6).
        amlCompartment: true,
      },
      {
        id: CASE_MANAGER,
        role: 'CASE_MANAGER',
        waqfIds: [WAQF_A],
        permissions: [...ROLE_PRESETS.case_manager],
      },
      {
        id: NAZIR_NON_MEMBER,
        role: 'NAZIR',
        waqfIds: [WAQF_A],
        permissions: [...ROLE_PRESETS.nazir],
      },
    ]);

    await createProbeDocuments();
  });

  afterAll(async () => {
    await deleteProbeDocuments();
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ─────────────────────────────────────────────────────────────────────────────────────────
   * The predicate
   * ───────────────────────────────────────────────────────────────────────────────────────── */

  it('membership is affirmative and per-endowment — with ONE ruled exception, the Nazir', async () => {
    const member = await contextFor({ userId: AML_MEMBER, requestId: 'ac3-member' });
    const nazir = await contextFor({ userId: NAZIR_NON_MEMBER, requestId: 'ac3-nazir' });
    const caseManager = await contextFor({ userId: CASE_MANAGER, requestId: 'ac3-cm' });

    expect(isAmlMember(member, WAQF_A)).toBe(true);
    expect(amlCompartmentWaqfIds(member)).toEqual([WAQF_A]);

    // ⚠⚠ THIS ASSERTION IS INVERTED, NOT DELETED, AND THE INVERSION IS A RULING.
    //
    // It used to read: `expect(isAmlMember(nazir, WAQF_A)).toBe(false)` under the comment
    // «"including the Nazir by default". The most senior role in the system is outside.» That was
    // ENGINEERING'S FAIL-SAFE READING, shipped and believed for a sprint, and it contradicted a
    // principle already hard-coded on `ApprovalRequest` — which may never gain a `confidentiality`
    // column because "an approval hidden by AML classification is one the legally accountable Nazir
    // cannot audit". Same person, opposite answers.
    //
    // The product owner ruled S8-Q2 on 2026-08-23, verbatim selection "Nazir inside by construction",
    // resolving it in favour of the accountability principle and naming the tradeoff he accepted: the
    // widened knowledge set is exactly the seat regulators hold accountable. The old assertion is
    // quoted above rather than deleted, because a reverted ruling should read as a reversal.
    expect(isAmlMember(nazir, WAQF_A)).toBe(true);
    expect(amlCompartmentWaqfIds(nazir)).toEqual([WAQF_A]);

    // ⚠ AND THE RULING IS ONE ARM, NOT AN OPENING. Seniority still implies nothing: the case manager
    // is senior staff on this endowment and is OUTSIDE. This is the assertion that would catch a
    // "helpful" widening of the arm from `nazir` to "any staff role".
    expect(isAmlMember(caseManager, WAQF_A)).toBe(false);
    expect(amlCompartmentWaqfIds(caseManager)).toEqual([]);

    // …and neither an explicit membership NOR the Nazir's by-construction arm travels to another
    // endowment. A Nazir seat on waqf-001 is not an accountability claim over waqf-002.
    expect(isAmlMember(member, 'waqf-002')).toBe(false);
    expect(isAmlMember(nazir, 'waqf-002')).toBe(false);
  });

  it('the derived actor context carries the compartment list, not a global clearance', async () => {
    // AC-3's mutation is "set canViewAmlRestricted: true on the resolved user context", which in
    // Sprint 1 removed the AML restriction ENTIRELY — `amlClause()` returned `null` before the
    // per-waqf list was consulted. The flag now DERIVES from the list, and the force-filter no longer
    // reads it at all.
    const { toActorContext } = await import('../src/context.js');

    // ⊕ S8-Q2 CHANGED THE SUBJECT OF THIS TEST, so the OUTSIDE arm is now the case manager. The Nazir
    // used to be the example of "senior but outside"; the owner ruled the accountable seat inside by
    // construction, so using it here would assert the opposite of the ruling.
    const caseManager = await contextFor({ userId: CASE_MANAGER, requestId: 'ac3-derive-cm' });
    const cmActor = toActorContext(caseManager);
    expect(cmActor.amlCompartmentWaqfIds).toEqual([]);
    expect(cmActor.canViewAmlRestricted).toBe(false);

    const member = await contextFor({ userId: AML_MEMBER, requestId: 'ac3-derive-member' });
    const memberActor = toActorContext(member);
    expect(memberActor.amlCompartmentWaqfIds).toEqual([WAQF_A]);
    expect(memberActor.canViewAmlRestricted).toBe(true);

    // ⊕ AND THE ASSERTION THAT MATTERS MOST FOR THE RULING: the two derivations AGREE. The procedure
    // rung reads `isAmlMember`, the FORCE FILTER reads this actor context's `amlCompartmentWaqfIds`,
    // and until S8 those were separate implementations of the membership rule. If they disagree, a
    // session is admitted at one layer and subtracted at the other — an outage that reads as a
    // working control, and the exact failure adding the Nazir arm to two of three copies produced.
    const nazir = await contextFor({ userId: NAZIR_NON_MEMBER, requestId: 'ac3-derive-nazir' });
    for (const [label, ctx] of [
      ['nazir', nazir],
      ['aml officer', member],
      ['case manager', caseManager],
    ] as const)
      expect(
        toActorContext(ctx).amlCompartmentWaqfIds,
        `${label}: the force filter disagrees with the procedure rung`,
      ).toEqual(amlCompartmentWaqfIds(ctx));
  });

  /* ─────────────────────────────────────────────────────────────────────────────────────────
   * Invisibility: no row, no count, no placeholder
   * ───────────────────────────────────────────────────────────────────────────────────────── */

  it('⊕ THE INSIDE ARM — a member SEES the restricted row the non-member cannot, same query, same run', async () => {
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // THE ASSERTION S8-Q2 MAKES POSSIBLE, AND THE REASON IT MATTERS MORE THAN IT LOOKS.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    // Until the owner's ruling, every seat this suite could build was OUTSIDE the compartment: all six
    // seeded grant shapes set `amlCompartment: false`, and the one hand-built member existed only as a
    // synthesised context. So "the non-member sees nothing" was contrasted against NOTHING — the
    // suppression was indistinguishable from an empty table, which is the exact shape
    // `retention-remainder-delete` names ("a DELETE against an empty table erases nothing and reads as
    // a working control") and the shape R6-C1 measured at scale.
    //
    // S8-Q2 puts the Nazir inside BY CONSTRUCTION, which means a seeded seat is now a real member. The
    // contrast is therefore between two REAL seats, in the SAME query, in the SAME run — and if the
    // inside arm ever comes back empty, this test fails on its own premise rather than passing.
    const inside = await contextFor({ userId: NAZIR_NON_MEMBER, requestId: 'ac3-inside-arm' });
    const outside = await contextFor({ userId: CASE_MANAGER, requestId: 'ac3-outside-arm' });

    // The premise, asserted: one is in, one is out, by the ONE derivation both layers use.
    expect(isAmlMember(inside, WAQF_A), 'the by-construction arm did not fire').toBe(true);
    expect(isAmlMember(outside, WAQF_A), 'the case manager became a member').toBe(false);

    const read = async (ctx: Awaited<ReturnType<typeof contextFor>>): Promise<string[]> =>
      (await ctx.db.document.findMany({ where: { waqfId: WAQF_A }, select: { id: true } })).map(
        (row) => row.id,
      );

    const seenInside = await read(inside);
    const seenOutside = await read(outside);

    // THE CONTRAST. The restricted document is visible to the member and invisible to the non-member.
    expect(
      seenInside,
      'the member cannot see the restricted row — the contrast is vacuous',
    ).toContain(RESTRICTED_DOCUMENT_ID);
    expect(seenOutside).not.toContain(RESTRICTED_DOCUMENT_ID);

    // …and the NORMAL sibling is visible to BOTH, so what differs is the classification and not the
    // query, the endowment, or the grant.
    expect(seenInside).toContain(NORMAL_DOCUMENT_ID);
    expect(seenOutside).toContain(NORMAL_DOCUMENT_ID);

    // …and the COUNT differs by exactly the restricted row, which is the enumeration-oracle half.
    const countInside = await inside.db.document.count({ where: { waqfId: WAQF_A } });
    const countOutside = await outside.db.document.count({ where: { waqfId: WAQF_A } });
    expect(countInside).toBe(seenInside.length);
    expect(countOutside).toBe(seenOutside.length);
    expect(countInside - countOutside).toBe(1);
  });

  it('a NON-MEMBER gets an EMPTY SET for the restricted row — and an unchanged COUNT', async () => {
    // ⚠ `NAZIR_NON_MEMBER` WAS IN THIS LIST AND IS NOT ANY MORE. S8-Q2 put the accountable seat
    // inside by construction, so asserting the restricted row is invisible to it would assert the
    // opposite of the ruling. The case manager is the genuine non-member: senior staff on this
    // endowment, no `amlCompartment` grant, outside.
    //
    // ⊕ AND THE INSIDE ARM IS NOW REAL — see the test immediately below. Before the ruling BOTH arms
    // of this suite were outside-the-compartment seats, so "the non-member sees nothing" was
    // contrasted against nothing: the suppression could not be distinguished from an empty table.
    // That is what Q2 finally makes assertable.
    for (const userId of [CASE_MANAGER]) {
      const ctx = await contextFor({ userId, requestId: `ac3-invisible-${userId}` });

      const rows = await ctx.db.document.findMany({
        where: { waqfId: WAQF_A },
        select: { id: true, confidentiality: true },
      });
      const ids = rows.map((row) => row.id);

      // No row…
      expect(ids, userId).not.toContain(RESTRICTED_DOCUMENT_ID);
      // …and the NORMAL sibling IS visible, so this is a subtraction rather than a broken query.
      expect(ids, userId).toContain(NORMAL_DOCUMENT_ID);

      // …no COUNT either. A count that leaked the true number would be an enumeration oracle even
      // with the row hidden — "not as a count" is in §6 verbatim.
      const count = await ctx.db.document.count({ where: { waqfId: WAQF_A } });
      expect(count, userId).toBe(ids.length);

      // …and no greyed placeholder: a direct fetch by id resolves to nothing at all, not to a row
      // with its fields blanked.
      await expect(
        ctx.db.document.findUnique({
          where: { id: RESTRICTED_DOCUMENT_ID },
          select: { id: true, titleAr: true },
        }),
      ).resolves.toBeNull();
    }
  });

  it('a MEMBER sees it — otherwise the suite would pass over a filter that hides everything', async () => {
    const ctx = await contextFor({ userId: AML_MEMBER, requestId: 'ac3-member-sees' });
    const rows = await ctx.db.document.findMany({
      where: { waqfId: WAQF_A },
      select: { id: true, confidentiality: true },
    });
    const restricted = rows.find((row) => row.id === RESTRICTED_DOCUMENT_ID);
    expect(restricted, 'the compartment member cannot see the restricted row').toBeDefined();
    expect(restricted?.confidentiality).toBe('AML_RESTRICTED');
  });

  it('membership for endowment A does not reveal an AML_RESTRICTED row on endowment B', async () => {
    // The clause is an OR over the compartment LIST, so a caller cleared for SOME of their endowments
    // sees restricted rows for exactly those. Here the member holds only waqf-001, so a restricted row
    // on waqf-002 stays invisible — asserted because a naive implementation ("this caller is cleared")
    // would show both.
    await createRestrictedDocumentOnOtherEndowment();
    const ctx = await contextFor({ userId: AML_MEMBER, requestId: 'ac3-cross' });
    const rows = await ctx.db.document.findMany({ select: { id: true } });
    expect(rows.map((row) => row.id)).not.toContain(`${RESTRICTED_DOCUMENT_ID}-b`);
  });

  /* ─────────────────────────────────────────────────────────────────────────────────────────
   * The rung
   * ───────────────────────────────────────────────────────────────────────────────────────── */

  it('requireAmlMember() refuses a non-member as NOT_FOUND, never as FORBIDDEN', async () => {
    const ctx = await contextFor({ userId: AML_MEMBER, requestId: 'ac3-rung-member' });
    await expect(createProbeCaller(ctx).probe({ waqfId: WAQF_A })).resolves.toMatchObject({
      member: true,
    });

    // A non-member who nevertheless holds `aml:sar:read`… cannot exist: the `aml` module sits in no
    // preset but `aml_officer`'s. So the refusal a non-member actually gets is the SCOPE rung's, and it
    // is FORBIDDEN-or-NOT_FOUND depending on whether they hold any grant at all. Both are
    // non-disclosing about the compartment, which is what matters — asserted rather than assumed.
    const nazir = await contextFor({ userId: NAZIR_NON_MEMBER, requestId: 'ac3-rung-nazir' });
    let thrown: unknown;
    try {
      await createProbeCaller(nazir).probe({ waqfId: WAQF_A });
    } catch (error) {
      thrown = error;
    }
    expect(['NOT_FOUND', 'FORBIDDEN']).toContain((thrown as { code?: string }).code);
  });

  it('a caller with the capability but NOT the membership is refused by the rung itself', async () => {
    // The interesting case, and the one the rung exists for: an `aml_officer` seat whose compartment
    // flag is false. The preset gives them `aml:sar:read`, so they clear the scope rung — and the
    // compartment rung must still refuse. Simulated by stripping the flag from the resolved context,
    // which is exactly the state a revoked membership leaves behind.
    const ctx = await contextFor({ userId: AML_MEMBER, requestId: 'ac3-rung-stripped' });
    const stripped = {
      ...ctx,
      grants: ctx.grants.map((grant) => ({ ...grant, amlCompartment: false })),
    };

    let thrown: unknown;
    try {
      await createProbeCaller(stripped as never).probe({ waqfId: WAQF_A });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: string }).code).toBe('NOT_FOUND');

    // ⚠ INVERTED IN S8, NOT DELETED. This line used to read
    //     expect(String(thrown.message)).toContain('AML_COMPARTMENT_ONLY')
    // and it PINNED A LEAK AS EXPECTED BEHAVIOUR. `apiErrorToTRPCError` concatenated the code into
    // `shape.message` for every refusal, over `middleware/aml.ts`'s developer-facing text — which
    // explains what a compartment is and that not even the Nazir is inside by default. So the one
    // assertion guarding C5's last channel was requiring the channel to talk. It is kept, reversed,
    // because deleting it would leave no record that the leak was once believed correct.
    const message = String((thrown as { message?: string }).message);
    expect(message).toBe(NON_DISCLOSURE_WIRE_MESSAGE);
    expect(message).not.toContain('AML_COMPARTMENT_ONLY');
    expect(message).not.toContain('compartment');
    expect(message).not.toContain(WAQF_A);
  });

  it("the non-member's ATTEMPT is logged into the compartment's OWN stream (RESTRICTED)", async () => {
    const before = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      entityId: WAQF_A,
    });

    const ctx = await contextFor({ userId: AML_MEMBER, requestId: 'ac3-attempt-audit' });
    const stripped = {
      ...ctx,
      grants: ctx.grants.map((grant) => ({ ...grant, amlCompartment: false })),
    };
    await expect(createProbeCaller(stripped as never).probe({ waqfId: WAQF_A })).rejects.toThrow();

    const after = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      entityId: WAQF_A,
    });
    expect(after - before).toBe(1);

    // ⚠ RESTRICTED, not ROUTINE. §10 §6: the attempt is "logged into the compartment's own audit
    // stream, visible only to members" — recording it where non-members can read it would itself be a
    // tip-off about who is being looked at.
    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<{ classification: string; entityType: string }[]>(
      `SELECT "classification"::text AS classification, "entityType"
         FROM "audit_event"
        WHERE "action" = 'ACCESS_DENIED' AND "entityId" = $1
        ORDER BY "id" DESC LIMIT 1`,
      WAQF_A,
    );
    expect(rows[0]?.classification).toBe('RESTRICTED');
    expect(rows[0]?.entityType).toBe('AmlCompartment');
  });

  /* ─────────────────────────────────────────────────────────────────────────────────────────
   * MP-24's mirror image
   * ───────────────────────────────────────────────────────────────────────────────────────── */

  it('MP-24 · no APPROVE event can be suppressed from a Nazir by AML classification', async () => {
    // `AuditEvent` has no `confidentiality` column and `ApprovalRequest` has none either, so an
    // approval cannot be pulled into the compartment. The force-filter's AML clause is applied to
    // EXACTLY the models that carry the column, and that list is compared against `schema.prisma` by
    // `@qmulate/database`'s own suite (MP-26). Here: the Nazir who is OUTSIDE the compartment can still
    // read the full approval history for their endowment.
    const nazir = await contextFor({
      userId: NAZIR_NON_MEMBER,
      requestId: 'ac3-approvals-visible',
    });
    const approvals = await nazir.db.approvalRequest.findMany({
      where: { waqfId: WAQF_A },
      select: { id: true, status: true },
    });
    // The seed writes one executed run's approval on waqf-001; it must be visible to a non-member Nazir.
    expect(approvals.length).toBeGreaterThan(0);

    const { AML_CONFIDENTIALITY_MODELS } = await databaseModule();
    expect([...AML_CONFIDENTIALITY_MODELS]).not.toContain('ApprovalRequest');
    expect([...AML_CONFIDENTIALITY_MODELS]).not.toContain('AuditEvent');
  });

  it('no aml permission carries an approve or sign verb anywhere in the registry', async () => {
    const { PERMISSION_RESOURCES, ROLE_KEYS: keys } = await import('@qmulate/domain');
    // An AML decision may only BLOCK. There is no `aml:*:approve` in any preset, and the module's
    // resource list is closed — so an approval authority cannot come to live inside a compartment the
    // legally accountable Nazir cannot audit.
    expect(PERMISSION_RESOURCES.aml).toEqual(['sar']);
    for (const roleKey of keys) {
      for (const permission of ROLE_PRESETS[roleKey]) {
        if (!permission.startsWith('aml:')) continue;
        expect(permission.endsWith(':approve'), `${roleKey} holds ${permission}`).toBe(false);
        expect(permission.endsWith(':sign'), `${roleKey} holds ${permission}`).toBe(false);
      }
    }
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * S8 · C5 — THE WIRE. The refusal must be indistinguishable in EVERY channel, not just two.
   *
   * §09 C5: a non-member's read is a NEUTRAL NOT-FOUND, "never 'access denied to an AML record'
   * (which would itself leak existence)". Before S8 that held in the HTTP status and in the copy
   * deck — the three wordings are byte-identical by test — and failed in the payload. So these
   * tests DRIVE the two channels that were talking rather than asserting the shape of the fix:
   * `shape.message`, and the `apiCode`/`messageKey` pair the real `errorFormatter` threads.
   *
   * The formatter is read off the SHIPPED router's own config, not re-implemented here. A copy of
   * the formatter in this file would pass while the mounted one leaked — S2's lesson: a
   * source-shape assertion is not a test.
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  /** The visible triple: everything a client can actually see about which refusal happened. */
  function visibleTriple(thrown: unknown): {
    message: string;
    apiCode: unknown;
    messageKey: unknown;
  } {
    const config = (
      appRouter as unknown as {
        _def: { _config: { errorFormatter: (opts: Record<string, unknown>) => unknown } };
      }
    )._def._config;
    const error = thrown as { message?: string; code?: string; cause?: unknown; shape?: unknown };
    const baseShape = {
      message: String(error.message ?? ''),
      code: -32600,
      data: { code: error.code, httpStatus: 404 },
    };
    const shaped = config.errorFormatter({
      shape: baseShape,
      error,
      type: 'query',
      path: 'probe',
      input: undefined,
      ctx: undefined,
    }) as { message: string; data: { apiCode?: unknown; messageKey?: unknown } };
    return {
      message: shaped.message,
      apiCode: shaped.data.apiCode,
      messageKey: shaped.data.messageKey,
    };
  }

  it('a compartment non-member and a no-grant caller are BYTE-IDENTICAL on the wire', async () => {
    // The two contexts differ in exactly ONE fact, and both are real refusals from the real
    // procedure: the first clears the scope rung and is refused by the compartment rung
    // (AML_COMPARTMENT_ONLY); the second is refused by the scope rung (NO_GRANT). Before S8 the
    // first arm carried `apiCode: 'AML_COMPARTMENT_ONLY'` and a message explaining the compartment,
    // and the second carried `NO_GRANT` — so an insider could tell "this endowment has an AML
    // matter" from "I am not on this endowment" with one request.
    const base = await contextFor({ userId: AML_MEMBER, requestId: 'ac3-wire-compartment' });

    const compartmentDenied = {
      ...base,
      grants: base.grants.map((grant) => ({ ...grant, amlCompartment: false })),
    };
    const noGrantAtAll = { ...base, grants: [] };

    const capture = async (ctx: unknown): Promise<unknown> => {
      try {
        await createProbeCaller(ctx as never).probe({ waqfId: WAQF_A });
        return null;
      } catch (error) {
        return error;
      }
    };

    const compartmentError = await capture(compartmentDenied);
    const noGrantError = await capture(noGrantAtAll);

    // Both must actually have refused — a null here would make the comparison vacuous.
    expect(compartmentError, 'the compartment rung did not refuse').not.toBeNull();
    expect(noGrantError, 'the scope rung did not refuse').not.toBeNull();

    // And they must have refused for DIFFERENT internal reasons, or the test proves nothing about
    // suppression. The truth is still on `cause`, server-side, which is where it belongs.
    expect((compartmentError as { cause?: { code?: string } }).cause?.code).toBe(
      'AML_COMPARTMENT_ONLY',
    );
    expect((noGrantError as { cause?: { code?: string } }).cause?.code).toBe('NO_GRANT');

    // ── THE SSR CHANNEL, driven exactly as `apps/web` reads it ──────────────────────────────
    // `apps/web/src/lib/trpc/client.ts`'s `rawMessageKey()` reads `messageKey` off `error.cause`
    // as well as off `error.data`, because a server component calls the router IN PROCESS and
    // `errorFormatter` never runs on that path. So the formatter narrowing alone would leave a
    // server component holding `errors.access.AML_COMPARTMENT_ONLY`. Read the same way it does.
    const causeKey = (thrown: unknown): unknown =>
      (thrown as { cause?: { messageKey?: unknown } }).cause?.messageKey;
    expect(causeKey(compartmentError)).toBe(causeKey(noGrantError));
    expect(causeKey(compartmentError)).toBe(`errors.access.${NON_DISCLOSURE_WIRE_CODE}`);

    const a = visibleTriple(compartmentError);
    const b = visibleTriple(noGrantError);
    expect(a).toEqual(b);
    expect(a.apiCode).toBe(NON_DISCLOSURE_WIRE_CODE);
    expect(a.messageKey).toBe(`errors.access.${NON_DISCLOSURE_WIRE_CODE}`);
    expect(a.message).toBe(NON_DISCLOSURE_WIRE_MESSAGE);
  });

  it('EVERY member of the non-disclosure class collapses to one identity, chatty message and all', () => {
    // Exhaustive over the class rather than over the two routes that happen to be reachable today:
    // a future code mapped to NOT_FOUND joins NON_DISCLOSURE_CODES by construction and is covered
    // here the day it is added, with no list to remember to update.
    expect(NON_DISCLOSURE_CODES.length).toBeGreaterThanOrEqual(3);

    const triples = NON_DISCLOSURE_CODES.map((code) =>
      visibleTriple(
        apiErrorToTRPCError(
          new ApiError(
            code,
            `SECRET-${code}: waqf ${WAQF_A} has an AML compartment and you are not a member`,
            { waqfId: WAQF_A },
          ),
        ),
      ),
    );

    expect(new Set(triples.map((t) => JSON.stringify(t))).size).toBe(1);
    for (const triple of triples) {
      expect(triple.message).toBe(NON_DISCLOSURE_WIRE_MESSAGE);
      expect(triple.message).not.toContain('SECRET-');
      expect(triple.message).not.toContain(WAQF_A);
      expect(String(triple.messageKey)).toBe(`errors.access.${NON_DISCLOSURE_WIRE_CODE}`);
    }
  });

  it('POSITIVE CONTROL — a refusal OUTSIDE the class still carries its own code', () => {
    // Without this, a formatter that blanked every field would pass both tests above. The narrowing
    // must be a class boundary, not a global gag: `PERMISSION_DENIED` is FORBIDDEN precisely because
    // existence is already disclosed by the grant, so its code and key must still travel.
    expect(API_ERROR_STATUS.PERMISSION_DENIED).not.toBe('NOT_FOUND');
    const triple = visibleTriple(
      apiErrorToTRPCError(new ApiError('PERMISSION_DENIED', 'caller lacks the verb')),
    );
    expect(triple.apiCode).toBe('PERMISSION_DENIED');
    expect(triple.messageKey).toBe('errors.access.PERMISSION_DENIED');
    expect(triple.message).toContain('PERMISSION_DENIED');
  });

  it('the class is DERIVED from the status table, so membership cannot be forgotten', () => {
    // The i18n suite keeps its own hand-written NON_DISCLOSURE_CODES list (it reads this file as
    // TEXT, so it cannot import). This asserts the derivation those three names are supposed to
    // stand for: every NOT_FOUND code is in the class, and nothing else is.
    const expected = API_ERROR_CODES.filter((code) => API_ERROR_STATUS[code] === 'NOT_FOUND');
    expect([...NON_DISCLOSURE_CODES].sort()).toEqual([...expected].sort());
    expect(NON_DISCLOSURE_CODES).toContain('AML_COMPARTMENT_ONLY');
    expect(API_ERROR_STATUS[NON_DISCLOSURE_WIRE_CODE]).toBe('NOT_FOUND');
  });

  it('the shipped router mounts NO compartment-gated procedure yet, and that is honest', () => {
    // §10 §6's subject is the SAR record, and there is no SAR model in `schema.prisma` (E7/S8). A
    // placeholder procedure in `src/root.ts` would look like a feature; the rung is proven against the
    // local probe router above instead. Asserted so the absence is deliberate rather than forgotten.
    const procedures = (appRouter as unknown as { _def: { procedures: Record<string, unknown> } })
      ._def.procedures;
    expect(Object.keys(procedures).some((path) => path.startsWith('aml.'))).toBe(false);
  });

  it.todo(
    'AC-3 NOT PROVABLE IN E2: there is no SAR model in schema.prisma and no notification fan-out, so ' +
      'the SAR record itself, its own audit stream, evidence-pack exclusion, and "no subject signal" ' +
      "(the subject beneficiary's portal, KYC prompts and messaging must be byte-identical to a " +
      "non-subject's) are E7/S8. What E2 proves is the compartment PREDICATE and the subtractive " +
      'clause on the two models that carry a confidentiality column. Do not claim AC-3 green.',
  );
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Document fixtures
 *
 * `Document` is used precisely because the seed writes none, so nothing in `@qmulate/database`'s
 * `EXPECTED_COUNTS` can be perturbed by these rows.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

async function createProbeDocuments(): Promise<void> {
  const { makeSystemContext, withAudit, createPrismaClient } = await databaseModule();
  const ctx = makeSystemContext({ actorId: API_TEST_ACTOR_ID, requestId: 'api-test-aml-doc' });
  const db = createPrismaClient(ctx);

  await withAudit(db, async (tx) => {
    for (const [id, confidentiality] of [
      [RESTRICTED_DOCUMENT_ID, 'AML_RESTRICTED'],
      [NORMAL_DOCUMENT_ID, 'NORMAL'],
    ] as const) {
      const existing = await tx.document.findFirst({
        where: { id },
        select: { id: true, deletedAt: true },
      });
      if (existing !== null) {
        // A row left behind by an earlier run of this file. Revive it rather than trying to replace
        // it: `document_retention_guard` refuses a hard delete inside the retention window, so a
        // previous run's cleanup will have SOFT-deleted it (see `deleteProbeDocuments`).
        if (existing.deletedAt !== null) {
          await tx.document.update({ where: { id }, data: { deletedAt: null } });
        }
        continue;
      }
      await tx.document.create({
        data: {
          id,
          waqfId: WAQF_A,
          type: 'correspondence',
          titleAr: `مستند اختبار (بيانات وهمية) ${id}`,
          storageKey: `api-test/${id}`,
          sha256: '0'.repeat(64),
          confidentiality: confidentiality as never,
          // ⚠ A PAST `retentionUntil`, DELIBERATELY, AND ONLY BECAUSE THIS IS A PROBE ROW.
          //
          // Discovered empirically: `document_retention_guard` REFUSES a hard delete while a document
          // is inside its retention window ("cannot be hard-deleted (NFR-07 / BR-702). Use a soft
          // delete"), and owner-E's E2 hardening also refuses SHORTENING retention without a verified
          // reserved-matter approval. So a probe row created with the real >= 10-year floor could never
          // be cleaned up, and would be left behind in every database this suite touched.
          //
          // The >= 10-year floor is a rule about REAL documents; these two rows are synthetic AML
          // probes that exist for the length of one test file. The floor itself lives in
          // Setting['retention.minimumYears'] — never a code constant — and is ⚠ unverified: confirm
          // vs primary law.
          retentionUntil: new Date('2020-01-01T00:00:00.000Z'),
          retentionUntilHijri: '1441-05-05',
        },
      });
    }
  });
}

async function createRestrictedDocumentOnOtherEndowment(): Promise<void> {
  const { makeSystemContext, withAudit, createPrismaClient } = await databaseModule();
  const ctx = makeSystemContext({ actorId: API_TEST_ACTOR_ID, requestId: 'api-test-aml-doc-b' });
  const db = createPrismaClient(ctx);
  const id = `${RESTRICTED_DOCUMENT_ID}-b`;

  await withAudit(db, async (tx) => {
    const existing = await tx.document.findFirst({ where: { id }, select: { id: true } });
    if (existing !== null) return;
    await tx.document.create({
      data: {
        id,
        waqfId: 'waqf-002',
        type: 'correspondence',
        titleAr: `مستند اختبار (بيانات وهمية) ${id}`,
        storageKey: `api-test/${id}`,
        sha256: '1'.repeat(64),
        confidentiality: 'AML_RESTRICTED' as never,
        // See the note in `createProbeDocuments` — a past retention date so the probe row can be
        // cleaned up at all.
        retentionUntil: new Date('2020-01-01T00:00:00.000Z'),
        retentionUntilHijri: '1441-05-05',
      },
    });
  });
}

/**
 * Raw DELETE of the probe rows.
 *
 * Only possible because their `retentionUntil` is in the past — see the note in
 * `createProbeDocuments`. A row inside its retention window is refused by
 * `document_retention_guard`, which is the control working exactly as specified.
 */
async function deleteProbeDocuments(): Promise<void> {
  const prisma = await basePrisma();
  const pattern = `${API_TEST_PREFIX}doc-%`;
  try {
    await prisma.$executeRawUnsafe(`DELETE FROM "document" WHERE "id" LIKE '${pattern}'`);
  } catch {
    // ⚠ NOT SWALLOWING A BUG — SWALLOWING A CONTROL DOING ITS JOB.
    //
    // `document_retention_guard` raises SQLSTATE 42501 on a hard delete inside the retention window
    // and says, verbatim, "Use a soft delete: set deletedAt". That applies to any probe row an earlier
    // run of this file created under the real >= 10-year floor, and there is no way to shorten its
    // retention either (owner-E's E2 hardening requires a verified reserved-matter approval to do
    // that). So cleanup does what the guard prescribes.
    await prisma.$executeRawUnsafe(
      `UPDATE "document" SET "deletedAt" = now() WHERE "id" LIKE '${pattern}' AND "deletedAt" IS NULL`,
    );
  }
}
