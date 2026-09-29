# ADR 0007 — One Hijri Implementation, in `packages/domain`, on Node `Intl`

**Status:** DECIDED (Accepted) — applied 2026-07-27
**Date:** 2026-07-27
**Deciders:** QMULATE (product owner) — engineering presented three options and a recommendation; the pick was the product owner's
**Scope:** `packages/domain` (the new single implementation), `packages/database` (`src/seed/hijri.ts`, `src/extensions/audit.ts`'s `defaultToHijri`), and every dual-calendar surface downstream (§11 localization, reporting, printable statements).
**Relates to:** [§17 Build & ship](../product/prd/17-build-ship-dod.md) (the locked stack line) · [§11 Localization](../product/prd/11-localization-spec.md) · [NFR-02](../product/brd/08-nonfunctional-requirements.md) (no calendar drift) · [BR-1003](../product/brd/06-functional-requirements.md) · [ADR-0003](ADR-0003-append-only-audit-and-shart-immutability.md) (`occurredAtHijri` on every audit event)
**Deviates from:** §17's locked stack, which names `@umalqura/core`. This ADR records the deviation and why.
**Classification:** Privileged & Confidential — internal

---

## Decision (in one line)

**`packages/domain` owns the single Hijri implementation, using Node's `Intl` Umm al-Qura calendar. `@umalqura/core` is not adopted. Three divergent implementations collapse to one.**

---

## The context, briefly

§17's locked stack names `@umalqura/core` for Umm al-Qura conversion. It is **not installed** — zero
occurrences in `pnpm-lock.yaml` and in every `package.json`. What Sprint 1 actually shipped was
`Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn')`, and it shipped it **twice**:

| # | Where | Anchor self-test? |
|---|---|---|
| 1 | `packages/database/src/seed/hijri.ts` | **Yes** — six pinned anchors; the module refuses to load unless it reproduces them |
| 2 | `defaultToHijri` in `packages/database/src/extensions/audit.ts` | **No** |
| 3 | `packages/database/src/hijri.ts` — the single home the first file's own header points at | **Does not exist.** `package.json` maps `./hijri` to `./src/seed/hijri.ts` |

`setHijriFormatter()` exists as the one-line collapse hook and **is never called.** E2's dates engine would
have made this a three-way divergence.

The decisive constraint is that implementation #1's six anchor conversions are **already committed to the
database as frozen history**, and every `audit_event` row carries an `occurredAtHijri` produced by
implementation #2. If two libraries disagree on any date in the fixture's range, Hijri history written by
the seed contradicts what the running application would write, and NFR-02's no-drift guarantee is void —
silently, on filed dates.

## The options presented

| | Option | Assessment given |
|---|---|---|
| (a) | Domain owns one implementation on Node `Intl`; `seed/hijri.ts` becomes a thin re-export via the existing `setHijriFormatter()` hook; the §17 stack line is recorded as a deliberate deviation | *Recommended.* Cannot rewrite frozen history; no new dependency; collapses three to one |
| (b) | Adopt `@umalqura/core` as §17 specifies, gated on a CI parity sweep proving agreement with the `Intl` output across 1978–2026 before the seed is re-run | Honours the locked stack; risks discovering a disagreement that invalidates committed history |
| (c) | Keep both plus a permanent parity test | Maximum detection — but institutionalises the very two-sides-that-must-agree problem that caused both Sprint 1 security holes |

**Decided: (a).**

## Why

- **It cannot rewrite frozen history.** The six anchors reproduce *by construction*, because it is the same
  conversion path that produced them.
- **No dependency, no lockfile churn.** CI runs `--frozen-lockfile`; a lockfile change is a coordination
  cost paid for nothing here.
- **It collapses three implementations to one** — which both existing Hijri files' own headers demand, and
  which nobody had done only because the intended home was never written.
- **(c) is the S1 failure mode as a design.** Sprint 1's closeout lesson was that both of its security holes
  existed because *nothing compared two sides that were supposed to agree*. The fix for that is fewer
  sides, not a test bolted across more of them.

## Consequences

- **`packages/domain` is the single source of truth.** Purity holds: no `@qmulate/*` import, no I/O, no
  `process.env`, no clock read — `asOf`/`start` is always a parameter, and the holiday calendar is a
  parameter rather than a database read. A lint rule now enforces that purity, which previously was
  social convention only.
- All six frozen anchors are asserted **in both directions**.
- **Out-of-range conversions throw; they never extrapolate.** Node ICU will silently extrapolate past the
  Umm al-Qura tabular range (`toHijri('1500-01-01')` returns a confident nonsense answer), so a test pins
  that it throws instead. This is the sharp edge of choosing `Intl`, and it is now guarded.
- `packages/database/src/seed/hijri.ts` becomes a thin re-export through `setHijriFormatter()`;
  `defaultToHijri` in the audit extension resolves to the same implementation. The hook that existed for
  this purpose is finally called.
- **§17's stack line naming `@umalqura/core` is now a deliberate deviation**, recorded in BUILD-PLAN.md's
  deviation table alongside the others.

### Kept from option (b) regardless

(b)'s **parity sweep is the right acceptance gate whichever library wins**, so the discipline is retained:
the anchors are asserted at module load *and* in the test suite, and the dates suite property-tests
Hijri↔Gregorian round-tripping across the supported range rather than at a handful of points. If
`@umalqura/core` is ever adopted, that sweep is the gate it must pass first — and it must pass it before
the seed is re-run, not after.
