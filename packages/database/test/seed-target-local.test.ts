import { describe, expect, it } from 'vitest';

import { assertSeedTargetIsLocal, SeedRefusedError } from '../src/guardrail';

/**
 * One shared cloud database (2026-09-30): the fixture seed may only ever write to a LOCAL database.
 * The guard is what stops `FAKE-*` endowments from landing beside real users.
 */
describe('assertSeedTargetIsLocal', () => {
  it('accepts loopback hosts', () => {
    for (const host of ['localhost', '127.0.0.1', '[::1]']) {
      expect(() => assertSeedTargetIsLocal(`postgresql://u:p@${host}:54460/db`, undefined)).not.toThrow();
    }
  });

  it('refuses a cloud pooler host and names it', () => {
    expect(() =>
      assertSeedTargetIsLocal('postgresql://u:p@aws-0-ap-south-1.pooler.supabase.com:5432/postgres', undefined),
    ).toThrow(SeedRefusedError);
    expect(() =>
      assertSeedTargetIsLocal('postgresql://u:p@aws-0-ap-south-1.pooler.supabase.com:5432/postgres', undefined),
    ).toThrow(/pooler\.supabase\.com/);
  });

  it('is overridden only by the explicit sentence, and only by "1"', () => {
    const remote = 'postgresql://u:p@db.example.net:5432/x';
    expect(() => assertSeedTargetIsLocal(remote, '1')).not.toThrow();
    expect(() => assertSeedTargetIsLocal(remote, 'true')).toThrow(SeedRefusedError);
  });

  it('refuses an unparseable URL rather than guessing', () => {
    expect(() => assertSeedTargetIsLocal('not a url', undefined)).toThrow(SeedRefusedError);
  });
});
