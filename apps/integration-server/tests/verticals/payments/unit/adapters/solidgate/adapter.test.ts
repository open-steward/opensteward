/**
 * SolidgateAdapter against a fake of Solidgate's documented HTTP surface
 * (https://api-docs.solidgate.com/_bundle/api/@v1/index.json?download).
 *
 * - Auth (https://api-docs.solidgate.com/api/get-started): headers `merchant`
 *   (Public key) and `signature`, "a Base64-encoded string of the hexadecimal
 *   representation of an HMAC-SHA512 hash, created using the Secret key" over
 *   "publicKey + jsonString + publicKey" ("simply publicKey + publicKey" for a
 *   GET without a body).
 * - Reports (POST https://reports.solidgate.com/api/v1/card-orders,
 *   /card-orders/chargebacks, /subscriptions): body `filter`, `date_from`*,
 *   `date_to`*, `limit` [1..2000], `next_page_iterator`; response `metadata.
 *   next_page_iterator`, null at the end.
 * - Products (GET https://subscriptions.solidgate.com/api/v1/products and
 *   /products/{product_id}/prices): `pagination[limit]` [1..100],
 *   `pagination[offset]`; response `pagination.total_count`.
 * - Order status (POST https://pay.solidgate.com/api/v1/status): body `order_id`.
 *
 * The fakes honour only those parameters and reject anything else.
 */
import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _resetRowPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import {
  cardOrder,
  chargeback,
  oneTimeProduct,
  price,
  recurringProduct,
  subscription,
} from './fixtures/documented'

type Call = {
  base: string
  method: 'get' | 'post'
  path: string
  params?: Record<string, unknown>
  body?: string
  headers: Record<string, string>
}

const { calls, handlers, createMock } = vi.hoisted(() => {
  const calls: Call[] = []
  const handlers: {
    get?: (base: string, path: string, params: Record<string, unknown>) => unknown
    post?: (base: string, path: string, body: Record<string, unknown>) => unknown
  } = {}
  const createMock = vi.fn((cfg: { baseURL: string }) => ({
    get: async (
      path: string,
      c: { params?: Record<string, unknown>; headers: Record<string, string> },
    ) => {
      calls.push({ base: cfg.baseURL, method: 'get', path, params: c.params, headers: c.headers })
      if (!handlers.get) throw new Error(`unexpected GET ${path}`)
      return { data: handlers.get(cfg.baseURL, path, c.params ?? {}) }
    },
    post: async (path: string, body: string, c: { headers: Record<string, string> }) => {
      calls.push({ base: cfg.baseURL, method: 'post', path, body, headers: c.headers })
      if (!handlers.post) throw new Error(`unexpected POST ${path}`)
      return { data: handlers.post(cfg.baseURL, path, JSON.parse(body) as Record<string, unknown>) }
    },
  }))
  return { calls, handlers, createMock }
})

vi.mock('axios', () => ({ default: { create: createMock } }))

import { SolidgateAdapter } from '../../../../../../src/verticals/payments/adapters/solidgate'

const adapter = new SolidgateAdapter()
const PK = 'api_pk_8f8a8k8e8k8e8y8'
const SK = 'api_sk_8f8a8k8e8k8e8y8'
const CREDS: Credentials = { accessToken: PK, extra: { secretKey: SK } }
const REPORTS = 'https://reports.solidgate.com/api/v1'
const SUBS = 'https://subscriptions.solidgate.com/api/v1'
const PAY = 'https://pay.solidgate.com/api/v1'
const REPORT_BODY = new Set(['filter', 'date_from', 'date_to', 'limit', 'next_page_iterator'])
const CATALOG_QUERY = new Set(['pagination[limit]', 'pagination[offset]'])
const DT = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

function expectedSignature(data: string): string {
  return Buffer.from(
    createHmac('sha512', SK)
      .update(PK + data + PK)
      .digest('hex'),
  ).toString('base64')
}

beforeEach(() => {
  calls.length = 0
  handlers.get = undefined
  handlers.post = undefined
  createMock.mockClear()
  _resetRowPager()
})

/**
 * Serve a report whose rows are `rows`, split into report pages of `limit`
 * (the body's limit), with an opaque iterator. Validates the documented body.
 * An array is served in the window that ends after now (the newest) and older
 * windows are empty; a function picks the rows for each window's body.
 */
