/**
 * THE AUDITED-WRITE DOOR — and the structural repair for C-08.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT, STATED PRECISELY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `@qmulate/database`'s audit extension builds an event's before/after image like this
 * (`extensions/audit.ts`, `auditedMutation`):
 *
 *   · the PRE-image is `delegate.findFirst({ where })` — **a whole row**, no projection;
 *   · the POST-image is *the operation's own return value*;
 *   · `diffChangedKeys` walks the UNION of both key sets and reads a missing key as `null`.
 *
 * So a `select` / `omit` on an audited `update` makes the post-image NARROWER than the pre-image,
 * and every column the projection dropped is reported **as having been set to null**. It set none of
 * them. The event is then hashed into the append-only chain, which seals the falsehood as authentic
 * evidence — in the table that is the evidence of last resort, for ≥ 10 years.
 *
 * That is not a cosmetic diff bug. On `ApprovalRequest` the columns a narrow `select` erases are
 * `makerId`, `subjectId` and `payloadHash` — exactly the three that maker ≠ checker and
 * artifact-binding rest on. An `include` is the mirror image: it makes the post-image WIDER, so
 * relation payloads appear as columns that "changed" from null.
 *
 * A projection also corrupts three further decisions the extension takes off the post-image:
 * `deriveAction` (an `ApprovalRequest` whose `status` was projected away records `UPDATE`, not
 * `APPROVE`), `deriveClassification` (which reads `confidentiality`), and `extractWaqfId`.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE REPAIR IS HERE AND NOT IN THE DIFF
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The *ideal* repair is in `packages/database`: re-read the post-image as a whole row, or teach
 * `diffChangedKeys` the difference between "absent from the projection" and "null". That is
 * `@qmulate/database`'s to make and it has NOT been made — the coercion is still there, and this
 * module does not claim otherwise.
 *
 * What this layer owes is that **no write it originates can reach that coercion**. Round 1 patched
 * ONE call site by deleting one `select` and pinning the resulting key set in a test. That stops the
 * one write that had already lied; it does nothing about the next one. So the control here is not
 * "this call site has no projection" — it is "a projected audited `update`/`upsert` **cannot execute**
 * through this package's write path, and says why."
 *
 * ⚠ CIPHERTEXT IS UNAFFECTED. This guard inspects `args` and throws; it never touches the result and
 * never reorders the extension chain. `before`/`after` keep the `[encrypted]` redaction the audit
 * extension applies (extension order encryption → scoping → audit is load-bearing and untouched).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `create` IS DELIBERATELY EXEMPT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A `create` has no pre-image, so the extension records the result AS the after-image with **no
 * diff** (`before: null` short-circuits `diffChangedKeys`). An omitted column is then simply not
 * reported — never falsely reported as null. That makes a `create` projection a legitimate choice
 * about what the trail carries, and two shipped call sites make it deliberately:
 * `approval.initiate` (which keeps `payload` out of a ten-year table) and `activateGrant`.
 * Refusing it here would delete a real privacy control to fix a diff bug it cannot cause.
 *
 * `upsert` is NOT exempt: its update branch has a pre-image, and the extension cannot know in
 * advance which branch will run.
 */

import { UNAUDITED_MODELS, withAudit, type ExtendedPrismaClient } from '@qmulate/database';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · What is refused
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Operations whose after-image the audit extension DIFFS against a full-row pre-image.
 *
 * `update` and `upsert` are the whole set, because they are the only two that reach the diff:
 *  · `create` has no pre-image (see the file header);
 *  · `delete`, `deleteMany`, `updateMany`, `updateManyAndReturn`, `createMany` and
 *    `createManyAndReturn` are ALL in the audit extension's `BANNED_OPERATIONS` and are refused
 *    outright — hard deletion is not permitted during the retention window (§12), and the bulk
 *    forms have no per-row before-image. A `bypass: 'migration'` context is the one exception, and
 *    it emits no event at all, so there is no diff to falsify;
 *  · the sanctioned deletion, `softDelete()`, is a plain `update({ where, data: { deletedAt } })`
 *    with no projection, so it is safe as written AND guarded if it is called on a handle from
 *    {@link auditedWrite}.
 */
export const DIFFED_WRITE_OPERATIONS: readonly string[] = ['update', 'upsert'];

/**
 * Argument keys that narrow or widen a Prisma write's return value.
 *
 * All three break the diff, in two directions: `select`/`omit` drop columns (reported as set to
 * null), `include` adds relation payloads the pre-image never had (reported as changed FROM null).
 */
export const PROJECTION_ARG_KEYS: readonly string[] = ['select', 'include', 'omit'];

/** True when `model` emits audit events, i.e. is not on `@qmulate/database`'s exclusion list. */
export function isAuditedModel(model: string): boolean {
  return !(model in UNAUDITED_MODELS);
}

/**
 * Raised instead of executing a write whose audit event would be a lie.
 *
 * `override` on `name` is REQUIRED, not decoration: `Error` already declares `name`, and this repo's
 * `tsc` settings reject the redeclaration without it — verified by deleting the modifier and
 * observing `TS4114` rather than by assuming.
 */
export class UnauditableProjectionError extends Error {
  readonly code = 'UNAUDITABLE_PROJECTION';
  override readonly name = 'UnauditableProjectionError';
  readonly model: string;
  readonly operation: string;
  readonly projections: readonly string[];

