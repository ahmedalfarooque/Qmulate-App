/**
 * `compliance/disclosure.ts` — the ONE decision every outbound signal has to ask.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS BEFORE THE PIPELINE IT GUARDS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §09's no-tipping-off rules 1 and 5 are the two E7 cannot prove:
 *
 *   1. *"No notification, email, in-app alert, activity-feed item, or export ever references an AML
 *      report to the subject or to any non-AML role. The AML compartment emits nothing into the
 *      general notification/escalation pipeline."*
 *   5. *"Evidence packs and regulator/auditor exports OMIT `AML_RESTRICTED` content."*
 *
 * **MEASURED: nothing in this codebase emits an outbound signal at all.** No notification writer
 * (the `Notification` table's only `.create` references are doc comments inside the GENERATED Prisma
 * client), no mail/SMS/push dependency in any `package.json`, `AuditAction.EXPORT` emitted by
 * nobody, `apps/worker` logging nine job names and exiting 0 without opening a database connection,
 * and `packages/jobs`' `InMemoryJobQueue` imported by nothing outside its own test.
 *
 * So a test asserting *"no notification referenced the SAR"* passes **over an empty universe**. By
 * this repository's own standard — CENSUS-1's founding lesson, and R6-C1's *"a property whose
 * generator cannot reach a configuration reports its silence as success, at scale"* — that is not a
 * green rule. It is an unasked question wearing a tick.
 *
 * ── SO THE DELIVERABLE IS NOT A GREEN NEGATIVE. IT IS A MECHANISM THAT GOES RED LATER. ───────
 * Two halves, and the second is the load-bearing one:
 *
 *  · {@link mayDispatch} — a pure, total, fail-closed decision. When E8 writes the deadline
 *    engine's reminders and E9 the evidence-pack export, there is exactly one function for them to
 *    ask, and it already refuses everything restricted.
 *  · `__tests__/no-tipping-off.test.ts`'s SOURCE CENSUS — it asserts the outbound universe is still
 *    empty AND enumerates precisely what would count as an outbound path. **The day E8 or E9 adds
 *    one, that census goes RED and names this file.** A seam nobody is obliged to use is not a
 *    control; the census is the obligation.
 *
 * ⚠ This module makes no claim to *be* G-6. G-6 is *"a SAR is visible only to the compartment; no
 * notification reaches the subject"*, and the second clause stays **NOT PROVEN** until a pipeline
 * exists to be silent. What is proven here is the decision it will have to route through, and that
 * the decision refuses the right things — which is worth shipping early precisely because the
 * alternative is a pipeline built first and audited afterwards.
 *
 * Pure: no I/O, no clock, no database. It is handed a classification and returns a verdict.
 */

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The channels §09 names
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Every kind of outbound signal this product can ever grow, taken from §09 rules 1, 2 and 5 rather
 * than from imagination.
 *
 * ⚠ `DASHBOARD_AGGREGATE` is here because a COUNT is a disclosure. §09 rule 2 says the subject's
 * observable state must be unchanged in any AML-attributable way, and §10 §6 says the compartment
 * must not appear "greyed-out or count-only" — so a tile reading "3 open compliance matters" where a
 * non-member should see 2 is a tip-off with no content in it at all. The compartment's read
 * subtraction already handles this at the database; the channel is enumerated so a future aggregate
 * built OUTSIDE the force filter has somewhere to be refused.
 *
 * ⚠ `AUDIT_FEED` is deliberately NOT here. The audit trail is not an outbound signal — it is the
 * record, and §09 rule 3 requires the AML action to BE logged (carrying `RESTRICTED`) rather than
 * suppressed. Its visibility is `auditCompartmentClause`'s job. Putting it in this list would invite
 * somebody to "protect" the trail by not writing it.
 */
export const OUTBOUND_CHANNELS = [
  'NOTIFICATION',
  'ESCALATION',
  'ACTIVITY_FEED',
  'EXPORT',
  'EVIDENCE_PACK',
  'DASHBOARD_AGGREGATE',
] as const;

export type OutboundChannel = (typeof OUTBOUND_CHANNELS)[number];

/** Narrowing guard. An unrecognised channel is REFUSED by {@link mayDispatch}, never permitted. */
export function isOutboundChannel(value: string): value is OutboundChannel {
  return (OUTBOUND_CHANNELS as readonly string[]).includes(value);
}

/**
 * The row-level confidentiality classes — `schema.prisma`'s `enum Confidentiality`.
 *
 * Restated here rather than imported because `packages/domain` imports nothing internal, and pinned
 * against the schema by `__tests__/compliance-parity.test.ts` for the reason every vocabulary in this
 * repository is pinned: an uncompared second spelling is the defect this project has been bitten by
 * five times.
 */
