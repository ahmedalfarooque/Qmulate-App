/**
 * MP-21 — THE FIXTURE CAN NEVER HAND OUT A CAPABILITY THE ROLE PRESET DENIES.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY A SEED NEEDS A PARITY TEST AT ALL
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `GRANT_SHAPE_BY_ROLE` decides what every seeded `WaqfAccessGrant.permissions` array contains, and
 * Sprint 1 shipped it labelled "PROVISIONAL fixtures … nothing in production should read them" with
 * strings §10 §3's grid does not have: `waqf:waqf:update`, `finance:transaction:create`,
 * `portal:statement:read` (verbs `create`/`update`; modules `waqf`/`portal`). Its `NAZIR` shape
 * already carried `approval:request:approve`.
 *
 * A fixture is not a harmless place to be wrong about permissions. It is the data every integration
 * test, every demo and every early screen reads, so a widened fixture becomes the de-facto
 * specification — and a permission string outside the closed registry does not narrow anything, it
 * grants NOTHING, which means a test written over it exercises the resolver's failure path while
 * appearing to exercise its success path.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * TWO SIDES, AND EACH TESTS THE OTHER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `ROLE_PRESETS` in `@qmulate/domain` is the CEILING (§10 principle 3: a custom grant "may narrow —
 * never silently widen"). This file imports BOTH sides and compares them; nothing is hand-copied.
 * The DB half — a trigger that refuses an approve/sign string on a non-NAZIR grant, an unparseable
 * string, or a wildcard — is in `grant-escalation.integration.test.ts`.
 *
 * A UNIT test on purpose: `src/seed/map.ts` reaches no database, and this assertion must run on a
 * laptop with no Postgres. A parity check that only runs in the integration job is a parity check
 * that is skipped exactly when someone is iterating on the seed.
 */
import {
  APPROVAL_AUTHORITY_ROLES,
  ROLE_KEYS,
  ROLE_PRESETS,
  isPermissionString,
  isRoleKey,
  parsePermission,
  roleKeyFromDbRole,
} from '@qmulate/domain/access';
import { describe, expect, it } from 'vitest';

import { GRANT_SHAPE_BY_ROLE, SEED_USERS } from '../src/seed/map.js';

/** Every `(dbRole, shape)` pair the seed can write, with its product-vocabulary role key resolved. */
const SHAPES = Object.entries(GRANT_SHAPE_BY_ROLE).map(([dbRole, shape]) => ({
  dbRole,
  roleKey: roleKeyFromDbRole(dbRole),
  shape,
}));

