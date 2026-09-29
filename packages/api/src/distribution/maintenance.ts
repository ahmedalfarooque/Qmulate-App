/**
 * THE ṢIYĀNA (صيانة) RESERVE RESOLVER — deed first, Nazir discretion only where the deed is silent.
 *
 * The reserve is waterfall step ONE: reserved before any operating cost, before the Nazir fee, before
 * anything reaches a beneficiary. Which of the engine's six `MAINTENANCE_RULE_KINDS` a run carries is
 * therefore the single most consequential mapping decision in this package, and there are **two
 * sources** for it with nothing in the schema, the seed or the engine adjudicating between them:
 *
 *   the DEED   `shartAlWaqif.maintenanceReserve` — `none | fixed | percent | target_topup | unspecified`
 *   the NAZIR  `Setting['distribution.maintenance.nazirDiscretionPercent']`, per endowment, no global row
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE RULE THIS FILE IMPLEMENTS: THE DEED WINS WHEREVER IT STATES ANYTHING
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Verbatim from `packages/database/src/seed/settings.ts`, which is where the discretion key is
 * declared: *"⚠ It is NOT the founder's `PERCENT`. That is a term of the Shart al-Waqif — immutable,
 * and it wins wherever the deed states one. This is the trustee's discretion under a silent deed, and
 * the two are separate `MaintenanceRule` kinds so a statement can always say which produced the
 * reserve."*
 *
 * So the discretion applies to exactly ONE deed state — `unspecified`, the deed is silent — and to no
 * other. `none` is NOT silence: it is the founder positively stipulating no reserve, and the seed's own
 * header keeps the two apart for precisely this reason (*"Collapsing the first into the second would be
 * the software silently deciding a fiqh question"*). A discretion applied over a `none` deed would
 * reserve money the founder said not to reserve.
 *
 * ⚠ **`waqf-001` CARRIES BOTH SIDES AND THIS FILE DOES NOT ADJUDICATE IT.** MEASURED: the deed
 * stipulates a fixed 40,000.00 SAR reserve, AND `Setting['distribution.maintenance.nazirDiscretionPercent']
 * = '5'` is seeded on that same endowment (those two rows are the only per-waqf Settings in the seed).
 * The deed wins, so the recorded 5% is not applied — but whether that row is DEAD DATA or a LIVE
 * CONFLICT is a trusteeship-authority question, not a mapping choice. It is emitted as
 * `MAINTENANCE_DEED_RULE_WINS_OVER_RECORDED_NAZIR_DISCRETION` (severity `CONFLICT`) so a human sees it.
 * Silence here is what produced the conflict in the first place.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE UNIT TRAP: TWO SOURCES, TWO SCALES, AND A 100× ERROR IN BETWEEN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * The engine's `ratePercent` is a decimal STRING **out of 100** — `'10'` is ten percent
 * (`contract.ts`: *"OUT OF 100"*). The two sources do NOT agree with each other:
 *
 *   Shart Json  `maintenanceReserve.rate`  a 0–1 RATE   (`0.05` = 5%)  ⇒ must be MULTIPLIED by 100
 *   Setting     `…nazirDiscretionPercent`  a 0–100 string (`'5'` = 5%) ⇒ must be passed VERBATIM
 *
 * Get either one backwards and the reserve is off by a factor of one hundred, in a figure that comes
 * off the top of every beneficiary's share, with nothing downstream able to notice: `'0.05'` and `'5'`
 * are both valid `ratePercentSchema` values. Both directions are pinned by tests.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHY THE ×100 IS A STRING SHIFT AND NOT ARITHMETIC
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ CORRECTED, AND THE ORIGINAL CLAIM HERE WAS FALSE. This paragraph used to read *"`0.05 * 100` is
 * `5.000000000000001` in IEEE-754"*. ✅ MEASURED: `0.05 * 100 === 5` **exactly**, so that example
 * proved nothing and the one seeded `percent` deed (waqf-002, 5%) is the case where the naive
 * multiplication happens to be right. The true examples, measured in the same run:
 *
 *   0.07 * 100 → 7.000000000000001      0.29 * 100 → 28.999999999999996
 *   of the 10,000 two-dp percentages from 0.01 to 100.00, **1,007** do not survive `p/100*100`
 *
 * Every rate here therefore moves as a DECIMAL STRING and the ×100 is a decimal-point shift on that
 * string — exact, no rounding, no float. The `MONEY_NAME_RE` lint ban and `canonicalJson`'s refusal of
 * JS numbers both point the same way. (A comment claiming a measurement nobody took is the defect
 * class this repo has a name for; it is fixed rather than deleted so the correction is on the record.)
 *
 * ⚠ The float damage upstream is real and already done, and this file reports rather than repairs it:
 * see `MAINTENANCE_PERCENT_RATE_NOT_EXACTLY_REPRESENTABLE` in `./refusal.ts` for the measurement
 * (2,760 of 10,000 two-dp percentages do not survive the seed's `percent / 100`).
 */

