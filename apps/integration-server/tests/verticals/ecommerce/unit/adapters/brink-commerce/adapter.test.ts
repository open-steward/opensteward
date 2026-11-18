/**
 * Brink Commerce read methods against a fake that honours only what the
 * first-party docs name.
 *
 * Host: every Management/Order reference page's embedded OpenAPI declares
 * `https://management.{REGION}.{ACCOUNT_NAME}.brinkcommerce.io/{service}`
 * (…/order, …/product, …/stock, …/discount).
 *
 * Paging: no page, size, offset or cursor parameter is documented anywhere.
 * The collection reads return their whole set in one response —
 * `{ orderSummaries }` (GET /orders/email/{email}, GET
 * /orders/merchant-ref1/{merchantRef1}; only `from`/`to` query params, "Max
 * 100 orders are returned"), `{ deliveries }` (GET /orders/{orderId}/deliveries),
 * `{ refunds }` (GET /orders/{orderId}/refunds), and a stock variant's
 * `inventories` (GET /product-variants/{productVariantId}). The fake rejects
 * any other query parameter with a 400.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { BrinkCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/brink-commerce/index'

const HOST = 'https://management.eu-west-1.acme.brinkcommerce.io'
const CREDS = {
  accessToken: 'tok',
  extra: { region: 'eu-west-1', account: 'acme', apiKey: 'key-1' },
}

interface Call {
  url: string
  params: Record<string, unknown>
  headers: Record<string, unknown>
}

type Route = (params: Record<string, unknown>) => unknown

function bad(status: number, msg: string): Error {
  return Object.assign(new Error(`${status} ${msg}`), { response: { status } })
}

/** Mount a fake keyed by absolute URL; `allowed` lists documented query params per URL. */
function mount(routes: Record<string, { allowed?: string[]; respond: Route }>) {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg: {
    baseURL: string
    headers: Record<string, unknown>
  }) => ({
    get: vi.fn(async (path: string, conf?: { params?: Record<string, unknown> }) => {
      const url = `${cfg.baseURL}${path}`
      const params = conf?.params ?? {}
      calls.push({ url, params, headers: cfg.headers })
      const route = routes[url]
      if (!route) throw bad(404, `no route ${url}`)
      for (const k of Object.keys(params)) {
        if (!(route.allowed ?? []).includes(k)) throw bad(400, `undocumented param ${k}`)
      }
      return { data: route.respond(params) }
    }),
  })) as never)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
})

function summary(i: number) {
  return {
    id: `ord-${String(i).padStart(4, '0')}`,
    date: '2024-03-01T10:15:00Z',
    isTaxIncludedInPrice: true,
    storeGroupId: 'se-b2c',
    countryCode: 'SE',
    currencyCode: 'SEK',
    reference: String(100000 + i),
    languageCode: 'sv',
    channelType: 'B2C',
    isTaxExemptionEligible: false,
    isTaxExempt: false,
    taxationCountry: 'SE',
    totals: {
      subTotal: 1000,
      shippingTotal: 0,
      discountTotal: 0,
      giftCardTotal: 0,
      bonusTotal: 0,
      taxTotal: 200,
      grandTotal: 1000,
    },
    status: { orderStates: ['PLACED'], customStates: [] },
  }
}

function delivery(i: number, orderId: string) {
  return {
    id: `del-${String(i).padStart(4, '0')}`,
    orderId,
    orderReference: '100001',
    paymentProvider: { providerId: 'kco', providerName: 'KlarnaCheckout' },
    orderLines: [{ orderLineId: `line-${i}`, quantity: 1 }],
    shippingFees: [],
    gifts: [],
    giftCards: [],
    giftCardProducts: [],
    totals: {},
    created: '2024-03-02T08:00:00Z',
    updated: '2024-03-02T08:00:00Z',
    revision: 1,
  }
}

