/**
 * Developer-facing webhook subscription router.
 *
 *   GET    /v1/webhook-subscriptions                    list yours
 *   POST   /v1/webhook-subscriptions                    create — secret returned ONCE
 *   GET    /v1/webhook-subscriptions/{id}               single
 *   PATCH  /v1/webhook-subscriptions/{id}               change format / headers / label
 *   DELETE /v1/webhook-subscriptions/{id}               delete
 *   POST   /v1/webhook-subscriptions/{id}/test          one synthetic delivery
 *   POST   /v1/webhook-subscriptions/{id}/paused        pause / resume
 *   POST   /v1/webhook-subscriptions/{id}/rotate-secret new secret returned ONCE
 *   GET    /v1/webhook-subscriptions/{id}/deliveries    delivery log (when wired)
 *
 * This router exposes the same subscription store the admin surface uses
 * (HMAC signing, retry, dead-letter, replay, test-send) to `osk_` keys, so a
 * third-party integration can register an endpoint without an operator
 * round-trip. Two scopes:
 *
 *   - GETs require `webhooks:read`.
 *   - Everything else requires `webhooks:write`.
 *
 * Tenant rules match `connections-dev-router`: the tenant comes from the
 * calling key, never the body, and a cross-tenant id answers 404 (not 403)
 * so ids cannot be probed. SSRF protection needs nothing here — the store's
 * deliveries already go through `safeFetch`/`assertPublicHost`, so a
 * dev-minted destination gets exactly the guard an admin-minted one does.
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { ApiKeyStore } from '../auth/api-keys'
import {
  MAX_WEBHOOK_LABEL_LENGTH,
  type WebhookSubscriptionStore,
  type WebhookSubscriptionRow,
} from '../auth/webhook-subscriptions'
import type { WebhookDeliveryStore } from '../auth/webhook-deliveries'
import { assertScope, requireTenantKey, type RateLimitConfigSource } from './api-key-middleware'
import type { DeveloperCredentialOptions } from './credential-resolver'
import type { McpEnabledSource } from './api-key-middleware'
import { WEBHOOK_FORMATS } from './webhook-formats'
import { validateHeaders } from './webhook-headers'
import { sendSyntheticTest } from './webhook-test-send'

/**
 * How many subscriptions one tenant may hold. A webhook endpoint per service
 * plus a few environments fits comfortably; a runaway integration loop does
 * not. Operators can always exceed it through the admin surface.
 */
export const MAX_WEBHOOK_SUBS_PER_TENANT = 20

export interface WebhookSubsDevRouterOptions {
  apiKeys: ApiKeyStore
  subs: WebhookSubscriptionStore
  /** Optional. When supplied, the /deliveries read endpoint is mounted. */
  deliveries?: WebhookDeliveryStore
  rateLimit?: RateLimitConfigSource
  /** Live read of `features.mcp_enabled`; omit to always allow. */
  mcpEnabled?: McpEnabledSource
  oauth?: DeveloperCredentialOptions['oauth']
  apiKeysEnabled?: DeveloperCredentialOptions['apiKeysEnabled']
  oauthEnabled?: DeveloperCredentialOptions['oauthEnabled']
  /** Test hook. Defaults to `safeFetch` inside the test-send helper. */
  fetchImpl?: typeof fetch
  resolvePlatformName?: (slug: string) => string | undefined
}

/** Same container check as the admin router; same `validateHeaders` grammar. */
const HeadersMap = z
  .record(z.string(), z.string())
  .superRefine((value: Record<string, string>, ctx: z.RefinementCtx) => {
    const result = validateHeaders(value)
    if (!result.ok) ctx.addIssue({ code: 'custom', message: result.reason })
  })

/** The admin CreateBody minus `tenantId` — the key decides the tenant. */
const CreateBody = z
  .object({
    url: z.string().url(),
    label: z.string().max(MAX_WEBHOOK_LABEL_LENGTH).nullish(),
    events: z.array(z.string().min(1).max(80)).max(40).optional(),
    format: z.enum(WEBHOOK_FORMATS).optional(),
    headers: HeadersMap.optional(),
  })
  .strict()

const PatchBody = z
  .object({
    format: z.enum(WEBHOOK_FORMATS).optional(),
    headers: HeadersMap.nullable().optional(),
    label: z.string().max(MAX_WEBHOOK_LABEL_LENGTH).nullish(),
  })
  .strict()
  .refine((b) => b.format !== undefined || b.headers !== undefined || b.label !== undefined, {
    message: 'supply at least one of format, headers or label',
  })

function tenantOf(request: FastifyRequest): string {
  const tenantId = (request as unknown as { tenantId?: string }).tenantId
  if (!tenantId) throw new Error('tenantId middleware did not run')
  return tenantId
}

function notFound(reply: import('fastify').FastifyReply, id: string) {
  return reply.status(404).send({
    error: { code: 'WEBHOOK_SUB_NOT_FOUND', message: `No webhook subscription with id ${id}.` },
  })
}

