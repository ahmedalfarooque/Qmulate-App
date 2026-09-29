/**
 * EVERY GUARDED TABLE IS GUARDED ON EVERY VERB — and a grant has ONE off-switch, which is one-way.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE STRUCTURAL LESSON THIS FILE EXISTS TO PIN (C-03, C-09, C-10, C-13)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S2 shipped four `BEFORE UPDATE` triggers and called the invariants they carry "enforced in
 * Postgres". A `BEFORE UPDATE` trigger is a proof about ONE VERB. Adversarial review walked around
 * three of them without touching an UPDATE at all:
 *
 *   • `waqf_shart_immutable` — `DELETE FROM "waqf"` + re-INSERT substituted a founder's Shart
 *     al-Waqif. `audit_event` moved 131 → 131 and the G-1 chain verified clean over it (C-03).
 *   • `distribution_status_transition` — a run was BORN `EXECUTED` naming an approval that did not
 *     exist, because the trigger never saw an INSERT (C-10).
 *   • `approval_request_authority` / `waqf_access_grant_role_immutable` — TRUNCATE fires no row
 *     triggers at all, so one statement empties the authorization plane (C-13, C-09).
 *
 * A live `pg_trigger` census was what made the pattern visible: `waqf` was the only guarded table
 * with no DELETE coverage while its siblings covered exactly the verbs it missed. THE CENSUS IS
 * THEREFORE AN ASSERTION HERE, not a one-off investigation — so the next guard added to a table
 * cannot ship UPDATE-only unnoticed.
 *
 * MUTATION THAT RE-BREAKS THE CENSUS: remove any trigger named in `VERB_COVERAGE` from
 * `qmulate_apply_e2_guard_gaps()`, or create one without `ENABLE ALWAYS`.
 *
 * ── AND SINCE S4/E3 (CENSUS-1) THE CENSUS SPANS VERBS, NOT TABLES ───────────────────────────
 * `VERB_COVERAGE` below is a `> 0` question — "does SOMETHING fire on this verb?" — which a
 * DUPLICATE guard only makes truer. Migration 12 shipped exactly that, on `reclassification_event`,
 * and it cost 24 retention tests reported as SKIPPED plus a row leaked into the next file. The
 * `CENSUS-1` describe block adds the two assertions that see it, and MUTATES the catalogue in a
 * rolled-back transaction to prove they do. Read its header before changing either.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  PROBE_BLOCKED,
  RETENTION_REMAINDER_SCAFFOLDING_GUARDS,
  RETENTION_SCAFFOLDING_GUARDS,
  assertGuardsInstalled,
  authzScaffoldingSql,
  privilegedPrisma,
  closeDatabase,
  ensureSeeded,
  guardProbeSql,
  hasDatabase,
  runProbe,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('C-03 / C-09 / C-10 / C-13 (guard VERB coverage, and the grant off-switch)');

const WAQF_A = 'waqf-001';
/** ZERO grants in the fixture, by design — so a test grant for them collides with nothing. */
const UNSCOPED = 'user-unscoped';
const GRANTED_BY = 'user-seed-admin';
const TEST_GRANT = 'grant-verb-9001';

/**
 * WHICH VERBS EACH GUARDED TABLE MUST BE COVERED ON, and by which trigger.
 *
 * `covers` is the set of statement kinds the table's guards must, between them, intercept. The
 * assertion reads `pg_trigger.tgtype`, so it is about what Postgres will actually FIRE, not about
 * what a migration file appears to say.
 *
 * `waqf` DELETE is refused outright rather than conditionally: the row carries a >= 10-year
 * retention obligation (NFR-07 / BR-702) and `deletedAt` is its only legal retirement (ADR-0006).
 *
 * `approval_request` and `waqf_access_grant` NOW CARRY A `D` ENTRY. They did not until
 * `00000000000005_e2_grant_admission`, and the `todo` at the end of this file said so out loud
 * ("NOT CLOSED — raw `DELETE FROM \"waqf_access_grant\"` is still permitted … Land the trigger and
 * those cleanups as ONE change"). That change has landed: `waqf_access_grant_no_delete` and
 * `approval_request_no_delete` refuse a DELETE on any row THE AUDIT TRAIL RECORDS, which after
 * migration 5's admission control is every row a legitimate path can create.
 *
 * `waqf_access_grant` additionally carries an `I` guard — `waqf_access_grant_admission` — asserted
 * in detail in `grant-admission.integration.test.ts`.
 *
 * ⚠ `I` IS NOW PART OF THIS TABLE, AND `asset` IS IN IT (CENSUS-2, S4/E3 round 2). The previous
 * version of this comment said INSERT coverage "is not a property any OTHER guarded table here
 * needs" — and `asset` needed it: `asset_identity_guard` gated a MOVE into `EXPROPRIATED` /
 * `SUBSTITUTED_ISTIBDAL` and said nothing about a row BORN in one, so both INSERTs committed as
 * `qmulate_app` with no approval while the UPDATE was refused 42501. CENSUS-2 below states the RULE
 * that generates these `I` entries, so the next value-transition guard cannot ship UPDATE-only.
 */
const VERB_COVERAGE: readonly { table: string; covers: readonly ('I' | 'U' | 'D' | 'T')[] }[] = [
  // ⚠ `I` SINCE MIGRATION 23 (AV7-AUD-F1). `covers` asks "does SOMETHING fire on this verb", and
  // until that migration the answer for INSERT was NO — which is precisely how a forged, internally
  // consistent event was appended on `qmulate_app` and pronounced authentic by `verifyChain()`. The
  // `I` guard CONSTRAINS the append (both hash columns are recomputed server-side and a mismatch is
  // refused); it does not forbid it, and it must not, since every role holds INSERT by design.
  { table: 'audit_event', covers: ['I', 'U', 'D', 'T'] },
  { table: 'document', covers: ['U', 'D', 'T'] },
  // ⊕ S12-3b (migration 53): the BIRTH is governed — `waqf_birth_admission` on I.
  { table: 'waqf', covers: ['I', 'U', 'D', 'T'] },
  { table: 'approval_request', covers: ['I', 'U', 'D', 'T'] },
  { table: 'waqf_access_grant', covers: ['I', 'U', 'D', 'T'] },
  { table: 'distribution', covers: ['I', 'U', 'T'] },
  { table: 'asset', covers: ['I', 'U', 'D', 'T'] },
  // ⚠ `trusteeship_deed` JOINS THIS TABLE WITH MIGRATION 17 (owner-decision memo Q10). It carried
  // `D` and `T` since migration 6 and `U` on the primary key alone since migration 16 — while every
  // FACT the appointment records was editable by the least-privileged role. MEASURED before
  // migration 17, as `qmulate_app` with no approval, each probe rolled back: `primaryNazir`,
  // `ksaResident`, `authorizedRepName` + `jointlyLiable` and `deletedAt` ALL COMMITTED. `U` is now
  // an outright refusal for every seat for the appointment's own FACTS
  // (`trusteeship_deed_no_update`). NOT `I`: the initial recording is the nazir seat's, and an INSERT
  // trigger arriving here would mean somebody decided the birth needs an authority — migration 17
  // §4.4 refuses to let that happen silently.
  //
  // ⚠ AND SINCE MIGRATION 18 THAT `U` IS COLUMN-CLASSIFIED (AV5-02, HIGH). Migration 17's whole-row
  // seal also sealed the BR-109/NFR-09 ELIGIBILITY ASSESSMENT — ten criteria plus the three-column
  // verification event — and thereby made a regulatory obligation unrecordable on all five seeded
  // appointments (MEASURED through `deed.upsert`: `INTERNAL_SERVER_ERROR`, stamp still null). Those
  // thirteen columns (`qmulate_trusteeship_deed_assessment_columns()`) now move ONLY as a recorded
  // verification event; every DEED FACT stays refused outright. The census entry is unchanged — the
  // question here is "does something fire on this verb?", and the answer is still yes.
  { table: 'trusteeship_deed', covers: ['U', 'D', 'T'] },
  // ⚠ `transaction` JOINS THIS TABLE WITH MIGRATION 19 (E5). It has carried `D` and `T` since
  // migration 6's retention guards — but NOTHING on `U`, and that is where the corpus lived.
  // MEASURED before migration 19, as the least-privileged role, no approval:
  //
  //     UPDATE "transaction" SET "receiptClass"='INCOME', "capitalSource"=NULL WHERE "id"='rev-004'
  //       → COMMITTED. SAR 20,000,000 of expropriation compensation — CORPUS — became
  //         distributable ghallah, and `audit_event` for that row moved 1 → 1.
  //
  // This is the shape the census exists to make impossible to ship unnoticed: a table guarded on
  // the verbs somebody happened to think of, with the invariant living on the one they did not.
  // `U` is now covered by THREE triggers with three different jobs (corpus class immutability,
  // endowment/account immutability, dedicated-account-only). The census question is "does
  // something fire on this verb?", so three is one answer — but CENSUS-1's duplicate-guard rule
  // applies, and `RETENTION_SCAFFOLDING_GUARDS` still names ONE guard per table for the DELETE
  // suspension, which these do not touch (they are all `BEFORE UPDATE`/`BEFORE INSERT`).
  //
  // `I` is covered too — `transaction_dedicated_account_only` fires on INSERT, because BR-501's
  // personal-funds leg is about a receipt being CREATED against a non-dedicated account.
  { table: 'transaction', covers: ['I', 'U', 'D', 'T'] },
  // ⊕ S9-3c (migration 40). `U`, `D` and `T` — and deliberately NOT `I`. The birth of a material
  // change needs no authority: recording that an asset changed on a date is the honest act, and an
  // INSERT gate here would mean the system refuses to write down a statutory trigger it has been
  // told about. What must not move afterwards is the CAUSE TUPLE (the clock) and the FILED mark
  // (the discharge) — both `U`. CENSUS-2's insert rule does not reach these: neither guard governs
  // a transition INTO a privileged value, they seal a recorded fact against later editing.
  { table: 'material_change', covers: ['U', 'D', 'T'] },
  // ⊕ S9-3d (migration 41). `U`, `D`, `T` and deliberately NOT `I`: recording that an escalation
  // happened is the honest act, and an INSERT gate here would mean the system refuses to write down
  // that it raised a warning. What must not move is everything afterwards.
  // ⊕ S12-3 · the gate rows: order on I/U, no delete, no truncate.
  { table: 'onboarding_gate', covers: ['I', 'U', 'D', 'T'] },
  { table: 'escalation_event', covers: ['U', 'D', 'T'] },
];

