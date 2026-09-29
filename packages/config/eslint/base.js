/**
 * QMULATE — shared ESLint 9 flat base config.
 *
 * Usage in a package's own `eslint.config.js`:
 *
 *   import base from '@qmulate/config/eslint';
 *   export default base;
 *
 * or, to layer on package-specific rules:
 *
 *   import base from '@qmulate/config/eslint';
 *   export default [...base, { rules: { ... } }];
 *
 * This config is intentionally NOT type-aware (`recommendedTypeChecked` needs a
 * `parserOptions.project` per package and fails on any file outside a tsconfig,
 * which makes lint brittle in CI). Type-level invariants belong in `typecheck`.
 *
 * The `no-restricted-*` blocks below encode the sprint's hard bans. Each one
 * carries the reason in its message, because a linter that says "not allowed"
 * without saying why gets disabled.
 */

import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/* ───────────────────────────────────────────────────────────────────────────
 * Ban 1 · Physical CSS direction (RTL correctness)
 *
 * The product is Arabic-first. Every layout rule must be LOGICAL so a single
 * stylesheet serves both directions: `ps-/pe-`, `ms-/me-`, `start-/end-`,
 * `text-start/text-end`, and the `rtl:`/`ltr:` variants. A single `pl-4` is an
 * Arabic layout bug that no amount of QA reliably catches.
 *
 * `h-screen` is banned alongside them: mobile browser chrome makes `100vh`
 * wrong; use `100dvh`.
 * ─────────────────────────────────────────────────────────────────────────── */
const PHYSICAL_DIRECTION_CLASS_RE =
  '/(^|[\\s"\'`])-?(pl|pr|ml|mr|left|right|border-l|border-r|rounded-l|rounded-r|inset-l|inset-r)-|(^|[\\s"\'`])(text-left|text-right|float-left|float-right|border-l|border-r|rounded-l|rounded-r|h-screen)([\\s"\'`]|$)/';

const PHYSICAL_DIRECTION_MESSAGE =
  'RTL: physical direction utilities are banned (AC-E0-3). Use logical equivalents — ' +
  'ps-/pe-, ms-/me-, start-/end-, border-s/border-e, rounded-s/rounded-e, text-start/text-end, ' +
  'and the rtl:/ltr: variants. (`h-screen` is banned too — use min-h-[100dvh].)';

const PHYSICAL_STYLE_PROP_RE =
  '/^(marginLeft|marginRight|paddingLeft|paddingRight|borderLeft|borderRight|borderLeftWidth|borderRightWidth|borderLeftColor|borderRightColor|left|right|textAlign)$/';

/* ───────────────────────────────────────────────────────────────────────────
 * Ban 2 · Money must never be a JS `number`
 *
 * Money is `Decimal @db.Decimal(18,2)` in Prisma and `decimal.js` in TS. IEEE-754
 * silently loses halalas, and a distribution that is off by a halala is a
 * defective ghallah payout, not a rounding nit. There is no type-aware rule that
 * catches this without `parserOptions.project`, so this is a deliberately
 * best-effort NAME-BASED heuristic: it fires on identifiers/properties that read
 * like money. False positives are cheap (rename or add an eslint-disable with a
 * reason); a missed float is not.
 * ─────────────────────────────────────────────────────────────────────────── */
const MONEY_NAME_RE =
  '/([Ss]ar|[Aa]mount|[Aa]mounts|[Bb]alance|[Tt]otal|[Ss]ubtotal|[Nn]etIncome|[Gg]hallah|[Pp]rice|[Ff]ee|[Ff]ees|[Ss]hare|[Rr]evenue|[Ee]xpense|[Pp]ayout)$/';

const MONEY_COERCION_MESSAGE =
  'Money must never pass through parseFloat/parseInt/Number — IEEE-754 loses halalas. ' +
  'Use decimal.js (`new Decimal(value)`) and Prisma `Decimal @db.Decimal(18,2)`. ' +
  'If this identifier is genuinely not a monetary value, rename it or disable this rule with a reason.';

