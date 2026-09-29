/**
 * tRPC v11 initialisation and THE PROCEDURE LADDER.
 *
 * ```
 * publicProcedure
 *   └─ authedProcedure                                 session valid + universal TOTP-enrolment gate
 *        └─ endowmentScopedProcedure(permission)        input carries waqfId; active grant loaded for
 *           = waqfScoped(permission)                    THAT waqfId; the permission asserted; no
 *                                                        grant -> NOT_FOUND (never FORBIDDEN)
 *             ├─ makerProcedure(permission)             a write/initiate verb; refuses approve/sign
 *             ├─ checkerProcedure(permission)           approve: maker≠checker + NAZIR-on-this-
 *             │                                          endowment + TOTP step-up + staleness void
 *             ├─ signerProcedure(permission)            sign: identical guards, sign verb
 *             └─ amlProcedure(permission)               = requireAmlMember(); compartment membership
 * ```
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * BOTH SPELLINGS, ONE IMPLEMENTATION. AND THE THIRD SET IS DELETED.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §17 names the rungs `endowmentScopedProcedure / makerProcedure / checkerProcedure /
 * signerProcedure`; §10 §7.2 names them `waqfScoped(permission) / requireDistinctApprover() /
 * requireAmlMember()`. BOTH ship, as ALIASES OF ONE IMPLEMENTATION, so neither spec is a broken
 * import and neither can drift from the other.
 *
 * A THIRD set — `protectedProcedure / scopedProcedure / approvalProcedure` — was promised by this
 * file's Sprint-1 comment and never existed. It is **deleted, not implemented**. Three names for one
 * thing is exactly how the Sprint-1 parity holes happened: two sides that were supposed to agree,
 * with nothing comparing them. `test/procedure-ladder.test.ts` scans this file's source to prove the
 * three invented names are absent.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * NO `meta()`. THE GUARDS ARE THE SOURCE OF TRUTH.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * tRPC's `meta` is caller-supplied and a later `.meta()` call overwrites an earlier one — so a router
 * that FORGOT the ladder could still declare that it had it. Every guard middleware here instead
 * carries a `GuardTag` on the raw function, which survives into
 * `appRouter._def.procedures[path]._def.middlewares`. `router-introspection.test.ts` therefore walks
 * the REAL composed chain, and the permission it reads is the SAME closure variable the middleware
 * enforces. A future router that omits a rung fails the build rather than shipping unguarded (MP-34).
 *
 * Standing rules for anything added here:
 *   · Every input is validated with a zod schema. No unvalidated input, ever.
 *   · **An audited write goes through `auditedWrite()`** (`middleware/audit-projection.ts`), never
 *     `withAudit()` — a lint rule enforces it. And the `update`/`upsert` inside takes **no `select`,
 *     `include` or `omit`**: the audit extension diffs a narrow post-image against a full-row
 *     pre-image and records every dropped column as "set to null", which the hash chain then seals
 *     (C-08). `auditedWrite`'s handle refuses such a write; project the response shape in TypeScript
 *     from the returned row instead. A `create` may project — it has no pre-image, so no diff.
 *   · **`WaqfAccessGrant`, `Membership` and `ApprovalRequest` accept only DIRECT, TOP-LEVEL delegate
 *     writes.** A relation-nested write into any of the three is refused unconditionally — for a
 *     caller who legitimately holds `admin:access_matrix:write`, with no flag that turns it off,
 *     because the trail names the parent row and never the child. Reissue it as the equivalent
 *     top-level operation inside the same `auditedWrite` block. Full rationale, including the
 *     raw-SQL residual it does NOT close, on `activateGrant` in `context.ts`.
 *   · Money crosses this boundary as a 2-dp decimal STRING, never a JS `number` (`toDbString`).
 *   · Dates cross as canonical UTC ISO-8601 plus, where legally significant, the FROZEN Hijri
 *     snapshot taken at write time — never recomputed downstream.
 *   · `AuditEvent.id` is a `BigInt` that plain JSON cannot serialize: convert with `String()` at the
 *     boundary. There is deliberately still no transformer, which is also why money must already be
 *     a decimal string — no serializer is quietly turning a Decimal into a float.
 */

import { initTRPC } from '@trpc/server';

import { ApiError, isNonDisclosureCode, NON_DISCLOSURE_WIRE_CODE, toTRPCError } from './errors.js';
import {
  assertProcedurePermission,
  tagGuard,
  type GuardTag,
  type PermissionString,
} from './permissions.js';
import { assertAuthed } from './middleware/authed.js';
import {
  auditScopeRefusal,
  requireWaqfIdInput,
  resolveScope,
  waqfScopedInput,
  type ScopedContext,
} from './middleware/scope.js';
import {
  approvalTargetInput,
  assertApprovalPermission,
  auditApprovalRefusal,
  permissionIsWriteVerb,
  requireApprovalRequestIdInput,
  resolveApprover,
  type ApproverContext,
} from './middleware/segregation.js';
import { assertAmlMember } from './middleware/aml.js';

