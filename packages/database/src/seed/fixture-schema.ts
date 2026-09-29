// QMULATE — zod contract for `data/fixtures/sample-waqf.json`.
//
// TWO JOBS, deliberately separated:
//
//   1. SHAPE (`fixtureSchema`)   — a STRICT zod schema. Every object rejects unknown keys, so a
//      field added to, renamed in, or dropped from the fixture fails the seed loudly instead of
//      silently half-seeding a database that the E1 exit counts then disagree with.
//
//   2. PROVENANCE (`assertFixtureMarkers`) — the content assertions that make the residency
//      guardrail's layer 2 meaningful (G-8 / assertion B5). Shape alone cannot tell fictional
//      data from real data; these checks can, because the fixture commits to conventions that
//      real data would never satisfy:
//        • a `_readme` that says the data is "Entirely fictional"
//        • every record id matches `^(client|waqif|waqf|asset|exp-e|exp|ben|rev|dist|fee|task|gov)-\d+$`
//        • every external reference (certificate, deed, title deed, bank account, IBAN, national
//          id, invoice, transfer ref) is prefixed `FAKE-`
//        • every email address ends `@example.test`
//      A real family's file would fail all four. That is the point: the seed refuses to load it.
//
// CONFIDENTIALITY: this module never reads, references, or falls back to anything under
// `archive/raw-intake/`. The only permitted input is the fixture — see `../guardrail.ts`.

import { z } from 'zod';
import { SeedRefusedError } from '../guardrail.js';

// ── primitives ────────────────────────────────────────────────────────────────────────────

/** Bare calendar date, no time, no zone — parsed at UTC midnight by `./hijri.ts`. */
const fixtureDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected a YYYY-MM-DD calendar date');

/**
 * Money as it appears in the fixture: a JSON number.
 *
 * JS `number` IS BANNED FOR MONEY everywhere else in this codebase (§17 DoD). This is the single
 * permitted boundary: the JSON file has no decimal type, so the value arrives as a number, is
 * validated here to be exactly representable at 2 decimal places, and is converted to a fixed-scale
 * decimal STRING by `money()` in `./map.ts` before it ever reaches Prisma. No arithmetic is ever
 * performed on it as a number.
 */
const fixtureMoney = z
  .number()
  .finite()
  .nonnegative()
  .refine(
    (n) =>
      Number.isSafeInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6,
    'money must be exactly representable at 2 decimal places',
  );

/** A percentage as the fixture writes it (0–100), not a 0–1 rate. */
const fixturePercent = z.number().finite().min(0).max(100);

/**
 * A DEED WEIGHT, as a fixed-scale decimal STRING — never a JS number.
 *
 * ⚠ NOT MONEY AND NOT `sharePercent`. §08 treats a deed weight as RELATIVE, renormalised over the
 * ENTITLED cohort, which is why waqf-001's three `12.5`s legitimately sum to 37.5. A weight is a
 * string here for the same reason money is: JSON has no decimal type, and `packages/domain` allows a
 * weight up to 18 decimal places (`MAX_WEIGHT_DECIMAL_PLACES`), which a double cannot carry.
 */
const fixtureWeight = z
  .string()
  .regex(/^\d+(\.\d{1,18})?$/, 'a stipulated weight must be a non-negative decimal string');

// ── record schemas ────────────────────────────────────────────────────────────────────────

const clientSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1),
    familyBoardContact: z.string().email(),
  })
  .strict();

const waqifSchema = z
  .object({
    id: z.string(),
    clientId: z.string(),
    name: z.string().min(1),
  })
  .strict();

const trusteeshipPrimarySchema = z
  .object({
    nazir: z.string().min(1),
    appointedDate: fixtureDate,
  })
  .strict();

const trusteeshipRepSchema = z
  .object({
    name: z.string().min(1),
    appointedDate: fixtureDate,
    scope: z.string().min(1),
    jointlyLiable: z.boolean(),
  })
  .strict();

/**
 * The deed's maintenance (ṣiyāna) rule — S5/E4, FIXTURE_DELTA_REQUIRED.
 *
 * ⚠ A RULE, NOT AN EXPENSE (MAINTENANCE_RULE_IS_NOT_AN_EXPENSE): `exp-e-001` is a PAID maintenance
 * cost; this is what the deed STIPULATES be reserved first. The engine takes the rule and the
 * actuals separately and never derives one from the other. `null` on the WAQF KEY means the deed
 * is silent (or, on the intake-state endowment, unread) — a recorded fact, never a default.
 */
const maintenanceRuleSchema = z.discriminatedUnion('basis', [
  z.object({ basis: z.literal('fixed'), amountSar: fixtureMoney }).strict(),
  z.object({ basis: z.literal('percent_of_revenue'), percent: fixturePercent }).strict(),
  /** The deed POSITIVELY stipulates no reserve — a statement, distinct from a null (silent). */
  z.object({ basis: z.literal('none') }).strict(),
]);

/**
 * The deed's Nazir-fee basis — S5/E4. ⚠ unverified — confirm vs primary law (the 10% ʿushr is
 * this engagement's deed, not a statutory rate). `null` = THE DEED IS SILENT, which is itself a
 * recorded fact: it is what makes `AUTHORITY_FEE_DETERMINATION_PENDING` bind (waqf-002's case).
 * Distinct from `nazirFees[]`, which records fee EVENTS (invoices), not the deed's term.
 */
const waqfNazirFeeSchema = z
  .object({
    basis: z.string(),
    percent: fixturePercent.nullable(),
  })
  .strict();

