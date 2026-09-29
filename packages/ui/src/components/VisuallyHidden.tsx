/**
 * VisuallyHidden — content for assistive technology only.
 *
 * The counterpart to every `aria-hidden` glyph in the system. QMULATE's design rules ban
 * colour-only and icon-only signalling: a ▲ delta, a status dot, a required asterisk or a
 * calendar marker must always be paired with a real text label. When that label would be
 * visually redundant, it goes here rather than being dropped.
 *
 * `focusable` keeps the element hidden until it receives focus — the pattern for a
 * skip-to-content link.
 */

import * as React from 'react';

import { cx } from './Surface';

export interface VisuallyHiddenProps {
  as?: 'span' | 'div' | 'a' | 'li';
  /** Reveal on focus, for skip links. */
  focusable?: boolean;
  className?: string;
  children?: React.ReactNode;
  href?: string;
  id?: string;
}

export function VisuallyHidden({
  as = 'span',
  focusable = false,
  className,
  children,
  ...rest
}: VisuallyHiddenProps): React.JSX.Element {
  const Component = as as React.ElementType;

  return (
    <Component
      className={cx(
        'sr-only',
        focusable &&
          // `start-4` is the logical `inset-inline-start` utility — `left-4`/`right-4` are banned.
          'focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-sticky focus:rounded-control focus:border focus:border-edge focus:bg-panel focus:px-4 focus:py-2 focus:text-ink',
        className,
      )}
      {...rest}
    >
      {children}
    </Component>
  );
}
