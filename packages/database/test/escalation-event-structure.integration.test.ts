/**
 * S9-3d — §09's ESCALATION RECORD at rest, and "cannot be dismissed, only resolved" as a refusal
 * (migration 41), driven against real rows.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * TWO CLAIMS, AND THE SECOND IS THE ONE WITH TEETH
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *  1. **The escalation record is append-only.** An escalation event is the evidence that somebody
 *     was told, at a rung, on a day — and the party with the strongest motive to edit it is the
 *     party it escalated past. Every column except `deletedAt` is sealed; DELETE and TRUNCATE are
 *     refused outright.
 *  2. **A zero-tolerance deadline cannot be WAIVED.** §09: those obligations *"cannot be dismissed,
 *     only resolved"*. Migration 38 made `waivedAt` write-once — which is **not** the same as
 *     unavailable: one waiver is a dismissal under another name, and it is the cheapest possible way
 *     to stop a missed registration deadline escalating. Migration 41 refuses it outright, on INSERT
 *     as well as UPDATE (CENSUS-2's rule: an act refused as a transition and permitted as a birth is
 *     C-10, measured twice in this repository).
 *
 * ── AND THE VOCABULARY IS COMPARED, NOT TRUSTED ─────────────────────────────────────────────
 * The zero-tolerance set is restated in SQL (`qmulate_zero_tolerance_rule_keys()`) because a guard
 * running inside Postgres cannot import `DEADLINE_RULES`. That duplication is a declared cost, and
 * the pin below is the whole mitigation: the SQL list is read back and compared against the domain
 * descriptor's own `zeroTolerance` flags.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { DEADLINE_RULES, DEADLINE_RULE_KEYS, ESCALATION_LEVELS } from '@qmulate/domain';

import {
  assertGuardsInstalled,
  closeDatabase,
  hasDatabase,
  privilegedPrisma,
  privilegedSql,
  retentionRemainderScaffoldingSql,
  warnNoDatabase,
} from './setup.js';

warnNoDatabase('S9-3d escalation record + zero-tolerance no-waiver (migration 41)');

const WAQF = 'waqf-001';
const RUN = `${String(process.pid)}${Math.trunc(Date.now() / 1000).toString(36)}`;
const EVENT = `test-esc-${RUN}`;
const ZT_DEADLINE = `test-esc-zt-${RUN}`;
const ORD_DEADLINE = `test-esc-ord-${RUN}`;

const SNAPSHOT = {
  settingKey: 'deadline.UPDATE_15BD.businessDays',
  basis: 'business_days',
  businessDays: 15,
  roll: 'following',
  unverified: true,
};

async function createDeadline(id: string, ruleKey: string, extra = ''): Promise<void> {
  const raw = await privilegedPrisma();
  await raw.$executeRawUnsafe(
    privilegedSql(
      `INSERT INTO "deadline"
         ("id","waqfId","ruleKey","anchorDate","anchorDateHijri","dueDate","dueDateHijri",
          "windowSnapshot","updatedAt"${extra === '' ? '' : ',"waivedAt","waivedReason"'})
       VALUES ('${id}', '${WAQF}', '${ruleKey}', '2026-05-06T00:00:00.000Z', '1447-11-19',
               '2026-05-27T00:00:00.000Z', '1447-12-10',
               '${JSON.stringify(SNAPSHOT)}'::jsonb, now()${extra})`,
    ),
  );
}

async function createEvent(id: string, over: Record<string, string> = {}): Promise<void> {
  const raw = await privilegedPrisma();
  const cols: Record<string, string> = {
    id: `'${id}'`,
    waqfId: `'${WAQF}'`,
    deadlineId: `'${ORD_DEADLINE}'`,
    level: `'NAZIR'::"EscalationLevel"`,
    derivedStatus: `'overdue'`,
    businessDaysOverdue: '4',
    ladderUsed: `'ordinary'`,
    asOfDate: `'2026-06-02T00:00:00.000Z'`,
    asOfDateHijri: `'1447-12-16'`,
    ...over,
  };
  await raw.$executeRawUnsafe(
    privilegedSql(
      `INSERT INTO "escalation_event" (${Object.keys(cols)
        .map((k) => `"${k}"`)
        .join(', ')}) VALUES (${Object.values(cols).join(', ')})`,
    ),
  );
}

async function cleanup(): Promise<void> {
  const raw = await privilegedPrisma();
  await raw.$executeRawUnsafe(
    retentionRemainderScaffoldingSql([
      `DELETE FROM "escalation_event" WHERE "id" LIKE 'test-esc-%'`,
      `DELETE FROM "deadline" WHERE "id" LIKE 'test-esc-%'`,
    ]),
  );
}

describe.runIf(hasDatabase)('S9-3d · the escalation record at rest (migration 41)', () => {
  beforeAll(async () => {
    await assertGuardsInstalled();
    await cleanup();
    await createDeadline(ORD_DEADLINE, 'ISTIBDAL_10BD');
    await createEvent(EVENT);
  });

  afterAll(async () => {
    await cleanup();
    await closeDatabase();
  });

  /* ── 1 · the SQL/domain vocabulary pin ─────────────────────────────────────────────────── */

  it('the SQL zero-tolerance list EQUALS the domain descriptor — the duplication is compared', async () => {
    const raw = await privilegedPrisma();
    const rows = await raw.$queryRawUnsafe<{ keys: string[] }[]>(
      `SELECT qmulate_zero_tolerance_rule_keys() AS keys`,
    );
    const fromSql = [...(rows[0]?.keys ?? [])].sort();
    const fromDomain = DEADLINE_RULE_KEYS.filter((key) => DEADLINE_RULES[key].zeroTolerance).sort();
    expect(
      fromSql,
      'THE TWO SPELLINGS OF THE ZERO-TOLERANCE SET HAVE DRIFTED. The authoritative list is ' +
        "`DEADLINE_RULES[key].zeroTolerance` (§09's rule table); migration 41 restates it in SQL " +
        'because a Postgres guard cannot import it. This pin is the entire mitigation for that ' +
        'duplication — an uncompared second spelling is the defect this repository has been bitten ' +
        'by five times. Fix the SQL function, not this assertion.',
    ).toStrictEqual([...fromDomain]);
    // Non-empty: an empty SQL list would make the no-waiver guard a no-op while looking installed.
    expect(fromSql.length).toBeGreaterThan(0);
  });

  it('the escalation-level enum matches the domain path, member for member', async () => {
    const raw = await privilegedPrisma();
    const rows = await raw.$queryRawUnsafe<{ label: string }[]>(
      `SELECT e.enumlabel AS label FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'EscalationLevel' ORDER BY e.enumsortorder`,
    );
    expect(rows.map((row) => row.label)).toStrictEqual(
      ESCALATION_LEVELS.map((level) => level.toUpperCase()),
    );
  });

  /* ── 2 · append-only ───────────────────────────────────────────────────────────────────── */

  it('every recorded column is sealed — the app role AND the migrator alike', async () => {
    const raw = await privilegedPrisma();
    for (const [column, value] of [
      ['level', `'LEADERSHIP'::"EscalationLevel"`],
      ['derivedStatus', `'at_risk'`],
      ['businessDaysOverdue', '99'],
      ['ladderUsed', `'zero_tolerance'`],
      ['asOfDate', `'2026-06-03T00:00:00.000Z'`],
      ['asOfDateHijri', `'1447-12-17'`],
      ['deadlineId', `'${ZT_DEADLINE}'`],
      ['waqfId', `'waqf-002'`],
    ] as const) {
      await expect(
        raw.$executeRawUnsafe(
          privilegedSql(
            `UPDATE "escalation_event" SET "${column}" = ${value} WHERE "id" = '${EVENT}'`,
          ),
        ),
        `${column} must be sealed`,
      ).rejects.toThrow(/APPEND-ONLY|evidence of notification/i);
    }
  });

  it('the refusal names WHY, not just that — the party with the motive to edit it', async () => {
    const raw = await privilegedPrisma();
    let message = '';
    try {
      await raw.$executeRawUnsafe(
        // ⚠ A DIFFERENT VALUE, and the first draft's mistake is worth keeping in view: it set
        // `level = 'NAZIR'` on a row whose level ALREADY was NAZIR, and nothing refused — correctly,
        // because the guard compares with `IS DISTINCT FROM` and a no-op UPDATE changes nothing.
        // A test that "proves" a seal by writing the value already there proves nothing.
        privilegedSql(
          `UPDATE "escalation_event" SET "level" = 'LEADERSHIP'::"EscalationLevel" WHERE "id" = '${EVENT}'`,
        ),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    // A refusal that does not name the legal alternative gets the guard deleted by the next person
    // who hits it (migration 6 §1's own reasoning).
    expect(message).toMatch(/escalated past/i);
    expect(message).toMatch(/deletedAt/);
  });

  it('LIVENESS: soft-delete still works — the one column that may move', async () => {
    const softId = `test-esc-soft-${RUN}`;
    // A DIFFERENT day from the fixture event: (deadline, rung, day) is unique, so reusing the
    // defaults would fail on 23505 before the soft-delete could be exercised at all.
    await createEvent(softId, { asOfDate: `'2026-06-10T00:00:00.000Z'` });
    const raw = await privilegedPrisma();
    const retired = await raw.$executeRawUnsafe(
      privilegedSql(`UPDATE "escalation_event" SET "deletedAt" = now() WHERE "id" = '${softId}'`),
    );
    expect(retired).toBe(1);
  });

  it('DELETE and TRUNCATE are refused, naming this table', async () => {
    const raw = await privilegedPrisma();
    let message = '';
    try {
      await raw.$executeRawUnsafe(
        privilegedSql(`DELETE FROM "escalation_event" WHERE "id" = '${EVENT}'`),
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/DELETE on "escalation_event" is refused/);
    expect(message).toMatch(/nobody was ever warned/i);
    await expect(
      raw.$executeRawUnsafe(privilegedSql(`TRUNCATE TABLE "escalation_event"`)),
    ).rejects.toThrow(/TRUNCATE on "escalation_event" is refused/);
  });

  /* ── 3 · the CHECKs and the idempotency index ─────────────────────────────────────────── */

  it('only an OVERDUE state may be recorded — at_risk is not late', async () => {
    await expect(
      createEvent(`test-esc-atrisk-${RUN}`, { derivedStatus: `'at_risk'` }),
    ).rejects.toThrow(/escalation_event_only_overdue_escalates/i);
    // …and a negative day count is unrepresentable too.
    await expect(createEvent(`test-esc-neg-${RUN}`, { businessDaysOverdue: '-1' })).rejects.toThrow(
      /escalation_event_only_overdue_escalates/i,
    );
  });

  it('an unknown ladder name is unrepresentable', async () => {
    await expect(
      createEvent(`test-esc-ladder-${RUN}`, { ladderUsed: `'whatever'` }),
    ).rejects.toThrow(/escalation_event_ladder_known/i);
  });

  it('ONE escalation per (deadline, rung, day) — a retried cron is a no-op, not a second record', async () => {
    // The transport's idempotency key as a constraint. `escalationIdempotencyKey` puts the DAY in
    // the key deliberately, so the SAME rung on the NEXT day is a new record — that is §09's ladder
    // continuing to speak, not a duplicate.
    let message = '';
    try {
      await createEvent(`test-esc-dupe-${RUN}`);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/23505/);

    // The SAME deadline and rung on a DIFFERENT day is permitted, and must be.
    await expect(
      createEvent(`test-esc-nextday-${RUN}`, { asOfDate: `'2026-06-03T00:00:00.000Z'` }),
    ).resolves.not.toThrow();
    // A different RUNG on the same day is permitted too — reaching the Nazir does not consume the
    // Case Manager's own record of having been told.
    await expect(
      createEvent(`test-esc-otherrung-${RUN}`, { level: `'CASE_MANAGER'::"EscalationLevel"` }),
    ).resolves.not.toThrow();
  });

  /* ── 4 · "cannot be dismissed, only resolved" ─────────────────────────────────────────── */

  describe('a zero-tolerance deadline cannot be WAIVED — on UPDATE or at BIRTH', () => {
    it('the UPDATE is refused, and the message says the only exit is being MET', async () => {
      await createDeadline(ZT_DEADLINE, 'UPDATE_15BD');
      const raw = await privilegedPrisma();
      let message = '';
      try {
        await raw.$executeRawUnsafe(
          privilegedSql(
            `UPDATE "deadline" SET "waivedAt" = now(), "waivedReason" = 'excused'
               WHERE "id" = '${ZT_DEADLINE}'`,
          ),
        );
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toMatch(/ZERO-TOLERANCE and cannot be WAIVED/i);
      expect(message).toMatch(/satisfiedAt/);
      // ⚠ The distinction migration 38 alone did not make: write-once is not unavailable.
      expect(message).toMatch(
        /write-once, which is not\s+the same as unavailable|not '?\s*the same as unavailable/i,
      );
    });

    it("a row BORN waived is refused too — CENSUS-2's rule, not a nicety", async () => {
      // The identical act refused as a transition and committed as a birth is C-10, measured twice
      // in this repository. Migration 41's trigger is BEFORE INSERT OR UPDATE for exactly this.
      await expect(
        createDeadline(
          `test-esc-born-${RUN}`,
          'REGISTER_30BD',
          `, '2026-06-01T00:00:00.000Z', 'excused at birth'`,
        ),
      ).rejects.toThrow(/ZERO-TOLERANCE and cannot be WAIVED/i);
    });

    it('LIVENESS: a NON-zero-tolerance deadline may still be waived, and the ZT one may be MET', async () => {
      const raw = await privilegedPrisma();
      // The guard must not have frozen the whole waiver mechanism — §09 waives ordinary clocks.
      const waived = await raw.$executeRawUnsafe(
        privilegedSql(
          `UPDATE "deadline" SET "waivedAt" = now(), "waivedReason" = 'ordinary clock excused'
             WHERE "id" = '${ORD_DEADLINE}'`,
        ),
      );
      expect(waived).toBe(1);

      // …and the zero-tolerance one still has its ONE legal exit.
      const met = await raw.$executeRawUnsafe(
        // ⊕ S11-2 (migration 49): being MET is the PAIR — `satisfiedAt` with its `dischargeKind`.
        privilegedSql(
          `UPDATE "deadline" SET "satisfiedAt" = now(), "dischargeKind" = 'MET' WHERE "id" = '${ZT_DEADLINE}'`,
        ),
      );
      expect(met, 'being MET is the only way a zero-tolerance deadline leaves the ladder').toBe(1);
    });
  });
});