describe('the scan itself is trustworthy', () => {
  // A silently-empty table would make every assertion below vacuous — the failure mode that lets a
  // parity test pass while proving nothing.
  it('found grant shapes to check', () => {
    expect(SHAPES.length).toBeGreaterThanOrEqual(4);
    expect(SHAPES.map((entry) => entry.dbRole)).toContain('NAZIR');
    expect(SHAPES.map((entry) => entry.dbRole)).toContain('FINANCE');
  });

  it('every seeded grant shape resolves to a known role key', () => {
    // `roleKeyFromDbRole` is a DERIVATION (lowercase + the single SYSTEM_ADMIN -> admin exception),
    // not a second table. An unresolvable key here means the seed names a role the product
    // vocabulary does not have.
    for (const { dbRole, roleKey } of SHAPES) {
      expect(roleKey, `${dbRole} has no product-vocabulary role key`).not.toBeUndefined();
      expect(isRoleKey(roleKey)).toBe(true);
    }
  });

  it('every role a SEED_USER can be granted has a shape — EXCEPT a declared service seat, whose shape is its own declaration', () => {
    // The other direction: `deriveAccessGrants` does a THROWING lookup into `GRANT_SHAPE_BY_ROLE`,
    // so a seat added to SEED_USERS without a shape is a seed crash rather than a silent empty
    // permission list — but it should fail HERE, in a unit test, not in the integration job.
    //
    // ⊕ S10/T2: a `serviceSeat` user is EXEMPT by design — its stored set is the ruling's
    // "enumerated minimal permissions", carried on the user entry, and `deriveAccessGrants`
    // deliberately never consults the role table for it. A GRANT_SHAPE_BY_ROLE entry for a role
    // only a service seat wears would describe a human seat that does not exist. The seat's own
    // parity obligation is the test below: its declared set must NARROW its role's preset.
    for (const user of SEED_USERS) {
      if (user.grantRole === null || user.serviceSeat !== undefined) continue;
      expect(
        Object.keys(GRANT_SHAPE_BY_ROLE),
        `SEED_USERS grants ${user.grantRole} but GRANT_SHAPE_BY_ROLE has no shape for it`,
      ).toContain(user.grantRole);
    }
  });

  it('S10/T2 · a declared service seat NARROWS its role preset and never widens it', () => {
    // The same MP-21 subset law the role shapes obey, applied to the seat's own declaration —
    // the effective set is `stored ∩ preset`, so a permission outside the preset would grant
    // nothing while LOOKING granted in the matrix, and a widened preset later would silently
    // activate it. Refused here, in both spirit and letter.
    const seats = SEED_USERS.filter((user) => user.serviceSeat !== undefined);
    expect(seats.length, 'the declared service seat should exist in the seed').toBeGreaterThan(0);
    for (const user of seats) {
      if (user.grantRole === null) continue; // a control principal with no grants has no preset to narrow
      const roleKey = roleKeyFromDbRole(user.grantRole);
      const preset: ReadonlySet<string> = new Set(ROLE_PRESETS[roleKey as never]);
      const offending = (user.serviceSeat?.permissions ?? []).filter(
        (permission) => !preset.has(permission),
      );
      expect(
        offending,
        `service seat ${user.id} declares permissions outside its ${String(roleKey)} preset: ` +
          offending.join(', '),
      ).toEqual([]);
    }
  });
});

describe('MP-21 · every seeded grant shape is a SUBSET of its role preset', () => {
  it.each(SHAPES.map((entry) => [entry.dbRole, entry] as const))(
    '%s narrows its preset and never widens it',
    (_dbRole, { roleKey, shape }) => {
      const preset: ReadonlySet<string> = new Set(ROLE_PRESETS[roleKey as never]);
      const offending = shape.permissions.filter((permission) => !preset.has(permission));
      expect(
        offending,
        `these seeded permissions are OUTSIDE the ${String(roleKey)} preset, so the fixture would ` +
          `hand out a capability §10 §3's grid denies: ${offending.join(', ')}`,
      ).toEqual([]);
    },
  );

  it('every seeded permission is a REGISTERED module:resource:verb string', () => {
    // Not merely "inside the preset" — parseable against the closed registry. The Sprint-1 strings
    // were three-segment but named verbs (`create`, `update`) and modules (`waqf`, `portal`) that do
    // not exist, so they were unparseable and granted nothing at all.
    for (const { dbRole, shape } of SHAPES) {
      for (const permission of shape.permissions) {
        expect(
          isPermissionString(permission),
          `${dbRole} carries ${JSON.stringify(permission)}, which the permission registry rejects`,
        ).toBe(true);
        expect(parsePermission(permission)).toBeDefined();
      }
    }
  });

  it('no seeded permission contains a wildcard', () => {
    // A wildcard in a string-based permission model is the classic way a least-privilege matrix
    // quietly becomes root, and a fixture is where it would look most innocent.
    for (const { dbRole, shape } of SHAPES) {
      for (const permission of shape.permissions) {
        expect(permission, `${dbRole} carries a wildcard`).not.toContain('*');
      }
    }
  });

  it('no seeded shape has a duplicate permission', () => {
    for (const { dbRole, shape } of SHAPES) {
      expect(new Set(shape.permissions).size, `${dbRole} repeats a permission`).toBe(
        shape.permissions.length,
      );
    }
  });
});

