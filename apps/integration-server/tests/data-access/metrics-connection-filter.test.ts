/**
 * The dashboards' connection and adapter filter: `connection` (one connection
 * id) and `platform` (an adapter slug) on `/admin/data/metrics/:id` and
 * `/admin/data/currencies`. SQLite always, Postgres when TEST_DATABASE_URL is
 * set (run with `--no-file-parallelism`: each test drops `public`).
 *
 * Pins: both only NARROW the connections the scope already allows (AND when
 * both are given); a connection outside the scope — even one that exists in
 * another tenant — yields no data rather than a 404; every part and
 * component, every lookup label and the currency list read only the narrowed
 * connections; system metrics narrow too (including the unrestricted
 * one-pass sync read); the applied filter is echoed as `filter`; the cache
 * key separates filters; malformed values are `400 INVALID_QUERY`.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { SyncStore } from '@opensteward/shared'
import { createDataAccessRouter, DATA_SCOPE_HEADER } from '../../src/data-access/router'
import { createMetricsEngine, type MetricsEngine } from '../../src/data-access/metrics/engine'
import { RESOURCE_METRICS } from '../../src/data-access/metrics/catalog'
import { ISSUED_AR } from '../../src/data-access/metrics/catalog/accounting'
import type { ResourceMetricDefinition } from '../../src/data-access/metrics/types'
import type { DataScope } from '../../src/data-access/scope'
import { BACKENDS, NOW, SECRET, openHarness, type Harness } from './metrics-harness'

const ADMIN = 'connection-filter-admin-secret'
const OLD_ADMIN = process.env['ADMIN_SECRET']
const ALL: DataScope = { tenants: '*' }
const A: DataScope = { tenants: ['tenant-a'] }
const MARCH = { from: '2026-03-01', to: '2026-03-18' }

/** Invoices minus credit notes: a component on another resource type. */
const NET_DOCUMENTS: ResourceMetricDefinition = {
  id: 'accounting.test_filter_net_documents',
  title: 't',
  description: 'd',
  vertical: 'accounting',
  resourceType: 'invoices',
  section: 'overview',
  kind: 'composition',
  dateField: 'postedAt',
  filters: ISSUED_AR,
  currencyField: 'currency',
  components: [
    { label: 'Invoices', sign: 1, measure: { op: 'count' } },
    {
      label: 'Credit notes',
      sign: -1,
      measure: { op: 'count' },
      resourceType: 'creditmemos',
      currencyField: 'currency',
    },
  ],
}

const order = (id: string, day: string, amount: number, currency: string) => ({
  id,
  createdAt: `2026-03-${day}T09:00:00Z`,
  financialStatus: 'PAID',
  totalPrice: { amount, currency },
})

