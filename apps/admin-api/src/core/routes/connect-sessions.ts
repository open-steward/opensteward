/**
 * Admin passthrough for `/admin/connect-sessions` on integration-server.
 *
 * Mirrors the pattern of routes/connections.ts: the admin UI talks JWT to
 * admin-api, admin-api forwards with X-Admin-Secret to integration-server,
 * which owns the connect_sessions table.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { UnifiedClient } from '../proxy/client'
import type { AdminStore } from '../db/admin-store'
import {
  ConnectSession,
  ConnectSessionStatus,
  CreateConnectSessionBody,
  dataEnvelope,
  listEnvelope,
  errorBody,
  noContent,
} from './_openapi'
import { denyRestrictedScope } from '../auth/access'

const TAG = 'connect-sessions'

const ListQuery = z.object({
  tenantId: z.string().optional(),
  endUserId: z.string().optional(),
  status: ConnectSessionStatus.optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
})

const IdParam = z.object({ id: z.string() })

export function createConnectSessionsRoutes(client: UnifiedClient, adminStore: AdminStore) {
  return async function connectSessionsRoutes(fastify: FastifyInstance): Promise<void> {
    // Not tenant-scoped yet: a tenant-restricted caller is refused outright
    // (403 SCOPE_RESTRICTED) rather than shown every tenant's rows.
    fastify.addHook('preHandler', denyRestrictedScope)
    fastify.get<{ Querystring: { tenantId?: string; endUserId?: string; status?: string; limit?: string; offset?: string } }>(
      '/api/connect-sessions',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: [TAG],
          summary: 'List Connect Link sessions',
          description:
            'List Connect Link sessions (the hosted authorization flows end-users complete to link an integration), with optional filters for `tenantId`, `endUserId`, `status`, and `limit`/`offset` pagination. Any authenticated operator.',
          operationId: 'connect-sessions.list',
          querystring: ListQuery,
          response: {
            200: listEnvelope(ConnectSession),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        const { tenantId, endUserId, status, limit, offset } = request.query
        const limitNum = limit ? Number(limit) : undefined
        const offsetNum = offset ? Number(offset) : undefined
        const data = await client.listConnectSessions({
          tenantId,
          endUserId,
          status,
          limit: limitNum,
          offset: offsetNum,
        })
        const effLimit = limitNum ?? data.length
        const page = effLimit > 0 ? Math.floor((offsetNum ?? 0) / effLimit) + 1 : 1
        return { data, meta: { page, limit: effLimit, total: data.length } }
      },
    )

    fastify.get<{ Params: { id: string } }>(
      '/api/connect-sessions/:id',
      {
        preHandler: [fastify.authenticate],
        schema: {
          tags: [TAG],
          summary: 'Read one Connect Link session',
          description:
            'Read a single Connect Link session by id, including its current status. Any authenticated operator. Returns `404` if the session does not exist.',
          operationId: 'connect-sessions.get',
          params: IdParam,
          response: {
            200: dataEnvelope(ConnectSession),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const data = await client.getConnectSession(request.params.id)
        if (!data) return reply.status(404).send({ error: 'Connect session not found.' })
        return { data }
      },
    )

    fastify.post(
      '/api/connect-sessions',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Mint a Connect Link session',
          description:
            'Mint a new Connect Link session and return its hosted authorization URL to hand to an end-user. Operator role or higher. The requesting operator is recorded as `created_by`. Writes a `connect_session.create` audit entry.',
          operationId: 'connect-sessions.create',
          body: CreateConnectSessionBody,
          response: {
            200: dataEnvelope(ConnectSession),
            400: errorBody,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        const body = (request.body ?? {}) as Record<string, unknown>
        // Stamp the requesting admin user id so integration-server can record `created_by`.
        body['createdBy'] = request.jwtUser!.id
        const data = await client.createConnectSession(body)
        adminStore.writeAudit(request.jwtUser!.id, 'connect_session.create')
        return { data: data as Record<string, unknown> }
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/connect-sessions/:id',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Revoke a Connect Link session',
          description:
            'Revoke a Connect Link session by id, invalidating its authorization URL immediately. Operator role or higher. Writes a `connect_session.revoke` audit entry.',
          operationId: 'connect-sessions.delete',
          params: IdParam,
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request, reply) => {
        await client.revokeConnectSession(request.params.id)
        adminStore.writeAudit(request.jwtUser!.id, 'connect_session.revoke', undefined, request.params.id)
        return reply.status(204).send()
      },
    )
  }
}
