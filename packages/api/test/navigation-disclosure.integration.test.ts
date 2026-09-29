/**
 * V-E3-03 — **NAVIGATION MAY NEVER DISCLOSE WHAT `endowment.get` REFUSES.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS FILE EXISTS FOR, AS MEASURED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `navigation.tree` / `navigation.client.get` / `navigation.waqif.get` are `authedProcedure` — they
 * cannot be endowment-scoped, because their ANSWER is *which* endowments. Their only authorization
 * was therefore the Prisma force filter, which narrows to `authorizedWaqfIds`: **every endowment the
 * caller holds ANY active grant on.** `endowment.get` needs strictly more — rung 2 also demands
 * `endowment:waqf:read`. The gap between those two sets was a live disclosure, introduced this
 * sprint.
 *
 * MEASURED at `f823365` through `appRouter.createCaller`, on a `SUBCONTRACTOR` seat holding a grant
 * on `waqf-001` with `permissions: []`:
 *
 *   endowment.get({ waqfId: 'waqf-001' })
 *     → THREW FORBIDDEN · "role SUBCONTRACTOR holds an active grant on waqf waqf-001 but not
 *        endowment:waqf:read"
 *   navigation.tree()
 *     → { clients: [ { id: 'client-001', nameAr: 'عائلة الراشدي (بيانات وهمية)',
 *          nameEn: 'Al-Rashidi Family (fictional)', waqifs: [ { id: 'waqif-001',
 *          nameAr: 'إبراهيم الراشدي (بيانات وهمية)', nameEn: 'Ibrahim Al-Rashidi (fictional)',
 *          waqfs: [ { id: 'waqf-001', certificateNumber: 'FAKE-1000001',
 *          deedNumber: 'FAKE-DEED-455', classification: 'MEDIUM', type: 'FAMILY_DHURRI',
 *          nature: 'AYNI', entitlementOrder: 'ORDERED' } ] } ] } ] }
 *   navigation.waqif.get({ waqifId: 'waqif-001' })
 *     → the endower's name plus certificateNumber 'FAKE-1000001' and classification 'MEDIUM'
 *   navigation.client.get({ clientId: 'client-001' })
 *     → the family's name plus waqifCount 1 / waqfCount 1
 *
 * `certificateNumber` and `deedNumber` are the corpus asset's legal identity; `type`, `nature` and
 * `entitlementOrder` are founder's conditions the database now seals outright (D-B).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ WHAT THIS FILE ASSERTS IS A RELATIONSHIP, NOT A FIELD LIST
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * A test that pinned *"`deedNumber` is absent from the tree"* would go green today and catch nothing
 * the next time a router grows a field. So the property asserted, for EVERY seat in the thirteen-role
 * model, is:
 *
 *   **for every endowment navigation mentions, every key/value pair it discloses about that
 *   endowment also appears — same key, equal value — in `endowment.get`'s payload for the SAME
 *   caller; and every endowment `endowment.get` refuses to that caller is ABSENT from navigation
 *   entirely, along with its endower and its family.**
 *
 * The walk is over `Object.entries` of whatever navigation actually returned, so a field added to
 * `TREE_SELECT` tomorrow is compared automatically and fails unless `endowment.get` discloses it too.
 * ⚠ AND SINCE AL-3, **EVERY** NODE KIND ALSO PINS AN EXHAUSTIVE KEY SET — the two ancestry nodes
 * (`{id, nameAr, nameEn, waqfs|waqifs}`) and, at last, the two ENDOWMENT nodes. That is the opposite
 * discipline from pinning an absence: a new field *fails* the assertion rather than slipping past
 * it, and adding one is then a deliberate decision with this comment in the diff.
 *
 * The endowment node used to be the ONE exception, and the sentence this one replaced said so. The
 * gap that left was narrow and real: the subset clause only asks whether `endowment.get` ALSO
 * returns the field, so **any** field the record reader happens to disclose could be added to a
 * navigation selection in silence — and the fields on that node are a corpus asset's legal identity
 * and the founder's conditions.
 *
 * MUTATION-MEASURED, both directions, one mutation: `waqifId` added to `TREE_SELECT` and emitted on
 * the tree's endowment node, nothing else changed. `endowment.get` returns `waqifId`, so the subset
 * clause is satisfied and — before AL-3 — nothing else looked.
 *
 *   walker WITHOUT the endowment key set (the pre-AL-3 shape)  →  **19 passed (19)**, GREEN
 *   walker WITH it (the file as it stands)                     →  **11 failed | 8 passed (19)**,
 *       each failure reading `<seat>/tree: tree.endowment node key set: expected [ … 7 ] to deeply
 *       equal [ … 6 ]`, once per seat that may read the record.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ G7-V3 — AND IT USED TO COVER **ONE** OF THE THREE PROCEDURES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The first version of this file walked `navigation.tree` and nothing else. `navigation.waqif.get`
 * and `navigation.client.get` build their OWN hand-rolled selections, and no assertion compared
 * them — so the relationship above was proved for a third of the surface and claimed for all of it.
 *
 * MUTATION-MEASURED, on the version of this file that walked only the tree: adding `shartAlWaqif`
 * and `shartAlWaqifSetAt` to `navigation.waqif.get`'s `select` and emitting both on the wire left
 * the suite **GREEN at 18/18**, with `navigation.waqif.get({ waqifId: 'waqif-001' })` returning the
 * whole founder's-conditions JSON (`{"tiers":[{"lines":["BUTUN","ZUHUR"],"tabaqa":1,…`) — the one
 * document Binding rule 1 makes immutable, handed out by a navigator. The same mutation is now
 * re-applied against the file below and turns it RED.
 *
 * WHAT CHANGED: the walk is driven by {@link NAVIGATION_NODES}, an EXHAUSTIVE key set per node kind,
 * and every navigation procedure is walked through it for every seat. Three consequences, all
 * deliberate:
 *   · a field added to ANY navigation procedure's endowment node is compared against
 *     `endowment.get` automatically, and fails unless the record reader discloses it too;
 *   · a field added to ANY node — ancestry OR endowment — fails the exhaustive key-set assertion
 *     and has to be argued for (AL-3);
 *   · a NEW NESTED SHAPE fails as an unregistered node kind, rather than being walked past.
 *
 * ⚠ DRIVEN THROUGH `createCaller` AGAINST THE REAL DATABASE, never by reading code. Real grant
 * resolution, real `grant ∩ preset` narrowing, the real force filter, real rows.
 */