/**
 * **مآل الوقف** — the deed's reversion clause (R7, product owner 2026-08-10).
 *
 * ⚠ `null` IS A STATEMENT, NOT AN OMISSION: it means "this deed records NO ultimate taker". That is
 * why the KEY is required on every endowment while the VALUE is nullable (see `waqfSchema` below),
 * and why `reversionClauseCaptured` is a separate required Boolean — without it, "nobody has read
 * this deed's clause yet" would be indistinguishable from the deed's own silence.
 */
const waqfReversionSchema = z
  .object({
    kind: z.string(),
    /** Beneficiary ids of THIS endowment. Verified to exist, and never deduplicated. */
    ultimateTakerIds: z.array(z.string()).min(1),
  })
  .strict();

const waqfSchema = z
  .object({
    id: z.string(),
    waqifId: z.string(),
    certificateNumber: z.string(),
    /**
     * ⊕ S11 item 2a — the certificate's EXPIRY (UPDATE_15BD's certificate arm, `Waqf.certificateExpiry` +
     * its frozen twin) and, when the fixture records that the daily sweep RAISED the update duty, the
     * date it did so (`updateDutyRaisedOn`, ≥ expiry − lead): the seed then computes the GOV-REG-02
     * deadline THROUGH THE ENGINE and binds it to a canonical GOV-REG-02 task. REQUIRED key on every
     * endowment — `null` is "no certificate expiry on record", said, never assumed. INVENTED throughout.
     */
    certificate: z
      .object({
        expiry: fixtureDate,
        updateDutyRaisedOn: fixtureDate.nullable(),
        _note: z.string().optional(),
      })
      .strict()
      .nullable(),
    deedNumber: z.string(),
    registrationDate: fixtureDate,
    /** "MM-DD" */
    fiscalYearEnd: z.string().regex(/^\d{2}-\d{2}$/),
    /**
     * ⊕ S11-1 — the `REGISTER_30BD` clock-start as RECORDED OPERATOR INPUT (owner ruling 2026-08-31,
     * 9f3d8fd; editable per f57e13d). REQUIRED KEY, NULLABLE VALUE, `.strict()`: a fixture must SAY
     * whether the anchor is recorded. `null` = nobody has recorded it, and the engine refuses
     * `REGISTER_30BD` for that endowment BY NAME (`ANCHOR_SOURCE_VALUE_ABSENT`) — blank means
     * "cannot compute", never "no deadline". The KIND travels with the date (the owner's dropdown):
     * a bare date is not the record, and the seed never infers the kind from the date.
     *
     * ⚠ `registrationDate` above is the registration ITSELF and is NOT this anchor.
     */
    registrationAnchor: z
      .object({
        date: fixtureDate,
        kind: z.enum(['waqf_documentation_date', 'regulation_effective_date']),
        /**
         * ⊕ S11-2 — the duty recorded as DISCHARGED (MET) on this date, or `null` (REQUIRED key: every
         * recorded anchor states whether its duty is discharged). The seed marks the computed row
         * `satisfiedAt` + `dischargeKind: MET`; the date must not precede the clock-start. INVENTED
         * on every fixture endowment — the owner's real dates are data owed, entered through the field.
         */
        discharge: z.object({ on: fixtureDate, _note: z.string().optional() }).strict().nullable(),
        _note: z.string().optional(),
      })
      .strict()
      .nullable(),
    /**
     * ⊕ S12-3 · BR-1101 — the endowment's three handover gates as the fixture STATES them. `cleared`
     * is the (invented) day the gate was cleared, or `null` for an OPEN gate. The seed writes the rows;
     * the ORDER is the database's (a later gate may not be cleared while an earlier one is open), so a
     * fixture stating Gate 02 cleared over an open Gate 01 refuses to seed rather than being remapped.
     */
    onboarding: z
      .object({
        gate01: z
          .object({ cleared: fixtureDate.nullable(), _note: z.string().optional() })
          .strict(),
        gate02: z
          .object({ cleared: fixtureDate.nullable(), _note: z.string().optional() })
          .strict(),
        gate03: z
          .object({ cleared: fixtureDate.nullable(), _note: z.string().optional() })
          .strict(),
      })
      .strict(),
    classification: z.string(),
    /**
     * ⊕ S9-4a — the orthogonal usage axis. REQUIRED IN THE FIXTURE (not `.optional()`) even though
     * the column is nullable: NULL means "nobody has looked", and a seeded example endowment must
     * not ship that state as though it were data. A real intake record legitimately has NULL; a
     * fixture is a worked example and has to say which it is.
     */
    directUtilization: z.boolean(),
    type: z.string(),
    nature: z.string(),
    entitlementOrder: z.string(),
    /**
     * Which of the waqif's lines the deed continues (ADR-0009 R2). `null` = the deed states none.
     *
     * ⚠ REQUIRED KEY, NULLABLE VALUE, and `.strict()` means a fixture that OMITS it is refused. A
     * missing key would be indistinguishable from a deed that is silent, and CLAUDE.md binding rule
     * 6 forbids giving this a default: which lines a founder continued is not code's to choose.
     */
    continuationStipulation: z.string().nullable(),
    /**
     * Has anybody read this deed's مآل clause? REQUIRED — see `waqfReversionSchema`.
     * `false` means the clause is unread, and the mapper refuses to build a run input from it.
     */
    reversionClauseCaptured: z.boolean(),
    /**
     * WHEN the مآل clause was read. REQUIRED KEY, NULLABLE VALUE, non-null EXACTLY when
     * `reversionClauseCaptured` is true — cross-checked in `assertFixtureCoherent` below.
     *
     * ⚠ THIS IS THE CAPTURE'S DATE, NOT THE KIND'S, AND THE DIFFERENCE IS AV-1 (S4/E3 round 2).
     * Reading a deed's مآل clause is an ACT performed by somebody on a day, and it is the act the
     * database seals on. Until round 2 the date paired with `reversion.kind`, which left the FLAG
     * free to move alone: `UPDATE "waqf" SET "reversionClauseCaptured" = true` committed on its own
     * (MEASURED, as `qmulate_app`, on waqf-005) and the seal then closed over a row that had
     * recorded nothing — permanently registering that the founder named no ultimate taker. CHECK
     * `waqf_reversion_recorded_at_pairs_with_capture` now makes that state unrepresentable, so a
     * fixture stating `captured` without a date could not be seeded at all.
     *
     * It lands in `waqf.reversionRecordedAt` + its frozen Umm-al-Qura twin (schema convention 2).
     */
    reversionClauseCapturedDate: fixtureDate.nullable(),
    /**
     * REQUIRED KEY, NULLABLE VALUE. `null` = the deed positively records no ultimate taker.
     *
     * ⚠ IT CARRIES NO DATE OF ITS OWN. The reading and what the reading found are ONE act recorded
     * in ONE statement (the database refuses any other shape), so a second date here would be a
     * second source for one column — and two sources for one fact is how the two come to disagree.
     */
    reversion: waqfReversionSchema.nullable(),
    /**
     * Deed terms the Shart must state or be honest about not stating (S5/E4). REQUIRED KEYS,
     * NULLABLE VALUES — `.strict()` refuses omission, because "the fixture author forgot" and
     * "the deed is silent" must be distinguishable. These feed the structured `shartAlWaqif`
     * at seed time (`./shart.ts`); they are NOT separate Waqf columns.
     */
    maintenanceRule: maintenanceRuleSchema.nullable(),
    nazirFee: waqfNazirFeeSchema.nullable(),
    /** `null` = no schedule set — the recorded fact that makes the post-FYE default window bind. */
    disbursementSchedule: z.enum(['annual', 'quarterly', 'custom']).nullable(),
    /**
     * PROSE ONLY. This is NOT the Shart al-Waqif the engine acts on — it is a non-authoritative
     * narrative summary. `./shart.ts` turns it into the structured `shartAlWaqif` JSON and marks
     * everything the prose does not state as explicitly absent.
     */
    waqifConditionSummary: z.string().min(1),
    trusteeship: z
      .object({
        primary: trusteeshipPrimarySchema,
        authorizedRepresentative: trusteeshipRepSchema.nullable(),
      })
      .strict(),
  })
  .strict();

