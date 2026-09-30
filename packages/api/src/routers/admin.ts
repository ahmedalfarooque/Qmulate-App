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
  resolveGrantPermissions,
} from '@qmulate/domain/access';
import { DB_ROLE_TO_ROLE_KEY, getAuth } from '@qmulate/auth';
import {
  getBasePrismaClient,
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
        if (input.userId === ctx.session.userId && input.status !== 'ACTIVE') {
          throw new ApiError('ORG_PERMISSION_DENIED', 'an administrator does not disable or reject their own account.', {
            userId: ctx.session.userId,
          });
        }
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
        await setUserOverrides(toActorContext(ctx, { procedure: 'admin.users.setOverrides' }), input);
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
