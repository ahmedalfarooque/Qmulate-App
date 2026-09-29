import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type BrowserContext, type Page } from '@playwright/test';

/**
 * ⊕ S11 — THE CROSS-LOCALE SEAT HANDSHAKE NOW LIVES IN ONE PLACE.
 *
 * This file used to carry its own copy of the leader/follower TOTP handshake, ~230 lines of it.
 * `S11-2` declared the extraction owed at the second copy; item 2c escalated it at the third; it is
 * done here, and `test/e2e-harness-single-source.test.ts` pins that no spec re-defines it. The three
 * copies had already drifted — documentation and error wording only, ZERO non-comment differing
 * lines — and the shared module took the richest version, so this file gained explanations it lacked.
 */
import {
  SEED_PASSWORD,
  createSeatHandshake,
  getSurvivingOneTransportFault,
  localeFor,
  post,
  secretFromTotpUri,
  totp,
} from './support/seat-handshake';

/**
 * E3 · THE GRANTED READ JOURNEY — CLIENT → WAQIF → ENDOWMENT, IN A REAL BROWSER, IN BOTH LOCALES.
 *
 * ── WHY THIS FILE EXISTS BESIDE `endowment.spec.ts` ────────────────────────────────────────
 * `endowment.spec.ts` proves the REFUSALS: the deep links are gated, and a seat that holds a grant
 * but not `endowment:waqf:read` is refused on every endowment screen. It cannot prove the reading
 * surfaces, because NEITHER of the seats it claims can read them — MEASURED from
 * `GRANT_SHAPE_BY_ROLE` in `packages/database/src/seed/map.ts` and confirmed against the seeded
 * database:
 *
 *   FAMILY_BOARD (`board@`)  → ['reporting:report:read']
 *   FINANCE      (`accountant@`) → finance/distribution/approval verbs only
 *
 * Neither list contains `endowment:waqf:read`, and `ctx.permissions` is `grant.permissions ∩
 * preset(role)` (`packages/api/src/context.ts`), so the grant is the ceiling in practice. On the
 * first real run of that suite both locales failed on `getByTestId('qm-endowment-tabs')` with the
 * non-disclosure refusal on screen — the seat, not the screen, was wrong.
 *
 * THE ONLY UNCLAIMED SEAT THAT HOLDS `endowment:waqf:read` IS `matrix-admin@example.test`
 * (`user-admin-001`, SYSTEM_ADMIN, ONE grant, on `waqf-001` alone — PO-1). That narrowness is a
 * gift rather than a limitation: it turns AC-E3-02's scope claim into a real assertion. The tree
 * must contain exactly ONE client, ONE waqif and ONE endowment, and `FAKE-1000002/3/4` must be
 * absent from the page — which a seat granted on all four endowments could never demonstrate.
 *
 * ── WHAT THIS FILE PROVES ─────────────────────────────────────────────────────────────────
 *   1. the hierarchy is NAVIGATED, not just rendered: the endowment is reached by CLICKING through
 *      client → waqif → endowment, and the out-of-scope branches are absent, not greyed out;
 *   2. the BR-101 record carries both calendars on a legally significant date, with the FROZEN
 *      Hijri snapshot rendered verbatim (NFR-02) inside an LTR isolate;
 *   3. the structured Shart al-Waqif is READABLE and OFFERS NO EDIT PATH — no control, no link, and
 *      no route (the plausible edit URLs 404, and there is no `shart` mutation on the wire);
 *   4. the classification screen makes BR-104's contrast visible — the MEDIUM endowment's
 *      `LARGE_MEDIUM`-gated duties are listed and the `SMALL_DIRECT` one is EXCLUDED by name;
 *   5. the Arabic run is not an afterthought: the layout GEOMETRICALLY reverses (the sidebar and the
 *      tab's inline-start border change physical side), and no raw message key reaches the screen in
 *      either language — next-intl PRINTS a missing key rather than throwing, so a missing
 *      translation is a silent visual defect that only a rendering assertion catches;
 *   6. the writes S4 deliberately did not ship are absent from BOTH the UI and the wire.
 *
 * ── WHAT IT CANNOT PROVE, AND SAYS SO OUT LOUD (see the PINNED test at the end) ────────────
 * "A reserved-matter action is visibly blocked until approved" is UNREACHABLE on this fixture, for
 * two independent measured reasons: no seeded grant shape carries `legal:reserved_matter:read`, and
 * the seed mints no `RESERVED_MATTER` ApprovalRequest at all (its only approval is
 * `appr-dist-001`, a spent `DISTRIBUTION_RUN`). Both facts are PINNED against the seed's own source
 * text so the day the fixture gains either, this suite FAILS and tells the next agent to write the
 * real journey. A conditional `if (count > 0)` would have reported that silence as success.
 *
 * ── THREE STRUCTURAL RULES INHERITED FROM `kernel.spec.ts` / `auth-journey.spec.ts` ────────
 * 1. One `BrowserContext` per journey; API calls go through `context.request` (the default `request`
 *    fixture is a separate cookie jar and silently loses the session).
 * 2. A seat is claimed by exactly one spec — `auth-journey.spec.ts` holds `nazir@`/`admin@`,
 *    `kernel.spec.ts` holds `approver@`, `endowment.spec.ts` holds `board@`/`accountant@`. This file
 *    holds `matrix-admin@` and nothing else.
 * 3. TOTP enrolment is a ONE-WAY DOOR: `/two-factor/enable` returns the secret exactly once. The two
 *    Playwright projects share ONE database, so a single seat cannot simply be enrolled twice — see
 *    `ensureSeatSession`, which enrols ONCE per run and shares the SESSION (not the secret) with
 *    every other test in both locales.
 */

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * A minimal RFC 6238 TOTP generator (SHA-1, 6 digits, 30s), matching `totpOptions` in
 * `packages/auth`.
 *
 * ⚠ WRITTEN OUT RATHER THAN IMPORTED, for the reason `auth-journey.spec.ts` records: a change to
 * the app's TOTP parameters must show up here as a FAILURE instead of being silently absorbed by a
 * shared helper that changed with it. Four independent copies now redden four files, not zero.
 * ────────────────────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * Fixture facts — every one of them MEASURED against the seeded database, not assumed.
 * ────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * The reading seat: ONE grant, on `waqf-001` alone, carrying `endowment:waqf:read`.
 *
 * Its narrowness is the assertion — see the file header. It holds NO `endowment:deed:read` and NO
 * `legal:reserved_matter:read`, which the second test uses as a positive refusal subject rather
 * than stepping around.
 */
const READ_SEAT = { email: 'matrix-admin@example.test', password: SEED_PASSWORD } as const;

/** This journey's seat, its own handshake directory, and the endowment its stale path asserts on. */
const { seatedJourney } = createSeatHandshake({
  seat: READ_SEAT,
  handshakeDirName: 'qmulate-e2e-seat-matrix-admin',
  waqfId: 'waqf-001',
});

/** The MEDIUM · FAMILY_DHURRI · AYNI · ORDERED endowment. Invented data throughout. */
const WAQF_ID = 'waqf-001';
const IN_SCOPE_CERTIFICATE = 'FAKE-1000001';
const IN_SCOPE_DEED = 'FAKE-DEED-455';
/**
 * The appointed Nazir on the fixture's trusteeship deed — a BR-105 deed FACT, not an endowment one.
 *
 * ⚠ Named here so the G7-V2 assertion below can prove the STRING is gone from the screen, not
 * merely that one list did not render. Invented fixture data.
 */
const SEEDED_PRIMARY_NAZIR = 'QMULATE (professional Nazir)';

/** The three endowments this seat holds NO grant on. None of them may appear on any screen. */
const OUT_OF_SCOPE_CERTIFICATES = ['FAKE-1000002', 'FAKE-1000003', 'FAKE-1000004'] as const;

/** `waqf-001.registrationDate` and its FROZEN `registrationDateHijri` snapshot. */
const REGISTRATION_ISO_PREFIX = '1980-03-11';
const REGISTRATION_HIJRI_SNAPSHOT = '1400-04-23';

/**
 * BR-104's contrast, as seeded. `waqf-001` is MEDIUM, so the two `LARGE_MEDIUM`-gated duties apply
 * and the `SMALL_DIRECT` one is excluded BY NAME. Measured from `compliance_obligation`.
 */
const LARGE_MEDIUM_CODES = ['SEED-FIN-05', 'SEED-OPS-02'] as const;
const SMALL_DIRECT_CODE = 'SEED-FIN-04';

