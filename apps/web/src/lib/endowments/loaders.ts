import { ACCESS_KEY_PREFIX, kernelMessageKey } from '@/lib/trpc/client';
import { getServerCaller } from '@/lib/trpc/server';

import type {
  IntakeAuthorityView,
  BeneficiaryLineage,
  BeneficiaryRow,
  ClassificationRecord,
  DeedRecord,
  DualDate,
  EligibilityVerdict,
  EndowmentDetail,
  ExpropriationView,
  RegistrationDeadlineView,
  Loaded,
  NavigationTree,
  ObligationSet,
  PartyName,
  ReservedMatter,
  ShartCompleteness,
  ShartRecord,
  ReservedMatterRecordedStep,
  OnboardingView,
} from './types';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ONE PLACE THE ENDOWMENT SCREENS TOUCH THE KERNEL
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Every function here calls a tRPC procedure through the IN-PROCESS server caller — the same
 * router, the same composed middleware chain, the same per-request scoped Prisma client that the
 * HTTP boundary uses — and maps the result into the view models in `./types`. Nothing else under
 * `src/app/[locale]/(app)/endowments/**` or `src/components/endowments/**` imports the API at
 * all, so:
 *
 *   · a projection change, a renamed field or a widened enum reddens THIS FILE, at the exact
 *     line that knows about both sides, instead of scattering across the screens;
 *   · there is NO CAST anywhere on the path. The mapping is an assignment into a narrower type,
 *     which is the whole drift detector. `as unknown as` here would trade a compile error today
 *     for a wrong screen in production.
 *
 * ⚠ SERVER-ONLY. `getServerCaller` reaches for `next/headers`, which throws if this module is
 * ever pulled into a client component — that is the structural guard, not a convention.
 *
 * ⚠ ONE CALLER PER CALL, NEVER MEMOISED. The context bakes the caller's ACTIVE grants into the
 * Prisma client, so a module-scope caller would hand one user another user's visibility. Each
 * function below builds its own.
 *
 * ── HOW A REFUSAL IS HANDLED, AND WHY IT IS CAUGHT RATHER THAN THROWN ─────────────────────
 * A caller with no grant on this endowment is an EXPECTED state, not a fault: the kernel answers
 * `NOT_FOUND` (never `FORBIDDEN` — §10 §7.2 does not disclose that the endowment exists). Letting
 * that become an unhandled error would render "something went wrong" where the correct answer is
 * the non-disclosure sentence, and would put a 500 in the operator log for a working control.
 *
 * So each loader returns a `Loaded<T>` and the WORDING always comes from the catalogue through
 * `kernelMessageKey`, which validates the key against both error namespaces and degrades to
 * `errors.generic` for anything it does not recognise. The raw `message` is never shown: it is
 * developer English that quotes the requested `waqfId` and the refused permission, and rendering
 * it would undo `NO_GRANT → NOT_FOUND` one helpful line at a time.
 */

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * Normalisation helpers
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * A legally significant date is a PAIR: the canonical UTC value plus the Umm al-Qura snapshot
 * frozen at insert time (NFR-02).
 *
 * The canonical side is normalised to an ISO string because the two transports disagree — the
 * in-process caller hands back a `Date`, the HTTP boundary a string (there is no transformer, by
 * design: money crosses that wire as a decimal string and a reviver would put a float in the
 * ledger path). Accepting both here is what keeps the screens indifferent to which one served
 * them.
 *
 * THE SNAPSHOT IS PASSED THROUGH UNTOUCHED AND IS NEVER RECOMPUTED. A statement issued last year
 * must still show the Hijri date it was issued under, whatever the calendar library does later.
 */
function toDual(value: Date | string | null | undefined, hijri: string | null): DualDate | null {
  if (value === null || value === undefined) return null;
  const iso = value instanceof Date ? value.toISOString() : value;
  if (iso === '') return null;
  return { iso, hijri };
}

/**
 * Wraps a loader body so a kernel refusal becomes a rendered sentence rather than an error page.
 *
 * ⚠ IT CATCHES EVERYTHING, DELIBERATELY, AND SAYS SO. An unexpected fault — a procedure that is
 * not mounted, a Prisma error — lands on `errors.generic`, which is the fail-closed direction: the
 * screen shows nothing about the endowment. It does mean a build gap and an access refusal read
 * the same to the user; the machine code and the stack belong in the operator log and the audit
 * trail (`@qmulate/api` writes both server-side), never on a Family Board member's screen.
 */
