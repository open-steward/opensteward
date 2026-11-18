/**
 * SCIM 2.0 server (/scim/v2) — IdP-driven provisioning of admin users and
 * groups. Authenticated by a per-provider SCIM bearer token (NOT the admin
 * JWT). Writes through to the local users + identity_links tables; group
 * membership feeds the same role-mapping engine used at login.
 */
import bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import type { FastifyInstance, FastifyReply } from 'fastify'
// Pulls `rateLimit` into FastifyContextConfig via TS augmentation.
import '@fastify/rate-limit'
import { z } from 'zod'
import type { AdminStore } from '../db/admin-store'
import type { IdentityStore, IdentityLinkRow } from '../db/identity-store'
import type { Config } from '../../config'
import { makeScimAuth, scimError } from '../auth/scim-auth'
import { assertBreakGlassPreserved, BreakGlassError } from '../auth/idp/break-glass'
import { resolveRoleAssignment } from '../auth/idp/role-mapping'
import { applyIdpMapping } from '../auth/idp/jit-provisioning'
import {
  ScimUserSchema,
  ScimGroupSchema,
  ScimPatchSchema,
  toScimUser,
  toScimGroup,
  listResponse,
  parseEqFilter,
  pickEmail,
  pickPhoto,
  pickDisplayName,
  type ScimUserView,
} from '../auth/idp/scim-schema'
import { IdpProfileSync } from '../auth/idp/profile-sync'
import { noContent } from './_openapi'

const TAG = 'scim'

// SCIM payloads are opaque to OpenAPI — they conform to RFC 7644 schemas
// defined by the IdP. We model them as a passthrough object with a
// stable component id so consumers see `ScimResource` instead of the
// anonymous inline `additionalProp` blob.
const Scim = z.object({}).loose().meta({ id: 'ScimResource', description: 'A SCIM 2.0 resource (User or Group); an open object whose fields follow the SCIM schema for the endpoint.' })

const IdParam = z.object({ id: z.string() })
const FilterQuery = z.object({
  filter: z.string().optional(),
  startIndex: z.string().optional(),
  count: z.string().optional(),
})

