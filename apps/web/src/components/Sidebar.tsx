'use client';

import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';

import { useNavigation } from './NavigationProvider';
import { usePathname } from 'next/navigation';

/**
 * The primary navigation — the ten Phase-1 internal surfaces, in the order fixed by
 * 13-ux-designsystem-reference.md § "Primary navigation".
 *
 * `built: false` items are rendered but NOT linked. A nav item that 404s teaches the user
 * the product is broken; a visibly pending one teaches them it is unfinished. They are
 * inert `<span aria-disabled>`s, not disabled links, so they are skipped by tab order
 * rather than sitting in it as dead stops.
 *
 * The whole strip is mirrored in RTL by `dir` on the root element — there is not a single
 * physical direction utility in this file.
 */
/**
 * ⊕ EXPORTED for `test/nav-routes.test.ts` (S11, the `apps/*` gate stage). The paragraph above
 * states a rule — *an unbuilt item is rendered but NOT linked, because a nav item that 404s
 * teaches the user the product is broken* — and until that test existed **nothing enforced it**:
 * a recorded mutation flipping `built: true` without a route SURVIVED, because no test read this
 * list. Exporting a const to make a stated contract testable is the smallest honest change; the
 * alternative was leaving the invariant as prose.
 */
export const NAV_ITEMS = [
  { key: 'dashboard', segment: 'dashboard', built: true },
  // S4/E3: the endowment surfaces exist — record, trusteeship deed, classification, the founder's
  // conditions and reserved matters — so this destination is a real link now.
  { key: 'endowments', segment: 'endowments', built: true },
  // ⊕ S12-3b · UI intake (owner ruling "build ui intake"): a top-level entry, because a birth has
  // no endowment tab to live under. Drawn to every seat; the screen itself says who may register.
  { key: 'onboarding', segment: 'onboarding', built: true },
  // Migration 55: a cross-endowment register, composed from the seats the caller holds.
  { key: 'beneficiaries', segment: 'beneficiaries', built: true },
  // S7/E6: the distribution run lifecycle exists — the wizard (compute → review → submit), the run
  // record and the maker/checker panel — so this destination is a real link now.
  { key: 'distributions', segment: 'distributions', built: true },
  { key: 'compliance', segment: 'compliance', built: true },
  { key: 'calendar', segment: 'calendar', built: true },
  // ⊕ S11 · 2c (E10, owner ruling 2026-09-03 "i like b"): `/financials` EXISTS as its own route,
  // so this destination is a real link now — which is the ONLY thing this file's rule permits a
  // `built: true` to mean. ⚠ Nothing in the repo GUARDS that rule (no test reads NAV_ITEMS), so it
  // is a convention held by this comment; recorded as a finding rather than claimed as a control.
  { key: 'financials', segment: 'financials', built: true },
  { key: 'documents', segment: 'documents', built: true },
  // S7/E6: the Nazir's queue exists. ⚠ IT LISTS DISTRIBUTION RUNS ONLY — there is no `approval.list`
  // procedure in the kernel, so the queue is composed from `distribution.list` per endowment plus one
  // `approval.get` per run, and a pending RESERVED_MATTER or BANK_MOVEMENT does not appear in it. That
  // is a gap owed to the API layer, recorded here because this nav item is what promises the screen.
  { key: 'approvals', segment: 'approvals', built: true },
  { key: 'auditLog', segment: 'audit-log', built: true },
  // Migration 55: the organisation layer. Visible only with the organisation permission.
  { key: 'users', segment: 'users', built: true },
  { key: 'roles', segment: 'roles', built: true },
] as const;

const ITEM_BASE = [
  'flex min-h-tap items-center gap-[var(--space-8)] whitespace-nowrap',
  'rounded-control border-s-2 px-[var(--space-12)] py-[var(--space-8)]',
  'transition duration-fast',
].join(' ');

export function Sidebar() {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const pathname = usePathname();
  // Visibility comes from the server-computed section list (seats + organisation permissions).
  // Hiding an item is a courtesy, not a control: every page and procedure checks its own permission.
  const { sections } = useNavigation();
  const visible = new Set<string>(sections);

  return (
    <nav
      aria-label={tCommon('appName')}
      className="w-full shrink-0 md:w-[236px]"
      data-testid="qm-sidebar"
    >
      <ul className="flex gap-[var(--space-4)] overflow-x-auto rounded-card bg-panel p-[var(--space-8)] shadow-raised-md md:flex-col md:overflow-x-visible">
        {NAV_ITEMS.filter((item) => visible.has(item.key)).map((item) => {
          const href = `/${locale}/${item.segment}`;
          const isActive = item.built && (pathname === href || pathname.startsWith(`${href}/`));

          if (!item.built) {
            return (
              <li key={item.key}>
                <span
                  aria-disabled="true"
                  data-state="planned"
                  className={`${ITEM_BASE} qm-label border-transparent text-mist-2`}
                >
                  {t(item.key)}
                </span>
              </li>
            );
          }

          return (
            <li key={item.key}>
              <Link
                href={href}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  ITEM_BASE,
                  'qm-label focus-visible:shadow-focus',
                  isActive
                    ? // Active is carried by THREE non-shadow cues — the accent border, the
                      // accent text colour and aria-current — plus the inset well.
                      'border-blue bg-well text-blue-strong shadow-inset'
                    : 'border-transparent text-mist hover:text-ink active:shadow-inset',
                ].join(' ')}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
