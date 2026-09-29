/**
 * AUTHORITY MUST PREDATE THE ACT IT AUTHORISES — the cycle route through grant admission, closed.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THIS FILE EXISTS, AND WHAT IT IS NOT
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Product-owner decision PO-1 asked for two things: seed one real `admin` seat, then DELETE the
 * `SYSTEM` disjunct from `qmulate_grant_admission()`, on the stated reasoning that the SYSTEM branch
 * was "the last surviving permitted route" and a seeded admin makes it unnecessary.
 *
 * The seat shipped. The deletion did not, because driving the attack first turned up a route that
 * had nothing to do with `SYSTEM` — and would therefore have survived the deletion in silence, under
 * a document saying the plane was closed.
 *
 * ── THE ROUTE: A CYCLE ───────────────────────────────────────────────────────────────────────
 * Migration 5 §2a §3 asks "does the marker's actor hold `admin:access_matrix:write` on this
 * endowment?" and asks it at COMMIT, because the trigger is `DEFERRABLE INITIALLY DEFERRED`. By then
 * every row the transaction wrote exists and is visible — so grants written in ONE transaction can
 * vouch for EACH OTHER. `user-accountant-001` (a plain FINANCE seat: no admin verb, no approve verb)
 * reached an ACTIVE `NAZIR` seat from `$executeRawUnsafe` on its own scoped Prisma client with
 * **every forged marker `actorType = 'USER'`** — no SYSTEM claim anywhere:
 *
 *     G1  userId = accountant  role SYSTEM_ADMIN  grantedBy = unscoped    marker actor = unscoped
 *     G2  userId = unscoped    role SYSTEM_ADMIN  grantedBy = accountant  marker actor = accountant
 *     G3  userId = accountant  role NAZIR         grantedBy = unscoped    marker actor = unscoped
 *
 * G1 ← G2, G2 ← G1, G3 ← G2. Every other guard is satisfied too: no row names its own subject as
 * issuer (`waqf_access_grant_no_self_issue`), each `grantedByUserId` equals its own marker's actor
 * (§2b), and `waqf_access_grant_permission_guard` positively permits `approve` because the role
 * genuinely is NAZIR. MEASURED, 2026-07-29, on a freshly migrated + seeded database:
 *
 *     *** PERMITTED *** grant-r4c-1 accountant SYSTEM_ADMIN | grant-r4c-2 unscoped SYSTEM_ADMIN
 *                       grant-r4c-3 accountant NAZIR
 *                       qmulate_has_active_grant(accountant, waqf-001, NAZIR) = true
 *
 * ── THE FIX, AND WHY IT IS TOTAL RATHER THAN A PATTERN BLOCKLIST ─────────────────────────────
 * Migration 7 adds one clause: the grant conferring the admin verb must be named by an `audit_event`
 * whose id is STRICTLY LESS than the id of the marker admitting the current write. Write f(G) for
 * that marker id and read "G ← H" as "H is the authority for G"; the clause is f(H) < f(G). A cycle
 * G1 ← G2 ← … ← Gn ← G1 would require f(G1) < f(G1). **A cycle of any length is arithmetically
 * impossible, and so is self-vouching.** So this is not a list of forbidden shapes that a fourth row
 * could sidestep — it is a well-founded ordering, and every admitted write's authority chain must
 * terminate at a grant that existed before the transaction opened.
 *
 * ── ⚠ WHAT THIS FILE DOES NOT CLAIM ──────────────────────────────────────────────────────────
 *   • **The authorization plane is NOT closed to raw SQL.** The `SYSTEM` disjunct is still there and
 *     is still the shortest route — one forged `actorType = 'SYSTEM'` marker admits any grant. Its
 *     nine enumerated cases live in `grant-admission-system-branch.integration.test.ts`, and case 9b
 *     there still PASSES as a demonstration that the forgery works. This file closes the route that
 *     would have OUTLIVED the deletion of that branch, which is a different and smaller claim.
 *   • **PO-1's seeded admin seat is a named impersonation target.** `user-admin-001` durably holds
 *     the verb on `waqf-001`, so a caller who can forge a marker naming it is admitted by the USER
 *     branch. That is a cost of the decision, and it is why the seat is scoped to ONE endowment.
 *   • **Every guard here is DDL-droppable and `DISABLE TRIGGER`-able by the table OWNER**, and on
 *     Railway the runtime connects AS THE OWNER. ADR-0008 defers privilege separation to E12 behind a
 *     HARD GATE: no real client data before it lands. Nothing in this file narrows that gate.
 *
 * ── TWO RULES THIS FILE OBEYS, INHERITED FROM ITS SIBLING ────────────────────────────────────
 * (a) **NOTHING FORGED MAY COMMIT.** Three integration files verify the whole `audit_event` chain
 *     against this same database, and `audit_event` is append-only — a committed forged event would
 *     redden all three permanently. Forged markers appear only in transactions that are REFUSED (the
 *     refusal rolls them back) or that this file rolls back itself.
 * (b) **THE DEFERRED TRIGGER HAS TO BE MADE TO FIRE.** A case run inside `BEGIN … ROLLBACK` without
 *     `SET CONSTRAINTS ALL IMMEDIATE` never consults admission at all, and every case reads as
 *     PERMITTED. Refused cases therefore run as one autocommitted statement; cases that must succeed
 *     inside a rollback force it explicitly.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  accessMatrixClient,
  assertGuardsInstalled,
  authzScaffoldingSql,
  privilegedPrisma,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  hasDatabase,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('migration 7 — grant-authority precedence (the cycle route)');

const WAQF = 'waqf-001';
/** An endowment with NO established admin holder at all — PO-1's seat is waqf-001 only. */
const WAQF_NO_ADMIN = 'waqf-002';