export function createScimRoutes(
  adminStore: AdminStore,
  identityStore: IdentityStore,
  config: Config,
  opts: { profileSync?: IdpProfileSync } = {},
) {
  const base = config.sso.publicBaseUrl.replace(/\/$/, '')
  const userLocation = (id: string) => `${base}/scim/v2/Users/${id}`
  const groupLocation = (id: string) => `${base}/scim/v2/Groups/${id}`
  // Built lazily so a default instance can log through Fastify's logger.
  let profileSync = opts.profileSync

  async function linkToView(link: IdentityLinkRow): Promise<ScimUserView | null> {
    const user = await adminStore.getUserById(link.userId)
    if (!user) return null
    return {
      id: user.id,
      externalId: link.externalId,
      userName: user.username,
      displayName: null,
      email: user.email ?? null,
      active: true,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    }
  }

  /** Recompute a SCIM-provisioned user's role — and, when the IdP owns it,
   *  tenant scope — from current group membership. */
  async function recomputeRole(providerId: string, userId: string): Promise<void> {
    const provider = await identityStore.getProvider(providerId)
    if (!provider) return
    const user = await adminStore.getUserById(userId)
    if (!user) return
    const groups = await identityStore.groupsForUser(providerId, userId)
    await applyIdpMapping(adminStore, identityStore, provider, user, { groups })
  }

  /** Remove a SCIM-managed user (deprovision). Break-glass guarded. */
  async function deprovision(reply: FastifyReply, providerId: string, userId: string): Promise<boolean> {
    try {
      await assertBreakGlassPreserved(adminStore, identityStore, userId)
    } catch (err) {
      if (err instanceof BreakGlassError) {
        void scimError(reply, 409, err.message)
        return false
      }
      throw err
    }
    for (const l of await identityStore.listLinksForUser(userId)) await identityStore.deleteLink(l.id)
    await adminStore.deleteUser(userId)
    await adminStore.writeAudit('scim', 'sso.scim.deprovision', undefined, userId, { providerId })
    return true
  }

  return async function scimRoutes(fastify: FastifyInstance): Promise<void> {
    const sync = (profileSync ??= new IdpProfileSync(adminStore, { logger: fastify.log }))
    fastify.addHook('preHandler', makeScimAuth(identityStore))
    // Generous limit — IdPs sync in bursts.
    const RATE = { config: { rateLimit: { max: 240, timeWindow: 60_000 } } }

    // ── Discovery ──
    fastify.get(
      '/scim/v2/ServiceProviderConfig',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 ServiceProviderConfig discovery doc',
          description:
            'SCIM 2.0 `ServiceProviderConfig` discovery document advertising the supported features. Authenticated by a per-provider SCIM bearer token (not the admin JWT); returns `401` if the token is missing or invalid. Called by IdPs during SCIM setup.',
          operationId: 'scim.service-provider-config',
          response: { 200: Scim },
          security: [],
        },
      },
      async (_req, reply) => {
        return reply.header('content-type', 'application/scim+json').send({
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
          patch: { supported: true },
          bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
          filter: { supported: true, maxResults: 200 },
          changePassword: { supported: false },
          sort: { supported: false },
          etag: { supported: false },
          authenticationSchemes: [
            { name: 'OAuth Bearer Token', description: 'Bearer token', type: 'oauthbearertoken', primary: true },
          ],
        })
      },
    )

    // ── Users ──
    fastify.get<{ Querystring: { filter?: string; startIndex?: string; count?: string } }>(
      '/scim/v2/Users',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 Users list',
          description:
            'List SCIM Users provisioned through the calling provider, supporting `filter` (e.g. `userName eq`) and `startIndex`/`count` pagination per RFC 7644. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Driven by the IdP, not the admin UI.',
          operationId: 'scim.users.list',
          querystring: FilterQuery,
          response: { 200: Scim },
          security: [],
        },
      },
      async (request, reply) => {
        const providerId = request.scimProviderId!
        const links = await identityStore.listLinksForProvider(providerId)
        const eq = parseEqFilter(request.query.filter)
        const views = (await Promise.all(links.map(linkToView))).filter((v): v is ScimUserView => v !== null)
        const filtered = eq
          ? views.filter((v) =>
              eq.attr.toLowerCase() === 'username'
                ? v.userName === eq.value
                : eq.attr.toLowerCase() === 'externalid'
                  ? v.externalId === eq.value
                  : false,
            )
          : views
        const count = Math.min(Number(request.query.count ?? 200) || 200, 200)
        return reply
          .header('content-type', 'application/scim+json')
          .send(listResponse(filtered.slice(0, count).map((v) => toScimUser(v, userLocation(v.id))), filtered.length))
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/scim/v2/Users/:id',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 User read',
          description:
            'Read one SCIM User by id. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the user is not provisioned through this provider.',
          operationId: 'scim.users.get',
          params: IdParam,
          response: { 200: Scim },
          security: [],
        },
      },
      async (request, reply) => {
        const link = (await identityStore.listLinksForProvider(request.scimProviderId!)).find(
          (l) => l.userId === request.params.id,
        )
        const view = link ? await linkToView(link) : null
        if (!view) return scimError(reply, 404, 'User not found')
        return reply.header('content-type', 'application/scim+json').send(toScimUser(view, userLocation(view.id)))
      },
    )

    fastify.post(
      '/scim/v2/Users',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 User create (provision)',
          description:
            'Provision a new admin user from a SCIM User resource, creating the local account and identity link. Authenticated by the per-provider SCIM bearer token (`401` if invalid). The user\'s role is derived from group membership via the provider\'s role-mapping rules. Writes a SCIM provisioning audit entry.',
          operationId: 'scim.users.create',
          body: Scim,
          response: { 201: Scim, 400: Scim, 404: Scim, 409: Scim },
          security: [],
        },
      },
      async (request, reply) => {
        const providerId = request.scimProviderId!
        const provider = await identityStore.getProvider(providerId)
        if (!provider) return scimError(reply, 404, 'Provider not found')
        const parsed = ScimUserSchema.safeParse(request.body ?? {})
        if (!parsed.success) return scimError(reply, 400, parsed.error.issues[0]?.message ?? 'Invalid user')
        const externalId = parsed.data.externalId ?? parsed.data.userName

        const existing = await identityStore.findLink(providerId, externalId)
        if (existing) {
          const view = await linkToView(existing)
          if (view) return reply.status(409).header('content-type', 'application/scim+json').send(toScimUser(view, userLocation(view.id)))
        }
        if (await adminStore.getUserByUsername(parsed.data.userName)) {
          return scimError(reply, 409, 'userName already exists')
        }
        const { role } = resolveRoleAssignment(await identityStore.listRules(providerId), { groups: [] }, provider.defaultRole)
        const hash = await bcrypt.hash(randomBytes(32).toString('hex'), 12)
        // The IdP owns a SCIM user's scope, exactly as for a JIT user.
        const created = await adminStore.createUser(parsed.data.userName, hash, role, { scopeSource: 'idp' })
        await applyIdpMapping(adminStore, identityStore, provider, created, { groups: [] })
        const user = (await adminStore.getUserById(created.id)) ?? created
        await identityStore.createLink({ providerId, externalId, userId: user.id, scimManaged: true })
        // `emails` (primary, else first) and `photos` (photo, else thumbnail);
        // the picture is fetched in the background behind the SSRF guard.
        await sync.apply(user.id, { email: pickEmail(parsed.data), pictureUrl: pickPhoto(parsed.data) })
        await adminStore.writeAudit('scim', 'sso.scim.provision', undefined, user.id, { providerId })
        const view: ScimUserView = {
          id: user.id,
          externalId,
          userName: user.username,
          displayName: pickDisplayName(parsed.data),
          email: pickEmail(parsed.data),
          active: true,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        }
        return reply.status(201).header('content-type', 'application/scim+json').send(toScimUser(view, userLocation(view.id)))
      },
    )

    // Replace — primarily used to flip `active`.
    fastify.put<{ Params: { id: string } }>(
      '/scim/v2/Users/:id',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 User replace',
          description:
            'Replace a SCIM User resource (PUT). Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the user is not provisioned through this provider. Setting `active: false` deprovisions the user, subject to the break-glass guard.',
          operationId: 'scim.users.replace',
          params: IdParam,
          body: Scim,
          response: { 200: Scim },
          security: [],
        },
      },
      async (request, reply) => {
        const providerId = request.scimProviderId!
        const link = (await identityStore.listLinksForProvider(providerId)).find((l) => l.userId === request.params.id)
        if (!link) return scimError(reply, 404, 'User not found')
        const parsed = ScimUserSchema.safeParse(request.body ?? {})
        if (!parsed.success) return scimError(reply, 400, parsed.error.issues[0]?.message ?? 'Invalid user')
        if (parsed.data.active === false) {
          if (!(await deprovision(reply, providerId, request.params.id))) return reply
          return reply.status(200).header('content-type', 'application/scim+json').send({
            schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
            id: request.params.id,
            active: false,
          })
        }
        // A replace refreshes an IdP-owned email and picture. An attribute
        // the payload leaves out is left alone rather than cleared: an admin's
        // console edits and a picture from another sign-in path outlive it.
        await sync.apply(request.params.id, {
          email: pickEmail(parsed.data),
          pictureUrl: pickPhoto(parsed.data),
        })
        const view = (await linkToView(link))!
        return reply.header('content-type', 'application/scim+json').send(toScimUser(view, userLocation(view.id)))
      },
    )

    fastify.patch<{ Params: { id: string } }>(
      '/scim/v2/Users/:id',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 User patch (PatchOp)',
          description:
            'Apply a SCIM `PatchOp` to a User (e.g. toggle `active` to deactivate). Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the user is unknown; deactivation deprovisions the account, subject to the break-glass guard.',
          operationId: 'scim.users.patch',
          params: IdParam,
          body: Scim,
          response: { 200: Scim },
          security: [],
        },
      },
      async (request, reply) => {
        const providerId = request.scimProviderId!
        const link = (await identityStore.listLinksForProvider(providerId)).find((l) => l.userId === request.params.id)
        if (!link) return scimError(reply, 404, 'User not found')
        const parsed = ScimPatchSchema.safeParse(request.body ?? {})
        if (!parsed.success) return scimError(reply, 400, 'Invalid PatchOp')
        let active = true
        for (const op of parsed.data.Operations) {
          if ((op.op === 'replace' || op.op === 'add') && isActiveOp(op.path, op.value)) {
            active = activeValue(op.path, op.value)
          }
        }
        if (!active) {
          if (!(await deprovision(reply, providerId, request.params.id))) return reply
          return reply.status(200).header('content-type', 'application/scim+json').send({
            schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
            id: request.params.id,
            active: false,
          })
        }
        const change = profileFromPatch(parsed.data.Operations)
        if (change.removeEmail) await sync.clearIdpEmail(request.params.id)
        if (change.removePhotos) await sync.removeIdpAvatar(request.params.id)
        if (change.email || change.pictureUrl) {
          await sync.apply(request.params.id, { email: change.email, pictureUrl: change.pictureUrl })
        }
        const view = (await linkToView(link))!
        return reply.header('content-type', 'application/scim+json').send(toScimUser(view, userLocation(view.id)))
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/scim/v2/Users/:id',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 User delete (deprovision)',
          description:
            'Deprovision (delete) a SCIM User, removing the local account and its identity links. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `409` if deletion would leave no break-glass admin. Writes an `sso.scim.deprovision` audit entry.',
          operationId: 'scim.users.delete',
          params: IdParam,
          response: { 204: noContent },
          security: [],
        },
      },
      async (request, reply) => {
        const providerId = request.scimProviderId!
        const link = (await identityStore.listLinksForProvider(providerId)).find((l) => l.userId === request.params.id)
        if (!link) return scimError(reply, 404, 'User not found')
        if (!(await deprovision(reply, providerId, request.params.id))) return reply
        return reply.status(204).send()
      },
    )

    // ── Groups ──
    fastify.get<{ Querystring: { filter?: string } }>(
      '/scim/v2/Groups',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 Groups list',
          description:
            'List SCIM Groups for the calling provider, with optional `filter` support per RFC 7644. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Group membership feeds the same role-mapping engine used at login.',
          operationId: 'scim.groups.list',
          querystring: FilterQuery,
          response: { 200: Scim },
          security: [],
        },
      },
      async (request, reply) => {
        const providerId = request.scimProviderId!
        const eq = parseEqFilter(request.query.filter)
        let groups = await identityStore.listScimGroups(providerId)
        if (eq && eq.attr.toLowerCase() === 'displayname') groups = groups.filter((g) => g.displayName === eq.value)
        return reply
          .header('content-type', 'application/scim+json')
          .send(listResponse(groups.map((g) => toScimGroup(g, groupLocation(g.id)))))
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/scim/v2/Groups/:id',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 Group read',
          description:
            'Read one SCIM Group by id, including its members. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the group does not exist for this provider.',
          operationId: 'scim.groups.get',
          params: IdParam,
          response: { 200: Scim },
          security: [],
        },
      },
      async (request, reply) => {
        const group = await identityStore.getScimGroup(request.params.id, request.scimProviderId!)
        if (!group) return scimError(reply, 404, 'Group not found')
        return reply.header('content-type', 'application/scim+json').send(toScimGroup(group, groupLocation(group.id)))
      },
    )

    fastify.post(
      '/scim/v2/Groups',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 Group create',
          description:
            'Create a SCIM Group for the calling provider. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Membership changes recompute affected users\' roles via the provider\'s role-mapping rules.',
          operationId: 'scim.groups.create',
          body: Scim,
          response: { 201: Scim },
          security: [],
        },
      },
      async (request, reply) => {
        const providerId = request.scimProviderId!
        const parsed = ScimGroupSchema.safeParse(request.body ?? {})
        if (!parsed.success) return scimError(reply, 400, parsed.error.issues[0]?.message ?? 'Invalid group')
        const members = (parsed.data.members ?? []).map((m) => m.value)
        const group = await identityStore.createScimGroup(providerId, parsed.data.displayName, members)
        for (const uid of members) await recomputeRole(providerId, uid)
        await adminStore.writeAudit('scim', 'sso.scim.group.create', undefined, group.id, { providerId })
        return reply.status(201).header('content-type', 'application/scim+json').send(toScimGroup(group, groupLocation(group.id)))
      },
    )

    fastify.patch<{ Params: { id: string } }>(
      '/scim/v2/Groups/:id',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 Group patch',
          description:
            'Apply a SCIM `PatchOp` to a Group, typically to add or remove members. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the group is unknown; membership changes recompute affected users\' roles.',
          operationId: 'scim.groups.patch',
          params: IdParam,
          body: Scim,
          response: { 200: Scim },
          security: [],
        },
      },
      async (request, reply) => {
        const providerId = request.scimProviderId!
        const group = await identityStore.getScimGroup(request.params.id, providerId)
        if (!group) return scimError(reply, 404, 'Group not found')
        const parsed = ScimPatchSchema.safeParse(request.body ?? {})
        if (!parsed.success) return scimError(reply, 400, 'Invalid PatchOp')
        const members = new Set(group.members)
        const touched = new Set<string>()
        for (const op of parsed.data.Operations) {
          const vals = extractMemberValues(op.value)
          vals.forEach((v) => touched.add(v))
          if (op.op === 'add') vals.forEach((v) => members.add(v))
          else if (op.op === 'remove') {
            if (vals.length === 0 && op.path && /members/i.test(op.path)) members.clear()
            else vals.forEach((v) => members.delete(v))
          } else if (op.op === 'replace' && (!op.path || /members/i.test(op.path))) {
            group.members.forEach((m) => touched.add(m))
            members.clear()
            vals.forEach((v) => members.add(v))
          }
        }
        const updated = await identityStore.updateScimGroup(request.params.id, providerId, { members: [...members] })
        for (const uid of touched) await recomputeRole(providerId, uid)
        await adminStore.writeAudit('scim', 'sso.scim.group.update', undefined, request.params.id, { providerId })
        return reply
          .header('content-type', 'application/scim+json')
          .send(toScimGroup(updated!, groupLocation(request.params.id)))
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/scim/v2/Groups/:id',
      {
        ...RATE,
        schema: {
          tags: [TAG],
          summary: 'SCIM 2.0 Group delete',
          description:
            'Delete a SCIM Group. Authenticated by the per-provider SCIM bearer token (`401` if invalid). Returns `404` if the group does not exist; removing it recomputes the roles of its former members.',
          operationId: 'scim.groups.delete',
          params: IdParam,
          response: { 204: noContent },
          security: [],
        },
      },
      async (request, reply) => {
        const providerId = request.scimProviderId!
        const group = await identityStore.getScimGroup(request.params.id, providerId)
        if (!group) return scimError(reply, 404, 'Group not found')
        await identityStore.deleteScimGroup(request.params.id, providerId)
        for (const uid of group.members) await recomputeRole(providerId, uid)
        await adminStore.writeAudit('scim', 'sso.scim.group.delete', undefined, request.params.id, { providerId })
        return reply.status(204).send()
      },
    )
  }
}

