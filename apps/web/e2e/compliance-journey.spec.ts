import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect, test } from '@playwright/test';

/**
 * ⊕ S11 — THE CROSS-LOCALE SEAT HANDSHAKE NOW LIVES IN ONE PLACE.
 *
 * This file used to carry its own copy of the leader/follower TOTP handshake, ~230 lines of it.
 * `S11-2` declared the extraction owed at the second copy; item 2c escalated it at the third; it is
 * done here, and `test/e2e-harness-single-source.test.ts` pins that no spec re-defines it. The three
 * copies had already drifted — documentation and error wording only, ZERO non-comment differing
 * lines — and the shared module took the richest version, so this file gained explanations it lacked.
 */
import { SEED_PASSWORD, createSeatHandshake, localeFor } from './support/seat-handshake';

/**
 * ⊕ S11-2 · THE SEATED WRITE JOURNEY — a compliance seat records a registration duty as DISCHARGED,
 * in a real browser, in both locales.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────────────────
 * S11-1 declared it owed: *"a seated WRITE journey needs a second enrolled seat in this harness"*.
 * Every human seat the fixture had was CLAIMED by exactly one spec (rule 2 below) and TOTP enrolment
 * is a one-way door, so a browser journey that WRITES needed a seat nobody else holds. S11-2 seeds one:
 * `compliance@example.test` (`user-compliance-001`, CASE_MANAGER, ONE grant, on `waqf-004` alone).
 * CASE_MANAGER holds `compliance:task:write` — the discharge verb — and NOT `endowment:waqf:write`,
 * so the same screen shows this seat the discharge form and NOT the clock-start form. Both halves are
 * asserted: a control the reader cannot use is a false statement about the product (the E3 pin).
 *
 * ── WHAT THIS FILE PROVES ─────────────────────────────────────────────────────────────────
 *   1. the seat reaches `waqf-004`'s record and reads its recorded clock-start (invented, fixture);
 *   2. the discharge section is DRAWN for this seat (it holds `compliance:task:read`), the anchor form
 *      is ABSENT (no `endowment:waqf:write`), and the discharge form is present while the duty stands
 *      open;
 *   3. submitting a completion date records the duty as MET — the screen then shows the discharged
 *      state with the catalogue's own words, and the form is gone (nothing left to press);
 *   4. the two locales share ONE database, so whichever project arrives second finds the duty already
 *      discharged — and if both submit inside the same window the second is REFUSED BY NAME and told
 *      so in its own language. Neither outcome is a skip: both end on the discharged state;
 *   5. no raw message key reaches the screen in either language.
 *
 * ── THREE STRUCTURAL RULES INHERITED FROM `endowment-journey.spec.ts` ──────────────────────
 * 1. One `BrowserContext` per journey; API calls go through `context.request`.
 * 2. A seat is claimed by exactly one spec. This file holds `compliance@` and nothing else.
 * 3. TOTP enrolment is a ONE-WAY DOOR — the handshake below enrols ONCE per run and shares the SESSION.
 *
 * ⚠ THE HANDSHAKE IS A COPY OF `endowment-journey.spec.ts`'s, seat and directory changed. Extracting
 * it into a shared helper is DECLARED OWED (both copies must then redden together on a parameter
 * change — the reason the TOTP generator is copied per file is the reason a shared harness helper
 * would need its own pin).
 */

/* ── a minimal RFC 6238 TOTP generator (SHA-1, 6 digits, 30 s), matching `packages/auth` ────── */

/* ── fixture facts — MEASURED against the seeded database ──────────────────────────────── */

/** The WRITE seat: CASE_MANAGER, ONE grant, on `waqf-004` alone (S11-2). */
const WRITE_SEAT = { email: 'compliance@example.test', password: SEED_PASSWORD } as const;

/** This journey's seat, its own handshake directory, and the endowment its stale path asserts on. */
const { seatedJourney } = createSeatHandshake({
  seat: WRITE_SEAT,
  handshakeDirName: 'qmulate-e2e-seat-compliance',
  waqfId: 'waqf-004',
});

/** The SMALL · FAMILY_DHURRI endowment whose invented clock-start (2026-04-19) is left undischarged. */
const WAQF_ID = 'waqf-004';

