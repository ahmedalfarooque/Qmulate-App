/**
 * AV5-02 — **THE Q10 SEAL FORECLOSED A REGULATORY OBLIGATION: `deed.upsert`'s UPDATE BRANCH WAS DEAD
 * ON EVERY EXISTING APPOINTMENT, AND IT IS THE ONLY PATH THAT RECORDS THE BR-109 ELIGIBILITY
 * VERIFICATION.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT, AS MEASURED (before migration 18)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Migration 17 rendered the product owner's Q10 ruling (*"the trusteeship deed can only be editted by
 * a court judge"*) as: no seat may UPDATE ANY column of a recorded `trusteeship_deed`.
 *
 * ⚠ THE BEFORE-STATE IS MEASURED BY **THIS FILE**, AGAINST A DATABASE AT MIGRATION 17 — and it is
 * quoted from that run rather than from a scratch harness, because the first attempt at a repro threw
 * `withAudit() was given a client it does not recognize` (a duplicate module instance in the harness,
 * not the guard) and would have attributed the 500 to the wrong cause. With migration 18 held aside,
 * `--reset` → `migrate deploy` → `db:seed`, this file reports **2 failed | 8 passed (10)**, and the
 * failure under the UPDATE-branch test is the seal itself:
 *
 *     TRPCError: Invalid `prisma.trusteeshipDeed.update()` invocation … 42501
 *     "trusteeship_deed …: a recorded Nazir appointment is WRITE-ONCE FOR EVERY SEAT —
 *      column(s) authorityLicensed, eligibilit…"
 *
 * — i.e. a 500 for a caller doing the one thing BR-109 requires, on five seeded appointments that ALL
 * carry `eligibilityVerifiedAt = null`. (The second failure is the classification test, which reads a
 * function migration 18 introduces.) BR-109/NFR-09 says
 * capture **AND VERIFY**, `TrusteeshipDeed`'s own schema comment says *"Partial assessment is legal;
 * intake learns these one at a time"*, and learning one at a time is an UPDATE. So the obligation was
 * recordable only in the same statement that first created the appointment, and never afterwards.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT MIGRATION 18 + THIS FILE PIN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The deed's own FACTS stay write-once for every seat; QMULATE's ASSESSMENT OF THE APPOINTEE gets a
 * path. Both halves are asserted here through the REAL procedure, against a real migrated + seeded
 * database, with the row read on the base client afterwards:
 *
 *   1. the CREATE branch still records an appointment and stamps the verification (the premise —
 *      without it the "advance the stamp" assertions below would have no subject);
 *   2. the UPDATE branch RECORDS A VERIFICATION: a fuller assessment, an advanced stamp, an audit
 *      event, and every deed fact untouched;
 *   3. a changed deed FACT is refused `CONFLICT` / `DEED_TERM_WRITE_ONCE`, naming the columns AND the
 *      remedy (a superseding record, ⚠ not reachable in this schema — E4), with the row byte-identical
 *      afterwards: refused BEFORE any write, not written and rolled back;
 *   4. the same refusal on a SEEDED appointment, which is read and never written;
 *   5. the api's copy of the assessment classification EQUALS the database's
 *      (`qmulate_trusteeship_deed_assessment_columns()`) — two lists that decide which facts of a
 *      recorded appointment are editable may not drift.
 *
 * ⚠ MUTATION-VERIFIED (S4, AV5-02) — AND ONE OF THE TWO MUTATIONS TAUGHT SOMETHING, SO IT IS RECORDED
 * AS MEASURED RATHER THAN AS PREDICTED. Both were run against this same database, this file only:
 *
 *   M1 · the UPDATE branch sends the FULL `data` object (deed facts included) instead of
 *        `data: assessment`  →  **1 failed | 9 passed (10)**, and the ONLY failure is the source pin
 *        at the bottom of this file. The behavioural tests stay green, because the facts this file
 *        submits are IDENTICAL to the recorded ones and the trigger compares VALUES, not statements:
 *        both shapes commit. So `data: assessment` is a DEFENSIVE shape, not a behavioural one, and a
 *        source pin is the only honest way to hold it. (The first draft of this header claimed M1
 *        turned test 2 red with a `42501`. It does not. Corrected rather than quietly deleted.)
 *   M2 · the pre-write `deedFactDifferences` refusal is dropped  →  **2 failed | 8 passed (10)**, and
 *        the measured failure is NOT a 500: the call **SUCCEEDED**. With the deed facts absent from
 *        the statement, a rewritten `primaryNazir` + `successorNazir` was silently discarded while the
 *        verification stamp advanced — the submission reads as accepted and the appointment did not
 *        change. That is why the refusal lives at this layer: on THIS path the trigger has nothing to
 *        refuse, because nothing it guards is ever sent.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ RULE 5 (AV4-B2): THIS FILE OWNS ITS SUBJECT AND SPENDS NO FIXTURE ROW
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * All five fixture endowments already carry an appointment, so the CREATE branch has no reachable
 * subject unless the test makes one — R6-C1's lesson (a probe that cannot reach its configuration
 * reports its silence as success). This file therefore provisions its OWN endowment, records its own
 * appointment on it, and removes both in `afterAll` (`deleteProvisionedEndowments` suspends
 * `trusteeship_deed_no_delete` for exactly that, bounded to the test prefix).
 *
 * The SEEDED appointments are READ and never written, and that is not tidiness: a verification written
 * to `waqf-001` would permanently change a fixture row, and `@qmulate/database`'s
 * `e3-exit-clauses.integration.test.ts` asserts `eligibilityVerifiedAt IS NULL` on it. That suite runs
 * BEFORE this one (turbo's `^test:integration` mutex), so the failure would surface on the NEXT run,
 * in a package that did nothing wrong — the V-E3-04 / AV4-B2 class this sprint has paid for four
 * times. The first test below asserts all five are still unstamped, so a future edit that points a
 * write at the fixture fails HERE, naming the reason.
 */