const NEW_USER_PASSWORD = 'fixture-only-e2e-journey-9271';

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * THE SEAT HANDSHAKE — ONE ENROLMENT PER RUN, SHARED BY EVERY TEST IN BOTH LOCALES
 *
 * The problem, stated exactly: both Playwright projects run against ONE database, TOTP enrolment is
 * a one-way door (the secret is returned once), and only ONE unclaimed seat holds
 * `endowment:waqf:read`. The house pattern elsewhere is "if the seat is already enrolled, assert the
 * complementary refusal and return" — which means ONE locale gets the real journey and the OTHER
 * silently degrades. For a suite whose whole purpose is that the Arabic run is not an afterthought,
 * that is the wrong trade.
 *
 * So the projects COOPERATE through the filesystem. Whoever wins an ATOMIC `mkdir` signs in, enrols,
 * PROVES the enrolment took, and publishes its `storageState` (the session cookies) by `rename`;
 * everyone else waits for that file and opens a context from it.
 *
 * ⚠ THE SHARED ARTEFACT IS THE SESSION, NOT THE TOTP SECRET — and the first version got this wrong
 * in a way worth recording, because the failure was invisible in the obvious place. Sharing the
 * SECRET meant every one of the twenty seated tests performed its own `/two-factor/verify-totp`, and
 * with four workers inside one 30-second TOTP window those calls collide: a verification fails, the
 * recovering follower discards the handshake, the next test re-runs `/two-factor/enable`, and that
 * REGENERATES the secret under everyone still holding the old one. MEASURED: sixteen of twenty-two
 * tests red, most of them for a reason that had nothing to do with the screen under test. Sharing the
 * SESSION reduces the whole run to ONE sign-in, ONE `enable` and ONE `verify-totp` — a session cookie
 * is reusable by construction, a TOTP code is not.
 *
 * A handshake left behind by an EARLIER run is detected by AGE and reset; a published session that no
 * longer resolves to the seat is discarded and re-established once. If it still cannot be
 * established, the caller receives `stale` and asserts the COMPLEMENTARY property — never nothing.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * A GET THAT SURVIVES ONE TRANSPORT FAULT — AND NOTHING ELSE
 *
 * ⚠ THIS IS NOT A RETRY OF AN ASSERTION, and the distinction is the entire point.
 *
 * MEASURED IN CI (run `31969864722`, `[ar] endowment-journey.spec.ts:898`, the run whose E2E job
 * was green only because a retry absorbed it): `apiRequestContext.get: socket hang up`, **22 ms**,
 * on `GET /api/auth/get-session` — the pre-flight session probe in `seatedJourney`, before the test
 * had touched a single screen. Reproduced here BY FAULT INJECTION (a proxy that destroys the socket
 * of one harness `get-session` request) with the identical stack: `sessionUser` -> `seatedJourney`
 * -> the test. Two measured facts make it reachable: the dev server answers with
 * `Keep-Alive: timeout=5` and closes an idle socket at **6.00 s** (raw-socket measurement), and
 * `next dev` blocks for seconds at a time compiling routes on demand — in that same CI run,
 * `deed` 5008 ms, `reserved-matters` 6164 ms, `get-session` 5990 ms, `/api/trpc` 7584 ms.
 *
 * A transport fault carries NO information about the product: no status, no body, no page. Letting
 * it fail a test is what dressed a closed connection as a failed authorization check — and then a
 * CI retry dressed that as flakiness.
 *
 * So: exactly ONE re-attempt, ONLY when the call THREW (an answered 4xx/5xx is a RESULT and is
 * returned untouched — nothing here can hide a refusal), only for the named transport faults, and
 * the second failure is raised with both causes so a server that is genuinely gone still fails
 * loudly and at once. Anything that is not one of these faults is re-thrown unchanged.
 * ────────────────────────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * The catalogue, READ AT TEST TIME.
 *
 * Typing the sentences into this file would assert only that two copies of a string match, and
 * would go stale the first time a translator improves the wording. Reading the catalogue means the
 * test asserts THE SCREEN SHOWS THE CATALOGUE — which is the bilingual requirement itself (NFR-01).
 * ────────────────────────────────────────────────────────────────────────────────────────── */

interface Catalogue {
  readonly dashboard: {
    readonly board: { readonly refusedRead: string };
    readonly tone: { readonly refused: string };
  };
  readonly nav: { readonly endowments: string };
  readonly common: {
    readonly unverifiedFigure: string;
    readonly notRecorded: string;
    readonly openRecord: string;
  };
  readonly errors: {
    readonly notAuthorized: string;
    /** Reused verbatim for the WITHHELD trusteeship summary (G7-V2) — no new copy was minted. */
    readonly notAuthorizedBody: string;
    readonly access: { readonly NO_GRANT: string };
  };
  readonly endowments: {
    readonly title: string;
    readonly empty: string;
    readonly emptyBody: string;
    readonly tree: { readonly clientLabel: string; readonly waqifLabel: string };
    readonly shart: {
      readonly immutableTitle: string;
      readonly immutableBody: string;
      readonly supersedingTitle: string;
      readonly supersedingBody: string;
      readonly unspecified: string;
      readonly noneStipulated: string;
    };
    readonly reversion: { readonly recordsNone: string; readonly notCaptured: string };
    readonly continuationValue: { readonly ZUHUR_ONLY: string };
    readonly entitlementOrderValue: { readonly ORDERED: string };
    readonly classificationValue: { readonly MEDIUM: string };
    readonly classification: { readonly historyEmpty: string; readonly bandsTitle: string };
    /** ⊕ S11-1 — the owner's dropdown for the REGISTER_30BD clock-start. */
    readonly registrationAnchorKindValue: { readonly REGULATION_EFFECTIVE_DATE: string };
  };
}

function catalogue(locale: 'ar' | 'en'): Catalogue {
  const path = fileURLToPath(
    new URL(`../../../packages/i18n/messages/${locale}.json`, import.meta.url),
  );
  return JSON.parse(readFileSync(path, 'utf8')) as Catalogue;
}

/**
 * A raw dotted message key — what next-intl PRINTS when a message is missing, instead of throwing.
 *
 * The trailing `[a-zA-Z]` matters: English prose legitimately ends a sentence with "…endowments.",
 * and a pattern without it would fail on correct copy. A KEY always has a letter straight after the
 * dot, so this discriminates a missing translation from a full stop.
 */
const RAW_KEY_PATTERN = /(?:endowments|errors|common|nav|auth|dashboard)\.[a-zA-Z][a-zA-Z0-9_]*/;

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * Two harness helpers, and the measured reason each exists
 * ────────────────────────────────────────────────────────────────────────────────────────── */

/**
 * Compile a route SERVER-SIDE before a CLICK assertion depends on it.
 *
 * `next dev` compiles a route on its first request, so the very first client-side navigation to
 * `/…/shart` can take longer than the 5 s `expect` budget — which fails an assertion about the LINK
 * for a reason that has nothing to do with the link. Warming pays that cost through
 * `context.request` (same cookie jar, so the page renders for real) and leaves the click assertion
 * strict. It does not weaken anything: the click is still required to navigate, within 5 s.
 */
