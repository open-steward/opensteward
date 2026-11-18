/**
 * Admin passthrough for `/admin/webhook-subscriptions` on integration-server.
 *
 * Subscriptions own outbound delivery of customer.* and connect_link.*
 * events. Mint / revoke are admin-only and audited; list is operator+.
 * The plaintext shared secret is returned ONCE on create.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { UnifiedClient } from '../proxy/client'
import type { AdminStore } from '../db/admin-store'
import {
  WebhookDelivery,
  WebhookSubscription,
  WebhookTestResult,
  WebhookSubscriptionWithSecret,
  dataEnvelope,
  listEnvelope,
  errorBody,
  noContent,
} from './_openapi'
import { RepeatableString, one } from './_query'
import { denyRestrictedScope } from '../auth/access'

const TAG = 'webhook-subs'

const ListQuery = z.object({
  tenantId: z.string().optional(),
  search: z.string().optional().meta({
    description:
      'Case-insensitive substring match over the subscription label and URL. Applied server-side over the whole set, so a match is found regardless of where the row sits in the list.',
    example: 'billing',
  }),
})
const CreateBody = z
  .object({
    tenantId: z.string().min(1).meta({
      description: 'Tenant (operator customer) that will own the subscription.',
      example: 'acme',
    }),
    url: z.string().min(1).meta({
      description: 'HTTPS endpoint that will receive event deliveries.',
      example: 'https://hooks.acme.example/opensteward',
    }),
    label: z.string().max(200).nullable().optional().meta({
      description:
        'Optional human-friendly name for the subscription, shown and searched in the admin list.',
      example: 'Billing service',
    }),
    events: z
      .array(z.string())
      .optional()
      .meta({
        description: 'Event types to subscribe to; omit to subscribe to all events.',
        example: ['customer.created'],
      }),
    format: z.enum(['opensteward', 'slack', 'teams', 'flat']).optional().meta({
      description:
        'Payload shape for this endpoint. Defaults to `opensteward`, the signed event envelope. Use `slack` for a Slack incoming webhook, `teams` for a Teams Workflows URL, `flat` for tools that only map top-level fields.',
      example: 'slack',
    }),
    headers: z
      .record(z.string(), z.string())
      .optional()
      .meta({
        description:
          'Custom headers sent with every delivery, for receivers that authenticate by header. Stored encrypted and never returned. Reserved names (`x-oi-*`, `host`, `content-*`, hop-by-hop) are rejected.',
        example: { 'X-Api-Key': 'k-123' },
      }),
  })
  .meta({
    id: 'CreateWebhookSubscriptionBody',
    description:
      'Request body to create a webhook subscription. The signing secret is returned once in the response.',
  })

const UpdateBody = z
  .object({
    format: z
      .enum(['opensteward', 'slack', 'teams', 'flat'])
      .optional()
      .meta({ description: 'New payload shape for this endpoint.', example: 'slack' }),
    headers: z
      .record(z.string(), z.string())
      .nullable()
      .optional()
      .meta({
        description:
          'Replaces the custom headers wholesale; an empty object or null clears them. Values are never returned.',
        example: { 'X-Api-Key': 'k-456' },
      }),
    label: z.string().max(200).nullable().optional().meta({
      description:
        'New human-friendly name for the subscription. Null or a blank string clears it; omit the field to leave it unchanged.',
      example: 'Billing service',
    }),
  })
  .meta({
    id: 'UpdateWebhookSubscriptionBody',
    description:
      "Request body to change a webhook subscription's label or delivery settings. The URL and event list are immutable.",
  })

const IdParam = z.object({ id: z.string() })
const DeliveryParams = z.object({ id: z.string(), deliveryId: z.string() })

/**
 * EVERY param here is `RepeatableString`, never a bare `z.string()`.
 *
 * Fastify's parser yields an ARRAY for a repeated key, and a bare string
 * schema answers **400 for the whole page** on one — a stale bookmark, a
 * back/forward resubmission, or any client that appends rather than replaces a
 * param. This operation was the last list endpoint in admin-api still doing
 * that while `/api/connections`, `/api/end-users` and `/api/audit` returned
 * 200 in their default order; one route 400ing where three siblings degrade is
 * a less predictable surface than either extreme.
 *
 * All of them, not only the two that were reported: `status` never 400s past
 * this schema but silently DROPS the filter one layer down (an array matches
 * none of the three literals the handler tests for), which widens the result
 * set while the control on screen still claims to be narrowed — the quiet half
 * of the same defect. Converting some params and leaving others reads as
 * deliberate to the next reader, and is not.
 *
 * Widening the schema is only half the job: every value below MUST pass
 * through `one()` before it is used. A `RepeatableString` that reaches
 * `.trim()`, a clamp, or the store as a raw array turns this 400 into a 500,
 * which is the strictly worse outcome — and is exactly what
 * `webhook-subs-admin-router.ts` beneath this hop was doing until Plan 3 Part
 * E fix-round 1 (`filter.eventType.toLowerCase is not a function`).
 */
