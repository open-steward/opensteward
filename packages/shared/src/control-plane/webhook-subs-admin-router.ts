/**
 * Admin-guarded routes for managing tenant-scoped outbound webhook
 * subscriptions.
 *
 *   GET    /admin/webhook-subscriptions[?tenantId=...]
 *   POST   /admin/webhook-subscriptions          create — secret returned ONCE
 *   PATCH  /admin/webhook-subscriptions/:id      change format / headers
 *   POST   /admin/webhook-subscriptions/:id/test send one synthetic event
 *   DELETE /admin/webhook-subscriptions/:id      delete
 *
 * Gated by the same X-Admin-Secret guard as the rest of /admin/*.
 */
import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import type {
  DeliveryFilter,
  DeliveryStatus,
  WebhookDeliveryStore,
} from '../auth/webhook-deliveries'
import {
  MAX_WEBHOOK_LABEL_LENGTH,
  type WebhookSubscriptionStore,
} from '../auth/webhook-subscriptions'
import { adminGuard } from './admin-guard'
import { one } from '../util/query-params'
import { WEBHOOK_FORMATS } from './webhook-formats'
import { validateHeaders } from './webhook-headers'
import { sendSyntheticTest } from './webhook-test-send'

export interface WebhookSubsAdminRouterOptions {
  subs: WebhookSubscriptionStore
  /** Optional. When supplied, /admin/webhook-subscriptions/:id/deliveries[/...] endpoints are mounted. */
  deliveries?: WebhookDeliveryStore
  /** Test hook. Defaults to `safeFetch`, so a test send is SSRF-guarded too. */
  fetchImpl?: typeof fetch
  /** Resolves a platform slug to a display name for the readable formats. */
  resolvePlatformName?: (slug: string) => string | undefined
}

/**
 * Custom headers arrive as a plain object. Zod checks the container; the
 * grammar, the denylist and the size caps live in `validateHeaders()` so the
 * admin UI and this route enforce exactly the same rule.
 */
const HeadersMap = z
  .record(z.string(), z.string())
  .superRefine((value: Record<string, string>, ctx: z.RefinementCtx) => {
    const result = validateHeaders(value)
    // Surface the specific reason ("x-oi-signature is reserved", "value
    // contains a line break") rather than a generic "invalid" — the operator
    // is looking at a form field they just typed into.
    if (!result.ok) ctx.addIssue({ code: 'custom', message: result.reason })
  })

const CreateBody = z
  .object({
    tenantId: z.string().min(1).max(200),
    url: z.string().url(),
    label: z.string().max(MAX_WEBHOOK_LABEL_LENGTH).nullish(),
    events: z.array(z.string().min(1).max(80)).max(40).optional(),
    format: z.enum(WEBHOOK_FORMATS).optional(),
    headers: HeadersMap.optional(),
  })
  .strict()

/**
 * Only the label and the delivery settings can change; `url` and `events`
 * are immutable — this route exists so a header credential can be rotated,
 * or a subscription renamed, without deleting it and losing its delivery
 * history.
 */
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