import type { TrpcContext } from './context.js';

const t = initTRPC.context<TrpcContext>().create({
  /**
   * ONE error translation for the whole surface.
   *
   * `errorFormatter` runs after tRPC has already built a shape from whatever was thrown, so the
   * mapping has to happen where the throw is caught — which is why the ladder throws `ApiError` and
   * every procedure body funnels through {@link toTRPCError}. This formatter threads the machine
   * code and the i18n key onto the shape's `data` so a client can branch on the code and render the
   * ar/en wording from `@qmulate/i18n` — **except for the non-disclosure class, which collapses to
   * one identity first.**
   *
   * ⚠ IT MUST NOT WIDEN A MESSAGE. `NO_GRANT` surfaces as `NOT_FOUND` with nothing about the
   * endowment (§10 §7.2) — adding "you lack permission on waqf-003" here would undo the whole
   * non-disclosure design in one helpful-looking line.
   *
   * ⚠⚠ **AND FOR THREE COMMITS THIS FUNCTION DID THE THING ITS OWN WARNING FORBIDS.** The two
   * fields below were threaded UNCONDITIONALLY, so a caller refused by the AML compartment read
   * `apiCode: 'AML_COMPARTMENT_ONLY'` / `messageKey: 'errors.access.AML_COMPARTMENT_ONLY'` where a
   * caller with no grant read `NO_GRANT` — a per-member discriminator sitting beside a copy deck
   * and a status code that had both been made deliberately identical. §09 C5 was satisfied at two
   * layers and defeated at the third. The narrowing is here and in `apiErrorToTRPCError`'s
   * `message`; both are needed, because `shape.message` and `shape.data` are separate channels and
   * closing either alone leaves the other talking.
   */
  errorFormatter({ shape, error }) {
    const cause = error.cause as { code?: unknown; messageKey?: unknown } | undefined;
    const rawCode = typeof cause?.code === 'string' ? cause.code : null;
    // The class travels under ONE identity. Derived from the status table — see errors.ts §3b.
    const nonDisclosing = rawCode !== null && isNonDisclosureCode(rawCode);
    return {
      ...shape,
      data: {
        ...shape.data,
        apiCode: nonDisclosing ? NON_DISCLOSURE_WIRE_CODE : rawCode,
        messageKey: nonDisclosing
          ? `errors.access.${NON_DISCLOSURE_WIRE_CODE}`
          : typeof cause?.messageKey === 'string'
            ? cause.messageKey
            : null,
      },
    };
  },
});

/** Build a router. */
export const router = t.router;

/** Compose routers. */
export const mergeRouters = t.mergeRouters;

/** Build middleware. */
export const middleware = t.middleware;

/** Server-side caller factory — used by jobs and tests to invoke procedures without HTTP. */
export const createCallerFactory = t.createCallerFactory;

/**
 * An unauthenticated procedure.
 *
 * Reserved for genuinely public endpoints (health, locale metadata). Anything touching endowment data
 * uses a rung below. `router-introspection.test.ts` holds an explicit, justified allowlist of the
 * procedures that are public and asserts it equals the actual set IN BOTH DIRECTIONS, so a new public
 * procedure fails the build until someone writes down why it is public.
 */
export const publicProcedure = t.procedure;

/**
 * A `TRPCError`-normalising wrapper, applied at the top of the ladder.
 *
 * Every rung below inherits it, so a `DomainError` from a pure engine, a `ForbiddenScopeError` from
 * the force-filter, or an `ApiError` from a guard all reach the client as the RIGHT status — and an
 * unrecognised failure reaches it as a 500 rather than being downgraded into a tidy 4xx that reads as
 * "handled" and stops anyone looking.
 */