  constructor(model: string, operation: string, projections: readonly string[]) {
    super(
      `${model}.${operation}() carries ${projections.map((key) => `\`${key}\``).join(' + ')}, and ` +
        `${model} is an AUDITED model. The audit extension takes its POST-image from this ` +
        `operation's own result while the PRE-image is a whole row, and diffChangedKeys reads a ` +
        `key that is absent from the post-image as null — so this write's audit event would state, ` +
        `in the append-only trail, that every column the projection dropped was SET TO NULL. It ` +
        `sets none of them, and the hash chain would seal the falsehood as authentic. ` +
        `\`include\` is the same defect mirrored (relation payloads appear as columns that changed ` +
        `from null), and a projection also corrupts deriveAction, deriveClassification and ` +
        `extractWaqfId, all of which read the post-image. ` +
        `FIX: drop the projection — the whole row comes back, an unchanged column compares equal ` +
        `and is omitted, so the event carries exactly the columns the write moved. If you need a ` +
        `narrow shape for the RESPONSE, project it in TypeScript from the returned row, or read it ` +
        `back with a separate findFirst. \`create\` is exempt (no pre-image ⇒ no diff ⇒ an omitted ` +
        `column is not reported at all).`,
    );
    this.model = model;
    this.operation = operation;
    this.projections = [...projections];
  }
}

/**
 * Refuses a projected audited `update`/`upsert`. A no-op for everything else.
 *
 * Pure and exported so it can be asserted directly, but it is NOT the control — {@link auditedTx} is.
 * A check nobody is obliged to call is documentation.
 */
export function assertAuditableProjection(model: string, operation: string, args: unknown): void {
  if (!DIFFED_WRITE_OPERATIONS.includes(operation)) return;
  if (!isAuditedModel(model)) return;
  if (typeof args !== 'object' || args === null) return;

  const record = args as Record<string, unknown>;
  const projections = PROJECTION_ARG_KEYS.filter((key) => record[key] !== undefined);
  if (projections.length === 0) return;

  throw new UnauditableProjectionError(model, operation, projections);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The enforcement — a Proxy over the transaction handle
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The Prisma delegate property names that are NOT models. Everything else on the client that looks
 * like an object with an `update` method is a model delegate.
 */
const NON_DELEGATE_PREFIX = '$';

/** `waqfAccessGrant` -> `WaqfAccessGrant`. The inverse of `@qmulate/database`'s `delegateName`. */
function modelNameFromDelegate(property: string): string {
  return property.charAt(0).toUpperCase() + property.slice(1);
}

/**
 * Wraps a client/transaction handle so every `update`/`upsert` on an audited model is checked
 * BEFORE it executes.
 *
 * A Proxy rather than a wrapper object because the thing being wrapped is `withAudit`'s own tx
 * facade — itself a Proxy over the extended client, with raw-SQL passthrough and a `$transaction`
 * that joins rather than nests. Re-implementing that surface would be a second facade to keep in
 * step; intercepting two property lookups is not.
 *
 * ⚠ WHAT THIS CANNOT REACH: raw SQL. `$executeRawUnsafe` passes straight through, exactly as it does
 * on every other layer in this system — Prisma extensions do not see it, and neither does this. Raw
 * SQL also emits no audit event at all, so there is no false diff to prevent; the missing-trail
 * problem it creates is a different (and open) one, recorded in `BUILD-PLAN.md`.
 */
export function auditedTx<T extends object>(tx: T): T {
  return new Proxy(tx, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);

      if (
        typeof property !== 'string' ||
        property.startsWith(NON_DELEGATE_PREFIX) ||
        typeof value !== 'object' ||
        value === null
      ) {
        return value;
      }

      const model = modelNameFromDelegate(property);
      const delegate = value as Record<string, unknown>;

      // Not every object property is a delegate (`_engine`, symbols, …). One that has none of the
      // diffed operations is left completely alone.
      if (!DIFFED_WRITE_OPERATIONS.some((operation) => typeof delegate[operation] === 'function')) {
        return value;
      }

      return new Proxy(delegate, {
        get(delegateTarget, operation, delegateReceiver) {
          const method = Reflect.get(delegateTarget, operation, delegateReceiver);
          if (typeof operation !== 'string' || typeof method !== 'function') return method;
          if (!DIFFED_WRITE_OPERATIONS.includes(operation)) return method;

          // ⚠ THROWS SYNCHRONOUSLY, not as a rejected promise. That is the loudest failure
          // available: a rejected promise can be swallowed by a missing `await`, and a guard that
          // can be swallowed is decorative. Every call site in this package awaits, and inside
          // `auditedWrite` the enclosing async function turns it into a rejection anyway.
          return (args: unknown, ...rest: unknown[]) => {
            assertAuditableProjection(model, operation, args);
            return (method as (...a: unknown[]) => unknown).call(
              delegateTarget,
              args,
              ...rest,
            ) as unknown;
          };
        },
      }) as unknown;
    },
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The door
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * THE ONE AUDITED-WRITE DOOR for `@qmulate/api`. Use it wherever Sprint 2 would have called
 * `withAudit()` directly.
 *
 * Identical semantics to `withAudit` — one transaction, business writes and audit events committing
 * together, nesting JOINS the enclosing transaction and keeps the OUTER actor context — with one
 * addition: the handle it yields refuses a projected audited `update`/`upsert`.
 *
 * ⚠ `withAudit` IS LINT-BANNED OUTSIDE THIS FILE. `packages/api/eslint.config.js` carries a
 * `no-restricted-imports` rule naming `withAudit` from `@qmulate/database`, with this module as the
 * only exemption, and `turbo run lint` (which CI runs) enforces it. That is what makes this "the"
 * door rather than "a" door: a second, unguarded write path fails the build instead of shipping.
 * It is deliberately a lint rule and not a comment — Sprint 2's lesson is that a comment claiming a
 * control the toolchain does not enforce is a defect, not a control.
 */
export function auditedWrite<T>(
  db: ExtendedPrismaClient,
  fn: (tx: ExtendedPrismaClient) => Promise<T>,
): Promise<T> {
  return withAudit(db, (tx) => fn(auditedTx(tx)));
}
