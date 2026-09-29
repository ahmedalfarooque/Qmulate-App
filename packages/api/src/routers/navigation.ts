/**
 * `navigation` — BR-102's "model AND navigate": Client (family) → Waqif (endower) → Waqf (endowment).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THESE THREE PROCEDURES ARE `authedProcedure` AND NOT `endowmentScopedProcedure`
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Rung 2 REQUIRES `waqfId` in the input and resolves a grant for THAT endowment. A navigation tree
 * has no single endowment — its answer is *which* endowments — so the rung cannot be applied without
 * inventing a parameter the caller does not have. `whoami` is on the same allowlist for the same
 * reason, and `test/router-introspection.test.ts` asserts that allowlist in BOTH directions, so these
 * three had to be written down there with a reason before they could ship.
 *
 * ⚠ DENY-BY-DEFAULT IS THEREFORE THE FORCE FILTER'S JOB HERE, AND THE QUERY SHAPE IS WHAT MAKES IT
 * WORK. Every read below is anchored on the `waqf` delegate, whose top-level `where` the scoping
 * extension narrows to `authorizedWaqfIds`. A caller with no grant reads `[]` and therefore gets an
 * empty tree — not a partial one, and not an error that would disclose that a family exists.
 *
 * ── THE MISTAKE THIS FILE DELIBERATELY DOES NOT MAKE ──────────────────────────────────────────
 * The obvious implementation is `client.findMany({ include: { waqifs: { include: { waqfs: true } } } })`.
 * `CLIENT_REACHABLE_MODELS` does narrow the top-level `Client` rows (via `waqifs.waqfs`) to the
 * families owning at least one reachable endowment — but a Prisma extension rewrites the TOP-LEVEL
 * `where` only. The NESTED `waqifs` and `waqfs` collections come back WHOLE. On the fixture that is
 * the difference between "waqif-001 + waqf-001" and the entire family: three waqifs and four
 * endowments, handed to a caller granted one. AC-E3-02 is precisely that assertion.
 *
 * So the traversal runs UPWARD instead: read the endowments the caller may see, then follow each
 * one's `waqif` → `client` (a to-one hop, so there is nothing to over-fetch — the parent of a
 * reachable endowment is reachable BY DEFINITION), and group in TypeScript. Narrowness is then a
 * property of the query's SHAPE rather than of a filter someone has to remember to add.
 *
 * ── A `Membership` CONTRIBUTES NOTHING (MP-13) ────────────────────────────────────────────────
 * `resolveGrants` never expands a membership into `authorizedWaqfIds`, so a family-board member
 * holding only a client-level `Membership` reads an EMPTY tree. Do not "fix" that here: family-board
 * read reach is expressible, and is expressed in the fixture, as explicit per-endowment
 * `FAMILY_BOARD` grants.
 *
 * ── COUNTS ARE COUNTS OF WHAT THIS CALLER MAY REACH ──────────────────────────────────────────
 * `waqifCount` / `waqfCount` are computed from the reachable set, never from the family's true
 * totals. Returning "this family has 4 endowments" to a caller who may see 1 leaks the size of the
 * engagement, which is the same enumeration oracle §10 §7.2's `NOT_FOUND` rule exists to close.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ V-E3-03 — A GRANT IS NOT A READ PERMISSION, AND THIS FILE USED TO TREAT IT AS ONE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The force filter narrows to `authorizedWaqfIds` — every endowment the caller holds ANY active
 * grant on. `endowment.get` needs strictly more than that: rung 2 additionally demands
 * `endowment:waqf:read`. Those two are not the same set, and the gap was a live disclosure.
 *
 * MEASURED at `f823365`, through `appRouter.createCaller`, on a `SUBCONTRACTOR` seat holding a grant
 * on `waqf-001` with `permissions: []`:
 *   `endowment.get({ waqfId: 'waqf-001' })` → FORBIDDEN / PERMISSION_DENIED
 *   `navigation.tree()`                     → certificateNumber `FAKE-1000001`, deedNumber
 *                                             `FAKE-DEED-455`, classification MEDIUM, type
 *                                             FAMILY_DHURRI, nature AYNI, entitlementOrder ORDERED,
 *                                             the waqif's name and the family's name.
 * A `subcontractor` preset holds `compliance:task:*` and `document:document:write` and NOTHING on the
 * `endowment` module; `aml_officer` and `beneficiary` are the same shape. The tree handed all three
 * the corpus asset's legal identity.
 *
 * ── THE FIX IS A NARROWING OF THIS FILE, NEVER A WIDENING OF `endowment.get` ─────────────────
 * {@link disclosableWaqfIds} asks {@link resolveScope} — the SAME function rung 2 calls, with the
 * SAME permission constant — whether this caller could read each endowment's record, and every read
 * below is restricted to the ids that answer yes. An endowment `endowment.get` would refuse is
 * therefore ABSENT from the tree rather than present-and-redacted: navigation is a PROJECTION of the
 * endowment record, and a projection of a refused record is a refused record. Absence also keeps the
 * non-disclosure rule intact — a redacted node would still confirm that the endowment, its endower
 * and its family exist.
 *
 * ⚠ THE COUPLING IS THE POINT. Nothing here re-implements "may this caller read the record": if rung
 * 2's rule changes, this file's answer changes with it, in the same commit, because it is the same
 * call. `test/navigation-disclosure.integration.test.ts` proves the RELATIONSHIP for every seat in
 * the role model — navigation's disclosed fields ⊆ `endowment.get`'s, field by field, value by value
 * — rather than pinning today's field list, so a router that adds a field tomorrow fails there.
 *
 * ── WHAT THIS COSTS, NAMED AND MEASURED ─────────────────────────────────────────────────────
 * A seat with no `endowment:waqf:read` now reads an EMPTY tree.
 *
 * By PRESET, three of thirteen are in that position — `subcontractor`, `aml_officer`,
 * `beneficiary` — and none of them has an endowment-record screen to navigate to; their surfaces are
 * the task list, the SAR compartment and the beneficiary portal, each reached by an id they already
 * hold. The other ten presets are unaffected.
 *
 * ⚠ BY SEEDED GRANT IT IS THREE OF THE SIX SEATS, AND TWO OF THEM ARE A SURPRISE, because resolved
 * permissions are `grant ∩ preset` and the fixture narrows further than the preset does. MEASURED on
 * a freshly seeded database through `createCaller`:
 *
 *   user-nazir-001         endowment.get(waqf-001) = found        tree = 5 endowments
 *   user-case-manager-001  endowment.get(waqf-001) = found        tree = 5 endowments
 *   user-admin-001         (holds the verb)                       tree = its granted endowment
 *   user-accountant-001    endowment.get(waqf-001) = FORBIDDEN    tree = 0   ← was 4
 *   user-family-board      endowment.get(waqf-001) = FORBIDDEN    tree = 0   ← was 4
 *   user-beneficiary-ben-001                       = FORBIDDEN    tree = 0   ← was 4
 *
 * `finance` and `family_board` BOTH carry `endowment:waqf:read` in `ROLE_PRESETS`; their seeded
 * GRANTS do not, so the intersection drops it. Those two seats could read the tree's contents and
 * could not open a single endowment record — which is the inconsistency this fix removes, from the
 * side that discloses less.
 *
 * TODO(surface): should the seeded `finance` and `family_board` grants carry `endowment:waqf:read`,
 * as their presets already permit? A finance seat that must reach an endowment's ledger has no way
 * to navigate to it today, and a family-board member sees nothing at all. That is a FIXTURE
 * decision (`packages/database`'s `GRANT_SHAPE_BY_ROLE`) with an authority-model shadow, and this
 * router must not answer it by widening — the answer, either way, belongs to whoever owns the access
 * matrix. ⚠ `apps/web/e2e/endowment.spec.ts` PINS THE OLD BOUNDARY on exactly these two seats
 * ("`navigation.tree` is authorized by the FORCE FILTER alone", four endowments and four certificate
 * numbers visible to a seat with no endowment verb). That pin must be INVERTED, not deleted: it
 * recorded the pre-fix semantics accurately and its own comment asks for exactly this argument.
 *
 * ── WHAT IS DELIBERATELY ABSENT: EVERY WRITE ─────────────────────────────────────────────────
 * There is no `client.create`, `client.update`, `waqif.create`, `waqif.update` or
 * `endowment.create` in S4, and their absence is a SCOPE DECISION that was surfaced, not an
 * omission. A `Client` has no `waqfId`, so rung 2 cannot guard it — and
 * `packages/database/src/extensions/scoping.ts` already assigns both creates to E11 in writing
 * ("ABOVE the endowment … a create here is not scope-checked either, because `payloadWaqfId` finds
 * no endowment to check against. Onboarding is E11 and owns both halves."). Shipping them would need
 * a NEW permission resource — an authority-model change (ADR-0004 territory), not a code
 * convenience. BR-102's requirement is "model and navigate", which the reads here satisfy.
 */