import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ROLE_KEYS, ROLE_PRESETS, type RoleKey } from '@qmulate/domain';

import {
  API_TEST_PREFIX,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  hasDatabase,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { ENDOWMENT_RECORD_READ } from '../src/routers/endowment.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('V-E3-03 (navigation may not disclose what endowment.get refuses)');

const createCaller = createCallerFactory(appRouter);

/** Reads a file under `packages/api/`, refusing an empty read (which would pass over nothing). */
function readSource(relative: string): string {
  const text = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
  if (text.trim() === '') throw new Error(`${relative} read as empty — fix the reader`);
  return text;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * One seat per role, on ONE endowment
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The endowment every seat below is granted on. `waqf-001` is the one with beneficiaries. */
const SUBJECT_WAQF = 'waqf-001';
/** Its ancestry, so the "absent entirely" half can look for the names too. */
const SUBJECT_WAQIF = 'waqif-001';
const SUBJECT_CLIENT = 'client-001';

/**
 * The Prisma `Role` value for a product role key.
 *
 * `roleKeyFromDbRole` is the forward direction and `DB_ROLE_KEY_EXCEPTIONS` records the one
 * asymmetry (`SYSTEM_ADMIN` ⇄ `admin`, ADR-0004). Inverted here rather than imported because the
 * inverse is not exported, and the single exception is asserted below so the inversion cannot rot.
 */
function dbRoleFor(role: RoleKey): string {
  return role === 'admin' ? 'SYSTEM_ADMIN' : role.toUpperCase();
}

/** `user-test-api-nav-<role>` — one seat per role, holding that role's FULL preset. */
function seatFor(role: RoleKey): string {
  return `${API_TEST_PREFIX}nav-${role}`;
}

/**
 * The adversarial seat: `SUBCONTRACTOR`, grant on `SUBJECT_WAQF`, `permissions: []`.
 *
 * ⚠ THE ORIGINAL REPRO, KEPT AS ITS OWN SUBJECT. The thirteen preset seats below cover the role
 * model; this one covers the narrower and nastier case the finding was measured on — a grant that
 * confers nothing at all, which the force filter still admits.
 */
const EMPTY_PERMISSION_SEAT = `${API_TEST_PREFIX}nav-empty-permissions`;

/**
 * THE MIXED-REACH SEAT, and it is what makes clause (3) non-vacuous for the two POINT READS.
 *
 * `waqf-002` and `waqf-005` share `waqif-002` and therefore `client-001`. This seat may read the
 * record of the first and not of the second, so naming that endower or that family directly is the
 * only question worth asking of `waqif.get` / `client.get`: a router filtering on the FORCE FILTER
 * alone would hand back `waqf-005` beside `waqf-002`, and every seat that reaches nothing at all
 * would still report an empty payload and look healthy.
 */
const MIXED_REACH_SEAT = `${API_TEST_PREFIX}nav-mixed-reach`;
/** The endowment {@link MIXED_REACH_SEAT} may READ. */
const MIXED_READABLE_WAQF = 'waqf-002';
/** Its sibling under the SAME endower, on which that seat holds a grant conferring nothing. */
const MIXED_REFUSED_WAQF = 'waqf-005';
const MIXED_WAQIF = 'waqif-002';

/** Roles whose PRESET carries `endowment:waqf:read`. Derived — never transcribed. */
const RECORD_READERS: readonly RoleKey[] = ROLE_KEYS.filter((role) =>
  (ROLE_PRESETS[role] as readonly string[]).includes(ENDOWMENT_RECORD_READ),
);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE NODE REGISTRY — every shape navigation may return, exhaustively
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The two ENDOWMENT node kinds — the nodes the walker ALSO compares against `endowment.get`, field
 * by field.
 *
 * ⚠ TWO REGISTERED KINDS, NOT ONE UNREGISTERED SENTINEL, AND THAT IS AL-3's FIX. There used to be a
 * single `ENDOWMENT` sentinel carrying NO key set, because the tree's endowment node and
 * `navigation.waqif.get`'s carry DIFFERENT fields — seven versus three — and one shared entry could
 * not describe both. Naming them separately is what lets each be pinned exactly.
 */
const TREE_ENDOWMENT_NODE = 'tree.endowment';
const WAQIF_ENDOWMENT_NODE = 'waqif.get.endowment';

interface NodeShape {
  /** EXHAUSTIVE. A key that appears on the wire and not here fails; so does one here and not there. */
  readonly keys: readonly string[];
  /** Keys carrying an ARRAY of child nodes, and the kind each element must be walked as. */
  readonly children: Readonly<Record<string, string>>;
  /**
   * When present, the walker ALSO compares this node against `endowment.get` for the SAME caller.
   *
   * ⚠ THE KEY SET STILL APPLIES. The two are different questions — *"is every field disclosed here
   * one the record gate approved?"* and *"is this field list the one that was argued for?"* — and
   * only the first was ever asked of an endowment node before AL-3.
   */
  readonly endowment?: true;
}

/**
 * Every node kind every navigation procedure may return.
 *
 * ⚠ THE REGISTRY IS THE ASSERTION. A shape absent from here is an unregistered node kind and fails
 * the walk outright, so a router that grows a new nested collection cannot be walked past in
 * silence — which is precisely how `navigation.waqif.get`'s own selection went uncompared for a
 * whole sprint (G7-V3).
 */
const NAVIGATION_NODES: Readonly<Record<string, NodeShape>> = {
  'tree.root': { keys: ['clients'], children: { clients: 'tree.client' } },
  'tree.client': {
    keys: ['id', 'nameAr', 'nameEn', 'waqifs'],
    children: { waqifs: 'tree.waqif' },
  },
  'tree.waqif': {
    keys: ['id', 'nameAr', 'nameEn', 'waqfs'],
    children: { waqfs: TREE_ENDOWMENT_NODE },
  },
  // ⚠ SEVEN FIELDS, AND EVERY ONE OF THEM IS EITHER THE CORPUS ASSET'S LEGAL IDENTITY
  // (`certificateNumber`, `deedNumber`) OR A FOUNDER'S CONDITION THE DATABASE SEALS OUTRIGHT
  // (`type`, `nature`, `entitlementOrder`). The subset clause proves each is also `endowment.get`'s;
  // this list is the second question, and an eighth entry must be argued for even when the record
  // reader would disclose it — a navigator's job is to get someone TO a record, not to be one.
  [TREE_ENDOWMENT_NODE]: {
    endowment: true,
    keys: [
      'id',
      'certificateNumber',
      'deedNumber',
      'classification',
      'type',
      'nature',
      'entitlementOrder',
    ],
    children: {},
  },
  // ⚠ `waqifCount` / `waqfCount` ARE COUNTS OF THE DISCLOSABLE SET, and clause (4) below proves it
  // against the tree rather than trusting the router's own arithmetic.
  'client.get': {
    keys: ['id', 'nameAr', 'nameEn', 'waqifCount', 'waqfCount'],
    children: {},
  },
  'waqif.get': {
    keys: ['id', 'clientId', 'nameAr', 'nameEn', 'waqfs'],
    children: { waqfs: WAQIF_ENDOWMENT_NODE },
  },
  // NARROWER THAN THE TREE'S, deliberately: a point read on one endower carries no `deedNumber` and
  // no founder's conditions at all. Pinned separately for exactly that reason — a field added here
  // would widen a point read past the tree with nothing saying so.
  [WAQIF_ENDOWMENT_NODE]: {
    endowment: true,
    keys: ['id', 'certificateNumber', 'classification'],
    children: {},
  },
};

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The property, as a function — applied to EVERY procedure, for every seat
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface NavigationEndowment {
  readonly id: string;
  readonly [key: string]: unknown;
}

type Caller = ReturnType<typeof createCaller>;

/** What one procedure's walk saw, so the caller can prove the assertion was not vacuous. */
interface WalkResult {
  /** Endowment ids the procedure disclosed. */
  readonly disclosed: string[];
  /** The serialized payload, for the "refused endowments are absent entirely" clause. */
  readonly serialized: string;
}

/**
 * Walks ONE navigation payload against {@link NAVIGATION_NODES}, comparing every endowment node it
 * finds — at any depth — with `endowment.get` for the SAME caller.
 *
 * `null` is a legitimate payload for the two point reads (non-disclosure, §10 §7.2) and walks to an
 * empty result.
 */
async function walkNavigationPayload(
  caller: Caller,
  payload: unknown,
  kind: string,
  label: string,
  seen: string[] = [],
): Promise<WalkResult> {
  const disclosed: string[] = seen;
  if (payload === null) return { disclosed, serialized: 'null' };

  const shape = NAVIGATION_NODES[kind];
  if (shape === undefined) {
    throw new Error(
      `${label}: node kind "${kind}" is not in NAVIGATION_NODES. An unregistered shape is a shape ` +
        `no assertion in this file has looked at.`,
    );
  }

  const node = payload as Record<string, unknown>;

  // ── (1) THE KEY SET IS PINNED, EXHAUSTIVELY — FOR EVERY KIND, ENDOWMENT NODES INCLUDED (AL-3) ──
  // Not an absence check. A field ADDED to any selection fails here and has to be argued for:
  // `endowment.get` returns `clientId`/`waqifId` and no ancestry NAMES at all, so a new ancestry
  // field could not be justified by clause (2) at all — and an endowment field that clause (2)
  // WOULD accept still has to be a decision, which is the half that was missing.
  expect(Object.keys(node).sort(), `${label}: ${kind} node key set`).toEqual(
    [...shape.keys].sort(),
  );

  if (shape.endowment === true) {
    const waqf = node as unknown as NavigationEndowment;
    disclosed.push(waqf.id);

    // ── (2) THE SUBSET ITSELF ──────────────────────────────────────────────────────────────
    // `endowment.get` must ANSWER for this endowment. If it throws, navigation disclosed an
    // endowment the record reader refuses — which is the whole defect.
    const record = (await caller.endowment.get({ waqfId: waqf.id })) as Record<string, unknown>;
    expect(
      record['found'],
      `${label}: ${waqf.id} is disclosed but endowment.get says found:false`,
    ).toBe(true);

    for (const [key, value] of Object.entries(waqf)) {
      expect(
        key in record,
        `${label}: navigation discloses "${key}" about ${waqf.id}, and endowment.get returns no ` +
          `such field for this seat. Navigation is a PROJECTION of the endowment record — a ` +
          `field it carries that the record does not is a field the record gate never approved.`,
      ).toBe(true);
      expect(
        record[key],
        `${label}: navigation and endowment.get disagree on ${waqf.id}.${key}`,
      ).toEqual(value);
    }
    return { disclosed, serialized: JSON.stringify(node) };
  }

  for (const [key, value] of Object.entries(node)) {
    const childKind = shape.children[key];
    if (childKind === undefined) {
      // A FACT key must be a scalar. A nested object smuggled in under a registered key would
      // otherwise never be walked — the same blindness in a different disguise.
      expect(
        value === null || typeof value !== 'object',
        `${label}: ${kind}.${key} carries a nested structure, which no node kind describes`,
      ).toBe(true);
      continue;
    }
    expect(Array.isArray(value), `${label}: ${kind}.${key} must be an array of ${childKind}`).toBe(
      true,
    );
    for (const child of value as unknown[]) {
      await walkNavigationPayload(caller, child, childKind, label, disclosed);
    }
  }

  return { disclosed, serialized: JSON.stringify(node) };
}

/**
 * Asserts navigation ⊆ `endowment.get` for one caller across **every navigation procedure**, and
 * returns what it saw so the caller can check the assertion was not vacuous.
 */
async function assertNavigationSubsetOfRecord(
  userId: string,
  label: string,
): Promise<{ disclosed: string[]; refused: string[]; payloads: string[] }> {
  const ctx = await contextFor({ userId, requestId: `nav-subset-${label}` });
  const caller = createCaller(ctx);

  // ── EVERY PROCEDURE, NOT JUST THE TREE (G7-V3) ────────────────────────────────────────────
  // The two point reads are called on the ANCESTRY OF EVERY ENDOWMENT THE SEAT HOLDS A GRANT ON —
  // including the ones `endowment.get` refuses — so clause (3) below is asked the question that
  // matters: does a refused endowment show up when its family or its endower is named directly?
  const grantedWaqfIds = [...new Set(ctx.grants.map((grant) => grant.waqfId))].sort();
  const ancestry = await ancestryOf(grantedWaqfIds);

  const tree = await caller.navigation.tree();
  const walks: WalkResult[] = [
    await walkNavigationPayload(caller, tree, 'tree.root', `${label}/tree`),
  ];

  for (const clientId of ancestry.clientIds) {
    const payload = await caller.navigation.client.get({ clientId });
    walks.push(
      await walkNavigationPayload(
        caller,
        payload,
        'client.get',
        `${label}/client.get(${clientId})`,
      ),
    );
  }
  for (const waqifId of ancestry.waqifIds) {
    const payload = await caller.navigation.waqif.get({ waqifId });
    walks.push(
      await walkNavigationPayload(caller, payload, 'waqif.get', `${label}/waqif.get(${waqifId})`),
    );
  }

  const disclosed = [...new Set(walks.flatMap((walk) => walk.disclosed))].sort();
  const payloads = walks.map((walk) => walk.serialized);

  // ── (3) EVERY REFUSED ENDOWMENT IS ABSENT FROM EVERY PROCEDURE ────────────────────────────
  // Over the caller's OWN grants, which is the set the force filter admits. An endowment the record
  // reader refuses must not appear in ANY navigation payload — not as an id, and not through
  // `waqif.get` / `client.get` either, because a redacted node would still confirm that the
  // endowment, its endower and its family exist.
  const refused: string[] = [];
  for (const waqfId of grantedWaqfIds) {
    let answered = false;
    try {
      const record = (await caller.endowment.get({ waqfId })) as Record<string, unknown>;
      answered = record['found'] === true;
    } catch {
      answered = false;
    }
    if (answered) continue;
    refused.push(waqfId);
    for (const [index, serialized] of payloads.entries()) {
      expect(
        serialized.includes(waqfId),
        `${label}: endowment.get refuses ${waqfId}, but navigation payload #${String(index)} ` +
          `mentions it`,
      ).toBe(false);
    }
  }

  // ── (4) THE COUNTS COUNT THE DISCLOSABLE SET ──────────────────────────────────────────────
  // `client.get` reports `waqifCount`/`waqfCount`, which are not endowment FIELDS and so are not
  // covered by clause (2) — and a router that counted the FAMILY's true totals would leak the size
  // of the engagement to a seat that may open one record (§10 §7.2's enumeration oracle). The
  // arithmetic is checked against the TREE for the same caller, which clause (2) has already
  // constrained, rather than against the router's own query.
  const treeShape = tree as {
    clients: { id: string; waqifs: { id: string; waqfs: { id: string }[] }[] }[];
  };
  for (const clientId of ancestry.clientIds) {
    const payload = (await caller.navigation.client.get({ clientId })) as {
      waqifCount: number;
      waqfCount: number;
    } | null;
    const inTree = treeShape.clients.find((client) => client.id === clientId);
    if (payload === null) {
      expect(
        inTree,
        `${label}: client.get(${clientId}) says null while the tree carries that family`,
      ).toBeUndefined();
      continue;
    }
    expect(
      inTree,
      `${label}: client.get(${clientId}) answered but the tree omits the family`,
    ).toBeDefined();
    expect(payload.waqifCount, `${label}: client.get(${clientId}).waqifCount`).toBe(
      inTree?.waqifs.length,
    );
    expect(payload.waqfCount, `${label}: client.get(${clientId}).waqfCount`).toBe(
      inTree?.waqifs.reduce((total, waqif) => total + waqif.waqfs.length, 0),
    );
  }

  return { disclosed, refused, payloads };
}

/**
 * The TRUE ancestry of a set of endowments, read on the unextended client.
 *
 * ⚠ SCAFFOLDING, AND NO ASSERTION IS MADE ON IT. It exists so the point reads can be called with
 * the family and endower ids of endowments the caller is REFUSED — which is the only way to ask
 * whether naming them directly discloses anything. Reading it through the caller's own scoped
 * client would return exactly the ids the code under test chose to admit, and the question would
 * answer itself.
 */
async function ancestryOf(
  waqfIds: readonly string[],
): Promise<{ clientIds: string[]; waqifIds: string[] }> {
  if (waqfIds.length === 0) return { clientIds: [], waqifIds: [] };
  const prisma = await basePrisma();
  const list = waqfIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(', ');
  const rows = await prisma.$queryRawUnsafe<{ waqifId: string; clientId: string }[]>(
    `SELECT w."waqifId", f."clientId" FROM "waqf" w JOIN "waqif" f ON f."id" = w."waqifId"
       WHERE w."id" IN (${list})`,
  );
  return {
    clientIds: [...new Set(rows.map((row) => row.clientId))].sort(),
    waqifIds: [...new Set(rows.map((row) => row.waqifId))].sort(),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * The suite
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

describe.skipIf(!hasDatabase)('V-E3-03 · navigation discloses no more than endowment.get', () => {
  beforeAll(async () => {
    await assertSeeded();

    await provisionTestSubjects([
      ...ROLE_KEYS.map((role) => ({
        id: seatFor(role),
        role: dbRoleFor(role),
        waqfIds: [SUBJECT_WAQF],
        // The role's OWN preset, in full. `resolveGrantPermissions` intersects on read, so this is
        // the widest a seat of that role can ever be — the strongest form of the assertion.
        permissions: [...ROLE_PRESETS[role]],
        // A DB CHECK (`waqf_access_grant_beneficiary_self_pin`) ties this to the role, both ways.
        beneficiarySelfId: role === 'beneficiary' ? 'ben-001' : null,
      })),
      {
        id: EMPTY_PERMISSION_SEAT,
        role: 'SUBCONTRACTOR',
        waqfIds: [SUBJECT_WAQF],
        permissions: [],
      },
      // ⚠ TWO GRANTS, ONE ENDOWER — and only one of them carries the record verb. Provisioned as
      // two separate specs because `permissions` is per grant, which is exactly the real shape:
      // authority is per ENDOWMENT (§10 principle 2), never per family.
      {
        id: MIXED_REACH_SEAT,
        role: 'CASE_MANAGER',
        waqfIds: [MIXED_READABLE_WAQF],
        permissions: [ENDOWMENT_RECORD_READ],
      },
      {
        id: MIXED_REACH_SEAT,
        role: 'SUBCONTRACTOR',
        waqfIds: [MIXED_REFUSED_WAQF],
        permissions: [],
      },
    ]);
  }, 300_000);

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  it('the inverse role mapping is right, and the one exception is the only one', () => {
    // The seats above are provisioned by `dbRoleFor`. If that inversion were wrong, every seat would
    // be created under the wrong role and the whole file would assert the wrong thing quietly.
    expect(dbRoleFor('admin')).toBe('SYSTEM_ADMIN');
    for (const role of ROLE_KEYS) {
      if (role === 'admin') continue;
      expect(dbRoleFor(role)).toBe(role.toUpperCase());
    }
  });

  it('the premise is real: some roles hold endowment:waqf:read and some do not', () => {
    // Without this, "navigation ⊆ endowment.get" could hold because EVERY seat reads everything, or
    // because every seat reads nothing, and the file would prove neither.
    expect(RECORD_READERS.length).toBeGreaterThan(0);
    expect(RECORD_READERS.length).toBeLessThan(ROLE_KEYS.length);
    // Named, so the split is visible in the diff when a preset changes.
    expect(ROLE_KEYS.filter((role) => !RECORD_READERS.includes(role)).sort()).toEqual([
      'aml_officer',
      'beneficiary',
      'subcontractor',
    ]);
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE RELATIONSHIP, FOR EVERY SEAT IN THE ROLE MODEL
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  for (const role of ROLE_KEYS) {
    it(`${role} · every field navigation returns is one endowment.get returns to the same seat`, async () => {
      const { disclosed, refused } = await assertNavigationSubsetOfRecord(seatFor(role), role);

      // The assertion is not vacuous in EITHER direction: a record-reading role must actually see
      // the endowment (otherwise the subset holds over an empty tree), and a non-reading role must
      // actually have something refused (otherwise "absent" is true because nothing was granted).
      if (RECORD_READERS.includes(role)) {
        expect(
          disclosed,
          `${role} holds ${ENDOWMENT_RECORD_READ} and must SEE ${SUBJECT_WAQF}`,
        ).toContain(SUBJECT_WAQF);
        expect(refused).toEqual([]);
      } else {
        expect(disclosed).toEqual([]);
        expect(
          refused,
          `${role} does not hold ${ENDOWMENT_RECORD_READ}, so ${SUBJECT_WAQF} must be refused — ` +
            `otherwise this seat proves nothing`,
        ).toContain(SUBJECT_WAQF);
      }
    }, 120_000);
  }

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE MIXED-REACH SEAT — the only subject that makes the POINT READS prove anything
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('a seat that may read ONE of an endower’s two endowments sees exactly that one, everywhere', async () => {
    const { disclosed, refused } = await assertNavigationSubsetOfRecord(
      MIXED_REACH_SEAT,
      'mixed-reach',
    );

    // The premise, first: this seat genuinely straddles the boundary. Without both halves the
    // assertions below would be true of a seat that reaches everything or nothing.
    expect(disclosed).toEqual([MIXED_READABLE_WAQF]);
    expect(refused).toEqual([MIXED_REFUSED_WAQF]);

    // And the point reads, named directly rather than reached through the tree. `waqif.get` on the
    // SHARED endower must answer — the seat may read one of its endowments — and must carry only
    // the readable one.
    const ctx = await contextFor({ userId: MIXED_REACH_SEAT, requestId: 'nav-mixed-point' });
    const caller = createCaller(ctx);

    const waqif = await caller.navigation.waqif.get({ waqifId: MIXED_WAQIF });
    expect(waqif, 'the endower of a readable endowment must resolve').not.toBeNull();
    expect(waqif?.waqfs.map((waqf) => waqf.id)).toEqual([MIXED_READABLE_WAQF]);

    const client = await caller.navigation.client.get({ clientId: SUBJECT_CLIENT });
    expect(client, 'the family of a readable endowment must resolve').not.toBeNull();
    // ONE endower and ONE endowment — not the family's true 3 and 5.
    expect(client?.waqifCount).toBe(1);
    expect(client?.waqfCount).toBe(1);

    for (const payload of [JSON.stringify(waqif), JSON.stringify(client)]) {
      expect(
        payload.includes(MIXED_REFUSED_WAQF),
        `${MIXED_REFUSED_WAQF} is refused by endowment.get and must not surface on a point read`,
      ).toBe(false);
    }
  }, 120_000);

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE ORIGINAL REPRO, INVERTED
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('the measured V-E3-03 payload is gone: a permissions:[] SUBCONTRACTOR reads NOTHING', async () => {
    const ctx = await contextFor({ userId: EMPTY_PERMISSION_SEAT, requestId: 'nav-ve303-repro' });
    const caller = createCaller(ctx);

    // ⚠ THE PREMISE FIRST. Without it, an empty tree would also be true for a user with no grant at
    // all, and the assertions below would be proving the wrong refusal.
    expect(ctx.grants.map((grant) => grant.waqfId)).toEqual([SUBJECT_WAQF]);
    expect(ctx.grants[0]?.permissions).toEqual([]);

    // The control: `endowment.get` REFUSES this seat, and refuses it for the reason the fix is about.
    let thrown: unknown;
    try {
      await caller.endowment.get({ waqfId: SUBJECT_WAQF });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: string } | undefined)?.code).toBe('FORBIDDEN');
    expect(String((thrown as Error | undefined)?.message)).toContain('PERMISSION_DENIED');

    // And now the fields that used to come back, one at a time, as they were MEASURED. This is a
    // regression pin on the specific disclosure, sitting BESIDE the general subset property above —
    // the general one is what catches the next field; this one records what was actually leaked.
    const tree = JSON.stringify(await caller.navigation.tree());
    for (const leaked of [
      'FAKE-1000001', // certificateNumber
      'FAKE-DEED-455', // deedNumber
      'MEDIUM', // classification
      'FAMILY_DHURRI', // type
      'AYNI', // nature
      'ORDERED', // entitlementOrder
      SUBJECT_WAQF,
      SUBJECT_WAQIF,
      SUBJECT_CLIENT,
      'الراشدي', // the family's and the endower's names
    ]) {
      expect(tree, `${leaked} is still disclosed by navigation.tree`).not.toContain(leaked);
    }
    expect(tree).toBe('{"clients":[]}');

    // The two point reads say `null`, NOT `FORBIDDEN` — a refusal would confirm the family and the
    // endower exist, which is the same enumeration oracle §10 §7.2's NOT_FOUND rule closes.
    await expect(caller.navigation.client.get({ clientId: SUBJECT_CLIENT })).resolves.toBeNull();
    await expect(caller.navigation.waqif.get({ waqifId: SUBJECT_WAQIF })).resolves.toBeNull();
  }, 120_000);

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE POINT READS OBEY THE SAME RULE
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('client.get / waqif.get disclose a name only to a seat that may read the record', async () => {
    // The positive half first, so this is not a suite that passes over a navigator denying everyone.
    const reader = await contextFor({ userId: seatFor('auditor'), requestId: 'nav-point-reader' });
    const readerCaller = createCaller(reader);
    await expect(
      readerCaller.navigation.client.get({ clientId: SUBJECT_CLIENT }),
    ).resolves.toMatchObject({ id: SUBJECT_CLIENT, waqifCount: 1, waqfCount: 1 });
    await expect(
      readerCaller.navigation.waqif.get({ waqifId: SUBJECT_WAQIF }),
    ).resolves.toMatchObject({ id: SUBJECT_WAQIF, clientId: SUBJECT_CLIENT });

    // And the negative half, across every non-reading role rather than one of them.
    for (const role of ROLE_KEYS.filter((candidate) => !RECORD_READERS.includes(candidate))) {
      const ctx = await contextFor({ userId: seatFor(role), requestId: `nav-point-${role}` });
      const caller = createCaller(ctx);
      await expect(
        caller.navigation.client.get({ clientId: SUBJECT_CLIENT }),
        `${role} may not read the endowment record, so the family's name is not navigation's to give`,
      ).resolves.toBeNull();
      await expect(
        caller.navigation.waqif.get({ waqifId: SUBJECT_WAQIF }),
        `${role} may not read the endowment record, so the endower's name is not navigation's to give`,
      ).resolves.toBeNull();
    }
  }, 300_000);

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE FIX IS THE SAME FUNCTION, NOT A SECOND PREDICATE
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('navigation asks resolveScope with the SAME constant endowment.get is mounted on', () => {
    // A source assertion, deliberately: the guarantee this whole file rests on is that navigation's
    // gate cannot drift from rung 2's, and that is a property of HOW the check is written, not of any
    // one outcome. If someone replaces the call with a hand-rolled `permissions.includes(...)`, every
    // assertion above still passes today and starts lying the first time the rung learns a new rule.
    const navigation = readSource('src/routers/navigation.ts');
    expect(navigation).toContain("import { resolveScope } from '../middleware/scope.js'");
    expect(navigation).toContain("import { ENDOWMENT_RECORD_READ } from './endowment.js'");
    expect(navigation).toContain('resolveScope(ctx, waqfId, ENDOWMENT_RECORD_READ)');
    // All three procedures go through the gate; a fourth read added without it would be a new hole.
    expect([...navigation.matchAll(/disclosableWaqfIds\(ctx\)/g)]).toHaveLength(3);

    const endowment = readSource('src/routers/endowment.ts');
    expect(endowment).toContain('endowmentScopedProcedure(ENDOWMENT_RECORD_READ)');
    // The constant is spelled ONCE in the package.
    expect(endowment).toContain(
      "export const ENDOWMENT_RECORD_READ = 'endowment:waqf:read' satisfies PermissionString",
    );
  });
});
