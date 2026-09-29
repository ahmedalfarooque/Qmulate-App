# Hand-authored SQL in `packages/database`

Prisma's schema language cannot express any of the following, and all of them are load-bearing
controls rather than optimisations:

| Control                                  | Why it cannot be a Prisma schema construct                                | Gate / rule      |
| ---------------------------------------- | ------------------------------------------------------------------------- | ---------------- |
| `audit_event` append-only triggers        | Prisma has no trigger DSL                                                   | G-1 / NFR-04     |
| `qmulate_app_runtime` role + GRANTs       | Prisma does not manage roles or privileges                                  | G-1 / NFR-04     |
| Shart al-Waqif immutability trigger       | Immutability is a runtime rule, not a column type                           | Binding rule 1   |
| `transaction` corpus/income CHECKs        | Prisma has no CHECK-constraint DSL                                          | Binding rule 1   |
| `document` retention / legal-hold guard   | Prisma has no trigger DSL                                                   | NFR-07 / BR-702  |
| `setting_global_key_unique` partial index | Prisma has no partial-index DSL, and NULLs defeat `@@unique([waqfId, key])` | NFR-13           |
| `audit_chain_head_singleton` CHECK        | Prisma has no CHECK-constraint DSL                                          | NFR-04           |

They live in a single hand-written migration:

```
prisma/migrations/00000000000001_init_append_only_audit/migration.sql
```

**This file is not generated. `prisma migrate dev` must never overwrite it.**

---

## Ordering: this migration runs SECOND

The migration `ALTER`s and attaches triggers to tables it does not create, so the
Prisma-generated init migration has to run first. Prisma applies migration directories in
**lexicographic order of the directory name**, and a directory named `2026…` sorts *after*
`00000000000001…`. So generating the init migration in the ordinary way puts it in the wrong
place.

The supported fix is to generate the init migration by hand into a directory that sorts first:

```bash
cd packages/database
mkdir -p prisma/migrations/00000000000000_init
pnpm exec prisma migrate diff \
  --from-empty \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/00000000000000_init/migration.sql
```

Resulting order:

```
prisma/migrations/
  00000000000000_init/                     <- generated: every table, index, FK, enum
  00000000000001_init_append_only_audit/   <- hand-written: triggers, role, CHECKs   (this file)
```

If the base tables are missing when it runs, the migration **fails loudly** with an exception
naming the missing tables and repeating the command above. That is deliberate: a database whose
`audit_event` table has no append-only trigger must never be mistaken for a healthy one, so
skipping the guards with a warning is not an option.

---

## Re-applying the guards: `qmulate_apply_guards()`

Every table-dependent statement lives inside one idempotent function. After any change that
recreates a guarded table — a reset, a `migrate dev` regeneration, a restore from a dump taken
before the guards existed — re-apply them with:

```sql
SELECT qmulate_apply_guards();
```

Running it repeatedly is safe (assertion **A12**): `CREATE OR REPLACE FUNCTION`,
`DROP TRIGGER IF EXISTS` before each `CREATE TRIGGER`, `CREATE ... IF NOT EXISTS`, and a
`pg_constraint` lookup before every `ADD CONSTRAINT` (Postgres has no
`ADD CONSTRAINT IF NOT EXISTS`).

### ⚠ THE RE-ENTRY ORDER, AND WHY THE LAST ONE IS LAST

There is now one re-apply function per hand-authored migration, and they must run **in this order**:

```sql
SELECT qmulate_apply_guards();                  -- migration 1  (append-only audit, Shart, retention)
SELECT qmulate_apply_e2_guards();               -- migration 3  (the authority plane)
SELECT qmulate_apply_e2_guard_gaps();           -- migration 4  (the verbs migration 3 left open)
SELECT qmulate_apply_e2_grant_admission();      -- migration 5  (who may INSERT a grant)
SELECT qmulate_apply_e2_corpus_retention();     -- migration 6
SELECT qmulate_apply_e2_retention_remainder();  -- migration 8
SELECT qmulate_apply_e2_close_system_marker();  -- migration 9  (removes the forgeable SYSTEM disjunct)
SELECT qmulate_apply_privilege_matrix();        -- migration 10 — ALWAYS LAST
```

