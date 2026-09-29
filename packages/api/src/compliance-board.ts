/**
 * `compliance-board.ts` — the five §3.1 KPI chips, composed by ONE pure function from the kernel's own
 * reads. **S11 · 2b (E10).**
 *
 * ── WHY THIS LIVES IN `@qmulate/api` AND NOT IN THE WEB APP ────────────────────────────────────
 * `apps/web` cannot import `@qmulate/domain` and has no unit-test runner; it imports this package for
 * the server caller. A tone rule that decides whether a compliance chip is red is not chrome — it is a
 * claim about the endowment's standing — so it is written once, here, where a unit test can drive every
 * combination, and the web renders what it is handed. The board's screen component contains NO tone
 * logic of its own.
 *
 * ── THE RULES, STATED ──────────────────────────────────────────────────────────────────────────
 *  · A REFUSED read is a FOURTH state (`refused`), never a colour: the chip says the read was refused and
 *    nothing about the endowment. A refusal is not warning-yellow either — yellow would claim "there is
 *    something to attend to", and the truth is "this seat could not look".
 *  · KPI 1 (Authority deadlines) is the kernel's `deadline.board.kpi1` verbatim — computed once, there.
 *  · KPI 2 (no commingling) is `danger` when any receipt sits on a non-dedicated account, `warning` when a
 *    non-dedicated account exists with no receipt on it yet, `warning` when NO account is recorded at all
 *    ("no account to check" is not "no commingling" — BR-501 requires one), `success` otherwise — WITH the
 *    counts.
 *  · KPI 3 (beneficiary KYC) is `danger` when any beneficiary is STALE, `warning` when any is UNVERIFIED
 *    and none stale, `success` when every row is FRESH. An EMPTY register is `warning`: "nobody to
 *    verify" is not "everyone verified".
 *  · KPI 4 (AML reports) is `warning` while the kernel says the figure is not assessable — the truth on
 *    2026-09-02, `AML_TIMELINESS_NOT_MODELLED` — `danger` if it ever reports a missed report, `success`
 *    only when it reports assessable and none missed.
 *  · KPI 5 (licensed activity) reads the LICENSE_RENEWAL rule's cause: `ROUTED_NO_HOME` is `warning`,
 *    said in words on the board; a row that is overdue is `danger`; a computed non-overdue row is `success`.
 *  · DANGER DOMINATES the roll-up: an endowment's marker is the worst tone across its five chips, with
 *    `refused` ranking above `success` and below `warning` — a board that could not be fully read is not
 *    a healthy board, and it is not a board with a known problem either.
 *
 * ⚠ Binding rule 3: KPI 1's windows and KPI 3's refresh interval are unverified against primary law. The
 * board carries the kernel's `unverifiedNote`; this module adds no figure.
 */

/* ═════════════════════════════════════════════════
 * 1 · Inputs — the kernel's shapes, narrowed to what the chips read
 * ═════════════════════════════════════════════════ */

export type KpiTone = 'danger' | 'warning' | 'success' | 'refused';
export type KpiKey = 'registration' | 'commingling' | 'kyc' | 'aml' | 'licence';

/** Rank for "danger dominates": higher is worse. `refused` sits between success and warning. */
export const KPI_TONE_RANK: Readonly<Record<KpiTone, number>> = Object.freeze({
  success: 0,
  refused: 1,
  warning: 2,
  danger: 3,
});

export type Loaded<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: string };

export interface BoardKpi1Input {
  readonly tone: 'danger' | 'warning' | 'success';
  readonly reasons: readonly string[];
}

export interface BoardRuleInput {
  readonly ruleKey: string;
  readonly rows: readonly { readonly state: string }[];
  readonly cause: string | null;
}

export interface ComminglingInput {
  readonly accountsChecked: number;
  readonly nonDedicatedAccounts: number;
  readonly receiptsOnNonDedicated: number;
}

export interface AmlInput {
  readonly missedReports: boolean | null;
  readonly assessable: boolean;
  readonly reason: string;
}

export interface KycInput {
  readonly counts: { readonly FRESH: number; readonly STALE: number; readonly UNVERIFIED: number };
}

export interface ComposeKpisInput {
  readonly deadlines: Loaded<{
    readonly kpi1: BoardKpi1Input;
    readonly rules: readonly BoardRuleInput[];
  }>;
  readonly commingling: Loaded<ComminglingInput>;
  readonly kyc: Loaded<KycInput>;
  readonly aml: Loaded<AmlInput>;
}

export interface KpiChip {
  readonly key: KpiKey;
  readonly tone: KpiTone;
  /** Machine reasons — rendered through the i18n catalogue, never raw. */
  readonly reasons: readonly string[];
}

/* ═════════════════════════════════════════════════
 * 2 · The composition
 * ═════════════════════════════════════════════════ */

function refused(key: KpiKey, refusal: string): KpiChip {
  return { key, tone: 'refused', reasons: [`READ_REFUSED:${refusal}`] };
}