import { readFileSync } from 'node:fs';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  API_TEST_PREFIX,
  API_TEST_WAQF_PREFIX,
  FICTIONAL_MARKER_AR,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  countAuditEvents,
  hasDatabase,
  privilegedPrisma,
  provisionIntakeEndowment,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { DEED_ELIGIBILITY_ASSESSMENT_COLUMNS } from '../src/routers/deed.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('AV5-02 (the BR-109 eligibility verification path on a recorded appointment)');

const createCaller = createCallerFactory(appRouter);

/** Reads a file under `packages/api/`, refusing an empty read (which would pass over nothing). */
function readSource(relative: string): string {
  const text = readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
  if (text.trim() === '') throw new Error(`${relative} read as empty — fix the reader`);
  return text;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Subjects
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The endowment this file creates and destroys — the only way to reach the CREATE branch. */
const OWNED_WAQF = `${API_TEST_WAQF_PREFIX}9004`;

/** A SEEDED appointment. **READ, and written only in calls that must be REFUSED.** */
const SEEDED_WAQF = 'waqf-001';

/** The five fixture endowments, each of which carries exactly one seeded appointment. */
const SEEDED_WAQFS = [
  'waqf-001',
  'waqf-002',
  'waqf-003',
  'waqf-004',
  'waqf-005',
  'waqf-007',
] as const;

/**
 * A NAZIR holding `endowment:deed:read|write` on the owned endowment AND on `waqf-001`.
 *
 * The seeded grant for deed write is nazir-only (owner memo Q10 / D-E), so the seat that records an
 * appointment is the seat that records a verification on it. `endowment:deed:sign` is deliberately NOT
 * requested: nothing in this file signs a deed term.
 */
const NAZIR = `${API_TEST_PREFIX}av502-nazir`;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Reading the row — on the BASE client, so no projection can soften an assertion
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface DeedRow {
  readonly id: string;
  readonly primaryNazir: string;
  readonly primaryAppointedDate: Date;
  readonly primaryAppointedDateHijri: string;
  readonly authorizedRepName: string | null;
  readonly jointlyLiable: boolean;
  readonly successorNazir: string | null;
  readonly islam: boolean;
  readonly ksaResident: boolean;
  readonly saudiNationalWhereRequired: boolean | null;
  readonly authorityLicensed: boolean | null;
  readonly repKsaResident: boolean | null;
  readonly eligibilityVerifiedAt: Date | null;
  readonly eligibilityVerifiedAtHijri: string | null;
  readonly eligibilityVerifiedBy: string | null;
}

async function readDeed(waqfId: string): Promise<DeedRow | null> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<DeedRow[]>(
    `SELECT "id","primaryNazir","primaryAppointedDate","primaryAppointedDateHijri",
            "authorizedRepName","jointlyLiable","successorNazir","islam","ksaResident",
            "saudiNationalWhereRequired","authorityLicensed","repKsaResident",
            "eligibilityVerifiedAt","eligibilityVerifiedAtHijri","eligibilityVerifiedBy"
       FROM "trusteeship_deed" WHERE "waqfId" = $1`,
    waqfId,
  );
  return rows[0] ?? null;
}

