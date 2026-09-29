// QMULATE — S4/E3: THE ADR-0009 DELTA, PROVEN AGAINST POSTGRES RATHER THAN READ OUT OF A FILE.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY THIS FILE IS NOT A DUPLICATE OF THE PARITY TEST OR OF THE SEED TEST
// ═══════════════════════════════════════════════════════════════════════════════════════════
// `packages/domain`'s `prisma-vocabulary-parity.test.ts` reads `schema.prisma` AS TEXT. That is the
// right test for "the engine's vocabulary and the schema agree", and it is worth nothing as evidence
// that the DATABASE has the enum: a schema file can name a value that no migration ever added, which
// is precisely the state ADR-0009 left the repo in for two sprints.
//
// `seed.integration.test.ts` asserts the fixture's ROWS. Also necessary, also silent about the
// things a row cannot show:
//
//   ·  that `EntitlementOrder.LINEAGE_CONTINUATION` can be WRITTEN and read back — no fixture
//      endowment uses it (the domain agent reported this: the seeded database still cannot reproduce
//      a single run on the order ADR-0009 R4 calls NORMAL);
//   ·  that omitting `continuationStipulation` yields NULL rather than quietly becoming a value, and
//      that omitting `reversionClauseCaptured` or `active` is REFUSED — the fail-safe direction for
//      binding rule 6, which no default may be added to later without turning this file red;
//   ·  that the مآل clause ROUND-TRIPS, including the ABSENT case, and that its three legitimate
//      capture states are distinguishable while the fourth is unrepresentable;
//   ·  that vital status is readable ALONG AN ANCESTOR WALK with a LIVING ancestor in the middle.
//      ⚠ The fixture's only chain (ben-005 → ben-010) has a DEAD ancestor, so the seeded data can
//      only ever exercise the case that RELEASES money. The case that WITHHOLDS it
//      (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`) has no fixture subject at all, and it is the one a
//      beneficiary disputes.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// EVERY ROW THIS FILE CREATES IS ROLLED BACK
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The tables involved are guarded (`waqf_no_delete`, `beneficiary_no_delete`, and
// `waqf_reversion_taker` is write-once), so a committed test row could not be taken away again — and
// a `waqf` row that reached `db:seed`'s provenance scan or `seed.integration.test.ts`'s exact row
// counts would turn a sibling suite red for reasons unconnected to it. So the constructed endowment
// lives inside a Prisma interactive transaction that always throws: values are read back INSIDE the
// transaction and asserted after it has rolled back.
//
// ⚠ AND ONE MEASURED CONSEQUENCE OF WRITE-ONCE, RECORDED HERE BECAUSE IT COST A DATABASE. `db:seed`
// is NOT a recovery path for these columns. Its `waqf` upsert carries the deed terms on the CREATE
// branch only — deliberately, because a re-run restating one would be refused with 42501 — so a term
// that has been cleared (by a broken guard, or by a migration) stays NULL for ever and only a fresh
// database restores it. Measured during this sprint: a mutation probe that disabled tier 3 cleared
// `waqf-001.continuationStipulation`, and a full `db:seed` did not put it back.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  assertGuardsInstalled,
  closeDatabase,
  databaseModule,
  ensureSeeded,
  errorText,
  hasDatabase,
  privilegedPrisma,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('the S4/E3 lineage edge, the مآل clause round-trip and the ancestor walk');

/** Sentinel thrown to roll back a constructed-endowment transaction. Never a real failure. */
const ROLLBACK = 'QMULATE_E3_PROBE_ROLLBACK';

const FICTIONAL = '(بيانات وهمية)';

/** ids in the 9xxx series the harness reserves for test rows, so they can never collide. */
const T = {
  client: 'client-9101',
  waqif: 'waqif-9101',
  /** LINEAGE_CONTINUATION, no deed term recorded — the "nobody has read the deed" endowment. */
  waqfUnread: 'waqf-9101',
  /** The deed was read and records NO ultimate taker — the ABSENT case, positively stated. */
  waqfNoTaker: 'waqf-9102',
  /** A second endowment, used to prove a cross-endowment parent edge is unrepresentable. */
  waqfOther: 'waqf-9103',
} as const;

interface Rollback<T> {
  readonly result: T;
}

/**
 * Runs `body` inside a transaction that ALWAYS rolls back, and returns whatever it read.
 *
 * The value is captured in a closure before the throw, so an assertion can be made about data that
 * never existed outside one aborted transaction. A failure inside `body` propagates unchanged —
 * only the sentinel is swallowed.
 */
async function inRolledBackTx<T>(
  body: (tx: {
    $executeRawUnsafe: (sql: string) => Promise<number>;
    $queryRaw: unknown;
  }) => Promise<T>,
): Promise<Rollback<T>> {
  const prisma = await privilegedPrisma();
  let captured: T | undefined;
  let ran = false;
  try {
    await prisma.$transaction(async (tx: unknown) => {
      captured = await body(tx as never);
      ran = true;
      throw new Error(ROLLBACK);
    });
  } catch (error: unknown) {
    if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
  }
  if (!ran) throw new Error('the transaction body never completed');
  return { result: captured as T };
}

/** SQL for one constructed endowment. Every legally-significant date is dual, per convention 2. */
function insertEndowmentSql(options: {
  id: string;
  order: string;
  captured: boolean;
  continuation?: string | null;
  /** Omit the column entirely — the "is there a default?" probe. */
  omitContinuation?: boolean;
  omitCaptured?: boolean;
}): string {
  const {
    id,
    order,
    captured,
    continuation = null,
    omitContinuation = false,
    omitCaptured = false,
  } = options;
  const columns = [
    '"id"',
    '"waqifId"',
    '"certificateNumber"',
    '"deedNumber"',
    '"classification"',
    '"type"',
    '"nature"',
    '"entitlementOrder"',
    '"shartAlWaqif"',
    '"shartAlWaqifVersion"',
    '"shartAlWaqifSetAt"',
    '"shartAlWaqifSetAtHijri"',
    '"fiscalYearEnd"',
    '"registrationDate"',
    '"registrationDateHijri"',
    '"createdAt"',
    '"updatedAt"',
  ];
  const values = [
    `'${id}'`,
    `'${T.waqif}'`,
    `'FAKE-${id}'`,
    `'FAKE-D-${id}'`,
    `'MEDIUM'::"WaqfClassification"`,
    `'FAMILY_DHURRI'::"WaqfType"`,
    `'AYNI'::"WaqfNature"`,
    `'${order}'::"EntitlementOrder"`,
    `'{"note":"S4/E3 probe ${FICTIONAL}"}'::jsonb`,
    '1',
    `'2026-01-01'::timestamp`,
    `'1447-07-12'`,
    `'12-31'`,
    `'2026-01-01'::timestamp`,
    `'1447-07-12'`,
    'now()',
    'now()',
  ];
  if (!omitCaptured) {
    columns.push('"reversionClauseCaptured"');
    values.push(captured ? 'true' : 'false');
    // ⚠ THE READING'S DATE TRAVELS WITH THE FLAG (S4/E3 round 2, AV-1). CHECK
    // `waqf_reversion_recorded_at_pairs_with_capture` makes `captured = true, dates NULL`
    // unrepresentable on INSERT as well as on UPDATE — which is the point, since no trigger on
    // `waqf` sees an INSERT — so a constructed endowment that claims its clause was read must say
    // when. Invented, like every other value in this helper.
    if (captured) {
      columns.push('"reversionRecordedAt"', '"reversionRecordedAtHijri"');
      values.push(`'2026-02-01'::timestamp`, `'1447-08-13'`);
    }
  }
  if (!omitContinuation) {
    columns.push('"continuationStipulation"');
    values.push(continuation === null ? 'NULL' : `'${continuation}'::"ContinuationStipulation"`);
  }
  return `INSERT INTO "waqf" (${columns.join(',')}) VALUES (${values.join(',')})`;
}

/** SQL for one constructed beneficiary. `active` is always stated — the column has no default. */
function insertBeneficiarySql(options: {
  id: string;
  waqfId: string;
  parentId: string | null;
  link: 'SON' | 'DAUGHTER';
  tabaqa: number;
  active: boolean;
  kind?: string;
  /** Omit `active` entirely — the "is there a default?" probe. */
  omitActive?: boolean;
}): string {
  const {
    id,
    waqfId,
    parentId,
    link,
    tabaqa,
    active,
    kind = 'FAMILY',
    omitActive = false,
  } = options;
  const columns = [
    '"id"',
    '"waqfId"',
    '"branch"',
    '"relationshipAr"',
    '"kind"',
    '"line"',
    '"tabaqa"',
    '"parentId"',
    '"lineageLink"',
    '"verificationStatus"',
    '"createdAt"',
    '"updatedAt"',
  ];
  const values = [
    `'${id}'`,
    `'Branch probe'`,
    // placeholder, replaced below — keeps the two arrays aligned by construction
  ];
  values.length = 0;
  values.push(
    `'${id}'`,
    `'${waqfId}'`,
    `'Branch probe ${FICTIONAL}'`,
    `'ابن وهمي ${FICTIONAL}'`,
    `'${kind}'::"BeneficiaryKind"`,
    `'${link === 'SON' ? 'ZUHUR' : 'BUTUN'}'::"BeneficiaryLine"`,
    String(tabaqa),
    parentId === null ? 'NULL' : `'${parentId}'`,
    `'${link}'::"LineageLink"`,
    `'VERIFIED'::"VerificationStatus"`,
    'now()',
    'now()',
  );
  if (!omitActive) {
    columns.push('"active"');
    values.push(active ? 'true' : 'false');
  }
  return `INSERT INTO "beneficiary" (${columns.join(',')}) VALUES (${values.join(',')})`;
}

const insertClientSql = `INSERT INTO "client" ("id","nameAr","createdAt","updatedAt")
   VALUES ('${T.client}','عميل وهمي ${FICTIONAL}',now(),now())`;
const insertWaqifSql = `INSERT INTO "waqif" ("id","clientId","nameAr","createdAt","updatedAt")
   VALUES ('${T.waqif}','${T.client}','واقف وهمي ${FICTIONAL}',now(),now())`;

describe.skipIf(!hasDatabase)('S4/E3 · the ADR-0009 delta, measured in the database', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 1. THE VOCABULARY IS IN POSTGRES, AND IT IS USABLE
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the four enums migration 12 landed', () => {
    it('holds LINEAGE_CONTINUATION beside the original three, in declaration order', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<{ typname: string; enumlabel: string }[]>(
        `SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
          WHERE t.typname IN ('EntitlementOrder','ContinuationStipulation','LineageLink',
                              'ReversionKind','WaqfType','BeneficiaryKind')
          ORDER BY t.typname, e.enumsortorder`,
      );
      const members = (name: string): string[] =>
        rows.filter((row) => row.typname === name).map((row) => row.enumlabel);

      expect(members('EntitlementOrder')).toEqual([
        'ORDERED',
        'SHARED',
        'NA_DIRECT_USE',
        // Appended, so every existing row keeps its value — an additive change with no data
        // migration, which is why it could land in one migration at all.
        'LINEAGE_CONTINUATION',
      ]);
      // Closed two-value deed terms. A third member would be "unknown" masquerading as a value;
      // absence is what "unknown" means, and absence is a NULL.
      expect(members('ContinuationStipulation')).toEqual(['ZUHUR_ONLY', 'ZUHUR_AND_BUTUN']);
      expect(members('LineageLink')).toEqual(['SON', 'DAUGHTER']);
      expect(members('ReversionKind')).toEqual(['CHARITABLE_ULTIMATE_TAKER']);

      // ⚠ THE VOCABULARY WAS NOT NARROWED. The engine refuses the VALUE `JOINT`
      // (`WAQF_TYPE_JOINT_NOT_SUPPORTED`); removing it from the type would be a different decision,
      // owed to a later epic, and would silently rewrite the fixture's waqf-003.
      expect(members('WaqfType')).toContain('JOINT');
      // Three beneficiary kinds, still — R7 rejected a fourth (`ULTIMATE_TAKER`) precisely so no
      // second migration is owed here.
      expect(members('BeneficiaryKind')).toHaveLength(3);
    });

    it('accepts an endowment RECORDED as LINEAGE_CONTINUATION and reads it back', async () => {
      // ⚠ THE CLAIM `pg_enum` CANNOT MAKE. No fixture endowment uses this order, so until this test
      // existed nothing had ever written the value ADR-0009 R4 calls the NORMAL deed shape — and a
      // value present in the type but rejected by a CHECK, a trigger or a column gate would have
      // looked identical from the catalogue.
      const { result } = await inRolledBackTx(async (tx) => {
        await tx.$executeRawUnsafe(insertClientSql);
        await tx.$executeRawUnsafe(insertWaqifSql);
        await tx.$executeRawUnsafe(
          insertEndowmentSql({
            id: T.waqfUnread,
            order: 'LINEAGE_CONTINUATION',
            captured: false,
            continuation: 'ZUHUR_ONLY',
          }),
        );
        return (
          await (
            tx as unknown as { $queryRawUnsafe: <T>(sql: string) => Promise<T> }
          ).$queryRawUnsafe<{ entitlementOrder: string; continuationStipulation: string }[]>(
            `SELECT "entitlementOrder"::text AS "entitlementOrder",
                    "continuationStipulation"::text AS "continuationStipulation"
               FROM "waqf" WHERE "id" = '${T.waqfUnread}'`,
          )
        )[0];
      });
      expect(result?.entitlementOrder).toBe('LINEAGE_CONTINUATION');
      expect(result?.continuationStipulation).toBe('ZUHUR_ONLY');
    });

    it('left no trace of the constructed endowment — the transaction rolled back', async () => {
      const prisma = await privilegedPrisma();
      expect(await prisma.waqf.count({ where: { id: { startsWith: 'waqf-91' } } })).toBe(0);
      expect(await prisma.client.count({ where: { id: T.client } })).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 2. BINDING RULE 6 · NO DEFAULT, AND THE ABSENCE IS THE FAIL-SAFE DIRECTION
  //
  // "A defaulted continuation stipulation is code choosing which of the waqif's lines continue" —
  // which decides the head count, and therefore every share. "A defaulted reversion is a defaulted
  // answer to where this endowment goes when the family ends."
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the columns that may never acquire a default', () => {
    it('carries no column_default on ANY of the six, in the catalogue', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.$queryRawUnsafe<
        {
          table_name: string;
          column_name: string;
          column_default: string | null;
          is_nullable: string;
        }[]
      >(
        `SELECT table_name, column_name, column_default, is_nullable
           FROM information_schema.columns
          WHERE table_schema = 'public'
            AND ((table_name = 'waqf' AND column_name IN ('continuationStipulation',
                   'reversionClauseCaptured','reversionKind','reversionRecordedAt',
                   'reversionRecordedAtHijri'))
              OR (table_name = 'beneficiary' AND column_name IN ('parentId','lineageLink','active',
                   'stipulatedWeight')))
          ORDER BY table_name, column_name`,
      );
      expect(rows).toHaveLength(9);
      for (const row of rows) {
        expect(
          row.column_default,
          `${row.table_name}.${row.column_name} has acquired a DEFAULT (binding rule 6)`,
        ).toBeNull();
      }
      // The two REQUIRED ones are what force every insert to state the fact rather than inherit it.
      const required = rows.filter((row) => row.is_nullable === 'NO').map((row) => row.column_name);
      expect(required.sort()).toEqual(['active', 'reversionClauseCaptured']);
    });

    it('leaves continuationStipulation NULL when an INSERT omits it — never a value', async () => {
      const { result } = await inRolledBackTx(async (tx) => {
        await tx.$executeRawUnsafe(insertClientSql);
        await tx.$executeRawUnsafe(insertWaqifSql);
        await tx.$executeRawUnsafe(
          insertEndowmentSql({
            id: T.waqfUnread,
            order: 'LINEAGE_CONTINUATION',
            captured: false,
            omitContinuation: true,
          }),
        );
        return (
          await (
            tx as unknown as { $queryRawUnsafe: <T>(sql: string) => Promise<T> }
          ).$queryRawUnsafe<{ continuationStipulation: string | null }[]>(
            `SELECT "continuationStipulation"::text AS "continuationStipulation"
               FROM "waqf" WHERE "id" = '${T.waqfUnread}'`,
          )
        )[0];
      });
      // NULL is what makes the ENGINE halt (`SHART_INCOMPLETE` /
      // `CONTINUATION_STIPULATION_UNRECOGNISED`) rather than compute a cohort from a guess. There is
      // deliberately NO CHECK forcing the value on a LINEAGE_CONTINUATION deed: the database must
      // RECORD the incomplete deed so a Nazir can see the halt.
      expect(result?.continuationStipulation).toBeNull();
    });

    it('REFUSES an endowment that does not state whether the مآل clause has been read', async () => {
      // The whole reason the column exists. If it were nullable, NULL would be the state of every
      // row created before anyone read the deed — so "nobody has looked yet" would silently assert
      // "the deed records no ultimate taker" (R7-c), which is a claim about a founder's condition.
      const error = await inRolledBackTx(async (tx) => {
        await tx.$executeRawUnsafe(insertClientSql);
        await tx.$executeRawUnsafe(insertWaqifSql);
        return tx
          .$executeRawUnsafe(
            insertEndowmentSql({
              id: T.waqfUnread,
              order: 'LINEAGE_CONTINUATION',
              captured: false,
              omitCaptured: true,
            }),
          )
          .then(() => null)
          .catch((caught: unknown) => errorText(caught));
      });
      expect(
        error.result,
        'an endowment was created without stating its مآل capture state',
      ).not.toBeNull();
      expect(error.result).toMatch(/23502|null value in column "reversionClauseCaptured"/);
    });

    it('REFUSES a beneficiary that does not state its vital status', async () => {
      // `active` is the sole input to the ORDERED extinction test and one of three to R7-d's
      // continuing-line predicate. A default would be a defaulted VITAL STATUS — and an ANCESTOR's
      // value decides a whole branch's entitlement, so the wrong default pays the wrong branch.
      const error = await inRolledBackTx(async (tx) => {
        return tx
          .$executeRawUnsafe(
            insertBeneficiarySql({
              id: 'ben-9101',
              waqfId: 'waqf-001',
              parentId: null,
              link: 'SON',
              tabaqa: 1,
              active: true,
              omitActive: true,
            }),
          )
          .then(() => null)
          .catch((caught: unknown) => errorText(caught));
      });
      expect(error.result, 'a beneficiary was created with no vital status').not.toBeNull();
      expect(error.result).toMatch(/23502|null value in column "active"/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 3. مآل الوقف · THE CLAUSE ROUND-TRIPS, AND THE ABSENT CASE IS A POSITIVE STATEMENT
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the reversion clause · three states and no fourth', () => {
    it('round-trips the NAMED taker: capture, kind, dual date, and the join row', async () => {
      const { result } = await inRolledBackTx(async (tx) => {
        const query = (tx as unknown as { $queryRawUnsafe: <T>(sql: string) => Promise<T> })
          .$queryRawUnsafe;
        await tx.$executeRawUnsafe(insertClientSql);
        await tx.$executeRawUnsafe(insertWaqifSql);
        // Born UNREAD — which is the state every real endowment starts in.
        await tx.$executeRawUnsafe(
          insertEndowmentSql({ id: T.waqfUnread, order: 'LINEAGE_CONTINUATION', captured: false }),
        );
        const unread = (
          await query<{ captured: boolean; kind: string | null }[]>(
            `SELECT "reversionClauseCaptured" AS captured, "reversionKind"::text AS kind
               FROM "waqf" WHERE "id" = '${T.waqfUnread}'`,
          )
        )[0];

        // A charitable jiha on this endowment: no lineage edge, no ṭabaqa — it is not a descendant.
        await tx.$executeRawUnsafe(
          `INSERT INTO "beneficiary" ("id","waqfId","branch","relationshipAr","kind","line",
                                      "verificationStatus","active","stipulatedWeight",
                                      "createdAt","updatedAt")
             VALUES ('ben-9110','${T.waqfUnread}','Jiha ${FICTIONAL}','جهة خيرية ${FICTIONAL}',
                     'CHARITABLE_JIHA'::"BeneficiaryKind",'NA'::"BeneficiaryLine",
                     'VERIFIED'::"VerificationStatus",true,100,now(),now())`,
        );

        // Now the Nazir records the clause. `false -> true` plus `NULL -> value` on all three
        // write-once columns: the ONE permitted write.
        await tx.$executeRawUnsafe(
          `UPDATE "waqf" SET "reversionClauseCaptured" = true,
                             "reversionKind" = 'CHARITABLE_ULTIMATE_TAKER'::"ReversionKind",
                             "reversionRecordedAt" = '2026-08-13'::timestamp,
                             "reversionRecordedAtHijri" = '1448-02-20'
             WHERE "id" = '${T.waqfUnread}'`,
        );
        await tx.$executeRawUnsafe(
          `INSERT INTO "waqf_reversion_taker" ("id","waqfId","beneficiaryId","createdAt","createdBy")
             VALUES ('wrt-9101','${T.waqfUnread}','ben-9110',now(),'user-nazir-001')`,
        );

        const recorded = (
          await query<
            {
              captured: boolean;
              kind: string;
              at: Date;
              atHijri: string;
              takerId: string;
              takerKind: string;
              takerLineageLink: string | null;
              takerTabaqa: number | null;
              weight: string;
            }[]
          >(
            `SELECT w."reversionClauseCaptured" AS captured, w."reversionKind"::text AS kind,
                    w."reversionRecordedAt" AS at, w."reversionRecordedAtHijri" AS "atHijri",
                    b."id" AS "takerId", b."kind"::text AS "takerKind",
                    b."lineageLink"::text AS "takerLineageLink", b."tabaqa" AS "takerTabaqa",
                    b."stipulatedWeight"::text AS weight
               FROM "waqf" w
               JOIN "waqf_reversion_taker" t ON t."waqfId" = w."id"
               JOIN "beneficiary" b ON b."waqfId" = t."waqfId" AND b."id" = t."beneficiaryId"
              WHERE w."id" = '${T.waqfUnread}'`,
          )
        )[0];
        return { unread, recorded };
      });

      // The state every row starts in, and it is NOT "the deed names no taker".
      expect(result.unread?.captured).toBe(false);
      expect(result.unread?.kind).toBeNull();

      expect(result.recorded?.captured).toBe(true);
      expect(result.recorded?.kind).toBe('CHARITABLE_ULTIMATE_TAKER');
      // Dual-dated per schema convention 2: the frozen Hijri snapshot is the provenance of a
      // founder's condition and travels with it.
      expect(result.recorded?.at.toISOString().slice(0, 10)).toBe('2026-08-13');
      expect(result.recorded?.atHijri).toBe('1448-02-20');

      // The clause NAMES an id, at WAQF level, and the named row is a charity that is not a
      // descendant — no `lineageLink`, no `tabaqa`. Its share is its own recorded deed weight; per
      // capita is the bloodline's rule, never a charity's.
      expect(result.recorded?.takerId).toBe('ben-9110');
      expect(result.recorded?.takerKind).toBe('CHARITABLE_JIHA');
      expect(result.recorded?.takerLineageLink).toBeNull();
      expect(result.recorded?.takerTabaqa).toBeNull();
      expect(Number(result.recorded?.weight)).toBe(100);
    });

    it('round-trips the ABSENT case as a POSITIVE statement, distinguishable from the unread one', async () => {
      const { result } = await inRolledBackTx(async (tx) => {
        const query = (tx as unknown as { $queryRawUnsafe: <T>(sql: string) => Promise<T> })
          .$queryRawUnsafe;
        await tx.$executeRawUnsafe(insertClientSql);
        await tx.$executeRawUnsafe(insertWaqifSql);
        await tx.$executeRawUnsafe(
          insertEndowmentSql({ id: T.waqfUnread, order: 'LINEAGE_CONTINUATION', captured: false }),
        );
        // "The deed was read, and it names NO ultimate taker." Binding rule 1: an absent مآل is
        // never inferred, and it is never repaired.
        await tx.$executeRawUnsafe(
          insertEndowmentSql({ id: T.waqfNoTaker, order: 'LINEAGE_CONTINUATION', captured: true }),
        );
        return query<{ id: string; captured: boolean; kind: string | null; takers: bigint }[]>(
          `SELECT w."id", w."reversionClauseCaptured" AS captured, w."reversionKind"::text AS kind,
                  (SELECT count(*) FROM "waqf_reversion_taker" t WHERE t."waqfId" = w."id") AS takers
             FROM "waqf" w WHERE w."id" IN ('${T.waqfUnread}','${T.waqfNoTaker}') ORDER BY w."id"`,
        );
      });

      const [unread, noTaker] = result;
      // TWO ROWS THAT WOULD BE IDENTICAL UNDER ONE NULLABLE COLUMN. `reversionKind` is NULL on both;
      // only `reversionClauseCaptured` separates "nobody has read this deed" from "this deed names
      // no taker" — and the first must make the mapper REFUSE to build a run input, while the
      // second is a complete answer.
      expect(unread?.captured).toBe(false);
      expect(unread?.kind).toBeNull();
      expect(noTaker?.captured).toBe(true);
      expect(noTaker?.kind).toBeNull();
      expect(Number(noTaker?.takers)).toBe(0);
    });

    it('makes the FOURTH state — a kind recorded by nobody — unrepresentable', async () => {
      // ⚠ TWO OF THESE THREE CHANGED SQLSTATE IN S4/E3 ROUND 2, AND THE RULE DID NOT.
      // `waqf_reversion_recorded_at_pairs_with_kind` is GONE: it paired the recording dates with the
      // KIND, which meant a deed recording NO ultimate taker carried no date — and that is exactly
      // what left `reversionClauseCaptured` free to be flipped on its own (AV-1). The dates now pair
      // with the CAPTURE. Where the flag MOVES, tier 3a of `qmulate_shart_guard()` answers first with
      // a legible 42501; where it does not, a CHECK still answers with 23514. Each case therefore
      // declares the SQLSTATE it is measured to produce rather than assuming one.
      const cases: readonly {
        name: string;
        sql: (id: string) => string;
        sqlstate: RegExp;
        expect: RegExp;
      }[] = [
        {
          // The flag does NOT move here, so no trigger arm sees it and the CHECK is the answer.
          name: 'a kind with the clause not captured',
          sql: (id) =>
            `UPDATE "waqf" SET "reversionKind" = 'CHARITABLE_ULTIMATE_TAKER'::"ReversionKind",
                               "reversionRecordedAt" = now(), "reversionRecordedAtHijri" = '1448-01-01'
               WHERE "id" = '${id}'`,
          sqlstate: /23514/,
          expect: /waqf_reversion_kind_requires_capture/,
        },
        {
          // Was `waqf_reversion_recorded_at_pairs_with_kind` (23514). The flag moves false -> true
          // with no date at all, which is AV-1's own shape, so tier 3a refuses it with a sentence.
          name: 'a kind with no recording date',
          sql: (id) =>
            `UPDATE "waqf" SET "reversionClauseCaptured" = true,
                               "reversionKind" = 'CHARITABLE_ULTIMATE_TAKER'::"ReversionKind"
               WHERE "id" = '${id}'`,
          sqlstate: /42501/,
          expect: /IN THE SAME STATEMENT/,
        },
        {
          // Convention 2, unchanged as a rule; tier 3a now answers before
          // `waqf_reversion_recorded_dual_dated` does, for the same reason.
          name: 'half a dual date',
          sql: (id) =>
            `UPDATE "waqf" SET "reversionClauseCaptured" = true,
                               "reversionKind" = 'CHARITABLE_ULTIMATE_TAKER'::"ReversionKind",
                               "reversionRecordedAt" = now()
               WHERE "id" = '${id}'`,
          sqlstate: /42501/,
          expect: /reversionRecordedAtHijri/,
        },
        {
          // ⊕ THE FIFTH STATE, WHICH ONLY BECAME EXPRESSIBLE WHEN THE DATES STOPPED PAIRING WITH THE
          // KIND: a reading DATE with no reading. Provenance for an act nobody recorded.
          name: 'a recording date with the clause not captured',
          sql: (id) =>
            `UPDATE "waqf" SET "reversionRecordedAt" = now(),
                               "reversionRecordedAtHijri" = '1448-01-01'
               WHERE "id" = '${id}'`,
          sqlstate: /23514/,
          expect: /waqf_reversion_recorded_at_pairs_with_capture/,
        },
      ];

      for (const testCase of cases) {
        const { result } = await inRolledBackTx(async (tx) => {
          await tx.$executeRawUnsafe(insertClientSql);
          await tx.$executeRawUnsafe(insertWaqifSql);
          await tx.$executeRawUnsafe(
            insertEndowmentSql({
              id: T.waqfUnread,
              order: 'LINEAGE_CONTINUATION',
              captured: false,
            }),
          );
          return tx
            .$executeRawUnsafe(testCase.sql(T.waqfUnread))
            .then(() => null)
            .catch((caught: unknown) => errorText(caught));
        });
        expect(result, `${testCase.name} was accepted`).not.toBeNull();
        expect(result).toMatch(testCase.sqlstate);
        expect(result).toMatch(testCase.expect);
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 4. THE LINEAGE EDGE · WHAT IS STRUCTURAL RATHER THAN MERELY REFUSED
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('the lineage edge · the mechanical guarantees', () => {
    it('makes a CROSS-ENDOWMENT parent edge unrepresentable, via the composite FK', async () => {
      // This is the structural half of the engine's `LINEAGE_PARENT_UNKNOWN`, and it is the reason
      // the FK is `(waqfId, parentId) -> (waqfId, id)` rather than `parentId -> id`. A single-column
      // FK would happily accept a parent belonging to another family's endowment.
      const { result } = await inRolledBackTx(async (tx) =>
        tx
          .$executeRawUnsafe(
            insertBeneficiarySql({
              id: 'ben-9120',
              waqfId: 'waqf-001',
              // ben-004 exists — on waqf-002.
              parentId: 'ben-004',
              link: 'SON',
              tabaqa: 2,
              active: true,
            }),
          )
          .then(() => null)
          .catch((caught: unknown) => errorText(caught)),
      );
      expect(result, 'a beneficiary on waqf-001 took a parent on waqf-002').not.toBeNull();
      expect(result).toMatch(/23503|beneficiary_waqfId_parentId_fkey/);
    });

    it('refuses a SELF-PARENT — the one cycle a row CHECK can see', async () => {
      const { result } = await inRolledBackTx(async (tx) =>
        tx
          .$executeRawUnsafe(
            `INSERT INTO "beneficiary" ("id","waqfId","branch","relationshipAr","kind","line",
                                        "tabaqa","parentId","lineageLink","verificationStatus",
                                        "active","createdAt","updatedAt")
               VALUES ('ben-9121','waqf-001','Branch ${FICTIONAL}','ابن ${FICTIONAL}',
                       'FAMILY'::"BeneficiaryKind",'ZUHUR'::"BeneficiaryLine",2,'ben-9121',
                       'SON'::"LineageLink",'VERIFIED'::"VerificationStatus",true,now(),now())`,
          )
          .then(() => null)
          .catch((caught: unknown) => errorText(caught)),
      );
      expect(result).not.toBeNull();
      expect(result).toMatch(/23514|beneficiary_no_self_parent/);
    });

    it('refuses a row that is both ACTIVE and certified DEAD', async () => {
      // R7-D1 turns on exactly this distinction: `active: false` may be a SCOPE EXIT, and only
      // `deceasedAt` certifies a death. A row asserting both would let a placeholder's scope exit
      // certify that a family died out — which is what decides whether a charity takes the pool.
      const { result } = await inRolledBackTx(async (tx) =>
        tx
          .$executeRawUnsafe(
            `UPDATE "beneficiary" SET "deceasedAt" = now(), "deceasedAtHijri" = '1448-01-01'
               WHERE "id" = 'ben-001'`,
          )
          .then(() => null)
          .catch((caught: unknown) => errorText(caught)),
      );
      expect(result, 'a living beneficiary was given a date of death').not.toBeNull();
      expect(result).toMatch(/23514|beneficiary_active_not_deceased/);
    });

    it('refuses half a death date — the frozen Hijri twin is not optional', async () => {
      const { result } = await inRolledBackTx(async (tx) =>
        tx
          .$executeRawUnsafe(
            `UPDATE "beneficiary" SET "active" = false, "deceasedAt" = now() WHERE "id" = 'ben-001'`,
          )
          .then(() => null)
          .catch((caught: unknown) => errorText(caught)),
      );
      expect(result).not.toBeNull();
      expect(result).toMatch(/23514|beneficiary_deceased_dual_dated/);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // 5. THE ANCESTOR WALK · VITAL STATUS READ ALONG A CHAIN, WITH A LIVING ANCESTOR IN IT
  //
  // R-FRONTIER (product owner, 2026-08-03): entitlement sits at the NEAREST LIVING POINT on each
  // line, so a member is entitled only if EVERY ancestor strictly between them and the waqif is
  // deceased. A living ancestor HOLDS the entitlement and their descendants WAIT
  // (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` — temporary, and it reverses on that ancestor's death).
  //
  // ⚠ THE SEEDED FIXTURE CANNOT EXERCISE THE WITHHOLDING CASE. Its one chain is ben-005 → ben-010,
  // and ben-010 is DEAD — so the seeded data only ever shows the frontier RELEASING money. The
  // constructed tree below is three generations deep with everyone alive, which is the shape that
  // withholds it, and the shape a beneficiary disputes.
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('qmulate_beneficiary_ancestry · the only authority on entitlement', () => {
    /**
     * ```
     *  waqif
     *   ├─ g1 (alive, ṭabaqa 1)            ← the frontier of this line
     *   │   └─ g2 (alive, 2)
     *   │       └─ g3 (alive, 3)           ← held: TWO living ancestors above
     *   └─ h1 (DEAD, 1)
     *       └─ h2 (alive, 2)               ← entitled: its only ancestor is deceased
     * ```
     */
    async function withConstructedTree<T>(read: (tx: never) => Promise<T>): Promise<T> {
      const { result } = await inRolledBackTx(async (tx) => {
        await tx.$executeRawUnsafe(insertClientSql);
        await tx.$executeRawUnsafe(insertWaqifSql);
        await tx.$executeRawUnsafe(
          insertEndowmentSql({
            id: T.waqfUnread,
            order: 'LINEAGE_CONTINUATION',
            captured: false,
            continuation: 'ZUHUR_AND_BUTUN',
          }),
        );
        await tx.$executeRawUnsafe(
          insertEndowmentSql({ id: T.waqfOther, order: 'SHARED', captured: false }),
        );

        const rows: readonly [string, string | null, 'SON' | 'DAUGHTER', number, boolean][] = [
          ['ben-9130', null, 'SON', 1, true],
          ['ben-9131', 'ben-9130', 'SON', 2, true],
          ['ben-9132', 'ben-9131', 'SON', 3, true],
          ['ben-9133', null, 'DAUGHTER', 1, false],
          ['ben-9134', 'ben-9133', 'SON', 2, true],
        ];
        for (const [id, parentId, link, tabaqa, active] of rows) {
          await tx.$executeRawUnsafe(
            insertBeneficiarySql({ id, waqfId: T.waqfUnread, parentId, link, tabaqa, active }),
          );
        }
        // ben-9133 is deceased, so it needs the certification pair (the CHECK above insists).
        await tx.$executeRawUnsafe(
          `UPDATE "beneficiary" SET "deceasedAt" = '2020-05-05'::timestamp,
                                    "deceasedAtHijri" = '1441-09-12'
             WHERE "id" = 'ben-9133'`,
        );
        // One member on the OTHER endowment, to prove the walk is scoped by its argument.
        await tx.$executeRawUnsafe(
          insertBeneficiarySql({
            id: 'ben-9140',
            waqfId: T.waqfOther,
            parentId: null,
            link: 'SON',
            tabaqa: 1,
            active: true,
          }),
        );
        return read(tx as never);
      });
      return result;
    }

    it('returns EVERY ancestor with its vital status, nearest first', async () => {
      const { readBeneficiaryAncestry, ancestryByBeneficiary } = await databaseModule();
      const chains = await withConstructedTree(async (tx) => {
        const rows = await readBeneficiaryAncestry(tx as never, T.waqfUnread);
        return [...ancestryByBeneficiary(rows).entries()].map(([id, chain]) => [
          id,
          chain.map((row) => ({
            ancestorId: row.ancestorId,
            depth: row.depth,
            ancestorActive: row.ancestorActive,
            ancestorLineageLink: row.ancestorLineageLink,
          })),
        ]) as [string, unknown[]][];
      });
      const byBeneficiary = new Map(chains);

      // THE WITHHOLDING CASE, which the fixture cannot show: ben-9132's chain carries TWO LIVING
      // ancestors, so the frontier of this line is ben-9130 and ben-9132 waits. `depth` is 1 for the
      // direct parent and increases towards the waqif, so the caller reads the frontier off the
      // FIRST living row rather than having to sort.
      expect(byBeneficiary.get('ben-9132')).toEqual([
        { ancestorId: 'ben-9131', depth: 1, ancestorActive: true, ancestorLineageLink: 'SON' },
        { ancestorId: 'ben-9130', depth: 2, ancestorActive: true, ancestorLineageLink: 'SON' },
      ]);
      expect(byBeneficiary.get('ben-9131')).toEqual([
        { ancestorId: 'ben-9130', depth: 1, ancestorActive: true, ancestorLineageLink: 'SON' },
      ]);

      // THE RELEASING CASE: ben-9134's only ancestor is deceased, so it IS the living frontier of
      // its line. ⚠ `ancestorLineageLink` is returned because the ZUHUR_ONLY intermediate-ancestor
      // test needs it — a DAUGHTER link on an intermediate ancestor is what breaks a line under
      // that stipulation. It is an ELIGIBILITY FACT and must never be rendered as a person's gender.
      expect(byBeneficiary.get('ben-9134')).toEqual([
        {
          ancestorId: 'ben-9133',
          depth: 1,
          ancestorActive: false,
          ancestorLineageLink: 'DAUGHTER',
        },
      ]);

      // A child of the waqif produces NO rows, and that is a MEANINGFUL answer: no ancestor strictly
      // between them and the waqif is exactly what makes them entitled. An empty chain is never a
      // missing one.
      expect(byBeneficiary.has('ben-9130')).toBe(false);
      expect(byBeneficiary.has('ben-9133')).toBe(false);
    });

    it('is scoped by its ARGUMENT, because raw SQL never reaches the force filter', async () => {
      const { readBeneficiaryAncestry } = await databaseModule();
      const [mine, other] = await withConstructedTree(async (tx) => [
        await readBeneficiaryAncestry(tx as never, T.waqfUnread),
        await readBeneficiaryAncestry(tx as never, T.waqfOther),
      ]);
      expect(mine.every((row) => row.waqfId === T.waqfUnread)).toBe(true);
      // The other endowment's one member is a child of its waqif, so its walk is empty — and no row
      // from the first endowment leaks into it.
      expect(other).toEqual([]);
      expect(mine.some((row) => row.ancestorId === 'ben-9140')).toBe(false);
    });

    it('breaks a two-row CYCLE instead of recursing for ever', async () => {
      // The composite FK and `beneficiary_no_self_parent` make a ONE-row cycle impossible; A → B → A
      // across two rows is perfectly representable. Without the path-array break this query would
      // hold a connection open until something killed it, so the valve is what turns malformed DATA
      // into a truncated result — and the ENGINE still refuses such a graph (`LINEAGE_CYCLE`), which
      // is where the refusal belongs.
      const { readBeneficiaryAncestry } = await databaseModule();
      const rows = await withConstructedTree(async (tx) => {
        // ben-9130 (a root) is re-pointed at its own grandchild.
        await (
          tx as unknown as { $executeRawUnsafe: (sql: string) => Promise<number> }
        ).$executeRawUnsafe(
          `UPDATE "beneficiary" SET "parentId" = 'ben-9132' WHERE "id" = 'ben-9130'`,
        );
        return readBeneficiaryAncestry(tx as never, T.waqfUnread, 8);
      });
      // It TERMINATES, which is the assertion. Every chain is bounded by the cap, and no chain
      // revisits an id it already holds.
      expect(rows.length).toBeGreaterThan(0);
      expect(Math.max(...rows.map((row) => row.depth))).toBeLessThanOrEqual(8);
      const byBeneficiary = new Map<string, string[]>();
      for (const row of rows) {
        const seen = byBeneficiary.get(row.beneficiaryId) ?? [];
        expect(seen, `${row.beneficiaryId} revisits ${row.ancestorId}`).not.toContain(
          row.ancestorId,
        );
        seen.push(row.ancestorId);
        byBeneficiary.set(row.beneficiaryId, seen);
      }
    });

    it('refuses to run without a named endowment, and refuses a nonsense depth', async () => {
      const { readBeneficiaryAncestry } = await databaseModule();
      const prisma = await privilegedPrisma();
      await expect(readBeneficiaryAncestry(prisma, '')).rejects.toThrow(/waqfId is required/);
      await expect(readBeneficiaryAncestry(prisma, '   ')).rejects.toThrow(/may not be blank/);
      await expect(readBeneficiaryAncestry(prisma, 'waqf-001', 0)).rejects.toThrow(
        /positive integer/,
      );
    });

    it('persists NO exclusion verdict anywhere — the walk is recomputed, never cached', async () => {
      // ⚠ THE PROHIBITION, RE-ASSERTED FROM THE OTHER SIDE. `seed.integration.test.ts` scans for a
      // column whose NAME looks like a cached verdict; this adds the two shapes a name scan cannot
      // see: a VIEW over the walk, and a function that stores one. `ENTITLEMENT_HELD_BY_LIVING_
      // ANCESTOR` is temporary, so anything durable keeps paying the wrong branch after a death.
      const prisma = await privilegedPrisma();
      const views = await prisma.$queryRawUnsafe<{ viewname: string }[]>(
        `SELECT viewname FROM pg_views WHERE schemaname = 'public'`,
      );
      expect(views).toEqual([]);

      const [ancestry] = await prisma.$queryRawUnsafe<{ provolatile: string; prokind: string }[]>(
        `SELECT provolatile, prokind FROM pg_proc WHERE proname = 'qmulate_beneficiary_ancestry'`,
      );
      // STABLE, and a plain function rather than a materialised anything: it reads the register as
      // it is now, within one statement, and keeps nothing.
      expect(ancestry?.provolatile).toBe('s');
      expect(ancestry?.prokind).toBe('f');
    });
  });
});
