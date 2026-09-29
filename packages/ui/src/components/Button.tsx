/**
 * Button — the signature press, with a mandatory non-shadow affordance cue.
 *
 * ── THE HARD RULE, ENCODED (DESIGN.md §0/§6/§11, WCAG 1.4.11) ─────────────────────────
 * A soft shadow may NEVER be the only thing that says "this is a control". Every variant
 * below therefore carries a >=3:1 cue that survives with shadows stripped (the flat report
 * theme, `prefers-contrast`, a low-vision user, print):
 *
 *   primary    → `--color-blue` FILL + `--color-blue-strong` border   (fill is the cue)
 *   secondary  → bone panel + `--color-edge` border                    (border is the cue)
 *   tertiary   → bone panel + `--color-edge` border, pill              (border is the cue)
 *   danger     → `--color-danger` FILL + border                        (fill is the cue)
 *   ghost      → `--color-blue-strong` label + border on hover/focus   (accent is the cue)
 *
 * The raised → inset press comes from `<Surface interactive>`, which is the only thing in
 * the system allowed to emit a `box-shadow`. This file writes no shadow class at all.
 *
 * Also enforced here: hit target >=44px (`min-h-tap`, plus `min-w-tap` when icon-only);
 * label >=14px semibold on the filled variants (large-text AA on the blue fill); focus is
 * a SOLID 2px ring from `--focus-ring`, never a glow; `disabled` is mirrored to
 * `aria-disabled` so the state is programmatic, not just visual.
 *
 * NO COPY LIVES HERE. Icon-only buttons must be given an `aria-label` by the caller,
 * translated through `@qmulate/i18n`.
 */

import * as React from 'react';

import { cx, Surface, type SurfaceRadius } from './Surface';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'ghost';

export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * Each entry pairs the resting look with its >=3:1 non-shadow cue. If you add a variant,
 * it must have one — a variant whose only affordance is the shadow is a defect.
 */
const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: cx(
    'bg-blue text-on-info border border-blue-strong',
    'hover:bg-blue-strong',
    'font-semibold',
  ),
  secondary: cx('bg-panel text-ink border border-edge', 'hover:bg-panel-tint'),
  tertiary: cx('bg-panel text-ink border border-edge', 'hover:bg-panel-tint'),
  danger: cx(
    'bg-danger text-on-danger border border-danger',
    'hover:bg-danger/90',
    'font-semibold',
  ),
  ghost: cx(
    'bg-transparent text-blue-strong border border-transparent',
    'hover:border-edge hover:bg-panel-tint',
    'font-medium',
  ),
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  // Padding varies; the 44px hit target does not (min-h-tap comes from Surface).
  sm: 'px-3 text-body-sm gap-2',
  md: 'px-4 text-body gap-2',
  lg: 'px-6 text-body gap-3',
};

export interface ButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'children'
> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square pill target. The caller MUST supply `aria-label` (translated). */
  iconOnly?: boolean;
  /** Stretch to the container's inline size. */
  block?: boolean;
  radius?: SurfaceRadius;
  className?: string;
  children?: React.ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  iconOnly = false,
  block = false,
  radius,
  type = 'button',
  disabled = false,
  className,
  children,
  ...rest
}: ButtonProps): React.JSX.Element {
  return (
    <Surface
      as="button"
      variant="raised-sm"
      radius={radius ?? (iconOnly ? 'pill' : 'control')}
      interactive
      type={type}
      disabled={disabled}
      // Mirrors the visual disabled state into the accessibility tree.
      aria-disabled={disabled || undefined}
      className={cx(
        'inline-flex items-center justify-center',
        'font-sans leading-none',
        VARIANT_CLASS[variant],
        iconOnly ? 'min-w-tap px-0' : SIZE_CLASS[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {children}
    </Surface>
  );
}
