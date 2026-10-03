/**
 * The organisation layer (migration 55): registration state, access levels, per-user overrides.
 *
 * READS run on whatever client the caller holds. WRITES run only on the PROVISIONING connection
 * (`ACCESS_MATRIX_DATABASE_URL`) inside one audited transaction, exactly as `provisionAccessGrant`
 * does — the database enforces the same rule with `user_org_columns_guard`, so a write from the
 * runtime role is refused whatever this module says.
 */
import { randomUUID } from 'node:crypto';

import {
  ACCESS_LEVEL_KEYS,
  assertOrgScopePermissions,
  resolveOrgPermissions,
  type OrgScopePermission,
  type UserStatus,
} from '@qmulate/domain/access';

import {
  createAccessMatrixPrismaClientInternal,
  hasConnectionCredential,
  MissingConnectionCredentialError,
  withAudit,
} from './client.js';
import { currentAuditTransaction } from './extensions/audit.js';

import type { RequestContext } from './context.js';

export interface OrgAccess {
  readonly userId: string;
  readonly status: UserStatus;
  readonly isPrimaryAdmin: boolean;
  readonly accessLevel: {
    readonly id: string;
    readonly key: string;
    readonly nameEn: string;
    readonly nameAr: string;
    /** Migration 57: the level seats its holders on EVERY live endowment with the template below. */
    readonly seatsAllEndowments: boolean;
    readonly seatRole: string | null;
    readonly seatPermissions: readonly string[];
  } | null;
  readonly permissions: ReadonlySet<OrgScopePermission>;
}

/** The delegate shape {@link resolveOrgAccess} needs; keeps it unit-testable without a database. */
export interface OrgAccessQueryClient {
  readonly user: {
    findUnique(args: {
      where: { id: string };
      select: {
        id: true;
        status: true;
        isPrimaryAdmin: true;
        accessLevel: { select: { id: true; key: true; nameEn: true; nameAr: true; permissions: true; seatsAllEndowments: true; seatRole: true; seatPermissions: true } };
        permissionOverrides: { where: { deletedAt: null }; select: { permission: true; effect: true } };
      };
    }): Promise<{
      id: string;
      status: string;
      isPrimaryAdmin: boolean;
      accessLevel: {
        id: string;
        key: string;
        nameEn: string;
        nameAr: string;
        permissions: string[];
        seatsAllEndowments: boolean;
        seatRole: unknown;
        seatPermissions: string[];
      } | null;
      permissionOverrides: { permission: string; effect: string }[];
    } | null>;
  };
}

const NO_ACCESS = (userId: string): OrgAccess => ({
  userId,
  status: 'DISABLED',
  isPrimaryAdmin: false,
  accessLevel: null,
  permissions: new Set(),
});

/**
 * One read, one answer: the account's registration state and its effective organisation-scope
 * permissions. An unknown user id resolves to "no access" rather than throwing, so the request
 * context never has to special-case it.
 */
export async function resolveOrgAccess(db: OrgAccessQueryClient, userId: string): Promise<OrgAccess> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      isPrimaryAdmin: true,
      accessLevel: { select: { id: true, key: true, nameEn: true, nameAr: true, permissions: true, seatsAllEndowments: true, seatRole: true, seatPermissions: true } },
      permissionOverrides: { where: { deletedAt: null }, select: { permission: true, effect: true } },
    },
  });
  if (row === null) return NO_ACCESS(userId);
  const status = row.status as UserStatus;
  return {
    userId,
    status,
    isPrimaryAdmin: row.isPrimaryAdmin,
    accessLevel: row.accessLevel
      ? {
          id: row.accessLevel.id,
          key: row.accessLevel.key,
          nameEn: row.accessLevel.nameEn,
          nameAr: row.accessLevel.nameAr,
          seatsAllEndowments: row.accessLevel.seatsAllEndowments,
          seatRole: row.accessLevel.seatRole === null ? null : String(row.accessLevel.seatRole),
          seatPermissions: [...row.accessLevel.seatPermissions],
        }
      : null,
    permissions: resolveOrgPermissions({
      status,
      isPrimaryAdmin: row.isPrimaryAdmin,
      levelPermissions: row.accessLevel?.permissions ?? [],
      overrides: row.permissionOverrides.map((o) => ({
        permission: o.permission,
        effect: o.effect === 'DENY' ? 'DENY' : 'ALLOW',
      })),
    }),
  };
}

