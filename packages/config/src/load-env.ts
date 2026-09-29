/**
 * QMULATE — load the monorepo-root `.env` into `process.env`, once.
 *
 * Next.js loads `.env` for `apps/web` itself (see `apps/web/next.config.ts`). Plain Node
 * entry points — the fixture seed, `apps/worker`, `scripts/*`, Vitest integration runs — get
 * nothing automatically, which is how you end up debugging "FIELD_ENCRYPTION_KEYS: Required"
 * while a perfectly good `.env` sits three directories up.
 *
 * Two deliberate properties:
 *
 *  - **Never overrides.** A variable already present in `process.env` wins. CI and Railway
 *    inject real values directly; a stray developer `.env` must not be able to quietly
 *    re-point a pipeline (and, per NFR-03, must never be able to flip `DATA_CLASSIFICATION`).
 *  - **Never throws.** A missing `.env` is normal in CI. Absence is not an error here — the
 *    zod schema in `./env.ts` is what fails loudly, with a message naming every missing var.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let loaded = false;

/** The workspace root is the nearest ancestor of `from` holding `pnpm-workspace.yaml`. */
function walkUpToRoot(from: string): string | undefined {
  let dir = from;
  for (let depth = 0; depth < 12; depth += 1) {
    if (existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

/**
 * Two independent starting points, because neither is reliable alone:
 *
 *  - `process.cwd()` is right for every workspace script (pnpm runs them in the package dir)
 *    but wrong when a tool is invoked from outside the repo.
 *  - The module's own location is right regardless of cwd, but `import.meta.url` is not
 *    available under every loader (a `.ts` file pulled in through tsx's CJS path, for one) —
 *    hence the guarded read rather than a bare reference.
 */
function findRepoRoot(): string | undefined {
  const fromCwd = walkUpToRoot(process.cwd());
  if (fromCwd !== undefined) return fromCwd;

  try {
    const here = import.meta.url;
    if (typeof here === 'string' && here.startsWith('file:')) {
      return walkUpToRoot(path.dirname(fileURLToPath(here)));
    }
  } catch {
    // No `import.meta` under this loader — cwd was the only option and it did not resolve.
  }
  return undefined;
}

/**
 * Minimal `KEY=value` parser — enough for a `.env`, with no dependency.
 *
 * Supports `#` comments, blank lines, an optional `export ` prefix, and single/double-quoted
 * values (quotes stripped, `\n` unescaped in double quotes only). Values containing `#`
 * unquoted keep everything after the first unquoted `#` stripped, matching dotenv.
 */
export function parseEnvFile(contents: string): Record<string, string> {
  const out: Record<string, string> = {};

  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;

    const withoutExport = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq <= 0) continue;

    const key = withoutExport.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;

    let value = withoutExport.slice(eq + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      const quote = value[0];
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\n/g, '\n');
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trimEnd();
    }

    out[key] = value;
  }

  return out;
}

/**
 * Variables this loader will NEVER take from a file — they must be set explicitly in the
 * process environment or not at all.
 *
 * `DATA_CLASSIFICATION` is the residency guardrail's own switch (NFR-03 / gate G-8). The whole
 * point of layer 2 is that the seed **fails closed** when the classification is not asserted, and
 * a guardrail a stray untracked file can satisfy is not a guardrail. So an entry point that
 * writes data has to state the classification itself — `pnpm db:seed` does, and CI does.
 *
 * `TEST_ONLY_DISABLE_AUTH_RATE_LIMIT` is here for AV7-AUD-F5 and by the SAME argument, which had
 * simply never been applied to it: it is the other guardrail whose absence is its safe state, and
 * it was NOT on this list while `DATA_CLASSIFICATION` was — an asymmetry with no reason behind it.
 *
 * ⚠ AND THE HONEST LIMIT OF THIS LIST, because AV7-AUD-F5 was measured on the path it does NOT
 * cover. `apps/web` does not use this loader: `next.config.ts` calls Next's own
 * `loadEnvConfig(repoRoot, NODE_ENV !== 'production')`, which reads `.env.development`, `.env.test`
 * or `.env.production` depending on `NODE_ENV` and consults nothing here. So on the process that
 * serves `/api/auth/*` this exclusion buys NOTHING, and what closes that path is that `.gitignore`
 * now covers `.env.*` (so the file cannot be committed) plus the workflow scoping pinned in
 * `packages/auth/test/av7-rate-limit-bypass.test.ts`. This list governs the paths that WRITE DATA
 * through the Node entry points: the seed, and later the E11 importer.
 *
 * Exported so a test can assert the policy rather than re-describe it; the enforcement is the one
 * `continue` in `loadRootEnv()` below.
 */
export const NEVER_FROM_FILE: readonly string[] = [
  'DATA_CLASSIFICATION',
  // ⊕ S12-4 · the residency posture is a platform fact, never a file's claim (G-8 layer 1/3).
  'DATA_RESIDENCY',
  'TEST_ONLY_DISABLE_AUTH_RATE_LIMIT',
];

/**
 * Idempotent. Safe to call from any module's top level.
 *
 * Also invoked automatically when this module is loaded (see the bottom of the file), so
 * `import '@qmulate/config/load-env';` is a complete, working side-effect import.
 */
export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;

  const root = findRepoRoot();
  if (root === undefined) return;

  const envPath = path.join(root, '.env');
  if (!existsSync(envPath)) return;

  for (const [key, value] of Object.entries(parseEnvFile(readFileSync(envPath, 'utf8')))) {
    if (NEVER_FROM_FILE.includes(key)) continue;
    // Already set (CI, Railway, an explicit shell export) always wins.
    process.env[key] ??= value;
  }
}

// Run on import. This module exists to be imported for its side effect
// (`import '@qmulate/config/load-env';`), so importing it must actually load the file.
loadRootEnv();
