/**
 * API-layer errors, and the ONE translation from a domain/database error to a tRPC error.
 *
 * Source of truth: `docs/product/prd/10-roles-access-matrix-spec.md` §7.2 (the ladder's refusals)
 * and §5 (a beneficiary fetching another beneficiary's id gets **404, not 403**).
 *
 * ── THE RULE THAT SHAPES THIS WHOLE FILE ─────────────────────────────────────────────────────
 * **`NO_GRANT` MAPS TO `NOT_FOUND`, NEVER TO `FORBIDDEN`.** §7.2, verbatim: "No grant → NOT_FOUND
 * (not FORBIDDEN — do not disclose the endowment exists)." A `FORBIDDEN` on endowment B tells the
 * caller that endowment B exists and that they are not on it; over four endowments and a family
 * that is an enumeration oracle. The same applies to a beneficiary reaching for a co-beneficiary's
 * id (§5) and to a non-member querying the AML compartment (§6: an *empty set*, "as if it does not
 * exist"). `PERMISSION_DENIED` — the caller HAS a grant on this endowment but not this verb — is
 * the one refusal that may legitimately be `FORBIDDEN`, because existence is already disclosed by
 * the grant itself.
 *
 * ── EVERY MAPPING MATCHES ON A STABLE `code`, NEVER ON A MESSAGE STRING ───────────────────────
 * `@qmulate/database`'s error classes each carry a literal `code` field for exactly this reason
 * (`ForbiddenScopeError.code === 'FORBIDDEN_SCOPE'`, …), and `DomainError` carries a
 * `DomainErrorCode`. Matching on `error.message` would turn a copy edit into a security change.
 *
 * Machine codes only. The ar/en wording lives in `@qmulate/i18n` under `errors.access.<CODE>`;
 * nothing in this file may contain user-facing copy.
 */

import { TRPCError } from '@trpc/server';

import { isDomainError, type DomainError } from '@qmulate/domain';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The closed code set
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The closed set of API-layer refusal codes. Adding one is a contract change: the i18n catalogue
 * must gain the matching `errors.access.<CODE>` key in BOTH locales.
 */
