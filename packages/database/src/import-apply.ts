/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FIRST-CLIENT IMPORTER — what it WRITES, once the layer-3 guard has admitted the target
 * (S12-4 · BR-1106 · V-12 · G-8)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * The contract is the fixture's OWN SHAPE (`fixtureSchema`), minus the fixture-marker demands and
 * plus two collections the fixture does not carry: `documents` (vault METADATA rows — the object
 * upload itself stays E9's path) and an optional `bootstrapAdmin` (the first access-matrix seat,
 * which by construction no ordinary rule can authorise — ADR-0008 Q4: production bootstrap is a
 * human, and this is the owner-credential path S12 Q7 names for a brand-new client).
 *
 * WHAT IS IMPORTED (BR-1106: "endowments, beneficiaries, documents, financials"):
 *   clients · waqifs · waqfs (+ trusteeship deeds, reversion takers, THREE GATES OPEN) · assets ·
 *   expropriations · beneficiaries · bank accounts · transactions (revenue + expenses) · nazir fees ·
 *   government filing statuses · documents (metadata) · optionally the bootstrap admin seat.
 *
 * WHAT IS DELIBERATELY NOT IMPORTED, and why:
 *   · distribution runs — a run is the ENGINE's computed artefact over the corpus/income record, not
 *     a record to be transcribed; a historical payout is recorded as transactions, and the engine
 *     recomputes (binding rule 1: the engine never inherits a number it did not compute);
 *   · compliance tasks / obligations — the compliance engine instantiates them per endowment on the
 *     recorded facts (E7);
 *   · settings, users, approvals, memberships — configuration and authority are the operator's acts
 *     through their own governed paths, not an import's.
 *
 * ONBOARDING GATES ARE BORN OPEN, WHATEVER THE SOURCE SAYS. A gate clearance is an in-product act
 * with an attestation and an actor (BR-1101); a spreadsheet cannot attest it. The source's
 * `onboarding` block, if present, is ignored and said so in the report.
 *
 * EVERY WRITE IS AN AUDITED UPSERT on the OWNER connection, in ONE transaction per run, attributed to
 * the SYSTEM actor `import:<runId>` with the run id in every event's reason — so an import is
 * repeatable (idempotent on ids) and every row it laid down is traceable to the run that laid it.
 * The owner connection is the bootstrap: `waqf_birth_admission` exempts it by `current_user`
 * (migration 53), which is exactly the Q7 answer — the first endowment of a brand-new client is
 * born here, by a human holding the owner credential, on a KSA-resident production target.
 */

import { z } from 'zod';

import { fixtureSchema, type Fixture } from './seed/fixture-schema.js';
import {
  deriveBankAccounts,
  deriveReversionTakers,
  mapAsset,
  mapBeneficiary,
  mapExpense,
  mapExpropriation,
  mapGovernmentFiling,
  mapNazirFee,
  mapRevenue,
  mapTrusteeship,
  mapWaqf,
} from './seed/map.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a YYYY-MM-DD calendar date');

/** Vault METADATA for a document already stored (E9's upload path owns the bytes). */
const documentSchema = z
  .object({
    id: z.string().min(1),
    waqfId: z.string().min(1),
    beneficiaryId: z.string().min(1).nullable().default(null),
    type: z.string().min(1),
    titleAr: z.string().min(1),
    titleEn: z.string().min(1).nullable().default(null),
    storageKey: z.string().min(1),
    sha256: z.string().regex(/^[0-9a-f]{64}$/i, 'expected a hex SHA-256'),
    confidentiality: z.enum(['NORMAL', 'SENSITIVE', 'SENSITIVE_PII']).default('NORMAL'),
    retentionUntil: isoDate,
    legalHold: z.boolean().default(false),
  })
  .strict();

/**
 * The import source: the fixture's shape with the marker demand dropped (`_readme` optional — its
 * PRESENCE with the fictional marker is what `assertNoFictionalMarker` refuses), the per-endowment
 * `onboarding` block optional (ignored), plus `documents` and `bootstrapAdmin`.
 */
const arabic = z.string().min(1);