import { isDomainError, money, type MoneyInput } from '@qmulate/domain';
import { moneyToMinor, type DistributionInputRaw, type Minor } from '@qmulate/domain/distribution';

import { mapperRefusal, mappingDiagnostic, type MappingDiagnostic } from './refusal.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Exact decimal-string arithmetic — the rates AND the money
 *
 * ⚠ `sarToMinor` lives here rather than in a fifth module because this stage owns exactly four
 * source files. It is the one conversion between the `Decimal(18,2)` boundary and the engine's
 * `Minor`, and both this file and `./input.ts` need it; a second copy is how two callers drift.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A fixed-scale SAR decimal string (or a `Decimal`) as branded halalas — 1 SAR = 100n.
 *
 * `moneyToMinor(money(x))` refuses a JS number (`MONEY_NUMBER_INPUT`), refuses more than 2 dp
 * (`MONEY_PRECISION`), refuses exponent notation and empty strings (`MONEY_INVALID`) and refuses
 * anything outside the `Decimal(18,2)` range (`MONEY_OVERFLOW`). Every one of those is a real way a
 * Json column or a loose cast can lie about money, and every one has `errors.domain.*` copy already.
 *
 * ⚠ THE `MONEY_*` ERROR IS RE-THROWN UNCHANGED, NOT RE-CODED AS A MAPPER REFUSAL. Each of those five
 * codes already names the exact defect and already has its own catalogued sentence in both locales;
 * flattening them into one mapper refusal would tell a reader "the amount was unusable" where the
 * engine's own vocabulary can say "this figure carries three decimal places". Only a NON-`DomainError`
 * escape is wrapped, so nothing untyped leaves this boundary.
 */
export function sarToMinor(value: MoneyInput, context: string): Minor {
  try {
    return moneyToMinor(money(value));
  } catch (error) {
    if (isDomainError(error)) throw error;
    throw mapperRefusal(
      'RATE_UNREPRESENTABLE',
      `${context} could not be read as a SAR amount: ${String(error)}`,
      { context },
    );
  }
}

/** A plain non-negative decimal literal — the only shape a rate or weight may cross as. */
export const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;

/**
 * The point past which a JS number's decimal expansion is representation noise rather than a figure
 * anybody wrote.
 *
 * An IEEE-754 double carries ~15.95 decimal digits of significance, so `Number.prototype.toString`'s
 * shortest-round-trip output only NEEDS a 16th or 17th significant digit when the value is not
 * exactly a short decimal. This is a property of the format, not a threshold picked for taste.
 */
const MAX_HONEST_SIGNIFICANT_DIGITS = 15;

/**
 * A JS number as a plain decimal string, or a refusal.
 *
 * The Shart Json and the `Setting` envelopes both hold rates as JSON numbers, so this is the one door
 * they come through. Exponent notation is REFUSED rather than expanded: `1e-7` would have to be
 * rewritten as `0.0000001`, and a rate small enough to reach that notation is far more likely to be a
 * transcription accident than a founder's condition.
 */
