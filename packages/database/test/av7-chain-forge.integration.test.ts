/**
 * AV7 — FORGING THE AUDIT SPINE FROM THE LEAST-PRIVILEGED ROLE.
 *
 * ⚠ THIS FILE WAS AN ADVERSARY PROBE AND IS NOW THE REGRESSION SUITE FOR MIGRATION 23. Three of
 * its five tests were GREEN as attacks and are now INVERTED: they assert the REFUSAL, quoting the
 * guard's own sentence. Nothing was deleted — the exploit's shape IS the regression test — and the
 * one attack that STILL SUCCEEDS is still here, still green, labelled as the residual it is.
 *
 * ── WHAT WAS BROKEN (AV7-AUD-F1, HIGH) ──────────────────────────────────────────────────────────
 * `audit_event` was append-only (migration 1 §1a) but NOTHING looked at an INSERT. `prevHash` and
 * `rowHash` were whatever the client said, so on `qmulate_app` — the RUNTIME credential, the role a
 * compromised web process holds — this file measured:
 *
 *     AV7/CONTROL rows=176 verify={"ok":true,"checked":176}
 *     AV7/ATTACK-A forged id=177 actorId=user-nazir-001 rowHash=27491f98… verify={"ok":true,"checked":177}
 *     AV7/ATTACK-B forward => ACCEPTED {"lastId":"1176","lastRowHash":"aaaa…aaaa"}
 *     AV7/ATTACK-C garbage-hash INSERT ACCEPTED (prevHash='f'×64, rowHash='0'×64)
 *
 * ── WHAT MIGRATION 23 CHANGED ───────────────────────────────────────────────────────────────────
 * `audit_event_chain_bound` (BEFORE INSERT, `ENABLE ALWAYS`) recomputes both hash columns
 * SERVER-SIDE and refuses a mismatch, and refuses any append that does not hold
 * `pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_KEY)`. `qmulate_audit_chain_head_forward_only` gained the
 * clause that `lastRowHash` must be the `rowHash` OF `lastId` (AV7-AUD-F2).
 *
 * ── ⚠ AND WHAT IT DID NOT CHANGE, WHICH IS THE HALF THAT MATTERS ────────────────────────────────
 * **A COHERENT LIE IS STILL APPENDABLE.** ATTACK A′ below computes the hashes the server itself
 * would compute and commits a fabricated `APPROVE` naming a real Nazir. It is GREEN BY DESIGN. Any
 * role that may append may append a falsehood, and the runtime role must hold INSERT or the trail
 * could not be written at all. What migration 23 removes is the freedom to append an INCOHERENT
 * row; the remaining exposure is closed only by (a) no route reaching raw INSERT and (b) an
 * OFF-BOX ANCHOR of the chain head, which DOES NOT EXIST YET (owed to E10). Do not read a green
 * run of this file as "the audit spine cannot be forged".
 *
 * ── THE TWO RULES THIS FILE OBEYS ───────────────────────────────────────────────────────────────
 * 1. A refusal is only evidence when it carries THE GUARD'S OWN MESSAGE. Every negative below
 *    asserts a substring of the raising trigger's text, never an exit status. ⚠ AND EVERY
 *    HASH-COLUMN ATTACK TAKES THE ADVISORY LOCK FIRST, deliberately: without it the refusal comes
 *    from the PROTOCOL check and says nothing about the hash columns. That exact false negative
 *    happened while this inversion was being written — the first run of the inverted ATTACK C
 *    "passed" on the lock message, proving nothing about the guard under test.
 * 2. Every negative has a POSITIVE CONTROL. Here there are three, and they are what distinguishes
 *    "the chain is bound" from "the table refuses everything": the real spine still appends
 *    (the append protocol, replayed with the SHIPPED hash functions), the head still advances, and
 *    every row already committed reproduces its stored hash through the SQL path — 176 of 176 on a
 *    `--reset` -> `migrate deploy` -> `db:seed` cluster, measured 2026-08-19 on port 54423.
 * 3. ⚠ NOTHING HERE COMMITS. Two of the inverted tests originally used `recordEvent`, which opens
 *    its own transaction and therefore cannot be rolled back; the three events they left behind
 *    turned `seed.integration.test.ts`'s E1-4 RED (`expected 6 to be +0`). No file in this
 *    package's integration suite may leave a committed audit event behind.
 *
 * Ids are taken as `max(id)+1` rather than from `nextval`, because a sequence is not transactional
 * and burning an id would leave a permanent gap.
 *
 * ── THE COST OF THE GUARD, MEASURED RATHER THAN ASSUMED ─────────────────────────────────────────
 * 400 appends in one transaction, embedded PostgreSQL 17.10, this laptop, port 54423:
 * **92.1 ms with `audit_event_chain_bound` armed, 44.0 ms with it suspended** — i.e. ~0.12 ms per
 * appended event for a second canonicalisation + hash, the `pg_locks` scan and the predecessor
 * lookup. ⚠ THE `pg_locks` SCAN IS PER **ROW**, not per transaction, so a transaction recording N
 * events pays it N times; the migration's "one index lookup per audited transaction" line is about
 * §6's head clause only. At this size it is noise, and it is written down so it is not re-derived
 * from the sentence rather than from a clock.
 */

