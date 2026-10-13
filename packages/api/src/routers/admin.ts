/**
 * The organisation layer's API (migration 55): users, registration requests, access levels,
 * per-user overrides, seats, and the audit trail.
 *
 * Every procedure is built on `orgProcedure(permission)`: the caller must hold the named
 * ORGANISATION-scope permission through their level, an override, or by being the primary
 * administrator — resolved from the database on this request, never from a claim. Reads use the
 * base client (the organisation tables are not endowment data, and the grant rows an administrator
 * reviews are the authorization plane itself). Writes go through the provisioning connection
 * inside one audited transaction, and the database re-checks: `user_org_columns_guard`,
 * `user_last_primary_admin_guard`, `waqf_access_grant_admission`, `waqf_access_grant_no_self_issue`.
 *
 * Nothing here confers an approval verb, changes the thirteen-role enum, or bypasses a seat: an
 * administrator SEATS a person on an endowment (a grant, admitted by the trigger) — the seat then
 * carries the permissions, exactly as before.
 */
import { randomBytes } from 'node:crypto';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  ACCESS_LEVEL_KEYS,
  ORG_SCOPE_PERMISSIONS,
  PERMISSION_MODULES,
  PERMISSION_RESOURCES,
  PERMISSION_VERBS,
  ROLE_PRESETS,
  USER_STATUSES,
  isPermissionString,
  refuseUserAdminChange,
  resolveGrantPermissions,
  type UserAdminChange,
} from '@qmulate/domain/access';
import { DB_ROLE_TO_ROLE_KEY, getAuth } from '@qmulate/auth';
import {
  applyDefaultAccessProfile,
  getBasePrismaClient,
  recordEvent,
  revokeAccessGrant,
  setUserAccessLevel,
  setUserOverrides,
  setUserStatus,
  upsertAccessLevel,
} from '@qmulate/database';
import { serverEnv } from '@qmulate/config/env';

import { activateGrant, toActorContext } from '../context.js';
import { ApiError } from '../errors.js';
import { orgProcedure, router } from '../trpc.js';

const userId = z.string().min(1).max(128);
const levelId = z.string().min(1).max(128);
const permission = z.string().regex(/^[a-z_]+:[a-z_]+:[a-z]+$/);

const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerified: true,
  twoFactorEnabled: true,
  status: true,
  isPrimaryAdmin: true,
  statusChangedAt: true,
  statusReason: true,
  createdAt: true,
  accessLevel: { select: { id: true, key: true, nameEn: true, nameAr: true } },
  _count: { select: { grants: true } },
} as const;

function dbRoleValues(): readonly string[] {
  return Object.keys(DB_ROLE_TO_ROLE_KEY);
}

/** The Nazir seat is the approval authority (ADR-0004, BR-105); it is not issued from this screen. */
const SEATABLE_ROLES_EXCLUDED = new Set(['NAZIR']);

/**
 * Migration 55 · ORGANISATION-WIDE seat administration. `orgProcedure('admin:access_matrix:write')`
 * has already established that the caller holds the organisation permission; the seat-scoped
 * actor context is widened to the ONE endowment being administered so the access-matrix client's
 * force-filter (`authorizedWaqfIds`) can see it. The database re-verifies the organisation
 * permission in `qmulate_grant_admission()` before any grant row is admitted, so this is a
 * visibility widening, never an authority one — and it never touches endowment DATA reads.
 */
function orgWideActor(ctx: Parameters<typeof toActorContext>[0], waqfId: string, procedure: string) {
  const base = toActorContext(ctx, { procedure });
  return {
    ...base,
    authorizedWaqfIds: [...new Set([...base.authorizedWaqfIds, waqfId])],
    // The authorization-plane write policy reads the ACTOR's permissions; carry the ONE organisation
    // permission `orgProcedure` has just established, and nothing else.
    permissions: [...new Set([...(base.permissions ?? []), 'admin:access_matrix:write'])],
  };
}

/**
 * The primary-administrator / self-lockout safeguard, applied BEFORE any write so the refusal is a
 * clear `ORG_PERMISSION_DENIED` rather than a database error. The same rule is re-asserted inside
 * the database layer's own writes (`refuseUserAdminChange` in `@qmulate/database`), so skipping this
 * function cannot skip the rule. Returns the target row for the caller's use.
 */
async function guardUserChange(
  ctx: { readonly session: { readonly userId: string } },
  userId: string,
  change: UserAdminChange,
) {
  const target = await getBasePrismaClient().user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, isPrimaryAdmin: true },
  });
  if (target === null) throw new ApiError('NO_GRANT', 'no such user', { userId });
  const refusal = refuseUserAdminChange({ actorId: ctx.session.userId, target, change });
  if (refusal !== null) throw new ApiError('ORG_PERMISSION_DENIED', refusal, { userId: ctx.session.userId });
  return target;
}

