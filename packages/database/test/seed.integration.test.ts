// QMULATE — the fixture seed: E1 exit criteria E1-2 / E1-4, plus assertion A8.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHAT A SEED TEST IS ACTUALLY FOR
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Not "did some rows appear". Four specific properties, each of which something downstream
// depends on:
//
//   SHAPE          exactly the fixture's four endowments across three waqifs under one client,
//                  with the right classifications — the counts E1-2 pins.
//   AUDITED        every material write left an `audit_event`. An unaudited seed would mean the
//                  audit spine can be bypassed, which is half of gate G-1.
//   DETERMINISTIC  a second run converges rather than duplicating, and never rewrites a founder's
//                  conditions. Determinism is what makes the hash chain reproducible at all.
//   HONEST         the seeded Shart al-Waqif records what the deed does NOT say instead of
//                  inventing it, and the fixture's own internal contradictions are preserved with
//                  the discrepancy written down rather than quietly repaired.
//
// CONFIDENTIALITY: every value asserted below comes from `data/fixtures/sample-waqf.json`, which
// is entirely invented. No real name, deed number, IBAN or beneficiary appears in this file.

import { readFileSync } from 'node:fs';

import {
  addBusinessDays,
  buildHolidayCalendar,
  countBusinessDays,
  isBusinessDay,
  toHijri as domainToHijri,
} from '@qmulate/domain/dates';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PERMITTED_FIXTURE_PATH } from '../src/guardrail.js';
import { SEED_HOLIDAYS, SEED_HOLIDAY_COVERAGE, UNVERIFIED_NOTE_AR } from '../src/seed/holidays.js';
// Imported rather than re-spelled: PO-1's admin seat must NOT be the E0 sign-in subject, and a
// rename of that constant has to break this comparison instead of silently making it vacuous.
import { SEED_ADMIN_EMAIL } from '../src/seed/map.js';
import { shartAlWaqifSchema } from '../src/seed/shart.js';
import { ALL_SEED_SETTINGS, UNVERIFIED_NOTE, settingValueSchema } from '../src/seed/settings.js';
import {
  assertGuardsInstalled,
  basePrisma,
  closeDatabase,
  databaseModule,
  deleteTestClients,
  ensureSeeded,
  hasDatabase,
  runSeed,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('E1 exit criteria E1-2 / E1-4 (fixture seed)');

/** One audited write per row the seed touches. Pinned by the E1 exit criteria. */
const EXPECTED_COUNTS: Readonly<Record<string, number>> = {
  /**
   * 14 global + 1 per-waqf override. **16 SINCE S2/E2**: `auth.totpStepUp.freshnessSeconds` was
   * appended to `GLOBAL_SETTINGS`. Without it every approve/sign denies with `SETTING_MISSING`
   * (D-6 is fail-closed), so the Nazir could approve nothing on a database built by migrate+seed —
   * and the api suite used to write the row itself in `beforeAll`, provisioning the very
   * precondition it was proving.
   *
   * **18 SINCE S3/E6**: two more appended for the distribution engine —
   * `distribution.deadline.bindingCalendar` (S3 decision D2 — which calendar binds the post-FYE
   * window, defaulted `EARLIER_OF` so lateness can never be UNDER-reported) and
   * `distribution.maintenance.ruleWhenShartSilent` (§08's own open question on the ṣiyāna reserve
   * when the deed is silent, seeded `NONE` as the "we have not decided" value, not a fiqh position).
   * Both are registered in `SETTING_SCHEMAS` and in `UNVERIFIED_FIGURE_KEYS`, and
   * `packages/domain`'s `settings.test.ts` compares schemas↔seed in BOTH directions — so a
   * registered key with no seeded row already fails the unit build.
   *
   * ⚠ This table is what makes `WRITES_PER_SEED_RUN` **135** rather than 133, and it is why the E1-4
   * modulo assertion below went red on CI (three runs × 135 = 405, and `405 % 133 = 6`). That is the
   * pin working: the figure may only move deliberately and visibly. **The 6 was NOT six unaudited
   * writes** — both new rows are audited, which the `audits every entity type` test independently
   * confirms.
   *
   * **STILL 18 AFTER S4/E3.** The lineage/reversion delta needed no new configured figure: a deed
   * term is DATA on the endowment, not a threshold. Recorded here so "18" reads as a measurement
   * rather than as a number nobody re-checked.
   *
   * **19 SINCE S6/E5 — one PER-WAQF row, and its ABSENCE on two endowments is the fixture.**
   * OQ-06 (product owner, 2026-08-18) makes the ṣiyāna reserve under a silent deed the Nazir's
   * recorded discretion, expressed as a percentage per endowment:
   * `distribution.maintenance.nazirDiscretionPercent`, seeded on `waqf-001` ONLY. There is
   * deliberately **no global row** — a platform-wide default percentage would be a figure nobody
   * chose applied to every endowment, which is the exact defect OQ-06 opened — and
   * `waqf-002`/`waqf-003` carry none so the seed can exercise the
   * `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED` path at all. The pre-existing
   * `distribution.maintenance.ruleWhenShartSilent` row is unchanged in COUNT and changed in VALUE
   * (`NONE` → `NAZIR_DISCRETION_PERCENT`), because the owner answered the question it was holding.
   *
   * **20 SINCE S9-4b** (was 19): `retention.aml.minimumYears` — the SAR retention floor the owner
   * adopted provisionally on 2026-08-25 (memo, fourth batch), ⚠ unverified vs primary AML law. A
   * distinct figure from `retention.minimumYears`, appended per the ordinal rule.
   *
   * **25 SINCE S9-2** (was 20): Engine B's remaining windows — the DISTRIBUTE_3M_FYE month
   * anchor (⚠ unverified — a question of law, seeded as the earlier reading per the D2
   * precedent) plus four operating-policy rows (two renewal leads, the pre-alert offsets, the
   * at-risk threshold). Appended per the ordinal rule; S9-1's not-yet-registered tripwire
   * flipped with the registration, exactly as designed.
   *
   * **26 SINCE S9-3c** (was 25): `deadline.UPDATE_15BD.certificateExpiryLeadBd` — how many business
   * days before a recorded `Waqf.certificateExpiry` the daily sweep raises `GOV-REG-02`, which is
   * §09's own parenthesis ("on (or a configurable lead before) expiry"). ⚠ NOT an unverified
   * regulatory figure and deliberately absent from `UNVERIFIED_FIGURE_KEYS`: it moves WHEN WE
   * NOTICE, never the anchor — §09's rule table fixes the 15-business-day window at the certificate
   * expiry, and the api suite pins that a sweep noticing a month early and one noticing on the day
   * compute the SAME due date. Appended per the ordinal rule.
   *
   * **28 SINCE S9-3d** (was 26): `deadline.escalationLadderBd` and
   * `deadline.escalationLadderZeroToleranceBd` — the BR-1004 ladder thresholds for the ordinary and
   * the zero-tolerance classes. The PATH (case_manager → nazir → leadership) is FIXED vocabulary in
   * `deadlines/escalation.ts`, not configuration; only WHEN each rung engages is policy, so both are
   * exempt from `UNVERIFIED_FIGURE_KEYS`. ⚠ Their RELATION is structural and asserted, not
   * configured: `selectEscalationLadder` refuses a zero-tolerance ladder that is slower at any rung.
   */
  Setting: 28,
  /**
   * **8 SINCE S2 ROUND 4** (was 7): PO-1 appends `user-admin-001`, the fixture's one holder of
   * `admin:access_matrix:write`. The figure moved deliberately and visibly — it is what makes
   * `WRITES_PER_SEED_RUN` 133 rather than 131 (135 since S3 added two `Setting` rows — see above),
   * and the E1-4 modulo assertion below is what would
   * have caught a seat added without updating this table.
   *
   * **9 SINCE S4/E3 CLOSE-OUT**: `user-case-manager-001`, on the product owner's answer **D-E**
   * (2026-08-16) — *"deed can be seen by nazir, case manager and elegible beneficiaries"*. Before
   * it, V-E3-L1: **no seeded seat carried `endowment:deed:*` or `legal:reserved_matter:*` at all**,
   * so §17's E3 exit clause ("the reason renders as a human-readable statement") was unreachable by
   * every user that exists. ⚠ The owner was asked about deed **write** and answered about **read**,
   * so write stayed on the nazir seat as a NAMED FALLBACK — ⊕ SUPERSEDED 2026-08-17 (memo Q10): he
   * ruled that a trusteeship deed *"can only be editted by a court judge"*, so the nazir seat's
   * `endowment:deed:write` is the INITIAL RECORDING only and `trusteeship_deed_no_update`
   * (migration 17) refuses every edit to a recorded appointment, for every seat. The seat count is
   * unchanged by that ruling.
   *
   * **11 SINCE S10/T2** (was 9): two NON-HUMAN principals — `user-service-deadline-sweeper` (the
   * declared service seat, owner ruling 2026-08-27 + D1) and `user-control-sweep-coverage` (the
   * coverage control's own identity, G-5's second bound). Neither gets a credential `account`
   * row (§2b skips serviceSeat users — nothing can ever sign in as either), which is why
   * `unaudited writes` stays 9 while User moves to 11.
   */
  // ⊕ S11-2: +1 — `user-compliance-001`, the seated WRITE E2E seat (CASE_MANAGER on waqf-004 alone).
  // ⊕ S11 item 2c: +1 = 13 — `user-auditor-001`, the read-only `/financials` E2E seat (AUDITOR, two
  //   verbs of seventeen). MEASURED from the seed's own report (`User 13`) on a reset cluster.
  // ⊕ S12-2: +1 = 14 — `user-reserved-clerk-001`, the BR-1102 chain E2E seat (COMPLIANCE_OFFICER on
  //   waqf-004 alone, five verbs of twenty-nine). MEASURED from the seed's own report (`User 14`).
  User: 14,
  Client: 1,
  Waqif: 3,
  /**
   * **5 SINCE S4/E3 CLOSE-OUT** (was 4). `waqf-005` is the INTAKE-STATE endowment added on the
   * owner's answer **D-C** (2026-08-16, *"yes"*): `reversionClauseCaptured = false`, so its مآل
   * clause has NOT been read.
   *
   * ⚠ IT EXISTS BECAUSE THE OTHER FOUR ALL RECORD THE CLAUSE, so the state R7-c separates — "nobody
   * has looked" versus "the deed names no taker" — had NO example and could not be tested against
   * seeded data at all. V-E3-01 was a defect in exactly that distinction.
   * `TrusteeshipDeed` is one-per-endowment, so its count moves with this one.
   */
  /**
   * **6 SINCE M1-b** (was 5). `waqf-007` is the COMPUTING lineage sibling (Milestone 1's second
   * half): the fixture's second `LINEAGE_CONTINUATION` deed, recorded COMPLETE (`zuhur_only`,
   * مآل clause read 2025-04-20 and positively naming no taker) so a wired distribution run over
   * the DEFAULT deed shape can compute — waqf-005 deliberately cannot (its UNREAD state is
   * itself a load-bearing subject, D-C, and is untouched).
   */
  Waqf: 6,
  TrusteeshipDeed: 6,
  /**
   * **3 SINCE S5/E4** (was 2). `rev-003` is waqf-002's first revenue row, so `FAKE-ACCT-W2`
   * exists at last — before it, Example B's 200,000 had no row and no dedicated account behind it
   * (FIXTURE_DELTA_REQUIRED). Accounts are derived from the distinct `bankAccount` refs.
   */
  /** **4 SINCE M1-b**: `rev-006` introduces `FAKE-ACCT-W7`, waqf-007's dedicated account. */
  // ⊕ S12-3: 5 — waqf-004's dedicated account, OPENED at onboarding and unused (`bankAccounts` in the
  //   fixture), so Gate 02's one mechanical prerequisite is satisfiable on the browser subject.
  BankAccount: 5,
  /** **7 SINCE M1-b**: `asset-007`, the rented building waqf-007's rent comes from. */
  Asset: 7,
  Expropriation: 1,
  /**
   * **8 SINCE S4/E3** (was 6). Two records, each for a reason the old fixture could not express:
   *
   *  · `ben-010` — a DECEASED daughter of the waqif on waqf-002, and the only seeded row with a
   *    death certified (`active: false` + `deceasedDate`). She exists because `ben-005` is
   *    "Branch B, buṭūn" and a buṭūn grandchild is a DAUGHTER's child: without her, ben-005's line
   *    terminated in nobody and the lineage graph R6 now requires could not be built at all. She is
   *    also R-FRONTIER's only seeded subject — ben-005 is entitled *because* the ancestor between it
   *    and the waqif is dead.
   *  · `ben-009` — the `CATEGORY_ONLY` record. Before it the `CATEGORY_NOT_CAPTURED` gate (G-4,
   *    BR-206) had NO fixture-shaped subject anywhere, so the gate was untestable against seeded
   *    data.
   */
  /**
   * **26 SINCE S5/E4** (was 8), and the jump is 18 rows from TWO causes, decomposed:
   *
   *  · `ben-201`…`ben-216` — waqf-005's SIXTEEN-member, three-generation, four-branch lineage
   *    tree, mirroring the engine's worked-example tree record for record (Examples G/G′/H).
   *    Before them the seeded database could not show a single real `LINEAGE_CONTINUATION`
   *    family tree, and E4's registry/lineage screens had no seeded subject
   *    (FIXTURE_DELTA_REQUIRED's largest item). Four of the sixteen are DECEASED with dual-dated
   *    certifications — a reverting deed needs its dead descendants on record (R7-d).
   *  · `ben-306` / `ben-307` — two further charitable jihas on waqf-003, which was RE-TYPED
   *    `public_charitable` in the same change (a `joint` waqf is a refused shape, ADR-0009 R5).
   *    They are the `ENTITY_UNLICENSED` gate's two negative shapes (unlicensed; expired licence)
   *    beside ben-006's licensed permit arm — no gate arm is fixture-starved (the R6-C1 lesson).
   */
  /**
   * **30 SINCE M1-b** (was 26). `ben-701`…`ben-704` — waqf-007's four-member, two-generation
   * tree, the SMALLEST graph that puts both wired lineage exclusions on a COMPUTING run: two
   * living frontier heads (a son and a daughter of the waqif, both entitled under `zuhur_only`
   * because the continuation rule tests the ancestors BETWEEN a member and the waqif), one
   * member held behind his living father (`ENTITLEMENT_HELD_BY_LIVING_ANCESTOR`, temporary),
   * and one on a daughter's line the deed does not continue (`BUTUN_LINE_NOT_CONTINUED`,
   * permanent under this deed). All four weights are EQUAL ('25') so per capita changes nothing
   * and the run raises no STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA flag. Nobody is deceased —
   * the deceased-id pin below is deliberately unchanged.
   */
  Beneficiary: 30,
  /**
   * **8 SINCE S7** (was 7 since S5/E4, 5 before that). MEASURED from the seed's own report on this
   * machine, both legs on a fresh `--reset` → `migrate deploy` → ONE seed, 2026-08-18:
   *   · HEAD's fixture (4 revenue rows) → `Transaction 7`,  `audited writes 175`
   *   · this fixture (5 revenue rows)   → `Transaction 8`,  `audited writes 176`
   * ⚠ An earlier draft of this docblock wrote `audited writes 154` and `153 → 154`. Both figures
   * were WRONG — 22 short, inherited from the 2026-08-16 note below rather than re-measured. The
   * numbers above were taken by seeding each fixture version into its own fresh cluster and reading
   * the seed's own report, which is the only reason they can be quoted here.
   *
   * The decomposition, so "the ledger grew" is never the answer:
   *   · S5/E4 · `rev-003` (waqf-002's rent — Example B's row) and `rev-004`, the fixture's FIRST
   *     CAPITAL receipt (expropriation compensation on exp-001's taking; corpus, blocked from
   *     every waterfall, Binding rule 1). Before rev-004 the "no corpus leakage" claim was proven
   *     with no seeded corpus row present to leak.
   *   · S7 · `rev-005`, waqf-001's FIRST AND ONLY capital receipt (istibdal proceeds, 4,200,000
   *     SAR, 2026-02-17, asset-002, FAKE-ACCT-W1).
   *
   * ⚠ WHY rev-004 WAS NOT ENOUGH, AND THIS IS THE WHOLE POINT OF THE ROW. V-1/G-9 runs on
   * **waqf-001**; rev-004 is on **waqf-003**. A run scoped to waqf-001 drops rev-004 on the
   * `waqfId` filter BEFORE `receiptClass` is ever consulted — so "the run excluded the corpus row"
   * was demonstrating ENDOWMENT SCOPING, the right refusal for the wrong reason. rev-005 is
   * in-endowment, in-period (dist-001's 2026-01-01…2026-03-31) and on the SAME asset rev-001's
   * rent comes from, so nothing but its CLASS can explain its exclusion.
   *
   * ⚠ IT SHIFTS THE AUDIT ORDINALS, AND THE SHIFT WAS MEASURED ROW BY ROW rather than asserted.
   * Each seeded write takes `occurredAt = SEED_EPOCH + <insertion ordinal>`, so a row appended
   * inside the revenue block renumbers every write after it. Both clusters, same probe:
   *   ·  rev-001  id 79  .078  →  id 79  .078   (before the insertion point — unmoved)
   *   ·  rev-004  id 82  .081  →  id 82  .081   (unmoved)
   *   ·  rev-005      —      —  →  id 83  .082   (NEW, takes rev-004 + 1)
   *   ·  dist-001 id 87  .086  →  id 88  .087   (+1)
   *   ·  dli-dist-001-ben-001  id 88  .087  →  id 89  .088   (+1)
   *   ·  audit_chain_head.lastId  175  →  176
   * So the pins that moved are this count and `WRITES_PER_SEED_RUN` (175 → 176), and nothing else:
   * no literal `rowHash` is pinned anywhere in this repo.
   *
   * ⚠ AND THE HASH-CHAIN HALF OF THAT SENTENCE CANNOT BE PROVEN BY COMPARING HASHES, WHICH IS A
   * FINDING RATHER THAN A CAVEAT. The draft above claimed appending the row "rewrites the hash
   * chain from there". True, but unobservable: the seeded chain is NOT reproducible across two
   * seeds AT ALL. MEASURED — two runs of the IDENTICAL fixture into two fresh clusters gave
   * rev-001's audit row `397b5ec3…` then `8d7b8621…`, and chain heads `8ef18e98…` then `0686f62e…`,
   * while `auditEventTotal` stayed 176 both times. The cause was then read out of the row rather
   * than guessed: `after.createdAt`/`after.updatedAt` are WALL-CLOCK (`2026-08-18T15:11:52.836Z`
   * in the dump), and they are inside the hashed payload. `context` is constant (`requestId:
   * 'seed'`), and `occurredAt` is deterministic — only the row timestamps move.
   * ⇒ A7's `it.todo` below ("pin the frozen final rowHash after a FRESH migrate deploy + exactly
   * one seed") is currently UNSATISFIABLE, not merely uncaptured. See the note on that todo.
   *
   * ⚠ `dist-001`'s seeded waterfall is UNCHANGED by it, and that was verified rather than assumed:
   * `mapDistribution`'s `grossRevenueSar` filters `receiptClass === 'income'`, so the capital row
   * cannot reach it. distributable stays 275,000.00.
   */
  /**
   * **9 SINCE M1-b**: `rev-006`, waqf-007's ONE income receipt (rent, 400,000.00, FAKE-ACCT-W7,
   * 2026-03-31). INCOME at entry — the classification is fixture DATA, and the row exists so the
   * lineage sibling's wired run has yield to distribute (reserve 40,000 → fee 40,000 →
   * distributable 320,000 → two frontier heads at 160,000.00).
   */
  Transaction: 9,
  NazirFee: 1,
  Distribution: 1,
  DistributionLineItem: 2,
  /**
   * **10 SINCE S4/E3** (was 8). `task-009` (SOCPA-audited statements) and `task-010` (internal
   * bylaws), both gate `large_medium`, both on waqf-001 — the MEDIUM endowment.
   *
   * ⚠ THEY EXIST BECAUSE THE §17 E3 EXIT CLAUSE COULD NOT BE SATISFIED WITHOUT THEM. The clause is
   * "the fixture's MEDIUM waqf shows audited-statement/bylaw obligations that the SMALL waqf does
   * not", and waqf-001 carried no `LARGE_MEDIUM`-gated obligation at all — so the contrast would
   * have been measured over an EMPTY set and passed vacuously. `ComplianceObligation` is derived
   * one-per-task, so both counts move together. Appended at the END of the fixture array on purpose:
   * the obligation codes are numbered per section in array order, so inserting anywhere else would
   * renumber `SEED-FIN-*` / `SEED-OPS-*` for every existing task.
   */
  /**
   * ⊕ **46 SINCE S8/E7** (was 10): the ten `SEED-` placeholders above **plus the canonical §09
   * obligation library**, seeded ALONGSIDE them at `libraryVersion` `'2026-08-20.1'`. The
   * placeholders are untouched and keep `'fixture-derived'` — migration 31 refuses an edit to a
   * shipped template outright, and S8-Q5's whole point is that a different library is different
   * ROWS, never the same rows rewritten.
   *
   * ⚠ **46, NOT 47, AND THE MISSING ROW IS A MEASUREMENT RATHER THAN A MISCOUNT.** The catalogue
   * holds **37** templates; `compliance_obligation.titleAr` is **NOT NULL** (`init:377`, relaxed by
   * none of the 32 migrations since) and exactly one template carries `titleAr: null` —
   * **`GOV-COI-01`**, Nazarah Art. 18's conflict-of-interest and ≤2nd-degree self-dealing duty,
   * which QMULATE's own `unified-framework.md` does not restate in Arabic ANYWHERE. Composing one
   * would be inventing the wording of a self-dealing prohibition on a legal-facing screen, so the
   * row is withheld and the withholding is DERIVED (`templatesWithheldFromRegister()`), reported by
   * the seed, and pinned in both directions by `packages/domain`'s parity suite. The set empties by
   * itself the day the Arabic lands or the column is relaxed — and this number then has to move
   * deliberately, which is the only kind of movement this table permits.
   *
   * ⚠ `ComplianceTask` DOES NOT MOVE. Seeding the LIBRARY instantiates nothing: a template is what
   * an endowment MIGHT owe, a task is what one DOES owe, and E7's instantiation engine is the thing
   * that turns one into the other. `e3-exit-clauses.integration.test.ts:333`'s `toHaveLength(2)`
   * counts TASK INSTANCES on waqf-001 and is unaffected — checked, because an earlier draft of the
   * seeding brief claimed otherwise and an overstated blast radius makes a tractable change look
   * like a minefield.
   */
  /**
   * **50 SINCE S9-2** (was 46 from stage 9): library 2026-08-26.1 adds four canonical rows by the
   * owner's rulings (S8-Q9: FIN-MGT-05, FIN-DIST-03, GOV-GEN-04; S8-Q8a: GOV-SHART-03). Still
   * 10 SEED- placeholders + the canonical set − GOV-COI-01 (withheld, unchanged): 10 + 40 = 50.
   */
  ComplianceObligation: 50,
  // ⊕ S11 item 2a: +1 — the canonical GOV-REG-02 task the fixture records the sweep as having RAISED on
  // waqf-003 (EVENT_TRIGGER), bound to the computed UPDATE_15BD row. MEASURED from the report.
  ComplianceTask: 11,
  GovernmentFiling: 4,
  /**
   * ⊕ S11-1 — NEW: exactly ONE `Deadline` row, `REGISTER_30BD` on waqf-001, computed by the seed
   * THROUGH THE ENGINE from the fixture's in-coverage recorded anchor (2026-01-15, invented). waqf-007's
   * anchor is recorded too but is OUTSIDE the seeded 1447–1449 AH calendar coverage, so the engine
   * refuses (`CALENDAR_UNAVAILABLE`) and the seed writes NO row for it — "recorded, not computable" is
   * a state, not a defect. No `ISTIBDAL_10BD` row (exp-001 is pending) and none for `LICENSE_RENEWAL`
   * (still routed). MEASURED from the seed's own report (`Deadline 1`), not derived.
   */
  // ⊕ S11-2: 3 — waqf-001 (open, OVERDUE by construction), waqf-002 (DISCHARGED — MET, on time: the
  // fixture's healthy registration subject), waqf-004 (open; the WRITE E2E journey's subject).
  // MEASURED from the seed's own report (`Deadline 3`).
  // ⊕ S11 item 2a: 4 — + waqf-003's UPDATE_15BD row (`deadline-update-15bd-`), the exit's red. The count
  // query below widened to the seed's whole id grammar (`deadline-`). MEASURED from the report.
  Deadline: 4,
  /**
   * **18 SINCE S2 ROUND 4** (was 17): PO-1's `user-admin-001` seat, `onlyWaqfId: 'waqf-001'`, so ONE
   * new row rather than four. The count is asserted rather than floored because this table is the
   * access matrix — a grant appearing without a decision behind it is the failure mode.
   *
   * **27 SINCE S4/E3 CLOSE-OUT**, and the jump is 9 rows from THREE separate causes, so it is worth
   * decomposing rather than pinning as a number:
   *   · waqf-005 exists (D-C), and every `onlyWaqfId: null` seat is materialised per endowment —
   *     the fifth endowment therefore adds one row per such seat;
   *   · the `user-case-manager-001` seat (D-E) with deed READ;
   *   · the NAZIR shape gains `endowment:deed:read|write|sign` and
   *     `legal:reserved_matter:read|write|approve`, which widens existing rows rather than adding
   *     any — permissions live IN the grant row.
   * ⚠ MEASURED from the seed's own report (`WaqfAccessGrant 27`), not derived. If this number moves
   * again, decompose it again: "the access matrix grew" is never a satisfactory answer.
   */
  /**
   * **32 SINCE M1-b** (was 27), and the jump is exactly the D-C shape repeating: waqf-007 exists,
   * and every `onlyWaqfId: null` seat is materialised per endowment — the sixth endowment adds
   * one row per such seat (five: nazir-001, accountant-001, approver-001, family-board,
   * case-manager-001). MEASURED from the seed's own report (`WaqfAccessGrant 32`), not derived.
   */
  /**
   * **38 SINCE S10/T2** (was 32): the declared service seat is `onlyWaqfId: null`, so the D-C
   * shape repeats one more time — one `compliance:task:write`-only grant per endowment (six),
   * "granted on every endowment it sweeps, visible in the access matrix like any seat" (the
   * ruling's own clause). The coverage-control principal adds ZERO rows: `grantRole: null` is
   * its design — it reads via the unextended handle and holds nothing. MEASURED from the seed's
   * own report (`WaqfAccessGrant 38`), not derived.
   */
  // ⊕ S11-2: 39 — `user-compliance-001`, `onlyWaqfId: 'waqf-004'`, so ONE new row. MEASURED from the report.
  // ⊕ S11 item 2b: 41 — the same seat on THREE endowments (003 · 004 · 007), each proving one board state.
  /**
   * ⊕ S11 item 2c: **46** — `user-auditor-001` (AUDITOR, the read-only `/financials` E2E seat) is
   * granted on FIVE endowments, one per financial state it proves (001 · 003 · 004 · 005 · 007), so
   * five new rows. **MEASURED from the seed's own report on a `--reset` cluster migrated to 49 and
   * seeded from these bytes (`WaqfAccessGrant 46`, `User 13`), NOT derived** — `72e0a6d`'s lesson is
   * that a count taken from expectation rather than from the run is how this pin was wrong before,
   * and a pin holding a number nobody measured is worse than no pin.
   */
  // ⊕ S12-2: **47** — `user-reserved-clerk-001` on waqf-004, ONE new row. MEASURED from the report.
  WaqfAccessGrant: 47,
  // ⊕ S12-3: three gates × six endowments (BR-1101), stated by the fixture, in gate order.
  OnboardingGate: 18,
  Membership: 1,
  /**
   * NEW IN E2. The maker-checker record behind the already-EXECUTED fixture run. CHECK
   * `distribution_approved_requires_approval_request` makes an APPROVED/EXECUTED distribution with a
   * NULL `approvalRequestId` unrepresentable, so a historical run must carry its authority record.
   * See `deriveRunApprovals` for what that row does and does not claim.
   */
  ApprovalRequest: 1,
  /**
   * NEW IN E2. `HolidayCalendar` had ZERO ROWS before this sprint, which made §17's exit clause
   * "crosses a weekend + **a seeded** Hijri holiday" unsatisfiable by construction.
   *
   * Derived from `SEED_HOLIDAYS.length` rather than hard-coded, so this assertion compares the
   * DATABASE against the module that built the rows — the direction that catches a seed that wrote
   * some of them. The module's own shape is pinned separately below.
   */
  HolidayCalendar: SEED_HOLIDAYS.length,
};

/**
 * One `audit_event` per write, so a whole seed run appends exactly this many.
 *
 * ⊕ **MEASURED AT 226 ON 2026-08-24** (M1-b), from the seed's own report on a fresh `--reset` →
 * `migrate deploy` → seed, run TWICE with identical counts (`audited writes 226` both passes).
 * The move is **+14 and only +14** — waqf-007's rows, decomposed: 1 waqf + 1 trusteeship deed +
 * 1 bank account + 1 asset + 4 beneficiaries + 1 transaction + 5 access grants.
 *
 * ⊕ **MEASURED AT 212 ON 2026-08-23** (S8 · the seeding stage), from the seed's own report on a
 * fresh `--reset` → `migrate deploy` → one seed: `audited writes 212`. The move is **+36 and only
 * +36** — the canonical §09 library's storable rows — and it was measured on the same cluster
 * immediately before the change at **176**, rather than derived from this comment. Both figures come
 * from the report line, not from arithmetic on this table.
 *
 * ⚠ **THE PREVIOUS FIGURE'S HISTORY IS KEPT BECAUSE THIS SPRINT GOT A CARRIED-FORWARD NUMBER WRONG
 * THREE TIMES.** 176 on 2026-08-18 (S7 · the run-lifecycle slice); the row `rev-005` moved it from
 * 175, and 175 was re-measured on HEAD's own fixture in a second fresh cluster rather than taken
 * from this comment's own history.
 *
 * ⚠ THE HISTORY, BECAUSE A STALE FIGURE HERE IS WHAT MISLED S7's FIRST DRAFT. **153 on 2026-08-16**
 * (S4/E3 close-out: 141 + 1 user + 1 waqf + 1 trusteeship deed + 9 access grants); **141 on
 * 2026-08-12** (135 + 2 beneficiaries + 2 obligations + 2 tasks). The +22 between 153 and 175 was
 * spent by S5/E4 and S6/E5 and is NOT decomposed here — nobody re-derived it at the time, and
 * writing a plausible split would be inventing one. Read the seed's report, never this list.
 *
 * The constant is derived from the table above rather than written down, so the report and the row
 * counts cannot drift — and the modulo assertion below is what catches a step added without a count
 * here (S3 learned that on CI).
 *
 * ⚠ THE MODULO ASSERTION'S FAILURE MODE READS AS ALARMING AND USUALLY IS NOT. Against a STALE
 * figure it reports something like "expected 24 to be +0" — that is `total % 141` with four runs of
 * 153 behind it, not 24 writes that escaped the audit spine. MEASURED independently at the time
 * this moved: `audit_event` rows = 176 after one seed on a fresh cluster, exactly divisible. Check
 * that before concluding the spine leaked.
 */
const WRITES_PER_SEED_RUN = Object.values(EXPECTED_COUNTS).reduce((total, n) => total + n, 0);

const SEED_ACTOR_ID = 'user-seed-admin';

/**
 * MP-37 — the number of ACTIVE `NAZIR` grants the fixture ships PER ENDOWMENT.
 *
 * TWO: `user-nazir-001` and `user-approver-001`, both with `onlyWaqfId: null`, so both hold NAZIR on
 * all four endowments.
 *
 * ── ⚠ REWORDED BY PRODUCT-OWNER DECISION PO-2 (2026-07-28). READ THIS BEFORE TIGHTENING IT. ──────
 * This comment used to say a second NAZIR holder "IS a second approval authority, whatever the
 * fixture calls it", and treated a third as something to be caught. **That framing was wrong, and the
 * product owner corrected it: the approval claim is ROLE-level, not PERSON-level.** Several people may
 * legitimately hold the Nazir role — cover, leave, succession — and BR-105/BR-1103's "sole approval
 * authority" is a statement about the ROLE, not about a headcount. The invariant that actually matters
 * is **maker ≠ approver**, which is enforced (CHECK `approval_request_checker_distinct` plus the
 * procedure ladder) and separately tested.
 *
 * So: `user-approver-001` is INTENDED and must not be removed, and **no one-approver-per-endowment
 * constraint may be added.**
 *
 * ── WHY THIS IS STILL AN EXACT COUNT ─────────────────────────────────────────────────────────────
 * Not because a third holder would be illegitimate — it would not — but because this is a FIXTURE
 * assertion: the seed's shape is a decided thing, and a seat appearing in the access matrix without a
 * decision behind it is the failure mode. Raising the number is a fixture change and belongs in
 * `SEED_USERS` with a note, not in a relaxed assertion. Separately unresolved, and unrelated to PO-2:
 * `TrusteeshipDeed.primaryNazir` / `authorizedRepName` are NAME STRINGS with no `userId` FK, so the
 * deed and the access matrix cannot be compared programmatically at all (surfaced: UD-15 proposes
 * the FK).
 */
const EXPECTED_ACTIVE_NAZIR_GRANTS_PER_WAQF = 2;

describe.skipIf(!hasDatabase)('E1 · the fixture seed', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    // Other integration files create `client-9xx` rows and clean up after themselves, but Vitest
    // does not guarantee file order — so the id-set assertions below clean first rather than
    // depending on someone else's afterAll having already run.
    await deleteTestClients();
    ensureSeeded();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  async function countSeedAuditEvents(): Promise<number> {
    const prisma = await basePrisma();
    return prisma.auditEvent.count({ where: { actorId: SEED_ACTOR_ID } });
  }

  // ── SHAPE (E1-2) ───────────────────────────────────────────────────────────────────────────

  it('loads exactly the fixture hierarchy: 1 client → 3 waqifs → 5 endowments', async () => {
    const prisma = await basePrisma();

    const clients = await prisma.client.findMany({ orderBy: { id: 'asc' } });
    expect(clients.map((row) => row.id)).toEqual(['client-001']);

    const waqifs = await prisma.waqif.findMany({ orderBy: { id: 'asc' } });
    expect(waqifs.map((row) => row.id)).toEqual(['waqif-001', 'waqif-002', 'waqif-003']);
    for (const waqif of waqifs) expect(waqif.clientId).toBe('client-001');

    const waqfs = await prisma.waqf.findMany({ orderBy: { id: 'asc' } });
    expect(waqfs.map((row) => row.id)).toEqual([
      'waqf-001',
      'waqf-002',
      'waqf-003',
      'waqf-004',
      // The intake-state endowment (D-C). See `EXPECTED_COUNTS.Waqf`.
      'waqf-005',
      // The computing lineage sibling (M1-b). See `EXPECTED_COUNTS.Waqf`.
      'waqf-007',
    ]);
    // One waqif holds two endowments — the hierarchy is genuinely one-to-many at both levels.
    expect(waqfs.filter((row) => row.waqifId === 'waqif-003')).toHaveLength(2);
    // …and since waqf-005, so does another: waqif-002 now holds waqf-002 and waqf-005, which is
    // what stops "a waqif with two endowments" reading as a property of waqif-003 in particular.
    expect(waqfs.filter((row) => row.waqifId === 'waqif-002')).toHaveLength(2);
    // …and since waqf-007 (M1-b), all three waqifs hold two: the one-to-many shape is now total.
    expect(waqfs.filter((row) => row.waqifId === 'waqif-001')).toHaveLength(2);
  });

  it('maps every classification, type, nature and entitlement order', async () => {
    const prisma = await basePrisma();
    const byId = new Map((await prisma.waqf.findMany()).map((row) => [row.id, row] as const));

    expect(byId.get('waqf-001')?.classification).toBe('MEDIUM');
    expect(byId.get('waqf-002')?.classification).toBe('SMALL');
    expect(byId.get('waqf-003')?.classification).toBe('LARGE');
    // ⊕ S9-4a — THIS PIN IS INVERTED BY AN OWNER RULING, and the old comment is worth keeping in
    // view: it read *"the one that is easiest to get wrong: 'direct-utilization' is a classification
    // of its own, not a small waqf."* The product owner ruled the opposite on 2026-08-25 (fifth
    // batch, verbatim selection "a"): ذات انتفاع مباشر is an **orthogonal usage attribute**, not a
    // size — *"an endowment could be small AND direct-use."* So `waqf-004` is now exactly that, and
    // the thing that was "easiest to get wrong" was the model.
    expect(byId.get('waqf-004')?.classification).toBe('SMALL');
    expect(byId.get('waqf-004')?.directUtilization).toBe(true);
    // ⚠ AND EVERY OTHER ENDOWMENT STATES THE ATTRIBUTE, `false`. Not one is left NULL: NULL means
    // UNRECORDED (never "not direct"), and a seeded worked example must not ship the
    // nobody-has-looked state as though it were data.
    for (const id of ['waqf-001', 'waqf-002', 'waqf-003', 'waqf-005', 'waqf-007']) {
      expect(byId.get(id)?.directUtilization, `${id} must STATE its usage axis`).toBe(false);
    }

    expect(byId.get('waqf-001')?.type).toBe('FAMILY_DHURRI');
    // ⚠ RE-TYPED IN S5/E4 — this pin read `JOINT` from S1 until then. waqf-003 was recorded
    // `joint`, a shape the engine REFUSES (ADR-0009 R5: a waqf is either خيري or ذري, never both;
    // register item #11: المشترك is an Authority oversight category, not a hybrid endowment). The
    // fixture's re-typing was FIXTURE_DELTA_REQUIRED's own instruction; `JOINT` deliberately
    // REMAINS in the Prisma enum and the seed mapper as refused-not-remapped vocabulary
    // (ADR-0004), so this line pins the DATA, not the vocabulary.
    expect(byId.get('waqf-003')?.type).toBe('PUBLIC_CHARITABLE');
    expect(byId.get('waqf-001')?.entitlementOrder).toBe('ORDERED');
    expect(byId.get('waqf-002')?.entitlementOrder).toBe('SHARED');
    expect(byId.get('waqf-004')?.entitlementOrder).toBe('NA_DIRECT_USE');
    for (const waqf of byId.values()) expect(waqf.nature).toBe('AYNI');
  });

  /**
   * ⊕ S11 (2026-09-02) — THE PIN COUNTS SEED-OWNED, LIVE ROWS. Found by the orchestrator, who ran the
   * suites in the OTHER order: `anchor-input.integration.test.ts` (S11-1) writes a second `expropriation`
   * row under its own `user-test-api-` id and can only clean up by SOFT-DELETING it (`expropriation`
   * carries a no-delete guard), and this assertion counted the TOMBSTONE — `Expropriation: expected 1,
   * received 2`, alone, forever, on any cluster the api suite had touched. It was green in CI and in
   * every builder chain only because `turbo.json`'s `test:integration` depends on `^test:integration`,
   * so the database suite always ran FIRST: **green by ordering, not by isolation** — a dependency
   * edge that exists for build reasons was the only thing between this pin and red.
   *
   * Two exclusions, and what each one is NOT:
   *  · `deletedAt: null` where the model soft-deletes — a tombstone is a sibling test's cleanup, not a
   *    seed row (the seed writes none). Deadline and ApprovalRequest already counted this way.
   *  · `id NOT contains 'test'` — every test-provisioned id in this repo carries `test` (`user-test-`,
   *    `waqf-test-`, `api-test-`, `req-test-`, `grant-test-`, `oblig-test-`, `membership-test-`, measured
   *    2026-09-02), and NO fixture id does (asserted over the fixture below, so the convention cannot
   *    silently start excluding seed rows).
   *  ⚠ NOT excluded, on purpose: a row a test leaves behind LIVE under a Prisma-defaulted cuid. That is an
   *    unexplained row and the pin SHOULD go red on it — the test owns the fix (mark the id, or clean up).
   *  ⚠ NOT a `waqfId` filter: `Setting.waqfId` is null for the 14 global rows, and a `not contains` on a
   *    NULL column drops them. Scope by id; a test endowment's rows carry its `test`-marked id or a cuid.
   */
  it('writes exactly the E1-2 row counts', async () => {
    const prisma = await basePrisma();
    const seedOwned = { id: { not: { contains: 'test' } } } as const;
    const seedOwnedLive = { ...seedOwned, deletedAt: null } as const;
    const actual: Record<string, number> = {
      Setting: await prisma.setting.count({ where: seedOwnedLive }),
      User: await prisma.user.count({ where: seedOwned }),
      Client: await prisma.client.count({ where: seedOwnedLive }),
      Waqif: await prisma.waqif.count({ where: seedOwnedLive }),
      Waqf: await prisma.waqf.count({ where: seedOwnedLive }),
      TrusteeshipDeed: await prisma.trusteeshipDeed.count({ where: seedOwnedLive }),
      BankAccount: await prisma.bankAccount.count({ where: seedOwnedLive }),
      OnboardingGate: await prisma.onboardingGate.count({
        where: { id: { startsWith: 'gate-' }, deletedAt: null },
      }),
      Asset: await prisma.asset.count({ where: seedOwnedLive }),
      // The row that found this: the S11-1 api file's soft-deleted second expropriation.
      Expropriation: await prisma.expropriation.count({ where: seedOwnedLive }),
      Beneficiary: await prisma.beneficiary.count({ where: seedOwnedLive }),
      Transaction: await prisma.transaction.count({ where: seedOwnedLive }),
      NazirFee: await prisma.nazirFee.count({ where: seedOwnedLive }),
      Distribution: await prisma.distribution.count({ where: seedOwnedLive }),
      DistributionLineItem: await prisma.distributionLineItem.count({ where: seedOwned }),
      ComplianceObligation: await prisma.complianceObligation.count({ where: seedOwnedLive }),
      ComplianceTask: await prisma.complianceTask.count({ where: seedOwnedLive }),
      GovernmentFiling: await prisma.governmentFiling.count({ where: seedOwnedLive }),
      // ⊕ S11-1 — the fixture's computed REGISTER_30BD row, counted over its OWN id grammar and live
      // rows only: sibling integration files create deadline rows in their own series and soft-delete
      // them, and Vitest does not guarantee file order.
      Deadline: await prisma.deadline.count({
        where: { id: { startsWith: 'deadline-' }, deletedAt: null },
      }),
      WaqfAccessGrant: await prisma.waqfAccessGrant.count({ where: seedOwnedLive }),
      Membership: await prisma.membership.count({ where: seedOwnedLive }),
      // E2 additions. Counted here (rather than merely tolerated) so a seed step that stops writing
      // them fails this assertion instead of silently making EXIT-2 unsatisfiable again.
      ApprovalRequest: await prisma.approvalRequest.count({
        // Sibling integration files create their own approval rows in a 9xxx series and clean up
        // afterwards, but Vitest does not guarantee file order — so the fixture count is measured
        // over the fixture's own id grammar rather than over the whole table.
        where: { id: { startsWith: 'appr-dist-' } },
      }),
      HolidayCalendar: await prisma.holidayCalendar.count({ where: seedOwned }),
    };
    expect(actual).toEqual(EXPECTED_COUNTS);
  });

  it('marks no fixture id with `test`, so the pin above can never exclude a seed row', () => {
    const text = readFileSync(PERMITTED_FIXTURE_PATH, 'utf8');
    const ids = [...text.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1] as string);
    // Anti-vacuity floor: the fixture carries 73 `"id"` keys on 2026-09-02 (one record per line).
    expect(ids.length).toBeGreaterThan(50);
    expect(ids.filter((id) => id.includes('test'))).toEqual([]);
  });

  // ── S4/E3: THE LINEAGE EDGE, THE DEED TERMS, AND THE GATE CONTRAST ─────────────────────────
  //
  // Everything in this block is data the fixture could NOT express before migration 12. It is
  // asserted at the row level here because the layers above it (the api's `beneficiary.lineage`
  // projection, the engine's frontier resolver) can only be as right as these rows are — and R6's
  // whole point is that a member the engine cannot place in the tree is a PAYOUT, not a cosmetic gap.

  describe('E3 · the lineage edge (ADR-0009 / R6 / R-FRONTIER)', () => {
    it('gives EVERY family and category beneficiary an edge — on ORDERED and SHARED too (R6)', async () => {
      const prisma = await basePrisma();
      const beneficiaries = await prisma.beneficiary.findMany({ orderBy: { id: 'asc' } });

      for (const row of beneficiaries) {
        if (row.kind === 'CHARITABLE_JIHA') {
          // The mirror: a jiha is not a descendant, so it carries NEITHER half of the edge.
          expect(row.lineageLink, `${row.id} is a jiha carrying a lineageLink`).toBeNull();
          expect(row.parentId, `${row.id} is a jiha carrying a parentId`).toBeNull();
          expect(row.tabaqa, `${row.id} is a jiha carrying a ṭabaqa`).toBeNull();
          continue;
        }
        expect(
          row.lineageLink,
          `${row.id} (${row.kind}) has no lineageLink. R6: eligibility comes from DESCENT whatever ` +
            `order the deed uses, so the engine halts LINEAGE_LINK_MISSING — measured at ` +
            `78,000,000 of 78,000,000 halalas paid to an unplaceable member before R6 landed.`,
        ).not.toBeNull();
      }

      // The edge exists on the two endowments whose ORDER does not read it — which is exactly R6's
      // point and the thing a "lineage-mode only" reading would have got wrong.
      const byId = new Map(beneficiaries.map((row) => [row.id, row] as const));
      expect(byId.get('ben-002')?.parentId).toBe('ben-001'); // waqf-001, ORDERED
      expect(byId.get('ben-005')?.parentId).toBe('ben-010'); // waqf-002, SHARED
      expect(byId.get('ben-009')?.parentId).toBe('ben-004'); // CATEGORY_ONLY still needs one
    });

    it('means "a child of the waqif" by parentId: null, and ṭabaqa agrees with the derived depth', async () => {
      const prisma = await basePrisma();
      const rows = await prisma.beneficiary.findMany({ orderBy: { id: 'asc' } });
      const byId = new Map(rows.map((row) => [row.id, row] as const));

      /** Depth by walking the edge — the value the engine DERIVES and cross-checks ṭabaqa against. */
      const derivedDepth = (id: string): number => {
        let depth = 1;
        let cursor = byId.get(id);
        while (cursor?.parentId != null) {
          depth += 1;
          cursor = byId.get(cursor.parentId);
          expect(depth, 'a cycle in the seeded lineage graph').toBeLessThan(10);
        }
        return depth;
      };

      for (const row of rows) {
        if (row.lineageLink === null) continue; // not in the graph
        expect(
          row.tabaqa,
          `${row.id} is in the lineage graph but records no ṭabaqa. A null ṭabaqa on a recorded ` +
            `descendant DISAGREES with the derived depth and halts (TABAQA_MISMATCHES_LINEAGE_DEPTH).`,
        ).toBe(derivedDepth(row.id));
      }
      // `parentId: null` is ṭabaqa 1 — A CHILD OF THE WAQIF, never "unknown".
      for (const id of ['ben-001', 'ben-003', 'ben-004', 'ben-010']) {
        expect(byId.get(id)?.parentId).toBeNull();
        expect(byId.get(id)?.tabaqa).toBe(1);
      }
    });

    it('keeps every edge inside one endowment — structurally, via the composite FK', async () => {
      const prisma = await basePrisma();
      const rows = await prisma.beneficiary.findMany();
      const waqfById = new Map(rows.map((row) => [row.id, row.waqfId] as const));
      for (const row of rows) {
        if (row.parentId === null) continue;
        expect(
          waqfById.get(row.parentId),
          `${row.id} names a parent on another endowment. The composite foreign key ` +
            `beneficiary(waqfId, parentId) -> beneficiary(waqfId, id) makes that unrepresentable.`,
        ).toBe(row.waqfId);
      }
    });

    it('carries an EXPLICIT vital status, and certifies every death separately from it', async () => {
      const prisma = await basePrisma();
      const rows = await prisma.beneficiary.findMany({ orderBy: { id: 'asc' } });

      // R-FRONTIER's data obligation: `active` is never defaulted, because an ANCESTOR's value
      // decides a whole branch's entitlement. The column is NOT NULL with no default, so every row
      // states it.
      //
      // **FIVE deceased SINCE S5/E4** (was one — ben-010, and this pin read "the one death").
      // waqf-005's tree adds four, each a different frontier shape: ben-201 (a dead branch head —
      // his children stand at the frontier), ben-203 (the G↔G′ hinge, a dead DAUGHTER of the
      // waqif), ben-207 (two dead generations in one chain, under ben-201), and ben-214 (a dead
      // middle link whose own father ben-204 is ALIVE — the ancestor walk must keep ben-215 held).
      const deceased = rows.filter((row) => !row.active);
      expect(deceased.map((row) => row.id)).toEqual([
        'ben-010',
        'ben-201',
        'ben-203',
        'ben-207',
        'ben-214',
      ]);
      for (const row of deceased) {
        expect(row.deceasedAt, `${row.id} is inactive with no certification`).not.toBeNull();
        expect(row.deceasedAtHijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }

      // A death is CERTIFIED by `deceasedAt`; `active: false` alone may be a scope exit. Open defect
      // R7-D1 turns on exactly that distinction, so no live row may carry a death date.
      for (const row of rows.filter((r) => r.active)) {
        expect(row.deceasedAt, `${row.id} is active and carries a deceasedAt`).toBeNull();
      }

      // AND THE FRONTIER IS OBSERVABLE IN THE SEEDED DATA, not just in the engine's own fixtures:
      // ben-005 is entitled only because the ancestor between it and the waqif is dead.
      const ben005 = rows.find((row) => row.id === 'ben-005');
      expect(ben005?.parentId).toBe('ben-010');
      expect(rows.find((row) => row.id === 'ben-010')?.active).toBe(false);
    });

    it('reads the chain through the ancestor walk, which is the ONLY authority', async () => {
      const { readBeneficiaryAncestry, ancestryByBeneficiary } = await databaseModule();
      const prisma = await basePrisma();

      const rows = await readBeneficiaryAncestry(prisma, 'waqf-002');
      const chains = ancestryByBeneficiary(rows);

      // ben-005's chain is exactly one ancestor — ben-010, deceased. That single row is what
      // `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` is decided from, and it is why the walk returns every
      // ancestor rather than a boolean.
      expect(chains.get('ben-005')).toEqual([
        {
          waqfId: 'waqf-002',
          beneficiaryId: 'ben-005',
          ancestorId: 'ben-010',
          depth: 1,
          ancestorActive: false,
          ancestorLineageLink: 'DAUGHTER',
          ancestorDeletedAt: null,
        },
      ]);

      // A child of the waqif has an EMPTY chain, and that is a MEANINGFUL answer rather than a
      // missing one: no ancestor strictly between them and the waqif is what makes them entitled.
      expect(chains.get('ben-004')).toBeUndefined();
      expect(chains.get('ben-010')).toBeUndefined();

      // The walk is endowment-scoped by ARGUMENT, because raw SQL does not reach the force filter.
      expect(rows.every((row) => row.waqfId === 'waqf-002')).toBe(true);
      expect(await readBeneficiaryAncestry(prisma, 'waqf-003')).toEqual([]);
      await expect(readBeneficiaryAncestry(prisma, '')).rejects.toThrow(/waqfId is required/);
    });

    it('has NO column, view or projection that persists an exclusion verdict', async () => {
      // ⚠ THE PROHIBITION, ASSERTED. `ENTITLEMENT_HELD_BY_LIVING_ANCESTOR` is TEMPORARY — it reverses
      // on that ancestor's death — so any stored "excluded"/"entitledCohort"/"lastComputedFrontier"
      // column or materialized view would keep paying the wrong branch after a death is recorded.
      const prisma = await basePrisma();
      const columns = await prisma.$queryRawUnsafe<{ table_name: string; column_name: string }[]>(
        `SELECT table_name, column_name FROM information_schema.columns
          WHERE table_schema = 'public'
            AND (lower(column_name) LIKE '%excluded%' OR lower(column_name) LIKE '%ineligible%'
                 OR lower(column_name) LIKE '%entitledcohort%' OR lower(column_name) LIKE '%frontier%')`,
      );
      expect(
        columns,
        'a column that looks like a cached entitlement verdict now exists. Entitlement is ' +
          'recomputed from the register every period and the ancestor walk is the only authority.',
      ).toEqual([]);

      const matviews = await prisma.$queryRawUnsafe<{ matviewname: string }[]>(
        `SELECT matviewname FROM pg_matviews WHERE schemaname = 'public'`,
      );
      expect(matviews).toEqual([]);
    });
  });

  describe('E3 · the deed terms landed as WRITE-ONCE data', () => {
    it('records the continuation stipulation as a deed FACT, with no default anywhere', async () => {
      const prisma = await basePrisma();
      const byId = new Map((await prisma.waqf.findMany()).map((row) => [row.id, row] as const));

      // BOTH values are present in the fixture, so the term is demonstrably read rather than
      // defaulted: a single-valued fixture cannot tell a recorded fact from a constant.
      expect(byId.get('waqf-001')?.continuationStipulation).toBe('ZUHUR_ONLY');
      expect(byId.get('waqf-002')?.continuationStipulation).toBe('ZUHUR_AND_BUTUN');
      // And a deed that continues no line says so with a NULL rather than by omission — waqf-003 is
      // joint (a refused shape) and waqf-004 is direct use, where no yield is distributed at all.
      expect(byId.get('waqf-003')?.continuationStipulation).toBeNull();
      expect(byId.get('waqf-004')?.continuationStipulation).toBeNull();

      // ⚠ THE COLUMN MUST CARRY NO DEFAULT. A defaulted continuation stipulation is code choosing
      // which of the waqif's lines continue, which decides the HEAD COUNT and therefore every share.
      const [column] = await prisma.$queryRawUnsafe<{ column_default: string | null }[]>(
        `SELECT column_default FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'waqf'
            AND column_name = 'continuationStipulation'`,
      );
      expect(column?.column_default).toBeNull();
    });

    it('separates "nobody has read the مآل clause" from "the deed names no taker" (R7-c)', async () => {
      const prisma = await basePrisma();
      const waqfs = await prisma.waqf.findMany({ orderBy: { id: 'asc' } });

      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ⚠ INVERTED (S4/E3 close-out). THIS TEST USED TO ASSERT THE OPPOSITE OF ITS OWN TITLE.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // It looped over every waqf and required `reversionClauseCaptured === true`. So a test named
      // "separates nobody-has-read from the-deed-names-no-taker" asserted that the UNREAD state
      // DOES NOT OCCUR — it measured one of the two states it claims to distinguish, and the
      // distinction it is named for was untested by construction. That is not pedantry: V-E3-01 was
      // a defect in exactly this distinction (a recorded "this deed names no مآل" was rewritable
      // into a charitable reversion, because the guard read NULL as "unwritten"), and this test was
      // green throughout.
      //
      // The product owner supplied the missing state on 2026-08-16 (D-C, *"yes"*). The assertion is
      // now that BOTH exist and that they are told apart by `reversionClauseCaptured` and by
      // nothing else — `reversionKind` is NULL in both, which is the whole point.
      const byId = new Map(waqfs.map((row) => [row.id, row] as const));

      const read = waqfs.filter((row) => row.reversionClauseCaptured);
      const unread = waqfs.filter((row) => !row.reversionClauseCaptured);
      expect(read.length, 'no seeded deed records its مآل clause as read').toBeGreaterThan(0);
      expect(
        unread.map((row) => row.id),
        'the UNREAD state has no example again — R7-c is untestable against seeded data, which is ' +
          'the condition D-C was answered to remove',
      ).toEqual(['waqf-005']);

      for (const waqf of waqfs) {
        // NEITHER state names a taker, and that is precisely why the flag has to carry the
        // distinction: `reversionKind IS NULL` is ambiguous on its own.
        expect(waqf.reversionKind, `${waqf.id} seeds a live reversion`).toBeNull();

        // ⚠ AND THE DATES NOW PAIR WITH THE **READING**, NOT WITH THE KIND (S4/E3 round 2, AV-1).
        // This loop used to require `reversionRecordedAt === null` on every row, citing the CHECK
        // `waqf_reversion_recorded_at_pairs_with_kind` — "provenance exists iff a kind does". That
        // pairing is what left `reversionClauseCaptured` free to move ALONE: measured as
        // `qmulate_app` on waqf-005, `UPDATE "waqf" SET "reversionClauseCaptured" = true` committed
        // by itself and the seal then closed over a row that had recorded nothing, permanently
        // registering that the founder named no ultimate taker. Reading a deed's مآل clause is an
        // ACT performed by somebody on a day, whatever the clause turns out to say — so the four
        // deeds recording NO taker carry the date they were READ, and only the unread one has none.
        expect(
          waqf.reversionRecordedAt !== null,
          `${waqf.id}: the مآل reading date does not pair with reversionClauseCaptured`,
        ).toBe(waqf.reversionClauseCaptured);
        expect(waqf.reversionRecordedAtHijri === null).toBe(waqf.reversionRecordedAt === null);
      }

      // The five invented deeds that WERE read (waqf-007 joined in M1-b): their NULL is the
      // founder's recorded answer, and it is an answer given on a recorded day. 2025-04-20
      // (1446-10-22 AH) is INVENTED, like every other date in `sample-waqf.json`.
      for (const id of ['waqf-001', 'waqf-002', 'waqf-003', 'waqf-004', 'waqf-007']) {
        expect(byId.get(id)?.reversionClauseCaptured, `${id} lost its recorded reading`).toBe(true);
        expect(byId.get(id)?.reversionRecordedAt?.toISOString().slice(0, 10)).toBe('2025-04-20');
        expect(byId.get(id)?.reversionRecordedAtHijri).toBe('1446-10-22');
      }
      expect(byId.get('waqf-005')?.reversionRecordedAt).toBeNull();
      expect(byId.get('waqf-005')?.reversionRecordedAtHijri).toBeNull();

      // ⚠ `reversionClauseCaptured` IS THE COLUMN THAT MAKES THE DISTINCTION EXIST, so it must be
      // REQUIRED and carry NO DEFAULT — otherwise "nobody has looked yet" becomes the state of every
      // row created before anyone read the deed, and would be read as the deed's own silence.
      const [column] = await prisma.$queryRawUnsafe<
        { is_nullable: string; column_default: string | null }[]
      >(
        `SELECT is_nullable, column_default FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'waqf'
            AND column_name = 'reversionClauseCaptured'`,
      );
      expect(column?.is_nullable).toBe('NO');
      expect(column?.column_default).toBeNull();
    });

    it('seeds NO ultimate taker at all, and says so rather than leaving the table unexplained', async () => {
      const prisma = await basePrisma();
      // ⚠ DELIBERATELY ZERO. Seeding a live reversion means authoring a ذري deed that names a
      // charity — the exact configuration open defect R7-D1 (HIGH) is about, where the extinction
      // trigger reads an unenumerated CATEGORY_ONLY placeholder's `active: false` as a family's death
      // and pays the charity the whole distributable. A seed is not entitled to invent that shape to
      // give a table a row. The reversion path's fixtures stay in packages/domain (Examples J / J′).
      expect(await prisma.waqfReversionTaker.count()).toBe(0);
      // The TABLE exists, though — asserted so "no rows" cannot be confused with "no migration".
      const [table] = await prisma.$queryRawUnsafe<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'waqf_reversion_taker'`,
      );
      expect(table?.n).toBe(1);
    });

    it('records a DEED WEIGHT distinct from sharePercent — the 37.5% defect, structurally closed', async () => {
      const { Decimal } = await databaseModule();
      const prisma = await basePrisma();
      const rows = await prisma.beneficiary.findMany({
        where: { waqfId: 'waqf-001' },
        orderBy: { id: 'asc' },
      });

      // waqf-001's three roster `sharePercent`s sum to 37.5, NOT 100 — §08 treats 12.5 as a RELATIVE
      // deed weight renormalised over the ENTITLED cohort. One field for both meanings is how a
      // 37.5%-of-distributable payout ships, so the two are separate columns and both are populated.
      const shareSum = rows.reduce(
        (total, row) => total.plus(row.sharePercent ?? 0),
        new Decimal(0),
      );
      expect(shareSum.equals(new Decimal('37.5'))).toBe(true);
      for (const row of rows) {
        expect(row.stipulatedWeight, `${row.id} has no stipulatedWeight`).not.toBeNull();
        // Scale 18 — `MAX_WEIGHT_DECIMAL_PLACES`. A weight is not money, so Decimal(18,2) does not
        // apply to it.
        expect(row.stipulatedWeight?.equals(new Decimal('12.5'))).toBe(true);
      }
      // …and they are genuinely different columns, not one value read twice: ben-010 carries a deed
      // weight with NO roster share at all.
      const ben010 = await prisma.beneficiary.findUniqueOrThrow({ where: { id: 'ben-010' } });
      expect(ben010.sharePercent).toBeNull();
      expect(ben010.stipulatedWeight?.equals(new Decimal('25'))).toBe(true);
    });

    it('makes the receipt classification DATA, not a decision in the mapper', async () => {
      // `Decimal` comes from the package under test, not from a direct `decimal.js` import — the
      // file's own pattern (`:726`, `:1566`). Two decimal.js copies compare unequal on `instanceof`,
      // and importing the library directly is how a money assertion starts passing for the wrong
      // reason.
      const { Decimal } = await databaseModule();
      const prisma = await basePrisma();
      const revenue = await prisma.transaction.findMany({
        where: { type: 'REVENUE' },
        orderBy: { id: 'asc' },
      });
      // The classification travels from the FIXTURE (since S4), and SINCE S5/E4 the fixture
      // finally carries a CAPITAL receipt: rev-004, the compensation exp-001 records — corpus,
      // never distributable (Binding rule 1). The three rents stay INCOME. ⚠ The "still owed"
      // note this test carried ("no CAPITAL receipt is seeded, so 'no corpus leakage' is proven
      // over a set with nothing to leak") is DISCHARGED by rev-004, and the objection it raised —
      // that receiving the compensation contradicts exp-001's `assessed` status — is answered in
      // the data: compensation received while the ISTIBDAL (the replacement acquisition) is still
      // pending_authority_permission is a coherent, and common, intermediate state.
      expect(revenue.map((row) => [row.id, row.receiptClass])).toEqual([
        ['rev-001', 'INCOME'],
        ['rev-002', 'INCOME'],
        ['rev-003', 'INCOME'],
        ['rev-004', 'CAPITAL'],
        ['rev-005', 'CAPITAL'],
        // ⊕ M1-b · waqf-007's one income receipt (the computing lineage sibling's yield).
        ['rev-006', 'INCOME'],
      ]);
      for (const row of revenue.filter((r) => r.receiptClass === 'INCOME')) {
        expect(row.capitalSource).toBeNull();
      }
      const capital = revenue.find((row) => row.id === 'rev-004');
      expect(capital?.capitalSource).toBe('EXPROPRIATION_COMPENSATION');
      // ⊕ S7 · rev-005. TWO capital rows now, on TWO endowments, and the SECOND one is what makes
      // a waqf-001 corpus-wall proof mean anything: rev-004 is on waqf-003, so a waqf-001 run
      // never had to consult a class to exclude it. Asserted with its endowment and its asset
      // beside it, because "in the same endowment and on the same asset as the income row" is the
      // property being bought, not the classification alone.
      const istibdal = revenue.find((row) => row.id === 'rev-005');
      expect(istibdal?.capitalSource).toBe('ISTIBDAL_PROCEEDS');
      expect(istibdal?.waqfId).toBe('waqf-001');
      expect(istibdal?.assetId).toBe('asset-002');
      expect(revenue.find((row) => row.id === 'rev-001')?.assetId).toBe('asset-002');
      // Inside dist-001's period (2026-01-01…2026-03-31), so a V-1 run for that quarter SEES it.
      expect(istibdal?.date.toISOString().slice(0, 10)).toBe('2026-02-17');
      // 4,200,000.00 SAR — invented, derived as 10% of asset-002's recorded 42,000,000 valuation so
      // the figure traces to the fixture rather than being plucked. Compared with `.equals(new
      // Decimal(…))`, this file's own pattern (`:1568-1572`, `:1587`): a bare `toBe` would compare
      // object identity and say nothing about the value.
      //
      // ⚠ AND NOT WITH `.toFixed(2)`, WHICH IS WHAT S7's FIRST DRAFT WROTE AND WHICH FAILS LINT:
      // `no-restricted-syntax` bans `.toFixed(` repo-wide ("it rounds a float that has already lost
      // precision"). Here the receiver is a decimal.js `Decimal`, so the rounding objection did not
      // apply — but the ban is on the SYNTAX, deliberately, because a reader cannot tell the two
      // receivers apart at a glance, and CI is red either way. MEASURED: `pnpm --filter
      // @qmulate/database run lint` → 1 error at this line before this change, 0 after.
      expect(istibdal?.amountSar.equals(new Decimal('4200000.00'))).toBe(true);
      // The corpus NOTE column stays null: `transaction_capital_other_requires_note` demands one
      // only for `capitalSource = OTHER`, and ISTIBDAL_PROCEEDS is a named source.
      expect(istibdal?.capitalSourceNoteAr).toBeNull();
    });

    it('carries the authorized representative’s OWN eligibility columns (BR-109)', async () => {
      const prisma = await basePrisma();
      const deeds = await prisma.trusteeshipDeed.findMany({ orderBy: { id: 'asc' } });

      // The columns exist; the fixture asserts NOTHING through them. Four nulls on a deed that names
      // a representative is the ELIGIBILITY_NOT_ASSESSED state the resolver must be able to refuse —
      // a biconditional CHECK would have made that state unrepresentable and forced the migration to
      // invent four claims about a person's religion, capacity, removal history and residency.
      for (const deed of deeds) {
        expect(deed.repIslam).toBeNull();
        expect(deed.repKsaResident).toBeNull();
        expect(deed.eligibilityVerifiedAt).toBeNull();
        expect(deed.eligibilityVerifiedBy).toBeNull();
      }
      // And two of the four deeds DO name a representative, so the columns have a live subject.
      expect(deeds.filter((deed) => deed.authorizedRepName !== null)).toHaveLength(2);
    });
  });

  describe('E3 · the classification-gate contrast (BR-104, §17 E3 exit)', () => {
    it('seeds LARGE_MEDIUM audited-statement AND bylaw obligations, on a MEDIUM endowment', async () => {
      const prisma = await basePrisma();

      // ⚠ THE ASSERTION WITHOUT WHICH THE LAYER ABOVE IS VACUOUS. `classification.applicableObligations`
      // intersects the GLOBAL catalogue with an endowment's recorded classification — so if the
      // catalogue holds no LARGE_MEDIUM obligation, the api-level contrast test passes over an empty
      // set and proves nothing. This is the "the set is non-empty" half.
      const gated = await prisma.complianceObligation.findMany({
        where: { gate: 'LARGE_MEDIUM' },
        orderBy: { code: 'asc' },
      });
      expect(gated.length).toBeGreaterThanOrEqual(2);
      expect(gated.some((row) => /SOCPA|audited/i.test(row.titleEn))).toBe(true);
      expect(gated.some((row) => /bylaw/i.test(row.titleEn))).toBe(true);
      // Arabic is authoritative (NFR-01) — a derived obligation title is real Arabic, not a
      // transliteration.
      for (const row of gated) expect(row.titleAr).toMatch(/[؀-ۿ]/);

      // The CONTRAST's two subjects, so the comparison is between two real classifications.
      const waqfs = new Map(
        (await prisma.waqf.findMany()).map((row) => [row.id, row.classification] as const),
      );
      expect(waqfs.get('waqf-001')).toBe('MEDIUM');
      expect(waqfs.get('waqf-002')).toBe('SMALL');

      // waqf-001 now has LARGE_MEDIUM-gated TASK INSTANCES of its own, which it did not before S4.
      const tasks = await prisma.complianceTask.findMany({
        where: { waqfId: 'waqf-001', obligation: { gate: 'LARGE_MEDIUM' } },
        include: { obligation: true },
      });
      expect(tasks).toHaveLength(2);
      // ⚠ The 200M/50M bands that decide MEDIUM live in `Setting` and are unverified against primary
      // law; this test asserts the GATING, never the threshold.
    });

    it('leaves the reclassification history empty but ENFORCED', async () => {
      const prisma = await basePrisma();

      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ⚠ SCOPED TO THE SEED'S OWN ACTOR — V-E3-04. THIS USED TO BE A GLOBAL `.count()`.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // The claim is about the SEED: it writes no reclassification event. A global count said
      // something else — that the TABLE is empty — and that is not the seed's property to have.
      // `reclassification_event` refuses DELETE, UPDATE and TRUNCATE (migrations 6 and 12) and
      // `db:seed` never clears it, while `packages/api`'s AC-E3-05 legitimately appends two rows to
      // prove BR-104's history works. Turbo runs this suite first, so on a FRESH database the global
      // count was 0 and green; on the SECOND run against the SAME database it was 2 and red, and
      // CI's throwaway database structurally could not see it.
      //
      // MEASURED, on one local database:
      //   run 1, before the api suite → 1 passed
      //   run 2, after  the api suite → AssertionError: expected 2 to be +0
      //
      // Fixed by asking the right question, NOT by relaxing the guard (the append-only triggers are
      // G-1 territory and are asserted by name below) and NOT by having the api suite avoid seeded
      // rows — its subject IS a seeded endowment, and a test-created one would have left an
      // undeletable waqf plus undeletable events behind, breaking the absolute row counts above.
      expect(
        await prisma.reclassificationEvent.count({ where: { createdBy: SEED_ACTOR_ID } }),
        'the seed itself must write no reclassification event',
      ).toBe(0);

      // ⚠ AND THE SEED'S SILENCE IS NOT THE WHOLE CLAIM. Anything in this table that neither the
      // seed nor a test suite wrote is a row nobody can account for — and it can never be removed.
      // The suites are named by their id prefixes rather than excluded wholesale, so a row written
      // by an unknown actor still fails.
      // `reclass-%-9%` is the id grammar the sibling suites construct rows under (e.g.
      // `corpus-retention`'s `reclass-retention-9001`, which is inserted with raw SQL and therefore
      // carries no `createdBy` at all); those rows are removed by their own cleanup and are
      // accounted for here so a mid-run interruption reads as their problem, not as this one's.
      const unaccounted = await prisma.$queryRawUnsafe<{ id: string; createdBy: string | null }[]>(
        `SELECT "id", "createdBy" FROM "reclassification_event"
          WHERE "id" NOT LIKE 'reclass-%'
            AND ("createdBy" IS NULL OR "createdBy" NOT LIKE 'user-test-%')`,
      );
      expect(
        unaccounted.map((row) => `${row.id} (createdBy=${String(row.createdBy)})`),
        'reclassification_event holds rows written by neither the seed nor a test suite',
      ).toEqual([]);

      // ⚠ CORRECTED (S4 orchestrator): the first version of this assertion listed only the THREE
      // triggers migration 12 creates and said "the 25-trigger census had none on this table". That
      // was FALSE and the enumeration caught it — `reclassification_event_no_delete` has guarded
      // DELETE since **migration 6**, installed by S2's per-table retention loop with the hint
      // "record a FURTHER reclassification event instead", and it is `ENABLE ALWAYS` too. So what
      // migration 12 actually adds is the OTHER half of the append-only claim (UPDATE), TRUNCATE,
      // and the fabricated-transition guard. DELETE is now covered twice, deliberately: migration
      // 6's trigger carries the retention HINT a Nazir reads, migration 12's carries the
      // append-only one, and neither is load-bearing alone.
      //
      // The list is exhaustive ON PURPOSE — an unexpected FOURTH trigger is exactly what this test
      // is for, and it is how the false comment above was found. Asserted by NAME here, and by
      // refusal in `shart-immutability.integration.test.ts`.
      const triggers = await prisma.$queryRawUnsafe<{ tgname: string; tgenabled: string }[]>(
        `SELECT t.tgname, t.tgenabled FROM pg_trigger t
           JOIN pg_class c ON c.oid = t.tgrelid
          WHERE c.relname = 'reclassification_event' AND NOT t.tgisinternal
          ORDER BY t.tgname`,
      );
      expect(triggers.map((row) => row.tgname)).toEqual([
        'reclassification_event_from_matches_current',
        'reclassification_event_no_delete', // migration 6 (S2), NOT migration 12
        'reclassification_event_no_truncate', // migration 6 (S2) as well
        'reclassification_event_no_update', // migration 12's ONLY addition here: the EDIT half
      ]);
      // `ENABLE ALWAYS`, or one `SET session_replication_role = 'replica'` skips all three.
      for (const trigger of triggers) expect(trigger.tgenabled).toBe('A');
    });
  });

  it('freezes a Hijri snapshot beside every legally-significant date', async () => {
    const prisma = await basePrisma();
    const waqf = await prisma.waqf.findUniqueOrThrow({ where: { id: 'waqf-001' } });
    const asset = await prisma.asset.findUniqueOrThrow({ where: { id: 'asset-001' } });
    const waqf4 = await prisma.waqf.findUniqueOrThrow({ where: { id: 'waqf-004' } });

    // Frozen at write time from a fixed Gregorian value, so a future ICU update can never shift
    // the Hijri date on a record that has already been filed.
    expect(waqf.registrationDate.toISOString().slice(0, 10)).toBe('1980-03-11');
    expect(waqf.registrationDateHijri).toBe('1400-04-23');
    expect(asset.acquiredDateHijri).toBe('1398-05-23');
    expect(waqf4.registrationDateHijri).toBe('1426-05-23');
    expect(waqf.shartAlWaqifSetAtHijri).toBe(waqf.registrationDateHijri);
  });

  it('seeds the three negative-test identities the access matrix needs', async () => {
    const prisma = await basePrisma();
    const users = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    expect(users.map((row) => row.id)).toEqual([
      'user-accountant-001',
      // PO-1, S2 round 4 — the one seeded holder of `admin:access_matrix:write`. Its own assertions
      // are in the dedicated PO-1 block below; it is listed here so a seat that silently disappeared
      // fails this test too.
      'user-admin-001',
      'user-approver-001',
      // ⊕ S11 item 2c — the read-only `/financials` E2E seat (AUDITOR, two verbs of seventeen).
      'user-auditor-001',
      'user-beneficiary-ben-001',
      // S4/E3 close-out, owner decision D-E — the CASE_MANAGER seat with deed READ. Before it,
      // V-E3-L1: not one seeded seat could reach the deed or reserved-matter screens, so E3's own
      // exit clause was unreachable by every user that exists.
      'user-case-manager-001',
      // ⊕ S11-2 — the seated WRITE E2E seat (CASE_MANAGER on waqf-004 alone), the second enrolled seat
      // the harness needed. Listed so a seat that silently disappeared or gained scope fails here.
      'user-compliance-001',
      // S10/T2 — the coverage control's own principal: zero grants, zero credential. Listed so a
      // control identity that silently disappeared (or silently GAINED a grant elsewhere) fails
      // the shape test too.
      'user-control-sweep-coverage',
      'user-family-board',
      'user-nazir-001',
      // ⊕ S12-2 — the BR-1102 chain E2E seat (COMPLIANCE_OFFICER on waqf-004 alone). Listed so a seat
      // that silently disappeared or gained scope fails here.
      'user-reserved-clerk-001',
      'user-seed-admin',
      // S10/T2 — the declared service seat (SYSTEM actor, D1). Its per-endowment grants are the
      // WaqfAccessGrant delta above; its LACK of a credential account is asserted in
      // apps/worker's integration suite and by the unaudited-writes count staying at 9.
      'user-service-deadline-sweeper',
      'user-unscoped',
    ]);
    for (const user of users) expect(user.email.endsWith('@example.test')).toBe(true);

    // Every seeded HUMAN operator gets exactly one better-auth credential account — and the two
    // S10/T2 service principals get NONE, by construction, and that absence is ASSERTED, not
    // implied by a count.
    //
    // The human half replaced an earlier "nobody has a password" assertion, which described a
    // state in which E0's exit criterion was unreachable: better-auth refuses sign-UP for an
    // existing email AND refuses sign-IN without a credential row, so a bare `user` row locks
    // the seeded admin out permanently. Verified by driving the real endpoints, not by
    // inspection. The non-human half is the D1 design: a seat with no `account` row cannot ever
    // satisfy rung 1, so "non-human" is an identity-plane fact — §2b of the seed skips
    // `serviceSeat` users, and this is where that skip is measured.
    const SERVICE_PRINCIPALS = ['user-control-sweep-coverage', 'user-service-deadline-sweeper'];
    const accounts = await prisma.account.findMany({ orderBy: { id: 'asc' } });
    expect(accounts).toHaveLength(users.length - SERVICE_PRINCIPALS.length);
    for (const principal of SERVICE_PRINCIPALS) {
      expect(
        accounts.some((account) => account.userId === principal),
        `${principal} has a credential account — a service principal must be un-sign-in-able`,
      ).toBe(false);
    }
    for (const account of accounts) {
      expect(account.providerId).toBe('credential');
      expect(account.userId).toBe(account.accountId);
      // A HASH, never the plaintext — produced by better-auth's own hasher so the sign-in path
      // can verify it. (The fixture password is a published constant; the stored value is not it.)
      expect(account.password).toBeTruthy();
      expect(account.password).not.toContain('fixture-only-not-a-secret');
      expect((account.password as string).length).toBeGreaterThan(32);
    }
    // `Account` is in UNAUDITED_MODELS on purpose: a hashed credential must never enter a
    // ten-year-retention audit table (§12). Assert that, so the exclusion stays deliberate.
    //
    // ⚠ SCOPED TO MUTATION EVENTS IN S2 ROUND 2, and the narrowing is the point rather than a
    // workaround. `UNAUDITED_MODELS` means "no before/after image of this row's CONTENTS", which is
    // what protects the password hash. It does not mean "this table is invisible to the trail": a
    // REFUSED write to `Account` is now recorded as `ACCESS_DENIED` (NFR-04 requires denied attempts
    // on sensitive resources to be logged, and a rejected attempt on the credential store is about
    // as sensitive as they come). Such an event carries `entityType: 'Account'` and NO row image at
    // all — `before`/`after` are null, because nothing was read and nothing was written. Measured:
    // the beneficiary write sweep produces 6 of them, one per operation. So the unqualified count
    // would now fail for a reason that is the opposite of the risk this line guards against, while
    // the `category: 'MUTATION'` count still proves exactly what §12 needs.
    expect(
      await prisma.auditEvent.count({ where: { entityType: 'Account', category: 'MUTATION' } }),
    ).toBe(0);
    // Belt and braces on the actual §12 requirement: whatever the action, no Account event may
    // carry a row image, so a hash can never be in one.
    const accountEvents = await prisma.auditEvent.findMany({ where: { entityType: 'Account' } });
    for (const event of accountEvents) {
      expect(event.before, 'an Account audit event carries a row image').toBeNull();
      expect(event.after, 'an Account audit event carries a row image').toBeNull();
    }

    // V-5's subject. A scoped procedure must deny them, and the fail-closed force-filter must
    // return nothing rather than everything.
    expect(await prisma.waqfAccessGrant.count({ where: { userId: 'user-unscoped' } })).toBe(0);
    // SYSTEM_ADMIN authority is platform-level, so it deliberately has no per-endowment grant.
    expect(await prisma.waqfAccessGrant.count({ where: { userId: 'user-seed-admin' } })).toBe(0);

    const beneficiaryGrant = await prisma.waqfAccessGrant.findFirstOrThrow({
      where: { userId: 'user-beneficiary-ben-001' },
    });
    expect(beneficiaryGrant.role).toBe('BENEFICIARY');
    expect(beneficiaryGrant.waqfId).toBe('waqf-001');
    expect(beneficiaryGrant.beneficiarySelfId).toBe('ben-001');
  });

  // ── PO-1: THE ONE SEEDED ACCESS-MATRIX ADMINISTRATOR ───────────────────────────────────────
  //
  // Product-owner decision PO-1 (2026-07-28). Before it, the census was ZERO: not one of the
  // seventeen seeded grants carried `admin:access_matrix:write`, so the USER branch of
  // `qmulate_grant_admission()` was unreachable from fixture data and every test that needed it
  // bootstrapped its own admin seat through the SYSTEM branch first.
  //
  // What these assertions are FOR: the seat is the single most impersonation-worthy row in the
  // database (a raw-SQL caller who forges a marker naming it is admitted by the USER branch), so its
  // shape is pinned in all four directions — who holds it, on which endowment, which verbs, and
  // which verbs it must never acquire.

  describe('PO-1 · the seeded admin seat', () => {
    it('exists, holds admin:access_matrix:write, and holds it on ONE endowment only', async () => {
      const prisma = await basePrisma();

      const grants = await prisma.waqfAccessGrant.findMany({
        where: { userId: 'user-admin-001' },
        orderBy: { waqfId: 'asc' },
      });
      expect(
        grants,
        'the fixture ships no admin seat again — the USER branch of grant admission is then ' +
          'unreachable from seeded data and PO-1 has been undone',
      ).toHaveLength(1);

      const grant = grants[0];
      expect(grant?.waqfId).toBe('waqf-001');
      expect(grant?.role).toBe('SYSTEM_ADMIN');
      expect(grant?.permissions).toContain('admin:access_matrix:write');
      // ACTIVE, not merely present: `qmulate_actor_holds_permission` requires all four.
      expect(grant?.revokedAt).toBeNull();
      expect(grant?.deletedAt).toBeNull();
      expect(grant?.validFrom.getTime()).toBeLessThanOrEqual(Date.now());
      expect(grant?.validUntil).toBeNull();
      // Issued BY somebody else. `waqf_access_grant_no_self_issue` refuses a self-issued row, and
      // migration 5 §2b binds this column to the identity the admitting audit_event names — so this
      // value is also the proof that the seed actor is who provisioned it.
      expect(grant?.grantedByUserId).toBe('user-seed-admin');
      expect(grant?.grantedByUserId).not.toBe(grant?.userId);
    });

    it('is the ONLY established holder, and holds nothing on waqf-002/003/004', async () => {
      const prisma = await basePrisma();

      // The census PO-1 was decided on, now with a floor AND a ceiling. A second admin seat is a
      // second impersonation target and a governance change, not a convenience.
      const holders = await prisma.waqfAccessGrant.findMany({
        where: {
          permissions: { has: 'admin:access_matrix:write' },
          revokedAt: null,
          deletedAt: null,
        },
        select: { userId: true, waqfId: true },
        orderBy: [{ waqfId: 'asc' }, { userId: 'asc' }],
      });
      expect(holders).toEqual([{ userId: 'user-admin-001', waqfId: 'waqf-001' }]);
    });

    it('can never approve or sign — config authority is not governance authority (§10 §2.1)', async () => {
      const prisma = await basePrisma();
      const grant = await prisma.waqfAccessGrant.findFirstOrThrow({
        where: { userId: 'user-admin-001' },
      });

      // Asserted over the WHOLE permission list rather than by naming two strings, so a verb added
      // later cannot slip past. The database agrees independently:
      // `waqf_access_grant_permission_guard` refuses any approve/sign verb on a non-NAZIR role.
      for (const permission of grant.permissions) {
        const verb = permission.split(':')[2];
        expect(
          verb,
          `the admin seat carries "${permission}". §10 §2.1: admin configures WHO may approve and ` +
            `never approves itself; BR-105/BR-1103 leave the Nazir the sole approval authority.`,
        ).not.toBe('approve');
        expect(verb).not.toBe('sign');
      }
      expect(grant.amlCompartment).toBe(false);
      expect(grant.canViewAmlRestricted).toBe(false);
      expect(grant.beneficiarySelfId).toBeNull();
    });

    it('has a fixture-only credential, on the reserved domain, like every other seeded operator', async () => {
      const prisma = await basePrisma();
      const user = await prisma.user.findUniqueOrThrow({ where: { id: 'user-admin-001' } });
      expect(user.email).toBe('matrix-admin@example.test');
      // NOT `admin@example.test` — that is `user-seed-admin`, the E0 sign-in subject, which
      // deliberately holds NO per-endowment grant.
      expect(user.email).not.toBe(SEED_ADMIN_EMAIL);
      expect(user.isActive).toBe(true);
      expect(user.twoFactorEnabled).toBe(false);

      const account = await prisma.account.findFirstOrThrow({
        where: { userId: 'user-admin-001' },
      });
      expect(account.providerId).toBe('credential');
      expect(account.password).toBeTruthy();
      expect(account.password).not.toContain('fixture-only-not-a-secret');
    });

    it('did NOT give the seed actor a grant — the bootstrap deadlock, recorded in data', async () => {
      const prisma = await basePrisma();
      // `user-seed-admin` is the actor EVERY seed write is attributed to, so it is the actor the
      // admission guard's USER branch would have to satisfy if the SYSTEM branch were removed. It
      // holds no grant, and it CANNOT be given one: `grantedByUserId` is bound to the marker's actor
      // (§2b) and `waqf_access_grant_no_self_issue` forbids `grantedByUserId = userId`, so the only
      // row that would satisfy the USER branch is unrepresentable. That is why migration 7 closes the
      // CIRCULARITY instead of removing the branch — see its header for the executed proof.
      expect(await prisma.waqfAccessGrant.count({ where: { userId: 'user-seed-admin' } })).toBe(0);
    });
  });

  // ── MP-37: HOW MANY NAZIR SEATS THE FIXTURE SHIPS ──────────────────────────────────────────
  //
  // ⚠ THE HEADING USED TO SAY "HOW MANY APPROVAL AUTHORITIES", which is the person-level reading
  // PO-2 corrected. There is ONE approval authority — the Nazir ROLE — and the fixture seats two
  // PEOPLE in it on purpose. See the note on EXPECTED_ACTIVE_NAZIR_GRANTS_PER_WAQF.

  it('MP-37 · ships EXACTLY two active NAZIR seats per endowment (a fixture shape, not a limit)', async () => {
    const prisma = await basePrisma();

    // FIXTURE-ONLY, ASSERTED. If this ever ran against a production-classified database the count
    // would be a statement about a real deed, and this test has no business making one.
    expect(
      process.env.DATA_CLASSIFICATION,
      'this assertion is a claim about the FIXTURE and must never be evaluated against real data (NFR-03)',
    ).toBe('fixture-only');

    const now = new Date();
    const activeNazirGrants = await prisma.waqfAccessGrant.findMany({
      where: {
        role: 'NAZIR',
        deletedAt: null,
        revokedAt: null,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gte: now } }],
      },
      select: { userId: true, waqfId: true },
      orderBy: [{ waqfId: 'asc' }, { userId: 'asc' }],
    });

    const byWaqf = new Map<string, string[]>();
    for (const grant of activeNazirGrants) {
      byWaqf.set(grant.waqfId, [...(byWaqf.get(grant.waqfId) ?? []), grant.userId]);
    }

    // ⚠ waqf-005 IS IN THIS LIST, AND ITS ABSENCE WOULD HAVE BEEN THE INTERESTING FAILURE. Both
    // seeded NAZIR seats carry `onlyWaqfId: null`, so a new endowment must materialise a seat for
    // each of them — an endowment with no live Nazir is an endowment nobody can act on.
    expect([...byWaqf.keys()].sort()).toEqual([
      'waqf-001',
      'waqf-002',
      'waqf-003',
      'waqf-004',
      'waqf-005',
      'waqf-007',
    ]);
    for (const [waqfId, holders] of byWaqf) {
      expect(
        holders,
        `waqf ${waqfId} has ${String(holders.length)} active NAZIR seats (${holders.join(', ')}), ` +
          `not ${String(EXPECTED_ACTIVE_NAZIR_GRANTS_PER_WAQF)}. This is a FIXTURE-SHAPE assertion, ` +
          `not a governance limit: PO-2 settled that the approval claim is ROLE-level, so several ` +
          `people may hold the Nazir role and a third holder is NOT illegitimate. What is not ` +
          `allowed is a seat appearing in the access matrix without a decision behind it — so add it ` +
          `to SEED_USERS with a note and update this number, rather than relaxing the assertion.`,
      ).toHaveLength(EXPECTED_ACTIVE_NAZIR_GRANTS_PER_WAQF);
      expect(holders).toEqual(['user-approver-001', 'user-nazir-001']);
    }
  });

  it('seeds the historical run’s maker-checker record, with maker ≠ checker', async () => {
    const prisma = await basePrisma();
    const distribution = await prisma.distribution.findUniqueOrThrow({
      where: { id: 'dist-001' },
    });

    // The CHECK makes this impossible to be null while the run is EXECUTED. Assert the LINK, not
    // just the constraint: a run pointing at an approval that does not exist would satisfy the
    // CHECK (there is deliberately no FK) and prove nothing.
    expect(distribution.status).toBe('EXECUTED');
    expect(distribution.approvalRequestId).toBe('appr-dist-001');

    const approval = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: 'appr-dist-001' },
    });
    expect(approval.type).toBe('DISTRIBUTION_RUN');
    expect(approval.status).toBe('EXECUTED');
    expect(approval.waqfId).toBe(distribution.waqfId);
    expect(approval.subjectId).toBe('dist-001');
    // THE INVARIANT THIS SPRINT EXISTS FOR, in the fixture data itself.
    expect(approval.makerId).toBe('user-accountant-001');
    expect(approval.checkerId).toBe('user-approver-001');
    expect(approval.checkerId).not.toBe(approval.makerId);
    // The approver signed a specific artifact, and the fingerprint is the package's one hash.
    expect(approval.payloadHash).toMatch(/^[0-9a-f]{64}$/);
    expect(approval.checkerTotpAssertedAt).not.toBeNull();
  });

  // ── EXIT-2: THE SEEDED BUSINESS-DAY CALENDAR ───────────────────────────────────────────────
  //
  // §17's exit clause 2 reads "`addBusinessDays` crosses a weekend + a SEEDED Hijri holiday
  // correctly". `packages/domain` proves the arithmetic against synthetic calendars; these
  // assertions prove the OTHER half — that real `HolidayCalendar` ROWS exist, that they load into
  // `buildHolidayCalendar()` without adjustment, and that the answers over the real rows are right.
  //
  // The word "seeded" is load-bearing precisely because the table was empty: every business-day
  // answer the system could give was computed over NO holidays, which is not a missing feature but a
  // confidently wrong statutory due date.

  describe('EXIT-2 · the seeded KSA business-day calendar', () => {
    /** The seeded rows, loaded from the database and mapped exactly as a caller would map them. */
    async function loadCalendar() {
      const prisma = await basePrisma();
      const rows = await prisma.holidayCalendar.findMany({ orderBy: { date: 'asc' } });
      const workweekSetting = await prisma.setting.findFirstOrThrow({
        where: { key: 'calendar.workweek', waqfId: null },
      });
      const workweek = settingValueSchema.parse(workweekSetting.value).v as string[];

      return {
        rows,
        workweek,
        calendar: buildHolidayCalendar({
          // FROM DATA, both of them: the workweek out of `Setting calendar.workweek`, the holidays
          // out of `holiday_calendar`. Neither is a constant in the engine or in this test.
          workweek: workweek as never,
          coverage: SEED_HOLIDAY_COVERAGE,
          observed: rows
            .filter((row) => !row.isWorkingDay)
            .map((row) => ({
              date: row.date.toISOString().slice(0, 10),
              nameAr: row.nameAr,
              nameEn: row.nameEn ?? '',
            })),
          workingDayOverrides: rows
            .filter((row) => row.isWorkingDay)
            .map((row) => ({ date: row.date.toISOString().slice(0, 10), isWorkingDay: true })),
        }),
      };
    }

    it('has rows at all — the regression this whole clause is about', async () => {
      const prisma = await basePrisma();
      const count = await prisma.holidayCalendar.count();
      expect(
        count,
        'holiday_calendar is empty again. Every business-day computation is then performed over NO ' +
          'holidays, which yields a confidently wrong statutory deadline rather than an error.',
      ).toBe(SEED_HOLIDAYS.length);
      expect(count).toBeGreaterThanOrEqual(30);
    });

    it('⚠ marks EVERY row unverified, in BOTH languages (Binding rule 3)', async () => {
      const prisma = await basePrisma();
      const rows = await prisma.holidayCalendar.findMany({ orderBy: { date: 'asc' } });

      for (const row of rows) {
        // `HolidayCalendar` has no `unverified` column, so the caveat travels in the NAMES —
        // otherwise a holiday date would reach a report or an export with no marker at all, and the
        // authoritative source for the KSA holiday set is still an open question (UD-2).
        expect(row.nameEn, `${row.id} carries no English unverified marker`).toContain(
          UNVERIFIED_NOTE,
        );
        expect(row.nameAr, `${row.id} carries no Arabic unverified marker`).toContain(
          UNVERIFIED_NOTE_AR,
        );
        // Arabic is authoritative (NFR-01), so the Arabic name must be real content, not a
        // transliteration of the English one.
        expect(row.nameAr).toMatch(/[؀-ۿ]/);
      }
    });

    it('freezes a Hijri twin on every row, from the ONE implementation', async () => {
      const prisma = await basePrisma();
      const rows = await prisma.holidayCalendar.findMany({ orderBy: { date: 'asc' } });

      for (const row of rows) {
        const civil = row.date.toISOString().slice(0, 10);
        expect(row.dateHijri, `${row.id}'s frozen Hijri twin disagrees with @qmulate/domain`).toBe(
          domainToHijri(civil),
        );
        expect(row.dateHijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
    });

    it('skips a Fri/Sat weekend rather than counting it', async () => {
      const { calendar, workweek } = await loadCalendar();
      expect(workweek).toEqual(['SUN', 'MON', 'TUE', 'WED', 'THU']);

      // Thu 2026-03-12 + 1 business day. Fri 13 and Sat 14 are the weekend, so the answer is Sun 15.
      expect(isBusinessDay('2026-03-12', calendar)).toBe(true);
      expect(isBusinessDay('2026-03-13', calendar)).toBe(false);
      expect(isBusinessDay('2026-03-14', calendar)).toBe(false);
      expect(addBusinessDays('2026-03-12', 1, calendar)).toBe('2026-03-15');
      expect(countBusinessDays('2026-03-12', '2026-03-15', calendar)).toBe(1);
    });

    it('skips a SEEDED Hijri-moving holiday rather than counting it', async () => {
      const { calendar } = await loadCalendar();

      // Eid al-Adha 1448 falls Mon 2027-05-17 … Wed 2027-05-19 — three consecutive WEEKDAYS, so this
      // case isolates the holiday from the weekend entirely.
      for (const day of ['2027-05-17', '2027-05-18', '2027-05-19']) {
        expect(isBusinessDay(day, calendar), `${day} should be a seeded holiday`).toBe(false);
      }
      expect(isBusinessDay('2027-05-20', calendar)).toBe(true);
      expect(addBusinessDays('2027-05-17', 1, calendar)).toBe('2027-05-20');

      // And the holiday is Hijri-ANCHORED, not Gregorian: the same Hijri day resolves to a different
      // Gregorian date each year, which is the whole reason the calendar cannot be a fixed list.
      const eidDays = SEED_HOLIDAYS.filter((holiday) => holiday.dateHijri.endsWith('-12-09'));
      expect(eidDays.map((holiday) => holiday.date.toISOString().slice(0, 10))).toEqual([
        '2026-05-26',
        '2027-05-15',
        '2028-05-04',
      ]);
    });

    it('skips a weekend AND a seeded Hijri holiday in one span', async () => {
      const { calendar } = await loadCalendar();

      // Thu 2026-03-19 + 1 business day crosses Fri 20 / Sat 21 (weekend AND Eid al-Fitr days 1–2)
      // and Sun 22 / Mon 23 (Eid days 3–4), landing on Tue 2026-03-24.
      expect(addBusinessDays('2026-03-19', 1, calendar)).toBe('2026-03-24');
      expect(countBusinessDays('2026-03-19', '2026-03-24', calendar)).toBe(1);

      // Five calendar days skipped for one business day — the arithmetic that a missing holiday set
      // gets silently wrong by four days.
      expect(addBusinessDays('2026-03-19', 2, calendar)).toBe('2026-03-25');
    });

    it('raises CALENDAR_UNAVAILABLE for an EMPTY holiday set rather than assuming every day works', async () => {
      // The exact state the database was in before this sprint. It must be an ERROR, not a silently
      // permissive calendar: a due date computed over no holidays looks perfectly plausible.
      expect(() =>
        buildHolidayCalendar({
          workweek: ['SUN', 'MON', 'TUE', 'WED', 'THU'] as never,
          coverage: SEED_HOLIDAY_COVERAGE,
          observed: [],
        }),
      ).toThrow(/CALENDAR_UNAVAILABLE|holiday/i);
    });
  });

  // ── AUDITED (E1-4) ─────────────────────────────────────────────────────────────────────────

  it('E1-4 · every seed write left an audit event', async () => {
    const total = await countSeedAuditEvents();
    expect(total).toBeGreaterThanOrEqual(WRITES_PER_SEED_RUN);
    // One event per write, so the total is always a whole number of runs. A partial multiple would
    // mean some writes escaped the audit spine. (The per-run figure grew in E2 with the seeded
    // ApprovalRequest and the 33 HolidayCalendar rows — neither is in UNAUDITED_MODELS, deliberately.)
    expect(total % WRITES_PER_SEED_RUN).toBe(0);
  });

  it('audits every entity type the seed touches, none excepted', async () => {
    const prisma = await basePrisma();
    const grouped = await prisma.auditEvent.groupBy({
      by: ['entityType'],
      where: { actorId: SEED_ACTOR_ID },
      _count: { _all: true },
    });
    const seen = [...new Set(grouped.map((row) => row.entityType))];
    for (const model of Object.keys(EXPECTED_COUNTS)) {
      expect(seen, `no audit_event was written for ${model}`).toContain(model);
    }
  });

  it('attributes seed events to the seed actor and stamps the run context', async () => {
    const prisma = await basePrisma();
    const event = await prisma.auditEvent.findFirstOrThrow({
      where: { actorId: SEED_ACTOR_ID, entityType: 'Waqf' },
      orderBy: { id: 'asc' },
    });
    expect(event.actorType).toBe('SYSTEM');
    const context = event.context as Record<string, unknown>;
    expect(context.requestId).toBe('seed');
    expect(context.bypass).toBe('system-job');
    expect(event.waqfId).toMatch(/^waqf-00[1-4]$/);
  });

  it('A8 · no plaintext UBO identifier or IBAN reaches the audit trail', async () => {
    const prisma = await basePrisma();
    const leaks = await prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n
         FROM "audit_event"
        WHERE "before"::text LIKE '%FAKE-ID-0001%' OR "after"::text LIKE '%FAKE-ID-0001%'
           OR "before"::text LIKE '%FAKE-ID-0004%' OR "after"::text LIKE '%FAKE-ID-0004%'
           OR "before"::text LIKE '%FAKE-IBAN-%'   OR "after"::text LIKE '%FAKE-IBAN-%'`,
    );
    expect(leaks[0]?.n).toBe(0);

    // What IS recorded is a constant placeholder — not ciphertext either, because a ciphertext in
    // an append-only 10-year table would pin a rotated key alive forever.
    const beneficiaryEvent = await prisma.auditEvent.findFirstOrThrow({
      where: { entityType: 'Beneficiary', entityId: 'ben-001' },
      orderBy: { id: 'asc' },
    });
    const after = beneficiaryEvent.after as Record<string, unknown>;
    expect(after.uboIdNumberEnc).toBe('[encrypted]');
    expect(after.uboBankingRefEnc).toBe('[encrypted]');
    // The deterministic digest IS recorded, which is what keeps a changed identifier visible.
    expect(typeof after.uboIdNumberHmac).toBe('string');
    expect(beneficiaryEvent.classification).toBe('SENSITIVE');
  });

  // ── ENCRYPTED AT REST ──────────────────────────────────────────────────────────────────────

  it('stores UBO identifiers and IBANs as ciphertext and returns them as plaintext', async () => {
    const { createPrismaClient, makeSystemContext } = await databaseModule();
    const { searchHash } = await import('../src/crypto.js');
    const prisma = await basePrisma();

    const raw = await prisma.$queryRawUnsafe<
      { ibanEnc: string; ibanHmac: string; accountRef: string }[]
    >(
      `SELECT "ibanEnc", "ibanHmac", "accountRef" FROM "bank_account" WHERE "id" = 'bankacct-fake-acct-w1'`,
    );
    const stored = raw[0];
    expect(stored).toBeDefined();
    expect(stored?.ibanEnc).not.toBe('FAKE-IBAN-W1');
    expect(stored?.ibanEnc).toMatch(/^v\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
    // The plaintext human label is a separate, deliberately unencrypted column.
    expect(stored?.accountRef).toBe('FAKE-ACCT-W1');
    // Equality lookup goes through the searchable digest, never the randomized ciphertext.
    expect(stored?.ibanHmac).toBe(searchHash('BankAccount.ibanEnc', 'FAKE-IBAN-W1'));

    const db = createPrismaClient(
      makeSystemContext({ actorId: 'user-test-harness', requestId: 'test-read' }),
    );
    const account = await db.bankAccount.findUniqueOrThrow({
      where: { id: 'bankacct-fake-acct-w1' },
    });
    expect(account.ibanEnc).toBe('FAKE-IBAN-W1');
    expect(account.isDedicated).toBe(true);

    const beneficiary = await db.beneficiary.findUniqueOrThrow({ where: { id: 'ben-001' } });
    expect(beneficiary.isUbo).toBe(true);
    expect(beneficiary.uboIdNumberEnc).toBe('FAKE-ID-0001');
    expect(beneficiary.uboBankingRefEnc).toBe('FAKE-IBAN-0001');
    expect(beneficiary.confidentiality).toBe('SENSITIVE_PII');
  });

  // ── HONEST: the Shart records absence rather than inventing content ────────────────────────

  it('records waqf-001’s conditions as structure, with every gap named', async () => {
    const prisma = await basePrisma();
    const waqf = await prisma.waqf.findUniqueOrThrow({ where: { id: 'waqf-001' } });
    const shart = shartAlWaqifSchema.parse(waqf.shartAlWaqif);

    expect(shart.schemaVersion).toBe(1);
    expect(shart.orderRule).toBe('ORDERED');
    expect(shart.disbursementChannel.kind).toBe('FAMILY');

    // (a) A RECORDED deed term SINCE S5/E4 (`waqf.maintenanceRule`, FIXTURE_DELTA_REQUIRED paid
    //     down): waqf-001 stipulates a fixed SAR 40,000 ṣiyāna reserve. The pin this replaces —
    //     `{ kind: 'unspecified' }`, "NO maintenance-reserve rule exists anywhere in the fixture"
    //     — described the pre-S5 fixture. The unspecified/none distinction stands and is now
    //     exercised elsewhere: waqf-004 states `none` POSITIVELY, waqf-005 stays unspecified.
    expect(shart.maintenanceReserve).toEqual({ kind: 'fixed', amountSar: '40000.00' });

    // (b) the deed's absolute tier weights are genuinely unknown — the roster's sharePercents are
    //     relative and sum to 37.5%, never 100%.
    expect(shart.tiers.map((tier) => tier.tabaqa)).toEqual([1, 2]);
    for (const tier of shart.tiers) {
      expect(tier.stipulatedWeight).toBeNull();
      expect(tier.labelAr.length).toBeGreaterThan(0);
    }

    // (d) A RECORDED deed term SINCE S5/E4: waqf-001 distributes QUARTERLY (dist-001 was already a
    //     quarterly period — the schedule and the historical record now agree). The statutory
    //     post-FYE fallback is exercised by waqf-002, whose schedule is a recorded null.
    expect(shart.disbursementSchedule).toBe('QUARTERLY');

    // The prose IS recorded — as non-authoritative narrative the engine never reads.
    expect(shart.narrativeEn).toContain('Nazarah first to the waqif for life');
    expect(shart.narrativeAr).toBeNull();
    expect(shart.sourceDocumentId).toBeNull();

    // The one succession rule the prose genuinely states, recorded in Arabic.
    expect(shart.nazarahSuccession.specified).toBe(true);
    expect(shart.nazarahSuccession.ruleAr).not.toBeNull();

    // ⚠ unverified — the deed-set ʿushr, not a statutory rate.
    expect(shart.nazirFee.basis).toBe('PERCENT_OF_REVENUE');
    expect(shart.nazirFee.ratePercent).toBe(10);

    expect(shart.completeness.status).toBe('COMPLETE');
    expect(shart.completeness.missing).toEqual([]);
    // SINCE S5/E4 the maintenance and schedule advisories are GONE for waqf-001 — the deed now
    // states both — while the tier-weights gap remains genuinely open (the roster's sharePercents
    // are relative and sum to 37.5%, never 100%).
    expect(shart.completeness.advisory).not.toContain('MAINTENANCE_RESERVE_UNSPECIFIED');
    expect(shart.completeness.advisory).toContain('TIER_WEIGHTS_NOT_STIPULATED');
    expect(shart.completeness.advisory).not.toContain(
      'DISBURSEMENT_SCHEDULE_SILENT_STATUTORY_DEFAULT',
    );
  });

  it('records waqf-003 as a خيري (CHARITABLE) channel whose split lives in the deed weights', async () => {
    // ⚠ THIS TEST WAS INVERTED IN S5/E4, and what it used to pin is kept here as the record.
    // waqf-003 was recorded `joint` from S1; its Shart derived a MIXED channel with both split
    // percentages null, `CHARITABLE_FAMILY_SPLIT` + `TIER_DEFINITIONS` in `missing`, and the test
    // above this line was titled "marks waqf-003 INCOMPLETE rather than inferring the founder's
    // charitable/family split" — the right behaviour FOR THAT RECORD, measured and shipped. A
    // JOINT waqf is a shape the engine refuses (ADR-0009 R5), so FIXTURE_DELTA_REQUIRED re-typed
    // the endowment PUBLIC_CHARITABLE with three jihas at the deed's fixed 40/30/30, carried as
    // each jiha's stipulatedWeight. There is no charitable/family split to infer on a deed with
    // no family leg, so the Shart is now honestly COMPLETE — nothing was inferred; the record
    // changed. (The it.todo that stood here — whether to derive a 40/60 split from ben-006's
    // roster share — is DISSOLVED with the joint record itself, not answered.)
    const prisma = await basePrisma();
    const waqf = await prisma.waqf.findUniqueOrThrow({ where: { id: 'waqf-003' } });
    const shart = shartAlWaqifSchema.parse(waqf.shartAlWaqif);

    expect(shart.disbursementChannel.kind).toBe('CHARITABLE');
    expect(shart.disbursementChannel.familySharePercent).toBeNull();
    expect(shart.disbursementChannel.charitableSharePercent).toBeNull();
    expect(shart.completeness.status).toBe('COMPLETE');
    expect(shart.completeness.missing).toEqual([]);

    // The 40/30/30 is DATA on the three jihas, never an inference from one row.
    const jihas = await prisma.beneficiary.findMany({
      where: { waqfId: 'waqf-003' },
      orderBy: { id: 'asc' },
      select: { id: true, stipulatedWeight: true },
    });
    expect(jihas.map((row) => [row.id, Number(row.stipulatedWeight)])).toEqual([
      ['ben-006', 40],
      ['ben-306', 30],
      ['ben-307', 30],
    ]);
  });

  it('records the fixture’s own contradictions instead of repairing them', async () => {
    const { Decimal } = await databaseModule();
    const prisma = await basePrisma();

    const distribution = await prisma.distribution.findUniqueOrThrow({
      where: { id: 'dist-001' },
      include: { lineItems: { orderBy: { id: 'asc' } } },
    });

    // The waterfall is DERIVED from the fixture's own ledger — ṣiyāna first, then operating, then
    // the Nazir fee, then whatever is distributable.
    expect(distribution.grossRevenueSar.equals(new Decimal('350000.00'))).toBe(true);
    expect(distribution.reserveSar.equals(new Decimal('40000.00'))).toBe(true);
    expect(distribution.operatingSar.equals(new Decimal('0.00'))).toBe(true);
    expect(distribution.nazirFeeSar.equals(new Decimal('35000.00'))).toBe(true);
    expect(distribution.distributableSar.equals(new Decimal('275000.00'))).toBe(true);
    expect(distribution.status).toBe('EXECUTED');

    const trace = distribution.computationTrace as Record<string, unknown>;
    expect(trace.origin).toBe('fixture-historical');
    expect(trace.fixtureTotalSar).toBe('279000.00');
    expect(String(trace.note)).toMatch(/internally inconsistent/);

    // The line items are seeded VERBATIM — including the one that arguably should never have been
    // paid. Repairing it would hide the defect the record exists to expose.
    expect(distribution.lineItems.map((line) => line.beneficiaryId)).toEqual([
      'ben-001',
      'ben-002',
    ]);
    for (const line of distribution.lineItems) {
      expect(line.amountSar.equals(new Decimal('34875.00'))).toBe(true);
      expect(line.status).toBe('PAID');
    }
    const beneficiary = await prisma.beneficiary.findUniqueOrThrow({ where: { id: 'ben-002' } });
    expect(beneficiary.tabaqa).toBe(2);
  });

  it.todo(
    'SURFACED (FIQH): fixture dist-001 pays ben-002, who is ṭabaqa 2 in an ORDERED (al-aʿlā ' +
      'fa-l-aʿlā) waqf while ṭabaqa 1 is still alive. Either the fixture is wrong, or ordered ' +
      'exclusion is narrower than §08 invariant I5 states (per-branch rather than global). Not ' +
      'resolved; seeded as a historical record with the discrepancy in computationTrace.',
  );

  // ── CONFIGURABLE, NOT HARD-CODED (Binding rule 3) ──────────────────────────────────────────

  it('keeps every regulatory figure in Setting, each carrying its unverified marker', async () => {
    const prisma = await basePrisma();
    const settings = await prisma.setting.findMany({ orderBy: { id: 'asc' } });
    expect(settings).toHaveLength(ALL_SEED_SETTINGS.length);

    for (const row of settings) {
      const value = settingValueSchema.parse(row.value);
      if (value.unverified) {
        expect(value.note, `${row.key} is unverified but carries no marker`).toBe(UNVERIFIED_NOTE);
      } else {
        expect(value.note).toBeUndefined();
      }
      expect(value.source.length).toBeGreaterThan(0);
    }

    const byKey = new Map(
      settings.map((row) => [`${row.waqfId ?? 'global'}:${row.key}`, row] as const),
    );
    for (const key of [
      'classification.threshold.large.sar',
      'classification.threshold.medium.sar',
      'deadline.REGISTER_30BD.businessDays',
      'deadline.UPDATE_15BD.businessDays',
      'deadline.ISTIBDAL_10BD.businessDays',
      'deadline.DISTRIBUTE_3M_FYE.months',
      'kyc.refreshIntervalMonths',
      'retention.minimumYears',
    ]) {
      const row = byKey.get(`global:${key}`);
      expect(
        row,
        `${key} is not seeded — a threshold that is not in Setting is hard-coded somewhere`,
      ).toBeDefined();
      expect(settingValueSchema.parse(row?.value).unverified).toBe(true);
    }

    // THE TWO 10%s ARE DIFFERENT INSTRUMENTS and are seeded as separate keys precisely so no
    // future reader can collapse them into "the 10% rule": the Nazir's deed-set ʿushr on REVENUE,
    // and the Awqaf Authority's own Art. 14 fee capped at 10% of NET INCOME.
    expect(byKey.has('global:nazirFee.percentOfRevenue')).toBe(true);
    expect(byKey.has('global:authorityFee.maxPercentOfNetIncome')).toBe(true);

    // The per-waqf override exists so the global → per-waqf resolution path has real data (V-9).
    expect(byKey.has('waqf-001:nazirFee.percentOfRevenue')).toBe(true);
  });

  /**
   * EXIT-3, THE HALF THAT LIVES IN THE DATA.
   *
   * The global row and the per-waqf override must be THE SAME KEY, or one can never override the
   * other. Sprint 1 seeded `nazirFee.percentOfRevenue.default` globally and `nazirFee.percentOfRevenue`
   * per-endowment: two keys that never collide and have no fallback link, so asking for the `.default`
   * key silently ignored waqf-001's override and asking for the bare key left waqf-002/003/004 with no
   * global fallback at all. Both rows existed and both parsed, which is why nothing noticed.
   *
   * Asserted structurally — "the same key exists at both tiers" — rather than by naming the old
   * spelling, so a future rename cannot re-introduce the split under a different pair of names.
   */
  it('EXIT-3 · the fee override and its global default are the SAME Setting key', async () => {
    const prisma = await basePrisma();
    const rows = await prisma.setting.findMany({
      where: { key: { startsWith: 'nazirFee.percentOfRevenue' } },
      orderBy: { id: 'asc' },
    });

    const keys = [...new Set(rows.map((row) => row.key))];
    expect(
      keys,
      'the per-waqf override and the global default must share one key or neither can override the other',
    ).toEqual(['nazirFee.percentOfRevenue']);

    const tiers = rows.map((row) => (row.waqfId === null ? 'global' : row.waqfId)).sort();
    expect(tiers).toEqual(['global', 'waqf-001']);

    // And the legacy spelling must be GONE, not merely unused — a stale global row would make the
    // resolver's answer depend on which key the caller happened to ask for.
    expect(
      await prisma.setting.count({ where: { key: 'nazirFee.percentOfRevenue.default' } }),
    ).toBe(0);
  });

  it('does not store the fixture’s embedded statutory windows as columns', async () => {
    // The fixture carries `notificationDeadlineBusinessDays: 10` and `dueWithinBusinessDays`.
    // They deliberately resolve from `Setting` instead of becoming columns, so a corrected figure
    // is a config change rather than a migration.
    const prisma = await basePrisma();
    const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ('expropriation','compliance_task')`,
    );
    const names = columns.map((row) => row.column_name);
    expect(names).not.toContain('notificationDeadlineBusinessDays');
    expect(names).not.toContain('dueWithinBusinessDays');
  });

  // ── DETERMINISTIC / IDEMPOTENT ─────────────────────────────────────────────────────────────

  it('is idempotent: a second run converges rows and never rewrites the Shart al-Waqif', async () => {
    const prisma = await basePrisma();

    const before = {
      clients: await prisma.client.count(),
      waqfs: await prisma.waqf.count(),
      beneficiaries: await prisma.beneficiary.count(),
      transactions: await prisma.transaction.count(),
      grants: await prisma.waqfAccessGrant.count(),
      obligations: await prisma.complianceObligation.count(),
      auditEvents: await countSeedAuditEvents(),
    };
    const shartBefore = new Map(
      (await prisma.waqf.findMany({ orderBy: { id: 'asc' } })).map(
        (row) =>
          [
            row.id,
            { json: JSON.stringify(row.shartAlWaqif), version: row.shartAlWaqifVersion },
          ] as const,
      ),
    );

    const rerun = runSeed({ DATA_CLASSIFICATION: 'fixture-only', SEED_FILE: null });
    expect(rerun.status, `second seed run failed:\n${rerun.stderr}`).toBe(0);

    expect(await prisma.client.count()).toBe(before.clients);
    expect(await prisma.waqf.count()).toBe(before.waqfs);
    expect(await prisma.beneficiary.count()).toBe(before.beneficiaries);
    expect(await prisma.transaction.count()).toBe(before.transactions);
    expect(await prisma.waqfAccessGrant.count()).toBe(before.grants);
    // ⊕ S8/E7 — THE RE-SEED THAT HAD TO BE MEASURED RATHER THAN REASONED ABOUT.
    // Migration 31 refuses every UPDATE that changes an obligation template's content, and this
    // second run upserts all 46 rows straight back through that trigger. It converges because the
    // guard compares `IS DISTINCT FROM` — an upsert writing identical values changes nothing and is
    // permitted — but "it should be fine" is what the S8-Q1/Q2 outages both sounded like, and a
    // seed that could not re-run would take the reproducible audit chain with it. Note that
    // `rerun.status` above is the load-bearing half: a 42501 from the template guard would have
    // aborted the whole seed transaction before this line.
    expect(await prisma.complianceObligation.count()).toBe(before.obligations);

    // BINDING RULE 1: the Shart is absent from the upsert's update branch, and the
    // `waqf_shart_immutable` trigger would reject it even if it were not. A re-run is exactly the
    // kind of "correction" that must never be able to rewrite a founder's conditions.
    for (const row of await prisma.waqf.findMany({ orderBy: { id: 'asc' } })) {
      const original = shartBefore.get(row.id);
      expect(JSON.stringify(row.shartAlWaqif)).toBe(original?.json);
      expect(row.shartAlWaqifVersion).toBe(original?.version);
      expect(row.shartAlWaqifVersion).toBe(1);
    }

    // The trail, by contrast, GROWS — it is append-only, so a second run is a second set of
    // events, not an overwrite of the first.
    expect(await countSeedAuditEvents()).toBe(before.auditEvents + WRITES_PER_SEED_RUN);
  });

  it('reports what it did, so the counts can be eyeballed against E1-2', () => {
    const run = ensureSeeded();
    expect(run.stdout).toContain('DATA_CLASSIFICATION = fixture-only  (guardrail passed)');
    expect(run.stdout).toContain('Seeded (upsert — safe to re-run)');
    // Derived from EXPECTED_COUNTS, so the report and the row counts cannot drift apart: a step
    // added to the seed without a count here fails both this and the E1-2 assertion.
    expect(run.stdout).toMatch(new RegExp(`audited writes\\s+${String(WRITES_PER_SEED_RUN)}\\b`));
    expect(run.stdout).toContain('⚠ unverified — confirm vs');
    expect(run.stdout).toContain('Shart al-Waqif records written WRITE-ONCE');
  });

  it.todo(
    'A7 · pin the frozen final rowHash after a FRESH `prisma migrate deploy` + exactly one seed on ' +
      'an untouched database. That single assertion proves canonicalization stability and seed ' +
      'determinism together. It cannot be captured from this suite, which deliberately seeds twice ' +
      'and writes its own events. Capture it in the orchestrator’s clean-database run: ' +
      'SELECT "rowHash" FROM "audit_event" ORDER BY "id" DESC LIMIT 1; ' +
      // ⊕ S7, 2026-08-18 — MEASURED, AND IT CHANGES WHAT THIS TODO IS. This is not "uncaptured",
      // it is UNSATISFIABLE AS WRITTEN. Two seeds of the IDENTICAL fixture into two fresh clusters
      // produced different chains: rev-001's audit row hashed `397b5ec3…` then `8d7b8621…`, chain
      // heads `8ef18e98…` then `0686f62e…`, with `count(*) = 176` both times. Cause read out of the
      // stored row, not inferred: `after.createdAt` / `after.updatedAt` are wall-clock
      // (`2026-08-18T15:11:52.836Z`) and sit INSIDE the hashed payload; `context` is constant
      // (`requestId: 'seed'`) and `occurredAt` is deterministic (`SEED_EPOCH + ordinal`).
      // ⇒ A frozen literal would be red on the next run for a reason that is not a defect. The
      // property this todo actually wants is REPRODUCIBILITY, and buying it needs a decision first:
      // either the seed writes deterministic `createdAt`/`updatedAt` (they are derivable from
      // SEED_EPOCH + ordinal exactly as `occurredAt` already is), or A7 hashes a projection of
      // `after` with the row timestamps excluded — which weakens the claim, because a timestamp is
      // part of what a ≥10-year audit row asserts. Do not "fix" this by pinning a hash.
      'S7 NOTE: currently UNSATISFIABLE — the seeded chain is not reproducible across runs ' +
      '(wall-clock createdAt/updatedAt inside the hashed payload). See the comment on this todo.',
  );

  it.todo(
    'B6 · post-seed identifier scan. Every ID-shaped string column in the database should match ' +
      '^FAKE-, the fixture id grammar, or @example.test. The contract’s regex as written rejects ' +
      'the seed’s own derived ids (user-*, bankacct-*, trust-*, oblig-SEED-*, dli-*, grant-*, ' +
      'membership-*, setting-*), so it must be widened before the scan can be written as a test.',
  );
});