/**
 * The completion date this journey records. After the computed due date (≈ end of May 2026) so the
 * duty is discharged LATE — the honest shape for an endowment that predates the regulation — and
 * before any plausible "today" so the kernel's future-date refusal never fires.
 */
const DISCHARGED_ON = '2026-06-15';

/* ── the seat handshake — one enrolment per run, the SESSION shared by both locales ─────── */

/* ── the catalogue, READ AT TEST TIME (the screen must show the catalogue — NFR-01) ───────── */

interface Catalogue {
  /** ⊕ S11 · 2b — the compliance board's copy the journeys assert against. */
  readonly dashboard: {
    readonly board: { readonly refusedRead: string };
    readonly tone: { readonly danger: string; readonly warning: string; readonly refused: string };
    readonly state: { readonly overdue: string };
    readonly cause: {
      readonly NOT_RECORDED: string;
      readonly RECORDED_NOT_COMPUTABLE: string;
      readonly ROUTED_NO_HOME: string;
      readonly NOT_IN_SCOPE_YET: string;
    };
    readonly aml: { readonly notModelled: string };
  };
  readonly endowments: {
    readonly dischargeKindValue: { readonly MET: string };
    readonly discharge: {
      readonly open: string;
      readonly saved: string;
      readonly refusedAlready: string;
      readonly save: string;
    };
  };
}

function catalogue(locale: 'ar' | 'en'): Catalogue {
  const here = fileURLToPath(new URL('.', import.meta.url));
  const path = join(here, '..', '..', '..', 'packages', 'i18n', 'messages', `${locale}.json`);
  return JSON.parse(readFileSync(path, 'utf8')) as Catalogue;
}

/** A raw dotted message key — what next-intl PRINTS when a message is missing. */
const RAW_KEY_PATTERN = /(?:endowments|errors|common|nav|auth|dashboard)\.[a-zA-Z][a-zA-Z0-9_]*/;

/* ═════════════════════════════════════════════════════════════════════════════════════════
 * THE JOURNEY
 * ══════════════════════════════════════════════════════════════════════════════════════ */

test('S11-2 · a compliance seat records the registration duty as DISCHARGED, and the screen shows the met state in its own words', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await seatedJourney(browser, testInfo, locale, async (page) => {
    console.log(`[S11-2-JOURNEY][${locale}] write journey RAN against ${WRITE_SEAT.email}`);

    await page.goto(`/${locale}/endowments/${WAQF_ID}`);
    const panel = page.getByTestId('qm-anchor-panel');
    await expect(panel).toBeVisible();

    // 1 · the recorded clock-start, and NO clock-start form: this seat holds no `endowment:waqf:write`.
    await expect(page.getByTestId('qm-anchor-recorded')).toBeVisible();
    await expect(page.getByTestId('qm-anchor-form')).toHaveCount(0);
    await expect(page.getByTestId('qm-anchor-clear-form')).toHaveCount(0);

    // 2 · the discharge section IS drawn (the seat reads deadlines), and the duty is either still
    //     open — this project got here first — or already discharged by the other locale's run.
    const section = page.getByTestId('qm-discharge-section');
    await expect(section).toBeVisible();
    await expect(page.getByTestId('qm-registration-no-deadline')).toHaveCount(0);

    const open = page.getByTestId('qm-registration-open');
    if ((await open.count()) > 0) {
      await expect(open).toContainText(copy.endowments.discharge.open);
      const form = page.getByTestId('qm-discharge-form');
      await expect(form).toBeVisible();
      await expect(page.getByTestId('qm-discharge-save')).toContainText(
        copy.endowments.discharge.save,
      );

      // 3 · record the completion date. The browser sends the date ALONE; the kernel does the rest.
      await page.getByTestId('qm-discharge-date').fill(DISCHARGED_ON);
      await page.getByTestId('qm-discharge-save').click();

      // 4 · either outcome ends on the discharged state — a race with the other locale is a REFUSAL
      //     BY NAME, rendered in this locale's words, never a silent success or a generic error.
      const notice = page.getByTestId('qm-anchor-notice');
      await expect(notice).toBeVisible();
      const kind = await notice.getAttribute('data-notice');
      expect(['dischargeSaved', 'dischargeRefusedAlready']).toContain(kind);
      await expect(notice).toContainText(
        kind === 'dischargeSaved'
          ? copy.endowments.discharge.saved
          : copy.endowments.discharge.refusedAlready,
      );
      console.log(`[S11-2-JOURNEY][${locale}] submit → ${String(kind)}`);
    } else {
      console.log(`[S11-2-JOURNEY][${locale}] duty already discharged by the other project's run`);
    }

    const discharged = page.getByTestId('qm-registration-discharged');
    await expect(discharged).toBeVisible();
    await expect(discharged).toContainText(copy.endowments.dischargeKindValue.MET);
    // Nothing left to press: the form is gone with the open state, not disabled.
    await expect(page.getByTestId('qm-discharge-form')).toHaveCount(0);
    await expect(page.getByTestId('qm-registration-open')).toHaveCount(0);

    // 5 · no raw message key anywhere on the panel, in this language.
    const text = (await panel.textContent()) ?? '';
    expect(text, `raw message key on the anchor panel [${locale}]`).not.toMatch(RAW_KEY_PATTERN);
  });
});

