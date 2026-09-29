import { createHmac } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
  type TestInfo,
} from '@playwright/test';

/**
 * E6 · THE DISTRIBUTION RUN IN A REAL BROWSER, IN BOTH LOCALES — V-1'S CORPUS WALL AT THE
 * RENDERING LAYER.
 *
 * ── WHAT THIS FILE PROVES, AND EVERY NUMBER IN IT WAS MEASURED HERE ───────────────────────
 *   1. the wizard computes `waqf-001` for 2026-01-01…03-31 and renders the waterfall in the
 *      BINDING ORDER with the exact figures — ṣiyāna 40,000 → operating 0 → net 310,000 →
 *      Nazir fee 35,000 → distributable **275,000** — and the order is asserted from the
 *      TRACE's own ascending `seq`, not merely from the six totals sitting on one screen;
 *   2. **`rev-005` IS VISIBLY EXCLUDED.** The CAPITAL/istibdal receipt is PRESENT on the
 *      receipt step, struck through, named as corpus, counted — and it is NOT in the pool:
 *      income revenue reads 350,000.00 and no combined 4,550,000 total exists anywhere on
 *      any of the four steps in either locale. `rev-005` sits on the SAME asset as `rev-001`
 *      (`asset-002`, measured), so nothing but its CLASS can explain the difference;
 *   3. the ṣiyāna policy is surfaced where S7-6 put it — the deed's fixed rule wins over a
 *      recorded Nazir discretion and the screen says so as a CONFLICT — and `waqf-005`
 *      HALTS with a named discriminator instead of guessing;
 *   4. the approvals queue and the run's maker/checker record: two DISTINCT recorded
 *      identities on `appr-dist-001`, and a queue that is empty BY FACT rather than by refusal;
 *   5. a seat holding no grant at all reaches no distribution surface.
 *
 * ── ⚠ WHAT THIS FILE DELIBERATELY DOES **NOT** PROVE — V-6's GUARD ────────────────────────
 * **The segregation-of-duties GUARD is not testable from a browser and is not attempted here.**
 * The property is "the same IDENTITY that raised a run cannot approve it", and making it
 * non-vacuous needs ONE USER HOLDING TWO GRANTS (`FINANCE` + `NAZIR`) on one endowment. That
 * construction exists only in the API harness (`provisionTestSubjects`); **E2E has no
 * grant-issuing procedure, by design** (`kernel.spec.ts:43-44`), and no seeded seat holds both
 * shapes. A browser test asserting "the finance seat sees no Approve button" would be **GREEN
 * WITH SEGREGATION OF DUTIES DELETED**, because `approval:request:approve` lives in the `nazir`
 * preset and `distribution:run:initiate` does not — the two are disjoint whatever the guard does.
 * So test 4 asserts the RECORD (`makerId !== checkerId`, as rendered) and the screen's statement
 * of the rule, and says plainly that the guard itself stays at
 * `packages/api/test/distribution-maker-checker.integration.test.ts`.
 *
 * ── ⚠ THE SEAT, AND A COVERAGE INTERACTION THAT IS REPORTED RATHER THAN HIDDEN ────────────
 * MEASURED against the seeded grants (all five endowments, 27 grant rows): the ONLY seeded
 * shapes carrying `distribution:run:read` are **FINANCE** (6 perms) and **NAZIR** (13). The
 * `CASE_MANAGER` shape — whose handshake `endowment.spec.ts` and `beneficiaries.spec.ts`
 * already share — does **NOT** carry it, so this file could not join that door. Of the three
 * seats that can open these screens, all three are claimed:
 *
 *   `accountant@` (FINANCE) → `endowment.spec.ts` `SEATS.en`, enrolled in-file, no handshake
 *   `nazir@`      (NAZIR)   → `auth-journey.spec.ts`, enrolled in-file, no handshake
 *   `approver@`   (NAZIR)   → `kernel.spec.ts`, enrolled in-file, no handshake
 *
 * This file takes **`accountant@`**, and the choice is the cheapest of the three, measured:
 * `endowment.spec.ts` uses that seat in **one** test in the **`en` project only** (`SEATS.ar`
 * is `board@`), and both projects of that test assert the SAME property — "a granted seat
 * holding no endowment verb sees NO endowment" — so the property survives in `ar` via `board@`
 * even when this file wins the one-way door. Taking either NAZIR seat instead would degrade
 * BOTH projects of `kernel.spec.ts`'s positive control, which has no second seat behind it.
 *
 * ⚠ **AND THE ORDER-DEPENDENCE IS REAL, NAMED, AND NOT PAPERED OVER.** Enrolment is a one-way
 * door (`/two-factor/enable` returns the secret exactly once) and `/two-factor/disable` is
 * unreachable from a half-authenticated session, so whichever file signs in first enrols.
 * `distribution` sorts before `endowment`, so in a full suite this file wins and
 * `endowment.spec.ts`'s `en` test takes its own documented fallback branch — which still
 * asserts. The clean fix is for that file to publish a handshake the way the `case-manager`
 * seat already does; that is **owed**, not done here, because it is not this stage's file.
 * If the door is already taken this file FAILS LOUDLY with the remedy in the message: these
 * are POSITIVE assertions about a rendered screen and a seat that could not sign in must never
 * be reported as a pass.
 *
 * ── STRUCTURAL RULES INHERITED FROM THE OTHER SIX SPECS ───────────────────────────────────
 * One `BrowserContext` per test; API calls through `context.request` (same cookie jar); ONE
 * transport-fault re-attempt and never a retry of an answered response; the ar/en copy READ
 * FROM THE CATALOGUE, never typed into this file; every assertion scoped to the RENDERED DOM.
 *
 * ⚠ **THE LAST RULE IS LOAD-BEARING HERE AND WAS MEASURED THE HARD WAY.** `next-intl` mounts
 * `NextIntlClientProvider`, so **every catalogue key is serialised into the RSC payload of
 * every page**: `page.content()` on `waqf-001`'s review step CONTAINS the literal string
 * `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED` even though that flag is NOT rendered and NOT
 * raised. A `grep` over the page source would therefore "prove" a flag that never appeared.
 * Test 3 turns that trap into an assertion: the string is in the payload, the flag is absent
 * from the rendered list, and both are checked in the same breath.
 */

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * A minimal RFC 6238 TOTP generator (SHA-1, 6 digits, 30s), matching `totpOptions` in
 * `packages/auth` (`server.ts:116` — `{ digits: 6, period: 30 }`).
 *
 * ⚠ DUPLICATED FROM THE OTHER SPECS ON PURPOSE — their headers record why: a change to the
 * app's TOTP parameters must redden every file rather than being silently absorbed by a shared
 * helper that changed with it. This is the MILLISECONDS variant, matching
 * `endowment`/`endowment-journey`/`beneficiaries`, the files this one sits beside. (⚠ The suite
 * carries two incompatible signatures — `auth-journey`/`kernel` take SECONDS. Do not move one
 * of these into a shared module without reconciling all five.)
 * ────────────────────────────────────────────────────────────────────────────────────────── */

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of input.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index === -1) throw new Error(`not base32: ${char}`);
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let at = 0; at + 8 <= bits.length; at += 8) {
    bytes.push(Number.parseInt(bits.slice(at, at + 8), 2));
  }
  return Buffer.from(bytes);
}

function totp(secret: string, at: number = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeUInt32BE(Math.floor(at / 1000 / 30), 4);
  const digest = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = digest.readUInt8(digest.length - 1) & 0x0f;
  const binary = digest.readUInt32BE(offset) & 0x7fff_ffff;
  return String(binary % 1_000_000).padStart(6, '0');
}

function secretFromTotpUri(uri: unknown): string {
  if (typeof uri !== 'string') throw new Error(`no totpURI returned (got ${typeof uri})`);
  const secret = new URL(uri).searchParams.get('secret');
  if (secret === null || secret === '') throw new Error(`no secret in totpURI: ${uri}`);
  return secret;
}

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * FIXTURE FACTS — every one MEASURED against a freshly migrated + seeded database on
 * 2026-08-19 (migration 21, `pnpm db:seed`), and against the rendered DOM of a PRODUCTION
 * build (`next build` + `next start`). Nothing here is copied from a report.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

/** Published in `packages/database/src/seed/map.ts`; the seed prints it. Not a secret. */
const SEED_PASSWORD = 'fixture-only-not-a-secret-9271';

/**
 * The FINANCE seat — `user-accountant-001`, five ACTIVE grants, 6 permissions apiece.
 * MEASURED: `distribution:run:read`, `distribution:run:initiate`, `approval:request:read`,
 * `approval:request:initiate`, `finance:transaction:read`, `finance:transaction:write`.
 * ⚠ It does NOT hold `distribution:run:write`, `distribution:line_item:read` or
 * `line_item:write` — which is why no control on these screens writes, and why the stored
 * run's line-item panel is correctly absent (asserted in test 4, as a boundary rather than a gap).
 */
