/**
 * ROUTER INTROSPECTION — the "make one side test the other" instruction, applied to my own layer.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE READS, AND WHY THAT CHOICE IS THE WHOLE POINT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * It walks `appRouter._def.procedures` — tRPC's flat, dotted map of EVERY procedure in the tree — and
 * for each one reads `_def.middlewares`: **the actual composed guard chain**.
 *
 * It deliberately does NOT read tRPC `meta`. `meta` is caller-supplied and a later `.meta()` call
 * overwrites an earlier one, so a router that FORGOT the ladder could still declare that it had it —
 * the assertion would then be testing a description of the code rather than the code. A middleware,
 * by contrast, either runs or does not. And the permission each tag reports is the SAME closure
 * variable the middleware enforces (`src/trpc.ts` tags `_def.middlewares.at(-1)` immediately after
 * `.use()`), so there is no second copy to drift.
 *
 * It also deliberately does NOT keep a hand-maintained list of procedures. Every expectation is
 * DERIVED — from `@qmulate/domain`'s permission registry, from `APPROVAL_VERBS`, and from
 * `@qmulate/auth`'s `TOTP_STEP_UP_ACTIONS`. A new procedure is therefore covered the moment it is
 * added, and a new procedure that skips a rung FAILS THE BUILD rather than shipping unguarded (MP-34).
 *
 * The ONE hand-written list is the public-procedure allowlist, and it is asserted to equal the actual
 * set of public procedures IN BOTH DIRECTIONS — so adding a public procedure is a deliberate, reviewed
 * act rather than an omission.
 */

import { ORG_SCOPE_PERMISSIONS } from '@qmulate/domain/access';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { TOTP_STEP_UP_ACTIONS } from '@qmulate/auth';
import { APPROVAL_VERBS, parsePermission } from '@qmulate/domain';

import { appRouter } from '../src/root.js';
import { isApiAuditingInstalled } from '../src/middleware/audit.js';
import {
  assertStepUpPolicyAgrees,
  GUARD_KINDS,
  readGuardTag,
  type GuardKind,
  type GuardTag,
} from '../src/permissions.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Walking the router
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface ProcedureFacts {
  readonly path: string;
  /** `'query' | 'mutation' | 'subscription'`, from tRPC's own `_def`. */
  readonly type: string;
  readonly tags: readonly GuardTag[];
  readonly kinds: ReadonlySet<GuardKind>;
  /** The permission the endowment-scope guard actually enforces, if any. */
  readonly permission: string | undefined;
}

function walkRouter(): ProcedureFacts[] {
  const procedures = (
    appRouter as unknown as {
      _def: { procedures: Record<string, { _def: { type: string; middlewares: unknown[] } }> };
    }
  )._def.procedures;

  return Object.entries(procedures).map(([path, procedure]) => {
    const tags = procedure._def.middlewares
      .map((middleware) => readGuardTag(middleware))
      .filter((tag): tag is GuardTag => tag !== undefined);

    const kinds = new Set<GuardKind>(tags.map((tag) => tag.kind));
    const scopeTag =
      tags.find((tag) => tag.kind === 'endowment-scope') ?? tags.find((tag) => tag.kind === 'org-scope');

    return { path, type: procedure._def.type, tags, kinds, permission: scopeTag?.permission };
  });
}

const PROCEDURES = walkRouter();

/**
 * The ONLY procedures that may be public, each with the reason it is.
 *
 * ⚠ ASSERTED IN BOTH DIRECTIONS below. A new public procedure fails the build until it is written down
 * here — which is the point: "deny by default" (§10 principle 1) has to be enforced against the
 * router, not just intended.
 */
const PUBLIC_ALLOWLIST: Readonly<Record<string, string>> = {
  health:
    'Liveness probe. Says nothing about the database, the queue or the environment — a public ' +
    'endpoint must not leak deployment topology or configuration state.',
};

/**
 * Procedures that are authenticated but deliberately NOT endowment-scoped, each with its reason.
 *
 * A very short list by construction: the only honest reason is that the procedure's ANSWER is "which
 * endowments", which cannot itself require one.
 */