async function warm(context: BrowserContext, paths: readonly string[]): Promise<void> {
  for (const path of paths) {
    const response = await getSurvivingOneTransportFault(context.request, path);
    expect(
      response.status(),
      `warming ${path} answered ${String(response.status())}; the journey below would fail for the ` +
        `wrong reason`,
    ).toBeLessThan(400);
  }
}

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 1 · THE HIERARCHY, NAVIGATED BY CLICKING, AND THE BR-101 RECORD IT LEADS TO
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E3 · a granted operator navigates client → waqif → endowment and reads the BR-101 record', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await seatedJourney(browser, testInfo, locale, async (page, context) => {
    console.log(`[E3-JOURNEY][${locale}] read journey RAN against ${READ_SEAT.email}`);

    /* ── 1a · THE HIERARCHY, AND WHAT IS ABSENT FROM IT ────────────────────────────────── */

    await page.goto(`/${locale}/endowments`);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
    // A caller with a real grant gets the real shell, not the access notice.
    await expect(page.getByTestId('qm-access-notice')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: copy.endowments.title }).first()).toBeVisible();

    const tree = page.getByTestId('qm-endowment-tree');
    await expect(tree).toBeVisible();
    await expect(tree.getByTestId('qm-tree-client')).toHaveCount(1);

    /**
     * ⚠ EXACT COUNTS, NOT `toBeGreaterThan(0)`. This seat holds ONE grant, on `waqf-001`. The force
     * filter narrows `Client` and `Waqif` through `CLIENT_REACHABLE_MODELS`, so `waqif-002` (which
     * owns `waqf-002`) and `waqif-003` (which owns `waqf-003` and `waqf-004`) must be ABSENT —
     * not rendered as empty or locked branches. A `>= 1` assertion passes either way, which is
     * exactly how an over-disclosing tree ships green.
     */
    await expect(tree.getByTestId('qm-tree-waqif')).toHaveCount(1);
    await expect(tree.getByTestId('qm-tree-endowment')).toHaveCount(1);

    const treeText = await page.locator('body').innerText();
    expect(treeText).toContain(IN_SCOPE_CERTIFICATE);
    for (const certificate of OUT_OF_SCOPE_CERTIFICATES) {
      expect(
        treeText,
        `${certificate} is outside this seat's grant and must not appear on any screen`,
      ).not.toContain(certificate);
    }
    /**
     * All three levels are LABELLED, so the reader can see it is a hierarchy and not a flat list.
     *
     * ⚠ COMPARED CASE-INSENSITIVELY, and that is a real fact about the design rather than laziness:
     * `.qm-eyebrow` applies `text-transform: uppercase` to LATIN labels, and `innerText` returns the
     * TRANSFORMED text. The Arabic rule deliberately sets `text-transform: none` (uppercasing breaks
     * cursive joins), so a case-sensitive comparison would pass in `ar` and fail in `en` — for the
     * stylesheet working correctly. The transform itself is asserted in `assertLayoutMirrors`.
     */
    expect(treeText.toUpperCase()).toContain(copy.endowments.tree.clientLabel.toUpperCase());
    expect(treeText.toUpperCase()).toContain(copy.endowments.tree.waqifLabel.toUpperCase());

    await expectNoRawKeys(page, `${locale}/endowments`);

    /* ── 1b · NAVIGATED BY CLICKING, NOT BY TYPING A URL ───────────────────────────────── */

    // BR-102 is "model AND NAVIGATE". A `goto` proves the route renders; only a click proves the
    // hierarchy is actually wired to the record.
    await warm(context, [`/${locale}/endowments/${WAQF_ID}`]);
    await tree.getByTestId('qm-tree-endowment').first().click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/endowments/${WAQF_ID}(\\?|$)`));

    await expect(page.getByTestId('qm-endowment-tabs')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toContainText(IN_SCOPE_CERTIFICATE);

    /* ── 1c · THE BR-101 RECORD ────────────────────────────────────────────────────────── */

    const identity = page.getByTestId('qm-record-identity');
    await expect(identity).toBeVisible();
    await expect(page.getByTestId('qm-record-terms')).toBeVisible();

    /**
     * ── ⚠ G7-V2 · THE TRUSTEESHIP SUMMARY IS WITHHELD FROM **THIS** SEAT, AND THAT IS THE FIX ──
     *
     * This line used to read `expect(getByTestId('qm-record-trusteeship')).toBeVisible()`, and it
     * was an accurate record of the shipped behaviour. The behaviour was the defect: `endowment.get`
     * handed the appointed Nazir's NAME, the Nazarah Art. 11(5) joint-liability position and the
     * existence of a delegated manager — all BR-105 trusteeship-deed facts — to a caller `deed.get`
     * refuses.
     *
     * MEASURED through `createCaller` on THIS seat (`user-admin-001`, resolved grant permissions
     * exactly `["endowment:waqf:read","admin:access_matrix:read","admin:access_matrix:write",
     * "audit:event:read"]`): `deed.get` threw FORBIDDEN / PERMISSION_DENIED for want of
     * `endowment:deed:read`, while `endowment.get(...).trusteeship` returned
     * `{"primaryNazir":"QMULATE (professional Nazir)","jointlyLiable":true,"hasAuthorizedRep":true}`.
     *
     * So the pin is INVERTED, not deleted: the section still renders (it is part of BR-101's
     * screen), and it now carries the catalogue's own access sentence instead of the deed's facts.
     * ⚠ AND "WITHHELD" IS NOT "NOT RECORDED" — a screen that told this reader "no Nazir is
     * appointed" would state something false about a governance record, so the two have different
     * test ids and the wrong one is asserted ABSENT.
     */
    await expect(page.getByTestId('qm-record-trusteeship')).toHaveCount(0);
    await expect(page.getByTestId('qm-record-trusteeship-absent')).toHaveCount(0);
    const withheldDeed = page.getByTestId('qm-record-trusteeship-withheld');
    await expect(withheldDeed).toBeVisible();
    await expect(withheldDeed).toContainText(copy.errors.notAuthorizedBody);
    // And the fact itself is gone from the whole screen, not merely from that one list.
    expect(
      await page.locator('#qm-main').innerText(),
      'the appointed Nazir’s name is still disclosed to a seat refused endowment:deed:read',
    ).not.toContain(SEEDED_PRIMARY_NAZIR);
    // Both machine-readable identifiers, on one screen (BR-101).
    await expect(identity).toContainText(IN_SCOPE_CERTIFICATE);
    await expect(identity).toContainText(IN_SCOPE_DEED);

    /**
     * ── ⊕ S11-1 · THE REGISTRATION CLOCK-START, READ BACK FROM THE RECORD ────────────────────
     *
     * waqf-001's anchor is RECORDED in the fixture (an invented in-coverage regulation-effective
     * date), so the panel renders the RECORDED state with the kind's label — and the sentence for the
     * other state, "not recorded — the deadline cannot be computed", is ABSENT. Both are asserted:
     * a panel that rendered neither would read as "nothing due", the exact shape this sprint refuses.
     *
     * ⚠ READ ONLY. This seat holds no `endowment:waqf:write`, so the form's write path is NOT
     * exercised here (a submit would be refused, honestly, as PERMISSION_DENIED); the write path is
     * driven end-to-end by `packages/api/test/anchor-input.integration.test.ts`. A seated WRITE
     * journey needs a second enrolled seat in this harness and is owed to item 2's e2e work.
     */
    const anchorPanel = page.getByTestId('qm-anchor-panel');
    await expect(anchorPanel).toBeVisible();
    await expect(page.getByTestId('qm-anchor-recorded')).toBeVisible();
    await expect(page.getByTestId('qm-anchor-not-recorded')).toHaveCount(0);
    await expect(page.getByTestId('qm-anchor-record')).toContainText(
      copy.endowments.registrationAnchorKindValue.REGULATION_EFFECTIVE_DATE,
    );
    // ⊕ S12-3b MOVED THIS PIN, and the reason is written down: the fixture's admin seat now carries
    // `endowment:waqf:write` beside `admin:access_matrix:write` (migration 53 demands BOTH on a sibling
    // to REGISTER an endowment, and this is the fixture's only holder of the second). So the anchor
    // form IS drawn to this seat — the kernel's answer (`writable.registrationAnchor === true`), not a
    // UI guess. Until S12-3b the sentence here read "the FORM IS ABSENT", measured on a seat that held
    // no write verb; that seat no longer exists in the fixture. The dropdown's two-kind contract is
    // covered by the api integration suite.
    await expect(page.getByTestId('qm-anchor-form')).toHaveCount(1);
    // ⊕ S11-2 — the DISCHARGE section is read under `compliance:task:read`, which this seat does NOT
    // hold (admin:access_matrix:*, endowment:waqf:read, audit:event:read — PO-1). So the whole
    // section is ABSENT: not "no deadline on file" (a claim this seat is not entitled to), not a
    // form (the E3 pin). The seated WRITE journey is `compliance-journey.spec.ts`.
    await expect(page.getByTestId('qm-discharge-section')).toHaveCount(0);
    await expect(page.getByTestId('qm-discharge-form')).toHaveCount(0);
    await expect(page.getByTestId('qm-registration-no-deadline')).toHaveCount(0);

    /**
     * ── THE MACHINE-READABLE HALF STAYS LTR INSIDE THE RTL PAGE ──────────────────────────
     * `<Mono>` wraps a certificate or deed number in `<bdi dir="ltr">`. Without the isolate the
     * digits and the hyphen of `FAKE-1000001` reorder against the surrounding Arabic, and the
     * number a Nazir reads off the screen is not the number in the deed. A correctness bug, not a
     * typographic nicety.
     *
     * ⚠ EVERY OCCURRENCE, NOT ONE OF THEM. The first version asserted `toHaveCount(1)` on the
     * isolated element and went red with `Received: 2` — because the certificate legitimately
     * appears TWICE on this screen (the page heading and the identity list) and both were isolated.
     * Counting isolates would also have passed with one isolated and one bare rendering, which is
     * the actual defect. So the assertion walks the text nodes instead and demands that NO
     * occurrence sits outside a `<bdi dir="ltr">`.
     */
    for (const identifier of [IN_SCOPE_CERTIFICATE, IN_SCOPE_DEED]) {
      await expectEveryOccurrenceIsLtrIsolated(page, identifier);
    }

    /**
     * ── BOTH CALENDARS, AND THE FROZEN SNAPSHOT RENDERED VERBATIM (NFR-02) ───────────────
     * The registration date is legally significant, so it is stored twice: a canonical UTC value
     * and a Hijri STRING frozen at insert time. The screen must show BOTH, and the Hijri side must
     * be the stored snapshot — not a recomputation, which would silently rewrite the date a
     * regulator-facing record was registered under if ICU data or a library changed underneath.
     */
    const dated = identity.locator(`[data-iso^="${REGISTRATION_ISO_PREFIX}"]`).first();
    await expect(dated, 'the registration date is missing from the record').toHaveCount(1);
    await expect(dated.locator('[data-calendar="gregorian"]')).toHaveCount(1);
    const hijri = dated.locator('[data-calendar="hijri"]');
    await expect(hijri).toHaveCount(1);
    await expect(hijri).toHaveAttribute('data-frozen', 'true');
    await expect(hijri).toContainText(REGISTRATION_HIJRI_SNAPSHOT);
    // The snapshot is a Latin numeric string, so it is LTR-isolated too.
    await expect(hijri.locator('bdi[dir="ltr"]')).toHaveCount(1);

    /**
     * ── مآل الوقف IS IN EXACTLY ONE OF ITS THREE STATES, AND THE STATE IS ON THE ELEMENT ─
     * `waqf-001` is `reversionClauseCaptured = true` with `reversionKind = null`: THE DEED
     * POSITIVELY RECORDS NO ULTIMATE TAKER. That is a statement, and it must never render the same
     * as "nobody has read the clause yet" — which is the confusion the required Boolean exists to
     * prevent.
     */
    const reversion = page.getByTestId('qm-reversion');
    await expect(reversion).toHaveAttribute('data-captured', 'true');
    await expect(reversion).toContainText(copy.endowments.reversion.recordsNone);
    await expect(reversion).not.toContainText(copy.endowments.reversion.notCaptured);

    // The deed term renders as WORDS from the catalogue, never as the enum member.
    const terms = page.getByTestId('qm-record-terms');
    await expect(terms).toContainText(copy.endowments.continuationValue.ZUHUR_ONLY);
    await expect(terms).not.toContainText('ZUHUR_ONLY');

    await expectNoRawKeys(page, `${locale}/endowments/${WAQF_ID}`);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 2 · THE FOUNDER'S CONDITIONS — READABLE, STRUCTURED, AND WITH NO WRITE PATH
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E3 · the structured Shart al-Waqif is readable and offers no edit path at all', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await seatedJourney(browser, testInfo, locale, async (page, context) => {
    /**
     * Reached by CLICKING the tab, not by typing the URL — the tab strip is the only way a Nazir
     * gets here, so it is the thing worth asserting. The route is warmed first because `next dev`
     * compiles on demand and a first-visit compile can outlast the click's 5 s budget.
     */
    await warm(context, [
      `/${locale}/endowments/${WAQF_ID}`,
      `/${locale}/endowments/${WAQF_ID}/shart`,
    ]);
    await page.goto(`/${locale}/endowments/${WAQF_ID}`);
    await page.getByTestId('qm-endowment-tabs').locator('[data-tab="shart"]').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/endowments/${WAQF_ID}/shart`));

    await expect(page.getByTestId('qm-shart-immutable')).toContainText(
      copy.endowments.shart.immutableTitle,
    );
    const superseding = page.getByTestId('qm-shart-superseding');
    await expect(superseding).toContainText(copy.endowments.shart.supersedingTitle);
    await expect(superseding).toContainText(copy.endowments.shart.supersedingBody);

    // BR-103: the conditions are STRUCTURED and REFERENCEABLE, not a prose blob.
    const structured = page.getByTestId('qm-shart-structured');
    await expect(structured).toBeVisible();
    /**
     * ⚠ THIS ASSERTION IS INVERTED, NOT DELETED (V-E3-L5).
     *
     * It used to read `toContainText('ORDERED')` and it PASSED — because the screen printed the
     * raw enum member `ORDERED` in Latin, in Geist Mono, on the Arabic page, while the product-
     * approved wording ("ترتيب طبقي — الأعلى فالأعلى" / "Tiered — al-a'la fa-l-a'la") already
     * existed in both catalogues and the record screen already used it. The assertion was
     * satisfied by the defect: "referenceable" was proven by the presence of a machine token.
     *
     * The claim it was reaching for — the order rule is a REFERENCEABLE FIELD, not prose — is kept
     * and made stronger: the field must render as the CATALOGUE'S WORDS, and the enum member must
     * not appear at all. Arabic is authoritative (NFR-01).
     */
    await expect(
      structured,
      'the entitlement-order rule does not render as words from the catalogue',
    ).toContainText(copy.endowments.entitlementOrderValue.ORDERED);
    await expect(
      structured,
      'the entitlement-order rule still prints the raw enum member',
    ).not.toContainText('ORDERED');
    // The waqf-level continuation term is on the record too, as WORDS.
    await expect(structured).toContainText(copy.endowments.continuationValue.ZUHUR_ONLY);
    /**
     * ⚠ CHANGED IN S5/E4, AND WHY. `waqf-001`'s maintenance reserve WAS `{ kind: 'unspecified' }`
     * (the deed silent), and this test asserted the silence sentence rendered and the
     * positively-`none` sentence did not. The S5 fixture delta (FIXTURE_DELTA_REQUIRED) gave every
     * waqf its deed-stated maintenance rule, and `waqf-001` stipulates a FIXED reserve of SAR
     * 40,000 (matching `exp-e-001`, its own 40,000 maintenance expense). So the screen must now show
     * NEITHER catalogued sentence — the reserve is neither silent nor positively-none — and must
     * render the recorded `fixed` kind instead.
     *
     * ⚠ SURFACED GAP, RECORDED NOT HIDDEN: the `fixed`/`percent`/`target_topup` reserve kinds render
     * as a bare `DiagnosticCode` (the code, not the amount) — a documented `TODO(surface)` in
     * `ShartPanel`, and the api shart contract (`routers/shart.ts`) drops the amount/rate entirely,
     * so the AMOUNT is not even carried to the UI. My S5 delta gave that gap its first seeded
     * subjects (R6-C1's lesson: a latent gap becomes reachable once a fixture exercises it).
     * Rendering the reserve amount is owed to E3/E5/E10 (an api-contract + UI + copy change),
     * carried in BUILD-PLAN. The `unspecified`≠`none` DISTINCTION is unchanged and is now proven at
     * the api layer (`endowment-record.integration.test.ts` asserts `waqf-005` unspecified and
     * `waqf-004` positively-none).
     */
    await expect(structured).not.toContainText(copy.endowments.shart.unspecified);
    await expect(structured).not.toContainText(copy.endowments.shart.noneStipulated);
    // The recorded kind renders (as a diagnostic code, per the gap above) — the field is on the
    // record and REFERENCEABLE, which is this test's actual claim.
    await expect(structured).toContainText('fixed');

    /**
     * The deed-set Nazir fee is a REGULATORY FIGURE, so it carries the unverified marker (binding
     * rule 3): the customary 10% ʿushr is set by THIS deed and is unverified against primary law,
     * and the Authority's own ≤10%-of-net-income fee is a different figure entirely.
     */
    await expect(page.getByTestId('qm-unverified').first()).toContainText(
      copy.common.unverifiedFigure,
    );

    /**
     * The completeness split is load-bearing: `missing` HALTS a computation and `advisory` does not.
     * `waqf-001` is COMPLETE and — since the S5 delta stated its maintenance rule and its
     * disbursement schedule — carries ONE advisory gap (`TIER_WEIGHTS_NOT_STIPULATED`; the
     * maintenance and schedule advisories are gone now the deed states both). So the screen must
     * still show the advisory list and NOT the halting one — presenting them as one list would tell
     * a Nazir that a cosmetic gap stops the endowment paying, or far worse that a halting gap does not.
     */
    await expect(page.getByTestId('qm-shart-advisory')).toBeVisible();
    await expect(page.getByTestId('qm-shart-missing')).toHaveCount(0);
    await expect(page.getByTestId('qm-shart-would-halt')).toHaveCount(0);

    await assertShartHasNoWritePath(page, context, locale);
    await expectNoRawKeys(page, `${locale}/endowments/${WAQF_ID}/shart`);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 3 · CLASSIFICATION — THE CONTRAST, THE HISTORY, AND THE UNVERIFIED FIGURES
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E3 · the classification screen shows the duties this class gates, the ones it excludes, and no settled band figure', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await seatedJourney(browser, testInfo, locale, async (page, context) => {
    await warm(context, [
      `/${locale}/endowments/${WAQF_ID}`,
      `/${locale}/endowments/${WAQF_ID}/classification`,
    ]);
    await page.goto(`/${locale}/endowments/${WAQF_ID}`);
    await page.getByTestId('qm-endowment-tabs').locator('[data-tab="classification"]').click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/endowments/${WAQF_ID}/classification`));

    await expect(page.getByTestId('qm-classification-current')).toContainText(
      copy.endowments.classificationValue.MEDIUM,
    );

    /**
     * BR-104's whole point, VISIBLE: a MEDIUM endowment carries the audited-statement and
     * internal-bylaw duties, and a SMALL one does not. The excluded table is rendered rather than
     * hidden precisely so the contrast is provable in one screen — and the exclusion names its
     * reason instead of the row simply being missing.
     */
    const obligations = page.getByTestId('qm-obligations');
    await expect(obligations).toBeVisible();
    for (const code of LARGE_MEDIUM_CODES) {
      await expect(
        obligations.locator(`[data-code="${code}"]`),
        `${code} is LARGE_MEDIUM-gated and this endowment is MEDIUM`,
      ).toHaveCount(1);
    }
    const excluded = page.getByTestId('qm-obligations-excluded');
    await expect(excluded.locator(`[data-code="${SMALL_DIRECT_CODE}"]`)).toHaveCount(1);
    await expect(excluded).toContainText('GATE_EXCLUDES_CLASSIFICATION');
    // …and the excluded duty is not ALSO listed as applicable.
    await expect(obligations.locator(`[data-code="${SMALL_DIRECT_CODE}"]`)).toHaveCount(0);

    /**
     * ⚠ EVERY REGULATORY FIGURE CARRIES THE UNVERIFIED MARKER (binding rule 3). The SAR 200M / 50M
     * bands are UNVERIFIED against primary Saudi law, so the screen names the `Setting` KEYS they
     * resolve from and marks them — it never prints the numbers as though they were the law.
     */
    await expect(page.getByTestId('qm-unverified').first()).toContainText(
      copy.common.unverifiedFigure,
    );
    const classificationText = await page.locator('#qm-main').innerText();
    expect(classificationText).toContain('classification.threshold.large.sar');
    for (const figure of ['200,000,000', '50,000,000', '200000000', '50000000']) {
      expect(
        classificationText,
        `a raw band figure (${figure}) is printed as though it were settled law`,
      ).not.toContain(figure);
    }

    /**
     * The history. `waqf-001` has NO `reclassification_event` row, so the screen must show the
     * EMPTY STATE — never a blank panel, which is ambiguous between "nothing happened" and "the
     * load failed". The append-only guarantee itself is proven at the database, where it lives.
     */
    await expect(page.getByTestId('qm-classification-history-empty')).toContainText(
      copy.endowments.classification.historyEmpty,
    );
    await expect(page.getByTestId('qm-classification-history')).toHaveCount(0);

    await expectNoRawKeys(page, `${locale}/endowments/${WAQF_ID}/classification`);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 4 · THE ARABIC RUN IS NOT AN AFTERTHOUGHT — the layout GEOMETRICALLY reverses
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E3 · the layout mirrors with direction, and the page never scrolls sideways in either language', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);

  await seatedJourney(browser, testInfo, locale, async (page, context) => {
    await warm(context, [
      `/${locale}/endowments/${WAQF_ID}`,
      `/${locale}/endowments/${WAQF_ID}/shart`,
    ]);
    await assertLayoutMirrors(page, locale);
    await assertNoHorizontalOverflow(page, `/${locale}/endowments/${WAQF_ID}`);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 5 · A GRANT IS NOT A BLANKET — the verbs this seat lacks are refused on the same endowment
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E3 · the same endowment is readable on one tab and refused on the tabs this seat holds no verb for', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await seatedJourney(browser, testInfo, locale, async (page) => {
    /**
     * This seat holds `endowment:waqf:read` and NOT `endowment:deed:read`, and NOT
     * `legal:reserved_matter:read`. So the same endowment is READABLE on one tab and REFUSED on
     * two others — per-verb authorization, not per-endowment.
     *
     * ⚠ MEASURED CONSEQUENCE WORTH STATING: on THIS fixture NO seeded grant shape carries either
     * verb, so the deed screen and the reserved-matters screen are unreadable by EVERY seeded seat.
     * The refusal is therefore the only reachable assertion, and it is asserted rather than skipped.
     * The reserved-matter half of that gap is pinned in the last test in this file.
     */
    for (const tab of ['deed', 'reserved-matters'] as const) {
      await page.goto(`/${locale}/endowments/${WAQF_ID}/${tab}`);
      const refusal = page.locator('#qm-main [role="alert"]');
      await expect(refusal, `the ${tab} screen rendered no refusal`).toHaveCount(1);
      await expect(refusal).toContainText(copy.errors.notAuthorized);

      // The refusal names no machine code and no internals: the sentence is the whole answer.
      const body = await page.locator('#qm-main').innerText();
      for (const forbidden of [
        'PERMISSION_DENIED',
        'NO_GRANT',
        'errors.access',
        'TRPCError',
        'endowment:deed:read',
        'legal:reserved_matter:read',
      ]) {
        expect(body, `"${forbidden}" was shown to the reader`).not.toContain(forbidden);
      }
      await expectNoRawKeys(page, `${locale}/endowments/${WAQF_ID}/${tab}`);
    }
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 6 · THE WRITES S4 DELIBERATELY DID NOT SHIP — absent from the UI…
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E3 · no create, reclassify or deed-term affordance exists on any endowment screen', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);

  await seatedJourney(browser, testInfo, locale, async (page) => {
    /**
     * `client.create`, `waqif.create` and `endowment.create` are DELIBERATELY NOT SHIPPED in S4: a
     * `Client` has no `waqfId`, so the endowment-scoped rung cannot guard it, and both halves are
     * assigned to E11 in writing. `classification.reclassify` and `endowment.recordDeedTerms` DO
     * exist on the wire but are wired to no screen — the first because whether a re-classification
     * needs the Nazir's approval is an OWNER decision (§10 §4.1 has no row for it), the second
     * because recording a founder's condition is a SIGNING act, not a form submission.
     *
     * A DISABLED button would be worse than none: it teaches the reader that the product is broken,
     * or that the key is held by someone else. So the assertion is that no such affordance exists.
     */
    for (const path of ['', `/${WAQF_ID}`, `/${WAQF_ID}/classification`] as const) {
      await page.goto(`/${locale}/endowments${path}`);
      const main = page.locator('#qm-main');
      // ⊕ S12-3b: the ONE write affordance this seat now legitimately sees on the record screen is the
      // REGISTRATION-ANCHOR form (S11-1; the seat gained `endowment:waqf:write` with migration 53 — see
      // the record journey above). It is not a create, a reclassify or a deed-term act, so it is
      // excluded HERE BY NAME rather than by loosening the count: everything else must still be zero.
      const writeAffordances = await main
        .locator('button, input, textarea, select, [role="button"], form')
        .evaluateAll(
          (nodes) =>
            nodes.filter((node) => node.closest('[data-testid^="qm-anchor-"]') === null).length,
        );
      expect(writeAffordances, `a write affordance appeared on /${locale}/endowments${path}`).toBe(
        0,
      );
      // …and no link pretends to be one.
      const hrefs = await main
        .locator('a[href]')
        .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
      for (const href of hrefs) {
        expect(
          /\/(new|create|edit|amend|update|delete)(\/|$|\?)/.test(href),
          `a write route is linked from /${locale}/endowments${path}: ${href}`,
        ).toBe(false);
      }
    }
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 7 · …AND ABSENT FROM THE WIRE, WHICH IS THE HALF A UI ASSERTION CANNOT COVER
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E3 · there is no Shart mutation at any path, while the shipped-but-unwired mutations do exist', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);

  await seatedJourney(browser, testInfo, locale, async (page) => {
    await page.goto(`/${locale}/endowments/${WAQF_ID}`);

    /**
     * ⚠ THE LOAD-BEARING ASSERTION ABOUT THE FOUNDER'S CONDITIONS. There is no `shart.update` and
     * there never will be: a change is a SUPERSEDING INSTRUMENT recorded as a NEW record
     * (ADR-0006), never an edit. `404` here means the procedure DOES NOT EXIST — distinct from a
     * scoped refusal, which carries an `apiCode` on `error.data`.
     */
    for (const absent of [
      'shart.update',
      'shart.amend',
      'shart.set',
      'shart.correct',
      'endowment.create',
      'client.create',
      'waqif.create',
    ]) {
      const response = await callKernel(page, absent, { waqfId: WAQF_ID }, locale);
      expect(
        response.status,
        `${absent} answered ${String(response.status)} — it must not exist: ${JSON.stringify(response)}`,
      ).toBe(404);
      expect(
        response.error?.data?.apiCode ?? null,
        `${absent} answered with an API refusal code, which means the procedure EXISTS and was ` +
          `merely denied — the claim here is that it is absent`,
      ).toBeNull();
    }

    /**
     * The mirror image, so the assertions above cannot pass because the whole router is missing:
     * `classification.reclassify` and `endowment.recordDeedTerms` DO exist (they are mutations, so
     * a GET is refused as something other than NOT_FOUND), and `shart.get` answers.
     */
    for (const present of ['classification.reclassify', 'endowment.recordDeedTerms']) {
      const response = await callKernel(page, present, { waqfId: WAQF_ID }, locale);
      expect(
        response.status,
        `${present} answered 404 — the shipped mutation is missing, which would make the ` +
          `absence assertions above vacuous: ${JSON.stringify(response)}`,
      ).not.toBe(404);
    }
    const shartRead = await callKernel(page, 'shart.get', { waqfId: WAQF_ID }, locale);
    expect(shartRead.status, `shart.get failed: ${JSON.stringify(shartRead)}`).toBe(200);
  });
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 8 · A SESSION IS NOT AN AUTHORIZATION — one honest sentence, and no endowment fact
 *
 * A brand-new identity per (project, retry): both projects run against ONE database and a retry
 * re-runs the whole test, so a fixed address collides as `USER_ALREADY_EXISTS` — which looks like
 * an auth bug and is not one.
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E3 · an authenticated account with no grant is told nothing about the portfolio', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);
  /**
   * ⚠ UNIQUE PER RUN, not merely per (project, retry). Both projects share ONE database and CI gets a
   * fresh one every time — but a LOCAL re-run against a surviving cluster collides as
   * `USER_ALREADY_EXISTS`, which looks exactly like an auth bug and is not one (measured: the second
   * run of this file failed here in both locales). The suffix makes the subject disposable.
   */
  const email =
    `e2e.journey.${testInfo.project.name}.${String(testInfo.retry)}.` +
    `${Date.now().toString(36)}${randomBytes(3).toString('hex')}@example.test`;

  const context: BrowserContext = await browser.newContext();
  const page = await context.newPage();

  try {
    const signUp = await post(context.request, '/sign-up/email', {
      name: 'E2E Journey User (fixture)',
      email,
      password: NEW_USER_PASSWORD,
    });
    expect(signUp.status, `sign-up failed: ${JSON.stringify(signUp.body)}`).toBe(200);

    const enable = await post(context.request, '/two-factor/enable', {
      password: NEW_USER_PASSWORD,
    });
    expect(enable.status, `enrolment failed: ${JSON.stringify(enable.body)}`).toBe(200);
    const secret = secretFromTotpUri(enable.body.totpURI);
    expect(
      (await post(context.request, '/two-factor/verify-totp', { code: totp(secret) })).status,
    ).toBe(200);

    await page.goto(`/${locale}/endowments`);

    /**
     * ⚠ MEASURED, AND NOT WHAT THIS TEST ORIGINALLY ASSERTED. AC-E3-02 says a caller with no
     * `WaqfAccessGrant` "receives an EMPTY tree". What the app actually does is SHORT-CIRCUIT ONE
     * LAYER EARLIER: `(app)/layout.tsx` calls `whoami`, sees `grants.length === 0`, and renders the
     * single non-disclosure sentence INSTEAD OF THE APP — no sidebar, no topbar, no tree, no page.
     *
     * That is STRONGER than an empty tree, not weaker, so this test asserts the behaviour that
     * exists rather than the wording of the acceptance criterion. One consequence worth reporting
     * rather than hiding: `endowments.empty` / `emptyBody` — the tree's own "no endowment within
     * your access scope" copy — is therefore UNREACHABLE for a zero-grant caller, and on this
     * fixture unreachable full stop (the only other route to it would be a grant on a soft-deleted
     * endowment). It is honest fallback copy for a layout that no longer reaches it, not a defect,
     * and it is left in place.
     */
    const notice = page.getByTestId('qm-access-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText(copy.errors.notAuthorized);
    await expect(notice).toContainText(copy.errors.access.NO_GRANT);
    // The app chrome is NOT rendered: one honest sentence, not a shell full of empty screens.
    await expect(page.getByTestId('qm-topbar')).toHaveCount(0);
    await expect(page.getByTestId('qm-sidebar')).toHaveCount(0);
    await expect(page.getByTestId('qm-endowment-tree')).toHaveCount(0);
    // Direction still comes from the locale, not from the error path.
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');

    const body = await page.locator('body').innerText();
    for (const leaked of [IN_SCOPE_CERTIFICATE, ...OUT_OF_SCOPE_CERTIFICATES]) {
      expect(body, `${leaked} leaked to a caller with no grant`).not.toContain(leaked);
    }
    expect(body, 'a waqf id leaked to a caller with no grant').not.toContain(WAQF_ID);
    expect(body, 'a machine refusal code reached the reader').not.toContain('NO_GRANT');

    // The deep link is refused with the SAME sentence — "does not exist" and "not yours" must be
    // indistinguishable (§10 §7.2).
    await page.goto(`/${locale}/endowments/${WAQF_ID}`);
    await expect(page.getByTestId('qm-access-notice')).toBeVisible();
    const refusalText = await page.locator('#qm-main').innerText();
    expect(refusalText).not.toContain(IN_SCOPE_CERTIFICATE);

    await expectNoRawKeys(page, `${locale}/endowments (no grant)`);
  } finally {
    await context.close();
  }
});

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * 4 · PINNED — the one thing this fixture cannot demonstrate, asserted so it cannot be forgotten
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('E3 · PINNED FIXTURE GAP · the reserved-matter "blocked until approved" rendering is unreachable on this seed', async () => {
  /**
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * WHY THIS IS A PINNED TEST AND NOT A CONDITIONAL ASSERTION
   * ═══════════════════════════════════════════════════════════════════════════════════════════
   * The E3 brief asks the browser suite to prove that "a reserved-matter action is visibly blocked
   * until approved". `ReservedMatterPanel` renders exactly that — a danger chip plus the sentence
   * that the act has NOT been performed — but on this fixture the rendering CANNOT BE REACHED, for
   * two independent reasons, both measured:
   *
   *   1. ✓ **CLOSED IN THIS CLOSE-OUT — the assertion below is INVERTED, not deleted.** It used to
   *      read "no seeded grant shape carries `legal:reserved_matter:read`", and that WAS true:
   *      `GRANT_SHAPE_BY_ROLE` had five shapes and not one `legal:` permission, which is V-E3-L1.
   *      The product owner's answer (D-E) put the reserved-matter chain on the `NAZIR` shape and a
   *      read on the new `CASE_MANAGER` shape, so the SCREEN is now reachable by a seeded seat. The
   *      pin now asserts the PRESENCE, so a removal fires it again.
   *   2. ⬜ **STILL OPEN, AND IT IS WHY THIS TEST SURVIVES.** THE SEED MINTS NO `RESERVED_MATTER`
   *      APPROVAL REQUEST. Its only `ApprovalRequest` is `appr-dist-001`, a spent
   *      `DISTRIBUTION_RUN` (`deriveRunApprovals`). With no PENDING reserved matter there is
   *      nothing for the panel to mark blocked, so the "blocked until approved" RENDERING is still
   *      unproven in a browser — by one reason now instead of two.
   *
   * A conditional `if (matters > 0)` would report that silence as success — the exact failure mode
   * R6-C1 recorded permanently: *a property whose generator cannot reach a configuration reports
   * its silence as success, at scale.* So instead, the two absences are PINNED against the seed's
   * own source text. The day the fixture gains a reserved-matter grant or a PENDING matter, THIS
   * TEST FAILS — and its message is the instruction to replace it with the real journey.
   *
   * The behavioural guarantee is NOT unproven meanwhile: `withReservedMatter()`, the subject and
   * kind checks and the 42501 trigger refusal are proven in `packages/api/test` and
   * `packages/database/test` against a real database. What is unproven is the RENDERING, in a
   * browser, in two languages. That is this file's subject, and it is honest about not having it.
   */
  const map = readFileSync(
    fileURLToPath(new URL('../../../packages/database/src/seed/map.ts', import.meta.url)),
    'utf8',
  );

  // Read as TEXT rather than imported: importing the seed's module graph into a Playwright worker
  // pulls the Prisma client and the residency guard. The repo's cross-package parity tests use the
  // same technique for the same reason.
  const shapes = map.slice(map.indexOf('export const GRANT_SHAPE_BY_ROLE'));
  expect(
    shapes.length,
    'GRANT_SHAPE_BY_ROLE was not found in the seed — this pin has stopped inspecting anything',
  ).toBeGreaterThan(200);

  // ── REASON 1, INVERTED (V-E3-L1 / owner decision D-E) ─────────────────────────────────────
  // The direction of this assertion is the record of a fixture gap that CLOSED. If the grants are
  // ever removed again, §17's E3 exit clause becomes unreachable by every user that exists — which
  // is exactly what V-E3-L1 found — and this fires.
  expect(
    shapes.includes('legal:reserved_matter'),
    'NO SEEDED GRANT CARRIES A RESERVED-MATTER PERMISSION ANY MORE. That is V-E3-L1 returning: ' +
      'the reserved-matter screen becomes unreachable by every seeded seat, and §17’s E3 exit ' +
      'clause ("the reason renders as a human-readable statement") cannot be demonstrated. The ' +
      'product owner put this read on the nazir and case-manager shapes (D-E, 2026-08-16).',
  ).toBe(true);
  // The screen's reachability is proven in a BROWSER by `endowment.spec.ts`'s control seat, which
  // holds this read; what is still missing is a matter for it to show — reason 2.

  expect(
    /'RESERVED_MATTER'|"RESERVED_MATTER"/.test(map),
    'THE SEED NOW MINTS A RESERVED_MATTER APPROVAL REQUEST. There is now a subject for the ' +
      '"blocked until approved" rendering: replace this pin with a browser assertion on ' +
      'qm-reserved-matter[data-blocked="true"] and qm-reserved-blocked, in both locales.',
  ).toBe(false);
});

/* ─────────────────────────────────────────────────────────────────────────────────────────
 * Shared assertions
 * ────────────────────────────────────────────────────────────────────────────────────────── */

interface KernelResponse {
  readonly status: number;
  readonly result?: { readonly data?: unknown };
  readonly error?: {
    readonly message?: string;
    readonly data?: { readonly code?: string; readonly apiCode?: string | null };
  };
}

/**
 * Invokes a procedure through the REAL browser `fetch`, exactly as `kernel.spec.ts` does — the
 * page's own origin, its own cookie jar, and the un-widened middleware matcher.
 */
async function callKernel(
  page: Page,
  path: string,
  input?: unknown,
  locale?: string,
): Promise<KernelResponse> {
  const query = input === undefined ? '' : `?input=${encodeURIComponent(JSON.stringify(input))}`;
  return page.evaluate(
    async ({ url, localeHeader }: { url: string; localeHeader?: string }) => {
      const response = await fetch(url, {
        credentials: 'same-origin',
        headers: {
          accept: 'application/json',
          ...(localeHeader === undefined ? {} : { 'x-qmulate-locale': localeHeader }),
        },
      });
      const text = await response.text();
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(text) as Record<string, unknown>;
      } catch {
        parsed = { error: { message: text.slice(0, 200) } };
      }
      return { status: response.status, ...parsed };
    },
    { url: `/api/trpc/${path}${query}`, ...(locale === undefined ? {} : { localeHeader: locale }) },
  );
}

/**
 * Every rendering of a machine-readable identifier sits inside an LTR isolate.
 *
 * Walks the text nodes of the main region and, for each one containing the identifier, climbs to the
 * root looking for a `<bdi dir="ltr">` ancestor. A bare occurrence is reported with its container's
 * tag and class so the failure names WHERE the isolate is missing rather than only that a count
 * moved — the difference between a fix and a hunt.
 */
async function expectEveryOccurrenceIsLtrIsolated(page: Page, identifier: string): Promise<void> {
  const found = await page.evaluate(
    ({ needle }) => {
      const root = document.querySelector('#qm-main');
      if (root === null) return { total: 0, bare: ['#qm-main is missing'] };
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const bare: string[] = [];
      let total = 0;
      while (walker.nextNode() !== null) {
        const node = walker.currentNode;
        if (node.textContent === null || !node.textContent.includes(needle)) continue;
        total += 1;
        let element = node.parentElement;
        let isolated = false;
        while (element !== null) {
          if (element.tagName === 'BDI' && element.getAttribute('dir') === 'ltr') {
            isolated = true;
            break;
          }
          element = element.parentElement;
        }
        if (!isolated) {
          const owner = node.parentElement;
          bare.push(
            owner === null
              ? '(detached text node)'
              : `<${owner.tagName.toLowerCase()} class="${owner.className}">`,
          );
        }
      }
      return { total, bare };
    },
    { needle: identifier },
  );

  expect(found.total, `${identifier} does not appear on the screen at all`).toBeGreaterThan(0);
  expect(
    found.bare,
    `${identifier} is rendered outside an LTR isolate, so its digits reorder against Arabic text`,
  ).toEqual([]);
}

/**
 * ⚠ THE LOAD-BEARING ASSERTION OF THIS FILE: THE SHART AL-WAQIF HAS NO WRITE PATH IN THE UI.
 *
 * The founder's conditions are written once and no approval opens them. A greyed-out "Edit" would
 * be WORSE than nothing: it teaches a Nazir that the conditions are editable by someone holding the
 * right permission — that a key exists somewhere — when the whole point is that none does.
 *
 * Three layers, because "no button" alone is a weak claim:
 *   1. no form control of ANY kind in the main region, enabled or disabled;
 *   2. no link to a write route (a hidden affordance is still an affordance);
 *   3. NO SUCH ROUTE EXISTS — the plausible edit URLs 404 rather than rendering a form nobody
 *      linked. Scoped to `#qm-main` because the app chrome legitimately has a sign-out button and a
 *      locale switch.
 */
