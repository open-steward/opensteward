/**
 * Roles, the permission catalog, and per-user role + tenant-scope assignment.
 *
 * Routes:
 *   GET    /api/permissions        — the catalog (any authenticated user)
 *   GET    /api/roles              — built-in + custom roles (roles:manage or users:manage)
 *   GET    /api/roles/:id          — one role (roles:manage or users:manage)
 *   POST   /api/roles              — create a custom role (roles:manage)
 *   PATCH  /api/roles/:id          — edit a custom role (roles:manage)
 *   DELETE /api/roles/:id          — delete an unused custom role (roles:manage)
 *   PUT    /api/users/:id/role     — assign a role (users:manage)
 *   PUT    /api/users/:id/scope    — set tenant scope (users:manage)
 *
 * Gated on permissions, not on the base role: a custom role with
 * `users:manage` on an `operator` base can manage assignments without being
 * an admin. Every write is guarded against escalation — see
 * `roleGrantRefusal` and `scopeWithin` in `../auth/access.ts`: nobody grants a
 * permission, base role or tenant they do not hold themselves, and nobody
 * edits a role or a user that holds more than they do.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  BUILTIN_ROLE_PERMISSIONS,
  BUILTIN_ROLES,
  PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  normalizePermissions,
  type Permission,
} from '@opensteward/shared'
import type { AdminStore, RoleRecord, ScopeGrant, UserScope } from '../db/admin-store'
import type { IdentityStore } from '../db/identity-store'
import {
  callerContext,
  callerMayGrantScope,
  denyRestrictedScope,
  requireAnyPermission,
  requirePermission,
  roleGrantRefusal,
  type CallerContext,
} from '../auth/access'
import { assertBreakGlassPreserved, BreakGlassError } from '../auth/idp/break-glass'
import {
  AccessScope,
  PermissionEnum,
  PermissionInfo,
  RoleDefinition,
  RoleEnum,
  ScopeGrant as ScopeGrantSchema,
  ScopeMode,
  User,
  dataEnvelope,
  errorBody,
  listEnvelope,
  noContent,
} from './_openapi'

const TAG = 'roles'

const IdParam = z.object({ id: z.string() })

const RoleName = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .meta({ description: 'Display name; unique, case-insensitively.', example: 'Support lead' })

const CreateRoleBody = z
  .object({
    name: RoleName,
    description: z.string().max(500).nullable().optional().meta({
      description: 'What the role is for.',
      example: 'Reads data for the accounts they support.',
    }),
    baseRole: RoleEnum.meta({
      description:
        'Built-in level a holder is treated as by role-gated routes. Cannot exceed your own.',
      example: 'operator',
    }),
    permissions: z.array(PermissionEnum).meta({
      description: 'Permissions the role grants. Each must be one you hold yourself.',
      example: ['connections:read', 'data:read'],
    }),
  })
  .meta({ id: 'CreateRoleBody', description: 'Request body to create a custom role.' })

const UpdateRoleBody = z
  .object({
    name: RoleName.optional(),
    description: z.string().max(500).nullable().optional().meta({
      description: 'What the role is for; `null` clears it.',
      example: 'Reads data for the accounts they support.',
    }),
    baseRole: RoleEnum.optional().meta({
      description: 'New base role. Propagated to every holder.',
      example: 'operator',
    }),
    permissions: z
      .array(PermissionEnum)
      .optional()
      .meta({
        description: 'Replacement permission set.',
        example: ['connections:read', 'data:read', 'data:export'],
      }),
  })
  .meta({
    id: 'UpdateRoleBody',
    description: 'Request body to edit a custom role; omitted fields are unchanged.',
  })

const AssignRoleBody = z
  .object({
    roleId: z.string().min(1).meta({
      description: 'Role to assign: `admin`, `operator`, `viewer`, or a custom role id.',
      example: 'operator',
    }),
  })
  .meta({
    id: 'AssignUserRoleBody',
    description: 'Request body to assign a role to a console user.',
  })

const SetScopeBody = z
  .object({
    mode: ScopeMode.meta({
      description: '`all` for every tenant, or `restricted` to `grants`.',
      example: 'restricted',
    }),
    grants: z
      .array(ScopeGrantSchema)
      .max(500)
      .optional()
      .meta({
        description: 'Tenants (and optionally verticals) granted when `mode` is `restricted`.',
        example: [{ tenantId: 'acme', verticals: '*' }],
      }),
    source: z.enum(['manual', 'idp']).optional().meta({
      description:
        '`manual` (default) pins this scope; `idp` hands the user back to IdP scope rules, which overwrite it on the next SSO login.',
      example: 'manual',
    }),
  })
  .meta({
    id: 'SetUserScopeBody',
    description: "Request body to set a console user's tenant scope.",
  })

const UserScopeView = AccessScope.extend({
  source: z.enum(['manual', 'idp']).meta({
    description: '`idp` when IdP scope rules own the scope; `manual` when an admin set it.',
    example: 'manual',
  }),
}).meta({ id: 'UserScope', description: "A console user's tenant scope and who owns it." })

function roleView(r: RoleRecord) {
  return { ...r }
}

/** Is the target user's current scope within the caller's? A restricted
 *  caller may only act on users no broader than itself. */
