/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE INTAKE DOOR — how an endowment is BORN from the request path (S12-3b · BR-1101 · owner
 * ruling 2026-09-08 "build ui intake")
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * Since migration 53 the runtime role (`qmulate_app`) holds NO INSERT on `waqf` or `waqif`. A birth
 * runs here, on the PROVISIONING connection (`ACCESS_MATRIX_DATABASE_URL`), in ONE audited
 * transaction: the founder row (new or existing) → the endowment (`NOT_CLASSIFIED`, the Shart
 * captured ONCE as stated, its completeness INCOMPLETE and said so) → the trusteeship deed (the
 * appointment facts and the four eligibility flags, UNVERIFIED — `deed.upsert` verifies later) →
 * the three onboarding gates OPEN → the first NAZIR seat → an explicit INTAKE event. The database
 * re-proves every step: `waqf_birth_admission` reads the marker this transaction appended and
 * demands SIBLING-ENDOWMENT AUTHORITY (both verbs, established, same client) of its actor;
 * `waqf_access_grant_admission` admits the first seat only because the endowment was born in this
 * very transaction by that same actor.
 *
 * WHAT IS REFUSED BEFORE THE TRANSACTION OPENS, by name:
 *   · under `DATA_CLASSIFICATION=fixture-only` (every environment that exists today — no KSA-resident
 *     production exists), an identifier outside the FIXTURE GRAMMAR: a certificate or deed number
 *     not prefixed `FAKE-`, a Nazir e-mail outside `@example.test`. Real identifiers cannot be typed
 *     into a non-KSA environment through the UI (G-8 layer 3-bis). Under `production` the grammar
 *     check is OFF — and S12-4's residency guard is what refuses `production` outside KSA.
 *
 * This function trusts its caller's context exactly as much as `provisionAccessGrant()` does: the
 * api resolves the caller's grants and passes the actor; the trigger is the layer that checks.
 */

import { randomUUID } from 'node:crypto';

import { toHijriSnapshot } from '@qmulate/domain/dates';
import { ROLE_PRESETS } from '@qmulate/domain';

import {
  createAccessMatrixPrismaClientInternal,
  hasConnectionCredential,
  MissingConnectionCredentialError,
  recordEvent,
  withAudit,
} from './client.js';
import { isFixtureOnly } from './context.js';
import { currentAuditTransaction } from './extensions/audit.js';
import { FIXTURE_EMAIL_DOMAIN, FIXTURE_EXTERNAL_REF_PATTERN } from './seed/fixture-schema.js';
import { computeCompleteness, shartAlWaqifSchema, type ShartAlWaqif } from './seed/shart.js';

import type { RequestContext } from './context.js';

export class IntakeNestedTransactionError extends Error {
  readonly code = 'INTAKE_NESTED_TRANSACTION';
  constructor() {
    super(
      'intakeEndowment() was called INSIDE an open audited transaction. It runs on the provisioning ' +
        'connection, so it cannot join that transaction: the birth would commit independently and ' +
        'SURVIVE a rollback of the enclosing block.',
    );
    this.name = 'IntakeNestedTransactionError';
  }
}

/** Thrown BEFORE the transaction opens when an identifier breaks the fixture grammar under fixture-only. */
export class FixtureOnlyIdentifierRefusedError extends Error {
  readonly code = 'FIXTURE_ONLY_IDENTIFIER_REFUSED';
  constructor(readonly field: string) {
    super(
      `intakeEndowment(): "${field}" does not follow the FIXTURE GRAMMAR (external references are ` +
        `prefixed "FAKE-", e-mails end "${FIXTURE_EMAIL_DOMAIN}") and this process runs under ` +
        `DATA_CLASSIFICATION=fixture-only. Real identifiers never enter a non-KSA environment (NFR-03, ` +
        `G-8). Nothing was written.`,
    );
    this.name = 'FixtureOnlyIdentifierRefusedError';
  }
}