import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import { hasDatabase, warnNoDatabase } from './setup.js';
import {
  AUDIT_CHAIN_LOCK_KEY,
  buildAuditPayload,
  canonicalJson,
  computeHash,
  GENESIS_HASH,
  verifyChain,
  type AuditHashRow,
} from '../src/hash-chain.js';

warnNoDatabase('AV7 chain-forgery probe (G-1 / NFR-04)');

type ChainRow = AuditHashRow & { prevHash: string; rowHash: string };

/** ⚠ `ORDER BY "audit_event"."id"` is QUALIFIED on purpose: a bare `"id"` binds to the `text` output
 *  column and sorts 10 before 2, which reads exactly like a broken chain at row 10. */
const CHAIN_SQL = `
  SELECT "id"::text AS "id", "occurredAt", "actorId", "actorType"::text AS "actorType",
         "onBehalfOfId", "action"::text AS "action", "entityType", "entityId", "waqfId",
         "before", "after", "context", "category"::text AS "category",
         "classification"::text AS "classification", "prevHash", "rowHash"
    FROM "audit_event"
   ORDER BY "audit_event"."id" ASC
`;

/**
 * The known-answer vector migration 23 §7 embeds. Declared HERE, in TypeScript, because the
 * TypeScript implementation is the authority: §7's constant was produced from this object and this
 * suite recomputes both sides, so the constant cannot rot silently in either direction.
 */
const KAT_ROW = {
  id: BigInt('123456789'),
  occurredAt: new Date('2026-08-19T04:05:06.789Z'),
  actorId: 'user-nazir-001',
  actorType: 'USER',
  onBehalfOfId: null,
  action: 'APPROVE',
  entityType: 'ApprovalRequest',
  entityId: 'kat-entity-"quoted"\\backslash',
  waqfId: 'waqf-001',
  before: null,
  after: { z: 'last', a: { nested: ['one', 'two'], flag: true }, empty: {}, list: [] },
  context: { requestId: 'kat', reasonAr: 'سبب الاختبار', multi: 'line1\nline2', nil: null },
  category: 'APPROVAL',
  classification: 'ROUTINE',
} satisfies AuditHashRow;

/** The constant migration 23 §7 refuses to install without. */
const KAT_HASH_IN_MIGRATION = 'f018c7efbeedb6cfda8c8d40f051bfd70d0eab4311873ee043019b869b1894e5';