export function createWebhookSubsDevRouter(opts: WebhookSubsDevRouterOptions): FastifyPluginAsync {
  const { apiKeys, subs, deliveries } = opts

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

    /** Load the row only if it belongs to the calling tenant. */
    async function ownRow(
      request: FastifyRequest,
      id: string,
    ): Promise<WebhookSubscriptionRow | undefined> {
      const rows = await subs.list(tenantOf(request))
      return rows.find((r) => r.id === id)
    }

    fastify.get('/v1/webhook-subscriptions', async (request, reply) => {
      if (!(await assertScope(request, reply, 'webhooks:read'))) return
      const data = await subs.list(tenantOf(request))
      return reply.send({ data, meta: { totalCount: data.length } })
    })

    fastify.post('/v1/webhook-subscriptions', async (request, reply) => {
      if (!(await assertScope(request, reply, 'webhooks:write'))) return
      const parsed = CreateBody.safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
      }
      const tenantId = tenantOf(request)
      const existing = await subs.list(tenantId)
      if (existing.length >= MAX_WEBHOOK_SUBS_PER_TENANT) {
        return reply.status(403).send({
          error: {
            code: 'WEBHOOK_SUB_QUOTA_EXCEEDED',
            message:
              `Your tenant already holds ${existing.length} webhook subscriptions ` +
              `(limit ${MAX_WEBHOOK_SUBS_PER_TENANT}). Delete one, or ask the operator.`,
          },
        })
      }
      const created = await subs.create({
        tenantId,
        url: parsed.data.url,
        label: parsed.data.label,
        events: parsed.data.events,
        format: parsed.data.format,
        headers: parsed.data.headers,
      })
      // `created` carries the one-time signing secret; header values are
      // never echoed back.
      return reply.status(201).send({ data: created })
    })

    fastify.get<{ Params: { id: string } }>(
      '/v1/webhook-subscriptions/:id',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'webhooks:read'))) return
        const row = await ownRow(request, request.params.id)
        if (!row) return notFound(reply, request.params.id)
        return reply.send({ data: row })
      },
    )

    fastify.patch<{ Params: { id: string } }>(
      '/v1/webhook-subscriptions/:id',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'webhooks:write'))) return
        const parsed = PatchBody.safeParse(request.body ?? {})
        if (!parsed.success) {
          return reply
            .status(400)
            .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
        }
        const row = await ownRow(request, request.params.id)
        if (!row) return notFound(reply, request.params.id)
        await subs.updateSettings(row.id, {
          format: parsed.data.format,
          headers: parsed.data.headers,
          label: parsed.data.label,
        })
        const updated = await ownRow(request, row.id)
        return reply.send({ data: updated })
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/v1/webhook-subscriptions/:id',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'webhooks:write'))) return
        const row = await ownRow(request, request.params.id)
        if (!row) return notFound(reply, request.params.id)
        await subs.delete(row.id)
        return reply.status(204).send()
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/v1/webhook-subscriptions/:id/test',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'webhooks:write'))) return
        const row = await ownRow(request, request.params.id)
        if (!row) return notFound(reply, request.params.id)
        const result = await sendSyntheticTest(
          { subs, fetchImpl: opts.fetchImpl, resolvePlatformName: opts.resolvePlatformName },
          row.id,
        )
        if (!result) return notFound(reply, request.params.id)
        return reply.send({ data: result })
      },
    )

    fastify.post<{ Params: { id: string }; Body: { paused?: boolean } }>(
      '/v1/webhook-subscriptions/:id/paused',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'webhooks:write'))) return
        const row = await ownRow(request, request.params.id)
        if (!row) return notFound(reply, request.params.id)
        const paused = (request.body as { paused?: boolean } | undefined)?.paused ?? true
        await subs.setPaused(row.id, paused)
        return reply.send({ data: { id: row.id, paused } })
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/v1/webhook-subscriptions/:id/rotate-secret',
      async (request, reply) => {
        if (!(await assertScope(request, reply, 'webhooks:write'))) return
        const row = await ownRow(request, request.params.id)
        if (!row) return notFound(reply, request.params.id)
        const secret = await subs.rotateSecret(row.id)
        if (secret === null) return notFound(reply, request.params.id)
        return reply.send({ data: { id: row.id, secret } })
      },
    )

    if (deliveries) {
      fastify.get<{ Params: { id: string }; Querystring: { status?: string; limit?: string } }>(
        '/v1/webhook-subscriptions/:id/deliveries',
        async (request, reply) => {
          if (!(await assertScope(request, reply, 'webhooks:read'))) return
          const row = await ownRow(request, request.params.id)
          if (!row) return notFound(reply, request.params.id)
          const status =
            request.query.status === 'pending' ||
            request.query.status === 'delivered' ||
            request.query.status === 'dead'
              ? request.query.status
              : undefined
          const limit = request.query.limit ? Number(request.query.limit) : undefined
          const data = await deliveries.listForSubscription(row.id, { status, limit })
          return reply.send({ data })
        },
      )
    }
  }
}
