/**
 * The root-`.env` loader (`@qmulate/config/load-env`).
 *
 * The interesting property is not that it loads — it is what it REFUSES to load. The residency
 * guardrail (NFR-03 / gate G-8) only works if the seed fails closed when `DATA_CLASSIFICATION`
 * is not asserted in the process environment. An untracked developer file must not be able to
 * satisfy it, so the loader carries a deny-list and these tests pin it.
 *
 * Regression origin: an earlier version of the loader had no deny-list. It fixed a real
 * "DATABASE_URL not found" papercut and, in doing so, made the seed's refusal-on-unset
 * assertion (B3) pass vacuously — the file supplied the flag the test was proving absent.
 */
import { describe, expect, it } from 'vitest';

import { parseEnvFile } from '../src/load-env.js';

describe('parseEnvFile', () => {
  it('parses plain assignments and ignores comments and blanks', () => {
    expect(
      parseEnvFile(['# a comment', '', 'A=1', '  B = two  ', 'export C=three'].join('\n')),
    ).toEqual({ A: '1', B: 'two', C: 'three' });
  });

  it('keeps a JSON value intact — the field-encryption key map is JSON', () => {
    const parsed = parseEnvFile('FIELD_ENCRYPTION_KEYS={"1":"YWJj"}');
    expect(parsed.FIELD_ENCRYPTION_KEYS).toBe('{"1":"YWJj"}');
    expect(JSON.parse(parsed.FIELD_ENCRYPTION_KEYS as string)).toEqual({ '1': 'YWJj' });
  });

  it('strips surrounding quotes and unescapes \\n only inside double quotes', () => {
    expect(parseEnvFile('A="one\\ntwo"').A).toBe('one\ntwo');
    expect(parseEnvFile("A='one\\ntwo'").A).toBe('one\\ntwo');
  });

  it('strips a trailing inline comment from an unquoted value but not from a quoted one', () => {
    expect(parseEnvFile('A=value # trailing').A).toBe('value');
    expect(parseEnvFile('A="value # kept"').A).toBe('value # kept');
  });

  it('ignores malformed lines rather than throwing', () => {
    expect(parseEnvFile(['no-equals-sign', '=novalue', '1BAD=x', 'GOOD=y'].join('\n'))).toEqual({
      GOOD: 'y',
    });
  });
});

describe('the DATA_CLASSIFICATION deny-list (NFR-03 / G-8)', () => {
  it('parseEnvFile still reports the key — the deny-list lives in loadRootEnv, not the parser', () => {
    // Stated explicitly so nobody "fixes" the parser and silently moves the guardrail.
    expect(parseEnvFile('DATA_CLASSIFICATION=fixture-only')).toEqual({
      DATA_CLASSIFICATION: 'fixture-only',
    });
  });

  it('loadRootEnv never sets DATA_CLASSIFICATION from the file', async () => {
    // `loadRootEnv` is idempotent and already ran at import time (the module self-invokes), so
    // asserting on a second call would prove nothing. Read the source instead: the deny-list is
    // a structural property of this file, and the seed's refusal test (B3) is the behavioural half.
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const path = (await import('node:path')).default;

    const source = readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'load-env.ts'),
      'utf8',
    );

    expect(source).toContain('NEVER_FROM_FILE');
    expect(source).toMatch(/NEVER_FROM_FILE[^=]*=\s*\[[^\]]*'DATA_CLASSIFICATION'/);
    expect(source).toContain('if (NEVER_FROM_FILE.includes(key)) continue;');
  });
});