const MONEY_FORMAT_MESSAGE =
  'Do not format money with Number.prototype.toFixed — it rounds a float that has already lost ' +
  'precision. Use `formatCurrency` from @qmulate/i18n, which accepts `Decimal | string` and ' +
  'never a JS number, and renders SAR in Latin digits in both locales.';

/** Base restricted-syntax set applied to every package. */
const restrictedSyntax = [
  // ── RTL: className string literals ──
  {
    selector: `JSXAttribute[name.name='className'] Literal[value=${PHYSICAL_DIRECTION_CLASS_RE}]`,
    message: PHYSICAL_DIRECTION_MESSAGE,
  },
  {
    selector: `JSXAttribute[name.name='className'] TemplateElement[value.raw=${PHYSICAL_DIRECTION_CLASS_RE}]`,
    message: PHYSICAL_DIRECTION_MESSAGE,
  },
  // ── RTL: `class` (plain HTML in .html-ish JSX / string builders) ──
  {
    selector: `JSXAttribute[name.name='class'] Literal[value=${PHYSICAL_DIRECTION_CLASS_RE}]`,
    message: PHYSICAL_DIRECTION_MESSAGE,
  },
  // ── RTL: inline style objects ──
  {
    selector: `JSXAttribute[name.name='style'] Property[key.name=${PHYSICAL_STYLE_PROP_RE}]`,
    message:
      'RTL: physical CSS properties are banned in inline styles. Use the logical properties — ' +
      'marginInlineStart/End, paddingInlineStart/End, borderInlineStart/End, insetInlineStart/End, ' +
      "and textAlign: 'start' | 'end'.",
  },
  // ── Money: parseFloat/parseInt/Number on a money-shaped identifier ──
  {
    selector: `CallExpression[callee.name=/^(parseFloat|parseInt|Number)$/] > Identifier[name=${MONEY_NAME_RE}]`,
    message: MONEY_COERCION_MESSAGE,
  },
  {
    selector: `CallExpression[callee.name=/^(parseFloat|parseInt|Number)$/] > MemberExpression[property.name=${MONEY_NAME_RE}]`,
    message: MONEY_COERCION_MESSAGE,
  },
  {
    selector: `CallExpression[callee.object.name='Number'][callee.property.name=/^(parseFloat|parseInt)$/] > Identifier[name=${MONEY_NAME_RE}]`,
    message: MONEY_COERCION_MESSAGE,
  },
  {
    selector: `CallExpression[callee.object.name='Number'][callee.property.name=/^(parseFloat|parseInt)$/] > MemberExpression[property.name=${MONEY_NAME_RE}]`,
    message: MONEY_COERCION_MESSAGE,
  },
  // ── Money: unary + coercion, e.g. `+row.totalAmount` ──
  {
    selector: `UnaryExpression[operator='+'] > Identifier[name=${MONEY_NAME_RE}]`,
    message: MONEY_COERCION_MESSAGE,
  },
  {
    selector: `UnaryExpression[operator='+'] > MemberExpression[property.name=${MONEY_NAME_RE}]`,
    message: MONEY_COERCION_MESSAGE,
  },
  // ── Money: `.toFixed()` is display rounding on a float ──
  {
    selector: `CallExpression[callee.property.name='toFixed'][callee.object.property.name=${MONEY_NAME_RE}]`,
    message: MONEY_FORMAT_MESSAGE,
  },
  {
    selector: `CallExpression[callee.property.name='toFixed'][callee.object.name=${MONEY_NAME_RE}]`,
    message: MONEY_FORMAT_MESSAGE,
  },
];

/* ───────────────────────────────────────────────────────────────────────────
 * Ban 3 · `@prisma/client` outside packages/database
 *
 * The generated client is re-exported by `@qmulate/database`. Importing it
 * directly bypasses the Prisma client extensions that enforce the audit spine,
 * row scoping and field encryption — i.e. it bypasses the guardrails.
 *
 * `packages/database` is exempt: it appends `prismaClientAllowed` to its config.
 * ─────────────────────────────────────────────────────────────────────────── */
