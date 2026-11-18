import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { WebhookSubscriptionStore } from '../../src/auth/webhook-subscriptions'
import { WebhookDeliveryStore } from '../../src/auth/webhook-deliveries'
import { createWebhookSubsAdminRouter } from '../../src/control-plane/webhook-subs-admin-router'
import { createHmac } from 'crypto'

const SECRET = 'webhook-subs-admin-test-secret-32-chars!'
const ADMIN = 'admin-secret-for-router-tests-32-chars!'

interface Harness {
  fastify: FastifyInstance
  subs: WebhookSubscriptionStore
  deliveries: WebhookDeliveryStore
  handle: DbHandle
}

async function setup(fetchImpl?: typeof fetch): Promise<Harness> {
  const handle = await openDb({ sqlitePath: ':memory:' })
  const subs = await WebhookSubscriptionStore.create(handle, SECRET)
  const deliveries = await WebhookDeliveryStore.create(handle)
  const fastify = Fastify({ logger: false })
  await fastify.register(createWebhookSubsAdminRouter({ subs, deliveries, fetchImpl }))
  await fastify.ready()
  return { fastify, subs, deliveries, handle }
}

async function teardown(h: Harness) {
  await h.fastify.close()
  await h.handle.close()
}

describe('webhook-subs-admin-router', () => {
  let h: Harness
  let prevAdmin: string | undefined
  let prevNodeEnv: string | undefined

  beforeEach(async () => {
    // Exercise the real admin-secret path: header must match or 403.
    prevAdmin = process.env['ADMIN_SECRET']
    prevNodeEnv = process.env['NODE_ENV']
    process.env['ADMIN_SECRET'] = ADMIN
    h = await setup()
  })

  afterEach(async () => {
    await teardown(h)
    if (prevAdmin === undefined) delete process.env['ADMIN_SECRET']
    else process.env['ADMIN_SECRET'] = prevAdmin
    if (prevNodeEnv === undefined) delete process.env['NODE_ENV']
    else process.env['NODE_ENV'] = prevNodeEnv
  })

  const admin = { 'x-admin-secret': ADMIN }

  it('403s without a matching X-Admin-Secret header', async () => {
    const res = await h.fastify.inject({ method: 'GET', url: '/admin/webhook-subscriptions' })
    expect(res.statusCode).toBe(403)
    const bad = await h.fastify.inject({
      method: 'GET',
      url: '/admin/webhook-subscriptions',
      headers: { 'x-admin-secret': 'wrong' },
    })
    expect(bad.statusCode).toBe(403)
  })

  it('rejects an invalid create body with 400 VALIDATION', async () => {
    const res = await h.fastify.inject({
      method: 'POST',
      url: '/admin/webhook-subscriptions',
      headers: admin,
      payload: { tenantId: 't1', url: 'not-a-url' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION' } })
  })

  it('creates (secret returned once), lists, filters by tenant, and deletes', async () => {
    const created = await h.fastify.inject({
      method: 'POST',
      url: '/admin/webhook-subscriptions',
      headers: admin,
      payload: { tenantId: 't_a', url: 'https://example.com/hook', events: ['charge.succeeded'] },
    })
    expect(created.statusCode).toBe(201)
    const sub = created.json().data
    expect(sub.id).toBeTruthy()
    expect(sub.secret).toBeTruthy() // plaintext returned ONCE on create

    // A second tenant's subscription, to prove the tenantId filter.
    await h.fastify.inject({
      method: 'POST',
      url: '/admin/webhook-subscriptions',
      headers: admin,
      payload: { tenantId: 't_b', url: 'https://example.com/other' },
    })

    const filtered = await h.fastify.inject({
      method: 'GET',
      url: '/admin/webhook-subscriptions?tenantId=t_a',
      headers: admin,
    })
    expect(filtered.json().data.map((r: { tenantId: string }) => r.tenantId)).toEqual(['t_a'])

    const del = await h.fastify.inject({
      method: 'DELETE',
      url: `/admin/webhook-subscriptions/${sub.id}`,
      headers: admin,
    })
    expect(del.statusCode).toBe(204)

    const delAgain = await h.fastify.inject({
      method: 'DELETE',
      url: `/admin/webhook-subscriptions/${sub.id}`,
      headers: admin,
    })
    expect(delAgain.statusCode).toBe(404)
    expect(delAgain.json()).toMatchObject({ error: { code: 'WEBHOOK_SUB_NOT_FOUND' } })
  })

  it('pauses and rotates the secret of an existing subscription; 404s on a missing one', async () => {
    const created = await h.fastify.inject({
      method: 'POST',
      url: '/admin/webhook-subscriptions',
      headers: admin,
      payload: { tenantId: 't_p', url: 'https://example.com/hook' },
    })
    const id = created.json().data.id
    const firstSecret = created.json().data.secret

    const paused = await h.fastify.inject({
      method: 'POST',
      url: `/admin/webhook-subscriptions/${id}/paused`,
      headers: admin,
      payload: { paused: true },
    })
    expect(paused.statusCode).toBe(200)
    expect(paused.json()).toMatchObject({ data: { id, paused: true } })

    const rotated = await h.fastify.inject({
      method: 'POST',
      url: `/admin/webhook-subscriptions/${id}/rotate-secret`,
      headers: admin,
    })
    expect(rotated.statusCode).toBe(200)
    expect(rotated.json().data.secret).toBeTruthy()
    expect(rotated.json().data.secret).not.toBe(firstSecret)

    const missing = await h.fastify.inject({
      method: 'POST',
      url: '/admin/webhook-subscriptions/does-not-exist/rotate-secret',
      headers: admin,
    })
    expect(missing.statusCode).toBe(404)
  })

  it('404s replaying a delivery that does not exist', async () => {
    const res = await h.fastify.inject({
      method: 'POST',
      url: '/admin/webhook-subscriptions/sub1/deliveries/nope/replay',
      headers: admin,
    })
    expect(res.statusCode).toBe(404)
    expect(res.json()).toMatchObject({ error: { code: 'DELIVERY_NOT_FOUND' } })
  })

  // `getById` is async; an un-awaited call sends the bare Promise as `data`,
  // which serialises to `{}` — a 202 that LOOKS successful while silently
  // discarding the replayed row entirely. Asserting a real field is what an
  // un-awaited regression would fail: `res.json().data.id` off a `{}` body
  // is `undefined`, not `d1`.
  it('replay responds with the replayed row itself, not an empty object', async () => {
    const d = await h.deliveries.enqueue({
      subscriptionId: 'sub1',
      eventId: 'e1',
      eventType: 'customer.created',
      url: 'https://x.test/',
      body: '{}',
      signature: '',
    })
    await h.deliveries.markFailed(d.id, { status: 500, error: 'boom' })
    const res = await h.fastify.inject({
      method: 'POST',
      url: `/admin/webhook-subscriptions/sub1/deliveries/${d.id}/replay`,
      headers: admin,
    })
    expect(res.statusCode).toBe(202)
    expect(res.json().data).toMatchObject({ id: d.id, status: 'pending', attempts: 0 })
  })

  describe('GET /admin/webhook-subscriptions/:id/deliveries (Plan 3 Part C)', () => {
    // The live bug this closes: this route used to ask
    // `deliveries.listForSubscription(id, { status, limit })` with NO offset
    // and return `{ data }` alone — admin-api then computed `meta.total` as
    // `all.length`, which silently collapsed to `listForSubscription()`'s own
    // 50-row default, so `?page=2` always sliced past the end of that 50-row
    // array and rendered empty regardless of how many deliveries actually
    // existed. 55 seeded rows, fetched a page at a time with a real COUNT
    // alongside, must expose all 55 — not 50.
    it('a delivery past row 50 is reachable, and meta.total is the true count, not the page length', async () => {
      for (let i = 0; i < 55; i++) {
        await h.deliveries.enqueue({
          subscriptionId: 'sub-many',
          eventId: `evt-${i}`,
          eventType: 'customer.created',
          url: 'https://x.test/',
          body: '{}',
          signature: '',
        })
      }
      const page1 = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-many/deliveries?limit=50&offset=0',
        headers: admin,
      })
      expect(page1.statusCode).toBe(200)
      expect(page1.json().data).toHaveLength(50)
      expect(page1.json().meta.total).toBe(55)

      const page2 = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-many/deliveries?limit=50&offset=50',
        headers: admin,
      })
      expect(page2.statusCode).toBe(200)
      // The 51st–55th rows — unreachable before this fix.
      expect(page2.json().data).toHaveLength(5)
      expect(page2.json().meta.total).toBe(55)
      const page1Ids = new Set(page1.json().data.map((d: { id: string }) => d.id))
      expect(page2.json().data.every((d: { id: string }) => !page1Ids.has(d.id))).toBe(true)
    })

    it('forwards sort, dir, eventType, eventId and status to the store', async () => {
      const a = await h.deliveries.enqueue({
        subscriptionId: 'sub-forward',
        eventId: 'e-a',
        eventType: 'aaa.type',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const b = await h.deliveries.enqueue({
        subscriptionId: 'sub-forward',
        eventId: 'e-b',
        eventType: 'zzz.type',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const res = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-forward/deliveries?sort=eventType&dir=desc',
        headers: admin,
      })
      expect(res.statusCode).toBe(200)
      // Descending by eventType puts `zzz.type` (b) ahead of `aaa.type` (a) —
      // fails if `sort`/`dir` are dropped on the way to the store, since the
      // default order (`created_at DESC`) would return `b, a` too by
      // insertion order coincidence, so this also checks the ascending
      // direction actually flips it.
      expect(res.json().data.map((d: { id: string }) => d.id)).toEqual([b.id, a.id])

      const asc = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-forward/deliveries?sort=eventType&dir=asc',
        headers: admin,
      })
      expect(asc.json().data.map((d: { id: string }) => d.id)).toEqual([a.id, b.id])

      const filtered = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-forward/deliveries?eventType=zzz',
        headers: admin,
      })
      expect(filtered.json().data.map((d: { id: string }) => d.id)).toEqual([b.id])
      expect(filtered.json().meta.total).toBe(1)

      const byEventId = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-forward/deliveries?eventId=e-a',
        headers: admin,
      })
      expect(byEventId.json().data.map((d: { id: string }) => d.id)).toEqual([a.id])
      expect(byEventId.json().meta.total).toBe(1)

      await h.deliveries.markDelivered(a.id, 200)
      const byStatus = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-forward/deliveries?status=delivered',
        headers: admin,
      })
      expect(byStatus.json().data.map((d: { id: string }) => d.id)).toEqual([a.id])
      expect(byStatus.json().meta.total).toBe(1)
    })

    /**
     * A repeated query key. Fastify's parser hands an ARRAY over, and this
     * route destructured every param raw — so `?eventType=a&eventType=b`
     * reached `WebhookDeliveryStore.deliveryWhere`'s
     * `filter.eventType.toLowerCase()` as an array and answered **500
     * `filter.eventType.toLowerCase is not a function`**. Reproduced live
     * before the fix, on a shipped X-Admin-Secret route; admin-api's own hop
     * 400s first (its schema is a bare `z.string()`), so the admin UI never
     * reached it and a direct admin-secret caller did.
     *
     * The status codes are asserted first, because they are what the bug
     * actually produced. The VALUES then pin last-wins rather than merely
     * "did not throw": the second value is the one that must take effect —
     * the first is what a `v[0]` collapse would return, and either is
     * "not a crash".
     */
    it('collapses a repeated filter key to its last value instead of 500ing', async () => {
      const a = await h.deliveries.enqueue({
        subscriptionId: 'sub-repeat',
        eventId: 'e-a',
        eventType: 'aaa.type',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const b = await h.deliveries.enqueue({
        subscriptionId: 'sub-repeat',
        eventId: 'e-b',
        eventType: 'zzz.type',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const byType = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-repeat/deliveries?eventType=aaa&eventType=zzz',
        headers: admin,
      })
      expect(byType.statusCode).toBe(200)
      expect(byType.json().data.map((d: { id: string }) => d.id)).toEqual([b.id])

      const byEventId = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-repeat/deliveries?eventId=e-b&eventId=e-a',
        headers: admin,
      })
      expect(byEventId.statusCode).toBe(200)
      expect(byEventId.json().data.map((d: { id: string }) => d.id)).toEqual([a.id])
    })

    /**
     * The quiet half of the same defect. `status` never crashed — an array
     * matches none of the three literals the handler tests for, so the filter
     * was silently DROPPED and the result set widened, with `meta.total`
     * counting every delivery while the caller believed it was scoped.
     *
     * `sort` behaves the same way one layer down (`WEBHOOK_DELIVERY_SORT_KEYS.has(array)`
     * is safely `false`, so the sort is discarded rather than throwing), which
     * is why `one()` is applied to every param here, not only the two that
     * threw.
     */
    it('honours a repeated status and sort rather than silently dropping them', async () => {
      const a = await h.deliveries.enqueue({
        subscriptionId: 'sub-repeat2',
        eventId: 'e-a',
        eventType: 'aaa.type',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      const b = await h.deliveries.enqueue({
        subscriptionId: 'sub-repeat2',
        eventId: 'e-b',
        eventType: 'zzz.type',
        url: 'https://x.test/',
        body: '{}',
        signature: '',
      })
      await h.deliveries.markDelivered(a.id, 200)
      // `enqueue` stamps `created_at` with `Date.now()`, so both rows land in
      // the same millisecond and TIE on the default `created_at DESC, id DESC`
      // order — where the tiebreaker is a `randomUUID`. The sort assertion
      // below then passed or failed by coin toss (1 run in 8). `a` is stamped
      // NEWER, so the default order is deterministically [a, b].
      await h.handle.kysely
        .updateTable('webhook_deliveries')
        .set({ created_at: 1_700_000_000_001 })
        .where('id', '=', a.id)
        .execute()
      await h.handle.kysely
        .updateTable('webhook_deliveries')
        .set({ created_at: 1_700_000_000_000 })
        .where('id', '=', b.id)
        .execute()

      // Last-wins picks `delivered`, which matches only `a`. A dropped filter
      // returns BOTH rows and a total of 2 — the failure this pins.
      const byStatus = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-repeat2/deliveries?status=pending&status=delivered',
        headers: admin,
      })
      expect(byStatus.statusCode).toBe(200)
      expect(byStatus.json().data.map((d: { id: string }) => d.id)).toEqual([a.id])
      expect(byStatus.json().meta.total).toBe(1)

      // `dir=asc&dir=desc`, asserting the DESCENDING answer — not the other
      // way round. A raw array is `['asc','desc'] !== 'desc'`, which the
      // handler normalises to `undefined` and the store reads as ASCENDING:
      // asserting the ascending order would be asserting exactly what the
      // broken path returns, and the whole case would be decorative.
      //
      // And `a` is the NEWER row, so the default order (`created_at DESC`) is
      // [a, b) while eventType DESC ('zzz.type' before 'aaa.type') is [b, a].
      // Both halves have to be non-coincident AT ONCE: fixing `dir` alone
      // leaves the sort coincident with the default, and stamping `b` newer
      // instead makes the default equal the expected answer. Each partial fix
      // stays green.
      const sorted = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-repeat2/deliveries?sort=nope&sort=eventType&dir=asc&dir=desc',
        headers: admin,
      })
      expect(sorted.statusCode).toBe(200)
      expect(sorted.json().data.map((d: { id: string }) => d.id)).toEqual([b.id, a.id])
    })

    /**
     * `limit` and `offset` go through `one()` too, and nothing covered them —
     * an honest coverage gap rather than a false test: reverting either left
     * the whole suite green.
     *
     * They never threw. `Number(['10','1'])` is `NaN`, which
     * `WebhookDeliveryStore.listForSubscription` clamps back to its own
     * defaults, so a repeated `?limit=` silently ignored the caller's page
     * size and served 50 rows instead — the same "silently widens" class as
     * `status`, one layer further out.
     */
    it('pages on the last value of a repeated limit and offset', async () => {
      let createdAt = 1_700_000_000_000
      for (const eventId of ['e-1', 'e-2', 'e-3']) {
        const d = await h.deliveries.enqueue({
          subscriptionId: 'sub-repeat3',
          eventId,
          eventType: 'x.type',
          url: 'https://x.test/',
          body: '{}',
          signature: '',
        })
        await h.handle.kysely
          .updateTable('webhook_deliveries')
          .set({ created_at: createdAt++ })
          .where('id', '=', d.id)
          .execute()
      }
      // Newest first: e-3, e-2, e-1. Last-wins gives limit 1, offset 1 — the
      // middle row. A `v[0]` collapse gives limit 3, offset 0 (all three);
      // a dropped `one()` gives `Number([...]) === NaN`, which the store
      // clamps to its 50-row default and offset 0 (also all three). Both
      // broken paths return three rows, so asserting ONE row distinguishes
      // them from the fix.
      const res = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions/sub-repeat3/deliveries?limit=3&limit=1&offset=0&offset=1',
        headers: admin,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().data.map((d: { eventId: string }) => d.eventId)).toEqual(['e-2'])
      expect(res.json().meta.total).toBe(3)
    })
  })

  describe('format and custom headers', () => {
    it('creates with a format and headers', async () => {
      const { fastify } = await setup()
      const res = await fastify.inject({
        method: 'POST',
        url: '/admin/webhook-subscriptions',
        headers: { 'x-admin-secret': ADMIN },
        payload: {
          tenantId: 't',
          url: 'https://hooks.slack.test/services/x',
          format: 'slack',
          headers: { 'X-Api-Key': 'k-1' },
        },
      })
      expect(res.statusCode).toBe(201)
      const body = res.json().data
      expect(body.format).toBe('slack')
      expect(body.headerNames).toEqual(['X-Api-Key'])
      // The value must never come back out.
      expect(res.body).not.toContain('k-1')
    })

    it('defaults to the opensteward format', async () => {
      const { fastify } = await setup()
      const res = await fastify.inject({
        method: 'POST',
        url: '/admin/webhook-subscriptions',
        headers: { 'x-admin-secret': ADMIN },
        payload: { tenantId: 't', url: 'https://example.test/hook' },
      })
      expect(res.statusCode).toBe(201)
      expect(res.json().data.format).toBe('opensteward')
    })

    it.each([
      ['an unknown format', { format: 'carrier-pigeon' }],
      ['a reserved header', { headers: { 'x-oi-signature': 'sha256=forged' } }],
      ['a header value with a newline', { headers: { 'X-Api-Key': 'a\nX-Evil: 1' } }],
      [
        'too many headers',
        { headers: Object.fromEntries(Array.from({ length: 11 }, (_v, i) => [`X-H${i}`, 'v'])) },
      ],
    ])('rejects %s with 400', async (_label, extra) => {
      const { fastify } = await setup()
      const res = await fastify.inject({
        method: 'POST',
        url: '/admin/webhook-subscriptions',
        headers: { 'x-admin-secret': ADMIN },
        payload: { tenantId: 't', url: 'https://example.test/hook', ...extra },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION')
    })

    it('patches format and headers on an existing subscription', async () => {
      const { fastify } = await setup()
      const created = await fastify.inject({
        method: 'POST',
        url: '/admin/webhook-subscriptions',
        headers: { 'x-admin-secret': ADMIN },
        payload: { tenantId: 't', url: 'https://example.test/hook' },
      })
      const id = created.json().data.id

      const patched = await fastify.inject({
        method: 'PATCH',
        url: `/admin/webhook-subscriptions/${id}`,
        headers: { 'x-admin-secret': ADMIN },
        payload: { format: 'teams', headers: { Authorization: 'Bearer t' } },
      })
      expect(patched.statusCode).toBe(200)
      expect(patched.json().data.format).toBe('teams')
      expect(patched.json().data.headerNames).toEqual(['Authorization'])
      expect(patched.body).not.toContain('Bearer t')
    })

    it('refuses to change the url through PATCH', async () => {
      // url and events have always been immutable; PATCH exists to rotate a
      // header credential, not to become a general-purpose update.
      const { fastify } = await setup()
      const created = await fastify.inject({
        method: 'POST',
        url: '/admin/webhook-subscriptions',
        headers: { 'x-admin-secret': ADMIN },
        payload: { tenantId: 't', url: 'https://example.test/hook' },
      })
      const id = created.json().data.id

      const res = await fastify.inject({
        method: 'PATCH',
        url: `/admin/webhook-subscriptions/${id}`,
        headers: { 'x-admin-secret': ADMIN },
        payload: { url: 'https://elsewhere.test/hook' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('404s a PATCH for an unknown subscription', async () => {
      const { fastify } = await setup()
      const res = await fastify.inject({
        method: 'PATCH',
        url: '/admin/webhook-subscriptions/does-not-exist',
        headers: { 'x-admin-secret': ADMIN },
        payload: { format: 'slack' },
      })
      expect(res.statusCode).toBe(404)
    })

    it('requires the admin secret for PATCH', async () => {
      const { fastify } = await setup()
      const res = await fastify.inject({
        method: 'PATCH',
        url: '/admin/webhook-subscriptions/any',
        payload: { format: 'slack' },
      })
      expect(res.statusCode).toBe(403)
    })

    it('accepts a label on create and returns it on the row', async () => {
      const created = await h.fastify.inject({
        method: 'POST',
        url: '/admin/webhook-subscriptions',
        headers: admin,
        payload: {
          tenantId: 't',
          url: 'https://example.test/hook',
          label: 'Billing service',
        },
      })
      expect(created.statusCode).toBe(201)
      expect(created.json().data.label).toBe('Billing service')

      const listed = await h.fastify.inject({
        method: 'GET',
        url: '/admin/webhook-subscriptions?tenantId=t',
        headers: admin,
      })
      expect(listed.json().data[0].label).toBe('Billing service')
    })

    it('accepts a PATCH that only renames, without touching delivery settings', async () => {
      // `.strict()` on the body means an unlisted key is a 400, and the
      // `.refine()` means an empty body is a 400 — so a rename is only
      // possible if `label` is declared in both places.
      const created = await h.fastify.inject({
        method: 'POST',
        url: '/admin/webhook-subscriptions',
        headers: admin,
        payload: { tenantId: 't', url: 'https://example.test/hook', format: 'slack' },
      })
      const id = created.json().data.id

      const patched = await h.fastify.inject({
        method: 'PATCH',
        url: `/admin/webhook-subscriptions/${id}`,
        headers: admin,
        payload: { label: 'Ops channel' },
      })
      expect(patched.statusCode).toBe(200)
      expect(patched.json().data.label).toBe('Ops channel')
      expect(patched.json().data.format).toBe('slack')
    })

    it('rejects a label longer than the column allows', async () => {
      const res = await h.fastify.inject({
        method: 'POST',
        url: '/admin/webhook-subscriptions',
        headers: admin,
        payload: { tenantId: 't', url: 'https://example.test/hook', label: 'x'.repeat(201) },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error.code).toBe('VALIDATION')
    })
  })

  describe('send a test event', () => {
    function recordingFetch(status = 200) {
      const calls: Array<{ url: string; init: RequestInit }> = []
      const impl = (async (url: string, init: RequestInit) => {
        calls.push({ url, init })
        return { status } as Response
      }) as unknown as typeof fetch
      return { calls, impl }
    }

    async function createSub(fastify: Harness['fastify'], body: Record<string, unknown>) {
      const res = await fastify.inject({
        method: 'POST',
        url: '/admin/webhook-subscriptions',
        headers: { 'x-admin-secret': ADMIN },
        payload: { tenantId: 't', url: 'https://example.test/hook', ...body },
      })
      return res.json().data
    }

    it('delivers a synthetic event in the subscription format', async () => {
      const { calls, impl } = recordingFetch(200)
      const h2 = await setup(impl)
      try {
        const sub = await createSub(h2.fastify, { format: 'slack' })
        const res = await h2.fastify.inject({
          method: 'POST',
          url: `/admin/webhook-subscriptions/${sub.id}/test`,
          headers: { 'x-admin-secret': ADMIN },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json().data.ok).toBe(true)
        expect(res.json().data.status).toBe(200)

        expect(calls).toHaveLength(1)
        const sent = JSON.parse(calls[0].init.body as string)
        expect(sent.blocks).toBeInstanceOf(Array)
        expect(JSON.stringify(sent).toLowerCase()).toContain('test')
      } finally {
        await teardown(h2)
      }
    })

    it('signs the test body with the subscription secret and sends its headers', async () => {
      const { calls, impl } = recordingFetch(200)
      const h2 = await setup(impl)
      try {
        const sub = await createSub(h2.fastify, { headers: { 'X-Api-Key': 'k-1' } })
        await h2.fastify.inject({
          method: 'POST',
          url: `/admin/webhook-subscriptions/${sub.id}/test`,
          headers: { 'x-admin-secret': ADMIN },
        })
        const headers = (calls[0].init.headers ?? {}) as Record<string, string>
        const expected = createHmac('sha256', sub.secret)
          .update(calls[0].init.body as string)
          .digest('hex')
        expect(headers['x-oi-signature']).toBe(`sha256=${expected}`)
        expect(headers['X-Api-Key']).toBe('k-1')
        expect(headers['x-oi-event']).toBe('opensteward.test')
      } finally {
        await teardown(h2)
      }
    })

    it('reports a rejection instead of failing the request', async () => {
      // The operator asked "does this work?" — a 400 from the receiver is the
      // answer, not an error in our API.
      const { impl } = recordingFetch(400)
      const h2 = await setup(impl)
      try {
        const sub = await createSub(h2.fastify, { format: 'opensteward' })
        const res = await h2.fastify.inject({
          method: 'POST',
          url: `/admin/webhook-subscriptions/${sub.id}/test`,
          headers: { 'x-admin-secret': ADMIN },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json().data.ok).toBe(false)
        expect(res.json().data.status).toBe(400)
      } finally {
        await teardown(h2)
      }
    })

    it('reports a network failure as a reason, not a 500', async () => {
      const impl = (async () => {
        throw new Error('getaddrinfo ENOTFOUND hooks.example')
      }) as unknown as typeof fetch
      const h2 = await setup(impl)
      try {
        const sub = await createSub(h2.fastify, {})
        const res = await h2.fastify.inject({
          method: 'POST',
          url: `/admin/webhook-subscriptions/${sub.id}/test`,
          headers: { 'x-admin-secret': ADMIN },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json().data.ok).toBe(false)
        expect(res.json().data.error).toMatch(/ENOTFOUND/)
      } finally {
        await teardown(h2)
      }
    })

    it('leaves no delivery row behind', async () => {
      // Deliveries are the record of real events. A diagnostic must not
      // pollute it, and a failed test must never be picked up and retried.
      const { impl } = recordingFetch(500)
      const h2 = await setup(impl)
      try {
        const sub = await createSub(h2.fastify, {})
        await h2.fastify.inject({
          method: 'POST',
          url: `/admin/webhook-subscriptions/${sub.id}/test`,
          headers: { 'x-admin-secret': ADMIN },
        })
        expect(await h2.deliveries.listForSubscription(sub.id)).toEqual([])
        expect(await h2.deliveries.nextBatch(10, Date.now() + 86_400_000)).toEqual([])
      } finally {
        await teardown(h2)
      }
    })

    it('works on a paused subscription', async () => {
      const { calls, impl } = recordingFetch(200)
      const h2 = await setup(impl)
      try {
        const sub = await createSub(h2.fastify, {})
        await h2.fastify.inject({
          method: 'POST',
          url: `/admin/webhook-subscriptions/${sub.id}/paused`,
          headers: { 'x-admin-secret': ADMIN },
          payload: { paused: true },
        })
        const res = await h2.fastify.inject({
          method: 'POST',
          url: `/admin/webhook-subscriptions/${sub.id}/test`,
          headers: { 'x-admin-secret': ADMIN },
        })
        expect(res.statusCode).toBe(200)
        expect(calls).toHaveLength(1)
      } finally {
        await teardown(h2)
      }
    })

    it('404s an unknown subscription and 403s without the admin secret', async () => {
      const res = await h.fastify.inject({
        method: 'POST',
        url: '/admin/webhook-subscriptions/does-not-exist/test',
        headers: { 'x-admin-secret': ADMIN },
      })
      expect(res.statusCode).toBe(404)

      const forbidden = await h.fastify.inject({
        method: 'POST',
        url: '/admin/webhook-subscriptions/any/test',
      })
      expect(forbidden.statusCode).toBe(403)
    })
  })
})
