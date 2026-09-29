/**
 * THE `SYSTEM` MARKER ROUTE THROUGH GRANT ADMISSION — **CLOSED IN S2 ROUND 5**, enumerated both ways.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE IS NOW, AND WHAT IT USED TO BE
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `qmulate_grant_admission()` used to admit a write to the authorization plane on ONE of two grounds:
 *
 *     authorised := marker_type = 'SYSTEM'
 *                OR qmulate_actor_holds_established_permission(marker_actor, NEW."waqfId",
 *                                                              'admin:access_matrix:write', marker_event);
 *
 * **The first disjunct is GONE** (migration `00000000000009_e2_close_system_marker`, product-owner
 * decision PO-1). It was never a control: a caller who can run arbitrary SQL as the application role
 * WRITES THE MARKER ROW, so `actorType` was a field the attacker chose. Driven end to end, twice,
 * before the removal — `user-accountant-001`, a plain FINANCE seat with no admin verb and no approve
 * verb, from `$executeRawUnsafe` on ITS OWN scoped Prisma client:
 *
 *   ROUTE 1 · one forged `audit_event` with `actorType = 'SYSTEM'` and `actorId = 'not-a-real-user'`
 *             (not even a `User` row), the chain head advanced to it, then the grant row
 *             →  PERMITTED · `qmulate_has_active_grant(FINANCE, waqf-001, NAZIR) = true`
 *             →  `appRouter.approval.approve` returned `{status:'APPROVED'}` on another maker's
 *                SAR 4,500,000 `BANK_MOVEMENT`.
 *   AFTER  ·  the identical three statements → REFUSED, 42501, no row, and the approval stays PENDING
 *             with `approval.approve` denying on `approval:request:approve`.
 *
 * So this file's cases 1-8 are unchanged, and **case 9 INVERTS**: the SYSTEM marker that used to be
 * "the one marker that DOES admit a write" is now refused in every form, including the genuine audited
 * one. Case 10a is untouched and is now the ONLY permitted marker — which is exactly the residual
 * below.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠⚠ ROUTE 2 WAS CLOSED IN ADR-0008 ROUND 6, AND §11 OF THIS FILE HAS BEEN DELETED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The surviving marker after migration 9 was `actorType = 'USER'` naming an actor that genuinely holds
 * `admin:access_matrix:write` on this endowment — on a seeded database, PO-1's `user-admin-001` on
 * `waqf-001`. The attacker could forge that marker exactly as easily as the SYSTEM one, because the
 * forgery is a row and the attacker writes the row; the trigger can read what the row says and can
 * never observe who authored it, **while attacker and application share one database role.**
 *
 * That last clause was the whole scope of the impossibility, and round 6 ended the sharing.
 * `DATABASE_URL` now connects as `qmulate_app`, which holds NO INSERT on `waqf_access_grant` and owns
 * no table, so the forged chain dies on its last statement with
 * `42501 permission denied for table waqf_access_grant` — before the trigger, and independently of
 * what any row says. §11 was DELETED rather than inverted (as its own header and ADR-0008's round-5
 * addendum instructed); the positive proof now lives, once, in
 * `test/authorization-plane-privilege.integration.test.ts`.
 *
 * ⚠ WHAT REMAINS, AND IT IS PINNED AS A PASSING ATTACK, NOT DESCRIBED: whoever holds
 * `ACCESS_MATRIX_DATABASE_URL` can forge the same chain — §6c of that file drives it and asserts it
 * succeeds. The closure is against a caller holding only the application database credential.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HOW BOOTSTRAP SURVIVES THE REMOVAL — the two findings that blocked it in round 4, and the answer
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Round 4 measured two reasons the deletion could not just be done, and both were real:
 *
 *   1. IT WOULD HAVE CLOSED NOTHING. The authority disjunct was independently satisfiable by a CYCLE:
 *      three grants written in one transaction, each vouched for by another, every marker
 *      `actorType = 'USER'`. **Migration 7 closed that** (authority must PREDATE the act it
 *      authorises, so a cycle of any length is arithmetically impossible) — see case 10b and
 *      `grant-authority-precedence.integration.test.ts`. Migration 9 is only meaningful BECAUSE 7
 *      shipped first; on its own it would have produced a document claiming a closed plane.
 *   2. IT BRICKS `pnpm db:seed`. The seed writes all 21 grants as ONE actor, §2b binds
 *      `grantedByUserId` to that actor, and `waqf_access_grant_no_self_issue` forbids that actor from
 *      holding a seat issued to itself — so the one row that would satisfy the USER branch is
 *      unrepresentable. **This is IRREDUCIBLE: authority cannot authorise its own first instance.**
 *
 * The answer to (2) is not a branch — a branch a forged row can satisfy is what was just deleted — but
 * a PRIVILEGE. `withAccessMatrixBootstrap()` (`src/access-matrix-bootstrap.ts`) suspends the admission
 * trigger, which requires table OWNERSHIP; the fixture seed, `packages/api/test/setup.ts` and this
 * suite's `provisionGrants()` all use it, and the writes inside stay AUDITED, so a bootstrapped seat
 * lands in the hash chain and becomes "established" authority afterwards. `pnpm db:seed` works on a
 * fresh database (verified: 133 audited writes), and `user-admin-001` can still issue on `waqf-001`
 * through `activateGrant()` while being refused on `waqf-002`.
 *
 * That privilege is ADR-0008's DDL residual, which is OPEN until E12 and is NOT narrowed here. What it
 * buys is that the FLOOR RISES: route 1 needed only `INSERT` on two tables — grants the runtime must
 * hold forever — while bootstrap needs ownership, which is exactly what E12 takes away.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * TWO RULES THIS FILE OBEYS, BOTH LEARNED THE HARD WAY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * (a) **NOTHING FORGED MAY COMMIT.** Three integration files verify the WHOLE `audit_event` chain
 *     against this same database (`audit-immutability` A6, `g1-replica-role-bypass`,
 *     `scope-denial-audit`). A committed forged event would redden all three permanently, for every
 *     later run, because `audit_event` is append-only and cannot be cleaned up. So forged markers
 *     appear only in transactions that are REFUSED (the refusal rolls them back) or that this file
 *     rolls back itself — including §11's route-2 attack, which succeeds and is then rolled back.
 * (b) **THE DEFERRED TRIGGER HAS TO BE MADE TO FIRE.** `waqf_access_grant_admission` is
 *     `DEFERRABLE INITIALLY DEFERRED`. A case run inside `BEGIN … ROLLBACK` without
 *     `SET CONSTRAINTS ALL IMMEDIATE` never fires it AT ALL, and every case would read as PERMITTED
 *     — a probe failing for its own reasons, indistinguishable from a working control. Refused cases
 *     therefore run as a single autocommitted statement (the implicit transaction commits, the
 *     trigger fires, the refusal rolls everything back); the permitted cases force it explicitly.
 * (c) **ISOLATE, AND CLEAR FORGED ROWS BETWEEN CASES.** Round 4's first pass produced a false NEGATIVE
 *     here: a surviving row from an earlier case made the SYSTEM route report
 *     `23505 Key ("userId","waqfId",role) already exists` instead of PERMITTED, which reads exactly
 *     like a refusal. `cleanup()` runs between the cases that can collide.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE MUTATIONS ARE EXECUTED, AND THEY MUTATE THE REAL SHIPPED BODY
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `mutateFunction()` reads the live definition with `pg_get_functiondef()`, applies one textual
 * substitution, and installs it inside a transaction that is rolled back. It THROWS if the target
 * substring is absent, so a mutation that silently stopped applying — because the migration was
 * reworded — fails loudly instead of passing. The headline mutation now runs the OTHER way: it puts the
 * `marker_type = 'SYSTEM'` disjunct BACK into the live body and re-drives route 1, which must become
 * PERMITTED again. A removal nobody can re-open on demand is a removal nobody has measured.
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

warnNoDatabase('N-2 — the SYSTEM/bootstrap branch of grant admission control');

const WAQF = 'waqf-001';

/** The attacker: a plain FINANCE seat. No admin verb, no approve verb. */
const FINANCE = 'user-accountant-001';
/** A seeded NAZIR on all four endowments — holds NO admin verb, which is the point of case 4. */
const NAZIR = 'user-nazir-001';
/**
 * The accomplice grantee for case 3.
 *
 * `user-unscoped`, NOT `user-approver-001`. Measured: `user-approver-001` already holds
 * `NAZIR@waqf-001`, so a forged NAZIR grant to it died on `waqf_access_grant_userId_waqfId_role_key`
 * with 23505 — the guard under test never ran and the case read as a refusal. That is one of the
 * three false negatives the round-2 re-attack shipped, and it is the reason this constant carries a
 * comment. `user-unscoped` holds exactly zero grants (`seed.integration.test.ts` pins that), and no
 * grant naming it ever commits in this file.
 */