export const API_ERROR_CODES = [
  /** No session at all. */
  'UNAUTHENTICATED',
  /**
   * Authenticated, but the account has not enrolled TOTP. The enrolment gate is UNIVERSAL (user
   * decision 2026-07-27) — no authenticated surface is reachable without it, role or no role.
   */
  'TOTP_ENROLMENT_REQUIRED',
  /**
   * An `approve`/`sign` action needs a FRESH TOTP assertion (NFR-06 step-up) and does not have
   * one. Raised for all four fail-closed cases: no assertion recorded, an assertion older than the
   * window, an unparseable window, or NO CONFIGURED WINDOW AT ALL — see
   * `middleware/segregation.ts`. `details.reason` distinguishes them for the operator; none of
   * them is ever an allow.
   */
  'TOTP_STEP_UP_REQUIRED',
  /**
   * No ACTIVE `WaqfAccessGrant` for the requested endowment. **Maps to `NOT_FOUND`** — see the
   * file header.
   */
  'NO_GRANT',
  /**
   * The caller holds an active grant on this endowment but not the required
   * `module:resource:verb`. Existence is already disclosed by the grant, so this one is
   * `FORBIDDEN`.
   */
  'PERMISSION_DENIED',
  /**
   * `initiatorUserId === approverUserId` (§10 §4.2). Raised BEFORE any state change. The
   * comparison is the acting IDENTITY against the persisted `makerId` — never a role predicate: a
   * user who legitimately holds both `finance` and `nazir` on one endowment is still blocked from
   * approving a run they initiated, and may still approve runs initiated by others.
   */
  'SEGREGATION_OF_DUTIES',
  /**
   * The artifact changed after submission, or the request is no longer open for decision (§10
   * §4.3: "the prior approval is voided and the item returns to re-submit"). `details.reason` is
   * `FINGERPRINT_MISMATCH` or `NOT_OPEN`.
   */
  'APPROVAL_STALE',
  /**
   * A SAR-compartment action attempted by a non-member (§10 §6). Used for a WRITE attempt; a READ
   * returns the empty set instead, because the compartment is invisibility, not redaction.
   */
  'AML_COMPARTMENT_ONLY',
  /**
   * `input.resourceId ∉ ctx.grant.scopeRefs` — the subcontractor / counsel / auditor narrowing
   * (§7.2). Maps to `NOT_FOUND` for the same non-disclosure reason as `NO_GRANT`.
   */
  'SCOPE_REF_MISMATCH',
  /**
   * A reserved matter is missing a required chain step (principal consent, counsel review,
   * Authority notice) or its approval is not a genuine APPROVED, maker≠checker RESERVED_MATTER for
   * this endowment. Mapped from `@qmulate/database`'s `ReservedMatterNotApprovedError`.
   */
  'RESERVED_MATTER_CHAIN_INCOMPLETE',
  /**
   * The `evaluateAuthGate` result was neither `authorized` nor one of the two cases above — i.e. a
   * gate status this build does not recognise. FAIL CLOSED: an unmapped gate status denies.
   */
  'GATE_NOT_CLEARED',
  /**
   * ⊕ S12-3 · BR-1101 / V-11 — a downstream activity (a distribution run, an Authority filing
   * submission) attempted while the endowment's onboarding Gate 02 is not CLEARED. Its OWN code,
   * deliberately: `GATE_NOT_CLEARED` is the CLASSIFICATION gate (§09) and must not be overloaded.
   */
  'ONBOARDING_GATE_NOT_CLEARED',
  /**
   * ⊕ S12-3b · the caller asked to REGISTER an endowment for a client on none of whose endowments
   * they hold BOTH `endowment:waqf:write` and `admin:access_matrix:write` (migration 53's sibling
   * authority). FORBIDDEN, not NOT_FOUND: the client is one the caller can already see through
   * their grants — what is refused is the act, not the existence.
   */
  'ENDOWMENT_INTAKE_NOT_AUTHORISED',
  /**
   * ⊕ S12-3b · under `DATA_CLASSIFICATION=fixture-only` an identifier broke the fixture grammar
   * (`FAKE-` references, `@example.test` e-mails). Real identifiers never enter a non-KSA
   * environment through the UI (NFR-03, G-8). Nothing was written.
   */
  'FIXTURE_ONLY_IDENTIFIER_REFUSED',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** Structured, non-PII context attached to an API error. Never put beneficiary PII in here. */
export type ApiErrorDetails = Readonly<Record<string, unknown>>;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · ApiError
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A refusal raised by the procedure ladder.
 *
 * `message` is developer-facing English for logs and the audit trail's `reason`. It is NOT
 * user-facing copy — surfaces render {@link ApiError.messageKey} through `@qmulate/i18n`.
 */
export class ApiError extends Error {
  /**
   * Stable machine code. Safe to switch on, safe to persist.
   *
   * ⚠ **NOT UNCONDITIONALLY SAFE TO SEND OVER THE WIRE — this clause used to say it was.** For
   * every code in {@link NON_DISCLOSURE_CODES} the code's own IDENTITY is the disclosure: telling
   * a caller `AML_COMPARTMENT_ONLY` rather than `NO_GRANT` tells them an AML compartment is live
   * on that endowment and they are outside it, which is the tipping-off §10 §6 forbids. The
   * outbound narrowing lives in {@link apiErrorToTRPCError} and in `trpc.ts`'s `errorFormatter`;
   * this field keeps the true code for the audit trail and the operator log, server-side only.
   */
  readonly code: ApiErrorCode;

  /**
   * i18n lookup key for the user-facing ar/en message: `errors.access.<CODE>`.
   *
   * ⚠ **EXCEPT for {@link NON_DISCLOSURE_CODES}, where it is the CLASS's key, not the member's.**
   * This is the channel the other two narrowings do not reach: `apps/web`'s `rawMessageKey()` reads
   * `messageKey` off `error.cause` as well as off `error.data`, because the SSR caller runs
   * IN PROCESS and tRPC's `errorFormatter` never executes on that path. So a server component
   * holding a refused call held `errors.access.AML_COMPARTMENT_ONLY` in memory — one `data-*`
   * attribute or one log line from disclosure, with the rendered sentence identical either way.
   * Narrowing here closes every egress at once: `message`, `apiCode`, `data.messageKey` and
   * `cause.messageKey`. The other two narrowings stay as separate layers because they close
   * separate channels, not because they re-read this one.
   *
   * The audit trail is unaffected — `recordProcedureDenial` records {@link ApiError.code} and
   * {@link Error.message}, both of which keep the true, specific values.
   */
  readonly messageKey: string;

  /** Structured, non-PII context. */
  readonly details?: ApiErrorDetails;

  constructor(code: ApiErrorCode, message: string, details?: ApiErrorDetails) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    // The class collapses to one key BEFORE anything can read it off `cause` — see the field doc.
    this.messageKey = `errors.access.${
      isNonDisclosureCode(code) ? NON_DISCLOSURE_WIRE_CODE : code
    }`;
    if (details !== undefined) this.details = details;
    // Keep `instanceof` working when the output is transpiled down.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Type guard for {@link ApiError}. */
export function isApiError(value: unknown): value is ApiError {
  return value instanceof ApiError;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · code -> tRPC status
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The ONE table mapping an API code to a tRPC error code.
 *
 * ⚠ THE `NO_GRANT -> NOT_FOUND` ROW IS A SECURITY CONTROL, not a stylistic choice. AC-1's and
 * EXIT-1's mutation is literally "change the no-grant throw from NOT_FOUND to FORBIDDEN", and the
 * integration suites assert `code === 'NOT_FOUND'` AND, explicitly, `!== 'FORBIDDEN'`.
 *
 * `TRPCError`'s code union is not exported as a value, so the table is typed against the field of
 * the constructor's own options object — a new tRPC version that renames a status breaks the build
 * here rather than at a call site.
 */
export const API_ERROR_STATUS: Readonly<
  Record<ApiErrorCode, ConstructorParameters<typeof TRPCError>[0]['code']>
> = {
  UNAUTHENTICATED: 'UNAUTHORIZED',
  TOTP_ENROLMENT_REQUIRED: 'FORBIDDEN',
  TOTP_STEP_UP_REQUIRED: 'FORBIDDEN',
  // NOT FORBIDDEN. Do not "fix" this — see the file header and AC-1.
  NO_GRANT: 'NOT_FOUND',
  PERMISSION_DENIED: 'FORBIDDEN',
  SEGREGATION_OF_DUTIES: 'FORBIDDEN',
  APPROVAL_STALE: 'CONFLICT',
  AML_COMPARTMENT_ONLY: 'NOT_FOUND',
  SCOPE_REF_MISMATCH: 'NOT_FOUND',
  RESERVED_MATTER_CHAIN_INCOMPLETE: 'FORBIDDEN',
  GATE_NOT_CLEARED: 'FORBIDDEN',
  ONBOARDING_GATE_NOT_CLEARED: 'FORBIDDEN',
  ENDOWMENT_INTAKE_NOT_AUTHORISED: 'FORBIDDEN',
  FIXTURE_ONLY_IDENTIFIER_REFUSED: 'FORBIDDEN',
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3b · The non-disclosure class, and the ONE identity it travels under
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The refusals whose own IDENTITY must not reach the caller — **derived from the status table
 * above, never hand-listed.**
 *
 * ── WHY DERIVED ───────────────────────────────────────────────────────────────────────────────
 * `NOT_FOUND` in {@link API_ERROR_STATUS} already MEANS "do not disclose that the thing exists"
 * (§10 §7.2; §6). So membership in this class is not a second, parallel judgement somebody has to
 * remember to update — it is the same fact, read once. A future code mapped to `NOT_FOUND` joins
 * this set by construction, and a code remapped away from `NOT_FOUND` leaves it. The alternative,
 * a hand-written list, is the shape whose membership is derived from nothing, and this repo has
 * been bitten four times by exactly that.
 *
 * ── WHY THE CLASS NEEDS AN IDENTITY AT ALL ────────────────────────────────────────────────────
 * The three members share ONE user-facing wording in both locales, asserted by
 * `packages/i18n/test/messages.test.ts`. That made the copy deck non-disclosing and left the
 * PAYLOAD disclosing: the code travelled in `message`, and `apiCode`/`messageKey` differed per
 * member. Rendering was identical and the discriminator was one field away. So the class collapses
 * to a single wire identity BEFORE it leaves the server.
 */
export const NON_DISCLOSURE_CODES: readonly ApiErrorCode[] = API_ERROR_CODES.filter(
  (code) => API_ERROR_STATUS[code] === 'NOT_FOUND',
);

/**
 * The canonical wire identity for every {@link NON_DISCLOSURE_CODES} member.
 *
 * `NO_GRANT` is the representative rather than an arbitrary pick: it is already the app's DEFAULT
 * non-disclosure key (`apps/web/src/app/[locale]/(app)/layout.tsx` falls back to
 * `errors.access.NO_GRANT` when a refusal carries no key), so collapsing onto it changes no
 * rendered pixel — the three wordings are byte-identical by test — while removing the last field
 * that could tell the three apart.
 *
 * ⚠ It is deliberately a MEMBER of the class, not a new code: a fourth code minted only for the
 * wire would need its own ar/en catalogue entry, and a partially-landed catalogue is the failure
 * mode the i18n suite exists to catch.
 */
export const NON_DISCLOSURE_WIRE_CODE = 'NO_GRANT' satisfies ApiErrorCode;

/** The `message` every non-disclosure refusal carries: the status, and nothing else. */
export const NON_DISCLOSURE_WIRE_MESSAGE = 'NOT_FOUND';

/**
 * Is this code's identity itself a disclosure?
 *
 * Takes a `string` rather than an `ApiErrorCode` on purpose — the caller in `trpc.ts` reads the
 * code off an unknown `cause`, and a narrowing helper that demanded the narrow type would push the
 * cast to the security-relevant side of the boundary.
 */
export function isNonDisclosureCode(code: string): boolean {
  return (NON_DISCLOSURE_CODES as readonly string[]).includes(code);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The mappings from the other packages' error classes
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `@qmulate/database` error `code` → the API code it surfaces as.
 *
 * Keyed on the literal `code` field each class declares, never on `instanceof` (which breaks the
 * moment two copies of the package are loaded) and never on the message.
 *
 * `FORBIDDEN_SCOPE` — the Prisma force-filter's own refusal — maps to `NO_GRANT`, and therefore to
 * `NOT_FOUND`: the extension fires when a caller touched a row outside `authorizedWaqfIds`, which
 * is the same fact as "no grant", and it must not disclose more than the procedure boundary would.
 */
export const DATABASE_ERROR_CODE_TO_API: Readonly<Record<string, ApiErrorCode>> = {
  FORBIDDEN_SCOPE: 'NO_GRANT',
  RESERVED_MATTER_NOT_APPROVED: 'RESERVED_MATTER_CHAIN_INCOMPLETE',
  SHART_AMENDMENT_FORBIDDEN: 'RESERVED_MATTER_CHAIN_INCOMPLETE',
  INVALID_BYPASS: 'PERMISSION_DENIED',
};

/**
 * `@qmulate/database` error codes that are BUGS, not refusals, and must surface as 500s.
 *
 * `AUDIT_TRANSACTION_REQUIRED`, `UNSUPPORTED_BULK_OPERATION` and `MONEY_AS_NUMBER` all mean the
 * SERVER wrote bad code — a mutation outside `withAudit()`, a bulk op on an audited model, a float
 * for money. Mapping any of them to a 4xx would tell the caller they did something wrong and,
 * worse, would let an unaudited-write bug look like an ordinary rejection in the logs.
 */
export const DATABASE_ERROR_CODES_ARE_SERVER_BUGS: readonly string[] = [
  'AUDIT_TRANSACTION_REQUIRED',
  'UNSUPPORTED_BULK_OPERATION',
  'MONEY_AS_NUMBER',
];

/**
 * `@qmulate/domain` `DomainError` codes that are AUTHORIZATION refusals rather than computation
 * failures. Everything else from the domain is a `BAD_REQUEST` (a caller-supplied value the pure
 * engine refused) — never a silent success.
 *
 * ⚠ A CODE IN THIS TABLE LOSES ITS OWN `messageKey`. {@link apiErrorToTRPCError} wraps it in an
 * `ApiError`, whose `messageKey` is `errors.access.<API_CODE>` — so the caller is shown the ACCESS
 * wording, not the domain wording. That is right for the five below (they ARE authorization
 * refusals and share the access catalogue's copy) and wrong for a domain code that has its own
 * sentence: use {@link DOMAIN_ERROR_CODE_TO_TRPC_STATUS} for those.
 */
export const DOMAIN_ERROR_CODE_TO_API: Readonly<Record<string, ApiErrorCode>> = {
  PERMISSION_INVALID: 'PERMISSION_DENIED',
  ROLE_UNKNOWN: 'PERMISSION_DENIED',
  PERMISSION_ESCALATION: 'PERMISSION_DENIED',
  DELEGATION_NOT_DELEGABLE: 'PERMISSION_DENIED',
  SHART_IMMUTABLE: 'RESERVED_MATTER_CHAIN_INCOMPLETE',
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4b · E3 · domain code → tRPC STATUS, keeping the domain's OWN messageKey
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `DomainError` codes that are neither authorization refusals nor plain `BAD_REQUEST`s, mapped to
 * the tRPC status they deserve — **without** being rewrapped as an {@link ApiError}.
 *
 * ── WHY A SECOND TABLE AND NOT A ROW IN {@link DOMAIN_ERROR_CODE_TO_API} ──────────────────────
 * That table's entries are translated into an `ApiError`, which overwrites `messageKey` with
 * `errors.access.<CODE>`. The E3 refusals below each have their OWN user-facing sentence living at
 * `errors.domain.<CODE>` in `@qmulate/i18n`, and there must be exactly ONE place that sentence is
 * written. Routing them through this table keeps the thrown `DomainError` as the `cause`, so
 * `src/trpc.ts`'s `errorFormatter` threads the DOMAIN code and the DOMAIN key onto `shape.data` —
 * one code, one key, one sentence.
 *
 * ⚠ THE DEFAULT IS STILL `BAD_REQUEST`, AND IT IS STILL THE RIGHT DEFAULT. This table exists for
 * the two codes whose status is genuinely something else:
 *  · `DEED_TERM_WRITE_ONCE` is a **CONFLICT**: the caller's request was well-formed and the state
 *    of the record is what refuses it — a founder's condition is already recorded, and the answer
 *    is a superseding instrument, not a retry with better input (ADR-0006).
 *  · `RESERVED_MATTER_REQUIRED` is a **FORBIDDEN**: the act itself is reserved (BR-306) and no
 *    input fixes that. It is deliberately NOT `NOT_FOUND` — the endowment's existence is already
 *    disclosed by the grant that got the caller this far, so there is nothing left to protect and a
 *    precise refusal is more useful than a misleading one.
 *
 * `NAZIR_INELIGIBLE` is listed even though `BAD_REQUEST` is also the fallback, because AC-E3-07
 * asserts the status and an assertion whose expected value is "whatever the fallback happens to be"
 * stops being a statement about the contract.
 *
 * ⚠ THESE THREE CODES ARE `@qmulate/domain`'s TO DECLARE (`DOMAIN_ERROR_CODES`), and
 * `packages/i18n/test/messages.test.ts` reads that array as text and requires `errors.domain.<CODE>`
 * in BOTH catalogues. This table is keyed on the STRING so it can be written before that lands; the
 * `DomainError` constructor call sites are typed against the real union, so a missing member is a
 * compile error naming exactly what is owed rather than a silent mis-map.
 */
export const DOMAIN_ERROR_CODE_TO_TRPC_STATUS: Readonly<
  Record<string, ConstructorParameters<typeof TRPCError>[0]['code']>
> = {
  DEED_TERM_WRITE_ONCE: 'CONFLICT',
  RESERVED_MATTER_REQUIRED: 'FORBIDDEN',
  NAZIR_INELIGIBLE: 'BAD_REQUEST',
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4c · POSTGRES SQLSTATE — recognising a guard's refusal without reading its prose
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * `insufficient_privilege` — the SQLSTATE every QMULATE database guard raises with.
 *
 * `qmulate_shart_guard()` (tiers 1–3), `qmulate_asset_identity_guard()`,
 * `qmulate_reversion_taker_no_mutate()`, `reclassification_event_no_mutate` and the audit-spine
 * guards all `RAISE … USING ERRCODE = '42501'`. It is a STABLE MACHINE CODE defined by Postgres, not
 * a message — so matching on it does not violate this file's "never match on prose" rule.
 */
export const POSTGRES_INSUFFICIENT_PRIVILEGE = '42501' as const;

/**
 * Reads a Postgres SQLSTATE off a Prisma error, or `null`.
 *
 * Prisma surfaces a trigger `RAISE` in two shapes depending on the path:
 *  · `$queryRaw`/`$executeRaw` → `PrismaClientKnownRequestError` code `P2010`, with the SQLSTATE on
 *    `meta.code`;
 *  · a model delegate → `PrismaClientUnknownRequestError`, whose `message` carries the driver's own
 *    `ERROR: … (SQLSTATE 42501)` tail and no structured field at all.
 *
 * So `meta.code` is preferred and the message is the FALLBACK — and the fallback pattern matches only
 * the driver's literal `SQLSTATE <5 chars>` token, never any part of the guard's wording. A guard
 * whose English is rewritten must not change how it is classified.
 *
 * ⚠ IT IS NOT AN AUTHORIZATION DECISION AND MUST NEVER BECOME ONE. Its only sanctioned use is at a
 * call site that ALREADY knows which guarded write it attempted, so it can restate the refusal in the
 * domain's own vocabulary (see `endowment.recordDeedTerms`). Deciding what a 42501 MEANS from here
 * would require reading the message, which is exactly what this file forbids — so an unrecognised
 * 42501 is left to become a 500 rather than being downgraded into a tidy 4xx that reads as "handled".
 */
export function postgresSqlState(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;

  const candidate = error as { meta?: unknown; message?: unknown };
  if (typeof candidate.meta === 'object' && candidate.meta !== null) {
    const metaCode = (candidate.meta as { code?: unknown }).code;
    if (typeof metaCode === 'string' && /^[0-9A-Z]{5}$/.test(metaCode)) return metaCode;
  }

  if (typeof candidate.message === 'string') {
    const match = /SQLSTATE\s+([0-9A-Z]{5})/.exec(candidate.message);
    if (match !== null) return match[1] ?? null;
  }
  return null;
}

/** True when `error` is a QMULATE database guard's refusal (SQLSTATE 42501). */
export function isDatabaseGuardRefusal(error: unknown): boolean {
  return postgresSqlState(error) === POSTGRES_INSUFFICIENT_PRIVILEGE;
}

interface CodedError {
  readonly code: string;
  readonly message: string;
}

/** Structural read of the `code` field the database error classes all declare. */
function asCodedError(value: unknown): CodedError | null {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as { code?: unknown; message?: unknown };
  if (typeof candidate.code !== 'string') return null;
  return { code: candidate.code, message: String(candidate.message ?? candidate.code) };
}

/**
 * Builds the `TRPCError` for an {@link ApiError}, preserving `cause` so logs keep the stack.
 *
 * ⚠ **THE MESSAGE IS NARROWED FOR THE NON-DISCLOSURE CLASS, AND THAT IS A SECURITY CONTROL.**
 * This used to be `` `${error.code}: ${error.message}` `` for every code, on the reasoning that a
 * client seeing only `shape.message` could still branch on the code. For {@link
 * NON_DISCLOSURE_CODES} that reasoning inverts: the branch IS the leak. The developer-facing
 * `error.message` is worse still — `middleware/aml.ts` writes a full explanation of the compartment
 * and of who may read it, so a non-member was handed the doctrine along with the refusal.
 *
 * `cause` still carries the true code, the true message and the details, so the audit trail
 * (`recordProcedureDenial`) and the operator log lose nothing: tRPC does not serialise `cause` to
 * the client. Everything narrowed here stays available server-side.
 */
export function apiErrorToTRPCError(error: ApiError): TRPCError {
  const status = API_ERROR_STATUS[error.code];
  const nonDisclosing = isNonDisclosureCode(error.code);
  return new TRPCError({
    code: status,
    // Non-disclosure: the status and nothing else — no code, no detail, one string for all members.
    // Everything else: the machine code travels in the message, so a client that only sees
    // `shape.message` can still branch on it.
    message: nonDisclosing ? NON_DISCLOSURE_WIRE_MESSAGE : `${error.code}: ${error.message}`,
    cause: error,
  });
}

/**
 * THE ONE ERROR TRANSLATION. Every procedure funnels its failures through this.
 *
 * Order of resolution, and why:
 *  1. an existing `TRPCError` passes straight through — a middleware that already decided the
 *     status must not be re-decided;
 *  2. {@link ApiError} → its mapped status;
 *  3. a `@qmulate/database` coded error → {@link DATABASE_ERROR_CODE_TO_API}, or a 500 for the
 *     three codes that mean "the server wrote bad code";
 *  4. a `@qmulate/domain` `DomainError` → {@link DOMAIN_ERROR_CODE_TO_API}, else `BAD_REQUEST`;
 *  5. **anything else → `INTERNAL_SERVER_ERROR`.** FAIL CLOSED: an unrecognised failure is never
 *     downgraded into a tidy 4xx, because a 4xx reads as "handled" and stops anyone looking.
 */
export function toTRPCError(error: unknown): TRPCError {
  if (error instanceof TRPCError) {
    // ⚠ UNWRAP tRPC'S OWN WRAPPER, ONCE. When a middleware or resolver throws a non-`TRPCError`,
    // tRPC captures it through `getTRPCErrorFromUnknown` and hands back a TRPCError with
    // `code: 'INTERNAL_SERVER_ERROR'` and the original on `cause`. Returning that as-is would turn
    // every ladder refusal into a 500 — AC-1 asserts `NOT_FOUND`, and a 500 is also a worse
    // information leak than the 404 it replaced. The recursion terminates because the `cause` chain
    // is finite, and the `!== error` guard covers a self-referential cause.
    if (
      error.code === 'INTERNAL_SERVER_ERROR' &&
      error.cause !== undefined &&
      error.cause !== null &&
      error.cause !== error
    ) {
      const remapped = toTRPCError(error.cause);
      if (remapped.code !== 'INTERNAL_SERVER_ERROR') return remapped;
    }
    return error;
  }

  if (isApiError(error)) return apiErrorToTRPCError(error);

  if (isDomainError(error)) {
    const domain: DomainError = error;
    const mapped = DOMAIN_ERROR_CODE_TO_API[domain.code];
    if (mapped !== undefined) {
      return apiErrorToTRPCError(new ApiError(mapped, domain.message, domain.details));
    }
    // E3: a status other than BAD_REQUEST, with the DomainError kept as `cause` so its own
    // `code` + `errors.domain.<CODE>` key reach `shape.data` untouched. See the table's header.
    return new TRPCError({
      code: DOMAIN_ERROR_CODE_TO_TRPC_STATUS[domain.code] ?? 'BAD_REQUEST',
      message: `${domain.code}: ${domain.message}`,
      cause: domain,
    });
  }

  const coded = asCodedError(error);
  if (coded !== null) {
    if (DATABASE_ERROR_CODES_ARE_SERVER_BUGS.includes(coded.code)) {
      return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `${coded.code}: ${coded.message}`,
        cause: error,
      });
    }
    const mapped = DATABASE_ERROR_CODE_TO_API[coded.code];
    if (mapped !== undefined) {
      return apiErrorToTRPCError(new ApiError(mapped, coded.message));
    }
  }

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: error instanceof Error ? error.message : 'unhandled error',
    cause: error,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · Constructors for the refusals the ladder raises
 *
 * Named constructors rather than bare `new ApiError(...)` at each call site, so the wording of a
 * security refusal is written once and the same non-disclosure discipline applies everywhere.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ THE NON-DISCLOSURE REFUSAL. Never name the endowment's existence, its owner, or the reason.
 *
 * The `details` deliberately carry the requested `waqfId` — that value came FROM the caller, so
 * echoing it discloses nothing they did not already know — and nothing else.
 */
export function noGrant(waqfId: string, permission: string): ApiError {
  return new ApiError(
    'NO_GRANT',
    `no active WaqfAccessGrant for waqf ${waqfId} carrying ${permission}. Deny by default: the ` +
      `default is the GRANT, not the session (§10 principle 1). Surfaced as NOT_FOUND so the ` +
      `endowment's existence is not disclosed (§10 §7.2).`,
    { waqfId, permission },
  );
}

/** The caller holds a grant on this endowment, but not this verb. */
export function permissionDenied(waqfId: string, permission: string, role: string): ApiError {
  return new ApiError(
    'PERMISSION_DENIED',
    `role ${role} holds an active grant on waqf ${waqfId} but not ${permission}. The resolved ` +
      `permission set is grant.permissions ∩ preset(role) — a grant may narrow its role preset, ` +
      `never widen it (§10 principle 3).`,
    { waqfId, permission, role },
  );
}

/** §10 §4.2, before any state change. */
export function segregationOfDuties(details: ApiErrorDetails): ApiError {
  return new ApiError(
    'SEGREGATION_OF_DUTIES',
    `the acting identity is the maker of this request: initiatorUserId === approverUserId is ` +
      `refused before any state change (§10 §4.2, NFR-08). Holding a nazir grant does not lift ` +
      `it — a user who legitimately holds both finance and nazir on one endowment may approve ` +
      `runs initiated by OTHERS, never their own.`,
    details,
  );
}
