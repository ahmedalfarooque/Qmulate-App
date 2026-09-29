import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { evaluateAuthGate } from '@qmulate/auth';

import { AppShell } from '@/components/AppShell';
import { EndowmentHeader } from '@/components/endowments/EndowmentHeader';
import { Refusal } from '@/components/endowments/Refusal';
import { loadEndowment, loadWaqifName } from '@/lib/endowments/loaders';

import type { EndowmentTab } from '@/lib/endowments/paths';
import type { EndowmentDetail, Loaded, PartyName } from '@/lib/endowments/types';
import type { ReactNode } from 'react';

/**
 * The shared shell for every endowment sub-screen, and the gate that guards all five.
 *
 * ⚠ NOT A ROUTE. Only `page`, `layout`, `route`, `loading`, `error`, `not-found`, `template` and
 * `default` are reserved filenames in the App Router, so this module is co-located with the routes
 * it serves and reachable by none of them.
 *
 * ── WHY THE GATE LIVES HERE AND NOT IN `src/components/` ──────────────────────────────────
 * `evaluateAuthGate` comes from `@qmulate/auth`, the SERVER entry, which pulls the Prisma client and
 * the server env schema. `apps/web/eslint.config.js` bans that import from `src/components/**` and
 * `src/lib/**` precisely so it cannot be dragged into a client bundle — so the gate belongs under
 * `src/app/**`, where this file is. That is the boundary working, not an inconvenience.
 *
 * ── THE GATE IS REPEATED PER PAGE ON PURPOSE ──────────────────────────────────────────────
 * `(app)/layout.tsx` runs the same two redirects. A layout alone is not a gate: Next.js does not
 * re-run it on a client-side navigation inside the same segment. Every endowment page therefore
 * calls `endowmentScreenContext()` before it reads anything, and the TOTP enrolment gate is
 * UNIVERSAL — every authenticated account is refused until enrolled, role or no role.
 */

export interface EndowmentScreenContext {
  readonly endowment: Loaded<EndowmentDetail>;
  /** `null` when the founder is out of the caller's scope — non-disclosure, not an error. */
  readonly waqifName: PartyName | null;
}

/**
 * Gate, then read the endowment and its founder's name.
 *
 * Both reads go through the caller's own scoped client, so a caller with no grant on this endowment
 * gets a refusal that renders as the non-disclosure sentence — never as `FORBIDDEN`, and never as an
 * empty record, which would be a claim about the endowment rather than about the read.
 */
export async function endowmentScreenContext(
  locale: string,
  waqfId: string,
): Promise<EndowmentScreenContext> {
  const gate = await evaluateAuthGate(await headers());
  if (gate.status === 'unauthenticated') redirect(`/${locale}/sign-in`);
  if (gate.status === 'totp-enrolment-required') redirect(`/${locale}/two-factor`);

  const endowment = await loadEndowment(locale, waqfId);
  if (endowment.status !== 'ok') return { endowment, waqifName: null };

  const waqif = await loadWaqifName(locale, endowment.value.waqifId);
  return { endowment, waqifName: waqif.status === 'ok' ? waqif.value : null };
}

/**
 * The name in the page's language, falling back to Arabic.
 *
 * ⚠ THE FALLBACK DIRECTION IS ARABIC, NOT A PLACEHOLDER. `nameEn` is nullable in the schema and
 * Arabic is the authoritative language (NFR-01), so an Arabic-only party is a legitimate record —
 * showing "Not recorded" for a name the database holds would be a lie about the record.
 */
export function partyName(locale: string, party: PartyName | null): string | null {
  if (party === null) return null;
  return locale === 'ar' ? party.nameAr : (party.nameEn ?? party.nameAr);
}

/**
 * The chrome: app shell, the endowment's own header and tab strip, then the tab's content.
 *
 * When the endowment itself could not be read there is no header to draw — a certificate number and
 * a classification would be exactly the facts being withheld — so the screen renders the refusal
 * alone.
 */
export async function EndowmentScreen({
  locale,
  waqfId,
  active,
  context,
  children,
}: {
  readonly locale: string;
  readonly waqfId: string;
  readonly active: EndowmentTab;
  readonly context: EndowmentScreenContext;
  readonly children: ReactNode;
}) {
  const { endowment, waqifName } = context;

  if (endowment.status !== 'ok') {
    return (
      <AppShell>
        <Refusal locale={locale} messageKey={endowment.messageKey} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-[var(--space-24)]">
        <EndowmentHeader
          locale={locale}
          waqfId={waqfId}
          active={active}
          certificateNumber={endowment.value.certificateNumber}
          classification={endowment.value.classification}
          waqifName={partyName(locale, waqifName)}
        />
        {children}
      </div>
    </AppShell>
  );
}