async function attempt<T>(read: () => Promise<T>, locale: string): Promise<Loaded<T>> {
  try {
    return { status: 'ok', value: await read() };
  } catch (error) {
    return { status: 'refused', messageKey: kernelMessageKey(error, locale) };
  }
}

/** The non-disclosure key, assembled from the exported prefix so a rename is a compile error. */
export const NO_GRANT_KEY = `${ACCESS_KEY_PREFIX}NO_GRANT`;

/**
 * "The record is not visible through this caller's own client."
 *
 * ⚠ IT IS A LOCAL ERROR, NOT AN IMPORTED `ApiError`, and it carries `messageKey` and nothing else.
 * `kernelMessageKey` reads `messageKey` off a thrown object directly, validates it against the two
 * error namespaces, and degrades to `errors.generic` if it does not resolve — so this routes through
 * exactly the same choke point every kernel refusal does, without importing a value from
 * `@qmulate/api` (which would put the server kernel one refactor away from a client component).
 *
 * The `message` is developer-facing and never rendered. It deliberately does not quote the endowment
 * id in anything a page could embed.
 */
class NotVisibleError extends Error {
  readonly messageKey = NO_GRANT_KEY;

  constructor(waqfId: string) {
    super(`endowment ${waqfId} is not visible through this caller's own scoped client`);
    this.name = 'NotVisibleError';
  }
}

/**
 * `deed.get`'s wire verdict → the view model.
 *
 * ⚠ `satisfied: null` AND `applicability: 'UNDECIDED_SURFACED'` ARE PRESERVED, NEVER COERCED. Both
 * are the honest third value of a three-state answer: "nobody assessed this" and "whether this binds
 * a representative is a question for counsel". Folding either into `false` would make the screen
 * state a fact the resolver refused to state; folding either into `true` would let an unevaluated
 * regulatory condition pass as satisfied.
 *
 * ⚠ `wire.surfacedQuestions` IS READ AND DROPPED HERE, ON PURPOSE (V-E3-M4). It is free-form
 * DEVELOPER PROSE — `SURFACED_REPRESENTATIVE_SCOPE`, 464 English characters — and it was reaching
 * the deed screen's DOM in both locales, rendered as a "diagnostic code". This function is the
 * boundary where the wire becomes something a screen may render, so this is where it stops. The
 * fact it carries survives as the criterion-level `UNDECIDED_SURFACED` applicability, which has
 * catalogued ar/en copy; see `types.ts`'s `EligibilityVerdict` for the TODO(surface) that a
 * product-approved statement of the question — and a stable code for it — is still owed.
 */
function toVerdict(wire: {
  readonly eligible: boolean;
  readonly reasons: readonly string[];
  readonly notAssessed: readonly string[];
  readonly criteria: readonly {
    readonly key: string;
    readonly required: boolean;
    readonly applicability: string;
    readonly satisfied: boolean | null;
    readonly reasonCode: string | null;
    readonly unverified: boolean;
  }[];
  /** Present on the wire, never mapped into the view model. See the note above. */
  readonly surfacedQuestions: readonly string[];
}): EligibilityVerdict {
  return {
    eligible: wire.eligible,
    reasons: wire.reasons,
    notAssessed: wire.notAssessed,
    criteria: wire.criteria.map((criterion) => ({
      key: criterion.key,
      applicability: criterion.applicability,
      required: criterion.required,
      satisfied: criterion.satisfied,
      reasonCode: criterion.reasonCode,
      unverified: criterion.unverified,
    })),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * navigation — Client → Waqif → Endowment
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The whole hierarchy the caller may see (BR-102).
 *
 * ⚠ `navigation.tree` is authed but NOT endowment-scoped, and that is not a hole: rung 2 needs a
 * `waqfId` in the input and there is no single endowment here. Deny-by-default still holds
 * because the Prisma force filter narrows Client and Waqif to the families and founders owning at
 * least one endowment in the caller's ACTIVE grants — a caller with no grant gets an empty tree,
 * and a client-level `Membership` contributes nothing to it (MP-13).
 */
export async function loadNavigationTree(locale: string): Promise<Loaded<NavigationTree>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const tree = await caller.navigation.tree();

    const value: NavigationTree = {
      clients: tree.clients.map((client) => ({
        id: client.id,
        nameAr: client.nameAr,
        nameEn: client.nameEn,
        waqifs: client.waqifs.map((waqif) => ({
          id: waqif.id,
          nameAr: waqif.nameAr,
          nameEn: waqif.nameEn,
          waqfs: waqif.waqfs.map((waqf) => ({
            id: waqf.id,
            certificateNumber: waqf.certificateNumber,
            deedNumber: waqf.deedNumber,
            classification: waqf.classification,
            type: waqf.type,
            nature: waqf.nature,
            entitlementOrder: waqf.entitlementOrder,
          })),
        })),
      })),
    };
    return value;
  }, locale);
}

