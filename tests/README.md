# Tests

How testing is laid out in this monorepo, what each CI job proves, and — just as
importantly — what is **not** proven yet.

> **Data rule, no exceptions.** The only data any test may touch is
> `data/fixtures/sample-waqf.json`, which is invented and uses `FAKE-*` conventions.
> `archive/raw-intake/linga-waqf-case/` contains a real family's real names, deed numbers and
> bank details. It is gitignored, and it must never appear in a fixture, a snapshot, a test
> name, a seed, or a screenshot. If you need another record, extend the fixture with more
> invented data.

---

## Where tests live

Tests sit **next to the code they test**, inside the owning workspace. This directory holds
only cross-cutting documentation and, later, suites that genuinely belong to no single
package.

| Location | Kind | Runner | Script |
| --- | --- | --- | --- |
| `packages/config/test/` | Env schema, fail-fast reporter, residency guards | Vitest | `test` |
| `packages/i18n/test/` | Message-catalogue parity, money + dual-calendar formatters | Vitest | `test` |
| `packages/auth/test/` | Role catalogue and TOTP policy | Vitest | `test` |
| `packages/domain/src/**/*.test.ts` | Pure engines; property tests via fast-check | Vitest | `test` |
| `packages/ui/src/**/__tests__/` | Component behaviour (jsdom) | Vitest | `test` |
| `packages/database/` | Migrations, audit spine, scoping, seed guardrail | Vitest | `test:integration`, `test:guardrail` |
| `apps/web/e2e/` | Browser journeys, **both locales** | Playwright | `test:e2e` |

Root `vitest.workspace.ts` aggregates every package config for local watch mode. **CI does
not use it** — CI runs `turbo run test` so each package is cached independently.

---

## Running them

```bash
pnpm turbo run typecheck        # cheapest signal — run this first
pnpm turbo run lint
pnpm turbo run test             # all Vitest unit suites
pnpm exec vitest                # local watch mode across every package

pnpm --filter @qmulate/i18n run test          # one package
pnpm --filter @qmulate/i18n exec vitest --ui  # one package, watching
```

Anything that needs a database needs a database. This machine has no Docker and no system
PostgreSQL, so use the local harness — see [`scripts/README.md`](../scripts/README.md):

```bash
pnpm exec tsx scripts/dev-postgres.ts --run "pnpm --filter @qmulate/database run migrate:deploy"
pnpm exec tsx scripts/dev-postgres.ts --run "pnpm turbo run test:integration"
```

CI does **not** use that harness. It runs a real `postgres:16-alpine` service container, so a
green local integration run is encouraging, not conclusive.

---

## The CI pipeline

`.github/workflows/ci.yml`, chained with `needs:` so the cheapest signal fails first:

```
typecheck → lint → unit → build → integration → residency-guardrail → e2e → deploy-staging
```

| Job | Proves |
| --- | --- |
| `typecheck` | Every workspace compiles under `strict` + `noUncheckedIndexedAccess`. |
| `lint` | ESLint 9 flat config (RTL, money-as-float and design-system bans) + Prettier. |
| `unit` | Vitest across every package. On `main` it runs `--force` so invariant tests cannot be served from cache. |
| `build` | The whole monorepo builds, Prisma client included. |
| `integration` | `prisma migrate deploy` (never `db push`) + fixture seed against real PostgreSQL. |
| `residency-guardrail` | **Release gate G-8** — two *inverted* assertions: the step passes only when the seed **fails**. |
| `e2e` | Playwright against `apps/web`, in **both `ar` and `en`**. |

### G-8, spelled out

The `residency-guardrail` job is the one whose logic reads backwards, so it is worth stating
plainly. It asserts that the seed **refuses**:

- **G-8a** — to run at all unless `DATA_CLASSIFICATION=fixture-only`;
- **G-8b** — to read any input file other than `data/fixtures/sample-waqf.json`.

Both must exit **non-zero**. A seed that succeeded here would mean real Saudi waqf data could
reach non-KSA-resident infrastructure. The importer half of G-8 lands in E11; the job stays
in the pipeline to pick it up.

---

## What a Sprint-1 test is expected to assert

From the §17 per-feature Definition of Done. A suite that skips one of these is incomplete,
not merely brief:

- **Happy path, edge, error and empty.** All four. "Empty" is the one most often missed and
  the one users hit first.
- **Money is never a JS `number`.** `Decimal @db.Decimal(18,2)` in Prisma, `decimal.js` in
  TypeScript, a decimal string across the wire. Assert precision **above 2^53**, because that
  is where a float silently lies.
- **Bilingual.** `ar.json` and `en.json` must have identical key sets, recursively —
  `packages/i18n/test/messages.test.ts` enforces this. Arabic is the **default** locale, so a
  missing Arabic string is what a real user sees, rendered as a raw dotted key.
