/**
 * Developer-facing inbound-event stream.
 *
 *   GET /v1/events?after_seq=<n>&limit=<n>
 *
 * Returns verified inbound platform webhook events for the calling tenant in
 * `seq` order. Poll with the returned `next_cursor` (the max seq in the page)
 * to pull only new events — `seq` is monotonic so there are no clock-skew gaps.
 *
 * Tenant-scoped via `requireTenantKey`; requires the `events:read` scope.
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import type { ApiKeyStore } from '../auth/api-keys'
import type { InboundEventStore } from './inbound-event-store'
import { assertScope, requireTenantKey, type RateLimitConfigSource } from './api-key-middleware'
import type { DeveloperCredentialOptions } from './credential-resolver'
import type { McpEnabledSource } from './api-key-middleware'

export interface InboundEventsRouterOptions {
  apiKeys: ApiKeyStore
  events: InboundEventStore
  rateLimit?: RateLimitConfigSource
  /** Live read of `features.mcp_enabled`; omit to always allow. */
  mcpEnabled?: McpEnabledSource
  /**
   * Accept OIDC bearer tokens beside `osk_` keys, and the live reads of the
   * two operator toggles. All optional — omit them and only API keys are
   * accepted.
   */
  oauth?: DeveloperCredentialOptions['oauth']
  apiKeysEnabled?: DeveloperCredentialOptions['apiKeysEnabled']
  oauthEnabled?: DeveloperCredentialOptions['oauthEnabled']
}

interface ListQuery {
  after_seq?: string
  limit?: string
}

function tenantOf(request: FastifyRequest): string {
  const tenantId = (request as unknown as { tenantId?: string }).tenantId
  if (!tenantId) throw new Error('tenantId middleware did not run')
  return tenantId
}

export function createInboundEventsRouter(opts: InboundEventsRouterOptions): FastifyPluginAsync {
  const { apiKeys, events } = opts

  return async (fastify) => {
    fastify.addHook(
      'preHandler',
      requireTenantKey({
        apiKeys,
        oauth: opts.oauth,
        apiKeysEnabled: opts.apiKeysEnabled,
        oauthEnabled: opts.oauthEnabled,
        rateLimit: opts.rateLimit,
        mcpEnabled: opts.mcpEnabled,
      }),
    )

    fastify.get<{ Querystring: ListQuery }>('/v1/events', async (request, reply) => {
      if (!(await assertScope(request, reply, 'events:read'))) return
      const tenantId = tenantOf(request)
      const afterSeq = request.query.after_seq ? Number(request.query.after_seq) : 0
      const limit = request.query.limit ? Number(request.query.limit) : undefined
      const rows = await events.listForTenant(tenantId, {
        afterSeq: Number.isFinite(afterSeq) ? afterSeq : 0,
        limit: limit && Number.isFinite(limit) ? limit : undefined,
      })
      const nextCursor = rows.length ? rows[rows.length - 1]!.seq : afterSeq
      return reply.send({
        data: rows,
        meta: {
          next_cursor: nextCursor,
          count: rows.length,
          fetchedAt: new Date().toISOString(),
        },
      })
    })
  }
}