describe('MP-21 · only the nazir shape may carry an approve or sign verb', () => {
  it('is DERIVED from the shapes, never enumerated', () => {
    // The same technique the preset-level assertion uses: scan for the capability and compare to the
    // authority set, so a NEWLY INVENTED seat carrying `approve` fails whatever it is named.
    const withApprovalVerb = SHAPES.filter(({ shape }) =>
      shape.permissions.some((permission) => {
        const parsed = parsePermission(permission);
        return parsed !== undefined && (parsed.verb === 'approve' || parsed.verb === 'sign');
      }),
    ).map(({ roleKey }) => roleKey);

    expect(
      new Set(withApprovalVerb),
      'a seeded grant shape other than nazir carries an approve/sign verb — that is a second ' +
        'approval authority in the fixture, which BR-105 / BR-1103 forbid',
    ).toEqual(new Set(APPROVAL_AUTHORITY_ROLES));
  });

  it('the nazir shape really does carry the approval capability', () => {
    // The other direction. A "no role has approve" assertion also passes when NOBODY has it, which
    // would be a broken fixture that happens to satisfy the invariant.
    expect(GRANT_SHAPE_BY_ROLE.NAZIR?.permissions).toContain('approval:request:approve');
  });

  it('the FINANCE shape holds `initiate`, never `approve` — it is the MAKER', () => {
    const finance = GRANT_SHAPE_BY_ROLE.FINANCE?.permissions ?? [];
    expect(finance).toContain('approval:request:initiate');
    expect(finance).not.toContain('approval:request:approve');
    expect(finance).toContain('distribution:run:initiate');
    expect(finance.filter((p) => p.endsWith(':approve') || p.endsWith(':sign'))).toEqual([]);
  });

  it('the BENEFICIARY shape holds the statement, never the aggregate report', () => {
    // §3's grid: `beneficiary` "never holds any aggregate (`agg`) read — only `self`".
    const beneficiary = GRANT_SHAPE_BY_ROLE.BENEFICIARY?.permissions ?? [];
    expect(beneficiary).toContain('reporting:statement:read');
    expect(beneficiary).not.toContain('reporting:report:read');
  });

  it('the BENEFICIARY shape holds the DEED read and EXACTLY that one endowment verb (Q-E4-1(a))', () => {
    // Owner ruling Q-E4-1(a), 2026-08-18 — the reconciliation record is the block comment on the
    // "covers every role key" test below. Two assertions, and the second is the one that matters:
    // the ruling opened the DEED, not the endowment, so the door count is pinned rather than the
    // door's presence. A later hand that adds `endowment:waqf:read` "while it is in there" — which
    // would hand the portal seat the endowment record AND `endowment.get`'s trusteeship summary —
    // turns this red.
    const beneficiary = GRANT_SHAPE_BY_ROLE.BENEFICIARY?.permissions ?? [];
    expect(beneficiary).toContain('endowment:deed:read');
    expect(beneficiary.filter((permission) => permission.startsWith('endowment:'))).toEqual([
      'endowment:deed:read',
    ]);

    // …and the CEILING agrees, in both directions. A seeded string outside the preset resolves to
    // nothing (`grant ∩ preset`), so a fixture that carried this verb while the preset did not
    // would look granted and be silently inert — the R6-C1 failure shape, one layer down.
    expect(ROLE_PRESETS.beneficiary).toContain('endowment:deed:read');
    expect(ROLE_PRESETS.beneficiary.filter((p) => p.startsWith('endowment:'))).toEqual([
      'endowment:deed:read',
    ]);

    // The write half of the same resource is absent from BOTH: D-E settled deed READ, and memo Q10
    // put deed WRITE beyond every seat ("the trusteeship deed can only be editted by a court
    // judge"). Nothing in Q-E4-1 touched it.
    expect(beneficiary).not.toContain('endowment:deed:write');
    expect(ROLE_PRESETS.beneficiary).not.toContain('endowment:deed:write');
  });
});