export const CONFIDENTIALITY_CLASSES = ['NORMAL', 'SENSITIVE_PII', 'AML_RESTRICTED'] as const;

export type ConfidentialityClass = (typeof CONFIDENTIALITY_CLASSES)[number];

/** `schema.prisma`'s `enum AuditClassification`. Same pinning, same reason. */
export const AUDIT_CLASSIFICATIONS = ['ROUTINE', 'SENSITIVE', 'RESTRICTED'] as const;

export type AuditClassificationClass = (typeof AUDIT_CLASSIFICATIONS)[number];

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The decision
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Why a dispatch was refused. Machine codes; the ar/en wording is not this module's business. */
export const DISPATCH_REFUSALS = [
  /** The payload is `AML_RESTRICTED`. §09 rule 1 / rule 5 — the compartment emits nothing. */
  'AML_RESTRICTED_PAYLOAD',
  /** The payload's audit classification is `RESTRICTED`, which covers AML SAR events. */
  'RESTRICTED_CLASSIFICATION',
  /** The channel is not in {@link OUTBOUND_CHANNELS}. Fail closed — see {@link mayDispatch}. */
  'UNRECOGNISED_CHANNEL',
  /** The confidentiality class is not one this module knows. Fail closed. */
  'UNRECOGNISED_CONFIDENTIALITY',
  /** The audit classification is not one this module knows. Fail closed. */
  'UNRECOGNISED_AUDIT_CLASSIFICATION',
] as const;

export type DispatchRefusal = (typeof DISPATCH_REFUSALS)[number];

export interface DispatchVerdict {
  readonly permitted: boolean;
  /** Present exactly when `permitted` is false. */
  readonly refusal: DispatchRefusal | null;
  /** The channel as given, echoed so a caller logging a refusal does not have to re-derive it. */
  readonly channel: string;
}

/**
 * May this payload leave the system on this channel?
 *
 * ── TOTAL, AND FAIL-CLOSED ON EVERY UNKNOWN ──────────────────────────────────────────────────
 * Every argument is a `string`, not a narrow union, **on purpose**. A caller resolving a
 * classification off a database row has a `string`, and a signature demanding the narrow type would
 * push the cast to the security-relevant side of the boundary — where a `as ConfidentialityClass`
 * silently turns an unrecognised value into a permitted one. Here an unrecognised value is a
 * REFUSAL with its own code, so a schema that gains a fourth confidentiality class starts refusing
 * outbound dispatch of it until somebody decides, rather than starting to send it.
 *
 * That is the same posture `obligationsForClassification` takes with an unreadable gate, and the
 * opposite of the mistake this repository has made twice: a control keyed on a vocabulary it does
 * not re-check.
 *
 * ⚠ **`SENSITIVE_PII` IS PERMITTED HERE, AND THAT IS NOT AN OVERSIGHT.** A beneficiary's own
 * distribution statement is `SENSITIVE_PII` and reaching them is the entire point of BR-505. This
 * function answers "is this a TIPPING-OFF disclosure", not "is this data sensitive" — who may
 * receive a permitted payload is the access matrix's question, and conflating the two would either
 * block every statement or, far worse, invite somebody to relax this function so statements can go
 * out.
 */
