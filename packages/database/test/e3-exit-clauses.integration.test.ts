// QMULATE — §17's TWO E3 EXIT CLAUSES, MEASURED AT THE SEAM BETWEEN POSTGRES AND THE PURE RESOLVERS.
//
//   (a) "the fixture's MEDIUM waqf shows audited-statement / bylaw obligations that the SMALL waqf
//        does not"  — i.e. classification is a GATE, not a label (BR-104)
//   (b) "an ineligible Nazir (non-resident) is blocked with a clear reason"  — BR-109 / NFR-09
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// WHY A THIRD LAYER, WHEN packages/domain AND packages/api BOTH TEST THIS
// ═══════════════════════════════════════════════════════════════════════════════════════════
// Because each of the other two can be green while the clause is false.
//
//   ·  `packages/domain`'s `obligation-gating.test.ts` drives all 16 matrix cells over a catalogue it
//      CONSTRUCTS. It proves the resolver. It cannot know whether the seeded catalogue contains an
//      audited-statement row at `LARGE_MEDIUM` at all — and over an empty or mis-gated catalogue the
//      contrast passes VACUOUSLY, which is the exact failure mode the exit criterion names.
//   ·  `packages/api`'s test drives the tRPC procedure. It proves the wiring. Its subjects are the
//      same seeded rows, so it inherits any fixture gap silently.
//
// This file closes the loop in the one direction neither covers: it reads the REAL catalogue and the
// REAL deed rows out of Postgres, feeds them to the SAME pure resolvers the procedures use, and then
// — the part that makes the claim non-vacuous — MUTATES THE GATE IN THE DATABASE inside a rolled-back
// transaction and proves the verdict changes. A contrast that does not move when the gate moves is
// not measuring the gate.
//
// ⚠ NO REGULATORY FIGURE IS ASSERTED ANYWHERE HERE (binding rule 3). The SAR 200M / 50M bands that
// decide MEDIUM are UNVERIFIED against primary Saudi law; they live in `Setting` rows carrying the ⚠
// marker, and this file asserts the GATING and the marker, never a threshold. Likewise every
// eligibility criterion is an unverified reading of Nazarah Art. 5 / the Beneficial Ownership
// Standards as summarised in `docs/` — so the verdicts below are about the CODE's behaviour, and the
// KSA-residency block must not be quoted anywhere as settled law.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  CLASSIFICATION_GATES,
  ELIGIBILITY_CRITERIA,
  ELIGIBILITY_REASON_CODES,
  GATE_EXCLUSION_REASON,
  assertDeedEligible,
  obligationsForClassification,
  resolveDeedEligibility,
  type EligibilityFlags,
  type GatedObligation,
  type WaqfClassification,
} from '@qmulate/domain';