export const restrictedImports = {
  patterns: [
    {
      group: ['@prisma/client', '@prisma/client/*', '**/generated/client', '**/generated/client/*'],
      message:
        'Import the client from `@qmulate/database`, not `@prisma/client`. The direct import ' +
        'skips the audit / scoping / field-encryption client extensions. ' +
        '(packages/database itself is exempt — see `prismaClientAllowed`.)',
    },
    {
      group: ['inter', '@fontsource/inter', '@fontsource-variable/inter', 'next/font/google'],
      message:
        'Inter is banned by the brand (DESIGN.md §3). The typefaces are Outfit / Geist Mono / ' +
        'IBM Plex Sans Arabic, bound to --font-sans / --font-mono / --font-ar in @qmulate/ui.',
    },
  ],
};

/**
 * Spread this into `packages/database`'s own config to re-allow the direct
 * `@prisma/client` import (it is the package that owns the client).
 *
 *   import base, { prismaClientAllowed } from '@qmulate/config/eslint';
 *   export default [...base, ...prismaClientAllowed];
 */
export const prismaClientAllowed = [
  {
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];

/* ───────────────────────────────────────────────────────────────────────────
 * Ban 4 · `packages/domain` is PURE — no internal package, no I/O, no ambient
 *
 * `@qmulate/domain` holds the engines: money, distribution, compliance
 * deadlines, business days / Umm al-Qura, the access algebra, the Setting
 * vocabulary. Their whole value is that they can be property-tested with
 * fast-check in milliseconds — no database, no session, no clock, no network —
 * and that only holds while the package imports nothing internal and does no
 * I/O. The dependency direction is ONE-WAY: `database`, `api`, `jobs`, `worker`
 * and the apps import `@qmulate/domain`; `domain` imports none of them.
 *
 * ⚠ Until this block existed the constraint was SOCIAL ONLY. The package's own
 * description claims it "imports nothing internal and performs no I/O", but the
 * sole enforcement was that `packages/domain/package.json` happens to declare no
 * `@qmulate/*` dependency — so adding one would have lint-clean succeeded, in
 * the exact epic (E2) that roughly triples the package's size. Verified before
 * writing this: a file in `packages/domain/src` importing `@qmulate/database`
 * exited 0.
 *
 * TEST files inside the package get exactly ONE relaxation: `node:fs` stays
 * legal. The standing discipline is that where a rule is stated twice, one side
 * must READ the other at runtime (as `packages/auth/test/roles.test.ts` parses
 * `enum Role` out of `schema.prisma` as text). Reading another package's file as
 * TEXT does not couple the engines to it. IMPORTING it does, and stays banned in
 * tests too — a domain unit suite that pulls in `@qmulate/database` drags the
 * Prisma client into a run that is supposed to need no database at all.
 *
 * These globs are relative to the ESLint base path, which for `packages/domain`
 * is the repo root (the package has no `eslint.config.js`, so ESLint 9 walks up
 * to the root one). If a per-package config is ever added there, this block
 * stops matching — which is why CI's "lint boundary actually bites" step plants
 * a probe file and requires ESLint to reject it. That step is the test for this
 * rule; do not delete one without the other.
 * ─────────────────────────────────────────────────────────────────────────── */
const DOMAIN_SOURCE_GLOBS = ['**/packages/domain/**/*.{ts,tsx,mts,cts,js,mjs,cjs}'];

const DOMAIN_TEST_GLOBS = [
  '**/packages/domain/**/__tests__/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
  '**/packages/domain/**/*.{test,spec}.{ts,tsx,mts,cts}',
];

const DOMAIN_INTERNAL_IMPORT_MESSAGE =
  'packages/domain is PURE and must not import another workspace package. The dependency ' +
  'direction is one-way: database / api / jobs / apps import @qmulate/domain, never the reverse, ' +
  'because the engines are property-tested with no database, no session and no clock. Pass the ' +
  'data in as a plain argument instead (a calendar object, a resolved Setting envelope, a role ' +
  "preset). To compare the engine against another package at TEST time, read that package's file " +
  'as TEXT with node:fs, the way packages/auth/test/roles.test.ts parses schema.prisma.';

const DOMAIN_IO_MESSAGE =
  'packages/domain performs NO I/O — no filesystem, no network, no child processes, no timers. An ' +
  'engine that reads ambient state is neither deterministic nor property-testable, and a statutory ' +
  'deadline computed from it is not reproducible in an audit. Take the data as an argument and let ' +
  'the caller (packages/database, packages/api, the worker) do the I/O. node:fs is permitted in ' +
  "this package's TEST files only, for reading another package's source as text.";

const DOMAIN_AMBIENT_MESSAGE =
  'packages/domain must not read `process` (env, argv, cwd, hrtime). Configuration reaches the ' +
  'engines as an argument, and every regulatory figure — the 30/15/10 business-day deadlines, the ' +
  '3-month post-FYE window, the fee percentages, the SAR 200M/50M bands — comes from a `Setting` ' +
  'resolved by the caller, never from the environment and never hardcoded (all of them are ' +
  'UNVERIFIED against primary Saudi law and must stay reconfigurable).';

/** `@qmulate/*` in any spelling. Banned in domain sources AND domain tests. */
const domainInternalImportPatterns = [
  {
    group: ['@qmulate/*', '@qmulate/*/*', '@qmulate/*/**'],
    message: DOMAIN_INTERNAL_IMPORT_MESSAGE,
  },
];

/** Node's I/O surface. Banned in domain sources; `node:fs` is re-allowed in domain tests. */
const domainIoImportPatterns = [
  {
    group: [
      'fs',
      'node:fs',
      'fs/*',
      'node:fs/*',
      'child_process',
      'node:child_process',
      'net',
      'node:net',
      'tls',
      'node:tls',
      'http',
      'node:http',
      'https',
      'node:https',
      'http2',
      'node:http2',
      'dgram',
      'node:dgram',
      'dns',
      'node:dns',
      'dns/*',
      'node:dns/*',
      'cluster',
      'node:cluster',
      'worker_threads',
      'node:worker_threads',
      'readline',
      'node:readline',
      'timers',
      'node:timers',
      'timers/*',
      'node:timers/*',
    ],
    message: DOMAIN_IO_MESSAGE,
  },
];

/* ───────────────────────────────────────────────────────────────────────────
 * Ban 5 · THE RUNTIME APPS MAY NOT BUILD A FORCE-FILTER BYPASS
 *
 * `makeSystemContext()` returns a context with `bypass: 'system-job'` UNLESS the
 * caller explicitly passes `bypass: null` — the default is decided by a ternary
 * on `=== undefined`, so forgetting the argument grants the bypass rather than
 * withholding it. A bypassed context skips the scoping extension's guards: not
 * only row visibility but the write-authorization plane, including the
 * permission check that is the whole substance of a least-privilege seat.
 *
 * ⚠ AND IT IS REACHABLE. `makeSystemContext` is exported from
 * `@qmulate/database`'s public barrel with no environment guard in its body, so
 * any package can import it today. The only control that existed was a SOURCE
 * SCAN over `packages/api/src` (`procedure-ladder.test.ts`, MP-22) — recursive
 * over that tree and nowhere else. `apps/worker` has no test runner at all, so
 * it had no equivalent, and it is precisely where E9's scheduled evaluator and
 * its declared service seat are going to live: a background process, running
 * unattended, with nobody reading the diff at 06:00.
 *
 * The seat belongs INSIDE the access matrix — that is the owner's ruling and it
 * is also `assertBypassNotUser`'s own reasoning ("it is an authenticated caller
 * … 'the integration needs to see everything' is exactly the argument that would
 * make the matrix decorative"). A worker that reached for a bypass would not be
 * bending a convention; it would be deleting the control the seat exists to
 * operate under.
 *
 * ⚠ Like Ban 4, this is glob-scoped from the shared config, so an app that gains
 * its own `eslint.config.js` — or any later config that re-states
 * `no-restricted-imports` / `no-restricted-syntax` for the same files — silently
 * stops being covered. ESLint REPLACES a rule's options, it does not merge them.
 * That is why CI plants a probe in each app and requires ESLint to reject it for
 * the right reason. Do not delete one without the other.
 * ─────────────────────────────────────────────────────────────────────────── */
/**
 * ⚠ THE LIST IS THE SCOPE — read it, do not trust the constant's name.
 *
 * TWO apps, and each absence below is deliberate rather than an oversight:
 *
 *  · `apps/mobile` is EXCLUDED. It is the Phase-2 client portal and reaches the database only
 *    through the API over HTTP — it has no `@qmulate/database` dependency to bypass. ⚠ If that
 *    ever changes, it belongs here AND needs its own CI probe, because it will have its own
 *    eslint config by then (the `apps/web` lesson: a shared glob does NOT reach an app that has
 *    one).
 *  · `packages/jobs` is EXCLUDED, and that is a DESIGN COMMITMENT rather than a gap (S10-3a).
 *    Its own header declares zero internal dependencies, and `src/queue.ts`'s `JobActor` is
 *    deliberately "structurally the subset of `RequestContext` a job needs, spelled here rather
 *    than imported" for exactly that reason. The service seat's context is therefore built in
 *    `apps/worker` — which IS covered — and the transport stays context-agnostic. ⚠ If a future
 *    adapter genuinely needs to construct a `RequestContext`, this list grows to include
 *    `packages/jobs` and a probe goes there too; until then, growing it would widen the ban past
 *    where anything constructs a context, which makes the scope less honest, not more.
 */
const RUNTIME_APP_GLOBS = [
  '**/apps/worker/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
  '**/apps/web/**/*.{ts,tsx,mts,cts,js,mjs,cjs}',
];

const RUNTIME_BYPASS_IMPORT_MESSAGE =
  'The runtime apps may not import the force-filter bypass. `makeSystemContext()` defaults to ' +
  "`bypass: 'system-job'` unless the caller passes `bypass: null` explicitly, and a bypassed " +
  'context skips the scoping extension’s write-authorization guards as well as its row ' +
  'filter — including the permission check that is the entire substance of a least-privilege ' +
  'seat. A scheduled job belongs INSIDE the access matrix, holding a real WaqfAccessGrant on each ' +
  'endowment it touches, exactly like a human seat: build its context from that grant. If you are ' +
  'here because a query returned nothing, the answer is a grant, never a bypass.';

export const RUNTIME_BYPASS_ASSIGN_MESSAGE =
  'The runtime apps may not ASSIGN `bypass`. Constructing the property by hand is the same ' +
  'escalation as importing `makeSystemContext` — `createPrismaClient` only refuses the ' +
  'USER combination, so a SYSTEM actor with a hand-written bypass is accepted and unfiltered. ' +
  'Resolve the caller’s grants and pass `authorizedWaqfIds`; a job that cannot see a row it ' +
  'needs is a job whose seat is missing a grant.';

/**
 * The bypass-conferring exports of `@qmulate/database`, in any spelling of the specifier.
 *
 * EXPORTED because `apps/web` ships its own `eslint.config.js`, which makes the repo-root
 * config's base directory `apps/web` — so the path-scoped glob below never matches there
 * and the app has to apply this itself. Measured, not assumed: probes in `apps/web/src/app`
 * were clean until that app's own config carried these. Shared rather than copied so the two
 * sides cannot drift; the standing discipline is that where a rule is stated twice, one side
 * eventually says something different.
 */
export const runtimeBypassImportPatterns = [
  {
    group: ['@qmulate/database', '@qmulate/database/*', '@qmulate/database/**'],
    importNames: ['makeSystemContext', 'SYSTEM_CONTEXT', 'getSystemPrisma', 'systemPrisma'],
    message: RUNTIME_BYPASS_IMPORT_MESSAGE,
  },
];

/**
 * Extra design-system restrictions. Layered in automatically by the `react` and
 * `next` configs; not applied to pure-TS packages where a `#` is just a `#`.
 */
export const designSystemRestrictions = [
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...restrictedSyntax,
        {
          selector:
            "JSXAttribute[name.name='style'] Property[key.name=/^(boxShadow|backdropFilter|WebkitBackdropFilter)$/]",
          message:
            'Depth is a token, not a value. Only <Surface> and <Well> may emit a box-shadow, and ' +
            'only from --nu-raised-sm / --nu-raised-md / --nu-inset / --glass-*. ' +
            'Hand-rolled shadows break the report/print theme, which strips them.',
        },
        {
          selector:
            "JSXAttribute[name.name='style'] Property[key.name=/^(color|background|backgroundColor|borderColor|fill|stroke)$/] > Literal[value=/#[0-9a-fA-F]{3,8}\\b/]",
          message:
            'Raw hex colours are banned. Every colour comes from a --color-* token so that ' +
            'light-neu, dark-neu and the flat report/print theme all stay consistent.',
        },
      ],
    },
  },
];

