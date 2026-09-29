import type { ReactNode } from 'react';

/**
 * Pass-through root layout.
 *
 * Every user-facing route lives under `app/[locale]/`, and `<html lang dir>` cannot be
 * decided before the locale is known — so `app/[locale]/layout.tsx` is the layout that
 * actually renders `<html>` and `<body>`. This file exists only so that routes outside the
 * locale segment (the better-auth handler at `/api/auth/**`, and Next's own error
 * boundaries) still have a root.
 *
 * Do not add markup here: anything rendered would sit outside `<body>` for locale routes.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