function isActiveOp(path: string | undefined, value: unknown): boolean {
  if (path && path.toLowerCase() === 'active') return true
  return typeof value === 'object' && value !== null && 'active' in (value as Record<string, unknown>)
}

function activeValue(path: string | undefined, value: unknown): boolean {
  if (path && path.toLowerCase() === 'active') {
    if (typeof value === 'boolean') return value
    if (typeof value === 'string') return value !== 'false'
    return true
  }
  const v = (value as Record<string, unknown>)?.active
  return typeof v === 'boolean' ? v : v !== 'false'
}

/**
 * The `emails` / `photos` changes a User PatchOp carries, in the shapes IdPs
 * send them: `{ path: 'emails', value: [...] }`, a filtered sub-attribute
 * (`emails[type eq "work"].value` — Entra ID), and a path-less value object
 * holding either form as keys. `remove` of either attribute is reported
 * separately; it only ever drops IdP-owned data.
 */
export function profileFromPatch(ops: ReadonlyArray<{ op: string; path?: string; value?: unknown }>): {
  email?: string
  pictureUrl?: string
  removeEmail: boolean
  removePhotos: boolean
} {
  const out: { email?: string; pictureUrl?: string; removeEmail: boolean; removePhotos: boolean } = {
    removeEmail: false,
    removePhotos: false,
  }
  const asEntries = (v: unknown) =>
    (Array.isArray(v) ? v : [v])
      .map((e) => (typeof e === 'string' ? { value: e } : e))
      .filter(
        (e): e is { value: string; primary?: boolean; type?: string } =>
          typeof e === 'object' && e !== null && typeof (e as { value?: unknown }).value === 'string',
      )
  const take = (attrPath: string, value: unknown) => {
    const p = attrPath.toLowerCase()
    if (p.startsWith('emails')) {
      const email = pickEmail({ emails: asEntries(value) })
      if (email) out.email = email
    } else if (p.startsWith('photos')) {
      const photo = pickPhoto({ photos: asEntries(value) })
      if (photo) out.pictureUrl = photo
    }
  }
  for (const op of ops) {
    if (op.op === 'remove') {
      const p = (op.path ?? '').toLowerCase()
      if (p.startsWith('emails')) out.removeEmail = true
      if (p.startsWith('photos')) out.removePhotos = true
      continue
    }
    if (op.op !== 'replace' && op.op !== 'add') continue
    if (op.path) {
      take(op.path, op.value)
    } else if (typeof op.value === 'object' && op.value !== null && !Array.isArray(op.value)) {
      for (const [k, v] of Object.entries(op.value as Record<string, unknown>)) take(k, v)
    }
  }
  return out
}

function extractMemberValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((m) => (typeof m === 'object' && m !== null ? (m as { value?: unknown }).value : m))
      .filter((v): v is string => typeof v === 'string')
  }
  if (typeof value === 'object' && value !== null) {
    const members = (value as { members?: unknown }).members
    if (Array.isArray(members)) return extractMemberValues(members)
    const single = (value as { value?: unknown }).value
    if (typeof single === 'string') return [single]
  }
  return []
}