`qmulate_apply_privilege_matrix()` is last because it is the only one that reads the *catalogue* rather
than writing to it: it enumerates `pg_tables`, `pg_sequences` and `pg_proc` and issues the GRANT/REVOKE
matrix over whatever it finds. A function created by an earlier step in this list would otherwise have no
`EXECUTE` grant for the runtime role, because migration 10 revokes the PUBLIC default. **Any future
migration that adds a table, a sequence or a function must end with that call.**

### ⚠ MIGRATIONS 10 AND 11 ARE HAND-AUTHORED AND MUST NEVER BE REGENERATED

`prisma migrate dev` writes new directories and does not edit existing ones, so the risk is not
overwriting — it is a reviewer assuming they are Prisma output and "regenerating" them. They are not
derivable from `schema.prisma`: they carry the role names, the per-table privilege matrix, the RLS
policies and the posture-assertion function, none of which Prisma models. Migration 10 additionally
contains a rule that is easy to violate by accident:

> **No comment in migration 10 or 11 may contain a `/` followed by a `*`.** PostgreSQL block comments
> **nest**, so a path written with a glob inside a `/* … */` block opens a nested comment that never
> closes and the migration fails with `42601 unterminated comment`. MEASURED the hard way. Every comment
> in both files is a `--` line comment for this reason.

---

## Changing the schema without clobbering this file

`prisma migrate dev` writes a **new** directory; it does not edit existing ones. So the normal
flow is safe:

```bash
# 1. edit prisma/schema.prisma
# 2. create the migration WITHOUT applying it, so you can read the SQL first
pnpm exec prisma migrate dev --create-only --name <change>
# 3. review prisma/migrations/<timestamp>_<change>/migration.sql
# 4. apply
pnpm exec prisma migrate dev
```

Two things to watch:

1. **Did the change recreate a guarded table?** A column type change can make Prisma drop and
   recreate a table, which silently takes its triggers, CHECKs and grants with it. If the
   generated SQL touches `audit_event`, `audit_chain_head`, `waqf`, `transaction`, `document` or
   `setting`, append this line to the end of the generated `migration.sql`:

   ```sql
   SELECT qmulate_apply_guards();
   ```

2. **The shadow database.** `migrate dev` replays every migration into a throwaway database to
   detect drift, so this file runs there too. It is written to survive that:
   `CREATE ROLE` is wrapped so a connection without `CREATEROLE` emits a `NOTICE` instead of
   failing, and the GRANT block is skipped when the role is absent.

   Since ADR-0008 round 6, `migrate dev` also needs `CREATEDB` on the migrate connection to create that
   shadow database — `scripts/provision-db-roles.ts` grants it to `qmulate_owner` for exactly this
   reason (production runs `migrate deploy` only and may drop it). Roles live in cluster-wide
   `pg_roles`, so the shadow replay of migrations 10 and 11 finds them already present and their
   GRANT/REVOKE statements succeed — **but only if provisioning ran before the first `migrate dev`.**

   ⚠ **AND THAT TOLERANCE IS THE MOST DANGEROUS PROPERTY IN THIS FILE.** A database migrated before the
   roles existed ends up fully migrated, seedable and green with the privilege matrix **completely
   unenforced**, because migration 10 §4 degrades to a `RAISE NOTICE`. The hard failure deliberately
   lives elsewhere: `test/authorization-plane-privilege.integration.test.ts` FAILS (never skips) when the
   posture is absent, and CI runs it. Deleting that test deletes the only thing that notices.

   Consequence worth knowing: **CI and production must apply migrations with a privileged
   connection.** Without `CREATEROLE`, `qmulate_app_runtime` never exists and assertion **A4**
   (privilege assertions) fails — while the append-only trigger, which is the control that
   actually matters, still holds.

