/**
 * `distribution/trace.ts` — the `computationTrace` builder and the deterministic canonicalizer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE TRACE IS FOR
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A distribution run decides who in a family receives how much of an endowment's ghallah (غلة),
 * and it will be read years later — by the Nazir signing it, by a beneficiary who disputes it, by
 * the Authority, and possibly by a court. So the run carries its own reasoning: **every waterfall
 * deduction, every resolver decision together with the rule that decided it, every gate outcome,
 * and the residual allocation**, in the order they happened.
 *
 * The trace is **persisted with the run and hashed** by the caller. That single fact drives every
 * design choice below.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY STRUCTURED STEPS AND NOT §08's `z.array(z.string())`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §08 line 267 types the trace as an array of English prose strings. Two consequences make that
 * unusable, and `contract.ts` already corrects it to {@link TraceStep}:
 *
 *  1. **Prose alone is not a machine record.** A stage's decision has to be readable by code — by
 *     the statement renderer, by a report filter, by a future migration — and `code` + `data` is
 *     that record. A sentence is not.
 *  2. **The official statement is Arabic** (NFR-01). Arabic cannot be rendered from English prose;
 *     it is rendered from a machine `code` with `data` supplying the values. `message` is
 *     developer-facing English, exactly like `DomainError.message`, and {@link traceText} exists
 *     for the human/debug view §08 promises.
 *
 * `code` is therefore the stable identifier. **Renaming a trace code is a breaking change** to
 * every stored run hash; the stage modules own their own codes and say so in their headers.
 *
 * ⚠ **BUT THE ENGLISH PROSE IS STILL INSIDE THE HASHED BYTES, and structuring the step did not
 * change that.** {@link canonicalizeResult} walks the WHOLE `DistributionResult`, `message`
 * included, so a typo fix or copy-edit to any trace message changes the canonical bytes and
 * therefore the run digest — exactly the consequence an earlier version of this header claimed the
 * structured step had removed. It had not; the claim was wrong and is corrected here rather than
 * left for the next reader to believe. Measured, not inferred: replacing one character of
 * `INPUT_PARSED`'s message makes `canonicalizeResult` return different bytes.
 *
 * What follows from that, for whoever wires the signer (S7 / E10):
 *  · Treat every trace `message` in this folder as **frozen copy**, on the same footing as a trace
 *    `code`. Editing one is a schema-level change to stored run hashes, not a cosmetic fix.
 *  · Whether the Nazir's signature SHOULD cover developer-facing English at all is a product/legal
 *    scope call, not a mechanical one: narrowing the canonical form to `{stage, code, data}` would
 *    free the copy but would also shrink what the signature attests to, and it invalidates every
 *    digest stored before the change. Surfaced, deliberately not decided here (binding rule 4).
 *  · Until it is decided, `traceText` is the safe place for wording that may need to change: it
 *    renders from the entries and is not part of the result.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * DETERMINISM (§08 I8) — WHAT IS ENFORCED HERE, MECHANICALLY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  · **Sequence numbers are assigned once, in insertion order**, by the one builder the engine
 *    threads through every stage. A stage never numbers its own steps, so two stages cannot
 *    disagree about ordering and a reordering of the stages is visible in the numbers.
 *  · **No object-key iteration order is ever load-bearing.** {@link canonicalizeResult} sorts every
 *    key; `data` is rendered from a sorted key list in {@link traceText}. `Object.keys` order is
 *    specified for string keys, but relying on it would make an innocuous field reorder in
 *    `contract.ts` change a hash.
 *  · **No locale anywhere.** No `localeCompare` (its ordering follows the host's ICU data, which
 *    would make a hash — and, through the residual tie-break, a payout — host-dependent), no
 *    `toLocaleString`, no `Intl`. String order is UTF-16 code units, which is fixed.
 *  · **No clock, no randomness, no I/O.** A `seq` is a counter, not a timestamp: a timestamp would
 *    make a replay of the same input produce a different hash, which is exactly what I8 forbids.
 *  · **`data` values must be strings.** {@link add} refuses anything else. A `bigint` in `data`
 *    would make the caller's `JSON.stringify` throw at persistence time — i.e. after the run was
 *    computed and shown — and a `number` would put float formatting on the hashed surface.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HASHING STAYS WITH THE CALLER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * {@link canonicalizeResult} returns the exact bytes to hash; it does not hash them.
 * `packages/domain` has no crypto and no `node:` imports at all (the eslint domain block bans
 * them), and the audit spine that stores the digest lives in `@qmulate/database`. Keeping the
 * *serialization* here and the *digest* there means both sides of a stored hash are derived from
 * one canonical form rather than from two hand-written serializers that could drift.
 *
 * `JSON.stringify` cannot be used directly: it **throws on a `bigint`**, and every monetary field
 * in the result is one. Minor units are rendered as their exact base-10 **halala** string — the
 * engine's own unit, so no scaling or rounding step sits between the numbers and the hash.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * NO PII (AT-16)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The trace holds **ids only, never names**. `beneficiaryInputSchema` has no `name` field at all,
 * which is the structural half of that guarantee; this module's half is that it copies only what a
 * stage hands it and never enriches a step from anywhere else.
 */

