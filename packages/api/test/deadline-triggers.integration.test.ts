/**
 * S9-3c — anchor AUTO-DERIVATION and the two GOV-REG-02 TRIGGERS on the wire, with coalescing.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS SUITE PROVES
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * S9-3a made the anchor the caller's stated, audited fact. This stage lets the engine READ the
 * anchor from the column `deadlines/anchors.ts` declares — and refuse by name where no usable
 * column exists. Then it wires §09's two triggers for the 15-business-day update duty
 * (`GOV-REG-02` / `UPDATE_15BD`) and the coalescing rule that binds them into ONE open obligation
 * per endowment.
 *
 * THE FIVE THINGS WORTH BREAKING, and where each is asserted:
 *
 *  1. **A routed rule refuses ON THE WIRE, with its own discriminator** — not a plausible date
 *     from a column that merely sounds right (`Waqf.registrationDate`, `Vendor.licenseExpiry`).
 *  2. **A never-recorded fact refuses rather than substituting today** (`ben-003`,
 *     `kycLastRefreshed: null`).
 *  3. **Coalescing never spawns a second clock**, and a LATER change does not loosen the date
 *     while an EARLIER one tightens it — through a supersession row, never an UPDATE.
 *  4. **Filing clears the set and the NEXT change opens a FRESH clock** — the half of §09's
 *     paragraph that cannot be demonstrated without the filing path.
 *  5. **The certificate lead moves WHEN WE NOTICE, never the anchor** — the same due date whether
 *     the sweep noticed a month early or on the day. A lead that moved the anchor would make a
 *     statutory deadline configurable.
 *
 * ⚠ THIS SUITE USES `waqf-007`, deliberately, and not `waqf-001`. Migration 40's partial unique
 * index allows ONE open `GOV-REG-02` per endowment, and `packages/database`'s
 * `material-change-structure.integration.test.ts` takes `waqf-001`'s slot for its own probes. Two
 * suites competing for one endowment's slot on one cluster would fail on whichever ran second,
 * intermittently — a self-inflicted flake, and the index working.
 *
 * ⚠ CLEANUP IS SOFT-DELETE ONLY on `deadline`, `material_change` and `compliance_task`: all three
 * are in migration 8's retention family (`material_change` joined it in migration 40), and the
 * guards refuse a hard delete even to cleanup. That is them working.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { toHijriSnapshot } from '@qmulate/domain/dates';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';
import {
  API_TEST_PREFIX,
  assertSeeded,
  cleanupApiTestRows,
  contextFor,
  hasDatabase,
  privilegedPrisma,
  provisionTestSubjects,
} from './setup.js';

const createCaller = createCallerFactory(appRouter);

const OFFICER = `${API_TEST_PREFIX}s93c-officer`;
const WAQF = 'waqf-007';
/**
 * Fixture beneficiaries, chosen against the SEEDED CALENDAR'S COVERAGE — which is itself a
 * property this suite asserts rather than tiptoes around.
 *
 * ⚠ MEASURED: the seeded `holiday_calendar` starter set covers **2026-02-22 … 2028-09-23**, and
 * `buildHolidayCalendar` refuses any business-day question outside it (`CALENDAR_UNAVAILABLE` —
 * "beyond the seeded holidays any answer would be a guess"). So `ben-001`'s `kycLastRefreshed`
 * (2026-01-15) is a legitimately-recorded fact that STILL cannot be clocked, and `ben-201`'s
 * (2026-04-01) can. Both cases get a test: the refusal is the fail-closed posture working, and it
 * would be dishonest to only pick subjects that happen to be inside coverage.
 */
const BEN_IN_COVERAGE = 'ben-201'; // waqf-005, kycLastRefreshed 2026-04-01
const BEN_OUT_OF_COVERAGE = 'ben-001'; // waqf-001, kycLastRefreshed 2026-01-15 — before coverage
const BEN_NEVER = 'ben-003'; // waqf-001, kycLastRefreshed null — never verified

/** The certificate expiry this suite provisions — a Wednesday, well inside calendar coverage. */
const CERT_EXPIRY = '2026-05-20';
const LEASE_END = '2026-06-17';
const HEARING_DATE = '2026-06-24';

function hijriOf(day: string): string {
  return String(toHijriSnapshot(new Date(`${day}T00:00:00.000Z`)));
}

async function officerCaller(requestId: string) {
  return createCaller(await contextFor({ userId: OFFICER, requestId }));
}

async function isoDayOfDeadline(id: string): Promise<string> {
  const raw = await privilegedPrisma();
  const rows = await raw.$queryRawUnsafe<{ dueDate: Date; anchorDate: Date }[]>(
    `SELECT "dueDate","anchorDate" FROM "deadline" WHERE "id" = '${id}'`,
  );
  return new Date(String(rows[0]?.dueDate)).toISOString().slice(0, 10);
}