export const adminRouter = router({
  users: router({
    list: orgProcedure('admin:user:read')
      .input(
        z
          .object({
            search: z.string().max(200).optional(),
            status: z.enum(USER_STATUSES).optional(),
            accessLevelId: levelId.optional(),
            limit: z.number().int().min(1).max(200).default(100),
          })
          .default({}),
      )
      .query(async ({ input }) => {
        const db = getBasePrismaClient();
        const rows = await db.user.findMany({
          where: {
            ...(input.status ? { status: input.status } : {}),
            ...(input.accessLevelId ? { accessLevelId: input.accessLevelId } : {}),
            ...(input.search
              ? {
                  OR: [
                    { email: { contains: input.search, mode: 'insensitive' } },
                    { name: { contains: input.search, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          select: USER_LIST_SELECT,
          orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
          take: input.limit,
        });
        const counts = await db.user.groupBy({ by: ['status'], _count: { _all: true } });
        return {
          users: rows.map((row) => ({ ...row, grantCount: row._count.grants, _count: undefined })),
          counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Record<string, number>,
        };
      }),

    get: orgProcedure('admin:user:read')
      .input(z.object({ userId }))
      .query(async ({ input }) => {
        const db = getBasePrismaClient();
        const user = await db.user.findUnique({
          where: { id: input.userId },
          select: {
            ...USER_LIST_SELECT,
            permissionOverrides: { where: { deletedAt: null }, select: { permission: true, effect: true } },
            grants: {
              where: { deletedAt: null },
              select: {
                id: true,
                waqfId: true,
                role: true,
                permissions: true,
                validFrom: true,
                validUntil: true,
                revokedAt: true,
                grantedByUserId: true,
                waqf: { select: { certificateNumber: true, waqif: { select: { nameAr: true, nameEn: true } } } },
              },
              orderBy: { validFrom: 'desc' },
            },
            sessions: { select: { createdAt: true }, orderBy: { createdAt: 'desc' }, take: 1 },
          },
        });
        if (user === null) {
          throw new ApiError('NO_GRANT', 'no such user', { userId: input.userId });
        }
        const recentEvents = await db.auditEvent.findMany({
          where: { OR: [{ actorId: input.userId }, { entityType: 'User', entityId: input.userId }] },
          select: { id: true, occurredAt: true, action: true, entityType: true, entityId: true, actorId: true },
          orderBy: { occurredAt: 'desc' },
          take: 25,
        });
        return {
          ...user,
          grantCount: user._count.grants,
          _count: undefined,
          lastSessionAt: user.sessions[0]?.createdAt ?? null,
          sessions: undefined,
          recentEvents: recentEvents.map((e) => ({ ...e, id: e.id.toString() })),
        };
      }),

    setStatus: orgProcedure('admin:user:write')
      .input(
        z.object({
          userId,
          status: z.enum(USER_STATUSES),
          reason: z.string().max(500).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await guardUserChange(ctx, input.userId, { kind: 'status', status: input.status });
        await setUserStatus(toActorContext(ctx, { procedure: 'admin.users.setStatus' }), {
          userId: input.userId,
          status: input.status,
          reason: input.reason ?? null,
        });
        return { ok: true as const };
      }),

    setAccessLevel: orgProcedure('admin:user:write')
      .input(z.object({ userId, accessLevelId: levelId.nullable() }))
      .mutation(async ({ ctx, input }) => {
        const level =
          input.accessLevelId === null
            ? null
            : await getBasePrismaClient().accessLevel.findUnique({ where: { id: input.accessLevelId }, select: { key: true } });
        await guardUserChange(ctx, input.userId, { kind: 'level', levelKey: level?.key ?? null });
        await setUserAccessLevel(toActorContext(ctx, { procedure: 'admin.users.setAccessLevel' }), input);
        return { ok: true as const };
      }),

    setOverrides: orgProcedure('admin:user:write')
      .input(
        z.object({
          userId,
          overrides: z.array(z.object({ permission, effect: z.enum(['ALLOW', 'DENY']) })).max(64),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await guardUserChange(ctx, input.userId, { kind: 'overrides', count: input.overrides.length });
        await setUserOverrides(toActorContext(ctx, { procedure: 'admin.users.setOverrides' }), input);
        return { ok: true as const };
      }),

    /**
     * Adds an account. The new user exists exactly as a self-registered one does (the same auth
     * library path, so the default access profile applies); the administrator may pick a level.
     * No password is ever chosen FOR a person: either the administrator types an initial password
     * (never stored or logged here), or - the default - an unguessable one is set and discarded and
     * the person receives a password-reset link to the registered address, proving control of it.
     */
    create: orgProcedure('admin:user:write')
      .input(
        z.object({
          name: z.string().trim().min(1).max(120),
          email: z.string().trim().toLowerCase().email().max(254),
          accessLevelId: levelId.optional(),
          initialPassword: z.string().min(12).max(128).optional(),
          locale: z.enum(['ar', 'en']).default('ar'),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = getBasePrismaClient();
        if ((await db.user.findUnique({ where: { email: input.email }, select: { id: true } })) !== null) {
          throw new TRPCError({ code: 'CONFLICT', message: 'an account with that email address already exists' });
        }
        const generated = input.initialPassword === undefined;
        const password = input.initialPassword ?? randomBytes(32).toString('base64url');
        const created = await getAuth().api.signUpEmail({ body: { name: input.name, email: input.email, password } });
        const newUserId = created.user.id;
        // Sign-up opens a session for the new account; an administrator creating it must not leave a
        // live session for a person who has not signed in.
        await db.session.deleteMany({ where: { userId: newUserId } });
        // Idempotent: the registration hook has normally applied the default profile already.
        await applyDefaultAccessProfile(db, newUserId);
        if (input.accessLevelId !== undefined) {
          await setUserAccessLevel(toActorContext(ctx, { procedure: 'admin.users.create' }), {
            userId: newUserId,
            accessLevelId: input.accessLevelId,
          });
        }
        let resetEmailSent = false;
        if (generated) {
          try {
            await getAuth().api.requestPasswordReset({
              body: { email: input.email, redirectTo: `${serverEnv.BETTER_AUTH_URL}/${input.locale}/reset-password` },
            });
            resetEmailSent = true;
          } catch {
            // Mail not configured or refused: the account exists; the administrator re-sends from its page.
          }
        }
        await recordEvent(toActorContext(ctx, { procedure: 'admin.users.create' }), {
          action: 'CREATE',
          category: 'MUTATION',
          classification: 'SENSITIVE',
          entityType: 'User',
          entityId: newUserId,
          extraContext: {
            operation: 'ADMIN_CREATE_ACCOUNT',
            passwordSetBy: generated ? 'account holder, through a reset link' : 'administrator',
            accessLevelId: input.accessLevelId ?? null,
          },
        });
        return { userId: newUserId, resetEmailSent };
      }),

    /** Edits a person's display name and sign-in address. Changing the address clears its verification. */
    updateDetails: orgProcedure('admin:user:write')
      .input(
        z.object({
          userId,
          name: z.string().trim().min(1).max(120).optional(),
          email: z.string().trim().toLowerCase().email().max(254).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const db = getBasePrismaClient();
        const current = await db.user.findUnique({ where: { id: input.userId }, select: { name: true, email: true } });
        if (current === null) throw new ApiError('NO_GRANT', 'no such user', { userId: input.userId });
        const changingEmail = input.email !== undefined && input.email !== current.email;
        await guardUserChange(ctx, input.userId, changingEmail ? { kind: 'email' } : { kind: 'overrides', count: 0 });
        if (changingEmail && input.email !== undefined) {
          const taken = await db.user.findUnique({ where: { email: input.email }, select: { id: true } });
          if (taken !== null) throw new TRPCError({ code: 'CONFLICT', message: 'an account with that email address already exists' });
        }
        const data: { name?: string; email?: string; emailVerified?: boolean } = {};
        const fields: string[] = [];
        if (input.name !== undefined && input.name !== current.name) {
          data.name = input.name;
          fields.push('name');
        }
        if (changingEmail && input.email !== undefined) {
          data.email = input.email;
          data.emailVerified = false;
          fields.push('email');
        }
        if (fields.length === 0) return { ok: true as const, changed: [] as string[] };
        await db.user.update({ where: { id: input.userId }, data });
        await recordEvent(toActorContext(ctx, { procedure: 'admin.users.updateDetails' }), {
          action: 'UPDATE',
          category: 'MUTATION',
          classification: 'SENSITIVE',
          entityType: 'User',
          entityId: input.userId,
          extraContext: { operation: 'ADMIN_EDIT_DETAILS', fields },
        });
        return { ok: true as const, changed: fields };
      }),

    /**
     * Removes an account that has no recorded history. An account that ever held a seat, a
     * membership or an override is part of the access trail the database keeps (those rows cannot
     * be deleted), so it is refused with the instruction to DISABLE it - which removes every
     * ability to sign in and keeps the record. The primary administrator and the caller's own
     * account are never removable.
     */
    remove: orgProcedure('admin:user:write')
      .input(z.object({ userId }))
      .mutation(async ({ ctx, input }) => {
        await guardUserChange(ctx, input.userId, { kind: 'remove' });
        const db = getBasePrismaClient();
        const [grants, memberships, overrides] = await Promise.all([
          db.waqfAccessGrant.count({ where: { userId: input.userId } }),
          db.membership.count({ where: { userId: input.userId } }),
          db.userPermissionOverride.count({ where: { userId: input.userId } }),
        ]);
        if (grants + memberships + overrides > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'this account has recorded access history and cannot be deleted; disable it instead',
          });
        }
        await recordEvent(toActorContext(ctx, { procedure: 'admin.users.remove' }), {
          action: 'UPDATE',
          category: 'MUTATION',
          classification: 'SENSITIVE',
          entityType: 'User',
          entityId: input.userId,
          extraContext: { operation: 'ADMIN_REMOVE_ACCOUNT' },
        });
        try {
          await db.user.delete({ where: { id: input.userId } });
        } catch {
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'this account is referenced by other records and cannot be deleted; disable it instead',
          });
        }
        return { ok: true as const };
      }),

    /** Sends the account a password-reset email through the same auth library path as the public form. */
    requestPasswordReset: orgProcedure('admin:user:write')
      .input(z.object({ userId, locale: z.enum(['ar', 'en']).default('ar') }))
      .mutation(async ({ input }) => {
        const db = getBasePrismaClient();
        const user = await db.user.findUnique({ where: { id: input.userId }, select: { email: true } });
        if (user === null) throw new ApiError('NO_GRANT', 'no such user', { userId: input.userId });
        await getAuth().api.requestPasswordReset({
          body: { email: user.email, redirectTo: `${serverEnv.BETTER_AUTH_URL}/${input.locale}/reset-password` },
        });
        return { ok: true as const };
      }),

    /** Seats a person on an endowment: a `waqf_access_grant`, admitted by the database trigger. */
    seat: orgProcedure('admin:access_matrix:write')
      .input(
        z.object({
          userId,
          waqfId: z.string().min(1).max(128),
          role: z.string().min(1).max(40),
          permissions: z.array(permission).max(128).optional(),
          validUntil: z.coerce.date().nullable().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (!dbRoleValues().includes(input.role) || SEATABLE_ROLES_EXCLUDED.has(input.role)) {
          throw new ApiError('ORG_PERMISSION_DENIED', `role "${input.role}" is not issued from the Users screen.`, {
            userId: ctx.session.userId,
          });
        }
        const db = getBasePrismaClient();
        const target = await db.user.findUnique({
          where: { id: input.userId },
          select: { status: true, accessLevel: { select: { seatRole: true, seatPermissions: true } } },
        });
        if (target === null) throw new ApiError('NO_GRANT', 'no such user', { userId: input.userId });
        const roleKey = DB_ROLE_TO_ROLE_KEY[input.role as keyof typeof DB_ROLE_TO_ROLE_KEY];
        const requested = input.permissions ?? target.accessLevel?.seatPermissions ?? [];
        const effective = resolveGrantPermissions(roleKey, requested.filter(isPermissionString));
        const { grantId } = await activateGrant(
          ctx,
          { userId: input.userId, waqfId: input.waqfId, role: input.role },
          { permissions: [...effective], validFrom: ctx.now, validUntil: input.validUntil ?? null },
          {
            actorContext: orgWideActor(ctx, input.waqfId, 'admin.users.seat'),
            eligibilityCheck: async () =>
              target.status === 'ACTIVE'
                ? { eligible: true }
                : {
                    eligible: false,
                    failing: [{ criterion: 'ACCOUNT_ACTIVE', detail: `the account is ${target.status}` }],
                  },
          },
        );
        return { grantId };
      }),

    unseat: orgProcedure('admin:access_matrix:write')
      .input(z.object({ grantId: z.string().min(1).max(128) }))
      .mutation(async ({ ctx, input }) => {
        // The grant is looked up UNSCOPED (the caller's authority is organisation-wide, not a seat)
        // and the actor context is widened to that one endowment for the audited revocation.
        const grant = await getBasePrismaClient().waqfAccessGrant.findUnique({
          where: { id: input.grantId },
          select: { waqfId: true },
        });
        if (grant === null) throw new ApiError('NO_GRANT', 'no such grant', { userId: ctx.session.userId });
        const result = await revokeAccessGrant(orgWideActor(ctx, grant.waqfId, 'admin.users.unseat'), {
          grantId: input.grantId,
        });
        return result;
      }),
  }),

  /** The endowments an administrator may seat people on: every one, since the authority is organisation-wide. */
  endowments: orgProcedure('admin:access_matrix:read').query(async () => {
    const db = getBasePrismaClient();
    const rows = await db.waqf.findMany({
      where: { deletedAt: null },
      select: { id: true, certificateNumber: true, waqif: { select: { nameAr: true, nameEn: true } } },
      orderBy: { id: 'asc' },
    });
    return rows;
  }),

  accessLevels: router({
    list: orgProcedure('admin:access_level:read').query(async () => {
      const db = getBasePrismaClient();
      const levels = await db.accessLevel.findMany({
        select: {
          id: true,
          key: true,
          nameEn: true,
          nameAr: true,
          permissions: true,
          seatRole: true,
          seatPermissions: true,
          isSystem: true,
          updatedAt: true,
          _count: { select: { users: true } },
        },
        orderBy: [{ isSystem: 'desc' }, { key: 'asc' }],
      });
      return levels.map((l) => ({ ...l, userCount: l._count.users, _count: undefined }));
    }),

    /** The vocabulary the matrix screen renders: it is generated from the real registry, never typed in. */
    catalog: orgProcedure('admin:access_level:read').query(() => ({
      orgPermissions: [...ORG_SCOPE_PERMISSIONS],
      modules: PERMISSION_MODULES.map((module) => ({
        module,
        resources: [...PERMISSION_RESOURCES[module]],
      })),
      verbs: [...PERMISSION_VERBS],
      roles: dbRoleValues().filter((role) => !SEATABLE_ROLES_EXCLUDED.has(role)),
      /** Each role's ceiling: a seat template beyond it is cut down at issuance (`resolveGrantPermissions`). */
      rolePresets: Object.fromEntries(
        Object.entries(ROLE_PRESETS).map(([role, permissions]) => [role, [...permissions]]),
      ) as Record<string, string[]>,
      levelKeys: [...ACCESS_LEVEL_KEYS],
    })),

    upsert: orgProcedure('admin:access_level:write')
      .input(
        z.object({
          id: levelId.optional(),
          key: z.string().regex(/^[A-Z][A-Z0-9_]{1,39}$/),
          nameEn: z.string().min(1).max(80),
          nameAr: z.string().min(1).max(80),
          permissions: z.array(permission).max(64),
          seatRole: z.string().max(40).nullable(),
          seatPermissions: z.array(permission).max(256),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        if (input.seatRole !== null && (!dbRoleValues().includes(input.seatRole) || SEATABLE_ROLES_EXCLUDED.has(input.seatRole))) {
          throw new ApiError('ORG_PERMISSION_DENIED', `role "${input.seatRole}" cannot be a seat template.`, {
            userId: ctx.session.userId,
          });
        }
        return upsertAccessLevel(toActorContext(ctx, { procedure: 'admin.accessLevels.upsert' }), {
          ...input,
          seatPermissions: input.seatPermissions.filter(isPermissionString),
        });
      }),
  }),

  audit: router({
    list: orgProcedure('audit:event:read')
      .input(
        z
          .object({
            actorId: z.string().max(128).optional(),
            entityType: z.string().max(80).optional(),
            action: z.string().max(40).optional(),
            waqfId: z.string().max(128).optional(),
            before: z.string().max(40).optional(),
            limit: z.number().int().min(1).max(200).default(50),
          })
          .default({}),
      )
      .query(async ({ input }) => {
        const db = getBasePrismaClient();
        const rows = await db.auditEvent.findMany({
          where: {
            ...(input.actorId ? { actorId: input.actorId } : {}),
            ...(input.entityType ? { entityType: input.entityType } : {}),
            ...(input.action ? { action: input.action as never } : {}),
            ...(input.waqfId ? { waqfId: input.waqfId } : {}),
            ...(input.before ? { id: { lt: BigInt(input.before) } } : {}),
          },
          select: {
            id: true,
            occurredAt: true,
            occurredAtHijri: true,
            actorId: true,
            actorType: true,
            action: true,
            entityType: true,
            entityId: true,
            waqfId: true,
            category: true,
            classification: true,
            context: true,
          },
          orderBy: { id: 'desc' },
          take: input.limit,
        });
        return {
          events: rows.map((row) => ({ ...row, id: row.id.toString() })),
          nextBefore: rows.length === input.limit ? (rows.at(-1)?.id.toString() ?? null) : null,
        };
      }),
  }),
});