import { DomainError } from '../errors.js';
import { TRACE_STAGES } from './contract.js';
import type { DistributionResult, TraceEntry, TraceStage, TraceStep } from './contract.js';

/**
 * A trace code is a machine identifier, not a label: `SCREAMING_SNAKE`, no spaces, no punctuation.
 *
 * Enforced at insertion rather than trusted, because a code is what the Arabic statement copy and
 * every stored run hash key on. A code containing a space or a lower-case word is a code somebody
 * intended as prose, and prose belongs in `message`.
 */
const TRACE_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/**
 * UTF-16 code-unit order — the same fixed rule as `contract.ts`'s `compareBeneficiaryIds`, spelled
 * separately here because this one orders *object keys*, not beneficiary ids.
 *
 * **Never `localeCompare`.** Under a different ICU locale `'a'` and `'A'` can swap, and the
 * canonical bytes — and therefore the run's hash — would depend on the host that produced them.
 */
function compareKeys(a: string, b: string): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function isTraceStage(value: unknown): value is TraceStage {
  return typeof value === 'string' && (TRACE_STAGES as readonly string[]).includes(value);
}

/**
 * Build one trace step.
 *
 * A thin, validated constructor rather than an object literal: it is the single place a step's
 * shape is checked, so a stage cannot contribute a step that only fails later, at persistence time,
 * when the run has already been computed and displayed.
 *
 * `data` is omitted from the returned object when absent — never set to `undefined`. An absent key
 * and a `key: undefined` serialize differently, and the trace is hashed.
 *
 * @throws `DISTRIBUTION_INVARIANT_BREACH` — an unknown stage, a non-conforming code, a blank
 *   message, or a `data` value that is not a string. All four are engine defects, not bad input.
 */
export function step(
  stage: TraceStage,
  code: string,
  message: string,
  data?: Readonly<Record<string, string>>,
): TraceStep {
  assertStepWellFormed({ stage, code, message, ...(data === undefined ? {} : { data }) });
  return data === undefined
    ? Object.freeze({ stage, code, message })
    : Object.freeze({ stage, code, message, data: Object.freeze({ ...data }) });
}