const DeliveriesQuery = z.object({
  // A plain string, not a strict enum: this reaches admin-api forwarded
  // verbatim from the admin app's own enum `<select>` (routes/webhooks.ts),
  // which can only ever submit one of its three known values UNLESS the URL
  // is hand-edited — same shape as /connections' own `f_status`
  // (admin-api's `routes/connections.ts` `ListQuery.status`). A strict
  // `z.enum(...)` here would 400 the whole page on a hand-edited garbage
  // value instead of degrading to "no status filter", which is what the
  // handler below does by discarding anything that isn't one of the three
  // known values.
  status: RepeatableString.optional().meta({
    description:
      'Filter by delivery status: `pending`, `delivered` or `dead`. An unrecognised value is ignored and no status filter is applied.',
    example: 'dead',
  }),
  limit: RepeatableString.optional(),
  page: RepeatableString.optional(),
  // Sorting and per-column filters for the /webhooks/:id/deliveries admin
  // page. Forwarded to integration-server's
  // `GET /admin/webhook-subscriptions/:id/deliveries` (and from there into
  // `WebhookDeliveryStore.listForSubscription`/`countForSubscription`) with
  // the SAME key names — see `UnifiedClient.listWebhookDeliveriesPaged`.
  sort: RepeatableString.optional().meta({
    description:
      'Column to order by: one of `eventType`, `eventId`, `status`, `attempts`. An unrecognised value is ignored and the default order (most recent first) is used.',
    example: 'status',
  }),
  dir: RepeatableString.optional().meta({
    description:
      'Sort direction: `asc` or `desc`. Any other value (including omitted) is ascending.',
    example: 'desc',
  }),
  eventType: RepeatableString.optional().meta({
    description: 'Case-insensitive substring match against the event type.',
    example: 'customer.created',
  }),
  eventId: RepeatableString.optional().meta({
    description: 'Case-insensitive substring match against the event id.',
    example: 'evt_123',
  }),
})