async function assertShartHasNoWritePath(
  page: Page,
  context: BrowserContext,
  locale: 'ar' | 'en',
): Promise<void> {
  const main = page.locator('#qm-main');

  await expect(
    main.locator('button, input, textarea, select, [role="button"], form, [contenteditable]'),
    "the founder's-conditions screen must offer no write control, not even a disabled one",
  ).toHaveCount(0);

  const hrefs = await main
    .locator('a[href]')
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''));
  for (const href of hrefs) {
    expect(
      /shart\/(edit|new|amend|update|correct)/.test(href),
      `the Shart screen links a write route: ${href}`,
    ).toBe(false);
  }

  for (const suffix of ['edit', 'amend', 'new', 'correct']) {
    const response = await getSurvivingOneTransportFault(
      context.request,
      `/${locale}/endowments/${WAQF_ID}/shart/${suffix}`,
      { maxRedirects: 0 },
    );
    expect(
      response.status(),
      `/${locale}/endowments/${WAQF_ID}/shart/${suffix} answered ${String(response.status())} — ` +
        `an unlinked edit route is still an edit route`,
    ).toBe(404);
  }
}

/**
 * THE ARABIC LAYOUT ACTUALLY REVERSES — a geometric fact, not a `dir` attribute.
 *
 * `dir="rtl"` on `<html>` proves only that the attribute is set. What must hold is that the LOGICAL
 * properties the whole app is authored in produce a MIRRORED layout: `ms-`/`me-`/`ps-`/`pe-`,
 * `border-s-`, `text-start` and flex direction all follow `direction`, and none of them is a
 * physical `ml-`/`pr-`/`left`/`right`. Three independent checks, because any one of them can pass
 * for the wrong reason:
 *
 *   1. GEOMETRY — the sidebar sits on the opposite side of the main column in the two locales. This
 *      is the one a human would notice, and it is measured from bounding boxes;
 *   2. A LOGICAL BORDER RESOLVES TO THE OTHER PHYSICAL SIDE — the tab strip's active marker is
 *      `border-s-2`, so the 2px lands on the RIGHT in Arabic and on the LEFT in English. A physical
 *      `border-l-2` would put it on the same side in both and this fails;
 *   3. `--nu-dir` — the X multiplier on every neumorphic shadow offset. The light source is
 *      inline-start, so it mirrors with direction while Y offsets never change.
 */