/** The attacker: a plain FINANCE seat. No admin verb, no approve verb. */
const FINANCE = 'user-accountant-001';
/**
 * The confederate. `user-unscoped` holds exactly ZERO grants (`seed.integration.test.ts` pins that),
 * which is what makes it usable here: every grant naming it in this file is rolled back, and a
 * pre-existing grant would have made `waqf_access_grant_userId_waqfId_role_key` (23505) refuse the
 * row before admission ever ran — a false negative the round-2 re-attack actually shipped.
 */
const CONFEDERATE = 'user-unscoped';
/** PO-1's seeded access-matrix administrator. Holds the verb on `WAQF` and nowhere else. */
const SEEDED_ADMIN = 'user-admin-001';

const PREFIX = 'grant-prec-9';
const PAST = `'2026-01-01T00:00:00.000Z'`;

const ADMIN_PERMS = ['admin:access_matrix:read', 'admin:access_matrix:write'];
const NAZIR_PERMS = ['approval:request:read', 'approval:request:approve'];

interface RawTx {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}
interface PrismaLike extends RawTx {
  $transaction: <T>(fn: (tx: RawTx) => Promise<T>) => Promise<T>;
}

/** A raw grant INSERT. `validFrom` is a fixed past UTC literal, never `now()` — see below. */
function grantSql(o: {
  readonly id: string;
  readonly userId: string;
  readonly grantedByUserId: string;
  readonly role: string;
  readonly perms: readonly string[];
  readonly waqfId?: string;
}): string {
  const waqfId = o.waqfId ?? WAQF;
  return `INSERT INTO "waqf_access_grant"
      ("id","userId","waqfId","role","permissions","dataScopes","canViewAmlRestricted",
       "amlCompartment","beneficiarySelfId","scopeRefs","grantedByUserId","validFrom","validUntil",
       "revokedAt","createdAt","updatedAt")
    VALUES ('${o.id}','${o.userId}','${waqfId}','${o.role}'::"Role",
            ARRAY[${o.perms.map((p) => `'${p}'`).join(',')}]::text[], ARRAY[]::text[],
            false, false, NULL, ARRAY[]::text[],
            '${o.grantedByUserId}', ${PAST}, NULL, NULL, now(), now())`;
}

/**
 * A FORGED admission marker, as a plpgsql statement assigning the new event id to `ev`.
 *
 * ⚠ `rowHash` IS DERIVED FROM `tag`, and every case uses a distinct tag: `audit_event` has a UNIQUE
 * index on `rowHash`, and a repeated literal trips it with 23505, masking the guard behind the wrong
 * error.
 *
 * ⚠ `occurredAt` is a fixed UTC literal, never `now()`. The column is `timestamp WITHOUT time zone`
 * and SQL `now()` writes LOCAL wall-clock into it while the application writes UTC — a forged row
 * then reads as correctly refused when it was merely future-dated and inactive.
 *
 * ⚠ MIGRATION 23 · THE HASH COLUMNS ARE NO LONGER THE CALLER'S TO INVENT, and this helper had to
 * change because of it. `audit_event_chain_bound` (BEFORE INSERT, ENABLE ALWAYS) recomputes
 * `prevHash` and `rowHash` SERVER-SIDE and refuses a mismatch, and it refuses any append made
 * without `pg_advisory_xact_lock(7233057419042001)` — so the old `repeat('0',64)` / `sha256(tag)`
 * pair is now rejected by name. The row is therefore built the way the guard demands: the lock is
 * taken, the id is allocated from the sequence FIRST (the id is one of the fourteen hashed fields),
 * and both hashes come from `qmulate_audit_expected_prev_hash()` / `qmulate_audit_row_hash()`.
 *
 * ⚠ THIS DOES NOT WEAKEN THE FIXTURE — IT MAKES IT FAITHFUL. The row's CONTENT is byte-identical to
 * before; only the two hash columns changed, from values no writer could have produced to the values
 * the real writer would have produced. That is exactly the attacker capability AV7-AUD-F1's residual
 * describes (the hashing algorithm is in the repository, so a forger can compute correct hashes),
 * and it is the shape the admission guard must be proven against. `rowHash` is now unique for free,
 * because the id is inside the hash — the 23505 collision hazard the note above records is gone.
 */
