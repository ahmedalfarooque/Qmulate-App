/**
 * `onboarding` — THE THREE SEQUENCED HANDOVER GATES (S12-3 · BR-1101 · V-11).
 *
 * The operating model: Gate 01 Authority & Legal → Gate 02 Systems & Controls → Gate 03 People,
 * Property & Cadence; "nothing downstream proceeds until the prior gate clears." Three procedures:
 *
 *   status     — the endowment's gates, each with its recorded clearance, its unmet MECHANICAL
 *                prerequisites (read from the record NOW, never stored), the operating model's
 *                checklist the clearer must attest, what the gate blocks, and what THIS reader may do.
 *   clearGate  — a RECORDED HUMAN ACT by a holder of `endowment:waqf:write`: the order must permit it
 *                (the database re-proves that), every mechanical prerequisite must hold, and every
 *                checklist item must be attested `true`. `clearedBy` is the session.
 *   reopenGate — owner ruling 2026-09-08, verbatim "nazir can reopen": the acting grant must be the
 *                NAZIR's, a reason is required, and the order holds in reverse (a later CLEARED gate
 *                refuses the reopen). Reopening only ever blocks MORE, so it needs no approval.
 *
 * ⚠ What is NOT decided here: the checklist's content (owner Q4, unanswered — it is the operating
 * model's own list, `OPERATING_MODEL_GATE_CHECKLIST`), and whether a prerequisite that is a FACT
 * elsewhere in the record (a verified deed, a dedicated account) should be duplicated into the gate
 * row. It is not: the row stores the clearance, the record stores the facts, and `status` computes.
 */

import { z } from 'zod';

import {
  FixtureOnlyIdentifierRefusedError,
  INTAKE_ENTITLEMENT_ORDERS,
  INTAKE_WAQF_NATURES,
  INTAKE_WAQF_TYPES,
  assertFixtureGrammar,
  intakeEndowment,
  recordEvent,
  type EndowmentIntakeInput,
} from '@qmulate/database';
import {
  GATED_ACTIVITIES,
  GATE_BLOCKING,
  ONBOARDING_GATES,
  OPERATING_MODEL_GATE_CHECKLIST,
  clearOrderRefusal,
  downstreamBlock,
  reopenOrderRefusal,
  unattestedChecklistItems,
  unmetGatePrerequisites,
  type GatePrerequisiteFacts,
  type GateRow,
  type OnboardingGate,
} from '@qmulate/domain';
import { toHijriSnapshot } from '@qmulate/domain/dates';

import { ApiError } from '../errors.js';
import { toActorContext } from '../context.js';
import { auditedWrite } from '../middleware/audit-projection.js';
import { readOnboardingGates } from '../middleware/onboarding-gate.js';
import { resolveScope, type ScopedContext } from '../middleware/scope.js';
import { authedProcedure, endowmentScopedProcedure, makerProcedure, router } from '../trpc.js';

import type { AuthedContext } from '../middleware/authed.js';

import type { PermissionString } from '../permissions.js';

const gateInput = z.enum(ONBOARDING_GATES);

function holdsVerb(ctx: ScopedContext, permission: PermissionString): boolean {
  try {
    resolveScope(ctx, ctx.waqfId, permission);
    return true;
  } catch {
    return false;
  }
}

/** The mechanical prerequisites, read from the RECORD at this instant. */
async function prerequisiteFacts(ctx: ScopedContext): Promise<GatePrerequisiteFacts> {
  const [waqf, deed, bankAccounts, beneficiaries] = await Promise.all([
    ctx.db.waqf.findFirst({
      where: { id: ctx.waqfId },
      select: { classification: true, entitlementOrder: true },
    }),
    ctx.db.trusteeshipDeed.findFirst({
      where: { waqfId: ctx.waqfId, deletedAt: null },
      select: { eligibilityVerifiedAt: true },
    }),
    ctx.db.bankAccount.count({ where: { waqfId: ctx.waqfId, deletedAt: null, isDedicated: true } }),
    ctx.db.beneficiary.count({ where: { waqfId: ctx.waqfId, deletedAt: null } }),
  ]);
  return {
    trusteeshipDeedRecorded: deed !== null,
    nazirEligibilityVerified: deed?.eligibilityVerifiedAt != null,
    classificationRecorded: waqf !== null && String(waqf.classification) !== 'NOT_CLASSIFIED',
    dedicatedBankAccounts: bankAccounts,
    beneficiaries,
    directUse: waqf !== null && String(waqf.entitlementOrder) === 'NA_DIRECT_USE',
  };
}

