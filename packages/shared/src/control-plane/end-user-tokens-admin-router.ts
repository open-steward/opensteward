/**
 * Admin-guarded routes for managing end-user tokens.
 *
 *   GET    /admin/end-user-tokens?endUserId=&tenantId=  — list
 *   POST   /admin/end-user-tokens                        — mint (plaintext returned ONCE)
 *   DELETE /admin/end-user-tokens/:id                    — revoke
 *
 * Same shape as the api-keys-admin-router. The mint guard from
 * api-keys.ts already enforces "mcp:read cannot coexist with
 * write-granting scopes" via assertMcpScopesCompatible inside
 * EndUserTokenStore.mint.
 */
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type { EndUserTokenStore } from '../auth/end-user-tokens'
import { IncompatibleMcpScopesError } from '../auth/api-keys'
import { adminGuard } from './admin-guard'

const MintBody = z
  .object({
    endUserId: z.string().min(1).max(200),
    tenantId: z.string().min(1).max(200),
    // nullish, not optional: both callers above this router model "no label"
    // as an explicit null — the admin UI sends `label?.trim() || null` and
    // admin-api normalises with `label ?? null` — so `null` is what reaches
    // the wire on every unlabelled mint. Inside `.strict()` that was a
    // validation error, and its 400 surfaced to the operator as admin-api's
    // bare "Request failed with status code 400". The store's column is
    // nullable and `mint` already takes `string | null`. Same for createdBy,
    // which admin-api's proxy client types as `string | null`.
    label: z.string().max(200).nullish(),
    scopes: z.array(z.string().min(1).max(80)).max(40).optional(),
    createdBy: z.string().max(200).nullish(),
  })
  .strict()

export interface EndUserTokensAdminRouterOptions {
  tokens: EndUserTokenStore
}

export function createEndUserTokensAdminRouter(
  opts: EndUserTokensAdminRouterOptions,
): FastifyPluginAsync {
  const { tokens } = opts

  return async (fastify) => {
    fastify.addHook('preHandler', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      return
    })

    fastify.get<{ Querystring: { endUserId?: string; tenantId?: string } }>(
      '/admin/end-user-tokens',
      async (request) => {
        const data = await tokens.list({
          endUserId: request.query.endUserId,
          tenantId: request.query.tenantId,
        })
        return { data }
      },
    )

    fastify.post('/admin/end-user-tokens', async (request, reply) => {
      const parsed = MintBody.safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
      }
      try {
        const result = await tokens.mint({
          endUserId: parsed.data.endUserId,
          tenantId: parsed.data.tenantId,
          label: parsed.data.label ?? null,
          scopes: parsed.data.scopes,
          createdBy: parsed.data.createdBy ?? null,
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

    fastify.delete<{ Params: { id: string } }>(
      '/admin/end-user-tokens/:id',
      async (request, reply) => {
        const ok = await tokens.revoke(request.params.id)
        if (!ok) return reply.status(404).send({ error: { code: 'END_USER_TOKEN_NOT_FOUND' } })
        return reply.status(204).send()
      },
    )
  }
}