interface TriggerRow {
  readonly tbl: string;
  readonly tgname: string;
  readonly verbs: string;
  readonly enabled: string;
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CENSUS-1 — THE CENSUS IS WIDENED FROM TABLES TO **VERBS**
//
// ── THE FAILURE THAT PAID FOR THIS, IN FULL ─────────────────────────────────────────────────
// Migration 12's first version registered `reclassification_event_no_mutate` on
// `BEFORE UPDATE OR DELETE`. DELETE on that table had ALREADY been guarded since migration 6
// (`reclassification_event_no_delete`). Nothing was missing and nothing was weakened — a verb was
// guarded TWICE — and two things broke:
//
//   · `corpus-retention`'s MUTATION control suspends the ONE guard `RETENTION_SCAFFOLDING_GUARDS`
//     names per table and then drives the DELETE to completion. With a second, unnamed DELETE
//     trigger still live, the delete could no longer complete: **24 retention tests reported as
//     SKIPPED**, including the `asset`/أصل refusal Binding rule 1's non-diminution invariant turns
//     on. A skipped assertion misreported as a passing one.
//   · the same suite's constructed row could no longer be torn down, so it LEAKED into the next
//     file and broke `seed.integration`'s "the history is empty" assertion.
//
// ── WHY NEITHER CENSUS SAW IT ───────────────────────────────────────────────────────────────
// `VERB_COVERAGE` above asks "does SOME trigger fire on this verb?" — `> 0`, so a second one only
// makes it truer. `corpus-retention`'s census asks "is every governed TABLE named in the
// scaffolding list?" — a set of TABLES, so a second trigger on an already-named table is invisible.
// Migration 12 recorded the gap in its own header and deliberately did not close it. This is that
// change.
//
// ── WHAT IS ASSERTED NOW, AND IT IS TWO DIFFERENT THINGS ────────────────────────────────────
//   A. CLOSURE (the load-bearing one). For each scaffolding list whose contract is "this verb is
//      fully suspended while the block runs", every trigger the LIVE catalogue shows firing on that
//      verb, on that table, must be NAMED in the list. One unnamed sibling = a wrapper that no
//      longer does what its name says.
//   B. THE MANIFEST. Every (table, trigger, verbs) triple in `public`, declared. A guard that
//      ARRIVES is red until somebody writes it down; a guard that DISAPPEARS is red immediately.
//      This is the half that makes "a second guard on an already-guarded verb is VISIBLE" true.
//
// Both are read from `pg_trigger.tgtype`, so they are about what Postgres will actually fire — not
// about what a migration file appears to say.
//
// ⚠ AND BOTH ARE MUTATION-VERIFIED, at the bottom of this section: one probe DROPS a guard and one
// ADDS the exact duplicate migration 12 shipped, each inside a rolled-back transaction, and shows
// the census going red. A census no mutation kills is documentation, not a guard.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** `[table, trigger, verbs]`, verbs in `IUDT` order. MEASURED from `pg_trigger`, not transcribed. */
const GUARD_VERB_CENSUS: readonly (readonly [string, string, string])[] = [
  // 00000000000003 / 4 / 5 — the authority plane
  ['approval_request', 'approval_request_authority', 'IU'],
  ['approval_request', 'approval_request_authority_in_use', 'U'],
  ['approval_request', 'approval_request_no_delete', 'D'],
  ['approval_request', 'approval_request_no_truncate', 'T'],
  ['waqf_access_grant', 'waqf_access_grant_admission', 'IU'],
  ['waqf_access_grant', 'waqf_access_grant_no_delete', 'D'],
  ['waqf_access_grant', 'waqf_access_grant_no_truncate', 'T'],
  ['waqf_access_grant', 'waqf_access_grant_permission_guard', 'IU'],
  ['waqf_access_grant', 'waqf_access_grant_role_immutable', 'U'],

  // 00000000000001 — the append-only audit spine (G-1)
  ['audit_chain_head', 'audit_chain_head_forward_only', 'U'],
  ['audit_chain_head', 'audit_chain_head_no_delete', 'D'],
  ['audit_chain_head', 'audit_chain_head_no_truncate', 'T'],
  // ⚠ TWO triggers on the SAME verbs, and they are NOT a duplicate: `audit_event_no_mutate` is the
  // statement-level guard and `_no_mutate_row` the row-level one. A verb census that could not
  // express "two, on purpose" would push whoever hit it into deleting one.
  ['audit_event', 'audit_event_no_mutate', 'UD'],
  ['audit_event', 'audit_event_no_mutate_row', 'UD'],
  ['audit_event', 'audit_event_no_truncate', 'T'],
  // 00000000000023 — AV7-AUD-F1. ⚠ `I` ON `audit_event`, WHICH THE THREE ROWS ABOVE DELIBERATELY DO
  // NOT COVER, AND THIS CENSUS IS WHAT FORCED THE DECLARATION. Append-only was proven for `U`, `D`
  // and `T` for every role including SUPERUSER — and NOTHING looked at an INSERT, so on
  // `qmulate_app` a row with `prevHash = 'f'×64, rowHash = '0'×64` was ACCEPTED, and a
  // self-consistent forged `APPROVE` naming a real Nazir was accepted AND verified clean by
  // `verifyChain()`. `audit_event_chain_bound` (BEFORE INSERT, ENABLE ALWAYS) recomputes both hash
  // columns server-side and refuses a mismatch, so neither is the client's to choose.
  // ⚠ IT IS NOT A REFUSAL OF INSERT — the runtime role MUST hold INSERT or the trail could not be
  // written at all — which is why the positive controls in
  // `av7-chain-forge.integration.test.ts` matter as much as the refusals: a legitimate append is
  // still accepted, and the 176 seeded rows all reproduce their stored hash through the SQL path.
  ['audit_event', 'audit_event_chain_bound', 'I'],

  // 00000000000001 / 3 — the endowment record and the founder's conditions
  // ⊕ S12-3b (migration 53): a birth needs a marker, a bound registrar and sibling authority.
  ['waqf', 'waqf_birth_admission', 'I'],
  ['waqf', 'waqf_no_delete', 'D'],
  ['waqf', 'waqf_no_truncate', 'T'],
  ['waqf', 'waqf_shart_immutable', 'U'],
  // 00000000000034 — S8-Q4. ⚠ A SECOND `U` ON `waqf` BESIDE THE SHART GUARD, and they are not a
  // duplicate: `waqf_shart_immutable` seals the founder's-condition columns, this one closes the
  // ONE-WAY DOOR on `classification` — a recorded determination raw-UPDATEd back to
  // NOT_CLASSIFIED (the absence of a determination) with no history event. The api's reclassify
  // input schema refuses the same transition at the transport layer; this is the layer that
  // survives raw SQL.
  ['waqf', 'waqf_no_unclassify', 'U'],
  ['document', 'document_no_truncate', 'T'],
  ['document', 'document_retention_forward_only', 'U'],
  ['document', 'document_retention_guard', 'D'],
  // 00000000000047 — S10/T3. ⚠ A SECOND `U` ON `document` BESIDE THE RETENTION GUARD, and they
  // are not a duplicate (same shape as `waqf`'s pair above): `document_retention_forward_only`
  // governs the RETENTION columns (extend-only, artifact-bound hatch since C-14); this one
  // freezes the CONTENT IDENTITY — `storageKey`/`sha256` write-once, NO hatch, because which
  // bytes a retained document consists of is not a decision anyone holds. A re-pointed key is a
  // swapped document wearing a retained row; a corrected document is a NEW version, never an
  // edit.
  ['document', 'document_content_identity', 'U'],

  // 00000000000005 / 12 / 13 / 14 — the corpus asset's identity and BR-306.
  // ⚠ `IU`, NOT `U`, SINCE MIGRATION 14. The `I` is V1/AV-5: an asset could be BORN `EXPROPRIATED`
  // or `SUBSTITUTED_ISTIBDAL` with no reserved-matter approval, which is C-10 one table over. It is
  // the SAME trigger widened rather than a sibling, so the scaffolding wrappers that suspend "the
  // ONE guard per table" keep working (migration 12 §4.6's lesson).
  ['asset', 'asset_identity_guard', 'IU'],
  ['asset', 'asset_no_delete', 'D'],
  ['asset', 'asset_no_truncate', 'T'],

  // 00000000000016 — THE ROW'S OWN NAME (AV4-01). One trigger function, four tables.
  //
  // ⚠ `U` AND ONLY `U`, ON PURPOSE — see the note above `VALUE_TRANSITION_GUARDS` for why these are
  // NOT entries in that list. If one of these ever gains an `I`, assertion B goes red here and the
  // reader is sent to that note, which is the whole mechanism.
  //
  // MEASURED BEFORE, as `qmulate_app` with no approval in session, each probe rolled back: an `id`
  // UPDATE COMMITTED on all four. On `asset` that is an istibdal performed as a rename — rename the
  // parcel away, INSERT a new one under the old id with a different title deed and a valuation of
  // 1.00, and `audit_event` goes 153 -> 153 with no Expropriation row. The DELETE guards two lines
  // up are irrelevant to it, because a rename deletes nothing.
  ['asset', 'asset_id_immutable', 'U'],
  ['waqf', 'waqf_id_immutable', 'U'],
  ['beneficiary', 'beneficiary_id_immutable', 'U'],
  ['trusteeship_deed', 'trusteeship_deed_id_immutable', 'U'],

  // 00000000000003 / 4 / 6 — the distribution run
  ['distribution', 'distribution_authority', 'IU'],
  ['distribution', 'distribution_no_delete', 'D'],
  ['distribution', 'distribution_no_truncate', 'T'],
  ['distribution', 'distribution_status_transition', 'U'],
  // ⊕ S12-3 (migration 52): Gate 02 gates the birth of a run.
  ['distribution', 'distribution_onboarding_gate', 'I'],
  ['distribution_line_item', 'distribution_line_item_no_delete', 'D'],
  ['distribution_line_item', 'distribution_line_item_no_truncate', 'T'],

  // 00000000000006 — corpus / ledger retention
  ['bank_account', 'bank_account_no_delete', 'D'],
  ['bank_account', 'bank_account_no_truncate', 'T'],
  ['beneficiary', 'beneficiary_no_delete', 'D'],
  ['beneficiary', 'beneficiary_no_truncate', 'T'],
  ['expropriation', 'expropriation_no_delete', 'D'],
  ['expropriation', 'expropriation_no_truncate', 'T'],
  ['lease', 'lease_no_delete', 'D'],
  ['lease', 'lease_no_truncate', 'T'],
  ['nazir_fee', 'nazir_fee_no_delete', 'D'],
  ['nazir_fee', 'nazir_fee_no_truncate', 'T'],
  ['transaction', 'transaction_no_delete', 'D'],
  ['transaction', 'transaction_no_truncate', 'T'],
  ['trusteeship_deed', 'trusteeship_deed_no_delete', 'D'],
  ['trusteeship_deed', 'trusteeship_deed_no_truncate', 'T'],

  // 00000000000017 — THE OWNER'S RULINGS. A RECORDED NAZIR APPOINTMENT IS WRITE-ONCE (memo Q10:
  // *"the trusteeship deed can only be editted by a court judge"* — rendered, and FLAGGED as
  // engineering's rendering, as "no system seat may edit it; a court-ordered change is a NEW
  // superseding record").
  //
  // ⚠ TWO TRIGGERS ON THE SAME VERB HERE, AND THEY ARE NOT A DUPLICATE — the `audit_event` note
  // above is the precedent. `trusteeship_deed_id_immutable` (migration 16) owns the row's NAME and
  // fires FIRST (triggers fire in NAME order), so a re-key still gets AV4-01's specific message;
  // `trusteeship_deed_no_update` owns the row's CONTENT and answers everything else. Migration 17
  // §4.6 asserts the first still exists, precisely so nobody "tidies" it away as redundant.
  //
  // ⚠ `U` AND ONLY `U`. INSERT is the initial recording (nazir seat, `endowment:deed:write`);
  // DELETE/TRUNCATE are migration 6's, and they are what closes the DELETE + re-INSERT route that
  // defeated the Shart guard as C-03.
  ['trusteeship_deed', 'trusteeship_deed_no_update', 'U'],

  // 00000000000008 — the retention remainder
  ['client', 'client_no_delete', 'D'],
  ['client', 'client_no_truncate', 'T'],
  ['compliance_obligation', 'compliance_obligation_no_delete', 'D'],
  ['compliance_obligation', 'compliance_obligation_no_truncate', 'T'],
  ['compliance_task', 'compliance_task_no_delete', 'D'],
  ['compliance_task', 'compliance_task_no_truncate', 'T'],
  ['deadline', 'deadline_no_delete', 'D'],
  ['deadline', 'deadline_no_truncate', 'T'],
  ['government_filing', 'government_filing_no_delete', 'D'],
  ['government_filing', 'government_filing_no_truncate', 'T'],
  // 00000000000035 — S8-Q6 (owner, 2026-08-23: "Require approval"). The transition INTO
  // `SUBMITTED` — the one status that asserts something to a regulator — demands an APPROVED
  // maker≠checker GOVT_FILING approval naming THIS row, on INSERT (born submitted) and UPDATE
  // alike; the same trigger also refuses re-pointing `approvalRequestId` outside a submission.
  // Every other status stays manual bookkeeping (BR-603), which is why this is `IU` and not a
  // status lattice.
  ['government_filing', 'government_filing_submission_authority', 'IU'],
  // ⊕ S12-3 (migration 52): Gate 02 gates the move to SUBMITTED.
  ['government_filing', 'government_filing_onboarding_gate', 'IU'],
  ['legal_case', 'legal_case_no_delete', 'D'],
  ['legal_case', 'legal_case_no_truncate', 'T'],
  ['setting', 'setting_no_delete', 'D'],
  ['setting', 'setting_no_truncate', 'T'],
  ['waqif', 'waqif_no_delete', 'D'],
  ['waqif', 'waqif_no_truncate', 'T'],
  ['zakat_filing', 'zakat_filing_no_delete', 'D'],
  ['zakat_filing', 'zakat_filing_no_truncate', 'T'],

  // 00000000000029 — E7/S8, the AML compartment's own subject.
  //
  // ⚠ D AND T ONLY, NEVER I OR U, and this census is the reason the distinction is written down in
  // migration 29 §4 rather than assumed. A trigger that guards MORE verbs than it declares is the
  // shape of CENSUS-1's founding incident: migration 12 put a DELETE verb on a trigger whose sibling
  // already carried it, the retention mutation control suspended the NAMED guard, and 24 retention
  // tests reported as SKIPPED — including the asl/أصل refusal that Binding rule 1's non-diminution
  // invariant turns on. A verb census can see a trigger that guards too little; it cannot see one
  // that guards too much, which is why the verbs here are exact rather than generous.
  //
  // The refusal is UNCONDITIONAL rather than keyed on the >= 10-year retention window, and that is
  // the stricter choice AND the honest one: the figure is UNVERIFIED against primary law, and
  // whether a SAR's clock is even the same clock has not been asked. A guard keyed on an unconfirmed
  // figure would encode the figure.
  // 00000000000031 — E7/S8-Q5, the obligation library becomes evidence.
  //
  // ⚠ FOUR TRIGGERS, ALL `U`, and the split is the point. `*_template_immutable` guards the CONTENT
  // columns; `*_snapshot_frozen` guards the task's frozen (code, version) pair; and the two
  // `*_id_immutable` members close the exposure migration 16's own census MEASURED — an
  // `UPDATE "compliance_obligation" SET "id" = …` committing as `qmulate_app`, which moves a row onto
  // another obligation's identity and rewrites what every task pointing at it recorded, WITHOUT
  // touching a single content column the first guard watches.
  //
  // ⊕ 00000000000033 WIDENED THE FIRST TRIGGER'S COLUMN SET AND ADDED NO TRIGGER, so this census is
  // deliberately unchanged by it — and that is the census's own declared blind spot arriving with a
  // real subject: it asserts which VERBS a table's guards cover, never which COLUMNS. Migration 32
  // added `confidentiality` to the row and joined it to four READ paths and no write guard; the
  // measurement is in migration 33's header. Nothing here could have caught it, which is worth
  // knowing about this file rather than discovering the next time.
  ['compliance_obligation', 'compliance_obligation_template_immutable', 'U'],
  ['compliance_obligation', 'compliance_obligation_id_immutable', 'U'],
  ['compliance_task', 'compliance_task_snapshot_frozen', 'U'],
  ['compliance_task', 'compliance_task_id_immutable', 'U'],
  // 00000000000036 — E7-completion, the instantiation engine's two guards (owner sequencing
  // ruling 2026-08-24). `*_retirement_terminal` makes RETIRED terminal and its facts write-once
  // (§09 A3/A5 — un-retiring erases a reclassification's history without a DELETE, which is the
  // one shape migration 8's guard cannot see); `*_instantiation_identity_frozen` freezes
  // (classificationAtInstantiation, instantiatedReason), NULL included — back-filling an occasion
  // onto a pre-engine row fabricates provenance. Both `U`: creation writes the identity, the
  // CHECKs tie presence to state, and DELETE/TRUNCATE are migration 8's rows above.
  ['compliance_task', 'compliance_task_retirement_terminal', 'U'],
  ['compliance_task', 'compliance_task_instantiation_identity_frozen', 'U'],
  // 00000000000039 — S9-3b, the library-upgrade authority (owner ruling 2026-08-25, S9 first
  // batch). `I`: a task inserted with reason LIBRARY_UPGRADE must name a genuine APPROVED
  // maker≠checker LIBRARY_UPGRADE approval for THIS endowment and library version
  // (`qmulate_approval_defect`, migration 35's shape). Migration 39 also WIDENED the frozen-
  // identity trigger above to the new evidence pointer — the migration-33 shape: column set
  // widened, no trigger added, census deliberately unchanged for that half.
  ['compliance_task', 'compliance_task_library_upgrade_authority', 'I'],

  ['aml_report', 'aml_report_no_delete', 'D'],
  ['aml_report', 'aml_report_no_truncate', 'T'],
  ['aml_follow_up', 'aml_follow_up_no_delete', 'D'],
  ['aml_follow_up', 'aml_follow_up_no_truncate', 'T'],

  // 00000000000038 — S9-2, §09 Engine B's frozen deadline contract. FIVE triggers,
  // deliberately split: `*_insert_provenance` (`I`) demands the window-as-applied snapshot on
  // every engine-era row; `*_frozen_identity` (`U`) freezes the computed identity NULL-included
  // (a displayed, possibly FILED date must not shift — §09's freeze rationale; a correction is a
  // NEW row via `recomputedFromId`); `*_lifecycle_write_once` (`U`, separate so a mutation
  // cannot neutralise the freeze and the write-once together) makes satisfied/waived one-way;
  // DELETE/TRUNCATE are migration 8's rows above — this stage's first draft re-declared (and
  // would have silently REPLACED) them; this census caught the duplicate before it shipped.
  ['deadline', 'deadline_insert_provenance', 'I'],
  ['deadline', 'deadline_frozen_identity', 'U'],
  ['deadline', 'deadline_lifecycle_write_once', 'U'],

  // ⊕ S9-3c / migration 40 — §09's material-change CHANGE-SET. `cause_frozen` seals the tuple the
  // statutory clock is read from (`effectiveDate` IS the clock, CDE-Q2); `filing_write_once` stops
  // an un-filing resurrecting a discharged clock and stops a bound cause being re-pointed at a
  // different duty. DELETE/TRUNCATE are migration 8's family, which this table JOINS — its
  // `_no_delete` calls migration 8's own function with its own hint, so unlike migration 38's
  // withdrawn draft nothing is re-declared here (the table does not exist until migration 40).
  ['material_change', 'material_change_cause_frozen', 'U'],
  ['material_change', 'material_change_filing_write_once', 'U'],
  ['material_change', 'material_change_no_delete', 'D'],
  ['material_change', 'material_change_no_truncate', 'T'],

  // ⊕ S9-3d / migration 41 — §09's escalation record, append-only (`deletedAt` is the one column
  // that may move, because DELETE is refused outright and soft-retirement is this table's only
  // legal route). Plus `deadline_zero_tolerance_no_waiver` on the DEADLINE table, which is `IU`
  // rather than `U` by CENSUS-2's rule: if moving `waivedAt` into a value is refused, a row BORN
  // with that value must be refused too — the identical act refused as a transition and committed
  // as a birth is C-10, measured twice in this repository.
  ['onboarding_gate', 'onboarding_gate_order', 'IU'],
  ['onboarding_gate', 'onboarding_gate_no_delete', 'D'],
  ['onboarding_gate', 'onboarding_gate_no_truncate', 'T'],
  ['escalation_event', 'escalation_event_no_update', 'U'],
  ['escalation_event', 'escalation_event_no_delete', 'D'],
  ['escalation_event', 'escalation_event_no_truncate', 'T'],
  ['deadline', 'deadline_zero_tolerance_no_waiver', 'IU'],

  // 00000000000006 / 12 — BR-104's classification history.
  // ⚠ THE ROW THIS WHOLE SECTION IS ABOUT. DELETE is migration 6's and UPDATE is migration 12's,
  // and they are SEPARATE TRIGGERS on SEPARATE verbs precisely because the first attempt combined
  // them. Anything that puts a `D` back on `reclassification_event_no_update` — or adds a third
  // trigger carrying `D` — must fail here.
  ['reclassification_event', 'reclassification_event_from_matches_current', 'I'],
  ['reclassification_event', 'reclassification_event_no_delete', 'D'],
  ['reclassification_event', 'reclassification_event_no_truncate', 'T'],
  ['reclassification_event', 'reclassification_event_no_update', 'U'],

  // 00000000000012 / 13 — the مآل clause's ultimate taker
  ['waqf_reversion_taker', 'waqf_reversion_taker_insert_integrity', 'I'],
  ['waqf_reversion_taker', 'waqf_reversion_taker_no_mutate', 'UD'],
  ['waqf_reversion_taker', 'waqf_reversion_taker_no_truncate', 'T'],

  // 00000000000019 — E5: anti-commingling as structure, and THE CORPUS GUARD.
  //
  // ⚠ THREE triggers on `transaction`, all on UPDATE, and they are NOT duplicates — they answer
  // three different questions and are separated so a mutation can neutralise one without hiding
  // the others:
  //   · corpus_class_immutable    — did this row stop being a CAPITAL receipt? (Binding rule 1)
  //   · endowment_immutable       — did a COHERENT pair get moved wholesale? (what an FK cannot see)
  //   · dedicated_account_only    — BR-501's personal-funds leg; the only one that also fires on I
  //
  // ⚠ NONE of them carries `D`, deliberately. DELETE and TRUNCATE on `transaction` have been
  // migration 6's since S2 (`transaction_no_delete` / `_no_truncate`), and the retention
  // scaffolding suspends exactly ONE named DELETE guard per table — adding a second `D` here is
  // precisely the CENSUS-1 defect migration 12 paid for on `reclassification_event`.
  ['transaction', 'transaction_corpus_class_immutable', 'U'],
  ['transaction', 'transaction_dedicated_account_only', 'IU'],
  ['transaction', 'transaction_endowment_immutable', 'U'],
  // ⊕ S6/E5, migration 20 §5. The fourth question about a `transaction` row, separate from the
  // three above for the same reason they are separate from each other: does this row's claim to
  // REVERSE another row actually hold? A reversal must MIRROR its original exactly, a row may be
  // reversed at most once, and a reversal may not itself be reversed (owner ruling Q-E5-1(b),
  // 2026-08-18 — a correction is a superseding record, never an edit).
  //
  // ⚠ `IU`, and the `I` is the load-bearing half. A reversal row is CREATED, not amended, so an
  // UPDATE-only guard would let the mirror be violated at the only moment it matters: a row could
  // be inserted claiming to reverse a SAR 20,000,000 corpus receipt while itself being SAR 1 of
  // income, and the pair would "net" to a 19,999,999 write-off no guard ever saw. CENSUS-2 exists
  // because of exactly this class of half-covered value-transition guard.
  ['transaction', 'transaction_correction_shape', 'IU'],
  // ⊕ S7, migration 25 (AV7-F4). The FIFTH question about a `transaction` row, separate from the
  // four above for the same reason they are separate from each other: is this row being RETIRED, and
  // did anyone authorise that? MEASURED before it, `qmulate_app`, no approval in session:
  //
  //     UPDATE "transaction" SET "deletedAt" = now() WHERE "id" = <a CAPITAL receipt>  → 1 row
  //       ⇒ the run's capitalReceiptsSar went 4200000.00 -> 0.00, CAPITAL_RECEIPTS_EXCLUDED
  //         DISAPPEARED from the flags, excludedCapitalReceipts emptied, and NO diagnostic and NO
  //         trace step named the row — while the row still read CAPITAL / 4200000 / ISTIBDAL_PROCEEDS.
  //     INSERT INTO "transaction" (… "deletedAt" = now())                              → 1 row
  //       ⇒ SAR 9,000,000 of istibdal proceeds recorded in the ledger and present in NO register.
  //
  // ⚠ `IU`, AND THE `I` IS THE AV3-03 LESSON APPLIED IN ADVANCE RATHER THAN AFTER A FINDING. On
  // `asset` the `deletedAt` transition was gated while a row BORN retired committed, and migration
  // 15 had to close it; this guard is `BEFORE INSERT OR UPDATE` from its first line. The BEHAVIOUR
  // of both arms — and of the CLEAR direction, and of the near-miss where a genuine approval names
  // another subject — is asserted in `packages/api/test/av7-corpus-wall.integration.test.ts` A-6,
  // because a census still cannot see inside a function body.
  //
  // ⚠ NO `D`. `transaction_no_delete` / `_no_truncate` (migration 6) own those verbs and
  // `RETENTION_SCAFFOLDING_GUARDS` names exactly one DELETE guard per table — a second `D` here is
  // CENSUS-1's own defect, which migration 12 paid 24 falsely-skipped retention tests for.
  ['transaction', 'transaction_row_retirement', 'IU'],
  // ⊕ S7, migration 27. Retiring a distribution RUN — engineering's extension of the ruled
  // soft-delete pattern to a new subject (see SOFT_DELETE_FAMILY for the flag). `IU`, and the `I`
  // is AV3-03's lesson again: a run BORN retired is an `EXECUTED`-status row that blocks its period
  // under migration 26's predicate while being invisible to every read path.
  // ⚠ NO `D` — `distribution_no_delete` / `_no_truncate` (migration 6) own those verbs.
  ['distribution', 'distribution_row_retirement', 'IU'],
];

/**
 * The scaffolding lists whose CONTRACT is "while this block runs, the named verb is fully
 * suspended on this table" — so an unnamed sibling firing on the same verb breaks the wrapper.
 *
 * ⚠ `AUTHZ_PLANE_SCAFFOLDING_GUARDS` IS DELIBERATELY ABSENT, and leaving it out is a judgement,
 * not an oversight. That list suspends `waqf_access_grant_admission` and nothing else on purpose —
 * its own comment says "the `role_immutable` trigger these cases are actually about is untouched",
 * and `waqf_access_grant_permission_guard` stays live beside it too. Closure is the wrong property
 * there; it would demand disabling the very guards those tests exist to probe.
 */
const CLOSED_SCAFFOLDING_LISTS: readonly {
  readonly name: string;
  readonly verb: 'I' | 'U' | 'D' | 'T';
  readonly guards: readonly { table: string; trigger: string }[];
}[] = [
  { name: 'RETENTION_SCAFFOLDING_GUARDS', verb: 'D', guards: RETENTION_SCAFFOLDING_GUARDS },
  {
    name: 'RETENTION_REMAINDER_SCAFFOLDING_GUARDS',
    verb: 'D',
    guards: RETENTION_REMAINDER_SCAFFOLDING_GUARDS,
  },
];

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CENSUS-2 — THE CENSUS MUST SEE A VERB **GAP**, NOT ONLY DECLARE THE VERBS THAT EXIST
//
// ── WHY CENSUS-1 WAS NOT ENOUGH, MEASURED ───────────────────────────────────────────────────
// `GUARD_VERB_CENSUS` is a MANIFEST: it states the trigger set as it IS. That makes an ARRIVING or
// DISAPPEARING guard visible and it is worth having — but it is satisfied, exactly and greenly, by
// the defect it was widened alongside. Migration 13 declared `['asset','asset_identity_guard','U']`
// and the live catalogue said `U`, so the manifest agreed with reality while reality was wrong:
//
//   COMMITS  INSERT INTO "asset" (… "status") VALUES (…, 'EXPROPRIATED')            as qmulate_app
//   COMMITS  INSERT INTO "asset" (… "status") VALUES (…, 'SUBSTITUTED_ISTIBDAL')    as qmulate_app
//   REFUSED  UPDATE "asset" SET "status" = 'EXPROPRIATED'   42501 … RESERVED MATTER (BR-306)
//
// The identical act, refused as a transition and committed as a birth — C-10 verbatim, one table
// over, and BOTH halves of CENSUS-1 green over the top of it. A manifest cannot see a gap, because
// a gap has no row.
//
// ── THE MISSING EXPECTATION, STATED AS A RULE ───────────────────────────────────────────────
// A TABLE WHOSE GUARD GOVERNS A VALUE-TRANSITION MUST BE GUARDED ON INSERT TOO. If moving a column
// INTO some value requires an authority, then a row BORN in that value requires the same authority —
// otherwise the whole gate is optional for any caller who can create a row. This is a property of
// the guard's PURPOSE, which no catalogue read can infer, so the purposes are declared here and the
// INSERT coverage is then read from `pg_trigger`.
//
// ⚠ MUTATION-VERIFIED below: the new INSERT arm is dropped inside a rolled-back transaction and the
// rule goes red, naming the table. A census no mutation kills is documentation, not a guard — and
// this one exists precisely because the previous census passed over a live HIGH defect.
//
// ── AND THE ROUND-2 VERSION OF THIS RULE HAD THE SAME BLIND SPOT AS THE CENSUS IT REPLACED ──
// TWO of them, both closed here.
//
//   AV3-11 · IT OMITTED `waqf`, the one table the whole V-E3 register is about.
//   `waqf_shart_immutable` is a value-transition guard by any reading and `waqf` has NO INSERT
//   trigger, so the rule as written would have FAILED on it — and it was simply not in the list.
//   An omission has no row, so neither census half could see it, and a reader could not tell
//   "considered and exempt" from "never thought about". `insert: EXEMPT` now states the exemption
//   WITH ITS REASON and with the CHECK constraints that carry the birth-side property instead, and
//   the exemption is falsifiable in both directions (an arriving INSERT trigger makes it STALE; a
//   dropped backstop makes its reason evaporate). Both are mutation-verified.
//
//   AV3-03 · IT KEYED ON THE TRIGGER, WHICH MEANT ONE COLUMN PER GUARD. `asset_identity_guard`
//   gates TWO value-transitions — `status` and `deletedAt` — and round 2 gave the widened INSERT arm
//   only the first. The verb census could not see that (the trigger already carried its `I`), and
//   nor could this rule while it was declared per-trigger. It is now declared per COLUMN.
//
// ⚠ AND NEITHER HALF CAN SEE INSIDE A FUNCTION BODY. This rule reads `pg_trigger`; an INSERT arm
// that is `IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;` satisfies it completely. The BEHAVIOUR of
// each declared column is asserted in `e3-deed-term-guards.integration.test.ts` §5b, which INSERTs.
// ═══════════════════════════════════════════════════════════════════════════════════════════

/**
 * ── AND SINCE ROUND 3 (AV3-11) THE LIST DECLARES ITS **EXEMPTIONS**, WITH THEIR REASONS ─────
 *
 * The round-2 version of `VALUE_TRANSITION_GUARDS` omitted `waqf` — the one table the whole V-E3
 * register is about. `waqf_shart_immutable` is a value-transition guard by any reading (it gates
 * `NULL -> value -> sealed` on the founder's conditions and the deed terms) and `waqf` has NO INSERT
 * trigger at all, so the rule as written would have failed on it. It was simply not in the list, and
 * a rule's silence about its hardest subject is indistinguishable from that subject passing.
 *
 * The answer is NOT to widen the trigger, and not to keep quiet either: it is to DECLARE the
 * exemption together with the reason and the thing that carries the property instead — and then to
 * make the exemption itself FALSIFIABLE, in both directions. An `EXEMPT` entry now asserts that
 *   (a) the transition guard still exists and still fires on UPDATE (the premise), and
 *   (b) NOTHING fires on INSERT — if an INSERT trigger ever arrives, the exemption is STALE and goes
 *       red, so nobody inherits a reason that stopped being true, and
 *   (c) every CHECK named in `backstops` is installed on that table — because a "the CHECK covers
 *       INSERT instead" exemption is worth exactly as much as the CHECK's continued existence.
 */
type InsertCoverage =
  | { readonly kind: 'REQUIRED' }
  | {
      readonly kind: 'EXEMPT';
      readonly because: string;
      /** CHECK constraints that carry the birth-side property a trigger would otherwise carry. */
      readonly backstops: readonly string[];
    }
  | {
      /**
       * ⊕ S12-3b (migration 53). The birth-side property is carried by a DIFFERENT trigger than the
       * transition guard — one that fires on INSERT and is named here, so its disappearance is loud.
       * `waqf` moved from EXEMPT to this kind the day the `waqf` INSERT became governed: an EXEMPT
       * entry on a table with an INSERT trigger is STALE by this file's own rule, and the honest
       * answer was a third kind, not a wider exemption.
       */
      readonly kind: 'COVERED_BY';
      readonly trigger: string;
      readonly because: string;
      readonly backstops: readonly string[];
    };

const REQUIRED: InsertCoverage = { kind: 'REQUIRED' };

/**
 * ⚠ WHY THE FOUR `*_id_immutable` GUARDS (migration 16, AV4-01) ARE **NOT** ENTRIES BELOW.
 *
 * Written down rather than left as a silence, for AV3-11's reason exactly: to a reader, an omission
 * and a pass look identical, and this rule exists because a census once "passed" over a live HIGH
 * defect. So — considered, and genuinely out of scope, not forgotten.
 *
 * This rule's subject is a guard that gates a TRANSITION INTO A PARTICULAR VALUE ("moving `status`
 * to EXPROPRIATED needs an approval"), whose corollary is that a row BORN in that value needs the
 * same approval. `qmulate_identity_immutable()` has no gated value: it refuses EVERY change to
 * `id`, unconditionally, with no approval and no permitted first write. The birth-side question the
 * rule asks — "can a row be born already in the gated state?" — has no meaning here, because EVERY
 * row is born with an id, and being born with one is not an escape from anything. It is the same
 * reason migration 14 gives for not gating `waqfId` on INSERT: on a birth there is no prior identity
 * to substitute.
 *
 * ⚠ AND THE OMISSION IS STILL FALSIFIABLE, through the OTHER half. Each of the four is declared `U`
 * in `GUARD_VERB_CENSUS`. If one ever gains an `I`, assertion B goes red naming it, and whoever
 * widened it lands back on this note — which is where they should be, because an INSERT arm on an
 * identity guard would mean somebody had decided a row's birth id needs an authority, and that is a
 * decision, not a widening.
 */
const VALUE_TRANSITION_GUARDS: readonly {
  readonly table: string;
  readonly trigger: string;
  /** The column whose TRANSITION the trigger gates, and therefore whose BIRTH it must gate. */
  readonly column: string;
  readonly why: string;
  readonly insert: InsertCoverage;
}[] = [
  {
    table: 'asset',
    trigger: 'asset_identity_guard',
    column: 'status',
    insert: REQUIRED,
    why:
      'BR-306: a move into EXPROPRIATED or SUBSTITUTED_ISTIBDAL needs an approved, artifact-bound ' +
      'reserved matter, so an asset BORN in one needs the same (V1/AV-5, measured — both INSERTs ' +
      'committed as qmulate_app while the UPDATE was refused 42501).',
  },
  {
    // ⚠ THE SECOND COLUMN ON THE SAME TRIGGER, AND IT IS A SEPARATE ENTRY ON PURPOSE (AV3-03).
    // Migration 14 widened the trigger to `BEFORE INSERT OR UPDATE` and gave the new arm exactly ONE
    // question — the status — while `deletedAt`, gated as a reserved matter by the SAME migration,
    // was left to the UPDATE arm. MEASURED as qmulate_app with migration 14 applied:
    //   COMMITS  INSERT INTO "asset" (… "status","deletedAt") VALUES (…,'ACTIVE', now())
    //   REFUSED  UPDATE "asset" SET "deletedAt" = now()                              (42501)
    // A VERB census cannot see that: the trigger already carried its `I`. Declaring the COLUMN is
    // what makes the second gap nameable at all — and the behaviour is asserted in
    // `e3-deed-term-guards.integration.test.ts`, because a census still cannot see inside a body.
    table: 'asset',
    trigger: 'asset_identity_guard',
    column: 'deletedAt',
    insert: REQUIRED,
    why:
      'asset_no_delete refuses the hard DELETE and names `deletedAt` as the only legal retirement ' +
      'of a corpus parcel, so retiring one is a reserved matter on UPDATE — and a row BORN with the ' +
      'column set leaves every register with no approval behind it (AV3-03, closed by migration 15).',
  },
  {
    table: 'distribution',
    trigger: 'distribution_status_transition',
    column: 'status',
    insert: REQUIRED,
    why:
      'C-10 itself: a run was BORN EXECUTED naming an approval that did not exist, because the ' +
      'transition trigger never saw an INSERT. `distribution_authority` is the INSERT half.',
  },
  {
    table: 'waqf_access_grant',
    trigger: 'waqf_access_grant_role_immutable',
    column: 'role',
    insert: REQUIRED,
    why:
      'MP-15: a seat’s role is write-once, which is worth nothing if a seat can be BORN as NAZIR ' +
      'unaudited. `waqf_access_grant_admission` is the INSERT half.',
  },
  {
    table: 'approval_request',
    trigger: 'approval_request_authority',
    column: 'status',
    insert: REQUIRED,
    why:
      'C-02/C-13: the approval lattice gates the status transition, so a request born already ' +
      'APPROVED would be the same escape. That trigger is IU and covers both itself.',
  },
  {
    // ⚠⚠ THE ENTRY THE ROUND-2 LIST DID NOT HAVE, AND THE TABLE THE WHOLE V-E3 REGISTER IS ABOUT
    // (AV3-11). It is EXEMPT, and the exemption is written down WITH ITS REASON rather than left as
    // a silence — because a silence and a pass are the same thing to a reader, and this rule exists
    // precisely because the previous census "passed" over a live HIGH defect.
    table: 'waqf',
    trigger: 'waqf_shart_immutable',
    column: 'shartAlWaqif / continuationStipulation / the مآل group',
    why:
      'tier 1 seals the Shart al-Waqif unconditionally (ADR-0006) and tier 3 makes each deed term ' +
      'write-once: NULL -> value ONCE, then sealed against every later change including NULL.',
    insert: {
      kind: 'COVERED_BY',
      trigger: 'waqf_birth_admission',
      backstops: [
        'waqf_reversion_kind_requires_capture',
        'waqf_reversion_recorded_dual_dated',
        'waqf_reversion_recorded_at_pairs_with_capture',
        'waqf_reversion_kind_requires_recorded_at',
      ],
      because:
        'THE RULE ABOVE DOES NOT APPLY HERE, and migration 14 says so in its own header ("IT DOES ' +
        'NOT WIDEN waqf_shart_immutable TO INSERT"). Two reasons, both facts rather than ' +
        'judgements. (1) Tier 3’s contract IS "NULL -> value once": a BIRTH is that one permitted ' +
        'write. There is no prior recorded condition an INSERT could substitute, so "born in the ' +
        'gated value" is not an escape from the gate — it is the gate’s legal case. That is what ' +
        'makes `waqf` different from `asset`, where a row born EXPROPRIATED is a DISPOSAL nobody ' +
        'approved. (2) The route by which a NEW waqf row could stand in for an EXISTING one is ' +
        'DELETE + re-INSERT — which is C-03 itself, and is closed from the other side by ' +
        '`waqf_no_delete` / `waqf_no_truncate` (migration 4), both declared in the manifest above. ' +
        'What a BIRTH can still get wrong is INTERNAL COHERENCE — a row born `captured = true` with ' +
        'no reading date, which is AV-1’s state — and that is answered on EVERY verb, for every ' +
        'role, including a session at `session_replication_role = replica`, by the four CHECK ' +
        'constraints in `backstops`. A CHECK is the right home because it covers INSERT by ' +
        'construction; a second trigger would be a second implementation of one fact. ' +
        '⚠ WHAT THIS EXEMPTION DOES **NOT** CLAIM: that `waqf` INSERT is GOVERNED. Nothing asks WHO ' +
        'may create an endowment, or that an `audit_event` names it, the way ' +
        '`waqf_access_grant_admission` does for a seat. That is a real and separate gap; it is not ' +
        'this rule’s subject, and it is REPORTED rather than papered over here. ' +
        '⊕ SUPERSEDED 2026-09-08 (S12-3b, migration 53): the `waqf` INSERT IS NOW GOVERNED — ' +
        '`waqf_birth_admission` demands an audit_event naming the new endowment in the same ' +
        'transaction, binds `createdBy` to its actor, and requires that actor to hold BOTH ' +
        '`endowment:waqf:write` and `admin:access_matrix:write` established on a SIBLING endowment ' +
        'of the same client; the runtime role holds no INSERT on `waqf` at all. The sentences above ' +
        'are kept as the record of what was true when this exemption was written.',
    },
  },
  {
    // ⚠⚠ THE SECOND COLUMN ON `waqf_shart_immutable`, DECLARED PER COLUMN FOR AV3-03's REASON —
    // migration 17's tier 2b (owner-decision memo Q8). It is EXEMPT, it has NO CHECK BACKSTOP, and
    // the reason says so in those words rather than implying a coverage that does not exist.
    table: 'waqf',
    trigger: 'waqf_shart_immutable',
    column: 'deletedAt',
    why:
      'memo Q8 (product owner, 2026-08-17): "Setting (and clearing) waqf.deletedAt on a live ' +
      'endowment requires an approved reserved-matter request." Tier 2b gates BOTH directions on an ' +
      'APPROVED, maker <> checker, artifact-bound approval naming "waqf:<id>:deletedAt" — MEASURED ' +
      'before it, as qmulate_app with no approval, the set AND the clear both COMMITTED on waqf-001 ' +
      'while the Shart one column over was refused 42501.',
    insert: {
      kind: 'COVERED_BY',
      trigger: 'waqf_birth_admission',
      // ⚠ EMPTY, AND THAT IS THE HONEST ANSWER, NOT A FORGOTTEN ONE. No CHECK constrains a `waqf`
      // row born with `deletedAt` set, so there is nothing to name here. An invented entry would
      // make the exemption read as covered; `because` carries the argument instead, and the
      // MEASUREMENT of the open route is in it.
      backstops: [],
      because:
        'THE BIRTH IS NOT GATED AND THE ROUTE IS MEASURED OPEN — this exemption does **not** claim ' +
        'otherwise. MEASURED as `qmulate_app`, no approval in session, rolled back: ' +
        '`INSERT INTO "waqf" (… "deletedAt" = now() …)` COMMITS — an endowment BORN retired — and so ' +
        'does the same INSERT with `deletedAt` NULL, i.e. the BIRTH ITSELF is governed by nothing at ' +
        'all. Three reasons the rule’s corollary still does not bite, in order of weight. (1) THE ' +
        'RULING’S SUBJECT IS A LIVE ENDOWMENT: a birth retires nothing, because before the statement ' +
        'there was no endowment in any register to remove. That is what makes `waqf` different from ' +
        '`asset`, where a parcel EXISTS IN REALITY before its row and a row born retired records the ' +
        'endowment as never having held corpus it did hold. (2) A ROW BORN RETIRED CANNOT BECOME A ' +
        'LIVE ENDOWMENT SILENTLY: the CLEAR direction is gated by the same tier, so `deletedAt` -> ' +
        'NULL needs the approval — and it cannot stand in for an existing endowment either, because ' +
        '`waqf_no_delete` refuses the hard DELETE and `waqf_id_immutable` refuses the rename. (3) THE ' +
        '`waqf` INSERT IS UNGOVERNED WHOLESALE — nothing asks WHO may create an endowment or that an ' +
        '`audit_event` name it, the way `waqf_access_grant_admission` does for a seat — so gating ONE ' +
        'COLUMN of an ungoverned INSERT is a fig leaf, and the sibling exemption above reports that ' +
        'same gap. ⚠ IF A LATER CHANGE GOVERNS THE `waqf` INSERT, THIS COLUMN IS THE FIRST QUESTION ' +
        'TO ASK, and the STALE check below will send whoever does it back here. ' +
        '⊕ THE LATER CHANGE CAME (S12-3b, migration 53) AND THIS COLUMN WAS THE FIRST QUESTION: ' +
        '`qmulate_waqf_birth_admission()` refuses an INSERT with `deletedAt` set — for EVERY role, ' +
        'the owner included — so an endowment is no longer BORN retired (WAQF_BORN_RETIRED). ' +
        'MEASURED in `endowment-birth-admission.integration.test.ts`. `backstops` stays empty because ' +
        'the refusal is that trigger, not a CHECK; the trigger is in the manifest above.',
    },
  },
  {
    table: 'distribution',
    trigger: 'distribution_row_retirement',
    column: 'deletedAt',
    insert: REQUIRED,
    why:
      'CONFIRMED BY THE PRODUCT OWNER, 2026-08-20 (S4 memo "S7 · Migration 27", verbatim ' +
      '"confirmed."). It reached him as an EXTENSION of the ruled soft-delete pattern to a new ' +
      'subject (migration 27), shipped flagged — ' +
      'Q8 ruled `waqf."deletedAt"` and AV7-F4 ruled ANY committed receipt, uniformly, on the logic ' +
      'that anything changing what is distributable gets the gate. A PAID run is at least as grave ' +
      'a record as the receipt it was computed from: its line items are intact and those halalas ' +
      'are still owed, while `get`/`list`/`lines` all filter `deletedAt: null`, so an unapproved ' +
      'retirement removes the EVIDENCE of a payment that still stands. MEASURED before it, as ' +
      'qmulate_app with no approval: one UPDATE retired an EXECUTED run. `insert: REQUIRED` ' +
      'because a run BORN retired blocks ' +
      "its period under migration 26's predicate while being invisible — AV3-03 one table over. " +
      '⚠ AND A MEASURED LIMITATION OF **THIS** CENSUS, ON THIS TABLE: narrowing ' +
      'distribution_row_retirement to UPDATE-only does NOT turn CENSUS-2 red, because CENSUS-2 asks ' +
      'whether the TABLE fires on INSERT and `distribution_authority` (migration 3) already does. ' +
      "MEASURED by driving exactly that mutation: CENSUS-2's C stayed GREEN and CENSUS-1's verb " +
      'manifest went RED naming `distribution\tdistribution_row_retirement\tU` as UNDECLARED. So ' +
      'the AV3-03 shape IS caught here — by the per-TRIGGER verb manifest, not by the per-TABLE ' +
      'birth rule. Recorded because a reader could otherwise assume CENSUS-2 is the backstop for ' +
      'this entry, and on a table with a second INSERT trigger it is not.',
  },
  {
    // ⊕⊕ THE THIRD MEMBER OF THE SOFT-DELETE GUARD FAMILY (migration 25, AV7-F4). `asset.deletedAt`
    // and `waqf.deletedAt` were already here; the ledger row a distribution run is COMPUTED FROM was
    // not, and that is where the corpus went missing. It is `REQUIRED`, not exempt, and the reason
    // is the sibling two entries up: on `asset`, gating the transition and not the birth was AV3-03,
    // a live defect migration 15 had to close. So `transaction_row_retirement` is
    // `BEFORE INSERT OR UPDATE` from its first line.
    table: 'transaction',
    trigger: 'transaction_row_retirement',
    column: 'deletedAt',
    insert: REQUIRED,
    why:
      'PRODUCT OWNER, 2026-08-20 (S4 owner-decision memo, "S7 · AV7-F4"): soft-deleting ANY ' +
      'committed receipt, income or capital, requires an approved reserved matter — the same logic ' +
      'as Q-E5-1, that anything changing what is distributable gets the gate, with the ' +
      'income/capital difference in the refusal’s stated REASON and never in its STRICTNESS. ' +
      'MEASURED before it, as qmulate_app with no approval: the UPDATE took a run’s ' +
      'capitalReceiptsSar from 4200000.00 to 0.00 with CAPITAL_RECEIPTS_EXCLUDED gone, ' +
      'excludedCapitalReceipts empty and no diagnostic and no trace step; and the BIRTH route ' +
      'committed too — INSERT … "deletedAt" = now() put SAR 9,000,000 of istibdal proceeds in the ' +
      'ledger and in no register. transaction_no_delete names deletedAt as the only legal ' +
      'retirement of a ledger row (migration 6), so this IS the retirement path in substance.',
  },
];

/**
 * Assertion C, pure — so the mutation probes can feed it a catalogue read inside a rolled-back tx.
 *
 * `checks` is the set of CHECK constraint names present on each table, needed only by the EXEMPT
 * branch: an exemption that says "the CHECK carries it instead" is worth exactly as much as the
 * CHECK's continued existence, so the reliance is ASSERTED rather than assumed (ADR-0008 §2.4).
 */
function transitionBirthFindings(
  // ⚠ NO DEFAULT ON `checks`, DELIBERATELY. An omitted argument would make every EXEMPT entry report
  // its backstops as missing — fail-closed, but noisily wrong. Required, so a forgotten one is a
  // COMPILE error instead of a puzzling red.
  live: readonly TriggerRow[],
  checks: ReadonlySet<string>,
  // ⊕ S12-3b: injectable so a mutation test can REPLAY a superseded declaration against the live census.
  guards: typeof VALUE_TRANSITION_GUARDS = VALUE_TRANSITION_GUARDS,
): string[] {
  const findings: string[] = [];
  for (const { table, trigger, column, why, insert } of guards) {
    const onTable = live.filter((row) => row.tbl === table);
    // The premise: the transition guard itself must still exist and still fire on UPDATE. If it is
    // gone, this rule has nothing to say and must say THAT rather than pass vacuously.
    if (!onTable.some((row) => row.tgname === trigger && row.verbs.includes('U'))) {
      findings.push(
        `${table}.${trigger} does not fire on U (or is gone) — the premise of the INSERT rule for ` +
          `"${column}" no longer holds, so the rule cannot be checked. ${why}`,
      );
      continue;
    }

    const firesOnInsert = onTable.some((row) => row.verbs.includes('I'));

    if (insert.kind === 'REQUIRED') {
      if (!firesOnInsert) {
        findings.push(
          `${table} gates a VALUE-TRANSITION on "${column}" (${trigger}) but NOTHING fires on ` +
            `INSERT. A row BORN in the gated value walks around the whole guard — the C-10 shape. ` +
            `${why} Present: ${onTable.map((row) => `${row.tgname}=${row.verbs}`).join(', ')}`,
        );
      }
      continue;
    }

    // ── COVERED_BY another trigger: that trigger must exist on the table and fire on INSERT ──
    if (insert.kind === 'COVERED_BY') {
      const carrier = onTable.find((row) => row.tgname === insert.trigger);
      if (carrier === undefined || !carrier.verbs.includes('I')) {
        findings.push(
          `${table} is DECLARED COVERED for the INSERT rule on "${column}" (${trigger}) by ` +
            `"${insert.trigger}", but that trigger ${carrier === undefined ? 'is GONE' : `fires on ${carrier.verbs}, not on I`}. ` +
            `The birth-side property is uncarried and the gap is real again. ${why} Present: ` +
            `${onTable.map((row) => `${row.tgname}=${row.verbs}`).join(', ')}`,
        );
      }
      for (const backstop of insert.backstops) {
        if (!checks.has(`${table}\t${backstop}`)) {
          findings.push(
            `${table} is COVERED for the INSERT rule on "${column}" ON THE EXPRESS GROUND that ` +
              `CHECK "${backstop}" carries a birth-side property beside the trigger — and that CHECK ` +
              `is NOT installed on "${table}".`,
          );
        }
      }
      continue;
    }

    // ── EXEMPT, and the exemption is checked in BOTH directions ─────────────────────────────
    if (firesOnInsert) {
      findings.push(
        `${table} is DECLARED EXEMPT from the INSERT rule for "${column}" (${trigger}), but ` +
          `something now fires on INSERT: ` +
          `${onTable
            .filter((row) => row.verbs.includes('I'))
            .map((row) => `${row.tgname}=${row.verbs}`)
            .join(', ')}. The exemption is STALE — re-read it and either delete it or say why it ` +
          `still holds. An inherited reason that stopped being true is worse than no reason.`,
      );
    }
    for (const backstop of insert.backstops) {
      if (!checks.has(`${table}\t${backstop}`)) {
        findings.push(
          `${table} is EXEMPT from the INSERT rule for "${column}" ON THE EXPRESS GROUND that ` +
            `CHECK "${backstop}" carries the birth-side property instead — and that CHECK is NOT ` +
            `installed on "${table}". The exemption's reason has evaporated, so the gap is real ` +
            `again and undeclared.`,
        );
      }
    }
  }
  return findings.sort();
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// CENSUS-3 — THE SOFT-DELETE GATES ARE **ONE FAMILY**, SWEPT TOGETHER (AV4-01's lesson)
//
// ── WHY A THIRD SECTION AND NOT THREE MORE ROWS ─────────────────────────────────────────────
// `deletedAt` is now a reserved matter on THREE tables, ruled at three different times:
//   · `asset`       — BR-306 / AV3-03            (migrations 14, 15)
//   · `waqf`        — owner memo Q8, 2026-08-17  (migration 17, tier 2b)
//   · `transaction` — owner memo "S7 · AV7-F4", 2026-08-20  (migration 25)
//
// AV4-01's lesson is that *a guard family with the same hole on N tables is ONE change, not N* —
// and the corollary this section exists for is that it must also be ONE ASSERTION, not N. Checked
// separately, the three gates drift: one gets a second verifier, one loses its INSERT arm, one
// stops being ENABLE ALWAYS, and each half-check stays green because it was only ever asked about
// its own table. So the family is DECLARED, and three properties are asserted ACROSS it.
//
//   F1  every member's trigger exists, fires on UPDATE, and is ENABLE ALWAYS.
//   F2  every member is declared in `VALUE_TRANSITION_GUARDS` on the `deletedAt` COLUMN — i.e. the
//       census above carries it, so its disappearance is loud.
//   F3  ⚠ THE ONE THAT ONLY A FAMILY SWEEP CAN MAKE: every member's guard BODY reaches the SAME
//       verifier — `qmulate_reserved_matter_defect(...)`, migration 4's eight conditions — and
//       builds its subject as `<table>:<id>:deletedAt`. Three tables cannot quietly grow three
//       different notions of "approved". This is read from `pg_get_functiondef`, so it is about
//       what is INSTALLED, not about what a migration file appears to say.
//
// ⚠ WHAT F3 DOES **NOT** CLAIM: that the bodies BEHAVE alike. A census cannot see inside a
// function (this file's standing caveat). The behaviour of each gate lives with its own suite —
// `e3-deed-term-guards.integration.test.ts` for `asset` and `waqf`, and
// `packages/api/test/av7-corpus-wall.integration.test.ts` A-6 for `transaction`, which drives all
// three arms (set / clear / born-retired), the near-miss where a genuine approval names another
// subject, and the positive control where a real approval lets the retirement through.
//
// ⚠ AND THE FAMILY IS **NOT CLOSED OVER EVERY TABLE THAT NEEDS IT** — declared below as a KNOWN
// GAP with its measurement rather than left as a silence, for AV3-11's reason exactly.
// ═══════════════════════════════════════════════════════════════════════════════════════════

const SOFT_DELETE_FAMILY: readonly {
  readonly table: string;
  readonly trigger: string;
  readonly ruling: string;
}[] = [
  {
    table: 'asset',
    trigger: 'asset_identity_guard',
    ruling: 'BR-306 / AV3-03 (migrations 14, 15)',
  },
  {
    table: 'waqf',
    trigger: 'waqf_shart_immutable',
    ruling: 'product owner, 2026-08-17, S4 memo Q8 (migration 17 tier 2b)',
  },
  {
    table: 'transaction',
    trigger: 'transaction_row_retirement',
    ruling: 'product owner, 2026-08-20, S4 memo "S7 · AV7-F4" (migration 25)',
  },
  {
    // ⚠ THE FOURTH MEMBER, AND THE ONLY ONE WHOSE SUBJECT THE OWNER HAS **NOT** RULED ON.
    // The PATTERN is ruled twice (Q8 for `waqf`, AV7-F4 for any receipt, uniformly, on the logic
    // that anything changing what is distributable gets the gate). The SUBJECT — a distribution
    // RUN — is engineering's extension of that logic, flagged as such in migration 27's header and
    // in its refusal message. It closes an EVIDENCE gap, not a money gap: migration 26 left
    // `deletedAt` out of `distribution_paid_periods_disjoint` on purpose, so period disjointness
    // already survives an unapproved retirement. What it stops is a PAID run — line items intact,
    // halalas still owed — vanishing from `get`, `list` and `lines`, all of which filter
    // `deletedAt: null`.
    table: 'distribution',
    trigger: 'distribution_row_retirement',
    ruling:
      'product owner, 2026-08-20, S4 memo "S7 · Migration 27", verbatim "confirmed." — reached by ' +
      "extension of Q8 + AV7-F4 to a new SUBJECT (migration 27), shipped FLAGGED as engineering's " +
      'reading and CONFIRMED by the owner the same day; the false sentence inside the live refusal ' +
      'was replaced by migration 28, which could not be an edit to 27 because 27 is applied and ' +
      'Prisma checksums applied migrations.',
  },
];

/**
 * Tables whose `deletedAt` a distribution run ALSO reads as a filter, and which are **NOT** gated.
 *
 * ⚠ MEASURED, `qmulate_app`, no approval in session, each rolled back — BOTH COMMIT:
 *     UPDATE "beneficiary" SET "deletedAt" = now() … → rowCount 1
 *     UPDATE "setting"     SET "deletedAt" = now() … → rowCount 1
 * and `assembleRun` (`packages/api/src/routers/distribution.ts`) filters both on `deletedAt: null`,
 * so either one silently changes what a period pays: a head leaving a per-capita cohort RAISES every
 * remaining share, and a hidden `nazirFee.percentOfRevenue` row changes the waterfall.
 *
 * NOT GATED, for two DIFFERENT reasons, neither of them "we did not notice":
 *  · `beneficiary` — the owner's ruling is about a **receipt**. Who may remove a mustahiq from an
 *    endowment is a governance question for him (binding rule 4), not for a migration.
 *  · `setting` — the test harness LEGITIMATELY soft-deletes a global `Setting` today
 *    (`packages/api/test/setup.ts`'s `withGlobalSettingHidden`, and
 *    `setting-resolver.integration.test.ts`), so gating it changes those suites' contract.
 *
 * ⚠ FALSIFIABLE IN BOTH DIRECTIONS, which is the only thing that makes a declared gap worth
 * writing: if a gate ARRIVES on either table, the assertion below goes red and whoever added it is
 * sent here to move the row into `SOFT_DELETE_FAMILY` — so the family cannot grow a fourth member
 * the sweep does not know about, and this note cannot rot into a claim that stopped being true.
 */
const SOFT_DELETE_FAMILY_KNOWN_GAPS: readonly string[] = ['beneficiary', 'setting'];

/** Every trigger in `public` with the SOURCE of the function it calls. F3's evidence. */
const GUARD_BODY_SQL = `
  SELECT c.relname AS tbl,
         t.tgname,
         pg_get_functiondef(t.tgfoid) AS body
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND n.nspname = 'public'`;

interface GuardBodyRow {
  readonly tbl: string;
  readonly tgname: string;
  readonly body: string;
}

/** F3 + the known-gap check, pure, so a mutation can feed it a body read inside a rolled-back tx. */
function softDeleteFamilyFindings(bodies: readonly GuardBodyRow[]): string[] {
  const findings: string[] = [];
  for (const { table, trigger, ruling } of SOFT_DELETE_FAMILY) {
    const row = bodies.find((candidate) => candidate.tbl === table && candidate.tgname === trigger);
    if (row === undefined) {
      findings.push(
        `${table}.${trigger} is declared in the soft-delete guard family and is NOT INSTALLED. ` +
          `Ruling: ${ruling}.`,
      );
      continue;
    }
    if (!row.body.includes('qmulate_reserved_matter_defect')) {
      findings.push(
        `${table}.${trigger}'s body does not call qmulate_reserved_matter_defect(). The family's ` +
          `whole point is ONE verifier for "approved" — migration 4's eight conditions — so a ` +
          `member that grew its own notion of an approval is the drift this sweep exists to catch. ` +
          `Ruling: ${ruling}.`,
      );
    }
    if (!row.body.includes(`:deletedAt'`)) {
      findings.push(
        `${table}.${trigger}'s body never builds a "<table>:<id>:deletedAt" subject, so an ` +
          `approval cannot be bound to THIS artifact's retirement (C-14). Ruling: ${ruling}.`,
      );
    }
  }
  for (const table of SOFT_DELETE_FAMILY_KNOWN_GAPS) {
    const gated = bodies.filter(
      (row) => row.tbl === table && row.body.includes('qmulate_reserved_matter_defect'),
    );
    if (gated.length > 0) {
      findings.push(
        `"${table}" is DECLARED A KNOWN GAP in the soft-delete family and now has a ` +
          `reserved-matter gate: ${gated.map((row) => row.tgname).join(', ')}. The declaration is ` +
          `STALE — move the row into SOFT_DELETE_FAMILY and delete it from the gap list, so the ` +
          `sweep covers it. An inherited gap that stopped being one is worse than no list.`,
      );
    }
  }
  return findings.sort();
}

/** `table\tconstraint` for every CHECK in `public` — the EXEMPT branch's evidence. */
const CHECK_CENSUS_SQL = `
  SELECT c.relname AS tbl, con.conname AS name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE con.contype = 'c' AND n.nspname = 'public'`;

/** `table\ttrigger\tverbs`, the comparison key for the manifest. */
const keyOf = (row: { tbl: string; tgname: string; verbs: string }): string =>
  `${row.tbl}\t${row.tgname}\t${row.verbs}`;

/**
 * Assertion B, as a PURE function of the catalogue rows — so the mutation probes below can feed it
 * a catalogue read inside a rolled-back transaction and watch it go red.
 */
function manifestFindings(live: readonly TriggerRow[]): string[] {
  const declared = new Set(
    GUARD_VERB_CENSUS.map(([tbl, tgname, verbs]) => keyOf({ tbl, tgname, verbs })),
  );
  const present = new Set(live.map(keyOf));
  const findings: string[] = [];

  for (const key of present) {
    if (!declared.has(key)) {
      findings.push(`UNDECLARED (table\ttrigger\tverbs): ${key}`);
    }
  }
  for (const key of declared) {
    if (!present.has(key)) {
      findings.push(`MISSING or CHANGED VERBS (table\ttrigger\tverbs): ${key}`);
    }
  }
  for (const row of live) {
    if (declared.has(keyOf(row)) && row.enabled !== 'A') {
      findings.push(`NOT 'ENABLE ALWAYS': ${row.tbl}.${row.tgname}=${row.enabled}`);
    }
  }
  return findings.sort();
}

/** Assertion A, likewise pure. */
function closureFindings(live: readonly TriggerRow[]): string[] {
  const findings: string[] = [];
  for (const { name, verb, guards } of CLOSED_SCAFFOLDING_LISTS) {
    for (const { table, trigger } of guards) {
      const named = new Set(
        guards.filter((guard) => guard.table === table).map((guard) => guard.trigger),
      );
      const firing = live.filter((row) => row.tbl === table && row.verbs.includes(verb));
      if (!firing.some((row) => row.tgname === trigger)) {
        findings.push(`${name}: ${table}.${trigger} does not fire on ${verb} (or is gone)`);
      }
      for (const row of firing) {
        if (!named.has(row.tgname)) {
          findings.push(
            `${name}: "${table}" has an UNNAMED ${verb} guard "${row.tgname}" (${row.verbs}). ` +
              `The wrapper disables ${[...named].join(', ')} and this one keeps firing, so the ` +
              `block it wraps cannot complete — CENSUS-1's exact failure.`,
          );
        }
      }
    }
  }
  return [...new Set(findings)].sort();
}

/** One catalogue read, usable on a client OR on a transaction handle. */
const TRIGGER_CENSUS_SQL = `
  SELECT c.relname AS tbl,
         t.tgname,
         CASE WHEN (t.tgtype &  4) > 0 THEN 'I' ELSE '' END ||
         CASE WHEN (t.tgtype & 16) > 0 THEN 'U' ELSE '' END ||
         CASE WHEN (t.tgtype &  8) > 0 THEN 'D' ELSE '' END ||
         CASE WHEN (t.tgtype & 32) > 0 THEN 'T' ELSE '' END AS verbs,
         t.tgenabled::text AS enabled
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE NOT t.tgisinternal AND n.nspname = 'public'`;

describe.skipIf(!hasDatabase)('guard verb coverage, and the grant off-switch', () => {
  let triggers: TriggerRow[];
  /** `table\tconstraint`, for the EXEMPT branch of CENSUS-2. */
  let checks: Set<string>;

  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
    const prisma = // ⚠ THE PRIVILEGED (OWNER) CONNECTION, NOT THE APP ONE  (ADR-0008 round 6). This handle issues RAW
      // GUARD STATEMENTS. Since privilege separation the app role holds no DELETE on any endowment table,
      // no UPDATE on `audit_event`, no TRUNCATE anywhere and no write at all on `waqf_access_grant` — so
      // on the app connection every probe below would be refused by the **ACL** before reaching the guard
      // it is testing (`42501 permission denied for table asset`, not the retention trigger's message).
      // The suite would stay green while measuring nothing. Running as the OWNER restores exactly the
      // environment these assertions were written for and makes each claim STRONGER: "even the table
      // owner is refused". Every PRIVILEGE claim lives in `authorization-plane-privilege.integration.test.ts`
      // on the restricted connection instead; do not merge the two.
      await privilegedPrisma();
    await prisma.$executeRawUnsafe(
      `DELETE FROM "waqf_access_grant" WHERE "id" LIKE 'grant-verb-9%'`,
    );
    // `tgtype` bit 2 = INSERT, 3 = DELETE, 4 = UPDATE, 5 = TRUNCATE (see Postgres `pg_trigger`).
    // ONE catalogue read, shared with the CENSUS-1 mutation probes below, so the census the
    // mutations kill is provably the same census the green assertions use.
    triggers = await prisma.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
    const checkRows =
      await prisma.$queryRawUnsafe<{ tbl: string; name: string }[]>(CHECK_CENSUS_SQL);
    checks = new Set(checkRows.map((row) => `${row.tbl}\t${row.name}`));
  });

  afterAll(async () => {
    const prisma = await privilegedPrisma();
    await prisma.$executeRawUnsafe(
      `DELETE FROM "waqf_access_grant" WHERE "id" LIKE 'grant-verb-9%'`,
    );
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // The census
  // ═══════════════════════════════════════════════════════════════════════════════════════

  it.each(VERB_COVERAGE)('covers $table on every verb in $covers', ({ table, covers }) => {
    const onTable = triggers.filter((row) => row.tbl === table);
    expect(onTable.length, `no non-internal triggers at all on "${table}"`).toBeGreaterThan(0);

    for (const verb of covers) {
      const covering = onTable.filter((row) => row.verbs.includes(verb));
      expect(
        covering.length,
        `"${table}" has no trigger firing on ${verb}. A guard that only sees UPDATE is a proof ` +
          `about one verb: DELETE + re-INSERT and TRUNCATE both walk around it. Present: ` +
          onTable.map((row) => `${row.tgname}=${row.verbs}`).join(', '),
      ).toBeGreaterThan(0);
    }
  });

  it('marks every guard ENABLE ALWAYS, so one plain SET cannot skip it', () => {
    const guarded = new Set(VERB_COVERAGE.map((entry) => entry.table));
    const originOnly = triggers.filter((row) => guarded.has(row.tbl) && row.enabled !== 'A');
    expect(
      originOnly.map((row) => `${row.tbl}.${row.tgname}=${row.enabled}`),
      `'O' = fire on ORIGIN, which Postgres SKIPS after ` +
        `SET session_replication_role = 'replica'. That single statement defeated gate G-1 during ` +
        `Sprint-1 review.`,
    ).toEqual([]);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // CENSUS-1 · the census, widened from TABLES to VERBS
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('CENSUS-1 · every (table, verb) pair in public is DECLARED', () => {
    it('A · every scaffolding-suspended verb is CLOSED — no unnamed sibling keeps firing', () => {
      // The assertion migration 12's duplicate would have failed. `RETENTION_SCAFFOLDING_GUARDS`
      // and its remainder sibling each name ONE trigger per table and then run a DELETE; a second
      // DELETE trigger the list does not know about silently defeats the whole wrapper.
      expect(closureFindings(triggers)).toEqual([]);
    });

    it('B · the manifest matches the live catalogue exactly, in both directions', () => {
      // ⚠ EXACT, NOT A SUBSET, AND THAT IS THE POINT. `VERB_COVERAGE` above asks `> 0` — "does
      // SOMETHING fire on this verb?" — which a duplicate only makes truer. This asks for equality
      // of the (table, trigger, verbs) SET, so an ARRIVING guard is red until it is written down
      // and a DISAPPEARING one is red at once.
      expect(manifestFindings(triggers)).toEqual([]);
    });

    it('B · and the manifest is not vacuously satisfied by an empty catalogue', () => {
      // A census over zero rows agrees with everything. 69 was the count when this was written; the
      // floor is deliberately loose (a migration may legitimately add guards) while still refusing
      // a catalogue read that came back empty or half-empty.
      expect(triggers.length).toBeGreaterThanOrEqual(GUARD_VERB_CENSUS.length);
      expect(GUARD_VERB_CENSUS.length).toBeGreaterThan(60);
    });

    // ─────────────────────────────────────────────────────────────────────────────────────
    // ⚠ MUTATION-VERIFIED. A census no mutation kills is documentation, not a guard.
    //
    // Both probes run inside a `$transaction` that always throws, so the DDL rolls back with it —
    // `DROP TRIGGER` and `CREATE TRIGGER` are transactional in Postgres. They run on the OWNER
    // connection because DDL needs ownership; nothing here asserts a privilege, so the connection
    // is not what is under test. `assertGuardsInstalled()` in the NEXT file fails loudly if a
    // guard were ever left off, which is the backstop.
    // ─────────────────────────────────────────────────────────────────────────────────────

    it('MUTATION · removing a guard turns the manifest RED, naming it', async () => {
      const prisma = await privilegedPrisma();
      const ROLLBACK = '__qmulate_census_mutation_drop__';
      let findings: string[] = [];

      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `DROP TRIGGER reclassification_event_no_delete ON "reclassification_event"`,
          );
          const mutated = await tx.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
          findings = manifestFindings(mutated);
          throw new Error(ROLLBACK);
        })
        .catch((error: unknown) => {
          if (!String(error).includes(ROLLBACK)) throw error;
        });

      expect(
        findings,
        'a DELETE guard was removed and the census did not notice — it is documentation',
      ).not.toEqual([]);
      expect(findings.join('\n')).toMatch(
        /MISSING or CHANGED VERBS.*reclassification_event_no_delete/,
      );

      // …and the guard is back, because the transaction rolled back.
      const after = await prisma.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
      expect(manifestFindings(after)).toEqual([]);
    });

    it('MUTATION · re-adding migration 12’s DUPLICATE DELETE guard turns BOTH halves RED', async () => {
      // The exact shape CENSUS-1 is about, re-created: a second trigger on an ALREADY-GUARDED verb.
      // `reclassification_event_no_mutate` on `BEFORE UPDATE OR DELETE` is what migration 12 shipped
      // first; it broke `corpus-retention`'s mutation control and leaked a row into the next file,
      // and NEITHER census could see it. Both halves see it now.
      const prisma = await privilegedPrisma();
      const ROLLBACK = '__qmulate_census_mutation_duplicate__';
      let manifest: string[] = [];
      let closure: string[] = [];

      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `CREATE TRIGGER reclassification_event_no_mutate
               BEFORE UPDATE OR DELETE ON "reclassification_event"
               FOR EACH ROW EXECUTE FUNCTION qmulate_reclassification_append_only()`,
          );
          const mutated = await tx.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
          manifest = manifestFindings(mutated);
          closure = closureFindings(mutated);
          throw new Error(ROLLBACK);
        })
        .catch((error: unknown) => {
          if (!String(error).includes(ROLLBACK)) throw error;
        });

      expect(
        closure,
        'a second DELETE guard on a scaffolded table is still invisible — CENSUS-1 is not closed',
      ).not.toEqual([]);
      expect(closure.join('\n')).toMatch(/UNNAMED D guard "reclassification_event_no_mutate"/);
      expect(manifest.join('\n')).toMatch(
        /UNDECLARED.*reclassification_event\treclassification_event_no_mutate\tUD/,
      );

      const after = await prisma.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
      expect(closureFindings(after)).toEqual([]);
      expect(manifestFindings(after)).toEqual([]);
    });

    it('MUTATION · a guard created WITHOUT `ENABLE ALWAYS` turns the manifest RED', async () => {
      // The third way a guard stops being one, and the only one that leaves the census's SHAPE
      // intact: `tgenabled = 'O'` is skipped by any session that has done
      // `SET session_replication_role = 'replica'` — a plain SET, not DDL, and the Sprint-1 finding
      // that defeated gate G-1 outright.
      const prisma = await privilegedPrisma();
      const ROLLBACK = '__qmulate_census_mutation_origin__';
      let findings: string[] = [];

      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `ALTER TABLE "reclassification_event" ENABLE REPLICA TRIGGER reclassification_event_no_delete`,
          );
          const mutated = await tx.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
          findings = manifestFindings(mutated);
          throw new Error(ROLLBACK);
        })
        .catch((error: unknown) => {
          if (!String(error).includes(ROLLBACK)) throw error;
        });

