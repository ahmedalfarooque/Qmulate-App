-- 00000000000057 · THE DEFAULT FULL-ACCESS PROFILE (product owner, 2026-10-03).
--
-- Owner decision: a newly registered account does NOT wait for an administrator. It is ACTIVE on
-- registration and carries the organisation's DEFAULT access level, which gives it the application's
-- full working profile on EVERY endowment — present and future — while the Users / Roles screens
-- remain the place where an administrator later narrows, re-levels or removes that access.
--
-- Two new facts on `access_level`:
--   · "seatsAllEndowments"      — holders are treated as seated on every live endowment with the
--                                 level's seat template (role + permissions). Resolved per request
--                                 in the kernel from THIS flag; nothing is copied per endowment, so a
--                                 new endowment is covered the moment it exists. Reserved-matter
--                                 authority (approve / sign / access-matrix writes) is NOT part of a
--                                 template seat: those still require a recorded grant row, checked
--                                 by the database as before.
--   · "isDefaultForNewAccounts" — at most ONE level (partial unique index). The registration hook
--                                 assigns it and activates the account.
--
-- The FULL level: every organisation READ (so Users, Roles & Permissions and the Audit Log are
-- visible) and, as the working seat on every endowment, the AUTHORIZED_REP preset — the one
-- non-Nazir role whose preset reaches every application section (Distributions and Financials
-- included) and carries NO approve / sign verb. Editing other people's access stays with ADMIN-level
-- holders and the primary administrator (organisation `admin:*:write`), never with a seat.
-- ⚠ Judgment call surfaced to the owner: AUTHORIZED_REP is the Nazarah regulation's "authorised
-- representative" role; if a lighter working profile is wanted later, edit the FULL level's seat
-- template on the Roles & Permissions screen — nothing is hard-coded.
--
-- Backfill: ACTIVE accounts that were left with no level, and accounts still PENDING_APPROVAL, get
-- the default profile — the "ask your administrator" state is retired for ordinary registration.
-- The primary administrator and anyone already levelled are untouched. Idempotent.

ALTER TABLE "access_level" ADD COLUMN IF NOT EXISTS "seatsAllEndowments"      boolean NOT NULL DEFAULT false;
ALTER TABLE "access_level" ADD COLUMN IF NOT EXISTS "isDefaultForNewAccounts" boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "access_level_one_default"
  ON "access_level" ((true)) WHERE "isDefaultForNewAccounts";

INSERT INTO "access_level"
  ("id", "key", "nameEn", "nameAr", "permissions", "seatRole", "seatPermissions", "isSystem",
   "seatsAllEndowments", "isDefaultForNewAccounts")
VALUES
  ('level-full', 'FULL', 'Full access', 'صلاحية كاملة',
   ARRAY['admin:user:read','admin:access_level:read','admin:access_matrix:read','admin:setting:read','audit:event:read'],
   'AUTHORIZED_REP',
   ARRAY['endowment:waqf:read','endowment:waqf:write','endowment:deed:read','endowment:deed:write','endowment:asset:read','endowment:asset:write',
         'beneficiary:beneficiary:read','beneficiary:beneficiary:write','beneficiary:ubo:read','beneficiary:ubo:write',
         'finance:transaction:read','finance:transaction:write','finance:bank_account:read','finance:bank_account:write',
         'distribution:run:read','distribution:run:initiate','distribution:line_item:read','distribution:bank_movement:read','distribution:bank_movement:initiate',
         'fee:nazir_fee:read','compliance:task:read','compliance:task:write','compliance:filing:read','compliance:filing:write',
         'legal:case:read','legal:case:write','legal:reserved_matter:read','legal:reserved_matter:write',
         'document:document:read','document:document:write','reporting:report:read','audit:event:read',
         'approval:request:read','approval:request:initiate'],
   true, true, true)
ON CONFLICT ("key") DO UPDATE
  SET "seatsAllEndowments"      = true,
      "isDefaultForNewAccounts" = true,
      "seatRole"                = EXCLUDED."seatRole",
      "seatPermissions"         = EXCLUDED."seatPermissions";

-- The ADMIN level also spans every endowment with the same working seat: an administrator is not
-- seated one endowment at a time, and its administrative authority is the ORGANISATION permission
-- set (`admin:*:write`), not the seat.
UPDATE "access_level"
   SET "seatsAllEndowments" = true,
       "seatRole"           = 'AUTHORIZED_REP',
       "seatPermissions"    = ARRAY['endowment:waqf:read','endowment:waqf:write','endowment:deed:read','endowment:deed:write','endowment:asset:read','endowment:asset:write',
                                'beneficiary:beneficiary:read','beneficiary:beneficiary:write','beneficiary:ubo:read','beneficiary:ubo:write',
                                'finance:transaction:read','finance:transaction:write','finance:bank_account:read','finance:bank_account:write',
                                'distribution:run:read','distribution:run:initiate','distribution:line_item:read','distribution:bank_movement:read','distribution:bank_movement:initiate',
                                'fee:nazir_fee:read','compliance:task:read','compliance:task:write','compliance:filing:read','compliance:filing:write',
                                'legal:case:read','legal:case:write','legal:reserved_matter:read','legal:reserved_matter:write',
                                'document:document:read','document:document:write','reporting:report:read','audit:event:read',
                                'approval:request:read','approval:request:initiate']
 WHERE "key" = 'ADMIN';

UPDATE "user"
   SET "accessLevelId"   = 'level-full',
       "statusChangedAt" = CURRENT_TIMESTAMP,
       "statusReason"    = 'default full-access profile (migration 57)'
 WHERE "status" = 'ACTIVE' AND NOT "isPrimaryAdmin" AND "accessLevelId" IS NULL;

UPDATE "user"
   SET "status"          = 'ACTIVE',
       "accessLevelId"   = COALESCE("accessLevelId", 'level-full'),
       "statusChangedAt" = CURRENT_TIMESTAMP,
       "statusReason"    = 'registration no longer waits for approval (migration 57)'
 WHERE "status" = 'PENDING_APPROVAL';
