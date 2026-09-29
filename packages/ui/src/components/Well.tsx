/**
 * Well — the inset field frame. A thin preset over `<Surface variant="inset">`.
 *
 * Two jobs (DESIGN.md §6):
 *   · form fields — inputs, textareas, selects, dropzones look pressed-in;
 *   · "LCD" numeric readouts — a KPI or SAR figure in Geist Mono tabular inside an
 *     inset well, which is how every large number in the product is displayed.
 *
 * The inset shadow is decorative. The >=3:1 affordance boundary comes from the
 * `--color-edge` border, which is why `bordered` defaults to `true` — turn it off only
 * for a purely presentational readout that is not an input.
 */

import * as React from 'react';

import { cx, Surface, type SurfaceRadius } from './Surface';

export interface WellProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  as?: 'div' | 'span' | 'output' | 'dd' | 'li';
  radius?: SurfaceRadius;
  /** The >=3:1 non-shadow boundary cue (WCAG 1.4.11). Keep on for anything interactive. */
  bordered?: boolean;
  /** Comfortable internal padding. Off for tightly packed table cells. */
  padded?: boolean;
  /** `true` for an error state: swaps the edge for the danger colour. Pair with text. */
  invalid?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function Well({
  as = 'div',
  radius = 'control',
  bordered = true,
  padded = true,
  invalid = false,
  className,
  children,
  ...rest
}: WellProps): React.JSX.Element {
  return (
    <Surface
      // Pinned to 'div' for typing so `rest` (HTMLAttributes) resolves against one
      // element rather than a union; the runtime element is whatever `as` says.
      as={as as 'div'}
      variant="inset"
      radius={radius}
      className={cx(
        padded && 'px-4 py-3',
        // Borders, never Tailwind `ring-*` — `ring` compiles to box-shadow and only
        // <Surface> may emit one.
        bordered && 'border',
        bordered && (invalid ? 'border-danger' : 'border-edge/40'),
        className,
      )}
      {...rest}
    >
      {children}
    </Surface>
  );
}