async function assertLayoutMirrors(page: Page, locale: 'ar' | 'en'): Promise<void> {
  await page.goto(`/${locale}/endowments/${WAQF_ID}/shart`);
  await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');

  /**
   * ⚠ VISIBILITY FIRST, THEN GEOMETRY. `boundingBox()` WAITS for its element, so measuring a shell
   * that never rendered burns the whole test budget and reports "timeout" — measured, on a run where
   * the page under test was actually the sign-in screen. Asserting visibility fails in 5 s and names
   * what was missing.
   */
  await expect(
    page.getByTestId('qm-sidebar'),
    'the app shell did not render, so there is no layout to measure',
  ).toBeVisible();
  const sidebar = await page.getByTestId('qm-sidebar').boundingBox();
  const main = await page.locator('#qm-main').boundingBox();
  expect(sidebar, 'no sidebar to measure').not.toBeNull();
  expect(main, 'no main column to measure').not.toBeNull();
  if (sidebar === null || main === null) return;

  if (locale === 'ar') {
    expect(
      sidebar.x,
      `the sidebar is not mirrored: it sits at x=${String(sidebar.x)} while the main column ` +
        `starts at x=${String(main.x)} — in RTL it must be on the RIGHT of the content`,
    ).toBeGreaterThan(main.x);
  } else {
    expect(sidebar.x, 'the sidebar is not on the left in LTR').toBeLessThan(main.x);
  }

  const activeTab = page.getByTestId('qm-endowment-tabs').locator('[aria-current="page"]');
  await expect(activeTab).toHaveCount(1);
  const border = await activeTab.evaluate((node) => {
    const computed = getComputedStyle(node);
    return { left: computed.borderLeftWidth, right: computed.borderRightWidth };
  });
  if (locale === 'ar') {
    expect(border.right, 'the active tab’s inline-start border did not mirror to the right').toBe(
      '2px',
    );
    expect(border.left).toBe('0px');
  } else {
    expect(border.left, 'the active tab’s inline-start border is not on the left in LTR').toBe(
      '2px',
    );
    expect(border.right).toBe('0px');
  }

  const nuDir = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--nu-dir').trim(),
  );
  expect(nuDir, 'the neumorphic light source did not mirror with direction').toBe(
    locale === 'ar' ? '-1' : '1',
  );

  /**
   * ── THE LABEL TREATMENT IS LANGUAGE-SWITCHED, NOT TRANSLATED ─────────────────────────────
   * Latin labels are Geist Mono, UPPERCASE, +0.13em tracking. ARABIC LABELS ARE NEITHER: Geist
   * Mono has no Arabic glyphs, and both uppercasing and letter-spacing break the cursive joins.
   * Asserting BOTH directions is what makes the pair non-vacuous — a stylesheet that simply
   * dropped the treatment everywhere would satisfy the Arabic half alone.
   */
  const labels = page.locator('#qm-main .qm-label');
  const labelCount = await labels.count();
  expect(
    labelCount,
    'no labels on this screen to check the Arabic treatment against',
  ).toBeGreaterThan(0);
  for (let index = 0; index < Math.min(labelCount, 12); index += 1) {
    const style = await labels.nth(index).evaluate((node) => {
      const computed = getComputedStyle(node);
      return { transform: computed.textTransform, spacing: computed.letterSpacing };
    });
    if (locale === 'ar') {
      expect(style.transform, 'an Arabic label is uppercased').toBe('none');
      expect(
        ['normal', '0px', ''].includes(style.spacing),
        `an Arabic label is letter-spaced (${style.spacing})`,
      ).toBe(true);
    } else {
      expect(style.transform, 'a Latin label lost its uppercase treatment').toBe('uppercase');
      expect(
        ['normal', '0px', ''].includes(style.spacing),
        'a Latin label lost its tracking, so the Arabic assertion above would pass vacuously',
      ).toBe(false);
    }
  }
}