/** The APPOINTMENT this file records — invented, and marked as such in Arabic (G-8). */
const APPOINTMENT = {
  primaryNazir: `QMULATE (professional Nazir) ${FICTIONAL_MARKER_AR}`,
  primaryAppointedDate: '2026-02-01T00:00:00.000Z',
  primaryAppointedDateHijri: '1447-08-13',
  authorizedRep: null,
  jointlyLiable: false,
  successorNazir: null,
} as const;

/**
 * THE FIRST ASSESSMENT: the four unconditional criteria pass, and the two CONDITIONAL ones are
 * genuinely NOT ASSESSED because the context says they do not bind yet.
 */
const FIRST_ASSESSMENT = {
  eligibility: {
    islam: true,
    legalCapacity: true,
    noDisqualifyingRemoval: true,
    ksaResident: true,
    saudiNationalWhereRequired: null,
    authorityLicensed: null,
  },
  repEligibility: null,
  context: { endowerIsForeign: false, holdsRealProperty: false, nazirIsLegalPerson: false },
} as const;

/**
 * THE LATER ASSESSMENT — the whole point of the path.
 *
 * The context changed (the Nazir is a legal person; the endower is foreign and real property is
 * held), so two criteria that did not bind now DO, and the assessment records that they were checked
 * and passed. Nothing about the APPOINTMENT changes: same Nazir, same dates, no representative.
 * This is `TrusteeshipDeed`'s own "intake learns these one at a time", executed.
 */
const LATER_ASSESSMENT = {
  eligibility: {
    islam: true,
    legalCapacity: true,
    noDisqualifyingRemoval: true,
    ksaResident: true,
    saudiNationalWhereRequired: true,
    authorityLicensed: true,
  },
  repEligibility: null,
  context: { endowerIsForeign: true, holdsRealProperty: true, nazirIsLegalPerson: true },
} as const;

