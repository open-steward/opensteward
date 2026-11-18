/**
 * listRefunds, listLocations and listDiscounts, rebuilt onto the endpoints
 * Allegro documents in its first-party OpenAPI spec
 * (https://developer.allegro.pl/swagger.yaml):
 *
 * - GET /payments/refunds (getRefundedPayments): `limit` 1..100, `offset`
 *   "Index of the first returned payment operation from all search results",
 *   `id` "ID of the refund.", `order.id` "ID of the order.", envelope
 *   `{ refunds, count, totalCount }`. It replaces GET /sale/disputes, which
 *   is absent from the spec.
 * - GET /points-of-service (getPOSListUsingGET): REQUIRED `seller.id` "User
 *   identifier.", no paging, envelope `{ posList }`; GET /me gives `id`
 *   "User Id.". It replaces /after-sales-service-settings/points-of-service.
 * - GET /sale/loyalty/promotions: "Filtering by promotion type is required."
 *   `promotionType` MULTIPACK | CROSS_MULTIPACK | LARGE_ORDER_DISCOUNT |
 *   WHOLESALE_PRICE_LIST, `limit` 1..5000, `limit + offset` <= 50000,
 *   envelope `{ promotions, totalCount }`.
 *
 * The fake upstream honours only those parameters and rejects anything else.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { AllegroAdapter } from '../../../../../../src/verticals/ecommerce/adapters/allegro'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

let tokenSeq = 0
/** A fresh connection per test, so the row pager's memo never carries over. */
function creds(): Credentials {
  tokenSeq++
  return { accessToken: `tok-${tokenSeq}`, extra: { environment: 'sandbox' } }
}

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

const PROMOTION_TYPES = [
  'MULTIPACK',
  'CROSS_MULTIPACK',
  'LARGE_ORDER_DISCOUNT',
  'WHOLESALE_PRICE_LIST',
] as const

interface FakeOptions {
  refunds?: number
  pos?: number
  promotions?: Partial<Record<(typeof PROMOTION_TYPES)[number], number>>
}