/**
 * No raw dotted message key reached the reader, in EITHER language.
 *
 * next-intl PRINTS the key when a message is missing instead of throwing, so a missing translation
 * is a SILENT VISUAL DEFECT — and Arabic is the authoritative language, so the person most likely
 * to meet it is the one whose language matters most (NFR-01).
 *
 * ⚠ SCOPED TO VISIBLE TEXT, NOT `page.content()`. `[locale]/layout.tsx` hands the WHOLE catalogue to
 * `NextIntlClientProvider`, so every key path is serialised into the RSC payload of every page by
 * construction. That is a framework artefact, identical for every caller; what must never happen is
 * a key being RENDERED. The scan covers the CHROME as well as the main region, because the sidebar
 * and topbar are user-facing too.
 */
async function expectNoRawKeys(page: Page, where: string): Promise<void> {
  const visible = await page.locator('body').innerText();
  const match = RAW_KEY_PATTERN.exec(visible);
  expect(
    match?.[0] ?? null,
    `a raw message key was rendered on ${where} — the catalogue is missing an entry, and ` +
      `next-intl printed the key instead of throwing`,
  ).toBeNull();
  // next-intl's own missing-message marker, in case the shape of a fallback ever changes.
  expect(
    visible,
    `a next-intl MISSING_MESSAGE marker reached the screen on ${where}`,
  ).not.toContain('MISSING_MESSAGE');

  await expectDiagnosticCodesAreCodes(page, where);
}

