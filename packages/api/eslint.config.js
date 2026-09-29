/**
 * QMULATE — ESLint config for `@qmulate/api`.
 *
 * The shared base, plus ONE local rule. This package needs no exemption from the base: it reaches
 * the database only through `@qmulate/database` (the `@prisma/client` ban in the base config applies
 * here in full, and it should — a direct import would be a client with no audit, no scoping and no
 * field encryption, which is precisely what this package's whole ladder exists to prevent).
 *
 * A local file rather than relying on the root config's upward search, so `pnpm --filter
 * @qmulate/api run lint` resolves the same rule set whatever the cwd.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE LOCAL RULE: `withAudit` HAS EXACTLY ONE IMPORT SITE (C-08)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `@qmulate/database`'s audit extension takes an event's POST-image from the write's own return
 * value while its PRE-image is a whole row, and `diffChangedKeys` reads a key that is absent from
 * the post-image as `null`. So ANY `select`/`omit`/`include` on an audited `update`/`upsert` makes
 * the audit event claim that every dropped column was set to null — and the hash chain then seals
 * that as authentic, append-only evidence.
 *
 * `src/middleware/audit-projection.ts` closes it with `auditedWrite()`, whose transaction handle
 * refuses such a write at runtime. This rule is what makes that the ONLY write path: a second call
 * site importing `withAudit` directly would be an unguarded door, and it now fails `turbo run lint`
 * (which CI runs) instead of shipping. Enforced by the toolchain, not by a comment — S2's lesson is
 * that a comment claiming a control nothing enforces is a defect rather than a control.
 *
 * If a future epic genuinely needs raw `withAudit`, add the file to `ignores` below **and say why**
 * — the point is that widening the set is a reviewed act.
 */
import base from '@qmulate/config/eslint';

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  {
    files: ['src/**/*.ts'],
    // THE ONE EXEMPTION: the module that implements the guarded door has to call the raw primitive.
    ignores: ['src/middleware/audit-projection.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@qmulate/database',
              importNames: ['withAudit'],
              message:
                'Use `auditedWrite()` from ./middleware/audit-projection.js instead of withAudit(). ' +
                'Its transaction handle refuses a projected audited update/upsert, which the audit ' +
                'extension would otherwise record as "every dropped column was set to null" and ' +
                'seal into the append-only hash chain (C-08). Same semantics otherwise: one ' +
                'transaction, writes and events committing together, nesting joins the enclosing one.',
            },
          ],
        },
      ],
    },
  },
];
