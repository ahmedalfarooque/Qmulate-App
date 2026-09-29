/**
 * Card — the raised soft container, radius 20 (DESIGN.md §6/§7).
 *
 * Layout rules it enforces so soft surfaces stay legible:
 *   · >=16px internal padding — a neumorphic edge needs room for its highlight and shadow;
 *   · stacked cards lift the inner one with `--color-panel-tint`, NOT a heavier shadow
 *     (`tinted`), because stacked heavy shadows are banned;
 *   · dense content inside a card is FLAT (no per-cell neumorphism) — that is why there
 *     is no "raised row" affordance here.
 *
 * A card is a container, not a control. If it needs to be clickable, put a real `<Button>`
 * or link inside it — a clickable div has no keyboard semantics and no >=3:1 cue.
 */

import * as React from 'react';

import { cx, Surface } from './Surface';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'children'> {
  as?: 'div' | 'section' | 'article' | 'li' | 'aside';
  /** Off for a card that wraps a full-bleed table or media block. */
  padded?: boolean;
  /** Nested-card lift: `--color-panel-tint` instead of a deeper shadow. */
  tinted?: boolean;
  /** Hairline `--color-line` border. Useful where two cards sit edge to edge. */
  bordered?: boolean;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}

export function Card({
  as = 'div',
  padded = true,
  tinted = false,
  bordered = false,
  header,
  footer,
  className,
  children,
  ...rest
}: CardProps): React.JSX.Element {
  return (
    <Surface
      // Pinned to 'div' for typing so `rest` (HTMLAttributes) resolves against one
      // element rather than a union; the runtime element is whatever `as` says.
      as={as as 'div'}
      variant="raised-md"
      radius="card"
      className={cx(
        tinted && 'bg-panel-tint',
        bordered && 'border border-line',
        padded && 'p-5',
        className,
      )}
      {...rest}
    >
      {header ? (
        <div className={cx('flex items-start justify-between gap-4', padded ? 'mb-4' : 'p-5 pb-4')}>
          {header}
        </div>
      ) : null}
      {children}
      {footer ? (
        <div className={cx('border-t border-line', padded ? 'mt-5 pt-4' : 'mt-0 p-5 pt-4')}>
          {footer}
        </div>
      ) : null}
    </Surface>
  );
}