const GATE_SELECT = {
  id: true,
  gate: true,
  status: true,
  clearedAt: true,
  clearedAtHijri: true,
  clearedBy: true,
  evidence: true,
  note: true,
  reopenedAt: true,
  reopenedAtHijri: true,
  reopenedBy: true,
  reopenReason: true,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⊕ S12-3b · UI INTAKE — an endowment is BORN from the request path (owner ruling "build ui intake")
 *
 * AUTHORITY, resolved explicitly and re-proved by the database: the caller must hold BOTH
 * `endowment:waqf:write` and `admin:access_matrix:write` on at least one endowment of the named
 * client that they can already see (a SIBLING). `waqf_birth_admission` (migration 53) demands the
 * same of the audit marker, established in the trail — the context is the sentence, the trigger is
 * the wall. Q7 (owner, open): a BRAND-NEW client's first endowment has no sibling; that birth is the
 * owner-credential bootstrap and is not offered here.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const INTAKE_RECORD_VERB: PermissionString = 'endowment:waqf:write';
const INTAKE_MATRIX_VERB: PermissionString = 'admin:access_matrix:write';

/** The caller's endowments carrying BOTH intake verbs, from the re-evaluated grants. */
function intakeCapableWaqfIds(ctx: AuthedContext): readonly string[] {
  const ids = new Set<string>();
  for (const grant of ctx.grants) {
    const held = new Set<string>(grant.permissions);
    if (held.has(INTAKE_RECORD_VERB) && held.has(INTAKE_MATRIX_VERB)) ids.add(grant.waqfId);
  }
  // One seat may confer one verb and another seat the other, on the same endowment (§10 §4.2).
  for (const waqfId of new Set(ctx.grants.map((grant) => grant.waqfId))) {
    const onThis = ctx.grants.filter((grant) => grant.waqfId === waqfId);
    const union = new Set<string>(onThis.flatMap((grant) => [...grant.permissions]));
    if (union.has(INTAKE_RECORD_VERB) && union.has(INTAKE_MATRIX_VERB)) ids.add(waqfId);
  }
  return [...ids].sort();
}

const dateInput = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

const intakeInput = z.object({
  clientId: z.string().min(1).max(64),
  waqif: z.union([
    z.object({ existingId: z.string().min(1).max(64) }).strict(),
    z
      .object({
        nameAr: z.string().min(1).max(256),
        nameEn: z.string().min(1).max(256).nullable().optional(),
      })
      .strict(),
  ]),
  certificateNumber: z.string().min(1).max(128),
  deedNumber: z.string().min(1).max(128),
  type: z.enum(INTAKE_WAQF_TYPES),
  nature: z.enum(INTAKE_WAQF_NATURES),
  entitlementOrder: z.enum(INTAKE_ENTITLEMENT_ORDERS),
  shartNarrativeAr: z.string().min(1).max(8000),
  shartSourceDocumentId: z.string().min(1).max(64).nullable().optional(),
  fiscalYearEnd: z.string().regex(/^\d{2}-\d{2}$/, 'expected MM-DD'),
  registrationDate: dateInput,
  trusteeship: z.object({
    primaryNazir: z.string().min(1).max(256),
    primaryAppointedDate: dateInput,
    jointlyLiable: z.boolean(),
    islam: z.boolean(),
    legalCapacity: z.boolean(),
    noDisqualifyingRemoval: z.boolean(),
    ksaResident: z.boolean(),
  }),
  nazirEmail: z.string().email().max(256),
});

export const onboardingRouter = router({
  status: endowmentScopedProcedure('endowment:waqf:read').query(async ({ ctx }) => {
    const [rows, facts] = await Promise.all([
      ctx.db.onboardingGate.findMany({
        where: { waqfId: ctx.waqfId, deletedAt: null },
        select: GATE_SELECT,
      }),
      prerequisiteFacts(ctx),
    ]);
    const byGate = new Map(rows.map((row) => [String(row.gate), row]));
    const gateRows: GateRow[] = rows.map((row) => ({
      gate: String(row.gate) as OnboardingGate,
      status: String(row.status) as GateRow['status'],
    }));

    return {
      waqfId: ctx.waqfId,
      // Facts about the READER: which acts THIS caller may take. Forms are drawn only where `true`.
      writable: {
        clear: holdsVerb(ctx, 'endowment:waqf:write'),
        reopen: holdsVerb(ctx, 'endowment:waqf:write') && ctx.grant.role === 'NAZIR',
      },
      gates: ONBOARDING_GATES.map((gate) => {
        const row = byGate.get(gate);
        const status =
          row === undefined ? ('OPEN' as const) : (String(row.status) as 'OPEN' | 'CLEARED');
        return {
          gate,
          /** ⚠ `recorded: false` means NO ROW EXISTS — an endowment born before migration 52, or inserted raw. Absence is not evidence: it reads as OPEN. */
          recorded: row !== undefined,
          status,
          clearedAt: row?.clearedAt?.toISOString() ?? null,
          clearedAtHijri: row?.clearedAtHijri ?? null,
          clearedBy: row?.clearedBy ?? null,
          evidence: (row?.evidence as Record<string, unknown> | null | undefined) ?? null,
          note: row?.note ?? null,
          reopenedAt: row?.reopenedAt?.toISOString() ?? null,
          reopenedAtHijri: row?.reopenedAtHijri ?? null,
          reopenedBy: row?.reopenedBy ?? null,
          reopenReason: row?.reopenReason ?? null,
          checklist: [...OPERATING_MODEL_GATE_CHECKLIST[gate]],
          unmetPrerequisites: [...unmetGatePrerequisites(gate, facts)],
          orderRefusal:
            status === 'CLEARED'
              ? reopenOrderRefusal(gateRows, gate)
              : clearOrderRefusal(gateRows, gate),
          blocks: GATED_ACTIVITIES.filter((activity) => GATE_BLOCKING[activity] === gate),
        };
      }),
      blocked: GATED_ACTIVITIES.map((activity) => ({
        activity,
        by: downstreamBlock(gateRows, activity)?.gate ?? null,
      })),
    };
  }),

  clearGate: makerProcedure('endowment:waqf:write')
    .input(
      z.object({
        gate: gateInput,
        /** The operating model's checklist, attested item by item — every item of this gate must be `true`. */
        attestation: z.record(z.string().min(1).max(64), z.boolean()),
        note: z.string().max(2048).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const rows = await readOnboardingGates(ctx);
      const current = rows.find((row) => row.gate === input.gate);
      if (current?.status === 'CLEARED') {
        throw new ApiError(
          'APPROVAL_STALE',
          `onboarding ${input.gate} on waqf ${ctx.waqfId} is already CLEARED.`,
          { waqfId: ctx.waqfId, gate: input.gate, reason: 'GATE_ALREADY_CLEARED' },
        );
      }
      const order = clearOrderRefusal(rows, input.gate);
      if (order !== null) {
        throw new ApiError(
          'ONBOARDING_GATE_NOT_CLEARED',
          `onboarding ${input.gate} cannot be cleared on waqf ${ctx.waqfId}: ${order} — the handover ` +
            `gates are SEQUENCED (BR-1101). Clear the prior gate first; nothing was written.`,
          { waqfId: ctx.waqfId, gate: input.gate, reason: order },
        );
      }
      const unmet = unmetGatePrerequisites(input.gate, await prerequisiteFacts(ctx));
      if (unmet.length > 0) {
        throw new ApiError(
          'ONBOARDING_GATE_NOT_CLEARED',
          `onboarding ${input.gate} cannot be cleared on waqf ${ctx.waqfId}: the record does not yet ` +
            `carry ${unmet.join(', ')}. A gate is cleared over FACTS, not over an attestation that they ` +
            `exist; nothing was written.`,
          {
            waqfId: ctx.waqfId,
            gate: input.gate,
            reason: 'PREREQUISITES_UNMET',
            unmet: [...unmet],
          },
        );
      }
      const unattested = unattestedChecklistItems(input.gate, input.attestation);
      if (unattested.length > 0) {
        throw new ApiError(
          'ONBOARDING_GATE_NOT_CLEARED',
          `onboarding ${input.gate} cannot be cleared on waqf ${ctx.waqfId}: the clearer has not attested ` +
            `${unattested.join(', ')} (the operating model's checklist for this gate). Nothing was written.`,
          {
            waqfId: ctx.waqfId,
            gate: input.gate,
            reason: 'CHECKLIST_UNATTESTED',
            unattested: [...unattested],
          },
        );
      }

      const clearedAt = ctx.now;
      const clearedAtHijri = String(toHijriSnapshot(clearedAt));
      const evidence = Object.fromEntries(
        OPERATING_MODEL_GATE_CHECKLIST[input.gate].map((item) => [item, true as const]),
      );

      return auditedWrite(ctx.db, async (tx) => {
        const data = {
          status: 'CLEARED' as const,
          clearedAt,
          clearedAtHijri,
          clearedBy: ctx.actor.actorId ?? '',
          evidence,
          ...(input.note !== undefined ? { note: input.note } : {}),
          // A re-clearance after a reopen wipes the reopen record (CHECK: a CLEARED gate carries none).
          reopenedAt: null,
          reopenedAtHijri: null,
          reopenedBy: null,
          reopenReason: null,
        };
        const row =
          current === undefined
            ? await tx.onboardingGate.create({
                data: {
                  waqfId: ctx.waqfId,
                  gate: input.gate as never,
                  ...data,
                  createdBy: ctx.actor.actorId,
                },
              })
            : await tx.onboardingGate.update({
                where: { id: current.id },
                data,
              });

        await recordEvent(toActorContext(ctx, { procedure: 'onboarding.clearGate' }), {
          action: 'UPDATE',
          category: 'MUTATION',
          classification: 'SENSITIVE',
          entityType: 'OnboardingGate',
          entityId: row.id,
          waqfId: ctx.waqfId,
          extraContext: {
            gate: input.gate,
            transition: current === undefined ? 'RECORDED_AND_CLEARED' : 'CLEARED',
            clearedAtHijri,
            checklist: OPERATING_MODEL_GATE_CHECKLIST[input.gate],
            unblocks: GATED_ACTIVITIES.filter((activity) => GATE_BLOCKING[activity] === input.gate),
          },
        });

        return {
          gate: input.gate,
          status: 'CLEARED' as const,
          clearedAt: clearedAt.toISOString(),
          clearedAtHijri,
          unblocks: GATED_ACTIVITIES.filter((activity) => GATE_BLOCKING[activity] === input.gate),
        };
      });
    }),

  reopenGate: makerProcedure('endowment:waqf:write')
    .input(z.object({ gate: gateInput, reason: z.string().min(1).max(2048) }))
    .mutation(async ({ ctx, input }) => {
      // Owner ruling 2026-09-08, verbatim "nazir can reopen": the ACTING grant, not a role held elsewhere.
      if (ctx.grant.role !== 'NAZIR') {
        throw new ApiError(
          'PERMISSION_DENIED',
          `onboarding.reopenGate: only the Nazir may reopen a cleared gate (owner ruling 2026-09-08); ` +
            `the acting grant on waqf ${ctx.waqfId} is ${ctx.grant.role}.`,
          { waqfId: ctx.waqfId, gate: input.gate, reason: 'NAZIR_ONLY' },
        );
      }
      const rows = await readOnboardingGates(ctx);
      const current = rows.find((row) => row.gate === input.gate);
      if (current === undefined || current.status !== 'CLEARED') {
        throw new ApiError(
          'APPROVAL_STALE',
          `onboarding ${input.gate} on waqf ${ctx.waqfId} is not CLEARED, so there is nothing to reopen.`,
          { waqfId: ctx.waqfId, gate: input.gate, reason: 'GATE_NOT_CLEARED_TO_REOPEN' },
        );
      }
      const order = reopenOrderRefusal(rows, input.gate);
      if (order !== null) {
        throw new ApiError(
          'ONBOARDING_GATE_NOT_CLEARED',
          `onboarding ${input.gate} cannot be reopened on waqf ${ctx.waqfId}: ${order} — reopen the later ` +
            `gate first (the order holds in both directions). Nothing was written.`,
          { waqfId: ctx.waqfId, gate: input.gate, reason: order },
        );
      }

      const reopenedAt = ctx.now;
      const reopenedAtHijri = String(toHijriSnapshot(reopenedAt));
      return auditedWrite(ctx.db, async (tx) => {
        const row = await tx.onboardingGate.update({
          where: { id: current.id },
          data: {
            status: 'OPEN',
            clearedAt: null,
            clearedAtHijri: null,
            clearedBy: null,
            // ⚠ NOT `evidence: null` — Prisma's typed null is `Prisma.DbNull`; the attestation is left
            // in place as the record of what WAS attested, and the reopen record says it was undone.
            reopenedAt,
            reopenedAtHijri,
            reopenedBy: ctx.actor.actorId ?? '',
            reopenReason: input.reason,
          },
        });
        await recordEvent(toActorContext(ctx, { procedure: 'onboarding.reopenGate' }), {
          action: 'UPDATE',
          category: 'MUTATION',
          classification: 'SENSITIVE',
          entityType: 'OnboardingGate',
          entityId: row.id,
          waqfId: ctx.waqfId,
          extraContext: {
            gate: input.gate,
            transition: 'REOPENED',
            reason: input.reason,
            reopenedAtHijri,
            role: ctx.grant.role,
            blocks: GATED_ACTIVITIES.filter((activity) => GATE_BLOCKING[activity] === input.gate),
          },
        });
        return {
          gate: input.gate,
          status: 'OPEN' as const,
          reopenedAt: reopenedAt.toISOString(),
          reopenedAtHijri,
          blocks: GATED_ACTIVITIES.filter((activity) => GATE_BLOCKING[activity] === input.gate),
        };
      });
    }),

  /**
   * ⊕ S12-3b · which clients this caller may REGISTER an endowment for, with their founders and
   * existing endowments — the intake form's choices. Computed from the caller's own grants and the
   * force-filtered tree, so nobody learns of a family they hold nothing on.
   */
  intakeAuthority: authedProcedure.query(async ({ ctx }) => {
    const capable = intakeCapableWaqfIds(ctx);
    if (capable.length === 0) return { clients: [] };
    const waqfs = await ctx.db.waqf.findMany({
      where: { id: { in: [...capable] }, deletedAt: null },
      select: {
        id: true,
        waqif: {
          select: { id: true, client: { select: { id: true, nameAr: true, nameEn: true } } },
        },
      },
    });
    const clientIds = [...new Set(waqfs.map((row) => row.waqif.client.id))].sort();
    const founders = await ctx.db.waqif.findMany({
      where: { clientId: { in: clientIds }, deletedAt: null },
      select: { id: true, clientId: true, nameAr: true, nameEn: true },
      orderBy: { id: 'asc' },
    });
    const clients = clientIds.map((clientId) => {
      const anyRow = waqfs.find((row) => row.waqif.client.id === clientId);
      return {
        id: clientId,
        nameAr: anyRow?.waqif.client.nameAr ?? clientId,
        nameEn: anyRow?.waqif.client.nameEn ?? null,
        siblingWaqfIds: waqfs
          .filter((row) => row.waqif.client.id === clientId)
          .map((row) => row.id)
          .sort(),
        waqifs: founders
          .filter((founder) => founder.clientId === clientId)
          .map((founder) => ({ id: founder.id, nameAr: founder.nameAr, nameEn: founder.nameEn })),
      };
    });
    return { clients };
  }),

  /**
   * ⊕ S12-3b · REGISTER an endowment. Refused BEFORE any write when the caller holds no sibling
   * authority on the client, when the Nazir's e-mail names no active user, and (under fixture-only)
   * when an identifier breaks the fixture grammar. The birth itself runs on the provisioning
   * connection in one audited transaction (`intakeEndowment`), where the database re-proves it.
   */
  intake: authedProcedure.input(intakeInput).mutation(async ({ ctx, input }) => {
    const capable = new Set(intakeCapableWaqfIds(ctx));
    const siblings = await ctx.db.waqf.findMany({
      where: { id: { in: [...capable] }, deletedAt: null, waqif: { clientId: input.clientId } },
      select: { id: true },
    });
    if (siblings.length === 0) {
      throw new ApiError(
        'ENDOWMENT_INTAKE_NOT_AUTHORISED',
        `registering an endowment for client ${input.clientId} needs both "${INTAKE_RECORD_VERB}" and ` +
          `"${INTAKE_MATRIX_VERB}" on one of that client's existing endowments; this caller holds them on none.`,
        { clientId: input.clientId, required: [INTAKE_RECORD_VERB, INTAKE_MATRIX_VERB] },
      );
    }

    const nazirUser = await ctx.db.user.findFirst({
      where: { email: input.nazirEmail, isActive: true },
      select: { id: true, email: true },
    });
    if (nazirUser === null) {
      throw new ApiError(
        'PERMISSION_DENIED',
        `no active user carries the e-mail given for the Nazir.`,
        {
          reason: 'NAZIR_USER_NOT_FOUND',
        },
      );
    }
    if (nazirUser.id === ctx.actor.actorId) {
      throw new ApiError(
        'SEGREGATION_OF_DUTIES',
        'the registrar may not seat themselves as the Nazir.',
        {
          reason: 'SELF_ISSUE',
        },
      );
    }

    const request: EndowmentIntakeInput = {
      clientId: input.clientId,
      waqif:
        'existingId' in input.waqif
          ? { existingId: input.waqif.existingId }
          : { nameAr: input.waqif.nameAr, nameEn: input.waqif.nameEn ?? null },
      certificateNumber: input.certificateNumber,
      deedNumber: input.deedNumber,
      type: input.type,
      nature: input.nature,
      entitlementOrder: input.entitlementOrder,
      shartNarrativeAr: input.shartNarrativeAr,
      shartSourceDocumentId: input.shartSourceDocumentId ?? null,
      fiscalYearEnd: input.fiscalYearEnd,
      registrationDate: input.registrationDate,
      trusteeship: input.trusteeship,
      nazir: { userId: nazirUser.id, email: nazirUser.email },
      now: new Date(),
    };

    try {
      assertFixtureGrammar(request);
    } catch (error: unknown) {
      if (error instanceof FixtureOnlyIdentifierRefusedError) {
        throw new ApiError('FIXTURE_ONLY_IDENTIFIER_REFUSED', error.message, {
          field: error.field,
        });
      }
      throw error;
    }

    const born = await intakeEndowment(
      toActorContext(ctx, { procedure: 'onboarding.intake' }),
      request,
    );
    return {
      waqfId: born.waqfId,
      waqifId: born.waqifId,
      waqifCreated: born.waqifCreated,
      gates: 'ALL_OPEN' as const,
      nazirGrantId: born.nazirGrantId,
    };
  }),
});