import { z } from 'zod';

import { resolveScope } from '../middleware/scope.js';
import { authedProcedure, router } from '../trpc.js';
import { ENDOWMENT_RECORD_READ } from './endowment.js';

import type { AuthedContext } from '../middleware/authed.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Inputs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Same bounds as `waqfScopedInput.waqfId`: ids are cuids or the fixture's `client-\d+` grammar. */
const clientIdInput = z.object({ clientId: z.string().min(1).max(64) });
const waqifIdInput = z.object({ waqifId: z.string().min(1).max(64) });

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · THE DISCLOSURE GATE — the same one `endowment.get` sits behind
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The endowments whose RECORD this caller may read — i.e. exactly the ids on which
 * `endowment.get` would answer rather than refuse.
 *
 * ⚠ IT ASKS {@link resolveScope}, IT DOES NOT RE-IMPLEMENT IT. Rung 2 is `resolveScope(ctx, waqfId,
 * permission)`; so is this. A `try/catch` is control flow here on purpose — the alternative is a
 * second predicate that starts out identical and drifts the first time the rung learns a new rule
 * (a suspended seat, a scopeRef narrowing, an expired grant class). The function throws `NO_GRANT`
 * for an unreachable endowment and `PERMISSION_DENIED` for a reachable one without the verb; from
 * navigation's point of view both mean the same thing — do not disclose this endowment — so both
 * are caught and neither is re-raised. Nothing is audited here: a tree is a read of the caller's own
 * scope, not an attempt on someone else's, and recording a denial per non-granted endowment on every
 * screen load would bury the real ones.
 */
