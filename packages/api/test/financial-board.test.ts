/**
 * `deriveFinancialEmptyReason` — every combination, including the two no fixture can reach.
 *
 * S11 · 2c. The screen's three empty states are three DIFFERENT claims about an endowment, and two of
 * them return byte-identical figures from `finance.summary` (waqf-004 and waqf-005 both yield an
 * all-zero payload with `accounts: []`). So the sentence a Nazir reads is decided HERE, and it is
 * decided from two inputs neither of which is the money.
 */
import { describe, expect, it } from 'vitest';

import { deriveFinancialEmptyReason } from '../src/financial-board.js';

describe('deriveFinancialEmptyReason — three states, one of them an open question', () => {
  it('DIRECT_USE wins even when accounts exist — §14 §5.1(3) is about the DEED, not the balance', () => {
    // A direct-utilization endowment may still hold a bank account (a maintenance float, say). The
    // report must still say "no monetary distribution" rather than render a distributable position.
    expect(deriveFinancialEmptyReason(3, true)).toBe('DIRECT_USE');
    expect(deriveFinancialEmptyReason(0, true)).toBe('DIRECT_USE');
  });

  it('a recorded distributing endowment with accounts has NO empty state', () => {
    expect(deriveFinancialEmptyReason(1, false)).toBeNull();
  });

  it('NO_TRANSACTIONS only when the deed says NOT direct use and no account exists', () => {
    expect(deriveFinancialEmptyReason(0, false)).toBe('NO_TRANSACTIONS');
  });

  it('an UNRECORDED direct-use axis is its own state — never resolved to a false', () => {
    // The owner's two-axis ruling (2026-08-25): NULL means UNRECORDED, and a gate asked about a NULL
    // attribute parks the obligation undecided. Rendering §10's "link the dedicated account first"
    // here would answer a question nobody has recorded an answer to.
    expect(deriveFinancialEmptyReason(0, null)).toBe('DIRECT_USE_UNRECORDED');
  });

  it('an unrecorded axis with accounts present still has no empty state', () => {
    // There IS a position to show, so the direct-use question does not arise on this screen.
    expect(deriveFinancialEmptyReason(2, null)).toBeNull();
  });

  it('the three states are distinct, so no two endowments can be told the same thing wrongly', () => {
    const states = [
      deriveFinancialEmptyReason(0, true),
      deriveFinancialEmptyReason(0, false),
      deriveFinancialEmptyReason(0, null),
    ];
    expect(new Set(states).size).toBe(3);
    expect(states).toEqual(['DIRECT_USE', 'NO_TRANSACTIONS', 'DIRECT_USE_UNRECORDED']);
  });

  it('is keyed on the ACCOUNT COUNT, not on a zero total — the predicate the fixture cannot test', () => {
    // THE DIVERGENCE THAT MATTERS ON REAL DATA: an endowment with a linked dedicated account sitting
    // at a nil balance. Keyed on the count it renders a position (correctly, showing 0.00 against a
    // real account); keyed on "the total is zero" it would instruct the Nazir to link an account that
    // already exists. No fixture endowment has this shape — accounts are DERIVED from transaction
    // references — so this assertion is the only place the choice is exercised at all.
    expect(deriveFinancialEmptyReason(1, false)).toBeNull();
  });
});