const assetSchema = z
  .object({
    id: z.string(),
    waqfId: z.string(),
    type: z.string(),
    titleDeedNumber: z.string(),
    address: z.string().min(1),
    acquiredDate: fixtureDate,
    valuationSar: fixtureMoney,
    /**
     * The CLOSED occupancy vocabulary (D-A, 2026-08-16). OPTIONAL, and absent means `ACTIVE` — so
     * the six assets that predate this key keep their meaning without being edited.
     *
     * ⚠ THE TWO RESERVED MEMBERS ARE NOT ACCEPTED HERE. `ASSET_STATUS` in `./map.ts` maps only the
     * four ordinary states; `expropriated` / `substituted_istibdal` would seed a disposal that no
     * reserved-matter approval ever authorised, because the seed writes on INSERT and
     * `asset_identity_guard` gates only the UPDATE. A fixture naming one is refused as drift.
     */
    status: z.string().optional(),
  })
  .strict();

const expropriationSchema = z
  .object({
    id: z.string(),
    assetId: z.string(),
    waqfId: z.string(),
    authority: z.string().min(1),
    scope: z.string().min(1),
    announcedDate: fixtureDate,
    compensationSar: fixtureMoney.nullable(),
    compensationStatus: z.string().min(1),
    istibdal: z
      .object({
        status: z.string().min(1),
        replacementAssetId: z.string().nullable(),
        authorityNotifiedDate: fixtureDate.nullable(),
        /**
         * ⊕ S11-1 — the istibdal COMPLETION date, `ISTIBDAL_10BD`'s anchor (owner ruling 2026-08-31,
         * 9f3d8fd). REQUIRED KEY, NULLABLE VALUE: `null` = the substitution is not complete (or its
         * completion is unrecorded), and the engine refuses the rule for this taking BY NAME. NEVER
         * derived from `announcedDate` (the taking) or `authorityNotifiedDate` (the DISCHARGE).
         */
        completedDate: fixtureDate.nullable(),
        /**
         * ⚠ unverified — confirm vs primary law. DELIBERATELY NOT SEEDED AS A COLUMN: statutory
         * windows are configuration, not data. It resolves from
         * `Setting['deadline.ISTIBDAL_10BD.businessDays']` (§H). Whoever extends the fixture
         * should stop putting statutory windows in data rows.
         */
        notificationDeadlineBusinessDays: z.number().int().positive(),
      })
      .strict(),
  })
  .strict();

const uboSchema = z.discriminatedUnion('isUbo', [
  z.object({ isUbo: z.literal(false) }).strict(),
  z
    .object({
      isUbo: z.literal(true),
      idType: z.string().min(1),
      idNumber: z.string().min(1),
      bankingRefForProceeds: z.string().min(1),
      shareOfProceedsPercent: fixturePercent,
    })
    .strict(),
]);