/* ── writes (provisioning connection, audited) ───────────────────────────────────────────── */

function assertCredentialPresent(operation: string): void {
  if (!hasConnectionCredential('provisioner')) {
    const cause = new MissingConnectionCredentialError('provisioner');
    throw new Error(`${operation}() cannot run. ${cause.message}`, { cause });
  }
}

function assertNotInsideAuditTransaction(operation: string): void {
  if (currentAuditTransaction() !== null) {
    throw new Error(
      `${operation}: must not run inside another audited transaction — it opens its own on the ` +
        'provisioning connection.',
    );
  }
}

export interface SetUserStatusInput {
  readonly userId: string;
  readonly status: UserStatus;
  readonly reason?: string | null;
}

/** Approve / reject / disable / reactivate. The database refuses to sideline the last primary admin. */
export async function setUserStatus(ctx: RequestContext, input: SetUserStatusInput): Promise<void> {
  assertCredentialPresent('setUserStatus');
  assertNotInsideAuditTransaction('setUserStatus');
  const db = createAccessMatrixPrismaClientInternal(ctx);
  await withAudit(db, async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { status: input.status, statusChangedAt: new Date(), statusReason: input.reason ?? null },
    });
  });
}

export interface SetUserAccessLevelInput {
  readonly userId: string;
  readonly accessLevelId: string | null;
}

export async function setUserAccessLevel(ctx: RequestContext, input: SetUserAccessLevelInput): Promise<void> {
  assertCredentialPresent('setUserAccessLevel');
  assertNotInsideAuditTransaction('setUserAccessLevel');
  const db = createAccessMatrixPrismaClientInternal(ctx);
  await withAudit(db, async (tx) => {
    await tx.user.update({ where: { id: input.userId }, data: { accessLevelId: input.accessLevelId } });
  });
}

export interface SetUserOverridesInput {
  readonly userId: string;
  /** The complete desired set; rows not listed are removed. */
  readonly overrides: readonly { readonly permission: string; readonly effect: 'ALLOW' | 'DENY' }[];
}

/** Replaces the user's organisation-scope overrides wholesale, each row audited. */
export async function setUserOverrides(ctx: RequestContext, input: SetUserOverridesInput): Promise<void> {
  assertCredentialPresent('setUserOverrides');
  assertNotInsideAuditTransaction('setUserOverrides');
  assertOrgScopePermissions(input.overrides.map((o) => o.permission));
  const db = createAccessMatrixPrismaClientInternal(ctx);
  await withAudit(db, async (tx) => {
    const existing = await tx.userPermissionOverride.findMany({
      where: { userId: input.userId },
      select: { id: true, permission: true, effect: true, deletedAt: true },
    });
    const wanted = new Map(input.overrides.map((o) => [o.permission, o.effect]));
    for (const row of existing) {
      const effect = wanted.get(row.permission);
      if (effect === undefined) {
        // Withdrawn: stamped, not deleted — the audit spine refuses hard deletes (§12).
        if (row.deletedAt === null) {
          await tx.userPermissionOverride.update({ where: { id: row.id }, data: { deletedAt: new Date() } });
        }
      } else if (effect !== row.effect || row.deletedAt !== null) {
        // Re-added or changed: the (userId, permission) row is revived in place.
        await tx.userPermissionOverride.update({ where: { id: row.id }, data: { effect, deletedAt: null } });
      }
      wanted.delete(row.permission);
    }
    for (const [permission, effect] of wanted) {
      await tx.userPermissionOverride.create({
        data: { id: `ovr-${randomUUID()}`, userId: input.userId, permission, effect, createdBy: ctx.actorId },
        select: { id: true },
      });
    }
  });
}

export interface UpsertAccessLevelInput {
  readonly id?: string;
  readonly key: string;
  readonly nameEn: string;
  readonly nameAr: string;
  readonly permissions: readonly string[];
  readonly seatRole: string | null;
  readonly seatPermissions: readonly string[];
}