/**
 * A single family, and a single founder, for the record's own header.
 *
 * ⚠ BOTH RETURN `null` — NOT A REFUSAL — WHEN THE SUBJECT IS OUT OF SCOPE. That is the same
 * non-disclosure rule the endowment-scoped rung follows: absence of a grant reads as NOT FOUND, so
 * a caller cannot learn that a family or a founder exists by probing ids. The screens render the
 * record without the name rather than announcing that something was withheld.
 */
export async function loadClientName(
  locale: string,
  clientId: string,
): Promise<Loaded<PartyName | null>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const client = await caller.navigation.client.get({ clientId });
    return client === null ? null : { nameAr: client.nameAr, nameEn: client.nameEn };
  }, locale);
}

export async function loadWaqifName(
  locale: string,
  waqifId: string,
): Promise<Loaded<PartyName | null>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const waqif = await caller.navigation.waqif.get({ waqifId });
    return waqif === null ? null : { nameAr: waqif.nameAr, nameEn: waqif.nameEn };
  }, locale);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * endowment — the BR-101 record
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export async function loadEndowment(
  locale: string,
  waqfId: string,
): Promise<Loaded<EndowmentDetail>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const waqf = await caller.endowment.get({ waqfId });

    /**
     * ⚠ `found: false` IS A REFUSAL, NOT AN EMPTY RECORD, and the mapping has to say so.
     *
     * `endowment.get` answers `{ found: false, …all nulls }` rather than throwing, because the row
     * simply is not visible through the caller's own scoped client. Rendering those nulls would put a
     * record on screen whose every field reads "not recorded" — a statement about the ENDOWMENT when
     * the true fact is about the READER. So it becomes the same NOT_FOUND sentence as a missing
     * grant, which is also what keeps `NO_GRANT` indistinguishable from non-existence (§10 §7.2).
     */
    if (!waqf.found) throw new NotVisibleError(waqfId);

    const value: EndowmentDetail = {
      id: waqf.id,
      waqifId: waqf.waqifId,
      clientId: waqf.clientId,
      certificateNumber: waqf.certificateNumber,
      deedNumber: waqf.deedNumber,
      classification: waqf.classification,
      type: waqf.type,
      nature: waqf.nature,
      entitlementOrder: waqf.entitlementOrder,
      // No fallback, no default. `null` means the founder's term is not on record, which the
      // engine must keep halting on (`CONTINUATION_STIPULATION_UNRECOGNISED`).
      continuationStipulation: waqf.continuationStipulation,
      reversion: {
        captured: waqf.reversion.captured,
        kind: waqf.reversion.kind,
        ultimateTakerIds: waqf.reversion.ultimateTakerIds,
        recordedAt: toDual(waqf.reversion.recordedAt, waqf.reversion.recordedAtHijri),
      },
      fiscalYearEnd: waqf.fiscalYearEnd,
      registrationDate: toDual(waqf.registrationDate, waqf.registrationDateHijri),
      certificateExpiry: toDual(waqf.certificateExpiry, waqf.certificateExpiryHijri),
      // ⊕ S11-1 — ONE object or null, as the kernel sends it: "not recorded" is a state the screen must
      // render as such, never as an empty date. The dual pair is frozen at write; the kind rides along.
      registrationAnchor:
        waqf.registrationAnchor === null
          ? null
          : (() => {
              const date = toDual(waqf.registrationAnchor.date, waqf.registrationAnchor.dateHijri);
              return date === null ? null : { date, kind: waqf.registrationAnchor.kind };
            })(),
      writable: {
        registrationAnchor: waqf.writable.registrationAnchor,
        istibdalCompletion: waqf.writable.istibdalCompletion,
        registrationDischarge: waqf.writable.registrationDischarge,
      },
      shartAlWaqifVersion: waqf.shartAlWaqifVersion,
      // ⚠ `disclosed` IS CARRIED THROUGH, NOT COLLAPSED (G7-V2). A caller without
      // `endowment:deed:read` is told nothing about the deed — and "told nothing" must not render
      // as "no deed is recorded", which would state something false about a governance record.
      trusteeship:
        waqf.trusteeship === null
          ? null
          : {
              disclosed: waqf.trusteeship.disclosed,
              recorded: waqf.trusteeship.recorded,
              primaryNazir: waqf.trusteeship.primaryNazir,
              jointlyLiable: waqf.trusteeship.jointlyLiable,
              hasAuthorizedRep: waqf.trusteeship.hasAuthorizedRep,
            },
    };
    return value;
  }, locale);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * ⊕ S11-1 · expropriations — the takings, for the istibdal-completion input
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export async function loadExpropriations(
  locale: string,
  waqfId: string,
): Promise<Loaded<readonly ExpropriationView[]>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const { expropriations } = await caller.endowment.expropriations({ waqfId });
    const value: ExpropriationView[] = [];
    for (const row of expropriations) {
      const announcedDate = toDual(row.announcedDate, row.announcedDateHijri);
      // A taking with no announcement date cannot be projected honestly; the column is NOT NULL, so
      // this branch is unreachable — kept so the type narrows without a cast.
      if (announcedDate === null) continue;
      value.push({
        id: row.id,
        assetId: row.assetId,
        scope: row.scope,
        announcedDate,
        istibdalStatus: row.istibdalStatus,
        istibdalCompleted:
          row.istibdalCompleted === null
            ? null
            : toDual(row.istibdalCompleted.date, row.istibdalCompleted.dateHijri),
        authorityNotified:
          row.authorityNotified === null
            ? null
            : toDual(row.authorityNotified.date, row.authorityNotified.dateHijri),
      });
    }
    return value;
  }, locale);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * deed — the appointment and its eligibility verdict
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The trusteeship deed plus the eligibility verdict, read from the SAME pure resolver the
 * `deed.upsert` mutation refuses on (`deed.verifyEligibility` is a dry run that writes nothing).
 * One implementation, so the screen cannot show a verdict the write path would disagree with.
 *
 * `deed.get` is read first because it is the record; a missing deed is a real state — the
 * appointment is what authorises every act of the trusteeship, and nothing is inferred from its
 * absence.
 */