function serveReport<T>(
  path: string,
  rows: T[] | ((body: Record<string, unknown>) => T[]),
  wrap: (page: T[]) => Record<string, unknown>,
) {
  handlers.post = (base, p, body) => {
    expect(base).toBe(REPORTS)
    expect(p).toBe(path)
    for (const k of Object.keys(body))
      if (!REPORT_BODY.has(k)) throw new Error(`undocumented body key ${k}`)
    expect(body.date_from).toMatch(DT)
    expect(body.date_to).toMatch(DT)
    const limit = Number(body.limit)
    if (!Number.isInteger(limit) || limit < 1 || limit > 2000) throw new Error(`bad limit ${limit}`)
    const all =
      typeof rows === 'function'
        ? rows(body)
        : Date.parse(`${String(body.date_to).replace(' ', 'T')}Z`) > Date.now()
          ? rows
          : []
    const start = body.next_page_iterator
      ? Number(Buffer.from(String(body.next_page_iterator), 'base64').toString())
      : 0
    const page = all.slice(start, start + limit)
    const end = start + page.length
    return {
      ...wrap(page),
      metadata: {
        next_page_iterator: end < all.length ? Buffer.from(String(end)).toString('base64') : null,
        count: page.length,
      },
    }
  }
}

const SINCE = new Date('2026-07-01T00:00:00Z')

async function walk<T extends { id: string }>(
  fn: (p: QueryParams) => Promise<T[]>,
  limit: number,
  pages: number,
) {
  const ids: string[] = []
  const more: (boolean | undefined)[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit, updatedAfter: SINCE } as QueryParams)
    const rows = await fn(params)
    ids.push(...rows.map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, more }
}

describe('SolidgateAdapter credentials', () => {
  it('asks for the Public and the Secret key and keeps the secret out of accessToken', async () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['apiKey', 'secretKey'])
    const creds = await adapter.exchangeCredentials({ apiKey: ` ${PK} `, secretKey: `${SK}\n` })
    expect(creds).toEqual({ accessToken: PK, extra: { secretKey: SK } })
  })

  it('refuses a connection without the Secret key', async () => {
    await expect(adapter.exchangeCredentials({ apiKey: PK })).rejects.toThrow(/Secret key/)
  })

  it('refuses to send a request for a connection that has no Secret key', async () => {
    await expect(adapter.listProducts({ accessToken: PK }, { page: 1, limit: 10 })).rejects.toThrow(
      /Reconnect/,
    )
    expect(calls).toHaveLength(0)
  })
})

describe('SolidgateAdapter signing', () => {
  it('signs a POST over publicKey + body + publicKey', async () => {
    serveReport('/card-orders', [cardOrder()], (orders) => ({ orders }))
    await adapter.listCharges(CREDS, { page: 1, limit: 10, updatedAfter: SINCE })
    const call = calls[0]!
    expect(call.headers.merchant).toBe(PK)
    expect(call.headers.signature).toBe(expectedSignature(call.body!))
  })

  it('signs a GET over publicKey + publicKey', async () => {
    handlers.get = () => ({ data: [], pagination: { offset: 0, limit: 10, total_count: 0 } })
    await adapter.listProducts(CREDS, { page: 1, limit: 10 })
    expect(calls[0]!.headers).toEqual({ merchant: PK, signature: expectedSignature('') })
  })

  it('matches the documented test vector shape (Base64 of the hex digest)', async () => {
    handlers.get = () => ({ data: [], pagination: { offset: 0, limit: 10, total_count: 0 } })
    await adapter.listProducts(CREDS, { page: 1, limit: 10 })
    const decoded = Buffer.from(calls[0]!.headers.signature!, 'base64').toString()
    expect(decoded).toMatch(/^[0-9a-f]{128}$/)
  })
})

describe('SolidgateAdapter customers', () => {
  it.each(['listCustomers', 'getCustomer'] as const)(
    '%s refuses with 501 and sends nothing',
    async (m) => {
      const call = m === 'listCustomers' ? adapter.listCustomers() : adapter.getCustomer()
      await expect(call).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
      expect(calls).toHaveLength(0)
    },
  )
})