/** Creates a level or edits an existing one (system levels: contents only, never key). */
export async function upsertAccessLevel(ctx: RequestContext, input: UpsertAccessLevelInput): Promise<{ id: string }> {
  assertCredentialPresent('upsertAccessLevel');
  assertNotInsideAuditTransaction('upsertAccessLevel');
  const permissions = assertOrgScopePermissions(input.permissions);
  const db = createAccessMatrixPrismaClientInternal(ctx);
  return withAudit(db, async (tx) => {
    const data = {
      nameEn: input.nameEn,
      nameAr: input.nameAr,
      permissions: [...permissions],
      seatRole: (input.seatRole as never) ?? null,
      seatPermissions: [...new Set(input.seatPermissions)],
    };
    if (input.id) {
      await tx.accessLevel.update({ where: { id: input.id }, data });
      return { id: input.id };
    }
    const id = `level-${input.key.toLowerCase()}-${randomUUID().slice(0, 8)}`;
    await tx.accessLevel.create({
      data: { id, key: input.key, isSystem: false, createdBy: ctx.actorId, ...data },
      select: { id: true },
    });
    return { id };
  });
}

/** Marks an account as the primary administrator (ACTIVE, level ADMIN). Owner/provisioner only. */
export async function setPrimaryAdmin(ctx: RequestContext, input: { readonly userId: string }): Promise<void> {
  assertCredentialPresent('setPrimaryAdmin');
  assertNotInsideAuditTransaction('setPrimaryAdmin');
  const db = createAccessMatrixPrismaClientInternal(ctx);
  await withAudit(db, async (tx) => {
    const admin = await tx.accessLevel.findUnique({ where: { key: ACCESS_LEVEL_KEYS[0] }, select: { id: true } });
    await tx.user.update({
      where: { id: input.userId },
      data: {
        status: 'ACTIVE',
        isPrimaryAdmin: true,
        accessLevelId: admin?.id ?? null,
        statusChangedAt: new Date(),
        statusReason: 'primary administrator',
      },
    });
  });
}


/** The two READS the registration hook needs; the caller hands in the base handle it already holds. */
export interface DefaultProfileQueryClient {
  readonly accessLevel: {
    findFirst(args: {
      where: { isDefaultForNewAccounts: true };
      select: { id: true; key: true };
    }): Promise<{ id: string; key: string } | null>;
  };
  readonly user: {
    findUnique(args: {
      where: { id: string };
      select: { status: true; isPrimaryAdmin: true; accessLevelId: true };
    }): Promise<{ status: unknown; isPrimaryAdmin: boolean; accessLevelId: string | null } | null>;
  };
}

/**
 * Migration 57 · THE DEFAULT ACCESS PROFILE, applied at registration.
 *
 * The owner's decision (2026-10-03): a new account does not wait for an administrator. It becomes
 * ACTIVE and receives the one level flagged `isDefaultForNewAccounts`. Both writes go through the
 * audited provisioning path as a SYSTEM actor (`user_org_columns_guard` admits the provisioning
 * connection; the audit trail records who — the system, at registration — and why).
 *
 * Fail-safe by construction: if no default level exists (a database not yet migrated) nothing is
 * written and the account stays PENDING_APPROVAL, exactly as before. Returns what was applied.
 */
export async function applyDefaultAccessProfile(
  base: DefaultProfileQueryClient,
  userId: string,
): Promise<{ applied: boolean; levelKey: string | null }> {
  const { makeSystemContext } = await import('./context.js');
  const level = await base.accessLevel.findFirst({
    where: { isDefaultForNewAccounts: true },
    select: { id: true, key: true },
  });
  if (level === null) return { applied: false, levelKey: null };
  const user = await base.user.findUnique({
    where: { id: userId },
    select: { status: true, isPrimaryAdmin: true, accessLevelId: true },
  });
  if (user === null || user.isPrimaryAdmin) return { applied: false, levelKey: null };
  const actor = makeSystemContext({
    actorId: null,
    authorizedWaqfIds: [],
    requestId: `registration:${userId}`,
    reason: 'default access profile at registration (migration 57)',
  });
  if (user.accessLevelId === null) await setUserAccessLevel(actor, { userId, accessLevelId: level.id });
  if (user.status === 'PENDING_APPROVAL') {
    await setUserStatus(actor, { userId, status: 'ACTIVE', reason: 'registered — default access profile' });
  }
  return { applied: true, levelKey: level.key };
}
