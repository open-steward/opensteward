/**
 * Admin passthrough for `/admin/api-keys` on integration-server.
 *
 * Tenant-scoped developer API keys live in integration-server's encrypted
 * sqlite next to the credentials they unlock. Admin-api re-exposes the
 * mint/list/revoke surface through its JWT-protected pipeline so the admin
 * UI keeps a single auth model.
 *
 * Mint and revoke are admin-only and audited. List is operator+ so an
 * operator can answer "is this key active?" without being able to mint
 * one themselves.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { UnifiedClient } from '../proxy/client'
import type { AdminStore } from '../db/admin-store'
import { ApiKey, ApiKeyMint, ApiKeyRotate, dataEnvelope, listEnvelope, errorBody, noContent } from './_openapi'
import { denyRestrictedScope } from '../auth/access'

const TAG = 'api-keys'

const ListQuery = z.object({
  tenantId: z.string().optional(),
  mode: z.enum(['live', 'test']).optional(),
})
const MintBody = z.object({
  tenantId: z.string().min(1).meta({ description: 'Tenant (operator customer) the new key authenticates as.', example: 'acme' }),
  label: z.string().nullable().optional().meta({ description: 'Optional human-friendly label for the key.', example: 'Production key' }),
  scopes: z.array(z.string()).optional().meta({ description: 'Permission scopes to grant the key; omit for the default scope set.', example: ['customers:read', 'connections:read'] }),
  mode: z.enum(['live', 'test']).optional().meta({ description: 'Which surface the key addresses: `live` keys work on `/v1/*`, `test` keys on the `/test/v1/*` sandbox. Omit for `live`.', example: 'live' }),
  expiresAt: z.number().int().positive().nullable().optional().meta({ description: 'Optional hard expiry, epoch ms. Past it the key no longer authenticates. Omit for a non-expiring key.', example: 1782864000000 }),
}).meta({ id: 'MintApiKeyBody', description: 'Request body to mint a new tenant API key.' })
const RotateBody = z.object({
  overlapSeconds: z.number().int().min(0).max(30 * 24 * 3600).optional().meta({ description: 'Grace window in seconds during which the old key still verifies. Defaults to 86400 (24h); 0 revokes it immediately.', example: 3600 }),
  expiresAt: z.number().int().positive().nullable().optional().meta({ description: 'Optional hard expiry for the REPLACEMENT key, epoch ms. Not inherited from the old key.', example: null }),
}).meta({ id: 'RotateApiKeyBody', description: 'Request body to rotate a tenant API key.' })
const IdParam = z.object({ id: z.string() })

export function createApiKeysRoutes(client: UnifiedClient, adminStore: AdminStore) {
  return async function apiKeysRoutes(fastify: FastifyInstance): Promise<void> {
    // Not tenant-scoped yet: a tenant-restricted caller is refused outright
    // (403 SCOPE_RESTRICTED) rather than shown every tenant's rows.
    fastify.addHook('preHandler', denyRestrictedScope)
    fastify.get<{ Querystring: { tenantId?: string; mode?: 'live' | 'test' } }>(
      '/api/api-keys',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'List tenant API keys (active + revoked)',
          description:
            'List developer API keys (both active and revoked) for the deployment, optionally filtered to one tenant via `tenantId` and to one key mode via `mode`. Operator role or higher — an operator can check whether a key is active without being able to mint one. Returns key metadata only; the plaintext secret is never included.',
          operationId: 'api-keys.list',
          querystring: ListQuery,
          response: {
            200: listEnvelope(ApiKey),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        const data = await client.listApiKeys(request.query.tenantId, request.query.mode)
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.post(
      '/api/api-keys',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Mint a new tenant API key (plaintext returned once)',
          description:
            'Mint a new tenant-scoped developer API key. Admin role required. The response includes the plaintext key **once** — it is not stored and cannot be retrieved again. Returns `400` if `tenantId` is missing. Writes an `api_key.mint` audit entry.',
          operationId: 'api-keys.create',
          body: MintBody,
          response: {
            201: dataEnvelope(ApiKeyMint),
            400: errorBody,
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body as
          | {
              tenantId?: string
              label?: string | null
              scopes?: string[]
              mode?: 'live' | 'test'
              expiresAt?: number | null
            }
          | undefined
        if (!body?.tenantId || !body.tenantId.trim()) {
          return reply.status(400).send({ error: 'tenantId is required.' })
        }
        const scopes = Array.isArray(body.scopes)
          ? body.scopes.map((s) => String(s).trim()).filter((s) => s.length > 0)
          : undefined
        const data = await client.mintApiKey({
          tenantId: body.tenantId.trim(),
          label: body.label ?? null,
          scopes: scopes && scopes.length > 0 ? scopes : undefined,
          mode: body.mode,
          expiresAt: body.expiresAt ?? null,
        })
        adminStore.writeAudit(
          request.jwtUser!.id,
          'api_key.mint',
          undefined,
          (data as { id?: string } | null)?.id,
        )
        return reply.status(201).send({ data })
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/api/api-keys/:id/rotate',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Rotate a tenant API key (replacement plaintext returned once)',
          description:
            'Mint a replacement key with the same tenant, label, scopes and mode, and schedule the ' +
            'old key\u2019s revocation after a grace window (default 24h) in which both keys work \u2014 ' +
            'no downtime gap while the new key is rolled out. Admin role required. The response ' +
            'includes the replacement\u2019s plaintext **once**. Returns `404` when the key does not ' +
            'exist, is revoked or expired, or was already rotated inside its grace window. Writes an ' +
            '`api_key.rotate` audit entry.',
          operationId: 'api-keys.rotate',
          params: IdParam,
          body: RotateBody,
          response: {
            201: dataEnvelope(ApiKeyRotate),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body as
          | { overlapSeconds?: number; expiresAt?: number | null }
          | undefined
        const data = await client.rotateApiKey(request.params.id, {
          overlapSeconds: body?.overlapSeconds,
          expiresAt: body?.expiresAt ?? null,
        })
        if (!data) return reply.status(404).send({ error: 'API key not found.' })
        const result = data as { id?: string; oldKeyRevokeAt?: number }
        adminStore.writeAudit({
          userId: request.jwtUser!.id,
          action: 'api_key.rotate',
          targetId: request.params.id,
          detail: {
            ...(result.id ? { replacementId: result.id } : {}),
            ...(result.oldKeyRevokeAt ? { oldKeyRevokeAt: result.oldKeyRevokeAt } : {}),
          },
        })
        return reply.status(201).send({ data })
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/api-keys/:id',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Revoke a tenant API key',
          description:
            'Permanently revoke a tenant API key by id, taking effect immediately. Admin role required. Returns `404` if no key matches the id. Writes an `api_key.revoke` audit entry.',
          operationId: 'api-keys.delete',
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
        const ok = await client.revokeApiKey(request.params.id)
        if (!ok) return reply.status(404).send({ error: 'API key not found.' })
        adminStore.writeAudit(request.jwtUser!.id, 'api_key.revoke', undefined, request.params.id)
        return reply.status(204).send()
      },
    )
  }
}