export async function loadDeed(locale: string, waqfId: string): Promise<Loaded<DeedRecord | null>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const deed = await caller.deed.get({ waqfId });
    if (deed === null) return null;

    const value: DeedRecord = {
      id: deed.id,
      primaryNazir: deed.primaryNazir,
      primaryAppointed: toDual(deed.primaryAppointedDate, deed.primaryAppointedDateHijri),
      successorNazir: deed.successorNazir,
      authorizedRep:
        deed.authorizedRep === null
          ? null
          : {
              name: deed.authorizedRep.name,
              scope: deed.authorizedRep.scope,
              appointedDate: toDual(
                deed.authorizedRep.appointedDate,
                deed.authorizedRep.appointedDateHijri,
              ),
            },
      jointlyLiable: deed.jointlyLiable,
      verifiedAt: toDual(deed.eligibility.verifiedAt, deed.eligibility.verifiedAtHijri),
      verifiedBy: deed.eligibility.verifiedBy,
      primary: toVerdict(deed.eligibility.primary),
      representative:
        deed.eligibility.representative === null
          ? null
          : toVerdict(deed.eligibility.representative),
    };
    return value;
  }, locale);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * classification — the recorded band, its history, and what it gates
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export async function loadClassification(
  locale: string,
  waqfId: string,
): Promise<Loaded<ClassificationRecord>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const record = await caller.classification.get({ waqfId });

    const value: ClassificationRecord = {
      current: record.current,
      // ⚠ SETTING KEYS, NOT FIGURES. The SAR 200M / 50M bands live in `Setting` rows precisely so
      // a correction against primary law is a configuration change, not a code change — and they
      // are UNVERIFIED until confirmed against the Arabic originals.
      bandSettingKeys: record.bands.settingKeys,
      history: record.history.map((entry) => ({
        from: entry.from,
        to: entry.to,
        at: { iso: entry.at, hijri: entry.atHijri },
        reason: entry.reason,
        createdBy: entry.createdBy,
      })),
    };
    return value;
  }, locale);
}

