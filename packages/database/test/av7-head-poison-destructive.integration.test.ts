/**
 * AV7 — THE CHAIN-HEAD POISON (AV7-AUD-F2, HIGH). ⚠ **THIS FILE IS NO LONGER DESTRUCTIVE.**
 *
 * ── READ THIS BEFORE RUNNING OR QUOTING IT ──────────────────────────────────────────────────────
 * It used to be irreversible, and it used to be gated behind
 * `AV7_DESTRUCTIVE=yes-destroy-this-cluster`, because its whole point was that the poison
 * COMMITTED: `audit_event` refuses DELETE and the head refused a rewind, so the damage could not be
 * undone and the cluster's audit chain was finished. **Migration 23 refuses the poison, so there is
 * nothing left to destroy** — the gate is therefore GONE and this file runs in the ordinary
 * integration suite, which is the only way it can protect anything. THE FILENAME IS KEPT so the
 * register, the adversary report and the reproduction commands still point at something.
 *
 * ── WHAT WAS BROKEN, MEASURED, AND IN THIS ORDER ────────────────────────────────────────────────
 * Migration 1's `qmulate_audit_chain_head_forward_only` guarded a REWIND and a SAME-ID REHASH. It
 * did not guard FORWARD with an arbitrary hash. From `qmulate_app` — the RUNTIME credential:
 *
 *     AV7/POISON control rows=197 verify={"ok":true,"checked":197} head={"lastId":"197",…}
 *     AV7/POISON head poisoned => {"lastId":"199","lastRowHash":"aaaa…aaaa"}          ← COMMITTED
 *     AV7/POISON first append after the poison => 42501 `audit_chain_head lastRowHash may not be
 *                                                 rewritten in place at lastId 199`  ← ABORTED
 *     AV7/POISON victim id=200 prevHash=aaaaaaaa…aaaa                                 ← COMMITTED
 *     AV7/POISON verify={"ok":false,"checked":198,"brokenAtId":"200",
 *                        "reason":"…a row was deleted or re-ordered"}
 *     AV7/POISON repair attempt => audit_chain_head may only move forward: 200 -> 197 rejected.
 *
 * Three separate harms, and they are worth keeping distinct: (1) the FIRST casualty was
 * AVAILABILITY — every audited transaction aborted, and `recordProcedureDenial` swallows write
 * failures by design, so `ACCESS_DENIED` events were lost SILENTLY in that window; (2) the next
 * transaction succeeded anchored to a hash no row ever produced; (3) there was NO REPAIR. And the
 * verifier then made a FALSE ACCUSATION — "a row was deleted or re-ordered" — which is what an
 * auditor would act on.
 *
 * ── WHAT THIS FILE ASSERTS NOW ──────────────────────────────────────────────────────────────────
 * The poison is refused at step 1, by name, so steps 2–5 are UNREACHABLE rather than tolerated.
 * The two things that make that a fix rather than a lockout are asserted alongside it: an audited
 * write issued immediately afterwards still SUCCEEDS (there is no DoS), and the head still ADVANCES
 * on a legitimate append (the guard is not "refuse every forward move").
 *
 * ⚠ AND NOTHING HERE COMMITS AN AUDIT EVENT. The two legitimate appends replay the protocol
 * `extensions/audit.ts` uses — the advisory lock, then `computeHash(buildAuditPayload(row), prev)`,
 * then the head UPDATE — inside `BEGIN … ROLLBACK`, rather than calling `recordEvent`, which opens
 * its own transaction and cannot be undone. That was measured, not guessed: three committed probe
 * events took the shared integration database off a multiple of the seed's write count and turned
 * `seed.integration.test.ts`'s E1-4 RED (`expected 6 to be +0`).
 *
 * ⚠ ONE TRAP IN THE VERIFIER IS STILL OPEN AND IS RE-ASSERTED, NOT FIXED (AV7-AUD-F6):
 * `audit_event."occurredAt"` is `timestamp WITHOUT time zone` and node-postgres localises it, so
 * `verifyChain` recomputes every hash from a shifted instant and reports the chain broken AT ROW 1
 * on a non-UTC host. Under `TZ=+03` this file's own read said `row 1 content does not match its
 * rowHash`; under `TZ=UTC` it said the truth. Every suite here pins `TZ=UTC` in vitest config, so
 * nothing has ever seen it. Migration 23's SQL hash reads the column verbatim and is therefore
 * timezone-INDEPENDENT — which means the two implementations now disagree about a non-UTC host, and
 * the SQL one is right. `verifyChain`/`buildAuditPayload` still owe the normalisation.
 */