const normaliseErrors = t.middleware(async ({ next }) => {
  try {
    const result = await next();
    // tRPC returns a discriminated result rather than throwing, so a failed inner middleware arrives
    // here as `{ ok: false, error }`. Re-mapping it keeps ONE translation for both shapes.
    if (!result.ok) throw toTRPCError(result.error);
    return result;
  } catch (error) {
    throw toTRPCError(error);
  }
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The tagging helper
 *
 * `t.middleware(fn)` returns `{ _middlewares: [fn], unstable_pipe }`, and `.use(mw)` appends
 * `mw._middlewares` straight into the procedure's `_def.middlewares`. So tagging the RAW function
 * inside the builder puts the tag on the object that actually runs, and it survives into the router.
 *
 * The middleware bodies are written INLINE here rather than imported as pre-built functions, and that
 * is a typing constraint rather than a preference: only an inline callback gets tRPC's contextual
 * typing, which is what makes `next({ ctx: scoped })` narrow `ctx` for every rung and every procedure
 * body below. The DECISIONS all live in `src/middleware/*.ts` as plain, separately-assertable
 * functions; what is here is the wiring.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Attaches a {@link GuardTag} to the middleware a builder JUST added, and returns the builder
 * unchanged (same generics, so downstream inference is untouched).
 *
 * `.use(fn)` appends `fn` itself to `builder._def.middlewares`, and that array is copied straight into
 * `router._def.procedures[path]._def.middlewares`. So tagging `at(-1)` puts the tag on the object that
 * actually runs, and `router-introspection.test.ts` reads the REAL composed chain.
 */
function tagLast<B extends { readonly _def: { readonly middlewares: readonly unknown[] } }>(
  builder: B,
  tag: GuardTag,
): B {
  const fn = builder._def.middlewares.at(-1);
  if (typeof fn !== 'function') {
    throw new Error(
      'tagLast: the builder has no middleware to tag. The guard tag is how ' +
        'router-introspection.test.ts proves a procedure is built on the ladder, so a silently ' +
        'untagged guard would make that proof vacuous.',
    );
  }
  tagGuard(fn as (...args: never[]) => unknown, tag);
  return builder;
}

/**
 * Rung 1. A valid better-auth session AND the universal TOTP-enrolment gate cleared.
 *
 * The enrolment gate is UNIVERSAL (user decision 2026-07-27) — not role-conditional. Do not add a
 * role condition: `apps/web/e2e/auth-journey.spec.ts` fails if you do, and the window in which an
 * account holds no role is exactly the window before anyone has vetted it.
 */
export const authedProcedure = tagLast(
  t.procedure.use(normaliseErrors).use(async ({ ctx, next }) => next({ ctx: assertAuthed(ctx) })),
  { kind: 'authed' },
);

/**
 * Rung 2. §17's spelling.
 *
 * `permission` is REQUIRED — positionally, with no default and no overload (MP-34). §10 §7.2: "A
 * domain procedure is *unwritable* without declaring its endowment scope and required permission —
 * the type system makes the check non-optional." Making it optional would silently degrade every
 * procedure that omitted it to "any active grant on this endowment can do this", which is what the
 * force-filter already does — so the mistake would be invisible in behaviour AND consistent across
 * both layers.
 *
 * The input is `waqfScopedInput`, merged with whatever the procedure adds. A caller that omits
 * `waqfId` fails zod; a procedure whose input somehow lacks it is refused by the guard rather than
 * proceeding unscoped.
 */
export function endowmentScopedProcedure(permission: PermissionString) {
  // Validated HERE, at router-construction time — i.e. at import, i.e. at boot and in every test run
  // — so a typo like 'endowment:waqf:aprove' fails loudly instead of denying silently at request
  // time and inviting someone to "fix" the matcher by broadening it.
  const required = assertProcedurePermission(permission);

  return tagLast(
    authedProcedure.input(waqfScopedInput).use(async ({ ctx, input, path, next }) => {
      const waqfId = requireWaqfIdInput(input, path);

      // The try/catch wraps ONLY the authorization decision, never `next()`. An error from the
      // procedure body is the body's business, and recording it as `ACCESS_DENIED` would fill the
      // trail with events that are not access denials.
      let scoped: ScopedContext;
      try {
        scoped = resolveScope(ctx, waqfId, required);
      } catch (error) {
        await auditScopeRefusal(ctx, path, waqfId, required, error);
        throw error;
      }
      return next({ ctx: scoped });
    }),
    { kind: 'endowment-scope', permission: required },
  );
}

/**
 * Rung 2, §10 §7.2's spelling. **The same function**, not a re-implementation — assigned, so the two
 * names are the same object and a test can assert it by identity.
 */
export const waqfScoped = endowmentScopedProcedure;

/**
 * Rung 3a. A MAKER procedure: `write` or `initiate`.
 *
 * Refuses an `approve`/`sign` permission at construction. That refusal is the point: the maker is the
 * party who may never authorize (§10 §4.2), so a "maker" procedure guarding an approval verb is a
 * contradiction — and one that would compose NO segregation guard onto an approval action.
 */
export function makerProcedure(permission: PermissionString) {
  return endowmentScopedProcedure(permissionIsWriteVerb(permission));
}

/**
 * Rung 3b. A CHECKER procedure: the `approve` verb.
 *
 * Adds, in this order: maker≠checker against the persisted `makerId` (before any state change), an
 * ACTIVE `NAZIR` grant on the TARGET endowment, a `Setting`-driven TOTP step-up, the artifact
 * fingerprint (voiding a changed one), and the open-status gate. See `middleware/segregation.ts` for
 * why that order and not another.
 *
 * The input carries `approvalRequestId` as well as `waqfId`: the caller names the REQUEST, never the
 * decision — there is no `checkerId` input and no co-approver field anywhere (D-2).
 */
export function checkerProcedure(permission: PermissionString) {
  const required = assertApprovalPermission(assertProcedurePermission(permission));

  const withSegregation = tagLast(
    endowmentScopedProcedure(required)
      .input(approvalTargetInput)
      .use(async ({ ctx, input, path, next }) => {
        const approvalRequestId = requireApprovalRequestIdInput(input, path);
        let approver: ApproverContext;
        try {
          approver = await resolveApprover(ctx, approvalRequestId);
        } catch (error) {
          await auditApprovalRefusal(ctx, path, approvalRequestId, required, error);
          throw error;
        }
        return next({ ctx: approver });
      }),
    { kind: 'segregation', permission: required },
  );

  // ── THE STEP-UP TAG, WITH A RUNTIME SELF-CHECK ────────────────────────────────────────────────
  // TWO tags, not one, because `router-introspection.test.ts` asserts BOTH are present on every
  // approve/sign procedure — a single combined tag would let one of the two quietly disappear from
  // the implementation while the tag kept claiming both.
  //
  // The freshness DECISION lives inside `resolveApprover`: it needs the resolved endowment for the
  // per-endowment `Setting` override, and it must run in a fixed order relative to the other checks.
  // Splitting it across two middlewares would make that order depend on `.use()` ordering at every
  // call site. So this middleware VERIFIES that the decision was made rather than claiming it —
  // `ctx.totpAssertedAt` exists only because `resolveApprover` produced it, so a tag with no
  // enforcement behind it fails HERE rather than shipping.
  return tagLast(
    withSegregation.use(async ({ ctx, next }) => {
      if (!(ctx.totpAssertedAt instanceof Date)) {
        throw new ApiError(
          'TOTP_STEP_UP_REQUIRED',
          'the approval rung produced no TOTP assertion. That is a build error — the guard chain is ' +
            'mis-composed — and it DENIES rather than letting an unverified approve/sign through ' +
            '(NFR-06).',
        );
      }
      return next();
    }),
    { kind: 'totp-step-up', permission: required },
  );
}

/**
 * Rung 3b, §10 §7.2's spelling. **The same function.**
 *
 * §7.2 writes it as `requireDistinctApprover()`, i.e. as something applied to a procedure. It takes
 * the permission for the same reason `waqfScoped` does: an approval procedure that did not declare
 * its verb could not be checked by the router-introspection test, and "the approve procedure" is not
 * a thing the type system can otherwise recognise.
 */
export const requireDistinctApprover = checkerProcedure;

/**
 * Rung 3c. A SIGNER procedure: the `sign` verb — the final governance signature on a reserved matter.
 *
 * Identical guards to {@link checkerProcedure}, which is deliberate: §9's reserved-matter chain ends
 * "→ `nazir` S*", so the authority, the segregation and the step-up are the same. What differs is the
 * VERB, and therefore which grants can reach it: `endowment:deed:sign` sits only in the `nazir`
 * preset.
 *
 * ⚠ NOTE THE ONE THING THIS DOES NOT DO. It does not open the Shart al-Waqif. Per the 2026-07-27 user
 * decision the four Shart columns are unconditionally immutable — `withReservedMatter()` throws on
 * them and `qmulate_shart_guard()` raises on them without consulting any approval — so no signature,
 * however genuine, amends them.
 */
export function signerProcedure(permission: PermissionString) {
  return checkerProcedure(permission);
}

/**
 * Rung 3d. `requireAmlMember()` — the SAR compartment (§10 §6).
 *
 * For compartment WRITES and for procedures where "nothing happened" is not an expressible answer. A
 * non-member READ returns the empty set through the force-filter instead, because an error is a
 * signal and the compartment's whole point is the absence of one.
 */
export function amlProcedure(permission: PermissionString) {
  const required = assertProcedurePermission(permission);
  return tagLast(
    endowmentScopedProcedure(required).use(async ({ ctx, path, next }) => {
      await assertAmlMember(ctx, path, required);
      return next();
    }),
    { kind: 'aml-member', permission: required },
  );
}

/** §10 §7.2's spelling for {@link amlProcedure}. **The same function.** */
export const requireAmlMember = amlProcedure;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Inputs — re-exported so a feature router in a later epic composes the SAME schemas
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export { waqfScopedInput, approvalTargetInput };
export type { WaqfScopedInput } from './middleware/scope.js';
export type { ApprovalTarget } from './middleware/segregation.js';