function ids(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${i}`)
}

function refundRow(id: string) {
  return {
    id,
    payment: { id: `pay-${id}` },
    order: { id: `order-${id}` },
    reason: 'REFUND',
    status: 'SUCCESS',
    createdAt: '2017-05-17T08:36:57.292+02:00',
    totalValue: { amount: '10.00', currency: 'PLN' },
  }
}

function promotionRow(id: string) {
  return {
    id,
    status: 'ACTIVE',
    benefits: [
      { specification: { type: 'UNIT_PERCENTAGE_DISCOUNT', configuration: { percentage: 50 } } },
    ],
    offerCriteria: [{ type: 'ALL_OFFERS' }],
  }
}

function allowOnly(path: string, params: Record<string, unknown> | undefined, allowed: string[]) {
  for (const k of Object.keys(params ?? {}))
    if (!allowed.includes(k)) throw new Error(`${path}: undocumented parameter ${k}`)
}

function fakeAllegro(opts: FakeOptions): Call[] {
  const calls: Call[] = []
  const refunds = ids('ref', opts.refunds ?? 0).map(refundRow)
  const pos = ids('pos', opts.pos ?? 0).map((id) => ({
    id,
    name: id,
    type: 'PICKUP_POINT',
    status: 'ACTIVE',
    address: { city: 'Poznan', zipCode: '60-166', state: 'wlkp', countryCode: 'PL' },
    openHours: [],
    confirmationType: 'CONTACT_NOT_REQUIRED',
  }))
  const promotions = Object.fromEntries(
    PROMOTION_TYPES.map((t) => [t, ids(t, opts.promotions?.[t] ?? 0).map(promotionRow)]),
  )

  const respond = (path: string, params: Record<string, unknown> | undefined) => {
    calls.push({ path, params })
    if (path === '/me') {
      allowOnly(path, params, [])
      return { data: { id: '46968690', login: 'Client:46968690' } }
    }
    if (path === '/points-of-service') {
      allowOnly(path, params, ['seller.id', 'countryCode'])
      if (params?.['seller.id'] !== '46968690') throw new Error('seller.id is required')
      return { data: { posList: pos } }
    }
    if (path === '/payments/refunds') {
      allowOnly(path, params, ['limit', 'offset', 'id', 'payment.id', 'order.id', 'status'])
      const limit = Number(params?.['limit'] ?? 50)
      const offset = Number(params?.['offset'] ?? 0)
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new Error(`limit ${limit} outside 1..100`)
      let rows = refunds
      if (params?.['id'] !== undefined) rows = rows.filter((r) => r.id === params['id'])
      if (params?.['order.id'] !== undefined)
        rows = rows.filter((r) => r.order.id === params['order.id'])
      const page = rows.slice(offset, offset + limit)
      return { data: { refunds: page, count: page.length, totalCount: rows.length } }
    }
    if (path === '/sale/loyalty/promotions') {
      allowOnly(path, params, ['limit', 'offset', 'offer.id', 'promotionType'])
      const type = params?.['promotionType'] as (typeof PROMOTION_TYPES)[number] | undefined
      if (!type || !PROMOTION_TYPES.includes(type)) throw new Error('promotionType is required')
      const limit = Number(params?.['limit'] ?? 50)
      const offset = Number(params?.['offset'] ?? 0)
      if (limit < 1 || limit > 5000 || offset < 0 || limit + offset > 50_000)
        throw new Error(`422: limit ${limit} offset ${offset}`)
      const rows = promotions[type]!
      return { data: { promotions: rows.slice(offset, offset + limit), totalCount: rows.length } }
    }
    throw new Error(`unexpected path ${path}`)
  }
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) =>
      respond(path, c?.params),
    ),
  })) as never)
  return calls
}

type ListMethod = 'listRefunds' | 'listLocations' | 'listDiscounts'

async function drive(method: ListMethod, c: Credentials, limit: number, pages: number) {
  const adapter = new AllegroAdapter()
  const seen: string[] = []
  const hasMore: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = (await adapter[method](c, params)) as Array<{ id: string }>
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, hasMore }
}

function parse(query: Record<string, string>): QueryParams {
  const routed: EcommerceAdapter = new AllegroAdapter()
  return parseListQuery(query, routed)
}

afterEach(() => vi.restoreAllMocks())

describe('AllegroAdapter.listRefunds reads GET /payments/refunds', () => {
  it('serves 2L + 1 refunds once each over three pages with an exact hasMore', async () => {
    const L = 3
    const calls = fakeAllegro({ refunds: 2 * L + 1 })
    const { seen, hasMore } = await drive('listRefunds', creds(), L, 3)
    expect(seen).toEqual(ids('ref', 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((x) => x.params)).toEqual([
      { limit: L, offset: 0 },
      { limit: L, offset: L },
      { limit: L, offset: 2 * L },
    ])
    expect(calls.every((x) => x.path === '/payments/refunds')).toBe(true)
  })

  it('clamps a limit above 100 and reports the size it sent', async () => {
    const calls = fakeAllegro({ refunds: 150 })
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await new AllegroAdapter().listRefunds(creds(), params)
    expect(rows).toHaveLength(50)
    expect(calls[0]!.params).toEqual({ limit: 100, offset: 100 })
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 100, hasMore: false })
  })

  it('forwards orderId as the documented order.id filter', async () => {
    const calls = fakeAllegro({ refunds: 3 })
    const rows = await new AllegroAdapter().listRefunds(
      creds(),
      withPageSink({ page: 1, limit: 10, orderId: 'order-ref-1' }),
    )
    expect(calls[0]!.params).toEqual({ limit: 10, offset: 0, 'order.id': 'order-ref-1' })
    expect(rows.map((r) => r.id)).toEqual(['ref-1'])
  })

  it('reports meta.hasMore on the API path', async () => {
    fakeAllegro({ refunds: 5 })
    const c = creds()
    const metas = []
    for (const page of ['1', '2', '3']) {
      const params = parse({ limit: '2', page })
      const env = listPage(await new AllegroAdapter().listRefunds(c, params), params, 'allegro')
      metas.push({ n: env.data.length, hasMore: env.meta.hasMore })
    }
    expect(metas).toEqual([
      { n: 2, hasMore: true },
      { n: 2, hasMore: true },
      { n: 1, hasMore: false },
    ])
  })

  it('getRefund reads one refund back through the documented id filter', async () => {
    const calls = fakeAllegro({ refunds: 4 })
    const r = await new AllegroAdapter().getRefund(creds(), 'ref-2')
    expect(r.id).toBe('ref-2')
    expect(r.orderId).toBe('order-ref-2')
    expect(calls).toEqual([{ path: '/payments/refunds', params: { id: 'ref-2' } }])
  })

  it('getRefund answers 404 for an id the platform does not return', async () => {
    fakeAllegro({ refunds: 1 })
    await expect(new AllegroAdapter().getRefund(creds(), 'nope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe('AllegroAdapter.listLocations reads GET /points-of-service for the seller', () => {
  it('resolves seller.id from /me and pages posList locally', async () => {
    const L = 3
    const calls = fakeAllegro({ pos: 2 * L + 1 })
    const { seen, hasMore } = await drive('listLocations', creds(), L, 3)
    expect(seen).toEqual(ids('pos', 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.slice(0, 2)).toEqual([
      { path: '/me', params: undefined },
      { path: '/points-of-service', params: { 'seller.id': '46968690' } },
    ])
  })

  it('refuses before listing points of service when /me returns no id', async () => {
    const seen: string[] = []
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async (path: string) => {
        seen.push(path)
        return { data: path === '/me' ? {} : { posList: [] } }
      }),
    })) as never)
    await expect(
      new AllegroAdapter().listLocations(creds(), withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(/returned no user id/)
    expect(seen).toEqual(['/me'])
  })

  it('getLocation reads /points-of-service/{id}', async () => {
    const seen: string[] = []
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async (path: string) => {
        seen.push(path)
        return { data: { id: 'p-1', name: 'Shop', status: 'ACTIVE', type: 'PICKUP_POINT' } }
      }),
    })) as never)
    const loc = await new AllegroAdapter().getLocation(creds(), 'p-1')
    expect(seen).toEqual(['/points-of-service/p-1'])
    expect(loc).toMatchObject({ id: 'p-1', name: 'Shop', active: true })
  })
})

describe('AllegroAdapter.listDiscounts walks every required promotionType', () => {
  it('serves 2L + 1 promotions across uneven per-type pages, once each', async () => {
    const L = 3
    // 3 + 0 + 2 + 2 = 7 rows: types end mid-page and one type is empty.
    const calls = fakeAllegro({
      promotions: {
        MULTIPACK: 3,
        CROSS_MULTIPACK: 0,
        LARGE_ORDER_DISCOUNT: 2,
        WHOLESALE_PRICE_LIST: 2,
      },
    })
    const { seen, hasMore } = await drive('listDiscounts', creds(), L, 3)
    expect(seen).toEqual([
      ...ids('MULTIPACK', 3),
      ...ids('LARGE_ORDER_DISCOUNT', 2),
      ...ids('WHOLESALE_PRICE_LIST', 2),
    ])
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
    for (const x of calls) {
      expect(PROMOTION_TYPES).toContain(x.params?.['promotionType'])
      expect(x.params?.['limit']).toBe(1000)
    }
  })

  it('pages a type by offset until its totalCount', async () => {
    const calls = fakeAllegro({ promotions: { WHOLESALE_PRICE_LIST: 1001 } })
    const c = creds()
    const adapter = new AllegroAdapter()
    const p1 = withPageSink({ page: 1, limit: 1000 })
    expect(await adapter.listDiscounts(c, p1)).toHaveLength(1000)
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 1000 })
    const rows = await adapter.listDiscounts(c, p2)
    expect(rows.map((r) => r.id)).toEqual(['WHOLESALE_PRICE_LIST-1000'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    const wholesale = calls.filter((x) => x.params?.['promotionType'] === 'WHOLESALE_PRICE_LIST')
    expect(wholesale.map((x) => x.params?.['offset'])).toEqual([0, 1000])
  })

  it('refuses to page a type past the documented limit + offset ceiling', async () => {
    fakeAllegro({ promotions: { MULTIPACK: 50_001 } })
    const params = withPageSink({ page: 51, limit: 1000 })
    await expect(new AllegroAdapter().listDiscounts(creds(), params)).rejects.toThrow(
      /at most 50000 promotions per type/,
    )
  })

  it('serves the last legal window exactly (offset 49000 + limit 1000 = 50000)', async () => {
    const calls = fakeAllegro({ promotions: { MULTIPACK: 50_000 } })
    const params = withPageSink({ page: 50, limit: 1000 })
    const rows = await new AllegroAdapter().listDiscounts(creds(), params)
    expect(rows).toHaveLength(1000)
    expect(rows[999]!.id).toBe('MULTIPACK-49999')
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    const multipack = calls.filter((x) => x.params?.['promotionType'] === 'MULTIPACK')
    expect(multipack.at(-1)?.params?.['offset']).toBe(49_000)
  })

  it('reports meta.hasMore on the API path', async () => {
    fakeAllegro({ promotions: { MULTIPACK: 2, WHOLESALE_PRICE_LIST: 3 } })
    const c = creds()
    const metas = []
    for (const page of ['1', '2', '3']) {
      const params = parse({ limit: '2', page })
      const env = listPage(await new AllegroAdapter().listDiscounts(c, params), params, 'allegro')
      metas.push({ ids: env.data.map((d) => d.id), hasMore: env.meta.hasMore })
    }
    expect(metas).toEqual([
      { ids: ['MULTIPACK-0', 'MULTIPACK-1'], hasMore: true },
      { ids: ['WHOLESALE_PRICE_LIST-0', 'WHOLESALE_PRICE_LIST-1'], hasMore: true },
      { ids: ['WHOLESALE_PRICE_LIST-2'], hasMore: false },
    ])
  })
})
