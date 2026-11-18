/**
 * Admin-guarded routes for managing tenant-scoped developer API keys.
 *
 *   GET    /admin/api-keys[?tenantId=...]   list keys (active + revoked)
 *   POST   /admin/api-keys                  mint a new key — plaintext returned ONCE
 *   POST   /admin/api-keys/:id/rotate       mint a same-shape replacement; the old
 *                                           key keeps working for a grace window
 *   DELETE /admin/api-keys/:id              revoke
 *
 * Plaintext is never persisted unencrypted and never re-fetchable. The
 * mint response is the only opportunity to capture it.
 *
 * Gated by `adminGuard` (X-Admin-Secret) — admin-api proxies these through
 * its JWT-protected pipeline so the admin UI hits a single auth boundary.
 */
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { ApiKeyStore } from '../auth/api-keys'
import { IncompatibleMcpScopesError } from '../auth/api-keys'
import { adminGuard } from './admin-guard'

export interface ApiKeysAdminRouterOptions {
  apiKeys: ApiKeyStore
}

const MintBody = z
  .object({
    tenantId: z.string().min(1).max(200),
    // nullish, not optional: both callers above this router (the admin UI and
    // admin-api) model "no label" as an explicit null, which `.strict()` with
    // `.optional()` would reject as a validation error. The store's column is
    // nullable either way.
    label: z.string().max(200).nullish(),
    scopes: z.array(z.string().min(1).max(80)).max(40).optional(),
    // Omitted means 'live'. The store defaults the same way, so a client
    // that never sends `mode` mints live keys.
    mode: z.enum(['live', 'test']).optional(),
    /** Hard expiry, epoch ms. Verify refuses the key past it. */
    expiresAt: z.number().int().positive().nullish(),
  })
  .strict()

const RotateBody = z
  .object({
    /** Grace window in seconds during which the old key still verifies.
     *  Defaults to 24h; 0 revokes the old key immediately. Capped at 30d. */
    overlapSeconds: z
      .number()
      .int()
      .min(0)
      .max(30 * 24 * 3600)
      .optional(),
    /** Hard expiry for the REPLACEMENT key, epoch ms. Not inherited. */
    expiresAt: z.number().int().positive().nullish(),
  })
  .strict()

export function createApiKeysAdminRouter(opts: ApiKeysAdminRouterOptions): FastifyPluginAsync {
  const { apiKeys } = opts

  return async (fastify) => {
    fastify.addHook('preHandler', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      return
    })

    fastify.get<{ Querystring: { tenantId?: string; mode?: string } }>(
      '/admin/api-keys',
      async (request, reply) => {
        const { mode } = request.query
        if (mode !== undefined && mode !== 'live' && mode !== 'test') {
          return reply.status(400).send({
            error: { code: 'VALIDATION', message: "mode must be 'live' or 'test'." },
          })
        }
        const data = await apiKeys.list(request.query.tenantId, mode ? { mode } : undefined)
        return { data }
      },
    )

    fastify.post('/admin/api-keys', async (request, reply) => {
      const parsed = MintBody.safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
      }
      try {
        const result = await apiKeys.mint({
          tenantId: parsed.data.tenantId,
          label: parsed.data.label ?? null,
          scopes: parsed.data.scopes,
          mode: parsed.data.mode,
          expiresAt: parsed.data.expiresAt ?? null,
        })
        return reply.status(201).send({ data: result })
      } catch (err) {
        if (err instanceof IncompatibleMcpScopesError) {
          return reply.status(400).send({
            error: {
              code: 'INCOMPATIBLE_MCP_SCOPES',
              message: err.message,
              conflictingScopes: err.conflictingScopes,
            },
          })
        }
        throw err
      }
    })

    fastify.post<{ Params: { id: string } }>(
      '/admin/api-keys/:id/rotate',
      async (request, reply) => {
        const parsed = RotateBody.safeParse(request.body ?? {})
        if (!parsed.success) {
          return reply
            .status(400)
            .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
        }
        const result = await apiKeys.rotate(request.params.id, {
          overlapMs:
            parsed.data.overlapSeconds !== undefined
              ? parsed.data.overlapSeconds * 1000
              : undefined,
          expiresAt: parsed.data.expiresAt ?? null,
        })
        // One 404 for every refusal — missing, revoked, expired, or already
        // rotated inside its grace window. The distinctions matter to the
        // operator's audit trail, not to whoever is probing ids.
        if (!result) return reply.status(404).send({ error: { code: 'API_KEY_NOT_FOUND' } })
        return reply.status(201).send({ data: result })
      },
    )

    fastify.delete<{ Params: { id: string } }>('/admin/api-keys/:id', async (request, reply) => {
      const ok = await apiKeys.revoke(request.params.id)
      if (!ok) return reply.status(404).send({ error: { code: 'API_KEY_NOT_FOUND' } })
      return reply.status(204).send()
    })
  }
}
