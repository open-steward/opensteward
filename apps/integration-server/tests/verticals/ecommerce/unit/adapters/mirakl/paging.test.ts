/**
 * Paging for Mirakl's list methods.
 *
 * Mirakl's seller API has two paging styles, both documented on
 * https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3:
 *
 * - Offset (OR11 /api/orders, OF21 /api/offers, PR01 /api/promotions):
 *   "max: The max parameter is used to indicate the maximum number of items
 *   returned per page. ... The default value of this parameter is 10. The
 *   maximum value of this parameter is 100." and "offset: The offset parameter
 *   is used to indicate the index of the first item (among all the results) in
 *   the returned page." The response carries `total_count` (required).
 * - Seek (ST11 /api/shipments): "Use the optional limit query parameter to
 *   indicate the maximum number of items returned per page. The default value
 *   is 10. The maximum value is 100. If there are more results to return, the
 *   response contains a next_page_token field. Pass this value in the
 *   page_token query parameter to return the next page of results." ST11
 *   returns its rows under `data`.
 *
 * Every method used to send `limit` with no position, so the offset endpoints
 * ignored it and every page was the first 10 rows, and the seek endpoint never
 * carried `next_page_token` between caller pages. The fake upstream here
 * honours only the documented parameters.
 *
 * listRefunds (RT11 /api/returns, seek-paginated) is covered in refunds.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { MiraklAdapter } from '../../../../../../src/verticals/ecommerce/adapters/mirakl'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'

const CREDS: Credentials = {
  accessToken: 'seller-key',
  extra: { baseUrl: 'https://op.mirakl.net' },
}

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

const MAX = 100

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(i + 1))
}

type OffsetPath = '/api/orders' | '/api/offers' | '/api/promotions'

function rowFor(path: string, id: string): Record<string, unknown> {
  switch (path) {
    case '/api/orders':
      return { order_id: id, order_state: 'SHIPPING', currency_iso_code: 'EUR' }
    case '/api/offers':
      return { offer_id: id, shop_sku: `sku-${id}`, product_title: `Offer ${id}`, quantity: 1 }
    case '/api/promotions':
      return { internal_id: id, state: 'ACTIVE', type: 'REDUCED_PRICE' }
    case '/api/shipments':
      return { id, order_id: `o-${id}`, status: 'SHIPPED' }
    default:
      throw new Error(`unexpected path ${path}`)
  }
}

const OFFSET_KEY: Record<OffsetPath, string> = {
  '/api/orders': 'orders',
  '/api/offers': 'offers',
  '/api/promotions': 'promotions',
}

/**
 * A Mirakl operator instance. Offset endpoints read only `max` and `offset`;
 * ST11 reads only `limit` and `page_token`, and with `page_token` present
 * ignores every other parameter, as documented.
 */
function fakeMirakl(rowsByPath: Partial<Record<string, number>>): Call[] {
  const calls: Call[] = []
  const tokens = new Map<string, { offset: number; limit: number }>()
  let minted = 0
  const respond = (path: string, params: Record<string, unknown> | undefined) => {
    calls.push({ path, params })
    const n = rowsByPath[path]
    if (n === undefined) throw new Error(`unexpected path ${path}`)
    const rows = ids(n).map((id) => rowFor(path, id))
    if (path === '/api/shipments') {
      let offset = 0
      let limit = Math.min(Number(params?.['limit'] ?? 10), MAX)
      const token = params?.['page_token']
      if (token !== undefined) {
        const pos = tokens.get(String(token))
        if (!pos) throw new Error(`unknown page_token ${String(token)}`)
        offset = pos.offset
        limit = pos.limit
      }
      if (!Number.isInteger(limit) || limit < 1) throw new Error(`bad limit ${limit}`)
      const data = rows.slice(offset, offset + limit)
      const body: Record<string, unknown> = { data }
      if (offset + limit < n) {
        const t = `tok-${++minted}`
        tokens.set(t, { offset: offset + limit, limit })
        body['next_page_token'] = t
      }
      return { data: body }
    }
    const max = Math.min(Number(params?.['max'] ?? 10), MAX)
    const offset = Number(params?.['offset'] ?? 0)
    if (!Number.isInteger(max) || max < 1) throw new Error(`bad max ${max}`)
    if (!Number.isInteger(offset) || offset < 0) throw new Error(`bad offset ${offset}`)
    return {
      data: {
        [OFFSET_KEY[path as OffsetPath]]: rows.slice(offset, offset + max),
        total_count: n,
      },
    }
  }
  vi.spyOn(axios, 'create').mockImplementation((() => ({
    get: vi.fn(async (path: string, c?: { params?: Record<string, unknown> }) =>
      respond(path, c?.params),
    ),
  })) as never)
  return calls
}

