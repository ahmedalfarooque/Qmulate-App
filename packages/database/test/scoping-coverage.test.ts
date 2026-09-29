/**
 * `scoping-coverage.test.ts` — the pin `client.ts` said already existed.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS: A COMMENT CLAIMED A CONTROL, AND THE CONTROL WAS NEVER CALLED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `assertScopingCoverage()` (`src/extensions/scoping.ts`) shipped with the docstring *"Call from a
 * unit test."* **Nothing called it.** Measured before this file was written: the only occurrences
 * repo-wide were its definition, its re-export from `src/index.ts`, and two comments describing it
 * as the guard.
 *
 * And `client.ts`'s comment on `GUARDED_DELEGATES` went further, asserting a property the function
 * does not have and never had:
 *
 *   > `assertScopingCoverage` already pins `ALL_MODELS` against `schema.prisma`, so the two cannot
 *   > drift apart silently.
 *
 * It does not compare anything to `schema.prisma`. It walks `ALL_MODELS` — a hand-written array —
 * and checks each member is classified exactly once. That is a real and worthwhile property, but it
 * is a statement about the array's internal consistency, not about whether the array knows what the
 * schema contains. **A model added to `schema.prisma` and forgotten in `ALL_MODELS` was invisible to
 * both the function and the comment.** That model then gets no scope classification, no write
 * policy, no membership of `GUARDED_DELEGATES`, and no place in the beneficiary write sweep — and
 * because `GUARDED_DELEGATES` is *derived from `ALL_MODELS`*, the derivation everyone trusted was
 * only ever as complete as the array it derived from.
 *
 * This is the fourth false-correctness comment on this record, and S3's standing lesson applies
 * verbatim: **assume a comment asserting a correctness property is false until a test makes it
 * load-bearing.**
 *
 * ── WHY IT MATTERS RIGHT NOW, AND NOT AS TIDYING ──────────────────────────────────────────────
 * E7 adds tables (the obligation register's provenance columns, and the AML SAR compartment's own
 * models). A new table born outside `ALL_MODELS` is born *unscoped*, and an unscoped AML table is
 * not a leak that needs a bug — it is the default. This file has to exist before those tables do.
 *
 * ── A UNIT TEST ON PURPOSE ────────────────────────────────────────────────────────────────────
 * Reads `schema.prisma` as TEXT and touches no database, so it runs on a laptop with no Postgres
 * and in CI's Unit job on every branch. A coverage check that only ran in the integration job would
 * be skipped exactly when someone is iterating on the schema. (`schema.prisma` is in `turbo.json`'s
 * `globalDependencies`, so a schema edit invalidates this task's cache — the S6 lesson: a test whose
 * cache key cannot see what it reads is a test that reports its silence as success.)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  ALL_MODELS,
  BENEFICIARY_FORBIDDEN_MODELS,
  WAQF_DIRECT_SCOPED_MODELS,
  assertScopingCoverage,
} from '../src/extensions/scoping.js';

const SCHEMA = readFileSync(
  fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url)),
  'utf8',
);

/**
 * Every `model X { … }` name declared in the schema.
 *
 * Deliberately NOT the generated Prisma client's `Prisma.ModelName`: a generated artefact can be
 * stale, and this comparison exists to catch a schema change that nobody regenerated for. The
 * schema text is the only side that cannot lie about what the next `migrate deploy` will create.
 */
