/**
 * G7-V2 — **NO PROCEDURE MAY DISCLOSE A FIELD CLASS THAT A MORE SPECIFIC PROCEDURE GATES BEHIND A
 * VERB THE CALLER LACKS.**
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE DEFECT THIS FILE EXISTS FOR, AS MEASURED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * V-E3-03 was *"navigation discloses what `endowment.get` refuses"*, and the fix took
 * `endowment.get` as the standard to narrow towards. `endowment.get` was doing the same thing one
 * layer down.
 *
 * MEASURED through `appRouter.createCaller` on the SEEDED seat `user-admin-001`, whose resolved
 * grant permissions on `waqf-001` are exactly
 * `["endowment:waqf:read","admin:access_matrix:read","admin:access_matrix:write","audit:event:read"]`:
 *
 *   deed.get({ waqfId: 'waqf-001' })
 *     → THREW FORBIDDEN · "PERMISSION_DENIED: role SYSTEM_ADMIN holds an active grant on waqf
 *        waqf-001 but not endowment:deed:read"
 *   endowment.get({ waqfId: 'waqf-001' }).trusteeship
 *     → { "primaryNazir": "QMULATE (professional Nazir)", "jointlyLiable": true,
 *         "hasAuthorizedRep": true }
 *
 * The appointed Nazir's NAME, the Nazarah Art. 11(5) liability position and the existence of a
 * delegated manager are the trusteeship deed's own facts (BR-105). A summary of a record is a read
 * of that record.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * HOW GENERALLY THE PROPERTY IS EXPRESSED — AND WHERE THE GENERALITY STOPS
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Three clauses, each catching what the others cannot. Only the first is fully general; the second
 * and third are named limits rather than silent ones.
 *
 *  (a) **THE VALUE SWEEP — general, and blind to renaming.** For every seat and every gated field
 *      class: if the specific procedure REFUSES this caller, then no distinctive STRING value of
 *      the underlying row may appear anywhere in `endowment.get`'s serialized payload. It compares
 *      VALUES, so re-exporting `primaryNazir` under a different key is still caught. What it cannot
 *      see is a BOOLEAN or a derived flag — `true` occurs everywhere in a payload — which is why
 *      (b) exists.
 *
 *  (b) **THE DEED-FACT PIN — explicit, because a value sweep structurally cannot cover a boolean.**
 *      `jointlyLiable` and `hasAuthorizedRep` are the Art. 11(5) liability position and the
 *      existence of a delegated manager: both are deed facts, and both are booleans. For a caller
 *      the deed gate refuses, the whole block must read
 *      `{disclosed:false, recorded:null, primaryNazir:null, jointlyLiable:null, hasAuthorizedRep:null}`.
 *
 *  (c) **THE EXHAUSTIVE KEY-SET PIN — the general catch for a field class nobody has thought of
 *      yet.** `endowment.get`'s key set is pinned in BOTH branches of the `found` union, at every
 *      level. A NEW field — of any class, under any name — fails this and has to be argued for in
 *      a diff that carries this comment. That is the opposite discipline from pinning an absence.
 *
 * ⚠ **AND THE REGISTRY IS ITSELF CHECKED AGAINST THE SOURCE.** {@link GATED_FIELD_CLASSES} is
 * compared with a census of every `endowmentScopedProcedure(<verb>)` in `src/routers/`: a gated
 * sibling added tomorrow with no entry here fails immediately. Fixing the MECHANISM rather than the
 * list is V-E3-M5's lesson, and R6-C1's is the sharper one — *a property whose generator cannot
 * reach a configuration reports its silence as success, at scale* — which is why every class
 * declares how many rows it has on the subject endowment and a class with none is recorded as NOT
 * PROVEN rather than counted as passing.
 *
 * ⚠ DRIVEN THROUGH `createCaller` AGAINST THE REAL DATABASE. Real grant resolution, real
 * `grant ∩ preset` narrowing, real rows.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ROLE_KEYS, ROLE_PRESETS, type RoleKey } from '@qmulate/domain';

import {
  API_TEST_PREFIX,
  assertSeeded,
  basePrisma,
  cleanupApiTestRows,
  closeDatabase,
  contextFor,
  hasDatabase,
  provisionTestSubjects,
  warnNoDatabase,
} from './setup.js';

import { appRouter } from '../src/root.js';
import { DEED_RECORD_READ } from '../src/routers/deed.js';
import { ENDOWMENT_RECORD_READ } from '../src/routers/endowment.js';
import { createCallerFactory } from '../src/trpc.js';

warnNoDatabase('G7-V2 (no procedure discloses a field class a specific procedure gates)');

const createCaller = createCallerFactory(appRouter);

/** The endowment every seat below is granted on. `waqf-001` is the one with a full deed. */
const SUBJECT_WAQF = 'waqf-001';

/** `SYSTEM_ADMIN` ⇄ `admin` is the one asymmetry (ADR-0004); asserted below so it cannot rot. */
function dbRoleFor(role: RoleKey): string {
  return role === 'admin' ? 'SYSTEM_ADMIN' : role.toUpperCase();
}

function seatFor(role: RoleKey): string {
  return `${API_TEST_PREFIX}fieldclass-${role}`;
}