export function composeComplianceKpis(input: ComposeKpisInput): readonly KpiChip[] {
  const registration: KpiChip = input.deadlines.ok
    ? {
        key: 'registration',
        tone: input.deadlines.value.kpi1.tone,
        reasons: input.deadlines.value.kpi1.reasons,
      }
    : refused('registration', input.deadlines.refusal);

  let commingling: KpiChip;
  if (!input.commingling.ok) commingling = refused('commingling', input.commingling.refusal);
  else {
    const c = input.commingling.value;
    if (c.receiptsOnNonDedicated > 0) {
      commingling = {
        key: 'commingling',
        tone: 'danger',
        reasons: [`RECEIPTS_ON_NON_DEDICATED:${String(c.receiptsOnNonDedicated)}`],
      };
    } else if (c.nonDedicatedAccounts > 0) {
      commingling = {
        key: 'commingling',
        tone: 'warning',
        reasons: [`NON_DEDICATED_ACCOUNTS:${String(c.nonDedicatedAccounts)}`],
      };
    } else if (c.accountsChecked === 0) {
      /**
       * ⚠ NO DEDICATED ACCOUNT IS RECORDED, which is NOT a clean bill of health — this branch used to
       * fall through to `success` and rendered a GREEN chip from nothing measured. BR-501 requires
       * dedicated waqf account(s); an endowment with none on record has not satisfied it, and green
       * asserted that it had. Exactly the same shape as KPI 3's empty register above — "no account to
       * check" is not "no commingling", just as "nobody to verify" is not "everyone verified" — so it
       * takes the same tone, and both reasons are carried: what is missing AND what was checked.
       */
      commingling = {
        key: 'commingling',
        tone: 'warning',
        reasons: ['COMMINGLING_NO_ACCOUNTS_RECORDED', 'ACCOUNTS_CHECKED:0'],
      };
    } else {
      commingling = {
        key: 'commingling',
        tone: 'success',
        reasons: [`ACCOUNTS_CHECKED:${String(c.accountsChecked)}`],
      };
    }
  }

  let kyc: KpiChip;
  if (!input.kyc.ok) kyc = refused('kyc', input.kyc.refusal);
  else {
    const k = input.kyc.value.counts;
    const total = k.FRESH + k.STALE + k.UNVERIFIED;
    if (k.STALE > 0)
      kyc = { key: 'kyc', tone: 'danger', reasons: [`KYC_STALE:${String(k.STALE)}`] };
    else if (k.UNVERIFIED > 0)
      kyc = { key: 'kyc', tone: 'warning', reasons: [`KYC_UNVERIFIED:${String(k.UNVERIFIED)}`] };
    else if (total === 0) kyc = { key: 'kyc', tone: 'warning', reasons: ['KYC_NO_BENEFICIARIES'] };
    else kyc = { key: 'kyc', tone: 'success', reasons: [`KYC_FRESH:${String(k.FRESH)}`] };
  }

  let aml: KpiChip;
  if (!input.aml.ok) aml = refused('aml', input.aml.refusal);
  else {
    const a = input.aml.value;
    if (!a.assessable || a.missedReports === null)
      aml = { key: 'aml', tone: 'warning', reasons: [`AML_NOT_ASSESSABLE:${a.reason}`] };
    else if (a.missedReports) aml = { key: 'aml', tone: 'danger', reasons: ['AML_REPORT_MISSED'] };
    else aml = { key: 'aml', tone: 'success', reasons: ['AML_NONE_MISSED'] };
  }

  let licence: KpiChip;
  if (!input.deadlines.ok) licence = refused('licence', input.deadlines.refusal);
  else {
    const rule = input.deadlines.value.rules.find((r) => r.ruleKey === 'LICENSE_RENEWAL');
    if (rule === undefined)
      licence = { key: 'licence', tone: 'warning', reasons: ['LICENSE_RULE_ABSENT'] };
    else if (rule.rows.some((row) => row.state === 'overdue'))
      licence = { key: 'licence', tone: 'danger', reasons: ['LICENSE_RENEWAL:overdue'] };
    else if (
      rule.rows.length > 0 &&
      rule.rows.every(
        (row) =>
          row.state === 'met' ||
          row.state === 'pending' ||
          row.state === 'due_soon' ||
          row.state === 'at_risk' ||
          row.state === 'waived',
      )
    ) {
      licence = {
        key: 'licence',
        tone: 'success',
        reasons: rule.rows.map((row) => `LICENSE_RENEWAL:${row.state}`),
      };
    } else {
      // No row: the cause is the sentence (ROUTED_NO_HOME on 2026-09-02); a cannot_compute row is warning too.
      licence = {
        key: 'licence',
        tone: 'warning',
        reasons: [`LICENSE_RENEWAL:${rule.cause ?? 'cannot_compute'}`],
      };
    }
  }

  return [registration, commingling, kyc, aml, licence];
}

/** The worst tone across a set of chips — "danger dominates"; `refused` outranks `success`. */
export function dominantTone(chips: readonly { readonly tone: KpiTone }[]): KpiTone {
  let worst: KpiTone = 'success';
  for (const chip of chips) if (KPI_TONE_RANK[chip.tone] > KPI_TONE_RANK[worst]) worst = chip.tone;
  return worst;
}