export const INTAKE_WAQF_TYPES = ['PUBLIC_CHARITABLE', 'FAMILY_DHURRI'] as const;
export const INTAKE_WAQF_NATURES = ['AYNI', 'QIYAMI'] as const;
export const INTAKE_ENTITLEMENT_ORDERS = [
  'LINEAGE_CONTINUATION',
  'ORDERED',
  'SHARED',
  'NA_DIRECT_USE',
] as const;

export interface EndowmentIntakeInput {
  /** Harness/test affordance only — the api never passes one. */
  readonly id?: string;
  readonly clientId: string;
  /** An existing founder of that client, OR a new founder to record. */
  readonly waqif:
    { readonly existingId: string } | { readonly nameAr: string; readonly nameEn?: string | null };
  readonly certificateNumber: string;
  readonly deedNumber: string;
  readonly type: (typeof INTAKE_WAQF_TYPES)[number];
  readonly nature: (typeof INTAKE_WAQF_NATURES)[number];
  readonly entitlementOrder: (typeof INTAKE_ENTITLEMENT_ORDERS)[number];
  /** The founder's conditions AS STATED in the deed — captured once, never edited (Binding rule 1). */
  readonly shartNarrativeAr: string;
  readonly shartSourceDocumentId?: string | null;
  /** `MM-DD`. */
  readonly fiscalYearEnd: string;
  /** `YYYY-MM-DD` — the certificate's registration date; its Hijri twin is computed here. */
  readonly registrationDate: string;
  readonly trusteeship: {
    readonly primaryNazir: string;
    /** `YYYY-MM-DD`. */
    readonly primaryAppointedDate: string;
    readonly jointlyLiable: boolean;
    readonly islam: boolean;
    readonly legalCapacity: boolean;
    readonly noDisqualifyingRemoval: boolean;
    readonly ksaResident: boolean;
  };
  /** The user seated as the endowment's first NAZIR, resolved by the api from an e-mail. */
  readonly nazir: { readonly userId: string; readonly email: string };
  readonly now: Date;
}

export interface EndowmentIntakeResult {
  readonly waqfId: string;
  readonly waqifId: string;
  readonly waqifCreated: boolean;
  readonly trusteeshipDeedId: string;
  readonly gateIds: readonly string[];
  readonly nazirGrantId: string;
}

function assertCredentialPresent(): void {
  if (!hasConnectionCredential('provisioner')) {
    const cause = new MissingConnectionCredentialError('provisioner');
    throw new Error(`intakeEndowment() cannot run. ${cause.message}`, { cause });
  }
}

/** The fixture grammar, enforced under fixture-only. Exported so the api can say the same sentence first. */
export function assertFixtureGrammar(input: EndowmentIntakeInput): void {
  if (!isFixtureOnly()) return;
  if (!FIXTURE_EXTERNAL_REF_PATTERN.test(input.certificateNumber)) {
    throw new FixtureOnlyIdentifierRefusedError('certificateNumber');
  }
  if (!FIXTURE_EXTERNAL_REF_PATTERN.test(input.deedNumber)) {
    throw new FixtureOnlyIdentifierRefusedError('deedNumber');
  }
  if (!input.nazir.email.toLowerCase().endsWith(FIXTURE_EMAIL_DOMAIN)) {
    throw new FixtureOnlyIdentifierRefusedError('nazir.email');
  }
}

/**
 * The Shart al-Waqif an intake writes: the narrative AS STATED, the deed's order and continuation
 * term, and NOTHING invented — every other clause is `unspecified`/`unread`/`UNSPECIFIED`, so
 * `completeness` comes out INCOMPLETE and the distribution engine halts on it (Binding rule 1: the
 * engine never guesses the founder's intent; the deed-terms path records what the deed says).
 */