describe.skipIf(!hasDatabase)(
  'AV5-02 · the BR-109 verification path on a recorded appointment',
  () => {
    beforeAll(async () => {
      await assertSeeded();
      // ⚠ THE ENDOWMENT FIRST, THE SEATS SECOND — a `WaqfAccessGrant` carries an FK to `waqf`. The
      // provisioner purges the id (grants, approvals, the appointment, then the row) before inserting,
      // so a run killed between here and `afterAll` cannot leave an appointment behind for the next one.
      await provisionIntakeEndowment({
        id: OWNED_WAQF,
        waqifId: 'waqif-002',
        continuationStipulation: 'ZUHUR_AND_BUTUN',
        entitlementOrder: 'LINEAGE_CONTINUATION',
      });
      await provisionTestSubjects([
        {
          id: NAZIR,
          role: 'NAZIR',
          waqfIds: [OWNED_WAQF, SEEDED_WAQF],
          permissions: ['endowment:waqf:read', 'endowment:deed:read', 'endowment:deed:write'],
        },
      ]);
    }, 300_000);

    afterAll(async () => {
      await cleanupApiTestRows();
      await closeDatabase();
    });

    /* ═════════════════════════════════════════════════════════════════════════════════════════
     * THE PREMISE
     * ═════════════════════════════════════════════════════════════════════════════════════════ */

    it('AV5-02 premise · all five SEEDED appointments carry NO verification event, and stay that way', async () => {
      for (const waqfId of SEEDED_WAQFS) {
        const deed = await readDeed(waqfId);
        expect(
          deed,
          `${waqfId} has no trusteeship deed — the fixture is not seeded`,
        ).not.toBeNull();
        // ⚠ THIS IS BOTH THE DEFECT'S EVIDENCE AND THE AV4-B2 GUARD RAIL. The evidence: BR-109 says
        // capture AND VERIFY, and the shipped fixture records the flags with no verification event —
        // which is what made the UPDATE branch's death a foreclosed OBLIGATION rather than a missing
        // convenience. The guard rail: if some future test writes a verification to a FIXTURE row, this
        // assertion fails HERE, in this package, instead of reddening `@qmulate/database`'s
        // `e3-exit-clauses` suite on the NEXT run for a reason it cannot see.
        expect(
          deed?.eligibilityVerifiedAt,
          `${waqfId}'s seeded appointment carries a verification stamp. Either the seed now records ` +
            `one (update this premise and @qmulate/database's e3-exit-clauses expectation together), ` +
            `or a test wrote to a fixture row — which is the AV4-B2 defect class.`,
        ).toBeNull();
        expect(deed?.eligibilityVerifiedBy).toBeNull();
      }
    });

    it('the OWNED endowment starts with NO appointment — otherwise the CREATE branch is unreachable', async () => {
      expect(
        await readDeed(OWNED_WAQF),
        `${OWNED_WAQF} already carries an appointment, so this file's CREATE branch has no reachable ` +
          `configuration and the verification assertions below would be testing nothing. Either ` +
          `provisionIntakeEndowment did not run, or its purge no longer removes the appointment ` +
          `(check that trusteeship_deed_no_delete is suspended and re-enabled in ` +
          `deleteProvisionedEndowments).`,
      ).toBeNull();
    });

    /* ═════════════════════════════════════════════════════════════════════════════════════════
     * 1 · the CREATE branch — the appointment, and its first verification stamp
     * ═════════════════════════════════════════════════════════════════════════════════════════ */

    it('records the appointment and STAMPS the first verification (CREATE branch)', async () => {
      const ctx = await contextFor({ userId: NAZIR, requestId: 'av502-create' });
      const result = await createCaller(ctx).deed.upsert({
        waqfId: OWNED_WAQF,
        ...APPOINTMENT,
        ...FIRST_ASSESSMENT,
      });

      expect(result.recorded).toBe('APPOINTMENT_AND_ASSESSMENT');
      expect(result.eligibility.primary.eligible).toBe(true);

      const row = await readDeed(OWNED_WAQF);
      expect(row?.primaryNazir).toBe(APPOINTMENT.primaryNazir);
      // The verification EVENT, which is what turns ten booleans into a verification.
      expect(row?.eligibilityVerifiedAt).not.toBeNull();
      expect(row?.eligibilityVerifiedAtHijri).not.toBeNull();
      expect(row?.eligibilityVerifiedBy).toBe(NAZIR);
      // The two conditional criteria are genuinely NOT ASSESSED here — `null`, never `false`. That
      // distinction is the resolver's contract and it is what the later verification changes.
      expect(row?.saudiNationalWhereRequired).toBeNull();
      expect(row?.authorityLicensed).toBeNull();
    });

    /* ═════════════════════════════════════════════════════════════════════════════════════════
     * 2 · the UPDATE branch — A VERIFICATION IS RECORDED. This is the blocker, closed.
     * ═════════════════════════════════════════════════════════════════════════════════════════ */

    it('records a LATER eligibility verification on the recorded appointment (UPDATE branch)', async () => {
      const before = await readDeed(OWNED_WAQF);
      expect(before?.eligibilityVerifiedAt, 'the CREATE branch did not run').not.toBeNull();

      // ⚠ A DISTINCT `now`, SUPPLIED RATHER THAN HOPED FOR. The database refuses an assessment change
      // whose stamp is not ADVANCED (migration 18 arm 3), and two calls inside the same millisecond
      // would otherwise fail for a reason that has nothing to do with the code under test.
      const later = new Date((before?.eligibilityVerifiedAt?.getTime() ?? Date.now()) + 60_000);
      const ctx = await contextFor({ userId: NAZIR, requestId: 'av502-verify', now: later });
      const result = await createCaller(ctx).deed.upsert({
        waqfId: OWNED_WAQF,
        ...APPOINTMENT,
        ...LATER_ASSESSMENT,
      });

      // The discriminator says WHICH of the two writes happened — an appointment was not re-recorded.
      expect(result.recorded).toBe('ELIGIBILITY_VERIFICATION');
      expect(result.eligibility.primary.eligible).toBe(true);

      const after = await readDeed(OWNED_WAQF);
      // THE ASSESSMENT MOVED: two criteria that were "not assessed" now carry an assessment.
      expect(after?.saudiNationalWhereRequired).toBe(true);
      expect(after?.authorityLicensed).toBe(true);
      // THE STAMP ADVANCED, and names the acting identity.
      expect(after?.eligibilityVerifiedAt?.getTime()).toBe(later.getTime());
      expect(after?.eligibilityVerifiedAt?.getTime()).toBeGreaterThan(
        before?.eligibilityVerifiedAt?.getTime() ?? Number.POSITIVE_INFINITY,
      );
      expect(after?.eligibilityVerifiedBy).toBe(NAZIR);
      // ⚠ AND EVERY DEED FACT IS UNTOUCHED — the ruling this path had to respect to exist at all.
      expect(after?.primaryNazir).toBe(before?.primaryNazir);
      expect(after?.primaryAppointedDate.getTime()).toBe(before?.primaryAppointedDate.getTime());
      expect(after?.primaryAppointedDateHijri).toBe(before?.primaryAppointedDateHijri);
      expect(after?.authorizedRepName).toBe(before?.authorizedRepName);
      expect(after?.jointlyLiable).toBe(before?.jointlyLiable);
      expect(after?.successorNazir).toBe(before?.successorNazir);
      expect(after?.id).toBe(before?.id);

      // The verification is IN THE TRAIL as its own event, with the verdict and its ⚠ caveat.
      expect(
        await countAuditEvents({
          action: 'UPDATE',
          category: 'MUTATION',
          entityId: before?.id ?? 'missing',
          waqfId: OWNED_WAQF,
          actorId: NAZIR,
        }),
        'a BR-109 verification was written with no audit event naming it',
      ).toBeGreaterThanOrEqual(1);
    });

    it('the READ side agrees — deed.get reports the verification event it just recorded', async () => {
      const ctx = await contextFor({ userId: NAZIR, requestId: 'av502-read' });
      const deed = await createCaller(ctx).deed.get({ waqfId: OWNED_WAQF });
      expect(deed?.eligibility.verifiedBy).toBe(NAZIR);
      expect(deed?.eligibility.verifiedAt).not.toBeNull();
      expect(deed?.eligibility.verifiedAtHijri).not.toBeNull();
    });

    /* ═════════════════════════════════════════════════════════════════════════════════════════
     * 3 · a changed DEED FACT is refused, and the refusal names the remedy
     * ═════════════════════════════════════════════════════════════════════════════════════════ */

    it('refuses a changed deed FACT with CONFLICT / DEED_TERM_WRITE_ONCE, and writes NOTHING', async () => {
      const before = await readDeed(OWNED_WAQF);
      const ctx = await contextFor({
        userId: NAZIR,
        requestId: 'av502-fact',
        now: new Date((before?.eligibilityVerifiedAt?.getTime() ?? Date.now()) + 120_000),
      });

      let thrown: unknown;
      try {
        await createCaller(ctx).deed.upsert({
          waqfId: OWNED_WAQF,
          ...APPOINTMENT,
          // TWO deed facts at once: WHO holds the nazarah, and who succeeds them.
          primaryNazir: `SOMEBODY ELSE ${FICTIONAL_MARKER_AR}`,
          successorNazir: `A SUCCESSOR ${FICTIONAL_MARKER_AR}`,
          ...LATER_ASSESSMENT,
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown, 'a recorded appointment accepted an edit to its own facts').toBeDefined();
      // CONFLICT, not BAD_REQUEST: the request is well-formed and the STATE of the record refuses it.
      expect((thrown as { code?: string }).code).toBe('CONFLICT');
      const cause = (
        thrown as {
          cause?: {
            code?: string;
            message?: string;
            details?: { changed?: string[]; remedy?: string; remedyReachable?: boolean };
          };
        }
      ).cause;
      expect(cause?.code).toBe('DEED_TERM_WRITE_ONCE');
      // The COLUMNS, and only the columns that actually changed.
      expect(cause?.details?.changed).toEqual(['primaryNazir', 'successorNazir']);
      // The remedy, and the honest fact that it is not reachable yet (owed to E4).
      expect(cause?.details?.remedy).toBe('SUPERSEDING_RECORD');
      expect(cause?.details?.remedyReachable).toBe(false);
      // ⚠ NO VALUES IN THE MESSAGE. This row carries a named individual and the BR-109 criteria.
      expect(cause?.message).not.toContain('SOMEBODY ELSE');
      expect(cause?.message).not.toContain('A SUCCESSOR');
      // The ruling is cited, and both engineering renderings stay flagged in the refusal itself.
      expect(cause?.message).toContain('memo Q10');
      expect(cause?.message).toMatch(/can only be editted by a court judge/);
      expect(cause?.message).toMatch(/NOT REACHABLE IN THIS SCHEMA/i);
      expect(cause?.message).toMatch(/ENGINEERING'S and flagged for the owner/);
      // …and it says what IS recordable, so the refusal does not read as "BR-109 is impossible".
      expect(cause?.message).toMatch(/ELIGIBILITY VERIFICATION/);

      // ⚠ "REFUSED" AND "REFUSED BEFORE ANY WRITE" ARE DIFFERENT CLAIMS. The row — INCLUDING the
      // verification stamp, which this call would have advanced — is byte-identical.
      expect(await readDeed(OWNED_WAQF)).toEqual(before);
    });

    it('refuses it on a SEEDED appointment too, and leaves the fixture untouched', async () => {
      const before = await readDeed(SEEDED_WAQF);
      expect(before, 'waqf-001 has no appointment — the fixture is not seeded').not.toBeNull();
      const ctx = await contextFor({ userId: NAZIR, requestId: 'av502-seeded-fact' });

      let thrown: unknown;
      try {
        await createCaller(ctx).deed.upsert({
          waqfId: SEEDED_WAQF,
          primaryNazir: `REWRITTEN ${FICTIONAL_MARKER_AR}`,
          primaryAppointedDate: '2026-02-01T00:00:00.000Z',
          primaryAppointedDateHijri: '1447-08-13',
          // The seeded appointment DOES record a representative; dropping it is a deed-fact change too.
          authorizedRep: null,
          jointlyLiable: false,
          successorNazir: null,
          ...FIRST_ASSESSMENT,
        });
      } catch (error) {
        thrown = error;
      }

      expect((thrown as { code?: string }).code).toBe('CONFLICT');
      const changed = (thrown as { cause?: { details?: { changed?: string[] } } }).cause?.details
        ?.changed;
      expect(changed).toContain('primaryNazir');
      expect(changed).toContain('authorizedRepName');
      expect(changed).toContain('jointlyLiable');
      // The fixture is unchanged, stamp included — this file reads seeded rows and never writes them.
      expect(await readDeed(SEEDED_WAQF)).toEqual(before);
    });

    /* ═════════════════════════════════════════════════════════════════════════════════════════
     * 4 · the classification is ONE list, and the two copies are compared
     * ═════════════════════════════════════════════════════════════════════════════════════════ */

    it("the api's assessment classification EQUALS the database's, exactly", async () => {
      const prisma = await privilegedPrisma();
      const [row] = await prisma.$queryRawUnsafe<{ columns: string[] }[]>(
        `SELECT qmulate_trusteeship_deed_assessment_columns() AS columns`,
      );
      const fromDatabase = [...(row?.columns ?? [])].sort();
      expect(
        fromDatabase.length,
        'qmulate_trusteeship_deed_assessment_columns() returned nothing — migration 18 did not run, ' +
          'and this comparison would be vacuous',
      ).toBe(13);
      expect(fromDatabase).toEqual([...DEED_ELIGIBILITY_ASSESSMENT_COLUMNS].sort());
    });

    it('every classified column is a real column of trusteeship_deed, and no deed FACT is on the list', async () => {
      const prisma = await privilegedPrisma();
      const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'trusteeship_deed'`,
      );
      const names = new Set(columns.map((column) => column.column_name));
      expect(names.size, 'trusteeship_deed has no columns — the read failed').toBeGreaterThan(13);

      for (const column of DEED_ELIGIBILITY_ASSESSMENT_COLUMNS) {
        expect(
          names.has(column),
          `"${column}" is classified as an assessment column but does not exist on the table. A name ` +
            `that matches nothing does not fail loudly at runtime — it silently SEALS the real column, ` +
            `which is the AV5-02 regression itself.`,
        ).toBe(true);
      }

      // The mirror, and it is the assertion that stops this classification from becoming a way to
      // re-open the deed: not one fact of the appointment may appear on the allow-list.
      for (const fact of [
        'id',
        'waqfId',
        'primaryNazir',
        'primaryAppointedDate',
        'primaryAppointedDateHijri',
        'authorizedRepName',
        'authorizedRepScope',
        'authorizedRepAppointedDate',
        'authorizedRepAppointedDateHijri',
        'jointlyLiable',
        'successorNazir',
        'createdBy',
        'deletedAt',
      ]) {
        expect(
          (DEED_ELIGIBILITY_ASSESSMENT_COLUMNS as readonly string[]).includes(fact),
          `"${fact}" is a fact of the appointment (or its retirement) and the owner ruled a recorded ` +
            `trusteeship deed is not editable by any system seat (memo Q10). It must never be ` +
            `classified as QMULATE's assessment of the appointee.`,
        ).toBe(false);
      }
    });

    /* ═════════════════════════════════════════════════════════════════════════════════════════
     * 5 · the source pin — the UPDATE branch writes the ASSESSMENT ONLY
     * ═════════════════════════════════════════════════════════════════════════════════════════ */

    it('the UPDATE branch sends `data: assessment`, never the deed facts (the mutation this file pins)', () => {
      // A behavioural test cannot distinguish "sent the deed facts, identical" from "sent only the
      // assessment": both commit. The difference matters anyway — sending identical facts makes the
      // write depend on the api's comparison being exhaustive, while sending only the assessment makes
      // it structurally impossible to contradict a fact. So the shape is pinned in the source, the way
      // this suite pins the other structural claims it cannot observe from outside.
      const source = readSource('src/routers/deed.ts');
      expect(source).toContain(
        'await tx.trusteeshipDeed.update({ where: { id: existing.id }, data: assessment })',
      );
      // …and the pre-write refusal is not merely present but BEFORE `auditedWrite` opens.
      const check = source.indexOf('deedFactDifferences(existing, input)');
      const write = source.indexOf('return auditedWrite(ctx.db, async (tx) => {');
      expect(check, 'the deed-fact comparison is gone').toBeGreaterThan(-1);
      expect(write, 'the audited write is gone').toBeGreaterThan(-1);
      expect(
        check,
        'the deed-fact comparison happens INSIDE the audited write, so "refused before any write" ' +
          'becomes "written and rolled back" — a weaker claim than AC-E3-07 makes',
      ).toBeLessThan(write);
    });
  },
);