export async function loadApplicableObligations(
  locale: string,
  waqfId: string,
): Promise<Loaded<ObligationSet>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const set = await caller.classification.applicableObligations({ waqfId });

    const value: ObligationSet = {
      classification: set.classification,
      obligations: set.obligations.map((obligation) => ({
        code: obligation.code,
        section: obligation.section,
        // The regulation's own text, recorded as DATA in the global catalogue. Not i18n copy:
        // `packages/i18n` carries product chrome, not the law's wording.
        titleAr: obligation.titleAr,
        titleEn: obligation.titleEn,
        workstreamAr: obligation.workstreamAr,
        workstreamEn: obligation.workstreamEn,
        gate: obligation.gate,
        deadlineRuleKey: obligation.deadlineRuleKey,
      })),
      excluded: set.excluded.map((entry) => ({
        code: entry.code,
        gate: entry.gate,
        reason: entry.reason,
      })),
      // ⚠ Non-empty whenever any figure in this set is unverified against primary law. The screen
      // renders the marker off this, not off a per-row flag the api does not send.
      unverifiedNotes: set.unverifiedNotes,
    };
    return value;
  }, locale);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * shart — the founder's conditions, read-only forever
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠ THERE IS NO `saveShart`, NO `updateShart`, AND THERE NEVER WILL BE.
 *
 * The Shart al-Waqif is written once. No approval opens it — there is no such approval — and a
 * lawful correction is a SUPERSEDING INSTRUMENT recorded as a new record, never an edit
 * (ADR-0006, binding rule 1). The absence of a writer in this module is part of that guarantee,
 * alongside the database trigger; the screen carries the same statement in words.
 */
export async function loadShart(locale: string, waqfId: string): Promise<Loaded<ShartRecord>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const shart = await caller.shart.get({ waqfId });

    const value: ShartRecord = {
      version: shart.version,
      setAt: toDual(shart.setAt, shart.setAtHijri),
      structured: {
        orderRule: shart.structured.orderRule,
        tiers: shart.structured.tiers.map((tier) => ({
          tabaqa: tier.tabaqa,
          labelAr: tier.labelAr,
          lines: tier.lines,
          // NULL means the deed stipulates no absolute weight — a FACT, not a default.
          stipulatedWeight: tier.stipulatedWeight,
        })),
        lines: shart.structured.lines,
        // `'unspecified'` (the deed is silent, or the term is illegible) and `'none'` (the deed
        // positively stipulates no reserve) are DIFFERENT FACTS. Carried through as the recorded
        // kind so the screen cannot collapse one into the other.
        maintenanceReserveKind: shart.structured.maintenanceReserve.kind,
        disbursementChannelKind: shart.structured.disbursementChannel.kind,
        nazirFee: {
          basis: shart.structured.nazirFee.basis,
          ratePercent: shart.structured.nazirFee.ratePercent,
          // A money figure crosses as a STRING. Never revived as a JS number.
          amountSar: shart.structured.nazirFee.amountSar,
        },
        continuationStipulation: shart.structured.continuationStipulation,
        // THREE STATES as a status string. `'unread'` is never rendered as `'none'`.
        reversion: {
          status: shart.structured.reversion.status,
          kind: shart.structured.reversion.kind,
          ultimateTakerIds: shart.structured.reversion.ultimateTakerIds,
          recordedAtHijri: shart.structured.reversion.recordedAtHijri,
        },
      },
    };
    return value;
  }, locale);
}

export async function loadShartCompleteness(
  locale: string,
  waqfId: string,
): Promise<Loaded<ShartCompleteness>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const completeness = await caller.shart.completeness({ waqfId });

    const value: ShartCompleteness = {
      missing: completeness.missing,
      advisory: completeness.advisory,
      wouldHaltWith: completeness.wouldHaltWith,
      // Named rather than dropped: a halting gap with no mapped discriminator would otherwise read
      // on screen as "nothing would go wrong".
      unmappedHaltingGaps: completeness.unmappedHaltingGaps,
    };
    return value;
  }, locale);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * beneficiaries — the registry and the lineage graph (E4: BR-201…BR-206)
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * The registry (BR-201). For a beneficiary-principal session the kernel's force filter has
 * already narrowed the row set to their own row, so this loader never sees — and never has to
 * reason about — anyone else's data.
 *
 * ⚠ The wire sends no `lineageLink` on this projection, and the view model has no field for
 * one; if the api ever grew it here, this assignment is where the compile should redden.
 * `kycFreshness` arrives COMPUTED (never stored) and is passed through untouched.
 */
