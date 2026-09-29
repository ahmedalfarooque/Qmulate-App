import { getTranslations } from 'next-intl/server';

import { Button, Card, Eyebrow, Heading, Mono, Text, Well } from '@qmulate/ui';

import { Chip } from '@/components/endowments/Chip';
import { VocabLabel } from '@/components/endowments/VocabLabel';
import { RUN_STATUS_TONE } from '@/lib/distributions/labels';

import { approveRunAction, executeRunAction, submitStoredRunAction } from './actions';
import { distVocabText } from './DistVocabLabel';

import type { ApprovalView, CallerFacts, StoredRunView } from '@/lib/distributions/types';

/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * MAKER ≠ CHECKER — THE GOVERNANCE OF ONE RUN, AS A SCREEN
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * Whoever prepared a distribution run may not approve it. The Nazir is the CHECKER on money movement and
 * must never be its maker — `ROLE_PRESETS.nazir` deliberately holds neither `distribution:run:write` nor
 * `distribution:run:initiate`, and the database re-proves the same fact twice: a CHECK constraint
 * (`approval_request_checker_ne_maker`) and a trigger (`approval_request_authority`).
 *
 * The lifecycle this panel drives, and the FOUR different rungs it crosses:
 *
 *     COMPUTED ──submit──▶ PENDING_APPROVAL ──approve──▶ (approval APPROVED) ──execute──▶ EXECUTED
 *      maker:                maker:                        CHECKER:                       maker:
 *      run:write             run:initiate                  approval:request:approve        line_item:write
 *      (finance only)        (rep/case_mgr/finance)        (nazir only, + fresh TOTP)      (finance only)
 *
 * ── THE REFUSAL IS SHOWN, NOT THE BUTTON, WHEN THE CALLER IS THE MAKER ────────────────────
 * `resolveApprover` refuses maker = checker at step 3, BEFORE step 4 looks for a `NAZIR` grant. So the
 * refusal is BY IDENTITY, NOT BY ROLE: a caller holding both a `FINANCE` and a `NAZIR` grant on one
 * endowment is refused on their own run **even though they are also the Nazir**. This panel renders that
 * as `errors.access.SEGREGATION_OF_DUTIES` — approved copy that already exists — in place of the Approve
 * control, so the reason is on screen rather than only in a failed request.
 *
 * ⚠ THE UI CHECK IS A COURTESY AND IS NEVER THE BOUNDARY. Every control below is offered on a
 * `whoami`-derived permission and an identity comparison, and every one of them is re-decided by the
 * kernel — the ladder, the endowment scope, segregation of duties, the TOTP step-up, and the eight-step
 * artifact-verification ladder on `execute`. Hiding a button prevents a pointless refusal; it authorises
 * nothing.
 *
 * ⚠ THERE IS NO REJECT CONTROL, AND ITS ABSENCE IS A FACT ABOUT THE KERNEL, NOT AN OVERSIGHT. The API
 * exposes `approval.approve` and no rejecting verb at all; the status lattice has no `REJECTED` for a
 * distribution (a rejected run is `CANCELLED`) and no procedure performs that transition. A disabled
 * "Reject" would imply a verb exists. `distribution.approval.reject` therefore has catalogue copy that
 * nothing renders — reported rather than wired to a control that would fail.
 *
 * ⚠ `makerId` AND `checkerId` ARE USER IDS. No procedure resolves one to a person's name, and deriving a
 * display name from an email local part would put a real person's identity on screen from a string
 * nobody validated.
 */