function assertStepWellFormed(candidate: TraceStep): void {
  if (!isTraceStage(candidate.stage)) {
    throw new DomainError(
      'DISTRIBUTION_INVARIANT_BREACH',
      `trace step carries stage ${JSON.stringify(candidate.stage)}, which is not one of TRACE_STAGES (${TRACE_STAGES.join(', ')}). The stage list is closed so a run's trace can be grouped and rendered without a lookup table of unknown values.`,
      { details: { stage: String(candidate.stage), code: candidate.code } },
    );
  }

  if (!TRACE_CODE_PATTERN.test(candidate.code)) {
    throw new DomainError(
      'DISTRIBUTION_INVARIANT_BREACH',
      `trace code ${JSON.stringify(candidate.code)} is not a SCREAMING_SNAKE machine identifier. Codes are what the Arabic statement copy and every stored run hash key on; prose belongs in \`message\`.`,
      { details: { stage: candidate.stage, code: candidate.code } },
    );
  }

  if (candidate.message.trim() === '') {
    throw new DomainError(
      'DISTRIBUTION_INVARIANT_BREACH',
      `trace step ${candidate.stage}/${candidate.code} carries no message. A step with no explanation is not a defensible record of a decision.`,
      { details: { stage: candidate.stage, code: candidate.code } },
    );
  }

  if (candidate.data === undefined) return;

  for (const [key, value] of Object.entries(candidate.data)) {
    if (typeof value !== 'string') {
      throw new DomainError(
        'DISTRIBUTION_INVARIANT_BREACH',
        `trace step ${candidate.stage}/${candidate.code} carries a non-string value for data.${key} (${typeof value}). Every trace datum is a string: a bigint would make the caller's JSON.stringify throw at persistence time, and a number would put float formatting on the hashed surface.`,
        { details: { stage: candidate.stage, code: candidate.code, key, valueType: typeof value } },
      );
    }
  }
}

/**
 * The one place a trace step is given its sequence number.
 *
 * Stages emit un-numbered {@link TraceStep}s and the engine threads a single builder through all of
 * them, so the numbering reflects the actual order of execution and no two stages can disagree
 * about it.
 */
export interface TraceBuilder {
  /** Append one step. Validated on the way in (see {@link step}). */
  add(entry: TraceStep): void;
  /** Append a stage's whole fragment, in order. */
  addAll(entries: readonly TraceStep[]): void;
  /** The numbered trace so far. Frozen — the returned array is not a live view. */
  entries(): readonly TraceEntry[];
}

/** `seq` of the first step. 1-based so a trace reads as "step 1 of N" in a review or a dispute. */
const FIRST_SEQ = 1;

export function createTraceBuilder(): TraceBuilder {
  const entries: TraceEntry[] = [];

  const add = (entry: TraceStep): void => {
    assertStepWellFormed(entry);
    const seq = entries.length + FIRST_SEQ;
    entries.push(
      entry.data === undefined
        ? Object.freeze({ seq, stage: entry.stage, code: entry.code, message: entry.message })
        : Object.freeze({
            seq,
            stage: entry.stage,
            code: entry.code,
            message: entry.message,
            data: Object.freeze({ ...entry.data }),
          }),
    );
  };

  return {
    add,
    addAll(fragment: readonly TraceStep[]): void {
      for (const entry of fragment) add(entry);
    },
    entries(): readonly TraceEntry[] {
      // A copy, so a caller holding the result cannot append to a run that has already been
      // asserted, hashed and signed.
      return Object.freeze([...entries]);
    },
  };
}

/**
 * The human/debug view §08 promises — one line per step, deterministic.
 *
 * Developer-facing English, for a test failure, a log line or a reviewer reading a run. **Not** the
 * beneficiary's statement: that is Arabic (NFR-01), rendered from `stage`/`code` through
 * `@qmulate/i18n`, and this function is deliberately not on that path.
 *
 * `data` pairs are emitted in sorted key order so the text is stable under a field reorder upstream.
 */