const beneficiarySchema = z
  .object({
    id: z.string(),
    waqfId: z.string(),
    branch: z.string().min(1),
    relationship: z.string().min(1),
    /**
     * ⚠ NOW DATA, NOT DERIVED. Until S4 the mapper inferred the kind from the `relationship` PROSE
     * (`'charitable cause'` ⇒ `CHARITABLE_JIHA`), which meant a `CATEGORY_ONLY` beneficiary was
     * inexpressible without inventing a relationship string for it — and it made a beneficiary's
     * CLASS a function of a free-text label. The kind is a recorded fact about the deed; the prose
     * is copy. `map.ts` cross-checks the two rather than trusting either alone.
     */
    kind: z.string(),
    /**
     * The lineage edge (ADR-0009 / R6). REQUIRED KEY, NULLABLE VALUE.
     *
     * ⚠⚠ `null` MEANS "A CHILD OF THE WAQIF" (derived ṭabaqa 1), NEVER "unknown". Graph membership is
     * decided by `lineageLink !== null`, precisely so this has exactly one meaning.
     *
     * ⚠ IT MUST NAME A BENEFICIARY DEFINED **EARLIER** IN THIS ARRAY, on the same endowment — see
     * `assertFixtureReferences`. The composite parent FK is checked at INSERT, not at COMMIT, and
     * the seed writes beneficiaries one at a time in array order, so a child listed before its
     * parent is a foreign-key failure mid-transaction rather than a readable refusal.
     */
    parentId: z.string().nullable(),
    /**
     * The ẓuhūr/buṭūn ELIGIBILITY FACT — `"son" | "daughter" | null`.
     *
     * ⚠ NOT A GENDER FIELD. Read for exactly one computation (the `ZUHUR_ONLY` intermediate-ancestor
     * test) and never rendered as a person's gender. `null` = not a descendant of the waqif.
     */
    lineageLink: z.string().nullable(),
    /**
     * Vital / in-scope status. REQUIRED — the engine refuses to default it, because it is the sole
     * input to the ORDERED extinction test and an ancestor's value decides a whole branch's
     * entitlement (R-FRONTIER).
     */
    active: z.boolean(),
    /** The CERTIFICATION of a death. Distinct from `active: false`, which may be a scope exit. */
    deceasedDate: fixtureDate.nullable(),
    /** generational tier (ṭabaqa); null for a charitable jiha.
     *  ⚠ A CROSS-CHECK against the depth `parentId` derives, not a trusted input. */
    tabaqa: z.number().int().positive().nullable(),
    line: z.string(),
    /** Relative weight from the roster — these do NOT sum to 100 in any fixture waqf (see F2). */
    sharePercent: fixturePercent.nullable(),
    /**
     * The DEED's weight for this beneficiary. ⚠ A DIFFERENT FIELD FROM `sharePercent` ON PURPOSE:
     * collapsing them is how a 37.5%-of-distributable payout ships. Nullable, and the mapper
     * REFUSES a null rather than substituting one.
     */
    stipulatedWeight: fixtureWeight.nullable(),
    verificationStatus: z.string(),
    /**
     * BR-511 routing fact — `"domestic" | "cross_border"`. REQUIRED and EXPLICIT (S5/E4,
     * FIXTURE_DELTA_REQUIRED): a defaulted `domestic` silently routes a cross-border payment as
     * domestic, so the mapper no longer hardcodes it.
     */
    residency: z.string(),
    /**
     * BR-206 category/characteristics capture. REQUIRED KEY, NULLABLE VALUE — `null` on a
     * `category_only` member is the `CATEGORY_NOT_CAPTURED` gate's deliberate subject (ben-009),
     * and disbursement to it blocks until a staff write captures it.
     */
    category: z.string().nullable(),
    /**
     * The licensed disbursing entity, where one stands between the waqf and the beneficiary
     * (`ENTITY_UNLICENSED`'s subject). ⚠ VALIDATED FIXTURE DATA WITHOUT A COLUMN — no
     * `Beneficiary` column exists yet; E5/E6 owes it a home. Recorded here so that epic wires
     * data instead of inventing it.
     */
    disbursingEntity: z
      .object({
        name: z.string().min(1),
        licensed: z.boolean(),
        licenceExpiry: fixtureDate.nullable(),
      })
      .strict()
      .nullable(),
    /**
     * TOP-LEVEL payment target (BR-501): a non-UBO PAID line needs a reference to pay against,
     * and until S5/E4 one existed only nested under `ubo`. ⚠ VALIDATED FIXTURE DATA WITHOUT A
     * COLUMN — E5 owes the encrypted column pair (the UBO precedent: `...Enc` + `...Hmac`).
     * `null` on the deceased, the unenumerated category, and any other unpayable record.
     */
    bankingRefForProceeds: z.string().min(1).nullable(),
    ubo: uboSchema,
    kycLastRefreshed: fixtureDate.nullable(),
    _note: z.string().optional(),
  })
  .strict();

const revenueSchema = z
  .object({
    id: z.string(),
    waqfId: z.string(),
    source: z.string().min(1),
    /**
     * BINDING RULE 1's discriminator, and it is NOW DATA.
     *
     * ⚠ UNTIL S4 `map.ts` HARDCODED `receiptClass: 'INCOME'` for every revenue row. That is the
     * silent trust the engine's corpus guard exists to close: a capital receipt entered through this
     * path would have been classified income by the MAPPER and would have entered the distribution
     * waterfall, which Binding rule 1 forbids absolutely. The classification is a fact about the
     * receipt, so it belongs in the fixture — REQUIRED, with no default.
     */
    receiptClass: z.string(),
    /** Required when `receiptClass` is capital; must be null otherwise. Cross-checked in `map.ts`. */
    capitalSource: z.string().nullable(),
    assetId: z.string().nullable().optional(),
    amountSar: fixtureMoney,
    date: fixtureDate,
    bankAccount: z.string().min(1),
    note: z.string().optional(),
  })
  .strict();