async function openUpdateTaskCount(): Promise<number> {
  const raw = await privilegedPrisma();
  const rows = await raw.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*) AS n FROM "compliance_task"
       WHERE "waqfId" = '${WAQF}' AND "templateCode" = 'GOV-REG-02'
         AND "status" IN ('NOT_STARTED','IN_PROGRESS') AND "deletedAt" IS NULL`,
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Between-phase reset: SOFT-delete, which is all the coalescing rule needs (migration 40's partial
 * index carries `deletedAt IS NULL`, so a soft-retired task frees the endowment's slot).
 */
async function resetEndowmentState(): Promise<void> {
  const raw = await privilegedPrisma();
  // Soft-delete only, and in dependency order that keeps the CHECKs satisfied at every step.
  await raw.$executeRawUnsafe(
    `UPDATE "deadline" SET "deletedAt" = now()
       WHERE "waqfId" = '${WAQF}' AND "deletedAt" IS NULL`,
  );
  await raw.$executeRawUnsafe(
    `UPDATE "material_change" SET "deletedAt" = now()
       WHERE "waqfId" = '${WAQF}' AND "deletedAt" IS NULL`,
  );
  await raw.$executeRawUnsafe(
    `UPDATE "compliance_task" SET "deletedAt" = now()
       WHERE "waqfId" = '${WAQF}' AND "templateCode" = 'GOV-REG-02' AND "deletedAt" IS NULL`,
  );
}

/**
 * FINAL cleanup: a HARD delete of this suite's own rows, through a bounded guard suspension.
 *
 * ⚠ MEASURED ON THE COUNTED INTEGRATION PASS, and the reason is specific rather than tidiness.
 * `packages/database`'s `seed.integration.test.ts` pins `ComplianceTask: 10` and
 * `obligation-library-seed.integration.test.ts` pins `complianceTask.count() === 10` — RAW counts
 * that include soft-deleted rows. This suite raises real `GOV-REG-02` duties on a FIXTURE endowment
 * (`waqf-007`), so soft-deleting them would move another package's pinned count and make the whole
 * two-pass block order-dependent.
 *
 * ⚠ WHY A FIXTURE ENDOWMENT AT ALL, since S9-3b's suite uses a PROVISIONED one: at the time this
 * was written `deleteProvisionedEndowments` did not know `material_change`, `deadline`, `lease` or
 * `legal_case` as `waqf` children, so a provisioned endowment here would have died on `23503` in
 * the NEXT run's `beforeAll` — the AV4-B2 once-per-database landmine that helper's comments record
 * four times over.
 *
 * ⊕ THAT DEBT IS PAID (S10-1b). The helper now knows FIVE tables, not the four named above:
 * `escalation_event` was missing from this list and is a `waqf` child with its own migration-41
 * DELETE guard. `deadline` needed a LEAF-FIRST LOOP rather than a flat DELETE, because its
 * `recomputedFromId` self-FK carries no `ON DELETE` clause. **This suite is deliberately left on a
 * fixture endowment anyway** — switching it is a behaviour change to a passing test, and it belongs
 * to whichever stage actually needs a provisioned endowment here, with its own measurement. What
 * changed is that the option now exists. ⚠ Still incomplete for `lease`: `asset` is not in the
 * purge, so an endowment carrying one remains unpurgeable.
 *
 * The suspension is the same bounded shape that helper uses: one DO block, one transaction, guards
 * re-armed `ENABLE ALWAYS` before it ends, and the predicate scoped to THIS endowment.
 */
async function purgeSuiteRows(): Promise<void> {
  const raw = await privilegedPrisma();
  await raw.$executeRawUnsafe(
    [
      'DO $qm_s93c_purge$',
      'BEGIN',
      '  ALTER TABLE "compliance_task" DISABLE TRIGGER compliance_task_no_delete;',
      '  ALTER TABLE "material_change" DISABLE TRIGGER material_change_no_delete;',
      '  ALTER TABLE "deadline" DISABLE TRIGGER deadline_no_delete;',
      `  DELETE FROM "material_change" WHERE "waqfId" = '${WAQF}';`,
      // `deadline.recomputedFromId` is a SELF-FK, so a supersession chain is removed LEAF-FIRST:
      // each pass deletes only rows nothing names as its predecessor.
      '  LOOP',
      `    DELETE FROM "deadline" AS d WHERE d."waqfId" = '${WAQF}'`,
      '      AND NOT EXISTS (SELECT 1 FROM "deadline" AS x WHERE x."recomputedFromId" = d."id");',
      '    EXIT WHEN NOT FOUND;',
      '  END LOOP;',
      `  DELETE FROM "compliance_task" WHERE "waqfId" = '${WAQF}' AND "templateCode" = 'GOV-REG-02';`,
      '  ALTER TABLE "deadline" ENABLE ALWAYS TRIGGER deadline_no_delete;',
      '  ALTER TABLE "material_change" ENABLE ALWAYS TRIGGER material_change_no_delete;',
      '  ALTER TABLE "compliance_task" ENABLE ALWAYS TRIGGER compliance_task_no_delete;',
      'END',
      '$qm_s93c_purge$;',
    ].join('\n'),
  );
}

describe.runIf(hasDatabase)('S9-3c · derived anchors + the GOV-REG-02 triggers', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      {
        id: OFFICER,
        role: 'COMPLIANCE_OFFICER',
        waqfIds: [WAQF, 'waqf-001', 'waqf-005'],
        permissions: ['endowment:waqf:read', 'compliance:task:read', 'compliance:task:write'],
      },
    ]);
    const raw = await privilegedPrisma();
    // Provision the DECLARED HOMES this suite reads. `certificateExpiry` is seeded NULL on every
    // fixture endowment (measured), so the certificate arm has nothing to read until something
    // records one — which is itself the honest state, not a gap.
    await raw.$executeRawUnsafe(
      `UPDATE "waqf" SET "certificateExpiry" = '${CERT_EXPIRY}T00:00:00.000Z',
                         "certificateExpiryHijri" = '${hijriOf(CERT_EXPIRY)}'
         WHERE "id" = '${WAQF}'`,
    );
    // No lease and no legal case exist in the fixture at all, so the CONTRACT_RENEWAL and HEARING
    // arms would otherwise be fixture-starved — the R6-C1 lesson: a property whose generator
    // cannot reach a configuration reports its silence as success.
    await raw.$executeRawUnsafe(
      `INSERT INTO "lease" ("id","waqfId","assetId","tenantAr","rentSar","startDate","startDateHijri",
                            "endDate","endDateHijri","status","updatedAt")
       SELECT '${API_TEST_PREFIX}s93c-lease', '${WAQF}', a."id", 'مستأجر تجريبي', 1000,
              '2025-06-18T00:00:00.000Z', '${hijriOf('2025-06-18')}',
              '${LEASE_END}T00:00:00.000Z', '${hijriOf(LEASE_END)}', 'active', now()
         FROM "asset" a WHERE a."waqfId" = '${WAQF}' LIMIT 1
       ON CONFLICT ("id") DO NOTHING`,
    );
    await raw.$executeRawUnsafe(
      `INSERT INTO "legal_case" ("id","waqfId","subjectAr","forum","status","nextHearing",
                                 "nextHearingHijri","updatedAt")
       VALUES ('${API_TEST_PREFIX}s93c-case', '${WAQF}', 'قضية تجريبية', 'court', 'open',
               '${HEARING_DATE}T00:00:00.000Z', '${hijriOf(HEARING_DATE)}', now())
       ON CONFLICT ("id") DO NOTHING`,
    );
    // ⚠ AND UN-RETIRE THEM. `afterAll` can only SOFT-delete (both tables are retention-guarded),
    // so a second run's `ON CONFLICT DO NOTHING` skips the insert and leaves last run's rows
    // `deletedAt`-stamped — which every read filters out. This suite's first run passed and its
    // second failed with NOT_FOUND on exactly that; the fix belongs here rather than in a looser
    // read filter.
    for (const table of ['lease', 'legal_case'] as const) {
      await raw.$executeRawUnsafe(
        `UPDATE "${table}" SET "deletedAt" = NULL WHERE "id" LIKE '${API_TEST_PREFIX}s93c-%'`,
      );
    }
    // Self-healing: a previous process killed between beforeAll and afterAll leaves real duties on
    // this endowment, and migration 40's index would then refuse this run's first RAISE.
    await purgeSuiteRows();
  });

  afterAll(async () => {
    await purgeSuiteRows();
    const raw = await privilegedPrisma();
    await raw.$executeRawUnsafe(
      `UPDATE "lease" SET "deletedAt" = now() WHERE "id" = '${API_TEST_PREFIX}s93c-lease'`,
    );
    await raw.$executeRawUnsafe(
      `UPDATE "legal_case" SET "deletedAt" = now() WHERE "id" = '${API_TEST_PREFIX}s93c-case'`,
    );
    await cleanupApiTestRows();
  });

  /* ── 1 · the wire refusals — ONE route left, and the two S11-1 arms refuse BY NAME when blank ── */

  it('REGISTER_30BD on an endowment with NO recorded anchor refuses ANCHOR_SOURCE_VALUE_ABSENT — blank means CANNOT COMPUTE (S11-1)', async () => {
    const caller = await officerCaller('s93c-anchor-register-blank');
    // ⊕ S11-1 (migration 48): the anchor now HAS a home — `Waqf.registrationAnchorDate`, recorded
    // operator input — and waqf-005's is blank in the fixture. The refusal is therefore no longer
    // "the fact has no home" but "nobody has recorded it": a refusal BY NAME for this endowment,
    // which no screen may render as "nothing due" (the condition attached to the ruling).
    // ⚠ `Waqf.registrationDate` STILL EXISTS and is STILL populated on every seeded endowment, and
    // it is STILL not the anchor: the reader does not even select it.
    let message = '';
    try {
      await caller.deadline.computeFromDerivedAnchor({
        waqfId: 'waqf-005',
        ruleKey: 'REGISTER_30BD',
        subject: 'waqf',
        triggerEvent: 'test — blank anchor probe',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/registrationAnchorDate/);
    expect(message).toMatch(/NULL/);
    expect(message).not.toMatch(/cannot be auto-derived/);
  });

  it('REGISTER_30BD on waqf-007 — anchor RECORDED but OUTSIDE calendar coverage — refuses CALENDAR_UNAVAILABLE and persists nothing (S11-1)', async () => {
    const caller = await officerCaller('s93c-anchor-register-coverage');
    // The fixture records waqf-007's clock-start as its (invented) documentation date, 2015-08-13 —
    // the realistic shape of a real endowment's clock-start, and OUTSIDE the seeded 1447–1449 AH
    // holiday coverage. The anchor derives; the arithmetic refuses, by name. This is the third
    // "cannot compute" cause a screen must keep distinct from "not recorded" and "nothing due".
    let message = '';
    try {
      await caller.deadline.computeFromDerivedAnchor({
        waqfId: WAQF,
        ruleKey: 'REGISTER_30BD',
        subject: 'waqf',
        triggerEvent: 'test — out-of-coverage anchor probe',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/coverage|CALENDAR_UNAVAILABLE/i);
    expect(message).not.toMatch(/registrationAnchorDate.*NULL/);
  });

  it('LICENSE_RENEWAL refuses with the WRONG-SCOPE discriminator — a MODEL is missing, not a column', async () => {
    const caller = await officerCaller('s93c-route-licence');
    let message = '';
    try {
      await caller.deadline.computeFromDerivedAnchor({
        waqfId: WAQF,
        ruleKey: 'LICENSE_RENEWAL',
        subject: 'waqf',
        triggerEvent: 'test — routed anchor probe',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    // The near-miss must be named in the refusal, so a future "helpful" wiring of a
    // subcontractor's licence expiry is a caught mistake rather than a quiet one.
    expect(message).toMatch(/Vendor\.licenseExpiry/);
    expect(message).toMatch(/MODEL/);
  });

  it('ISTIBDAL_10BD REFUSES the endowment as its subject — the completion is a fact about the TAKING (S11-1)', async () => {
    const caller = await officerCaller('s93c-anchor-istibdal-subject');
    // ⊕ S11-1: the home is `Expropriation.istibdalCompletedDate`, subject `expropriation`. Offering
    // the endowment itself is a wrong-subject refusal, and the message names the declared home so a
    // caller cannot read it as "no home exists".
    let message = '';
    try {
      await caller.deadline.computeFromDerivedAnchor({
        waqfId: WAQF,
        ruleKey: 'ISTIBDAL_10BD',
        subject: 'waqf',
        triggerEvent: 'test — wrong-subject probe',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/Expropriation\.istibdalCompletedDate/);
    expect(message).toMatch(/'waqf'/);
  });

  it('nothing is persisted by a refusal on waqf-007 — asserted by count, not by absence of an error', async () => {
    // ⊕ S11-1 re-pinned. The seeded REGISTER_30BD row lives on waqf-001 (in-coverage anchor); on
    // THIS endowment the anchor is out of coverage, exp-001 (waqf-003) is pending, and
    // LICENSE_RENEWAL is still routed — so every probe above refused, and refusals write nothing.
    const raw = await privilegedPrisma();
    const rows = await raw.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT count(*) AS n FROM "deadline"
         WHERE "waqfId" = '${WAQF}' AND "ruleKey" IN ('REGISTER_30BD','ISTIBDAL_10BD','LICENSE_RENEWAL')
           AND "deletedAt" IS NULL`,
    );
    expect(Number(rows[0]?.n ?? 0)).toBe(0);
  });

  /* ── 2 · the DERIVED arms ──────────────────────────────────────────────────────────────── */

  it('UPDATE_15BD derives from Waqf.certificateExpiry and records the anchor PROVENANCE', async () => {
    const caller = await officerCaller('s93c-derive-cert');
    const result = await caller.deadline.computeFromDerivedAnchor({
      waqfId: WAQF,
      ruleKey: 'UPDATE_15BD',
      subject: 'waqf',
      triggerEvent: 'test — certificate expiry reached',
    });
    expect(result.anchorSourceId).toBe(WAQF);
    expect(result.anchorSemantics).toContain('certificate-expiry');
    // ⚠ Binding rule 3: the 15-bd window is an UNVERIFIED figure, so the caveat travels.
    expect(result.unverifiedNote).not.toBeNull();
    // The anchor stored is the DECLARED column's value, not the caller's opinion.
    const raw = await privilegedPrisma();
    const stored = await raw.$queryRawUnsafe<{ anchorDate: Date; anchorDateHijri: string }[]>(
      `SELECT "anchorDate","anchorDateHijri" FROM "deadline" WHERE "id" = '${result.deadline.id}'`,
    );
    expect(new Date(String(stored[0]?.anchorDate)).toISOString().slice(0, 10)).toBe(CERT_EXPIRY);
    // The FROZEN twin is the one on the waqf row, passed through — not re-derived here.
    expect(stored[0]?.anchorDateHijri).toBe(hijriOf(CERT_EXPIRY));
  });

  it('KYC_REFRESH derives per BENEFICIARY, and REFUSES on a never-verified one', async () => {
    const caller = await officerCaller('s93c-derive-kyc');
    const ok = await caller.deadline.computeFromDerivedAnchor({
      waqfId: 'waqf-005',
      ruleKey: 'KYC_REFRESH',
      subject: 'beneficiary',
      subjectId: BEN_IN_COVERAGE,
      triggerEvent: 'test — kyc refresh clock',
    });
    expect(ok.anchorSourceId).toBe(BEN_IN_COVERAGE);
    // The refresh interval is an ⚠ unverified figure (BO Std Art. 6), so the marker travels.
    expect(ok.unverifiedNote).not.toBeNull();

    // ⚠ THE LOAD-BEARING REFUSAL. `ben-003` has `kycLastRefreshed: null` in the fixture — a member
    // whose UBO file has NEVER been verified. There is no last-verification date to count twelve
    // months from, and substituting "today" would compute a statutory refresh date from a fact
    // nobody attested — while silently converting KYC_NEVER_VERIFIED into a satisfied clock.
    await expect(
      caller.deadline.computeFromDerivedAnchor({
        waqfId: 'waqf-001',
        ruleKey: 'KYC_REFRESH',
        subject: 'beneficiary',
        subjectId: BEN_NEVER,
        triggerEvent: 'test — kyc refresh clock',
      }),
    ).rejects.toThrow(/ANCHOR_SOURCE_VALUE_ABSENT|NULL/i);
  });

  it('a recorded anchor OUTSIDE the seeded calendar coverage refuses — fail-closed, by design', async () => {
    const caller = await officerCaller('s93c-derive-kyc-coverage');
    // ⚠ NOT the same refusal as the never-verified case, and the distinction matters: the fact IS
    // recorded (`ben-001`, 2026-01-15) and the ANCHOR derives fine — it is the business-day
    // arithmetic that has no attested holiday data for January 2026. `seed/holidays.ts`'s own
    // warning: a coverage window wider than the seeded rows silently answers "no holiday" for
    // years nobody attested. So the engine refuses instead of guessing, and the remedy is seeding
    // the calendar further back, not relaxing the check.
    await expect(
      caller.deadline.computeFromDerivedAnchor({
        waqfId: 'waqf-001',
        ruleKey: 'KYC_REFRESH',
        subject: 'beneficiary',
        subjectId: BEN_OUT_OF_COVERAGE,
        triggerEvent: 'test — kyc clock before calendar coverage',
      }),
    ).rejects.toThrow(/CALENDAR_UNAVAILABLE|outside the calendar/i);
  });

  it('CONTRACT_RENEWAL and HEARING derive from their own rows', async () => {
    const caller = await officerCaller('s93c-derive-rows');
    const lease = await caller.deadline.computeFromDerivedAnchor({
      waqfId: WAQF,
      ruleKey: 'CONTRACT_RENEWAL',
      subject: 'lease',
      subjectId: `${API_TEST_PREFIX}s93c-lease`,
      triggerEvent: 'test — lease end approaching',
    });
    // A pre-expiry rule: the DUE date is the recorded fact and does not roll; the engine computes
    // the ACT-BY date. So the caveat marker is null — the expiry is not a regulatory figure.
    expect(lease.unverifiedNote).toBeNull();
    expect(await isoDayOfDeadline(lease.deadline.id)).toBe(LEASE_END);
    expect(lease.deadline.actionableDate).not.toBeNull();

    const hearing = await caller.deadline.computeFromDerivedAnchor({
      waqfId: WAQF,
      ruleKey: 'HEARING',
      subject: 'legal_case',
      subjectId: `${API_TEST_PREFIX}s93c-case`,
      triggerEvent: 'test — hearing scheduled',
    });
    expect(await isoDayOfDeadline(hearing.deadline.id)).toBe(HEARING_DATE);
    // §09: a hearing is "as dated" — no lead, so no actionable date.
    expect(hearing.deadline.actionableDate).toBeNull();
  });

  it('DISTRIBUTE_3M_FYE needs a STATED reference date, and applies the declared reading', async () => {
    const caller = await officerCaller('s93c-derive-fye');
    // Without `asOf` it refuses: `fiscalYearEnd` is a recurring MM-DD, and picking a year silently
    // would answer the "which fiscal year" question by accident.
    await expect(
      caller.deadline.computeFromDerivedAnchor({
        waqfId: WAQF,
        ruleKey: 'DISTRIBUTE_3M_FYE',
        subject: 'waqf',
        triggerEvent: 'test — distribution window',
      }),
    ).rejects.toThrow(/AS_OF_REQUIRED|reference date/i);

    const result = await caller.deadline.computeFromDerivedAnchor({
      waqfId: WAQF,
      ruleKey: 'DISTRIBUTE_3M_FYE',
      subject: 'waqf',
      // ⚠ 2027, not 2026: the reading resolves to the most recently ENDED year end, and the
      // 2025-12-31 one is BEFORE the seeded calendar's 2026-02-22 coverage start (which refuses,
      // correctly — asserted in its own test above for the KYC arm). 2027-08-27 resolves to
      // 2026-12-31, inside coverage.
      asOf: '2027-08-27T00:00:00.000Z',
      triggerEvent: 'test — distribution window',
    });
    const raw = await privilegedPrisma();
    const stored = await raw.$queryRawUnsafe<{ anchorDate: Date }[]>(
      `SELECT "anchorDate" FROM "deadline" WHERE "id" = '${result.deadline.id}'`,
    );
    // FISCAL_YEAR_END_READING: the most recently ENDED year end at or before the reference date.
    // The endowment's fiscalYearEnd is "12-31", the reference is 2027-08-27 ⇒ 2026-12-31.
    expect(new Date(String(stored[0]?.anchorDate)).toISOString().slice(0, 10)).toBe('2026-12-31');
    // ⚠ The month anchor is an open QUESTION OF LAW, so the date carries the marker.
    expect(result.unverifiedNote).not.toBeNull();
  });

  it("another endowment's subjectId reads exactly like a nonexistent one", async () => {
    const caller = await officerCaller('s93c-scope');
    // §10 §7.2's non-disclosure shape. An anchor is a statutory fact; reading one across the
    // endowment boundary would compute this endowment's deadline from another family's record.
    await expect(
      caller.deadline.computeFromDerivedAnchor({
        waqfId: WAQF,
        ruleKey: 'KYC_REFRESH',
        subject: 'beneficiary',
        subjectId: BEN_IN_COVERAGE, // belongs to waqf-005
        triggerEvent: 'test — cross-endowment probe',
      }),
      // ⚠ ASSERTED ON THE CODE, not on the prose. `NO_GRANT` surfaces as tRPC `NOT_FOUND` — which
      // IS the §10 §7.2 requirement: another endowment's row id must be INDISTINGUISHABLE from a
      // nonexistent one, and a message that explained the difference would defeat the point.
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it("subject 'waqf' refuses a subjectId — two ids would make the subject ambiguous", async () => {
    const caller = await officerCaller('s93c-subjectid');
    await expect(
      caller.deadline.computeFromDerivedAnchor({
        waqfId: WAQF,
        ruleKey: 'UPDATE_15BD',
        subject: 'waqf',
        subjectId: WAQF,
        triggerEvent: 'test — redundant subject id',
      }),
    ).rejects.toThrow(/takes no subjectId/i);
  });

  /* ── 3 · the MATERIAL-CHANGE trigger, and coalescing across three changes ──────────────── */

  describe('§09 coalescing, end to end', () => {
    beforeAll(async () => {
      await resetEndowmentState();
    });

    it('the FIRST material change RAISES the duty with reason EVENT_TRIGGER, clocked from the EFFECTIVE date', async () => {
      const caller = await officerCaller('s93c-mc-1');
      const first = await caller.deadline.recordMaterialChange({
        waqfId: WAQF,
        kind: 'ASSET',
        effectiveDate: '2026-05-20T00:00:00.000Z',
        effectiveDateHijri: hijriOf('2026-05-20'),
        sourceRef: 'test — invented asset disposal',
        triggerEvent: 'test — material change (asset)',
      });
      expect(first.action).toBe('RAISE');
      expect(first.deadlineId).not.toBeNull();
      expect(await openUpdateTaskCount()).toBe(1);

      const raw = await privilegedPrisma();
      const task = await raw.$queryRawUnsafe<
        {
          instantiatedReason: string;
          templateCode: string;
          instantiatedByApprovalId: string | null;
        }[]
      >(
        `SELECT "instantiatedReason","templateCode","instantiatedByApprovalId"
           FROM "compliance_task" WHERE "id" = '${first.taskId}'`,
      );
      // §09's five EVENT templates are raised BY THEIR TRIGGER — the reason enum member that
      // existed since E7 with no path writing it. This is that path.
      expect(task[0]?.instantiatedReason).toBe('EVENT_TRIGGER');
      expect(task[0]?.templateCode).toBe('GOV-REG-02');
      // ⚠ NOT a library upgrade: migration 39's CHECK makes the approval pointer and the reason
      // exclusive both ways, so an EVENT_TRIGGER task must carry no pointer.
      expect(task[0]?.instantiatedByApprovalId).toBeNull();
      // The change is bound into the change-set.
      const change = await raw.$queryRawUnsafe<{ complianceTaskId: string | null }[]>(
        `SELECT "complianceTaskId" FROM "material_change" WHERE "id" = '${first.materialChangeId}'`,
      );
      expect(change[0]?.complianceTaskId).toBe(first.taskId);
    });

    it('a LATER change APPENDS and does NOT move the date — batching must not buy time', async () => {
      const caller = await officerCaller('s93c-mc-2');
      const before = await openUpdateTaskCount();
      const second = await caller.deadline.recordMaterialChange({
        waqfId: WAQF,
        kind: 'BENEFICIARY',
        effectiveDate: '2026-06-10T00:00:00.000Z',
        effectiveDateHijri: hijriOf('2026-06-10'),
        sourceRef: 'test — invented beneficiary status change',
        triggerEvent: 'test — material change (beneficiary)',
      });
      expect(second.action).toBe('APPEND');
      // ⚠ NO new deadline row and NO new task: the tightest still governs, and §09's "one open
      // update obligation per waqf" holds. If this were a RAISE, migration 40's partial unique
      // index would have refused it — the index and the coalescer agree, and this asserts both.
      expect(second.deadlineId).toBeNull();
      expect(await openUpdateTaskCount()).toBe(before);
      expect(second.governingAnchor).toBe('2026-05-20');
    });

    it('an EARLIER change TIGHTENS through a SUPERSESSION row — never an UPDATE', async () => {
      const caller = await officerCaller('s93c-mc-3');
      const raw = await privilegedPrisma();
      const headBefore = await raw.$queryRawUnsafe<{ id: string; dueDate: Date }[]>(
        `SELECT d."id", d."dueDate" FROM "deadline" d
           WHERE d."waqfId" = '${WAQF}' AND d."ruleKey" = 'UPDATE_15BD' AND d."deletedAt" IS NULL
             AND NOT EXISTS (SELECT 1 FROM "deadline" x WHERE x."recomputedFromId" = d."id")`,
      );
      const priorHeadId = String(headBefore[0]?.id);
      const priorDue = new Date(String(headBefore[0]?.dueDate)).toISOString().slice(0, 10);

      const third = await caller.deadline.recordMaterialChange({
        waqfId: WAQF,
        kind: 'NAZARAH',
        effectiveDate: '2026-05-04T00:00:00.000Z',
        effectiveDateHijri: hijriOf('2026-05-04'),
        sourceRef: 'test — invented nazarah change, effective earlier',
        triggerEvent: 'test — material change (nazarah), backdated',
      });
      expect(third.action).toBe('APPEND_AND_TIGHTEN');
      expect(third.supersededDeadlineId).toBe(priorHeadId);
      expect(third.governingAnchor).toBe('2026-05-04');
      expect(await openUpdateTaskCount()).toBe(1);

      // The superseded row is STILL THERE, unmoved. §09's freeze: a date that has been computed,
      // displayed and possibly filed must not shift — so the correction is a NEW row linking its
      // predecessor, and migration 38 makes the alternative impossible at rest anyway.
      expect(await isoDayOfDeadline(priorHeadId)).toBe(priorDue);
      const newDue = await isoDayOfDeadline(String(third.deadlineId));
      expect(newDue < priorDue, `${newDue} must be tighter than ${priorDue}`).toBe(true);
    });

    it('FILING clears the change-set and closes the duty; the NEXT change opens a FRESH clock', async () => {
      const caller = await officerCaller('s93c-file');
      const filed = await caller.deadline.fileUpdateObligation({
        waqfId: WAQF,
        filedAt: '2026-05-26T00:00:00.000Z',
        filedAtHijri: hijriOf('2026-05-26'),
        triggerEvent: 'test — update filed with the Authority',
      });
      // All three changes cleared at once: they were ONE duty, so one filing discharges them.
      expect(filed.clearedChangeIds.length).toBe(3);
      expect(await openUpdateTaskCount()).toBe(0);

      const raw = await privilegedPrisma();
      const unfiled = await raw.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "material_change"
           WHERE "waqfId" = '${WAQF}' AND "filedAt" IS NULL AND "deletedAt" IS NULL`,
      );
      // "Clears" is a MARK, never a delete — the rows are all still there, all filed.
      expect(Number(unfiled[0]?.n ?? 0)).toBe(0);
      const kept = await raw.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "material_change"
           WHERE "waqfId" = '${WAQF}' AND "deletedAt" IS NULL`,
      );
      expect(Number(kept[0]?.n ?? 0)).toBe(3);

      // ⚠ THE FRESH CLOCK. The slot is free because the task is COMPLETED, so the next change
      // RAISES rather than appending to a discharged duty.
      const next = await caller.deadline.recordMaterialChange({
        waqfId: WAQF,
        kind: 'ASSET',
        effectiveDate: '2026-06-24T00:00:00.000Z',
        effectiveDateHijri: hijriOf('2026-06-24'),
        sourceRef: 'test — invented change after filing',
        triggerEvent: 'test — material change after filing',
      });
      expect(next.action).toBe('RAISE');
      expect(next.taskId).not.toBe(filed.taskId);
      expect(await openUpdateTaskCount()).toBe(1);
    });

    it('filing with nothing open is refused rather than marking a set cleared for no duty', async () => {
      const caller = await officerCaller('s93c-file-empty');
      // waqf-001's slot is the database suite's; here we only need an endowment with no open duty.
      await expect(
        caller.deadline.fileUpdateObligation({
          waqfId: 'waqf-001',
          filedAt: '2026-05-26T00:00:00.000Z',
          filedAtHijri: hijriOf('2026-05-26'),
          triggerEvent: 'test — filing nothing',
        }),
      ).rejects.toThrow(/NO_OPEN_UPDATE_OBLIGATION|no open GOV-REG-02/i);
    });
  });

  /* ── 4 · the CERTIFICATE sweep, and the lead that must not move the anchor ─────────────── */

  describe('§09 certificate-expiry sweep', () => {
    beforeAll(async () => {
      await resetEndowmentState();
    });

    it('is NOT in scope before the configured lead window is reached', async () => {
      const caller = await officerCaller('s93c-sweep-early');
      // Lead is 30 business days before 2026-05-20; a February reference is far outside it.
      const result = await caller.deadline.sweepCertificateExpiry({
        waqfId: WAQF,
        asOf: '2026-02-01T00:00:00.000Z',
        triggerEvent: 'test — daily sweep, far from expiry',
      });
      expect(result.inScope).toBe(false);
      expect(result.reason).toBe('LEAD_WINDOW_NOT_REACHED');
      expect(await openUpdateTaskCount()).toBe(0);
    });

    it('raises once inside the lead window, clocked from the EXPIRY — not from the notice day', async () => {
      const caller = await officerCaller('s93c-sweep-inside');
      const early = await caller.deadline.sweepCertificateExpiry({
        waqfId: WAQF,
        asOf: '2026-05-05T00:00:00.000Z',
        triggerEvent: 'test — daily sweep, inside the lead',
      });
      expect(early.inScope).toBe(true);
      if (!early.inScope) return;
      expect(early.action).toBe('RAISE');
      expect(early.governingAnchor).toBe(CERT_EXPIRY);
      const dueWhenNoticedEarly = await isoDayOfDeadline(String(early.deadlineId));

      // ⚠ THE PROPERTY THAT MAKES A CONFIGURABLE LEAD SAFE. Clear the state and sweep again as if
      // the worker had first noticed ON the expiry day. The due date must be IDENTICAL: the lead
      // moves when we notice, and §09's rule table fixes the anchor at the certificate expiry. A
      // lead that moved the anchor would make a statutory deadline configurable.
      await resetEndowmentState();
      const onTheDay = await caller.deadline.sweepCertificateExpiry({
        waqfId: WAQF,
        asOf: `${CERT_EXPIRY}T00:00:00.000Z`,
        triggerEvent: 'test — daily sweep, on the expiry day',
      });
      expect(onTheDay.inScope).toBe(true);
      if (!onTheDay.inScope) return;
      expect(onTheDay.governingAnchor).toBe(CERT_EXPIRY);
      expect(await isoDayOfDeadline(String(onTheDay.deadlineId))).toBe(dueWhenNoticedEarly);
    });

    it('a second sweep on the same endowment APPENDS — it never raises a parallel duty', async () => {
      const caller = await officerCaller('s93c-sweep-twice');
      const before = await openUpdateTaskCount();
      expect(before).toBe(1);
      const again = await caller.deadline.sweepCertificateExpiry({
        waqfId: WAQF,
        asOf: '2026-05-21T00:00:00.000Z',
        triggerEvent: 'test — the next day’s sweep',
      });
      // ⚠ IDEMPOTENCE BY COALESCING, not by a stored "already raised" flag. A daily sweep runs
      // every day; if the second run raised again, the index would refuse it (23505) and the
      // worker would crash on an endowment it had already handled correctly.
      expect(again.inScope).toBe(true);
      if (!again.inScope) return;
      expect(again.action).toBe('APPEND');
      expect(again.deadlineId).toBeNull();
      expect(await openUpdateTaskCount()).toBe(1);
    });

    it('an endowment with NO recorded certificate expiry is out of scope, not an error', async () => {
      const caller = await officerCaller('s93c-sweep-none');
      // A portfolio sweep must not die on the first endowment nobody has recorded an expiry for.
      const result = await caller.deadline.sweepCertificateExpiry({
        waqfId: 'waqf-001',
        asOf: '2026-05-05T00:00:00.000Z',
        triggerEvent: 'test — sweep with no expiry recorded',
      });
      expect(result.inScope).toBe(false);
      expect(result.reason).toBe('NO_RECORDED_CERTIFICATE_EXPIRY');
    });
  });
});