function refund(i: number, orderId: string) {
  return {
    id: `ref-${String(i).padStart(4, '0')}`,
    orderId,
    orderReference: '100001',
    paymentProvider: { providerId: 'kco', providerName: 'KlarnaCheckout' },
    orderLines: [{ orderLineId: `line-${i}`, quantity: 1, currencyCode: 'SEK' }],
    shippingFees: [],
    gifts: [],
    giftCards: [],
    giftCardProducts: [],
    totals: { grandTotal: 500 },
    created: '2024-03-05T12:00:00Z',
    updated: '2024-03-05T12:00:00Z',
    revision: 1,
  }
}

function variantStock(n: number) {
  return {
    id: 'tee-blue-m',
    validateStock: true,
    stockQuantity: n,
    inventories: Array.from({ length: n }, (_, i) => ({
      inventoryId: `inv-${String(i + 1).padStart(4, '0')}`,
      quantity: 1,
      created: '2024-01-01T00:00:00Z',
      updated: '2024-01-02T00:00:00Z',
    })),
  }
}

const EMAIL_URL = `${HOST}/order/orders/email/anna%40example.com`

// ── Refusals ───────────────────────────────────────────────────────────────

describe('Brink Commerce refusals (501 NOT_SUPPORTED, no request)', () => {
  const cases: [string, (a: BrinkCommerceAdapter) => Promise<unknown>][] = [
    ['listProducts', (a) => a.listProducts(CREDS, { page: 1, limit: 10 })],
    ['listDiscounts', (a) => a.listDiscounts(CREDS, { page: 1, limit: 10 })],
    ['listVariants', (a) => a.listVariants(CREDS, { page: 1, limit: 10, productId: 'tee' })],
    ['getVariant', (a) => a.getVariant(CREDS, 'tee-blue-m')],
    ['listOrders unfiltered', (a) => a.listOrders(CREDS, { page: 1, limit: 10 })],
    ['listFulfillments unfiltered', (a) => a.listFulfillments(CREDS, { page: 1, limit: 10 })],
    ['listRefunds unfiltered', (a) => a.listRefunds(CREDS, { page: 1, limit: 10 })],
    ['listInventoryLevels unfiltered', (a) => a.listInventoryLevels(CREDS, { page: 1, limit: 10 })],
    [
      'listOrders with updatedAfter only',
      (a) => a.listOrders(CREDS, { page: 1, limit: 10, updatedAfter: new Date('2024-01-01') }),
    ],
  ]
  it.each(cases)('%s', async (_name, call) => {
    const create = vi.spyOn(axios, 'create')
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
    await expect(call(adapter)).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(create).not.toHaveBeenCalled()
  })
})

// ── listOrders ───────────────────────────────────────────────────────────────