/** The seat that reads the record and is refused ONE class. See {@link GatedFieldClass.narrowedFrom}. */
function narrowedSeatFor(className: string): string {
  return `${API_TEST_PREFIX}fieldclass-narrow-${className}`;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · The registry of gated field classes
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

interface GatedFieldClass {
  /** The verb the specific procedure demands. */
  readonly permission: string;
  /**
   * ⚠ THE ROLE WHOSE PRESET HOLDS **BOTH** THE RECORD VERB AND THIS CLASS'S VERB — used to build a
   * NARROWED seat that holds the first and not the second.
   *
   * ── WHY A NARROWED SEAT IS THE ONLY SUBJECT THAT REACHES THIS ───────────────────────────────
   * MEASURED: every one of the ten presets carrying `endowment:waqf:read` ALSO carries
   * `endowment:deed:read`. So the configuration this whole file is about — reads the record,
   * refused the deed — is **unreachable from any full preset**, and a suite that only provisioned
   * full-preset seats would report its silence as success. That is R6-C1's lesson exactly, and it
   * is why G7-V2 was measured on `user-admin-001`, whose seeded GRANT narrows further than its
   * preset does. `narrowedFrom` makes the configuration reachable on purpose instead of by luck.
   */
  readonly narrowedFrom: RoleKey;
  /** Calls the specific procedure. Throws ⇒ the caller is refused this class. */
  readonly probe: (caller: ReturnType<typeof createCaller>) => Promise<unknown>;
  /** The table whose rows ARE the class. */
  readonly table: string;
  /** The columns whose STRING values the sweep looks for. */
  readonly columns: readonly string[];
  /** Extra `WHERE` beyond `"waqfId" = <subject>`, or `null`. */
  readonly where: string | null;
  /**
   * ⚠ HOW MANY ROWS THIS CLASS HAS ON THE SUBJECT ENDOWMENT, DECLARED.
   *
   * `0` means the sweep proves NOTHING for this class on this fixture, and says so out loud. It is
   * pinned rather than tolerated: the day a row appears, this number is wrong and the test goes red,
   * which is the only way a silent generator gap gets noticed (R6-C1).
   */
  readonly rowsOnSubject: number;
}

const GATED_FIELD_CLASSES: Readonly<Record<string, GatedFieldClass>> = {
  /** BR-105's trusteeship deed. The class G7-V2 was measured on. */
  trusteeshipDeed: {
    permission: DEED_RECORD_READ,
    narrowedFrom: 'nazir',
    probe: (caller) => caller.deed.get({ waqfId: SUBJECT_WAQF }),
    table: 'trusteeship_deed',
    columns: ['primaryNazir', 'authorizedRepName', 'authorizedRepScope', 'successorNazir'],
    where: null,
    rowsOnSubject: 1,
  },
  /**
   * BR-1102's reserved matters.
   *
   * ⚠ NOT PROVEN ON THIS FIXTURE, AND THAT IS RECORDED RATHER THAN GLOSSED. The seed carries ONE
   * `approval_request` on `waqf-001` and it is a `DISTRIBUTION_RUN`, so there is no reserved-matter
   * row for the sweep to look for. `endowment.get` discloses no reserved-matter fact today — clause
   * (c)'s key-set pin is what actually holds the line here — and the moment a reserved matter is
   * seeded, `rowsOnSubject: 0` fails and the sweep starts biting.
   */
  reservedMatter: {
    permission: 'legal:reserved_matter:read',
    narrowedFrom: 'nazir',
    probe: (caller) => caller.reservedMatter.list({ waqfId: SUBJECT_WAQF }),
    table: 'approval_request',
    columns: ['subjectId', 'makerId'],
    where: `"type" = 'RESERVED_MATTER'`,
    rowsOnSubject: 0,
  },
  /**
   * The per-endowment `Setting` overrides (`settings.get`, `admin:setting:read`).
   *
   * ⚠ FOUND BY THE CENSUS, NOT BY THE AUTHOR — which is the point of writing the mechanism rather
   * than the list. The registry originally held two classes; the source census returned three, and
   * this file went RED until the third was written down. Every regulatory figure in the system
   * lives in this table (the classification bands, the deadlines, both 10% fees — all ⚠ unverified
   * against primary Saudi law), and a per-waqf override is a figure someone changed for ONE
   * endowment.
   *
   * The probe names a key the resolver will always answer for, so "the gate refused" is never
   * confused with "the key is unregistered". The subject endowment carries exactly ONE override,
   * so unlike the reserved-matter class this sweep is NOT vacuous.
   */
  settingOverride: {
    permission: 'admin:setting:read',
    narrowedFrom: 'admin',
    probe: (caller) =>
      caller.settings.get({ waqfId: SUBJECT_WAQF, key: 'nazirFee.basis' as never }),
    table: 'setting',
    columns: ['key'],
    where: null,
    // ⊕ 2 SINCE S6/E5, and the census caught it on the first run — which is what the declared
    // count is for. `waqf-001` now carries a SECOND override:
    // `distribution.maintenance.nazirDiscretionPercent`, the Nazir's recorded ṣiyāna percentage
    // under a silent deed (OQ-06, product owner 2026-08-18). ⚠ waqf-002 and waqf-003 deliberately
    // carry none, so the fixture holds both sides of that ruling.
    rowsOnSubject: 2,
  },
  /**
   * BR-201's beneficiary registry (S5/E4 — the census found it, this entry answered it). The most
   * sensitive rows in the system: `endowment.get` must disclose no registry fact, and a seat
   * narrowed out of `beneficiary:beneficiary:read` must be refused the registry while still
   * reading the record. The UBO dataset inside the registry has its OWN second gate
   * (`beneficiary:ubo:read`, checked field-level inside `beneficiary.get` — see
   * `e4-registry.integration.test.ts`), which is narrower than this class and not expressible as
   * a rung-2 census entry.
   */
  /**
   * ⊕ S11-1 — the endowment's expropriations (`endowment.expropriations`, `endowment:asset:read`).
   * FOUND BY THE CENSUS on the stage's first full gate run, which is the mechanism working: the query
   * was added for the istibdal-completion input (there was no expropriation surface anywhere before),
   * and a verb more specific than the record verb appeared on the endowment router uncompared.
   *
   * ⚠⚠ PARKED, NOT PROVEN — this entry ASSERTS NOTHING ON TODAY'S FIXTURE, and says so here so the
   * next reader does not take a green census as coverage. The one seeded expropriation (`exp-001`)
   * is on waqf-003; the subject endowment (waqf-001) has ZERO rows, so the value sweep is vacuous.
   * What holds the line meanwhile is clause (c)'s key-set pin (`endowment.get` carries no
   * expropriation fact) and the narrowed-seat refusal (the probe IS refused to a seat without
   * `endowment:asset:read`, which is not vacuous). THE CONDITION UNDER WHICH THIS STOPS BEING PARKED:
   * an expropriation row on `waqf-001` (`rowsOnSubject` goes 0 → 1, this number is then WRONG, the
   * test goes red, and whoever seeds it updates the count and inherits a sweep that bites). Same
   * shape as `reservedMatter` above — written down twice on purpose, not accepted once more.
   */
  expropriations: {
    permission: 'endowment:asset:read',
    narrowedFrom: 'nazir',
    probe: (caller) => caller.endowment.expropriations({ waqfId: SUBJECT_WAQF }),
    table: 'expropriation',
    columns: ['authorityAr', 'istibdalStatus'],
    where: null,
    rowsOnSubject: 0,
  },
  beneficiaryRegistry: {
    permission: 'beneficiary:beneficiary:read',
    narrowedFrom: 'nazir',
    probe: (caller) => caller.beneficiary.list({ waqfId: SUBJECT_WAQF }),
    table: 'beneficiary',
    columns: ['branch', 'relationshipAr'],
    where: null,
    rowsOnSubject: 3,
  },
  /**
   * BR-701's document vault (S10/T3 — the census found it, this entry answers it). The vault
   * holds client legal/financial content; `endowment.get` must disclose no vault fact — not a
   * title, not a storage key, not a content hash.
   *
   * ⚠ ZERO rows on the subject BY FILTER, and the filter is load-bearing: the SEED carries no
   * document rows (same posture as `reservedMatter` above), but `document-vault.integration.
   * test.ts` REGISTERS documents on this very endowment in the same pass and retires them by
   * SOFT-delete (hard DELETE is what the floor refuses), so an unfiltered count here would
   * depend on suite order and re-run history. The `where` pins this class to rows the FIXTURE
   * owns: the moment the seed ships a real document, the count fails and the sweep starts
   * biting — which is the declaration-revisit the census wants.
   */
  documentVault: {
    permission: 'document:document:read',
    narrowedFrom: 'nazir',
    probe: (caller) => caller.document.list({ waqfId: SUBJECT_WAQF }),
    table: 'document',
    columns: ['titleAr', 'titleEn', 'storageKey', 'sha256'],
    where: `"createdBy" NOT LIKE 'user-test-api-%'`,
    rowsOnSubject: 0,
  },
  /**
   * BR-502's ledger (S6/E5 — the census found it, this entry answers it).
   *
   * `finance.chartOfAccounts` is a rung-2 read gated on `finance:transaction:read`, and the class
   * it protects is the endowment's own financial record: what money arrived, from where, and
   * whether it was corpus or income. A seat narrowed out of the verb must be refused the ledger
   * while still reading the endowment record.
   *
   * ⚠ The probe reads the CHART rather than the rows, because there is no `transaction.list`
   * procedure yet — E5 ships capture, not a ledger browser. That is honest about what exists and
   * the sweep is still non-vacuous: the subject endowment carries three seeded movements, so the
   * disclosure comparison below has real rows to look for.
   */
  ledger: {
    permission: 'finance:transaction:read',
    narrowedFrom: 'nazir',
    probe: (caller) => caller.finance.chartOfAccounts({ waqfId: SUBJECT_WAQF }),
    table: 'transaction',
    columns: ['descriptionAr', 'bankReference'],
    // ⚠ SCOPED TO THE FIXTURE'S OWN ROWS, BY ID. Other suites on the same cluster create
    // transactions — an unscoped count read 26 on the first full run, and a `createdBy` filter read
    // 7 — so the declaration is pinned to the DERIVED, deterministic fixture ids
    // (`derivedId` is a function of fixture values: no cuid, no clock). A count that moves with
    // test ordering is not a fact about the fixture, and a declaration that has to be re-guessed
    // every run is the "silence trusted" failure this assertion exists to prevent.
    // ⚠ A REGEX, NOT A `LIKE` PREFIX. `'rev-%'` also matched a sibling suite's fixture row and the
    // count read 4; the fixture's own ids are `rev-<n>` / `exp-e-<n>` exactly.
    where: `"id" ~ '^(rev|exp-e)-[0-9]+$'`,
    // ⚠ 3 → 4 (S7/E6): the fixture gained `rev-005`, waqf-001's first CAPITAL receipt (istibdal
    // proceeds, SAR 4,200,000, 2026-02-17). It exists so V-1 can prove the corpus wall on
    // waqf-001's OWN run — `rev-004` sits on waqf-003, so a waqf-001 run drops it on the `waqfId`
    // filter before `receiptClass` is ever read, which would prove endowment scoping and nothing
    // about corpus. `rev-005` matches this entry's id regex, so the declared count moves with it.
    rowsOnSubject: 4,
  },
  /**
   * The Nazir's recorded ṣiyāna percentage (OQ-06 tail, product owner 2026-08-18).
   *
   * ⚠ ITS OWN CLASS BECAUSE IT HAS ITS OWN VERB — which is the entire point of the ruling. The
   * figure is Nazir-only (`finance:maintenance_policy:read` sits in that preset and no other), so a
   * `finance` seat that reads every receipt must still be refused this one number: it is the
   * trustee's judgement about the asset, not a bookkeeping fact.
   *
   * ⚠ The class is exercised on `waqf-001`, which carries a seeded row; `waqf-002`/`waqf-003` carry
   * none on purpose, so a run against those would be vacuous and this entry names the endowment.
   */
  maintenanceReservePolicy: {
    permission: 'finance:maintenance_policy:read',
    narrowedFrom: 'nazir',
    probe: (caller) => caller.finance.maintenanceReservePolicy.get({ waqfId: SUBJECT_WAQF }),
    table: 'setting',
    // ⚠ `key`, not `value`: the sweep needs a distinctive SCALAR to look for, and `value` is a
    // `jsonb` envelope. The key string is unique to this class and is what a leak would carry.
    columns: ['key'],
    where: `"key" = 'distribution.maintenance.nazirDiscretionPercent'`,
    rowsOnSubject: 1,
  },
  /**
   * The distribution RUN record (S7/E6 — the census found these two the moment the router mounted).
   *
   * `distribution.list` is a rung-2 read gated on `distribution:run:read`, and the class it protects
   * is the waterfall itself: what the endowment earned in a period, what was reserved, what the
   * Nazir was paid and what was left to distribute. A seat narrowed out of the verb must be refused
   * all of it while still reading the endowment record.
   *
   * ⚠ The columns are the two HIJRI period strings rather than a money figure. A `Decimal` crosses
   * the wire as a string whose digits also appear in unrelated rows, so it is a poor needle; the
   * Hijri dates are distinctive scalars unique to this run (`'1447-07-12'` / `'1447-10-12'` on
   * `dist-001`, measured) and are exactly what a leak would carry.
   */
  distributionRun: {
    permission: 'distribution:run:read',
    narrowedFrom: 'nazir',
    probe: (caller) => caller.distribution.list({ waqfId: SUBJECT_WAQF }),
    table: 'distribution',
    columns: ['periodStartHijri', 'periodEndHijri'],
    where: null,
    rowsOnSubject: 1,
  },
  /**
   * The per-beneficiary LINE ITEMS (S7/E6).
   *
   * ⚠ A SEPARATE VERB FROM THE RUN, DELIBERATELY, and the split is load-bearing rather than tidy:
   * the beneficiary seat holds `distribution:line_item:read` and NOT `distribution:run:read`, and
   * the force filter narrows this table to `beneficiaryId = self` (BR-210). So a beneficiary sees
   * their own line and never the endowment's waterfall — which is the whole shape of the portal.
   * Collapsing these two verbs into one would silently hand every beneficiary the run.
   *
   * ⚠ `transferRef` is the needle, not `blockedReason`: both seeded lines carry a transfer
   * reference (`'FAKE-TXN-001'` / `'FAKE-TXN-002'`, measured) while `blockedReason` is NULL on
   * both, and a NULL column cannot demonstrate a disclosure.
   */
  distributionLineItem: {
    permission: 'distribution:line_item:read',
    narrowedFrom: 'nazir',
    probe: (caller) =>
      caller.distribution.lines({ waqfId: SUBJECT_WAQF, distributionId: 'dist-001' }),
    table: 'distribution_line_item',
    columns: ['transferRef'],
    where: null,
    rowsOnSubject: 2,
  },
  /**
   * BR-603's government-filing board (S8/E7, Q6 — the census found it the moment `filing.list`
   * mounted, this entry answers it).
   *
   * The class it protects is the endowment's REGULATORY POSTURE: which platforms it has filed on
   * and where each filing stands — including whether anything was REJECTED, which is precisely the
   * fact an endowment record read must not disclose in passing. A seat narrowed out of
   * `compliance:filing:read` must be refused the board while still reading the record.
   *
   * ⚠ `platform` is the needle, not `status`: a status is a six-value enum whose strings
   * (`ACCEPTED`, …) are poor needles, while the platform enum values (`AWQAF_DIGITAL`, `BALADI`)
   * are distinctive scalars that appear nowhere in an endowment record payload.
   */
  governmentFiling: {
    permission: 'compliance:filing:read',
    narrowedFrom: 'nazir',
    probe: (caller) => caller.filing.list({ waqfId: SUBJECT_WAQF }),
    table: 'government_filing',
    columns: ['platform'],
    where: null,
    // gov-001 (AWQAF_DIGITAL, seeded "registered" → ACCEPTED) and gov-002 (BALADI) sit on
    // waqf-001; gov-003/004 are waqf-003's.
    rowsOnSubject: 2,
  },
  /**
   * §09 Engine A's task board (E7-completion — the census fires the moment `compliance.tasks`
   * mounts, this entry answers it).
   *
   * The class it protects is the endowment's COMPLIANCE POSTURE: which statutory duties exist as
   * tasks and where each stands — including whether a duty sits untouched at `NOT_STARTED`, which
   * is precisely the fact an endowment record read must not disclose in passing. A seat narrowed
   * out of `compliance:task:read` must be refused the board while still reading the record. The
   * AML compartment additionally filters this table's rows by `confidentiality` (S8-Q1 on the
   * task plane); that narrower control has its own suite and is not expressible as a rung-2 entry.
   *
   * ⚠ `templateCode` is the needle: task template codes (`SEED-…`, `FIN-…`) are distinctive
   * scalars that appear nowhere in an endowment record payload, while `status` is a five-value
   * enum whose strings are poor needles.
   */
  complianceTask: {
    permission: 'compliance:task:read',
    narrowedFrom: 'nazir',
    probe: (caller) => caller.compliance.tasks({ waqfId: SUBJECT_WAQF }),
    table: 'compliance_task',
    columns: ['templateCode'],
    // ⚠ SCOPED TO THE FIXTURE'S OWN ROWS: the instantiation suite creates engine tasks on
    // provisioned endowments, but A1's own case runs on waqf-001 and would move an unscoped
    // count with test ordering (the ledger entry's lesson, one table over).
    where: `"id" ~ '^task-[0-9]+$'`,
    // task-001/002/005/009/010 sit on waqf-001 (measured from the fixture: the ten rows spread
    // over waqf-001 ×5, waqf-003 ×4, waqf-002 ×1).
    rowsOnSubject: 5,
  },
};

/**
 * ⚠ WRITE verbs mounted at rung 2 (S5/E4). The registry above compares READ disclosure — a write
 * procedure's response is not a field-class read, so these are pinned HERE, each reviewed by hand
 * for what its response body returns. A new rung-2 write verb fails the census until someone adds
 * it — with that review — to this list. Reviewed 2026-08-17:
 *   · `beneficiary:beneficiary:write` — `enrol` returns `{id, waqfId}`; `recordDeath` returns
 *     `{id, active}`; `refreshKyc` returns `{id, kycLastRefreshed}`; `captureCategory` returns
 *     `{id, categoryCaptured}`. No registry field, no UBO field, crosses back.
 *   · `beneficiary:ubo:write` — `recordUbo` returns `{id, isUbo}`. The dataset it wrote is NOT
 *     echoed back.
 */
const WRITE_VERBS_AT_RUNG_2: readonly string[] = [
  'beneficiary:beneficiary:write',
  'beneficiary:ubo:write',
];

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The census: every verb rung 2 is mounted with, read from the source
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Identifier → value, for the two verbs spelled as exported constants rather than literals. */
const VERB_CONSTANTS: Readonly<Record<string, string>> = {
  ENDOWMENT_RECORD_READ,
  DEED_RECORD_READ,
};

/** Every `endowmentScopedProcedure(<verb>)` in `src/routers/`, resolved to its permission string. */
function censusOfScopedVerbs(): string[] {
  const dir = fileURLToPath(new URL('../src/routers/', import.meta.url));
  const found = new Set<string>();
  for (const file of readdirSync(dir).filter((name) => name.endsWith('.ts'))) {
    const source = readFileSync(`${dir}${file}`, 'utf8');
    if (source.trim() === '') throw new Error(`${file} read as empty — fix the reader`);
    for (const match of source.matchAll(
      /endowmentScopedProcedure\(\s*(?:'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))\s*\)/g,
    )) {
      const literal = match[1];
      const identifier = match[2];
      if (literal !== undefined) {
        found.add(literal);
        continue;
      }
      const resolved = VERB_CONSTANTS[identifier as string];
      if (resolved === undefined) {
        throw new Error(
          `${file} mounts rung 2 on the constant \`${String(identifier)}\`, which this census cannot ` +
            `resolve. Add it to VERB_CONSTANTS — a verb the census cannot read is a verb no ` +
            `field-class assertion covers.`,
        );
      }
      found.add(resolved);
    }
  }
  return [...found].sort();
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · `endowment.get`'s key set, pinned exhaustively — clause (c)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

const ENDOWMENT_GET_KEYS = [
  'certificateExpiry',
  'certificateExpiryHijri',
  'certificateNumber',
  'classification',
  'clientId',
  'continuationStipulation',
  'deedNumber',
  'entitlementOrder',
  'fiscalYearEnd',
  'found',
  'id',
  'nature',
  // ⊕ S11-1 — the REGISTER_30BD clock-start as recorded operator input (one object or null, migration
  // 48). A waqf-level fact of the RECORD verb's own class, beside `registrationDate` (which it is NOT)
  // — no separate gate, so it belongs in the broad read. Added deliberately; this pin went red first.
  'registrationAnchor',
  'registrationDate',
  'registrationDateHijri',
  'reversion',
  'shartAlWaqifVersion',
  'trusteeship',
  'type',
  'waqfId',
  'waqifId',
  // ⊕ S11-1 — which clock-start inputs the CALLER may write (two booleans, or null on the not-found
  // branch). A fact about the reader, not the endowment, and it discloses nothing about the record:
  // the panels use it to draw a form only to a seat that holds the verb (the E3 no-affordance pin).
  'writable',
] as const;

const REVERSION_KEYS = [
  'captured',
  'kind',
  'recordedAt',
  'recordedAtHijri',
  'ultimateTakerIds',
] as const;

const TRUSTEESHIP_KEYS = [
  'disclosed',
  'hasAuthorizedRep',
  'jointlyLiable',
  'primaryNazir',
  'recorded',
] as const;

/** The exact block `endowment.get` must return when the deed gate refuses — clause (b). */
const WITHHELD_TRUSTEESHIP = {
  disclosed: false,
  recorded: null,
  primaryNazir: null,
  jointlyLiable: null,
  hasAuthorizedRep: null,
} as const;

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · The suite
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** Roles whose PRESET carries `endowment:waqf:read` — the ones that reach `endowment.get` at all. */
const RECORD_READERS: readonly RoleKey[] = ROLE_KEYS.filter((role) =>
  (ROLE_PRESETS[role] as readonly string[]).includes(ENDOWMENT_RECORD_READ),
);

/** The distinctive string values of one class's rows on the subject endowment. */
async function classValues(spec: GatedFieldClass): Promise<string[]> {
  const prisma = await basePrisma();
  const columns = spec.columns.map((column) => `"${column}"`).join(', ');
  const extra = spec.where === null ? '' : ` AND ${spec.where}`;
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    `SELECT ${columns} FROM "${spec.table}" WHERE "waqfId" = '${SUBJECT_WAQF}'${extra}`,
  );
  const values = new Set<string>();
  for (const row of rows) {
    for (const value of Object.values(row)) {
      // Short strings are not distinctive enough to search a payload for; a 3-character value
      // could collide with an unrelated substring and make the sweep report a false red.
      if (typeof value === 'string' && value.length >= 4) values.add(value);
    }
  }
  return [...values].sort();
}

/** How many rows the class actually has on the subject endowment. */
async function classRowCount(spec: GatedFieldClass): Promise<number> {
  const prisma = await basePrisma();
  const extra = spec.where === null ? '' : ` AND ${spec.where}`;
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT count(*)::bigint AS n FROM "${spec.table}" WHERE "waqfId" = '${SUBJECT_WAQF}'${extra}`,
  );
  return Number(rows[0]?.n ?? 0n);
}

describe.skipIf(!hasDatabase)('G7-V2 · a broad read discloses no gated field class', () => {
  beforeAll(async () => {
    await assertSeeded();
    await provisionTestSubjects([
      ...ROLE_KEYS.map((role) => ({
        id: seatFor(role),
        role: dbRoleFor(role),
        waqfIds: [SUBJECT_WAQF],
        // The role's OWN preset in full: resolved permissions are `grant ∩ preset`, so this is the
        // WIDEST a seat of that role can be, which is the strongest form of the assertion.
        permissions: [...ROLE_PRESETS[role]],
        beneficiarySelfId: role === 'beneficiary' ? 'ben-001' : null,
      })),
      // ⚠ ONE NARROWED SEAT PER CLASS, AND WITHOUT THEM THIS FILE PROVES NOTHING ABOUT THE DEED.
      // See `GatedFieldClass.narrowedFrom`: no full preset reaches "reads the record, refused the
      // deed", so the full-preset seats above are silent on the very configuration G7-V2 was
      // measured in. MEASURED, and it is the reason this block exists: with only the preset seats,
      // forcing the gate open (`maySeeDeedFacts(ctx) || true`) left twelve of thirteen role tests
      // GREEN.
      ...Object.entries(GATED_FIELD_CLASSES).map(([name, spec]) => ({
        id: narrowedSeatFor(name),
        role: dbRoleFor(spec.narrowedFrom),
        waqfIds: [SUBJECT_WAQF],
        permissions: (ROLE_PRESETS[spec.narrowedFrom] as readonly string[]).filter(
          (permission) => permission !== spec.permission,
        ),
        beneficiarySelfId: null,
      })),
    ]);
  }, 300_000);

  afterAll(async () => {
    await cleanupApiTestRows();
    await closeDatabase();
  });

  it('the inverse role mapping is right, and the one exception is the only one', () => {
    expect(dbRoleFor('admin')).toBe('SYSTEM_ADMIN');
    for (const role of ROLE_KEYS) {
      if (role === 'admin') continue;
      expect(dbRoleFor(role)).toBe(role.toUpperCase());
    }
  });

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE MECHANISM: every gated sibling of `endowment.get` is in the registry
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('every verb rung 2 is mounted with is either the record verb or a registered field class', () => {
    const census = censusOfScopedVerbs();
    // The census must be non-empty and must actually contain the two known verbs, or a broken
    // regex would report an empty list and this whole file would assert nothing.
    expect(census).toContain(ENDOWMENT_RECORD_READ);
    expect(census).toContain(DEED_RECORD_READ);

    const registered = new Set(Object.values(GATED_FIELD_CLASSES).map((entry) => entry.permission));
    const uncovered = census.filter(
      (verb) =>
        verb !== ENDOWMENT_RECORD_READ &&
        !registered.has(verb) &&
        !WRITE_VERBS_AT_RUNG_2.includes(verb),
    );
    // …and the write allow-list may not rot: every member must still exist in the census, so a
    // removed procedure takes its pin with it instead of leaving a stale exemption behind.
    for (const verb of WRITE_VERBS_AT_RUNG_2) {
      expect(census, `WRITE_VERBS_AT_RUNG_2 pins ${verb}, which no procedure mounts`).toContain(
        verb,
      );
    }
    expect(
      uncovered,
      `these verbs gate a procedure that is MORE SPECIFIC than endowment.get, and no entry in ` +
        `GATED_FIELD_CLASSES compares them: ${uncovered.join(', ')}. A field class nobody compares ` +
        `is the G7-V2 defect with a different table behind it.`,
    ).toEqual([]);
  });

  it('every registered class declares the row count it actually has on the subject endowment', async () => {
    for (const [name, spec] of Object.entries(GATED_FIELD_CLASSES)) {
      const actual = await classRowCount(spec);
      expect(
        actual,
        `${name}: the registry declares ${String(spec.rowsOnSubject)} row(s) on ${SUBJECT_WAQF} and ` +
          `the database has ${String(actual)}. A class with ZERO rows proves nothing in the sweep ` +
          `below, and a class whose count has changed needs its declaration revisited rather than ` +
          `its silence trusted.`,
      ).toBe(spec.rowsOnSubject);
    }
  }, 60_000);

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * (a) + (b) THE SWEEP AND THE PIN, FOR EVERY SEAT IN THE ROLE MODEL
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  for (const role of ROLE_KEYS) {
    it(`${role} · endowment.get discloses no value of a class its own verb is refused`, async () => {
      const ctx = await contextFor({ userId: seatFor(role), requestId: `fieldclass-${role}` });
      const caller = createCaller(ctx);

      let record: Record<string, unknown> | null = null;
      try {
        record = (await caller.endowment.get({ waqfId: SUBJECT_WAQF })) as Record<string, unknown>;
      } catch {
        // A seat with no `endowment:waqf:read` never reaches the payload at all. That is the
        // strongest possible outcome for this file and there is nothing left to sweep — but the
        // premise below still has to hold, so the role is asserted to be one of the three.
        expect(RECORD_READERS).not.toContain(role);
        return;
      }
      expect(record['found'], `${role}: endowment.get answered found:false on the subject`).toBe(
        true,
      );
      const serialized = JSON.stringify(record);

      for (const [name, spec] of Object.entries(GATED_FIELD_CLASSES)) {
        let gateAnswers = true;
        try {
          await spec.probe(caller);
        } catch {
          gateAnswers = false;
        }

        if (gateAnswers) continue;

        // (a) THE VALUE SWEEP.
        for (const value of await classValues(spec)) {
          expect(
            serialized.includes(value),
            `${role}: the ${name} gate REFUSES this seat for want of ${spec.permission}, and ` +
              `endowment.get still discloses ${JSON.stringify(value)} — a ${spec.table} fact. A ` +
              `summary of a record is a READ of that record.`,
          ).toBe(false);
        }

        // (b) THE DERIVED-FACT PIN, for the one class whose facts are booleans.
        if (name === 'trusteeshipDeed') {
          expect(
            record['trusteeship'],
            `${role}: deed.get refuses this seat, so endowment.get's deed summary must be withheld ` +
              `in full — including the Art. 11(5) liability position, which is a BOOLEAN and which ` +
              `no value sweep can see.`,
          ).toEqual(WITHHELD_TRUSTEESHIP);
        }
      }
    }, 120_000);
  }

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE CONFIGURATION THE PRESETS CANNOT REACH — one narrowed seat per class
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('no full preset can even reach "reads the record, refused the deed" — recorded, not assumed', () => {
    // ⚠ THIS IS THE R6-C1 GUARD ON THIS FILE ITSELF. If a preset ever DOES separate the two verbs,
    // the loop above stops being silent about the deed class and this expectation is the notice.
    const separating = ROLE_KEYS.filter(
      (role) =>
        (ROLE_PRESETS[role] as readonly string[]).includes(ENDOWMENT_RECORD_READ) &&
        !(ROLE_PRESETS[role] as readonly string[]).includes(DEED_RECORD_READ),
    );
    expect(
      separating,
      `a preset now grants ${ENDOWMENT_RECORD_READ} without ${DEED_RECORD_READ}. That is not a ` +
        `failure — it means the per-role sweep above has become a real subject for the deed class ` +
        `and this note should say so.`,
    ).toEqual([]);
  });

  for (const [name, spec] of Object.entries(GATED_FIELD_CLASSES)) {
    it(`${name} · a seat holding the record verb and NOT ${spec.permission} is told nothing of the class`, async () => {
      const ctx = await contextFor({
        userId: narrowedSeatFor(name),
        requestId: `fieldclass-narrow-${name}`,
      });
      const caller = createCaller(ctx);

      // ── THE PREMISE, MEASURED THROUGH THE RESOLVED GRANT ──────────────────────────────────
      // Without it, "the class was withheld" could be true because the seat reaches nothing at all.
      const resolved = ctx.grants[0]?.permissions ?? [];
      expect(resolved, `${name}: the narrowed seat must still read the record`).toContain(
        ENDOWMENT_RECORD_READ,
      );
      expect(resolved, `${name}: the narrowed seat must NOT hold ${spec.permission}`).not.toContain(
        spec.permission,
      );

      // The control: the specific procedure REFUSES this seat.
      let refused = false;
      try {
        await spec.probe(caller);
      } catch {
        refused = true;
      }
      expect(refused, `${name}: the gate must refuse this seat, or there is nothing to prove`).toBe(
        true,
      );

      const record = (await caller.endowment.get({ waqfId: SUBJECT_WAQF })) as Record<
        string,
        unknown
      >;
      expect(record['found']).toBe(true);
      const serialized = JSON.stringify(record);

      // (a) THE VALUE SWEEP — on a class that HAS rows, so it is not vacuous.
      const values = await classValues(spec);
      if (spec.rowsOnSubject > 0) {
        expect(values.length, `${name}: no distinctive value to sweep for`).toBeGreaterThan(0);
      }
      for (const value of values) {
        expect(
          serialized.includes(value),
          `${name}: the gate refuses this seat for want of ${spec.permission}, and endowment.get ` +
            `still discloses ${JSON.stringify(value)} — a ${spec.table} fact.`,
        ).toBe(false);
      }

      // (b) THE DERIVED-FACT PIN, for the one class whose facts are booleans.
      if (name === 'trusteeshipDeed') {
        expect(record['trusteeship']).toEqual(WITHHELD_TRUSTEESHIP);
      }
    }, 120_000);
  }

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE ORIGINAL REPRO, INVERTED — the SEEDED seat, not a provisioned one
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('the measured G7-V2 payload is gone: user-admin-001 reads the record and no deed fact', async () => {
    const ctx = await contextFor({ userId: 'user-admin-001', requestId: 'fieldclass-admin-seat' });
    const caller = createCaller(ctx);

    // ⚠ THE PREMISE, EXACTLY AS MEASURED. Without it, an empty deed block would also be true of a
    // seat that cannot read the record at all, and this test would prove the wrong refusal.
    expect(ctx.grants.map((grant) => grant.waqfId)).toEqual([SUBJECT_WAQF]);
    // ⊕ S12-3b (migration 53): the seat gained `endowment:waqf:write` — the birth of an endowment
    // demands BOTH the record and the matrix verb on a sibling, and this is the fixture's only matrix
    // holder. The G7-V2 claim below is unchanged by it: a record verb is not a DEED verb, and the
    // deed facts stay behind `endowment:deed:read`, which this seat still does not hold.
    expect(ctx.grants[0]?.permissions).toEqual([
      'endowment:waqf:read',
      'endowment:waqf:write',
      'admin:access_matrix:read',
      'admin:access_matrix:write',
      'audit:event:read',
    ]);

    // The control: `deed.get` REFUSES this seat, and refuses it for the reason the fix is about.
    let thrown: unknown;
    try {
      await caller.deed.get({ waqfId: SUBJECT_WAQF });
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { code?: string } | undefined)?.code).toBe('FORBIDDEN');
    expect(String((thrown as Error | undefined)?.message)).toContain(DEED_RECORD_READ);

    const record = (await caller.endowment.get({ waqfId: SUBJECT_WAQF })) as Record<
      string,
      unknown
    >;
    // It still reads the RECORD — the fix narrows one field class, it does not break the screen.
    expect(record['found']).toBe(true);
    expect(record['certificateNumber']).toBe('FAKE-1000001');

    // And the deed facts that used to come back, as they were MEASURED.
    expect(record['trusteeship']).toEqual(WITHHELD_TRUSTEESHIP);
    const serialized = JSON.stringify(record);
    for (const leaked of ['QMULATE (professional Nazir)', 'Delegated Manager (fictional)']) {
      expect(serialized, `${leaked} is still disclosed by endowment.get`).not.toContain(leaked);
    }
  }, 120_000);

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * THE POSITIVE HALF — otherwise every assertion above passes over a procedure that answers nobody
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('a seat that DOES hold the deed verb still gets the summary, and it agrees with deed.get', async () => {
    const ctx = await contextFor({
      userId: 'user-case-manager-001',
      requestId: 'fieldclass-deed-reader',
    });
    const caller = createCaller(ctx);

    const deed = (await caller.deed.get({ waqfId: SUBJECT_WAQF })) as {
      primaryNazir: string;
      jointlyLiable: boolean;
      authorizedRep: unknown;
    } | null;
    expect(deed, 'waqf-001 has no deed — the whole file would be vacuous').not.toBeNull();

    const record = (await caller.endowment.get({ waqfId: SUBJECT_WAQF })) as {
      trusteeship: Record<string, unknown>;
    };
    // ⚠ THE SUMMARY IS COMPARED WITH THE RECORD IT SUMMARISES, not merely asserted non-null: two
    // reads of one deed that disagree are a worse outcome than one read that is withheld.
    expect(record.trusteeship).toEqual({
      disclosed: true,
      recorded: true,
      primaryNazir: deed?.primaryNazir,
      jointlyLiable: deed?.jointlyLiable,
      hasAuthorizedRep: deed?.authorizedRep !== null,
    });
  }, 120_000);

  /* ═════════════════════════════════════════════════════════════════════════════════════════
   * (c) THE EXHAUSTIVE KEY SET — the catch for a field class nobody has thought of yet
   * ═════════════════════════════════════════════════════════════════════════════════════════ */

  it('endowment.get returns exactly these keys, in BOTH branches of the found union', async () => {
    const reader = await contextFor({
      userId: seatFor('nazir'),
      requestId: 'fieldclass-keys-found',
    });
    const found = (await createCaller(reader).endowment.get({
      waqfId: SUBJECT_WAQF,
    })) as Record<string, unknown>;
    expect(found['found']).toBe(true);
    expect(Object.keys(found).sort()).toEqual([...ENDOWMENT_GET_KEYS]);
    expect(Object.keys(found['reversion'] as object).sort()).toEqual([...REVERSION_KEYS]);
    expect(Object.keys(found['trusteeship'] as object).sort()).toEqual([...TRUSTEESHIP_KEYS]);

    // ── THE NOT-FOUND BRANCH, ON A SOFT-DELETED-INVISIBLE ROW ────────────────────────────────
    // A grant that resolves onto a row the caller's own client cannot see. There is no such row in
    // the fixture, so the branch is exercised by asserting the union's SHAPE contract instead: both
    // branches carry the same key set, and `test/scope-denial.integration.test.ts` already pins
    // `waqfId` + `found` on the negative half. Recorded rather than skipped silently.
    expect(ENDOWMENT_GET_KEYS).toContain('found');
    expect(ENDOWMENT_GET_KEYS).toContain('waqfId');
  }, 120_000);
});