const ACCOMPLICE = 'user-unscoped';
/** A SERVICE principal id for case 5. Needs no `User` row: only `userId` carries the FK. */
const SERVICE_ACTOR = 'svc-deadline-worker';
/**
 * The SYSTEM actor every bootstrap write here is attributed to.
 *
 * ⚠ NOT `user-seed-admin`: `seed.integration.test.ts` asserts the count of events with that actorId
 * is a WHOLE MULTIPLE of one seed run, so one extra event attributed to it turns E1-4 red.
 */
const PROVISIONER = 'user-test-sysbranch-provisioner';

/**
 * PO-1's seeded access-matrix administrator: the ONE fixture grant that carries
 * `admin:access_matrix:write`, and on `waqf-001` ONLY (`src/seed/map.ts`).
 *
 * Since migration 9 deleted the `actorType = 'SYSTEM'` disjunct this is the only identity a marker can
 * name and be admitted — which makes it both the legitimate issuer this file's `beforeAll` uses and the
 * impersonation target §11 pins as a live residual. Those are the same fact seen from two sides.
 */
const SEEDED_ADMIN = 'user-admin-001';

const GRANT_PREFIX = 'grant-sysb-9';
/** The one grant this file COMMITS: case 9a's positive control, and case 8's prior-transaction row. */
const COMMITTED_GRANT = `${GRANT_PREFIX}900`;

const PAST = `'2026-01-01T00:00:00.000Z'`;

interface RawTx {
  $queryRawUnsafe: <T>(sql: string, ...values: unknown[]) => Promise<T>;
  $executeRawUnsafe: (sql: string, ...values: unknown[]) => Promise<number>;
}
interface PrismaLike extends RawTx {
  $transaction: <T>(fn: (tx: RawTx) => Promise<T>) => Promise<T>;
}

/** A raw grant INSERT. `validFrom` is a fixed past literal, never `now()` — see below. */
function grantSql(options: {
  readonly id: string;
  readonly userId: string;
  readonly grantedByUserId: string;
  readonly role?: string;
  readonly waqfId?: string;
}): string {
  const { id, userId, grantedByUserId, role = 'NAZIR', waqfId = WAQF } = options;
  return `INSERT INTO "waqf_access_grant"
      ("id","userId","waqfId","role","permissions","dataScopes","canViewAmlRestricted",
       "amlCompartment","beneficiarySelfId","scopeRefs","grantedByUserId","validFrom","validUntil",
       "revokedAt","createdAt","updatedAt")
    VALUES ('${id}','${userId}','${waqfId}','${role}'::"Role",
            ARRAY['approval:request:read','approval:request:approve']::text[], ARRAY[]::text[],
            false, false, NULL, ARRAY[]::text[],
            '${grantedByUserId}', ${PAST}, NULL, NULL, now(), now())`;
}

/**
 * A FORGED admission marker, as a plpgsql statement assigning the new event id to `ev`.
 *
 * ⚠ `rowHash` IS DERIVED FROM `tag`, and every case uses a distinct tag. `audit_event` has a UNIQUE
 * index on `rowHash`; a repeated literal trips it with 23505 and masks the guard behind the wrong
 * error. That was the second of the round-2 re-attack's three false negatives.
 *
 * ⚠ `occurredAt` is a fixed UTC literal, never `now()`. `occurredAt` is `timestamp WITHOUT time
 * zone` and SQL `now()` writes LOCAL wall-clock into it while the application writes UTC — the third
 * round-2 false negative (forged grants were future-dated and read as correctly refused when they
 * were merely inactive).
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
function markerSql(options: {
  readonly tag: string;
  readonly actorType: 'USER' | 'SYSTEM' | 'SERVICE';
  readonly actorId: string | null;
  readonly grantId: string;
}): string {
  const { tag, actorType, actorId, grantId } = options;
  return `PERFORM pg_advisory_xact_lock(7233057419042001);
    ev := nextval(pg_get_serial_sequence('public."audit_event"', 'id'));
    INSERT INTO "audit_event"
      ("id","occurredAt","occurredAtHijri","actorId","actorType","onBehalfOfId","action",
       "entityType","entityId","waqfId","before","after","context","category","classification",
       "prevHash","rowHash")
    VALUES (ev, '2026-07-28T00:00:00.000Z'::timestamp, '1448-02-13', ${actorId === null ? 'NULL' : `'${actorId}'`},
            '${actorType}'::"AuditActorType", NULL, 'CREATE'::"AuditAction", 'WaqfAccessGrant',
            '${grantId}', '${WAQF}', NULL, '{"forged":"${tag}"}'::jsonb,
            '{"probe":"${tag}","fixture":"e2 round-3 test row (بيانات وهمية)"}'::jsonb,
            'MUTATION'::"AuditCategory", 'ROUTINE'::"AuditClassification",
            qmulate_audit_expected_prev_hash(ev),
            qmulate_audit_row_hash(ev, '2026-07-28T00:00:00.000Z'::timestamp, ${actorId === null ? 'NULL' : `'${actorId}'`}, '${actorType}', NULL, 'CREATE', 'WaqfAccessGrant',
          '${grantId}', '${WAQF}', NULL, '{"forged":"${tag}"}'::jsonb,
          '{"probe":"${tag}","fixture":"e2 round-3 test row (بيانات وهمية)"}'::jsonb, 'MUTATION', 'ROUTINE',
          qmulate_audit_expected_prev_hash(ev)))`;
}

/** Advances the chain head to the forged event — condition 3 of the pinned list. */
const ADVANCE_HEAD = (): string =>
  `UPDATE "audit_chain_head"
      SET "lastId" = ev,
          "lastRowHash" = (SELECT "rowHash" FROM "audit_event" WHERE "id" = ev),
          "updatedAt" = now()
    WHERE "id" = 1`;