const expenseSchema = z
  .object({
    id: z.string(),
    waqfId: z.string(),
    category: z.string().min(1),
    assetId: z.string().nullable().optional(),
    amountSar: fixtureMoney,
    date: fixtureDate,
    bankAccount: z.string().min(1),
    note: z.string().optional(),
  })
  .strict();

const distributionLineItemSchema = z
  .object({
    beneficiaryId: z.string(),
    sharePercent: fixturePercent,
    amountSar: fixtureMoney,
    transferRef: z.string().min(1),
  })
  .strict();

const distributionSchema = z
  .object({
    id: z.string(),
    waqfId: z.string(),
    periodStart: fixtureDate,
    periodEnd: fixtureDate,
    totalSar: fixtureMoney,
    status: z.string(),
    closeDate: fixtureDate.nullable(),
    lineItems: z.array(distributionLineItemSchema),
  })
  .strict();

const nazirFeeSchema = z
  .object({
    id: z.string(),
    waqfId: z.string(),
    basis: z.string(),
    /** ⚠ unverified — confirm vs primary law. Deed-set ʿushr, NOT a statutory rate. */
    percent: fixturePercent.nullable(),
    source: z.string().min(1),
    periodEnd: fixtureDate,
    amountSar: fixtureMoney,
    invoiceRef: z.string().nullable(),
    deductedBeforeDistribution: z.boolean(),
  })
  .strict();

const complianceTaskSchema = z
  .object({
    id: z.string(),
    waqfId: z.string(),
    section: z.string(),
    workstream: z.string().min(1),
    task: z.string().min(1),
    status: z.string(),
    classificationGate: z.string(),
    /** ⚠ unverified — confirm vs primary law. Resolves from `Setting`, never stored as a column. */
    dueWithinBusinessDays: z.number().int().positive().optional(),
    startDate: fixtureDate.nullable(),
    closeDate: fixtureDate.nullable(),
  })
  .strict();

const governmentFilingSchema = z
  .object({
    id: z.string(),
    waqfId: z.string(),
    platform: z.string(),
    status: z.string(),
    lastUpdated: fixtureDate.nullable(),
  })
  .strict();

export const fixtureSchema = z
  .object({
    /** The fictional-data marker. Its presence and wording are asserted, not merely parsed. */
    _readme: z.string().min(1),
    clients: z.array(clientSchema).min(1),
    waqifs: z.array(waqifSchema).min(1),
    waqfs: z.array(waqfSchema).min(1),
    assets: z.array(assetSchema),
    expropriations: z.array(expropriationSchema),
    beneficiaries: z.array(beneficiarySchema),
    financialTransactions: z
      .object({
        revenue: z.array(revenueSchema),
        expenses: z.array(expenseSchema),
      })
      .strict(),
    /**
     * ⊕ S12-3 · dedicated accounts OPENED BUT NOT YET USED — the onboarding case (operating model Gate
     * 02: "dedicated bank accounts"). `deriveBankAccounts` derives an account from every transaction's
     * `bankAccount` reference; an endowment with no activity yet has no such reference, so it is stated
     * here explicitly. Same `FAKE-ACCT-` grammar, same one-endowment-per-account rule (BR-501).
     */
    bankAccounts: z
      .array(
        z.object({ ref: z.string(), waqfId: z.string(), _note: z.string().optional() }).strict(),
      )
      .default([]),
    distributions: z.array(distributionSchema),
    nazirFees: z.array(nazirFeeSchema),
    complianceTasks: z.array(complianceTaskSchema),
    governmentFilingStatus: z.array(governmentFilingSchema),
  })
  .strict();

export type Fixture = z.infer<typeof fixtureSchema>;
export type FixtureClient = z.infer<typeof clientSchema>;
export type FixtureWaqif = z.infer<typeof waqifSchema>;
export type FixtureWaqf = z.infer<typeof waqfSchema>;
export type FixtureAsset = z.infer<typeof assetSchema>;
export type FixtureExpropriation = z.infer<typeof expropriationSchema>;
export type FixtureBeneficiary = z.infer<typeof beneficiarySchema>;
export type FixtureRevenue = z.infer<typeof revenueSchema>;
export type FixtureExpense = z.infer<typeof expenseSchema>;
export type FixtureDistribution = z.infer<typeof distributionSchema>;
export type FixtureDistributionLineItem = z.infer<typeof distributionLineItemSchema>;
export type FixtureNazirFee = z.infer<typeof nazirFeeSchema>;
export type FixtureComplianceTask = z.infer<typeof complianceTaskSchema>;
export type FixtureGovernmentFiling = z.infer<typeof governmentFilingSchema>;

// ── provenance assertions (G-8 layer 2 / assertion B5) ────────────────────────────────────

/** The fictional-data marker the fixture must carry. */
export const FIXTURE_MARKER = 'Entirely fictional';

/**
 * Every record id in the fixture must match this.
 *
 * `exp-e` precedes `exp` so the expense ids (`exp-e-001`) read naturally rather than relying on
 * regex backtracking.
 */
export const FIXTURE_ID_PATTERN =
  /^(?:client|waqif|waqf|asset|exp-e|exp|ben|rev|dist|fee|task|gov)-\d+$/;

/** Every external reference the fixture carries must be prefixed like this. */
export const FIXTURE_EXTERNAL_REF_PATTERN = /^FAKE-/;

/** Every email address the fixture carries must live in this reserved test domain. */
export const FIXTURE_EMAIL_DOMAIN = '@example.test';