/**
 * A DIAGNOSTIC CODE IS A TOKEN. IF IT HAS SPACES IN IT, IT IS PROSE WEARING A CODE'S CLOTHES.
 *
 * ⚠ THIS EXISTS BECAUSE THE FAILURE IT DESCRIBES SHIPPED (V-E3-M4). `@qmulate/domain`'s
 * `SURFACED_REPRESENTATIVE_SCOPE` — a 464-character ENGLISH DEVELOPER PARAGRAPH whose own module
 * says such strings "are never rendered to a beneficiary" — travelled in the deed verdict's
 * `surfacedQuestions` and was rendered through `<DiagnosticCode>` on the deed screen, in BOTH
 * locales, on the shipped fixture. Measured: 464 characters of English inside `<bdi dir="ltr">`,
 * announced to a screen reader on the Arabic page as "رمز تشخيصي".
 *
 * The web layer no longer carries that field at all. This assertion is the general form of the
 * lesson, so the next free-text field to reach a code slot fails a test instead of shipping: every
 * `<DiagnosticCode>` on every screen this suite visits must hold a single whitespace-free token.
 * `SCREAMING_SNAKE`, a dotted rule key, an obligation code and `unrecognised` all pass; a sentence
 * does not. The check reads the inner `<bdi>` rather than the well, so the component's own sr-only
 * label is not mistaken for content.
 */
