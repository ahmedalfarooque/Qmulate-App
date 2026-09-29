-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- QMULATE — MIGRATION 23 · THE AUDIT CHAIN IS BOUND AT INSERT, SERVER-SIDE
--
-- Closes AV7-AUD-F1 (partly — see the BOUND below) and AV7-AUD-F2 (fully), both HIGH on the
-- V-S7 adversarial register, both measured on `qmulate_app` — the RUNTIME credential, i.e. the
-- role a compromised web process holds. Reproducers:
--   `packages/database/test/av7-chain-forge.integration.test.ts`
--   `packages/database/test/av7-head-poison-destructive.integration.test.ts`
--
-- ── WHAT WAS BROKEN ─────────────────────────────────────────────────────────────────────────
-- `audit_event` was append-only (migration 1 §1a: UPDATE/DELETE/TRUNCATE all refused, by trigger,
-- for every role including SUPERUSER). But NOTHING looked at an INSERT. The hash chain was
-- computed entirely in TypeScript and the columns `prevHash`/`rowHash` were whatever the client
-- said they were. Measured consequences, verbatim from the probe runs:
--
--   AV7/ATTACK-C  a row with prevHash='f'×64, rowHash='0'×64 is ACCEPTED at INSERT. No CHECK,
--                 no trigger. Detection was OFFLINE ONLY, and arrived as
--                 "a row was deleted or re-ordered" — which names the wrong crime.
--   AV7/POISON    one committed UPDATE moving `audit_chain_head` FORWARD to an arbitrary hash
--                 ('a'×64) de-linked the trail PERMANENTLY: the next audited transaction ABORTED
--                 (a DoS on every audited write — and `recordProcedureDenial` swallows write
--                 failures by design, so ACCESS_DENIED events are lost silently in that window),
--                 the one after it COMMITTED anchored to a hash no row ever produced, and there
--                 was no repair: the row cannot be deleted (append-only) and the head cannot be
--                 rewound (migration 1's forward-only guard refuses it).
--
-- ── WHAT THIS FILE INSTALLS ─────────────────────────────────────────────────────────────────
--   §1–§3  A CANONICALISER AND A HASH FUNCTION IN plpgsql, byte-identical to `src/hash-chain.ts`.
--   §4     `qmulate_audit_expected_prev_hash(id)` — the one link the chain allows at that id.
--   §5     `audit_event_chain_bound` — BEFORE INSERT. The client's `prevHash`/`rowHash` are
--          COMPARED against the server's own computation and a mismatch is REFUSED. So both
--          columns stop being the client's to choose: every committed row's hash reproduces from
--          its own content, BY CONSTRUCTION.
--   §6     `qmulate_audit_chain_head_forward_only` gains the clause AV7-AUD-F2 asked for:
--          `NEW."lastRowHash"` must be the `rowHash` OF `NEW."lastId"`. One index lookup.
--   §7     A KNOWN-ANSWER TEST. The expected digest is a constant produced by the TypeScript
--          implementation; the migration REFUSES TO INSTALL if the SQL disagrees with it.
--   §8     A SELF-VERIFICATION over every row already in the table, same refusal.
--
-- ── ⚠ THE BOUND ON AV7-AUD-F1, STATED FIRST BECAUSE IT IS THE PART THAT MATTERS ─────────────
-- **THE FABRICATED-CONTENT FORGERY IS NOT CLOSED BY THIS FILE AND CANNOT BE CLOSED AT THE
-- DATABASE LAYER.** ATTACK A appended an `APPROVE` event naming a real Nazir for an approval that
-- never happened, with hashes it computed ITSELF from the repo's own algorithm. A server-side
-- hash computes THE SAME VALUE for that row — the content is whatever the appender says it is —
-- so the row is still accepted. Measured, after this migration, in the probe's ATTACK A′.
--
-- Any role that may APPEND may append a lie. That is what append-only means, and the runtime role
-- must hold INSERT. What this file removes is the freedom to append an *incoherent* row: the
-- attacker must now follow the same protocol, in the same order, as the real writer, which means
-- the head advances and the chain stays verifiable. The remaining half of AV7-AUD-F1 is therefore
-- NOT a trigger; it is (a) credential separation — that no route reaches raw INSERT, which the
-- API adversary measured separately ("no user-input-interpolated raw SQL in any router") — and
-- (b) an OFF-BOX ANCHOR: periodic notarisation of `(lastId, lastRowHash)` outside this database,
-- so an appended forgery cannot be hidden by advancing the head. (b) DOES NOT EXIST YET and is
-- owed to E10. Nothing in this file should be quoted as having closed it.
--
-- ── ⚠ AND THE FAILURE DIRECTION, WHICH IS AVAILABILITY, NOT INTEGRITY ───────────────────────
-- If the plpgsql canonicaliser ever disagrees with the TypeScript one by a single byte, the write
-- is REFUSED and the audited transaction rolls back. It does not store a wrong hash. That is the
-- same fail-safe direction as `appendAuditEvent`'s own AL-1 self-check, and it is deliberate —
-- `audit_event` is append-only, so a row that cannot verify is UNREPAIRABLE and breaks every
-- future verification for ever, while a refused write leaves a verifiable trail and a loud error.
-- The cost of that choice is that a divergence is an OUTAGE of every audited write, which is why
-- §7 and §8 exist and why they RAISE rather than warn.
-- ═══════════════════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §1 · STRING ENCODING — parity with `encodeString()` in src/hash-chain.ts
--
-- That function escapes EXACTLY three things: `"`, `\`, and C0 controls as lowercase `\u00xx`.
-- Everything else — U+2028/U+2029, RTL marks, Arabic, DEL (0x7F) — is emitted VERBATIM, so the
-- bytes of an Arabic string do not depend on a JSON library's escaping policy.
--
-- ⚠ `to_json(text)` AND `jsonb::text` CANNOT BE USED HERE, for three separate reasons:
--   · Postgres spells TAB, LF, CR, BS and FF as the two-character shorthands \t \n \r \b \f,
--     while the TypeScript encoder spells every C0 control as a lowercase four-hex-digit escape.
--     A single newline anywhere in a reason string would therefore change the digest.
--   · `jsonb::text` re-orders object keys — jsonb sorts by LENGTH first, then bytes — where JS
--     sorts by code unit. `{"b":…,"aa":…}` comes out in the opposite order.
--   · `jsonb::text` inserts whitespace after `:` and `,`.
--
-- U+0000 is unrepresentable in a Postgres `text` value at all, so the loop starts at 1: that one
-- escape is unreachable from this side, which is a difference of theory only.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_canon_json_string(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE STRICT
AS $qm_canon_str$
DECLARE
  s text;
  i int;
BEGIN
  s := replace(p_value, '\', '\\');   -- backslash FIRST: the escapes below introduce backslashes
  s := replace(s, '"', '\"');

  -- Fast path: most values have no control characters at all. `[[:cntrl:]]` is only the GATE;
  -- the loop below is what defines the output, and it covers exactly 1..31 as the TS encoder does.
  IF s ~ '[[:cntrl:]]' THEN
    FOR i IN 1..31 LOOP
      IF strpos(s, chr(i)) > 0 THEN
        s := replace(s, chr(i), '\u' || lpad(to_hex(i), 4, '0'));
      END IF;
    END LOOP;
  END IF;

  RETURN '"' || s || '"';
END
$qm_canon_str$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §2 · CANONICAL JSON OVER A jsonb TREE — parity with `canonicalJson()`
--
-- Rules, all load bearing and all copied from that function's own list:
--   • object keys sorted ascending; no whitespace anywhere; array order preserved (it is data)
--   • explicit null preserved
--   • ⚠ A JSON NUMBER IS REFUSED. Not a limitation — the SAME tripwire the TypeScript side has.
--     `serializeForAudit()` runs BEFORE the row is written (`normalizeRow`/`buildContext` in
--     src/extensions/audit.ts), so every numeric is already a STRING in the stored jsonb.
--     MEASURED on this migration's authoring cluster, walking `before`/`after`/`context` of all
--     176 seeded rows to every leaf: 3032 strings · 761 nulls · 416 objects · 226 booleans ·
--     106 arrays · **0 numbers**. A number arriving here means a code path skipped the pipeline,
--     which is exactly what `canonicalJson` throws on, so this refuses too rather than inventing
--     a second numeric spelling (`String(1e21)` and `numeric_out(1e21)` do not agree).
--
-- ⚠ SORT ORDER, PRECISELY. `Array.prototype.sort()` compares UTF-16 CODE UNITS; `COLLATE "C"`
-- compares UTF-8 BYTES. Those two orders are IDENTICAL for every code point in the BMP and differ
-- only for supplementary-plane characters (U+10000 and above), whose surrogates D800–DFFF sort
-- below U+E000–U+FFFF in UTF-16 but above them in UTF-8. Keys here are column names, `Setting`
-- keys and request-context keys — ASCII or Arabic, all BMP. If an astral key ever appears the
-- digests diverge and the write is REFUSED (§5), which is the safe direction, but the message
-- would be confusing; that is the one known way to make this function lie about parity, and it is
-- written down rather than guarded, because a guard here would cost a per-key scan on every write.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_canon_jsonb(p_value jsonb, p_path text DEFAULT '$')
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $qm_canon_jsonb$
DECLARE
  kind text;
  body text;
BEGIN
  IF p_value IS NULL THEN RETURN 'null'; END IF;

  kind := jsonb_typeof(p_value);

  IF kind = 'null' THEN
    RETURN 'null';

  ELSIF kind = 'string' THEN
    RETURN qmulate_canon_json_string(p_value #>> '{}');

  ELSIF kind = 'boolean' THEN
    RETURN CASE WHEN p_value = 'true'::jsonb THEN 'true' ELSE 'false' END;

  ELSIF kind = 'number' THEN
    RAISE EXCEPTION
      'audit canonicalization: %: a JSON number is banned in an audit payload. Money and shares '
      'are Decimal and serializeForAudit() encodes every numeric as a STRING before the row is '
      'written; a number reaching the database means a code path skipped that pipeline '
      '(src/hash-chain.ts, canonicalJson).', p_path
      USING ERRCODE = '22P02';

  ELSIF kind = 'array' THEN
    SELECT coalesce(
             string_agg(
               qmulate_canon_jsonb(e.value, p_path || '[' || (e.ord - 1)::text || ']'),
               ',' ORDER BY e.ord),
             '')
      INTO body
      FROM jsonb_array_elements(p_value) WITH ORDINALITY AS e(value, ord);
    RETURN '[' || body || ']';

  ELSE -- object
    SELECT coalesce(
             string_agg(
               qmulate_canon_json_string(e.key) || ':' ||
                 qmulate_canon_jsonb(e.value, p_path || '.' || e.key),
               ',' ORDER BY e.key COLLATE "C"),
             '')
      INTO body
      FROM jsonb_each(p_value) AS e(key, value);
    RETURN '{' || body || '}';
  END IF;
END
$qm_canon_jsonb$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §3 · THE ROW HASH — parity with `buildAuditPayload()` + `computeHash()`
--
--   rowHash = sha256_hex( utf8(canonicalJson(payload)) || utf8(prevHash) )
--
-- The payload is EXACTLY the fourteen fields `AUDIT_HASH_PAYLOAD_FIELDS` names, written here in
-- the sorted order `canonicalJson` would produce, so no sort happens at run time:
--   action, actorId, actorType, after, before, category, classification, context,
--   entityId, entityType, id, occurredAt, onBehalfOfId, waqfId
-- (ASCII, case-sensitive; "classification" precedes "context" because 'l' < 'o'.)
--
-- `prevHash` is appended as its 64 ASCII CHARACTERS, not as 32 decoded bytes — the spelling the E1
-- contract pins, and the one `computeHash` uses.
--
-- ⚠ `occurredAt` IS `timestamp WITHOUT TIME ZONE` and `to_char` reads it verbatim, so this
-- function is TIMEZONE-INDEPENDENT — unlike the TypeScript verifier, whose driver localises the
-- column (AV7-AUD-F6: under `TZ=+03` `verifyChain` reported the whole trail forged from row 1).
-- The `.MS` and `"T"…"Z"` spelling reproduces `Date.prototype.toISOString()`, which is what
-- `dateToCanonicalString` returns and what Prisma stores (UTC wall clock in a `timestamp(3)`).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_audit_canonical_payload(
  p_id              bigint,
  p_occurred_at     timestamp,
  p_actor_id        text,
  p_actor_type      text,
  p_on_behalf_of_id text,
  p_action          text,
  p_entity_type     text,
  p_entity_id       text,
  p_waqf_id         text,
  p_before          jsonb,
  p_after           jsonb,
  p_context         jsonb,
  p_category        text,
  p_classification  text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $qm_audit_payload$
  SELECT '{'
    || '"action":'         || qmulate_canon_jsonb(to_jsonb(p_action),         '$.action')
    || ',"actorId":'       || qmulate_canon_jsonb(to_jsonb(p_actor_id),       '$.actorId')
    || ',"actorType":'     || qmulate_canon_jsonb(to_jsonb(p_actor_type),     '$.actorType')
    || ',"after":'         || qmulate_canon_jsonb(p_after,                    '$.after')
    || ',"before":'        || qmulate_canon_jsonb(p_before,                   '$.before')
    || ',"category":'      || qmulate_canon_jsonb(to_jsonb(p_category),       '$.category')
    || ',"classification":'|| qmulate_canon_jsonb(to_jsonb(p_classification), '$.classification')
    || ',"context":'       || qmulate_canon_jsonb(p_context,                  '$.context')
    || ',"entityId":'      || qmulate_canon_jsonb(to_jsonb(p_entity_id),      '$.entityId')
    || ',"entityType":'    || qmulate_canon_jsonb(to_jsonb(p_entity_type),    '$.entityType')
    || ',"id":'            || qmulate_canon_json_string(p_id::text)
    || ',"occurredAt":'    || qmulate_canon_json_string(
                                to_char(p_occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    || ',"onBehalfOfId":'  || qmulate_canon_jsonb(to_jsonb(p_on_behalf_of_id),'$.onBehalfOfId')
    || ',"waqfId":'        || qmulate_canon_jsonb(to_jsonb(p_waqf_id),        '$.waqfId')
    || '}';
$qm_audit_payload$;

CREATE OR REPLACE FUNCTION qmulate_audit_row_hash(
  p_id              bigint,
  p_occurred_at     timestamp,
  p_actor_id        text,
  p_actor_type      text,
  p_on_behalf_of_id text,
  p_action          text,
  p_entity_type     text,
  p_entity_id       text,
  p_waqf_id         text,
  p_before          jsonb,
  p_after           jsonb,
  p_context         jsonb,
  p_category        text,
  p_classification  text,
  p_prev_hash       text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $qm_audit_row_hash$
  SELECT encode(
           sha256(
             convert_to(
               qmulate_audit_canonical_payload(
                 p_id, p_occurred_at, p_actor_id, p_actor_type, p_on_behalf_of_id, p_action,
                 p_entity_type, p_entity_id, p_waqf_id, p_before, p_after, p_context,
                 p_category, p_classification),
               'UTF8')
             || convert_to(p_prev_hash, 'UTF8')),
           'hex');
$qm_audit_row_hash$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §4 · THE ONE LINK ALLOWED AT AN ID
--
-- The predecessor is the row with the greatest id BELOW this one — which is what `verifyChain()`
-- checks when it walks the table `ORDER BY id ASC` — not `audit_chain_head`. That difference is
-- deliberate and it is what makes a MULTI-EVENT transaction work: `runAuditedTransaction` reads
-- the head ONCE at the start and chains the transaction's own events off each other, advancing the
-- head only in `finalizeChain` at the end. A trigger that demanded `head.lastRowHash` would refuse
-- every second event of every transaction that records two.
--
-- Genesis is 64 zeroes, matching `GENESIS_HASH`.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_audit_expected_prev_hash(p_id bigint)
RETURNS text
LANGUAGE sql
STABLE
AS $qm_expected_prev$
  SELECT coalesce(
           (SELECT "rowHash" FROM "audit_event" WHERE "id" < p_id ORDER BY "id" DESC LIMIT 1),
           repeat('0', 64));
$qm_expected_prev$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §5 · THE INSERT GUARD
--
-- Three refusals, in the order that gives the most useful error:
--
--   1. THE APPEND PROTOCOL. `pg_advisory_xact_lock(AUDIT_CHAIN_LOCK_KEY)` must already be held by
--      this backend. ⚠ THIS IS NOT AN AUTHENTICATION BOUNDARY AND MUST NEVER BE DESCRIBED AS ONE:
--      the lock is grantable to anyone, so an attacker adds one `SELECT pg_advisory_xact_lock(…)`
--      and passes it (the probe's ATTACK A′ does exactly that and is GREEN by design). It is here
--      because it is NECESSARY FOR THE SOUNDNESS OF CHECK 2: the predecessor is read with the
--      inserting transaction's snapshot, so two writers who did not serialise would each see the
--      same predecessor and FORK the chain — and a fork is the one corruption `verifyChain()`
--      cannot tell from tampering. Migration 1's own note on that lock makes the same argument for
--      the application side; this makes it enforceable rather than conventional, and turns a
--      silent fork into a named refusal.
--
--   2. `prevHash` IS NOT THE CLIENT'S TO CHOOSE. It must be §4's value.
--
--   3. `rowHash` IS NOT THE CLIENT'S TO CHOOSE. It must be §3's value over this row's own content.
--      Without this the chain LINKS correctly while a row's content no longer reproduces its
--      hash — the same permanent, unrepairable break as AV7-AUD-F2, reached through an INSERT.
--
-- BEFORE INSERT, `FOR EACH ROW`, and `ENABLE ALWAYS` so `session_replica_role = 'replica'` cannot
-- switch it off (migration 1 §5's argument, and `g1-replica-role-bypass` is the test).
--
-- The trigger COMPARES rather than ASSIGNS. Assigning would silently overwrite a client that
-- disagreed, and the writer's TypeScript hash — the one `verifyChain` will later recompute — would
-- then be a value nobody ever checked. Comparing means the two implementations are pinned to each
-- other on every single append, for ever.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_audit_event_chain_bound()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_chain_bound$
DECLARE
  -- AUDIT_CHAIN_LOCK_KEY, exported from src/hash-chain.ts. Change it in both places or not at all.
  lock_key  bigint := 7233057419042001;
  want_prev text;
  want_row  text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_locks
     WHERE locktype = 'advisory'
       AND pid       = pg_backend_pid()
       AND classid   = (lock_key >> 32)::oid
       AND objid     = (lock_key & 4294967295)::oid
       AND objsubid  = 1
       AND granted
  ) THEN
    RAISE EXCEPTION
      'audit_event append refused: this transaction does not hold pg_advisory_xact_lock(%). Every '
      'append goes through runAuditedTransaction(), which takes that lock as its FIRST statement '
      'so that two writers cannot read the same predecessor and FORK the chain (NFR-04 / gate '
      'G-1). A hand-rolled INSERT must take it too, before allocating an id.',
      lock_key
      USING ERRCODE = '42501';
  END IF;

  want_prev := qmulate_audit_expected_prev_hash(NEW."id");
  IF NEW."prevHash" IS DISTINCT FROM want_prev THEN
    RAISE EXCEPTION
      'audit_event % rejected: prevHash is computed by the server, not supplied by the client. '
      'At id % the chain allows exactly one predecessor hash, % (the rowHash of the highest id '
      'below it, or 64 zeroes at genesis); this INSERT declared %. A row that declares any other '
      'predecessor de-links the trail permanently, because audit_event is append-only and the row '
      'can never be removed (NFR-04 / gate G-1).',
      NEW."id", NEW."id", want_prev, coalesce(NEW."prevHash", '<null>')
      USING ERRCODE = '42501';
  END IF;

  want_row := qmulate_audit_row_hash(
    NEW."id", NEW."occurredAt", NEW."actorId", NEW."actorType"::text, NEW."onBehalfOfId",
    NEW."action"::text, NEW."entityType", NEW."entityId", NEW."waqfId",
    NEW."before", NEW."after", NEW."context",
    NEW."category"::text, NEW."classification"::text, want_prev);

  IF NEW."rowHash" IS DISTINCT FROM want_row THEN
    RAISE EXCEPTION
      'audit_event % rejected: rowHash is computed by the server from this row''s own content and '
      'its predecessor, not supplied by the client. Expected %, got %. Either the row is forged, '
      'or the plpgsql canonicaliser (migration 23) and canonicalJson() in src/hash-chain.ts have '
      'diverged — in which case EVERY audited write fails and the divergence is the bug, not this '
      'refusal. The write is refused rather than stored, because audit_event is append-only and a '
      'row whose hash does not reproduce is unrepairable (NFR-04 / gate G-1).',
      NEW."id", want_row, coalesce(NEW."rowHash", '<null>')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$qm_chain_bound$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §6 · AV7-AUD-F2 · THE HEAD MAY ONLY BE ADVANCED TO A HASH A REAL ROW PRODUCED
--
-- Migration 1 guarded a REWIND (`lastId` going down) and a SAME-ID REHASH. It did not guard
-- FORWARD with an arbitrary hash, and that was the whole exploit: `SET "lastId" = "lastId" + 1,
-- "lastRowHash" = 'a'×64` COMMITTED from `qmulate_app`, after which the next audited transaction
-- aborted and the one after that anchored itself to a hash no row ever produced.
--
-- The new clause is the register's named fix verbatim: `NEW."lastRowHash"` must equal the
-- `rowHash` OF `NEW."lastId"`. One primary-key lookup per audited transaction.
--
-- `lastId = 0` is exempted because that is the singleton's birth state (`ensureChainHead` INSERTs
-- `(1, 0, GENESIS)` ON CONFLICT DO NOTHING) and no `audit_event` row has id 0.
--
-- ⚠ The two original clauses are UNCHANGED and are re-asserted by the probe suite as positive
-- controls, so replacing this function cannot quietly drop them.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION qmulate_audit_chain_head_forward_only()
RETURNS trigger
LANGUAGE plpgsql
AS $qm_head_forward$
BEGIN
  IF NEW."lastId" < OLD."lastId" THEN
    RAISE EXCEPTION
      'audit_chain_head may only move forward: lastId % -> % rejected. Rewinding the head is '
      'how a truncated trail is made to verify clean (NFR-04 / gate G-1).',
      OLD."lastId", NEW."lastId"
      USING ERRCODE = '42501';
  END IF;

  -- Same id, different hash = the same position re-attested to a different value.
  IF NEW."lastId" = OLD."lastId" AND NEW."lastRowHash" IS DISTINCT FROM OLD."lastRowHash" THEN
    RAISE EXCEPTION
      'audit_chain_head lastRowHash may not be rewritten in place at lastId % (NFR-04 / gate G-1).',
      OLD."lastId"
      USING ERRCODE = '42501';
  END IF;

  -- ── AV7-AUD-F2 ──────────────────────────────────────────────────────────────────────────
  IF NEW."lastId" <> 0 AND NOT EXISTS (
    SELECT 1 FROM "audit_event"
     WHERE "id" = NEW."lastId" AND "rowHash" = NEW."lastRowHash"
  ) THEN
    RAISE EXCEPTION
      'audit_chain_head may only be advanced to a hash a real row produced: no audit_event row '
      'with id % has rowHash %. A head pointing at a hash no row produced DE-LINKS the trail '
      'permanently — the next audited transaction aborts, the one after it commits from the '
      'planted hash, and neither can be repaired, because audit_event refuses DELETE and this '
      'trigger refuses a rewind (AV7-AUD-F2, NFR-04 / gate G-1).',
      NEW."lastId", coalesce(NEW."lastRowHash", '<null>')
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END
$qm_head_forward$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §7 · KNOWN-ANSWER TEST — the two implementations are pinned to each other AT INSTALL TIME
--
-- The constant below was produced BY THE TYPESCRIPT IMPLEMENTATION, not by this file. The script
-- that produced it, and the canonical bytes it printed, are reproduced verbatim in the header of
-- `packages/database/test/av7-chain-forge.integration.test.ts` (section KAT), and that suite
-- recomputes both sides so the constant cannot rot silently.
--
-- The vector exercises every branch a real payload can reach: a nested object; an array; keys that
-- need SORTING (`z` is first on input and last in the output); an escaped double quote and an
-- escaped backslash; a LITERAL NEWLINE inside a string, which is the single most likely divergence
-- (Postgres would spell it with a two-character shorthand, the TypeScript encoder with a
-- four-hex-digit escape); Arabic text; an explicit null; a boolean; an empty object; an empty
-- array. §8 then re-checks the same parity against every row actually in the table.
--
-- ⚠ ON A FRESH DATABASE §8 IS VACUOUS (`migrate deploy` runs before `db:seed`, so the table is
-- empty and it checks zero rows). §7 is what is NON-VACUOUS in that case, which is why both exist.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DO $qm_kat$
DECLARE
  got  text;
  want text := 'f018c7efbeedb6cfda8c8d40f051bfd70d0eab4311873ee043019b869b1894e5';
BEGIN
  got := qmulate_audit_row_hash(
    123456789::bigint,
    '2026-08-19T04:05:06.789'::timestamp,
    'user-nazir-001',
    'USER',
    NULL,
    'APPROVE',
    'ApprovalRequest',
    'kat-entity-"quoted"\backslash',
    'waqf-001',
    NULL,
    '{"z":"last","a":{"nested":["one","two"],"flag":true},"empty":{},"list":[]}'::jsonb,
    '{"requestId":"kat","reasonAr":"سبب الاختبار","multi":"line1\nline2","nil":null}'::jsonb,
    'APPROVAL',
    'ROUTINE',
    repeat('0', 64));

  IF got <> want THEN
    RAISE EXCEPTION
      'migration 23 REFUSES TO INSTALL: the plpgsql canonicaliser disagrees with '
      'canonicalJson()/computeHash() in packages/database/src/hash-chain.ts on the known-answer '
      'vector. Expected %, computed %. Installing the INSERT guard now would refuse EVERY audited '
      'write on this database. Fix the canonicaliser (or regenerate the constant from the '
      'TypeScript implementation if IT changed) before re-running.',
      want, got
      USING ERRCODE = '22P02';
  END IF;

  RAISE NOTICE 'migration 23 §7: known-answer vector matches TypeScript (%).', got;
END
$qm_kat$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §8 · SELF-VERIFICATION OVER EVERY ROW ALREADY IN THE TABLE
--
-- Same refusal as §7 and for the same reason: if a single existing row's stored `rowHash` does not
-- reproduce through the SQL path, then the SQL path is wrong about some shape the application
-- really writes, and the INSERT guard would take the whole system down. Better to fail the
-- migration.
--
-- MEASURED at authoring time on a `--reset` → `migrate deploy` → `db:seed` cluster (embedded
-- PostgreSQL 17.10, port 54423): 176 rows, 176 reproduced, 0 mismatches.
-- ⚠ Postgres version parity with CI's `postgres:16-alpine` is best-effort on this machine
-- (`scripts/README.md`), and this file's behaviour must still be proven there.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DO $qm_selfcheck$
DECLARE
  bad      record;
  n_rows   bigint;
  n_bad    bigint := 0;
BEGIN
  SELECT count(*) INTO n_rows FROM "audit_event";

  FOR bad IN
    SELECT e."id",
           e."rowHash" AS stored,
           qmulate_audit_row_hash(
             e."id", e."occurredAt", e."actorId", e."actorType"::text, e."onBehalfOfId",
             e."action"::text, e."entityType", e."entityId", e."waqfId",
             e."before", e."after", e."context",
             e."category"::text, e."classification"::text, e."prevHash") AS recomputed
      FROM "audit_event" e
     ORDER BY e."id"
  LOOP
    IF bad.stored <> bad.recomputed THEN
      n_bad := n_bad + 1;
      RAISE WARNING 'migration 23 §8: audit_event % stored % but recomputes to %',
        bad."id", bad.stored, bad.recomputed;
    END IF;
  END LOOP;

  IF n_bad > 0 THEN
    RAISE EXCEPTION
      'migration 23 REFUSES TO INSTALL: % of % existing audit_event rows do not reproduce their '
      'stored rowHash through the plpgsql canonicaliser (see the WARNINGs above for the ids). '
      'Either the canonicaliser diverges from src/hash-chain.ts on a shape those rows contain, or '
      'those rows were already corrupt. Installing the INSERT guard now would refuse every '
      'audited write.',
      n_bad, n_rows
      USING ERRCODE = '22P02';
  END IF;

  RAISE NOTICE 'migration 23 §8: % existing audit_event row(s) reproduce their stored rowHash.',
    n_rows;
END
$qm_selfcheck$;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §9 · THE TRIGGER, INSTALLED LAST
--
-- Deliberately after §7 and §8: a migration that could not prove parity must never leave a guard
-- behind that refuses every write. (Prisma runs each migration in one transaction, so a RAISE
-- above rolls the whole file back anyway — the ordering is for the reader.)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
DROP TRIGGER IF EXISTS audit_event_chain_bound ON "audit_event";
CREATE TRIGGER audit_event_chain_bound
  BEFORE INSERT ON "audit_event"
  FOR EACH ROW EXECUTE FUNCTION qmulate_audit_event_chain_bound();

ALTER TABLE "audit_event" ENABLE ALWAYS TRIGGER audit_event_chain_bound;


-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- §10 · EXECUTE IS REVOKED FROM PUBLIC ON EVERY FUNCTION THIS FILE CREATES
--
-- `ALTER DEFAULT PRIVILEGES … REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` (migration 10 §2.4) does
-- NOT cover functions created later — it removes the recorded default and Postgres then falls back
-- to the BUILT-IN default, which grants EXECUTE to PUBLIC. Migration 12 §6 learned that the hard
-- way and S6/E5 learned it again (three new trigger functions landed PUBLIC-executable and posture
-- assertion 1f went red naming all three). So the sweep is called explicitly, as every migration
-- that creates a function must.
--
-- All six functions here are SECURITY INVOKER, so the sweep grants EXECUTE back to `qmulate_app`
-- and `qmulate_provisioner` — which confers nothing they did not already have: five are pure
-- functions over values the caller already holds, and the sixth reads `audit_event`, which the app
-- role can already SELECT. The hash ALGORITHM was never the secret (it is in the repository).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
SELECT qmulate_revoke_public_function_execute();
