/**
 * S10/T2 — the sweep key's KSA-day boundary, pinned.  (ratification condition 4)
 *
 * KSA is UTC+3, so a day key derived from a UTC date slice splits the KSA day at 03:00 local:
 * a tick at 00:30 KSA and one at 23:30 KSA on the SAME KSA day would produce DIFFERENT keys,
 * and per-endowment-per-day would quietly evaporate for three hours every night — in a deadline
 * engine, in the jurisdiction the calendar module exists for. The key therefore comes from the
 * repo's own `civilDateFromInstant(now, 'Asia/Riyadh')`, and this file is the cheap test that
 * protects the claim the whole sweep design rests on.
 */

import { describe, expect, it } from 'vitest';

import { ksaDayOf, sweepIdempotencyKey } from '../src/deadline-sweep.js';

describe('S10/T2 · the sweep key is a KSA day, not a UTC slice', () => {
  it('00:30 KSA and 23:30 KSA on one KSA day yield the SAME key', () => {
    // 2026-09-15 00:30 Asia/Riyadh == 2026-09-14T21:30Z — the UTC date is STILL THE 14TH, which
    // is exactly the trapdoor: a UTC slice would say "2026-09-14" here and "2026-09-15" below.
    const earlyKsa = new Date('2026-09-14T21:30:00.000Z');
    const lateKsa = new Date('2026-09-15T20:30:00.000Z'); // 23:30 KSA the same day
    expect(ksaDayOf(earlyKsa)).toBe('2026-09-15');
    expect(ksaDayOf(lateKsa)).toBe('2026-09-15');
    expect(sweepIdempotencyKey('waqf-001', ksaDayOf(earlyKsa))).toBe(
      sweepIdempotencyKey('waqf-001', ksaDayOf(lateKsa)),
    );
  });

  it('and the UTC slice really would have split it — the premise measured, not narrated', () => {
    const earlyKsa = new Date('2026-09-14T21:30:00.000Z');
    expect(earlyKsa.toISOString().slice(0, 10)).toBe('2026-09-14'); // the wrong answer
    expect(ksaDayOf(earlyKsa)).toBe('2026-09-15'); // the right one
  });

  it('the key is deterministic and per-endowment', () => {
    const day = ksaDayOf(new Date('2026-09-15T03:00:00.000Z'));
    expect(sweepIdempotencyKey('waqf-001', day)).toBe('deadline-evaluate:waqf-001:2026-09-15');
    expect(sweepIdempotencyKey('waqf-002', day)).not.toBe(sweepIdempotencyKey('waqf-001', day));
  });
});
