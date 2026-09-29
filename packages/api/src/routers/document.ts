/**
 * The document vault's surface — E9's exit, clause by clause.  (S10/T3)
 *
 * `17-build-ship-dod.md:133`: *"a document is retrievable, its reads are audited, and a delete
 * before the retention window is refused."* This router is the first two clauses; the third is
 * the DATABASE's (the E1-era `document_retention_guard` family, hardened in migration 4's C-14,
 * plus migration 47's content-identity freeze) and deliberately has NO surface here — **there is
 * no `document.delete` procedure at all.** Deletion before retention must not merely fail; it
 * must have nowhere to be asked for. The controlled-deletion workflow (maker/checker, TOTP-gated)
 * is later-epic governance, and the DB floor is what holds until it exists.
 *
 * ⚠ WHAT THIS SURFACE DELIBERATELY DOES NOT OPEN:
 *   · NO beneficiary access change — and since the fourth-batch ruling (2026-09-01, memo
 *     `f85bb99`, owner verbatim "b") that is an ANSWERED access-matrix row, not an open one:
 *     beneficiary principals keep the deed RECORD (Q-E4-1, untouched) and NO deed FILE of any
 *     type is beneficiary-readable; a beneficiary session's document visibility is
 *     own-`beneficiaryId` rows only, and scoping's branch is CONFIRMED CORRECT AS WRITTEN.
 *     ⚠ Today that refusal is a SIDE-EFFECT of the self-isolation clause — the NAMED PIN that
 *     states it (a positive control citing the ruling, so a future widening of the branch for
 *     an unrelated reason goes red instead of silently opening the deed file) is T4's, by the
 *     orchestrator's own no-late-additions rule. The ruling is the Nazir-owner's DISCLOSURE
 *     decision; whether a beneficiary has a LEGAL RIGHT to a deed copy under Saudi law is a
 *     counsel question the memo records as NOT answered.
 *   · NO AML-classified uploads. `confidentiality` is not an input: every document registered
 *     through this surface is NORMAL. An AML-compartment document path needs the compartment's
 *     own rules (§09 rule 1) and is not built by defaulting a column.
 *   · NO presigned URLs yet (they are the S3 half, owed with it). Content travels inline as
 *     base64 — fine at fixture scale, revisited with the real object store.
 */

import { createHash, randomUUID } from 'node:crypto';

import { recordEvent } from '@qmulate/database';
import { DomainError } from '@qmulate/domain/errors';
import { toHijriSnapshot } from '@qmulate/domain/dates';
import { parseSetting } from '@qmulate/domain/settings';
import { z } from 'zod';

import { toActorContext } from '../context.js';
import { ApiError } from '../errors.js';
import { auditedWrite } from '../middleware/audit-projection.js';
import { getStorageAdapter } from '../storage.js';
import { endowmentScopedProcedure, makerProcedure, router } from '../trpc.js';

/** BR-701's nine document classes — the model's own comment, as the closed input vocabulary. */
const DOCUMENT_TYPES = [
  'deed',
  'certificate',
  'title_deed',
  'trusteeship',
  'lease',
  'valuation',
  'financial',
  'kyc',
  'correspondence',
] as const;