export async function loadBeneficiaries(
  locale: string,
  waqfId: string,
): Promise<Loaded<readonly BeneficiaryRow[]>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const rows = await caller.beneficiary.list({ waqfId });

    const value: readonly BeneficiaryRow[] = rows.map((row) => ({
      id: row.id,
      branch: row.branch,
      relationshipAr: row.relationshipAr,
      relationshipEn: row.relationshipEn,
      kind: row.kind,
      verificationStatus: row.verificationStatus,
      active: row.active,
      // The death CERTIFICATION as a dual date. `null` with `active: false` stays a scope exit.
      deceased: toDual(row.deceasedAt, row.deceasedAtHijri),
      tabaqa: row.tabaqa,
      residency: row.residency,
      isUbo: row.isUbo,
      kycLastRefreshed: toDual(row.kycLastRefreshed, row.kycLastRefreshedHijri),
      kycFreshness: row.kycFreshness,
      categoryCaptured: row.categoryCaptured,
      // Decimal strings, passed through as strings. Never revived as JS numbers.
      sharePercent: row.sharePercent,
      stipulatedWeight: row.stipulatedWeight,
    }));
    return value;
  }, locale);
}

/**
 * The lineage graph (BR-204 / ADR-0009), as STRUCTURE the screen may draw.
 *
 * ⚠ TWO WIRE FIELDS ARE READ AND DROPPED HERE, ON PURPOSE — this is the boundary where the wire
 * becomes something a screen may render (same discipline as `surfacedQuestions`, V-E3-M4):
 *
 *   · `member.lineageLink` (and the whole `ancestry` array, which carries
 *     `ancestorLineageLink` per pair). The api returns them because its integrity cross-check
 *     and the ENGINE's frontier test need them; no screen may render a lineage link as though
 *     it were a person's gender — no label, no column, no tooltip (ADR-0009).
 *   · `ancestry` also because it is the entitlement computation's input, and the UI computes
 *     no entitlement, ever: an exclusion like ENTITLEMENT_HELD_BY_LIVING_ANCESTOR is TEMPORARY
 *     and belongs to the engine's per-run answer, never to a screen's own arithmetic.
 *
 * The integrity arrays carry beneficiary IDS only and are passed through verbatim.
 */
export async function loadBeneficiaryLineage(
  locale: string,
  waqfId: string,
): Promise<Loaded<BeneficiaryLineage>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const lineage = await caller.beneficiary.lineage({ waqfId });

    const value: BeneficiaryLineage = {
      members: lineage.members.map((member) => ({
        id: member.id,
        parentId: member.parentId,
        tabaqaRecorded: member.tabaqaRecorded,
        tabaqaDerived: member.tabaqaDerived,
        agrees: member.agrees,
        active: member.active,
        kind: member.kind,
        // ⚠ `member.lineageLink` is present on the wire and NOT mapped. See the note above.
      })),
      integrity: {
        missingLineageLink: lineage.integrity.missingLineageLink,
        tabaqaMismatch: lineage.integrity.tabaqaMismatch,
        rootedOutsideWaqif: lineage.integrity.rootedOutsideWaqif,
        cycles: lineage.integrity.cycles,
      },
      // ⚠ `lineage.ancestry` is present on the wire and NOT mapped. See the note above.
    };
    return value;
  }, locale);
}

/* ═══════════════════════════════════════════════════════════════════════════════════════════
 * reserved matters — recorded, then blocked until the Nazir approves
 * ═══════════════════════════════════════════════════════════════════════════════════════════ */

export async function loadReservedMatters(
  locale: string,
  waqfId: string,
): Promise<Loaded<readonly ReservedMatter[]>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const rows = await caller.reservedMatter.list({ waqfId });

    const value: readonly ReservedMatter[] = rows.map((row) => ({
      approvalRequestId: row.approvalRequestId,
      waqfId,
      kind: row.kind,
      subjectType: row.subjectType,
      subjectId: row.subjectId,
      status: row.status,
      makerId: row.makerId,
      checkerId: row.checkerId,
      decidedAt: toDual(row.decidedAt, row.decidedAtHijri),
      chain: {
        principalConsent: row.chain.principalConsent,
        counselReview: row.chain.counselReview,
        authorityNotice: row.chain.authorityNotice,
      },
      chainMissing: [...row.chainMissing],
      recorded: {
        principalConsent: recordedStep(row.recorded.principalConsent),
        counselReview: recordedStep(row.recorded.counselReview),
        authorityNotice: recordedStep(row.recorded.authorityNotice),
      },
      writable: { recordStep: row.writable.recordStep, sign: row.writable.sign },
    }));
    return value;
  }, locale);
}