async function expectDiagnosticCodesAreCodes(page: Page, where: string): Promise<void> {
  const codes = await page.locator('[data-testid="qm-diagnostic-code"] bdi').allTextContents();
  const prose = codes.filter((code) => /\s/.test(code.trim()) || code.trim().length > 64);
  expect(
    prose,
    `a diagnostic code slot on ${where} holds prose, not a code — a developer note is not copy, ` +
      `and the ar/en wording a reader needs belongs in packages/i18n`,
  ).toEqual([]);
}

/**
 * The page itself never scrolls horizontally, in either direction, at any of the three widths.
 *
 * `globals.css` deliberately does NOT set `overflow-x: hidden`: hiding the overflow would make this
 * assertion vacuous, and a mirrored layout that overflows in one direction only is the classic RTL
 * regression. Wide content (the obligation tables, the tab strip) scrolls inside its own container.
 *
 * ⚠ IT RESIZES WITHOUT RE-NAVIGATING, and that is a fix rather than a shortcut. The first version
 * re-`goto`'d the same URL at every width, which against `next dev` cost three extra route
 * compilations and pushed the whole test past its 30 s budget (measured). The breakpoints are CSS
 * media queries — `md:flex-row`, `md:grid-cols-*` — so a viewport change re-lays the page out on its
 * own; the reload proved nothing the resize does not. The assertion is unchanged.
 */
async function assertNoHorizontalOverflow(page: Page, url: string): Promise<void> {
  await page.goto(url);
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(
      overflow,
      `horizontal overflow at ${String(viewport.width)}px on ${url}`,
    ).toBeLessThanOrEqual(1);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

/**
 * ⊕ S11 · 2b — THE READ SEAT'S BOARD: its one endowment, every chip REFUSED in words.
 * `matrix-admin` holds admin:access_matrix:*, endowment:waqf:read and audit:event:read on waqf-001 and no
 * compliance, finance, beneficiary or filing verb — so the board it is entitled to is a board of five
 * refusals, each a sentence in the neutral colour: not yellow (there is nothing to attend to), not a
 * zero, not green. The scope is one endowment and the roll-up carries it as refused, not as absent.
 */
test('S11-2b · the read seat sees the board for its one endowment with every indicator refused in words, never a colour or a zero', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await seatedJourney(browser, testInfo, locale, async (page) => {
    await page.goto(`/${locale}/dashboard`);
    await expect(page.locator('[data-testid^="qm-selector-waqf-"]')).toHaveCount(1);
    await expect(page.getByTestId('qm-selector-waqf-001')).toBeVisible();

    const board = page.getByTestId('qm-board');
    await expect(board).toHaveAttribute('data-waqf', 'waqf-001');
    await expect(board).toHaveAttribute('data-tone', 'refused');
    for (const key of ['registration', 'commingling', 'kyc', 'aml', 'licence']) {
      await expect(page.getByTestId(`qm-kpi-${key}`)).toHaveAttribute('data-tone', 'refused');
      await expect(page.getByTestId(`qm-kpi-${key}-value`)).toHaveText(copy.dashboard.tone.refused);
      await expect(page.getByTestId(`qm-kpi-${key}-refused`)).toHaveText(
        copy.dashboard.board.refusedRead,
      );
    }
    // No deadline line renders from a refused read — not an empty list, a refusal.
    await expect(page.locator('[data-testid^="qm-rule-"]')).toHaveCount(0);
    await expect(page.getByTestId('qm-rollup-waqf-001')).toHaveAttribute('data-tone', 'refused');
    await expect(board.locator('form')).toHaveCount(0);
    expect((await board.textContent()) ?? '', `raw key on the board [${locale}]`).not.toMatch(
      RAW_KEY_PATTERN,
    );
  });
});
