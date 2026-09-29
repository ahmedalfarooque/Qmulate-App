/**
 * `deadline` router — §09 Engine B's COMPUTE/PERSIST path (S9-3a).
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS ROUTER IS: THE ONE PLACE A STATUTORY DATE BECOMES A ROW
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * `computeRuleDeadline` (pure, S9-1) decides; migration 38 (S9-2) freezes what lands. This file
 * is the seam between them: it RESOLVES the configured windows (endowment tier over global,
 * `pickMostSpecific` — never a code default), ASSEMBLES the KSA calendar from the seeded
 * `holiday_calendar` rows + the `calendar.workweek` Setting, hands the domain the parsed
 * ENVELOPES so the ⚠ unverified marker travels into the stored row, and persists the §09 frozen
 * shape (`windowSnapshot` — the window AS APPLIED — plus both dual-date pairs).
 *
 * ── THE ANCHOR IS THE CALLER'S FACT, DELIBERATELY (S9-3a scope) ──────────────────────────────
 * §09's "clock starts on" column names facts this system does not yet derive: *which* recorded
 * date is "waqf documentation date", a licence's expiry, a hearing's schedule. In S9-3a the
 * anchor arrives as an explicit, audited input on a maker act — the caller states the fact and
 * the audit trail records who stated it. Auto-derivation (the GOV-REG-02 certificate sweep,
 * MaterialChange events, instantiation asking Engine B) is S9-3c's, where each derivation rule
 * is declared or routed rather than implied here. Nothing about a caller-supplied anchor is a
 * default: an absent anchor refuses; a wrong one is on the record under its maker's identity.
 *
 * ── THE CALENDAR'S COVERAGE IS THE ROWS', NEVER WIDER ────────────────────────────────────────
 * `seed/holidays.ts`'s own warning: a coverage window wider than the seeded rows silently
 * answers "no holiday" for years nobody attested. Coverage here is [min(date) … max(date)] of
 * the `holiday_calendar` rows; an EMPTY table refuses (`CALENDAR_UNAVAILABLE`, the domain's own
 * fail-closed posture) rather than treating every day as a business day.
 */

import { z } from 'zod';

import { recordEvent, type ExtendedPrismaClient } from '@qmulate/database';
import {
  COALESCE_IDENTITY_KEY,
  DEADLINE_RULES,
  DEADLINE_RULE_KEYS,
  ESCALATION_LEVEL_DB_VALUE,
  ESCALATION_ROLE_BY_LEVEL,
  DomainError,
  OBLIGATION_LIBRARY_VERSION,
  UPDATE_OBLIGATION_TEMPLATE_CODE,
  anchorDeclarationFor,
  anchorProvenanceOf,
  coalesceUpdateObligation,
  computeRuleDeadline,
  deriveAnchor,
  deriveBoardState,
  escalationIdempotencyKey,
  isDeadlineRuleKey,
  ladderFromTuple,
  planDeadlineEvaluation,
  reminderIdempotencyKey,
  resolveFiscalYearEndAnchor,
  selectAnchorChainHead,
  windowSnapshotOf,
  type AnchorCandidate,
  type AnchorProvenance,
  type AnchorSubject,
  type BoardCause,
  type CoalesceCause,
  type CoalesceDecision,
  type ComputedRuleDeadline,
  type EvaluatedDeadlineFacts,
  type EvaluatorConfig,
  type RuleSettingValues,
} from '@qmulate/domain';
// ⚠ IMPORTED FROM THE COMPLIANCE SUB-BARREL ON PURPOSE, not via the root: `mayDispatch` is the ONE
// question every outbound signal has to ask (§09 rules 1 and 5), and an explicit import path makes
// the seam visible in this file's import list rather than buried among thirty domain names.
import { mayDispatch } from '@qmulate/domain/compliance';
import {
  addBusinessDays,
  countBusinessDays,
  buildHolidayCalendar,
  civilDateFromUtcDate,
  dual,
  type CivilDate,
  type HolidayCalendar,
  type ObservedHoliday,
  type WorkingDayOverride,
} from '@qmulate/domain/dates';
import {
  isSettingKey,
  parseSetting,
  pickMostSpecific,
  type ScopedSettingCandidate,
  type SettingEnvelope,
  type SettingKey,
} from '@qmulate/domain/settings';

import { toActorContext } from '../context.js';
import {
  HIJRI_SNAPSHOT_PATTERN,
  assertHijriPairAgrees,
  derivedHijriSnapshot,
} from '../dual-date.js';
import { ApiError } from '../errors.js';
import { auditedWrite } from '../middleware/audit-projection.js';
import { endowmentScopedProcedure, makerProcedure, router } from '../trpc.js';

import type { ScopedContext } from '../middleware/scope.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Settings resolution — envelopes in, so the ⚠ marker travels
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

type Db = ExtendedPrismaClient;

/**
 * Resolve one registered key at (endowment → global), returning the PARSED envelope or
 * `undefined` when no tier has a row — the domain's `computeRuleDeadline` then refuses with a
 * message naming the rule AND the Setting row that should have supplied the figure, which is a
 * better refusal than this file could compose.
 */
async function resolveEnvelope<T>(
  db: Db,
  waqfId: string,
  key: string,
): Promise<SettingEnvelope<T> | undefined> {
  if (!isSettingKey(key)) {
    // A descriptor naming an unregistered key is a build defect, not a data condition — the
    // S9-1 tripwire test pins registration, so reaching this means the pin was ignored.
    throw new DomainError(
      'SETTING_MISSING',
      `deadline rule names unregistered Setting key ${key}.`,
      { details: { key } },
    );
  }
  const rows = await db.setting.findMany({
    where: { key, deletedAt: null, OR: [{ waqfId }, { waqfId: null }] },
    select: { waqfId: true, value: true },
  });
  if (rows.length === 0) return undefined;
  const candidates: ScopedSettingCandidate<unknown>[] = rows.map((row) => ({
    tier: row.waqfId === null ? ('global' as const) : ('endowment' as const),
    value: parseSetting(key as SettingKey, row.value),
  }));
  return pickMostSpecific(key, candidates) as SettingEnvelope<T>;
}

