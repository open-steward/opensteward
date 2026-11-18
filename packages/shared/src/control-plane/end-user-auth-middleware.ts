/**
 * End-user auth middleware for `/v1/me/{vertical}/...` routes.
 *
 * Mirrors `createUnifiedAuthMiddleware` but:
 *   - Only accepts `Authorization: Bearer eut_…` (no X-Admin-Secret bypass)
 *   - Verifies the requested `connection_id` belongs to the *end-user* on
 *     the token (via connect_sessions.end_user_id), not the tenant
 *   - Rate-limit bucket is `end_user:<id>` so two AI-agent installs for
 *     the same customer share the budget
 *
 * Used by integration-server when mounting per-vertical resource plugins
 * a second time under `/v1/me/{vertical}` with a different auth scope.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { BaseAdapter } from '../adapter/base'
import type { UnifiedAdapterRegistry } from '../adapter/unified-registry'
import type { ConnectSessionStore } from '../auth/connect-sessions'
import type { EndUserTokenStore } from '../auth/end-user-tokens'
import type { Credentials, CredentialStore } from '../auth/store'
import { isTokenExpired } from '../auth/oauth'
import { withRefreshLock } from '../auth/refresh-lock'
import { refreshWithRotationGuard } from '../auth/refresh-runner'
import { isValidUuid } from '../util/uuid'
import {
  extractBearerToken,
  refuseIfMcpClientLacksScope,
  refuseIfMcpDisabled,
  refuseIfMcpWrite,
} from './api-key-middleware'
import type { McpEnabledSource, RateLimitConfigSource } from './api-key-middleware'
import { consume, type RateLimitConfig } from './rate-limit'
import { requiresWriteScope, type ConnectionWriteGuard } from './vertical-scopes'

export interface UnifiedEndUserAuthOptions {
  store: CredentialStore
  registry: UnifiedAdapterRegistry
  tokens: EndUserTokenStore
  sessions: ConnectSessionStore
  /** Override default 60/min budget. Resolver gets the request for live admin-tunable reads. */
  rateLimit?: RateLimitConfigSource
  /** Live read of `features.mcp_enabled`; omit to always allow. */
  mcpEnabled?: McpEnabledSource
  /**
   * License (integration-server): refuses writes on connections beyond the
   * limit, before the adapter lookup. Reads and read-safe routes are never
   * asked.
   */
  connectionWriteGuard?: ConnectionWriteGuard
}

const DEFAULT_END_USER_BUDGET: RateLimitConfig = { max: 60, windowMs: 60_000 }

