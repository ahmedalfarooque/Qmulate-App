/**
 * `compliance/catalogue.ts` — the 37 obligation templates, TRANSCRIBED from two sources.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * NOTHING IN THIS FILE IS AUTHORED
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *   · `code`, `workstreamEn`, `titleEn`, `gate`, `regulationRefs`, `brRefs` and the source cadence
 *     come from `docs/product/prd/09-compliance-deadline-engine-spec.md`'s three library tables.
 *   · `workstreamAr` and `titleAr` are **byte-for-byte quotes** from
 *     `docs/domain/unified-framework.md` — QMULATE's own Arabic-authoritative restatement of the
 *     Nazarah regulation, and the document §09's library was derived FROM.
 *
 * `__tests__/catalogue-source-fidelity.test.ts` re-reads BOTH files on every run and compares: the
 * Arabic character by character, the English cell for cell, the coverage in both directions, and —
 * the check that catches a verbatim quote from the WRONG bullet — every template's primary bullet
 * against the framework subsection §09's own `Traces` column names for it.
 *
 * ⚠ **The rows below were generated once from those two sources and are pinned by that test
 * forever after.** The test is the guarantee; the generation was only a way of not making typing
 * mistakes across 37 rows of Arabic. Editing a row by hand is fine — the test will tell you
 * whether you were right.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THE TRANSCRIPTION FOUND, WHICH IS THE PART WORTH READING
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Transcribing a document is the cheapest way to discover it is incomplete. Four findings, each
 * carried as DATA on the affected row rather than as a comment here — see `unresolved` and the
 * three maps in `contract.ts`:
 *
 *  1. **`GOV-COI-01` has no Arabic at all.** Conflict-of-interest disclosure and the ≤2nd-degree
 *     self-dealing prohibition (Nazarah Art. 18) is restated NOWHERE in the framework. `titleAr` is
 *     `null` — the only null in the library — because composing one would mean inventing the wording
 *     of a self-dealing prohibition for a legal-facing screen. **The gap is in the framework, not
 *     just in this catalogue**, and that is worth surfacing on its own.
 *  2. **`GOV-RGL-03`'s headline numbers have no Arabic authority.** The ≥10-year retention floor
 *     appears nowhere in the framework (the only "10" in the file is the §3-10 heading) and "rapid
 *     retrieval" has no §3 anchor. The quote is a real records-and-archiving duty; it is not
 *     authority for the figure, which comes from Art. 20 and is UNVERIFIED (binding rule 3).
 *  3. **Five of §09's cadence cells cannot be read as a single value**, and its own `Recurrence`
 *     type cannot hold them. Two compress mechanically and are marked at the row. Three do not, and
 *     they carry `recurrence: null` — a row instantiates cadence-less rather than with a guess.
 *  4. **Seven deadline bindings resolve to nothing.** Five documented rule keys have no `Setting`
 *     window, `AML_IMMEDIATE` is not in the documented vocabulary at all, and one cell is the word
 *     `external`. E8/S9 owns the engine; E7 owes only that the dangle is visible, because a duty
 *     shown with no clock reads as compliant.
 *
 * ⚠ **`phase`, `defaultOwnerRole` and `isReservedMatter` are `null` on every row.** §09's interface
 * declares them and its table has no column for any of them. See `SOURCE_SILENT_FIELDS` — each has
 * an obvious-looking default, and each default would be engineering asserting a regulatory or
 * governance fact no source states.
 *
 * ⚠ **`gate` CARRIES THE ENUM SPELLING, NOT §09's.** §09 writes `has_income`; the enum and the gating
 * resolver use `HAS_INCOME`, and `isClassificationGate('has_income')` is FALSE — so a row spelled the
 * spec's way would land in `unrecognisedGate` and every §09 obligation would be reported as a mis-typed
 * catalogue row. `GATE_FROM_SPEC` is the declared bridge, and the fidelity test compares §09's cell
 * THROUGH it in both directions so neither spelling can drift.
 *
 * ⊕ **THIS LIBRARY IS NOW IN THE DATABASE — 36 of its 37 rows, seeded 2026-08-23 (S8/E7).** This
 * header carried a "not yet in the database" note through two superseded reasons; both are closed and
 * the history is worth one paragraph, because the ORDER mattered:
 *
 *  1. the gate vocabulary (seven rows gated `has_income`/`exclude_direct` and an enum with neither) —
 *     closed by the owner's S8-Q3 ruling and migration 30;
 *  2. versioning (seeding 37 MUTABLE rows in front of a register whose whole value is evidencing what
 *     was owed AT THE TIME would have been the wrong order) — closed by S8-Q5 and migration 31.
 *
 * `packages/database`'s seed is now a PROJECTION of this file (`deriveCanonicalObligations`), landing
 * these rows ALONGSIDE the ten `SEED-` placeholders at `libraryVersion` `2026-08-20.1` — never as an
 * edit to them, which migration 31 refuses outright.
 *
 * ⚠ **36, NOT 37.** `compliance_obligation.titleAr` is NOT NULL and `GOV-COI-01` has no Arabic
 * anywhere in the framework to carry, so it is withheld — see {@link templatesWithheldFromRegister},
 * which derives the set rather than listing it, and empties by itself the day either half of the
 * cause is removed.
 *
 * ⚠ **ONE ROW IS CLASSIFIED `AML_RESTRICTED`** — `GOV-AML-02`, on the owner's S8-Q1 ruling. That
 * classification is NOT in this file (nothing here is authored); it lives in `contract.ts`'s
 * {@link AML_RESTRICTED_TEMPLATE_CODES}, and this module refuses to LOAD if it names a code the
 * library does not have.
 */

import {
  AML_RESTRICTED_TEMPLATE_CODES,
  UNRESOLVED_DEADLINE_BINDINGS,
  UNRESOLVED_RECURRENCE_SUBJECTS,
  UNSOURCED_ARABIC_SUBJECTS,
  questionReason,
} from './contract.js';
import type { ObligationTemplate } from './contract.js';

/**
 * The library's version. Templates are immutable WITHIN a version: changing an obligation means
 * publishing a new version, never mutating a shipped row, so a historical `ComplianceTask` always
 * traces to the exact text that governed it (§09 Engine A).
 *
 * ⊕ **ENFORCED AT THE DATABASE SINCE MIGRATION 31** (owner ruling S8-Q5, 2026-08-23), and this note
 * previously said the opposite: there is now a `libraryVersion` column, `UNIQUE (code, libraryVersion)`
 * so two versions of one obligation can COEXIST (the single-column key made §09's own instruction
 * unstorable), an UPDATE guard refusing every content change, a frozen `templateCode`+`templateVersion`
 * snapshot on the task, and `id` immutability on both tables. Migration 33 added `confidentiality` to
 * the frozen set after measuring it re-writable by the application role on the seeded `GOV-AML-02` row.
 */
