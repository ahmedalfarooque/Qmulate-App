/**
 * E4 — **THE BENEFICIARY REGISTRY SURFACE** (`src/routers/beneficiary.ts`): BR-201…BR-206, BR-210.
 *
 * The three E4 exit clauses this file measures, plus the write surface behind them:
 *
 *  1. **SELF-ISOLATION ON THE WIDENED SURFACE (BR-210, §10 §5).** E2's AC-2 file
 *     (`beneficiary-isolation.integration.test.ts`) proved the ROW-level half on the surface as it
 *     was THEN. E4 widened the projection (KYC freshness, category state, decimals-as-strings) and
 *     added five write procedures — so the isolation claim has to be re-taken on the widened
 *     surface, not inherited. This file EXTENDS that file's coverage; it does not modify it.
 *  2. **A DB OPERATOR SEES CIPHERTEXT (BR-202/203).** The UBO identity/banking columns are
 *     field-encrypted at rest; raw SQL on the APP-ROLE connection bypasses the Prisma client
 *     extensions and therefore IS the at-rest view (while honouring the harness rule that no
 *     assertion rides the owner connection). The searchability half — the derived `…Hmac`
 *     sibling — is proven by REPRODUCING the digest with the extension's own convention
 *     (`searchHash('<Model>.<column>', plaintext)`, measured against `ENCRYPTED_FIELDS` in
 *     `packages/database/src/extensions/encryption.ts`), not by asserting non-null.
 *  3. **THE ENGINE GATE TIE-IN (BR-206).** `CATEGORY_NOT_CAPTURED` is rank 0 / WITHHELD in the
 *     gate ladder; `captureCategory` is the write that unblocks it. The SAME exported predicate the
 *     engine dispatches to (`isCategoryUncaptured`, `@qmulate/domain/distribution`) is asserted
 *     here against the seeded subject (`ben-009`) and against rows this file creates — so the
 *     registry chip and the engine's withhold cannot disagree. The full gate (rank 0, WITHHELD) is
 *     property-tested in `@qmulate/domain`; `ben-009` is its seeded subject and is READ here,
 *     never written (a seeded one-shot is the V-E3-04 shape).
 *
 * ── WHAT IS MEASURED RATHER THAN ASSUMED, AND WHERE IT LANDED ────────────────────────────────
 *  · A beneficiary principal's WRITE refusals arrive by TWO different doors, and the codes differ:
 *    `enrol`/`recordDeath`/`refreshKyc` pass rung 2 (the `beneficiary` preset DOES carry
 *    `beneficiary:beneficiary:write` — access.ts §2.2) and are refused by the force-filter's
 *    unconditional write-nothing posture (C-07): `ForbiddenScopeError` (`FORBIDDEN_SCOPE`) →
 *    `NO_GRANT` → **NOT_FOUND** (errors.ts: the extension's refusal must not disclose more than the
 *    boundary would). `recordUbo` never reaches the body: the preset holds no `ubo:*` verb, so rung
 *    2 refuses `PERMISSION_DENIED` → **FORBIDDEN** (existence already disclosed by the grant).
 *  · `captureCategory` on the principal's OWN row is refused by the DOMAIN check
 *    (`CATEGORY_ON_IDENTIFIED_MEMBER` — ben-001 is FAMILY) BEFORE the force filter is ever asked.
 *    Stated honestly: through a self-pinned session the C-07 refusal on THIS procedure is
 *    unreachable (the only visible row is FAMILY, and the domain check is first), so the posture is
 *    proven by the other three writes plus the row-unchanged assertions.
 *  · `uboShareOfProceeds` is `Decimal(9,4)`: stored as `12.5000` (measured raw), projected as
 *    `'12.5'` — Prisma's Decimal normalises trailing zeros on `toString()`. Both spellings are
 *    asserted at their own layer, because the projection crossing as a STRING is the contract and
 *    which string is a fact worth pinning.
 *
 * ── THE ONCE-PER-DATABASE RULE (setup.ts rule 5) ──────────────────────────────────────────────
 * Every row this file enrols lives on {@link OWNED_WAQF}, an endowment THIS FILE provisions and
 * destroys. Nothing seeded is written: the block-1/2/3 subjects (`ben-001`, `ben-002`,
 * `FAKE-ACCT-W1`, `ben-009`) are READ only, and every attempted write against them is asserted to
 * have been REFUSED with the row's bytes unchanged. `deleteProvisionedEndowments` (setup.ts) now
 * removes test-endowment beneficiaries leaf-first with `beneficiary_no_delete` suspended in the
 * same bounded DO-block pattern as the other three children — which is what makes this suite green
 * TWICE against one database rather than exactly once.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ROLE_PRESETS } from '@qmulate/domain';
import { isCategoryUncaptured } from '@qmulate/domain/distribution';
import { searchHash } from '@qmulate/database';

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
  provisionIntakeEndowment,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('E4 (beneficiary registry: isolation, UBO disclosure, ciphertext, write surface)');

const createCaller = createCallerFactory(appRouter);

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Subjects
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The seeded endowment with the full registry: `ben-001`…, the UBO dataset, `FAKE-ACCT-W1`. */
const SEEDED_WAQF = 'waqf-001';
/** A seeded endowment NONE of this file's seats is granted on — the G-7/V-5 target. */
const UNGRANTED_WAQF = 'waqf-003';

/**
 * ⚠ THE ENDOWMENT THIS FILE OWNS. Every enrol below lands here, so the write surface is exercised
 * on rows this file creates and `cleanupApiTestRows()` removes — rule 5 in setup.ts. The id is
 * under {@link API_TEST_WAQF_PREFIX}, so it can never be mistaken for (or counted as) a seeded one.
 */
const OWNED_WAQF = `${API_TEST_WAQF_PREFIX}e4reg`;

/**
 * A second owned endowment, typed **PUBLIC_CHARITABLE** — the subject for the S5 correctness
 * adversary's HIGH finding (enrol was blind to `waqfType`, so on a خيري deed it FALSELY refused a
 * legal charitable segment and ACCEPTED a bloodline member that poisons every future run).
 */
const OWNED_KHAYRI = `${API_TEST_WAQF_PREFIX}e4khayri`;

