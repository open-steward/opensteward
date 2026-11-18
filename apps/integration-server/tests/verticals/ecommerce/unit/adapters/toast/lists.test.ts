/**
 * Toast list and read methods rebuilt onto documented endpoints.
 *
 * Each fake upstream honours ONLY the parameters its operation documents:
 *
 *  - GET /config/v2/menuItems, /config/v2/menuGroups: `pageToken` and
 *    `lastModified`; next page in the `Toast-Next-Page-Token` header, pages
 *    sized by data volume ("the number of objects that it returns in a single
 *    response is based on the data size of those objects").
 *    https://doc.toasttab.com/openapi/configuration/operation/menuItemsGet/
 *  - GET /restaurants/v1/restaurants/{restaurantGUID} → one RestaurantInfo.
 *  - GET /orders/v2/ordersBulk: `startDate`, `endDate`, `businessDate`,
 *    `pageSize` (max 100) and a 1-based `page`; `link` headers with
 *    rel="next". https://doc.toasttab.com/openapi/orders/operation/ordersBulkGet/
 *  - GET /orders/v2/payments: exactly one of `paidBusinessDate`,
 *    `refundBusinessDate`, `voidBusinessDate` (yyyyMMdd) → a GUID array;
 *    GET /orders/v2/payments/{guid} → one Payment.
 *    https://doc.toasttab.com/openapi/orders/operation/paymentsGet/
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetRowPager } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { ToastAdapter } from '../../../../../../src/verticals/ecommerce/adapters/toast/index'

const RESTAURANT = 'rest-1'
const CREDS = { accessToken: 'toast-token', extra: { restaurantId: RESTAURANT } }
const NOW = new Date('2026-09-25T15:30:00.000Z')

interface Call {
  path: string
  params: Record<string, unknown>
}

type Handler = (
  path: string,
  params: Record<string, unknown>,
) => { data: unknown; headers?: Record<string, unknown> }

function server(handler: Handler) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    const res = handler(path, params)
    return { data: res.data, headers: res.headers ?? {} }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return { calls }
}

function restaurantInfo(currencyCode: string | undefined) {
  return {
    guid: RESTAURANT,
    general: { name: 'Trattoria Roma', archived: false, currencyCode },
    location: { address1: '401 Park Drive', city: 'Boston', zipCode: '02215', country: 'US' },
  }
}

function http(status: number): Error {
  return Object.assign(new Error(`${status} upstream error`), { response: { status } })
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  _resetRowPager()
})

// ── Configuration API: menu items and menu groups ────────────────────────────

const CONFIG_SIZES = [7, 3, 11, 0, 5]

function configServer(path: string, rows: number, opts: { conflictOnTokenCall?: number } = {}) {
  const ids = Array.from(
    { length: rows },
    (_, i) => `${path.split('/').pop()}-${String(i + 1).padStart(4, '0')}`,
  )
  const starts: number[] = []
  for (let s = 0, k = 0; s < rows || starts.length === 0; k++) {
    starts.push(s)
    s += CONFIG_SIZES[k % CONFIG_SIZES.length]!
  }
  const tokenFor = (i: number) => `tok-${i}`
  let tokenCalls = 0
  let conflicted = false
  const s = server((p, params) => {
    if (p !== path) throw new Error(`unexpected path in test: ${p}`)
    for (const k of Object.keys(params)) {
      if (k !== 'pageToken' && k !== 'lastModified') throw http(400)
    }
    let i = 0
    if (params['pageToken'] !== undefined) {
      tokenCalls++
      if (!conflicted && opts.conflictOnTokenCall === tokenCalls) {
        conflicted = true
        throw http(409)
      }
      const m = /^tok-(\d+)$/.exec(String(params['pageToken']))
      if (!m) throw http(400)
      i = Number(m[1])
    }
    const start = Math.min(starts[i]!, rows)
    const end = i + 1 < starts.length ? Math.min(starts[i + 1]!, rows) : rows
    const headers: Record<string, unknown> = {}
    if (i + 1 < starts.length && starts[i + 1]! < rows)
      headers['toast-next-page-token'] = tokenFor(i + 1)
    return {
      data: ids.slice(start, end).map((guid) => ({ guid, entityType: 'X', name: `n-${guid}` })),
      headers,
    }
  })
  return { ...s, ids }
}

const CONFIG_CASES = [
  { method: 'listProducts' as const, path: '/config/v2/menuItems' },
  { method: 'listCollections' as const, path: '/config/v2/menuGroups' },
]

describe.each(CONFIG_CASES)('Toast $method (Configuration API)', ({ method, path }) => {
  it('serves 2L+1 rows once each across pages 1..3 with exact hasMore', async () => {
    for (const L of [2, 7, 10]) {
      _resetRowPager()
      vi.restoreAllMocks()
      const up = configServer(path, 2 * L + 1)
      const adapter = new ToastAdapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        seen.push(...(await adapter[method](CREDS, params)).map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(up.ids)
      expect(hasMore).toEqual([true, true, false])
    }
  })

  it('sends only the documented pageToken, never pageSize or page', async () => {
    const up = configServer(path, 25)
    const adapter = new ToastAdapter()
    await adapter[method](CREDS, withPageSink({ page: 2, limit: 10 } as QueryParams))
    expect(up.calls[0]).toEqual({ path, params: {} })
    expect(up.calls.slice(1).map((c) => c.params)).toEqual(
      up.calls.slice(1).map((_, i) => ({ pageToken: `tok-${i + 1}` })),
    )
  })

  it('sends updatedAfter as lastModified in the documented format on every page', async () => {
    const up = configServer(path, 25)
    const adapter = new ToastAdapter()
    const updatedAfter = new Date('2024-06-20T00:00:00.000Z')
    await adapter[method](CREDS, withPageSink({ page: 2, limit: 10, updatedAfter } as QueryParams))
    expect(up.calls.length).toBeGreaterThan(1)
    for (const c of up.calls) expect(c.params['lastModified']).toBe('2024-06-20T00:00:00.000+0000')
  })

  it('restarts from the first page on a 409', async () => {
    const up = configServer(path, 21, { conflictOnTokenCall: 1 })
    const adapter = new ToastAdapter()
    const rows = await adapter[method](CREDS, withPageSink({ page: 2, limit: 10 } as QueryParams))
    expect(rows.map((r) => r.id)).toEqual(up.ids.slice(10, 20))
    expect(up.calls.filter((c) => c.params['pageToken'] === undefined)).toHaveLength(2)
  })
})

describe('Toast Configuration list key', () => {
  it('does not resume a walk made under a different lastModified filter', async () => {
    // Unfiltered: 12 rows in pages of 3. With lastModified: the 6 even rows, in
    // pages of 2. Tokens are plain page indexes, so a token from one walk
    // lands on a different row offset in the other.
    const all = Array.from({ length: 12 }, (_, i) => `item-${i}`)
    const changed = all.filter((_, i) => i % 2 === 0)
    server((_p, params) => {
      const rows = params['lastModified'] === undefined ? all : changed
      const size = params['lastModified'] === undefined ? 3 : 2
      const i = params['pageToken'] === undefined ? 0 : Number(params['pageToken'])
      const headers: Record<string, unknown> = {}
      if ((i + 1) * size < rows.length) headers['toast-next-page-token'] = String(i + 1)
      return {
        data: rows.slice(i * size, (i + 1) * size).map((guid) => ({ guid, name: guid })),
        headers,
      }
    })
    const adapter = new ToastAdapter()
    const unfiltered = await adapter.listProducts(
      CREDS,
      withPageSink({ page: 2, limit: 3 } as QueryParams),
    )
    expect(unfiltered.map((r) => r.id)).toEqual(all.slice(3, 6))
    const updatedAfter = new Date('2024-06-20T00:00:00.000Z')
    const filtered = await adapter.listProducts(
      CREDS,
      withPageSink({ page: 2, limit: 3, updatedAfter } as QueryParams),
    )
    expect(filtered.map((r) => r.id)).toEqual(changed.slice(3, 6))
  })
})

describe('Toast getProduct / getCollection', () => {
  it('read one config object by GUID', async () => {
    const up = server((p) => ({ data: { guid: p.split('/').pop(), name: 'Pizza' } }))
    const adapter = new ToastAdapter()
    expect((await adapter.getProduct(CREDS, 'item-9')).id).toBe('item-9')
    expect((await adapter.getCollection(CREDS, 'group-9')).id).toBe('group-9')
    expect(up.calls.map((c) => c.path)).toEqual([
      '/config/v2/menuItems/item-9',
      '/config/v2/menuGroups/group-9',
    ])
  })
})

// ── Restaurants API: the connection's one restaurant ────────────────────────

describe('Toast listLocations', () => {
  it('reads the connection restaurant by GUID and pages it locally', async () => {
    const up = server((p) => {
      if (p !== `/restaurants/v1/restaurants/${RESTAURANT}`) throw http(404)
      return { data: restaurantInfo('USD') }
    })
    const adapter = new ToastAdapter()
    const p1 = withPageSink({ page: 1, limit: 10 } as QueryParams)
    const rows = await adapter.listLocations(CREDS, p1)
    expect(rows.map((r) => r.id)).toEqual([RESTAURANT])
    expect(rows[0]!.name).toBe('Trattoria Roma')
    expect(readUpstreamPage(p1)).toMatchObject({
      hasMore: false,
      totalCount: 1,
      pagedLocally: true,
    })
    const p2 = withPageSink({ page: 2, limit: 10 } as QueryParams)
    expect(await adapter.listLocations(CREDS, p2)).toEqual([])
    expect(up.calls.map((c) => c.params)).toEqual([
      { includeArchived: true },
      { includeArchived: true },
    ])
  })

  it('getLocation reads the requested GUID, archived restaurants included', async () => {
    const up = server((p, params) => {
      if (p !== '/restaurants/v1/restaurants/rest-2') throw http(404)
      // Documented: an archived restaurant is a 404 unless includeArchived is true.
      if (params['includeArchived'] !== true) throw http(404)
      return {
        data: { guid: 'rest-2', general: { name: 'Closed Branch', archived: true }, location: {} },
      }
    })
    const adapter = new ToastAdapter()
    const loc = await adapter.getLocation(CREDS, 'rest-2')
    expect(loc.id).toBe('rest-2')
    expect(loc.name).toBe('Closed Branch')
    expect(loc.active).toBe(false)
    expect(up.calls).toEqual([
      { path: '/restaurants/v1/restaurants/rest-2', params: { includeArchived: true } },
    ])
  })
})

// ── Customers: no API ───────────────────────────────────────────────────────

describe('Toast customers', () => {
  it('listCustomers and getCustomer refuse with 501 NOT_SUPPORTED and send nothing', async () => {
    const up = server(() => {
      throw new Error('no request expected')
    })
    const adapter = new ToastAdapter()
    await expect(
      adapter.listCustomers(CREDS, withPageSink({ page: 1, limit: 10 } as QueryParams)),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    await expect(adapter.getCustomer(CREDS, 'guest-1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(up.calls).toEqual([])
  })
})

// ── Orders API: ordersBulk ──────────────────────────────────────────────────

function ordersServer(rows: number, opts: { link?: boolean; currency?: string } = {}) {
  const ids = Array.from({ length: rows }, (_, i) => `order-${String(i + 1).padStart(4, '0')}`)
  const s = server((p, params) => {
    if (p === `/restaurants/v1/restaurants/${RESTAURANT}`)
      return { data: restaurantInfo('currency' in opts ? opts.currency : 'USD') }
    if (p !== '/orders/v2/ordersBulk') throw new Error(`unexpected path in test: ${p}`)
    for (const k of Object.keys(params)) {
      if (!['startDate', 'endDate', 'businessDate', 'pageSize', 'page'].includes(k)) throw http(400)
    }
    const pageSize = Number(params['pageSize'])
    const page = Number(params['page'])
    if (!(pageSize >= 1 && pageSize <= 100) || !(page >= 1)) throw http(400)
    const start = (page - 1) * pageSize
    const headers: Record<string, unknown> = {}
    if (opts.link !== false) {
      const links = [
        `<https://h/orders/v2/ordersBulk?pageSize=${pageSize}&page=${page}>; rel="self"`,
      ]
      if (start + pageSize < rows)
        links.push(
          `<https://h/orders/v2/ordersBulk?pageSize=${pageSize}&page=${page + 1}>; rel="next"`,
        )
      headers['link'] = links.join(', ')
    }
    return {
      data: ids.slice(start, start + pageSize).map((guid) => ({
        guid,
        entityType: 'Order',
        checks: [
          {
            guid: `${guid}-c`,
            entityType: 'Check',
            totalAmount: 12.5,
            taxAmount: 1,
            paymentStatus: 'CLOSED',
            selections: [],
          },
        ],
      })),
      headers,
    }
  })
  return { ...s, ids }
}

describe('Toast listOrders (ordersBulk)', () => {
  it('serves 2L+1 orders once each with exact hasMore from the Link header', async () => {
    for (const L of [2, 7, 10]) {
      vi.restoreAllMocks()
      const up = ordersServer(2 * L + 1)
      const adapter = new ToastAdapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        seen.push(...(await adapter.listOrders(CREDS, params)).map((o) => o.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(up.ids)
      expect(hasMore).toEqual([true, true, false])
    }
  })

  it('sends the documented window and 1-based page/pageSize', async () => {
    const up = ordersServer(30)
    const adapter = new ToastAdapter()
    await adapter.listOrders(CREDS, withPageSink({ page: 2, limit: 10 } as QueryParams))
    const bulk = up.calls.filter((c) => c.path === '/orders/v2/ordersBulk')
    expect(bulk.map((c) => c.params)).toEqual([
      {
        startDate: '2015-12-01T00:00:00.001Z',
        endDate: '2026-09-26T00:00:00.000Z',
        pageSize: 10,
        page: 2,
      },
    ])
  })

  it('starts the window at updatedAfter', async () => {
    const up = ordersServer(3)
    const adapter = new ToastAdapter()
    const updatedAfter = new Date('2026-09-01T12:00:00.000Z')
    await adapter.listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter } as QueryParams),
    )
    expect(up.calls[0]!.params['startDate']).toBe('2026-09-01T12:00:00.000Z')
  })

  it('sends nothing when updatedAfter is at or past the window end', async () => {
    // "The `endDate` date and time must be later than the `startDate`".
    const up = ordersServer(3)
    const adapter = new ToastAdapter()
    const updatedAfter = new Date('2026-09-26T00:00:00.000Z') // the next UTC midnight
    const params = withPageSink({ page: 1, limit: 10, updatedAfter } as QueryParams)
    expect(await adapter.listOrders(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(up.calls).toEqual([])
  })

  it('clamps the size to the documented maximum of 100 and reports it', async () => {
    const up = ordersServer(250)
    const adapter = new ToastAdapter()
    const params = withPageSink({ page: 2, limit: 250 } as QueryParams)
    const rows = await adapter.listOrders(CREDS, params)
    expect(rows.map((o) => o.id)).toEqual(up.ids.slice(100, 200))
    expect(up.calls[0]!.params).toMatchObject({ pageSize: 100, page: 2 })
    expect(readUpstreamPage(params)).toMatchObject({ pageSize: 100, hasMore: true })
  })

  it('reports no hasMore when the response carries no Link header', async () => {
    ordersServer(5, { link: false })
    const adapter = new ToastAdapter()
    const params = withPageSink({ page: 1, limit: 10 } as QueryParams)
    await adapter.listOrders(CREDS, params)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })

  it("prices orders in the restaurant's currency, and skips that lookup for an empty page", async () => {
    const up = ordersServer(3, { currency: 'CAD' })
    const adapter = new ToastAdapter()
    const rows = await adapter.listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 10 } as QueryParams),
    )
    expect(rows[0]!.totalPrice).toEqual({ amount: 1250, currency: 'CAD' })
    expect(up.calls.map((c) => c.path)).toEqual([
      '/orders/v2/ordersBulk',
      `/restaurants/v1/restaurants/${RESTAURANT}`,
    ])
    up.calls.length = 0
    expect(
      await adapter.listOrders(CREDS, withPageSink({ page: 2, limit: 10 } as QueryParams)),
    ).toEqual([])
    expect(up.calls.map((c) => c.path)).toEqual(['/orders/v2/ordersBulk'])
  })

  it('omits money when the restaurant names no currency', async () => {
    ordersServer(1, { currency: undefined })
    const adapter = new ToastAdapter()
    const rows = await adapter.listOrders(
      CREDS,
      withPageSink({ page: 1, limit: 10 } as QueryParams),
    )
    expect(rows[0]!.totalPrice).toBeUndefined()
    expect(rows[0]!.currency).toBeUndefined()
  })

  it("getOrder reads /orders/v2/orders/{guid} and prices it in the restaurant's currency", async () => {
    const up = server((p) =>
      p.startsWith('/restaurants/')
        ? { data: restaurantInfo('EUR') }
        : {
            data: {
              guid: 'o-1',
              entityType: 'Order',
              checks: [{ guid: 'c-1', totalAmount: 20, taxAmount: 2, paymentStatus: 'CLOSED' }],
            },
          },
    )
    const adapter = new ToastAdapter()
    const order = await adapter.getOrder(CREDS, 'o-1')
    expect(order.id).toBe('o-1')
    expect(order.currency).toBe('EUR')
    expect(order.totalPrice).toEqual({ amount: 2000, currency: 'EUR' })
    expect(up.calls[0]!.path).toBe('/orders/v2/orders/o-1')
  })
})

// ── Orders API: payments by business day ────────────────────────────────────

/** GUIDs per business day; uneven, with empty days. */
function paymentsServer(
  filter: 'paidBusinessDate' | 'refundBusinessDate',
  days: Record<string, number>,
  currency = 'USD',
) {
  const byDay = new Map<string, string[]>()
  for (const [day, n] of Object.entries(days)) {
    byDay.set(
      day,
      Array.from({ length: n }, (_, i) => `pay-${day}-${i + 1}`),
    )
  }
  const s = server((p, params) => {
    if (p === `/restaurants/v1/restaurants/${RESTAURANT}`) return { data: restaurantInfo(currency) }
    if (p === '/orders/v2/payments') {
      const keys = Object.keys(params)
      if (keys.length !== 1 || keys[0] !== filter || !/^\d{8}$/.test(String(params[filter])))
        throw http(400)
      return { data: byDay.get(String(params[filter])) ?? [] }
    }
    const m = /^\/orders\/v2\/payments\/(pay-(\d{8})-\d+)$/.exec(p)
    if (!m) throw new Error(`unexpected path in test: ${p}`)
    return {
      data: {
        guid: m[1],
        entityType: 'OrderPayment',
        orderGuid: `order-of-${m[1]}`,
        type: 'CREDIT',
        amount: 10,
        tipAmount: 0,
        paymentStatus: 'CAPTURED',
        refundStatus: 'FULL',
        refund: {
          refundAmount: 10,
          tipRefundAmount: 0,
          refundDate: '2026-09-20T12:00:00.000+0000',
        },
      },
    }
  })
  // Newest day first, as the adapter walks.
  const ids = [...byDay.keys()]
    .sort()
    .reverse()
    .flatMap((d) => byDay.get(d)!)
  return { ...s, ids }
}

