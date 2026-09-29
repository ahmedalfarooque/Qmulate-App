-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Migration 45 · S10/T2 — the notification reminder floor.  (the dedupe gets a FLOOR, not a CHECK)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
--
-- WHY NOW, in the code's own words: `deadline.evaluate`'s reminder write has carried this comment
-- since S9-3d — "A CHECK, NOT A CONSTRAINT … sound for the shipped shape — one scheduled sweep per
-- endowment per day … If this table ever gets a second writer, the expression index is owed."
-- T2 wires the sweep onto pg-boss with a real retry policy and the two-worker deployment is a
-- fact, not a hypothesis: THE SECOND WRITER EXISTS, SO THE INDEX IS OWED, by that comment's own
-- terms. (The transport does NOT cover this: pg-boss's exclusive window is state <= 'active', so
-- a completed same-day job frees its key — measured and pinned in
-- packages/jobs/test/pgboss-transport.integration.test.ts, "THE HONEST DELTA".)
--
-- TWO ARMS, BOTH REQUIRED — the second closes a NULL trapdoor the first cannot see:
--
--   1. The partial UNIQUE EXPRESSION index: at most ONE 'deadline.reminder' row per
--      (userId, payload->>'idempotencyKey'). Expression indexes are outside Prisma's schema
--      language, which is why this lives in raw SQL with a schema.prisma comment pointing here.
--
--   2. The CHECK: a 'deadline.reminder' row MUST carry a non-empty idempotencyKey. Without it
--      the index has a hole exactly where a malformed writer would fall through — in Postgres,
--      NULLs DO NOT CONFLICT in a unique index, so a key-less reminder row would take unlimited
--      duplicates while the comment above said "structural". A floor with a silent hole is worse
--      than a declared check. (The index predicate still carries `payload ? 'idempotencyKey'` as
--      belt: the index must stay correct even if the CHECK is ever dropped in isolation.)
--
-- WHAT THE RUNTIME DOES WITH A VIOLATION, decided here and recorded here because the obvious
-- catch-and-continue DOES NOT WORK: a 23505 raised inside Prisma's interactive transaction
-- ABORTS the transaction (25P02 — the same fact the escalation block documents for migration
-- 41's index). The losing evaluator's whole per-endowment transaction rolls back, its job FAILS,
-- and the transport's retry re-runs it — on the retry, the pre-existing read-then-write check
-- sees the winner's row and reports `remindersAlreadySent`. Loud, convergent, and never a
-- duplicate. The two-worker integration test measures exactly that composition.
--
-- The 'deadline.escalation' notification kind deliberately has NO floor here: escalation notices
-- are written only inside the branch that just WON migration 41's `escalation_event` one-per-
-- rung-per-day unique index, in the same transaction — a losing concurrent evaluator aborts on
-- that index before reaching a notice. The event's floor is transitively the notice's.
--
-- ADR-0004 discipline: no backfill, no remap. The evaluator has written `idempotencyKey` into
-- every reminder payload since the kind existed, so no conforming row can violate the CHECK; if
-- a hand-written row somehow does, ADD CONSTRAINT refuses to apply and a human decides — this
-- migration will not "fix" data to make itself fit.

ALTER TABLE "notification"
  ADD CONSTRAINT "notification_reminder_requires_idempotency_key"
  CHECK (
    "kind" <> 'deadline.reminder'
    OR ("payload" ? 'idempotencyKey' AND coalesce("payload"->>'idempotencyKey', '') <> '')
  );

CREATE UNIQUE INDEX "notification_reminder_single_flight"
  ON "notification" ("userId", (("payload"->>'idempotencyKey')))
  WHERE "kind" = 'deadline.reminder' AND "payload" ? 'idempotencyKey';