export function createWebhookSubsAdminRouter(
  opts: WebhookSubsAdminRouterOptions,
): FastifyPluginAsync {
  const { subs, deliveries } = opts

  return async (fastify) => {
    fastify.addHook('preHandler', async (request, reply) => {
      if (!adminGuard(request, reply)) return reply
      return
    })

    fastify.get<{ Querystring: { tenantId?: string } }>(
      '/admin/webhook-subscriptions',
      async (request) => {
        const data = await subs.list(request.query.tenantId)
        return { data }
      },
    )

    fastify.post('/admin/webhook-subscriptions', async (request, reply) => {
      const parsed = CreateBody.safeParse(request.body ?? {})
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
      }
      const created = await subs.create({
        tenantId: parsed.data.tenantId,
        url: parsed.data.url,
        label: parsed.data.label,
        events: parsed.data.events,
        format: parsed.data.format,
        headers: parsed.data.headers,
      })
      // `created` carries the one-time signing secret. It never carries a
      // header value: the caller supplied those and they are not echoed back.
      return reply.status(201).send({ data: created })
    })

    fastify.patch<{ Params: { id: string } }>(
      '/admin/webhook-subscriptions/:id',
      async (request, reply) => {
        const parsed = PatchBody.safeParse(request.body ?? {})
        if (!parsed.success) {
          return reply
            .status(400)
            .send({ error: { code: 'VALIDATION', issues: parsed.error.issues } })
        }
        const ok = await subs.updateSettings(request.params.id, {
          format: parsed.data.format,
          headers: parsed.data.headers,
          label: parsed.data.label,
        })
        if (!ok) return reply.status(404).send({ error: { code: 'WEBHOOK_SUB_NOT_FOUND' } })
        const [updated] = await subs
          .list()
          .then((rows) => rows.filter((r) => r.id === request.params.id))
        return reply.status(200).send({ data: updated })
      },
    )

    /**
     * Send one synthetic event to this subscription, so an operator can prove
     * a destination works without creating real data to trigger a real event.
     *
     * Deliberately synchronous and deliberately NOT queued: the result is the
     * whole point, and a diagnostic must neither pollute the delivery record
     * of real events nor be picked up and retried by the worker when the
     * receiver rejects it. A rejection is reported as a result — the answer to
     * "does this work?" is no, which is not an error in this API.
     */
    fastify.post<{ Params: { id: string } }>(
      '/admin/webhook-subscriptions/:id/test',
      async (request, reply) => {
        const result = await sendSyntheticTest(
          { subs, fetchImpl: opts.fetchImpl, resolvePlatformName: opts.resolvePlatformName },
          request.params.id,
        )
        if (!result) return reply.status(404).send({ error: { code: 'WEBHOOK_SUB_NOT_FOUND' } })
        return reply.status(200).send({ data: result })
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/admin/webhook-subscriptions/:id',
      async (request, reply) => {
        const ok = await subs.delete(request.params.id)
        if (!ok) return reply.status(404).send({ error: { code: 'WEBHOOK_SUB_NOT_FOUND' } })
        return reply.status(204).send()
      },
    )

    // Pause/resume — retains the subscription but stops deliveries.
    fastify.post<{ Params: { id: string }; Body: { paused?: boolean } }>(
      '/admin/webhook-subscriptions/:id/paused',
      async (request, reply) => {
        const paused = (request.body as { paused?: boolean } | undefined)?.paused ?? true
        const ok = await subs.setPaused(request.params.id, paused)
        if (!ok) return reply.status(404).send({ error: { code: 'WEBHOOK_SUB_NOT_FOUND' } })
        return reply.status(200).send({ data: { id: request.params.id, paused } })
      },
    )

    // Rotate the signing secret — new plaintext returned ONCE.
    fastify.post<{ Params: { id: string } }>(
      '/admin/webhook-subscriptions/:id/rotate-secret',
      async (request, reply) => {
        const secret = await subs.rotateSecret(request.params.id)
        if (secret === null) {
          return reply.status(404).send({ error: { code: 'WEBHOOK_SUB_NOT_FOUND' } })
        }
        return reply.status(200).send({ data: { id: request.params.id, secret } })
      },
    )

    if (deliveries) {
      fastify.get<{
        Params: { id: string }
        Querystring: {
          // `string | string[]` because that is what Fastify's parser really
          // hands over: a repeated key arrives as an ARRAY. Typing these as
          // bare strings did not make them strings — it only hid the array
          // from the compiler, and `eventType`/`eventId` reached
          // `WebhookDeliveryStore.deliveryWhere`'s `.toLowerCase()` as one,
          // which is an unhandled 500 on this X-Admin-Secret route (verified
          // live: `?eventType=a&eventType=b` →
          // `filter.eventType.toLowerCase is not a function`). admin-api's own
          // hop 400s first because its schema uses a bare `z.string()`, so the
          // admin UI never reached it — a direct admin-secret caller did.
          // Every read below goes through `one()`.
          status?: string | string[]
          limit?: string | string[]
          offset?: string | string[]
          // Additive-optional: existing callers (the dev router's own
          // `/v1/webhook-subscriptions/:id/deliveries`, and this route's own
          // prior shape) send only `status`/`limit` and are unaffected. Bare
          // names, no `f_`-prefixed wire form — this is an X-Admin-Secret
          // -gated internal surface, not the admin app's own `?f_<key>=` URL
          // convention, and every hop from here down to
          // `WebhookDeliveryStore.listForSubscription`/`countForSubscription`
          // uses these exact same key names. Only admin-api's OWN route
          // (`routes/webhook-subs.ts`) maps the admin app's `f_<key>` params
          // onto these — same split as `/admin/end-users` and
          // `routes/end-users.ts`.
          sort?: string | string[]
          dir?: string | string[]
          eventType?: string | string[]
          eventId?: string | string[]
        }
      }>('/admin/webhook-subscriptions/:id/deliveries', async (request) => {
        // `one()` on EVERY param, not only the two that crashed. A repeated
        // `?status=` collapsed to an array matches none of the three literals
        // below, so it silently drops the filter and WIDENS the result set —
        // the quiet half of the same defect, and the one this whole body of
        // work exists to stop.
        const rawStatus = one(request.query.status)
        const status: DeliveryStatus | undefined =
          rawStatus === 'pending' || rawStatus === 'delivered' || rawStatus === 'dead'
            ? rawStatus
            : undefined
        const eventType = one(request.query.eventType)
        const eventId = one(request.query.eventId)
        const sort = one(request.query.sort)
        const dir = one(request.query.dir) === 'desc' ? 'desc' : undefined
        const rawLimit = one(request.query.limit)
        const rawOffset = one(request.query.offset)
        const limit = rawLimit ? Number(rawLimit) : undefined
        const offset = rawOffset ? Number(rawOffset) : undefined
        const filter: DeliveryFilter = { status, eventType, eventId }
        // `meta.total` from a real COUNT, run alongside the page fetch — not
        // `listForSubscription()` with no limit, its length read as the
        // total. That was the old shape (see admin-api's
        // `routes/webhook-subs.ts`, pre-fix) and it silently capped the
        // reported total at `listForSubscription()`'s own 50-row default,
        // since there was no way to ask the old code for "every matching
        // row" at all — see `WebhookDeliveryStore.countForSubscription`'s doc
        // comment. Same fix, same shape, as `/admin/end-users` above.
        const [data, total] = await Promise.all([
          deliveries.listForSubscription(request.params.id, {
            ...filter,
            limit,
            offset,
            sort,
            dir,
          }),
          deliveries.countForSubscription(request.params.id, filter),
        ])
        return { data, meta: { total } }
      })

      fastify.post<{ Params: { id: string; deliveryId: string } }>(
        '/admin/webhook-subscriptions/:id/deliveries/:deliveryId/replay',
        async (request, reply) => {
          const ok = await deliveries.replay(request.params.deliveryId)
          if (!ok) return reply.status(404).send({ error: { code: 'DELIVERY_NOT_FOUND' } })
          // `getById` is async — an un-awaited call here sends the Promise
          // itself as `data`, which serialises as `{}` (a Promise has no
          // enumerable own properties), silently discarding the replayed
          // row's real fields from a 202 response callers rely on.
          return reply
            .status(202)
            .send({ data: await deliveries.getById(request.params.deliveryId) })
        },
      )
    }
  }
}