function targetWithinCaller(caller: CallerContext, target: UserScope): boolean {
  return callerMayGrantScope(caller, { mode: target.mode, grants: target.grants })
}

export function createRolesRoutes(adminStore: AdminStore, identityStore: IdentityStore) {
  /** The role a user holds right now, as a record (built-in or custom). */
  async function currentRoleOf(user: {
    role: string
    role_id?: string | null
  }): Promise<RoleRecord | null> {
    return adminStore.getRole(user.role_id ?? user.role)
  }

  async function unknownTenants(grants: readonly ScopeGrant[]): Promise<string[]> {
    const known = new Set((await adminStore.listTenants()).map((t) => t.id))
    return [...new Set(grants.map((g) => g.tenantId))].filter((id) => !known.has(id))
  }

  return async function rolesRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    fastify.get(
      '/api/permissions',
      {
        schema: {
          tags: [TAG],
          summary: 'List the permission catalog',
          description:
            'List every permission a role can grant, what it allows, and which built-in roles hold it. Any authenticated user.',
          operationId: 'permissions.list',
          response: { 200: listEnvelope(PermissionInfo), 401: errorBody },
        },
      },
      async () => {
        const data = PERMISSIONS.map((id) => ({
          id,
          description: PERMISSION_DESCRIPTIONS[id],
          builtinRoles: BUILTIN_ROLES.filter((r) => BUILTIN_ROLE_PERMISSIONS[r].includes(id)),
        }))
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.get(
      '/api/roles',
      {
        preHandler: [requireAnyPermission(['roles:manage', 'users:manage'])],
        schema: {
          tags: [TAG],
          summary: 'List roles',
          description:
            'List the three built-in roles followed by every custom role, each with its effective permissions. Requires `roles:manage` or `users:manage`.',
          operationId: 'roles.list',
          response: { 200: listEnvelope(RoleDefinition), 401: errorBody, 403: errorBody },
        },
      },
      async () => {
        const data = (await adminStore.listRoles()).map(roleView)
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/api/roles/:id',
      {
        preHandler: [requireAnyPermission(['roles:manage', 'users:manage'])],
        schema: {
          tags: [TAG],
          summary: 'Read one role',
          description:
            'Read a built-in or custom role by id. Requires `roles:manage` or `users:manage`. Returns `404` if no role matches.',
          operationId: 'roles.get',
          params: IdParam,
          response: {
            200: dataEnvelope(RoleDefinition),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const role = await adminStore.getRole(request.params.id)
        if (!role) return reply.status(404).send({ error: 'Role not found' })
        return { data: roleView(role) }
      },
    )

    fastify.post<{ Body: z.infer<typeof CreateRoleBody> }>(
      '/api/roles',
      {
        preHandler: [requirePermission('roles:manage'), denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Create a custom role',
          description:
            'Create a custom role from a base role and a permission set. Requires `roles:manage`. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `403` when the role would grant a permission or base role you do not hold yourself, and `409` when the name is taken (case-insensitively). Writes a `role.create` audit entry.',
          operationId: 'roles.create',
          body: CreateRoleBody,
          response: {
            201: dataEnvelope(RoleDefinition),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body
        const permissions = normalizePermissions(body.permissions)
        const refusal = roleGrantRefusal(await callerContext(request), {
          permissions,
          baseRole: body.baseRole,
        })
        if (refusal) return reply.status(403).send({ error: refusal })
        if (await adminStore.getRoleByName(body.name)) {
          return reply.status(409).send({ error: `A role named '${body.name}' already exists` })
        }
        const role = await adminStore.createRole({
          name: body.name,
          description: body.description ?? null,
          baseRole: body.baseRole,
          permissions,
          createdBy: request.jwtUser!.id,
        })
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'role.create',
          targetId: role.id,
          detail: { name: role.name },
        })
        return reply.status(201).send({ data: roleView(role) })
      },
    )

    fastify.patch<{ Params: { id: string }; Body: z.infer<typeof UpdateRoleBody> }>(
      '/api/roles/:id',
      {
        preHandler: [requirePermission('roles:manage'), denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Edit a custom role',
          description:
            'Edit a custom role; omitted fields are unchanged. A base-role change is applied to every holder at once. A role cannot become admin-based while any holder is limited to specific tenants (`409`): admins always have every tenant. Requires `roles:manage`. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if the role does not exist, `409` for a built-in role (they are immutable) or a taken name, and `403` when either the role as it stands or the edit would grant a permission or base role you do not hold. Holders see the change within seconds; role-gated routes read the current base role from the database, not the sign-in token. Writes a `role.update` audit entry.',
          operationId: 'roles.update',
          params: IdParam,
          body: UpdateRoleBody,
          response: {
            200: dataEnvelope(RoleDefinition),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const existing = await adminStore.getRole(request.params.id)
        if (!existing) return reply.status(404).send({ error: 'Role not found' })
        if (existing.isBuiltin) {
          return reply.status(409).send({ error: 'Built-in roles cannot be changed' })
        }
        const caller = await callerContext(request)
        // Neither the role as it stands (editing a role above you) nor the
        // result may exceed what the caller holds.
        const before = roleGrantRefusal(caller, existing)
        if (before) return reply.status(403).send({ error: before })
        const body = request.body
        const permissions: Permission[] | undefined = body.permissions
          ? normalizePermissions(body.permissions)
          : undefined
        const after = roleGrantRefusal(caller, {
          permissions: permissions ?? existing.permissions,
          baseRole: body.baseRole ?? existing.baseRole,
        })
        if (after) return reply.status(403).send({ error: after })
        if (body.baseRole === 'admin' && existing.baseRole !== 'admin') {
          const n = await adminStore.countRestrictedHolders(existing.id)
          if (n > 0) {
            return reply.status(409).send({
              error: `${n} user(s) with this role are limited to specific tenants, and admins always have every tenant. Give them every tenant first, or use a different role.`,
            })
          }
        }
        if (body.name && body.name.toLowerCase() !== existing.name.toLowerCase()) {
          if (await adminStore.getRoleByName(body.name)) {
            return reply.status(409).send({ error: `A role named '${body.name}' already exists` })
          }
        }
        const result = await adminStore.updateRole(
          existing.id,
          { name: body.name, description: body.description, baseRole: body.baseRole, permissions },
          request.jwtUser!.id,
        )
        if (!result.ok) {
          return result.reason === 'not_found'
            ? reply.status(404).send({ error: 'Role not found' })
            : reply.status(409).send({ error: 'Built-in roles cannot be changed' })
        }
        if (body.baseRole && body.baseRole !== existing.baseRole) {
          await identityStore.syncRuleBaseRole(existing.id, body.baseRole)
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'role.update',
          targetId: existing.id,
          detail: { name: result.role.name },
        })
        return { data: roleView(result.role) }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/roles/:id',
      {
        preHandler: [requirePermission('roles:manage'), denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Delete a custom role',
          description:
            'Delete a custom role. Requires `roles:manage`. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `404` if it does not exist, `403` if it grants more than you hold, and `409` for a built-in role or one still in use — assigned to a user or named by an identity-provider role-mapping rule. Reassign those first. Writes a `role.delete` audit entry.',
          operationId: 'roles.delete',
          params: IdParam,
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const existing = await adminStore.getRole(request.params.id)
        if (!existing) return reply.status(404).send({ error: 'Role not found' })
        if (existing.isBuiltin) {
          return reply.status(409).send({ error: 'Built-in roles cannot be deleted' })
        }
        const refusal = roleGrantRefusal(await callerContext(request), existing)
        if (refusal) return reply.status(403).send({ error: refusal })
        const rules = await identityStore.countRulesForRole(existing.id)
        if (rules > 0) {
          return reply.status(409).send({
            error: `Role is in use by ${rules} identity-provider role-mapping rule(s); remove them first`,
          })
        }
        const result = await adminStore.deleteRole(existing.id)
        if (!result.ok) {
          if (result.reason === 'not_found')
            return reply.status(404).send({ error: 'Role not found' })
          if (result.reason === 'in_use') {
            return reply.status(409).send({
              error: `Role is assigned to ${result.users ?? 0} user(s); reassign them first`,
            })
          }
          return reply.status(409).send({ error: 'Built-in roles cannot be deleted' })
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'role.delete',
          targetId: existing.id,
        })
        return reply.status(204).send()
      },
    )

    fastify.put<{ Params: { id: string }; Body: z.infer<typeof AssignRoleBody> }>(
      '/api/users/:id/role',
      {
        preHandler: [requirePermission('users:manage')],
        schema: {
          tags: [TAG],
          summary: "Assign a console user's role",
          description:
            'Assign a built-in or custom role to a console user. `users.role` is set to the role’s base role in the same write. Requires `users:manage`. Returns `404` for an unknown user, `400` for an unknown role or an attempt to change your own role, `403` when either the new role or the user’s current role grants more than you hold, or the user sees tenants you cannot, and `409` when it would demote the last password-usable local admin. Permissions change within seconds; role-gated routes read the current base role from the database, not the sign-in token. Making a user an admin gives them every tenant: a tenant restriction is cleared (audited as `scopeCleared`). Writes a `user.role_assign` audit entry.',
          operationId: 'users.role.assign',
          params: IdParam,
          body: AssignRoleBody,
          response: {
            200: dataEnvelope(User),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const user = await adminStore.getUserById(request.params.id)
        if (!user) return reply.status(404).send({ error: 'User not found.' })
        if (user.id === request.jwtUser!.id) {
          return reply.status(400).send({ error: 'Cannot change your own role' })
        }
        const role = await adminStore.getRole(request.body.roleId)
        if (!role) return reply.status(400).send({ error: `Unknown role: ${request.body.roleId}` })

        const caller = await callerContext(request)
        const current = await currentRoleOf(user)
        const refusal =
          roleGrantRefusal(caller, role) ?? (current ? roleGrantRefusal(caller, current) : null)
        if (refusal) return reply.status(403).send({ error: refusal })
        const scopeBefore = await adminStore.getUserScope(user.id)
        if (scopeBefore && !targetWithinCaller(caller, scopeBefore)) {
          return reply.status(403).send({ error: 'This user sees tenants outside your own scope' })
        }
        // Moving a full built-in admin to anything else — a lower base role or
        // a custom role on an admin base — removes it from the break-glass pool.
        if (user.role === 'admin' && !user.role_id && role.id !== 'admin') {
          try {
            await assertBreakGlassPreserved(adminStore, identityStore, user.id)
          } catch (err) {
            if (err instanceof BreakGlassError)
              return reply.status(409).send({ error: err.message })
            throw err
          }
        }

        const updated = (await adminStore.assignUserRole(user.id, role.id))!
        const scopeCleared = role.baseRole === 'admin' && scopeBefore?.mode === 'restricted'
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'user.role_assign',
          targetId: user.id,
          detail: {
            roleId: role.id,
            baseRole: role.baseRole,
            ...(scopeCleared ? { scopeCleared: true } : {}),
          },
        })
        return {
          data: {
            id: updated.id,
            username: updated.username,
            role: updated.role,
            roleId: role.id,
            roleName: role.name,
            scopeMode: updated.role === 'admin' ? 'all' : (updated.scope_mode ?? 'all'),
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
          },
        }
      },
    )

    fastify.put<{ Params: { id: string }; Body: z.infer<typeof SetScopeBody> }>(
      '/api/users/:id/scope',
      {
        preHandler: [requirePermission('users:manage')],
        schema: {
          tags: [TAG],
          summary: "Set a console user's tenant scope",
          description:
            'Restrict a console user to specific tenants (optionally specific verticals within them), or give them every tenant with `mode: "all"`. Requires `users:manage`. A restricted user sees only granted tenants’ connections, sync jobs and tenants, gets `404` for anything else, and is refused (`403 SCOPE_RESTRICTED`) on surfaces that are not tenant-scoped yet. An admin cannot be restricted (`400`): admins always have every tenant. Returns `404` for an unknown user, `400` for an unknown tenant, and `403` when either the requested scope or the user’s current one reaches beyond yours. Takes effect within seconds. Writes a `user.scope_update` audit entry.',
          operationId: 'users.scope.update',
          params: IdParam,
          body: SetScopeBody,
          response: {
            200: dataEnvelope(UserScopeView),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const user = await adminStore.getUserById(request.params.id)
        if (!user) return reply.status(404).send({ error: 'User not found.' })
        if (user.role === 'admin' && request.body.mode === 'restricted') {
          return reply.status(400).send({
            error: 'Admins always have every tenant. Give this user a non-admin role before restricting them.',
          })
        }
        const body = request.body
        const grants: ScopeGrant[] = body.mode === 'restricted' ? (body.grants ?? []) : []
        const unknown = await unknownTenants(grants)
        if (unknown.length > 0) {
          return reply.status(400).send({ error: `Unknown tenant(s): ${unknown.join(', ')}` })
        }
        const caller = await callerContext(request)
        if (!callerMayGrantScope(caller, { mode: body.mode, grants })) {
          return reply
            .status(403)
            .send({ error: 'You cannot grant tenants outside your own scope' })
        }
        const current = await adminStore.getUserScope(user.id)
        if (current && !targetWithinCaller(caller, current)) {
          return reply.status(403).send({ error: 'This user sees tenants outside your own scope' })
        }
        const scope = (await adminStore.setUserScope(
          user.id,
          { mode: body.mode, grants },
          body.source ?? 'manual',
        ))!
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'user.scope_update',
          targetId: user.id,
          detail: { mode: scope.mode, tenantIds: scope.grants.map((g) => g.tenantId) },
        })
        return { data: scope }
      },
    )
  }
}