function markerSql(o: {
  readonly tag: string;
  readonly actorType: 'USER' | 'SYSTEM';
  readonly actorId: string;
  readonly grantId: string;
  readonly waqfId?: string;
}): string {
  return `PERFORM pg_advisory_xact_lock(7233057419042001);
    ev := nextval(pg_get_serial_sequence('public."audit_event"', 'id'));
    INSERT INTO "audit_event"
      ("id","occurredAt","occurredAtHijri","actorId","actorType","onBehalfOfId","action",
       "entityType","entityId","waqfId","before","after","context","category","classification",
       "prevHash","rowHash")
    VALUES (ev, '2026-07-29T00:00:00.000Z'::timestamp, '1448-02-14', '${o.actorId}',
            '${o.actorType}'::"AuditActorType", NULL, 'CREATE'::"AuditAction", 'WaqfAccessGrant',
            '${o.grantId}', '${o.waqfId ?? WAQF}', NULL, '{"forged":"${o.tag}"}'::jsonb,
            '{"probe":"${o.tag}","fixture":"e2 round-4 test row (بيانات وهمية)"}'::jsonb,
            'MUTATION'::"AuditCategory", 'ROUTINE'::"AuditClassification",
            qmulate_audit_expected_prev_hash(ev),
            qmulate_audit_row_hash(ev, '2026-07-29T00:00:00.000Z'::timestamp, '${o.actorId}', '${o.actorType}', NULL, 'CREATE', 'WaqfAccessGrant',
          '${o.grantId}', '${o.waqfId ?? WAQF}', NULL, '{"forged":"${o.tag}"}'::jsonb,
          '{"probe":"${o.tag}","fixture":"e2 round-4 test row (بيانات وهمية)"}'::jsonb, 'MUTATION', 'ROUTINE',
          qmulate_audit_expected_prev_hash(ev)))`;
}

/** Advances the chain head to the forged event — the marker function requires the head to cover it. */
const advanceHead = (): string =>
  `UPDATE "audit_chain_head"
      SET "lastId" = ev,
          "lastRowHash" = (SELECT "rowHash" FROM "audit_event" WHERE "id" = ev),
          "updatedAt" = now()
    WHERE "id" = 1`;

/** Wraps plpgsql statements as ONE autocommitted `DO` block, so the deferred trigger fires. */
function doBlock(statements: readonly string[]): string {
  return [
    'DO $prec$',
    'DECLARE ev bigint;',
    'BEGIN',
    ...statements.map((s) => `  ${s};`),
    'END',
    '$prec$;',
  ].join('\n');
}

/** The three rows of the cycle, parameterised by tag so each case has its own ids and hashes. */
const cycle = (tag: string) => ({
  /** The attacker becomes an access-matrix admin, issued by the confederate. */
  g1: [
    markerSql({
      tag: `${tag}-g1`,
      actorType: 'USER',
      actorId: CONFEDERATE,
      grantId: `${PREFIX}${tag}1`,
    }),
    advanceHead(),
    grantSql({
      id: `${PREFIX}${tag}1`,
      userId: FINANCE,
      grantedByUserId: CONFEDERATE,
      role: 'SYSTEM_ADMIN',
      perms: ADMIN_PERMS,
    }),
  ],
  /** The confederate becomes an access-matrix admin, issued by the attacker. */
  g2: [
    markerSql({
      tag: `${tag}-g2`,
      actorType: 'USER',
      actorId: FINANCE,
      grantId: `${PREFIX}${tag}2`,
    }),
    advanceHead(),
    grantSql({
      id: `${PREFIX}${tag}2`,
      userId: CONFEDERATE,
      grantedByUserId: FINANCE,
      role: 'SYSTEM_ADMIN',
      perms: ADMIN_PERMS,
    }),
  ],
  /** The prize: an ACTIVE NAZIR seat for the attacker, issued by the confederate. */
  g3: [
    markerSql({
      tag: `${tag}-g3`,
      actorType: 'USER',
      actorId: CONFEDERATE,
      grantId: `${PREFIX}${tag}3`,
    }),
    advanceHead(),
    grantSql({
      id: `${PREFIX}${tag}3`,
      userId: FINANCE,
      grantedByUserId: CONFEDERATE,
      role: 'NAZIR',
      perms: NAZIR_PERMS,
    }),
  ],
});

