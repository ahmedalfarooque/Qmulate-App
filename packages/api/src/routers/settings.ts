/**
 * `settings` — the configuration surface, and E2 exit clause 3's request path.
 *
 * §17 E2 exit clause 3, verbatim: **"a fee-basis change via `Setting` flows through with no
 * redeploy."** The resolver half is `src/settings.ts`; this file is the AUTHORITY half — who may
 * read a figure, and who may change one.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY `settings.set` IS ON THE APPROVAL RUNG AND NOT ON A WRITE RUNG
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §10 §4.1 classifies a Nazir-fee change as a `nazir` **`A*`** action (BR-507; the fee is set by
 * the deed, Nazarah Art. 11). So the procedure is `checkerProcedure('fee:nazir_fee:approve')`,
 * which means three things, none of them optional:
 *
 *  1. **The caller must hold an ACTIVE `NAZIR` grant on the TARGET endowment**, and only `nazir`
 *     holds `fee:nazir_fee:approve` in `ROLE_PRESETS` at all (D-1/D-2: the approval-authority set
 *     is exactly `{nazir}`).
 *  2. **`admin` IS REJECTED**, which EXIT-3 requires explicitly. `admin` holds
 *     `admin:setting:write` — config authority — and §2.1 is emphatic that config authority is not
 *     governance authority: "cannot approve/sign money, filings, or reserved matters". The refusal
 *     lands at rung 2 (`PERMISSION_DENIED`, `FORBIDDEN`) because the admin *does* hold a grant on
 *     the endowment but not this verb.
 *  3. **Maker ≠ checker, and the Nazir signs the exact figure they were shown.** The change must
 *     already exist as an `ApprovalRequest` whose `payload` IS the proposed setting change, so the
 *     `payloadHash` the approval rung verifies binds the Nazir to that exact value. Whoever edits
 *     the number after approval would otherwise be the real approver (§10 §4.3 / MP-30).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ENDOWMENT TIER ONLY — AND WHY A GLOBAL CHANGE IS NOT A REQUEST-PATH OPERATION
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The scope written is always `ctx.waqfId`. A GLOBAL row governs every endowment, and authority
 * here is PER ENDOWMENT (§10 principle 2) — so one endowment's Nazir changing a global figure would
 * be exactly the portfolio-wide authority the model refuses. Global figures are platform
 * configuration; they change through an audited ops/migration path calling
 * `createSettingResolver(...).set(key, envelope)` from a DECLARED `SYSTEM`/`SERVICE` context.
 * Building a request-path global-config surface is an admin-epic decision, and it is reported
 * rather than quietly added here.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE APPROVAL TYPE IS A REPORTED COMPROMISE, NOT A DESIGN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `enum ApprovalType` has four members — `BANK_MOVEMENT | DISTRIBUTION_RUN | GOVT_FILING |
 * RESERVED_MATTER` — and **none of them means "a governance decision on a configured figure"**.
 * {@link SETTING_CHANGE_APPROVAL_TYPE} is `RESERVED_MATTER`, the only one that denotes a governance
 * matter rather than a money movement, a run, or a filing.
 *
 * Two things follow, and both are reported to the integrator rather than worked around here:
 *  · `ApprovalType` wants a `SETTING_CHANGE` member (a schema + migration change this owner does
 *    not own).
 *  · `qmulate_reserved_matter_defect()` accepts ANY approved `RESERVED_MATTER` on the endowment as
 *    the key to a reserved-matter column change — it never checks the approval's `subjectId`
 *    against the thing being amended. That is a pre-existing gap (an approved istibdal is already a
 *    valid key for a `deedNumber` change) and this file does not widen it: nothing here CREATES an
 *    approval request. `approval.initiate` already mints `RESERVED_MATTER` rows for any subject, so
 *    the reachable set is unchanged. The fix is a `subjectId` check inside that SQL function.
 */

import { z } from 'zod';

import { canonicalJson, recordEvent, serializeForAudit } from '@qmulate/database';
import { SETTING_KEYS, parseSetting, type SettingKey, type SettingValue } from '@qmulate/domain';

import { ApiError } from '../errors.js';
import { toActorContext } from '../context.js';
import { decideThenExecute } from '../middleware/approval-plane.js';
import { auditedWrite } from '../middleware/audit-projection.js';
import { createSettingResolver, type ResolvedSetting } from '../settings.js';
import { checkerProcedure, endowmentScopedProcedure, router } from '../trpc.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Which keys this procedure may change, DERIVED
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The prefix identifying the Nazir-remuneration figures. One literal, one place.
 *
 * `fee:nazir_fee:*` is the permission module/resource these keys belong to (§3 row 5 "Nazir fee",
 * BR-507), and the key namespace mirrors it.
 */