export function plainDecimalFromNumber(value: number, context: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw mapperRefusal(
      'RATE_UNREPRESENTABLE',
      `${context} is ${String(value)}, which is not a finite number.`,
      { context, received: String(value) },
    );
  }
  if (value < 0) {
    throw mapperRefusal(
      'RATE_UNREPRESENTABLE',
      `${context} is negative (${String(value)}). A negative reserve or fee rate would ADD money to ` +
        `the distributable, which no deed term can mean.`,
      { context, received: String(value) },
    );
  }
  const text = String(value);
  if (!PLAIN_DECIMAL.test(text)) {
    throw mapperRefusal(
      'RATE_UNREPRESENTABLE',
      `${context} prints as "${text}", which is not a plain decimal literal (exponent notation is ` +
        `refused, not expanded — a rate that small is a transcription accident far more often than a ` +
        `founder's condition).`,
      { context, received: text },
    );
  }
  return text;
}

/** Significant digits in a plain decimal string: leading and trailing zeros do not count. */
export function significantDigits(decimal: string): number {
  const digits = decimal.replace('.', '').replace(/^0+/, '').replace(/0+$/, '');
  return digits.length;
}

/**
 * ×100 on a plain decimal string, exactly — a two-place shift of the decimal point.
 *
 * `'0.05' → '5'` · `'0.0025' → '0.25'` · `'1' → '100'` · `'0.028999999999999998' → '2.8999999999999998'`.
 * No multiplication happens anywhere in this function, which is the point.
 */