const SEAT: Seat = { email: 'accountant@example.test', password: SEED_PASSWORD };

/**
 * `user-unscoped` — MEASURED: **zero grant rows**. Not "granted nothing"; granted nothing at all.
 * ⚠ The one useful seat in the fixture that NO other spec claims (grep: no `unscoped@` in any
 * other `e2e/*.spec.ts`), so this file may enrol it without contending for a door.
 */
const UNGRANTED_SEAT: Seat = { email: 'unscoped@example.test', password: SEED_PASSWORD };

/** A seat is an email and a password. Nothing else — the GRANT lives in the database. */
interface Seat {
  readonly email: string;
  readonly password: string;
}

/** `FAMILY_DHURRI`, `ORDERED`, `ZUHUR_ONLY`, `MEDIUM`, Shart COMPLETE — V-1's endowment. */
const WAQF_ID = 'waqf-001';
/** The `LINEAGE_CONTINUATION` endowment whose reversion clause is unread — it HALTS. */
const HALTING_WAQF_ID = 'waqf-005';
/** V-1's fiscal window. */
const PERIOD = { start: '2026-01-01', end: '2026-03-31' } as const;

/** The seeded historical run and its approval. Both terminal — see test 4. */
const EXECUTED_RUN_ID = 'dist-001';
const EXECUTED_RUN_MAKER = 'user-accountant-001';
const EXECUTED_RUN_CHECKER = 'user-approver-001';

/**
 * THE WATERFALL, IN THE BINDING ORDER, AS RENDERED. `data-row` is the hook; the value is the
 * numeral inside the `<bdi>` with bidi controls stripped (see `money`).
 *
 * ⚠ `revenue` IS 350,000.00 AND THAT IS THE WHOLE POINT OF THIS FILE. The period holds
 * 350,000.00 of INCOME (`rev-001`) and 4,200,000.00 of CAPITAL (`rev-005`); if the corpus wall
 * ever leaked, this row would read 4,550,000.00 and every figure below it would move.
 */
const WATERFALL: readonly { readonly row: string; readonly sar: string }[] = [
  { row: 'revenue', sar: '350,000.00' },
  { row: 'maintenanceReserve', sar: '40,000.00' },
  { row: 'operating', sar: '0.00' },
  { row: 'netIncome', sar: '310,000.00' },
  { row: 'nazirFee', sar: '35,000.00' },
  { row: 'distributable', sar: '275,000.00' },
];

/** `rev-005` — CAPITAL / `ISTIBDAL_PROCEEDS`, on `asset-002`, the SAME asset as `rev-001`. */
const CORPUS_RECEIPT = { id: 'rev-005', sar: '4,200,000.00' } as const;

/**
 * ⚠ THE NUMBER THAT MUST NEVER EXIST: 350,000 + 4,200,000. Corpus and income are distinct and a
 * screen must never show a combined total (binding rule 1). Swept over the VISIBLE text of
 * `#qm-main` on every step in both locales. Arabic-digit spellings are included because the
 * catalogue could one day localise numerals; today it does not (Latin digits, Saudi banking
 * convention) and the extra members cost nothing.
 */
const FORBIDDEN_COMBINED_TOTALS: readonly string[] = [
  '4,550,000',
  '4550000',
  '٤,٥٥٠,٠٠٠',
  '٤٥٥٠٠٠٠',
];

/**
 * THE THREE LINES, ascending by `beneficiaryId`, exactly as rendered.
 *
 * ⚠ `ben-003` IS `WITHHELD`, NOT `EXCLUDED`, AND ITS ENTITLEMENT IS THE FULL 137,500.00 — a
 * procedural hold does not reduce entitlement by one halala (invariant I6). `ben-002` is the
 * ṭabaqa-2 member excluded while ṭabaqa 1 lives, and its entitlement really is 0.00.
 */
const LINES: readonly {
  readonly beneficiaryId: string;
  readonly status: string;
  readonly sar: string;
  readonly share: string;
  readonly reason: string | null;
  /** Which M1-a STATEMENT group carries the reason's approved sentence (M1-b consumes it). */
  readonly reasonGroup: 'exclusionReason' | 'withheldReason' | null;
  readonly gate: string | null;
}[] = [
  {
    beneficiaryId: 'ben-001',
    status: 'PAID',
    sar: '137,500.00',
    share: '50.000000',
    reason: null,
    reasonGroup: null,
    gate: null,
  },
  {
    beneficiaryId: 'ben-002',
    status: 'EXCLUDED',
    sar: '0.00',
    share: '0.000000',
    reason: 'UPPER_TABAQA_EXTANT',
    reasonGroup: 'exclusionReason',
    gate: null,
  },
  {
    beneficiaryId: 'ben-003',
    status: 'WITHHELD',
    sar: '137,500.00',
    share: '50.000000',
    reason: 'KYC_UNVERIFIED',
    // ⚠ The STATEMENT voice, deliberately distinct from the `errors.domain.*` toast voice the
    // gate list renders — both are asserted, because they are two different approved sentences.
    reasonGroup: 'withheldReason',
    gate: 'KYC_UNVERIFIED',
  },
];

/** Every line's run-level rule, TIER 1 — rendered as a machine code, never as a sentence. */
const ENTITLEMENT_RULE = 'ORDERED_LOWEST_LIVING_TABAQA';

/** `data-total` → the rendered numeral. */
const TOTALS: readonly { readonly total: string; readonly sar: string }[] = [
  { total: 'paid', sar: '137,500.00' },
  { total: 'withheld', sar: '137,500.00' },
  { total: 'crossBorder', sar: '0.00' },
  { total: 'retained', sar: '0.00' },
  { total: 'entitled', sar: '275,000.00' },
  { total: 'residual', sar: '0.00' },
];

/** The run's flags, in the canonical order the panel renders them. */
const RUN_FLAGS: readonly string[] = [
  'CAPITAL_RECEIPTS_EXCLUDED',
  'UNVERIFIED_FIGURES_APPLIED',
  'CONTINUATION_STIPULATION_NOT_APPLIED',
];

/**
 * ⚠ `I-C1` IS IN THE CHECKED LIST AND THAT IS THE CORPUS INVARIANT: "corpus never mixes with
 * income: no corpus receipt entered the distribution." `I8`/`I-L1`/`I-R1` make no claim about
 * this run and are listed separately — an invariant that says nothing must not read as a pass.
 */
const INVARIANTS_CHECKED: readonly string[] = [
  'I1',
  'I2',
  'I3',
  'I4',
  'I5',
  'I6',
  'I7',
  'I9',
  'I-C1',
];
const INVARIANTS_NOT_ASSERTED: readonly string[] = ['I8', 'I-L1', 'I-R1'];

/** MEASURED in the rendered DOM, and a byte inside the digest a Nazir signs. */
const ENGINE_VERSION = 'e6-distribution/4.0.0';

/**
 * THE BINDING ORDER, READ OFF THE TRACE. MEASURED `seq` values on the review step: 6, 7, 8, 9,
 * 10, all `stage=WATERFALL`. Asserted as ASCENDING POSITIONS, never as the literal numbers —
 * an added upstream step would renumber them without changing the order, and this assertion is
 * about the order.
 */
const WATERFALL_TRACE_ORDER: readonly string[] = [
  'MAINTENANCE_RESERVE',
  'OPERATING_COST',
  'NET_INCOME',
  'NAZIR_FEE',
  'DISTRIBUTABLE',
];

/** Also in the `WATERFALL` stage, BEFORE the reserve: the corpus wall inside the trace. */
const CAPITAL_TRACE_STEP = 'CAPITAL_RECEIPTS_EXCLUDED';

/**
 * ṢIYĀNA, SURFACED. `waqf-001`'s deed stipulates `{basis:'fixed', amountSar:40000}` AND a Nazir
 * discretion is recorded; the deed wins, and the screen states the disagreement as a CONFLICT
 * rather than silently preferring one. Q-S7-1's option (a) — "a data defect the UI must flag".
 */
const MAINTENANCE_CONFLICT = 'MAINTENANCE_DEED_RULE_WINS_OVER_RECORDED_NAZIR_DISCRETION';