import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';

import { hasDatabase, warnNoDatabase } from './setup.js';
import {
  AUDIT_CHAIN_LOCK_KEY,
  buildAuditPayload,
  computeHash,
  verifyChain,
  type AuditHashRow,
} from '../src/hash-chain.js';

warnNoDatabase('AV7 chain-head poison regression (AV7-AUD-F2)');

type ChainRow = AuditHashRow & { prevHash: string; rowHash: string };

/** ⚠ `ORDER BY "audit_event"."id"` is qualified: a bare `"id"` binds the `text` output column. */
const CHAIN_SQL = `
  SELECT "id"::text AS "id", "occurredAt", "actorId", "actorType"::text AS "actorType",
         "onBehalfOfId", "action"::text AS "action", "entityType", "entityId", "waqfId",
         "before", "after", "context", "category"::text AS "category",
         "classification"::text AS "classification", "prevHash", "rowHash"
    FROM "audit_event"
   ORDER BY "audit_event"."id" ASC
`;

let client: pg.Client | undefined;

async function runtime(): Promise<pg.Client> {
  if (client !== undefined) return client;
  const created = new pg.Client({ connectionString: process.env['DATABASE_URL'] });
  await created.connect();
  const who = await created.query<{ user: string }>('SELECT current_user AS "user"');
  expect(who.rows[0]?.user, 'an attack proven as the owner proves nothing about the runtime').toBe(
    'qmulate_app',
  );
  client = created;
  return created;
}

function head(db: pg.Client): Promise<{ lastId: string; lastRowHash: string } | undefined> {
  return db
    .query<{ lastId: string; lastRowHash: string }>(
      'SELECT "lastId"::text AS "lastId", "lastRowHash" FROM "audit_chain_head"',
    )
    .then((result) => result.rows[0]);
}

/**
 * One legitimate append, ROLLED BACK, following the append protocol exactly as
 * `extensions/audit.ts` performs it: the advisory lock first, then the id, then
 * `computeHash(buildAuditPayload(row), prevHash)` — the same two functions that file calls (line
 * 894), so the bytes the trigger judges are the SHIPPED implementation's.
 *
 * ⚠ IT DOES NOT USE `recordEvent`, AND THAT IS A MEASUREMENT, NOT A STYLE CHOICE. `recordEvent`
 * opens its own transaction and COMMITS, so a caller cannot undo it — and `audit_event` refuses
 * DELETE for every role, superuser included, so an event left here is permanent. Two committed
 * events from this file plus one from `av7-chain-forge` took the shared integration database off a
 * multiple of the seed's write count and turned `seed.integration.test.ts`'s E1-4 RED
 * (`expected 6 to be +0`). The constraint that exposed is real and was undocumented: no file in
 * this package's integration suite may leave a committed audit event behind.
 *
 * Returns the refusal message, or `null` when the append was ACCEPTED (which is the control).
 */