/**
 * The beneficiary PRINCIPAL: a portal session pinned to `ben-001` on `waqf-001`, carrying the
 * `beneficiary` role preset IN FULL — which is the strongest form of the block-1 assertions,
 * because the preset DOES include `beneficiary:beneficiary:write` and the writes must still all be
 * refused (C-07 is identity-shaped, not permission-shaped).
 */
const BEN_PRINCIPAL = `${API_TEST_PREFIX}e4-ben-principal`;

/** Block 2a: holds `beneficiary:beneficiary:read` and NOT `beneficiary:ubo:read` (nazir, narrowed). */
const STAFF_NO_UBO = `${API_TEST_PREFIX}e4-staff-no-ubo`;
/** Block 2b: holds both read verbs (nazir, narrowed to exactly the two). */
const STAFF_UBO_READER = `${API_TEST_PREFIX}e4-staff-ubo-reader`;
/** Block 4: the writer on {@link OWNED_WAQF} — beneficiary read+write, ubo read+write. */
const STAFF_WRITER = `${API_TEST_PREFIX}e4-staff-writer`;
/** Block 4b: the writer on {@link OWNED_KHAYRI} — the same verbs, the خيري nature-coherence subject. */
const STAFF_KHAYRI = `${API_TEST_PREFIX}e4-staff-khayri`;

/** The seeded UBO plaintext (fixture `ben-001` — invented data, G-8). */
const SEEDED_UBO = {
  idType: 'national_id',
  idNumber: 'FAKE-ID-0001',
  bankingRefForProceeds: 'FAKE-IBAN-0001',
} as const;

/**
 * The at-rest envelope: `v<key-version>:<iv>:<tag>:<ciphertext>`, all base64url — the exact
 * grammar of `CIPHER_ENVELOPE_RE` in `packages/database/src/crypto.ts`.
 */
const ENVELOPE_RE = /^v\d+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/;

/** A thrown tRPC error, read structurally — the same idiom the sibling files use. */
interface ThrownShape {
  readonly code?: string;
  readonly message?: string;
  readonly cause?: {
    readonly code?: string;
    readonly messageKey?: string;
    readonly message?: string;
    readonly details?: Record<string, unknown>;
  };
}

async function capture(run: () => Promise<unknown>): Promise<ThrownShape> {
  try {
    await run();
  } catch (error) {
    return error as ThrownShape;
  }
  throw new Error('expected the call to throw, and it resolved');
}

/**
 * Asserts the exact shape a `DomainError` crosses the tRPC boundary in (measured against
 * `errors.ts` `toTRPCError`): `SHART_INCOMPLETE` is in neither mapping table, so it falls to the
 * default — tRPC status **BAD_REQUEST** with the DomainError itself as `cause`, keeping its own
 * `code`, its own `messageKey` (`errors.domain.<CODE>`) and its `details` (incl. the specific
 * `refusal` discriminator, which is always asserted — never a bare SHART_INCOMPLETE).
 */
function expectShartRefusal(thrown: ThrownShape, refusal: string): void {
  expect(thrown.code).toBe('BAD_REQUEST');
  expect(thrown.cause?.code).toBe('SHART_INCOMPLETE');
  expect(thrown.cause?.messageKey).toBe('errors.domain.SHART_INCOMPLETE');
  expect(thrown.cause?.details?.['refusal']).toBe(refusal);
}

/** One beneficiary row's guarded columns, read raw on the APP-role connection (the at-rest view). */
async function readRawBeneficiary(id: string): Promise<{
  active: boolean;
  verificationStatus: string;
  categoryDescriptionAr: string | null;
  kind: string;
  uboIdNumberEnc: string | null;
  uboIdNumberHmac: string | null;
  uboBankingRefEnc: string | null;
  uboBankingRefHmac: string | null;
}> {
  const prisma = await basePrisma();
  const rows = await prisma.$queryRawUnsafe<
    {
      active: boolean;
      verificationStatus: string;
      categoryDescriptionAr: string | null;
      kind: string;
      uboIdNumberEnc: string | null;
      uboIdNumberHmac: string | null;
      uboBankingRefEnc: string | null;
      uboBankingRefHmac: string | null;
    }[]
  >(
    `SELECT "active", "verificationStatus"::text AS "verificationStatus",
            "categoryDescriptionAr", "kind"::text AS "kind",
            "uboIdNumberEnc", "uboIdNumberHmac", "uboBankingRefEnc", "uboBankingRefHmac"
       FROM "beneficiary" WHERE "id" = $1`,
    id,
  );
  const row = rows[0];
  if (row === undefined) throw new Error(`beneficiary ${id} does not exist — nothing asserted`);
  return row;
}

/** The default enrol payload for a placeable FAMILY member; tests override what they probe. */
function familyEnrolInput(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    waqfId: OWNED_WAQF,
    branch: `API test branch ${FICTIONAL_MARKER_AR}`,
    relationshipAr: `فرد عائلة تجريبي ${FICTIONAL_MARKER_AR}`,
    relationshipEn: null,
    kind: 'FAMILY',
    parentId: null,
    lineageLink: 'SON',
    line: 'ZUHUR',
    tabaqa: 1,
    active: true,
    deceasedOn: null,
    sharePercent: null,
    stipulatedWeight: null,
    residency: 'DOMESTIC',
    categoryDescriptionAr: null,
    ...overrides,
  };
}

