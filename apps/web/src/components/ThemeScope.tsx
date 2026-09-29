import type { ReactNode } from 'react';

/**
 * The three themes share one set of token names, so a theme is switched by setting
 * `data-theme` on an ancestor — no re-render, no second stylesheet.
 *
 *   - `light`  — the ops default (bone canvas, raised surfaces). Declared on `:root`.
 *   - `dark`   — optional low-light theme. NEVER applied automatically from
 *                `prefers-color-scheme`; it is a deliberate user choice (DESIGN.md §2.3).
 *   - `report` — flat: shadows and blur stripped. Forced by CONTEXT, not by preference —
 *                printable statements, evidence packs, regulator exports, `@media print`.
 *                Wrap the preview, not the page: `<ThemeScope theme="report">` renders a
 *                flat statement inside the soft app.
 *
 * @example
 * <ThemeScope theme="report">
 *   <DistributionStatement …/>
 * </ThemeScope>
 */
export type QmulateTheme = 'light' | 'dark' | 'report';

export function ThemeScope({
  theme,
  className,
  children,
}: {
  theme: QmulateTheme;
  className?: string;
  children: ReactNode;
}) {
  // `light` is what `:root` already declares — emitting the attribute would add a dead
  // selector and invite someone to write `[data-theme="light"]` overrides that only fire
  // inside a scope.
  return (
    <div data-theme={theme === 'light' ? undefined : theme} className={className}>
      {children}
    </div>
  );
}