type ListMethod = 'listOrders' | 'listProducts' | 'listInventoryLevels' | 'listDiscounts'
type AnyList = ListMethod | 'listFulfillments'

/** Inventory ids are `<offer>:default`; compare by the offer id. */
function idOf(method: AnyList, row: { id?: string }): string | undefined {
  return method === 'listInventoryLevels' ? row.id?.replace(/:default$/, '') : row.id
}

async function call(
  method: AnyList,
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<Array<{ id?: string }>> {
  const adapter = new MiraklAdapter()
  const rows = (await adapter[method](creds, params)) as Array<{ id?: string }>
  return rows.map((r) => ({ ...r, id: idOf(method, r) }))
}

function parse(query: Record<string, string>): QueryParams {
  const routed: EcommerceAdapter = new MiraklAdapter()
  return parseListQuery(query, routed)
}

async function drive(method: AnyList, limit: number, pages: number) {
  const seen: Array<string | undefined> = []
  const hasMore: Array<boolean | undefined> = []
  const pageSize: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await call(method, params)
    seen.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    pageSize.push(readUpstreamPage(params)?.pageSize)
  }
  return { seen, hasMore, pageSize }
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

const OFFSET_CASES: Array<{ method: ListMethod; path: OffsetPath }> = [
  { method: 'listOrders', path: '/api/orders' },
  { method: 'listProducts', path: '/api/offers' },
  { method: 'listInventoryLevels', path: '/api/offers' },
  { method: 'listDiscounts', path: '/api/promotions' },
]

for (const c of OFFSET_CASES) {
  describe(`MiraklAdapter.${c.method} pages ${c.path} by max/offset`, () => {
    it('serves 2L + 1 rows once each over three pages with an exact hasMore', async () => {
      const L = 3
      const calls = fakeMirakl({ [c.path]: 2 * L + 1 })
      const { seen, hasMore } = await drive(c.method, L, 3)
      expect(seen).toEqual(ids(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
      expect(calls.map((x) => x.path)).toEqual([c.path, c.path, c.path])
      // Page 2 carries the documented `offset`, sized by the documented `max`.
      expect(calls[1]!.params).toMatchObject({ max: L, offset: L })
      expect(calls[2]!.params).toMatchObject({ max: L, offset: 2 * L })
      for (const x of calls) expect(x.params).not.toHaveProperty('limit')
    })

    it('ends exactly on a collection that is a multiple of the page size', async () => {
      const L = 3
      fakeMirakl({ [c.path]: 2 * L })
      const { seen, hasMore } = await drive(c.method, L, 2)
      expect(seen).toEqual(ids(2 * L))
      expect(hasMore).toEqual([true, false])
    })

    it(`clamps a limit above ${MAX} and still serves every row`, async () => {
      const n = 2 * MAX + 1
      const calls = fakeMirakl({ [c.path]: n })
      const { seen, hasMore, pageSize } = await drive(c.method, 250, 3)
      expect(seen).toEqual(ids(n))
      expect(hasMore).toEqual([true, true, false])
      expect(pageSize).toEqual([MAX, MAX, MAX])
      for (const x of calls) expect(x.params?.['max']).toBe(MAX)
      expect(calls.map((x) => x.params?.['offset'])).toEqual([0, MAX, 2 * MAX])
    })

    it('reports meta.hasMore on the API path', async () => {
      fakeMirakl({ [c.path]: 5 })
      const metas = []
      for (const page of ['1', '2', '3']) {
        const params = parse({ limit: '2', page })
        const env = listPage(await call(c.method, params), params, 'mirakl')
        metas.push({ ids: env.data.map((r) => r.id), hasMore: env.meta.hasMore })
      }
      expect(metas).toEqual([
        { ids: ['1', '2'], hasMore: true },
        { ids: ['3', '4'], hasMore: true },
        { ids: ['5'], hasMore: false },
      ])
    })
  })
}

describe('MiraklAdapter.listFulfillments pages /api/shipments by page_token', () => {
  const path = '/api/shipments'

  it('serves 2L + 1 rows once each over three pages with an exact hasMore', async () => {
    const L = 3
    const calls = fakeMirakl({ [path]: 2 * L + 1 })
    const { seen, hasMore } = await drive('listFulfillments', L, 3)
    expect(seen).toEqual(ids(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls).toHaveLength(3)
    expect(calls[0]!.params).toMatchObject({ limit: L })
    expect(calls[0]!.params).not.toHaveProperty('page_token')
    // Page 2 carries the documented `page_token` from page 1's next_page_token.
    expect(calls[1]!.params).toMatchObject({ page_token: 'tok-1' })
    expect(calls[2]!.params).toMatchObject({ page_token: 'tok-2' })
  })

  it('ends exactly on a collection that is a multiple of the page size', async () => {
    const L = 3
    fakeMirakl({ [path]: 2 * L })
    const { seen, hasMore } = await drive('listFulfillments', L, 2)
    expect(seen).toEqual(ids(2 * L))
    expect(hasMore).toEqual([true, false])
  })

  it(`clamps a limit above ${MAX} and still serves every row`, async () => {
    const n = 2 * MAX + 1
    const calls = fakeMirakl({ [path]: n })
    const { seen, hasMore, pageSize } = await drive('listFulfillments', 250, 3)
    expect(seen).toEqual(ids(n))
    expect(hasMore).toEqual([true, true, false])
    expect(pageSize).toEqual([MAX, MAX, MAX])
    expect(calls[0]!.params?.['limit']).toBe(MAX)
  })

  it('walks the token chain for a page asked for out of order', async () => {
    const calls = fakeMirakl({ [path]: 7 })
    const params = withPageSink({ page: 3, limit: 3 })
    const rows = await call('listFulfillments', params)
    expect(rows.map((r) => r.id)).toEqual(['7'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(calls).toHaveLength(3)
  })

  it('reports meta.hasMore on the API path', async () => {
    fakeMirakl({ [path]: 5 })
    const metas = []
    for (const page of ['1', '2', '3']) {
      const params = parse({ limit: '2', page })
      const env = listPage(await call('listFulfillments', params), params, 'mirakl')
      metas.push({ ids: env.data.map((r) => r.id), hasMore: env.meta.hasMore })
    }
    expect(metas).toEqual([
      { ids: ['1', '2'], hasMore: true },
      { ids: ['3', '4'], hasMore: true },
      { ids: ['5'], hasMore: false },
    ])
  })
})

describe('MiraklAdapter paging keeps its filters', () => {
  it('listOrders forwards start_update_date alongside the page', async () => {
    const calls = fakeMirakl({ '/api/orders': 5 })
    const updatedAfter = new Date('2026-01-01T00:00:00.000Z')
    await call('listOrders', withPageSink({ page: 3, limit: 2, updatedAfter }))
    expect(calls[0]!.params).toEqual({
      max: 2,
      offset: 4,
      start_update_date: '2026-01-01T00:00:00.000Z',
    })
  })

  it("sends the adapter's default size of 20 when no limit is given", async () => {
    const calls = fakeMirakl({ '/api/orders': 50 })
    const rows = await call('listOrders', withPageSink({ page: 2 }))
    expect(calls[0]!.params).toEqual({ max: 20, offset: 20 })
    expect(rows.map((r) => r.id)).toEqual(ids(40).slice(20))
  })
})

describe('MiraklAdapter offset pages report the collection size', () => {
  for (const c of OFFSET_CASES) {
    it(`${c.method} reports total_count as totalCount`, async () => {
      fakeMirakl({ [c.path]: 7 })
      const params = withPageSink({ page: 2, limit: 3 })
      await call(c.method, params)
      expect(readUpstreamPage(params)?.totalCount).toBe(7)
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })
  }
})

describe('MiraklAdapter updatedAfter reaches the first request of every list', () => {
  // The parameter name is what the adapter sent before the paging change; its
  // documentation is questioned separately. This pins only that paging does
  // not drop the filter.
  const updatedAfter = new Date('2026-01-01T00:00:00.000Z')
  const cases: Array<{ method: AnyList; path: string }> = [
    { method: 'listProducts', path: '/api/offers' },
    { method: 'listInventoryLevels', path: '/api/offers' },
    { method: 'listDiscounts', path: '/api/promotions' },
    { method: 'listFulfillments', path: '/api/shipments' },
  ]
  for (const c of cases) {
    it(`${c.method} forwards it`, async () => {
      const calls = fakeMirakl({ [c.path]: 5 })
      await call(c.method, withPageSink({ page: 1, limit: 2, updatedAfter }))
      expect(calls[0]!.params).toMatchObject({
        'last_updated_date_range[start]': '2026-01-01T00:00:00.000Z',
      })
    })
  }
})

describe('MiraklAdapter.listFulfillments keeps a cursor per connection, filter and size', () => {
  const path = '/api/shipments'

  /** Page 1 under `first`, then page 2 under `second`; returns page 2's calls. */
  async function page2After(
    first: { params: QueryParams; creds?: Credentials },
    second: { params: QueryParams; creds?: Credentials },
  ): Promise<Call[]> {
    const calls = fakeMirakl({ [path]: 9 })
    await call('listFulfillments', first.params, first.creds)
    const before = calls.length
    await call('listFulfillments', second.params, second.creds)
    return calls.slice(before)
  }

  it('reuses the token for the same connection, filter and size', async () => {
    const got = await page2After(
      { params: withPageSink({ page: 1, limit: 3 }) },
      { params: withPageSink({ page: 2, limit: 3 }) },
    )
    expect(got).toHaveLength(1)
    expect(got[0]!.params).toEqual({ page_token: 'tok-1' })
  })

  it('does not replay one connection’s token for another on the same instance', async () => {
    const got = await page2After(
      { params: withPageSink({ page: 1, limit: 3 }) },
      {
        params: withPageSink({ page: 2, limit: 3 }),
        creds: { ...CREDS, accessToken: 'other-seller-key' },
      },
    )
    expect(got).toHaveLength(2)
    expect(got[0]!.params).not.toHaveProperty('page_token')
  })

  it('does not replay a token across operator instances', async () => {
    const got = await page2After(
      { params: withPageSink({ page: 1, limit: 3 }) },
      {
        params: withPageSink({ page: 2, limit: 3 }),
        creds: { ...CREDS, extra: { baseUrl: 'https://other.mirakl.net' } },
      },
    )
    expect(got).toHaveLength(2)
    expect(got[0]!.params).not.toHaveProperty('page_token')
  })

  it('does not replay a token across filters', async () => {
    const got = await page2After(
      {
        params: withPageSink({
          page: 1,
          limit: 3,
          updatedAfter: new Date('2026-01-01T00:00:00.000Z'),
        }),
      },
      {
        params: withPageSink({
          page: 2,
          limit: 3,
          updatedAfter: new Date('2026-02-01T00:00:00.000Z'),
        }),
      },
    )
    expect(got).toHaveLength(2)
    expect(got[0]!.params).toMatchObject({
      limit: 3,
      'last_updated_date_range[start]': '2026-02-01T00:00:00.000Z',
    })
    expect(got[0]!.params).not.toHaveProperty('page_token')
  })

  it('does not replay a token across page sizes', async () => {
    const got = await page2After(
      { params: withPageSink({ page: 1, limit: 3 }) },
      { params: withPageSink({ page: 2, limit: 2 }) },
    )
    expect(got).toHaveLength(2)
    expect(got[0]!.params).toEqual({ limit: 2 })
  })
})

describe('MiraklAdapter.listFulfillments end of collection', () => {
  it('treats an empty next_page_token as the last page', async () => {
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async () => ({
        data: { data: [rowFor('/api/shipments', '1')], next_page_token: '' },
      })),
    })) as never)
    const params = withPageSink({ page: 1, limit: 3 })
    const rows = await call('listFulfillments', params)
    expect(rows.map((r) => r.id)).toEqual(['1'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