function disclosableWaqfIds(ctx: AuthedContext): readonly string[] {
  const reachable = [...new Set(ctx.grants.map((grant) => grant.waqfId))];
  return reachable.filter((waqfId) => {
    try {
      resolveScope(ctx, waqfId, ENDOWMENT_RECORD_READ);
      return true;
    } catch {
      return false;
    }
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The one selection every procedure here reads
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The endowment fields the tree renders, plus the upward hops.
 *
 * ⚠ EVERY FIELD HERE IS ALSO IN `endowment.ts`'s `ENDOWMENT_SELECT`, AND THAT IS A REQUIREMENT
 * RATHER THAN A COINCIDENCE — `test/navigation-disclosure.integration.test.ts` compares the two
 * payloads key by key, value by value, for every seat in the role model. Adding a field here that
 * `endowment.get` does not return turns that test red.
 *
 * ⚠ AND THE FIELDS ARE NOT HARMLESS. `deedNumber` and `certificateNumber` are the corpus asset's
 * legal identity; `type` / `nature` / `entitlementOrder` are founder's conditions the database now
 * seals outright (D-B). An earlier version of this comment claimed the selection carried "no
 * `deedNumber`" while the line below selected it — the comment was the drifted side, and the gate
 * above is what actually keeps the payload safe. `shartAlWaqif` is genuinely absent, and stays so.
 */
const TREE_SELECT = {
  id: true,
  certificateNumber: true,
  deedNumber: true,
  classification: true,
  type: true,
  nature: true,
  entitlementOrder: true,
  waqif: {
    select: {
      id: true,
      nameAr: true,
      nameEn: true,
      client: { select: { id: true, nameAr: true, nameEn: true } },
    },
  },
} as const;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The router
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export const navigationRouter = router({
  /**
   * The whole reachable hierarchy, in one call: client → waqif → endowment.
   *
   * Ordered deterministically at every level (`waqfId asc` from the database, then a stable sort on
   * the grouped ids) so a UI's tree does not reshuffle between requests and a test can assert an
   * exact array.
   */
  tree: authedProcedure.query(async ({ ctx }) => {
    // ⚠ TWO GATES, NOT ONE, AND THE SECOND IS THE V-E3-03 FIX.
    //  1. THE FORCE FILTER: `ctx.db` was built from this request's own grants, so the query is
    //     narrowed to `authorizedWaqfIds` before it leaves the process (`deletedAt: null` is the
    //     extension's too).
    //  2. `disclosableWaqfIds` — the caller must additionally hold `endowment:waqf:read`, which is
    //     what `endowment.get` demands. The force filter alone answers "does this caller have a
    //     seat here", never "may this caller read the record", and a tree is a read of the record.
    // An empty list yields `in: []`, which matches nothing — deny by default, not read everything.
    const disclosable = disclosableWaqfIds(ctx);
    const waqfs = await ctx.db.waqf.findMany({
      where: { id: { in: [...disclosable] } },
      select: TREE_SELECT,
      orderBy: { id: 'asc' },
    });

    // Group upward. A `Map` keyed on id keeps insertion order, which is already `waqfId asc`.
    const clients = new Map<
      string,
      {
        id: string;
        nameAr: string;
        nameEn: string | null;
        waqifs: Map<
          string,
          {
            id: string;
            nameAr: string;
            nameEn: string | null;
            waqfs: {
              id: string;
              certificateNumber: string;
              deedNumber: string;
              classification: string;
              type: string;
              nature: string;
              entitlementOrder: string;
            }[];
          }
        >;
      }
    >();

    for (const waqf of waqfs) {
      const waqif = waqf.waqif;
      const client = waqif.client;

      let clientNode = clients.get(client.id);
      if (clientNode === undefined) {
        clientNode = {
          id: client.id,
          nameAr: client.nameAr,
          nameEn: client.nameEn,
          waqifs: new Map(),
        };
        clients.set(client.id, clientNode);
      }

      let waqifNode = clientNode.waqifs.get(waqif.id);
      if (waqifNode === undefined) {
        waqifNode = { id: waqif.id, nameAr: waqif.nameAr, nameEn: waqif.nameEn, waqfs: [] };
        clientNode.waqifs.set(waqif.id, waqifNode);
      }

      waqifNode.waqfs.push({
        id: waqf.id,
        certificateNumber: waqf.certificateNumber,
        deedNumber: waqf.deedNumber,
        // Prisma enums arrive as their string literals; `String()` pins the wire type so a schema
        // enum rename is a compile error at the consumer rather than a silent shape change.
        classification: String(waqf.classification),
        type: String(waqf.type),
        nature: String(waqf.nature),
        entitlementOrder: String(waqf.entitlementOrder),
      });
    }

    return {
      clients: [...clients.values()].map((client) => ({
        id: client.id,
        nameAr: client.nameAr,
        nameEn: client.nameEn,
        waqifs: [...client.waqifs.values()],
      })),
    };
  }),

  /** One family. */
  client: router({
    /**
     * `null` — NOT `FORBIDDEN` — when the caller may reach no endowment of this family.
     *
     * The same non-disclosure rule rung 2 applies to `NO_GRANT` (§10 §7.2): a `FORBIDDEN` on
     * `client-002` would confirm that `client-002` exists and that this caller is not on it, and over
     * a portfolio of families that is an enumeration oracle. `null` says nothing.
     */
    get: authedProcedure.input(clientIdInput).query(async ({ ctx, input }) => {
      // Anchored on `waqf`, so the answer is built out of DISCLOSABLE endowments only — reachable
      // AND readable (V-E3-03). A family none of whose endowments this caller may read produces an
      // empty array and therefore `null`: the family's NAME is a fact about the endowment record's
      // ancestry, and a seat refused the record does not learn it from a navigator.
      const reachable = await ctx.db.waqf.findMany({
        where: { id: { in: [...disclosableWaqfIds(ctx)] }, waqif: { clientId: input.clientId } },
        select: { id: true, waqifId: true },
        orderBy: { id: 'asc' },
      });
      if (reachable.length === 0) return null;

      // Read through the caller's own client: `CLIENT_REACHABLE_MODELS` narrows `Client` via
      // `waqifs.waqfs`, so this is the second, independent enforcement of the same fact.
      const client = await ctx.db.client.findFirst({
        where: { id: input.clientId },
        select: { id: true, nameAr: true, nameEn: true },
      });
      if (client === null) return null;

      return {
        id: client.id,
        nameAr: client.nameAr,
        nameEn: client.nameEn,
        // ⚠ COUNTS OF THE REACHABLE SET, NOT OF THE FAMILY. See the file header.
        waqifCount: new Set(reachable.map((waqf) => waqf.waqifId)).size,
        waqfCount: reachable.length,
      };
    }),
  }),

  /** One endower. */
  waqif: router({
    /** `null` when no endowment of this endower is reachable. Same non-disclosure rule as above. */
    get: authedProcedure.input(waqifIdInput).query(async ({ ctx, input }) => {
      // Same two gates as `tree` (V-E3-03): reachable AND readable. `certificateNumber` is a corpus
      // asset's legal identity and the endower's name is part of the record's ancestry; neither is
      // navigation's to hand to a seat `endowment.get` refuses.
      const reachable = await ctx.db.waqf.findMany({
        where: { id: { in: [...disclosableWaqfIds(ctx)] }, waqifId: input.waqifId },
        select: { id: true, certificateNumber: true, classification: true },
        orderBy: { id: 'asc' },
      });
      if (reachable.length === 0) return null;

      const waqif = await ctx.db.waqif.findFirst({
        where: { id: input.waqifId },
        select: { id: true, clientId: true, nameAr: true, nameEn: true },
      });
      if (waqif === null) return null;

      return {
        id: waqif.id,
        clientId: waqif.clientId,
        nameAr: waqif.nameAr,
        nameEn: waqif.nameEn,
        waqfs: reachable.map((waqf) => ({
          id: waqf.id,
          certificateNumber: waqf.certificateNumber,
          classification: String(waqf.classification),
        })),
      };
    }),
  }),
});