- **Dual calendar.** Every legally significant date carries a canonical Gregorian UTC instant
  **plus** a Hijri snapshot frozen at write time. A supplied snapshot must be displayed
  verbatim and **never recomputed** — pick fixture values where a recomputation would visibly
  differ, so the test proves the property instead of restating it.
- **Regulatory figures are configurable, not constant.** No numeric threshold, deadline,
  classification band or fee percentage may be hardcoded — they resolve from `Setting`. Any
  such figure appearing in a test or fixture carries
  **"⚠ unverified — confirm vs primary law"**. That covers, non-exhaustively: the SAR 200M /
  50M bands, the 30 / 15 / 10-business-day windows, the 3-month post-FYE distribution window,
  the ≥10-year retention floor, the 10% *ʿushr* Nazir fee and the ≤10%-of-net-income
  Authority fee.
- **Domain invariants, where the surface exists.** Corpus (*asl*) is never distributed;
  capital receipts — sale and *istibdal* proceeds — are blocked from the distribution
  waterfall; the Shart al-Waqif is immutable outside an authority-gated reserved-matter
  workflow; the engine halts with `SHART_INCOMPLETE` rather than inferring the founder's
  intent.
- **RTL is asserted, not assumed.** Logical CSS only. `left/right/pl/pr/ml/mr` and `h-screen`
  are lint-banned; the E2E suite runs both locales.

---

## Known gaps — do not read a green pipeline as coverage

Recorded here so they stay visible rather than being discovered later.

| Gap | Impact | Owner |
| --- | --- | --- |
| **AC-E0-7 (register → enrol TOTP → sign in) has no test.** The Playwright auth spec is DB-free: rendering, bidi islands, 44 px targets, and the `/api/auth/**` no-redirect assertion. The end-to-end journey needs a migrated + seeded database and a TOTP generator. | The headline E0 auth acceptance criterion is unproven. | Unassigned — belongs in `integration`. |
| **No axe-core / contrast test.** DESIGN.md itself marks `--color-mist` ≥ 4.5:1 and `--color-edge` ≥ 3:1 as *"verify"*. They are asserted, never measured. | WCAG compliance is a claim, not a result. | Should join the `unit` job. |
| **CI soft-skips missing suites.** The `unit`, `integration`, `test:guardrail` and `e2e` steps `grep` the workspace manifests and emit a `::notice` + `exit 0` if no package defines the script. | A suite that disappears passes **silently**. Remove the greps once each suite exists. | Orchestrator. |
| **`packages/config`, `packages/i18n` and `packages/auth` define no `test` script yet.** Their Vitest configs and suites exist; without `"test": "vitest run"` and a `vitest` devDependency, `turbo run test` will not run them — and the soft-skip above hides that. | Three suites written and never executed. | Orchestrator (owns `package.json`). |
| **`test/` directories are outside the packages' `tsconfig.json` `include`.** So `tsc --noEmit` never type-checks the test files, and a `@ts-expect-error` in one is documentation rather than an assertion. | Type-level guarantees — the money-`number` ban above all — are not verified by `typecheck`. | Orchestrator. |
| **`scripts/` is in no tsconfig either.** `scripts/dev-postgres.ts` is linted but never type-checked. | Type errors there surface at runtime. | Orchestrator. |
| **No Sharia review of the engine logic.** The receipt income/capital classification (ADR-0002) is `PROVISIONAL`, unsigned. | Tests encode the *structure* of the invariant, never which receipt is which. | User decision (Binding rule 4). |
| **Local ≠ CI PostgreSQL.** `embedded-postgres` versus `postgres:16-alpine`. | Server-behaviour assertions (audit triggers, advisory locks) are only real once CI runs them. | Keep the majors aligned. |

---

## Conventions

- **Assert on the property, not on the incidental string.** `Intl` output changes with ICU
  versions. Assert numerals, grouping and the absence of Arabic-Indic digits — not a
  byte-exact rendering, and never a bidi control character pasted invisibly into a test file.
  Use `\p{Cf}` / `\p{Zs}` / `\p{Script=Arabic}` rather than hand-rolled code-point ranges.
- **Pin the timezone.** Suites touching dates set `TZ=Asia/Riyadh` in their Vitest config. An
  unpinned timezone makes a 09:00 UTC instant land on the previous day west of Greenwich, and
  the suite then passes or fails by geography.
- **A characterization test must say so.** Where a test pins behaviour that is *wrong but
  current*, name it `KNOWN GAP:` and put the fix in a comment. Pinning a defect without
  labelling it turns the suite into an endorsement of the defect.
- **Self-test a detector.** A test whose assertion is "nothing was found" is worthless if the
  detector is broken. The Arabic-script heuristic in `messages.test.ts` includes a case that
  proves it still catches a copy-pasted English value.
- **Say why, in the test.** These invariants are legal and fiqh obligations, not style
  preferences. A future reader must be able to tell a deliberate constraint from an accident
  without going back to the regulation.
