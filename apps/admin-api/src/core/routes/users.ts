import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { createUser, resetPassword } from '../auth/users'
import { validatePassword } from '@opensteward/shared'
import type { AdminStore } from '../db/admin-store'
import type { IdentityStore } from '../db/identity-store'
import { assertBreakGlassPreserved, BreakGlassError, isLocalAdmin } from '../auth/idp/break-glass'
import { SETTING } from '@opensteward/shared'
import type { RuntimeSettingsStore } from '../db/runtime-settings-store'
import { BUILTIN_ROLE_PERMISSIONS } from '@opensteward/shared'
import { callerContext, callerMayGrantScope, roleGrantRefusal } from '../auth/access'
import { EmailAddress } from '../users/email'
import { profileFields } from '../users/profile-view'
import { UserAvatarStore } from '../db/user-avatar-store'
import {
  RoleEnum,
  User,
  UserDetail,
  dataEnvelope,
  listEnvelope,
  errorBody,
  noContent,
} from './_openapi'

const TAG = 'users'

const CreateBody = z
  .object({
    username: z
      .string()
      .min(1)
      .max(64)
      .meta({
        description: 'Login name for the new admin user; unique within the deployment.',
        example: 'olivia.admin',
      }),
    password: z
      .string()
      .min(1)
      .meta({ description: 'Initial password for the new user.', example: 's3cr3t-password' }),
    role: RoleEnum.meta({
      description: 'Access level to grant: `admin`, `operator`, or `viewer`.',
      example: 'admin',
    }),
    email: EmailAddress.nullable()
      .optional()
      .meta({
        description:
          'Optional email address. Set here it is owned by the console (`emailSource: manual`) and SSO never overwrites it.',
        example: 'olivia@northwind.example',
      }),
  })
  .meta({ id: 'CreateUserBody', description: 'Request body to create an admin-console user.' })

const CreatedUser = z
  .object({
    id: z
      .string()
      .meta({
        description: 'Identifier assigned to the new user (prefix `usr_`).',
        example: 'usr_olivia',
      }),
    username: z
      .string()
      .meta({ description: 'Login name of the created user.', example: 'olivia.admin' }),
    role: RoleEnum.meta({
      description: 'Access level granted to the created user.',
      example: 'admin',
    }),
    email: z
      .string()
      .nullable()
      .optional()
      .meta({ description: 'Email address, or null when none was given.', example: 'olivia@northwind.example' }),
  })
  .meta({ id: 'CreatedUser', description: 'The newly created user (without credentials).' })

const UpdateBody = z
  .object({
    role: RoleEnum.optional().meta({
      description: 'New role for the account.',
      example: 'operator',
    }),
    password: z
      .string()
      .min(1)
      .optional()
      .meta({
        description: 'New password for the account (policy-checked).',
        example: 'fresh-s3cr3t-password',
      }),
    email: EmailAddress.nullable()
      .optional()
      .meta({
        description:
          'New email address, or `null` to clear it. An address set here is owned by the console (`emailSource: manual`): SSO sign-ins and SCIM no longer overwrite it. Clearing it hands ownership back, so the next SSO sign-in may fill it from the identity provider.',
        example: 'olivia@northwind.example',
      }),
  })
  .refine((b) => b.role !== undefined || b.password !== undefined || b.email !== undefined, {
    message: 'supply role, password and/or email',
  })
  .meta({ id: 'UpdateUserBody', description: 'Request body to update a console account.' })

const IdParam = z.object({ id: z.string() })