describe.skipIf(!hasDatabase)('migration 7 · authority must predate the act it authorises', () => {
  let prisma: PrismaLike;
  let db: Awaited<ReturnType<typeof databaseModule>>;

  const attempt = async (sql: string): Promise<string | null> => {
    try {
      await prisma.$executeRawUnsafe(sql);
      return null;
    } catch (error: unknown) {
      return errorText(error);
    }
  };

  const grantExists = async (id: string): Promise<boolean> => {
    const rows = await prisma.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM "waqf_access_grant" WHERE "id" = '${id}'`,
    );
    return rows[0]?.n !== '0';
  };

  const hasActiveNazir = async (userId: string, waqfId = WAQF): Promise<boolean> => {
    const rows = await prisma.$queryRawUnsafe<{ active: boolean }[]>(
      `SELECT qmulate_has_active_grant('${userId}','${waqfId}','NAZIR') AS active`,
    );
    return rows[0]?.active === true;
  };

  const cleanup = async (): Promise<void> => {
    await prisma.$executeRawUnsafe(
      authzScaffoldingSql([`DELETE FROM "waqf_access_grant" WHERE "id" LIKE '${PREFIX}%'`]),
    );
  };

  /**
   * Installs a one-substitution mutant of a live function inside `body`'s transaction.
   *
   * THROWS when `find` is absent from the real definition, so a mutation that stopped applying —
   * because the migration was reworded — is a hard failure rather than a quiet pass. Round 1 of this
   * sprint shipped a source-shape assertion that passed at full strength while the guard it described
   * was fully bypassable; nothing here asserts on source text.
   */
  const mutateFunction = async (
    tx: RawTx,
    signature: string,
    find: string,
    replace: string,
  ): Promise<void> => {
    const [row] = await tx.$queryRawUnsafe<{ def: string }[]>(
      `SELECT pg_get_functiondef('${signature}'::regprocedure) AS def`,
    );
    const def = row?.def ?? '';
    if (!def.includes(find)) {
      throw new Error(
        `MUTATION COULD NOT BE APPLIED: ${signature} no longer contains ${JSON.stringify(find)}. ` +
          `The mutation is therefore not testing anything — fix the target, do not delete the test.`,
      );
    }
    await tx.$executeRawUnsafe(def.replace(find, replace));
  };

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    db = await databaseModule();
    prisma =
      // ⚠ THE PRIVILEGED (OWNER) CONNECTION, NOT THE APP ONE  (ADR-0008 round 6). This handle issues RAW
      // GUARD STATEMENTS. Since privilege separation the app role holds no DELETE on any endowment table,
      // no UPDATE on `audit_event`, no TRUNCATE anywhere and no write at all on `waqf_access_grant` — so
      // on the app connection every probe below would be refused by the **ACL** before reaching the guard
      // it is testing (`42501 permission denied for table asset`, not the retention trigger's message).
      // The suite would stay green while measuring nothing. Running as the OWNER restores exactly the
      // environment these assertions were written for and makes each claim STRONGER: "even the table
      // owner is refused". Every PRIVILEGE claim lives in `authorization-plane-privilege.integration.test.ts`
      // on the restricted connection instead; do not merge the two.
      (await privilegedPrisma()) as unknown as PrismaLike;
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 0. THE MIGRATION IS ACTUALLY INSTALLED
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('installs the established-authority function and wires admission to it', async () => {
    // Not decoration: every refusal below would also be produced by a database on which migration 7
    // never ran (the old function refuses these cases for OTHER reasons in some orderings), so the
    // suite has to know which guard it is measuring.
    const [fn] = await prisma.$queryRawUnsafe<{ n: string }[]>(
      `SELECT count(*)::text AS n FROM pg_proc
        WHERE proname = 'qmulate_actor_holds_established_permission'`,
    );
    expect(fn?.n, 'migration 7 is not applied — run `prisma migrate deploy`').toBe('1');

    const [def] = await prisma.$queryRawUnsafe<{ def: string }[]>(
      `SELECT pg_get_functiondef('qmulate_grant_admission()'::regprocedure) AS def`,
    );
    expect(def?.def).toContain('qmulate_actor_holds_established_permission');
    // ⚠ THIS ASSERTION INVERTED IN S2 ROUND 5, AND ITS PREVIOUS FORM IS WHY IT IS WORTH KEEPING. It
    // read `expect(def?.def).toContain("marker_type = 'SYSTEM'")` — "the SYSTEM disjunct is STILL
    // THERE, deliberately … asserted here so its removal is a visible change to a red test rather than
    // a silent one — in either direction." Migration `00000000000009_e2_close_system_marker` removed it
    // (product-owner decision PO-1), this test went red exactly as designed, and the assertion now
    // pins the ABSENCE: a caller who writes the marker row chooses `actorType`, so a guard that reads
    // it is a guard the caller sets. `grant-admission-system-branch.integration.test.ts` §9 drives the
    // refusal and its MUTATION puts the disjunct back to prove the removal is what refuses.
    expect(
      def?.def,
      'the SYSTEM disjunct is back in the live body of qmulate_grant_admission(): a forged marker ' +
        'claiming actorType = SYSTEM, with an actorId that need not even be a User row, admits any ' +
        'grant on any endowment. Re-apply migration 00000000000009_e2_close_system_marker.',
    ).not.toContain("marker_type = 'SYSTEM'");
    // Bootstrap did not simply move into the guard under another name: there is no `OR` left in the
    // authority decision at all.
    expect(def?.def).toContain(
      'authorised := qmulate_actor_holds_established_permission(marker_actor, NEW."waqfId",',
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 1. THE ATTACK, REFUSED
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the cycle route', () => {
    it('REFUSES three mutually-vouching grants — the reproduction, with no SYSTEM claim', async () => {
      const c = cycle('a');
      // Preconditions, MEASURED. Without these the refusal below could be about a duplicate key or
      // an already-held seat rather than about authority.
      expect(await hasActiveNazir(FINANCE), 'the attacker already holds NAZIR here').toBe(false);
      expect(
        await prisma
          .$queryRawUnsafe<{ n: string }[]>(
            `SELECT count(*)::text AS n FROM "waqf_access_grant" WHERE "userId" = '${CONFEDERATE}'`,
          )
          .then((rows) => rows[0]?.n),
        'the confederate holds a grant, so a forged row may die on the unique index instead',
      ).toBe('0');

      const error = await attempt(doBlock([...c.g1, ...c.g2, ...c.g3]));

      expect(
        error,
        'a FINANCE seat minted itself an ACTIVE NAZIR seat out of three grants that vouch for each ' +
          'other, with every marker actorType = USER. The SYSTEM branch is not involved, so ' +
          'deleting it would not have closed this.',
      ).not.toBeNull();
      expect(error).toContain('42501');
      expect(error).toMatch(/holds no ACTIVE grant carrying "admin:access_matrix:write"/);
      // The precedence clause is what refused it, named in the message so the trail says WHY.
      expect(error).toMatch(/already recorded in the audit trail before event/);

      for (const suffix of ['a1', 'a2', 'a3']) {
        expect(await grantExists(`${PREFIX}${suffix}`)).toBe(false);
      }
      expect(await hasActiveNazir(FINANCE)).toBe(false);
    });

    it('REFUSES the minimal 2-cycle — two admin seats out of nothing', async () => {
      // The NAZIR seat is only the prize; the cycle itself is the vulnerability, and it is two rows
      // long. A guard that caught the three-row shape and not this one would be a pattern blocklist.
      const c = cycle('b');
      const error = await attempt(doBlock([...c.g1, ...c.g2]));
      expect(error, 'two mutually-issued admin seats appeared from nothing').not.toBeNull();
      expect(error).toMatch(/holds no ACTIVE grant carrying "admin:access_matrix:write"/);
      expect(await grantExists(`${PREFIX}b1`)).toBe(false);
      expect(await grantExists(`${PREFIX}b2`)).toBe(false);
    });

    it('REFUSES a seat that vouches for ITSELF', async () => {
      // f(G) < f(G) is false, so self-vouching falls out of the same ordering rather than needing its
      // own clause. `no_self_issue` does NOT cover this: the row names the confederate as issuer, and
      // the confederate's only claim to authority is this very row.
      const id = `${PREFIX}c1`;
      const error = await attempt(
        doBlock([
          markerSql({ tag: 'c-self', actorType: 'USER', actorId: CONFEDERATE, grantId: id }),
          advanceHead(),
          grantSql({
            id,
            userId: CONFEDERATE,
            grantedByUserId: CONFEDERATE,
            role: 'SYSTEM_ADMIN',
            perms: ADMIN_PERMS,
          }),
        ]),
      );
      expect(error).not.toBeNull();
      // `no_self_issue` fires first here (23514) because issuer and subject coincide; the case is
      // kept because it is the one a reader assumes precedence is for, and the NEXT case is the
      // version that gets past that CHECK.
      expect(error).toMatch(/no_self_issue|holds no ACTIVE grant/);
      expect(await grantExists(id)).toBe(false);
    });

    it('REFUSES a two-row self-bootstrap that gets PAST no_self_issue', async () => {
      // The confederate issues the attacker an admin seat and the attacker issues the confederate
      // one — neither row is self-issued, so `waqf_access_grant_no_self_issue` has no opinion, and
      // before migration 7 both committed. This is `2-cycle` again stated as what it defeats.
      const c = cycle('d');
      const error = await attempt(doBlock([...c.g2, ...c.g1]));
      expect(error).not.toBeNull();
      expect(error).not.toMatch(/no_self_issue/);
      expect(error).toMatch(/holds no ACTIVE grant carrying "admin:access_matrix:write"/);
      expect(await grantExists(`${PREFIX}d1`)).toBe(false);
      expect(await grantExists(`${PREFIX}d2`)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 2. NEGATIVE CONTROLS — the trigger really fires, and the cycle really was the mechanism
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('negative controls', () => {
    it.each([
      ['G3 alone — no authority anywhere', ['g3'] as const],
      ['G1 + G3 — one leg of the cycle missing', ['g1', 'g3'] as const],
      ['G2 + G3 — the other leg missing', ['g2', 'g3'] as const],
    ])('%s is REFUSED for the SAME reason', async (_label, legs) => {
      // These were refused BEFORE migration 7 too, and that is exactly why they are here: they prove
      // the deferred trigger fires inside these transactions at all. Without them, "the cycle is now
      // refused" would be indistinguishable from "the probe stopped reaching the guard".
      const c = cycle(`n${legs.length}${legs[0]}`);
      const statements = legs.flatMap((leg) => c[leg]);
      const error = await attempt(doBlock(statements));
      expect(error).not.toBeNull();
      expect(error).toContain('42501');
      expect(error).toMatch(/holds no ACTIVE grant carrying "admin:access_matrix:write"/);
    });

    it('PERMITS the identical statement shape when the authority is ESTABLISHED', async () => {
      // The positive control that makes every refusal above mean something. Same raw INSERT, same
      // forged-marker mechanics, one difference: the marker names PO-1's SEEDED admin, whose seat was
      // recorded in the trail by the seed — a previous transaction. A guard that refuses everything is
      // an outage, not a guard.
      //
      // ⚠ ROLLED BACK. The marker is forged, and rule (a) forbids committing a forged event.
      const ROLLBACK = '__qmulate_prec_positive__';
      const id = `${PREFIX}p1`;
      const observed: Record<string, unknown> = {};
      let unexpected: unknown;

      const [pre] = await prisma.$queryRawUnsafe<{ established: boolean }[]>(
        `SELECT qmulate_actor_holds_permission('${SEEDED_ADMIN}','${WAQF}','admin:access_matrix:write')
                  AS established`,
      );
      expect(
        pre?.established,
        'PO-1’s seeded admin seat is gone — this control proves nothing without it',
      ).toBe(true);

      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            doBlock([
              markerSql({ tag: 'p-ok', actorType: 'USER', actorId: SEEDED_ADMIN, grantId: id }),
              advanceHead(),
              grantSql({
                id,
                userId: CONFEDERATE,
                grantedByUserId: SEEDED_ADMIN,
                role: 'AUDITOR',
                perms: ['endowment:waqf:read'],
              }),
            ]),
          );
          // Rule (b): make the DEFERRED trigger fire NOW, or this proves nothing.
          await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
          const rows = await tx.$queryRawUnsafe<{ role: string }[]>(
            `SELECT "role"::text AS role FROM "waqf_access_grant" WHERE "id" = '${id}'`,
          );
          observed.role = rows[0]?.role;
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!errorText(error).includes(ROLLBACK)) unexpected = error;
      }

      expect(
        unexpected === undefined ? null : errorText(unexpected),
        'an ESTABLISHED admin was refused — migration 7 has broken the legitimate path, which is ' +
          'an outage rather than a control',
      ).toBeNull();
      expect(observed.role).toBe('AUDITOR');
      expect(await grantExists(id)).toBe(false);
    });

    it('REFUSES the same established admin on an endowment where it holds nothing', async () => {
      // Authority is PER ENDOWMENT (§10 principle 2). `waqf-002` has no established admin holder at
      // all, which is the reason PO-1's seat is scoped to one endowment.
      const id = `${PREFIX}p2`;
      const error = await attempt(
        doBlock([
          markerSql({
            tag: 'p-waqf2',
            actorType: 'USER',
            actorId: SEEDED_ADMIN,
            grantId: id,
            waqfId: WAQF_NO_ADMIN,
          }),
          advanceHead(),
          grantSql({
            id,
            userId: CONFEDERATE,
            grantedByUserId: SEEDED_ADMIN,
            role: 'AUDITOR',
            perms: ['endowment:waqf:read'],
            waqfId: WAQF_NO_ADMIN,
          }),
        ]),
      );
      expect(error).not.toBeNull();
      expect(error).toMatch(/on waqf "waqf-002"/);
      expect(await grantExists(id)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 3. THE TWO AUTHORITY FUNCTIONS DIFFER IN EXACTLY ONE PLACE
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('the old and new authority predicates agree except on PRECEDENCE', async () => {
    // The sharpest statement of what migration 7 changed, executed against both functions on the
    // SAME in-transaction row. `qmulate_actor_holds_permission` is deliberately left in place for its
    // other callers, so the difference has to be pinned or the two will drift into one.
    //
    // ⚠ THIS PROBE DELIBERATELY DOES NOT FIRE THE TRIGGER. It is measuring the two FUNCTIONS, not
    // admission, so it must not `SET CONSTRAINTS ALL IMMEDIATE` — the whole point is to ask both
    // predicates about a grant that exists only inside this (rolled-back) transaction.
    const ROLLBACK = '__qmulate_prec_fns__';
    const id = `${PREFIX}f1`;
    const observed: Record<string, unknown> = {};
    let unexpected: unknown;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(
          doBlock([
            markerSql({ tag: 'f-fn', actorType: 'USER', actorId: CONFEDERATE, grantId: id }),
            advanceHead(),
            grantSql({
              id,
              userId: FINANCE,
              grantedByUserId: CONFEDERATE,
              role: 'SYSTEM_ADMIN',
              perms: ADMIN_PERMS,
            }),
          ]),
        );
        // Measured, not assumed: the grant really is there inside this transaction. Otherwise the
        // two predicates below would be agreeing on an absent row rather than disagreeing on a
        // present one.
        const [present] = await tx.$queryRawUnsafe<{ n: string }[]>(
          `SELECT count(*)::text AS n FROM "waqf_access_grant" WHERE "id" = '${id}'`,
        );
        observed.rowPresentInTransaction = present?.n;
        const [answer] = await tx.$queryRawUnsafe<
          { now_holds: boolean; established: boolean; marker: string }[]
        >(
          `SELECT qmulate_actor_holds_permission('${FINANCE}','${WAQF}','admin:access_matrix:write')
                    AS now_holds,
                  qmulate_actor_holds_established_permission('${FINANCE}','${WAQF}',
                    'admin:access_matrix:write',
                    (SELECT max("id") FROM "audit_event")) AS established,
                  (SELECT max("id")::text FROM "audit_event") AS marker`,
        );
        observed.nowHolds = answer?.now_holds;
        observed.established = answer?.established;
        observed.marker = answer?.marker;
        throw new Error(ROLLBACK);
      });
    } catch (error: unknown) {
      if (!errorText(error).includes(ROLLBACK)) unexpected = error;
    }

    expect(unexpected === undefined ? null : errorText(unexpected)).toBeNull();
    expect(observed.rowPresentInTransaction, 'the in-transaction grant was never written').toBe(
      '1',
    );
    // The OLD predicate says yes — the grant is there and it is active. That answer is correct for
    // its question, and it is the answer the cycle exploited.
    expect(
      observed.nowHolds,
      'qmulate_actor_holds_permission no longer sees an in-transaction grant, so it is not the ' +
        'function the cycle exploited and this comparison is measuring the wrong pair',
    ).toBe(true);
    // The NEW predicate says no, because the grant is not yet older than the act it would authorise.
    expect(observed.established).toBe(false);
    expect(await grantExists(id)).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 4. THE MUTATION, EXECUTED AGAINST THE REAL SHIPPED BODY
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it('MUTATION · deleting the precedence clause re-opens the cycle', async () => {
    // The proof that the clause in migration 7 — and not something incidental — is what closes the
    // attack. `pg_get_functiondef()` reads the LIVE definition, one substring is replaced, the mutant
    // is installed inside a transaction that is rolled back, and the whole cycle is re-driven against
    // it. If the attack does NOT succeed under the mutant, this test file is pinning the wrong line.
    const ROLLBACK = '__qmulate_prec_mutant__';
    const c = cycle('m');
    let outcome: string | null = 'not attempted';
    const observed: Record<string, unknown> = {};
    let failed: unknown;

    try {
      await prisma.$transaction(async (tx) => {
        await mutateFunction(
          tx,
          'qmulate_actor_holds_established_permission(text,text,text,bigint)',
          'ae."id" < p_before_event_id',
          'true',
        );
        try {
          await tx.$executeRawUnsafe(doBlock([...c.g1, ...c.g2, ...c.g3]));
          await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
          outcome = null; // PERMITTED
          observed.seats = await tx.$queryRawUnsafe<{ id: string; role: string }[]>(
            `SELECT "id","userId","role"::text AS role FROM "waqf_access_grant"
              WHERE "id" LIKE '${PREFIX}m%' ORDER BY "id"`,
          );
          const active = await tx.$queryRawUnsafe<{ nazir: boolean }[]>(
            `SELECT qmulate_has_active_grant('${FINANCE}','${WAQF}','NAZIR') AS nazir`,
          );
          observed.attackerIsActiveNazir = active[0]?.nazir;
        } catch (error: unknown) {
          outcome = errorText(error);
          // A failed statement poisons the transaction, so nothing further may run inside it.
          throw new Error(ROLLBACK);
        }
        throw new Error(ROLLBACK);
      });
    } catch (error: unknown) {
      if (!errorText(error).includes(ROLLBACK)) failed = error;
    }

    expect(failed, 'the mutation could not be driven').toBeUndefined();
    expect(
      outcome,
      'the cycle was STILL refused with the precedence clause removed — then that clause is not ' +
        'what closes it, and this file is pinning the wrong line',
    ).toBeNull();
    expect(observed.attackerIsActiveNazir).toBe(true);
    expect(observed.seats).toHaveLength(3);

    // …and the real function is back, because the mutant lived inside the rolled-back transaction.
    const [row] = await prisma.$queryRawUnsafe<{ def: string }[]>(
      `SELECT pg_get_functiondef('qmulate_actor_holds_established_permission(text,text,text,bigint)'::regprocedure)
                AS def`,
    );
    expect(row?.def, 'the mutant was left installed').toContain('ae."id" < p_before_event_id');
    expect(await grantExists(`${PREFIX}m3`)).toBe(false);
    expect(await hasActiveNazir(FINANCE)).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 5. PO-1's OTHER HALF — the seeded admin can actually issue, through the SHIPPED path
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('PO-1 · bootstrap is not bricked', () => {
    const ISSUED = `${PREFIX}i1`;

    afterAll(async () => {
      await prisma.$executeRawUnsafe(
        authzScaffoldingSql([`DELETE FROM "waqf_access_grant" WHERE "id" = '${ISSUED}'`]),
      );
    });

    it('the SEEDED admin issues a real grant through withAudit(), and it is audited', async () => {
      // Not a forged marker anywhere: this is `createPrismaClient(ctx)` + `withAudit()` — the shipped
      // audited write path, on the USER branch, driven by the identity the fixture actually seats.
      // Before PO-1 this could not be written at all, because no seeded grant carried the admin verb.
      //
      // ⚠ MEASURED AS A DELTA, not as a total. `audit_event` is APPEND-ONLY, so events naming this
      // grant id survive the `afterAll` cleanup and accumulate across runs — the total was 3 on the
      // third local run. A total would therefore pass once and then fail forever, for a reason that
      // has nothing to do with the property under test.
      const eventsNaming = async (): Promise<number> => {
        const [row] = await prisma.$queryRawUnsafe<{ n: string }[]>(
          `SELECT count(*)::text AS n FROM "audit_event"
            WHERE "entityType" = 'WaqfAccessGrant' AND "entityId" = '${ISSUED}'`,
        );
        return Number(row?.n ?? '0');
      };
      const before = await eventsNaming();

      await db.withAudit(
        // ⚠ THE PROVISIONING CONNECTION (ADR-0008 round 6), NOT `createPrismaClient()`.
        // Since privilege separation the app role holds NO INSERT/UPDATE on `waqf_access_grant`, so a
        // grant write through the ordinary client is refused by the ACL — `42501 permission denied for
        // table waqf_access_grant` — before any guard is consulted, and every assertion below about WHY
        // a write is admitted or refused would be measuring the ACL instead. `accessMatrixClient()` is
        // the connection the shipped `provisionAccessGrant()` uses, and its guards are FULLY live: it
        // owns nothing, so it cannot suspend the admission trigger.
        accessMatrixClient({
          actorId: SEEDED_ADMIN,
          actorType: 'USER',
          authorizedWaqfIds: [WAQF],
          permissions: ADMIN_PERMS,
          requestId: 'po1-seeded-admin-issues',
        } as never),
        async (tx) => {
          await tx.waqfAccessGrant.create({
            data: {
              id: ISSUED,
              userId: CONFEDERATE,
              waqfId: WAQF,
              role: 'AUDITOR' as never,
              permissions: ['endowment:waqf:read'],
              dataScopes: [],
              scopeRefs: [],
              grantedByUserId: SEEDED_ADMIN,
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
            },
          });
        },
      );

      expect(await grantExists(ISSUED), 'the seeded admin cannot issue anything').toBe(true);
      // AUDITED — the half that makes it an access-matrix CHANGE rather than a mutation. §12 wants an
      // event naming the GRANT, not merely its parent row.
      expect(await eventsNaming()).toBe(before + 1);
      // And the newest one is attributed to the admin, not to a system job — attribution is the
      // whole point of §2b's issuer binding.
      const [newest] = await prisma.$queryRawUnsafe<
        { actorId: string | null; actorType: string }[]
      >(
        `SELECT "actorId", "actorType"::text AS "actorType" FROM "audit_event"
          WHERE "entityType" = 'WaqfAccessGrant' AND "entityId" = '${ISSUED}'
          ORDER BY "id" DESC LIMIT 1`,
      );
      expect(newest?.actorId).toBe(SEEDED_ADMIN);
      expect(newest?.actorType).toBe('USER');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // WHAT IS STILL OPEN
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it.todo(
    'REPORTED, NOT CLOSED — PO-1 asked for the SYSTEM disjunct to be DELETED and it was not, for two ' +
      'measured reasons. (1) Deleting it closes nothing: this file’s first test is the same outcome ' +
      'reached with USER markers only, so the deletion would have shipped a document saying the plane ' +
      "was closed while it was not. (2) It bricks the fixture seed. With `marker_type = 'SYSTEM'` " +
      'replaced by `false` on a freshly migrated database, `pnpm db:seed` fails at COMMIT naming PO-1’s ' +
      "OWN seat: \"grant-user-admin-001-waqf-001: actor 'user-seed-admin' holds no ACTIVE grant " +
      'carrying admin:access_matrix:write". The seed writes all 21 grants as one SYSTEM actor; §2b ' +
      'binds the issuer to that actor; and `no_self_issue` forbids it from issuing itself a seat — so ' +
      'the one row that would satisfy the USER branch is unrepresentable, and the same argument ' +
      'reddens `packages/api/test/setup.ts`. The removal needs a provisioning path that does not ' +
      'derive its authority from the matrix it provisions: ADR-0008’s E12 item, option (c) in the ' +
      'sibling file’s todo (a SECURITY DEFINER procedure owned by the migrator).',
  );

  it.todo(
    'SURFACED — `approval_request_authority` (migration 3) resolves a checker with ' +
      "`qmulate_has_active_grant(checkerId, waqfId, 'NAZIR')` and gets NO precedence clause. The " +
      'same-transaction question can be asked of it, and the answer is deliberately deferred: the ' +
      'fixture seed writes its ApprovalRequest (step 20) in the SAME transaction as the grants it ' +
      'depends on (step 18), so a precedence clause there bricks the seed for a second, unrelated ' +
      'reason. It is also unnecessary while admission holds — a forged NAZIR seat can no longer be ' +
      'minted by a cycle. Revisit with E12’s provisioning path, when the seed no longer needs to ' +
      'write authority and the artifact that depends on it in one breath.',
  );
});
