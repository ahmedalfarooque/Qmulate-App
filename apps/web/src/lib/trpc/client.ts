import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';

import { getNamespace, resolveLocale } from '@qmulate/i18n';

import type { AppRouter } from '@qmulate/api';
import type { TRPCLink } from '@trpc/client';

/**
 * The browser-side tRPC contract: the React hooks object, the link the provider installs, and the
 * ONE function that turns a kernel refusal into a translatable message key.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `@qmulate/api` IS IMPORTED HERE FOR ITS TYPE ONLY — AND THAT IS LOAD-BEARING
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `import type { AppRouter }` is erased at compile time (`verbatimModuleSyntax`), so end-to-end
 * inference reaches the browser while NOT ONE BYTE of the server kernel does. A value import from
 * `@qmulate/api` here would pull `@qmulate/database` — Prisma, the audit hash chain, the
 * force-filter — into the client bundle, which is the same class of mistake the ESLint
 * server/client boundary already blocks for `@qmulate/auth`.
 *
 * ⚠ The ESLint rule does NOT currently list `@qmulate/api` in that ban group (see
 * `apps/web/eslint.config.js`), so nothing but this comment and review stops a future value
 * import. Reported to the orchestrator: the group should gain `@qmulate/api` with
 * `allowTypeImports`.
 */

/** tRPC React hooks, typed against the server router. Used only inside `'use client'` components. */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Must match `TRPC_ENDPOINT` in `src/app/api/trpc/[trpc]/route.ts`. Relative on purpose: a
 * same-origin URL needs no `NEXT_PUBLIC_*` variable, cannot point a browser at another origin by
 * misconfiguration, and keeps the cookie a first-party one.
 */
export const TRPC_URL = '/api/trpc';

/** The header the route handler reads as a locale HINT (never as authority). */
export const LOCALE_HEADER = 'x-qmulate-locale';

/**
 * The single link the provider installs.
 *
 * `credentials: 'same-origin'` is explicit rather than assumed: better-auth's session is an
 * HttpOnly cookie, and a `fetch` that omits it produces `UNAUTHENTICATED` on every call — which
 * reads exactly like a broken session and is not one.
 *
 * There is deliberately NO transformer, matching `initTRPC` in `@qmulate/api`: money crosses this
 * wire as a decimal STRING, and a serializer that helpfully revived it as a JS `number` would put a
 * float in the ledger path (`Decimal(18,2)`, halalas, never a float).
 */
export function createKernelLink(locale: string): TRPCLink<AppRouter> {
  return httpBatchLink({
    url: TRPC_URL,
    headers: () => ({ [LOCALE_HEADER]: resolveLocale(locale) }),
    fetch: (input, init) => fetch(input, { ...init, credentials: 'same-origin' }),
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Refusal → message key
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** `ApiError.messageKey` is `errors.access.<API_ERROR_CODE>`. */
export const ACCESS_KEY_PREFIX = 'errors.access.';
/** `DomainError.messageKey` is `errors.domain.<DOMAIN_ERROR_CODE>`. */
export const DOMAIN_KEY_PREFIX = 'errors.domain.';
/** The fallback. Deliberately says nothing: see {@link kernelMessageKey}. */
export const GENERIC_KEY = 'errors.generic';

/** A machine code: SCREAMING_SNAKE, bounded. Nothing else may reach a catalogue lookup. */
const CODE_PATTERN = /^[A-Z][A-Z0-9_]{1,63}$/;

/** Structural read of `messageKey` from the three shapes a refusal arrives in. */
function rawMessageKey(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as {
    /** over the wire: tRPC's `errorFormatter` threads it onto `shape.data` (see `@qmulate/api`). */
    data?: { messageKey?: unknown } | null;
    /** in process (the server caller): a `TRPCError` wrapping the `ApiError`. */
    cause?: { messageKey?: unknown } | null;
    /** an `ApiError` / `DomainError` thrown and caught directly. */
    messageKey?: unknown;
  };

  for (const value of [
    candidate.data?.messageKey,
    candidate.cause?.messageKey,
    candidate.messageKey,
  ]) {
    if (typeof value === 'string' && value !== '') return value;
  }
  return null;
}

/**
 * THE ONE TRANSLATION FROM A KERNEL REFUSAL TO A KEY THE UI MAY RENDER. Fails closed.
 *
 * ── WHY THE RAW MESSAGE IS NEVER SHOWN ────────────────────────────────────────────────────────
 * `ApiError`'s `message` is developer-facing English that quotes the requested `waqfId`, the
 * refused permission and the spec paragraph. Rendering it would (a) put untranslated English in
 * front of an Arabic-first user, and (b) re-disclose, in the UI, precisely what
 * `NO_GRANT → NOT_FOUND` exists to withhold. So the wording ALWAYS comes from the catalogue.
 *
 * ── WHY THE KEY IS VALIDATED RATHER THAN TRUSTED ──────────────────────────────────────────────
 * Three independent checks, and an unrecognised value returns {@link GENERIC_KEY}:
 *   1. **The prefix must be one of the two error namespaces.** Without this, any string arriving
 *      as `messageKey` could pull an ARBITRARY catalogue entry into the error slot — `auth.password`
 *      rendered as an error message is a confusing lie, and a catalogue is not an authorization
 *      boundary.
 *   2. **The remainder must look like a machine code**, so a key cannot be assembled from
 *      caller-influenced text.
 *   3. **The key must actually EXIST in the catalogue.** This is the one that matters in practice:
 *      next-intl does not throw for a missing message, it PRINTS THE KEY — so an unpaired code
 *      would render `errors.access.SOMETHING_NEW` on screen. `packages/i18n/test/messages.test.ts`
 *      keeps the catalogue and the two code lists key-for-key identical, so in a correct build
 *      this check never fires; it is here because "never fires" is a claim, not a guarantee.
 */
export function kernelMessageKey(error: unknown, locale: string): string {
  const key = rawMessageKey(error);
  if (key === null) return GENERIC_KEY;

  const prefix = key.startsWith(ACCESS_KEY_PREFIX)
    ? ACCESS_KEY_PREFIX
    : key.startsWith(DOMAIN_KEY_PREFIX)
      ? DOMAIN_KEY_PREFIX
      : null;
  if (prefix === null) return GENERIC_KEY;

  const code = key.slice(prefix.length);
  if (!CODE_PATTERN.test(code)) return GENERIC_KEY;

  const errors = getNamespace(resolveLocale(locale), 'errors');
  const bucket: Record<string, string> =
    prefix === ACCESS_KEY_PREFIX ? errors.access : errors.domain;
  if (!Object.hasOwn(bucket, code)) return GENERIC_KEY;

  return key;
}

/**
 * ⚠ THERE IS DELIBERATELY NO `kernelErrorCode()` HELPER, and no `data-error-code` attribute
 * anywhere in this app.
 *
 * The obvious convenience — stamping the machine code onto the rendered element for debugging —
 * would be a TIPPING-OFF CHANNEL. `NO_GRANT`, `SCOPE_REF_MISMATCH` and `AML_COMPARTMENT_ONLY` are
 * all `NOT_FOUND` with one identical wording precisely so a caller cannot tell which of the three
 * happened (§10 §6: the AML compartment is an empty set, "as if it does not exist" — including to
 * the subject). A distinguishing attribute in the HTML re-discloses it to anyone reading the DOM,
 * and no status-code test would notice. The machine code belongs in the AUDIT TRAIL, which
 * `@qmulate/api` writes server-side, and in the operator log line in the route handler.
 */