export function createUsersRoutes(
  adminStore: AdminStore,
  identityStore: IdentityStore,
  runtimeSettings?: RuntimeSettingsStore,
) {
  const avatarStore = UserAvatarStore.for(adminStore)

  return async function usersRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)
    fastify.addHook('preHandler', fastify.adminOnly)

    fastify.get(
      '/api/users',
      {
        schema: {
          tags: [TAG],
          summary: 'List admin / operator / viewer accounts',
          description:
            'List all admin-console user accounts with their roles and timestamps. Admin role required. Credentials are never returned.',
          operationId: 'users.list',
          response: {
            200: listEnvelope(User),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async () => {
        const users = await adminStore.listUsers()
        const roleNames = new Map((await adminStore.listRoles()).map((r) => [r.id, r.name]))
        // One metadata query for every row's picture version — no blobs read.
        const avatars = await avatarStore.versions()
        const data = users.map((u) => ({
          id: u.id,
          username: u.username,
          ...profileFields(u, avatars.get(u.id)),
          role: u.role,
          roleId: u.role_id ?? u.role,
          roleName: roleNames.get(u.role_id ?? u.role) ?? u.role_id ?? u.role,
          scopeMode: u.role === 'admin' ? 'all' : (u.scope_mode ?? 'all'),
          createdAt: u.created_at,
          updatedAt: u.updated_at,
        }))
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.get<{ Params: { id: string }; Querystring: { include_identity?: string } }>(
      '/api/users/:id',
      {
        schema: {
          tags: [TAG],
          summary: 'Get one console account',
          description:
            'Read one console account with its identity-provider links and break-glass status. Admin role required. Pass `include_identity=true` to reveal each link’s `externalId` — the subject this account maps to in the identity provider, which is typically a work email. That privileged path writes a `user.pii_reveal` audit entry; without the flag the field is absent, not masked.',
          operationId: 'users.get',
          params: IdParam,
          response: {
            200: dataEnvelope(UserDetail),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const user = await adminStore.getUserById(request.params.id)
        if (!user) return reply.status(404).send({ error: 'User not found.' })

        const includeIdentity = request.query.include_identity === 'true'
        if (includeIdentity) {
          // Awaited, and only after the 404 — the end-user equivalent does
          // neither, so a reveal of an id that does not exist still writes a
          // row, and a failed audit write becomes an unhandled rejection.
          // An audit trail that records reveals which did not happen, and
          // silently drops ones that did, is worse than none.
          await adminStore.writeAudit({
            userId: request.jwtUser!.id,
            action: 'user.pii_reveal',
            targetId: request.params.id,
          })
        }

        const links = await identityStore.listLinksForUser(user.id)
        const providers = links.length ? await identityStore.listProviders() : []
        const nameFor = (id: string) => providers.find((p) => p.id === id)?.name ?? null

        const pinned = runtimeSettings
          ? String(
              (await runtimeSettings.get(SETTING.AUTH_BREAK_GLASS_USER_ID))?.value ?? '',
            ).trim()
          : ''

        const effectiveRole = await adminStore.getRole(user.role_id ?? user.role)
        const scope = await adminStore.getUserScope(user.id)
        const avatar = await avatarStore.head(user.id)
        return {
          data: {
            id: user.id,
            username: user.username,
            ...profileFields(user, avatar?.sha256),
            emailSource: user.email ? (user.email_source ?? 'manual') : null,
            avatarSource: avatar?.source ?? null,
            role: user.role,
            roleId: user.role_id ?? user.role,
            roleName: effectiveRole?.name ?? user.role_id ?? user.role,
            scope:
              user.role === 'admin'
                ? { mode: 'all', grants: [] }
                : { mode: scope?.mode ?? 'all', grants: scope?.grants ?? [] },
            scopeSource: scope?.source ?? 'manual',
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            links: links.map((l) => ({
              providerId: l.providerId,
              providerName: nameFor(l.providerId),
              // Absent unless asked for. Not masked — the field simply is not
              // there, which is what the end-user path actually does whatever
              // its "masked" copy claims.
              externalId: includeIdentity ? l.externalId : null,
              lastLoginAt: l.lastLoginAt,
              scimManaged: l.scimManaged,
            })),
            // Derived from links, never from the password hash: SCIM and JIT
            // accounts are given a hash of random bytes, so the hash cannot
            // distinguish "SSO-only" from "has a password".
            ssoOnly: links.length > 0,
            isLocalAdmin: await isLocalAdmin(adminStore, identityStore, user.id),
            isPinnedBreakGlass: pinned !== '' && pinned === user.id,
          },
        }
      },
    )

    fastify.post<{
      Body: { username: string; password: string; role: string; email?: string | null }
    }>(
      '/api/users',
      {
        schema: {
          tags: [TAG],
          summary: 'Create a new user account',
          description:
            'Create a new admin-console user with the given username, password, and role (`admin`, `operator`, or `viewer`), and optionally an email address. Admin role required. Returns `400` for a missing/invalid field (including a malformed email), an over-long username, or a password that fails policy, and `409` if the username is already taken. Writes a `user.create` audit entry, which records that an email was set but never the address.',
          operationId: 'users.create',
          body: CreateBody,
          response: {
            201: dataEnvelope(CreatedUser),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        const { username, password, role } = request.body ?? ({} as Record<string, string>)
        if (!username || !password || !role) {
          return reply.status(400).send({ error: 'username, password, and role are required' })
        }
        if (!['admin', 'operator', 'viewer'].includes(role)) {
          return reply.status(400).send({ error: 'Invalid role' })
        }
        if (username.length > 64) {
          return reply.status(400).send({ error: 'Username must be 64 characters or fewer' })
        }
        const pwCheck = validatePassword(password)
        if (!pwCheck.valid) {
          return reply.status(400).send({ error: pwCheck.error })
        }
        const typedRole = role as 'admin' | 'operator' | 'viewer'
        const caller = await callerContext(request)
        const refusal = roleGrantRefusal(caller, {
          permissions: BUILTIN_ROLE_PERMISSIONS[typedRole],
          baseRole: typedRole,
        })
        if (refusal) return reply.status(403).send({ error: refusal })

        // Already trimmed and validated by the body schema.
        const email = request.body?.email ?? null
        try {
          const user = await createUser(adminStore, username, password, typedRole, { email })
          await adminStore.writeAudit(request.jwtUser!.id, 'user.create', undefined, undefined, {
            username,
            // Validated against the role enum at line 81 above; the cast
            // is the same one applied to the createUser call.
            role: role as 'admin' | 'operator' | 'viewer',
            // A flag, never the address: the audit log is not a PII store.
            ...(email ? { emailSet: true } : {}),
          })
          return reply.status(201).send({
            data: { id: user.id, username: user.username, role: user.role, email: user.email ?? null },
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('UNIQUE')) {
            return reply.status(409).send({ error: 'Username already exists' })
          }
          throw err
        }
      },
    )

    fastify.patch<{
      Params: { id: string }
      Body: { role?: string; password?: string; email?: string | null }
    }>(
      '/api/users/:id',
      {
        schema: {
          tags: [TAG],
          summary: 'Change a console account\u2019s role, password and/or email',
          description:
            'Update an existing account in place, preserving the user id and any break-glass ' +
            'pin. Admin role required. Refuses changing your own role (`400`), a demotion that ' +
            'would leave no password-usable local admin (`409`), a password that fails ' +
            'policy (`400`), a malformed email (`400`), and any change to another account that ' +
            'holds more than you (`403`). An email set ' +
            'here is owned by the console and SSO no longer overwrites it; `null` clears it. ' +
            'Writes a `user.update` audit entry (neither the password nor the email address ' +
            'is ever recorded \u2014 only `passwordChanged` / `emailChanged` flags).',
          operationId: 'users.update',
          params: IdParam,
          body: UpdateBody,
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
        const body = request.body ?? {}
        const role = body.role
        const password = body.password
        // Trimmed and validated by the body schema; null clears.
        const email = body.email
        if (role === undefined && password === undefined && email === undefined) {
          return reply.status(400).send({ error: 'supply role, password and/or email' })
        }
        const user = await adminStore.getUserById(request.params.id)
        if (!user) return reply.status(404).send({ error: 'User not found.' })

        const emailChanged =
          email !== undefined &&
          ((email ?? null) !== (user.email ?? null) ||
            (email !== null && user.email_source !== 'manual'))
        // Whatever is changed (role, password or email), the account itself
        // must not hold more than the caller: otherwise a thin admin-based role
        // could reset a full admin's password and take the account over.
        if (user.id !== request.jwtUser?.id) {
          const holder = await adminStore.getRole(user.role_id ?? user.role)
          const targetRefusal = holder ? roleGrantRefusal(await callerContext(request), holder) : null
          if (targetRefusal) return reply.status(403).send({ error: targetRefusal })
        }

        if (role !== undefined) {
          if (!['admin', 'operator', 'viewer'].includes(role)) {
            return reply.status(400).send({ error: 'Invalid role' })
          }
          // Demoting yourself locks you out of the page you are on; deleting
          // yourself is refused for the same reason.
          if (request.params.id === request.jwtUser?.id && role !== 'admin') {
            return reply.status(400).send({ error: 'Cannot change your own role' })
          }
          // Neither the new built-in role nor the account's current one may
          // grant more than the caller holds, and the account must sit within
          // the caller's tenant scope.
          const caller = await callerContext(request)
          const typed = role as 'admin' | 'operator' | 'viewer'
          const current = await adminStore.getRole(user.role_id ?? user.role)
          const refusal =
            roleGrantRefusal(caller, { permissions: BUILTIN_ROLE_PERMISSIONS[typed], baseRole: typed }) ??
            (current ? roleGrantRefusal(caller, current) : null)
          if (refusal) return reply.status(403).send({ error: refusal })
          const targetScope = await adminStore.getUserScope(user.id)
          if (targetScope && !callerMayGrantScope(caller, targetScope)) {
            return reply.status(403).send({ error: 'This user sees tenants outside your own scope' })
          }
          // A demotion removes this account from the local-admin pool exactly
          // like deleting it would — same break-glass floor applies.
          if (user.role === 'admin' && role !== 'admin') {
            try {
              await assertBreakGlassPreserved(adminStore, identityStore, request.params.id)
            } catch (err) {
              if (err instanceof BreakGlassError)
                return reply.status(409).send({ error: err.message })
              throw err
            }
          }
        }
        if (password !== undefined) {
          const pwCheck = validatePassword(password)
          if (!pwCheck.valid) {
            return reply.status(400).send({ error: pwCheck.error })
          }
        }

        // `user.role_id` too: moving a custom-role holder to a built-in is a
        // change even when the base role stays the same.
        const scopeBefore =
          role !== undefined ? await adminStore.getUserScope(request.params.id) : null
        if (role !== undefined && (role !== user.role || user.role_id)) {
          await adminStore.setUserRole(request.params.id, role as 'admin' | 'operator' | 'viewer')
        }
        if (password !== undefined) {
          await resetPassword(adminStore, request.params.id, password)
        }
        if (emailChanged) {
          // An admin's address is `manual` from now on: SSO stops overwriting it.
          await adminStore.setUserEmail(request.params.id, email ?? null, 'manual')
        }
        await adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'user.update',
          targetId: request.params.id,
          detail: {
            // A flag, never the address: the audit log is not a PII store.
            ...(emailChanged ? { emailChanged: true } : {}),
            ...(role !== undefined && role !== user.role ? { role } : {}),
            ...(role === 'admin' && user.role !== 'admin' && scopeBefore?.mode === 'restricted'
              ? { scopeCleared: true }
              : {}),
            ...(password !== undefined ? { passwordChanged: true } : {}),
          },
        })
        const updated = (await adminStore.getUserById(request.params.id))!
        return {
          data: {
            id: updated.id,
            username: updated.username,
            email: updated.email ?? null,
            role: updated.role,
            createdAt: updated.created_at,
            updatedAt: updated.updated_at,
          },
        }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/users/:id',
      {
        schema: {
          tags: [TAG],
          summary: 'Delete a user account',
          description:
            'Delete a user account and any linked SSO identities. Admin role required. Returns `400` if you attempt to delete your own account, `409` if removing this user would leave no break-glass admin, and `404` if no user matches the id. Writes a `user.delete` audit entry.',
          operationId: 'users.delete',
          params: IdParam,
          response: {
            204: noContent,
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
            409: errorBody,
          },
        },
      },
      async (request, reply) => {
        if (request.params.id === request.jwtUser?.id) {
          return reply.status(400).send({ error: 'Cannot delete your own account' })
        }
        const target = await adminStore.getUserById(request.params.id)
        if (target) {
          const caller = await callerContext(request)
          const targetRole = await adminStore.getRole(target.role_id ?? target.role)
          const refusal = targetRole ? roleGrantRefusal(caller, targetRole) : null
          if (refusal) return reply.status(403).send({ error: refusal })
          const targetScope = await adminStore.getUserScope(target.id)
          if (targetScope && !callerMayGrantScope(caller, targetScope)) {
            return reply.status(403).send({ error: 'This user sees tenants outside your own scope' })
          }
        }
        try {
          await assertBreakGlassPreserved(adminStore, identityStore, request.params.id)
        } catch (err) {
          if (err instanceof BreakGlassError) return reply.status(409).send({ error: err.message })
          throw err
        }
        await identityStore.deleteLinksForUser(request.params.id)
        const ok = await adminStore.deleteUser(request.params.id)
        if (!ok) return reply.status(404).send({ error: 'User not found' })
        await adminStore.writeAudit(
          request.jwtUser!.id,
          'user.delete',
          undefined,
          request.params.id,
        )
        return reply.status(204).send()
      },
    )
  }
}