function refuseIdentifier(what: string, value: string): never {
  throw new SeedRefusedError(`non-fixture identifier detected: ${what} = ${JSON.stringify(value)}`);
}

function assertId(what: string, value: string): void {
  if (!FIXTURE_ID_PATTERN.test(value)) refuseIdentifier(what, value);
}

function assertExternalRef(what: string, value: string | null | undefined): void {
  if (value === null || value === undefined) return;
  if (!FIXTURE_EXTERNAL_REF_PATTERN.test(value)) refuseIdentifier(what, value);
}

function assertEmail(what: string, value: string): void {
  if (!value.endsWith(FIXTURE_EMAIL_DOMAIN)) refuseIdentifier(what, value);
}

/**
 * Walk every string in the parsed fixture and refuse anything that is not demonstrably invented.
 *
 * This is the check that stands between the seed and a real family's data. It is intentionally
 * exhaustive rather than sampled, and it runs BEFORE the first write, so a violation leaves zero
 * rows in the database (assertion B5).
 */
export function assertFixtureMarkers(fixture: Fixture): void {
  if (!fixture._readme.includes(FIXTURE_MARKER)) {
    throw new SeedRefusedError(
      `fixture marker missing — _readme must contain ${JSON.stringify(FIXTURE_MARKER)}. ` +
        'Only invented data may be seeded (NFR-03).',
    );
  }

  // A generic sweep for anything that looks like an address book entry, wherever it hides.
  const sweepEmails = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      if (value.includes('@')) assertEmail(path, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => sweepEmails(item, `${path}[${index}]`));
      return;
    }
    if (value !== null && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) sweepEmails(child, `${path}.${key}`);
    }
  };
  sweepEmails(fixture, 'fixture');

  for (const client of fixture.clients) {
    assertId('clients[].id', client.id);
    assertEmail('clients[].familyBoardContact', client.familyBoardContact);
  }
  for (const waqif of fixture.waqifs) {
    assertId('waqifs[].id', waqif.id);
    assertId('waqifs[].clientId', waqif.clientId);
  }
  for (const waqf of fixture.waqfs) {
    assertId('waqfs[].id', waqf.id);
    assertId('waqfs[].waqifId', waqf.waqifId);
    assertExternalRef('waqfs[].certificateNumber', waqf.certificateNumber);
    assertExternalRef('waqfs[].deedNumber', waqf.deedNumber);
    for (const takerId of waqf.reversion?.ultimateTakerIds ?? []) {
      assertId('waqfs[].reversion.ultimateTakerIds[]', takerId);
    }
  }
  for (const asset of fixture.assets) {
    assertId('assets[].id', asset.id);
    assertId('assets[].waqfId', asset.waqfId);
    assertExternalRef('assets[].titleDeedNumber', asset.titleDeedNumber);
  }
  for (const expropriation of fixture.expropriations) {
    assertId('expropriations[].id', expropriation.id);
    assertId('expropriations[].assetId', expropriation.assetId);
    assertId('expropriations[].waqfId', expropriation.waqfId);
    if (expropriation.istibdal.replacementAssetId !== null) {
      assertId(
        'expropriations[].istibdal.replacementAssetId',
        expropriation.istibdal.replacementAssetId,
      );
    }
  }
  for (const beneficiary of fixture.beneficiaries) {
    assertId('beneficiaries[].id', beneficiary.id);
    assertId('beneficiaries[].waqfId', beneficiary.waqfId);
    // The lineage edge is an ID, deliberately — a family tree recorded by NAME would put PII on the
    // hashed audit trail and into every engine input. It is still an identifier, so it is held to
    // the same fixture id grammar as every other one.
    if (beneficiary.parentId !== null) {
      assertId('beneficiaries[].parentId', beneficiary.parentId);
    }
    // The top-level payment target is as sensitive as the UBO's nested one — same FAKE- grammar.
    assertExternalRef('beneficiaries[].bankingRefForProceeds', beneficiary.bankingRefForProceeds);
    if (beneficiary.ubo.isUbo) {
      // The most sensitive strings in the whole file — checked explicitly, not by sweep.
      assertExternalRef('beneficiaries[].ubo.idNumber', beneficiary.ubo.idNumber);
      assertExternalRef(
        'beneficiaries[].ubo.bankingRefForProceeds',
        beneficiary.ubo.bankingRefForProceeds,
      );
    }
  }
  for (const revenue of fixture.financialTransactions.revenue) {
    assertId('revenue[].id', revenue.id);
    assertId('revenue[].waqfId', revenue.waqfId);
    if (revenue.assetId != null) assertId('revenue[].assetId', revenue.assetId);
    assertExternalRef('revenue[].bankAccount', revenue.bankAccount);
  }
  for (const expense of fixture.financialTransactions.expenses) {
    assertId('expenses[].id', expense.id);
    assertId('expenses[].waqfId', expense.waqfId);
    if (expense.assetId != null) assertId('expenses[].assetId', expense.assetId);
    assertExternalRef('expenses[].bankAccount', expense.bankAccount);
  }
  for (const distribution of fixture.distributions) {
    assertId('distributions[].id', distribution.id);
    assertId('distributions[].waqfId', distribution.waqfId);
    for (const lineItem of distribution.lineItems) {
      assertId('distributions[].lineItems[].beneficiaryId', lineItem.beneficiaryId);
      assertExternalRef('distributions[].lineItems[].transferRef', lineItem.transferRef);
    }
  }
  for (const fee of fixture.nazirFees) {
    assertId('nazirFees[].id', fee.id);
    assertId('nazirFees[].waqfId', fee.waqfId);
    assertExternalRef('nazirFees[].invoiceRef', fee.invoiceRef);
  }
  for (const task of fixture.complianceTasks) {
    assertId('complianceTasks[].id', task.id);
    assertId('complianceTasks[].waqfId', task.waqfId);
  }
  for (const filing of fixture.governmentFilingStatus) {
    assertId('governmentFilingStatus[].id', filing.id);
    assertId('governmentFilingStatus[].waqfId', filing.waqfId);
  }
}