export function intakeShart(input: EndowmentIntakeInput): ShartAlWaqif {
  const draft: Omit<ShartAlWaqif, 'completeness'> = {
    schemaVersion: 1,
    sourceDocumentId: input.shartSourceDocumentId ?? null,
    narrativeAr: input.shartNarrativeAr,
    narrativeEn: null,
    orderRule: input.entitlementOrder,
    // A DEED TERM, recorded by the SIGNER through `endowment.recordDeedTerms` — never at intake
    // (the Waqf write policy demands `endowment:deed:sign` for it; absent HALTS the engine, by design).
    continuationStipulation: null,
    reversion: { status: 'unread' },
    tiers: [],
    maintenanceReserve: { kind: 'unspecified' },
    disbursementChannel: {
      kind: input.entitlementOrder === 'NA_DIRECT_USE' ? 'DIRECT_USE' : 'UNSPECIFIED',
      familySharePercent: null,
      charitableSharePercent: null,
      charitablePurposeAr: null,
    },
    disbursementSchedule: 'UNSPECIFIED',
    nazirFee: { basis: 'UNSPECIFIED', ratePercent: null, amountSar: null },
    nazarahSuccession: { specified: false, ruleAr: null },
  };
  return shartAlWaqifSchema.parse({ ...draft, completeness: computeCompleteness(draft) });
}

const GATES = [
  'GATE_01_AUTHORITY_LEGAL',
  'GATE_02_SYSTEMS_CONTROLS',
  'GATE_03_PEOPLE_PROPERTY_CADENCE',
] as const;

/**
 * Births one endowment on the provisioning connection, in one audited transaction.
 *
 * `ctx` is the intaking actor's request context (grants resolved by the api). The new endowment's id
 * is added to `authorizedWaqfIds` for the duration of the transaction so the scoping extension's
 * child-row checks (deed, gates, seat) accept rows hanging off an endowment that did not exist when
 * the context was built — the database, not that list, is what decides whether the birth stands.
 */
