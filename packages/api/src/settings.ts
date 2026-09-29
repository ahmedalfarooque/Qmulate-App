/**
 * THE Setting resolver — one typed, tiered, **uncached-across-requests** reader for every
 * configurable regulatory figure in the system.
 *
 * Source of truth: `docs/product/prd/17-build-ship-dod.md` E2 exit clause 3, verbatim —
 * **"a fee-basis change via `Setting` flows through with no redeploy"** — plus CLAUDE.md binding
 * rule 3 (the staleness rule) and `@qmulate/domain`'s `SETTING_SCHEMAS`, which owns the closed
 * vocabulary this file resolves against.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE FOUR PROPERTIES THIS FILE EXISTS TO GUARANTEE (each has its own test)
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * 1. **THE ENVELOPE IS THE DEFAULT RETURN.** {@link SettingResolver.get} hands back the whole
 *    stored envelope — `{ v, unit, unverified, source, note }` — and {@link SettingResolver.getValue}
 *    is the *explicitly named* escape hatch that returns a bare `v`.
 *
 *    This is not ceremony. Binding rule 3 leaks through a convenient API: a resolver whose
 *    ergonomic method returns a bare number guarantees that the "⚠ unverified — confirm vs primary
 *    law" caveat gets dropped in UI copy, in a report, in an export — precisely where a reader
 *    would take "10%" or "30 business days" for settled Saudi law. Every one of those figures is
 *    UNVERIFIED until confirmed against the Arabic regulation originals and Saudi counsel. So the
 *    caveat travels with the value by default, and dropping it is a deliberate, greppable call.
 *
 * 2. **NO PROCESS-LIFETIME CACHE. EVER.** The memo is per RESOLVER INSTANCE, i.e. per request, and
 *    {@link SettingResolver.set} invalidates it. EXIT-3's mutation is literally "hoist the
 *    per-request memo to module scope", and it must fail — behind a module-scope cache a fee-basis
 *    change needs a redeploy, which is the exact thing the exit clause forbids.
 *
 *    The per-request memo is kept because a request that reads the same figure five times should
 *    see ONE value: a figure that changed halfway through a distribution computation would produce
 *    a payout nobody can reproduce. So within a request the answer is stable; across requests it is
 *    always re-read.
 *
 * 3. **A MISS THROWS `SETTING_MISSING`. NEVER A DEFAULT.** No row at any tier, an unregistered key,
 *    a malformed envelope, an unsupported scope tier — all refuse. An engine that substituted a
 *    default for a missing statutory window would produce a confidently wrong filing deadline, and
 *    "confidently wrong" is the worst outcome available for a regulatory figure.
 *
 * 4. **TWO TIERS, AND IT SAYS SO.** ENDOWMENT → GLOBAL. See the honesty note below.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⚠ TWO TIERS, NOT THREE — REPORTED, NOT PAPERED OVER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * §17 names three scopes (global / client / endowment). **`model Setting` has no `clientId`
 * column** — it carries `waqfId String?` and nothing else (`schema.prisma`, `@@unique([waqfId,
 * key])`), and `@qmulate/domain`'s `SETTING_SCOPE_ORDER` is `['endowment', 'global']`. So what
 * ships is a TWO-TIER resolver.
 *
 * {@link SettingScope} still declares `clientId` — and passing it **THROWS `SETTING_INVALID`**.
 * That is the fail-closed reading and it is the whole point of keeping the field: silently ignoring
 * a client-scoped request would return the GLOBAL value while the caller believed they had a
 * family-level override, which is worse than either supporting it or rejecting it. A third tier
 * needs a migration and a decision about what "the family's fee basis" means when §10 principle 2
 * says scope is the endowment and never the client — that is a product/legal question, not a
 * refactor, and it is surfaced rather than resolved here.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THIS FILE DELIBERATELY DOES NOT DO
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * · **It owns no vocabulary.** Every key, schema, unit and marker comes from `@qmulate/domain`'s
 *   `SETTING_SCHEMAS` / `parseSetting` / `pickMostSpecific`. A second key list here would be the
 *   Sprint-1 failure mode: two sides that must agree with nothing comparing them.
 * · **It performs no authorization.** {@link SettingResolver.set} is a PRIMITIVE. It reads and
 *   writes through the caller's own scoped `ExtendedPrismaClient`, so the force-filter still
 *   applies (a per-endowment row is invisible without a grant on that endowment) — but *who may
 *   change a fee basis* is decided by the procedure ladder, in `src/routers/settings.ts`, where
 *   `settings.set` is built on `checkerProcedure('fee:nazir_fee:approve')`. §10 §4.1 makes a
 *   fee-basis change a `nazir` `A*` action, and EXIT-3 requires an `admin` caller — config
 *   authority, never governance authority — to be REJECTED.
 *
 *   ⚠ That split is load-bearing and it is the one thing to be careful about when extending this
 *   file: a second request-path caller of `set()` that is not on the approval rung would be a
 *   second way to change the Nazir's remuneration. `test/setting-resolver.integration.test.ts`
 *   pins it by reading the REAL composed middleware chain of `settingsRouter.set`.
 * · **It does not hardcode one figure.** Not a fee, not a band, not a window, not a fallback. The
 *   only literals here are Setting KEY names, and even those are `@qmulate/domain`'s.
 */