describe.each(BACKENDS)('connection and adapter filter [$name]', (backend) => {
  let h: Harness
  let engine: MetricsEngine
  let app: FastifyInstance | undefined
  // tenant-a: two Shopify shops and a WooCommerce shop; tenant-b: one Shopify shop.
  let shopA1: string
  let shopA2: string
  let wooA: string
  let shopB: string

  beforeEach(async () => {
    process.env['ADMIN_SECRET'] = ADMIN
    h = await openHarness(backend)
    engine = createMetricsEngine({
      credentialStore: h.creds,
      resourceStore: h.resources,
      now: () => NOW,
      resourceMetrics: [...RESOURCE_METRICS, NET_DOCUMENTS],
    })
    shopA1 = await h.connect('shopify', 'ecommerce', 'tenant-a', 'Main shop')
    shopA2 = await h.connect('shopify', 'ecommerce', 'tenant-a', 'Outlet shop')
    wooA = await h.connect('woocommerce', 'ecommerce', 'tenant-a', 'Woo store')
    shopB = await h.connect('shopify', 'ecommerce', 'tenant-b', 'Rival shop')
    await h.put('ecommerce', 'shopify', shopA1, 'orders', [
      order('a1', '02', 1000, 'USD'),
      order('a2', '03', 2000, 'USD'),
    ])
    await h.put('ecommerce', 'shopify', shopA2, 'orders', [order('a3', '03', 500, 'EUR')])
    await h.put('ecommerce', 'woocommerce', wooA, 'orders', [order('w1', '04', 700, 'GBP')])
    await h.put('ecommerce', 'shopify', shopB, 'orders', [
      order('b1', '02', 9, 'JPY'),
      order('b2', '02', 9, 'JPY'),
      order('b3', '03', 9, 'JPY'),
      order('b4', '04', 9, 'JPY'),
    ])
  })

  afterEach(async () => {
    await app?.close()
    app = undefined
    await h.handle.close()
    if (OLD_ADMIN === undefined) delete process.env['ADMIN_SECRET']
    else process.env['ADMIN_SECRET'] = OLD_ADMIN
  })

  const run = (
    id: string,
    filter: { connection?: string; platform?: string; vertical?: string } = {},
    scope: DataScope = A,
  ) => engine.run(id, scope, { ...MARCH, ...filter })

  async function build() {
    app = Fastify({ logger: false })
    await app.register(
      createDataAccessRouter({
        credentialStore: h.creds,
        resourceStore: h.resources,
        storeSecret: SECRET,
      }),
    )
    await app.ready()
    return app
  }

  function get(url: string, scope: DataScope = A) {
    return app!.inject({
      method: 'GET',
      url,
      headers: { 'x-admin-secret': ADMIN, [DATA_SCOPE_HEADER]: JSON.stringify(scope) },
    })
  }

  // ── Narrowing ──────────────────────────────────────────────────────────

  it('narrows to one connection, one adapter, or both (AND)', async () => {
    expect((await run('ecommerce.orders_total')).value).toBe(4)
    const one = await run('ecommerce.orders_total', { connection: shopA1 })
    expect(one.value).toBe(2)
    expect(one.filter).toEqual({ connection: shopA1, platform: null, vertical: null })
    const shopify = await run('ecommerce.orders_total', { platform: 'shopify' })
    expect(shopify.value).toBe(3)
    expect(shopify.filter).toEqual({ connection: null, platform: 'shopify', vertical: null })
    expect((await run('ecommerce.orders_total', { platform: 'woocommerce' })).value).toBe(1)
    // Both: the connection must also be of that adapter.
    expect(
      (await run('ecommerce.orders_total', { connection: shopA2, platform: 'shopify' })).value,
    ).toBe(1)
    const neither = await run('ecommerce.orders_total', {
      connection: shopA1,
      platform: 'woocommerce',
    })
    expect(neither.value).toBe(0)
    expect(neither.filter).toEqual({
      connection: shopA1,
      platform: 'woocommerce',
      vertical: null,
    })
    // No filter: no `filter` key at all.
    expect((await run('ecommerce.orders_total')).filter).toBeUndefined()
  })

  it('narrows money series and lists only the narrowed connection’s currencies', async () => {
    const all = await run('ecommerce.revenue_per_day')
    expect(all.currencies).toEqual(['EUR', 'GBP', 'USD'])
    const outlet = await run('ecommerce.revenue_per_day', { connection: shopA2 })
    expect(outlet.currencies).toEqual(['EUR'])
    expect(outlet.totals).toEqual([{ currency: 'EUR', amount: 5, amountMinor: 500 }])
    const woo = await run('ecommerce.revenue_per_day', { platform: 'woocommerce' })
    expect(woo.series.map((s) => s.currency)).toEqual(['GBP'])
  })

  it('yields no data for a connection outside the scope, even one another tenant owns', async () => {
    const theirs = await run('ecommerce.orders_total', { connection: shopB })
    expect(theirs.value).toBe(0)
    expect(theirs.filter).toEqual({ connection: shopB, platform: null, vertical: null })
    const money = await run('ecommerce.revenue_per_day', { connection: shopB })
    expect(money.currencies).toEqual([])
    expect(money.totals ?? []).toEqual([])
    expect(JSON.stringify(money)).not.toContain('JPY')
    // A connection that does not exist reads exactly the same: no 404, no hint.
    const ghost = await run('ecommerce.orders_total', { connection: 'no-such-connection' })
    expect(ghost.value).toBe(0)
    // The same id under a scope that holds it does count.
    expect((await run('ecommerce.orders_total', { connection: shopB }, ALL)).value).toBe(4)
    // Restricted to tenant-a, an adapter only tenant-b... and tenant-a both use counts only A's.
    expect((await run('ecommerce.orders_total', { platform: 'shopify' })).value).toBe(3)
    expect((await run('ecommerce.orders_total', { platform: 'shopify' }, ALL)).value).toBe(7)
  })

  it('reads every part and component from the narrowed connections only', async () => {
    const books1 = await h.connect('xero', 'accounting', 'tenant-a', 'Books one')
    const books2 = await h.connect('xero', 'accounting', 'tenant-a', 'Books two')
    const inv = (id: string) => ({
      id,
      type: 'INVOICE',
      status: 'AUTHORIZED',
      currency: 'USD',
      totalAmount: 100,
      postedAt: '2026-03-05',
    })
    const cn = (id: string) => ({
      id,
      status: 'AUTHORIZED',
      currency: 'USD',
      postedAt: '2026-03-06',
    })
    await h.put('accounting', 'xero', books1, 'invoices', [inv('i1'), inv('i2'), inv('i3')])
    await h.put('accounting', 'xero', books1, 'creditmemos', [cn('c1')])
    await h.put('accounting', 'xero', books2, 'invoices', [inv('i4')])
    await h.put('accounting', 'xero', books2, 'creditmemos', [cn('c2'), cn('c3')])
    const net = (r: Awaited<ReturnType<typeof run>>) =>
      Object.fromEntries(r.series[0]!.points.map((p) => [p.x, p.y]))
    expect(net(await run(NET_DOCUMENTS.id))).toMatchObject({
      Invoices: 4,
      'Credit notes': -3,
      Net: 1,
    })
    expect(net(await run(NET_DOCUMENTS.id, { connection: books1 }))).toMatchObject({
      Invoices: 3,
      'Credit notes': -1,
      Net: 2,
    })
    expect(net(await run(NET_DOCUMENTS.id, { connection: books2 }))).toMatchObject({
      Invoices: 1,
      'Credit notes': -2,
      Net: -1,
    })
  })

  it('reads lookup labels from the narrowed connections only', async () => {
    const desk1 = await h.connect('zendesk', 'customer-support', 'tenant-a', 'Desk one')
    const desk2 = await h.connect('zendesk', 'customer-support', 'tenant-a', 'Desk two')
    const ticket = (id: string, tagIds: string[]) => ({
      id,
      status: 'open',
      tagIds,
      createdAt: '2026-03-10T10:00:00Z',
    })
    await h.put('customer-support', 'zendesk', desk1, 'tickets', [
      ticket('t1', ['tg1']),
      ticket('t2', ['tg1', 'tg2']),
    ])
    await h.put('customer-support', 'zendesk', desk1, 'tags', [
      { id: 'tg1', name: 'Desk one login' },
      { id: 'tg2', name: 'Desk one billing' },
    ])
    await h.put('customer-support', 'zendesk', desk2, 'tickets', [ticket('t3', ['tg1'])])
    await h.put('customer-support', 'zendesk', desk2, 'tags', [
      { id: 'tg1', name: 'Desk two login' },
    ])

    const one = await run('customer-support.tickets_by_tag', { connection: desk1 })
    expect(one.series[0]!.points).toEqual([
      { x: 'Desk one login', y: 2 },
      { x: 'Desk one billing', y: 1 },
    ])
    expect(JSON.stringify(one)).not.toContain('Desk two')
    const two = await run('customer-support.tickets_by_tag', { connection: desk2 })
    expect(two.series[0]!.points).toEqual([{ x: 'Desk two login', y: 1 }])
    expect(JSON.stringify(two)).not.toContain('Desk one')
  })

  it('lists only the narrowed connections’ currencies', async () => {
    expect(await engine.currencies(A)).toEqual(['EUR', 'GBP', 'USD'])
    expect(await engine.currencies(A, { connection: shopA2 })).toEqual(['EUR'])
    expect(await engine.currencies(A, { platform: 'woocommerce' })).toEqual(['GBP'])
    expect(await engine.currencies(A, { platform: 'shopify' })).toEqual(['EUR', 'USD'])
    expect(await engine.currencies(A, { connection: shopA1, platform: 'woocommerce' })).toEqual([])
    // Another tenant's connection: nothing, not its JPY.
    expect(await engine.currencies(A, { connection: shopB })).toEqual([])
    expect(await engine.currencies(ALL, { connection: shopB })).toEqual(['JPY'])
  })

  // ── System metrics ─────────────────────────────────────────────────────

  it('narrows the system metrics, including the unrestricted one-pass reads', async () => {
    const sys = createMetricsEngine({
      credentialStore: h.creds,
      resourceStore: h.resources,
      syncStore: await SyncStore.create(h.handle),
      now: () => NOW,
    })
    const job = (id: string, conn: string, platform: string, tenant: string, status: string) =>
      h.handle.kysely
        .insertInto('sync_jobs')
        .values({
          id,
          vertical: 'ecommerce',
          connection_id: conn,
          platform,
          tenant_id: tenant,
          status,
          created_at: Date.parse('2026-03-02T12:00:00Z'),
        })
        .execute()
    await job('j1', shopA1, 'shopify', 'tenant-a', 'completed')
    await job('j2', shopA2, 'shopify', 'tenant-a', 'failed')
    await job('j3', wooA, 'woocommerce', 'tenant-a', 'completed')
    await job('j4', shopB, 'shopify', 'tenant-b', 'failed')
    const total = async (id: string, scope: DataScope, f: object = {}) =>
      (await sys.run(id, scope, { from: '2026-03-01', to: '2026-03-03', ...f })).value

    // Unrestricted: one pass over the table — narrowed all the same.
    expect(await total('system.sync_outcomes_per_day', ALL)).toBe(4)
    expect(await total('system.sync_outcomes_per_day', ALL, { connection: shopB })).toBe(1)
    expect(await total('system.sync_outcomes_per_day', ALL, { platform: 'woocommerce' })).toBe(1)
    expect(await total('system.sync_success_rate', ALL, { connection: shopA2 })).toBe(0)
    expect(await total('system.sync_success_rate', ALL, { platform: 'woocommerce' })).toBe(100)
    expect(await total('system.sync_failures_by_platform', ALL, { platform: 'woocommerce' })).toBe(
      0,
    )
    // Restricted: another tenant's connection is no data.
    expect(await total('system.sync_outcomes_per_day', A, { connection: shopB })).toBe(0)
    expect(await total('system.sync_failures_by_platform', A, { connection: shopB })).toBe(0)
    // Credential state and stored records.
    expect(await total('system.connections_by_status', A, { platform: 'shopify' })).toBe(2)
    expect(await total('system.connections_by_status', A, { connection: shopB })).toBe(0)
    expect(await total('system.records_per_vertical', A, { connection: shopA1 })).toBe(2)
    expect(await total('system.records_per_vertical', ALL, { platform: 'shopify' })).toBe(7)
    const fresh = await sys.run('system.data_freshness', A, { connection: shopA2 })
    expect(fresh.table!.rows.map((r) => r['connectionId'])).toEqual([shopA2])
    expect((await sys.run('system.data_freshness', A, { connection: shopB })).table!.rows).toEqual(
      [],
    )
  })

  // ── Cache key ──────────────────────────────────────────────────────────

  it('keeps a cache entry per filter', async () => {
    expect((await run('ecommerce.orders_total')).value).toBe(4)
    // Each filter is its own entry, not the unfiltered one served again.
    expect((await run('ecommerce.orders_total', { connection: shopA1 })).value).toBe(2)
    expect((await run('ecommerce.orders_total', { connection: shopA2 })).value).toBe(1)
    expect((await run('ecommerce.orders_total', { platform: 'woocommerce' })).value).toBe(1)
    expect((await run('ecommerce.orders_total', { platform: 'shopify' })).value).toBe(3)
    // And each is cached: a new order is not seen until the entry expires.
    await h.put('ecommerce', 'shopify', shopA1, 'orders', [order('a9', '05', 1, 'USD')])
    expect((await run('ecommerce.orders_total', { connection: shopA1 })).value).toBe(2)
    expect((await run('ecommerce.orders_total')).value).toBe(4)
    engine.clear()
    expect((await run('ecommerce.orders_total', { connection: shopA1 })).value).toBe(3)
    // Currencies too: one entry per filter.
    expect(await engine.currencies(A, { connection: shopA2 })).toEqual(['EUR'])
    expect(await engine.currencies(A, { connection: wooA })).toEqual(['GBP'])
    expect(await engine.currencies(A)).toEqual(['EUR', 'GBP', 'USD'])
  })

  // ── The routes ─────────────────────────────────────────────────────────

  it('takes connection and platform on both routes', async () => {
    await build()
    const res = await get(
      `/admin/data/metrics/ecommerce.orders_total?from=2026-03-01&to=2026-03-18&connection=${shopA1}`,
    )
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      value: 2,
      filter: { connection: shopA1, platform: null, vertical: null },
    })
    const both = await get(
      `/admin/data/metrics/ecommerce.orders_total?from=2026-03-01&to=2026-03-18&connection=${shopA2}&platform=shopify`,
    )
    expect(both.json().data).toMatchObject({ value: 1, filter: { platform: 'shopify' } })
    const theirs = await get(
      `/admin/data/metrics/ecommerce.orders_total?from=2026-03-01&to=2026-03-18&connection=${shopB}`,
    )
    expect(theirs.statusCode).toBe(200)
    expect(theirs.json().data.value).toBe(0)
    expect((await get(`/admin/data/currencies?platform=woocommerce`)).json().data).toEqual(['GBP'])
    expect((await get(`/admin/data/currencies?connection=${shopB}`)).json().data).toEqual([])
    expect((await get(`/admin/data/currencies?connection=${shopB}`, ALL)).json().data).toEqual([
      'JPY',
    ])
  })

  it('answers 400 INVALID_QUERY for a malformed connection or platform', async () => {
    await build()
    const bad = [
      'connection=a%20b',
      'connection=a.b',
      'connection=a%2Fb',
      `connection=${'x'.repeat(101)}`,
      'platform=Shopify',
      'platform=-shop',
      'platform=shop_ify',
      `platform=${'p'.repeat(65)}`,
      'platform=shop%20ify',
      // A repeated parameter is not "the first one".
      'connection=abc&connection=def',
      'platform=shopify&platform=woocommerce',
      'vertical=Ecommerce',
      'vertical=e',
      'vertical=e_commerce',
      'vertical=1crm',
      `vertical=${'v'.repeat(42)}`,
      'vertical=crm&vertical=ecommerce',
    ]
    for (const q of bad) {
      const metric = await get(`/admin/data/metrics/ecommerce.orders_total?${q}`)
      expect(metric.statusCode, q).toBe(400)
      expect(metric.json().error.code, q).toBe('INVALID_QUERY')
      const cur = await get(`/admin/data/currencies?${q}`)
      expect(cur.statusCode, q).toBe(400)
      expect(cur.json().error.code, q).toBe('INVALID_QUERY')
    }
    for (const q of [
      `connection=${'x'.repeat(100)}`,
      'connection=AbC_1-2',
      `platform=${'p'.repeat(64)}`,
      'platform=1password-shop',
      'connection=&platform=',
      'platform=shopify&vertical=customer-support',
      `vertical=${'v'.repeat(41)}`,
      'vertical=',
    ]) {
      expect((await get(`/admin/data/metrics/ecommerce.orders_total?${q}`)).statusCode, q).toBe(200)
      expect((await get(`/admin/data/currencies?${q}`)).statusCode, q).toBe(200)
    }
    await expect(
      engine.run('ecommerce.orders_total', A, { connection: 'a b' }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_QUERY' })
    await expect(engine.currencies(A, { platform: 'A' })).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_QUERY',
    })
    await expect(
      engine.run('ecommerce.orders_total', A, { platform: 'shopify', vertical: 'Ecommerce' }),
    ).rejects.toMatchObject({ status: 400, code: 'INVALID_QUERY' })
  })

  // ── A slug in two verticals ────────────────────────────────────────────

  it('keeps an adapter or connection filter inside the dashboard’s vertical when given one', async () => {
    // `square` is an ecommerce adapter and a payments adapter.
    const squareShop = await h.connect('square', 'ecommerce', 'tenant-a', 'Square shop')
    const squarePay = await h.connect('square', 'payments', 'tenant-a', 'Square payments')
    await h.put('ecommerce', 'square', squareShop, 'orders', [order('s1', '05', 100, 'CAD')])
    await h.put('payments', 'square', squarePay, 'charges', [
      {
        id: 'p1',
        amount: 5,
        currency: 'AUD',
        status: 'succeeded',
        createdAt: '2026-03-05T10:00:00Z',
      },
      {
        id: 'p2',
        amount: 5,
        currency: 'AUD',
        status: 'succeeded',
        createdAt: '2026-03-06T10:00:00Z',
      },
    ])
    const sys = createMetricsEngine({
      credentialStore: h.creds,
      resourceStore: h.resources,
      now: () => NOW,
    })
    const records = async (f: object) =>
      (await sys.run('system.records_per_vertical', A, f)).series[0]!.points
    const statuses = async (f: object) =>
      (await sys.run('system.connections_by_status', A, f)).value

    // Without a vertical a slug spans every vertical that has it…
    expect(await records({ platform: 'square' })).toEqual([
      { x: 'payments', y: 2 },
      { x: 'ecommerce', y: 1 },
    ])
    expect(await statuses({ platform: 'square' })).toBe(2)
    expect(await engine.currencies(A, { platform: 'square' })).toEqual(['AUD', 'CAD'])
    // …with the dashboard's vertical it stays inside it.
    expect(await records({ platform: 'square', vertical: 'ecommerce' })).toEqual([
      { x: 'ecommerce', y: 1 },
    ])
    expect(await statuses({ platform: 'square', vertical: 'ecommerce' })).toBe(1)
    expect(await engine.currencies(A, { platform: 'square', vertical: 'ecommerce' })).toEqual([
      'CAD',
    ])
    expect(await engine.currencies(A, { platform: 'square', vertical: 'payments' })).toEqual([
      'AUD',
    ])
    // A connection of another vertical yields nothing.
    expect(await statuses({ connection: squarePay, vertical: 'ecommerce' })).toBe(0)
    expect(await records({ connection: squarePay, vertical: 'payments' })).toEqual([
      { x: 'payments', y: 2 },
    ])
    // The echo says so; a vertical alone filters nothing and is not echoed.
    const echoed = await run('ecommerce.orders_total', {
      platform: 'square',
      vertical: 'ecommerce',
    })
    expect(echoed.filter).toEqual({ connection: null, platform: 'square', vertical: 'ecommerce' })
    expect(echoed.value).toBe(1)
    const alone = await run('ecommerce.orders_total', { vertical: 'payments' })
    expect(alone.filter).toBeUndefined()
    expect(alone.value).toBe(5)
    // And the vertical is part of the cache key.
    expect(await statuses({ platform: 'square', vertical: 'payments' })).toBe(1)
    expect(await statuses({ platform: 'square' })).toBe(2)
  })

  it('takes vertical on both routes', async () => {
    await build()
    await h.connect('square', 'payments', 'tenant-a', 'Square payments')
    const shop = await h.connect('square', 'ecommerce', 'tenant-a', 'Square shop')
    await h.put('ecommerce', 'square', shop, 'orders', [order('s1', '05', 100, 'CAD')])
    const res = await get(
      '/admin/data/metrics/system.connections_by_status?platform=square&vertical=ecommerce',
    )
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      value: 1,
      filter: { connection: null, platform: 'square', vertical: 'ecommerce' },
    })
    expect(
      (await get('/admin/data/currencies?platform=square&vertical=payments')).json().data,
    ).toEqual([])
    expect(
      (await get('/admin/data/currencies?platform=square&vertical=ecommerce')).json().data,
    ).toEqual(['CAD'])
  })
})
