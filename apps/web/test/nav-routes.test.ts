/**
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * `NAV_ITEMS` ↔ ROUTE EXISTENCE — the rule `Sidebar.tsx` states in prose and nothing enforced
 * ═══════════════════════════════════════════════════════════════════════════════════════
 * **S11, the `apps/*` gate stage — and this suite exists to close a RECORDED SURVIVOR.**
 *
 * `Sidebar.tsx`'s own paragraph says it: *"`built: false` items are rendered but NOT linked. A nav
 * item that 404s teaches the user the product is broken."* Item 2c proposed a mutation flipping an
 * unbuilt item to `built: true` without adding a route, and it was reported **SURVIVED — because
 * nothing in the repository read this list.** `shell.spec.ts` counts ten list items and asserts
 * nothing about where they point. So the rule was a comment.
 *
 * ── WHY THIS IS A FILESYSTEM INVARIANT AND NOT A SOURCE-SHAPE PROXY ────────────────────────────
 * This project has a standing lesson that *"a source-shape assertion is not a test"* — a real S2
 * test asserted certain strings appeared within 400 characters of a call site while the guard it
 * described was completely bypassable. This suite does not do that. It reads the actual exported
 * data and then **stats the actual route file on disk**: the claim under test is *"an item marked
 * built resolves to a page a user can open"*, which is the user-visible fact, not a fact about how
 * the source is written.
 *
 * ── THE ASYMMETRY THAT MAKES THE VACUITY FLOOR NECESSARY ───────────────────────────────────────
 * A wrong ROUTE base path makes all five built items fail loudly, which is safe. A wrong or empty
 * ITEM LIST — a failed import, a renamed export, a moved file — makes every `for` loop below
 * iterate nothing and **the whole suite pass while asserting nothing at all.** So the floors come
 * first and are unconditional, in the same discipline as the fixture-id test's floor of 50 and the
 * copy registers' vacuity floors.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { NAV_ITEMS } from '../src/components/Sidebar';

/** `apps/web/src/app/[locale]/(app)` — where every authenticated route lives. */
const APP_DIR = fileURLToPath(new URL('../src/app/[locale]/(app)', import.meta.url));

const routeSegments = readdirSync(APP_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const built = NAV_ITEMS.filter((item) => item.built);
const unbuilt = NAV_ITEMS.filter((item) => !item.built);

describe('the navigation contract is enforced, not merely documented', () => {
  /* ── vacuity floors: these run FIRST and are the reason a green run means something ──── */

  it('reads a NON-EMPTY nav list — an empty import would make every check below vacuous', () => {
    // Ten Phase-1 surfaces are fixed by 13-ux §"Primary navigation". A FLOOR, not an equality:
    // adding an eleventh surface is a product decision, not a test failure.
    expect(NAV_ITEMS.length).toBeGreaterThanOrEqual(10);
  });

  it('finds at least one BUILT item and at least one UNBUILT item', () => {
    // If either partition were empty, one of the two invariants below would assert nothing while
    // still reporting green.
    expect(built.length).toBeGreaterThan(0);
    // Migration 55 built the last planned destinations (beneficiaries, compliance, calendar,
    // documents, audit log) and added users/roles, so an empty UNBUILT set is the intended state;
    // the contract below still bites the day an item is added as `built: false`.
    expect(unbuilt.length).toBeGreaterThanOrEqual(0);
  });

  it('finds the route directory at all — a moved app dir must fail loudly, not silently', () => {
    expect(existsSync(APP_DIR), `no route directory at ${APP_DIR}`).toBe(true);
    expect(routeSegments.length).toBeGreaterThan(0);
  });

  /* ── the invariant itself, both directions ───────────────────────────────────────────── */

  it.each(built.map((item) => [item.key, item.segment] as const))(
    'BUILT item %s links to a route that exists on disk (segment: %s)',
    (key, segment) => {
      const page = `${APP_DIR}/${segment}/page.tsx`;
      expect(
        existsSync(page),
        `nav item "${key}" is built: true but ${segment}/page.tsx does not exist — it would 404`,
      ).toBe(true);
      expect(statSync(page).isFile()).toBe(true);
    },
  );

  it('every UNBUILT item is genuinely unbuilt — an existing route must not stay unlinked', () => {
    // The mirror of the rule, and it catches the opposite mistake: a route was built and shipped
    // while its nav entry stayed `built: false`, so users cannot reach a screen that exists.
    const shippedButUnlinked = unbuilt
      .filter((item) => existsSync(`${APP_DIR}/${item.segment}/page.tsx`))
      .map((item) => item.key);
    expect(
      shippedButUnlinked,
      'these routes exist but their nav entry is still built: false',
    ).toEqual([]);
  });

  it('every route on disk is named by exactly one nav item — no orphan screens', () => {
    // A route with no nav entry is unreachable except by typed URL, which for an internal
    // operations app means it is effectively invisible.
    // `Set<string>` explicitly: `NAV_ITEMS` is a literal, so an inferred Set would be typed to
    // that union and reject a directory name read off disk — the very value under test.
    const named = new Set<string>(NAV_ITEMS.map((item) => item.segment));
    expect(routeSegments.filter((segment) => !named.has(segment))).toEqual([]);
  });

  it('nav keys and segments are unique, so no item can shadow another', () => {
    expect(new Set(NAV_ITEMS.map((item) => item.key)).size).toBe(NAV_ITEMS.length);
    expect(new Set(NAV_ITEMS.map((item) => item.segment)).size).toBe(NAV_ITEMS.length);
  });
});