describe('MP-21 · the removed Sprint-1 vocabulary cannot come back', () => {
  it.each([
    [
      'waqf:waqf:update',
      'module `waqf` and verb `update` do not exist; it is `endowment:waqf:write`',
    ],
    ['finance:transaction:create', 'verb `create` does not exist; it is `write`'],
    ['portal:statement:read', 'module `portal` does not exist; it is `reporting:statement:read`'],
    ['distribution:distribution:read', 'resource `distribution` does not exist; it is `run`'],
  ])('%s is not seeded anywhere (%s)', (permission) => {
    const all = SHAPES.flatMap(({ shape }) => shape.permissions);
    expect(all).not.toContain(permission);
    // …and it would be rejected by the registry even if it were.
    expect(isPermissionString(permission)).toBe(false);
  });

  it('covers every role key, so a new preset cannot silently arrive without a fixture decision', () => {
    // NOT an equality: most of the thirteen deliberately have no seeded seat yet (AC-1's aml_officer,
    // compliance_officer, case_manager, authorized_rep, subcontractor, auditor and counsel subjects
    // are provisioned INSIDE the tests that need them, because SEED_USERS insertion order drives the
    // audit hash chain). This asserts the RELATIONSHIP: every seeded shape is a real role, and the
    // unseeded ones are named so the absence is visible rather than accidental.
    //
    // ⚠ `admin` LEFT THIS LIST IN S2 ROUND 4 (product-owner decision PO-1). The fixture now seats
    // `user-admin-001` with `admin:access_matrix:write` on waqf-001 — before that, the census of
    // seeded grants carrying that permission was ZERO, which made the USER branch of
    // `qmulate_grant_admission()` unreachable from fixture data. Moving the name out of this list is
    // the deliberate, visible half of that decision.
    //
    // ⚠ `case_manager` LEFT IT IN THE S4/E3 CLOSE-OUT, on product-owner decision D-E (2026-08-16):
    // *"deed can be seen by nazir, case manager and elegible beneficiaries"*. The fixture now seats
    // `user-case-manager-001` with deed READ. Before that, V-E3-L1: not one seeded grant carried
    // `endowment:deed:*` or `legal:reserved_matter:*`, so §17's E3 exit clause was unreachable by
    // every user that exists. This test did exactly its job — a preset arriving in the fixture went
    // red until the decision behind it was written down here.
    //
    // ⚠ THE THIRD HOLDER THE OWNER NAMED ARRIVED IN S5's TAIL — **THE BR-210/BR-702 RECONCILIATION
    // RECORD, AND THE RULING IT RESTS ON.** This comment used to read: "still absent, and it is not
    // an oversight — an eligible BENEFICIARY seeing the deed needs `ROLE_PRESETS.beneficiary` to
    // carry an `endowment:*` verb, which it does not… owed in `packages/domain`, and it touches
    // BR-210 self-isolation and the BR-702 document access matrix (E4/E9)." Every clause of that was
    // accurate; what was missing was a DECISION, because *"eligible"* is a computed, frontier-varying
    // fact no row may carry (the register forbids a persisted entitlement verdict), so engineering
    // could not pick a door without answering a fiqh-adjacent question (binding rule 4).
    //
    // **RULED — product owner, 2026-08-18, Q-E4-1 option (a)** (`docs/product/prd/S4-owner-decision-memo.md`,
    // "S5 addendum"): *every beneficiary principal of a waqf may read THAT waqf's deed;
    // self-isolation otherwise untouched.* The two rejected options are on the record with it —
    // computing entitlement at read time (a fiqh computation on an access path, and a
    // `SHART_INCOMPLETE` deed unreadable to exactly the people it affects), and a staff-attested
    // flag (a stored judgment beside the forbidden verdict class). The consequence was named before
    // the answer and accepted: a member HELD behind a living ancestor, or excluded under a line the
    // deed does not continue, reads the deed too — it is what tells them why.
    //
    // **How the two BRs are reconciled, precisely:**
    //  · **BR-210 (self-isolation)** is untouched as a claim about the beneficiary's OWN RECORD. The
    //    force filter's self-pin is unchanged (`Beneficiary` → `{id: selfId}`, `Transaction` →
    //    MATCH_NOTHING, `AuditEvent` → MATCH_NOTHING, the authorization plane invisible). What the
    //    ruling adds is a read of an ENDOWMENT-LEVEL record the principal is a party to — not a
    //    widening of the row-level pin. `TrusteeshipDeed` is `WAQF_DIRECT_SCOPED`, so the filter
    //    already narrows it to the caller's own `authorizedWaqfIds`; nothing in the beneficiary
    //    branch had to move, and nothing did.
    //  · **BR-702 (document access matrix)** is NOT satisfied by this and must not be reported as
    //    satisfied: this is the `TrusteeshipDeed` RECORD (BR-105), not the vault DOCUMENT. E9 owes
    //    the matrix row that says whether the deed FILE follows the record. Named here so the next
    //    reader does not inherit the record's answer as the file's.
    //
    // `beneficiary` is a SEEDED key, so it does not appear in the list below — and since this
    // ruling it is a seeded key that actually carries the verb (`GRANT_SHAPE_BY_ROLE.BENEFICIARY`),
    // which is R6-C1's lesson paid rather than repeated.
    const seededKeys = new Set(SHAPES.map(({ roleKey }) => roleKey));
    const unseeded = ROLE_KEYS.filter((key) => !seededKeys.has(key));
    expect([...unseeded].sort()).toEqual([
      'aml_officer',
      // ⚠ `auditor` LEFT THIS LIST IN S11 ITEM 2c, and this is the deliberate, visible half of that
      // decision — the guard's whole purpose. `/financials` needed a READ-ONLY browser seat, and every
      // human seat was already claimed by exactly one spec (TOTP enrolment is a one-way door), so a new
      // seat was required. AUDITOR was chosen because its preset is SEVENTEEN verbs of which every one
      // ends in `:read` — there is no write verb to withhold — where `FINANCE` carries
      // `finance:transaction:write` AND `distribution:run:initiate`, `CASE_MANAGER` carries no
      // `finance:*` at all, and `FAMILY_BOARD` carries only `reporting:report:read`. The role itself is
      // one of the locked thirteen, so ADR-0004 is untouched: this is a role receiving its FIRST shape,
      // not a role being invented. It carries TWO of the seventeen — see
      // `GRANT_SHAPE_BY_ROLE.AUDITOR` for which fifteen are withheld and why withholding
      // `endowment:waqf:read` would have narrowed understanding rather than exposure.
      'authorized_rep',
      // ⚠ `compliance_officer` LEFT THIS LIST IN S12-2, and this is the deliberate, visible half of that
      // decision. The BR-1102 chain browser journey needed ONE seat that can both RAISE a kinded
      // reserved matter (`approval:request:initiate`) and RECORD its steps (`legal:reserved_matter:write`,
      // owner ruling 2026-09-08 "staff"). MEASURED before the seat existed: no seeded seat held both —
      // NAZIR shapes hold write but not initiate, CASE_MANAGER holds initiate but not write — and both
      // NAZIR seats are TOTP-enrolled in-file by other specs (a one-way door), so a second handshake on
      // either would break the first enrolment or go stale behind it. The compliance officer's PRESET
      // carries both verbs (§10 §3 row 8), so `user-reserved-clerk-001` receives the role's FIRST shape:
      // FIVE verbs of twenty-nine, one endowment (waqf-004), no approve, no sign, no register write. One
      // of the locked thirteen receiving a shape, not a role being invented (ADR-0004 untouched).
      'counsel',
      'leadership',
      'subcontractor',
    ]);
  });
});
