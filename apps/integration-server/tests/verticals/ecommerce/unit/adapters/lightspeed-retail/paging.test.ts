/**
 * Lightspeed Retail (R-Series) V3 query endpoints page by opaque cursor only.
 * The 2022.04.11 changelog removed `offset` ("The offset query parameter is
 * removed. It is replaced with the after and before query parameters, which
 * use cursors to resume the query in an efficient manner.") and the default
 * `count` attribute. The pagination guide
 * (https://developers.lightspeedhq.com/retail/introduction/pagination/):
 *   - "In addition to all of the query parameters of the initial request, the
 *     next/previous URLs always contain the after/before query parameters"
 *   - "If no adjacent page is available in a given direction, the next and/or
 *     previous keys will contain an empty string."
 *   - "The Lightspeed API limits the number of returned objects to a maximum
 *     of 100."
 *
 * Every list method used to send `limit` plus `offset=0` and never derived
 * anything from `page`, so page 2 repeated page 1.
 *
 * The fake below honours ONLY the documented parameters: `limit` (silently
 * capped at 100) and `after`. It ignores `offset`. `@attributes.next` is the
 * full URL of the next page, carrying every original query parameter plus
 * `after`, and an empty string on the last page.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { LightspeedRetailAdapter } from '../../../../../../src/verticals/ecommerce/adapters/lightspeed-retail/index'

const ACCOUNT = 'acc1'
const BASE = `https://api.lightspeedapp.com/API/V3/Account/${ACCOUNT}/`
const CREDS = { accessToken: 'tok', refreshToken: 'rt', extra: { accountId: ACCOUNT } }

interface Call {
  path: string
  params: Record<string, string>
}

const encode = (i: number): string => Buffer.from(`pos:${i}`).toString('base64')
const decode = (c: string): number => Number(Buffer.from(c, 'base64').toString().slice(4))

function row(i: number): Record<string, unknown> {
  const id = String(i)
  return {
    itemID: id,
    categoryID: id,
    shopID: id,
    customerID: id,
    saleID: id,
    specialOrderID: id,
    salePaymentID: id,
    discountID: id,
    description: `Row ${id}`,
    name: `Row ${id}`,
  }
}

function fakeLightspeed(rows: number): Call[] {
  const calls: Call[] = []
  const get = vi.fn(async (url: string, cfg?: { params?: Record<string, unknown> }) => {
    let path: string
    const params: Record<string, string> = {}
    if (/^https?:\/\//.test(url)) {
      const u = new URL(url)
      if (!u.href.startsWith(BASE)) throw new Error(`unexpected GET ${url}`)
      path = u.pathname.slice(new URL(BASE).pathname.length)
      u.searchParams.forEach((v, k) => (params[k] = v))
      if (cfg?.params && Object.keys(cfg.params).length > 0)
        throw new Error('next URL must be used as provided')
    } else {
      path = url
      for (const [k, v] of Object.entries(cfg?.params ?? {})) params[k] = String(v)
    }
    calls.push({ path, params })
    const resourceKey = path.replace(/\.json$/, '')
    const size = Math.min(params['limit'] === undefined ? 100 : Number(params['limit']), 100)
    const start = params['after'] === undefined ? 0 : decode(params['after'])
    const end = Math.min(start + size, rows)
    const data = []
    for (let i = start; i < end; i++) data.push(row(i + 1))
    let next = ''
    if (end < rows) {
      const q = new URLSearchParams()
      for (const [k, v] of Object.entries(params)) if (k !== 'after') q.set(k, v)
      q.set('after', encode(end))
      next = `${BASE}${path}?${q.toString()}`
    }
    return { data: { '@attributes': { next, previous: '' }, [resourceKey]: data } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

type ListFn = (a: LightspeedRetailAdapter, p: QueryParams) => Promise<{ id: string }[]>

async function walk(
  list: ListFn,
  limit: number,
  pages: number,
): Promise<{
  ids: string[]
  hasMore: (boolean | undefined)[]
  sizes: number[]
  pageSize: (number | undefined)[]
}> {
  const adapter = new LightspeedRetailAdapter()
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const sizes: number[] = []
  const pageSize: (number | undefined)[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const rows = await list(adapter, params)
    ids.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
    pageSize.push(readUpstreamPage(params)?.pageSize)
  }
  return { ids, hasMore, sizes, pageSize }
}

const plain = (n: number): string => String(n)

// [method, upstream path, list, id of row n, caller filters, upstream filters]
const CASES: [
  string,
  string,
  ListFn,
  (n: number) => string,
  Record<string, string>,
  Record<string, string>,
][] = [
  ['listProducts', 'Item.json', (a, p) => a.listProducts(CREDS, p), plain, {}, {}],
  [
    'listVariants',
    'Item.json',
    (a, p) => a.listVariants(CREDS, p),
    plain,
    { productId: 'm9' },
    { itemMatrixID: 'm9' },
  ],
  ['listCollections', 'Category.json', (a, p) => a.listCollections(CREDS, p), plain, {}, {}],
  ['listLocations', 'Shop.json', (a, p) => a.listLocations(CREDS, p), plain, {}, {}],
  [
    'listInventoryLevels',
    'ItemShop.json',
    (a, p) => a.listInventoryLevels(CREDS, p),
    (n) => `${n}:${n}`,
    { shop_id: 's1' },
    { shopID: 's1' },
  ],
  ['listCustomers', 'Customer.json', (a, p) => a.listCustomers(CREDS, p), plain, {}, {}],
  [
    'listOrders',
    'Sale.json',
    (a, p) => a.listOrders(CREDS, p),
    plain,
    { customer_id: 'c7' },
    { customerID: 'c7' },
  ],
  ['listFulfillments', 'SpecialOrder.json', (a, p) => a.listFulfillments(CREDS, p), plain, {}, {}],
  ['listRefunds', 'Sale.json', (a, p) => a.listRefunds(CREDS, p), plain, {}, { voided: 'true' }],
  ['listTransactions', 'SalePayment.json', (a, p) => a.listTransactions(CREDS, p), plain, {}, {}],
  ['listDiscounts', 'Discount.json', (a, p) => a.listDiscounts(CREDS, p), plain, {}, {}],
]

describe.each(CASES)(
  'Lightspeed Retail %s pages by the V3 after cursor',
  (_name, path, rawList, idOf, callerFilters, filters) => {
    // Filters are assigned, not spread, so the page sink on `p` survives.
    const list: ListFn = (a, p) => rawList(a, Object.assign(p, callerFilters))
    const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => idOf(i + 1))

    it('serves 2L+1 rows over three pages, each once, in order, hasMore exact', async () => {
      const calls = fakeLightspeed(7)
      const r = await walk(list, 3, 3)
      expect(r.ids).toEqual(ids(7))
      expect(r.sizes).toEqual([3, 3, 1])
      expect(r.hasMore).toEqual([true, true, false])
      expect(calls).toHaveLength(3)
      for (const c of calls) {
        expect(c.path).toBe(path)
        expect(c.params).toMatchObject({ limit: '3', ...filters })
      }
    })

    it('ends exactly on a full last page: 2L rows read hasMore [true, false]', async () => {
      fakeLightspeed(6)
      const r = await walk(list, 3, 2)
      expect(r.ids).toEqual(ids(6))
      expect(r.hasMore).toEqual([true, false])
    })

    it('the page-2 request carries the after cursor from page 1', async () => {
      const calls = fakeLightspeed(7)
      await walk(list, 3, 2)
      expect(calls[0]!.params['after']).toBeUndefined()
      expect(calls[1]!.params).toMatchObject({ limit: '3', after: encode(3), ...filters })
    })

    it('a cold page 2 walks the cursor chain rather than repeating page 1', async () => {
      fakeLightspeed(7)
      const params = withPageSink({ page: 2, limit: 3 })
      const rows = await list(new LightspeedRetailAdapter(), params)
      expect(rows.map((r) => r.id)).toEqual(ids(7).slice(3, 6))
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })

    it('clamps a limit above 100 and still serves every row', async () => {
      const calls = fakeLightspeed(150)
      const r = await walk(list, 250, 3)
      expect(r.ids).toEqual(ids(150))
      expect(r.sizes).toEqual([100, 50, 0])
      expect(r.hasMore).toEqual([true, false, false])
      expect(r.pageSize.slice(0, 2)).toEqual([100, 100])
      expect(calls.map((c) => c.params['limit'])).toEqual(['100', '100'])
    })

    it('reports meta.hasMore through parseListQuery and listPage', async () => {
      fakeLightspeed(7)
      const adapter = new LightspeedRetailAdapter()
      const p2 = parseListQuery({ limit: '3', page: '2' })
      const env2 = listPage(await list(adapter, p2), p2, 'lightspeed-retail')
      expect(env2.data.map((r) => r.id)).toEqual(ids(7).slice(3, 6))
      expect(env2.meta.hasMore).toBe(true)
      const p3 = parseListQuery({ limit: '3', page: '3' })
      const env3 = listPage(await list(adapter, p3), p3, 'lightspeed-retail')
      expect(env3.data.map((r) => r.id)).toEqual(ids(7).slice(6))
      expect(env3.meta.hasMore).toBe(false)
    })
  },
)

describe('Lightspeed Retail pager keys', () => {
  it('a different filter starts its own walk', async () => {
    const calls = fakeLightspeed(7)
    const adapter = new LightspeedRetailAdapter()
    await adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 3, customer_id: 'a' }))
    await adapter.listOrders(CREDS, withPageSink({ page: 2, limit: 3, customer_id: 'b' }))
    // Page 2 under filter b has no remembered cursor, so it walks from page 1.
    expect(calls.map((c) => [c.params['customerID'], c.params['after']])).toEqual([
      ['a', undefined],
      ['b', undefined],
      ['b', encode(3)],
    ])
  })

  it('a second connection on the same account walks its own cursors', async () => {
    const calls = fakeLightspeed(7)
    const other = { ...CREDS, accessToken: 'tok2', refreshToken: 'rt2' }
    await new LightspeedRetailAdapter().listProducts(CREDS, withPageSink({ page: 1, limit: 3 }))
    await new LightspeedRetailAdapter().listProducts(other, withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((c) => c.params['after'])).toEqual([undefined, undefined, encode(3)])
  })

  it('a different endpoint never follows another endpoint cursor', async () => {
    const calls = fakeLightspeed(7)
    const adapter = new LightspeedRetailAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 3 }))
    await adapter.listCollections(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((c) => [c.path, c.params['after']])).toEqual([
      ['Item.json', undefined],
      ['Category.json', undefined],
      ['Category.json', encode(3)],
    ])
  })

  it('a different limit re-walks rather than reuse a cursor sized for another limit', async () => {
    const calls = fakeLightspeed(120)
    const adapter = new LightspeedRetailAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 3 }))
    const rows = await adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 50 }))
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 50 }, (_, i) => String(i + 51)))
    expect(calls.map((c) => [c.params['limit'], c.params['after']])).toEqual([
      ['3', undefined],
      ['50', undefined],
      ['50', encode(50)],
    ])
  })

  it('refunds never follow an orders cursor on the same Sale endpoint', async () => {
    const calls = fakeLightspeed(7)
    const adapter = new LightspeedRetailAdapter()
    await adapter.listOrders(CREDS, withPageSink({ page: 1, limit: 3 }))
    await adapter.listRefunds(CREDS, withPageSink({ page: 2, limit: 3 }))
    expect(calls.map((c) => [c.params['voided'], c.params['after']])).toEqual([
      [undefined, undefined],
      ['true', undefined],
      ['true', encode(3)],
    ])
  })

  it('declares the documented maximum of 100', () => {
    expect(new LightspeedRetailAdapter().capabilities?.maxPageSize).toBe(100)
  })

  it('refuses a next URL on another host rather than send the token there', async () => {
    const get = vi.fn(async (url: string) =>
      /^https?:/.test(url)
        ? { data: { '@attributes': { next: '' }, Item: [] } }
        : {
            data: {
              '@attributes': { next: 'https://evil.example/API/V3/Account/acc1/Item.json?after=x' },
              Item: [row(1)],
            },
          },
    )
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new LightspeedRetailAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 1 }))
    await expect(adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 1 }))).rejects.toThrow(
      /next/i,
    )
    expect(get).toHaveBeenCalledTimes(1)
  })

  it.each([
    [
      'a lookalike host',
      'https://api.lightspeedapp.com.evil.example/API/V3/Account/acc1/Item.json',
    ],
    ['a plain-http downgrade', 'http://api.lightspeedapp.com/API/V3/Account/acc1/Item.json'],
    ['another port', 'https://api.lightspeedapp.com:8443/API/V3/Account/acc1/Item.json'],
  ])('refuses a next URL on %s', async (_what, foreign) => {
    const get = vi.fn(async (url: string) =>
      /^https?:/.test(url)
        ? { data: { '@attributes': { next: '' }, Item: [] } }
        : { data: { '@attributes': { next: `${foreign}?after=x` }, Item: [row(1)] } },
    )
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new LightspeedRetailAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 1 }))
    await expect(adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 1 }))).rejects.toThrow(
      /next/i,
    )
    expect(get).toHaveBeenCalledTimes(1)
  })
})

describe('Lightspeed Retail over a real axios instance', () => {
  // The fake above replaces axios.create. This one keeps the real instance
  // (baseURL .../Account/{id}/) and swaps only the transport, so it pins that
  // an absolute @attributes.next is requested as given, not joined onto the
  // baseURL, and that no query is re-sent with it.
  const saved = axios.defaults.adapter
  afterEach(() => {
    axios.defaults.adapter = saved
  })

  it('requests the next URL exactly as provided', async () => {
    const next = `${BASE}Item.json?limit=2&after=${encode(2)}`
    const urls: string[] = []
    axios.defaults.adapter = async (config) => {
      const url = axios.getUri(config)
      urls.push(url)
      const isFirst = !url.includes('after=')
      return {
        data: {
          '@attributes': { next: isFirst ? next : '' },
          Item: isFirst ? [row(1), row(2)] : [row(3)],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }
    const adapter = new LightspeedRetailAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 2 }))
    const p2 = withPageSink({ page: 2, limit: 2 })
    const rows = await adapter.listProducts(CREDS, p2)
    expect(rows.map((r) => r.id)).toEqual(['3'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
    expect(urls).toEqual([`${BASE}Item.json?limit=2`, next])
  })
})