/** ~2 MB of bytes as base64. Inline is the fixture-scale answer; presigning is the S3 half's. */
const MAX_CONTENT_BASE64 = 2_800_000;

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export const documentRouter = router({
  /**
   * Register a document: bytes into the vault, metadata into the row, retention stamped from the
   * Setting — the write half of "retrievable".
   */
  register: makerProcedure('document:document:write')
    .input(
      z.object({
        type: z.enum(DOCUMENT_TYPES),
        titleAr: z.string().min(1).max(400),
        titleEn: z.string().min(1).max(400).optional(),
        // The base64 round-trip is validated AT THE SCHEMA, so a malformed body is a zod input
        // rejection (framework vocabulary) rather than a new ApiError code inventing ar/en copy.
        contentBase64: z
          .string()
          .min(1)
          .max(MAX_CONTENT_BASE64)
          .refine((value) => {
            const bytes = Buffer.from(value, 'base64');
            return bytes.length > 0 && bytes.toString('base64') === value.replace(/\s/g, '');
          }, 'contentBase64 is not valid base64'),
        /** Ties a beneficiary-personal document (e.g. kyc) to its subject — §10 self-isolation. */
        beneficiaryId: z.string().min(1).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const bytes = Buffer.from(input.contentBase64, 'base64');

      // The retention window comes from the Setting, never a hardcoded figure (binding rule 3 —
      // the ⚠ flag travels to the caller). Absent is DENY, not a default: registering a document
      // with an unstated retention obligation would be inventing a statutory figure. Thrown as
      // the DOMAIN's own SETTING_MISSING — the same refusal the deadline engine makes for an
      // absent window, with the same existing ar/en catalogue behind it (no new code invented).
      const rawSetting = await ctx.settings.raw('retention.minimumYears', ctx.waqfId);
      if (rawSetting === null) {
        throw new DomainError(
          'SETTING_MISSING',
          "Setting 'retention.minimumYears' is absent at every tier. A document cannot be " +
            'registered without its retention obligation — regulatory figures are configuration, ' +
            'never hardcoded defaults, so the vault refuses rather than inventing one.',
          { details: { settingKey: 'retention.minimumYears', waqfId: ctx.waqfId } },
        );
      }
      const retention = parseSetting('retention.minimumYears', rawSetting);

      const sha256 = sha256Hex(bytes);
      const storageKey = `${ctx.waqfId}/${input.type}/${randomUUID()}`;
      const retentionUntil = new Date(ctx.now);
      retentionUntil.setFullYear(retentionUntil.getFullYear() + Number(retention.v));

      // Bytes first, row second — the row must never point at a key that holds nothing. The
      // inverse failure (tx below rolls back, object stays) leaves an ORPHAN OBJECT, stated
      // here deliberately: an unreferenced object is storage debris; a dangling row would be a
      // "retrievable" claim with nothing behind it.
      await getStorageAdapter().put({
        key: storageKey,
        body: bytes,
        contentType: 'application/octet-stream',
        contentLanguage: 'ar',
        retainUntil: retentionUntil,
      });

      const document = await auditedWrite(ctx.db, async (tx) =>
        tx.document.create({
          data: {
            waqfId: ctx.waqfId,
            ...(input.beneficiaryId !== undefined ? { beneficiaryId: input.beneficiaryId } : {}),
            type: input.type,
            titleAr: input.titleAr,
            titleEn: input.titleEn ?? null,
            storageKey,
            sha256,
            version: 1,
            retentionUntil,
            retentionUntilHijri: String(toHijriSnapshot(retentionUntil)),
            createdBy: ctx.actor.actorId,
          },
          select: { id: true, storageKey: true, sha256: true, retentionUntil: true },
        }),
      );

      return {
        documentId: document.id,
        sha256: document.sha256,
        retentionUntil: document.retentionUntil.toISOString(),
        unverifiedNote: retention.unverified
          ? `retention.minimumYears = ${String(retention.v)} — ⚠ unverified, confirm vs primary law`
          : null,
      };
    }),

  /** Metadata listing — scoped reads through the caller's own client; no content, no audit event. */
  list: endowmentScopedProcedure('document:document:read').query(async ({ ctx }) => {
    const documents = await ctx.db.document.findMany({
      where: { waqfId: ctx.waqfId, deletedAt: null },
      select: {
        id: true,
        type: true,
        titleAr: true,
        titleEn: true,
        sha256: true,
        version: true,
        retentionUntil: true,
        retentionUntilHijri: true,
        legalHold: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    return { documents };
  }),

  /**
   * Content retrieval — the exit's first two clauses in one act: the bytes come back, and the
   * read lands in the trail. A mutation, not a query, because it HAS a side effect (the
   * `READ_SENSITIVE` event) and hiding a write inside a query is how audits go quiet.
   */
  download: endowmentScopedProcedure('document:document:read')
    .input(z.object({ documentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const document = await ctx.db.document.findFirst({
        where: { id: input.documentId, waqfId: ctx.waqfId, deletedAt: null },
        select: {
          id: true,
          storageKey: true,
          sha256: true,
          titleAr: true,
          type: true,
          confidentiality: true,
        },
      });
      if (document === null) {
        // §10 §7.2's non-disclosure shape: another endowment's document id must read exactly
        // like a nonexistent one.
        throw new ApiError('NO_GRANT', 'documentId does not name a document on this endowment.', {
          waqfId: ctx.waqfId,
        });
      }

      const { body } = await getStorageAdapter().get({ key: document.storageKey });

      // The integrity round-trip: served bytes must hash to the ROW's sha256 (write-once since
      // migration 47). A mismatch means the vault is about to serve substituted bytes for a
      // retained document — refuse, loudly, as an internal fault; there is no client-side
      // remedy and no error vocabulary that should dress this as a request problem.
      const actual = sha256Hex(body);
      if (actual !== document.sha256) {
        throw new Error(
          `document ${document.id}: stored bytes hash ${actual} but the row records ` +
            `${document.sha256} — refusing to serve substituted content (S10/T3 integrity check).`,
        );
      }

      // THE AUDITED READ — exit clause 2. `READ_SENSITIVE` (already in AuditAction; no widening,
      // the pin agrees), classification SENSITIVE: vault content is client legal/financial
      // material even when the document row itself is NORMAL confidentiality.
      await recordEvent(toActorContext(ctx, { procedure: 'document.download' }), {
        action: 'READ_SENSITIVE',
        entityType: 'Document',
        entityId: document.id,
        waqfId: ctx.waqfId,
        classification: 'SENSITIVE',
        extraContext: { sha256: document.sha256, type: document.type },
      });

      return {
        documentId: document.id,
        titleAr: document.titleAr,
        type: document.type,
        sha256: document.sha256,
        contentBase64: Buffer.from(body).toString('base64'),
      };
    }),
});