export function createUnifiedEndUserAuthMiddleware(opts: UnifiedEndUserAuthOptions) {
  const { store, registry, tokens, sessions } = opts
  const rateLimitSource = opts.rateLimit ?? DEFAULT_END_USER_BUDGET

  return async function unifiedEndUserAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const query = (request.query as Record<string, string | undefined>) ?? {}
    const connectionId = query['connection_id']
    if (!connectionId) {
      await reply.status(400).send({
        error: { code: 'CONNECTION_ID_REQUIRED', message: '?connection_id=<uuid> is required.' },
      })
      return
    }
    if (!isValidUuid(connectionId)) {
      await reply.status(400).send({
        error: {
          code: 'CONNECTION_ID_INVALID',
          message: '?connection_id= must be a UUID.',
        },
      })
      return
    }

    const bearer = extractBearerToken(request)
    if (!bearer || !bearer.startsWith('eut_')) {
      await reply.status(401).send({
        error: {
          code: 'WRONG_TOKEN_PREFIX',
          message: '/v1/me/* routes require an end-user token (eut_…).',
        },
      })
      return
    }
    const tokenRow = await tokens.verify(bearer)
    if (!tokenRow) {
      await reply.status(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Invalid or revoked end-user token.' },
      })
      return
    }

    // Ownership check: the connection must be linked to *this* end-user
    // through a consumed connect_session. Cross-end-user probes 403.
    if (!(await sessions.connectionBelongsToEndUser(connectionId, tokenRow.endUserId))) {
      await reply.status(403).send({
        error: {
          code: 'CONNECTION_FORBIDDEN',
          message: `Connection ${connectionId} is not linked to your end-user record.`,
        },
      })
      return
    }

    const rateLimit =
      typeof rateLimitSource === 'function' ? rateLimitSource(request) : rateLimitSource
    const rl = await consume(`end_user:${tokenRow.endUserId}`, rateLimit)
    if (!rl.ok) {
      const retrySec = Math.ceil(rl.retryAfterMs / 1000)
      reply.header('retry-after', String(retrySec))
      reply.header('x-ratelimit-limit', String(rl.limit))
      reply.header('x-ratelimit-remaining', '0')
      await reply.status(429).send({
        error: { code: 'RATE_LIMITED', message: `Rate limit exceeded — retry in ${retrySec}s.` },
      })
      return
    }
    reply.header('x-ratelimit-limit', String(rl.limit))
    reply.header('x-ratelimit-remaining', String(rl.remaining))

    if (await refuseIfMcpClientLacksScope(request, reply, tokenRow.scopes)) return
    if (await refuseIfMcpDisabled(reply, tokenRow.scopes, opts.mcpEnabled)) return
    if (await refuseIfMcpWrite(request, reply, tokenRow.scopes, 'tokens')) return

    // Decorate request with the adapter + credentials, same as the tenant
    // middleware — downstream handlers don't distinguish modes.
    const row = await store.getRow(connectionId)
    if (!row) {
      await reply.status(404).send({
        error: { code: 'CONNECTION_NOT_FOUND', message: `No connection with id ${connectionId}.` },
      })
      return
    }
    const vertical = row.vertical
    if (!vertical) {
      await reply.status(500).send({
        error: {
          code: 'CONNECTION_VERTICAL_MISSING',
          message: 'Connection row is missing `vertical`.',
        },
      })
      return
    }
    // License write gate (P6), the same rule as the tenant middleware's.
    if (
      opts.connectionWriteGuard &&
      requiresWriteScope(
        request.method,
        request.routeOptions?.config as { readSafe?: unknown } | undefined,
      )
    ) {
      const refusal = await opts.connectionWriteGuard(connectionId)
      if (refusal) {
        await reply.status(403).send({ error: refusal })
        return
      }
    }
    const adapter = registry.get(vertical, row.platform)
    if (!adapter) {
      await reply.status(400).send({
        error: {
          code: 'ADAPTER_UNAVAILABLE',
          message: `Adapter ${vertical}:${row.platform} is not enabled.`,
        },
      })
      return
    }
    let creds: Credentials | null = await store.loadById(connectionId)
    if (!creds) {
      await reply.status(401).send({
        error: { code: 'NOT_CONNECTED', message: `Credentials missing for ${connectionId}.` },
      })
      return
    }
    if (isTokenExpired(creds.expiresAt) && adapter.refreshCredentials) {
      try {
        await withRefreshLock(connectionId, async () => {
          const { outcome, credentials: fresh } = await refreshWithRotationGuard(
            store,
            connectionId,
            creds!,
            (c) => adapter.refreshCredentials!(c),
          )
          // Throw on hard/transient failure so the outer catch returns 401 —
          // and so concurrent in-process waiters on this lock reject too.
          if (outcome !== 'ok') throw new Error(`token refresh ${outcome}`)
          creds = fresh
        })
        creds = (await store.loadById(connectionId)) ?? creds
      } catch {
        await reply.status(401).send({
          error: {
            code: 'TOKEN_REFRESH_FAILED',
            message: `Token refresh failed. Re-authenticate at /auth/${vertical}/${row.platform}/connect.`,
          },
        })
        return
      }
    }

    const r = request as unknown as Record<string, unknown>
    r['adapter'] = adapter as BaseAdapter
    r['credentials'] = creds
    r['connectionId'] = connectionId
    r['vertical'] = vertical
    r['platform'] = row.platform
    r['tenantId'] = tokenRow.tenantId
    r['endUserId'] = tokenRow.endUserId
    r['apiKeyId'] = tokenRow.id
    r['apiKeyScopes'] = tokenRow.scopes
  }
}