import {
  SETTING_KEYS,
  SETTING_SCOPE_ORDER,
  UNVERIFIED_NOTE,
  isSettingKey,
  parseSetting,
  pickMostSpecific,
  settingScopeOrder,
  type ScopedSettingCandidate,
  type SettingKey,
  type SettingScopeTier,
  type SettingValue,
} from '@qmulate/domain';
import { DomainError } from '@qmulate/domain';
import type { ExtendedPrismaClient } from '@qmulate/database';

/* re-exported so a caller needs ONE import to read a figure and render its caveat */
export {
  SETTING_KEYS,
  SETTING_SCOPE_ORDER,
  UNVERIFIED_NOTE,
  isSettingKey,
  parseSetting,
  settingScopeOrder,
};
export type { SettingKey, SettingScopeTier, SettingValue };

/**
 * The tRPC surface, re-exported here so `settings.ts` is the single import for "the Setting
 * resolver and its router" (the E2 contract asked for both from one place).
 *
 * The import cycle `settings.ts → routers/settings.ts → settings.ts` is safe and intentional:
 * `routers/settings.ts` needs only {@link createSettingResolver}, which is a hoisted function
 * DECLARATION and is never called at module-evaluation time — the procedures build it inside their
 * bodies. If that ever changes (a resolver constructed at module scope), break the cycle rather
 * than debugging a `TDZ`/`undefined` at import.
 */
export {
  NAZIR_AUTHORITY_SETTING_KEYS,
  NAZIR_FEE_SETTING_PREFIX,
  SETTING_CHANGE_APPROVAL_TYPE,
  SETTING_CHANGE_ARTIFACT_KIND,
  assertNazirAuthoritySettingKey,
  settingChangeArtifact,
  settingChangeSubjectId,
  settingsRouter,
} from './routers/settings.js';

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 1 · Scope
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Which endowment (if any) the figure is being resolved for.
 *
 * `waqfId` absent or `null` ⇒ resolve the GLOBAL row only. `waqfId` present ⇒ endowment override
 * first, global second.
 *
 * ⚠ `clientId` is declared and **REFUSED at runtime** — see the file header. It exists so the gap
 * is visible in the type rather than discovered later, and so a caller who passes it gets a named
 * error instead of a silently-global answer.
 */
export interface SettingScope {
  readonly waqfId?: string | null;
  /** ⚠ NOT SUPPORTED. `model Setting` has no `clientId` column; passing this THROWS. */
  readonly clientId?: string | null;
}