/** Assemble the rule's required envelopes per its descriptor — nothing extra, nothing guessed. */
async function resolveRuleSettings(
  db: Db,
  waqfId: string,
  ruleKey: string,
): Promise<RuleSettingValues> {
  if (!isDeadlineRuleKey(ruleKey)) return {}; // the domain refuses the key itself, by name
  const rule = DEADLINE_RULES[ruleKey];
  const values: {
    windowBusinessDays?: SettingEnvelope<number>;
    windowMonths?: SettingEnvelope<number>;
    monthAnchor?: SettingEnvelope<'day_of_month' | 'end_of_month'>;
    preExpiryLeadBd?: SettingEnvelope<number>;
  } = {};
  if (rule.windowSource === 'setting_business_days' && rule.windowSettingKey !== null) {
    values.windowBusinessDays = await resolveEnvelope(db, waqfId, rule.windowSettingKey);
  }
  if (rule.windowSource === 'setting_months' && rule.windowSettingKey !== null) {
    values.windowMonths = await resolveEnvelope(db, waqfId, rule.windowSettingKey);
    if (rule.monthAnchorSettingKey !== null) {
      values.monthAnchor = await resolveEnvelope(db, waqfId, rule.monthAnchorSettingKey);
    }
  }
  if (rule.leadSettingKey !== null) {
    values.preExpiryLeadBd = await resolveEnvelope(db, waqfId, rule.leadSettingKey);
  }
  return values;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Calendar assembly — the seeded rows, coverage never wider than them
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

async function assembleCalendar(db: Db, waqfId: string): Promise<HolidayCalendar> {
  const workweek = await resolveEnvelope<
    readonly ('SUN' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT')[]
  >(db, waqfId, 'calendar.workweek');
  if (workweek === undefined) {
    throw new DomainError(
      'SETTING_MISSING',
      'calendar.workweek has no Setting row at any tier — a business-day answer over an ' +
        'unconfigured workweek would be a guess.',
      { details: { settingKey: 'calendar.workweek' } },
    );
  }
  const rows = await db.holidayCalendar.findMany({
    select: { date: true, dateHijri: true, nameAr: true, nameEn: true, isWorkingDay: true },
    orderBy: { date: 'asc' },
  });
  const observed: ObservedHoliday[] = [];
  const workingDayOverrides: WorkingDayOverride[] = [];
  for (const row of rows) {
    const date = civilDateFromUtcDate(row.date);
    if (row.isWorkingDay) {
      workingDayOverrides.push({ date, isWorkingDay: true, reason: row.nameEn ?? row.nameAr });
    } else {
      observed.push({ date, nameAr: row.nameAr, nameEn: row.nameEn ?? row.nameAr });
    }
  }
  if (observed.length === 0) {
    // buildHolidayCalendar would refuse an empty set itself, but this message can say WHY the
    // posture is fail-closed where the domain's cannot know it is talking to a database.
    throw new DomainError(
      'CALENDAR_UNAVAILABLE',
      'holiday_calendar holds no holiday rows, so no business-day answer is authoritative — an ' +
        'empty holiday set silently treats every public holiday as a working day.',
    );
  }
  const first = observed[0]?.date;
  const last = observed[observed.length - 1]?.date;
  return buildHolidayCalendar({
    workweek: workweek.v,
    // Coverage is exactly the seeded rows' span — never wider (seed/holidays.ts's own warning).
    coverage: { from: String(first), to: String(last) },
    observed,
    workingDayOverrides,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * S9-3c · ANCHOR AUTO-DERIVATION — reading the DECLARED home, and nothing else
 *
 * `deadlines/anchors.ts` declares, per rule, WHICH model and column carry §09's "clock starts
 * on" fact. This section is the only place that reads them, and it is written so the query and
 * the declaration cannot drift: every reader states the field names it read, and
 * `deriveFromDeclaredHome` ASSERTS them against the declaration before the value is used. A
 * reader that starts pointing at a different column fails as a build defect rather than
 * producing a plausible date from the wrong fact.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** What a reader returns: the candidate, plus the columns it actually read. */
interface AnchorRead {
  readonly candidate: AnchorCandidate;
  readonly readDateField: string;
  readonly readHijriField: string;
  /** ⊕ S11-1 — the kind column read, or `null` where the arm declares none. Asserted like the others. */
  readonly readKindField: string | null;
}

/**
 * `Waqf.fiscalYearEnd` is an `MM-DD` string, so its arm needs a REFERENCE DATE to resolve
 * against — the one declared reading in the whole table (`FISCAL_YEAR_END_READING`). Every other
 * arm reads a stored date directly and ignores this.
 */
async function readDeclaredAnchor(
  db: Db,
  waqfId: string,
  ruleKey: string,
  subject: AnchorSubject,
  subjectId: string | null,
  reference: CivilDate | null,
): Promise<AnchorRead> {
  if (subject === 'waqf') {
    const waqf = await db.waqf.findFirst({
      where: { id: waqfId, deletedAt: null },
      select: {
        certificateExpiry: true,
        certificateExpiryHijri: true,
        fiscalYearEnd: true,
        registrationAnchorDate: true,
        registrationAnchorDateHijri: true,
        registrationAnchorKind: true,
      },
    });
    if (waqf === null) {
      throw new ApiError('NO_GRANT', 'the endowment is not readable.', { waqfId });
    }
    if (ruleKey === 'REGISTER_30BD') {
      // ⊕ S11-1 — RECORDED OPERATOR INPUT with its DECLARED KIND (migration 48). ⚠ NOT
      // `registrationDate`: that column is the registration ITSELF and is deliberately not selected
      // here, so this reader cannot be edited into counting from it by accident.
      return {
        candidate: {
          subject: 'waqf',
          date:
            waqf.registrationAnchorDate === null
              ? null
              : civilDateFromUtcDate(waqf.registrationAnchorDate),
          hijri: waqf.registrationAnchorDateHijri,
          declaredKind:
            waqf.registrationAnchorKind === null ? null : String(waqf.registrationAnchorKind),
          sourceId: waqfId,
        },
        readDateField: 'registrationAnchorDate',
        readHijriField: 'registrationAnchorDateHijri',
        readKindField: 'registrationAnchorKind',
      };
    }
    if (ruleKey === 'DISTRIBUTE_3M_FYE') {
      if (reference === null) {
        throw new ApiError(
          'GATE_NOT_CLEARED',
          "DISTRIBUTE_3M_FYE's anchor is derived from Waqf.fiscalYearEnd, which is a recurring " +
            'MM-DD and not a date. Resolving it needs a STATED reference date (`asOf`): the ' +
            'reading is the most recently ENDED fiscal-year end at or before it. The reference ' +
            'is never read from the clock — the same endowment asked on two days must be allowed ' +
            'to give two answers, and a clock read cannot be pinned by a test vector.',
          { waqfId, ruleKey, reason: 'AS_OF_REQUIRED' },
        );
      }
      const resolved = resolveFiscalYearEndAnchor(waqf.fiscalYearEnd, reference);
      // The Gregorian half is DERIVED here, so there is no stored twin to preserve: deriving the
      // Hijri half at write is what every other computed date in the system does.
      return {
        candidate: {
          subject: 'waqf',
          date: resolved,
          hijri: dual(resolved).hijri,
          declaredKind: null,
          sourceId: waqfId,
        },
        readDateField: 'fiscalYearEnd',
        readHijriField: '<derived at write from the resolved date>',
        readKindField: null,
      };
    }
    return {
      candidate: {
        subject: 'waqf',
        date: waqf.certificateExpiry === null ? null : civilDateFromUtcDate(waqf.certificateExpiry),
        hijri: waqf.certificateExpiryHijri,
        declaredKind: null,
        sourceId: waqfId,
      },
      readDateField: 'certificateExpiry',
      readHijriField: 'certificateExpiryHijri',
      readKindField: null,
    };
  }

  if (subjectId === null) {
    throw new ApiError(
      'GATE_NOT_CLEARED',
      `subject '${subject}' names a row, so subjectId is required — the anchor is a fact about ` +
        'that row, not about the endowment.',
      { waqfId, reason: 'SUBJECT_ID_REQUIRED' },
    );
  }

  // ⚠ EVERY read below is scoped by `waqfId` AS WELL AS by id. §10 §7.2's non-disclosure shape:
  // another endowment's row id must read exactly like a nonexistent one, and an anchor is a
  // statutory fact — reading one across the endowment boundary would compute this endowment's
  // deadline from another family's record.
  if (subject === 'beneficiary') {
    const row = await db.beneficiary.findFirst({
      where: { id: subjectId, waqfId, deletedAt: null },
      select: { kycLastRefreshed: true, kycLastRefreshedHijri: true },
    });
    if (row === null) throw notOnThisEndowment('beneficiary', waqfId);
    return {
      candidate: {
        subject,
        date: row.kycLastRefreshed === null ? null : civilDateFromUtcDate(row.kycLastRefreshed),
        hijri: row.kycLastRefreshedHijri,
        declaredKind: null,
        sourceId: subjectId,
      },
      readDateField: 'kycLastRefreshed',
      readHijriField: 'kycLastRefreshedHijri',
      readKindField: null,
    };
  }
  if (subject === 'lease') {
    const row = await db.lease.findFirst({
      where: { id: subjectId, waqfId, deletedAt: null },
      select: { endDate: true, endDateHijri: true },
    });
    if (row === null) throw notOnThisEndowment('lease', waqfId);
    return {
      candidate: {
        subject,
        date: civilDateFromUtcDate(row.endDate),
        hijri: row.endDateHijri,
        declaredKind: null,
        sourceId: subjectId,
      },
      readDateField: 'endDate',
      readHijriField: 'endDateHijri',
      readKindField: null,
    };
  }
  if (subject === 'legal_case') {
    const row = await db.legalCase.findFirst({
      where: { id: subjectId, waqfId, deletedAt: null },
      select: { nextHearing: true, nextHearingHijri: true },
    });
    if (row === null) throw notOnThisEndowment('legal case', waqfId);
    return {
      candidate: {
        subject,
        date: row.nextHearing === null ? null : civilDateFromUtcDate(row.nextHearing),
        hijri: row.nextHearingHijri,
        declaredKind: null,
        sourceId: subjectId,
      },
      readDateField: 'nextHearing',
      readHijriField: 'nextHearingHijri',
      readKindField: null,
    };
  }
  if (subject === 'expropriation') {
    // ⊕ S11-1 — `ISTIBDAL_10BD`'s home (migration 48). The completion date is a fact about THIS
    // taking's substitution, so it is read off the expropriation row, scoped by `waqfId` as well as
    // by id like every row subject above. ⚠ `announcedDate` and `authorityNotifiedDate` are
    // deliberately NOT selected: the first is the taking's announcement and the second is the duty's
    // DISCHARGE, and a reader that could see them could be edited into counting from them.
    const row = await db.expropriation.findFirst({
      where: { id: subjectId, waqfId, deletedAt: null },
      select: { istibdalCompletedDate: true, istibdalCompletedDateHijri: true },
    });
    if (row === null) throw notOnThisEndowment('expropriation', waqfId);
    return {
      candidate: {
        subject,
        date:
          row.istibdalCompletedDate === null
            ? null
            : civilDateFromUtcDate(row.istibdalCompletedDate),
        hijri: row.istibdalCompletedDateHijri,
        declaredKind: null,
        sourceId: subjectId,
      },
      readDateField: 'istibdalCompletedDate',
      readHijriField: 'istibdalCompletedDateHijri',
      readKindField: null,
    };
  }

  // `material_change` is reachable only through the trigger path below, which holds the row it
  // just recorded — never through the generic derive procedure, where a caller could point a
  // rule at some other endowment's change.
  throw new ApiError(
    'GATE_NOT_CLEARED',
    `subject '${String(subject)}' is not readable through the derive path.`,
    { waqfId, reason: 'SUBJECT_NOT_DERIVABLE_HERE' },
  );
}

function notOnThisEndowment(what: string, waqfId: string): ApiError {
  return new ApiError('NO_GRANT', `subjectId does not name a ${what} on this endowment.`, {
    waqfId,
  });
}

/**
 * Read the declared home, ASSERT the query matched the declaration, then let the domain derive
 * or refuse. The assertion is the anti-drift control: `anchors.ts` is the declaration, this file
 * is the query, and nothing else compares them at runtime.
 */
async function deriveFromDeclaredHome(
  db: Db,
  waqfId: string,
  ruleKey: string,
  subject: AnchorSubject,
  subjectId: string | null,
  reference: CivilDate | null,
): Promise<{
  anchor: CivilDate;
  anchorHijri: string;
  anchorKind: string | null;
  sourceId: string;
  semantics: string;
}> {
  // Refuses a routed rule (`LICENSE_RENEWAL` — the one left since S11-1) and an unknown key BEFORE
  // any query runs — a routed rule has no home to read.
  const declaration = anchorDeclarationFor(ruleKey);
  if (declaration.routing !== null) {
    // Let the domain compose the refusal (it owns the remedy text and the discriminator).
    deriveAnchor(ruleKey, {
      subject,
      date: null,
      hijri: null,
      declaredKind: null,
      sourceId: subjectId ?? waqfId,
    });
  }

  const read = await readDeclaredAnchor(db, waqfId, ruleKey, subject, subjectId, reference);
  const declared = declaration.sources.find((arm) => arm.subject === subject);
  if (
    declared !== undefined &&
    (declared.dateField !== read.readDateField ||
      declared.hijriField !== read.readHijriField ||
      declared.kindField !== read.readKindField)
  ) {
    throw new DomainError(
      'DEADLINE_ANCHOR_NOT_DERIVABLE',
      `build defect: ${ruleKey}'s declaration names ${declared.model}.${declared.dateField} / ` +
        `${declared.hijriField} / kind ${declared.kindField ?? '<none>'}, but this router read ` +
        `${read.readDateField} / ${read.readHijriField} / kind ${read.readKindField ?? '<none>'}. ` +
        'The declaration is the contract; a query that drifts from it computes a statutory date ' +
        'from a different fact than the one the record claims.',
      { details: { refusal: 'ANCHOR_HAS_NO_RECORDED_HOME', ruleKey } },
    );
  }

  const derived = deriveAnchor(ruleKey, read.candidate);
  return {
    anchor: derived.anchor,
    anchorHijri: derived.anchorHijri,
    anchorKind: derived.anchorKind,
    sourceId: derived.sourceId,
    semantics: derived.source.semantics,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * S9-3c · THE ONE PERSIST PATH
 *
 * S9-3a's `compute` built the row inline. Three more paths now write `Deadline` rows (the derive
 * path, the material-change trigger, the certificate sweep), and four inline copies of migration
 * 38's provenance shape would be four chances to omit `windowSnapshot` — which the database
 * refuses, but only after the caller has already decided what to store. One builder instead.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/*
 * ⊕ S11-1 — WHERE the anchor came from is frozen INTO the row's snapshot as `anchorSource`
 * (`AnchorProvenance`, declared in `@qmulate/domain`'s anchors module with the chain selector that
 * reads it back). `Deadline` has no source-id column and no unique on `(waqfId, ruleKey)`: two
 * `ISTIBDAL_10BD` rows for one endowment (two takings) genuinely coexist, so "the newest row for THIS
 * expropriation" is unidentifiable from the columns alone — and §09's correction path
 * (`recomputedFromId`, UNIQUE, a CHAIN) needs exactly that head. `windowSnapshot` is JSONB, refused
 * NULL at INSERT and frozen against UPDATE by migration 38, so provenance inside it is frozen for free.
 * ⚠ THE COST is declared in the domain module's §6 header: no index, no FK, no unique — "one head per
 * source" is enforced by code, and a real `anchorSourceId` column is DECLARED OWED.
 */

// The window AS APPLIED — demanded on every engine-era INSERT by `deadline_insert_provenance` — is
// built by `@qmulate/domain`'s `windowSnapshotOf` since S11-1: the SEED is now a second writer of
// `Deadline` rows, and two copies of the key list would agree only until one changed.

interface DeadlineRowInput {
  readonly waqfId: string;
  readonly complianceTaskId: string | null;
  readonly computed: ComputedRuleDeadline;
  readonly settings: RuleSettingValues;
  readonly anchorAt: Date;
  readonly anchorHijri: string;
  readonly createdBy: string | null;
  /** §09's ONLY correction path — set when this row supersedes an earlier one. */
  readonly recomputedFromId: string | null;
  /** ⊕ S11-1 — the declared home the anchor was read from, or `null` where none is named. */
  readonly anchorSource: AnchorProvenance | null;
}

function deadlineCreateData(input: DeadlineRowInput): Record<string, unknown> {
  const { computed } = input;
  return {
    waqfId: input.waqfId,
    complianceTaskId: input.complianceTaskId,
    ruleKey: computed.ruleKey,
    anchorDate: input.anchorAt,
    anchorDateHijri: input.anchorHijri,
    dueDate: new Date(`${computed.computed.due.gregorian}T00:00:00.000Z`),
    dueDateHijri: computed.computed.due.hijri,
    actionableDate:
      computed.actionable === null
        ? null
        : new Date(`${computed.actionable.gregorian}T00:00:00.000Z`),
    actionableDateHijri: computed.actionable?.hijri ?? null,
    windowSnapshot: windowSnapshotOf(computed, input.settings, input.anchorSource),
    businessDaysUsed: computed.computed.window.businessDays ?? null,
    recomputedFromId: input.recomputedFromId,
    createdBy: input.createdBy,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * S9-3c · THE GOV-REG-02 TRIGGERS AND THE CHANGE-SET
 *
 * §09 gives this duty TWO triggers (a certificate expiry the daily sweep notices, and a
 * `MaterialChange` another module emits) and ONE coalescing rule that binds them into a single
 * open obligation per endowment. `coalesceUpdateObligation` (pure) decides; this section reads
 * the state it decides over and writes what it decided.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The open `GOV-REG-02` task and its CHAIN-HEAD deadline (the row nothing supersedes). */
async function readOpenUpdateObligation(
  db: Db,
  waqfId: string,
): Promise<{ taskId: string; headDeadlineId: string | null; headAnchor: CivilDate | null } | null> {
  const task = await db.complianceTask.findFirst({
    where: {
      waqfId,
      templateCode: UPDATE_OBLIGATION_TEMPLATE_CODE,
      status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      deletedAt: null,
    },
    select: { id: true },
  });
  if (task === null) return null;

  // The CHAIN HEAD: bound to this task, and superseded by nothing. `recomputedFromId` is UNIQUE,
  // so "no row names me as its predecessor" identifies the head uniquely.
  const bound = await db.deadline.findMany({
    where: { waqfId, complianceTaskId: task.id, deletedAt: null },
    select: { id: true, anchorDate: true, recomputedTo: { select: { id: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const heads = bound.filter((row) => row.recomputedTo === null);
  const head = heads[heads.length - 1];
  return {
    taskId: task.id,
    headDeadlineId: head?.id ?? null,
    headAnchor: head === undefined ? null : civilDateFromUtcDate(head.anchorDate),
  };
}

/** This endowment's UN-FILED change-set members — §09's "earliest un-filed" is a query. */
async function readUnfiledChanges(
  db: Db,
  waqfId: string,
): Promise<{ id: string; effectiveDate: CivilDate; kind: string }[]> {
  const rows = await db.materialChange.findMany({
    where: { waqfId, filedAt: null, deletedAt: null },
    select: { id: true, effectiveDate: true, kind: true },
    orderBy: { effectiveDate: 'asc' },
  });
  return rows.map((row) => ({
    id: row.id,
    effectiveDate: civilDateFromUtcDate(row.effectiveDate),
    kind: String(row.kind),
  }));
}

/** §10 §7.2's non-disclosure shape: another endowment's task id reads exactly like a missing one. */
async function assertTaskOnEndowment(db: Db, waqfId: string, taskId: string): Promise<void> {
  const task = await db.complianceTask.findFirst({
    where: { id: taskId, waqfId },
    select: { id: true },
  });
  if (task === null) {
    throw new ApiError('NO_GRANT', 'complianceTaskId does not name a task on this endowment.', {
      waqfId,
    });
  }
}

interface ApplyArgs {
  readonly decision: CoalesceDecision;
  readonly calendar: HolidayCalendar;
  readonly settings: RuleSettingValues;
  readonly procedure: string;
  readonly triggerEvent: string;
  /**
   * The change to RECORD, born already bound to whichever duty the decision names — or `null` on
   * the certificate arm, which records no change.
   *
   * ⚠ WHY THIS IS A PENDING ROW AND NOT AN ID TO BIND AFTERWARDS, measured. The first draft created
   * the change, coalesced, then UPDATEd it with the task id. The scoping extension refused that
   * update — `ForbiddenScopeError: no MaterialChange matching that key is within the caller's
   * scope — the row is absent or belongs to another endowment` — because its update-by-id
   * pre-check cannot see a row created in the SAME uncommitted transaction. The fix is not a
   * looser check: it is that a change-set member should be born bound, so the "recorded but not
   * yet bound" state exists only where it genuinely must (a caller that never coalesces at all),
   * and the migration-40 write-once guard never has to permit a NULL -> value re-point on the
   * happy path.
   */
  readonly pendingChange: PendingMaterialChange | null;
  /** The certificate arm's frozen Hijri twin, when the certificate arm may win the `min`. */
  readonly certificateAnchorHijri?: string;
}

/** A material change decided upon but not yet written — see {@link ApplyArgs.pendingChange}. */
interface PendingMaterialChange {
  /** The placeholder the coalescer saw, so the decision's `governingCause` can be recognised. */
  readonly placeholderId: string;
  readonly kind: 'ASSET' | 'BENEFICIARY' | 'NAZARAH';
  readonly effectiveAt: Date;
  readonly effectiveDateHijri: string;
  readonly sourceRef: string;
}

/**
 * The GOVERNING ANCHOR's frozen Hijri twin — read from the winning cause's own row, never
 * re-derived. §09 freezes both halves together at the moment a fact is recorded; a change's
 * `effectiveDateHijri` is that frozen half, and re-converting it here would substitute today's
 * tables for the ones in force when the change was recorded.
 */
async function governingAnchorHijri(
  tx: Db,
  cause: CoalesceCause,
  certificateAnchorHijri: string | undefined,
  pending: PendingMaterialChange | null,
): Promise<string> {
  if (pending !== null && cause.changeId === pending.placeholderId) {
    // The winning cause is the change we are about to write: its frozen twin is the one the caller
    // stated and `assertHijriPairAgrees` already validated, not something to read back.
    return pending.effectiveDateHijri;
  }
  if (cause.kind === 'certificate_expiry') {
    if (certificateAnchorHijri === undefined) {
      // Unreachable through the shipped callers (only the sweep passes a certificate anchor, and
      // it always passes the twin with it). Kept as a refusal rather than a `?? ''` so a future
      // caller cannot store half a frozen pair.
      throw new DomainError(
        'DEADLINE_ANCHOR_NOT_DERIVABLE',
        'the certificate arm won the coalescing min but its frozen Hijri twin was not supplied.',
        { details: { refusal: 'ANCHOR_SOURCE_VALUE_ABSENT', ruleKey: 'UPDATE_15BD' } },
      );
    }
    return certificateAnchorHijri;
  }
  const row = await tx.materialChange.findFirst({
    where: { id: cause.changeId ?? '' },
    select: { effectiveDateHijri: true },
  });
  if (row === null) {
    throw new DomainError(
      'DEADLINE_STATE_INCOHERENT',
      'the coalescer named a governing change that is no longer readable.',
      { details: { refusal: 'OPEN_OBLIGATION_ANCHOR_INCOHERENT', changeId: cause.changeId } },
    );
  }
  return row.effectiveDateHijri;
}

/**
 * Write what the coalescer decided — and ONLY what it decided.
 *
 * Every branch that produces a date does so through `computeRuleDeadline` at the GOVERNING anchor
 * the coalescer named, so this function never picks a date and can never disagree with the pure
 * layer about which change won. `APPEND_AND_TIGHTEN` writes a NEW row linking `recomputedFromId`
 * — §09's only correction path — because migration 38 makes moving a computed date impossible at
 * rest, and it should be: a date that has been displayed and possibly filed must not shift.
 */
async function applyCoalesceDecision(
  tx: Db,
  ctx: { db: Db; waqfId: string; actor: { actorId: string | null } },
  args: ApplyArgs,
): Promise<{
  action: CoalesceDecision['action'];
  taskId: string;
  deadlineId: string | null;
  supersededDeadlineId: string | null;
  materialChangeId: string | null;
  governingAnchor: string;
  governingCause: CoalesceCause;
  unverifiedNote: string | null;
}> {
  const { decision } = args;
  const anchorHijri = await governingAnchorHijri(
    tx,
    decision.governingCause,
    args.certificateAnchorHijri,
    args.pendingChange,
  );
  const anchorAt = new Date(`${String(decision.governingAnchor)}T00:00:00.000Z`);

  let taskId: string;
  if (decision.action === 'RAISE') {
    // The CANONICAL library row for this version — never a `SEED-` placeholder, and never a row
    // at another version (S8-Q5: the snapshot columns carry the duty's identity).
    const obligation = await tx.complianceObligation.findFirst({
      where: {
        code: UPDATE_OBLIGATION_TEMPLATE_CODE,
        libraryVersion: OBLIGATION_LIBRARY_VERSION,
        deletedAt: null,
      },
      select: { id: true, confidentiality: true },
    });
    if (obligation === null) {
      throw new ApiError(
        'GATE_NOT_CLEARED',
        `the canonical obligation ${UPDATE_OBLIGATION_TEMPLATE_CODE} at library version ` +
          `${OBLIGATION_LIBRARY_VERSION} is not in the database, so the trigger has no duty to ` +
          'raise. Seed the library first — raising a task against a placeholder would attach a ' +
          'statutory duty to a row nobody published.',
        { waqfId: ctx.waqfId, reason: 'CANONICAL_TEMPLATE_ABSENT' },
      );
    }
    const waqf = await tx.waqf.findFirst({
      where: { id: ctx.waqfId, deletedAt: null },
      select: { classification: true },
    });
    if (waqf === null) {
      throw new ApiError('NO_GRANT', 'the endowment is not readable.', { waqfId: ctx.waqfId });
    }
    // ⚠ A DECLARED READING: the duty is raised whatever the recorded classification is, INCLUDING
    // `NOT_CLASSIFIED`. GOV-REG-02's gate is `ALL`, so no gate excludes it — and the statutory
    // duty to update Authority data within 15 business days of a material change exists whether or
    // not QMULATE has generated this endowment's register yet. Declining to record it because
    // setup has not run would be the system quietly not tracking a real obligation.
    const created = await tx.complianceTask.create({
      data: {
        waqfId: ctx.waqfId,
        obligationId: obligation.id,
        templateCode: UPDATE_OBLIGATION_TEMPLATE_CODE,
        templateVersion: OBLIGATION_LIBRARY_VERSION,
        confidentiality: obligation.confidentiality as never,
        status: 'NOT_STARTED' as never,
        classificationAtInstantiation: waqf.classification as never,
        instantiatedReason: 'EVENT_TRIGGER' as never,
        createdBy: ctx.actor.actorId,
      },
      select: { id: true },
    });
    taskId = created.id;
  } else {
    taskId = decision.taskId;
  }

  let deadlineId: string | null = null;
  let supersededDeadlineId: string | null = null;
  let unverifiedNote: string | null = null;

  if (decision.action !== 'APPEND') {
    const computed = computeRuleDeadline({
      ruleKey: 'UPDATE_15BD',
      anchor: decision.governingAnchor,
      calendar: args.calendar,
      settings: args.settings,
    });
    unverifiedNote = computed.computed.unverifiedNote;
    supersededDeadlineId =
      decision.action === 'APPEND_AND_TIGHTEN' ? decision.supersedesDeadlineId : null;
    const row = await tx.deadline.create({
      data: deadlineCreateData({
        waqfId: ctx.waqfId,
        complianceTaskId: taskId,
        computed,
        settings: args.settings,
        anchorAt,
        anchorHijri,
        createdBy: ctx.actor.actorId,
        recomputedFromId: supersededDeadlineId,
        // The coalescing path's provenance is the governing CAUSE, recorded in its own audit event
        // below; it names no declared home and takes no part in an anchor chain.
        anchorSource: null,
      }) as never,
      select: { id: true },
    });
    deadlineId = row.id;
  }

  // Record the change BORN BOUND to the duty it was coalesced into. No update, so the
  // write-once guard's NULL -> value allowance is never needed on this path — see
  // `ApplyArgs.pendingChange` for the measurement that produced this shape.
  let materialChangeId: string | null = null;
  if (args.pendingChange !== null) {
    const created = await tx.materialChange.create({
      data: {
        waqfId: ctx.waqfId,
        kind: args.pendingChange.kind as never,
        effectiveDate: args.pendingChange.effectiveAt,
        effectiveDateHijri: args.pendingChange.effectiveDateHijri,
        sourceRef: args.pendingChange.sourceRef,
        complianceTaskId: taskId,
        createdBy: ctx.actor.actorId,
      },
      select: { id: true },
    });
    materialChangeId = created.id;
  }

  await recordEvent(toActorContext(ctx as never, { procedure: args.procedure }), {
    action: decision.action === 'RAISE' ? 'CREATE' : 'UPDATE',
    category: 'MUTATION',
    classification: 'ROUTINE',
    entityType: 'ComplianceTask',
    entityId: taskId,
    waqfId: ctx.waqfId,
    extraContext: {
      triggerEvent: args.triggerEvent,
      templateCode: UPDATE_OBLIGATION_TEMPLATE_CODE,
      coalesceAction: decision.action,
      coalesceIdentityKey: COALESCE_IDENTITY_KEY,
      governingAnchor: String(decision.governingAnchor),
      governingCauseKind: decision.governingCause.kind,
      governingChangeId: decision.governingCause.changeId,
      deadlineId,
      supersededDeadlineId,
      materialChangeId,
      unverified: unverifiedNote !== null,
    },
  });

  return {
    action: decision.action,
    taskId,
    deadlineId,
    supersededDeadlineId,
    materialChangeId,
    governingAnchor: String(decision.governingAnchor),
    governingCause: decision.governingCause,
    unverifiedNote,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * S9-3d · THE EVALUATOR'S READS
 *
 * Three of them, and each exists because the alternative was a guess: the ladder config (refused
 * when absent, never defaulted), the DISPATCH SUBJECT's own classification (read off the row, never
 * derived), and the rung's recipients (grant holders on THIS endowment, never role holders
 * globally).
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The evaluator's configuration, all four figures, each refusing rather than defaulting. */
async function resolveEvaluatorConfig(db: Db, waqfId: string): Promise<EvaluatorConfig> {
  const offsets = await resolveEnvelope<readonly number[]>(
    db,
    waqfId,
    'deadline.preAlertOffsetsBd',
  );
  const atRisk = await resolveEnvelope<number>(db, waqfId, 'deadline.atRiskThresholdBd');
  const ordinary = await resolveEnvelope<readonly number[]>(
    db,
    waqfId,
    'deadline.escalationLadderBd',
  );
  const fast = await resolveEnvelope<readonly number[]>(
    db,
    waqfId,
    'deadline.escalationLadderZeroToleranceBd',
  );
  const missing = [
    offsets === undefined ? 'deadline.preAlertOffsetsBd' : null,
    atRisk === undefined ? 'deadline.atRiskThresholdBd' : null,
    ordinary === undefined ? 'deadline.escalationLadderBd' : null,
    fast === undefined ? 'deadline.escalationLadderZeroToleranceBd' : null,
  ].filter((key): key is string => key !== null);
  if (missing.length > 0) {
    // ⚠ ALL FOUR ARE REQUIRED AND NONE HAS A CODE DEFAULT. A missing at-risk threshold would make
    // every deadline look `pending` until the day it is overdue; a missing ladder would silently
    // escalate nothing. Both are failures that LOOK like a quiet system, which is the worst shape a
    // compliance alerting failure can take — so the run refuses and names the rows.
    throw new DomainError(
      'SETTING_MISSING',
      `the daily evaluator needs ${missing.join(', ')} and no tier supplies them. An absent ` +
        'threshold or ladder does not degrade to "no alerts" — it degrades to a system that looks ' +
        'quiet while obligations go overdue, so the run refuses instead.',
      { details: { settingKeys: missing } },
    );
  }
  return {
    // Non-null: the refusal above covers every one.
    preAlertOffsetsBd: (offsets as SettingEnvelope<readonly number[]>).v,
    atRiskThresholdBd: (atRisk as SettingEnvelope<number>).v,
    ladders: {
      ordinary: ladderFromTuple((ordinary as SettingEnvelope<readonly number[]>).v),
      zeroTolerance: ladderFromTuple((fast as SettingEnvelope<readonly number[]>).v),
    },
  };
}

/**
 * The DISPATCH SUBJECT's classification — read off the bound `ComplianceTask` and its obligation,
 * as STRINGS, and handed to `mayDispatch` untouched.
 *
 * ⚠ WHY THE STRICTER OF THE TWO WINS. The task carries its OWN `confidentiality` (S8-Q1: a row whose
 * visibility depends on a join is one `include` away from being readable), and the obligation
 * carries the template's. They should agree — the instantiation path copies one to the other — but
 * "should agree" is not a control, and if they ever disagree the safe reading is the restricted one.
 * So both are read and the stricter is used.
 *
 * ⚠ AND AN UNBOUND DEADLINE IS TREATED AS UNCLASSIFIABLE, NOT AS ORDINARY. A deadline with no
 * `complianceTaskId` has no subject row to classify, and `mayDispatch` fails closed on an
 * unrecognised confidentiality — which is the correct answer: a signal about a duty nobody can
 * classify must not go out because the classification lookup came back empty. Returning `'NORMAL'`
 * here would have been the single most dangerous line in this file.
 */
async function readDispatchSubject(
  db: Db,
  complianceTaskId: string | null,
): Promise<{ confidentiality: string; auditClassification: string }> {
  if (complianceTaskId === null) {
    return { confidentiality: '<unbound: no subject row>', auditClassification: 'ROUTINE' };
  }
  const task = await db.complianceTask.findFirst({
    where: { id: complianceTaskId },
    select: { confidentiality: true, obligation: { select: { confidentiality: true } } },
  });
  if (task === null) {
    return { confidentiality: '<unreadable subject row>', auditClassification: 'ROUTINE' };
  }
  const own = String(task.confidentiality);
  const template = String(task.obligation.confidentiality);
  const stricter =
    own === 'AML_RESTRICTED' || template === 'AML_RESTRICTED'
      ? 'AML_RESTRICTED'
      : own === 'SENSITIVE_PII' || template === 'SENSITIVE_PII'
        ? 'SENSITIVE_PII'
        : own;
  return {
    confidentiality: stricter,
    // The deadline plane carries no audit classification of its own; an AML-attributable signal is
    // caught by the confidentiality arm above, and `RESTRICTED` is passed through where a caller
    // has one. Kept as an explicit ROUTINE rather than omitted, because `mayDispatch` fails closed
    // on an unrecognised value and an omitted one would refuse every ordinary reminder.
    auditClassification: 'ROUTINE',
  };
}

/**
 * The users holding one of `roles` as an ACTIVE grant on THIS endowment.
 *
 * ⚠ Grant holders, not role holders: a Nazir of endowment A must never be told that endowment B's
 * registration is overdue. This is the same access-matrix answer every read goes through, asked in
 * the one direction the notifier needs.
 */
async function recipientsForRoles(
  db: Db,
  waqfId: string,
  roles: readonly string[],
): Promise<string[]> {
  const grants = await db.waqfAccessGrant.findMany({
    where: { waqfId, role: { in: roles as never }, revokedAt: null, deletedAt: null },
    select: { userId: true },
  });
  return [...new Set(grants.map((grant) => grant.userId))].sort();
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Wire shapes
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const DEADLINE_SELECT = {
  id: true,
  waqfId: true,
  complianceTaskId: true,
  ruleKey: true,
  anchorDate: true,
  anchorDateHijri: true,
  dueDate: true,
  dueDateHijri: true,
  actionableDate: true,
  actionableDateHijri: true,
  windowSnapshot: true,
  satisfiedAt: true,
  // ⊕ S11-2 — HOW the duty was discharged (`MET`), beside its met fact. Never a status; state is derived.
  dischargeKind: true,
  waivedAt: true,
  escalatedAt: true,
  recomputedFromId: true,
  createdAt: true,
} as const;

export const deadlineRouter = router({
  /** The endowment's computed deadlines, soonest due first. */
  list: endowmentScopedProcedure('compliance:task:read').query(async ({ ctx }) => {
    const rows = await ctx.db.deadline.findMany({
      where: { waqfId: ctx.waqfId, deletedAt: null },
      select: DEADLINE_SELECT,
      orderBy: { dueDate: 'asc' },
    });
    // ⊕ S11-2 — the met date's Hijri twin, DERIVED on read by the one implementation (ADR-0007) from
    // the frozen Gregorian. The twin FROZEN at discharge lives in the audit event (`dischargedOnHijri`)
    // and on the bound task's `closeDateHijri`; a `satisfiedAtHijri` column is DECLARED OWED (S11-2).
    return {
      deadlines: rows.map((row) => ({
        ...row,
        satisfiedAtHijri:
          row.satisfiedAt === null ? null : derivedHijriSnapshot(row.satisfiedAt, 'satisfiedAt'),
      })),
    };
  }),

  /**
   * ⊕ S11 item 2a — THE COMPLIANCE BOARD'S READ: every live deadline of one endowment with its state
   * DERIVED NOW, and — for every rule with no row — the CAUSE, named.
   *
   * §14: "KPI evaluation is an engine call, not a stored flag" and "cannot compute ⇒ KPI 1 renders
   * `warning` (indeterminate ≠ green), never silently `success`". So this procedure derives at read
   * time through the domain's `deriveDeadlineState` at the request's stated clock (`ctx.now`) — no
   * status column exists (§09: state is derived, not stored) — and it never returns a bare list: a
   * rule with no row says WHY (`NOT_RECORDED` · `RECORDED_NOT_COMPUTABLE` · `ROUTED_NO_HOME` ·
   * `NOT_COMPUTED` · `NOT_IN_SCOPE_YET` · `NO_SUBJECT`), so a screen can say "not recorded" instead
   * of "nothing due". A calendar that cannot span today (or a missing evaluator setting) does not
   * throw: every row becomes `cannot_compute` with the refusal code, and KPI 1 goes `warning`.
   *
   * HEADS ONLY: a row another live row supersedes (`recomputedFromId`) is frozen history, not a duty.
   *
   * KPI 1 (on-time Authority registration & updates — the zero-tolerance trio REGISTER_30BD ·
   * UPDATE_15BD · ISTIBDAL_10BD): `danger` iff a head is `overdue` and neither met nor waived;
   * `warning` iff any head cannot compute or is `at_risk`/`due_soon`, or any of the three rules is
   * indeterminate by cause; `success` ONLY when every clock is computed and none is overdue. There
   * is no override to green. `LICENSE_RENEWAL` (routed) is KPI 5's, not KPI 1's.
   *
   * Amounts: none. Dates: dual (the met date's twin DERIVED on read — ADR-0007's one implementation;
   * the frozen twin is in the discharge event). Window lengths ⚠ unverified — the note travels.
   */
  board: endowmentScopedProcedure('compliance:task:read').query(async ({ ctx }) => {
    const today = civilDateFromUtcDate(ctx.now);

    let calendar: HolidayCalendar | null = null;
    let calendarRefusal: string | null = null;
    try {
      calendar = await assembleCalendar(ctx.db, ctx.waqfId);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      calendarRefusal = error.code;
    }
    let config: EvaluatorConfig | null = null;
    let settingsRefusal: string | null = null;
    if (calendar !== null) {
      try {
        config = await resolveEvaluatorConfig(ctx.db, ctx.waqfId);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        settingsRefusal = error.code;
      }
    }
    const cannotComputeAll = calendarRefusal ?? settingsRefusal;

    const [rows, waqf, pendingIstibdal, lead] = await Promise.all([
      ctx.db.deadline.findMany({
        where: { waqfId: ctx.waqfId, deletedAt: null },
        select: DEADLINE_SELECT,
        orderBy: { dueDate: 'asc' },
      }),
      ctx.db.waqf.findFirst({
        where: { id: ctx.waqfId, deletedAt: null },
        select: {
          registrationAnchorDate: true,
          certificateExpiry: true,
          fiscalYearEnd: true,
          classification: true,
        },
      }),
      ctx.db.expropriation.count({
        where: { waqfId: ctx.waqfId, deletedAt: null, istibdalCompletedDate: null },
      }),
      resolveEnvelope<number>(ctx.db, ctx.waqfId, 'deadline.UPDATE_15BD.certificateExpiryLeadBd'),
    ]);
    if (waqf === null)
      throw new ApiError('NO_GRANT', 'the endowment is not readable.', { waqfId: ctx.waqfId });

    const superseded = new Set(
      rows.map((row) => row.recomputedFromId).filter((id): id is string => id !== null),
    );
    const heads = rows.filter((row) => !superseded.has(row.id));

    // ⊕ S11-2b — the row state is the domain's `deriveBoardState` (deadlines/board-state.ts): item 2a
    // derived it inline here and its calendar-null branch was unreachable on the fixture (mutation M2
    // survived); the pure function is unit-tested with null calendar / null config instead.
    const stateOf = (row: (typeof heads)[number]) =>
      deriveBoardState({
        today,
        due: civilDateFromUtcDate(row.dueDate),
        satisfiedAt: row.satisfiedAt,
        waivedAt: row.waivedAt,
        calendar,
        config,
        cannotComputeBecause: cannotComputeAll,
      });

    // The certificate arm's "not yet in scope": a valid certificate outside the sweep's lead is not a
    // missing input, it is nothing due yet — said as its own cause so the chip can be healthy.
    const certificateInScope = (() => {
      if (waqf.certificateExpiry === null || calendar === null || lead === undefined) return null;
      try {
        const noticeFrom = addBusinessDays(
          civilDateFromUtcDate(waqf.certificateExpiry),
          -lead.v,
          calendar,
        );
        return String(today) >= String(noticeFrom);
      } catch {
        return null;
      }
    })();

    const causeFor = (ruleKey: string, hasRows: boolean): BoardCause | null => {
      if (hasRows) return null;
      switch (ruleKey) {
        case 'REGISTER_30BD':
          return waqf.registrationAnchorDate === null ? 'NOT_RECORDED' : 'RECORDED_NOT_COMPUTABLE';
        case 'UPDATE_15BD':
          if (waqf.certificateExpiry === null) return 'NOT_RECORDED';
          if (certificateInScope === false) return 'NOT_IN_SCOPE_YET';
          return 'NOT_COMPUTED';
        case 'ISTIBDAL_10BD':
          return pendingIstibdal > 0 ? 'NOT_RECORDED' : 'NO_SUBJECT';
        case 'LICENSE_RENEWAL':
          return 'ROUTED_NO_HOME';
        case 'RETENTION_10Y':
          return null;
        default:
          return 'NOT_COMPUTED';
      }
    };

    const rules = DEADLINE_RULE_KEYS.map((ruleKey) => {
      const declaration = anchorDeclarationFor(ruleKey);
      const ruleRows = heads
        .filter((row) => row.ruleKey === ruleKey)
        .map((row) => {
          const derived = stateOf(row);
          return {
            id: row.id,
            complianceTaskId: row.complianceTaskId,
            anchorDate: row.anchorDate,
            anchorDateHijri: row.anchorDateHijri,
            dueDate: row.dueDate,
            dueDateHijri: row.dueDateHijri,
            satisfiedAt: row.satisfiedAt,
            satisfiedAtHijri:
              row.satisfiedAt === null
                ? null
                : derivedHijriSnapshot(row.satisfiedAt, 'satisfiedAt'),
            dischargeKind: row.dischargeKind === null ? null : String(row.dischargeKind),
            waivedAt: row.waivedAt,
            escalatedAt: row.escalatedAt,
            ...derived,
          };
        });
      return {
        ruleKey,
        zeroTolerance: DEADLINE_RULES[ruleKey].zeroTolerance,
        mode: declaration.mode,
        rows: ruleRows,
        cause: causeFor(ruleKey, ruleRows.length > 0),
      };
    });

    const KPI1_RULES = new Set(['REGISTER_30BD', 'UPDATE_15BD', 'ISTIBDAL_10BD']);
    const reasons: string[] = [];
    let tone: 'danger' | 'warning' | 'success' = 'success';
    for (const rule of rules) {
      if (!KPI1_RULES.has(rule.ruleKey)) continue;
      for (const row of rule.rows) {
        if (row.state === 'overdue') {
          tone = 'danger';
          reasons.push(`${rule.ruleKey}:overdue:${row.id}`);
        } else if (
          row.state === 'cannot_compute' ||
          row.state === 'at_risk' ||
          row.state === 'due_soon'
        ) {
          if (tone !== 'danger') tone = 'warning';
          reasons.push(`${rule.ruleKey}:${row.state}:${row.id}`);
        }
      }
      if (
        rule.cause === 'NOT_RECORDED' ||
        rule.cause === 'RECORDED_NOT_COMPUTABLE' ||
        rule.cause === 'NOT_COMPUTED'
      ) {
        if (tone !== 'danger') tone = 'warning';
        reasons.push(`${rule.ruleKey}:${rule.cause}`);
      }
    }

    return {
      waqfId: ctx.waqfId,
      asOf: { gregorian: String(today), hijri: derivedHijriSnapshot(ctx.now, 'asOf') },
      calendar:
        calendar === null
          ? { available: false as const, refusal: calendarRefusal, coverage: null }
          : {
              available: true as const,
              refusal: null,
              coverage: { from: String(calendar.coverage.from), to: String(calendar.coverage.to) },
            },
      settingsRefusal,
      rules,
      kpi1: { tone, reasons },
      /** ⚠ Binding rule 3 — every window length here is unverified against primary law. */
      unverifiedNote:
        'verify — may be stale (confirm vs primary law): the 30 / 15 / 10 business-day windows and the pre-alert thresholds.',
    };
  }),

  /**
   * Compute a statutory deadline and persist it FROZEN — the maker act that turns a stated
   * anchor fact into the date on file. Refuses non-clocks by name (`DEADLINE_RULE_NOT_A_CLOCK`),
   * absent figures (`SETTING_MISSING`), and an empty calendar (`CALENDAR_UNAVAILABLE`).
   */
  compute: makerProcedure('compliance:task:write')
    .input(
      z.object({
        ruleKey: z.string().min(1),
        /** The rule's anchor per its `anchorSemantics` — the caller's stated, audited fact. */
        anchor: z.string().datetime(),
        anchorHijri: z
          .string()
          .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string'),
        /** Optional binding to a task instance on the same endowment. */
        complianceTaskId: z.string().min(1).optional(),
        /** Human-readable cause, recorded in the audit context (§09's `triggerEvent`). */
        triggerEvent: z.string().min(1).max(400),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const anchorAt = new Date(input.anchor);
      const anchorHijri = assertHijriPairAgrees(
        anchorAt,
        input.anchorHijri,
        'anchor',
        'anchorHijri',
      );

      if (input.complianceTaskId !== undefined) {
        const task = await ctx.db.complianceTask.findFirst({
          where: { id: input.complianceTaskId, waqfId: ctx.waqfId },
          select: { id: true },
        });
        if (task === null) {
          // §10 §7.2's non-disclosure shape: another endowment's task id must read exactly like a
          // nonexistent one.
          throw new ApiError(
            'NO_GRANT',
            'complianceTaskId does not name a task on this endowment.',
            {
              waqfId: ctx.waqfId,
            },
          );
        }
      }

      const calendar = await assembleCalendar(ctx.db, ctx.waqfId);
      const settings = await resolveRuleSettings(ctx.db, ctx.waqfId, input.ruleKey);
      const computed = computeRuleDeadline({
        ruleKey: input.ruleKey,
        anchor: civilDateFromUtcDate(anchorAt),
        calendar,
        settings,
      });

      // The window AS APPLIED — migration 38's provenance trigger demands this on every insert,
      // and §09's freeze rationale is that this snapshot is what a stored date is defended with.
      const rule = DEADLINE_RULES[computed.ruleKey];
      const windowSnapshot = {
        settingKey: computed.computed.window.settingKey,
        basis: computed.computed.basis,
        businessDays: computed.computed.window.businessDays ?? null,
        calendarMonths: computed.computed.window.calendarMonths ?? null,
        calendarDays: computed.computed.window.calendarDays ?? null,
        monthAnchor: computed.computed.window.monthAnchor ?? null,
        roll: computed.computed.rollConvention,
        unverified: computed.computed.unverifiedNote !== null,
        leadSettingKey: rule.leadSettingKey,
        preExpiryLeadBd: settings.preExpiryLeadBd?.v ?? null,
      };

      const row = await auditedWrite(ctx.db, async (tx) => {
        const created = await tx.deadline.create({
          data: {
            waqfId: ctx.waqfId,
            complianceTaskId: input.complianceTaskId ?? null,
            ruleKey: computed.ruleKey,
            anchorDate: anchorAt,
            anchorDateHijri: anchorHijri,
            dueDate: new Date(`${computed.computed.due.gregorian}T00:00:00.000Z`),
            dueDateHijri: computed.computed.due.hijri,
            actionableDate:
              computed.actionable === null
                ? null
                : new Date(`${computed.actionable.gregorian}T00:00:00.000Z`),
            actionableDateHijri: computed.actionable?.hijri ?? null,
            windowSnapshot,
            businessDaysUsed: computed.computed.window.businessDays ?? null,
            createdBy: ctx.actor.actorId,
          },
          select: DEADLINE_SELECT,
        });

        await recordEvent(toActorContext(ctx, { procedure: 'deadline.compute' }), {
          action: 'CREATE',
          category: 'MUTATION',
          classification: 'ROUTINE',
          entityType: 'Deadline',
          entityId: created.id,
          waqfId: ctx.waqfId,
          extraContext: {
            ruleKey: computed.ruleKey,
            triggerEvent: input.triggerEvent,
            dueDate: computed.computed.due.gregorian,
            dueDateHijri: computed.computed.due.hijri,
            settingKey: computed.computed.window.settingKey,
            unverified: computed.computed.unverifiedNote !== null,
          },
        });
        return created;
      });

      return {
        deadline: row,
        /**
         * Binding rule 3 on the wire: the caveat travels with the date. `null` only where every
         * figure the computation consumed is recorded verified.
         */
        unverifiedNote: computed.computed.unverifiedNote,
        zeroTolerance: computed.zeroTolerance,
        anchorSemantics: computed.anchorSemantics,
      };
    }),

  /**
   * S9-3c — COMPUTE FROM THE DECLARED HOME. The auto-derivation half of `compute`: instead of the
   * caller stating the anchor, the engine reads it from the column `deadlines/anchors.ts` declares
   * for that rule, and REFUSES BY NAME for the three rules whose anchor has no usable home
   * (`REGISTER_30BD`, `ISTIBDAL_10BD` — no column records the fact; `LICENSE_RENEWAL` — the only
   * `licenseExpiry` in the schema belongs to a subcontractor on a table that is not waqf-scoped).
   *
   * ⚠ THE STORED HIJRI TWIN IS PASSED THROUGH, NOT RE-DERIVED OR RE-CHECKED — declared, with the
   * reason. `compute` asserts the caller's dual pair agrees with the server's conversion, because
   * there a disagreement is a caller whose calendar is wrong. Here the pair was written by an
   * earlier act that already passed that assertion, and §09's freeze rationale is explicit that a
   * recorded date must not shift because a conversion library changed — so re-deriving (or
   * re-asserting) the anchor's twin would reintroduce exactly the coupling the freeze removes. A
   * HALF pair still refuses: `deriveAnchor` will not accept a Gregorian date whose frozen twin is
   * NULL.
   */
  computeFromDerivedAnchor: makerProcedure('compliance:task:write')
    .input(
      z.object({
        ruleKey: z.string().min(1),
        /** Which declared home to read. Checked against the rule's declared arms by the domain. */
        subject: z.enum(['waqf', 'beneficiary', 'lease', 'legal_case', 'expropriation']),
        /** Required for row subjects; refused for `waqf` (the endowment is the scope, not an id). */
        subjectId: z.string().min(1).optional(),
        /**
         * The STATED reference date for `DISTRIBUTE_3M_FYE`'s declared reading. Never a clock
         * read — the same endowment asked on two days may give two answers.
         */
        asOf: z.string().datetime().optional(),
        complianceTaskId: z.string().min(1).optional(),
        triggerEvent: z.string().min(1).max(400),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.subject === 'waqf' && input.subjectId !== undefined) {
        throw new ApiError(
          'GATE_NOT_CLEARED',
          "subject 'waqf' takes no subjectId — the anchor is a fact about THIS endowment, and a " +
            'second id would make it ambiguous which endowment the deadline belongs to.',
          { waqfId: ctx.waqfId, reason: 'SUBJECT_ID_NOT_APPLICABLE' },
        );
      }
      if (input.complianceTaskId !== undefined) {
        await assertTaskOnEndowment(ctx.db, ctx.waqfId, input.complianceTaskId);
      }

      const derived = await deriveFromDeclaredHome(
        ctx.db,
        ctx.waqfId,
        input.ruleKey,
        input.subject,
        input.subjectId ?? null,
        input.asOf === undefined ? null : civilDateFromUtcDate(new Date(input.asOf)),
      );

      const calendar = await assembleCalendar(ctx.db, ctx.waqfId);
      const settings = await resolveRuleSettings(ctx.db, ctx.waqfId, input.ruleKey);
      const computed = computeRuleDeadline({
        ruleKey: input.ruleKey,
        anchor: derived.anchor,
        calendar,
        settings,
      });

      const row = await auditedWrite(ctx.db, async (tx) => {
        const created = await tx.deadline.create({
          data: deadlineCreateData({
            waqfId: ctx.waqfId,
            complianceTaskId: input.complianceTaskId ?? null,
            computed,
            settings,
            anchorAt: new Date(`${String(derived.anchor)}T00:00:00.000Z`),
            anchorHijri: derived.anchorHijri,
            createdBy: ctx.actor.actorId,
            recomputedFromId: null,
            // ⊕ S11-1 — frozen into the row, so a later correction can find this chain's head.
            anchorSource: {
              subject: input.subject,
              sourceId: derived.sourceId,
              kind: derived.anchorKind,
            },
          }) as never,
          select: DEADLINE_SELECT,
        });
        await recordEvent(toActorContext(ctx, { procedure: 'deadline.computeFromDerivedAnchor' }), {
          action: 'CREATE',
          category: 'MUTATION',
          classification: 'ROUTINE',
          entityType: 'Deadline',
          entityId: created.id,
          waqfId: ctx.waqfId,
          extraContext: {
            ruleKey: computed.ruleKey,
            triggerEvent: input.triggerEvent,
            // The PROVENANCE of the anchor, not just its value: which declared home, which row.
            anchorSubject: input.subject,
            anchorSourceId: derived.sourceId,
            anchorKind: derived.anchorKind,
            anchorSemantics: derived.semantics,
            dueDate: computed.computed.due.gregorian,
            dueDateHijri: computed.computed.due.hijri,
            unverified: computed.computed.unverifiedNote !== null,
          },
        });
        return created;
      });

      return {
        deadline: row,
        unverifiedNote: computed.computed.unverifiedNote,
        zeroTolerance: computed.zeroTolerance,
        anchorSemantics: derived.semantics,
        anchorSourceId: derived.sourceId,
        anchorKind: derived.anchorKind,
      };
    }),

  /**
   * S9-3c — §09's MATERIAL-CHANGE TRIGGER, with coalescing. The event other modules emit when an
   * asset, a beneficiary or the Nazarah changes: recorded in the change-set, then coalesced into
   * the ONE open update obligation per endowment.
   *
   * The clock is the change's EFFECTIVE date (CDE-Q2, owner-provisional 2026-08-25) — a late
   * discovery does not extend the deadline, and a missed window is reported rather than hidden.
   */
  recordMaterialChange: makerProcedure('compliance:task:write')
    .input(
      z.object({
        kind: z.enum(['ASSET', 'BENEFICIARY', 'NAZARAH']),
        effectiveDate: z.string().datetime(),
        effectiveDateHijri: z
          .string()
          .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string'),
        /** §09's `sourceRef` — which act or row caused this. Never PII. */
        sourceRef: z.string().min(1).max(400),
        triggerEvent: z.string().min(1).max(400),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const effectiveAt = new Date(input.effectiveDate);
      const effectiveHijri = assertHijriPairAgrees(
        effectiveAt,
        input.effectiveDateHijri,
        'effectiveDate',
        'effectiveDateHijri',
      );

      const calendar = await assembleCalendar(ctx.db, ctx.waqfId);
      const settings = await resolveRuleSettings(ctx.db, ctx.waqfId, 'UPDATE_15BD');

      return auditedWrite(ctx.db, async (tx) => {
        // The change takes part in the `min` as a PENDING row: the coalescer must see it (it may
        // be the tightest cause), and it must be born already bound to whichever duty wins — so
        // it is described here and written by `applyCoalesceDecision`, not created first and
        // re-pointed after.
        const pendingChange: PendingMaterialChange = {
          placeholderId: '<pending>',
          kind: input.kind,
          effectiveAt,
          effectiveDateHijri: effectiveHijri,
          sourceRef: input.sourceRef,
        };

        const unfiled = await readUnfiledChanges(tx, ctx.waqfId);
        const open = await readOpenUpdateObligation(tx, ctx.waqfId);
        const decision = coalesceUpdateObligation({
          // ⚠ NULL DELIBERATELY, and this is a scope statement not an omission. Whether a recorded
          // `certificateExpiry` is IN SCOPE right now is the sweep's judgment (it applies the
          // configured lead); a material change must not silently pull a not-yet-in-scope expiry
          // into the `min`. And nothing is lost: if the sweep HAS already raised the duty from the
          // certificate, that anchor is the open obligation's head anchor, which the coalescer
          // compares against — so the tightest of the two still governs.
          certificateAnchor: null,
          unfiledChanges: [
            ...unfiled,
            {
              id: pendingChange.placeholderId,
              effectiveDate: civilDateFromUtcDate(effectiveAt),
              kind: input.kind,
            },
          ],
          openObligation: open,
        });

        return applyCoalesceDecision(tx, ctx, {
          decision,
          calendar,
          settings,
          procedure: 'deadline.recordMaterialChange',
          triggerEvent: input.triggerEvent,
          pendingChange,
        });
      });
    }),

  /**
   * S9-3c — §09's CERTIFICATE-EXPIRY TRIGGER, per endowment. *"A daily worker sweep checks each
   * `Waqf.registrationCertificateValidUntil`. On (or a configurable lead before) expiry, if no
   * open update task exists, it raises `GOV-REG-02` clocked from the expiry date."*
   *
   * The DAILY part is the worker's (S9-3d wires the cron); the DECISION is here, so it is testable
   * now and so the worker owns scheduling only. `asOf` is a parameter and never a clock read.
   *
   * ⚠ THE LEAD MOVES WHEN WE NOTICE, NEVER THE ANCHOR. `deadline.UPDATE_15BD.certificateExpiryLeadBd`
   * decides how early the sweep acts; the 15-business-day window still runs from the certificate
   * expiry itself (§09's rule table). A sweep that noticed a month early and one that noticed on
   * the day compute the SAME due date — asserted, because a lead that moved the anchor would be a
   * configurable statutory deadline.
   */
  sweepCertificateExpiry: makerProcedure('compliance:task:write')
    .input(
      z.object({
        /** The sweep's reference day — the worker's "today", stated rather than read. */
        asOf: z.string().datetime(),
        triggerEvent: z.string().min(1).max(400),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const asOf = civilDateFromUtcDate(new Date(input.asOf));
      const waqf = await ctx.db.waqf.findFirst({
        where: { id: ctx.waqfId, deletedAt: null },
        select: { certificateExpiry: true, certificateExpiryHijri: true },
      });
      if (waqf === null) {
        throw new ApiError('NO_GRANT', 'the endowment is not readable.', { waqfId: ctx.waqfId });
      }
      if (waqf.certificateExpiry === null) {
        // NOT a refusal: an endowment with no recorded certificate expiry is simply not in scope
        // for this trigger. Refusing would make a daily sweep across a portfolio fail on the first
        // endowment nobody has recorded an expiry for.
        return {
          inScope: false as const,
          reason: 'NO_RECORDED_CERTIFICATE_EXPIRY' as const,
          action: null,
        };
      }

      const lead = await resolveEnvelope<number>(
        ctx.db,
        ctx.waqfId,
        'deadline.UPDATE_15BD.certificateExpiryLeadBd',
      );
      if (lead === undefined) {
        throw new DomainError(
          'SETTING_MISSING',
          "the certificate sweep needs deadline.UPDATE_15BD.certificateExpiryLeadBd — §09's " +
            '"on (or a configurable lead before) expiry" is configuration, and a hard-coded 0 ' +
            'would silently answer it with "never early".',
          { details: { settingKey: 'deadline.UPDATE_15BD.certificateExpiryLeadBd' } },
        );
      }

      const calendar = await assembleCalendar(ctx.db, ctx.waqfId);
      const expiry = civilDateFromUtcDate(waqf.certificateExpiry);
      // In scope once `asOf` has reached `expiry − lead` business days. The lead is applied to the
      // NOTICING boundary only; `expiry` remains the anchor below.
      const noticeFrom = addBusinessDays(expiry, -lead.v, calendar);
      if (String(asOf) < String(noticeFrom)) {
        return {
          inScope: false as const,
          reason: 'LEAD_WINDOW_NOT_REACHED' as const,
          action: null,
          noticeFrom: String(noticeFrom),
          expiry: String(expiry),
        };
      }

      const settings = await resolveRuleSettings(ctx.db, ctx.waqfId, 'UPDATE_15BD');
      const certificateHijri =
        waqf.certificateExpiryHijri ??
        derivedHijriSnapshot(waqf.certificateExpiry, 'certificateExpiry');

      return auditedWrite(ctx.db, async (tx) => {
        const unfiled = await readUnfiledChanges(tx, ctx.waqfId);
        const open = await readOpenUpdateObligation(tx, ctx.waqfId);
        const decision = coalesceUpdateObligation({
          certificateAnchor: expiry,
          unfiledChanges: unfiled,
          openObligation: open,
        });
        const applied = await applyCoalesceDecision(tx, ctx, {
          decision,
          calendar,
          settings,
          procedure: 'deadline.sweepCertificateExpiry',
          triggerEvent: input.triggerEvent,
          pendingChange: null,
          certificateAnchorHijri: certificateHijri,
        });
        return { inScope: true as const, reason: null, noticeFrom: String(noticeFrom), ...applied };
      });
    }),

  /**
   * S9-3c — §09's *"Filing the update closes the task and clears the change-set; a subsequent
   * change opens a fresh clock."*
   *
   * "Clears" is NEVER a delete: every un-filed member is MARKED filed (write-once, migration 40),
   * the task moves to `COMPLETED`, and the head deadline is marked satisfied. The partial unique
   * index then frees the endowment's slot, so the next material change genuinely opens a FRESH
   * clock rather than reopening this one — which is the half of the coalescing rule that cannot be
   * demonstrated without this procedure, which is why it ships with it.
   */
  fileUpdateObligation: makerProcedure('compliance:task:write')
    .input(
      z.object({
        filedAt: z.string().datetime(),
        filedAtHijri: z
          .string()
          .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string'),
        /** Evidence of the filing, where one exists. Plain id; the document's own guards keep it. */
        evidenceId: z.string().min(1).optional(),
        triggerEvent: z.string().min(1).max(400),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // ⊕ S11-2 — a filing asserts to the Authority that a statutory duty was met: a HUMAN act. The
      // declared service seat holds this verb (sweep scope) and must not be able to make the assertion.
      // Measured before the guard: nothing automated calls this procedure (worker: `evaluate` only).
      assertHumanActor(ctx, 'deadline.fileUpdateObligation');
      const filedAtDate = new Date(input.filedAt);
      const filedHijri = assertHijriPairAgrees(
        filedAtDate,
        input.filedAtHijri,
        'filedAt',
        'filedAtHijri',
      );

      const open = await readOpenUpdateObligation(ctx.db, ctx.waqfId);
      if (open === null) {
        throw new ApiError(
          'GATE_NOT_CLEARED',
          'there is no open GOV-REG-02 update obligation on this endowment to file. Filing ' +
            'nothing would mark a change-set cleared without a duty having been discharged.',
          { waqfId: ctx.waqfId, reason: 'NO_OPEN_UPDATE_OBLIGATION' },
        );
      }

      return auditedWrite(ctx.db, async (tx) => {
        const unfiled = await tx.materialChange.findMany({
          where: { waqfId: ctx.waqfId, filedAt: null, deletedAt: null },
          select: { id: true, complianceTaskId: true },
          orderBy: { id: 'asc' },
        });
        for (const change of unfiled) {
          // ⚠ `update` PER ROW, and not `updateMany` — measured, and the reason outranks the
          // instinct. Carrying `waqfId` in an `updateMany` where-clause looks safer (scope in the
          // statement rather than in a check), and the audit extension REFUSES it by name:
          // "MaterialChange.updateMany is not permitted on an audited model: no per-row
          // before-image is available. Loop over update()." A retention-table write with no
          // before-image is a hash-chain link with nothing on the other side of it, which is a
          // strictly worse loss than the scope check being a check. The rows here are already
          // COMMITTED (unlike the create-then-bind case above), so the update-by-id pre-check
          // resolves them normally, and every one was just read under this endowment's filter.
          await tx.materialChange.update({
            where: { id: change.id },
            data: {
              filedAt: filedAtDate,
              filedAtHijri: filedHijri,
              // A change recorded before any raise bound it may still be unbound; binding it here
              // is the NULL -> value transition the write-once guard permits, and the CHECK
              // `material_change_filed_implies_bound` requires it before `filedAt` may land.
              ...(change.complianceTaskId === null ? { complianceTaskId: open.taskId } : {}),
            },
          });
        }

        // Same reason as above: audited model, per-row before-image required.
        await tx.complianceTask.update({
          where: { id: open.taskId },
          data: {
            status: 'COMPLETED' as never,
            closeDate: filedAtDate,
            closeDateHijri: filedHijri,
          },
        });

        if (open.headDeadlineId !== null) {
          await tx.deadline.update({
            where: { id: open.headDeadlineId },
            data: {
              satisfiedAt: filedAtDate,
              // ⊕ S11-2 — a filed update IS a met discharge (migration 49 pairs the kind with `satisfiedAt`).
              dischargeKind: 'MET' as never,
              ...(input.evidenceId === undefined ? {} : { satisfiedEvidenceId: input.evidenceId }),
            },
          });
        }

        await recordEvent(toActorContext(ctx, { procedure: 'deadline.fileUpdateObligation' }), {
          action: 'UPDATE',
          category: 'MUTATION',
          classification: 'ROUTINE',
          entityType: 'ComplianceTask',
          entityId: open.taskId,
          waqfId: ctx.waqfId,
          extraContext: {
            triggerEvent: input.triggerEvent,
            templateCode: UPDATE_OBLIGATION_TEMPLATE_CODE,
            clearedChangeIds: unfiled.map((row) => row.id),
            satisfiedDeadlineId: open.headDeadlineId,
          },
        });

        return {
          taskId: open.taskId,
          clearedChangeIds: unfiled.map((row) => row.id),
          satisfiedDeadlineId: open.headDeadlineId,
        };
      });
    }),

  /**
   * S9-3d — §09's DAILY EVALUATOR, for ONE endowment. The worker iterates endowments and calls
   * this; the scheduling is `apps/worker`'s, the deciding is here, and the arithmetic is
   * `planDeadlineEvaluation`'s (pure).
   *
   * ⚠ **THE FROZEN DUE DATE IS NEVER TOUCHED.** §09's freeze rationale, and `jobs`' own standing
   * rule: *"The deadline evaluator computes state and emits notifications. It never rewrites a
   * stored `dueDateGregorian` / `dueDateHijri`."* This procedure writes `EscalationEvent` rows,
   * `Notification` rows and — for `met` only — a `ComplianceTask.status` mirror. Nothing else.
   *
   * ⚠ **EVERY OUTBOUND SIGNAL ASKS `mayDispatch` FIRST, WITH THE SUBJECT ROW'S OWN
   * CLASSIFICATION.** This is the path `ABSENT_OUTBOUND_PATHS` was written for, and its words for
   * the escalation arm are exact: *"an overdue GOV-AML-02 obligation escalating to Leadership is a
   * tip-off delivered by a cron job."* The classification is read off the bound `ComplianceTask`
   * and its obligation — never cast, never derived here — so an `AML_RESTRICTED` duty produces a
   * REFUSAL, and the refusal is counted and audited while emitting nothing. Note also that an
   * in-app `Notification` row addressed to a user IS an egress to that user (the scoping extension
   * narrows `Notification` by `userId`), so the gate is on ROW CREATION and not merely on some
   * later external send.
   */
  evaluate: makerProcedure('compliance:task:write')
    .input(
      z.object({
        /** The evaluator's reference day — the worker's "now", STATED. Never read from a clock. */
        asOf: z.string().datetime(),
        asOfHijri: z
          .string()
          .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string'),
        triggerEvent: z.string().min(1).max(400),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const asOfAt = new Date(input.asOf);
      const asOfHijri = assertHijriPairAgrees(asOfAt, input.asOfHijri, 'asOf', 'asOfHijri');
      const today = civilDateFromUtcDate(asOfAt);

      const calendar = await assembleCalendar(ctx.db, ctx.waqfId);
      const config = await resolveEvaluatorConfig(ctx.db, ctx.waqfId);

      // OPEN deadlines only: satisfied and waived rows have left the ladder, and re-deriving them
      // nightly would re-emit nothing but would still cost the read.
      const rows = await ctx.db.deadline.findMany({
        where: { waqfId: ctx.waqfId, deletedAt: null, satisfiedAt: null, waivedAt: null },
        select: {
          id: true,
          waqfId: true,
          ruleKey: true,
          dueDate: true,
          complianceTaskId: true,
          satisfiedAt: true,
          waivedAt: true,
        },
        orderBy: { dueDate: 'asc' },
      });

      const facts: EvaluatedDeadlineFacts[] = [];
      const unknownRuleKeys: string[] = [];
      for (const row of rows) {
        if (!isDeadlineRuleKey(row.ruleKey)) {
          // A stored rule key outside the nine is a data condition, not a reason to guess a
          // ladder — reported and skipped, never evaluated under a default.
          unknownRuleKeys.push(row.id);
          continue;
        }
        const subject = await readDispatchSubject(ctx.db, row.complianceTaskId);
        facts.push({
          deadlineId: row.id,
          waqfId: row.waqfId,
          ruleKey: row.ruleKey,
          due: civilDateFromUtcDate(row.dueDate),
          complianceTaskId: row.complianceTaskId,
          zeroTolerance: DEADLINE_RULES[row.ruleKey].zeroTolerance,
          satisfiedAt: row.satisfiedAt === null ? null : civilDateFromUtcDate(row.satisfiedAt),
          waived: row.waivedAt !== null,
          confidentiality: subject.confidentiality,
          auditClassification: subject.auditClassification,
        });
      }

      const plan = planDeadlineEvaluation({ today, calendar, deadlines: facts, config });

      return auditedWrite(ctx.db, async (tx) => {
        const emitted = {
          reminders: 0,
          escalations: 0,
          escalationNotices: 0,
          mirrored: 0,
          /**
           * ⚠ IDEMPOTENCE, AND IT WAS A REAL DEFECT — found by an order-dependent test failure, not
           * by review. `packages/jobs`' own standing rule for every job here reads: *"Idempotent.
           * Re-running the cron must not double-send a reminder or double-write a state change."* The
           * first draft honoured that DERIVATIONALLY (a reminder fires only on its exact day) and
           * then broke it at the transport: running the evaluator TWICE on one day hit migration
           * 41's `escalation_event_one_per_rung_per_day` index and killed the whole transaction with
           * a `23505`, so a retried cron took the endowment's entire sweep down with it.
           *
           * The index is right and stays. What was missing is the caller treating its refusal as
           * what it is — "already escalated today" — rather than as a failure. These two counters
           * make the no-op VISIBLE instead of silent, because "we escalated" and "we had already
           * escalated" are different facts about a day.
           */
          escalationsAlreadyRecorded: 0,
          remindersAlreadySent: 0,
        };
        const refused: {
          deadlineId: string;
          channel: string;
          refusal: string;
        }[] = [];
        const noRecipients: { deadlineId: string; level: string }[] = [];

        for (const entry of plan.entries) {
          /* ── reminders ─────────────────────────────────────────────────────────────────── */
          if (entry.remindersFiringToday.length > 0) {
            const verdict = mayDispatch({
              channel: 'NOTIFICATION',
              confidentiality: entry.dispatchSubject.confidentiality,
              auditClassification: entry.dispatchSubject.auditClassification,
            });
            if (!verdict.permitted) {
              refused.push({
                deadlineId: entry.deadlineId,
                channel: 'NOTIFICATION',
                refusal: String(verdict.refusal),
              });
            } else {
              // Reminders reach the duty's OWNING seats: the case manager and the Nazir. Not
              // Leadership — a reminder is not an escalation, and §09's ladder is what reaches them.
              const recipients = await recipientsForRoles(tx, ctx.waqfId, [
                ESCALATION_ROLE_BY_LEVEL.case_manager,
                ESCALATION_ROLE_BY_LEVEL.nazir,
              ]);
              for (const offsetBd of entry.remindersFiringToday)
                for (const userId of recipients) {
                  const key = reminderIdempotencyKey({
                    deadlineId: entry.deadlineId,
                    offsetBd,
                    onDay: today,
                  });
                  // ⚠ THE FLOOR IS THE DATABASE NOW — migration 45 (S10/T2), the expression index
                  // this comment used to declare as owed. This read-then-write survives as the
                  // FAST PATH only: it keeps a same-day re-run cheap and countable
                  // (`remindersAlreadySent`), and it is still racy under two concurrent
                  // evaluators — but the race's loser now hits the partial UNIQUE index, its
                  // whole transaction aborts (a 23505 inside an interactive transaction cannot
                  // be caught-and-continued — 25P02, the same fact the escalation block records
                  // for migration 41), the job FAILS LOUDLY, and the transport's retry re-runs
                  // it into this check, which then reports already-sent. Loud, convergent, never
                  // a duplicate; the two-worker integration test measures that composition.
                  //
                  // ⚠ CORRECTED, not merely marked paid: this comment used to claim "the
                  // STRUCTURAL guarantee belongs to the real transport: JobQueue.enqueue is
                  // idempotent on exactly this key by contract." That sentence is MEASURABLY
                  // FALSE for the after-completion case — pg-boss's exclusive window is
                  // state <= 'active', so a completed same-day job frees its key and a
                  // re-enqueue creates a NEW job (pinned: pgboss-transport "THE HONEST DELTA").
                  // The transport gives at-most-one-PENDING-per-key; the PER-DAY guarantee is
                  // migration 45's alone.
                  //
                  // ⚠⚠ AND THE CHECK ITSELF WAS BLIND UNTIL THE FLOOR EXPOSED IT — the raw read
                  // below is a FIX, found on migration 45's first full run, not a style choice.
                  // `Notification` is USER-SCOPED (`USER_SCOPED_MODELS`: reads through a scoped
                  // context are narrowed to the CALLER's own rows), and the evaluator is never
                  // the recipient — so the scoped `findFirst` this replaced matched NOTHING,
                  // cross-user, EVER. Measured consequence, live since S9-3d: every same-day
                  // re-evaluate silently DOUBLE-SENT reminders whenever evaluator ≠ recipient
                  // (the deployed shape — the seat is no one's inbox), and the G-6 suite's
                  // repeat-evaluate positive controls were passing ON those duplicates. The
                  // floor turned the silent duplicate into a loud 23505, which is how this was
                  // found. The read goes through `$queryRaw` — the facade's passthrough to the
                  // raw transaction — deliberately OUTSIDE the scoping extension, because the
                  // question is "does the RECIPIENT already have this reminder", which the
                  // caller's own view structurally cannot answer.
                  const duplicate = await tx.$queryRaw<{ id: string }[]>`
                    SELECT "id" FROM "notification"
                     WHERE "userId" = ${userId}
                       AND "kind" = 'deadline.reminder'
                       AND "payload"->>'idempotencyKey' = ${key}
                     LIMIT 1`;
                  if (duplicate.length > 0) {
                    emitted.remindersAlreadySent += 1;
                    continue;
                  }
                  await tx.notification.create({
                    data: {
                      userId,
                      waqfId: ctx.waqfId,
                      kind: 'deadline.reminder',
                      payload: {
                        deadlineId: entry.deadlineId,
                        ruleKey: entry.ruleKey,
                        offsetBd,
                        derivedStatus: entry.state.status,
                        businessDaysRemaining: entry.state.businessDaysRemaining,
                        asOf: String(today),
                        // The transport's dedupe key, carried so a real queue can key on it.
                        idempotencyKey: key,
                      },
                    },
                    select: { id: true },
                  });
                  emitted.reminders += 1;
                }
            }
          }

          /* ── escalation ────────────────────────────────────────────────────────────────── */
          if (entry.escalateTo !== null) {
            const level = entry.escalateTo;
            const verdict = mayDispatch({
              channel: 'ESCALATION',
              confidentiality: entry.dispatchSubject.confidentiality,
              auditClassification: entry.dispatchSubject.auditClassification,
            });
            if (!verdict.permitted) {
              // ⚠ NOTHING IS WRITTEN — not the EscalationEvent either. The event row would name the
              // deadline and its lateness, and `escalation_event` is scoped by endowment rather than
              // by compartment, so a row about an AML duty is readable by every non-member seat on
              // that endowment. §09 rule 1 is about the compartment emitting nothing into the
              // general plane, and the escalation record IS the general plane.
              refused.push({
                deadlineId: entry.deadlineId,
                channel: 'ESCALATION',
                refusal: String(verdict.refusal),
              });
            } else {
              // ⚠ ALREADY-ESCALATED-TODAY IS A NO-OP, NOT A FAILURE. Migration 41's
              // `escalation_event_one_per_rung_per_day` index is the structural guarantee that a
              // retried cron does not double-record a notification; this is the caller reading its
              // refusal correctly. Checked rather than caught, because a caught `23505` inside an
              // interactive transaction aborts it in Postgres — the whole sweep would still die,
              // just later and with a worse message.
              const alreadyEscalated = await tx.escalationEvent.findFirst({
                where: {
                  waqfId: ctx.waqfId,
                  deadlineId: entry.deadlineId,
                  level: ESCALATION_LEVEL_DB_VALUE[level] as never,
                  asOfDate: asOfAt,
                  deletedAt: null,
                },
                select: { id: true },
              });
              // ⚠ NOT `continue`: that would skip this entry's status mirror as well, which is a
              // different decision wearing an early-exit's clothes. (Harmless today — an escalating
              // entry is `overdue` and only `met` mirrors — but "harmless today" is how the next
              // reader inherits a bug.) The whole emit block is gated instead.
              if (alreadyEscalated !== null) {
                emitted.escalationsAlreadyRecorded += 1;
              } else {
                await tx.escalationEvent.create({
                  data: {
                    waqfId: ctx.waqfId,
                    deadlineId: entry.deadlineId,
                    complianceTaskId: entry.complianceTaskId,
                    level: ESCALATION_LEVEL_DB_VALUE[level] as never,
                    derivedStatus: entry.state.status,
                    businessDaysOverdue: Math.max(0, -entry.state.businessDaysRemaining),
                    ladderUsed: entry.ladderUsed,
                    asOfDate: asOfAt,
                    asOfDateHijri: asOfHijri,
                    createdBy: ctx.actor.actorId,
                  },
                  select: { id: true },
                });
                emitted.escalations += 1;

                const recipients = await recipientsForRoles(tx, ctx.waqfId, [
                  ESCALATION_ROLE_BY_LEVEL[level],
                ]);
                if (recipients.length === 0) {
                  // Reported, never silent: "escalated to leadership" and "nobody holds that seat
                  // here" must not be the same log line.
                  noRecipients.push({ deadlineId: entry.deadlineId, level });
                }
                for (const userId of recipients) {
                  await tx.notification.create({
                    data: {
                      userId,
                      waqfId: ctx.waqfId,
                      kind: 'deadline.escalation',
                      payload: {
                        deadlineId: entry.deadlineId,
                        ruleKey: entry.ruleKey,
                        level,
                        ladderUsed: entry.ladderUsed,
                        businessDaysOverdue: Math.max(0, -entry.state.businessDaysRemaining),
                        asOf: String(today),
                        idempotencyKey: escalationIdempotencyKey({
                          deadlineId: entry.deadlineId,
                          level,
                          onDay: today,
                        }),
                      },
                    },
                    select: { id: true },
                  });
                  emitted.escalationNotices += 1;
                }
              }
            }
          }

          /* ── the status mirror — `met` only, per the evaluator's declared abstentions ───── */
          if (entry.statusMirror.mirror !== null && entry.complianceTaskId !== null) {
            await tx.complianceTask.update({
              where: { id: entry.complianceTaskId },
              data: { status: entry.statusMirror.mirror as never },
            });
            emitted.mirrored += 1;
          }
        }

        await recordEvent(toActorContext(ctx, { procedure: 'deadline.evaluate' }), {
          action: 'UPDATE',
          category: 'MUTATION',
          classification: 'ROUTINE',
          entityType: 'DeadlineEvaluation',
          entityId: ctx.waqfId,
          waqfId: ctx.waqfId,
          extraContext: {
            triggerEvent: input.triggerEvent,
            asOf: String(today),
            evaluated: plan.entries.length,
            ...emitted,
            // ⚠ EVERY REFUSAL IS ON THE RECORD. §09 rule 3: the AML action is LOGGED (carrying
            // RESTRICTED) rather than suppressed — so a dispatch we declined to make is a fact the
            // trail keeps, and its visibility is `auditCompartmentClause`'s job, not ours.
            dispatchRefused: refused,
            escalatedToNobody: noRecipients,
            unknownRuleKeys,
            abstained: plan.abstained,
          },
        });

        return {
          asOf: String(today),
          evaluated: plan.entries.length,
          ...emitted,
          dispatchRefused: refused,
          escalatedToNobody: noRecipients,
          unknownRuleKeys,
          abstained: plan.abstained,
        };
      });
    }),

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * ⊕ S11-1 · THE CLOCK-START DATES AS RECORDED OPERATOR INPUT
   * ═════════════════════════════════════════════════════════════════════════════════════════
   * Owner ruling 2026-08-31 (memo, S10 addendum second batch; record-commit 9f3d8fd), verbatim:
   * *"the stating dates for now should be an input field that i can put. once there is clarity we
   * can refine down th eline and increase governance"* — and *"yes sure, make a drop down if that
   * helps."* Migration 48 gave `REGISTER_30BD` and `ISTIBDAL_10BD` their columns; these two
   * procedures are the input field.
   *
   * WHY THEY LIVE HERE AND NOT ON `endowment`: they compute the deadline the anchor starts, in the
   * same transaction, through this file's module-private calendar/settings/persist path — and the
   * ruling's own words call them clock-start dates. Their RUNGS are the columns' write policies
   * (`Waqf` → `endowment:waqf:write`, `Expropriation` → `endowment:asset:write`), so the column gate
   * inside Prisma and the procedure agree. Both then write a `Deadline` (`compliance:task:write`) in
   * the same transaction: every preset holding either write verb also holds that one (measured, five
   * presets), so no seat is stranded mid-transaction. ⊕ And a bound that falls out for free: the
   * deadline-sweep SERVICE seat holds `compliance:task:write` ALONE, so it can write a deadline but
   * can never record an anchor — the machine cannot invent a clock-start.
   *
   * THREE PROPERTIES, EACH A CONDITION ON THE RULING:
   *  1. RECORDED, NEVER DERIVED — the caller states date + frozen Hijri (asserted to agree) and, for
   *     the registration clock, WHICH date it is. Blank clears the record; nothing defaults. It is
   *     EDITABLE by the owner's own ruling (2026-09-02, f57e13d: *"i should be able to edit dates …
   *     audit log maintain record"*): the extension's full-row before/after image on the source row
   *     is the history, and G-1 keeps it. ⚠ Editing a date to clear an indicator is NOT what that
   *     ruling sanctions — the discharge mechanism is back with the owner and is not built here.
   *  2. THE COMPUTE IS NOT ALL-OR-NOTHING — a compute refusal MUST NOT reject the operator's input.
   *     The seeded Hijri calendar covers 1447–1449 AH; a perfectly valid 2015 documentation date is
   *     outside it and the engine refuses `CALENDAR_UNAVAILABLE`, correctly. If the anchor and the
   *     compute shared one fate, the operator would be refused for a date they were right to enter —
   *     and the fix they would reach for is a WRONG date that computes. So the anchor is PERSISTED,
   *     the refusal is RECORDED BY NAME (an audit event, and the response), and the screen shows a
   *     third first-class state: recorded — not computable (calendar coverage). That state is forced
   *     by the calendar horizon, not chosen.
   *  3. A CORRECTION IS A CHAIN, NOT AN EDIT — migration 38 freezes the computed identity, so a
   *     corrected anchor INSERTs a new `Deadline` with `recomputedFromId` = the CURRENT HEAD (found
   *     through the provenance frozen into the snapshot, `selectAnchorChainHead`); a second correction
   *     chains from the newest row, or `UNIQUE("recomputedFromId")` refuses it. Clearing the anchor —
   *     or correcting it to a date that cannot compute — WITHDRAWS the standing head (soft-delete,
   *     audited): a frozen date computed from a fact no longer on record does not stand.
   *
   * ⚠ UNVERIFIED (binding rule 3): which registration date GOVERNS, and the 30/10-business-day
   * figures. ⚠ OPEN, not decided here: whether VOLUNTARY istibdal is in Phase-1 scope — the
   * completion date lives on `Expropriation` because that is the only home the schema has.
   */

  recordRegistrationAnchor: makerProcedure('endowment:waqf:write')
    .input(
      z
        .object({
          /** The clock-start; `null` CLEARS the record (see property 3). */
          date: z.string().datetime().nullable(),
          /**
           * The frozen Hijri twin. OPTIONAL: the web app has no calendar implementation by design
           * (ADR-0007 — one Umm al-Qura implementation, in `@qmulate/domain`, which `apps/web` does
           * not depend on), so a UI caller omits it and the SERVER'S derivation is the frozen
           * snapshot. A caller that does supply one is asserted against that same derivation.
           */
          dateHijri: z
            .string()
            .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string')
            .nullable()
            .optional(),
          /** WHICH date it is — the owner's dropdown. Closed; travels with the date. */
          kind: z.enum(['WAQF_DOCUMENTATION_DATE', 'REGULATION_EFFECTIVE_DATE']).nullable(),
          triggerEvent: z.string().min(1).max(400),
        })
        .refine(
          (value) =>
            (value.date === null) === (value.kind === null) &&
            (value.date !== null || value.dateHijri === null || value.dateHijri === undefined),
          {
            message:
              'date and kind are both present or both absent — the owner ruled the KIND travels with ' +
              'the date, a bare date is not the record — and a Hijri twin without a date is nothing.',
          },
        ),
    )
    .mutation(async ({ ctx, input }) =>
      recordAnchor(ctx, {
        ruleKey: 'REGISTER_30BD',
        subject: 'waqf',
        sourceId: ctx.waqfId,
        procedure: 'deadline.recordRegistrationAnchor',
        taskTemplateCode: 'GOV-REG-01',
        date: input.date,
        dateHijri: input.dateHijri ?? null,
        kind: input.kind,
        triggerEvent: input.triggerEvent,
        writeAnchor: async (tx, recorded) => {
          // ⚠ NO `select` (C-08): the audit extension diffs the full row.
          await tx.waqf.update({
            where: { id: ctx.waqfId },
            data:
              recorded === null
                ? {
                    registrationAnchorDate: null,
                    registrationAnchorDateHijri: null,
                    registrationAnchorKind: null,
                  }
                : {
                    registrationAnchorDate: recorded.at,
                    registrationAnchorDateHijri: recorded.hijri,
                    registrationAnchorKind: recorded.kind as never,
                  },
          });
        },
      }),
    ),

  recordIstibdalCompletion: makerProcedure('endowment:asset:write')
    .input(
      z
        .object({
          expropriationId: z.string().min(1).max(128),
          /** The istibdal COMPLETION date; `null` CLEARS the record. */
          date: z.string().datetime().nullable(),
          /** Optional for the same reason as on `recordRegistrationAnchor`: the server derives it. */
          dateHijri: z
            .string()
            .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string')
            .nullable()
            .optional(),
          triggerEvent: z.string().min(1).max(400),
        })
        .refine(
          (value) =>
            value.date !== null || value.dateHijri === null || value.dateHijri === undefined,
          { message: 'a Hijri twin without a date is nothing.' },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      // §10 §7.2's non-disclosure shape: another endowment's expropriation id reads exactly like a
      // nonexistent one. Read BEFORE anything is written.
      const row = await ctx.db.expropriation.findFirst({
        where: { id: input.expropriationId, waqfId: ctx.waqfId, deletedAt: null },
        select: { id: true },
      });
      if (row === null) throw notOnThisEndowment('expropriation', ctx.waqfId);

      return recordAnchor(ctx, {
        ruleKey: 'ISTIBDAL_10BD',
        subject: 'expropriation',
        sourceId: input.expropriationId,
        procedure: 'deadline.recordIstibdalCompletion',
        taskTemplateCode: 'GOV-PROT-02',
        date: input.date,
        dateHijri: input.dateHijri ?? null,
        kind: null,
        triggerEvent: input.triggerEvent,
        writeAnchor: async (tx, recorded) => {
          await tx.expropriation.update({
            where: { id: input.expropriationId },
            data:
              recorded === null
                ? { istibdalCompletedDate: null, istibdalCompletedDateHijri: null }
                : {
                    istibdalCompletedDate: recorded.at,
                    istibdalCompletedDateHijri: recorded.hijri,
                  },
          });
        },
      });
    }),

  /**
   * ⊕ S11-2 — the REGISTER_30BD duty recorded as DISCHARGED (owner ruling 2026-09-02, S4 memo S11
   * addendum second batch, record f797fea: *"yes, build the discharge path"*).
   *
   * THE RED CLEARS BECAUSE THE DUTY WAS MET — never because a clock-start moved. Two engineering
   * conditions travelled with the ruling and are enforced here: (1) the anchor stays TRUE — this
   * procedure touches no `registrationAnchor*` column (a test asserts the triple byte-identical);
   * (2) a third state is addable later without rework — `dischargeKind` (migration 49) is the seam.
   *
   * SHAPE follows `fileUpdateObligation` (the one precedent that sets `satisfiedAt`), tightened:
   *  · a HUMAN actor only (`assertHumanActor`) — the declared service seat holds this verb for the
   *    sweep and must not be able to assert a statutory duty met;
   *  · the completion date is proven, not trusted (Hijri derived or asserted; not in the future; not
   *    before the clock-start — a duty cannot be met before its clock starts, and a date that
   *    precedes the anchor is either an input error or the open counsel question wearing a date);
   *  · evidence, when given, must be a document OF THIS ENDOWMENT (§10 §7.2's non-disclosure shape:
   *    another endowment's id reads exactly like a nonexistent one);
   *  · the head deadline (the chain's live row) is marked `satisfiedAt` + `dischargeKind: MET`; the
   *    bound GOV-REG-01 task — or an open one this row can bind to — moves to COMPLETED; an UNBOUND
   *    head (the fixture's shape: SEED- placeholders, no register) is discharged all the same and the
   *    result says `taskMirrored: false` — the register is QMULATE's bookkeeping, the met fact is
   *    the statute's; refusing would leave a real discharge unrecordable;
   *  · lateness is recorded ONCE, in the audit event, in business days (negative = early); when the
   *    calendar cannot span due→completion the event says so rather than guessing.
   *
   * RUNG: the precedent's plain maker (`compliance:task:write`). Whether a discharge should instead be
   * maker-checker or a NAZIR-only attestation is PUT TO THE OWNER with this design (memo, unsettled);
   * the rung is a one-line change either way and nothing here assumes the answer.
   *
   * REFUSALS, by name (`details.reason`): `NO_REGISTRATION_DEADLINE_ON_RECORD` (no chain head — this
   * includes a clock-start recorded but not computable, e.g. outside calendar coverage: a duty met
   * against a clock the system cannot compute has nowhere to live yet — DECLARED GAP, routed) ·
   * `REGISTRATION_ALREADY_DISCHARGED` (the DB trigger is the backstop) ·
   * `DISCHARGE_PRECEDES_CLOCK_START` · `DISCHARGE_IN_FUTURE` · `DISCHARGE_REQUIRES_HUMAN_ACTOR`.
   */
  dischargeRegistrationDuty: makerProcedure('compliance:task:write')
    .input(
      z.object({
        /** The date the registration with the Authority was COMPLETED. */
        dischargedOn: z.string().datetime(),
        /** Optional: the server derives the frozen twin (ADR-0007); a supplied one is proven. */
        dischargedOnHijri: z
          .string()
          .regex(HIJRI_SNAPSHOT_PATTERN, 'a Hijri snapshot is a frozen yyyy-MM-dd string')
          .nullable()
          .optional(),
        /** Evidence of the registration — a `Document` id on THIS endowment. */
        evidenceId: z.string().min(1).max(128).optional(),
        triggerEvent: z.string().min(1).max(400),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertHumanActor(ctx, 'deadline.dischargeRegistrationDuty');

      const dischargedAt = new Date(input.dischargedOn);
      const dischargedHijri =
        input.dischargedOnHijri === null || input.dischargedOnHijri === undefined
          ? derivedHijriSnapshot(dischargedAt, 'dischargedOn')
          : assertHijriPairAgrees(
              dischargedAt,
              input.dischargedOnHijri,
              'dischargedOn',
              'dischargedOnHijri',
            );
      const dischargedDay = civilDateFromUtcDate(dischargedAt);
      const today = civilDateFromUtcDate(ctx.now);
      if (String(dischargedDay) > String(today)) {
        throw new ApiError(
          'GATE_NOT_CLEARED',
          `the registration cannot be recorded as completed on ${String(dischargedDay)}: that date is ` +
            `after today (${String(today)}). A discharge is a fact that has happened.`,
          { waqfId: ctx.waqfId, reason: 'DISCHARGE_IN_FUTURE' },
        );
      }

      if (input.evidenceId !== undefined) {
        const evidence = await ctx.db.document.findFirst({
          where: { id: input.evidenceId, waqfId: ctx.waqfId, deletedAt: null },
          select: { id: true },
        });
        if (evidence === null) throw notOnThisEndowment('document', ctx.waqfId);
      }

      // The calendar is read OUTSIDE the transaction, for the lateness figure only — a missing
      // calendar never blocks the discharge; it blanks the figure and says why.
      let calendar: HolidayCalendar | null = null;
      let latenessUnavailableBecause: string | null = null;
      try {
        calendar = await assembleCalendar(ctx.db, ctx.waqfId);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        latenessUnavailableBecause = error.code;
      }

      return auditedWrite(ctx.db, async (tx) => {
        const headId = await readAnchorChainHead(tx, ctx.waqfId, 'REGISTER_30BD', ctx.waqfId);
        if (headId === null) {
          throw new ApiError(
            'GATE_NOT_CLEARED',
            'there is no REGISTER_30BD deadline on record for this endowment, so there is nothing to ' +
              'discharge. Record a computable clock-start first — a discharge is recorded against the ' +
              'deadline it met. (A clock-start recorded but not computable has no deadline row: that ' +
              'gap is declared, not solved here.)',
            { waqfId: ctx.waqfId, reason: 'NO_REGISTRATION_DEADLINE_ON_RECORD' },
          );
        }
        const head = await tx.deadline.findUniqueOrThrow({
          where: { id: headId },
          select: {
            anchorDate: true,
            dueDate: true,
            dueDateHijri: true,
            satisfiedAt: true,
            complianceTaskId: true,
          },
        });
        if (head.satisfiedAt !== null) {
          throw new ApiError(
            'GATE_NOT_CLEARED',
            `the REGISTER_30BD duty on this endowment is already recorded as discharged (on ` +
              `${String(civilDateFromUtcDate(head.satisfiedAt))}). A recorded satisfaction is write-once; a ` +
              'wrong record is corrected on the record, by the audited recompute path.',
            {
              waqfId: ctx.waqfId,
              reason: 'REGISTRATION_ALREADY_DISCHARGED',
              headDeadlineId: headId,
            },
          );
        }
        if (dischargedAt.getTime() < head.anchorDate.getTime()) {
          throw new ApiError(
            'GATE_NOT_CLEARED',
            `the registration cannot have been completed on ${String(dischargedDay)}, before the recorded ` +
              `clock-start (${String(civilDateFromUtcDate(head.anchorDate))}). Either the date is an input ` +
              'error, or this endowment was registered before the duty could have attached — which is the ' +
              'open counsel question (memo, S11 second batch), not a MET record.',
            {
              waqfId: ctx.waqfId,
              reason: 'DISCHARGE_PRECEDES_CLOCK_START',
              headDeadlineId: headId,
            },
          );
        }

        // The task mirror (precedent): the bound GOV-REG-01 instance, else an open one this row can
        // bind to now (the NULL -> value transition migration 38 leaves movable), else none — reported.
        const taskId =
          head.complianceTaskId ?? (await readOpenTaskId(tx, ctx.waqfId, 'GOV-REG-01'));

        await tx.deadline.update({
          where: { id: headId },
          data: {
            satisfiedAt: dischargedAt,
            dischargeKind: 'MET' as never,
            ...(input.evidenceId === undefined ? {} : { satisfiedEvidenceId: input.evidenceId }),
            ...(head.complianceTaskId === null && taskId !== null
              ? { complianceTaskId: taskId }
              : {}),
          },
        });
        if (taskId !== null) {
          await tx.complianceTask.update({
            where: { id: taskId },
            data: {
              status: 'COMPLETED' as never,
              closeDate: dischargedAt,
              closeDateHijri: dischargedHijri,
            },
          });
        }

        // Lateness, once, for the record. `countBusinessDays` refuses outside coverage; the figure is
        // then null WITH the reason, never a guess.
        let lateByBusinessDays: number | null = null;
        if (calendar !== null) {
          try {
            lateByBusinessDays = countBusinessDays(
              civilDateFromUtcDate(head.dueDate),
              dischargedDay,
              calendar,
            );
          } catch (error) {
            if (!(error instanceof DomainError)) throw error;
            latenessUnavailableBecause = error.code;
          }
        }

        await recordEvent(
          toActorContext(ctx, { procedure: 'deadline.dischargeRegistrationDuty' }),
          {
            action: 'UPDATE',
            category: 'MUTATION',
            classification: 'ROUTINE',
            entityType: 'Deadline',
            entityId: headId,
            waqfId: ctx.waqfId,
            extraContext: {
              triggerEvent: input.triggerEvent,
              ruleKey: 'REGISTER_30BD',
              dischargeKind: 'MET',
              dischargedOn: String(dischargedDay),
              dischargedOnHijri: dischargedHijri,
              dueDate: String(civilDateFromUtcDate(head.dueDate)),
              dueDateHijri: head.dueDateHijri,
              lateByBusinessDays,
              latenessUnavailableBecause,
              taskMirrored: taskId !== null,
              taskId,
              evidenceId: input.evidenceId ?? null,
            },
          },
        );

        return {
          deadlineId: headId,
          dischargedOn: String(dischargedDay),
          dischargedOnHijri: dischargedHijri,
          dueDate: String(civilDateFromUtcDate(head.dueDate)),
          dueDateHijri: head.dueDateHijri,
          lateByBusinessDays,
          latenessUnavailableBecause,
          taskMirrored: taskId !== null,
          taskId,
        };
      });
    }),
});

/* ═════════════════════════════════════════════════
 * ⊕ S11-2 · a statutory duty is discharged by a PERSON
 * ═════════════════════════════════════════════════ */

/**
 * Refuses a non-human actor. A discharge or a filing asserts to the Authority that a statutory duty
 * was satisfied — an assertion only a person may make and answer for. The declared service seat
 * (`actorType: SYSTEM`, S10-3b) holds `compliance:task:write` for the sweep and would otherwise pass
 * the rung; this guard is the narrowing (a machine's authority narrows without an owner ruling;
 * widening would need one). Applied to EVERY procedure that sets `satisfiedAt` — one guard, N channels
 * (S10-T2's canon), never one of them. Measured before it landed: nothing automated calls either.
 */
function assertHumanActor(
  ctx: { readonly actor: { readonly actorType: string }; readonly waqfId: string },
  procedure: string,
): void {
  if (ctx.actor.actorType !== 'USER') {
    throw new ApiError(
      'PERMISSION_DENIED',
      `${procedure} records that a statutory duty was met — a human assertion. A ${ctx.actor.actorType} ` +
        'actor cannot make it, whatever verb its seat holds.',
      { waqfId: ctx.waqfId, reason: 'DISCHARGE_REQUIRES_HUMAN_ACTOR', procedure },
    );
  }
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⊕ S11-1 · the shared record-and-compute path behind the two anchor procedures
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface RecordedAnchor {
  readonly at: Date;
  readonly hijri: string;
  readonly kind: string | null;
}

interface RecordAnchorArgs {
  readonly ruleKey: 'REGISTER_30BD' | 'ISTIBDAL_10BD';
  readonly subject: AnchorSubject;
  /** The row the anchor lives on: the waqf id for the registration clock, the expropriation id otherwise. */
  readonly sourceId: string;
  readonly procedure: string;
  /** The obligation this clock discharges; the deadline is bound to an OPEN task of it if one exists. */
  readonly taskTemplateCode: string;
  readonly date: string | null;
  /** `null` = not supplied: the server's own derivation becomes the frozen twin (ADR-0007). */
  readonly dateHijri: string | null;
  readonly kind: string | null;
  readonly triggerEvent: string;
  /** Writes the anchor columns on the source row — `recorded === null` clears them. */
  readonly writeAnchor: (tx: Db, recorded: RecordedAnchor | null) => Promise<void>;
}

/** A compute refusal, carried by name — never swallowed, never allowed to reject the input. */
interface ComputeRefusal {
  readonly code: string;
  readonly refusal: string | null;
  readonly message: string;
}

type ComputeOutcome =
  | {
      readonly ok: true;
      readonly computed: ComputedRuleDeadline;
      readonly settings: RuleSettingValues;
    }
  | { readonly ok: false; readonly refusal: ComputeRefusal };

/**
 * Compute the deadline, or REFUSE BY NAME — a DomainError from the calendar, the settings or the
 * rule arithmetic becomes a value the caller records rather than an exception that would roll the
 * operator's input back with it. Anything that is not a DomainError is a defect and propagates.
 */
async function computeOrRefuse(
  db: Db,
  waqfId: string,
  ruleKey: string,
  anchor: CivilDate,
): Promise<ComputeOutcome> {
  try {
    const calendar = await assembleCalendar(db, waqfId);
    const settings = await resolveRuleSettings(db, waqfId, ruleKey);
    const computed = computeRuleDeadline({ ruleKey, anchor, calendar, settings });
    return { ok: true, computed, settings };
  } catch (error) {
    if (error instanceof DomainError) {
      const details = (error.details ?? {}) as Record<string, unknown>;
      const refusal = details['refusal'];
      return {
        ok: false,
        refusal: {
          code: error.code,
          refusal: typeof refusal === 'string' ? refusal : null,
          message: error.message,
        },
      };
    }
    throw error;
  }
}

/** The live head of this source's correction chain, read through the provenance frozen in each row. */
async function readAnchorChainHead(
  tx: Db,
  waqfId: string,
  ruleKey: string,
  sourceId: string,
): Promise<string | null> {
  const rows = await tx.deadline.findMany({
    where: { waqfId, ruleKey, deletedAt: null },
    select: { id: true, windowSnapshot: true, recomputedTo: { select: { id: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return selectAnchorChainHead(
    ruleKey,
    sourceId,
    rows.map((row) => ({
      id: row.id,
      provenance: anchorProvenanceOf(row.windowSnapshot),
      supersededById: row.recomputedTo?.id ?? null,
    })),
  );
}

/** An OPEN task instance of the template on this endowment, to bind the deadline to — or null. */
async function readOpenTaskId(
  tx: Db,
  waqfId: string,
  templateCode: string,
): Promise<string | null> {
  const task = await tx.complianceTask.findFirst({
    where: {
      waqfId,
      templateCode,
      status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
      deletedAt: null,
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return task === null ? null : task.id;
}

async function recordAnchor(
  ctx: ScopedContext,
  args: RecordAnchorArgs,
): Promise<{
  recorded: { date: string; dateHijri: string; kind: string | null } | null;
  deadline: Record<string, unknown> | null;
  computeRefusal: ComputeRefusal | null;
  supersededDeadlineId: string | null;
  withdrawnDeadlineId: string | null;
  unverifiedNote: string | null;
}> {
  // ── 1 · the operator's fact, proven not trusted (V-E3-M1) ─────────────────────────────────
  let recorded: RecordedAnchor | null = null;
  if (args.date !== null) {
    const at = new Date(args.date);
    // The frozen twin is the SERVER's derivation either way (ADR-0007, one implementation): a caller
    // that supplies one is proven against it, a caller that supplies none (the web app, which has no
    // calendar code by design) gets it derived. Neither path stores half a pair.
    const hijri =
      args.dateHijri === null
        ? derivedHijriSnapshot(at, 'date')
        : assertHijriPairAgrees(at, args.dateHijri, 'date', 'dateHijri');
    recorded = { at, hijri, kind: args.kind };
  }

  // ── 2 · the arithmetic, BEFORE the transaction — reads only, and a refusal is a value ───────
  const outcome =
    recorded === null
      ? null
      : await computeOrRefuse(ctx.db, ctx.waqfId, args.ruleKey, civilDateFromUtcDate(recorded.at));

  const provenance: AnchorProvenance = {
    subject: args.subject,
    sourceId: args.sourceId,
    kind: args.kind,
  };

  return auditedWrite(ctx.db, async (tx) => {
    const headId = await readAnchorChainHead(tx, ctx.waqfId, args.ruleKey, args.sourceId);
    // ⊕ S11-2 — the head's DISCHARGE state (owner ruling f797fea). A discharged chain may be CORRECTED
    // (the met fact carries forward onto the new row — the duty was met on that date whatever the
    // window; only lateness moves) but never CLEARED or withdrawn: "I do not know the clock-start"
    // cannot coexist with "met on X against that clock". Read before anything is written.
    const head =
      headId === null
        ? null
        : await tx.deadline.findUnique({
            where: { id: headId },
            select: { satisfiedAt: true, satisfiedEvidenceId: true, dischargeKind: true },
          });
    const headDischarged = head !== null && head.satisfiedAt !== null;
    if (headDischarged && (outcome === null || !outcome.ok)) {
      throw new ApiError(
        'GATE_NOT_CLEARED',
        `the ${args.ruleKey} duty on this endowment is recorded as DISCHARGED (met); its clock-start ` +
          (recorded === null
            ? 'cannot be cleared'
            : 'cannot be moved to a date whose deadline cannot be computed') +
          ' — that would withdraw a met statutory fact. Correct the clock-start to a computable date ' +
          'instead; the discharge carries forward onto the corrected deadline.',
        {
          waqfId: ctx.waqfId,
          reason: 'ANCHOR_CLEAR_REFUSED_DUTY_DISCHARGED',
          ruleKey: args.ruleKey,
          headDeadlineId: headId,
        },
      );
    }

    // The anchor is written FIRST and UNCONDITIONALLY (property 2): whatever the compute says, the
    // operator's input is on record. The extension audits this row diff itself.
    await args.writeAnchor(tx, recorded);

    const actor = toActorContext(ctx, { procedure: args.procedure });

    // ── 3a · a computed deadline: INSERT, chained from the head if one stands ────────────────
    if (outcome !== null && outcome.ok && recorded !== null) {
      const taskId = await readOpenTaskId(tx, ctx.waqfId, args.taskTemplateCode);
      const created = await tx.deadline.create({
        data: {
          ...deadlineCreateData({
            waqfId: ctx.waqfId,
            complianceTaskId: taskId,
            computed: outcome.computed,
            settings: outcome.settings,
            anchorAt: recorded.at,
            anchorHijri: recorded.hijri,
            createdBy: ctx.actor.actorId,
            recomputedFromId: headId,
            anchorSource: provenance,
          }),
          // ⊕ S11-2 — the discharge CARRIES FORWARD (an INSERT: migration 38's write-once is BEFORE
          // UPDATE; `deadline_evidence_with_met` and `deadline_state_coherent` hold — evidence beside
          // met, no waiver). The duty was met on that date whatever the window; only lateness moves.
          ...(headDischarged && head !== null
            ? {
                satisfiedAt: head.satisfiedAt,
                satisfiedEvidenceId: head.satisfiedEvidenceId,
                dischargeKind: head.dischargeKind,
              }
            : {}),
        } as never,
        select: DEADLINE_SELECT,
      });
      await recordEvent(actor, {
        action: 'CREATE',
        category: 'MUTATION',
        classification: 'ROUTINE',
        entityType: 'Deadline',
        entityId: created.id,
        waqfId: ctx.waqfId,
        extraContext: {
          ruleKey: args.ruleKey,
          triggerEvent: args.triggerEvent,
          anchorSubject: args.subject,
          anchorSourceId: args.sourceId,
          anchorKind: args.kind,
          supersededDeadlineId: headId,
          dischargeCarriedForwardFrom: headDischarged ? headId : null,
          dueDate: outcome.computed.computed.due.gregorian,
          dueDateHijri: outcome.computed.computed.due.hijri,
          unverified: outcome.computed.computed.unverifiedNote !== null,
        },
      });
      return {
        recorded: {
          date: String(civilDateFromUtcDate(recorded.at)),
          dateHijri: recorded.hijri,
          kind: recorded.kind,
        },
        deadline: created as unknown as Record<string, unknown>,
        computeRefusal: null,
        supersededDeadlineId: headId,
        withdrawnDeadlineId: null,
        unverifiedNote: outcome.computed.computed.unverifiedNote,
      };
    }

    // ── 3b · no computable deadline (cleared, or refused by name): the standing head is WITHDRAWN ─
    // A frozen date computed from a fact no longer on record does not stand. Soft-delete is the
    // guard family's sanctioned path (migration 38 keeps the lifecycle columns movable); the row
    // itself is retained. Audited twice — the extension's row diff, and this named event.
    if (headId !== null) {
      await tx.deadline.update({ where: { id: headId }, data: { deletedAt: ctx.now } });
      await recordEvent(actor, {
        action: 'DELETE_SOFT',
        category: 'MUTATION',
        classification: 'ROUTINE',
        entityType: 'Deadline',
        entityId: headId,
        waqfId: ctx.waqfId,
        extraContext: {
          ruleKey: args.ruleKey,
          triggerEvent: args.triggerEvent,
          anchorSubject: args.subject,
          anchorSourceId: args.sourceId,
          withdrawnBecause:
            recorded === null ? 'anchor cleared' : 'anchor corrected to a date that cannot compute',
        },
      });
    }

    if (outcome !== null && !outcome.ok && recorded !== null) {
      // THE REFUSAL IS ON THE RECORD, BY NAME — this is what lets a screen say "recorded — not
      // computable (calendar coverage)" instead of "nothing due".
      await recordEvent(actor, {
        action: 'UPDATE',
        category: 'MUTATION',
        classification: 'ROUTINE',
        entityType: 'DeadlineComputation',
        entityId: `${args.ruleKey}:${args.sourceId}`,
        waqfId: ctx.waqfId,
        extraContext: {
          ruleKey: args.ruleKey,
          triggerEvent: args.triggerEvent,
          anchorSubject: args.subject,
          anchorSourceId: args.sourceId,
          anchorKind: args.kind,
          anchorDate: String(civilDateFromUtcDate(recorded.at)),
          anchorDateHijri: recorded.hijri,
          computeRefusal: outcome.refusal,
          withdrawnDeadlineId: headId,
        },
      });
      return {
        recorded: {
          date: String(civilDateFromUtcDate(recorded.at)),
          dateHijri: recorded.hijri,
          kind: recorded.kind,
        },
        deadline: null,
        computeRefusal: outcome.refusal,
        supersededDeadlineId: null,
        withdrawnDeadlineId: headId,
        unverifiedNote: null,
      };
    }

    return {
      recorded: null,
      deadline: null,
      computeRefusal: null,
      supersededDeadlineId: null,
      withdrawnDeadlineId: headId,
      unverifiedNote: null,
    };
  });
}