export function timesOneHundred(decimal: string, context: string): string {
  if (!PLAIN_DECIMAL.test(decimal)) {
    throw mapperRefusal(
      'RATE_UNREPRESENTABLE',
      `${context}: "${decimal}" is not a plain decimal literal, so it cannot be shifted exactly.`,
      { context, received: decimal },
    );
  }
  const dot = decimal.indexOf('.');
  const whole = dot === -1 ? decimal : decimal.slice(0, dot);
  const fraction = dot === -1 ? '' : decimal.slice(dot + 1);
  const padded = fraction.padEnd(2, '0');
  const shiftedWhole = `${whole}${padded.slice(0, 2)}`.replace(/^0+(?=\d)/, '');
  const shiftedFraction = padded.slice(2);
  return shiftedFraction === '' ? shiftedWhole : `${shiftedWhole}.${shiftedFraction}`;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · What this resolver reads
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The `shartAlWaqif.maintenanceReserve` clause, read structurally.
 *
 * Deliberately a flat record with every payload field nullable rather than a discriminated union:
 * the whole point is that `kind` arrives as an UNTRUSTED STRING out of a Json column, so a shape that
 * could only be constructed correctly would have to be constructed by a parser that already decided
 * the answer. `./input.ts` does the reading; this file does the ruling.
 */
export interface ShartMaintenanceReserve {
  /** `none | fixed | percent | target_topup | unspecified`, as recorded. Never defaulted. */
  readonly kind: string;
  /** Fixed-scale SAR decimal string, present iff `kind === 'fixed'`. */
  readonly amountSar: string | null;
  /** A 0–1 RATE (not a percentage), present iff `kind === 'percent'`. See the unit trap above. */
  readonly rate: number | null;
  /** Fixed-scale SAR decimal string, present iff `kind === 'target_topup'`. */
  readonly targetBalanceSar: string | null;
}

export interface MaintenanceResolutionArgs {
  /** For the diagnostics' `detail`, so a conflict names the endowment it is about. */
  readonly waqfId: string;
  readonly deed: ShartMaintenanceReserve;
  /**
   * `Setting['distribution.maintenance.nazirDiscretionPercent'].v` — a percentage OUT OF 100, as a
   * string, exactly as the registry declares it (`ratePercentSchema`). `null` means **no row at any
   * tier**, i.e. the Nazir has recorded no discretion for this endowment.
   *
   * ⚠ There is deliberately NO global row for this key, so `null` is a real, reachable state and not
   * a resolver failure — a platform-wide default percentage would be a figure nobody chose applied to
   * every endowment, which is the defect OQ-06 opened.
   */
  readonly nazirDiscretionPercent: string | null;
  /**
   * The ṣiyāna reserve FUND's current balance in halalas, for a `target_topup` deed. `null` when
   * unknown — which is always, today: no column anywhere holds it. A `target_topup` deed with a null
   * balance is REFUSED, because defaulting it to zero tops the fund up to its FULL target every period.
   */
  readonly reserveFundBalanceMinor: bigint | null;
}

/** The engine's `maintenance` field as the caller hands it in, plus what the mapping observed. */
export interface MaintenanceResolution {
  readonly rule: DistributionInputRaw['maintenance'];
  readonly diagnostics: readonly MappingDiagnostic[];
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The resolver — all six kinds, and the one place the deed beats the Setting
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Resolve the ṣiyāna rule for one run.
 *
 * | Shart `maintenanceReserve.kind` | Nazir discretion recorded | engine `MaintenanceRule` |
 * |---|---|---|
 * | `fixed`         | either | `FIXED` — deed wins; a recorded discretion is reported |
 * | `percent`       | either | `PERCENT` (rate ×100) — deed wins; a recorded discretion is reported |
 * | `target_topup`  | either | `TARGET_TOPUP`, or REFUSED when no fund balance is available |
 * | `none`          | either | `NONE` — the founder stipulated no reserve; a discretion may not override it |
 * | `unspecified`   | yes    | `NAZIR_DISCRETION_PERCENT` (verbatim, already out of 100) |
 * | `unspecified`   | no     | `UNSET` ⇒ the engine raises `MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED` |
 *
 * All six of the engine's kinds are reachable from this table, which is the reason it is written as
 * one table: a mapping that could only ever produce five of six kinds would make the sixth's flag
 * unexercisable, and an unexercisable flag reports its own silence as success.
 */
export function resolveMaintenanceRule(args: MaintenanceResolutionArgs): MaintenanceResolution {
  const { waqfId, deed, nazirDiscretionPercent, reserveFundBalanceMinor } = args;
  const diagnostics: MappingDiagnostic[] = [];

  /** The conflict Q-S7-1 names: the deed states a rule AND a discretion is on file. */
  const reportDeedWins = (deedKind: string): void => {
    if (nazirDiscretionPercent === null) return;
    diagnostics.push(
      mappingDiagnostic('MAINTENANCE_DEED_RULE_WINS_OVER_RECORDED_NAZIR_DISCRETION', 'CONFLICT', {
        waqfId,
        deedMaintenanceKind: deedKind,
        recordedNazirDiscretionPercent: nazirDiscretionPercent,
        applied: 'DEED',
      }),
    );
  };

  switch (deed.kind) {
    case 'fixed': {
      if (deed.amountSar === null) {
        throw mapperRefusal(
          'MAINTENANCE_RULE_UNRECOGNISED',
          'the deed records a `fixed` ṣiyāna reserve with no amount. A fixed rule without its figure ' +
            'is not a rule, and substituting zero would assert the founder stipulated no reserve.',
          { waqfId, maintenanceKind: deed.kind },
        );
      }
      reportDeedWins(deed.kind);
      return {
        rule: {
          kind: 'FIXED',
          amountMinor: sarToMinor(deed.amountSar, 'maintenanceReserve.amountSar'),
        },
        diagnostics,
      };
    }

    case 'percent': {
      if (deed.rate === null) {
        throw mapperRefusal(
          'MAINTENANCE_RULE_UNRECOGNISED',
          'the deed records a `percent` ṣiyāna reserve with no rate.',
          { waqfId, maintenanceKind: deed.kind },
        );
      }
      // ⚠ 0–1 RATE → 0–100 PERCENT. See the unit trap in the file header.
      const rate01 = plainDecimalFromNumber(deed.rate, 'maintenanceReserve.rate');
      const ratePercent = timesOneHundred(rate01, 'maintenanceReserve.rate');
      if (significantDigits(rate01) > MAX_HONEST_SIGNIFICANT_DIGITS) {
        diagnostics.push(
          mappingDiagnostic('MAINTENANCE_PERCENT_RATE_NOT_EXACTLY_REPRESENTABLE', 'CONFLICT', {
            waqfId,
            storedRate: rate01,
            appliedRatePercent: ratePercent,
            significantDigits: String(significantDigits(rate01)),
            upstream: 'packages/database/src/seed/shart.ts — maintenanceReserve.percent / 100',
          }),
        );
      }
      reportDeedWins(deed.kind);
      return { rule: { kind: 'PERCENT', ratePercent }, diagnostics };
    }

    case 'target_topup': {
      if (deed.targetBalanceSar === null) {
        throw mapperRefusal(
          'MAINTENANCE_RULE_UNRECOGNISED',
          'the deed records a `target_topup` ṣiyāna reserve with no target balance.',
          { waqfId, maintenanceKind: deed.kind },
        );
      }
      if (reserveFundBalanceMinor === null) {
        throw mapperRefusal(
          'MAINTENANCE_TARGET_BALANCE_UNAVAILABLE',
          'the deed tops the ṣiyāna fund up to a target balance, and no CURRENT balance for that fund ' +
            'is available — the Shart Json records only the target, and no column anywhere holds the ' +
            'fund. Refused rather than defaulted to zero, which would reserve the FULL target every ' +
            'single period and starve the distributable indefinitely. Unreachable on the seeded ' +
            'fixture (no deed uses `target_topup`); owed a reserve-fund balance source before one does.',
          { waqfId, maintenanceKind: deed.kind, targetBalanceSar: deed.targetBalanceSar },
        );
      }
      reportDeedWins(deed.kind);
      return {
        rule: {
          kind: 'TARGET_TOPUP',
          targetBalanceMinor: sarToMinor(
            deed.targetBalanceSar,
            'maintenanceReserve.targetBalanceSar',
          ),
          currentBalanceMinor: reserveFundBalanceMinor,
        },
        diagnostics,
      };
    }

    case 'none': {
      // ⚠ NOT silence. The founder positively stipulated no reserve, so a recorded Nazir discretion
      // may not override it — that would reserve money the deed says not to reserve.
      reportDeedWins(deed.kind);
      return { rule: { kind: 'NONE' }, diagnostics };
    }

    case 'unspecified': {
      if (nazirDiscretionPercent !== null) {
        // ⚠ VERBATIM. The Setting is ALREADY out of 100 (`unit: 'percent'`, `v: '5'`). Dividing by
        // 100 here — the mirror of the `percent` branch's multiplication — would reserve 0.05% where
        // the Nazir recorded 5%.
        if (!PLAIN_DECIMAL.test(nazirDiscretionPercent)) {
          throw mapperRefusal(
            'RATE_UNREPRESENTABLE',
            `the recorded Nazir ṣiyāna discretion "${nazirDiscretionPercent}" is not a plain decimal ` +
              `literal out of 100.`,
            { waqfId, received: nazirDiscretionPercent },
          );
        }
        return {
          rule: { kind: 'NAZIR_DISCRETION_PERCENT', ratePercent: nazirDiscretionPercent },
          diagnostics,
        };
      }
      // Deed silent, nothing recorded. Zero reserve PLUS a flag — never a silent zero.
      diagnostics.push(
        mappingDiagnostic('MAINTENANCE_POLICY_UNACKNOWLEDGED', 'NOTICE', {
          waqfId,
          deedMaintenanceKind: deed.kind,
          engineFlagExpected: 'MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED',
        }),
      );
      return { rule: { kind: 'UNSET' }, diagnostics };
    }

    default:
      throw mapperRefusal(
        'MAINTENANCE_RULE_UNRECOGNISED',
        `the Shart records a ṣiyāna reserve of kind "${deed.kind}", which this build does not ` +
          `recognise. Refused rather than mapped onto the nearest kind: UNSET, NONE and a stipulated ` +
          `rule produce three different reserves and only one of them is the founder's.`,
        { waqfId, maintenanceKind: deed.kind },
      );
  }
}