export async function MakerCheckerPanel({
  locale,
  run,
  approval,
  caller,
}: {
  readonly locale: string;
  readonly run: StoredRunView;
  /** `null` when the run has raised no approval yet, or when the approval is not visible to this caller. */
  readonly approval: ApprovalView | null;
  /** `null` when `whoami` itself was refused — every control is then withheld and the kernel still governs. */
  readonly caller: CallerFacts | null;
}) {
  const t = await getTranslations({ locale, namespace: 'distribution' });
  const tCommon = await getTranslations({ locale, namespace: 'common' });
  const tErrors = await getTranslations({ locale, namespace: 'errors' });

  const permissions = caller?.permissionsByWaqf.get(run.waqfId) ?? [];
  const may = (permission: string): boolean => permissions.includes(permission);

  /** The identity test, exactly as `resolveApprover` step 3 makes it: against the PERSISTED makerId. */
  const callerIsMaker = caller !== null && approval !== null && approval.makerId === caller.userId;

  /**
   * ⚠ `submit` NEEDS `distribution:run:write` AS WELL AS `distribution:run:initiate`, AND THAT WAS
   * MEASURED RATHER THAN READ OFF THE ROUTER.
   *
   * The router's rung is `makerProcedure('distribution:run:initiate')`. But `submit` UPDATES
   * `Distribution.status`, and the Prisma scoping extension gates every write to that model on
   * `distribution:run:write` (`packages/database/src/extensions/scoping.ts` — `Distribution: { permission:
   * 'distribution:run:write' }`). Measured live against the seeded database: a caller holding
   * `distribution:run:initiate` and not `run:write` gets
   *
   *     404 NO_GRANT — "Distribution.status gates a regulatory obligation, so update requires
   *     distribution:run:write — which this caller does not hold."
   *
   * ⚠ THE CONSEQUENCE IS NOT LOCAL TO THIS SCREEN AND IS REPORTED TO THE ACCESS MODEL:
   * `ROLE_PRESETS` gives `run:initiate` to `authorized_rep`, `case_manager` and `finance`, and
   * `run:write` to `finance` ALONE — so on two of the three roles the router's rung admits, `submit` is
   * structurally dead, and it fails as NOT FOUND, which reads as "no such run" rather than "you lack a
   * verb". Gating the control on both verbs is the honest rendering of the requirement that actually
   * exists; it does not fix the disagreement, and nothing here should pretend to.
   */
  const canSubmit =
    (run.status === 'DRAFT' || run.status === 'COMPUTED') &&
    may('distribution:run:initiate') &&
    may('distribution:run:write');
  const canApprove =
    run.status === 'PENDING_APPROVAL' &&
    approval !== null &&
    approval.status === 'PENDING' &&
    may('approval:request:approve') &&
    !callerIsMaker;
  const canExecute =
    run.status === 'PENDING_APPROVAL' &&
    approval !== null &&
    approval.status === 'APPROVED' &&
    may('distribution:line_item:write');

  /** The maker is blocked from approving their OWN run — by identity, and the screen says which rule. */
  const blockedBySegregation =
    run.status === 'PENDING_APPROVAL' &&
    approval !== null &&
    approval.status === 'PENDING' &&
    may('approval:request:approve') &&
    callerIsMaker;

  return (
    <Card
      as="section"
      className="flex flex-col gap-[var(--space-16)] text-start"
      data-testid="qm-maker-checker"
    >
      <div className="flex flex-col gap-[var(--space-4)]">
        <Eyebrow tick>{t('approval.title')}</Eyebrow>
        <Heading level={2}>{t('approval.title')}</Heading>
        <Text tone="mist">{t('approval.body')}</Text>
      </div>

      <div className="flex flex-wrap items-center gap-[var(--space-12)]">
        <Chip
          tone={RUN_STATUS_TONE[run.status] ?? 'neutral'}
          label={await distVocabText(locale, 'runStatus', run.status)}
          data-testid="qm-run-status"
        />
        {approval === null ? null : (
          <Chip
            tone={
              approval.status === 'APPROVED' || approval.status === 'EXECUTED'
                ? 'success'
                : 'warning'
            }
            label={
              /* `ApprovalStatus` has approved copy under `endowments.reserved.status` — a DIFFERENT
                 vocabulary from `DistributionStatus`, and the two must not borrow each other's labels. */
              <VocabLabel locale={locale} vocab="approvalStatus" value={approval.status} />
            }
            data-testid="qm-approval-status"
          />
        )}
      </div>

      <dl className="grid grid-cols-1 gap-x-[var(--space-24)] gap-y-[var(--space-12)] sm:grid-cols-2">
        <div className="flex flex-col gap-[var(--space-4)]">
          <dt className="qm-label">{t('approval.maker')}</dt>
          <dd data-testid="qm-approval-maker">
            {approval === null ? (
              <Text variant="body-sm" tone="mist">
                {tCommon('notRecorded')}
              </Text>
            ) : (
              <Mono size="body-sm">{approval.makerId}</Mono>
            )}
          </dd>
        </div>
        <div className="flex flex-col gap-[var(--space-4)]">
          <dt className="qm-label">{t('approval.checker')}</dt>
          <dd data-testid="qm-approval-checker">
            {approval === null || approval.checkerId === null ? (
              <Text variant="body-sm" tone="mist">
                {approval === null ? tCommon('notRecorded') : t('approval.awaitingChecker')}
              </Text>
            ) : (
              <Mono size="body-sm">{approval.checkerId}</Mono>
            )}
          </dd>
        </div>
        {approval === null ? null : (
          <div className="flex flex-col gap-[var(--space-4)] sm:col-span-2">
            <dt className="qm-label">{t('runDigest')}</dt>
            <dd className="flex flex-col gap-[var(--space-4)]">
              {/* The fingerprint of the ARTIFACT the checker signs. `engineVersion` and `runDigest` are
                  inside it, which is how the engine BUILD enters what the Nazir approves: a re-run under a
                  different build produces a different digest and VOIDS the fingerprint rather than
                  quietly executing. */}
              {/* ⚠ NULLABLE, AND A NULL IS SAID RATHER THAN RENDERED AS AN EMPTY BOX. `payloadHash` is
                  nullable in the schema, and a null means no artifact hash was recorded — so there is
                  nothing for an approval to attest to. An empty well would look like a loading state. */}
              {approval.payloadHash === null ? (
                <Text variant="body-sm" tone="mist">
                  {tCommon('notRecorded')}
                </Text>
              ) : (
                <Well as="output" className="inline-flex w-fit overflow-x-auto">
                  <Mono size="body-sm">{approval.payloadHash}</Mono>
                </Well>
              )}
              <Text variant="body-sm" tone="mist">
                {t('runDigestBody')}
              </Text>
            </dd>
          </div>
        )}
      </dl>

      {/* ── The controls. One form per verb; each is a POST, invoked once, never retried. ────── */}
      <div className="flex flex-col gap-[var(--space-12)]">
        {canSubmit ? (
          <form action={submitStoredRunAction} className="flex flex-col gap-[var(--space-8)]">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="waqfId" value={run.waqfId} />
            <input type="hidden" name="distributionId" value={run.distributionId} />
            <Button type="submit" variant="primary" data-testid="qm-submit-run">
              {t('wizard.submit')}
            </Button>
            <Text variant="body-sm" tone="mist">
              {t('wizard.stepSubmitBody')}
            </Text>
          </form>
        ) : null}

        {canApprove ? (
          <form action={approveRunAction} className="flex flex-col gap-[var(--space-8)]">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="waqfId" value={run.waqfId} />
            <input type="hidden" name="distributionId" value={run.distributionId} />
            <input
              type="hidden"
              name="approvalRequestId"
              value={approval?.approvalRequestId ?? ''}
            />
            <Button type="submit" variant="primary" data-testid="qm-approve-run">
              {t('approval.approve')}
            </Button>
          </form>
        ) : null}

        {blockedBySegregation ? (
          /* The maker, on their own run. Approved copy that already exists — this is V-6's sentence. */
          <Well
            invalid
            className="flex flex-col gap-[var(--space-4)]"
            data-testid="qm-segregation-refusal"
          >
            <Text variant="body-sm">{tErrors('access.SEGREGATION_OF_DUTIES')}</Text>
          </Well>
        ) : null}

        {canExecute ? (
          <form action={executeRunAction} className="flex flex-col gap-[var(--space-8)]">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="waqfId" value={run.waqfId} />
            <input type="hidden" name="distributionId" value={run.distributionId} />
            <input
              type="hidden"
              name="approvalRequestId"
              value={approval?.approvalRequestId ?? ''}
            />
            <Button type="submit" variant="primary" data-testid="qm-execute-run">
              {t('approval.execute')}
            </Button>
            <Text variant="body-sm" tone="mist">
              {t('approval.executeBody')}
            </Text>
          </form>
        ) : null}

        {!canSubmit && !canApprove && !canExecute && !blockedBySegregation ? (
          /* No verb is available to this caller in this state. Said, rather than left as a gap: an empty
             panel is ambiguous between "nothing to do" and "the screen failed to offer it". */
          <Text variant="body-sm" tone="mist" data-testid="qm-no-action">
            {run.status === 'EXECUTED' ? t('approval.executeBody') : t('approval.awaitingChecker')}
          </Text>
        ) : null}
      </div>
    </Card>
  );
}
