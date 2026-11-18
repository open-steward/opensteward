/**
 * `GET /api/webhook-subscriptions/:id/deliveries` — sort/filter forwarding,
 * and the live bug this closes: the route used to ask upstream via
 * `client.listWebhookDeliveries(id, { status })` with NO `limit`/`offset`,
 * then compute `meta.total` as `all.length` — which silently capped the
 * reported total at whatever `listForSubscription`'s own 50-row default
 * returned, so `?page=2` always sliced past the end of that 50-row array and
 * rendered empty regardless of how many deliveries actually existed.
 *
 * The fix asks upstream for exactly the requested page AND its real count in
 * one round trip (`client.listWebhookDeliveriesPaged`), mirroring
 * `/api/end-users`'s own fix in Plan 3 Part B.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import jwt from '@fastify/jwt'
import { registerOpenApiBridge } from '../../src/core/openapi-setup'
import { createWebhookSubsRoutes } from '../../src/core/routes/webhook-subs'
import { requireAuth, requireRole } from '../../src/core/auth/jwt-auth'
import type { UnifiedClient } from '../../src/core/proxy/client'
import type { AdminStore } from '../../src/core/db/admin-store'

const DELIVERY = {
  id: 'del_1',
  subscriptionId: 'whs_1',
  eventId: 'evt_1',
  eventType: 'customer.created',
  url: 'https://hooks.example.test/x',
  status: 'pending' as const,
  attempts: 0,
  nextAttemptAt: '2026-08-01T00:00:00.000Z',
  deliveredAt: null,
  lastStatus: null,
  lastError: null,
  createdAt: '2026-08-01T00:00:00.000Z',
}

const listWebhookDeliveriesPaged = vi.fn()

let app: FastifyInstance

beforeEach(async () => {
  listWebhookDeliveriesPaged.mockReset().mockResolvedValue({
    data: [DELIVERY],
    meta: { total: 1 },
  })

  app = Fastify({ logger: false })
  await registerOpenApiBridge(app)
  await app.register(jwt, { secret: 'test-jwt-secret-that-is-long-enough' })
  app.decorate('authenticate', requireAuth)
  app.decorate('operatorOnly', requireRole('operator'))
  app.decorate('adminOnly', requireRole('admin'))

  const client = { listWebhookDeliveriesPaged } as unknown as UnifiedClient
  const adminStore = { writeAudit: vi.fn() } as unknown as AdminStore
  await app.register(createWebhookSubsRoutes(client, adminStore))
  await app.ready()
})

afterEach(async () => {
  await app?.close()
})

function token() {
  return app.jwt.sign({ id: 'u1', username: 'admin', role: 'admin' })
}

async function list(query: string) {
  const res = await app.inject({
    method: 'GET',
    url: `/api/webhook-subscriptions/whs_1/deliveries${query}`,
    headers: { authorization: `Bearer ${token()}` },
  })
  return { statusCode: res.statusCode, body: res.json() }
}

describe('GET /api/webhook-subscriptions/:id/deliveries', () => {
  it('forwards sort, dir and every per-column filter to the upstream paged call', async () => {
    await list(
      '?page=2&limit=10&sort=status&dir=desc&eventType=customer.created&eventId=evt&status=dead',
    )
    expect(listWebhookDeliveriesPaged).toHaveBeenCalledWith(
      'whs_1',
      expect.objectContaining({
        status: 'dead',
        eventType: 'customer.created',
        eventId: 'evt',
        sort: 'status',
        dir: 'desc',
        limit: 10,
        // page 2 at limit 10 → offset 10. Wrong math here (e.g. reusing
        // page*limit) would ask upstream for the wrong window silently.
        offset: 10,
      }),
    )
  })

  // `DeliveriesQuery.status` is deliberately a loose string, not a strict
  // zod enum (see its own doc comment) — a hand-edited `?status=` must
  // degrade to "no status filter" rather than 400ing the whole page.
  it('discards a status value that is not pending/delivered/dead, rather than forwarding it', async () => {
    const { statusCode } = await list('?status=bogus')
    expect(statusCode).toBe(200)
    expect(listWebhookDeliveriesPaged).toHaveBeenCalledWith(
      'whs_1',
      expect.objectContaining({ status: undefined }),
    )
  })

  // The bug this whole fix exists to close, exercised end to end: `meta.total`
  // must come from the upstream count, not from `data.length` — a mutation
  // that reverted to `total: data.length` would make this fail even though
  // the mocked page below only carries 3 rows.
  it("a delivery past row 50 is reachable: meta.total reflects the upstream count, not the page's own length", async () => {
    listWebhookDeliveriesPaged.mockResolvedValue({
      data: [DELIVERY, { ...DELIVERY, id: 'del_2' }, { ...DELIVERY, id: 'del_3' }],
      meta: { total: 55 },
    })
    const { statusCode, body } = await list('?page=2&limit=50')
    expect(statusCode).toBe(200)
    expect(body.data).toHaveLength(3)
    expect(body.meta).toEqual({ page: 2, limit: 50, total: 55 })
    expect(listWebhookDeliveriesPaged).toHaveBeenCalledWith(
      'whs_1',
      expect.objectContaining({ limit: 50, offset: 50 }),
    )
  })

  it('defaults to page 1 / limit 50 when neither is supplied', async () => {
    await list('')
    expect(listWebhookDeliveriesPaged).toHaveBeenCalledWith(
      'whs_1',
      expect.objectContaining({ limit: 50, offset: 0 }),
    )
  })

  /**
   * A repeated query key. Fastify's parser yields an ARRAY for one, and every
   * param of this operation was a bare `z.string()` — so `?eventType=a&eventType=b`
   * answered **400 for the whole page**, from a stale bookmark, a
   * back/forward resubmission, or any client that appends rather than
   * replaces a param. This was the last list endpoint in admin-api still
   * doing that while `/api/connections`, `/api/end-users` and `/api/audit`
   * degraded to 200.
   *
   * The status code is asserted first, because 400 is what the bug produced.
   * The VALUES then pin last-wins rather than merely "did not 400": the
   * SECOND value of each pair must take effect — the first is what a `v[0]`
   * collapse returns, and either would be "not a 400".
   *
   * `limit`/`page` are included deliberately. They never 400'd (a bare
   * `z.string()` rejects the array before the handler, and `parseInt` would
   * have coerced it anyway), but leaving them as the only two bare strings in
   * a converted operation is the inconsistency this change exists to remove.
   */
  it('collapses every repeated param to its last value instead of 400ing', async () => {
    const { statusCode } = await list(
      '?eventType=first.type&eventType=second.type' +
        '&eventId=evt-first&eventId=evt-second' +
        '&sort=nope&sort=status' +
        '&dir=asc&dir=desc' +
        '&status=pending&status=dead' +
        '&page=1&page=3' +
        '&limit=10&limit=25',
    )
    expect(statusCode).toBe(200)
    expect(listWebhookDeliveriesPaged).toHaveBeenCalledWith(
      'whs_1',
      expect.objectContaining({
        eventType: 'second.type',
        eventId: 'evt-second',
        sort: 'status',
        dir: 'desc',
        status: 'dead',
        // page 3 at limit 25 → offset 50. A `v[0]` collapse gives page 1 at
        // limit 10, i.e. offset 0 — a different number, not merely a
        // different page.
        limit: 25,
        offset: 50,
      }),
    )
  })

  /**
   * The quiet half of the same defect, which is why `status` was converted
   * alongside the two that were reported. A repeated `?status=` reaching the
   * handler as an array matches none of the three literals it tests for, so
   * the filter is silently DROPPED and the result set widens while the
   * control on screen still claims to be narrowed.
   *
   * Distinct from the `?status=bogus` test above: that one asserts a garbage
   * value degrades to `undefined`, which is the CORRECT answer. Here
   * `undefined` is the WRONG answer — both values are legitimate, and the
   * last one must win.
   */
  it('applies a repeated status rather than silently dropping the filter', async () => {
    await list('?status=pending&status=delivered')
    expect(listWebhookDeliveriesPaged).toHaveBeenCalledWith(
      'whs_1',
      expect.objectContaining({ status: 'delivered' }),
    )
  })
})
