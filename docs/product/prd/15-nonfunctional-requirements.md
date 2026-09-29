# Non-functional requirements (design targets)

Measurable, testable design targets that turn the BRD's business qualities ([NFR-01](../brd/08-nonfunctional-requirements.md)–[NFR-14](../brd/08-nonfunctional-requirements.md)) into build-ready budgets, acceptance checks, and configuration surfaces — closing the "TBD in design" gaps the BRD deferred.

Status: Draft v0.1 · Privileged & Confidential

---

## How to read this section

Each target below is **numbered to its NFR**, stated as a **number you can measure**, and paired with an **acceptance check** written Given/When/Then. Where the BRD wrote *"targets TBD in design"* (availability [NFR-10], accessibility [NFR-11]), this section **decides** them. Where a value is genuinely commercial-open (SLA credits, exact retention-deletion sign-off), it is routed to [16 · Open questions](16-open-questions.md), not left blank here.

Two cross-cutting rules bind everything:

- **Money is `Decimal(18,2)`, never a float** — every latency, export, and reconciliation target below assumes exact arithmetic end-to-end ([NFR-08 money](../brd/08-nonfunctional-requirements.md)).
- **These targets are verified in CI or by a named runbook, not by hope.** A target with no automated or scripted check is not "done."

Priorities follow the Phase-1 cut: **P0** targets are go-live blockers; **P1** are Phase-1-complete; **P2** are Phase-2/3.

---

## NFR-01 · Bilingual Arabic/English + full RTL · P0

**Targets**

| Metric | Target |
|---|---|
| Locale coverage | 100% of user-facing strings resolved through `packages/i18n` (next-intl/i18next); **zero hardcoded UI strings** — enforced by an `i18n-extract` CI check that fails on any literal in a JSX/TSX text node. |
| RTL correctness | Every screen authored in **logical CSS properties only** (no physical `left`/`right`/`margin-left`); a lint rule (`no-physical-properties`) fails the build on violation. |
| Arabic record storage | Official financial records (transactions, statements) storable and retrievable **in Arabic**; the canonical Arabic string is the record of authority, English is a convenience label ([NFR-01](../brd/08-nonfunctional-requirements.md), Nazarah reg. Art. 15(2)). |
| Font routing | `[lang="ar"]` → IBM Plex Sans Arabic; `en` → Outfit / Geist Mono. Arabic is **never** uppercased or letter-spaced; the logo and time-series time-axis are **never** mirrored. |
| Bidi safety | SAR figures, IBANs, deed numbers, national IDs render LTR/Latin inside `<bdi>` even within an RTL paragraph. |

**Acceptance**

- **Given** the app in `ar`, **when** any Phase-1 screen renders, **then** layout mirrors (sidebar, steppers, breadcrumbs, drawers), tables reverse column order and pin the identity column to inline-start, and **no element is positioned with a physical property** — verified by the `no-physical-properties` lint gate and an RTL visual-regression snapshot per screen.
- **Given** a financial transaction saved with an Arabic description, **when** it is re-opened and when it appears in a regulator export, **then** the Arabic text is byte-preserved (NFC-normalized) and displayed RTL.
- **Given** a new string added to a component, **when** it lacks an i18n key, **then** CI fails before merge.

---

## NFR-02 · Hijri + Gregorian throughout · P0

**Targets**

| Metric | Target |
|---|---|
| Calendar engine | **Umm al-Qura** via `@umalqura/core`; a shared **KSA business-day calculator** (workweek **Sun–Thu**, weekend Fri/Sat, Hijri-moving public holidays from a maintained table). |
| Dual display | Every date renders via `<DateValue>` with **both** calendars — Hijri primary on regulator-facing surfaces, Gregorian primary on operational ones; the alternate always visible ([NFR-02](../brd/08-nonfunctional-requirements.md)). |
| Frozen snapshot | The Hijri value is **computed and frozen at write time** and stored alongside the Gregorian instant; historical rows show the frozen snapshot, never a re-derived value ([BR-1003](../brd/06-functional-requirements.md)). |
| Deadline math | All statutory windows (register **30 bd**, update **15 bd**, istibdal notice **10 bd**, distribute within **3 months** of FYE) computed in **KSA business days** off the Hijri calendar, holiday-aware. |

