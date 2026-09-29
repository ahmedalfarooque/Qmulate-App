/**
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 * THE ACCESS-MATRIX BOOTSTRAP PATH — READ ALL OF THIS BEFORE ADDING A CALLER
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 *
 * `withAccessMatrixBootstrap()` suspends `waqf_access_grant_admission` — the migration-5/7/9
 * admission trigger — for the duration of one callback, and restores it to `ENABLE ALWAYS`
 * afterwards, including on failure.
 *
 * ── WHY THIS EXISTS AT ALL, AND WHY IT IS NOT A CONVENIENCE ─────────────────────────────────
 * Since migration `00000000000009_e2_close_system_marker`, a `waqf_access_grant` row may only be
 * born or widened inside a transaction that appends an `audit_event` naming it, recorded for an
 * actor who ALREADY holds `admin:access_matrix:write` on THAT endowment, established in the trail
 * before this write entered it.
 *
 * That rule has no fixed point on an empty database. The first `admin:access_matrix:write` holder
 * cannot be issued by the holder of a seat that does not exist yet, and it cannot issue itself:
 * `CHECK waqf_access_grant_no_self_issue` is `grantedByUserId <> userId`, and migration 5 §2b binds
 * `grantedByUserId` to the acting identity the admitting audit event records. **Authority cannot
 * authorise its own first instance.** There are exactly two shapes of answer:
 *
 *   (i)  a BRANCH inside the trigger that admits something without authority — which is what the
 *        `actorType = 'SYSTEM'` disjunct was until migration 9. It is worthless: a caller who can
 *        write the marker row chooses every value in it, so it admitted a FINANCE seat that claimed
 *        to be a system job with an `actorId` that was not even a `User` row. Measured; it minted an
 *        ACTIVE `NAZIR` seat and approved another maker's SAR 4,500,000 bank movement.
 *   (ii) a write OUTSIDE the trigger, through a privilege the runtime role is not supposed to have.
 *
 * This helper is (ii). `ALTER TABLE … DISABLE TRIGGER` requires table OWNERSHIP, which the runtime
 * role does NOT hold since ADR-0008 round 6 — while the migrator/owner role does.
 *
 * ── ⚠ WHAT CHANGED IN ROUND 6, AND WHAT IT NOW MEANS ───────────────────────────────────────
 * The previous version of this header said, correctly at the time: *"This is not a closure and it is
 * not protection today. On Railway the runtime connects AS THE DATABASE OWNER, so today the
 * application role can run these very statements against its own guards — measured from a FINANCE
 * seat's own scoped Prisma client in S2 round 4 ('DISABLE TRIGGER as the app role: *** PERMITTED
 * ***')."*
 *
 * **That sentence no longer holds, and the reason is a deployment fact, not a code change.** The
 * runtime now connects as `qmulate_app`, which owns nothing. MEASURED as that role on a migrated +
 * seeded database: `ALTER TABLE "waqf_access_grant" DISABLE TRIGGER waqf_access_grant_admission`
 * → `42501 must be owner of table waqf_access_grant`; `DROP TRIGGER` → 42501; `ALTER TABLE … DROP
 * CONSTRAINT` → 42501. So the ownership this helper depends on is now a PRIVILEGE THE REQUEST PATH
 * DOES NOT HAVE, which is what makes it a bootstrap rather than a hole.
 *
 * ⚠ WHAT IS STILL TRUE: ownership is exactly as powerful as it ever was — it is just held by a
 * different credential (`MIGRATOR_DATABASE_URL`). Anyone who holds THAT credential can suspend any
 * guard in the schema. The control is that the credential is absent from the web and worker service
 * environments, which `assertNoPrivilegedDatabaseUrls()` checks at boot. That is a deployment
 * property, and no test in this repository can assert it about production.
 *
 * ── ⚠ IT REFUSES ON A NON-PRIVILEGED CONNECTION, RATHER THAN FAILING OBSCURELY ─────────────
 * Handed an executor on the app connection, the first `ALTER TABLE` raises a bare
 * `42501 must be owner of table waqf_access_grant`, which reads like a database misconfiguration and
 * sent one earlier round down the wrong path. The failure is therefore caught and re-thrown naming
 * the variable to fix. Nothing is retried and nothing is skipped: the call FAILS.
 *
 * ── THE CONTRACT ───────────────────────────────────────────────────────────────────────────
 *   • PROVISIONING ONLY, ON THE OWNER CONNECTION (`createPrivilegedPrismaClient()` /
 *     `getPrivilegedBasePrismaClient()`): the fixture seed and the two test harnesses. Never a
 *     request path. `activateGrant()` in `packages/api` is the request path; it now writes through
 *     `provisionAccessGrant()` on the PROVISIONER connection, where admission is fully live.
 *   • The writes inside are STILL AUDITED. This suspends admission, not the audit spine — the rows it
 *     lays down land in the append-only, hash-chained, G-1-verified trail with their event ids, which
 *     is exactly what makes the bootstrapped admin seat "established" and able to issue afterwards.
 *   • Never wrap the statement UNDER TEST. A probe that runs in here proves nothing, because the
 *     guard it is probing is not installed while it runs.
 * ═══════════════════════════════════════════════════════════════════════════════════════════
 */

/** The one trigger this helper suspends. Named once so no caller spells it itself. */
export const ACCESS_MATRIX_ADMISSION_TRIGGER = 'waqf_access_grant_admission';

/**
 * The minimum surface needed: anything that can run raw SQL. Deliberately structural rather than a
 * Prisma type, so the seed's `state.rawTx`, a `withAudit()` transaction facade and a plain client
 * all satisfy it without this module importing the client (which would make an import cycle).
 */
