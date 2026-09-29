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
 * ⊕ S11 · 2c · THE READ-ONLY FINANCIAL JOURNEY — an auditor seat reads `/financials` for five
 * endowments, in a real browser, in both locales.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────────────────────
 * The owner ruled on 2026-09-03 (*"i like b"*) that the financial figures get their own screen. Every
 * human seat in the fixture was already CLAIMED by exactly one spec and TOTP enrolment is a ONE-WAY
 * DOOR (the secret is returned once), so a read journey needed a seat nobody else holds — the
 * read-only mirror of the act S11-2 took for its write journey. 2c seeds
 * `auditor@example.test` (`user-auditor-001`, AUDITOR), whose grant carries TWO verbs of the role's
 * seventeen: `finance:transaction:read` for the figures and `endowment:waqf:read` so
 * `navigation.tree` will disclose the certificate number that LABELS them. Fifteen are withheld —
 * `GRANT_SHAPE_BY_ROLE.AUDITOR` names which and why.
 *
 * ── WHAT THIS SPEC ASSERTS, AND WHY EACH ENDOWMENT IS HERE ─────────────────────────────────
 *  · `waqf-001` — the BLENDED FIGURE, unhedged: one account whose net is 93.9% ISTIBDAL PROCEEDS,
 *    capital by a RULED classification. The corpus companion must be on the SCREEN beside the net,
 *    because the wire being right is not the claim a Nazir reads.
 *  · `waqf-003` — the same wall at scale (20,000,000.00 of corpus inside 21,680,000.00 of cash).
 *  · `waqf-004` — DIRECT UTILIZATION: §14 §5.1(3) requires the report to STATE that no monetary
 *    distribution exists rather than show zeros. §10's "link the dedicated account first" sentence
 *    would be actively WRONG copy here, so it must not appear.
 *  · `waqf-005` — the INTAKE STATE: an all-zero payload IDENTICAL to waqf-004's, different meaning.
 *  · `waqf-007` — the healthy simple board.
 *  · `arrears` renders as a SENTENCE, never a zero. The three unbuilt regions are DECLARED on the
 *    screen. No form appears anywhere (the E3 pin).
 *
 * ── ORDER INDEPENDENCE ─────────────────────────────────────────────────────────────────────
 * This journey is READ-ONLY, so unlike S11-2's discharge leg it mutates nothing and neither locale
 * can inherit the other's state: both projects assert the same figures from the same seeded rows.
 *
 * ⚠ THE HANDSHAKE IS THE **THIRD** COPY of `endowment-journey.spec.ts`'s, seat and directory changed.
 * S11-2 declared extraction owed at the second copy; at three it is the clear next refactor, and it
 * is NOT taken inside a feature commit because it would touch two green specs and needs its own pin
 * (both copies must redden together on a parameter change). **Escalated, not silently repeated.**
 */

/* ── a minimal RFC 6238 TOTP generator (SHA-1, 6 digits, 30 s), matching `packages/auth` ────── */

/* ── fixture facts — MEASURED against the seeded database ──────────────────────────────── */

/**
 * ⊗ THE READ-ONLY FINANCIAL SEAT — and this docblock is a CORRECTION. When item 2c copied the
 * handshake it inherited the previous file's comment, which read *"The WRITE seat: CASE_MANAGER, ONE
 * grant, on waqf-004 alone (S11-2)"* — false in every clause for this spec, and it shipped that way.
 * **The extraction is what surfaced it**, which is one of the quieter arguments for doing it: a
 * comment copied with code describes the file it came FROM.
 *
 * This seat is `AUDITOR` on FIVE endowments, holding TWO verbs of the role's seventeen
 * (`finance:transaction:read` + `endowment:waqf:read`). See `GRANT_SHAPE_BY_ROLE.AUDITOR`.
 */
const READ_SEAT = { email: 'auditor@example.test', password: SEED_PASSWORD } as const;

