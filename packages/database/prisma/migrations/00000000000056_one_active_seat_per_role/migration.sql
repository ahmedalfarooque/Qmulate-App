-- 00000000000056 · ONE ACTIVE SEAT PER (USER, ENDOWMENT, ROLE) — uniqueness over LIVE rows only.
--
-- Two earlier rules collided the first time a seat was revoked and re-issued:
--   · migration 3/4: "revocation is one-way — un-revoking restores authority with no issue record;
--     insert a new grant instead" (a BEFORE UPDATE guard on `revokedAt`), and
--   · the init migration's FULL unique index on ("userId","waqfId","role"), which made that new
--     insert impossible while the revoked row (kept on purpose, it IS the history) still existed.
-- Result: a person unseated once could never be seated again in the same role (SQLSTATE 23505).
--
-- Resolution: uniqueness is what the rule always meant — at most ONE LIVE seat per (user,
-- endowment, role). Revoked and retired rows stay, are readable history, and no longer block a new
-- issue record. Nothing about admission, authority or audit changes; the one-way revocation guard
-- stays exactly as it is.
--
-- Idempotent: safe to re-run.

DROP INDEX IF EXISTS "waqf_access_grant_userId_waqfId_role_key";

CREATE UNIQUE INDEX IF NOT EXISTS "waqf_access_grant_one_active_seat"
  ON "waqf_access_grant" ("userId", "waqfId", "role")
  WHERE "revokedAt" IS NULL AND "deletedAt" IS NULL;
