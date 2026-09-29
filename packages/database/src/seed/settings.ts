// QMULATE — the seeded `Setting` rows: every regulatory figure in the system, in one place.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// BINDING RULE 3 — THE STALENESS RULE
// ═══════════════════════════════════════════════════════════════════════════════════════════
// EVERY numeric threshold, statutory deadline, fee percentage and classification band in this
// repository is UNVERIFIED until confirmed against primary Saudi law (the Arabic regulation
// originals + Saudi counsel). Therefore:
//
//   • None of these figures is a code constant. Every one lives in a `Setting` row, so a
//     correction is a CONFIG CHANGE, not a code change and not a deploy.
//   • Every unverified figure carries the marker "⚠ unverified — confirm vs primary law"
//     INSIDE its stored value, so the caveat travels with the data into any report, export or
//     UI that renders it. A figure cannot be quoted without its caveat coming along.
//   • Nothing here may be presented to a user as settled truth.
//
// The envelope shape (E1 contract §H) keeps §07's `value Json` column unchanged:
//   { "v": <value>, "unit": <string|null>, "unverified": <bool>, "source": <string>,
//     "note": "⚠ unverified — confirm vs primary law" }      // `note` present iff `unverified`
//
// The `setting()` builder below ADDS THE NOTE AUTOMATICALLY whenever `unverified` is true, so an
// author physically cannot forget the marker.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// THE TWO 10%s — never conflate them
// ═══════════════════════════════════════════════════════════════════════════════════════════
//   `nazirFee.percentOfRevenue` = 10% of REVENUE — QMULATE's own trustee fee, set by the
//   DEED (customary ʿushr / عُشر, Nazarah Art. 11), payable to the Nazir.
//   `authorityFee.maxPercentOfNetIncome` = ≤10% of NET INCOME — the AWQAF AUTHORITY's own fee
//   (Awqaf Law Art. 14) on endowments not under its trusteeship. Different payee, different base,
//   different instrument. They are seeded as two separate keys precisely so no future reader can
//   collapse them into "the 10% rule".

import { z } from 'zod';

/** The marker every unverified regulatory figure carries with it. */
export const UNVERIFIED_NOTE = '⚠ unverified — confirm vs primary law';

/** JSON-safe value types a Setting may hold. Money is a STRING (JS `number` is banned for money). */
export type SettingScalar = string | number | boolean | readonly string[] | readonly number[];

export const settingValueSchema = z
  .object({
    v: z.union([z.string(), z.number(), z.boolean(), z.array(z.string()), z.array(z.number())]),
    unit: z.string().nullable(),
    unverified: z.boolean(),
    source: z.string().min(1),
    note: z.string().optional(),
  })
  .strict()
  .refine(
    (value) => (value.unverified ? value.note === UNVERIFIED_NOTE : value.note === undefined),
    `an unverified Setting must carry note "${UNVERIFIED_NOTE}"; a verified one must carry none`,
  );

export type SettingValue = z.infer<typeof settingValueSchema>;

export interface SeedSetting {
  /** Deterministic id: `setting-<key>` globally, `setting-<waqfId>-<key>` for an override. */
  readonly id: string;
  /** null = global. A per-waqf row overrides the global one of the same key. */
  readonly waqfId: string | null;
  readonly key: string;
  readonly value: SettingValue;
}

function setting(
  key: string,
  input: { v: SettingScalar; unit: string | null; unverified: boolean; source: string },
  waqfId: string | null = null,
): SeedSetting {
  const value: SettingValue = settingValueSchema.parse({
    v: input.v,
    unit: input.unit,
    unverified: input.unverified,
    source: input.source,
    ...(input.unverified ? { note: UNVERIFIED_NOTE } : {}),
  });
  return {
    id: waqfId === null ? `setting-${key}` : `setting-${waqfId}-${key}`,
    waqfId,
    key,
    value,
  };
}

/**
 * GLOBAL settings (`waqfId = null`).
 *
 * Ordering is fixed and meaningful: the seed writes them in this order, and every audit event's
 * `occurredAt` is `SEED_EPOCH + <insertion ordinal>`, so reordering this array would change the
 * frozen audit hash chain. Append, do not reorder.
 */