/**
 * The endowment the handshake's STALE path navigates to — this seat holds a grant on it, which is the
 * only requirement: that path asserts a seatless context is REFUSED, not anything financial.
 */
const WAQF_ID = 'waqf-004';

/** This journey's seat, its own handshake directory, and the endowment its stale path asserts on. */
const { seatedJourney } = createSeatHandshake({
  seat: READ_SEAT,
  handshakeDirName: 'qmulate-e2e-seat-auditor',
  waqfId: WAQF_ID,
});

/* ── the seat handshake — one enrolment per run, the SESSION shared by both locales ─────── */

/* ── the catalogue, READ AT TEST TIME (the screen must show the catalogue — NFR-01) ───────── */

interface Catalogue {
  /** ⊕ S11 · 2c — the FINANCIAL screen's copy this journey asserts against, key for key. */
  readonly financials: {
    readonly cash: {
      readonly ofWhichCorpus: string;
      readonly accountCorpus: string;
      readonly blendedNote: string;
    };
    readonly arrears: { readonly notModelled: string };
    readonly empty: {
      readonly noTransactions: string;
      readonly directUse: string;
      readonly directUseUnrecorded: string;
    };
    readonly owed: {
      readonly transactions: string;
      readonly reconciliation: string;
      readonly statements: string;
    };
  };
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

test('S11-2c · the financial screen shows every blended figure with its corpus companion, states direct utilization instead of zeros, and declares what it does not build', async ({
  browser,
}, testInfo) => {
  const locale = localeFor(testInfo.project.name);
  const copy = catalogue(locale);
  const fin = copy.financials;

  await seatedJourney(browser, testInfo, locale, async (page) => {
    console.log(`[S11-2C-JOURNEY][${locale}] read journey RAN against ${READ_SEAT.email}`);

    /* ── 1 · the route EXISTS and the sidebar links to it ─────────────────────────────────── */
    await page.goto(`/${locale}/financials`);
    await expect(page.getByTestId('qm-fin-selector')).toBeVisible();

    /* ── 2 · SCOPE: exactly the five endowments this seat is granted, and no more ─────────── */
    for (const waqfId of ['waqf-001', 'waqf-003', 'waqf-004', 'waqf-005', 'waqf-007']) {
      await expect(
        page.getByTestId(`qm-fin-selector-${waqfId}`),
        `${waqfId} is in the seat's grant [${locale}]`,
      ).toBeVisible();
    }
    // waqf-002 is NOT in this seat's grant and must not appear — a screen that lists an endowment the
    // caller cannot read is a disclosure defect, not a cosmetic one.
    await expect(page.getByTestId('qm-fin-selector-waqf-002')).toHaveCount(0);

    /* ── 3 · waqf-001 — THE BLENDED FIGURE, and its corpus companion ON THE SCREEN ────────── */
    await page.goto(`/${locale}/financials?waqf=waqf-001`);
    await expect(page.getByTestId('qm-financials')).toHaveAttribute('data-waqf', 'waqf-001');
    await expect(page.getByTestId('qm-financials')).toHaveAttribute('data-empty', 'none');

    // The portfolio total and its corpus figure are BOTH rendered, adjacent.
    await expect(page.getByTestId('qm-fin-cash')).toBeVisible();
    const corpusTile = page.getByTestId('qm-fin-cash-corpus');
    await expect(corpusTile).toContainText(fin.cash.ofWhichCorpus);
    // 4,200,000.00 of istibdal proceeds, rendered with Latin digits in both locales (SAR convention).
    await expect(corpusTile).toContainText('4,200,000.00');

    // And the PER-ACCOUNT row carries its own corpus figure — the defect this screen was built after.
    const accountCorpus = page.getByTestId('qm-fin-account-FAKE-ACCT-W1-corpus');
    await expect(accountCorpus).toContainText(fin.cash.accountCorpus);
    await expect(accountCorpus).toContainText('4,200,000.00');
    // The blend is stated in words, not left to the reader to infer from two numbers.
    await expect(page.getByTestId('qm-fin-accounts')).toContainText(fin.cash.blendedNote);

    /* ── 4 · ARREARS is a SENTENCE, never a zero ──────────────────────────────────────────── */
    const arrears = page.getByTestId('qm-fin-arrears-state');
    await expect(arrears).toHaveAttribute('data-state', 'NOT_MODELLED');
    await expect(arrears).toHaveText(fin.arrears.notModelled);
    // The one thing it must never be:
    await expect(arrears).not.toContainText('0.00');

    /* ── 5 · THE THREE UNBUILT REGIONS ARE DECLARED, not omitted ──────────────────────────── */
    await expect(page.getByTestId('qm-fin-owed-transactions')).toHaveText(fin.owed.transactions);
    await expect(page.getByTestId('qm-fin-owed-reconciliation')).toHaveText(
      fin.owed.reconciliation,
    );
    await expect(page.getByTestId('qm-fin-owed-statements')).toHaveText(fin.owed.statements);

    /* ── 6 · waqf-003 — the same wall AT SCALE, on the pinnable endowment ─────────────────── */
    await page.goto(`/${locale}/financials?waqf=waqf-003`);
    await expect(page.getByTestId('qm-fin-cash-corpus')).toContainText('20,000,000.00');
    await expect(page.getByTestId('qm-fin-receipts-capital')).toContainText('20,000,000.00');
    // Income and capital are DIFFERENT figures on the same screen — the wall, visible.
    await expect(page.getByTestId('qm-fin-receipts')).toContainText('1,800,000.00');

    /* ── 7 · waqf-004 — DIRECT UTILIZATION: the statement, NOT a zero and NOT §10's sentence ─ */
    await page.goto(`/${locale}/financials?waqf=waqf-004`);
    await expect(page.getByTestId('qm-financials')).toHaveAttribute('data-empty', 'DIRECT_USE');
    const emptySentence = page.getByTestId('qm-fin-empty-sentence');
    await expect(emptySentence).toHaveText(fin.empty.directUse);
    // §14 §5.1(3): the report STATES this rather than showing zeros. So neither a zero nor the
    // link-an-account instruction — which would tell this Nazir to perform an act that changes nothing.
    await expect(emptySentence).not.toHaveText(fin.empty.noTransactions);
    await expect(page.getByTestId('qm-fin-cash')).toHaveCount(0);

    /* ── 8 · waqf-005 — the INTAKE state: an IDENTICAL payload with a DIFFERENT sentence ───── */
    await page.goto(`/${locale}/financials?waqf=waqf-005`);
    await expect(page.getByTestId('qm-financials')).toHaveAttribute(
      'data-empty',
      'NO_TRANSACTIONS',
    );
    await expect(page.getByTestId('qm-fin-empty-sentence')).toHaveText(fin.empty.noTransactions);
    // The two endowments return the same all-zero figures; the screen must not say the same thing.
    await expect(page.getByTestId('qm-fin-empty-sentence')).not.toHaveText(fin.empty.directUse);

    /* ── 9 · waqf-007 — the healthy simple board ──────────────────────────────────────────── */
    await page.goto(`/${locale}/financials?waqf=waqf-007`);
    await expect(page.getByTestId('qm-financials')).toHaveAttribute('data-empty', 'none');
    await expect(page.getByTestId('qm-fin-cash')).toBeVisible();
    await expect(page.getByTestId('qm-fin-account-FAKE-ACCT-W7-corpus')).toContainText('0.00');

    /* ── 10 · NO FORMS anywhere (the E3 pin), and no raw i18n key on any of it ─────────────── */
    const screen = page.getByTestId('qm-financials');
    await expect(screen.locator('form')).toHaveCount(0);
    await expect(screen.locator('input, select, textarea, button[type="submit"]')).toHaveCount(0);
    expect((await screen.textContent()) ?? '', `raw key on /financials [${locale}]`).not.toMatch(
      RAW_KEY_PATTERN,
    );
  });
});