export const OBLIGATION_LIBRARY_VERSION = '2026-08-26.1';
// ⊕ 2026-08-26 (S9-2): bumped from 2026-08-20.1 by the owner's rulings — S8-Q9 (three new
// templates: FIN-MGT-05, FIN-DIST-03, GOV-GEN-04), S8-Q8a (GOV-SHART-02 → ONCE; GOV-SHART-03
// carries the annual review), S8-Q8b (GOV-GEN-01 → ANNUAL). New rows, never edits: migration 31
// refuses content changes within a version, and by the S9 first-batch ruling a bump changes only
// FUTURE instantiations — attaching new duties to an ALREADY-instantiated register is an explicit
// maker≠checker act (LIBRARY_UPGRADE, S9-3), never a side effect of this constant moving.

/** The 41 templates (37 + the four 2026-08-26.1 additions), in §09's own order. */
export const OBLIGATION_LIBRARY: readonly ObligationTemplate[] = Object.freeze([
  {
    code: 'FIN-ACC-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'المحاسبة',
    workstreamEn: 'Accounting',
    titleAr: 'الاشتراك في نظام محاسبي معتمد لتسجيل المعاملات المالية الخاصة بالوقف.',
    titleEn: 'Subscribe to & maintain an approved accounting system',
    frameworkBullets: [{ subsection: '1-1', ordinal: 1, line: 23 }],
    gate: 'ALL',
    recurrence: 'ONCE',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['UF §1-1'],
    brRefs: ['BR-502'],
    unresolved: [],
  },
  {
    code: 'FIN-ACC-02',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'المحاسبة',
    workstreamEn: 'Accounting',
    titleAr:
      'حصر وتسجيل جميع الإيرادات والمصروفات المتعلقة بالوقف بشكل منتظم، وتصنيفها وتوثيقها وفق الأصول المحاسبية المعتمدة.',
    titleEn: 'Record & classify all revenue/expenses in Arabic, regularly',
    frameworkBullets: [
      { subsection: '1-1', ordinal: 2, line: 24 },
      { subsection: '1-1', ordinal: 3, line: 25 },
    ],
    gate: 'HAS_INCOME',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§1-1'],
    brRefs: ['BR-502'],
    unresolved: [],
  },
  {
    code: 'FIN-ACC-03',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'المحاسبة',
    workstreamEn: 'Accounting',
    titleAr:
      'مراجعة الفواتير والمصروفات المتعلقة بأعمال الوقف والتحقق من صحتها ومطابقتها للأعمال أو الخدمات المقدمة قبل اعتمادها أو رفعها للطرف الأول.',
    titleEn: 'Verify invoices/expenses before approval',
    frameworkBullets: [{ subsection: '1-1', ordinal: 4, line: 26 }],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§1-1'],
    brRefs: ['BR-611'],
    unresolved: [],
  },
  {
    code: 'FIN-ACC-04',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'المحاسبة',
    workstreamEn: 'Accounting',
    titleAr:
      'إجراء المطابقات الدورية للحسابات البنكية الخاصة بالوقف، والتحقق من توافق الأرصدة والحركات المالية مع السجلات المحاسبية والمستندات الداعمة.',
    titleEn: 'Periodic bank reconciliation vs ledger',
    frameworkBullets: [{ subsection: '1-1', ordinal: 6, line: 28 }],
    gate: 'HAS_INCOME',
    recurrence: 'MONTHLY',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§1-1'],
    brRefs: ['BR-503'],
    unresolved: [],
  },
  {
    code: 'FIN-MGT-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'المالية (الإدارة المالية)',
    workstreamEn: 'Financial mgmt',
    titleAr:
      'إنشاء حساب بنكي -أو أكثر- باسم الوقف لدى البنوك والمصارف العاملة في المملكة، تُجرى من خلاله كافة التعاملات المالية الخاصة بالوقف، مع عدم خلط أموال الوقف بالأموال الشخصية.',
    titleEn: 'Maintain dedicated waqf account(s); no commingling',
    frameworkBullets: [{ subsection: '1-2', ordinal: 1, line: 33 }],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§1-2'],
    brRefs: ['BR-501'],
    unresolved: [],
  },
  {
    code: 'FIN-MGT-02',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'المالية (الإدارة المالية)',
    workstreamEn: 'Financial mgmt',
    titleAr:
      'إعداد الموازنات التقديرية الدورية للمصروفات والإيرادات المتوقعة بما يدعم التخطيط المالي وإدارة التزامات الوقف، مع مراعاة الاحتياجات الحالية والمستقبلية.',
    titleEn: 'Prepare budget / estimates',
    frameworkBullets: [{ subsection: '1-2', ordinal: 3, line: 35 }],
    gate: 'LARGE_MEDIUM',
    recurrence: 'ANNUAL',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§1-2'],
    brRefs: ['BR-504'],
    unresolved: [],
  },
  {
    code: 'FIN-MGT-03',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'المالية (الإدارة المالية)',
    workstreamEn: 'Financial mgmt',
    titleAr:
      'اعتماد القوائم المالية المدققة من محاسبين ومراجعين معتمدين لدى الهيئة السعودية للمراجعين والمحاسبين، وذلك للأوقاف الكبيرة والمتوسطة.',
    titleEn: 'SOCPA-audited financial statements',
    frameworkBullets: [{ subsection: '1-2', ordinal: 6, line: 38 }],
    gate: 'LARGE_MEDIUM',
    recurrence: 'ANNUAL',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 15', '§1-2'],
    brRefs: ['BR-902'],
    unresolved: [],
  },
  {
    code: 'FIN-MGT-04',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'المالية (الإدارة المالية)',
    workstreamEn: 'Financial mgmt',
    titleAr:
      'إعداد بيان مالي سنوي يوضح واردات ومصروفات الوقف للأوقاف الصغيرة، وللأوقاف ذات الانتفاع المباشر عند وجود واردات ومصروفات.',
    titleEn: 'Simplified annual financial statement',
    frameworkBullets: [{ subsection: '1-2', ordinal: 7, line: 39 }],
    gate: 'SMALL_DIRECT',
    recurrence: 'ANNUAL',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 15', '§1-2'],
    brRefs: ['BR-902'],
    unresolved: [],
  },
  {
    code: 'FIN-MGT-05',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'المالية',
    workstreamEn: 'Financial mgmt',
    titleAr:
      'إعداد القوائم المالية الدورية والسنوية للوقف، بما يشمل بيان المركز المالي ونتائج الأعمال والتقارير المالية ذات العلاقة.',
    titleEn:
      'Prepare the periodic & annual financial statements (position, results, related reports)',
    frameworkBullets: [{ subsection: '1-2', ordinal: 2, line: 34 }],
    gate: 'ALL',
    // §09's cell is `periodic + annual` — the framework bullet's OWN compound (الدورية والسنوية).
    // Cadence-less rather than flattened; the question is with the owner.
    recurrence: null,
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§1-2'],
    brRefs: ['BR-902'],
    unresolved: [
      questionReason(
        UNRESOLVED_RECURRENCE_SUBJECTS,
        'FIN-MGT-05',
        'UNRESOLVED_RECURRENCE_SUBJECTS',
      ),
    ],
  },
  {
    code: 'FIN-DIST-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'أعمال التوزيع',
    workstreamEn: 'Distribution',
    titleAr:
      'تنفيذ إجراءات توزيع ريع الوقف على المستفيدين وفق النسب والمواعيد المعتمدة وبعد اعتماد الطرف الأول، ومن خلال الحسابات البنكية الخاصة بالوقف.',
    titleEn: 'Compute & disburse ghallah per Shart via dedicated accounts',
    frameworkBullets: [
      { subsection: '1-3', ordinal: 2, line: 44 },
      { subsection: '1-3', ordinal: 1, line: 43 },
      { subsection: '1-3', ordinal: 3, line: 45 },
      { subsection: '1-3', ordinal: 5, line: 47 },
    ],
    gate: 'EXCLUDE_DIRECT',
    recurrence: null,
    deadlineRuleKey: 'DISTRIBUTE_3M_FYE',
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§1-3'],
    brRefs: ['BR-505'],
    unresolved: [
      questionReason(
        UNRESOLVED_RECURRENCE_SUBJECTS,
        'FIN-DIST-01',
        'UNRESOLVED_RECURRENCE_SUBJECTS',
      ),
    ],
  },
  {
    code: 'FIN-DIST-02',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'أعمال التوزيع',
    workstreamEn: 'Distribution',
    titleAr:
      'إعداد كشوفات تفصيلية تتضمن أسماء المستفيدين وأنصبتهم والمبالغ المصروفة لهم وتواريخ الصرف وأي ملاحظات أو مستندات داعمة.',
    titleEn: 'Produce per-beneficiary distribution statements',
    frameworkBullets: [{ subsection: '1-3', ordinal: 4, line: 46 }],
    gate: 'EXCLUDE_DIRECT',
    // §09's cell reads `per run`; compressed to EVENT — see COMPLIANCE_RECURRENCES.

    recurrence: 'EVENT',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§1-3'],
    brRefs: ['BR-505'],
    unresolved: [],
  },
  {
    code: 'FIN-DIST-03',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'أعمال التوزيع',
    workstreamEn: 'Distribution',
    // ⊕ S8-Q9's highest-value addition: the duty binding rule 1's SHART_INCOMPLETE refusal hands
    // off to — observe the waqif's intent where the beneficiary is unspecified / naming lapses /
    // the shart is general, AND refer to the competent authority. The register now has the row
    // the engine's halt points at.
    titleAr:
      'مراعاة قصد الواقف وما هو أكثر نفعًا عند عدم تحديد الموقوف عليه أو انقطاع تسميته أو عند عموم شرط الواقف على أعمال البر والإحسان، والرجوع إلى الجهة المختصة لتحديد قصد الواقف.',
    titleEn:
      'Observe waqif intent where the beneficiary is unspecified / naming lapses / shart is general; refer to the competent authority',
    frameworkBullets: [{ subsection: '1-3', ordinal: 6, line: 48 }],
    gate: 'ALL',
    recurrence: 'EVENT',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§1-3'],
    brRefs: ['BR-505'],
    unresolved: [],
  },
  {
    code: 'FIN-ZKT-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'الزكاة والضرائب',
    workstreamEn: 'Zakat & tax',
    titleAr:
      'إعداد وتجهيز الإقرارات المالية أو الزكوية أو الضريبية -إن وجدت- الخاصة بالوقف، ومراجعة بياناتها قبل تقديمها للجهات المختصة.',
    titleEn: 'Prepare/review zakat/tax filings where applicable',
    frameworkBullets: [{ subsection: '1-4', ordinal: 1, line: 52 }],
    gate: 'HAS_INCOME', // §09's Deadline cell is the word `external`: not a rule key, so unbound.

    recurrence: 'ANNUAL',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§1-4'],
    brRefs: ['BR-509'],
    unresolved: [
      questionReason(UNRESOLVED_DEADLINE_BINDINGS, 'FIN-ZKT-01', 'UNRESOLVED_DEADLINE_BINDINGS'),
    ],
  },
  {
    code: 'FIN-ZKT-02',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'FINANCIAL',
    workstreamAr: 'الزكاة والضرائب',
    workstreamEn: 'Zakat & tax',
    titleAr:
      'متابعة الالتزامات المالية والنظامية الخاصة بالوقف، بما يشمل الرسوم والمتطلبات والمواعيد النظامية ذات العلاقة، والعمل على الوفاء بها في أوقاتها المحددة.',
    titleEn: 'Track financial/statutory fees & deadlines',
    frameworkBullets: [{ subsection: '1-4', ordinal: 3, line: 54 }],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§1-4'],
    brRefs: ['BR-608'],
    unresolved: [],
  },
  {
    code: 'OPS-LEASE-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'OPERATIONAL',
    workstreamAr: 'إدارة العقارات وتأجير الوحدات',
    workstreamEn: 'Property & leasing',
    titleAr:
      'متابعة تحصيل الإيجارات من المستأجرين وتسليمها للمحاسب القانوني أو الجهة المالية المعتمدة من الطرف الأول.',
    titleEn: 'Rent collection, leasing, handover, arrears, tenant relations',
    frameworkBullets: [
      { subsection: '2-1', ordinal: 1, line: 64 },
      { subsection: '2-1', ordinal: 2, line: 65 },
      { subsection: '2-1', ordinal: 3, line: 66 },
      { subsection: '2-1', ordinal: 4, line: 67 },
      { subsection: '2-1', ordinal: 5, line: 68 },
      { subsection: '2-1', ordinal: 6, line: 69 },
      { subsection: '2-1', ordinal: 7, line: 70 },
    ],
    gate: 'HAS_INCOME',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§2-1'],
    brRefs: ['BR-302'],
    unresolved: [],
  },
  {
    code: 'OPS-MAINT-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'OPERATIONAL',
    workstreamAr: 'أعمال التشغيل والصيانة',
    workstreamEn: 'Operations & maintenance',
    titleAr:
      'تنفيذ ومتابعة أعمال الصيانة الدورية والوقائية للمصاعد والأنظمة والمرافق التابعة للعقار.',
    titleEn: 'Preventive/corrective maintenance, utilities, safety, contractor supervision',
    frameworkBullets: [
      { subsection: '2-2', ordinal: 1, line: 74 },
      { subsection: '2-2', ordinal: 2, line: 75 },
      { subsection: '2-2', ordinal: 3, line: 76 },
      { subsection: '2-2', ordinal: 4, line: 77 },
      { subsection: '2-2', ordinal: 5, line: 78 },
      { subsection: '2-2', ordinal: 6, line: 79 },
      { subsection: '2-2', ordinal: 7, line: 80 },
      { subsection: '2-2', ordinal: 8, line: 81 },
    ],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§2-2'],
    brRefs: ['BR-303'],
    unresolved: [],
  },
  {
    code: 'OPS-MON-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'OPERATIONAL',
    workstreamAr: 'المتابعة التشغيلية',
    workstreamEn: 'Operational monitoring',
    titleAr: 'متابعة العمالة والمشرفين والعاملين المرتبطين بأعمال التشغيل والصيانة.',
    titleEn: 'Supervise labour & daily ops; coordinate service providers',
    frameworkBullets: [
      { subsection: '2-3', ordinal: 1, line: 85 },
      { subsection: '2-3', ordinal: 2, line: 86 },
      { subsection: '2-3', ordinal: 3, line: 87 },
    ],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§2-3'],
    brRefs: ['BR-303'],
    unresolved: [],
  },
  {
    code: 'GOV-REG-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'التسجيل والامتثال لدى الهيئة العامة للأوقاف',
    workstreamEn: 'Authority registration',
    titleAr:
      'تسجيل الوقف وكافة الأصول الموقوفة التابعة له لدى الهيئة خلال مدة لا تتجاوز ثلاثين يوم عمل من تاريخ توثيقه لدى الجهة المختصة أو تاريخ نفاذ اللائحة، وذلك من خلال الموقع الإلكتروني للهيئة.',
    titleEn: 'Register waqf + all assets with the Authority',
    frameworkBullets: [{ subsection: '3-1', ordinal: 1, line: 97 }],
    gate: 'ALL',
    recurrence: 'ONCE',
    deadlineRuleKey: 'REGISTER_30BD',
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 8(1)', '§3-1'],
    brRefs: ['BR-602'],
    unresolved: [],
  },
  {
    code: 'GOV-REG-02',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'التسجيل والامتثال لدى الهيئة العامة للأوقاف',
    workstreamEn: 'Authority registration',
    titleAr:
      'تحديث بيانات ومعلومات الوقف لدى الهيئة خلال مدة لا تتجاوز خمسة عشر يوم عمل عند انتهاء صلاحية شهادة تسجيل الوقف، أو عند أي تغيُّر جوهري يطرأ على الأصل الموقوف أو الموقوف عليهم أو على النظارة.',
    titleEn: 'Update waqf data on certificate expiry / material change',
    frameworkBullets: [{ subsection: '3-1', ordinal: 2, line: 98 }],
    gate: 'ALL',
    recurrence: 'EVENT',
    deadlineRuleKey: 'UPDATE_15BD',
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 8(2)', '§3-1'],
    brRefs: ['BR-1002, BR-107'],
    unresolved: [],
  },
  {
    code: 'GOV-REG-03',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'التسجيل والامتثال لدى الهيئة العامة للأوقاف',
    workstreamEn: 'Authority registration',
    titleAr:
      'مراعاة تصنيف الهيئة للأوقاف (الكبيرة، والمتوسطة، والصغيرة، وذات الانتفاع المباشر) وتطبيق المتطلبات المقررة لكل فئة.',
    titleEn: 'Apply & maintain the Authority classification',
    frameworkBullets: [{ subsection: '3-1', ordinal: 3, line: 99 }],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 8(3)', '§3-1'],
    brRefs: ['BR-104'],
    unresolved: [],
  },
  {
    code: 'GOV-SHART-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'تنفيذ شرط الواقف',
    workstreamEn: 'Shart execution',
    titleAr: 'تنفيذ شرط الواقف وعدم مخالفته وفق الاعتبارات الشرعية والنظامية.',
    titleEn: 'Execute the Shart al-Waqif; no deviation without permission',
    frameworkBullets: [
      { subsection: '3-2', ordinal: 1, line: 103 },
      { subsection: '3-2', ordinal: 2, line: 104 },
      { subsection: '3-2', ordinal: 3, line: 105 },
    ],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 9', '§3-2'],
    brRefs: ['BR-103'],
    unresolved: [],
  },
  {
    code: 'GOV-SHART-02',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'تنفيذ شرط الواقف',
    workstreamEn: 'Shart execution',
    titleAr:
      'إعداد اللوائح الداخلية للوقف بما يتوافق مع شرط الواقف وأحكام اللوائح والتعليمات الصادرة عن الهيئة، وذلك للأوقاف الكبيرة والمتوسطة.',
    titleEn: 'Prepare internal bylaws (per Shart & Authority rules)',
    frameworkBullets: [{ subsection: '3-2', ordinal: 4, line: 106 }],
    gate: 'LARGE_MEDIUM',
    // ⊕ S8-Q8a (owner, 2026-08-25, PROVISIONAL pending counsel): the compound `once + annual
    // review` split — this row is the ONCE half (prepare); GOV-SHART-03 below is the review.
    recurrence: 'ONCE',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 9(4)', '§3-2'],
    brRefs: ['BR-606'],
    unresolved: [],
  },
  {
    code: 'GOV-SHART-03',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'تنفيذ شرط الواقف',
    workstreamEn: 'Shart execution',
    // The review's Arabic IS the same stipulation's bullet (3-2#4) — the SPLIT is the owner's
    // cadence ruling (S8-Q8a), not a new framework duty, so both halves quote the one bullet
    // rather than one of them inventing wording.
    titleAr:
      'إعداد اللوائح الداخلية للوقف بما يتوافق مع شرط الواقف وأحكام اللوائح والتعليمات الصادرة عن الهيئة، وذلك للأوقاف الكبيرة والمتوسطة.',
    titleEn: 'Annual review of the internal bylaws',
    frameworkBullets: [{ subsection: '3-2', ordinal: 4, line: 106 }],
    gate: 'LARGE_MEDIUM',
    recurrence: 'ANNUAL',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 9(4)', '§3-2'],
    brRefs: ['BR-606'],
    unresolved: [],
  },
  {
    code: 'GOV-GEN-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'التزامات الناظر العامة',
    workstreamEn: 'Nazir obligations',
    titleAr:
      'إتاحة المعلومات والبيانات للموقوف عليهم متى تعلقت بمصالحهم وعند طلبها، واطلاعهم بصفة دورية على القوائم المالية للوقف -وبخاصة الأوقاف الكبيرة والمتوسطة-.',
    titleEn: 'Make info available to beneficiaries; periodic statements',
    frameworkBullets: [{ subsection: '3-3', ordinal: 3, line: 112 }],
    gate: 'LARGE_MEDIUM',
    // ⊕ S8-Q8b (owner, 2026-08-25, PROVISIONAL pending counsel): the periodic duty is ANNUAL
    // (the audited-statements cycle); on-request access is conduct, not a schedulable task.
    recurrence: 'ANNUAL',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 10(3,9)', '§3-3'],
    brRefs: ['BR-802'],
    unresolved: [],
  },
  {
    code: 'GOV-GEN-02',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'التزامات الناظر العامة',
    workstreamEn: 'Nazir obligations',
    titleAr:
      'وضع آلية للتواصل مع أصحاب المصالح المرتبطين بالوقف -بما يشمل الموقوف عليهم- بهدف تلقي الاستفسارات والمقترحات والشكاوى ومعالجتها.',
    titleEn: 'Stakeholder communication channel (inquiries/complaints)',
    frameworkBullets: [{ subsection: '3-3', ordinal: 5, line: 114 }],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 10(5)', '§3-3'],
    brRefs: ['BR-804'],
    unresolved: [],
  },
  {
    code: 'GOV-GEN-03',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'التزامات الناظر العامة',
    workstreamEn: 'Nazir obligations',
    titleAr: 'وضع آلية لصرف عوائد الوقف عند وجود مستحقين خارج المملكة، وإشعار الهيئة بذلك.',
    titleEn: 'Cross-border disbursement mechanism + Authority notice',
    frameworkBullets: [
      { subsection: '3-3', ordinal: 7, line: 116 },
      { subsection: '3-3', ordinal: 6, line: 115 },
    ],
    gate: 'EXCLUDE_DIRECT',
    recurrence: 'EVENT',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 10(7)', '§3-3'],
    brRefs: ['BR-511'],
    unresolved: [],
  },
  {
    code: 'GOV-GEN-04',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'التزامات الناظر العامة',
    workstreamEn: 'Nazir obligations',
    // ⊕ S8-Q9: a discrete, gateable PROHIBITION with a prior-approval requirement — exactly the
    // shape a compliance register exists to carry (the map's own words for this bullet).
    titleAr:
      'التقيُّد بالأنظمة واللوائح والتعليمات ذات العلاقة بجمع التبرعات، وعدم القيام بأي نشاط في هذا الشأن إلا بعد الحصول على موافقة الجهات المختصة في المملكة.',
    titleEn: 'Comply with donation-collection rules; no such activity without prior approval',
    frameworkBullets: [{ subsection: '3-3', ordinal: 2, line: 111 }],
    gate: 'ALL',
    recurrence: 'EVENT',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 10', '§3-3'],
    brRefs: ['BR-802'],
    unresolved: [],
  },
  {
    code: 'GOV-AML-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'الالتزامات الرقابية ومكافحة غسل الأموال وتمويل الإرهاب',
    workstreamEn: 'AML/CTF',
    titleAr:
      'جمع معلومات كافية عن المستفيدين الحقيقيين من عوائد الوقف، والتحقق منها بكافة الوسائل الممكنة والموثوقة، وحفظها وإبقاؤها محدَّثة.',
    titleEn: 'Collect, verify & keep-current UBO data (re-verification)',
    frameworkBullets: [{ subsection: '3-4', ordinal: 1, line: 120 }],
    gate: 'ALL',
    recurrence: 'ANNUAL',
    deadlineRuleKey: 'KYC_REFRESH',
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 10(8)', '§3-4'],
    brRefs: ['BR-605, BR-205'],
    // ⊖ deadline-binding question RESOLVED 2026-08-26 (S9-2): KYC_REFRESH computes since S9-1/S9-2 (the rule vocabulary + kyc.refreshIntervalMonths).
    unresolved: [],
  },
  {
    code: 'GOV-AML-02',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'الالتزامات الرقابية ومكافحة غسل الأموال وتمويل الإرهاب',
    workstreamEn: 'AML/CTF',
    titleAr:
      'الإبلاغ الفوري للإدارة العامة للتحريات المالية برئاسة أمن الدولة عند الاشتباه -أو توافر أسباب معقولة للاشتباه- في ارتباط أموال الوقف أو بعضها بمتحصلات جريمة أو بعمليات غسل أموال أو تمويل إرهاب أو في استخدامها في تلك العمليات بما في ذلك محاولات إجرائها.',
    titleEn: 'Report AML/CTF suspicion to the FIU (→ Engine C)',
    frameworkBullets: [
      { subsection: '3-4', ordinal: 2, line: 121 },
      { subsection: '3-4', ordinal: 3, line: 122 },
      { subsection: '3-4', ordinal: 4, line: 123 },
    ],
    gate: 'ALL',
    recurrence: 'EVENT',
    deadlineRuleKey: 'AML_IMMEDIATE',
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 10(10)', '§3-4'],
    brRefs: ['BR-604'],
    // ⊖ deadline-binding question RESOLVED 2026-08-26 (S9-2): AML_IMMEDIATE is refused as a non-clock BY NAME (AML_IMMEDIATE_NOT_A_CLOCK - a computed AML date in the deadline plane would itself be a G-6 leak); the same-day SLA is the dashboard's.
    unresolved: [],
  },
  {
    code: 'GOV-PROT-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'حماية الوقف وصيانة أصوله',
    workstreamEn: 'Waqf protection',
    titleAr:
      'صيانة الوقف وإصلاحه، بما في ذلك استقطاع مبلغ مناسب من العوائد قبل صرفها وتوزيعها لتغطية تكاليف الصيانة والتشغيل والتكاليف الأخرى اللازمة لإدارة الوقف.',
    titleEn: 'Reserve maintenance (ṣiyāna) before distribution; preserve asset',
    frameworkBullets: [
      { subsection: '3-5', ordinal: 3, line: 129 },
      { subsection: '3-5', ordinal: 1, line: 127 },
      { subsection: '3-5', ordinal: 2, line: 128 },
    ],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 12', '§3-5'],
    brRefs: ['BR-303, BR-505'],
    unresolved: [],
  },
  {
    code: 'GOV-PROT-02',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'حماية الوقف وصيانة أصوله',
    workstreamEn: 'Waqf protection',
    titleAr:
      'عدم استبدال أصل الوقف إلا بعد الحصول على إذن الجهة المختصة، وإشعار الهيئة بأي عملية استبدال خلال مدة لا تتجاوز عشرة أيام عمل من تاريخ إتمامها، مع تضمين الإشعار بيانات تفصيلية عن الأصل البديل.',
    titleEn: 'istibdal: Authority permission + notify within 10 bd of completion',
    frameworkBullets: [{ subsection: '3-5', ordinal: 4, line: 130 }],
    gate: 'ALL',
    recurrence: 'EVENT',
    deadlineRuleKey: 'ISTIBDAL_10BD',
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 12(3)', '§3-5'],
    brRefs: ['BR-403, BR-306'],
    unresolved: [],
  },
  {
    code: 'GOV-GOVN-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'إدارة الوقف والحوكمة',
    workstreamEn: 'Governance',
    titleAr:
      'وضع أنظمة وضوابط رقابية لأموال الوقف بما يكفل حمايتها والصرف منها واستغلالها بحسب أفضل المعايير.',
    titleEn: 'Internal controls over waqf funds',
    frameworkBullets: [
      { subsection: '3-6', ordinal: 3, line: 136 },
      { subsection: '3-6', ordinal: 1, line: 134 },
      { subsection: '3-6', ordinal: 4, line: 137 },
      { subsection: '3-6', ordinal: 6, line: 139 },
    ],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 14', '§3-6'],
    brRefs: ['BR-611'],
    unresolved: [],
  },
  {
    code: 'GOV-GOVN-02',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'إدارة الوقف والحوكمة',
    workstreamEn: 'Governance',
    titleAr:
      'إعداد اللوائح الداخلية والسياسات والإجراءات اللازمة لإدارة الوقف -بما فيها المتعلقة بتحصيل العوائد وصرفها واستثمارها- ومراجعتها وتحديثها بشكل دوري، وذلك للأوقاف الكبيرة والمتوسطة.',
    titleEn: 'Internal policies/procedures (collection/disbursement/investment)',
    frameworkBullets: [{ subsection: '3-6', ordinal: 2, line: 135 }],
    gate: 'LARGE_MEDIUM',
    // §09's cell reads `annual review`; compressed to ANNUAL — see COMPLIANCE_RECURRENCES.

    recurrence: 'ANNUAL',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 14', '§3-6'],
    brRefs: ['BR-606'],
    unresolved: [],
  },
  {
    code: 'GOV-GOVN-03',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'إدارة الوقف والحوكمة',
    workstreamEn: 'Governance',
    titleAr:
      'إلحاق العاملين في الوقف بالبرامج التوعوية والتدريبية المتعلقة بالأوقاف -ومنها برامج مكافحة جرائم غسل الأموال وتمويل الإرهاب- بحسب طبيعة مهام كل وظيفة ووفق أفضل الممارسات.',
    titleEn: 'AML/CTF & waqf training for staff',
    frameworkBullets: [{ subsection: '3-6', ordinal: 5, line: 138 }],
    gate: 'ALL',
    recurrence: 'ANNUAL',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 14(4)', '§3-6'],
    brRefs: ['BR-1104'],
    unresolved: [],
  },
  {
    code: 'GOV-COI-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'إدارة الوقف والحوكمة',
    workstreamEn: 'Governance',
    titleAr: null,
    titleEn: 'Conflict-of-interest disclosure; no self-dealing (≤ 2nd degree)',
    frameworkBullets: [],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 18', '§3-6'],
    brRefs: ['BR-610'],
    unresolved: [
      questionReason(UNSOURCED_ARABIC_SUBJECTS, 'GOV-COI-01', 'UNSOURCED_ARABIC_SUBJECTS'),
    ],
  },
  {
    code: 'GOV-LEG-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'الأعمال القانونية',
    workstreamEn: 'Legal',
    titleAr: 'متابعة وتجديد العقود والاتفاقيات والتأكد من سريانها النظامي ومواعيد انتهائها.',
    titleEn: 'Draft/review/renew contracts; legal advisory & memos',
    frameworkBullets: [
      { subsection: '3-7', ordinal: 4, line: 147 },
      { subsection: '3-7', ordinal: 1, line: 144 },
      { subsection: '3-7', ordinal: 2, line: 145 },
      { subsection: '3-7', ordinal: 3, line: 146 },
      { subsection: '3-7', ordinal: 5, line: 148 },
      { subsection: '3-7', ordinal: 7, line: 150 },
    ],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: 'CONTRACT_RENEWAL',
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§3-7'],
    brRefs: ['BR-612'],
    // ⊖ deadline-binding question RESOLVED 2026-08-26 (S9-2): CONTRACT_RENEWAL computes since S9-2 (deadline.CONTRACT_RENEWAL.preExpiryLeadBd).
    unresolved: [],
  },
  {
    code: 'GOV-JUD-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'الأعمال القضائية',
    workstreamEn: 'Judicial',
    titleAr: 'تمثيل الوقف أمام المحاكم والجهات القضائية وشبه القضائية واللجان ذات الاختصاص.',
    titleEn: 'Represent the waqf; track cases, hearings, execution/collection',
    frameworkBullets: [
      { subsection: '3-8', ordinal: 2, line: 155 },
      { subsection: '3-8', ordinal: 1, line: 154 },
      { subsection: '3-8', ordinal: 3, line: 156 },
      { subsection: '3-8', ordinal: 4, line: 157 },
      { subsection: '3-8', ordinal: 5, line: 158 },
      { subsection: '3-8', ordinal: 6, line: 159 },
    ],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: 'HEARING',
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§3-8'],
    brRefs: ['BR-612'],
    // ⊖ deadline-binding question RESOLVED 2026-08-26 (S9-2): HEARING is as-dated by design (S9-1 vocabulary).
    unresolved: [],
  },
  {
    code: 'GOV-RGL-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'الأعمال التنظيمية',
    workstreamEn: 'Regulatory',
    titleAr:
      'متابعة وتجديد التراخيص والسجلات والتصاريح اللازمة لأعمال الوقف قبل انتهاء مددها النظامية.',
    titleEn: 'Renew licences/permits before expiry',
    frameworkBullets: [{ subsection: '3-9', ordinal: 1, line: 163 }],
    gate: 'ALL',
    recurrence: 'EVENT',
    deadlineRuleKey: 'LICENSE_RENEWAL',
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§3-9'],
    brRefs: ['BR-608'],
    // ⊖ deadline-binding question RESOLVED 2026-08-26 (S9-2): LICENSE_RENEWAL computes since S9-2 (deadline.LICENSE_RENEWAL.preExpiryLeadBd).
    unresolved: [],
  },
  {
    code: 'GOV-RGL-02',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'الأعمال التنظيمية',
    workstreamEn: 'Regulatory',
    titleAr:
      'متابعة المعاملات والإجراءات لدى الجهات الحكومية والهيئات والمنصات ذات العلاقة بأعمال الوقف.',
    titleEn: 'Track government-platform transactions & filing status',
    frameworkBullets: [
      { subsection: '3-9', ordinal: 2, line: 164 },
      { subsection: '3-9', ordinal: 3, line: 165 },
      { subsection: '3-9', ordinal: 5, line: 167 },
    ],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['§3-9'],
    brRefs: ['BR-603'],
    unresolved: [],
  },
  {
    code: 'GOV-RGL-03',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'الأعمال التنظيمية',
    workstreamEn: 'Regulatory',
    titleAr: 'إعداد وتوثيق القرارات والمحاضر والسجلات المتعلقة بأعمال الوقف وحفظها وأرشفتها.',
    titleEn: 'Retain records ≥ 10 years; rapid retrieval',
    frameworkBullets: [
      { subsection: '3-9', ordinal: 4, line: 166 },
      { subsection: '3-6', ordinal: 7, line: 140 },
      { subsection: '3-7', ordinal: 6, line: 149 },
    ],
    gate: 'ALL',
    recurrence: 'ONGOING',
    deadlineRuleKey: 'RETENTION_10Y',
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 20', '§3-9'],
    brRefs: ['BR-607'],
    // ⊖ the deadline-binding claim RESOLVED 2026-08-26 (S9-2): RETENTION_10Y is refused as a
    // non-clock BY NAME (RETENTION_FLOOR_NOT_A_CLOCK); the binding stays for provenance. The
    // UNSOURCED-ARABIC question is untouched and still open.
    unresolved: [
      questionReason(UNSOURCED_ARABIC_SUBJECTS, 'GOV-RGL-03', 'UNSOURCED_ARABIC_SUBJECTS'),
    ],
  },
  {
    code: 'GOV-INV-01',
    libraryVersion: OBLIGATION_LIBRARY_VERSION,
    section: 'GOVERNMENT_LEGAL',
    workstreamAr: 'استثمار الوقف وتنمية أصوله',
    workstreamEn: 'Investment',
    titleAr:
      'استثمار أموال الوقف بما يتوافق مع أحكام الشريعة الإسلامية ودون الإخلال بشرط الواقف والأنظمة ذات الصلة.',
    titleEn: 'Sharia-compliant investment within risk limits; develop asset',
    frameworkBullets: [
      { subsection: '3-10', ordinal: 1, line: 171 },
      { subsection: '3-10', ordinal: 2, line: 172 },
      { subsection: '3-10', ordinal: 3, line: 173 },
      { subsection: '3-10', ordinal: 4, line: 174 },
      { subsection: '3-10', ordinal: 5, line: 175 },
    ],
    gate: 'ALL',
    recurrence: 'EVENT',
    deadlineRuleKey: null,
    phase: null,
    defaultOwnerRole: null,
    isReservedMatter: null,
    regulationRefs: ['Art. 16', '§3-10'],
    brRefs: ['BR-510'],
    unresolved: [],
  },
]);