/**
 * ⚠ THE FLAG THAT IS **NOT REACHABLE ON SEEDED DATA**, AND IS ASSERTED ABSENT ON PURPOSE.
 *
 * MEASURED across every computing seeded endowment: `waqf-001` (deed `fixed 40000`),
 * `waqf-002` (`percent 5` → reserve 10,000.00) and `waqf-003` (`fixed 100000`) all carry a deed
 * rule, and the deed wins — so none reaches the `UNSET` resolver arm. `waqf-004` is
 * `NA_DIRECT_USE`. Only `waqf-005` reaches `UNSET`, and it HALTS first at
 * `REVERSION_CLAUSE_UNREAD` — and a refusal carries no `flags` at all, so a halt cannot show a
 * flag beside it. Rendered-flag lists measured: `waqf-001` → the three in `RUN_FLAGS`;
 * `waqf-002` → `AUTHORITY_FEE_DETERMINATION_PENDING`, `UNVERIFIED_FIGURES_APPLIED`,
 * `CONTINUATION_STIPULATION_NOT_APPLIED`; `waqf-003` → `UNVERIFIED_FIGURES_APPLIED` alone.
 * **Not one of them raises this flag.** Confirms brief §8 Q-S7-2 independently.
 *
 * Its rendering therefore remains demonstrated only on a synthetic probe (S7-6), and this
 * constant exists so the ABSENCE is pinned rather than assumed — see test 3's payload trap.
 */
const UNREACHABLE_MAINTENANCE_FLAG = 'MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED';

/** `waqf-005` halts here: the reversion clause was never read, so entitlement is unresolvable. */
const HALT_DISCRIMINATOR = 'REVERSION_CLAUSE_UNREAD';

/* ═══ M1-b · THE COMPUTING LINEAGE SIBLING ═══════════════════════════════════════════════════
 * `waqf-007` — `LINEAGE_CONTINUATION` / `ZUHUR_ONLY`, deed recorded COMPLETE (its مآل clause was
 * READ and positively names no taker), one seeded income receipt in V-1's own window. The DEFAULT
 * deed shape (ADR-0009 R4), computing in the browser for the first time — waqf-005, the only
 * other lineage deed, is deliberately a halting subject and stays one (asserted in test 3).
 */
const LINEAGE_WAQF_ID = 'waqf-007';

/** Every waqf-007 line's rule — and since M1-a it HAS approved statement copy, asserted below. */
const LINEAGE_ENTITLEMENT_RULE = 'LINEAGE_PER_CAPITA_ZUHUR_ONLY';

/** The deed's own 10% ṣiyāna and 10% ʿushr on the seeded 400,000.00 — figures ⚠ unverified. */
const LINEAGE_WATERFALL: readonly { readonly row: string; readonly sar: string }[] = [
  { row: 'revenue', sar: '400,000.00' },
  { row: 'maintenanceReserve', sar: '40,000.00' },
  { row: 'operating', sar: '0.00' },
  { row: 'netIncome', sar: '360,000.00' },
  { row: 'nazirFee', sar: '40,000.00' },
  { row: 'distributable', sar: '320,000.00' },
];

/**
 * The four lines: the frontier pays two heads per capita; the two second-generation members are
 * excluded for the two DIFFERENT lineage reasons M1-a wired wording for.
 *
 * ⚠ ben-704 is blocked BOTH by a line this deed does not continue AND by his living mother; the
 * engine reports the PERMANENT reason over the temporary hold. That precedence is engineering's
 * call (`TODO(surface)` in resolver.ts, register item #12), NOT owner-ratified — if the owner
 * inverts it, ben-704's `reason` here flips to ENTITLEMENT_HELD_BY_LIVING_ANCESTOR.
 */
const LINEAGE_LINES: readonly {
  readonly beneficiaryId: string;
  readonly status: string;
  readonly sar: string;
  readonly share: string;
  readonly reason: string | null;
}[] = [
  {
    beneficiaryId: 'ben-701',
    status: 'PAID',
    sar: '160,000.00',
    share: '50.000000',
    reason: null,
  },
  {
    beneficiaryId: 'ben-702',
    status: 'PAID',
    sar: '160,000.00',
    share: '50.000000',
    reason: null,
  },
  {
    beneficiaryId: 'ben-703',
    status: 'EXCLUDED',
    sar: '0.00',
    share: '0.000000',
    // ⚠ TEMPORARY — reverses on ben-701's death; the approved Arabic deliberately does not read
    // as permanent, and the assertion below reads the sentence FROM THE CATALOGUE, never types it.
    reason: 'ENTITLEMENT_HELD_BY_LIVING_ANCESTOR',
  },
  {
    beneficiaryId: 'ben-704',
    status: 'EXCLUDED',
    sar: '0.00',
    share: '0.000000',
    reason: 'BUTUN_LINE_NOT_CONTINUED',
  },
];

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PLAYWRIGHT_PORT ?? 3000}`;

/** `testInfo.project.name` → the URL prefix. Both locales are first-class projects. */
function localeFor(projectName: string): 'ar' | 'en' {
  return projectName === 'ar' ? 'ar' : 'en';
}

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * THE COPY IS READ FROM THE CATALOGUE, NEVER TYPED HERE
 *
 * A sentence typed into a test is a second source of truth for product-approved legal text, and
 * the two drift silently. Reading the catalogue means a copy change reddens the RENDERING
 * assertion (the screen no longer matches the file) rather than the test's own expectation.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

interface Catalogue {
  readonly distribution: {
    readonly waterfall: Record<string, string>;
    readonly approval: Record<string, string>;
    readonly refusal: Record<string, string>;
    readonly receiptClass: Record<string, string>;
    readonly capitalSource: Record<string, string>;
    readonly diagnostic: Record<string, string>;
    readonly diagnosticSeverity: Record<string, string>;
    readonly runStatus: Record<string, string>;
    readonly flag: Record<string, string>;
    /** M1-a's approved STATEMENT groups — consumed by tests 2 and 3′, never typed into them. */
    readonly entitlementRule: Record<string, string>;
    readonly exclusionReason: Record<string, string>;
    readonly withheldReason: Record<string, string>;
    readonly engineVersion: string;
    readonly runDigest: string;
  };
  readonly endowments: { readonly reserved: { readonly status: Record<string, string> } };
  readonly errors: { readonly domain: Record<string, string> };
  readonly nav: Record<string, string>;
}

function catalogue(locale: 'ar' | 'en'): Catalogue {
  const path = fileURLToPath(
    new URL(`../../../packages/i18n/messages/${locale}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, 'utf8')) as Catalogue;
}

function must(value: string | undefined, name: string): string {
  if (value === undefined || value === '') {
    throw new Error(
      `the catalogue has no entry for ${name}. This test reads its expected copy from the ` +
        `catalogue rather than typing it, so a missing key is a real gap, not a test bug.`,
    );
  }
  return value;
}

/**
 * A raw dotted message key — what `next-intl` PRINTS when a message is missing, instead of
 * throwing. The trailing `[a-zA-Z]` discriminates a missing translation from an ordinary full
 * stop. ⚠ `distribution` is included here and was NOT in the other specs' pattern: this file is
 * the first to render that namespace, and a namespace absent from the scan is a namespace whose
 * missing keys ship.
 */
const RAW_KEY_PATTERN =
  /(?:distribution|endowments|errors|common|nav|auth)\.[a-zA-Z][a-zA-Z0-9_]*[a-zA-Z]/;

/**
 * Bidi control characters. ⚠ MEASURED, AND NECESSARY: in `ar` the rendered money string is
 * `‏4,200,000.00 SAR` — an RLM, then the numeral, then the code AFTER it — while `en`
 * renders `SAR 4,200,000.00`. A test asserting the `en` spelling in both locales would fail in
 * Arabic for a reason that is not a defect. So: strip the marks, then assert that the element
 * carries BOTH the currency code and the exact numeral, in whichever order the locale puts them.
 */
const BIDI_CONTROLS = /[‎‏؜⁦-⁩]/g;

/** The visible text of one element, bidi-stripped and whitespace-collapsed. */
async function plainText(locator: Locator): Promise<string> {
  return (await locator.innerText()).replace(BIDI_CONTROLS, '').replace(/\s+/g, ' ').trim();
}

/** The visible text of the whole main region — the reader's view, never `page.content()`. */
async function mainText(page: Page): Promise<string> {
  return (await page.locator('#qm-main').innerText()).replace(BIDI_CONTROLS, '');
}

/**
 * One money assertion, locale-independent: the element says `SAR` and says exactly this numeral.
 * Asserting the numeral as a SUBSTRING of a bidi-stripped string is deliberate — the separator
 * placement is the locale's business, the digits are the product's.
 */
async function expectSar(locator: Locator, sar: string, where: string): Promise<void> {
  const text = await plainText(locator);
  expect(text, `${where}: expected the currency code beside the figure, got "${text}"`).toContain(
    'SAR',
  );
  expect(text, `${where}: expected the figure ${sar}, got "${text}"`).toContain(sar);
}

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * A REQUEST THAT SURVIVES ONE TRANSPORT FAULT — AND NOTHING ELSE
 *
 * ⚠ NOT A RETRY OF AN ASSERTION. A transport fault has no status and no body, so it says
 * nothing about the product. ONE re-attempt, only when the call THREW (an answered 4xx/5xx is a
 * RESULT and is returned untouched, so no refusal can be hidden here). DUPLICATED per spec on
 * purpose, like the TOTP generator.
 * ────────────────────────────────────────────────────────────────────────────────────────── */