      expect(findings.join('\n')).toMatch(
        /NOT 'ENABLE ALWAYS': reclassification_event\.reclassification_event_no_delete=R/,
      );

      const after = await prisma.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
      expect(manifestFindings(after)).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // CENSUS-2 · a guard over a VALUE-TRANSITION must own the BIRTH as well
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('CENSUS-2 · a value-transition guard is not a guard until INSERT is covered', () => {
    it('C · every table gating a transition INTO a value also fires on INSERT', () => {
      expect(transitionBirthFindings(triggers, checks)).toEqual([]);
    });

    it('C · and the rule has subjects — it is not vacuously satisfied by an empty declaration', () => {
      // A rule over zero declared purposes agrees with everything, which is how the previous census
      // stayed green over `asset`. Six was the count when this was written, SEVEN since migration 17
      // (`waqf`.`deletedAt`, memo Q8), EIGHT since migration 25 (`transaction`.`deletedAt`, memo
      // "S7 · AV7-F4") and NINE since migration 27 (`distribution`.`deletedAt`, engineering's
      // extension of that pattern); the floor refuses a list somebody emptied to make a red go away.
      expect(VALUE_TRANSITION_GUARDS.length).toBeGreaterThanOrEqual(9);
      for (const { table } of VALUE_TRANSITION_GUARDS) {
        expect(
          triggers.some((row) => row.tbl === table),
          `"${table}" is declared as carrying a value-transition guard and has no triggers at all`,
        ).toBe(true);
      }
    });

    it('C · `waqf` is DECLARED, not silently absent — and its exemption carries a reason (AV3-11)', () => {
      // ⚠ THE ASSERTION THAT MAKES AV3-11 UN-REPEATABLE. The round-2 list omitted the one table this
      // whole sprint is about, and an omission has no row: neither census half could see it, and a
      // reader could not tell "considered and exempt" from "never thought about". The rule now has
      // to be able to name `waqf`, and the exemption has to come with prose long enough to be an
      // actual argument rather than a shrug.
      // ⚠ MATCHED ON THE COLUMN, NOT MERELY ON THE TABLE. `waqf` now carries TWO entries — the Shart
      // group and (migration 17, memo Q8) `deletedAt` — and a bare `find(row => row.table ===
      // 'waqf')` would silently assert about whichever happened to be declared first. This test is
      // about the SHART group's exemption specifically.
      const entry = VALUE_TRANSITION_GUARDS.find(
        (row) => row.table === 'waqf' && row.column.includes('shartAlWaqif'),
      );
      expect(
        entry,
        '`waqf` is not declared in VALUE_TRANSITION_GUARDS. `waqf_shart_immutable` is a ' +
          'value-transition guard with no INSERT trigger — that is either an expectation this rule ' +
          'must state and fail on, or an exemption it must state and justify. Not a silence.',
      ).toBeDefined();
      // ⊕ S12-3b: EXEMPT → COVERED_BY `waqf_birth_admission` (migration 53). The reason keeps its
      // pre-53 sentences as the record and carries a dated supersession line.
      expect(entry?.insert.kind).toBe('COVERED_BY');
      if (entry?.insert.kind !== 'COVERED_BY') throw new Error('unreachable');
      expect(entry.insert.trigger).toBe('waqf_birth_admission');
      // A reason short enough to be a label is not a reason.
      expect(entry.insert.because.length).toBeGreaterThan(400);
      expect(entry.insert.backstops.length).toBeGreaterThan(0);
      expect(entry.insert.because).toMatch(/SUPERSEDED 2026-09-08/);
      // And the exemption must NOT quietly claim the birth is governed — it isn't, and saying so is
      // the difference between an honest exemption and a fresh false claim in shipped source.
      expect(entry.insert.because).toMatch(/does \*\*not\*\* claim/i);
    });

    it('C · `waqf`.`deletedAt` is DECLARED — a guard the census cannot see is a guard nobody audits', () => {
      // ⚠ THE EXPECTATION MIGRATION 17 OWES THIS FILE (owner-decision memo Q8). Tier 2b lives INSIDE
      // `qmulate_shart_guard()`, so neither CENSUS-1 half can see it: no trigger arrived, no verb
      // changed, and the manifest is byte-identical over a database where the gate exists and one
      // where it does not. The per-COLUMN declaration below is the only place the census can carry
      // it — which is exactly AV3-03's lesson applied to a NEW column rather than to a found defect.
      // Its BEHAVIOUR is asserted in `e3-deed-term-guards.integration.test.ts` (a census still
      // cannot see inside a function body) and mutation-verified there.
      const entry = VALUE_TRANSITION_GUARDS.find(
        (row) => row.table === 'waqf' && row.column === 'deletedAt',
      );
      expect(
        entry,
        '`waqf`.`deletedAt` is not declared in VALUE_TRANSITION_GUARDS. Since migration 17 it is a ' +
          'reserved matter in BOTH directions on the product owner’s ruling (memo Q8), and a gate ' +
          'that no census names is a gate whose disappearance is silent.',
      ).toBeDefined();
      // The reason has to be an argument, and it has to state the measurement — the birth route is
      // OPEN and an exemption that reads as coverage would be a fresh false claim in shipped source.
      if (entry?.insert.kind !== 'COVERED_BY') throw new Error('unreachable');
      expect(entry.insert.trigger).toBe('waqf_birth_admission');
      expect(entry.insert.because.length).toBeGreaterThan(400);
      expect(entry.insert.because).toMatch(/does \*\*not\*\* claim/i);
      expect(entry.insert.because).toMatch(/MEASURED/);
      expect(entry.insert.because).toMatch(/WAQF_BORN_RETIRED/);
      expect(entry.insert.backstops).toEqual([]);
      // And the trigger it names must be the one that actually carries tier 2b.
      expect(entry.trigger).toBe('waqf_shart_immutable');
    });

    it('MUTATION · dropping a backstop CHECK makes `waqf`’s exemption go RED, naming it', async () => {
      // An exemption that reads "the CHECK covers INSERT instead" is worth exactly as much as the
      // CHECK. Here one of the four named backstops is dropped inside a rolled-back transaction and
      // the rule must notice — otherwise the reason is decoration and the gap is silent again.
      const prisma = await privilegedPrisma();
      const ROLLBACK = '__qmulate_census2_mutation_drop_backstop__';
      let findings: string[] = [];

      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `ALTER TABLE "waqf" DROP CONSTRAINT waqf_reversion_recorded_at_pairs_with_capture`,
          );
          const rows = await tx.$queryRawUnsafe<{ tbl: string; name: string }[]>(CHECK_CENSUS_SQL);
          findings = transitionBirthFindings(
            triggers,
            new Set(rows.map((row) => `${row.tbl}\t${row.name}`)),
          );
          throw new Error(ROLLBACK);
        })
        .catch((error: unknown) => {
          if (!String(error).includes(ROLLBACK)) throw error;
        });

      expect(
        findings,
        'a declared backstop was dropped and the exemption did not notice — it is documentation',
      ).not.toEqual([]);
      expect(findings.join('\n')).toMatch(
        /waqf is COVERED .* CHECK "waqf_reversion_recorded_at_pairs_with_capture" carries/s,
      );

      const after = await prisma.$queryRawUnsafe<{ tbl: string; name: string }[]>(CHECK_CENSUS_SQL);
      expect(
        transitionBirthFindings(triggers, new Set(after.map((row) => `${row.tbl}\t${row.name}`))),
      ).toEqual([]);
    });

    it('MUTATION · an EXEMPT declaration on a table that GAINED an INSERT trigger goes RED as STALE — the pre-migration-53 `waqf` declaration, replayed', async () => {
      // The other direction, and the one an exemption normally rots in: an INSERT guard arrives
      // years later, the declared reason ("nothing fires on INSERT, the CHECKs carry it") quietly
      // stops being true, and nobody re-reads it. Migration 53 IS that arrival: `waqf_birth_admission`
      // fires on I. So the live census is asked about `waqf` AS IT WAS DECLARED before S12-3b — an
      // EXEMPT entry — and must say STALE, naming the trigger that arrived. That is exactly what it
      // said on the first run after migration 53, which is how the two entries became COVERED_BY.
      const prisma = await privilegedPrisma();
      const live = await prisma.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
      const shart = VALUE_TRANSITION_GUARDS.find(
        (row) => row.table === 'waqf' && row.column.includes('shartAlWaqif'),
      );
      if (shart === undefined) throw new Error('unreachable');
      const replayed = [
        { ...shart, insert: { kind: 'EXEMPT' as const, because: 'pre-53 wording', backstops: [] } },
      ];
      const findings = transitionBirthFindings(live, checks, replayed);
      expect(findings.join('\n')).toMatch(/waqf is DECLARED EXEMPT .* The exemption is STALE/s);
      expect(findings.join('\n')).toMatch(/waqf_birth_admission=I/);
      // And the LIVE declaration is green: the arrival was recognised.
      expect(transitionBirthFindings(live, checks)).toEqual([]);
    });

    it('MUTATION · dropping `waqf_birth_admission` turns the COVERED_BY declaration RED, naming it', async () => {
      // A declaration that reads "another trigger carries the birth" is worth exactly as much as that
      // trigger. Dropped inside a rolled-back transaction, the rule must notice — for BOTH `waqf`
      // columns, since both name it.
      const prisma = await privilegedPrisma();
      const ROLLBACK = '__qmulate_census2_mutation_drop_birth_admission__';
      let findings: string[] = [];
      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`DROP TRIGGER waqf_birth_admission ON "waqf"`);
          const mutated = await tx.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
          findings = transitionBirthFindings(mutated, checks);
          throw new Error(ROLLBACK);
        })
        .catch((error: unknown) => {
          if (!String(error).includes(ROLLBACK)) throw error;
        });
      expect(
        findings.filter((f) =>
          /waqf is DECLARED COVERED .* by "waqf_birth_admission", but that trigger is GONE/s.test(
            f,
          ),
        ),
      ).toHaveLength(2);
      const after = await prisma.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
      expect(transitionBirthFindings(after, checks)).toEqual([]);
      expect(manifestFindings(after)).toEqual([]);
    });

    it('MUTATION · dropping the new INSERT arm on `asset` turns the rule RED, naming it', async () => {
      // THE EXACT DEFECT, RE-CREATED: `asset_identity_guard` narrowed back to `BEFORE UPDATE`, which
      // is what migrations 5/12/13 shipped and what let an asset be BORN in a reserved state. Both
      // CENSUS-1 halves were green over that state; this rule must not be.
      const prisma = await privilegedPrisma();
      const ROLLBACK = '__qmulate_census2_mutation_drop_insert__';
      let findings: string[] = [];
      let manifest: string[] = [];

      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`DROP TRIGGER asset_identity_guard ON "asset"`);
          await tx.$executeRawUnsafe(
            `CREATE TRIGGER asset_identity_guard
               BEFORE UPDATE ON "asset"
               FOR EACH ROW EXECUTE FUNCTION qmulate_asset_identity_guard()`,
          );
          await tx.$executeRawUnsafe(
            `ALTER TABLE "asset" ENABLE ALWAYS TRIGGER asset_identity_guard`,
          );
          const mutated = await tx.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
          findings = transitionBirthFindings(mutated, checks);
          manifest = manifestFindings(mutated);
          throw new Error(ROLLBACK);
        })
        .catch((error: unknown) => {
          if (!String(error).includes(ROLLBACK)) throw error;
        });

      expect(
        findings,
        'the INSERT arm was removed and the verb-GAP rule did not notice — it is documentation',
      ).not.toEqual([]);
      expect(findings.join('\n')).toMatch(
        /asset gates a VALUE-TRANSITION on "status" \(asset_identity_guard\) but NOTHING fires on INSERT/,
      );
      // The manifest sees the same narrowing (`IU` -> `U`) from its own angle, which is the half
      // that was NOT true before this round: migration 13's manifest declared `U` and agreed.
      expect(manifest.join('\n')).toMatch(/asset\tasset_identity_guard\tIU/);

      const after = await prisma.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
      expect(transitionBirthFindings(after, checks)).toEqual([]);
      expect(manifestFindings(after)).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // CENSUS-3 · the three soft-delete gates, swept as ONE family
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('CENSUS-3 · `deletedAt` is a reserved matter on FOUR tables, over ONE verifier', () => {
    let bodies: GuardBodyRow[];

    beforeAll(async () => {
      const prisma = await privilegedPrisma();
      bodies = await prisma.$queryRawUnsafe<GuardBodyRow[]>(GUARD_BODY_SQL);
    });

    it('F1 · every member fires on UPDATE and is ENABLE ALWAYS', () => {
      for (const { table, trigger, ruling } of SOFT_DELETE_FAMILY) {
        const row = triggers.find(
          (candidate) => candidate.tbl === table && candidate.tgname === trigger,
        );
        expect(row, `${table}.${trigger} is not installed. Ruling: ${ruling}`).toBeDefined();
        expect(row?.verbs, `${table}.${trigger} no longer fires on UPDATE`).toContain('U');
        expect(
          row?.enabled,
          `${table}.${trigger} is not ENABLE ALWAYS, so one \`SET session_replication_role = ` +
            `'replica'\` skips the whole gate`,
        ).toBe('A');
      }
    });

    it('F2 · every member is DECLARED in VALUE_TRANSITION_GUARDS on the `deletedAt` column', () => {
      // AV3-03's rule, applied to the family rather than to one table: a gate the census cannot name
      // is a gate whose disappearance is silent. `waqf` is EXEMPT from the INSERT half and `asset`
      // and `transaction` are REQUIRED — this asserts the DECLARATION exists, not which way it went.
      for (const { table, ruling } of SOFT_DELETE_FAMILY) {
        const entry = VALUE_TRANSITION_GUARDS.find(
          (row) => row.table === table && row.column === 'deletedAt',
        );
        expect(
          entry,
          `${table}.deletedAt is a reserved matter (${ruling}) and is NOT declared in ` +
            `VALUE_TRANSITION_GUARDS. Declare it — EXEMPT with a reason, or REQUIRED — but not as a ` +
            `silence: a silence and a pass look identical to a reader.`,
        ).toBeDefined();
      }
    });

    it('F3 · every member reaches the SAME verifier and binds the SAME subject shape', () => {
      expect(softDeleteFamilyFindings(bodies)).toEqual([]);
    });

    it('F3 · and the family has subjects — the sweep is not vacuously satisfied', () => {
      expect(SOFT_DELETE_FAMILY.length).toBeGreaterThanOrEqual(4);
      expect(SOFT_DELETE_FAMILY_KNOWN_GAPS.length).toBeGreaterThan(0);
      // Every declared table must have triggers at all, so a typo'd table name cannot pass as a
      // table with nothing to check.
      for (const { table } of [...SOFT_DELETE_FAMILY]) {
        expect(
          triggers.some((row) => row.tbl === table),
          `"${table}" is declared in the soft-delete family and has no triggers at all`,
        ).toBe(true);
      }
    });

    it('MUTATION · a member that loses the ONE verifier turns the sweep RED, naming it', async () => {
      // The drift this section exists for: `transaction`'s gate is replaced with a body that no
      // longer consults `qmulate_reserved_matter_defect()` — i.e. it keeps its name, its verbs and
      // its ENABLE ALWAYS, and stops being an authority check. BOTH CENSUS-1 halves stay GREEN over
      // that state (nothing arrived, nothing changed verbs), which is precisely why F3 exists.
      const prisma = await privilegedPrisma();
      const ROLLBACK = '__qmulate_census3_mutation_no_verifier__';
      let findings: string[] = [];
      let manifest: string[] = [];

      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `CREATE OR REPLACE FUNCTION qmulate_transaction_row_retirement()
             RETURNS trigger LANGUAGE plpgsql AS $mutant$ BEGIN RETURN NEW; END $mutant$`,
          );
          const mutated = await tx.$queryRawUnsafe<GuardBodyRow[]>(GUARD_BODY_SQL);
          findings = softDeleteFamilyFindings(mutated);
          manifest = manifestFindings(await tx.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL));
          throw new Error(ROLLBACK);
        })
        .catch((error: unknown) => {
          if (!String(error).includes(ROLLBACK)) throw error;
        });

      expect(
        findings,
        'the gate stopped consulting the verifier and the family sweep did not notice',
      ).not.toEqual([]);
      expect(findings.join('\n')).toMatch(
        /transaction\.transaction_row_retirement's body does not call qmulate_reserved_matter_defect/,
      );
      // ⚠ AND THE PROOF THAT F3 IS NOT REDUNDANT: the manifest is GREEN over the same mutation.
      expect(manifest).toEqual([]);

      const after = await prisma.$queryRawUnsafe<GuardBodyRow[]>(GUARD_BODY_SQL);
      expect(softDeleteFamilyFindings(after)).toEqual([]);
    });

    it('MUTATION · narrowing `transaction_row_retirement` to UPDATE-only turns CENSUS-2 RED', async () => {
      // AV3-03's defect, re-created on the newest member: gate the transition, leave the birth open.
      // MEASURED before migration 25 (rolled back): `INSERT INTO "transaction" (… "deletedAt" =
      // now())` COMMITTED on `qmulate_app`, putting SAR 9,000,000 of istibdal proceeds in the ledger
      // and in no register — so this is not a hypothetical narrowing.
      const prisma = await privilegedPrisma();
      const ROLLBACK = '__qmulate_census3_mutation_update_only__';
      let findings: string[] = [];
      let manifest: string[] = [];

      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`DROP TRIGGER transaction_row_retirement ON "transaction"`);
          await tx.$executeRawUnsafe(
            `CREATE TRIGGER transaction_row_retirement
               BEFORE UPDATE ON "transaction"
               FOR EACH ROW EXECUTE FUNCTION qmulate_transaction_row_retirement()`,
          );
          await tx.$executeRawUnsafe(
            `ALTER TABLE "transaction" ENABLE ALWAYS TRIGGER transaction_row_retirement`,
          );
          const mutated = await tx.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
          findings = transitionBirthFindings(mutated, checks);
          manifest = manifestFindings(mutated);
          throw new Error(ROLLBACK);
        })
        .catch((error: unknown) => {
          if (!String(error).includes(ROLLBACK)) throw error;
        });

      // ⚠ CENSUS-2's rule asks "does SOMETHING fire on INSERT on this table?", and on `transaction`
      // two OTHER guards do (`_dedicated_account_only`, `_correction_shape`) — so the rule alone
      // CANNOT see this narrowing, and saying so is the honest report rather than a claim it can.
      // The MANIFEST is what sees it, exactly as it saw `asset_identity_guard`'s `IU -> U`.
      expect(manifest.join('\n')).toMatch(/transaction\ttransaction_row_retirement\tIU/);
      expect(findings, 'CENSUS-2 is expected to be BLIND here — see the comment').toEqual([]);

      const after = await prisma.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL);
      expect(manifestFindings(after)).toEqual([]);
    });
  });

  it('keeps the deferred distribution authority check DEFERRABLE and INITIALLY DEFERRED', async () => {
    // Not decoration. The seed writes distributions at step 13 and the approvals that authorise
    // them at step 20 of ONE transaction, so an immediate check would refuse a row whose authority
    // is written thirty lines later. If a later change makes this trigger immediate, the seed
    // stops working — and if it stops being a constraint trigger at all, it stops being deferrable
    // and the same thing happens. Pinning both facts says WHY out loud.
    const prisma = await privilegedPrisma();
    const [row] = await prisma.$queryRawUnsafe<{ deferrable: boolean; deferred: boolean }[]>(
      `SELECT t.tgdeferrable AS deferrable, t.tginitdeferred AS deferred
         FROM pg_trigger t
        WHERE t.tgname = 'distribution_authority' AND NOT t.tgisinternal`,
    );
    expect(row?.deferrable).toBe(true);
    expect(row?.deferred).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // C-09 — `waqf_access_grant.deletedAt` was a second, REVERSIBLE off-switch
  //
  // `activeGrantWhere()` treats `deletedAt: null` as one of four validity clauses, exactly like
  // `revokedAt: null`, and `qmulate_has_active_grant()` mirrors it. But
  // `qmulate_grant_role_immutable()` guarded `role`, `(userId, waqfId)` and `revokedAt` — and said
  // nothing about `deletedAt`. Reproduced from a raw connection on a seeded database:
  // `deletedAt = now()` then `deletedAt = NULL` on a live NAZIR grant was ALLOWED, while the
  // documented `revokedAt` round trip was refused with "revocation is one-way". Because
  // un-deleting restores an EXISTING row, the restored seat keeps its original `createdAt` and
  // `grantedByUserId`: the trail reads as though it was never interrupted. It is also how a
  // beneficiary sheds the `beneficiarySelfId` self-isolation pin and puts it back afterwards.
  //
  // MUTATION THAT RE-BREAKS THIS: delete the `deletedAt` clause from
  // `qmulate_grant_role_immutable()`.
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('C-09 · soft-deleting a grant is one-way, exactly like revoking it', () => {
    // ⚠ WRAPPED IN `authzScaffoldingSql()`. Since `00000000000005_e2_grant_admission` a grant may
    // only be BORN inside a transaction appending an `audit_event` naming it, by an actor holding
    // `admin:access_matrix:write` on that endowment — which is exactly this statement, and closing
    // that hole is the round-2 headline (`grant-admission.integration.test.ts`). This row is
    // SCAFFOLDING for the `deletedAt` assertions below, so the wrapper disables the admission guard
    // and re-enables it inside one `DO` block/transaction. The `role_immutable` trigger these cases
    // are actually about is untouched.
    const insertGrantSql = (id: string): string =>
      authzScaffoldingSql([
        `INSERT INTO "waqf_access_grant"
         ("id","userId","waqfId","role","permissions","dataScopes","scopeRefs","validFrom",
          "grantedByUserId","canViewAmlRestricted","amlCompartment","createdAt","updatedAt")
       VALUES ('${id}','${UNSCOPED}','${WAQF_A}','FINANCE'::"Role",
               ARRAY[]::text[], ARRAY[]::text[], ARRAY[]::text[], now(),
               '${GRANTED_BY}', false, false, now(), now())`,
      ]);

    beforeAll(async () => {
      const prisma = await privilegedPrisma();
      await prisma.$executeRawUnsafe(insertGrantSql(TEST_GRANT));
    });

    it('ALLOWS the soft-delete itself — suppression is legitimate, undoing it is not', async () => {
      const prisma = await privilegedPrisma();
      await prisma.$executeRawUnsafe(
        `UPDATE "waqf_access_grant" SET "deletedAt" = now() WHERE "id" = '${TEST_GRANT}'`,
      );
      const [row] = await prisma.$queryRawUnsafe<{ deletedAt: Date | null }[]>(
        `SELECT "deletedAt" FROM "waqf_access_grant" WHERE "id" = '${TEST_GRANT}'`,
      );
      expect(row?.deletedAt).not.toBeNull();
    });

    it('refuses to UN-delete it, with the same reasoning revocation carries', async () => {
      const error = await runProbe(
        guardProbeSql(
          `UPDATE "waqf_access_grant" SET "deletedAt" = NULL WHERE "id" = '${TEST_GRANT}'`,
          'insufficient_privilege',
        ),
      );
      expect(error, 'a suppressed seat was silently restored').toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/soft-deletion is one-way/);
      // The refusal must name what the restoration would silently bring back with it.
      expect(error).toMatch(/beneficiarySelfId/);
    });

    it('refuses the un-delete under session_replication_role = replica', async () => {
      const error = await runProbe(
        guardProbeSql(
          `SET LOCAL session_replication_role = 'replica'; ` +
            `UPDATE "waqf_access_grant" SET "deletedAt" = NULL WHERE "id" = '${TEST_GRANT}'`,
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/soft-deletion is one-way/);
    });

    it('keeps the seat suppressed as far as qmulate_has_active_grant() is concerned', async () => {
      // The point of the column, and the reason its reversibility mattered: the SQL mirror of
      // `activeGrantWhere()` reads `deletedAt IS NULL`, so a soft-deleted seat confers nothing.
      const prisma = await privilegedPrisma();
      const [row] = await prisma.$queryRawUnsafe<{ active: boolean }[]>(
        `SELECT qmulate_has_active_grant('${UNSCOPED}', '${WAQF_A}', 'FINANCE') AS active`,
      );
      expect(row?.active).toBe(false);
    });

    it('refuses TRUNCATE on waqf_access_grant — the authorization plane is not bulk-erasable', async () => {
      const error = await runProbe(
        guardProbeSql(`TRUNCATE "waqf_access_grant" CASCADE`, 'insufficient_privilege'),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/TRUNCATE on "waqf_access_grant" is refused/);
    });

    it('still refuses the documented un-revoke, so the two off-switches behave alike', async () => {
      const prisma = await privilegedPrisma();
      const second = 'grant-verb-9002';
      await prisma.$executeRawUnsafe(insertGrantSql(second).replace(`'FINANCE'`, `'COUNSEL'`));
      await prisma.$executeRawUnsafe(
        `UPDATE "waqf_access_grant" SET "revokedAt" = now() WHERE "id" = '${second}'`,
      );
      const error = await runProbe(
        guardProbeSql(
          `UPDATE "waqf_access_grant" SET "revokedAt" = NULL WHERE "id" = '${second}'`,
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/revocation is one-way/);
    });

    it.todo(
      'SURFACED, NOT RESOLVED: `deletedAt` and `revokedAt` are still TWO off-switches on one seat, ' +
        'and only the reversibility has been closed. The smaller surface is to drop `deletedAt` ' +
        'from `activeGrantWhere()` and let `revokedAt` be the single validity switch, or to ' +
        'require `revokedAt` alongside any `deletedAt`. Both change TypeScript this migration ' +
        'does not own. §12 also wants an `AuditEvent action=delete_soft` for the suppression, ' +
        'which a raw UPDATE does not produce.',
    );

    it('CLOSED in migration 5 — the seeded seat cannot be deleted and re-INSERTed', async () => {
      // This replaces an `it.todo` that read "NOT CLOSED — raw `DELETE FROM \"waqf_access_grant\"`
      // is still permitted, so MP-15 (role is write-once) is defeated by delete + re-INSERT with a
      // different role, exactly as C-03 defeated the Shart guard … Land the trigger and those
      // cleanups as ONE change." It landed as `00000000000005_e2_grant_admission`, together with
      // those cleanups (this file's own scaffolding now goes through `authzScaffoldingSql()`), so
      // leaving the todo standing would be a false claim in shipped source.
      //
      // The predicate is "the audit trail records this row" — which is what keeps scaffolding rows
      // purgeable while every row a legitimate path can create is undeletable, because migration 5
      // also makes an unaudited grant INSERT impossible. See its §2c and
      // `grant-admission.integration.test.ts`.
      const error = await runProbe(
        guardProbeSql(
          `DELETE FROM "waqf_access_grant" WHERE "id" = 'grant-user-nazir-001-${WAQF_A}'`,
          'insufficient_privilege',
        ),
      );
      expect(error).toContain(`${PROBE_BLOCKED}[42501]`);
      expect(error).toMatch(/DELETE on "waqf_access_grant" is refused/);
    });

    it.todo(
      'STILL OPEN — a grant row the audit trail has NEVER recorded stays purgeable BY DESIGN (that ' +
        'is what keeps this file’s own scaffolding removable), and every guard in migration 5 is ' +
        '`ALTER TABLE … DISABLE TRIGGER`-able by the table OWNER — which on Railway is the runtime ' +
        'role itself. Privilege separation is deferred to E12 by ADR-0008; until it lands the ' +
        'DELETE guard is a retention control against an ordinary caller, not a barrier against an ' +
        'insider holding application-database credentials.',
    );
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // CENSUS-4 · the EXCLUSION constraints — the one guard class a TRIGGER census cannot see
  //
  // ── WHY THIS SECTION EXISTS ────────────────────────────────────────────────────────────────
  // Every census above walks `pg_trigger`. `distribution_paid_periods_disjoint` (migration 26,
  // AV7-F2) is not a trigger — it is an `EXCLUDE USING gist` CONSTRAINT, and it is the FIRST
  // load-bearing control in this schema that is not a trigger or a CHECK. So it is invisible to
  // CENSUS-1, CENSUS-2 and CENSUS-3 alike: `ALTER TABLE "distribution" DROP CONSTRAINT
  // distribution_paid_periods_disjoint` would leave every one of them GREEN while re-opening a HIGH
  // breach in which SAR 820,000.00 was recorded as owed against SAR 410,000.00 of ghallah.
  //
  // That is CENSUS-1's own lesson — *a guard whose disappearance is silent is a guard that will
  // disappear* — applied to a new guard KIND rather than to a new table.
  //
  // ⚠ IT ALSO PINS THE PREDICATE, NOT ONLY THE NAME, and one clause especially: the definition must
  // NOT mention `deletedAt`. Migration 26 dropped that clause deliberately (§6 of
  // `distribution-run-schema.integration.test.ts` had recommended it), because with it ONE
  // ungoverned `UPDATE "distribution" SET "deletedAt" = now()` on a PAID run frees its period to be
  // paid again — a paid run going INVISIBLE instead of visibly PAID, which is AV7-F4's failure mode
  // rebuilt in a new constraint. Nothing gates `distribution."deletedAt"`. Migration 26 §3 refuses
  // to install if the clause returns; this asserts the same thing from the running schema.
  //
  // ⚠ WHAT IT CANNOT DO, stated so nobody quotes it too widely: a constraint has no `ENABLE ALWAYS`
  // and the table OWNER can drop it. `session_replication_role = 'replica'` does NOT skip constraint
  // indexes, so that particular route is closed, but the residual sits where every other one in this
  // file does — on the deployment fact that `MIGRATOR_DATABASE_URL` is absent from the web and
  // worker processes, which no test can assert.
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('CENSUS-4 · the EXCLUDE constraints, which no trigger census can see', () => {
    interface ExclusionRow {
      readonly tbl: string;
      readonly name: string;
      readonly def: string;
    }

    /** Every EXCLUDE constraint in `public`, with the definition Postgres actually holds. */
    const EXCLUSION_CENSUS_SQL = `
      SELECT c.relname AS tbl, con.conname AS name, pg_get_constraintdef(con.oid) AS def
        FROM pg_constraint con
        JOIN pg_class c ON c.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE con.contype = 'x' AND n.nspname = 'public'
       ORDER BY c.relname, con.conname`;

    /**
     * The declared set. `contains` is asserted against the INSTALLED definition, so a predicate
     * somebody widens or narrows shows up here and not only in the suite that measured it.
     */
    const DECLARED_EXCLUSIONS: readonly {
      readonly table: string;
      readonly name: string;
      readonly contains: readonly string[];
      readonly forbids: readonly string[];
      readonly why: string;
    }[] = [
      {
        table: 'distribution',
        name: 'distribution_paid_periods_disjoint',
        contains: ['USING gist', '"waqfId"', 'daterange', "'[]'", 'EXECUTED'],
        forbids: ['deletedAt'],
        why:
          'AV7-F2 (HIGH): two EXECUTED runs ONE DAY APART on one endowment recorded SAR 820,000.00 ' +
          'as owed against SAR 410,000.00 of ghallah from a single SAR 500,000.00 receipt — each ' +
          'run individually correct, so no engine invariant caught it and the excess is asl by the ' +
          "engine's own definition (Binding rule 1). `distribution_one_live_run_per_period` is " +
          "UNIQUE on the EXACT TRIPLE and could not see it. The INCLUSIVE `'[]'` bound is " +
          'load-bearing: it normalises to [start, end+1), byte-for-byte the interval periodWindow() ' +
          "gives the run's own ledger query. `deletedAt` is FORBIDDEN from the predicate: with it, " +
          'one ungoverned soft delete on a paid run frees its period to be paid again.',
      },
    ];

    let exclusions: ExclusionRow[];

    beforeAll(async () => {
      const prisma = await privilegedPrisma();
      exclusions = await prisma.$queryRawUnsafe<ExclusionRow[]>(EXCLUSION_CENSUS_SQL);
    });

    it('A · every DECLARED exclusion constraint is INSTALLED, with the predicate it was declared with', () => {
      for (const declared of DECLARED_EXCLUSIONS) {
        const row = exclusions.find(
          (candidate) => candidate.tbl === declared.table && candidate.name === declared.name,
        );
        expect(
          row,
          `${declared.table}.${declared.name} is DECLARED and NOT INSTALLED. ${declared.why}`,
        ).toBeDefined();
        for (const fragment of declared.contains) {
          expect(
            row?.def ?? '',
            `${declared.name}'s installed definition no longer contains ${JSON.stringify(fragment)} ` +
              `— the predicate moved. ${declared.why}`,
          ).toContain(fragment);
        }
        for (const fragment of declared.forbids) {
          expect(
            row?.def ?? '',
            `${declared.name}'s installed definition now contains ${JSON.stringify(fragment)}, ` +
              `which it must NOT. ${declared.why}`,
          ).not.toContain(fragment);
        }
      }
    });

    it('B · every INSTALLED exclusion constraint is DECLARED — a new one may not arrive unnoticed', () => {
      // The other direction, and it is the half that keeps a census honest: an exclusion constraint
      // somebody adds without declaring it here is a control this file reports as absent.
      const undeclared = exclusions
        .filter(
          (row) =>
            !DECLARED_EXCLUSIONS.some(
              (declared) => declared.table === row.tbl && declared.name === row.name,
            ),
        )
        .map((row) => `${row.tbl}.${row.name}`);
      expect(
        undeclared,
        'An EXCLUDE constraint exists that DECLARED_EXCLUSIONS does not name. Declare it with its ' +
          'reason: no trigger census in this file can see it, so its disappearance would be silent.',
      ).toEqual([]);
    });

    it('C · and the declaration is not vacuous — it has subjects', () => {
      expect(DECLARED_EXCLUSIONS.length).toBeGreaterThanOrEqual(1);
      expect(exclusions.length).toBeGreaterThanOrEqual(1);
    });

    it('⚠ MUTATION · dropping the constraint turns CENSUS-4 RED while every TRIGGER census stays GREEN', async () => {
      // The claim this whole section rests on, driven rather than asserted: the trigger censuses
      // cannot see this guard. Both are measured over the SAME mutated state, inside a transaction
      // that always rolls back.
      const prisma = await privilegedPrisma();
      const ROLLBACK = '__qmulate_census4_mutation_dropped__';
      let mutated: ExclusionRow[] = [];
      let manifest: string[] = [];
      let transitions: string[] = [];

      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRawUnsafe(
            `ALTER TABLE "distribution" DROP CONSTRAINT distribution_paid_periods_disjoint`,
          );
          mutated = await tx.$queryRawUnsafe<ExclusionRow[]>(EXCLUSION_CENSUS_SQL);
          manifest = manifestFindings(await tx.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL));
          transitions = transitionBirthFindings(
            await tx.$queryRawUnsafe<TriggerRow[]>(TRIGGER_CENSUS_SQL),
            new Set(
              (await tx.$queryRawUnsafe<{ tbl: string; name: string }[]>(CHECK_CENSUS_SQL)).map(
                (row) => `${row.tbl}\t${row.name}`,
              ),
            ),
          );
          throw new Error(ROLLBACK);
        })
        .catch((error: unknown) => {
          if (!String(error).includes(ROLLBACK)) throw error;
        });

      // CENSUS-4 sees it gone…
      expect(
        mutated.find((row) => row.name === 'distribution_paid_periods_disjoint'),
        'the constraint was dropped and CENSUS-4 did not notice',
      ).toBeUndefined();
      // …and NEITHER trigger census does. That is why this section exists.
      expect(manifest).toEqual([]);
      expect(transitions).toEqual([]);

      // And it is back.
      const after = await prisma.$queryRawUnsafe<ExclusionRow[]>(EXCLUSION_CENSUS_SQL);
      expect(after.map((row) => row.name)).toContain('distribution_paid_periods_disjoint');
    });
  });

  it('leaves the seeded NAZIR seat live and the seeded Shart untouched', async () => {
    // Nothing above may leave the fixture in a state a later file inherits. The two things this
    // file touches hardest are a grant's off-switch and (through the census probes) `waqf`.
    const prisma = await privilegedPrisma();
    const [grant] = await prisma.$queryRawUnsafe<
      { deletedAt: Date | null; revokedAt: Date | null }[]
    >(
      `SELECT "deletedAt", "revokedAt" FROM "waqf_access_grant"
        WHERE "id" = 'grant-user-nazir-001-waqf-001'`,
    );
    expect(grant?.deletedAt ?? null).toBeNull();
    expect(grant?.revokedAt ?? null).toBeNull();

    const waqf = await prisma.waqf.findUniqueOrThrow({ where: { id: WAQF_A } });
    expect(waqf.shartAlWaqifVersion).toBe(1);
  });
});
