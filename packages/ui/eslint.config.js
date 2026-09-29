/**
 * QMULATE — ESLint config for `@qmulate/ui`.
 *
 * ⚠ This file's ABSENCE was a real gap found by adversarial review. Without it, ESLint 9 walked
 * up to the root config, which spreads only the shared `base`. `designSystemRestrictions` — the
 * hand-rolled-`box-shadow` ban, the raw-hex ban, the physical-CSS ban (`pl-`/`pr-`/`ml-`/`mr-`/
 * `left-`/`right-`/`text-left`/`text-right`), the `h-screen` ban — is spread in only by
 * `@qmulate/config/eslint/react`. So the design-system rules were never enforced in the one
 * package that exists to implement the design system.
 */
export { default } from '@qmulate/config/eslint/react';