**Acceptance**

- **Given** an obligation with a Hijri due date, **when** the KSA calendar crosses a moving public holiday, **then** the "business days remaining" count and the derived deadline both exclude that holiday and both weekend days (Fri/Sat) — verified by a fixture suite covering a holiday-spanning window.
- **Given** a filing recorded on a given day, **when** the same record is viewed a year later, **then** its Hijri date is identical to the frozen snapshot regardless of any calendar-table update.

---

## NFR-03 · KSA data residency + PDPL · P0 guardrail

**Targets**

| Metric | Target |
|---|---|
| Residency (pre-prod) | **Hosting on Railway now; KSA-resident prod deferred to before production.** Until a KSA-resident prod exists, **only the anonymized fixture** (`data/fixtures/sample-waqf.json` shapes) may exist in any Railway environment. |
| Enforcement | Env flag `DATA_CLASSIFICATION=fixture-only`; **seed refuses** any non-fixture record; **import tooling hard-fails**; a **CI check** blocks a build that could load real data into non-KSA infra. Real client data **never touches non-KSA infra** ([NFR-03](../brd/08-nonfunctional-requirements.md), C3/C4). |
| Residency (prod) | Before go-live: data at rest, backups, and object storage all in a **KSA region**; PDPL data-processing posture confirmed with Saudi counsel (routed to [16 · Open questions](16-open-questions.md)). |
| PDPL handling | Beneficiary/UBO PII minimized, access-logged, retained per policy, and deletable under controlled retention (see NFR-07); no PII in URLs, logs, or analytics events. |

**Acceptance**

- **Given** any Railway environment, **when** an import or seed attempts a record not flagged fixture-origin, **then** the operation hard-fails with a residency-guardrail error and writes nothing — verified by an integration test and the CI guardrail job.
- **Given** the production cutover checklist, **when** it is executed, **then** residency and PDPL sign-off items are recorded before real data is admitted.

---

## NFR-04 · Immutable, complete audit trail · P0

**Targets**

| Metric | Target |
|---|---|
| Coverage | **Every material action, approval, and access** writes an event: create, edit, approve, disburse, file, export, and **read of a restricted record** ([NFR-04](../brd/08-nonfunctional-requirements.md), [BR-607](../brd/06-functional-requirements.md), Art. 20). |
| Content | who · what · when (dual Hijri/Greg, frozen) · **before/after** snapshot · endowment scope · actor role · source (UI/API/job). |
| Immutability | Append-only; **no UPDATE/DELETE** grant on the audit table for the app role; tamper-evidence via per-row hash chaining. Verified by a DB-permission test asserting the app role cannot mutate or drop rows. |
| Completeness | No material mutation path bypasses the trail — enforced at the `packages/database` layer (Prisma extension) so a write outside the audited path is impossible, not merely discouraged. |
| Latency | Audit write is in the same transaction as the action; if the audit write fails, the action rolls back (no un-logged mutations). |

**Acceptance**

- **Given** a distribution is approved, **when** the approval commits, **then** an audit event with before/after allocation state and the approver identity exists in the same transaction; **and** attempting to `UPDATE` or `DELETE` that row as the app role is rejected by the database.
- **Given** a user opens a restricted beneficiary record, **when** the drawer loads, **then** an access event is recorded and surfaced as a "logged" confirmation.

---

## NFR-05 · Least-privilege access + isolation + no-tipping-off · P0

**Targets**

| Metric | Target |
|---|---|
| Access model | **Per-endowment access matrix**; a user sees only endowments/screens they are entitled to. Detail in [10 · Roles & access-matrix spec](10-roles-access-matrix-spec.md). |
| Beneficiary isolation | Beneficiary self-isolation — a beneficiary sees only their own records; cross-beneficiary access is impossible via the API, not just hidden in the UI. |
| Existence privacy | An unentitled deep link resolves to a scoped **"not authorized"** state, **never a 404 that leaks existence** of an endowment. |
| AML no-tipping-off | An AML SAR record has **restricted visibility**; the subject is **never notified**; no UI, notification, export, or log surfaces the SAR to the subject or to unauthorized roles ([NFR-05](../brd/08-nonfunctional-requirements.md), Art. 22, BO Standards). |
| Enforcement point | Authorization enforced in the **tRPC/API layer** (server-side), verified by contract tests per role; the UI merely reflects it. |

