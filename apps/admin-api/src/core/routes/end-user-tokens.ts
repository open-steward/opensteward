/**
 * Admin passthrough for `/admin/end-user-tokens` on integration-server.
 * Mint, list, revoke per-end-user MCP tokens. Operator+ only.
 */
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { AdminStore } from '../db/admin-store'
import type { UnifiedClient } from '../proxy/client'
import { EndUserToken, EndUserTokenMint, dataEnvelope, listEnvelope, errorBody, noContent } from './_openapi'
import { denyRestrictedScope } from '../auth/access'

const TAG = 'end-user-tokens'

const ListQuery = z.object({
  endUserId: z.string().optional(),
  tenantId: z.string().optional(),
})

const MintBody = z.object({
  endUserId: z.string().min(1).meta({ description: 'End-user the token will authenticate as (prefix `cus_`).', example: 'cus_4Qm2Xa9Lr' }),
  tenantId: z.string().min(1).meta({ description: 'Tenant the end-user belongs to.', example: 'acme' }),
  label: z.string().nullable().optional().meta({ description: 'Optional human-friendly label for the token.', example: 'Production key' }),
  scopes: z.array(z.string()).optional().meta({ description: 'Permission scopes to grant the token; omit for the default scope set.', example: ['customers:read', 'connections:read'] }),
}).meta({ id: 'MintEndUserTokenBody', description: 'Request body to mint an API token scoped to a single end-user.' })

const IdParam = z.object({ id: z.string() })

export function createEndUserTokensRoutes(
  client: UnifiedClient,
  adminStore: AdminStore,
): FastifyPluginAsync {
  return async function (fastify) {
    // Not tenant-scoped yet: a tenant-restricted caller is refused outright
    // (403 SCOPE_RESTRICTED) rather than shown every tenant's rows.
    fastify.addHook('preHandler', denyRestrictedScope)
    fastify.get<{ Querystring: { endUserId?: string; tenantId?: string } }>(
      '/api/end-user-tokens',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'List per-end-user MCP tokens',
          description:
            'List MCP tokens scoped to individual end-users, optionally filtered by `endUserId` or `tenantId`. Operator role or higher. Returns token metadata only; plaintext secrets are never included.',
          operationId: 'end-user-tokens.list',
          querystring: ListQuery,
          response: {
            200: listEnvelope(EndUserToken),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        const data = await client.listEndUserTokens(request.query)
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.post<{ Body: { endUserId?: string; tenantId?: string; label?: string | null; scopes?: string[] } }>(
      '/api/end-user-tokens',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Mint a per-end-user MCP token',
          description:
            'Mint an MCP token scoped to a single end-user. Operator role or higher. The response includes the plaintext token **once** — it cannot be retrieved again. Returns `400` if `endUserId` or `tenantId` is missing. Writes an `end_user_token.mint` audit entry.',
          operationId: 'end-user-tokens.create',
          body: MintBody,
          response: {
            201: dataEnvelope(EndUserTokenMint),
            400: errorBody,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body ?? {}
        if (!body.endUserId || !body.tenantId) {
          return reply.status(400).send({ error: 'endUserId and tenantId are required.' })
        }
        const data = await client.mintEndUserToken({
          endUserId: body.endUserId,
          tenantId: body.tenantId,
          label: body.label ?? null,
          scopes: body.scopes,
          createdBy: request.jwtUser!.id,
        })
        adminStore.writeAudit(
          request.jwtUser!.id,
          'end_user_token.mint',
          undefined,
          (data as { id?: string } | null)?.id,
        )
        return reply.status(201).send({ data })
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/end-user-tokens/:id',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'Revoke a per-end-user MCP token',
          description:
            'Revoke a per-end-user MCP token by id, effective immediately. Operator role or higher. Returns `404` if no token matches the id. Writes an `end_user_token.revoke` audit entry.',
          operationId: 'end-user-tokens.delete',
          params: IdParam,
          response: {
            204: noContent,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const ok = await client.revokeEndUserToken(request.params.id)
        if (!ok) return reply.status(404).send({ error: 'Token not found.' })
        adminStore.writeAudit(
          request.jwtUser!.id,
          'end_user_token.revoke',
          undefined,
          request.params.id,
        )
        return reply.status(204).send()
      },
    )
  }
}
