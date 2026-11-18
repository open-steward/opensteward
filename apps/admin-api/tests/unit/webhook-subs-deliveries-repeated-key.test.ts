/**
 * A repeated query key on `/api/webhook-subscriptions/:id/deliveries`, across
 * BOTH hops at once, with nothing mocked between them.
 *
 * Fastify's parser yields an ARRAY for a repeated key, and every layer of this
 * path handled that badly in a different way:
 *
 *   admin-api  `DeliveriesQuery` was bare `z.string()` → **400** for the whole
 *              page, on a stale bookmark or a back/forward resubmission.
 *   shared     `webhook-subs-admin-router` destructured every param raw, so
 *              `eventType`/`eventId` reached `WebhookDeliveryStore`'s
 *              `.toLowerCase()` as an array → **500**
 *              (`filter.eventType.toLowerCase is not a function`), and
 *              `status`/`sort` were silently DROPPED, widening the result set
 *              while the control on screen still claimed to be narrowed.
 *
 * The two are fixed in different packages and pinned by their own unit tests
 * (`webhook-subs-deliveries-pagination.test.ts` here,
 * `webhook-subs-admin-router.test.ts` in shared) — each of which mocks or
 * stands in for the other side. What neither can show is the WHOLE path
 * answering 200 with the right rows, which is what this file is for.
 *
 * What it does NOT prove, despite the temptation to claim it: that fixing the
 * 400 did not merely uncover the 500 beneath it. It cannot — admin-api now
 * collapses the array at its own hop, so an array never reaches the shared
 * router by this path, and reverting shared's own `one()` leaves this file
 * green (while shared's own suite goes red). That is defence in depth seen
 * from outside, not an untested path.
 *
 * What it DOES catch is the half-fix: widening the schema to
 * `RepeatableString` without collapsing the value downgrades the 400 into a
 * 500 inside admin-api itself, and every one of those reverts is red here.
 *
 * Same harness shape as `unified-client-post-body.test.ts`: a real Fastify
 * server standing in for integration-server, a real `UnifiedClient` pointed at
 * it, and admin-api's own route registered on top.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import {
  openDb,
  WebhookDeliveryStore,
  WebhookSubscriptionStore,
  createWebhookSubsAdminRouter,
} from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { createWebhookSubsRoutes } from '../../src/core/routes/webhook-subs'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import { UnifiedClient } from '../../src/core/proxy/client'
import { isoifyTimestamps } from '../../src/core/routes/_openapi'
import type { AdminStore } from '../../src/core/db/admin-store'

const ADMIN_SECRET = 'end-to-end-admin-secret-32-chars-long!'
const SUB_SECRET = 'end-to-end-webhook-sub-secret-32-chars!'
const SUB_ID = 'whs_e2e'

let app: FastifyInstance
let upstream: FastifyInstance
let handle: DbHandle
let prevAdminSecret: string | undefined

beforeEach(async () => {
  prevAdminSecret = process.env['ADMIN_SECRET']
  process.env['ADMIN_SECRET'] = ADMIN_SECRET

  // The real upstream: integration-server's admin router over a real store.
  handle = await openDb({ sqlitePath: ':memory:' })
  const subs = await WebhookSubscriptionStore.create(handle, SUB_SECRET)
  const deliveries = await WebhookDeliveryStore.create(handle)
  // Distinct `created_at` values, stamped explicitly. `enqueue` uses
  // `Date.now()`, so two rows seeded in the same millisecond TIE on the
  // store's default `created_at DESC, id DESC` order and the `id` tiebreaker
  // is a `randomUUID` — which made the paging and sort assertions below pass
  // or fail by coin toss depending on how the ids happened to sort. evt-a is
  // the older row, so the default (newest-first) order is evt-b, evt-a.
  let createdAt = 1_700_000_000_000
  for (const [eventId, eventType] of [
    ['evt-a', 'customer.created'],
    ['evt-b', 'connect_link.completed'],
  ]) {
    const row = await deliveries.enqueue({
      subscriptionId: SUB_ID,
      eventId,
      eventType,
      url: 'https://hooks.example.test/x',
      body: '{}',
      signature: '',
    })
    await handle.kysely
      .updateTable('webhook_deliveries')
      .set({ created_at: createdAt++ })
      .where('id', '=', row.id)
      .execute()
  }
  upstream = Fastify({ logger: false })
  await upstream.register(createWebhookSubsAdminRouter({ subs, deliveries }))
  const address = await upstream.listen({ port: 0, host: '127.0.0.1' })

  // admin-api, talking to it through the real client.
  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))
  // The real server's `preSerialization` hook (core/server.ts), not
  // decoration: the store hands back `nextAttemptAt` as epoch-millis and this
  // route's response schema declares an ISO string, so without it every
  // response fails schema validation with a 500 that has nothing to do with
  // query params. Every other test on this route mocks the client and feeds
  // itself ISO strings, which is exactly why only a real two-hop harness
  // notices the hook is load-bearing.
  app.addHook('preSerialization', async (_request, _reply, payload) =>
    isoifyTimestamps(payload),
  )
  const client = new UnifiedClient({ url: address, adminSecret: ADMIN_SECRET })
  await app.register(createWebhookSubsRoutes(client, { writeAudit: vi.fn() } as unknown as AdminStore))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
  await upstream?.close()
  await handle?.close()
  if (prevAdminSecret === undefined) delete process.env['ADMIN_SECRET']
  else process.env['ADMIN_SECRET'] = prevAdminSecret
})

async function list(query: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/webhook-subscriptions/${SUB_ID}/deliveries${query}`,
    headers: { authorization: `Bearer ${app.jwt.sign({ id: 'u1', username: 'a', role: 'admin' })}` },
  })
  return { statusCode: res.statusCode, body: res.json() }
}

const eventIds = (body: { data: Array<{ eventId: string }> }) => body.data.map((d) => d.eventId)

describe('a repeated query key survives both hops', () => {
  it('answers the same as the single-valued request it collapses to', async () => {
    // The control: one value, one row.
    const single = await list('?eventType=connect_link')
    expect(single.statusCode).toBe(200)
    expect(eventIds(single.body)).toEqual(['evt-b'])

    // The same request with the key repeated. Last-wins, so it must answer
    // IDENTICALLY — not merely "not 400" and not merely "not 500".
    const repeated = await list('?eventType=customer&eventType=connect_link')
    expect(repeated.statusCode).toBe(200)
    expect(repeated.body).toEqual(single.body)
  })

  /**
   * The values matter as much as the status. `evt-a` is what a `v[0]` collapse
   * would return and `evt-b` is what last-wins returns — both are "not an
   * error", so a status-only assertion would pass against the wrong one.
   */
  it('applies the LAST value of every repeated filter, end to end', async () => {
    const byType = await list('?eventType=connect_link&eventType=customer')
    expect(byType.statusCode).toBe(200)
    expect(eventIds(byType.body)).toEqual(['evt-a'])

    const byId = await list('?eventId=evt-a&eventId=evt-b')
    expect(byId.statusCode).toBe(200)
    expect(eventIds(byId.body)).toEqual(['evt-b'])
  })

  /**
   * `status` never 400'd at the schema and never threw at the store — it was
   * silently discarded, which WIDENS the result set. Both seeded deliveries
   * are `pending`, so a dropped filter returns two rows and a total of 2;
   * last-wins picks `dead`, which matches neither.
   */
  it('does not silently widen the result set on a repeated status', async () => {
    const res = await list('?status=pending&status=dead')
    expect(res.statusCode).toBe(200)
    expect(res.body.data).toEqual([])
    expect(res.body.meta.total).toBe(0)
  })

  /**
   * `sort` is discarded rather than throwing one layer down
   * (`WEBHOOK_DELIVERY_SORT_KEYS.has(array)` is safely `false`), so this is the quiet case
   * again. The default order is newest-first — evt-b, evt-a — so asking for
   * eventType DESCENDING (`customer.created` before `connect_link.completed`,
   * i.e. evt-a, evt-b) is an order the default cannot produce. A dropped sort
   * returns the default and fails here.
   */
  it('applies the last sort and dir rather than falling back to the default order', async () => {
    const res = await list('?sort=nope&sort=eventType&dir=asc&dir=desc')
    expect(res.statusCode).toBe(200)
    expect(eventIds(res.body)).toEqual(['evt-a', 'evt-b'])
  })

  it('pages a repeated page/limit on the last value of each', async () => {
    const res = await list('?page=1&page=2&limit=10&limit=1')
    expect(res.statusCode).toBe(200)
    // page 2 at limit 1 → the second row in the default (newest-first) order.
    expect(res.body.meta).toEqual({ page: 2, limit: 1, total: 2 })
    expect(eventIds(res.body)).toEqual(['evt-a'])
  })
})