export const GLOBAL_SETTINGS: readonly SeedSetting[] = [
  // ── classification bands ────────────────────────────────────────────────────────────────
  setting('classification.threshold.large.sar', {
    v: '200000000.00',
    unit: 'SAR',
    unverified: true,
    source: 'Nazarah Regulation (classification bands) — secondary summary, not primary text',
  }),
  setting('classification.threshold.medium.sar', {
    v: '50000000.00',
    unit: 'SAR',
    unverified: true,
    source: 'Nazarah Regulation (classification bands) — secondary summary, not primary text',
  }),

  // ── Nazir remuneration (deed-set) ───────────────────────────────────────────────────────
  setting('nazirFee.basis.default', {
    v: 'PERCENT_OF_REVENUE',
    unit: null,
    // NOT a regulatory figure: the basis is CONTRACTUAL, fixed by the deed (Nazarah Art. 11),
    // so there is no primary-law figure to verify it against.
    unverified: false,
    source: 'waqf deed (engagement default)',
  }),
  // ⚠ RENAMED IN E2/S2, AND THE RENAME IS THE POINT (EXIT-3).
  //
  // This global row was seeded as `nazirFee.percentOfRevenue.default` while the per-waqf override
  // below was seeded as `nazirFee.percentOfRevenue` — TWO DIFFERENT KEYS with no fallback link
  // between them. Ask the resolver for the `.default` key and the endowment override is silently
  // ignored; ask for the bare key and every endowment except waqf-001 has no global fallback at
  // all. Either way EXIT-3 ("a fee-basis change via `Setting` flows through with no redeploy")
  // cannot hold, and the failure is invisible because both rows exist and both parse.
  //
  // The canonical key is the UN-SUFFIXED one — it is what `packages/domain/src/settings.ts`
  // registers, and `nazirFee.basis.default` keeps its suffix only because "default basis" is
  // genuinely a different concept from "the basis on this endowment". Migration
  // `00000000000003_e2_authority_guards` converges an already-seeded database.
  setting('nazirFee.percentOfRevenue', {
    v: 10,
    unit: 'percent',
    unverified: true,
    source: 'waqf deed — customary ʿushr (عُشر), a tenth of revenue; NOT a statutory rate',
  }),

  // ── the Authority's OWN, separate fee — different payee and base ────────────────────────
  setting('authorityFee.maxPercentOfNetIncome', {
    v: 10,
    unit: 'percent',
    unverified: true,
    source:
      "Awqaf Law Art. 14 — the General Authority for Awqaf's own fee on endowments not under " +
      'its trusteeship. NOT the Nazir fee above.',
  }),

  // ── statutory windows (the deadline engine resolves these; nothing is hard-coded) ───────
  setting('deadline.REGISTER_30BD.businessDays', {
    v: 30,
    unit: 'business_days',
    unverified: true,
    source: 'Nazarah Regulation — registration window',
  }),
  setting('deadline.UPDATE_15BD.businessDays', {
    v: 15,
    unit: 'business_days',
    unverified: true,
    source: 'Nazarah Regulation — material-change update window',
  }),
  setting('deadline.ISTIBDAL_10BD.businessDays', {
    v: 10,
    unit: 'business_days',
    unverified: true,
    source: 'Nazarah Regulation — istibdal (substitution) Authority-notice window',
  }),
  setting('deadline.DISTRIBUTE_3M_FYE.months', {
    v: 3,
    unit: 'months',
    unverified: true,
    source:
      'Nazarah Regulation — distribution window after fiscal-year end where the deed is silent',
  }),

  // ── KYC / retention ─────────────────────────────────────────────────────────────────────
  setting('kyc.refreshIntervalMonths', {
    v: 12,
    unit: 'months',
    unverified: true,
    source: 'Beneficial Ownership Standards — UBO refresh cadence',
  }),
  setting('retention.minimumYears', {
    v: 10,
    unit: 'years',
    unverified: true,
    source: 'Nazarah Regulation — document retention floor',
  }),

  // ── distribution rounding ───────────────────────────────────────────────────────────────
  setting('distribution.rounding.unitMinor', {
    v: 1,
    unit: 'halala',
    // Arithmetic granularity, not a legal figure: SAR's minor unit is the halala, 1/100.
    unverified: false,
    source: 'SAR minor unit',
  }),
  setting('distribution.rounding.method', {
    v: 'LARGEST_REMAINDER_HALF_UP',
    unit: null,
    unverified: true,
    source:
      'OQ-01 — pending Product/Counsel sign-off; the remainder allocation rule is not settled',
  }),

  // ── calendar ────────────────────────────────────────────────────────────────────────────
  setting('calendar.workweek', {
    v: ['SUN', 'MON', 'TUE', 'WED', 'THU'],
    unit: null,
    // The KSA Sun–Thu working week is an operating fact, not a figure to verify against a statute.
    unverified: false,
    source: 'operating model (KSA working week; Fri/Sat weekend)',
  }),

  // ── session security (APPENDED IN S2/E2 — see the ordering note above) ───────────────────
  //
  // ⚠ WITHOUT THIS ROW EVERY APPROVE AND EVERY SIGN DENIES. D-6 makes the TOTP step-up window
  // `Setting`-driven and fail-closed: `readStepUpWindowSeconds` returns null for an absent row and
  // the approval rung turns that into `TOTP_STEP_UP_REQUIRED`. The key shipped registered nowhere
  // and seeded nowhere, so the Nazir — the sole approval authority — could approve nothing at all
  // on a database built by migrate+seed. The deny direction was correct, which is precisely why
  // nothing caught it: a fail-closed hole looks like the feature working.
  //
  // ⚠ AND IT IS APPENDED, NOT INSERTED. Each seeded write takes `occurredAt = SEED_EPOCH +
  // <insertion ordinal>`, so moving this row earlier would renumber every write after it and
  // rewrite the audit hash chain over rows that never changed.
  //
  // NOT `unverified` — and that is a judgement, recorded here rather than left implicit. This
  // figure comes from NFR-06 (§15: re-auth to approve a disbursement; a ≤30-minute idle ceiling
  // WE set), not from primary Saudi law, so binding rule 3's marker does not apply: it is an
  // operational security knob in the same class as `calendar.workweek`. 600s matches the
  // documentary `STEP_UP_FRESH_AGE_SECONDS` in `packages/auth`, which the check deliberately
  // never reads — a code fallback is how a fail-closed guard becomes fail-open.
  setting('auth.totpStepUp.freshnessSeconds', {
    v: 600,
    unit: 'seconds',
    unverified: false,
    source: 'NFR-06 / §15 — QMULATE session-security policy (operational, not a statutory figure)',
  }),

  // ── distribution timing + ṣiyāna (APPENDED IN S3/E6 — see the ordering note above) ───────
  //
  // ⚠ APPENDED, NOT INSERTED next to the other `distribution.*` rows above, for the same reason
  // `auth.totpStepUp.freshnessSeconds` is: each seeded write takes `occurredAt = SEED_EPOCH +
  // <insertion ordinal>`, so grouping these two with their siblings would renumber every write
  // after them and rewrite the audit hash chain over rows that never changed. Read the keys, not
  // the layout.
  //
  // Both keys are registered in `packages/domain/src/settings.ts` and listed in
  // `UNVERIFIED_FIGURE_KEYS`. `packages/domain/src/__tests__/settings.test.ts` asserts
  // SETTING_SCHEMAS ↔ these rows in BOTH directions, so a registered key with no row here fails
  // the build — which is exactly how this omission was caught.

  // S3 decision D2. `deadlineGregorian = FYE + N calendar months` and `deadlineHijri =
  // Hijri(FYE) + N Hijri months` land on DIFFERENT DAYS (FYE 2026-12-31 → 2027-03-31 vs
  // 1448-10-22 = 2027-03-30, one day apart). Which one a Nazir is actually late against is a
  // question of Saudi law, so it is configuration and not a coded choice. `EARLIER_OF` is the
  // direction in which lateness can never be UNDER-reported; the engine reports both dates
  // whichever is selected.
  setting('distribution.deadline.bindingCalendar', {
    v: 'EARLIER_OF',
    unit: null,
    unverified: true,
    source:
      'S3 decision D2 — counsel memo pending; which calendar binds the post-FYE distribution window is not settled',
  }),
  // §08's own open question on the ṣiyāna (صيانة) reserve when the Shart al-Waqif is SILENT about
  // maintenance ("confirm vs a prudential minimum"). The DISTRIBUTION ENGINE NEVER READS THIS ROW
  // — `maintenance` is always injected into `runDistribution` as an already-resolved rule. It is
  // seeded so the eventual answer is a config change rather than a code change, and so the caller
  // that assembles the engine input cannot quietly hardcode `NONE`.
  //
  // `NONE` is the "we have not decided" value, NOT a fiqh position: reserving nothing when the
  // deed is silent is itself a reading of the founder's intent, and per binding rule 4 that
  // reading belongs to the Sharia reviewer, not to this file.
  // ⊕ OQ-06 ANSWERED (product owner, 2026-08-18): "the law gives the nazir a discretion. at Qmulate
  // each endownment will have a % set deserve at the nazir's discretion." So the KIND a silent deed
  // resolves to is settled — `NAZIR_DISCRETION_PERCENT` — and what varies is the PERCENTAGE, which
  // is per endowment (see WAQF_SETTINGS below). The value moves from `NONE` to
  // `NAZIR_DISCRETION_PERCENT`; the engine still never reads this row.
  setting('distribution.maintenance.ruleWhenShartSilent', {
    v: 'NAZIR_DISCRETION_PERCENT',
    unit: null,
    unverified: true,
    source:
      "product owner 2026-08-18 (OQ-06) — a silent deed resolves to the Nazir's recorded discretionary percentage; the percentage itself is per-endowment",
  }),

  // ── SAR retention (APPENDED IN S9-4b — see the ordering note above) ──────────────────────
  //
  // ⚠ APPENDED, NOT INSERTED beside `retention.minimumYears`, for the ordinal/audit-chain reason
  // every append since S2 has cited. Owner ruling 2026-08-25 (memo, fourth batch, "SAR
  // retention — adopt ≥10y, flagged unverified"): the SAR floor is a DISTINCT figure under a
  // DISTINCT law — whether a SAR's clock is even the same clock as the document floor is an open
  // counsel question (S8-Q2's recorded remainder). The ENFORCEMENT half has existed since
  // migration 29 (`aml_report`/`aml_follow_up` `_no_delete`/`_no_truncate`, `ENABLE ALWAYS`);
  // this row is the FIGURE, so a counsel correction is a config change, not a migration.
  setting('retention.aml.minimumYears', {
    v: 10,
    unit: 'years',
    unverified: true,
    source:
      'product owner 2026-08-25 (memo, fourth batch) — ≥10y adopted provisionally; confirm vs primary AML law (counsel queued)',
  }),

  // ── Engine B's remaining windows (APPENDED IN S9-2 — see the ordering note above) ─────────
  //
  // The month anchor is the ONE unverified figure here: a question of law with two readings up
  // to three days apart (dates/deadline.ts's module note), seeded as the EARLIER of the two —
  // the direction in which lateness can never be UNDER-reported, the S3-D2 EARLIER_OF precedent,
  // and exactly as provisional. `computeRuleDeadline` REFUSES without this row rather than
  // defaulting (S9-1 mutation M4), so this seed is what makes DISTRIBUTE_3M_FYE computable at
  // all. The other four are QMULATE's own alerting policy (when we start acting / reminding),
  // not statutory figures — the statutory facts are the expiries and due dates themselves.
  setting('deadline.DISTRIBUTE_3M_FYE.monthAnchor', {
    v: 'day_of_month',
    unit: null,
    unverified: true,
    source:
      'S9-2 engineering, D2 precedent — the earlier/conservative reading of "within 3 months of FYE"; a question of law, counsel confirmation queued',
  }),
  setting('deadline.LICENSE_RENEWAL.preExpiryLeadBd', {
    v: 30,
    unit: 'business_days',
    unverified: false,
    source: 'QMULATE operating policy — actionable lead before a recorded licence expiry',
  }),
  setting('deadline.CONTRACT_RENEWAL.preExpiryLeadBd', {
    v: 30,
    unit: 'business_days',
    unverified: false,
    source: 'QMULATE operating policy — actionable lead before a recorded contract end date',
  }),
  setting('deadline.UPDATE_15BD.certificateExpiryLeadBd', {
    v: 30,
    unit: 'business_days',
    unverified: false,
    source:
      'QMULATE operating policy — §09\'s "on (or a configurable lead before) expiry": how early the daily sweep raises GOV-REG-02. Moves WHEN WE NOTICE, never the anchor',
  }),
  setting('deadline.preAlertOffsetsBd', {
    v: [30, 15, 7, 3, 1],
    unit: 'business_days',
    unverified: false,
    source:
      'QMULATE operating policy — §09 reminder cadence; each offset fires exactly once, by derivation',
  }),
  setting('deadline.atRiskThresholdBd', {
    v: 3,
    unit: 'business_days',
    unverified: false,
    source: 'QMULATE operating policy — the final at-risk threshold before due (inclusive)',
  }),
  setting('deadline.escalationLadderBd', {
    // POSITIONAL, in ESCALATION_LEVELS order: [case_manager, nazir, leadership].
    v: [0, 3, 10],
    unit: 'business_days',
    unverified: false,
    source:
      'QMULATE operating policy — BR-1004 ladder thresholds (business days overdue). The PATH is fixed in code; only WHEN each rung engages is configuration',
  }),
  setting('deadline.escalationLadderZeroToleranceBd', {
    // Same order, and FASTER at every rung after the first — asserted, not trusted.
    v: [0, 1, 3],
    unit: 'business_days',
    unverified: false,
    source:
      "QMULATE operating policy — §09's FASTER ladder for zero-tolerance rules (REGISTER_30BD, UPDATE_15BD). Not-slower-at-any-rung is asserted, not trusted",
  }),
];