/** @type {import('eslint').Linter.Config[]} */
const base = tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/.expo/**',
      '**/.turbo/**',
      '**/generated/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/*.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2023,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      // ── The bans ──
      'no-restricted-syntax': ['error', ...restrictedSyntax],
      'no-restricted-imports': ['error', restrictedImports],
      'no-restricted-globals': [
        'error',
        {
          name: 'parseFloat',
          message:
            'Prefer decimal.js for anything monetary. If this is genuinely not money, use ' +
            'Number.parseFloat explicitly so the intent is visible in review.',
        },
      ],

      // ── General hygiene ──
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-implicit-coercion': ['error', { boolean: false, number: true, string: true }],
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': ['error', 'properties'],

      // ── TypeScript ──
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'warn',
    },
  },

  // ── Ban 4a · packages/domain SOURCES: no internal package, no I/O, no `process` ──
  // Both rules are RE-STATED in full rather than extended: ESLint replaces a rule's
  // options, it does not merge them, so the base `restrictedImports` / `restrictedSyntax`
  // sets have to be spread back in or the `@prisma/client` and Inter bans would silently
  // stop applying inside packages/domain. Same technique as packages/database's config.
  {
    files: DOMAIN_SOURCE_GLOBS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            ...restrictedImports.patterns,
            ...domainInternalImportPatterns,
            ...domainIoImportPatterns,
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...restrictedSyntax,
        {
          selector: "MemberExpression[object.name='process']",
          message: DOMAIN_AMBIENT_MESSAGE,
        },
      ],
    },
  },

  // ── Ban 4b · packages/domain TESTS: the internal-import ban stays, node:fs is allowed ──
  // A domain test may read another package's file as TEXT to prove the two sides agree
  // (the roles.test.ts / schema.prisma pattern). It still may not IMPORT that package,
  // and `process` is legal here only so a test can pin determinism under TZ=UTC.
  {
    files: DOMAIN_TEST_GLOBS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [...restrictedImports.patterns, ...domainInternalImportPatterns],
        },
      ],
      'no-restricted-syntax': ['error', ...restrictedSyntax],
    },
  },

  // ── Ban 5 · apps/worker + apps/web: no force-filter bypass ──
  // Both rules RE-STATED in full, for Ban 4a's reason: ESLint replaces a rule's options
  // rather than merging them, so the base `@prisma/client` / Inter / money bans have to be
  // spread back in or they would silently stop applying inside the apps.
  {
    files: RUNTIME_APP_GLOBS,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [...restrictedImports.patterns, ...runtimeBypassImportPatterns],
        },
      ],
      'no-restricted-syntax': [
        'error',
        ...restrictedSyntax,
        {
          selector: "Property[key.name='bypass']",
          message: RUNTIME_BYPASS_ASSIGN_MESSAGE,
        },
      ],
    },
  },

  // Config, script and test files are allowed to be noisier.
  {
    files: [
      '**/*.config.{js,cjs,mjs,ts}',
      '**/eslint.config.js',
      '**/vitest.workspace.ts',
      '**/scripts/**',
      '**/prisma/seed.ts',
      '**/*.{test,spec}.{ts,tsx}',
      '**/tests/**',
    ],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // `eslint-config-prettier` must stay LAST: it turns off every stylistic rule
  // that would fight Prettier.
  prettier,
);

export default base;