/**
 * ═════════════════════════════════════════════════════
 * S11 · 2b — THE COMPLIANCE BOARD, on the seat that can read three endowments
 * ═════════════════════════════════════════════════════
 * E10's exit words: "an overdue Authority update lights the KPI red". waqf-003 carries exactly that row
 * (UPDATE_15BD, due 2026-06-09, raised by the sweep) AND a null registration anchor — so one board shows
 * a red chip, an overdue line, a NOT_RECORDED cause and two pinned decisions. waqf-007 shows the one
 * cause nothing else on the fixture renders (RECORDED_NOT_COMPUTABLE); waqf-004 the healthy cause
 * (NOT_IN_SCOPE_YET). The seat holds exactly these three; waqf-005 is not in its scope and must not
 * appear. The board has NO forms, and no raw key reaches the screen in either language.
 */
test('S11-2b · the compliance board lights red on the overdue Authority update, speaks every cause in words, scopes to three endowments and carries no form', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);

  await seatedJourney(browser, testInfo, locale, async (page) => {
    await page.goto(`/${locale}/dashboard?waqf=waqf-003`);
    await expect(page.locator('html')).toHaveAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');

    const board = page.getByTestId('qm-board');
    await expect(board).toBeVisible();
    await expect(board).toHaveAttribute('data-waqf', 'waqf-003');
    // DANGER DOMINATES: one red chip makes the board red.
    await expect(board).toHaveAttribute('data-tone', 'danger');

    // 1 · KPI 1 is red, and the words carry the meaning (never the dot alone).
    await expect(page.getByTestId('qm-kpi-registration')).toHaveAttribute('data-tone', 'danger');
    await expect(page.getByTestId('qm-kpi-registration-value')).toHaveText(
      copy.dashboard.tone.danger,
    );

    // 2 · the overdue UPDATE_15BD line: state word, a business-days-late figure, a pinned decision.
    const update = page.getByTestId('qm-rule-UPDATE_15BD');
    await expect(update).toHaveAttribute('data-state', 'overdue');
    await expect(update.getByText(copy.dashboard.state.overdue).first()).toBeVisible();
    await expect(update.locator('[data-testid$="-days"]')).toHaveCount(1);
    await expect(page.getByTestId('qm-decision-overdue-UPDATE_15BD')).toBeVisible();

    // 3 · the registration clock-start is NOT RECORDED on 003 — the cause is a sentence, and a decision.
    await expect(page.getByTestId('qm-cause-REGISTER_30BD')).toHaveText(
      copy.dashboard.cause.NOT_RECORDED,
    );
    await expect(page.getByTestId('qm-decision-record-REGISTER_30BD')).toBeVisible();

    // 4 · the two indeterminate indicators say so — warning, in words, never green.
    await expect(page.getByTestId('qm-kpi-aml')).toHaveAttribute('data-tone', 'warning');
    await expect(page.getByTestId('qm-aml-sentence')).toHaveText(copy.dashboard.aml.notModelled);
    await expect(page.getByTestId('qm-kpi-licence')).toHaveAttribute('data-tone', 'warning');
    await expect(page.getByTestId('qm-cause-LICENSE_RENEWAL')).toHaveText(
      copy.dashboard.cause.ROUTED_NO_HOME,
    );

    // 5 · scope: exactly the seat's three endowments; waqf-005 is not among them; the roll-up is red on 003.
    await expect(page.locator('[data-testid^="qm-selector-waqf-"]')).toHaveCount(3);
    for (const id of ['waqf-003', 'waqf-004', 'waqf-007']) {
      await expect(page.getByTestId(`qm-selector-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId('qm-selector-waqf-005')).toHaveCount(0);
    await expect(page.getByTestId('qm-rollup-waqf-003')).toHaveAttribute('data-tone', 'danger');

    // 6 · NO FORMS on the board (the E3 pin), and no raw message key in this language.
    await expect(board.locator('form')).toHaveCount(0);
    await expect(board.locator('input, select, textarea, button[type="submit"]')).toHaveCount(0);
    expect((await board.textContent()) ?? '', `raw key on the board [${locale}]`).not.toMatch(
      RAW_KEY_PATTERN,
    );

    // 7 · waqf-007: RECORDED, NOT COMPUTABLE — the distinction the honesty design exists for.
    await page.goto(`/${locale}/dashboard?waqf=waqf-007`);
    await expect(page.getByTestId('qm-board')).toHaveAttribute('data-waqf', 'waqf-007');
    await expect(page.getByTestId('qm-cause-REGISTER_30BD')).toHaveText(
      copy.dashboard.cause.RECORDED_NOT_COMPUTABLE,
    );
    await expect(page.getByTestId('qm-kpi-registration')).toHaveAttribute('data-tone', 'warning');

    // 8 · waqf-004: a valid certificate is NOT IN SCOPE YET (healthy by fact); its registration row exists,
    //     open or discharged by the sibling journey — file order is not assumed.
    await page.goto(`/${locale}/dashboard?waqf=waqf-004`);
    await expect(page.getByTestId('qm-board')).toHaveAttribute('data-waqf', 'waqf-004');
    await expect(page.getByTestId('qm-cause-UPDATE_15BD')).toHaveText(
      copy.dashboard.cause.NOT_IN_SCOPE_YET,
    );
    await expect(page.getByTestId('qm-rule-REGISTER_30BD')).toHaveAttribute(
      'data-state',
      /^(overdue|met)$/,
    );

    // 9 · waqf-004's COMMINGLING CHIP — and this assertion is a CORRECTION of a claim this spec
    //     briefly made. It first asserted `warning`, on the reasoning that waqf-004 has no
    //     transactions, therefore no derived bank account, therefore the composer's zero-account
    //     branch. **That was wrong, and this E2E is what caught it.** `CASE_MANAGER` — this seat's
    //     role — holds NO `finance:*` verb at all, so `finance.summary` throws FORBIDDEN, the loader
    //     carries `{ ok: false }`, and `composeComplianceKpis` takes its `refused` branch BEFORE any
    //     commingling counter is read. The chip is `refused` here, and that is exactly right: a read
    //     this seat could not make says so, and claims nothing about the endowment.
    //
    //     ⚠ So the green-from-nothing defect fixed in `68d1439` was LATENT, NOT LIVE on this board:
    //     reaching it needs a caller who CAN read finance and finds zero accounts. The composer fix
    //     and its six unit tests stand; the claim that this screen rendered a false green does not.
    //     What IS asserted here is the invariant that matters either way — this chip is never
    //     `success` for an endowment whose finance position this seat cannot even read.
    await expect(page.getByTestId('qm-kpi-commingling')).toHaveAttribute('data-tone', 'refused');
    await expect(page.getByTestId('qm-kpi-commingling')).not.toHaveAttribute(
      'data-tone',
      'success',
    );
    await expect(page.getByTestId('qm-kpi-commingling-value')).toHaveText(
      copy.dashboard.tone.refused,
    );
  });
});