describe('Brink Commerce listOrders by email / merchantRef', () => {
  it('calls the documented route on the management host with only from/to and the auth headers', async () => {
    const calls = mount({
      [EMAIL_URL]: {
        allowed: ['from', 'to'],
        respond: () => ({ orderSummaries: [summary(1)] }),
      },
    })
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
    const rows = await adapter.listOrders(CREDS, {
      page: 1,
      limit: 10,
      email: 'anna@example.com',
      from: '2024-01-01T00:00:00Z',
      to: '2024-02-01T00:00:00Z',
    })
    expect(rows.map((r) => r.id)).toEqual(['ord-0001'])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual({ from: '2024-01-01T00:00:00Z', to: '2024-02-01T00:00:00Z' })
    expect(calls[0]!.headers).toMatchObject({ Authorization: 'Bearer tok', 'x-api-key': 'key-1' })
  })

  it('sends no query at all when no date window is given', async () => {
    const calls = mount({
      [EMAIL_URL]: { allowed: ['from', 'to'], respond: () => ({ orderSummaries: [] }) },
    })
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
    await adapter.listOrders(CREDS, { page: 2, limit: 10, email: 'anna@example.com' })
    expect(calls[0]!.params).toEqual({})
  })

  it('uses GET /orders/merchant-ref1/{merchantRef1} for merchantRef', async () => {
    const calls = mount({
      [`${HOST}/order/orders/merchant-ref1/ERP-77`]: {
        allowed: ['from', 'to'],
        respond: () => ({ orderSummaries: [summary(1), summary(2)] }),
      },
    })
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
    const rows = await adapter.listOrders(CREDS, { page: 1, limit: 10, merchantRef: 'ERP-77' })
    expect(rows.map((r) => r.id)).toEqual(['ord-0001', 'ord-0002'])
    expect(calls).toHaveLength(1)
  })

  it('serves 2L+1 orders once each across pages 1..3 with exact hasMore', async () => {
    for (const L of [2, 7, 25]) {
      const all = Array.from({ length: 2 * L + 1 }, (_, i) => summary(i + 1))
      mount({ [EMAIL_URL]: { allowed: ['from', 'to'], respond: () => ({ orderSummaries: all }) } })
      const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L, email: 'anna@example.com' } as QueryParams)
        seen.push(...(await adapter.listOrders(CREDS, params)).map((o) => o.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
      }
      expect(seen).toEqual(all.map((o) => o.id))
      expect(hasMore).toEqual([true, true, false])
      vi.restoreAllMocks()
    }
  })

  it('at the documented 100-order cap, claims no total and no end', async () => {
    const all = Array.from({ length: 100 }, (_, i) => summary(i + 1))
    mount({ [EMAIL_URL]: { allowed: ['from', 'to'], respond: () => ({ orderSummaries: all }) } })
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })

    const p1 = withPageSink({ page: 1, limit: 60, email: 'anna@example.com' } as QueryParams)
    expect(await adapter.listOrders(CREDS, p1)).toHaveLength(60)
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    expect(readUpstreamPage(p1)?.totalCount).toBeUndefined()

    const p2 = withPageSink({ page: 2, limit: 60, email: 'anna@example.com' } as QueryParams)
    const rows = await adapter.listOrders(CREDS, p2)
    expect(rows.map((r) => r.id)).toEqual(all.slice(60).map((o) => o.id))
    expect(readUpstreamPage(p2)?.hasMore).toBeUndefined()
    expect(readUpstreamPage(p2)?.totalCount).toBeUndefined()
  })

  it('below the cap, the last page ends the collection', async () => {
    const all = Array.from({ length: 99 }, (_, i) => summary(i + 1))
    mount({ [EMAIL_URL]: { allowed: ['from', 'to'], respond: () => ({ orderSummaries: all }) } })
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
    const p2 = withPageSink({ page: 2, limit: 60, email: 'anna@example.com' } as QueryParams)
    expect(await adapter.listOrders(CREDS, p2)).toHaveLength(39)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    expect(readUpstreamPage(p2)?.totalCount).toBe(99)
  })
})

// ── Per-parent lists ───────────────────────────────────────────────────────

type ListCase = {
  name: string
  url: string
  body: (n: number) => unknown
  ids: (n: number) => string[]
  call: (a: BrinkCommerceAdapter, p: QueryParams) => Promise<{ id: string }[]>
  filter: Record<string, string>
}

const LISTS: ListCase[] = [
  {
    name: 'listFulfillments',
    url: `${HOST}/order/orders/ord-1/deliveries`,
    body: (n) => ({ deliveries: Array.from({ length: n }, (_, i) => delivery(i + 1, 'ord-1')) }),
    ids: (n) => Array.from({ length: n }, (_, i) => `del-${String(i + 1).padStart(4, '0')}`),
    call: (a, p) => a.listFulfillments(CREDS, p),
    filter: { orderId: 'ord-1' },
  },
  {
    name: 'listRefunds',
    url: `${HOST}/order/orders/ord-1/refunds`,
    body: (n) => ({ refunds: Array.from({ length: n }, (_, i) => refund(i + 1, 'ord-1')) }),
    ids: (n) => Array.from({ length: n }, (_, i) => `ref-${String(i + 1).padStart(4, '0')}`),
    call: (a, p) => a.listRefunds(CREDS, p),
    filter: { orderId: 'ord-1' },
  },
  {
    name: 'listInventoryLevels',
    url: `${HOST}/stock/product-variants/tee-blue-m`,
    body: (n) => variantStock(n),
    ids: (n) =>
      Array.from({ length: n }, (_, i) => `tee-blue-m:inv-${String(i + 1).padStart(4, '0')}`),
    call: (a, p) => a.listInventoryLevels(CREDS, p),
    filter: { variantId: 'tee-blue-m' },
  },
]