function schemaModels(): readonly string[] {
  return [...SCHEMA.matchAll(/^model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{/gm)].map((match) => match[1]!);
}

describe('the schema read is trustworthy', () => {
  it('found schema.prisma, and the model parser really matches models', () => {
    // Without this, every assertion below is vacuously true over an empty parse — the exact shape
    // (CENSUS-1, R6-C1) that lets a control report its own silence as success.
    expect(SCHEMA.length).toBeGreaterThan(1000);
    expect(schemaModels().length).toBeGreaterThanOrEqual(38);
  });

  it('POSITIVE CONTROL — the parser finds models this test names by hand', () => {
    // A regex that silently stopped matching would make the parity test below pass by finding
    // nothing on one side. Anchor it on models that must exist for the product to mean anything.
    const models = schemaModels();
    for (const name of [
      'Waqf',
      'Beneficiary',
      'AuditEvent',
      'ComplianceTask',
      'ComplianceObligation',
    ])
      expect(models, `${name} is missing from the schema parse`).toContain(name);
  });

  it('NEGATIVE CONTROL — a model that does not exist is not reported as present', () => {
    expect(schemaModels()).not.toContain('ThisModelDoesNotExist');
  });
});

describe('assertScopingCoverage — now actually called', () => {
  it('every model in ALL_MODELS is classified exactly once', () => {
    // The property the function always had, and which nothing ever exercised. It throws with the
    // offending model names, so a failure here reads as "X is not classified" rather than as a
    // boolean.
    expect(() => assertScopingCoverage()).not.toThrow();
  });
});

describe('ALL_MODELS vs schema.prisma — the pin client.ts claimed', () => {
  it('every model in the schema is in ALL_MODELS', () => {
    // THE DANGEROUS DIRECTION, and the one nothing checked. A model here and not there is born
    // unscoped: no scope classification, no write policy, absent from GUARDED_DELEGATES (which is
    // derived from ALL_MODELS, so its "derived rather than hand-listed" guarantee inherits this
    // array's blind spots), and absent from the beneficiary write sweep.
    const missing = schemaModels().filter(
      (model) => !(ALL_MODELS as readonly string[]).includes(model),
    );
    expect(
      missing,
      `schema.prisma declares ${missing.length} model(s) absent from ALL_MODELS: ${missing.join(', ')}. ` +
        'A model outside ALL_MODELS is UNSCOPED — add it to exactly one scoping list in ' +
        'src/extensions/scoping.ts. If it is genuinely global reference data, that list is ' +
        'UNSCOPED_MODELS, which is a decision to record rather than a default to fall into.',
    ).toEqual([]);
  });

  it('every model in ALL_MODELS is in the schema', () => {
    // The harmless direction, asserted anyway: a stale entry means a scoping list is describing a
    // table that no longer exists, and the next reader trusts it.
    const models = new Set(schemaModels());
    const stale = (ALL_MODELS as readonly string[]).filter((model) => !models.has(model));
    expect(stale, `ALL_MODELS names ${stale.length} model(s) the schema does not declare`).toEqual(
      [],
    );
  });

  it('BENEFICIARY_FORBIDDEN_MODELS names only real models', () => {
    // A typo here fails OPEN: the beneficiary branch would fall through to DIRECT_SET and hand a
    // portal session every row on their endowment, which is the hole already closed once for
    // AuditEvent. A misspelled entry looks exactly like a closed hole.
    const models = new Set(schemaModels());
    for (const model of BENEFICIARY_FORBIDDEN_MODELS)
      expect(models, `BENEFICIARY_FORBIDDEN_MODELS names ${model}, which is not a model`).toContain(
        model,
      );
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * CENSUS-P · WHAT A PORTAL SESSION MAY READ IS A DECLARATION, NOT A DEFAULT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `scopeFilter`'s beneficiary branch cases six models explicitly, refuses everything in
 * `BENEFICIARY_FORBIDDEN_MODELS`, and then `default: break`s onto the ordinary endowment filter
 * `{waqfId: {in: ids}}`. That default is SILENT: a table added to the schema becomes readable by
 * every portal session on its endowment, for the whole endowment, without anybody deciding so.
 *
 * That is not a hypothesis. It is how the `AuditEvent` hole happened (a portal seat could enumerate
 * the endowment's entire activity trail — measured at 31 events on the fixture DB, every staff
 * actorId and the before/after image of every row), how the `WaqfAccessGrant` hole happened (a
 * portal seat could rewrite its own grant to `NAZIR`), and how the whole compliance plane was
 * readable until S8.
 *
 * So this census closes the DEFAULT rather than the individual holes: every endowment-scoped model
 * must be in exactly one of three declared buckets. A new table lands in none of them and this test
 * fails, which forces the decision at the moment the table is written instead of at the moment
 * somebody audits it. Same principle as the guard-verb censuses, applied to a read filter.
 */

/** Cased explicitly inside the beneficiary branch — read the switch, not this list. */
const PORTAL_CASED_MODELS = [
  'Beneficiary',
  'DistributionLineItem',
  'Document',
  'Transaction',
  'AuditEvent',
  'User',
] as const;

/**
 * Models a portal session STILL reads under the ordinary endowment filter.
 *
 * ⚠ TWO OF THESE ARE PROVEN NECESSARY. The rest are UNDECIDED AND CURRENTLY PERMITTED, which is
 * the honest state and is why they are written down rather than left to `default: break`.
 *
 *  · `Setting` and `TrusteeshipDeed` — MEASURED necessary. Making the branch fail-closed
 *    wholesale turned 9 api integration tests red across 3 files: the deed reads (the owner's
 *    Q-E4-1(a) ruling — every beneficiary principal may read THAT waqf's deed) and, less obviously,
 *    every beneficiary read at all, because the registry resolves `kyc.refreshIntervalMonths` from
 *    `Setting` and a regulatory figure has no hardcoded default — so an empty `Setting` filter
 *    surfaced as `SETTING_MISSING`, not as a narrower result.
 *  · The others are readable today and nobody has ruled on whether they should be. A beneficiary
 *    can enumerate their endowment's assets, its expropriations, its budget, its leases, its
 *    reclassification history and its distribution-run headers. Some of that is arguably theirs to
 *    see; `Lease` and `Budget` carry third-party commercial terms and probably are not. It is a
 *    product/access question (BR-210 / BR-702), not a bug to fix silently in a database extension,
 *    and it is out of E7's scope — recorded here so it is a named decision owed rather than a
 *    silence nobody can see. The portal itself is Phase 2, so nothing renders any of it yet.
 */
const PORTAL_FALLTHROUGH_MODELS = [
  'Setting',
  'TrusteeshipDeed',
  'WaqfReversionTaker',
  'Asset',
  'Expropriation',
  'Budget',
  'Distribution',
  'ReclassificationEvent',
  'Lease',
] as const;

describe('CENSUS-P · every endowment-scoped model declares what a portal session sees', () => {
  it('the three buckets are disjoint', () => {
    const all = [
      ...PORTAL_CASED_MODELS,
      ...BENEFICIARY_FORBIDDEN_MODELS,
      ...PORTAL_FALLTHROUGH_MODELS,
    ];
    expect(new Set(all).size, 'a model is declared in more than one bucket').toBe(all.length);
  });

  it('every WAQF_DIRECT_SCOPED model is declared in exactly one bucket', () => {
    const declared = new Set<string>([
      ...PORTAL_CASED_MODELS,
      ...BENEFICIARY_FORBIDDEN_MODELS,
      ...PORTAL_FALLTHROUGH_MODELS,
    ]);
    const undeclared = (WAQF_DIRECT_SCOPED_MODELS as readonly string[]).filter(
      (model) => !declared.has(model),
    );
    expect(
      undeclared,
      `${undeclared.length} endowment-scoped model(s) are undeclared for the portal seat: ` +
        `${undeclared.join(', ')}. A model that reaches \`default: break\` in scopeFilter's ` +
        'beneficiary branch is readable by EVERY portal session for the WHOLE endowment. Decide, ' +
        'then declare: add an explicit case, add it to BENEFICIARY_FORBIDDEN_MODELS, or add it to ' +
        'PORTAL_FALLTHROUGH_MODELS with the reason it is safe.',
    ).toEqual([]);
  });

  it('the compliance plane is INVISIBLE to a portal session, not merely unwritable', () => {
    // The S8 change, asserted by name so a revert is loud. These are refused BEFORE the switch, so
    // adding a case later cannot accidentally re-open them.
    for (const model of [
      'ComplianceTask',
      'GovernmentFiling',
      'Deadline',
      'LegalCase',
      'ZakatFiling',
    ])
      expect(
        BENEFICIARY_FORBIDDEN_MODELS as readonly string[],
        `${model} is readable by a portal session again`,
      ).toContain(model);
  });

  it('nothing in the forbidden set is ALSO cased in the switch', () => {
    // The forbidden check runs FIRST, so a model in both would have a dead case — and a reader would
    // trust the case. This is the "two spellings of one rule" shape.
    for (const model of PORTAL_CASED_MODELS)
      expect(BENEFICIARY_FORBIDDEN_MODELS as readonly string[]).not.toContain(model);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * CENSUS-A — A MODEL APPEARS IN EXACTLY THE ARRAYS IT IS MEANT TO, AND THE COUNT IS THE PIN
 *
 * ⚠ WHY THIS EXISTS: THE SAME MISTAKE, TWICE, ONE STAGE APART.
 * `WAQF_DIRECT_SCOPED_MODELS` and `BENEFICIARY_FORBIDDEN_MODELS` end with similar trailing entries
 * and similar closing lines. S9-3c's `MaterialChange` patch landed in the wrong one — symptom: a row
 * created inside a transaction was invisible to the very next read in that transaction, three layers
 * away from the cause. S9-3d's `EscalationEvent` patch did it AGAIN, on the identical trap.
 *
 * Both were caught by counting occurrences by hand. `ALL_MODELS` coverage already goes red on an
 * ABSENCE (the pin above), but nothing caught PRESENCE IN THE WRONG LIST — a model can be in
 * `BENEFICIARY_FORBIDDEN_MODELS` and in no scoping list at all, which reads as "handled" in a diff
 * and fails closed in production. So the count becomes the assertion.
 *
 * The rule this encodes: `BENEFICIARY_FORBIDDEN_MODELS` is a READ BOUNDARY layered ON TOP of a
 * scoping classification — it is never a substitute for one. So every member of it must ALSO be in
 * exactly one scoping list, and `assertScopingCoverage` (called above) is what proves the "exactly
 * one" half. This asserts the "also" half, which is the half that was missing.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('CENSUS-A · a model in the portal read boundary is ALSO scoped somewhere', () => {
  it('every BENEFICIARY_FORBIDDEN_MODELS member is a classified model, not merely forbidden', () => {
    const unclassified = (BENEFICIARY_FORBIDDEN_MODELS as readonly string[]).filter(
      (model) => !(ALL_MODELS as readonly string[]).includes(model),
    );
    expect(
      unclassified,
      'A MODEL IS IN THE PORTAL READ BOUNDARY BUT IN NO SCOPING LIST: ' +
        `${unclassified.join(', ')}. The forbidden list narrows what a BENEFICIARY session reads; ` +
        'it does not classify the model for everybody else. A model in it and in no scoping list ' +
        'fails closed for every caller — which reads as "handled" in a diff and as a broken feature ' +
        'in production. This has happened twice (S9-3c MaterialChange, S9-3d EscalationEvent), both ' +
        'times because these two arrays end alike and a tail-anchored patch hit the first one. ' +
        "Anchor edits on the array's own `export const` line.",
    ).toStrictEqual([]);
  });

  it('the two S9 arrivals are in BOTH the coverage list and the portal boundary, deliberately', () => {
    // Named explicitly rather than derived: these are the two models the trap actually bit on, and a
    // regression on either should read as a named failure rather than as a count that moved.
    for (const model of ['MaterialChange', 'EscalationEvent']) {
      expect(
        WAQF_DIRECT_SCOPED_MODELS as readonly string[],
        `${model} must be endowment-scoped — a model in no scoping list fails closed, which is how ` +
          'the S9-3c defect presented (a row invisible to a read in its own transaction)',
      ).toContain(model);
      expect(
        BENEFICIARY_FORBIDDEN_MODELS as readonly string[],
        `${model} must stay OUT of a portal session's reach: a change-set row and an escalation row ` +
          "are both timelines of the endowment's internal compliance events, including other " +
          "beneficiaries' records",
      ).toContain(model);
    }
  });
});
