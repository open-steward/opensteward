/**
 * `/v1/me/*` — the customer-level slice of the end-user mode surface.
 *
 *   GET /v1/me              → the bearer's own end-user record (no PII by default)
 *   GET /v1/me/connections  → connections the bearer has authorised
 *
 * Per-vertical resource routes (`/v1/me/{vertical}/{resource}`) are
 * mounted separately in integration-server with the
 * `createUnifiedEndUserAuthMiddleware` preHandler — they reuse the
 * existing per-vertical plugins, just with a different auth scope.
 *
 * Returning PII on `GET /v1/me` requires `mcp:read_pii` on the token
 * and `?include_pii=true` on the request. Every PII reveal is audit-
 * logged (same pattern as `/v1/customers/:id?include_pii=true`).
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ConnectSessionStore } from '../auth/connect-sessions'
import type { EndUserStore } from '../auth/end-users'
import type { EndUserTokenStore } from '../auth/end-user-tokens'
import type { CredentialStore } from '../auth/store'
import { hasScope } from '../auth/api-keys'
import { requireEndUserToken } from './end-user-token-middleware'
import type { McpEnabledSource, RateLimitConfigSource } from './api-key-middleware'

export interface EndUserRouterOptions {
  tokens: EndUserTokenStore
  endUsers: EndUserStore
  sessions: ConnectSessionStore
  credentials: CredentialStore
  rateLimit?: RateLimitConfigSource
  /** Live read of `features.mcp_enabled`; omit to always allow. */
  mcpEnabled?: McpEnabledSource
}

function endUserOf(request: FastifyRequest): {
  tenantId: string
  endUserId: string
  scopes: string[]
} {
  const r = request as unknown as {
    tenantId?: string
    endUserId?: string
    apiKeyScopes?: string[]
  }
  if (!r.tenantId || !r.endUserId) throw new Error('end-user middleware did not run')
  return { tenantId: r.tenantId, endUserId: r.endUserId, scopes: r.apiKeyScopes ?? [] }
}

export function createEndUserRouter(opts: EndUserRouterOptions): FastifyPluginAsync {
  const { tokens, endUsers, sessions, credentials } = opts

  return async (fastify) => {
    fastify.addHook(
      'preHandler',
      requireEndUserToken({ tokens, rateLimit: opts.rateLimit, mcpEnabled: opts.mcpEnabled }),
    )

    fastify.get<{ Querystring: { include_pii?: string } }>('/v1/me', async (request, reply) => {
      const { endUserId, scopes } = endUserOf(request)
      const wantsPii = request.query.include_pii === 'true'
      const allowedPii = hasScope(scopes, 'mcp:read_pii') || hasScope(scopes, 'customers:read_pii')
      if (wantsPii && !allowedPii) {
        return reply.status(403).send({
          error: {
            code: 'INSUFFICIENT_SCOPE',
            message: 'mcp:read_pii is required to set ?include_pii=true.',
            requiredScope: 'mcp:read_pii',
          },
        })
      }
      const row = await endUsers.getById(endUserId, { includePii: wantsPii && allowedPii })
      if (!row) {
        return reply.status(404).send({
          error: { code: 'END_USER_NOT_FOUND' },
        })
      }
      const { pii, ...rest } = row
      return wantsPii && allowedPii ? { data: { ...rest, pii } } : { data: rest }
    })

    fastify.get('/v1/me/connections', async (request) => {
      const { endUserId } = endUserOf(request)
      const connectionIds = await sessions.connectionsForEndUser(endUserId)
      // Lift the connection rows from CredentialStore (no creds — public fields only).
      const rows = await Promise.all(connectionIds.map(async (id) => credentials.getRow(id)))
      const data = rows
        .filter((row): row is NonNullable<Awaited<ReturnType<typeof credentials.getRow>>> => !!row)
        .map((row) => ({
          id: row.id,
          vertical: row.vertical,
          platform: row.platform,
          label: row.label,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        }))
      return { data }
    })
  }
}