---

## Verifying the guards are live

```sql
-- triggers
SELECT tgname, tgrelid::regclass AS "table"
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgrelid::regclass::text IN ('audit_event','audit_chain_head','waqf','document')
ORDER BY 2, 1;
-- expect: audit_chain_head_no_delete, audit_chain_head_no_truncate, audit_event_no_mutate,
--         audit_event_no_mutate_row, audit_event_no_truncate, document_no_truncate,
--         document_retention_guard, waqf_shart_immutable

-- CHECK constraints on transaction (expect 7)
SELECT conname FROM pg_constraint
WHERE conrelid = 'public.transaction'::regclass AND contype = 'c'
ORDER BY conname;

-- partial unique index on setting
SELECT indexname FROM pg_indexes
WHERE tablename = 'setting' AND indexname = 'setting_global_key_unique';

-- privileges (assertion A4)
SELECT
  has_table_privilege('qmulate_app_runtime','audit_event','SELECT')   AS can_select, -- t
  has_table_privilege('qmulate_app_runtime','audit_event','INSERT')   AS can_insert, -- t
  has_table_privilege('qmulate_app_runtime','audit_event','UPDATE')   AS can_update, -- f
  has_table_privilege('qmulate_app_runtime','audit_event','DELETE')   AS can_delete, -- f
  has_table_privilege('qmulate_app_runtime','audit_event','TRUNCATE') AS can_truncate; -- f
```

Smoke test for G-1 — all three must be rejected with SQLSTATE `42501`:

```sql
UPDATE "audit_event" SET "action" = 'CREATE' WHERE "id" = (SELECT MIN("id") FROM "audit_event");
DELETE FROM "audit_event" WHERE "id" = (SELECT MIN("id") FROM "audit_event");
TRUNCATE "audit_event";
```

And for Binding rule 1 — rejected unless a reserved matter is in force:

```sql
UPDATE "waqf" SET "shartAlWaqif" = '{}'::jsonb WHERE "id" = 'waqf-001';
```

---

## Two things the database cannot enforce for you

**The trigger cannot record its own refusal.** A `BEFORE UPDATE` trigger on `audit_event` cannot
write to `audit_event` — that is the table it is protecting. Evidence for a raw-SQL tampering
attempt is the Postgres error log; the API-layer path records an `ACCESS_DENIED` audit event
instead. Verification V-7 states this explicitly rather than claiming the raw attempt
self-audits.

**An owner bypasses GRANTs.** On Railway the application usually connects as the database owner,
and an owner ignores table privileges — but not triggers. The trigger is therefore the
load-bearing control and the role is defence in depth for a future dedicated non-owner login
(`APP_DATABASE_URL`). G-1 must be provable by the trigger alone.

---

## Names shared with TypeScript

Changing either side alone breaks the pair.

| SQL                                       | TypeScript                                                       |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `qmulate.reserved_matter_approval_id` GUC | `RESERVED_MATTER_APPROVAL_GUC` — `src/context.ts`                  |
| role `qmulate_app_runtime`                | `APP_RUNTIME_ROLE` — `src/context.ts`                              |
| advisory lock key `7233057419042001`      | `AUDIT_CHAIN_LOCK_KEY` — `src/hash-chain.ts`                       |
| genesis `prevHash` (64 zeroes)            | `GENESIS_HASH` — `src/hash-chain.ts`                               |
| sequence behind `audit_event.id`          | resolved at runtime via `pg_get_serial_sequence`, not hard-coded   |

Column names are Prisma **camelCase** while table names are snake_case (`@@map`). Every column
identifier in raw SQL must therefore be double-quoted — an unquoted `waqfid` will not match
`"waqfId"`.