export function mayDispatch(args: {
  readonly channel: string;
  readonly confidentiality: string;
  readonly auditClassification: string;
}): DispatchVerdict {
  const { channel, confidentiality, auditClassification } = args;

  const refuse = (refusal: DispatchRefusal): DispatchVerdict =>
    Object.freeze({ permitted: false, refusal, channel });

  // Unknowns first, so a mis-typed channel can never be the reason a restricted payload LOOKS
  // permitted by falling through to a default.
  if (!isOutboundChannel(channel)) return refuse('UNRECOGNISED_CHANNEL');
  if (!(CONFIDENTIALITY_CLASSES as readonly string[]).includes(confidentiality))
    return refuse('UNRECOGNISED_CONFIDENTIALITY');
  if (!(AUDIT_CLASSIFICATIONS as readonly string[]).includes(auditClassification))
    return refuse('UNRECOGNISED_AUDIT_CLASSIFICATION');

  if (confidentiality === 'AML_RESTRICTED') return refuse('AML_RESTRICTED_PAYLOAD');
  if (auditClassification === 'RESTRICTED') return refuse('RESTRICTED_CLASSIFICATION');

  return Object.freeze({ permitted: true, refusal: null, channel });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · What a future pipeline must not do, written down while there is no pipeline
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The outbound paths that do not exist yet, each with what it must do when it does.
 *
 * ⚠ **THIS IS NOT DOCUMENTATION — `__tests__/no-tipping-off.test.ts` ASSERTS EACH ONE IS STILL
 * ABSENT.** The moment E8 writes a notification or E9 an export, the census goes RED, names the
 * path, and points at {@link mayDispatch}. That is the difference between a rule and a hope: E7
 * cannot prove rules 1 and 5, but it can make them impossible to violate silently.
 *
 * Keyed by a source-level marker the census greps for, so the assertion and the prose cannot drift.
 */
export const ABSENT_OUTBOUND_PATHS: Readonly<Record<string, string>> = Object.freeze({
  // ⊕ `notification.create` WAS HERE AND IS GONE — S9-3d, 2026-08-27. Kept as a comment rather than
  // deleted silently, because the transition is the point of the whole census.
  //
  // The entry read: *"THE NOTIFICATION WRITER (E8) … Whoever writes the first one must ask
  // `mayDispatch` with channel NOTIFICATION before persisting, and must NOT resolve the payload's
  // classification with a cast: pass the string off the row and let the fail-closed branch do its
  // work. ⚠ Note the table has no `confidentiality` column of its own, so the classification has to
  // come from the SUBJECT row — which is exactly where a 'the notification is about something
  // restricted' bug lives."*
  //
  // WHAT ACTUALLY HAPPENED, in order: `deadline.evaluate` was written; this census went RED on its
  // first run and named `packages/api/src/routers/deadline.ts`; the writer was already routing both
  // channels through `mayDispatch`; and the classification is read off the bound `ComplianceTask`
  // AND its obligation as strings, with the STRICTER of the two winning and an unbound deadline
  // treated as UNCLASSIFIABLE rather than as ordinary — so `mayDispatch`'s fail-closed branch
  // refuses a signal whose subject cannot be classified, instead of a cast quietly making it
  // `NORMAL`. That last line is the one this entry was warning about.
  //
  // The marker is removed because the REAL negative test now exists and is what carries the rule:
  // `packages/api/test/no-tipping-off-dispatch.integration.test.ts` measures a SAR-subject duty
  // emitting NOTHING **beside a positive control that emits**, against the same dispatcher, in the
  // same run. That is the "assert nothing was emitted, against a dispatcher that COULD have
  // emitted" this census demanded — not a green negative over an empty universe.
  'AuditAction.EXPORT':
    'THE EXPORT / EVIDENCE-PACK SURFACE (E9/E12). `AuditAction.EXPORT` is declared in the enum and ' +
    "emitted by nobody, so BR-906's auditor evidence pack does not exist. §09 rule 5 says exports " +
    'OMIT AML_RESTRICTED content unless the export IS an AML/FIU export invoked by a cleared user — ' +
    'so the export builder needs `mayDispatch` per row, not per pack, and the AML-export case is a ' +
    'DIFFERENT channel rather than an exception carved into this one.',
  InMemoryJobQueue:
    'THE JOB PIPELINE. ⊕ S10/T1 (2026-09-01) UPDATED THE FACTS AND KEPT THE MARKER — the pg-boss ' +
    'TRANSPORT now exists (`PgBossJobQueue`, `@qmulate/jobs/pgboss`, its own role and schema) and ' +
    '`apps/worker` boots it when PGBOSS_DATABASE_URL is present, so "imported by nothing" and ' +
    '"without opening a database connection" stopped being true. What is STILL true, and is what ' +
    'this marker tracks: the handler registry is EMPTY, no schedule is registered, nothing is ' +
    'enqueued, and the escalation pipeline still does not run — a transport is not a pipeline. ' +
    'This entry closes only when the T2 caller wires the escalation path through `mayDispatch` on ' +
    'a real schedule, and its measured no-tip-off proof exists. Original text continues: ' +
    'when the queue is wired, the escalation loop is the highest-risk path in this whole rule: ' +
    '§09 rule 1 singles out the ESCALATION pipeline, and an overdue GOV-AML-02 obligation ' +
    'escalating to Leadership is a tip-off delivered by a cron job. ' +
    '⊕ S9-3d, 2026-08-27 — THIS MARKER DELIBERATELY STAYS, and the reason is worth reading. The ' +
    "evaluator's DECISIONS and its outbound gate shipped in S9-3d (`deadline.evaluate`), and the " +
    'ESCALATION channel is gated exactly as this entry demands. What did NOT ship is the worker ' +
    'running it on a schedule — because `apps/worker` cannot: `deadline.evaluate` is a maker ' +
    'procedure, the ladder demands an active WaqfAccessGrant, and a SYSTEM actor holds none. ' +
    'Giving the cron a standing compliance seat is an ACCESS-MATRIX decision, and moving the ' +
    'evaluator below the procedure ladder weakens a control that exists to be un-weakenable — so ' +
    "both were routed rather than chosen, and the runner stays E9's, which is what " +
    "`apps/worker/src/index.ts`'s own header already says. Deleting this marker now would claim a " +
    'pipeline that does not exist, which is the exact "green negative over an empty universe" this ' +
    'census was built to refuse.',
});
