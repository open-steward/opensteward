import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { AdminStore } from '../db/admin-store'
import { denyRestrictedScope } from '../auth/access'
import {
  ScopeGroup,
  dataEnvelope,
  listEnvelope,
  errorBody,
  noContent,
  PlatformSlugSchema,
  VerticalEnum,
} from './_openapi'

const TAG = 'scope-groups'

const ListQuery = z.object({
  vertical: VerticalEnum.optional(),
  platform: PlatformSlugSchema.optional(),
})

// `scopes` is accepted as either an array of strings OR a
// whitespace/comma-separated string. The schema documents both shapes;
// the handler normalises to a deduped `string[]` before persisting.
const ScopeInput = z.union([
  z.array(z.string().meta({ description: 'A single platform scope/permission.', example: 'accounting.transactions.read' })).meta({ description: 'Scopes as an explicit array of strings.', example: ['accounting.transactions.read'] }),
  z.string().meta({ description: 'Scopes as a single whitespace/comma-separated string; normalised to an array server-side.', example: 'accounting.transactions.read' }),
]).meta({ id: 'ScopeInput', description: 'Scopes accepted either as a string array or a delimited string; normalised to a deduped array on save.' })

const CreateBody = z.object({
  vertical: z.string().min(1).meta({ description: 'Vertical the scope group applies to.', example: 'accounting' }),
  platform: z.string().min(1).meta({ description: 'Platform slug the scope group applies to.', example: 'xero' }),
  name: z.string().min(1).meta({ description: 'Human-friendly label for the scope group.', example: 'Accounting read' }),
  scopes: ScopeInput.meta({ description: 'Scopes included in the group.' }),
}).meta({ id: 'CreateScopeGroupBody', description: 'Request body to create a named scope group.' })

const UpdateBody = z.object({
  name: z.string().min(1).optional().meta({ description: 'New label for the scope group.', example: 'Accounting read' }),
  scopes: ScopeInput.optional().meta({ description: 'Replacement set of scopes for the group.' }),
}).meta({ id: 'UpdateScopeGroupBody', description: 'Request body to update a scope group; omitted fields are left unchanged.' })

const IdParam = z.object({ id: z.string() })

export function createScopeGroupsRoutes(adminStore: AdminStore) {
  return async function scopeGroupsRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('preHandler', fastify.authenticate)

    fastify.get<{ Querystring: { vertical?: string; platform?: string } }>(
      '/api/scope-groups',
      {
        schema: {
          tags: [TAG],
          summary: 'List scope groups',
          description:
            'List named scope groups (reusable bundles of platform permissions), optionally filtered by `vertical` and/or `platform`. Any authenticated operator.',
          operationId: 'scope-groups.list',
          querystring: ListQuery,
          response: {
            200: listEnvelope(ScopeGroup),
            401: errorBody,
          },
        },
      },
      async (request) => {
        const { vertical, platform } = request.query
        const data = await adminStore.listScopeGroups({ vertical, platform })
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.post<{ Body: { vertical?: string; platform?: string; name?: string; scopes?: unknown } }>(
      '/api/scope-groups',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Create a scope group',
          description:
            'Create a named scope group for a vertical/platform. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Scopes may be supplied as an array or a delimited string and are normalised to a deduped array. Returns `400` if `vertical`, `platform`, `name`, or a non-empty scope set is missing, and `409` if a group with that name already exists for the platform. Writes a `scope_group.create` audit entry.',
          operationId: 'scope-groups.create',
          body: CreateBody,
          response: {
            201: dataEnvelope(ScopeGroup),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            409: errorBody,
            500: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body ?? {}
        const vertical = (body.vertical ?? '').trim()
        const platform = (body.platform ?? '').trim()
        const name = (body.name ?? '').trim()
        const scopes = normalizeScopes(body.scopes)
        if (!vertical || !platform || !name) {
          return reply.status(400).send({ error: 'vertical, platform, and name are required' })
        }
        if (scopes.length === 0) {
          return reply.status(400).send({ error: 'scopes must be a non-empty array' })
        }
        try {
          const group = await adminStore.createScopeGroup({ vertical, platform, name, scopes })
          await adminStore.writeAudit(request.jwtUser!.id, 'scope_group.create', vertical, String(group.id), { name, platform })
          return reply.status(201).send({ data: group })
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          if (message.includes('UNIQUE')) {
            return reply.status(409).send({ error: 'A group with that name already exists for this platform' })
          }
          return reply.status(500).send({ error: 'Failed to create scope group', detail: message })
        }
      },
    )

    fastify.put<{ Params: { id: string }; Body: { name?: string; scopes?: unknown } }>(
      '/api/scope-groups/:id',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Update a scope group',
          description:
            'Update a scope group\'s name and/or scopes; omitted fields are left unchanged. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `400` for a non-numeric id and `404` if the group does not exist. Writes a `scope_group.update` audit entry.',
          operationId: 'scope-groups.update',
          params: IdParam,
          body: UpdateBody,
          response: {
            200: dataEnvelope(ScopeGroup),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const id = parseInt(request.params.id, 10)
        if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
        const patch: { name?: string; scopes?: string[] } = {}
        if (typeof request.body?.name === 'string') patch.name = request.body.name.trim()
        if (request.body?.scopes !== undefined) patch.scopes = normalizeScopes(request.body.scopes)
        const updated = await adminStore.updateScopeGroup(id, patch)
        if (!updated) return reply.status(404).send({ error: 'Scope group not found' })
        await adminStore.writeAudit(request.jwtUser!.id, 'scope_group.update', updated.vertical, String(updated.id), { name: updated.name, platform: updated.platform })
        return { data: updated }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/scope-groups/:id',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly, denyRestrictedScope],
        schema: {
          tags: [TAG],
          summary: 'Delete a scope group',
          description:
            'Delete a scope group by id. Operator role or higher. Refused (`403 SCOPE_RESTRICTED`) for a user restricted to specific tenants: it affects every tenant. Returns `400` for a non-numeric id and `404` if the group does not exist. Writes a `scope_group.delete` audit entry.',
          operationId: 'scope-groups.delete',
          params: IdParam,
          response: {
            204: noContent,
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const id = parseInt(request.params.id, 10)
        if (Number.isNaN(id)) return reply.status(400).send({ error: 'Invalid id' })
        const existing = await adminStore.getScopeGroup(id)
        if (!existing) return reply.status(404).send({ error: 'Scope group not found' })
        await adminStore.deleteScopeGroup(id)
        await adminStore.writeAudit(request.jwtUser!.id, 'scope_group.delete', existing.vertical, String(existing.id), { name: existing.name, platform: existing.platform })
        return reply.status(204).send()
      },
    )
  }
}

function normalizeScopes(input: unknown): string[] {
  if (Array.isArray(input)) {
    return [...new Set(input.map((v) => String(v).trim()).filter(Boolean))]
  }
  if (typeof input === 'string') {
    return [...new Set(input.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean))]
  }
  return []
}