export function traceText(entries: readonly TraceEntry[]): readonly string[] {
  return Object.freeze(
    entries.map((entry) => {
      const head = `#${String(entry.seq)} [${entry.stage}] ${entry.code} — ${entry.message}`;
      if (entry.data === undefined) return head;
      const pairs = Object.keys(entry.data)
        .sort(compareKeys)
        .map((key) => `${key}=${entry.data?.[key] ?? ''}`);
      return pairs.length === 0 ? head : `${head} (${pairs.join('; ')})`;
    }),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Canonical serialization — the exact bytes the caller hashes
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Serialize a result to a canonical, byte-stable JSON string.
 *
 * Guarantees, each one load-bearing for a stored hash:
 *
 *  · **Object keys are sorted** (UTF-16 code units), so reordering a field in `contract.ts` — or a
 *    stage building an object in a different order — cannot change the bytes.
 *  · **`bigint` renders as its exact base-10 halala string.** `JSON.stringify` throws on a bigint,
 *    and every monetary field here is one. Halalas rather than SAR because halalas are the engine's
 *    own unit: no scaling or rounding step sits between the numbers and the digest.
 *  · **Arrays keep their order**, which is semantic: `lines` is ascending `beneficiaryId` (the
 *    residual tie-break is defined in those terms) and `computationTrace` is chronological.
 *  · **`undefined` is omitted, never emitted.** An absent key and a `key: undefined` are different
 *    bytes; `TraceStep.data` is the one optional field in the whole output.
 *  · **No locale, no clock, no host-dependent formatting.**
 *
 * @throws `DISTRIBUTION_INVARIANT_BREACH` — a value the canonical form cannot represent (a
 *   function, a symbol, a non-finite number, a `Date`, a `Map`). Refusing beats silently dropping
 *   it: a value missing from the canonical bytes is a value the signature does not cover.
 */
export function canonicalizeResult(result: DistributionResult): string {
  return canonicalize(result, 'result');
}

function canonicalize(value: unknown, path: string): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'boolean':
      return value ? 'true' : 'false';
    case 'bigint':
      // Halalas, exact. Quoted so a consumer cannot re-read it as a JS number and lose precision.
      return JSON.stringify(value.toString());
    case 'number': {
      if (!Number.isFinite(value)) {
        throw canonicalizationFailure(
          path,
          `the number ${String(value)} is not finite, so it has no canonical JSON form`,
        );
      }
      // Every `number` in a `DistributionResult` is an integer count (a ṭabaqa, a line count, a
      // day difference, a month count, a seq). A fractional one would mean a float reached a field
      // that models a count.
      if (!Number.isInteger(value)) {
        throw canonicalizationFailure(
          path,
          `${String(value)} is not an integer. Every numeric field in a distribution result is a count; money is bigint halalas`,
        );
      }
      // `-0` stringifies as `0`, so the canonical form of zero is unique.
      return JSON.stringify(value === 0 ? 0 : value);
    }
    case 'object':
      break;
    default:
      throw canonicalizationFailure(
        path,
        `a value of type ${typeof value} has no canonical JSON form`,
      );
  }

  if (Array.isArray(value)) {
    const parts = value.map((element, index) => {
      if (element === undefined) {
        throw canonicalizationFailure(
          `${path}[${String(index)}]`,
          'an array hole / undefined element cannot be canonicalized — the signature would not cover it',
        );
      }
      return canonicalize(element, `${path}[${String(index)}]`);
    });
    return `[${parts.join(',')}]`;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    throw canonicalizationFailure(
      path,
      `expected a plain object; received an instance of ${(value as object).constructor?.name ?? 'an unknown class'}. A Date, Map, Set or class instance has no canonical form here and must be reduced to primitives before it reaches the result`,
    );
  }

  const record = value as Readonly<Record<string, unknown>>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort(compareKeys)) {
    const member = record[key];
    // Omitted rather than emitted as `null`: `TraceStep.data` is optional, and an absent key must
    // serialize as absent so a step with no data hashes identically wherever it was built.
    if (member === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${canonicalize(member, `${path}.${key}`)}`);
  }
  return `{${parts.join(',')}}`;
}

function canonicalizationFailure(path: string, reason: string): DomainError {
  return new DomainError(
    'DISTRIBUTION_INVARIANT_BREACH',
    `canonicalizeResult cannot serialize ${path}: ${reason}. The canonical form is what the Nazir's signature covers, so an unrepresentable value is refused rather than dropped.`,
    { details: { path, reason } },
  );
}