/** Index by code. Built once; a duplicate code is caught by the fidelity suite, not silently. */
const BY_CODE: ReadonlyMap<string, ObligationTemplate> = new Map(
  OBLIGATION_LIBRARY.map((entry) => [entry.code, entry]),
);

/**
 * One template by code, or `null`.
 *
 * `null` rather than a throw, and rather than `undefined`: a caller resolving a code that came out
 * of a database row needs to be able to REPORT "this task names an obligation the library does not
 * have" — which is a real state once a task row can outlive a library version.
 */
export function obligationTemplate(code: string): ObligationTemplate | null {
  return BY_CODE.get(code) ?? null;
}

/** Every template in a section, in library order. */
export function templatesInSection(section: string): readonly ObligationTemplate[] {
  return Object.freeze(OBLIGATION_LIBRARY.filter((entry) => entry.section === section));
}

/**
 * Every open question the library carries, flattened for a report or a screen.
 *
 * Exists so a caller does not have to know there are three separate maps: the point of carrying the
 * questions as data was that they reach somebody, and a shape that has to be assembled by each
 * caller is a shape that gets assembled once and then forgotten.
 */
export function libraryOpenQuestions(): readonly { code: string; reasons: readonly string[] }[] {
  return Object.freeze(
    OBLIGATION_LIBRARY.filter((entry) => entry.unresolved.length > 0).map((entry) => ({
      code: entry.code,
      reasons: entry.unresolved,
    })),
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ THE ONE TEMPLATE `compliance_obligation` CANNOT HOLD — measured, derived, and pinned
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Templates the DATABASE cannot store, with the reason — the ROW-level twin of
 * {@link OBLIGATION_TEMPLATE_SCHEMA_DELTA}, which declares the same debt at COLUMN level.
 *
 * ── WHAT WAS MEASURED (S8, the seeding stage, 2026-08-23) ────────────────────────────────────
 * `schema.prisma` declares `ComplianceObligation.titleAr` as `String` — NOT NULL, written that way
 * by `init/migration.sql:377` and relaxed by none of the thirty-two migrations since. Exactly one
 * catalogue row carries `titleAr: null`: **`GOV-COI-01`** (Nazarah Art. 18 — conflict-of-interest
 * disclosure and the ≤2nd-degree self-dealing prohibition), because QMULATE's own framework does not
 * restate that duty in Arabic at all and composing one would mean **inventing the wording of a
 * self-dealing prohibition**. See {@link UNSOURCED_ARABIC_SUBJECTS}, which is where that measurement
 * and its grep live.
 *
 * So the seeded library is **36 of 37 rows**, and the missing one is not an oversight, a transcription
 * failure, or a count that drifted: it is a NOT NULL column meeting a source that has nothing to put
 * in it. The register carries no conflict-of-interest duty today — it carried none before either —
 * and the gap is the FRAMEWORK's, already routed to the product-approved copy review.
 *
 * ── WHY THIS IS DERIVED AND NOT A LIST ──────────────────────────────────────────────────────
 * A hand-written `['GOV-COI-01']` would still say 36 on the day the Arabic arrives, and nobody would
 * re-read it. Derived from `titleAr === null`, the set **empties by itself** the moment either half
 * of the cause is removed — the Arabic lands, or the column becomes nullable — and the membership
 * assertion in `__tests__/compliance-parity.test.ts` goes RED so the seed count has to be moved
 * deliberately. That test also reads the schema TEXT and asserts `titleAr` is still NOT NULL, so the
 * two halves of the reason are both pinned rather than remembered.
 *
 * ⚠ **THE ALTERNATIVE WAS NOT TAKEN, AND IT IS THE OWNER'S TO TAKE.** Making the column nullable and
 * seeding all 37 puts the duty on the register — at the price of relaxing a control on a
 * legal-authoritative Arabic column and forcing a product COPY decision nobody in engineering may
 * make: what an Arabic screen renders for a duty whose Arabic does not exist. `ClassificationPanel`
 * renders `isArabic ? titleAr : titleEn`, so today a null would render BLANK. Surfaced to the owner
 * with the seeding stage (binding rule 4); this is the fail-closed reading in the meantime.
 */
export function templatesWithheldFromRegister(): readonly {
  code: string;
  reason: string;
}[] {
  return Object.freeze(
    OBLIGATION_LIBRARY.filter((entry) => entry.titleAr === null).map((entry) => ({
      code: entry.code,
      // Throws if a null-titleAr row is not declared in the unsourced-Arabic map — so a second null
      // cannot arrive carrying no explanation of why the library shrank.
      reason: questionReason(UNSOURCED_ARABIC_SUBJECTS, entry.code, 'unsourced Arabic'),
    })),
  );
}

/** The subset of {@link OBLIGATION_LIBRARY} the seed writes: everything not withheld above. */
export function storableTemplates(): readonly ObligationTemplate[] {
  const withheld = new Set(templatesWithheldFromRegister().map((entry) => entry.code));
  return Object.freeze(OBLIGATION_LIBRARY.filter((entry) => !withheld.has(entry.code)));
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * LOAD-TIME VALIDATION OF THE S8-Q1 COMPARTMENT LIST
 *
 * ⚠ A misspelled code in `AML_RESTRICTED_TEMPLATE_CODES` classifies NOTHING, so `GOV-AML-02` would
 * seed `NORMAL` and the duty to report would be back on the general register — the exact leak the
 * ruling closes — with every test still green, because nothing malfunctioned. `questionReason`'s
 * precedent applies verbatim: failing at module load, by name, is the honest alternative to letting a
 * silent no-op ship. This runs once per process and costs one Map lookup per listed code.
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */
/**
 * Throws unless every compartmented code names a real template.
 *
 * Exported so the property can be DRIVEN with a bad code rather than only observed holding with a
 * good one — a load-time check nothing can exercise is a check whose failure path has never run.
 */
export function assertCompartmentedCodesResolve(codes: readonly string[]): void {
  const unmatched = codes.filter((code) => !BY_CODE.has(code));
  if (unmatched.length === 0) return;
  throw new Error(
    `compliance catalogue: AML_RESTRICTED_TEMPLATE_CODES names ${unmatched.join(', ')}, which is ` +
      'not a template in OBLIGATION_LIBRARY. A code that matches nothing compartments nothing — ' +
      'the register row it was meant to hide would be seeded NORMAL and the duty to report would ' +
      'be visible to every holder of compliance:task:read (S8-Q1, product owner 2026-08-23). Fix ' +
      'the spelling or remove the entry; do not leave it unmatched.',
  );
}

assertCompartmentedCodesResolve(AML_RESTRICTED_TEMPLATE_CODES);

/* ═════════════════════════════════════════════════
 * ⊕ S11 (2026-09-02) · WHICH `instantiatedReason`s MEAN "A REGISTER EXISTS"
 * ═════════════════════════════════════════════════
 *
 * THE DEFECT THIS NAMES (found by item 2a, routed to E11, fixed at its root): the API decided
 * "this endowment already has a compliance register" by `instantiatedReason IS NOT NULL`. But a
 * duty RAISED BY ITS TRIGGER — the certificate sweep or a material change writing a GOV-REG-02
 * task with reason `EVENT_TRIGGER` — is a single duty, not a register; it can exist on an endowment
 * whose initial setup has never run. So an endowment whose certificate expired BEFORE its register
 * was generated was PERMANENTLY refused initial setup ("already has an engine-instantiated
 * register" — false), silently never received its register, and a library upgrade on it would have
 * attached duties to a register that did not exist. Exactly the endowments most likely to be in
 * breach at first-client onboarding.
 *
 * Of the four reasons, only `EVENT_TRIGGER` can exist without a register: `RECLASSIFICATION` and
 * `LIBRARY_UPGRADE` are diffs ON an existing register and presuppose an `INITIAL_SETUP`. They are
 * still named here — belt and braces — because the SAFETY comes from the pin, not the list: a test
 * asserts that this set ∪ {EVENT_TRIGGER} equals the Prisma enum member for member, so a fifth
 * reason cannot arrive and silently inherit either side. Classify it deliberately, here.
 */
export const REGISTER_INSTANTIATION_REASONS = Object.freeze([
  'INITIAL_SETUP',
  'RECLASSIFICATION',
  'LIBRARY_UPGRADE',
] as const);
export type RegisterInstantiationReason = (typeof REGISTER_INSTANTIATION_REASONS)[number];

/** The one reason that is a DUTY raised by its trigger, not a register — never proof of setup. */
export const EVENT_TRIGGER_REASON = 'EVENT_TRIGGER' as const;

/** True iff a task carrying this reason proves that a register was instantiated on its endowment. */
export function isRegisterInstantiationReason(reason: string | null | undefined): boolean {
  return (
    reason !== null &&
    reason !== undefined &&
    (REGISTER_INSTANTIATION_REASONS as readonly string[]).includes(reason)
  );
}