/** A connection as the RUNTIME role, taken from `DATABASE_URL` so it can never silently be the owner. */
async function runtimeClient(): Promise<pg.Client> {
  const url = process.env['DATABASE_URL'];
  if (url === undefined) throw new Error('DATABASE_URL is required');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const who = await client.query<{ user: string }>('SELECT current_user AS "user"');
  if (who.rows[0]?.user !== 'qmulate_app') {
    throw new Error(
      `AV7 refuses to run: DATABASE_URL connects as ${String(who.rows[0]?.user)}, not qmulate_app. ` +
        'An attack proven as the table owner proves nothing about the runtime.',
    );
  }
  return client;
}

async function chainOf(client: pg.Client): Promise<ChainRow[]> {
  const { rows } = await client.query<ChainRow>(CHAIN_SQL);
  return rows;
}

function headOf(client: pg.Client): Promise<{ lastId: string; lastRowHash: string } | undefined> {
  return client
    .query<{ lastId: string; lastRowHash: string }>(
      'SELECT "lastId"::text AS "lastId", "lastRowHash" FROM "audit_chain_head"',
    )
    .then((result) => result.rows[0]);
}

const clients: pg.Client[] = [];

async function attackClient(): Promise<pg.Client> {
  const client = await runtimeClient();
  clients.push(client);
  return client;
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ');
}

/**
 * The forged event ATTACK A and ATTACK A′ both plant — identical content, so the ONLY difference
 * between a refusal and a success is the append protocol.
 */
function forgedRow(id: string): AuditHashRow {
  return {
    id,
    occurredAt: new Date('2026-08-19T00:00:00.000Z'),
    /** ⚠ ANY ACTOR THE ATTACKER LIKES. This one is the seeded Nazir. */
    actorId: 'user-nazir-001',
    actorType: 'USER',
    onBehalfOfId: null,
    action: 'APPROVE',
    entityType: 'ApprovalRequest',
    entityId: 'av7-forged-approval',
    waqfId: 'waqf-001',
    before: null,
    after: { status: 'APPROVED' },
    context: { requestId: 'av7-forged', note: 'describes something that never happened' },
    category: 'APPROVAL',
    classification: 'ROUTINE',
  };
}

const FORGED_INSERT = `
  INSERT INTO "audit_event"
    ("id","occurredAt","occurredAtHijri","actorId","actorType","action","entityType",
     "entityId","waqfId","after","context","category","classification","prevHash","rowHash")
  VALUES ($1::bigint, $2::timestamp, '1448-03-06', $3, 'USER'::"AuditActorType",
          'APPROVE'::"AuditAction", $4, $5, $6, $7::jsonb, $8::jsonb,
          'APPROVAL'::"AuditCategory", 'ROUTINE'::"AuditClassification", $9, $10)
`;

function forgedParams(id: string, prevHash: string): unknown[] {
  const forged = forgedRow(id);
  return [
    id,
    '2026-08-19 00:00:00',
    forged.actorId,
    forged.entityType,
    forged.entityId,
    forged.waqfId,
    JSON.stringify(forged.after),
    JSON.stringify(forged.context),
    prevHash,
    computeHash(buildAuditPayload(forged), prevHash),
  ];
}