const TRANSPORT_FAULT =
  /socket hang up|ECONNRESET|EPIPE|socket disconnected|connection closed|connection was reset/i;

async function getSurvivingOneTransportFault(
  request: APIRequestContext,
  url: string,
  options?: { maxRedirects?: number },
): Promise<APIResponse> {
  try {
    return await request.get(url, options);
  } catch (first) {
    if (!TRANSPORT_FAULT.test(String(first))) throw first;
    await new Promise((done) => setTimeout(done, 250));
    try {
      return await request.get(url, options);
    } catch (second) {
      throw new Error(
        `GET ${url} failed at the TRANSPORT level TWICE — no status, no body, so this is not a ` +
          `statement about the product: the server is unreachable or is closing connections. ` +
          `first: ${String(first)} · second: ${String(second)}`,
      );
    }
  }
}

async function post(
  request: APIRequestContext,
  path: string,
  data: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  // better-auth requires an explicit `Origin` on a cross-origin-looking POST.
  const response = await request.post(`/api/auth${path}`, {
    data,
    headers: { origin: BASE_URL },
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await response.json()) as Record<string, unknown>;
  } catch {
    body = { raw: await response.text() };
  }
  return { status: response.status(), body };
}

/** better-auth's own view of the session — `undefined` until the second factor is asserted. */
async function sessionUser(
  request: APIRequestContext,
): Promise<Record<string, unknown> | undefined> {
  const response = await getSurvivingOneTransportFault(request, '/api/auth/get-session');
  if (!response.ok()) return undefined;
  const body = (await response.json()) as { user?: Record<string, unknown> } | null;
  return body?.user ?? undefined;
}

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * THE SEAT HANDSHAKE — ONE ENROLMENT PER SEAT PER DATABASE, SHARED BY BOTH LOCALE PROJECTS
 *
 * Both Playwright projects run against ONE database, and TOTP enrolment is a one-way door. So
 * whichever project arrives first wins an ATOMIC `mkdir`, enrols ONCE, and publishes the
 * SESSION by `rename`; the other opens a context from the published `storageState`.
 *
 * ⚠ THE SHARED ARTEFACT IS THE SESSION, NEVER THE SECRET — the same conclusion
 * `endowment-journey.spec.ts` reached by measurement: sharing the SECRET means every seated
 * test performs its own `/two-factor/verify-totp`, and inside one 30-second window those calls
 * collide. A session cookie is reusable by construction; a TOTP code is not.
 *
 * Two seats, two directories: they are independent doors and must not share a leader election.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

const HANDSHAKE_STALE_MS = 15 * 60 * 1000;
const FOLLOWER_WAIT_MS = 25_000;

function handshakeDir(seat: Seat): string {
  return join(tmpdir(), `qmulate-e2e-seat-${seat.email.split('@')[0] ?? 'unknown'}`);
}
function statePath(seat: Seat): string {
  return join(handshakeDir(seat), 'storage-state.json');
}
function stalePath(seat: Seat): string {
  return join(handshakeDir(seat), 'stale.json');
}