export function createWebhookSubsRoutes(client: UnifiedClient, adminStore: AdminStore) {
  return async function webhookSubsRoutes(fastify: FastifyInstance): Promise<void> {
    // Not tenant-scoped yet: a tenant-restricted caller is refused outright
    // (403 SCOPE_RESTRICTED) rather than shown every tenant's rows.
    fastify.addHook('preHandler', denyRestrictedScope)
    fastify.get<{ Querystring: { tenantId?: string; search?: string } }>(
      '/api/webhook-subscriptions',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'List tenant webhook subscriptions',
          description:
            'List webhook subscriptions (outbound delivery targets for `customer.*` and `connect_link.*` events), optionally filtered by `tenantId` and by a `search` over the label and URL. Operator role or higher. Signing secrets are not included.',
          operationId: 'webhook-subs.list',
          querystring: ListQuery,
          response: {
            200: listEnvelope(WebhookSubscription),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        let data = await client.listWebhookSubs(request.query.tenantId)
        // Search runs here rather than in the browser, for the same reason it
        // does on /api/connections: filtering client-side would only ever
        // search the rows already rendered. Label and URL are what an operator
        // arrives knowing — the id is a UUID nobody memorises.
        const search = request.query.search?.trim().toLowerCase()
        if (search) {
          data = data.filter((sub) => {
            const row = sub as { label?: string | null; url?: string | null }
            return (
              (row.label ?? '').toLowerCase().includes(search) ||
              (row.url ?? '').toLowerCase().includes(search)
            )
          })
        }
        return { data, meta: { page: 1, limit: data.length, total: data.length } }
      },
    )

    fastify.post(
      '/api/webhook-subscriptions',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Create a webhook subscription (secret returned once)',
          description:
            'Create a webhook subscription that delivers events to the given URL. Admin role required. The response includes the signing secret **once** — it is not stored in retrievable form and cannot be fetched again. Returns `400` if `tenantId` or `url` is missing. Writes a `webhook_sub.create` audit entry.',
          operationId: 'webhook-subs.create',
          body: CreateBody,
          response: {
            201: dataEnvelope(WebhookSubscriptionWithSecret),
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
              url?: string
              label?: string | null
              events?: string[]
              format?: 'opensteward' | 'slack' | 'teams' | 'flat'
              headers?: Record<string, string>
            }
          | undefined
        if (!body?.tenantId || !body.tenantId.trim()) {
          return reply.status(400).send({ error: 'tenantId is required.' })
        }
        if (!body.url || !body.url.trim()) {
          return reply.status(400).send({ error: 'url is required.' })
        }
        const events = Array.isArray(body.events)
          ? body.events.map((e) => String(e).trim()).filter((e) => e.length > 0)
          : undefined
        const data = await client.createWebhookSub({
          tenantId: body.tenantId.trim(),
          url: body.url.trim(),
          label: body.label,
          events: events && events.length > 0 ? events : undefined,
          format: body.format,
          headers: body.headers,
        })
        adminStore.writeAudit(
          request.jwtUser!.id,
          'webhook_sub.create',
          undefined,
          (data as { id?: string } | null)?.id,
        )
        return reply.status(201).send({ data })
      },
    )

    fastify.delete<{ Params: { id: string } }>(
      '/api/webhook-subscriptions/:id',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Delete a webhook subscription',
          description:
            'Delete a webhook subscription by id, stopping further deliveries immediately. Admin role required. Returns `404` if no subscription matches the id. Writes a `webhook_sub.delete` audit entry.',
          operationId: 'webhook-subs.delete',
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
        const ok = await client.deleteWebhookSub(request.params.id)
        if (!ok) return reply.status(404).send({ error: 'Webhook subscription not found.' })
        adminStore.writeAudit(
          request.jwtUser!.id,
          'webhook_sub.delete',
          undefined,
          request.params.id,
        )
        return reply.status(204).send()
      },
    )

    fastify.post<{ Params: { id: string }; Body: { paused?: boolean } }>(
      '/api/webhook-subscriptions/:id/paused',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Pause or resume a webhook subscription',
          description:
            'Pause (default) or resume a subscription. A paused subscription is retained but receives no deliveries. Admin role required. Writes a `webhook_sub.pause` audit entry.',
          operationId: 'webhook-subs.pause',
          params: IdParam,
          body: z.object({ paused: z.boolean().optional() }),
          response: {
            200: dataEnvelope(z.object({ id: z.string(), paused: z.boolean() })),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const paused = (request.body as { paused?: boolean } | undefined)?.paused ?? true
        const ok = await client.pauseWebhookSub(request.params.id, paused)
        if (!ok) return reply.status(404).send({ error: 'Webhook subscription not found.' })
        adminStore.writeAudit(
          request.jwtUser!.id,
          'webhook_sub.pause',
          undefined,
          request.params.id,
        )
        return reply.status(200).send({ data: { id: request.params.id, paused } })
      },
    )

    fastify.patch<{ Params: { id: string } }>(
      '/api/webhook-subscriptions/:id',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Change a webhook subscription label, payload format or headers',
          description:
            'Change the label, and how deliveries are shaped and authenticated for this subscription. The URL and event list are immutable — recreate the subscription to change those. Headers are replaced wholesale rather than merged, so an operator can remove one; an empty object clears them. Header values are stored encrypted and never returned. Admin role required. Writes a `webhook_sub.update` audit entry.',
          operationId: 'webhook-subs.update',
          params: IdParam,
          body: UpdateBody,
          response: {
            200: dataEnvelope(WebhookSubscription),
            400: errorBody,
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const body = request.body as
          | {
              format?: 'opensteward' | 'slack' | 'teams' | 'flat'
              headers?: Record<string, string> | null
              label?: string | null
            }
          | undefined
        if (
          !body ||
          (body.format === undefined && body.headers === undefined && body.label === undefined)
        ) {
          return reply
            .status(400)
            .send({ error: 'Supply at least one of format, headers or label.' })
        }
        const data = await client.updateWebhookSub(request.params.id, {
          format: body.format,
          headers: body.headers,
          label: body.label,
        })
        adminStore.writeAudit(
          request.jwtUser!.id,
          'webhook_sub.update',
          undefined,
          request.params.id,
        )
        return reply.status(200).send({ data })
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/api/webhook-subscriptions/:id/test',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Send a test event to a webhook subscription',
          description:
            'Sends one synthetic `opensteward.test` event to this subscription, rendered in its own format, signed with its own secret and carrying its custom headers — so a destination can be proven to work without creating real data to trigger a real event. Nothing is queued and no delivery row is written. A receiver that rejects the payload is reported as `ok: false` with its status code rather than as an error. Works on a paused subscription. Admin role required. Writes a `webhook_sub.test` audit entry.',
          operationId: 'webhook-subs.test',
          params: IdParam,
          response: {
            200: dataEnvelope(WebhookTestResult),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const data = await client.testWebhookSub(request.params.id)
        adminStore.writeAudit(request.jwtUser!.id, 'webhook_sub.test', undefined, request.params.id)
        return reply.status(200).send({ data })
      },
    )

    fastify.post<{ Params: { id: string } }>(
      '/api/webhook-subscriptions/:id/rotate-secret',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Rotate a webhook subscription signing secret',
          description:
            'Generate a NEW signing secret, replacing the old one. The plaintext is returned **once**. Admin role required. Writes a `webhook_sub.rotate_secret` audit entry.',
          operationId: 'webhook-subs.rotate-secret',
          params: IdParam,
          response: {
            200: dataEnvelope(z.object({ id: z.string(), secret: z.string() })),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const secret = await client.rotateWebhookSubSecret(request.params.id)
        if (secret === null)
          return reply.status(404).send({ error: 'Webhook subscription not found.' })
        adminStore.writeAudit(
          request.jwtUser!.id,
          'webhook_sub.rotate_secret',
          undefined,
          request.params.id,
        )
        return reply.status(200).send({ data: { id: request.params.id, secret } })
      },
    )

    fastify.get<{
      Params: { id: string }
      Querystring: {
        // `string | string[]`, matching `DeliveriesQuery` above and what
        // Fastify's parser really hands over. Typing these as bare strings
        // did not make them strings — it only hid the array from the
        // compiler, which is how the same defect reached the store one hop
        // down and 500'd there.
        status?: string | string[]
        limit?: string | string[]
        page?: string | string[]
        sort?: string | string[]
        dir?: string | string[]
        eventType?: string | string[]
        eventId?: string | string[]
      }
    }>(
      '/api/webhook-subscriptions/:id/deliveries',
      {
        preHandler: [fastify.authenticate, fastify.operatorOnly],
        schema: {
          tags: [TAG],
          summary: 'List deliveries for one subscription',
          description:
            'List recent delivery attempts for one subscription, optionally filtered by `status` (`pending`, `delivered`, `dead`), `eventType`, `eventId`, and ordered by `sort`/`dir`, capped by `limit`. Operator role or higher. Filters and sort apply before pagination, so `meta.total` reflects the filtered set and every page reflects the requested order. Useful for diagnosing failed or dead-lettered deliveries.',
          operationId: 'webhook-subs.deliveries.list',
          params: IdParam,
          querystring: DeliveriesQuery,
          response: {
            200: listEnvelope(WebhookDelivery),
            401: errorBody,
            403: errorBody,
          },
        },
      },
      async (request) => {
        // Asks upstream for exactly the requested page AND its real total in
        // one round trip (`listWebhookDeliveriesPaged`), rather than the old
        // shape of fetching `listWebhookDeliveries({ status })` with NO
        // limit and reading `all.length` as the total. That old call
        // silently collapsed to `WebhookDeliveryStore.listForSubscription`'s
        // own 50-row default (there was no way to ask it for "every matching
        // row"), so `meta.total` was capped at 50 no matter how many
        // deliveries actually existed, and a delivery past row 50 was
        // unreachable — `?page=2` sliced past the end of that 50-row array
        // and rendered an empty page while `_pagination.ejs` still offered a
        // Next link. Same fix, same shape, as `/api/end-users`.
        // Discarded rather than forwarded when it isn't one of the three
        // known values — `DeliveriesQuery.status` is deliberately a loose
        // string (see its own doc comment) so a hand-edited garbage value
        // degrades to "no status filter" instead of a 400 further upstream.
        //
        // `one()` first, on every param: a `RepeatableString` that reaches a
        // `.trim()` or a clamp as a raw array downgrades this route's 400 into
        // a 500, which is worse than what it replaced.
        const rawStatus = one(request.query.status)
        const status =
          rawStatus === 'pending' || rawStatus === 'delivered' || rawStatus === 'dead'
            ? rawStatus
            : undefined
        const page = Math.max(1, parseInt(one(request.query.page) ?? '1', 10) || 1)
        const limit = Math.min(
          Math.max(1, parseInt(one(request.query.limit) ?? '50', 10) || 50),
          200,
        )
        const { data, meta } = await client.listWebhookDeliveriesPaged(request.params.id, {
          status,
          eventType: one(request.query.eventType)?.trim() || undefined,
          eventId: one(request.query.eventId)?.trim() || undefined,
          sort: one(request.query.sort)?.trim() || undefined,
          dir: one(request.query.dir)?.trim() === 'desc' ? 'desc' : undefined,
          limit,
          offset: (page - 1) * limit,
        })
        return { data, meta: { page, limit, total: meta.total } }
      },
    )

    fastify.post<{ Params: { id: string; deliveryId: string } }>(
      '/api/webhook-subscriptions/:id/deliveries/:deliveryId/replay',
      {
        preHandler: [fastify.authenticate, fastify.adminOnly],
        schema: {
          tags: [TAG],
          summary: 'Replay a single webhook delivery',
          description:
            'Re-enqueue a single past delivery for redelivery, e.g. after the receiver was down. Admin role required. Responds `202 Accepted` with the queued delivery, or `404` if the subscription or delivery is not found. Writes a `webhook_delivery.replay` audit entry.',
          operationId: 'webhook-subs.deliveries.replay',
          params: DeliveryParams,
          response: {
            202: dataEnvelope(WebhookDelivery),
            401: errorBody,
            403: errorBody,
            404: errorBody,
          },
        },
      },
      async (request, reply) => {
        const data = await client.replayWebhookDelivery(
          request.params.id,
          request.params.deliveryId,
        )
        if (!data) return reply.status(404).send({ error: 'Delivery not found.' })
        adminStore.writeAudit(
          request.jwtUser!.id,
          'webhook_delivery.replay',
          undefined,
          request.params.deliveryId,
        )
        return reply.status(202).send({ data })
      },
    )
  }
}
