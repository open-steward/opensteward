/**
 * End-user token middleware. Reads `Authorization: Bearer eut_...`,
 * verifies via `EndUserTokenStore`, decorates `request.endUserId` +
 * `request.tenantId` + `request.apiKeyScopes` for downstream
 * handlers.
 *
 * Rate-limit bucket is `end_user:<id>` so two AI-agent installs for
 * the same customer share the budget. The budget itself is admin-
 * tunable via `rate_limit.mcp_end_user.per_minute`.
 *
 * mcp:read read-only enforcement mirrors `requireTenantKey`: any
 * non-GET method on a token carrying `mcp:read` is refused with
 * `MCP_READ_ONLY`.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { EndUserTokenStore } from '../auth/end-user-tokens'
import { consume, type RateLimitConfig } from './rate-limit'
import {
  extractBearerToken,
  refuseIfMcpClientLacksScope,
  refuseIfMcpDisabled,
  refuseIfMcpWrite,
} from './api-key-middleware'
import type { McpEnabledSource, RateLimitConfigSource } from './api-key-middleware'

export const DEFAULT_END_USER_RATE_LIMIT: RateLimitConfig = {
  max: 60,
  windowMs: 60_000,
}

export interface EndUserTokenMiddlewareOptions {
  tokens: EndUserTokenStore
  rateLimit?: RateLimitConfigSource
  /** Live read of `features.mcp_enabled`; omit to always allow. */
  mcpEnabled?: McpEnabledSource
}

export function requireEndUserToken(opts: EndUserTokenMiddlewareOptions) {
  const { tokens } = opts
  const rateLimitSource = opts.rateLimit ?? DEFAULT_END_USER_RATE_LIMIT
  return async function endUserTokenMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const token = extractBearerToken(request)
    if (!token) {
      await reply.status(401).send({
        error: {
          code: 'UNAUTHENTICATED',
          message: 'Authorization: Bearer <end-user-token> is required.',
        },
      })
      return
    }
    if (!token.startsWith('eut_')) {
      await reply.status(401).send({
        error: {
          code: 'WRONG_TOKEN_PREFIX',
          message: '/v1/me/* routes require an end-user token (eut_…).',
        },
      })
      return
    }
    const row = await tokens.verify(token)
    if (!row) {
      await reply.status(401).send({
        error: { code: 'UNAUTHENTICATED', message: 'Invalid or revoked end-user token.' },
      })
      return
    }

    // Decorate before rate-limit so the resolver can inspect scopes.
    const r = request as unknown as Record<string, unknown>
    r['tenantId'] = row.tenantId
    r['endUserId'] = row.endUserId
    r['apiKeyId'] = row.id
    r['apiKeyScopes'] = row.scopes

    const rateLimit =
      typeof rateLimitSource === 'function' ? rateLimitSource(request) : rateLimitSource
    const rl = await consume(`end_user:${row.endUserId}`, rateLimit)
    if (!rl.ok) {
      const retrySec = Math.ceil(rl.retryAfterMs / 1000)
      reply.header('retry-after', String(retrySec))
      reply.header('x-ratelimit-limit', String(rl.limit))
      reply.header('x-ratelimit-remaining', '0')
      await reply.status(429).send({
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded — retry in ${retrySec}s.`,
        },
      })
      return
    }
    reply.header('x-ratelimit-limit', String(rl.limit))
    reply.header('x-ratelimit-remaining', String(rl.remaining))

    // Read-only enforcement — mirrors the tenant-key middleware.
    if (await refuseIfMcpClientLacksScope(request, reply, row.scopes)) return
    if (await refuseIfMcpDisabled(reply, row.scopes, opts.mcpEnabled)) return
    if (await refuseIfMcpWrite(request, reply, row.scopes, 'tokens')) return
  }
}