**Acceptance**

- **Given** a staff user not on Endowment E's matrix, **when** they call any tRPC procedure scoped to E (or open `/c/.../e/E/...`), **then** the server returns an authorization denial and the audit trail records the attempt — the response does not disclose whether E exists.
- **Given** an AML SAR on beneficiary B, **when** B (or any unauthorized role) views their own record or any export, **then** no field, flag, or timestamp reveals the SAR's existence.

---

## NFR-06 · Security · P0

**Targets**

| Metric | Target |
|---|---|
| AuthN | **better-auth** self-hosted, email/password + **TOTP mandatory** for money-movement and filing roles ([NFR-06](../brd/08-nonfunctional-requirements.md)). |
| AuthZ | Role-based, per-endowment, server-enforced (see NFR-05). |
| Encryption | TLS 1.2+ in transit; encryption at rest for DB and object storage; secrets in a managed secret store, **never in the repo or env-committed files**. |
| Session | Idle timeout ≤ **30 min** for money/filing roles; re-auth (TOTP) required to approve a disbursement or submit a filing. |
| Dependency hygiene | CI fails on a **critical/high** advisory in a production dependency; secrets-scanning gate on every push. |

**Acceptance**

- **Given** a user in a money-movement role without an enrolled TOTP factor, **when** they attempt to approve a distribution, **then** the action is blocked until TOTP is enrolled and satisfied.
- **Given** a commit containing a secret-shaped string, **when** CI runs, **then** the secrets-scan gate fails the build.

---

## NFR-07 · Retention ≥ 10 years + controlled deletion · P0

**Targets**

| Metric | Target |
|---|---|
| Retention floor | **≥ 10 years** for records and documents; UBO records per BO Standards Art. 7(3); no hard-delete before the floor ([NFR-07](../brd/08-nonfunctional-requirements.md), Art. 20). |
| Retrieval | Any retained record or document retrievable within **≤ 5 s** (metadata) / **≤ 30 s** (archived document fetch); rapid retrieval for audit/dispute. |
| Controlled deletion | Deletion is **policy-gated and audited**; a record inside its retention window cannot be deleted; the deletion action itself is a maker-checker event. Final sign-off authority routed to [16 · Open questions](16-open-questions.md). |
| Legal hold | A record under legal hold or open dispute is **exempt from expiry deletion** until the hold clears. |

**Acceptance**

- **Given** a document 4 years old, **when** any user attempts deletion, **then** it is refused with a "retention floor: 10 years" reason and the attempt is audited.
- **Given** a 10-year-old audit record, **when** an auditor requests it, **then** it is retrieved within the retrieval budget with its frozen Hijri/Greg dates intact.

---

## NFR-08 · Segregation of duties (maker ≠ checker) · P0

**Targets**

| Metric | Target |
|---|---|
| Scope | Dual control on **money movements and government filings**; the **initiator cannot be the sole approver** ([NFR-08](../brd/08-nonfunctional-requirements.md), [BR-506](../brd/06-functional-requirements.md)). |
| Enforcement | Enforced server-side in the workflow state machine — a same-actor approval is **rejected by the API**, not merely warned in the UI. |
| Money exactness | All amounts `Decimal(18,2)`; a distribution run's allocations must **sum exactly** to the distributable (no rounding drift); residual-cent handling is deterministic and documented. |
| Evidence | Every maker-checker event carries both identities, timestamps (dual calendar), and the reviewed diff into the audit trail. |

**Acceptance**

- **Given** user U initiated a distribution run, **when** U attempts to approve it, **then** the API rejects the approval (same-actor) and records the attempt.
- **Given** an approved run, **when** allocations are summed, **then** they equal the distributable to the last halala with zero drift.

---

## NFR-09 · Eligibility constraints enforced in data · P0

**Targets**

| Metric | Target |
|---|---|
| Nazir residency | A Nazir assignment requires a **KSA-resident** flag; a non-resident cannot be saved as active Nazir ([NFR-09](../brd/08-nonfunctional-requirements.md), Nazarah reg. Art. 5). |
| Nationality rule | Where endower is foreign and asset is real property, the **Saudi-nationality rule** is enforced as a validation, surfaced with its reason (BO Standards Art. 8). |
| Model-level | Constraints live in `packages/domain` (pure TS, zod-validated) so they hold identically across web, mobile, API, and jobs. |