export interface RawSqlExecutor {
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<number>;
}

const disableSql = `ALTER TABLE "waqf_access_grant" DISABLE TRIGGER ${ACCESS_MATRIX_ADMISSION_TRIGGER}`;
const enableSql = `ALTER TABLE "waqf_access_grant" ENABLE ALWAYS TRIGGER ${ACCESS_MATRIX_ADMISSION_TRIGGER}`;

/**
 * Runs `fn` with access-matrix admission suspended, then restores `ENABLE ALWAYS`.
 *
 * ⚠ `ENABLE ALWAYS`, never plain `ENABLE`. A trigger re-enabled normally is `tgenabled = 'O'` and
 * Postgres SKIPS it after one `SET session_replication_role = 'replica'` — the Sprint-1 finding that
 * defeated gate G-1 outright. `assertGuardsInstalled()` in the integration harness fails the next
 * test file if any guard is ever left in a state other than `'A'`.
 *
 * ⚠ THE RESTORE IS IN A `finally`, AND THAT IS NOT ENOUGH ON ITS OWN. When this runs inside a
 * transaction, a rollback restores the trigger with everything else and the `finally` is belt and
 * braces. When it runs OUTSIDE one, each `ALTER TABLE` autocommits, so the `finally` is the only
 * thing that puts the guard back — which is why a restore failure is raised loudly rather than
 * swallowed: a database left with admission off is an outage of the control, not a tidiness problem.
 *
 * ⚠ ONE CASE WHERE THE RESTORE MUST **NOT** BE RAISED, AND IT IS NOT AN EDGE CASE — IT IS THE MOST
 * COMMON FAILURE. If `fn()` throws inside a transaction, Postgres marks that transaction ABORTED and
 * every later statement in it fails with `25P02 current transaction is aborted`. The restore is a
 * later statement. So a naive `finally` that lets its own error escape REPLACES the real diagnosis
 * with `25P02` — measured: `provisionTestSubjects()` raising the `waqf_access_grant_permission_guard`
 * refusal ("role FINANCE may not hold approval:request:approve") surfaced as `25P02` instead, and the
 * api suite's assertion on that refusal went red for the wrong reason. When `fn()` has already
 * failed, the original error therefore wins and the restore failure is reported to stderr — and it is
 * safe to let it go, because the same abort that broke the restore also rolls the `DISABLE` back.
 */
export async function withAccessMatrixBootstrap<T>(
  exec: RawSqlExecutor,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    await exec.$executeRawUnsafe(disableSql);
  } catch (error: unknown) {
    // ⚠ THE ONE THING IN THIS REPOSITORY THAT GENUINELY NEEDS TABLE OWNERSHIP. Since ADR-0008
    // round 6 the runtime role does not have it, deliberately, so a caller on the app connection
    // lands here. Naming the fix is the difference between a five-minute correction and re-deriving
    // the whole design from a bare 42501.
    if (/must be owner|permission denied/i.test(String(error))) {
      throw new Error(
        `withAccessMatrixBootstrap() could not suspend ${ACCESS_MATRIX_ADMISSION_TRIGGER}: ` +
          `${String(error)}\n` +
          `  This helper needs OWNERSHIP of "waqf_access_grant", which the runtime role ` +
          `(qmulate_app / DATABASE_URL) does not hold and must never hold — that is ADR-0008 ` +
          `round 6's whole point. Build the client with createPrivilegedPrismaClient(ctx) or ` +
          `getPrivilegedBasePrismaClient(), which connect on MIGRATOR_DATABASE_URL as ` +
          `qmulate_owner.\n` +
          `  If you are trying to mint a seat on a REQUEST path, this is the wrong door: use ` +
          `provisionAccessGrant() from @qmulate/database, which runs on the provisioner ` +
          `connection with grant admission fully live.`,
        { cause: error },
      );
    }
    throw error;
  }

  // ⚠ NOT `try/finally`. A `throw` inside `finally` silently discards whatever was already in flight
  // (`no-unsafe-finally`), and discarding it is exactly the bug described above. The two failures are
  // therefore collected separately and RANKED, so which error a caller sees is a decision written down
  // here rather than an accident of control flow.
  let failed = false;
  let primaryFailure: unknown;
  let result: T | undefined;
  try {
    result = await fn();
  } catch (error: unknown) {
    failed = true;
    primaryFailure = error;
  }

  let restoreFailed = false;
  let restoreFailure: unknown;
  try {
    await exec.$executeRawUnsafe(enableSql);
  } catch (error: unknown) {
    restoreFailed = true;
    restoreFailure = error;
  }

  if (failed) {
    if (restoreFailed) {
      console.error(
        `[qmulate] could not restore ${ACCESS_MATRIX_ADMISSION_TRIGGER} after a failed ` +
          `access-matrix bootstrap. The original failure is being re-thrown and is the one to read. ` +
          `If that failure aborted a transaction, the DISABLE was rolled back with it and the guard ` +
          `is intact; if this ran OUTSIDE a transaction, ADMISSION IS NOW OFF on ` +
          `"waqf_access_grant" — restore it with: ALTER TABLE "waqf_access_grant" ENABLE ALWAYS ` +
          `TRIGGER ${ACCESS_MATRIX_ADMISSION_TRIGGER}; (or re-run ` +
          `SELECT qmulate_apply_e2_close_system_marker(), which repairs it). Restore error: ` +
          `${String(restoreFailure)}`,
      );
    }
    throw primaryFailure;
  }
  // Nothing is being masked, so a failed restore is the loudest thing that happened and must raise:
  // the guard may genuinely be off.
  if (restoreFailed) throw restoreFailure;
  return result as T;
}