export async function intakeEndowment(
  ctx: RequestContext,
  input: EndowmentIntakeInput,
): Promise<EndowmentIntakeResult> {
  assertCredentialPresent();
  if (currentAuditTransaction() !== null) throw new IntakeNestedTransactionError();
  assertFixtureGrammar(input);
  if (ctx.actorId === null || ctx.actorId === '') {
    throw new Error(
      'intakeEndowment(): the intaking actor must be a person (actorId is required).',
    );
  }

  const waqfId = input.id ?? randomUUID();
  const intakeCtx: RequestContext = {
    ...ctx,
    authorizedWaqfIds: [...new Set([...ctx.authorizedWaqfIds, waqfId])],
  };
  const db = createAccessMatrixPrismaClientInternal(intakeCtx);

  const registrationDate = new Date(`${input.registrationDate}T00:00:00.000Z`);
  const appointedDate = new Date(`${input.trusteeship.primaryAppointedDate}T00:00:00.000Z`);
  const nowHijri = String(toHijriSnapshot(input.now));
  const shart = intakeShart(input);
  const nazirPermissions = [...ROLE_PRESETS.nazir];

  return withAudit(db, async (tx) => {
    let waqifId: string;
    let waqifCreated = false;
    if ('existingId' in input.waqif) {
      const existing = await tx.waqif.findFirst({
        where: { id: input.waqif.existingId, clientId: input.clientId, deletedAt: null },
        select: { id: true },
      });
      if (existing === null) {
        throw new Error(
          `intakeEndowment(): founder ${input.waqif.existingId} is not a founder of client ${input.clientId} visible to this caller.`,
        );
      }
      waqifId = existing.id;
    } else {
      const created = await tx.waqif.create({
        data: {
          clientId: input.clientId,
          nameAr: input.waqif.nameAr,
          nameEn: input.waqif.nameEn ?? null,
          createdBy: ctx.actorId,
        },
        select: { id: true },
      });
      waqifId = created.id;
      waqifCreated = true;
    }

    // THE BIRTH. `createdBy` is bound to the actor — `waqf_birth_admission` checks it against the
    // marker. The Shart is written ONCE, here, and the write-once trigger seals it from now on.
    const waqf = await tx.waqf.create({
      data: {
        id: waqfId,
        waqifId,
        certificateNumber: input.certificateNumber,
        deedNumber: input.deedNumber,
        classification: 'NOT_CLASSIFIED',
        type: input.type as never,
        nature: input.nature as never,
        entitlementOrder: input.entitlementOrder as never,
        shartAlWaqif: shart as never,
        shartAlWaqifVersion: 1,
        shartAlWaqifSetAt: input.now,
        shartAlWaqifSetAtHijri: nowHijri,
        // STATED, never defaulted (e3-lineage-reversion pins the column default-free): `false` = the مآل
        // clause is UNREAD, which is every endowment's state at birth. The Waqf write policy judges this
        // one sentinel on CREATE by the record verb; recording `true` stays the signer's act.
        reversionClauseCaptured: false,
        directUtilization: null,
        fiscalYearEnd: input.fiscalYearEnd,
        registrationDate,
        registrationDateHijri: String(toHijriSnapshot(registrationDate)),
        createdBy: ctx.actorId,
      },
      select: { id: true },
    });

    const deed = await tx.trusteeshipDeed.create({
      data: {
        waqfId: waqf.id,
        primaryNazir: input.trusteeship.primaryNazir,
        primaryAppointedDate: appointedDate,
        primaryAppointedDateHijri: String(toHijriSnapshot(appointedDate)),
        jointlyLiable: input.trusteeship.jointlyLiable,
        islam: input.trusteeship.islam,
        legalCapacity: input.trusteeship.legalCapacity,
        noDisqualifyingRemoval: input.trusteeship.noDisqualifyingRemoval,
        ksaResident: input.trusteeship.ksaResident,
        createdBy: ctx.actorId,
      },
      select: { id: true },
    });

    const gateIds: string[] = [];
    for (const gate of GATES) {
      const row = await tx.onboardingGate.create({
        data: { waqfId: waqf.id, gate: gate as never, status: 'OPEN', createdBy: ctx.actorId },
        select: { id: true },
      });
      gateIds.push(row.id);
    }

    // THE FIRST SEAT, in the birth transaction. `grantedByUserId` is the session (never the
    // payload); the intaking admin cannot seat themselves (`waqf_access_grant_no_self_issue`).
    const grant = await tx.waqfAccessGrant.create({
      data: {
        userId: input.nazir.userId,
        waqfId: waqf.id,
        role: 'NAZIR',
        permissions: nazirPermissions,
        dataScopes: [],
        amlCompartment: false,
        canViewAmlRestricted: false,
        beneficiarySelfId: null,
        scopeRefs: [],
        grantedByUserId: ctx.actorId ?? '',
        validFrom: input.now,
        validUntil: null,
        revokedAt: null,
        createdBy: ctx.actorId,
      },
      select: { id: true },
    });

    // A SECOND event beside the extension's own CREATE (as `deed.upsert` writes one): the extension's
    // after-image cannot say WHY the row exists. `AuditAction` has no INTAKE member and is not widened
    // here (its first widening owed ar/en statement copy — see audit-action-vocabulary); `kind` says it.
    await recordEvent(intakeCtx, {
      action: 'CREATE',
      category: 'MUTATION',
      classification: 'SENSITIVE',
      entityType: 'Waqf',
      entityId: waqf.id,
      waqfId: waqf.id,
      extraContext: {
        kind: 'INTAKE',
        procedure: 'onboarding.intake',
        clientId: input.clientId,
        waqifId,
        waqifCreated,
        certificateNumber: input.certificateNumber,
        deedNumber: input.deedNumber,
        classification: 'NOT_CLASSIFIED',
        shartCompleteness: shart.completeness,
        gates: 'ALL_OPEN',
        firstNazirUserId: input.nazir.userId,
        // ⚠ The four eligibility flags are recorded as STATED at intake and UNVERIFIED against primary
        // Saudi law; `deed.upsert` is where the assessment is recorded (its own event, its own caveat).
        eligibilityFlagsVerified: false,
        dataClassification: isFixtureOnly() ? 'fixture-only' : 'production',
      },
    });

    return {
      waqfId: waqf.id,
      waqifId,
      waqifCreated,
      trusteeshipDeedId: deed.id,
      gateIds,
      nazirGrantId: grant.id,
    };
  });
}