describe('SolidgateAdapter reports (date window)', () => {
  it.each(['listCharges', 'listRefunds', 'listDisputes', 'listSubscriptions'] as const)(
    '%s without updatedAfter refuses with 501 and sends nothing',
    async (m) => {
      await expect(adapter[m](CREDS, { page: 1, limit: 10 })).rejects.toMatchObject({
        statusCode: 501,
        code: 'NOT_SUPPORTED',
      })
      expect(calls).toHaveLength(0)
    },
  )

  it('walks UTC-month windows newest first, from the next UTC midnight back to updatedAfter', async () => {
    vi.useFakeTimers({ now: new Date('2026-07-20T10:15:42Z'), toFake: ['Date'] })
    try {
      // Rows in every window, keyed by the window's date_from; the June window is empty.
      const byWindow: Record<string, string[]> = {
        '2026-07-01 00:00:00': ['jul-0', 'jul-1', 'jul-2'],
        '2026-06-01 00:00:00': [],
        '2026-05-10 08:30:15': ['may-0', 'may-1'],
      }
      serveReport(
        '/card-orders',
        (body) =>
          (byWindow[String(body.date_from)] ?? []).map((id) => ({ ...cardOrder(), order_id: id })),
        (orders) => ({ orders }),
      )
      const since = new Date('2026-05-10T08:30:15.500Z')
      const ids: string[] = []
      const more: (boolean | undefined)[] = []
      for (let page = 1; page <= 3; page++) {
        const params = withPageSink({ page, limit: 2, updatedAfter: since } as QueryParams)
        ids.push(...(await adapter.listCharges(CREDS, params)).map((c) => c.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(ids).toEqual(['jul-0', 'jul-1', 'jul-2', 'may-0', 'may-1'])
      expect(more).toEqual([true, true, false])
      const windows = [
        ...new Set(
          calls.map((c) => {
            const b = JSON.parse(c.body!)
            expect(b.filter).toBe('updated_at')
            expect(b.limit).toBe(2)
            return `${b.date_from} -> ${b.date_to}`
          }),
        ),
      ]
      expect(windows).toEqual([
        '2026-07-01 00:00:00 -> 2026-07-21 00:00:00',
        '2026-06-01 00:00:00 -> 2026-07-01 00:00:00',
        '2026-05-10 08:30:15 -> 2026-06-01 00:00:00',
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the same windows through the UTC day', async () => {
    serveReport('/card-orders', [cardOrder()], (orders) => ({ orders }))
    const since = new Date('2026-07-01T08:30:15Z')
    vi.useFakeTimers({ now: new Date('2026-07-20T00:00:01Z'), toFake: ['Date'] })
    try {
      await adapter.listCharges(CREDS, { page: 1, limit: 25, updatedAfter: since })
      vi.setSystemTime(new Date('2026-07-20T23:59:59Z'))
      _resetRowPager()
      await adapter.listCharges(CREDS, { page: 1, limit: 25, updatedAfter: since })
    } finally {
      vi.useRealTimers()
    }
    const [a, b] = calls.map((c) => JSON.parse(c.body!))
    expect(a).toEqual(b)
    expect(a.date_to).toBe('2026-07-21 00:00:00')
  })

  it('does not replay one updatedAfter walk for another', async () => {
    const orders = Array.from({ length: 5 }, (_, i) => ({ ...cardOrder(), order_id: `o-${i}` }))
    serveReport('/card-orders', orders, (page) => ({ orders: page }))
    const a = new Date(Date.now() - 2 * 3_600_000)
    const b = new Date(Date.now() - 5 * 3_600_000)
    await adapter.listCharges(CREDS, { page: 1, limit: 2, updatedAfter: a })
    calls.length = 0
    const rows = await adapter.listCharges(CREDS, { page: 2, limit: 2, updatedAfter: b })
    expect(rows.map((r) => r.id)).toEqual(['o-2', 'o-3'])
    const bodies = calls.map((c) => JSON.parse(c.body!))
    // The second walk starts its own report from the top, with its own date_from.
    expect(bodies[0]!.next_page_iterator).toBeUndefined()
    expect(
      Date.parse(`${String(bodies.at(-1)!.date_from).replace(' ', 'T')}Z`),
    ).toBeLessThanOrEqual(b.getTime())
  })

  it.each([
    ['listCharges', '/card-orders'],
    ['listRefunds', '/card-orders'],
    ['listDisputes', '/card-orders/chargebacks'],
    ['listSubscriptions', '/subscriptions'],
  ] as const)(
    '%s throws 401 on the documented 200 "Authentication failed" body',
    async (m, path) => {
      handlers.post = (base, p) => {
        expect(base).toBe(REPORTS)
        expect(p).toBe(path)
        return { error: { code: '1.01', messages: ['Authentication failed'] } }
      }
      const params = withPageSink({ page: 1, limit: 10, updatedAfter: SINCE } as QueryParams)
      await expect(adapter[m](CREDS, params)).rejects.toMatchObject({ statusCode: 401 })
      expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
    },
  )

  it('clamps the report limit to 2000', async () => {
    serveReport('/card-orders', [cardOrder()], (orders) => ({ orders }))
    await adapter.listCharges(CREDS, { page: 1, limit: 5000, updatedAfter: SINCE })
    expect(JSON.parse(calls[0]!.body!).limit).toBe(2000)
  })

  it('returns nothing, with no request, when updatedAfter is past the window end', async () => {
    const params = withPageSink({
      page: 1,
      limit: 10,
      updatedAfter: new Date(Date.now() + 2 * 86_400_000),
    } as QueryParams)
    expect(await adapter.listCharges(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it('walks 2L+1 charges over three pages, each once, with exact hasMore', async () => {
    const L = 4
    const orders = Array.from({ length: 2 * L + 1 }, (_, i) => ({
      ...cardOrder(),
      order_id: `o-${i}`,
    }))
    serveReport('/card-orders', orders, (page) => ({ orders: page }))
    const { ids, more } = await walk((p) => adapter.listCharges(CREDS, p), L, 3)
    expect(ids).toEqual(orders.map((o) => o.order_id))
    expect(more).toEqual([true, true, false])
    // Follows the iterator the newest window's report returned.
    const newest = calls
      .map((c) => JSON.parse(c.body!))
      .filter((b) => Date.parse(`${String(b.date_to).replace(' ', 'T')}Z`) > Date.now())
    expect(newest.map((b) => b.next_page_iterator)).toEqual([
      undefined,
      Buffer.from('4').toString('base64'),
      Buffer.from('8').toString('base64'),
    ])
  })

  it('flattens refund transactions out of uneven order pages', async () => {
    const L = 3
    // 7 = 2L+1 refunds spread 0, 3, 1, 2, 0, 1 over six orders, among non-refund transactions.
    const spread = [0, 3, 1, 2, 0, 1]
    let n = 0
    const orders = spread.map((k, i) => {
      const base = cardOrder()
      const tx = base.transactions[0]!
      const refunds = Array.from({ length: k }, () => ({
        ...tx,
        id: `r-${n++}`,
        operation: 'refund',
        status: 'success',
      }))
      return { ...base, order_id: `o-${i}`, transactions: [tx, ...refunds] }
    })
    serveReport('/card-orders', orders, (page) => ({ orders: page }))
    const { ids, more } = await walk((p) => adapter.listRefunds(CREDS, p), L, 3)
    expect(ids).toEqual(Array.from({ length: 7 }, (_, i) => `r-${i}`))
    expect(more).toEqual([true, true, false])
  })

  it('flattens chargebacks out of uneven order pages', async () => {
    const L = 2
    const spread = [2, 0, 1, 2]
    let n = 0
    const orders = spread.map((k, i) => ({
      order_id: `o-${i}`,
      chargebacks: Array.from({ length: k }, () => ({ ...chargeback(), id: `cb-${n++}` })),
    }))
    serveReport('/card-orders/chargebacks', orders, (page) => ({ orders: page }))
    const { ids, more } = await walk((p) => adapter.listDisputes(CREDS, p), L, 3)
    expect(ids).toEqual(['cb-0', 'cb-1', 'cb-2', 'cb-3', 'cb-4'])
    expect(more).toEqual([true, true, false])
  })

  it('reads subscriptions from the id-keyed map', async () => {
    const L = 2
    const subs = Array.from({ length: 2 * L + 1 }, (_, i) => ({ ...subscription(), id: `s-${i}` }))
    serveReport('/subscriptions', subs, (page) => ({
      subscriptions: Object.fromEntries(page.map((s) => [s.id, s])),
    }))
    const { ids, more } = await walk((p) => adapter.listSubscriptions(CREDS, p), L, 3)
    expect(ids).toEqual(subs.map((s) => s.id))
    expect(more).toEqual([true, true, false])
  })
})

describe('SolidgateAdapter.getCharge', () => {
  it('reads one order from POST /status on the card payments host', async () => {
    handlers.post = (base, path, body) => {
      expect(base).toBe(PAY)
      expect(path).toBe('/status')
      expect(body).toEqual({ order_id: 'o-1' })
      return {
        order: {
          order_id: 'o-1',
          amount: 1020,
          currency: 'USD',
          refunded_amount: 0,
          status: 'settle_ok',
        },
        transactions: {},
      }
    }
    const c = await adapter.getCharge(CREDS, 'o-1')
    expect(c).toMatchObject({ id: 'o-1', amount: 1020, currency: 'USD', status: 'succeeded' })
    // /status gives no refunded currency, so the refunded amount is left out.
    expect(c.amountRefunded).toBeUndefined()
  })

  it('maps the documented "Error 2.01 Order not found" body to 404', async () => {
    handlers.post = () => ({ error: { code: '2.01', messages: { order: ['Order not found.'] } } })
    await expect(adapter.getCharge(CREDS, 'o-x')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('throws 401 on the documented 200 "Authentication failed" body', async () => {
    handlers.post = () => ({ error: { code: '1.01', messages: ['Authentication failed'] } })
    await expect(adapter.getCharge(CREDS, 'o-x')).rejects.toMatchObject({ statusCode: 401 })
  })
})

/** Products (and their prices) on the Subscriptions host, offset-paged. */
function serveCatalog(
  products: Record<string, unknown>[],
  prices: Record<string, Record<string, unknown>[]>,
) {
  handlers.get = (base, path, params) => {
    expect(base).toBe(SUBS)
    for (const k of Object.keys(params))
      if (!CATALOG_QUERY.has(k)) throw new Error(`undocumented query ${k}`)
    const limit =
      params['pagination[limit]'] === undefined ? 10 : Number(params['pagination[limit]'])
    if (limit < 1 || limit > 100) throw new Error(`bad limit ${limit}`)
    const offset = Number(params['pagination[offset]'] ?? 0)
    let all: Record<string, unknown>[]
    const m = /^\/products\/([^/]+)(\/prices)?$/.exec(path)
    if (path === '/products') all = products
    else if (m && m[2]) all = prices[decodeURIComponent(m[1]!)] ?? []
    else if (m) {
      const p = products.find((x) => x.id === decodeURIComponent(m[1]!))
      if (!p) throw Object.assign(new Error('not found'), { response: { status: 404 } })
      return p
    } else throw new Error(`unexpected GET ${path}`)
    return {
      data: all.slice(offset, offset + limit),
      pagination: { offset, limit, total_count: all.length },
    }
  }
}

describe('SolidgateAdapter.listProducts', () => {
  it('sends only pagination[limit] and pagination[offset] for the caller page', async () => {
    serveCatalog([], {})
    await adapter.listProducts(CREDS, { page: 3, limit: 20 })
    expect(calls[0]!.path).toBe('/products')
    expect(calls[0]!.params).toEqual({ 'pagination[limit]': 20, 'pagination[offset]': 40 })
  })

  it('walks 2L+1 products with exact hasMore and total', async () => {
    const L = 5
    const products = Array.from({ length: 2 * L + 1 }, (_, i) => ({
      ...recurringProduct(),
      id: `p-${i}`,
    }))
    serveCatalog(products, {})
    const ids: string[] = []
    const reports = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      ids.push(...(await adapter.listProducts(CREDS, params)).map((p) => p.id))
      reports.push(readUpstreamPage(params))
    }
    expect(ids).toEqual(products.map((p) => p.id))
    expect(reports.map((r) => r?.hasMore)).toEqual([true, true, false])
    expect(reports.every((r) => r?.totalCount === 2 * L + 1)).toBe(true)
  })

  it('clamps to 100 and reports the size sent', async () => {
    serveCatalog([recurringProduct()], {})
    const params = withPageSink({ page: 1, limit: 250 } as QueryParams)
    await adapter.listProducts(CREDS, params)
    expect(calls[0]!.params!['pagination[limit]']).toBe(100)
    expect(readUpstreamPage(params)?.pageSize).toBe(100)
  })

  it('getProduct reads GET /products/{product_id}', async () => {
    serveCatalog([{ ...recurringProduct(), id: 'p-9' }], {})
    const p = await adapter.getProduct(CREDS, 'p-9')
    expect(p.id).toBe('p-9')
    expect(calls[0]!.path).toBe('/products/p-9')
  })
})

describe('SolidgateAdapter prices and plans', () => {
  // Three products with uneven price counts; the one-time product has prices but no plans.
  const products = [
    { ...recurringProduct(), id: 'p-a' },
    { ...oneTimeProduct(), id: 'p-b' },
    { ...recurringProduct(), id: 'p-c' },
  ]
  const prices = {
    'p-a': [
      { ...price(), id: 'a1' },
      { ...price(), id: 'a2' },
    ],
    'p-b': [
      { ...price(), id: 'b1' },
      { ...price(), id: 'b2' },
    ],
    'p-c': [
      { ...price(), id: 'c1' },
      { ...price(), id: 'c2' },
      { ...price(), id: 'c3' },
    ],
  }

  it('walks 2L+1 prices across products, each once, with exact hasMore', async () => {
    serveCatalog(products, prices)
    const { ids, more } = await walk((p) => adapter.listPrices(CREDS, p), 3, 3)
    expect(ids).toEqual(['p-a:a1', 'p-a:a2', 'p-b:b1', 'p-b:b2', 'p-c:c1', 'p-c:c2', 'p-c:c3'])
    expect(more).toEqual([true, true, false])
  })

  it('pages the products walk past the first 100', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ ...recurringProduct(), id: `p-${i}` }))
    serveCatalog(many, { 'p-100': [{ ...price(), id: 'last' }] })
    const rows = await adapter.listPrices(CREDS, { page: 1, limit: 10 })
    expect(rows.map((r) => r.id)).toEqual(['p-100:last'])
    const productCalls = calls.filter((c) => c.path === '/products')
    expect(productCalls.map((c) => c.params)).toEqual([
      { 'pagination[limit]': 100, 'pagination[offset]': 0 },
      { 'pagination[limit]': 100, 'pagination[offset]': 100 },
    ])
  })

  it('pages one product’s prices past the first 100', async () => {
    const lots = Array.from({ length: 101 }, (_, i) => ({ ...price(), id: `x${i}` }))
    serveCatalog([{ ...recurringProduct(), id: 'p-x' }], { 'p-x': lots })
    const rows = await adapter.listPrices(CREDS, { page: 2, limit: 100 })
    expect(rows.map((r) => r.id)).toEqual(['p-x:x100'])
  })

  it('walks 2L+1 plans, only for recurring products, with exact hasMore', async () => {
    serveCatalog(products, prices)
    const { ids, more } = await walk((p) => adapter.listPlans(CREDS, p), 2, 3)
    expect(ids).toEqual(['p-a:a1', 'p-a:a2', 'p-c:c1', 'p-c:c2', 'p-c:c3'])
    expect(more).toEqual([true, true, false])
  })

  it('reads a price and a plan back from their listed ids', async () => {
    serveCatalog(products, prices)
    expect((await adapter.getPrice(CREDS, 'p-c:c2')).id).toBe('p-c:c2')
    expect((await adapter.getPlan(CREDS, 'p-a:a1')).id).toBe('p-a:a1')
    await expect(adapter.getPlan(CREDS, 'p-b:b1')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getPrice(CREDS, 'p-c:nope')).rejects.toMatchObject({ statusCode: 404 })
    await expect(adapter.getPrice(CREDS, 'no-colon')).rejects.toMatchObject({ statusCode: 404 })
  })

  it.each([':a1', 'p-a:'])('refuses the malformed id %s with 404 and sends nothing', async (id) => {
    serveCatalog(products, prices)
    await expect(adapter.getPrice(CREDS, id)).rejects.toMatchObject({ statusCode: 404 })
    expect(calls).toHaveLength(0)
  })
})