/** The answer plus WHERE it came from — for a report footnote, and for unambiguous assertions. */
export interface ResolvedSetting<K extends SettingKey = SettingKey> {
  readonly key: K;
  readonly envelope: SettingValue<K>;
  /** `'endowment'` when an override won, `'global'` otherwise. Never guessed. */
  readonly tier: SettingScopeTier;
  /** The endowment the override was found on, or `null` for a global answer. */
  readonly waqfId: string | null;
  /**
   * The resolver's single clock read. A configured figure is time-varying, so a printed statement
   * quoting a fee rate should be able to say WHEN the rate was resolved.
   */
  readonly resolvedAt: Date;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 2 · The interface
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export interface SettingResolver {
  /**
   * THE DEFAULT READ. Returns the whole envelope, so `unverified` and the ⚠ note travel with the
   * figure into whatever renders it.
   *
   * Throws `SETTING_MISSING` when the key is unregistered or no row exists at any tier;
   * `SETTING_INVALID` when a row exists but its stored value does not satisfy the key's schema (a
   * malformed envelope, the wrong unit, an unknown enum member, or a ⚠ marker mismatch).
   */
  get<K extends SettingKey>(key: K, scope?: SettingScope): Promise<SettingValue<K>>;

  /**
   * THE EXPLICITLY-NAMED ESCAPE HATCH: the bare `v`, with the caveat DROPPED.
   *
   * Use it only where the value feeds arithmetic that never reaches a human — a business-day count
   * into `addBusinessDays`, a percent into `percentOf`. The moment the figure is going to be
   * *shown*, *printed* or *exported*, use {@link get} and render the note with it: a "10%" on a
   * statement with no caveat is a claim about Saudi law this repository is not entitled to make.
   */
  getValue<K extends SettingKey>(key: K, scope?: SettingScope): Promise<SettingValue<K>['v']>;

  /**
   * Several keys in ONE query, each independently resolved endowment → global.
   *
   * Fails on the FIRST missing or invalid key rather than returning a partial map: an engine handed
   * "three of the four windows you asked for" would compute something, and that something would be
   * wrong in a way nobody notices.
   */
  getMany<K extends SettingKey>(
    keys: readonly K[],
    scope?: SettingScope,
  ): Promise<{ readonly [P in K]: SettingValue<P> }>;

  /** {@link get}, plus which tier answered. Additive — the envelope is still the payload. */
  resolve<K extends SettingKey>(key: K, scope?: SettingScope): Promise<ResolvedSetting<K>>;

  /**
   * Writes a figure at one tier. **A PRIMITIVE, NOT THE WORKFLOW** — it performs no authorization.
   *
   * The envelope is validated against the key's schema BEFORE anything is written, so an invalid
   * figure (or an unverified one missing its ⚠ marker) cannot be stored at all. The write goes
   * through `withAudit`, so the change lands in the append-only trail with a before/after image;
   * `withAudit` JOINS an enclosing transaction, so a router that moves an `ApprovalRequest` and
   * writes the setting in one block commits them together or not at all.
   *
   * ⚠ WHO MAY CALL THIS. In a request path: `settings.set` in `src/routers/settings.ts` and nothing
   * else — it is on `checkerProcedure('fee:nazir_fee:approve')`, because §10 §4.1 makes a
   * fee-basis change a `nazir` `A*` action. Outside a request path (a migration, an ops script, a
   * job) the caller must hold a DECLARED `SYSTEM`/`SERVICE` context, which is what makes the audit
   * event attributable.
   */
  set<K extends SettingKey>(
    key: K,
    envelope: SettingValue<K>,
    scope?: SettingScope,
  ): Promise<SettingValue<K>>;
}

export interface SettingResolverOptions {
  /**
   * The request's single clock read (`ctx.now`). Passed in rather than read, so two figures
   * resolved in one request carry the same `resolvedAt` and nothing here calls `new Date()`.
   */
  readonly now: Date;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 3 · The delegate this resolver needs
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The narrow shape of the `setting` delegate.
 *
 * Declared structurally so the resolver is unit-testable and so it is obvious that NOTHING else on
 * the Prisma client is reachable from here. In production this is always the request's own
 * `ExtendedPrismaClient` — never `getBasePrismaClient()` — so the force-filter still decides which
 * per-endowment rows exist for this caller.
 */
export interface SettingQueryClient {
  readonly setting: {
    findMany(args: {
      where: Record<string, unknown>;
      select: { key: true; waqfId: true; value: true };
    }): Promise<readonly { key: string; waqfId: string | null; value: unknown }[]>;
    findFirst(args: {
      where: Record<string, unknown>;
      select: { id: true };
    }): Promise<{ id: string } | null>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 4 · Guards
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/** The memo key. `${waqfId | 'global'}::${key}` — one namespace, no collision with a real id. */
function memoKey(key: string, waqfId: string | null): string {
  return `${waqfId ?? ' global'}::${key}`;
}

/**
 * Narrows a {@link SettingScope} to the ONE tier discriminator the schema can express.
 *
 * Three refusals, all fail-closed:
 *  · `clientId` set ⇒ `SETTING_INVALID`. The column does not exist; see the file header.
 *  · a non-string, blank, or whitespace `waqfId` ⇒ `SETTING_INVALID`. `waqfId: ''` would match no
 *    row and then fall back to the GLOBAL value — a silent widening from "this endowment's
 *    override" to "the platform default", which is the shape of bug that produces a plausible
 *    wrong number rather than an error.
 *  · anything else on the object is ignored (it cannot reach the query).
 */
export function normaliseSettingScope(scope: SettingScope | undefined, key: string): string | null {
  if (scope === undefined || scope === null) return null;

  const clientId = (scope as { clientId?: unknown }).clientId;
  if (clientId !== undefined && clientId !== null) {
    throw new DomainError(
      'SETTING_INVALID',
      `Setting "${key}": a CLIENT-tier scope was requested (clientId ${JSON.stringify(String(clientId))}) ` +
        `but \`model Setting\` has no clientId column — it carries \`waqfId String?\` only, and the ` +
        `resolution order is ${SETTING_SCOPE_ORDER.join(' → ')}. §17 names three tiers; TWO ship. ` +
        `Refused rather than silently answered from the global row, because a caller who believes ` +
        `they read a family-level override and actually read the platform default has a wrong ` +
        `figure and no error. A third tier needs a migration and a decision about what "the ` +
        `family's fee basis" means when §10 principle 2 says scope is the endowment, never the client.`,
      { details: { key, requestedTier: 'client', supportedTiers: [...SETTING_SCOPE_ORDER] } },
    );
  }

  const waqfId = (scope as { waqfId?: unknown }).waqfId;
  if (waqfId === undefined || waqfId === null) return null;

  if (typeof waqfId !== 'string' || waqfId.trim() === '') {
    throw new DomainError(
      'SETTING_INVALID',
      `Setting "${key}": waqfId ${JSON.stringify(waqfId)} is not an endowment id. A blank or ` +
        `non-string waqfId would match no override row and then fall back to the GLOBAL value — a ` +
        `silent widening from "this endowment's figure" to "the platform default". Pass a real id, ` +
        `or omit the scope entirely to read the global tier deliberately.`,
      { details: { key, waqfId: typeof waqfId === 'string' ? waqfId : typeof waqfId } },
    );
  }

  return waqfId;
}

/** Refuses an unregistered key BEFORE any query. Same code and wording as `parseSetting`'s. */
function assertRegisteredKey<K extends SettingKey>(key: K): K {
  if (!isSettingKey(key)) {
    throw new DomainError(
      'SETTING_MISSING',
      `"${String(key)}" is not a registered Setting key. The vocabulary is CLOSED ` +
        `(@qmulate/domain's SETTING_SCHEMAS, ${String(SETTING_KEYS.length)} keys): regulatory ` +
        `figures are configuration, never hardcoded defaults — and never an unknown vocabulary ` +
        `either, because a typo'd key that resolved to "absent" would be indistinguishable from a ` +
        `figure nobody has configured yet.`,
      { details: { key: typeof key === 'string' ? key : typeof key } },
    );
  }
  return key;
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * 5 · The factory
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Builds THE resolver for one request.
 *
 * ⚠ CALL IT ONCE PER REQUEST, AND NEVER HOLD THE RESULT. The memo inside is per instance, which is
 * what makes "a fee-basis change flows through with no redeploy" true: the next request builds a
 * new resolver and re-reads the row. Holding one in a module-level variable reintroduces exactly
 * the process-lifetime cache EXIT-3 forbids — so `apps/web` builds it from `ctx` (which is itself
 * per-request) and hands it down.
 *
 * `db` is the request's own scoped client. `Setting` is classified `allow-global` in the
 * force-filter, so a global row is readable by any authenticated caller and a per-endowment row
 * only by a caller holding a grant on that endowment — which is exactly the visibility a figure
 * resolver should have, and one more reason not to reach for the base client here.
 */
export function createSettingResolver(
  db: ExtendedPrismaClient | SettingQueryClient,
  options: SettingResolverOptions,
): SettingResolver {
  const client = db as SettingQueryClient;
  const now = options.now;

  /**
   * PER-REQUEST MEMO. `memoKey -> raw stored value | null` (null = "checked, absent").
   *
   * ⚠ Declared HERE, inside the factory, on purpose. Hoisting it to module scope is EXIT-3's
   * mutation and the integration suite fails on it: a second resolver in the same process would
   * return the pre-change figure, i.e. the change would need a redeploy.
   */
  const memo = new Map<string, unknown>();

  /** Reads one tier, memoised. `null` means "no row", which is never "use a default". */
  async function readTier(key: string, waqfId: string | null): Promise<unknown> {
    const cacheKey = memoKey(key, waqfId);
    if (memo.has(cacheKey)) return memo.get(cacheKey) ?? null;

    const rows = await client.setting.findMany({
      where: { key, waqfId, deletedAt: null },
      select: { key: true, waqfId: true, value: true },
    });
    // `@@unique([waqfId, key])` plus the partial unique index `setting_global_key_unique` make both
    // tiers deterministic, so "more than one row" is a schema violation rather than a choice to
    // make. `findMany` is used (not `findFirst`) so `getMany` and `get` share one code path.
    const value = rows.length === 0 ? null : (rows[0]?.value ?? null);
    memo.set(cacheKey, value);
    return value;
  }

  /** Collects the candidates, most specific first, skipping tiers with no row. */
  async function candidatesFor(
    key: SettingKey,
    waqfId: string | null,
  ): Promise<ScopedSettingCandidate<{ tier: SettingScopeTier; raw: unknown }>[]> {
    const found: ScopedSettingCandidate<{ tier: SettingScopeTier; raw: unknown }>[] = [];

    // ORDER FROM `@qmulate/domain`, not restated: `SETTING_SCOPE_ORDER` is the single declaration
    // of "endowment beats global", and `pickMostSpecific` below re-validates the tier names.
    for (const tier of settingScopeOrder()) {
      if (tier === 'endowment') {
        if (waqfId === null) continue;
        const raw = await readTier(key, waqfId);
        if (raw !== null) found.push({ tier, value: { tier, raw } });
        continue;
      }
      if (tier === 'global') {
        const raw = await readTier(key, null);
        if (raw !== null) found.push({ tier, value: { tier, raw } });
        continue;
      }
      // An unrecognised tier: fail closed rather than treat it as "probably global".
      throw new DomainError(
        'SETTING_INVALID',
        `Setting "${key}": scope tier ${JSON.stringify(String(tier))} is not one this resolver ` +
          `implements (${SETTING_SCOPE_ORDER.join(' → ')}). A new tier is a migration plus a ` +
          `decision, not a fall-through.`,
        { details: { key, tier: String(tier) } },
      );
    }

    return found;
  }

  async function resolveOne<K extends SettingKey>(
    key: K,
    scope?: SettingScope,
  ): Promise<ResolvedSetting<K>> {
    assertRegisteredKey(key);
    const waqfId = normaliseSettingScope(scope, key);

    const candidates = await candidatesFor(key, waqfId);
    // `pickMostSpecific` is `@qmulate/domain`'s — it is what throws `SETTING_MISSING` when nothing
    // was found, so the "never substitute a default" rule has ONE implementation shared with the
    // pure engines rather than a second one here that could drift into a lenient fallback.
    const winner = pickMostSpecific(key, candidates);

    return {
      key,
      // Validated on READ, not merely on write: a row can have been written raw, migrated in, or
      // seeded by an older fixture, so the schema check has to happen where the value is consumed.
      envelope: parseSetting(key, winner.raw),
      tier: winner.tier,
      waqfId: winner.tier === 'endowment' ? waqfId : null,
      resolvedAt: now,
    };
  }

  return {
    async get<K extends SettingKey>(key: K, scope?: SettingScope): Promise<SettingValue<K>> {
      return (await resolveOne(key, scope)).envelope;
    },

    async getValue<K extends SettingKey>(
      key: K,
      scope?: SettingScope,
    ): Promise<SettingValue<K>['v']> {
      // ⚠ THE CAVEAT IS DROPPED HERE, DELIBERATELY AND VISIBLY. See the interface doc: this is for
      // a figure feeding arithmetic, never one about to be shown to a human.
      const envelope = (await resolveOne(key, scope)).envelope;
      return envelope.v;
    },

    async resolve<K extends SettingKey>(key: K, scope?: SettingScope): Promise<ResolvedSetting<K>> {
      return resolveOne(key, scope);
    },

    async getMany<K extends SettingKey>(
      keys: readonly K[],
      scope?: SettingScope,
    ): Promise<{ readonly [P in K]: SettingValue<P> }> {
      const requested = [...new Set(keys)];
      for (const key of requested) assertRegisteredKey(key);
      const waqfId = normaliseSettingScope(scope, requested.join(','));

      // ONE query for every key at both tiers, then per-key resolution through the same
      // `pickMostSpecific`. The memo is populated so a later `get()` in the same request is free
      // and — more importantly — CONSISTENT with what `getMany` returned.
      const uncached = requested.filter(
        (key) =>
          !memo.has(memoKey(key, null)) || (waqfId !== null && !memo.has(memoKey(key, waqfId))),
      );
      if (uncached.length > 0) {
        const rows = await client.setting.findMany({
          where: {
            key: { in: uncached },
            deletedAt: null,
            ...(waqfId === null ? { waqfId: null } : { OR: [{ waqfId }, { waqfId: null }] }),
          },
          select: { key: true, waqfId: true, value: true },
        });
        // Seed the memo with EVERY tier we asked about, including the misses, so a subsequent read
        // does not re-query and cannot get a different answer within one request.
        for (const key of uncached) {
          for (const tier of waqfId === null ? [null] : [waqfId, null]) {
            const match = rows.find((row) => row.key === key && row.waqfId === tier);
            memo.set(memoKey(key, tier), match === undefined ? null : match.value);
          }
        }
      }

      const out: Record<string, unknown> = {};
      for (const key of requested) {
        // Throws on the first miss / invalid value. A partial map would let an engine compute.
        out[key] = (await resolveOne(key, scope)).envelope;
      }
      return out as { readonly [P in K]: SettingValue<P> };
    },

    async set<K extends SettingKey>(
      key: K,
      envelope: SettingValue<K>,
      scope?: SettingScope,
    ): Promise<SettingValue<K>> {
      assertRegisteredKey(key);
      const waqfId = normaliseSettingScope(scope, key);

      // ⚠ VALIDATED BEFORE ANYTHING IS WRITTEN. `parseSetting` enforces the key's value schema, its
      // pinned unit, AND the `unverified ⇔ note === UNVERIFIED_NOTE` refinement — so an unverified
      // regulatory figure physically cannot be stored without its ⚠ marker, and a verified one
      // cannot carry it. An author cannot ship the figure without the caveat.
      const validated = parseSetting(key, envelope);

      // The write door is imported LAZILY, and that is load-bearing rather than stylistic: this
      // module is on the import path of the pure unit suite, and `audit-projection.js` statically
      // imports `@qmulate/database`, which would pull the generated Prisma client into a run that
      // must work with no database at all.
      //
      // ⚠ `auditedWrite`, NOT `withAudit`. A projected audited `update`/`upsert` is refused: the
      // audit extension diffs a narrow post-image against a full-row pre-image and reads every
      // dropped column as "set to null" (C-08). The `setting.update` below therefore takes no
      // `select` — and now cannot acquire one by accident.
      const { auditedWrite } = await import('./middleware/audit-projection.js');

      await auditedWrite(db as ExtendedPrismaClient, async (tx) => {
        const existing = await (tx as unknown as SettingQueryClient).setting.findFirst({
          where: { key, waqfId, deletedAt: null },
          select: { id: true },
        });

        if (existing === null) {
          await (tx as unknown as SettingQueryClient).setting.create({
            data: {
              // The seed's deterministic id grammar, kept so a fixture row and a runtime row are
              // indistinguishable in shape: `setting-<key>` global, `setting-<waqfId>-<key>` scoped.
              id: waqfId === null ? `setting-${key}` : `setting-${waqfId}-${key}`,
              key,
              waqfId,
              value: validated,
            },
          });
        } else {
          await (tx as unknown as SettingQueryClient).setting.update({
            where: { id: existing.id },
            data: { value: validated },
          });
        }
      });

      // The memo must not serve the value this request just replaced. Invalidating BOTH tiers is
      // deliberate: writing an endowment override changes what `get(key, {waqfId})` resolves to
      // even though the global row is untouched.
      memo.delete(memoKey(key, waqfId));
      if (waqfId !== null) memo.delete(memoKey(key, null));

      return validated;
    },
  };
}