export const NAZIR_FEE_SETTING_PREFIX = 'nazirFee.' as const;

/**
 * The keys `settings.set` accepts — **DERIVED from `@qmulate/domain`'s registry, never listed.**
 *
 * A new `nazirFee.*` key therefore becomes governed by the approval rung automatically, which is
 * the direction that fails safe. A hand-written list would silently leave the new key ungoverned,
 * and "ungoverned" here means "the Nazir's remuneration changed with no approval".
 */
export const NAZIR_AUTHORITY_SETTING_KEYS: readonly SettingKey[] = SETTING_KEYS.filter((key) =>
  key.startsWith(NAZIR_FEE_SETTING_PREFIX),
);

/**
 * Narrows an input key to one this procedure governs, or refuses.
 *
 * ⚠ EVERY OTHER REGISTERED KEY IS REFUSED, NOT SILENTLY WRITTEN. The deadline windows, the
 * classification bands, the retention floor and the rounding rule are platform configuration whose
 * request-path surface is an admin epic; §10 §4.1 only makes the FEE change a `nazir` `A*` action.
 * Accepting them here would put every regulatory figure behind the fee's approval rung, which
 * sounds safer and is actually a different (unreviewed) authority model.
 */
export function assertNazirAuthoritySettingKey(key: unknown): SettingKey {
  if (
    typeof key !== 'string' ||
    !(NAZIR_AUTHORITY_SETTING_KEYS as readonly string[]).includes(key)
  ) {
    throw new ApiError(
      'PERMISSION_DENIED',
      `settings.set governs the Nazir-remuneration figures only ` +
        `(${NAZIR_AUTHORITY_SETTING_KEYS.join(', ')}); ${JSON.stringify(String(key))} is not one of ` +
        `them. §10 §4.1 makes a FEE-basis change a nazir A* action; the deadline windows, ` +
        `classification bands, retention floor and rounding rule are platform configuration with no ` +
        `request-path surface in E2. Refused rather than written under the fee's authority model.`,
      {
        key: typeof key === 'string' ? key : typeof key,
        governed: [...NAZIR_AUTHORITY_SETTING_KEYS],
      },
    );
  }
  return key as SettingKey;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The approval artifact
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** See the file header: a reported compromise, pinned to ONE constant so it is greppable. */
export const SETTING_CHANGE_APPROVAL_TYPE = 'RESERVED_MATTER' as const;

/** Discriminator inside the payload, so a setting-change artifact is never mistaken for another. */
export const SETTING_CHANGE_ARTIFACT_KIND = 'setting.change' as const;

/**
 * The `subjectId` a setting-change approval request must carry.
 *
 * Load-bearing for `approval_request_one_open_per_subject`: the partial unique index keys on
 * `(waqfId, type, COALESCE(subjectId,''))` over the NON-TERMINAL statuses, so a distinct subject
 * per (tier, key) means two simultaneous open requests to change the SAME figure are impossible —
 * "the approval" for a given fee change is never ambiguous (MP-31).
 */
export function settingChangeSubjectId(key: string, waqfId: string): string {
  return `setting:endowment:${waqfId}:${key}`;
}

/**
 * THE CANONICAL, NUMBER-FREE artifact a Nazir approves.
 *
 * ⚠ WHY `serializeForAudit` AND NOT THE ENVELOPE AS-IS. `approvalFingerprint` is
 * `computeHash(payload, GENESIS)`, and `canonicalJson` **REFUSES a JS `number`** — deliberately,
 * because floating point is banned for money end to end. A fee envelope's `v` is a JS number
 * (`percentValue` is `z.number()`), so hashing the raw envelope would THROW. `serializeForAudit`
 * turns every numeric into its canonical string first, which is the same two-step pipeline the
 * audit hash chain itself uses, and it has a second property that matters here: an all-strings tree
 * survives a `jsonb` round-trip byte-identically (Postgres normalises `1.10` → `1.1` in a numeric
 * literal but never touches a string), so the hash recomputed from the STORED payload still matches.
 *
 * There is deliberately no second canonicaliser: this builds the tree and `@qmulate/database`'s
 * `canonicalJson` / `approvalFingerprint` do the encoding. Two "canonical" forms of one payload is
 * the shape of this whole sprint's bug.
 */
export function settingChangeArtifact(input: {
  readonly key: string;
  readonly waqfId: string;
  readonly envelope: unknown;
}): Record<string, unknown> {
  return {
    kind: SETTING_CHANGE_ARTIFACT_KIND,
    tier: 'endowment',
    key: input.key,
    waqfId: input.waqfId,
    value: serializeForAudit(input.envelope),
  } satisfies Record<string, unknown>;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · Inputs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `key` is a bounded string rather than a `z.enum`, so an ungoverned key is refused by
 * {@link assertNazirAuthoritySettingKey} with a reason a caller can act on — a zod enum failure
 * would surface as a shape error and hide WHY the key is not writable here.
 */
const settingKeyInput = z.object({ key: z.string().min(1).max(128) });

/** The envelope, as an object. `parseSetting` does the real validation against the key's schema. */
const settingValueInput = z.object({ value: z.record(z.unknown()) });

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The router
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export const settingsRouter = router({
  /**
   * Read one figure for this endowment, resolved ENDOWMENT → GLOBAL.
   *
   * ⚠ `admin:setting:read`, i.e. the CONFIG PLANE. This is deliberately not the door a domain
   * feature uses to read a fee rate: a fee procedure declares its OWN permission
   * (`fee:nazir_fee:read`, which `nazir` holds) and calls `createSettingResolver(ctx.db, ...)`
   * inside its body. The resolver is not an authorization boundary — the procedure that calls it
   * is — and giving every figure a single "settings read" permission would collapse twelve grid
   * rows into one.
   *
   * The response carries the WHOLE envelope plus the tier that answered, so a UI cannot render the
   * figure without also having the ⚠ unverified marker in hand.
   */
  get: endowmentScopedProcedure('admin:setting:read')
    .input(settingKeyInput)
    .query(async ({ ctx, input }) => {
      const resolver = createSettingResolver(ctx.db, { now: ctx.now });
      // An unregistered key throws SETTING_MISSING (mapped to BAD_REQUEST), never a null answer:
      // a resolver that returned "absent" for a typo'd key would be indistinguishable from a figure
      // nobody has configured.
      const resolved: ResolvedSetting = await resolver.resolve(input.key as SettingKey, {
        waqfId: ctx.waqfId,
      });

      return {
        key: resolved.key,
        tier: resolved.tier,
        waqfId: resolved.waqfId,
        resolvedAt: resolved.resolvedAt.toISOString(),
        // The envelope, whole. `unverified` and `note` come with it, on purpose.
        value: resolved.envelope,
      };
    }),

  /**
   * Change a Nazir-remuneration figure for THIS endowment. `nazir` `A*` only.
   *
   * The guards ran before this body: rung 1 session + universal TOTP enrolment, rung 2 an active
   * grant on `input.waqfId` carrying `fee:nazir_fee:approve`, rung 3 `actorType === 'USER'`, the
   * request visible through the caller's own scoped client and belonging to this endowment,
   * maker ≠ checker against the PERSISTED `makerId`, an ACTIVE `NAZIR` grant on the target
   * endowment, a `Setting`-driven TOTP step-up, the payload fingerprint, and the open-status gate.
   *
   * What is left for the body is: prove the submitted figure is the one that was approved, apply
   * it, and record the AUTHORITY.
   */
  set: checkerProcedure('fee:nazir_fee:approve')
    .input(settingKeyInput.merge(settingValueInput))
    .mutation(async ({ ctx, input }) => {
      const key = assertNazirAuthoritySettingKey(input.key);

      // Validated BEFORE anything is compared or written: the marker refinement means an unverified
      // figure without its ⚠ note does not parse, so it cannot be approved into existence either.
      const envelope: SettingValue<typeof key> = parseSetting(key, input.value);

      // ── THE NAZIR SIGNED THIS EXACT FIGURE ────────────────────────────────────────────────────
      // Rung 3 has already proven `payloadHash === approvalFingerprint(payload)`. This proves the
      // stored payload IS the change being submitted. Without it, an approval raised for one figure
      // could be spent on another: the hash would still match its own payload, and the guard chain
      // would look completely healthy.
      if (ctx.approval.type !== SETTING_CHANGE_APPROVAL_TYPE) {
        throw new ApiError(
          'APPROVAL_STALE',
          `WRONG_APPROVAL_TYPE: approval_request ${ctx.approval.id} is ${ctx.approval.type}, not ` +
            `${SETTING_CHANGE_APPROVAL_TYPE}. An approval raised for one kind of act may never be ` +
            `spent on another — its payloadHash would still match its own payload, so the guard ` +
            `chain would look healthy while the wrong thing was authorized.`,
          { approvalRequestId: ctx.approval.id, reason: 'WRONG_APPROVAL_TYPE' },
        );
      }

      const expectedSubjectId = settingChangeSubjectId(key, ctx.waqfId);
      if (ctx.approval.subjectId !== expectedSubjectId) {
        throw new ApiError(
          'APPROVAL_STALE',
          `WRONG_SUBJECT: approval_request ${ctx.approval.id} names subject ` +
            `${JSON.stringify(ctx.approval.subjectId)}, not ${JSON.stringify(expectedSubjectId)}. ` +
            `The subject is what makes "the approval for THIS figure on THIS endowment" ` +
            `unambiguous, and what the one-open-per-subject unique index keys on.`,
          { approvalRequestId: ctx.approval.id, reason: 'WRONG_SUBJECT' },
        );
      }

      const expected = settingChangeArtifact({ key, waqfId: ctx.waqfId, envelope });
      if (canonicalJson(ctx.approval.payload) !== canonicalJson(expected)) {
        throw new ApiError(
          'APPROVAL_STALE',
          `ARTIFACT_MISMATCH: the figure submitted is not the figure recorded on approval_request ` +
            `${ctx.approval.id}. The approver signs the exact artifact they saw (§10 §4.3) — ` +
            `whoever changes the number after approval would otherwise be the real approver. Raise ` +
            `a new request for the new figure.`,
          { approvalRequestId: ctx.approval.id, reason: 'ARTIFACT_MISMATCH', key },
        );
      }

      const decidedAt = ctx.now;

      // (a) THE DECISION — on the approval plane (S12-1 / AV4-02, migration 50): `status → APPROVED`
      //     and `checkerId` are refused from the runtime connection by connection role, so the
      //     decision commits FIRST on the provisioning connection, and the execution below runs
      //     SECOND on the runtime. If the execution fails the decision is VOIDED (see
      //     `middleware/approval-plane.ts`). `checkerId` is the ACTING identity from the session —
      //     never an input — and the DB CHECK plus the `approval_request_authority` trigger re-prove
      //     maker≠checker and "an ACTIVE NAZIR on THIS endowment" independently, in SQL.
      return decideThenExecute(ctx, 'settings.set', decidedAt, () =>
        auditedWrite(ctx.db, async (tx) => {
          // (b) The effect. `resolver.set()` opens `withAudit`, which JOINS this transaction, so the
          //     decision and the figure commit together or not at all. A setting that changed while
          //     its approval rolled back would be a change with no authority behind it.
          const resolver = createSettingResolver(ctx.db, { now: ctx.now });
          const stored = await resolver.set(key, envelope, { waqfId: ctx.waqfId });

          // (c) EXECUTED, and this is not bookkeeping. `APPROVED` is NON-terminal, so the
          //     one-open-per-subject index would keep the slot occupied and block the next legitimate
          //     change to the same figure. `EXECUTED` is terminal and means "approved AND applied",
          //     which is exactly what just happened. PENDING → APPROVED → EXECUTED is the only legal
          //     route; the trigger refuses PENDING → EXECUTED directly.
          await tx.approvalRequest.update({
            where: { id: ctx.approval.id },
            data: { status: 'EXECUTED' },
          });

          // (d) ⚠ MP-32: the trail proves the AUTHORITY, not merely the identity (BR-607, NFR-04). An
          //     approval whose authority is unrecorded is an unauditable one — so the event names the
          //     GRANT and the ROLE that conferred it, plus the maker it was distinct from and the hash
          //     the approver was bound to. `recordEvent` joins this transaction through the
          //     AsyncLocalStorage, so it commits with the rest.
          await recordEvent(toActorContext(ctx, { procedure: 'settings.set' }), {
            action: 'APPROVE',
            category: 'APPROVAL',
            classification: 'SENSITIVE',
            entityType: 'Setting',
            entityId: waqfSettingId(key, ctx.waqfId),
            waqfId: ctx.waqfId,
            extraContext: {
              grantId: ctx.authority.grantId,
              role: ctx.authority.role,
              approvalRequestId: ctx.approval.id,
              approvalType: ctx.approval.type,
              subjectId: ctx.approval.subjectId,
              makerId: ctx.approval.makerId,
              payloadHash: ctx.approval.payloadHash,
              settingKey: key,
              tier: 'endowment',
              // ⚠ THE CAVEAT TRAVELS INTO THE TRAIL TOO. A ten-year audit record of "the fee rate
              // became 7%" that omits "this figure is unverified against primary Saudi law" is a
              // record that reads as settled law to whoever finds it.
              unverified: stored.unverified,
              note: stored.note ?? null,
              totpAssertedAt: ctx.totpAssertedAt.toISOString(),
            },
          });

          return {
            approvalRequestId: ctx.approval.id,
            status: 'EXECUTED' as const,
            key,
            tier: 'endowment' as const,
            waqfId: ctx.waqfId,
            decidedAt: decidedAt.toISOString(),
            value: stored,
          };
        }),
      );
    }),
});

/** The per-endowment row's deterministic id — the same grammar the seed uses. */
function waqfSettingId(key: string, waqfId: string): string {
  return `setting-${waqfId}-${key}`;
}