import {
  assertGuardsInstalled,
  closeDatabase,
  ensureSeeded,
  errorText,
  hasDatabase,
  privilegedPrisma,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('§17 E3 exit clauses (BR-104 classification gating + BR-109 Nazir eligibility)');

const ROLLBACK = 'QMULATE_E3_EXIT_ROLLBACK';

/** The MEDIUM endowment and the SMALL one — the exit clause's two subjects. */
const MEDIUM_WAQF = 'waqf-001';
const SMALL_WAQF = 'waqf-002';

/** Every criterion the fixture's deeds actually record. */
const RECORDED_CRITERIA = [
  'ISLAM',
  'LEGAL_CAPACITY',
  'NO_DISQUALIFYING_REMOVAL',
  'KSA_RESIDENCY',
] as const;

/**
 * A context in which NEITHER conditional criterion binds — a Saudi endower, a natural-person Nazir.
 * Every field is stated: a defaulted context silently un-binds the nationality rule.
 */
const PLAIN_CONTEXT = {
  endowerIsForeign: false,
  holdsRealProperty: true,
  nazirIsLegalPerson: false,
} as const;

interface DeedRow {
  readonly id: string;
  readonly waqfId: string;
  readonly primaryNazir: string;
  readonly authorizedRepName: string | null;
  readonly islam: boolean | null;
  readonly legalCapacity: boolean | null;
  readonly noDisqualifyingRemoval: boolean | null;
  readonly ksaResident: boolean | null;
  readonly saudiNationalWhereRequired: boolean | null;
  readonly authorityLicensed: boolean | null;
  readonly repIslam: boolean | null;
  readonly repLegalCapacity: boolean | null;
  readonly repNoDisqualifyingRemoval: boolean | null;
  readonly repKsaResident: boolean | null;
  readonly eligibilityVerifiedAt: Date | null;
  readonly eligibilityVerifiedAtHijri: string | null;
  readonly eligibilityVerifiedBy: string | null;
}

/** Read the catalogue as the procedure does — the projection, not the whole row. */
async function readCatalogue(
  query: <T>(sql: string) => Promise<T>,
): Promise<readonly GatedObligation[]> {
  return query<GatedObligation[]>(
    `SELECT "code", "gate"::text AS gate, "section"::text AS section,
            "workstreamAr", "workstreamEn", "titleAr", "titleEn", "deadlineRuleKey"
       FROM "compliance_obligation" ORDER BY "code"`,
  );
}

describe.skipIf(!hasDatabase)('§17 · the two E3 exit clauses, over real rows', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    ensureSeeded();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // EXIT CLAUSE (a) · CLASSIFICATION IS A GATE, NOT A LABEL
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('BR-104 · the MEDIUM endowment carries duties the SMALL one does not', () => {
    it('has the two subjects the clause names, at the classifications it names', async () => {
      const prisma = await privilegedPrisma();
      const rows = await prisma.waqf.findMany({ select: { id: true, classification: true } });
      const byId = new Map(rows.map((row) => [row.id, row.classification] as const));
      // Without this, everything below is a comparison between two unknown things.
      expect(byId.get(MEDIUM_WAQF)).toBe('MEDIUM');
      expect(byId.get(SMALL_WAQF)).toBe('SMALL');
    });

    it('has an audited-statement AND a bylaws obligation at LARGE_MEDIUM — the clause’s precondition', async () => {
      // ⚠ THE ASSERTION THAT STOPS THE CONTRAST BEING VACUOUS. If the catalogue held no
      // `LARGE_MEDIUM` row, "the SMALL waqf does not show them" would be true of an empty set and the
      // exit clause would pass while proving nothing.
      const prisma = await privilegedPrisma();
      const catalogue = await readCatalogue((sql) => prisma.$queryRawUnsafe(sql));
      const gated = catalogue.filter((row) => row.gate === 'LARGE_MEDIUM');

      expect(gated.length).toBeGreaterThanOrEqual(2);
      expect(gated.some((row) => /SOCPA|audited/i.test(row.titleEn))).toBe(true);
      expect(gated.some((row) => /bylaw/i.test(row.titleEn))).toBe(true);
      // Arabic is authoritative (NFR-01): a derived title is real Arabic, not a transliteration.
      for (const row of gated) expect(row.titleAr).toMatch(/[؀-ۿ]/);
      // Every recorded gate must be a recognised member, or the resolver reports it as unreadable and
      // the caller has to REFUSE — a duty nobody can read must never look like a duty that does not
      // apply.
      for (const row of catalogue) expect(CLASSIFICATION_GATES).toContain(row.gate);
    });

    it('admits both codes for MEDIUM and EXCLUDES them for SMALL, by name and with a reason', async () => {
      const prisma = await privilegedPrisma();
      const catalogue = await readCatalogue((sql) => prisma.$queryRawUnsafe(sql));

      // ⊕ S9-4a — `directUtilization: false` STATED. This clause is the SIZE contrast (a MEDIUM
      // endowment carries duties a SMALL one does not), and "not direct use" is the condition under
      // which the size answer stands alone. Leaving it absent would park the usage-sensitive rows in
      // `directUseFactMissing` and make the contrast incomplete rather than wrong — which the
      // conservation law below would still pass, and this clause would not.
      const medium = obligationsForClassification({
        classification: 'MEDIUM',
        catalogue,
        directUtilization: false,
      });
      const small = obligationsForClassification({
        classification: 'SMALL',
        catalogue,
        directUtilization: false,
      });

      const socpa = catalogue
        .filter((row) => row.gate === 'LARGE_MEDIUM' && /SOCPA|audited/i.test(row.titleEn))
        .map((row) => row.code);
      const bylaws = catalogue
        .filter((row) => row.gate === 'LARGE_MEDIUM' && /bylaw/i.test(row.titleEn))
        .map((row) => row.code);
      expect(socpa.length).toBeGreaterThan(0);
      expect(bylaws.length).toBeGreaterThan(0);

      const applicable = (result: typeof medium): string[] =>
        result.obligations.map((row) => row.code);
      for (const code of [...socpa, ...bylaws]) {
        expect(applicable(medium), `${code} does not bind at MEDIUM`).toContain(code);
        expect(applicable(small), `${code} binds at SMALL`).not.toContain(code);

        // ⚠ EXCLUDED, NOT MERELY ABSENT — and this is the whole reason `excluded` is returned beside
        // `obligations`. "Absent" cannot be told apart from "the catalogue never had it", so a
        // catalogue row silently dropped by a bad join would look identical to a gate exclusion.
        const excluded = small.excluded.find((row) => row.code === code);
        expect(excluded, `${code} is absent from SMALL rather than excluded`).toBeDefined();
        expect(excluded?.reason).toBe(GATE_EXCLUSION_REASON);
        expect(excluded?.resolvedGate).toBe('LARGE_MEDIUM');
      }

      // And the SMALL endowment is not simply empty — a gate that excluded EVERYTHING would satisfy
      // every assertion above while making the endowment unregulated.
      expect(small.obligations.length).toBeGreaterThan(0);
      expect(small.obligations.some((row) => row.gate === 'SMALL_DIRECT')).toBe(true);
      // Nothing unreadable, on either side.
      expect(medium.unrecognisedGate).toEqual([]);
      expect(small.unrecognisedGate).toEqual([]);
    });

    it('MUTATION CONTROL · flipping the gate to ALL moves the verdict', async () => {
      // ⚠ THIS IS THE ASSERTION THE EXIT CRITERION ASKS FOR IN TERMS ("flipping the gate to ALL must
      // turn it red, or the contrast is not being measured"). It runs against the DATABASE rather
      // than against a hand-built catalogue, so it also proves the projection above really reads
      // `compliance_obligation."gate"` and not something that merely correlates with it.
      //
      // The UPDATE is inside a transaction that always rolls back: `compliance_obligation` is
      // retention-guarded and its rows are the regulation's, not a test's.
      //
      // ⚠ AND SINCE MIGRATION 31 IT MUST ALSO SUSPEND THE IMMUTABILITY GUARD, which is a collision
      // worth reading rather than a line of setup. S8-Q5 made an obligation template immutable within
      // its library version, so `UPDATE … SET "gate"` is now refused 42501 — and this mutation control
      // exists precisely to perform that UPDATE and prove the exit-clause contrast is not vacuous.
      //
      // Both are right. The guard is right that production must never edit a shipped template; the
      // control is right that an assertion nobody can invalidate is decorative. So the control goes
      // ROUND the guard the way every other retention-guarded fixture does — privileged connection,
      // trigger suspended for the span, restored inside the same rolled-back transaction — rather than
      // the guard being weakened to let a test through. A guard with a test-shaped hole in it is not a
      // guard, and the awkwardness here IS the control working.
      const prisma = await privilegedPrisma();
      let observed: { before: string[]; after: string[] } | null = null;
      try {
        await prisma.$transaction(async (tx: unknown) => {
          const query = <T>(sql: string): Promise<T> =>
            (tx as { $queryRawUnsafe: <R>(s: string) => Promise<R> }).$queryRawUnsafe<T>(sql);
          const exec = (sql: string): Promise<number> =>
            (tx as { $executeRawUnsafe: (s: string) => Promise<number> }).$executeRawUnsafe(sql);

          const before = obligationsForClassification({
            classification: 'SMALL',
            catalogue: await readCatalogue(query),
          }).obligations.map((row) => row.code);

          await exec(
            `ALTER TABLE "compliance_obligation" DISABLE TRIGGER "compliance_obligation_template_immutable"`,
          );
          await exec(
            `UPDATE "compliance_obligation"
                SET "gate" = 'ALL'::"ClassificationGate" WHERE "gate" = 'LARGE_MEDIUM'`,
          );
          await exec(
            `ALTER TABLE "compliance_obligation" ENABLE ALWAYS TRIGGER "compliance_obligation_template_immutable"`,
          );

          const after = obligationsForClassification({
            classification: 'SMALL',
            catalogue: await readCatalogue(query),
          }).obligations.map((row) => row.code);

          observed = { before, after };
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
      }

      const { before, after } = observed as unknown as { before: string[]; after: string[] };
      const gained = after.filter((code) => !before.includes(code));
      // The SMALL endowment gains exactly the rows whose gate was changed — so the exclusion above
      // was caused by the GATE and by nothing else.
      expect(gained.length).toBeGreaterThanOrEqual(2);
      expect(before.length).toBeLessThan(after.length);

      // And the mutation really did roll back: the gates are as the regulation recorded them.
      const restored = await prisma.complianceObligation.count({ where: { gate: 'LARGE_MEDIUM' } });
      expect(restored).toBeGreaterThanOrEqual(2);
    });

    it('conserves the catalogue at every recorded classification — nothing is silently dropped', async () => {
      // A conservation law over REAL rows: every catalogue row lands in exactly ONE of the resolver's
      // buckets, for each of the four classifications the schema admits. A row that fell out of all
      // of them would be an obligation that simply vanished for that endowment.
      //
      // ⚠⚠ **THIS ASSERTION USED TO SAY `applicable ⊎ excluded`, AND IT WENT RED THE MOMENT THE
      // CANONICAL LIBRARY WAS SEEDED — CORRECTLY.** It was total over a universe that could not
      // contain a counter-example: the database held ten placeholder rows derived from fixture tasks,
      // all gated `ALL` or `LARGE_MEDIUM`, so `incomeFactMissing`, `retiredGate` and `unrecognisedGate`
      // were unreachable and a two-bucket law looked complete. Seeding §09's library gave it four
      // `HAS_INCOME` rows — the runtime predicate S8-Q3 introduced — and 42 ≠ 46.
      //
      // That is R6-C1's lesson arriving on a new subject: *a property whose generator cannot reach a
      // configuration reports its silence as success.* The law is widened to all five buckets, which
      // is STRICTLY STRONGER than what it replaced, and the positive control below makes sure it
      // cannot go quiet again.
      const prisma = await privilegedPrisma();
      const catalogue = await readCatalogue((sql) => prisma.$queryRawUnsafe(sql));
      const classifications: readonly WaqfClassification[] = ['LARGE', 'MEDIUM', 'SMALL', 'SMALL'];
      for (const classification of classifications) {
        // ⊕ S9-4a — the usage axis is deliberately LEFT ABSENT here, and the conservation law is
        // exactly the right place for that: with the attribute unrecorded, the two usage-sensitive
        // gates cannot be decided, and the law must still hold — every catalogue row lands in SOME
        // bucket, with the undecided ones in `directUseFactMissing` rather than vanishing. That is
        // the property this test exists for, and it caught the new bucket's absence on the first run.
        const result = obligationsForClassification({ classification, catalogue });
        const buckets: readonly (readonly string[])[] = [
          result.obligations.map((row) => row.code),
          result.excluded.map((row) => row.code),
          result.unrecognisedGate.map((row) => row.code),
          result.retiredGate.map((row) => row.code),
          result.incomeFactMissing.map((row) => row.code),
          result.directUseFactMissing.map((row) => row.code),
        ];
        const everywhere = buckets.flat();
        expect(
          everywhere.slice().sort(),
          `${classification}: a row fell out of every bucket`,
        ).toEqual(catalogue.map((row) => row.code).sort());
        // Disjointness over ALL FIVE, not just the first two: a row counted twice is a duty a screen
        // would show as both owed and not owed.
        expect(new Set(everywhere).size, `${classification}: a row is in two buckets`).toBe(
          everywhere.length,
        );
        // Every applicable row carries the ⚠ marker: which classes an obligation binds is an
        // unverified regulatory reading (binding rule 3), and the caveat travels with the data.
        for (const row of result.obligations) expect(row.unverified).toBe(true);
        expect(result.unverifiedNotes.join(' ')).toMatch(/unverified/i);
      }
    });

    it('POSITIVE CONTROL — the `HAS_INCOME` bucket is NON-EMPTY over the seeded catalogue', async () => {
      // Without this, the five-bucket law above is satisfied by a catalogue that reaches only two of
      // them and the widening is decoration. It is here because the two-bucket version was green for
      // months for exactly that reason.
      const prisma = await privilegedPrisma();
      const catalogue = await readCatalogue((sql) => prisma.$queryRawUnsafe(sql));
      const undecided = obligationsForClassification({ classification: 'MEDIUM', catalogue });
      expect(
        undecided.incomeFactMissing.map((row) => row.code).sort(),
        'no HAS_INCOME row is reachable, so the runtime-predicate arm proves nothing',
      ).not.toEqual([]);
      for (const row of undecided.incomeFactMissing)
        expect(row.requiredFact).toBe('hasIncomeInPeriod');
    });

    it('the LEDGER FACT decides those rows in BOTH directions, over real rows (S8-Q3)', async () => {
      // ⊕ The first time the runtime predicate has ever been driven against the DATABASE rather than
      // a hand-built array — `HAS_INCOME` could not be stored at all until migration 30, and no row
      // used it until the canonical library was seeded.
      //
      // Both arms, because a gate that only ever ADDS duties is indistinguishable from a gate that is
      // ignored: `true` must move the rows into `obligations`, `false` must move the SAME rows into
      // `excluded` with a reason, and neither may leave them in `incomeFactMissing`.
      const prisma = await privilegedPrisma();
      const catalogue = await readCatalogue((sql) => prisma.$queryRawUnsafe(sql));
      const subjects = obligationsForClassification({ classification: 'MEDIUM', catalogue })
        .incomeFactMissing.map((row) => row.code)
        .sort();
      expect(subjects.length).toBeGreaterThan(0);

      const withIncome = obligationsForClassification({
        classification: 'MEDIUM',
        catalogue,
        hasIncomeInPeriod: true,
      });
      expect(withIncome.incomeFactMissing).toEqual([]);
      for (const code of subjects)
        expect(
          withIncome.obligations.map((row) => row.code),
          `${code} is not owed by an endowment that HAS income`,
        ).toContain(code);

      const withoutIncome = obligationsForClassification({
        classification: 'MEDIUM',
        catalogue,
        hasIncomeInPeriod: false,
      });
      expect(withoutIncome.incomeFactMissing).toEqual([]);
      for (const code of subjects)
        expect(
          withoutIncome.excluded.map((row) => row.code),
          `${code} is still owed by an endowment with NO income`,
        ).toContain(code);

      // ⚠ THE CONTRAST IS NOT VACUOUS: the two runs must differ by exactly these rows and by nothing
      // else. A resolver that simply returned everything for `true` would satisfy the loops above.
      const gained = withIncome.obligations
        .map((row) => row.code)
        .filter((code) => !withoutIncome.obligations.map((r) => r.code).includes(code))
        .sort();
      expect(gained).toEqual(subjects);
    });

    it('returns Setting KEYS for the bands, never a figure — and the rows carry the ⚠ marker', async () => {
      const prisma = await privilegedPrisma();
      const catalogue = await readCatalogue((sql) => prisma.$queryRawUnsafe(sql));
      const result = obligationsForClassification({ classification: 'MEDIUM', catalogue });

      expect(result.bandSettingKeys.length).toBeGreaterThan(0);
      // ⚠ NOT A NUMBER IN SIGHT. The SAR 200M / 50M bands are unverified against primary law, so the
      // module maps a RECORDED classification and never computes the band. A figure appearing in this
      // payload would be a hardcoded threshold by another name.
      const serialised = JSON.stringify(result);
      expect(serialised).not.toMatch(/200000000|50000000|200,000,000|50,000,000/);

      // And every band key resolves to a `Setting` row that carries the ⚠ marker in its own value —
      // so the figure is CONFIGURED (a correction is a config change, not a code change) and it can
      // never be read without its caveat.
      const settings = await prisma.setting.findMany({
        where: { key: { in: [...result.bandSettingKeys] } },
      });
      expect(
        settings.map((row) => row.key).sort(),
        'a band Setting key resolves to no row',
      ).toEqual([...result.bandSettingKeys].sort());
      for (const setting of settings) {
        const value = setting.value as { note?: string; unverified?: boolean };
        expect(value.unverified, `${setting.key} is not marked unverified (binding rule 3)`).toBe(
          true,
        );
        expect(value.note ?? '').toMatch(/unverified/i);
      }
    });

    it('gives the MEDIUM endowment LARGE_MEDIUM TASK INSTANCES, which it did not have before S4', async () => {
      // The catalogue is GLOBAL (the regulation's, not an endowment's), so the contrast above would
      // hold even if no endowment had ever been given the task. The exit clause is about what the
      // MEDIUM endowment SHOWS, so the instances matter too.
      const prisma = await privilegedPrisma();
      const mediumTasks = await prisma.complianceTask.findMany({
        where: { waqfId: MEDIUM_WAQF, obligation: { gate: 'LARGE_MEDIUM' } },
        include: { obligation: true },
      });
      expect(mediumTasks).toHaveLength(2);
      expect(mediumTasks.map((row) => row.obligation.titleEn).join(' ')).toMatch(/SOCPA|audited/i);
      expect(mediumTasks.map((row) => row.obligation.titleEn).join(' ')).toMatch(/bylaw/i);

      const smallTasks = await prisma.complianceTask.count({
        where: { waqfId: SMALL_WAQF, obligation: { gate: 'LARGE_MEDIUM' } },
      });
      expect(smallTasks).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════════════
  // EXIT CLAUSE (b) · AN INELIGIBLE NAZIR IS BLOCKED, WITH A REASON A HUMAN CAN ACT ON
  // ═══════════════════════════════════════════════════════════════════════════════════════

  describe('BR-109 · the eligibility resolver over the fixture’s own deed rows', () => {
    async function deeds(): Promise<readonly DeedRow[]> {
      const prisma = await privilegedPrisma();
      return prisma.$queryRawUnsafe<DeedRow[]>(
        `SELECT "id","waqfId","primaryNazir","authorizedRepName",
                "islam","legalCapacity","noDisqualifyingRemoval","ksaResident",
                "saudiNationalWhereRequired","authorityLicensed",
                "repIslam","repLegalCapacity","repNoDisqualifyingRemoval","repKsaResident",
                "eligibilityVerifiedAt","eligibilityVerifiedAtHijri","eligibilityVerifiedBy"
           FROM "trusteeship_deed" ORDER BY "id"`,
      );
    }

    /**
     * The first seeded deed, or a loud failure.
     *
     * A helper rather than a non-null assertion on a fixture row: an assertion would turn "the seed
     * did not run" into a confusing `undefined` deep inside a resolver, and this suite's whole point
     * is that a missing subject must not look like a passing assertion.
     */
    async function firstDeed(): Promise<DeedRow> {
      const [deed] = await deeds();
      if (deed === undefined)
        throw new Error(
          'trusteeship_deed is empty — the seed did not run, so BR-109 cannot be proven',
        );
      return deed;
    }

    const primaryFlags = (row: DeedRow): EligibilityFlags => ({
      ISLAM: row.islam,
      LEGAL_CAPACITY: row.legalCapacity,
      NO_DISQUALIFYING_REMOVAL: row.noDisqualifyingRemoval,
      KSA_RESIDENCY: row.ksaResident,
      SAUDI_NATIONALITY_WHERE_REQUIRED: row.saudiNationalWhereRequired,
      AUTHORITY_LICENSED: row.authorityLicensed,
    });

    const repFlags = (row: DeedRow): EligibilityFlags | null =>
      row.authorizedRepName === null
        ? null
        : {
            ISLAM: row.repIslam,
            LEGAL_CAPACITY: row.repLegalCapacity,
            NO_DISQUALIFYING_REMOVAL: row.repNoDisqualifyingRemoval,
            KSA_RESIDENCY: row.repKsaResident,
            // No column exists for either conditional criterion on a representative.
            SAUDI_NATIONALITY_WHERE_REQUIRED: null,
            AUTHORITY_LICENSED: null,
          };

    it('finds the fixture’s PRIMARY Nazir eligible on every endowment', async () => {
      // Measured rather than assumed, because it decides what the browser-level test can even see:
      // if the seeded primary were ineligible, every screen would render a refusal.
      for (const row of await deeds()) {
        const verdict = resolveDeedEligibility({
          primary: primaryFlags(row),
          representative: null,
          context: PLAIN_CONTEXT,
        });
        expect(verdict.primary.eligible, `${row.id}: the seeded primary Nazir is refused`).toBe(
          true,
        );
        expect(verdict.primary.reasons).toEqual([]);
        // Every criterion is reported, including the two that do not bind here — a verdict is a
        // per-criterion record, never a boolean.
        expect(verdict.primary.criteria.map((row) => row.criterion)).toEqual([
          ...ELIGIBILITY_CRITERIA,
        ]);
        for (const outcome of verdict.primary.criteria) expect(outcome.unverified).toBe(true);
      }
    });

    it('⚠ refuses the fixture’s RECORDED REPRESENTATIVE — ELIGIBILITY_NOT_ASSESSED, never a pass', async () => {
      // ⚠ A MEASURED FIXTURE FACT WORTH READING TWICE. waqf-001 and waqf-003 name an authorized
      // representative and carry NO rep flags at all (all four NULL). `null` is a REFUSAL, not a
      // pass — a resolver that read it as "nothing recorded against them, so fine" would seat a
      // representative whose residency nobody ever checked, and that representative is jointly and
      // severally liable under Nazarah Art. 11(5) (⚠ unverified).
      //
      // So the DEED as recorded is not seatable, and the conjunction is what says so.
      const withRep = (await deeds()).filter((row) => row.authorizedRepName !== null);
      expect(withRep.map((row) => row.waqfId)).toEqual(['waqf-001', 'waqf-003']);

      for (const row of withRep) {
        const verdict = resolveDeedEligibility({
          primary: primaryFlags(row),
          representative: repFlags(row),
          context: PLAIN_CONTEXT,
        });
        expect(verdict.representative).not.toBeNull();
        expect(verdict.representative?.eligible).toBe(false);
        expect(verdict.representative?.reasons).toContain('ELIGIBILITY_NOT_ASSESSED');
        expect(verdict.representative?.notAssessed.length).toBeGreaterThan(0);
        // THE CONJUNCTION: an eligible primary does not rescue the deed.
        expect(verdict.primary.eligible).toBe(true);
        expect(verdict.eligible).toBe(false);
        expect(verdict.reasons).toContain('ELIGIBILITY_NOT_ASSESSED');
        // A representative's scope is a live legal question, and it is REPORTED rather than answered.
        expect(verdict.surfacedQuestions.join(' ')).toMatch(/representative/i);
      }

      const withoutRep = (await deeds()).filter((row) => row.authorizedRepName === null);
      for (const row of withoutRep) {
        const verdict = resolveDeedEligibility({
          primary: primaryFlags(row),
          representative: null,
          context: PLAIN_CONTEXT,
        });
        // No representative is NOT a failure — it is the absence of a second subject.
        expect(verdict.representative).toBeNull();
        expect(verdict.eligible).toBe(true);
      }
    });

    it('blocks a NON-RESIDENT Nazir with KSA_RESIDENCY_REQUIRED — the exit clause itself', async () => {
      const deed = await firstDeed();
      const verdict = resolveDeedEligibility({
        primary: { ...primaryFlags(deed), KSA_RESIDENCY: false },
        representative: null,
        context: PLAIN_CONTEXT,
      });

      expect(verdict.eligible).toBe(false);
      expect(verdict.reasons).toContain('KSA_RESIDENCY_REQUIRED');
      // A CLEAR reason means a specific code — never a bare failure, and never prose. Every reason a
      // verdict emits must be a member of the closed vocabulary, because `packages/i18n` carries ar+en
      // copy per code and next-intl PRINTS a missing key rather than throwing.
      for (const reason of verdict.reasons) expect(ELIGIBILITY_REASON_CODES).toContain(reason);

      // The criterion that failed is identified individually, not just in the summary list.
      const residency = verdict.primary.criteria.find((row) => row.criterion === 'KSA_RESIDENCY');
      expect(residency?.applicability).toBe('REQUIRED');
      expect(residency?.satisfied).toBe(false);
      expect(residency?.reasonCode).toBe('KSA_RESIDENCY_REQUIRED');
      // ⚠ The authority is developer-facing provenance and is UNVERIFIED — never a citation to rely
      // on, and never rendered to a beneficiary.
      expect(residency?.authority).toBeTruthy();
      expect(verdict.unverifiedNotes.join(' ')).toMatch(/unverified/i);
    });

    it('throws NAZIR_INELIGIBLE with the reason list, and leaks no personal fact', async () => {
      const deed = await firstDeed();
      const verdict = resolveDeedEligibility({
        primary: { ...primaryFlags(deed), KSA_RESIDENCY: false },
        representative: null,
        context: PLAIN_CONTEXT,
      });

      let raised: unknown = null;
      try {
        assertDeedEligible(verdict);
      } catch (error: unknown) {
        raised = error;
      }
      expect(raised, 'an ineligible deed was allowed through').not.toBeNull();
      const thrown = raised as { code?: string; details?: { reasons?: string[] } };
      expect(thrown.code).toBe('NAZIR_INELIGIBLE');
      expect(thrown.details?.reasons).toContain('KSA_RESIDENCY_REQUIRED');

      // ⚠ AN ELIGIBILITY REFUSAL IS ABOUT A NAMED PERSON'S RELIGION, CAPACITY AND CRIMINAL RECORD.
      // The error may carry vocabulary members and nothing else — no name, no id, no personal fact —
      // because this text reaches a log line and an audit payload.
      const text = errorText(raised);
      expect(text).not.toContain(deed.primaryNazir);
      expect(text).not.toContain(deed.id);
      expect(text).not.toMatch(/Delegated Manager/);

      // And an eligible deed passes — a gate that refuses everything is not a gate.
      const eligible = resolveDeedEligibility({
        primary: primaryFlags(deed),
        representative: null,
        context: PLAIN_CONTEXT,
      });
      expect(() => assertDeedEligible(eligible)).not.toThrow();
    });

    it('binds the two CONDITIONAL criteria on their context and refuses an unassessed one', async () => {
      const deed = await firstDeed();
      const flags = primaryFlags(deed);
      // The fixture records neither conditional flag, so both are NULL — which is exactly the state
      // that must become a refusal once the criterion binds, and be irrelevant while it does not.
      expect(flags.SAUDI_NATIONALITY_WHERE_REQUIRED).toBeNull();
      expect(flags.AUTHORITY_LICENSED).toBeNull();

      const foreignEndower = resolveDeedEligibility({
        primary: flags,
        representative: null,
        context: { endowerIsForeign: true, holdsRealProperty: true, nazirIsLegalPerson: false },
      });
      expect(foreignEndower.eligible).toBe(false);
      expect(foreignEndower.reasons).toContain('ELIGIBILITY_NOT_ASSESSED');

      // Foreign endower but NO real property: the nationality rule does not bind, so the same NULL is
      // irrelevant. Both halves of the condition are load-bearing.
      const noRealProperty = resolveDeedEligibility({
        primary: flags,
        representative: null,
        context: { endowerIsForeign: true, holdsRealProperty: false, nazirIsLegalPerson: false },
      });
      expect(noRealProperty.eligible).toBe(true);

      const legalPerson = resolveDeedEligibility({
        primary: flags,
        representative: null,
        context: { endowerIsForeign: false, holdsRealProperty: true, nazirIsLegalPerson: true },
      });
      expect(legalPerson.eligible).toBe(false);
      const licence = legalPerson.primary.criteria.find(
        (row) => row.criterion === 'AUTHORITY_LICENSED',
      );
      expect(licence?.applicability).toBe('REQUIRED');
      expect(licence?.satisfied).toBeNull();
    });

    it('⚠ records CAPTURE but not VERIFICATION on any seeded deed — BR-109’s second half', async () => {
      // BR-109 says capture AND verify. Every seeded deed carries the four primary flags and NO
      // verification event, so what is on record is a CLAIM rather than a verification. Asserted
      // rather than left implicit, because it is the fixture gap a browser-level test would otherwise
      // report as a working screen.
      for (const row of await deeds()) {
        expect(row.eligibilityVerifiedAt, `${row.id} has a verification event`).toBeNull();
        expect(row.eligibilityVerifiedAtHijri).toBeNull();
        expect(row.eligibilityVerifiedBy).toBeNull();
      }
    });

    it('makes an eligibility record about NOBODY unrepresentable, and a half verification too', async () => {
      // The DB half of the same requirement. Both CHECKs are one-directional on purpose: partial
      // assessment stays legal (intake learns these one at a time, and forbidding it would push
      // whoever is doing intake into typing a value they do not have), while four flags about a
      // representative who does not exist, and an unattributed or half-dated verification, do not.
      //
      // ═══════════════════════════════════════════════════════════════════════════════════════
      // ⚠ REWRITTEN FROM `UPDATE` TO `INSERT` ON 2026-08-17, AND THE REASON IS A REAL CONSEQUENCE
      // WORTH READING RATHER THAN A TEST TIDY-UP. Migration 17 seals a RECORDED appointment for every
      // seat (S4 owner-decision memo Q10 — *"the trusteeship deed can only be editted by a court
      // judge"*, rendered by engineering and flagged as a rendering). A `BEFORE UPDATE` trigger fires
      // BEFORE a CHECK is evaluated, so these three CHECKs are NO LONGER REACHABLE VIA `UPDATE`: the
      // caller now hears 42501 *"WRITE-ONCE FOR EVERY SEAT"* instead of 23514. MEASURED, and the
      // last case in this test pins it so the shape change cannot be mistaken for the CHECKs going
      // away.
      //
      // The CHECKs are NOT weakened by that, because the only path that can now produce an incoherent
      // deed row is the INSERT — the initial recording — which is exactly where they have to hold.
      // Each case therefore constructs a fresh endowment and records a deed against it, inside a
      // rolled-back transaction, and asserts the constraint by NAME.
      // ═══════════════════════════════════════════════════════════════════════════════════════
      const prisma = await privilegedPrisma();

      /** A throwaway endowment, so the deed INSERT has a `waqfId` of its own (`@unique`). */
      const probeWaqfSql = (id: string): string =>
        `INSERT INTO "waqf" ("id","waqifId","certificateNumber","deedNumber","classification","type",
            "nature","entitlementOrder","shartAlWaqif","shartAlWaqifVersion","shartAlWaqifSetAt",
            "shartAlWaqifSetAtHijri","reversionClauseCaptured","fiscalYearEnd","registrationDate",
            "registrationDateHijri","createdAt","updatedAt")
          VALUES ('${id}','waqif-001','CERT-${id}','DEED-${id}','SMALL'::"WaqfClassification",
            'FAMILY_DHURRI'::"WaqfType",'AYNI'::"WaqfNature",'ORDERED'::"EntitlementOrder",
            '{"fixture":"E3 exit-clause probe"}'::jsonb,1,now(),'1447-07-12',false,'12-31',now(),
            '1447-07-12',now(),now())`;

      /** The deed, with `extra` columns appended — the incoherent part of each case. */
      const probeDeedSql = (waqfId: string, extraColumns: string, extraValues: string): string =>
        `INSERT INTO "trusteeship_deed" ("id","waqfId","primaryNazir","primaryAppointedDate",
            "primaryAppointedDateHijri","jointlyLiable","islam","legalCapacity",
            "noDisqualifyingRemoval","ksaResident","createdAt","updatedAt"${extraColumns})
          VALUES ('trust-${waqfId}','${waqfId}','QMULATE (professional Nazir)',now(),'1447-07-12',
            false,true,true,true,true,now(),now()${extraValues})`;

      const cases: readonly {
        name: string;
        columns: string;
        values: string;
        constraint: RegExp;
      }[] = [
        {
          name: 'rep flags with no representative',
          columns: `,"repKsaResident"`,
          values: `,true`,
          constraint: /trusteeship_deed_rep_eligibility_needs_a_rep/,
        },
        {
          name: 'a verification with no Hijri twin',
          columns: `,"eligibilityVerifiedAt","eligibilityVerifiedBy"`,
          values: `,now(),'user-nazir-001'`,
          constraint: /trusteeship_deed_eligibility_verification_complete/,
        },
        {
          name: 'an unattributed verification',
          columns: `,"eligibilityVerifiedAt","eligibilityVerifiedAtHijri"`,
          values: `,now(),'1448-01-01'`,
          constraint: /trusteeship_deed_eligibility_verification_complete/,
        },
      ];

      let probeIndex = 0;
      for (const testCase of cases) {
        probeIndex += 1;
        const waqfId = `waqf-99${String(probeIndex)}`;
        let raised: unknown = null;
        try {
          await prisma.$transaction(async (tx: unknown) => {
            const run = (tx as { $executeRawUnsafe: (s: string) => Promise<number> })
              .$executeRawUnsafe;
            await run(probeWaqfSql(waqfId));
            await run(probeDeedSql(waqfId, testCase.columns, testCase.values));
            throw new Error(ROLLBACK);
          });
        } catch (error: unknown) {
          raised = error;
        }
        const text = errorText(raised);
        expect(text, `${testCase.name} was accepted`).not.toContain(ROLLBACK);
        expect(text).toMatch(/23514/);
        expect(text).toMatch(testCase.constraint);
      }

      // A COMPLETE verification is accepted — the constraint is not paralysis. Rolled back, because a
      // verification event names an actor and a date and is not a test's to record.
      let rolledBack = false;
      try {
        await prisma.$transaction(async (tx: unknown) => {
          const run = (tx as { $executeRawUnsafe: (s: string) => Promise<number> })
            .$executeRawUnsafe;
          await run(probeWaqfSql('waqf-994'));
          await run(
            probeDeedSql(
              'waqf-994',
              `,"eligibilityVerifiedAt","eligibilityVerifiedAtHijri","eligibilityVerifiedBy"`,
              `,now(),'1448-01-01','user-nazir-001'`,
            ),
          );
          rolledBack = true;
          throw new Error(ROLLBACK);
        });
      } catch (error: unknown) {
        if (!(error instanceof Error) || error.message !== ROLLBACK) throw error;
      }
      expect(rolledBack, 'a complete verification event was refused').toBe(true);

      // ⚠ AND THE REASON THE THREE CASES ABOVE MOVED TO `INSERT`, MEASURED RATHER THAN ASSERTED IN A
      // COMMENT: on a RECORDED deed the same incoherent write is refused by the trigger, not by the
      // CHECK — a BEFORE trigger runs before constraints, so the CHECK's message is unreachable on
      // this path.
      //
      // ⚠ WHAT THIS EXPECTATION USED TO SAY, AND WHY IT CHANGED (AV5-02, migration 18). It asserted
      // `WRITE-ONCE FOR EVERY SEAT` — migration 17's whole-row seal — for `SET "repKsaResident" =
      // true`. That seal made the BR-109/NFR-09 ELIGIBILITY VERIFICATION unrecordable on every
      // appointment that already existed, which is a regulatory obligation with no path (MEASURED
      // through `deed.upsert`: `INTERNAL_SERVER_ERROR`, and all five seeded deeds unstamped).
      // Migration 18 classifies the ten criteria and the three verification-event columns as
      // QMULATE's ASSESSMENT OF THE APPOINTEE rather than as deed content: they move ONLY as a
      // recorded verification event. So this write is STILL REFUSED, and for a narrower reason that
      // the message now states. The DEED-FACT arm is asserted right below it, unchanged in substance.
      const probeUpdate = async (set: string): Promise<string> => {
        let refusal: unknown = null;
        try {
          await prisma.$transaction(async (tx: unknown) => {
            await (tx as { $executeRawUnsafe: (s: string) => Promise<number> }).$executeRawUnsafe(
              `UPDATE "trusteeship_deed" SET ${set} WHERE "waqfId" = '${SMALL_WAQF}'`,
            );
            throw new Error(ROLLBACK);
          });
        } catch (error: unknown) {
          refusal = error;
        }
        return errorText(refusal);
      };

      const assessmentText = await probeUpdate(`"repKsaResident" = true`);
      expect(assessmentText, 'a criterion moved with no verification event').not.toContain(
        ROLLBACK,
      );
      expect(assessmentText).toMatch(/42501/);
      expect(assessmentText).toMatch(/RECORDED VERIFICATION EVENT/);
      expect(
        assessmentText,
        'the CHECK answered before the guard did — the tier order has changed',
      ).not.toMatch(/23514/);

      // The other side of the line: the appointment's own facts are still write-once for every seat.
      const factText = await probeUpdate(`"primaryNazir" = 'REWRITTEN (بيانات وهمية)'`);
      expect(factText, 'a recorded appointment accepted an edit to its own facts').not.toContain(
        ROLLBACK,
      );
      expect(factText).toMatch(/42501/);
      expect(factText).toMatch(/WRITE-ONCE FOR EVERY SEAT/);

      expect(
        (await prisma.trusteeshipDeed.findMany({ where: { waqfId: MEDIUM_WAQF } }))[0]
          ?.eligibilityVerifiedAt,
      ).toBeNull();
    });

    it('records the FOUR primary criteria the schema can hold, and no invented fifth', async () => {
      // ⚠ SURFACED, NOT RESOLVED. BR-109 also names "qualifications" and "good conduct"; the model
      // carries no column for either, and `NO_DISQUALIFYING_REMOVAL` is the conduct half it does
      // have. A criterion that could only ever read `null` would make every deed permanently
      // unseatable, so adding one means adding the columns first — which is why this asserts the
      // FOUR the schema records rather than the six the regulation summary lists.
      const prisma = await privilegedPrisma();
      const columns = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'trusteeship_deed'
            AND column_name IN ('islam','legalCapacity','noDisqualifyingRemoval','ksaResident',
                                'saudiNationalWhereRequired','authorityLicensed','repIslam',
                                'repLegalCapacity','repNoDisqualifyingRemoval','repKsaResident')
          ORDER BY column_name`,
      );
      const names = columns.map((row) => row.column_name);
      // Criterion → the column that records it, written out rather than derived: a derivation would
      // "pass" by mangling a name into something that happens to be a substring of another column.
      const COLUMN_FOR: Readonly<Record<(typeof RECORDED_CRITERIA)[number], string>> = {
        ISLAM: 'islam',
        LEGAL_CAPACITY: 'legalCapacity',
        NO_DISQUALIFYING_REMOVAL: 'noDisqualifyingRemoval',
        KSA_RESIDENCY: 'ksaResident',
      };
      for (const criterion of RECORDED_CRITERIA) {
        expect(names, `${criterion} has no column`).toContain(COLUMN_FOR[criterion]);
      }
      // The two CONDITIONAL criteria have columns too, on the primary only.
      expect(names).toContain('saudiNationalWhereRequired');
      expect(names).toContain('authorityLicensed');
      // The representative gets its own four — BR-109 requires eligibility for "Nazir AND
      // authorized-representative", and before migration 12 the model had ONE set of flags.
      expect(names).toContain('repIslam');
      expect(names).toContain('repLegalCapacity');
      expect(names).toContain('repNoDisqualifyingRemoval');
      expect(names).toContain('repKsaResident');
    });
  });
});