describe.runIf(hasDatabase)('AV7 · the audit spine, attacked as qmulate_app', () => {
  afterAll(async () => {
    for (const client of clients) await client.end();
  });

  it('POSITIVE CONTROL · the committed chain verifies from genesis, and the guard is ENABLE ALWAYS', async () => {
    const client = await attackClient();
    const rows = await chainOf(client);
    const verdict = verifyChain(rows);
    const head = await headOf(client);
    const trigger = await client.query<{ tgenabled: string }>(
      `SELECT tgenabled FROM pg_trigger WHERE tgname = 'audit_event_chain_bound'`,
    );
    console.log(
      `AV7/CONTROL rows=${String(rows.length)} verify=${JSON.stringify(verdict)} ` +
        `head=${JSON.stringify(head)} chain_bound.tgenabled=${String(trigger.rows[0]?.tgenabled)}`,
    );
    expect(rows.length).toBeGreaterThan(10);
    expect(verdict.ok).toBe(true);
    expect(verdict.checked).toBe(rows.length);
    // The head agrees with the tail — the state every attack below starts from.
    expect(head?.lastRowHash).toBe(rows[rows.length - 1]?.rowHash);
    // 'A' = ENABLE ALWAYS, so `session_replication_role = 'replica'` cannot switch it off and the
    // table OWNER is bound by it too. 'O' (origin-only) would be the silent downgrade.
    expect(
      trigger.rows[0]?.tgenabled,
      'audit_event_chain_bound is not installed ENABLE ALWAYS',
    ).toBe('A');
  });

  it('POSITIVE CONTROL · the plpgsql canonicaliser and canonicalJson() agree — on the KAT vector AND on every committed row', async () => {
    const client = await attackClient();

    const tsCanonical = canonicalJson(buildAuditPayload(KAT_ROW));
    const tsHash = computeHash(buildAuditPayload(KAT_ROW), GENESIS_HASH);

    const kat = await client.query<{ canon: string; hash: string }>(
      `SELECT qmulate_audit_canonical_payload(
                $1::bigint, $2::timestamp, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb,
                $12::jsonb, $13, $14) AS canon,
              qmulate_audit_row_hash(
                $1::bigint, $2::timestamp, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb,
                $12::jsonb, $13, $14, $15) AS hash`,
      [
        KAT_ROW.id.toString(),
        '2026-08-19 04:05:06.789',
        KAT_ROW.actorId,
        KAT_ROW.actorType,
        KAT_ROW.onBehalfOfId,
        KAT_ROW.action,
        KAT_ROW.entityType,
        KAT_ROW.entityId,
        KAT_ROW.waqfId,
        KAT_ROW.before,
        JSON.stringify(KAT_ROW.after),
        JSON.stringify(KAT_ROW.context),
        KAT_ROW.category,
        KAT_ROW.classification,
        GENESIS_HASH,
      ],
    );

    const parity = await client.query<{ rows: string; reproduce: string; badlinks: string }>(
      `SELECT count(*)::text AS rows,
              count(*) FILTER (
                WHERE e."rowHash" = qmulate_audit_row_hash(
                  e."id", e."occurredAt", e."actorId", e."actorType"::text, e."onBehalfOfId",
                  e."action"::text, e."entityType", e."entityId", e."waqfId",
                  e."before", e."after", e."context",
                  e."category"::text, e."classification"::text, e."prevHash"))::text AS reproduce,
              count(*) FILTER (
                WHERE e."prevHash" <> qmulate_audit_expected_prev_hash(e."id"))::text AS badlinks
         FROM "audit_event" e`,
    );

    console.log(
      `AV7/PARITY kat sqlHash=${String(kat.rows[0]?.hash)} tsHash=${tsHash} ` +
        `canonBytesEqual=${String(kat.rows[0]?.canon === tsCanonical)}\n` +
        `AV7/PARITY committed rows=${String(parity.rows[0]?.rows)} ` +
        `reproduce=${String(parity.rows[0]?.reproduce)} badLinks=${String(parity.rows[0]?.badlinks)}`,
    );

    // The canonical BYTES match, not merely the digest — so a divergence is diagnosable rather than
    // just detectable.
    expect(kat.rows[0]?.canon).toBe(tsCanonical);
    expect(kat.rows[0]?.hash).toBe(tsHash);
    // …and the digest is the constant migration 23 §7 refuses to install without.
    expect(tsHash).toBe(KAT_HASH_IN_MIGRATION);
    // Every row the application has ever written reproduces through the SQL path. This is what says
    // the guard will not refuse tomorrow's legitimate write on some shape nobody tried.
    expect(parity.rows[0]?.reproduce).toBe(parity.rows[0]?.rows);
    expect(parity.rows[0]?.badlinks).toBe('0');
  });

  it('POSITIVE CONTROL · a LEGITIMATE append is ACCEPTED and the head still advances (rolled back)', async () => {
    const client = await attackClient();

    // ⚠ WHY THIS REPLAYS THE PROTOCOL INSTEAD OF CALLING `recordEvent`, and it is not a preference.
    // `recordEvent` COMMITS — it opens its own transaction, so a caller cannot roll it back. Three
    // committed events (one here, two in `av7-head-poison-destructive`) took the shared integration
    // database off a multiple of the seed's write count and turned `seed.integration.test.ts`'s
    // E1-4 RED: `expected 6 to be +0`, where 6 was my own probes' appends. MEASURED, not reasoned
    // about — and the constraint it exposed is real and undocumented: NO file in this package's
    // integration suite may leave a committed audit event behind. So every write here rolls back,
    // which is also the discipline this file had as a probe.
    //
    // What is replayed is the append protocol EXACTLY as `extensions/audit.ts` performs it:
    // `pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_KEY)` first, then the id, then
    // `computeHash(buildAuditPayload(row), prevHash)` — line 894 of that file calls those two
    // functions, so the bytes under test are produced by the SHIPPED implementation, not by a
    // re-derivation. What is NOT covered here is the plumbing around them, and it does not need to
    // be: the 176 seeded rows in the parity control above were written by `withAudit`/`recordEvent`
    // THROUGH this trigger (migrate deploy precedes db:seed), and all 176 reproduce.
    const committedBefore = (await chainOf(client)).length;
    await client.query('BEGIN');
    try {
      await client.query(`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY.toString()})`);
      const headBefore = await headOf(client);
      const before = await chainOf(client);
      const tail = before[before.length - 1];
      if (tail === undefined) throw new Error('empty chain');

      const id = (BigInt(tail.id) + 1n).toString();
      const legit: AuditHashRow = {
        id,
        occurredAt: new Date('2026-08-19T12:00:00.000Z'),
        actorId: 'user-seed-admin',
        actorType: 'USER',
        onBehalfOfId: null,
        action: 'READ_SENSITIVE',
        entityType: 'Procedure',
        entityId: 'av7-forge-legit',
        waqfId: null,
        before: null,
        after: null,
        context: { requestId: 'av7-forge-legit' },
        category: 'ACCESS',
        classification: 'ROUTINE',
      };
      const rowHash = computeHash(buildAuditPayload(legit), tail.rowHash);

      // The guard COMPARES; accepting this INSERT is the statement that the plpgsql canonicaliser
      // and `canonicalJson()` agree on a row shape the application really writes.
      await client.query(
        `INSERT INTO "audit_event"
           ("id","occurredAt","occurredAtHijri","actorId","actorType","action","entityType",
            "entityId","context","category","classification","prevHash","rowHash")
         VALUES ($1::bigint, $2::timestamp, '1448-03-06', $3, 'USER'::"AuditActorType",
                 'READ_SENSITIVE'::"AuditAction", $4, $5, $6::jsonb, 'ACCESS'::"AuditCategory",
                 'ROUTINE'::"AuditClassification", $7, $8)`,
        [
          id,
          '2026-08-19 12:00:00',
          legit.actorId,
          legit.entityType,
          legit.entityId,
          JSON.stringify(legit.context),
          tail.rowHash,
          rowHash,
        ],
      );
      // …and the head advances to it, which is §6's new clause permitting a GENUINE forward move.
      await client.query(
        'UPDATE "audit_chain_head" SET "lastId" = $1::bigint, "lastRowHash" = $2 WHERE "id" = 1',
        [id, rowHash],
      );

      const rows = await chainOf(client);
      const verdict = verifyChain(rows);
      const headAfter = await headOf(client);
      console.log(
        `AV7/LEGIT appended id=${id} rowHash=${rowHash.slice(0, 8)}… ` +
          `head ${String(headBefore?.lastId)} -> ${String(headAfter?.lastId)} ` +
          `verify=${JSON.stringify(verdict)}`,
      );

      expect(verdict.ok).toBe(true);
      expect(verdict.checked).toBe(before.length + 1);
      expect(rows[rows.length - 1]?.rowHash).toBe(rowHash);
      // Without this half, "the head guard refuses a planted hash" would be indistinguishable from
      // "the head guard refuses every advance", i.e. from a total outage of the audit spine.
      expect(BigInt(headAfter?.lastId ?? '0')).toBeGreaterThan(BigInt(headBefore?.lastId ?? '0'));
      expect(headAfter?.lastRowHash).toBe(rowHash);
    } finally {
      await client.query('ROLLBACK');
    }

    // Nothing was left behind — asserted as a DELTA, because the paragraph above is only true if it
    // is. (A delta rather than "no row has this entityId": an existing dev cluster may still carry
    // the events the pre-rollback version of this test committed, and `audit_event` refuses DELETE
    // for every role, so those are permanent. The delta is the claim that matters and it is exact.)
    const head = await headOf(client);
    const committed = await chainOf(client);
    expect(committed.length).toBe(committedBefore);
    expect(head?.lastRowHash).toBe(committed[committed.length - 1]?.rowHash);
  });

  it('ATTACK A · INVERTED · the forged append is REFUSED — it does not hold the append lock', async () => {
    const client = await attackClient();
    await client.query('BEGIN');
    let refusal = 'NOT REFUSED';
    try {
      const before = await chainOf(client);
      const tail = before[before.length - 1];
      if (tail === undefined) throw new Error('empty chain');
      const next = await client.query<{ next: string }>(
        'SELECT (COALESCE(MAX("id"), 0) + 1)::text AS next FROM "audit_event"',
      );
      const forgedId = next.rows[0]?.next as string;

      // Nothing secret is involved — `computeHash` is a pure sha256 over canonical bytes and the app
      // must be able to run it. Before migration 23 this exact statement committed and verified.
      try {
        await client.query(FORGED_INSERT, forgedParams(forgedId, tail.rowHash));
      } catch (error) {
        refusal = messageOf(error);
      }
      console.log(`AV7/ATTACK-A => ${refusal.slice(0, 200)}`);

      expect(refusal).toContain('audit_event append refused');
      expect(refusal).toContain(`pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY.toString()})`);
    } finally {
      await client.query('ROLLBACK');
    }

    const after = await chainOf(client);
    expect(after.some((row) => row.entityId === 'av7-forged-approval')).toBe(false);
  });

  it('ATTACK A′ · ⚠ RESIDUAL, GREEN BY DESIGN · a COHERENT forgery still commits and still verifies', async () => {
    const client = await attackClient();
    await client.query('BEGIN');
    try {
      // The ONLY difference from ATTACK A is one extra statement. That is the whole point: the
      // protocol check is a soundness requirement for the prevHash derivation, NOT an
      // authentication boundary, and it must never be described as one.
      await client.query(`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY.toString()})`);

      const before = await chainOf(client);
      const tail = before[before.length - 1];
      if (tail === undefined) throw new Error('empty chain');
      const next = await client.query<{ next: string }>(
        'SELECT (COALESCE(MAX("id"), 0) + 1)::text AS next FROM "audit_event"',
      );
      const forgedId = next.rows[0]?.next as string;
      const params = forgedParams(forgedId, tail.rowHash);

      await client.query(FORGED_INSERT, params);
      // …and the head is advanced to the forgery, so the next legitimate append chains from it.
      // This ALSO proves §6's new clause permits a genuine forward move: the row really does carry
      // that rowHash.
      await client.query(
        'UPDATE "audit_chain_head" SET "lastId" = $1::bigint, "lastRowHash" = $2 WHERE "id" = 1',
        [forgedId, params[9]],
      );

      const verdict = verifyChain(await chainOf(client));
      console.log(
        `AV7/ATTACK-A-PRIME forged id=${forgedId} actorId=user-nazir-001 ` +
          `verifyChain=${JSON.stringify(verdict)}   ⚠ AV7-AUD-F1's fabricated-content half is OPEN`,
      );

      // ⚠ THE RESIDUAL. A fabricated APPROVE naming a real Nazir is indistinguishable from an
      // authentic event, because it IS authentic by the chain's definition. No trigger can close
      // this: the appender chooses the content. The closures are credential separation (no route
      // reaches raw INSERT) and an OFF-BOX ANCHOR of the head, which does not exist yet — E10.
      // ⚠ IF THIS TEST EVER GOES RED, DO NOT DELETE IT: something narrowed the exposure, and the
      // register entry and hash-chain.ts's header both need updating to say what.
      expect(verdict.ok).toBe(true);
      expect(verdict.checked).toBe(before.length + 1);
    } finally {
      await client.query('ROLLBACK');
    }

    const after = await chainOf(client);
    expect(after.some((row) => row.entityId === 'av7-forged-approval')).toBe(false);
  });

  it('ATTACK C-1 · INVERTED · a GARBAGE prevHash is REFUSED, naming the one link the chain allows', async () => {
    const client = await attackClient();
    await client.query('BEGIN');
    let refusal = 'NOT REFUSED';
    try {
      // ⚠ THE LOCK IS TAKEN ON PURPOSE. Without it the refusal would come from the protocol check
      // and would be no evidence at all about the prevHash guard — the false negative this
      // inversion actually produced on its first run.
      await client.query(`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY.toString()})`);
      const next = await client.query<{ next: string; want: string }>(
        `SELECT (COALESCE(MAX("id"), 0) + 1)::text AS next,
                qmulate_audit_expected_prev_hash(COALESCE(MAX("id"), 0) + 1) AS want
           FROM "audit_event"`,
      );
      try {
        await client.query(
          `INSERT INTO "audit_event"
             ("id","occurredAt","occurredAtHijri","actorId","actorType","action","entityType",
              "entityId","context","category","prevHash","rowHash")
           VALUES ($1::bigint, now(), '1448-03-06', NULL, 'SYSTEM'::"AuditActorType",
                   'UPDATE'::"AuditAction", 'Waqf', 'waqf-001', '{}'::jsonb,
                   'MUTATION'::"AuditCategory", $2, $3)`,
          [next.rows[0]?.next, 'f'.repeat(64), '0'.repeat(64)],
        );
      } catch (error) {
        refusal = messageOf(error);
      }
      console.log(`AV7/ATTACK-C-1 => ${refusal.slice(0, 260)}`);

      expect(refusal).toContain('prevHash is computed by the server, not supplied by the client');
      // The guard names the value it wanted, so the refusal is diagnosable and not just loud.
      expect(refusal).toContain(String(next.rows[0]?.want));
      expect(refusal).toContain('f'.repeat(64));
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('ATTACK C-2 · INVERTED · a CORRECT prevHash with a garbage rowHash is REFUSED by the content check', async () => {
    const client = await attackClient();
    await client.query('BEGIN');
    let refusal = 'NOT REFUSED';
    try {
      await client.query(`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY.toString()})`);
      // This is the arm ATTACK C could not distinguish: with prevHash right, the chain LINKS, so
      // before migration 23 the row committed and only an offline `verifyChain()` ever noticed —
      // permanently, because append-only means the row can never be removed.
      try {
        await client.query(
          `INSERT INTO "audit_event"
             ("id","occurredAt","occurredAtHijri","actorId","actorType","action","entityType",
              "entityId","context","category","prevHash","rowHash")
           SELECT n.i, now(), '1448-03-06', NULL, 'SYSTEM'::"AuditActorType",
                  'UPDATE'::"AuditAction", 'Waqf', 'waqf-001', '{}'::jsonb,
                  'MUTATION'::"AuditCategory",
                  qmulate_audit_expected_prev_hash(n.i), repeat('0', 64)
             FROM (SELECT COALESCE(MAX("id"), 0) + 1 AS i FROM "audit_event") n`,
        );
      } catch (error) {
        refusal = messageOf(error);
      }
      console.log(`AV7/ATTACK-C-2 => ${refusal.slice(0, 260)}`);

      expect(refusal).toContain(
        "rowHash is computed by the server from this row's own content and its predecessor",
      );
      expect(refusal).toContain('0'.repeat(64));
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('ATTACK B · INVERTED · the chain head cannot be advanced to a hash no row produced (AV7-AUD-F2)', async () => {
    const client = await attackClient();
    await client.query('BEGIN');
    let rewindRefusal = 'NOT REFUSED';
    let rehashRefusal = 'NOT REFUSED';
    let forwardRefusal = 'NOT REFUSED';
    try {
      // POSITIVE CONTROL 1 · a rewind is refused, and the refusal carries the guard's own sentence.
      // Migration 23 replaces this trigger function, so both original clauses are re-asserted here:
      // a replacement that quietly dropped one would show up as a green attack, not as a diff.
      await client.query('SAVEPOINT s');
      try {
        await client.query('UPDATE "audit_chain_head" SET "lastId" = 1 WHERE "id" = 1');
      } catch (error) {
        rewindRefusal = messageOf(error);
      }
      await client.query('ROLLBACK TO SAVEPOINT s');

      // POSITIVE CONTROL 2 · re-attesting the SAME id to a different hash is refused too.
      await client.query('SAVEPOINT s2');
      try {
        await client.query('UPDATE "audit_chain_head" SET "lastRowHash" = $1 WHERE "id" = 1', [
          'b'.repeat(64),
        ]);
      } catch (error) {
        rehashRefusal = messageOf(error);
      }
      await client.query('ROLLBACK TO SAVEPOINT s2');

      // THE ATTACK · a HIGHER id with an arbitrary hash. This COMMITTED before migration 23, and
      // committing it de-linked the trail permanently: the next audited transaction aborted, the one
      // after it anchored to 'a'×64, and neither the row nor the head could be repaired.
      // ⚠ SAVEPOINT, and it is not cosmetic: the guard RAISES now, which aborts the transaction, so
      // without this the `headOf` read below dies with "current transaction is aborted" and the
      // failure looks like a broken test rather than a working guard. That is exactly how this
      // inversion first failed.
      await client.query('SAVEPOINT s3');
      try {
        await client.query(
          'UPDATE "audit_chain_head" SET "lastId" = "lastId" + 1000, "lastRowHash" = $1 WHERE "id" = 1',
          ['a'.repeat(64)],
        );
      } catch (error) {
        forwardRefusal = messageOf(error);
      }
      await client.query('ROLLBACK TO SAVEPOINT s3');
      const head = await headOf(client);
      console.log(
        `AV7/ATTACK-B rewind  => ${rewindRefusal.slice(0, 90)}\n` +
          `AV7/ATTACK-B rehash  => ${rehashRefusal.slice(0, 90)}\n` +
          `AV7/ATTACK-B forward => ${forwardRefusal.slice(0, 160)}\n` +
          `AV7/ATTACK-B head unchanged => ${JSON.stringify(head)}`,
      );

      expect(rewindRefusal).toContain('audit_chain_head may only move forward');
      expect(rehashRefusal).toContain('lastRowHash may not be rewritten in place');
      expect(forwardRefusal).toContain(
        'audit_chain_head may only be advanced to a hash a real row produced',
      );
      expect(forwardRefusal).toContain('a'.repeat(64));
      // And the head really did not move.
      expect(head?.lastRowHash).not.toBe('a'.repeat(64));
    } finally {
      await client.query('ROLLBACK');
    }
  });

  it('POSITIVE CONTROL · after every attack the committed chain still verifies and the head is intact', async () => {
    const client = await attackClient();
    const rows = await chainOf(client);
    const verdict = verifyChain(rows);
    const head = await headOf(client);
    console.log(`AV7/CONTROL-2 rows=${String(rows.length)} verify=${JSON.stringify(verdict)}`);
    expect(verdict.ok).toBe(true);
    expect(head?.lastRowHash).toBe(rows[rows.length - 1]?.rowHash);
  });
});