const UNSCOPED_AUTHED_ALLOWLIST: Readonly<Record<string, string>> = {
  /* ── S12-3b · UI INTAKE (owner ruling "build ui intake") ─────────────────────────────────────
   * Both are unscoped for the SAME structural reason as navigation: rung 2 resolves a grant for ONE
   * endowment named in the input, and a BIRTH has no endowment yet — its subject is the CLIENT. The
   * authority is resolved EXPLICITLY inside the procedure (both `endowment:waqf:write` and
   * `admin:access_matrix:write` on a SIBLING endowment of that client, from the caller's own
   * re-evaluated grants) and RE-PROVED by the database (`waqf_birth_admission`, migration 53, reads
   * the audit marker and demands the same of its actor, established in the trail). `intake` is the
   * ONLY unscoped MUTATION in the router, and the MP-34 block below asserts that set exactly.
   * ─────────────────────────────────────────────────────────────────────────────────────────── */
  'onboarding.intakeAuthority':
    'Which clients the caller may REGISTER an endowment for — computed from their own grants and the ' +
    'force-filtered tree; a caller with no sibling authority reads an empty list.',
  'onboarding.intake':
    'The BIRTH of an endowment. No endowment exists to scope to; sibling-endowment authority is ' +
    'resolved in the procedure and re-proved by `waqf_birth_admission` (migration 53). Refused ' +
    'ENDOWMENT_INTAKE_NOT_AUTHORISED before any write.',
  whoami:
    'Returns the caller\'s OWN grants — the answer is "which endowments", so it cannot be scoped to ' +
    'one. Discloses nothing about anyone else, and deliberately returns no role list (MP-12).',

  /* ── S4/E3 · BR-102 navigation ──────────────────────────────────────────────────────────────
   * All three are unscoped for ONE structural reason: rung 2 requires `waqfId` IN THE INPUT and
   * resolves a grant for THAT endowment, and none of these three has a single endowment to name — a
   * tree's answer IS "which endowments", and a Client/Waqif sits ABOVE the endowment in the
   * hierarchy. Applying the rung would mean inventing a parameter the caller does not have.
   *
   * Deny-by-default is not weakened, and it is carried by TWO gates rather than by a comment:
   *   1. every read in `routers/navigation.ts` is anchored on the `waqf` delegate, whose top-level
   *      `where` the scoping extension narrows to `authorizedWaqfIds`, and the Client/Waqif rows are
   *      reached by following each endowment UPWARD (a to-one hop, so nothing is over-fetched);
   *   2. ⚠ V-E3-03 — `disclosableWaqfIds()` additionally asks `resolveScope(ctx, waqfId,
   *      ENDOWMENT_RECORD_READ)`, THE SAME CALL rung 2 makes for `endowment.get`. The force filter
   *      answers "does this caller have a seat here", never "may this caller read the record", and
   *      a tree is a read of the record. Without gate 2 a `permissions: []` SUBCONTRACTOR read the
   *      certificate number, the deed number, the classification and both family names.
   * A caller with no grant reads `[]`; a Membership-only caller reads `[]` too, because a membership
   * contributes nothing to `authorizedWaqfIds` (MP-13); and a caller with a grant but no
   * `endowment:waqf:read` now reads `[]` as well. Counts are counts of the DISCLOSABLE set, never of
   * the family's true totals. `test/navigation-disclosure.integration.test.ts` proves the resulting
   * relationship — navigation ⊆ `endowment.get` — for every seat in the role model.
   * ─────────────────────────────────────────────────────────────────────────────────────────── */
  'navigation.tree':
    'BR-102 client → waqif → endowment tree. Its ANSWER is "which endowments", so it cannot require ' +
    'one. Anchored on the force-filtered `waqf` delegate AND narrowed to the endowments this caller ' +
    'could read through `endowment.get` (V-E3-03), so a caller with no grant — or a grant without ' +
    '`endowment:waqf:read` — reads [] rather than a partial tree; Membership-only reads [] (MP-13).',
  'navigation.client.get':
    'A Client sits ABOVE the endowment (Client → Waqif → Waqf) and has no waqfId for rung 2 to ' +
    'resolve a grant against. The answer is built from endowments this caller may READ, not merely ' +
    'reach, and a family with none returns `null` — NOT FORBIDDEN — so existence is not disclosed ' +
    '(§10 §7.2) and the family name never escapes the record gate.',
  'navigation.waqif.get':
    'A Waqif also sits above the endowment and carries no waqfId. Same enforcement and same ' +
    'non-disclosure as navigation.client.get: readable endowments decide the answer, and `null` is ' +
    'returned rather than a refusal that would confirm the endower exists.',
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · the walk itself is real
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the router walk', () => {
  it('found procedures — a silently-empty walk would make every assertion below vacuous', () => {
    expect(PROCEDURES.length).toBeGreaterThanOrEqual(6);
    const paths = PROCEDURES.map((procedure) => procedure.path);
    // A handful of anchors, so a refactor that renames the whole tree is noticed rather than passing
    // an empty-set assertion.
    for (const anchor of ['health', 'whoami', 'endowment.get', 'approval.approve']) {
      expect(paths, `${anchor} is missing from the router`).toContain(anchor);
    }
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * S4/E3 · the endowment-record surface is REACHABLE, procedure by procedure
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * The "every router under src/ is mounted WHOLE" derivation below already fails if a router is
   * unmounted or half-mounted. These anchors are the second direction: they name the procedures the
   * E3 CONTRACT promises, so a rename or a quiet removal fails here with the procedure's own name
   * rather than as a set difference. `apps/web` is building against exactly these paths.
   * ═════════════════════════════════════════════════════════════════════════════════════════ */
  it('S4/E3 — every contracted procedure is mounted, by name', () => {
    const paths = new Set(PROCEDURES.map((procedure) => procedure.path));
    for (const anchor of [
      'navigation.tree',
      'navigation.client.get',
      'navigation.waqif.get',
      'endowment.get',
      'endowment.update',
      'endowment.recordDeedTerms',
      'deed.get',
      'deed.upsert',
      'deed.verifyEligibility',
      'classification.get',
      'classification.reclassify',
      'classification.applicableObligations',
      'shart.get',
      'shart.completeness',
      'reservedMatter.markReserved',
      'reservedMatter.list',
      'reservedMatter.approve',
      'asset.requestReservedAct',
      'asset.executeReservedAct',
      'beneficiary.lineage',
      'beneficiary.ultimateTakerCandidates',
    ]) {
      expect(paths, `${anchor} is missing from appRouter — apps/web builds against it`).toContain(
        anchor,
      );
    }
  });

  /**
   * ⚠ THERE IS NO SHART WRITE, AT ANY PATH, AND ITS ABSENCE IS ASSERTED RATHER THAN INTENDED.
   *
   * Binding rule 1 / ADR-0006: the Shart al-Waqif cannot be changed at all — not by a direct edit, a
   * migration, a backfill, a "correction", and NOT by any approval, however complete.
   * `qmulate_shart_guard()` tier 1 raises 42501 without consulting the reserved-matter GUC, and
   * `withReservedMatter()` refuses the four columns before the transaction opens.
   *
   * So the API must not OFFER an operation that can only ever fail: such a procedure implies a key
   * exists somewhere and the caller merely lacks it, and it is a place a future change could quietly
   * acquire a `withReservedMatter()` wrapper and become a working amendment path. A correction is a
   * SUPERSEDING INSTRUMENT recorded as a NEW record.
   */
  it('S4/E3 — the shart router exposes NO mutation, at any path (ADR-0006)', () => {
    const shartProcedures = PROCEDURES.filter((procedure) => procedure.path.startsWith('shart.'));
    expect(
      shartProcedures.length,
      'the shart router vanished — this assertion went vacuous',
    ).toBeGreaterThanOrEqual(2);
    for (const procedure of shartProcedures) {
      expect(
        procedure.type,
        `${procedure.path} is a ${procedure.type}. The Shart al-Waqif is immutable: there is no ` +
          `amendment path, so the API must not offer an operation that can only ever fail.`,
      ).toBe('query');
    }
    // Belt and braces on the NAME as well as the type: a write called something other than `update`
    // would still be a write.
    for (const forbidden of ['shart.update', 'shart.amend', 'shart.set', 'shart.correct']) {
      expect(
        PROCEDURES.map((procedure) => procedure.path),
        `${forbidden} exists. There is no key to the founder's conditions (ADR-0006).`,
      ).not.toContain(forbidden);
    }
  });

  /**
   * `endowment.recordDeedTerms` is the SIGNER rung, and the verb is what proves it.
   *
   * `continuationStipulation` and the مآل clause ARE founder's conditions. Landed as plain columns
   * they would be editable by anyone holding `endowment:waqf:write` — ADR-0006's hole reopened through
   * a new column. `endowment:deed:sign` sits ONLY in the `nazir` preset, and the approval rung adds
   * maker ≠ checker against the persisted makerId, a fresh TOTP, and the payloadHash binding.
   */
  it("S4/E3 — recording a founder's condition is on the SIGNER rung, nazir-only", () => {
    const record = PROCEDURES.find((procedure) => procedure.path === 'endowment.recordDeedTerms');
    expect(record, 'endowment.recordDeedTerms is not mounted').toBeDefined();
    expect(record?.type).toBe('mutation');
    expect(record?.permission).toBe('endowment:deed:sign');
    expect(record === undefined ? [] : [...record.kinds]).toEqual(
      expect.arrayContaining(['authed', 'endowment-scope', 'segregation', 'totp-step-up']),
    );
  });

  /**
   * `reservedMatter.approve` carries the `A*`, and it is on the RESERVED MATTER — not on the deed.
   *
   * §3 row 8's `A*` is `legal:reserved_matter:approve` (held only by `nazir`); the `S*` is
   * `endowment:deed:sign`. Swapping them would put the deed signature on a seat that does not hold it
   * and vice versa, and both procedures would still look guarded.
   */
  it('S4/E3 — reservedMatter.approve holds the reserved-matter A*, not the deed S*', () => {
    const approve = PROCEDURES.find((procedure) => procedure.path === 'reservedMatter.approve');
    expect(approve, 'reservedMatter.approve is not mounted').toBeDefined();
    expect(approve?.type).toBe('mutation');
    expect(approve?.permission).toBe('legal:reserved_matter:approve');
    expect(approve === undefined ? [] : [...approve.kinds]).toEqual(
      expect.arrayContaining(['authed', 'endowment-scope', 'segregation', 'totp-step-up']),
    );
  });

  /**
   * ⚠ A MEASURED DEVIATION FROM THE E3 CONTRACT, PINNED HERE SO IT CANNOT BE MISTAKEN FOR AN OVERSIGHT.
   *
   * The contract specifies `asset.executeReservedAct` as `checkerProcedure` +
   * `legal:reserved_matter:approve`. **That combination cannot succeed:** `checkerProcedure` →
   * `resolveApprover()` refuses unless the request is `PENDING`, while `withReservedMatter()` refuses
   * unless it is `APPROVED`. AC-E3-08's own sequence is request → approve → execute, so at execute time
   * the row is `APPROVED` and the checker rung would refuse every legitimate call. The rung is not free
   * to change either: this file requires that an approve/sign VERB implies BOTH the segregation and
   * step-up guards, so an approve-verb procedure MUST be a checkerProcedure.
   *
   * It therefore ships on the MAKER rung with `endowment:asset:write` — the verb for the state change it
   * actually makes — and the AUTHORITY comes from the approval, verified by `withReservedMatter()`
   * (APPROVED, RESERVED_MATTER, this endowment, checkerId != null, checkerId != makerId) plus this
   * layer's `subjectId` and `reservedMatterKind` checks. The Nazir approved; execution is the EFFECT of
   * that decision, not a second decision.
   *
   * Whether execution should ALSO be nazir-only is a surfaced question, recorded as a `TODO(surface)` in
   * `routers/reservedMatter.ts`. This assertion pins what shipped.
   */
  it("S4/E3 — asset.executeReservedAct is on the MAKER rung (the contract's rung is unsatisfiable)", () => {
    const execute = PROCEDURES.find((procedure) => procedure.path === 'asset.executeReservedAct');
    expect(execute, 'asset.executeReservedAct is not mounted').toBeDefined();
    expect(execute?.type).toBe('mutation');
    expect(execute?.permission).toBe('endowment:asset:write');
    // NOT on the approval rung — and that is the deviation, asserted rather than described.
    expect(execute?.kinds.has('segregation'), 'it acquired an approval rung').toBe(false);
    expect(execute?.kinds.has('endowment-scope')).toBe(true);
  });

  it('every guard tag it read is a recognised kind', () => {
    for (const procedure of PROCEDURES) {
      for (const tag of procedure.tags) {
        expect(GUARD_KINDS).toContain(tag.kind);
      }
    }
  });

  it('denial auditing is installed at API boot', () => {
    // `installScopeDenialAuditing()` was defined in packages/database, re-exported, and had ZERO call
    // sites through the whole of Sprint 1 — a control that was shipped and never switched on.
    // Importing `../src/root.js` (which this file does) must be enough to switch it on.
    expect(isApiAuditingInstalled()).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · public and unscoped procedures are an allowlist, in both directions
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('deny by default, enforced against the router', () => {
  const publicPaths = PROCEDURES.filter((p) => !p.kinds.has('authed')).map((p) => p.path);
  const unscopedAuthedPaths = PROCEDURES.filter(
    (p) => p.kinds.has('authed') && !p.kinds.has('endowment-scope') && !p.kinds.has('org-scope'),
  ).map((p) => p.path);

  it('the set of PUBLIC procedures equals the written-down allowlist', () => {
    expect([...publicPaths].sort()).toEqual(Object.keys(PUBLIC_ALLOWLIST).sort());
  });

  it('the set of AUTHED-but-UNSCOPED procedures equals the written-down allowlist', () => {
    expect([...unscopedAuthedPaths].sort()).toEqual(Object.keys(UNSCOPED_AUTHED_ALLOWLIST).sort());
  });

  it('every allowlist entry carries a reason, not just a name', () => {
    for (const [path, reason] of Object.entries({
      ...PUBLIC_ALLOWLIST,
      ...UNSCOPED_AUTHED_ALLOWLIST,
    })) {
      expect(reason.length, `${path} has no reason recorded`).toBeGreaterThan(40);
    }
  });

  it('NO MUTATION is public — a public write is not a thing this product has', () => {
    for (const procedure of PROCEDURES) {
      if (procedure.type !== 'mutation') continue;
      expect(procedure.kinds.has('authed'), `${procedure.path} is a public mutation`).toBe(true);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · MP-34 — every mutation declares an endowment scope and a REGISTERED permission
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('MP-34 — every mutation is endowment-scoped and permission-gated', () => {
  const mutations = PROCEDURES.filter((procedure) => procedure.type === 'mutation');

  it('found mutations to check', () => {
    expect(mutations.length).toBeGreaterThanOrEqual(2);
  });

  it('the UNSCOPED mutations are exactly the allowlisted birth — and nothing else', () => {
    // ⊕ S12-3b. An unscoped mutation is the most dangerous shape this file polices, so the set is
    // asserted EXACTLY rather than skipped: one procedure, the birth, whose reason is written above.
    const unscopedMutations = mutations
      .filter((mutation) => !mutation.kinds.has('endowment-scope') && !mutation.kinds.has('org-scope'))
      .map((mutation) => mutation.path)
      .sort();
    expect(unscopedMutations).toEqual(['onboarding.intake']);
    for (const path of unscopedMutations) expect(path in UNSCOPED_AUTHED_ALLOWLIST).toBe(true);
  });

  it('each carries an endowment-scope guard', () => {
    for (const mutation of mutations) {
      if (mutation.path in UNSCOPED_AUTHED_ALLOWLIST) continue; // asserted exactly above
      expect(
        mutation.kinds.has('endowment-scope') || mutation.kinds.has('org-scope'),
        `${mutation.path} is a mutation with no endowment-scope guard: it would degrade to "any ` +
          `active grant on this endowment can do this", which is exactly what the force-filter ` +
          `already does — so the mistake would be invisible in behaviour AND consistent across both ` +
          `layers`,
      ).toBe(true);
    }
  });

  it('each declares a permission that PARSES against the closed registry', () => {
    // Compared against `@qmulate/domain`'s registry, never against a list maintained here. A
    // procedure demanding an unregistered string would deny every caller — a silent outage that looks
    // like an authorization decision.
    for (const mutation of mutations) {
      if (mutation.path in UNSCOPED_AUTHED_ALLOWLIST) continue; // the birth names TWO verbs in its body
      const parsed = parsePermission(mutation.permission);
      expect(parsed, `${mutation.path} declares an unregistered permission`).toBeDefined();
    }
  });

  it('every QUERY that touches endowment data is scoped too', () => {
    for (const procedure of PROCEDURES) {
      if (procedure.type !== 'query') continue;
      if (procedure.path in PUBLIC_ALLOWLIST) continue;
      if (procedure.path in UNSCOPED_AUTHED_ALLOWLIST) continue;
      expect(
        procedure.kinds.has('endowment-scope') || procedure.kinds.has('org-scope'),
        `${procedure.path} is an unscoped query and is not on either allowlist`,
      ).toBe(true);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · THE HEADLINE — every approve/sign procedure is built on the approval rung
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('every approve/sign procedure is built on the approval rung — in BOTH directions', () => {
  const approvalVerbs: ReadonlySet<string> = new Set(APPROVAL_VERBS);

  const withApprovalVerb = PROCEDURES.filter((procedure) => {
    const verb = parsePermission(procedure.permission)?.verb;
    return verb !== undefined && approvalVerbs.has(verb);
  });

  const withSegregationGuard = PROCEDURES.filter((procedure) => procedure.kinds.has('segregation'));

  it('found at least one approve/sign procedure', () => {
    // A vacuous pass is the failure mode this guards against: if the approval router were ever
    // renamed away, every assertion below would trivially hold over an empty set.
    expect(withApprovalVerb.length).toBeGreaterThanOrEqual(1);
    expect(withApprovalVerb.map((p) => p.path)).toContain('approval.approve');
  });

  it('→ an approval VERB implies a segregation guard AND a TOTP step-up guard', () => {
    for (const procedure of withApprovalVerb) {
      expect(
        procedure.kinds.has('segregation'),
        `${procedure.path} demands ${String(procedure.permission)} — an approval verb — with NO ` +
          `segregation guard. The Nazir is the sole approval authority, per endowment, and never the ` +
          `maker; without this guard nothing compares the acting identity to the persisted makerId.`,
      ).toBe(true);
      expect(
        procedure.kinds.has('totp-step-up'),
        `${procedure.path} demands an approval verb with no TOTP step-up guard (NFR-06).`,
      ).toBe(true);
    }
  });

  it('← a segregation guard implies an approval verb (no mislabelled rungs)', () => {
    // The converse direction matters just as much: a segregation guard on a `read` procedure would
    // make the ladder's SHAPE a lie, and the introspection test would then be measuring the wrong
    // thing on the procedures that count.
    for (const procedure of withSegregationGuard) {
      const verb = parsePermission(procedure.permission)?.verb;
      expect(
        verb !== undefined && approvalVerbs.has(verb),
        `${procedure.path} carries a segregation guard but demands ${String(procedure.permission)}, ` +
          `whose verb is not approve/sign`,
      ).toBe(true);
    }
  });

  it('the two guards agree on the permission they are guarding', () => {
    // Both tags carry a permission, and it must be the SAME one the scope guard enforces — otherwise
    // one rung could be gating a different verb from the other.
    for (const procedure of withApprovalVerb) {
      for (const tag of procedure.tags) {
        if (tag.permission === undefined) continue;
        expect(
          tag.permission,
          `${procedure.path}: guard ${tag.kind} guards a different permission`,
        ).toBe(procedure.permission);
      }
    }
  });

  it('the step-up trigger is DERIVED from @qmulate/auth TOTP_STEP_UP_ACTIONS, not restated', () => {
    // Two independently-declared verb lists in two packages that must agree. This is the comparison
    // Sprint 1 was missing everywhere it mattered.
    expect(() => assertStepUpPolicyAgrees()).not.toThrow();
    for (const procedure of withApprovalVerb) {
      const verb = parsePermission(procedure.permission)?.verb ?? '';
      expect(TOTP_STEP_UP_ACTIONS as readonly string[]).toContain(verb);
    }
  });

  it('every approve/sign procedure is a MUTATION — an approval is never a read', () => {
    for (const procedure of withApprovalVerb) {
      expect(
        procedure.type,
        `${procedure.path} demands an approval verb but is a ${procedure.type}`,
      ).toBe('mutation');
    }
  });

  it('the approval rung is composed IN ORDER: authed → scope → segregation → step-up', () => {
    // Order is load-bearing: the segregation guard reads `ctx.grant` and `ctx.waqfId`, which only the
    // scope guard produces, and the step-up marker verifies what the segregation guard produced. A
    // reordered chain would either crash or — worse — skip a check whose input happened to be absent.
    for (const procedure of withApprovalVerb) {
      const order = procedure.tags.map((tag) => tag.kind);
      expect(order, procedure.path).toEqual([
        'authed',
        'endowment-scope',
        'segregation',
        'totp-step-up',
      ]);
    }
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · EVERY ROUTER THE PACKAGE SHIPS IS ACTUALLY REACHABLE FROM `appRouter`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The gap this closes, verbatim: `settingsRouter` shipped complete, with 38 passing assertions
 * driven through a router the TEST FILE constructed (`router({ settings: settingsRouter })`) — while
 * `appRouter`, the thing `apps/web` actually serves, mounted 8 procedures and none of them
 * `settings.*`. EXIT-3 ("a fee-basis change via `Setting` flows through with no redeploy") was
 * therefore proven against a surface the product does not have, and nothing in CI could notice,
 * because no assertion anywhere said the mount had happened.
 *
 * So the claim is not written down here either — it is DERIVED. Every module under `src/` is
 * imported, every exported value that IS a tRPC router is found, and its OWN procedure keys are
 * compared to what `appRouter` exposes under its namespace, in both directions. A new router that
 * nobody mounts fails this suite the moment it exists; a partial mount fails it too.
 *
 * ⚠ THE WALK IS THE WHOLE `src/` TREE, NOT `src/routers/` — AND THAT WIDENING IS THE POINT.
 * Scanning one directory made the derivation depend on a filing convention: a router declared in
 * `src/reporting.ts`, or in a new `src/modules/` folder, was invisible to it, and the original hole
 * (a complete router with a green suite that `appRouter` did not mount) would reopen exactly as
 * before. `appRouter` itself is excluded BY IDENTITY, not by filename, so renaming `src/root.ts`
 * cannot accidentally re-include it.
 *
 * The convention it enforces — mount key === the export's name minus `Router` — is deliberate: a
 * derivation needs one stable rule to derive from, and "the export says what the namespace is" is a
 * cheaper rule to keep than a list somebody has to remember to edit.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface ShippedRouter {
  readonly file: string;
  readonly exportName: string;
  readonly namespace: string;
  readonly ownProcedurePaths: readonly string[];
}

function procedurePathsOf(value: unknown): readonly string[] | undefined {
  const candidate = value as { _def?: { router?: unknown; procedures?: Record<string, unknown> } };
  if (candidate?._def?.router !== true || typeof candidate._def.procedures !== 'object') {
    return undefined;
  }
  return Object.keys(candidate._def.procedures ?? {}).sort();
}

/** Every `.ts` module under `src/`, recursively, as repo-relative paths. */
function sourceModules(relative: string = ''): string[] {
  const directory = fileURLToPath(new URL(`../src/${relative}`, import.meta.url));
  const out: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    const next = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...sourceModules(next));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(next);
    }
  }
  return out;
}

/**
 * Import EVERY module under `src/` and collect the routers they export.
 *
 * De-duplicated by router IDENTITY, because a router is legitimately re-exported (`src/settings.ts`
 * re-exports `settingsRouter` so callers have one import for "the resolver and its router"), and the
 * same object surfacing twice is not two routers to mount.
 */
async function discoverShippedRouters(): Promise<ShippedRouter[]> {
  const found: ShippedRouter[] = [];
  const seen = new Set<unknown>();

  for (const file of sourceModules()) {
    // An absolute file URL, so Vite's dynamic-import analysis stays out of the way and the directory
    // WALK — not a literal — decides what gets imported.
    const href = new URL(`../src/${file}`, import.meta.url).href;
    const module = (await import(/* @vite-ignore */ href)) as Record<string, unknown>;

    for (const [exportName, value] of Object.entries(module)) {
      const ownProcedurePaths = procedurePathsOf(value);
      if (ownProcedurePaths === undefined) continue;
      // `appRouter` is the ROOT, excluded by identity rather than by filename — renaming
      // `src/root.ts` must not accidentally re-include it and demand a `app.*` namespace.
      if (value === (appRouter as unknown)) continue;
      if (seen.has(value)) continue;
      seen.add(value);
      found.push({
        file,
        exportName,
        namespace: exportName.replace(/Router$/, ''),
        ownProcedurePaths,
      });
    }
  }
  return found;
}

describe('every router exported anywhere under src/ is mounted on appRouter', () => {
  const mountedPaths = PROCEDURES.map((procedure) => procedure.path);

  it('the WALK is not vacuous — it reached the whole src/ tree, subdirectories included', () => {
    // The scan's REACH is asserted separately from its findings. A recursive walk that silently
    // stopped at the top level would still "find settingsRouter" (via `src/settings.ts`'s
    // re-export) and would still pass every assertion below, while a router in any subdirectory
    // became invisible — which is the original hole, one directory deeper.
    const modules = sourceModules();
    expect(modules).toContain('root.ts');
    expect(modules, 'the walk did not descend into src/routers/').toContain('routers/settings.ts');
    expect(modules, 'the walk did not descend into src/middleware/').toContain(
      'middleware/audit.ts',
    );
    expect(modules.length).toBeGreaterThanOrEqual(10);
  });

  it('the discovery is not vacuous — it found router modules and their procedures', async () => {
    const shipped = await discoverShippedRouters();
    // A silently-empty discovery would make the assertion below pass over nothing, which is the
    // exact failure mode that let the missing mount ship.
    expect(shipped.length).toBeGreaterThanOrEqual(1);
    expect(shipped.map((router) => router.file)).toContain('routers/settings.ts');
    for (const router of shipped) {
      expect(
        router.ownProcedurePaths.length,
        `${router.exportName} exposes no procedures — the walk read the wrong thing`,
      ).toBeGreaterThanOrEqual(1);
      expect(router.exportName, `src/${router.file} exports a router not named *Router`).toMatch(
        /Router$/,
      );
    }
  });

  it('each one is reachable, WHOLE, under its own namespace', async () => {
    for (const router of await discoverShippedRouters()) {
      const prefix = `${router.namespace}.`;
      const mounted = mountedPaths
        .filter((path) => path.startsWith(prefix))
        .map((path) => path.slice(prefix.length))
        .sort();

      expect(
        mounted,
        `${router.exportName} (src/${router.file}) is not mounted on appRouter as ` +
          `"${router.namespace}", or is mounted only in part. A router that exists, typechecks and ` +
          `passes its own suite but is absent from appRouter is a feature the product does not ` +
          `have — apps/web serves appRouter, and so does createCallerFactory(appRouter). This is ` +
          `how EXIT-3 shipped unreachable with a green build.`,
      ).toEqual([...router.ownProcedurePaths]);
    }
  });

  it('settings.set — the EXIT-3 procedure — is on the approval rung of the SHIPPED router', async () => {
    // Not "a settings.set somewhere": this reads the mounted procedure's real composed middleware
    // chain out of appRouter. §10 §4.1 makes a fee-basis change a `nazir` A* action, so the mounted
    // procedure must carry the segregation and step-up rungs — and section 4 above only walks
    // appRouter, so before the mount existed that whole headline assertion ran over ONE procedure.
    const set = PROCEDURES.find((procedure) => procedure.path === 'settings.set');
    expect(set, 'settings.set is not mounted on appRouter').toBeDefined();
    expect(set?.type).toBe('mutation');
    expect(set?.permission).toBe('fee:nazir_fee:approve');
    expect(set === undefined ? [] : [...set.kinds]).toEqual(
      expect.arrayContaining(['authed', 'endowment-scope', 'segregation', 'totp-step-up']),
    );
  });
});

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 6 · the AML rung, when present, is a blocker and never an authorizer
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe('the AML compartment rung', () => {
  it('never co-exists with an approval verb on the same procedure (MP-24)', () => {
    // An approval authority living inside a compartment the legally accountable Nazir cannot audit is
    // a direct BR-105 violation, and the hardest kind to detect because the evidence is hidden by
    // design. So no procedure may be BOTH compartment-gated and approval-bearing: an AML decision may
    // only ever BLOCK.
    for (const procedure of PROCEDURES) {
      if (!procedure.kinds.has('aml-member')) continue;
      const verb = parsePermission(procedure.permission)?.verb;
      expect(
        verb !== undefined && !(APPROVAL_VERBS as readonly string[]).includes(verb),
        `${procedure.path} is AML-compartment-gated AND demands an approval verb`,
      ).toBe(true);
    }
  });
});

/**
 * The organisation rung (migration 55): every `admin.*` procedure is built on `orgProcedure` and
 * names one of the closed ORGANISATION-scope permissions — never an endowment permission, and
 * never an approval verb. Visibility of the Users / Roles / Audit screens follows the same set.
 */
describe('migration 55 — the organisation rung', () => {
  const orgProcedures = PROCEDURES.filter((p) => p.kinds.has('org-scope'));

  it('every admin.* procedure is on the organisation rung, and nothing else is', () => {
    const adminPaths = PROCEDURES.filter((p) => p.path.startsWith('admin.')).map((p) => p.path);
    expect(orgProcedures.map((p) => p.path).sort()).toEqual(adminPaths.sort());
    expect(adminPaths.length).toBeGreaterThanOrEqual(10);
  });

  it('each names a registered organisation-scope permission and no approval verb', () => {
    for (const procedure of orgProcedures) {
      const tag = procedure.tags.find((t) => t.kind === 'org-scope');
      expect(tag?.permission, `${procedure.path} declares no permission`).toBeDefined();
      expect(ORG_SCOPE_PERMISSIONS as readonly string[]).toContain(tag?.permission);
      expect(tag?.permission?.endsWith(':approve') || tag?.permission?.endsWith(':sign')).toBe(false);
    }
  });
});