**Acceptance**

- **Given** a Nazir candidate without a KSA-resident flag, **when** an assignment is saved, **then** validation rejects it with the residency reason.
- **Given** a foreign endower + real-property asset, **when** the nationality rule is unmet, **then** the save is blocked and the specific constraint is named to the user.

---

## NFR-10 · Availability, reliability, RPO/RTO · P1 *(BRD deferred → decided here)*

The BRD left this "measurable targets TBD in design." **Decided:**

| Metric | Target |
|---|---|
| Uptime (Phase-1 ops app) | **≥ 99.5%** monthly, business-critical windows (Sun–Thu, KSA hours) prioritized. Not a public 24/7 consumer SLA; deadline-critical work is the driver ([NFR-10](../brd/08-nonfunctional-requirements.md)). |
| **RPO** (max data loss) | **≤ 1 hour** — point-in-time recovery / continuous WAL backups. No silent data loss under any failure. |
| **RTO** (max downtime) | **≤ 4 hours** to restore service from backup; a **documented restore runbook** proven by a **quarterly restore drill**. |
| Job durability | pg-boss jobs (deadline generation, KYC-expiry sweeps, reminders) are **idempotent and retried**; a missed cron run self-heals on next tick and never double-fires a filing/notice. |
| Data-loss guarantee | Every material mutation is transactional with its audit write (NFR-04); a crash mid-action leaves **no half-committed** money or filing state. |
| Degradation | External status sources degrade **per-tile / per-feature**, never blanking a whole screen (dashboard rule); the core record system stays available. |

**Acceptance**

- **Given** a database restore drill, **when** the RTO runbook is executed, **then** service is restored within 4 hours and reconciles to a point ≤ 1 hour before failure — recorded each quarter.
- **Given** a distribution transaction interrupted by a crash, **when** the system recovers, **then** the run is either fully committed with its audit event or fully absent — never partial.
- **Given** a cron worker misses a scheduled deadline-sweep, **when** the next tick runs, **then** the sweep completes exactly once with no duplicate reminders or filings.

---

## NFR-11 · Accessibility + UX for non-technical users · P1 *(BRD deferred → decided here)*

The BRD left accessibility "targets TBD in design." **Decided: WCAG 2.1 AA**, with the brand's contrast realities made explicit.

| Metric | Target |
|---|---|
| Standard | **WCAG 2.1 AA** across ops app and (Phase-2) portal: keyboard-operable, visible focus, semantic landmarks, labelled controls, no color-only signaling (status pills carry text/icon, not just hue). |
| Contrast — accent text | **Light-neu (default):** accent **text** uses `--blue #3A54D6` / `--blue-strong #2C3A86` on the bone `--bg`, pre-darkened for AA. **Dark-neu (optional):** accent text uses `--blue-bright #8AA4FF`, never the `--blue` **fill** (which fails AA as text on dark). Blue as a **fill/state/border** is fine in both. |
| Contrast — non-text affordance (WCAG 1.4.11) | **A control's state and boundary must reach ≥3:1 via `--edge`/fill/accent — never the neumorphic shadow alone** (soft shadows are decorative and may be <3:1); state is also carried by icon/text + ARIA, never colour or shadow alone. |
| Contrast — primary button | A primary **blue button** meets AA only with a **≥14px semibold** label (large-text AA), in either theme; small/regular-weight labels on the blue fill are disallowed. |
| Contrast — mist-2 | `--mist-2 #7E8593` (light-neu) is for **large or decorative** text only, **never** body or interactive copy; body secondary text uses `--mist #545B67` (verify ≥4.5:1 on the bone `--bg`). |
| Motion | Loading uses **skeletons matching layout**, no spinners for content; honor `prefers-reduced-motion` (disable drawer/stepper transitions). |
| Target size & clarity | Interactive targets ≥ 44×44px on the mobile portal; error states are **specific and actionable** ("Blocked: beneficiary KYC expired 2026-03-01"), never a raw stack trace. |

**Acceptance**