describe.each(LISTS)('Brink Commerce $name', ({ url, body, ids, call, filter }) => {
  it('serves 2L+1 rows once each across pages 1..3 with exact hasMore, sending no query', async () => {
    for (const L of [2, 7, 25]) {
      const calls = mount({ [url]: { respond: () => body(2 * L + 1) } })
      const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L, ...filter } as QueryParams)
        seen.push(...(await call(adapter, params)).map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
        expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
      }
      expect(seen).toEqual(ids(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
      expect(calls.every((c) => Object.keys(c.params).length === 0)).toBe(true)
      vi.restoreAllMocks()
    }
  })

  it('works through parseListQuery with the filter added', async () => {
    mount({ [url]: { respond: () => body(5) } })
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
    const params = Object.assign(parseListQuery({ limit: '2', page: '3' }), filter)
    expect((await call(adapter, params)).map((r) => r.id)).toEqual(ids(5).slice(4))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})

// ── Reads by id ──────────────────────────────────────────────────────────────

describe('Brink Commerce reads by id hit the documented paths on the management host', () => {
  it('getOrder → /order/orders/{orderId}', async () => {
    const calls = mount({
      [`${HOST}/order/orders/ord-1`]: {
        respond: () => ({ ...summary(1), id: 'ord-1', orderLines: [] }),
      },
    })
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
    expect((await adapter.getOrder(CREDS, 'ord-1')).id).toBe('ord-1')
    expect(calls).toHaveLength(1)
  })

  it('getFulfillment → /order/deliveries/{deliveryId}', async () => {
    mount({ [`${HOST}/order/deliveries/del-0001`]: { respond: () => delivery(1, 'ord-1') } })
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
    expect((await adapter.getFulfillment(CREDS, 'del-0001')).orderId).toBe('ord-1')
  })

  it('getRefund → /order/refunds/{refundId}', async () => {
    mount({ [`${HOST}/order/refunds/ref-0001`]: { respond: () => refund(1, 'ord-1') } })
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
    expect((await adapter.getRefund(CREDS, 'ref-0001')).amount).toEqual({
      amount: 500,
      currency: 'SEK',
    })
  })

  it('getDiscount → /discount/discounts/codes/{code}', async () => {
    mount({
      [`${HOST}/discount/discounts/codes/SPRING10`]: {
        respond: () => ({
          code: 'SPRING10',
          created: '2024-03-01T00:00:00Z',
          updated: '2024-03-01T00:00:00Z',
          discountCodeRuleId: 'rule-1',
          isUnlimited: true,
          usageLimit: 1,
          sequenceNumber: 1,
        }),
      },
    })
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
    expect((await adapter.getDiscount(CREDS, 'SPRING10')).code).toBe('SPRING10')
  })

  it('getProduct → /product/product-parents/{id}, one request, no variants', async () => {
    const calls = mount({
      [`${HOST}/product/product-parents/tee`]: {
        respond: () => ({
          id: 'tee',
          name: 'Tee',
          description: '',
          displayNames: {},
          displayDescriptions: {},
          customAttributes: {},
          isActive: true,
          isArchived: false,
          created: '2024-01-01T00:00:00Z',
          updated: '2024-01-01T00:00:00Z',
        }),
      },
    })
    const adapter = new BrinkCommerceAdapter({ region: 'eu-west-1', account: 'acme' })
    const p = await adapter.getProduct(CREDS, 'tee')
    expect(p.title).toBe('Tee')
    expect(p.variants).toBeUndefined()
    expect(calls).toHaveLength(1)
  })
})