const PAYMENT_CASES = [
  { method: 'listTransactions' as const, filter: 'paidBusinessDate' as const },
  { method: 'listRefunds' as const, filter: 'refundBusinessDate' as const },
]

describe.each(PAYMENT_CASES)(
  'Toast $method (GET /orders/v2/payments by $filter)',
  ({ method, filter }) => {
    it('refuses without updatedAfter, before sending anything', async () => {
      const up = server(() => {
        throw new Error('no request expected')
      })
      const adapter = new ToastAdapter()
      for (const page of [1, 2]) {
        await expect(
          adapter[method](CREDS, withPageSink({ page, limit: 10 } as QueryParams)),
        ).rejects.toMatchObject({
          statusCode: 501,
          code: 'NOT_SUPPORTED',
        })
      }
      expect(up.calls).toEqual([])
    })

    it('walks business days newest-first from tomorrow to the day before updatedAfter', async () => {
      // updatedAfter 2026-09-21 → oldest day 20260920; tomorrow (UTC) is 20260926.
      const up = paymentsServer(filter, {
        20260926: 0,
        20260925: 3,
        20260924: 0,
        20260923: 1,
        20260922: 4,
        20260921: 2,
        20260920: 1,
        20260919: 50, // before the window: never requested
      })
      const updatedAfter = new Date('2026-09-21T10:00:00.000Z')
      const adapter = new ToastAdapter()
      const params = withPageSink({ page: 1, limit: 100, updatedAfter } as QueryParams)
      const rows = await adapter[method](CREDS, params)
      expect(rows.map((r) => r.id)).toEqual(up.ids.filter((id) => !id.includes('20260919')))
      const days = up.calls
        .filter((c) => c.path === '/orders/v2/payments')
        .map((c) => c.params[filter])
      expect(days).toEqual([
        '20260926',
        '20260925',
        '20260924',
        '20260923',
        '20260922',
        '20260921',
        '20260920',
      ])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('starts a fresh walk when the UTC day, and so the newest business day, rolls over', async () => {
      // 3 GUIDs a day. Page 1 at 23:59:50Z on the 25th walks from the 26th;
      // page 2 twenty seconds later (inside the pager's idle TTL) must walk
      // from the 27th, not resume the walk that started a day lower.
      const days: Record<string, number> = {}
      for (let d = 20; d <= 27; d++) days[`202609${d}`] = 3
      const up = paymentsServer(filter, days)
      const updatedAfter = new Date('2026-09-21T00:00:00.000Z')
      const adapter = new ToastAdapter()
      vi.setSystemTime(new Date('2026-09-25T23:59:50.000Z'))
      const p1 = await adapter[method](
        CREDS,
        withPageSink({ page: 1, limit: 3, updatedAfter } as QueryParams),
      )
      expect(p1.map((r) => r.id)).toEqual(up.ids.filter((id) => id.includes('20260926')))
      vi.setSystemTime(new Date('2026-09-26T00:00:10.000Z'))
      const p2 = await adapter[method](
        CREDS,
        withPageSink({ page: 2, limit: 3, updatedAfter } as QueryParams),
      )
      expect(p2.map((r) => r.id)).toEqual(up.ids.filter((id) => id.includes('20260926')))
    })

    it('serves 2L+1 payments once each across pages 1..3 with exact hasMore', async () => {
      const updatedAfter = new Date('2026-09-15T00:00:00.000Z')
      for (const L of [2, 5]) {
        _resetRowPager()
        vi.restoreAllMocks()
        // 2L+1 GUIDs over uneven days, with an empty day in between.
        const sizes = [L + 1, 0, 1, L - 1]
        const days: Record<string, number> = {}
        sizes.forEach((n, i) => (days[`202609${String(25 - i).padStart(2, '0')}`] = n))
        const up = paymentsServer(filter, days)
        expect(up.ids).toHaveLength(2 * L + 1)
        const adapter = new ToastAdapter()
        const seen: string[] = []
        const hasMore: (boolean | undefined)[] = []
        for (const page of [1, 2, 3]) {
          const params = withPageSink({ page, limit: L, updatedAfter } as QueryParams)
          seen.push(...(await adapter[method](CREDS, params)).map((r) => r.id))
          hasMore.push(readUpstreamPage(params)?.hasMore)
        }
        expect(seen).toEqual(up.ids)
        expect(hasMore).toEqual([true, true, false])
      }
    })

    it('reads each payment by GUID and prices it in the restaurant currency', async () => {
      const up = paymentsServer(filter, { 20260925: 1 }, 'CAD')
      const adapter = new ToastAdapter()
      const updatedAfter = new Date('2026-09-25T00:00:00.000Z')
      const [row] = await adapter[method](
        CREDS,
        withPageSink({ page: 1, limit: 10, updatedAfter } as QueryParams),
      )
      expect(row!.id).toBe('pay-20260925-1')
      expect(row!.amount).toEqual({ amount: 1000, currency: 'CAD' })
      expect(up.calls.some((c) => c.path === '/orders/v2/payments/pay-20260925-1')).toBe(true)
    })
  },
)

describe('Toast getTransaction / getRefund', () => {
  it('read the payment by GUID from /orders/v2/payments/{guid}', async () => {
    const up = paymentsServer('paidBusinessDate', {})
    const adapter = new ToastAdapter()
    const tx = await adapter.getTransaction(CREDS, 'pay-20260101-1')
    const rf = await adapter.getRefund(CREDS, 'pay-20260101-1')
    expect(tx.id).toBe('pay-20260101-1')
    expect(rf.id).toBe('pay-20260101-1')
    expect(rf.orderId).toBe('order-of-pay-20260101-1')
    expect(up.calls.filter((c) => c.path.startsWith('/orders/')).map((c) => c.path)).toEqual([
      '/orders/v2/payments/pay-20260101-1',
      '/orders/v2/payments/pay-20260101-1',
    ])
  })
})