/**
 * Referential integrity WITHIN the fixture.
 *
 * Prisma's foreign keys would catch most of these at insert time, but only after some rows had
 * already been written. Checking up-front keeps the "zero rows written on any refusal" promise.
 */
export function assertFixtureReferences(fixture: Fixture): void {
  const clientIds = new Set(fixture.clients.map((c) => c.id));
  const waqifIds = new Set(fixture.waqifs.map((w) => w.id));
  const waqfIds = new Set(fixture.waqfs.map((w) => w.id));
  const assetIds = new Set(fixture.assets.map((a) => a.id));
  const beneficiaryIds = new Set(fixture.beneficiaries.map((b) => b.id));

  const require = (ok: boolean, what: string, value: string): void => {
    if (!ok) {
      throw new SeedRefusedError(
        `fixture drift — dangling reference: ${what} = ${JSON.stringify(value)} has no matching record`,
      );
    }
  };

  for (const waqif of fixture.waqifs)
    require(clientIds.has(waqif.clientId), 'waqifs[].clientId', waqif.clientId);
  for (const waqf of fixture.waqfs)
    require(waqifIds.has(waqf.waqifId), 'waqfs[].waqifId', waqf.waqifId);
  for (const asset of fixture.assets)
    require(waqfIds.has(asset.waqfId), 'assets[].waqfId', asset.waqfId);
  for (const expropriation of fixture.expropriations) {
    require(waqfIds.has(expropriation.waqfId), 'expropriations[].waqfId', expropriation.waqfId);
    require(assetIds.has(expropriation.assetId), 'expropriations[].assetId', expropriation.assetId);
  }
  /**
   * THE LINEAGE EDGE, checked THREE ways (ADR-0009 / R6). All three are integrity, not fiqh:
   *
   *  1. the parent exists and is on the SAME endowment — the composite FK
   *     `beneficiary([waqfId, parentId]) -> beneficiary([waqfId, id])` makes a cross-endowment edge
   *     structurally impossible, and this turns that into a readable refusal instead of a 23503;
   *  2. no self-parent — CHECK `beneficiary_no_self_parent` says the same at the database;
   *  3. ⚠ THE PARENT IS DEFINED **EARLIER IN THE ARRAY**. This one is about the SEED, not the model:
   *     the FK is checked at INSERT (not deferred to COMMIT) and the seed writes beneficiaries one
   *     at a time in fixture order, so a child listed above its parent fails mid-transaction with a
   *     foreign-key error that says nothing about the fixture. Requiring topological order costs the
   *     fixture author one reordering and buys a message that names the two records.
   *
   * Longer cycles cannot occur once (1) and (3) hold — an edge may only point backwards — which is
   * why no cycle walk is needed here. The ENGINE still refuses a cycle (`LINEAGE_CYCLE`), because it
   * is fed by callers this file knows nothing about.
   */
  const beneficiariesSeenSoFar = new Set<string>();
  for (const beneficiary of fixture.beneficiaries) {
    require(waqfIds.has(beneficiary.waqfId), 'beneficiaries[].waqfId', beneficiary.waqfId);
    if (beneficiary.parentId !== null) {
      require(beneficiaryIds.has(
        beneficiary.parentId,
      ), `beneficiaries[${beneficiary.id}].parentId`, beneficiary.parentId);
      if (beneficiary.parentId === beneficiary.id) {
        throw new SeedRefusedError(
          `fixture drift — ${beneficiary.id} is its own parent. A self-parent is refused at the ` +
            'database too (CHECK beneficiary_no_self_parent); it is the one lineage cycle a row ' +
            'constraint can see.',
        );
      }
      const parent = fixture.beneficiaries.find((row) => row.id === beneficiary.parentId);
      if (parent !== undefined && parent.waqfId !== beneficiary.waqfId) {
        throw new SeedRefusedError(
          `fixture drift — ${beneficiary.id} (waqf ${beneficiary.waqfId}) names a parent on a ` +
            `DIFFERENT endowment (${beneficiary.parentId} on waqf ${parent.waqfId}). A family tree ` +
            'is waqf-scoped: the composite foreign key makes a cross-endowment edge impossible, and ' +
            'the engine refuses it as LINEAGE_PARENT_UNKNOWN. (⚠ Whether the tree belongs to the ' +
            'WAQF or to the WAQIF is ADR-0009 open question 9 and is NOT settled — the schema ' +
            'answers waqf-scoped because that is the fail-safe direction.)',
        );
      }
      if (!beneficiariesSeenSoFar.has(beneficiary.parentId)) {
        throw new SeedRefusedError(
          `fixture drift — ${beneficiary.id} is listed BEFORE its parent ${beneficiary.parentId}. ` +
            'The seed inserts beneficiaries in array order against a composite parent foreign key ' +
            'that is checked at INSERT rather than at COMMIT, so a child above its parent aborts ' +
            'the whole seed transaction with an unreadable 23503. Move the parent above the child.',
        );
      }
    }
    beneficiariesSeenSoFar.add(beneficiary.id);
  }

  /**
   * ⚠ مآل الوقف — THE CLAUSE MUST NAME BENEFICIARIES OF ITS OWN ENDOWMENT (R7).
   *
   * `WaqfReversionTaker`'s composite FK enforces the same thing structurally. The three refusals
   * mirrored here are the resolver's own — an unknown id, a repeated id (NEVER deduplicated: a
   * repeat double-counts in the weight vector and MOVES MONEY), and a clause whose reading was never
   * recorded. What is deliberately NOT checked here is whether each taker is a charitable jiha: R7
   * answered only that a ذري deed MAY end at a charity, and `REVERSION_KIND_UNRECOGNISED` exists for
   * the deeds that revert elsewhere. That refusal is the engine's, where it can be revised without a
   * migration.
   */
  for (const waqf of fixture.waqfs) {
    /*
     * ⚠ THE READING AND ITS DATE ARE ONE FACT (AV-1, S4/E3 round 2), checked for EVERY endowment —
     * before the `reversion === null` short-circuit below, because the four fixture deeds that
     * record NO ultimate taker are exactly the rows this defect was measured on. CHECK
     * `waqf_reversion_recorded_at_pairs_with_capture` says the same at the database; saying it here
     * too turns an unreadable 23514 mid-seed into a sentence naming the endowment.
     */
    if (waqf.reversionClauseCaptured !== (waqf.reversionClauseCapturedDate !== null)) {
      throw new SeedRefusedError(
        `fixture drift — ${waqf.id} states reversionClauseCaptured=${String(
          waqf.reversionClauseCaptured,
        )} with reversionClauseCapturedDate=${JSON.stringify(waqf.reversionClauseCapturedDate)}. ` +
          'The two are ONE fact: reading a deed’s مآل clause is an act performed ' +
          'on a day, and the flag is IRREVERSIBLE and SEALS the whole clause — so a reading with no ' +
          'date records, permanently, that the founder named no ultimate taker with nothing behind ' +
          'it (Binding rule 1, R7-c). A date with no reading is the same incoherence upside down.',
      );
    }
    if (waqf.reversion === null) continue;
    if (!waqf.reversionClauseCaptured) {
      throw new SeedRefusedError(
        `fixture drift — ${waqf.id} records a reversion clause while reversionClauseCaptured is ` +
          'false. A clause nobody read cannot name an ultimate taker.',
      );
    }
    const seen = new Set<string>();
    for (const takerId of waqf.reversion.ultimateTakerIds) {
      require(beneficiaryIds.has(
        takerId,
      ), `waqfs[${waqf.id}].reversion.ultimateTakerIds[]`, takerId);
      const taker = fixture.beneficiaries.find((row) => row.id === takerId);
      if (taker !== undefined && taker.waqfId !== waqf.id) {
        throw new SeedRefusedError(
          `fixture drift — ${waqf.id}'s reversion clause names ${takerId}, a beneficiary of ` +
            `${taker.waqfId}. مآل الوقف disposes of THIS endowment; a taker from another one is ` +
            'structurally impossible at the database (composite foreign key).',
        );
      }
      if (seen.has(takerId)) {
        throw new SeedRefusedError(
          `fixture drift — ${waqf.id}'s reversion clause names ${takerId} twice. A repeated ` +
            'ultimate taker is REFUSED, never deduplicated: it would double-count in the weight ' +
            'vector and move money (REVERSION_ULTIMATE_TAKER_DUPLICATED).',
        );
      }
      seen.add(takerId);
    }
  }
  for (const revenue of fixture.financialTransactions.revenue) {
    require(waqfIds.has(revenue.waqfId), 'revenue[].waqfId', revenue.waqfId);
    if (revenue.assetId != null)
      require(assetIds.has(revenue.assetId), 'revenue[].assetId', revenue.assetId);
  }
  for (const expense of fixture.financialTransactions.expenses) {
    require(waqfIds.has(expense.waqfId), 'expenses[].waqfId', expense.waqfId);
    if (expense.assetId != null)
      require(assetIds.has(expense.assetId), 'expenses[].assetId', expense.assetId);
  }
  for (const distribution of fixture.distributions) {
    require(waqfIds.has(distribution.waqfId), 'distributions[].waqfId', distribution.waqfId);
    for (const lineItem of distribution.lineItems) {
      require(beneficiaryIds.has(
        lineItem.beneficiaryId,
      ), 'distributions[].lineItems[].beneficiaryId', lineItem.beneficiaryId);
    }
  }
  for (const fee of fixture.nazirFees)
    require(waqfIds.has(fee.waqfId), 'nazirFees[].waqfId', fee.waqfId);
  for (const task of fixture.complianceTasks) {
    require(waqfIds.has(task.waqfId), 'complianceTasks[].waqfId', task.waqfId);
  }
  for (const filing of fixture.governmentFilingStatus) {
    require(waqfIds.has(filing.waqfId), 'governmentFilingStatus[].waqfId', filing.waqfId);
  }
}

/**
 * Parse + verify the fixture. THE only sanctioned way to turn the JSON into typed data.
 *
 * Order matters: shape first (so the marker checks can rely on the types), then provenance, then
 * referential integrity. Every failure is a {@link SeedRefusedError}, so the runner exits 1 with a
 * `SEED_REFUSED` line and nothing has been written.
 */
export function parseFixture(raw: unknown): Fixture {
  const parsed = fixtureSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  • ${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('\n');
    throw new SeedRefusedError(
      `fixture drift — data/fixtures/sample-waqf.json does not match the expected shape:\n${issues}`,
    );
  }
  assertFixtureMarkers(parsed.data);
  assertFixtureReferences(parsed.data);
  return parsed.data;
}
