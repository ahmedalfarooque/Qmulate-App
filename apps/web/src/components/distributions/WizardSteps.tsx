import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { cx, Surface } from '@qmulate/ui';

import { newRunPath, WIZARD_STEPS, WIZARD_STEP_KEY } from '@/lib/distributions/paths';

import type { WizardStep } from '@/lib/distributions/paths';
import type { RunPeriod } from '@/lib/distributions/types';

/**
 * The wizard's step strip — four server-rendered `<Link>`s, and not a widget.
 *
 * ── WHY LINKS ─────────────────────────────────────────────────────────────────────────────
 * `@qmulate/ui` has no `Stepper`, and this does not need one. Every panel the wizard shows is an `async`
 * SERVER component using `getTranslations` — the refusal, the diagnostic code, the vocabulary label, the
 * unverified marker, the dual date — and not one of them can render inside a `'use client'` tree. So the
 * step lives in the URL and moving between steps is a navigation. The state is shareable, the back button
 * works, and there is no client JavaScript anywhere in the money path.
 *
 * It copies `EndowmentHeader`'s tab strip exactly, including the accessibility contract: the active step
 * carries THREE non-shadow cues — the accent inline-start border, the accent text colour and
 * `aria-current="step"` — plus the inset well. Colour is never the only signal.
 *
 * ── A STEP WITH NO PERIOD IS INERT, NOT A DEAD LINK ───────────────────────────────────────
 * Until a period is chosen there is nothing to compute, so the three later steps render as
 * `<span aria-disabled>`s rather than links: they are skipped by tab order instead of sitting in it as
 * dead stops. That is the same rule the sidebar applies to an unbuilt destination — a nav item that
 * leads nowhere teaches the user the product is broken.
 *
 * Logical CSS only: `border-s-2`, `ps-`/`pe-`. The whole strip mirrors from `dir` on the root element.
 */

const STEP_BASE = [
  'flex min-h-tap items-center whitespace-nowrap',
  'rounded-control border-s-2 px-[var(--space-12)] py-[var(--space-8)]',
  'qm-label transition duration-fast focus-visible:shadow-focus',
].join(' ');

export async function WizardSteps({
  locale,
  waqfId,
  active,
  period,
}: {
  readonly locale: string;
  readonly waqfId: string;
  readonly active: WizardStep;
  /** `null` until a window is chosen; the later steps are then inert. */
  readonly period: RunPeriod | null;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });

  return (
    <nav aria-label={t('wizard.title')} data-testid="qm-wizard-steps">
      <Surface
        as="ol"
        variant="raised-sm"
        radius="card"
        className="flex gap-[var(--space-4)] overflow-x-auto p-[var(--space-8)]"
      >
        {WIZARD_STEPS.map((step: WizardStep) => {
          const isActive = step === active;
          const reachable = step === 'period' || period !== null;
          const label = t(`wizard.step${WIZARD_STEP_KEY[step]}`);

          if (!reachable) {
            return (
              <li key={step}>
                <span
                  aria-disabled="true"
                  data-state="planned"
                  data-step={step}
                  className={cx(STEP_BASE, 'border-transparent text-mist-2')}
                >
                  {label}
                </span>
              </li>
            );
          }

          return (
            <li key={step}>
              <Link
                href={newRunPath(locale, waqfId, { period, step })}
                aria-current={isActive ? 'step' : undefined}
                data-step={step}
                className={cx(
                  STEP_BASE,
                  isActive
                    ? 'border-blue bg-well text-blue-strong shadow-inset'
                    : 'border-transparent text-mist hover:text-ink active:shadow-inset',
                )}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </Surface>
    </nav>
  );
}