async function appendAndRollBack(db: pg.Client, tag: string): Promise<string | null> {
  await db.query('BEGIN');
  try {
    await db.query(`SELECT pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK_KEY.toString()})`);
    const rows = (await db.query<ChainRow>(CHAIN_SQL)).rows;
    const tail = rows[rows.length - 1];
    if (tail === undefined) throw new Error('empty chain');

    const id = (BigInt(tail.id) + 1n).toString();
    const row: AuditHashRow = {
      id,
      occurredAt: new Date('2026-08-19T12:00:00.000Z'),
      actorId: 'user-seed-admin',
      actorType: 'USER',
      onBehalfOfId: null,
      action: 'READ_SENSITIVE',
      entityType: 'Procedure',
      entityId: tag,
      waqfId: null,
      before: null,
      after: null,
      context: { requestId: tag },
      category: 'ACCESS',
      classification: 'ROUTINE',
    };
    const rowHash = computeHash(buildAuditPayload(row), tail.rowHash);

    await db.query(
      `INSERT INTO "audit_event"
         ("id","occurredAt","occurredAtHijri","actorId","actorType","action","entityType",
          "entityId","context","category","classification","prevHash","rowHash")
       VALUES ($1::bigint, $2::timestamp, '1448-03-06', $3, 'USER'::"AuditActorType",
               'READ_SENSITIVE'::"AuditAction", 'Procedure', $4, $5::jsonb,
               'ACCESS'::"AuditCategory", 'ROUTINE'::"AuditClassification", $6, $7)`,
      [
        id,
        '2026-08-19 12:00:00',
        row.actorId,
        tag,
        JSON.stringify(row.context),
        tail.rowHash,
        rowHash,
      ],
    );
    // The head advance is the half the poison used to break: `finalizeChain` does exactly this, and
    // it is where the original DoS landed.
    await db.query(
      'UPDATE "audit_chain_head" SET "lastId" = $1::bigint, "lastRowHash" = $2 WHERE "id" = 1',
      [id, rowHash],
    );
    // Verified INSIDE the transaction, on its own snapshot — the chain is intact with the row in it.
    expect(verifyChain((await db.query<ChainRow>(CHAIN_SQL)).rows).ok).toBe(true);
    expect(BigInt((await head(db))?.lastId ?? '0')).toBe(BigInt(id));
    return null;
  } catch (error) {
    return (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ');
  } finally {
    await db.query('ROLLBACK');
  }
}

describe.runIf(hasDatabase)(
  'AV7 · a poisoned chain head is refused, so the trail stays linked',
  () => {
    afterAll(async () => {
      await client?.end();
    });

    it('the whole sequence: the poison is REFUSED, and the four harms it caused are unreachable', async () => {
      const db = await runtime();

      // ── CONTROL 1 · the chain verifies and the head agrees with the tail ─────────────────────
      const before = (await db.query<ChainRow>(CHAIN_SQL)).rows;
      const headBefore = await head(db);
      const verdictBefore = verifyChain(before);
      console.log(
        `AV7/POISON control rows=${String(before.length)} verify=${JSON.stringify(verdictBefore)} head=${JSON.stringify(headBefore)}`,
      );
      expect(verdictBefore.ok).toBe(true);
      expect(headBefore?.lastRowHash).toBe(before[before.length - 1]?.rowHash);

      // ── CONTROL 2 · a legitimate append IS ACCEPTED and the head DOES advance ────────────────
      // The refusal below is worthless without this: it proves the new clause permits a genuine
      // forward move to a real row's real hash, rather than refusing every advance — which would be
      // a total outage of the audit spine dressed as a security fix. Both facts are asserted inside
      // `appendAndRollBack`, on the transaction's own snapshot, and then rolled back.
      const cleanRefusal = await appendAndRollBack(db, 'av7-poison-control');
      console.log(`AV7/POISON legitimate append => ${cleanRefusal ?? 'ACCEPTED (rolled back)'}`);
      expect(cleanRefusal, 'a legitimate append was refused — this is a lockout, not a fix').toBe(
        null,
      );

      // ── THE ATTACK · one UPDATE from the RUNTIME role, in AUTOCOMMIT ─────────────────────────
      // No BEGIN and no ROLLBACK: this is a real attempt to COMMIT, exactly as the original probe
      // made it. Before migration 23 the head moved and the trail was finished.
      let poisonRefusal = 'NOT REFUSED';
      try {
        await db.query(
          'UPDATE "audit_chain_head" SET "lastId" = "lastId" + 1, "lastRowHash" = $1 WHERE "id" = 1',
          ['a'.repeat(64)],
        );
      } catch (error) {
        poisonRefusal = (error instanceof Error ? error.message : String(error)).replace(
          /\s+/g,
          ' ',
        );
      }
      const headAfterPoison = await head(db);
      console.log(
        `AV7/POISON attempt => ${poisonRefusal.slice(0, 200)}\n` +
          `AV7/POISON head after the attempt => ${JSON.stringify(headAfterPoison)}`,
      );

      expect(poisonRefusal).toContain(
        'audit_chain_head may only be advanced to a hash a real row produced',
      );
      expect(poisonRefusal).toContain('a'.repeat(64));
      // Nothing moved — so the head still points at the row it pointed at.
      expect(headAfterPoison).toEqual(headBefore);

      // ── HARM 1 IS UNREACHABLE · there is no DoS on audited writes ───────────────────────────
      // The original sequence's FIRST casualty was availability: the very next audited transaction
      // ABORTED, and `recordProcedureDenial` swallows write failures by design, so every
      // ACCESS_DENIED event in that window was lost silently. An abort is what this measures — the
      // rollback at the end is ours, and it happens after the append and the head advance succeeded.
      const survivorRefusal = await appendAndRollBack(db, 'av7-poison-survivor');
      console.log(
        `AV7/POISON next audited write => ${survivorRefusal ?? 'ACCEPTED (rolled back)'}`,
      );
      expect(survivorRefusal, 'the audited write after the refused poison ABORTED — DoS').toBe(
        null,
      );

      // ── HARMS 2, 3 AND 4 ARE UNREACHABLE · no de-link, no false accusation, no repair needed ─
      const rows = (await db.query<ChainRow>(CHAIN_SQL)).rows;
      const verdictAfter = verifyChain(rows);
      console.log(`AV7/POISON verify=${JSON.stringify(verdictAfter)}`);
      expect(verdictAfter.ok).toBe(true);
      expect(verdictAfter.checked).toBe(rows.length);
      // No row anywhere is anchored to the planted hash.
      expect(rows.some((row) => row.prevHash === 'a'.repeat(64))).toBe(false);
      // And the head agrees with the tail again, which is the state CONTROL 1 asserted.
      expect((await head(db))?.lastRowHash).toBe(rows[rows.length - 1]?.rowHash);

      // ── THE REWIND CLAUSE STILL FIRES ───────────────────────────────────────────────────────
      // Migration 23 REPLACES this trigger function, so migration 1's original clause is re-asserted
      // here: a replacement that quietly dropped it would show up as a green attack, not as a diff.
      // (There is nothing to repair now, but a rewind is still how a truncated trail is made to
      // verify clean, which is why the clause exists.)
      let rewind = 'NOT REFUSED';
      try {
        await db.query('UPDATE "audit_chain_head" SET "lastId" = 1 WHERE "id" = 1');
      } catch (error) {
        rewind = (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ');
      }
      console.log(`AV7/POISON rewind attempt => ${rewind.slice(0, 160)}`);
      expect(rewind).toContain('audit_chain_head may only move forward');

      // ── AND THE VERIFIER'S OWN TRAP, RE-ASSERTED RATHER THAN DESCRIBED (AV7-AUD-F6) ──────────
      // `TZ` is pinned to UTC by this package's vitest config, which is the ONLY reason every
      // `verifyChain` assertion above is meaningful. Stated out loud so a future verification tool —
      // an ops script, E10's signer, a Nazir-facing "verify my trail" button — does not inherit the
      // dependency silently and then report the whole trail forged from row 1.
      expect(process.env['TZ']).toBe('UTC');
    });
  },
);
