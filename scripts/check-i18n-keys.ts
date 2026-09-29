/**
 * QMULATE — assert that every translation key referenced in code exists in BOTH catalogues.
 *
 * `packages/i18n/test/messages.test.ts` proves the two catalogues have identical key sets. That
 * is necessary but not sufficient: a key can be referenced from a component and be missing from
 * *both* files, and next-intl's fallback renders the raw key path. The result is a screen reading
 * "auth.createAccount" — which is exactly what shipped before this check existed.
 *
 * The DoD box is "all copy in `packages/i18n` (ar + en)". This is that box, enforced.
 *
 * Scope: the surfaces that render user-facing copy — `apps/web/src` and `packages/ui/src`.
 *
 * Usage:
 *   pnpm i18n:check            # exits non-zero and lists every missing key
 *
 * Limits, stated honestly: this is a static scan, not a type system. It resolves
 * `useTranslations('ns')` / `getTranslations({ namespace: 'ns' })` per *variable*, and only
 * understands string-literal keys. A key built at runtime (`t(\`errors.${code}\`)`) cannot be
 * checked here and is reported as skipped rather than silently passed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['apps/web/src', 'packages/ui/src'];
const CATALOGUES = ['ar', 'en'] as const;

type Json = { [key: string]: Json | string | number | boolean | null };

function flatten(node: Json, prefix = '', out: Set<string> = new Set()): Set<string> {
  for (const [key, value] of Object.entries(node)) {
    const full = prefix === '' ? key : `${prefix}.${key}`;
    if (value !== null && typeof value === 'object') flatten(value as Json, full, out);
    else out.add(full);
  }
  return out;
}

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry === 'dist') continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(full) && !/\.(test|spec)\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

/** `const t = useTranslations('auth')` / `const t = await getTranslations({ namespace: 'auth' })` */
const NAMESPACE_BINDING =
  /(?:const|let)\s+(\w+)\s*=\s*(?:await\s+)?(?:useTranslations|getTranslations)\(\s*(?:\{[^}]*namespace\s*:\s*['"`]([^'"`]+)['"`][^}]*\}|['"`]([^'"`]+)['"`])?\s*\)/g;

interface Finding {
  key: string;
  file: string;
  missingIn: string[];
}

const catalogues = new Map<string, Set<string>>(
  CATALOGUES.map((locale) => [
    locale,
    flatten(
      JSON.parse(
        readFileSync(path.join(REPO_ROOT, 'packages/i18n/messages', `${locale}.json`), 'utf8'),
      ) as Json,
    ),
  ]),
);

const findings: Finding[] = [];
const dynamic: string[] = [];
let referenceCount = 0;

for (const dir of SCAN_DIRS) {
  for (const file of sourceFiles(path.join(REPO_ROOT, dir))) {
    const src = readFileSync(file, 'utf8');
    const relative = path.relative(REPO_ROOT, file);

    /**
     * A variable name can be bound more than once in one file — a page typically has
     * `const t = getTranslations({namespace:'nav'})` in `generateMetadata` and another
     * `const t = getTranslations({namespace:'common'})` in the component. A regex scan has no
     * scope analysis, so a key is accepted if it resolves under ANY namespace that name is
     * bound to in the file. That under-reports in a file with two bindings; reporting a
     * false "missing key" for correct code would be worse, and this still catches the case
     * that actually ships broken — a key that exists under no namespace at all.
     */
    const namespaceOf = new Map<string, Set<string | undefined>>();
    for (const match of src.matchAll(NAMESPACE_BINDING)) {
      const variable = match[1] as string;
      const existing = namespaceOf.get(variable) ?? new Set<string | undefined>();
      existing.add(match[2] ?? match[3]);
      namespaceOf.set(variable, existing);
    }
    if (namespaceOf.size === 0) continue;

    for (const [variable, namespaces] of namespaceOf) {
      const call = new RegExp(
        `\\b${variable}(?:\\.rich|\\.markup)?\\(\\s*(['"\`])([^'"\`$]*)\\1`,
        'g',
      );
      const dynamicCall = new RegExp(
        `\\b${variable}(?:\\.rich|\\.markup)?\\(\\s*\`[^\`]*\\$\\{`,
        'g',
      );

      for (const _ of src.matchAll(dynamicCall)) dynamic.push(relative);

      for (const match of src.matchAll(call)) {
        const leaf = match[2] as string;
        if (leaf === '') continue;
        referenceCount += 1;

        const candidates = [...namespaces].map((ns) => (ns === undefined ? leaf : `${ns}.${leaf}`));
        const resolvesEverywhere = candidates.some((key) =>
          CATALOGUES.every((locale) => catalogues.get(locale)?.has(key)),
        );
        if (resolvesEverywhere) continue;

        // Report against the candidate that comes closest, so the message names one concrete key.
        const key =
          candidates.find((candidate) =>
            CATALOGUES.some((locale) => catalogues.get(locale)?.has(candidate)),
          ) ?? (candidates[0] as string);
        const missingIn = CATALOGUES.filter((locale) => !catalogues.get(locale)?.has(key));
        findings.push({ key, file: relative, missingIn });
      }
    }
  }
}

const unique = new Map<string, Finding>();
for (const finding of findings) unique.set(`${finding.key}::${finding.file}`, finding);

if (unique.size > 0) {
  console.error(`\n✗ ${unique.size} translation key reference(s) resolve to nothing.\n`);
  for (const { key, file, missingIn } of [...unique.values()].sort((a, b) =>
    a.key.localeCompare(b.key),
  )) {
    console.error(`  ${key}`);
    console.error(`      referenced by : ${file}`);
    console.error(`      missing from  : ${missingIn.join(', ')}`);
  }
  console.error(
    '\nAdd them to packages/i18n/messages/ar.json AND en.json. Arabic is the product default,\n' +
      'not a fallback — an English string parked in ar.json is not a translation.\n',
  );
  process.exit(1);
}

console.log(
  `✓ i18n: ${referenceCount} key references resolve in both catalogues (${CATALOGUES.join(', ')}).` +
    (dynamic.length > 0
      ? `\n  note: ${new Set(dynamic).size} file(s) build a key at runtime; those cannot be checked statically.`
      : ''),
);