/**
 * PER-WAQF OVERRIDES.
 *
 * Seeded so the "a fee-basis change via `Setting` flows through with no redeploy" path (V-9) has
 * a real override to exercise, and so the resolution order global → per-waqf is covered by data
 * from day one.
 */
export const WAQF_SETTINGS: readonly SeedSetting[] = [
  // Same key as the global row above — that is what makes it an OVERRIDE rather than an unrelated
  // setting. Resolution order is endowment → global (`pickMostSpecific` in `@qmulate/domain`), and
  // the ids differ (`setting-<key>` vs `setting-<waqfId>-<key>`) so the two rows never collide.
  setting(
    'nazirFee.percentOfRevenue',
    {
      v: 10,
      unit: 'percent',
      unverified: true,
      source: 'waqf_deed (customary ushr) — not a regulatory rate  [fixture fee-001]',
    },
    'waqf-001',
  ),
  // ⊕ OQ-06 · THE NAZIR'S RECORDED ṢIYĀNA DISCRETION, AND IT IS SEEDED ON ONE ENDOWMENT ONLY.
  //
  // ⚠ THE OMISSION IS THE FIXTURE. `waqf-001` carries a recorded percentage; `waqf-002` and
  // `waqf-003` deliberately carry NONE, so the seed holds both sides of the ruling: an endowment
  // whose Nazir has exercised the discretion, and endowments where nobody has yet. The second kind
  // must resolve to `{ kind: 'UNSET' }` and raise MAINTENANCE_RESERVE_POLICY_UNACKNOWLEDGED — a
  // fixture that recorded a policy everywhere could not exercise the flag at all, which is R6-C1's
  // lesson (a generator that cannot reach a configuration reports its silence as success).
  //
  // ⚠ AND THERE IS NO GLOBAL ROW FOR THIS KEY, ON PURPOSE. A platform-wide default percentage would
  // be a figure nobody chose applied to every endowment — the exact defect OQ-06 opened, restored
  // one layer up. `pickMostSpecific` falls back to the global row, so a global row here would make
  // "no policy recorded" unrepresentable.
  //
  // ⚠ unverified — 5% is INVENTED FIXTURE DATA, not a rate anyone has ruled on. The DISCRETION is
  // the owner's ruling; the NUMBER is a figure and carries binding rule 3's marker.
  setting(
    'distribution.maintenance.nazirDiscretionPercent',
    {
      v: '5',
      unit: 'percent',
      unverified: true,
      source:
        "product owner 2026-08-18 (OQ-06) — the Nazir's discretionary ṣiyāna percentage for this endowment; ⚠ the 5% is invented fixture data, not a ruled rate",
    },
    'waqf-001',
  ),
];

/** Everything the seed writes to `setting`, in insertion order. */
export const ALL_SEED_SETTINGS: readonly SeedSetting[] = [...GLOBAL_SETTINGS, ...WAQF_SETTINGS];