export const importSourceSchema = fixtureSchema
  .extend({
    _readme: z.string().optional(),
    // ⚠ THE SEED DERIVES THESE FROM FIXTURE-ONLY TABLES (`map.ts`: CLIENT_NAME_AR, WAQIF_NAME_AR,
    // ADDRESS_AR, AUTHORITY_AR, BANK_NAME_AR — translations of names that were ALREADY invented). A
    // real source has no such table and must STATE its Arabic; the mappers' derived value is
    // overridden below, never consulted.
    clients: z.array(fixtureSchema.shape.clients.element.extend({ nameAr: arabic })),
    waqifs: z.array(fixtureSchema.shape.waqifs.element.extend({ nameAr: arabic })),
    assets: z.array(fixtureSchema.shape.assets.element.extend({ addressAr: arabic })),
    expropriations: z.array(
      fixtureSchema.shape.expropriations.element.extend({ authorityAr: arabic }),
    ),
    /** EVERY account the source references (explicitly or from a transaction) must be listed WITH its bank. */
    bankAccounts: z.array(
      z
        .object({
          ref: z.string(),
          waqfId: z.string(),
          bankNameAr: arabic,
          _note: z.string().optional(),
        })
        .strict(),
    ),
    waqfs: z.array(
      fixtureSchema.shape.waqfs.element.extend({
        onboarding: fixtureSchema.shape.waqfs.element.shape.onboarding.optional(),
      }),
    ),
    documents: z.array(documentSchema).default([]),
    /**
     * The first access-matrix seat on every imported endowment: a `SYSTEM_ADMIN` grant carrying the
     * two verbs a registrar needs (migration 53's sibling authority) so the client's later endowments
     * can be registered through the UI. The user must already exist (a staff account). Optional: an
     * import into a client that already has seats needs none.
     */
    bootstrapAdmin: z
      .object({ userId: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();

export type ImportSource = z.infer<typeof importSourceSchema>;

export function parseImportSource(raw: unknown): ImportSource {
  return importSourceSchema.parse(raw);
}

export interface ImportPlan {
  readonly counts: Readonly<Record<string, number>>;
  readonly ignoredOnboardingBlocks: number;
  readonly bootstrapAdmin: string | null;
}

/** The dry-run report: what WOULD be written. No database is touched. */
export function planImport(source: ImportSource): ImportPlan {
  return {
    counts: {
      Client: source.clients.length,
      Waqif: source.waqifs.length,
      Waqf: source.waqfs.length,
      TrusteeshipDeed: source.waqfs.length,
      OnboardingGate: source.waqfs.length * 3,
      WaqfReversionTaker: deriveReversionTakers(asFixture(source)).length,
      Asset: source.assets.length,
      Expropriation: source.expropriations.length,
      Beneficiary: source.beneficiaries.length,
      BankAccount: deriveBankAccounts(asFixture(source)).length,
      Transaction:
        source.financialTransactions.revenue.length + source.financialTransactions.expenses.length,
      NazirFee: source.nazirFees.length,
      GovernmentFiling: source.governmentFilingStatus.length,
      Document: source.documents.length,
      WaqfAccessGrant: source.bootstrapAdmin === undefined ? 0 : source.waqfs.length,
    },
    ignoredOnboardingBlocks: source.waqfs.filter((waqf) => waqf.onboarding !== undefined).length,
    bootstrapAdmin: source.bootstrapAdmin?.userId ?? null,
  };
}

/** The mappers take the fixture type; a source is one with the onboarding block made irrelevant. */
function asFixture(source: ImportSource): Fixture {
  const gate = { cleared: null };
  return {
    ...source,
    _readme: source._readme ?? '',
    waqfs: source.waqfs.map((waqf) => ({
      ...waqf,
      onboarding: { gate01: gate, gate02: gate, gate03: gate },
    })),
    bankAccounts: source.bankAccounts.map(({ ref, waqfId }) => ({ ref, waqfId })),
  } as unknown as Fixture;
}

const GATES = [
  'GATE_01_AUTHORITY_LEGAL',
  'GATE_02_SYSTEMS_CONTROLS',
  'GATE_03_PEOPLE_PROPERTY_CADENCE',
] as const;

const BOOTSTRAP_ADMIN_PERMISSIONS = [
  'admin:access_matrix:read',
  'admin:access_matrix:write',
  'endowment:waqf:read',
  'endowment:waqf:write',
  'audit:event:read',
] as const;

export interface ApplyImportOptions {
  readonly runId: string;
  readonly now: Date;
}

export interface ApplyImportResult {
  readonly runId: string;
  readonly actorId: string;
  readonly written: Readonly<Record<string, number>>;
}

function jsonValue(value: unknown): never {
  return value as never;
}
function withDerivedHmac(data: unknown): never {
  return data as never;
}

/**
 * APPLY. Called by the CLI AFTER the layer-3 guard, and by the integration test directly (the seam
 * the CLI never exposes — the test says so). Every database module is imported HERE, dynamically,
 * so nothing in this file's static import graph opens a connection.
 */
export async function applyImport(
  source: ImportSource,
  options: ApplyImportOptions,
): Promise<ApplyImportResult> {
  const { makeSystemContext } = await import('./context.js');
  const { runAuditedTransaction } = await import('./extensions/audit.js');
  const { createPrivilegedPrismaClient, getPrivilegedBasePrismaClient } =
    await import('./client.js');
  const { withAccessMatrixBootstrap } = await import('./access-matrix-bootstrap.js');
  const { toHijriSnapshot } = await import('@qmulate/domain/dates');

  const fixture = asFixture(source);
  const actorId = `import:${options.runId}`;
  const waqfIds = source.waqfs.map((waqf) => waqf.id);
  const actor = makeSystemContext({
    actorId,
    authorizedWaqfIds: waqfIds,
    requestId: `import-${options.runId}`,
    reason: `first-client import run ${options.runId} (BR-1106)`,
  });
  const base = getPrivilegedBasePrismaClient();
  const db = createPrivilegedPrismaClient(actor);

  const written: Record<string, number> = {};
  const step = async <T>(model: string, run: () => Promise<T>): Promise<T> => {
    written[model] = (written[model] ?? 0) + 1;
    return run();
  };

  if (source.bootstrapAdmin !== undefined) {
    const user = await base.user.findUnique({
      where: { id: source.bootstrapAdmin.userId },
      select: { id: true, isActive: true },
    });
    if (user === null || !user.isActive) {
      throw new Error(
        `IMPORT_REFUSED: bootstrapAdmin.userId "${source.bootstrapAdmin.userId}" names no ACTIVE user. ` +
          'The first seat goes to an existing staff account; the importer creates no identities.',
      );
    }
  }

  await runAuditedTransaction(base, actor, async (auditTx) => {
    for (const client of source.clients) {
      const data = { nameAr: client.nameAr, nameEn: client.name };
      await step('Client', () =>
        db.client.upsert({
          where: { id: client.id },
          create: { id: client.id, ...data },
          update: data,
        }),
      );
    }
    for (const waqif of source.waqifs) {
      const data = { clientId: waqif.clientId, nameAr: waqif.nameAr, nameEn: waqif.name };
      await step('Waqif', () =>
        db.waqif.upsert({
          where: { id: waqif.id },
          create: { id: waqif.id, ...data },
          update: data,
        }),
      );
    }
    for (const waqf of fixture.waqfs) {
      const beneficiaries = fixture.beneficiaries.filter((b) => b.waqfId === waqf.id);
      const nazirFee = fixture.nazirFees.find((f) => f.waqfId === waqf.id);
      const { id, data, immutable } = mapWaqf(waqf, beneficiaries, nazirFee);
      await step('Waqf', () =>
        db.waqf.upsert({
          where: { id },
          create: {
            id,
            ...data,
            createdBy: actorId,
            shartAlWaqif: jsonValue(immutable.shartAlWaqif),
            shartAlWaqifVersion: immutable.shartAlWaqifVersion,
            shartAlWaqifSetAt: immutable.shartAlWaqifSetAt,
            shartAlWaqifSetAtHijri: immutable.shartAlWaqifSetAtHijri,
            continuationStipulation: immutable.continuationStipulation,
            reversionClauseCaptured: immutable.reversionClauseCaptured,
            reversionKind: immutable.reversionKind,
            reversionRecordedAt: immutable.reversionRecordedAt,
            reversionRecordedAtHijri: immutable.reversionRecordedAtHijri,
          },
          update: data,
        }),
      );
      // BORN OPEN — the source's onboarding block is ignored (see the header).
      for (const [index, gate] of GATES.entries()) {
        const gateId = `gate-${id}-${String(index + 1)}`;
        await step('OnboardingGate', () =>
          db.onboardingGate.upsert({
            where: { id: gateId },
            create: {
              id: gateId,
              waqfId: id,
              gate: gate as never,
              status: 'OPEN',
              createdBy: actorId,
            },
            update: {},
          }),
        );
      }
    }
    for (const taker of deriveReversionTakers(fixture)) {
      const { id, data } = taker;
      await step('WaqfReversionTaker', () =>
        db.waqfReversionTaker.upsert({ where: { id }, create: { id, ...data }, update: data }),
      );
    }
    for (const waqf of fixture.waqfs) {
      const { id, data } = mapTrusteeship(waqf);
      await step('TrusteeshipDeed', () =>
        db.trusteeshipDeed.upsert({ where: { id }, create: { id, ...data }, update: data }),
      );
    }
    const bankNameByRef = new Map(source.bankAccounts.map((a) => [a.ref, a.bankNameAr] as const));
    for (const account of deriveBankAccounts(fixture)) {
      const { id, data: derived } = account;
      const bankNameAr = bankNameByRef.get(derived.accountRef);
      if (bankNameAr === undefined) {
        throw new Error(
          `IMPORT_REFUSED: bank account ${derived.accountRef} is referenced by a transaction but not ` +
            `listed in bankAccounts with its bankNameAr. The importer states every bank; it names none.`,
        );
      }
      const data = { ...derived, bankNameAr };
      await step('BankAccount', () =>
        db.bankAccount.upsert({
          where: { id },
          create: withDerivedHmac({ id, ...data }),
          update: withDerivedHmac(data),
        }),
      );
    }
    for (const asset of source.assets) {
      const { id, data: derived } = mapAsset(asset);
      const data = { ...derived, addressAr: asset.addressAr };
      await step('Asset', () =>
        db.asset.upsert({ where: { id }, create: { id, ...data }, update: data }),
      );
    }
    for (const expropriation of source.expropriations) {
      const { id, data: derived } = mapExpropriation(expropriation);
      const data = { ...derived, authorityAr: expropriation.authorityAr };
      await step('Expropriation', () =>
        db.expropriation.upsert({ where: { id }, create: { id, ...data }, update: data }),
      );
    }
    for (const beneficiary of fixture.beneficiaries) {
      const { id, data } = mapBeneficiary(beneficiary);
      await step('Beneficiary', () =>
        db.beneficiary.upsert({
          where: { id },
          create: withDerivedHmac({ id, ...data }),
          update: withDerivedHmac(data),
        }),
      );
    }
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
    for (const fee of fixture.nazirFees) {
      const { id, data } = mapNazirFee(fee);
      await step('NazirFee', () =>
        db.nazirFee.upsert({ where: { id }, create: { id, ...data }, update: data }),
      );
    }
    for (const filing of fixture.governmentFilingStatus) {
      const { id, data } = mapGovernmentFiling(filing);
      await step('GovernmentFiling', () =>
        db.governmentFiling.upsert({ where: { id }, create: { id, ...data }, update: data }),
      );
    }
    for (const document of source.documents) {
      const retentionUntil = new Date(`${document.retentionUntil}T00:00:00.000Z`);
      const data = {
        waqfId: document.waqfId,
        beneficiaryId: document.beneficiaryId,
        type: document.type,
        titleAr: document.titleAr,
        titleEn: document.titleEn,
        storageKey: document.storageKey,
        sha256: document.sha256.toLowerCase(),
        confidentiality: document.confidentiality as never,
        retentionUntil,
        retentionUntilHijri: String(toHijriSnapshot(retentionUntil)),
        legalHold: document.legalHold,
        createdBy: actorId,
      };
      await step('Document', () =>
        db.document.upsert({
          where: { id: document.id },
          create: { id: document.id, ...data },
          update: data,
        }),
      );
    }

    if (source.bootstrapAdmin !== undefined) {
      const { userId } = source.bootstrapAdmin;
      // THE FIRST SEAT — the one write no ordinary rule can authorise (authority cannot authorise its
      // own first instance), so admission is suspended here exactly as the seed's step 18 does it.
      await withAccessMatrixBootstrap(auditTx.rawTx, async () => {
        for (const waqfId of waqfIds) {
          const grantId = `grant-import-${options.runId}-${waqfId}`;
          const data = {
            userId,
            waqfId,
            role: 'SYSTEM_ADMIN' as never,
            permissions: [...BOOTSTRAP_ADMIN_PERMISSIONS],
            dataScopes: [] as string[],
            scopeRefs: [] as string[],
            amlCompartment: false,
            canViewAmlRestricted: false,
            beneficiarySelfId: null,
            grantedByUserId: actorId,
            validFrom: options.now,
            validUntil: null,
            revokedAt: null,
            createdBy: actorId,
          };
          await step('WaqfAccessGrant', () =>
            db.waqfAccessGrant.upsert({
              where: { id: grantId },
              create: { id: grantId, ...data },
              update: data,
            }),
          );
        }
      });
    }
  });

  return { runId: options.runId, actorId, written };
}
