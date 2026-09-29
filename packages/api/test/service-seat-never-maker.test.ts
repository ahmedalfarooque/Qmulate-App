/**
 * S10-3a — "NEVER MAKER ACTS", proven at the one place an approval's maker is stamped.
 *
 * Owner ruling (2026-08-27, memo S9 addendum third batch): the declared service seat's writes are
 * audited as SYSTEM-actor acts and **"never maker acts: the seat can approve nothing"** — the
 * BR-105/BR-1103 line the deleted `APPROVER` role established.
 *
 * ⚠ WHY THIS TEST EXISTS AT ALL, which is the finding rather than the fix. The obvious reading is
 * that the procedure ladder delivers this bound: an approval is a `checkerProcedure` thing, so a
 * seat holding only `compliance:task:write` cannot reach it. That reading is WRONG.
 * `compliance.requestLibraryUpgrade` is `makerProcedure('compliance:task:write')` — the exact
 * permission string the seat is enumerated with — and it mints an `ApprovalRequest` stamping
 * `makerId`. `makerProcedure` is `endowmentScopedProcedure(write-verb)`: the WRITE ladder, not the
 * approval ladder.
 *
 * What refused it before this guard was `scoping.ts`'s `ApprovalRequest` table gate, whose own
 * comment says it merely keeps out a caller with no approval-module permission at all — a refusal
 * by CONSEQUENCE that would stop applying the moment the seat were given an approval verb for some
 * unrelated reason. This guard refuses by INTENT, at the point the maker is named.
 */

import { describe, expect, it } from 'vitest';

import { mintApprovalRequest } from '../src/routers/reservedMatter.js';

/**
 * The minimum a caller needs to reach the guard. Deliberately carries NO usable `db`: the actor
 * check is the first statement in `mintApprovalRequest`, so a non-human actor must be refused
 * BEFORE anything is read or written. If a future edit moves the check below the first query, this
 * stub's `db` throws and the test fails — which is the intended failure, not a flake.
 */
function contextWithActor(actorType: string): never {
  return {
    waqfId: 'waqf-001',
    actor: { actorType, actorId: 'user-service-deadline-evaluator' },
    db: {
      approvalRequest: {
        findFirst: (): never => {
          throw new Error(
            'the actor check must refuse BEFORE any database access — nothing should be read on ' +
              'behalf of an identity that may not mint an approval at all.',
          );
        },
      },
    },
  } as never;
}

const MINT_INPUT = {
  waqfId: 'waqf-001',
  type: 'RESERVED_MATTER' as const,
  reservedMatterKind: 'DEED_IDENTITY' as const,
  subjectId: 'waqf:waqf-001:deedNumber',
  payload: { waqfId: 'waqf-001' },
  procedure: 'test.mint',
};

describe('mintApprovalRequest — a non-human actor may never become a maker', () => {
  it('refuses a SYSTEM actor — the ruled seat identity (D1, 2026-08-28)', async () => {
    await expect(
      mintApprovalRequest(contextWithActor('SYSTEM'), MINT_INPUT as never),
    ).rejects.toThrow(/may not mint an approval request/);
  });

  it('refuses a SERVICE actor too — the bound is about non-human identity, not one enum member', async () => {
    // D1 ruled `SYSTEM` for this seat, but the owner's bound is about what a non-human seat may
    // do. Keying the guard on the ruled member alone would leave the hole open for the other one,
    // and `SERVICE` is a live `AuditActorType` member with its own refusal logic already written.
    await expect(
      mintApprovalRequest(contextWithActor('SERVICE'), MINT_INPUT as never),
    ).rejects.toThrow(/may not mint an approval request/);
  });

  it('refuses an UNRECOGNISED actor type — fail closed, not fail open', async () => {
    // The repo's standing precedent (`requiresTotpForDbRole`, `assertAuthed`'s gate status): an
    // unmapped value is treated as the restricted case. An allow-list of one is the only shape
    // that cannot be widened by a typo.
    await expect(
      mintApprovalRequest(contextWithActor('ROBOT'), MINT_INPUT as never),
    ).rejects.toThrow(/may not mint an approval request/);
  });

  it('⚠ POSITIVE CONTROL — a USER actor is NOT refused by this guard', async () => {
    // Without this, the three refusals above would pass just as happily if the guard rejected
    // EVERY caller, and "approvals cannot be minted at all" would look like "the seat is barred".
    // A USER gets past the actor check and reaches the stub's `db`, which throws its own distinct
    // message — so the assertion is that it fails for the OTHER reason.
    await expect(
      mintApprovalRequest(contextWithActor('USER'), MINT_INPUT as never),
    ).rejects.toThrow(/BEFORE any database access/);
  });
});