/** ⊕ S12-2 · a recorded chain step off the wire, its dual date reconstructed the way every other date is. */
function recordedStep(
  step: {
    readonly at: string;
    readonly atHijri: string | null;
    readonly by: string | null;
    readonly reference: string | null;
  } | null,
): ReservedMatterRecordedStep | null {
  if (step === null) return null;
  const at = toDual(step.at, step.atHijri);
  if (at === null) return null;
  return { at, by: step.by, reference: step.reference };
}

/**
 * ⊕ S11-2 — the REGISTER_30BD chain head for the record page's discharge section.
 *
 * `deadline.list` returns every live row of the endowment; the HEAD is the row no other row supersedes
 * (`recomputedFromId` chains a correction to its predecessor). A refusal is returned AS a refusal, not
 * as `null`: `null` means "no deadline is on file" (a clock-start recorded but not computable, or none
 * recorded), and a seat that merely lacks `compliance:task:read` must not be told that.
 */
export async function loadRegistrationDeadline(
  locale: string,
  waqfId: string,
): Promise<Loaded<RegistrationDeadlineView | null>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const { deadlines } = await caller.deadline.list({ waqfId });
    const register = deadlines.filter((row) => row.ruleKey === 'REGISTER_30BD');
    const superseded = new Set(
      register.map((row) => row.recomputedFromId).filter((id): id is string => id !== null),
    );
    const heads = register.filter((row) => !superseded.has(row.id));
    const head = heads[0];
    if (head === undefined) return null;
    const due = toDual(head.dueDate, head.dueDateHijri);
    if (due === null) return null;
    const dischargedOn =
      head.satisfiedAt === null ? null : toDual(head.satisfiedAt, head.satisfiedAtHijri);
    return {
      id: head.id,
      due,
      discharged:
        dischargedOn === null || head.dischargeKind === null
          ? null
          : { on: dischargedOn, kind: String(head.dischargeKind) },
    };
  }, locale);
}

/**
 * ⊕ S12-3 · the endowment's three handover gates, with what each blocks and what THIS reader may do.
 */
export async function loadOnboarding(
  locale: string,
  waqfId: string,
): Promise<Loaded<OnboardingView>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const status = await caller.onboarding.status({ waqfId });
    const value: OnboardingView = {
      waqfId: status.waqfId,
      writable: { clear: status.writable.clear, reopen: status.writable.reopen },
      gates: status.gates.map((gate) => ({
        gate: gate.gate,
        recorded: gate.recorded,
        status: gate.status,
        clearedAt: toDual(gate.clearedAt, gate.clearedAtHijri),
        clearedBy: gate.clearedBy,
        evidence: gate.evidence,
        note: gate.note,
        reopenedAt: toDual(gate.reopenedAt, gate.reopenedAtHijri),
        reopenedBy: gate.reopenedBy,
        reopenReason: gate.reopenReason,
        checklist: [...gate.checklist],
        unmetPrerequisites: [...gate.unmetPrerequisites],
        orderRefusal: gate.orderRefusal,
        blocks: [...gate.blocks],
      })),
      blocked: status.blocked.map((entry) => ({ activity: entry.activity, by: entry.by })),
    };
    return value;
  }, locale);
}

/** ⊕ S12-3b · who this caller may register an endowment for — the intake form's choices. */
export async function loadIntakeAuthority(locale: string): Promise<Loaded<IntakeAuthorityView>> {
  return attempt(async () => {
    const caller = await getServerCaller(locale);
    const authority = await caller.onboarding.intakeAuthority();
    return {
      clients: authority.clients.map((client) => ({
        id: client.id,
        nameAr: client.nameAr,
        nameEn: client.nameEn,
        siblingWaqfIds: [...client.siblingWaqfIds],
        waqifs: client.waqifs.map((waqif) => ({
          id: waqif.id,
          nameAr: waqif.nameAr,
          nameEn: waqif.nameEn,
        })),
      })),
    };
  }, locale);
}