describe.skipIf(!hasDatabase)('E4 · the beneficiary registry surface', () => {
  beforeAll(async () => {
    await assertSeeded();
    // The endowment FIRST, the seats second — a WaqfAccessGrant carries an FK to waqf. The
    // provisioner purges the id (grants, approvals, beneficiaries, then the row) before inserting,
    // so a run killed mid-flight cannot poison the next one.
    await provisionIntakeEndowment({
      id: OWNED_WAQF,
      type: 'FAMILY_DHURRI',
      entitlementOrder: 'LINEAGE_CONTINUATION',
      continuationStipulation: 'ZUHUR_AND_BUTUN',
    });
    await provisionIntakeEndowment({
      id: OWNED_KHAYRI,
      type: 'PUBLIC_CHARITABLE',
      // A خيري deed continues no line and has no generations — the deed states neither.
      entitlementOrder: 'SHARED',
      continuationStipulation: null,
    });
    await provisionTestSubjects([
      {
        id: BEN_PRINCIPAL,
        role: 'BENEFICIARY',
        waqfIds: [SEEDED_WAQF],
        // ⚠ THE FULL PRESET, DELIBERATELY — including `beneficiary:beneficiary:write`. Isolation is
        // applied BEFORE role logic (§10 §5), so the write refusals below must hold even for the
        // widest portal seat the role model can express.
        permissions: [...ROLE_PRESETS.beneficiary],
        beneficiarySelfId: 'ben-001',
      },
      {
        id: STAFF_NO_UBO,
        role: 'NAZIR',
        waqfIds: [SEEDED_WAQF],
        // Narrowed from the nazir preset (grant ∩ preset): the record verb WITHOUT the UBO verb —
        // the exact configuration BR-202's field-class disclosure rule is about.
        permissions: ['beneficiary:beneficiary:read'],
      },
      {
        id: STAFF_UBO_READER,
        role: 'NAZIR',
        waqfIds: [SEEDED_WAQF],
        permissions: ['beneficiary:beneficiary:read', 'beneficiary:ubo:read'],
      },
      {
        id: STAFF_WRITER,
        role: 'NAZIR',
        waqfIds: [OWNED_WAQF],
        permissions: [
          'beneficiary:beneficiary:read',
          'beneficiary:beneficiary:write',
          'beneficiary:ubo:read',
          'beneficiary:ubo:write',
        ],
      },
      {
        id: STAFF_KHAYRI,
        role: 'NAZIR',
        waqfIds: [OWNED_KHAYRI],
        permissions: ['beneficiary:beneficiary:read', 'beneficiary:beneficiary:write'],
      },
    ]);
  }, 300_000);

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 1 · E4 EXIT CLAUSE 1 — self-isolation on the WIDENED surface (BR-210, §10 §5)
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('list: a beneficiary principal gets EXACTLY their own row, in the widened projection', async () => {
    const ctx = await contextFor({ userId: BEN_PRINCIPAL, requestId: 'e4-self-list' });
    const rows = await createCaller(ctx).beneficiary.list({ waqfId: SEEDED_WAQF });

    // Exactly one row, and it is the caller's own — waqf-001 has more beneficiaries than this
    // (the seed puts several there), so this is a real subtraction, not an empty register.
    expect(rows.map((row) => row.id)).toEqual(['ben-001']);

    // …and the WIDENED projection is present on that own row: the E4 fields must not be a wider
    // door than the E3 read was. `lineageLink` stays absent from the registry projection (module
    // header: it is an eligibility fact, never rendered).
    const own = rows[0];
    expect(own?.kycFreshness).toBe('FRESH');
    expect(own?.categoryCaptured).toBe(false);
    expect(own?.isUbo).toBe(true);
    expect(typeof own?.sharePercent).toBe('string');
    expect(own).not.toHaveProperty('lineageLink');
  });

  it('get of ANOTHER beneficiary → 404 not 403; get of self → ok with the UBO dataset WITHHELD', async () => {
    const ctx = await contextFor({ userId: BEN_PRINCIPAL, requestId: 'e4-self-get' });
    const caller = createCaller(ctx);

    const thrown = await capture(() =>
      caller.beneficiary.get({ waqfId: SEEDED_WAQF, beneficiaryId: 'ben-002' }),
    );
    // THE PAIR is the assertion (§10 §5): existence itself is not disclosed.
    expect(thrown.code).toBe('NOT_FOUND');
    expect(thrown.code).not.toBe('FORBIDDEN');

    const own = await caller.beneficiary.get({ waqfId: SEEDED_WAQF, beneficiaryId: 'ben-001' });
    expect(own.id).toBe('ben-001');
    // The beneficiary preset holds NO `ubo:read` — deliberate and recorded in the router header:
    // the portal's own submit-flow is E7/E9's design, so the dataset is a STATED withholding here.
    expect(own.uboDatasetWithheld).toBe(true);
    expect(own.uboDataset).toBeNull();
  });

  it('lineage: members are intersected to the caller’s own row, and the raw-SQL walk leaks nothing', async () => {
    const ctx = await contextFor({ userId: BEN_PRINCIPAL, requestId: 'e4-self-lineage' });
    const view = await createCaller(ctx).beneficiary.lineage({ waqfId: SEEDED_WAQF });

    expect(view.members.map((member) => member.id)).toEqual(['ben-001']);
    // ben-001 is a child of the waqif (`parentId: null`), so the intersected walk is empty — and
    // more importantly, NO pair naming any co-beneficiary may appear: the ancestry is raw SQL,
    // which the force filter does not narrow, so the intersection below the procedure is the whole
    // §10 §5 guarantee on this read.
    expect(view.ancestry).toEqual([]);
  });

  it('EVERY write is refused for a beneficiary session — C-07, measured door by door', async () => {
    const ctx = await contextFor({ userId: BEN_PRINCIPAL, requestId: 'e4-self-writes' });
    const caller = createCaller(ctx);
    const before = await readRawBeneficiary('ben-001');

    // ── enrol / recordDeath / refreshKyc: rung 2 PASSES (the preset carries the write verb), and
    // the force filter refuses the write itself. `FORBIDDEN_SCOPE` maps to `NO_GRANT` maps to
    // NOT_FOUND (errors.ts): the extension's refusal must not disclose more than the boundary
    // would. MEASURED — these are not FORBIDDEN, and asserting the pair pins the door.
    const enrolThrown = await capture(() =>
      caller.beneficiary.enrol(familyEnrolInput({ waqfId: SEEDED_WAQF }) as never),
    );
    expect(enrolThrown.code).toBe('NOT_FOUND');
    expect(enrolThrown.code).not.toBe('FORBIDDEN');

    const deathThrown = await capture(() =>
      caller.beneficiary.recordDeath({
        waqfId: SEEDED_WAQF,
        beneficiaryId: 'ben-001',
        deceasedOn: '2026-01-01',
      }),
    );
    expect(deathThrown.code).toBe('NOT_FOUND');

    const kycThrown = await capture(() =>
      caller.beneficiary.refreshKyc({ waqfId: SEEDED_WAQF, beneficiaryId: 'ben-001' }),
    );
    expect(kycThrown.code).toBe('NOT_FOUND');

    // ── captureCategory: refused too, but MEASURED at the DOMAIN check, not the force filter —
    // the only row a self-pinned session can even name is its own, ben-001 is FAMILY, and the
    // CATEGORY_ON_IDENTIFIED_MEMBER check runs before the UPDATE the filter would refuse. Stated
    // honestly rather than dressed as C-07: the write-nothing posture for this procedure rides the
    // three refusals above plus the row-unchanged assertion below.
    const categoryThrown = await capture(() =>
      caller.beneficiary.captureCategory({
        waqfId: SEEDED_WAQF,
        beneficiaryId: 'ben-001',
        categoryAr: `نص تجريبي ${FICTIONAL_MARKER_AR}`,
      }),
    );
    expect(categoryThrown.code).toBe('BAD_REQUEST');
    expect(categoryThrown.cause?.code).toBe('CATEGORY_ON_IDENTIFIED_MEMBER');

    // ── recordUbo: refused EARLIER, at rung 2 — the beneficiary preset holds no `ubo:write`, so
    // this is PERMISSION_DENIED → FORBIDDEN (existence already disclosed by the caller's own
    // grant). MEASURED: a different code than the C-07 refusals above, and that difference is the
    // ladder working, not an inconsistency.
    const uboThrown = await capture(() =>
      caller.beneficiary.recordUbo({
        waqfId: SEEDED_WAQF,
        beneficiaryId: 'ben-001',
        ubo: { isUbo: false },
      }),
    );
    expect(uboThrown.code).toBe('FORBIDDEN');
    expect(String(uboThrown.message)).toContain('PERMISSION_DENIED');

    // And nothing moved: the seeded row is byte-identical on every guarded column. A refusal that
    // left the row edited would be worse than no refusal.
    expect(await readRawBeneficiary('ben-001')).toEqual(before);
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 2 · UBO FIELD-CLASS DISCLOSURE (BR-202/BR-203)
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('a staff seat WITHOUT beneficiary:ubo:read gets the record with the dataset withheld', async () => {
    const ctx = await contextFor({ userId: STAFF_NO_UBO, requestId: 'e4-ubo-withheld' });
    const record = await createCaller(ctx).beneficiary.get({
      waqfId: SEEDED_WAQF,
      beneficiaryId: 'ben-001',
    });

    expect(record.id).toBe('ben-001');
    expect(record.uboDatasetWithheld).toBe(true);
    expect(record.uboDataset).toBeNull();
    // A withheld dataset must leave no residue anywhere in the payload — the value sweep, on the
    // three plaintexts this fixture would disclose.
    const serialized = JSON.stringify(record);
    for (const plaintext of Object.values(SEEDED_UBO)) {
      expect(serialized).not.toContain(plaintext);
    }
  });

  it('a staff seat WITH both verbs gets the decrypted dataset back, decimals as strings', async () => {
    const ctx = await contextFor({ userId: STAFF_UBO_READER, requestId: 'e4-ubo-read' });
    const record = await createCaller(ctx).beneficiary.get({
      waqfId: SEEDED_WAQF,
      beneficiaryId: 'ben-001',
    });

    expect(record.uboDatasetWithheld).toBe(false);
    expect(record.uboDataset).toEqual({
      idType: SEEDED_UBO.idType,
      idNumber: SEEDED_UBO.idNumber,
      bankingRefForProceeds: SEEDED_UBO.bankingRefForProceeds,
      // ⚠ MEASURED, AND THE TWO LAYERS DISAGREE ON PURPOSE: the column is Decimal(9,4) and the raw
      // row stores `12.5000`, but Prisma's Decimal normalises trailing zeros on toString(), so the
      // string that crosses the projection is '12.5'. The projection's contract is "a decimal
      // STRING, never a float" — which string is a fact, pinned here so a Prisma upgrade that
      // changes the rendering is noticed rather than absorbed.
      shareOfProceeds: '12.5',
    });
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 3 · E4 EXIT CLAUSE 2 — a DB operator sees ciphertext (the at-rest view)
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('raw SQL on the app-role connection returns envelopes, never plaintext — and the HMAC is searchable', async () => {
    // `basePrisma()` is the UNEXTENDED app-role client: raw SQL bypasses the encryption extension,
    // so what comes back is exactly what sits on disk. (The owner connection is scaffolding only —
    // no assertion rides it; this one deliberately rides the runtime role.)
    const row = await readRawBeneficiary('ben-001');

    for (const [column, plaintext] of [
      ['uboIdNumberEnc', SEEDED_UBO.idNumber],
      ['uboBankingRefEnc', SEEDED_UBO.bankingRefForProceeds],
    ] as const) {
      const stored = row[column];
      expect(stored, `${column} is NULL on the seeded UBO row`).not.toBeNull();
      expect(stored).toMatch(ENVELOPE_RE);
      expect(stored).not.toBe(plaintext);
      expect(stored).not.toContain(plaintext);
    }

    // The derived digests: non-null, and NOT the plaintext (a "hash" column holding the value it
    // hashes is the classic half-migration).
    expect(row.uboIdNumberHmac).not.toBeNull();
    expect(row.uboIdNumberHmac).not.toBe(SEEDED_UBO.idNumber);
    expect(row.uboBankingRefHmac).not.toBeNull();
    expect(row.uboBankingRefHmac).not.toBe(SEEDED_UBO.bankingRefForProceeds);

    // ── THE SEARCHABILITY HALF, REPRODUCED WITH THE EXTENSION'S OWN CONVENTION ──────────────
    // `searchHash(qualifiedColumn, plaintext)` where qualifiedColumn is `<Model>.<EncColumn>` —
    // measured against ENCRYPTED_FIELDS/HMAC_SIBLING in extensions/encryption.ts, where the write
    // path derives `uboIdNumberHmac = searchHash('Beneficiary.uboIdNumberEnc', value)`. A raw
    // equality lookup on the digest must find exactly the seeded row — deterministic search over
    // ciphertext, which is the whole point of the sibling column.
    const prisma = await basePrisma();
    const digest = searchHash('Beneficiary.uboIdNumberEnc', SEEDED_UBO.idNumber);
    expect(row.uboIdNumberHmac).toBe(digest);
    const found = await prisma.$queryRawUnsafe<{ id: string }[]>(
      `SELECT "id" FROM "beneficiary" WHERE "uboIdNumberHmac" = $1`,
      digest,
    );
    expect(found.map((hit) => hit.id)).toEqual(['ben-001']);
  });

  it('bank_account.ibanEnc is an envelope at rest too (BR-501’s dedicated-account IBAN)', async () => {
    const prisma = await basePrisma();
    const rows = await prisma.$queryRawUnsafe<{ accountRef: string; ibanEnc: string }[]>(
      `SELECT "accountRef", "ibanEnc" FROM "bank_account" WHERE "accountRef" = 'FAKE-ACCT-W1'`,
    );
    const account = rows[0];
    expect(account, 'FAKE-ACCT-W1 is not seeded — the fixture moved').toBeDefined();
    expect(account?.ibanEnc).toMatch(ENVELOPE_RE);
    // The seed derives the IBAN plaintext from the reference (`FAKE-ACCT-W1` → `FAKE-IBAN-W1`,
    // seed/map.ts); neither spelling may appear in the ciphertext.
    expect(account?.ibanEnc).not.toContain('FAKE-IBAN-W1');
    expect(account?.ibanEnc).not.toContain('FAKE-ACCT-W1');
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 4 · THE WRITE SURFACE — on this file's OWN endowment (rule 5)
   *
   * Sequential by design: later tests use rows the earlier ones enrolled. Vitest runs one file's
   * tests in order (`sequence.concurrent: false`).
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  /** Ids of rows this file enrols, filled as the suite runs. */
  let rootId = '';
  let childId = '';
  let categoryId = '';

  it('enrol: a ṭabaqa-1 FAMILY member lands UNVERIFIED on both status and freshness', async () => {
    const ctx = await contextFor({ userId: STAFF_WRITER, requestId: 'e4-enrol-root' });
    const caller = createCaller(ctx);

    const created = await caller.beneficiary.enrol(familyEnrolInput() as never);
    expect(created.waqfId).toBe(OWNED_WAQF);
    expect(created.id.length).toBeGreaterThan(0);
    rootId = created.id;

    const record = await caller.beneficiary.get({ waqfId: OWNED_WAQF, beneficiaryId: rootId });
    expect(record.verificationStatus).toBe('UNVERIFIED');
    // UNVERIFIED status ⇒ UNVERIFIED freshness — the engine's own boundary (never conflated with
    // STALE), computed through the same predicates the gates run.
    expect(record.kycFreshness).toBe('UNVERIFIED');
    expect(record.active).toBe(true);
    expect(record.deceasedAt).toBeNull();
    expect(record.tabaqa).toBe(1);
  });

  it('enrol: a child at the derived depth is accepted; one a generation deep of its edge is refused', async () => {
    const ctx = await contextFor({ userId: STAFF_WRITER, requestId: 'e4-enrol-child' });
    const caller = createCaller(ctx);

    const child = await caller.beneficiary.enrol(
      familyEnrolInput({ parentId: rootId, tabaqa: 2 }) as never,
    );
    childId = child.id;

    // tabaqa 3 under a depth-1 parent: the supplied value is a CROSS-CHECK, not a trusted input —
    // the engine halts on such a graph (TABAQA_MISMATCHES_LINEAGE_DEPTH), so enrolment refuses it
    // first, with the same discriminator.
    const thrown = await capture(() =>
      caller.beneficiary.enrol(familyEnrolInput({ parentId: rootId, tabaqa: 3 }) as never),
    );
    expectShartRefusal(thrown, 'TABAQA_MISMATCHES_LINEAGE_DEPTH');
    expect(thrown.cause?.details?.['tabaqaSupplied']).toBe(3);
    expect(thrown.cause?.details?.['tabaqaDerived']).toBe(2);
  });

  it('enrol: the seed’s coherence refusals hold at the door — R6, the jiha mirror, the waqf-scoped tree', async () => {
    const ctx = await contextFor({ userId: STAFF_WRITER, requestId: 'e4-enrol-refusals' });
    const caller = createCaller(ctx);

    // R6: a FAMILY member with no lineageLink cannot be enrolled on ANY deed — eligibility comes
    // from descent, and the engine will not pay someone it cannot place.
    expectShartRefusal(
      await capture(() =>
        caller.beneficiary.enrol(familyEnrolInput({ lineageLink: null }) as never),
      ),
      'LINEAGE_LINK_MISSING',
    );

    // The mirror: a CHARITABLE_JIHA is not a descendant — no edge, no link, no ṭabaqa.
    expectShartRefusal(
      await capture(() =>
        caller.beneficiary.enrol(
          familyEnrolInput({
            kind: 'CHARITABLE_JIHA',
            parentId: rootId,
            lineageLink: null,
            line: 'NA',
            tabaqa: null,
          }) as never,
        ),
      ),
      'LINEAGE_EDGE_ON_NON_DESCENDANT',
    );

    // A parent naming a beneficiary of ANOTHER endowment: the composite FK makes the edge
    // structurally impossible; this is its readable refusal. `ben-001` exists — on waqf-001.
    expectShartRefusal(
      await capture(() =>
        caller.beneficiary.enrol(familyEnrolInput({ parentId: 'ben-001', tabaqa: 2 }) as never),
      ),
      'LINEAGE_PARENT_UNKNOWN',
    );
  });

  it('enrol: living-with-certification is a zod refusal; a DEAD ancestor is enrollable, dual-dated', async () => {
    const ctx = await contextFor({ userId: STAFF_WRITER, requestId: 'e4-enrol-death-states' });
    const caller = createCaller(ctx);

    // active:true + deceasedOn: incoherent at parse (the same coherence the DB CHECK enforces),
    // refused as BAD_REQUEST with a field-level message rather than a 23514.
    const incoherent = await capture(() =>
      caller.beneficiary.enrol(
        familyEnrolInput({ active: true, deceasedOn: '2020-01-01' }) as never,
      ),
    );
    expect(incoherent.code).toBe('BAD_REQUEST');

    // R7-d's DATA OBLIGATION: dead ancestors must be enrollable — a reverting deed needs its dead
    // descendants on record. The Hijri twin is DERIVED server-side (ADR-0007: one implementation).
    const deceased = await caller.beneficiary.enrol(
      familyEnrolInput({ active: false, deceasedOn: '2018-05-10' }) as never,
    );
    const record = await caller.beneficiary.get({
      waqfId: OWNED_WAQF,
      beneficiaryId: deceased.id,
    });
    expect(record.active).toBe(false);
    expect(record.deceasedAt).toBe('2018-05-10T00:00:00.000Z');
    expect(record.deceasedAtHijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('recordDeath: one-way — certifies once, dual-dated, and refuses a second certification', async () => {
    const ctx = await contextFor({ userId: STAFF_WRITER, requestId: 'e4-record-death' });
    const caller = createCaller(ctx);

    const result = await caller.beneficiary.recordDeath({
      waqfId: OWNED_WAQF,
      beneficiaryId: childId,
      deceasedOn: '2026-02-01',
    });
    expect(result).toEqual({ id: childId, active: false });

    const record = await caller.beneficiary.get({ waqfId: OWNED_WAQF, beneficiaryId: childId });
    expect(record.active).toBe(false);
    expect(record.deceasedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(record.deceasedAtHijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // AGAIN → refused. A death is certified once; correcting a wrong certification is an owed
    // design (BUILD-PLAN), not an overwrite. `DEATH_ALREADY_CERTIFIED` is in neither errors.ts
    // mapping table, so it crosses as the default BAD_REQUEST with its own code on `cause`.
    const again = await capture(() =>
      caller.beneficiary.recordDeath({
        waqfId: OWNED_WAQF,
        beneficiaryId: childId,
        deceasedOn: '2026-03-01',
      }),
    );
    expect(again.code).toBe('BAD_REQUEST');
    expect(again.cause?.code).toBe('DEATH_ALREADY_CERTIFIED');
  });

  it('refreshKyc: VERIFIED + FRESH on a fresh read, with the derived Hijri twin', async () => {
    const ctx = await contextFor({ userId: STAFF_WRITER, requestId: 'e4-refresh-kyc' });
    const caller = createCaller(ctx);

    await caller.beneficiary.refreshKyc({ waqfId: OWNED_WAQF, beneficiaryId: rootId });

    const record = await caller.beneficiary.get({ waqfId: OWNED_WAQF, beneficiaryId: rootId });
    expect(record.verificationStatus).toBe('VERIFIED');
    // Freshness is computed on read from the refresh instant (the SERVER's clock) plus the seeded
    // `kyc.refreshIntervalMonths` Setting (⚠ unverified vs primary law) — a refresh performed
    // moments ago is FRESH under any positive window, never persisted.
    expect(record.kycFreshness).toBe('FRESH');
    expect(record.kycLastRefreshed).not.toBeNull();
    expect(record.kycLastRefreshedHijri).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('captureCategory: unblocks a CATEGORY_ONLY member and refuses an identified person (BR-206)', async () => {
    const ctx = await contextFor({ userId: STAFF_WRITER, requestId: 'e4-capture-category' });
    const caller = createCaller(ctx);

    // A CATEGORY_ONLY member WITH a real lineage edge — R6 demands one on a ذري deed.
    const created = await caller.beneficiary.enrol(
      familyEnrolInput({
        kind: 'CATEGORY_ONLY',
        parentId: rootId,
        tabaqa: 2,
        relationshipAr: `فئة غير محصورة ${FICTIONAL_MARKER_AR}`,
      }) as never,
    );
    categoryId = created.id;

    const listedBefore = await caller.beneficiary.list({ waqfId: OWNED_WAQF });
    expect(listedBefore.find((row) => row.id === categoryId)?.categoryCaptured).toBe(false);

    // The Arabic capture (NFR-01: Arabic-authoritative), and the state flips.
    const captured = await caller.beneficiary.captureCategory({
      waqfId: OWNED_WAQF,
      beneficiaryId: categoryId,
      categoryAr: `ذرية الابن الأكبر غير المحصورين ${FICTIONAL_MARKER_AR}`,
    });
    expect(captured).toEqual({ id: categoryId, categoryCaptured: true });

    const listedAfter = await caller.beneficiary.list({ waqfId: OWNED_WAQF });
    expect(listedAfter.find((row) => row.id === categoryId)?.categoryCaptured).toBe(true);

    // On a FAMILY member: an individually identified person has no "category" — accepting one
    // would turn BR-206's field into free text on every row.
    const onFamily = await capture(() =>
      caller.beneficiary.captureCategory({
        waqfId: OWNED_WAQF,
        beneficiaryId: rootId,
        categoryAr: `نص ${FICTIONAL_MARKER_AR}`,
      }),
    );
    expect(onFamily.code).toBe('BAD_REQUEST');
    expect(onFamily.cause?.code).toBe('CATEGORY_ON_IDENTIFIED_MEMBER');
  });

  it('recordUbo: plaintext in, ciphertext at rest, plaintext back for ubo:read — and cleared with the flag', async () => {
    const ctx = await contextFor({ userId: STAFF_WRITER, requestId: 'e4-record-ubo' });
    const caller = createCaller(ctx);

    await caller.beneficiary.recordUbo({
      waqfId: OWNED_WAQF,
      beneficiaryId: rootId,
      ubo: {
        isUbo: true,
        idType: 'national_id',
        idNumber: 'FAKE-E4-ID-0001',
        bankingRefForProceeds: 'FAKE-E4-IBAN-0001',
        shareOfProceedsPercent: '7.5',
      },
    });

    // Read back with `ubo:read` (the writer seat holds it): the decrypted dataset, verbatim.
    const record = await caller.beneficiary.get({ waqfId: OWNED_WAQF, beneficiaryId: rootId });
    expect(record.isUbo).toBe(true);
    expect(record.uboDataset).toEqual({
      idType: 'national_id',
      idNumber: 'FAKE-E4-ID-0001',
      bankingRefForProceeds: 'FAKE-E4-IBAN-0001',
      shareOfProceeds: '7.5',
    });

    // At rest: envelopes, and the derived digest reproduces from the extension's convention.
    const raw = await readRawBeneficiary(rootId);
    expect(raw.uboIdNumberEnc).toMatch(ENVELOPE_RE);
    expect(raw.uboIdNumberEnc).not.toContain('FAKE-E4-ID-0001');
    expect(raw.uboBankingRefEnc).toMatch(ENVELOPE_RE);
    expect(raw.uboBankingRefEnc).not.toContain('FAKE-E4-IBAN-0001');
    expect(raw.uboIdNumberHmac).toBe(searchHash('Beneficiary.uboIdNumberEnc', 'FAKE-E4-ID-0001'));

    // Clearing the flag clears the dataset: a non-UBO row holding an identity/banking payload
    // would be sensitive data with no stated basis for holding it.
    await caller.beneficiary.recordUbo({
      waqfId: OWNED_WAQF,
      beneficiaryId: rootId,
      ubo: { isUbo: false },
    });
    const cleared = await readRawBeneficiary(rootId);
    expect(cleared.uboIdNumberEnc).toBeNull();
    expect(cleared.uboIdNumberHmac).toBeNull();
    expect(cleared.uboBankingRefEnc).toBeNull();
    expect(cleared.uboBankingRefHmac).toBeNull();
  });

  it('E4 exit clause 3 tie-in: the registry state and the engine gate share ONE predicate', async () => {
    // `isCategoryUncaptured` IS the exported condition function the engine's rank-0 WITHHELD gate
    // (`CATEGORY_NOT_CAPTURED`) dispatches to — the gate itself (rank, precedence, status) is
    // property-tested in `@qmulate/domain`; this asserts the SUBJECTS agree with it.
    type GateSubject = Parameters<typeof isCategoryUncaptured>[0];

    // The SEEDED subject, read raw and never written: ben-009 is the fixture's one deliberate
    // CATEGORY_NOT_CAPTURED shape (kind CATEGORY_ONLY, categoryDescriptionAr null) — capturing it
    // would spend a seeded one-shot (V-E3-04), so this file captures its OWN row instead (above).
    const seeded = await readRawBeneficiary('ben-009');
    expect(seeded.kind).toBe('CATEGORY_ONLY');
    expect(seeded.categoryDescriptionAr).toBeNull();
    expect(
      isCategoryUncaptured({
        kind: seeded.kind,
        category: seeded.categoryDescriptionAr,
      } as GateSubject),
    ).toBe(true);

    // And the row THIS file captured no longer trips it — the registry's `categoryCaptured: true`
    // and the engine's gate cannot disagree, because both read the same column through the same
    // rule. A whitespace-only capture cannot reach the column: `captureCategory`'s input is
    // `.trim().min(1)` (S5 correctness adversary), so a blank is refused at parse — pinned in the
    // dedicated whitespace test in block 4b.
    const captured = await readRawBeneficiary(categoryId);
    expect(captured.kind).toBe('CATEGORY_ONLY');
    expect(captured.categoryDescriptionAr).not.toBeNull();
    expect(
      isCategoryUncaptured({
        kind: captured.kind,
        category: captured.categoryDescriptionAr,
      } as GateSubject),
    ).toBe(false);
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 4b · THE S5 CORRECTNESS-ADVERSARY REGRESSIONS — enrol's waqfType coherence, and three more
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('enrol on a خيري waqf: an edgeless CATEGORY_ONLY segment is ACCEPTED (R6-F1, memo Q6)', async () => {
    // ⚠ THE FALSE-REFUSAL HALF of the adversary's HIGH. Before enrol loaded the waqf's type it
    // applied R6 universally and refused this — but R6-F1 (memo Q6) scopes the edge requirement to
    // ذري deeds, and a charitable waqf's not-yet-identified segment ("the poor of the district")
    // legitimately carries no bloodline edge; the BR-206 blank-category gate covers it instead.
    const ctx = await contextFor({ userId: STAFF_KHAYRI, requestId: 'e4-khayri-category' });
    const created = await createCaller(ctx).beneficiary.enrol({
      waqfId: OWNED_KHAYRI,
      branch: `Charitable segment ${FICTIONAL_MARKER_AR}`,
      relationshipAr: `فئة خيرية غير محصورة ${FICTIONAL_MARKER_AR}`,
      relationshipEn: null,
      kind: 'CATEGORY_ONLY',
      parentId: null,
      lineageLink: null,
      line: 'NA',
      tabaqa: null,
      active: true,
      deceasedOn: null,
      sharePercent: null,
      stipulatedWeight: null,
      residency: 'DOMESTIC',
      categoryDescriptionAr: null,
    } as never);
    expect(created.waqfId).toBe(OWNED_KHAYRI);
  });

  it('enrol on a خيري waqf REFUSES a bloodline member — the poison the engine would halt on', async () => {
    // ⚠ THE POISONING HALF. A lineageLink, a parentId or a ṭabaqa on a charitable deed makes the
    // endowment both خيري and ذري, which a waqf cannot be. Before the fix enrol ACCEPTED these and a
    // single one broke every future run of the endowment (SHART_INCOMPLETE). Now enrol refuses each
    // by the engine's own discriminator.
    const ctx = await contextFor({ userId: STAFF_KHAYRI, requestId: 'e4-khayri-poison' });
    const caller = createCaller(ctx);

    // A FAMILY member carrying a descent claim → DESCENDANT_ON_CHARITABLE_WAQF (memo Q6, absolute).
    const withLink = await capture(() =>
      caller.beneficiary.enrol({
        waqfId: OWNED_KHAYRI,
        branch: `Bloodline ${FICTIONAL_MARKER_AR}`,
        relationshipAr: `ابن ${FICTIONAL_MARKER_AR}`,
        relationshipEn: null,
        kind: 'FAMILY',
        parentId: null,
        lineageLink: 'SON',
        line: 'ZUHUR',
        tabaqa: 1,
        active: true,
        deceasedOn: null,
        sharePercent: null,
        stipulatedWeight: null,
        residency: 'DOMESTIC',
        categoryDescriptionAr: null,
      } as never),
    );
    expectShartRefusal(withLink, 'DESCENDANT_ON_CHARITABLE_WAQF');

    // A CATEGORY_ONLY carrying a ṭabaqa → TABAQA_ON_CHARITABLE_WAQF: a charitable waqf has no
    // generations to sit in. (No lineageLink, so DESCENDANT does not fire first.)
    const withTabaqa = await capture(() =>
      caller.beneficiary.enrol({
        waqfId: OWNED_KHAYRI,
        branch: `Tiered segment ${FICTIONAL_MARKER_AR}`,
        relationshipAr: `فئة ${FICTIONAL_MARKER_AR}`,
        relationshipEn: null,
        kind: 'CATEGORY_ONLY',
        parentId: null,
        lineageLink: null,
        line: 'NA',
        tabaqa: 2,
        active: true,
        deceasedOn: null,
        sharePercent: null,
        stipulatedWeight: null,
        residency: 'DOMESTIC',
        categoryDescriptionAr: null,
      } as never),
    );
    expectShartRefusal(withTabaqa, 'TABAQA_ON_CHARITABLE_WAQF');
  });

  it('captureCategory REFUSES a whitespace-only description — the registry and the gate agree on “blank”', async () => {
    // ⚠ The engine's CATEGORY_NOT_CAPTURED gate TRIMS (gates.ts), so a whitespace-only capture that
    // satisfied a bare `.min(1)` would show CAPTURED in the registry while the engine kept
    // WITHHOLDING. `captureCategory`'s input is `.trim().min(1)`, so a blank string is refused at
    // parse and never stored — the registry chip and the gate cannot disagree on it.
    const ctx = await contextFor({ userId: STAFF_WRITER, requestId: 'e4-capture-whitespace' });
    const thrown = await capture(() =>
      createCaller(ctx).beneficiary.captureCategory({
        waqfId: OWNED_WAQF,
        beneficiaryId: categoryId,
        categoryAr: '   \t  ',
      }),
    );
    expect(thrown.code).toBe('BAD_REQUEST');
    // And the row this file captured earlier stays captured — the refusal changed nothing.
    const still = await readRawBeneficiary(categoryId);
    expect(still.categoryDescriptionAr).not.toBeNull();
  });

  it('recordDeath REFUSES a CHARITABLE_JIHA — a death is a fact about a person (R7-D1)', async () => {
    // ⚠ A charity does not die. Marking a jiha `active: false` through this one-way path is the
    // R7-D1 shape the engine defends against (an unenumerated placeholder's inactivity must never
    // read as a bloodline extinction). No money moves either way, but the registry must not hold an
    // incoherent one-way certification.
    const ctx = await contextFor({ userId: STAFF_KHAYRI, requestId: 'e4-death-on-jiha' });
    const caller = createCaller(ctx);
    const jiha = await caller.beneficiary.enrol({
      waqfId: OWNED_KHAYRI,
      branch: `Charity ${FICTIONAL_MARKER_AR}`,
      relationshipAr: `جهة خيرية ${FICTIONAL_MARKER_AR}`,
      relationshipEn: null,
      kind: 'CHARITABLE_JIHA',
      parentId: null,
      lineageLink: null,
      line: 'NA',
      tabaqa: null,
      active: true,
      deceasedOn: null,
      sharePercent: null,
      stipulatedWeight: '10',
      residency: 'DOMESTIC',
      categoryDescriptionAr: null,
    } as never);

    const thrown = await capture(() =>
      caller.beneficiary.recordDeath({
        waqfId: OWNED_KHAYRI,
        beneficiaryId: jiha.id,
        deceasedOn: '2026-05-01',
      }),
    );
    expect(thrown.code).toBe('BAD_REQUEST');
    expect(thrown.cause?.code).toBe('DEATH_ON_NON_PERSON');
    expect(thrown.cause?.details?.['kind']).toBe('CHARITABLE_JIHA');
    // The jiha stays active — the refusal wrote nothing.
    const raw = await readRawBeneficiary(jiha.id);
    expect(raw.active).toBe(true);
  });

  it('kycFreshness reports STALE past the refresh window — the tri-state’s third arm, at the API', async () => {
    // ⚠ THE COVERAGE HOLE THE S5 CENSUS ADVERSARY FOUND: no API or e2e test drove a row to STALE, so
    // the STALE arm's date-argument wiring and the isKycStale inclusive/exclusive boundary rode
    // entirely on the shared @qmulate/domain import. This pins it at the API layer. A VERIFIED
    // refresh is stamped at instant T (the server clock); read back as-of T + ~2 years — well past
    // the 12-month kyc.refreshIntervalMonths (⚠ unverified vs primary law) — it is STALE, not FRESH
    // and not UNVERIFIED.
    const writer = createCaller(
      await contextFor({ userId: STAFF_WRITER, requestId: 'e4-kyc-stale-refresh' }),
    );
    const enrolled = await writer.beneficiary.enrol(
      familyEnrolInput({
        parentId: rootId,
        tabaqa: 2,
        relationshipAr: `مستحق تحقق قديم ${FICTIONAL_MARKER_AR}`,
      }) as never,
    );
    const refreshed = await writer.beneficiary.refreshKyc({
      waqfId: OWNED_WAQF,
      beneficiaryId: enrolled.id,
    });
    const refreshedAt = new Date(refreshed.kycLastRefreshed);

    const wayLater = new Date(refreshedAt);
    wayLater.setUTCFullYear(wayLater.getUTCFullYear() + 2);
    const future = createCaller(
      await contextFor({ userId: STAFF_WRITER, requestId: 'e4-kyc-stale-read', now: wayLater }),
    );
    const record = await future.beneficiary.get({ waqfId: OWNED_WAQF, beneficiaryId: enrolled.id });
    expect(record.verificationStatus).toBe('VERIFIED');
    expect(record.kycFreshness).toBe('STALE');
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * 5 · G-7 / V-5 SHARPENING — the registry on an UNGRANTED endowment does not exist
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('a staff seat granted on waqf-001 gets NOT_FOUND on waqf-003 — and the denial is audited once', async () => {
    const before = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      actorId: STAFF_NO_UBO,
      waqfId: UNGRANTED_WAQF,
    });

    const ctx = await contextFor({ userId: STAFF_NO_UBO, requestId: 'e4-g7-staff' });
    const thrown = await capture(() =>
      createCaller(ctx).beneficiary.list({ waqfId: UNGRANTED_WAQF }),
    );
    // NO_GRANT → NOT_FOUND, never FORBIDDEN: a FORBIDDEN on endowment B tells the caller that
    // endowment B exists — over four endowments and one family, an enumeration oracle (§10 §7.2).
    expect(thrown.code).toBe('NOT_FOUND');
    expect(thrown.code).not.toBe('FORBIDDEN');

    // ONE ACCESS_DENIED / ACCESS event, mirrored from scope-denial.integration.test.ts's pattern
    // (same counter, same base-client read): not zero, and not two.
    const after = await countAuditEvents({
      action: 'ACCESS_DENIED',
      category: 'ACCESS',
      actorId: STAFF_NO_UBO,
      waqfId: UNGRANTED_WAQF,
    });
    expect(after - before).toBe(1);
  });

  it('the beneficiary principal of waqf-001 gets NOT_FOUND on waqf-003 too', async () => {
    const ctx = await contextFor({ userId: BEN_PRINCIPAL, requestId: 'e4-g7-beneficiary' });
    const thrown = await capture(() =>
      createCaller(ctx).beneficiary.list({ waqfId: UNGRANTED_WAQF }),
    );
    expect(thrown.code).toBe('NOT_FOUND');
    expect(thrown.code).not.toBe('FORBIDDEN');
  });
});