- **Given** any Phase-1 screen, **when** run through an automated axe-core AA audit in CI, **then** it reports zero violations; a token contrast test asserts `--blue` is never applied as a text color and `--mist-2` never to body/interactive text.
- **Given** the keyboard-only path, **when** a user tabs through the Distribution Run Wizard, **then** every step, field, and the maker-checker control is reachable with a visible focus ring and operable without a mouse.
- **Given** `prefers-reduced-motion`, **when** a drawer opens, **then** it appears without a slide transition.

---

## NFR-12 · Auditability / exportability without engineering · P1

**Targets**

| Metric | Target |
|---|---|
| Self-serve exports | Evidence packs and regulator/auditor exports produced **by an operator, no engineering effort** ([NFR-12](../brd/08-nonfunctional-requirements.md), Art. 21, SOCPA). |
| Surface | A thin **REST/OpenAPI** export endpoint for regulator/auditor consumption (distinct from the first-party tRPC API), plus in-app "Export evidence pack" actions. |
| Formats | Human-facing: **light-theme / print** PDF (statements, evidence packs); machine-facing: structured CSV/JSON. Arabic preserved; SAR tabular; dual dates. |
| Content integrity | An export is a **point-in-time snapshot** with the frozen Hijri/Greg dates and a generation stamp; the export action is itself audited (who exported what, when). |
| Performance | A standard evidence pack (one endowment, one fiscal year) generates in **≤ 30 s**; larger packs run as a **pg-boss job** with a ready-notification, never a blocking spinner. |

**Acceptance**

- **Given** an auditor request, **when** an operator triggers "Export evidence pack" for an endowment/year, **then** a light-theme printable pack is produced within budget, the Arabic records read correctly, and an audit event records the export.
- **Given** the REST export endpoint, **when** a regulator client requests a filing export, **then** it returns the OpenAPI-described structured payload with frozen dates and no PII beyond the authorized scope.

---

## NFR-13 · Configurability without code changes · P1

The core of the BRD's "regime may change" concern. **Every parameter below is a persisted `Setting` (endowment- or tenant-scoped, versioned, audited) — changing it is data, not a deploy.**

| Configurable parameter | Setting | Default | Bounds / notes |
|---|---|---|---|
| **Nazir fee basis** | `nazirFee.basis` | `percent_of_revenue` | one of `percent_of_revenue` \| `percent_of_net_income` \| `retainer` ([BR-507](../brd/06-functional-requirements.md)) |
| **Nazir fee rate** | `nazirFee.rate` | `0.10` (ʿushr) | deed-set; the waterfall reads this, never a hardcoded 10% |
| **Maintenance (ṣiyāna) reserve** | `waterfall.maintenanceReserve` | per deed | reserved **FIRST**, before cost and fee |
| **Classification thresholds** | `classification.thresholds` | Authority table | gates which obligations apply (large/medium vs small/direct); a threshold change re-evaluates the obligation set |
| **Deadline windows** | `deadlines.{register,update,istibdalNotice,distribute}` | 30 / 15 / 10 bd · 3 months | KSA business days; changing a window recomputes open deadlines |
| **Reporting cadence** | `cadence.beneficiaryStatements`, `cadence.internalReview` | per classification | large/medium = periodic; small = simplified annual |
| **KYC re-verification interval** | `kyc.reverificationInterval` | e.g. 12 months | drives the KYC-expiry sweep and dashboard KPI |
| **Distribution timing** | `distribution.defaultWindow` | 3 months of FYE | applied when the Shart sets no schedule |

Rules: every `Setting` change is **audited** (before/after, actor); changes are **versioned** so a historical distribution run reproduces with the fee/window in force *at the time*, not today's value; no parameter above may appear as a literal in `packages/domain` engine code — a lint/test asserts engines read from injected config.

**Acceptance**

- **Given** an operator with the settings role changes `nazirFee.rate` from 0.10 to 0.08, **when** a new distribution run computes, **then** the fee step uses 0.08 and the change is in the audit trail — **with no code deploy**.
- **Given** a historical run computed at 0.10, **when** it is re-opened, **then** it still shows 0.10 (versioned setting), not the current value.
- **Given** the classification threshold is changed so an endowment moves large→small, **when** the obligation set re-evaluates, **then** audited-statement/budget obligations retire and the simplified-annual set applies.