function ageMs(path: string): number {
  try {
    return Date.now() - statSync(path).mtimeMs;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function publishStale(seat: Seat, why: string): void {
  const temporary = `${stalePath(seat)}.${String(process.pid)}.tmp`;
  writeFileSync(temporary, JSON.stringify({ stale: why, at: Date.now() }), 'utf8');
  renameSync(temporary, stalePath(seat));
}

function readStale(seat: Seat): string | null {
  try {
    return (JSON.parse(readFileSync(stalePath(seat), 'utf8')) as { stale: string }).stale;
  } catch {
    return null;
  }
}

/** Does the published `storageState` still resolve to this seat? Validated by USE, not by age. */
async function publishedSessionIsTheSeat(browser: Browser, seat: Seat): Promise<boolean> {
  if (!existsSync(statePath(seat))) return false;
  let context: BrowserContext;
  try {
    context = await browser.newContext({ storageState: statePath(seat) });
  } catch {
    return false; // an unreadable / half-written state file
  }
  try {
    const user = await sessionUser(context.request);
    return user?.email === seat.email && user.twoFactorEnabled === true;
  } finally {
    await context.close();
  }
}

/**
 * Establish (or join) the one enrolled session for `seat`. THROWS rather than degrading: every
 * assertion in this file is a POSITIVE statement about a rendered screen, and "the seat could
 * not run" must never be reported as a pass.
 */
async function ensureSeatSession(browser: Browser, seat: Seat, testInfo: TestInfo): Promise<void> {
  if (await publishedSessionIsTheSeat(browser, seat)) return;

  // A published state that no longer resolves, or an orphaned lock from a killed run.
  if (existsSync(statePath(seat)) || ageMs(handshakeDir(seat)) > HANDSHAKE_STALE_MS) {
    rmSync(handshakeDir(seat), { recursive: true, force: true });
  }

  let leader = false;
  try {
    mkdirSync(handshakeDir(seat));
    leader = true;
  } catch {
    leader = false;
  }

  if (leader) {
    const context = await browser.newContext();
    try {
      const signIn = await post(context.request, '/sign-in/email', {
        email: seat.email,
        password: seat.password,
      });
      expect(signIn.status, `${seat.email} cannot sign in: ${JSON.stringify(signIn.body)}`).toBe(
        200,
      );

      if (signIn.body.twoFactorRedirect === true) {
        // ⚠ THE ONE-WAY DOOR, ALREADY TAKEN. Publish the reason so the follower fails with the
        // cause instead of a timeout, then fail with the remedy. Do NOT degrade into a skip.
        publishStale(
          seat,
          `${seat.email} is TOTP-enrolled from an earlier run or another spec, and no published ` +
            `session resolves, so its secret is unrecoverable here.`,
        );
      }
      expect(
        signIn.body.twoFactorRedirect,
        `${seat.email} carries a COMPLETED TOTP enrolment and no published session resolves, so ` +
          `these screens cannot be opened and this file's POSITIVE assertions cannot run.\n` +
          `  · In a FULL suite this means another spec won the one-way door first — see this ` +
          `file's header: \`endowment.spec.ts\` enrols the same seat in-file without publishing ` +
          `a handshake, and the fix owed there is to publish one (as the \`case-manager\` seat ` +
          `already does).\n` +
          `  · Otherwise: re-seed the database, or delete the seeded operators' \`two_factor\` ` +
          `rows, and re-run. This is reported rather than skipped on purpose.`,
      ).not.toBe(true);

      const enable = await post(context.request, '/two-factor/enable', {
        password: seat.password,
      });
      expect(enable.status, `enrolment failed: ${JSON.stringify(enable.body)}`).toBe(200);
      const secret = secretFromTotpUri(enable.body.totpURI);
      const verify = await post(context.request, '/two-factor/verify-totp', { code: totp(secret) });
      expect(verify.status, `verification failed: ${JSON.stringify(verify.body)}`).toBe(200);

      // ⚠ THE ENROLMENT IS PROVEN, NOT ASSUMED. `enable` and `verify-totp` both answer 200 while
      // `twoFactorEnabled` stays FALSE when a `two_factor` row survives a re-seed.
      const user = await sessionUser(context.request);
      expect(
        user?.twoFactorEnabled,
        `${seat.email} reported a successful TOTP enrolment while still un-enrolled — a ` +
          `\`two_factor\` row from an earlier run survives \`db:seed\`. Delete those rows, or ` +
          `re-create the cluster, and re-run.`,
      ).toBe(true);

      const temporary = `${statePath(seat)}.${String(process.pid)}.tmp`;
      await context.storageState({ path: temporary });
      renameSync(temporary, statePath(seat));
      testInfo.annotations.push({
        type: 'seat',
        description: `${seat.email} enrolled; session published for both locales`,
      });
      return;
    } finally {
      await context.close();
    }
  }

  const deadline = Date.now() + FOLLOWER_WAIT_MS;
  while (Date.now() < deadline) {
    if (existsSync(statePath(seat))) return;
    const stale = readStale(seat);
    if (stale !== null) throw new Error(`${seat.email} is unavailable: ${stale}`);
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(
    `no session for ${seat.email} was published within ${String(FOLLOWER_WAIT_MS)}ms. These are ` +
      `POSITIVE assertions about a rendered screen, so a seat that never signed in is the ` +
      `failure they exist to catch — reported rather than skipped.`,
  );
}

/** One seated read: the shared session verified as THE seat, then the body, then teardown. */
async function seated(
  browser: Browser,
  seat: Seat,
  testInfo: TestInfo,
  body: (page: Page, context: BrowserContext) => Promise<void>,
): Promise<void> {
  await ensureSeatSession(browser, seat, testInfo);
  const context = await browser.newContext({ storageState: statePath(seat) });
  const page = await context.newPage();
  try {
    // A stale state file would otherwise fail deep inside a screen assertion — "row not found" —
    // which points at the UI for an auth problem.
    const user = await sessionUser(context.request);
    expect(user?.email, `the published session is not ${seat.email}`).toBe(seat.email);
    await body(page, context);
  } finally {
    await page.close();
    await context.close();
  }
}

/** No raw dotted message key reached the reader. Scoped to VISIBLE text, never `page.content()`. */
async function expectNoRawKeys(page: Page, where: string): Promise<void> {
  const match = RAW_KEY_PATTERN.exec(await mainText(page));
  expect(
    match?.[0] ?? null,
    `a raw message key was rendered on ${where} — the catalogue is missing an entry`,
  ).toBeNull();
}

/** Corpus and income never appear as one figure. Swept over the reader's view of a whole screen. */
async function expectNoCombinedTotal(page: Page, where: string): Promise<void> {
  const visible = await mainText(page);
  for (const forbidden of FORBIDDEN_COMBINED_TOTALS) {
    expect(
      visible.includes(forbidden),
      `${where} rendered ${forbidden} — corpus (${CORPUS_RECEIPT.sar}) and income ` +
        `(${WATERFALL[0]?.sar ?? '—'}) were combined into one total, which binding rule 1 forbids`,
    ).toBe(false);
  }
}

/** The wizard's URL. Its whole state is search params, so a step is a navigation, not a click. */
function wizardUrl(locale: 'ar' | 'en', waqfId: string, step: string): string {
  return (
    `/${locale}/distributions/${waqfId}/new` +
    `?periodStart=${PERIOD.start}&periodEnd=${PERIOD.end}&step=${step}`
  );
}

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 1 · DENY BY DEFAULT — every distribution surface, unauthenticated
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E6 · every distribution surface refuses an unauthenticated reader', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  // A FRESH context: no storage state, so no session cookie can leak in from a sibling test.
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    const surfaces = [
      `/${locale}/distributions`,
      `/${locale}/distributions/${WAQF_ID}`,
      wizardUrl(locale, WAQF_ID, 'review'),
      `/${locale}/distributions/${WAQF_ID}/runs/${EXECUTED_RUN_ID}`,
      `/${locale}/approvals`,
    ];

    for (const surface of surfaces) {
      const response = await getSurvivingOneTransportFault(context.request, surface, {
        maxRedirects: 0,
      });
      expect(response.status(), `${surface} did not redirect`).toBe(307);
      expect(
        response.headers()['location'] ?? '',
        `${surface} redirected somewhere other than sign-in`,
      ).toContain(`/${locale}/sign-in`);
    }

    // …and a real browser actually LANDS there, with the form to prove it is the page and not a
    // redirect loop. The status assertions above cannot tell those two apart.
    await page.goto(wizardUrl(locale, WAQF_ID, 'review'));
    await expect(page).toHaveURL(new RegExp(`/${locale}/sign-in`));
  } finally {
    await page.close();
    await context.close();
  }
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 2 · V-1 IN THE BROWSER, AND THE CORPUS WALL
 *
 * The wizard's state is entirely in the URL, so each step is a server render of a navigation.
 * That is what makes this test able to assert four screens without a single client-side click.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E6/V-1 · the wizard computes waqf-001, and the corpus receipt rev-005 is VISIBLY EXCLUDED', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);
  test.setTimeout(120_000);

  await seated(browser, SEAT, testInfo, async (page) => {
    /* ── 2a · THE RECEIPT STEP: rev-005 IS PRESENT, AND PRESENTED AS CORPUS ─────────────── */

    await page.goto(wizardUrl(locale, WAQF_ID, 'period'));
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    await expect(page.locator('html')).toHaveAttribute('lang', locale);

    const corpusPanel = page.getByTestId('qm-corpus-receipts');
    await expect(corpusPanel).toBeVisible();
    await expect(corpusPanel).toContainText(must(copy.distribution.waterfall.corpusTitle, 'title'));

    // The receipt itself, addressed by the id the ledger gave it — not by position in a list.
    const receiptRow = page.locator(
      `[data-testid="qm-corpus-receipt"][data-transaction-id="${CORPUS_RECEIPT.id}"]`,
    );
    await expect(receiptRow, `${CORPUS_RECEIPT.id} is not on the receipt step`).toHaveCount(1);

    // EXCLUDED VISIBLY, not merely absent from a total: the id and the amount are inside a real
    // `<del>`. A struck-through figure is the one rendering that says "this was seen and held out".
    const struck = receiptRow.locator('del');
    await expect(struck, 'the corpus receipt is not struck through').toHaveCount(1);
    await expect(struck).toContainText(CORPUS_RECEIPT.id);
    await expectSar(struck, CORPUS_RECEIPT.sar, 'the struck corpus receipt');

    // …and NAMED, in the reader's language, from the catalogue: corpus, and which kind of corpus.
    await expect(receiptRow).toContainText(must(copy.distribution.receiptClass.CAPITAL, 'CAPITAL'));
    await expect(receiptRow).toContainText(
      must(copy.distribution.capitalSource.ISTIBDAL_PROCEEDS, 'ISTIBDAL_PROCEEDS'),
    );

    // Exactly one corpus receipt in the window, and the panel says so rather than implying it.
    expect(await plainText(page.getByTestId('qm-corpus-count'))).toBe('1');
    await expectSar(page.getByTestId('qm-corpus-total'), CORPUS_RECEIPT.sar, 'the corpus total');

    // The sentence that stops the two figures being added: rendered beside the total, not buried.
    await expect(corpusPanel).toContainText(
      must(copy.distribution.waterfall.corpusNoTotal, 'corpusNoTotal'),
    );

    await expectNoCombinedTotal(page, 'the receipt step');
    await expectNoRawKeys(page, 'the receipt step');

    /* ── 2b · THE WATERFALL: SIX FIGURES, AND THE BINDING ORDER FROM THE TRACE ──────────── */

    await page.goto(wizardUrl(locale, WAQF_ID, 'waterfall'));
    await expect(page.getByTestId('qm-waterfall')).toBeVisible();

    for (const { row, sar } of WATERFALL) {
      const cell = page.locator(`[data-testid="qm-waterfall-row"][data-row="${row}"]`);
      await expect(cell, `the waterfall has no ${row} row`).toHaveCount(1);
      await expectSar(cell, sar, `waterfall row ${row}`);
    }

    // ⚠ THE PROOF THAT rev-005 IS OUT OF THE POOL. `revenue` is the INCOME revenue; if the corpus
    // wall leaked it would read 4,550,000.00. Asserted as an exact-figure check above, and as the
    // absence of the combined number here — two independent ways for one defect to be caught.
    await expectNoCombinedTotal(page, 'the waterfall step');
    await expectNoRawKeys(page, 'the waterfall step');

    // The corpus block is on this step too, so the reader never sees the pool without the exclusion.
    await expect(
      page.locator(`[data-testid="qm-corpus-receipt"][data-transaction-id="${CORPUS_RECEIPT.id}"]`),
    ).toHaveCount(1);

    /* ── 2c · THE LINES ────────────────────────────────────────────────────────────────── */

    await page.goto(wizardUrl(locale, WAQF_ID, 'lines'));
    const lines = page.getByTestId('qm-line');
    await expect(lines, 'expected exactly three lines').toHaveCount(LINES.length);

    for (const line of LINES) {
      const row = page.locator(
        `[data-testid="qm-line"][data-beneficiary-id="${line.beneficiaryId}"]`,
      );
      await expect(row, `no line for ${line.beneficiaryId}`).toHaveCount(1);
      await expect(row, `${line.beneficiaryId} is not ${line.status}`).toHaveAttribute(
        'data-line-status',
        line.status,
      );

      await expectSar(
        row.getByTestId('qm-line-entitled'),
        line.sar,
        `${line.beneficiaryId} entitlement`,
      );
      expect(
        await plainText(row.getByTestId('qm-line-share')),
        `${line.beneficiaryId} share`,
      ).toContain(line.share);

      // The run-level rule, in every line, in both locales. Since M1-b the code has its M1-a
      // approved sentence rendered beside it; the CODE stays asserted because it is what an
      // operator quotes, and the sentence assertion lives in the lineage test (3′).
      await expect(row.getByTestId('qm-line-rule')).toContainText(ENTITLEMENT_RULE);

      if (line.reason !== null) {
        await expect(
          row.getByTestId('qm-line-reason'),
          `${line.beneficiaryId} does not name its reason`,
        ).toContainText(line.reason);
      }
      if (line.reason !== null && line.reasonGroup !== null) {
        // ⊕ M1-b: the reason's APPROVED sentence, from whichever statement group carries it —
        // consumed from the catalogue, never typed here.
        await expect(
          row.locator('[data-testid="qm-line-reason-statement"]'),
          `${line.beneficiaryId} does not render the approved ${line.reasonGroup} sentence`,
        ).toContainText(
          must(
            copy.distribution[line.reasonGroup][line.reason],
            `${line.reasonGroup}.${line.reason}`,
          ),
        );
      }
      if (line.gate !== null) {
        await expect(
          row.getByTestId('qm-line-gate'),
          `${line.beneficiaryId} does not name its procedural hold`,
        ).toContainText(line.gate);
        // `KYC_UNVERIFIED` is a gate code that HAS approved copy — so the reader gets the
        // sentence as well as the code. That is the tier-2 rendering, and it is asserted from
        // the catalogue rather than typed here.
        await expect(row.getByTestId('qm-line-gate')).toContainText(
          must(copy.errors.domain.KYC_UNVERIFIED, 'errors.domain.KYC_UNVERIFIED'),
        );
      }
    }

    for (const { total, sar } of TOTALS) {
      const cell = page.locator(`[data-testid="qm-total"][data-total="${total}"]`);
      await expect(cell, `the totals have no ${total}`).toHaveCount(1);
      await expectSar(cell, sar, `total ${total}`);
    }

    await expectNoCombinedTotal(page, 'the lines step');
    await expectNoRawKeys(page, 'the lines step');

    /* ── 2d · THE REVIEW STEP: FLAGS, INVARIANTS, THE ENGINE'S IDENTITY, THE ORDER ──────── */

    await page.goto(wizardUrl(locale, WAQF_ID, 'review'));

    const flags = page.getByTestId('qm-run-flag');
    await expect(flags).toHaveCount(RUN_FLAGS.length);
    for (const flag of RUN_FLAGS) {
      const item = page.locator(`[data-testid="qm-run-flag"][data-flag="${flag}"]`);
      await expect(item, `the run does not raise ${flag}`).toHaveCount(1);
      // A flag renders as its APPROVED SENTENCE and its code — not as a bare token.
      await expect(item).toContainText(must(copy.distribution.flag[flag], `flag.${flag}`));
    }

    // ⚠ `CAPITAL_RECEIPTS_EXCLUDED` IS THE RUN SAYING SO ITSELF. The corpus wall is asserted three
    // times over now: the struck receipt, the un-inflated revenue row, and this flag.
    expect(RUN_FLAGS).toContain('CAPITAL_RECEIPTS_EXCLUDED');

    for (const id of INVARIANTS_CHECKED) {
      await expect(
        page.locator(`[data-testid="qm-invariant-checked"][data-invariant="${id}"]`),
        `${id} is not listed as checked`,
      ).toHaveCount(1);
    }
    await expect(page.getByTestId('qm-invariant-checked')).toHaveCount(INVARIANTS_CHECKED.length);

    for (const id of INVARIANTS_NOT_ASSERTED) {
      await expect(
        page.locator(`[data-testid="qm-invariant-not-asserted"][data-invariant="${id}"]`),
        `${id} is not listed as making no claim`,
      ).toHaveCount(1);
    }
    await expect(page.getByTestId('qm-invariant-not-asserted')).toHaveCount(
      INVARIANTS_NOT_ASSERTED.length,
    );

    // ⚠ I-C1 IS THE CORPUS INVARIANT AND IT IS IN THE **CHECKED** LIST. An invariant listed as
    // "makes no claim" would be the same screen with none of the assurance.
    expect(INVARIANTS_CHECKED).toContain('I-C1');
    expect(INVARIANTS_NOT_ASSERTED).not.toContain('I-C1');

    // The build that produced the answer, on screen, because it is a byte inside the digest.
    await expect(page.locator('#qm-main')).toContainText(ENGINE_VERSION);
    await expect(page.locator('#qm-main')).toContainText(
      must(copy.distribution.engineVersion, 'engineVersion'),
    );

    /* ── THE BINDING ORDER, READ OFF THE TRACE ──────────────────────────────────────────
     * ⚠ NOT THE SAME ASSERTION AS 2b. Six figures on one screen could be produced in any order;
     * the trace is the engine's own account of the sequence. Asserted as ascending POSITIONS so
     * that an added upstream step renumbers nothing that matters.
     * ──────────────────────────────────────────────────────────────────────────────────── */

    const traceSteps = page.getByTestId('qm-trace-step');
    const traceCount = await traceSteps.count();
    expect(traceCount, 'the run rendered no trace').toBeGreaterThan(0);

    const traceText: string[] = [];
    for (let at = 0; at < traceCount; at += 1) {
      traceText.push(await plainText(traceSteps.nth(at)));
    }
    const positionOf = (code: string): number => {
      const at = traceText.findIndex((text) => text.includes(code));
      expect(at, `the trace does not contain ${code}`).toBeGreaterThanOrEqual(0);
      return at;
    };

    const orderedPositions = WATERFALL_TRACE_ORDER.map(positionOf);
    for (let at = 1; at < orderedPositions.length; at += 1) {
      const previous = orderedPositions[at - 1] ?? -1;
      const current = orderedPositions[at] ?? -1;
      expect(
        current,
        `the waterfall trace is out of order: ${String(WATERFALL_TRACE_ORDER[at])} did not follow ` +
          `${String(WATERFALL_TRACE_ORDER[at - 1])}. Ṣiyāna is reserved from income BEFORE any ` +
          `cost, then operating, then the Nazir fee — the order is binding.`,
      ).toBeGreaterThan(previous);
    }

    // …and the corpus was held out BEFORE the reserve was taken, in the same stage.
    expect(
      positionOf(CAPITAL_TRACE_STEP),
      `${CAPITAL_TRACE_STEP} must precede the maintenance reserve: the pool is income-only ` +
        `before anything is deducted from it`,
    ).toBeLessThan(orderedPositions[0] ?? Number.MAX_SAFE_INTEGER);

    await expectNoCombinedTotal(page, 'the review step');
    await expectNoRawKeys(page, 'the review step');

    /* ── UNVERIFIED FIGURES ARE MARKED AS SUCH, NOT PRESENTED AS SETTLED TRUTH ──────────── */

    await expect(
      page.getByTestId('qm-unverified').first(),
      'the review step applies regulatory figures and does not mark them unverified',
    ).toBeVisible();

    /* ── NOTHING ON THIS SCREEN WRITES, FOR THIS SEAT ────────────────────────────────────
     * MEASURED: the FINANCE grant carries `distribution:run:initiate` and NOT
     * `distribution:run:write`, and `submit` needs both (the Prisma scoping extension gates
     * `Distribution` writes on `run:write`). So the Submit control is correctly not offered, and
     * a control that cannot succeed must not be rendered as though it could.
     * ──────────────────────────────────────────────────────────────────────────────────── */
    await expect(page.getByTestId('qm-wizard-submit')).toHaveCount(0);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 3 · THE ṢIYĀNA POLICY IS SURFACED — AND waqf-005 HALTS RATHER THAN GUESSING
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E6 · the ṣiyāna policy is surfaced as a conflict, and waqf-005 HALTS instead of guessing', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);
  test.setTimeout(120_000);

  await seated(browser, SEAT, testInfo, async (page) => {
    /* ── 3a · waqf-001: THE DEED'S RULE WINS, AND THE DISAGREEMENT IS STATED ────────────── */

    await page.goto(wizardUrl(locale, WAQF_ID, 'review'));

    // The reserve that was actually taken — the deed's `fixed 40000`, first in the waterfall.
    await expectSar(
      page.locator('[data-testid="qm-waterfall-row"][data-row="maintenanceReserve"]'),
      '40,000.00',
      'the ṣiyāna reserve',
    );

    const conflict = page.locator(
      `[data-testid="qm-diagnostic"][data-diagnostic="${MAINTENANCE_CONFLICT}"]`,
    );
    await expect(
      conflict,
      `the deed rule and the recorded Nazir discretion disagree on waqf-001 and the screen does ` +
        `not flag it. Q-S7-1 was answered "a data defect the UI must flag", so a silent ` +
        `preference for one of the two is the defect.`,
    ).toHaveCount(1);

    // It renders as a CONFLICT — the severity is the part that makes it more than a note — plus
    // the approved sentence AND the machine code an operator quotes in a ticket.
    await expect(conflict).toContainText(
      must(copy.distribution.diagnosticSeverity.CONFLICT, 'diagnosticSeverity.CONFLICT'),
    );
    await expect(conflict).toContainText(
      must(
        copy.distribution.diagnostic[MAINTENANCE_CONFLICT],
        `diagnostic.${MAINTENANCE_CONFLICT}`,
      ),
    );
    await expect(conflict.getByTestId('qm-diagnostic-code')).toContainText(MAINTENANCE_CONFLICT);

    /* ── 3b · THE RSC-PAYLOAD TRAP, TURNED INTO AN ASSERTION ─────────────────────────────
     * ⚠ THIS IS THE MOST IMPORTANT FOUR LINES IN THIS FILE.
     *
     * `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED` is NOT raised on any seeded endowment (see the
     * constant's own note: all four computing deeds carry a maintenance rule, and the only
     * `UNSET` deed halts first). But `next-intl` serialises the WHOLE catalogue into every
     * page's RSC payload, so the literal string IS in `page.content()`.
     *
     * A `grep`-style test would therefore report this flag as rendered — on every page, forever.
     * Both halves are asserted here so that the day the flag becomes reachable, the SECOND
     * assertion fails and tells the truth, while the first keeps proving the scan is honest.
     * ──────────────────────────────────────────────────────────────────────────────────── */

    expect(
      (await page.content()).includes(UNREACHABLE_MAINTENANCE_FLAG),
      `${UNREACHABLE_MAINTENANCE_FLAG} is no longer in the RSC payload. If the catalogue key was ` +
        `renamed or removed, this file's negative control below is now vacuous and must be re-aimed.`,
    ).toBe(true);

    await expect(
      page.locator(`[data-testid="qm-run-flag"][data-flag="${UNREACHABLE_MAINTENANCE_FLAG}"]`),
      `${UNREACHABLE_MAINTENANCE_FLAG} is RENDERED on waqf-001. Either a seeded deed changed, or ` +
        `the flag list is being read from the serialised catalogue instead of from the run.`,
    ).toHaveCount(0);

    /* ── 3c · waqf-005 HALTS: A NAMED DISCRIMINATOR, NO FIGURES, NO CONTROL ─────────────── */

    await page.goto(wizardUrl(locale, HALTING_WAQF_ID, 'review'));

    const refusal = page.getByTestId('qm-run-refusal');
    await expect(refusal, 'waqf-005 did not refuse').toBeVisible();
    await expect(refusal).toContainText(must(copy.distribution.refusal.title, 'refusal.title'));

    // The catalogued statement of WHY — the engine refuses to guess the founder's intent.
    await expect(refusal).toContainText(
      must(copy.errors.domain.SHART_INCOMPLETE, 'errors.domain.SHART_INCOMPLETE'),
    );

    // …and the SPECIFIC discriminator, as a machine code. Never a bare `SHART_INCOMPLETE`: the
    // discriminator is what tells an operator which clause is missing.
    const discriminator = page.locator(
      `[data-testid="qm-refusal-discriminator"][data-refusal="${HALT_DISCRIMINATOR}"]`,
    );
    await expect(discriminator, `the halt does not name ${HALT_DISCRIMINATOR}`).toHaveCount(1);
    await expect(discriminator).toContainText(HALT_DISCRIMINATOR);

    // A halt produces NO figure and offers NO way forward. Both are the refusal being real.
    await expect(page.getByTestId('qm-waterfall')).toHaveCount(0);
    await expect(page.getByTestId('qm-corpus-receipts')).toHaveCount(0);
    await expect(page.getByTestId('qm-line')).toHaveCount(0);
    await expect(page.getByTestId('qm-wizard-submit')).toHaveCount(0);

    await expectNoRawKeys(page, 'the waqf-005 halt');
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 3′ · M1-b — V-1's LINEAGE HALF, RENDERED: the DEFAULT deed shape computes, and the
 *      beneficiary reads the drafter's APPROVED sentences, not machine codes alone
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('M1-b · waqf-007 computes the DEFAULT lineage deed, rendering the approved wording', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);
  test.setTimeout(120_000);

  await seated(browser, SEAT, testInfo, async (page) => {
    /* ── THE LINES: two frontier heads paid per capita, both wired exclusions rendered ────── */

    await page.goto(wizardUrl(locale, LINEAGE_WAQF_ID, 'lines'));

    const lines = page.getByTestId('qm-line');
    await expect(lines, 'expected exactly four lines').toHaveCount(LINEAGE_LINES.length);

    for (const line of LINEAGE_LINES) {
      const row = page.locator(
        `[data-testid="qm-line"][data-beneficiary-id="${line.beneficiaryId}"]`,
      );
      await expect(row, `no line for ${line.beneficiaryId}`).toHaveCount(1);
      await expect(row, `${line.beneficiaryId} is not ${line.status}`).toHaveAttribute(
        'data-line-status',
        line.status,
      );
      await expectSar(
        row.getByTestId('qm-line-entitled'),
        line.sar,
        `${line.beneficiaryId} entitlement`,
      );
      expect(
        await plainText(row.getByTestId('qm-line-share')),
        `${line.beneficiaryId} share`,
      ).toContain(line.share);

      // The rule renders as the APPROVED SENTENCE — read from the catalogue, never typed here
      // (M1-a wired it verbatim; the fidelity suite byte-locks it to APPROVED-WORDING.md) — with
      // the machine code still beside it for the operator's ticket.
      await expect(row.getByTestId('qm-line-rule')).toContainText(LINEAGE_ENTITLEMENT_RULE);
      await expect(
        row.locator('[data-testid="qm-line-rule-statement"]'),
        `${line.beneficiaryId} does not render the approved entitlement-rule sentence`,
      ).toContainText(
        must(
          copy.distribution.entitlementRule[LINEAGE_ENTITLEMENT_RULE],
          `entitlementRule.${LINEAGE_ENTITLEMENT_RULE}`,
        ),
      );

      if (line.reason !== null) {
        await expect(
          row.getByTestId('qm-line-reason'),
          `${line.beneficiaryId} does not name its reason`,
        ).toContainText(line.reason);
        // …and the reason's approved sentence. For ben-703 this is the register-#12 wording whose
        // Arabic must not read as permanent — consumed from the catalogue, which is exactly why
        // this test cannot drift from what the drafter approved.
        await expect(
          row.locator('[data-testid="qm-line-reason-statement"]'),
          `${line.beneficiaryId} does not render the approved exclusion sentence`,
        ).toContainText(
          must(copy.distribution.exclusionReason[line.reason], `exclusionReason.${line.reason}`),
        );
      }
      // No gates trip on this endowment: every member is VERIFIED with a fresh KYC date.
      await expect(row.getByTestId('qm-line-gate')).toHaveCount(0);
    }

    // ⚠ EVERY code this run renders carries approved copy, so the "wording approved elsewhere"
    // well has nothing to apologise for and must be ABSENT — the coverage liveness assertion.
    // (waqf-001's ORDERED run renders it too since M1-b consumed the catalogue; this run is the
    // first whose statement surface is COMPLETE.)
    await expect(page.getByTestId('qm-lines-no-copy')).toHaveCount(0);

    await expectNoRawKeys(page, 'the lineage lines step');

    /* ── THE REVIEW STEP: the waterfall, the totals, the flags ────────────────────────────── */

    await page.goto(wizardUrl(locale, LINEAGE_WAQF_ID, 'review'));

    for (const { row, sar } of LINEAGE_WATERFALL) {
      await expectSar(
        page.locator(`[data-testid="qm-waterfall-row"][data-row="${row}"]`),
        sar,
        `waterfall ${row}`,
      );
    }

    // ⚠ THE DECLARED NEGATIVE CONTROL: waqf-007 holds no capital receipt, so this run proves the
    // LINEAGE half of V-1 and must never be quoted as a corpus proof. The corpus wall's claim
    // stays on waqf-001's run (rev-005), where there is something to leak.
    await expect(
      page.locator(`[data-testid="qm-run-flag"][data-flag="CAPITAL_RECEIPTS_EXCLUDED"]`),
    ).toHaveCount(0);

    // The lineage path CONSUMED the deed's continuation term, so the ORDERED run's
    // NOT_APPLIED flag must be absent here — the contrast that shows the term did work.
    await expect(
      page.locator(`[data-testid="qm-run-flag"][data-flag="CONTINUATION_STIPULATION_NOT_APPLIED"]`),
    ).toHaveCount(0);

    // Equal deed weights: per capita overrode nothing, so no honesty flag is owed.
    await expect(
      page.locator(
        `[data-testid="qm-run-flag"][data-flag="STIPULATED_WEIGHTS_NOT_APPLIED_PER_CAPITA"]`,
      ),
    ).toHaveCount(0);

    // What IS raised: binding rule 3's flag, with its approved sentence. Exactly one flag.
    const unverified = page.locator(
      `[data-testid="qm-run-flag"][data-flag="UNVERIFIED_FIGURES_APPLIED"]`,
    );
    await expect(unverified).toHaveCount(1);
    await expect(unverified).toContainText(
      must(copy.distribution.flag.UNVERIFIED_FIGURES_APPLIED, 'flag.UNVERIFIED_FIGURES_APPLIED'),
    );
    await expect(page.getByTestId('qm-run-flag')).toHaveCount(1);

    // The SEAT holds no write verb, so the wizard offers no way to submit — same boundary as
    // the ORDERED test, asserted so this screen stays read-only proof.
    await expect(page.getByTestId('qm-wizard-submit')).toHaveCount(0);

    await expectNoRawKeys(page, 'the lineage review step');
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 4 · THE APPROVALS QUEUE, AND THE RUN'S MAKER/CHECKER RECORD
 *
 * ⚠ READ THE FILE HEADER FIRST: the segregation GUARD is not what this test proves. What it
 * proves is that the RECORD carries two distinct identities and the screen states the rule.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E6 · the queue is empty BY FACT, and the run names a maker and a DIFFERENT checker', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);
  test.setTimeout(120_000);

  await seated(browser, SEAT, testInfo, async (page) => {
    /* ── 4a · THE QUEUE IS EMPTY, AND SAYS SO IN WORDS ───────────────────────────────────
     * MEASURED on a freshly seeded database: ONE `Distribution` (`dist-001`, `EXECUTED`) and ONE
     * `ApprovalRequest` (`appr-dist-001`, `EXECUTED`). `EXECUTED` is not a LIVE status, so the
     * queue is correctly empty — there is no seeded PENDING run for it to list, and no seeded
     * seat holds `distribution:run:write`, so a browser cannot create one either.
     *
     * ⚠ AND AN EMPTY QUEUE LOOKS EXACTLY LIKE A FULLY-REFUSED ONE — the loader says so itself.
     * 4b disambiguates: the SAME session reads `dist-001`'s own page, so reads are permitted and
     * the emptiness is a fact about statuses rather than a hidden refusal.
     * ──────────────────────────────────────────────────────────────────────────────────── */

    await page.goto(`/${locale}/approvals`);
    const empty = page.getByTestId('qm-queue-empty');
    await expect(
      empty,
      'the approvals queue rendered neither rows nor an empty state',
    ).toBeVisible();
    await expect(empty).toContainText(
      must(copy.distribution.approval.queueEmpty, 'approval.queueEmpty'),
    );
    await expect(empty).toContainText(
      must(copy.distribution.approval.queueEmptyBody, 'approval.queueEmptyBody'),
    );
    await expect(page.getByTestId('qm-queue-row')).toHaveCount(0);
    await expectNoRawKeys(page, 'the approvals queue');

    /* ── 4b · THE SAME SESSION CAN READ THE RUN — so 4a is emptiness, not non-disclosure ── */

    await page.goto(`/${locale}/distributions/${WAQF_ID}`);
    const runRow = page.getByTestId('qm-run-row');
    await expect(runRow, 'the endowment lists no run at all').toHaveCount(1);

    await page.goto(`/${locale}/distributions/${WAQF_ID}/runs/${EXECUTED_RUN_ID}`);
    const panel = page.getByTestId('qm-maker-checker');
    await expect(panel, 'the stored run has no maker/checker panel').toBeVisible();

    // THE SCREEN STATES THE RULE, in the reader's language, from the catalogue.
    await expect(panel).toContainText(must(copy.distribution.approval.body, 'approval.body'));

    /* ── THE RECORD: TWO DISTINCT IDENTITIES ────────────────────────────────────────────
     * `appr-dist-001` is seeded with maker `user-accountant-001` (FINANCE) and checker
     * `user-approver-001` (NAZIR) — a CHECK constraint makes `checkerId = makerId`
     * unrepresentable, and the seat named as checker exists precisely to be a distinct one (PO-2).
     * Asserted as an INEQUALITY between two values read off the screen, not just as two literals:
     * a rendering that showed the same id twice would satisfy neither.
     * ──────────────────────────────────────────────────────────────────────────────────── */

    const maker = await plainText(panel.getByTestId('qm-approval-maker'));
    const checker = await plainText(panel.getByTestId('qm-approval-checker'));

    expect(maker, 'the rendered maker is not the seeded one').toContain(EXECUTED_RUN_MAKER);
    expect(checker, 'the rendered checker is not the seeded one').toContain(EXECUTED_RUN_CHECKER);
    expect(
      maker,
      `the maker and the checker rendered as the same identity (${maker}). Whoever prepares a run ` +
        `may never approve it, and a screen that shows one identity in both roles is stating that ` +
        `it happened.`,
    ).not.toBe(checker);

    // Their LABELS come from the catalogue too — "Prepared by" / "Approved by" are approved copy.
    await expect(panel).toContainText(must(copy.distribution.approval.maker, 'approval.maker'));
    await expect(panel).toContainText(must(copy.distribution.approval.checker, 'approval.checker'));

    /* ── THE RUN IS SPENT, AND NO CONTROL PRETENDS OTHERWISE ─────────────────────────────
     * `dist-001` is `EXECUTED` (terminal — the status trigger refuses any transition out of it)
     * and its approval is `EXECUTED` too. So there is nothing to submit, approve or execute, and
     * none of those controls is rendered. ⚠ `DistributionStatus` and `ApprovalStatus` are
     * DIFFERENT vocabularies and must not borrow each other's labels, so the two chips are read
     * from their own catalogue groups.
     * ──────────────────────────────────────────────────────────────────────────────────── */

    await expect(page.getByTestId('qm-run-status')).toContainText(
      must(copy.distribution.runStatus.EXECUTED, 'runStatus.EXECUTED'),
    );
    await expect(page.getByTestId('qm-approval-status')).toContainText(
      must(copy.endowments.reserved.status.EXECUTED, 'endowments.reserved.status.EXECUTED'),
    );

    await expect(page.getByTestId('qm-submit-run')).toHaveCount(0);
    await expect(page.getByTestId('qm-approve-run')).toHaveCount(0);
    await expect(page.getByTestId('qm-execute-run')).toHaveCount(0);

    /* ── A PERMISSION BOUNDARY, ASSERTED AS ONE ──────────────────────────────────────────
     * The stored line items exist (`dli-dist-001-ben-001/-ben-002`) and are NOT shown, because
     * the FINANCE grant does not carry `distribution:line_item:read` — MEASURED: 6 permissions,
     * and that is not one of them. Asserting the absence keeps it a boundary rather than a gap
     * somebody later "fixes" by widening a grant.
     * ──────────────────────────────────────────────────────────────────────────────────── */
    await expect(page.getByTestId('qm-line-items')).toHaveCount(0);

    await expectNoCombinedTotal(page, 'the stored run');
    await expectNoRawKeys(page, 'the stored run');
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 5 · A SEAT WITH NO GRANT REACHES NO DISTRIBUTION SURFACE
 *
 * The complement of tests 2–4: those prove the screens render for a seat that may see them, and
 * a rendering test with no negative is a test that cannot fail for an authorization reason.
 * `user-unscoped` holds ZERO grant rows (measured), so every surface must refuse — and refuse as
 * NON-DISCLOSURE ("that record was not found"), never by leaking that the record exists.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E6 · a seat holding no grant reaches no distribution surface at all', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  test.setTimeout(120_000);

  await seated(browser, UNGRANTED_SEAT, testInfo, async (page) => {
    // The index renders — the seat IS authenticated — and carries not one endowment.
    await page.goto(`/${locale}/distributions`);
    await expect(page.getByTestId('qm-access-notice')).toBeVisible();
    await expect(page.getByTestId('qm-distribution-endowment')).toHaveCount(0);
    await expect(page.getByTestId('qm-distribution-endowments')).toHaveCount(0);

    // Every deeper surface is refused, and NOTHING computed reaches this reader: no waterfall, no
    // corpus panel, no line, no refusal-with-figures. A halt would also be a disclosure here.
    for (const surface of [
      `/${locale}/distributions/${WAQF_ID}`,
      wizardUrl(locale, WAQF_ID, 'review'),
      `/${locale}/distributions/${WAQF_ID}/runs/${EXECUTED_RUN_ID}`,
    ]) {
      await page.goto(surface);
      await expect(page.getByTestId('qm-access-notice'), `${surface} did not refuse`).toBeVisible();
      await expect(page.getByTestId('qm-waterfall')).toHaveCount(0);
      await expect(page.getByTestId('qm-corpus-receipts')).toHaveCount(0);
      await expect(page.getByTestId('qm-line')).toHaveCount(0);
      await expect(page.getByTestId('qm-maker-checker')).toHaveCount(0);
      await expectNoRawKeys(page, surface);
    }

    // ⚠ AND NOT ONE FIGURE FROM waqf-001 LEAKED ANYWHERE. The distributable is the number a
    // non-disclosure refusal must never carry.
    await page.goto(wizardUrl(locale, WAQF_ID, 'review'));
    const visible = await mainText(page);
    for (const figure of ['275,000.00', '350,000.00', CORPUS_RECEIPT.sar, CORPUS_RECEIPT.id]) {
      expect(
        visible.includes(figure),
        `an ungranted seat was shown ${figure} from ${WAQF_ID}`,
      ).toBe(false);
    }
  });
});