/** Wraps plpgsql statements as ONE autocommitted `DO` block, so the deferred trigger fires. */
function doBlock(statements: readonly string[]): string {
  return [
    'DO $sysb$',
    'DECLARE ev bigint; head bigint;',
    'BEGIN',
    ...statements.map((s) => `  ${s};`),
    'END',
    '$sysb$;',
  ].join('\n');
}

describe.skipIf(!hasDatabase)('N-2 · the SYSTEM branch of grant admission, enumerated', () => {
  let prisma: PrismaLike;
  let db: Awaited<ReturnType<typeof databaseModule>>;

  /** Runs SQL and returns the flattened server error, or `null` when it was PERMITTED. */
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
      authzScaffoldingSql([`DELETE FROM "waqf_access_grant" WHERE "id" LIKE '${GRANT_PREFIX}%'`]),
    );
  };

  /**
   * Installs a one-substitution mutant of a live function inside `body`'s transaction.
   *
   * THROWS when `find` is absent from the real definition, so a mutation that stopped applying —
   * because the migration was reworded — is a hard failure rather than a quiet pass.
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

    // THE ONE COMMITTED ROW, laid down through the **LEGITIMATE AUDITED PATH** — a `USER` context for
    // PO-1's seeded admin seat, which really does hold `admin:access_matrix:write` on `waqf-001`. No
    // forgery, so the hash chain stays intact and gate G-1 keeps verifying.
    //
    // ⚠ IT USED TO BE `withAudit()` ON A `makeSystemContext()`, AND THAT IS EXACTLY WHAT MIGRATION 9
    // STOPPED ADMITTING. Two ways were open: provision it with admission suspended
    // (`provisionGrants()`), or issue it the way a real access-matrix change is issued. The second is
    // chosen deliberately — it doubles as this file's own control that the legitimate path still WORKS,
    // which a guard change must always prove, and it gives cases 7/8 and their mutations a marker whose
    // actor holds established authority (a SYSTEM/`PROVISIONER` marker no longer admits anything, so
    // those mutations would have been measuring the wrong refusal).
    //
    // Role `AUDITOR` deliberately: `waqf_access_grant_userId_waqfId_role_key` is unique on
    // (userId, waqfId, role), and a sibling file holds a COUNSEL seat for this same user on this
    // same endowment for part of a run.
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
        permissions: ['admin:access_matrix:read', 'admin:access_matrix:write'],
        requestId: 'round5-sysbranch-legit-issue',
      } as never),
      async (tx) => {
        await tx.waqfAccessGrant.create({
          data: {
            id: COMMITTED_GRANT,
            userId: FINANCE,
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
    expect(
      await grantExists(COMMITTED_GRANT),
      'the SEEDED ADMIN could not issue a grant on waqf-001 through the ordinary audited path — that ' +
        'is an OUTAGE of the legitimate access-matrix path, not a control',
    ).toBe(true);
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // THE EIGHT MARKERS THAT DO NOT ADMIT A WRITE (unchanged by migration 9)
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the eight markers that do NOT admit a write', () => {
    it('1 · no marker at all — the round-2 forgery, unchanged', async () => {
      const id = `${GRANT_PREFIX}001`;
      const error = await attempt(
        doBlock([grantSql({ id, userId: FINANCE, grantedByUserId: NAZIR })]),
      );
      expect(error, 'a grant was born with nothing to attribute it to').not.toBeNull();
      expect(error).toMatch(/authorization plane is not writable outside the AUDITED/);
      expect(error).toContain('42501');
      expect(await grantExists(id)).toBe(false);
    });

    it('2 · a USER marker naming SELF — self-promotion is unrepresentable at INSERT time', async () => {
      // The marker names the attacker AND the grant is issued to the attacker, so
      // `grantedByUserId = userId` and CHECK `waqf_access_grant_no_self_issue` refuses BEFORE the
      // deferred admission trigger is ever reached.
      //
      // ⚠ STATED PRECISELY, because the ordering matters: this case proves self-issue is impossible,
      // NOT that admission would have refused it. A CHECK is the stronger place for it —
      // `session_replication_role = 'replica'` does not skip CHECKs at all — and the second
      // assertion below covers the admission guard's own answer to the same attack.
      const id = `${GRANT_PREFIX}002`;
      const error = await attempt(
        doBlock([
          markerSql({ tag: 'c2', actorType: 'USER', actorId: FINANCE, grantId: id }),
          ADVANCE_HEAD(),
          grantSql({ id, userId: FINANCE, grantedByUserId: FINANCE }),
        ]),
      );
      expect(error, 'a FINANCE seat issued itself a NAZIR grant').not.toBeNull();
      expect(error).toMatch(/waqf_access_grant_no_self_issue/);
      expect(error).toContain('23514');
      expect(await grantExists(id)).toBe(false);

      // The same attack with the issuer spelled as a third party to dodge the CHECK: now the
      // ATTRIBUTION half of admission answers, because the marker records a different actor.
      const dodge = `${GRANT_PREFIX}002b`;
      const dodged = await attempt(
        doBlock([
          markerSql({ tag: 'c2b', actorType: 'USER', actorId: FINANCE, grantId: dodge }),
          ADVANCE_HEAD(),
          grantSql({ id: dodge, userId: FINANCE, grantedByUserId: NAZIR }),
        ]),
      );
      expect(dodged, 'naming a third party as issuer dodged both controls').not.toBeNull();
      expect(dodged).toMatch(
        /"grantedByUserId" is .* but the audit_event admitting this write was/,
      );
      expect(await grantExists(dodge)).toBe(false);
      expect(await hasActiveNazir(FINANCE)).toBe(false);
    });

    it('3 · a USER marker naming SELF, with an ACCOMPLICE grantee', async () => {
      // The way around `no_self_issue`: promote somebody else. Attribution is satisfied
      // (`grantedByUserId` = the marker's actor), so this case reaches the AUTHORITY check — which is
      // the one the SYSTEM disjunct short-circuits, and therefore the one this file exists to pin.
      const id = `${GRANT_PREFIX}003`;
      const error = await attempt(
        doBlock([
          markerSql({ tag: 'c3', actorType: 'USER', actorId: FINANCE, grantId: id }),
          ADVANCE_HEAD(),
          grantSql({ id, userId: ACCOMPLICE, grantedByUserId: FINANCE }),
        ]),
      );
      expect(error, 'a FINANCE seat promoted an accomplice to NAZIR').not.toBeNull();
      expect(error).toMatch(
        /actor "user-accountant-001" holds no ACTIVE grant carrying "admin:access_matrix:write"/,
      );
      expect(await grantExists(id)).toBe(false);
      expect(await hasActiveNazir(ACCOMPLICE)).toBe(false);
    });

    it('4 · a USER marker naming a real, seeded NAZIR — the Nazir is not an access-matrix admin', async () => {
      // The most important negative in this file. `user-nazir-001` genuinely holds `NAZIR` on all
      // four endowments and is the sole approval authority (ADR-0005) — and holds NO admin verb, so
      // it may not write the access matrix. Conflating "the most senior seat" with "may issue seats"
      // is how a role model turns into root; §10 principle 3 keeps them separate on purpose.
      const id = `${GRANT_PREFIX}004`;
      const error = await attempt(
        doBlock([
          markerSql({ tag: 'c4', actorType: 'USER', actorId: NAZIR, grantId: id }),
          ADVANCE_HEAD(),
          grantSql({ id, userId: FINANCE, grantedByUserId: NAZIR }),
        ]),
      );
      expect(error, 'a NAZIR issued an access-matrix seat').not.toBeNull();
      expect(error).toMatch(
        /actor "user-nazir-001" holds no ACTIVE grant carrying "admin:access_matrix:write"/,
      );
      expect(await grantExists(id)).toBe(false);

      // And the negative control on the negative control: the seat really is a live NAZIR, so the
      // refusal above is about the missing ADMIN verb and not about a dead grant.
      expect(
        await hasActiveNazir(NAZIR),
        'the seeded NAZIR seat is not live — case 4 proves nothing',
      ).toBe(true);
    });

    it('5 · a SERVICE marker — no actorType short-circuits the authority check any more', async () => {
      // `actorType` has exactly three values (USER, SYSTEM, SERVICE). Before migration 9 the guard
      // named ONE of them and this case's point was that a job runner is not a bootstrap. Since
      // migration 9 the guard names NONE: `actorType` is a value the caller writes, so a rule that
      // reads it is a rule the caller sets. Kept, because the refusal must survive the removal — and
      // because it now proves the same thing as case 1d in the same enumeration for a different value.
      const id = `${GRANT_PREFIX}005`;
      const error = await attempt(
        doBlock([
          markerSql({ tag: 'c5', actorType: 'SERVICE', actorId: SERVICE_ACTOR, grantId: id }),
          ADVANCE_HEAD(),
          grantSql({ id, userId: FINANCE, grantedByUserId: SERVICE_ACTOR }),
        ]),
      );
      expect(error, 'a SERVICE actor issued a NAZIR seat').not.toBeNull();
      expect(error).toMatch(
        /actor "svc-deadline-worker" holds no ACTIVE grant carrying "admin:access_matrix:write"/,
      );
      expect(await grantExists(id)).toBe(false);
    });

    it('6 · a SYSTEM marker with a NULL actorId — an unattributable change is refused', async () => {
      const id = `${GRANT_PREFIX}006`;
      const error = await attempt(
        doBlock([
          markerSql({ tag: 'c6', actorType: 'SYSTEM', actorId: null, grantId: id }),
          ADVANCE_HEAD(),
          grantSql({ id, userId: FINANCE, grantedByUserId: PROVISIONER }),
        ]),
      );
      expect(error, 'a SYSTEM job with no actorId issued a seat').not.toBeNull();
      expect(error).toMatch(/admitting this write names no actor \(actorType "SYSTEM"\)/);
      expect(await grantExists(id)).toBe(false);
    });

    it('7 · a SYSTEM marker whose event the chain head does not cover', async () => {
      // `finalizeChain()` advances `audit_chain_head` inside the same transaction, so the genuine
      // path always satisfies this. A forger who inserts only the event does not: they must also
      // move the one row gate G-1's verifier compares the recomputed chain against.
      //
      // ⚠ THE PRECONDITION IS MEASURED, not assumed. If `head.lastId` already exceeded the new
      // event's id, this case would be refused for no reason at all and read as a working control.
      const [before] = await prisma.$queryRawUnsafe<{ head: string; nextEvent: string }[]>(
        `SELECT (SELECT "lastId" FROM "audit_chain_head" WHERE "id" = 1)::text AS head,
                (SELECT COALESCE(max("id"), 0) FROM "audit_event")::text        AS "nextEvent"`,
      );
      expect(
        BigInt(before?.head ?? '0'),
        'the head already covers every event, so "head not advanced" is not testable',
      ).toBeLessThanOrEqual(BigInt(before?.nextEvent ?? '0'));

      const id = `${GRANT_PREFIX}007`;
      const error = await attempt(
        doBlock([
          markerSql({ tag: 'c7', actorType: 'SYSTEM', actorId: PROVISIONER, grantId: id }),
          grantSql({ id, userId: FINANCE, grantedByUserId: PROVISIONER }),
        ]),
      );
      expect(error, 'an event the head does not cover admitted a grant').not.toBeNull();
      expect(error).toMatch(/authorization plane is not writable outside the AUDITED/);
      expect(await grantExists(id)).toBe(false);
    });

    it('8 · a genuine SYSTEM marker from a PRIOR transaction does not admit a later widening', async () => {
      // No forgery at all: `COMMITTED_GRANT` was created in `beforeAll` through the legitimate audited
      // path, so a real, chain-valid event names it — and names an actor with real authority here. The `xmin` condition is what
      // stops that event from admitting a SECOND write later — without it, a stale event from an
      // earlier life of the same id is a standing licence.
      //
      // The widening is `validFrom` moved EARLIER: it is governed (migration 5 lists it), and no
      // other guard has an opinion about it, so the refusal can only come from admission.
      const [marker] = await prisma.$queryRawUnsafe<
        { n: string; actorType: string; actorId: string | null }[]
      >(
        `SELECT count(*)::text AS n, min("actorType"::text) AS "actorType", min("actorId") AS "actorId"
           FROM "audit_event"
          WHERE "entityType" = 'WaqfAccessGrant' AND "entityId" = '${COMMITTED_GRANT}'`,
      );
      expect(Number(marker?.n ?? '0'), 'the prior-transaction event is missing').toBeGreaterThan(0);
      // ⚠ `USER`, not `SYSTEM`, since migration 9: `beforeAll` now issues this row through the
      // legitimate admin path. That makes the case STRONGER — the stale marker names an actor who
      // genuinely holds `admin:access_matrix:write` on this endowment, so the ONLY thing standing
      // between it and a standing licence to widen is the same-transaction (`xmin`) condition, which is
      // exactly what the mutation below removes.
      expect(marker?.actorType).toBe('USER');
      expect(marker?.actorId).toBe(SEEDED_ADMIN);

      const error = await attempt(
        `UPDATE "waqf_access_grant" SET "validFrom" = '2020-01-01T00:00:00.000Z'
          WHERE "id" = '${COMMITTED_GRANT}'`,
      );
      expect(
        error,
        'a stale marker from an earlier transaction admitted a widening',
      ).not.toBeNull();
      expect(error).toMatch(/authorization plane is not writable outside the AUDITED/);
      expect(error).toMatch(/widened "validFrom"/);

      const [row] = await prisma.$queryRawUnsafe<{ validFrom: Date }[]>(
        `SELECT "validFrom" FROM "waqf_access_grant" WHERE "id" = '${COMMITTED_GRANT}'`,
      );
      expect(row?.validFrom?.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 9 · THE CASE THAT INVERTED — the SYSTEM marker no longer admits ANYTHING
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('9 · the SYSTEM marker is REFUSED in every form (migration 9)', () => {
    it('9a · the GENUINE audited SYSTEM path is refused — and the actor really does hold nothing', async () => {
      // ⚠ THIS TEST USED TO ASSERT THE OPPOSITE, AND THE OLD VERSION IS WHY MIGRATION 9 EXISTS. It
      // read "the genuine audited SYSTEM path commits, and all five preconditions hold", and pinned a
      // list in which condition 4 was `actorType = 'SYSTEM'` and the actor needed NO grant, NO
      // permission and NO `User` row. That is not a specification of a control, it is a description of
      // an unauthenticated write with an audit trail attached.
      //
      // Driven through the SHIPPED helpers rather than raw SQL: `makeSystemContext()` + `withAudit()`
      // is the exact shape `src/seed.ts` and `packages/api/test/setup.ts` used, so this is the refusal
      // that forced both of them onto `withAccessMatrixBootstrap()`.
      const systemCtx = db.makeSystemContext({
        actorId: PROVISIONER,
        authorizedWaqfIds: [WAQF],
        requestId: 'round5-sysbranch-refusal',
        reason: 'N-2 case 9a: the audited SYSTEM path, after migration 9',
      });
      const id = `${GRANT_PREFIX}09A`;
      let refusal: unknown;
      try {
        // ⚠ THE PROVISIONING CONNECTION (ADR-0008 round 6). The refusal under test is the AUTHORITY
        // clause of `qmulate_grant_admission()` — "this actor holds no established
        // admin:access_matrix:write here". On the app connection the ACL now refuses first (`42501
        // permission denied for table waqf_access_grant`) and the trigger never runs, so this case
        // would pass while measuring the wrong control entirely.
        await db.withAudit(accessMatrixClient(systemCtx), async (tx) => {
          await tx.waqfAccessGrant.create({
            data: {
              id,
              userId: ACCOMPLICE,
              waqfId: WAQF,
              role: 'NAZIR' as never,
              permissions: ['approval:request:read', 'approval:request:approve'],
              dataScopes: [],
              scopeRefs: [],
              grantedByUserId: PROVISIONER,
              validFrom: new Date('2026-01-01T00:00:00.000Z'),
            },
          });
        });
      } catch (error: unknown) {
        refusal = error;
      }

      expect(
        refusal,
        'a SYSTEM context still writes the authorization plane — either migration 9 did not take ' +
          'effect, or something re-installed the disjunct',
      ).toBeDefined();
      expect(errorText(refusal)).toMatch(
        /actor "user-test-sysbranch-provisioner" holds no ACTIVE grant carrying "admin:access_matrix:write"/,
      );
      expect(errorText(refusal)).toMatch(/actorType IS NO LONGER CONSULTED/);
      expect(await grantExists(id)).toBe(false);
      expect(await hasActiveNazir(ACCOMPLICE)).toBe(false);

      // AND THE MEASUREMENT THAT MAKES THE REFUSAL MEAN WHAT IT SAYS: the actor holds no admin verb on
      // this endowment, no grant at all, and not even a `User` row. Kept verbatim from the old 9a,
      // where it existed to prove the SYSTEM disjunct was what admitted the write. It now proves the
      // refusal is about missing AUTHORITY rather than about some incidental property of the actor.
      const [authority] = await prisma.$queryRawUnsafe<
        { onThisWaqf: boolean; anyGrant: string; userRow: string }[]
      >(
        `SELECT qmulate_actor_holds_permission('${PROVISIONER}','${WAQF}','admin:access_matrix:write')
                  AS "onThisWaqf",
                (SELECT count(*) FROM "waqf_access_grant" WHERE "userId" = '${PROVISIONER}')::text
                  AS "anyGrant",
                (SELECT count(*) FROM "user" WHERE "id" = '${PROVISIONER}')::text AS "userRow"`,
      );
      expect(authority?.onThisWaqf).toBe(false);
      expect(authority?.anyGrant).toBe('0');
      expect(authority?.userRow).toBe('0');

      // The row `beforeAll` provisioned is still there, so the refusal above is not "this file cannot
      // write grants at all" — it is specifically admission, on a non-provisioning path.
      expect(await grantExists(COMMITTED_GRANT)).toBe(true);
    });

    it('9b · ROUTE 1 — the raw SYSTEM forgery that used to be the kill chain is REFUSED', async () => {
      // THE EXACT ATTACK, unchanged from the round-2 / round-4 reproduction: a forged
      // SYSTEM-attributed marker with an ARBITRARY `actorId` that is not a `User` row, the chain head
      // advanced to it, and the grant row — all from one autocommitted `DO` block so the deferred
      // trigger fires. Until migration 9 this PERMITTED an ACTIVE NAZIR seat for a plain FINANCE user,
      // and `appRouter.approval.approve` then returned `{status:'APPROVED'}` on another maker's
      // SAR 4,500,000 `BANK_MOVEMENT`.
      //
      // ALL FIVE of the old preconditions are satisfied here — the marker names this grant, is written
      // in the same transaction, is covered by the chain head, carries `actorType = 'SYSTEM'` and a
      // non-null `actorId` that equals `grantedByUserId`. That is what makes this the pinned removal:
      // the write is refused although every condition the old guard asked for is met.
      const id = `${GRANT_PREFIX}009`;
      expect(await hasActiveNazir(FINANCE), 'the attacker already holds NAZIR here').toBe(false);

      const error = await attempt(
        doBlock([
          markerSql({ tag: 'c9', actorType: 'SYSTEM', actorId: 'not-a-real-user', grantId: id }),
          ADVANCE_HEAD(),
          grantSql({ id, userId: FINANCE, grantedByUserId: 'not-a-real-user' }),
        ]),
      );

      expect(
        error,
        'ROUTE 1 is still PERMITTED: a forged SYSTEM marker naming an actorId that is not even a User ' +
          'row minted an ACTIVE NAZIR seat for a FINANCE user. That is the whole finding — do not ' +
          'weaken this assertion',
      ).not.toBeNull();
      expect(error).toContain('42501');
      expect(error).toMatch(
        /actor "not-a-real-user" holds no ACTIVE grant carrying "admin:access_matrix:write"/,
      );
      expect(await grantExists(id)).toBe(false);
      expect(await hasActiveNazir(FINANCE)).toBe(false);
    });

    it('9c · the removal is by AUTHORITY, not by blacklisting the string "SYSTEM"', async () => {
      // The cheap version of this change would have been `marker_type <> 'SYSTEM'`, or deleting one
      // disjunct while leaving another actorType-shaped hole. This walks the cross product a caller can
      // write into a marker and shows the outcome turns on ONE thing only: does the named actor hold
      // established `admin:access_matrix:write` on THIS endowment.
      //
      // ⚠ ISOLATED, with `cleanup()` between variants. Every variant issues the same NAZIR seat to the
      // same user on the same endowment, and `waqf_access_grant_userId_waqfId_role_key` is unique on
      // (userId, waqfId, role) — a surviving row from a previous variant would report 23505, which
      // reads exactly like a refusal. That false negative is what round 4's first pass shipped.
      const actorTypes = ['SYSTEM', 'USER', 'SERVICE'] as const;
      const actors: readonly { readonly id: string; readonly why: string }[] = [
        { id: 'not-a-real-user', why: 'a string that is not a User row' },
        {
          id: 'user-seed-admin',
          why: 'the SEED actor — a real provisioning identity with no seat',
        },
        { id: NAZIR, why: 'a real, live NAZIR on this endowment — but no admin verb' },
        { id: SERVICE_ACTOR, why: 'a service principal' },
      ];

      let index = 0;
      for (const actorType of actorTypes) {
        for (const actor of actors) {
          index += 1;
          const id = `${GRANT_PREFIX}09C${String(index)}`;
          const error = await attempt(
            doBlock([
              markerSql({
                tag: `c9c-${String(index)}`,
                actorType,
                actorId: actor.id,
                grantId: id,
              }),
              ADVANCE_HEAD(),
              grantSql({ id, userId: ACCOMPLICE, grantedByUserId: actor.id }),
            ]),
          );
          expect(
            error,
            `PERMITTED: actorType=${actorType} naming ${actor.id} (${actor.why})`,
          ).not.toBeNull();
          expect(error).toContain('42501');
          expect(await grantExists(id)).toBe(false);
          await cleanup();
        }
      }
      expect(await hasActiveNazir(ACCOMPLICE)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 10 · THE MARKER THAT IS STILL ADMITTED — and it is the only one left
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('10 · the surviving permitted marker is a USER naming an ESTABLISHED admin', () => {
    it('10a · a USER marker naming PO-1’s SEEDED admin is ADMITTED — the only route left', async () => {
      // ⚠ THE HONEST CORRECTION TO THIS FILE'S OWN PREMISE, AND SINCE MIGRATION 9 IT IS THE WHOLE
      // REMAINING SURFACE. The header once said the SYSTEM disjunct was "THE ONE SURVIVING ROUTE";
      // that was true only while no seeded grant carried the admin verb, and PO-1 deliberately changed
      // that fact. With the SYSTEM disjunct now deleted there is exactly ONE permitted marker:
      // `actorType = 'USER'` (or any actorType — see 9c; the field is not read) naming an actor that
      // genuinely holds `admin:access_matrix:write` on this endowment, established in the trail first.
      //
      // A raw-SQL caller can forge that marker as easily as a SYSTEM one, so PO-1's seat is a named
      // impersonation target — the cost of the decision, stated rather than buried, and the reason the
      // seat is scoped to ONE endowment. §11 drives it as an attack and asserts it succeeds.
      //
      // Rolled back: the marker is forged, and rule (a) forbids committing a forged event.
      const ROLLBACK = '__qmulate_sysb_10a__';
      const id = `${GRANT_PREFIX}910`;
      const observed: Record<string, unknown> = {};
      let unexpected: unknown;

      const [pre] = await prisma.$queryRawUnsafe<{ holds: boolean }[]>(
        `SELECT qmulate_actor_holds_permission('${SEEDED_ADMIN}','${WAQF}','admin:access_matrix:write')
                  AS holds`,
      );
      expect(pre?.holds, 'PO-1’s seeded admin seat is gone — this case proves nothing').toBe(true);

      try {
        await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            doBlock([
              markerSql({ tag: 'c10', actorType: 'USER', actorId: SEEDED_ADMIN, grantId: id }),
              ADVANCE_HEAD(),
              grantSql({ id, userId: ACCOMPLICE, grantedByUserId: SEEDED_ADMIN }),
            ]),
          );
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
        'the USER branch refused an actor that genuinely holds the admin verb — then the legitimate ' +
          'access-matrix path is broken, which is an outage rather than a control',
      ).toBeNull();
      expect(observed.role).toBe('NAZIR');
      expect(await grantExists(id)).toBe(false);
      expect(await hasActiveNazir(ACCOMPLICE)).toBe(false);
    });

    it('10b · but a CYCLE of USER markers is refused — migration 7', async () => {
      // The route that would have survived deleting the SYSTEM disjunct: two grants issued to each
      // other inside one transaction, each one the other's authority. Fully reproduced, with its
      // negative controls and its mutation, in `grant-authority-precedence.integration.test.ts`; this
      // is the one-line version, kept HERE so the enumeration this file owns is complete.
      const a = `${GRANT_PREFIX}911`;
      const b = `${GRANT_PREFIX}912`;
      const ADMIN_PERMS = `ARRAY['admin:access_matrix:read','admin:access_matrix:write']::text[]`;
      const adminGrant = (id: string, userId: string, issuer: string): string =>
        `INSERT INTO "waqf_access_grant"
            ("id","userId","waqfId","role","permissions","dataScopes","canViewAmlRestricted",
             "amlCompartment","beneficiarySelfId","scopeRefs","grantedByUserId","validFrom",
             "validUntil","revokedAt","createdAt","updatedAt")
          VALUES ('${id}','${userId}','${WAQF}','SYSTEM_ADMIN'::"Role", ${ADMIN_PERMS},
                  ARRAY[]::text[], false, false, NULL, ARRAY[]::text[], '${issuer}', ${PAST}, NULL,
                  NULL, now(), now())`;

      const error = await attempt(
        doBlock([
          markerSql({ tag: 'c10b-1', actorType: 'USER', actorId: ACCOMPLICE, grantId: a }),
          ADVANCE_HEAD(),
          adminGrant(a, FINANCE, ACCOMPLICE),
          markerSql({ tag: 'c10b-2', actorType: 'USER', actorId: FINANCE, grantId: b }),
          ADVANCE_HEAD(),
          adminGrant(b, ACCOMPLICE, FINANCE),
        ]),
      );

      expect(error, 'two mutually-issued admin seats were admitted out of nothing').not.toBeNull();
      expect(error).toContain('42501');
      expect(error).toMatch(/already recorded in the audit trail before event/);
      expect(await grantExists(a)).toBe(false);
      expect(await grantExists(b)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 11 · ROUTE 2 — **DELETED** (ADR-0008 round 6). IT IS CLOSED, AND THE CLOSURE IS A PRIVILEGE.
  // ═══════════════════════════════════════════════════════════════════════════════════════
  //
  // What stood here were two tests that PASSED BECAUSE THE ATTACK WORKED: a forged `audit_event`
  // marker naming `user-admin-001` — who genuinely holds `admin:access_matrix:write` on `waqf-001` —
  // admitted a `NAZIR` seat for a plain FINANCE user, and `approval_request_authority` then accepted
  // that seat as the checker on another maker's SAR 4,500,000 `BANK_MOVEMENT`.
  //
  // Their header explained why no in-database logic could close it: "the admission marker IS AN
  // `audit_event` ROW, and in this attack THE ATTACKER WRITES THAT ROW … attacker and application
  // connect as the SAME database role, so the trigger has no forgery-proof way to ask 'who actually
  // authored this row?'" — and it named the fix: "WHAT ACTUALLY CLOSES IT: privilege separation
  // (ADR-0008, E12). The runtime role must not hold `INSERT` on `waqf_access_grant`/`audit_event` and
  // must not own those tables."
  //
  // That landed. `DATABASE_URL` connects as `qmulate_app`, which holds NO INSERT on
  // `waqf_access_grant` and owns no table, so the chain now dies on its last statement with
  // `42501 permission denied for table waqf_access_grant` — measured end to end, with the marker
  // still writable and irrelevant, in
  // `test/authorization-plane-privilege.integration.test.ts` §2.
  //
  // ⚠ THE BLOCK IS DELETED RATHER THAN INVERTED, EXACTLY AS ITS OWN HEADER AND ADR-0008's round-5
  // addendum instructed. An inverted version would assert a refusal on this file's connection, and
  // that assertion belongs in one place — the file above, whose `beforeAll` FAILS if the connection
  // it is asserting on turns out to be superuser or BYPASSRLS. Spreading the same claim across two
  // files is how one of them comes to be believed while the other quietly stops meaning anything.
  //
  // ⚠ AND THE RESIDUAL DID NOT VANISH, IT MOVED. Whoever holds `ACCESS_MATRIX_DATABASE_URL` can still
  // forge this exact chain — that is MEASURED and PINNED as a passing attack in §6c of the file above,
  // by this sprint's convention that a residual recorded only in prose is a residual nobody is
  // accountable for. What closed is the route available to a caller holding only the application
  // database credential: every SQL injection, every `$executeRawUnsafe` on a scoped client, and every
  // holder of `DATABASE_URL` alone.

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // THE MUTATIONS, EXECUTED AGAINST THE REAL SHIPPED BODIES
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('MUTATION · each condition, changed in the live function, moves its case', () => {
    /** Applies one mutation inside a rolled-back transaction and reports what the case then did. */
    const withMutant = async (
      mutation: { signature: string; find: string; replace: string },
      sql: string,
    ): Promise<{ outcome: string | null; failed: unknown }> => {
      const ROLLBACK = '__qmulate_sysb_mutant__';
      let outcome: string | null = 'not attempted';
      let failed: unknown;
      try {
        await prisma.$transaction(async (tx) => {
          await mutateFunction(tx, mutation.signature, mutation.find, mutation.replace);
          try {
            await tx.$executeRawUnsafe(sql);
            await tx.$executeRawUnsafe('SET CONSTRAINTS ALL IMMEDIATE');
            outcome = null; // PERMITTED
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
      return { outcome, failed };
    };

    it('RESTORING the SYSTEM disjunct re-opens ROUTE 1 — the removal is what refuses it', async () => {
      // ⚠ THIS MUTATION RUNS THE OTHER WAY ROUND FROM ITS PREDECESSOR, AND THAT IS THE POINT. The old
      // version deleted the disjunct and asserted the write became refused. Now that migration 9 has
      // deleted it for real, the mutation that proves the removal is load-bearing is the INVERSE: put
      // `marker_type = 'SYSTEM' OR` BACK into the LIVE function body and re-drive case 9b's exact kill
      // chain. It must become PERMITTED again.
      //
      // A removal nobody can re-open on demand is a removal nobody has measured: without this, the
      // refusal in 9b could equally be caused by the precedence clause, by the attribution check, or by
      // the marker never being found at all, and the file would be crediting migration 9 for a control
      // it did not provide.
      //
      // `mutateFunction()` THROWS if the target substring is absent, so a reworded migration fails
      // loudly here instead of quietly passing. The substitution point is the authority assignment
      // itself, which migration 9 owns.
      const FIND = 'authorised := qmulate_actor_holds_established_permission(';
      const { outcome, failed } = await withMutant(
        {
          signature: 'qmulate_grant_admission()',
          find: FIND,
          replace: `authorised := marker_type = 'SYSTEM' OR qmulate_actor_holds_established_permission(`,
        },
        doBlock([
          markerSql({
            tag: 'mut-system',
            actorType: 'SYSTEM',
            actorId: 'not-a-real-user',
            grantId: `${GRANT_PREFIX}101`,
          }),
          ADVANCE_HEAD(),
          grantSql({
            id: `${GRANT_PREFIX}101`,
            userId: FINANCE,
            grantedByUserId: 'not-a-real-user',
          }),
        ]),
      );
      expect(failed, 'the mutation could not be driven').toBeUndefined();
      expect(
        outcome,
        'with the SYSTEM disjunct RESTORED, route 1 was still refused — then the disjunct is not what ' +
          'used to admit it and migration 9 is being credited with a closure it did not make. Find out ' +
          'what actually refuses it before trusting case 9b',
      ).toBeNull();

      // …and the real function is back: the mutant lived only inside the rolled-back transaction.
      const [row] = await prisma.$queryRawUnsafe<{ def: string }[]>(
        `SELECT pg_get_functiondef('qmulate_grant_admission()'::regprocedure) AS def`,
      );
      expect(row?.def, 'the mutant was left installed').toContain(FIND);
      expect(
        row?.def,
        'the mutant was left installed — the SYSTEM disjunct is back in the LIVE body',
      ).not.toContain("marker_type = 'SYSTEM' OR");

      // Belt and braces: the row the mutant admitted did not survive the rollback.
      expect(await grantExists(`${GRANT_PREFIX}101`)).toBe(false);
      expect(await hasActiveNazir(FINANCE)).toBe(false);
    });

    it('migration 9’s own apply block REFUSES a live body that still carries the disjunct', async () => {
      // A migration that only edits a file is a migration that can be silently undone — by a later
      // hotfix, by a `CREATE OR REPLACE` in some other migration, or by a mutation harness that failed
      // to roll back. `qmulate_apply_e2_close_system_marker()` therefore reads the LIVE definition with
      // `pg_get_functiondef()` and RAISES if the disjunct is present, and it is re-appliable at any
      // time (verified: `prisma migrate deploy` re-runs the whole file on an already-migrated database).
      //
      // Driven here against the mutant, inside a rolled-back transaction. On the shipped body the block
      // must be silent, which is asserted first — otherwise a block that always raised would pass this.
      await prisma.$executeRawUnsafe('SELECT qmulate_apply_e2_close_system_marker()');

      const ROLLBACK = '__qmulate_apply_block__';
      let raised: string | null = null;
      let driveFailure: unknown;
      try {
        await prisma.$transaction(async (tx) => {
          await mutateFunction(
            tx,
            'qmulate_grant_admission()',
            'authorised := qmulate_actor_holds_established_permission(',
            `authorised := marker_type = 'SYSTEM' OR qmulate_actor_holds_established_permission(`,
          );
          try {
            await tx.$executeRawUnsafe('SELECT qmulate_apply_e2_close_system_marker()');
          } catch (error: unknown) {
            raised = errorText(error);
          }
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!errorText(error).includes(ROLLBACK)) driveFailure = error;
      }

      expect(driveFailure, 'the mutation could not be driven').toBeUndefined();
      expect(
        raised,
        'the apply block accepted a live body carrying the SYSTEM disjunct, so re-running the ' +
          'migration would not detect a body that had been swapped back',
      ).not.toBeNull();
      expect(raised).toMatch(/still contains the "marker_type = 'SYSTEM'" disjunct/);
    });

    it('deleting the same-transaction (xmin) condition PERMITS case 8', async () => {
      const { outcome, failed } = await withMutant(
        {
          signature: 'qmulate_grant_admission_marker(text)',
          find: 'ae.xmin = pg_current_xact_id()::xid',
          replace: 'true',
        },
        `UPDATE "waqf_access_grant" SET "validFrom" = '2020-01-01T00:00:00.000Z'
          WHERE "id" = '${COMMITTED_GRANT}'`,
      );
      expect(failed, 'the mutation could not be driven').toBeUndefined();
      expect(
        outcome,
        'case 8 was refused even with the xmin condition removed, so the condition is not what ' +
          'refuses it and a stale marker may be a standing licence for some other reason',
      ).toBeNull();
    });

    it('deleting the chain-head condition PERMITS case 7', async () => {
      const { outcome, failed } = await withMutant(
        {
          signature: 'qmulate_grant_admission_marker(text)',
          find: 'h."lastId" >= ae."id"',
          replace: 'true',
        },
        // ⚠ THE MARKER NAMES THE SEEDED ADMIN, not `PROVISIONER`, and that is a migration-9
        // consequence rather than a preference: with the chain-head condition neutralised the marker is
        // FOUND, and the write then has to clear the AUTHORITY check as well. A SYSTEM/`PROVISIONER`
        // marker would be refused there — the mutation would report "still refused" and be credited to
        // the chain-head condition, which is a false negative of exactly the kind this block exists to
        // avoid. Everything else is case 7 verbatim: the head is deliberately NOT advanced.
        doBlock([
          markerSql({
            tag: 'mut-head',
            actorType: 'USER',
            actorId: SEEDED_ADMIN,
            grantId: `${GRANT_PREFIX}103`,
          }),
          grantSql({ id: `${GRANT_PREFIX}103`, userId: FINANCE, grantedByUserId: SEEDED_ADMIN }),
        ]),
      );
      expect(failed, 'the mutation could not be driven').toBeUndefined();
      expect(
        outcome,
        'case 7 was refused even with the chain-head condition removed — then advancing the head ' +
          'is not what case 7 is about',
      ).toBeNull();
      expect(await grantExists(`${GRANT_PREFIX}103`)).toBe(false);
    });

    it.todo(
      'MUTATION NOT AVAILABLE, REPORTED RATHER THAN FAKED — case 6 (a SYSTEM marker with a NULL ' +
        'actorId) survives deleting its own `marker_actor IS NULL` block, because the very next ' +
        'check (`grantedByUserId IS DISTINCT FROM marker_actor`) then refuses instead: ' +
        '`grantedByUserId` is NOT NULL, so it can never equal a NULL actor. So that block is ' +
        'load-bearing for the MESSAGE, not for the refusal — it is what makes the trail say "no ' +
        'actor" instead of "issuer mismatch". It becomes load-bearing for the refusal the moment ' +
        '`grantedByUserId` is ever made nullable. Case 6 above still asserts the refusal AND the ' +
        'wording, which is the most that can honestly be claimed for it.',
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // WHAT IS STILL OPEN
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it.todo(
    'PRODUCT DECISION PO-1 (2026-07-28, "remove the SYSTEM branch") — **DELIVERED in S2 round 5** by ' +
      'migration 00000000000009_e2_close_system_marker, after the two findings that blocked it in ' +
      'round 4 were addressed rather than argued away: (1) "it closes nothing, the authority disjunct ' +
      'is CYCLE-satisfiable" — migration 7 closed the cycle first (authority must PREDATE the act it ' +
      'authorises), so the removal is now meaningful instead of cosmetic (case 10b); (2) "it bricks ' +
      '`pnpm db:seed`" — the circularity is IRREDUCIBLE (authority cannot authorise its own first ' +
      'instance), so bootstrap moved OUT of the guard and behind a PRIVILEGE: ' +
      '`withAccessMatrixBootstrap()` suspends admission and needs table ownership. Verified on a fresh ' +
      'database: migrate + seed succeed (133 audited writes), `user-admin-001` still issues on ' +
      'waqf-001 through activateGrant() and is still refused on waqf-002. Of the narrowings priced in ' +
      'round 4, (a) "first-ever seat on an endowment with no admin grant yet" and (b) a ' +
      '"deployment-pinned bootstrap identity" both stay rejected — (a) refuses the seed AND ' +
      'packages/api/test/setup.ts, and would leave every newly onboarded endowment with an open ' +
      'window; (b) is forgeable, so it buys nothing. ROUTE 2 survived the removal and was closed in ' +
      'ADR-0008 round 6 by PRIVILEGE SEPARATION instead — see the deleted §11 marker below.',
  );

  it.todo(
    'CLOSED IN ADR-0008 ROUND 6 — both residuals this it.todo used to describe, and the wording is ' +
      'kept deliberately narrow. (i) ROUTE 2 (a forged `USER` marker naming `user-admin-001`): the ' +
      'runtime role holds no INSERT on `waqf_access_grant`, so the chain is refused by PRIVILEGE — ' +
      'measured end to end in authorization-plane-privilege.integration.test.ts §2, whose mutation ' +
      're-grants INSERT and finds migration 11’s RLS latch still refusing. (ii) DDL: the runtime role ' +
      'owns no table, so `ALTER TABLE … DISABLE TRIGGER`, `DROP TRIGGER`, `ALTER TABLE … DROP ' +
      'CONSTRAINT`, `CREATE OR REPLACE FUNCTION` and `SET session_replication_role` are ALL refused ' +
      'with 42501 — measured as `qmulate_app` in §3 of the same file. WHAT IS **NOT** CLOSED: whoever ' +
      'holds ACCESS_MATRIX_DATABASE_URL can still forge route 2 (pinned as a passing attack in §6c), ' +
      'and whether a DEPLOYED service holds only the least-privilege credential is a deployment fact ' +
      'no test can assert — `assertNoPrivilegedDatabaseUrls()` at each app boot is the closest ' +
      'control. DATA_CLASSIFICATION stays `fixture-only` until the product owner answers ADR-0008’s ' +
      'round-6 open questions.',
  );
});