---

## NFR-14 · Data integrity & reconciliation · P1

**Targets**

| Metric | Target |
|---|---|
| Bank reconciliation | Financial records **reconcile to the dedicated waqf bank account**; each endowment uses a **segregated account — no commingling** ([NFR-14](../brd/08-nonfunctional-requirements.md), [BR-503](../brd/06-functional-requirements.md), Art. 15). |
| No orphans | **No orphaned distributions** — every distribution line references a valid beneficiary, a committed run, and a source transaction; referential integrity enforced by FK constraints + a reconciliation job that flags any orphan. |
| Waterfall closure | For every run: `gross = maintenance reserve + operating cost + Nazir fee + distributable`, and `distributable = Σ allocations`, both **exact** in `Decimal(18,2)`. |
| Commingling guard | A transaction posted to an account not tied to the endowment is **rejected**; a cross-endowment fund movement is impossible through the normal path. |

**Acceptance**

- **Given** a completed fiscal period, **when** the reconciliation job runs, **then** ledger totals equal the dedicated-account statement total and zero orphaned distribution lines are reported.
- **Given** a distribution run, **when** its arithmetic is checked, **then** the waterfall and allocation identities both balance to the halala with no rounding drift.
- **Given** an attempt to post income to a non-dedicated or another endowment's account, **when** it is submitted, **then** it is rejected with a commingling-guard reason and audited.

---

## Verification summary (how each target is proven)

| Target group | Verified by |
|---|---|
| i18n / RTL (NFR-01) | `i18n-extract` + `no-physical-properties` lint gates; RTL visual-regression snapshots |
| Hijri/business-day (NFR-02) | holiday-spanning fixture suite; frozen-snapshot test |
| Residency guardrail (NFR-03) | `DATA_CLASSIFICATION` CI job; seed/import hard-fail integration tests |
| Audit immutability (NFR-04) | DB-permission test (app role cannot mutate/drop); transactional-write test |
| Access / no-tipping-off (NFR-05) | per-role tRPC contract tests; SAR-visibility test |
| Security (NFR-06) | TOTP-gate test; secrets-scan + dependency-advisory CI gates |
| Retention (NFR-07) | retention-floor rejection test; retrieval-budget check |
| SoD / money exactness (NFR-08) | same-actor rejection test; Decimal sum-to-distributable test |
| Eligibility (NFR-09) | zod domain validation tests |
| Availability / RPO / RTO (NFR-10) | quarterly restore drill; crash-recovery + idempotent-job tests |
| Accessibility (NFR-11) | axe-core AA CI audit; token-contrast test; keyboard-path test |
| Exportability (NFR-12) | evidence-pack generation test; OpenAPI export contract test |
| Configurability (NFR-13) | no-literal-in-engine test; versioned-setting reproduction test |
| Reconciliation (NFR-14) | reconciliation job (orphan + balance) ; commingling-guard test |

---

## Requirements covered

[NFR-01](../brd/08-nonfunctional-requirements.md), [NFR-02](../brd/08-nonfunctional-requirements.md), [NFR-03](../brd/08-nonfunctional-requirements.md), [NFR-04](../brd/08-nonfunctional-requirements.md), [NFR-05](../brd/08-nonfunctional-requirements.md), [NFR-06](../brd/08-nonfunctional-requirements.md), [NFR-07](../brd/08-nonfunctional-requirements.md), [NFR-08](../brd/08-nonfunctional-requirements.md), [NFR-09](../brd/08-nonfunctional-requirements.md), [NFR-10](../brd/08-nonfunctional-requirements.md), [NFR-11](../brd/08-nonfunctional-requirements.md), [NFR-12](../brd/08-nonfunctional-requirements.md), [NFR-13](../brd/08-nonfunctional-requirements.md), [NFR-14](../brd/08-nonfunctional-requirements.md).

Supporting references: [BR-503](../brd/06-functional-requirements.md), [BR-506](../brd/06-functional-requirements.md), [BR-507](../brd/06-functional-requirements.md), [BR-607](../brd/06-functional-requirements.md), [BR-901](../brd/06-functional-requirements.md), [BR-1003](../brd/06-functional-requirements.md).
