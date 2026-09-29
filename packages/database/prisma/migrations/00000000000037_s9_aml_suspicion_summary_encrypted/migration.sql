-- Migration 37 — S9-4b: `AmlReport.suspicionSummary` joins the field-encryption set.
--
-- Owner ruling 2026-08-25 (S4 memo, fourth batch, S8-Q10 "Field-encrypt now"): the compartment
-- controls who reads; encryption protects against the database itself leaking. The column is
-- renamed `suspicionSummary` → `suspicionSummaryEnc` and registered in `ENCRYPTED_FIELDS`
-- (`packages/database/src/extensions/encryption.ts`), which is the MECHANISM — the suffix is only
-- the convention that records where the data ends up (plaintext at the application boundary,
-- ciphertext at rest). No `...Hmac` sibling, deliberately: subject search is served by
-- `relatedPartyRefs` (plain ids), and a searchable digest of free suspicion text has no lookup
-- key a caller could ever hold.
--
-- ⚠ THE GUARD BELOW REFUSES TO APPLY OVER EXISTING ROWS, AND THAT IS THE POINT. Encryption keys
-- are application-side (`FIELD_ENCRYPTION_KEYS`); SQL cannot encrypt, so applying this rename
-- over live rows would leave PLAINTEXT AT REST under a column name that promises ciphertext —
-- the read path would keep working (`isCipherEnvelope` passes plaintext through), and nothing
-- would ever tell anyone. A deployment that holds real SAR rows must run a keyed backfill
-- (encrypt each row through the application, under the compartment's own audit trail) and only
-- then apply this migration. Today no deployment holds one: the fixture seeds no AML rows (the
-- one AML_RESTRICTED template is EVENT-recurrence and never pre-materialises), and integration
-- probes create theirs at runtime through the application path.
--
-- The migration-29 `ENABLE ALWAYS` guards on this table (`aml_report_no_delete`,
-- `aml_report_no_truncate`) are untouched: a column rename is not a row deletion, and the SAR
-- retention floor those guards cite now has its configurable figure
-- (`Setting retention.aml.minimumYears`, ⚠ unverified vs primary AML law — same ruling batch).

DO $$
DECLARE
  live_rows integer;
BEGIN
  SELECT count(*) INTO live_rows FROM "aml_report";
  IF live_rows > 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format(
        'migration 37 refuses: aml_report holds %s row(s), and SQL cannot encrypt them '
        '(FIELD_ENCRYPTION_KEYS is application-side). Renaming now would leave plaintext at rest '
        'under a column name that promises ciphertext. Run a keyed application-side backfill '
        'first, then re-apply.', live_rows);
  END IF;
END $$;

ALTER TABLE "aml_report" RENAME COLUMN "suspicionSummary" TO "suspicionSummaryEnc";
