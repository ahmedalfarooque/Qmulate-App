/**
 * Surface — the ONLY component in QMULATE permitted to emit a `box-shadow`.
 *
 * Every other component composes depth from this one (and from `<Well>`, which is a thin
 * inset preset over it). That single-source rule is what makes the neumorphic system
 * theme-swappable: in the flat report/print theme the `--nu-*` tokens resolve to `none`,
 * so every surface flattens with no component change.
 *
 * THE ONE HARD RULE (DESIGN.md §0, §11): **neumorphism carries the feeling, never the
 * information.** A shadow may never be the only signal for state, affordance, status or
 * grouping. `interactive` therefore only supplies the *press* (raised → inset); the
 * caller must still give the control a >=3:1 non-shadow cue — an `--edge` border, a fill,
 * or the accent — plus the correct ARIA state. `<Button>` shows the pattern.
 */

import * as React from 'react';

/** Join class names, dropping falsy entries. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export type SurfaceVariant = 'raised-sm' | 'raised-md' | 'inset' | 'flat' | 'glass';

export type SurfaceRadius = 'none' | 'control' | 'media' | 'card' | 'hero' | 'pill';

const VARIANT_CLASS: Record<SurfaceVariant, string> = {
  // Resting state for interactive controls and small tiles.
  'raised-sm': 'bg-panel shadow-raised-sm',
  // Cards and KPI tiles.
  'raised-md': 'bg-panel shadow-raised-md',
  // Pressed-in wells: inputs, LCD readouts, active nav items, selected segments.
  inset: 'bg-well shadow-inset',
  // Dense content INSIDE a raised container — never per-cell neumorphism.
  flat: 'bg-panel shadow-flat',
  /**
   * Overlays only: the sticky topbar, modals, drawers, popovers, toasts. Glass is the
   * only layer allowed to float over content. The blur, the translucency and the solid
   * fallback (no `backdrop-filter`, or `prefers-reduced-transparency`) all come from the
   * `--glass-*` tokens, so this never needs an `@supports` check at the component level.
   */
  glass:
    'bg-[var(--glass-fill)] [backdrop-filter:var(--glass-blur)] border border-[color:var(--glass-border)] shadow-raised-sm',
};

const RADIUS_CLASS: Record<SurfaceRadius, string> = {
  none: '',
  control: 'rounded-control',
  media: 'rounded-media',
  card: 'rounded-card',
  hero: 'rounded-hero',
  pill: 'rounded-pill',
};

/**
 * The signature press. Also carries the disabled treatment so no downstream component
 * ever writes a shadow class of its own.
 *
 * Note: Tailwind orders `active:` after `focus-visible:`, so during a keypress the inset
 * state momentarily wins over the focus ring; the ring returns on release. Accepted.
 */
const INTERACTIVE_CLASS = cx(
  'cursor-pointer select-none',
  'min-h-tap',
  'transition-shadow duration-fast ease',
  'hover:shadow-raised-md active:shadow-inset',
  'focus-visible:outline-none focus-visible:shadow-focus',
  'motion-safe:active:translate-y-px',
  'disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-flat',
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-60 aria-disabled:shadow-flat',
);

type SurfaceOwnProps = {
  variant?: SurfaceVariant;
  radius?: SurfaceRadius;
  /** Adds the raised → inset press, focus ring and disabled treatment. */
  interactive?: boolean;
  className?: string;
  children?: React.ReactNode;
};

export type SurfaceProps<T extends React.ElementType = 'div'> = SurfaceOwnProps & {
  as?: T;
} & Omit<React.ComponentPropsWithoutRef<T>, keyof SurfaceOwnProps | 'as'>;

export function Surface<T extends React.ElementType = 'div'>({
  as,
  variant = 'raised-sm',
  radius = 'card',
  interactive = false,
  className,
  children,
  ...rest
}: SurfaceProps<T>): React.JSX.Element {
  const Component = (as ?? 'div') as React.ElementType;

  return (
    <Component
      className={cx(
        VARIANT_CLASS[variant],
        RADIUS_CLASS[radius],
        interactive && INTERACTIVE_CLASS,
        className,
      )}
      {...(rest as object)}
    >
      {children}
    </Component>
  );
}
